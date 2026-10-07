/**
 * falcon.js: template character data and action states (meleelight's Captain Falcon (Rally)): attributes, hitboxes, frame counts, ECB data and the character's own moves.
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
import { actionStates, airDrift, checkForDash, checkForIASA, checkForJump, checkForSmashTurn, checkForSmashes, checkForSpecials, checkForTiltTurn, checkForTilts, fastfall, reduceByTraction, setupActionStates, tiltTurnDashBuffer, turnOffHitboxes } from './shortcuts.js';
import { Vec2D, createHitbox, createHitboxObject } from './util.js';

// ---- attributes, hitboxes, frame counts, hitbox offsets ----
setCharAttributes(CHARIDS.FALCON_ID, {
  dashFrameMin: 15,
  dashFrameMax: 28,
  dInitV: 2.16,
  dMaxV: 2.3,
  dAccA: 0.15,
  dAccB: 0.01,
  dTInitV: 2,
  traction: 0.08,
  maxWalk: 0.85,
  jumpSquat: 4,
  sHopInitV: 1.9,
  fHopInitV: 3.1,
  gravity: 0.13,
  groundToAir: 0.75,
  jumpHmaxV: 2.1,
  jumpHinitV: 0.95,
  airMobA: 0.04,
  airMobB: 0.02,
  aerialHmaxV: 1.12,
  airFriction: 0.01,
  fastFallV: 3.5,
  terminalV: 2.9,
  walkInitV: 0.15,
  walkAcc: 0.1,
  walkMaxV: 0.85,
  djMultiplier: 0.9,
  djMomentum: 0.9,
  shieldScale: 14.375,
  modelScale: 0.96,
  weight: 104,
  waitAnimSpeed: 1,
  walljump: true,
  hurtboxOffset: [5, 17],
  ledgeSnapBoxOffset: [17, 8, 25],
  shieldOffset: [5, 34],
  charScale: 0.485,
  miniScale: 0.3,
  runTurnBreakPoint: 16,
  airdodgeIntangible: 25,
  wallJumpVelX: 1.4,
  wallJumpVelY: 3.1,
  shieldBreakVel: 2.5,
  multiJump: false,
  ecbScale: 1.45,
  walkAnimSpeed: 1,
  runAnimSpeed: 1
});
setIntangibility(CHARIDS.FALCON_ID, {
  "ESCAPEAIR": [4, 29],
  "ESCAPEB": [4, 19],
  "ESCAPEF": [4, 19],
  "ESCAPEN": [3, 20],
  "DOWNSTANDN": [1, 23],
  "DOWNSTANDB": [12, 18],
  "DOWNSTANDF": [1, 19],
  "TECHN": [1, 20],
  "TECHB": [1, 20],
  "TECHF": [1, 20]
});
setFrames(CHARIDS.FALCON_ID, {
  "WAIT": 60,
  "DASH": 28,
  "RUN": 21,
  "RUNBRAKE": 28,
  "RUNTURN": 22,
  "WALK": 20,
  "JUMPF": 35,
  "JUMPB": 50,
  "FALL": 8,
  "FALLAERIAL": 8,
  "FALLSPECIAL": 8,
  "SQUAT": 7,
  "SQUATWAIT": 79,
  "SQUATRV": 10,
  "JUMPAERIALF": 50,
  "JUMPAERIALB": 35,
  "PASS": 30,
  "GUARDON": 8,
  "GUARDOFF": 16,
  "CLIFFCATCH": 7,
  "CLIFFWAIT": 50,
  "DAMAGEFLYN": 29,
  "DAMAGEFALL": 29,
  "DAMAGEN2": 23,
  "LANDINGATTACKAIRF": 19,
  "LANDINGATTACKAIRB": 18,
  "LANDINGATTACKAIRU": 15,
  "LANDINGATTACKAIRD": 24,
  "LANDINGATTACKAIRN": 15,
  "ESCAPEB": 31,
  "ESCAPEF": 31,
  "ESCAPEN": 32,
  "DOWNBOUND": 26,
  "DOWNWAIT": 69,
  "DOWNSTANDN": 30,
  "DOWNSTANDB": 35,
  "DOWNSTANDF": 35,
  "TECHN": 26,
  "TECHB": 40,
  "TECHF": 40,
  "SHIELDBREAKFALL": 29,
  "SHIELDBREAKDOWNBOUND": 26,
  "SHIELDBREAKSTAND": 30,
  "FURAFURA": 100,
  "CAPTUREWAIT": 35,
  "CATCHWAIT": 30,
  "CAPTURECUT": 30,
  "CATCHCUT": 30,
  "CAPTUREDAMAGE": 20,
  "WALLDAMAGE": 51,
  "WALLTECH": 26,
  "WALLJUMP": 40,
  "OTTOTTO": 8,
  "OTTOTTOWAIT": 80,
  "THROWNMARTHUP": 12,
  "THROWNMARTHBACK": 7,
  "THROWNMARTHFORWARD": 14,
  "THROWNMARTHDOWN": 14,
  "THROWNPUFFUP": 8,
  "THROWNPUFFBACK": 26,
  "THROWNPUFFFORWARD": 9,
  "THROWNPUFFDOWN": 60,
  "THROWNFALCONUP": 14,
  "THROWNFALCONBACK": 19,
  "THROWNFALCONFORWARD": 17,
  "THROWNFALCONDOWN": 20,
  "THROWNFALCOUP": 7,
  "THROWNFALCOBACK": 9,
  "THROWNFALCOFORWARD": 11,
  "THROWNFALCODOWN": 34,
  "THROWNFOXUP": 8,
  "THROWNFOXBACK": 9,
  "THROWNFOXFORWARD": 10,
  "THROWNFOXDOWN": 32,
  "FURASLEEPSTART": 30,
  "FURASLEEPLOOP": 20,
  "FURASLEEPEND": 60,
  "STOPCEIL": 9,
  "TECHU": 26,
  "REBOUND": 17
});
setOffsets(CHARIDS.FALCON_ID, {
  ledgegetupquick: {
    id0: [new Vec2D(7.71, 15.64), new Vec2D(8.41, 12.40), new Vec2D(8.68, 11.86), new Vec2D(8.34, 10.81), new Vec2D(8.66, 9.29), new Vec2D(8.6, 7.84)],
    id1: [new Vec2D(7.1, 20.04), new Vec2D(15.17, 11.97), new Vec2D(15.08, 12.04), new Vec2D(14.67, 11.88), new Vec2D(14.75, 9.83), new Vec2D(14.31, 6.97)],
    id2: [new Vec2D(2.21, 8.03), new Vec2D(0.84, 7.21), new Vec2D(1.1, 6.07), new Vec2D(1.26, 4.60), new Vec2D(1.29, 3.22), new Vec2D(0.43, 2.77)]
  },
  ledgegetupslow: {
    id0: [new Vec2D(4.15, 1.57), new Vec2D(6.78, 2.95), new Vec2D(10.75, 7.56), new Vec2D(16.71, 10.08)],
    id1: [new Vec2D(4.69, 5.08), new Vec2D(5.71, 6.34), new Vec2D(7.83, 8.18), new Vec2D(13.18, 10.12)]
  },
  jab1: {
    id0: [new Vec2D(10.94, 11.13), new Vec2D(10.94, 11.13), new Vec2D(10.94, 11.13)],
    id1: [new Vec2D(5.47, 12.50), new Vec2D(5.47, 12.50), new Vec2D(5.47, 12.50)],
    id2: [new Vec2D(1.95, 11.13), new Vec2D(1.95, 11.13), new Vec2D(1.95, 11.13)]
  },
  jab2: {
    id0: [new Vec2D(15.62, 11.52), new Vec2D(15.62, 11.52), new Vec2D(15.62, 11.52)],
    id1: [new Vec2D(9.77, 11.52), new Vec2D(9.77, 11.52), new Vec2D(9.77, 11.52)],
    id2: [new Vec2D(3.91, 11.52), new Vec2D(3.91, 11.52), new Vec2D(3.91, 11.52)]
  },
  jab3Clean: {
    id0: [new Vec2D(7.16, 12.13), new Vec2D(7.33, 12.16), new Vec2D(7.46, 12.08), new Vec2D(7.524, 11.91)],
    id1: [new Vec2D(-1.98, 9.81), new Vec2D(-1.90, 9.88), new Vec2D(-1.83, 9.97), new Vec2D(-1.76, 10.06)]
  },
  jab3Late: {
    id0: [new Vec2D(7.506, 11.68), new Vec2D(7.435, 11.47), new Vec2D(7.33, 10.95)],
    id1: [new Vec2D(-1.71, 10.13), new Vec2D(-1.66, 10.18), new Vec2D(-1.63, 10.20)]
  },
  dtilt: {
    id0: [new Vec2D(15.50, 3.41), new Vec2D(19.57, 4.19), new Vec2D(19.52, 6.27), new Vec2D(16.44, 7.53), new Vec2D(15.47, 8.09), new Vec2D(14.41, 8.16)],
    id1: [new Vec2D(12.85, 4.35), new Vec2D(13.32, 4.26), new Vec2D(13.05, 4.91), new Vec2D(11.89, 5.43), new Vec2D(10.56, 5.68), new Vec2D(9.77, 5.67)],
    id2: [new Vec2D(4.89, 2.56), new Vec2D(4.51, 3.02), new Vec2D(4.57, 3.00), new Vec2D(4.74, 2.77), new Vec2D(4.85, 2.75), new Vec2D(4.94, 2.76)]
  },
  uptilt: {
    id0: [new Vec2D(3.48, 25.13), new Vec2D(12.78, 19.63), new Vec2D(16.05, 12.56), new Vec2D(16.20, 5.38), new Vec2D(15.88, 1.13)],
    id1: [new Vec2D(3.63, 16.92), new Vec2D(6.50, 14.35), new Vec2D(7.92, 11.41), new Vec2D(8.56, 8.33), new Vec2D(9.05, 5.66)]
  },
  ftilt: {
    id0: [new Vec2D(16.39, 12.92), new Vec2D(16.90, 12.88), new Vec2D(17.19, 13.01)],
    id1: [new Vec2D(8.82, 13.02), new Vec2D(9.30, 13.18), new Vec2D(9.55, 13.27)],
    id2: [new Vec2D(5.78, 12.78), new Vec2D(6.14, 12.89), new Vec2D(6.41, 12.94)]
  },
  dsmash1: {
    id0: [new Vec2D(18.17, 11.26), new Vec2D(17.30, 12.39), new Vec2D(16.59, 13.22), new Vec2D(14.22, 13.64)],
    id1: [new Vec2D(11.47, 11.52), new Vec2D(10.98, 12.49), new Vec2D(10.62, 12.55), new Vec2D(9.60, 12.73)]
  },
  dsmash2: {
    id0: [new Vec2D(-15.15, 7.87), new Vec2D(-15.55, 7.86), new Vec2D(-15.82, 7.78), new Vec2D(-15.70, 7.94)],
    id1: [new Vec2D(-8.35, 9.56), new Vec2D(-8.75, 9.58), new Vec2D(-9.01, 9.50), new Vec2D(-8.98, 9.65)]
  },
  upsmash1: {
    id0: [new Vec2D(3.39, 15.57), new Vec2D(3.45, 15.87)],
    id1: [new Vec2D(8.98, 7.81), new Vec2D(8.98, 7.81)],
    id2: [new Vec2D(4.46, 27.16), new Vec2D(3.37, 23.64)],
    id3: [new Vec2D(1.56, 20.02), new Vec2D(1.21, 19.56)]
  },
  upsmash2: {
    id0: [new Vec2D(1.39, 20.48), new Vec2D(1.79, 18.94)],
    id1: [new Vec2D(3.42, 15.82), new Vec2D(3.11, 14.81)],
    id2: [new Vec2D(3.49, 28.02), new Vec2D(5.59, 24.65)]
  },
  fsmash: {
    id0: [new Vec2D(2.29, 10.64), new Vec2D(3.96, 10.23), new Vec2D(4.1, 10.23), new Vec2D(4.1, 10.25)],
    id1: [new Vec2D(-0.3, 10.42), new Vec2D(7.04, 10.13), new Vec2D(7.24, 10.22), new Vec2D(7.23, 10.30)]
  },
  downattack1: {
    id0: [new Vec2D(-6.61, 10.65), new Vec2D(-6.08, 11.00)],
    id1: [new Vec2D(4.91, 11.10), new Vec2D(4.56, 11.37)],
    id2: [new Vec2D(-12.28, 10.60), new Vec2D(-11.57, 10.94)],
    id3: [new Vec2D(10.56, 11.47), new Vec2D(10.06, 11.58)]
  },
  downattack2: {
    id0: [new Vec2D(5.20, 13.96), new Vec2D(4.87, 14.64)],
    id1: [new Vec2D(-5.58, 14.74), new Vec2D(-5.75, 14.20)],
    id2: [new Vec2D(9.49, 15.48), new Vec2D(9.71, 16.73)],
    id3: [new Vec2D(-9.50, 16.00), new Vec2D(-10.70, 15.56)]
  },
  grab: {
    id0: [new Vec2D(7.03, 10.16), new Vec2D(7.03, 10.16)],
    id1: [new Vec2D(2.34, 10.16), new Vec2D(2.34, 10.16)]
  },
  pummel: {
    id0: [new Vec2D(11.72, 9.77)]
  },
  nair1: {
    id0: [new Vec2D(12.52, 8.75), new Vec2D(12.69, 8.71), new Vec2D(12.65, 8.39), new Vec2D(12.38, 7.76), new Vec2D(11.86, 6.93), new Vec2D(11.06, 6.00)],
    id1: [new Vec2D(4.97, 7.90), new Vec2D(4.96, 7.80), new Vec2D(4.87, 7.61), new Vec2D(4.71, 7.32), new Vec2D(4.46, 6.97), new Vec2D(4.11, 6.60)],
    id2: [new Vec2D(0.87, 7.44), new Vec2D(0.87, 7.44), new Vec2D(0.87, 7.45), new Vec2D(0.87, 7.45), new Vec2D(0.87, 7.45), new Vec2D(0.87, 7.44)]
  },
  nair2: {
    id0: [new Vec2D(12.19, 11.61), new Vec2D(12.24, 11.98), new Vec2D(12.24, 12.29), new Vec2D(12.20, 12.55), new Vec2D(12.12, 12.75), new Vec2D(12.00, 12.88), new Vec2D(11.85, 12.96), new Vec2D(11.67, 12.96), new Vec2D(11.45, 12.90), new Vec2D(11.21, 12.75)],
    id1: [new Vec2D(5.02, 9.05), new Vec2D(5.04, 9.20), new Vec2D(5.04, 9.33), new Vec2D(5.02, 9.44), new Vec2D(4.99, 9.53), new Vec2D(4.95, 9.59), new Vec2D(4.89, 9.64), new Vec2D(4.82, 9.66), new Vec2D(4.74, 9.65), new Vec2D(4.65, 9.62)],
    id2: [new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69), new Vec2D(0.99, 7.69)]
  },
  bairClean: {
    id0: [new Vec2D(-12.59, 5.32), new Vec2D(-11.55, 6.54), new Vec2D(-12.19, 6.11), new Vec2D(-11.66, 6.38)],
    id1: [new Vec2D(-8.85, 7.95), new Vec2D(-8.33, 8.56), new Vec2D(-8.66, 8.34), new Vec2D(-8.44, 8.43)],
    id2: [new Vec2D(-5.16, 10.57), new Vec2D(-5.16, 10.58), new Vec2D(-5.17, 10.56), new Vec2D(-5.27, 10.48)]
  },
  bairLate: {
    id0: [new Vec2D(-11.67, 6.34), new Vec2D(-11.64, 6.37), new Vec2D(-11.61, 6.44), new Vec2D(-11.57, 6.52)],
    id1: [new Vec2D(-8.46, 8.39), new Vec2D(-8.42, 8.40), new Vec2D(-8.38, 8.44), new Vec2D(-8.34, 8.48)],
    id2: [new Vec2D(-5.28, 10.45), new Vec2D(-5.26, 10.44), new Vec2D(-5.21, 10.44), new Vec2D(-5.15, 10.45)]
  },
  fairClean: {
    id0: [new Vec2D(5.27, 7.16), new Vec2D(5.11, 8.27), new Vec2D(5.87, 7.89)],
    id1: [new Vec2D(2.65, 9.46), new Vec2D(2.59, 9.52), new Vec2D(3.35, 9.47)]
  },
  fairLate: {
    id0: [new Vec2D(6.62, 7.44), new Vec2D(6.03, 7.35), new Vec2D(5.40, 7.47), new Vec2D(5.69, 7.45), new Vec2D(5.95, 7.39), new Vec2D(6.19, 7.32), new Vec2D(6.40, 7.27), new Vec2D(6.58, 7.23), new Vec2D(6.72, 7.19), new Vec2D(6.84, 7.16), new Vec2D(6.93, 7.13), new Vec2D(6.98, 7.09), new Vec2D(6.98, 7.48), new Vec2D(6.88, 7.98)],
    id1: [new Vec2D(4.18, 9.34), new Vec2D(3.71, 9.20), new Vec2D(3.15, 9.11), new Vec2D(3.41, 9.09), new Vec2D(3.65, 9.05), new Vec2D(3.87, 9.00), new Vec2D(4.05, 8.95), new Vec2D(4.21, 8.89), new Vec2D(4.32, 8.85), new Vec2D(4.41, 8.81), new Vec2D(4.45, 8.80), new Vec2D(4.46, 8.81), new Vec2D(4.42, 8.86), new Vec2D(4.33, 8.95)]
  },
  upairClean: {
    id0: [new Vec2D(5.40, 10.91), new Vec2D(4.82, 12.71), new Vec2D(3.49, 14.37), new Vec2D(1.64, 15.33)],
    id1: [new Vec2D(12.69, 8.78), new Vec2D(12.15, 14.82), new Vec2D(9.02, 19.61), new Vec2D(4.30, 22.46)]
  },
  upairMid: {
    id0: [new Vec2D(-0.60, 15.54), new Vec2D(-2.76, 14.95), new Vec2D(-4.45, 13.72), new Vec2D(-5.38, 12.31)],
    id1: [new Vec2D(-1.48, 23.10), new Vec2D(-6.92, 21.32), new Vec2D(-10.96, 17.64), new Vec2D(-12.85, 13.67)]
  },
  dair: {
    id0: [new Vec2D(-1.37, -3.36), new Vec2D(-1.18, -6.24), new Vec2D(-1.25, -5.06), new Vec2D(-1.22, -3.68), new Vec2D(-0.84, -2.31)],
    id1: [new Vec2D(-1.32, 2.86), new Vec2D(-1.27, 1.55), new Vec2D(-1.25, 1.99), new Vec2D(-1.20, 2.54), new Vec2D(0.13, 2.27)],
    id2: [new Vec2D(0.03, 9.01), new Vec2D(0.04, 8.86), new Vec2D(0.04, 8.75), new Vec2D(0.03, 8.70), new Vec2D(0.02, 8.68)]
  },
  falconpunchair: {
    id0: [new Vec2D(5.25, 12.03), new Vec2D(12.06, 10.31), new Vec2D(12.06, 10.31), new Vec2D(12.07, 10.31), new Vec2D(12.06, 10.31)],
    id1: [new Vec2D(7.12, 11.33), new Vec2D(7.39, 10.60), new Vec2D(7.39, 10.60), new Vec2D(7.4, 10.60), new Vec2D(7.39, 10.60)],
    id2: [new Vec2D(12.08, 11.56), new Vec2D(19.49, 7.97), new Vec2D(19.49, 7.97), new Vec2D(19.49, 7.97), new Vec2D(19.49, 7.97)]
  },
  falconpunchground: {
    id0: [new Vec2D(4.01, 10.20), new Vec2D(12.08, 9.97), new Vec2D(12.09, 9.92), new Vec2D(12.11, 9.86), new Vec2D(12.12, 9.81)],
    id1: [new Vec2D(8.47, 10.78), new Vec2D(7.43, 9.92), new Vec2D(7.44, 9.88), new Vec2D(7.47, 9.83), new Vec2D(7.48, 9.78)],
    id2: [new Vec2D(10.51, 9.75), new Vec2D(20.23, 9.98), new Vec2D(20.25, 9.94), new Vec2D(20.27, 9.89), new Vec2D(20.29, 9.84)]
  },
  raptorboostair: {
    id0: [new Vec2D(5.86, 3.17)],
    id1: [new Vec2D(5.86, 10.00)],
    id2: [new Vec2D(5.86, -4.83)]
  },
  raptorboostairhit: {
    id0: [new Vec2D(5.93, 16.77), new Vec2D(10.57, 15.07), new Vec2D(13.45, 8.2), new Vec2D(11.81, 1.71), new Vec2D(8.34, -2.01)]
  },
  raptorboostground: {
    id0: [new Vec2D(6.25, 3.17)],
    id1: [new Vec2D(6.25, 8.00)],
    id2: [new Vec2D(6.25, 14.83)]
  },
  raptorboostgroundhit: {
    id0: [new Vec2D(9.63, 5.12), new Vec2D(12.03, 9.73), new Vec2D(6.27, 20.72), new Vec2D(4.24, 20.81), new Vec2D(3.29, 20.83)]
  },
  falconkickairClean: {
    id0: [new Vec2D(-5.65, 6.68), new Vec2D(-3.99, 6.55), new Vec2D(-4.02, 6.53)],
    id1: [new Vec2D(-1.19, 8.25), new Vec2D(-1.14, 8.11), new Vec2D(-1.16, 8.1)]
  },
  falconkickairMid: {
    id0: [new Vec2D(-4.03, 6.52), new Vec2D(-4.05, 6.49), new Vec2D(-4.08, 6.47), new Vec2D(-4.09, 6.43), new Vec2D(-4.11, 6.4), new Vec2D(-4.14, 6.36), new Vec2D(-4.15, 6.32), new Vec2D(-4.17, 6.27)],
    id1: [new Vec2D(-1.18, 8.09), new Vec2D(-1.19, 8.06), new Vec2D(-1.22, 8.04), new Vec2D(-1.24, 8.01), new Vec2D(-1.25, 7.98), new Vec2D(-1.28, 7.94), new Vec2D(-1.29, 7.91), new Vec2D(-1.31, 7.87)]
  },
  falconkickairLate: {
    id0: [new Vec2D(-4.2, 6.23), new Vec2D(-4.21, 6.18), new Vec2D(-4.23, 6.12), new Vec2D(-4.26, 6.07)],
    id1: [new Vec2D(-1.33, 7.82), new Vec2D(-1.35, 7.78), new Vec2D(-1.36, 7.73), new Vec2D(-1.39, 7.68)]
  },
  falconkickland: {
    id0: [new Vec2D(7.03, 0), new Vec2D(7.03, 0)],
    id1: [new Vec2D(-7.03, 0), new Vec2D(-7.03, 0)],
    id2: [new Vec2D(0, 0), new Vec2D(0, 0)]
  },
  falconkickgroundClean: {
    id0: [new Vec2D(-0.57, 7.06), new Vec2D(-0.47, 7.45), new Vec2D(-0.38, 7.41)],
    id1: [new Vec2D(-5.65, 7.17), new Vec2D(-5.55, 7.13), new Vec2D(-5.46, 7.09)],
    id2: [new Vec2D(7.22, 6.76), new Vec2D(7.33, 7.82), new Vec2D(7.42, 7.79)]
  },
  falconkickgroundMid: {
    id0: [new Vec2D(-0.29, 7.40), new Vec2D(-0.21, 7.34), new Vec2D(-0.12, 7.31), new Vec2D(-0.04, 7.28), new Vec2D(0.03, 7.28), new Vec2D(0.1, 7.23), new Vec2D(0.18, 7.20), new Vec2D(0.25, 7.18)],
    id1: [new Vec2D(-5.37, 7.05), new Vec2D(-5.29, 7.02), new Vec2D(-5.2, 6.99), new Vec2D(-5.12, 6.96), new Vec2D(-5.05, 6.93), new Vec2D(-4.97, 6.91), new Vec2D(-4.9, 6.88), new Vec2D(-4.83, 6.86)],
    id2: [new Vec2D(7.51, 7.81), new Vec2D(7.6, 7.71), new Vec2D(7.68, 7.68), new Vec2D(7.76, 7.65), new Vec2D(7.83, 7.68), new Vec2D(7.91, 7.60), new Vec2D(7.98, 7.58), new Vec2D(8.05, 7.56)]
  },
  falconkickgroundLate: {
    id0: [new Vec2D(0.32, 7.16), new Vec2D(0.39, 7.14), new Vec2D(0.45, 7.12), new Vec2D(0.52, 7.11), new Vec2D(0.59, 7.09), new Vec2D(0.65, 7.07), new Vec2D(0.71, 7.06), new Vec2D(0.77, 7.06)],
    id1: [new Vec2D(-4.76, 6.84), new Vec2D(-4.69, 6.82), new Vec2D(-4.63, 6.80), new Vec2D(-4.56, 6.78), new Vec2D(-4.51, 6.77), new Vec2D(-4.43, 6.75), new Vec2D(-4.37, 6.73), new Vec2D(-4.3, 6.72)],
    id2: [new Vec2D(8.12, 7.54), new Vec2D(8.19, 7.52), new Vec2D(8.26, 7.50), new Vec2D(8.32, 7.48), new Vec2D(8.39, 7.46), new Vec2D(8.45, 7.45), new Vec2D(8.51, 7.43), new Vec2D(8.57, 7.47)]
  },
  falcondive1: {
    id0: [new Vec2D(6.0, 8.60)],
    id1: [new Vec2D(13.33, 8.60)]
  },
  falcondive2: {
    id0: []
  },
  falcondivethrowextra: {
    id0: [new Vec2D(-0.98, 10.59), new Vec2D(-0.93, 10.35)]
  },
  dashattackClean: {
    id0: [new Vec2D(2.31, 6.14), new Vec2D(2.12, 6.18), new Vec2D(2.05, 6.23)]
  },
  dashattackLate: {
    id0: [new Vec2D(2.02, 6.29), new Vec2D(1.98, 6.34), new Vec2D(1.94, 6.38), new Vec2D(1.9, 6.41), new Vec2D(1.85, 6.43), new Vec2D(1.8, 6.44), new Vec2D(1.74, 6.46)]
  },
  throwforwardextra: {
    id0: [new Vec2D(5.92, 8.41), new Vec2D(6.20, 9.42), new Vec2D(6.21, 9.62), new Vec2D(6.22, 9.75), new Vec2D(6.25, 9.80), new Vec2D(6.26, 9.76), new Vec2D(6.24, 9.62)],
    id1: [new Vec2D(1.76, 10.35), new Vec2D(2.20, 10.77), new Vec2D(2.12, 10.86), new Vec2D(2.12, 10.89), new Vec2D(2.15, 10.96), new Vec2D(2.18, 10.99), new Vec2D(2.19, 10.94)],
    id2: [new Vec2D(2.62, 12.93), new Vec2D(2.87, 13.32), new Vec2D(2.92, 13.35), new Vec2D(2.91, 13.38), new Vec2D(2.88, 13.44), new Vec2D(2.88, 13.47), new Vec2D(2.91, 13.42)]
  },
  throwupextra: {
    id0: [new Vec2D(6.98, 11.76), new Vec2D(6.82, 11.81), new Vec2D(6.78, 11.82), new Vec2D(6.83, 11.81), new Vec2D(6.92, 11.82), new Vec2D(7.38, 17.36), new Vec2D(7.39, 18.21), new Vec2D(6.98, 18.55), new Vec2D(6.73, 17.90), new Vec2D(6.40, 17.19), new Vec2D(6.40, 17.98), new Vec2D(6.35, 18.71), new Vec2D(6.29, 18.12), new Vec2D(6.21, 17.46), new Vec2D(6.43, 17.87), new Vec2D(6.63, 18.23), new Vec2D(6.75, 17.89), new Vec2D(6.74, 17.38)],
    id1: [new Vec2D(3.83, 9.27), new Vec2D(3.87, 9.10), new Vec2D(3.87, 9.09), new Vec2D(3.87, 9.11), new Vec2D(3.88, 9.12), new Vec2D(6.10, 12.47), new Vec2D(5.82, 13.06), new Vec2D(5.69, 13.27), new Vec2D(5.89, 12.89), new Vec2D(5.98, 12.51), new Vec2D(5.86, 12.99), new Vec2D(5.63, 13.42), new Vec2D(5.77, 13.07), new Vec2D(5.83, 12.68), new Vec2D(5.74, 12.89), new Vec2D(5.62, 13.08), new Vec2D(5.67, 12.84), new Vec2D(5.73, 12.48)],
    id2: [new Vec2D(2.60, 11.69), new Vec2D(2.63, 11.54), new Vec2D(2.62, 11.52), new Vec2D(2.63, 11.54), new Vec2D(2.65, 11.55), new Vec2D(3.46, 12.00), new Vec2D(3.38, 11.94), new Vec2D(3.39, 11.87), new Vec2D(3.30, 12.10), new Vec2D(3.28, 12.34), new Vec2D(3.28, 12.17), new Vec2D(3.32, 12.02), new Vec2D(3.21, 12.15), new Vec2D(3.14, 12.29), new Vec2D(3.13, 12.16), new Vec2D(3.14, 12.01), new Vec2D(3.09, 12.00), new Vec2D(3.05, 11.99)]
  },
  throwbackextra: {
    id0: [new Vec2D(-10.39, 20.13), new Vec2D(-10.40, 20.13), new Vec2D(-10.41, 20.13), new Vec2D(-10.43, 20.13), new Vec2D(-10.45, 20.13), new Vec2D(-10.46, 20.13), new Vec2D(-10.47, 20.14), new Vec2D(-10.47, 20.16)],
    id1: [new Vec2D(-3.82, 15.88), new Vec2D(-3.82, 15.89), new Vec2D(-3.83, 15.90), new Vec2D(-3.84, 15.91), new Vec2D(-3.85, 15.92), new Vec2D(-3.85, 15.93), new Vec2D(-3.86, 15.95), new Vec2D(-3.87, 15.97)],
    id2: [new Vec2D(-0.18, 13.70), new Vec2D(-0.19, 13.71), new Vec2D(-0.19, 13.72), new Vec2D(-0.19, 13.74), new Vec2D(-0.20, 13.75), new Vec2D(-0.21, 13.77), new Vec2D(-0.21, 13.79), new Vec2D(-0.22, 13.81)]
  },
  thrown: {
    id0: [new Vec2D(2.1, 12.7)]
  }
});
for (let k = 0; k < 20; k++) {
  offsets[CHARIDS.FALCON_ID].falcondive2.id0.push(new Vec2D(6, 8.6));
}
setHitBoxes(CHARIDS.FALCON_ID, {
  fairClean: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].fairClean.id0, 5.078, 18, 32, 100, 24, 0, 4, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].fairClean.id1, 3.515, 18, 32, 100, 24, 0, 4, 0, 1, 1)),
  fairLate: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].fairLate.id0, 5.078, 6, 361, 80, 35, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].fairLate.id1, 3.515, 6, 361, 80, 35, 0, 0, 0, 1, 1)),
  bairClean: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].bairClean.id0, 4.687, 14, 361, 100, 20, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].bairClean.id1, 4.687, 14, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].bairClean.id2, 3.906, 14, 361, 100, 0, 0, 0, 0, 1, 1)),
  bairLate: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].bairLate.id0, 4.687, 8, 361, 100, 20, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].bairLate.id1, 4.687, 8, 361, 100, 0, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].bairLate.id2, 3.906, 8, 361, 100, 0, 0, 0, 0, 1, 1)),
  nair1: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].nair1.id0, 4.297, 6, 82, 100, 0, 40, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].nair1.id1, 5.468, 5, 78, 100, 0, 40, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].nair1.id1, 4.297, 6, 74, 100, 0, 40, 0, 0, 1, 1)),
  nair2: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].nair2.id0, 4.297, 7, 361, 100, 40, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].nair2.id1, 4.297, 7, 361, 100, 40, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].nair2.id1, 4.297, 7, 361, 100, 40, 0, 0, 0, 1, 1)),
  dair: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].dair.id0, 6.640, 16, 270, 100, 40, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].dair.id1, 5.859, 16, 270, 100, 40, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].dair.id2, 5.468, 16, 290, 100, 40, 0, 0, 0, 1, 1)),
  upairClean: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].upairClean.id0, 3.906, 13, 361, 100, 30, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].upairClean.id1, 4.687, 13, 361, 100, 10, 0, 0, 0, 1, 1)),
  upairMid: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].upairMid.id0, 3.906, 12, 30, 80, 8, 0, 0, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].upairMid.id1, 4.687, 10, 30, 80, 8, 0, 0, 0, 1, 1)),
  falcondive1: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falcondive1.id0, 2.734, 0, 361, 100, 0, 0, 2, 3, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falcondive1.id0, 4.297, 0, 361, 100, 0, 0, 2, 3, 1, 1)),
  falcondive2: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falcondive2.id0, 2.734, 0, 361, 100, 0, 0, 2, 3, 1, 1)),
  falcondivethrow: new createHitboxObject(new createHitbox(new Vec2D(0, 0), 0, 12, 361, 82, 40, 0, 3, 0, 1, 1)),
  falcondivethrowextra: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falcondivethrowextra.id0, 7.812, 6, 0, 50, 70, 0, 0, 0, 1, 1, true)),
  dtilt: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].dtilt.id0, 3.906, 12, 80, 75, 25, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].dtilt.id1, 3.906, 12, 70, 75, 25, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].dtilt.id2, 3.906, 12, 60, 75, 25, 0, 0, 1, 1, 1)),
  uptilt: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].uptilt.id0, 4.687, 13, 361, 80, 50, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].uptilt.id1, 3.125, 13, 361, 80, 50, 0, 0, 1, 1, 1)),
  ftilt: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].ftilt.id0, 4.297, 11, 361, 100, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].ftilt.id1, 3.515, 11, 361, 100, 10, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].ftilt.id2, 3.515, 11, 361, 100, 10, 0, 0, 1, 1, 1)),
  dashattackClean: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].dashattackClean.id0, 5.859, 10, 361, 90, 22, 0, 0, 1, 1, 1)),
  dashattackLate: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].dashattackLate.id0, 3.125, 7, 361, 50, 10, 0, 0, 1, 1, 1)),
  jab1: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].jab1.id0, 3.515, 2, 80, 100, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].jab1.id1, 3.515, 2, 80, 100, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].jab1.id2, 2.344, 2, 80, 100, 20, 0, 0, 1, 1, 1)),
  jab2: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].jab2.id0, 3.515, 3, 80, 100, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].jab2.id1, 3.515, 3, 80, 100, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].jab2.id2, 2.734, 3, 80, 100, 20, 0, 0, 1, 1, 1)),
  jab3Clean: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].jab3Clean.id0, 5.079, 8, 361, 100, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].jab3Clean.id1, 3.515, 8, 361, 100, 20, 0, 0, 1, 1, 1)),
  jab3Late: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].jab3Late.id0, 3.906, 6, 361, 100, 0, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].jab3Late.id1, 3.125, 6, 361, 100, 0, 0, 0, 1, 1, 1)),
  fsmash: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].fsmash.id0, 3.515, 20, 361, 100, 24, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].fsmash.id1, 3.515, 20, 361, 100, 24, 0, 3, 1, 1, 1)),
  upsmash1: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].upsmash1.id0, 5.468, 8, 90, 100, 0, 80, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].upsmash1.id1, 4.687, 8, 100, 100, 0, 100, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].upsmash1.id2, 3.906, 14, 80, 105, 30, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].upsmash1.id3, 3.906, 14, 90, 105, 30, 0, 0, 1, 1, 1)),
  upsmash2: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].upsmash2.id0, 3.906, 13, 90, 128, 30, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].upsmash2.id1, 3.906, 13, 90, 126, 30, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].upsmash2.id2, 3.906, 12, 80, 110, 30, 0, 0, 1, 1, 1)),
  dsmash1: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].dsmash1.id0, 3.906, 18, 361, 100, 30, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].dsmash1.id1, 3.906, 18, 361, 100, 30, 0, 0, 1, 1, 1)),
  dsmash2: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].dsmash2.id0, 3.515, 16, 361, 100, 20, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].dsmash2.id1, 3.515, 16, 361, 100, 20, 0, 0, 1, 1, 1)),
  grab: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].grab.id0, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].grab.id1, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1)),
  downattack1: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].downattack1.id0, 4.687, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].downattack1.id1, 4.687, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].downattack1.id2, 6.250, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].downattack1.id3, 6.250, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  downattack2: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].downattack2.id0, 4.687, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].downattack2.id1, 4.687, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].downattack2.id2, 6.250, 6, 361, 50, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].downattack1.id3, 6.250, 6, 361, 50, 80, 0, 0, 1, 1, 1)),
  falconkickgroundClean: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundClean.id0, 3.906, 15, 361, 70, 50, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundClean.id1, 2.734, 15, 361, 70, 50, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundClean.id2, 4.297, 15, 361, 70, 50, 0, 3, 1, 1, 1)),
  falconkickgroundMid: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundMid.id0, 3.906, 12, 80, 60, 50, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundMid.id1, 2.734, 12, 80, 60, 50, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundMid.id2, 4.297, 12, 80, 60, 50, 0, 3, 1, 1, 1)),
  falconkickgroundLate: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundLate.id0, 3.906, 9, 90, 50, 50, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundLate.id1, 2.734, 9, 90, 50, 50, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickgroundLate.id2, 4.297, 9, 90, 50, 50, 0, 3, 1, 1, 1)),
  falconkickairClean: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickairClean.id0, 3.906, 15, 361, 70, 40, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickairClean.id1, 4.687, 15, 361, 70, 40, 0, 3, 1, 1, 1)),
  falconkickairMid: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickairMid.id0, 3.906, 13, 361, 65, 40, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickairMid.id1, 4.687, 13, 361, 65, 40, 0, 3, 1, 1, 1)),
  falconkickairLate: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickairLate.id0, 3.906, 11, 361, 60, 40, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickairLate.id1, 4.687, 11, 361, 60, 40, 0, 3, 1, 1, 1)),
  falconkickland: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickland.id0, 3.906, 9, 80, 20, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickland.id1, 3.906, 9, 80, 20, 80, 0, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconkickland.id2, 3.906, 9, 80, 20, 80, 0, 0, 1, 1, 1)),
  falconpunchground: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconpunchground.id0, 3.906, 27, 361, 102, 30, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconpunchground.id1, 3.515, 25, 361, 102, 30, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconpunchground.id2, 4.883, 23, 361, 102, 30, 0, 3, 1, 1, 1)),
  falconpunchair: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].falconpunchair.id0, 5.273, 27, 361, 102, 40, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconpunchair.id1, 4.687, 25, 361, 102, 40, 0, 3, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].falconpunchair.id2, 4.883, 23, 361, 102, 40, 0, 3, 1, 1, 1)),
  raptorboostground: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostground.id0, 4.000, 0, 361, 0, 0, 0, 8, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostground.id1, 4.000, 0, 361, 0, 0, 0, 8, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostground.id2, 4.000, 0, 361, 0, 0, 0, 8, 0, 1, 1)),
  raptorboostair: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostair.id0, 4.000, 0, 361, 0, 0, 0, 8, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostair.id1, 4.000, 0, 361, 0, 0, 0, 8, 0, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostair.id2, 4.000, 0, 361, 0, 0, 0, 8, 0, 1, 1)),
  raptorboostgroundhit: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostgroundhit.id0, 7.500, 7, 90, 80, 78, 0, 3, 1, 1, 1)),
  raptorboostairhit: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].raptorboostairhit.id0, 7.500, 7, 270, 70, 60, 0, 3, 0, 1, 1)),
  ledgegetupquick: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].ledgegetupquick.id0, 4.687, 10, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].ledgegetupquick.id1, 6.250, 10, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].ledgegetupquick.id2, 4.687, 10, 361, 100, 0, 90, 0, 1, 1, 1)),
  ledgegetupslow: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].ledgegetupslow.id0, 6.250, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[CHARIDS.FALCON_ID].ledgegetupslow.id1, 4.687, 8, 361, 100, 0, 90, 0, 1, 1, 1)),
  pummel: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].pummel.id0, 5.078, 3, 80, 100, 0, 30, 0, 0, 1, 1)),
  throwup: new createHitboxObject(new createHitbox(new Vec2D(8.63, 11.15), 0, 3, 85, 105, 70, 0, 0, 0, 1, 1)),
  throwdown: new createHitboxObject(new createHitbox(new Vec2D(8.58, 3.25), 0, 7, 65, 34, 75, 0, 0, 0, 1, 1)),
  throwback: new createHitboxObject(new createHitbox(new Vec2D(-11.36, 22.23), 0, 4, 135, 130, 30, 0, 0, 0, 1, 1)),
  throwforward: new createHitboxObject(new createHitbox(new Vec2D(7.54, 12.51), 0, 4, 45, 105, 45, 0, 0, 0, 1, 1)),
  throwforwardextra: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].throwforwardextra.id0, 3.906, 5, 361, 110, 0, 0, 0, 0, 1, 1, true), new createHitbox(offsets[CHARIDS.FALCON_ID].throwforwardextra.id1, 1.953, 5, 361, 110, 0, 0, 0, 0, 1, 1, true), new createHitbox(offsets[CHARIDS.FALCON_ID].throwforwardextra.id2, 1.953, 5, 361, 110, 0, 0, 0, 0, 1, 1, true)),
  throwupextra: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].throwupextra.id0, 3.515, 4, 361, 100, 0, 0, 0, 0, 1, 1, true), new createHitbox(offsets[CHARIDS.FALCON_ID].throwupextra.id1, 3.125, 4, 361, 100, 0, 0, 0, 0, 1, 1, true), new createHitbox(offsets[CHARIDS.FALCON_ID].throwupextra.id2, 2.734, 4, 361, 100, 0, 0, 0, 0, 1, 1, true)),
  throwbackextra: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].throwbackextra.id0, 3.906, 5, 361, 0, 0, 0, 0, 0, 1, 1, true), new createHitbox(offsets[CHARIDS.FALCON_ID].throwbackextra.id1, 3.515, 5, 361, 0, 0, 0, 0, 0, 1, 1, true), new createHitbox(offsets[CHARIDS.FALCON_ID].throwbackextra.id2, 2.734, 5, 361, 0, 0, 0, 0, 0, 1, 1, true)),
  thrown: new createHitboxObject(new createHitbox(offsets[CHARIDS.FALCON_ID].thrown.id0, 3.906, 4, 361, 50, 20, 0, 1, 0, 1, 1))
});
for (let l = 0; l < 20; l++) {
  offsets[CHARIDS.FALCON_ID].thrown.id0.push(new Vec2D(0, 12));
}
setChars(CHARIDS.FALCON_ID, new charObject(CHARIDS.FALCON_ID));


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
    pl.hitboxes.id[2] = pl.charHitboxes.jab1.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 2 && pl.timer < 25 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 3) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 3 && pl.timer < 6) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 6) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 8 && pl.phys.jabCombo) {
      M.JAB2.init(p, input);
      return true;
    } else if (pl.timer > 21) {
      S.WAIT.init(p, input);
      return true;
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
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 1 && pl.timer < 26 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 5 && pl.timer < 8) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 7 && pl.phys.jabCombo) {
      M.JAB3.init(p, input);
      return true;
    } else if (pl.timer > 20) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.JAB3 = {
  name: "JAB3",
  setVelocities: [0, 0.00024, 0.00024, -0.00047, 3.76443, 3.40589, 0.00972, 0.00748, 0.00538, 0.00342, 0.0016, -0.0007, -0.0016, -0.00299, -0.00423, -0.00533, -0.00629, -0.0071, 0.00051, 0.00051, 0.0005, 0.0005, 0.00051, 0.00051, 0.0005, 0.0005, 0.0005, 0.00051, 0.0005, 0.0005, 0.0005, 0.00051],
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JAB3";
    pl.timer = 0;
    pl.phys.jabCombo = false;
    pl.hitboxes.id[0] = pl.charHitboxes.jab3Clean.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.jab3Clean.id1;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      pl.phys.cVel.x = this.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 13) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        pl.hitboxes.id[0] = pl.charHitboxes.jab3Late.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.jab3Late.id1;
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 13) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 32) {
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
      if (pl.timer === 10) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 10 && pl.timer < 16) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 16) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 35) {
      S.SQUATWAIT.init(p, input);
      return true;
    } else if (pl.timer > 34) {
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
      if (pl.timer === 17) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 17 && pl.timer < 22) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 22) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 37) {
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
      if (pl.timer === 9) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 9 && pl.timer < 12) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 12) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 29) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.FORWARDSMASH = {
  name: "FORWARDSMASH",
  setVelocities: [-1.11304, -0.988, -0.4595, -0.46209, -0.44062, -0.39509, -0.32551, -0.23188, -0.11419, 0.02756, 0.10871, 0.15599, 0.2674, 0.44294, 0.68261, 0.98641, 1.35433, 3.99021, 6.03557, 3.85735, 1.28591, 1.28591, -1.76748, -1.66068, 0.64071, 0.76125, 0.19715, 0.12143, 0.06216, 0.01934, -0.00704, -0.01698, -0.0159, -0.0145, -0.01268, -0.01044, -0.00777, -0.00469, -0.00118, 0.00275, 0.00561, 0.00714, 0.00872, 0.01033, 0.012, 0.0137, 0.01545, 0.01688, 0.01703, 0.01579, 0.01317, 0.00916, 0.00375, 0.00118, 0.00201, 0.00231, 0.00207, 0.00932, 0.02229, 0.03206, 0.03863, 0.04201, 0.04218, 0.03916],
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FORWARDSMASH";
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.fsmash.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fsmash.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 10) {
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
      if (pl.phys.charging) {
        pl.phys.cVel.x = 0;
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 1] * pl.phys.face;
      }
      if (pl.timer === 18) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 18 && pl.timer < 22) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 22) {
        turnOffHitboxes(p);
      }
      if (pl.timer >= 18 && pl.timer < 22) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 64) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 59) {
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
    pl.hitboxes.id[2] = pl.charHitboxes.upsmash1.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.upsmash1.id3;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 8) {
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
      if (pl.timer === 21) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 21 && pl.timer < 23) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 23) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 27) {
        pl.hitboxes.id[0] = pl.charHitboxes.upsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.upsmash2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.upsmash2.id2;
        pl.hitboxes.frame = 0;
        pl.hitboxes.active = [true, true, true, false];
      }
      if (pl.timer === 29) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 54) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 39) {
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
    pl.hitboxes.id[0] = pl.charHitboxes.dsmash1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dsmash1.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 14) {
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
      if (pl.timer === 19) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 19 && pl.timer < 23) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 23) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 29) {
        pl.hitboxes.id[0] = pl.charHitboxes.dsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.dsmash2.id1;
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 29 && pl.timer < 33) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 33) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 49) {
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
    pl.IASATimer = 36;
    pl.hitboxes.id[0] = pl.charHitboxes.fairClean.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fairClean.id1;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 6) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 14) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 14 && pl.timer < 31) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 17) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.fairLate.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.fairLate.id1;
        pl.hitboxes.active = [true, true, false, false];
      }
      if (pl.timer === 31) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 35) {
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
    pl.IASATimer = 29;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.bairClean.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.bairClean.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.bairClean.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 6) {
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 10) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 10 && pl.timer < 18) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 14) {
        pl.hitboxes.id[0] = pl.charHitboxes.bairLate.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.bairLate.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.bairLate.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 18) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 21) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 35) {
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
    pl.phys.autoCancel = false;
    pl.inAerial = true;
    pl.IASATimer = 30;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.upairClean.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.upairClean.id1;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 14) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.upairMid.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.upairMid.id1;
        pl.hitboxes.active = [true, true, false, false];
      }
      if (pl.timer === 14) {
        turnOffHitboxes(p);
      } else if (pl.timer === 22) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 33) {
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
    pl.IASATimer = 38;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dair.id2;
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
      if (pl.timer === 16) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 16 && pl.timer < 21) {
        pl.hitboxes.frames++;
      }
      if (pl.timer === 21) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 36) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 44) {
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
    pl.IASATimer = 44;
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
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 7 && pl.timer < 13) {
        pl.hitboxes.frames++;
      }
      if (pl.timer === 13) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 20) {
        pl.hitboxes.id[0] = pl.charHitboxes.nair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.nair2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.nair2.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 20 && pl.timer < 30) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 30) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 34) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 44) {
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
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKDASH";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dashattackClean.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer < 27) {
        pl.phys.cVel.x = 1.30577 * pl.phys.face;
      } else {
        pl.phys.cVel.x = 0.34643 * pl.phys.face;
      }
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 7 && pl.timer < 17) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
        pl.hitboxes.id[0] = pl.charHitboxes.dashattackLate.id0;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 17) {
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
    } else if (pl.timer > 37) {
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
  setVelocities: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [-0.00191, -0.00078], [-0.00464, -0.00189], [-0.00573, -0.00233], [-0.00518, -0.00211], [-0.003, -0.00122], [0.00082, 0.00033], [0.00628, 0.00255], [0.01337, 0.00544], [0.34782, 2.55553], [0.35129, 2.45635], [0.35466, 2.35818], [0.35790, 2.26101], [0.36104, 2.16485], [0.36407, 2.06970], [0.36698, 1.97556], [0.36979, 1.88242], [0.37248, 1.79029], [0.37506, 1.69916], [0.37753, 1.60904], [0.37989, 1.51993], [0.38213, 1.43183], [0.38427, 1.34473], [0.38629, 1.25863], [0.38820, 1.17355], [0.39, 1.08947], [0.39169, 1.00640], [0.39326, 0.92434], [0.39473, 0.84328], [0.39608, 0.76322], [0.39732, 0.68419], [0.39845, 0.60614], [0.39947, 0.52912], [0.40038, 0.45309], [0.40117, 0.37807], [0.40186, 0.30406], [0.40243, 0.23106], [0.40290, 0.15906], [0.40324, 0.08807], [0.40349, 0.01808], [0.40361, -0.05088], [0.40362, -0.11886], [0.40353, -0.27163], [0.40332, -0.49663], [0.40300, -0.70176], [0.40257, -0.88704], [0.40203, -1.05243], [0.40137, -1.19797], [0.40061, -1.32366], [0.39973, -1.42945], [0.39874, -1.51540], [0.39764, -1.58148], [0.39643, -1.62769], [0.39511, -1.65403], [0.39367, -1.66051], [0.39212, -1.64713], [0.39047, -1.61388], [0.38869, -1.56076], [0.38682, -1.48778], [0.38482, -1.39494]],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPSPECIAL";
    pl.timer = 0;
    pl.phys.cVel = new Vec2D(0, 0);
    pl.phys.fastfalled = false;
    pl.phys.upbAngleMultiplier = 0;
    turnOffHitboxes(p);
    pl.phys.landingMultiplier = 0.882353;
    pl.hitboxes.id[0] = pl.charHitboxes.falcondive1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.falcondive1.id1;
    M.UPSPECIAL.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.UPSPECIAL.interrupt(p, input)) {
      if (pl.timer === 13) {
        pl.phys.grounded = false;
        if (input[p][0].lsX * pl.phys.face < -0.28) {
          pl.phys.face *= -1;
        }
      }
      if (pl.timer > 1) {
        pl.phys.cVel.x -= M.UPSPECIAL.setVelocities[pl.timer - 2][0] * pl.phys.face;
      }
      pl.phys.cVel.x += input[p][0].lsX * 0.044;
      if (Math.abs(input[p][0].lsX) < 0.28) {
        pl.phys.cVel.x = 0;
      }
      if (pl.phys.cVel.x < -0.952) {
        pl.phys.cVel.x = -0.952;
      }
      if (pl.phys.cVel.x > 0.952) {
        pl.phys.cVel.x = 0.952;
      }
      pl.phys.cVel.x += M.UPSPECIAL.setVelocities[pl.timer - 1][0] * pl.phys.face;
      pl.phys.cVel.y = M.UPSPECIAL.setVelocities[pl.timer - 1][1];
      if (pl.timer === 13) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 13 && pl.timer < 34) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 14) {
        pl.hitboxes.id[0] = pl.charHitboxes.falcondive2.id0;
        pl.hitboxes.frame = 0;
        pl.hitboxes.active = [true, false, false, false];
      }
      if (pl.timer === 34) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 64) {
      S.FALLSPECIAL.init(p, input);
      return true;
    } else if (pl.phys.grabbing !== -1) {
      pl.phys.pos.x = player[pl.phys.grabbing].phys.pos.x;
      pl.phys.pos.y = player[pl.phys.grabbing].phys.pos.y;
      M.UPSPECIALCATCH.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    const pl = player[p];
    if (pl.phys.cVel.y + pl.phys.kVel.y <= 0 || pl.phys.ECBp[0].y <= pl.phys.ECB1[0].y || pl.phys.pos.y <= pl.phys.posPrev.y) {
      S.LANDINGFALLSPECIAL.init(p, input);
    }
  }
};

M.UPSPECIALCATCH = {
  name: "UPSPECIALCATCH",
  canPassThrough: true,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: false,
  reverseModel: false,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPSPECIALCATCH";
    pl.timer = 0;
    pl.phys.cVel = new Vec2D(0, 0);
    pl.phys.fastfalled = false;
    pl.phys.upbAngleMultiplier = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.falcondivethrowextra.id0;
    pl.phys.landingMultiplier = 0.882353;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer == 2) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
        for (var n = 0; n < 3; n++) {}
      }
      if (pl.timer == 4) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 16) {
      if (pl.phys.grabbing != -1) {
        pl.hitboxes.id[0] = pl.charHitboxes.falcondivethrow.id0;
        pl.hitboxes.active = [true, false, false, false];
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
      M.UPSPECIALTHROW.init(p, input);
      return true;
    } else {
      const grabbing = pl.phys.grabbing;
      if (grabbing === -1) {
        return;
      }
      if (pl.timer <= 16 && player[grabbing].phys.grabbedBy !== p) {
        console.log("exiting");
        M.UPSPECIALTHROW.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  },
  land: function (p, input) {}
};

M.UPSPECIALTHROW = {
  name: "UPSPECIALTHROW",
  canPassThrough: true,
  canGrabLedge: [true, false],
  setVelocities: [[0, 0], [-0.65273, 6.17333], [-0.65273, 3.41661], [-0.65273, 3.25598], [-0.65273, 3.03272], [-0.65273, 2.83681], [-0.65273, 2.63826], [-0.65273, 2.43708], [-0.65273, 2.23325], [-0.65273, 2.02678], [-0.65273, 1.81767], [-0.65273, 1.60591], [-0.65273, 1.39153], [-0.65273, 1.17448], [-0.65273, 0.95481], [-0.65273, 0.7325], [-0.72509, 0.59599], [-0.67937, 0.5477], [-0.63528, 0.50043], [-0.59311, 0.45418], [-0.55256, 0.40895], [-0.51373, 0.36472], [-0.47661, 0.3125], [-0.44122, 0.27931], [-0.40755, 0.23812], [-0.3756, 0.19794], [-0.34537, 0.15879], [-0.31686, 0.12064], [-0.29007, 0.08351], [-0.265, 0.04739], [-0.24165, 0.01228], [-0.22003, -0.02181], [-0.20012, -0.05488], [-0.18193, -0.08695], [-0.16547, -0.11801], [-0.15071, -0.14804], [-0.13769, -0.17707], [-0.12639, -0.20508], [-0.1168, -0.23207], [-0.10894, -0.25807], [-0.10279, -0.28303], [-0.09896, -0.307], [-0.09616, -0.32994], [-0.09319, -0.35187], [-0.09003, -0.37279], [-0.08668, -0.6927], [-0.08315, -1.01158], [-0.07944, -1.32946], [-0.07555, -1.64633], [-0.07146, -1.96218], [-0.06721, -2.27702], [-0.06276, -2.59084], [-0.05813, -2.9], [-0.05331, -2.9], [-0.04832, -2.9], [-0.04313, -2.9], [-0.03777, -2.9], [-0.03223, -2.9], [-0.02649, -2.9], [-0.02058, -2.9]],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "UPSPECIALTHROW";
    pl.timer = 0;
    pl.phys.cVel = new Vec2D(0, 0);
    pl.phys.fastfalled = false;
    turnOffHitboxes(p);
    for (var n = 0; n < 3; n++) {}
    M.UPSPECIALTHROW.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.UPSPECIALTHROW.interrupt(p, input)) {
      pl.phys.cVel.x = this.setVelocities[pl.timer - 1][0] * pl.phys.face;
      pl.phys.cVel.y = this.setVelocities[pl.timer - 1][1];
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 60) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.NEUTRALSPECIALAIR = {
  name: "NEUTRALSPECIALAIR",
  setVelocities: [1.794, 1.65048, 1.51844, 1.39697, 1.28521, 1.18239, 1.0878, 1.00078, 0.92071, 0.84706, 0.77929, 0.71695, 0.65959, 0.60683, 0.55828],
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALAIR";
    pl.timer = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.falconpunchair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.falconpunchair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.falconpunchair.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer >= 65) {
        fastfall(p, input);
        airDrift(p, input);
      } else if (pl.timer >= 50) {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 50] * pl.phys.face;
        pl.phys.cVel.y = 0;
      } else {
        pl.phys.cVel.x = Math.sign(pl.phys.cVel.x) * Math.max(Math.abs(pl.phys.cVel.x) - pl.charAttributes.airFriction, 0);
        pl.phys.cVel.y = Math.max(pl.phys.cVel.y - pl.charAttributes.gravity, -pl.charAttributes.terminalV);
      }
      if (pl.timer === 52) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 52 && pl.timer < 57) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 57) {
        turnOffHitboxes(p);
      }
      if (pl.timer >= 52 && pl.timer < 57) {}
      if (pl.timer === 50) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 99) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALGROUND";
    pl.phys.cVel.x = 0;
  }
};

M.NEUTRALSPECIALGROUND = {
  name: "NEUTRALSPECIALGROUND",
  setVelocities: [1.40276, 1.58423, 1.6572, 1.62165, 1.47759, 1.22502, 0.86393, 0.59178, 0.48767, 0.39373, 0.30995, 0.23633, 0.17286, 0.11956, 0.07642, 0.04343, 0.02061, 0.00795, 0.00544, 0.0071, 0.00619, 0.00532, 0.00451, 0.00375, 0.00303, 0.00238, 0.00177, 0.00121, 0.0007, 0.00025, -0.00015, -0.0005, -0.00081, -0.00106, -0.00125, -0.0014, -0.0015, -0.00154, -0.00153, -0.00148, -0.00137, -0.00121, -0.00099, -0.00073, -0.00042, -0.00005],
  canPassThrough: false,
  canEdgeCancel: false,
  disableTeeter: true,
  canBeGrabbed: true,
  airborneState: "NEUTRALSPECIALAIR",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALGROUND";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.falconpunchair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.falconpunchair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.falconpunchair.id2;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer >= 54) {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 54] * pl.phys.face;
      }
      if (pl.timer === 52) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 52 && pl.timer < 57) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 57) {
        turnOffHitboxes(p);
      }
      if (pl.timer >= 52 && pl.timer < 57) {}
      if (pl.timer === 50) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 99) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALAIR = {
  name: "SIDESPECIALAIR",
  setVelocities: [2.27937, 1.82957, 1.65988, 1.77032, 2.16086, 2.40854, 2.32754, 2.24791, 2.16967, 2.09282, 2.01735, 1.94326, 1.87056, 1.79924, 1.72931, 1.66076, 1.59359, 1.52782, 1.46342, 1.4004, 1.33878, 1.27853, 1.21968, 1.1622, 1.10611, 1.05141, 0.99808, 0.94615, 0.89559, 0.84642, 0.79864, 0.75225, 0.70722, 0.66359, 0.62135, 0.58048, 0.541, 0.50291, 0.46619, 0.43089, 0.39694, 0.36437, 0.3332, 0.30343, 0.275, 0.248, 0.22235, 0.19812, 0.17523, 0.15378, 0.13364, 0.11496, 0.09761, 0.08167, 0.06713, 0.05394, 0.04214, 0.03175, 0.02271, 0.01509, 0.00881, 0.00396, 0.00046, -0.00165],
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  specialOnHit: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.raptorboostair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.raptorboostair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.raptorboostair.id2;
    pl.phys.raptorBoost = false;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer >= 16) {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 16] * pl.phys.face;
      }
      if (pl.timer >= 30) {
        pl.phys.cVel.y -= 0.05;
      }
      if (pl.timer === 17) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 35) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.phys.raptorBoost) {
      M.SIDESPECIALAIRHIT.init(p, input);
      return true;
    } else if (pl.timer > 79) {
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
    S.LANDINGFALLSPECIAL.init(p, input);
  },
  onPlayerHit: function (p) {
    player[p].phys.raptorBoost = true;
  }
};

M.SIDESPECIALAIRHIT = {
  name: "SIDESPECIALAIRHIT",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIRHIT";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.raptorboostairhit.id0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      pl.phys.cVel.y -= 0.05;
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
      if (pl.timer >= 4 && pl.timer < 9) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 45) {
      S.FALLSPECIAL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    S.LANDINGFALLSPECIAL.init(p, input);
  }
};

M.SIDESPECIALGROUND = {
  name: "SIDESPECIALGROUND",
  setVelocities1: [-1.79163, -3.1017, -3.08, -1.72663],
  setVelocities2: [5.60854, 5.2283, 4.65846, 3.89902, 3.376, 3.21597, 3.05619, 2.89666, 2.73738, 2.57834, 2.41955, 2.26102, 2.10273, 1.94468, 1.78689, 1.62934, 1.47205, 1.315, 1.1582, 1.05434, 1.00404, 0.95493, 0.90701, 0.86029, 0.81476, 0.77041, 0.72726, 0.6853, 0.64453, 0.60495, 0.56656, 0.52936, 0.49336, 0.45854, 0.42492, 0.39248, 0.36124, 0.33119, 0.30233, 0.27466, 0.24818, 0.22289, 0.1988, 0.1759, 0.15417, 0.13366, 0.11432, 0.09618, 0.07923, 0.06347, 0.0489, 0.03552, 0.02333, 0.01234, 0.00253, -0.00607, -0.0135, -0.01973, -0.02478, -0.02863, -0.03128, -0.03275, -0.03303],
  canPassThrough: false,
  canEdgeCancel: false,
  disableTeeter: true,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  specialOnHit: true,
  airborneState: "SIDESPECIALGROUNDTOAIR",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.landingMultiplier = 1.5;
    pl.phys.raptorBoost = false;
    pl.hitboxes.id[0] = pl.charHitboxes.raptorboostground.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.raptorboostground.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.raptorboostground.id2;
    this.canEdgeCancel = false;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer <= 4) {
        pl.phys.cVel.x = this.setVelocities1[pl.timer - 1] * pl.phys.face;
      } else if (pl.timer <= 16) {
        pl.phys.cVel.x = 0;
      } else {
        this.canEdgeCancel = true;
        pl.phys.cVel.x = this.setVelocities2[pl.timer - 17] * pl.phys.face;
      }
      if (pl.timer === 15) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 35) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.phys.raptorBoost) {
      M.SIDESPECIALGROUNDHIT.init(p, input);
      return true;
    } else if (pl.timer > 79) {
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
  land: function (p, input) {},
  onPlayerHit: function (p) {
    player[p].phys.raptorBoost = true;
  }
};

M.SIDESPECIALGROUNDTOAIR = {
  name: "SIDESPECIALGROUNDTOAIR",
  init: function (p, input) {
    const pl = player[p];
    if (Math.abs(pl.phys.cVel.x) > pl.charAttributes.aerialHmaxV) {
      pl.phys.cVel.x = Math.sign(pl.phys.cVel.x) * pl.charAttributes.aerialHmaxV;
    }
    S.FALLSPECIAL.init(p, input);
  },
  main: function (p, input) {
    this.init(p, input);
  }
};

M.SIDESPECIALGROUNDHIT = {
  name: "SIDESPECIALGROUNDHIT",
  canPassThrough: false,
  canEdgeCancel: false,
  disableTeeter: true,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUNDHIT";
    pl.timer = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.raptorboostgroundhit.id0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.phys.timer < 18) {
        pl.phys.cVel.x = 0.30313 * pl.phys.face;
      } else {
        pl.phys.cVel.x = 0;
      }
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
      if (pl.timer >= 4 && pl.timer < 9) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 25) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.DOWNSPECIALAIR = {
  name: "DOWNSPECIALAIR",
  setVelocities: [[-0.31605, 0.20183], [-0.36565, 0.27723], [-0.21252, 0.33551], [0.24607, 0.37668], [0.24607, 0.40073], [0.24607, 0.40766], [0.24607, 0.39748], [0.24607, 0.37018], [0.24607, 0.32577], [0.24607, 0.26424], [0.24607, 0.18559], [0.24607, 0.08983], [0.24607, -0.02305], [0.24607, -0.15304], [0.24607, -0.30015], [0.24607, -0.46438]],
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
    pl.phys.cVel.x = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.falconkickairClean.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.falconkickairClean.id1;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer < 17) {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 1][0] * pl.phys.face;
        pl.phys.cVel.y = this.setVelocities[pl.timer - 1][1];
      } else {
        pl.phys.cVel.x = 1.22542 * pl.phys.face;
        pl.phys.cVel.y = -3.81748;
        if (pl.timer % 2) {}
      }
      if (pl.timer === 15) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 15 && pl.timer < 30) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 18) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.falconkickairMid.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.falconkickairMid.id1;
      }
      if (pl.timer === 26) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.falconkickairLate.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.falconkickairLate.id1;
      }
      if (pl.timer === 30) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 29) {
      M.DOWNSPECIALAIRENDAIR.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    M.DOWNSPECIALAIRENDGROUND.init(p, input);
  }
};

M.DOWNSPECIALAIRENDAIR = {
  name: "DOWNSPECIALAIRENDAIR",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIRENDAIR";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = false;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      pl.phys.cVel.y = Math.max(pl.phys.cVel.y - pl.charAttributes.gravity, -pl.charAttributes.terminalV);
      pl.phys.cVel.x = Math.sign(pl.phys.cVel.x) * Math.max(Math.abs(pl.phys.cVel.x) - pl.charAttributes.airFriction, 0);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 29) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    M.DOWNSPECIALAIRENDGROUND.init(p, input);
  }
};

M.DOWNSPECIALAIRENDGROUND = {
  name: "DOWNSPECIALAIRENDGROUND",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIRENDGROUND";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.cVel.y = 0;
    pl.phys.cVel.x = 0.98542 * pl.phys.face;
    pl.hitboxes.id[0] = pl.charHitboxes.falconkickland.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.falconkickland.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.falconkickland.id2;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      pl.phys.cVel.x = Math.sign(pl.phys.cVel.x) * Math.max(Math.abs(pl.phys.cVel.x) - 0.24, 0);
      if (pl.timer === 1) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 1 && pl.timer < 3) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 3) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 45) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
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
  specialWallCollide: true,
  airborneState: "DOWNSPECIALGROUND",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUND";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.hitboxes.id[0] = pl.charHitboxes.falconkickgroundClean.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.falconkickgroundClean.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.falconkickgroundClean.id2;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer >= 12) {
        pl.phys.cVel.x = 2.67586 * pl.phys.face;
        if (pl.timer % 2) {}
      }
      if (pl.timer === 14) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 14 && pl.timer < 33) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 17) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.falconkickgroundMid.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.falconkickgroundMid.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.falconkickgroundMid.id2;
      }
      if (pl.timer === 25) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.falconkickgroundLate.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.falconkickgroundLate.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.falconkickgroundLate.id2;
      }
      if (pl.timer === 33) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      if (pl.phys.grounded) {
        M.DOWNSPECIALGROUNDENDGROUND.init(p, input);
      } else {
        M.DOWNSPECIALGROUNDENDAIR.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  onWallCollide: function (p, input, wallFace, wallNum) {
    const pl = player[p];
    if (wallFace === "R" && pl.phys.face === -1 || wallFace === "L" && pl.phys.face === 1) {
      pl.phys.grounded = false;
      M.UPSPECIALTHROW.init(p, input);
    }
  }
};

M.DOWNSPECIALGROUNDENDAIR = {
  name: "DOWNSPECIALGROUNDENDAIR",
  setVelocities: [0, 0.51374, 0.59547, 0.60863, 0.55322, 0.42924, 0.32122],
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUNDENDAIR";
    pl.timer = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.timer > 1) {
        if (player.timer < 7) {
          pl.phys.cVel.x = 1.0346 * pl.phys.face;
        }
        if (player.timer === 7) {
          pl.phys.cVel.x = 1.24691 * pl.phys.face;
        }
        if (pl.timer > 7) {
          pl.phys.cVel.y = Math.max(pl.phys.cVel.y - pl.charAttributes.gravity, -pl.charAttributes.terminalV);
          pl.phys.cVel.x = Math.sign(pl.phys.cVel.x) * Math.max(Math.abs(pl.phys.cVel.x) - pl.charAttributes.airFriction, 0);
        } else {
          pl.phys.cVel.y = this.setVelocities[pl.timer - 1];
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 30) {
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
    player[p].actionState = "DOWNSPECIALGROUNDENDGROUND";
  }
};

M.DOWNSPECIALGROUNDENDGROUND = {
  name: "DOWNSPECIALGROUNDENDGROUND",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "DOWNSPECIALGROUNDENDGROUND",
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUNDENDGROUND";
    pl.timer = 0;
    pl.phys.cVel.x = 2.14 * pl.phys.face;
    pl.phys.cVel.y = 0;
    turnOffHitboxes(p);
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!this.interrupt(p, input)) {
      if (pl.phys.grounded) {
        pl.phys.cVel.x = Math.sign(pl.phys.cVel.x) * Math.max(Math.abs(pl.phys.cVel.x) - 0.128, 0);
        pl.phys.cVel.y = 0;
      } else {
        pl.phys.cVel.x = Math.sign(pl.phys.cVel.x) * Math.max(Math.abs(pl.phys.cVel.x) - pl.charAttributes.airFriction, 0);
        pl.phys.cVel.y = Math.max(pl.phys.cVel.y - pl.charAttributes.gravity, -pl.charAttributes.terminalV);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 30) {
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
    actionStates[characterSelections[grabbing]].THROWNFALCONBACK.init(grabbing);
    const frame = framesData[characterSelections[grabbing]].THROWNFALCONBACK;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwback.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 20 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (pl.timer >= 12 && prevFrame < 12) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwbackextra.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.throwbackextra.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.throwbackextra.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer >= 20 && prevFrame < 20) {
        turnOffHitboxes(p);
      }
      if (Math.floor(pl.timer + 0.01) >= 20 && Math.floor(prevFrame + 0.01) < 20) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwback.id0;
        pl.hitboxes.active = [true, false, false, false];
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 49) {
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
    actionStates[characterSelections[grabbing]].THROWNFALCONDOWN.init(grabbing);
    const frame = framesData[characterSelections[grabbing]].THROWNFALCONDOWN;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwdown.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 16 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 16 && Math.floor(prevFrame + 0.01) < 16) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwdown.id0;
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 31) {
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
    actionStates[characterSelections[grabbing]].THROWNFALCONUP.init(grabbing, input);
    turnOffHitboxes(p);
    const frame = framesData[characterSelections[grabbing]].THROWNFALCONUP;
    pl.phys.releaseFrame = frame + 1;
    pl.hitboxes.id[0] = pl.charHitboxes.throwup.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 15 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 15 && Math.floor(prevFrame + 0.01) < 15) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwup.id0;
        pl.hitboxes.active = [true, false, false, false];
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
      if (pl.timer >= 11 && prevFrame < 11) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwupextra.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.throwupextra.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.throwupextra.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
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
    actionStates[characterSelections[grabbing]].THROWNFALCONFORWARD.init(grabbing, input);
    const frame = framesData[characterSelections[grabbing]].THROWNFALCONFORWARD;
    pl.phys.releaseFrame = frame + 1;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwforward.id0;
    this.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 18 / pl.phys.releaseFrame;
    if (!this.interrupt(p, input)) {
      if (pl.timer >= 11 && prevFrame < 11) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwforwardextra.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.throwforwardextra.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.throwforwardextra.id2;
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer >= 18 && prevFrame < 18) {
        turnOffHitboxes(p);
      }
      if (Math.floor(pl.timer + 0.01) >= 18 && Math.floor(prevFrame + 0.01) < 18) {
        pl.hitboxes.id[0] = pl.charHitboxes.throwforward.id0;
        pl.hitboxes.active = [true, false, false, false];
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, false]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
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

M.CLIFFGETUPQUICK = {
  name: "CLIFFGETUPQUICK",
  canBeGrabbed: true,
  offset: [[-70.40894, -24.65279], [-70.49549, -24.19316], [-70.59016, -23.76442], [-70.68344, -23.28989], [-70.76582, -22.69287], [-70.82779, -21.89668], [-70.85985, -20.82461], [-70.85247, -19.4], [-70.82135, -17.47271], [-70.78225, -15.05862], [-70.72578, -12.33002], [-70.64259, -9.45922], [-70.52329, -6.61851], [-70.35851, -3.98021], [-70.13887, -1.71661], [-69.855, 0], [-69.44187, 0.27703], [-68.88137, 0.35459], [-67.58757, 0]],
  setVelocities: [0.67232, 0.63676, 0.54022, 0.50953, 0.56807, 0.60068, 0.60737, 0.58812, 0.54294, 0.47183, 0.37479, 0.25182, 0.10292],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFGETUPQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 22;
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
      if (pl.timer < 20) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 20] * pl.phys.face;
      }
      if (pl.timer === 20) {
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
  offset: [[-70.43436, -24.82925], [-70.54099, -24.38749], [-70.65172, -23.92874], [-70.75835, -23.48699], [-70.85271, -23.09623], [-70.85271, -23.09623], [-70.86757, -23.3207], [-70.85271, -23.09623], [-70.78938, -22.18307], [-70.71927, -21.24123], [-70.64391, -20.27354], [-70.5648, -19.28282], [-70.48347, -18.2719], [-70.40142, -17.2436], [-70.32018, -16.20073], [-70.24126, -15.14612], [-70.16619, -14.0826], [-70.09647, -13.01298], [-70.03361, -11.94009], [-69.97914, -10.86675], [-69.93457, -9.79578], [-69.90142, -8.73], [-69.93036, -7.57019], [-70.03811, -6.29246], [-70.17525, -5.01263], [-70.29235, -3.84654], [-70.34, -2.91], [-70.34827, -2.15466], [-70.36935, -1.45602], [-70.38699, -0.81569], [-70.38494, -0.23528], [-70.34696, 0.28361], [-70.25681, 0.73936], [-70.09824, 1.13036], [-69.855, 1.455], [-68.65326, 0.81539], [-66.20674, 0]],
  setVelocities: [0.33979, 0.34951, 0.35656, 0.36092, 0.3626, 0.36159, 0.35791, 0.35154, 0.34249, 0.33075, 0.31634, 0.29924, 0.27946, 0.25699, 0.23184, 0.20402, 0.1735, 0.14031, 0.10443, 0.06587, 0.02463],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFGETUPSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 49;
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
      if (pl.timer < 38) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 38] * pl.phys.face;
      }
      if (pl.timer === 38) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 58) {
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
  offset: [[-70.79060, -21.52081], [-70.72351, -19.80777], [-70.65291, -18.01173], [-70.58144, -16.18735], [-70.51176, -14.38925], [-70.44653, -12.67208], [-70.38839, -11.09046], [-70.34, -9.69905], [-70.34, -9.21382], [-70.34, -8.72858], [-70.34, -8.24334], [-70.34, -7.75811], [-70.34, -5.57608], [-70.34, -3.39405], [-70.34, -1.21203], [-70.34, 0.97], [-63.20602, 0]],
  setVelocities: [5.16816, 3.87485, 2.33059, 2.43843, 2.50638, 2.53443, 2.52258, 2.47085, 2.37922, 2.24769, 2.07626, 1.86494, 1.61374, 1.32262, 0.99162, 0.62073, 0.20993, -0.00709, -0.00405, -0.00148, 0.00062, 0.00226, 0.00343, 0.00413, 0.00436, 0.00413, 0.00343, 0.00226, 0.00062, -0.00148, -0.00405, 0],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPEQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 24;
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
      if (pl.timer < 18) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 18] * pl.phys.face;
      }
      if (pl.timer === 18) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 48) {
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
  offset: [[-70.85152, -23.09623], [-70.85152, -23.09623], [-70.85152, -23.09623], [-70.85152, -23.09623], [-70.85152, -23.09623], [-70.85152, -23.09623], [-70.86218, -23.09623], [-70.85152, -23.09623], [-70.80037, -21.27142], [-70.4922, -19.44661], [-70.69807, -17.62179], [-70.64692, -15.79698], [-70.59576, -13.97217], [-70.54461, -12.14736], [-70.49346, -10.32254], [-70.44231, -8.49773], [-70.39115, -6.67292], [-70.34, -4.84811], [-70.34, -3.02566], [-70.34, -1.22221], [-70.34, 0.22281], [-70.34, 0.97], [-70.34, 0.89538], [-70.34, 0.82077], [-70.34, 0.74615], [-70.34, 0.67154], [-70.34, 0.59692], [-70.34, 0.52231], [-70.34, 0.44769], [-70.34, 0.37308], [-70.34, 0.29846], [-70.34, 0.22385], [-70.34, 0.14923], [-70.34, 0.07462], [-70.34, 0], [-69.01297, 0.00023], [-64.42897, 0]],
  setVelocities: [2.98649, 3.41049, 3.564, 3.75927, 3.76332, 3.14741, 2.41238, 2.0345, 1.75106, 1.56206, 1.45702, 1.37699, 1.30299, 1.23505, 1.17316, 1.11729, 1.06749, 1.00609, 0.92840, 0.84964, 0.76983, 0.68898, 0.60706, 0.52241, 0.43808, 0.35727, 0.27999, 0.20623, 0.13601, 0.08681, 0.05876, 0.03442, 0.01377, -0.00316, -0.01640, -0.02592, -0.03175, -0.03388, -0.03229, -0.02701, -0.01802],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPESLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 54;
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
      if (pl.timer < 38) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 38] * pl.phys.face;
      }
      if (pl.timer === 38) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 78) {
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
  offset: [[-70.52496, -21.46018], [-70.16484, -19.69693], [-69.78724, -17.85424], [-69.40706, -15.97989], [-69.23444, -14.12162], [-69.18485, -12.32722], [-69.25816, -10.64442], [-69.20927, -9.74988], [-68.71929, -8.59644], [-68.73582, -5.89918], [-68.6923, -2.71084]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 11;
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
      if (pl.timer < 12) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 12) {
        pl.phys.cVel = new Vec2D(1 * pl.phys.face, 3.3);
      }
      if (pl.timer > 12) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 42) {
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
  offset: [[-70.66608, -21.52236], [-70.45539, -19.85754], [-70.2335, -18.12355], [-70.01323, -16.34217], [-69.80743, -14.53517], [-69.62891, -12.72434], [-69.49054, -10.93145], [-69.39681, -9.05661], [-69.33996, -7.05793], [-69.31442, -5.04416], [-69.31463, -3.12407], [-69.33501, -1.40643], [-69.37, 0], [-69.51372, 0.50389], [-69.73824, 0.19807], [-69.855, 0], [-69.8101, 0.32332], [-69.65741, 0.75444]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 18;
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
      if (pl.timer < 19) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 19) {
        pl.phys.cVel = new Vec2D(1 * pl.phys.face, 3.3);
      }
      if (pl.timer > 19) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 53) {
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
  offset: [[-70.4343, -24.8293], [-70.54089, -24.38752], [-70.65158, -23.92871], [-70.75817, -23.48693], [-70.85247, -23.09623], [-70.85247, -23.09623], [-70.86314, -23.09623], [-70.85247, -23.09623], [-70.80122, -21.27161], [-70.74998, -19.44699], [-70.69873, -17.62236], [-70.64748, -15.79774], [-70.59624, -13.97312], [-70.54499, -12.14849], [-70.49374, -10.32387], [-70.4425, -8.49925], [-70.39125, -6.67462], [-70.34, -4.85], [-70.26962, -2.93533], [-70.18314, -0.97231], [-70.05383, 0.62812], [-69.855, 1.455], [-69.60455, 1.68426], [-69.33985, 1.77977], [-69.06341, 1.76256], [-68.7773, 1.65361], [-68.48532, 1.47393], [-67.89203, 0]],
  setVelocities: [0.29838, 0.29761, 0.29434, 0.28856, 0.28028, 0.2695, 0.2666, 0.27256, 0.27748, 0.28139, 0.28426, 0.28611, 0.28693, 0.28672, 0.28549, 0.28323, 0.27995, 0.27563, 0.27029, 0.26393, 0.25643, 0.24811, 0.23867, 0.22819, 0.21669, 0.20416, 0.19061, 0.17603, 0.16042, 0.12121, 0.06452, 0.01601, -0.02433, -0.0565, -0.0805, -0.09632, -0.10397, -0.10344, -0.09475, -0.07788],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFATTACKSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 33;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.ledgegetupslow.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.ledgegetupslow.id1;
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
      if (pl.timer < 29) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = this.setVelocities[pl.timer - 29] * pl.phys.face;
      }
      if (pl.timer === 29) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 37) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 37 && pl.timer < 41) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 41) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 68) {
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
  offset: [[-70.79152, -21.52067], [-70.72434, -19.80744], [-70.65362, -18.01121], [-70.58200, -16.18664], [-70.51216, -14.38838], [-70.44677, -12.67110], [-70.38850, -11.08945], [-70.34000, -9.69811], [-70.31597, -8.92615], [-70.31864, -8.75587], [-70.33199, -8.57171], [-70.34, -7.75811], [-70.38042, -5.80589], [-70.44778, -3.15836], [-70.46126, -0.62868], [-70.34, 0.97], [-70.12101, 1.43812], [-69.86411, 1.30101], [-69.52269, 0.83284], [-69.05019, 0.30778], [-67.74982, 0]],
  setVelocities: [1.00038, 1.31691, 1.37077, 1.16194, 0.79036, 0.57482, 0.57482, 0.74247, 0.74248, 0.45505, 0],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFATTACKQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 20;
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
      if (pl.timer < 22) {
        pl.phys.pos = new Vec2D(x + (this.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + this.offset[pl.timer - 1][1]);
      } else {
        if (pl.timer < 33) {
          pl.phys.cVel.x = this.setVelocities[pl.timer - 22] * pl.phys.face;
        }
      }
      if (pl.timer === 22) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 24) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 24 && pl.timer < 30) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 30) {
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
    pl.hitboxes.id[3] = pl.charHitboxes.downattack1.id3;
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
      if (pl.timer === 19) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 19 && pl.timer < 21) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 21) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 28) {
        pl.hitboxes.id[0] = pl.charHitboxes.downattack2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.downattack2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.downattack2.id2;
        pl.hitboxes.id[3] = pl.charHitboxes.downattack2.id3;
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 28 && pl.timer < 30) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 30) {
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
    player[p].timer++;
    if (!this.interrupt(p, input)) {}
  },
  interrupt: function (p, input) {
    if (player[p].timer > 60) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

M.THROWNFALCONUP = {
  name: "THROWNFALCONUP",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-8.50, -1.98], [-8.44, -1.96], [-7.98, -1.11], [-7.47, -0.71], [-6.93, -0.36], [-6.40, -0.03], [-5.92, 0.32], [-5.52, 0.72], [-5.94, 1.57], [-6.60, 0.62], [-9.12, -2.76], [-9.12, -1.99], [-9.12, -1.23], [-9.12, -1.97], [-9.12, -1.97]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCONUP";
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

M.THROWNFALCONDOWN = {
  name: "THROWNFALCONDOWN",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-3.83, -1.75], [3.24, -2.20], [8.47, -2.48], [10.62, -1.52], [12.15, -0.31], [13.33, 1.11], [13.67, 3.29], [10.51, 5.72], [6.51, 6.35], [1.40, 4.20], [-4.81, 1.50], [-9.35, -1.63], [-10.37, -5.72], [-9.45, -9.45], [-9.06, -10.44], [-9.06, -10.06], [-9.06, -9.92], [-9.06, -10.21], [-9.06, -10.44], [-9.06, -10.53], [-9.06, -10.53]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCONDOWN";
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

M.THROWNFALCONBACK = {
  name: "THROWNFALCONBACK",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-4.70, -2.40], [0.94, -2.09], [3.88, -0.96], [4.88, -0.71], [5.34, -0.63], [4.99, -0.56], [3.77, -0.48], [2.00, -0.41], [-1.63, -0.41], [-2.40, -0.55], [2.15, -0.74], [10.83, -8.25], [11.44, 8.70], [12.05, 9.14], [11.45, 8.56], [10.85, 7.98], [11.46, 8.67], [12.07, 9.37], [11.47, 8.87], [11.47, 8.87]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCONBACK";
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
        pl.phys.pos = new Vec2D(player[pl.phys.grabbedBy].phys.pos.x + this.offset[pl.timer - 1][0] * pl.phys.face * -1, player[pl.phys.grabbedBy].phys.pos.y + this.offset[pl.timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNFALCONFORWARD = {
  name: "THROWNFALCONFORWARD",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-7.94, -2.51], [-7.07, -1.90], [-6.40, -1.53], [-6.10, -1.52], [-5.86, -1.63], [-5.70, -1.80], [-5.60, -1.95], [-5.58, -2.03], [-6.44, -1.57], [-7.02, -1.48], [-7.55, -1.34], [-8.02, -1.33], [-8.34, -1.23], [-8.66, -1.13], [-8.08, -1.32], [-7.50, -1.51], [-7.77, -1.42], [-7.77, -1.42]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCONFORWARD";
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

setupActionStates(CHARIDS.FALCON_ID, { ...S, ...M });

actionStates[CHARIDS.FALCON_ID].ESCAPEB.setVelocities = [0.00021, 0.00021, -0.00042, -0.83938, -2.09726, -2.72666, -2.72758, -2.39759, -2.16996, -1.96375, -1.77895, -1.61556, -1.4736, -1.35304, -1.2539, -1.17617, -1.11987, -1.08498, -1.07149, -1.07943, -1.04179, -0.94375, -0.8449, -0.74524, -0.64477, -0.54348, -0.44139, -0.33847, -0.23476, -0.13022, -0.02488];
actionStates[CHARIDS.FALCON_ID].ESCAPEF.setVelocities = [3.06269, 2.87291, 2.68919, 2.51153, 2.33994, 2.17441, 2.01495, 1.86155, 1.71421, 1.57294, 1.43773, 1.30858, 1.1855, 1.06848, 0.95753, 0.85264, 0.75381, 0.66105, 0.57435, 0.49371, 0.41914, 0.35064, 0.2882, 0.23181, 0.1815, 0.13725, 0.09906, 0.06693, 0.04087, 0.02088, 0.00694];
actionStates[CHARIDS.FALCON_ID].DOWNSTANDB.setVelocities = [-0.18881, -0.24149, -0.52075, -1.09628, -1.63184, -1.86136, -1.95365, -2.02141, -2.06463, -2.08331, -2.07746, -2.04706, -1.99213, -1.91266, -1.80865, -1.68011, -1.52701, -1.3494, -1.15914, -0.98313, -0.82294, -0.67854, -0.54995, -0.43716, -0.34018, -0.25899, -0.19361, -0.14403, -0.11026, -0.08107, -0.05119, -0.02913, -0.01491, -0.00853, -0.00998];
actionStates[CHARIDS.FALCON_ID].DOWNSTANDF.setVelocities = [1.12, 1.15365, 1.27265, 1.477, 1.7667, 2.17694, 1.73432, 2.16208, 2.26746, 2.297, 2.2507, 2.12856, 1.93059, 1.65677, 1.30711, 1.06531, 0.98175, 0.8979, 0.81376, 0.72933, 0.64461, 0.5596, 0.4743, 0.38871, 0.30284, 0.21667, 0.13021, 0.04347, 0, 0, 0, 0, 0, 0, 0];
actionStates[CHARIDS.FALCON_ID].TECHB.setVelocities = [0, 0.18075, 0.39766, 0.39766, 0.18075, -0.25305, -0.90377, -2.46367, -2.41059, -2.35439, -2.2951, -2.23269, -2.16718, -2.09857, -2.02684, -1.95201, -1.87408, -1.79303, -1.70888, -1.62163, -1.53127, -1.4378, -1.34122, -1.24154, -1.13876, -1.03285, -0.92387, -0.81175, -0.69653, -0.57822, -0.45678, -0.33226, -0.20461, -0.07387, 0, 0, 0, 0, 0, 0];
actionStates[CHARIDS.FALCON_ID].TECHF.setVelocities = [0, -0.75759, -1.12332, -1.01883, -0.44410, 1.06591, 2.27794, 2.89521, 3.22928, 2.65097, 1.77161, 1.38143, 1.26423, 1.42003, 1.84881, 2.67623, 3.28124, 3.22766, 2.51549, 1.80722, 1.57673, 1.39843, 1.27236, 1.19849, 1.17685, 1.20741, 1.14091, 0.9545, 0.78604, 0.63551, 0.50292, 0.38828, 0.29156, 0.2128, -0.14317, -0.14317, -0.14318, -0.14317, -0.14317, -0.14317];
actionStates[CHARIDS.FALCON_ID].CLIFFCATCH.posOffset = [[-74.30689, -20.11477], [-73.95572, -20.50451], [-73.38841, -21.13325], [-72.74251, -21.82974], [-72.13988, -22.36620], [-71.53900, -23.01287], [-70.88926, -24.14437]];
actionStates[CHARIDS.FALCON_ID].CLIFFWAIT.posOffset = [-70.85271, -23.09623];

// ---- ECB (environmental collision box) offsets per action-state frame, run-length encoded (see decodeEcb in ml.js) ----
setEcbData(CHARIDS.FALCON_ID, decodeEcb({
  CAPTUREDAMAGE: "22582257235823572258f23582258b32682258c",
  CAPTUREPULLED: "23583368",
  CATCHATTACK: "3269327:337:327:a327;327:327;a327:a327;327:k",
  CLIFFCATCH: "549<649<64:=539=53:>52:>429>",
  DOWNDAMAGE: "2445143514462346335733683369235714351434c",
  FALL: "0248a0259a1259a02590248",
  FALLSPECIAL: "126:a2369d126:",
  FALLAERIAL: "0359a1359e",
  GUARD: "327:",
  FURASLEEPLOOP: "1335s",
  KNEEBEND: "2257c",
  GUARDOFF: "327:327;428<429=428<327;a327:3369a337:3369337:a327:327;",
  GUARDON: "327;b327:d",
  LANDINGATTACKAIRB: "327:a3369a32693369c32693369d3269327:a",
  LANDINGATTACKAIRN: "235723582257b1247a1246c22572258327:a",
  OTTOTTO: "327;a337:3369337:327:327;328<",
  SMASHTURN: "327:g327;327:a",
  LANDINGATTACKAIRF: "3269a22692258j2269a327:a327;",
  LANDINGATTACKAIRU: "3269b3268c22583268a225832683269327:327;",
  LANDINGATTACKAIRD: "328<22692257b224622572246i2257b22583269327:327;",
  STOPCEIL: "528:a427:327:226:b44792458",
  REBOUND: "327:l3269327:327;a",
  SQUATRV: "23572258a2269c3269327:327;",
  SQUAT: "327:a326921692258a2257",
  THROWNFALCONUP: "327;428<328<a217;a227<328<428<126:428<227;327;227;",
  THROWNFALCOBACK: "629;528;629<62:=73:=a83;=739;638:",
  THROWNFALCONDOWN: "227;226:529<327;a226:227;337;73:<84:;84;=82<@82=A93=A82=Ac92=A93=A",
  THROWNFALCOUP: "528;528:b62:=02360259",
  THROWNFALCONFORWARD: "227;327;227;c328<227;a116:43795379d4379",
  THROWNMARTHBACK: "227;328<338<a53:>83<@a",
  THROWNFALCONBACK: "227;247;347:337:327:a327;428;327;327:a528:a5379a538:638:628:528:",
  THROWNFALCOFORWARD: "528;428;f438;539<74:<",
  THROWNFOXUP: "528;528:a528;62:=227;0259529<",
  TILTTURN: "327:g327;327:a",
  THROWNMARTHFORWARD: "338<438<227<b228=a238>a339>539=a93;=;4>@",
  THROWNPUFFFORWARD: "529<62:=519=61:=519=51:>519=51:>519=",
  THROWNPUFFUP: "619;629<a73:=73:<649<629<529<",
  THROWNMARTHDOWN: "227;227<d127<227;338<438<73;>:2;<:3=?93=@",
  THROWNFOXFORWARD: "528;428;f438;639<",
  THROWNFOXBACK: "629;528;629<73:=a83;=a739;739:",
  THROWNSHEIKBACK: "538;448<448;437:538;539<639<62:=629<529<c62:>427:d",
  THROWNMARTHUP: "227;327;328<327;c317;327;328<327;227;",
  ATTACKAIRD: "125932694279j326912590248d1259126;227;227<328<a327;328<b327;a226:226922583257c42672257426732681259",
  UPSPECIALCATCH: "3268g32693268b3269c",
  ATTACKDASH: "33692358335732682258235833683369n437:b337:33693269326822572357b2358c3269327:",
  CAPTUREWAIT: "2258c2269225822693269226923692269a23692269e3269b22693269a226932692269a2258e",
  CATCHCUT: "327:b3369b2369g23582369g3369a3269327:b327;",
  DASH: "326933692358245723572358337:347:447:347:447:e347:34693369a226932692258a3269a327:a",
  DAMAGEN2: "327:326933682358h23693369236933692358a235723582269a327:",
  DOWNSTANDN: "1434a134623461347225712472257d2258b3269a327:327;b428<328<428<a328<327;337;428;327;",
  DOWNBOUND: "1346042314341435244634574467446854796389739:739;73:<84:<84:;849:a739:639;5379436823462445a1434a",
  DOWNSTANDF: "14341346225722462245123512340224b1234123521572246325632452245123512461247e22572258c3269a327:b",
  ESCAPEN: "3269336922692258l2269a3269337:33692369225823693269b327:a327;b",
  JAB2: "337:c347:3469b337:d327:327;e",
  THROWNSHEIKUP: "438;a448;a648:749;94;=94<>a:5<>a;5=>;4=>c;5=?759:317:c",
  DOWNSPECIALAIRENDAIR: "03590259a025:a126:226:a3269326832572246225712472258a2257325722581259a02591259a2258b12580248",
  ATTACKAIRF: "024802471258225722582257c2258125902590359c13590359d13590359a1359a03591359b12592269b1258a0248a",
  DOWNSPECIALAIR: "1259327;529<e428<d327;126:1359035912590259125903590259a0359d0259",
  DAMAGEFLYN: "226:32694368f3368a4368336843683368a436833684379a437:a43794479a4468a34682458",
  JAB3: "327;226922572258327:337;a337:337;337:d236922692258d3269327:327;b428;327;a428;327;a",
  ATTACKAIRU: "12471258127<12581347a2369438<63:>63;?549=548;549<64:=a438<236:0448145813582369b13591259d0259a02480259",
  ATTACKAIRB: "02591259b22691259a2269a236:1359236:2369236:d337:d317:327:226:a126:0259d02480259",
  CLIFFJUMPQUICK: "228=438<82;=72:<629;427:327:327;438<2369336853:>539=a549<448<448;d759:84:;639;52793268a4168426852675278517962895278b426832683257124712580248",
  DOWNSPECIALGROUNDENDAIR: "3457a23573256124612350224d0235a12351234a0235d1146a12461247a12580248b",
  CAPTURECUT: "23692358t23693369236933692369327:a327;",
  DOWNTILT: "2257225822572357a2257a2357a2346245725572457a23572346245723572457a2346235723462357235823572346224612462257c2357a",
  CATCHWAIT: "3269327:a3269327:a3269327:3269b327:a3269a327:n",
  CLIFFGETUPQUICK: "329?329>b228=a328<428<327:428;337:438;63;?539=438<327:22692357a23583369326932683369337:c327:b327;",
  ESCAPEB: "326831693269439=a448<649<74:<a548;348<338<439=429=439>549<749;447:347:346933692358a2258d3269327:327;",
  ESCAPEF: "33693469a24582357336923582369337:23691335a1347e2357225822572258d22693269a327:a",
  DOWNSTANDB: "24452357234623572358a23691358134623572346235713472357b2457d14472457a2358b2258b22693269327:b",
  DAMAGEFALL: "24582469a2369226:227;d237<237;236:23692357134713581359b226:a337:a347:34693468a2458",
  JUMPF: "126;026;126;127<a126;127<126;a127<b126;127<126;026;025:a126:a025:126:c226:a126:1259a0259b0248a",
  JAB1: "327:a337:f327:f327;d",
  FURASLEEPSTART: "327;a327:3269a327:c327;e327:d326922581347134623461346133512461335a",
  JUMPAERIALB: "0259a126:025903470336a13472446345744684479548;63:>63;?549=64:>b64:=649<548:3468245823581358a124712581259d1359",
  FORWARDTILT: "327;337:d327;328<348<448<c348<438<337;428;b327:337:327:a3269b327:a327;",
  LANDING: "2257h2246a22572246e2257225822693269327:327;a328<327;a328<327;",
  MISSFOOT: "3268024803480347a03481359437933693368235722573269a3368a43795479447:448;b347;448;347:3469",
  JUMPAERIALF: "0248a125812591258024703483357a427:5279a52783257315732574267a42685278b5267527842673257b32564267b42685278c42684368a235813581258b1259125812591359a",
  GRAB: "327;327:337:337;337:3269337:l327:a327;327:327;f",
  UPTILT: "327:d327;a52:?429>52:>52:?d51:?41:?439=347:346924582357a2346b235723462357a2257225822693269b327:a327;",
  THROWDOWN: "327:337:b337;428<328<337:135913472358f2357b1346c235722583269a327:a327;",
  TECHU: "1258225822693269b4279a427:c327:126:025:0259024802590248g",
  TECHB: "42:?429>429=328<428;429=429>347:23572246224511352245a1235a114621451235a224512351335a134623462357e2258c33693269327:a",
  THROWFORWARD: "327:337:f327:c337:3369337:b3369337:h327:337:3369226933693269d327:a",
  WALK: "337;a338<a337;438;a448;a337;337:c327:c327;a",
  PASS: "23571247a235833684368436743685378528:a23581347a0347b0247c0248g0259",
  WALLJUMP: "126:226:a337:a337;d237;a337;237;337;a438;337;438;a428;3269326832563257a4267416742684267a325642563257214611461247a12580248",
  TECHN: "42:?419>a419=428<327;c328<41:?61;@82;>92;<92:;728942682258d225722583269327:",
  TECHF: "42:?429>429=428<328<429>52:?429=327;32682146123512342245214511351234a22452246a224512342245a224612462257a22582158a2258a2269a3269a327:327;",
  WALLTECH: "2269226:227;226:a227;226:d236:d337:337;b237;136:13590359a0259",
  RUN: "4479447:b347:337:336932693369a346924693469b336923692358a2369a",
  RUNBRAKE: "34693369337:437:427:337:b336934692458a34692458a3468b3369e337:a327:428;",
  WALLTECHJUMP: "126:226:a337:a337;d237;a337;237;337;a438;337;438;a428;3269326832563257a4267416742684267a325642563257214611461247a12580248",
  THROWNFALCODOWN: "528:638:538:437:538:a749;:4;<95:;94:;95:;84:;749;a84:;:4=?84:<8599:4<=:4<>c94;<:3;<537994;<648:93;<83:<759:749:739:749:",
  RUNTURN: "3469326933693368b22582358b346823582469a2369336832683369a3469b",
  THROWNFOXDOWN: "528:638:538:437:538:638:84:;:4;<94;<95:;94:;84:;749;648:;4>@82;=7589:4<=:4<>;4=>a:4<>:4;<93;<537994;=648:93;<82;=658:749:83:;",
  THROWNSHEIKFORWARD: "438<529=a52:>52:?a62;@62;?62;@62;?53:?c52:?52:>b53:>539<529<a528;",
  THROWNSHEIKDOWN: "428<a328<428<a529<a428;529=84:<:3=?:3<>94;=94;<95::8599b7589g94;=93<>92<>93<>a",
  THROWNPUFFBACK: "528;a629;c729;629;b428;327;b337;438;a648::3<>:2>A<2?B;3>A;3=?:3=?:3<>a",
  DOWNSPECIALGROUND: "327;337:a3369g326932684468h3468b44683468b345734683457b3468345734683457a",
  DOWNSPECIALGROUNDENDGROUND: "34573368225722582357n2457b2357235822583268327:428;327;a",
  ATTACKAIRN: "02591259a2269226:a33693469b4479a3269226:a22692358225842683468j33683268a226932693268a2258326822582369135912590259",
  SIDESPECIALGROUNDHIT: "3469245823573369a428<328<428<429=428<a429=f328<327;327:c327;",
  CLIFFATTACKQUICK: "127=026<026;025:02590248024702360235024703471359328=429=72:=63:=73:=c72:=82;=a73;>659;548:4479346924692358a2357f13472357d2258b3269b327:b327;",
  CLIFFESCAPEQUICK: "127=026<026;025:0259024802470236a024703360348035:025:337:a326822574379337:2358a3269225822571346b234613462346d2357c2358e3369a327:",
  CLIFFJUMPSLOW: "127=127<026;025:01590148014702360235b03240323a0212c02360259025:a0259025:0259135903591359c236:23692269326933683357a325652675278a51785278d32682258235822691258",
  CLIFFGETUPSLOW: "329?a228>d218>52:>72:=629<428<a327;c528;528:427:327:3269a4279a3269a2258a1258134703480347b134712472257d2258c2257c22583268a3269a327:a327;",
  DOWNATTACK: "134613341335234613461246a2246c12462257c1258236925582557245823582269b23693469357:a337:327:337:327:427:327:337:327:2258a2257e22583269a327:",
  DOWNSMASH: "327:a337:347;h347:c337:327:347:a337:e327:337;347:347;b448;347;337;c338<337;c338<337;327;c",
  DOWNWAIT: "1434z1434z1434n",
  CLIFFWAIT: "228>i128>s228>128>c228>128>228>a128>a228>128>228>128>228>d",
  ESCAPEAIR: "0248a025912590259a12590259h0248a025902480259b0248c0259c0248b13472358d13580348d02481259126:",
  APPEAL: "327;c328<e428<c429=e428<d429=a428<a429=a428<429=g428<429=c428<429=b428<a429=d428<a328<327;",
  FURASLEEPEND: "1335b2346q13462346j2246b2346d2246c2257124722572258d22693269327:b327;a",
  JUMPB: "116;025:0259c0248b0347b14472458346844685478546754796489648:639;73:<a63:=539=438<437:33692457a2446144704360347b02470248c02590248f",
  DOWNSPECIALAIRENDGROUND: "32692258d2257z2257e2258a2269327:a327;",
  UPSMASH: "327;a327:a3269c32683369337;327;428<429=429>52:>b51:>52:>72<A93=@92<?92=@82;>a92=A83<@72:=529=438;33692257a2246h2257326822583269b327:d",
  THROWBACK: "327:3269f225822692258348<338<a348<e448<348<438<b438;b337;337:b3369337:i337;d327;",
  WALLDAMAGE: "42683269227;329>429=329>a328=228=a328=a328<338<a338=a439=e449=549=539=a549<a548;558:648:548;448;438;438<a539<a639<b639;a649;a548;457:a34693468",
  THROWUP: "336932692358b23572358a336932693369d337:l327:a32693368235822583269b327:b327;b",
  THROWNPUFFDOWN: "619;628:739:749:849:94:;:4;<d:5<=a:5<>;5=>:4<>;4=>;5=>a:5<>:5<=a:5;<a:5<=b:4<>a:4=?;4=?:4=?:4<>:5<=95:;a:5;<:5<=:5<>a;5=>b:5<>a:5<=a:5;<:4<=a:4<>e:4<=a95;<:5;<",
  CLIFFATTACKSLOW: "329?a228>d218>52:>62:=529<428;227;126:025902480247a023602350224b0235a0236b03360347034814580447034713472257235822583269337:337;438<429=a327;327:f32693369337:a3369337:b327:b337;327:327;b",
  CLIFFESCAPESLOW: "228>f329>529<62:=529<428;227;126:0259024802470347033602350224c0235a0236c024703471358b13472257235713462458244623462258a2158225723462245a2346134623462357a3368d33693269h327:f327;a",
  FORWARDSMASH: "327:337:a23693369b2369b33692369f2458b2469a245824692458a24692458c24692458h23693369337;338<a438<338<337;328<a327;k",
  SIDESPECIALAIRHIT: "45793469347:a34681546044704480348m1358b12581247a125822582269a22582269f23582369135812581259",
  WAIT: "327;j428<327;f327:g327;327:k327;327:d327;327:b327;i",
  SQUATWAIT: "2358a2357b225723582357b23582357a23582357c2257b2357z2357f2257i22582257g22582358b2258",
  SIDESPECIALGROUND: "327;327:336933682358a336823583368c2358a245824692458336924693469a35694579b3569d45793569c2457143523451435a1335c13461335a2445e1435a1346a14351335b12351246c2257c2258c22693269327:a327;",
  UPSPECIAL: "02481258a1358134713580347a1347d03590259026<127<026<e127<026<127<a137<237<238=228=a237<338<237;a236:226:427:438;639<83:<:3=@;3>Aa;3=?;4=>:4<=94;<73:<528;427952786289729:729;82:;829:729:628:4279326822582269",
  UPSPECIALTHROW: "32682269a337;a438;i538;539<538;539<f539=539<539=a539<639<a649<639<a538;3369235722573269527962895279426832572246325742685279528:628:729:638:b538:327:226912590248",
  OTTOTTOWAIT: "428<328<338<d328<a429=h428<328<b338<337;347:b346924693469347:a337:g347:3469347:3469b2469b2458b2457a2346c23572257b2258a22693269b3369a337:c337;a338<a438<a",
  SIDESPECIALAIR: "025913582358a2369c13592369c13592369b3469447945794568557945795579a55784568d55784568b356915470536a254514461458c1459c1359a2369a336834683469b2358a13580248a03590348a1447c13581359a136:d126:",
  FURAFURA: "327:h327;327:a327;f428;327;428;b428<428;428<b428;327;z327;n327:e3269b3369l327:b3269327:a",
  NEUTRALSPECIALGROUND: "327;337;337:h3369k23692358236933692358x2469c2458p235732683368b2358f2369a3369c337:c327:327;b",
  NEUTRALSPECIALAIR: "0248e1359b0359a035:a136:135923693369i4379336943793369a4379336943793369o326923692458s14582458135802480348b0248a0259a0159b015:025:0259a025:0259b1259b02480259",
  REBIRTH: "327;j428<327;f327:g327;327:k327;327:d327;327:b327;t428<327;f327:g327;327:k327;327:d327;327:b327;i",
}));
ecb[CHARIDS.FALCON_ID].LANDINGFALLSPECIAL = ecb[CHARIDS.FALCON_ID].LANDING;
ecb[CHARIDS.FALCON_ID].DEADUP = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCON_ID].DEADDOWN = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCON_ID].DEADLEFT = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCON_ID].DEADRIGHT = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCON_ID].ENTRANCE = ecb[CHARIDS.FALCON_ID].WAIT;
ecb[CHARIDS.FALCON_ID].SLEEP = [[0, 0, 0, 0]];
ecb[CHARIDS.FALCON_ID].REBIRTHWAIT = ecb[CHARIDS.FALCON_ID].WAIT;
ecb[CHARIDS.FALCON_ID].SHIELDBREAKFALL = ecb[CHARIDS.FALCON_ID].DAMAGEFALL;
ecb[CHARIDS.FALCON_ID].SHIELDBREAKDOWNBOUND = ecb[CHARIDS.FALCON_ID].DOWNBOUND;
ecb[CHARIDS.FALCON_ID].SHIELDBREAKSTAND = ecb[CHARIDS.FALCON_ID].DOWNSTANDN;
ecb[CHARIDS.FALCON_ID].TECHWALLJUMP = ecb[CHARIDS.FALCON_ID].WALLJUMP;
ecb[CHARIDS.FALCON_ID].THROWNFALCONDIVE = ecb[CHARIDS.FALCON_ID].DAMAGEFLYN;
