/**
 * game.js (The simulation): the ported meleelight engine (engine/world.js) running one fighter, the
 * training dummy (free play), projectiles, targets and the target-test timer, one 60 Hz frame at a time.
 *
 * Per frame: the input snapshot goes through PadState (edges, smash detection, snapback watch) and
 * EngineInput (meleelight's input record + the optional input buffer), the engine steps, then the
 * technique coach (techniques.js) explains what happened, targets and dummy hits are scored.
 *
 * The Game knows nothing about the DOM or the canvas. play.js feeds it input snapshots from a
 * fixed-timestep accumulator and render.js draws whatever state it is in.
 */
import { store } from './store.js';
import { FRAMES, STEP_MS, FIGHTERS } from './constants.js';
import { engineStage, TARGETS, TARGET_R } from './stage.js';
import { World, inputData } from './engine/world.js';
import { buildRoster } from './engine/roster.js';
import { templateOf } from './engine/ml.js';
import { aArticles } from './engine/article.js';
import { Fighter, Body } from './fighter.js';
import { Coach, pressUsed, moveName } from './techniques.js';
import { PadState, EngineInput } from './controller.js';
import { SnapbackWatch, describeSnap } from './analysis.js';
import { t } from '../../i18n/index.js';

buildRoster(FIGHTERS);

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

/** The training dummy (port 1): a second player of the same fighter that never presses anything. */
class Dummy extends Body {
  constructor(game) { super(game, 1); this.last = null; }
  get hittable() { return this.pose !== 'dead'; }
  get state() { return this.pose === 'dead' ? 'dead' : this.pose === 'hitstun' ? 'hitstun' : 'stand'; }
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
    this.engineInput = new EngineInput();
    // Warn about stick snapback as the game sees it (once per 60 Hz frame).
    this.snapWatch = new SnapbackWatch((e) => { this.stats.snapback++; this.feedback(describeSnap(e), 'red'); });
    this.fighter = new Fighter(this, o.fighter);
    this.coach = new Coach(this);
    this.effects = [];
    this.resetRun();
  }

  /** Input buffer length in frames (0 = strict, like Melee). See FRAMES.INPUT_BUFFER. */
  setInputBuffer(n) {
    const v = Math.round(Number(n));
    this.inputBuffer = Number.isFinite(v) ? Math.min(FRAMES.INPUT_BUFFER_MAX, Math.max(0, v)) : FRAMES.INPUT_BUFFER;
  }

  feedback(text, tone = 'lavender') {
    if (!store.get('techFeedback')) return; // off by default (owner: noisy)
    this.onFeedback({ text, tone, frame: this.frame });
  }

  /** Reset fighter, dummy and targets (+ timer in target mode): a fresh engine world. */
  resetRun() {
    const id = this.fighter.engineId;
    this.world = new World({ stage: engineStage(), fighter: id, dummy: this.mode === 'free' ? id : null });
    this.dummy = this.mode === 'free' ? new Dummy(this) : null;
    this.fighter.trail = [];
    this.targets = TARGETS.map((tg, i) => ({ ...tg, id: i, alive: true, brokenAt: -1 }));
    this.timer = { state: this.mode === 'targets' ? 'ready' : 'off', start: 0, end: 0 };
    this.engineInput.clear();
    this.coach.reset();
    this.effects = [];
  }

  /** Switch fighter (restarts the run). */
  setFighter(id) {
    this.fighter.setProfile(id);
    this.resetRun();
  }

  setMode(mode) {
    this.mode = mode;
    this.resetRun();
  }

  resetStats() { this.stats = newStats(); }

  /** The meleelight character a port's fighter is built on (roster.js). */
  templateOf(port) { return templateOf[this.world.characterSelections[port]]; }

  /** Projectiles in flight: [{x, y, prevX, prevY, kind}]. */
  get projectiles() {
    return aArticles.map((a) => ({ x: a.instance.pos.x, y: a.instance.pos.y, prevX: a.instance.posPrev.x, prevY: a.instance.posPrev.y, kind: a.name, r: a.instance.hb.size }));
  }

  /** Elapsed target-test time in ms (live while running). */
  elapsedMs() {
    const tm = this.timer;
    if (tm.state === 'running') return (this.frame - tm.start) * STEP_MS;
    if (tm.state === 'done') return (tm.end - tm.start) * STEP_MS;
    return 0;
  }

  get targetsLeft() { return this.targets.filter((tg) => tg.alive).length; }

  /** Advance one frame with an InputManager snapshot. */
  step(snapshot) {
    this.frame++;
    const p = this.pad;
    p.update(snapshot);
    this.snapWatch.update(p.x, p.y, this.frame * STEP_MS);
    const w = this.world;
    const pl = w.player[0];

    // Target test: the clock starts on the first real input after a reset.
    if (this.timer.state === 'ready' && p.any) { this.timer.state = 'running'; this.timer.start = this.frame - 1; }

    const before = { state: pl.actionState, timer: pl.timer, fastfalled: pl.phys.fastfalled };
    const N = this.inputBuffer;
    const f = this.engineInput.frame(p, inputData, pl.actionState, N);
    const dummyPct = this.dummy ? w.player[1].percent : 0;
    const dummyState = this.dummy ? w.player[1].actionState : '';
    w.step([f.input], { tapJump: this.tapJump, edges: f.edges });
    const after = { state: pl.actionState, timer: pl.timer };

    // Input buffer bookkeeping and "why didn't my jump come out".
    const used = pressUsed(before, after);
    const canBuffer = (k) => !/^(DEAD|REBIRTH)/.test(before.state)
      && !(k === 'jump' && before.state === 'KNEEBEND')
      && !(k === 'shield' && /^ATTACKAIR/.test(before.state));
    const res = this.engineInput.settle(f, used, N, canBuffer);
    for (const u of res.used) if (u.kind === 'jump') this.feedback(t('Buffered jump · pressed {n}f early', { n: u.age }), 'lavender');
    if ('jump' in res.expired) {
      const why = this.coach.jumpBlockedReason(pl);
      if (why) this.feedback(why, 'yellow');
    }

    this.coach.frame({ before, after, input: f.input, pad: p, real: f.real, offered: f.offered, frame: this.frame, pl });
    this.fighter.afterStep();
    // Sir Retro: the number his side special shows, and his bucket filling up.
    if (pl.retro) {
      if (/^SIDESPECIAL/.test(after.state) && !/^SIDESPECIAL/.test(before.state)) this.feedback(t('Side special · number {n}', { n: pl.retro.number }), pl.retro.number === 9 ? 'green' : 'lavender');
      if (pl.retro.bucket > (this.lastBucket ?? 0)) this.feedback(t('Bucket {n}/3', { n: pl.retro.bucket }), 'yellow');
      this.lastBucket = pl.retro.bucket;
    }

    // Targets: hitboxes (swept) and projectiles.
    for (const i of w.targetHits(this.targets, TARGET_R)) this.breakTarget(this.targets[i]);
    if (this.mode === 'free') {
      for (const tg of this.targets) if (!tg.alive && this.frame - tg.brokenAt >= FRAMES.TARGET_RESPAWN) tg.alive = true;
    }

    // Training dummy: report hits and KOs.
    if (this.dummy) {
      const d = w.player[1];
      if (d.percent > dummyPct + 1e-9) this.reportHit(d, d.percent - dummyPct);
      if (/^DEAD/.test(d.actionState) && !/^DEAD/.test(dummyState)) {
        this.feedback(t('Dummy KO at {pct}%', { pct: Math.floor(dummyPct) }), 'green');
      }
      this.dummy.afterStep();
    }

    // Age effects.
    this.effects = this.effects.filter((e) => this.frame - e.frame < e.life);
  }

  /** The dummy took damage this frame: "Move · dmg% · KB n" chip (+ "charged nf" for a charged smash). */
  reportHit(d, dmg) {
    const a = this.world.player[0];
    this.stats.hits++;
    const kb = d.hit.knockback;
    const parts = [t('{move} · {dmg}% · KB {kb}', { move: moveName(a.actionState), dmg: +dmg.toFixed(1), kb: Math.round(kb) })];
    if (a.phys.chargeFrames > 0) parts.push(t('charged {n}f', { n: a.phys.chargeFrames }));
    this.dummy.last = { text: parts.join(' · '), kb, stun: d.hit.hitstun, dmg, frame: this.frame };
    this.effects.push({ kind: 'hit', x: d.hit.hitPoint.x, y: d.hit.hitPoint.y, frame: this.frame, life: 14 });
    this.feedback(this.dummy.last.text, 'blue');
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

export function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(2).padStart(5, '0');
  return m ? `${m}:${rest}` : `${s.toFixed(2)}s`;
}
