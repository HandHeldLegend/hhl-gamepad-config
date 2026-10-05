/**
 * input.js: Reads the connected HOJA controller's USB input stream (the same source the Arena's Play
 * tab uses; no other gamepad is ever read). Reuses the Arena's mapper-code table and press latch.
 *
 * The raw stream (device.setInputMode(false)) carries every button, the analog triggers and both sticks
 * at 7 bits per direction (LX_RIGHT/LX_LEFT/… mapper inputs, 0..64 at full deflection). Every report
 * (~125 Hz) is latched, so a tap shorter than one 30 Hz simulation frame is never lost.
 *
 * Default bindings (by the label printed on the controller, from the build's static input info):
 *   jump      A                       attack    B, Y
 *   crouch    ZL / ZR (LT / RT, digital or analog past half) and the right bumper (Z on GameCube-style builds)
 *   camera    left bumper or right-stick press = put the camera behind the hero; right stick orbits
 *   pause     Start                   respawn   Select
 */
import { CODE, RAW_JOYSTICK_FULL, PressLatch } from '../arena/input.js';
import { onInputReport } from '../../device/reports.js';
import { decodeText } from '../../device/struct.js';

export const BUTTONS = ['jump', 'attack', 'crouch', 'camera', 'pause', 'respawn'];

/** Mapper input codes per button. labels: printed face label → mapper code (A/B/X/Y). */
export function defaultBindings(labels = {}) {
  return {
    jump: [labels.A ?? CODE.SOUTH],
    attack: [labels.B ?? CODE.EAST, labels.Y ?? CODE.NORTH],
    crouch: [CODE.LT, CODE.RT, CODE.RB],
    camera: [CODE.LB, CODE.RS],
    pause: [CODE.START],
    respawn: [CODE.SELECT],
  };
}

/** Analog triggers count as crouch past this (0..1). */
const TRIGGER_ON = 0.5;

/** Button states from one raw report. */
export function readButtons(inputs, map) {
  const on = (code) => !!inputs[code]?.pressed;
  const out = {};
  for (const k of BUTTONS) out[k] = map[k].some(on);
  const analog = (code) => (inputs[code]?.value ?? 0) / 127;
  if (analog(CODE.LT_ANALOG) >= TRIGGER_ON || analog(CODE.RT_ANALOG) >= TRIGGER_ON) out.crouch = true;
  return out;
}

/** Both sticks from one raw report, unit scale, +x right, +y up. */
export function readSticks(inputs) {
  const v = (code) => Math.min(1, (inputs[code]?.value ?? 0) / RAW_JOYSTICK_FULL);
  return {
    lx: v(CODE.LX_RIGHT) - v(CODE.LX_LEFT), ly: v(CODE.LY_UP) - v(CODE.LY_DOWN),
    rx: v(CODE.RX_RIGHT) - v(CODE.RX_LEFT), ry: v(CODE.RY_UP) - v(CODE.RY_DOWN),
  };
}

export class PlatformerInput {
  /** @param {{device: any, session: any}} o */
  constructor({ device, session }) {
    this.device = device;
    this.session = session;
    this.labels = readLabels(session);
    this.names = this.labels.names;
    this.map = defaultBindings(this.labels);
    this.latch = new PressLatch(BUTTONS);
    this.inputs = null;
    this.at = 0;
    this.stop = onInputReport(device, (r) => {
      if (r.kind !== 'raw') return;
      this.inputs = r.inputs;
      this.at = performance.now();
      this.latch.sample(readButtons(r.inputs, this.map));
    });
    // Make sure the controller sends the raw stream (buttons + sticks); harmless if it already does.
    try { Promise.resolve(device.setInputMode?.(false)).catch(() => {}); } catch { /* not connected */ }
  }

  /** True while reports are arriving. */
  get live() { return !!this.inputs && performance.now() - this.at < 400; }

  /** Current held state: {lx, ly, rx, ry, jump, attack, crouch, camera, pause, respawn}. */
  poll() {
    if (!this.live) return { lx: 0, ly: 0, rx: 0, ry: 0, ...Object.fromEntries(BUTTONS.map((k) => [k, false])) };
    return { ...readSticks(this.inputs), ...readButtons(this.inputs, this.map) };
  }

  /** Presses since the last call ({jump: n, …}) or {}. */
  takePresses() { return this.latch.take() || {}; }
  clearPresses() { this.latch.clear(); }

  /** The printed name of the first input bound to a button (e.g. "A", "ZR"). */
  label(button) {
    return this.map[button].map((c) => this.names[c]).filter(Boolean);
  }

  destroy() { this.stop?.(); this.stop = null; }
}

/** Printed names from the build's static info: {A: code, B: code, …, names: {code: name}}. */
function readLabels(session) {
  const out = { names: {} };
  const infos = session?.static?.input?.input_info;
  if (!infos) return out;
  for (let code = 0; code < infos.length; code++) {
    let name = '';
    try { name = decodeText(infos[code]?.input_name ?? new Uint8Array()).trim(); } catch { /* ignore */ }
    if (!name) continue;
    out.names[code] = name;
    const key = name.toUpperCase();
    if (['A', 'B', 'X', 'Y'].includes(key) && out[key] == null) out[key] = code;
  }
  return out;
}
