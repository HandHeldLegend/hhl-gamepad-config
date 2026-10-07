/**
 * fox.js: template character data and action states (meleelight's Fox (the arena's Vix)): attributes, hitboxes, frame counts, ECB data and the character's own moves.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { articles } from './article.js';
import { hitQueue } from './hit.js';
import { CHARIDS, activeStage, charObject, characterSelections, decodeEcb, ecb, framesData, gameSettings, offsets, player, setCharAttributes, setChars, setEcbData, setFrames, setHitBoxes, setIntangibility, setOffsets } from './ml.js';
import { S } from './shared.js';
import { actionStates, airDrift, checkForDash, checkForIASA, checkForJump, checkForSmashTurn, checkForSmashes, checkForSpecials, checkForTiltTurn, checkForTilts, fastfall, reduceByTraction, setupActionStates, tiltTurnDashBuffer, turnOffHitboxes } from './shortcuts.js';
import { Vec2D, createHitbox, createHitboxObject } from './util.js';

// ---- attributes, hitboxes, frame counts, hitbox offsets ----
setCharAttributes(CHARIDS.FOX_ID, {
  dashFrameMin: 11,
  dashFrameMax: 21,
  dInitV: 2.02,
  dMaxV: 2.2,
  dAccA: 0.1,
  dAccB: 0.02,
  dTInitV: 1.9,
  traction: 0.08,
  maxWalk: 1.6,
  jumpSquat: 3,
  sHopInitV: 2.1,
  fHopInitV: 3.68,
  gravity: 0.23,
  groundToAir: 0.83,
  jumpHmaxV: 1.7,
  jumpHinitV: 0.72,
  airMobA: 0.06,
  airMobB: 0.02,
  aerialHmaxV: 0.83,
  airFriction: 0.02,
  fastFallV: 3.4,
  terminalV: 2.8,
  walkInitV: 0.16,
  walkAcc: 0.2,
  walkMaxV: 1.6,
  djMultiplier: 1.2,
  djMomentum: 0.9,
  shieldScale: 14.375,
  modelScale: 0.96,
  weight: 75,
  waitAnimSpeed: 1,
  walljump: true,
  hurtboxOffset: [6, 13],
  ledgeSnapBoxOffset: [14, 8, 18],
  shieldOffset: [5, 34],
  charScale: 0.35,
  miniScale: 0.3,
  runTurnBreakPoint: 16,
  airdodgeIntangible: 25,
  wallJumpVelX: 1.4,
  wallJumpVelY: 3.3,
  shieldBreakVel: 2.5,
  multiJump: false,
  ecbScale: 1,
  walkAnimSpeed: 1,
  runAnimSpeed: 1
});
setIntangibility(CHARIDS.FOX_ID, {
  "ESCAPEAIR": [4, 25],
  "ESCAPEB": [4, 16],
  "ESCAPEF": [4, 16],
  "ESCAPEN": [2, 14],
  "DOWNSTANDN": [1, 23],
  "DOWNSTANDB": [12, 18],
  "DOWNSTANDF": [1, 19],
  "TECHN": [1, 20],
  "TECHB": [1, 20],
  "TECHF": [1, 20]
});
setFrames(CHARIDS.FOX_ID, {
  "WAIT": 120,
  "DASH": 21,
  "RUN": 25,
  "RUNBRAKE": 18,
  "RUNTURN": 20,
  "WALK": 26,
  "JUMPF": 40,
  "JUMPB": 40,
  "FALL": 8,
  "FALLAERIAL": 8,
  "FALLSPECIAL": 8,
  "SQUAT": 7,
  "SQUATWAIT": 100,
  "SQUATRV": 10,
  "JUMPAERIALF": 50,
  "JUMPAERIALB": 50,
  "PASS": 29,
  "GUARDON": 8,
  "GUARDOFF": 15,
  "CLIFFCATCH": 7,
  "CLIFFWAIT": 50,
  "DAMAGEFLYN": 29,
  "DAMAGEFALL": 30,
  "DAMAGEN2": 23,
  "LANDINGATTACKAIRF": 22,
  "LANDINGATTACKAIRB": 20,
  "LANDINGATTACKAIRU": 18,
  "LANDINGATTACKAIRD": 18,
  "LANDINGATTACKAIRN": 15,
  "ESCAPEB": 31,
  "ESCAPEF": 31,
  "ESCAPEN": 22,
  "DOWNBOUND": 26,
  "DOWNWAIT": 70,
  "DOWNSTANDN": 30,
  "DOWNSTANDB": 35,
  "DOWNSTANDF": 35,
  "TECHN": 26,
  "TECHB": 40,
  "TECHF": 40,
  "SHIELDBREAKFALL": 30,
  "SHIELDBREAKDOWNBOUND": 26,
  "SHIELDBREAKSTAND": 30,
  "FURAFURA": 110,
  "CAPTUREWAIT": 80,
  "CATCHWAIT": 30,
  "CAPTURECUT": 30,
  "CATCHCUT": 30,
  "CAPTUREDAMAGE": 20,
  "WALLDAMAGE": 41,
  "WALLTECH": 26,
  "WALLJUMP": 40,
  "OTTOTTO": 12,
  "OTTOTTOWAIT": 110,
  "THROWNMARTHUP": 9,
  "THROWNMARTHBACK": 5,
  "THROWNMARTHFORWARD": 9,
  "THROWNMARTHDOWN": 10,
  "THROWNPUFFUP": 5,
  "THROWNPUFFBACK": 18,
  "THROWNPUFFFORWARD": 9,
  "THROWNPUFFDOWN": 60,
  "THROWNFOXUP": 5,
  "THROWNFOXBACK": 6,
  "THROWNFOXFORWARD": 10,
  "THROWNFOXDOWN": 32,
  "THROWNFALCOUP": 5,
  "THROWNFALCOBACK": 6,
  "THROWNFALCOFORWARD": 8,
  "THROWNFALCODOWN": 24,
  "THROWNFALCONUP": 14,
  "THROWNFALCONBACK": 19,
  "THROWNFALCONFORWARD": 17,
  "THROWNFALCONDOWN": 15,
  "FURASLEEPSTART": 30,
  "FURASLEEPLOOP": 110,
  "FURASLEEPEND": 60,
  "STOPCEIL": 9,
  "TECHU": 26,
  "REBOUND": 14
});
setOffsets(CHARIDS.FOX_ID, {
  ledgegetupquick: {
    id0: [new Vec2D(5.27, 6.74), new Vec2D(5.36, 5.82), new Vec2D(5.58, 5.57), new Vec2D(5.73, 5.73), new Vec2D(5.87, 4.80), new Vec2D(7.99, 3.23), new Vec2D(6.11, 2.38), new Vec2D(6.22, 2.14), new Vec2D(6.34, 2.07), new Vec2D(6.46, 1.98)],
    id1: [new Vec2D(5.19, 5.54), new Vec2D(5.13, 4.39), new Vec2D(5.48, 3.78), new Vec2D(5.77, 3.90), new Vec2D(5.9, 4.75), new Vec2D(8.01, 4.86), new Vec2D(6.12, 4.10), new Vec2D(6.23, 3.16), new Vec2D(5.95, 2.32), new Vec2D(5.09, 1.52)],
    id2: [new Vec2D(-4.29, 7.60), new Vec2D(-4.16, 7.17), new Vec2D(-4.06, 6.29), new Vec2D(-3.97, 5.24), new Vec2D(-3.91, 4.49), new Vec2D(-1.81, 3.90), new Vec2D(-3.67, 3.30), new Vec2D(-3.45, 2.97), new Vec2D(-3.32, 2.61), new Vec2D(-3.21, 2.37)]
  },
  ledgegetupslow: {
    id0: [new Vec2D(6.1, 9.98), new Vec2D(7.64, 2.92), new Vec2D(6.89, 1.96)],
    id1: [new Vec2D(8.66, 12.62), new Vec2D(11.33, 1.28), new Vec2D(9.97, 0.83)],
    id2: [new Vec2D(-0.38, 8.36), new Vec2D(0.2, 7.10), new Vec2D(6.89, 1.96)]
  },
  downspecial: {
    id0: [new Vec2D(-0.60, 6.80)]
  },
  reflector: {
    id0: [new Vec2D(-0.60, 6.80)]
  },
  jab1: {
    id0: [new Vec2D(5.49, 5.97), new Vec2D(15.53, 8.15)],
    id1: [new Vec2D(6.20, 9.12), new Vec2D(9.00, 7.76)]
  },
  jab2: {
    id0: [new Vec2D(9.54, 6.93), new Vec2D(8.57, 6.99)],
    id1: [new Vec2D(2.9, 6.03), new Vec2D(2.96, 6.14)]
  },
  jab3_1: {
    id0: [new Vec2D(2.12, 10.36), new Vec2D(2.04, 10.10)],
    id1: [new Vec2D(4.99, 12.11), new Vec2D(4.80, 11.65)],
    id2: [new Vec2D(10.81, 15.64), new Vec2D(10.39, 14.75)]
  },
  jab3_2: {
    id0: [new Vec2D(2.30, 9.68), new Vec2D(2.19, 9.42)],
    id1: [new Vec2D(5.49, 10.75), new Vec2D(5.21, 10.35)],
    id2: [new Vec2D(11.94, 12.91), new Vec2D(11.31, 12.24)]
  },
  jab3_3: {
    id0: [new Vec2D(1.91, 8.41), new Vec2D(1.90, 8.27)],
    id1: [new Vec2D(5.28, 8.50), new Vec2D(5.20, 8.24)],
    id2: [new Vec2D(12.09, 8.68), new Vec2D(11.86, 8.17)]
  },
  jab3_4: {
    id0: [new Vec2D(2.33, 7.69), new Vec2D(2.19, 7.60)],
    id1: [new Vec2D(5.38, 6.97), new Vec2D(5.06, 6.81)],
    id2: [new Vec2D(11.53, 5.51), new Vec2D(10.86, 5.23)]
  },
  jab3_5: {
    id0: [new Vec2D(2.07, 6.67), new Vec2D(2.03, 6.73)],
    id1: [new Vec2D(4.79, 5.73), new Vec2D(4.57, 5.62)],
    id2: [new Vec2D(10.29, 3.84), new Vec2D(9.71, 3.36)]
  },
  dtilt: {
    id0: [new Vec2D(8.94, 1.69), new Vec2D(10.26, 2.59), new Vec2D(7.21, 2.72)],
    id1: [new Vec2D(10.70, 0.96), new Vec2D(13.98, 2.57), new Vec2D(9.94, 2.73)],
    id2: [new Vec2D(12.47, 0.24), new Vec2D(17.69, 2.54), new Vec2D(12.67, 2.75)]
  },
  uptilt: {
    id0: [new Vec2D(-3.84, 4.75), new Vec2D(-5.71, 10.79), new Vec2D(-1.74, 16.29), new Vec2D(4.51, 16.13), new Vec2D(4.68, 15.32), new Vec2D(4.00, 14.60), new Vec2D(3.12, 14.13)],
    id1: [new Vec2D(-3.84, 4.75), new Vec2D(-5.71, 10.79), new Vec2D(-1.74, 16.29), new Vec2D(4.51, 16.13), new Vec2D(4.68, 15.32), new Vec2D(4.00, 14.60), new Vec2D(3.12, 14.13)],
    id2: [new Vec2D(-3.83, 4.71), new Vec2D(-5.72, 10.77), new Vec2D(-1.82, 16.27), new Vec2D(4.42, 16.18), new Vec2D(4.60, 15.38), new Vec2D(3.93, 14.69), new Vec2D(3.06, 14.22)],
    id3: [new Vec2D(0.47, 8.19), new Vec2D(0.42, 9.35), new Vec2D(1.03, 10.22), new Vec2D(1.78, 10.30), new Vec2D(1.79, 10.21), new Vec2D(1.57, 10.22), new Vec2D(1.35, 10.20)]
  },
  ftilt: {
    id0: [new Vec2D(1.40, 5.27), new Vec2D(16.59, 8.63), new Vec2D(16.79, 8.71), new Vec2D(16.68, 8.81)],
    id1: [new Vec2D(4.33, 7.07), new Vec2D(11.07, 8.65), new Vec2D(11.17, 8.75), new Vec2D(10.99, 8.81)],
    id2: [new Vec2D(3.16, 7.68), new Vec2D(6.95, 8.64), new Vec2D(7.02, 8.74), new Vec2D(6.80, 8.78)]
  },
  dsmash: {
    id0: [new Vec2D(-8.65, 1.45), new Vec2D(-8.38, 1.38), new Vec2D(-7.79, 1.33), new Vec2D(-7.16, 1.30), new Vec2D(-6.80, 1.28)],
    id1: [new Vec2D(9.11, 1.84), new Vec2D(8.85, 1.64), new Vec2D(8.27, 1.50), new Vec2D(7.64, 1.40), new Vec2D(7.28, 1.34)],
    id2: [new Vec2D(-4.65, 1.46), new Vec2D(-4.52, 1.43), new Vec2D(-4.22, 1.40), new Vec2D(-3.91, 1.39), new Vec2D(-3.73, 1.38)],
    id3: [new Vec2D(5.11, 1.67), new Vec2D(4.99, 1.57), new Vec2D(4.70, 1.50), new Vec2D(4.39, 1.45), new Vec2D(4.21, 1.42)]
  },
  upsmash1: {
    id0: [new Vec2D(6.37, 7.58), new Vec2D(7.20, 11.13), new Vec2D(6.07, 15.54)],
    id1: [new Vec2D(5.97, 5.39), new Vec2D(9.32, 10.43), new Vec2D(8.29, 15.80)]
  },
  upsmash2: {
    id0: [new Vec2D(3.18, 18.46), new Vec2D(0.03, 19.23), new Vec2D(-2.46, 18.31), new Vec2D(-3.94, 16.49), new Vec2D(-4.53, 14.60), new Vec2D(-4.72, 13.03), new Vec2D(-4.65, 11.56), new Vec2D(-4.42, 10.17)],
    id1: [new Vec2D(3.66, 20.65), new Vec2D(-0.97, 21.23), new Vec2D(-4.18, 19.72), new Vec2D(-6.02, 17.30), new Vec2D(-6.74, 14.90), new Vec2D(-6.95, 13.04), new Vec2D(-6.88, 11.39), new Vec2D(-6.63, 9.84)]
  },
  fsmash1: {
    id0: [new Vec2D(9.91, 13.90), new Vec2D(12.14, 12.14), new Vec2D(13.27, 9.86), new Vec2D(13.55, 7.76), new Vec2D(13.27, 6.51)],
    id1: [new Vec2D(7.86, 10.32), new Vec2D(8.87, 9.50), new Vec2D(9.17, 8.50), new Vec2D(9.05, 7.57), new Vec2D(8.68, 7.02)],
    id2: [new Vec2D(6.52, 7.88), new Vec2D(6.26, 7.86), new Vec2D(5.95, 7.83), new Vec2D(5.57, 7.78), new Vec2D(5.16, 7.72)]
  },
  fsmash2: {
    id0: [new Vec2D(12.84, 5.93), new Vec2D(12.30, 5.54), new Vec2D(11.68, 5.20), new Vec2D(10.96, 4.79), new Vec2D(10.02, 4.09), new Vec2D(8.49, 2.90)],
    id1: [new Vec2D(8.22, 6.75), new Vec2D(7.70, 6.56), new Vec2D(7.10, 6.39), new Vec2D(6.44, 6.19), new Vec2D(5.71, 6.04), new Vec2D(4.92, 5.88)],
    id2: [new Vec2D(4.68, 7.65), new Vec2D(4.15, 7.57), new Vec2D(3.56, 7.47), new Vec2D(2.90, 7.36), new Vec2D(2.18, 7.24), new Vec2D(1.38, 7.11)]
  },
  downattack1: {
    id0: [new Vec2D(13.62, 6.43), new Vec2D(13.02, 6.40), new Vec2D(13.40, 6.44)],
    id1: [new Vec2D(7.95, 6.30), new Vec2D(7.17, 6.20), new Vec2D(7.57, 6.37)],
    id2: [new Vec2D(3.93, 5.78), new Vec2D(3.11, 5.78), new Vec2D(3.52, 5.78)]
  },
  downattack2: {
    id0: [new Vec2D(-5.48, 7.78), new Vec2D(-7.54, 8.56), new Vec2D(-8.09, 8.60)],
    id1: [new Vec2D(-8.47, 8.12), new Vec2D(-11.34, 8.56), new Vec2D(-11.79, 8.65)],
    id2: [new Vec2D(-1.00, 8.69), new Vec2D(-1.81, 9.03), new Vec2D(-2.50, 9.01)]
  },
  grab: {
    id0: [new Vec2D(8.25, 6.75), new Vec2D(8.25, 6.75)],
    id1: [new Vec2D(4.50, 6.75), new Vec2D(4.50, 6.75)]
  },
  pummel: {
    id0: [new Vec2D(6.83, 7.59)]
  },
  nair1: {
    id0: [],
    id1: [],
    id2: []
  },
  nair2: {
    id0: [],
    id1: [],
    id2: []
  },
  bair1: {
    id0: [],
    id1: [new Vec2D(-8.04, 9.59), new Vec2D(-8.05, 9.56), new Vec2D(-8.06, 9.51), new Vec2D(-8.07, 9.43)],
    id2: [new Vec2D(2.66, 4.20), new Vec2D(2.80, 4.16), new Vec2D(2.87, 4.17), new Vec2D(2.93, 4.19)]
  },
  bair2: {
    id0: [],
    id1: [new Vec2D(-7.91, 9.39), new Vec2D(-7.71, 9.23), new Vec2D(-7.47, 9.10), new Vec2D(-7.21, 8.97), new Vec2D(-6.96, 8.84), new Vec2D(-6.71, 8.72), new Vec2D(-6.47, 8.60), new Vec2D(-6.24, 8.48), new Vec2D(-6.02, 8.34), new Vec2D(-5.79, 8.19), new Vec2D(-5.55, 8.00), new Vec2D(-5.28, 7.80)],
    id2: [new Vec2D(2.97, 4.20), new Vec2D(3.00, 4.21), new Vec2D(3.01, 4.20), new Vec2D(2.99, 4.17), new Vec2D(2.99, 4.16), new Vec2D(2.99, 4.16), new Vec2D(2.98, 4.15), new Vec2D(2.95, 4.11), new Vec2D(2.87, 4.05), new Vec2D(2.83, 4.01), new Vec2D(2.78, 3.98), new Vec2D(2.71, 3.94)]
  },
  fair1: {
    id0: [new Vec2D(2.63, 8.74), new Vec2D(4.43, 8.57), new Vec2D(4.48, 8.48)],
    id1: [new Vec2D(6.48, 10.69), new Vec2D(8.52, 9.84), new Vec2D(7.88, 9.02)]
  },
  fair2: {
    id0: [new Vec2D(4.49, 7.33), new Vec2D(2.84, 6.75), new Vec2D(0.72, 6.23)],
    id1: [new Vec2D(8.90, 6.92), new Vec2D(7.11, 7.19), new Vec2D(3.46, 6.18)]
  },
  fair3: {
    id0: [new Vec2D(2.70, 8.89), new Vec2D(4.39, 8.31), new Vec2D(4.49, 8.43)],
    id1: [new Vec2D(6.80, 10.62), new Vec2D(8.61, 9.27), new Vec2D(7.76, 8.85)]
  },
  fair4: {
    id0: [new Vec2D(4.51, 7.57), new Vec2D(4.50, 7.32), new Vec2D(3.17, 7.04)],
    id1: [new Vec2D(4.99, 7.31), new Vec2D(8.81, 6.85), new Vec2D(7.52, 7.55)]
  },
  fair5: {
    id0: [new Vec2D(4.51, 7.72), new Vec2D(4.50, 7.64), new Vec2D(4.35, 7.51)],
    id1: [new Vec2D(8.16, 7.72), new Vec2D(8.03, 7.47), new Vec2D(7.81, 7.23)]
  },
  upair1: {
    id0: [new Vec2D(-3.72, 12.50), new Vec2D(-0.03, 15.77)],
    id1: [new Vec2D(-5.04, 13.52), new Vec2D(-0.18, 18.00)],
    id2: [new Vec2D(-2.07, 12.78), new Vec2D(0.77, 14.05)]
  },
  upair2: {
    id0: [new Vec2D(-1.22, 12.27), new Vec2D(-0.30, 13.19), new Vec2D(0.29, 13.07), new Vec2D(0.52, 12.48)],
    id1: [new Vec2D(-1.67, 14.42), new Vec2D(0.07, 15.69), new Vec2D(1.13, 14.87), new Vec2D(1.49, 13.01)],
    id2: [new Vec2D(0.61, 8.89), new Vec2D(0.66, 9.08), new Vec2D(0.65, 9.10), new Vec2D(0.58, 9.02)]
  },
  dair: {
    id0: [new Vec2D(1.82, 6.05), new Vec2D(2.02, 6.16)],
    id1: [new Vec2D(2.72, 3.95), new Vec2D(2.94, 4.08)]
  },
  upb1: {
    id0: [new Vec2D(0, 7.50)]
  },
  upb2: {
    id0: [new Vec2D(2.93, 11.72), new Vec2D(2.31, 11.72), new Vec2D(2.65, 11.72), new Vec2D(2.87, 11.72), new Vec2D(2.30, 11.72), new Vec2D(2.57, 11.72), new Vec2D(2.94, 11.72), new Vec2D(2.51, 11.72), new Vec2D(2.28, 11.72), new Vec2D(2.70, 11.72), new Vec2D(2.94, 11.72), new Vec2D(2.62, 11.72), new Vec2D(2.28, 11.72), new Vec2D(2.37, 11.72), new Vec2D(2.72, 11.72), new Vec2D(2.94, 11.72), new Vec2D(2.86, 11.72), new Vec2D(2.60, 11.72), new Vec2D(2.36, 11.72), new Vec2D(2.26, 11.72), new Vec2D(2.32, 11.72), new Vec2D(2.47, 11.72), new Vec2D(2.63, 11.72), new Vec2D(2.77, 11.72), new Vec2D(2.87, 11.72), new Vec2D(2.92, 11.72), new Vec2D(2.94, 11.72), new Vec2D(2.94, 11.72), new Vec2D(2.94, 11.72), new Vec2D(2.93, 11.72)]
  },
  dashattack1: {
    id0: [new Vec2D(9.83, 7.16), new Vec2D(9.21, 7.23), new Vec2D(8.56, 7.25), new Vec2D(8.59, 7.18)],
    id1: [new Vec2D(5.37, 7.49), new Vec2D(5.12, 7.56), new Vec2D(4.85, 7.57), new Vec2D(4.89, 7.53)]
  },
  dashattack2: {
    id0: [new Vec2D(7.9, 7.17), new Vec2D(7.95, 7.07), new Vec2D(8.02, 6.96), new Vec2D(8.09, 6.84), new Vec2D(8.15, 6.70), new Vec2D(8.22, 6.56), new Vec2D(8.29, 6.43), new Vec2D(8.36, 6.34), new Vec2D(8.43, 6.15), new Vec2D(8.51, 5.76)],
    id1: [new Vec2D(4.95, 7.47), new Vec2D(5.01, 7.39), new Vec2D(5.08, 7.31), new Vec2D(5.15, 7.20), new Vec2D(5.22, 7.09), new Vec2D(5.29, 6.97), new Vec2D(5.36, 6.86), new Vec2D(5.42, 6.76), new Vec2D(5.48, 6.61), new Vec2D(5.58, 6.32)]
  },
  throwforwardextra: {
    id0: [new Vec2D(7.74, 8.13)]
  },
  thrown: {
    id0: [new Vec2D(0, 12)]
  }
});
for (let k = 0; k < 4; k++) {
  offsets[CHARIDS.FOX_ID].nair1.id0.push(new Vec2D(-0.96, 6.53));
  offsets[CHARIDS.FOX_ID].nair1.id1.push(new Vec2D(5.72, 6.28));
  offsets[CHARIDS.FOX_ID].nair1.id2.push(new Vec2D(0.39, 3.88));
}
for (let k = 0; k < 23; k++) {
  offsets[CHARIDS.FOX_ID].nair2.id0.push(new Vec2D(-0.96, 6.53));
  offsets[CHARIDS.FOX_ID].nair2.id1.push(new Vec2D(5.72, 6.28));
  offsets[CHARIDS.FOX_ID].nair2.id2.push(new Vec2D(0.39, 3.88));
}
offsets[CHARIDS.FOX_ID].nair2.id0.push(new Vec2D(-0.91, 6.6));
offsets[CHARIDS.FOX_ID].nair2.id1.push(new Vec2D(5.50, 6.57));
offsets[CHARIDS.FOX_ID].nair2.id2.push(new Vec2D(0.42, 4.01));
for (let k = 0; k < 4; k++) {
  offsets[CHARIDS.FOX_ID].bair1.id0.push(new Vec2D(-0.02, 8.00));
}
for (let k = 0; k < 12; k++) {
  offsets[2].bair2.id0.push(new Vec2D(-0.02, 8.00));
}
setHitBoxes(CHARIDS.FOX_ID, {
  fair1: new createHitboxObject(new createHitbox(offsets[2].fair1.id0, 5.156, 7, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].fair1.id1, 5.156, 7, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair2: new createHitboxObject(new createHitbox(offsets[2].fair2.id0, 4.656, 5, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].fair2.id1, 4.656, 5, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair3: new createHitboxObject(new createHitbox(offsets[2].fair3.id0, 4.656, 6, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].fair3.id1, 4.656, 6, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair4: new createHitboxObject(new createHitbox(offsets[2].fair4.id0, 4.656, 4, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].fair4.id1, 4.656, 4, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair5: new createHitboxObject(new createHitbox(offsets[2].fair5.id0, 4.656, 3, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].fair5.id1, 4.656, 3, 361, 100, 10, 0, 0, 0, 1, 1)),
  bair1: new createHitboxObject(new createHitbox(offsets[2].bair1.id0, 3.660, 15, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].bair1.id1, 4.992, 15, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].bair1.id2, 3.328, 9, 361, 100, 10, 0, 0, 0, 1, 1)),
  bair2: new createHitboxObject(new createHitbox(offsets[2].bair2.id0, 3.328, 9, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].bair2.id1, 3.992, 9, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].bair2.id2, 3.328, 9, 361, 100, 10, 0, 0, 0, 1, 1)),
  nair1: new createHitboxObject(new createHitbox(offsets[2].nair1.id0, 3.496, 12, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].nair1.id1, 3.496, 12, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].nair1.id1, 2.992, 12, 361, 100, 10, 0, 0, 0, 1, 1)),
  nair2: new createHitboxObject(new createHitbox(offsets[2].nair2.id0, 3.496, 9, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].nair2.id1, 3.496, 9, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[2].nair2.id1, 2.922, 9, 361, 100, 10, 0, 0, 0, 1, 1)),
  dair: new createHitboxObject(new createHitbox(offsets[2].dair.id0, 5.156, 3, 290, 100, 0, 30, 0, 0, 1, 1), new createHitbox(offsets[2].dair.id1, 5.988, 2, 290, 100, 0, 30, 0, 0, 1, 1)),
  upair1: new createHitboxObject(new createHitbox(offsets[2].upair1.id0, 4.297, 5, 92, 120, 0, 30, 0, 0, 1, 1), new createHitbox(offsets[2].upair1.id1, 4.297, 5, 92, 120, 0, 30, 0, 0, 1, 1), new createHitbox(offsets[2].upair1.id2, 4.297, 5, 92, 120, 0, 30, 0, 0, 1, 1)),
  upair2: new createHitboxObject(new createHitbox(offsets[2].upair2.id0, 3.660, 13, 85, 116, 40, 0, 0, 0, 1, 1), new createHitbox(offsets[2].upair2.id1, 4.883, 13, 85, 116, 40, 0, 0, 0, 1, 1), new createHitbox(offsets[2].upair2.id2, 4.883, 13, 85, 116, 40, 0, 0, 0, 1, 1)),
  upb1: new createHitboxObject(new createHitbox(offsets[2].upb1.id0, 8.203, 2, 70, 40, 40, 0, 3, 0, 1, 1)),
  upb2: new createHitboxObject(new createHitbox(offsets[2].upb2.id0, 4.000, 14, 80, 60, 60, 0, 3, 0, 1, 1)),
  dtilt: new createHitboxObject(new createHitbox(offsets[2].dtilt.id0, 2.734, 10, 70, 125, 25, 0, 0, 1, 1, 1), new createHitbox(offsets[2].dtilt.id1, 2.734, 10, 80, 125, 25, 0, 0, 1, 1, 1), new createHitbox(offsets[2].dtilt.id2, 3.125, 10, 90, 125, 25, 0, 0, 1, 1, 1)),
  uptilt: new createHitboxObject(new createHitbox(offsets[2].uptilt.id0, 5.078, 12, 110, 140, 18, 0, 0, 1, 1, 1), new createHitbox(offsets[2].uptilt.id1, 5.078, 9, 84, 140, 18, 0, 0, 1, 1, 1), new createHitbox(offsets[2].uptilt.id2, 3.515, 9, 80, 140, 18, 0, 0, 1, 1, 1), new createHitbox(offsets[2].uptilt.id3, 3.125, 9, 80, 140, 18, 0, 0, 1, 1, 1)),
  ftilt: new createHitboxObject(new createHitbox(offsets[2].ftilt.id0, 2.734, 9, 361, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[2].ftilt.id1, 3.125, 9, 361, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[2].ftilt.id2, 2.344, 9, 361, 100, 0, 0, 0, 1, 1, 1)),
  dashattack1: new createHitboxObject(new createHitbox(offsets[2].dashattack1.id0, 3.828, 7, 72, 90, 35, 0, 0, 1, 1, 1), new createHitbox(offsets[2].dashattack1.id1, 3.828, 7, 72, 90, 35, 0, 0, 1, 1, 1)),
  dashattack2: new createHitboxObject(new createHitbox(offsets[2].dashattack2.id0, 2.734, 5, 72, 90, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[2].dashattack2.id1, 2.734, 5, 72, 90, 20, 0, 0, 1, 1, 1)),
  jab1: new createHitboxObject(new createHitbox(offsets[2].jab1.id0, 3.328, 4, 70, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab1.id1, 3.328, 4, 70, 100, 0, 0, 0, 1, 1, 1)),
  jab2: new createHitboxObject(new createHitbox(offsets[2].jab2.id0, 3.328, 4, 70, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab2.id1, 3.328, 4, 70, 100, 0, 0, 0, 1, 1, 1)),
  jab3_1: new createHitboxObject(new createHitbox(offsets[2].jab3_1.id0, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_1.id1, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_1.id2, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1)),
  jab3_2: new createHitboxObject(new createHitbox(offsets[2].jab3_2.id0, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_2.id1, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_2.id2, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1)),
  jab3_3: new createHitboxObject(new createHitbox(offsets[2].jab3_3.id0, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_3.id1, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_3.id2, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1)),
  jab3_4: new createHitboxObject(new createHitbox(offsets[2].jab3_4.id0, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_4.id1, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_4.id2, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1)),
  jab3_5: new createHitboxObject(new createHitbox(offsets[2].jab3_5.id0, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_5.id1, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].jab3_5.id2, 3.328, 1, 78, 80, 10, 0, 0, 1, 1, 1)),
  fsmash1: new createHitboxObject(new createHitbox(offsets[2].fsmash1.id0, 3.515, 15, 361, 105, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].fsmash1.id1, 3.125, 15, 361, 105, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].fsmash1.id2, 2.344, 15, 361, 105, 10, 0, 0, 1, 1, 1)),
  fsmash2: new createHitboxObject(new createHitbox(offsets[2].fsmash2.id0, 3.515, 12, 361, 105, 2, 0, 0, 1, 1, 1), new createHitbox(offsets[2].fsmash2.id1, 3.125, 12, 361, 105, 2, 0, 0, 1, 1, 1), new createHitbox(offsets[2].fsmash2.id2, 2.344, 12, 361, 105, 2, 0, 0, 1, 1, 1)),
  upsmash1: new createHitboxObject(new createHitbox(offsets[2].upsmash1.id0, 3.328, 18, 80, 112, 30, 0, 0, 1, 1, 1), new createHitbox(offsets[2].upsmash1.id1, 4.656, 18, 80, 112, 30, 0, 0, 1, 1, 1)),
  upsmash2: new createHitboxObject(new createHitbox(offsets[2].upsmash2.id0, 3.328, 13, 361, 100, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[2].upsmash2.id1, 3.828, 13, 361, 100, 10, 0, 0, 1, 1, 1)),
  dsmash: new createHitboxObject(new createHitbox(offsets[2].dsmash.id0, 4.687, 15, 25, 65, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[2].dsmash.id1, 4.687, 15, 25, 65, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[2].dsmash.id2, 3.515, 12, 361, 65, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[2].dsmash.id3, 3.515, 12, 361, 65, 20, 0, 0, 1, 1, 1)),
  grab: new createHitboxObject(new createHitbox(offsets[2].grab.id0, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1), new createHitbox(offsets[2].grab.id1, 2.734, 0, 361, 100, 0, 0, 2, 3, 1, 1)),
  downattack1: new createHitboxObject(new createHitbox(offsets[2].downattack1.id0, 7.031, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[2].downattack1.id1, 3.906, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[2].downattack1.id2, 3.906, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  downattack2: new createHitboxObject(new createHitbox(offsets[2].downattack2.id0, 4.687, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[2].downattack2.id1, 6.250, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[2].downattack2.id2, 8.694, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  downspecial: new createHitboxObject(new createHitbox(offsets[2].downspecial.id0, 7.999, 5, 0, 100, 0, 80, 4, 0, 1, 1)),
  reflector: new createHitboxObject(new createHitbox(offsets[2].reflector.id0, 7.999, 0, 361, 100, 0, 0, 7, 0, 1, 1)),
  ledgegetupquick: new createHitboxObject(new createHitbox(offsets[2].ledgegetupquick.id0, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[2].ledgegetupquick.id1, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[2].ledgegetupquick.id2, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1)),
  ledgegetupslow: new createHitboxObject(new createHitbox(offsets[2].ledgegetupslow.id0, 3.125, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[2].ledgegetupslow.id1, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[2].ledgegetupslow.id2, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1)),
  pummel: new createHitboxObject(new createHitbox(offsets[2].pummel.id0, 5.859, 3, 361, 100, 0, 30, 0, 0, 1, 1)),
  throwup: new createHitboxObject(new createHitbox(new Vec2D(-0.067, 17.54), 0, 2, 90, 110, 75, 0, 0, 0, 1, 1)),
  throwdown: new createHitboxObject(new createHitbox(new Vec2D(0.50063, 0), 0, 1, 270, 40, 150, 0, 0, 0, 1, 1)),
  throwback: new createHitboxObject(new createHitbox(new Vec2D(-6.59, 5.66), 0, 2, 124, 85, 80, 0, 0, 0, 1, 1)),
  throwforward: new createHitboxObject(new createHitbox(new Vec2D(9.58, 2.805), 0, 3, 45, 130, 35, 0, 0, 0, 1, 1)),
  throwforwardextra: new createHitboxObject(new createHitbox(offsets[2].throwforwardextra.id0, 8.593, 7, 361, 110, 40, 0, 0, 0, 1, 1)),
  thrown: new createHitboxObject(new createHitbox(offsets[2].thrown.id0, 3.906, 4, 361, 50, 20, 0, 1, 0, 1, 1))
});
for (let l = 0; l < 20; l++) {
  offsets[CHARIDS.FOX_ID].thrown.id0.push(new Vec2D(0, 12));
}
setChars(CHARIDS.FOX_ID, new charObject(CHARIDS.FOX_ID));


/** The character's own action states (shared ones come from shared.js). */
export const M = {};

M.JAB1 = {
  name: "JAB1",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JAB1";
    pl.timer = 0;
    pl.phys.jabCombo = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.jab1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.jab1.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 2 && pl.timer < 32 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 2) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 2 && pl.timer < 4) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 4) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 5 && pl.phys.jabCombo) {
      M.JAB2.init(p, input);
      return true;
    } else if (pl.timer > 17) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 15) {
      const b = checkForSpecials(p, input);
      const t = checkForTilts(p, input);
      const s = checkForSmashes(p, input);
      const j = checkForJump(p, input);
      if (j[0]) {
        S.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (b[0]) {
        M[b[1]].init(p, input);
        return true;
      } else if (s[0]) {
        M[s[1]].init(p, input);
        return true;
      } else if (t[0]) {
        M[t[1]].init(p, input);
        return true;
      } else if (checkForDash(p, input)) {
        S.DASH.init(p, input);
        return true;
      } else if (checkForSmashTurn(p, input)) {
        S.SMASHTURN.init(p, input);
        return true;
      } else if (checkForTiltTurn(p, input)) {
        pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
        S.TILTTURN.init(p, input);
        return true;
      } else if (Math.abs(input[p][0].lsX) > 0.3) {
        S.WALK.init(p, true, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

M.JAB2 = {
  name: "JAB2",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JAB2";
    pl.timer = 0;
    pl.phys.jabCombo = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.jab2.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.jab2.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer === 1) {
        pl.phys.cVel.x = 0;
      } else if (pl.timer === 2) {
        pl.phys.cVel.x = 3.36 * pl.phys.face;
      } else if (pl.timer === 4) {
        pl.phys.cVel.x = 0;
      }
      if (pl.timer > 0 && pl.timer < 21 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 3) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 3 && pl.timer < 5) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 5) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 5 && pl.phys.jabCombo) {
      M.JAB3.init(p, input);
      return true;
    } else if (pl.timer > 20) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 16) {
      const b = checkForSpecials(p, input);
      const t = checkForTilts(p, input);
      const s = checkForSmashes(p, input);
      const j = checkForJump(p, input);
      if (j[0]) {
        S.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (b[0]) {
        M[b[1]].init(p, input);
        return true;
      } else if (s[0]) {
        M[s[1]].init(p, input);
        return true;
      } else if (t[0]) {
        M[t[1]].init(p, input);
        return true;
      } else if (checkForDash(p, input)) {
        S.DASH.init(p, input);
        return true;
      } else if (checkForSmashTurn(p, input)) {
        S.SMASHTURN.init(p, input);
        return true;
      } else if (checkForTiltTurn(p, input)) {
        pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
        S.TILTTURN.init(p, input);
        return true;
      } else if (Math.abs(input[p][0].lsX) > 0.3) {
        S.WALK.init(p, true, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

M.JAB3 = {
  name: "JAB3",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JAB3";
    pl.timer = 0;
    pl.phys.jabCombo = false;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 6 && pl.timer < 43 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 9) {
        pl.hitboxes.id[0] = pl.charHitboxes.jab3_1.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.jab3_1.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.jab3_1.id2;
      } else if (pl.timer === 16) {
        pl.hitboxes.id[0] = pl.charHitboxes.jab3_2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.jab3_2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.jab3_2.id2;
      } else if (pl.timer === 23) {
        pl.hitboxes.id[0] = pl.charHitboxes.jab3_3.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.jab3_3.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.jab3_3.id2;
      } else if (pl.timer === 30) {
        pl.hitboxes.id[0] = pl.charHitboxes.jab3_4.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.jab3_4.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.jab3_4.id2;
      } else if (pl.timer === 37) {
        pl.hitboxes.id[0] = pl.charHitboxes.jab3_5.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.jab3_5.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.jab3_5.id2;
      }
      if (pl.timer > 8 && pl.timer < 40) {
        switch (pl.timer % 7) {
          case 2:
            pl.hitboxes.active = [true, true, true, false];
            pl.hitboxes.frame = 0;
            break;
          case 3:
            pl.hitboxes.frame++;
            break;
          case 4:
            turnOffHitboxes(p);
            break;
        }
      }
      if (pl.timer === 43 && pl.phys.jabCombo) {
        pl.phys.jabCombo = false;
        pl.timer = 7;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 51) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNTILT = {
  name: "DOWNTILT",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNTILT";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dtilt.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dtilt.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dtilt.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 7 && pl.timer < 10) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 29) {
      S.SQUATWAIT.init(p, input);
      return true;
    } else if (pl.timer > 27) {
      const b = checkForSpecials(p, input);
      const t = checkForTilts(p, input);
      const s = checkForSmashes(p, input);
      const j = checkForJump(p, input);
      if (j[0]) {
        S.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (b[0]) {
        M[b[1]].init(p, input);
        return true;
      } else if (s[0]) {
        M[s[1]].init(p, input);
        return true;
      } else if (t[0]) {
        M[t[1]].init(p, input);
        return true;
      } else if (checkForDash(p, input)) {
        S.DASH.init(p, input);
        return true;
      } else if (checkForSmashTurn(p, input)) {
        S.SMASHTURN.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face < -0.3 && Math.abs(input[p][0].lsX) > input[p][0].lsY * -1) {
        pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
        S.TILTTURN.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face > 0.3 && Math.abs(input[p][0].lsX) > input[p][0].lsY * -1) {
        S.WALK.init(p, true, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

M.UPTILT = {
  name: "UPTILT",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPTILT";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.uptilt.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.uptilt.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.uptilt.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.uptilt.id3;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 5 && pl.timer < 12) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 12) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 23) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 22) {
      const b = checkForSpecials(p, input);
      const t = checkForTilts(p, input);
      const s = checkForSmashes(p, input);
      const j = checkForJump(p, input);
      if (j[0]) {
        S.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (b[0]) {
        M[b[1]].init(p, input);
        return true;
      } else if (s[0]) {
        M[s[1]].init(p, input);
        return true;
      } else if (t[0]) {
        M[t[1]].init(p, input);
        return true;
      } else if (checkForDash(p, input)) {
        S.DASH.init(p, input);
        return true;
      } else if (checkForSmashTurn(p, input)) {
        S.SMASHTURN.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face < -0.3 && Math.abs(input[p][0].lsX) > input[p][0].lsY * -1) {
        pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
        S.TILTTURN.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face > 0.3 && Math.abs(input[p][0].lsX) > input[p][0].lsY * -1) {
        S.WALK.init(p, true, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

M.FORWARDTILT = {
  name: "FORWARDTILT",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FORWARDTILT";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.ftilt.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.ftilt.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.ftilt.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 5 && pl.timer < 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 26) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.FORWARDSMASH = {
  name: "FORWARDSMASH",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FORWARDSMASH";
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.fsmash1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fsmash1.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.fsmash1.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 7) {
      if (input[p][0].a || input[p][0].z) {
        pl.phys.charging = true;
        pl.phys.chargeFrames++;
        if (pl.phys.chargeFrames === 5) {}
        if (pl.phys.chargeFrames === 60) {
          pl.timer++;
          pl.phys.charging = false;
        }
      } else {
        pl.timer++;
        pl.phys.charging = false;
      }
    } else {
      pl.timer++;
      pl.phys.charging = false;
    }
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer < 9) {
        pl.phys.cVel.x = 0;
      } else if (pl.timer < 15) {
        pl.phys.cVel.x = 1.34 * pl.phys.face;
      } else if (pl.timer < 31) {
        pl.phys.cVel.x = 1.00 * pl.phys.face;
      } else {
        pl.phys.cVel.x = 0;
      }
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 23) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 17) {
        pl.hitboxes.id[0] = pl.charHitboxes.fsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fsmash2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.fsmash2.id2;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 23) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 39) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.UPSMASH = {
  name: "UPSMASH",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPSMASH";
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.upsmash1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.upsmash1.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 2) {
      if (input[p][0].a || input[p][0].z) {
        pl.phys.charging = true;
        pl.phys.chargeFrames++;
        if (pl.phys.chargeFrames === 5) {}
        if (pl.phys.chargeFrames === 60) {
          pl.timer++;
          pl.phys.charging = false;
        }
      } else {
        pl.timer++;
        pl.phys.charging = false;
      }
    } else {
      pl.timer++;
      pl.phys.charging = false;
    }
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 7 && pl.timer < 18) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
        pl.hitboxes.id[0] = pl.charHitboxes.upsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.upsmash2.id1;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 18) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 41) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNSMASH = {
  name: "DOWNSMASH",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSMASH";
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dsmash.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dsmash.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dsmash.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dsmash.id3;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 2) {
      if (input[p][0].a || input[p][0].z) {
        pl.phys.charging = true;
        pl.phys.chargeFrames++;
        if (pl.phys.chargeFrames === 5) {}
        if (pl.phys.chargeFrames === 60) {
          pl.timer++;
          pl.phys.charging = false;
        }
      } else {
        pl.timer++;
        pl.phys.charging = false;
      }
    } else {
      pl.timer++;
      pl.phys.charging = false;
    }
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 11) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 11) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 49) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 45 && !pl.inCSS) {
      const b = checkForSpecials(p, input);
      const t = checkForTilts(p, input);
      const s = checkForSmashes(p, input);
      const j = checkForJump(p, input);
      if (j[0]) {
        S.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (b[0]) {
        M[b[1]].init(p, input);
        return true;
      } else if (s[0]) {
        M[s[1]].init(p, input);
        return true;
      } else if (t[0]) {
        M[t[1]].init(p, input);
        return true;
      } else if (checkForDash(p, input)) {
        S.DASH.init(p, input);
        return true;
      } else if (checkForSmashTurn(p, input)) {
        S.SMASHTURN.init(p, input);
        return true;
      } else if (checkForTiltTurn(p, input)) {
        pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
        S.TILTTURN.init(p, input);
        return true;
      } else if (Math.abs(input[p][0].lsX) > 0.3) {
        S.WALK.init(p, true, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

M.ATTACKAIRF = {
  name: "ATTACKAIRF",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKAIRF";
    pl.timer = 0;
    pl.phys.autoCancel = true;
    pl.inAerial = true;
    pl.IASATimer = 52;
    pl.hitboxes.id[0] = pl.charHitboxes.fair1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fair1.id1;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 5) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 7 || pl.timer === 8) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 16) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.fair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fair2.id1;
        pl.hitboxes.active = [true, true, false, false];
      }
      if (pl.timer > 16 && pl.timer < 19) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 19) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 24) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.fair3.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fair3.id1;
        pl.hitboxes.active = [true, true, false, false];
      }
      if (pl.timer > 24 && pl.timer < 27) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 27) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 33) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.fair4.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fair4.id1;
        pl.hitboxes.active = [true, true, false, false];
      }
      if (pl.timer > 33 && pl.timer < 36) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 36) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 43) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.fair5.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fair5.id1;
        pl.hitboxes.active = [true, true, false, false];
      }
      if (pl.timer > 43 && pl.timer < 46) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 46) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 50) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 59) {
      S.FALL.init(p, input);
      return true;
    } else if (checkForIASA(p, input, true)) {
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    if (player[p].phys.autoCancel) {
      S.LANDING.init(p, input);
    } else {
      S.LANDINGATTACKAIRF.init(p, input);
    }
  }
};

M.ATTACKAIRB = {
  name: "ATTACKAIRB",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKAIRB";
    pl.timer = 0;
    pl.phys.autoCancel = true;
    pl.inAerial = true;
    pl.IASATimer = 37;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.bair1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.bair1.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.bair1.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 3) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 20) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        pl.hitboxes.id[0] = pl.charHitboxes.bair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.bair2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.bair2.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 20) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 25) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 39) {
      S.FALL.init(p, input);
      return true;
    } else if (checkForIASA(p, input, true)) {
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    if (player[p].phys.autoCancel) {
      S.LANDING.init(p, input);
    } else {
      S.LANDINGATTACKAIRB.init(p, input);
    }
  }
};

M.ATTACKAIRU = {
  name: "ATTACKAIRU",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKAIRU";
    pl.timer = 0;
    pl.phys.autoCancel = true;
    pl.inAerial = true;
    pl.IASATimer = 35;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.upair1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.upair1.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.upair1.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 7) {
        pl.phys.autoCancel = false;
      } else if (pl.timer === 8) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer === 9) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 10) {
        turnOffHitboxes(p);
      } else if (pl.timer === 11) {
        pl.hitboxes.id[0] = pl.charHitboxes.upair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.upair2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.upair2.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 11 && pl.timer < 15) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 15) {
        turnOffHitboxes(p);
      } else if (pl.timer === 27) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 39) {
      S.FALL.init(p, input);
      return true;
    } else if (checkForIASA(p, input, true)) {
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    if (player[p].phys.autoCancel) {
      S.LANDING.init(p, input);
    } else {
      S.LANDINGATTACKAIRU.init(p, input);
    }
  }
};

M.ATTACKAIRD = {
  name: "ATTACKAIRD",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKAIRD";
    pl.timer = 0;
    pl.phys.autoCancel = true;
    pl.inAerial = true;
    pl.IASATimer = 60;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dair.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 4) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 4 && pl.timer < 26) {
        switch (pl.timer % 3) {
          case 2:
            pl.hitboxes.active = [true, true, false, false];
            pl.hitboxes.frame = 0;
            break;
          case 0:
            pl.hitboxes.frame++;
            break;
          case 1:
            turnOffHitboxes(p);
            break;
        }
      }
      if (pl.timer === 32) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 49) {
      S.FALL.init(p, input);
      return true;
    } else if (checkForIASA(p, input, true)) {
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    if (player[p].phys.autoCancel) {
      S.LANDING.init(p, input);
    } else {
      S.LANDINGATTACKAIRD.init(p, input);
    }
  }
};

M.ATTACKAIRN = {
  name: "ATTACKAIRN",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKAIRN";
    pl.timer = 0;
    pl.phys.autoCancel = true;
    pl.inAerial = true;
    pl.IASATimer = 41;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.nair1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.nair1.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.nair1.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 3) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 4 && pl.timer < 8) {
        pl.hitboxes.frames++;
      }
      if (pl.timer === 8) {
        pl.hitboxes.id[0] = pl.charHitboxes.nair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.nair2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.nair2.id2;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 8 && pl.timer < 32) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 32) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 38) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 49) {
      S.FALL.init(p, input);
      return true;
    } else if (checkForIASA(p, input, true)) {
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    if (player[p].phys.autoCancel) {
      S.LANDING.init(p, input);
    } else {
      S.LANDINGATTACKAIRN.init(p, input);
    }
  }
};

M.ATTACKDASH = {
  name: "ATTACKDASH",
  canEdgeCancel: false,
  setVelocities: [0.99874, 1.82126, 2.22815, 2.43704, 1.91481, 1.39379, 1.36213, 1.33162, 1.30228, 1.27408, 1.24704, 1.22115, 1.19642, 1.17284, 1.15042, 1.12915, 1.10902, 1.09006, 1.06475, 1.01691, 0.94598, 0.85192, 0.73477, 0.59452, 0.43115, 0.32167, 0.28310, 0.24695, 0.21323, 0.18194, 0.15309, 0.12666, 0.10266, 0.08109, 0.06194, 0.04524, 0.03096, 0.0191, 0.00968],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKDASH";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dashattack1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dashattack1.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      pl.phys.cVel.x = this.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 18) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        pl.hitboxes.id[0] = pl.charHitboxes.dashattack2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.dashattack2.id1;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 18) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer < 5 && (input[p][0].lA > 0 || input[p][0].rA > 0)) {
      if (pl.phys.cVel.x * pl.phys.face > pl.charAttributes.dMaxV) {
        pl.phys.cVel.x = pl.charAttributes.dMaxV * pl.phys.face;
      }
      M.GRAB.init(p, input);
      return true;
    } else if (pl.timer > 35) {
      const b = checkForSpecials(p, input);
      const t = checkForTilts(p, input);
      const s = checkForSmashes(p, input);
      const j = checkForJump(p, input);
      if (j[0]) {
        S.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (b[0]) {
        M[b[1]].init(p, input);
        return true;
      } else if (s[0]) {
        M[s[1]].init(p, input);
        return true;
      } else if (t[0]) {
        M[t[1]].init(p, input);
        return true;
      } else if (checkForDash(p, input)) {
        S.DASH.init(p, input);
        return true;
      } else if (checkForSmashTurn(p, input)) {
        S.SMASHTURN.init(p, input);
        return true;
      } else if (checkForTiltTurn(p, input)) {
        pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
        S.TILTTURN.init(p, input);
        return true;
      } else if (Math.abs(input[p][0].lsX) > 0.3) {
        S.WALK.init(p, true, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

M.UPSPECIAL = {
  name: "UPSPECIAL",
  init: function (p, input) {
    M.UPSPECIALCHARGE.init(p, input);
  }
};

M.UPSPECIALCHARGE = {
  name: "UPSPECIALCHARGE",
  canPassThrough: false,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "UPSPECIALCHARGE",
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPSPECIALCHARGE";
    pl.timer = 0;
    pl.phys.cVel.x *= 0.8;
    pl.phys.cVel.y = 0;
    pl.phys.fastfalled = false;
    pl.phys.landingMultiplier = 10;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.upb1.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const frame = (pl.timer - 1) % 10;
      if (pl.phys.grounded) {
        reduceByTraction(p);
      } else {
        if (pl.phys.cVel.x > 0) {
          pl.phys.cVel.x -= pl.charAttributes.airFriction;
          if (pl.phys.cVel.x < 0) {
            pl.phys.cVel.x = 0;
          }
        } else if (pl.phys.cVel.x < 0) {
          pl.phys.cVel.x += pl.charAttributes.airFriction;
          if (pl.phys.cVel.x > 0) {
            pl.phys.cVel.x = 0;
          }
        }
      }
      if (pl.timer === 42) {
        let firefoxAngle = input[p][0].lsX === 0 && input[p][0].lsY === 0 ? Math.PI / 2 : Math.atan2(input[p][0].lsY, input[p][0].lsX);
        if (pl.phys.grounded && pl.phys.onSurface[0] === 0) {
          if (firefoxAngle < -Math.PI / 2) {
            firefoxAngle += 2 * Math.PI;
          }
          const groundedAngle = pl.phys.groundAngle || Math.PI / 2;
          if (firefoxAngle > groundedAngle + Math.PI / 2) {
            firefoxAngle = groundedAngle + Math.PI / 2;
          } else if (firefoxAngle < groundedAngle - Math.PI / 2) {
            firefoxAngle = groundedAngle - Math.PI / 2;
          }
        }
        if (firefoxAngle > Math.PI) {
          firefoxAngle -= 2 * Math.PI;
        }
        pl.phys.upbAngleMultiplier = firefoxAngle;
      } else if (pl.timer >= 16 && !pl.phys.grounded) {
        pl.phys.cVel.y -= 0.015;
      }
      if (pl.timer > 19 && pl.timer < 34) {
        switch (pl.timer % 2) {
          case 0:
            pl.hitboxes.active = [true, false, false, false];
            pl.hitboxes.frame = 0;
            break;
          case 1:
            turnOffHitboxes(p);
            break;
        }
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 42) {
      M.UPSPECIALLAUNCH.init(p, input);
    } else {
      return false;
    }
  },
  land: function (p, input) {}
};

M.UPSPECIALLAUNCH = {
  name: "UPSPECIALLAUNCH",
  canPassThrough: true,
  canGrabLedge: [true, true],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "UPSPECIALLAUNCH",
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPSPECIALLAUNCH";
    pl.timer = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.upb2.id0;
    pl.hitboxes.active = [true, false, false, false];
    pl.hitboxes.frame = 0;
    pl.rotation = Math.PI / 2 - pl.phys.upbAngleMultiplier;
    if (pl.phys.upbAngleMultiplier !== Math.PI / 2) {
      if (Math.abs(pl.phys.upbAngleMultiplier) > Math.PI / 2) {
        pl.phys.face = -1;
      } else {
        pl.phys.face = 1;
      }
    }
    pl.rotationPoint = new Vec2D(0, 40);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer < 31) {
        if (pl.timer % 2) {}
      }
      if (pl.phys.grounded) {
        reduceByTraction(p);
      } else {
        if (pl.phys.cVel.x > 0) {
          pl.phys.cVel.x -= pl.charAttributes.airFriction;
          if (pl.phys.cVel.x < 0) {
            pl.phys.cVel.x = 0;
          }
        } else if (pl.phys.cVel.x < 0) {
          pl.phys.cVel.x += pl.charAttributes.airFriction;
          if (pl.phys.cVel.x > 0) {
            pl.phys.cVel.x = 0;
          }
        }
      }
      if (pl.timer >= 31) {
        if (pl.phys.grounded) {
          reduceByTraction(p);
        } else {
          fastfall(p, input);
          airDrift(p, input);
        }
      } else if (pl.timer >= 6) {
        pl.phys.cVel.y -= 0.1 * Math.sin(pl.phys.upbAngleMultiplier);
        pl.phys.cVel.x -= 0.1 * Math.cos(pl.phys.upbAngleMultiplier);
      } else if (pl.timer >= 1) {
        pl.phys.grounded = false;
        pl.phys.cVel.y = 3.8 * Math.sin(pl.phys.upbAngleMultiplier);
        pl.phys.cVel.x = 3.8 * Math.cos(pl.phys.upbAngleMultiplier);
      }
      if (pl.timer > 1 && pl.timer < 31) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 31) {
        turnOffHitboxes(p);
        pl.rotation = 0;
        pl.rotationPoint = new Vec2D(0, 0);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 50) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALLSPECIAL.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    if (player[p].timer < 31) {
      M.FIREFOXBOUNCE.init(p, input);
    } else {}
  }
};

M.FIREFOXBOUNCE = {
  name: "FIREFOXBOUNCE",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  setVelocities: [0.00062, 0.00062, 0.00062, 5.27148, 5.4568, 2.56, 0.0638, 0.02712, -0.00286, -0.02613, -0.0427, -0.05257, -0.05573, -1.83217],
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FIREFOXBOUNCE";
    pl.timer = 0;
    pl.phys.grounded = false;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.phys.cVel.x !== 0) {
        pl.phys.cVel.x -= 0.03 * pl.phys.face;
        if (pl.phys.cVel.x * pl.phys.face < 0) {
          pl.phys.cVel.x = 0;
        }
      }
      pl.phys.cVel.y = this.setVelocities[pl.timer - 1];
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 14) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALLSPECIAL.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    S.LANDING.init(p, input);
  }
};

M.NEUTRALSPECIALAIR = {
  name: "NEUTRALSPECIALAIR",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALAIR";
    pl.timer = 0;
    pl.phys.laserCombo = false;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer >= 4 && pl.timer <= 14) {
        if (input[p][0].b && !input[p][1].b) {
          pl.phys.laserCombo = true;
        }
      }
      if (pl.timer === 15) {
        if (pl.phys.laserCombo) {
          pl.timer = 5;
          pl.phys.laserCombo = false;
        }
      }
      if (pl.timer === 7) {}
      if (pl.timer === 10) {
        articles.LASER.init({
          p: p,
          x: 8,
          y: 9,
          rotate: 0
        });
      }
      if (pl.timer === 30) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 36) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.NEUTRALSPECIALGROUND = {
  name: "NEUTRALSPECIALGROUND",
  canPassThrough: false,
  canEdgeCancel: true,
  disableTeeter: true,
  canBeGrabbed: true,
  airborneState: "NEUTRALSPECIALAIR",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALGROUND";
    pl.timer = 0;
    pl.phys.laserCombo = false;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p);
      if (pl.timer >= 4 && pl.timer <= 16) {
        if (input[p][0].b && !input[p][1].b) {
          pl.phys.laserCombo = true;
        }
      }
      if (pl.timer === 17) {
        if (pl.phys.laserCombo) {
          pl.timer = 7;
          pl.phys.laserCombo = false;
        }
      }
      if (pl.timer === 9) {}
      if (pl.timer === 12) {
        articles.LASER.init({
          p: p,
          x: 8,
          y: 7,
          rotate: 0
        });
      }
      if (pl.timer === 37) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 40) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALAIR = {
  name: "SIDESPECIALAIR",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR";
    pl.timer = 0;
    if (pl.phys.grounded) {
      pl.phys.cVel.x = 0;
    } else {
      pl.phys.cVel.x *= 0.667;
      pl.phys.cVel.y = 0;
    }
    pl.phys.landingMultiplier = 1.5;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (!pl.phys.grounded) {
        if (pl.timer >= 16 && pl.timer < 21) {
          pl.phys.cVel.y -= 0.01667;
        }
        if (pl.timer <= 21) {
          if (pl.phys.cVel.x !== 0) {
            const dir = Math.sign(pl.phys.cVel.x);
            pl.phys.cVel.x -= dir * 0.05;
            if (pl.phys.cVel.x * dir < 0) {
              pl.phys.cVel.x = 0;
            }
          }
        }
        if (pl.timer >= 29) {
          pl.phys.cVel.y -= 0.08;
        }
        if (pl.timer === 21) {
          articles.ILLUSION.init({
            p: p,
            type: 0
          });
          pl.phys.cVel.x = 18.72 * pl.phys.face;
          pl.phys.cVel.y = 0;
          if ((input[p][0].b || input[p][1].b) && !input[p][2].b) {
            pl.timer = 24;
          }
        } else if (pl.timer === 22 || pl.timer === 23) {
          if (input[p][0].b && !input[p][1].b) {
            pl.timer = 24;
          }
        }
        if (pl.timer === 24) {
          pl.phys.cVel.x = 2 * pl.phys.face;
        }
        if (pl.timer > 24) {
          pl.phys.cVel.x -= 0.07 * pl.phys.face;
          if (pl.phys.cVel.x * pl.phys.face < 0) {
            pl.phys.cVel.x = 0;
          }
        }
        if (pl.timer === 20) {}
      } else {
        pl.actionState = "SIDESPECIALAIR";
        pl.timer--;
        this.main(p, input);
      }
      if (pl.timer >= 21 && pl.timer <= 24) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 63) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALLSPECIAL.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    const pl = player[p];
    if (pl.timer >= 20) {
      S.LANDINGFALLSPECIAL.init(p, input);
    } else {
      pl.actionState = "SIDESPECIALGROUND";
    }
  }
};

M.SIDESPECIALGROUND = {
  name: "SIDESPECIALGROUND",
  canPassThrough: false,
  canEdgeCancel: true,
  disableTeeter: true,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  airborneState: "SIDESPECIALAIR",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.landingMultiplier = 1.5;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.phys.grounded) {
        if (pl.timer === 21) {
          articles.ILLUSION.init({
            p: p,
            type: 1
          });
          pl.phys.cVel.x = 18.72 * pl.phys.face;
          if ((input[p][0].b || input[p][1].b) && !input[p][2].b) {
            pl.timer = 24;
          }
        } else if (pl.timer === 22 || pl.timer === 23) {
          if (input[p][0].b && !input[p][1].b) {
            pl.timer = 24;
          }
        }
        if (pl.timer === 24) {
          pl.phys.cVel.x = 2.1 * pl.phys.face;
        }
        if (pl.timer > 24) {
          pl.phys.cVel.x -= 0.1 * pl.phys.face;
          if (pl.phys.cVel.x * pl.phys.face < 0) {
            pl.phys.cVel.x = 0;
          }
        }
        if (pl.timer === 20) {}
      } else {
        pl.actionState = "SIDESPECIALAIR";
        pl.timer--;
        M.SIDESPECIALAIR.main(p, input);
      }
      if (pl.timer >= 21 && pl.timer <= 24) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 63) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALLSPECIAL.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {}
};

M.DOWNSPECIALAIR = {
  name: "DOWNSPECIALAIR",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIR";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.cVel.y = 0;
    pl.phys.cVel.x *= 0.5;
    pl.shineLoop = 6;
    pl.phys.inShine = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecial.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    pl.phys.inShine++;
    if (!this.interrupt(p, input)) {
      if (pl.phys.grounded) {
        pl.actionState = "DOWNSPECIALGROUND";
        pl.timer--;
        M.DOWNSPECIALGROUND.main(p, input);
      } else {
        if (pl.phys.cVel.x > 0) {
          if (pl.phys.cVel.x > 0.85) {
            pl.phys.cVel.x -= 0.03;
          } else {
            pl.phys.cVel.x -= 0.02;
          }
          if (pl.phys.cVel.x < 0) {
            pl.phys.cVel.x = 0;
          }
        } else if (pl.phys.cVel.x < 0) {
          if (pl.phys.cVel.x < -0.85) {
            pl.phys.cVel.x += 0.03;
          } else {
            pl.phys.cVel.x += 0.02;
          }
          if (pl.phys.cVel.x > 0) {
            pl.phys.cVel.x = 0;
          }
        }
        if (pl.timer >= 5) {
          pl.phys.cVel.y -= 0.02667;
          if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
            pl.phys.cVel.y = -pl.charAttributes.terminalV;
          }
        }
        if (pl.timer >= 4 && pl.timer <= 32) {
          if (pl.shineLoop === 6) {
            pl.shineLoop = 0;
          }
          pl.shineLoop++;
        }
        if (pl.timer === 35) {
          pl.phys.face *= -1;
          pl.timer = 4;
        }
        if (pl.timer >= 4 && pl.timer <= 32) {
          if (input[p][0].lsX * pl.phys.face < 0) {
            pl.timer = 32;
          } else if (pl.phys.inShine >= 22) {
            if (!input[p][0].b) {
              pl.timer = 36;
            } else if (pl.timer === 32) {
              pl.timer = 4;
            }
          }
        }
        if (pl.timer === 1) {
          pl.hitboxes.active = [true, false, false, false];
          pl.hitboxes.frame = 0;
          pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 1);
        }
        if (pl.timer === 2) {
          turnOffHitboxes(p);
          pl.hitboxes.id[0] = pl.charHitboxes.reflector.id0;
        }
        if (pl.timer === 4) {
          pl.hitboxes.active = [true, false, false, false];
          pl.hitboxes.frame = 0;
        }
        if (pl.timer === 36) {
          turnOffHitboxes(p);
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer >= 4 && pl.timer <= 32) {
      if (!pl.phys.doubleJumped) {
        if (input[p][0].x && !input[p][1].x || input[p][0].y && !input[p][1].y || gameSettings["tapJumpOffp" + (p + 1)] == false && input[p][0].lsY >= 0.7 && input[p][3].lsY < 0.7) {
          if (input[p][0].lsX * pl.phys.face < -0.3) {
            S.JUMPAERIALB.init(p, input);
          } else {
            S.JUMPAERIALF.init(p, input);
          }
          turnOffHitboxes(p);
          return true;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else if (pl.timer > 49) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUND";
    if (pl.timer >= 4 && pl.timer <= 35) {
      pl.hitboxes.id[0] = pl.charHitboxes.reflector.id0;
      pl.hitboxes.active = [true, false, false, false];
      pl.hitboxes.frame = 0;
    }
  }
};

M.DOWNSPECIALGROUND = {
  name: "DOWNSPECIALGROUND",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "DOWNSPECIALAIR",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUND";
    pl.timer = 0;
    pl.phys.inShine = 0;
    pl.shineLoop = 6;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecial.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    pl.phys.inShine++;
    if (!this.interrupt(p, input)) {
      if (pl.phys.onSurface[0] === 1 && pl.timer > 1) {
        if (input[p][0].lsY < -0.66 && input[p][6].lsY >= 0) {
          pl.phys.grounded = false;
          pl.phys.passing = true;
          pl.phys.cVel.y = -0.5;
        }
      }
      if (pl.phys.grounded) {
        reduceByTraction(p);
        if (pl.timer >= 3) {}
        if (pl.timer >= 4 && pl.timer <= 35) {
          if (pl.shineLoop === 6) {
            pl.shineLoop = 0;
          }
          pl.shineLoop++;
        }
        if (pl.timer === 35) {
          pl.phys.face *= -1;
          pl.timer = 4;
        }
        if (pl.timer >= 4 && pl.timer <= 32) {
          if (input[p][0].lsX * pl.phys.face < 0) {
            pl.timer = 32;
          } else if (pl.phys.inShine >= 22) {
            if (!input[p][0].b) {
              pl.timer = 36;
            } else if (pl.timer === 32) {
              pl.timer = 4;
            }
          }
        }
        if (pl.timer === 1) {
          pl.hitboxes.active = [true, false, false, false];
          pl.hitboxes.frame = 0;
          pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 1);
        }
        if (pl.timer === 2) {
          turnOffHitboxes(p);
          pl.hitboxes.id[0] = pl.charHitboxes.reflector.id0;
        }
        if (pl.timer === 4) {
          pl.hitboxes.active = [true, false, false, false];
          pl.hitboxes.frame = 0;
        }
        if (pl.timer === 36) {
          turnOffHitboxes(p);
        }
      } else {
        pl.actionState = "DOWNSPECIALAIR";
        pl.timer--;
        M.DOWNSPECIALAIR.main(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer >= 4 && pl.timer <= 32) {
      const j = checkForJump(p, input);
      if (j[0]) {
        S.KNEEBEND.init(p, j[1], input);
        turnOffHitboxes(p);
        return true;
      } else {
        return false;
      }
    } else if (pl.timer > 49) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

M.THROWBACK = {
  name: "THROWBACK",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWBACK";
    pl.timer = 0;
    const grabbing = pl.phys.grabbing;
    if (grabbing === -1) {
      return;
    }
    actionStates[characterSelections[grabbing]].THROWNFOXBACK.init(grabbing);
    const frame = framesData[characterSelections[grabbing]].THROWNFOXBACK;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwback.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 8 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (prevFrame < 10 && pl.timer >= 10) {
        pl.phys.face *= -1;
      }
      if (prevFrame < 14 && pl.timer >= 14) {
        articles.LASER.init({
          p: p,
          x: 5.2,
          y: 10,
          rotate: Math.PI * 0.22
        });
      } else if (prevFrame < 16 && pl.timer >= 16) {
        articles.LASER.init({
          p: p,
          x: 5.4,
          y: 9.7,
          rotate: Math.PI * 0.20
        });
      } else if (prevFrame < 19 && pl.timer >= 19) {
        articles.LASER.init({
          p: p,
          x: 5.3,
          y: 9.8,
          rotate: Math.PI * 0.22
        });
      }
      if (Math.floor(pl.timer + 0.01) >= 8 && Math.floor(prevFrame + 0.01) < 8) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 32) {
      pl.phys.grabbing = -1;
      S.WAIT.init(p, input);
      return true;
    } else {
      const grabbing = pl.phys.grabbing;
      if (grabbing === -1) {
        return;
      }
      if (pl.timer < pl.phys.releaseFrame && player[grabbing].phys.grabbedBy !== p) {
        S.CATCHCUT.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  }
};

M.THROWDOWN = {
  name: "THROWDOWN",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWDOWN";
    pl.timer = 0;
    const grabbing = pl.phys.grabbing;
    if (grabbing === -1) {
      return;
    }
    actionStates[characterSelections[grabbing]].THROWNFOXDOWN.init(grabbing);
    const frame = framesData[characterSelections[grabbing]].THROWNFOXDOWN;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwdown.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 33 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 33 && Math.floor(prevFrame + 0.01) < 33) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwdown.id0;
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
        turnOffHitboxes(p);
      }
      if (prevFrame < 23 && pl.timer >= 23) {
        articles.LASER.init({
          p: p,
          x: 1,
          y: 12,
          rotate: Math.PI * 275 / 180
        });
      } else if (prevFrame < 25 && pl.timer >= 25) {
        articles.LASER.init({
          p: p,
          x: 1,
          y: 16,
          rotate: Math.PI * 260 / 180
        });
      } else if (prevFrame < 28 && pl.timer >= 28) {
        articles.LASER.init({
          p: p,
          x: 2,
          y: 15,
          rotate: Math.PI * 290 / 180
        });
      } else if (prevFrame < 31 && pl.timer >= 31) {
        articles.LASER.init({
          p: p,
          x: 2,
          y: 17,
          rotate: Math.PI * 275 / 180
        });
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 43) {
      pl.phys.grabbing = -1;
      S.WAIT.init(p, input);
      return true;
    } else {
      const grabbing = pl.phys.grabbing;
      if (grabbing === -1) {
        return;
      }
      if (pl.timer < pl.phys.releaseFrame && player[grabbing].phys.grabbedBy !== p) {
        S.CATCHCUT.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  }
};

M.THROWUP = {
  name: "THROWUP",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWUP";
    pl.timer = 0;
    const grabbing = pl.phys.grabbing;
    if (grabbing === -1) {
      return;
    }
    actionStates[characterSelections[grabbing]].THROWNFOXUP.init(grabbing, input);
    turnOffHitboxes(p);
    const frame = framesData[characterSelections[grabbing]].THROWNFOXUP;
    pl.phys.releaseFrame = frame + 1;
    pl.hitboxes.id[0] = pl.charHitboxes.throwup.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 7 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (prevFrame < 13 && pl.timer >= 13) {} else if (prevFrame < 16 && pl.timer >= 16) {
        articles.LASER.init({
          p: p,
          x: 1.6,
          y: 18,
          rotate: Math.PI * 85 / 180
        });
      } else if (prevFrame < 18 && pl.timer >= 18) {
        articles.LASER.init({
          p: p,
          x: 0.5,
          y: 18,
          rotate: Math.PI / 2
        });
      } else if (prevFrame < 21 && pl.timer >= 21) {
        articles.LASER.init({
          p: p,
          x: 0,
          y: 18,
          rotate: Math.PI * 87 / 180
        });
      } else if (prevFrame < 33 && pl.timer >= 33) {}
      if (Math.floor(pl.timer + 0.01) >= 7 && Math.floor(prevFrame + 0.01) < 7) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 33) {
      pl.phys.grabbing = -1;
      S.WAIT.init(p, input);
      return true;
    } else {
      const grabbing = pl.phys.grabbing;
      if (grabbing === -1) {
        return;
      }
      if (pl.timer < pl.phys.releaseFrame && player[grabbing].phys.grabbedBy !== p) {
        S.CATCHCUT.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  }
};

M.THROWFORWARD = {
  name: "THROWFORWARD",
  canEdgeCancel: false,
  canBeGrabbed: true,
  setVelocities: [-0.08, -0.14, -0.03, 0.24, 0.68, 0.99, 1.02, 0.78, 0.57, 0.57, 0.57, 0.57, 0.56, 0.56, 0.55, 0.54, 0.53, 0.52, 0.50, 0.49, 0.47, 0.45, 0.43, 0.41, 0.39, 0.36, 0, 0, 0, 0, 0, 0, 0],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWFORWARD";
    pl.timer = 0;
    const grabbing = pl.phys.grabbing;
    if (grabbing === -1) {
      return;
    }
    actionStates[characterSelections[grabbing]].THROWNFOXFORWARD.init(grabbing, input);
    const frame = framesData[characterSelections[grabbing]].THROWNFOXFORWARD;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwforward.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 11 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      pl.phys.cVel.x = this.setVelocities[Math.floor(pl.timer + 0.01) - 1] * pl.phys.face;
      if (Math.floor(pl.timer + 0.01) >= 11 && Math.floor(prevFrame + 0.01) < 11) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 33) {
      pl.phys.grabbing = -1;
      S.WAIT.init(p, input);
      return true;
    } else {
      const grabbing = pl.phys.grabbing;
      if (grabbing === -1) {
        return;
      }
      if (pl.timer < pl.phys.releaseFrame && player[grabbing].phys.grabbedBy !== p) {
        S.CATCHCUT.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  }
};

M.THROWNFOXUP = {
  name: "THROWNFOXUP",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-6.51, -1.28], [-5.85, -0.71], [-5.36, -0.70], [-5.17, 1.05], [-3.03, 9.59], [-3.03, 9.59]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFOXUP";
    const grabbedBy = pl.phys.grabbedBy;
    if (grabbedBy === -1) {
      return;
    }
    if (grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x, player[grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > this.offset.length) {
          timer = this.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + this.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + this.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNFOXDOWN = {
  name: "THROWNFOXDOWN",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-4.73, -1.04], [-2.33, -2.27], [-1.90, -2.37], [-1.84, -2.24], [-1.84, -1.78], [-1.98, 0.41], [-1.04, 3.44], [-0.05, 4.15], [0.82, 4.32], [1.03, 4.03], [1.07, 3.56], [1.07, 3.82], [1.07, 4.00], [0.85, 4.14], [-0.45, 6.59], [-0.78, -4.04], [-0.82, -4.75], [-0.81, -3.89], [-0.78, -3.11], [-0.72, -3.45], [-0.65, -4.18], [-0.57, -4.29], [-0.50, -2.78], [-0.50, -5.04], [-0.50, -4.74], [-0.50, -4.44], [-0.50, -4.15], [-0.50, -3.88], [-0.50, -3.63], [-0.50, -3.40], [-0.50, -3.20], [-0.50, -3.04], [-0.50, -3.04]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFOXDOWN";
    const grabbedBy = pl.phys.grabbedBy;
    if (grabbedBy === -1) {
      return;
    }
    if (grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.face *= -1;
    pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x, player[grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > this.offset.length) {
          timer = this.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + this.offset[timer - 1][0] * pl.phys.face * -1, player[grabbedBy].phys.pos.y + this.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNFOXBACK = {
  name: "THROWNFOXBACK",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-8.09, -1.57], [-6.98, -1.81], [-3.72, -2.73], [-0.66, -3.92], [3.34, -4.39], [7.60, 2.89], [7.60, 2.89]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFOXBACK";
    const grabbedBy = pl.phys.grabbedBy;
    if (grabbedBy === -1) {
      return;
    }
    if (grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.face *= -1;
    pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x, player[grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > this.offset.length) {
          timer = this.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + this.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + this.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNFOXFORWARD = {
  name: "THROWNFOXFORWARD",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-7.82, -0.77], [-7.39, -0.03], [-7.39, 0.12], [-7.34, 0.13], [-6.76, 0.30], [-5.98, 0.49], [-5.37, 0.65], [-5.3, 0.72], [-5.99, 0.61], [-7.42, 0.38], [-7.42, 0.38]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFOXFORWARD";
    const grabbedBy = pl.phys.grabbedBy;
    if (grabbedBy === -1) {
      return;
    }
    if (grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x, player[grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        if (timer > this.offset.length) {
          pl.timer = this.offset.length - 1;
        }
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > this.offset.length) {
          timer = this.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + this.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + this.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.CLIFFGETUPQUICK = {
  name: "CLIFFGETUPQUICK",
  canBeGrabbed: true,
  offset: [[-70.7039, -13.92], [-71.27977, -12.96], [-71.69937, -12.06755], [-72.07638, -11.06843], [-72.24, -9.6], [-72.24, -6.74401], [-72.24, -3.84], [-71.35111, -1.99111], [-69.60889, -0.56889], [-67.19112, 0]],
  setVelocities: [0.48171, 0.47829, 0.50249, 0.51401, 0.45477, 0.32475, 0.12398, 0, 0, 0, 0],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFGETUPQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 30;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[pl.phys.onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 24) {
        if (pl.timer >= 14) {
          pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 14][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 14][1]);
        }
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 24] * pl.phys.face;
      }
      if (pl.timer === 24) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 33) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = true;
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFGETUPSLOW = {
  name: "CLIFFGETUPSLOW",
  offset: [[-70.32, -14.23684], [-70.32, -14.04406], [-70.32, -13.83467], [-70.32, -13.62174], [-70.32, -13.41828], [-70.32, -13.23734], [-70.32, -13.09195], [-70.32, -12.99516], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.94646], [-70.32, -12.90716], [-70.32, -12.84404], [-70.32, -12.75909], [-70.32, -12.65426], [-70.32, -12.53151], [-70.32, -12.3928], [-70.32, -12.24], [-70.32, -12.07538], [-70.32, -11.90058], [-70.32, -11.71768], [-70.32, -11.52864], [-70.32, -11.33542], [-70.32, -11.13999], [-70.32, -10.94429], [-70.32, -10.75031], [-70.32, -10.56], [-70.32, -10.33863], [-70.32, -10.05937], [-70.32, -9.73605], [-70.32, -9.3825], [-70.32, -9.01255], [-70.32, -8.64], [-70.32, -8.29058], [-70.32, -7.96354], [-70.32, -7.63306], [-70.32, -7.27329], [-70.32, -6.85842], [-70.32, -6.3626], [-70.32, -5.76], [-70.22906, -4.87181], [-69.98633, -3.67591], [-69.63692, -2.38155], [-69.22598, -1.19796], [-68.79863, -0.33436], [-68.00137, 0]],
  setVelocities: [0.38672, 0.41407, 0.42994, 0.43436, 0.42731, 0.40879],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFGETUPSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 55;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 54) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 54] * pl.phys.face;
      }
      if (pl.timer === 54) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 59) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFESCAPEQUICK = {
  name: "CLIFFESCAPEQUICK",
  offset: [[-70.67906, -13.98], [-71.27813, -12.96], [-71.87907, -11.55], [-72.24, -9.6], [-72.24, -6.62999], [-72.24, -3.84], [-71.35111, -1.99114], [-69.60889, -0.5689], [-67.19112, 0]],
  setVelocities: [0.7218, 1.0418, 1.11641, 1.55599, 1.324, 0.93156, 1.16625, 0.78219, 0.37686, 0.33425, 0.24889, 0.27022, 0.35558, 0.3342, 1.92, 2.4414, 2.54756, 2.57555, 2.52538, 2.39703, 2.19051, 1.90581, 1.54296, 1.10192, 0.73904, 0.52734, 0.34701, 0.19804],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPEQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 34;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 22) {
        if (pl.timer >= 13) {
          pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 13][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 13][1]);
        }
      } else if (pl.timer < 50) {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 22] * pl.phys.face;
      }
      if (pl.timer === 22) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 49) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFESCAPESLOW = {
  name: "CLIFFESCAPESLOW",
  offset: [[-70.32, -14.23684], [-70.32, -14.04406], [-70.32, -13.83467], [-70.32, -13.62174], [-70.32, -13.41828], [-70.32, -13.23734], [-70.32, -13.09195], [-70.32, -12.99516], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.94646], [-70.32, -12.90716], [-70.32, -12.84404], [-70.32, -12.75909], [-70.32, -12.65426], [-70.32, -12.53151], [-70.32, -12.3928], [-70.32, -12.24], [-70.32, -12.07538], [-70.32, -11.90058], [-70.32, -11.71768], [-70.32, -11.52864], [-70.32, -11.33542], [-70.32, -11.13999], [-70.32, -10.94429], [-70.32, -10.75031], [-70.32, -10.56], [-70.32, -10.33863], [-70.32, -10.05937], [-70.32, -9.73605], [-70.32, -9.3825], [-70.32, -9.01255], [-70.32, -8.64], [-70.32, -8.29058], [-70.32, -7.96354], [-70.32, -7.63306], [-70.32, -7.27329], [-70.32, -6.85842], [-70.32, -6.3626], [-70.32, -5.76], [-70.17775, -4.87171], [-69.82212, -3.67591], [-69.35983, -2.38155], [-68.89757, -1.19796], [-68.54206, -0.33436], [-68.25794, 0]],
  setVelocities: [0.48879, 1.49473, 2.5425, 3.63211, 2.55094, 2.41367, 2.27723, 2.14161, 2.00682, 1.87285, 1.7397, 1.60738, 1.47588, 1.34521, 1.21536, 1.08633, 0.95814, 0.83076, 0.67258, 0.49966, 0.35163, 0.22852, 0.13032, 0.05701, 0.00862, -0.01488],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPESLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 62;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 54) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 54] * pl.phys.face;
      }
      if (pl.timer === 54) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 79) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFJUMPQUICK = {
  name: "CLIFFJUMPQUICK",
  offset: [[-70.8428, -14.38776], [-71.49446, -14.32052], [-72.19153, -14.1652], [-72.85054, -13.88868], [-73.38803, -13.45787], [-73.72054, -12.83965], [-73.76461, -12.00094], [-73.50131, -10.89611], [-73.00593, -9.5458], [-72.33633, -8.01628], [-71.55035, -6.37383], [-70.70587, -4.6847], [-69.86075, -3.01518], [-69.07284, -1.43152]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 14;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 15) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 15) {
        pl.phys.cVel = new Vec2D(1.1 * pl.phys.face, 4);
      }
      if (pl.timer > 15) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 51) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFJUMPSLOW = {
  name: "CLIFFJUMPSLOW",
  offset: [[-70.24197, -14.37161], [-70.01204, -14.25485], [-69.68486, -14.01434], [-69.31504, -13.61466], [-68.9572, -13.0204], [-68.66598, -12.19617], [-68.49598, -11.10656], [-68.49598, -8.58951], [-69.17776, -4.88456], [-68.95471, -2.05875], [-68.61933, -0.74366], [-68.49973, -0.30766], [-68.72181, -0.92297], [-69.22082, -2.17673], [-69.18517, -2.92594], [-69.0908, -3.15013], [-69.0474, -3.24815], [-69.17303, -2.92594], [-69.01739, -1.4797]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 19;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 20) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 20) {
        pl.phys.cVel = new Vec2D(1.1 * pl.phys.face, 4);
      }
      if (pl.timer > 20) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 51) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFATTACKSLOW = {
  name: "CLIFFATTACKSLOW",
  offset: [[-70.32, -14.23684], [-70.32, -14.04406], [-70.32, -13.83467], [-70.32, -13.62174], [-70.32, -13.41828], [-70.32, -13.23734], [-70.32, -13.09195], [-70.32, -12.99516], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.96], [-70.32, -12.94935], [-70.32, -12.91799], [-70.32, -12.86679], [-70.32, -12.79665], [-70.32, -12.70842], [-70.32, -12.603], [-70.32, -12.48127], [-70.32, -12.3441], [-70.32, -12.19237], [-70.32, -12.02697], [-70.32, -11.84876], [-70.32, -11.65864], [-70.32, -11.45747], [-70.32, -11.24615], [-70.32, -11.02554], [-70.32, -10.79653], [-70.32, -10.56], [-70.32, -10.31413], [-70.32, -10.05515], [-70.32, -9.78105], [-70.32, -9.48977], [-70.32, -9.17929], [-70.32, -8.84757], [-70.32, -8.49258], [-70.32, -8.11228], [-70.32, -7.70465], [-70.32, -7.26763], [-70.32, -6.79921], [-70.32, -6.29734], [-70.32, -5.76], [-70.17651, -4.94739], [-69.81816, -3.77266], [-69.35315, -2.46318], [-68.88966, -1.24633], [-68.53587, -0.34948], [-68.26413, 0]],
  setVelocities: [0.34921, 0.88711, 1.15682, 1.15835, 0.89168, 0.35682, 0, 0, 0, 0, 0, -0.16, -0.32, -0.350399, -0.385, -0.37701],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFATTACKSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 53;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.ledgegetupslow.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.ledgegetupslow.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.ledgegetupslow.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 54) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 54] * pl.phys.face;
      }
      if (pl.timer === 54) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 57) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 57 && pl.timer < 60) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 60) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 69) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFATTACKQUICK = {
  name: "CLIFFATTACKQUICK",
  offset: [[-70.70355, -13.91997], [-71.27906, -12.96], [-71.69882, -12.06759], [-72.07618, -11.06843], [-72.24, -9.6], [-72.24, -6.74399], [-72.24, -3.84], [-71.01049, -1.99348], [-68.39889, -0.57355], [-63.64237, 0]],
  setVelocities: [0.1943, 0.03352, 1.59986, 1.91979, 2.12469, 2.21458, 2.18944, 2.04928, 1.79411, 1.42391, 0.93869, 0.33846, 0, 0, 0, -0.34, -0.61998, -0.75406, -1.08875, -1.3431, -1.5171, -1.61075, -1.62405, -1.557, -1.4096, -1.18185, -0.87376, -0.69279, -0.65007, -0.54367, -0.3736],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFATTACKQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 15;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.ledgegetupquick.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.ledgegetupquick.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.ledgegetupquick.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 24) {
        if (pl.timer >= 14) {
          pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 14][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 14][1]);
        }
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 24] * pl.phys.face;
      }
      if (pl.timer === 24) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 25) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 25 && pl.timer < 35) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 35) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 54) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNATTACK = {
  name: "DOWNATTACK",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNATTACK";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downattack1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.downattack1.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.downattack1.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 1) {
        pl.phys.intangibleTimer = 26;
      }
      if (pl.timer === 17) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 17 && pl.timer < 20) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 20) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 24) {
        pl.hitboxes.id[0] = pl.charHitboxes.downattack2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.downattack2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.downattack2.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 24 && pl.timer < 27) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 27) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 49) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.GRAB = {
  name: "GRAB",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "GRAB";
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.grab.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.grab.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 7 && pl.timer < 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 30) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CATCHATTACK = {
  name: "CATCHATTACK",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CATCHATTACK";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.pummel.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer === 10) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 11) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 24) {
      S.CATCHWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.APPEAL = {
  name: "APPEAL",
  canEdgeCancel: false,
  canBeGrabbed: true,
  setVelocities1: [-0.38101, -0.4175, -0.44566, -0.4655, -0.47702, -0.48022, -0.4751, -0.46166, -0.4399, -0.40981, -0.37141, -0.32469, -0.26964, -0.20628, -0.13459, 0],
  setVelocities2: [0.12714, 0.14992, 0.17104, 0.19052, 0.20834, 0.22450, 0.23902, 0.25188, 0.26309, 0.27265, 0.28055, 0.2868, 0.2914, 0.29434, 0.29563, 0.29527, 0.29326, 0.28959, 0.28427, 0.27729, 0.26867, 0.25839],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "APPEAL";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer > 1 && pl.timer < 18) {
        pl.phys.cVel.x = this.setVelocities1[pl.timer - 2] * pl.phys.face;
      } else if (pl.timer > 88) {
        pl.phys.cVel.x = this.setVelocities2[pl.timer - 89] * pl.phys.face;
      }
      if (pl.timer === 31) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 110) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

setupActionStates(CHARIDS.FOX_ID, { ...S, ...M });

actionStates[CHARIDS.FOX_ID].ESCAPEB.setVelocities = [0, 0, 0, 0, 0, 0, -0.46222, -1.31556, -2.06222, -5.76, -2.36391, -1.47609, -1.19896, -0.97833, -1.10208, -1.37792, -1.50167, -1.51354, -1.47984, -1.53891, -1.75248, -1.86955, -1.70572, -1.261, -0.73878, -0.42036, -0.24296, -0.20661, -0.31128, -0.58266, -0.37734];
actionStates[CHARIDS.FOX_ID].ESCAPEF.setVelocities = [0, 0, 0, 0, 0, 0, 2.4, 4.32, 4.8, 1.0299, 0.89, 1.08094, 1.74377, 1.86418, 1.80236, 1.70153, 1.68123, 1.658, 1.63183, 1.60272, 1.44005, 1.16476, 0.9179, 0.69951, 0.50956, 0.34806, 0.21502, 0.11042, 0.03427, -0.01343, -0.03268];
actionStates[CHARIDS.FOX_ID].DOWNSTANDB.setVelocities = [-0.10375, -0.1061, -0.110, -0.11575, -0.12306, -0.23723, -0.44395, -0.63087, -0.79798, -0.9453, -1.07281, -1.18053, -1.26844, -1.33655, -1.38486, -1.41336, -1.35442, -1.24543, -1.17278, -1.13645, -1.13645, -1.17278, -1.24543, -1.33619, -1.40092, -1.43573, -1.44064, -1.41564, -1.36074, -1.27593, -1.16121, -1.01659, -0.84207, -0.63763, -0.40329];
actionStates[CHARIDS.FOX_ID].DOWNSTANDF.setVelocities = [0.1659, 0.21687, 0.53598, 1.35686, 1.56439, 3.82358, 3.48149, 3.15542, 2.84537, 2.55133, 2.27332, 2.01131, 1.76532, 1.53536, 1.3214, 1.12347, 0.94155, 0.77564, 0.62576, 0.49189, 0.37403, 0.2722, 0.18638, 0.11658, 0.06279, 0.02502, 0.00327, -0.00247, -0.00023, -0.00056, -0.00069, -0.00063, -0.00036, 0.0001, 0.00076];
actionStates[CHARIDS.FOX_ID].TECHB.setVelocities = [0, -1.90448, -1.87286, -1.84, -1.81, -1.77, -1.73, -1.70, -1.66, -1.62, -1.58, -1.53, -1.49, -1.44, -1.40, -1.35, -1.30, -1.25, -1.20, -1.15, -1.09, -1.04, -0.98, -0.93, -0.87, -0.81, -0.75, -0.68, -0.62, -0.56, -0.49, 0, 0, 0, 0, 0, 0, -0.002, -0.002, -0.002];
actionStates[CHARIDS.FOX_ID].TECHF.setVelocities = [0, 0, 0, 0, 0, 0, 0, 2.56, 2.49, 2.43, 2.36, 2.29, 2.22, 2.14, 2.07, 1.99, 1.90, 1.82, 1.73, 1.64, 1.54, 1.45, 1.35, 1.24, 1.14, 1.03, 0.92, 0.81, 0.70, 0.58, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
actionStates[CHARIDS.FOX_ID].CLIFFCATCH.posOffset = [[-73.09594, -13.47469], [-72.8175, -13.5675], [-72.41531, -13.70156], [-71.94, -13.86], [-71.44219, -14.02594], [-70.9725, -14.1825], [-70.58157, -14.31281]];
actionStates[CHARIDS.FOX_ID].CLIFFWAIT.posOffset = [-70.32, -14.4];

// ---- ECB (environmental collision box) offsets per action-state frame, run-length encoded (see decodeEcb in ml.js) ----
setEcbData(CHARIDS.FOX_ID, decodeEcb({
  ATTACKAIRB: "439=539=64:=559=i549=g539=c53:>539=53:>539=b53:>a539=439>429>a429=338=",
  ATTACKAIRD: "63:=63:>539=539<529=439=a539=b539<529=429=439=539=e529=a429=439=a539=b529=539=d549=53:>539=a439=a439>b439=338=d",
  ATTACKAIRF: "439>439=438<a539=a549=b63:=c539=a549=64:=63:=a539<a63:=539=549=c63:=c539=a549=539=63:=73:=639<539<539=a53:>a549=a54:>549=a449>c439>439=338=d",
  ATTACKAIRN: "539=a539<549=448<b449=c448<449=c549=449=448<a449=b549=549<d649<b549=539=a439=449=e448<449=a348=338=439=338=",
  ATTACKAIRU: "338<448<448;437:337:3369a428;52:>53:>439=62;?53:?52:>438<437:43793369a336823583369337:a337;b338<a439=b338=c348=338=a",
  ATTACKDASH: "448;539=64:=75:=64:=74:=c64:=e449=b448<a347;336924582358c33692369337:e327;a328<428<",
  CAPTURECUT: "337;w337:a337;a328<428<",
  CAPTUREDAMAGE: "337;23692358336823582458246934693369337:3369337:3369a236:337:327;337;a327;",
  CAPTUREPULLED: "337;236:",
  CATCHATTACK: "438<338<438<d428<j438<448<348<338<448<438<",
  CAPTUREWAIT: "337;c327;b337;327;b337;f327;l337;327;a337;327;y337;d327;f337;f",
  CATCHCUT: "438<b428<a438<h338<438<k328<428<a",
  CATCHWAIT: "438<h338<438<a338<c337;338<a438<d428<438<d",
  CLIFFATTACKQUICK: "238=a338=439=529=a62:=72:=62:=529=328=228=a328<539=639<63:=539<438;438<529=538:639<549=449=448<548;557935681547053515351435153514461547a14582469347:348<448<449=439>62;?63:>548;658:447:347:a23693369338<",
  CLIFFCATCH: "539=439=338=328=228=b",
  CLIFFATTACKSLOW: "238=b328<a428<a529<a529=a429=b428<529<a428<b328<227<f228=328=429=e328=238=237<f237;a236:1359135813470336a2346337;439>449>256:3469246924582457a1346234623572358337:438<",
  CLIFFESCAPEQUICK: "238=a338=439=529=62:=72:=62:=529=328=228=a428<529=63:=539<438<53:>52:?53:?54:?549<649;649<549=439=338<337;337:23583369337:337;a438<447:448;63;@a63;?649<74:<75:<549<438<2358a337:337;",
  CLIFFGETUPQUICK: "238=a338=429=539=a62:=72:=62:=529=429=228=a328<529=63:=a539<438<53:>52:?63<A73<@74<A64:=337;a337:2369235824573369337;",
  CLIFFESCAPESLOW: "238=a227<328<a428<a529<a529=429=b328=428<d328<a227<g328=429=e338=238=237<f237;a236:1359135803470336b24573368438;438<639<84;>74:<639<439=438<539<448<448;347:3469245824572458b2469347:337;338<438<",
  CLIFFGETUPSLOW: "238=a237<328<a428<b529=a429=c428<529<b428<a328<a227<f328=429=e338=238=237<b137<237<b237;a236:13591358134703470336034713472358236:337;438<",
  CLIFFJUMPQUICK: "338=539=63:=a539=a53:>63;?83<?84<@:3?C83=A63:>438;337;429=439>d339>a338=238=338=a438<a438;538;a639<b73:=a63:=73:=a63:=a62:=62:>52:>a429>429=328=338=a",
  CLIFFJUMPSLOW: "238=228=127<a026;025:a0259a034803470336b0335c0436328=d329>328=b429>328=429>429=429>53:>447:5379538:539<a549<64:=639<549=347:a337;237<338=439=429=328=",
  CLIFFWAIT: "238=z238=v",
  DAMAGEFALL: "448;a549<539<a438;a438<a439=a539=549=448<549=a448<438<337;236:337;448;548;c448;347:337:337;",
  DAMAGEFLYN: "338<438;437:5479337:a438;a538;639;f639<539<548;448;447:a548:a548;b448;a",
  DAMAGEN2: "327:337:347:a337:a347:24693469b23692358d337:337;438<b439=",
  DASH: "337;2469347:246:347:448;548;c448;447:347:c2469a347:337;348<",
  DOWNATTACK: "14351446134723582369f236:337:b337;357:c347;337;438<458<a459=a458<a448<348<448<347;337;a337:3369326923693269336923693269a327:327;438<a439=",
  DOWNBOUND: "134714350424a1435144624583469447:548;a549<649<64:=a549=a448<a448;34691458042414350424a",
  DOWNSMASH: "338=439>63;?54:>357;2658a2557a2558j2458256924693369b2269a327:337:c327:a327;g328<428<a438<a439=",
  DOWNSPECIALAIR: "338<a438<438;428;e438;428;438;438<a438;b438<a428<428;e428<a428;a428<a438<428;529=429=529=428<338=338<k",
  DOWNSPECIALGROUND: "439=438<337;337:z337:a327:337:a337;428<429=a428<327;337;337:a327:a337:a327:337:328<428<",
  DOWNSTANDB: "0424a1435a1446144724582469b346924583469337:336933682357b034713471346a2369b246:a24692458a2369337:328<429=",
  DOWNSTANDF: "0424a14352369a2458245724462458337:a327:2369a2357144713472357225822571347b2357a2358a3369337:a337;a438<a439=",
  DOWNSTANDN: "042404351446144714582458236923582369l3369a337:327:327;a428<a429=",
  DOWNTILT: "1458245823581358245833692358256935693369337:327:3269226933692369b336934692458g2358",
  DOWNWAIT: "0424l1434c042414340424z0424s14340424b",
  ESCAPEAIR: "338=439=429=438<448<438<a539<d548;538;548;448;548;g448;447:438;539=54:>64;?74;?84<?84;>64:>a539=439=438<337;a328<b227;136:1359c",
  ESCAPEB: "33692369b2269a327;347:34693468337:338<429=439=448;447:b346923582357d2358b3369327:327;",
  ESCAPEF: "337;337:a337;327:327;337;a347:a449=439>54:>448<347:346823583369a3368245723571347b2357b24583369337:",
  FALL: "338=g",
  ESCAPEN: "347;c337;b337:b3369a236923583369337:337;328<438<b429=",
  FALLAERIAL: "328=328<f",
  FALLSPECIAL: "246914592469236924692369a2469",
  FORWARDSMASH: "338<337;337:a337;b338<438<539=b63:=74:=e74:<64:=a539=449=438<b337;236:226:b23692469245823582369327:328<",
  FORWARDTILT: "347:337:a337;438<459=b449=f439=a429=a438<338<337;a338<438<439=",
  FURASLEEPEND: "1335a1346234613472357a23462357b23462357c13472357b13472357g134723583369c347:c3469347:246:b236:246:h337:337;b338<428<",
  FURAFURA: "327:b327;m328<c338<c337;n337:337;337:337;337:b337;h327;328<327;328<l327;h327:a337:f3369j3269327:337:327:e",
  FURASLEEPSTART: "439=438<338<337;a337:a23693369a337:e236923582357234613461335a1346b1335c",
  FURASLEEPLOOP: "1335z1335f13461335v13461335z1335w",
  GUARD: "438<",
  GRAB: "439=b448<439=438<448<348<347;337;b337:c3369g337:a327:327;a428<",
  GUARDON: "438<439=438<448<438<c",
  GUARDOFF: "438<c338<b328<a428<b429=428<429=",
  JAB1: "439=438<458;347;e337;d338<438<428<",
  JAB2: "337;337:357:a3469d347:a438<337;e428<a",
  KNEEBEND: "3469a2469",
  JAB3: "438<b429=439=b53:>449>b439>c54:>b53:>439>439=a459=449=b439=b459=449=a439=c449=b439=f429=d",
  JUMPAERIALB: "338=a448;347:338<528;538;639<538:539<237;538:749;74:<649;548;538;639<73:<639<538;a639;639<538;a437:538;649;a73;>62:>62;?a63;?a73;>73:=63:>53:>439>439=338<e328<a",
  JUMPAERIALF: "338=237;236:548:428<73:=438;338<428<548:648:529=62:=639;749:438;328<227;437:5479648:639<62:>a63:=73:=74:<84:;749;638:538;539<a428<a539<74:<639<b539<b438<b428<a328<328=",
  JUMPF: "237<228=a328=328<338<a337;44795479639;539=52:>539=639<649<438<438;347:447:448;548;438<a439=b449=439=338=j",
  JUMPB: "237;237<a338<338=a449=347;348<448;357:a347;449=439>53:?52:?a53:>b448<549<548;558;548;a448;438<338<b227<a328=a338=c",
  LANDING: "33693469246934683469c3369c346924692369i337:b337;438<428<",
  LANDINGATTACKAIRB: "23581346a134723571347b134623572469b34693369a337:337;338<438<",
  LANDINGATTACKAIRD: "337;438<a347;337;337:a327:337:327:327;337;338<438<c439=",
  LANDINGATTACKAIRF: "23572346134614461435a1446a1435b1446a2457337:347:337:338<438<439=a448<",
  LANDINGATTACKAIRN: "347;347:b3469347:a337:a337;a338<438<a439=",
  LANDINGATTACKAIRU: "24582457b2469337;439=549=44793468337:a337;337:2458a2469347;",
  MISSFOOT: "328<025:03590348d0448144724572458245724462457245824693469347:447:b347:a447:448;",
  NEUTRALSPECIALAIR: "338=439=429=439>439=429=439=d539<63:=62:=529=429>429=328=a429>43:?b339>b338=a439=d338=b",
  NEUTRALSPECIALGROUND: "438<a338<337;d347;c337;h428<a439=b449=448<b338<438<338<328<428<b429=428<429=",
  PASS: "337:135904481359b236:a337:a447:437:a4379447:448;d549<b448<438<a338<a338=",
  REBOUND: "337:337;k338<",
  RUN: "447:c346924692458b3469b4479a3469a24692458c2469246:a347:",
  RUNBRAKE: "347:a3469a34682458d24693469347:b347;448<439=",
  RUNTURN: "347:a3469b24693469347:b337:e336924693469347:",
  SQUAT: "337:d3369a",
  SQUATRV: "23693469347:b337:337;a338<448<",
  STOPCEIL: "84;=94;=95;=b85;=94<>649<337;",
  TECHB: "52:?337;a3469548;659<a559<448;347;337:246934692458a23572358144613472369135833685479438;438<a438;337;337:b3369d337:327:327;428<",
  TECHF: "42:?43:?42:?43:?439>439=438<a33682358a23572369236:2369245723693369236923581358a0347135823582369236:337:d337;c328<428<b",
  TECHN: "42:?439>439=338<347;a348<44:?54;@65:>74:<84;=74:=64:=63:>52:>429=327;327:3369a337:327:327;428<a",
  SQUATWAIT: "2369c34692358246933692369336923693368a33692358c336934692458b34693369e2369d336923693369c3469235833692358a2369a235833692358b23693369a2369336923582369235823692358a23692358a236924692358a246923583369235833692369246923692469b23692469b23693369346933692369a2469336934692358a236924582358",
  TECHU: "539<a63:=639<74:=a74:<73:<73:=73:<a73:=63:=53;@c53:?63;?53:?439>a339>338=b",
  THROWBACK: "338<337;a>0=<428<328<438<338<337;337:347:3469f347:3469a347:3569a357:347:347;448<338<438<b",
  THROWNFOXBACK: "437:a538;539<639<437:a",
  THROWFORWARD: "438<h337;337:a337;b337:d337;c327;337;337:337;b338<428<b",
  THROWNFOXDOWN: "337:437:3369337:33694379749:84:;84:<74:=74;>64:=549=448<94<>73:<3557649<64:=a74:=G1EB539<G0EB2369548:4479548:538;44684479b",
  THROWNFOXFORWARD: "428;327:227;226:a236:b2369246:a",
  THROWNFOXUP: "428;437:3269429=0248a",
  THROWNMARTHBACK: "136;146;146:54:>64;?a",
  THROWNMARTHDOWN: "126;026;126;137<a136;338<539<93;=83;>a",
  THROWNMARTHFORWARD: "237<137<026<036;b136;247;236:84;>a",
  THROWNMARTHUP: "136:237;226:c227;126:0348a",
  THROWNPUFFBACK: "438;437:e337:136:135914592469649;83<@;3>A;3>@:4=?:4<>a",
  THROWNPUFFFORWARD: "438;529<529=63:>f",
  THROWNPUFFUP: "539<538;539<347:337:a",
  THROWNPUFFDOWN: "437:44795479548:749;84:;f84:<b84;=84:<d84:;a859:85:;84:<c84;=c84:;849:84:;b84:<a84;=a84:<c84:;84:<a84;=84:<d84;=84:<b85:;a",
  TILTTURN: "439=338=439=a429=f",
  THROWUP: "438<328<337;b429>a429=438<438;a448;448<43:?53;@c53:?53;@a53:?53;@a429>337;438<337:c337;438<",
  UPSMASH: "438<337;a338<a337;438;548;84;=;3@D<3@D<3@C;4>@<4>@a;4>@:4=@83<@73;?63:>539=439=a438<428;337:b337;337:b337;a338<438<a439=438<439=a",
  UPTILT: "338<347:2458347:a458;53;A52;A52;@52:?52:>429>429=439=b438;347;a337;a328<a",
  UPSPECIALCHARGE: "338=539<549<438<a439=d539=a439=d539=439=539=529=429=a529=429=g529=429=a529=a539=a438<337;4479a",
  UPSPECIALLAUNCH: "328=228=238=228=328=238=228=238=228=238=228=238=329>228=338=228=a238=328=329>228>238=338=a328=228=d45682469226:236924571447033602470248b12471347033613471358236:1359a2469",
  WALK: "448<a338<438<a338<c438<a448<b438<e338<a438<a448<a",
  WALLDAMAGE: "438;338=338<a337;d347;a448<f549=h64:=63:>539<447:5479548:437:337:337;428<528;639<538;438;",
  WALLJUMP: "338<h438<337;338<438<337;438;e448;438;a448;438;447:539<639<62:>a52:>62:=639;43795379427:226:327;448<338=",
  WALLTECH: "337:236:b237;b337;237;337;237;337;c438;a538;b539<a539=429=328=338=",
  WAIT: "439=z439=f438<439=z439=e438<439=q438<a439=a438<e439=a438<449=448<438<449=a439=n",
  SIDESPECIALAIR: "228=227<237<237;f236:237;d236:226:236:2469e649;a648:c649;e548;c549<d548;b549<a74:<649;749;548:4479447:347:639;649<549<448;246:",
  SIDESPECIALGROUND: "439>338=347;236:a337:236:b337:236:c337:a2369a236:347:3469246934692469a3469a347:z3469246924582357a2369337:327;428<",
  DEADUP: "N0?0a",
  DEADDOWN: "N0?0a",
  DEADLEFT: "N0?0a",
  DEADRIGHT: "N0?0a",
  ENTRANCE: "439=z439=f438<439=z439=e438<439=q438<a439=a438<e439=a438<449=448<438<449=a439=n",
  SLEEP: "0000",
  REBIRTH: "439=z439=f438<439=z439=e438<439=q438<a439=a438<e439=a438<449=448<438<449=a439=n",
  REBIRTHWAIT: "439=z439=f438<439=z439=e438<439=q438<a439=a438<e439=a438<449=448<438<449=a439=n",
  LANDINGFALLSPECIAL: "33693469246934683469c3369c346924692369i337:b337;438<428<",
  SMASHTURN: "439=338=439=a429=f",
  SHIELDBREAKFALL: "448;a549<539<a438;a438<a439=a539=549=448<549=a448<438<337;236:337;448;548;c448;347:337:337;",
  SHIELDBREAKDOWNBOUND: "134714350424a1435144624583469447:548;a549<649<64:=a549=a448<a448;34691458042414350424a",
  SHIELDBREAKSTAND: "042404351446144714582458236923582369l3369a337:327:327;a428<a429=",
  WALLTECHJUMP: "338<h438<337;338<438<337;438;e448;438;a448;438;447:539<639<62:>a52:>62:=639;43795379427:226:327;448<338=",
  FIREFOXBOUNCE: "13591258235703360259043613460247033503360236033504361458",
  DOWNDAMAGE: "14340435b04360447043604470336a13461435a",
  OTTOTTO: "449=448<348<247;a146;146:246:a2469347;357;",
  OTTOTTOWAIT: "256:a357:c347:k3469347:a347;b448<b449=h348=b449=358=348=c348<i347;b337;f338<e337;b236:23692469c246:c256:a246:347:b357;b347;348<b358<a357;358<357;f357:a",
  THROWDOWN: "337:2269c337:337;439=438<b338<438<337;438<84;=;4>@=3@B>3AC?3BDb@2BDA2CEaA2DFaB3EGA3DFB3EGC3EGB2EGC3EGD2GIB3EG?3BE93=A438<337:a327;a328<",
  THROWNFALCOBACK: "438;437:538;539<a337:",
  THROWNFALCODOWN: "43793369b638:84:;84:<74:=64:=448;74:<72:<557964:=a63:=539<438;43793469548:447:44793469",
  THROWNFALCOFORWARD: "327;a226:a136:a1359246:",
  APPEAL: "449=439=438<b338<b337;e337:b347:z347:k347;347:347;l347:a347;a347:347;347:347;347:a347;e337;347;b338<a438<b439=m",
  THROWNFALCOUP: "438;437:3369227<0235",
  THROWNFALCONBACK: "136;a136:a126:126;126:236:136:a1259235812473357c23572358",
  THROWNFALCONDOWN: "136;237;327;237;1359236:648:74:<72<@73;?83<@a83=A93=@83<@",
  THROWNFALCONFORWARD: "025:d126:a025:026;0259134723573368a2357b",
  THROWNFALCONUP: "227;b126:025:b035:136:0359025:c",
}));
ecb[CHARIDS.FOX_ID].DEADUP = [[0, 0, 0, 0]];
ecb[CHARIDS.FOX_ID].DEADDOWN = [[0, 0, 0, 0]];
ecb[CHARIDS.FOX_ID].DEADLEFT = [[0, 0, 0, 0]];
ecb[CHARIDS.FOX_ID].DEADRIGHT = [[0, 0, 0, 0]];
ecb[CHARIDS.FOX_ID].ENTRANCE = ecb[CHARIDS.FOX_ID].WAIT;
ecb[CHARIDS.FOX_ID].SLEEP = [[0, 0, 0, 0]];
ecb[CHARIDS.FOX_ID].REBIRTH = ecb[CHARIDS.FOX_ID].WAIT;
ecb[CHARIDS.FOX_ID].REBIRTHWAIT = ecb[CHARIDS.FOX_ID].WAIT;
ecb[CHARIDS.FOX_ID].LANDINGFALLSPECIAL = ecb[CHARIDS.FOX_ID].LANDING;
ecb[CHARIDS.FOX_ID].SHIELDBREAKFALL = ecb[CHARIDS.FOX_ID].DAMAGEFALL;
ecb[CHARIDS.FOX_ID].SHIELDBREAKDOWNBOUND = ecb[CHARIDS.FOX_ID].DOWNBOUND;
ecb[CHARIDS.FOX_ID].SHIELDBREAKSTAND = ecb[CHARIDS.FOX_ID].DOWNSTANDN;
ecb[CHARIDS.FOX_ID].TECHWALLJUMP = ecb[CHARIDS.FOX_ID].WALLJUMP;
ecb[CHARIDS.FOX_ID].THROWNFALCONDIVE = ecb[CHARIDS.FOX_ID].DAMAGEFLYN;
