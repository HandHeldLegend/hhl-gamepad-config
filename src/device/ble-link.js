/**
 * ble-link.js: The config protocol over Bluetooth LE (Web Bluetooth), for a controller running wirelessly.
 *
 * The controller (HOJA-LIB-RP2040 hal/rp2040/ble_config.c) carries exactly the 64-byte packets of the WebUSB
 * config interface, wrapped in frames: [type][payload]. The app writes frames to one characteristic and the
 * controller notifies on another:
 *
 *   app → controller   0x01 AUTH [token 16]    0x02 PAIR (ask for a code)    0x03 DATA [one WebUSB packet]
 *                      0x04 BYE: the app is done, the controller closes the link itself
 *                      0x05 PING: every 2 s while the session is open. Start + Select during a session starts
 *                           afresh only when the app went quiet for 5 s (a link the computer kept open), so a
 *                           live session survives the buttons being pressed
 *   controller → app   0x81 AUTH result [0 allowed, 1 refused]
 *                      0x82 CODE [six letters: A B X Y as printed on the face buttons, U D L R for the d-pad]
 *                      0x83 CODE_STATE [presses entered][0 entering, 1 wrong (a new code follows), 2 timed out]
 *                      0x84 PAIRED [token 16]: this browser is allowed from now on
 *                      0x85 DATA [one WebUSB packet]    0x86 INPUT [live input report; newest wins, may drop]
 *                      0x87 LINK [interval, latency, ATT MTU, LL tx octets: u16 LE each][tx PHY][rx PHY], once
 *                           the app is allowed in and whenever they change (kept as linkInfo, for debugging)
 *
 * DATA is only accepted once the browser is allowed: a token it was given before (AUTH), or a code entered on
 * the controller (PAIR). Tokens are kept per browser in localStorage, keyed by BluetoothDevice.id.
 *
 * BYE goes out whenever the app ends a session on purpose (close(), and the page going away): after the
 * browser lets go, Windows often keeps the LE link open, so the controller would never see a disconnect
 * and couldn't advertise again.
 *
 * Connecting again in the same page (Chrome hands back the same BluetoothDevice every time):
 *   - Chrome keeps the page's notification session across a disconnect, and startNotifications() on the next
 *     connection then resolves without writing the controller's CCCD, so the controller can't notify and
 *     nothing ever answers (only a page reload cleared it). open() stops notifications before starting them,
 *     and close() stops them before BYE.
 *   - Every connection fetches the service and characteristics again; nothing from an earlier one is kept.
 *   - A connection left over from an earlier session is let go first, a connect that fails right after a
 *     disconnect is tried again, and close() always disconnects (that also cancels a connect under way).
 *   - 'gattserverdisconnected' stays on the device object: an event that arrives while the device is
 *     connected again belongs to an earlier connection and is ignored.
 *
 * The controller's Start and Select pressed together (Plus and Minus on some boards) make it visible for
 * 10 seconds. A controller this site was
 * allowed on before (rememberedBluetoothControllers) can then be connected without the browser's chooser;
 * a new one comes from the chooser (requestBluetoothController), which has to be opened from a click.
 *
 * Events (CustomEvent; read `event.detail`):
 *   'report'      DataView          a packet from the controller (DATA or INPUT), as from the WebUSB IN endpoint
 *   'code'        { letters }       a code to enter on the controller (a new one after a wrong press)
 *   'code-state'  { entered, state } progress: state 'entering' | 'wrong' | 'timeout'
 *   'paired'      {}                the code was entered: the token is stored, DATA is accepted
 *   'link-info'   linkInfo          the controller's connection parameters (0x87)
 *   'gone'        {}                the link dropped (out of range, controller off, or close())
 */

export const BLE_SERVICE = 'b4c1f0a0-3e6d-4c5a-9f2e-6d1a7c8b9e10';
const BLE_TO_PAD = 'b4c1f0a0-3e6d-4c5a-9f2e-6d1a7c8b9e11';
const BLE_TO_APP = 'b4c1f0a0-3e6d-4c5a-9f2e-6d1a7c8b9e12';

const FRAME = {
  AUTH: 0x01,
  PAIR: 0x02,
  DATA: 0x03,
  BYE: 0x04,
  PING: 0x05,
  AUTH_RESULT: 0x81,
  CODE: 0x82,
  CODE_STATE: 0x83,
  PAIRED: 0x84,
  DATA_IN: 0x85,
  INPUT: 0x86,
  LINK: 0x87,
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
/** close() waits this long for notifications to stop and BYE to go out before it disconnects. */
const STOP_WAIT_MS = 300;
const BYE_WAIT_MS = 500;
/** While allowed in: PING this often, so the controller knows the app is still there. */
const PING_EVERY_MS = 2000;
/** Connect tries: a failure right after a disconnect is common; wait a little longer each time. */
const CONNECT_TRIES = 3;
const CONNECT_RETRY_MS = 400;
/** Let go of a connection left over from an earlier session, then wait this long. */
const STALE_SETTLE_MS = 300;

/** The newest link per BluetoothDevice: a late disconnect from an older one must not end it. */
const newestLink = new WeakMap();
/** Links that are open: told BYE when the page goes away. */
const openLinks = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { for (const l of openLinks) l.sayBye(); });
}

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
  #inFlight = 0;    // writes queued or under way
  #pingTimer = 0;

  /** @param {BluetoothDevice} bt from requestBluetoothController() */
  constructor(bt) {
    super();
    this.#bt = bt;
  }

  get name() { return this.#bt.name || ''; }
  /** The browser's id for this controller (BluetoothDevice.id). */
  get id() { return this.#bt.id; }
  /** The last 0x87 LINK frame: { interval, latency, mtu, txOctets, txPhy, rxPhy } as sent, or null. */
  linkInfo = null;
  get isOpen() { return !this.#closed && !!this.#bt.gatt?.connected; }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /**
   * Connect and subscribe to the controller's notifications (before anything is sent). `connectTimeout`:
   * how long to try reaching it (short when looking for a remembered controller that may not be visible).
   */
  async open({ connectTimeout = CONNECT_TIMEOUT_MS } = {}) {
    const previous = newestLink.get(this.#bt);
    newestLink.set(this.#bt, this);
    const until = performance.now() + connectTimeout;
    try {
      // Connected without an open link: left over from an earlier session (or a page that went away)
      if (this.#bt.gatt.connected && !previous?.isOpen) {
        console.warn('[ble] letting go of a connection left from before');
        this.#bt.gatt.disconnect();
        await sleep(STALE_SETTLE_MS);
      }
      for (let attempt = 1; ; attempt++) {
        try {
          await this.#connect(until - performance.now());
          break;
        } catch (err) {
          console.warn(`[ble] connect try ${attempt} failed: ${err?.name}: ${err?.message}`);
          const wait = CONNECT_RETRY_MS * attempt;
          if (this.#closed || attempt >= CONNECT_TRIES || until - performance.now() < wait + 500) throw err;
          this.#dropCharacteristics();
          try { this.#bt.gatt.disconnect(); } catch { /* not connected */ }
          await sleep(wait);
          if (this.#closed) throw err;
        }
      }
      if (this.#closed) throw new Error('Bluetooth link closed');
      this.#bt.addEventListener('gattserverdisconnected', this.#onDisconnected);
      openLinks.add(this);
    } catch (err) {
      this.close();
      throw err;
    }
  }

  /** One connection, from scratch: the service and characteristics are fetched again every time. */
  async #connect(timeLeft) {
    if (timeLeft <= 0) throw new Error('Connecting over Bluetooth timed out');
    const gatt = await withTimeout(this.#bt.gatt.connect(), timeLeft, 'Connecting over Bluetooth');
    const service = await withTimeout(gatt.getPrimaryService(BLE_SERVICE), STEP_TIMEOUT_MS, 'Finding the config service');
    this.#toPad = await withTimeout(service.getCharacteristic(BLE_TO_PAD), STEP_TIMEOUT_MS, 'Finding the config service');
    this.#toApp = await withTimeout(service.getCharacteristic(BLE_TO_APP), STEP_TIMEOUT_MS, 'Finding the config service');
    this.#toApp.addEventListener('characteristicvaluechanged', this.#onNotify);
    // Chrome keeps the page's notification session across a disconnect, and starting it again would then
    // skip writing the controller's CCCD: stop first, so starting really subscribes on this connection
    try {
      await withTimeout(this.#toApp.stopNotifications(), STEP_TIMEOUT_MS, 'Stopping notifications');
    } catch (err) {
      console.warn(`[ble] stopping old notifications failed (fine): ${err?.name}: ${err?.message}`);
    }
    await withTimeout(this.#toApp.startNotifications(), STEP_TIMEOUT_MS, 'Starting notifications');
  }

  #dropCharacteristics() {
    this.#toApp?.removeEventListener('characteristicvaluechanged', this.#onNotify);
    this.#toApp = null;
    this.#toPad = null;
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
    if (result[0] === 0) { this.#startPing(); return true; }
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

  /**
   * End the session on purpose: stop notifications (so the page keeps no session for the next connection),
   * BYE (so the controller closes the link itself), then disconnect, each with a short time limit. Always
   * disconnects, connected or not: that also cancels a connect still under way. 'gone' follows at once.
   */
  close() {
    const gatt = this.#bt.gatt;
    const toApp = this.#toApp;
    const goodbye = this.#closed ? null : this.#writes.then(async () => {
      if (!gatt?.connected) return;
      if (toApp) await withTimeout(toApp.stopNotifications(), STOP_WAIT_MS, 'Stopping notifications').catch(() => {});
      const bye = this.#writeBye();
      if (bye) await withTimeout(bye, BYE_WAIT_MS, 'Saying goodbye').catch(() => {});
    });
    this.#onGone();
    const disconnect = () => {
      // A newer link to this controller may have started by now: leave it
      if (newestLink.get(this.#bt) !== this) return;
      try { gatt?.disconnect(); } catch { /* already gone */ }
    };
    if (goodbye) goodbye.finally(disconnect);
    else disconnect();
  }

  /** The page is going away: BYE now, best effort, nothing awaited (the browser drops the link itself). */
  sayBye() {
    try { this.#writeBye()?.catch(() => {}); } catch { /* best effort */ }
  }

  #writeBye() {
    const c = this.#toPad;
    if (!c || !this.#bt.gatt?.connected) return null;
    const frame = new Uint8Array([FRAME.BYE]);
    return c.writeValueWithResponse ? c.writeValueWithResponse(frame) : c.writeValue(frame);
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
    this.#inFlight++;
    const run = this.#writes.then(() => this.#writeNow(frame)).finally(() => { this.#inFlight--; });
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
    if (this.#closed) return;
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
        this.#startPing();
        this.#emit('paired', {});
        return;
      case FRAME.LINK: {
        if (payload.length < 10) return;
        const v16 = (i) => payload[i] | (payload[i + 1] << 8);
        this.linkInfo = { interval: v16(0), latency: v16(2), mtu: v16(4), txOctets: v16(6), txPhy: payload[8], rxPhy: payload[9] };
        this.#emit('link-info', this.linkInfo);
        return;
      }
      default:
    }
  };

  /** The device reported a disconnect. One that arrives while it is connected again is an earlier connection's. */
  #onDisconnected = () => {
    if (this.#bt.gatt?.connected) return;
    console.warn('[ble] the controller disconnected');
    this.#onGone();
  };

  /** PING every PING_EVERY_MS until the link closes; a tick with a write still going is skipped. */
  #startPing() {
    if (this.#pingTimer || this.#closed) return;
    this.#pingTimer = setInterval(() => {
      if (this.#closed || this.#inFlight) return;
      this.#write(new Uint8Array([FRAME.PING])).catch(() => {});
    }, PING_EVERY_MS);
  }

  #onGone = () => {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#pingTimer);
    openLinks.delete(this);
    this.#bt.removeEventListener('gattserverdisconnected', this.#onDisconnected);
    this.#toApp?.removeEventListener('characteristicvaluechanged', this.#onNotify);
    for (const waiting of this.#waiters.values()) waiting.forEach((resolve) => resolve(null));
    this.#waiters.clear();
    this.#emit('gone', {});
  };
}
