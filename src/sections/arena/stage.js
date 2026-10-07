/**
 * stage.js (The arena's geometry): a Battlefield-style layout in meleelight's units and format (one
 * solid main platform with a ledge on each side, three pass-through platforms, blast zones), drawn in
 * our own style by render.js, plus the target layout.
 *
 * Geometry ported from meleelight's stages/vs-stages/battlefield.js (MIT, (c) 2016 Will Blackett):
 * the main platform is 136.8 units wide with its top at y = 0, platforms at y = 27.2 and 54.4.
 *
 * Engine format (engine/collision.js, engine/physics.js): `ground` / `platform` are [left, right]
 * surfaces walked on (platforms can be dropped through), `wallL` / `wallR` / `ceiling` are the solid
 * underside, `ledge` = [surface kind, index, end (0 left, 1 right)], `blastzone` a Box2D.
 */
import { Vec2D, Box2D } from './engine/util.js';

const V = (x, y) => new Vec2D(x, y);

/** The underside of the main platform, clockwise from the left ledge (also drawn by render.js). */
const UNDERSIDE = [
  [-68.4, 0], [68.4, 0], [65, -6], [36, -19], [39, -21], [33, -25], [30, -29], [29, -35],
  [10, -40], [10, -30], [-10, -30], [-10, -40], [-29, -35], [-30, -29], [-33, -25], [-39, -21],
  [-36, -19], [-65, -6],
];

/** Builds a fresh engine stage (surfaces are plain data; each Game gets its own copy). */
export function engineStage() {
  return {
    name: 'arena',
    box: [],
    polygon: [UNDERSIDE.map(([x, y]) => V(x, y))],
    platform: [[V(-57.6, 27.2), V(-20, 27.2)], [V(20, 27.2), V(57.6, 27.2)], [V(-18.8, 54.4), V(18.8, 54.4)]],
    ground: [[V(-68.4, 0), V(68.4, 0)]],
    ceiling: [[V(-65, -6), V(-36, -19)], [V(-29, -35), V(-10, -40)], [V(-10, -30), V(10, -30)], [V(65, -6), V(36, -19)], [V(29, -35), V(10, -40)]],
    wallL: [[V(-68.4, 0), V(-65, -6)], [V(-36, -19), V(-39, -21)], [V(-39, -21), V(-33, -25)], [V(-33, -25), V(-30, -29)], [V(-30, -29), V(-29, -35)], [V(10, -30), V(10, -40)]],
    wallR: [[V(68.4, 0), V(65, -6)], [V(36, -19), V(39, -21)], [V(39, -21), V(33, -25)], [V(33, -25), V(30, -29)], [V(30, -29), V(29, -35)], [V(-10, -30), V(-10, -40)]],
    startingPoint: [V(-20, 0), V(30, 0)],
    startingFace: [1, -1],
    respawnPoints: [V(0, 60), V(30, 60)],
    respawnFace: [1, -1],
    blastzone: new Box2D([-224, -108.8], [224, 200]),
    ledge: [['ground', 0, 0], ['ground', 0, 1]],
    ledgePos: [V(-68.4, 0), V(68.4, 0)],
    scale: 4.5,
    offset: [600, 480],
    movingPlats: [],
    movingPlatforms() {},
  };
}

/** Render / camera description of the same stage. */
export const STAGE = {
  main: { x1: -68.4, x2: 68.4, y: 0 },
  underside: UNDERSIDE,
  platforms: [
    { x1: -57.6, x2: -20, y: 27.2 },
    { x1: 20, x2: 57.6, y: 27.2 },
    { x1: -18.8, x2: 18.8, y: 54.4 },
  ],
  ledges: [{ x: -68.4, y: 0, dir: 1 }, { x: 68.4, y: 0, dir: -1 }],
  blast: { left: -224, right: 224, top: 200, bottom: -108.8 },
  /** The camera always keeps this box in view (plus the fighter). */
  view: { left: -124, right: 124, top: 108, bottom: -46 },
};

/**
 * Target positions. Each one rewards a different skill: grounded jab, platform play, a high target
 * that needs a full hop + double jump, two below the ledges (drop from the ledge and attack), and two
 * far off-stage that need a recovery.
 */
export const TARGETS = [
  { x: 0, y: 7 },
  { x: 58, y: 7 },
  { x: -39, y: 40 },
  { x: 39, y: 40 },
  { x: 0, y: 70 },
  { x: 0, y: 100 },
  { x: -82, y: -16 },
  { x: 82, y: -16 },
  { x: -112, y: 32 },
  { x: 112, y: 32 },
];
/** Target radius (meleelight's target test uses 7 units). */
export const TARGET_R = 7;
