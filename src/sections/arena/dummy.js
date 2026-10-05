/**
 * dummy.js — A training dummy (Free play): no AI, it stands, gets launched and falls. It takes damage
 * and knockback with Melee's published formula (see movesets.js → knockback) using the weight of the
 * selected fighter (a mirror match, like a training-mode CPU), and respawns at 0% after a KO.
 *
 * Launch model (SmashWiki "Knockback"): launch speed = KB × 0.03 per frame along the hit angle, losing
 * 0.051 per frame; gravity acts on the dummy's own vertical speed. Sakurai angle (361): 0° on the
 * ground below 32 knockback, otherwise 44°. Direction: away from the attacker (approx. — the game
 * uses the attacker's facing for most hits). Hitlag, DI and teching aren't modelled.
 */
import { PHYS, FIGHTER_SCALE, fighterPhysics } from './constants.js';
import { STAGE, SURFACES } from './stage.js';
import { KB, knockback, hitstun } from './movesets.js';

const R = PHYS.BODY_R;
const RESPAWN = 60;

export class Dummy {
  constructor(profile) {
    this.profile = profile;
    this.P = fighterPhysics(profile);
    this.reset();
  }

  reset() {
    const at = STAGE.dummy;
    Object.assign(this, { x: at.x, y: at.y, prevX: at.x, prevY: at.y, vy: 0, kx: 0, ky: 0, facing: -1,
      percent: 0, stun: 0, ground: STAGE.main, state: 'stand', sf: 0, last: null });
  }

  get hittable() { return this.state !== 'dead'; }

  /** Does a circle (world x, y, r) touch the hurtbox? */
  touches(x, y, r) { return this.hittable && Math.hypot(x - this.x, y - (this.y + R)) <= r + R; }

  /** Apply a hit {dmg, angle, bkb, kbg, flinch}. `dir` ±1 = which way it is sent. Returns {kb, stun}. */
  takeHit(h, dir) {
    this.percent = Math.min(999, this.percent + h.dmg);
    if (h.flinch === false) return { kb: 0, stun: 0 };
    const kb = knockback(this.percent, h.dmg, this.profile.w, h.bkb, h.kbg);
    const deg = h.angle === 361 ? (this.ground && kb < 32 ? 0 : 44) : h.angle;
    const a = (deg * Math.PI) / 180;
    const speed = kb * KB.LAUNCH * FIGHTER_SCALE;
    this.kx = Math.cos(a) * speed * dir;
    this.ky = Math.sin(a) * speed;
    if (this.ground && this.ky < 0) this.ky = -this.ky * 0.8; // a grounded meteor bounces off the floor
    if (this.ky > 0) this.ground = null;
    this.vy = 0;
    this.facing = -dir;
    this.stun = hitstun(kb);
    this.state = 'hitstun'; this.sf = 0;
    return { kb, stun: this.stun };
  }

  step() {
    this.prevX = this.x; this.prevY = this.y;
    this.sf++;
    if (this.state === 'dead') { if (this.sf >= RESPAWN) this.reset(); return; }
    if (this.state === 'hitstun' && this.sf >= this.stun) this.state = 'stand';
    // Launch speed decays toward zero along its direction.
    const m = Math.hypot(this.kx, this.ky);
    const decay = KB.DECAY * FIGHTER_SCALE;
    if (m <= decay) { this.kx = 0; this.ky = 0; } else { const k = (m - decay) / m; this.kx *= k; this.ky *= k; }
    if (this.ground) {
      this.kx = Math.sign(this.kx) * Math.max(0, Math.abs(this.kx) - this.P.FRICTION);
      this.x += this.kx;
      if (this.x < this.ground.x1 || this.x > this.ground.x2) this.ground = null;
    } else {
      this.vy = Math.max(this.vy - this.P.GRAVITY, -this.P.MAX_FALL);
      const prevY = this.y;
      this.x += this.kx;
      this.y += this.ky + this.vy;
      if (this.ky + this.vy <= 0) {
        for (const s of SURFACES) {
          if (this.x < s.x1 || this.x > s.x2 || prevY < s.y - 0.001 || this.y > s.y) continue;
          this.ground = s; this.y = s.y; this.vy = 0; this.ky = 0;
          break;
        }
      }
      const M = STAGE.main; // never end up inside the main platform
      if (!this.ground && this.y < M.y && this.y > M.y - M.depth && this.x > M.x1 && this.x < M.x2) {
        this.x = this.prevX < 0 ? M.x1 : M.x2; this.kx = 0;
      }
    }
    const b = STAGE.blast;
    if (this.x < b.left || this.x > b.right || this.y < b.bottom || this.y > b.top) {
      this.state = 'dead'; this.sf = 0;
      return 'ko';
    }
    return null;
  }
}
