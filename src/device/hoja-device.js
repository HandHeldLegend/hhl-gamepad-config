/**
 * hoja-device.js: WebUSB protocol driver for HOJA-firmware controllers.
 *
 * This is a faithful port of hoja2's js/gamepad.js. The wire protocol is unchanged; what changed:
 *   - memory blocks come from the firmware layout (struct.js) instead of per-struct parser files;
 *   - it is an EventTarget (events listed below) instead of single-callback hooks;
 *   - request/response operations are serialized so two views can't clobber each other's reads;
 *   - the USB disconnect listener is registered once and only reacts to *our* device.
 *
 * Wire protocol summary (the config interface, 64-byte reports; first byte = report id):
 *   0x01 READ_CONFIG_BLOCK   out: [1, block]                in: [1, block, chunkSize, idx|0xFF, data...]
 *   0x02 WRITE_CONFIG_BLOCK  out: [2, block, size, idx, data...] then [2, block, 0, 0xFF]
 *   0x03 READ_STATIC_BLOCK   out: [3, block]                in: same shape as 0x01
 *   0x04 CONFIG_COMMAND      out: [4, block, cmd]           in: [4, block, cmd, ok, data...]
 *   0x05 INPUT MODE/FOCUS    out: [5, 0, 254|255] (joystick|hover stream), [5, 1, inputCode]
 *   0x06 BLOCK_FINGERPRINTS  out: [6]                       in: [6, 0, count, CRC32 LE × count] (config blocks),
 *                                                                then [6, 1, count, CRC32 LE × count] (static blocks)
 *                            Each CRC32 covers exactly the bytes a read of that block sends; older firmware
 *                            doesn't answer. Connecting reads only blocks whose CRC32 differs from the copy
 *                            cached in this browser (block-cache.js) and uses the cached bytes for the rest.
 *   0x07 PROFILE             out: [7, op, profile, from (copy) | 0 (rename), name up to 24 bytes UTF-8 (rename)]
 *                            in: [7, op, done, count, active, profile, name 24]. op 0 info, 1 switch, 2 rename,
 *                            3 copy (from another profile into this one). Count 0, or no answer: no profiles
 *                            (HOJA-LIB-RP2040 utilities/profiles.h). Switching stores everything live first.
 *   0xFE / 0xFF              in: live input reports (joystick / raw hover)
 *   0xFA                     in: analog (snapback) dump
 *   0xAF                     in/out: legacy firmware version probe
 *   0xD0 DONGLE_INFO         out: [0xD0]                    in: dongle status (see decodeDongleInfo)
 *   0xD1 DONGLE_BOOTLOADER   out: [0xD1]                    the dongle reboots into BOOTSEL (no reply)
 *   0xD2 DONGLE_PC_MODE      out: [0xD2, mode]              in: 0xD0's reply (the dongle's mode on a computer)
 *   0x04 + GAMEPAD_CMD_USB_MODE  out: [4, gamepad block, 5, mode]  a controller on its cable: another mode now
 *
 * The config interface is the vendor interface (class 0xFF, subclass 0) with a bulk endpoint each
 * way: interface 1 on endpoint 2 in Switch and Steam modes. A dongle on a computer puts it beside the
 * GameCube adapter (Slippi) and XInput too, on the next free endpoint (3). Windows' Xbox 360 driver
 * takes the whole XInput device, so there only other systems reach it.
 *
 * Dongle: a USB receiver a wireless controller joins over Bluetooth. With a controller it takes the
 * controller's USB identity and passes this protocol through, so everything works unchanged; only
 * the dongle itself answers 0xD0/0xD1 (which is how we tell). Without a controller it is a generic
 * "HOJA Dongle" (2e8a:10c6) that answers nothing else, so it connects as dongle-only.
 *
 * Bluetooth: a controller running wirelessly also offers this protocol over Bluetooth LE (ble-link.js), the
 * same packets in GATT frames. openBluetooth() takes such a link once the browser is allowed on it; from then
 * on everything works as over USB, except what needs the cable (usbDevice is null, transport 'ble').
 *
 * Events (all CustomEvent; read `event.detail`):
 *   'opening'     { name }                           a device was chosen and is being opened (USB or Bluetooth name)
 *   'progress'    { done, total }                    settings blocks read so far while connecting
 *   'connect'     { device: this }                   blocks + statics loaded
 *   'disconnect'  { dongle, requested }              dongle: its status if it was a dongle; requested:
 *                                                     disconnect() was called (not an unplug or re-enumeration)
 *   'input'       DataView                            live input report (0xFE/0xFF)
 *   'snapback'    DataView                            analog dump (0xFA)
 *   'legacy'      { deviceId, url }                   pre-HOJA2 firmware detected
 *   'dongle'      { dongle }                          a dongle with no controller connected to it
 *   'bootloader'  {}                                  user picked a bare RP2040/RP2350 bootloader
 *   'esp32-update' {}                                 user picked the CH340 of a controller in wireless-module
 *                                                     update mode (only that chip is on USB then)
 */
import { LAYOUT, createStruct, decodeText } from './struct.js';
import { legacyFirmwareUrl } from './legacy.js';
import { cachedBlock, findCacheByBlock, loadCache, storeCacheBlocks } from './block-cache.js';
import { sleep, withTimeout } from '../util/async.js';

/** Raspberry Pi's USB vendor ID: HOJA controllers and dongles, and the RP2040 / RP2350 boot ROMs. */
export const RPI_VENDOR_ID = 0x2e8a;
/** The HOJA Gamepad (generic) product ID: the running firmware, and the HOJA bootloader's update mode. */
export const HOJA_GAMEPAD_PID = 0x10c6;
/** The RP2040 and RP2350 boot ROMs' product IDs (BOOTSEL). */
export const BOOT_ROM_PIDS = [0x0003, 0x000f];
/** The HOJA update mode's device version high byte (the running firmware reports 0x02 there). */
const UPDATE_MODE_VERSION_MAJOR = 0xb0;

/** USB filters offered in the browser's device picker. */
export const USB_FILTERS = [
  { vendorId: 0x057e, productId: 0x2009 }, // Switch Pro Controller mode
  { vendorId: 0x057e, productId: 0x0337 }, // GameCube adapter: a dongle in Slippi mode on a computer
  ...(isWindowsHost() ? [] : [{ vendorId: 0x045e, productId: 0x028e }]), // XInput: a dongle in XInput mode
  { vendorId: RPI_VENDOR_ID, productId: HOJA_GAMEPAD_PID }, // HOJA Gamepad (generic), and the HOJA update mode
  { vendorId: RPI_VENDOR_ID, productId: 0x10dd }, // GC Ultimate
  { vendorId: RPI_VENDOR_ID, productId: 0x10df }, // ProGCC
  ...BOOT_ROM_PIDS.map((productId) => ({ vendorId: RPI_VENDOR_ID, productId })), // RP2040 / RP2350 bootloader
  { vendorId: 0x1a86, productId: 0x7522 }, // CH340: controller in wireless-module (ESP32) update mode
];

/** A device USB_FILTERS lists (a HOJA controller, dongle, bootloader or wireless-module update chip). */
export function isListedUsb(usb) {
  return USB_FILTERS.some((f) => f.vendorId === usb?.vendorId && f.productId === usb?.productId);
}

/**
 * Show the browser's USB chooser (call it from a click). Resolves the USBDevice, or null when it was
 * closed without one.
 */
export async function requestUsbController() {
  if (!navigator.usb) throw new Error('WebUSB is not available in this browser.');
  try {
    return await navigator.usb.requestDevice({ filters: USB_FILTERS });
  } catch (err) {
    if (err?.name === 'NotFoundError') return null; // user canceled
    throw err;
  }
}

/** Windows, where the Xbox 360 driver takes a whole XInput device (see USB_FILTERS). */
function isWindowsHost() {
  return typeof navigator !== 'undefined'
    && (/Windows/i.test(navigator.userAgentData?.platform || '') || /Windows/.test(navigator.userAgent || ''));
}

/** The GameCube adapter's IDs (Slippi mode). With Zadig's driver Windows lets one program at a time
 *  open it: while Dolphin has it, nothing else can. */
export function isGameCubeAdapter(device) {
  return device?.vendorId === 0x057e && device?.productId === 0x0337;
}

/** The CH340 USB-serial chip a controller exposes in wireless-module (ESP32) update mode. */
export function isCh340(device) {
  return device?.vendorId === 0x1a86 && device?.productId === 0x7522;
}

/**
 * The HOJA bootloader's update mode (HOJA-LIB-RP2040 boot_layout.h): the HOJA Gamepad IDs with 0xB0 in
 * the device version's high byte (the running firmware reports 0x02). It speaks the boot ROM's
 * PICOBOOT commands, and Windows binds WinUSB to it without a driver install.
 */
export function isHojaUpdateMode(device) {
  return device?.vendorId === RPI_VENDOR_ID && device?.productId === HOJA_GAMEPAD_PID
    && device?.deviceVersionMajor === UPDATE_MODE_VERSION_MAJOR;
}

/** The build a controller in the HOJA update mode belongs to: its serial is the build id. */
export function updateModeBuildId(device) {
  return isHojaUpdateMode(device) ? device.serialNumber || null : null;
}

/** A bootloader that takes firmware: the RP2040 / RP2350 boot ROM's, or the HOJA update mode. */
export function isPicoBootloader(device) {
  return (device?.vendorId === RPI_VENDOR_ID && BOOT_ROM_PIDS.includes(device?.productId)) || isHojaUpdateMode(device);
}

/** Where the config interface was before it was looked up by class. */
const LEGACY_PORT = { number: 1, epIn: 2, epOut: 2 };

/** The config interface ({ number, epIn, epOut }), or null on a device without one (see the header). */
function findConfigPort(usb) {
  for (const itf of usb.configuration.interfaces) {
    for (const alt of itf.alternates) {
      if (alt.interfaceClass !== 0xff || alt.interfaceSubclass !== 0) continue;
      const bulk = (dir) => alt.endpoints.find((e) => e.type === 'bulk' && e.direction === dir);
      if (bulk('in') && bulk('out')) {
        return { number: itf.interfaceNumber, epIn: bulk('in').endpointNumber, epOut: bulk('out').endpointNumber };
      }
    }
  }
  return null;
}
const CHUNK_MAX = 32;
/**
 * How long to wait for an answer older firmware never gives (the block fingerprints, the first profile
 * request): that is what asking costs it.
 */
const FIRST_ANSWER_WAIT_USB_MS = 300;
const FIRST_ANSWER_WAIT_BLE_MS = 1000;
/** Time limit for one USB step (open, claim, a single OUT transfer). One that overruns is cancelled by
 *  closing the device. */
const STEP_TIMEOUT_MS = 5000;
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
  FINGERPRINTS: 6,
  PROFILE: 7,
  SNAPBACK_DUMP: 250,
  INPUT_JOYSTICKS: 254,
  INPUT_RAW: 255,
  LEGACY_FW: 0xaf,
  LEGACY_FW_SET: 0x0f,
  DONGLE_INFO: 0xd0,
  DONGLE_BOOTLOADER: 0xd1,
  DONGLE_PC_MODE: 0xd2,
};

/** PROFILE (0x07) operations (profiles_op_t). */
const PROFILE_OP = { INFO: 0, SWITCH: 1, RENAME: 2, COPY: 3 };
/** A profile name's room on the controller, in bytes of UTF-8. */
export const PROFILE_NAME_LEN = 24;
/** Where the name starts in a PROFILE reply, and the reply's length through the name. */
const PROFILE_REPLY_NAME_AT = 6;
const PROFILE_REPLY_LEN = PROFILE_REPLY_NAME_AT + PROFILE_NAME_LEN;
/** A switch, rename or copy is answered once the controller stored it: this long at most. */
const PROFILE_REPLY_WAIT_MS = 2000;
/** The settings blocks that belong to a profile: what a switch or a copy into the live profile changes. */
const PROFILE_BLOCKS = ['analog', 'imu', 'haptic', 'rgb', 'input'];

/**
 * The modes the app can switch to live, until the controller (or dongle) is unplugged: the controller's
 * own number (core_reportformat_t) on its cable, the dongle's (dongle_mode_t) through it. Only modes the
 * app can reach again, so not XInput: Windows' Xbox 360 driver takes the whole device.
 */
export const LIVE_MODES = {
  steam: { usb: 6, dongle: 1 },
  slippi: { usb: 2, dongle: 3 },
  switch: { usb: 0, dongle: 0 },
};

/**
 * Decode the dongle's 0xD0 reply (64 bytes):
 *   [1] protocol version   [2] board: 0 unknown, 1 HOJA, 2 Pico W, 3 Pico 2 W   [3] 1 = controller connected
 *   [4..7] dongle firmware version (u32 LE build stamp)   [8..9] reserved (0)
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
  /** @type {import('./ble-link.js').BleLink|null} the link while connected over Bluetooth */
  #ble = null;
  #port = LEGACY_PORT; // the open device's config interface
  #switching = false;  // a live mode change was asked for: the device leaves and comes back
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
  #read = { kind: null, block: -1, done: false, parts: [] };
  #cmd = { block: -1, command: -1, done: false, ok: false, data: null };
  #legacy = { done: false, isLegacy: false };
  #dongleReply = null;
  #profileReply = null;
  #fingerprints = null;    // { config: [crc…] | null, static: [crc…] | null } while asking
  #cacheKey = null;        // this controller's entry in the block cache, once known

  /** Dongle status (decodeDongleInfo) when connected through one, else null. */
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
  /** How the controller is connected: 'usb', 'ble' (Bluetooth), or null. */
  get transport() { return this.#ble ? 'ble' : this.#usb ? 'usb' : null; }
  /** Over Bluetooth: the open link (firmware updates speak on it too), else null. */
  get bleLink() { return this.#ble; }
  /** Over Bluetooth: the controller's last connection report (BleLink.linkInfo), else null. */
  get bleLinkInfo() { return this.#ble?.linkInfo ?? null; }
  /** Which controller this is to the browser: 'ble:<BluetoothDevice.id>' or 'usb:<serial number>', or null. */
  get transportId() {
    if (this.#ble) return `ble:${this.#ble.id}`;
    return this.#usb?.serialNumber ? `usb:${this.#usb.serialNumber}` : null;
  }

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
   *   'dongle'        a dongle with no controller ('dongle' event fired; the device stays open)
   *   false           canceled / failed
   */
  async connect() {
    const usb = await requestUsbController();
    return usb ? this.open(usb) : false;
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

    if (this.#ble) await this.disconnect();
    this.#emit('opening', { name: usb.productName || '' });
    let port;
    try {
      // Right after a firmware update the OS may still be setting the device up; these can then wait
      // forever instead of failing, so each gets a time limit (the caller retries).
      await withTimeout(usb.open(), STEP_TIMEOUT_MS, 'Opening the controller');
      await withTimeout(usb.selectConfiguration(1), STEP_TIMEOUT_MS, 'Selecting the USB configuration');
      port = findConfigPort(usb);
      if (!port) throw Object.assign(new Error('This device has no config interface'), { noConfigInterface: true });
      await withTimeout(usb.claimInterface(port.number), STEP_TIMEOUT_MS, 'Claiming the controller');
    } catch (err) {
      console.error('[device] open failed', err);
      // Dolphin keeps the adapter open while it runs
      if (isGameCubeAdapter(usb) && /Access denied/i.test(err?.message || '')) err.adapterInUse = true;
      try { await usb.close(); } catch { /* ignore */ }
      throw err;
    }

    this.#usb = usb;
    this.#port = port;
    this.#switching = false;
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
      await this.#readSettings();
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

  /**
   * Read every settings block. Through the dongle or over Bluetooth this takes a few seconds: report each
   * block so the app can show how far it got. Firmware that sends block fingerprints gets only the blocks
   * that changed since this browser last read them; the rest come from the cache (block-cache.js), fed in
   * exactly as if they had just been read.
   */
  async #readSettings() {
    this.#cacheKey = null;
    const total = this.#configTable.length + this.#staticTable.length;
    let done = 0;
    const step = () => this.#emit('progress', { done: ++done, total });
    const plan = await this.#exclusive(() => this.#cachePlan());
    await this.#exclusive(() => this.#readAll('config', this.#configTable, step, plan));
    await this.#exclusive(() => this.#readAll('static', this.#staticTable, step, plan));
    if (!plan) return;
    this.#cacheKey = plan.key ?? this.#identity();
    storeCacheBlocks(this.#cacheKey, plan.fresh);
    console.debug(`[cache] reused ${plan.reused} of ${total} blocks`);
  }

  /** This controller's key in the block cache: its MAC address (gamepad config block), or null. */
  #identity() {
    const mac = this.missing.config.includes('gamepad') ? null : this.config.gamepad?.gamepad_mac_address;
    if (!mac || ![...mac].some((b) => b)) return null;
    return `mac:${[...mac].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  /**
   * Ask for the block fingerprints. Resolves { fp, entry, key, reused, fresh } to read with, or null
   * (older firmware: read everything). The cache entry is found by the gamepad block, which holds the MAC.
   */
  async #cachePlan() {
    this.#fingerprints = { config: null, static: null };
    try {
      await this.#out([REPORT.FINGERPRINTS]);
    } catch {
      return null;
    }
    await waitFor(() => this.#fingerprints.config && this.#fingerprints.static, this.#firstAnswerWait());
    const fp = this.#fingerprints;
    this.#fingerprints = null;
    if (!fp.config || !fp.static) return null;
    const gamepad = this.#configTable.find((b) => b.key === 'gamepad')?.index ?? 0;
    const entry = await findCacheByBlock('config', gamepad, fp.config[gamepad]);
    return { fp, entry, key: entry?.key ?? null, reused: 0, fresh: [] };
  }

  /** FIRST_ANSWER_WAIT_*_MS for the transport in use. */
  #firstAnswerWait() {
    return this.#ble ? FIRST_ANSWER_WAIT_BLE_MS : FIRST_ANSWER_WAIT_USB_MS;
  }

  #onFingerprints(view) {
    if (!this.#fingerprints || view.byteLength < 3) return;
    const kind = view.getUint8(1) === 0 ? 'config' : 'static';
    const count = view.getUint8(2);
    const crcs = [];
    for (let i = 0; i < count && 3 + 4 * (i + 1) <= view.byteLength; i++) crcs.push(view.getUint32(3 + 4 * i, true));
    this.#fingerprints[kind] = crcs;
  }

  /**
   * Connect over Bluetooth: `link` is a BleLink (ble-link.js) that is open and allowed. A controller that
   * offers Bluetooth runs current firmware and is no dongle, so there's nothing to probe: the settings are
   * read straight away. Resolves true (connected) or throws, like open().
   */
  openBluetooth(link) {
    if (this.#opening) return this.#opening;
    this.#opening = this.#openBluetooth(link).finally(() => { this.#opening = null; });
    return this.#opening;
  }

  async #openBluetooth(link) {
    if (this.#connected) await this.disconnect();
    if (!link.isOpen) throw new Error('The Bluetooth link dropped');
    this.#emit('opening', { name: link.name });
    this.#ble = link;
    this.#usb = null;
    this.#switching = false;
    this.#connected = true;
    this.#streaming = false;
    this.#resetMemory();
    this.dongle = null;
    link.addEventListener('report', (e) => {
      if (link !== this.#ble) return;
      this.#lastReportAt = performance.now();
      this.#parse(e.detail);
    });
    link.addEventListener('gone', () => this.#onBleGone(link));
    this.#lastReportAt = performance.now();
    this.#startWatchdog();

    try {
      await this.#readSettings();
    } catch (err) {
      clearInterval(this.#watchdog);
      if (this.#ble === link) { this.#connected = false; this.#ble = null; }
      link.close();
      throw err;
    }
    this.#emit('connect', { device: this });
    return true;
  }

  /** The Bluetooth link dropped without disconnect() (out of range, controller off): like an unplug. */
  #onBleGone(link) {
    if (link !== this.#ble) return;
    clearInterval(this.#watchdog);
    this.#connected = false;
    this.#ble = null;
    this.#emit('disconnect', { dongle: null, requested: false });
  }

  #startWatchdog() {
    clearInterval(this.#watchdog);
    this.#watchdog = setInterval(() => {
      if (!this.#connected) { clearInterval(this.#watchdog); return; }
      if (!this.#streaming) return; // nothing requested yet (e.g. still reading blocks while connecting)
      const now = performance.now();
      if (now - this.#lastReportAt < STREAM_STALL_MS || now - this.#rearmAt < STREAM_STALL_MS) return;
      this.#rearmAt = now;
      this.sendReport(REPORT.INPUT_MODE, [0x00, this.#inputJoysticks ? 254 : 255]).catch(() => {});
    }, 250);
  }

  async disconnect() {
    clearInterval(this.#watchdog);
    if (this.#ble) {
      const link = this.#ble;
      this.#connected = false;
      this.#ble = null;
      link.close();
      this.#emit('disconnect', { dongle: null, requested: true });
      return true;
    }
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
    if (this.#usbListenerInstalled) return;
    this.#usbListenerInstalled = true;
    navigator.usb.addEventListener('disconnect', (event) => this.#onGone(event.device));
  }

  /** Our device went away without disconnect(): unplugged or re-enumerated. */
  #onGone(usb) {
    if (usb !== this.#usb) return;
    this.#connected = false;
    this.#usb = null;
    this.#emit('disconnect', { dongle: this.dongle, requested: false, switching: this.#switching });
    this.dongle = null;
  }

  // ---------------------------------------------------------------------------------------
  // Raw transport
  // ---------------------------------------------------------------------------------------

  async #out(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    // Over Bluetooth the link queues writes and limits each one's time itself
    if (this.#connected && this.#ble) return this.#ble.send(data);
    if (!this.#connected || !this.#usb) throw new Error('Device not connected');
    return withTimeout(this.#usb.transferOut(this.#port.epOut, data), STEP_TIMEOUT_MS, 'Sending to the controller');
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
        const result = await this.#usb.transferIn(this.#port.epIn, 64);
        if (result.status === 'stall') { await this.#usb.clearHalt('in', this.#port.epIn); continue; }
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
        case REPORT.FINGERPRINTS: return this.#onFingerprints(view);
        case REPORT.PROFILE: return this.#onProfile(view);
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
    const reading = this.#read.kind === kind && this.#read.block === blockIdx;
    if (size > 0) {
      const chunk = new Uint8Array(view.buffer, view.byteOffset + 4, size);
      if (!this.#storeChunk(kind, blockIdx, idx, chunk)) return;
      if (reading) this.#read.parts.push([idx * CHUNK_MAX, chunk.slice()]); // the block's bytes, for the cache
    }
    if (idx === 0xff && reading) {
      this.#read.done = true;
    }
  }

  /** One chunk of a block into its struct: from the controller, or from the cache (#applyCached). */
  #storeChunk(kind, blockIdx, idx, chunk) {
    const table = kind === 'config' ? this.#configTable : this.#staticTable;
    const entry = table.find((b) => b.index === blockIdx);
    if (!entry) return false;
    const target = (kind === 'config' ? this.config : this.static)[entry.key];
    const at = idx * CHUNK_MAX;
    // Newer firmware may send a larger block than this app knows about: grow, don't throw.
    if (at + chunk.length > target.buffer.length) {
      const grown = new Uint8Array(at + chunk.length);
      grown.set(target.buffer);
      target.updateBuffer(grown);
    }
    target.buffer.set(chunk, at);
    return true;
  }

  /** A cached block, chunk by chunk through the same path as a read. */
  #applyCached(kind, index, bytes) {
    for (let idx = 0, pos = 0; pos < bytes.length; idx++, pos += CHUNK_MAX) {
      this.#storeChunk(kind, index, idx, bytes.subarray(pos, pos + CHUNK_MAX));
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

  /** Ask for the dongle's status. Resolves the decoded reply, or null when nothing answers (no dongle). */
  async #probeDongle(timeout = 150) {
    this.#dongleReply = { done: false, info: null };
    await this.#out([REPORT.DONGLE_INFO]);
    await waitFor(() => this.#dongleReply.done, timeout);
    return this.#dongleReply.info;
  }

  #onProfile(view) {
    const r = this.#profileReply;
    if (!r || view.byteLength < PROFILE_REPLY_LEN) return;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (bytes[1] !== r.op || bytes[5] !== r.profile) return; // an answer to another request
    const name = bytes.subarray(PROFILE_REPLY_NAME_AT, PROFILE_REPLY_LEN);
    const end = name.indexOf(0);
    r.reply = {
      done: !!bytes[2], count: bytes[3], active: bytes[4], profile: bytes[5],
      name: new TextDecoder().decode(end < 0 ? name : name.subarray(0, end)),
    };
  }

  #onDongleInfo(view) {
    if (!this.#dongleReply) return;
    this.#dongleReply.info = decodeDongleInfo(view);
    this.#dongleReply.done = true;
  }

  // ---------------------------------------------------------------------------------------
  // Memory blocks
  // ---------------------------------------------------------------------------------------

  /** Read one block. Resolves its bytes as sent (kept in the block cache once the controller is known). */
  async #readBlock(kind, index, timeout = 5000) {
    const read = { kind, block: index, done: false, parts: [] };
    this.#read = read;
    await this.#out([kind === 'config' ? REPORT.READ_CONFIG : REPORT.READ_STATIC, index]);
    if (!(await waitFor(() => read.done, timeout))) {
      throw new Error(`Timed out reading ${kind} block ${index}`);
    }
    const bytes = new Uint8Array(read.parts.reduce((n, [at, c]) => Math.max(n, at + c.length), 0));
    for (const [at, c] of read.parts) bytes.set(c, at);
    if (this.#cacheKey) storeCacheBlocks(this.#cacheKey, [{ kind, index, bytes }]);
    return bytes;
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
   * drops, so a firmware without several blocks doesn't stall the connect for long. `onBlock` runs
   * after each.
   */
  async #readAll(kind, table, onBlock, plan = null) {
    let timeout = 3000;
    for (const b of table) {
      try {
        const cached = plan && cachedBlock(plan.entry, kind, b.index, plan.fp[kind][b.index]);
        if (cached) {
          this.#applyCached(kind, b.index, cached);
          plan.reused++;
        } else {
          const bytes = await this.#readBlock(kind, b.index, timeout);
          plan?.fresh.push({ kind, index: b.index, bytes });
          // The gamepad block names the controller: its cache entry, when the block itself changed
          if (plan && !plan.entry && kind === 'config' && b.key === 'gamepad') {
            plan.key = this.#identity();
            plan.entry = await loadCache(plan.key);
          }
        }
      } catch (err) {
        if (!this.#connected) throw err;
        console.warn(`[device] ${kind} block ${b.index} (${b.key}) didn't answer; continuing without it`);
        timeout = 1000;
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
      // The controller holds these bytes now; if it keeps them differently, the next fingerprint says so
      if (this.#cacheKey) storeCacheBlocks(this.#cacheKey, [{ kind: 'config', index, bytes: buf.slice() }]);
    });
  }

  /**
   * Send a config command and wait for its confirmation.
   * @param {string|number} block block name or index
   * @param {string|number} command command name from the firmware enum (e.g. 'SAVE_ALL') or id
   * @returns {Promise<{status: boolean, data: Uint8Array|null}>}
   */
  sendConfigCommand(block, command, timeout = 5000, arg = null) {
    const blockKey = typeof block === 'string' ? block : this.#configTable.find((b) => b.index === block)?.key;
    const index = typeof block === 'string' ? this.blockIndex(block) : block;
    const cmd = typeof command === 'string' ? this.commandId(blockKey, command) : command;
    return this.#exclusive(async () => {
      this.#cmd = { block: index, command: cmd, done: false, ok: false, data: null };
      await this.#out(arg == null ? [REPORT.COMMAND, index, cmd] : [REPORT.COMMAND, index, cmd, arg]);
      const done = await waitFor(() => this.#cmd.done, timeout ?? 5000);
      return done ? { status: this.#cmd.ok, data: this.#cmd.data } : { status: false, data: null };
    });
  }

  /** Commit all config blocks to flash. */
  async save() {
    const { status } = await this.sendConfigCommand('gamepad', 'SAVE_ALL');
    return status;
  }

  // ---------------------------------------------------------------------------------------
  // Settings profiles (0x07)
  // ---------------------------------------------------------------------------------------

  /** One profile exchange about `profile`. Resolves the reply, or null when nothing answered. */
  #profileOp(op, profile, extra = [], timeout = PROFILE_REPLY_WAIT_MS) {
    return this.#exclusive(async () => {
      const r = { op, profile, reply: null };
      this.#profileReply = r;
      try {
        await this.#out([REPORT.PROFILE, op, profile, ...extra]);
        await waitFor(() => r.reply, timeout);
      } finally {
        this.#profileReply = null;
      }
      return r.reply;
    });
  }

  /**
   * The controller's profiles: { active, names: [4 strings, '' unnamed] }, or null (firmware without
   * them never answers).
   */
  async readProfiles() {
    const first = await this.#profileOp(PROFILE_OP.INFO, 0, [], this.#firstAnswerWait());
    if (!first?.count) return null;
    const names = [first.name];
    for (let n = 1; n < first.count; n++) {
      const r = await this.#profileOp(PROFILE_OP.INFO, n);
      if (!r) return null;
      names.push(r.name);
    }
    return { active: first.active, names };
  }

  /** Re-read the profile's blocks after the live one changed (missing ones stay missing). */
  async #rereadProfileBlocks() {
    for (const key of PROFILE_BLOCKS) {
      if (!this.missing.config.includes(key)) await this.requestBlock(key);
    }
  }

  /** Switch profiles. The controller stores what's live as the old one first. Resolves true once it did. */
  async switchProfile(profile) {
    const r = await this.#profileOp(PROFILE_OP.SWITCH, profile);
    if (!r?.done) return false;
    await this.#rereadProfileBlocks();
    return true;
  }

  /**
   * Rename a profile ('' clears it). The name is cut to PROFILE_NAME_LEN bytes of UTF-8, at a whole
   * character. Resolves the name the controller stored, or null when it didn't take it.
   */
  async renameProfile(profile, name) {
    const enc = new TextEncoder();
    let bytes = enc.encode(name);
    while (bytes.length > PROFILE_NAME_LEN) { name = [...name].slice(0, -1).join(''); bytes = enc.encode(name); }
    const r = await this.#profileOp(PROFILE_OP.RENAME, profile, [0, ...bytes]); // 0: the copy source, unused here
    return r?.done ? r.name : null;
  }

  /**
   * Copy another profile's settings into `profile` (it keeps its name). Into the live one (the reply
   * says which is live): it takes over now. Resolves true once the controller stored it.
   */
  async copyProfile(from, profile) {
    const r = await this.#profileOp(PROFILE_OP.COPY, profile, [from]);
    if (!r?.done) return false;
    if (r.profile === r.active) await this.#rereadProfileBlocks();
    return true;
  }

  /** Reboot into the RP2040/RP2350 bootloader. Does not wait for an ACK (the device drops off USB). */
  async rebootToBootloader() {
    await this.#out([REPORT.COMMAND, this.blockIndex('gamepad'), this.commandId('gamepad', 'RESET_TO_BOOTLOADER')]);
    return true;
  }

  /** Re-read the dongle's status (e.g. after a Check again). Resolves the new info, or null. */
  refreshDongle() {
    return this.#exclusive(async () => {
      const info = await this.#probeDongle(1000);
      if (info) this.dongle = info;
      return info;
    });
  }

  /**
   * The dongle's mode on a computer (a DONGLE_PC_MODES value), until it is unplugged. A controller
   * that follows the dongle switches with it, and the dongle comes back on USB in that mode: the
   * session follows it there. Resolves the dongle's new status, or null without a reply.
   */
  setDonglePcMode(mode) {
    this.#switching = true;
    return this.#exclusive(async () => {
      this.#dongleReply = { done: false, info: null };
      await this.#out([REPORT.DONGLE_PC_MODE, mode]);
      await waitFor(() => this.#dongleReply.done, 1000);
      if (this.#dongleReply.info) this.dongle = this.#dongleReply.info;
      return this.#dongleReply.info;
    });
  }

  /**
   * A controller on its cable: another USB mode now (a LIVE_MODES .usb value), until it is unplugged.
   * Resolves true once it agreed; it then drops off USB and comes back in that mode (about 0.3 s), and
   * the session follows it there. Older firmware doesn't know the command: false.
   */
  async setUsbMode(mode) {
    this.#switching = true;
    const { status } = await this.sendConfigCommand('gamepad', this.commandId('gamepad', 'USB_MODE'), 1000, mode);
    if (!status) this.#switching = false;
    return status;
  }

  /** Reboot the dongle (not the controller) into its RP2040/RP2350 bootloader. No reply: it drops off USB. */
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
