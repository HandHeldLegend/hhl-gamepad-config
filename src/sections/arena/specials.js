/**
 * specials.js — Special moves as a handful of archetypes, each parameterized per fighter in
 * movesets.js (no per-character code). A special is a move like any other (frames + hitboxes); the
 * archetype adds what makes it special: travel, a projectile, a reflect/counter/absorb window.
 *
 *   strike      a hitbox move, optionally lunging (vx/vy during `lunge`, default the active frames).
 *               `judge`: a damage table picked at random (1–9) each use.
 *   projectile  spawns a projectile on frame `fire` (speed, vy, gravity g, bounce, flinch).
 *   window      reflector / counter / absorb window; `hold` keeps it out while B is held, `jumpCancel`
 *               lets a jump cancel it from that frame, `stall` stops fall in the air; absorb fills a
 *               3-step bucket and then dumps it (`dump` move).
 *   recovery    up-special: `rise` (impulse vy, stick vx) or `aim` (wind-up, then fly the stick's way
 *               for `travelFrames`); helpless afterwards. `catch` hitboxes stop the move on a hit.
 *   dash        side-special: travels at `speed` during `travel`; `helpless` afterwards in the air.
 *
 * Each archetype: start(f, d, p) → the move to run (optional), step(f, d, p) → 'done' if it took over
 * the fighter's state, onHit(f, d, box) (optional). The fighter calls them from its 'special' state.
 */
const phys = (f, p, drift = 1) => {
  if (f.ground) f.friction();
  else { f.airDrift(p, drift); f.gravity(); }
};

export const ARCHETYPES = {
  strike: {
    start(f, d) {
      if (!d.judge) return d;
      const n = 1 + Math.floor(Math.random() * 9);
      return { ...d, hitboxes: d.hitboxes.map((h) => ({ ...h, dmg: d.judge[n - 1], kbg: n === 9 ? 110 : h.kbg, tag: String(n) })) };
    },
    step(f, d, p) {
      const [a, b] = d.lunge || [d.from, d.to];
      if ((d.vx != null || d.vy != null) && f.moveFrame >= a && f.moveFrame <= b) {
        if (d.vx != null) f.vx = f.facing * d.vx;
        if (d.vy != null && !f.ground) f.vy = d.vy;
        return;
      }
      phys(f, p, 0.5);
    },
  },

  projectile: {
    step(f, d, p) {
      if (f.moveFrame === d.fire) {
        f.game.spawnProjectile({ x: f.x + f.facing * 9, y: f.y + 7, vx: f.facing * d.speed, vy: d.vy || 0, g: d.g || 0,
          bounce: d.bounce || 0, life: d.life, r: d.r, look: d.look, hit: { ...d.hit, name: d.name } });
      }
      phys(f, p);
      if (!f.ground) f.vy = Math.max(f.vy, -0.6); // a small stall while firing in the air
    },
  },

  window: {
    start(f, d) {
      if (d.effect === 'absorb' && f.bucket >= 3) { f.bucket = 0; return { ...d.dump, effect: null, window: [0, -1], hold: 0, jumpCancel: 0, stall: 0 }; }
      return d;
    },
    step(f, d, p) {
      if (d.hold && p.held.special && f.moveFrame > d.hold) f.moveFrame = d.hold;
      const on = f.moveFrame >= d.window[0] && f.moveFrame <= d.window[1];
      f.windowOn = on ? d.effect : null;
      if (on && (d.effect === 'reflect' || d.effect === 'absorb')) {
        for (const s of f.game.sparks) {
          if (s.life <= 0 || Math.hypot(s.x - f.x, s.y - (f.y + 7)) > 12) continue;
          if (d.effect === 'absorb') { s.life = 0; f.bucket = Math.min(3, f.bucket + 1); }
          else if (Math.sign(s.vx) !== f.facing) { s.vx = -s.vx * 1.5; s.hit = { ...s.hit, dmg: s.hit.dmg * 1.5 }; }
        }
      }
      if (d.jumpCancel && f.moveFrame >= d.jumpCancel && p.pressed.jump && (f.ground || f.jumps > 0)) {
        f.windowOn = null;
        if (f.ground) f.startJumpsquat(false);
        else { f.enterAir(false); f.doubleJump(p); }
        return 'done';
      }
      if (!f.ground && f.moveFrame <= (d.stall || 0)) { f.vy = 0; f.vx *= 0.8; return; }
      phys(f, p, 0.5);
    },
  },

  recovery: {
    step(f, d, p) {
      const fr = f.moveFrame;
      if (fr < d.startup) {
        if (f.ground) f.friction();
        else if (d.travel === 'aim') { f.vx *= 0.9; f.vy = Math.max(f.vy * 0.85 - 0.02, -0.3); }
        else phys(f, p);
        return;
      }
      if (fr === d.startup) {
        f.ground = null;
        if (d.travel === 'aim') {
          const m = Math.hypot(p.x, p.y);
          const a = m >= 0.3 ? Math.atan2(p.y, p.x) : Math.PI / 2;
          if (Math.abs(p.x) >= 0.3) f.facing = Math.sign(p.x);
          f.aim = { x: Math.cos(a), y: Math.sin(a) };
        } else {
          f.vy = d.vy;
          f.vx = p.x * (d.vx || 0) + f.facing * (d.fwd || 0);
        }
      }
      if (d.travel === 'aim') {
        if (fr < d.startup + d.travelFrames) { f.vx = f.aim.x * d.speed; f.vy = f.aim.y * d.speed; return; }
        f.vx *= 0.85;
        f.vy = Math.max(f.vy * 0.85 - f.P.GRAVITY, -f.P.MAX_FALL);
        return;
      }
      f.airDrift(p, 0.5);
      f.gravity();
    },
    onHit(f, d, box) {
      if (!box.catch) return;
      f.vy = 2.2; f.vx = -f.facing * 0.6;
      f.spCaught = true;
      f.moveFrame = Math.max(f.moveFrame, d.total - 12);
    },
  },

  dash: {
    step(f, d, p) {
      const [a, b] = d.travel;
      if (f.moveFrame < a) {
        if (f.ground) f.friction(); else { f.vx *= 0.8; f.vy = Math.max(f.vy - f.P.GRAVITY * 0.3, -0.5); }
        return;
      }
      if (f.moveFrame <= b) { f.vx = f.facing * d.speed; if (!f.ground) f.vy = 0; return; }
      f.vx *= 0.85;
      if (!f.ground) f.gravity();
    },
  },
};
