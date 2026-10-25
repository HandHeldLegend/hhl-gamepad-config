/**
 * The two older snapback filters, ported bit-exact, for replaying a capture through them: the low-pass
 * filter (snapback type 0) and Auto as it works on a stick that isn't tuned (type 1 or 3 without a tuned
 * spring; the tuned spring gate is runGate in spring.js). Pure functions, no DOM.
 *
 * Both run in HOJA-LIB-RP2040 src/input/snapback.c snapback_process(), once every ANALOG_POLL_INTERVAL
 * (500 us, so 2 kHz: one call per capture sample) on each stick's scaled x and y (±2048, after
 * stick_scaling_process, before stick_deadzone_process). A spring capture records the very x and y the
 * filters are handed, so a capture replays sample for sample. What comes back is the filter's output, the
 * same stage runGate returns: the deadzone and the ±2048 cap come after it.
 *
 * Low-pass (src/input/snapback/snapback_lpf.c, snapback_lpf_process, _lpf_init, lpf_get_filtered_q16):
 *   - A one-pole filter per axis (x and y apart, not on the radius) in Q16: alpha = dt / (RC + dt) with
 *     dt = 500 us and RC = 1 / (2π × cutoff), cutoff = l/r_snapback_intensity in tenths of Hz, clamped to
 *     300..1500 (30 to 150 Hz). Each sample prev += (alpha × ((x << 16) - prev)) >> 16.
 *   - A blend per stick between the raw and the filtered value: while the stick's distance is under 1800
 *     it moves 0.0375 a sample towards filtered (1.0), at 1800 or more 0.125 a sample towards raw (0.0).
 *     Out = (int16)(x × (1 - blend) + (prev >> 16) × blend), in float, truncated.
 *   - The filter re-initialises (prev = 0, blend = 1) whenever its stored cutoff differs from the setting.
 *     It stores the clamped value, so a setting outside 300..1500 re-initialises it on every sample: the
 *     output is then about alpha × x. A setting of 0 from power-on is the other way round: the stored
 *     cutoff starts at 0, so it never initialises (alpha 0, blend 0) and passes the stick through raw.
 *     That is what the firmware does, and so does this.
 * Auto, untuned (src/input/snapback/snapback_auto.c, _sbauto_add_axis, _sbautocenter_trigger_detect,
 * snapback_auto_process; helpers in snapback_utils.c):
 *   - Radial, on the stick's distance d = sqrtf(x² + y²) (float). At d ≥ 650 the point is stored and a
 *     20 sample crossover window opens; under 650 the window counts down.
 *   - A sample on the far side of the stored point (dot product < 0) clears it; if that happens inside the
 *     window, the output goes to (0, 0) and a "rising" watch starts. Each sample after that stays at (0, 0)
 *     and counts how many in a row the distance didn't grow. Three in a row: the rebound is peaking, so it
 *     holds for as many samples again as the watch ran, plus 4 (the point there becomes the new stored one,
 *     window reopened). It lets go instead after 30 samples or once d reaches 1985.
 *   - Nothing here reads a setting: no strength, and the inner deadzone isn't used (SNAPBACK_DEADZONE is
 *     defined but never read). The output is also (0, 0) whenever the scaled distance is 0.
 *
 * Exactness: integer steps are exact; float steps are done in float32 (Math.fround after every operation,
 * in the C evaluation order), checked against the real C files compiled on a PC (scratchpad springtest/legacy).
 * What a capture can't give back:
 *   - The scaled distance. The firmware hands each filter (uint16) of a float distance it scaled, and only
 *     derives x and y from it (rounded, after the angle is rounded to 0.1°). Here it's
 *     trunc(sqrtf(x² + y²)) of the captured x and y, which can be 1 off: it matters only for the low-pass
 *     zone test at exactly 1799 / 1800, and for Auto when a stick 1 count off centre had a distance under 1.
 *     Pass `distance` (one per sample) if you have the firmware's own.
 *   - What came before the capture. Auto starts idle with no stored point (as at power-on); a capture that
 *     starts out past 650 and not mid-rebound (every spring capture) is then exact. The low-pass filter by
 *     default starts settled on the first sample, as if the stick had been pushed out from centre and rested
 *     there (blend 1 under 1800, 0 at 1800 or more). The >> 16 floors, so a filter that climbs to a positive
 *     value stops just short of it and reads one count low (x0 - 1), while one that falls to a negative value
 *     lands on it exactly; the seed is set the same way. Exact once the stick had rested there for about 30
 *     samples, else it converges within a few ms. `settle: false` starts it as the firmware does at power-on
 *     instead (prev 0, blend 1).
 *   - On an RP2350 the compiler may fuse the blend's multiply-add (vfma.f32, one rounding instead of two);
 *     while the blend is between 0 and 1 a result that lands within one float step of an integer could
 *     truncate 1 count differently. An RP2040 (no FPU) rounds both, like this.
 */

const f = Math.fround;

const LPF_INTERVAL_US = 500;
const LPF_BLEND_TIME_US = 4000;
const LPF_ZONE_RADIUS = 1800;
/** l/r_snapback_intensity: low-pass cutoff in tenths of Hz. */
export const LPF_CUTOFF_RANGE = [300, 1500];
/** The firmware's default cutoff (stick_scaling.c defaults: 60.0 Hz). */
export const DEFAULT_LPF_CUTOFF = 600;

const AUTO_STORE_HEIGHT = 650;
const AUTO_CROSSOVER_EXPIRATION = 20;
const AUTO_WIDTH_MAX = 30;
const AUTO_HEIGHT_MAX = 1985;
const AUTO_TRIGGER_THRESHOLD = 3;
const AUTO_DECAY_TOLERANCE = 4;
const AUTO_NO_POINT = -7777;

/** sqrtf(x² + y²) in float32 (a correctly rounded double sqrt of an exact integer rounds to the same float). */
const distF = (x, y) => f(Math.sqrt(x * x + y * y));
/** The uint16 distance the filters are handed, as near as a capture gives it back. */
const distIn = (x, y) => Math.trunc(distF(x, y));

/** _lpf_init's alpha, Q16, from the clamped cutoff in tenths of Hz (float32 throughout, as in C). */
export function lpfAlphaQ16(cutoff) {
  const hz = f(cutoff / 10);
  const dt = f(LPF_INTERVAL_US / 1e6);
  const rc = f(1 / f(f(2 * f(3.14159265)) * hz));
  const alpha = f(dt / f(rc + dt));
  return Math.trunc(f(f(alpha * 65536) + 0.5));
}

/**
 * Run the low-pass filter (type 0) over a capture.
 * @param {ArrayLike<number>} xs
 * @param {ArrayLike<number>} ys
 * @param {{cutoff?: number, settle?: boolean, distance?: ArrayLike<number>}} [o]  cutoff: l/r_snapback_intensity
 *   as stored (tenths of Hz; outside 300..1500 behaves as the firmware does, see above). settle: start settled
 *   on the first sample (default) or from power-on. distance: the firmware's scaled distance per sample, if known
 * @returns {{x: Int16Array, y: Int16Array, blend: Float32Array, alpha: number}}  blend: per sample, how far
 *   towards the filtered value the output was (0 raw, 1 filtered)
 */
export function lowPass(xs, ys, o = {}) {
  const n = Math.min(xs.length, ys.length);
  const outX = new Int16Array(n);
  const outY = new Int16Array(n);
  const blends = new Float32Array(n);
  const setting = o.cutoff ?? DEFAULT_LPF_CUTOFF;
  const clamped = Math.min(LPF_CUTOFF_RANGE[1], Math.max(LPF_CUTOFF_RANGE[0], setting));
  const alpha = lpfAlphaQ16(clamped);
  const step = f(LPF_INTERVAL_US / LPF_BLEND_TIME_US);
  const stepUp = f(step * f(0.3));
  const reinitEvery = clamped !== setting && setting !== 0;
  if (setting === 0) {
    for (let i = 0; i < n; i++) { outX[i] = xs[i] | 0; outY[i] = ys[i] | 0; }
    return { x: outX, y: outY, blend: blends, alpha: 0 };
  }
  let px = 0;
  let py = 0;
  let blend = f(1);
  if (n && o.settle !== false && !reinitEvery) {
    // Settled from centre: just under a positive value (a step of 1 rounds down to 0), exactly on any other
    const rest = (v) => v * 65536 - (v > 0 ? 1 : 0);
    px = rest(xs[0] | 0);
    py = rest(ys[0] | 0);
    const d0 = o.distance ? o.distance[0] : distIn(xs[0] | 0, ys[0] | 0);
    blend = f(d0 < LPF_ZONE_RADIUS ? 1 : 0);
  }
  const filt = (prev, v) => prev + Math.floor((alpha * (v * 65536 - prev)) / 65536); // _lpf_q16_mul: >> 16
  for (let i = 0; i < n; i++) {
    const x = xs[i] | 0;
    const y = ys[i] | 0;
    if (reinitEvery) { px = 0; py = 0; blend = f(1); }
    const d = o.distance ? o.distance[i] : distIn(x, y);
    if (d < LPF_ZONE_RADIUS) {
      blend = f(blend + stepUp);
      if (blend > 1) blend = f(1);
    } else {
      blend = f(blend - step);
      if (blend < 0) blend = f(0);
    }
    px = filt(px, x);
    py = filt(py, y);
    const raw = f(1 - blend);
    outX[i] = Math.trunc(f(f(x * raw) + f((px >> 16) * blend)));
    outY[i] = Math.trunc(f(f(y * raw) + f((py >> 16) * blend)));
    blends[i] = blend;
  }
  return { x: outX, y: outY, blend: blends, alpha };
}

/**
 * Run Auto as it works on an untuned stick (type 1, or 3 without a tuned spring) over a capture.
 * @param {ArrayLike<number>} xs
 * @param {ArrayLike<number>} ys
 * @param {{distance?: ArrayLike<number>}} [o]  distance: the firmware's scaled distance per sample, if known.
 *   (A `deadzone` is accepted and ignored: this filter reads no setting.)
 * @returns {{x: Int16Array, y: Int16Array, holding: Uint8Array}}  holding: 1 where the filter forced the
 *   output to (0, 0) (a crossover, the rising watch or the hold after it)
 */
export function autoLegacy(xs, ys, o = {}) {
  const n = Math.min(xs.length, ys.length);
  const outX = new Int16Array(n);
  const outY = new Int16Array(n);
  const holding = new Uint8Array(n);
  const a = {
    last: f(0), sx: 0, sy: 0, exp: 0, rising: false, decaying: false, width: 0, trigger: 0, timer: 0,
  };
  for (let i = 0; i < n; i++) {
    const x = xs[i] | 0;
    const y = ys[i] | 0;
    const inDist = o.distance ? o.distance[i] : distIn(x, y);
    const d = distF(x, y);
    let held = false;

    if (d >= AUTO_STORE_HEIGHT) {
      a.sx = x; a.sy = y; a.exp = AUTO_CROSSOVER_EXPIRATION;
    } else {
      a.exp = a.exp ? a.exp - 1 : 0;
    }

    // _sbautocenter_trigger_detect runs first (and clears the point) even when the window has run out
    let crossed = false;
    if (a.sx !== AUTO_NO_POINT && a.sx * x + a.sy * y < 0) {
      a.sx = AUTO_NO_POINT; a.sy = AUTO_NO_POINT;
      crossed = true;
    }

    if (crossed && a.exp > 0) {
      held = true;
      a.rising = true; a.decaying = false; a.width = 0; a.trigger = 0;
    } else if (a.rising) {
      held = true;
      a.width += 1;
      if (d <= a.last) a.trigger += 1;
      else a.trigger = 0;
      if (a.width >= AUTO_WIDTH_MAX || d >= AUTO_HEIGHT_MAX) {
        a.rising = false; a.decaying = false;
      } else if (a.trigger >= AUTO_TRIGGER_THRESHOLD) {
        a.rising = false; a.decaying = true;
        a.timer = (a.width + AUTO_DECAY_TOLERANCE) & 0xff;
        a.sx = x; a.sy = y; a.exp = AUTO_CROSSOVER_EXPIRATION;
      }
    } else if (a.decaying) {
      held = true;
      a.timer = (a.timer - 1) & 0xff;
      if (!a.timer) a.decaying = false;
    }

    a.last = d;
    const pass = !held && inDist > 0;
    outX[i] = pass ? x : 0;
    outY[i] = pass ? y : 0;
    holding[i] = held ? 1 : 0;
  }
  return { x: outX, y: outY, holding };
}
