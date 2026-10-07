/**
 * marth.js: template character data and action states (meleelight's Marth (Sable)): attributes, hitboxes, frame counts, ECB data and the character's own moves.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { hitQueue } from './hit.js';
import { CHARIDS, activeStage, blendColours, charObject, characterSelections, decodeEcb, ecb, framesData, offsets, pPal, palettes, player, setCharAttributes, setChars, setEcbData, setFrames, setHitBoxes, setIntangibility, setOffsets, sounds } from './ml.js';
import { S } from './shared.js';
import { actionStates, airDrift, checkForAerials, checkForDash, checkForDoubleJump, checkForJump, checkForSmashTurn, checkForSmashes, checkForSpecials, checkForTiltTurn, checkForTilts, fastfall, reduceByTraction, setupActionStates, tiltTurnDashBuffer, turnOffHitboxes } from './shortcuts.js';
import { Vec2D, createHitbox, createHitboxObject } from './util.js';

// ---- attributes, hitboxes, frame counts, hitbox offsets ----
setCharAttributes(CHARIDS.MARTH_ID, {
  dashFrameMin: 15,
  dashFrameMax: 27,
  dInitV: 1.56,
  dMaxV: 1.8,
  dAccA: 0.06,
  dAccB: 0,
  dTInitV: 1.5,
  traction: 0.06,
  maxWalk: 1.6,
  jumpSquat: 4,
  sHopInitV: 1.5,
  fHopInitV: 2.4,
  gravity: 0.085,
  groundToAir: 0.8,
  jumpHmaxV: 1.2,
  jumpHinitV: 1,
  airMobA: 0.03,
  airMobB: 0.02,
  aerialHmaxV: 0.9,
  airFriction: 0.005,
  terminalV: 2.2,
  fastFallV: 2.5,
  walkInitV: 0.15,
  walkAcc: 0,
  walkMaxV: 1.6,
  djMultiplier: 0.88,
  djMomentum: 1,
  shieldScale: 11.75,
  modelScale: 1.15,
  weight: 87,
  waitAnimSpeed: 1,
  walljump: false,
  hurtboxOffset: [4, 18],
  ledgeSnapBoxOffset: [14, 12, 22],
  shieldOffset: [5, 40],
  charScale: 0.49,
  miniScale: 0.32,
  runTurnBreakPoint: 18,
  airdodgeIntangible: 25,
  wallJumpVelX: 1.3,
  wallJumpVelY: 2.4,
  shieldBreakVel: 2.5,
  multiJump: false,
  ecbScale: 1,
  walkAnimSpeed: 1,
  runAnimSpeed: 1
});
setIntangibility(CHARIDS.MARTH_ID, {
  "ESCAPEAIR": [4, 25],
  "ESCAPEB": [4, 20],
  "ESCAPEF": [4, 20],
  "ESCAPEN": [2, 16],
  "DOWNSTANDN": [1, 22],
  "DOWNSTANDB": [1, 19],
  "DOWNSTANDF": [6, 14],
  "TECHN": [1, 20],
  "TECHB": [1, 20],
  "TECHF": [1, 20]
});
setFrames(CHARIDS.MARTH_ID, {
  "WAIT": 90,
  "DASH": 27,
  "RUN": 23,
  "RUNBRAKE": 25,
  "RUNTURN": 30,
  "WALK": 21,
  "JUMPF": 45,
  "JUMPB": 55,
  "FALL": 10,
  "FALLAERIAL": 10,
  "FALLSPECIAL": 10,
  "SQUAT": 7,
  "SQUATWAIT": 80,
  "SQUATRV": 8,
  "JUMPAERIALF": 50,
  "JUMPAERIALB": 50,
  "PASS": 30,
  "GUARDON": 8,
  "GUARDOFF": 16,
  "CLIFFCATCH": 7,
  "CLIFFWAIT": 56,
  "DAMAGEFLYN": 29,
  "DAMAGEFALL": 30,
  "DAMAGEN2": 23,
  "LANDINGATTACKAIRF": 15,
  "LANDINGATTACKAIRB": 24,
  "LANDINGATTACKAIRU": 15,
  "LANDINGATTACKAIRD": 32,
  "LANDINGATTACKAIRN": 15,
  "ESCAPEB": 34,
  "ESCAPEF": 34,
  "ESCAPEN": 27,
  "DOWNBOUND": 26,
  "DOWNWAIT": 60,
  "DOWNSTANDN": 30,
  "DOWNSTANDB": 35,
  "DOWNSTANDF": 35,
  "TECHN": 26,
  "TECHB": 40,
  "TECHF": 40,
  "SHIELDBREAKFALL": 30,
  "SHIELDBREAKDOWNBOUND": 26,
  "SHIELDBREAKSTAND": 30,
  "FURAFURA": 100,
  "CAPTUREWAIT": 60,
  "CATCHWAIT": 59,
  "CAPTURECUT": 30,
  "CATCHCUT": 29,
  "CAPTUREDAMAGE": 20,
  "WALLDAMAGE": 50,
  "WALLTECH": 26,
  "WALLJUMP": 40,
  "OTTOTTO": 8,
  "OTTOTTOWAIT": 79,
  "THROWNMARTHUP": 10,
  "THROWNMARTHBACK": 6,
  "THROWNMARTHFORWARD": 12,
  "THROWNMARTHDOWN": 12,
  "THROWNPUFFUP": 6,
  "THROWNPUFFBACK": 21,
  "THROWNPUFFFORWARD": 9,
  "THROWNPUFFDOWN": 60,
  "THROWNFOXUP": 6,
  "THROWNFOXBACK": 7,
  "THROWNFOXFORWARD": 10,
  "THROWNFOXDOWN": 32,
  "THROWNFALCOUP": 6,
  "THROWNFALCOBACK": 7,
  "THROWNFALCOFORWARD": 9,
  "THROWNFALCODOWN": 28,
  "THROWNFALCONUP": 14,
  "THROWNFALCONBACK": 19,
  "THROWNFALCONFORWARD": 17,
  "THROWNFALCONDOWN": 19,
  "FURASLEEPSTART": 30,
  "FURASLEEPLOOP": 80,
  "FURASLEEPEND": 60,
  "STOPCEIL": 9,
  "TECHU": 26,
  "REBOUND": 8
});
setOffsets(CHARIDS.MARTH_ID, {
  fair: {
    id0: [new Vec2D(9.26, 16.34), new Vec2D(11.15, 9.93), new Vec2D(9.19, 5.23), new Vec2D(3.87, 2.43)],
    id1: [new Vec2D(5.46, 13.21), new Vec2D(6.26, 10.84), new Vec2D(5.82, 8.63), new Vec2D(3.93, 6.98)],
    id2: [new Vec2D(0.88, 13.20), new Vec2D(1.14, 12.76), new Vec2D(1.20, 12.41), new Vec2D(1.21, 12.14)],
    id3: [new Vec2D(11.10, 21.41), new Vec2D(16.53, 9.67), new Vec2D(13.15, 1.64), new Vec2D(5.34, -2.18)]
  },
  bair: {
    id0: [new Vec2D(-11.71, 6.43), new Vec2D(-13.16, 13.32), new Vec2D(-9.65, 17.03), new Vec2D(-4.29, 17.32), new Vec2D(-3.64, 17.13)],
    id1: [new Vec2D(-7.88, 9.56), new Vec2D(-8.73, 11.06), new Vec2D(-7.80, 12.38), new Vec2D(-5.82, 12.95), new Vec2D(-5.42, 12.91)],
    id2: [new Vec2D(-2.84, 13.05), new Vec2D(-2.76, 13.05), new Vec2D(-2.71, 13.05), new Vec2D(-2.69, 13.06), new Vec2D(-2.68, 13.06)],
    id3: [new Vec2D(-13.71, 1.75), new Vec2D(-18.52, 13.41), new Vec2D(-12.25, 21.73), new Vec2D(-2.71, 22.27), new Vec2D(-2.02, 22.08)]
  },
  dair: {
    id0: [new Vec2D(10.13, -0.93), new Vec2D(-1.89, -4.63), new Vec2D(-9.24, 0.37), new Vec2D(-12.98, 8.16)],
    id1: [new Vec2D(6.38, 0.55), new Vec2D(-1.68, -0.60), new Vec2D(-6.75, 3.33), new Vec2D(-9.01, 8.90)],
    id2: [new Vec2D(2.96, 4.21), new Vec2D(0.04, 4.02), new Vec2D(-2.94, 6.59), new Vec2D(-4.13, 8.61)],
    id3: [new Vec2D(2.66, 10.54), new Vec2D(2.71, 10.14), new Vec2D(2.46, 9.84), new Vec2D(1.93, 9.66)]
  },
  upair: {
    id0: [new Vec2D(12.14, 14.60), new Vec2D(7.42, 23.27), new Vec2D(-1.33, 26.74), new Vec2D(-10.99, 23.29)],
    id1: [new Vec2D(7.46, 16.76), new Vec2D(2.70, 20.80), new Vec2D(-2.77, 21.56), new Vec2D(-8.30, 18.63)],
    id2: [new Vec2D(2.63, 15.58), new Vec2D(-0.33, 16.52), new Vec2D(-2.60, 16.32), new Vec2D(-4.92, 14.73)],
    id3: [new Vec2D(0.43, 11.46), new Vec2D(0.25, 12.43), new Vec2D(0.07, 12.93), new Vec2D(-0.42, 13.26)]
  },
  nair1: {
    id0: [new Vec2D(14.63, 8.71), new Vec2D(6.37, 12.57)],
    id1: [new Vec2D(8.65, 10.24), new Vec2D(6.42, 11.23)],
    id2: [new Vec2D(0.07, 13.43), new Vec2D(0.67, 13.40)],
    id3: [new Vec2D(-0.47, 7.74), new Vec2D(-0.47, 7.74)]
  },
  nair2: {
    id0: [new Vec2D(12.35, 4.38), new Vec2D(0.52, 9.91), new Vec2D(-12.86, 19.45), new Vec2D(-7.52, 17.11), new Vec2D(5.76, 10.14), new Vec2D(12.26, 5.79), new Vec2D(11.80, 5.33)],
    id1: [new Vec2D(7.18, 7.89), new Vec2D(-1.38, 11.67), new Vec2D(-7.63, 16.29), new Vec2D(-3.81, 14.73), new Vec2D(3.67, 11.08), new Vec2D(6.86, 8.92), new Vec2D(6.69, 8.52)],
    id2: [new Vec2D(0.70, 13.51), new Vec2D(0.26, 13.43), new Vec2D(1.01, 12.94), new Vec2D(0.80, 13.13), new Vec2D(-0.01, 13.41), new Vec2D(-0.68, 13.66), new Vec2D(-0.46, 13.68)],
    id3: [new Vec2D(-0.47, 7.74), new Vec2D(-0.47, 7.74), new Vec2D(-0.47, 7.74), new Vec2D(-0.47, 7.74), new Vec2D(-0.48, 7.74), new Vec2D(-0.48, 7.74), new Vec2D(-0.48, 7.74)]
  },
  upb1: {
    id0: [new Vec2D(9.74, 4.31)],
    id1: [new Vec2D(6.39, 6.58)],
    id2: [new Vec2D(-0.53, 5.88)]
  },
  upb2: {
    id0: [new Vec2D(13.85, 13.53), new Vec2D(10.60, 24.21), new Vec2D(8.68, 26.72), new Vec2D(6.97, 27.35), new Vec2D(4.78, 27.94)],
    id1: [new Vec2D(9.83, 13.99), new Vec2D(7.55, 21.56), new Vec2D(5.85, 23.84), new Vec2D(4.32, 24.33), new Vec2D(2.61, 24.55)],
    id2: [new Vec2D(0.01, 8.80), new Vec2D(0.07, 10.68), new Vec2D(0.07, 11.68), new Vec2D(0.07, 11.68), new Vec2D(0.09, 11.67)]
  },
  dtilt: {
    id0: [new Vec2D(18.90, 2.38), new Vec2D(18.96, 2.87), new Vec2D(18.81, 2.94)],
    id1: [new Vec2D(13.12, 4.02), new Vec2D(13.17, 4.45), new Vec2D(13.07, 4.69)],
    id2: [new Vec2D(8.81, 7.67), new Vec2D(8.72, 7.77), new Vec2D(8.64, 7.85)],
    id3: [new Vec2D(23.60, 0.88), new Vec2D(23.72, 1.55), new Vec2D(23.57, 1.62)]
  },
  uptilt1: {
    id0: [new Vec2D(14.64, 13.62), new Vec2D(12.78, 21.24), new Vec2D(7.78, 23.94)],
    id1: [new Vec2D(9.86, 15.22), new Vec2D(8.52, 17.26), new Vec2D(6.52, 18.25)],
    id2: [new Vec2D(3.56, 13.40), new Vec2D(4.28, 13.19), new Vec2D(5.37, 12.98)],
    id3: [new Vec2D(16.87, 10.48), new Vec2D(16.18, 23.26), new Vec2D(9.25, 27.69)]
  },
  uptilt2: {
    id0: [new Vec2D(3.50, 23.34), new Vec2D(0.18, 20.96), new Vec2D(-2.00, 16.58), new Vec2D(-2.09, 12.08)],
    id1: [new Vec2D(4.81, 17.71), new Vec2D(3.27, 16.16), new Vec2D(2.75, 13.91), new Vec2D(2.98, 11.92)],
    id2: [new Vec2D(7.18, 13.37), new Vec2D(8.38, 12.76), new Vec2D(8.69, 12.45), new Vec2D(8.67, 12.40)],
    id3: [new Vec2D(3.11, 27.30), new Vec2D(-0.87, 24.71), new Vec2D(-4.29, 19.86), new Vec2D(-5.30, 14.32)]
  },
  ftilt: {
    id0: [new Vec2D(8.54, 4.11), new Vec2D(16.17, 9.33), new Vec2D(18.10, 13.45), new Vec2D(14.84, 18.26)],
    id1: [new Vec2D(9.39, 8.39), new Vec2D(11.99, 12.21), new Vec2D(13.09, 11.90), new Vec2D(12.10, 13.63)],
    id2: [new Vec2D(4.58, 12.75), new Vec2D(5.70, 11.87), new Vec2D(7.10, 10.66), new Vec2D(8.58, 9.60)],
    id3: [new Vec2D(4.12, 1.46), new Vec2D(18.41, 4.48), new Vec2D(23.49, 13.65), new Vec2D(18.61, 22.11)]
  },
  dashattack: {
    id0: [new Vec2D(11.03, 3.26), new Vec2D(15.21, 6.22), new Vec2D(15.05, 7.87), new Vec2D(13.97, 12.26)],
    id1: [new Vec2D(9.54, 5.43), new Vec2D(10.63, 7.23), new Vec2D(10.13, 8.36), new Vec2D(9.47, 10.73)],
    id2: [new Vec2D(5.49, 9.14), new Vec2D(6.38, 7.95), new Vec2D(7.27, 7.04), new Vec2D(7.26, 6.89)],
    id3: [new Vec2D(6.48, 1.06), new Vec2D(19.59, 2.77), new Vec2D(21.26, 6.96), new Vec2D(20.08, 13.48)]
  },
  jab1: {
    id0: [new Vec2D(13.68, 7.34), new Vec2D(16.64, 10.96), new Vec2D(15.79, 15.10), new Vec2D(12.70, 18.69)],
    id1: [new Vec2D(10.22, 9.87), new Vec2D(12.21, 11.53), new Vec2D(11.63, 13.74), new Vec2D(10.03, 15.89)],
    id2: [new Vec2D(5.18, 12.23), new Vec2D(5.58, 12.10), new Vec2D(5.96, 12.11), new Vec2D(6.75, 12.65)],
    id3: [new Vec2D(16.45, 1.88), new Vec2D(22.52, 8.98), new Vec2D(21.85, 16.40), new Vec2D(18.57, 20.40)]
  },
  jab2: {
    id0: [new Vec2D(16.61, 8.05), new Vec2D(16.65, 13.43), new Vec2D(13.12, 17.59), new Vec2D(7.91, 18.53), new Vec2D(3.47, 16.83)],
    id1: [new Vec2D(12.87, 10.31), new Vec2D(12.38, 13.23), new Vec2D(10.27, 15.37), new Vec2D(7.70, 15.82), new Vec2D(5.58, 15.06)],
    id2: [new Vec2D(7.04, 13.09), new Vec2D(6.30, 13.75), new Vec2D(5.20, 13.28), new Vec2D(5.26, 12.96), new Vec2D(5.59, 13.11)],
    id3: [new Vec2D(19.38, 3.39), new Vec2D(22.57, 12.52), new Vec2D(17.07, 19.43), new Vec2D(9.85, 21.01), new Vec2D(4.67, 18.33)]
  },
  dbground: {
    id0: [new Vec2D(11.97, 19.81), new Vec2D(18.79, 12.44), new Vec2D(16.47, 5.00)],
    id1: [new Vec2D(9.62, 25.13), new Vec2D(23.82, 15.40), new Vec2D(21.42, 1.90)],
    id2: [new Vec2D(11.60, 14.07), new Vec2D(13.01, 11.51), new Vec2D(12.41, 9.36)],
    id3: [new Vec2D(5.43, 14.48), new Vec2D(7.02, 14.17), new Vec2D(9.50, 11.87)]
  },
  fsmash: {
    id0: [new Vec2D(14.73, 20.43), new Vec2D(23.35, 12.45), new Vec2D(18.63, 0.49), new Vec2D(18.83, 0.19)],
    id1: [new Vec2D(14.85, 15.44), new Vec2D(18.30, 10.69), new Vec2D(15.87, 4.03), new Vec2D(15.37, 3.52)],
    id2: [new Vec2D(9.32, 8.08), new Vec2D(10.74, 6.82), new Vec2D(12.01, 5.69), new Vec2D(12.01, 5.08)],
    id3: [new Vec2D(10.98, 24.89), new Vec2D(28.11, 15.83), new Vec2D(24.45, 0.79), new Vec2D(24.65, 0.33)]
  },
  upsmash: {
    id0: [new Vec2D(6.29, 7.64), new Vec2D(6.29, 7.64), new Vec2D(6.29, 7.64), new Vec2D(6.29, 7.64)],
    id1: [new Vec2D(-6.29, 7.64), new Vec2D(-6.29, 7.64), new Vec2D(-6.29, 7.64), new Vec2D(-6.29, 7.64)],
    id2: [new Vec2D(0.91, 21.71), new Vec2D(0.82, 21.13), new Vec2D(0.78, 20.56), new Vec2D(0.78, 20.87)],
    id3: [new Vec2D(0.19, 26.06), new Vec2D(0.03, 25.46), new Vec2D(-0.04, 24.89), new Vec2D(-0.03, 25.20)]
  },
  dsmash1: {
    id0: [new Vec2D(13.69, 4.12), new Vec2D(19.33, 5.53), new Vec2D(15.33, 6.20)],
    id1: [new Vec2D(12.67, 7.34), new Vec2D(14.83, 8.08), new Vec2D(12.92, 8.48)],
    id2: [new Vec2D(6.48, 6.94), new Vec2D(7.05, 6.49), new Vec2D(6.79, 6.43)],
    id3: [new Vec2D(11.96, 2.87), new Vec2D(24.08, 3.30), new Vec2D(19.09, 3.90)]
  },
  dsmash2: {
    id0: [new Vec2D(-9.69, 3.24), new Vec2D(-12.61, 2.91), new Vec2D(-10.56, 3.43)],
    id1: [new Vec2D(-6.68, 4.54), new Vec2D(-8.18, 4.30), new Vec2D(-7.89, 4.30)],
    id2: [new Vec2D(-0.35, 5.31), new Vec2D(-0.65, 5.17), new Vec2D(-0.63, 5.09)],
    id3: [new Vec2D(-10.28, 2.16), new Vec2D(-17.91, 2.01), new Vec2D(-14.94, 2.54)]
  },
  grab: {
    id0: [new Vec2D(14.82, 9.43), new Vec2D(14.82, 9.43)],
    id1: [new Vec2D(11.23, 8.98), new Vec2D(11.23, 8.98)],
    id2: [new Vec2D(8.09, 8.53), new Vec2D(8.09, 8.53)]
  },
  downattack1: {
    id0: [new Vec2D(-11.59, 7.12), new Vec2D(-11.57, 7.18), new Vec2D(-11.59, 7.20), new Vec2D(-11.61, 7.26)],
    id1: [new Vec2D(-7.46, 8.54), new Vec2D(-7.43, 8.59), new Vec2D(-7.43, 8.56), new Vec2D(-7.43, 8.57)],
    id2: [new Vec2D(-3.85, 11.23), new Vec2D(-3.84, 11.27), new Vec2D(-3.84, 11.21), new Vec2D(-3.83, 11.17)],
    id3: [new Vec2D(-17.85, 7.02), new Vec2D(-17.84, 7.07), new Vec2D(-17.86, 7.15), new Vec2D(-17.89, 7.30)]
  },
  downattack2: {
    id0: [new Vec2D(17.65, 9.84), new Vec2D(18.77, 10.73)],
    id1: [new Vec2D(13.16, 10.31), new Vec2D(14.52, 10.42)],
    id2: [new Vec2D(6.59, 11.20), new Vec2D(8.36, 10.74)],
    id3: [new Vec2D(23.38, 8.95), new Vec2D(25.05, 10.63)]
  },
  pummel: {
    id0: [new Vec2D(8.87, 10.75)]
  },
  thrown: {
    id0: [new Vec2D(0, 12)]
  },
  dbground2up: {
    id0: [new Vec2D(13.93, 9.48), new Vec2D(18.57, 15.55), new Vec2D(17.22, 20.42), new Vec2D(12.86, 23.98)],
    id1: [new Vec2D(19.32, 8.20), new Vec2D(24.08, 17.50), new Vec2D(20.91, 24.94), new Vec2D(12.96, 29.82)],
    id2: [new Vec2D(9.24, 12.30), new Vec2D(12.61, 15.16), new Vec2D(12.23, 17.11), new Vec2D(10.91, 18.34)],
    id3: [new Vec2D(6.41, 13.82), new Vec2D(6.20, 14.16), new Vec2D(6.17, 14.29), new Vec2D(6.25, 14.38)]
  },
  dbground2forward: {
    id0: [new Vec2D(20.48, 7.48), new Vec2D(22.65, 6.76), new Vec2D(22.41, 6.82)],
    id1: [new Vec2D(26.00, 6.04), new Vec2D(28.33, 5.44), new Vec2D(28.10, 5.49)],
    id2: [new Vec2D(14.63, 9.09), new Vec2D(16.95, 8.56), new Vec2D(16.71, 8.60)],
    id3: [new Vec2D(11.13, 11.01), new Vec2D(11.36, 11.47), new Vec2D(11.12, 11.51)]
  },
  dbground3down: {
    id0: [new Vec2D(6.45, 11.60), new Vec2D(9.05, 7.71), new Vec2D(10.29, 7.69), new Vec2D(9.56, 7.64)],
    id1: [new Vec2D(4.21, 13.62), new Vec2D(13.25, 3.86), new Vec2D(14.43, 3.80), new Vec2D(13.66, 3.73)],
    id2: [new Vec2D(4.79, 12.73), new Vec2D(5.08, 12.33), new Vec2D(6.37, 12.35), new Vec2D(5.68, 12.32)],
    id3: [new Vec2D(-0.12, 15.10), new Vec2D(0.67, 15.04), new Vec2D(2.06, 15.02), new Vec2D(1.38, 15.03)]
  },
  dbground3forward: {
    id0: [new Vec2D(17.73, 5.45), new Vec2D(20.78, 7.78), new Vec2D(21.21, 11.12), new Vec2D(15.61, 14.32)],
    id1: [new Vec2D(20.65, 4.16), new Vec2D(26.30, 7.46), new Vec2D(26.86, 12.57), new Vec2D(18.57, 17.31)],
    id2: [new Vec2D(13.30, 7.27), new Vec2D(14.85, 8.36), new Vec2D(15.33, 9.71), new Vec2D(13.16, 11.30)],
    id3: [new Vec2D(7.89, 10.10), new Vec2D(9.16, 10.31), new Vec2D(10.14, 10.25), new Vec2D(10.22, 9.96)]
  },
  dbground3up: {
    id0: [new Vec2D(7.02, 19.27), new Vec2D(12.07, 17.75), new Vec2D(13.58, 13.50), new Vec2D(9.11, 6.11), new Vec2D(0.85, 6.55)],
    id1: [new Vec2D(2.93, 23.32), new Vec2D(13.63, 23.36), new Vec2D(18.14, 17.14), new Vec2D(14.32, 5.41), new Vec2D(2.16, 4.51)],
    id2: [new Vec2D(8.72, 14.81), new Vec2D(9.02, 13.05), new Vec2D(8, 11.79), new Vec2D(4.89, 9.28), new Vec2D(1.96, 9.95)],
    id3: [new Vec2D(3.82, 13.40), new Vec2D(5.24, 12.52), new Vec2D(4.99, 12.28), new Vec2D(5.9, 11.39), new Vec2D(6.58, 10.53)]
  },
  dbground4down1: {
    id0: [new Vec2D(21.04, 6.45), new Vec2D(18.94, 7.01), new Vec2D(15.57, 5.85)],
    id1: [new Vec2D(26.75, 7.64), new Vec2D(24.16, 9.42), new Vec2D(21.10, 7.07)],
    id2: [new Vec2D(15.03, 6.32), new Vec2D(13.81, 4.08), new Vec2D(10.58, 3.82)],
    id3: [new Vec2D(8.91, 7.81), new Vec2D(8.41, 7.95), new Vec2D(7.62, 8.22)]
  },
  dbground4down2: {
    id0: [new Vec2D(20.51, 9.29), new Vec2D(18.81, 9.30), new Vec2D(16.14, 6.16)],
    id1: [new Vec2D(25.63, 12.09), new Vec2D(23.56, 12.36), new Vec2D(21.74, 6.97)],
    id2: [new Vec2D(14.84, 7.33), new Vec2D(13.60, 6.35), new Vec2D(10.08, 6.04)],
    id3: [new Vec2D(8.91, 7.73), new Vec2D(9.13, 7.50), new Vec2D(9.16, 7.32)]
  },
  dbground4down3: {
    id0: [new Vec2D(20.55, 3.33), new Vec2D(18.79, 3.87), new Vec2D(15.32, 4.44)],
    id1: [new Vec2D(26.12, 1.62), new Vec2D(24.29, 2.43), new Vec2D(20.91, 3.36)],
    id2: [new Vec2D(14.86, 5.25), new Vec2D(13.12, 6.02), new Vec2D(9.95, 7.15)],
    id3: [new Vec2D(8.86, 7.75), new Vec2D(8.97, 7.58), new Vec2D(9.09, 7.35)]
  },
  dbground4down4: {
    id0: [new Vec2D(21.11, 6.62), new Vec2D(17.96, 7.02), new Vec2D(13.81, 6.48)],
    id1: [new Vec2D(26.77, 8.03), new Vec2D(23.64, 7.41), new Vec2D(19.60, 7.02)],
    id2: [new Vec2D(15.06, 6.39), new Vec2D(13.16, 4.37), new Vec2D(9.48, 4.31)],
    id3: [new Vec2D(8.93, 7.72), new Vec2D(8.24, 8.03), new Vec2D(7.52, 8.26)]
  },
  dbground4down5: {
    id0: [new Vec2D(20.59, 9.14), new Vec2D(20.73, 8.59)],
    id1: [new Vec2D(25.69, 11.47), new Vec2D(25.73, 11.07)],
    id2: [new Vec2D(14.86, 7.23), new Vec2D(14.98, 6.80)],
    id3: [new Vec2D(8.85, 7.75), new Vec2D(8.93, 7.79)]
  },
  dbground4forward: {
    id0: [new Vec2D(7.59, 22.46), new Vec2D(15.21, 17.36), new Vec2D(16.65, 12.44), new Vec2D(16.03, 6.98)],
    id1: [new Vec2D(4.66, 26.91), new Vec2D(19.59, 21.10), new Vec2D(22.43, 13.09), new Vec2D(21.56, 5.58)],
    id2: [new Vec2D(6.86, 17.26), new Vec2D(9.68, 14.66), new Vec2D(10.46, 12.39), new Vec2D(10.45, 9.54)],
    id3: [new Vec2D(2.18, 13.84), new Vec2D(3.41, 13.76), new Vec2D(5.23, 13.22), new Vec2D(6.35, 12.58)]
  },
  dbground4up: {
    id0: [new Vec2D(-1.98, 27.08), new Vec2D(4.12, 28.03), new Vec2D(11.61, 24.78), new Vec2D(14.69, 20.08), new Vec2D(15.17, 12.73), new Vec2D(7.92, 10.37)],
    id1: [new Vec2D(-7.29, 29.52), new Vec2D(1.34, 33.13), new Vec2D(13.63, 30.24), new Vec2D(18.26, 24.70), new Vec2D(20.96, 13.36), new Vec2D(9.32, 10.62)],
    id2: [new Vec2D(2.41, 22.97), new Vec2D(5.18, 22.16), new Vec2D(7.58, 20.32), new Vec2D(9.38, 17.46), new Vec2D(9.32, 14.28), new Vec2D(8.04, 12.21)],
    id3: [new Vec2D(-0.2, 19.48), new Vec2D(0.44, 19.77), new Vec2D(2.4, 19.64), new Vec2D(4.67, 18.70), new Vec2D(6.2, 17.34), new Vec2D(6.29, 16.51)]
  },
  dbair: {
    id0: [new Vec2D(4.35, 19.82), new Vec2D(11.56, 12.39), new Vec2D(9.50, 5.19)],
    id1: [new Vec2D(1.79, 25.05), new Vec2D(16.67, 15.21), new Vec2D(14.53, 2.24)],
    id2: [new Vec2D(4.24, 14.07), new Vec2D(5.68, 11.56), new Vec2D(5.29, 9.46)],
    id3: [new Vec2D(-1.91, 14.46), new Vec2D(-0.31, 14.16), new Vec2D(2.29, 11.91)]
  },
  dbair2forward: {
    id0: [new Vec2D(10.47, 8.09), new Vec2D(12.58, 6.03), new Vec2D(12.53, 6.03)],
    id1: [new Vec2D(15.86, 5.95), new Vec2D(17.99, 3.84), new Vec2D(17.97, 3.90)],
    id2: [new Vec2D(4.76, 10.02), new Vec2D(6.85, 8.81), new Vec2D(6.82, 8.81)],
    id3: [new Vec2D(1.39, 11.76), new Vec2D(1.43, 12.30), new Vec2D(1.38, 12.34)]
  },
  dbair2up: {
    id0: [new Vec2D(5.11, 9.38), new Vec2D(9.48, 15.48), new Vec2D(8.06, 20.27), new Vec2D(3.92, 23.87)],
    id1: [new Vec2D(10.46, 7.94), new Vec2D(15.00, 17.39), new Vec2D(11.83, 24.72), new Vec2D(4.22, 29.70)],
    id2: [new Vec2D(0.52, 12.31), new Vec2D(3.51, 15.13), new Vec2D(3.01, 17.06), new Vec2D(1.77, 18.31)],
    id3: [new Vec2D(-2.20, 13.84), new Vec2D(-2.89, 14.16), new Vec2D(-3.08, 14.29), new Vec2D(-2.98, 14.36)]
  },
  dbair3down: {
    id0: [new Vec2D(5.56, 10.46), new Vec2D(7.38, 6.58), new Vec2D(7.23, 6.55), new Vec2D(7.19, 6.50)],
    id1: [new Vec2D(3.27, 12.44), new Vec2D(11.59, 2.75), new Vec2D(11.37, 2.67), new Vec2D(11.30, 2.59)],
    id2: [new Vec2D(3.91, 11.60), new Vec2D(3.40, 11.19), new Vec2D(3.31, 11.20), new Vec2D(3.30, 11.17)],
    id3: [new Vec2D(-1.03, 13.94), new Vec2D(-1.03, 13.89), new Vec2D(-1.00, 13.87), new Vec2D(-0.99, 13.88)]
  },
  dbair3forward: {
    id0: [new Vec2D(9.20, 8.07), new Vec2D(11.86, 9.69), new Vec2D(12.27, 12.54), new Vec2D(7.42, 15.50)],
    id1: [new Vec2D(12.24, 6.78), new Vec2D(17.37, 9.25), new Vec2D(17.94, 13.87), new Vec2D(10.56, 18.45)],
    id2: [new Vec2D(4.68, 9.88), new Vec2D(5.94, 10.37), new Vec2D(6.35, 11.24), new Vec2D(4.77, 12.52)],
    id3: [new Vec2D(-0.76, 12.73), new Vec2D(0.26, 12.40), new Vec2D(1.14, 11.87), new Vec2D(1.73, 11.22)]
  },
  dbair3up: {
    id0: [new Vec2D(3.23, 19.33), new Vec2D(7.85, 18.08), new Vec2D(9.69, 9.79), new Vec2D(5.30, 6.09), new Vec2D(-3.15, 6.46)],
    id1: [new Vec2D(-0.80, 23.41), new Vec2D(9.23, 23.75), new Vec2D(15.18, 11.52), new Vec2D(10.49, 5.29), new Vec2D(-2.14, 4.43)],
    id2: [new Vec2D(4.82, 14.84), new Vec2D(4.94, 13.19), new Vec2D(3.91, 10.51), new Vec2D(1.13, 9.31), new Vec2D(-1.86, 9.89)],
    id3: [new Vec2D(0.01, 13.39), new Vec2D(1.23, 12.52), new Vec2D(0.98, 12.27), new Vec2D(2.14, 11.35), new Vec2D(2.85, 10.55)]
  },
  dbair4down1: {
    id0: [new Vec2D(12.28, 8.31), new Vec2D(10.38, 7.90), new Vec2D(7.21, 6.87)],
    id1: [new Vec2D(17.98, 9.57), new Vec2D(15.99, 9.47), new Vec2D(12.93, 7.55)],
    id2: [new Vec2D(6.27, 8.12), new Vec2D(5.06, 5.91), new Vec2D(2.13, 5.76)],
    id3: [new Vec2D(0.18, 9.54), new Vec2D(-0.30, 9.68), new Vec2D(-1.06, 9.97)]
  },
  dbair4down2: {
    id0: [new Vec2D(11.82, 10.87), new Vec2D(10.11, 10.94), new Vec2D(7.41, 7.82)],
    id1: [new Vec2D(16.97, 13.60), new Vec2D(14.88, 13.97), new Vec2D(13.02, 8.58)],
    id2: [new Vec2D(6.12, 8.99), new Vec2D(4.87, 8.04), new Vec2D(1.35, 7.75)],
    id3: [new Vec2D(0.26, 9.47), new Vec2D(0.45, 9.22), new Vec2D(0.49, 9.04)]
  },
  dbair4down3: {
    id0: [new Vec2D(11.81, 5.10), new Vec2D(10.06, 5.71), new Vec2D(6.59, 6.23)],
    id1: [new Vec2D(17.39, 3.40), new Vec2D(15.58, 4.32), new Vec2D(12.19, 5.17)],
    id2: [new Vec2D(6.11, 7.00), new Vec2D(4.37, 7.80), new Vec2D(1.21, 8.90)],
    id3: [new Vec2D(0.16, 9.49), new Vec2D(0.24, 9.32), new Vec2D(0.38, 9.08)]
  },
  dbair4down4: {
    id0: [new Vec2D(12.36, 8.44), new Vec2D(9.24, 8.76), new Vec2D(5.05, 8.29)],
    id1: [new Vec2D(18.01, 9.89), new Vec2D(14.92, 9.13), new Vec2D(10.65, 8.87)],
    id2: [new Vec2D(6.31, 8.16), new Vec2D(4.43, 6.11), new Vec2D(0.83, 6.17)],
    id3: [new Vec2D(0.24, 9.47), new Vec2D(-0.44, 9.77), new Vec2D(-1.16, 10.01)]
  },
  dbair4down5: {
    id0: [new Vec2D(11.79, 11.03), new Vec2D(11.74, 10.05)],
    id1: [new Vec2D(16.86, 13.42), new Vec2D(16.19, 12.88)],
    id2: [new Vec2D(6.09, 9.05), new Vec2D(6.29, 7.91)],
    id3: [new Vec2D(0.12, 9.49), new Vec2D(0.25, 9.53)]
  },
  dbair4forward: {
    id0: [new Vec2D(2.87, 22.48), new Vec2D(10.00, 17.42), new Vec2D(11.05, 12.44), new Vec2D(10.19, 7.07)],
    id1: [new Vec2D(-0.05, 26.92), new Vec2D(14.40, 21.18), new Vec2D(16.85, 13.09), new Vec2D(15.73, 5.74)],
    id2: [new Vec2D(2.03, 17.26), new Vec2D(4.44, 14.69), new Vec2D(4.86, 12.40), new Vec2D(4.61, 9.58)],
    id3: [new Vec2D(-2.71, 13.83), new Vec2D(-1.83, 13.75), new Vec2D(-0.35, 13.21), new Vec2D(0.51, 12.58)]
  },
  dbair4up: {
    id0: [new Vec2D(-3.76, 22.93), new Vec2D(1.42, 23.11), new Vec2D(8.70, 20.12), new Vec2D(11.57, 15.69), new Vec2D(11.86, 8.82), new Vec2D(4.65, 7.07)],
    id1: [new Vec2D(-7.94, 26.72), new Vec2D(-1.49, 28.14), new Vec2D(10.69, 25.59), new Vec2D(15.14, 20.31), new Vec2D(17.65, 9.45), new Vec2D(6.14, 7.29)],
    id2: [new Vec2D(-1.11, 17.99), new Vec2D(2.63, 17.25), new Vec2D(4.70, 15.63), new Vec2D(6.25, 13.08), new Vec2D(6.01, 10.37), new Vec2D(4.66, 8.94)],
    id3: [new Vec2D(-2.37, 14.48), new Vec2D(-2.13, 14.83), new Vec2D(-0.48, 14.93), new Vec2D(1.53, 14.33), new Vec2D(2.91, 13.42), new Vec2D(2.95, 13.23)]
  },
  ledgegetupquick: {
    id0: [new Vec2D(7.69, 26.36), new Vec2D(16.75, 17.20), new Vec2D(16.93, 6.96), new Vec2D(12.5, 0.56)],
    id1: [new Vec2D(7.43, 23.07), new Vec2D(13.83, 15.56), new Vec2D(13.4, 7.01), new Vec2D(9.09, 1.65)],
    id2: [new Vec2D(6.15, 17.36), new Vec2D(8.24, 13.24), new Vec2D(7.19, 7.84), new Vec2D(3.43, 4.30)]
  },
  ledgegetupslow: {
    id0: [new Vec2D(17.62, 4.77), new Vec2D(20.41, 11.07), new Vec2D(16.33, 20.91), new Vec2D(6.83, 25.93)],
    id1: [new Vec2D(15.75, 6.33), new Vec2D(17.19, 12.32), new Vec2D(13, 19.59), new Vec2D(4.85, 23.23)],
    id2: [new Vec2D(12.04, 8.75), new Vec2D(11.68, 13.58), new Vec2D(7.76, 16.98), new Vec2D(2.35, 18.52)]
  },
  neutralspecialground: {
    id0: [new Vec2D(8.15, 20.65), new Vec2D(15.85, 16.32), new Vec2D(17.84, 8.04), new Vec2D(15.37, 3.44), new Vec2D(13.33, 1.15), new Vec2D(13.54, 0.62)],
    id1: [new Vec2D(10.27, 15.97), new Vec2D(12.74, 12.26), new Vec2D(12.95, 8.01), new Vec2D(10.96, 4.77), new Vec2D(10.03, 4.11), new Vec2D(10.13, 3.48)],
    id2: [new Vec2D(5.18, 8.27), new Vec2D(5.69, 6.91), new Vec2D(5.80, 5.67), new Vec2D(5.73, 5.03), new Vec2D(5.70, 4.53), new Vec2D(5.77, 3.85)],
    id3: [new Vec2D(2.93, 24.49), new Vec2D(17.81, 22.47), new Vec2D(24.04, 10.06), new Vec2D(21.74, 4.64), new Vec2D(19.80, 1.02), new Vec2D(20.00, 0.97)]
  },
  neutralspecialair: {
    id0: [new Vec2D(6.70, 20.09), new Vec2D(14.32, 17.01), new Vec2D(17.69, 7.25), new Vec2D(13.33, 1.00), new Vec2D(12.50, -0.48), new Vec2D(10.72, -1.75)],
    id1: [new Vec2D(9.82, 16.12), new Vec2D(12.50, 12.52), new Vec2D(12.67, 8.00), new Vec2D(10.03, 4.11), new Vec2D(9.54, 3.06), new Vec2D(8.85, 2.53)],
    id2: [new Vec2D(5.18, 8.26), new Vec2D(5.78, 6.87), new Vec2D(5.77, 5.63), new Vec2D(5.70, 4.53), new Vec2D(5.77, 3.98), new Vec2D(5.82, 3.85)],
    id3: [new Vec2D(0.70, 22.63), new Vec2D(13.68, 23.49), new Vec2D(24.02, 8.79), new Vec2D(19.82, 0.71), new Vec2D(18.79, -2.15), new Vec2D(15.51, -6.15)]
  },
  downspecialground: {
    id0: [new Vec2D(0, 8)]
  },
  downspecialair: {
    id0: [new Vec2D(0, 8)]
  },
  downspecialground2: {
    id0: [new Vec2D(1.81, 0.91), new Vec2D(15.13, 1.33), new Vec2D(19.09, 7.68), new Vec2D(19.18, 11.78), new Vec2D(18.33, 16.01), new Vec2D(16.13, 19.54), new Vec2D(10.90, 22.93)],
    id1: [new Vec2D(5.36, 3.54), new Vec2D(13.65, 5.57), new Vec2D(15.42, 10.26), new Vec2D(14.90, 13.12), new Vec2D(13.86, 15.57), new Vec2D(12.08, 17.59), new Vec2D(8.01, 19.52)],
    id2: [new Vec2D(7.34, 8.21), new Vec2D(10.13, 9.41), new Vec2D(10.33, 11.54), new Vec2D(9.65, 12.82), new Vec2D(9.16, 13.22), new Vec2D(8.64, 13.60), new Vec2D(6.72, 14.45)],
    id3: [new Vec2D(4.06, 13.30), new Vec2D(4.38, 12.76), new Vec2D(4.63, 12.22), new Vec2D(5.42, 11.62), new Vec2D(6.27, 10.96), new Vec2D(7.04, 10.38), new Vec2D(7.59, 9.97)]
  },
  downspecialair2: {
    id0: [new Vec2D(5.66, 3.08), new Vec2D(18.53, 6.00), new Vec2D(20.01, 13.39), new Vec2D(18.66, 16.83), new Vec2D(16.80, 19.12), new Vec2D(12.87, 21.93), new Vec2D(9.16, 23.02)],
    id1: [new Vec2D(8.54, 5.83), new Vec2D(15.37, 9.19), new Vec2D(15.52, 13.30), new Vec2D(14.41, 15.46), new Vec2D(12.85, 16.99), new Vec2D(9.67, 18.82), new Vec2D(6.63, 19.53)],
    id2: [new Vec2D(9.76, 10.28), new Vec2D(10.48, 10.86), new Vec2D(10.57, 11.58), new Vec2D(10.13, 12.38), new Vec2D(9.32, 13.13), new Vec2D(7.69, 14.07), new Vec2D(6.03, 14.57)],
    id3: [new Vec2D(3.82, 13.25), new Vec2D(4.36, 12.60), new Vec2D(5.06, 11.90), new Vec2D(5.89, 11.18), new Vec2D(6.79, 10.47), new Vec2D(7.54, 9.93), new Vec2D(7.98, 9.67)]
  }
});
setHitBoxes(CHARIDS.MARTH_ID, {
  fair: new createHitboxObject(new createHitbox(offsets[0].fair.id0, 3.906, 10, 361, 70, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].fair.id1, 3.906, 9, 361, 70, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].fair.id2, 3.906, 9, 361, 70, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].fair.id3, 3.906, 13, 67, 70, 42, 0, 1, 0, 1, 1)),
  bair: new createHitboxObject(new createHitbox(offsets[0].bair.id0, 3.906, 10, 361, 70, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].bair.id1, 3.906, 9, 361, 70, 25, 0, 1, 0, 1, 1), new createHitbox(offsets[0].bair.id2, 3.906, 9, 361, 70, 10, 0, 1, 0, 1, 1), new createHitbox(offsets[0].bair.id3, 3.906, 13, 361, 70, 30, 0, 1, 0, 1, 1)),
  nair1: new createHitboxObject(new createHitbox(offsets[0].nair1.id0, 3.906, 4, 100, 40, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].nair1.id1, 3.906, 4, 100, 40, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].nair1.id2, 3.906, 4, 100, 40, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].nair1.id3, 3.906, 4, 90, 40, 30, 0, 0, 0, 1, 1)),
  nair2: new createHitboxObject(new createHitbox(offsets[0].nair2.id0, 3.906, 10, 361, 80, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].nair2.id1, 3.906, 10, 361, 80, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].nair2.id2, 3.906, 10, 361, 80, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].nair2.id3, 3.906, 10, 361, 80, 50, 0, 0, 0, 1, 1)),
  dair: new createHitboxObject(new createHitbox(offsets[0].dair.id0, 3.515, 13, 290, 70, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dair.id1, 3.515, 10, 80, 70, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dair.id2, 3.515, 9, 361, 70, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dair.id3, 3.515, 9, 361, 70, 20, 0, 1, 0, 1, 1)),
  upair: new createHitboxObject(new createHitbox(offsets[0].upair.id0, 3.906, 13, 90, 70, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].upair.id1, 3.906, 10, 80, 70, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].upair.id2, 3.906, 9, 80, 70, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].upair.id3, 3.906, 9, 80, 70, 18, 0, 1, 0, 1, 1)),
  upb1: new createHitboxObject(new createHitbox(offsets[0].upb1.id0, 3.906, 13, 361, 70, 80, 0, 1, 2, 1, 1), new createHitbox(offsets[0].upb1.id1, 3.906, 10, 74, 70, 60, 0, 1, 2, 1, 1), new createHitbox(offsets[0].upb1.id2, 3.906, 10, 74, 70, 60, 0, 1, 2, 1, 1)),
  upb2: new createHitboxObject(new createHitbox(offsets[0].upb2.id0, 3.906, 7, 361, 90, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].upb2.id1, 3.906, 7, 74, 90, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].upb2.id2, 3.125, 6, 74, 90, 20, 0, 0, 0, 1, 1)),
  dtilt: new createHitboxObject(new createHitbox(offsets[0].dtilt.id0, 3.906, 9, 30, 40, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dtilt.id1, 2.734, 8, 30, 40, 25, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dtilt.id2, 3.047, 8, 30, 40, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dtilt.id3, 3.906, 10, 30, 40, 50, 0, 1, 1, 1, 1)),
  uptilt1: new createHitboxObject(new createHitbox(offsets[0].uptilt1.id0, 3.906, 9, 110, 120, 40, 0, 1, 1, 1, 1), new createHitbox(offsets[0].uptilt1.id1, 3.125, 9, 361, 118, 40, 0, 1, 1, 1, 1), new createHitbox(offsets[0].uptilt1.id2, 3.047, 8, 361, 116, 40, 0, 1, 1, 1, 1), new createHitbox(offsets[0].uptilt1.id3, 3.906, 12, 110, 100, 50, 0, 1, 1, 1, 1)),
  uptilt2: new createHitboxObject(new createHitbox(offsets[0].uptilt2.id0, 3.906, 10, 85, 120, 40, 0, 1, 1, 1, 1), new createHitbox(offsets[0].uptilt2.id1, 2.734, 9, 361, 118, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].uptilt2.id2, 2.265, 9, 361, 116, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].uptilt2.id3, 3.906, 13, 85, 100, 50, 0, 1, 1, 1, 1)),
  ftilt: new createHitboxObject(new createHitbox(offsets[0].ftilt.id0, 3.906, 9, 361, 70, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].ftilt.id1, 2.734, 9, 361, 70, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].ftilt.id2, 3.047, 9, 361, 70, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].ftilt.id3, 3.906, 13, 361, 70, 60, 0, 1, 1, 1, 1)),
  dashattack: new createHitboxObject(new createHitbox(offsets[0].dashattack.id0, 3.906, 11, 110, 55, 70, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dashattack.id1, 3.125, 9, 361, 60, 35, 0, 0, 1, 1, 1), new createHitbox(offsets[0].dashattack.id2, 2.344, 9, 361, 60, 35, 0, 0, 1, 1, 1), new createHitbox(offsets[0].dashattack.id3, 3.906, 12, 110, 55, 70, 0, 1, 1, 1, 1)),
  jab1: new createHitboxObject(new createHitbox(offsets[0].jab1.id0, 3.906, 4, 361, 50, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].jab1.id1, 3.125, 4, 361, 50, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].jab1.id2, 2.344, 4, 361, 50, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].jab1.id3, 3.906, 6, 361, 60, 30, 0, 1, 1, 1, 1)),
  jab2: new createHitboxObject(new createHitbox(offsets[0].jab2.id0, 3.906, 4, 361, 50, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].jab2.id1, 3.125, 4, 361, 50, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].jab2.id2, 2.344, 4, 361, 50, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].jab2.id3, 3.906, 6, 361, 60, 30, 0, 1, 1, 1, 1)),
  dbground: new createHitboxObject(new createHitbox(offsets[0].dbground.id0, 3.906, 4, 85, 25, 55, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground.id1, 3.125, 4, 96, 25, 55, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground.id2, 3.125, 4, 80, 25, 55, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground.id3, 2.344, 4, 76, 25, 55, 0, 1, 0, 1, 1)),
  dbground2forward: new createHitboxObject(new createHitbox(offsets[0].dbground2forward.id0, 3.906, 5, 105, 100, 16, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground2forward.id1, 3.125, 5, 80, 100, 16, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground2forward.id2, 3.125, 5, 70, 100, 16, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground2forward.id3, 2.344, 5, 50, 100, 16, 0, 1, 0, 1, 1)),
  dbground2up: new createHitboxObject(new createHitbox(offsets[0].dbground2up.id0, 3.906, 5, 90, 40, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground2up.id1, 3.125, 5, 90, 40, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground2up.id2, 3.125, 5, 85, 40, 70, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground2up.id3, 2.344, 5, 79, 40, 85, 0, 1, 0, 1, 1)),
  dbground3down: new createHitboxObject(new createHitbox(offsets[0].dbground3down.id0, 3.906, 12, 270, 100, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3down.id1, 3.125, 12, 270, 100, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3down.id2, 3.125, 12, 270, 100, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3down.id3, 2.344, 12, 270, 100, 50, 0, 1, 0, 1, 1)),
  dbground3forward: new createHitboxObject(new createHitbox(offsets[0].dbground3forward.id0, 3.906, 10, 361, 160, 0, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3forward.id1, 3.125, 10, 361, 160, 0, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3forward.id2, 3.125, 10, 361, 160, 0, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3forward.id3, 2.344, 10, 361, 160, 0, 0, 1, 0, 1, 1)),
  dbground3up: new createHitboxObject(new createHitbox(offsets[0].dbground3up.id0, 3.906, 6, 80, 60, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3up.id1, 3.125, 6, 80, 60, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3up.id2, 3.125, 6, 80, 60, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground3up.id3, 2.344, 6, 80, 60, 60, 0, 1, 0, 1, 1)),
  dbground4down1: new createHitboxObject(new createHitbox(offsets[0].dbground4down1.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down1.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down1.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down1.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbground4down2: new createHitboxObject(new createHitbox(offsets[0].dbground4down2.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down2.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down2.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down2.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbground4down3: new createHitboxObject(new createHitbox(offsets[0].dbground4down3.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down3.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down3.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down3.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbground4down4: new createHitboxObject(new createHitbox(offsets[0].dbground4down4.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down4.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down4.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down4.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbground4down5: new createHitboxObject(new createHitbox(offsets[0].dbground4down5.id0, 4.687, 5, 361, 130, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down5.id1, 3.906, 5, 361, 130, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down5.id2, 3.125, 5, 361, 130, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4down5.id3, 2.344, 5, 361, 130, 20, 0, 1, 0, 1, 1)),
  dbground4forward: new createHitboxObject(new createHitbox(offsets[0].dbground4forward.id0, 3.906, 14, 361, 120, 15, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4forward.id1, 3.125, 14, 361, 120, 15, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4forward.id2, 3.125, 14, 361, 120, 15, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4forward.id3, 2.344, 14, 361, 120, 15, 0, 1, 0, 1, 1)),
  dbground4up: new createHitboxObject(new createHitbox(offsets[0].dbground4up.id0, 3.906, 10, 80, 130, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4up.id1, 3.125, 10, 80, 130, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4up.id2, 3.125, 10, 80, 130, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbground4up.id3, 2.344, 10, 80, 130, 40, 0, 1, 0, 1, 1)),
  dbair: new createHitboxObject(new createHitbox(offsets[0].dbair.id0, 3.906, 4, 85, 25, 55, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair.id1, 3.125, 4, 96, 25, 55, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair.id2, 3.125, 4, 80, 25, 55, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair.id3, 2.344, 4, 76, 25, 55, 0, 1, 0, 1, 1)),
  dbair2forward: new createHitboxObject(new createHitbox(offsets[0].dbair2forward.id0, 3.906, 5, 105, 100, 16, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair2forward.id1, 3.125, 5, 80, 100, 16, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair2forward.id2, 3.125, 5, 70, 100, 16, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair2forward.id3, 2.344, 5, 50, 100, 16, 0, 1, 0, 1, 1)),
  dbair2up: new createHitboxObject(new createHitbox(offsets[0].dbair2up.id0, 3.906, 5, 90, 40, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair2up.id1, 3.125, 5, 90, 40, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair2up.id2, 3.125, 5, 85, 40, 70, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair2up.id3, 2.344, 5, 79, 40, 85, 0, 1, 0, 1, 1)),
  dbair3down: new createHitboxObject(new createHitbox(offsets[0].dbair3down.id0, 3.906, 12, 270, 100, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3down.id1, 3.125, 12, 270, 100, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3down.id2, 3.125, 12, 270, 100, 50, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3down.id3, 2.344, 12, 270, 100, 50, 0, 1, 0, 1, 1)),
  dbair3forward: new createHitboxObject(new createHitbox(offsets[0].dbair3forward.id0, 3.906, 10, 361, 160, 0, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3forward.id1, 3.125, 10, 361, 160, 0, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3forward.id2, 3.125, 10, 361, 160, 0, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3forward.id3, 2.344, 10, 361, 160, 0, 0, 1, 0, 1, 1)),
  dbair3up: new createHitboxObject(new createHitbox(offsets[0].dbair3up.id0, 3.906, 6, 80, 60, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3up.id1, 3.125, 6, 80, 60, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3up.id2, 3.125, 6, 80, 60, 60, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair3up.id3, 2.344, 6, 80, 60, 60, 0, 1, 0, 1, 1)),
  dbair4down1: new createHitboxObject(new createHitbox(offsets[0].dbair4down1.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down1.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down1.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down1.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbair4down2: new createHitboxObject(new createHitbox(offsets[0].dbair4down2.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down2.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down2.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down2.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbair4down3: new createHitboxObject(new createHitbox(offsets[0].dbair4down3.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down3.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down3.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down3.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbair4down4: new createHitboxObject(new createHitbox(offsets[0].dbair4down4.id0, 3.906, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down4.id1, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down4.id2, 3.125, 3, 80, 40, 2, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down4.id3, 2.344, 3, 80, 40, 2, 0, 1, 0, 1, 1)),
  dbair4down5: new createHitboxObject(new createHitbox(offsets[0].dbair4down5.id0, 4.687, 5, 361, 130, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down5.id1, 3.906, 5, 361, 130, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down5.id2, 3.125, 5, 361, 130, 20, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4down5.id3, 2.344, 5, 361, 130, 20, 0, 1, 0, 1, 1)),
  dbair4forward: new createHitboxObject(new createHitbox(offsets[0].dbair4forward.id0, 3.906, 14, 361, 120, 15, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4forward.id1, 3.125, 14, 361, 120, 15, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4forward.id2, 3.125, 14, 361, 120, 15, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4forward.id3, 2.344, 14, 361, 120, 15, 0, 1, 0, 1, 1)),
  dbair4up: new createHitboxObject(new createHitbox(offsets[0].dbair4up.id0, 3.906, 10, 80, 130, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4up.id1, 3.125, 10, 80, 130, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4up.id2, 3.125, 10, 80, 130, 40, 0, 1, 0, 1, 1), new createHitbox(offsets[0].dbair4up.id3, 2.344, 10, 80, 130, 40, 0, 1, 0, 1, 1)),
  fsmash: new createHitboxObject(new createHitbox(offsets[0].fsmash.id0, 3.906, 14, 361, 70, 60, 0, 1, 1, 1, 1), new createHitbox(offsets[0].fsmash.id1, 3.125, 14, 361, 70, 60, 0, 1, 1, 1, 1), new createHitbox(offsets[0].fsmash.id2, 3.515, 14, 361, 70, 60, 0, 1, 1, 1, 1), new createHitbox(offsets[0].fsmash.id3, 3.906, 20, 361, 70, 80, 0, 1, 1, 1, 1)),
  upsmash: new createHitboxObject(new createHitbox(offsets[0].upsmash.id0, 4.297, 8, 70, 100, 0, 100, 0, 1, 1, 1), new createHitbox(offsets[0].upsmash.id1, 4.297, 8, 70, 100, 0, 100, 0, 1, 1, 1), new createHitbox(offsets[0].upsmash.id2, 4.687, 15, 90, 80, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].upsmash.id3, 4.297, 18, 90, 80, 60, 0, 1, 1, 1, 1)),
  dsmash1: new createHitboxObject(new createHitbox(offsets[0].dsmash1.id0, 4.297, 11, 75, 72, 70, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dsmash1.id1, 3.125, 11, 361, 100, 20, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dsmash1.id2, 3.515, 11, 361, 100, 16, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dsmash1.id3, 3.906, 16, 70, 100, 70, 0, 1, 1, 1, 1)),
  dsmash2: new createHitboxObject(new createHitbox(offsets[0].dsmash2.id0, 3.906, 11, 75, 72, 70, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dsmash2.id1, 3.125, 11, 361, 100, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dsmash2.id2, 3.515, 11, 361, 100, 15, 0, 1, 1, 1, 1), new createHitbox(offsets[0].dsmash2.id3, 3.906, 16, 75, 100, 70, 0, 1, 1, 1, 1)),
  grab: new createHitboxObject(new createHitbox(offsets[0].grab.id0, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1), new createHitbox(offsets[0].grab.id1, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1), new createHitbox(offsets[0].grab.id2, 3.906, 0, 361, 100, 0, 0, 2, 3, 1, 1)),
  downattack1: new createHitboxObject(new createHitbox(offsets[0].downattack1.id0, 5.468, 6, 361, 50, 80, 0, 1, 1, 1, 1), new createHitbox(offsets[0].downattack1.id1, 3.906, 6, 361, 50, 80, 0, 1, 1, 1, 1), new createHitbox(offsets[0].downattack1.id2, 3.906, 6, 361, 50, 80, 0, 1, 1, 1, 1), new createHitbox(offsets[0].downattack1.id3, 4.687, 6, 361, 50, 80, 0, 1, 1, 1, 1)),
  downattack2: new createHitboxObject(new createHitbox(offsets[0].downattack2.id0, 5.468, 6, 361, 50, 80, 0, 1, 1, 1, 1), new createHitbox(offsets[0].downattack2.id1, 3.906, 6, 361, 50, 80, 0, 1, 1, 1, 1), new createHitbox(offsets[0].downattack2.id2, 3.906, 6, 361, 50, 80, 0, 1, 1, 1, 1), new createHitbox(offsets[0].downattack2.id3, 4.687, 6, 361, 50, 80, 0, 1, 1, 1, 1)),
  ledgegetupquick: new createHitboxObject(new createHitbox(offsets[0].ledgegetupquick.id0, 3.125, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[0].ledgegetupquick.id1, 3.125, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[0].ledgegetupquick.id2, 3.125, 6, 361, 100, 0, 90, 0, 1, 1, 1)),
  ledgegetupslow: new createHitboxObject(new createHitbox(offsets[0].ledgegetupslow.id0, 3.125, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[0].ledgegetupslow.id1, 3.125, 8, 361, 100, 0, 90, 0, 1, 1, 1), new createHitbox(offsets[0].ledgegetupslow.id2, 3.125, 6, 361, 100, 0, 90, 0, 1, 1, 1)),
  pummel: new createHitboxObject(new createHitbox(offsets[0].pummel.id0, 4.687, 3, 80, 100, 0, 30, 0, 0, 1, 1)),
  throwup: new createHitboxObject(new createHitbox(new Vec2D(5.02334, 15.9095), 0, 4, 93, 130, 60, 0, 0, 0, 1, 1)),
  throwdown: new createHitboxObject(new createHitbox(new Vec2D(3.57509, 0), 0, 5, 135, 50, 65, 0, 0, 0, 1, 1)),
  throwback: new createHitboxObject(new createHitbox(new Vec2D(-1.29306, 0), 0, 4, 117, 60, 70, 0, 0, 0, 1, 1)),
  throwforward: new createHitboxObject(new createHitbox(new Vec2D(7.69851, 0), 0, 4, 50, 45, 70, 0, 0, 0, 1, 1)),
  thrown: new createHitboxObject(new createHitbox(offsets[0].thrown.id0, 3.906, 4, 361, 50, 20, 0, 1, 0, 1, 1)),
  neutralspecialground: new createHitboxObject(new createHitbox(offsets[0].neutralspecialground.id0, 4.297, 7, 361, 100, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].neutralspecialground.id1, 2.734, 7, 361, 100, 30, 0, 1, 1, 1, 1), new createHitbox(offsets[0].neutralspecialground.id2, 3.125, 7, 361, 100, 34, 0, 1, 1, 1, 1), new createHitbox(offsets[0].neutralspecialground.id3, 3.906, 7, 361, 100, 40, 0, 1, 1, 1, 1)),
  neutralspecialair: new createHitboxObject(new createHitbox(offsets[0].neutralspecialair.id0, 4.297, 7, 361, 100, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].neutralspecialair.id1, 2.734, 7, 361, 100, 30, 0, 1, 0, 1, 1), new createHitbox(offsets[0].neutralspecialair.id2, 3.125, 7, 361, 100, 34, 0, 1, 0, 1, 1), new createHitbox(offsets[0].neutralspecialair.id3, 3.906, 7, 361, 100, 40, 0, 1, 0, 1, 1)),
  downspecialground: new createHitboxObject(new createHitbox(offsets[0].downspecialground.id0, 10, 0, 361, 0, 0, 0, 6, 6, 0, 0)),
  downspecialair: new createHitboxObject(new createHitbox(offsets[0].downspecialair.id0, 10, 0, 361, 0, 0, 0, 6, 6, 0, 0)),
  downspecialground2: new createHitboxObject(new createHitbox(offsets[0].downspecialground2.id0, 3.906, 7, 361, 35, 90, 0, 1, 0, 1, 1), new createHitbox(offsets[0].downspecialground2.id1, 4.297, 7, 361, 35, 90, 0, 1, 0, 1, 1), new createHitbox(offsets[0].downspecialground2.id2, 2.734, 7, 361, 35, 90, 0, 1, 0, 1, 1), new createHitbox(offsets[0].downspecialground2.id3, 3.047, 7, 361, 35, 90, 0, 1, 0, 1, 1)),
  downspecialair2: new createHitboxObject(new createHitbox(offsets[0].downspecialair2.id0, 3.906, 7, 361, 35, 90, 0, 1, 0, 1, 1), new createHitbox(offsets[0].downspecialair2.id1, 4.297, 7, 361, 35, 90, 0, 1, 0, 1, 1), new createHitbox(offsets[0].downspecialair2.id2, 2.734, 7, 361, 35, 90, 0, 1, 0, 1, 1), new createHitbox(offsets[0].downspecialair2.id3, 3.047, 7, 361, 35, 90, 0, 1, 0, 1, 1))
});
for (var l = 0; l < 20; l++) {
  offsets[CHARIDS.MARTH_ID].thrown.id0.push(new Vec2D(0, 12));
}
setChars(CHARIDS.MARTH_ID, new charObject(CHARIDS.MARTH_ID));


// ---- characters/marth/dancingBladeAirMobility.js ----
const dancingBladeAirMobility = function (p) {
  const pl = player[p];
  pl.phys.cVel.y -= 0.06;
  if (pl.phys.cVel.y < -1.5) {
    pl.phys.cVel.y = -1.5;
  }
  if (pl.phys.cVel.x > 0) {
    pl.phys.cVel.x -= 0.0025;
    if (pl.phys.cVel.x < 0) {
      pl.phys.cVel.x = 0;
    }
  } else {
    pl.phys.cVel.x += 0.0025;
    if (pl.phys.cVel.x > 0) {
      pl.phys.cVel.x = 0;
    }
  }
};


// ---- characters/marth/dancingBladeCombo.js ----
function dancingBladeCombo(p, min, max, input) {
  const pl = player[p];
  if (pl.timer > 1) {
    if (input[p][0].a && !input[p][1].a || input[p][0].b && !input[p][1].b && !pl.phys.dancingBladeDisable) {
      if (pl.timer < min) {
        pl.phys.dancingBladeDisable = true;
      } else if (pl.timer <= max) {
        pl.phys.dancingBlade = true;
      }
    }
  }
}


/** The character's own action states (shared ones come from shared.js). */
export const M = {};

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
    pl.phys.autoCancel = false;
    pl.inAerial = true;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.bair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.bair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.bair.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.bair.id3;
    M.ATTACKAIRB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRB.interrupt(p, input)) {
      if (pl.timer === 30) {
        pl.phys.face *= -1;
      }
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer > 2 && pl.timer < 12) {}
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 7 && pl.timer < 12) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 12) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 32) {
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
      if (checkForDoubleJump(p, input) && !pl.phys.doubleJumped) {
        if (input[p][0].lsX * pl.phys.face < -0.3) {
          S.JUMPAERIALB.init(p, input);
        } else {
          S.JUMPAERIALF.init(p, input);
        }
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
      if (pl.timer > 4 && pl.timer < 12) {}
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 6 && pl.timer < 10) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 10) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 48) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 59) {
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
    pl.phys.autoCancel = false;
    pl.inAerial = true;
    pl.hitboxes.id[0] = pl.charHitboxes.fair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.fair.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.fair.id3;
    turnOffHitboxes(p);
    M.ATTACKAIRF.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRF.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer > 2 && pl.timer < 11) {}
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 8) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 27) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 33) {
      S.FALL.init(p, input);
      return true;
    } else if (pl.timer > 29) {
      const a = checkForAerials(p, input);
      if (checkForDoubleJump(p, input) && !pl.phys.doubleJumped) {
        if (input[p][0].lsX * pl.phys.face < -0.3) {
          S.JUMPAERIALB.init(p, input);
        } else {
          S.JUMPAERIALF.init(p, input);
        }
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
    pl.hitboxes.id[2] = pl.charHitboxes.nair1.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.nair1.id3;
    M.ATTACKAIRN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRN.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer > 4 && pl.timer < 9) {}
      if (pl.timer > 13 && pl.timer < 21) {}
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer === 7) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 15) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.id[0] = pl.charHitboxes.nair2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.nair2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.nair2.id2;
        pl.hitboxes.id[3] = pl.charHitboxes.nair2.id3;
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 15 && pl.timer < 22) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 22) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 25) {
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
    pl.hitboxes.id[1] = pl.charHitboxes.upair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.upair.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.upair.id3;
    M.ATTACKAIRU.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKAIRU.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
      if (pl.timer > 4 && pl.timer < 18) {}
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
        pl.phys.autoCancel = false;
      }
      if (pl.timer > 5 && pl.timer < 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 27) {
        pl.phys.autoCancel = true;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 45) {
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
      S.LANDINGATTACKAIRU.init(p, input);
    }
  }
};

M.ATTACKDASH = {
  name: "ATTACKDASH",
  canEdgeCancel: false,
  setVelocities: [0.755, 1.962, 2.714, 3.010, 2.849, 2.232, 1.184, 0.542, 0.704, 1.325, 1.487, 1.079, 0.666, 0.631, 0.597, 0.565, 0.536, 0.508, 0.482, 0.458, 0.436, 0.416, 0.398, 0.370, 0.332, 0.299, 0.270, 0.244, 0.222, 0.205, 0.191, 0.181, 0.176, 0.165, 0.148, 0.130, 0.112, 0.093, 0.073, 0.053, 0.032, 0.011, -0.783, -0.783, 0, 0, 0.001, 0.001, 0],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ATTACKDASH";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dashattack.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dashattack.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dashattack.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dashattack.id3;
    M.ATTACKDASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.ATTACKDASH.interrupt(p, input)) {
      pl.phys.cVel.x = M.ATTACKDASH.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer > 9 && pl.timer < 21) {}
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 16) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 16) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 49) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer < 5 && (input[p][0].lA > 0 || input[p][0].rA > 0)) {
      if (pl.phys.cVel.x * pl.phys.face > pl.charAttributes.dMaxV) {
        pl.phys.cVel.x = pl.charAttributes.dMaxV * pl.phys.face;
      }
      M.GRAB.init(p, input);
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
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 7) {
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

M.CLIFFATTACKQUICK = {
  name: "CLIFFATTACKQUICK",
  offset: [[-71.31, -23.71], [-71.32, -23.71], [-71.36, -23.71], [-71.41, -23.71], [-71.46, -23.71], [-71.49, -23.71], [-71.48, -23.71], [-71.42, -23.71], [-71.28, -23.71], [-71.06, -22.49], [-70.72, -19.41], [-70.33, -15.28], [-69.94, -11.06], [-69.55, -7.59], [-69.16, -4.33], [-68.77, -1.27], [-67.98, 0]],
  setVelocities: [0.39, 0.39, 0.38, 0.38, 0.38, 0.38, 0.37, 0.37, 0.36, 0.36, 0.35, 0.35, 0.29, 0.19, 0.11, 0.05, 0, -0.02, -0.03, -0.01, 0, -0.01, -0.01, -0.02, -0.02, -0.03, -0.03, -0.04, -0.04, -0.04, -0.04, -0.04, -0.04, -0.05, -0.04, -0.04, -0.04],
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
      if (pl.timer < 18) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFATTACKQUICK.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFATTACKQUICK.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = M.CLIFFATTACKQUICK.setVelocities[pl.timer - 18] * pl.phys.face;
      }
      if (pl.timer === 17) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 24) {
        pl.hitboxes.active = [true, true, false, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 24 && pl.timer < 28) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 28) {
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

M.CLIFFATTACKSLOW = {
  name: "CLIFFATTACKSLOW",
  offset: [[-71.27, -23.58], [-71.22, -23.27], [-71.16, -22.72], [-71.09, -21.97], [-71.00, -21.05], [-70.91, -20.00], [-70.82, -18.83], [-70.72, -17.58], [-70.62, -16.29], [-70.52, -14.97], [-70.43, -13.67], [-70.34, -12.40], [-70.25, -11.21], [-70.18, -10.11], [-70.1, -8.54], [-70.00, -6.96], [-69.87, -5.72], [-69.72, -4.66], [-69.53, -3.63], [-69.31, -2.56], [-69.05, -1.55], [-68.75, -0.66], [-67.85, 0]],
  setVelocities: [0.66, 0.79, 0.76, 0.65, 0.56, 0.51, 0.47, 0.47, 0.46, 0.42, 0.34, 0.24, 0.11, 0.03, 0.03, 0.03, 0.02, 0.01, 0, -0.01, -0.02, -0.04, -0.06, -0.08, -0.10, -0.13, -0.16, -0.19, -0.21, -0.21, -0.21, -0.20, -0.18, -0.16, -0.13, -0.09],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFATTACKSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 34;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.ledgegetupslow.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.ledgegetupslow.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.ledgegetupslow.id2;
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
      if (pl.timer < 33) {
        if (pl.timer > 9) {
          pl.phys.pos = new Vec2D(x + (M.CLIFFATTACKSLOW.offset[pl.timer - 10][0] + 68.4) * pl.phys.face, y + M.CLIFFATTACKSLOW.offset[pl.timer - 10][1]);
        } else {
          pl.phys.pos = new Vec2D(x + -2.91 * pl.phys.face, y - 23.71);
        }
      } else {
        pl.phys.cVel.x = M.CLIFFATTACKSLOW.setVelocities[pl.timer - 33] * pl.phys.face;
      }
      if (pl.timer === 32) {
        pl.phys.grounded = true;
        pl.phys.onSurface = [l[0] === "ground" ? 0 : 1, l[1]];
        pl.phys.airborneTimer = 0;
        pl.phys.pos.y = y;
      }
      if (pl.timer === 38) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 38 && pl.timer < 42) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 42) {
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

M.CLIFFESCAPEQUICK = {
  name: "CLIFFESCAPEQUICK",
  offset: [[-70.31, -23.71], [-71.33, -23.71], [-71.36, -23.71], [-71.40, -23.71], [-71.43, -23.71], [-71.44, -23.71], [-71.42, -23.71], [-71.37, -23.71], [-71.28, -23.71], [-71.13, -22.69], [-70.93, -19.99], [-70.69, -16.19], [-70.40, -11.83], [-70.04, -7.48], [-69.69, -3.68], [-69.05, -1.01], [-67.74, 0]],
  setVelocities: [4.23, 4.22, 4.21, 1.74, 1.67, 1.61, 1.56, 1.51, 1.47, 1.44, 1.41, 1.39, 1.37, 1.36, 1.36, 1.36, 1.37, 0.14, 0.22, 0.42, 0.62, 0.68, 0.63, 0.49, 0.34, 0.27, 0.21, 0.17, 0.14, 0.13, 0.13],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPEQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 38;
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
      if (pl.timer < 18) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFESCAPEQUICK.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFESCAPEQUICK.offset[pl.timer - 1][1]);
      } else {
        pl.phys.cVel.x = M.CLIFFESCAPEQUICK.setVelocities[pl.timer - 18] * pl.phys.face;
      }
      if (pl.timer === 17) {
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
  offset: [[-71.27, -23.58], [-71.21, -23.27], [-71.14, -22.72], [-71.05, -21.97], [-70.96, -21.05], [-70.86, -20.0], [-70.76, -18.83], [-70.65, -17.58], [-70.55, -16.29], [-70.45, -14.97], [-70.37, -13.67], [-70.29, -12.40], [-70.23, -11.21], [-70.18, -10.07], [-70.13, -8.90], [-70.01, -6.95], [-69.12, -2.82], [-67.68, 0]],
  setVelocities: [0, 0, 0, 0, 0, 0, 0, 0, 0.02, 2.76, 2.65, 2.55, 2.44, 2.34, 2.23, 2.12, 2.01, 1.90, 1.79, 1.68, 1.56, 1.45, 1.34, 1.24, 1.15, 1.07, 0.99, 0.91, 0.85, 0.79, 0.64, 0.42, 0.25, 0.14, 0.08, 0.07, 0.08, 0.07, 0.06, 0.05, 0.05, 0.04, 0.03, 0.02, 0.02, 0.01, 0.01, 0, 0, 0, -0.01],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFESCAPESLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 56;
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
      if (pl.timer < 28) {
        if (pl.timer > 9) {
          pl.phys.pos = new Vec2D(x + (M.CLIFFESCAPESLOW.offset[pl.timer - 10][0] + 68.4) * pl.phys.face, y + M.CLIFFESCAPESLOW.offset[pl.timer - 10][1]);
        } else {
          pl.phys.pos = new Vec2D(x + -2.91 * pl.phys.face, y - 23.71);
        }
      } else {
        pl.phys.cVel.x = M.CLIFFESCAPESLOW.setVelocities[pl.timer - 28] * pl.phys.face;
      }
      if (pl.timer === 27) {
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

M.CLIFFGETUPQUICK = {
  name: "CLIFFGETUPQUICK",
  canBeGrabbed: true,
  offset: [[-71.33, -23.71], [-71.38, -23.71], [-71.42, -23.71], [-71.45, -23.71], [-71.46, -23.71], [-71.44, -23.71], [-71.38, -23.71], [-71.26, -23.71], [-71.07, -22.69], [-70.80, -19.99], [-70.47, -16.19], [-70.11, -11.83], [-69.71, -7.48], [-69.28, -3.68], [-68.83, -1.01], [-67.88, 0], [-67.38, 0], [-66.87, 0], [-66.35, 0], [-65.81, 0], [-65.27, 0], [-64.73, 0], [-64.19, 0], [-63.65, 0], [-63.12, 0], [-62.59, 0], [-62.08, 0], [-61.60, 0], [-61.17, 0], [-60.80, 0], [-60.50, 0], [-60.28, 0]],
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
  offset: [[-71.28, -23.58], [-71.24, -23.27], [-71.18, -22.72], [-71.11, -21.97], [-71.04, -21.05], [-70.96, -20.00], [-70.87, -18.83], [-70.77, -17.58], [-70.67, -16.29], [-70.58, -14.97], [-70.48, -13.67], [-70.38, -12.40], [-70.28, -11.21], [-70.19, -10.05], [-70.10, -8.66], [-69.99, -6.99], [-69.86, -5.26], [-69.76, -3.64], [-69.74, -2.33], [-69.85, -1.49], [-70.07, -1.06], [-70.35, -0.79], [-70.62, -0.59], [-70.83, -0.41], [-70.92, -0.23], [-70.84, -0.1], [-70.66, -0.02], [-70.48, 0.03], [-70.28, 0.05], [-70.08, 0.05], [-69.87, 0.04], [-69.64, 0.02], [-69.40, 0.01], [-69.15, 0], [-68.87, 0], [-68.58, 0], [-67.95, 0]],
  setVelocities: [0.34, 0.36, 0.39, 0.40, 0.41, 0.41, 0.41, 0.41, 0.40, 0.40, 0.39, 0.39, 0.38],
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
      const l = activeStage.ledge[pl.phys.onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      if (pl.timer < 46) {
        if (pl.timer > 8) {
          pl.phys.pos = new Vec2D(x + (M.CLIFFGETUPSLOW.offset[pl.timer - 9][0] + 68.4) * pl.phys.face, y + M.CLIFFGETUPSLOW.offset[pl.timer - 9][1]);
        } else {
          pl.phys.pos = new Vec2D(x + -2.91 * pl.phys.face, y - 23.71);
        }
      } else {
        pl.phys.cVel.x = M.CLIFFGETUPSLOW.setVelocities[pl.timer - 46] * pl.phys.face;
      }
      if (pl.timer === 45) {
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

M.CLIFFJUMPQUICK = {
  name: "CLIFFJUMPQUICK",
  offset: [[-70.91, -23.37], [-70.48, -22.70], [-70.03, -21.59], [-69.59, -20.23], [-69.16, -18.77], [-68.76, -17.39], [-68.82, -16.26], [-69.31, -15.57], [-69.00, -13.87], [-68.51, -8.90], [-68.4, -2.95]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPQUICK";
    pl.timer = 0;
    pl.phys.intangibleTimer = 11;
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
      if (pl.timer < 12) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFJUMPQUICK.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFJUMPQUICK.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 12) {
        pl.phys.cVel = new Vec2D(1 * pl.phys.face, 2.4);
      }
      if (pl.timer > 12) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 50) {
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
  offset: [[-71.27, -23.71], [-71.15, -23.55], [-70.96, -23.07], [-70.73, -22.26], [-70.48, -21.16], [-70.21, -19.81], [-69.94, -18.28], [-69.70, -16.60], [-69.45, -14.12], [-69.19, -10.70], [-69.37, -7.08], [-68.97, -3.53], [-68.59, -1.00], [-68.40, 0], [-68.4, 0], [-68.4, 0], [-68.4, 0], [-68.4, 0]],
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFJUMPSLOW";
    pl.timer = 0;
    pl.phys.intangibleTimer = 18;
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
      if (pl.timer < 19) {
        pl.phys.pos = new Vec2D(x + (M.CLIFFJUMPSLOW.offset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + M.CLIFFJUMPSLOW.offset[pl.timer - 1][1]);
      }
      if (pl.timer === 19) {
        pl.phys.cVel = new Vec2D(1 * pl.phys.face, 2.4);
      }
      if (pl.timer > 19) {
        airDrift(p, input);
        fastfall(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 57) {
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
        pl.phys.intangibleTimer = 31;
      }
      if (pl.timer === 20) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 20 && pl.timer < 24) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 24) {
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
    pl.hitboxes.id[0] = pl.charHitboxes.dsmash1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dsmash1.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dsmash1.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dsmash1.id3;
    M.DOWNSMASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer == 3) {
      if (input[p][0].a || input[p][0].z) {
        pl.phys.charging = true;
        pl.phys.chargeFrames++;
        if (pl.phys.chargeFrames == 5) {}
        if (pl.phys.chargeFrames == 60) {
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
      if (pl.timer > 3 && pl.timer < 11) {}
      if (pl.timer > 16 && pl.timer < 26) {}
      if (pl.timer == 5) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 5 && pl.timer < 8) {
        pl.hitboxes.frame++;
      }
      if (pl.timer == 8) {
        turnOffHitboxes(p);
      }
      if (pl.timer == 20) {
        pl.hitboxes.id[0] = pl.charHitboxes.dsmash2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.dsmash2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.dsmash2.id2;
        pl.hitboxes.id[3] = pl.charHitboxes.dsmash2.id3;
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 20 && pl.timer < 23) {
        pl.hitboxes.frame++;
      }
      if (pl.timer == 23) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 64) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 61 && !pl.inCSS) {
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
  specialClank: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIR";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.cVel.y = 0;
    pl.phys.cVel.x *= 0.5;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecialair.id0;
    M.DOWNSPECIALAIR.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNSPECIALAIR.interrupt(p, input)) {
      pl.phys.cVel.y -= 0.04;
      if (pl.phys.cVel.y < -1.2) {
        pl.phys.cVel.y = -1.2;
      }
      const sign = Math.sign(pl.phys.cVel.x);
      pl.phys.cVel.x -= sign * 0.0025;
      if (pl.phys.cVel.x * sign < 0) {
        pl.phys.cVel.x = 0;
      }
      if (pl.timer === 5) {
        pl.colourOverlayBool = true;
        pl.colourOverlay = "white";
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer === 30) {
        turnOffHitboxes(p);
      }
      if (pl.timer >= 6 && pl.timer <= 28) {
        if (pl.timer % 6 < 2) {
          pl.colourOverlayBool = true;
          pl.colourOverlay = "rgb(122, 122, 122)";
        } else if (pl.timer % 6 < 4) {
          pl.colourOverlayBool = true;
          pl.colourOverlay = "rgb(200, 120, 255)";
        } else {
          pl.colourOverlayBool = false;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 59) {
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
    player[p].actionState = "DOWNSPECIALGROUND";
  },
  onClank: function (p, input) {
    const pl = player[p];
    pl.hit.hitlag = 11;
    pl.colourOverlayBool = false;
    M.DOWNSPECIALAIR2.init(p, input);
  }
};

M.DOWNSPECIALAIR2 = {
  name: "DOWNSPECIALAIR2",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALAIR2";
    pl.timer = 0;
    pl.phys.intangibleTimer = 16;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecialair2.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.downspecialair2.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.downspecialair2.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.downspecialair2.id3;
    M.DOWNSPECIALAIR2.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNSPECIALAIR2.interrupt(p, input)) {
      pl.phys.cVel.y -= 0.04;
      if (pl.phys.cVel.y < -1.2) {
        pl.phys.cVel.y = -1.2;
      }
      const sign = Math.sign(pl.phys.cVel.x);
      pl.phys.cVel.x -= sign * 0.0025;
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 4 && pl.timer < 11) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 11) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 36) {
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

M.DOWNSPECIALGROUND = {
  name: "DOWNSPECIALGROUND",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  specialClank: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSPECIALGROUND";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecialground.id0;
    M.DOWNSPECIALGROUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNSPECIALGROUND.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 5) {
        pl.colourOverlayBool = true;
        pl.colourOverlay = "white";
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      } else if (pl.timer === 30) {
        turnOffHitboxes(p);
      }
      if (pl.timer >= 6 && pl.timer <= 28) {
        if (pl.timer % 6 < 2) {
          pl.colourOverlayBool = true;
          pl.colourOverlay = "rgb(122, 122, 122)";
        } else if (pl.timer % 6 < 4) {
          pl.colourOverlayBool = true;
          pl.colourOverlay = "rgb(200, 120, 255)";
        } else {
          pl.colourOverlayBool = false;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 59) {
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
  onClank: function (p, input) {
    const pl = player[p];
    pl.hit.hitlag = 11;
    pl.colourOverlayBool = false;
    M.DOWNSPECIALGROUND2.init(p, input);
  }
};

M.DOWNSPECIALGROUND2 = {
  name: "DOWNSPECIALGROUND2",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    reduceByTraction(p, true);
    pl.actionState = "DOWNSPECIALGROUND2";
    pl.timer = 0;
    pl.phys.intangibleTimer = 16;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.downspecialground2.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.downspecialground2.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.downspecialground2.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.downspecialground2.id3;
    M.DOWNSPECIALGROUND2.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNSPECIALGROUND2.interrupt(p, input)) {
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      } else if (pl.timer > 4 && pl.timer < 11) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 11) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 36) {
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
    pl.hitboxes.id[3] = pl.charHitboxes.dtilt.id3;
    M.DOWNTILT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.DOWNTILT.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 5 && pl.timer < 11) {}
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, true, true];
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
    if (pl.timer > 49) {
      S.SQUATWAIT.init(p, input);
      return true;
    } else if (pl.timer > 19) {
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
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FORWARDSMASH";
    pl.timer = 0;
    pl.phys.charging = false;
    pl.phys.chargeFrames = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.fsmash.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.fsmash.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.fsmash.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.fsmash.id3;
    M.FORWARDSMASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer === 3) {
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
      if (pl.timer === 5) {}
      if (pl.timer > 5 && pl.timer < 14) {}
      if (pl.timer === 10) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 10 && pl.timer < 14) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 14) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 49) {
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
    pl.hitboxes.id[3] = pl.charHitboxes.ftilt.id3;
    M.FORWARDTILT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.FORWARDTILT.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 5 && pl.timer < 14) {}
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, true, true];
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
    if (player[p].timer > 35) {
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
    pl.hitboxes.id[2] = pl.charHitboxes.grab.id2;
    M.GRAB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.GRAB.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer === 7) {
        pl.hitboxes.active = [true, true, true, false];
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
    pl.hitboxes.id[3] = pl.charHitboxes.jab1.id3;
    M.JAB1.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.JAB1.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 3 && pl.timer < 15) {}
      if (pl.timer > 2 && pl.timer < 26 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 4) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 4 && pl.timer < 8) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 8) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 19 && pl.phys.jabCombo) {
      M.JAB2.init(p, input);
      return true;
    } else if (pl.timer > 27) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 26) {
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
    pl.hitboxes.id[3] = pl.charHitboxes.jab2.id3;
    M.JAB2.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.JAB2.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 4 && pl.timer < 15) {}
      if (pl.timer > 1 && pl.timer < 26 && input[p][0].a && !input[p][1].a) {
        pl.phys.jabCombo = true;
      }
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, true, true];
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
    const pl = player[p];
    if (pl.timer > 19 && pl.phys.jabCombo) {
      M.JAB1.init(p, input);
      return true;
    } else if (pl.timer > 28) {
      S.WAIT.init(p, input);
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

M.NEUTRALSPECIALAIR = {
  name: "NEUTRALSPECIALAIR",
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
    pl.phys.shieldBreakerCharge = 0;
    pl.phys.shieldBreakerChargeAttempt = true;
    pl.phys.shieldBreakerCharging = false;
    pl.phys.cVel.x *= 0.8;
    pl.phys.cVel.y = Math.max(0, pl.phys.cVel.y);
    pl.phys.fastfalled = false;
    pl.colourOverlayBool = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.neutralspecialair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.neutralspecialair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.neutralspecialair.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.neutralspecialair.id3;
    M.NEUTRALSPECIALAIR.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer >= 12 && pl.timer <= 41 && pl.phys.shieldBreakerChargeAttempt) {
      if (input[p][0].b) {
        pl.phys.shieldBreakerCharging = true;
        pl.phys.shieldBreakerCharge++;
        let originalColour = palettes[pPal[p]][0];
        originalColour = originalColour.substr(4, originalColour.length - 5);
        const colourArray = originalColour.split(",");
        const newCol = blendColours(colourArray, [117, 50, 227], Math.min(1, pl.phys.shieldBreakerCharge / 120));
        pl.colourOverlay = "rgb(" + newCol[0] + "," + newCol[1] + "," + newCol[2] + ")";
        pl.colourOverlayBool = true;
        if (pl.phys.shieldBreakerCharge % 6 === 0) {}
      } else {
        pl.phys.shieldBreakerCharging = false;
        pl.phys.shieldBreakerChargeAttempt = false;
        pl.colourOverlayBool = false;
        pl.timer = 42;
      }
    }
    if (pl.phys.shieldBreakerCharging) {
      if (pl.timer > 41) {
        pl.timer = 12;
      }
      if (pl.phys.shieldBreakerCharge === 122) {
        pl.timer = 42;
        pl.phys.shieldBreakerCharging = false;
        pl.phys.shieldBreakerChargeAttempt = false;
        pl.colourOverlayBool = false;
      }
    }
    if (!M.NEUTRALSPECIALAIR.interrupt(p, input)) {
      pl.phys.cVel.y -= pl.charAttributes.gravity;
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
      let decrease;
      if (pl.timer < 12) {
        decrease = 0.02;
      } else {
        decrease = 0.005;
      }
      const sign = Math.sign(pl.phys.cVel.x);
      pl.phys.cVel.x -= decrease * sign;
      if (pl.phys.cVel.x * sign < 0) {
        pl.phys.cVel.x = 0;
      }
      if (pl.timer === 7) {} else if (pl.timer === 11) {
        pl.shieldBreakerID = sounds.shieldbreakercharge.play();
      } else if (pl.timer === 43) {} else if (pl.timer === 46) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
        const newDmg = 7 + 5 * Math.floor(pl.phys.shieldBreakerCharge / 30) + 1 * Math.floor(pl.phys.shieldBreakerCharge / 120);
        pl.hitboxes.id[0].dmg = newDmg;
        pl.hitboxes.id[1].dmg = newDmg;
        pl.hitboxes.id[2].dmg = newDmg;
        pl.hitboxes.id[3].dmg = newDmg;
        if (pl.phys.shieldBreakerCharge >= 120) {} else {}
      } else if (pl.timer > 46 && pl.timer < 52) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 52) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 50) {
        if (pl.phys.shieldBreakerCharge >= 120) {}
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 74) {
      S.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "NEUTRALSPECIALGROUND";
  }
};

M.NEUTRALSPECIALGROUND = {
  name: "NEUTRALSPECIALGROUND",
  canPassThrough: false,
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "NEUTRALSPECIALGROUND";
    pl.timer = 0;
    pl.phys.shieldBreakerCharge = 0;
    pl.phys.shieldBreakerChargeAttempt = true;
    pl.phys.shieldBreakerCharging = false;
    pl.colourOverlayBool = false;
    pl.phys.cVel.x *= 0.8;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.neutralspecialground.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.neutralspecialground.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.neutralspecialground.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.neutralspecialground.id3;
    M.NEUTRALSPECIALGROUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer >= 12 && pl.timer <= 41 && pl.phys.shieldBreakerChargeAttempt) {
      if (input[p][0].b) {
        pl.phys.shieldBreakerCharging = true;
        pl.phys.shieldBreakerCharge++;
        let originalColour = palettes[pPal[p]][0];
        originalColour = originalColour.substr(4, originalColour.length - 5);
        const colourArray = originalColour.split(",");
        const newCol = blendColours(colourArray, [117, 50, 227], Math.min(1, pl.phys.shieldBreakerCharge / 120));
        pl.colourOverlay = "rgb(" + newCol[0] + "," + newCol[1] + "," + newCol[2] + ")";
        pl.colourOverlayBool = true;
        if (pl.phys.shieldBreakerCharge % 6 === 0) {}
      } else {
        pl.phys.shieldBreakerCharging = false;
        pl.phys.shieldBreakerChargeAttempt = false;
        pl.colourOverlayBool = false;
        pl.timer = 42;
      }
    }
    if (pl.phys.shieldBreakerCharging) {
      if (pl.timer > 41) {
        pl.timer = 12;
      }
      if (pl.phys.shieldBreakerCharge === 122) {
        pl.timer = 42;
        pl.phys.shieldBreakerCharging = false;
        pl.phys.shieldBreakerChargeAttempt = false;
        pl.colourOverlayBool = false;
      }
    }
    if (!M.NEUTRALSPECIALGROUND.interrupt(p, input)) {
      if (pl.timer < 12) {
        const sign = Math.sign(pl.phys.cVel.x);
        pl.phys.cVel.x -= 0.02 * sign;
        if (pl.phys.cVel.x * sign < 0) {
          pl.phys.cVel.x = 0;
        }
      } else {
        reduceByTraction(p);
      }
      if (pl.timer === 7) {} else if (pl.timer === 11) {
        pl.shieldBreakerID = sounds.shieldbreakercharge.play();
      } else if (pl.timer === 43) {} else if (pl.timer === 46) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
        const newDmg = 7 + 5 * Math.floor(pl.phys.shieldBreakerCharge / 30) + 1 * Math.floor(pl.phys.shieldBreakerCharge / 120);
        pl.hitboxes.id[0].dmg = newDmg;
        pl.hitboxes.id[1].dmg = newDmg;
        pl.hitboxes.id[2].dmg = newDmg;
        pl.hitboxes.id[3].dmg = newDmg;
        if (pl.phys.shieldBreakerCharge >= 120) {} else {}
      } else if (pl.timer > 46 && pl.timer < 52) {
        pl.hitboxes.frame++;
      } else if (pl.timer === 52) {
        turnOffHitboxes(p);
      }
      if (pl.timer === 50) {
        if (pl.phys.shieldBreakerCharge >= 120) {}
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 74) {
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
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    if (!pl.phys.grounded) {
      if (pl.phys.sideBJumpFlag) {
        pl.phys.cVel.y = 1;
        pl.phys.sideBJumpFlag = false;
      } else {
        pl.phys.cVel.y = 0;
      }
      pl.phys.fastfalled = false;
      pl.phys.cVel.x *= 0.8;
    } else {
      pl.phys.cVel.x *= 0.2;
    }
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair.id3;
    M.SIDESPECIALAIR.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 8, 26, input);
    if (!M.SIDESPECIALAIR.interrupt(p, input)) {
      if (pl.timer === 6) {}
      if (pl.timer > 4 && pl.timer < 12) {}
      dancingBladeAirMobility(p, input);
      if (pl.timer > 4 && pl.timer < 12) {}
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 29) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALAIR2UP.init(p, input);
      } else {
        M.SIDESPECIALAIR2FORWARD.init(p, input);
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

M.SIDESPECIALAIR2FORWARD = {
  name: "SIDESPECIALAIR2FORWARD",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR2FORWARD";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair2forward.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair2forward.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair2forward.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair2forward.id3;
    M.SIDESPECIALAIR2FORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 17, 33, input);
    if (!M.SIDESPECIALAIR2FORWARD.interrupt(p, input)) {
      if (pl.timer > 11 && pl.timer < 25) {}
      dancingBladeAirMobility(p, input);
      if (pl.timer === 14) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 14 && pl.timer < 17) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 17) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 40) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALAIR3UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALAIR3DOWN.init(p, input);
      } else {
        M.SIDESPECIALAIR3FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "SIDESPECIALGROUND2FORWARD";
  }
};

M.SIDESPECIALAIR2UP = {
  name: "SIDESPECIALAIR2UP",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR2UP";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair2up.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair2up.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair2up.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair2up.id3;
    M.SIDESPECIALAIR2UP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 17, 32, input);
    if (!M.SIDESPECIALAIR2UP.interrupt(p, input)) {
      if (pl.timer > 10 && pl.timer < 21) {}
      dancingBladeAirMobility(p, input);
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 16) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 16) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 40) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALAIR3UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALAIR3DOWN.init(p, input);
      } else {
        M.SIDESPECIALAIR3FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "SIDESPECIALGROUND2UP";
  }
};

M.SIDESPECIALAIR3DOWN = {
  name: "SIDESPECIALAIR3DOWN",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR3DOWN";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair3down.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair3down.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair3down.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair3down.id3;
    M.SIDESPECIALAIR3DOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 19, 35, input);
    if (!M.SIDESPECIALAIR3DOWN.interrupt(p, input)) {
      if (pl.timer > 13 && pl.timer < 18) {}
      dancingBladeAirMobility(p, input);
      pl.phys.cVel.x = 0;
      if (pl.timer === 15) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 15 && pl.timer < 19) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 19) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 46) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALAIR4UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALAIR4DOWN.init(p, input);
      } else {
        M.SIDESPECIALAIR4FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "SIDESPECIALGROUND3DOWN";
  }
};

M.SIDESPECIALAIR3FORWARD = {
  name: "SIDESPECIALAIR3FORWARD",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR3FORWARD";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair3forward.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair3forward.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair3forward.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair3forward.id3;
    M.SIDESPECIALAIR3FORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 16, 37, input);
    if (!M.SIDESPECIALAIR3FORWARD.interrupt(p, input)) {
      if (pl.timer > 9 && pl.timer < 18) {}
      dancingBladeAirMobility(p, input);
      pl.phys.cVel.x = 0;
      if (pl.timer === 11) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 11 && pl.timer < 15) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 15) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 46) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALAIR4UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALAIR4DOWN.init(p, input);
      } else {
        M.SIDESPECIALAIR4FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "SIDESPECIALGROUND3FORWARD";
  }
};

M.SIDESPECIALAIR3UP = {
  name: "SIDESPECIALAIR3UP",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR3UP";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair3up.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair3up.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair3up.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair3up.id3;
    M.SIDESPECIALAIR3UP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 18, 38, input);
    if (!M.SIDESPECIALAIR3UP.interrupt(p, input)) {
      if (pl.timer > 9 && pl.timer < 18) {}
      dancingBladeAirMobility(p, input);
      pl.phys.cVel.x = 0;
      if (pl.timer === 13) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 13 && pl.timer < 18) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 18) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 46) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALAIR4UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALAIR4DOWN.init(p, input);
      } else {
        M.SIDESPECIALAIR4FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    player[p].actionState = "SIDESPECIALGROUND3UP";
  }
};

M.SIDESPECIALAIR4DOWN = {
  name: "SIDESPECIALAIR4DOWN",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR4DOWN";
    pl.timer = 0;
    turnOffHitboxes(p);
    M.SIDESPECIALAIR4DOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALAIR4DOWN.interrupt(p, input)) {
      if (pl.timer > 9 && pl.timer < 41) {}
      dancingBladeAirMobility(p, input);
      if (pl.timer > 12 && pl.timer < 39) {
        switch (pl.timer % 6) {
          case 1:
            const hbName = "dbair4down" + Math.floor((pl.timer - 7) / 6);
            pl.hitboxes.id[0] = pl.charHitboxes[hbName].id0;
            pl.hitboxes.id[1] = pl.charHitboxes[hbName].id1;
            pl.hitboxes.id[2] = pl.charHitboxes[hbName].id2;
            pl.hitboxes.id[3] = pl.charHitboxes[hbName].id3;
            pl.hitboxes.active = [true, true, true, true];
            pl.hitboxes.frame = 0;
            if (pl.timer < 37) {}
            break;
          case 2:
          case 3:
            pl.hitboxes.frame++;
            break;
          case 4:
            turnOffHitboxes(p);
            break;
          default:
            break;
        }
      }
      if (pl.timer === 39) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 60) {
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
    player[p].actionState = "SIDESPECIALGROUND4DOWN";
  }
};

M.SIDESPECIALAIR4FORWARD = {
  name: "SIDESPECIALAIR4FORWARD",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR4FORWARD";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair4forward.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair4forward.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair4forward.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair4forward.id3;
    M.SIDESPECIALAIR4FORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALAIR4FORWARD.interrupt(p, input)) {
      if (pl.timer > 21 && pl.timer < 30) {}
      dancingBladeAirMobility(p, input);
      pl.phys.cVel.x = 0;
      if (pl.timer === 23) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 23 && pl.timer < 27) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 27) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 50) {
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
    player[p].actionState = "SIDESPECIALGROUND4FORWARD";
  }
};

M.SIDESPECIALAIR4UP = {
  name: "SIDESPECIALAIR4UP",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALAIR4UP";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbair4up.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbair4up.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbair4up.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbair4up.id3;
    M.SIDESPECIALAIR4UP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALAIR4UP.interrupt(p, input)) {
      if (pl.timer > 17 && pl.timer < 27) {}
      dancingBladeAirMobility(p, input);
      pl.phys.cVel.x = 0;
      if (pl.timer === 20) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 20 && pl.timer < 26) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 26) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 50) {
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
    player[p].actionState = "SIDESPECIALGROUND4UP";
  }
};

M.SIDESPECIALGROUND = {
  name: "SIDESPECIALGROUND",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    pl.phys.cVel.x *= 0.2;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground.id3;
    M.SIDESPECIALGROUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 8, 26, input);
    if (!M.SIDESPECIALGROUND.interrupt(p, input)) {
      if (pl.timer === 6) {}
      reduceByTraction(p, true);
      if (pl.timer > 4 && pl.timer < 12) {}
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 9) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 29) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALGROUND2UP.init(p, input);
      } else {
        M.SIDESPECIALGROUND2FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALGROUND2FORWARD = {
  name: "SIDESPECIALGROUND2FORWARD",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND2FORWARD";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground2forward.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground2forward.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground2forward.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground2forward.id3;
    M.SIDESPECIALGROUND2FORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 17, 33, input);
    if (!M.SIDESPECIALGROUND2FORWARD.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 12 && pl.timer < 17) {}
      if (pl.timer === 14) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 14 && pl.timer < 17) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 17) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 40) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALGROUND3UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALGROUND3DOWN.init(p, input);
      } else {
        M.SIDESPECIALGROUND3FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALGROUND2UP = {
  name: "SIDESPECIALGROUND2UP",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND2UP";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground2up.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground2up.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground2up.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground2up.id3;
    M.SIDESPECIALGROUND2UP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 17, 32, input);
    if (!M.SIDESPECIALGROUND2UP.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 10 && pl.timer < 20) {}
      if (pl.timer === 12) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 12 && pl.timer < 16) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 16) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 40) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALGROUND3UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALGROUND3DOWN.init(p, input);
      } else {
        M.SIDESPECIALGROUND3FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALGROUND3DOWN = {
  name: "SIDESPECIALGROUND3DOWN",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  setVelocities: [0, 2.53, 3.15, 1.25, 1.25, 1.21, 1.13, 1.01, 0.85, 0.66, 0.42, 0.15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.32, -0.85, -1.20, -1.37, -1.37, -1.20, -0.85, -0.32, 0.03, 0.10, 0.15, 0.18, 0.21, 0.22, 0.22, 0.20, 0.18, 0.14, 0.09],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND3DOWN";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground3down.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground3down.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground3down.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground3down.id3;
    M.SIDESPECIALGROUND3DOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 19, 35, input);
    if (!M.SIDESPECIALGROUND3DOWN.interrupt(p, input)) {
      pl.phys.cVel.x = M.SIDESPECIALGROUND3DOWN.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer > 13 && pl.timer < 18) {}
      if (pl.timer === 15) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 15 && pl.timer < 19) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 19) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 46) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALGROUND4UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALGROUND4DOWN.init(p, input);
      } else {
        M.SIDESPECIALGROUND4FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALGROUND3FORWARD = {
  name: "SIDESPECIALGROUND3FORWARD",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  setVelocities: [0, 0.41, 0.80, 0.58, 0.20, 0.10, 0.03, 0, -0.01, 0, 0, 0, 0, 1.10, 2.75, 3.58, 3.58, 2.76, 1.11, 0.01, 0, 0, 0, 0, 0, -0.01, -0.01, 0, 0, 0, 0, 0.01, 0.01, 0.03, -0.01, -0.18, -0.48, -0.99, -1.39, -1.43, -1.12, -0.45, 0, 0, 0, 0],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND3FORWARD";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground3forward.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground3forward.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground3forward.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground3forward.id3;
    M.SIDESPECIALGROUND3FORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 16, 37, input);
    if (!M.SIDESPECIALGROUND3FORWARD.interrupt(p, input)) {
      pl.phys.cVel.x = M.SIDESPECIALGROUND3FORWARD.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer > 10 && pl.timer < 18) {}
      if (pl.timer === 11) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 11 && pl.timer < 15) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 15) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 46) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALGROUND4UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALGROUND4DOWN.init(p, input);
      } else {
        M.SIDESPECIALGROUND4FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALGROUND3UP = {
  name: "SIDESPECIALGROUND3UP",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  setVelocities: [0, 0.37, 0.91, 1.18, 1.18, 0.9, 0.46, 0.22, 0.25, 0.55, 1.02, 1.32, 1.35, 1.11, 0.88, 0.76, 0.54, 0.20, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.04, -0.12, -0.18, -0.24, -0.28, -0.32, -0.34, -0.35, -0.35, -0.34, -0.32, -0.28, -0.24, -0.18, -0.12, -0.04, 0, 0.01, 0.01],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND3UP";
    pl.timer = 0;
    pl.phys.dancingBlade = false;
    pl.phys.dancingBladeDisable = false;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground3up.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground3up.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground3up.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground3up.id3;
    M.SIDESPECIALGROUND3UP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    dancingBladeCombo(p, 18, 38, input);
    if (!M.SIDESPECIALGROUND3UP.interrupt(p, input)) {
      pl.phys.cVel.x = M.SIDESPECIALGROUND3UP.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer > 3 && pl.timer < 21) {}
      if (pl.timer === 13) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 13 && pl.timer < 18) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 18) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 46) {
      if (pl.phys.grounded) {
        S.WAIT.init(p, input);
      } else {
        S.FALL.init(p, input);
      }
      return true;
    } else if (pl.phys.dancingBlade) {
      if (input[p][0].lsY > 0.56) {
        M.SIDESPECIALGROUND4UP.init(p, input);
      } else if (input[p][0].lsY < -0.56) {
        M.SIDESPECIALGROUND4DOWN.init(p, input);
      } else {
        M.SIDESPECIALGROUND4FORWARD.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

M.SIDESPECIALGROUND4DOWN = {
  name: "SIDESPECIALGROUND4DOWN",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  setVelocities: [0, 1.37, 1.61, 1.56, 1.20, 0.94, 0.94, 0.91, 0.83, 0.71, 0.56, 0.36, 0.13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.01, -0.02, -0.02, -0.02, -0.02, -0.02, -0.02, -0.01, 0, 0, 0, 0, -0.02, -0.05, -0.08, -0.09, -0.10, -0.11, -0.10, -0.09, -0.07, -0.04],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND4DOWN";
    pl.timer = 0;
    turnOffHitboxes(p);
    M.SIDESPECIALGROUND4DOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALGROUND4DOWN.interrupt(p, input)) {
      pl.phys.cVel.x = M.SIDESPECIALGROUND4DOWN.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer > 9 && pl.timer < 40) {}
      if (pl.timer > 12 && pl.timer < 39) {
        switch (pl.timer % 6) {
          case 1:
            const hbName = "dbground4down" + Math.floor((pl.timer - 7) / 6);
            pl.hitboxes.id[0] = pl.charHitboxes[hbName].id0;
            pl.hitboxes.id[1] = pl.charHitboxes[hbName].id1;
            pl.hitboxes.id[2] = pl.charHitboxes[hbName].id2;
            pl.hitboxes.id[3] = pl.charHitboxes[hbName].id3;
            pl.hitboxes.active = [true, true, true, true];
            pl.hitboxes.frame = 0;
            if (pl.timer < 37) {}
            break;
          case 2:
          case 3:
            pl.hitboxes.frame++;
            break;
          case 4:
            turnOffHitboxes(p);
            break;
          default:
            break;
        }
      }
      if (pl.timer === 39) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 60) {
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

M.SIDESPECIALGROUND4FORWARD = {
  name: "SIDESPECIALGROUND4FORWARD",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  setVelocities: [0, 0.38, 1.33, 1.49, 1.56, 1.53, 1.41, 1.19, 0.88, 0.62, 0.50, 0.40, 0.31, 0.25, 0.21, 0.19, 0.19, 0.21, 0.22, 0.21, 0.19, 0.18, 0.16, 0.14, 0.11, 0.08, 0.05, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.04, -0.11, -0.18, -0.22, -0.25, -0.27, -0.28, -0.27, -0.25, -0.22, -0.17, -0.11, -0.05],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND4FORWARD";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground4forward.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground4forward.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground4forward.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground4forward.id3;
    M.SIDESPECIALGROUND4FORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALGROUND4FORWARD.interrupt(p, input)) {
      pl.phys.cVel.x = M.SIDESPECIALGROUND4FORWARD.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer > 21 && pl.timer < 30) {}
      if (pl.timer === 23) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 23 && pl.timer < 27) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 27) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 50) {
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

M.SIDESPECIALGROUND4UP = {
  name: "SIDESPECIALGROUND4UP",
  canPassThrough: false,
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  setVelocities: [0, 0.87, 0.91, 0.94, 0.97, 0.98, 0.99, 0.98, 0.97, 0.95, 0.92, 0.88, 0.83, 0.77, 0.70, 0.60, 0.49, 0.39, 0.32, 0.26, 0.23, 0.21, 0.21, 0.23, 0.27, 0.30, 0.25, 0.10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.36, -0.93, -1.28, -1.39, -1.28, -0.93, -0.36, 0, 0, 0, 0],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SIDESPECIALGROUND4UP";
    pl.timer = 0;
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.dbground4up.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.dbground4up.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.dbground4up.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.dbground4up.id3;
    M.SIDESPECIALGROUND4UP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.SIDESPECIALGROUND4UP.interrupt(p, input)) {
      pl.phys.cVel.x = M.SIDESPECIALGROUND4UP.setVelocities[pl.timer - 1] * pl.phys.face;
      if (pl.timer > 18 && pl.timer < 27) {}
      if (pl.timer === 20) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 20 && pl.timer < 26) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 26) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 50) {
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
    actionStates[characterSelections[grabbing]].THROWNMARTHBACK.init(grabbing, input);
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwback.id0;
    const frame = framesData[characterSelections[grabbing]].THROWNMARTHBACK;
    pl.phys.releaseFrame = frame + 1;
    M.THROWBACK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 7 / pl.phys.releaseFrame;
    if (!M.THROWBACK.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 7 && Math.floor(prevFrame + 0.01) < 7) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
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
      if (pl.timer < 7 && player[grabbing].phys.grabbedBy !== p) {
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
    actionStates[characterSelections[grabbing]].THROWNMARTHDOWN.init(grabbing, input);
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwdown.id0;
    const frame = framesData[characterSelections[grabbing]].THROWNMARTHDOWN;
    pl.phys.releaseFrame = frame + 1;
    M.THROWDOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 13 / pl.phys.releaseFrame;
    if (!M.THROWDOWN.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 13 && Math.floor(prevFrame + 0.01) < 13) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 37) {
      pl.phys.grabbing = -1;
      S.WAIT.init(p, input);
      return true;
    } else {
      const grabbing = pl.phys.grabbing;
      if (grabbing === -1) {
        return;
      }
      if (pl.timer < 13 && player[grabbing].phys.grabbedBy !== p) {
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
    actionStates[characterSelections[grabbing]].THROWNMARTHFORWARD.init(grabbing, input);
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwforward.id0;
    const frame = framesData[characterSelections[grabbing]].THROWNMARTHFORWARD;
    pl.phys.releaseFrame = frame + 1;
    M.THROWFORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 13 / pl.phys.releaseFrame;
    if (!M.THROWFORWARD.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 13 && Math.floor(prevFrame + 0.01) < 13) {
        hitQueue.push([pl.phys.grabbing, p, 0, false, true, true]);
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 27) {
      pl.phys.grabbing = -1;
      S.WAIT.init(p, input);
      return true;
    } else {
      const grabbing = pl.phys.grabbing;
      if (grabbing === -1) {
        return;
      }
      if (pl.timer < 13 && player[grabbing].phys.grabbedBy !== p) {
        S.CATCHCUT.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  }
};

M.THROWNMARTHBACK = {
  name: "THROWNMARTHBACK",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-6.93, 2.63], [-4.37, 2.35], [-1.03, 2.23], [-0.04, 0.73], [1.12, -1.77], [1.23, -2.01], [1.23, -2.01]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNMARTHBACK";
    const grabbedBy = pl.phys.grabbedBy;
    if (grabbedBy < p) {
      pl.timer = -1;
    } else {
      pl.timer = 0;
    }
    pl.phys.grounded = false;
    pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x, player[grabbedBy].phys.pos.y);
    M.THROWNMARTHBACK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNMARTHBACK.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > M.THROWNMARTHBACK.offset.length) {
          timer = M.THROWNMARTHBACK.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNMARTHBACK.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + M.THROWNMARTHBACK.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNMARTHDOWN = {
  name: "THROWNMARTHDOWN",
  canEdgeCancel: false,
  reverseModel: true,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-9.23, 3.12], [-11.00, 3.75], [-12.45, 4.26], [-12.67, 4.33], [-12.67, 4.33], [-12.67, 4.33], [-12.92, 3.86], [-13.31, 2.59], [-13.16, 1.05], [-12.50, -0.70], [-11.29, -2.85], [-8.43, -6.34], [-8.43, -6.34], [-8.43, -6.34]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNMARTHDOWN";
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
    M.THROWNMARTHDOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNMARTHDOWN.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        if (timer > M.THROWNMARTHDOWN.offset.length) {
          timer = M.THROWNMARTHDOWN.offset.length - 1;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNMARTHDOWN.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + M.THROWNMARTHDOWN.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNMARTHFORWARD = {
  name: "THROWNMARTHFORWARD",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-10.23, 2.34], [-11.36, 2.91], [-9.76, 4.86], [-9.49, 5.06], [-9.31, 5.09], [-9.28, 5.01], [-9.49, 4.86], [-10.27, 4.65], [-13.57, 3.61], [-11.63, 1.55], [-9.61, -2.20], [-7.85, -7.66], [-7.85, -7.66]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNMARTHFORWARD";
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
    M.THROWNMARTHFORWARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNMARTHFORWARD.interrupt(p, input)) {
      let timer = pl.timer;
      if (timer > 0) {
        if (timer > this.offset.length) {
          timer = M.THROWNMARTHFORWARD.offset.length - 1;
        }
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNMARTHFORWARD.offset[timer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + M.THROWNMARTHFORWARD.offset[timer - 1][1]);
      }
    }
  },
  interrupt: function (p, input) {
    return false;
  }
};

M.THROWNMARTHUP = {
  name: "THROWNMARTHUP",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  offset: [[-9.42, 2.73], [-10.14, 2.56], [-10.83, 2.00], [-10.97, 1.82], [-10.74, 1.85], [-10.44, 1.95], [-10.17, 2.05], [-10.08, 2.08], [-11.07, 2.81], [-8.94, 11.00], [-8.94, 11.00]],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNMARTHUP";
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
    M.THROWNMARTHUP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.THROWNMARTHUP.interrupt(p, input)) {
      if (pl.timer > 0) {
        let playerTimer = pl.timer;
        if (playerTimer > M.THROWNMARTHUP.offset.length) {
          playerTimer = M.THROWNMARTHUP.offset.length - 1;
        }
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + M.THROWNMARTHUP.offset[playerTimer - 1][0] * pl.phys.face, player[grabbedBy].phys.pos.y + M.THROWNMARTHUP.offset[playerTimer - 1][1]);
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
    actionStates[characterSelections[grabbing]].THROWNMARTHUP.init(grabbing, input);
    turnOffHitboxes(p);
    pl.hitboxes.id[0] = pl.charHitboxes.throwup.id0;
    const frame = framesData[characterSelections[grabbing]].THROWNMARTHUP;
    pl.phys.releaseFrame = frame + 1;
    M.THROWUP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const prevFrame = pl.timer;
    pl.timer += 12 / pl.phys.releaseFrame;
    if (!M.THROWUP.interrupt(p, input)) {
      if (Math.floor(pl.timer + 0.01) >= 12 && Math.floor(prevFrame + 0.01) < 12) {
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
        return false;
      }
      if (pl.timer < 11 && player[grabbing].phys.grabbedBy !== p) {
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
    pl.hitboxes.id[2] = pl.charHitboxes.upsmash.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.upsmash.id3;
    M.UPSMASH.main(p, input);
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
    if (!M.UPSMASH.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 10 && pl.timer < 16) {}
      if (pl.timer === 13) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 13 && pl.timer < 17) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 17) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 54) {
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

M.UPSPECIAL = {
  name: "UPSPECIAL",
  canPassThrough: true,
  canGrabLedge: [true, false],
  setVelocities: [[0.75685, 14.41555], [0.71450, 15.51062], [0.67334, 8.65633], [0.63338, 2.42162], [0.59462, 2.11897], [0.55706, 1.83569], [0.52069, 1.57181], [0.48552, 1.32731], [0.45155, 1.10218], [0.41878, 0.89645], [0.38720, 0.71010], [0.35682, 0.54314], [0.32765, 0.39556], [0.29966, 0.26735], [0.27288, 0.15855], [0.24729, 0.06912], [0.22290, -0.00093]],
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
    pl.hitboxes.id[0] = pl.charHitboxes.upb1.id0;
    pl.hitboxes.id[1] = pl.charHitboxes.upb1.id1;
    pl.hitboxes.id[2] = pl.charHitboxes.upb1.id2;
    pl.phys.landingMultiplier = 0.882353;
    M.UPSPECIAL.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.UPSPECIAL.interrupt(p, input)) {
      if (pl.phys.cVel.y <= 0) {
        pl.phys.canWallJump = true;
      }
      if (pl.timer < 6) {
        if (Math.abs(input[p][0].lsX) > 0.7) {
          pl.phys.upbAngleMultiplier = -input[p][0].lsX * Math.PI / 16;
        }
      }
      if (pl.timer === 6) {
        pl.phys.grounded = false;
        if (input[p][0].lsX * pl.phys.face < -0.28) {
          pl.phys.face *= -1;
        }
      }
      if (pl.timer > 5 && pl.timer < 23) {
        pl.phys.cVel = new Vec2D(M.UPSPECIAL.setVelocities[pl.timer - 6][0] * pl.phys.face * Math.cos(pl.phys.upbAngleMultiplier) - M.UPSPECIAL.setVelocities[pl.timer - 6][1] * Math.sin(pl.phys.upbAngleMultiplier), M.UPSPECIAL.setVelocities[pl.timer - 6][0] * pl.phys.face * Math.sin(pl.phys.upbAngleMultiplier) + M.UPSPECIAL.setVelocities[pl.timer - 6][1] * Math.cos(pl.phys.upbAngleMultiplier));
      } else if (pl.timer > 22) {
        fastfall(p, input);
        airDrift(p, input);
        if (Math.abs(pl.phys.cVel.x) > 0.36) {
          pl.phys.cVel.x = 0.36 * Math.sign(pl.phys.cVel.x);
        }
      }
      if (pl.timer === 5) {
        pl.hitboxes.active = [true, true, true, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer === 6) {
        pl.hitboxes.id[0] = pl.charHitboxes.upb2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.upb2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.upb2.id2;
      }
      if (pl.timer > 6 && pl.timer < 11) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 11) {
        turnOffHitboxes(p);
      }
      if (pl.timer > 2 && pl.timer < 12) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 39) {
      S.FALLSPECIAL.init(p, input);
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
    pl.hitboxes.id[2] = pl.charHitboxes.uptilt1.id2;
    pl.hitboxes.id[3] = pl.charHitboxes.uptilt1.id3;
    M.UPTILT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!M.UPTILT.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 4 && pl.timer < 15) {}
      if (pl.timer === 6) {
        pl.hitboxes.active = [true, true, true, true];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 6 && pl.timer < 13) {
        pl.hitboxes.frame++;
      }
      if (pl.timer === 9) {
        pl.hitboxes.frame = 0;
        pl.hitboxes.id[0] = pl.charHitboxes.uptilt2.id0;
        pl.hitboxes.id[1] = pl.charHitboxes.uptilt2.id1;
        pl.hitboxes.id[2] = pl.charHitboxes.uptilt2.id2;
        pl.hitboxes.id[3] = pl.charHitboxes.uptilt2.id3;
      }
      if (pl.timer === 13) {
        turnOffHitboxes(p);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 39) {
      S.WAIT.init(p, input);
      return true;
    } else if (pl.timer > 31) {
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
      if (pl.timer === 2) {}
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 93) {
      S.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

setupActionStates(CHARIDS.MARTH_ID, { ...S, ...M });

actionStates[CHARIDS.MARTH_ID].ESCAPEB.setVelocities = [-2.267, -2.536, -2.706, -2.780, -2.758, -2.640, -2.426, -2.116, -1.711, -1.209, -0.888, -0.819, -0.758, -0.707, -0.664, -0.631, -0.606, -0.591, -0.585, -0.587, -0.599, -0.620, -0.809, -1.072, -1.205, -1.207, -1.078, -0.819, -0.617, -0.556, -0.487, -0.413, -0.332, -0.245, -0.152];
actionStates[CHARIDS.MARTH_ID].ESCAPEF.setVelocities = [1.282, 1.254, 1.267, 1.322, 1.418, 1.557, 1.737, 1.959, 4.447, 4.593, 2.338, 2.229, 2.070, 1.862, 1.605, 1.298, 0.941, 0.727, 0.687, 0.648, 0.608, 0.569, 0.529, 0.490, 0.450, 0.411, 0.372, 0.332, 0.293, 0.254, 0.215, 0.176, 0.137, 0.098, 0.058];
actionStates[CHARIDS.MARTH_ID].DOWNSTANDB.setVelocities = [-0.185, -0.370, -0.573, -1.540, -1.614, -1.586, -1.566, -1.614, -1.647, -1.666, -1.669, -1.657, -1.630, -1.588, -1.531, -1.397, -1.224, -1.094, -1.006, -0.962, -0.960, -0.926, -0.816, -0.684, -0.529, -0.352, -0.226, -0.171, -0.124, -0.084, -0.051, -0.025, -0.007, 0.004, 0.008];
actionStates[CHARIDS.MARTH_ID].DOWNSTANDF.setVelocities = [0.467, 1.360, 1.733, 2.135, 2.355, 2.581, 2.055, 2.281, 2.184, 1.902, 1.703, 1.521, 1.357, 1.211, 1.082, 0.971, 0.878, 0.802, 0.743, 0.703, 0.680, 0.674, 0.686, 0.716, 0.763, 0.775, 0.727, 0.661, 0.577, 0.474, 0.352, 0.241, 0.163, 0.101, 0.055];
actionStates[CHARIDS.MARTH_ID].TECHB.setVelocities = [0, 0, 0, 0, 0, 0, 0, -2.832, -2.726, -2.622, -2.521, -2.422, -2.326, -2.233, -2.142, -2.054, -1.968, -1.885, -1.811, -1.748, -1.691, -1.639, -1.593, -1.553, -1.519, -1.490, -1.467, -1.450, -1.439, -1.433, -1.433, -0.002, -0.003, -0.004, -0.005, -0.006, -0.006, -0.007, -0.007, -0.006];
actionStates[CHARIDS.MARTH_ID].TECHF.setVelocities = [0, 0, 0, 0, 0, 0, 0, 4.036, 3.526, 2.726, 2.317, 1.862, 1.656, 1.625, 1.768, 1.989, 2.094, 2.083, 1.956, 1.846, 1.814, 1.757, 1.676, 1.570, 1.440, 1.286, 1.107, 0.949, 0.834, 0.727, 0.629, 0.540, 0.459, 0.387, 0.323, 0.268, 0.222, 0.184, 0.155, 0.135];
actionStates[CHARIDS.MARTH_ID].CLIFFCATCH.posOffset = [[-71.9, -22.3], [-73.1, -22.19], [-72.21, -24], [-71.8, -24], [-71.1, -23.74], [-70.74, -23.76], [-71.3, -23.75]];
actionStates[CHARIDS.MARTH_ID].CLIFFWAIT.posOffset = [-71.3, -23.75];

// ---- ECB (environmental collision box) offsets per action-state frame, run-length encoded (see decodeEcb in ml.js) ----
setEcbData(CHARIDS.MARTH_ID, decodeEcb({
  DEADLEFT: "Z0E0a",
  DEADRIGHT: "Z0E0a",
  DEADUP: "Z0E0a",
  DEADDOWN: "Z0E0a",
  ATTACKAIRB: "348=43;B248=248>439=a358<378<45<D53=D43<Da53=D43<D43<Cb43;Bh43;A53<B43;B53;Aa54<B44:?348=a439=549=449=348=",
  ATTACKAIRD: "449=339?439>439=358<257<036<247<257<267;268=369>46:?55;@65;@55;@a54;@55;@65<A54;A55;A54;Aa55;A54;A55;A54;A54<B55;A45;A44;A45;A55;A45;A44;A45;Ac35:A45;A45:@b34:@349?349>348=b439=d338<439=348=",
  ATTACKAIRF: "34:@248>53;A55<C378<257<137<237<146;247<j248=a247<237<237;347;448;448<348=a349>348=248=",
  ATTACKAIRN: "248=349>a459>439=479=449=43:?439>a43:?449>449=348<368=238=45;B45:?329>358=368=358=b248=c238=338=238=338=338<348=a348<449=e348=c449=348=a",
  ATTACKAIRU: "337;136;136:146;359?53<C62?G54=E35:@167<166;166:156:146:246:1359b2369d649;639<64;?549=357;457:a347;449=338=329>439=539=649<64:=b539=a449=348=248=",
  ATTACKDASH: "4579356824583469347:2369347;347:3469b256937682858387;56;@55:?358<357;357:m3569d357:a357;a357:357;a448;449=54:?53;@",
  CAPTURECUT: "439=53;@53<B63<B53<Bb63<B53<B63<Bi53<C63=Ce63=Db62<B",
  CAPTUREDAMAGE: "337:a3469c3569a357:a3469b337:23693369c337:",
  CAPTUREPULLED: "449>2558",
  CAPTUREWAIT: "3369337:a3369337:3369337:327:226:a327:337:a327:337:j337;337:a327:327;327:337:337;327:337:a327:337:337;337:327:337:n327:337:b",
  CATCHATTACK: "43:?a439>a449>44:?53:?53:>a53:?d63;?439>c43:?53:?439>43:?a",
  CATCHCUT: "43:?449>a439>449=b439=b438<448<e348<448<449=e449>a43:?52:?52;@",
  CLIFFCATCH: ":4>B84=B73=Ca62=Ca63=C",
  CATCHWAIT: "43:?a42:?439>43:?b439>a43:?a439>d429>a43:?439>42:?43:?42:?43:?h53:?43:?a439>a43:?a439>j43:?439>43:?439>b43:?a42:?",
  CLIFFWAIT: "53<Cq63=C53<Ca63=Ce73=Ca63=Cc73=Cg83>C73=C83>C73=C83>Cd73=Cb63=Ca73=C",
  DAMAGEFALL: "347;448;c448<438<539=539<53:>b339>238>137=137<247<348<458<659;548;448;337;338<438<a348<247<247;a",
  DAMAGEFLYN: "33:@53;A63<Aa73<A63<A73<Ae74<Ab84=Ae84<?a84;>74;>a649<448;347:",
  DAMAGEN2: "439>44:?449>a348=348<a347;b348<b448<449>43:?a53;@a54:?449=459>44:?",
  DASH: "347;24693569o357:2469347:347;357;b448<439>",
  DOWNBOUND: "3569366836575579558:659<76:=85;>95<>;5=><6>@<7>@=7?A=6?A=6@B=5@C;4?C94=A84<@65:>559<2669357;255745793569",
  DOWNDAMAGE: "0546048<049=a049<049=d058<06680635",
  DOWNATTACK: "1534053505362546255724572557245724582469b347:b347;347:337;357;377;478;a377;b357;347;a438<367;478;469>54;A64<Bc54<B54;@448<347;338<a438<a449=55:>55:?54:?",
  DOWNSPECIALAIR: "348=349>549=429=439=439>a429>a439>429>a439>429>a439>429>439>429>439>c439=339>338=339>329>439>429>439>c53:>a439>53:>53:?53:>b439>i53:>b449>358=348=248=",
  DOWNSPECIALAIR2: "439>429>348=348<267<378<a379>46;A65>E64>F45:@459>358<367;267;a367:c368<a358<358=a459=459>358=247;a247<b248=348=",
  DOWNSMASH: "52:?42:?439>438<448<377;367:347:d347;347:25692558265826693569a3869376935693469c2458346824583468b2458246924583468a3469b3569a3469357:347;448;348<448<e338<438<448<449=448<449>439>a54:?53:?",
  DOWNSPECIALGROUND2: "439>a449=a468<478<479>56;A66=D65>E64=D55;A55:?458<357;a367;357;357:357;a458<348<458<448<458<449=a347;357;347:237;439>43:?53:?53;@",
  DOWNSPECIALGROUND: "55:?54;@44:?439>g53:>439>a53:?a53:>a53:?439>a53:?439>h43:?439>b53:>53:?a439>m43:?44:?a53:?43:?53:?53;@",
  DOWNSTANDB: "254625572558357;358=368<368=469=458<347;347:347;347:a347;347:b246:347:357:347:438<439=a338<a449=448<449=a449>43:?53:?a",
  DOWNSTANDF: "25452457438<337;23692357a24461546144613473369337:a34692346235733682358a2469d246:a347:347;357;458<448<449=449>43:?",
  DOWNSTANDN: "1534a153514462457a2458346833682358b23693369337:a347;a448<449=a449>a54:>449>44:?a54:?a53;@",
  DOWNTILT: "24572458c25582758a27692669a2558n2457245824572458h245724582457a255724571547255724571547a",
  DOWNWAIT: "1534t0524a1534k0524b15351534e15351534d15351534q",
  ESCAPEAIR: "248=349>338=43:?42:?338=439=g539=439=539=b439=e53:>439=d338=439=338=c237<a137<b147<146;157<a156;b",
  ESCAPEB: "439>439=438<348<347:357;347;337:236:337:a347:c357:357;347;357;256:35693469b347:337;b338<439=439>a42:?53:?52:?",
  ESCAPEF: "439>54:>549=448<347;337;337:347:256:356924572369337;338<438<439=b438<338<438<a338<c439=a449=a449>439>43:?b",
  FALL: "248=a348=b349>348=a349>248=",
  ESCAPEN: "438<a337;a438;a337;c337:g438;337;428;439=449=439>43:?42:?53;@",
  FALLAERIAL: "247<i",
  FALLSPECIAL: "156;a146;b156;d",
  FORWARDTILT: "52;@43:?439>439=448<337;348<468;478<66=C75?F74?Fa75?F74?Fb64>Ec64=Dc64=C55;A358<438<448<449=449>439>53:?53;@",
  FORWARDSMASH: "449>459>459=439>43:?44:?55:?55;A54<B74>E479=367;266:276:267;367;b367:a266:c377:276:b377:267;377;266:267;266:367:357:347:347;348<338<a439=449=439>a449>44:?53:?53;@",
  FURAFURA: "327;328<a327;b328<a327;328<c429=428<328<a429=428<a328<429=b328<b429=328<429=327;337;438<337;d337:a337;337:z337:a327:337:327:o327;k",
  FURASLEEPEND: "2369337:3369337:c337;k237;227;327;a337;237;236:b237;236:237;247;a146:246:a247;146:247;a347;246:247;347;c448<a438<439=a439>429>b52:?a53:?53;@",
  GUARD: "439>",
  FURASLEEPSTART: "53;@53:?52;@b53;@a53:?53;@53:?53;@52:?43:?53:?439>j439=b338<337:",
  GUARDON: "52:?42:?43:?a439>c",
  GUARDOFF: "439>a439=439>439=b449=a439=b449=449>439>43:?",
  GRAB: "53;@a43:?45:?439>a459=449=b449>a449=e459=459>449=439=429=429>a43:?a44:?54:?53;@",
  FURASLEEPLOOP: "2369236:b2369a236:2369a236:2369a336923693369e337:336923693369b2369a3369337:3369g2369b3369337:3369h236:a2369a3369e2369a236:a337:236:b337:236:2369e33692369",
  JAB1: "42:?459=449=348<469=479=56;A64=D64=C53;A44:?449=a358<a357;347;b347:b347;438<439=449>53:?",
  JAB2: "357;347;348<a469=469>44:?53;A439>b449=a448<449=448<c449=448<439=449=a439=439>a53:?",
  KNEEBEND: "2457c",
  JUMPAERIALF: "248=d338=a338<338=a338<237<137<147<146;046;146;247;448;648:b749:649;549=539=52:>52:?63;?63:>549<559<659;648:a649;549<438<338=228=227<a227;237;a247;247<247;247<a",
  JUMPAERIALB: "248=348=b349?44:@44:?459=358<257;a256:a1559146:a246:a347:a357:347:256:246:b348<348=449>53:?63;@73<A74<A74;?75:=759;769;669;668:669;568;468;358<a257<b248=257<247<257<247<257<247<147<247<257<247<a147<",
  JUMPB: "348=j338=a348=338=348=338=348=338=l348=338=h439=338=439=338=b439=a338=449=348=248=348=248=",
  JUMPF: "248>o258>a359>258>a248>258>g349>a248>248=b348=248=d348=248=a",
  LANDING: "2457e244624572446b2457e2557b255824583469347:347;348<449=a439>53:?",
  LANDINGATTACKAIRB: "478<357;347;347:34692458f2469f337;328<449=43:?a",
  LANDINGATTACKAIRD: "448<327;327:2258a2257b2246a2257c1247e2257d22583369136:449=44:?54:?53;@",
  LANDINGATTACKAIRF: "377;337;337:23582369a2358a2369c337;438<439>",
  LANDINGATTACKAIRN: "347:245824571447a245714472457c2469347:438<439>",
  LANDINGATTACKAIRU: "54;A347:a24692458f1359337:438<439>",
  CLIFFATTACKQUICK: "63=Ca73=C83>C84>Cb94>Ca:6?C85=A<5@D<3@D<4@D94>B84<@64;?84<@94>B94>C:4?D;3@E;3AF<4AF96<>76:=458<347;256924581458245823692469d23692469b3469337:b337;a338<439=439>53:?a53;@",
  CLIFFATTACKSLOW: "53<Cb63=Cc62=C82@G:2@F=2BG<2AE;2@E:2?D92>C92>B82=B92>B:3>Ba93=@64:>559=549=649<64:=649<a558;448;437:347:337:b347;448<a559<54;A63>F55;A469=448<a438<e338<a438<338<438<a348<a358<348<438<338=439=439>449>44:?54:?",
  CLIFFESCAPEQUICK: "63=C62=C73=C83>C84>Cb:4?C:3?C:4?C84=A<4AE<4CI:4@E84=B75<A65;@448<246:347;246:2469237;338<348<256:357:3469246924582457a24581459a247<338=338<237<a338=b439=a439>449>53:?",
  CLIFFESCAPESLOW: "53<Cd63=Ca62=C71>E:2@E<2BG<2AF;2@D92>C82=B72=B72<A82=A:3>Aa93=@74;?64:>64:=649<448;2469246:h347;337:347;357:458;3457235713582369225823581447144623690348034703480447a0448045:136;146;247;146:a246:c347:246:347;a348<a449=a449>a44:?43:?",
  CLIFFGETUPQUICK: "63=C73=C83>Da94?D94>C:3?C93>C:4?C83=A<4AF;3BI:4@E85=A54:>439=338=227;136:1359b136:b236:136;237;338=439=43:?a",
  CLIFFGETUPSLOW: "53<Cc63=Ca62=C82?E:2AG=2CH<2BG;2AF:2@E92?D82>D82>Ca:2?C:3>B93=@74;?64:>65:=659<549<448<448;347;256:246:f347:337:347:337:337;b236:a347:337;347;a448<449=a449>b44:?a53:?",
  CLIFFJUMPQUICK: "83>C;3@D?5BD=5@C;5>A95=A84>C;2AF;4@D74;?548;94?E94?D95>C95>Ba:5>A95=Ab95=@a85<@75<@76<@a96=@=6>?>6@A>5AD=3AD;3?B:3>A83;>639<649<74:<639<63:=62:>93<?94<>84:<:3=?93=A72<@62;?52:>438<338=",
  CLIFFJUMPSLOW: "53<C72=C82>C93>C94>C73=B62<B329?027=026;a025:02590247a0236a023503470459339>43:?44:?a449>44:?449>54:>d64:>c64:=c65:=659<558:a4479538:b428;639<83:<a:3<>93=@73;>63:>339>",
  MISSFOOT: "248=a056;0459b1359247;347;347:3469347:358<459>a359>b449=439=448<4468347:237;338<337;",
  NEUTRALSPECIALAIR: "248=358<247<338=247<237<137<238>34;B33;Ba239?239@e239?b339?239?c339?33:@d239?239@a33:@239?33:@239@b329>44:@54;Aa53<C65=D286:2658064705470548054705480648e06590648e0548146:339>237<a238=248=",
  PASS: "347:c447:548:a649<63:=a539=347:246:447:246:146;136;238=137=238=a248=348=247<a348<248=247<248=a",
  REBOUND: "54:?348=348<a449=449>439>439=",
  NEUTRALSPECIALGROUND: "53:?a54:?c53:?439>54;A63=D63<B53:?a53;@b53:?a53;@a53:?a43:?a53:?d53;@b53:?b53;@b53:?a53;@53:?65<A54<B53<B64>E66=C377:37692658b36692658a16582658c16582658c16582658a2669347:347;449>43:?53:?",
  RUN: "35693469245834682458255835683569457:357:3569c2458b34693569357:b457:",
  RUNBRAKE: "3569357:d3569357:d347:3469c2469246:a347:a347;448<449=44:?",
  RUNTURN: "3569357:347:448;337;337:347:b3369236934692469357:d347:357:a347:b34693468a3469b",
  SIDESPECIALAIR: "349>43:?43:@53;A53:?64>E369>368<347;247;347;348=349>349?349>248>349>248>349>248=348=248=348=c449=348=248=",
  SIDESPECIALAIR2FORWARD: "247<348=44:@458<449=549<449=55:>63<B54:>449=458<468;478;478<c468<458<358<348<438<338<338=43:?43:@439>338=238=248=a338=a348=a449=458<358=348=",
  SIDESPECIALAIR2UP: "247<b267;a257;a247;237;338<439>459>46:?65>E83AI82AI72?G53<B53;A53;@439>f339>439>b339>439>339>338=348=549=449=348=348<",
  SIDESPECIALAIR3DOWN: "42:@52;A42:@339?a329>a339>a329>429>42:?53;@53:?439>449>459>449>44:?449>44:?45:?a359>45:?359?45:?349>43:?439>53:>a539=439>a339>439>a449>439>b449>449=348=a",
  SIDESPECIALAIR3FORWARD: "42:@42:?439=338=238=228>329?339>237<a257<267<277<46:@44;A44:?a359>358=a469>459>369>d358=368=358=469>b459>458<448<438<338<b348<348=a348<348=248=",
  SIDESPECIALAIR3UP: "42:@43:@53;@438<338<a237<339>43:?b53;@63=C64=D358<257<137<136;046;146;157<156;257<a257;257<d247<a348<338<238=a338=d238=c248=",
  SIDESPECIALAIR4FORWARD: "167<267<459=64<A64<B63=C73>D83?F64<B73<A72<A72=B73=C73>E72=B62<A53;@54;@a55;@65<A74=B84@G67<A479=368=247<337;237;236:337;448;337;347;448;347;b448;a347;337;a237<338<348<358<348=b",
  SIDESPECIALAIR4DOWN: "267<257<338=53:?a54:>53:>549=559=458<448;437:3769276:357:a256:266:377;267<26692569165926692769a165926691659a1759266:256:146:156:166:277;276:a266:256:246:347:347;b247;146;137<136;a146;b147<247<b248=348=",
  SIDESPECIALAIR4UP: "167<157<137<157<147<237<a238=439=549=54:>63;@73>E83@G64<B55:?55;@54;A64<A73?G83@H84?F66<A56:>53:>439=339>33:@a339?239?b339?d339>43:?53;@44:?348=247;247<b358=348=248=",
  SIDESPECIALGROUND: "53;@a52;@a53;@74>E57:>468<357;b347;448<449=a44:?b54:?a54;@b55:?459>54:?a53:?53;@",
  SIDESPECIALGROUND2FORWARD: "448<449=54;@358<458<449=a459>63=C449=a357;367:377;a478;377;b367;357;358<338<a439=43:?53;@439>439=449=b449>b43:?a53:?52;@a",
  SIDESPECIALGROUND2UP: "448<459=458<367;a357;a347;a438<449>469>46:?66>E84AI73@H73?G63<B53;A53;@439>j449>439>53:?43:?a53:?53;@52:?a",
  SIDESPECIALGROUND3DOWN: "439>439=338=429=439>429>a439>53:?52:?a42:?53<B53;@a54:?55;@54:?54;@55:?54:?55:?55;@55:?55;@b54:?43:?439>439=438<a338<438<b439=439>a449>a439>42:?52:?52;@",
  SIDESPECIALGROUND3FORWARD: "439>449=a448<a43:?449>448<347:a357:377;a56:?54;@449>459>a459=469>459=a469=a469>469=f469>a469=458;357;337;448<459=449>54;@449>44:?a53:?",
  SIDESPECIALGROUND3UP: "439>439=449=438<a439=a43:?54;@53:?54:?44:@63=C64=C469>458<347;348<347;a357;b358<458<c358<348<b338<448<438<a439=449>44:?a54;@64;@54;@53;@b",
  SQUAT: "439>347:36682557a1547a",
  SIDESPECIALGROUND4DOWN: "358<458<459=54:>55:>459>a459=458<357;246:34692758a3668255836693768377:a27582658a2758b2658b2758a376836692558:5982758387:38693769275826693669a35693469a347:b347;448<439=439>43:?a53:>53:?b53;@",
  SQUATRV: "254625573569357;449=53:?b",
  SIDESPECIALGROUND4FORWARD: "458<358<459=54;A64=C54=D64=D74>D54;A63<A53;A52<B72>D63=D62<B52;@53;@54;@a65;?65;@65<B74?G56;A479=469=438<337;m338<a439=a439>43:?a53:?a",
  SIDESPECIALGROUND4UP: "358<458<448<a348<a438<439=54:>54:?64<A74>D:3AH<4DK;4AF:4?C;5@Ea;4AF<3BH=3EL;4BI86>D66;@63;@53:?a53;@43:?e53:?43:?c439>a449>53:?53;Aa53<B53;A53:?43:?53:?",
  STOPCEIL: "64:=d649<64:=549=448;",
  SQUATWAIT: "2546c2446c1446a25461546a14471446244625462557244614461546a1446a15472457154724571547b14471547e14471547a14471547245714471547245725571447e25572457a2557a2457a2557245725572457254615462457a2446b2457a2557b254625572546",
  TECHF: "63=C53;A53;@329>338=53;@63<B44;A448<347:246:236:2469136:0347134724573369438;347;3369337:235813472369234623583469337:337;337:a327:337:347:357;348<449>44:?53:?",
  TECHB: "63=C53;A43:?439>53;@53;A459>75<A64;@448<3669357:347:438;337;2358337:3269337;347;3569255725582458a34693369d337:347:347;448<449=a449>439>52:?",
  TECHN: "63=C53<B53;A53;@53:?439>a439=a53:?63<B72>D64=C;5=?;3?B93?D:4?C448<3369a337:a448<449=44:?53:?",
  TECHU: "237;539<639<a629<a639<63:=63:>73<@72<Aa42;Bb42;A53;A53<B53<C63=Ca53;A43:?338=238=348=",
  THROWBACK: "429>43:?439>439=439>a449=439>b43:?439>g43:?a53:?53;@c53;A53;@e63<AF3DA52;Ab52;@a52:?52;@a53;@",
  THROWNFOXBACK: "439=529=328=53:>54:?64;@@2AA548:",
  THROWFORWARD: "43:?b53:?f449>449=348<338<337;337:>4=;338<438<b43:?b54:?52;@53;@c52;@",
  THROWNFOXDOWN: "52:>539<438;448<549=64:>:4>A;5?B;5>A:5>A95=@85<@D1B@64;?:5>A73:=577995<?a:5=?d448;75:<467:659;74:=467:4579548:",
  THROWNFOXFORWARD: "347;247;c227;236:a347:458<",
  THROWNFOXUP: "438<429=428<438<52:>127=0359",
  THROWNMARTHBACK: "32:A238>248>a54:?84=B",
  THROWNMARTHDOWN: "229@a128?128>128?138?037>138>339?54;@83<?94;=85<@",
  THROWNMARTHFORWARD: "33:A43;B129A139@037>037=037>a138?339?549=54:>:4=@",
  THROWNMARTHUP: "33:A32:Aa43;A42;A32:Ac339?147=",
  THROWNPUFFBACK: "52:?52:>428<438<539<338<539<439=52:>53:>329>329?33:@248=257<358<458;85;>82>D83>D;4?C;5?B:5>A:5=@",
  THROWNPUFFFORWARD: "C1A?52:>62;@f",
  THROWNPUFFUP: "52:?429=338<44:?459>449>52;@",
  THROWNPUFFDOWN: "549<548:759;a85:;95:;:5<=95;=a95;<a95;=:5<>c:6<>d96;=96;<a96;=a96<>95<>:5=?:4=?94<?:5=?95<?96;=96:;86:;96;<:6<>a:6=?:5=?a:5<>:6<>b96;=96;<96;=a96<>95<>e95;=95;<95;=a",
  THROWUP: "43:?449>449=a348<338<a438<b449>63=Cj62=Ce62<B53;A53:?53;@54;A54:?44:?a43:?b53:?52:?a52;@a",
  TILTTURN: "53:?429>c439>43:?44:?b43:?",
  UPSMASH: "439>a439=d449=449>a54;A73?F83AJ83AI73@H83AIb83AJ83AI83AJb83AI83AJ83AIc83AJ83AId63=D53;@e43:?53:>439>c53:?a43:?52:?53;@52;@",
  UPSPECIAL: "247<357:247;136;157<067=45=F64?G64?H64@I73AJ62@I52>F52=D52<C62=C62=D52<C53<Cc63<B53:?52;@53:?b54:?64;?b74;?54:>64:=348=257<156;a",
  UPTILT: "52:?439>c459>65=D83AIa74?F55<B459=449=o439=b449>b439>43:?53:?53;@53:?",
  WALK: "53:?a54:?a53:?a54:?64;@a54;@54:?a44:?449>44:?43:?53:?d",
  WALLTECH: "338<337;237;337;338<a328<d338<b438<448<348<348=a449=b549=449=b",
  WAIT: "53;@e53:?53;@d53:?53;@53:?g52:?52;@52:?b53;@52:?d52;@52:?e52;@c52:?a52;@d53;@52;@c53;@53:?53;@a53:?g53;@53:?k53;@c53:?53;@c",
  WALLJUMP: "237<a248=348=a349>c359>459>e54:>d559=457:3569237;228=329>73;>649<a74;?63;?339>146:045:246:337;a338<348=",
  WALLDAMAGE: "347:348=137<248=359>359?248>258=258>248>248=248>349>44:@54;@54;A44;A64<A64<Bc74=B74<A84=A85<@85<?75:=769;76:<86:<76:=75;>54:>43:@33:@32:A63<A84=A84<@75;?74:=64:=64:>74;>54:?348<337;347;a448;",
  ENTRANCE: "53;@e53:?53;@d53:?53;@53:?g52:?52;@52:?b53;@52:?d52;@52:?e52;@c52:?a52;@d53;@52;@c53;@53:?53;@a53:?g53;@53:?k53;@c53:?53;@c",
  SLEEP: "0000",
  REBIRTH: "53;@e53:?53;@d53:?53;@53:?g52:?52;@52:?b53;@52:?d52;@52:?e52;@c52:?a52;@d53;@52;@c53;@53:?53;@a53:?g53;@53:?k53;@c53:?53;@c",
  REBIRTHWAIT: "53;@e53:?53;@d53:?53;@53:?g52:?52;@52:?b53;@52:?d52;@52:?e52;@c52:?a52;@d53;@52;@c53;@53:?53;@a53:?g53;@53:?k53;@c53:?53;@c",
  LANDINGFALLSPECIAL: "2457e244624572446b2457e2557b255824583469347:347;348<449=a439>53:?",
  SHIELDBREAKFALL: "347;448;c448<438<539=539<53:>b339>238>137=137<247<348<458<659;548;448;337;338<438<a348<247<247;a",
  SHIELDBREAKDOWNBOUND: "3569366836575579558:659<76:=85;>95<>;5=><6>@<7>@=7?A=6?A=6@B=5@C;4?C94=A84<@65:>559<2669357;255745793569",
  SHIELDBREAKSTAND: "1534a153514462457a2458346833682358b23693369337:a347;a448<449=a449>a54:>449>44:?a54:?a53;@",
  WALLTECHJUMP: "237<a248=348=a349>c359>459>e54:>d559=457:3569237;228=329>73;>649<a74;?63;?339>146:045:246:337;a338<348=",
  SMASHTURN: "53:?429>c439>43:?44:?b43:?",
  OTTOTTO: "44:?a54:?a53:?43:?52:?63<A",
  OTTOTTOWAIT: "62<B52<Ba63=Ca63<Bb62<B52<B52;A62<Ba62<A62<Ba63<A53;A54;@e55:?a56:>46:?56:?55:>b55:?54:?55:?a56:?57:?b56:?57:>56:?57:>479>a56:>469=b458<357;458;357:e357;a448;458<448<449=a439=a449=439=c439>a53:?53;A53<Ba",
  THROWDOWN: "42:?43:?a54:?a449>c439>a449>449=a448<e448;a448<347;357;a347;357;a347;a448;348<448<439=a429=52:>52:?42:?53:?53;@",
  THROWNFALCOBACK: "439=429=a439>54:?64;@84=A548:",
  THROWNFALCOFORWARD: "348<247;c237;a236:347;458<",
  THROWNFALCODOWN: "52:>539<448<a549<64:>:4>A<5?B;5?B:5>Aa85<@85<?64;@:5>A73:=5779:5=?95<?:5=?c:5=@347:75:<467:659;74:=467:457:5479",
  THROWNFALCOUP: "439=529=428<438;52:>0236",
  APPEAL: "53;@54;@a54:?45:?54:?53:?52:?53:?53;@54;A74>E63>E73>E73?F63>E63=C53;A53;@53:?53;@d63<B53;A53;@c54;@a53;@53:?54;@b55;@54;@64=C73?G72?G72?F62=Db62>E62=Dh72>Ea62=D72>E62>E62=D72>Ea52<Ba52;@a53;@j53:?53;@b53:?b53;@e",
  THROWNFALCONBACK: "138>147=146;247<127<237<146;247;147<127<136;337:136:035:136:1359236:a337:",
  THROWNFALCONDOWN: "036<137=439>338=227;237;147<348<74:=85:<85<@52<B43;A85>C84=B74=B84>C84=Ba",
  THROWNFALCONFORWARD: "036<137=138>138?a229?b027=036<2469a356934692469b",
  THROWNFALCONUP: "228>228=a228>027>a037=137=339>036<137<036;a036<",
}));
ecb[0].REBIRTH = ecb[0].WAIT;
ecb[0].REBIRTHWAIT = ecb[0].WAIT;
ecb[0].SLEEP = [[0, 0, 0, 0]];
ecb[0].THROWNFALCONDIVE = ecb[0].DAMAGEFLYN;
