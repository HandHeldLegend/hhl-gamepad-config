/**
 * fighter.js — "Dot", the arena's small round fighter, as a frame-by-frame state machine.
 *
 * One call to step(pad) = one 60 Hz frame. Each state handler reads the PadState (see controller.js)
 * and may switch state; integrate() then moves the fighter and resolves collisions with the stage.
 *
 * The techniques and the windows that decide them (all numbers live in constants.js):
 *   Dash / dash back   stick |x| must reach SMASH_X within SMASH_WINDOW frames of leaving neutral.
 *                      During the initial dash, doing that the other way is a dash back; if the stick
 *                      lingers in the tilt zone for SMASH_WINDOW frames instead, you get a slow turn.
 *   Short / full hop   jump held through the whole JUMPSQUAT → full hop; released earlier → short hop.
 *   Fast fall          a fresh down flick (SMASH_Y within the window) once vertical speed ≤ 0.
 *   Airdodge           a shield press in the air (from the first airborne frame); direction from the stick.
 *                      Touching ground during the dodge converts the horizontal speed into a slide:
 *                      wavedash (straight out of a jump), waveland (from a fall) or ledgedash (just after
 *                      letting go of the ledge).
 *   L-cancel           a shield/Z press within LCANCEL frames before an aerial lands halves its lag.
 *   Shield             analog trigger ≥ SHIELD_MIN. Lighter press = bigger but weaker-looking shield;
 *                      the shield shrinks as it loses health. Shield drop = crossing SHIELD_DOWN_Y at
 *                      an angle between SPOTDODGE_CONE and SHIELD_DROP_MAX away from straight down.
 *   Ledge              falling into the ledge box while facing the ledge grabs it; then stick/jump/drop.
 *   Smash attacks      A within the smash window of a smash flick (or a C-stick flick on the ground);
 *                      hold A to charge. Moves come from movesets.js, specials from specials.js.
 *
 * Actionability (Melee behaviour, doldecomp/melee used as a behaviour reference only):
 *   - Every move has an IASA frame (movesets.js); from it on, any action interrupts the move.
 *   - A lag state (landing, shield release, roll, spot dodge, attack end…) acts ON the frame its lag ends.
 *   - Jump out of shield works while the shield is up and during shield release (GuardOff), as does
 *     spot dodge; up special works out of shield too.
 *
 * Input buffer (deliberate, NOT Melee — see FRAMES.INPUT_BUFFER): a jump / attack / special / shield /
 * C-stick / dash press that the current state couldn't use is carried forward for game.inputBuffer frames
 * and comes out on the first frame the fighter can act. The same lenience widens the smash-attack window
 * (A up to that many frames after a smash flick, or before it — see smashFromNormal()). L-cancel timing
 * is never buffered.
 */
import { PHYS, FRAMES, STICK, SHIELD, LEDGE, fighterById, fighterPhysics } from './constants.js';
import { STAGE, SURFACES } from './stage.js';
import { groundMove, smashMove, airMove, relDir } from './moves.js';
import { movesetFor, chargeMult, KB } from './movesets.js';
import { ARCHETYPES } from './specials.js';
import { t } from '../../i18n/index.js';

const R = PHYS.BODY_R;
const WALL_PAD = 0.01; // the stage's side walls are exactly at the ledges (feet-point collision)
const DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toward = (v, target, step) => v + clamp(target - v, -step, step);

/** Grounded states that always stop at platform edges instead of going off. */
const EDGE_STOP = new Set(['shield', 'shieldRelease', 'spotdodge', 'roll', 'dizzy', 'attack', 'special', 'jumpsquat']);
/** Grounded states that stop at an edge ("teeter", like Melee's Ottotto) unless they are sliding faster
 *  than a walk (a wavedash or a run's momentum carries you off). Walk / dash / run / skid go off. */
const TEETER = new Set(['idle', 'crouch', 'landing', 'turn']);
/** Ground normals that an A press made just before a smash flick turns into the smash attack. */
const GROUND_NORMALS = new Set(['jab', 'ftilt', 'utilt', 'dtilt']);
/** Inputs the input buffer carries forward. */
const BUF_KINDS = ['jump', 'attack', 'special', 'shield', 'cstick', 'dash'];
const sideDir = (d) => (d > 0 ? 'right' : 'left');

export class Fighter {
  constructor(game, profileId) {
    this.game = game;
    this.setProfile(profileId);
    this.spawn(STAGE.spawn, false);
  }

  /** Switch movement profile (see FIGHTERS in constants.js). Frame windows follow the profile. */
  setProfile(id) {
    this.profile = fighterById(id);
    this.P = fighterPhysics(this.profile);
    this.moves = movesetFor(this.profile.id);
  }

  spawn(at, halo) {
    Object.assign(this, {
      x: at.x, y: at.y, vx: 0, vy: 0, prevX: at.x, prevY: at.y, facing: 1,
      state: halo ? 'respawn' : 'idle', sf: 0, ground: halo ? null : STAGE.main,
      jumps: this.P.JUMPS, airdodgeUsed: false, upSpecialUsed: false, fastfall: false,
      shieldHP: SHIELD.MAX, shieldPressure: 1,
      move: null, moveName: null, moveFrame: 0, sp: null, spCaught: false, windowOn: null, bucket: 0,
      chargeFrames: 0, chargeable: false, charging: false, hitGroups: new Set(),
      airFrame: 0, fromJump: false, apexFrame: -1, ffNoted: false,
      ledge: null, ledgeCooldown: 0, ledgeDropFrame: -9999,
      dropThrough: 0,
      lastLcancel: -9999, lcMissedAt: -9999, lcLateNoted: true,
      jumpHeld: true, jumpViaTap: false, jumpHeldFrames: 0, earlyAirdodge: -1,
      adAngle: null, adAirFrame: 0, adFromJump: false, adFromLedge: false,
      landLag: 0, intangible: !!halo, dashDir: 1, rollDir: 1, skidTurn: false,
      holdDown: false, squash: 0, trail: [], getupFrom: null,
      floatLeft: this.P.FLOAT, floating: false,
      buf: {}, used: new Set(), flick: null,
    });
  }

  setState(s) { this.state = s; this.sf = 0; }

  /** Mark an input kind (BUF_KINDS) as used this frame, so it isn't buffered / is removed from the buffer. */
  use(...kinds) { for (const k of kinds) this.used.add(k); }

  /**
   * Why a jump press can't be used in the current state (null = it can). "Nf left" counts the frames
   * until the state can act (same numbers the buffer works with).
   */
  jumpBlockedReason() {
    const busy = (action, n) => (n != null && n > 0
      ? t('Jump ignored · {action} ({n}f left)', { action, n: Math.ceil(n) })
      : t('Jump ignored · {action}', { action }));
    switch (this.state) {
      case 'landing': return busy(t('landing lag'), this.landLag + 1 - this.sf);
      case 'jumpsquat': return busy(t('already in jumpsquat'));
      case 'air':
        if (this.move && this.moveFrame < this.move.iasa) return busy(t('aerial attack'), this.move.iasa - this.moveFrame);
        return this.jumps > 0 ? null : t('No jumps left');
      case 'airdodge': return busy(t('airdodge'), FRAMES.AIRDODGE - this.sf);
      case 'helpless': return busy(t('helpless fall (until you land or grab a ledge)'));
      case 'attack': return this.move ? busy(t('attack'), this.move.iasa - this.moveFrame) : null;
      case 'special': return busy(t('special'), this.move ? this.move.total + 1 - this.moveFrame : null);
      case 'roll': return busy(t('roll'), this.P.ROLL - this.sf);
      case 'spotdodge': return busy(t('spot dodge'), this.P.SPOTDODGE - this.sf);
      case 'dizzy': return busy(t('shield break'), FRAMES.SHIELD_BREAK - this.sf);
      case 'ledge': return this.sf < FRAMES.LEDGE_WAIT ? busy(t('ledge grab'), FRAMES.LEDGE_WAIT - this.sf) : null;
      case 'ledgeGetup': return busy(t('ledge getup'), FRAMES.LEDGE_GETUP - this.sf);
      case 'respawn': case 'dead': return busy(t('respawning'));
      default: return null;
    }
  }
  get grounded() { return !!this.ground; }
  get feedback() { return this.game.feedback.bind(this.game); }
  get stats() { return this.game.stats; }

  /** True during the first frames of a dash that A could still turn into a smash attack (render: no dash lean). */
  get dashPending() {
    return this.state === 'dash' && !!this.flick && this.game.frame - this.flick.frame <= this.game.pad.smashWindow;
  }

  /** Shield radius right now (units): shrinks with health, grows with a lighter press. */
  shieldRadius() {
    const health = 0.35 + 0.65 * (this.shieldHP / SHIELD.MAX);
    return SHIELD.RADIUS * health * (1 + SHIELD.LIGHT_GROWTH * (1 - this.shieldPressure));
  }

  /** World-space active hitboxes this frame (priority order), with damage after smash charge. */
  activeHitboxes() {
    if (!this.move || this.charging) return [];
    const k = chargeMult(this.chargeFrames);
    const name = this.sp ? this.move.name : t(this.move.name);
    return this.move.hitboxes
      .filter((hb) => this.moveFrame >= hb.from && this.moveFrame <= hb.to)
      .map((hb) => ({ ...hb, x: this.x + hb.x * this.facing, y: this.y + hb.y, dmg: hb.dmg * k, name, charged: this.chargeFrames }));
  }

  /** A hitbox of the current move connected (called by the game). */
  onHit(box) {
    this.hitGroups.add(box.g);
    if (this.sp) ARCHETYPES[this.sp.kind].onHit?.(this, this.sp, box);
  }

  /** Start a move instance: frame 1 is this frame. */
  beginMove(move, name) {
    this.move = move;
    this.moveName = name;
    this.moveFrame = 1;
    this.chargeFrames = 0;
    this.charging = false;
    this.hitGroups = new Set();
  }

  // ===========================================================================================
  // Frame
  // ===========================================================================================

  step(p) {
    const g = this.game;
    this.prevX = this.x; this.prevY = this.y;
    this.sf++;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (p.lcancelPress) this.lastLcancel = g.frame; // real presses only: L-cancel is never buffered
    if (this.state !== 'shield') this.shieldHP = Math.min(SHIELD.MAX, this.shieldHP + SHIELD.REGEN);
    this.holdDown = p.holdingDown;
    this.intangible = false;
    this.squash *= 0.8;

    // Input buffer: presses the fighter couldn't use yet are re-offered (see bufferedPad()).
    p.smashWindow = STICK.SMASH_ATTACK + g.inputBuffer;
    this.raw = p;
    const real = this.readPresses(p);
    const at = { state: this.state, aerial: this.state === 'air' && !!this.move };
    const q = this.bufferedPad(p, real);
    this.used = new Set();

    switch (this.state) {
      case 'idle': this.stIdle(q); break;
      case 'walk': this.stWalk(q); break;
      case 'dash': this.stDash(q); break;
      case 'run': this.stRun(q); break;
      case 'skid': this.stSkid(q); break;
      case 'turn': this.stTurn(q); break;
      case 'crouch': this.stCrouch(q); break;
      case 'jumpsquat': this.stJumpsquat(q); break;
      case 'landing': this.stLanding(q); break;
      case 'attack': this.stAttack(q); break;
      case 'special': this.stSpecial(q); break;
      case 'shield': this.stShield(q); break;
      case 'shieldRelease': this.stShieldRelease(q); break;
      case 'roll': this.stRoll(q); break;
      case 'spotdodge': this.stSpotdodge(q); break;
      case 'dizzy': this.stDizzy(q); break;
      case 'air': this.stAir(q); break;
      case 'airdodge': this.stAirdodge(q); break;
      case 'helpless': this.stHelpless(q); break;
      case 'ledge': this.stLedge(q); break;
      case 'ledgeGetup': this.stLedgeGetup(q); break;
      case 'respawn': this.stRespawn(q); break;
      case 'dead': this.stDead(q); break;
      default: this.setState('idle');
    }

    this.updateBuffer(real, at);

    // Afterimages while airdodging (render decides whether to draw them).
    if (this.state === 'airdodge') this.trail.push({ x: this.x, y: this.y });
    else if (this.trail.length) this.trail.shift();
    if (this.trail.length > 6) this.trail.shift();

    this.integrate(q);
  }

  /** The bufferable presses made this frame (real input only). */
  readPresses(p) {
    const g = this.game;
    return {
      jump: p.pressed.jump ? { tap: false } : (g.tapJump && p.yUpSmash ? { tap: true } : null),
      attack: p.pressed.attack ? {} : null,
      special: p.pressed.special ? {} : null,
      shield: p.shieldPressed ? {} : null,
      cstick: p.cDir ? { dir: p.cDir } : null,
      dash: p.xSmash ? { dir: p.xSmash } : null,
    };
  }

  /** The pad the state handlers see: the real one, plus any buffered presses re-offered this frame. */
  bufferedPad(p, real) {
    const inject = {};
    let any = false;
    for (const k of BUF_KINDS) if (this.buf[k] && !real[k]) { inject[k] = this.buf[k]; any = true; }
    this.injected = inject;
    if (!any) return p;
    const q = Object.create(p);
    const def = (k, v) => Object.defineProperty(q, k, { value: v, configurable: true, writable: true });
    def('pressed', { ...p.pressed });
    def('lcancelPress', p.lcancelPress);
    if (inject.jump) { if (inject.jump.tap) def('yUpSmash', true); else q.pressed.jump = true; }
    if (inject.attack) q.pressed.attack = true;
    if (inject.special) q.pressed.special = true;
    if (inject.shield) def('shieldPressed', true);
    if (inject.cstick) def('cDir', inject.cstick.dir);
    // A buffered dash only counts while the stick is still held that way.
    if (inject.dash && p.xSide === inject.dash.dir) def('xSmash', inject.dash.dir);
    return q;
  }

  /** May a press made in this situation be carried forward? */
  canBuffer(kind, at) {
    if (at.state === 'dead' || at.state === 'respawn') return false;
    if (kind === 'jump' && at.state === 'jumpsquat') return false; // no accidental double jump off a re-tap
    if (kind === 'shield' && at.aerial) return false;               // that press is the L-cancel
    return true;
  }

  updateBuffer(real, at) {
    const N = this.game.inputBuffer;
    for (const k of BUF_KINDS) {
      const b = this.buf[k];
      if (this.used.has(k)) {
        if (k === 'jump' && b && !real.jump) this.feedback(t('Buffered jump · pressed {n}f early', { n: b.age + 1 }), 'lavender');
        this.buf[k] = null;
      } else if (real[k]) {
        const reason = k === 'jump' ? this.jumpBlockedReason() : null;
        if (N > 0 && this.canBuffer(k, at)) this.buf[k] = { ...real[k], age: 0, reason };
        else { this.buf[k] = null; if (reason) this.feedback(reason, 'yellow'); }
      } else if (b && ++b.age >= N) {
        this.buf[k] = null;
        if (b.reason) this.feedback(b.reason, 'yellow');
      }
    }
  }

  friction() {
    const f = Math.abs(this.vx) > this.P.WALK_MAX ? this.P.FRICTION * 2 : this.P.FRICTION;
    this.vx = toward(this.vx, 0, f);
  }

  // ===========================================================================================
  // Grounded states
  // ===========================================================================================

  /** Options shared by most actionable grounded states. Returns true if the state changed. */
  groundOptions(p, { allowDrop = true } = {}) {
    const g = this.game;
    if (p.pressed.jump || (g.tapJump && p.yUpSmash && !p.pressed.attack)) { this.startJumpsquat(!p.pressed.jump); return true; }
    if (p.shieldHeld) { this.use('shield'); this.setState('shield'); this.shieldPressure = p.shieldPressure; return true; }
    if (p.pressed.special && this.startSpecial(p)) return true;
    if (p.cDir) {
      // C-stick on the ground = smash attack (not chargeable).
      this.use('cstick');
      const side = p.cDir === 'left' ? -1 : p.cDir === 'right' ? 1 : 0;
      if (side) this.facing = side;
      this.startAttack(smashMove(side ? 'forward' : p.cDir));
      return true;
    }
    if (p.pressed.attack) {
      this.use('attack');
      const sd = p.smashDir;
      if (sd) {
        const side = sd === 'left' ? -1 : sd === 'right' ? 1 : 0;
        if (side) this.facing = side;
        this.rewindFlick(sd);
        this.startAttack(smashMove(side ? 'forward' : sd), true);
        return true;
      }
      if (this.state === 'dash' || this.state === 'run') { this.startAttack('dash'); return true; }
      const dir = relDir(p.x, p.y, this.facing, STICK.DIRECTION);
      if (dir === 'back') this.facing = -this.facing;
      this.startAttack(groundMove(dir));
      return true;
    }
    if (p.pressed.z) { this.startAttack('grab'); return true; }
    if (allowDrop && this.ground && !this.ground.solid && p.yDownSmash) {
      this.dropThroughPlatform();
      this.feedback(t('Platform drop'), 'blue');
      return true;
    }
    return false;
  }

  /**
   * Everything a standing fighter can do (Melee's Wait / IASA interrupt list): ground options, dash,
   * crouch, walk. Used by idle and by every lag state on the frame it becomes actionable.
   */
  groundInterrupt(p) {
    if (this.groundOptions(p)) return true;
    if (p.xSmash) { this.startDash(p.xSmash); return true; }
    if (p.y <= STICK.CROUCH_Y) { this.setState('crouch'); return true; }
    if (Math.abs(p.x) >= STICK.NEUTRAL) { this.facing = Math.sign(p.x); this.setState('walk'); this.walkPhysics(p); return true; }
    return false;
  }

  /** A lag state ended: stand, and act on this same frame. */
  actNow(p) {
    this.setState('idle');
    this.groundInterrupt(p);
  }

  stIdle(p) {
    if (this.groundInterrupt(p)) return;
    this.friction();
  }

  stWalk(p) {
    if (this.groundOptions(p)) return;
    if (p.xSmash) return this.startDash(p.xSmash);
    if (p.y <= STICK.CROUCH_Y) { this.setState('crouch'); return; }
    if (Math.abs(p.x) < STICK.NEUTRAL) { this.setState('idle'); this.friction(); return; }
    this.facing = Math.sign(p.x);
    this.walkPhysics(p);
  }

  walkPhysics(p) {
    // Walk speed is proportional to how far the stick is pushed — a good way to feel stick resolution.
    this.vx = toward(this.vx, p.x * this.P.WALK_MAX, this.P.WALK_ACCEL);
  }

  startDash(dir) {
    this.use('dash');
    // Remember where the flick happened: A arriving inside the smash window turns this dash into a smash
    // attack from this exact spot (rewindFlick), so a late A never shows a dash step first.
    this.flick = { frame: this.game.frame, x: this.x, vx: this.vx, dir };
    this.facing = dir;
    this.dashDir = dir;
    // Melee (ftCo_Dash_Enter, behaviour reference): the ground speed becomes the initial dash speed.
    this.vx = dir * this.P.DASH_INITIAL;
    this.setState('dash');
  }

  /** A arrived within the smash window of the flick that started this dash: undo the dash's movement. */
  rewindFlick(sd) {
    const f = this.flick;
    if (this.state !== 'dash' || !f || sideDir(f.dir) !== sd) return;
    if (this.game.frame - f.frame > this.game.pad.smashWindow) return;
    this.x = f.x; this.prevX = f.x;
    this.vx = f.vx;
    this.flick = null;
  }

  stDash(p) {
    // Dash back: smash the other way during the initial dash.
    const reach = p.xReach;
    if (reach && reach.dir === -this.dashDir && reach.latency < STICK.SMASH_WINDOW) {
      const st = this.stats.dashback; st.n++; st.ok++;
      if (reach.latency === 0) { st.perfect++; this.feedback(t('Dash back · frame-perfect'), 'green'); }
      else this.feedback(t('Dash back ✓ · {n}f in the tilt zone', { n: reach.latency }), 'green');
      this.startDash(-this.dashDir);
      return;
    }
    // Too slow: the stick sat in the tilt zone for a whole smash window → a turn, not a dash back.
    if (p.xSide === -this.dashDir && p.xSideFrames >= STICK.SMASH_WINDOW) {
      this.stats.dashback.n++;
      this.feedback(t('Dash back missed · stick sat {n}f in the tilt zone', { n: p.xSideFrames }), 'yellow');
      this.facing = -this.dashDir;
      this.setState('turn');
      return;
    }
    if (this.groundOptions(p)) return;
    if (this.sf < this.P.DASH) {
      // Accelerate toward run speed (dash acceleration scales with the stick); an initial dash faster
      // than the run slows down with traction instead (SmashWiki "Dash").
      const target = this.dashDir * this.P.RUN_SPEED;
      if (this.vx * this.dashDir > this.P.RUN_SPEED) this.vx = toward(this.vx, target, this.P.FRICTION);
      else this.vx = toward(this.vx, target, this.P.RUN_ACCEL * Math.max(0.25, Math.abs(p.x)));
      return;
    }
    if (p.xSide === this.dashDir) { this.setState('run'); return; }
    this.setState('idle');
  }

  stRun(p) {
    if (this.groundOptions(p)) return;
    if (p.y <= STICK.CROUCH_Y) { this.setState('crouch'); return; }
    if (p.xSide === -this.facing) {
      // Run turnaround: the fighter turns at once and slides on its old momentum (so sliding off an
      // edge this way leaves it facing the stage — the "run off, turn back, grab the ledge" move).
      this.skidTurn = true; this.facing = -this.facing; this.setState('skid'); return;
    }
    if (p.xSide !== this.facing) { this.skidTurn = false; this.setState('skid'); return; }
    this.vx = toward(this.vx, this.facing * this.P.RUN_SPEED, this.P.RUN_ACCEL);
  }

  stSkid(p) {
    // Melee RunBrake / TurnRun: only a jump (or a crouch out of a plain brake) interrupts it.
    if (p.pressed.jump || (this.game.tapJump && p.yUpSmash)) { this.startJumpsquat(!p.pressed.jump); return; }
    if (!this.skidTurn && p.y <= STICK.CROUCH_Y) { this.setState('crouch'); this.friction(); return; }
    this.friction();
    if (this.sf < (this.skidTurn ? FRAMES.RUN_TURN : FRAMES.RUN_BRAKE)) return;
    if (p.xSide === this.facing && Math.abs(p.x) >= STICK.SMASH_X) { this.setState('run'); return; }
    this.actNow(p);
  }

  stTurn(p) {
    if (this.groundOptions(p)) return;
    if (p.xSmash) return this.startDash(p.xSmash);
    this.friction();
    if (this.sf >= FRAMES.TURN) this.setState(Math.abs(p.x) >= STICK.NEUTRAL ? 'walk' : 'idle');
  }

  stCrouch(p) {
    if (this.groundOptions(p)) return;
    this.friction();
    if (p.y > STICK.CROUCH_Y + 0.05) this.setState('idle');
  }

  dropThroughPlatform() {
    this.ground = null;
    this.dropThrough = FRAMES.DROP_THROUGH;
    this.y -= 0.01;
    this.enterAir(false);
  }

  enterAir(fromJump) {
    this.move = null;
    this.setState('air');
    this.airFrame = 0;
    this.fromJump = fromJump;
    this.apexFrame = this.vy <= 0 ? this.game.frame : -1;
    this.ffNoted = false;
    this.fastfall = false;
    this.floating = false;
  }

  // ---- Jumping --------------------------------------------------------------------------------

  startJumpsquat(viaTap) {
    this.use('jump');
    this.setState('jumpsquat');
    this.jumpViaTap = viaTap;
    this.jumpHeld = true;
    this.jumpHeldFrames = 1; // the press frame counts
    this.earlyAirdodge = -1;
    this.squash = 1;
  }

  stJumpsquat(p) {
    // Jumpsquat frames 1..JUMPSQUAT; the frame after is the first airborne frame (and is actionable).
    if (this.sf >= this.P.JUMPSQUAT) { this.liftoff(p); return; }
    // Short hop = jump released before the jumpsquat ends. Tap-jump: stick dropped back below neutral.
    const holding = this.jumpViaTap ? p.y >= STICK.NEUTRAL : p.held.jump;
    if (holding && this.jumpHeld) this.jumpHeldFrames++;
    else this.jumpHeld = false;
    if (this.raw.shieldPressed) this.earlyAirdodge = this.P.JUMPSQUAT - this.sf; // frames before lift-off
    // Up smash out of jumpsquat (A with the stick up, or C-stick up).
    if ((p.pressed.attack && p.y >= STICK.SMASH_Y) || p.cDir === 'up') {
      this.use(p.cDir === 'up' ? 'cstick' : 'attack');
      this.startAttack('usmash', !p.cDir);
      return;
    }
    this.friction();
  }

  liftoff(p) {
    const short = !this.jumpHeld;
    this.vy = short ? this.P.SHORT_HOP : this.P.FULL_HOP;
    this.vx = clamp(this.vx * this.P.GROUND_TO_AIR + p.x * this.P.JUMP_H_INIT, -this.P.JUMP_H_MAX, this.P.JUMP_H_MAX);
    this.ground = null;
    this.enterAir(true);
    this.airFrame = 1; // this frame is the first airborne frame
    const st = this.stats.hops; st.n++;
    if (short) {
      st.short++;
      this.feedback(this.jumpViaTap ? t('Short hop ✓ · tap jump') : t('Short hop ✓ · jump held {n}f', { n: this.jumpHeldFrames }), 'green');
    } else {
      this.feedback(t('Full hop · held {n}f+ (short hop: release within {window}f)', { n: this.jumpHeldFrames, window: this.P.JUMPSQUAT }), 'lavender');
    }
    // Melee: the first airborne frame already takes an airdodge (frame-perfect wavedash) or an aerial.
    this.airOptions(p);
    if (this.earlyAirdodge > 0 && this.state !== 'airdodge') {
      this.feedback(t('Airdodge {n}f too early — press it after lift-off', { n: this.earlyAirdodge }), 'yellow');
    }
  }

  // ---- Landing ---------------------------------------------------------------------------------

  land(surface) {
    const g = this.game;
    const st = this.state;
    this.ground = surface;
    this.y = surface.y;
    this.vy = 0;
    this.jumps = this.P.JUMPS;
    this.floatLeft = this.P.FLOAT;
    this.floating = false;
    this.airdodgeUsed = false;
    this.upSpecialUsed = false;
    this.fastfall = false;
    let lag = FRAMES.LAND;
    const ac = this.move?.autocancel;
    if (st === 'airdodge') { lag = FRAMES.WAVELAND; this.reportWaveland(); }
    else if (st === 'helpless' || st === 'special') lag = FRAMES.SPECIAL_LAND;
    else if (ac && (this.moveFrame < ac[0] || this.moveFrame >= ac[1])) {
      this.feedback(t('Autocancel · {move} landed on frame {n}', { move: t(this.move.name), n: this.moveFrame }), 'blue');
    } else if (this.move?.landLag && this.profile.noLcancel?.includes(this.moveName)) {
      lag = this.move.landLag;
      this.feedback(t('{move} can’t be L-cancelled · full landing lag', { move: t(this.move.name) }), 'lavender');
    } else if (this.move?.landLag) lag = this.reportLcancel();
    this.move = null;
    this.sp = null;
    this.windowOn = null;
    this.landLag = lag;
    this.setState('landing');
    this.squash = 1;
    this.landFrame = g.frame;
  }

  reportWaveland() {
    const g = this.game;
    const below = this.adAngle == null ? null
      : Math.atan2(-Math.sin(this.adAngle), Math.abs(Math.cos(this.adAngle))) * DEG; // degrees below horizontal
    const ang = below == null ? t('neutral, no slide') : `${below.toFixed(1)}°`;
    if (this.adFromLedge) {
      const n = g.frame - this.ledgeDropFrame;
      this.feedback(t('Ledgedash · {angle} · landed {n}f after letting go', { angle: ang, n }), n <= 30 ? 'green' : 'blue');
      return;
    }
    if (this.adFromJump) {
      const st = this.stats.wavedash; st.n++;
      if (below != null) st.angleSum += below;
      const late = this.adAirFrame - 1;
      if (late === 0) st.perfect++;
      const rating = late === 0 ? t('frame-perfect') : t('{n}f late', { n: late });
      const steep = below != null && below > 45;
      this.feedback(steep ? t('Wavedash · {angle} · {rating} · steep (shallower slides further)', { angle: ang, rating })
        : t('Wavedash · {angle} · {rating}', { angle: ang, rating }), late === 0 && below != null && below <= 45 ? 'green' : 'blue');
      return;
    }
    this.feedback(t('Waveland · {angle}', { angle: ang }), 'blue');
  }

  reportLcancel() {
    const g = this.game;
    const st = this.stats.lcancel; st.n++;
    const since = g.frame - this.lastLcancel; // 0 = pressed on the landing frame
    const lag = this.move.landLag;
    this.lcLateNoted = false;
    if (since <= FRAMES.LCANCEL) {
      st.ok++;
      this.lcMissedAt = -9999;
      this.feedback(t('L-cancel ✓ · pressed {n}f before landing', { n: since }), 'green');
      return this.move.lcLag ?? Math.floor(lag / 2);
    }
    this.lcMissedAt = g.frame;
    if (since <= 40) this.feedback(t('L-cancel missed · {n}f early (window {window}f)', { n: since, window: FRAMES.LCANCEL }), 'yellow');
    else this.feedback(t('L-cancel missed · {move} landed with full lag', { move: t(this.move.name) }), 'yellow');
    return lag;
  }

  stLanding(p) {
    const g = this.game;
    // Pressed just after landing? Tell the player how late it was (real presses only).
    if (!this.lcLateNoted && p.lcancelPress && g.frame - this.lcMissedAt <= 12) {
      this.lcLateNoted = true;
      this.feedback(t('L-cancel {n}f late', { n: g.frame - this.lcMissedAt }), 'yellow');
    }
    // Landing is entered by the collision step, so its lag runs on the following landLag frames.
    if (this.sf > this.landLag) { this.setState('idle'); if (!this.groundInterrupt(p)) this.friction(); return; }
    this.friction();
  }

  // ---- Attacks / specials ----------------------------------------------------------------------

  startAttack(name, chargeable = false) {
    this.beginMove(this.moves[name], name);
    this.chargeable = chargeable && !!this.move.smash;
    this.setState('attack');
  }

  /**
   * Lenience for web latency (not Melee: there ftCo_AttackS4 only fires when A is pressed while the
   * stick is past the threshold within the dash-smash window): A pressed up to inputBuffer frames BEFORE
   * the smash flick started a jab/tilt — the flick arriving now turns it into the smash attack.
   */
  smashFromNormal(p) {
    const N = this.game.inputBuffer;
    if (!N || !GROUND_NORMALS.has(this.moveName) || this.moveFrame > N) return false;
    const sd = p.xSmash ? sideDir(p.xSmash) : p.yUpSmash ? 'up' : p.yDownSmash ? 'down' : null;
    if (!sd) return false;
    const side = p.xSmash || 0;
    if (side) this.facing = side;
    this.use('attack', 'dash', 'jump');
    this.startAttack(smashMove(side ? 'forward' : sd), true);
    return true;
  }

  stAttack(p) {
    if (this.smashFromNormal(p)) return;
    const m = this.move;
    // Smash charge: hold A on the charge frame (up to 60 frames).
    this.charging = this.chargeable && this.moveFrame === m.charge && p.held.attack && this.chargeFrames < KB.CHARGE_MAX;
    if (this.charging) { this.chargeFrames++; this.friction(); return; }
    this.moveFrame++;
    this.friction();
    if (this.moveFrame < m.iasa) return;
    // IASA: any action interrupts the rest of the move; after the last frame the fighter just stands.
    const done = this.moveFrame > m.total;
    if (this.groundInterrupt(p)) return;
    if (done) { this.move = null; this.setState('idle'); }
  }

  /** B with the stick: neutral / side / up / down special (archetypes in specials.js). */
  startSpecial(p) {
    const slot = p.y >= 0.5 ? 'up' : p.y <= -0.5 ? 'down' : Math.abs(p.x) >= 0.5 ? 'side' : 'neutral';
    if (slot === 'up' && this.upSpecialUsed) return false;
    this.use('special');
    const def = this.moves.specials[slot];
    const A = ARCHETYPES[def.kind];
    if (slot === 'side') this.facing = Math.sign(p.x);
    if (slot === 'up') { this.upSpecialUsed = true; if (Math.abs(p.x) >= STICK.NEUTRAL) this.facing = Math.sign(p.x); }
    const move = A.start?.(this, def, p) || def;
    this.beginMove(move, slot);
    this.sp = { ...def, ...move, kind: def.kind };
    this.spCaught = false;
    this.fastfall = false;
    this.floating = false;
    this.setState('special');
    this.squash = 0.6;
    A.step(this, this.sp, p);
    return true;
  }

  stSpecial(p) {
    const d = this.sp;
    this.moveFrame++;
    if (ARCHETYPES[d.kind].step(this, d, p) === 'done') { if (this.state !== 'air') this.move = null; this.sp = null; return; }
    if (this.moveFrame > this.move.total) {
      this.endSpecial();
      // Act on the frame the special ends (the archetype already moved the fighter this frame).
      if (this.state === 'idle') this.groundInterrupt(p);
      else if (this.state === 'air') this.airOptions(p);
    }
  }

  endSpecial() {
    const d = this.sp;
    this.move = null; this.sp = null; this.windowOn = null;
    if (this.ground) { this.setState('idle'); return; }
    if ((d.helpless || d.kind === 'recovery') && !this.spCaught) this.enterHelpless();
    else { const vy = this.vy; this.enterAir(false); this.vy = vy; }
  }

  enterHelpless() {
    this.fastfall = false;
    this.apexFrame = -1;
    this.ffNoted = true;
    this.setState('helpless');
  }

  // ---- Shield ----------------------------------------------------------------------------------

  stShield(p) {
    const g = this.game;
    // Jump out of shield first: it works on any shield frame (Melee Guard / GuardOn interrupts).
    if (p.pressed.jump || (g.tapJump && p.yUpSmash)) { this.startJumpsquat(!p.pressed.jump); return; }
    // Once raised, the shield stays up at least FRAMES.SHIELD_MIN frames (SmashWiki "Shield", Melee: 8).
    if (!p.shieldHeld && this.sf >= FRAMES.SHIELD_MIN) { this.setState('shieldRelease'); return; }
    if (p.shieldHeld) this.shieldPressure = p.shieldPressure;
    this.shieldHP -= SHIELD.DECAY;
    if (this.shieldHP <= 0) {
      this.shieldHP = 0;
      this.setState('dizzy');
      this.feedback(t('Shield broke! Let go of the trigger a little sooner'), 'red');
      return;
    }
    // Up special out of shield.
    if (p.pressed.special && p.y >= 0.5 && this.startSpecial(p)) return;

    // Down while shielding: shield drop (platforms, diagonal) or spot dodge (straight down flick).
    const lat = p.yShieldDown;
    if (lat >= 0) {
      const off = Math.abs(Math.atan2(p.x, -p.y)) * DEG; // 0 = straight down
      const onPlatform = !this.ground.solid;
      const st = this.stats.shieldDrop;
      if (onPlatform && off > STICK.SPOTDODGE_CONE && off <= STICK.SHIELD_DROP_MAX) {
        st.n++; st.ok++;
        this.dropThroughPlatform();
        this.feedback(t('Shield drop ✓ · stick {angle}° from straight down', { angle: off.toFixed(1) }), 'green');
        return;
      }
      if (onPlatform) {
        st.n++;
        this.feedback(t('No shield drop · {angle}° from straight down (window {min}–{max}°)', { angle: off.toFixed(1), min: STICK.SPOTDODGE_CONE, max: STICK.SHIELD_DROP_MAX }), 'yellow');
      }
      if (lat < STICK.SMASH_WINDOW && off <= STICK.SHIELD_DROP_MAX) { this.setState('spotdodge'); return; }
    }
    if (p.xSmash) { this.use('dash'); this.rollDir = p.xSmash; this.setState('roll'); return; }
    if (p.pressed.attack || p.pressed.z) { if (p.pressed.attack) this.use('attack'); this.startAttack('grab'); return; }
    this.friction();
  }

  /** Shield drop lag (Melee GuardOff): jump and spot dodge still work; anything else waits it out. */
  stShieldRelease(p) {
    const g = this.game;
    if (p.pressed.jump || (g.tapJump && p.yUpSmash)) { this.startJumpsquat(!p.pressed.jump); return; }
    const lat = p.yShieldDown;
    if (lat >= 0 && lat < STICK.SMASH_WINDOW && Math.abs(Math.atan2(p.x, -p.y)) * DEG <= STICK.SPOTDODGE_CONE) { this.setState('spotdodge'); return; }
    this.friction();
    if (this.sf >= FRAMES.SHIELD_RELEASE) this.actNow(p);
  }

  stRoll(p) {
    const [a, b] = FRAMES.ROLL_MOVE;
    this.intangible = this.sf >= FRAMES.ROLL_INTANGIBLE[0] && this.sf <= FRAMES.ROLL_INTANGIBLE[1];
    this.vx = this.sf >= a && this.sf <= b ? this.rollDir * (this.P.ROLL_DISTANCE / (b - a + 1)) : 0;
    if (this.sf >= this.P.ROLL) { this.facing = -this.rollDir; this.actNow(p); }
  }

  stSpotdodge(p) {
    this.intangible = this.sf >= FRAMES.SPOTDODGE_INTANGIBLE[0] && this.sf <= FRAMES.SPOTDODGE_INTANGIBLE[1];
    this.friction();
    if (this.sf >= this.P.SPOTDODGE) this.actNow(p);
  }

  stDizzy(p) {
    this.friction();
    if (this.sf >= FRAMES.SHIELD_BREAK) { this.shieldHP = SHIELD.MAX * 0.5; this.actNow(p); }
  }

  // ===========================================================================================
  // Airborne states
  // ===========================================================================================

  /** Actions an actionable airborne fighter can take. Returns true if the fighter's state took over. */
  airOptions(p) {
    const g = this.game;
    if ((p.pressed.jump || (g.tapJump && p.yUpSmash)) && this.jumps > 0) { this.doubleJump(p); return false; }
    if (p.shieldPressed && !this.airdodgeUsed) { this.startAirdodge(p); return true; }
    if (p.cDir || p.pressed.attack) {
      this.use(p.cDir ? 'cstick' : 'attack');
      const dir = p.cDir
        ? (p.cDir === 'up' || p.cDir === 'down' ? p.cDir : ((p.cDir === 'right' ? 1 : -1) === this.facing ? 'forward' : 'back'))
        : relDir(p.x, p.y, this.facing, STICK.DIRECTION);
      const name = airMove(dir);
      this.beginMove(this.moves[name], name);
      return false;
    }
    if (p.pressed.special && this.startSpecial(p)) return true;
    return false;
  }

  stAir(p) {
    this.airFrame++;
    if (this.move) {
      this.moveFrame++;
      if (this.moveFrame > this.move.total) this.move = null;
    }
    // Free, or the aerial reached its IASA frame: anything goes.
    if ((!this.move || this.moveFrame >= this.move.iasa) && this.airOptions(p)) return;
    // Float (profiles with FLOAT): keep jump held, then press down → hover until jump is released
    // or the float time runs out (once per airtime; landing or a ledge grab refreshes it).
    if (this.P.FLOAT) {
      if (this.floating) {
        if (!p.held.jump || --this.floatLeft <= 0) this.floating = false;
      } else if (this.floatLeft > 0 && p.held.jump && p.y <= STICK.CROUCH_Y && this.state === 'air') {
        this.floating = true;
        this.fastfall = false;
      }
    }
    if (this.floating) {
      this.airDrift(p, 1);
      this.vy = 0;
      return;
    }
    this.fastFallCheck(p);
    this.airDrift(p, 1);
    this.gravity();
  }

  doubleJump(p) {
    this.use('jump');
    this.move = null; // a jump in an aerial's IASA window replaces it
    this.jumps--;
    this.vy = this.P.DOUBLE_JUMP;
    this.vx = p.x * this.P.DJ_H;
    this.fastfall = false;
    this.apexFrame = -1;
    this.ffNoted = false;
    this.squash = 0.6;
  }

  fastFallCheck(p) {
    if (this.fastfall || !p.yDownSmash) return;
    const g = this.game;
    if (this.vy <= 0) {
      this.fastfall = true;
      this.vy = -this.P.FAST_FALL;
      const late = Math.max(0, g.frame - this.apexFrame - 1);
      const st = this.stats.fastfall; st.n++;
      if (late === 0) { st.perfect++; this.feedback(t('Fast fall · frame-perfect'), 'green'); }
      else this.feedback(t('Fast fall · {n}f after the peak', { n: late }), late <= 3 ? 'green' : 'blue');
    } else if (!this.ffNoted) {
      this.ffNoted = true;
      this.feedback(t('Fast fall too early · {n}f before the peak', { n: Math.ceil(this.vy / this.P.GRAVITY) }), 'yellow');
    }
  }

  airDrift(p, scale) {
    const target = Math.abs(p.x) >= STICK.NEUTRAL ? p.x * this.P.AIR_SPEED * scale : 0;
    const coasting = target === 0 || (Math.abs(this.vx) > Math.abs(target) && Math.sign(this.vx) === Math.sign(target));
    this.vx = toward(this.vx, target, coasting ? this.P.AIR_FRICTION : this.P.AIR_ACCEL);
  }

  gravity() {
    const before = this.vy;
    this.vy = this.fastfall ? -this.P.FAST_FALL : Math.max(this.vy - this.P.GRAVITY, -this.P.MAX_FALL);
    if (before > 0 && this.vy <= 0) this.apexFrame = this.game.frame;
  }

  startAirdodge(p) {
    const g = this.game;
    this.use('shield');
    this.floating = false;
    this.airdodgeUsed = true;
    // Melee (ftCo_EscapeAir, behaviour reference): neutral only when both axes are inside the deadzone;
    // otherwise full airdodge speed along the stick angle, whatever the stick magnitude.
    const dz = STICK.AIRDODGE_DEADZONE;
    if (Math.abs(p.x) >= dz || Math.abs(p.y) >= dz) {
      const a = Math.atan2(p.y, p.x);
      this.adAngle = a;
      this.vx = Math.cos(a) * this.P.AIRDODGE_SPEED;
      this.vy = Math.sin(a) * this.P.AIRDODGE_SPEED;
    } else {
      this.adAngle = null;
      this.vx = 0; this.vy = 0;
    }
    this.adAirFrame = this.airFrame;
    this.adFromJump = this.fromJump && this.airFrame <= FRAMES.WAVEDASH_MAX_AIR;
    this.adFromLedge = g.frame - this.ledgeDropFrame <= FRAMES.LEDGEDASH_MAX;
    this.fastfall = false;
    this.move = null;
    this.setState('airdodge');
  }

  stAirdodge() {
    this.intangible = this.sf >= FRAMES.AIRDODGE_INTANGIBLE[0] && this.sf <= FRAMES.AIRDODGE_INTANGIBLE[1];
    this.vx *= this.P.AIRDODGE_DECAY;
    this.vy *= this.P.AIRDODGE_DECAY;
    if (this.sf >= FRAMES.AIRDODGE) { this.setState('helpless'); this.apexFrame = this.game.frame; this.ffNoted = true; }
  }

  stHelpless(p) {
    this.fastFallCheck(p);
    this.airDrift(p, 0.6);
    this.gravity();
  }

  // ---- Ledge -----------------------------------------------------------------------------------

  grabLedge(L) {
    this.ledge = L;
    this.x = L.x - L.dir * LEDGE.HANG_X;
    this.y = L.y - LEDGE.HANG_Y;
    this.vx = 0; this.vy = 0;
    this.facing = L.dir;
    this.jumps = this.P.JUMPS;
    this.floatLeft = this.P.FLOAT;
    this.floating = false;
    this.airdodgeUsed = false;
    this.upSpecialUsed = false;
    this.fastfall = false;
    this.move = null;
    this.sp = null;
    this.windowOn = null;
    this.ground = null;
    this.setState('ledge');
    this.ledgeNeutral = false; // stick options need the stick to pass through neutral first
    this.stats.ledge++;
    this.feedback(t('Ledge grab'), 'blue');
  }

  stLedge(p) {
    const g = this.game;
    const L = this.ledge;
    this.vx = 0; this.vy = 0;
    this.intangible = this.sf < 30;
    if (this.sf < FRAMES.LEDGE_WAIT) return;
    const toStage = p.x * L.dir;
    // Ignore a stick that was already held when the ledge was grabbed (so holding "away" while
    // recovering doesn't instantly drop you); it has to come back to neutral first.
    if (Math.hypot(p.x, p.y) < STICK.NEUTRAL) this.ledgeNeutral = true;
    const stickOk = this.ledgeNeutral;
    if (p.pressed.jump || (g.tapJump && p.yUpSmash)) {
      this.use('jump');
      this.vy = this.P.LEDGE_JUMP;
      this.vx = L.dir * 0.6;
      this.leaveLedge();
      this.enterAir(false);
      return;
    }
    if ((stickOk && (toStage >= 0.5 || p.y >= 0.5)) || p.pressed.attack || p.shieldPressed) {
      if (p.pressed.attack) this.use('attack');
      if (p.shieldPressed) this.use('shield');
      this.getupFrom = { x: this.x, y: this.y };
      this.setState('ledgeGetup');
      return;
    }
    if (stickOk && (toStage <= -0.5 || p.y <= -0.5)) {
      this.x -= L.dir;
      this.leaveLedge();
      this.ledgeDropFrame = g.frame;
      this.enterAir(false);
    }
  }

  leaveLedge() {
    this.ledge = null;
    this.ledgeCooldown = FRAMES.LEDGE_REGRAB;
  }

  stLedgeGetup(p) {
    const L = this.ledge;
    const k = Math.min(1, this.sf / FRAMES.LEDGE_GETUP);
    const e = k * k * (3 - 2 * k);
    const to = { x: L.x + L.dir * 9, y: L.y };
    this.intangible = true;
    this.x = this.getupFrom.x + (to.x - this.getupFrom.x) * e;
    // Arc up and over the corner.
    this.y = this.getupFrom.y + (to.y - this.getupFrom.y) * Math.min(1, k * 1.6) + Math.sin(Math.PI * k) * 4;
    if (k >= 1) {
      this.y = L.y;
      this.ground = STAGE.main;
      this.leaveLedge();
      this.actNow(p);
    }
  }

  // ---- Respawn ---------------------------------------------------------------------------------

  stRespawn(p) {
    this.intangible = true;
    this.vx = 0; this.vy = 0;
    if ((this.sf > 30 && p.any) || this.sf > FRAMES.RESPAWN_WAIT) {
      this.intangible = false;
      this.enterAir(false);
      this.apexFrame = this.game.frame;
    }
  }

  stDead() {
    if (this.sf >= FRAMES.RESPAWN_DELAY) this.spawn(STAGE.respawn, true);
  }

  ko() {
    this.stats.ko++;
    this.feedback(t('Out of bounds! Respawning…'), 'red');
    this.move = null;
    this.sp = null;
    this.windowOn = null;
    this.ground = null;
    this.trail = [];
    this.setState('dead');
  }

  // ===========================================================================================
  // Movement & collision
  // ===========================================================================================

  integrate() {
    const st = this.state;
    if (st === 'ledge' || st === 'ledgeGetup' || st === 'respawn' || st === 'dead') return;
    if (this.ground) {
      const s = this.ground;
      this.x += this.vx;
      this.y = s.y;
      this.vy = 0;
      if (this.x < s.x1 || this.x > s.x2) {
        // Melee: standing / crouching / landing fighters teeter at the edge (Ottotto) unless momentum
        // carries them off; walking, dashing, running and skidding go off and fall.
        const slow = Math.abs(this.vx) <= this.P.WALK_MAX + 1e-9;
        if (EDGE_STOP.has(st) || (TEETER.has(st) && slow)) {
          this.x = clamp(this.x, s.x1, s.x2);
          this.vx = 0;
        } else {
          // Walk/run/slide off the edge (a wavedash off the ledge is a real technique!).
          this.ground = null;
          this.enterAir(false);
        }
      }
      return;
    }

    const prevY = this.y;
    this.x += this.vx;
    this.y += this.vy;
    const M = STAGE.main;
    const bottom = M.y - M.depth;
    const inX = this.x > M.x1 - WALL_PAD && this.x < M.x2 + WALL_PAD;

    // Ceiling: rising into the underside of the main platform.
    if (inX && this.vy > 0 && this.y + 2 * R > bottom && prevY + 2 * R <= bottom) {
      this.y = bottom - 2 * R;
      this.vy = 0;
    }

    // Landing: cross a surface top from above while falling.
    if (this.vy <= 0) {
      let best = null;
      for (const s of SURFACES) {
        if (this.x < s.x1 || this.x > s.x2) continue;
        if (prevY < s.y - 0.001 || this.y > s.y) continue;
        if (!s.solid) {
          if (this.dropThrough > 0) continue;
          // Holding down falls through platforms (except while airdodging, so wavelands work).
          if (this.holdDown && st !== 'airdodge') continue;
        }
        if (!best || s.y > best.y) best = s;
      }
      if (best) { this.land(best); return; }
    }

    // Walls: never end up inside the main platform's solid body.
    if (this.y < M.y && this.y + 2 * R > bottom && inX) {
      this.x = this.prevX < 0 ? M.x1 - WALL_PAD : M.x2 + WALL_PAD;
      this.vx = 0;
    }

    // Ledge grab (Melee-like): falling (not rising), not mid-attack, not holding down, facing the ledge,
    // inside the grab box, and not right after letting go. Running off facing outward just falls.
    const canGrab = (st === 'air' && !this.move) || st === 'helpless' || (st === 'special' && this.sp?.kind === 'recovery');
    if (canGrab && this.vy < 0 && this.ledgeCooldown === 0 && !this.holdDown) {
      for (const L of STAGE.ledges) {
        if (this.facing !== L.dir) continue;
        const dx = (this.x - L.x) * L.dir; // negative = off-stage side
        if (dx <= 1 && dx >= -LEDGE.REACH_X && this.y <= L.y - 1 && this.y >= L.y - LEDGE.REACH_Y) {
          this.grabLedge(L);
          return;
        }
      }
    }
  }
}
