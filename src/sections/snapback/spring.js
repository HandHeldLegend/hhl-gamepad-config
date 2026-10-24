/**
 * Spring snapback (type 3): the firmware's gate, ported exactly, and the fit that tunes it to one stick
 * from captures (the tuning flow in tune.js). Pure functions, no DOM.
 *
 * The filter (HOJA-LIB-RP2040 src/input/snapback/snapback_spring.c) holds back only the rebound after
 * a release:
 *   - Releases from the edge: a stick past 1600 falls through 1200. The free spring
 *     s[n+1] = a1 s[n] + a2 s[n-1] (a1, a2 in Q16 for the octant it left from) runs on from there; if the
 *     stick stays within decide_step × k counts of it at sample k (k = 2..6, 3 ms), it was let go and the
 *     output holds at neutral. Otherwise the thumb has it and it passes.
 *   - Turnarounds (let go partway): a centre crossing faster than cross_speed counts a sample is held for
 *     5 samples while the stiffness along the last direction out is measured. At 1/stiff_den or more it is
 *     the spring (hold), else the thumb (pass).
 *   - A hold ends when the thumb takes the stick back (one-step error over grab_err, 3 samples running),
 *     or once it settles within the stick's deadzone (clamped to 40..200) for 10 ms, 100 ms at most.
 *   - The sample a fast crossing is found on is already past centre, so it is held too.
 *
 * Captures (device 'spring-capture'): 256 samples of x and y at 2 kHz, ±2048, as the filter sees them,
 * 48 of them before the stick fell back under 500.
 */

export const SAMPLE_MS = 0.5;
export const CAPTURE_PRE = 48;

/** The firmware's built-in tuning (a ProGCC 3S left stick), used until a stick is tuned. */
export const SPRING_DEFAULTS = Object.freeze({
  a1: [126802, 125429, 125618, 124742, 124719, 125250, 126071, 126201],
  a2: [-62953, -62076, -62255, -61868, -61619, -62021, -62529, -62543],
  decide_step: 45,
  grab_err: 40,
  stiff_den: 25,
  cross_speed: 20,
});

/** What the firmware accepts (anything else and it falls back to the defaults). */
export const SPRING_LIMITS = Object.freeze({
  a1: [98304, 131072],
  a2: [-65535, -52429],
  decide_step: [10, 300],
  grab_err: [10, 300],
  stiff_den: [5, 200],
  cross_speed: [5, 200],
});

const EDGE = 1600;
const RELEASE = 1200;
const DECIDE = 6;
const OUT = 300;
const CHECK = 5;
const GRAB_COUNT = 3;
/** A hold ends once the stick stays within its deadzone (clamped to this range) for SETTLE_COUNT samples. */
const SETTLED_RANGE = [40, 200];
/** The firmware's default inner deadzone (analogConfig_s l/r_deadzone), used when none is given. */
export const DEFAULT_DEADZONE = 144;
const SETTLE_COUNT = 20;
const HOLD_MAX = 200;

/** Gate states, as the trace reports them. */
export const GATE = { IDLE: 0, EDGE: 1, DECIDING: 2, CHECKING: 3, HOLDING: 4 };

/** The octant of (x, y): 0 is +x, counting towards +y (within 22.5° of an axis or a diagonal). */
export function octant(x, y) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ay * 10000 <= ax * 4142) return x >= 0 ? 0 : 4;
  if (ax * 10000 <= ay * 4142) return y >= 0 ? 2 : 6;
  if (x >= 0) return y >= 0 ? 1 : 7;
  return y >= 0 ? 3 : 5;
}

const next = (p, o, s1, s2) => Math.floor((p.a1[o] * s1 + p.a2[o] * s2) / 65536); // >> 16
const sq = (dx, dy) => dx * dx + dy * dy;
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/**
 * Run the firmware's gate over a capture.
 * @param {ArrayLike<number>} xs
 * @param {ArrayLike<number>} ys
 * @param {typeof SPRING_DEFAULTS} p  the tuning
 * @param {{measure?: boolean, deadzone?: number}} [o]  measure: check every centre crossing faster than 5
 *   counts a sample and never hold on one (each check's stiffness and speed are reported in `checks`); for
 *   the fit. deadzone: the stick's inner deadzone, which the firmware settles a hold within
 * @returns {{x: Int16Array, y: Int16Array, state: Uint8Array, checks: {at: number, speed: number, k: number}[]}}
 */
export function runGate(xs, ys, p, o = {}) {
  const n = Math.min(xs.length, ys.length);
  const outX = new Int16Array(n);
  const outY = new Int16Array(n);
  const trace = new Uint8Array(n);
  const checks = [];
  const crossSpeed = o.measure ? 5 : p.cross_speed;
  const settled = clamp(o.deadzone ?? DEFAULT_DEADZONE, SETTLED_RANGE);
  const s = {
    state: GATE.IDLE, oct: 0, step: 0, grab: 0, settle: 0, hold: 0, ex: 0, ey: 0,
    x1: 0, y1: 0, x2: 0, y2: 0, fx1: 0, fy1: 0, fx2: 0, fy2: 0, rx: 0, ry: 0, p1: 0, p2: 0, num: 0, den: 0, at: 0, speed: 0,
  };
  for (let i = 0; i < n; i++) {
    const x = xs[i] | 0;
    const y = ys[i] | 0;
    const d = Math.floor(Math.hypot(x, y));
    const px = next(p, s.oct, s.x1, s.x2);
    const py = next(p, s.oct, s.y1, s.y2);
    const fx = next(p, s.oct, s.fx1, s.fx2);
    const fy = next(p, s.oct, s.fy1, s.fy2);
    const stepErr = sq(x - px, y - py);
    const freeErr = sq(x - fx, y - fy);
    const past = x * s.ex + y * s.ey < 0;
    let p0 = x * s.rx + y * s.ry;
    const acc = p0 - 2 * s.p1 + s.p2;
    const outSq = s.rx * s.rx + s.ry * s.ry;
    const fall = s.p1 - p0;
    const crossing = outSq > 0 && s.p1 >= 0 && p0 < 0 && fall * fall >= crossSpeed * crossSpeed * outSq;
    let neutral = false;
    switch (s.state) {
      case GATE.IDLE:
        if (d >= EDGE) s.state = GATE.EDGE;
        else if (crossing) {
          s.state = GATE.CHECKING;
          s.step = 0; s.num = 0; s.den = 0;
          s.at = i; s.speed = fall / Math.sqrt(outSq);
          neutral = true; // this sample is already past centre
        }
        break;
      case GATE.EDGE:
        if (d >= EDGE) { s.ex = x; s.ey = y; } else if (d < RELEASE) {
          s.oct = octant(s.ex, s.ey);
          s.fx2 = s.x1; s.fy2 = s.y1; s.fx1 = x; s.fy1 = y;
          s.step = 0;
          s.state = GATE.DECIDING;
        }
        break;
      case GATE.DECIDING: {
        s.step++;
        s.fx2 = s.fx1; s.fy2 = s.fy1; s.fx1 = fx; s.fy1 = fy;
        const limit = p.decide_step * s.step;
        if (s.step >= 2 && freeErr > limit * limit) s.state = GATE.IDLE;
        else {
          if (s.step >= DECIDE) holdStart(s);
          neutral = past || s.state === GATE.HOLDING;
        }
        break;
      }
      case GATE.CHECKING:
        s.step++;
        if (s.step >= 2) { s.num += acc * s.p1; s.den += s.p1 * s.p1; }
        if (s.step >= CHECK) {
          // -num × stiff_den >= den, in BigInt: the product passes 2^53
          const spring = s.den > 0 && BigInt(-s.num) * BigInt(p.stiff_den) >= BigInt(s.den);
          if (o.measure) {
            checks.push({ at: s.at, speed: s.speed, k: s.den > 0 ? -s.num / s.den : 0 });
            s.state = GATE.IDLE;
          } else if (spring) {
            s.oct = octant(s.rx, s.ry);
            holdStart(s);
          } else s.state = GATE.IDLE;
        }
        neutral = s.state === GATE.CHECKING || s.state === GATE.HOLDING;
        break;
      case GATE.HOLDING:
        s.hold++;
        s.grab = stepErr > p.grab_err * p.grab_err ? s.grab + 1 : 0;
        s.settle = d < settled ? s.settle + 1 : 0;
        if (s.grab >= GRAB_COUNT) s.state = d >= EDGE ? GATE.EDGE : GATE.IDLE;
        else if (s.settle >= SETTLE_COUNT || s.hold >= HOLD_MAX) s.state = GATE.IDLE;
        else neutral = true;
        break;
      default:
        break;
    }
    if (s.state === GATE.IDLE && d >= EDGE) s.state = GATE.EDGE;
    if ((s.state === GATE.IDLE || s.state === GATE.EDGE) && d > OUT) {
      s.rx = x; s.ry = y;
      p0 = x * x + y * y;
      s.p1 = p0; s.p2 = p0;
    } else {
      s.p2 = s.p1; s.p1 = p0;
    }
    s.x2 = s.x1; s.y2 = s.y1; s.x1 = x; s.y1 = y;
    outX[i] = neutral ? 0 : x;
    outY[i] = neutral ? 0 : y;
    trace[i] = s.state;
  }
  return { x: outX, y: outY, state: trace, checks };
}

function holdStart(s) {
  s.state = GATE.HOLDING;
  s.hold = 0; s.grab = 0; s.settle = 0;
}

// ---- Reading a capture -----------------------------------------------------------------------

/** Where the stick was furthest out before it came back: index, distance and direction. */
function peak(c) {
  let at = 0;
  let best = -1;
  for (let i = 0; i < Math.min(CAPTURE_PRE, c.x.length); i++) {
    const d = Math.hypot(c.x[i], c.y[i]);
    if (d > best) { best = d; at = i; }
  }
  return { at, d: best, x: c.x[at], y: c.y[at] };
}

/** Position along the direction (ex, ey), per sample. */
function along(c, ex, ey) {
  const n = Math.hypot(ex, ey) || 1;
  return Array.from(c.x, (x, i) => (x * ex + c.y[i] * ey) / n);
}

/** Least squares for s[n+1] = a1 s[n] + a2 s[n-1]. */
function fitAr2(s) {
  let s11 = 0; let s12 = 0; let s22 = 0; let b1 = 0; let b2 = 0;
  for (let i = 2; i < s.length; i++) {
    const u = s[i - 1]; const v = s[i - 2]; const w = s[i];
    s11 += u * u; s12 += u * v; s22 += v * v; b1 += u * w; b2 += v * w;
  }
  const det = s11 * s22 - s12 * s12;
  if (!det) return null;
  const a1 = (b1 * s22 - b2 * s12) / det;
  const a2 = (s11 * b2 - s12 * b1) / det;
  let e = 0;
  for (let i = 2; i < s.length; i++) e += (s[i] - a1 * s[i - 1] - a2 * s[i - 2]) ** 2;
  return { a1, a2, rms: Math.sqrt(e / Math.max(1, s.length - 2)) };
}

/** Ringing frequency (Hz) and damping ratio of a fitted spring, or null if it doesn't ring. */
export function springShape(a1, a2) {
  const disc = a1 * a1 + 4 * a2;
  if (disc >= 0 || a2 >= 0) return null;
  const mag = Math.sqrt(-a2);
  const ang = Math.atan2(Math.sqrt(-disc) / 2, a1 / 2);
  const dt = SAMPLE_MS / 1000;
  const wd = ang / dt;
  const sigma = -Math.log(mag) / dt;
  const w0 = Math.hypot(wd, sigma);
  return { hz: wd / (2 * Math.PI), zeta: w0 ? sigma / w0 : 0 };
}

// The move a capture was made for: from its start until 30 ms after the stick fell back under 500. A
// thumb move is often followed by letting go, which the gate rightly holds; that isn't the move.
const MOVE_END = CAPTURE_PRE + 60;
const FREE_SAMPLES = 120;   // 60 ms of the free swing after the first centre crossing
/** decide_step stays this far under the closest thumb move (ratio), so none of them is held. */
const THUMB_MARGIN = 1.1;
/** grab_err's range: past the ceiling the thumb taking the stick back takes too long to pass. */
const GRAB_MIN = 60;
const GRAB_MAX = 100;
const RELEASE_MAX_MS = 4;   // release line to centre: real releases take 1.5-3 ms, guided returns 5.5+
const FIT_RMS_MAX = 30;

/**
 * Is this capture a clean release from the edge? If so, its spring.
 * @returns {{ok: true, octant: number, ms: number, a1: number, a2: number, rms: number}
 *   | {ok: false, why: 'edge'|'guided'|'spring'}}
 */
export function readRelease(c) {
  const pk = peak(c);
  if (pk.d < EDGE) return { ok: false, why: 'edge' };
  const p = along(c, pk.x, pk.y);
  let line = -1;
  for (let i = pk.at; i < p.length; i++) if (Math.hypot(c.x[i], c.y[i]) < RELEASE) { line = i; break; }
  if (line < 0) return { ok: false, why: 'edge' };
  let cross = -1;
  for (let i = line; i < p.length - 1; i++) if (p[i] > 0 && p[i + 1] <= 0) { cross = i; break; }
  if (cross < 0) return { ok: false, why: 'guided' };
  const ms = (cross + 1 - line) * SAMPLE_MS;
  if (ms > RELEASE_MAX_MS) return { ok: false, why: 'guided', ms };
  const fit = fitAr2(p.slice(cross, cross + FREE_SAMPLES));
  const shape = fit && springShape(fit.a1, fit.a2);
  if (!fit || !shape || fit.rms > FIT_RMS_MAX || shape.hz < 25 || shape.hz > 150 || shape.zeta > 0.5) {
    return { ok: false, why: 'spring' };
  }
  return { ok: true, octant: octant(pk.x, pk.y), ms, ...fit, ...shape };
}

/**
 * Is this capture a turnaround (pushed out, then let go partway back)? Its first fast centre crossing,
 * measured the way the gate measures it. A clean release from the edge is the release step's. One that
 * crosses no faster than the default cross_speed is turned away: the gate wouldn't check it, and catching
 * it would take a lower cross_speed, which checks (and holds) more thumb moves.
 * @returns {{ok: true, speed: number, k: number} | {ok: false, why: 'release'|'slow'|'slow-crossing', speed?: number}}
 */
export function readTurnaround(c) {
  if (readRelease(c).ok) return { ok: false, why: 'release' };
  const { checks } = runGate(c.x, c.y, SPRING_DEFAULTS, { measure: true });
  const first = checks.find((ch) => ch.at < MOVE_END && ch.speed >= 10);
  if (!first) return { ok: false, why: 'slow' };
  if (first.speed <= SPRING_DEFAULTS.cross_speed) return { ok: false, why: 'slow-crossing', speed: first.speed };
  return { ok: true, speed: first.speed, k: first.k };
}

/**
 * A thumb move: anything the thumb guides, starting from the edge (where the release check runs). One
 * that looks like a let-go is turned away.
 * @returns {{ok: true} | {ok: false, why: 'edge'|'released'}}
 */
export function readThumb(c) {
  if (peak(c).d < EDGE) return { ok: false, why: 'edge' };
  const t = readTurnaround(c);
  if (t.why === 'release' || (t.ok && t.k >= 2 / SPRING_DEFAULTS.stiff_den)) return { ok: false, why: 'released' };
  return { ok: true };
}

// ---- The fit ---------------------------------------------------------------------------------

/**
 * Each time a capture leaves the edge (past 1600, then under 1200): where it crossed the release line and
 * how far it strayed from the free spring from there, the worst err_k / k over k = 2..6 (what the gate's
 * release check compares with decide_step). A release stays close; the thumb strays.
 * @returns {{at: number, ratio: number}[]}
 */
function edgeExits(c, p) {
  const n = c.x.length;
  const out = [];
  let ex = 0; let ey = 0; let edge = false;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(c.x[i], c.y[i]);
    if (d >= EDGE) { edge = true; ex = c.x[i]; ey = c.y[i]; continue; }
    if (!edge || d >= RELEASE) continue;
    edge = false;
    const o = octant(ex, ey);
    let fx2 = c.x[i - 1]; let fy2 = c.y[i - 1]; let fx1 = c.x[i]; let fy1 = c.y[i];
    let worst = 0;
    for (let k = 1; k <= DECIDE && i + k < n; k++) {
      const fx = next(p, o, fx1, fx2);
      const fy = next(p, o, fy1, fy2);
      fx2 = fx1; fy2 = fy1; fx1 = fx; fy1 = fy;
      if (k >= 2) worst = Math.max(worst, Math.hypot(c.x[i + k] - fx, c.y[i + k] - fy) / k);
    }
    out.push({ at: i, ratio: worst });
  }
  return out;
}

/** How far the capture's first exit from the edge strays from the free spring (null: it never left one). */
function decideRatio(c, p) {
  return edgeExits(c, p)[0]?.ratio ?? null;
}

/** The worst one-step miss the spring makes while a release is held (3 samples running). */
function holdMiss(c, p, dz) {
  const g = runGate(c.x, c.y, { ...p, grab_err: SPRING_LIMITS.grab_err[1] }, { deadzone: dz });
  const pk = peak(c);
  const o = octant(pk.x, pk.y);
  const run = [];
  let worst = 0;
  for (let i = 2; i < c.x.length; i++) {
    if (g.state[i] !== GATE.HOLDING) { run.length = 0; continue; }
    run.push(Math.hypot(c.x[i] - next(p, o, c.x[i - 1], c.x[i - 2]), c.y[i] - next(p, o, c.y[i - 1], c.y[i - 2])));
    if (run.length > GRAB_COUNT) run.shift();
    if (run.length === GRAB_COUNT) worst = Math.max(worst, Math.min(...run));
  }
  return worst;
}

/**
 * Fit a tuning to one stick from its captures.
 * @param {{releases: object[], turnarounds: object[], thumbs: object[]}} caps  captures ({x, y}) by step
 * @returns {{params: typeof SPRING_DEFAULTS, shape: {hz: number, zeta: number}[], notes: object}}
 */
export function fitSpring({ releases, turnarounds, thumbs }, deadzone = DEFAULT_DEADZONE) {
  // a1, a2 per octant: the mean of that octant's releases. An octant with none borrows its neighbours.
  const per = Array.from({ length: 8 }, () => []);
  for (const c of releases) {
    const r = readRelease(c);
    if (r.ok) per[r.octant].push(r);
  }
  const mean = (list, k) => list.reduce((a, r) => a + r[k], 0) / list.length;
  const a1 = []; const a2 = [];
  for (let o = 0; o < 8; o++) {
    let list = per[o];
    if (!list.length) list = [...per[(o + 7) % 8], ...per[(o + 1) % 8]];
    if (!list.length) list = per.flat();
    a1.push(list.length ? clamp(Math.round(mean(list, 'a1') * 65536), SPRING_LIMITS.a1) : SPRING_DEFAULTS.a1[o]);
    a2.push(list.length ? clamp(Math.round(mean(list, 'a2') * 65536), SPRING_LIMITS.a2) : SPRING_DEFAULTS.a2[o]);
  }
  const p = { ...SPRING_DEFAULTS, a1, a2 };

  // decide_step: as high as the thumb moves allow, THUMB_MARGIN under the closest one, so releases wider
  // than any seen in one round are still held (a thumb move never comes near it, so that costs nothing).
  // At least what the releases need (the default, or their worst + 20 % if smaller, never under their
  // worst + 5 %); with no thumb moves, just that. When the releases need more than the thumb moves allow,
  // the two overlap: the releases win (a held rebound matters more), and the thumb moves inside are
  // flagged unclear, to be done again.
  const relWorst = Math.max(0, ...releases.map((c) => decideRatio(c, p) ?? 0));
  const thumbRatios = thumbs.map((c) => decideRatio(c, p)).filter((v) => v != null);
  const thumbBest = thumbRatios.length ? Math.min(...thumbRatios) : null;
  const need = Math.max(relWorst * 1.05, Math.min(SPRING_DEFAULTS.decide_step, relWorst * 1.2));
  const thumbCap = thumbBest == null ? Infinity : thumbBest / THUMB_MARGIN;
  const overlap = relWorst * 1.05 > thumbCap;
  const decide = overlap ? Math.ceil(relWorst * 1.05) : Number.isFinite(thumbCap) ? Math.max(Math.ceil(need), Math.floor(thumbCap)) : Math.ceil(need);
  p.decide_step = clamp(decide, SPRING_LIMITS.decide_step);

  // cross_speed: below the slowest turnaround's crossing, but never under the default: each crossing checked
  // costs 3 ms of hold by design, so a lower one would add that to more thumb moves. Turnarounds too slow
  // for the default to catch are turned away when recorded (readTurnaround), to be redone.
  const turns = turnarounds.map(readTurnaround).filter((r) => r.ok);
  if (turns.length) {
    const slowest = Math.min(...turns.map((r) => r.speed));
    p.cross_speed = clamp(Math.max(SPRING_DEFAULTS.cross_speed, Math.floor(slowest * 0.7)), SPRING_LIMITS.cross_speed);
  }

  // stiff_den: the stiffness threshold between the softest turnaround and the stiffest fast thumb crossing
  const thumbK = thumbs.flatMap((c) => runGate(c.x, c.y, p, { measure: true }).checks)
    .filter((ch) => ch.at < MOVE_END && ch.speed >= p.cross_speed).map((ch) => ch.k);
  const hi = turns.length ? Math.min(...turns.map((r) => r.k)) : null;
  const lo = thumbK.length ? Math.max(...thumbK) : null;
  if (hi != null && hi > 0) {
    const k = lo == null || lo < hi ? Math.sqrt(Math.max(lo ?? 0, hi / 4) * hi) : hi * 0.95;
    p.stiff_den = clamp(Math.round(1 / k), SPRING_LIMITS.stiff_den);
  }

  // grab_err: twice the spring's own one-step miss while the releases are held (3 samples running, as the
  // grab counts), GRAB_MIN..GRAB_MAX: one round doesn't show all of a stick's swing and swirl. It only acts
  // during a hold, which thumb moves never enter; a higher one notices a real grab a sample or two later.
  const miss = Math.max(0, ...releases.map((c) => holdMiss(c, p, deadzone)));
  p.grab_err = Math.min(GRAB_MAX, Math.max(GRAB_MIN, Math.ceil(miss * 2)));

  return {
    params: p,
    shape: a1.map((v, o) => springShape(v / 65536, a2[o] / 65536)),
    notes: { relWorst, thumbBest, overlap, turnK: hi, thumbK: lo, holdMiss: miss },
  };
}

// ---- The scorecard ---------------------------------------------------------------------------

const DELAY_OK_MS = 3;

/** Position along the direction the stick left from (its furthest point before coming back). */
function edgeDir(c) {
  const pk = peak(c);
  const n = Math.hypot(pk.x, pk.y) || 1;
  return { pk, ux: pk.x / n, uy: pk.y / n };
}

/** Did the gate keep this capture's rebound inside the deadzone (what a game sees as centre)? */
function blocked(c, g, dz) {
  const { pk, ux, uy } = edgeDir(c);
  for (let i = pk.at; i < c.x.length; i++) if (g.x[i] * ux + g.y[i] * uy < -dz) return false;
  return true;
}

/**
 * What the gate did to a thumb move that a game could see. Only the thumb's part counts: if the stick was
 * let go after the move (a later exit from the edge that follows the free spring as closely as the
 * releases did, `letGo`), scoring stops there, since holding that rebound is the gate doing its job.
 *   changedMs   longest run of samples where the output differs from the stick and either is outside
 *               the deadzone (a hold that keeps a stick inside the deadzone at neutral changes nothing)
 *   farDelayMs  a move that crosses to the far side: when the output leaves the deadzone there, minus
 *               when the stick does (null if the stick never does)
 *   delayMs     the larger of the two: the move's added delay
 *   ratio       how far the move's exit from the edge strayed from the free spring (err_k / k)
 *   unclear     that exit is within decide_step: the gate can't tell it from a release
 *   endMs       where scoring stopped (ms into the capture)
 */
export function thumbEffect(c, p, dz = DEFAULT_DEADZONE, letGo = p.decide_step) {
  const g = runGate(c.x, c.y, p, { deadzone: dz });
  const exits = edgeExits(c, p);
  const cut = exits.slice(1).find((e) => e.ratio <= letGo);
  const end = cut ? cut.at : c.x.length;
  let run = 0; let worst = 0;
  for (let i = 0; i < end; i++) {
    const changed = (g.x[i] !== c.x[i] || g.y[i] !== c.y[i]) &&
      (Math.hypot(c.x[i], c.y[i]) > dz || Math.hypot(g.x[i], g.y[i]) > dz);
    run = changed ? run + 1 : 0;
    worst = Math.max(worst, run);
  }
  const { pk, ux, uy } = edgeDir(c);
  const far = (xs, ys) => {
    for (let i = pk.at; i < end; i++) if (xs[i] * ux + ys[i] * uy < -dz) return i;
    return -1;
  };
  const rawAt = far(c.x, c.y);
  const outAt = rawAt < 0 ? -1 : far(g.x, g.y);
  const farDelayMs = rawAt < 0 ? null : outAt < 0 ? (end - rawAt) * SAMPLE_MS : (outAt - rawAt) * SAMPLE_MS;
  const changedMs = worst * SAMPLE_MS;
  const delayMs = Math.max(changedMs, farDelayMs ?? 0);
  const ratio = exits[0]?.ratio ?? null;
  const unclear = ratio != null && ratio <= p.decide_step;
  return { changedMs, farDelayMs, delayMs, ratio, unclear, endMs: end * SAMPLE_MS, pass: !unclear && delayMs <= DELAY_OK_MS };
}

/**
 * Run a tuning over every capture. `deadzone`: the stick's inner deadzone (what a game sees as centre).
 * @returns {{releases: {pass: number, of: number}, turnarounds: {pass: number, of: number},
 *   thumbs: {pass: number, of: number, moves: ReturnType<typeof thumbEffect>[]}, delayMs: number,
 *   delayOk: boolean, redo: ('releases'|'turnarounds'|'thumbs')[], ok: boolean, deadzone: number}}
 */
export function scorecard(p, { releases, turnarounds, thumbs }, deadzone = DEFAULT_DEADZONE) {
  const dz = deadzone || DEFAULT_DEADZONE;
  // A let-go after a thumb move strays from the spring no more than the releases did
  const relWorst = Math.max(0, ...releases.map((c) => decideRatio(c, p) ?? 0));
  const letGo = Math.min(p.decide_step, (relWorst || p.decide_step) * 1.2);
  const count = (list, f) => ({ pass: list.filter(f).length, of: list.length });
  const rel = count(releases, (c) => blocked(c, runGate(c.x, c.y, p, { deadzone: dz }), dz));
  const turn = count(turnarounds, (c) => blocked(c, runGate(c.x, c.y, p, { deadzone: dz }), dz));
  const moves = thumbs.map((c) => thumbEffect(c, p, dz, letGo));
  const thumb = { pass: moves.filter((m) => m.pass).length, of: moves.length, moves };
  const delayMs = Math.max(0, ...moves.map((m) => m.delayMs));
  // Only thumb moves are asked for again (the unclear ones, and any held back): a rebound that still gets
  // through is this stick's limit with the best tuning the captures allow, and more of the same captures
  // won't change it
  const redo = [];
  if (thumb.pass < thumb.of) redo.push('thumbs');
  const unclear = moves.filter((m) => m.unclear).length;
  const ok = rel.pass === rel.of && turn.pass === turn.of && thumb.pass === thumb.of;
  return { releases: rel, turnarounds: turn, thumbs: thumb, unclear, delayMs, delayOk: delayMs <= DELAY_OK_MS, redo, ok, deadzone: dz };
}
