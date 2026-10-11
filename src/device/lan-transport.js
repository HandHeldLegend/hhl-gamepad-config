/**
 * lan-transport.js: The controller through HHL Gamepad WLAN, the Windows app that keeps a gamepad open over
 * the home network (the gamepad joins the network set on the Wireless page, Home WLAN).
 *
 * HHL Gamepad WLAN runs a small server on this PC (LAN_ORIGIN):
 *   GET /pads       JSON array of the gamepads it has open: [{ id, name, title, mode }]
 *                   (title: the player name or model; mode: the output mode, e.g. "SInput")
 *   WS  /pad/<id>   one binary message per 64-byte WebUSB packet, each way: exactly the bytes this app
 *                   would send with transferOut, and the ones it would receive with transferIn.
 *                   Refused (HTTP 409) when that gamepad isn't open; closes when the gamepad goes away.
 *
 * LanTransport puts that socket behind the part of the USBDevice interface hoja-device.js uses, so the
 * driver and the session work unchanged. It fires 'close' once the socket has closed. The firmware
 * refuses updates and the bootloader over this link, as through the WLAN dongle (session.caps.viaLan).
 *
 * Chromium browsers gate requests to this PC behind a Local Network Access permission: the first one
 * asks ("access other apps and services on this device"). Connect only asks HHL Gamepad WLAN once
 * lanPermission() is 'granted'; the Home WLAN card explains the prompt and makes that first request.
 */

export const LAN_ORIGIN = 'http://127.0.0.1:51702';
/** Where HHL Gamepad WLAN is downloaded (Windows). */
export const LAN_APP_URL = 'https://github.com/HandHeldLegend/hhl-gamepad-wlan/releases/latest';

/**
 * Chromium's permission names for requests to this PC: newer versions split Local Network Access into
 * 'loopback-network' (this PC, what we need) and 'local-network'; earlier ones had one 'local-network-access'.
 * Browsers disagree on which one they mean: Brave reports 'loopback-network' as denied while
 * 'local-network-access' can still prompt (Brave asks through its own Localhost access setting).
 */
const LAN_PERMISSIONS = ['loopback-network', 'local-network-access', 'local-network'];

/** Set once HHL Gamepad WLAN answered this browser, so the page knows it is allowed (see lanPermission). */
const REACHED_KEY = 'hhl-lan-reached';
const reachedBefore = () => { try { return localStorage.getItem(REACHED_KEY) === '1'; } catch { return false; } };

/**
 * May this page talk to HHL Gamepad WLAN without a browser prompt?
 * Resolves { state: 'granted' | 'prompt' | 'denied', status } (status: the PermissionStatus to watch for
 * changes, or null). Every name the browser knows is asked: granted if any is granted (or HHL Gamepad
 * WLAN has answered here before, since Brave's own Localhost access setting doesn't show in this API),
 * else 'prompt' if any can still ask, else 'denied'. Browsers that know none don't gate this PC:
 * 'granted'. Neither does a page served from this PC (the dev server), whatever the query says.
 */
export async function lanPermission() {
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return { state: 'granted', status: null };
  const known = [];
  for (const name of LAN_PERMISSIONS) {
    try { known.push(await navigator.permissions.query({ name })); } catch { /* not a permission this browser knows */ }
  }
  if (!known.length) return { state: 'granted', status: null };
  const pick = (state) => known.find((s) => s.state === state);
  const status = pick('granted') || pick('prompt') || known[0];
  return { state: pick('granted') || reachedBefore() ? 'granted' : status.state, status };
}

/**
 * The gamepads HHL Gamepad WLAN has open on this PC. Rejects when HHL Gamepad WLAN can't be reached, or hasn't answered
 * within `timeout` ms (e.g. while the browser's local network prompt is still waiting for an answer).
 */
export async function listLanPads({ timeout } = {}) {
  const res = await fetch(`${LAN_ORIGIN}/pads`, { cache: 'no-store', signal: timeout ? AbortSignal.timeout(timeout) : undefined });
  if (!res.ok) throw new Error(`HHL Gamepad WLAN answered HTTP ${res.status}`);
  const pads = await res.json();
  try { localStorage.setItem(REACHED_KEY, '1'); } catch { /* private mode: asked again next visit */ }
  return Array.isArray(pads) ? pads.filter((p) => typeof p?.id === 'string' && p.id) : [];
}

export class LanTransport extends EventTarget {
  /** @type {WebSocket|null} */
  #socket = null;
  #inbox = [];   // packets that arrived before anyone asked for them
  #waiting = []; // transferIn() calls waiting for a packet: { resolve, reject }
  #closed = false;

  /** @param {{id: string, name?: string, title?: string, mode?: string}} pad an entry from listLanPads() */
  constructor(pad) {
    super();
    this.pad = pad;
  }

  /** Shown while connecting, like a USB device's product name. */
  get productName() { return this.pad.title || this.pad.name || ''; }

  /** Open the socket. Rejects when HHL Gamepad WLAN refuses it (the gamepad isn't open there) or can't be reached. */
  open() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${LAN_ORIGIN.replace(/^http/, 'ws')}/pad/${encodeURIComponent(this.pad.id)}`);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => resolve();
      socket.onmessage = (e) => this.#receive(e.data);
      // Before it opened this is the refusal; afterwards rejecting does nothing.
      socket.onclose = () => { reject(new Error('HHL Gamepad WLAN closed the connection')); this.#onClose(); };
      this.#socket = socket;
    });
  }

  async close() {
    this.#socket?.close();
  }

  // USB setup steps: nothing to do over a socket.
  async selectConfiguration() {}
  async claimInterface() {}
  async clearHalt() {}

  async transferOut(endpoint, data) {
    if (this.#closed || this.#socket?.readyState !== WebSocket.OPEN) throw new Error('HHL Gamepad WLAN connection is closed');
    this.#socket.send(data);
    return { status: 'ok', bytesWritten: data.byteLength };
  }

  /** The next packet from the gamepad, in arrival order. */
  transferIn() {
    if (this.#inbox.length) return Promise.resolve({ status: 'ok', data: this.#inbox.shift() });
    if (this.#closed) return Promise.reject(new Error('HHL Gamepad WLAN connection is closed'));
    return new Promise((resolve, reject) => this.#waiting.push({ resolve, reject }));
  }

  #receive(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return; // text messages aren't part of the protocol
    const view = new DataView(buffer);
    const next = this.#waiting.shift();
    if (next) next.resolve({ status: 'ok', data: view });
    else this.#inbox.push(view);
  }

  #onClose() {
    if (this.#closed) return;
    this.#closed = true;
    // Tell the driver first, so its read loops see the disconnect when their reads fail.
    this.dispatchEvent(new Event('close'));
    for (const w of this.#waiting.splice(0)) w.reject(new Error('HHL Gamepad WLAN connection is closed'));
  }
}
