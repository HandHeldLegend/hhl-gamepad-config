/**
 * ml.js: The globals the ported meleelight engine expects (its main.js, characters.js, settings.js,
 * activeStage.js, sfx and vfx modules), reduced to what single-player play needs.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight):
 * the character registry (main/characters.js), gameSettings (settings.js), edgeOffset (main/main.js)
 * and blendColours (main/vfx/blendColours.js). Everything else here is HOJA glue: the "world" swap
 * (each Game owns its players, stage and queues; the engine modules read them through these live
 * bindings), silent sound / vfx stubs, the compact ECB decoder and float (an approximation used by
 * Rosette, not part of meleelight).
 */

// ---------------------------------------------------------------------------------------------
// World state (live bindings, swapped in by world.js before each step)
// ---------------------------------------------------------------------------------------------
/** Players by port (0 = the fighter, 1 = the training dummy). */
export let player = [];
/** Engine character id per port (CHARIDS, or an approximated fighter's id from roster.js). */
export let characterSelections = [0, 0, 0, 0];
/** -1 = empty port; anything else = present (meleelight: 0 human, 1 CPU). */
export let playerType = [0, -1, -1, -1];
/** The stage in meleelight's format (see stage.js). */
export let activeStage = null;

/** HOJA: point the engine at a world (see world.js). */
export function setWorldGlobals(w) {
  player = w.player;
  characterSelections = w.characterSelections;
  playerType = w.playerType;
  activeStage = w.stage;
}

// meleelight game-mode globals: always a running versus match (gameMode 3) with endless stocks.
export const gameMode = 3;
export const versusMode = true;
export const showDebug = false;
/** Where a fighter hangs relative to the ledge point it grabbed (main/main.js). */
export const edgeOffset = [[-2.9, -23.7], [2.9, -23.7]];

/** settings.js: meleelight's defaults. tapJumpOffpN is set per frame from the Arena's Tap jump option. */
export const gameSettings = {
  turbo: 0,
  lCancelType: 0, // 0 normal, 1 auto, 2 Smash 64 style
  blastzoneWrapping: 0,
  flashOnLCancel: 0,
  dustLessPerfectWavedash: 0,
  phantomThreshold: 0.01,
  everyCharWallJump: 0,
  tapJumpOffp1: 0,
  tapJumpOffp2: 0,
  tapJumpOffp3: 0,
  tapJumpOffp4: 0,
};

// ---------------------------------------------------------------------------------------------
// Presentation stubs: the Arena draws its own effects and has no audio
// ---------------------------------------------------------------------------------------------
const SILENT = { play: () => 0, stop() {} };
export const sounds = new Proxy({}, { get: () => SILENT });
export function drawVfx() {}
export function screenShake() {}
export function percentShake() {}
export function finishGame() {}
export const lostStockQueue = { push() {} };
/** Colour palettes are only used to tint colourOverlay (rest / shield breaker charge); one neutral palette. */
export const palettes = [['rgb(255, 255, 255)', 'rgb(255, 255, 255)']];
export const pPal = [0, 0, 0, 0];
export function blendColours(start, end, opacity) {
  const blended = [];
  for (let i = 0; i < 3; i++) {
    start[i] = parseInt(start[i], 10);
    blended[i] = start[i] + (end[i] - start[i]) * opacity;
  }
  return [Math.floor(blended[0]), Math.floor(blended[1]), Math.floor(blended[2])];
}

// ---------------------------------------------------------------------------------------------
// Character registry (main/characters.js)
// ---------------------------------------------------------------------------------------------
/** HOJA: RETRO_ID is Sir Retro, our own character (sirretro.js), not a meleelight one. */
export const CHARIDS = { MARTH_ID: 0, PUFF_ID: 1, FOX_ID: 2, FALCO_ID: 3, FALCON_ID: 4, RETRO_ID: 5 };
/** HOJA: which character an engine id is built on (itself for the six full characters). */
export const templateOf = [0, 1, 2, 3, 4, 5];

export const chars = [];
export function setChars(index, val) { chars[index] = val; }
export const hitboxes = [];
export function setHitBoxes(index, val) { hitboxes[index] = val; }
export const offsets = [];
export function setOffsets(charId, val) { offsets[charId] = val; }
export const charAttributes = [];
export function setCharAttributes(charId, val) { charAttributes[charId] = val; }
export const intangibility = [];
export function setIntangibility(charId, val) { intangibility[charId] = val; }
export const framesData = [];
export function setFrames(charId, val) { framesData[charId] = val; }
export const actionSounds = [];
export function setActionSounds(charId, val) { actionSounds[charId] = val; }
export function charObject(num) {
  this.attributes = charAttributes[num];
  this.animations = 0;
  this.hitboxes = hitboxes[num];
}
export const ecb = [];
export function setEcbData(index, val) { ecb[index] = val; }

/**
 * HOJA: ECB data is stored compactly. meleelight lists 4 small integers per action-state frame
 * (bottom, side x, side y, top offsets, all 0..42). Each value is one character (code 48 + value) and a
 * frame repeated n > 1 times is followed by one letter (code 97 + n - 2).
 */
export function decodeEcb(states) {
  const out = {};
  for (const [name, s] of Object.entries(states)) {
    const frames = [];
    for (let i = 0; i < s.length;) {
      const f = [s.charCodeAt(i) - 48, s.charCodeAt(i + 1) - 48, s.charCodeAt(i + 2) - 48, s.charCodeAt(i + 3) - 48];
      i += 4;
      let n = 1;
      const c = s.charCodeAt(i);
      if (c >= 97) { n = c - 95; i++; }
      for (let k = 0; k < n; k++) frames.push(f);
    }
    out[name] = frames;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// HOJA: float (approximation; meleelight has no floating character)
// ---------------------------------------------------------------------------------------------
/**
 * Called from shortcuts.fastfall() (every airborne state that applies gravity) for fighters with
 * charAttributes.floatFrames. Hold jump and press down to hover; it lasts while jump is held, up to
 * floatFrames per airtime (world.js refreshes it on landing and on the ledge). Returns true while
 * floating (gravity and fast fall are skipped; air drift still applies).
 */
export function floatStep(p, input) {
  const pl = player[p];
  const ph = pl.phys;
  const jumpHeld = input[p][0].x || input[p][0].y;
  if (ph.floatLeft === undefined) ph.floatLeft = pl.charAttributes.floatFrames;
  if (ph.floating) {
    if (!jumpHeld || ph.floatLeft <= 0) ph.floating = false;
  } else if (jumpHeld && input[p][0].lsY <= -0.6 && ph.floatLeft > 0 && !ph.fastfalled) {
    ph.floating = true;
  }
  if (!ph.floating) return false;
  ph.floatLeft--;
  ph.cVel.y = 0;
  return true;
}
