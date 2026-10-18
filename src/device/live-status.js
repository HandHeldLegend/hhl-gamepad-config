/**
 * live-status.js: The controller's live state for the Home hub, from GAMEPAD_CMD_STATUS, and the two
 * quick settings that go with it (HOLD_INPUTS, TOURNEY). No DOM.
 *
 *   liveStatus.supported     null until the first STATUS, then whether this firmware answers it
 *   liveStatus.state         { transport, mode, held, tourney, rate } from the last STATUS, or null
 *   liveStatus.on(fn)        called after every STATUS (and on disconnect); returns unsubscribe
 *   liveStatus.watch()       poll about once a second while a view shows it; returns stop
 *   liveStatus.setHold(on)   the game's input held at rest (true) or passed through (false)
 *   liveStatus.setTourney(on) the tournament lock
 *   liveStatus.release()     let the game have the input again (before a requested disconnect)
 *
 * Over USB (and through the dongle) the game's input is held as soon as the app connects: the game is on this
 * computer then, and presses while setting things up would land in it. Over Bluetooth the controller is usually
 * playing on something else, so its input passes through until the owner turns it off.
 *
 * STATUS replies [transport (gamepad_transport_t)][mode (core_reportformat_t)][inputs held][tournament lock]
 * [reports a second to the host, u16 LE], the rate measured since the previous STATUS. The hold is RAM only
 * and the firmware lets go by itself when the app's transport changes or after 5 s without hearing from the
 * app, so while it is on this keeps asking for STATUS every 2 s, whatever page is open; the page going away
 * and Disconnect release it straight away.
 */
import { device } from './hoja-device.js';

const POLL_MS = 1000;      // while a view shows the status
const KEEPALIVE_MS = 2000; // while the game's input is held, on any page
const REPLY_MS = 1000;

class LiveStatus extends EventTarget {
  supported = null;
  state = null;
  #watchers = 0;
  #timer = 0;
  #polling = false;
  #holdOnConnect = false; // hold the game's input once this connection's first STATUS arrives

  constructor() {
    super();
    device.addEventListener('connect', () => {
      this.#reset();
      this.#holdOnConnect = device.transport !== 'ble';
      this.#schedule(0);
    });
    device.addEventListener('disconnect', () => { this.#reset(); this.#emit(); });
    if (typeof window !== 'undefined') {
      // Best effort: the firmware also lets go after 5 s of silence or when the transport changes
      window.addEventListener('pagehide', () => {
        if (this.state?.held && device.isConnected) device.sendConfigCommand('gamepad', 'HOLD_INPUTS', 300, 0).catch(() => {});
      });
    }
  }

  on(fn) {
    const handler = () => fn(this);
    this.addEventListener('change', handler);
    return () => this.removeEventListener('change', handler);
  }

  #emit() { this.dispatchEvent(new CustomEvent('change')); }

  #reset() {
    clearTimeout(this.#timer);
    this.#timer = 0;
    this.supported = null;
    this.state = null;
  }

  /** Poll about once a second while the returned stop() hasn't been called. */
  watch() {
    this.#watchers++;
    this.#schedule(0);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.#watchers--;
    };
  }

  #schedule(ms) {
    clearTimeout(this.#timer);
    this.#timer = 0;
    if (!device.isConnected || this.supported === false) return;
    this.#timer = setTimeout(() => this.poll(), ms);
  }

  /** The next STATUS: every second while watched, every 2 s while the input is held, else none. */
  #next() {
    const every = this.#watchers ? POLL_MS : this.state?.held ? KEEPALIVE_MS : 0;
    if (every) this.#schedule(every);
  }

  /** Ask for STATUS now. */
  async poll() {
    clearTimeout(this.#timer);
    this.#timer = 0;
    if (this.#polling || !device.isConnected) return;
    this.#polling = true;
    try {
      const { status, data } = await device.sendConfigCommand('gamepad', 'STATUS', REPLY_MS);
      if (!device.isConnected) return;
      if (status && data?.length >= 6) {
        const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
        this.supported = true;
        this.state = { transport: v.getInt8(0), mode: v.getInt8(1), held: !!v.getUint8(2), tourney: !!v.getUint8(3), rate: v.getUint16(4, true) };
      } else if (this.supported === null) {
        this.supported = false; // older firmware: no hub items that need STATUS
      }
      this.#emit();
    } catch (err) {
      console.warn('[status] STATUS failed', err?.message || err);
    } finally {
      this.#polling = false;
    }
    if (this.#holdOnConnect && this.supported !== null) {
      this.#holdOnConnect = false;
      if (this.supported && !this.state?.held) {
        this.setHold(true).catch(() => {});
        return; // setHold polls again, even when the command fails, and schedules from there
      }
    }
    this.#next();
  }

  async #command(name, on) {
    try {
      const { status } = await device.sendConfigCommand('gamepad', name, REPLY_MS, on ? 1 : 0);
      return status;
    } finally {
      await this.poll(); // the real state, whatever happened (and polling carries on from there)
    }
  }

  setHold(on) { return this.#command('HOLD_INPUTS', on); }

  setTourney(on) { return this.#command('TOURNEY', on); }

  /** Before a requested disconnect: the game gets its input back now, not 5 s later. */
  async release() {
    if (!this.state?.held || !device.isConnected) return;
    try { await device.sendConfigCommand('gamepad', 'HOLD_INPUTS', 500, 0); } catch { /* the firmware lets go anyway */ }
  }
}

export const liveStatus = new LiveStatus();
