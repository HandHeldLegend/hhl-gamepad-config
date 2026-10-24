/**
 * spring-config.js: Reading and writing a stick's Spring tuning (analogConfig_s.l_spring / r_spring,
 * snapbackSpringCfg_s). No DOM.
 *
 * The tuning belongs to the stick, not the profile: it sits past the per-profile part of the analog
 * block. The firmware loads it whenever the analog block is written, so a write takes effect at once;
 * a tuning it can't use (version 0 included) is replaced with its built-in defaults (flags 0) and
 * written back, which is how "Reset to defaults" works.
 *
 * A tuning is saved only once the controller holds it: after writing, the block is read back and the
 * stick's spring bytes and type compared with what was written (writes aren't acknowledged, and a write
 * that doesn't arrive whole leaves the firmware's defaults in place). A mismatch is written again, a few
 * times at most; only a match is saved to flash, so "tuned" is never shown for a tuning that isn't there.
 */
import { LAYOUT } from '../../device/struct.js';

const VERSION = LAYOUT.defines?.SNAPBACK_SPRING_CFG_VERSION ?? 1;
const TUNED = LAYOUT.defines?.SNAPBACK_SPRING_FLAG_TUNED ?? 1;
const FIELD = { left: 'l_spring', right: 'r_spring' };
const TYPE = { left: 'l_snapback_type', right: 'r_snapback_type' };
/** Snapback type 3: Spring (settings.js SNAPBACK_TYPES). */
export const SPRING_TYPE = 3;
/** After a write, how long to give the firmware to load it (and fill in defaults) before reading it back. */
const RELOAD_MS = 250;
const WRITE_TRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'tuned' (fitted to this stick), 'defaults' (the built-in tuning), or null (none stored). */
export function springStatus(session, stick) {
  const c = session.config.analog?.[FIELD[stick]];
  if (!c || c.version !== VERSION) return null;
  return c.flags & TUNED ? 'tuned' : 'defaults';
}

/**
 * Store a fitted tuning for one stick and switch it to Spring, then save to the controller.
 * @param {{a1: number[], a2: number[], decide_step: number, grab_err: number, stiff_den: number, cross_speed: number}} p
 * @returns {Promise<boolean>} saved
 */
export async function writeSpring(session, stick, p) {
  const cfg = session.config.analog;
  const c = cfg[FIELD[stick]];
  c.version = VERSION;
  c.flags = TUNED;
  c.a1 = p.a1;
  c.a2 = p.a2;
  c.decide_step = p.decide_step;
  c.grab_err = p.grab_err;
  c.stiff_den = p.stiff_den;
  c.cross_speed = p.cross_speed;
  const want = c.buffer.slice();
  const put = () => { cfg[FIELD[stick]] = new c.constructor(want.slice()); cfg[TYPE[stick]] = SPRING_TYPE; };
  const held = () => cfg[TYPE[stick]] === SPRING_TYPE && want.every((b, i) => cfg[FIELD[stick]].buffer[i] === b);
  try {
    for (let n = 1; n <= WRITE_TRIES; n++) {
      put();
      await session.commit('analog', { immediate: true });
      await sleep(RELOAD_MS);
      await session.refresh('analog');
      if (held()) return await session.save();
      console.warn(`[snapback] spring write ${n} didn't arrive whole; the controller holds`, Array.from(cfg[FIELD[stick]].buffer));
    }
    return false;
  } catch (err) {
    console.warn('[snapback] spring save failed', err);
    return false;
  }
}

/**
 * Back to the firmware's built-in tuning for one stick: write version 0, let the firmware fill in its
 * defaults, read them back and save.
 * @returns {Promise<boolean>} saved
 */
export async function resetSpring(session, stick) {
  const cfg = session.config.analog;
  const c = cfg[FIELD[stick]];
  c.version = 0;
  c.flags = 0;
  cfg[FIELD[stick]] = c;
  try {
    await session.commit('analog', { immediate: true });
    await new Promise((r) => setTimeout(r, RELOAD_MS));
    await session.refresh('analog');
    return await session.save();
  } catch (err) {
    console.warn('[snapback] spring reset failed', err);
    return false;
  }
}
