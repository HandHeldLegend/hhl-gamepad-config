/**
 * hoja-device.js: WebUSB protocol driver for HOJA-firmware controllers.
 *
 * This is a faithful port of hoja2's js/gamepad.js. The wire protocol is unchanged; what changed:
 *   - memory blocks come from the firmware layout (struct.js) instead of per-struct parser files;
 *   - it is an EventTarget (events listed below) instead of single-callback hooks;
 *   - request/response operations are serialized so two views can't clobber each other's reads;
 *   - the USB disconnect listener is registered once and only reacts to *our* device.
 *
 * Wire protocol summary (endpoint 2, interface 1, 64-byte reports; first byte = report id):
 *   0x01 READ_CONFIG_BLOCK   out: [1, block]                in: [1, block, chunkSize, idx|0xFF, data...]
 *   0x02 WRITE_CONFIG_BLOCK  out: [2, block, size, idx, data...] then [2, block, 0, 0xFF]
 *   0x03 READ_STATIC_BLOCK   out: [3, block]                in: same shape as 0x01
 *   0x04 CONFIG_COMMAND      out: [4, block, cmd]           in: [4, block, cmd, ok, data...]
 *   0x05 INPUT MODE/FOCUS    out: [5, 0, 254|255] (joystick|hover stream), [5, 1, inputCode]
 *   0xFE / 0xFF              in: live input reports (joystick / raw hover)
 *   0xFA                     in: analog (snapback) dump
 *   0xAF                     in/out: legacy firmware version probe
 *   0xD0 DONGLE_INFO         out: [0xD0]                    in: WLAN dongle status (see decodeDongleInfo)
 *   0xD1 DONGLE_BOOTLOADER   out: [0xD1]                    the dongle reboots into BOOTSEL (no reply)
 *
 * WLAN dongle: a USB receiver a wireless controller joins over WLAN. With a controller it takes the
 * controller's USB identity and passes this protocol through, so everything works unchanged; only
 * the dongle itself answers 0xD0/0xD1 (which is how we tell). Without a controller it is a generic
 * "HOJA Dongle" (2e8a:10c6) that answers nothing else, so it connects as dongle-only.
 *
 * HHL Gamepad WLAN: a PC app that has the controller open over the home network. connectLan() opens it
 * through a LanTransport (lan-transport.js), which stands in for the USBDevice: same packets, no cable.
 *
 * Events (all CustomEvent; read `event.detail`):
 *   'opening'     { name }                           a device was chosen and is being opened (USB product name)
 *   'progress'    { done, total }                    settings blocks read so far while connecting
 *   'connect'     { device: this }                   blocks + statics loaded
 *   'disconnect'  { dongle, requested }              dongle: its status if it was a WLAN dongle; requested:
 *                                                     disconnect() was called (not an unplug or re-enumeration)
 *   'input'       DataView                            live input report (0xFE/0xFF)
 *   'snapback'    DataView                            analog dump (0xFA)
 *   'legacy'      { deviceId, url }                   pre-HOJA2 firmware detected
 *   'dongle'      { dongle }                          a WLAN dongle with no controller connected to it
 *   'bootloader'  {}                                  user picked a bare RP2040/RP2350 bootloader
 *   'esp32-update' {}                                 user picked the CH340 of a controller in wireless-module
 *                                                     update mode (only that chip is on USB then)
 */
import { LAYOUT, createStruct, decodeText } from './struct.js';
import { legacyFirmwareUrl } from './legacy.js';
import { LanTransport } from './lan-transport.js';

/** USB filters offered in the browser's device picker. */
export const USB_FILTERS = [
  { vendorId: 0x057e, productId: 0x2009 }, // Switch Pro Controller mode
  { vendorId: 0x2e8a, productId: 0x10c6 }, // HOJA Gamepad (generic)
  { vendorId: 0x2e8a, productId: 0x10dd }, // GC Ultimate
  { vendorId: 0x2e8a, productId: 0x10df }, // ProGCC
  { vendorId: 0x2e8a, productId: 0x0003 }, // RP2040 bootloader
  { vendorId: 0x2e8a, productId: 0x000f }, // RP2350 bootloader
  { vendorId: 0x1a86, productId: 0x7522 }, // CH340: controller in wireless-module (ESP32) update mode
];

/** The CH340 USB-serial chip a controller exposes in wireless-module (ESP32) update mode. */
export function isCh340(device) {
  return device?.vendorId === 0x1a86 && device?.productId === 0x7522;
}

export function isPicoBootloader(device) {
  return device?.vendorId === 0x2e8a && (device?.productId === 0x0003 || device?.productId === 0x000f);
}

/**
 * Config blocks only newer firmware has. Older firmware doesn't answer them, which is expected: they
 * get a short read timeout and no "missing settings" warning (they still go in `missing`).
 */
export const OPTIONAL_BLOCKS = new Set(['wlan']);
const OPTIONAL_TIMEOUT_MS = 500;

const EP = 2;
const ITF = 1;
const CHUNK_MAX = 32;
/** Time limit for one USB step (open, claim, a single OUT transfer). */
const STEP_TIMEOUT_MS = 5000;
/** Reject when `promise` hasn't settled within `ms` (the USB call itself is cancelled by closing the device). */
function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); })])
    .finally(() => clearTimeout(timer));
}
const IN_FLIGHT = 2; // concurrent IN transfers (see #pollLoop)
/**
 * Stream watchdog. If the firmware can't deliver a stream report in time it drops out of WebUSB
 * streaming (webusb.c _webusb_mark_unready) until the next command arrives. When no report has
 * arrived for STREAM_STALL_MS we re-send the current input mode, which re-arms it.
 */
const STREAM_STALL_MS = 600;

const REPORT = {
  READ_CONFIG: 1,
  WRITE_CONFIG: 2,
  READ_STATIC: 3,
  COMMAND: 4,
  INPUT_MODE: 5,
  SNAPBACK_DUMP: 250,
  INPUT_JOYSTICKS: 254,
  INPUT_RAW: 255,
  LEGACY_FW: 0xaf,
  LEGACY_FW_SET: 0x0f,
  DONGLE_INFO: 0xd0,
  DONGLE_BOOTLOADER: 0xd1,
};

/**
 * Decode the WLAN dongle's 0xD0 reply (64 bytes):
 *   [1] protocol version   [2] board: 0 unknown, 1 HOJA, 2 Pico W, 3 Pico 2 W   [3] 1 = controller connected
 *   [4..7] dongle firmware version (u32 LE build stamp)   [8..9] PIN (u16 LE)
 *   [10] detected host: 0 unknown, 1 PC, 2 Switch, 3 N64, 4 GameCube
 *   [11] mode the dongle presents, [12] the controller's mode (0xFF without one):
 *        0 Switch, 1 SInput, 2 XInput, 3 Slippi, 4 SNES, 5 N64, 6 GameCube, 15 unknown
 *   [13] controller flags (bit0: mode chosen at power-up instead of following the dongle)
 *   [14..17] controller firmware version (u32 LE)   [18..21] controller USB VID, PID (u16 LE)
 *   [22..53] controller name, NUL-terminated
 */
export function decodeDongleInfo(v) {
  if (v.byteLength < 22) return null;
  const connected = v.getUint8(3) === 1;
  return {
    protocol: v.getUint8(1),
    board: v.getUint8(2),
    fwVersion: v.getUint32(4, true),
    pin: v.getUint16(8, true),
    host: v.getUint8(10),
    hostMode: v.getUint8(11),
    gamepad: connected ? {
      mode: v.getUint8(12),
      modeAtPowerUp: !!(v.getUint8(13) & 1),
      fwVersion: v.getUint32(14, true),
      vendorId: v.getUint16(18, true),
      productId: v.getUint16(20, true),
      name: v.byteLength > 22 ? decodeText(new Uint8Array(v.buffer, v.byteOffset + 22, Math.min(32, v.byteLength - 22))) : '',
    } : null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `predicate` every 20ms until true or timeout (ms). Resolves true/false. */
async function waitFor(predicate, timeout) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start >= timeout) return false;
    await sleep(20);
  }
  return true;
}

export class HojaDevice extends EventTarget {
  /** @type {USBDevice|null} */
  #usb = null;
  #opening = null;
  #connected = false;
  #queue = Promise.resolve();
  #lastReportAt = 0;   // performance.now() of the last IN report of any kind
  #inputJoysticks = false; // last stream chosen with setInputMode (re-sent by the watchdog)
  #watchdog = 0;
  #rearmAt = 0;
  #streaming = false;      // setInputMode() was called: the watchdog only re-arms a stream we asked for
  #usbListenerInstalled = false;

  // Pending read/command state, filled in by the report parser.
  #read = { kind: null, block: -1, done: false };
  #cmd = { block: -1, command: -1, done: false, ok: false, data: null };
  #legacy = { done: false, isLegacy: false };
  #dongleReply = null;

  /** WLAN dongle status (decodeDongleInfo) when connected through one, else null. */
  dongle = null;

  /** Config blocks keyed by name ('gamepad', 'analog', ...). Writable; push with sendBlock(). */
  config = {};
  /** Static (read-only) info blocks keyed by name ('device', 'battery', ...). */
  static = {};
  /**
   * Blocks the controller didn't answer while connecting, e.g. {config: ['rgb'], static: []}.
   * Older or board-specific firmware may not serve every block; like hoja2 we connect anyway, but a
   * config block that was never read is never written back (it would overwrite real settings with
   * blanks). See sendBlock().
   */
  missing = { config: [], static: [] };

  constructor() {
    super();
    this.#configTable = LAYOUT.blocks.config;
    this.#staticTable = LAYOUT.blocks.static;
    this.#resetMemory();
  }

  #configTable;
  #staticTable;

  #resetMemory() {
    for (const b of this.#configTable) this.config[b.key] = createStruct(b.struct);
    for (const b of this.#staticTable) this.static[b.key] = createStruct(b.struct);
    this.missing = { config: [], static: [] };
  }

  get isConnected() { return this.#connected; }
  get usbDevice() { return this.#usb; }
  /** The pad ({ id, name, title, mode }) when connected over WLAN through HHL Gamepad WLAN, else null. */
  get lan() { return this.#usb instanceof LanTransport ? this.#usb.pad : null; }

  /** Block index for a config block name, e.g. blockIndex('analog') === 2. */
  blockIndex(key) {
    const b = this.#configTable.find((x) => x.key === key);
    if (!b) throw new Error(`Unknown config block "${key}"`);
    return b.index;
  }

  /** Command id from the firmware enums, e.g. commandId('analog', 'CALIBRATE_START'). */
  commandId(blockKey, name) {
    const id = LAYOUT.commands[blockKey]?.[name];
    if (id == null) throw new Error(`Unknown command ${blockKey}.${name}`);
    return id;
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Run `fn` exclusively (one request/response exchange at a time). */
  #exclusive(fn) {
    const run = this.#queue.then(fn, fn);
    this.#queue = run.catch(() => {});
    return run;
  }

  // ---------------------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------------------

  /**
   * Show the browser device picker and connect. Resolves:
   *   true            connected (or legacy device detected; see 'legacy' event)
   *   'bootloader'    user chose a bare bootloader ('bootloader' event fired)
   *   'dongle'        a WLAN dongle with no controller ('dongle' event fired; the device stays open)
   *   false           canceled / failed
   */
  async connect() {
    if (!navigator.usb) throw new Error('WebUSB is not available in this browser.');
    let usb;
    try {
      usb = await navigator.usb.requestDevice({ filters: USB_FILTERS });
    } catch (err) {
      if (err?.name === 'NotFoundError') return false; // user canceled
      throw err;
    }
    return this.open(usb);
  }

  /** Connect to a gamepad HHL Gamepad WLAN has open on this PC (a pad from listLanPads()). Resolves like open(). */
  connectLan(pad) {
    return this.open(new LanTransport(pad));
  }

  /**
   * Open an already-authorized USBDevice (e.g. from navigator.usb.getDevices()). Callers that ask
   * while an open is still running share it: parallel opens of one device fail each other.
   */
  open(usb) {
    if (this.#opening) return this.#opening;
    this.#opening = this.#open(usb).finally(() => { this.#opening = null; });
    return this.#opening;
  }

  async #open(usb) {
    if (isPicoBootloader(usb)) {
      this.#emit('bootloader', { usb });
      return 'bootloader';
    }
    // Wireless-module update mode: don't open it here; the module updater's flasher does.
    if (isCh340(usb)) {
      this.#emit('esp32-update', { usb });
      return 'esp32-update';
    }

    this.#emit('opening', { name: usb.productName || '' });
    try {
      // Right after a firmware update the OS may still be setting the device up; these can then wait
      // forever instead of failing, so each gets a time limit (the caller retries).
      await withTimeout(usb.open(), STEP_TIMEOUT_MS, 'Opening the controller');
      await withTimeout(usb.selectConfiguration(1), STEP_TIMEOUT_MS, 'Selecting the USB configuration');
      await withTimeout(usb.claimInterface(ITF), STEP_TIMEOUT_MS, 'Claiming the controller');
    } catch (err) {
      console.error('[device] open failed', err);
      try { await usb.close(); } catch { /* ignore */ }
      throw err;
    }

    this.#usb = usb;
    this.#connected = true;
    this.#streaming = false;
    this.#resetMemory();
    this.dongle = null;
    this.#installDisconnectListener(usb);
    this.#lastReportAt = performance.now();
    this.#pollLoop();
    this.#startWatchdog();

    try {
      if (await this.#probeLegacy()) return true; // 'legacy' event already emitted
      this.dongle = await this.#probeDongle();
      // A dongle on its own has no settings to read: stay open so it can be asked again or updated.
      if (this.dongle && !this.dongle.gamepad) {
        this.#emit('dongle', { dongle: this.dongle });
        return 'dongle';
      }
      // Over WLAN this takes a few seconds: report each block so the app can show how far it got.
      const total = this.#configTable.length + this.#staticTable.length;
      let done = 0;
      const step = () => this.#emit('progress', { done: ++done, total });
      await this.#exclusive(() => this.#readAll('config', this.#configTable, step));
      await this.#exclusive(() => this.#readAll('static', this.#staticTable, step));
    } catch (err) {
      // Let go completely (read loops, interface, device), so the next attempt starts clean. A
      // controller that is still starting up, or changing USB mode, doesn't answer at first.
      clearInterval(this.#watchdog);
      if (this.#usb === usb) { this.#connected = false; this.#usb = null; }
      try { await usb.close(); } catch { /* already gone */ }
      throw err;
    }
    this.#emit('connect', { device: this });
    return true;
  }

  #startWatchdog() {
    clearInterval(this.#watchdog);
    this.#watchdog = setInterval(() => {
      if (!this.#connected || !this.#usb) { clearInterval(this.#watchdog); return; }
      if (!this.#streaming) return; // nothing requested yet (e.g. still reading blocks while connecting)
      const now = performance.now();
      if (now - this.#lastReportAt < STREAM_STALL_MS || now - this.#rearmAt < STREAM_STALL_MS) return;
      this.#rearmAt = now;
      this.sendReport(REPORT.INPUT_MODE, [0x00, this.#inputJoysticks ? 254 : 255]).catch(() => {});
    }, 250);
  }

  async disconnect() {
    clearInterval(this.#watchdog);
    if (!this.#usb) return true;
    const usb = this.#usb;
    this.#connected = false;
    this.#usb = null;
    try { await usb.close(); } catch (err) { console.warn('[device] close failed', err); }
    this.#emit('disconnect', { dongle: this.dongle, requested: true });
    this.dongle = null;
    return true;
  }

  #installDisconnectListener(usb) {
    // HHL Gamepad WLAN: the socket closing is the unplug.
    if (usb instanceof LanTransport) {
      usb.addEventListener('close', () => this.#onGone(usb), { once: true });
      return;
    }
    if (this.#usbListenerInstalled) return;
    this.#usbListenerInstalled = true;
    navigator.usb.addEventListener('disconnect', (event) => this.#onGone(event.device));
  }

  /** Our device went away without disconnect(): unplugged, re-enumerated, or HHL Gamepad WLAN let go of it. */
  #onGone(usb) {
    if (usb !== this.#usb) return;
    this.#connected = false;
    this.#usb = null;
    this.#emit('disconnect', { dongle: this.dongle, requested: false });
    this.dongle = null;
  }

  // ---------------------------------------------------------------------------------------
  // Raw transport
  // ---------------------------------------------------------------------------------------

  async #out(bytes) {
    if (!this.#connected || !this.#usb) throw new Error('Device not connected');
    return withTimeout(this.#usb.transferOut(EP, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)), STEP_TIMEOUT_MS, 'Sending to the controller');
  }

  /** Send a report: [reportId, ...data]. */
  async sendReport(reportId, data = []) {
    return this.#out(new Uint8Array([reportId, ...data]));
  }

  /**
   * Keep IN_FLIGHT transfers queued on the IN endpoint so a report never waits for the page to
   * re-arm a read (WebUSB completes same-endpoint transfers in order, so reports stay ordered).
   */
  #pollLoop() {
    for (let i = 0; i < IN_FLIGHT; i++) this.#readLoop();
  }

  async #readLoop() {
    let failures = 0;
    while (this.#connected && this.#usb) {
      try {
        const result = await this.#usb.transferIn(EP, 64);
        if (result.status === 'stall') { await this.#usb.clearHalt('in', EP); continue; }
        // Zero-length packets happen on the bulk endpoint; ignore them rather than parse.
        if (result.data && result.data.byteLength > 0) {
          this.#lastReportAt = performance.now();
          this.#parse(result.data);
        }
        failures = 0;
      } catch (err) {
        if (!this.#connected || !this.#usb) return;
        // Transient transfer errors: keep the loop alive (a dead loop silently stops all input).
        if (++failures > 20) { console.warn('[device] poll stopped', err?.message || err); return; }
        await sleep(20);
      }
    }
  }

  #parse(view) {
    if (view.byteLength < 1) return;
    try {
      switch (view.getUint8(0)) {
        case REPORT.READ_CONFIG: return this.#onChunk(view, 'config');
        case REPORT.READ_STATIC: return this.#onChunk(view, 'static');
        case REPORT.WRITE_CONFIG: return; // write acks are not awaited (matches hoja2)
        case REPORT.COMMAND: return this.#onCommand(view);
        case REPORT.INPUT_JOYSTICKS:
        case REPORT.INPUT_RAW: return this.#emit('input', view);
        case REPORT.SNAPBACK_DUMP: return this.#emit('snapback', view);
        case REPORT.LEGACY_FW: return this.#onLegacy(view);
        case REPORT.DONGLE_INFO: return this.#onDongleInfo(view);
        default: return;
      }
    } catch (err) {
      console.warn('[device] bad report', err);
    }
  }

  #onChunk(view, kind) {
    const blockIdx = view.getUint8(1);
    const size = view.getUint8(2);
    const idx = view.getUint8(3);
    const table = kind === 'config' ? this.#configTable : this.#staticTable;
    const entry = table.find((b) => b.index === blockIdx);
    if (!entry) return;
    const target = (kind === 'config' ? this.config : this.static)[entry.key];

    if (size > 0) {
      const chunk = new Uint8Array(view.buffer, view.byteOffset + 4, size);
      const at = idx * CHUNK_MAX;
      // Newer firmware may send a larger block than this app knows about: grow, don't throw.
      if (at + size > target.buffer.length) {
        const grown = new Uint8Array(at + size);
        grown.set(target.buffer);
        target.updateBuffer(grown);
      }
      target.buffer.set(chunk, at);
    }
    if (idx === 0xff && this.#read.kind === kind && this.#read.block === blockIdx) {
      this.#read.done = true;
    }
  }

  #onCommand(view) {
    if (view.byteLength < 4) return;
    const block = view.getUint8(1);
    const command = view.getUint8(2);
    if (block !== this.#cmd.block || command !== this.#cmd.command) return;
    this.#cmd.ok = !!view.getUint8(3);
    this.#cmd.data = view.byteLength > 4 ? new Uint8Array(view.buffer.slice(view.byteOffset + 4, view.byteOffset + view.byteLength)) : null;
    this.#cmd.done = true;
  }

  #onLegacy(view) {
    const deviceId = (view.getUint8(3) << 8) | view.getUint8(4);
    this.#legacy.done = true;
    this.#legacy.isLegacy = true;
    this.#emit('legacy', { deviceId, url: legacyFirmwareUrl(deviceId) });
  }

  async #probeLegacy() {
    this.#legacy = { done: false, isLegacy: false };
    await this.#out([REPORT.LEGACY_FW]);
    await waitFor(() => this.#legacy.done, 150);
    return this.#legacy.isLegacy;
  }

  /** Ask for the WLAN dongle's status. Resolves the decoded reply, or null when nothing answers (no dongle). */
  async #probeDongle(timeout = 150) {
    this.#dongleReply = { done: false, info: null };
    await this.#out([REPORT.DONGLE_INFO]);
    await waitFor(() => this.#dongleReply.done, timeout);
    return this.#dongleReply.info;
  }

  #onDongleInfo(view) {
    if (!this.#dongleReply) return;
    this.#dongleReply.info = decodeDongleInfo(view);
    this.#dongleReply.done = true;
  }

  // ---------------------------------------------------------------------------------------
  // Memory blocks
  // ---------------------------------------------------------------------------------------

  async #readBlock(kind, index, timeout = 5000) {
    this.#read = { kind, block: index, done: false };
    await this.#out([kind === 'config' ? REPORT.READ_CONFIG : REPORT.READ_STATIC, index]);
    if (!(await waitFor(() => this.#read.done, timeout))) {
      throw new Error(`Timed out reading ${kind} block ${index}`);
    }
  }

  /** Re-read one config block from the device. Accepts a name ('analog') or index. */
  requestBlock(block) {
    const index = typeof block === 'string' ? this.blockIndex(block) : block;
    return this.#exclusive(() => this.#readBlock('config', index));
  }

  requestStatic(index) {
    return this.#exclusive(() => this.#readBlock('static', index));
  }

  readAllConfig() {
    return this.#exclusive(() => this.#readAll('config', this.#configTable));
  }

  readAllStatic() {
    return this.#exclusive(() => this.#readAll('static', this.#staticTable));
  }

  /**
   * Read every block of one kind. A block that doesn't answer is recorded in `missing` instead of
   * failing the whole connection (hoja2 behaved the same way). After the first miss the timeout
   * drops, so a firmware without several blocks doesn't stall the connect for long. OPTIONAL_BLOCKS
   * only get a short wait: most controllers run firmware from before them. `onBlock` runs after each.
   */
  async #readAll(kind, table, onBlock) {
    let timeout = 3000;
    for (const b of table) {
      const optional = kind === 'config' && OPTIONAL_BLOCKS.has(b.key);
      try {
        await this.#readBlock(kind, b.index, optional ? Math.min(timeout, OPTIONAL_TIMEOUT_MS) : timeout);
      } catch (err) {
        if (!this.#connected) throw err;
        if (!optional) {
          console.warn(`[device] ${kind} block ${b.index} (${b.key}) didn't answer; continuing without it`);
          timeout = 1000;
        }
        this.missing[kind].push(b.key);
      }
      onBlock?.();
    }
    if (this.missing[kind].length === table.length) {
      throw new Error('The controller didn’t answer any settings requests.');
    }
  }

  /**
   * Push a config block to the device's RAM (takes effect live; persists only after save()).
   * Accepts a name ('haptic') or index.
   */
  sendBlock(block) {
    const index = typeof block === 'string' ? this.blockIndex(block) : block;
    const entry = this.#configTable.find((b) => b.index === index);
    if (this.missing.config.includes(entry.key)) {
      console.warn(`[device] not writing ${entry.key}: it was never read from this controller`);
      return Promise.resolve();
    }
    return this.#exclusive(async () => {
      const buf = this.config[entry.key].buffer;
      for (let idx = 0, pos = 0; pos < buf.length; idx++, pos += CHUNK_MAX) {
        const chunk = buf.subarray(pos, Math.min(pos + CHUNK_MAX, buf.length));
        const out = new Uint8Array(4 + chunk.length);
        out.set([REPORT.WRITE_CONFIG, index, chunk.length, idx]);
        out.set(chunk, 4);
        await this.#out(out);
      }
      await this.#out([REPORT.WRITE_CONFIG, index, 0, 0xff]);
    });
  }

  /**
   * Send a config command and wait for its confirmation.
   * @param {string|number} block block name or index
   * @param {string|number} command command name from the firmware enum (e.g. 'SAVE_ALL') or id
   * @returns {Promise<{status: boolean, data: Uint8Array|null}>}
   */
  sendConfigCommand(block, command, timeout = 5000) {
    const blockKey = typeof block === 'string' ? block : this.#configTable.find((b) => b.index === block)?.key;
    const index = typeof block === 'string' ? this.blockIndex(block) : block;
    const cmd = typeof command === 'string' ? this.commandId(blockKey, command) : command;
    return this.#exclusive(async () => {
      this.#cmd = { block: index, command: cmd, done: false, ok: false, data: null };
      await this.#out([REPORT.COMMAND, index, cmd]);
      const done = await waitFor(() => this.#cmd.done, timeout ?? 5000);
      return done ? { status: this.#cmd.ok, data: this.#cmd.data } : { status: false, data: null };
    });
  }

  /** Commit all config blocks to flash. */
  async save() {
    const { status } = await this.sendConfigCommand('gamepad', 'SAVE_ALL');
    return status;
  }

  /** Reboot into the RP2040/RP2350 bootloader. Does not wait for an ACK (the device drops off USB). */
  async rebootToBootloader() {
    await this.#out([REPORT.COMMAND, this.blockIndex('gamepad'), this.commandId('gamepad', 'RESET_TO_BOOTLOADER')]);
    return true;
  }

  /** Re-read the WLAN dongle's status (e.g. after a Check again). Resolves the new info, or null. */
  refreshDongle() {
    return this.#exclusive(async () => {
      const info = await this.#probeDongle(1000);
      if (info) this.dongle = info;
      return info;
    });
  }

  /** Reboot the WLAN dongle (not the controller) into its RP2040/RP2350 bootloader. No reply: it drops off USB. */
  async rebootDongleToBootloader() {
    await this.#out([REPORT.DONGLE_BOOTLOADER]);
    return true;
  }

  /** Legacy firmware: request bootloader (fire-and-forget). */
  async rebootToBootloaderLegacy() {
    try { await this.#out([REPORT.LEGACY_FW_SET]); } catch { /* device drops off */ }
  }

  /** Choose which live input stream the device sends: joysticks (0xFE) or raw hover (0xFF). */
  setInputMode(joysticks = false) {
    this.#inputJoysticks = !!joysticks;
    this.#streaming = true;
    return this.sendReport(REPORT.INPUT_MODE, [0x00, joysticks ? 254 : 255]);
  }

  /** Highlight/focus an input on the device (used during remapping). */
  setFocusedInput(inputCode) {
    return this.sendReport(REPORT.INPUT_MODE, [0x01, inputCode & 0xff]);
  }
}

/** The app uses a single device instance. */
export const device = new HojaDevice();
