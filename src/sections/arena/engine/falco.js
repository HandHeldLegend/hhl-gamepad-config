/**
 * falco.js: template character data and action states (meleelight's Falco (Quill)): attributes, hitboxes, frame counts, ECB data and the character's own moves.
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
import { CHARIDS, activeStage, charObject, characterSelections, decodeEcb, ecb, framesData, offsets, player, setCharAttributes, setChars, setEcbData, setFrames, setHitBoxes, setIntangibility, setOffsets } from './ml.js';
import { S } from './shared.js';
import { actionStates, airDrift, checkForDash, checkForDoubleJump, checkForIASA, checkForJump, checkForSmashTurn, checkForSmashes, checkForSpecials, checkForTiltTurn, checkForTilts, fastfall, reduceByTraction, setupActionStates, tiltTurnDashBuffer, turnOffHitboxes } from './shortcuts.js';
import { Vec2D, createHitbox, createHitboxObject } from './util.js';

// ---- attributes, hitboxes, frame counts, hitbox offsets ----
setCharAttributes(CHARIDS.FALCO_ID, {
  dashFrameMin: 11,
  dashFrameMax: 21,
  dInitV: 1.82,
  dMaxV: 1.5,
  dAccA: 0.1,
  dAccB: 0.02,
  dTInitV: 1.9,
  traction: 0.08,
  maxWalk: 1.4,
  jumpSquat: 5,
  sHopInitV: 1.9,
  fHopInitV: 4.1,
  gravity: 0.17,
  groundToAir: 1,
  jumpHmaxV: 1.7,
  jumpHinitV: 0.7,
  airMobA: 0.05,
  airMobB: 0.02,
  aerialHmaxV: 0.83,
  airFriction: 0.02,
  fastFallV: 3.5,
  terminalV: 3.1,
  walkInitV: 0.2,
  walkAcc: 0.1,
  walkMaxV: 1.4,
  djMultiplier: 0.94,
  djMomentum: 0.94,
  shieldScale: 12.5,
  modelScale: 1.1,
  weight: 80,
  waitAnimSpeed: 1,
  walljump: true,
  hurtboxOffset: [4, 18],
  ledgeSnapBoxOffset: [14, 8, 18],
  shieldOffset: [10, 40],
  charScale: 0.47,
  miniScale: 0.3,
  runTurnBreakPoint: 9,
  airdodgeIntangible: 26,
  wallJumpVelX: 1.3,
  wallJumpVelY: 3.6,
  shieldBreakVel: 3.3,
  multiJump: false,
  ecbScale: 1,
  walkAnimSpeed: 1.5,
  runAnimSpeed: 0.7
});
setIntangibility(CHARIDS.FALCO_ID, {
  "ESCAPEAIR": [4, 26],
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
setFrames(CHARIDS.FALCO_ID, {
  "WAIT": 241,
  "DASH": 21,
  "RUN": 20,
  "RUNBRAKE": 18,
  "RUNTURN": 20,
  "WALK": 31,
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
  "DOWNWAIT": 69,
  "DOWNSTANDN": 30,
  "DOWNSTANDB": 35,
  "DOWNSTANDF": 35,
  "TECHN": 26,
  "TECHB": 40,
  "TECHF": 40,
  "SHIELDBREAKFALL": 30,
  "SHIELDBREAKDOWNBOUND": 26,
  "SHIELDBREAKSTAND": 30,
  "FURAFURA": 109,
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
  "THROWNMARTHFORWARD": 11,
  "THROWNMARTHDOWN": 11,
  "THROWNPUFFUP": 6,
  "THROWNPUFFBACK": 19,
  "THROWNPUFFFORWARD": 9,
  "THROWNPUFFDOWN": 60,
  "THROWNFOXUP": 6,
  "THROWNFOXBACK": 7,
  "THROWNFOXFORWARD": 10,
  "THROWNFOXDOWN": 32,
  "THROWNFALCOUP": 5,
  "THROWNFALCOBACK": 7,
  "THROWNFALCOFORWARD": 8,
  "THROWNFALCODOWN": 26,
  "THROWNFALCONUP": 14,
  "THROWNFALCONBACK": 19,
  "THROWNFALCONFORWARD": 17,
  "THROWNFALCONDOWN": 14,
  "FURASLEEPSTART": 30,
  "FURASLEEPLOOP": 110,
  "FURASLEEPEND": 60,
  "STOPCEIL": 9,
  "TECHU": 26,
  "REBOUND": 15
});
setOffsets(CHARIDS.FALCO_ID, {
  jab1: {
    id0: [new Vec2D(5.75, 6.96), new Vec2D(17.80, 9.37)],
    id1: [new Vec2D(7.48, 10.45), new Vec2D(10.31, 8.90)]
  },
  jab2: {
    id0: [new Vec2D(10.56, 8.06), new Vec2D(9.43, 8.10)],
    id1: [new Vec2D(2.95, 7.01), new Vec2D(3.00, 7.12)]
  },
  jab3_1: {
    id0: [new Vec2D(2.43, 11.87), new Vec2D(2.34, 11.57)],
    id1: [new Vec2D(5.72, 13.87), new Vec2D(5.50, 13.34)],
    id2: [new Vec2D(11.36, 17.30), new Vec2D(10.92, 16.35)]
  },
  jab3_2: {
    id0: [new Vec2D(2.64, 11.09), new Vec2D(2.51, 10.80)],
    id1: [new Vec2D(6.30, 12.31), new Vec2D(5.97, 11.87)],
    id2: [new Vec2D(12.55, 14.41), new Vec2D(11.89, 13.69)]
  },
  jab3_3: {
    id0: [new Vec2D(2.19, 9.64), new Vec2D(2.18, 9.48)],
    id1: [new Vec2D(6.05, 9.74), new Vec2D(5.95, 9.44)],
    id2: [new Vec2D(12.65, 9.91), new Vec2D(12.41, 9.37)]
  },
  jab3_4: {
    id0: [new Vec2D(2.67, 8.81), new Vec2D(2.51, 8.70)],
    id1: [new Vec2D(6.16, 7.98), new Vec2D(5.80, 7.81)],
    id2: [new Vec2D(12.12, 6.57), new Vec2D(11.42, 6.27)]
  },
  jab3_5: {
    id0: [new Vec2D(2.37, 7.65), new Vec2D(2.33, 7.71)],
    id1: [new Vec2D(5.49, 6.57), new Vec2D(5.24, 6.43)],
    id2: [new Vec2D(10.82, 4.73), new Vec2D(10.22, 4.25)]
  },
  downtilt: {
    id0: [new Vec2D(2.35, 3.55), new Vec2D(3.75, 3.65), new Vec2D(1.64, 3.77)],
    id1: [new Vec2D(5.73, 3.15), new Vec2D(8.63, 3.43), new Vec2D(5.17, 3.53)],
    id2: [new Vec2D(9.12, 2.76), new Vec2D(13.51, 3.21), new Vec2D(8.70, 3.30)]
  },
  uptilt: {
    id0: [new Vec2D(0.53, 9.39), new Vec2D(0.48, 10.72), new Vec2D(1.18, 11.71), new Vec2D(2.04, 11.80), new Vec2D(2.05, 11.70), new Vec2D(1.79, 11.71), new Vec2D(1.54, 11.68)],
    id1: [new Vec2D(-4.40, 5.42), new Vec2D(-6.56, 12.34), new Vec2D(-2.13, 18.63), new Vec2D(5.09, 18.52), new Vec2D(5.26, 17.63), new Vec2D(4.49, 16.83), new Vec2D(3.49, 16.29)]
  },
  forwardtilt: {
    id0: [new Vec2D(1.60, 6.04), new Vec2D(19.00, 9.89), new Vec2D(19.23, 9.98), new Vec2D(19.10, 10.10), new Vec2D(18.70, 10.20)],
    id1: [new Vec2D(4.97, 8.10), new Vec2D(12.68, 9.91), new Vec2D(12.80, 10.02), new Vec2D(12.59, 10.09), new Vec2D(12.14, 10.12)],
    id2: [new Vec2D(3.62, 8.80), new Vec2D(7.97, 9.90), new Vec2D(8.04, 10.02), new Vec2D(7.79, 10.06), new Vec2D(7.32, 10.05)]
  },
  dashattack1: {
    id0: [new Vec2D(6.15, 8.58), new Vec2D(5.86, 8.66), new Vec2D(5.56, 8.67), new Vec2D(5.61, 8.62)]
  },
  dashattack2: {
    id0: [new Vec2D(5.67, 8.55), new Vec2D(5.75, 8.46), new Vec2D(5.82, 8.36), new Vec2D(5.9, 8.24), new Vec2D(5.98, 8.12), new Vec2D(6.06, 7.99), new Vec2D(6.14, 7.86), new Vec2D(6.21, 7.75), new Vec2D(6.29, 7.58), new Vec2D(6.4, 7.25)]
  },
  grab: {
    id0: [new Vec2D(9.45, 7.73), new Vec2D(9.45, 7.73)],
    id1: [new Vec2D(5.16, 7.73), new Vec2D(5.16, 7.73)]
  },
  downspecialground: {
    id0: [new Vec2D(-0.69, 7.79)]
  },
  downspecialair: {
    id0: [new Vec2D(0.04, 8.7)]
  },
  reflector: {
    id0: [new Vec2D(-0.60, 6.80)]
  },
  downattack1: {
    id0: [new Vec2D(15.90, 7.40), new Vec2D(16.18, 7.27), new Vec2D(16.12, 7.69)],
    id1: [new Vec2D(8.79, 7.24), new Vec2D(8.83, 7.13), new Vec2D(8.82, 7.31)],
    id2: [new Vec2D(4.51, 6.62), new Vec2D(4.51, 6.62), new Vec2D(4.51, 6.62)]
  },
  downattack2: {
    id0: [new Vec2D(-6.31, 8.88), new Vec2D(-8.64, 9.81), new Vec2D(-8.46, 9.83)],
    id1: [new Vec2D(-9.51, 9.41), new Vec2D(-13.00, 9.82), new Vec2D(-12.68, 9.86)],
    id2: [new Vec2D(-1.31, 9.72), new Vec2D(-2.07, 10.35), new Vec2D(-2.07, 10.35)]
  },
  ledgegetupquick: {
    id0: [new Vec2D(6.03, 7.72), new Vec2D(6.14, 6.63), new Vec2D(6.37, 6.31), new Vec2D(6.52, 6.50), new Vec2D(6.69, 5.74), new Vec2D(6.84, 4.04), new Vec2D(6.98, 2.91), new Vec2D(7.11, 2.48), new Vec2D(7.24, 2.36), new Vec2D(7.38, 2.26)],
    id1: [new Vec2D(5.94, 6.37), new Vec2D(5.87, 5.07), new Vec2D(6.27, 4.37), new Vec2D(6.59, 4.44), new Vec2D(6.73, 5.19), new Vec2D(6.85, 5.45), new Vec2D(6.98, 4.75), new Vec2D(7.12, 3.52), new Vec2D(6.79, 2.58), new Vec2D(5.91, 1.71)],
    id2: [new Vec2D(-5.29, 8.60), new Vec2D(-5.06, 8.56), new Vec2D(-5.1, 7.98), new Vec2D(-5.15, 6.89), new Vec2D(-5.16, 5.73), new Vec2D(-5.13, 4.20), new Vec2D(-5.2, 3.34), new Vec2D(-5.02, 3.33), new Vec2D(-4.88, 2.95), new Vec2D(-4.74, 2.69)]
  },
  ledgegetupslow: {
    id0: [new Vec2D(6.96, 11.47), new Vec2D(8.75, 3.34), new Vec2D(7.9, 2.26)],
    id1: [new Vec2D(9.86, 14.52), new Vec2D(12.99, 1.47), new Vec2D(11.44, 0.98)],
    id2: [new Vec2D(-0.15, 10.52), new Vec2D(0.67, 9.03), new Vec2D(1.81, 7.51)]
  },
  downsmash: {
    id0: [new Vec2D(-9.91, 1.66), new Vec2D(-9.61, 1.58), new Vec2D(-8.92, 1.52), new Vec2D(-8.21, 1.49), new Vec2D(-7.79, 1.46)],
    id1: [new Vec2D(10.43, 2.11), new Vec2D(10.15, 1.88), new Vec2D(9.47, 1.72), new Vec2D(8.76, 1.61), new Vec2D(8.34, 1.54)],
    id2: [new Vec2D(-5.33, 1.67), new Vec2D(-5.18, 1.63), new Vec2D(-4.84, 1.60), new Vec2D(-4.48, 1.59), new Vec2D(-4.28, 1.58)],
    id3: [new Vec2D(5.86, 1.91), new Vec2D(5.72, 1.80), new Vec2D(5.38, 1.72), new Vec2D(5.03, 1.67), new Vec2D(4.82, 1.63)]
  },
  upsmash1: {
    id0: [new Vec2D(6.94, 7.55), new Vec2D(8.22, 10.84), new Vec2D(8.01, 14.25), new Vec2D(6.50, 18.17)],
    id1: [new Vec2D(6.48, 5.16), new Vec2D(10.52, 9.71), new Vec2D(10.57, 14.34), new Vec2D(8.99, 18.74)]
  },
  upsmash2: {
    id0: [new Vec2D(4.92, 20.33), new Vec2D(2.21, 22.04), new Vec2D(-0.79, 22.37), new Vec2D(-3.88, 20.14), new Vec2D(-4.99, 18.13)],
    id1: [new Vec2D(6.42, 22.40), new Vec2D(2.53, 24.58), new Vec2D(-1.83, 24.70), new Vec2D(-5.92, 21.68), new Vec2D(-7.47, 18.75)]
  },
  forwardsmash1: {
    id0: [new Vec2D(11.36, 15.93), new Vec2D(13.9, 13.95), new Vec2D(15.35, 11.31), new Vec2D(15.57, 8.85), new Vec2D(15.19, 7.36)],
    id1: [new Vec2D(9, 11.83), new Vec2D(10.16, 10.89), new Vec2D(10.55, 9.74), new Vec2D(10.39, 8.67), new Vec2D(9.95, 8.01)],
    id2: [new Vec2D(7.47, 9.03), new Vec2D(7.17, 9.01), new Vec2D(6.81, 8.97), new Vec2D(6.39, 8.91), new Vec2D(5.91, 8.85)]
  },
  forwardsmash2: {
    id0: [new Vec2D(14.69, 6.71), new Vec2D(14.09, 6.30), new Vec2D(13.4, 5.96), new Vec2D(12.57, 5.51), new Vec2D(11.49, 4.70)],
    id1: [new Vec2D(9.42, 7.71), new Vec2D(8.82, 7.51), new Vec2D(8.14, 7.33), new Vec2D(7.38, 7.11), new Vec2D(6.55, 6.92)],
    id2: [new Vec2D(5.37, 8.77), new Vec2D(4.76, 8.67), new Vec2D(4.08, 8.56), new Vec2D(3.33, 8.44), new Vec2D(2.51, 8.30)]
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
    id1: [new Vec2D(-9.22, 10.99), new Vec2D(-9.22, 10.96), new Vec2D(-9.24, 10.89), new Vec2D(-9.25, 10.81)],
    id2: [new Vec2D(3.06, 4.81), new Vec2D(3.21, 4.77), new Vec2D(3.30, 4.78), new Vec2D(3.36, 4.80)]
  },
  bair2: {
    id0: [],
    id1: [new Vec2D(-9.06, 10.76), new Vec2D(-8.83, 10.58), new Vec2D(-8.56, 10.42), new Vec2D(-8.26, 10.27), new Vec2D(-7.97, 10.13), new Vec2D(-7.69, 9.99), new Vec2D(-7.42, 9.86), new Vec2D(-7.15, 9.71), new Vec2D(-6.90, 9.56), new Vec2D(-6.63, 9.38), new Vec2D(-6.36, 9.17), new Vec2D(-6.05, 8.94)],
    id2: [new Vec2D(3.41, 4.82), new Vec2D(3.44, 4.82), new Vec2D(3.45, 4.81), new Vec2D(3.43, 4.77), new Vec2D(3.43, 4.77), new Vec2D(3.43, 4.77), new Vec2D(3.42, 4.76), new Vec2D(3.38, 4.72), new Vec2D(3.31, 4.66), new Vec2D(3.25, 4.61), new Vec2D(3.19, 4.57), new Vec2D(3.12, 4.53)]
  },
  fair1: {
    id0: [new Vec2D(3.01, 10.01), new Vec2D(5.07, 9.82), new Vec2D(5.13, 9.71)],
    id1: [new Vec2D(7.43, 12.25), new Vec2D(9.88, 11.27), new Vec2D(9.03, 10.34)]
  },
  fair2: {
    id0: [new Vec2D(5.15, 8.40), new Vec2D(3.26, 7.74), new Vec2D(0.82, 7.14)],
    id1: [new Vec2D(10.19, 7.93), new Vec2D(8.14, 8.23), new Vec2D(3.96, 7.08)]
  },
  fair3: {
    id0: [new Vec2D(3.09, 10.19), new Vec2D(5.03, 9.52), new Vec2D(5.14, 9.66)],
    id1: [new Vec2D(7.79, 12.17), new Vec2D(9.86, 10.63), new Vec2D(8.89, 10.14)]
  },
  fair4: {
    id0: [new Vec2D(5.16, 8.69), new Vec2D(5.15, 8.39), new Vec2D(3.63, 8.07)],
    id1: [new Vec2D(5.72, 8.37), new Vec2D(10.10, 7.85), new Vec2D(8.62, 8.65)]
  },
  fair5: {
    id0: [new Vec2D(5.17, 8.84), new Vec2D(5.16, 8.75), new Vec2D(4.98, 8.60)],
    id1: [new Vec2D(9.35, 8.84), new Vec2D(9.20, 8.56), new Vec2D(8.94, 8.29)]
  },
  dair1: {
    id0: [new Vec2D(2.08, 6.92), new Vec2D(2.30, 7.04), new Vec2D(1.94, 6.82), new Vec2D(1.25, 6.41), new Vec2D(0.74, 6.11), new Vec2D(0.77, 6.13), new Vec2D(1.30, 6.43), new Vec2D(1.96, 6.81), new Vec2D(2.31, 7.01), new Vec2D(2.14, 6.92)],
    id1: [new Vec2D(3.11, 4.52), new Vec2D(3.35, 4.64), new Vec2D(3.17, 4.53), new Vec2D(2.72, 4.27), new Vec2D(2.33, 4.04), new Vec2D(2.28, 4.01), new Vec2D(2.59, 4.18), new Vec2D(3.03, 4.43), new Vec2D(3.30, 4.59), new Vec2D(3.25, 4.56)]
  },
  dair2: {
    id0: [new Vec2D(1.61, 6.61), new Vec2D(1.03, 6.28), new Vec2D(0.70, 6.08), new Vec2D(0.72, 6.10), new Vec2D(1.04, 6.29), new Vec2D(1.48, 6.54), new Vec2D(1.89, 6.79), new Vec2D(2.19, 6.97), new Vec2D(2.32, 7.04), new Vec2D(2.28, 7.02)],
    id1: [new Vec2D(2.94, 4.38), new Vec2D(2.55, 4.16), new Vec2D(2.29, 4.01), new Vec2D(2.25, 3.99), new Vec2D(2.42, 4.09), new Vec2D(2.69, 4.25), new Vec2D(2.98, 4.42), new Vec2D(3.22, 4.56), new Vec2D(3.35, 4.64), new Vec2D(3.36, 4.65)]
  },
  upair1: {
    id0: [new Vec2D(-1.42, 11.45), new Vec2D(0.19, 12.82)],
    id1: [new Vec2D(-2.09, 12.82), new Vec2D(0.32, 14.52)],
    id2: [new Vec2D(-0.02, 9.81), new Vec2D(0.38, 10.15)]
  },
  upair2: {
    id0: [new Vec2D(-1.41, 14.05), new Vec2D(-0.35, 15.11), new Vec2D(0.33, 14.98), new Vec2D(0.59, 14.30)],
    id1: [new Vec2D(-1.20, 16.43), new Vec2D(0.79, 17.95), new Vec2D(2.03, 17.09), new Vec2D(2.48, 15.00)],
    id2: [new Vec2D(0.70, 10.19), new Vec2D(0.76, 10.41), new Vec2D(0.74, 10.42), new Vec2D(0.67, 10.34)]
  },
  upspecial: {
    id0: []
  },
  pummel: {
    id0: [new Vec2D(7.87, 8.50)]
  },
  throwforwardextra: {
    id0: [new Vec2D(8.94, 8.89)]
  },
  thrown: {
    id0: [new Vec2D(0, 12)]
  }
});
for (let k = 0; k < 22; k++) {
  offsets[CHARIDS.FALCO_ID].upspecial.id0.push(new Vec2D(1.35, 12.39));
}
for (let k = 0; k < 4; k++) {
  offsets[CHARIDS.FALCO_ID].nair1.id0.push(new Vec2D(-1.10, 7.48));
  offsets[CHARIDS.FALCO_ID].nair1.id1.push(new Vec2D(6.57, 7.22));
  offsets[CHARIDS.FALCO_ID].nair1.id2.push(new Vec2D(0.57, 4.49));
}
for (let k = 0; k < 23; k++) {
  offsets[CHARIDS.FALCO_ID].nair2.id0.push(new Vec2D(-1.10, 7.48));
  offsets[CHARIDS.FALCO_ID].nair2.id1.push(new Vec2D(6.57, 7.22));
  offsets[CHARIDS.FALCO_ID].nair2.id2.push(new Vec2D(0.57, 4.49));
}
offsets[CHARIDS.FALCO_ID].nair2.id0.push(new Vec2D(-1.05, 7.56));
offsets[CHARIDS.FALCO_ID].nair2.id1.push(new Vec2D(6.30, 7.53));
offsets[CHARIDS.FALCO_ID].nair2.id2.push(new Vec2D(0.48, 4.59));
for (let k = 0; k < 4; k++) {
  offsets[CHARIDS.FALCO_ID].bair1.id0.push(new Vec2D(-0.14, 9.14));
}
for (let k = 0; k < 12; k++) {
  offsets[CHARIDS.FALCO_ID].bair2.id0.push(new Vec2D(-0.14, 9.14));
}
setHitBoxes(CHARIDS.FALCO_ID, {
  fair1: new createHitboxObject(new createHitbox(offsets[3].fair1.id0, 5.156, 9, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[3].fair1.id1, 5.156, 9, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair2: new createHitboxObject(new createHitbox(offsets[3].fair2.id0, 4.656, 8, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[3].fair2.id1, 4.656, 8, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair3: new createHitboxObject(new createHitbox(offsets[3].fair3.id0, 4.656, 7, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[3].fair3.id1, 4.656, 7, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair4: new createHitboxObject(new createHitbox(offsets[3].fair4.id0, 4.656, 5, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[3].fair4.id1, 4.656, 5, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair5: new createHitboxObject(new createHitbox(offsets[3].fair5.id0, 4.656, 3, 361, 100, 50, 0, 0, 0, 1, 1), new createHitbox(offsets[3].fair5.id1, 4.656, 3, 361, 100, 50, 0, 0, 0, 1, 1)),
  bair1: new createHitboxObject(new createHitbox(offsets[3].bair1.id0, 3.660, 15, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[3].bair1.id1, 4.992, 15, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[3].bair1.id2, 3.328, 9, 361, 100, 0, 0, 0, 0, 1, 1)),
  bair2: new createHitboxObject(new createHitbox(offsets[3].bair2.id0, 3.328, 9, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[3].bair2.id1, 3.992, 9, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[3].bair2.id2, 3.328, 9, 361, 100, 0, 0, 0, 0, 1, 1)),
  nair1: new createHitboxObject(new createHitbox(offsets[3].nair1.id0, 3.496, 12, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[3].nair1.id1, 3.496, 12, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[3].nair1.id1, 2.992, 12, 361, 100, 10, 0, 0, 0, 1, 1)),
  nair2: new createHitboxObject(new createHitbox(offsets[3].nair2.id0, 3.496, 9, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[3].nair2.id1, 3.496, 9, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[3].nair2.id1, 2.992, 9, 361, 100, 0, 0, 0, 0, 1, 1)),
  dair1: new createHitboxObject(new createHitbox(offsets[3].dair1.id0, 5.156, 12, 290, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[3].dair1.id1, 5.988, 12, 290, 100, 10, 0, 0, 0, 1, 1)),
  dair2: new createHitboxObject(new createHitbox(offsets[3].dair2.id0, 5.156, 9, 290, 100, 20, 0, 0, 0, 1, 1), new createHitbox(offsets[3].dair2.id1, 5.988, 9, 290, 100, 20, 0, 0, 0, 1, 1)),
  upair1: new createHitboxObject(new createHitbox(offsets[3].upair1.id0, 3.125, 6, 90, 20, 40, 0, 0, 0, 1, 1), new createHitbox(offsets[3].upair1.id1, 3.906, 6, 90, 20, 30, 0, 0, 0, 1, 1), new createHitbox(offsets[3].upair1.id2, 3.906, 6, 9, 20, 30, 0, 0, 0, 1, 1)),
  upair2: new createHitboxObject(new createHitbox(offsets[3].upair2.id0, 3.660, 10, 70, 120, 22, 0, 0, 0, 1, 1), new createHitbox(offsets[3].upair2.id1, 5.468, 10, 70, 120, 22, 0, 0, 0, 1, 1), new createHitbox(offsets[3].upair2.id2, 3.906, 10, 90, 20, 30, 0, 0, 0, 1, 1)),
  upspecial: new createHitboxObject(new createHitbox(offsets[3].upspecial.id0, 4.000, 16, 80, 60, 80, 0, 3, 0, 1, 1)),
  dtilt: new createHitboxObject(new createHitbox(offsets[3].downtilt.id0, 1.953, 13, 75, 125, 25, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downtilt.id1, 2.930, 13, 75, 125, 25, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downtilt.id2, 3.125, 13, 75, 125, 25, 0, 0, 1, 1, 1)),
  uptilt: new createHitboxObject(new createHitbox(offsets[3].uptilt.id0, 3.906, 9, 97, 120, 30, 0, 0, 1, 1, 1), new createHitbox(offsets[3].uptilt.id1, 5.468, 9, 90, 120, 30, 0, 0, 1, 1, 1)),
  ftilt: new createHitboxObject(new createHitbox(offsets[3].forwardtilt.id0, 2.734, 9, 361, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[3].forwardtilt.id1, 3.125, 9, 361, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[3].forwardtilt.id2, 2.344, 9, 361, 100, 0, 0, 0, 1, 1, 1)),
  dashattack1: new createHitboxObject(new createHitbox(offsets[3].dashattack1.id0, 4.297, 9, 72, 90, 35, 0, 0, 1, 1, 1)),
  dashattack2: new createHitboxObject(new createHitbox(offsets[3].dashattack2.id0, 3.515, 6, 72, 90, 20, 0, 0, 1, 1, 1)),
  jab1: new createHitboxObject(new createHitbox(offsets[3].jab1.id0, 3.515, 4, 70, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab1.id1, 3.515, 4, 70, 100, 0, 0, 0, 1, 1, 1)),
  jab2: new createHitboxObject(new createHitbox(offsets[3].jab2.id0, 3.515, 4, 50, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab2.id1, 3.515, 4, 50, 100, 0, 0, 0, 1, 1, 1)),
  jab3_1: new createHitboxObject(new createHitbox(offsets[3].jab3_1.id0, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_1.id1, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_1.id2, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1)),
  jab3_2: new createHitboxObject(new createHitbox(offsets[3].jab3_2.id0, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_2.id1, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_2.id2, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1)),
  jab3_3: new createHitboxObject(new createHitbox(offsets[3].jab3_3.id0, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_3.id1, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_3.id2, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1)),
  jab3_4: new createHitboxObject(new createHitbox(offsets[3].jab3_4.id0, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_4.id1, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_4.id2, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1)),
  jab3_5: new createHitboxObject(new createHitbox(offsets[3].jab3_5.id0, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_5.id1, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].jab3_5.id2, 3.515, 1, 80, 80, 10, 0, 0, 1, 1, 1)),
  fsmash1: new createHitboxObject(new createHitbox(offsets[3].forwardsmash1.id0, 3.515, 17, 361, 90, 40, 0, 0, 1, 1, 1), new createHitbox(offsets[3].forwardsmash1.id1, 3.125, 17, 361, 90, 40, 0, 0, 1, 1, 1), new createHitbox(offsets[3].forwardsmash1.id2, 2.344, 17, 110, 90, 40, 0, 0, 1, 1, 1)),
  fsmash2: new createHitboxObject(new createHitbox(offsets[3].forwardsmash2.id0, 3.515, 14, 361, 105, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].forwardsmash2.id1, 3.125, 14, 361, 105, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].forwardsmash2.id2, 2.344, 14, 361, 105, 10, 0, 0, 1, 1, 1)),
  upsmash1: new createHitboxObject(new createHitbox(offsets[3].upsmash1.id0, 3.328, 14, 95, 100, 25, 0, 0, 1, 1, 1), new createHitbox(offsets[3].upsmash1.id1, 4.656, 14, 95, 100, 25, 0, 0, 1, 1, 1)),
  upsmash2: new createHitboxObject(new createHitbox(offsets[3].upsmash2.id0, 3.328, 12, 361, 100, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[3].upsmash2.id1, 3.828, 12, 361, 100, 10, 0, 0, 1, 1, 1)),
  dsmash: new createHitboxObject(new createHitbox(offsets[3].downsmash.id0, 4.687, 16, 25, 70, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downsmash.id1, 4.687, 16, 25, 70, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downsmash.id2, 3.515, 13, 80, 70, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downsmash.id3, 3.515, 13, 80, 70, 20, 0, 0, 1, 1, 1)),
  grab: new createHitboxObject(new createHitbox(offsets[3].grab.id0, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1), new createHitbox(offsets[3].grab.id1, 2.734, 0, 361, 100, 0, 0, 2, 3, 1, 1)),
  downattack1: new createHitboxObject(new createHitbox(offsets[3].downattack1.id0, 7.031, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downattack1.id1, 3.906, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downattack1.id2, 3.906, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  downattack2: new createHitboxObject(new createHitbox(offsets[3].downattack2.id0, 4.687, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downattack2.id1, 6.250, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[3].downattack2.id2, 6.250, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  downspecial: new createHitboxObject(new createHitbox(offsets[3].downspecialair.id0, 5.999, 8, 84, 50, 110, 0, 4, 0, 1, 1)),
  reflector: new createHitboxObject(new createHitbox(offsets[3].reflector.id0, 7.999, 0, 361, 100, 0, 0, 7, 0, 1, 1)),
  ledgegetupquick: new createHitboxObject(new createHitbox(offsets[3].ledgegetupquick.id0, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[3].ledgegetupquick.id1, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[3].ledgegetupquick.id2, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1)),
  ledgegetupslow: new createHitboxObject(new createHitbox(offsets[3].ledgegetupslow.id0, 3.125, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[3].ledgegetupslow.id1, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[3].ledgegetupslow.id2, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1)),
  pummel: new createHitboxObject(new createHitbox(offsets[3].pummel.id0, 5.859, 3, 80, 100, 0, 30, 0, 0, 1, 1)),
  throwup: new createHitboxObject(new createHitbox(new Vec2D(2.855, 21.03), 0, 2, 90, 110, 75, 0, 0, 0, 1, 1)),
  throwdown: new createHitboxObject(new createHitbox(new Vec2D(0.57363, 0), 0, 1, 270, 40, 150, 0, 0, 0, 1, 1)),
  throwback: new createHitboxObject(new createHitbox(new Vec2D(-7.46, 4.66), 0, 2, 124, 85, 80, 0, 0, 0, 1, 1)),
  throwforward: new createHitboxObject(new createHitbox(new Vec2D(16.92, 1.31), 0, 3, 45, 135, 35, 0, 0, 0, 1, 1)),
  throwforwardextra: new createHitboxObject(new createHitbox(offsets[3].throwforwardextra.id0, 8.593, 4, 60, 180, 60, 0, 0, 0, 1, 1)),
  thrown: new createHitboxObject(new createHitbox(offsets[3].thrown.id0, 3.906, 4, 361, 50, 20, 0, 1, 0, 1, 1))
});
for (let l = 0; l < 20; l++) {
  offsets[CHARIDS.FALCO_ID].thrown.id0.push(new Vec2D(0, 12));
}
setChars(CHARIDS.FALCO_ID, new charObject(CHARIDS.FALCO_ID));


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
        pl.phys.cVel.x = 3.85 * pl.phys.face;
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
    if (pl.timer > 6 && pl.phys.jabCombo) {
      M.JAB3.init(p, input);
      return true;
    } else if (pl.timer > 20) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 18) {
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
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 5 && pl.timer < 10) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
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
        pl.phys.cVel.x = 1.54 * pl.phys.face;
      } else if (pl.timer < 31) {
        pl.phys.cVel.x = 1.14 * pl.phys.face;
      } else {
        pl.phys.cVel.x = 0;
      }
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 22) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 17) {
        pl.hitboxes.id[0] = pl.charHitboxes.fsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fsmash2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.fsmash2.id2;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 22) {
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
      if (pl.timer === 11) {
        pl.hitboxes.id[0] = pl.charHitboxes.upsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.upsmash2.id1;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 16) {
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
      if (pl.timer === 24) {
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
    pl.hitboxes.id[0] = pl.charHitboxes.dair1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dair1.id1;
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
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 5 && pl.timer < 15 || pl.timer > 15 && pl.timer < 25) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 15) {
        pl.hitboxes.id[0] = pl.charHitboxes.dair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.dair2.id1;
        pl.hitboxes.frame = 0;
      } else if (pl.timer === 25) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 31) {
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
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      pl.phys.cVel.x = this.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 18) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        pl.hitboxes.id[0] = pl.charHitboxes.dashattack2.id0;
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
    pl.hitboxes.id[0] = pl.charHitboxes.upspecial.id0;
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
      if (pl.timer < 23) {
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
      if (pl.timer >= 23) {
        if (pl.phys.grounded) {
          reduceByTraction(p);
        } else {
          fastfall(p, input);
          airDrift(p, input);
        }
      } else if (pl.timer >= 4) {
        pl.phys.cVel.y -= 0.17 * Math.sin(pl.phys.upbAngleMultiplier);
        pl.phys.cVel.x -= 0.17 * Math.cos(pl.phys.upbAngleMultiplier);
      } else if (pl.timer >= 1) {
        pl.phys.grounded = false;
        pl.phys.cVel.y = 4.2 * Math.sin(pl.phys.upbAngleMultiplier);
        pl.phys.cVel.x = 4.2 * Math.cos(pl.phys.upbAngleMultiplier);
      }
      if (pl.timer > 1 && pl.timer < 23) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 23) {
        turnOffHitboxes(p);
        pl.rotation = 0;
        pl.rotationPoint = new Vec2D(0, 0);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 42) {
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
    if (player[p].timer < 23) {
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
  setVelocities: [0.00072, 0.00072, 0.00072, 6.04024, 6.25258, 2.93342, 0.07311, 0.03107, -0.00327, -0.02994, -0.04893, -0.06023, -0.06386, -2.09936],
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
      if (pl.timer >= 4 && pl.timer <= 16) {
        if (input[p][0].b && !input[p][1].b) {
          pl.phys.laserCombo = true;
        }
      }
      if (pl.timer === 21) {
        if (pl.phys.laserCombo) {
          pl.timer = 5;
          pl.phys.laserCombo = false;
        }
      }
      if (pl.timer === 7) {}
      if (pl.timer === 13) {
        articles.LASER.init({
          p: p,
          x: 8,
          y: 9,
          rotate: 0,
          isFox: false
        });
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 42) {
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
      if (pl.timer >= 15 && pl.timer <= 28) {
        if (input[p][0].b && !input[p][1].b) {
          pl.phys.laserCombo = true;
        }
      }
      if (pl.timer === 31) {
        if (pl.phys.laserCombo) {
          pl.timer = 7;
          pl.phys.laserCombo = false;
        }
      }
      if (pl.timer === 9) {}
      if (pl.timer === 23) {
        articles.LASER.init({
          p: p,
          x: 8,
          y: 7,
          rotate: 0,
          isFox: false
        });
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 57) {
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
    pl.phys.cVel.x *= 0.667;
    pl.phys.cVel.y = 0;
    pl.phys.landingMultiplier = 1.5;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer <= 15) {
        if (pl.phys.cVel.x !== 0) {
          const dir = Math.sign(pl.phys.cVel.x);
          pl.phys.cVel.x -= dir * 0.05;
          if (pl.phys.cVel.x * dir < 0) {
            pl.phys.cVel.x = 0;
          }
        }
      }
      if (pl.timer >= 25) {
        pl.phys.cVel.y -= 0.08;
      }
      if (pl.timer === 16) {}
      if (pl.timer === 17) {
        pl.phys.cVel.x = 16.50 * pl.phys.face;
      }
      if (pl.timer === 18) {
        articles.ILLUSION.init({
          p: p,
          type: 0,
          isFox: false
        });
        if ((input[p][0].b || input[p][1].b) && !input[p][2].b) {
          pl.timer = 20;
        }
      } else if (pl.timer >= 16 && pl.timer < 20) {
        if (input[p][0].b && !input[p][1].b) {
          pl.timer = 20;
        }
      }
      if (pl.timer === 20) {
        pl.phys.cVel.x = 2 * pl.phys.face;
      }
      if (pl.timer > 20) {
        pl.phys.cVel.x -= 0.07 * pl.phys.face;
        if (pl.phys.cVel.x * pl.phys.face < 0) {
          pl.phys.cVel.x = 0;
        }
      }
      if (pl.timer >= 18 && pl.timer <= 21) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 58) {
      S.FALLSPECIAL.init(p, input);
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
      if (pl.timer === 16) {}
      if (pl.timer === 17) {
        pl.phys.cVel.x = 16.50 * pl.phys.face;
      }
      if (pl.timer === 18) {
        articles.ILLUSION.init({
          p: p,
          type: 0,
          isFox: false
        });
        if ((input[p][0].b || input[p][1].b) && !input[p][2].b) {
          pl.timer = 20;
        }
      } else if (pl.timer >= 16 && pl.timer < 20) {
        if (input[p][0].b && !input[p][1].b) {
          pl.timer = 20;
        }
      }
      if (pl.timer === 20) {
        pl.phys.cVel.x = 1.5 * pl.phys.face;
      }
      if (pl.timer > 20) {
        pl.phys.cVel.x -= 0.1 * pl.phys.face;
        if (pl.phys.cVel.x * pl.phys.face < 0) {
          pl.phys.cVel.x = 0;
        }
      }
      if (pl.timer >= 18 && pl.timer <= 21) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 59) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNSPECIALAIR = {
  name: "DOWNSPECIALAIR",
  init: function (p, input) {
    M.DOWNSPECIALAIRSTART.init(p, input);
  }
};

M.DOWNSPECIALAIRSTART = {
  name: "DOWNSPECIALAIRSTART",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIRSTART";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.inShine = 0;
    pl.shineLoop = 6;
    pl.phys.cVel.y = 0;
    pl.phys.cVel.x *= 0.5;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecial.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    pl.phys.inShine++;
    if (!this.interrupt(p, input)) {
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
      if (pl.timer === 1) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
        pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 1);
      }
      if (pl.timer === 2) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 3) {
      M.DOWNSPECIALAIRLOOP.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "DOWNSPECIALGROUNDSTART";
  }
};

M.DOWNSPECIALAIRLOOP = {
  name: "DOWNSPECIALAIRLOOP",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIRLOOP";
    pl.timer = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.reflector.id0;
    turnOffHitboxes(p);
    pl.hitboxes.active = [true, false, false, false];
    pl.hitboxes.frame = 0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    pl.phys.inShine++;
    if (!this.interrupt(p, input)) {
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
      if (pl.timer >= 1) {
        pl.phys.cVel.y -= 0.02667;
        if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
          pl.phys.cVel.y = -pl.charAttributes.terminalV;
        }
      }
      if (pl.shineLoop === 6) {
        pl.shineLoop = 0;
      }
      pl.shineLoop++;
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (input[p][0].lsX * pl.phys.face < 0) {
      M.DOWNSPECIALAIRTURN.init(p, input);
      return true;
    } else if (pl.phys.inShine >= 22 && !input[p][0].b) {
      M.DOWNSPECIALAIREND.init(p, input);
      return true;
    } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
      turnOffHitboxes(p);
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        S.JUMPAERIALB.init(p, input);
      } else {
        S.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (pl.timer > 28) {
      this.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "DOWNSPECIALGROUNDLOOP";
  }
};

M.DOWNSPECIALAIREND = {
  name: "DOWNSPECIALAIREND",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIREND";
    pl.timer = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
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
      pl.phys.cVel.y -= 0.02667;
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 18) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "DOWNSPECIALGROUNDEND";
  }
};

M.DOWNSPECIALAIRTURN = {
  name: "DOWNSPECIALAIRTURN",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIRTURN";
    pl.timer = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
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
      pl.phys.cVel.y -= 0.02667;
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
      if (pl.shineLoop === 6) {
        pl.shineLoop = 0;
      }
      pl.shineLoop++;
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 3) {
      pl.phys.face *= -1;
      M.DOWNSPECIALAIRLOOP.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "DOWNSPECIALGROUNDTURN";
  }
};

M.DOWNSPECIALGROUND = {
  name: "DOWNSPECIALGROUND",
  init: function (p, input) {
    M.DOWNSPECIALGROUNDSTART.init(p, input);
  }
};

M.DOWNSPECIALGROUNDSTART = {
  name: "DOWNSPECIALGROUNDSTART",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "DOWNSPECIALAIRSTART",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUNDSTART";
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
          pl.actionState = "DOWNSPECIALAIRSTART";
        }
      }
      reduceByTraction(p);
      if (pl.timer === 1) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
        pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 1);
      }
      if (pl.timer === 2) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 3) {
      M.DOWNSPECIALGROUNDLOOP.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNSPECIALGROUNDLOOP = {
  name: "DOWNSPECIALGROUNDLOOP",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "DOWNSPECIALAIRLOOP",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUNDLOOP";
    pl.timer = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.reflector.id0;
    turnOffHitboxes(p);
    pl.hitboxes.active = [true, false, false, false];
    pl.hitboxes.frame = 0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    pl.phys.inShine++;
    if (!this.interrupt(p, input)) {
      if (pl.phys.onSurface[0] === 1) {
        if (input[p][0].lsY < -0.66 && input[p][6].lsY >= 0) {
          pl.phys.grounded = false;
          pl.phys.passing = true;
          pl.phys.cVel.y = -0.5;
          pl.actionState = "DOWNSPECIALAIRLOOP";
        }
      }
      reduceByTraction(p);
      if (pl.shineLoop === 6) {
        pl.shineLoop = 0;
      }
      pl.shineLoop++;
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const j = checkForJump(p, input);
    if (input[p][0].lsX * pl.phys.face < 0) {
      M.DOWNSPECIALGROUNDTURN.init(p, input);
      return true;
    } else if (pl.phys.inShine >= 22 && !input[p][0].b) {
      M.DOWNSPECIALGROUNDEND.init(p, input);
      return true;
    } else if (j[0]) {
      turnOffHitboxes(p);
      S.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (pl.timer > 28) {
      this.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNSPECIALGROUNDEND = {
  name: "DOWNSPECIALGROUNDEND",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "DOWNSPECIALAIREND",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUNDEND";
    pl.timer = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 18) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNSPECIALGROUNDTURN = {
  name: "DOWNSPECIALGROUNDTURN",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "DOWNSPECIALAIRTURN",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUNDTURN";
    pl.timer = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p);
      if (pl.shineLoop === 6) {
        pl.shineLoop = 0;
      }
      pl.shineLoop++;
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 3) {
      pl.phys.face *= -1;
      M.DOWNSPECIALGROUNDLOOP.init(p, input);
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
    actionStates[characterSelections[pl.phys.grabbing]].THROWNFALCOBACK.init(pl.phys.grabbing);
    const frame = framesData[characterSelections[pl.phys.grabbing]].THROWNFALCOBACK;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwback.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 9 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (prevFrame < 10 && pl.timer >= 10) {
        pl.phys.face *= -1;
      }
      if (prevFrame < 14 && pl.timer >= 14) {}
      if (prevFrame < 15 && pl.timer >= 15) {
        articles.LASER.init({
          p: p,
          x: 5.2,
          y: 10,
          rotate: Math.PI * 0.22,
          isFox: false
        });
      } else if (prevFrame < 18 && pl.timer >= 18) {
        articles.LASER.init({
          p: p,
          x: 5.4,
          y: 9.7,
          rotate: Math.PI * 0.20,
          isFox: false
        });
      } else if (prevFrame < 21 && pl.timer >= 21) {
        articles.LASER.init({
          p: p,
          x: 5.3,
          y: 9.8,
          rotate: Math.PI * 0.22,
          isFox: false
        });
      }
      if (Math.floor(pl.timer + 0.01) >= 9 && Math.floor(prevFrame + 0.01) < 9) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 38) {
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
    actionStates[characterSelections[pl.phys.grabbing]].THROWNFALCODOWN.init(pl.phys.grabbing);
    const frame = framesData[characterSelections[pl.phys.grabbing]].THROWNFALCODOWN;
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
      if (prevFrame < 22 && pl.timer >= 22) {}
      if (prevFrame < 23 && pl.timer >= 23) {
        articles.LASER.init({
          p: p,
          x: 1,
          y: 12,
          rotate: Math.PI * 275 / 180,
          isFox: false,
          partOfThrow: true
        });
      } else if (prevFrame < 25 && pl.timer >= 25) {
        articles.LASER.init({
          p: p,
          x: 1,
          y: 16,
          rotate: Math.PI * 260 / 180,
          isFox: false,
          partOfThrow: true
        });
      } else if (prevFrame < 28 && pl.timer >= 28) {
        articles.LASER.init({
          p: p,
          x: 2,
          y: 15,
          rotate: Math.PI * 290 / 180,
          isFox: false,
          partOfThrow: true
        });
      } else if (prevFrame < 31 && pl.timer >= 31) {
        articles.LASER.init({
          p: p,
          x: 2,
          y: 17,
          rotate: Math.PI * 275 / 180,
          isFox: false,
          partOfThrow: true
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
    actionStates[characterSelections[pl.phys.grabbing]].THROWNFALCOUP.init(pl.phys.grabbing, input);
    turnOffHitboxes(p);
    const frame = framesData[characterSelections[pl.phys.grabbing]].THROWNFALCOUP;
    pl.phys.releaseFrame = frame + 1;
    pl.hitboxes.id[0] = pl.charHitboxes.throwup.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 7 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (prevFrame < 14 && pl.timer >= 14) {}
      if (prevFrame < 18 && pl.timer >= 18) {
        articles.LASER.init({
          p: p,
          x: 0,
          y: 18,
          rotate: Math.PI / 2,
          isFox: false
        });
      } else if (prevFrame < 20 && pl.timer >= 20) {
        articles.LASER.init({
          p: p,
          x: 0,
          y: 18,
          rotate: Math.PI / 2,
          isFox: false
        });
      } else if (prevFrame < 24 && pl.timer >= 24) {
        articles.LASER.init({
          p: p,
          x: 0,
          y: 18,
          rotate: Math.PI / 2,
          isFox: false
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
    if (pl.timer > 38) {
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
  setVelocities: [-0.09, -0.16, -0.03, 0.28, 0.78, 1.13, 1.17, 0.89, 0.65, 0.65, 0.65, 0.65, 0.64, 0.64, 0.63, 0.62, 0.61, 0.59, 0.58, 0.56, 0.54, 0.52, 0.49, 0.47, 0.44, 0.41, 0, 0, 0, 0, 0, 0, 0],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWFORWARD";
    pl.timer = 0;
    actionStates[characterSelections[pl.phys.grabbing]].THROWNFALCOFORWARD.init(pl.phys.grabbing, input);
    const frame = framesData[characterSelections[pl.phys.grabbing]].THROWNFALCOFORWARD;
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
      pl.phys.cVel.x = this.setVelocities[Math.max(0, Math.floor(pl.timer + 0.01) - 1)] * pl.phys.face;
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

M.THROWNFALCOUP = {
  name: "THROWNFALCOUP",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-7.53, -0.30], [-6.79, 0.33], [-6.23, 0.46], [-5.96, 0.16], [-3.54, 17.01], [-3.54, 17.01]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCOUP";
    if (pl.phys.grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x, player[pl.phys.grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer > 0) {
        pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x + this.offset[pl.timer - 1][0] * pl.phys.face, player[pl.phys.grabbedBy].phys.pos.y + this.offset[pl.timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNFALCODOWN = {
  name: "THROWNFALCODOWN",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-4.55, -0.25], [-2.34, -1.47], [-2.11, -1.42], [-2.11, -0.82], [-2.09, 2.57], [-0.63, 5.71], [-0.72, 6.11], [-1.18, 5.83], [1.23, 5.31], [1.24, 5.70], [1.13, 6.03], [-0.51, 8.76], [-0.91, -3.89], [-0.94, -3.84], [-0.90, -2.46], [-0.83, -2.05], [-0.72, -1.66], [-0.61, -1.72], [-0.57, -4.24], [-0.57, -4.22], [-0.57, -3.79], [-0.57, -3.39], [-0.57, -3.01], [-0.57, -2.68], [-0.57, -2.40], [-0.57, -2.19], [-0.57, -2.19]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCODOWN";
    if (pl.phys.grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x, player[pl.phys.grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer > 0) {
        pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x + this.offset[pl.timer - 1][0] * pl.phys.face * -1, player[pl.phys.grabbedBy].phys.pos.y + this.offset[pl.timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNFALCOBACK = {
  name: "THROWNFALCOBACK",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-9.32, -0.58], [-8.27, -0.79], [-5.10, -1.66], [-1.40, -2.95], [-1.76, -3.82], [-5.99, 0.79], [-8.22, 4.80], [-8.22, 4.80]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCOBACK";
    if (pl.phys.grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.face *= -1;
    pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x, player[pl.phys.grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer > 0) {
        pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x + this.offset[pl.timer - 1][0] * pl.phys.face, player[pl.phys.grabbedBy].phys.pos.y + this.offset[pl.timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNFALCOFORWARD = {
  name: "THROWNFALCOFORWARD",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-8.81, -0.58], [-8.42, 1.33], [-8.48, 1.34], [-7.75, 1.56], [-6.64, 1.83], [-6.01, 2.01], [-6.6, 1.97], [-8.5, 1.65], [-8.5, 1.65]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCOFORWARD";
    if (pl.phys.grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x, player[pl.phys.grabbedBy].phys.pos.y);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer > 0) {
        pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x + this.offset[pl.timer - 1][0] * pl.phys.face, player[pl.phys.grabbedBy].phys.pos.y + this.offset[pl.timer - 1][1]);
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
  offset: [[-71.04, -15.95], [-71.70, -14.85], [-72.18, -13.83], [-72.61, -12.68], [-72.8, -11], [-72.8, -7.73], [-72.8, -4.4], [-71.78, -2.28], [-69.79, -0.65], [-67.01, 0]],
  setVelocities: [0.55, 0.55, 0.58, 0.59, 0.52, 0.37, 0.14, 0, 0, 0, 0],
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
  offset: [[-70.6, -16.31], [-70.6, -16.09], [-70.6, -15.85], [-70.6, -15.61], [-70.6, -15.37], [-70.6, -15.17], [-70.6, -15.00], [-70.6, -14.89], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.83], [-70.6, -14.79], [-70.6, -14.72], [-70.6, -14.62], [-70.6, -14.50], [-70.6, -14.36], [-70.6, -14.20], [-70.6, -14.02], [-70.6, -13.84], [-70.6, -13.64], [-70.6, -13.42], [-70.6, -13.21], [-70.6, -12.99], [-70.6, -12.76], [-70.6, -12.54], [-70.6, -12.32], [-70.6, -12.1], [-70.6, -11.85], [-70.6, -11.53], [-70.6, -11.16], [-70.6, -10.75], [-70.6, -10.33], [-70.6, -9.9], [-70.6, -9.50], [-70.6, -9.12], [-70.6, -8.75], [-70.6, -8.33], [-70.6, -7.86], [-70.6, -7.29], [-70.6, -6.6], [-70.50, -5.58], [-70.22, -4.21], [-69.82, -2.73], [-69.35, -1.37], [-68.86, -0.38], [-67.94, 0]],
  setVelocities: [0.44, 0.47, 0.49, 0.50, 0.49, 0.47],
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
      const l = activeStage.ledge[pl.phys.onLedge];
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
  offset: [[-71.01, -16.02], [-71.70, -14.85], [-72.39, -13.23], [-72.8, -11], [-72.8, -7.60], [-72.8, -4.4], [-71.78, -2.28], [-69.79, -0.65], [-67.01, 0]],
  setVelocities: [0.83, 1.19, 1.28, 1.78, 1.52, 1.07, 1.34, 0.90, 0.43, 0.38, 0.29, 0.31, 0.41, 0.38, 2.2, 2.80, 2.92, 2.95, 2.89, 2.75, 2.51, 2.18, 1.77, 1.26, 0.85, 0.60, 0.40, 0.23],
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
      const l = activeStage.ledge[pl.phys.onLedge];
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
  offset: [[-70.6, -16.31], [-70.6, -16.09], [-70.6, -15.85], [-70.6, -15.61], [-70.6, -15.38], [-70.6, -15.17], [-70.6, -15.00], [-70.6, -14.89], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.83], [-70.6, -14.79], [-70.6, -14.72], [-70.6, -14.62], [-70.6, -14.50], [-70.6, -14.36], [-70.6, -14.20], [-70.6, -14.03], [-70.6, -13.84], [-70.6, -13.64], [-70.6, -13.43], [-70.6, -13.21], [-70.6, -12.99], [-70.6, -12.76], [-70.6, -12.54], [-70.6, -12.32], [-70.6, -12.1], [-70.6, -11.85], [-70.6, -11.53], [-70.6, -11.16], [-70.6, -10.75], [-70.6, -10.33], [-70.6, -9.9], [-70.6, -9.50], [-70.6, -9.12], [-70.6, -8.75], [-70.6, -8.33], [-70.6, -7.86], [-70.6, -7.29], [-70.6, -6.6], [-70.44, -5.58], [-70.03, -4.21], [-69.50, -2.73], [-68.97, -1.37], [-68.56, -0.38], [-68.24, 0]],
  setVelocities: [0.56, 1.71, 2.91, 4.16, 2.92, 2.77, 2.61, 2.45, 2.30, 2.15, 1.99, 1.84, 1.69, 1.54, 1.39, 1.24, 1.10, 0.95, 0.77, 0.57, 0.40, 0.26, 0.15, 0.07, 0.01, -0.02],
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
      const l = activeStage.ledge[pl.phys.onLedge];
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
  offset: [[-71.20, -16.23], [-71.95, -16.05], [-72.74, -15.89], [-72.50, -15.66], [-74.12, -15.28], [-74.50, -14.67], [-74.55, -13.75], [-74.25, -12.49], [-73.68, -10.94], [-72.91, -9.19], [-72.01, -7.30], [-71.04, -5.37], [-70.07, -3.45], [-69.17, -1.64]],
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
      const l = activeStage.ledge[pl.phys.onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 15) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 15) {
        pl.phys.cVel = new Vec2D(1 * pl.phys.face, 3.9);
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
  offset: [[-70.47, -16.12], [-70.32, -15.85], [-70.15, -15.59], [-69.99, -15.25], [-69.86, -14.72], [-69.77, -13.92], [-69.75, -12.73], [-70.06, -9.84], [-70.58, -5.60], [-70.75, -2.36], [-70.36, -0.85], [-69.83, -0.35], [-69.45, -1.06], [-69.48, -2.49], [-69.73, -3.35], [-69.88, -3.61], [-69.87, -3.72], [-69.73, -3.35], [-69.02, -1.70]],
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
      const l = activeStage.ledge[pl.phys.onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 20) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 20) {
        pl.phys.cVel = new Vec2D(1 * pl.phys.face, 3.9);
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
  offset: [[-70.6, -16.31], [-70.6, -16.09], [-70.6, -15.85], [-70.6, -15.61], [-70.6, -15.38], [-70.6, -15.17], [-70.6, -15.00], [-70.6, -14.89], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.85], [-70.6, -14.84], [-70.6, -14.80], [-70.6, -14.74], [-70.6, -14.66], [-70.6, -14.56], [-70.6, -14.44], [-70.6, -14.30], [-70.6, -14.14], [-70.6, -13.97], [-70.6, -13.78], [-70.6, -13.58], [-70.6, -13.36], [-70.6, -13.13], [-70.6, -12.89], [-70.6, -12.63], [-70.6, -12.37], [-70.6, -12.1], [-70.6, -11.82], [-70.6, -11.52], [-70.6, -11.21], [-70.6, -10.87], [-70.6, -10.52], [-70.6, -10.14], [-70.6, -9.73], [-70.6, -9.30], [-70.6, -8.83], [-70.6, -8.33], [-70.6, -7.79], [-70.6, -7.22], [-70.6, -6.6], [-70.44, -5.67], [-70.02, -4.32], [-69.49, -2.82], [-68.96, -1.43], [-68.56, -0.40], [-68.24, 0]],
  setVelocities: [0.40, 1.02, 1.33, 1.33, 1.02, 0.41, 0, 0, 0, 0, 0, -0.18, -0.37, -0.40, -0.44, -0.43],
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
      const l = activeStage.ledge[pl.phys.onLedge];
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
  offset: [[-71.04, -15.95], [-71.70, -14.85], [-72.18, -13.83], [-72.61, -12.68], [-72.8, -11], [-72.8, -7.73], [-72.8, -4.4], [-71.39, -2.28], [-68.40, -0.66], [-62.95, 0]],
  setVelocities: [0.22, 0.04, 1.83, 2.20, 2.43, 2.54, 2.51, 2.35, 2.06, 1.63, 1.08, 0.39, 0, 0, 0, -0.39, -0.71, -0.86, -1.25, -1.54, -1.74, -1.85, -1.86, -1.78, -1.62, -1.35, -1.00, -0.79, -0.74, -0.62, -0.43],
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
      if (pl.timer === 3) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 115) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

setupActionStates(CHARIDS.FALCO_ID, { ...S, ...M });

actionStates[CHARIDS.FALCO_ID].ESCAPEB.setVelocities = [0, 0, 0, 0, 0, 0, -0.52963, -1.50741, -2.36296, -6.60, -2.70864, -1.69136, -1.37381, -1.12101, -1.26280, -1.57886, -1.72066, -1.73426, -1.69565, -1.76333, -2.00805, -2.14219, -1.95447, -1.44489, -0.84652, -0.48166, -0.27840, -0.23674, -0.35667, -0.66763, -0.43237];
actionStates[CHARIDS.FALCO_ID].ESCAPEF.setVelocities = [0, 0, 0, 0, 0, 0, 2.75, 4.95, 5.5, 1.18, 1.0199, 1.23857, 1.99807, 2.13604, 2.0652, 1.94967, 1.92641, 1.89979, 1.8698, 1.83645, 1.65, 1.33462, 1.05177, 0.80152, 0.58387, 0.39882, 0.24637, 0.12652, 0.03926, -0.01538, -0.03745];
actionStates[CHARIDS.FALCO_ID].DOWNSTANDB.setVelocities = [-0.1071, -0.12, -0.13, -0.14, -0.14, -0.27, -0.51, -0.72, -0.91, -1.08, -1.23, -1.35, -1.45, -1.53, -1.59, -1.62, -1.55, -1.43, -1.34, -1.30, -1.30, -1.34, -1.43, -1.53, -1.61, -1.65, -1.65, -1.62, -1.56, -1.46, -1.33, -1.16, -0.96, -0.73, -0.46];
actionStates[CHARIDS.FALCO_ID].DOWNSTANDF.setVelocities = [0.19, 0.25, 0.61, 1.55, 1.79, 4.38, 3.99, 3.62, 3.26, 2.92, 2.60, 2.30, 2.02, 1.76, 1.51, 1.29, 1.08, 0.89, 0.72, 0.56, 0.43, 0.31, 0.21, 0.13, 0.07, 0.03, 0.004, -0.003, 0, 0, 0, 0, 0, 0, 0, 0];
actionStates[CHARIDS.FALCO_ID].TECHB.setVelocities = [0, -2.18, -2.15, -2.11, -2.07, -2.03, -1.99, -1.94, -1.90, -1.85, -1.81, -1.76, -1.71, -1.65, -1.60, -1.55, -1.49, -1.43, -1.38, -1.31, -1.25, -1.19, -1.13, -1.06, -0.99, -0.92, -0.85, -0.78, -0.71, -0.64, -0.56, 0, 0, 0, 0, 0, 0, -0.003, -0.003, -0.003];
actionStates[CHARIDS.FALCO_ID].TECHF.setVelocities = [0, 0, 0, 0, 0, 0, 0, 2.93, 2.86, 2.78, 2.71, 2.63, 2.54, 2.46, 2.37, 2.28, 2.18, 2.08, 1.98, 1.88, 1.77, 1.66, 1.54, 1.43, 1.31, 1.18, 1.06, 0.93, 0.80, 0.66, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
actionStates[CHARIDS.FALCO_ID].CLIFFCATCH.posOffset = [[-73.78, -15.44], [-73.46, -15.55], [-73, -15.70], [-72.46, -15.88], [-71.89, -16.07], [-71.35, -16.25], [-70.90, -16.40]];
actionStates[CHARIDS.FALCO_ID].CLIFFWAIT.posOffset = [-70.6, -16.5];

// ---- ECB (environmental collision box) offsets per action-state frame, run-length encoded (see decodeEcb in ml.js) ----
setEcbData(CHARIDS.FALCO_ID, decodeEcb({
  ATTACKAIRB: "338<529<539<549<n539<a438<d428<c529<539<c428<529<428<328<a",
  ATTACKAIRD: "629<a529<a428<a428;a437:438;428;428<b428;a438;b428<j529<f428<f328<b338<328<",
  ATTACKAIRF: "438<a428;437:438;539<549<539<a639<72:<629<529<b549<639<629<639;629;528;a539<a549<539<639<a629<b529<a549<639<629<629;639;528;a529<539<d549<a438<439=a438<429=428<328<d",
  ATTACKAIRN: "539<a438;548;649;a548;i538;j548;538;d528;428<438<i338<328<338<a",
  ATTACKAIRU: "338<337;437:4379a3268a3269327;327:428;529=52:>428<327:3269336823573257a3268a326942793269327:a337:a337;438<c338<c328<",
  ATTACKDASH: "438;539<639<649<639<j438<c438;337:336923582258b2358336822693269a327:b337:327:337;327;428<",
  CAPTURECUT: "327;337;337:m337;a337:b327:337:d337;327;428;",
  CAPTUREPULLED: "337:2369",
  CAPTUREDAMAGE: "23582357c3368a23583369a337:a3269a327:e",
  CATCHATTACK: "438;337;438;428;j327;428;327;428;438;337;c327;",
  CATCHCUT: "438;438<438;428<438<428<438<a438;j337;438;d428<d",
  CATCHWAIT: "438;d337;r438;a337;438;b",
  CLIFFCATCH: "438;a327;a227;b",
  CAPTUREWAIT: "3369327:a3269327:z327:l3269327:z327:c3269c",
  DAMAGEFALL: "3369337:437:538;437:337:32692269a226:337:a437:447:346934683368a33692369337:337;438;428;438;337;337:3369b",
  DAMAGEFLYN: "337:a43794368537952795379538:c4379a437:c337:3369a3469346834694379b337:3369a",
  DOWNBOUND: "13461435b234523462357336843795379638:639;a538;b438;a337:3369346813471434c",
  CLIFFWAIT: "227;z227;v",
  DASH: "337:23583369b437:538:548:548;a447:437:337:b336923692358337:327;a",
  DAMAGEN2: "337:3369a3368a23583368a235833682358a23572257a336822573269337:a337;a428<",
  DOWNDAMAGE: "14342345a233433452446a2346b234513341434",
  DOWNSPECIALAIREND: "428;428<428;a327;a337;g338<438<338<a",
  DOWNSPECIALGROUNDSTART: "428<327;327:",
  DOWNSPECIALAIRTURN: "428;b",
  DOWNSPECIALAIRSTART: "338<327;428;",
  DOWNSPECIALGROUNDLOOP: "327:z327:",
  DOWNSPECIALAIRLOOP: "428;z428;",
  DOWNSPECIALAIRREFLECT: "428;a427:a428;427:428;m",
  DOWNSMASH: "429=a62;?539=347:2558b2458m2369b3269b33693269c3169317:327:e327;f428<",
  DOWNSPECIALGROUNDREFLECT: "327:a3269b327:n",
  DOWNSPECIALGROUNDEND: "327:a428;428<a327;b337:a3269327:b337:327:327;a",
  DOWNATTACK: "14351346033613470348135923693369d337:c347:d337:a347:357;357:447:a448;347:337;a327;438<b428;327;b327:337:327;d428<a",
  DOWNSTANDN: "14340424133513462357a1347a2358c2369b33692369a2269b32693369a337:327:337;327;b",
  DOWNSPECIALGROUNDTURN: "327:b",
  DOWNSTANDF: "04240324a13582369235813462457135823692269a23582357234622462257125802481247225723572346a2357a2358a3369337:a327;a428<a",
  DOWNSTANDB: "1434a13341335a23462357a2358a2357b2358a13471346a0347023603360335133523572358a33682369a235823572358337:327;428<",
  FALLAERIAL: "337;a327;c337;a",
  FALL: "338<328<f",
  DOWNTILT: "2358b2257235832692357245823582269a3269g3268b2358f",
  FALLSPECIAL: "2369a23582369d",
  ESCAPEAIR: "338<a428;438;c538;f538:538;c538:a437:b437934694379438;438<439=539=74:=84:<74:<639<539<438;337:2269226:227;b226:23692358b2369",
  FORWARDSMASH: "327;327:3269b327:a327;438;539<438<539<639<a73:<d639<639;539<438;c337;337:327:3269b33692369235833682369327:327;",
  FORWARDTILT: "336932693369327:328<448<h438<a428<b327;d428;428<",
  DOWNWAIT: "1434z1434l1334u1434f",
  ESCAPEB: "3269a3268a3269a327:3469336833573369327:327;338<337:4479a436823572346c2357c235833683369327;",
  FURAFURA: "327:d327;v337:f3369g337:3369c337:3369a337:a327:337:327:i327;m337:e33692369a3369d3368c2369336923693369e337:b",
  FURASLEEPEND: "2346a13462346c13462346d1346235723583269b22693269e3369l337:n327:a327;b428<",
  ESCAPEN: "337;337:e3369c3368a23583369337:337;438;428;428<a328<",
  FURASLEEPSTART: "428<328<337;a337:33692358c3369336823693369a23693369b23692358b2357b2346a1346a",
  GUARDON: "428<a438<b428<a438<",
  JAB1: "428<438;347;b347:347;337;337:a337;d438;428<",
  GUARDOFF: "428<438<a428<328<337;a327;337;327;a428<c",
  GUARD: "428<",
  JUMPAERIALB: "338<337;437:5379437:337:427:538:528:629;528:4379538:628:427:4279a538:638:52794279528:629;a528:43795379538:528:427:4279b427:538;639;638:538:437:3369b4379337:a438;a438<a338<",
  GRAB: "428<438<b428;a337;d337:c3369i337:a327:327;a",
  JUMPAERIALF: "338<237;2369548:327:538;739:629;a537953783269327:528:6389a528;a528:537863785379427:b528:638:a73896389638:628:528;a529<a629<b539<538;a438;d337;b",
  JUMPB: "226:327;328<338<b337;447:548;548:44793468447:438;438<439=429=a428<a438<438;548:5479a548:a437:a438;337;328<f338<a",
  JAB3: "438;428<d429=a438<c428<a438<448<a438<b428<438<448<b438<c448<a438<b428<438<448<438<c428<429=a438<a429=428<g",
  ESCAPEF: "327;327:d327;337:23693469337;428<438<448;346824582357b2346g2357a33683269",
  JAB2: "337:a3469f347:337:337;337:c337;b428<",
  LANDING: "2358q336923693369337:c337;327;a428;428<",
  LANDINGATTACKAIRN: "337:23693369c32693369327:b327;b428<",
  LANDINGATTACKAIRU: "13471346133513461358226:328<438;3468436733693269327:a2357a2358337:",
  KNEEBEND: "2358d",
  CLIFFATTACKQUICK: "227;a327;a428;528;629;a528;428;327;227;a327;428;528;428;538;628:528;428;538:638:438;448<448;4479346824581446143514461435c14461434144623462457347:448;438<62:=539<649;648944793369235822583269327;",
  FURASLEEPLOOP: "2346a13462346a1346b2346z13462346g1346b2346c1346u2346z2346a1346c2346c",
  LANDINGATTACKAIRF: "2346a1335j234623583269327:327;a337;328<428<",
  CLIFFATTACKSLOW: "227;b327;428;d529<428<c528;c428;a327;a226:227;f327;428;c327;328<227<c227;e226:12591358234613461335a327:439=438<24692458245723572346a1335a134622572269327;",
  LANDINGATTACKAIRB: "23571335b1346d335733683369b3269a327:a327;a",
  LANDINGATTACKAIRD: "337:327;337;327;337:a3269c327:a327;c328<428<",
  JUMPF: "227<338<227;y327;227;a227<328<237<338<d328<",
  CLIFFESCAPEQUICK: "227;a327;428;528;a629;528;428;327;227;a327;528;a628:629;529<529=439=539=539<639;a448;438;337:3369a23583269327:b337;437:a539=53:>63:=548;749:649;438;337;225823583269327;",
  CLIFFGETUPQUICK: "227;a327;a428;528;a629;528;428;327;227;a327;428;529<538;a629;629<529=52:>63:>a538;438;427:326922582257a2269327:428<",
  CLIFFJUMPQUICK: "327;428;538;529<a428<a62:>83<?74;>93=@73;?539<427:2269327;328<b338<c237<237;b337;437:b43795379538:a638:639;629;d629<c529<c428<a328<c338<",
  CLIFFESCAPESLOW: "227;b327;a428;b528;428<d428;e327;227;g327;a428;c327;328<227<c227;e226:23691358033613461335a234623572258327:528;83:<739:638:538;438;b437:337:326822582257a23572358a3369337:327;428<",
  CLIFFGETUPSLOW: "227;b327;a428;b529<a428<c428;528;b428;327;b227;b126;227;c327;428;c327;227<d227;e226:226912581247234613351346235723583369337;428;",
  NEUTRALSPECIALAIR: "338<438<428<a438<i539<e438<b338<b338=439=338=338<a338=338<438<f338<a",
  CLIFFJUMPSLOW: "126;226:126;126:a02590248024703480347a0336c0335b0336328<l428<529<429=438;43794368a4379437:438;437:b538;437:346833692369236:327;328<428<a328<227<",
  MISSFOOT: "327;02590248a0347c0336a0436a14461435244624572358b3368a437923693369b",
  RUNBRAKE: "337:43793369336823582357d23583369b337:337;428<a",
  SQUAT: "327:33692358d",
  SQUATRV: "23583369337:a337;327;428<c",
  NEUTRALSPECIALGROUND: "428<a327;c337;r327;c337;a327:a337:327:d337;b338<337;d327;d328<428<328<428<428;",
  REBOUND: "327:b337:327:g327;b",
  RUNTURN: "337:437:337:336923692358a3369c337:3369337:3369e",
  SIDESPECIALAIR: "227<327;227;236:h337:226:236:2358d638:648:b548:a648:548:h538:a548:b4379a33684468447954796489648:547943793369538:639;538;a447:3369",
  ILLUSIONFX: "2358",
  STOPCEIL: "83;=93;=b94;=94;<84:<83;=639;",
  TECHB: "429=226933692458548;b548:447:33692358a336823582357a1247033513462358134733575479437:438;a337:b3369a3269c3369327:337:327;428;",
  SIDESPECIALGROUND: "429=337;a337:d3369337:a33692369b33683468b3368a2358a2369o23582369i2358a2357b2358337:337;327;",
  RUN: "437:447:3369a2358c3369a44793469a23692358b23693369437:",
  PASS: "327:035903470236b02471247225832693369c4379437:a438;d438<a338<c328<",
  TECHN: "429=428<337;337:2369a337:338=54:>649<649;749;739;639<539=428<a327;337:3369a3269327:a327;a",
  TECHF: "429=439=328=429=a327;a437:33572357b23582369235823572358b2257a12460336134723582369337:h327;b428;428<",
  THROWNFOXUP: "326922692258327:0247a",
  THROWBACK: "337;b327:327;327:a337:c3369a23693369336833693368a3369a336823693369a235833683369a337:a337;327;c428<428;",
  SQUATWAIT: "2358l3368h2358b3368c23583368g2358v33682358b3368e2358d3368l2358j",
  THROWDOWN: "337:a3369c337;338<428;b327;b529<739;:3<=;3=?<3?A=2?A=3?A>2@A=2?A?2AB?2ACa@2BD@2CEaA2DFA2CEaB2DFB2EGA3DF>3AD83<@438<337:327;b328<",
  THROWFORWARD: "337;438;337;438;c337;438;337:3369a337:3369f337:3369a3269327:a3269327:337;b428;428<",
  THROWNMARTHFORWARD: "126:136:025:a035:a035913592369337:639<",
  THROWNFOXBACK: "327:3269a3369437:3368a",
  THROWNMARTHBACK: "0348a0448337:539=",
  TECHU: "528;a629;639;d638:639;b529<529=53:>b539=b439=b328=328<a",
  THROWNFOXFORWARD: "2269a1258d124713471458",
  THROWNPUFFUP: "427:3269a235813581258",
  THROWNMARTHDOWN: "0259a025:c126:337;538;639;639<",
  THROWNPUFFFORWARD: "327:428;428<a438<d",
  THROWNMARTHUP: "1359126:1259d126:0347",
  THROWNFALCOBACK: "327:3269a3369427:3368a",
  THROWNFALCOFORWARD: "22691258d13471458",
  THROWNFALCOUP: "326922692258337:0223",
  THROWNFALCONUP: "1259a126:0259a03590259b0248b02470248",
  THROWNFALCONBACK: "025903590348a0248a025912580248a024712461235d12461235",
  THROWNPUFFBACK: "3269f226912590348a13582369649;529=93;=a84:<84:;",
  THROWNFALCONFORWARD: "0259h01481346f",
  THROWNPUFFDOWN: "32693368a437953796389a648963896489648:b749:b648:b749:648:6489f638:639;b638:6489a648:f749:648:d6489b648:638:c6489b648:",
  THROWNDOCDOWN: "326942793269a3268226913582357336973:=92<>82;>539<638:",
  THROWNDOCFORWARD: "3268a33683269b437:a538:",
  THROWUP: "337;327;327:a3369327:429=b428<428;a337:a337;429=429>a429=429>52:>429=429>52:>429=429>52:>a428<337:327;337:M0JG337:337;a327;428<",
  THROWNFALCODOWN: "225723571347235733686389749:648:547944683368739;43793468638:639;a538:437:13471358b144723570436",
  TILTTURN: "327;328<428<327;b328<a428<327;a",
  THROWNDOCBACK: "327:23692358a336833694379a42794379436842683368a3268b336824582358a22582358236923582357235823572358a3468a3368a5478",
  THROWNDOCUP: "4268a5379638:538:639;a638:639;a638:537843681358",
  UPTILT: "337;3369235732693469a53:>52:?429=a428<b428;a327;337:3369b337:337;428<",
  UPSMASH: "337;327:a327;a327:337:4479548:84:<93=@:2>B;3>A:3=?:4<>a;4=>:3<>93<>83;=63:=539<438<a438;a337;33692358a3369a337:a327:337;327;438;428<d",
  UPSPECIALCHARGE: "328<438<428<j529<428<j429=a428<g529=529<b428;337:4479",
  THROWNFOXDOWN: "22572357a1347a33685379648:749;648:5479447944683357739;528:1446638:a639;a538;538:437:13471358b1258044714472357",
  THROWNFALCONDOWN: "0259126:226:12590247034733685479639<72:=62:>a62:=72:=",
  UPSPECIALLAUNCH: "226:u44793468125912582246b3257a2258225712470236a0235a1235032403352457",
  WALLDAMAGE: "428;328<327;327:226:a2269b135923581358a23581358c1258e1359a2369236:438<538;5378a4379327:a428;629<73:<a639;639<",
  WALK: "438<a438;337;a327;c337;327;337;a338<438<438;c428;a327;b328<a428<a438<b",
  WALLJUMP: "327:327;428;a438;t4379436853784268a326842795278436742684279327:428;438;338<",
  WALLTECH: "337:a327:d327;c327:327;a337;438;427:538;c529<a428<328<a",
  WAIT: "428<g429=428<429=e428<h328<e327;b328<d428<b429=c428<b438<428<438<428<328<a337;327;e328<428<d429=b428<c328<428<328<c327;d328<b428<i328<d327;b438;428;337;b338<428<438<328<428<a438<428<a438<439=g438<d328<327;328<327;g337;a327;428<d429=438<428<d328<327;328<327;f328<a338<428<a429=d428<a438<428<a328<327;328<327;338<327;328<a438<338<428<c429=428<429=428<d438<328<428<a327;428<328<b438<327;428<e429=c428<429=428<i",
  DEADUP: "Q0A0a",
  DEADDOWN: "Q0A0a",
  DEADLEFT: "Q0A0a",
  DEADRIGHT: "Q0A0a",
  ENTRANCE: "428<g429=428<429=e428<h328<e327;b328<d428<b429=c428<b438<428<438<428<328<a337;327;e328<428<d429=b428<c328<428<328<c327;d328<b428<i328<d327;b438;428;337;b338<428<438<328<428<a438<428<a438<439=g438<d328<327;328<327;g337;a327;428<d429=438<428<d328<327;328<327;f328<a338<428<a429=d428<a438<428<a328<327;328<327;338<327;328<a438<338<428<c429=428<429=428<d438<328<428<a327;428<328<b438<327;428<e429=c428<429=428<i",
  SLEEP: "0000",
  REBIRTH: "428<g429=428<429=e428<h328<e327;b328<d428<b429=c428<b438<428<438<428<328<a337;327;e328<428<d429=b428<c328<428<328<c327;d328<b428<i328<d327;b438;428;337;b338<428<438<328<428<a438<428<a438<439=g438<d328<327;328<327;g337;a327;428<d429=438<428<d328<327;328<327;f328<a338<428<a429=d428<a438<428<a328<327;328<327;338<327;328<a438<338<428<c429=428<429=428<d438<328<428<a327;428<328<b438<327;428<e429=c428<429=428<i",
  REBIRTHWAIT: "428<g429=428<429=e428<h328<e327;b328<d428<b429=c428<b438<428<438<428<328<a337;327;e328<428<d429=b428<c328<428<328<c327;d328<b428<i328<d327;b438;428;337;b338<428<438<328<428<a438<428<a438<439=g438<d328<327;328<327;g337;a327;428<d429=438<428<d328<327;328<327;f328<a338<428<a429=d428<a438<428<a328<327;328<327;338<327;328<a438<338<428<c429=428<429=428<d438<328<428<a327;428<328<b438<327;428<e429=c428<429=428<i",
  LANDINGFALLSPECIAL: "2358q336923693369337:c337;327;a428;428<",
  SMASHTURN: "327;328<428<327;b328<a428<327;a",
  SHIELDBREAKFALL: "3369337:437:538;437:337:32692269a226:337:a437:447:346934683368a33692369337:337;438;428;438;337;337:3369b",
  SHIELDBREAKDOWNBOUND: "13461435b234523462357336843795379638:639;a538;b438;a337:3369346813471434c",
  SHIELDBREAKSTAND: "14340424133513462357a1347a2358c2369b33692369a2269b32693369a337:327:337;327;b",
  WALLTECHJUMP: "327:327;428;a438;t4379436853784268a326842795278436742684279327:428;438;338<",
  OTTOTTO: "428<328<227;226:126:a1259136:236:336923582458",
  FIREFOXBOUNCE: "03480236a23452269134613350224032403350236023503362358",
  OTTOTTOWAIT: "1458b245824572458a24692369337:b3369a2358d3369337:a337;a438<b338<438<g338<c438;b337;f437:337:h327:h327;c337;337:a3369a2358a336833692369236:2469c2358a2357c2358d2458b23582458d1458a",
  APPEAL: "428<a328<438<337;k428<338<438<439=429=b529=419=519=429>429=l439=f438<d338<328<a338<337;i338<a337;338<c438<338<428<328<a338<337;b327;o328<327;328<c327;328<a327;a337;c428<a",
}));
ecb[CHARIDS.FALCO_ID].DEADUP = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCO_ID].DEADDOWN = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCO_ID].DEADLEFT = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCO_ID].DEADRIGHT = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCO_ID].ENTRANCE = ecb[CHARIDS.FALCO_ID].WAIT;
ecb[CHARIDS.FALCO_ID].SLEEP = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCO_ID].REBIRTH = ecb[CHARIDS.FALCO_ID].WAIT;
ecb[CHARIDS.FALCO_ID].REBIRTHWAIT = ecb[CHARIDS.FALCO_ID].WAIT;
ecb[CHARIDS.FALCO_ID].LANDINGFALLSPECIAL = ecb[CHARIDS.FALCO_ID].LANDING;
ecb[CHARIDS.FALCO_ID].SHIELDBREAKFALL = ecb[CHARIDS.FALCO_ID].DAMAGEFALL;
ecb[CHARIDS.FALCO_ID].SHIELDBREAKDOWNBOUND = ecb[CHARIDS.FALCO_ID].DOWNBOUND;
ecb[CHARIDS.FALCO_ID].SHIELDBREAKSTAND = ecb[CHARIDS.FALCO_ID].DOWNSTANDN;
ecb[CHARIDS.FALCO_ID].TECHWALLJUMP = ecb[CHARIDS.FALCO_ID].WALLJUMP;
ecb[CHARIDS.FALCO_ID].THROWNFALCONDIVE = ecb[CHARIDS.FALCO_ID].DAMAGEFLYN;
