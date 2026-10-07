/**
 * puff.js: template character data and action states (meleelight's Jigglypuff (Mochi)): attributes, hitboxes, frame counts, ECB data and the character's own moves.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { hitQueue } from './hit.js';
import { CHARIDS, activeStage, charObject, characterSelections, decodeEcb, ecb, framesData, offsets, player, setCharAttributes, setChars, setEcbData, setFrames, setHitBoxes, setIntangibility, setOffsets } from './ml.js';
import { S } from './shared.js';
import { actionStates, airDrift, checkForAerials, checkForDash, checkForJump, checkForMultiJump, checkForSmashTurn, checkForSmashes, checkForSpecials, checkForTiltTurn, checkForTilts, fastfall, reduceByTraction, setupActionStates, tiltTurnDashBuffer, turnOffHitboxes } from './shortcuts.js';
import { Vec2D, createHitbox, createHitboxObject } from './util.js';

// ---- attributes, hitboxes, frame counts, hitbox offsets ----
setCharAttributes(CHARIDS.PUFF_ID, {
  dashFrameMin: 12,
  dashFrameMax: 23,
  dInitV: 1.31,
  dMaxV: 1.1,
  dAccA: 0.065,
  dAccB: 0.02,
  dTInitV: 1.4,
  traction: 0.09,
  maxWalk: 0.7,
  jumpSquat: 5,
  sHopInitV: 1.05,
  fHopInitV: 1.6,
  gravity: 0.064,
  groundToAir: 1,
  jumpHmaxV: 1.35,
  jumpHinitV: 0.7,
  airMobA: 0.09,
  airMobB: 0.19,
  aerialHmaxV: 1.35,
  airFriction: 0.05,
  fastFallV: 1.6,
  terminalV: 1.3,
  walkInitV: 0.16,
  walkAcc: 0.1,
  walkMaxV: 0.7,
  djMultiplier: 0,
  djMomentum: 0,
  shieldScale: 13.125,
  modelScale: 0.94,
  weight: 60,
  waitAnimSpeed: 1,
  walljump: false,
  hurtboxOffset: [6, 13],
  ledgeSnapBoxOffset: [14, 8, 18],
  shieldOffset: [0, 22],
  charScale: 0.24,
  miniScale: 0.168,
  runTurnBreakPoint: 16,
  airdodgeIntangible: 25,
  wallJumpVelX: 1.3,
  wallJumpVelY: 2.4,
  shieldBreakVel: 10,
  multiJump: true,
  ecbScale: 1,
  walkAnimSpeed: 1,
  runAnimSpeed: 1
});
setIntangibility(CHARIDS.PUFF_ID, {
  "ESCAPEAIR": [4, 25],
  "ESCAPEB": [4, 16],
  "ESCAPEF": [2, 17],
  "ESCAPEN": [2, 14],
  "DOWNSTANDN": [1, 23],
  "DOWNSTANDB": [1, 20],
  "DOWNSTANDF": [1, 18],
  "TECHN": [1, 20],
  "TECHB": [1, 20],
  "TECHF": [1, 20]
});
setFrames(CHARIDS.PUFF_ID, {
  "WAIT": 464,
  "DASH": 23,
  "RUN": 16,
  "RUNBRAKE": 19,
  "RUNTURN": 25,
  "WALK": 45,
  "JUMPF": 52,
  "JUMPB": 52,
  "FALL": 8,
  "FALLAERIAL": 8,
  "FALLSPECIAL": 8,
  "SQUAT": 7,
  "SQUATWAIT": 40,
  "SQUATRV": 10,
  "JUMPAERIALF": 50,
  "JUMPAERIALB": 50,
  "PASS": 30,
  "GUARDON": 8,
  "GUARDOFF": 14,
  "CLIFFCATCH": 7,
  "CLIFFWAIT": 60,
  "DAMAGEFLYN": 60,
  "DAMAGEFALL": 30,
  "DAMAGEN2": 11,
  "LANDINGATTACKAIRF": 20,
  "LANDINGATTACKAIRB": 20,
  "LANDINGATTACKAIRU": 20,
  "LANDINGATTACKAIRD": 30,
  "LANDINGATTACKAIRN": 20,
  "ESCAPEB": 34,
  "ESCAPEF": 34,
  "ESCAPEN": 27,
  "DOWNBOUND": 26,
  "DOWNWAIT": 59,
  "DOWNSTANDN": 30,
  "DOWNSTANDB": 35,
  "DOWNSTANDF": 35,
  "TECHN": 26,
  "TECHB": 40,
  "TECHF": 40,
  "SHIELDBREAKFALL": 27,
  "SHIELDBREAKDOWNBOUND": 26,
  "SHIELDBREAKSTAND": 30,
  "FURAFURA": 100,
  "CAPTUREWAIT": 130,
  "CATCHWAIT": 30,
  "CAPTURECUT": 30,
  "CATCHCUT": 29,
  "CAPTUREDAMAGE": 20,
  "WALLDAMAGE": 31,
  "WALLTECH": 31,
  "WALLJUMP": 40,
  "OTTOTTO": 12,
  "OTTOTTOWAIT": 63,
  "THROWNMARTHUP": 7,
  "THROWNMARTHBACK": 4,
  "THROWNMARTHFORWARD": 8,
  "THROWNMARTHDOWN": 8,
  "THROWNPUFFUP": 4,
  "THROWNPUFFBACK": 14,
  "THROWNPUFFFORWARD": 9,
  "THROWNPUFFDOWN": 60,
  "THROWNFOXUP": 4,
  "THROWNFOXBACK": 5,
  "THROWNFOXFORWARD": 10,
  "THROWNFOXDOWN": 32,
  "THROWNFALCOUP": 4,
  "THROWNFALCOBACK": 5,
  "THROWNFALCOFORWARD": 6,
  "THROWNFALCODOWN": 19,
  "THROWNFALCONUP": 14,
  "THROWNFALCONBACK": 19,
  "THROWNFALCONFORWARD": 17,
  "THROWNFALCONDOWN": 11,
  "FURASLEEPSTART": 33,
  "FURASLEEPLOOP": 76,
  "FURASLEEPEND": 76,
  "STOPCEIL": 8,
  "TECHU": 25,
  "REBOUND": 16
});
setOffsets(CHARIDS.PUFF_ID, {
  fair1: {
    id0: [new Vec2D(6.14, 3.93), new Vec2D(9.40, 3.66)],
    id1: [new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84)]
  },
  fair2: {
    id0: [new Vec2D(9.03, 3.69), new Vec2D(8.30, 3.66), new Vec2D(8.42, 3.66), new Vec2D(8.30, 3.74), new Vec2D(8.04, 3.78), new Vec2D(7.75, 3.84), new Vec2D(7.55, 3.81), new Vec2D(7.42, 3.66), new Vec2D(7.26, 3.48), new Vec2D(7.07, 3.28), new Vec2D(6.86, 3.11), new Vec2D(6.63, 2.94), new Vec2D(6.37, 2.86), new Vec2D(6.11, 2.78)],
    id1: [new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84), new Vec2D(1.84, 1.84)]
  },
  nair1: {
    id0: [new Vec2D(0.50, 4.03), new Vec2D(0.50, 4.03)],
    id1: [new Vec2D(8.63, 1.75), new Vec2D(7.83, 1.89)]
  },
  nair2: {
    id0: [new Vec2D(0.50, 4.03), new Vec2D(0.50, 4.03), new Vec2D(0.49, 4.03), new Vec2D(0.49, 4.03), new Vec2D(0.48, 4.03), new Vec2D(0.48, 4.04), new Vec2D(0.47, 4.04), new Vec2D(0.47, 4.04), new Vec2D(0.46, 4.04), new Vec2D(0.46, 4.04), new Vec2D(0.45, 4.04), new Vec2D(0.45, 4.04), new Vec2D(0.44, 4.04), new Vec2D(0.44, 4.04), new Vec2D(0.44, 4.04), new Vec2D(0.44, 4.04), new Vec2D(0.44, 4.04), new Vec2D(0.45, 4.04), new Vec2D(0.45, 4.04), new Vec2D(0.46, 4.04), new Vec2D(0.47, 4.04)],
    id1: [new Vec2D(6.90, 1.88), new Vec2D(6.88, 1.85), new Vec2D(6.89, 1.90), new Vec2D(6.93, 2.02), new Vec2D(6.93, 1.99), new Vec2D(6.96, 2.02), new Vec2D(6.99, 2.05), new Vec2D(7.04, 2.15), new Vec2D(7.07, 2.17), new Vec2D(7.10, 2.17), new Vec2D(7.12, 2.17), new Vec2D(7.12, 2.09), new Vec2D(7.14, 2.09), new Vec2D(7.18, 2.15), new Vec2D(7.18, 2.14), new Vec2D(7.16, 2.05), new Vec2D(7.15, 2.02), new Vec2D(7.14, 2.06), new Vec2D(7.10, 2.01), new Vec2D(7.02, 1.88), new Vec2D(6.94, 1.81)]
  },
  dair: {
    id0: [new Vec2D(3.13, -2.20), new Vec2D(3.13, -2.20)],
    id1: [new Vec2D(1.88, 0), new Vec2D(1.88, 0)],
    id2: [new Vec2D(3.13, -2.20), new Vec2D(3.13, -2.20)],
    id3: [new Vec2D(1.88, 0), new Vec2D(1.88, 0)]
  },
  bair: {
    id0: [new Vec2D(-9.47, 2.84), new Vec2D(-14.59, 3.60), new Vec2D(-12.72, 3.79), new Vec2D(-9.58, 3.51)],
    id1: [new Vec2D(-6.29, 3.09), new Vec2D(-8.01, 3.59), new Vec2D(-7.08, 3.69), new Vec2D(-5.56, 3.56)],
    id2: [new Vec2D(-4.20, 3.31), new Vec2D(-4.28, 3.73), new Vec2D(-3.99, 3.80), new Vec2D(-3.47, 3.74)]
  },
  upair: {
    id0: [new Vec2D(-3.89, 10.98), new Vec2D(0.21, 13.08), new Vec2D(1.52, 12.73), new Vec2D(2.67, 12.23)]
  },
  sidespecial: {
    id0: [new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77), new Vec2D(3.68, 4.77)],
    id1: [new Vec2D(12.3, 1.92), new Vec2D(9.97, 2.68), new Vec2D(7.34, 3.57), new Vec2D(7.49, 3.31), new Vec2D(8.28, 2.85), new Vec2D(8.18, 2.95), new Vec2D(8.18, 3.00), new Vec2D(8.19, 3.09), new Vec2D(8.21, 3.21), new Vec2D(8.23, 3.33), new Vec2D(8.25, 3.44), new Vec2D(8.27, 3.59), new Vec2D(8.31, 3.73), new Vec2D(8.3, 3.83), new Vec2D(8.29, 3.91), new Vec2D(8.31, 4.03)]
  },
  fsmash1: {
    id0: [new Vec2D(3.43, 6.16), new Vec2D(3.4, 6.32), new Vec2D(3.36, 6.44), new Vec2D(3.33, 6.54)],
    id1: [new Vec2D(7.75, 6.61), new Vec2D(7.84, 6.69), new Vec2D(7.88, 6.67), new Vec2D(7.9, 6.68)]
  },
  fsmash2: {
    id0: [new Vec2D(3.3, 6.61), new Vec2D(3.3, 6.60), new Vec2D(3.3, 6.55), new Vec2D(3.3, 6.47), new Vec2D(3.32, 6.31)],
    id1: [new Vec2D(7.89, 6.72), new Vec2D(7.86, 6.60), new Vec2D(7.81, 6.52), new Vec2D(7.74, 6.48), new Vec2D(7.68, 6.29)]
  },
  dsmash: {
    id0: [new Vec2D(-9.24, 0.88), new Vec2D(-8.79, 1.03)],
    id1: [new Vec2D(9.51, 0.69), new Vec2D(9.08, 0.74)],
    id2: [new Vec2D(-3.71, 1.66), new Vec2D(-3.59, 1.39)],
    id3: [new Vec2D(3.97, 1.46), new Vec2D(3.90, 1.28)]
  },
  upsmash: {
    id0: [new Vec2D(-5.95, 10.98), new Vec2D(-0.33, 14.92), new Vec2D(2.75, 12.00), new Vec2D(4.02, 7.87)],
    id1: [new Vec2D(-7.19, 10.20), new Vec2D(-1.64, 15.18), new Vec2D(1.87, 12.54), new Vec2D(3.58, 9.02)]
  },
  jab1: {
    id0: [new Vec2D(4.56, 4.85), new Vec2D(4.97, 4.77)],
    id1: [new Vec2D(8.10, 4.80), new Vec2D(8.20, 4.66)],
    id2: [new Vec2D(11.64, 4.75), new Vec2D(11.43, 4.55)]
  },
  jab2: {
    id0: [new Vec2D(4.88, 4.00), new Vec2D(5.00, 3.90)],
    id1: [new Vec2D(8.84, 4.09), new Vec2D(8.56, 3.94)],
    id2: [new Vec2D(12.80, 4.18), new Vec2D(12.13, 3.98)]
  },
  dtilt: {
    id0: [new Vec2D(13.60, 3.31), new Vec2D(16.01, 4.28), new Vec2D(15.76, 4.49)],
    id1: [new Vec2D(9.31, 3.46), new Vec2D(10.72, 4.21), new Vec2D(10.64, 4.36)],
    id2: [new Vec2D(5.73, 3.67), new Vec2D(6.20, 4.25), new Vec2D(6.25, 4.34)]
  },
  uptilt1: {
    id0: [new Vec2D(-1.40, 2.87), new Vec2D(-4.40, 6.63)],
    id1: [new Vec2D(-0.32, 0.53), new Vec2D(-7.45, 9.39)]
  },
  uptilt2: {
    id0: [new Vec2D(-2.22, 10.56), new Vec2D(-1.44, 11.15), new Vec2D(-1.11, 11.32), new Vec2D(-1.31, 11.21), new Vec2D(-1.69, 10.95)],
    id1: [new Vec2D(-0.61, 15.97), new Vec2D(1.07, 16.19), new Vec2D(1.84, 16.13), new Vec2D(1.53, 16.00), new Vec2D(0.89, 15.79)]
  },
  ftilt: {
    id0: [new Vec2D(3.19, 3.01), new Vec2D(5.79, 4.39), new Vec2D(5.13, 4.62), new Vec2D(3.34, 4.70)],
    id1: [new Vec2D(7.60, 3.46), new Vec2D(11.12, 4.57), new Vec2D(9.89, 4.64), new Vec2D(6.52, 4.68)]
  },
  dashattack1: {
    id0: [new Vec2D(4.63, 8.73), new Vec2D(4.9, 8.49), new Vec2D(4.88, 8.47), new Vec2D(4.86, 8.47), new Vec2D(4.85, 8.46)]
  },
  dashattack2: {
    id0: [new Vec2D(4.84, 8.46), new Vec2D(4.84, 8.43), new Vec2D(4.85, 8.38), new Vec2D(4.86, 8.30), new Vec2D(4.86, 8.17), new Vec2D(4.87, 7.99)]
  },
  downspecial: {
    id0: [new Vec2D(0.13, 5.26)]
  },
  upspecial: {
    id0: [new Vec2D(0, 5.3)]
  },
  grab: {
    id0: [new Vec2D(10.28, 4.77), new Vec2D(10.28, 4.77)],
    id1: [new Vec2D(4.77, 4.77), new Vec2D(4.77, 4.77)]
  },
  downattack1: {
    id0: [new Vec2D(-12.01, 2.37), new Vec2D(-14.19, 2.83)],
    id1: [new Vec2D(-5.72, 3.29), new Vec2D(-6.78, 4.03)],
    id2: [new Vec2D(-1.74, 1.75), new Vec2D(-1.87, 2.05)],
    id3: [new Vec2D(-2.12, 5.46), new Vec2D(-2.82, 6.01)]
  },
  downattack2: {
    id0: [new Vec2D(13.03, 3.30), new Vec2D(14.14, 2.60)],
    id1: [new Vec2D(6.22, 4.52), new Vec2D(6.79, 4.06)],
    id2: [new Vec2D(2.69, 2.08), new Vec2D(1.94, 1.96)],
    id3: [new Vec2D(2.68, 6.15), new Vec2D(2.82, 6.01)]
  },
  pummel: {
    id0: [new Vec2D(11.75, 5.51), new Vec2D(11.75, 5.51)]
  },
  downspecial: {
    id0: [new Vec2D(0.13, 5.26)]
  },
  ledgegetupquick: {
    id0: [new Vec2D(-2.47, 12.50), new Vec2D(-0.64, 12.50), new Vec2D(1.55, 11.52), new Vec2D(4.26, 7.79), new Vec2D(4.38, 5.19)],
    id1: [new Vec2D(-6.33, 13.25), new Vec2D(-4.15, 14.24), new Vec2D(-1.26, 15.56), new Vec2D(7.7, 12.57), new Vec2D(10.08, 6.71)]
  },
  ledgegetupslow: {
    id0: [new Vec2D(-7.04, 1.55), new Vec2D(-7.36, 1.24), new Vec2D(-2.16, 1.09), new Vec2D(6.83, 0.88), new Vec2D(7.46, 0.73), new Vec2D(-6.02, 0.39), new Vec2D(-8.19, 0.34), new Vec2D(2.15, 0.45), new Vec2D(8.95, 0.61), new Vec2D(8.69, 0.80), new Vec2D(3.63, 0.98), new Vec2D(-2.32, 1.07), new Vec2D(-6.46, 1.10), new Vec2D(-8.36, 1.10), new Vec2D(-8.58, 1.08), new Vec2D(-7.87, 1.05), new Vec2D(-6.86, 0.99)],
    id1: [new Vec2D(7.29, 1.31), new Vec2D(5.08, 1.28), new Vec2D(0.56, 0.63), new Vec2D(-4.95, 0.98), new Vec2D(-8.56, 1.15), new Vec2D(4.87, 0.44), new Vec2D(8.96, 0.17), new Vec2D(-0.64, 0.19), new Vec2D(-8.21, 0.39), new Vec2D(-9.26, 0.64), new Vec2D(-5.23, 0.89), new Vec2D(0.31, 1.02), new Vec2D(4.83, 1.05), new Vec2D(7.34, 1.04), new Vec2D(8.18, 1.02), new Vec2D(7.95, 0.99), new Vec2D(7.22, 0.97)]
  },
  thrown: {
    id0: [new Vec2D(0, 12)]
  },
  throwdownextra: {
    id0: [new Vec2D(2.94, 3.67)]
  },
  throwforwardextra: {
    id0: [new Vec2D(1.41, 7.43)]
  },
  neutralspecialair: {
    id0: [new Vec2D(0, 5.14)]
  },
  neutralspecialground: {
    id0: [new Vec2D(0, 5.14)],
    id1: [new Vec2D(-3.67, 5.14)],
    id2: [new Vec2D(3.67, 5.14)]
  }
});
setHitBoxes(CHARIDS.PUFF_ID, {
  fair1: new createHitboxObject(new createHitbox(offsets[1].fair1.id0, 3.515, 12, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[1].fair1.id1, 4.687, 10, 361, 100, 10, 0, 0, 0, 1, 1)),
  fair2: new createHitboxObject(new createHitbox(offsets[1].fair2.id0, 3.515, 7, 361, 80, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[1].fair2.id1, 4.687, 7, 361, 80, 10, 0, 0, 0, 1, 1)),
  bair: new createHitboxObject(new createHitbox(offsets[1].bair.id0, 3.906, 12, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[1].bair.id1, 3.906, 12, 361, 100, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[1].bair.id2, 4.297, 12, 361, 100, 10, 0, 0, 0, 1, 1)),
  nair1: new createHitboxObject(new createHitbox(offsets[1].nair1.id0, 5.078, 12, 361, 70, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[1].nair1.id1, 3.906, 12, 361, 70, 10, 0, 0, 0, 1, 1)),
  nair2: new createHitboxObject(new createHitbox(offsets[1].nair2.id0, 4.687, 9, 361, 80, 10, 0, 0, 0, 1, 1), new createHitbox(offsets[1].nair2.id1, 3.515, 9, 361, 80, 10, 0, 0, 0, 1, 1)),
  dair: new createHitboxObject(new createHitbox(offsets[1].dair.id0, 5.078, 2, 270, 100, 20, 0, 0, 0, 1, 0), new createHitbox(offsets[1].dair.id1, 4.297, 2, 270, 100, 20, 0, 0, 0, 1, 0), new createHitbox(offsets[1].dair.id2, 5.078, 2, 30, 100, 10, 0, 0, 0, 0, 1), new createHitbox(offsets[1].dair.id3, 4.297, 2, 30, 100, 10, 0, 0, 0, 0, 1)),
  upair: new createHitboxObject(new createHitbox(offsets[1].upair.id0, 5.468, 12, 90, 100, 30, 0, 0, 0, 1, 1)),
  upb: new createHitboxObject(new createHitbox(offsets[1].upspecial.id0, 10.937, 0, 361, 100, 0, 0, 5, 0, 1, 0)),
  dtilt: new createHitboxObject(new createHitbox(offsets[1].dtilt.id0, 3.515, 10, 20, 30, 40, 0, 0, 1, 1, 1), new createHitbox(offsets[1].dtilt.id1, 3.515, 10, 20, 30, 40, 0, 0, 1, 1, 1), new createHitbox(offsets[1].dtilt.id2, 3.906, 10, 20, 30, 40, 0, 0, 1, 1, 1)),
  uptilt1: new createHitboxObject(new createHitbox(offsets[1].uptilt1.id0, 3.125, 9, 96, 120, 40, 0, 0, 1, 1, 1), new createHitbox(offsets[1].uptilt1.id1, 4.297, 9, 96, 120, 40, 0, 0, 1, 1, 1)),
  uptilt2: new createHitboxObject(new createHitbox(offsets[1].uptilt2.id0, 3.125, 8, 88, 120, 40, 0, 0, 1, 1, 1), new createHitbox(offsets[1].uptilt2.id1, 3.515, 8, 88, 120, 40, 0, 0, 1, 1, 1)),
  ftilt: new createHitboxObject(new createHitbox(offsets[1].ftilt.id0, 2.734, 10, 361, 100, 8, 0, 0, 1, 1, 1), new createHitbox(offsets[1].ftilt.id1, 3.125, 10, 361, 100, 8, 0, 0, 1, 1, 1)),
  dashattack1: new createHitboxObject(new createHitbox(offsets[1].dashattack1.id0, 4.687, 12, 361, 100, 16, 0, 0, 1, 1, 1)),
  dashattack2: new createHitboxObject(new createHitbox(offsets[1].dashattack2.id0, 4.687, 8, 361, 100, 8, 0, 0, 1, 1, 1)),
  jab1: new createHitboxObject(new createHitbox(offsets[1].jab1.id0, 3.515, 3, 361, 50, 8, 0, 0, 1, 1, 1), new createHitbox(offsets[1].jab1.id1, 3.515, 3, 361, 50, 8, 0, 0, 1, 1, 1), new createHitbox(offsets[1].jab1.id2, 3.515, 3, 361, 50, 8, 0, 0, 1, 1, 1)),
  jab2: new createHitboxObject(new createHitbox(offsets[1].jab2.id0, 3.515, 3, 361, 50, 16, 0, 0, 1, 1, 1), new createHitbox(offsets[1].jab2.id1, 3.515, 3, 361, 50, 16, 0, 0, 1, 1, 1), new createHitbox(offsets[1].jab2.id2, 3.515, 3, 361, 50, 16, 0, 0, 1, 1, 1)),
  sidespecial: new createHitboxObject(new createHitbox(offsets[1].sidespecial.id0, 3.515, 13, 90, 75, 52, 0, 0, 0, 1, 1), new createHitbox(offsets[1].sidespecial.id1, 3.515, 13, 120, 75, 52, 0, 0, 0, 1, 1)),
  fsmash1: new createHitboxObject(new createHitbox(offsets[1].fsmash1.id0, 4.297, 17, 361, 118, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[1].fsmash1.id1, 4.297, 17, 361, 118, 10, 0, 0, 1, 1, 1)),
  fsmash2: new createHitboxObject(new createHitbox(offsets[1].fsmash2.id0, 3.515, 13, 361, 105, 6, 0, 0, 1, 1, 1), new createHitbox(offsets[1].fsmash2.id1, 3.515, 13, 361, 105, 6, 0, 0, 1, 1, 1)),
  upsmash: new createHitboxObject(new createHitbox(offsets[1].upsmash.id0, 5.859, 14, 90, 110, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[1].upsmash.id1, 3.906, 14, 90, 110, 20, 0, 0, 1, 1, 1)),
  dsmash: new createHitboxObject(new createHitbox(offsets[1].dsmash.id0, 3.906, 12, 0, 66, 34, 0, 0, 1, 1, 1), new createHitbox(offsets[1].dsmash.id1, 3.906, 12, 0, 66, 34, 0, 0, 1, 1, 1), new createHitbox(offsets[1].dsmash.id2, 4.687, 12, 0, 66, 34, 0, 0, 1, 1, 1), new createHitbox(offsets[1].dsmash.id3, 4.687, 12, 0, 66, 34, 0, 0, 1, 1, 1)),
  grab: new createHitboxObject(new createHitbox(offsets[1].grab.id0, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1), new createHitbox(offsets[1].grab.id1, 3.125, 0, 361, 100, 0, 0, 2, 3, 1, 1)),
  downattack1: new createHitboxObject(new createHitbox(offsets[1].downattack1.id0, 4.687, 8, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[1].downattack1.id1, 2.344, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[1].downattack1.id2, 2.344, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[1].downattack1.id3, 2.344, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  downattack2: new createHitboxObject(new createHitbox(offsets[1].downattack2.id0, 4.687, 8, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[1].downattack2.id1, 2.344, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[1].downattack2.id2, 2.344, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[1].downattack2.id3, 2.344, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  downspecial: new createHitboxObject(new createHitbox(offsets[1].downspecial.id0, 1.953, 28, 361, 120, 78, 0, 3, 0, 1, 1)),
  ledgegetupquick: new createHitboxObject(new createHitbox(offsets[1].ledgegetupquick.id0, 3.906, 6, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[1].ledgegetupquick.id1, 4.687, 6, 361, 100, 0, 90, 0, 1, 1, 1)),
  ledgegetupslow: new createHitboxObject(new createHitbox(offsets[1].ledgegetupslow.id0, 5.859, 6, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[1].ledgegetupslow.id1, 5.859, 6, 361, 100, 0, 90, 0, 1, 1, 1)),
  neutralspecialground: new createHitboxObject(new createHitbox(offsets[1].neutralspecialground.id0, 1.953, 10, 20, 120, 30, 0, 0, 0, 1, 1), new createHitbox(offsets[1].neutralspecialground.id1, 2.734, 10, 20, 120, 30, 0, 0, 0, 1, 1), new createHitbox(offsets[1].neutralspecialground.id2, 2.734, 10, 20, 120, 30, 0, 0, 0, 1, 1)),
  neutralspecialair: new createHitboxObject(new createHitbox(offsets[1].neutralspecialair.id0, 1.953, 10, 90, 102, 30, 0, 0, 0, 1, 1)),
  pummel: new createHitboxObject(new createHitbox(offsets[1].pummel.id0, 4.687, 3, 361, 100, 0, 30, 0, 0, 1, 1)),
  throwup: new createHitboxObject(new createHitbox(new Vec2D(-4.44533, 0.66545), 0, 11, 90, 25, 130, 0, 0, 0, 1, 1)),
  throwdown: new createHitboxObject(new createHitbox(new Vec2D(0.56941, 0), 0, 2, 80, 45, 100, 0, 0, 0, 1, 1)),
  throwdownextra: new createHitboxObject(new createHitbox(offsets[1].throwdownextra.id0, 3.515, 1, 361, 100, 0, 30, 0, 0, 1, 1, true)),
  throwback: new createHitboxObject(new createHitbox(new Vec2D(-6.68273, 0), 0, 10, 135, 25, 90, 0, 0, 0, 1, 1)),
  throwforward: new createHitboxObject(new createHitbox(new Vec2D(10.8537, 0.01), 0, 5, 55, 30, 100, 0, 0, 0, 1, 1)),
  throwforwardextra: new createHitboxObject(new createHitbox(offsets[1].throwforwardextra.id0, 8.593, 7, 361, 110, 40, 0, 0, 0, 1, 1, true)),
  thrown: new createHitboxObject(new createHitbox(offsets[1].thrown.id0, 3.906, 4, 361, 50, 20, 0, 1, 0, 1, 1))
});
for (let l = 0; l < 20; l++) {
  offsets[1].thrown.id0.push(new Vec2D(0, 12));
}
setChars(CHARIDS.PUFF_ID, new charObject(CHARIDS.PUFF_ID));


// ---- characters/puff/puffMultiJumpDrift.js ----
function puffMultiJumpDrift(p, input) {
  const pl = player[p];
  let tempMax;
  if (Math.abs(input[p][0].lsX) < 0.3) {
    tempMax = 0;
  } else {
    tempMax = 1.08 * input[p][0].lsX;
  }
  if (tempMax < 0 && pl.phys.cVel.x < tempMax || tempMax > 0 && pl.phys.cVel.x > tempMax) {
    if (pl.phys.cVel.x > 0) {
      pl.phys.cVel.x -= pl.charAttributes.airFriction;
      if (pl.phys.cVel.x < 0) {
        pl.phys.cVel.x = 0;
      }
    } else {
      pl.phys.cVel.x += pl.charAttributes.airFriction;
      if (pl.phys.cVel.x > 0) {
        pl.phys.cVel.x = 0;
      }
    }
  } else if (Math.abs(input[p][0].lsX) > 0.3 && (tempMax < 0 && pl.phys.cVel.x > tempMax || tempMax > 0 && pl.phys.cVel.x < tempMax)) {
    pl.phys.cVel.x += 0.072 * input[p][0].lsX;
  }
  if (Math.abs(input[p][0].lsX) < 0.3) {
    if (pl.phys.cVel.x > 0) {
      pl.phys.cVel.x -= pl.charAttributes.airFriction;
      if (pl.phys.cVel.x < 0) {
        pl.phys.cVel.x = 0;
      }
    } else {
      pl.phys.cVel.x += pl.charAttributes.airFriction;
      if (pl.phys.cVel.x > 0) {
        pl.phys.cVel.x = 0;
      }
    }
  }
}


// ---- characters/puff/puffNextJump.js ----
function puffNextJump(p, input) {
  const pl = player[p];
  if (Math.abs(input[p][0].lsX) > 0.3 && Math.sign(input[p][0].lsX) !== pl.phys.face) {
    M["AERIALTURN" + (1 + pl.phys.jumpsUsed)].init(p, input);
  } else {
    M["JUMPAERIAL" + (1 + pl.phys.jumpsUsed)].init(p, input);
  }
}


/** The character's own action states (shared ones come from shared.js). */
export const M = {};

M.AERIALTURN1 = {
  name: "AERIALTURN1",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "AERIALTURN1";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.cVel.y = 1.65;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.AERIALTURN1.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer === 13) {
      pl.timer--;
      pl.actionState = "JUMPAERIAL1";
      M.JUMPAERIAL1.main(p, input);
    } else {
      if (!M.AERIALTURN1.interrupt(p, input)) {
        fastfall(p, input);
        puffMultiJumpDrift(p, input);
        if (pl.timer === 6) {
          pl.phys.face *= -1;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.AERIALTURN2 = {
  name: "AERIALTURN2",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "AERIALTURN2";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.59;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.AERIALTURN2.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer === 13) {
      pl.timer--;
      pl.actionState = "JUMPAERIAL2";
      M.JUMPAERIAL2.main(p, input);
    } else {
      if (!M.AERIALTURN2.interrupt(p, input)) {
        fastfall(p, input);
        puffMultiJumpDrift(p, input);
        if (pl.timer === 6) {
          pl.phys.face *= -1;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.AERIALTURN3 = {
  name: "AERIALTURN3",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "AERIALTURN3";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.47;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.AERIALTURN3.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer === 13) {
      pl.timer--;
      pl.actionState = "JUMPAERIAL3";
      M.JUMPAERIAL3.main(p, input);
    } else {
      if (!M.AERIALTURN3.interrupt(p, input)) {
        fastfall(p, input);
        puffMultiJumpDrift(p, input);
        if (pl.timer === 6) {
          pl.phys.face *= -1;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.AERIALTURN4 = {
  name: "AERIALTURN4",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "AERIALTURN4";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.36;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.AERIALTURN4.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer === 13) {
      pl.timer--;
      pl.actionState = "JUMPAERIAL4";
      M.JUMPAERIAL4.main(p, input);
    } else {
      if (!M.AERIALTURN4.interrupt(p, input)) {
        fastfall(p, input);
        puffMultiJumpDrift(p, input);
        if (pl.timer === 6) {
          pl.phys.face *= -1;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.AERIALTURN5 = {
  name: "AERIALTURN5",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "AERIALTURN5";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.25;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.AERIALTURN5.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer === 13) {
      pl.timer--;
      pl.actionState = "JUMPAERIAL5";
      M.JUMPAERIAL5.main(p, input);
    } else {
      if (!M.AERIALTURN5.interrupt(p, input)) {
        fastfall(p, input);
        puffMultiJumpDrift(p, input);
        if (pl.timer === 6) {
          pl.phys.face *= -1;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else {
      return false;
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
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.bair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.bair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.bair.id2;
    M.ATTACKAIRB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRB.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 8) {
        pl.phys.autocancel = false;
      }
      if (pl.timer === 9) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 9 && pl.timer < 13) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 13) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 26) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      S.FALL.init(p, input);
      return true;
    } else if (pl.timer > 30) {
      const a = checkForAerials(p, input);
      if (checkForMultiJump(p, input) && pl.phys.jumpsUsed < 5) {
        M.JUMPAERIALF.init(p, input);
        return true;
      } else if (a[0]) {
        M[a[1]].init(p, input);
        return true;
      } else {
        return false;
      }
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
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dair.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dair.id3;
    M.ATTACKAIRD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRD.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 4) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 4 && pl.timer < 29) {
        switch (pl.timer % 3) {
          case 2:
            pl.hitboxes.active = [true, true, true, true];
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
      if (pl.timer === 40) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 49) {
      S.FALL.init(p, input);
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
    pl.hitboxes.id[0] = pl.charHitboxes.fair1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fair1.id1;
    turnOffHitboxes(p);
    M.ATTACKAIRF.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRF.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 8) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.fair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fair2.id1;
      }
      if (pl.timer > 9 && pl.timer < 23) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 23) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 35) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      S.FALL.init(p, input);
      return true;
    } else if (pl.timer > 34) {
      const a = checkForAerials(p, input);
      if (checkForMultiJump(p, input) && pl.phys.jumpsUsed < 5) {
        M.JUMPAERIALF.init(p, input);
        return true;
      } else if (a[0]) {
        M[a[1]].init(p, input);
        return true;
      } else {
        return false;
      }
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
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.nair1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.nair1.id1;
    M.ATTACKAIRN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRN.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 5) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 7) {
        pl.hitboxes.frames++;
      }
      if (pl.timer === 8) {
        pl.hitboxes.id[0] = pl.charHitboxes.nair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.nair2.id1;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 8 && pl.timer < 29) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 29) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 30) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 49) {
      S.FALL.init(p, input);
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
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.upair.id0;
    M.ATTACKAIRU.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRU.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 9) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 9 && pl.timer < 13) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 13) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 38) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      S.FALL.init(p, input);
      return true;
    } else if (pl.timer > 37) {
      const a = checkForAerials(p, input);
      if (checkForMultiJump(p, input) && pl.phys.jumpsUsed < 5) {
        M.JUMPAERIALF.init(p, input);
        return true;
      } else if (a[0]) {
        M[a[1]].init(p, input);
        return true;
      } else {
        return false;
      }
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
    M.ATTACKDASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKDASH.interrupt(p, input)) {
      pl.phys.cVel.x = M.ATTACKDASH.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 15) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        pl.hitboxes.id[0] = pl.charHitboxes.dashattack2.id0;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 15) {
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
    } else if (pl.timer > 38) {
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
    M.CATCHATTACK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CATCHATTACK.interrupt(p, input)) {
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
    if (player[p].timer > 30) {
      S.CATCHWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFATTACKQUICK = {
  name: "CLIFFATTACKQUICK",
  offset: [[-73.32, -8.97], [-73.81, -7.87], [-74.29, -6.36], [-74.51, -4.70], [-74.44, -2.88], [-74.22, -0.88], [-73.87, 1.08], [-73.40, 2.76], [-72.81, 3.94], [-72.11, 4.39], [-71.31, 3.70], [-70.42, 2.19], [-69.45, 0.69], [-67.35, 0]],
  setVelocities: [1.16, 1.27, 1.29, 1.24, 1.1, 0.89, 0.59, 0.21, -0.18, -0.34, -0.18, 0],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFATTACKQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 15;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.ledgegetupquick.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.ledgegetupquick.id1;
    M.CLIFFATTACKQUICK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFATTACKQUICK.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 15) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFATTACKQUICK.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFATTACKQUICK.offset[pl.timer - 1][1]);
      } else if (pl.timer < 27) {
        pl.phys.cVel.x = M.CLIFFATTACKQUICK.setVelocities[pl.timer - 15] * pl.phys.face;
      }
      if (pl.timer === 15) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 19) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 19 && pl.timer < 24) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 24) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 55) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.CLIFFATTACKSLOW = {
  name: "CLIFFATTACKSLOW",
  offset: [[-73.10, -9.44], [-73.10, -9.56], [-73.10, -9.71], [-73.09, -9.87], [-73.09, -10.01], [-73.09, -10.12], [-73.09, -10.19], [-73.09, -10.23], [-73.09, -10.24], [-73.09, -10.21], [-73.09, -10.14], [-73.09, -10.04], [-73.09, -9.94], [-73.09, -9.89], [-73.09, -9.87], [-73.09, -9.87], [-73.09, -9.87], [-73.09, -9.63], [-73.09, -9.04], [-73.09, -8.28], [-73.09, -7.52], [-73.09, -6.76], [-73.09, -5.93], [-73.09, -5.07], [-73.09, -4.23], [-72.76, -3.35], [-71.98, -2.44], [-71.05, -1.60], [-70.28, -0.94], [-69.72, -0.50], [-69.22, -0.21], [-68.78, -0.05], [-68.02, 0]],
  setVelocities: [0.34, 0.34, 0.35, 0.38, 0.43, 0.50, 0.59, 0.69, 1.86, 2.03, 1.09, 1.02, 0.85, 0.58, 0.22, -0.07, -0.20, -0.31, -0.40, -0.47, -0.53, -0.57, -0.59, -0.59, -0.58, -0.55, -0.50, -0.43, -0.35, -0.25, -0.16, -0.09, -0.03, 0.002, 0.02, 0.03],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFATTACKSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 39;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.ledgegetupslow.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.ledgegetupslow.id1;
    M.CLIFFATTACKSLOW.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFATTACKSLOW.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 34) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFATTACKSLOW.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFATTACKSLOW.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = M.CLIFFATTACKSLOW.setVelocities[pl.timer - 34] * pl.phys.face;
      }
      if (pl.timer === 33) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 43) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 43 && pl.timer < 60) {
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

M.CLIFFESCAPEQUICK = {
  name: "CLIFFESCAPEQUICK",
  offset: [[-74.04, -8.78], [-74.48, -7.21], [-74.42, -5.16], [-74.24, -3.09], [-73.97, -1.28], [-73.59, 0.24], [-73.14, 1.46], [-72.61, 2.35], [-72.01, 2.87], [-71.36, 3.00], [-70.66, 2.72], [-69.93, 1.80], [-69.17, 0.60], [-67.63, 0]],
  setVelocities: [0.64, 0.40, 0.21, 0.08, -0.003, -0.03, 0.002, 0.09, 0.23, 0.42, 0.67, 0.97, 1.27, 1.52, 1.76, 1.99, 2.21, 2.42, 2.62, 2.81, 2.99, 3.16, 3.32, 3.48, 0.12, 0.33, 0.49, 0.59, 0.65, 0.65, 0.60, 0.49, 0.34, 0.13, 0.002],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPEQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 28;
    M.CLIFFESCAPEQUICK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFESCAPEQUICK.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 15) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFESCAPEQUICK.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFESCAPEQUICK.offset[pl.timer - 1][1]);
      } else if (pl.timer < 50) {
        pl.phys.cVel.x = M.CLIFFESCAPEQUICK.setVelocities[pl.timer - 15] * pl.phys.face;
      }
      if (pl.timer === 15) {
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
  offset: [[-73.10, -9.44], [-73.09, -9.56], [-73.09, -9.71], [-73.09, -9.87], [-73.09, -10.01], [-73.09, -10.12], [-73.09, -10.19], [-73.09, -10.23], [-73.09, -10.24], [-73.09, -10.21], [-73.09, -10.14], [-73.09, -10.04], [-73.09, -9.94], [-73.09, -9.89], [-73.09, -9.87], [-73.09, -9.87], [-73.09, -9.87], [-73.09, -9.63], [-73.09, -9.04], [-73.09, -8.28], [-73.09, -7.52], [-73.09, -6.76], [-73.09, -5.93], [-73.09, -5.07], [-73.09, -4.23], [-72.78, -3.37], [-72.02, -2.48], [-71.10, -1.64], [-70.28, -0.94], [-69.52, -0.43], [-68.80, -0.11], [-68, 0]],
  setVelocities: [0.63, 1.31, 1.52, 1.24, 0.96, 1.01, 1.05, 1.08, 1.11, 1.14, 1.16, 1.18, 1.20, 1.21, 1.22, 1.22, 1.22, 1.21, 1.20, 1.19, 1.17, 1.15, 1.12, 1.09, 1.06, 1.02, 0.98, 0.93, 0.88, 0.82, 0.77, 0.70, 0.63, 0.56, 0.49, 0.41, 0.32, 0.24, 0.15, 0.05, 0],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPESLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 53;
    M.CLIFFESCAPESLOW.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFESCAPESLOW.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 33) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFESCAPESLOW.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFESCAPESLOW.offset[pl.timer - 1][1]);
      } else if (pl.timer < 74) {
        pl.phys.cVel.x = M.CLIFFESCAPESLOW.setVelocities[pl.timer - 33] * pl.phys.face;
      }
      if (pl.timer === 32) {
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

M.CLIFFGETUPQUICK = {
  name: "CLIFFGETUPQUICK",
  canBeGrabbed: true,
  offset: [[-73.32063, -8.97483], [-73.806, -7.875], [-74.29, -6.36], [-74.51, -4.7], [-74.39, -2.91], [-74.06, -1.07], [-73.57, 0.48], [-72.954, 1.81], [-72.24, 3.06], [-71.46, 3.99], [-70.68, 4.36], [-69.75, 3.23], [-68.82, 1.13], [-67.98, 0], [-67.93, 0], [-67.77, 0], [-67.54, 0], [-67.25, 0], [-66.92, 0], [-66.57, 0], [-66.22, 0], [-65.89, 0], [-65.6, 0], [-65.37, 0], [-65.22, 0], [-65.16, 0], [-65.16, 0], [-65.16, 0], [-65.16, 0], [-65.16, 0], [-65.16, 0], [-65.16, 0], [-65.16, 0]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFGETUPQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 30;
    M.CLIFFGETUPQUICK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFGETUPQUICK.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 16) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFGETUPQUICK.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFGETUPQUICK.offset[pl.timer - 1][1]);
      } else {
        pl.phys.pos.x = x + (68.4 + M.CLIFFGETUPQUICK.offset[pl.timer - 1][0]) * pl.phys.face;
      }
      if (pl.timer === 16) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 32) {
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
  offset: [[-73.10, -9.44], [-73.10, -9.56], [-73.09, -9.71], [-73.09, -9.87], [-73.09, -10.01], [-73.09, -10.12], [-73.09, -10.19], [-73.09, -10.23], [-73.09, -10.24], [-73.09, -10.21], [-73.09, -10.14], [-73.09, -10.04], [-73.09, -9.94], [-73.09, -9.89], [-73.09, -9.87], [-73.09, -9.87], [-73.09, -9.87], [-73.09, -9.63], [-73.09, -9.04], [-73.09, -8.28], [-73.09, -7.52], [-73.09, -6.76], [-73.09, -5.93], [-73.09, -5.07], [-73.09, -4.23], [-72.76, -3.35], [-71.98, -2.44], [-71.05, -1.60], [-70.28, -0.94], [-69.68, -0.50], [-69.11, -0.21], [-68.66, -0.05], [-68.14, 0]],
  setVelocities: [0.12, 0.10, 0.08, 0.07, 0.06, 0.05, 0.05, 0.06, 0.07, 0.08, 0.09, 0.12, 0.16, 0.20, 0.23, 0.25, 0.25, 0.24, 0.21, 0.17, 0.12, 0.05, 0.004],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFGETUPSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 55;
    M.CLIFFGETUPSLOW.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFGETUPSLOW.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 34) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFGETUPSLOW.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFGETUPSLOW.offset[pl.timer - 1][1]);
      } else if (pl.timer < 57) {
        pl.phys.cVel.x = M.CLIFFGETUPSLOW.setVelocities[pl.timer - 34] * pl.phys.face;
      }
      if (pl.timer === 34) {
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

M.CLIFFJUMPQUICK = {
  name: "CLIFFJUMPQUICK",
  offset: [[-73.32, -8.97], [-73.81, -7.87], [-74.29, -6.36], [-74.51, -4.70], [-74.43, -2.80], [-74.13, -0.84], [-73.57, 0.48], [-72.72, 1.10], [-71.70, 1.48], [-70.62, 1.63], [-69.61, 1.60], [-68.82, 1.43], [-68.42, 0.95], [-68.36, 0.32]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 14;
    M.CLIFFJUMPQUICK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFJUMPQUICK.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 15) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFJUMPQUICK.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFJUMPQUICK.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 15) {
        pl.phys.cVel = new Vec2D(1.1 * pl.phys.face, 1.8);
      }
      if (pl.timer > 15) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 38) {
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
  offset: [[-73.10, -9.01], [-73.10, -8.03], [-73.09, -6.73], [-73.09, -5.37], [-73.09, -4.23], [-72.76, -3.29], [-71.98, -2.38], [-71.05, -1.58], [-70.28, -0.94], [-69.66, -0.50], [-69.05, -0.21], [-68.59, -0.05], [-68.4, 0], [-68.4, 0], [-68.4, 0], [-68.4, 0], [-68.4, 0]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 17;
    M.CLIFFJUMPSLOW.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.CLIFFJUMPSLOW.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        this.canGrabLedge = false;
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 18) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFJUMPSLOW.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFJUMPSLOW.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 18) {
        pl.phys.cVel = new Vec2D(1.1 * pl.phys.face, 1.8);
      }
      if (pl.timer > 18) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 38) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = false;
      S.FALL.init(p, input);
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
    pl.hitboxes.id[3] = pl.charHitboxes.downattack1.id3;
    M.DOWNATTACK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNATTACK.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 1) {
        pl.phys.intangibleTimer = 15;
      }
      if (pl.timer === 20) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 20 && pl.timer < 22) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 22) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 30) {
        pl.hitboxes.id[0] = pl.charHitboxes.downattack2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.downattack2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.downattack2.id2;
        pl.hitboxes.id[3] = pl.charHitboxes.downattack2.id3;
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 30 && pl.timer < 32) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 32) {
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
    M.DOWNSMASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 5) {
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
    if (!M.DOWNSMASH.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 9) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 9 && pl.timer < 11) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 11) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 54) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 47 && !pl.inCSS) {
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
    if (pl.phys.grounded) {
      if (pl.phys.cVel.x > 0) {
        pl.phys.cVel.x -= 0.1;
      }
      if (pl.phys.cVel.x < 0) {
        pl.phys.cVel.x += 0.1;
      }
    } else {
      pl.phys.fastfalled = false;
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
    }
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecial.id0;
    M.DOWNSPECIALAIR.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNSPECIALAIR.interrupt(p, input)) {
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
        pl.phys.cVel.y -= pl.charAttributes.gravity;
        if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
          pl.phys.cVel.y = -pl.charAttributes.terminalV;
        }
      }
      if (pl.timer === 1) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
        pl.phys.intangibleTimer = 26;
      }
      if (pl.timer === 2) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 10) {}
      if (pl.timer === 210) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 249) {
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
  land: function (p, input) {}
};

M.DOWNSPECIALGROUND = {
  name: "DOWNSPECIALGROUND",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUND";
    pl.timer = 0;
    if (pl.phys.grounded) {
      if (pl.phys.cVel.x > 0) {
        pl.phys.cVel.x -= 0.1;
      }
      if (pl.phys.cVel.x < 0) {
        pl.phys.cVel.x += 0.1;
      }
    } else {
      pl.phys.fastfalled = false;
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
    }
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecial.id0;
    M.DOWNSPECIALGROUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNSPECIALGROUND.interrupt(p, input)) {
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
        pl.phys.cVel.y -= pl.charAttributes.gravity;
        if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
          pl.phys.cVel.y = -pl.charAttributes.terminalV;
        }
      }
      if (pl.timer === 1) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
        pl.phys.intangibleTimer = 26;
      }
      if (pl.timer === 2) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 10) {}
      if (pl.timer === 210) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 249) {
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
  land: function (p, input) {}
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
    M.DOWNTILT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNTILT.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 10) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 10 && pl.timer < 13) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 13) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      S.SQUATWAIT.init(p, input);
      return true;
    } else if (pl.timer > 29) {
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

M.FORWARDSMASH = {
  name: "FORWARDSMASH",
  canEdgeCancel: false,
  canBeGrabbed: true,
  setVelocities: [0, 0, 0, 0, 0, 0.33572, 0.87287, 1.20857, 1.34283, 1.91688, 2.27501, 1.44811, 0.63219, 0.61772, 0.60393, 0.59084, 0.57844, 0.56672, 0.55570, 0.54536, 0.53572, 0.52676, 0.51849, 0.51092, 0.50402, 0.49783, 0.49232, 0.48749, 0.48336, 0.47992, 0.47717, 0.47510, 0.47373, 0.47304, 0.47304, 0.47374, 0.47512, 0.47719, 0.47995, 0.48340, 0.48754, 0.49237, 0.44503, 0.30789],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FORWARDSMASH";
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.fsmash1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fsmash1.id1;
    M.FORWARDSMASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 4) {
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
    if (!M.FORWARDSMASH.interrupt(p, input)) {
      reduceByTraction(p, true);
      pl.phys.cVel.x = M.FORWARDSMASH.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer === 6) {}
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 21) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 16) {
        pl.hitboxes.id[0] = pl.charHitboxes.fsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fsmash2.id1;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 21) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 44) {
      S.WAIT.init(p, input);
      return true;
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
    M.FORWARDTILT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.FORWARDTILT.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 10) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 27) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.FURAFURA = {
  name: "FURAFURA",
  init: function (p, input) {
    S.WAIT.init(p, input);
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
    M.GRAB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.GRAB.interrupt(p, input)) {
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
    pl.hitboxes.id[2] = pl.charHitboxes.jab1.id2;
    M.JAB1.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.JAB1.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 2 && pl.timer < 26 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 5 && pl.timer < 7) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 7) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 7 && pl.phys.jabCombo) {
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
    pl.hitboxes.id[2] = pl.charHitboxes.jab2.id2;
    M.JAB2.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.JAB2.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 8) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 20) {
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

M.JUMPAERIAL1 = {
  name: "JUMPAERIAL1",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JUMPAERIAL1";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.cVel.y = 1.65;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.JUMPAERIAL1.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!M.JUMPAERIAL1.interrupt(p, input)) {
      fastfall(p, input);
      puffMultiJumpDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0] === true) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else if (pl.timer > 28 && checkForMultiJump(p, input)) {
      puffNextJump(p, input);
      return true;
    } else if (pl.timer > 50) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.JUMPAERIAL2 = {
  name: "JUMPAERIAL2",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JUMPAERIAL2";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.59;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.JUMPAERIAL2.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!M.JUMPAERIAL2.interrupt(p, input)) {
      fastfall(p, input);
      puffMultiJumpDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else if (pl.timer > 28 && checkForMultiJump(p, input)) {
      puffNextJump(p, input);
      return true;
    } else if (pl.timer > 50) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.JUMPAERIAL3 = {
  name: "JUMPAERIAL3",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JUMPAERIAL3";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.47;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.JUMPAERIAL3.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!M.JUMPAERIAL3.interrupt(p, input)) {
      fastfall(p, input);
      puffMultiJumpDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else if (pl.timer > 28 && checkForMultiJump(p, input)) {
      puffNextJump(p, input);
      return true;
    } else if (pl.timer > 50) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.JUMPAERIAL4 = {
  name: "JUMPAERIAL4",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JUMPAERIAL4";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.36;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.JUMPAERIAL4.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!M.JUMPAERIAL4.interrupt(p, input)) {
      fastfall(p, input);
      puffMultiJumpDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else if (pl.timer > 28 && checkForMultiJump(p, input)) {
      puffNextJump(p, input);
      return true;
    } else if (pl.timer > 50) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.JUMPAERIAL5 = {
  name: "JUMPAERIAL5",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JUMPAERIAL5";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = 1.25;
    pl.phys.cVel.x = input[p][0].lsX * 0.5;
    pl.phys.jumpsUsed++;
    M.JUMPAERIAL5.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!M.JUMPAERIAL5.interrupt(p, input)) {
      fastfall(p, input);
      puffMultiJumpDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      M[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      S.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      M[b[1]].init(p, input);
      return true;
    } else if (player[p].timer > 50) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.JUMPAERIALB = {
  name: "JUMPAERIALB",
  init: function (p, input) {
    puffNextJump(p, input);
  }
};

M.JUMPAERIALF = {
  name: "JUMPAERIALF",
  init: function (p, input) {
    puffNextJump(p, input);
  }
};

M.NEUTRALSPECIALAIR = {
  name: "NEUTRALSPECIALAIR",
  canPassThrough: false,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  specialWallCollide: true,
  specialOnHit: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALAIR";
    pl.timer = 0;
    pl.phys.rollOutCharging = false;
    pl.phys.rollOutCharge = 0;
    pl.phys.rollOutDistance = 0;
    pl.phys.rollOutChargeAttempt = true;
    pl.phys.rollOutVel = 0.5;
    pl.phys.rollOutPlayerHit = false;
    pl.phys.rollOutWallHit = false;
    pl.phys.rollOutPlayerHitTimer = 0;
    pl.colourOverlay = "rgba(255, 248, 88, 0.83)";
    pl.phys.cVel.y = Math.max(-1.3, pl.phys.cVel.y);
    turnOffHitboxes(p);
    M.NEUTRALSPECIALAIR.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 15) {}
    if (pl.timer >= 16 && pl.timer <= 45 && pl.phys.rollOutChargeAttempt) {
      if (input[p][0].b) {
        pl.phys.rollOutCharging = true;
        pl.phys.rollOutCharge++;
        if (pl.phys.rollOutCharge > 44) {
          pl.phys.rollOutCharge = 44;
        }
        if (pl.phys.rollOutCharge >= 21) {
          if (pl.timer === 16) {}
        }
      } else {
        pl.timer++;
        pl.phys.rollOutCharging = false;
        pl.phys.rollOutChargeAttempt = false;
        pl.phys.rollOutVel = Math.max(0.5, Math.min(4.1, 0.2 + 0.09 * pl.phys.rollOutCharge));
        pl.phys.cVel.x = pl.phys.rollOutVel * pl.phys.face;
        if (pl.phys.rollOutCharge >= 21) {
          pl.hitboxes.frame = 0;
          pl.hitboxes.id[0] = pl.charHitboxes.neutralspecialair.id0;
          pl.hitboxes.active = [true, false, false, false];
        }
      }
    }
    if (pl.phys.rollOutCharging || pl.phys.rollOutDistance < 100 || pl.phys.rollOutPlayerHit) {
      pl.colourOverlayBool = false;
      if (pl.timer >= 24 && pl.timer <= 28 && pl.phys.rollOutCharge >= 21 && !pl.phys.rollOutPlayerHit) {
        pl.colourOverlayBool = true;
      }
      pl.timer += 1 + 2 * (pl.phys.rollOutCharge / 44);
      if (pl.timer > 39) {
        pl.timer = 16;
      }
    } else {
      pl.timer++;
    }
    if (!M.NEUTRALSPECIALAIR.interrupt(p, input)) {
      pl.phys.cVel.y -= 0.07;
      if (pl.phys.cVel.y < -1.3) {
        pl.phys.cVel.y = -1.3;
      }
      if (pl.timer > 15 && pl.timer < 39 && !pl.phys.rollOutCharging && !pl.phys.rollOutChargeAttempt) {
        pl.phys.rollOutDistance++;
        if (!pl.phys.rollOutPlayerHit) {
          const newDmg = 12 + Math.round((pl.phys.rollOutCharge - 19) / 4);
          pl.hitboxes.id[0].dmg = newDmg;
          pl.hitboxes.id[1].dmg = newDmg;
          pl.hitboxes.id[2].dmg = newDmg;
          if (pl.phys.rollOutCharge >= 21) {
            if (pl.phys.rollOutDistance % 10 === 0) {}
          }
        }
        if (pl.phys.rollOutDistance > 100 && !pl.phys.rollOutPlayerHit) {
          pl.timer = 39;
          pl.phys.cVel.x *= 0.6;
          pl.colourOverlayBool = false;
          turnOffHitboxes(p);
        }
      }
      if (pl.phys.rollOutPlayerHit) {
        pl.phys.rollOutPlayerHitTimer++;
        if (pl.phys.rollOutPlayerHitTimer > 42) {
          airDrift(p, input);
        }
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 70) {
      S.FALLSPECIAL.init(p, input);
      return false;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    const pl = player[p];
    if (pl.phys.rollOutPlayerHit) {
      S.LANDINGFALLSPECIAL.init(p, input);
    } else {
      pl.actionState = "NEUTRALSPECIALGROUND";
      if (pl.phys.rollOutCharge >= 21) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.neutralspecialair.id0;
        pl.hitboxes.active = [true, false, false, false];
      }
    }
  },
  onWallCollide: function (p, input, wallFace, wallNum) {
    const pl = player[p];
    if (!pl.phys.rollOutCharging && !pl.phys.rollOutChargeAttempt && !pl.phys.rollOutPlayerHit) {
      pl.phys.cVel.x *= -0.75;
      pl.phys.rollOutVel *= 0.75;
      pl.timer = 16;
      pl.phys.face *= -1;
      if (wallFace === "R") {} else {}
    }
  },
  onPlayerHit: function (p) {
    const pl = player[p];
    pl.phys.rollOutPlayerHit = true;
    pl.phys.rollOutPlayerHitTimer = 0;
    pl.phys.cVel.x *= -0.13;
    pl.phys.cVel.y = 1.6;
    pl.phys.grounded = false;
    pl.colourOverlayBool = false;
    turnOffHitboxes(p);
  }
};

M.NEUTRALSPECIALGROUND = {
  name: "NEUTRALSPECIALGROUND",
  canEdgeCancel: true,
  canBeGrabbed: true,
  disableTeeter: true,
  airborneState: "NEUTRALSPECIALAIR",
  specialOnHit: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALGROUND";
    pl.timer = 0;
    pl.phys.rollOutCharging = false;
    pl.phys.rollOutCharge = 0;
    pl.phys.rollOutDistance = 0;
    pl.phys.rollOutChargeAttempt = true;
    pl.phys.rollOutVel = 0.3;
    pl.phys.rollOutPlayerHit = false;
    pl.phys.rollOutWallHit = false;
    pl.phys.rollOutPlayerHitTimer = 0;
    pl.colourOverlay = "rgba(255, 248, 88, 0.83)";
    pl.phys.cVel.x = 0.0001 * pl.phys.face;
    turnOffHitboxes(p);
    M.NEUTRALSPECIALGROUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 15) {}
    if (pl.timer >= 16 && pl.timer <= 45 && pl.phys.rollOutChargeAttempt) {
      if (input[p][0].b) {
        pl.phys.rollOutCharging = true;
        pl.phys.rollOutCharge++;
        if (pl.phys.rollOutCharge > 44) {
          pl.phys.rollOutCharge = 44;
        }
        if (pl.phys.rollOutCharge >= 19) {
          if (pl.timer === 16) {}
        }
        pl.phys.cVel.x = 0.0001 * pl.phys.face;
      } else {
        pl.timer++;
        pl.phys.rollOutCharging = false;
        pl.phys.rollOutChargeAttempt = false;
        pl.phys.rollOutVel = Math.min(4.2, 0.3 + 0.09 * pl.phys.rollOutCharge);
        if (pl.phys.rollOutCharge >= 19) {
          pl.hitboxes.frame = 0;
          pl.hitboxes.id[0] = pl.charHitboxes.neutralspecialground.id0;
          pl.hitboxes.id[1] = pl.charHitboxes.neutralspecialground.id1;
          pl.hitboxes.id[2] = pl.charHitboxes.neutralspecialground.id2;
          pl.hitboxes.active = [true, true, true, false];
        }
      }
    }
    if (pl.phys.rollOutCharging || pl.phys.rollOutDistance < 100) {
      pl.timer += 1 + 2 * (pl.phys.rollOutCharge / 44);
      pl.colourOverlayBool = false;
      if (pl.timer >= 28 && pl.timer <= 34 && pl.phys.rollOutCharge >= 19 && !pl.phys.rollOutPlayerHit) {
        pl.colourOverlayBool = true;
      }
      if (pl.timer > 45) {
        pl.timer = 16;
      }
    } else {
      pl.timer++;
    }
    if (!M.NEUTRALSPECIALGROUND.interrupt(p, input)) {
      if (pl.timer > 15 && pl.timer < 46 && !pl.phys.rollOutCharging && !pl.phys.rollOutChargeAttempt) {
        pl.phys.rollOutDistance++;
        if (!pl.phys.rollOutPlayerHit) {
          const newDmg = 12 + Math.round((pl.phys.rollOutCharge - 19) / 4);
          pl.hitboxes.id[0].dmg = newDmg;
          pl.hitboxes.id[1].dmg = newDmg;
          pl.hitboxes.id[2].dmg = newDmg;
          if (pl.phys.rollOutCharge >= 19) {
            if (pl.phys.rollOutDistance % 10 === 0) {}
          }
        }
        if (pl.phys.rollOutDistance > 100) {
          turnOffHitboxes(p);
          pl.timer = 46;
          pl.phys.cVel.x *= 0.6;
          pl.colourOverlayBool = false;
        } else {
          pl.phys.cVel.x = pl.phys.rollOutVel * pl.phys.face;
          if (input[p][0].lsX * pl.phys.face < -0.49) {
            M.NEUTRALSPECIALGROUNDTURN.init(p, input);
            pl.colourOverlayBool = false;
          }
        }
      }
      if (pl.timer >= 46) {
        const sign = Math.sign(pl.phys.cVel.x);
        pl.phys.cVel.x -= 0.09 * sign;
        if (pl.phys.cVel.x * sign < 0) {
          pl.phys.cVel.x = 0;
        }
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 77) {
      S.WAIT.init(p, input);
      return false;
    } else {
      return false;
    }
  },
  onPlayerHit: function (p) {
    player[p].actionState = "NEUTRALSPECIALAIR";
    M.NEUTRALSPECIALAIR.onPlayerHit(p);
  }
};

M.NEUTRALSPECIALGROUNDTURN = {
  name: "NEUTRALSPECIALGROUNDTURN",
  canEdgeCancel: false,
  canBeGrabbed: true,
  specialOnHit: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALGROUNDTURN";
    pl.timer = 0;
    pl.phys.rollOutTurnTimer = 0;
    pl.phys.face *= -1;
    turnOffHitboxes(p);
    M.NEUTRALSPECIALGROUNDTURN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += 3;
    if (pl.timer > 30) {
      pl.timer = 3;
    }
    pl.phys.rollOutTurnTimer++;
    pl.phys.rollOutDistance++;
    if (!M.NEUTRALSPECIALGROUNDTURN.interrupt(p, input)) {
      pl.phys.cVel.x = pl.phys.rollOutVel * pl.phys.face * -1 - pl.phys.rollOutVel * 0.045 * pl.phys.rollOutTurnTimer * pl.phys.face * -1;
      if (pl.phys.rollOutDistance % 5 === 0) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.phys.rollOutDistance > 100) {
      pl.actionState = "NEUTRALSPECIALGROUND";
      pl.timer = 46;
      return true;
    } else if (pl.phys.rollOutTurnTimer > 28) {
      pl.phys.cVel.x = pl.phys.rollOutVel * pl.phys.face;
      pl.actionState = "NEUTRALSPECIALGROUND";
      pl.timer = 15 + pl.timer;
      if (pl.phys.rollOutCharge >= 19) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.neutralspecialground.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.neutralspecialground.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.neutralspecialground.id2;
        pl.hitboxes.active = [true, true, true, false];
      }
      return true;
    } else {
      return false;
    }
  },
  onPlayerHit: function (p) {
    player[p].actionState = "NEUTRALSPECIALAIR";
    M.NEUTRALSPECIALAIR.onPlayerHit(p);
  }
};

M.SIDESPECIALAIR = {
  name: "SIDESPECIALAIR",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  groundVelocities: [1.88, 1.50792, 1.31208, 1.14561, 0.73439, 0.34986, 0.34461, 0.33943, 0.33430, 0.32924, 0.32424, 0.31930, 0.31443, 0.30961, 0.30486, 0.30017, 0.29554, 0.29097, 0.28647, 0.28202, 0.27764, 0.27332, 0.26906, 0.26487, 0.26074, 0.25666, 0.25265, 0.23230, 0.19657, 0.16230, 0.12950, 0.09816, 0.06830, 0.03990],
  airVelocities: [2.024, 1.86208, 1.71311, 1.57606, 1.44998, 1.33398, 1.22726, 1.12908, 1.03876, 0.95565, 0.87920, 0.80887, 0.74416, 0.68462, 0.62985, 0.57947, 0.53311, 0.49046, 0.45122, 0.41513, 0.38192, 0.35136, 0.32325, 0.29739, 0.27360, 0.25171, 0.23158, 0.21305],
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
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
    }
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.sidespecial.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.sidespecial.id1;
    M.SIDESPECIALAIR.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALAIR.interrupt(p, input)) {
      if (pl.phys.grounded) {
        if (pl.timer > 11) {
          pl.phys.cVel.x = M.SIDESPECIALAIR.groundVelocities[pl.timer - 12] * pl.phys.face;
        }
      } else {
        if (pl.timer === 12) {
          pl.phys.fastfalled = false;
          pl.phys.upbAngleMultiplier = input[p][0].lsY * Math.PI * 0.111111;
          pl.phys.cVel.y = 0;
        }
        if (pl.timer < 12) {
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
          pl.phys.cVel.y -= pl.charAttributes.gravity;
          if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
            pl.phys.cVel.y = -pl.charAttributes.terminalV;
          }
        } else if (pl.timer > 11 && pl.timer < 40) {
          pl.phys.cVel.x = M.SIDESPECIALAIR.airVelocities[pl.timer - 12] * pl.phys.face * Math.cos(pl.phys.upbAngleMultiplier);
          pl.phys.cVel.y = M.SIDESPECIALAIR.airVelocities[pl.timer - 12] * Math.sin(pl.phys.upbAngleMultiplier);
        } else {
          airDrift(p, input);
          fastfall(p, input);
        }
      }
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 28) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 28) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 45) {
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
    player[p].actionState = "SIDESPECIALGROUND";
  }
};

M.SIDESPECIALGROUND = {
  name: "SIDESPECIALGROUND",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  groundVelocities: [1.88, 1.50792, 1.31208, 1.14561, 0.73439, 0.34986, 0.34461, 0.33943, 0.33430, 0.32924, 0.32424, 0.31930, 0.31443, 0.30961, 0.30486, 0.30017, 0.29554, 0.29097, 0.28647, 0.28202, 0.27764, 0.27332, 0.26906, 0.26487, 0.26074, 0.25666, 0.25265, 0.23230, 0.19657, 0.16230, 0.12950, 0.09816, 0.06830, 0.03990],
  airVelocities: [2.024, 1.86208, 1.71311, 1.57606, 1.44998, 1.33398, 1.22726, 1.12908, 1.03876, 0.95565, 0.87920, 0.80887, 0.74416, 0.68462, 0.62985, 0.57947, 0.53311, 0.49046, 0.45122, 0.41513, 0.38192, 0.35136, 0.32325, 0.29739, 0.27360, 0.25171, 0.23158, 0.21305],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND";
    pl.timer = 0;
    if (pl.phys.grounded) {
      pl.phys.cVel.x = 0;
    } else {
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
    }
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.sidespecial.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.sidespecial.id1;
    M.SIDESPECIALGROUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALGROUND.interrupt(p, input)) {
      if (pl.phys.grounded) {
        if (pl.timer > 11) {
          pl.phys.cVel.x = M.SIDESPECIALGROUND.groundVelocities[pl.timer - 12] * pl.phys.face;
        }
      } else {
        if (pl.timer === 12) {
          pl.phys.fastfalled = false;
          pl.phys.upbAngleMultiplier = input[p][0].lsY * Math.PI * 0.111111;
          pl.phys.cVel.y = 0;
        }
        if (pl.timer < 12) {
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
          pl.phys.cVel.y -= pl.charAttributes.gravity;
          if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
            pl.phys.cVel.y = -pl.charAttributes.terminalV;
          }
        } else if (pl.timer > 11 && pl.timer < 40) {
          pl.phys.cVel.x = M.SIDESPECIALGROUND.airVelocities[pl.timer - 12] * pl.phys.face * Math.cos(pl.phys.upbAngleMultiplier);
          pl.phys.cVel.y = M.SIDESPECIALGROUND.airVelocities[pl.timer - 12] * Math.sin(pl.phys.upbAngleMultiplier);
        } else {
          airDrift(p, input);
          fastfall(p, input);
        }
      }
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 28) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 28) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 45) {
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
  setVelocities: [-0.12755, -1.24035, -3.10533, -2.72023, -0.32654, 0, 0, 0, 0.00357, 0.09035, 0.22531, 0.37797, 0.54831, 1.35048, 1.60332, 1.04371, 0.81257, 0.60621, 0.42461, 0.26777, 0.1357, 0.03, 0],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWBACK";
    pl.timer = 0;
    const grabbing = pl.phys.grabbing;
    if (grabbing === -1) {
      return;
    }
    actionStates[characterSelections[grabbing]].THROWNPUFFBACK.init(grabbing, input);
    const frame = framesData[characterSelections[grabbing]].THROWNPUFFBACK;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwback.id0;
    M.THROWBACK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 22 / pl.phys.releaseFrame;
    if (!M.THROWBACK.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) > 13 && Math.floor(pl.timer + 0.01 < 37)) {
        pl.phys.cVel.x = M.THROWBACK.setVelocities[Math.floor(pl.timer + 0.01) - 14] * pl.phys.face;
      }
      if (Math.floor(pl.timer + 0.01) >= 22 && prevFrame < 22) {
        if (pl.phys.grabbing === -1) return;
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
        turnOffHitboxes(p);
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
    actionStates[characterSelections[grabbing]].THROWNPUFFDOWN.init(grabbing, input);
    const frame = framesData[characterSelections[grabbing]].THROWNPUFFDOWN;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwdownextra.id0;
    M.THROWDOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 61 / pl.phys.releaseFrame;
    if (!M.THROWDOWN.interrupt(p, input)) {
      if (pl.timer < 51) {
        if (pl.timer % 13 === 10) {
          pl.hitboxes.active = [true, false, false, false];
          pl.hitboxes.frame = 0;
        }
        if (pl.timer % 13 === 11) {
          turnOffHitboxes(p);
        }
      }
      if (Math.floor(pl.timer + 0.01) >= 61 && prevFrame < 61) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwdown.id0;
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 84) {
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
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWFORWARD";
    pl.timer = 0;
    const grabbing = pl.phys.grabbing;
    if (grabbing === -1) {
      return;
    }
    actionStates[characterSelections[grabbing]].THROWNPUFFFORWARD.init(grabbing, input);
    const frame = framesData[characterSelections[grabbing]].THROWNPUFFFORWARD;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwforward.id0;
    M.THROWFORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 12 / pl.phys.releaseFrame;
    if (!M.THROWFORWARD.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 12 && prevFrame < 12) {
        if (pl.phys.grabbing === -1) return;
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
        turnOffHitboxes(p);
      }
      if (pl.timer === 11) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwforwardextra.id0;
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 12) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 35) {
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

M.THROWNPUFFBACK = {
  name: "THROWNPUFFBACK",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  reverseModel: true,
  offset: [[-11.22, -3.35], [-11.51, -3.60], [-11.64, -3.90], [-11.51, -4.11], [-10.99, -4.13], [-9.98, -4.05], [-8.74, -3.92], [-7.52, -3.55], [-6.37, -2.46], [-5.04, -0.22], [-3.44, 2.32], [-1.58, 3.79], [0.31, 4.86], [0.92, 7.14], [2.41, 7.55], [5.89, 1.56], [6.52, -6.85], [6.13, -9.95], [6.14, -10.28], [6.32, -9.92], [6.51, -9.34], [6.51, -9.34]],
  offsetVel: [-0.12755, -1.24035, -3.10533, -2.72023, -0.32654],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNPUFFBACK";
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
    M.THROWNPUFFBACK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNPUFFBACK.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > M.THROWNPUFFBACK.offset.length) {
          timer = M.THROWNPUFFBACK.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNPUFFBACK.offset[timer - 1][0] * pl.phys.face * -1, player[grabbedBy].phys.pos.y + M.THROWNPUFFBACK.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNPUFFDOWN = {
  name: "THROWNPUFFDOWN",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-10.26, 0.98], [-7.67, -0.31], [-4.94, -1.56], [-3.10, -2.50], [-0.94, -3.59], [-0.90, -3.57], [-1.00, -3.52], [-1.01, -3.56], [-0.94, -3.62], [-0.97, -3.60], [-1.02, -3.58], [-1.04, -3.56], [-1.00, -3.57], [-0.93, -3.58], [-0.91, -3.61], [-0.92, -3.64], [-0.91, -3.63], [-0.92, -3.60], [-0.92, -3.57], [-0.97, -3.57], [-1.00, -3.59], [-0.98, -3.62], [-0.96, -3.62], [-0.92, -3.59], [-0.89, -3.55], [-0.91, -3.54], [-0.96, -3.57], [-0.95, -3.62], [-0.93, -3.67], [-0.93, -3.65], [-0.95, -3.58], [-0.89, -3.52], [-0.84, -3.53], [-0.89, -3.59], [-0.94, -3.60], [-0.96, -3.59], [-0.96, -3.56], [-0.90, -3.54], [-0.86, -3.58], [-0.88, -3.63], [-0.88, -3.61], [-0.90, -3.58], [-0.92, -3.56], [-0.97, -3.56], [-1.00, -3.58], [-1.00, -3.62], [-0.98, -3.63], [-0.94, -3.60], [-0.91, -3.55], [-0.94, -3.53], [-0.99, -3.55], [-0.98, -3.59], [-0.98, -3.62], [-0.96, -3.61], [-0.95, -3.58], [-0.91, -3.53], [-0.90, -3.53], [-0.94, -3.59], [-0.93, -3.61], [-0.90, -3.65], [-0.93, -3.64], [-0.98, -3.62], [-0.98, -3.62]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNPUFFDOWN";
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
    M.THROWNPUFFDOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNPUFFDOWN.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > M.THROWNPUFFDOWN.offset.length) {
          timer = M.THROWNPUFFDOWN.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNPUFFDOWN.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + M.THROWNPUFFDOWN.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNPUFFFORWARD = {
  name: "THROWNPUFFFORWARD",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-10.52, -3.27], [-9.84, -3.27], [-9.13, -3.27], [-8.70, -3.27], [-8.60, -3.27], [-8.61, -3.27], [-8.67, -3.27], [-8.70, -3.27], [-9.78, -3.27], [-9.78, 0.01]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNPUFFFORWARD";
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
    M.THROWNPUFFFORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNPUFFFORWARD.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > M.THROWNPUFFFORWARD.offset.length) {
          timer = M.THROWNPUFFFORWARD.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNPUFFFORWARD.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + M.THROWNPUFFFORWARD.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNPUFFUP = {
  name: "THROWNPUFFUP",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-10.63, -3.65], [-9.46, -4.14], [-7.29, -4.39], [-2.98, -3.79], [2.65, -2.33], [4.95, -0.64], [4.95, -0.64]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNPUFFUP";
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
    M.THROWNPUFFUP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNPUFFUP.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        if (pl.phys) {
          const grabbedBy = pl.phys.grabbedBy;
          if (grabbedBy !== -1) {
            if (timer > M.THROWNPUFFUP.offset.length) {
              timer = M.THROWNPUFFUP.offset.length - 1;
            }
            pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNPUFFUP.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + M.THROWNPUFFUP.offset[timer - 1][1]);
          }
        }
      }
    }
  },
  interrupt: function (p, input) {
    return false;
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
    actionStates[characterSelections[grabbing]].THROWNPUFFUP.init(grabbing, input);
    turnOffHitboxes(p);
    const frame = framesData[characterSelections[grabbing]].THROWNPUFFUP;
    pl.phys.releaseFrame = frame + 1;
    pl.hitboxes.id[0] = pl.charHitboxes.throwup.id0;
    M.THROWUP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 7 / pl.phys.releaseFrame;
    if (!M.THROWUP.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 7 && prevFrame < 7) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 41) {
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
    pl.hitboxes.id[0] = pl.charHitboxes.upsmash.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.upsmash.id1;
    M.UPSMASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 5) {
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
    if (!M.UPSMASH.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 7 && pl.timer < 11) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 11) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 54) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 44 && !pl.inCSS) {
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
  canPassThrough: true,
  canGrabLedge: [true, true],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPSPECIAL";
    pl.timer = 0;
    if (pl.phys.grounded) {
      if (pl.phys.cVel.x > 0) {
        pl.phys.cVel.x -= 0.1;
      }
      if (pl.phys.cVel.x < 0) {
        pl.phys.cVel.x += 0.1;
      }
    } else {
      pl.phys.fastfalled = false;
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
    }
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.upb.id0;
    M.UPSPECIAL.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.UPSPECIAL.interrupt(p, input)) {
      if (pl.timer === 23) {} else if (pl.timer === 71) {} else if (pl.timer === 122) {}
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
        pl.phys.cVel.y -= pl.charAttributes.gravity;
        if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
          pl.phys.cVel.y = -pl.charAttributes.terminalV;
        }
      }
      if (pl.timer === 18) {}
      if (pl.timer === 69) {}
      if (pl.timer === 28) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0].size = 10.937;
      } else if (pl.timer === 36) {
        pl.hitboxes.id[0].size = 1;
      } else if (pl.timer === 69) {
        pl.hitboxes.id[0].size = 10.937;
      } else if (pl.timer === 77) {
        pl.hitboxes.id[0].size = 1;
      } else if (pl.timer === 113) {
        pl.hitboxes.id[0].size = 12.890;
      } else if (pl.timer === 126) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 179) {
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

M.UPTILT = {
  name: "UPTILT",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPTILT";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.uptilt1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.uptilt1.id1;
    M.UPTILT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.UPTILT.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 8) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
        pl.hitboxes.id[0] = pl.charHitboxes.uptilt2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.uptilt2.id1;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 10 && pl.timer < 15) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 15) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 23) {
      S.WAIT.init(p, input);
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
    player[p].timer++;
    if (!this.interrupt(p, input)) {}
  },
  interrupt: function (p, input) {
    if (player[p].timer > 100) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

setupActionStates(CHARIDS.PUFF_ID, { ...S, ...M });

actionStates[CHARIDS.PUFF_ID].ESCAPEB.setVelocities = [0, 0, 0, 0, -0.18636, -0.53714, -0.85504, -1.14006, -1.39219, -1.61143, -1.79778, -1.90176, -1.87565, -1.74509, -1.51009, -1.17065, -0.72676, -0.60977, -0.87285, -1.11128, -1.32504, -1.51414, -1.67857, -1.81834, -1.79778, -1.61143, -1.39219, -1.14006, -0.85504, -0.53714, -0.18636, 0.00168, 0.0028, 0.00056];
actionStates[CHARIDS.PUFF_ID].ESCAPEF.setVelocities = [0, 0, 0, 0, 0, 0.48128, 1.26336, 1.77472, 2.01536, 1.98528, 1.81834, 1.67857, 1.51414, 1.32504, 1.11128, 0.87286, 0.60977, 0.60977, 0.87285, 1.11128, 1.32504, 1.51414, 1.67857, 1.81834, 1.79778, 1.61143, 1.39219, 1.14006, 0.85504, 0.53714, 0.18636, 0.00092, 0.00154, 0.00031];
actionStates[CHARIDS.PUFF_ID].DOWNSTANDB.setVelocities = [-0.06932, -0.07344, -0.07718, -0.08053, -0.08348, -0.08605, -0.17622, -0.34650, -0.50517, -0.65224, -0.78769, -0.91154, -1.02377, -1.1244, -1.21342, -1.29083, -1.35662, -1.41081, -1.4534, -1.48436, -1.50373, -1.51148, -1.50762, -1.49216, -1.46508, -1.42639, -1.37611, -1.31420, -1.24069, -1.15557, 0, 0, 0, 0, 0];
actionStates[CHARIDS.PUFF_ID].DOWNSTANDF.setVelocities = [0.01598, 0.00249, -0.00243, 0.00123, 0.01347, 0.0343, 0.0637, 0.10167, 0.2669, 0.53622, 0.7794, 0.99642, 1.1873, 1.35203, 1.49061, 1.60305, 1.68934, 1.74948, 1.78347, 1.79132, 1.77302, 1.72857, 1.65796, 1.56122, 1.43833, 1.28929, 1.11411, 0.91276, 0.68529, 0.43165, 0.15188, 0.00338, 0.00283, 0.00114, -0.00169];
actionStates[CHARIDS.PUFF_ID].TECHB.setVelocities = [0, 0.51119, 1.12463, 1.12463, 0.51119, -1.15217, -2.11948, -2.01629, -2.15974, -2.27333, -2.35708, -2.41098, -2.43502, -2.42922, -2.39356, -2.32805, -2.2327, -2.10749, -1.95244, -1.76753, -1.55278, -1.30817, -1.03371, -0.72941, -0.51981, -0.42778, -0.34013, -0.25689, -0.17805, -0.1036, -0.03356, 0.63449, 1.17833, 0.63449, 0, 0, 0, 0, 0, 0];
actionStates[CHARIDS.PUFF_ID].TECHF.setVelocities = [0, -0.39214, -0.86272, -0.86272, -0.39214, 0.75185, 1.75788, 2.16647, 2.43012, 2.62609, 2.75436, 2.81494, 2.80783, 2.73303, 2.59053, 2.38034, 2.10247, 1.7569, 1.34363, 0.86268, 0.31404, 0.01548, 0.01231, 0.00939, 0.00673, 0.00433, 0.00219, 0.0003, -0.00133, -0.00270, -0.00382, -0.00467, -0.00527, -0.00562, -0.00570, -0.00553, -0.00510, -0.00442, -0.00347, -0.00277];
actionStates[CHARIDS.PUFF_ID].CLIFFCATCH.posOffset = [[-74.289, -8.13664], [-73.93011, -8.48632], [-73.54061, -8.90368], [-73.22807, -9.25336], [-73.1, -9.4], [-73.1, -9.4], [-73.1, -9.4]];
actionStates[CHARIDS.PUFF_ID].CLIFFWAIT.posOffset = [-73.1, -9.4];

// ---- ECB (environmental collision box) offsets per action-state frame, run-length encoded (see decodeEcb in ml.js) ----
setEcbData(CHARIDS.PUFF_ID, decodeEcb({
  ATTACKAIRB: "23583368c23583368235834682458a2358b33682358a22583368c2358c23692358k",
  ATTACKAIRD: "2357b13590259035903480359035:a025:b03590348a0359035:a03590259d03590348e0359i13592369c23581358",
  ATTACKAIRF: "2269b326922693269235824582558a15582558a2458a14582458a1458e235813471358a135923692358g1358",
  ATTACKAIRN: "2358c33683457a3357k345733573457a3357g2357b2358l1358a",
  ATTACKAIRU: "1358d2358b1359136:b1359l2369a33692358b2457a14471358b2358a",
  ATTACKDASH: "337:23582369437:538:639;d538;c437:a3369236923572258125812591258135813472369337;327:437:538;a539<639<538;43792357234623572358",
  CAPTURECUT: "2358c245724582369a2358h23572346134623572358327:428;327;337:23582357b",
  CAPTUREDAMAGE: "236933682358327:3269437943683368b3269a2269a226:327:327;327:b",
  CAPTUREPULLED: "337:3369",
  CAPTUREWAIT: "327:a22692369c3369c3269327:a3369k2369c3369a327:a226:32693369a2369c33692369d3369e3269327:a32693369k2369a3369b3269327:b32693369b23693369a3469a346834692458346924583468a346924583469a3369a337:327:a337:a3369b2369b23582458235824582358c3368235833693269327:e",
  CATCHATTACK: "2358a2357a2358c235723582458f23582357d24572357b235823572358",
  CATCHCUT: "2358a3369337:347:347;e347:c3369b23692358b2357d2258b",
  CATCHWAIT: "2358z2358b",
  CLIFFATTACKQUICK: "236:a2369b3369337:b2369438;539<73:<73:=83;=83:<73:<749;639;639<63:>549<357:3469235714351335b1346a2357i2369327:437:538;438;a427:337:a23692357134623572358",
  CLIFFATTACKSLOW: "236:337:d236:a337:b236:a337:a236:i226:a126;a126:a1358b2358b2357b2346b2446134613351435133515351335143515461346c1446b1347a2357a2358428;538;336923462357",
  CLIFFCATCH: "1359a236:d",
  CLIFFGETUPQUICK: "236:a236913592369236:337:2369a2358a437:639<73:=a73:<639<a539<438;437:3368235713461334b13352357b2358a",
  CLIFFGETUPSLOW: "236:337:e236:337:a236:g2369f1259126:025:b13591358d2357d13471346c23462357a2358b23572346b2357a2358",
  CLIFFESCAPEQUICK: "236:a337:438;438<539<639<a73:<a639<c538;337:a3368336923692358336923691358c236933691358a23582369a1358a23692357j2258",
  CLIFFESCAPESLOW: "236:337:d236:a337:a236:g2369f1259126:025:b13581347b2357b133513341423133423462258226922582346143414231334134622582269225822461334142313341246225822692258134613341434a23462258226922581258134723462357a3368b3268a",
  CLIFFJUMPQUICK: "236:a2369b236:337:2369a2358c235733683369437:438;b437:d336933683369437:43793369235813473369a236922581358",
  CLIFFJUMPSLOW: "236:a2369b236:126:126;a126:13591358b235813471358437:d427:a437:f4379a3369a336823581358a23693369b337:a2358a",
  DAMAGEFALL: "3369c2369b2358b1358c2358b1358c2358c2369a3369b",
  CLIFFWAIT: "236:v2369236:a2369i236:a2369h236:2369236:j",
  DAMAGEFLYHI: "23581347b13581458a245824572357a2257a225813582358c336832682258a23582369c3369236933693368d236922692258a2269d3369a2369h2358a3369a",
  DAMAGEFLYLW: "134712470247a0248a034804471447a2457a2357a1247b1358a134714472457b2357c1358c13472357i2358a23572358a33682358b2369d235833683369",
  DAMAGEFLYTOP: "2258a235823573356a32573269226:227;a236:23583357325632572269226:227;236:236933573257a3268226:a236:235833683257a22582269b235833683357326822582269b2358a32682258b22692358c2258b2358k1358f235723582369c3369",
  DAMAGEHI1: "33693269337:33693469a437:337:336923572358",
  DAMAGEHI2: "3369327:337;347:24572346a22583369a3368b3369327:337:3369b33682358b",
  DAMAGEHI3: "3369317:327:437:5478637753785279427:428;427:437:5379b4379c3369b23582357234614351335a235722582358",
  DASH: "2346b2358437:438;a538;539<c538;a437:a3369234613462346a2357a",
  DOWNATTACK: "23572258a23582357b13461335g23462458347:337:h3369a235823571346a1335f1346b23462357a23582258",
  DOWNSTANDB: "234624572358a3269a2369a2358b1247a225823693369b23581347a12581358225823583369a3368235823572346b23572358",
  DOWNBOUND: "03351358337:438;c528;a427:437:337:33692369135803470335032303350336b033503230312a",
  DOWNSTANDF: "2346d23572369337;a337:33692357337:a2369235813471358c2358a33683369337:3369b235823572346a23572358",
  DOWNSTANDN: "2346c2357c23464368539<639;639<63:=529=a529<a539<a437:33691335c23462357a2358",
  DOWNTILT: "1334133513462346b2357b24572557a2457c2357g2358a2357c2346b1335b1334b",
  DOWNWAIT: "2346g2357o234623572346g1346f1335d1346i2346c",
  DOWNSMASH: "2369337:337;b337:336923582557254625452346b22462346h2257225822693269327:a327;327:b337:e3369a2369a22693369a23693369a2369b3368",
  ESCAPEAIR: "1347c23573368a2258a235813581347b23572358a2269f2369a2358b13581347c2357b2358k",
  ESCAPEB: "234614351335143513352357236:438;548;549<a448<348<a236:235823572458246:347;348<449=448<438<a338<337;2369235714351334133523462357",
  ESCAPEF: "23461435a133523462358337:437:548:538:a437:337:a236922572246234623572358337:438;a437:a337:a2358235713351334133523462357",
  ESCAPEN: "2358a2369b3369f2369a2358a3368336923693368235823572346a2357a2258",
  FALL: "1358c13471358b",
  FALLSPECIAL: "2358g",
  FORWARDTILT: "2358c2369a347:a337:a2269326933692369a3369d235823462357a2358b",
  FORWARDSMASH: "23582357d23583369337:437:4479h3469b24692458a23582357b13471346h2357a2358b",
  GRAB: "33682358e3369337:437:337:c3369b23692358j2258",
  GUARDOFF: "2358235723462357337:529=a428<438;337:3369235723462357",
  GUARDON: "2358h",
  JAB1: "3369c2458a246933693368a23582357b2358a2258",
  JAB2: "3369c2458b34683469b2358a2357d2358a",
  JUMPAERIAL1: "247;g146;e247;u246:b24692369b2358c2357b",
  JUMPAERIAL2: "247;h146;a247;t246:f2369c2358c13472357a",
  JUMPAERIAL3: "236:a246:f236:246:236:m246:j2369e2358c1358a2357a",
  JUMPAERIAL4: "236:z236:e2369f2358g13472358",
  JUMPAERIAL5: "2369m3369b2369336923693369a2369d3369a2369b3369236933692369b33682358g2357b",
  JUMPB: "1358a03480359a13582358a135823581358a23581358b2358b1358235813581347b13583369235813581347235713582369a3369337:3369337:h236:1359a236923581358",
  JUMPF: "2269b226:b22693368a3369f3368b23583368235822583268a336823581358a1259236923583368236:a226:236:2369a235813582358a13581347e1358a",
  KNEEBEND: "13351334a1323a",
  LANDING: "13351334a1323d1322a1323e1334b1335a13462346c1335a23462357",
  LANDINGATTACKAIRB: "23462358337:c437:d3369236923582357a2358336832682258",
  LANDINGATTACKAIRD: "13351334c1335a234522572269327:327;428;427:437:3369d2357c2358c2258a",
  LANDINGATTACKAIRF: "1435144624572369337:236:337;327;337:327:236:2369336923692358e",
  LANDINGATTACKAIRN: "1335f2358337:337;a337:337;337:236:236923582357a2358",
  LANDINGATTACKAIRU: "1335a1334133513462358327:428;a438;437:3369a23582357a23583368b",
  LANDINGFALLSPECIAL: "13351323a13221323a1334134623461335",
  PASS: "13340323b033502360248b02590248b02470336042414342434244533562358a2269a23692358235723462357a",
  RUN: "63:=a639<a539<538;538:639;a639<a63:=a539<a438;437:a538;a639;639<a63:=a",
  RUNBRAKE: "438;a437:33692358o",
  SHIELDBREAKFLY: "2258a235823573356a32573269226:227;236:23583357325632572269226:227;236:236933573257a3268226:a236:",
  SIDESPECIALAIR: "33683369g33682357145824581358o23581358b23581358d23581358d",
  SIDESPECIALGROUND: "3369b337:3369e245734683369b2358a3368a2358e33683369e2369a3369b2369b2358c3368",
  SQUAT: "234613341323c1334",
  SQUATRV: "13342258327:3269b2358c",
  SQUATWAIT: "1334z1334l",
  STOPCEIL: "8399344564787488a647853783369",
  TECHB: "2369a1347c23692358a3369236923581347034712471358a235833683369b23582357a2346b13462357134723583369437:b337:3369a3269",
  TECHF: "2369235813471346a1358236923582357336923692358135812581358a2358a2369b33692358a2357a1346d23573369337:b33693269b",
  TECHN: "2369235713341323133513583369538:73:<73:=63:=a539<438;337:336923582346133523462358a3269c",
  TECHU: "446703243356a34563356b345633563456a33563456a3356b225722692358336822581258a",
  THROWBACK: "2357134613351334b133523572369337:b327:a337;639<93<>739;528;428;327:22571335a133413462258327:428;528;538:b639;528;437:3369235823571346c2346a2357a2258",
  THROWDOWN: "538:73:<73:=63:=639<539<538:427:a437:a438;337:c3369337:c437:a427:437:a337:d437:a427:438;a337;337:g438;437:427:438;a337:d437:d438;a538;639;73:<a639<538;438;337:23692258235713471346a1347b2357a2358b2258",
  THROWFORWARD: "2358a2258c2257a337:449=337:225722583369336822583268336832682258o",
  THROWUP: "2357a2346134623572269337:a327:438;337;337:437:a337:c437:337:327:a337:a327:337:f3369a2358b2357b2258",
  TILTTURN: "23572369538;b437:a337:23692357a",
  RUNTURN: "438;a437:33692358o438;a337:3369a33682358h2357d2358337:c438;",
  UPSPECIAL: "2358b22582357d2257f2357b2358e3368a3369g337:l3369c33682358b22582357b2257a2258a2358c23693369c337:f337;f337:e3369d33682358a2258a2257b23572257f2258a2358a23693369b337:h337;337:g3369d33682358d2357s225722582358a2258c",
  UPTILT: "337:337;327;337;327;337;327;a347:439>338=b439=a438<346924582469a2358b",
  UPSMASH: "0336d0359136:338=236:0236023502360335t0336d0347a0348a03470348c0347a0336c0236",
  WALKFAST: "3369d23582357d235833683369e2358a2357d235833683369a",
  WALKMIDDLE: "3369e2369a2358a2357c2358c33683369i23692358b2357c2358b3368a3369b",
  WALKSLOW: "3369a23692358d2357d2358e2369a3369p",
  WALLDAMAGE: "0259226:23572346235723582369c2358b2369a2358a2369226923691358a12581358134713582358a2369a3368",
  WALLTECH: "03473369d226:k23693368a2269a226:2369a2358c1358",
  WALLTECHJUMP: "03363369e226:227;e226:d236:23693369d23692358336823572269235833682369a1359a2358d1358b",
  DOWNSPECIALGROUND: "32693369337:e337;a438;337:438;337:b337;a337:j3369326922692358a2357d2358t235723582357x2257b23572258b2358a225823582258c32683368g33693368k2358g2258b2257c2357m13472357g13472357u2358q33682358e22582358h22582358j3368c3268326932683269d33693368d",
  WAIT: "427:d528;a538;b438;538;d639;538;639;n538;i528:427:437:b4379h4279427:c428;b528;538;438;b538;d639;o538;i538:437:c4379h427:d528;a538;528;538;g639;q538;h538:437:c4379h427:d428;b528;538;438;a538;e639;n538;j437:427:b437:4379i427:b528:528;b538;d639;x538;e538:a528:437:4379d4368b4379c427:b528:b528;538;g639;o538;g538:c427:a437:4379d4368b4379c437:538:528:a538;528;538;b528;538;639;m639<639;j538;f437:427:437:4379h4279427:c428;b528;538;438;a538;d639;p538;i538:437:c4379h427:",
  ENTRANCE: "427:d528;a538;b438;538;d639;538;639;n538;i528:427:437:b4379h4279427:c428;b528;538;438;b538;d639;o538;i538:437:c4379h427:d528;a538;528;538;g639;q538;h538:437:c4379h427:d428;b528;538;438;a538;e639;n538;j437:427:b437:4379i427:b528:528;b538;d639;x538;e538:a528:437:4379d4368b4379c427:b528:b528;538;g639;o538;g538:c427:a437:4379d4368b4379c437:538:528:a538;528;538;b528;538;639;m639<639;j538;f437:427:437:4379h4279427:c428;b528;538;438;a538;d639;p538;i538:437:c4379h427:",
  SLEEP: "0000",
  REBIRTH: "427:d528;a538;b438;538;d639;538;639;n538;i528:427:437:b4379h4279427:c428;b528;538;438;b538;d639;o538;i538:437:c4379h427:d528;a538;528;538;g639;q538;h538:437:c4379h427:d428;b528;538;438;a538;e639;n538;j437:427:b437:4379i427:b528:528;b538;d639;x538;e538:a528:437:4379d4368b4379c427:b528:b528;538;g639;o538;g538:c427:a437:4379d4368b4379c437:538:528:a538;528;538;b528;538;639;m639<639;j538;f437:427:437:4379h4279427:c428;b528;538;438;a538;d639;p538;i538:437:c4379h427:",
  REBIRTHWAIT: "427:d528;a538;b438;538;d639;538;639;n538;i528:427:437:b4379h4279427:c428;b528;538;438;b538;d639;o538;i538:437:c4379h427:d528;a538;528;538;g639;q538;h538:437:c4379h427:d428;b528;538;438;a538;e639;n538;j437:427:b437:4379i427:b528:528;b538;d639;x538;e538:a528:437:4379d4368b4379c427:b528:b528;538;g639;o538;g538:c427:a437:4379d4368b4379c437:538:528:a538;528;538;b528;538;639;m639<639;j538;f437:427:437:4379h4279427:c428;b528;538;438;a538;d639;p538;i538:437:c4379h427:",
  GUARD: "2358",
  DEADLEFT: "",
  DEADRIGHT: "",
  DEADUP: "",
  DEADDOWN: "",
  AERIALTURN1: "247;g146;b247;",
  AERIALTURN2: "247;237;c247;c246:b",
  AERIALTURN3: "236:e246:e",
  AERIALTURN4: "236:h236924692369",
  AERIALTURN5: "3369c23693369a2369d",
  DOWNDAMAGE: "2569549=53:?a53:>559<a458<a348<358<15472557",
  MISSFOOT: "347;147<046<055905470459046;157<157=348=a146;a147<247<146;247;347;a448<449=b448<a449=",
  NEUTRALSPECIALAIR: "247;247<d348<b448<c348<b448<449=b448<347;247;a147<247;347;a146;b247;347;348<449=b448<146;c247;a347;348<348=b358=b247<146;c147<b247<a147<247<c247;b",
  NEUTRALSPECIALGROUND: "54:?64;@74=Ba84=Ba94>B94=A84<@74;?64:>549=448<a348<a448<449=d448<347;247;a147<247<247;a347;247;a146;b247;347;a348<449=c348<146;b247;a347;a348<348=449=a348=358=348<h448<i",
  OTTOTTO: "449=348<a247;156;055:a0559a156:256:246:",
  OTTOTTOWAIT: "257;357;a358<348<a348=i348<247;257;a256:156:05590548b0547b0548g0547d0548a0559g0459e05591559156:256:257;",
  NEUTRALSPECIALGROUNDTURN: "449>459>45:?a45:@45:?a449>348=258=d358=348=358=258=a157=258=a358=459=459>45:?c449>",
  THROWNMARTHFORWARD: "36<D07:D07;E08;F07;F26;D46;B56=Da",
  THROWNMARTHBACK: "57>F57>G97AH<6CJa",
  THROWNMARTHUP: "27:B37;Ba47;Ba36<D46<Da",
  THROWNMARTHDOWN: "26:B26;C16:C06:Ca36;C46<C36;Ba",
  THROWNPUFFFORWARD: "77>D87?F:7BI;7CJ<7DK=7DKd",
  THROWNPUFFBACK: "57<C67=Da77>Db57=E47=F77?G97@G97AH97BJ88@Hb",
  THROWNPUFFUP: "87?E;7CJ87?F66=Ca",
  THROWNPUFFDOWN: "67=D76?G86?F:7@F87?E68=D59<B48;A38:@38:Aa49;A49;Ba38;B48;Ba39;Ba4:;Ba4:;A3::A39:A38:Aa088@079A079B07:Cb17:Ca37:A48;Bb49;Ba49<C48;B49;Ba4:;Bb4:;A49<C48<Ca17:C07:C079Bb17:B17:C38;B38:A48;A49;Aa",
  FURASLEEPEND: "15462558357:448<449=a448<348<247;246:a256:246:a256:246:a256:b257;246:a247;a257;247;246:d247;256:o1559b1558a15471647d2669358<64;?84=Ab74<@65;?55:>458<458;357:3569357:357;448<",
  FURASLEEPLOOP: "15471546b05361546b05361546b1547c05471547k1558w1547r154615471546a",
  FURASLEEPSTART: "449>348=b459=c449=c449>b44:?54:?a54;@b449>257;16580636073606471559256:357:256925581547",
  THROWNFOXUP: "347;257<54:>148>",
  THROWNFOXFORWARD: "348=248=a258=157<a056<a056;a",
  THROWNFOXBACK: "459=64:>64;?459=146;",
  THROWNFOXDOWN: "449=b459=a64:>75<@95=A85=B75<Aa65;@65<A44:@247<0459167<055:a156;157<258>258=358=045:055:04480459045:0548a0448",
  THROWNFALCOBACK: "45:?65;@75<A65;@258>",
  APPEAL: "45:?a45:@45;B46;B56<B55<Bl65<B66<B56<Ba66<B65<B55<Be45;A45:@359?349?45:?459>45:?b45:@a45;A55;A65<A65<B75=B76=Ba76=C86>Cc86>De96?Dc86>Dc86>Ca86>D86>Ca76=Ca75=C75=Ba65<Aa55;@a45:?459>e54:?54;@a54;Ab64<A55;A45:@45:?a",
  THROWNFALCODOWN: "55:>a66;?75<A96>C86>C76=C55<B349>158>056;056<259?258>056;055:a0559055:",
  THROWNFALCOFORWARD: "359?258>a157=057=056<",
  THROWNFALCOUP: "358=258>65;@047=",
  THROWNFALCONBACK: "057=056<157<257<258=a258>359?259?158>056;056<a157=056<c157<",
  THROWNFALCONDOWN: "158>258=359?55<B65;@55:>249@259?35:@36:@36:A",
  THROWNFALCONFORWARD: "158>259?158?d159@a158>055:a056;065:066;056;a",
  THROWNFALCONUP: "259@258>a259?158?a259@a35:A258>057>a047>a",
  REBOUND: "468<458<358<a458<358<459=46:@369?469>46:?45:?d",
  FURAFURA: "459>f45:?459>b45:?a55:?c55;@c54;Aj54;@e55:?d45:?c44:?45:@d44:@54;@55;@54;@a54;A54;@c54;A55;A54;Aa55;A54;Ab55;Ab55;@c45:@45:?c459>c459=459>459=d459>459=a459>459=459>",
}));
ecb[CHARIDS.PUFF_ID].WALK = ecb[CHARIDS.PUFF_ID].WALKMIDDLE;
ecb[CHARIDS.PUFF_ID].SMASHTURN = ecb[CHARIDS.PUFF_ID].TILTTURN;
ecb[CHARIDS.PUFF_ID].LANDINGFALLSPECIAL = ecb[CHARIDS.PUFF_ID].LANDING;
ecb[CHARIDS.PUFF_ID].DAMAGEFLYN = ecb[CHARIDS.PUFF_ID].DAMAGEFLYHI;
ecb[CHARIDS.PUFF_ID].DAMAGEN2 = ecb[CHARIDS.PUFF_ID].DAMAGEHI1;
ecb[CHARIDS.PUFF_ID].SHIELDBREAKDOWNBOUND = ecb[CHARIDS.PUFF_ID].DOWNBOUND;
ecb[CHARIDS.PUFF_ID].SHIELDBREAKSTAND = ecb[CHARIDS.PUFF_ID].DOWNSTANDN;
ecb[CHARIDS.PUFF_ID].SHIELDBREAKFALL = ecb[CHARIDS.PUFF_ID].SHIELDBREAKFLY;
ecb[CHARIDS.PUFF_ID].DOWNSPECIALAIR = ecb[CHARIDS.PUFF_ID].DOWNSPECIALGROUND;
ecb[CHARIDS.PUFF_ID].THROWNFALCONDIVE = ecb[CHARIDS.PUFF_ID].DAMAGEFLYN;
