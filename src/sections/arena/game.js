/**
 * game.js (The simulation): fighter + targets + training dummy (free play) + projectiles + timer,
 * advanced one 60 Hz frame at a time.
 *
 * The Game knows nothing about the DOM or the canvas. view/play.js feeds it input snapshots from a
 * fixed-timestep accumulator and render.js draws whatever state it is in.
 */
import { store } from './store.js';
import { FRAMES, STEP_MS } from './constants.js';
import { STAGE, TARGETS, TARGET_R } from './stage.js';
import { Fighter } from './fighter.js';
import { Dummy } from './dummy.js';
import { PadState } from './controller.js';
import { SnapbackWatch, describeSnap } from './analysis.js';
import { t } from '../../i18n/index.js';

export function newStats() {
  return {
    wavedash: { n: 0, perfect: 0, angleSum: 0 },
    lcancel: { n: 0, ok: 0 },
    hops: { n: 0, short: 0 },
    dashback: { n: 0, ok: 0, perfect: 0 },
    fastfall: { n: 0, perfect: 0 },
    shieldDrop: { n: 0, ok: 0 },
    ledge: 0,
    ko: 0,
    targets: 0,
    snapback: 0,
    hits: 0,
  };
}

export class Game {
  /**
   * @param {{mode?: 'free'|'targets', tapJump?: boolean, onFeedback?: Function, onRecord?: Function,
   *          bestTime?: number|null, fighter?: string, inputBuffer?: number}} o  fighter: roster id;
   *          inputBuffer: frames a press is carried forward until the fighter can act (FRAMES.INPUT_BUFFER)
   */
  constructor(o = {}) {
    this.mode = o.mode || 'free';
    this.tapJump = o.tapJump ?? true;
    this.setInputBuffer(o.inputBuffer ?? FRAMES.INPUT_BUFFER);
    this.onFeedback = o.onFeedback || (() => {});
    this.onRecord = o.onRecord || (() => {});
    this.bestTime = o.bestTime ?? null;
    this.stats = newStats();
    this.frame = 0;
    this.pad = new PadState();
    // Warn about stick snapback as the game sees it (once per 60 Hz frame).
    this.snapWatch = new SnapbackWatch((e) => { this.stats.snapback++; this.feedback(describeSnap(e), 'red'); });
    this.fighter = new Fighter(this, o.fighter);
    this.sparks = [];
    this.effects = [];
    this.resetRun();
  }

  /** Input buffer length in frames (0 = strict, like Melee). See FRAMES.INPUT_BUFFER. */
  setInputBuffer(n) {
    const v = Math.round(Number(n));
    this.inputBuffer = Number.isFinite(v) ? Math.min(FRAMES.INPUT_BUFFER_MAX, Math.max(0, v)) : FRAMES.INPUT_BUFFER;
  }

  feedback(text, tone = 'lavender') {
    if (!store.get('techFeedback')) return; // off by default (owner: noisy, and not 1:1 with Melee)
    this.onFeedback({ text, tone, frame: this.frame });
  }

  /** Reset fighter + targets (+ timer in target mode). */
  resetRun() {
    this.fighter.spawn(STAGE.spawn, false);
    this.targets = TARGETS.map((t, i) => ({ ...t, id: i, alive: true, brokenAt: -1 }));
    this.sparks = [];
    this.dummy = this.mode === 'free' ? new Dummy(this.fighter.profile) : null;
    this.timer = { state: this.mode === 'targets' ? 'ready' : 'off', start: 0, end: 0 };
  }

  /** Switch the fighter's movement profile (restarts the run). */
  setFighter(id) {
    this.fighter.setProfile(id);
    this.resetRun();
  }

  setMode(mode) {
    this.mode = mode;
    this.resetRun();
  }

  resetStats() { this.stats = newStats(); }

  /** Elapsed target-test time in ms (live while running). */
  elapsedMs() {
    const t = this.timer;
    if (t.state === 'running') return (this.frame - t.start) * STEP_MS;
    if (t.state === 'done') return (t.end - t.start) * STEP_MS;
    return 0;
  }

  get targetsLeft() { return this.targets.filter((t) => t.alive).length; }

  /** Projectiles ("sparks"): {x, y, vx, vy, g, bounce, life, r, look, hit: {dmg, angle, bkb, kbg, flinch, name}}. */
  spawnProjectile(o) {
    this.sparks.push({ vy: 0, g: 0, bounce: 0, r: 3, ...o, prevX: o.x, prevY: o.y });
  }

  /** Advance one frame with an InputManager snapshot. */
  step(snapshot) {
    this.frame++;
    const p = this.pad;
    p.update(snapshot);
    this.snapWatch.update(p.x, p.y, this.frame * STEP_MS);
    const f = this.fighter;

    // Target test: the clock starts on the first real input after a reset.
    if (this.timer.state === 'ready' && p.any) { this.timer.state = 'running'; this.timer.start = this.frame - 1; }

    f.step(p);

    // Projectiles: fly (with gravity / bounces off the floor) and fade.
    for (const s of this.sparks) {
      s.prevX = s.x; s.prevY = s.y;
      s.vy -= s.g; s.x += s.vx; s.y += s.vy; s.life--;
      const M = STAGE.main;
      if (s.y < M.y + s.r && s.prevY >= M.y + s.r && s.x > M.x1 && s.x < M.x2) {
        if (s.bounce) { s.y = M.y + s.r; s.vy = s.bounce; } else if (s.g) s.life = 0;
      }
    }
    this.sparks = this.sparks.filter((s) => s.life > 0 && s.x > STAGE.blast.left && s.x < STAGE.blast.right && s.y > STAGE.blast.bottom);

    // Hits: fighter hitboxes and projectiles vs targets.
    const boxes = f.activeHitboxes();
    for (const t of this.targets) {
      if (!t.alive) continue;
      let hit = boxes.some((b) => Math.hypot(b.x - t.x, b.y - t.y) <= b.r + TARGET_R);
      for (const s of this.sparks) {
        if (s.life > 0 && segDist(s, t.x, t.y) <= TARGET_R + s.r) { hit = true; s.life = 0; }
      }
      if (hit) this.breakTarget(t);
    }

    // Training dummy: the first active hitbox of each hit group that touches it connects.
    const d = this.dummy;
    if (d) {
      for (const b of boxes) {
        if (b.grab || f.hitGroups.has(b.g) || !d.touches(b.x, b.y, b.r)) continue;
        this.hitDummy(b, Math.sign(d.x - f.x) || f.facing);
        f.onHit(b);
      }
      for (const s of this.sparks) {
        if (s.life > 0 && d.hittable && segDist(s, d.x, d.y + 7) <= s.r + 7) { this.hitDummy(s.hit, Math.sign(s.vx) || 1); s.life = 0; }
      }
      if (d.step() === 'ko') this.feedback(t('Dummy KO at {pct}%', { pct: Math.floor(d.percent) }), 'green');
    }

    // Free play: targets come back after a while.
    if (this.mode === 'free') {
      for (const t of this.targets) if (!t.alive && this.frame - t.brokenAt >= FRAMES.TARGET_RESPAWN) t.alive = true;
    }

    // Blast zones.
    const b = STAGE.blast;
    if (f.state !== 'dead' && f.state !== 'respawn' && (f.x < b.left || f.x > b.right || f.y < b.bottom || f.y > b.top)) f.ko();

    // Age effects.
    this.effects = this.effects.filter((e) => this.frame - e.frame < e.life);
  }

  /** Apply a hit to the dummy and show "Move · dmg% · KB n · tag". */
  hitDummy(h, dir) {
    const d = this.dummy;
    const res = d.takeHit(h, dir);
    this.stats.hits++;
    const parts = [t('{move} · {dmg}% · KB {kb}', { move: h.name, dmg: +h.dmg.toFixed(1), kb: Math.round(res.kb) })];
    if (h.flinch === false) parts.push(t('no flinch'));
    if (h.tag) parts.push(t(h.tag));
    if (h.charged) parts.push(t('charged {n}f', { n: h.charged }));
    d.last = { text: parts.join(' · '), ...res, frame: this.frame };
    this.feedback(d.last.text, 'blue');
  }

  breakTarget(target) {
    target.alive = false;
    target.brokenAt = this.frame;
    this.stats.targets++;
    this.effects.push({ kind: 'burst', x: target.x, y: target.y, frame: this.frame, life: 30 });
    if (this.timer.state === 'running' && this.targetsLeft === 0) {
      this.timer.state = 'done';
      this.timer.end = this.frame;
      const ms = this.elapsedMs();
      const record = this.bestTime == null || ms < this.bestTime;
      if (record) { this.bestTime = ms; this.onRecord(ms); }
      this.feedback(record ? t('All targets cleared in {time}. New best!', { time: formatTime(ms) }) : t('All targets cleared in {time}', { time: formatTime(ms) }), 'green');
    }
  }
}

/** Closest distance from (cx, cy) to a projectile's path this frame (prev → current). */
function segDist(s, cx, cy) {
  const dx = s.x - s.prevX; const dy = s.y - s.prevY;
  const len2 = dx * dx + dy * dy;
  const k = len2 ? Math.max(0, Math.min(1, ((cx - s.prevX) * dx + (cy - s.prevY) * dy) / len2)) : 0;
  return Math.hypot(s.prevX + dx * k - cx, s.prevY + dy * k - cy);
}

export function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(2).padStart(5, '0');
  return m ? `${m}:${rest}` : `${s.toFixed(2)}s`;
}

