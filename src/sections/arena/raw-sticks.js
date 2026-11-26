/**
 * raw-sticks.js: Stick values from the HOJA USB raw input stream, on a unit scale. No DOM.
 *
 * The raw stream carries each mapper input as 7 bits (value >> 5). A stick direction is a
 * joystick-type input, 0..2048, and the firmware sends it through the remap profile of the running
 * mode (mapper.c, the WebUSB pass):
 *   direction mapped to an output   the value is doubled to the 12-bit output range first, so full
 *                                   deflection reads 127
 *   direction mapped to nothing     the value goes out as it is, so full deflection reads 64
 * Reading a mapped stick on the 64 scale makes it hit the edge at half travel. The scale of each
 * direction is taken from the running mode's profile, and a value above 64 settles it: only the
 * doubled scale can produce one.
 *
 *   const sticks = new RawSticks({ device, session });
 *   const { lx, ly, rx, ry } = sticks.read(report.inputs);   // -1..1, +x right, +y up
 */
import { enumValues } from '../../device/struct.js';
import { MODES, modeForReportFormat } from '../input/mapping.js';

/** Full deflection of a stick direction that is mapped to an output (2048 << 1 >> 5, capped). */
export const RAW_STICK_FULL_MAPPED = 127;
/** Full deflection of a stick direction that is mapped to nothing (2048 >> 5). */
export const RAW_STICK_FULL_UNMAPPED = 64;
/** A value above this can only be on the doubled scale (a little above 64 for an over-travelling stick). */
const PROVES_MAPPED = RAW_STICK_FULL_UNMAPPED + 3;

const code = (name) => enumValues('mapper_input_code_t').find((e) => e.name === `INPUT_CODE_${name}`)?.value ?? -1;
const DIRS = {
  lx: [code('LX_RIGHT'), code('LX_LEFT')], ly: [code('LY_UP'), code('LY_DOWN')],
  rx: [code('RX_RIGHT'), code('RX_LEFT')], ry: [code('RY_UP'), code('RY_DOWN')],
};

/** The remap profile the controller is running: Switch or Steam over USB by its IDs, else its default mode. */
function runningMode(device, session) {
  const usb = device?.usbDevice;
  if (usb?.vendorId === 0x057e && usb?.productId === 0x2009) return MODES.find((m) => m.id === 'switch');
  if (usb?.vendorId === 0x2e8a) return MODES.find((m) => m.id === 'sinput');
  const id = modeForReportFormat(session?.config?.gamepad?.gamepad_default_mode);
  return MODES.find((m) => m.id === id);
}

/** Whether the profile maps this input to an output the firmware knows (mapper.c: 0 <= code < MAX). */
export function isMapped(slot, enumName) {
  const out = slot?.output_code;
  if (typeof out !== 'number') return true; // profile not read: the defaults map every direction
  const max = enumValues(enumName).find((e) => /_CODE_MAX$/.test(e.name))?.value;
  return out >= 0 && (max == null || out < max);
}

export class RawSticks {
  /** @param {{device?: any, session?: any}} o */
  constructor({ device, session } = {}) {
    this.device = device;
    this.session = session;
    this.proven = new Set(); // direction codes seen above the undoubled scale
  }

  /** Full-scale value of one direction code right now. */
  full(dir) {
    if (this.proven.has(dir)) return RAW_STICK_FULL_MAPPED;
    const mode = runningMode(this.device, this.session);
    let slot = null;
    try { slot = mode ? this.session?.config?.input?.[mode.profile]?.[dir] : null; } catch { /* not read */ }
    return !mode || isMapped(slot, mode.enumName) ? RAW_STICK_FULL_MAPPED : RAW_STICK_FULL_UNMAPPED;
  }

  /** One direction, 0..1. */
  unit(inputs, dir) {
    const v = inputs?.[dir]?.value ?? 0;
    if (v > PROVES_MAPPED) this.proven.add(dir);
    return Math.min(1, v / this.full(dir));
  }

  /** Both sticks from one raw report: {lx, ly, rx, ry}, -1..1, +x right, +y up. */
  read(inputs) {
    const axis = ([pos, neg]) => this.unit(inputs, pos) - this.unit(inputs, neg);
    return { lx: axis(DIRS.lx), ly: axis(DIRS.ly), rx: axis(DIRS.rx), ry: axis(DIRS.ry) };
  }
}
