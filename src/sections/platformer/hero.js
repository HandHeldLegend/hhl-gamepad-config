/**
 * hero.js (The player character): a small action state machine stepped at a fixed 30 Hz.
 * Pure logic (no DOM, no three.js) so the gameplay tests run it in Node.
 *
 * Each frame: read the stick relative to the camera (stickToIntent), tick timers, then run the current
 * action's handler. A handler may switch action *before* moving (the new action then runs in the same
 * frame, so a jump leaves the ground on the frame it is pressed) or *after* moving (landing, wall contact,
 * running off an edge; the new action starts next frame). Handlers move the hero with groundStep() or
 * airStep(), which advance in four quarter steps against the course's floors, walls and ceilings.
 *
 * Movement model (numbers in constants.js; behaviour modelled on the classic 30 Hz 3D platformer physics
 * documented by the n64decomp/sm64 project; reference only, nothing copied):
 *   Ground   speed eases toward (stick²) × 32 with a tapering acceleration; the facing turns 11.25° a frame
 *            toward the stick; pulling the stick back at speed skids (jump = side flip); slopes add or
 *            remove speed; floors steeper than 38° make you slide.
 *   Air      one forward speed along the facing plus a little steering; drag above 32 (48 for long jumps);
 *            gravity 4 per frame (2 in a long jump) down to −75; letting go of jump early cuts the rise.
 *   Chains   landing from a jump opens a 5-frame window: jump again for a double jump, and again (with
 *            speed > 20) for a triple jump.
 *   Moves    crouch + jump = backflip; running + crouch → crouch slide, + jump = long jump; attack while
 *            running fast = dive (land into a belly slide; jump/attack to roll out); in the air, crouch =
 *            ground pound, attack = kick or dive; hitting a wall head-on in the air sticks you to it for
 *            two frames: jump then (or during the next five frames of falling away) to wall kick; falling
 *            past a ledge 100–160 units above your feet grabs it.
 */
import { BODY, STICK, GROUND, AIR, JUMPS, CHAIN, MOVES, POUND, WALL, LEDGE, SLOPE } from './constants.js';

const TAU = Math.PI * 2;
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

/**
 * Stick (unit square, +x right, +y up) → movement intent in world space, relative to the camera.
 * camYaw is the direction the camera looks (yaw convention as the hero's: (sin, cos) on x/z).
 * @returns {{mag: number, yaw: number, speed: number}} mag 0..1 after the deadzone; speed = mag² × 32
 */
export function stickToIntent(sx, sy, camYaw = 0) {
  const m = Math.hypot(sx, sy);
  if (m <= STICK.DEADZONE) return { mag: 0, yaw: 0, speed: 0 };
  const mag = Math.min(1, (m - STICK.DEADZONE) / (1 - STICK.DEADZONE));
  const ux = sx / m; const uy = sy / m;
  const s = Math.sin(camYaw); const c = Math.cos(camYaw);
  // forward = (sin c, cos c), camera right = (−cos c, sin c)
  const dx = uy * s - ux * c;
  const dz = uy * c + ux * s;
  return { mag, yaw: Math.atan2(dx, dz), speed: mag * mag * STICK.TARGET_SPEED };
}

/** Air behaviour per airborne action. */
const AIR_ACTIONS = {
  jump: { turn: true, cut: true, pound: true, attack: 'kickdive', ledge: true, land: 'single' },
  double: { turn: true, cut: true, pound: true, attack: 'kickdive', ledge: true, land: 'double' },
  triple: { turn: false, pound: true, attack: 'dive', ledge: false, land: 'none' },
  backflip: { turn: false, pound: true, attack: null, ledge: false, land: 'none' },
  sideflip: { turn: false, pound: true, attack: 'kickdive', ledge: true, land: 'none' },
  longJump: { turn: false, pound: true, attack: null, ledge: true, land: 'long', gravity: AIR.LONG_JUMP_GRAVITY, drag: AIR.DRAG_ABOVE_LONG },
  wallKick: { turn: true, pound: true, attack: 'kickdive', ledge: true, land: 'single' },
  freefall: { turn: true, pound: true, attack: 'kickdive', ledge: true, land: 'none' },
  rollout: { turn: true, pound: true, attack: 'kickdive', ledge: true, land: 'none' },
  kick: { turn: true, pound: false, attack: null, ledge: false, land: 'none' },
  dive: { turn: false, pound: false, attack: null, ledge: false, land: 'belly' },
  bonk: { control: false, pound: false, attack: null, ledge: false, land: 'none', wall: false },
};

/** Actions in which the hero stands on a floor. */
export const GROUND_ACTIONS = new Set(['idle', 'walk', 'decel', 'skid', 'turnEnd', 'crouch', 'crouchSlide', 'punch', 'land',
  'poundLand', 'bellySlide', 'getUp', 'slide']);

export class Hero {
  /** @param {import('./course.js').Course} course */
  constructor(course) {
    this.course = course;
    this.respawn();
  }

  respawn() {
    const s = this.course.spawn;
    this.pos = { x: s.x, y: s.y, z: s.z };
    this.prev = { ...this.pos };
    this.yaw = s.yaw; this.prevYaw = s.yaw;
    this.vy = 0; this.fwd = 0; this.side = 0;
    this.slide = { x: 0, z: 0 };
    this.floor = this.course.findFloor(s.x, s.z, s.y + BODY.FLOOR_REACH);
    if (this.floor) this.pos.y = this.floor.y;
    this.chain = null;          // {kind: 'double'|'triple', timer} after landing from a jump
    this.kickTimer = 0;         // late wall-kick window while falling away from a wall
    this.jumpBuf = 0;           // jump pressed shortly before touchdown
    this.noLedge = 0;           // frames before a ledge can be grabbed again
    this.wallN = null;          // normal of the wall in contact
    this.ledge = null;          // {y, n, from:{x,y,z}, to:{x,y,z}} while hanging/climbing
    this.landKind = 'none';
    this.landFrames = CHAIN.LAND_FRAMES;
    this.action = 'idle';
    this.arg = null;
    this.t = 0;
    this.frame = 0;
    this.peakY = this.pos.y;
    this.in = { mag: 0, yaw: 0, speed: 0, jump: false, attack: false, crouch: false, jumpPressed: false, attackPressed: false, crouchPressed: false };
  }

  get grounded() { return GROUND_ACTIONS.has(this.action); }

  /** Horizontal speed (units/frame) for display. */
  get speed() {
    if (this.action === 'slide') return Math.hypot(this.slide.x, this.slide.z);
    return Math.abs(this.fwd);
  }

  /**
   * One 30 Hz frame.
   * @param {{sx:number, sy:number, camYaw:number, jump:boolean, attack:boolean, crouch:boolean,
   *          jumpPressed?:boolean, attackPressed?:boolean, crouchPressed?:boolean}} input
   */
  step(input = {}) {
    this.prev = { ...this.pos };
    this.prevYaw = this.yaw;
    const intent = stickToIntent(input.sx || 0, input.sy || 0, input.camYaw || 0);
    this.in = {
      ...intent,
      jump: !!input.jump, attack: !!input.attack, crouch: !!input.crouch,
      jumpPressed: !!input.jumpPressed, attackPressed: !!input.attackPressed, crouchPressed: !!input.crouchPressed,
    };
    if (this.chain && --this.chain.timer <= 0) this.chain = null;
    if (this.kickTimer > 0) this.kickTimer--;
    if (this.jumpBuf > 0) this.jumpBuf--;
    if (this.noLedge > 0) this.noLedge--;

    for (let i = 0; i < 4; i++) {
      const fn = this[`act_${this.action}`];
      if (!fn || !fn.call(this)) break;
    }
    if (!this.grounded && this.pos.y > this.peakY) this.peakY = this.pos.y;
    this.t++;
    this.frame++;
  }

  // ---- Helpers -------------------------------------------------------------------------------------

  /** Switch action and apply its take-off effects. Returns true (so handlers can `return this.set(…)`). */
  set(action, arg = null) {
    const prevAction = this.action;
    this.action = action;
    this.arg = arg;
    this.t = 0;
    const J = JUMPS;
    const takeOff = (j) => {
      this.vy = j.vy + this.fwd * (j.fromSpeed || 0);
      if (j.fwdScale) this.fwd *= j.fwdScale;
      this.side = 0;
      this.peakY = this.pos.y;
      this.floor = null;
    };
    switch (action) {
      case 'jump': takeOff(J.single); break;
      case 'double': takeOff(J.double); break;
      case 'triple': takeOff(J.triple); break;
      case 'backflip': takeOff(J.backflip); this.fwd = J.backflip.fwd; break;
      case 'sideflip':
        if (this.in.mag > 0) this.yaw = this.in.yaw;
        else if (prevAction === 'skid') this.yaw = wrapAngle(this.yaw + Math.PI);
        takeOff(J.sideflip); this.fwd = J.sideflip.fwd; break;
      case 'longJump': takeOff(J.longJump); this.fwd = Math.min(this.fwd, J.longJump.fwdCap); break;
      case 'wallKick': {
        const n = this.wallN || { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
        const fx = Math.sin(this.yaw); const fz = Math.cos(this.yaw);
        const d = fx * n.x + fz * n.z;
        // Reflect the facing off the wall (head-on → straight back out).
        this.yaw = d < 0 ? Math.atan2(fx - 2 * d * n.x, fz - 2 * d * n.z) : Math.atan2(n.x, n.z);
        this.fwd = Math.max(this.fwd, J.wallKick.fwdMin);
        this.vy = J.wallKick.vy; this.side = 0; this.peakY = this.pos.y;
        this.kickTimer = 0; this.wallN = null;
        break;
      }
      case 'rollout': this.vy = J.rollout.vy; this.side = 0; this.peakY = this.pos.y; this.floor = null; break;
      case 'kick': this.vy = J.kick.vy; break;
      case 'dive':
        if (arg === 'ground') { this.vy = J.groundDive.vy; this.floor = null; this.peakY = this.pos.y; }
        this.fwd = Math.min(this.fwd + MOVES.DIVE_BOOST, MOVES.DIVE_CAP);
        this.side = 0;
        break;
      case 'groundPound': this.fwd = 0; this.side = 0; this.vy = 0; break;
      case 'freefall': if (prevAction !== 'ledgeHang') this.vy = Math.min(this.vy, 0); this.side = 0; break;
      case 'slide': {
        if (prevAction !== 'slide') {
          this.slide = { x: Math.sin(this.yaw) * this.fwd, z: Math.cos(this.yaw) * this.fwd };
        }
        break;
      }
      case 'ledgeHang': {
        const L = this.ledge;
        this.vy = 0; this.fwd = 0; this.side = 0;
        this.pos.y = L.y - BODY.HEIGHT;
        this.yaw = Math.atan2(-L.n.x, -L.n.z);
        break;
      }
      case 'crouch': case 'poundLand': case 'getUp': case 'turnEnd': this.fwd = 0; break;
      default: break;
    }
    return true;
  }

  /** Set an action after moving this frame (it starts running next frame). Returns false. */
  then(action, arg) { this.set(action, arg); return false; }

  wantJump() { return this.in.jumpPressed || this.jumpBuf > 0; }
  useJump() { this.jumpBuf = 0; this.in.jumpPressed = false; }

  steep() { return !!this.floor && this.floor.normal.y < SLOPE.STEEP_NY; }

  /** Stick pulled more than ~100° away from the facing. */
  heldBack() { return this.in.mag > 0 && Math.abs(wrapAngle(this.in.yaw - this.yaw)) > GROUND.TURN_AROUND; }

  /** Slope pull along the facing: + downhill, − uphill (× sin of the slope angle). */
  slopeAlongFacing() {
    const n = this.floor?.normal;
    if (!n) return 0;
    return n.x * Math.sin(this.yaw) + n.z * Math.cos(this.yaw);
  }

  updateWalkSpeed() {
    const target = Math.min(this.in.speed, GROUND.MAX_WALK);
    if (this.fwd <= 0) this.fwd += GROUND.ACCEL;
    else if (this.fwd <= target) this.fwd += GROUND.ACCEL - this.fwd / GROUND.ACCEL_FALLOFF;
    else if (!this.floor || this.floor.normal.y >= 0.95) this.fwd -= GROUND.OVERSPEED_DECEL;
    this.fwd += GROUND.SLOPE_ACCEL * this.slopeAlongFacing();
    this.fwd = Math.min(this.fwd, GROUND.SPEED_CAP);
    this.turnToward(this.in.yaw, GROUND.TURN_RATE);
  }

  turnToward(yaw, rate) {
    const d = wrapAngle(yaw - this.yaw);
    this.yaw = wrapAngle(this.yaw + Math.max(-rate, Math.min(rate, d)));
  }

  /** Jump from the ground, continuing a landing chain when it's still open. */
  groundJump() {
    const c = this.chain;
    this.chain = null;
    this.useJump();
    if (c?.kind === 'double') return this.set('double');
    if (c?.kind === 'triple' && this.fwd > CHAIN.TRIPLE_MIN_SPEED) return this.set('triple');
    return this.set('jump');
  }

  /** Ground attack: dive when running fast with the stick pushed far, else punch. */
  groundAttack() {
    if (this.fwd >= MOVES.DIVE_MIN_SPEED && this.in.mag >= MOVES.DIVE_MIN_STICK) return this.set('dive', 'ground');
    return this.set('punch');
  }

  /**
   * Move along the ground. Velocity defaults to the facing × forward speed.
   * @returns {{wall: object|null, air: boolean}}
   */
  groundStep(vx = Math.sin(this.yaw) * this.fwd, vz = Math.cos(this.yaw) * this.fwd) {
    const c = this.course;
    const res = { wall: null, air: false };
    for (let q = 0; q < 4; q++) {
      const w = c.resolveWalls(this.pos.x + vx / 4, this.pos.z + vz / 4, this.pos.y, BODY.STEP_UP, BODY.HEIGHT - 10, BODY.RADIUS);
      if (w.wall) res.wall = w.wall;
      const f = c.findFloor(w.x, w.z, this.pos.y + BODY.FLOOR_REACH);
      this.pos.x = w.x; this.pos.z = w.z;
      if (!f || f.y < this.pos.y - BODY.SNAP_DOWN) { this.floor = null; res.air = true; return res; }
      this.pos.y = f.y;
      this.floor = f;
    }
    return res;
  }

  /**
   * Move through the air (four quarter steps), then apply gravity.
   * @returns {{landed: object|null, wall: object|null, ledge: object|null, ceiling: boolean}}
   */
  airStep(gravity = AIR.GRAVITY, horizontal = true) {
    const c = this.course;
    const res = { landed: null, wall: null, ledge: null, ceiling: false };
    let vx = 0; let vz = 0;
    if (horizontal) {
      const s = Math.sin(this.yaw); const k = Math.cos(this.yaw);
      vx = s * this.fwd + k * this.side;
      vz = k * this.fwd - s * this.side;
    }
    for (let q = 0; q < 4; q++) {
      const feet = this.pos.y + this.vy / 4;
      const w = c.resolveWalls(this.pos.x + vx / 4, this.pos.z + vz / 4, feet, BODY.STEP_UP, BODY.HEIGHT - 10, BODY.RADIUS);
      let y = feet;
      if (w.wall) {
        res.wall = w.wall;
        if (!w.wall.upper && this.vy <= 0 && !res.ledge) res.ledge = this.probeLedge(w.x, w.z, y, w.wall);
      }
      const ceil = c.findCeil(w.x, w.z, this.pos.y + 1);
      if (y + BODY.HEIGHT > ceil) {
        y = Math.max(this.pos.y, ceil - BODY.HEIGHT);
        if (this.vy > 0) this.vy = 0;
        res.ceiling = true;
      }
      const f = c.findFloor(w.x, w.z, y + BODY.FLOOR_REACH);
      this.pos.x = w.x; this.pos.z = w.z;
      if (f && y <= f.y) {
        this.pos.y = f.y;
        this.floor = f;
        res.landed = f;
        return res;
      }
      this.pos.y = y;
    }
    this.vy = Math.max(this.vy - gravity, AIR.TERMINAL);
    return res;
  }

  /** A grabbable ledge just past the wall: flat top 100–160 units above the feet. */
  probeLedge(x, z, feetY, n) {
    const d = BODY.RADIUS + LEDGE.PROBE / 2;
    const px = x - n.x * d; const pz = z - n.z * d;
    const f = this.course.findFloor(px, pz, feetY + LEDGE.MAX_ABOVE);
    if (!f || f.normal.y < 0.9) return null;
    const above = f.y - feetY;
    if (above < LEDGE.MIN_ABOVE || above > LEDGE.MAX_ABOVE) return null;
    return { y: f.y, n: { x: n.x, z: n.z } };
  }

  /** Air steering: forward speed along the facing, plus turning or sideways drift. */
  airMove(cfg) {
    this.fwd = approach(this.fwd, 0, AIR.DRAG);
    this.side = 0;
    if (this.in.mag > 0) {
      const d = wrapAngle(this.in.yaw - this.yaw);
      const m = this.in.speed / STICK.TARGET_SPEED;
      this.fwd += AIR.STEER_ACCEL * Math.cos(d) * m;
      if (cfg.turn) this.yaw = wrapAngle(this.yaw + AIR.STEER_TURN * Math.sin(d) * m);
      else this.side = AIR.STEER_SIDE * Math.sin(d) * m;
    }
    if (this.fwd > (cfg.drag ?? AIR.DRAG_ABOVE)) this.fwd -= 1;
    if (this.fwd < AIR.BACK_CAP) this.fwd += 2;
  }

  /** Head-on: facing within 45° of straight into the wall. */
  headOn(n) { return -(Math.sin(this.yaw) * n.x + Math.cos(this.yaw) * n.z) > WALL.HEAD_ON; }

  /** Touchdown from the air. */
  land(kind) {
    this.vy = 0;
    this.side = 0;
    if (this.steep()) return this.then('slide');
    if (kind === 'belly') return this.then('bellySlide');
    this.chain = kind === 'single' ? { kind: 'double', timer: CHAIN.WINDOW + 1 }
      : kind === 'double' ? { kind: 'triple', timer: CHAIN.WINDOW + 1 } : null;
    this.landKind = kind;
    this.landFrames = kind === 'long' ? CHAIN.LONG_LAND_FRAMES : CHAIN.LAND_FRAMES;
    return this.then('land');
  }

  /** Shared airborne handler. */
  air() {
    const cfg = AIR_ACTIONS[this.action];
    const inp = this.in;
    if (cfg.pound && inp.crouchPressed) return this.set('groundPound');
    if (cfg.attack && inp.attackPressed) {
      return this.set(cfg.attack === 'dive' || this.fwd > MOVES.AIR_DIVE_MIN_SPEED ? 'dive' : 'kick');
    }
    if (this.action === 'bonk' && this.kickTimer > 0 && this.wantJump()) { this.useJump(); return this.set('wallKick'); }
    if (inp.jumpPressed) this.jumpBuf = CHAIN.JUMP_BUFFER + 1;
    if (cfg.control !== false) this.airMove(cfg);
    const gravityBefore = this.vy;
    const r = this.airStep(cfg.gravity ?? AIR.GRAVITY);
    if (cfg.cut && !inp.jump && gravityBefore > AIR.RELEASE_CUT_ABOVE && !r.landed) this.vy *= AIR.RELEASE_CUT;
    if (r.landed) return this.land(cfg.land);
    if (r.ledge && cfg.ledge && this.noLedge <= 0 && this.headOn(r.ledge.n)) {
      this.ledge = r.ledge;
      return this.then('ledgeHang');
    }
    if (r.wall && r.wall.upper && cfg.wall !== false && this.fwd > WALL.BONK_MIN_SPEED && this.headOn(r.wall)) {
      this.wallN = { x: r.wall.x, z: r.wall.z };
      return this.then('wallHit');
    }
    return false;
  }

  // ---- Ground actions ------------------------------------------------------------------------------

  act_idle() {
    if (this.steep()) return this.set('slide');
    if (this.wantJump()) return this.groundJump();
    if (this.in.attackPressed) return this.set('punch');
    if (this.in.crouch) return this.set('crouch');
    if (this.in.mag > 0) { this.yaw = this.in.yaw; return this.set('walk'); }
    this.fwd = 0;
    if (this.groundStep(0, 0).air) return this.then('freefall');
    return false;
  }

  act_walk() {
    if (this.steep()) return this.set('slide');
    if (this.wantJump()) return this.groundJump();
    if (this.in.attackPressed) return this.groundAttack();
    if (this.in.crouchPressed) return this.set('crouchSlide');
    if (this.in.mag === 0) return this.set('decel');
    if (this.heldBack() && this.fwd >= GROUND.SKID_MIN_SPEED) return this.set('skid');
    this.updateWalkSpeed();
    const r = this.groundStep();
    if (r.air) return this.then('freefall');
    if (r.wall) this.fwd = Math.min(this.fwd, GROUND.WALL_PUSH_SPEED);
    return false;
  }

  act_decel() {
    if (this.steep()) return this.set('slide');
    if (this.wantJump()) return this.groundJump();
    if (this.in.attackPressed) return this.set('punch');
    if (this.in.crouchPressed) return this.set(this.fwd > 0 ? 'crouchSlide' : 'crouch');
    if (this.in.mag > 0) return this.set('walk');
    this.fwd = approach(this.fwd, 0, GROUND.RELEASE_DECEL);
    const r = this.groundStep();
    if (r.air) return this.then('freefall');
    if (r.wall) this.fwd = 0;
    if (this.fwd === 0) return this.then('idle');
    return false;
  }

  act_skid() {
    if (this.wantJump()) { this.useJump(); return this.set('sideflip'); }
    if (!this.heldBack()) return this.set(this.in.mag > 0 ? 'walk' : 'decel');
    this.fwd = approach(this.fwd, 0, GROUND.SKID_DECEL);
    const r = this.groundStep();
    if (r.air) return this.then('freefall');
    if (r.wall) this.fwd = 0;
    if (this.fwd === 0) { this.yaw = this.in.yaw; return this.then('turnEnd'); }
    return false;
  }

  act_turnEnd() {
    if (this.wantJump()) { this.useJump(); return this.set('sideflip'); }
    if (this.in.attackPressed) return this.set('punch');
    if (this.t >= GROUND.TURN_END_FRAMES) return this.set(this.in.mag > 0 ? 'walk' : 'idle');
    if (this.groundStep(0, 0).air) return this.then('freefall');
    return false;
  }

  act_crouch() {
    if (this.steep()) return this.set('slide');
    if (this.wantJump()) { this.useJump(); return this.set('backflip'); }
    if (!this.in.crouch) return this.set('idle');
    this.fwd = 0;
    if (this.groundStep(0, 0).air) return this.then('freefall');
    return false;
  }

  act_crouchSlide() {
    if (this.steep()) return this.set('slide');
    if (this.wantJump()) {
      if (this.t < MOVES.CROUCH_SLIDE_WINDOW && this.fwd > MOVES.LONG_JUMP_MIN_SPEED) { this.useJump(); return this.set('longJump'); }
      return this.groundJump();
    }
    if (!this.in.crouch && this.t >= 4) return this.set(this.in.mag > 0 ? 'walk' : 'decel');
    this.fwd = Math.max(0, approach(this.fwd, 0, MOVES.CROUCH_SLIDE_DECEL) + GROUND.SLOPE_ACCEL * this.slopeAlongFacing());
    if (this.in.mag > 0) this.turnToward(this.in.yaw, GROUND.TURN_RATE / 4);
    const r = this.groundStep();
    if (r.air) return this.then('freefall');
    if (r.wall) this.fwd = 0;
    if (this.fwd <= 0) return this.then(this.in.crouch ? 'crouch' : 'idle');
    return false;
  }

  act_punch() {
    this.fwd = Math.max(0, approach(this.fwd, 0, GROUND.PUNCH_DECEL));
    const r = this.groundStep();
    if (r.air) return this.then('freefall');
    if (r.wall) this.fwd = 0;
    if (this.t >= GROUND.PUNCH_FRAMES - 1) return this.then(this.in.mag > 0 ? 'walk' : this.fwd > 0 ? 'decel' : 'idle');
    return false;
  }

  act_land() {
    if (this.steep()) return this.set('slide');
    if (this.wantJump()) {
      if (this.landKind === 'long' && this.in.crouch) { this.useJump(); return this.set('longJump'); }
      return this.groundJump();
    }
    if (this.in.attackPressed) return this.groundAttack();
    if (this.in.crouchPressed) return this.set(this.fwd > 0 ? 'crouchSlide' : 'crouch');
    if (this.in.mag > 0) this.updateWalkSpeed();
    else this.fwd = approach(this.fwd, 0, GROUND.SKID_DECEL);
    const r = this.groundStep();
    if (r.air) return this.then('freefall');
    if (r.wall) this.fwd = Math.min(this.fwd, GROUND.WALL_PUSH_SPEED);
    if (this.t >= this.landFrames - 1) return this.then(this.in.mag > 0 ? 'walk' : this.fwd > 0 ? 'decel' : 'idle');
    return false;
  }

  act_poundLand() {
    this.fwd = 0;
    if (this.groundStep(0, 0).air) return this.then('freefall');
    if (this.steep()) return this.then('slide');
    if (this.t >= POUND.STUN_FRAMES - 1) return this.then('idle');
    return false;
  }

  act_bellySlide() {
    if ((this.wantJump() || this.in.attackPressed) && this.t >= 2) { this.useJump(); return this.set('rollout'); }
    if (this.steep()) return this.set('slide');
    this.fwd = Math.max(0, this.fwd * MOVES.BELLY_FRICTION - MOVES.BELLY_DECEL + GROUND.SLOPE_ACCEL * this.slopeAlongFacing());
    const r = this.groundStep();
    if (r.air) return this.then('freefall');
    if (r.wall) this.fwd = 0;
    if (this.fwd <= 0) return this.then('getUp');
    return false;
  }

  act_getUp() {
    if (this.groundStep(0, 0).air) return this.then('freefall');
    if (this.t >= MOVES.GET_UP_FRAMES - 1) return this.then('idle');
    return false;
  }

  /** Sliding down (or coasting off) a slope too steep to stand on. */
  act_slide() {
    const sp = Math.hypot(this.slide.x, this.slide.z);
    if (this.wantJump()) {
      this.fwd = sp;
      if (sp > 1) this.yaw = Math.atan2(this.slide.x, this.slide.z);
      this.useJump();
      return this.set('jump');
    }
    const n = this.floor?.normal || { x: 0, y: 1, z: 0 };
    // The floor normal's horizontal part points down the fall line, with length sin(slope).
    this.slide.x += SLOPE.ACCEL * n.x;
    this.slide.z += SLOPE.ACCEL * n.z;
    if (this.in.mag > 0) {
      this.slide.x += SLOPE.STEER * this.in.mag * Math.sin(this.in.yaw);
      this.slide.z += SLOPE.STEER * this.in.mag * Math.cos(this.in.yaw);
    }
    this.slide.x *= SLOPE.FRICTION; this.slide.z *= SLOPE.FRICTION;
    const s2 = Math.hypot(this.slide.x, this.slide.z);
    if (s2 > SLOPE.SPEED_CAP) { this.slide.x *= SLOPE.SPEED_CAP / s2; this.slide.z *= SLOPE.SPEED_CAP / s2; }
    const r = this.groundStep(this.slide.x, this.slide.z);
    if (r.wall) {
      const d = this.slide.x * r.wall.x + this.slide.z * r.wall.z;
      if (d < 0) { this.slide.x -= d * r.wall.x; this.slide.z -= d * r.wall.z; }
    }
    const now = Math.hypot(this.slide.x, this.slide.z);
    if (now > 1) this.yaw = Math.atan2(this.slide.x, this.slide.z);
    this.fwd = now;
    if (r.air) return this.then('freefall');
    if (!this.steep() && now < SLOPE.STOP_SPEED) { this.fwd = 0; return this.then('idle'); }
    return false;
  }

  // ---- Air actions -----------------------------------------------------------------------------------

  act_jump() { return this.air(); }
  act_double() { return this.air(); }
  act_triple() { return this.air(); }
  act_backflip() { return this.air(); }
  act_sideflip() { return this.air(); }
  act_longJump() { return this.air(); }
  act_wallKick() { return this.air(); }
  act_freefall() { return this.air(); }
  act_rollout() { return this.air(); }
  act_kick() { return this.air(); }
  act_dive() { return this.air(); }
  act_bonk() { return this.air(); }

  /** Spin in place (rising a little), pause, then drop straight down. */
  act_groundPound() {
    this.fwd = 0; this.side = 0;
    const spinEnd = POUND.SPIN_FRAMES + POUND.HOLD_FRAMES;
    if (this.t < spinEnd) {
      this.vy = 0;
      if (this.t < POUND.SPIN_FRAMES) {
        const rise = POUND.RISE_START - POUND.RISE_STEP * this.t;
        const ceil = this.course.findCeil(this.pos.x, this.pos.z, this.pos.y + 1);
        if (this.pos.y + rise + BODY.HEIGHT < ceil) this.pos.y += rise;
      }
      return false;
    }
    if (this.t === spinEnd) this.vy = POUND.DROP_VY;
    const r = this.airStep(AIR.GRAVITY, false);
    if (r.landed) {
      this.vy = 0;
      if (this.steep()) return this.then('slide');
      this.chain = null;
      return this.then('poundLand');
    }
    return false;
  }

  /** Two frames stuck to a wall: jump now to wall kick, otherwise fall away (still kickable for 5 frames). */
  act_wallHit() {
    if (this.wantJump()) { this.useJump(); return this.set('wallKick'); }
    if (this.t >= WALL.CONTACT_FRAMES) {
      if (this.fwd > -WALL.BONK_SPEED) this.fwd = WALL.BONK_SPEED;
      if (this.vy > 0) this.vy = 0;
      this.kickTimer = WALL.KICK_LATE_FRAMES + 1;
      return this.set('bonk');
    }
    return false;
  }

  act_ledgeHang() {
    const L = this.ledge;
    if (this.wantJump()) { this.useJump(); return this.climb(true); }
    if (this.in.crouchPressed) return this.dropLedge();
    if (this.in.mag > 0.5 && this.t >= LEDGE.HANG_MIN_FRAMES) {
      const toward = -(Math.sin(this.in.yaw) * L.n.x + Math.cos(this.in.yaw) * L.n.z);
      if (toward > 0.5) return this.climb(false);
      if (toward < -0.5) return this.dropLedge();
    }
    return false;
  }

  climb(quick) {
    const L = this.ledge;
    const inset = BODY.RADIUS + 20;
    L.from = { ...this.pos };
    L.to = { x: this.pos.x - L.n.x * inset, y: L.y, z: this.pos.z - L.n.z * inset };
    L.frames = quick ? LEDGE.QUICK_CLIMB_FRAMES : LEDGE.CLIMB_FRAMES;
    return this.set('ledgeClimb', quick ? 'quick' : 'slow');
  }

  dropLedge() {
    const n = this.ledge.n;
    this.pos.x += n.x * 10; this.pos.z += n.z * 10;
    this.noLedge = LEDGE.REGRAB_DELAY;
    this.vy = 0;
    return this.set('freefall');
  }

  act_ledgeClimb() {
    const L = this.ledge;
    const k = Math.min(1, (this.t + 1) / L.frames);
    // Up first, then over the edge.
    const up = Math.min(1, k * 1.6); const over = Math.max(0, (k - 0.4) / 0.6);
    this.pos.y = L.from.y + (L.to.y - L.from.y) * up;
    this.pos.x = L.from.x + (L.to.x - L.from.x) * over;
    this.pos.z = L.from.z + (L.to.z - L.from.z) * over;
    if (k >= 1) {
      this.floor = this.course.findFloor(this.pos.x, this.pos.z, this.pos.y + BODY.FLOOR_REACH);
      this.ledge = null;
      return this.then(this.floor ? 'idle' : 'freefall');
    }
    return false;
  }
}
