/**
 * constants.js: The Arena's tunable numbers outside the engine: input thresholds, the fighter roster
 * (with the published Melee attributes the approximated fighters use), the coach's frame windows and
 * the input buffer.
 *
 * The simulation itself (physics, action states, hit detection, every character number of the five
 * ported fighters) is the meleelight port in engine/ (see docs/ARENA-ENGINE.md). Units there are
 * meleelight's (the main platform is 136.8 units wide); timings are frames of the fixed 60 Hz
 * simulation (1 frame = 16.67 ms).
 *
 * Input pipeline sources (behaviour reference only; our code is original; see melee.js):
 *   - doldecomp/melee, src/sysdolphin/baselib/controller.c: read for HOW the pad library processes
 *     input: radial stick clamp that scales both axes together, linear trigger clamp, float scaling.
 *     https://github.com/doldecomp/melee
 *   - SmashWiki "Shield" (Melee light shield: analog factor n / 140 with n from 43 to 140; Z shield 49):
 *     https://www.ssbwiki.com/Shield
 *   - SmashWiki "Universal Controller Fix" (vanilla spot-dodge threshold y = −0.7):
 *     https://www.ssbwiki.com/Universal_Controller_Fix
 *   - Widely used community knowledge of Melee's stick values (from the game's common data, not from
 *     code): whole units of 1/80 = 0.0125 on an 80-unit circle, per-axis deadzone below 0.2875
 *     (23 units), dash/smash x at 0.8 (64 units), tap jump / fast fall y at 0.6625 (53 units).
 *     These match the thresholds controller modders target (e.g. UCF, notched-gate guides) but we could
 *     not confirm them from a fetchable primary source. NEEDS REVIEW against the game data.
 *   - HOJA firmware core_gamecube.c: full-scale stick → ±110 around 128; trigger 12-bit >> 4 → 0..255.
 * Values marked "approx." below are our tuning, not verified game constants.
 */

import { N_ } from '../../i18n/index.js';

export const STORAGE_KEY = 'hhl-config:arena';

/** Simulation rate. Everything below that says "frames" means 1/60 s ticks. */
export const FPS = 60;
export const STEP_MS = 1000 / FPS;
/** Never run more than this many catch-up steps per animation frame (avoids a "spiral of death"). */
export const MAX_STEPS_PER_RAF = 5;

// ---------------------------------------------------------------------------------------------
// Stick & trigger thresholds (stick values are normalized to a unit circle, +y = up)
// ---------------------------------------------------------------------------------------------
/** GameCube emulation + Melee processing constants (see melee.js and the sources above). */
export const MELEE = {
  GC_CENTER: 128,          // GameCube stick origin
  GC_STICK_FULL: 110,      // HOJA GameCube core: full-scale stick = ±110 around the origin
  STICK_MAX: 80,           // radial clamp: 80 units = 1.0 (steps of 0.0125)
  DEADZONE_UNITS: 23,      // per axis: |units| < 23 reads as 0 (22 → 0, 23 → 0.2875)
  TRIGGER_MAX: 140,        // analog L/R range 0..140 (value = n / 140)
  TRIGGER_MIN: 43,         // n below 43 doesn't register as a shield (43 / 140 = 0.30714)
};

export const STICK = {
  /** Per-axis deadzone edge: the first non-zero value the game can see (23 / 80). */
  NEUTRAL: 0.2875,
  /** |x| at or beyond this is a "smash" (dash, roll) if it was reached quickly enough (64 / 80). */
  SMASH_X: 0.8,
  /** |y| for tap-jump, fast fall and platform drop (53 / 80). */
  SMASH_Y: 0.6625,
  /** The smash threshold must be reached within this many frames of leaving neutral. With 2, the
   *  stick may spend at most ONE sampled frame in the "tilt zone" (between NEUTRAL and SMASH). */
  SMASH_WINDOW: 2,
  /** A pressed within this many frames of a smash flick → smash attack instead of a tilt (Melee: "small
   *  step forward smash" works during the first 3 frames of a dash; SmashWiki "Dash"). The input buffer
   *  (FRAMES.INPUT_BUFFER) is added on top of this, and A may also come up to that many frames BEFORE
   *  the flick (fighter.js). Both are deliberate web-latency lenience, Melee has neither. */
  SMASH_ATTACK: 3,
  /** Holding the stick at or below this y crouches (approx.). */
  CROUCH_Y: -0.6,
  /** Shield-drop / spot-dodge vertical threshold (−56 / 80; approx.). */
  SHIELD_DOWN_Y: -0.7,
  /** Angle (degrees away from straight down) that still counts as "straight down" → spot dodge (approx.). */
  SPOTDODGE_CONE: 20,
  /** Shield drop happens when the stick crosses SHIELD_DOWN_Y between SPOTDODGE_CONE and this angle.
   *  This is the window a dedicated "shield-drop notch" on a notched gate is aimed at (approx.). */
  SHIELD_DROP_MAX: 55,
  /** Airdodge: neutral (no movement) only when BOTH axes are inside this per-axis deadzone; otherwise the
   *  dodge moves at the full airdodge speed along the stick angle, whatever the stick magnitude (doldecomp
   *  ftCo_EscapeAir: per-axis deadzone, then force × cos/sin(angle); behaviour reference only).
   *  Angles come from the quantized stick, so they snap to Melee's 1/80 grid. */
  AIRDODGE_DEADZONE: 0.2875,
  /** C-stick / attack direction threshold. */
  DIRECTION: 0.6,
};

export const TRIGGER = {
  /** Lightest analog shield (43 / 140); also counts as a press for airdodge / L-cancel. */
  SHIELD_MIN: MELEE.TRIGGER_MIN / MELEE.TRIGGER_MAX,
  /** Full analog range (140 / 140) or a digital press: "hard" shield. */
  HARD: 1,
};

/** Raw HOJA WebUSB stick values are centered ±2048 (12-bit). This maps them onto the unit circle. */
export const HOJA_FULL_SCALE = 2048;

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------
export const PHYS = {
  BODY_R: 7,               // drawn body radius; feet are at (x, y), center at (x, y + BODY_R)
};

// ---------------------------------------------------------------------------------------------
// Fighter roster: movement profiles modelled on well-known classic platform-fighter movement
// ---------------------------------------------------------------------------------------------
/*
 * Original fighters (the round "Dot" body with different colours and accessories). Five run on the
 * character data of meleelight's open-source recreation (engine/roster.js); the other four use the
 * publicly documented Melee attributes below on top of a template, so players can test their
 * controller with a familiar feel. Not affiliated with or endorsed by Nintendo or HAL Laboratory; no
 * game files or assets are used.
 *
 * Attribute sources (SmashWiki attribute tables, NTSC Melee rows), fetched 2026-10:
 *   gravity          https://www.ssbwiki.com/Gravity
 *   fall / fast fall https://www.ssbwiki.com/Falling_speed , https://www.ssbwiki.com/Fast_fall
 *   traction         https://www.ssbwiki.com/Traction
 *   jumpsquat        https://www.ssbwiki.com/Jumpsquat
 *   dash / run       https://www.ssbwiki.com/Dash
 *   walk             https://www.ssbwiki.com/Walk
 *   air speed        https://www.ssbwiki.com/Air_speed
 *   air acceleration https://www.ssbwiki.com/Air_acceleration (max = base + additional)
 *   jump heights     https://www.ssbwiki.com/Jump (full hop / short hop heights, mid-air jumps)
 *   float            https://www.ssbwiki.com/Float (hold jump, then press down; up to 2.5 s)
 *   Sir Retro        https://www.ssbwiki.com/Mr._Game_%26_Watch_(SSBM) (attribute table; neutral, back
 *                    and up aerials are special-type moves that can't be L-cancelled) and
 *                    https://www.ssbwiki.com/Weight (weight 60, the second-lightest in Melee)
 * Behaviour reference only (how jumpsquat → airborne, fast fall, airdodge and traction interact):
 *   doldecomp/melee https://github.com/doldecomp/melee (no code or data copied).
 * Notes: Rosette's fast fall is listed inconsistently on the wiki table (1.85 vs a +33% column); we
 * use 2.0. Vix's short-hop height isn't in the table; ~10.6 is derived from the commonly quoted
 * short-hop velocity of 2.1 and gravity 0.23. Both NEED REVIEW.
 * Sir Retro: the wiki's movement numbers are almost the same as the all-rounder's (gravity 0.095, fall
 * 1.7 / 2.3, jumpsquat 4); what sets him apart is air speed 1.0, a light build (weight 60: the training
 * dummy flies further) and aerials that can't be L-cancelled (noLcancel below).
 * weight (w)       https://www.ssbwiki.com/Weight (Melee: Mario 100, Fox 75, Falco 80, Marth 87, Peach 90,
 *                  Popo 88, Captain Falcon 104, Jigglypuff 60, Mr. Game & Watch 60), used by the dummy.
 * initial dash     https://www.ssbwiki.com/Dash (Melee table: "Dash Frames" → dashF, "Max Acceleration" →
 *                  dashAcc; Mario 10 / 0.08, Fox 11 / 0.12, Falco 11 / 0.12, Marth 15 / 0.06, Peach 15 / 0.12,
 *                  Ice Climbers 13 / 0.07, Captain Falcon 15 / 0.16, Jigglypuff 13 / 0.085, G&W 8 / 0.08)
 * spot dodge, roll total frames from https://meleeframedata.com (character pages, "Spot Dodge" /
 *                  "Forward Roll"): spot / roll.
 *
 * How the engine uses these (engine/roster.js): vix, quill, sable, rally and mochi run on meleelight's
 * own character data (these rows are then only shown in the picker / help); dot, rosette, rime and
 * sir-retro are approximations built on a meleelight template character with these numbers on top.
 * Values are in the game's units and frames.
 */

/**
 * g gravity · fall / ff max fall / fast-fall speed · jsq jumpsquat frames · dash initial dash ·
 * run run speed · walk max walk · air air speed · airAcc max air acceleration · traction ·
 * fh / sh full / short hop height · jumps mid-air jumps · float max float frames (0 = none) · w weight ·
 * noLcancel aerials whose landing lag an L-cancel can't reduce · dashF initial dash frames · dashAcc max
 * dash acceleration · spot / roll spot dodge / roll total frames.
 * look: body / band / feet colour tokens and an accessory, drawn on the round body (no likenesses).
 */
export const FIGHTERS = [
  { id: 'dot', name: 'Dot', feel: N_('All-rounder · balanced in every way'),
    g: 0.095, fall: 1.7, ff: 2.3, jsq: 4, dash: 1.5, run: 1.5, walk: 1.1, air: 0.86, airAcc: 0.045, traction: 0.06, fh: 29, sh: 11.025, jumps: 1, float: 0, w: 100,
    dashF: 10, dashAcc: 0.08, spot: 22, roll: 31,
    look: { body: 'red', band: 'blue', feet: 'yellow', acc: 'cap' } },
  { id: 'vix', name: 'Vix', feel: N_('Fast faller · 3-frame jumpsquat · quick dash'),
    g: 0.23, fall: 2.8, ff: 3.4, jsq: 3, dash: 1.9, run: 2.2, walk: 1.6, air: 0.83, airAcc: 0.08, traction: 0.08, fh: 31.28, sh: 10.6, jumps: 1, float: 0, w: 75,
    dashF: 11, dashAcc: 0.12, spot: 22, roll: 31,
    look: { body: 'yellow', band: 'green', feet: 'blue', acc: 'ears' } },
  { id: 'quill', name: 'Quill', feel: N_('Fast faller · huge jump · 5-frame jumpsquat'),
    g: 0.17, fall: 3.1, ff: 3.5, jsq: 5, dash: 1.9, run: 1.5, walk: 1.4, air: 0.83, airAcc: 0.07, traction: 0.08, fh: 51.5, sh: 11.58, jumps: 1, float: 0, w: 80,
    dashF: 11, dashAcc: 0.12, spot: 22, roll: 31,
    look: { body: 'blue', band: 'yellow', feet: 'red', acc: 'crest' } },
  { id: 'sable', name: 'Sable', feel: N_('Swordfighter · floaty · long run'),
    g: 0.085, fall: 2.2, ff: 2.5, jsq: 4, dash: 1.5, run: 1.8, walk: 1.6, air: 0.9, airAcc: 0.05, traction: 0.06, fh: 35.09, sh: 13.995, jumps: 1, float: 0, w: 87,
    dashF: 15, dashAcc: 0.06, spot: 27, roll: 35,
    look: { body: 'green', band: 'blue', feet: 'yellow', acc: 'headband' } },
  { id: 'rosette', name: 'Rosette', feel: N_('Floaty · float: hold jump, then press down'),
    g: 0.08, fall: 1.5, ff: 2.0, jsq: 5, dash: 1.2, run: 1.3, walk: 0.85, air: 1.1, airAcc: 0.07, traction: 0.1, fh: 31.36, sh: 16.8, jumps: 1, float: 150, w: 90,
    dashF: 15, dashAcc: 0.12, spot: 27, roll: 31,
    look: { body: 'accent', band: 'yellow', feet: 'yellow', acc: 'crown' } },
  { id: 'rime', name: 'Rime', feel: N_('Low traction · longest wavedash · 3-frame jumpsquat'),
    g: 0.1, fall: 1.6, ff: 2.0, jsq: 3, dash: 1.4, run: 1.4, walk: 0.95, air: 0.7, airAcc: 0.047, traction: 0.035, fh: 35.1, sh: 10.5, jumps: 1, float: 0, w: 88,
    dashF: 13, dashAcc: 0.07, spot: 27, roll: 31,
    look: { body: 'blue', band: 'green', feet: 'accent', acc: 'hood' } },
  { id: 'rally', name: 'Rally', feel: N_('Fastest runner · falls fast'),
    g: 0.13, fall: 2.9, ff: 3.5, jsq: 4, dash: 2.0, run: 2.3, walk: 0.85, air: 1.12, airAcc: 0.06, traction: 0.08, fh: 38.52, sh: 14.85, jumps: 1, float: 0, w: 104,
    dashF: 15, dashAcc: 0.16, spot: 32, roll: 31,
    look: { body: 'red', band: 'yellow', feet: 'blue', acc: 'visor' } },
  { id: 'mochi', name: 'Mochi', feel: N_('Very floaty · 5 mid-air jumps · strong air control'),
    g: 0.064, fall: 1.3, ff: 1.6, jsq: 5, dash: 1.4, run: 1.1, walk: 0.7, air: 1.35, airAcc: 0.28, traction: 0.09, fh: 20.8, sh: 9.146, jumps: 5, float: 0, w: 60,
    dashF: 13, dashAcc: 0.085, spot: 27, roll: 34,
    look: { body: 'accent', band: 'green', feet: 'red', acc: 'tuft' } },
  { id: 'sir-retro', name: 'Sir Retro', feel: N_('Featherweight · LCD style · neutral, back and up aerials can’t be L-cancelled'),
    g: 0.095, fall: 1.7, ff: 2.3, jsq: 4, dash: 1.5, run: 1.5, walk: 1.1, air: 1.0, airAcc: 0.05, traction: 0.06, fh: 29, sh: 11.025, jumps: 1, float: 0, w: 60,
    dashF: 8, dashAcc: 0.08, spot: 32, roll: 35,
    noLcancel: ['nair', 'bair', 'uair'],
    look: { body: 'text', band: 'muted', feet: 'text', acc: 'lcd' } },
];

export const fighterById = (id) => FIGHTERS.find((f) => f.id === id) || FIGHTERS[0];

// ---------------------------------------------------------------------------------------------
// Frame windows used by the technique coach and the Arena (frames)
// ---------------------------------------------------------------------------------------------
/* The engine owns every gameplay window (jumpsquat, landing lag, airdodge, shield...). These only say
 * how the coach (techniques.js) labels what happened, plus the Arena's own conveniences. */
export const FRAMES = {
  LCANCEL: 7,              // meleelight's L-cancel window (physics.js lCancelUpdate), shown in the help text
  WAVEDASH_MAX_AIR: 3,     // airdodge within this many frames of leaving the ground counts as a wavedash
  LEDGEDASH_MAX: 45,       // ledge release → wave-land within this many frames counts as a ledgedash
  TARGET_RESPAWN: 180,     // free play: broken targets come back after this long
  /**
   * Input buffer (a deliberate convenience, NOT Melee; Melee reads a press only on the frame it
   * happens). Browser + USB polling adds latency and jitter, so a jump / attack / special / Z / shield /
   * C-stick press that didn't change what the fighter is doing is offered again for up to this many
   * frames (controller.js EngineInput). L-cancel timing is never buffered. Set in Controls & help (0–6).
   */
  INPUT_BUFFER: 3,
  INPUT_BUFFER_MAX: 6,
};

// ---------------------------------------------------------------------------------------------
// Keyboard shortcuts (KeyboardEvent.code). The keyboard never drives the character. The Arena is
// for testing the connected controller, so it only pauses, frame-advances and resets.
// ---------------------------------------------------------------------------------------------
export const KEYS = {
  start: ['KeyP'],           // pause / resume
  select: ['KeyR'],          // reset position / restart run
  step: ['Period'],          // frame advance while paused
};

/** Simulation speeds offered in the Play toolbar. */
export const SPEEDS = [1, 0.5, 0.25];
