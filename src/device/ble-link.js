/**
 * ble-link.js: The config protocol over Bluetooth LE (Web Bluetooth), for a controller running wirelessly.
 *
 * The controller (HOJA-LIB-RP2040 hal/rp2040/ble_config.c) carries exactly the 64-byte packets of the WebUSB
 * config interface, wrapped in frames: [type][payload]. The app writes frames to one characteristic and the
 * controller notifies on another:
 *
 *   app → controller   0x01 AUTH [token 16]    0x02 PAIR (ask for a code)    0x03 DATA [one WebUSB packet]
 *   controller → app   0x81 AUTH result [0 allowed, 1 refused]
 *                      0x82 CODE [six letters: A B X Y as printed on the face buttons, U D L R for the d-pad]
 *                      0x83 CODE_STATE [presses entered][0 entering, 1 wrong (a new code follows), 2 timed out]
 *                      0x84 PAIRED [token 16]: this browser is allowed from now on
 *                      0x85 DATA [one WebUSB packet]    0x86 INPUT [live input report; newest wins, may drop]
 *
 * DATA is only accepted once the browser is allowed: a token it was given before (AUTH), or a code entered on
 * the controller (PAIR). Tokens are kept per browser in localStorage, keyed by BluetoothDevice.id.
 *
 * Plus and Minus pressed together make the controller visible for 10 seconds. A controller this site was
 * allowed on before (rememberedBluetoothControllers) can then be connected without the browser's chooser;
 * a new one comes from the chooser (requestBluetoothController), which has to be opened from a click.
 *
 * Events (CustomEvent; read `event.detail`):
 *   'report'      DataView          a packet from the controller (DATA or INPUT), as from the WebUSB IN endpoint
 *   'code'        { letters }       a code to enter on the controller (a new one after a wrong press)
 *   'code-state'  { entered, state } progress: state 'entering' | 'wrong' | 'timeout'
 *   'paired'      {}                the code was entered: the token is stored, DATA is accepted
 *   'gone'        {}                the link dropped (out of range, controller off, or close())
 */

export const BLE_SERVICE = 'b4c1f0a0-3e6d-4c5a-9f2e-6d1a7c8b9e10';
const BLE_TO_PAD = 'b4c1f0a0-3e6d-4c5a-9f2e-6d1a7c8b9e11';
const BLE_TO_APP = 'b4c1f0a0-3e6d-4c5a-9f2e-6d1a7c8b9e12';

const FRAME = {
  AUTH: 0x01,
  PAIR: 0x02,
  DATA: 0x03,
  AUTH_RESULT: 0x81,
  CODE: 0x82,
  CODE_STATE: 0x83,
  PAIRED: 0x84,
  DATA_IN: 0x85,
  INPUT: 0x86,
};

const CODE_STATES = ['entering', 'wrong', 'timeout'];
const TOKEN_LEN = 16;
const TOKENS_KEY = 'hhl-config:ble-tokens';

/** Time limits: the GATT connection (the controller may have stopped advertising), each later step, an answer. */
const CONNECT_TIMEOUT_MS = 15000;
const STEP_TIMEOUT_MS = 5000;
const ANSWER_TIMEOUT_MS = 4000;
/** A write the controller refused because its receive queue was full is tried again this often. */
const WRITE_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reject when `promise` hasn't settled within `ms`. */
function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); })])
    .finally(() => clearTimeout(timer));
}

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => (typeof hex === 'string' && /^[0-9a-f]{32}$/.test(hex)
  ? Uint8Array.from(hex.match(/../g), (x) => parseInt(x, 16)) : null);

function loadTokens() {
  try {
    const v = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; } // private mode, storage blocked
}

function saveToken(id, token) {
  const all = loadTokens();
  if (token) all[id] = toHex(token);
  else delete all[id];
  try { localStorage.setItem(TOKENS_KEY, JSON.stringify(all)); } catch { /* storage blocked: pair again next time */ }
}

/**
 * Open the browser's Bluetooth chooser, listing controllers that offer the config app. Call it straight
 * from a click (the browser requires that). Resolves a BluetoothDevice, or null when the chooser was closed.
 */
export async function requestBluetoothController() {
  try {
    return await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE] }] });
  } catch (err) {
    // Chrome reports a closed chooser and a missing adapter both as NotFoundError
    if (err?.name === 'NotFoundError' && /cancel/i.test(err.message || '')) return null;
    throw err;
  }
}

/**
 * Controllers this site was allowed on before, where the browser can list them (getDevices is newer than
 * the rest of Web Bluetooth). Resolves [] where it can't.
 */
export async function rememberedBluetoothControllers() {
  try {
    return (await navigator.bluetooth?.getDevices?.()) || [];
  } catch {
    return [];
  }
}

export class BleLink extends EventTarget {
  /** @type {BluetoothDevice} */
  #bt;
  #toPad = null;
  #toApp = null;
  #writes = Promise.resolve(); // Web Bluetooth runs one GATT operation at a time: writes queue here
  #waiters = new Map();        // frame type → [resolve] waiting for its next frame
  #closed = false;

  /** @param {BluetoothDevice} bt from requestBluetoothController() */
  constructor(bt) {
    super();
    this.#bt = bt;
  }

  get name() { return this.#bt.name || ''; }
  get isOpen() { return !this.#closed && !!this.#bt.gatt?.connected; }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /**
   * Connect and subscribe to the controller's notifications (before anything is sent). `connectTimeout`:
   * how long to try reaching it (short when looking for a remembered controller that may not be visible).
   */
  async open({ connectTimeout = CONNECT_TIMEOUT_MS } = {}) {
    this.#bt.addEventListener('gattserverdisconnected', this.#onGone);
    try {
      const gatt = await withTimeout(this.#bt.gatt.connect(), connectTimeout, 'Connecting over Bluetooth');
      const service = await withTimeout(gatt.getPrimaryService(BLE_SERVICE), STEP_TIMEOUT_MS, 'Finding the config service');
      this.#toPad = await withTimeout(service.getCharacteristic(BLE_TO_PAD), STEP_TIMEOUT_MS, 'Finding the config service');
      this.#toApp = await withTimeout(service.getCharacteristic(BLE_TO_APP), STEP_TIMEOUT_MS, 'Finding the config service');
      this.#toApp.addEventListener('characteristicvaluechanged', this.#onNotify);
      await withTimeout(this.#toApp.startNotifications(), STEP_TIMEOUT_MS, 'Starting notifications');
    } catch (err) {
      this.close();
      throw err;
    }
  }

  /**
   * Show the controller this browser's token, if it has one for it. Resolves true when allowed; false
   * without a token or when the controller no longer knows it (then it is forgotten here too).
   */
  async authorize() {
    const token = fromHex(loadTokens()[this.#bt.id]);
    if (!token) return false;
    const frame = new Uint8Array(1 + TOKEN_LEN);
    frame[0] = FRAME.AUTH;
    frame.set(token, 1);
    const answer = this.#next(FRAME.AUTH_RESULT);
    await this.#write(frame);
    const result = await withTimeout(answer, ANSWER_TIMEOUT_MS, 'Waiting for the controller');
    if (!result) throw new Error('The Bluetooth link dropped');
    if (result[0] === 0) return true;
    saveToken(this.#bt.id, null);
    return false;
  }

  /**
   * Ask for a code to enter on the controller (again after a time-out). Resolves once it arrived ('code'
   * event); 'code-state' follows each press and 'paired' the last one.
   */
  async requestCode() {
    const code = this.#next(FRAME.CODE);
    await this.#write(new Uint8Array([FRAME.PAIR]));
    if (!(await withTimeout(code, ANSWER_TIMEOUT_MS, 'Waiting for the controller'))) throw new Error('The Bluetooth link dropped');
  }

  /** Send one WebUSB packet (≤ 64 bytes). Resolves once the controller took it. */
  send(bytes) {
    const frame = new Uint8Array(1 + bytes.length);
    frame[0] = FRAME.DATA;
    frame.set(bytes, 1);
    return this.#write(frame);
  }

  /** Drop the link. 'gone' follows. */
  close() {
    if (this.#bt.gatt?.connected) {
      try { this.#bt.gatt.disconnect(); } catch { /* already gone */ }
    }
    this.#onGone();
  }

  /** The payload of the next frame of `type` (null if the link drops first). Ask before sending what it answers. */
  #next(type) {
    return new Promise((resolve) => {
      if (this.#closed) { resolve(null); return; }
      if (!this.#waiters.has(type)) this.#waiters.set(type, []);
      this.#waiters.get(type).push(resolve);
    });
  }

  #write(frame) {
    const run = this.#writes.then(() => this.#writeNow(frame));
    this.#writes = run.catch(() => {});
    return run;
  }

  async #writeNow(frame) {
    for (let attempt = 0; ; attempt++) {
      if (this.#closed || !this.#toPad) throw new Error('Not connected over Bluetooth');
      try {
        const c = this.#toPad;
        return await withTimeout(c.writeValueWithResponse ? c.writeValueWithResponse(frame) : c.writeValue(frame),
          STEP_TIMEOUT_MS, 'Sending over Bluetooth');
      } catch (err) {
        // Its receive queue full, the controller refuses a write until it caught up: try again shortly
        if (attempt >= WRITE_RETRIES || this.#closed) throw err;
        await sleep(30 * (attempt + 1));
      }
    }
  }

  #onNotify = (event) => {
    const v = event.target.value;
    if (!v || v.byteLength < 1) return;
    const type = v.getUint8(0);
    // A copy: the parser keeps slices of report buffers
    const payload = new Uint8Array(v.buffer, v.byteOffset + 1, v.byteLength - 1).slice();

    const waiting = this.#waiters.get(type);
    if (waiting?.length) {
      this.#waiters.delete(type);
      waiting.forEach((resolve) => resolve(payload));
    }

    switch (type) {
      case FRAME.DATA_IN:
      case FRAME.INPUT:
        if (payload.length) this.#emit('report', new DataView(payload.buffer));
        return;
      case FRAME.CODE:
        this.#emit('code', { letters: String.fromCharCode(...payload) });
        return;
      case FRAME.CODE_STATE:
        if (payload.length >= 2) this.#emit('code-state', { entered: payload[0], state: CODE_STATES[payload[1]] || 'entering' });
        return;
      case FRAME.PAIRED:
        if (payload.length >= TOKEN_LEN) saveToken(this.#bt.id, payload.subarray(0, TOKEN_LEN));
        this.#emit('paired', {});
        return;
      default:
    }
  };

  #onGone = () => {
    if (this.#closed) return;
    this.#closed = true;
    this.#bt.removeEventListener('gattserverdisconnected', this.#onGone);
    this.#toApp?.removeEventListener('characteristicvaluechanged', this.#onNotify);
    for (const waiting of this.#waiters.values()) waiting.forEach((resolve) => resolve(null));
    this.#waiters.clear();
    this.#emit('gone', {});
  };
}
