/**
 * session.js: App-level view of the connected controller.
 *
 * Views should talk to `session` rather than the raw driver for anything stateful:
 *   session.state         'disconnected' | 'connecting' | 'connected' | 'legacy'
 *   session.caps          capability flags derived from the static info blocks (what this build has)
 *   session.info          { name, maker, fwVersion, manifestUrl, firmwareUrl, manualUrl }
 *   session.config.<blk>  live config structs (same objects as device.config)
 *   session.static.<blk>  static info structs
 *   session.commit(blk)   push a block to the device (debounced) and mark it unsaved
 *   session.save()        flush pending writes and commit everything to flash
 *   session.on(evt, fn)   subscribe; returns an unsubscribe function
 *
 * Events: 'state', 'dirty', 'saved', 'attention', 'legacy', 'bootloader'
 *
 * HOJA firmware applies a written block immediately (RAM); "Save" persists it to flash.
 * That's why every change is pushed live and the Save button lights up until committed.
 */
import { device } from './hoja-device.js';
import { decodeText } from './struct.js';
import { N_ } from '../i18n/index.js'; // attention texts are translated where displayed

const WRITE_DEBOUNCE_MS = 120;

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
  return caps;
}

const NO_CAPS = Object.freeze(Object.fromEntries(
  ['analog', 'leftStick', 'rightStick', 'triggers', 'invertAllowed', 'rgb', 'imu', 'haptics', 'hapticHD',
    'battery', 'bluetooth', 'wlan', 'wireless', 'externalBaseband', 'snes', 'joybus', 'wii', 'imuModes', 'imuModeWii', 'flicks'].map((k) => [k, false]),
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
  #timers = new Map();
  #pending = new Map();

  constructor() {
    super();
    device.addEventListener('connect', () => this.#onConnect());
    device.addEventListener('disconnect', () => this.#onDisconnect());
    device.addEventListener('legacy', (e) => { this.#setState('legacy'); this.#emit('legacy', e.detail); });
    device.addEventListener('bootloader', (e) => this.#emit('bootloader', e.detail));
  }

  get config() { return device.config; }
  get static() { return device.static; }
  get connected() { return this.state === 'connected'; }

  on(type, fn) {
    const handler = (e) => fn(e.detail, e);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }

  #emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  #setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.#emit('state', { state });
  }

  /** Open the browser device picker. Resolves true / false / 'bootloader'. */
  async connect() {
    this.#setState('connecting');
    try {
      const result = await device.connect();
      if (result !== true && this.state === 'connecting') this.#setState('disconnected');
      return result;
    } catch (err) {
      this.#setState('disconnected');
      throw err;
    }
  }

  /** Re-open a controller the user already authorized (no picker). */
  async reconnect(usb) {
    this.#setState('connecting');
    try {
      return await device.open(usb);
    } catch (err) {
      this.#setState('disconnected');
      throw err;
    }
  }

  async disconnect() {
    await this.flush().catch(() => {});
    return device.disconnect();
  }

  #onConnect() {
    const s = device.static;
    this.caps = computeCaps(s, device.config);
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

  #onDisconnect() {
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
    this.#pending.clear();
    this.caps = NO_CAPS;
    this.attention = {};
    this.dirty.clear();
    this.#emit('dirty', { dirty: false });
    this.#emit('attention', this.attention);
    this.#setState('disconnected');
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

  /** Persist everything to flash. */
  async save() {
    await this.flush();
    const ok = await device.save();
    if (ok) {
      this.dirty.clear();
      this.#emit('dirty', { dirty: false });
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

    if (this.caps.externalBaseband) {
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
