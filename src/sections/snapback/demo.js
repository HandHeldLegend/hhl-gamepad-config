/**
 * Demo-controller hooks for the "snapback" section (used only with ?demo; see src/device/mock.js).
 *   seed(device)                 adjust device.config / device.static after the base demo data is set
 *   command(block, cmd, device)  return { status, data } to customize a config command's reply,
 *                                or undefined for the default success. May dispatch events on device.
 *
 * The real controller sends an analog dump (0xFA) by itself whenever an axis is flicked to the edge and
 * released; there is no command for it. The demo imitates that: every few seconds it "flicks" the next
 * axis (LX, LY, RX, RY…) and dispatches a 'snapback' event with a 64-byte DataView in the firmware format
 * ([0] 0xFA, [1] axis, [2..63] (value + 2048) >> 4). The simulated rebound respects that stick's current
 * filter mode and cutoff so changing the settings visibly changes the plot.
 *
 * Spring tuning: once armed (springArm), it makes up a stick capture ('spring-capture', 256 samples of
 * x/y at 2 kHz) every couple of seconds of whatever the tuning flow asks for (springHint): releases
 * towards the lit direction (a free spring from the edge; now and then one guided back, which the flow
 * turns away), turnarounds, and thumb moves. Both sticks start with the firmware's built-in tuning.
 */
import { SPRING_DEFAULTS, CAPTURE_PRE } from './spring.js';
const SAMPLE_S = 0.0005;   // 2 kHz analog poll
const SAMPLES = 62;
const INTERVAL_MS = 4000;

let timer = 0;
let axis = 0;
let listening = false;

/** Underdamped spring rebound from ~87 % (where the firmware starts recording), in −1..1. */
function rawRebound(sign) {
  const out = [];
  const f = 42 + Math.random() * 8;      // Hz
  const decay = 85 + Math.random() * 20; // 1/s
  for (let i = 0; i < SAMPLES; i++) {
    const t = i * SAMPLE_S;
    out.push(sign * 0.87 * Math.cos(2 * Math.PI * f * t) * Math.exp(-decay * t));
  }
  return out;
}

/** Rough stand-ins for the firmware filters (snapback_lpf.c / snapback_auto.c). */
function filtered(raw, type, cutoffHz) {
  if (type === 2) return raw; // Off
  if (type === 1) {
    // Auto: once the stick crosses center, hold back the rebound and let it decay in.
    const sign = Math.sign(raw[0]);
    let crossed = false;
    return raw.map((v) => {
      if (Math.sign(v) !== sign) crossed = true;
      return crossed ? v * 0.12 : v;
    });
  }
  // Low-pass (first order) inside the ~88 % filter zone.
  const hz = Math.min(150, Math.max(30, cutoffHz || 60));
  const alpha = 1 - Math.exp(-2 * Math.PI * hz * SAMPLE_S);
  let y = raw[0];
  return raw.map((v) => (y += alpha * (v - y)));
}

// ---- Spring tuning captures ----------------------------------------------------------------------

const CAPTURE_MS = 2100;
let capTimer = 0;
let capStick = null;
let capNumber = 0;
let hint = { step: 'releases', octant: 0 };
let made = 0;

const noise = (n) => (Math.random() * 2 - 1) * n;

/** The demo stick's spring per direction: 52 to 66 Hz, damping 0.2 (a real stick's friction settles it
 *  near the center; a plain spring at the measured 0.13 would ring on longer than one does). */
const DEMO_SPRING = Array.from({ length: 8 }, (_, o) => {
  const hz = 52 + ((o * 5) % 8) * 2;
  const w = 2 * Math.PI * hz;
  const zeta = 0.2;
  const r = Math.exp(-zeta * w * 0.0005);
  return { a1: 2 * r * Math.cos(w * Math.sqrt(1 - zeta * zeta) * 0.0005), a2: -r * r };
});

/** A free spring along one direction, from `s0` (and `s1` a sample later), `n` samples. */
function springPath(o, s0, s1, n) {
  const a1 = DEMO_SPRING[o].a1 * (1 + noise(0.002));
  const a2 = DEMO_SPRING[o].a2;
  const out = [s0, s1];
  while (out.length < n) out.push(a1 * out[out.length - 1] + a2 * out[out.length - 2]);
  return out;
}

/** Positions along a direction → a capture: 48 samples before the fall under 500, 256 in all. */
function toCapture(along, angle, stick) {
  const fall = along.findIndex((v, i) => i > 0 && Math.abs(v) < 500 && Math.abs(along[i - 1]) >= 500);
  const from = Math.max(0, fall - CAPTURE_PRE);
  const seg = along.slice(from, from + 256);
  while (seg.length < 256) seg.push(seg[seg.length - 1] * 0.9);
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const x = Int16Array.from(seg, (v) => Math.round(v * c + noise(4)));
  const y = Int16Array.from(seg, (v) => Math.round(v * s + noise(4)));
  return { stick, number: capNumber++ & 0xff, x, y };
}

const hold = (v, n) => Array(n).fill(v);
const ease = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (1 - Math.cos((Math.PI * (i + 1)) / n)) / 2);

function makeCapture(stick) {
  made++;
  const step = hint.step;
  if (step === 'releases') {
    const o = hint.octant >= 0 ? hint.octant : Math.floor(Math.random() * 8);
    const angle = (o * Math.PI) / 4 + noise(0.25);
    const edge = 1900 + noise(80);
    // Now and then a return guided by the thumb, which the flow turns away
    if (made % 7 === 3) return toCapture([...hold(edge, 80), ...ease(edge, 0, 50), ...hold(0, 200)], angle, stick);
    return toCapture([...hold(edge, 80), ...springPath(o, edge, edge, 300)], angle, stick);
  }
  const o = Math.floor(Math.random() * 8);
  let angle = (o * Math.PI) / 4 + noise(0.3);
  if (step === 'turnarounds') {
    // A partial tilt, let go
    const out = 800 + Math.random() * 600;
    return toCapture([...hold(0, 30), ...ease(0, out, 40), ...hold(out, 30), ...springPath(o, out, out, 300)], angle, stick);
  }
  // Thumb moves: the one asked for (a dash to the other side, a dash back and forth, or a pull back to the
  // center) from the edge asked for
  const edge = 1900 + noise(80);
  if (hint.kind === 'flick') {
    // As fast as a thumb goes (edge to edge in about 15 ms), with the small bounce a real stick gives at the
    // far edge
    if (hint.octant >= 0) angle = (hint.octant * Math.PI) / 4 + noise(0.1);
    const bounce = Array.from({ length: 200 }, (_, i) => -edge + 120 * Math.exp(-i / 12) * Math.sin(i / 3));
    return toCapture([...hold(edge, 80), ...ease(edge, -edge, 44), ...bounce], angle, stick);
  }
  const kind = { across: 0, back: 1, pull: 2 }[hint.kind] ?? made % 3;
  if (hint.octant >= 0) angle = (hint.octant * Math.PI) / 4 + noise(0.15);
  // (each ends held still, as the flow asks)
  if (kind === 0) return toCapture([...hold(edge, 80), ...ease(edge, -edge, 60), ...hold(-edge, 200)], angle, stick);
  if (kind === 1) return toCapture([...hold(edge, 80), ...ease(edge, -edge, 50), ...ease(-edge, edge, 50), ...hold(edge, 150)], angle, stick);
  return toCapture([...hold(edge, 80), ...ease(edge, 0, 80), ...hold(0, 200)], angle, stick);
}

export function springArm(device, stick) {
  clearInterval(capTimer);
  capStick = stick;
  if (stick == null) return;
  capTimer = setInterval(() => {
    if (!device.isConnected) { clearInterval(capTimer); return; }
    device.dispatchEvent(new CustomEvent('spring-capture', { detail: makeCapture(capStick === 'right' ? 1 : 0) }));
  }, CAPTURE_MS);
}

export function springHint(device, h) { hint = h; }

function dump(device) {
  const a = device.config.analog;
  const left = axis < 2;
  const type = left ? a.l_snapback_type : a.r_snapback_type;
  const cutoff = (left ? a.l_snapback_intensity : a.r_snapback_intensity) / 10;
  const sign = Math.random() < 0.5 ? -1 : 1;
  const samples = filtered(rawRebound(sign), type === 3 ? 1 : type > 2 ? 0 : type, cutoff); // 3 runs as Auto

  const buf = new Uint8Array(64);
  buf[0] = 0xfa;
  buf[1] = axis;
  samples.forEach((v, i) => {
    const raw = Math.round(v * 2048 + (Math.random() * 24 - 12)) + 2048;
    buf[2 + i] = Math.max(0, Math.min(255, raw >> 4));
  });
  device.dispatchEvent(new CustomEvent('snapback', { detail: new DataView(buf.buffer) }));
  axis = (axis + 1) % 4;
}

export function seed(device) {
  const a = device.config.analog;
  a.l_snapback_type = 0;
  a.r_snapback_type = 0;
  a.l_snapback_intensity = 600;
  a.r_snapback_intensity = 750;
  // Firmware with the spring model fills in each stick's tuning, not tuned yet (session caps.snapbackSpring)
  for (const key of ['l_spring', 'r_spring']) {
    const sp = a[key];
    if (!sp) continue;
    Object.assign(sp, { version: 1, flags: 0, ...SPRING_DEFAULTS });
    a[key] = sp;
  }

  clearInterval(timer);
  axis = 0;
  timer = setInterval(() => { if (device.isConnected) dump(device); }, INTERVAL_MS);
  if (!listening) {
    listening = true;
    device.addEventListener('disconnect', () => { clearInterval(timer); timer = 0; clearInterval(capTimer); capTimer = 0; });
  }
}

export function command() { return undefined; }
