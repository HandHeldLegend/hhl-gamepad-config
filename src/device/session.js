/**
 * session.js: App-level view of the connected controller.
 *
 * Views should talk to `session` rather than the raw driver for anything stateful:
 *   session.state         'disconnected' | 'connecting' | 'connected' | 'legacy' | 'dongle'
 *                         ('dongle': a WLAN dongle with no controller; nothing to configure yet;
 *                         'connecting': from the moment a device was chosen until its settings are read)
 *   session.connecting    while connecting: { name, done, total } (device name, settings blocks read), else null
 *   session.caps          capability flags derived from the static info blocks (what this build has);
 *                         caps.viaDongle: the controller is connected through a WLAN dongle;
 *                         caps.viaLan: through HHL Gamepad WLAN on this PC; caps.viaWireless: either one
 *                         (no firmware, bootloader or wireless-module updates without a USB cable)
 *   session.info          { name, maker, fwVersion, manifestUrl, firmwareUrl, manualUrl }
 *   session.dongle        the WLAN dongle's status (decodeDongleInfo in hoja-device.js), or null
 *   session.connectLan(p) connect through HHL Gamepad WLAN instead of the USB picker (lan-transport.js)
 *   session.config.<blk>  live config structs (same objects as device.config)
 *   session.static.<blk>  static info structs
 *   session.commit(blk)   push a block to the device (debounced) and mark it unsaved
 *   session.save()        flush pending writes and commit everything to flash
 *   session.on(evt, fn)   subscribe; returns an unsubscribe function
 *
 * Events: 'state', 'connecting', 'dirty', 'saved', 'attention', 'legacy', 'bootloader', 'esp32-update', 'dongle'
 *
 * HOJA firmware applies a written block immediately (RAM); "Save" persists it to flash.
 * That's why every change is pushed live and the Save button lights up until committed.
 *
 * A WLAN dongle drops off USB and comes back under a new identity whenever a controller joins or
 * leaves it. After a dongle disappears like that, the session reconnects to whatever comes back
 * (see #followDongle). The browser only reports devices this site may already use, so when the
 * new identity was never allowed, the owner presses Connect once.
 */
import { device, USB_FILTERS, isPicoBootloader, isCh340 } from './hoja-device.js';
import { decodeText } from './struct.js';
import { N_ } from '../i18n/index.js'; // attention texts are translated where displayed

const WRITE_DEBOUNCE_MS = 120;
/** How long to wait for a WLAN dongle to come back after it drops off USB. */
const DONGLE_FOLLOW_MS = 10000;

/** IMU config block version that added imu_mode_disable_mask (per-mode motion on/off). */
export const IMU_MODE_MASK_VERSION = 0x13;

/**
 * Capability flags: which features this controller build supports. Mirrors hoja2's icon gating.
 * Mostly from the static blocks `s`; a few firmware-version features come from the config blocks `c`.
 */
export function computeCaps(s, c) {
  const a = s.analog;
  const bt = s.bluetooth;
  const hd = !!s.haptic.haptic_hd;
  const sd = !!s.haptic.haptic_sd;
  const bluetooth = !!(bt.bluetooth_bdr_supported || bt.bluetooth_ble_supported);
  const caps = {
    analog: !!(a.axis_lx || a.axis_rx),
    leftStick: !!a.axis_lx,
    rightStick: !!a.axis_rx,
    triggers: !!(a.axis_lt || a.axis_rt),
    invertAllowed: !!a.invert_allowed,
    rgb: s.rgb.rgb_groups > 0,
    imu: !!s.imu.axis_gyro_a,
    haptics: hd || sd,
    hapticHD: hd,
    battery: s.battery.battery_capacity_mah > 0,
    bluetooth,
    wlan: !!bt.wlan_supported,
    wireless: bluetooth,
    externalBaseband: bt.external_update_supported > 0,
    snes: !!s.device.snes_supported,
    joybus: !!s.device.joybus_supported,
    // Older firmware sends a 55-byte bluetooth block; the struct starts zeroed, so the byte reads 0.
    wii: bt.wii_supported === 1,
    // Per-mode motion switch: only read imu_mode_disable_mask when the IMU block is 0x13 or later.
    imuModes: !!s.imu.axis_gyro_a && (c?.imu?.imu_config_version ?? 0) >= IMU_MODE_MASK_VERSION,
    // Motion flick outputs arrived in the same firmware as the per-mode mask (IMU block 0x13). They
    // work without an IMU, so this doesn't check for one; older firmware would ignore the codes.
    flicks: (c?.imu?.imu_config_version ?? 0) >= IMU_MODE_MASK_VERSION,
  };
  caps.imuModeWii = caps.imuModes && caps.wii;
  // Separate wired / battery defaults and Auto: the firmware sets this marker byte once it migrated.
  caps.splitDefaults = c?.gamepad?.gamepad_defaults_split === 0x01;
  return caps;
}

const NO_CAPS = Object.freeze(Object.fromEntries(
  ['analog', 'leftStick', 'rightStick', 'triggers', 'invertAllowed', 'rgb', 'imu', 'haptics', 'hapticHD',
    'battery', 'bluetooth', 'wlan', 'wireless', 'externalBaseband', 'snes', 'joybus', 'wii', 'imuModes', 'imuModeWii', 'flicks', 'splitDefaults',
    'homeWlan', 'viaDongle', 'viaLan', 'viaWireless'].map((k) => [k, false]),
));

class Session extends EventTarget {
  device = device;
  state = 'disconnected';
  caps = NO_CAPS;
  info = {};
  /** @type {Set<string>} config blocks changed since the last save */
  dirty = new Set();
  /** sectionId -> { level: 'warn'|'info', text } */
  attention = {};
  connecting = null;
  #timers = new Map();
  #pending = new Map();
  #editSeq = 0;              // bumps on every commit()
  #editedAt = new Map();     // block -> #editSeq of its latest commit (see save())
  #follow = null; // { stop } while waiting for a WLAN dongle to come back

  constructor() {
    super();
    device.addEventListener('opening', (e) => this.#onOpening(e.detail));
    device.addEventListener('progress', (e) => this.#onProgress(e.detail));
    device.addEventListener('connect', () => this.#onConnect());
    device.addEventListener('disconnect', (e) => this.#onDisconnect(e.detail));
    device.addEventListener('legacy', (e) => { this.#setState('legacy'); this.#emit('legacy', e.detail); });
    device.addEventListener('dongle', () => this.#onDongle());
    device.addEventListener('bootloader', (e) => this.#emit('bootloader', e.detail));
    device.addEventListener('esp32-update', (e) => this.#emit('esp32-update', e.detail));
  }

  get config() { return device.config; }
  get static() { return device.static; }
  get connected() { return this.state === 'connected'; }
  get dongle() { return device.dongle ?? null; }

  on(type, fn) {
    const handler = (e) => fn(e.detail, e);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }

  #emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  #setState(state) {
    if (state !== 'connecting') this.connecting = null;
    if (this.state === state) return;
    this.state = state;
    this.#emit('state', { state });
  }

  /**
   * Open the browser device picker. Resolves true / false / 'bootloader'. The state turns 'connecting'
   * once a device was picked (see #onOpening), not while the picker is open.
   */
  async connect() {
    this.#follow?.stop();
    try {
      const result = await device.connect();
      if (result !== true && this.state === 'connecting') this.#setState('disconnected');
      return result;
    } catch (err) {
      this.#setState('disconnected');
      throw err;
    }
  }

  /** Connect to a gamepad HHL Gamepad WLAN has open on this PC (a pad from listLanPads()). Resolves like connect(). */
  async connectLan(pad) {
    this.#follow?.stop();
    this.#setState('connecting');
    try {
      const result = await device.connectLan(pad);
      if (result !== true && this.state === 'connecting') this.#setState('disconnected');
      return result;
    } catch (err) {
      this.#setState('disconnected');
      throw err;
    }
  }

  /** Re-open a controller the user already authorized (no picker). Resolves like connect(). */
  async reconnect(usb) {
    this.#follow?.stop();
    this.#setState('connecting');
    try {
      const result = await device.open(usb);
      if (result !== true && this.state === 'connecting') this.#setState('disconnected');
      return result;
    } catch (err) {
      this.#setState('disconnected');
      throw err;
    }
  }

  async disconnect() {
    this.#follow?.stop();
    await this.flush().catch(() => {});
    return device.disconnect();
  }

  /** Ask the WLAN dongle for its status again (PIN, detected host, controller). */
  async refreshDongle() {
    if (!this.dongle) return null;
    const info = await device.refreshDongle();
    this.#emit('dongle', { dongle: this.dongle });
    return info;
  }

  /** A device was chosen and is being opened: show that until its settings are read. */
  #onOpening({ name = '' } = {}) {
    this.connecting = { name, done: 0, total: 0 };
    this.#setState('connecting');
    this.#emit('connecting', this.connecting);
  }

  #onProgress({ done, total }) {
    if (!this.connecting) return;
    Object.assign(this.connecting, { done, total });
    this.#emit('connecting', this.connecting);
  }

  #onConnect() {
    const s = device.static;
    const caps = computeCaps(s, device.config);
    const viaDongle = !!device.dongle;
    const viaLan = !!device.lan;
    this.caps = {
      ...caps,
      // Home WLAN (for HHL Gamepad WLAN): a controller with WLAN whose firmware serves the wlan block.
      homeWlan: caps.wlan && !device.missing.config.includes('wlan'),
      viaDongle,
      viaLan,
      viaWireless: viaDongle || viaLan,
    };
    this.info = {
      name: decodeText(s.device.name) || 'HOJA Controller',
      maker: decodeText(s.device.maker),
      fwVersion: s.device.fw_version,
      manifestUrl: decodeText(s.device.manifest_url),
      firmwareUrl: decodeText(s.device.firmware_url),
      manualUrl: decodeText(s.device.manual_url),
    };
    this.dirty.clear();
    this.#setState('connected');
    this.refreshAttention();
  }

  /** A WLAN dongle with no controller: nothing to configure, but it can be shown and updated. */
  #onDongle() {
    this.caps = NO_CAPS;
    this.info = {};
    this.attention = {};
    this.dirty.clear();
    this.#setState('dongle');
    this.#emit('dongle', { dongle: this.dongle });
  }

  #onDisconnect({ dongle = null, requested = false } = {}) {
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
    this.#pending.clear();
    this.caps = NO_CAPS;
    this.attention = {};
    this.dirty.clear();
    this.#emit('dirty', { dirty: false });
    this.#emit('attention', this.attention);
    this.#setState('disconnected');
    if (dongle && !requested) this.#followDongle();
  }

  /**
   * The WLAN dongle dropped off USB without being asked to: usually a controller joined it (it comes
   * back as that controller) or left it (it comes back as the dongle). Reconnect to the next HOJA
   * device the browser reports within DONGLE_FOLLOW_MS. A bootloader (dongle update) is left to the
   * firmware updater.
   */
  #followDongle() {
    if (!navigator.usb) return;
    this.#follow?.stop();
    const isHoja = (usb) => USB_FILTERS.some((f) => f.vendorId === usb.vendorId && f.productId === usb.productId)
      && !isPicoBootloader(usb) && !isCh340(usb);
    const onConnect = async (e) => {
      if (!isHoja(e.device)) return;
      stop();
      // A controller that has only just joined may not answer straight away: try a few times.
      for (let attempt = 0; attempt < 3 && this.state === 'disconnected'; attempt++) {
        await new Promise((r) => setTimeout(r, attempt ? 1000 : 300));
        if (this.state !== 'disconnected') return;
        try { await this.reconnect(e.device); return; } catch (err) { console.warn('[session] dongle reconnect failed', err?.message || err); }
      }
    };
    const stop = () => {
      navigator.usb.removeEventListener('connect', onConnect);
      clearTimeout(timer);
      if (this.#follow === follow) this.#follow = null;
    };
    const timer = setTimeout(stop, DONGLE_FOLLOW_MS);
    const follow = { stop };
    this.#follow = follow;
    navigator.usb.addEventListener('connect', onConnect);
  }

  /**
   * Push a config block to the controller (debounced so sliders don't flood USB) and mark it unsaved.
   * @param {string} block config block name, e.g. 'haptic'
   * @param {{ immediate?: boolean }} [opts]
   * @returns {Promise<void>} resolves when the write has been sent
   */
  commit(block, { immediate = false } = {}) {
    if (!this.connected) return Promise.resolve();
    this.dirty.add(block);
    this.#editedAt.set(block, ++this.#editSeq);
    this.#emit('dirty', { dirty: true, block });

    let entry = this.#pending.get(block);
    if (!entry) {
      entry = {};
      entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
      this.#pending.set(block, entry);
    }
    clearTimeout(this.#timers.get(block));
    const fire = () => {
      this.#timers.delete(block);
      this.#pending.delete(block);
      device.sendBlock(block).then(entry.resolve, entry.reject);
    };
    if (immediate) fire();
    else this.#timers.set(block, setTimeout(fire, WRITE_DEBOUNCE_MS));
    return entry.promise;
  }

  /** Send any debounced writes right now. */
  async flush() {
    const blocks = [...this.#timers.keys()];
    await Promise.all(blocks.map((b) => this.commit(b, { immediate: true })));
  }

  /**
   * Persist everything to flash. Edits made while SAVE_ALL is in flight (it can take seconds) are
   * written after it, so they stay unsaved: only blocks last changed before the save was sent, with
   * no debounced write still waiting, are marked saved.
   */
  async save() {
    await this.flush();
    const sentAt = this.#editSeq;
    const waiting = new Set(this.#timers.keys());
    const ok = await device.save();
    if (ok) {
      for (const b of [...this.dirty]) {
        if (!waiting.has(b) && (this.#editedAt.get(b) ?? 0) <= sentAt) this.dirty.delete(b);
      }
      this.#emit('dirty', { dirty: this.dirty.size > 0 });
      this.#emit('saved', {});
    }
    return ok;
  }

  /** Re-read a config block from the controller (e.g. after a calibration command). */
  async refresh(block) {
    await device.requestBlock(block);
  }

  /** Run a firmware config command: session.command('haptic', 'TEST_STRENGTH', { timeout: 10000 }) */
  command(block, name, { timeout } = {}) {
    return device.sendConfigCommand(block, name, timeout);
  }

  /**
   * Recompute "needs attention" badges (uncalibrated sticks/triggers, baseband updates).
   * Called on connect and whenever a section closes, like hoja2's badgeCheck().
   */
  async refreshAttention() {
    if (!this.connected) return;
    const next = {};
    try {
      await device.requestBlock('analog');
      await device.requestBlock('hover');
    } catch (err) {
      console.warn('[session] attention check skipped', err?.message || err);
      return;
    }
    if (!device.config.hover.hover_calibration_set) next.input = { level: 'warn', text: N_('Analog inputs need calibration') };
    if (this.caps.analog && !device.config.analog.analog_calibration_set) next.joysticks = { level: 'warn', text: N_('Joysticks need calibration') };

    // Without a USB cable the controller can't enter wireless-module update mode: no badge for it.
    if (this.caps.externalBaseband && !this.caps.viaWireless) {
      const { resolveModuleUpdate } = await import('../sections/wireless/channels.js');
      const u = await resolveModuleUpdate(device.static.bluetooth);
      if (u.migrate) next.wireless = { level: 'info', text: N_('Recommended wireless module update') };
      else if (u.available) next.wireless = { level: 'info', text: N_('Wireless module update available') };
    }
    this.attention = next;
    this.#emit('attention', next);
  }
}

export const session = new Session();
