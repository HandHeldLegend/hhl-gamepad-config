/**
 * fighter.js: A read-only view of one engine player (engine/world.js) for the renderer, the HUD, the
 * help tab and the technique coach: position (with the previous frame's, for interpolation), facing,
 * a coarse pose for drawing, hitboxes, hurtbox, ECB and shield.
 *
 * The simulation itself is the ported meleelight engine (engine/); nothing here changes it.
 * Port 0 is the fighter, port 1 the training dummy.
 */
import { fighterById } from './constants.js';
import { ENGINE_ID } from './engine/roster.js';

const DEG = 180 / Math.PI;

/** Coarse pose of an action state, used by render.js (squash, lean, effects). */
export function poseOf(state) {
  if (state === 'KNEEBEND') return 'jumpsquat';
  if (/^SQUAT/.test(state)) return 'crouch';
  if (/^LANDING/.test(state)) return 'landing';
  if (state === 'DASH') return 'dash';
  if (state === 'RUN') return 'run';
  if (state === 'RUNBRAKE' || state === 'RUNTURN') return 'skid';
  if (state === 'WALK') return 'walk';
  if (/^GUARD/.test(state)) return 'shield';
  if (/^CLIFF(CATCH|WAIT)$/.test(state)) return 'ledge';
  if (/^CLIFF/.test(state)) return 'ledgeGetup';
  if (state === 'FURAFURA' || /^SHIELDBREAK/.test(state) || /^FURASLEEP/.test(state)) return 'dizzy';
  if (/^DEAD/.test(state) || state === 'SLEEP') return 'dead';
  if (/^REBIRTH/.test(state)) return 'respawn';
  if (state === 'ESCAPEAIR') return 'airdodge';
  if (/^ESCAPE[BFN]$/.test(state)) return 'dodge';
  if (/^(DAMAGE|DOWN(BOUND|WAIT|DAMAGE)|WALLDAMAGE|STOPCEIL|THROWN|CAPTURE)/.test(state)) return 'hitstun';
  if (state === 'FALLSPECIAL') return 'helpless';
  if (/^(JUMP|FALL|AERIALTURN|ATTACKAIR|WALLJUMP|PASS|MISSFOOT)/.test(state)) return 'air';
  return 'idle';
}

/** Reflector / counter windows (drawn as a hexagon). */
function windowOf(state, template) {
  if (/^DOWNSPECIAL/.test(state) && (template === 2 || template === 3)) return 'reflect';
  if (/^DOWNSPECIAL/.test(state) && template === 0) return 'counter';
  return null;
}

export class Body {
  constructor(game, port) {
    this.game = game;
    this.port = port;
    this.trail = [];
  }

  get pl() { return this.game.world.player[this.port]; }
  get state() { return this.pl.actionState; }
  get pose() { return poseOf(this.pl.actionState); }
  get x() { return this.pl.phys.pos.x; }
  get y() { return this.pl.phys.pos.y; }
  get prevX() { return this.pl.phys.posPrev.x; }
  get prevY() { return this.pl.phys.posPrev.y; }
  get vx() { return this.pl.phys.cVel.x + this.pl.phys.kVel.x; }
  get vy() { return this.pl.phys.cVel.y + this.pl.phys.kVel.y; }
  get facing() { return this.pl.phys.face; }
  get grounded() { return this.pl.phys.grounded; }
  /** Intangible or invincible (drawn see-through). */
  get intangible() { return this.pl.phys.hurtBoxState !== 0; }
  get percent() { return this.pl.percent; }
  get charging() { return !!this.pl.phys.charging; }
  get chargeFrames() { return this.pl.phys.chargeFrames || 0; }
  get shielding() { return this.pl.phys.shielding && /^GUARD/.test(this.pl.actionState); }
  /** Shield bubble: {x, y, r, hp 0..1, analog 0..1}. */
  get shield() {
    const ph = this.pl.phys;
    return { x: ph.shieldPositionReal.x, y: ph.shieldPositionReal.y, r: ph.shieldSize, hp: ph.shieldHP / 60, analog: ph.shieldAnalog };
  }
  get windowOn() { return windowOf(this.pl.actionState, this.game.templateOf(this.port)); }
  /** Ledge the fighter is hanging from ({x, y, dir}) or null. */
  get ledge() {
    const i = this.pl.phys.onLedge;
    if (i < 0 || this.pose !== 'ledge') return null;
    const s = this.game.world.stage;
    const L = s.ledge[i];
    const pt = s[L[0]][L[1]][L[2]];
    return { x: pt.x, y: pt.y, dir: L[2] === 0 ? 1 : -1 };
  }

  /** World-space active hitboxes this frame: [{x, y, r, dmg, angle, grab}]. */
  activeHitboxes() {
    const pl = this.pl;
    const out = [];
    const hb = pl.hitboxes;
    for (let j = 0; j < 4; j++) {
      if (!hb.active[j]) continue;
      const h = hb.id[j];
      const off = h.offset?.[Math.min(hb.frame, h.offset.length - 1)];
      if (!off) continue;
      out.push({ x: pl.phys.pos.x + off.x * pl.phys.face, y: pl.phys.pos.y + off.y, r: h.size, dmg: h.dmg, angle: h.angle, grab: h.type === 2 });
    }
    return out;
  }

  /** Hurtbox {x1, y1, x2, y2} (meleelight's box hurtbox). */
  hurtbox() {
    const b = this.pl.phys.hurtbox;
    return { x1: b.min.x, y1: b.max.y, x2: b.max.x, y2: b.min.y };
  }

  /** The four ECB points (bottom, right, top, left). */
  ecb() { return this.pl.phys.ECB1.map((v) => ({ x: v.x, y: v.y })); }

  /** Called by the game after each frame (afterimages while airdodging). */
  afterStep() {
    if (this.pose === 'airdodge') this.trail.push({ x: this.x, y: this.y });
    else if (this.trail.length) this.trail.shift();
    if (this.trail.length > 6) this.trail.shift();
  }
}

/** The player's fighter (port 0): a Body plus the roster profile. */
export class Fighter extends Body {
  constructor(game, profileId) {
    super(game, 0);
    this.setProfile(profileId);
  }

  setProfile(id) {
    this.profile = fighterById(id);
    this.engineId = ENGINE_ID[this.profile.id];
  }

  /** Frame windows shown in the help tab (from the engine's attributes). */
  get P() {
    const a = this.game.world?.player[0]?.charAttributes;
    return { JUMPSQUAT: a?.jumpSquat ?? this.profile.jsq, DASH: a?.dashFrameMin ?? this.profile.dashF };
  }

  get dashPending() { return false; }
}

/** Stick angle from straight down, degrees (0 = straight down). */
export const offDown = (x, y) => Math.abs(Math.atan2(x, -y)) * DEG;
