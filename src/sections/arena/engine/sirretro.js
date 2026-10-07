/**
 * sirretro.js: Sir Retro, the Arena's own flat "LCD game" fighter: attributes, hitboxes, frame data,
 * ECB and every move, modeled on Mr. Game & Watch in Melee (NTSC 1.02).
 *
 * Structure and code patterns ported from meleelight (MIT, (c) 2016 Will Blackett,
 * https://github.com/schmooblidon/meleelight): the attribute / hitbox / frame tables and the action-state
 * objects (init / main / interrupt / land) follow its character files (src/characters/<c>/). The
 * character data below is new (not meleelight's), taken from public frame and hitbox data:
 *   - SmashWiki, "Mr. Game & Watch (SSBM)" and its move subpages (hitbox tables: damage, angle, BKB, KBG,
 *     fixed knockback, radius, bone, offset, element; timing; landing lag; autocancel windows; throws'
 *     weight-dependent timing), "Judge", "Chef", "Oil Panic", "Fire", "Dash", "Jump", "Walk", "Air
 *     acceleration", "Air friction", "Weight": https://www.ssbwiki.com/Mr._Game_%26_Watch_(SSBM)
 *   - meleeframedata.com (frame startup, active frames, IASA, landing / L-cancel lag, autocancel, dodges,
 *     grabs, sausage lifetime and rate): https://meleeframedata.com/mr._game_&_watch
 *   - ikneedata.com calculator data (Schmoo): hitbox damage, angle, KBG, WDSK, BKB, element for every
 *     move and the attribute set (weight 60, gravity 0.095, terminal 1.7, drift 0.05 / max 1.0, double
 *     jump 0.9 / 2.23, air friction 0.016, traction 0.06): https://ikneedata.com/calculator.html
 *   - Smashboards "Definitive shield sizes" (shield size 10.75, model scale 1.02), quoted via search.
 *   - doldecomp/melee (behaviour reference only, nothing copied): how Judge picks its number (never one
 *     of the last two), Chef's five arcs (never one of the last two), Oil Panic's absorb / loop / release
 *     flow and damage formula, Fire's free fall and landing lag. https://github.com/doldecomp/melee
 * Where the public data stops (bone positions, animation-driven motion: Fire's height, roll / getup /
 * ledge paths, sausage arcs, ECB) values are our estimates; each is marked "est." and listed in
 * docs/ARENA-ENGINE.md. Units are meleelight's; timings are 60 Hz frames; frame N = timer N.
 *
 * Hitbox positions: the wiki gives bone + offset; bone 0 (the origin, at the feet) is converted
 * directly (forward = the offset's z / x axis, up = y), hand / head bones are placed where the LCD pose
 * holds the prop (est.). The engine uses one hurtbox per fighter (meleelight); ours is 10 wide and 14 tall.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { hitQueue } from './hit.js';
import { CHARIDS, activeStage, charObject, characterSelections, ecb, framesData, player, setCharAttributes, setChars, setEcbData, setFrames, setHitBoxes, setIntangibility, setActionSounds } from './ml.js';
import { S } from './shared.js';
import { aArticles, articles, destroyArticleQueue, wallDetection } from './article.js';
import { actionStates, airDrift, checkForDash, checkForIASA, checkForJump, checkForSmashTurn, checkForSmashes, checkForSpecials, checkForTilts, fastfall, reduceByTraction, setupActionStates, tiltTurnDashBuffer, turnOffHitboxes } from './shortcuts.js';
import { Vec2D, createHitbox, createHitboxObject } from './util.js';

const ID = CHARIDS.RETRO_ID;
const V = (x, y) => new Vec2D(x, y);

// ---------------------------------------------------------------------------------------------
// Random numbers (Judge, Chef): a small seedable generator so tests can replay a sequence.
// ---------------------------------------------------------------------------------------------
let seed = (Math.random() * 2 ** 32) >>> 0;
/** Seed Sir Retro's random numbers (tests). */
export function setRetroSeed(n) { seed = n >>> 0; }
/** Integer 0..n-1 (mulberry32). */
function randi(n) {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
}

/** Per-player Sir Retro state that survives action states and respawns (Melee keeps the bucket). */
function mem(pl) {
  if (!pl.retro) pl.retro = { judge: [1, 0], chef: [1, 3], bucket: 0, oil: 0, judgeHop: false, number: 0 };
  return pl.retro;
}

/**
 * Judge: a number 1..9 that is neither of the last two (each of the 7 others 1/7). At the start the
 * last two are 2 (the latest) and 1 (so the first use can't be 1, the first two can't be 2). (SmashWiki "Judge";
 * doldecomp ftGw_SpecialS_GetRandomInt as the behaviour reference.)
 */
export function rollJudge(pl) {
  const m = mem(pl);
  const pool = [];
  for (let i = 0; i < 9; i++) if (i !== m.judge[0] && i !== m.judge[1]) pool.push(i);
  const r = pool[randi(pool.length)];
  m.judge = [r, m.judge[0]];
  return r + 1;
}

/** Chef: one of five fixed arcs, never one of the last two (start: the 2nd shortest and 2nd longest). */
function rollChef(pl) {
  const m = mem(pl);
  const pool = [];
  for (let i = 0; i < 5; i++) if (i !== m.chef[0] && i !== m.chef[1]) pool.push(i);
  const r = pool[randi(pool.length)];
  m.chef = [r, m.chef[0]];
  return r;
}

// ---------------------------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------------------------
setCharAttributes(ID, {
  // Dash: initial 1.5, run 1.5, 8 dash frames, acceleration 0.02 base + 0.06 additional (SmashWiki "Dash").
  dashFrameMin: 8,
  dashFrameMax: 21, // est. (initial dash animation length)
  dInitV: 1.5,
  dMaxV: 1.5,
  dAccA: 0.06,
  dAccB: 0.02,
  dTInitV: 1.5,
  traction: 0.06,
  maxWalk: 1.1,
  jumpSquat: 4,
  // Jump heights 29 / 11.025 under gravity 0.095 (SmashWiki): v = sqrt(2gh + g²/4) - g/2 → 2.3 / 1.4.
  sHopInitV: 1.4,
  fHopInitV: 2.3,
  gravity: 0.095,
  groundToAir: 0.8, // est.
  jumpHmaxV: 1.0, // est. (= air speed)
  jumpHinitV: 0.8, // est.
  // Air acceleration 0.02 base + 0.03 additional, air speed 1.0, air friction 0.016 (SmashWiki, ikneedata).
  airMobA: 0.03,
  airMobB: 0.02,
  aerialHmaxV: 1.0,
  airFriction: 0.016,
  fastFallV: 2.3,
  terminalV: 1.7,
  walkInitV: 0.15, // est.
  walkAcc: 0.1, // est.
  walkMaxV: 1.1,
  // Double jump: vertical 2.23 (ikneedata) = full hop 2.3 × 0.9696; horizontal 0.9 × stick.
  djMultiplier: 2.23 / 2.3,
  djMomentum: 0.9,
  // Smallest max shield in Melee: size 10.75, model scale 1.02 (Smashboards shield size table).
  shieldScale: 10.75,
  modelScale: 1.02,
  weight: 60,
  waitAnimSpeed: 1,
  walljump: false,
  hurtboxOffset: [5, 14], // half width, height (est. from the model's extents)
  ledgeSnapBoxOffset: [14, 7, 17], // est.
  shieldOffset: [2, 31],
  charScale: 0.4,
  miniScale: 0.3,
  runTurnBreakPoint: 16,
  airdodgeIntangible: 25,
  wallJumpVelX: 1.3,
  wallJumpVelY: 2.8,
  shieldBreakVel: 2.5,
  multiJump: false,
  ecbScale: 1,
  walkAnimSpeed: 1,
  runAnimSpeed: 1,
  // Neutral, back and up aerials are flagged as special moves in Melee, so an L-cancel can't halve their
  // landing lag (SmashWiki: "a programming error that lists them as special moves").
  noLcancel: ['ATTACKAIRN', 'ATTACKAIRB', 'ATTACKAIRU'],
  floatFrames: 0,
});

// [first frame, length] (meleeframedata: spot dodge 2-12, rolls 4-19, airdodge 4-29). Techs and getups: the
// usual Melee values (est.).
setIntangibility(ID, {
  ESCAPEAIR: [4, 26],
  ESCAPEB: [4, 16],
  ESCAPEF: [4, 16],
  ESCAPEN: [2, 11],
  DOWNSTANDN: [1, 23],
  DOWNSTANDB: [1, 19],
  DOWNSTANDF: [1, 19],
  TECHN: [1, 20],
  TECHB: [1, 20],
  TECHF: [1, 20],
});

setFrames(ID, {
  WAIT: 60, DASH: 21, RUN: 20, RUNBRAKE: 18, RUNTURN: 20, WALK: 20, JUMPF: 40, JUMPB: 40,
  FALL: 8, FALLAERIAL: 8, FALLSPECIAL: 8, SQUAT: 7, SQUATWAIT: 60, SQUATRV: 10, JUMPAERIALF: 40, JUMPAERIALB: 40,
  PASS: 30, GUARDON: 8, GUARDOFF: 16, CLIFFCATCH: 7, CLIFFWAIT: 60, DAMAGEFLYN: 29, DAMAGEFALL: 29, DAMAGEN2: 23,
  // Landing lag (SmashWiki / meleeframedata): nair 15, fair 25 (12 L-cancelled), bair 18, uair 15, dair 20 (10).
  LANDINGATTACKAIRF: 25, LANDINGATTACKAIRB: 18, LANDINGATTACKAIRU: 15, LANDINGATTACKAIRD: 20, LANDINGATTACKAIRN: 15,
  ESCAPEB: 35, ESCAPEF: 35, ESCAPEN: 32,
  DOWNBOUND: 26, DOWNWAIT: 60, DOWNSTANDN: 30, DOWNSTANDB: 35, DOWNSTANDF: 35, TECHN: 26, TECHB: 40, TECHF: 40,
  SHIELDBREAKFALL: 29, SHIELDBREAKDOWNBOUND: 26, SHIELDBREAKSTAND: 30, FURAFURA: 100,
  CAPTUREWAIT: 35, CATCHWAIT: 30, CAPTURECUT: 30, CATCHCUT: 30, CAPTUREDAMAGE: 20,
  WALLDAMAGE: 51, WALLTECH: 26, WALLJUMP: 40, OTTOTTO: 8, OTTOTTOWAIT: 60,
  FURASLEEPSTART: 30, FURASLEEPLOOP: 20, FURASLEEPEND: 60, STOPCEIL: 9, TECHU: 26, REBOUND: 17,
  THROWNRETROUP: 60, THROWNRETRODOWN: 60, THROWNRETROBACK: 60, THROWNRETROFORWARD: 60,
});
setActionSounds(ID, new Proxy({}, { get: () => [] }));

// ---------------------------------------------------------------------------------------------
// Hitboxes. box(forward, up, radius, damage, angle, KBG, BKB, WDSK, element, ground, air)
// element: 0 normal, 1 slash, 3 fire, 4 electric, 9 freezing (HOJA). 361 = Sakurai angle.
// ---------------------------------------------------------------------------------------------
const N = 0, SL = 1, FI = 3, EL = 4, FR = 9;
function box(x, y, r, dmg, angle, kg, bk, sk = 0, type = N, hG = 1, hA = 1) {
  return new createHitbox([V(x, y)], r, dmg, angle, kg, bk, sk, type, 1, hG, hA);
}
const set = (...b) => new createHitboxObject(b[0], b[1], b[2], b[3]);
/** A throw's release hitbox: the victim is placed at `offset` (meleelight throws use a single point). */
const throwBox = (x, y, dmg, angle, kg, bk) => new createHitbox(V(x, y), 0, dmg, angle, kg, bk, 0, 0, 0, 1, 1);

/** Judge 1..9 (SmashWiki "Mr. Game & Watch (SSBM)/Side special"; ikneedata). Hammer head + handle. */
const judge = (dmg, angle, kg, bk, sk, type, small) => set(
  box(10.5, 7.5, small ? 2.3436 : 3.906, dmg, angle, kg, bk, sk, type),
  box(6.5, 8.5, small ? 1.48428 : 2.3436, dmg, angle, kg, bk, sk, type));
const J = [null,
  judge(2, 361, 0, 0, 0, N), // 1: no knockback; 12% recoil to Sir Retro
  judge(4, 361, 40, 10, 0, N),
  judge(6, 140, 50, 45, 0, N), // 3: shield damage +20 (sd below)
  judge(8, 40, 40, 50, 0, SL),
  judge(3, 75, 80, 30, 0, EL), // 5: four hits
  judge(12, 20, 80, 30, 0, FI),
  judge(14, 361, 50, 30, 0, N), // 7: food on hit (no items in the Arena)
  judge(4, 80, 100, 0, 70, FR), // 8: fixed knockback 70
  judge(32, 361, 80, 100, 0, N, true), // 9: home run; smaller hitbox
];
J[3].id0.sd = 20; J[3].id1.sd = 20;

const oil = (dmgScaled, air) => [
  set(box(11.718, air ? 5.0778 : 7.812, 2.7342, dmgScaled, 361, air ? 100 : 80, air ? 40 : 30)),
  set(box(19.53, 8.9838, 3.906, air ? 1 : dmgScaled, 361, air ? 100 : 80, air ? 40 : 30)),
  set(box(31.248, 6.6402, 6.6402, air ? 1 : dmgScaled, 361, air ? 100 : 80, air ? 40 : 30)),
];

setHitBoxes(ID, {
  // Jab (insecticide puff): 3%, 83/85°, KBG 100, WDSK 20; rapid: 70°, WDSK 18 (ikneedata).
  jab1: set(box(12, 6, 4.6872, 3, 83, 100, 0, 20), box(7.5, 6, 3.5154, 3, 83, 100, 0, 20), box(4, 6.5, 3.1248, 3, 85, 100, 0, 20)),
  jabRapid: set(box(12, 6, 4.6872, 3, 70, 100, 0, 18), box(7.5, 6, 3.5154, 3, 70, 100, 0, 18), box(4, 6.5, 3.1248, 3, 70, 100, 0, 18)),
  // Side tilt (chair): 10%, Sakurai angle, BKB 10, KBG 100.
  ftilt: set(box(11.2, 3.6, 3.906, 10, 361, 100, 10), box(11.2, 7.2, 3.906, 10, 361, 100, 10), box(5.5, 7, 3.906, 10, 361, 100, 10), box(3, 7, 3.1248, 10, 361, 100, 10)),
  // Up tilt (flag): 9%, 100°, BKB 30, KBG 127 / 125 / 123.
  utilt: set(box(4, 16, 5.0778, 9, 100, 127, 30), box(3.5, 11.5, 3.5154, 9, 100, 125, 30), box(2.5, 8.5, 3.1248, 9, 100, 123, 30)),
  // Down tilt (manhole): 12% 85° BKB 65 KBG 100 on grounded foes, 9% Sakurai BKB 80 KBG 40 on airborne ones.
  dtilt: set(box(9, 3, 6.2496, 12, 85, 100, 65, 0, N, 1, 0), box(9, 3, 6.2496, 9, 361, 40, 80, 0, N, 0, 1)),
  // Dash attack (helmet): 9%, 120° (sends behind), BKB 70, KBG 30.
  dashattack: set(box(3.906, 1.953, 5.0778, 9, 120, 30, 70)),
  // Forward smash (torch): clean 13-16 fire 18% 55°, body 14% Sakurai; late 17-33 6% fire. BKB 44, KBG 100.
  fsmashClean: set(box(15.624, 7.0308, 4.6872, 18, 55, 100, 44, 0, FI), box(9.765, 7.0308, 3.906, 18, 55, 100, 44, 0, FI), box(5, 7, 1.953, 14, 361, 100, 44)),
  fsmashLate: set(box(11.718, 7.0308, 3.1248, 6, 55, 100, 44, 0, FI), box(7.812, 7.0308, 2.7342, 6, 55, 100, 44, 0, FI), box(5, 7, 1.5624, 6, 361, 100, 44, 0, FI)),
  // Up smash (diving helmet headbutt): 18%, 83°, BKB 40, KBG 96.
  usmash: set(box(2.5, 16, 5.0778, 18, 83, 96, 40)),
  // Down smash (two hammers): hammers 16% 80° BKB 60 KBG 90; handles 10% 20° BKB 10 KBG 50. The handles
  // take priority (ids 0 / 1 are checked first), as in Melee.
  dsmash: set(box(4.6872, 3.5154, 3.906, 10, 20, 50, 10), box(-4.6872, 3.5154, 3.906, 10, 20, 50, 10), box(10.5462, 3.5154, 5.4684, 16, 80, 90, 60), box(-10.5462, 3.5154, 5.4684, 16, 80, 90, 60)),
  // Neutral air (parachute): 16%, Sakurai, BKB 20, KBG 100, radius 11.718 above the head.
  nair: set(box(0, 12.1086, 11.718, 16, 361, 100, 20)),
  // Forward air (box): clean 16% Sakurai BKB 30 KBG 80; late 6% BKB 10 KBG 80.
  fairClean: set(box(12.4992, 4.2966, 6.2496, 16, 361, 80, 30), box(6.2496, 4.2966, 4.6872, 16, 361, 80, 30)),
  fairLate: set(box(12.4992, 4.2966, 6.2496, 6, 361, 80, 10), box(6.2496, 4.2966, 4.6872, 6, 361, 80, 10)),
  // Back air (turtle): 4 hits of 5% 68° BKB 60 KBG 60 slash; landing 3% BKB 80.
  bair: set(box(-15.624, 2.9295, 3.906, 5, 68, 60, 60, 0, SL), box(-7.812, 2.3436, 4.6872, 5, 68, 60, 60, 0, SL)),
  bairLand: set(box(-15.624, 2.9295, 1.953, 3, 68, 60, 80, 0, SL), box(-7.812, 2.3436, 3.1248, 3, 68, 60, 80, 0, SL)),
  // Up air (blow): hit 1 7% 94° BKB 12 KBG 100, hit 2 9% 90° BKB 55 KBG 100.
  uair1: set(box(0.3906, 15.624, 5.0778, 7, 94, 100, 12), box(0.3906, 11.718, 3.5154, 7, 94, 100, 12)),
  uair2: set(box(0.3906, 15.624, 5.0778, 9, 90, 100, 55), box(0.3906, 11.718, 3.5154, 9, 90, 100, 55)),
  // Down air (key): clean 14% 270° (meteor) + 13% 60°; late 13% 60°, BKB 20 KBG 100; landing 6% 40° BKB 50 KBG 30.
  dairClean: set(box(0.7812, 0, 3.5154, 14, 270, 100, 20), box(0.7812, -4.2966, 5.0778, 13, 60, 100, 20)),
  dairLate: set(box(0.7812, 0, 3.5154, 13, 60, 100, 20), box(0.7812, -4.2966, 5.0778, 13, 60, 100, 20)),
  dairLand: set(box(4.6872, 1.953, 4.2966, 6, 40, 30, 50)),
  // Grabs: standing 7-8, dash 11-12 (one more hitbox).
  grab: set(box(7.812, 6.4449, 5.0778, 0, 361, 100, 0, 0, 2), box(2.7342, 6.4449, 2.9295, 0, 361, 100, 0, 0, 2)),
  grabDash: set(box(7.812, 6.4449, 5.0778, 0, 361, 100, 0, 0, 2), box(2.7342, 6.4449, 3.1248, 0, 361, 100, 0, 0, 2), box(0, 6.4449, 2.9295, 0, 361, 100, 0, 0, 2)),
  // Pummel (bell): 3%, 80°, KBG 100, WDSK 30.
  pummel: set(box(7.812, 6.4449, 6.2496, 3, 80, 100, 0, 30)),
  // Throws (8% each): forward 68° BKB 100 KBG 40, back 68° backwards (112°), up 90°, down 88° BKB 80.
  throwforward: set(throwBox(8, 9, 8, 68, 40, 100)),
  throwback: set(throwBox(-8, 9, 8, 112, 40, 100)),
  throwup: set(throwBox(4, 14, 8, 90, 40, 100)),
  throwdown: set(throwBox(6, 6, 8, 88, 40, 80)),
  // Floor attack (hammer, front then back): 6% Sakurai BKB 80 KBG 50.
  getupFront: set(box(9, 3, 4.6872, 6, 361, 50, 80), box(4.5, 4, 4.6872, 6, 361, 50, 80), box(1, 5, 3.1248, 6, 361, 50, 80)),
  getupBack: set(box(-9, 3, 4.6872, 6, 361, 50, 80), box(-4.5, 4, 4.6872, 6, 361, 50, 80), box(-1, 5, 3.1248, 6, 361, 50, 80)),
  // Ledge attack (bell): 8% / 8% / 6% Sakurai BKB 80 KBG 50.
  ledgeAttack: set(box(9.3744, 2.3436, 4.6872, 8, 361, 50, 80), box(4.6872, 2.3436, 4.6872, 8, 361, 50, 80), box(0, 2.3436, 3.1248, 6, 361, 50, 80)),
  // Chef: the pan 5% 10° BKB 60 KBG 30 fire (sausages are projectiles, see SAUSAGE below).
  pan: set(box(7.812, 6.2496, 4.6872, 5, 10, 30, 60, 0, FI)),
  // Fire (trampoline jump): 6% 80° BKB 50 KBG 80, frames 1-37.
  fire: set(box(0, 3.1248, 4.6872, 6, 80, 80, 50)),
  // His body when thrown into someone (the usual Melee thrown-body hitbox, as meleelight's fighters have).
  thrown: set(box(0, 7, 3.906, 4, 361, 50, 20)),
  judge1: J[1], judge2: J[2], judge3: J[3], judge4: J[4], judge5: J[5], judge6: J[6], judge7: J[7], judge8: J[8], judge9: J[9],
});
setChars(ID, new charObject(ID));

// ---------------------------------------------------------------------------------------------
// Shared helpers for the move states
// ---------------------------------------------------------------------------------------------
const acts = (p) => actionStates[characterSelections[p]];

/** Turn on a hitbox set this frame. `fresh` = a new hit (multi-hit moves): forget who was hit. */
function hitOn(pl, hs, fresh) {
  const ids = [hs.id0, hs.id1, hs.id2, hs.id3];
  for (let i = 0; i < 4; i++) {
    if (ids[i]) pl.hitboxes.id[i] = ids[i];
    pl.hitboxes.active[i] = !!ids[i];
  }
  pl.hitboxes.frame = 0;
  if (fresh) pl.hitboxes.hitList = [];
}
function hitOff(pl) { pl.hitboxes.active = [false, false, false, false]; }

/**
 * Hitbox windows for this frame: [[first, last, set name, fresh?], ...] (inclusive frames). Offs are
 * applied before ons so back-to-back windows hand over on the same frame.
 */
function runWindows(p, list) {
  const pl = player[p];
  const t = pl.timer;
  let on = null;
  for (const w of list) {
    if (t === w[1] + 1) hitOff(pl);
    if (t === w[0]) on = w;
  }
  if (on) hitOn(pl, pl.charHitboxes[on[2]], on[3]);
}

/** Melee's grounded "act out of IASA" chain (meleelight's tilt / smash interrupt). */
function groundActOut(p, input) {
  const pl = player[p];
  const A = acts(p);
  const b = checkForSpecials(p, input);
  const t = checkForTilts(p, input);
  const s = checkForSmashes(p, input);
  const j = checkForJump(p, input);
  if (j[0]) { A.KNEEBEND.init(p, j[1], input); return true; }
  if (b[0]) { A[b[1]].init(p, input); return true; }
  if (s[0]) { A[s[1]].init(p, input); return true; }
  if (t[0]) { A[t[1]].init(p, input); return true; }
  if (input[p][0].l || input[p][0].r || input[p][0].lA > 0 || input[p][0].rA > 0) { A.GUARDON.init(p, input); return true; }
  if (checkForDash(p, input)) { A.DASH.init(p, input); return true; }
  if (checkForSmashTurn(p, input)) { A.SMASHTURN.init(p, input); return true; }
  if (input[p][0].lsX * pl.phys.face < -0.3 && Math.abs(input[p][0].lsX) > input[p][0].lsY * -1) {
    pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
    A.TILTTURN.init(p, input);
    return true;
  }
  if (input[p][0].lsX * pl.phys.face > 0.3 && Math.abs(input[p][0].lsX) > input[p][0].lsY * -1) { A.WALK.init(p, true, input); return true; }
  if (input[p][0].lsY < -0.69) { A.SQUAT.init(p, input); return true; }
  return false;
}

/** Smash charge hold (meleelight): at `frame`, holding A / Z charges up to 60 frames. Returns true while held. */
function chargeStep(p, input, frame) {
  const pl = player[p];
  if (pl.timer === frame && (input[p][0].a || input[p][0].z) && pl.phys.chargeFrames < 60) {
    pl.phys.charging = true;
    pl.phys.chargeFrames++;
    return true;
  }
  pl.phys.charging = false;
  pl.timer++;
  return false;
}

/**
 * A grounded attack. o: { windows, total, iasa (first actionable frame), end ('WAIT' | 'SQUATWAIT'),
 * charge (charge frame), slide (per-frame forward speed fn), frame(p, input) extra per-frame code }.
 */
function groundAttack(name, o) {
  return {
    name,
    canEdgeCancel: false,
    canBeGrabbed: true,
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = 0;
      pl.phys.charging = false;
      pl.phys.chargeFrames = 0;
      turnOffHitboxes(p);
      if (o.init) o.init(p, input);
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      if (o.charge) { if (chargeStep(p, input, o.charge)) { pl.phys.cVel.x = 0; return; } } else pl.timer++;
      if (this.interrupt(p, input)) return;
      if (o.slide) pl.phys.cVel.x = o.slide(pl.timer) * pl.phys.face;
      else reduceByTraction(p, true);
      runWindows(p, o.windows);
      if (o.frame) o.frame(p, input);
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer > o.total) { acts(p)[o.end || 'WAIT'].init(p, input); return true; }
      if (o.iasa && pl.timer >= o.iasa) return groundActOut(p, input);
      return false;
    },
  };
}

/**
 * An aerial. o: { windows, total, ac (last autocancel frame of the start window), landing hitbox in
 * LANDINGATTACKAIR<x> }. Melee aerials with no listed IASA end at `total` (then FALL).
 */
function aerial(name, o) {
  return {
    name,
    canPassThrough: false,
    canGrabLedge: [false, false],
    wallJumpAble: false,
    headBonk: false,
    canBeGrabbed: true,
    landType: 1,
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = 0;
      pl.phys.autoCancel = true;
      pl.inAerial = true;
      pl.IASATimer = o.total;
      turnOffHitboxes(p);
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer++;
      if (this.interrupt(p, input)) return;
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === o.ac + 1) pl.phys.autoCancel = false;
      runWindows(p, o.windows);
    },
    interrupt(p, input) {
      if (player[p].timer > o.total) { S.FALL.init(p, input); return true; }
      return !!checkForIASA(p, input, true);
    },
    land(p, input) {
      if (player[p].phys.autoCancel) S.LANDING.init(p, input);
      else acts(p)['LANDING' + name].init(p, input);
    },
  };
}

/**
 * Aerial landing lag with a landing hitbox (bair, dair). L-cancel halves the lag (timer += 2) unless the
 * aerial is in noLcancel; the hitbox comes out on `hit` (full) or `hitLc` (L-cancelled) of the landing.
 */
function landingWithHit(aerialName, hs, hit, hitLc) {
  const name = 'LANDING' + aerialName;
  return {
    name,
    canEdgeCancel: true,
    canBeGrabbed: true,
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = 0;
      pl.phys.landingLagScaling = pl.phys.lCancel && !(pl.charAttributes.noLcancel || []).includes(aerialName) ? 2 : 1;
      this.lagFrame = 0;
      turnOffHitboxes(p);
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer += pl.phys.landingLagScaling;
      if (this.interrupt(p, input)) return;
      reduceByTraction(p, true);
      const n = Math.ceil(pl.timer / pl.phys.landingLagScaling); // landing frame number
      const at = pl.phys.landingLagScaling === 2 ? hitLc : hit;
      if (n === at) hitOn(pl, pl.charHitboxes[hs], true);
      else if (n === at + 1) hitOff(pl);
    },
    interrupt(p, input) {
      if (player[p].timer > framesData[characterSelections[p]][name]) { turnOffHitboxes(p); acts(p).WAIT.init(p, input); return true; }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------------------------
/** The character's own action states (shared ones come from shared.js). */
export const M = {};

// Jab: hit 4-6, can continue from frame 8, IASA 16, 17 frames. Pressing A again goes to the rapid jab.
M.JAB1 = groundAttack('JAB1', {
  windows: [[4, 6, 'jab1', true]],
  total: 17,
  iasa: 16,
  init(p) { player[p].phys.jabCombo = false; },
  frame(p, input) {
    const pl = player[p];
    if (pl.timer > 2 && input[p][0].a && !input[p][1].a) pl.phys.jabCombo = true;
    if (pl.timer >= 8 && pl.phys.jabCombo) { acts(p).JAB2.init(p, input); }
  },
});
// Rapid jab (est. loop): each cycle hits on its frames 9-11; while A keeps being pressed the cycle repeats
// from frame 3 (a 12-frame loop), otherwise a 9-frame ending.
M.JAB2 = {
  name: 'JAB2',
  canEdgeCancel: false,
  canBeGrabbed: true,
  init(p, input) {
    const pl = player[p];
    pl.actionState = 'JAB2';
    pl.timer = 0;
    pl.phys.jabCombo = false;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main(p, input) {
    const pl = player[p];
    pl.timer++;
    if (input[p][0].a && !input[p][1].a) pl.phys.jabCombo = true;
    if (pl.timer === 15 && pl.phys.jabCombo) { pl.timer = 3; pl.phys.jabCombo = false; }
    if (this.interrupt(p, input)) return;
    reduceByTraction(p, true);
    runWindows(p, [[9, 11, 'jabRapid', true]]);
  },
  interrupt(p, input) {
    if (player[p].timer > 23) { acts(p).WAIT.init(p, input); return true; }
    return false;
  },
};
M.JAB3 = M.JAB2;

M.FORWARDTILT = groundAttack('FORWARDTILT', { windows: [[13, 30, 'ftilt']], total: 44, iasa: 42 });
M.UPTILT = groundAttack('UPTILT', { windows: [[9, 29, 'utilt']], total: 29 });
M.DOWNTILT = groundAttack('DOWNTILT', { windows: [[6, 13, 'dtilt']], total: 29, iasa: 26, end: 'SQUATWAIT' });
// Dash attack: dives forward (speed est.), hit 6-29, 37 frames.
M.ATTACKDASH = groundAttack('ATTACKDASH', {
  windows: [[6, 29, 'dashattack']],
  total: 37,
  slide: (t) => (t < 6 ? 1.3 : t < 30 ? Math.max(0, 1.3 - (t - 6) * 0.05) : 0),
  frame(p, input) {
    const pl = player[p];
    // Boost grab window 2-4 (SmashWiki): a grab input turns the dash attack into a dash grab.
    if (pl.timer >= 2 && pl.timer <= 4 && (input[p][0].z && !input[p][1].z || (input[p][0].lA > 0 || input[p][0].rA > 0) && input[p][0].a)) {
      pl.phys.boostGrab = true;
      acts(p).GRAB.init(p, input);
    }
  },
});
// Smash attacks: charge at frame 8 (fsmash, dsmash) / 18 (usmash), up to 60 frames (× 1.3671 damage).
M.FORWARDSMASH = groundAttack('FORWARDSMASH', { windows: [[13, 16, 'fsmashClean'], [17, 33, 'fsmashLate']], total: 44, iasa: 42, charge: 8 });
M.UPSMASH = groundAttack('UPSMASH', { windows: [[24, 28, 'usmash']], total: 45, iasa: 40, charge: 18 });
M.DOWNSMASH = groundAttack('DOWNSMASH', { windows: [[15, 19, 'dsmash']], total: 34, charge: 8 });

// Aerials (meleeframedata / SmashWiki timing; autocancel only in the opening frames).
M.ATTACKAIRN = aerial('ATTACKAIRN', { windows: [[20, 29, 'nair']], total: 44, ac: 2 });
M.ATTACKAIRF = aerial('ATTACKAIRF', { windows: [[10, 12, 'fairClean'], [13, 32, 'fairLate']], total: 44, ac: 2 });
M.ATTACKAIRB = aerial('ATTACKAIRB', { windows: [[10, 12, 'bair', true], [13, 15, 'bair', true], [16, 18, 'bair', true], [19, 21, 'bair', true]], total: 39, ac: 9 });
M.ATTACKAIRU = aerial('ATTACKAIRU', { windows: [[7, 16, 'uair1', true], [21, 22, 'uair2', true]], total: 39, ac: 6 });
M.ATTACKAIRD = aerial('ATTACKAIRD', { windows: [[12, 12, 'dairClean'], [13, 38, 'dairLate']], total: 49, ac: 5 });
M.LANDINGATTACKAIRB = landingWithHit('ATTACKAIRB', 'bairLand', 1, 1);
M.LANDINGATTACKAIRD = landingWithHit('ATTACKAIRD', 'dairLand', 2, 1);

// Grab: standing 7-8 / 30 frames; dash grab (from DASH / RUN / a boost grab) 11-12 / 40.
M.GRAB = {
  name: 'GRAB',
  canEdgeCancel: false,
  canBeGrabbed: true,
  init(p, input) {
    const pl = player[p];
    pl.phys.dashGrab = pl.phys.boostGrab || pl.actionState === 'DASH' || pl.actionState === 'RUN';
    pl.phys.boostGrab = false;
    pl.actionState = 'GRAB';
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main(p, input) {
    const pl = player[p];
    pl.timer++;
    if (this.interrupt(p, input)) return;
    reduceByTraction(p, !pl.phys.dashGrab);
    runWindows(p, pl.phys.dashGrab ? [[11, 12, 'grabDash']] : [[7, 8, 'grab']]);
  },
  interrupt(p, input) {
    const pl = player[p];
    if (pl.timer > (pl.phys.dashGrab ? 40 : 30)) { acts(p).WAIT.init(p, input); return true; }
    return false;
  },
};
// Pummel (bell): hit on 13, 30 frames.
M.CATCHATTACK = {
  name: 'CATCHATTACK',
  canEdgeCancel: false,
  canBeGrabbed: true,
  inGrab: true,
  init(p, input) {
    const pl = player[p];
    pl.actionState = 'CATCHATTACK';
    pl.timer = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main(p, input) {
    player[p].timer++;
    if (this.interrupt(p, input)) return;
    runWindows(p, [[13, 13, 'pummel', true]]);
  },
  interrupt(p, input) {
    if (player[p].timer > 30) { acts(p).CATCHWAIT.init(p, input); return true; }
    return false;
  },
};

/**
 * Throws: all four look alike (juggling the foe as a ball). Their speed depends on the foe's weight:
 * release at 0.55 × weight, end at 0.69 × weight frames (SmashWiki throw tables: 33 / 41.4 frames
 * against weight 60, 41.25 / 51.75 against 75...).
 */
function throwMove(dir) {
  const name = 'THROW' + dir;
  return {
    name,
    canEdgeCancel: false,
    canBeGrabbed: true,
    inGrab: true,
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = 0;
      turnOffHitboxes(p);
      const v = pl.phys.grabbing;
      if (v === -1) return;
      const w = player[v].charAttributes.weight;
      pl.phys.releaseFrame = Math.max(2, Math.round(0.55 * w));
      pl.phys.throwEnd = Math.round(0.69 * w);
      thrownState(v, dir).init(v, input);
      pl.hitboxes.id[0] = pl.charHitboxes['throw' + dir.toLowerCase()].id0;
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer++;
      if (this.interrupt(p, input)) return;
      reduceByTraction(p, true);
      if (pl.timer === pl.phys.releaseFrame && pl.phys.grabbing !== -1) {
        pl.hitboxes.id[0] = pl.charHitboxes['throw' + dir.toLowerCase()].id0;
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
      }
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer > pl.phys.throwEnd) { pl.phys.grabbing = -1; acts(p).WAIT.init(p, input); return true; }
      const v = pl.phys.grabbing;
      if (v !== -1 && pl.timer < pl.phys.releaseFrame && player[v].phys.grabbedBy !== p) { acts(p).CATCHCUT.init(p, input); return true; }
      return false;
    },
  };
}
M.THROWFORWARD = throwMove('FORWARD');
M.THROWBACK = throwMove('BACK');
M.THROWUP = throwMove('UP');
M.THROWDOWN = throwMove('DOWN');

/**
 * Being thrown by Sir Retro: bounced in front of him as a ball (est. path). Registered on every
 * fighter's state table (roster.js), since any fighter can be the one thrown.
 */
function thrownMove(dir) {
  const name = 'THROWNRETRO' + dir;
  return {
    name,
    canEdgeCancel: false,
    canGrabLedge: [false, false],
    canBeGrabbed: false,
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = pl.phys.grabbedBy < p ? -1 : 0;
      pl.phys.grounded = false;
      const g = player[pl.phys.grabbedBy];
      pl.phys.pos = V(g.phys.pos.x, g.phys.pos.y);
      this.main(p, input);
    },
    main(p) {
      const pl = player[p];
      pl.timer++;
      const g = player[pl.phys.grabbedBy];
      if (!g || pl.timer < 1) return;
      const hop = Math.abs(Math.sin(pl.timer * 0.35)) * 9; // juggled up and down
      const side = dir === 'BACK' && pl.timer > 20 ? -1 : 1;
      pl.phys.pos = V(g.phys.pos.x + 8 * side * g.phys.face, g.phys.pos.y + 3 + hop);
    },
    interrupt() { return false; },
  };
}
export const THROWN = {};
for (const d of ['UP', 'DOWN', 'BACK', 'FORWARD']) THROWN['THROWNRETRO' + d] = thrownMove(d);
Object.assign(M, THROWN);
/** The thrown state of the victim's own state table (roster.js adds ours to every fighter). */
const thrownState = (v, dir) => actionStates[characterSelections[v]]['THROWNRETRO' + dir];

// Floor attack (est. timing): hammer in front on 18-19, behind on 26-27; intangible 1-26; 49 frames.
M.DOWNATTACK = groundAttack('DOWNATTACK', {
  windows: [[18, 19, 'getupFront', true], [26, 27, 'getupBack', true]],
  total: 49,
  init(p) { player[p].phys.intangibleTimer = 26; },
});

M.APPEAL = {
  name: 'APPEAL',
  canEdgeCancel: false,
  canBeGrabbed: true,
  init(p, input) {
    const pl = player[p];
    pl.actionState = 'APPEAL';
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    this.main(p, input);
  },
  main(p, input) { player[p].timer++; this.interrupt(p, input); },
  interrupt(p, input) {
    if (player[p].timer > 60) { acts(p).WAIT.init(p, input); return true; }
    return false;
  },
};

// ---- Ledge options ------------------------------------------------------------------------------------
/** Hanging point and the stage point he climbs to, in meleelight's ledge-relative offsets (est.). */
const HANG = [-70.3, -12.2];
const TOP = [-66.4, 0];
/** Path from the hang point onto the stage over n frames (up first, then over). */
function climbPath(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const up = Math.min(1, k / 0.7);
    const over = Math.max(0, (k - 0.55) / 0.45);
    out.push([HANG[0] + (TOP[0] - HANG[0]) * over, HANG[1] + (TOP[1] - HANG[1]) * up + Math.sin(Math.PI * over) * 1.5]);
  }
  return out;
}
/** Smooth speed profile that covers `dist` in n frames (est. motion for rolls, getups and techs). */
function bump(n, dist) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = Math.sin(Math.PI * (i + 0.5) / n); out.push(v); sum += v; }
  return out.map((v) => Math.round((v * dist / sum) * 100000) / 100000);
}

/**
 * A ledge option. o: { climb (frames on the path), total, intangible, roll (distance after climbing),
 * jump (frame, velocity), windows (attack) }. Quick versions from SmashWiki "Edge getups (fast)":
 * getup 34 (intangible 1-30), jump 37 (1-12, leaves on 13), roll 49 (1-27); ledge attack 55 (1-39, hit
 * 42-47). Slow (100%+) versions est.
 */
function ledgeMove(name, o) {
  const path = climbPath(o.climb);
  const roll = o.roll ? bump(o.rollFrames, o.roll) : null;
  return {
    name,
    canBeGrabbed: true,
    offset: path,
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = 0;
      pl.phys.intangibleTimer = o.intangible;
      pl.phys.hurtBoxState = 1;
      turnOffHitboxes(p);
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer++;
      if (this.interrupt(p, input)) return;
      if (o.jump && pl.timer >= o.jump[0]) {
        if (pl.timer === o.jump[0]) { pl.phys.onLedge = -1; pl.phys.cVel = V(o.jump[1] * pl.phys.face, o.jump[2]); }
        else { airDrift(p, input); fastfall(p, input); }
        return;
      }
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) return;
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer <= o.climb && !o.jump) {
        pl.phys.pos = V(x + (path[pl.timer - 1][0] + 68.4) * pl.phys.face, y + path[pl.timer - 1][1]);
      } else if (o.jump) {
        const k = Math.min(pl.timer, path.length) - 1;
        pl.phys.pos = V(x + (HANG[0] + 68.4 - k * 0.15) * pl.phys.face, y + HANG[1] + k * 0.9);
      } else {
        const i = pl.timer - o.climb - 1;
        pl.phys.cVel.x = roll && i < roll.length ? roll[i] * pl.phys.face : 0;
      }
      if (pl.timer === o.climb + 1 && !o.jump) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === 'ground' ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (o.windows) runWindows(p, o.windows);
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer > o.total) {
        pl.phys.onLedge = -1;
        pl.phys.ledgeRegrabCount = !!o.quick;
        if (o.jump) S.FALL.init(p, input); else acts(p).WAIT.init(p, input);
        return true;
      }
      return false;
    },
  };
}
M.CLIFFGETUPQUICK = ledgeMove('CLIFFGETUPQUICK', { climb: 20, total: 34, intangible: 30, quick: true });
M.CLIFFGETUPSLOW = ledgeMove('CLIFFGETUPSLOW', { climb: 38, total: 58, intangible: 55 });
M.CLIFFESCAPEQUICK = ledgeMove('CLIFFESCAPEQUICK', { climb: 20, total: 49, intangible: 27, roll: 28, rollFrames: 26 });
M.CLIFFESCAPESLOW = ledgeMove('CLIFFESCAPESLOW', { climb: 38, total: 79, intangible: 63, roll: 28, rollFrames: 38 });
M.CLIFFJUMPQUICK = ledgeMove('CLIFFJUMPQUICK', { climb: 12, total: 37, intangible: 12, jump: [13, 1.0, 2.6] });
M.CLIFFJUMPSLOW = ledgeMove('CLIFFJUMPSLOW', { climb: 19, total: 51, intangible: 19, jump: [20, 1.0, 2.6] });
M.CLIFFATTACKQUICK = ledgeMove('CLIFFATTACKQUICK', { climb: 30, total: 55, intangible: 39, windows: [[42, 47, 'ledgeAttack', true]] });
M.CLIFFATTACKSLOW = ledgeMove('CLIFFATTACKSLOW', { climb: 38, total: 68, intangible: 50, windows: [[54, 57, 'ledgeAttack', true]] });

// ---- Neutral special: Chef --------------------------------------------------------------------------
/**
 * Pan swing (hit 18-21, fire) that flips a sausage on frame 18; 49 frames. Up to 5 sausages per use:
 * pressing B again from frame 21 restarts the swing (one every 20 frames when mashed), holding B loops at
 * frame 35 (one every 34 frames) (meleeframedata: "every 20-34 frames"). Air: vertical speed reset on
 * start, then normal drift and gravity; not helpless.
 */
function chefState(name, air) {
  return {
    name,
    canPassThrough: false,
    canEdgeCancel: false,
    canGrabLedge: [false, false],
    canBeGrabbed: true,
    disableTeeter: true,
    landType: air ? 1 : undefined,
    airborneState: air ? undefined : 'NEUTRALSPECIALAIR',
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = 0;
      pl.phys.chefCount = 0;
      pl.phys.chefRelease = false;
      if (air) pl.phys.cVel.y = 0;
      turnOffHitboxes(p);
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer++;
      const b = input[p][0].b;
      const press = b && !input[p][1].b;
      if (!b) pl.phys.chefRelease = true;
      if (pl.phys.chefCount > 0 && pl.phys.chefCount < 5 && (pl.timer >= 21 && press || pl.timer === 35 && !pl.phys.chefRelease)) {
        pl.timer = 1;
        pl.phys.chefRelease = false;
        turnOffHitboxes(p);
      }
      if (this.interrupt(p, input)) return;
      if (pl.actionState === 'NEUTRALSPECIALAIR') { fastfall(p, input); airDrift(p, input); } else reduceByTraction(p, true);
      runWindows(p, [[18, 21, 'pan', true]]);
      if (pl.timer === 18 && pl.phys.chefCount < 5) {
        pl.phys.chefCount++;
        articles.SAUSAGE.init({ p, arc: rollChef(pl) });
      }
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer > 49) {
        if (pl.actionState === 'NEUTRALSPECIALAIR') S.FALL.init(p, input); else acts(p).WAIT.init(p, input);
        return true;
      }
      return false;
    },
    land(p) { player[p].actionState = 'NEUTRALSPECIALGROUND'; },
  };
}
M.NEUTRALSPECIALGROUND = chefState('NEUTRALSPECIALGROUND', false);
M.NEUTRALSPECIALAIR = chefState('NEUTRALSPECIALAIR', true);

/**
 * Sausage: a physical projectile (4%, 70°, BKB 20, KBG 50, radius 1.953), so Oil Panic can't absorb it.
 * Five fixed arcs (est. speeds), lives 80 frames or until it lands.
 */
const ARCS = [[0.55, 2.6], [0.8, 2.3], [1.05, 2.0], [1.3, 1.75], [1.55, 1.5]];
articles.SAUSAGE = {
  name: 'SAUSAGE',
  canTurboCancel: false,
  absorbable: false,
  init(o) {
    const pl = player[o.p];
    const [vx, vy] = ARCS[o.arc];
    const x = pl.phys.pos.x + 6 * pl.phys.face;
    const y = pl.phys.pos.y + 11;
    aArticles.push({
      name: 'SAUSAGE',
      player: o.p,
      instance: {
        hitList: [],
        destroyOnHit: true,
        clank: false,
        timer: 0,
        spin: o.arc,
        vel: V(vx * pl.phys.face, vy),
        pos: V(x, y),
        posPrev: V(x, y),
        hb: new createHitbox(V(0, 0), 1.953, 4, 70, 50, 20, 0, 0, 0, 1, 1),
        ecb: [V(x, y - 1), V(x + 1, y), V(x, y + 1), V(x - 1, y)],
      },
    });
  },
  main(i) {
    const a = aArticles[i].instance;
    a.timer++;
    a.posPrev = V(a.pos.x, a.pos.y);
    a.vel.y = Math.max(a.vel.y - 0.09, -2.2); // est. gravity
    a.pos.x += a.vel.x; a.pos.y += a.vel.y;
    for (const e of a.ecb) { e.x += a.vel.x; e.y += a.vel.y; }
    if (a.timer > 80 || (a.vel.y < 0 && wallDetection(i))) destroyArticleQueue.push(i);
  },
};

// ---- Side special: Judge ------------------------------------------------------------------------------
/**
 * Hammer + sign showing 1-9 (rollJudge). Hit 16-29 (number 5: four hits 16-18, 19-21, 22-24, 25-27);
 * 49 frames. 1: no knockback and 12% to Sir Retro. 3: +20 shield damage. 7: food on hit in Melee (the
 * Arena has no items). 8: freezing, fixed knockback 70. 9: 32%, BKB 100, Sakurai angle.
 * In the air he loses half his horizontal speed and gets one small hop per airtime (est. values); he
 * ends in a normal fall (not helpless).
 */
function judgeState(name, air) {
  return {
    name,
    canPassThrough: false,
    canEdgeCancel: false,
    canGrabLedge: [false, false],
    canBeGrabbed: true,
    landType: air ? 1 : undefined,
    airborneState: air ? undefined : 'SIDESPECIALAIR',
    init(p, input) {
      const pl = player[p];
      pl.actionState = name;
      pl.timer = 0;
      mem(pl).number = rollJudge(pl);
      if (air) pl.phys.cVel.x *= 0.5;
      else pl.phys.cVel.y = 0;
      turnOffHitboxes(p);
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      const m = mem(pl);
      pl.timer++;
      if (this.interrupt(p, input)) return;
      const inAir = pl.actionState === 'SIDESPECIALAIR';
      if (inAir) {
        if (pl.timer === 14 && !m.judgeHop) { m.judgeHop = true; pl.phys.cVel.y = 1.0; }
        pl.phys.cVel.y = Math.max(pl.phys.cVel.y - pl.charAttributes.gravity, -pl.charAttributes.terminalV);
        pl.phys.cVel.x -= Math.sign(pl.phys.cVel.x) * Math.min(Math.abs(pl.phys.cVel.x), pl.charAttributes.airFriction);
      } else {
        m.judgeHop = false;
        reduceByTraction(p, true);
      }
      const hs = 'judge' + m.number;
      runWindows(p, m.number === 5 ? [[16, 18, hs, true], [19, 21, hs, true], [22, 24, hs, true], [25, 27, hs, true]] : [[16, 29, hs, true]]);
      if (pl.timer === 16 && m.number === 1) pl.percent += 12; // recoil, hit or miss
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer > 49) {
        if (pl.actionState === 'SIDESPECIALAIR') S.FALL.init(p, input); else acts(p).WAIT.init(p, input);
        return true;
      }
      return false;
    },
    land(p) { const pl = player[p]; pl.actionState = 'SIDESPECIALGROUND'; mem(pl).judgeHop = false; },
  };
}
M.SIDESPECIALGROUND = judgeState('SIDESPECIALGROUND', false);
M.SIDESPECIALAIR = judgeState('SIDESPECIALAIR', true);

// ---- Up special: Fire --------------------------------------------------------------------------------
/**
 * Trampoline jump, hitbox 1-37 (6%, 80°). 39 frames of rise (est. speed profile: about 57 units); the
 * stick picks a slight angle once (est. up to ~20°). Then helpless (FALLSPECIAL). Landing while still in
 * the move: 40 frames; after free fall: 6 frames (SmashWiki landing lag). He can grab the ledge once he
 * starts falling.
 */
const FIRE_VY = Array.from({ length: 39 }, (_, i) => Math.round(3.0 * (1 - i / 39) * 10000) / 10000);
M.UPSPECIAL = {
  name: 'UPSPECIAL',
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init(p, input) {
    const pl = player[p];
    pl.actionState = 'UPSPECIAL';
    pl.timer = 0;
    pl.phys.cVel = V(0, 0);
    pl.phys.fastfalled = false;
    pl.phys.fireTilt = 0;
    pl.phys.landingMultiplier = 30 / 40;
    pl.phys.fireBase = V(pl.phys.pos.x, pl.phys.pos.y); // where the trampoline is drawn
    if (pl.phys.grounded) { pl.phys.grounded = false; pl.phys.pos.y += 0.1; }
    turnOffHitboxes(p);
    const x = input[p][0].lsX;
    if (Math.abs(x) > 0.4) {
      pl.phys.face = Math.sign(x);
      pl.phys.fireTilt = Math.sign(x) * Math.min(1, (Math.abs(x) - 0.4) / 0.6) * 0.35;
    }
    this.main(p, input);
  },
  main(p, input) {
    const pl = player[p];
    pl.timer++;
    if (this.interrupt(p, input)) return;
    const v = FIRE_VY[pl.timer - 1] || 0;
    pl.phys.cVel.y = v * Math.cos(pl.phys.fireTilt);
    pl.phys.cVel.x = v * Math.sin(pl.phys.fireTilt);
    runWindows(p, [[1, 37, 'fire', true]]);
  },
  interrupt(p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      pl.phys.landingMultiplier = 30 / 6;
      turnOffHitboxes(p);
      S.FALLSPECIAL.init(p, input);
      return true;
    }
    return false;
  },
  land(p, input) {
    const pl = player[p];
    if (pl.timer > 4 && pl.phys.cVel.y <= 0.5) { turnOffHitboxes(p); S.LANDINGFALLSPECIAL.init(p, input); }
  },
};

// ---- Down special: Oil Panic -------------------------------------------------------------------------
/**
 * Bucket out from frame 1; it absorbs energy projectiles from frame 5 (ABSORB in article.js: radius
 * 5.5, 4.5 in front, 6 up).
 * While B is held the bucket loops (frame 38 → 5); released, the move plays out to frame 49. An absorb
 * goes to the catch (25 frames, intangible) and back to the loop. Three absorbs fill the bucket; the
 * next Oil Panic spills it: frames 2-10 / 11-22 / 23-37 (three growing hitboxes), 49 frames, damage
 * floor(absorbed × 1.5) + 5 (ground BKB 30 KBG 80; air BKB 40 KBG 100 but only the first hitbox carries
 * the damage, the others deal 1%, a Melee bug). The fill level is kept on respawn (Melee does too).
 * In the air the fall is slowed (est.) and he ends in a normal fall.
 */
function oilState(name, air) {
  return {
    name,
    canPassThrough: false,
    canEdgeCancel: false,
    canGrabLedge: [false, false],
    canBeGrabbed: true,
    disableTeeter: true,
    landType: air ? 1 : undefined,
    airborneState: air ? undefined : 'DOWNSPECIALAIR',
    init(p, input) {
      const pl = player[p];
      const m = mem(pl);
      turnOffHitboxes(p);
      if (m.bucket >= 3) { acts(p)[air ? 'DOWNSPECIALAIRSHOOT' : 'DOWNSPECIALGROUNDSHOOT'].init(p, input); return; }
      pl.actionState = name;
      pl.timer = 0;
      pl.phys.oilRelease = false;
      pl.phys.absorbing = false;
      pl.phys.absorbed = 0;
      pl.phys.cVel.y = 0;
      if (air) pl.phys.cVel.x *= 0.5;
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer++;
      if (!input[p][0].b) pl.phys.oilRelease = true;
      if (pl.timer === 38 && !pl.phys.oilRelease) pl.timer = 5;
      if (pl.phys.absorbed > 0) { acts(p)[pl.actionState === 'DOWNSPECIALAIR' ? 'DOWNSPECIALAIRCATCH' : 'DOWNSPECIALGROUNDCATCH'].init(p, input); return; }
      if (this.interrupt(p, input)) return;
      pl.phys.absorbing = pl.timer >= 5 && pl.timer <= 37;
      // Turn around with the stick (Melee lets him face the other way mid-move).
      if (Math.abs(input[p][0].lsX) > 0.3 && Math.sign(input[p][0].lsX) !== pl.phys.face && Math.sign(input[p][1].lsX) !== Math.sign(input[p][0].lsX)) pl.phys.face *= -1;
      if (pl.actionState === 'DOWNSPECIALAIR') {
        pl.phys.cVel.y = Math.max(pl.phys.cVel.y - 0.03, -1.0); // est. slowed fall
        pl.phys.cVel.x -= Math.sign(pl.phys.cVel.x) * Math.min(Math.abs(pl.phys.cVel.x), pl.charAttributes.airFriction);
      } else reduceByTraction(p, true);
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer > 49) {
        pl.phys.absorbing = false;
        if (pl.actionState === 'DOWNSPECIALAIR') S.FALL.init(p, input); else acts(p).WAIT.init(p, input);
        return true;
      }
      return false;
    },
    land(p) { player[p].actionState = 'DOWNSPECIALGROUND'; },
    /** HOJA: called by article.js when an energy projectile reaches the bucket. */
    onAbsorb(p, dmg) { player[p].phys.absorbed += dmg; },
  };
}
M.DOWNSPECIALGROUND = oilState('DOWNSPECIALGROUND', false);
M.DOWNSPECIALAIR = oilState('DOWNSPECIALAIR', true);

/** Catching a projectile: 25 frames, intangible; adds a fill level and the damage, then back to the loop. */
function oilCatch(name, air) {
  return {
    name,
    canEdgeCancel: false,
    canGrabLedge: [false, false],
    canBeGrabbed: false,
    disableTeeter: true,
    landType: air ? 1 : undefined,
    airborneState: air ? undefined : 'DOWNSPECIALAIRCATCH',
    init(p, input) {
      const pl = player[p];
      const m = mem(pl);
      m.bucket = Math.min(3, m.bucket + 1);
      m.oil += pl.phys.absorbed;
      pl.phys.absorbed = 0;
      pl.phys.absorbing = false;
      pl.actionState = name;
      pl.timer = 0;
      pl.phys.intangibleTimer = 25;
      pl.phys.hurtBoxState = 1;
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer++;
      if (this.interrupt(p, input)) return;
      if (pl.actionState === 'DOWNSPECIALAIRCATCH') pl.phys.cVel.y = Math.max(pl.phys.cVel.y - 0.03, -1.0);
      else reduceByTraction(p, true);
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer <= 25) return false;
      const inAir = pl.actionState === 'DOWNSPECIALAIRCATCH';
      if (mem(pl).bucket >= 3) { if (inAir) S.FALL.init(p, input); else acts(p).WAIT.init(p, input); return true; }
      const back = acts(p)[inAir ? 'DOWNSPECIALAIR' : 'DOWNSPECIALGROUND'];
      pl.actionState = back.name;
      pl.timer = 4;
      pl.phys.oilRelease = !input[p][0].b;
      return false;
    },
    land(p) { player[p].actionState = 'DOWNSPECIALGROUNDCATCH'; },
  };
}
M.DOWNSPECIALGROUNDCATCH = oilCatch('DOWNSPECIALGROUNDCATCH', false);
M.DOWNSPECIALAIRCATCH = oilCatch('DOWNSPECIALAIRCATCH', true);

/** The spill. Damage is fixed when it starts; the bucket empties. */
function oilShoot(name, air) {
  return {
    name,
    canEdgeCancel: false,
    canGrabLedge: [false, false],
    canBeGrabbed: true,
    disableTeeter: true,
    landType: air ? 1 : undefined,
    airborneState: air ? undefined : 'DOWNSPECIALAIRSHOOT',
    init(p, input) {
      const pl = player[p];
      const m = mem(pl);
      const dmg = Math.floor(m.oil * 1.5) + 5;
      m.bucket = 0;
      m.oil = 0;
      pl.phys.oilSets = oil(dmg, air);
      pl.phys.oilDamage = dmg;
      pl.actionState = name;
      pl.timer = 0;
      turnOffHitboxes(p);
      this.main(p, input);
    },
    main(p, input) {
      const pl = player[p];
      pl.timer++;
      if (this.interrupt(p, input)) return;
      if (pl.actionState === 'DOWNSPECIALAIRSHOOT') { fastfall(p, input); airDrift(p, input); } else reduceByTraction(p, true);
      const t = pl.timer;
      const s = pl.phys.oilSets;
      if (t === 2) hitOn(pl, s[0], true);
      else if (t === 11) hitOn(pl, s[1], false);
      else if (t === 23) hitOn(pl, s[2], false);
      else if (t === 38) hitOff(pl);
    },
    interrupt(p, input) {
      const pl = player[p];
      if (pl.timer > 49) {
        if (pl.actionState === 'DOWNSPECIALAIRSHOOT') S.FALL.init(p, input); else acts(p).WAIT.init(p, input);
        return true;
      }
      return false;
    },
    land(p) { player[p].actionState = 'DOWNSPECIALGROUNDSHOOT'; },
  };
}
M.DOWNSPECIALGROUNDSHOOT = oilShoot('DOWNSPECIALGROUNDSHOOT', false);
M.DOWNSPECIALAIRSHOOT = oilShoot('DOWNSPECIALAIRSHOOT', true);

setupActionStates(ID, { ...S, ...M });

// ---- Per-character motion for shared states (est.: short, slow rolls as in Melee) ------------------------
const A = actionStates[ID];
A.ESCAPEF.setVelocities = [0, 0, 0, ...bump(28, 26), 0, 0, 0, 0];
A.ESCAPEB.setVelocities = A.ESCAPEF.setVelocities.map((v) => -v);
A.TECHF.setVelocities = [0, 0, 0, 0, ...bump(30, 30), 0, 0, 0, 0, 0, 0];
A.TECHB.setVelocities = A.TECHF.setVelocities.map((v) => -v);
A.DOWNSTANDF.setVelocities = [0, 0, 0, ...bump(28, 28), 0, 0, 0, 0];
A.DOWNSTANDB.setVelocities = A.DOWNSTANDF.setVelocities.map((v) => -v);
A.CLIFFCATCH.posOffset = Array.from({ length: 7 }, (_, i) => [HANG[0] - 2.4 * (1 - (i + 1) / 7), HANG[1] + 1.6 * (1 - (i + 1) / 7)]);
A.CLIFFWAIT.posOffset = HANG.slice();

// ---------------------------------------------------------------------------------------------
// ECB (est.): [bottom, half width, side height, top] per state; one frame each (held for the whole state).
// Standing he is ~12 tall; crouched (a very low crouch) 7; lying down 4.
// ---------------------------------------------------------------------------------------------
/** ECB shape of a state name (also used for the THROWNRETRO states on other fighters). */
export function retroEcb(name) {
  if (/^(SQUAT|DOWNTILT|LANDING|KNEEBEND)/.test(name)) return [[2, 3, 3.5, 7]];
  if (/^(DOWN(BOUND|WAIT|DAMAGE)|SHIELDBREAKDOWNBOUND)/.test(name)) return [[1, 5, 2, 4]];
  if (/^CLIFF(CATCH|WAIT)/.test(name)) return [[2, 3, 7, 12]];
  return [[2, 3, 6.5, 12]];
}
const E = {};
for (const k of Object.keys(A)) E[k] = retroEcb(k);
setEcbData(ID, E);
