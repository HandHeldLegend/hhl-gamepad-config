/**
 * controller.js: Per-simulation-frame view of the input, with the frame-counting that techniques need.
 *
 * The fighter never looks at raw values directly; it asks questions like "was this a smash?" which
 * are answered here, once per 60 Hz frame, exactly like a game reads a controller once per frame.
 *
 * Smash detection: each axis side has an "entry frame": the frame the stick left neutral on that
 * side (|v| ≥ STICK.NEUTRAL). When the stick first reaches the smash threshold we record the latency
 * (frames since entry). Latency 0 = reached the threshold on the very frame it left neutral
 * ("frame-perfect"), 1 = it was seen once in the tilt zone, ≥ 2 = too slow, reads as a tilt.
 */
import { STICK, TRIGGER } from './constants.js';

/** Tracks one axis (x or y) for side changes and threshold reach latency. */
class AxisTrack {
  constructor(thresholds) {
    this.thresholds = thresholds;
    this.side = 0;          // −1, 0, +1
    this.enter = 0;         // frame the current side was entered
    this.reached = new Set();
    this.events = new Map(); // threshold → latency, only on the frame it was first reached
  }

  update(v, frame) {
    const side = Math.abs(v) >= STICK.NEUTRAL ? Math.sign(v) : 0;
    if (side !== this.side) {
      this.side = side;
      this.enter = frame;
      this.reached.clear();
    }
    this.events.clear();
    if (!side) return;
    for (const th of this.thresholds) {
      if (Math.abs(v) >= th && !this.reached.has(th)) {
        this.reached.add(th);
        this.events.set(th, frame - this.enter);
      }
    }
  }

  /** Latency (frames) if `th` was first reached on this frame, else -1. */
  reach(th) { return this.events.has(th) ? this.events.get(th) : -1; }
  /** Frames spent on the current side (0 on the entry frame). */
  framesOnSide(frame) { return this.side ? frame - this.enter : -1; }
}

const BUTTONS = ['attack', 'special', 'jump', 'z', 'shield'];

export class PadState {
  constructor() {
    this.frame = 0;
    this.x = 0; this.y = 0; this.cx = 0; this.cy = 0;
    this.rawMag = 0;
    this.trigger = 0;
    this.held = {}; this.pressed = {}; this.heldFrames = {};
    for (const b of BUTTONS) { this.held[b] = false; this.pressed[b] = false; this.heldFrames[b] = 0; }
    this.ax = new AxisTrack([STICK.SMASH_X]);
    this.ay = new AxisTrack([STICK.SMASH_Y, Math.abs(STICK.SHIELD_DOWN_Y)]);
    this.prevShieldHeld = false;
    this.prevC = 0;
    this.cDir = null;
    this.any = false;
    this.lastSmash = null;
    /** Frames after a smash flick in which A still makes a smash attack (the game adds its input buffer). */
    this.smashWindow = STICK.SMASH_ATTACK;
  }

  /**
   * Feed one input snapshot (from InputManager) for the next simulation frame.
   * s.presses (optional): press edges latched since the previous frame ({jump: 1, trig: 1, …}); a press
   * counts even if the button was already released again by the time this frame samples it.
   */
  update(s) {
    const latched = s.presses || {};
    const f = ++this.frame;
    // Game-side clamp: anything beyond the unit circle is pulled back onto it (like a real game).
    const m = Math.hypot(s.lx, s.ly);
    this.rawMag = m;
    const k = m > 1 ? 1 / m : 1;
    const px = this.x; const py = this.y;
    this.x = s.lx * k; this.y = s.ly * k;
    const cm = Math.hypot(s.cx, s.cy); const ck = cm > 1 ? 1 / cm : 1;
    this.cx = s.cx * ck; this.cy = s.cy * ck;

    this.ax.update(this.x, f);
    this.ay.update(this.y, f);
    // Smash input (for smash attacks): remember the latest fast flick for a few frames.
    if (this.xSmash) this.lastSmash = { dir: this.ax.side > 0 ? 'right' : 'left', frame: f };
    else if (this.yUpSmash) this.lastSmash = { dir: 'up', frame: f };
    else if (this.yDownSmash) this.lastSmash = { dir: 'down', frame: f };

    // Triggers: combined analog value (digital shield = full press).
    const btnShield = !!s.btn.shield;
    this.trigL = s.l || 0; this.trigR = s.r || 0;
    this.trigger = Math.max(s.l || 0, s.r || 0, btnShield ? 1 : 0);
    const shieldHeld = this.trigger >= TRIGGER.SHIELD_MIN;
    this.shieldHeld = shieldHeld;
    this.shieldPressed = (shieldHeld && !this.prevShieldHeld) || latched.trig > 0;
    this.prevShieldHeld = shieldHeld;
    // Light-shield pressure 0..1 (0 = barely past the threshold, 1 = hard press).
    this.shieldPressure = this.trigger >= TRIGGER.HARD ? 1 : Math.max(0, (this.trigger - TRIGGER.SHIELD_MIN) / (TRIGGER.HARD - TRIGGER.SHIELD_MIN));

    const map = { attack: s.btn.attack, special: s.btn.special, jump: s.btn.jump, z: s.btn.z, shield: btnShield };
    let anyPress = false;
    for (const b of BUTTONS) {
      const now = !!map[b];
      this.pressed[b] = (now && !this.held[b]) || latched[b] > 0;
      this.held[b] = now;
      this.heldFrames[b] = now ? this.heldFrames[b] + 1 : 0;
      if (this.pressed[b]) anyPress = true;
    }

    // C-stick "flick" edge: direction on the frame it crosses STICK.DIRECTION.
    const cNow = Math.hypot(this.cx, this.cy) >= STICK.DIRECTION;
    this.cDir = cNow && !this.prevC ? dirOf(this.cx, this.cy) : null;
    this.prevC = cNow;

    this.moved = Math.hypot(this.x - px, this.y - py) > 0.25;
    this.any = anyPress || this.shieldPressed || this.cDir != null || (Math.hypot(this.x, this.y) > 0.5 && this.moved);
  }

  /** Frame of the latest smash flick in `dir` ('left' | 'right' | 'up' | 'down'), or -1. */
  smashFrame(dir) { return this.lastSmash?.dir === dir ? this.lastSmash.frame : -1; }

  /** Smash on X this frame: returns ±1 when |x| reached SMASH_X within the smash window, else 0. */
  get xSmash() {
    const lat = this.ax.reach(STICK.SMASH_X);
    return lat >= 0 && lat < STICK.SMASH_WINDOW ? this.ax.side : 0;
  }
  /** {dir, latency} on the frame |x| first reaches SMASH_X on a side (any speed), else null. */
  get xReach() {
    const lat = this.ax.reach(STICK.SMASH_X);
    return lat >= 0 ? { dir: this.ax.side, latency: lat } : null;
  }
  get xSide() { return this.ax.side; }
  get xSideFrames() { return this.ax.framesOnSide(this.frame); }

  get yUpSmash() { const l = this.ay.reach(STICK.SMASH_Y); return this.ay.side > 0 && l >= 0 && l < STICK.SMASH_WINDOW; }
  get yDownSmash() { const l = this.ay.reach(STICK.SMASH_Y); return this.ay.side < 0 && l >= 0 && l < STICK.SMASH_WINDOW; }
  /** Latency if y crossed SHIELD_DOWN_Y (downwards) this frame, else -1. */
  get yShieldDown() { return this.ay.side < 0 ? this.ay.reach(Math.abs(STICK.SHIELD_DOWN_Y)) : -1; }
  get holdingDown() { return this.y <= -STICK.SMASH_Y; }

  /**
   * 'left' | 'right' | 'up' | 'down' if the stick was flicked that way within `smashWindow` frames
   * (STICK.SMASH_ATTACK + the input buffer) and is still held there (A pressed now → smash attack), else null.
   */
  get smashDir() {
    const s = this.lastSmash;
    if (!s || this.frame - s.frame > this.smashWindow) return null;
    const held = { right: this.x >= STICK.NEUTRAL, left: this.x <= -STICK.NEUTRAL, up: this.y >= STICK.NEUTRAL, down: this.y <= -STICK.NEUTRAL }[s.dir];
    return held ? s.dir : null;
  }

  /** Pressed shield or Z this frame (counts for L-cancel). */
  get lcancelPress() { return this.shieldPressed || this.pressed.z; }
}

/** 4-way direction of a vector: 'up' | 'down' | 'left' | 'right'. */
export function dirOf(x, y) {
  if (Math.abs(y) > Math.abs(x)) return y > 0 ? 'up' : 'down';
  return x > 0 ? 'right' : 'left';
}

/** Stick angle in degrees, 0 = right, 90 = up (0..360). */
export function angleDeg(x, y) {
  let a = (Math.atan2(y, x) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

// ---------------------------------------------------------------------------------------------
// The engine's view of the pad (meleelight input record) + the optional input buffer
// ---------------------------------------------------------------------------------------------
/*
 * Mapping into meleelight's per-frame input (engine/world.js inputData):
 *   lsX / lsY, csX / csY  the Melee-processed sticks from input.js (1/80 steps, per-axis deadzone)
 *   lA / rA               analog triggers 0..1 (0 below the light-shield minimum); the digital shield
 *                         button reads as a full press
 *   l / r                 an L / R "press": a digital click, or an analog trigger past the shield minimum
 *                         (Melee counts an analog press for airdodge and teching; meleelight only took the
 *                         digital click, which most USB controllers don't have)
 *   a, b, x (jump), z     buttons; y is unused (both jump buttons map to x)
 *
 * Input buffer (a deliberate convenience on top of the engine, NOT Melee; FRAMES.INPUT_BUFFER, 0 = off):
 * a jump / attack / special / Z / shield / C-stick press that didn't change what the fighter is doing is
 * re-offered (as a fresh press) on each of the next N frames until it does. L-cancel timing is never
 * buffered (a shield press during an aerial isn't carried), nor is a jump during jumpsquat.
 */
const BUF_KINDS = ['jump', 'attack', 'special', 'z', 'shield', 'cstick'];

export class EngineInput {
  constructor() {
    this.buf = {};
    this.prev = null;
  }

  /**
   * This frame's engine input and the edges to force (buffered presses), for the fighter in `state`.
   * @returns {{input: object, edges: object, real: object, offered: object}}
   */
  frame(pad, inputData, state, buffer) {
    const i = inputData();
    i.lsX = pad.x; i.lsY = pad.y; i.rawX = pad.x; i.rawY = pad.y;
    i.csX = pad.cx; i.csY = pad.cy; i.rawcsX = pad.cx; i.rawcsY = pad.cy;
    const l = pad.trigL ?? pad.trigger; const r = pad.trigR ?? 0;
    i.lA = l >= TRIGGER.SHIELD_MIN ? Math.min(1, l) : 0;
    i.rA = pad.held.shield ? 1 : (r >= TRIGGER.SHIELD_MIN ? Math.min(1, r) : 0);
    i.l = i.lA > 0;
    i.r = i.rA > 0;
    i.a = pad.held.attack; i.b = pad.held.special; i.x = pad.held.jump; i.z = pad.held.z;
    const real = {
      jump: pad.pressed.jump, attack: pad.pressed.attack, special: pad.pressed.special, z: pad.pressed.z,
      shield: pad.shieldPressed, cstick: pad.cDir ? { x: pad.cx, y: pad.cy } : null,
    };
    const offered = {};
    for (const k of BUF_KINDS) {
      if (real[k]) offered[k] = real[k];
      else if (buffer > 0 && this.buf[k]) offered[k] = this.buf[k].v;
    }
    // A press (real, latched or buffered) is an edge: held this frame, released on the previous one.
    const edges = {};
    if (offered.jump) { i.x = true; edges.x = true; }
    if (offered.attack) { i.a = true; edges.a = true; }
    if (offered.special) { i.b = true; edges.b = true; }
    if (offered.z) { i.z = true; edges.z = true; }
    if (offered.shield) {
      if (!i.l && !i.r) { i.r = true; i.rA = Math.max(i.rA, TRIGGER.SHIELD_MIN); }
      edges.shield = true;
    }
    if (offered.cstick) { i.csX = offered.cstick.x; i.csY = offered.cstick.y; edges.cstick = true; }
    this.state = state;
    return { input: i, edges, real, offered };
  }

  /**
   * After the step: a press that changed the fighter's action (new state or a restarted one) is used up;
   * one that didn't is carried for up to `buffer` frames. Returns {used: kinds consumed from the buffer,
   * expired: {kind: age} that ran out unused}.
   */
  settle(f, consumed, buffer, canBuffer) {
    const used = []; const expired = {};
    for (const k of BUF_KINDS) {
      const b = this.buf[k];
      if (!f.offered[k]) continue;
      if (consumed) {
        if (b && !f.real[k]) used.push({ kind: k, age: b.age + 1 });
        this.buf[k] = null;
      } else if (f.real[k]) {
        if (buffer > 0 && canBuffer(k)) this.buf[k] = { v: f.real[k], age: 0 };
        else { this.buf[k] = null; expired[k] = 0; }
      } else if (b && ++b.age >= buffer) {
        this.buf[k] = null;
        expired[k] = b.age;
      }
    }
    return { used, expired };
  }

  clear() { this.buf = {}; }
}
