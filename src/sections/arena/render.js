/**
 * render.js: Draws the arena on a 2D canvas. Original vector art in the Super Famicom palette.
 *
 * World units, y up. The camera gently follows the fighter while always keeping the stage in view
 * (no shake, no sudden cuts). Positions are interpolated between simulation frames for smoothness
 * on high-refresh displays.
 */
import { PHYS } from './constants.js';
import { STAGE, TARGET_R } from './stage.js';
import { readTheme, reducedMotion, alpha, fitCanvas } from './theme.js';

const R = PHYS.BODY_R;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = null;
    this.setTheme(readTheme());
    this.lastT = 0;
  }

  setTheme(theme) {
    this.t = theme;
    this.reduced = reducedMotion();
    this.ink = theme.light ? theme.text : theme.bg; // a dark color in both themes (pupils, outlines)
  }

  /** Target camera box: the stage view box, stretched to include the fighter with some margin. */
  #cameraTarget(fx, fy, w, h) {
    const v = STAGE.view;
    const left = Math.min(v.left, fx - 34);
    const right = Math.max(v.right, fx + 34);
    const bottom = Math.min(v.bottom, fy - 26);
    const top = Math.max(v.top, fy + 40);
    const scale = Math.min(w / (right - left), h / (top - bottom));
    return { x: (left + right) / 2, y: (top + bottom) / 2, scale };
  }

  /**
   * @param {import('./game.js').Game} game
   * @param {number} a interpolation 0..1 between the previous and current sim frame
   * @param {{showHitboxes?: boolean, stick?: {x:number,y:number}}} opts
   */
  draw(game, a, opts = {}) {
    const { w, h, dpr } = fitCanvas(this.canvas);
    const ctx = this.ctx;
    const t = this.t;
    const f = game.fighter;
    const fx = lerp(f.prevX, f.x, a);
    const fy = lerp(f.prevY, f.y, a);

    // Camera: exponential smoothing, frame-rate independent and deliberately slow.
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    const dead = f.pose === 'dead';
    const target = this.#cameraTarget(dead ? 0 : fx, dead ? 20 : fy, w, h);
    if (!this.cam || this.cam.w !== w || this.cam.h !== h) this.cam = { ...target, w, h };
    else {
      const k = 1 - Math.exp(-dt * (this.reduced ? 2 : 3));
      this.cam.x += (target.x - this.cam.x) * k;
      this.cam.y += (target.y - this.cam.y) * k;
      this.cam.scale += (target.scale - this.cam.scale) * k;
    }
    const cam = this.cam;

    // ---- Screen-space background --------------------------------------------------------------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, t.sunken);
    bg.addColorStop(1, t.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    this.#backdrop(ctx, w, h, cam);

    // ---- World space (y up) -------------------------------------------------------------------
    const s = cam.scale;
    ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * (w / 2 - cam.x * s), dpr * (h / 2 + cam.y * s));
    this.px = 1 / s; // one CSS pixel in world units

    this.#blastHint(ctx, fx, fy);
    this.#stage(ctx);
    for (const tg of game.targets) if (tg.alive) this.#target(ctx, tg, game.frame);
    for (const e of game.effects) this.#effect(ctx, e, game.frame + a);
    if (game.dummy) this.#dummy(ctx, game.dummy, a, game.frame);
    for (const sp of game.projectiles) {
      if (sp.kind === 'LASER') this.#spark(ctx, sp, a);
      else if (sp.kind === 'SAUSAGE') this.#sausage(ctx, sp, a, game.frame);
    }
    if (!dead) this.#fighter(ctx, f, fx, fy, game, opts);
    if (opts.showHitboxes) this.#debug(ctx, f, game);
  }

  // ---- Background -------------------------------------------------------------------------------

  #backdrop(ctx, w, h, cam) {
    const t = this.t;
    const a = t.light ? 0.075 : 0.06;
    // A big, faint four-color "button cluster" far behind the stage (slow parallax).
    const cx = w / 2 - cam.x * cam.scale * 0.15;
    const cy = h * 0.42 + cam.y * cam.scale * 0.1;
    const r = Math.min(w, h) * 0.16;
    const d = r * 1.25;
    const dots = [[0, -d, t.blue], [d, 0, t.red], [0, d, t.yellow], [-d, 0, t.green]];
    for (const [dx, dy, c] of dots) {
      ctx.fillStyle = alpha(c, a);
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); ctx.fill();
    }
    // Soft dotted grid with mid parallax.
    ctx.fillStyle = alpha(t.muted, t.light ? 0.16 : 0.12);
    const step = 22 * cam.scale;
    if (step > 6) {
      const ox = (w / 2 - cam.x * cam.scale * 0.5) % step;
      const oy = (h / 2 + cam.y * cam.scale * 0.5) % step;
      for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
  }

  #blastHint(ctx, fx, fy) {
    const b = STAGE.blast;
    const near = 60;
    const lines = [
      [b.left, fx - b.left, 'v'], [b.right, b.right - fx, 'v'],
      [b.top, b.top - fy, 'h'], [b.bottom, fy - b.bottom, 'h'],
    ];
    ctx.save();
    ctx.lineWidth = 2 * this.px;
    ctx.setLineDash([6 * this.px, 6 * this.px]);
    for (const [pos, dist, dir] of lines) {
      if (dist > near) continue;
      ctx.strokeStyle = alpha(this.t.red, 0.7 * (1 - Math.max(0, dist) / near));
      ctx.beginPath();
      if (dir === 'v') { ctx.moveTo(pos, b.bottom); ctx.lineTo(pos, b.top); } else { ctx.moveTo(b.left, pos); ctx.lineTo(b.right, pos); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- Stage ---------------------------------------------------------------------------------------

  #stage(ctx) {
    const t = this.t;
    const M = STAGE.main;
    // Main body: the stage's underside polygon (engine geometry), filled with a soft gradient.
    const g = ctx.createLinearGradient(0, 0, 0, -44);
    g.addColorStop(0, t.surface3);
    g.addColorStop(1, t.surface);
    ctx.fillStyle = g;
    ctx.beginPath();
    STAGE.underside.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5 * this.px;
    ctx.strokeStyle = t.border;
    ctx.stroke();
    // Top lip in the lavender accent with the four-color stripe under it.
    ctx.fillStyle = t.accent;
    roundRect(ctx, M.x1, -3, M.x2 - M.x1, 3, 1.4);
    ctx.fill();
    const stripe = [t.red, t.yellow, t.green, t.blue];
    const sw = (M.x2 - M.x1 - 16) / 4;
    stripe.forEach((c, i) => { ctx.fillStyle = alpha(c, 0.85); ctx.fillRect(M.x1 + 8 + i * sw, -5.2, sw - 1, 1.4); });
    // Face-button cluster on the front.
    const cx = 0; const cy = -16; const d = 4.4;
    [[0, d, t.blue], [d, 0, t.red], [0, -d, t.yellow], [-d, 0, t.green]].forEach(([dx, dy, c]) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    // Pass-through platforms.
    for (const p of STAGE.platforms) {
      ctx.fillStyle = alpha(this.ink, 0.12);
      roundRect(ctx, p.x1 + 2, p.y - 5, p.x2 - p.x1 - 4, 3, 1.5); ctx.fill();
      ctx.fillStyle = t.surface3;
      roundRect(ctx, p.x1, p.y - 3, p.x2 - p.x1, 3, 1.5); ctx.fill();
      ctx.fillStyle = t.accent;
      roundRect(ctx, p.x1, p.y - 1.1, p.x2 - p.x1, 1.1, 0.55); ctx.fill();
    }
  }

  #target(ctx, tg, frame) {
    const t = this.t;
    const bob = this.reduced ? 0 : Math.sin(frame * 0.05 + tg.id * 1.7) * 0.8;
    const x = tg.x; const y = tg.y + bob;
    ctx.fillStyle = alpha(t.red, 0.18);
    ctx.beginPath(); ctx.arc(x, y, TARGET_R + 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.red;
    ctx.beginPath(); ctx.arc(x, y, TARGET_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.onAccent;
    ctx.beginPath(); ctx.arc(x, y, TARGET_R * 0.66, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.red;
    ctx.beginPath(); ctx.arc(x, y, TARGET_R * 0.36, 0, Math.PI * 2); ctx.fill();
  }

  #effect(ctx, e, frame) {
    const t = this.t;
    const k = clamp((frame - e.frame) / e.life, 0, 1);
    if (e.kind === 'hit') { // a hit on the dummy: a quick flash at the hit point
      const r = this.reduced ? 4 : 3 + 6 * k;
      ctx.strokeStyle = alpha(t.yellow, 1 - k);
      ctx.lineWidth = 1.6 * this.px;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
      if (!this.reduced) star(ctx, e.x, e.y, 2.6 * (1 - k), alpha(t.yellow, 1 - k));
      return;
    }
    if (this.reduced) {
      // Calm version: a fading ring, no flying pieces.
      ctx.strokeStyle = alpha(t.yellow, 1 - k);
      ctx.lineWidth = 2 * this.px;
      ctx.beginPath(); ctx.arc(e.x, e.y, TARGET_R + 2, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    const ease = 1 - (1 - k) * (1 - k);
    ctx.strokeStyle = alpha(t.yellow, 1 - k);
    ctx.lineWidth = 2 * this.px;
    ctx.beginPath(); ctx.arc(e.x, e.y, TARGET_R + 10 * ease, 0, Math.PI * 2); ctx.stroke();
    const colors = [t.red, t.yellow, t.blue, t.green];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.3;
      const dist = 4 + 16 * ease;
      ctx.fillStyle = alpha(colors[i % 4], 1 - k);
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(ang) * dist, e.y + Math.sin(ang) * dist - 6 * k * k, 1.6 * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A projectile (laser): a short streak along its path, in our colours. */
  #spark(ctx, sp, a) {
    const t = this.t;
    const x = lerp(sp.prevX, sp.x, a);
    const y = lerp(sp.prevY, sp.y, a);
    const c = t.green;
    const vx = sp.x - sp.prevX; const vy = sp.y - sp.prevY;
    const len = Math.hypot(vx, vy) || 1;
    const r = Math.max(1.6, sp.r);
    ctx.strokeStyle = alpha(c, 0.35);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - (vx / len) * r * 4, y - (vy / len) * r * 4); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x, y + r * 0.6); ctx.lineTo(x - r, y); ctx.lineTo(x, y - r * 0.6);
    ctx.closePath(); ctx.fill();
  }

  /** Training dummy: a plain round body with its damage above it. */
  #dummy(ctx, d, a, frame) {
    if (d.state === 'dead') return;
    const t = this.t;
    const x = lerp(d.prevX, d.x, a); const y = lerp(d.prevY, d.y, a);
    const stun = d.pose === 'hitstun';
    ctx.fillStyle = alpha(this.ink, 0.15);
    ctx.beginPath(); ctx.ellipse(x, y + 0.6, 6, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = stun && !this.reduced && (frame & 2) ? t.surface3 : t.muted;
    ctx.beginPath(); ctx.arc(x, y + R, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.surface3; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y + R, R * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = t.onAccent;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d.facing * 2.2 + side * 2, y + R + 1.4, 1.1, 0, Math.PI * 2); ctx.fill(); }
    // Damage percent (screen-oriented text).
    ctx.save();
    ctx.translate(x, y + 2 * R + 5);
    ctx.scale(this.px, -this.px);
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = d.percent >= 100 ? t.red : d.percent >= 50 ? t.yellow : t.text;
    ctx.fillText(`${Math.floor(d.percent)}%`, 0, 0);
    ctx.restore();
  }

  // ---- Fighter -------------------------------------------------------------------------------------

  /**
   * Simple geometric accessory per fighter, drawn in body space (y up, radius R). `behind` = the part
   * drawn before the body. Shapes only, no character likenesses.
   */
  #accessory(ctx, look, facing, col, behind) {
    const c = col(look.band);
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    switch (look.acc) {
      case 'ears': // two pointed ears
        if (!behind) return;
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(sx * 2, R - 1.5); ctx.lineTo(sx * 5.5, R + 4.5); ctx.lineTo(sx * 6, R - 3); ctx.closePath(); ctx.fill();
        }
        break;
      case 'crest': // swept-back crest
        if (!behind) return;
        ctx.beginPath(); ctx.moveTo(0, R - 1); ctx.lineTo(-facing * 6, R + 4); ctx.lineTo(-facing * 2.5, R - 3.5); ctx.closePath(); ctx.fill();
        break;
      case 'headband': // band across the top with tails
        if (behind) return;
        ctx.beginPath(); ctx.arc(0, 0, R - 0.4, Math.PI * 0.62, Math.PI * 0.38, true); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-facing * R * 0.7, R * 0.72); ctx.lineTo(-facing * (R + 3), R * 0.45); ctx.stroke();
        break;
      case 'crown': // small three-point crown
        if (behind) return;
        ctx.fillStyle = col('yellow');
        ctx.beginPath(); ctx.moveTo(-3, R - 0.6); ctx.lineTo(-3, R + 2.4); ctx.lineTo(-1.5, R + 1); ctx.lineTo(0, R + 3);
        ctx.lineTo(1.5, R + 1); ctx.lineTo(3, R + 2.4); ctx.lineTo(3, R - 0.6); ctx.closePath(); ctx.fill();
        break;
      case 'hood': // fluffy hood rim
        if (!behind) return;
        ctx.beginPath(); ctx.arc(0, 0.6, R + 1.6, 0, Math.PI * 2); ctx.fill();
        break;
      case 'visor': // visor stripe across the eyes
        if (behind) return;
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = col(look.band);
        ctx.beginPath(); ctx.ellipse(facing * 2.3, 2.2, 4.6, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha /= 0.85;
        break;
      case 'tuft': // curl on top
        if (behind) return;
        ctx.beginPath(); ctx.arc(facing * 1.5, R + 0.6, 1.8, Math.PI * 1.1, Math.PI * 2.4); ctx.stroke();
        break;
      case 'lcd': { // flat silhouette: a nose bump and one arm that flips between two poses
        if (behind) return;
        ctx.fillStyle = col(look.body);
        ctx.beginPath(); ctx.arc(facing * (R - 0.4), 1.6, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col(look.body); ctx.lineWidth = 1.8;
        const up = this.lcdPose ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(facing * 3, -1.5); ctx.lineTo(facing * (R + 2.5), -1.5 + up * 3.5); ctx.stroke();
        break;
      }
      case 'cap': // small cap brim
        if (behind) return;
        ctx.beginPath(); ctx.ellipse(facing * 2.4, R - 1.6, 4.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
        break;
      default:
    }
  }

  #fighter(ctx, f, fx0, fy0, game, opts) {
    let fx = fx0; let fy = fy0;
    const t = this.t;
    const st = f.pose;
    // Hanging from a ledge: draw the body just below the corner (the engine's position is its own anchor).
    const L = f.ledge;
    if (L) { fx = L.x - L.dir * 5; fy = L.y - 13; }

    // Respawn halo.
    if (st === 'respawn') {
      ctx.fillStyle = alpha(t.accent, 0.35);
      ctx.beginPath(); ctx.ellipse(fx, fy - 1, 12, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = t.accent; ctx.lineWidth = 1.2 * this.px;
      ctx.stroke();
    }

    const lcd = f.profile?.look?.acc === 'lcd'; // flat, stepped "LCD game" look: no smear or squash
    // Airdodge afterimages.
    if (!this.reduced && !lcd && f.trail.length > 1) {
      f.trail.forEach((p, i) => {
        ctx.fillStyle = alpha(t.accent, 0.08 + (i / f.trail.length) * 0.12);
        ctx.beginPath(); ctx.arc(p.x, p.y + R, R, 0, Math.PI * 2); ctx.fill();
      });
    }

    // Squash & stretch (pure presentation).
    let sx = 1; let sy = 1; let lean = 0;
    if (st === 'jumpsquat') { sx = 1.16; sy = 0.8; }
    else if (st === 'crouch') { sx = 1.18; sy = 0.72; }
    else if (st === 'landing') { const k = 0.22 * Math.max(0, 1 - f.pl.timer / 6); sx = 1 + k; sy = 1 - k; }
    else if (!f.grounded && st !== 'ledge' && st !== 'ledgeGetup') { const k = clamp(Math.abs(f.vy) * 0.045, 0, 0.12); sx = 1 - k; sy = 1 + k; }
    if (st === 'dash' || st === 'run') lean = -f.facing * 0.14;
    if (st === 'skid') lean = f.facing * 0.12;
    const boxes = f.activeHitboxes();
    if (boxes[0]) lean = clamp(-(boxes[0].x - f.x) * 0.012, -0.18, 0.18);
    if (lcd) { sx = 1; sy = 1; lean = 0; }
    this.lcdPose = lcd && !this.reduced && (f.grounded ? Math.abs(f.vx) > 0.05 : true) ? (Math.floor(game.frame / 8) & 1) : 0;

    const cy = fy + R * sy;
    ctx.save();
    if (f.intangible) ctx.globalAlpha = 0.55;

    // Colours and accessory of the selected fighter (all original: the same round body).
    const lk = f.profile?.look || { body: 'red', band: 'blue', feet: 'yellow', acc: 'cap' };
    const col = (k) => t[k] || t.red;

    // Hanging from the ledge: a little arm to the corner.
    if (L) {
      ctx.strokeStyle = col(lk.feet); ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx + f.facing * 4, cy + 3); ctx.lineTo(L.x, L.y - 0.5); ctx.stroke();
    }

    // Feet (yellow), stepping while moving on the ground.
    const moving = f.grounded && Math.abs(f.vx) > 0.05 && st !== 'landing';
    const phase = moving ? fx * 0.55 : 0;
    ctx.fillStyle = col(lk.feet);
    for (const side of [-1, 1]) {
      const lift = moving ? Math.max(0, Math.sin(phase + (side > 0 ? 0 : Math.PI))) * 1.6 : 0;
      ctx.beginPath();
      ctx.ellipse(fx + side * 3.6 + f.facing * 0.8, fy + 1.1 + lift, 2.9, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body.
    ctx.translate(fx, cy);
    ctx.rotate(lean);
    ctx.scale(sx, sy);
    this.#accessory(ctx, lk, f.facing, col, true);
    ctx.fillStyle = col(lk.body);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    // Highlight + band.
    ctx.fillStyle = alpha(t.onAccent, 0.28);
    ctx.beginPath(); ctx.ellipse(-2.6, 3.4, 2.2, 1.3, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col(lk.band); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, R - 0.65, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    this.#accessory(ctx, lk, f.facing, col, false);

    // Eyes look where the stick points (a tiny live input display on the fighter itself).
    const look = opts.stick || { x: 0, y: 0 };
    const lx = clamp(look.x, -1, 1) * 0.9; const ly = clamp(look.y, -1, 1) * 0.9;
    const dizzy = st === 'dizzy';
    for (const side of [-1, 1]) {
      const ex = f.facing * 2.3 + side * 2.2;
      const ey = 1.2;
      ctx.fillStyle = t.onAccent;
      ctx.beginPath(); ctx.ellipse(ex, ey, 1.55, 2.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.ink;
      if (dizzy) {
        ctx.strokeStyle = this.ink; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(ex - 0.9, ey - 0.9); ctx.lineTo(ex + 0.9, ey + 0.9); ctx.moveTo(ex - 0.9, ey + 0.9); ctx.lineTo(ex + 0.9, ey - 0.9); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(ex + lx * 0.6 + f.facing * 0.25, ey + ly * 0.8, 0.85, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // Sir Retro's props (bucket, hammer and sign, trampoline, pan...): flat LCD shapes.
    if (lcd) this.#retroProp(ctx, f, fx, fy, col(lk.body), game);

    // Attack swoosh on active hitboxes.
    for (const b of boxes) {
      ctx.strokeStyle = alpha(t.yellow, 0.75);
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = alpha(t.yellow, 0.16);
      ctx.fill();
    }

    // Smash charge glow; reflector / counter / absorb window.
    if (f.charging) {
      const k = f.chargeFrames / 60;
      ctx.strokeStyle = alpha(t.yellow, 0.4 + 0.5 * k);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(fx, fy + R, R + 1.5 + (this.reduced ? 0 : (game.frame & 4 ? 0.8 : 0)), 0, Math.PI * 2); ctx.stroke();
    }
    if (f.windowOn && f.windowOn !== 'absorb') { // absorb: Sir Retro's bucket shows it
      const c = { reflect: t.blue, counter: t.accent, absorb: t.yellow }[f.windowOn];
      ctx.strokeStyle = alpha(c, 0.85); ctx.fillStyle = alpha(c, 0.18); ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const an = (i / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(fx + Math.cos(an) * 10, fy + R + Math.sin(an) * 10); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // Shield bubble (the engine's size and position): shrinks with health, larger + paler with a light press.
    if (f.shielding) {
      const sh = f.shield;
      const strength = 0.18 + 0.22 * clamp((sh.analog - 0.3) / 0.7, 0, 1);
      const hp = sh.hp;
      ctx.fillStyle = alpha(hp < 0.3 ? t.red : t.accent, strength);
      ctx.beginPath(); ctx.arc(sh.x + (fx - f.x), sh.y + (fy - f.y), sh.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(hp < 0.3 ? t.red : t.accent, 0.85);
      ctx.lineWidth = 1.6 * this.px * 1.2;
      ctx.stroke();
    }

    // Dizzy stars after a shield break.
    if (st === 'dizzy') {
      const spin = this.reduced ? 0 : game.frame * 0.08;
      for (let i = 0; i < 3; i++) {
        const ang = spin + (i * Math.PI * 2) / 3;
        star(ctx, fx + Math.cos(ang) * 7, fy + 2 * R + 3 + Math.sin(ang) * 1.6, 1.6, t.yellow);
      }
    }
  }

  /** A sausage (Sir Retro's neutral special): a small rounded stick that tumbles. */
  #sausage(ctx, sp, a, frame) {
    const x = lerp(sp.prevX, sp.x, a);
    const y = lerp(sp.prevY, sp.y, a);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.reduced ? 0.6 : frame * 0.35);
    ctx.fillStyle = this.t.text;
    roundRect(ctx, -2.6, -1, 5.2, 2, 1);
    ctx.fill();
    ctx.restore();
  }

  /** A short number in world space (y up), centered on (x, y). */
  #digit(ctx, n, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 64, -size / 64);
    ctx.font = '700 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(String(n), 0, 4);
    ctx.restore();
  }

  /**
   * Sir Retro's per-move props, flat dark LCD-style shapes in world space (y up). Original simple shapes
   * only: spray pump, chair, flag, manhole cover, helmet, torch, diving helmet, two hammers, parachute,
   * box, turtle, key, bell, frying pan, hammer with a numbered sign, trampoline, bucket and oil.
   */
  #retroProp(ctx, f, fx, fy, ink, game) {
    const pl = f.pl;
    const st = pl.actionState;
    const tm = pl.timer;
    const d = f.facing;
    const t = this.t;
    const X = (dx) => fx + d * dx;
    const on = pl.hitboxes.active.some(Boolean);
    ctx.save();
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(X(x1), fy + y1); ctx.lineTo(X(x2), fy + y2); ctx.stroke(); };
    const disc = (x, y, r, fill = true) => { ctx.beginPath(); ctx.arc(X(x), fy + y, r, 0, Math.PI * 2); if (fill) ctx.fill(); else ctx.stroke(); };
    const rect = (x, y, w, h) => { ctx.fillRect(Math.min(X(x), X(x + w)), fy + y, w, h); };
    const puff = (x, y, r) => { ctx.globalAlpha = 0.45; disc(x, y, r); disc(x + 1.6, y + 1, r * 0.7); ctx.globalAlpha = 1; };

    if (/^JAB/.test(st)) { // spray pump and its puff
      rect(5, 5, 5, 2.4); line(10, 6.2, 12.5, 6.2); line(5, 6.2, 3, 4);
      if (on) puff(13, 6, 3);
    } else if (st === 'FORWARDTILT') { // chair held out
      const k = tm >= 13 && tm <= 30 ? 1 : 0.5;
      line(3, 7, 4 + 5 * k, 7);
      rect(4 + 5 * k, 1.5, 1.2, 9);
      line(4.6 + 5 * k, 5, 4 + 10 * k, 5);
      line(4 + 10 * k, 5, 4 + 10 * k, 1.5);
    } else if (st === 'UPTILT') { // flag with a number one
      const up = tm >= 9 ? 1 : tm / 9;
      const tx = 3 + 1.5 * up; const ty = 8 + 11 * up;
      line(3, 8, tx, ty);
      rect(tx, ty - 5, 6, 5);
      this.#digit(ctx, 1, X(tx + 3), fy + ty - 2.5, 4.6, t.onAccent);
    } else if (st === 'DOWNTILT') { // manhole cover flipping up
      ctx.beginPath(); ctx.ellipse(X(9), fy + 1 + (on ? 2.5 : 0), 5.5, on ? 2.6 : 1, 0, 0, Math.PI * 2); ctx.fill();
    } else if (st === 'ATTACKDASH') { // helmet, diving forward
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(1), fy + 8, 7.8, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
    } else if (st === 'FORWARDSMASH') { // torch
      const out = tm >= 13 ? 1 : 0.4;
      line(3, 7, 3 + 10 * out, 7);
      ctx.fillStyle = t.yellow; disc(4 + 11 * out, 7.5, tm >= 13 && tm <= 33 ? 3.4 : 2);
    } else if (st === 'UPSMASH') { // diving helmet
      const lift = tm >= 24 && tm <= 28 ? 3 : 0;
      ctx.lineWidth = 1.6; disc(1.5, 13 + lift, 6, false);
      ctx.globalAlpha = 0.35; disc(2.5, 13.5 + lift, 2.4); ctx.globalAlpha = 1;
    } else if (st === 'DOWNSMASH') { // two hammers, both sides
      const k = tm >= 15 ? 1 : 0.4;
      for (const sx of [1, -1]) {
        line(sx * 2, 7, sx * (9 * k + 2), 4 * k + 3);
        ctx.fillRect(X(sx * (9 * k + 2)) - 2, fy + 1.5, 4, 3.5);
      }
    } else if (st === 'ATTACKAIRN') { // parachute
      ctx.beginPath(); ctx.arc(fx, fy + 15, 10, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 0.8;
      for (const sx of [-9, -3, 3, 9]) { ctx.beginPath(); ctx.moveTo(fx + sx, fy + 15); ctx.lineTo(fx, fy + 9); ctx.stroke(); }
    } else if (st === 'ATTACKAIRF') { // box swung down in front
      const k = tm >= 10 ? 1 : 0.5;
      rect(6 * k + 2, 1 + 4 * (1 - k), 7, 7);
    } else if (st === 'ATTACKAIRB' || st === 'LANDINGATTACKAIRB') { // turtle behind
      ctx.beginPath(); ctx.ellipse(X(-11), fy + 3, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      disc(-16.5, 3 + (on && (tm & 2) ? 1 : 0), 1.8);
    } else if (st === 'ATTACKAIRU') { // blowing upwards
      line(1, 10, 2, 13);
      if (on) { puff(0, 15, 3.5); puff(1, 19, 2.6); }
    } else if (st === 'ATTACKAIRD' || st === 'LANDINGATTACKAIRD') { // key, plunging down
      rect(-0.6, -5, 1.2, 9); disc(0, 5.5, 2.4, false); rect(0.6, -4.5, 2, 1); rect(0.6, -2.5, 1.5, 1);
    } else if (st === 'CATCHATTACK') { // bell
      ctx.beginPath(); ctx.arc(X(9), fy + 8, 3, Math.PI, 0); ctx.lineTo(X(12.5), fy + 6.5); ctx.lineTo(X(5.5), fy + 6.5); ctx.closePath(); ctx.fill();
    } else if (/^(GRAB|CATCH|THROW[A-Z])/.test(st)) { // reaching hand
      line(3, 7, 9, 7); disc(9.5, 7, 1.4);
    } else if (/^NEUTRALSPECIAL/.test(st)) { // frying pan
      const k = tm >= 18 && tm <= 21 ? 1 : 0.6;
      line(3, 7, 6, 7 + 2 * k);
      ctx.beginPath(); ctx.ellipse(X(9), fy + 7 + 2 * k, 3.4, 1.3, -d * 0.3 * k, 0, Math.PI * 2); ctx.fill();
    } else if (/^SIDESPECIAL/.test(st)) { // hammer and the numbered sign
      const n = pl.retro?.number || 0;
      const k = tm >= 16 ? 1 : tm / 16;
      line(3, 9, 3 + 6 * k, 13 - 6 * k);
      ctx.fillRect(X(3 + 6 * k) - 2, fy + 13 - 6 * k - 1.5, 4, 3.5);
      if (tm >= 6) {
        line(-3, 8, -3, 17);
        ctx.fillRect(X(-3) - 4.5, fy + 17, 9, 8);
        ctx.fillStyle = t.onAccent; ctx.fillRect(X(-3) - 3.8, fy + 17.7, 7.6, 6.6);
        this.#digit(ctx, n, X(-3), fy + 21, 6, n === 9 ? t.red : ink);
      }
    } else if (st === 'UPSPECIAL' && tm <= 16 && pl.phys.fireBase) { // trampoline left behind, two helpers
      const b = pl.phys.fireBase;
      ctx.globalAlpha = 1 - tm / 18;
      ctx.fillRect(b.x - 7, b.y + 1, 14, 1.4);
      for (const sx of [-8, 8]) ctx.fillRect(b.x + sx - 1.2, b.y, 2.4, 5);
      ctx.globalAlpha = 1;
    } else if (/^DOWNSPECIAL/.test(st)) { // bucket (fill level) or the oil spill
      const fill = pl.retro?.bucket || 0;
      if (/SHOOT/.test(st)) {
        const k = Math.min(1, tm / 30);
        ctx.globalAlpha = 0.75 * (1 - Math.max(0, tm - 36) / 13);
        ctx.beginPath(); ctx.ellipse(X(6 + 22 * k), fy + 7 - 2 * k, 3 + 8 * k, 1.6 + 3.5 * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        rect(7, 6, 6, 6);
      } else {
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(X(7), fy + 12); ctx.lineTo(X(8), fy + 3); ctx.lineTo(X(14), fy + 3); ctx.lineTo(X(15), fy + 12); ctx.stroke();
        line(7, 12, 11, 15); line(11, 15, 15, 12); // handle
        for (let i = 0; i < fill; i++) rect(8.4, 3.8 + i * 2.6, 5.2, 2);
        if (pl.phys.absorbing && !this.reduced) { ctx.strokeStyle = alpha(t.yellow, 0.7); ctx.lineWidth = 0.8; disc(4.5, 6, 5.5, false); }
      }
    }
    // A full bucket: a slow flashing ring.
    if ((pl.retro?.bucket || 0) >= 3 && !this.reduced && (game.frame & 8)) {
      ctx.strokeStyle = alpha(t.yellow, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(fx, fy + R, R + 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  #debug(ctx, f, game) {
    const t = this.t;
    // Active hitboxes coloured by damage (blue < 5% · green < 10% · yellow < 15% · red; grabs in lavender).
    const dmgColor = (d) => (d < 5 ? t.blue : d < 10 ? t.green : d < 15 ? t.yellow : t.red);
    const bodies = [f, game.dummy].filter((b) => b && b.pose !== 'dead');
    for (const b of bodies) {
      for (const hb of b.activeHitboxes()) {
        const c = hb.grab ? t.accent : dmgColor(hb.dmg);
        ctx.fillStyle = alpha(c, 0.45);
        ctx.beginPath(); ctx.arc(hb.x, hb.y, hb.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = this.px; ctx.stroke();
      }
      // Hurtbox (meleelight uses one box per fighter), intangible = dashed.
      const hu = b.hurtbox();
      ctx.strokeStyle = alpha(t.yellow, 0.9); ctx.lineWidth = 1.2 * this.px;
      if (b.intangible) ctx.setLineDash([3 * this.px, 2 * this.px]);
      ctx.strokeRect(hu.x1, hu.y2, hu.x2 - hu.x1, hu.y1 - hu.y2);
      ctx.setLineDash([]);
      // ECB (environmental collision diamond).
      const e = b.ecb();
      ctx.strokeStyle = alpha(t.green, 0.9); ctx.lineWidth = this.px;
      ctx.beginPath(); e.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
    }
    for (const sp of game.projectiles) {
      ctx.strokeStyle = t.yellow; ctx.lineWidth = this.px;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.stroke();
    }
    // Ledge-grab boxes (in front of and behind the fighter, meleelight ledgeSnapBox).
    if (f.pose !== 'dead') {
      const o = f.pl.charAttributes.ledgeSnapBoxOffset;
      ctx.strokeStyle = alpha(t.blue, 0.6); ctx.lineWidth = this.px;
      ctx.strokeRect(f.x, f.y + o[1], o[0], o[2] - o[1]);
      ctx.strokeRect(f.x - o[0], f.y + o[1], o[0], o[2] - o[1]);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
