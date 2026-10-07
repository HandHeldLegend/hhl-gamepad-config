/**
 * roster.js: The Arena's fighters on the one engine.
 *
 * Five fighters ARE meleelight characters (attributes, hitboxes, frame data and action states ported
 * unchanged), only drawn as our own original round characters:
 *   vix → Fox, quill → Falco, sable → Marth, rally → Captain Falcon, mochi → Jigglypuff.
 *
 * Sir Retro is a full character of our own on the same engine (sirretro.js): his attributes, moves,
 * hitboxes and frame data follow Mr. Game & Watch in Melee from public data.
 *
 * Three fighters have no counterpart. They are APPROXIMATIONS: a meleelight character's moves,
 * hitboxes, frame data and ECB are used as a template, with that fighter's own published Melee
 * movement attributes (constants.js FIGHTERS: gravity, fall speeds, jumpsquat, dash / run / walk,
 * air speed and acceleration, traction, jump heights, weight, initial dash frames) on top:
 *   dot (all-rounder)        → Fox template
 *   rosette (floaty, float)  → Marth template, plus float (hold jump, then press down)
 *   rime (low traction)      → Falco template (a single climber)
 * Attributes the public tables don't list (dash acceleration split, jump horizontal speeds, double jump
 * multiplier, walk acceleration, air friction) come from the template, scaled where noted.
 */
import './fox.js';
import './falco.js';
import './falcon.js';
import './marth.js';
import './puff.js';
import { THROWN, retroEcb } from './sirretro.js';
import { CHARIDS, templateOf, charAttributes, hitboxes, offsets, framesData, intangibility, actionSounds, ecb, chars, charObject } from './ml.js';
import { actionStates } from './shortcuts.js';

/** Engine character id per roster id (constants.js FIGHTERS). */
export const ENGINE_ID = {
  vix: CHARIDS.FOX_ID,
  quill: CHARIDS.FALCO_ID,
  sable: CHARIDS.MARTH_ID,
  rally: CHARIDS.FALCON_ID,
  mochi: CHARIDS.PUFF_ID,
  'sir-retro': CHARIDS.RETRO_ID,
};

/** Approximated fighters: template character and extra (non-attribute) behaviour. */
const APPROX = {
  dot: { template: CHARIDS.FOX_ID },
  rosette: { template: CHARIDS.MARTH_ID, floatFrames: 150 },
  rime: { template: CHARIDS.FALCO_ID },
};

/** Initial jump speed that reaches height h under gravity g with per-frame steps (fox: 31.28 → 3.68). */
const jumpV = (g, h) => Math.sqrt(2 * g * h + (g * g) / 4) - g / 2;
const r4 = (v) => Math.round(v * 10000) / 10000;

/**
 * meleelight attribute set for an approximated fighter: the template's, with the profile's published
 * movement numbers on top (approximation).
 */
export function approxAttributes(f, T) {
  const split = (total, a, b) => (a + b > 0 ? [r4(total * (a / (a + b))), r4(total * (b / (a + b)))] : [total, 0]);
  const [airMobA, airMobB] = split(f.airAcc, T.airMobA, T.airMobB);
  const [dAccA, dAccB] = split(f.dashAcc, T.dAccA, T.dAccB);
  const walkK = f.walk / T.walkMaxV;
  return {
    ...T,
    gravity: f.g,
    terminalV: f.fall,
    fastFallV: f.ff,
    jumpSquat: f.jsq,
    fHopInitV: r4(jumpV(f.g, f.fh)),
    sHopInitV: r4(jumpV(f.g, f.sh)),
    // Melee's double jump multiplier for these four isn't in the tables we use: 0.9 (approx.).
    djMultiplier: 0.9,
    dInitV: f.dash,
    dTInitV: r4(T.dTInitV * (f.dash / T.dInitV)),
    dMaxV: f.run,
    dAccA, dAccB,
    dashFrameMin: f.dashF,
    dashFrameMax: f.dashF + (T.dashFrameMax - T.dashFrameMin),
    maxWalk: f.walk,
    walkMaxV: f.walk,
    walkInitV: r4(T.walkInitV * walkK),
    walkAcc: r4(T.walkAcc * walkK),
    aerialHmaxV: f.air,
    airMobA, airMobB,
    traction: f.traction,
    weight: f.w,
    multiJump: false,
  };
}

let built = false;
/** Register the approximated fighters (once). Returns {rosterId: engineId}. */
export function buildRoster(fighters) {
  if (built) return ENGINE_ID;
  built = true;
  // Any fighter can be thrown by Sir Retro: give every state table his THROWNRETRO* states (meleelight
  // keeps "thrown by X" states per character; ours are generic) with an ECB and a length.
  for (let c = 0; c < 5; c++) {
    for (const [k, st] of Object.entries(THROWN)) {
      if (!actionStates[c][k]) actionStates[c][k] = { ...st };
      if (!ecb[c][k]) ecb[c][k] = ecb[c].DAMAGEFALL || retroEcb(k);
      if (framesData[c][k] == null) framesData[c][k] = 60;
    }
  }
  let next = CHARIDS.RETRO_ID + 1;
  for (const f of fighters) {
    if (ENGINE_ID[f.id] != null) continue;
    const a = APPROX[f.id] || APPROX.dot;
    const t = a.template;
    const id = next++;
    charAttributes[id] = { ...approxAttributes(f, charAttributes[t]), floatFrames: a.floatFrames || 0, noLcancel: a.noLcancel || [] };
    hitboxes[id] = hitboxes[t];
    offsets[id] = offsets[t];
    framesData[id] = framesData[t];
    intangibility[id] = intangibility[t];
    actionSounds[id] = actionSounds[t];
    ecb[id] = ecb[t];
    actionStates[id] = actionStates[t];
    chars[id] = new charObject(id);
    templateOf[id] = t;
    ENGINE_ID[f.id] = id;
  }
  return ENGINE_ID;
}

/** Template name of a roster id (for docs / the help tab). */
export const TEMPLATE_NAME = { 0: 'marth', 1: 'puff', 2: 'fox', 3: 'falco', 4: 'falcon', 5: 'sir-retro' };
