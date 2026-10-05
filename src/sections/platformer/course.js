/**
 * course.js: The test course and its collision queries (pure data + math; no DOM, runs in Node).
 *
 * Every solid is either
 *   a box   {kind: 'box',  min: [x, y, z], max: [x, y, z]}                  flat top at max[1]
 *   a ramp  {kind: 'ramp', min, max, rise: '+x'|'-x'|'+z'|'-z', low}        top rises linearly from
 *           `low` (on the side opposite `rise`) to max[1] (on the `rise` side); flat bottom at min[1]
 * The top surface is the floor, the sides are walls, the bottom is a ceiling. That is enough for flat
 * ground, blocks, pillars, walls and slopes, and keeps every query a few lines of arithmetic:
 *
 *   findFloor(x, z, maxY)        highest top under the point (x, z) that is no higher than maxY
 *   findCeil(x, z, minY)         lowest bottom over the point that is at or above minY
 *   resolveWalls(x, z, feetY, …) push a vertical cylinder out of every solid it overlaps sideways;
 *                                a solid only counts as a wall where its top is above the step-up height
 *
 * Coordinates: y up; the hero faces +z at yaw 0 (direction = (sin yaw, cos yaw)). Units: see constants.js.
 * `color` names a theme token the renderer resolves (red, yellow, blue, green, accent, ground).
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The default test course. */
export const COURSE = {
  spawn: { x: 0, y: 0, z: -1700, yaw: 0 },
  solids: [
    { id: 'ground', kind: 'box', min: [-2400, -400, -2400], max: [2400, 0, 2400], color: 'ground' },
    // A staircase of blocks: single jump, then double, then triple (or wall kicks) to the tower.
    { id: 'step1', kind: 'box', min: [-1100, 0, -1200], max: [-700, 150, -800], color: 'yellow' },
    { id: 'step2', kind: 'box', min: [-1500, 0, -700], max: [-1100, 300, -300], color: 'yellow' },
    { id: 'step3', kind: 'box', min: [-1500, 0, -100], max: [-1100, 520, 300], color: 'yellow' },
    { id: 'tower', kind: 'box', min: [-1000, 0, 500], max: [-500, 820, 1000], color: 'accent' },
    // A floating slab you can walk under (and bump your head on) or jump onto.
    { id: 'slab', kind: 'box', min: [-300, 380, -900], max: [300, 460, -500], color: 'blue' },
    // A low curb (step onto it without jumping) and a mid-height block for ledge grabs.
    { id: 'curb', kind: 'box', min: [-300, 0, -200], max: [300, 24, 0], color: 'green' },
    { id: 'ledge', kind: 'box', min: [-200, 0, 150], max: [300, 260, 450], color: 'accent' },
    // A gentle 20° ramp up to a plateau, and a steep 45° slope off its far side (too steep to stand on).
    { id: 'ramp', kind: 'ramp', min: [400, 0, -1500], max: [900, 290, -700], rise: '+z', low: 0, color: 'red' },
    { id: 'plateau', kind: 'box', min: [400, 0, -700], max: [900, 290, -200], color: 'red' },
    { id: 'steep', kind: 'ramp', min: [900, 0, -700], max: [1190, 290, -200], rise: '-x', low: 0, color: 'yellow' },
    // Two tall walls facing each other for wall kicks, closed by a high block you can land on.
    { id: 'wallW', kind: 'box', min: [1500, 0, 300], max: [1650, 1000, 1500], color: 'blue' },
    { id: 'wallE', kind: 'box', min: [2000, 0, 300], max: [2150, 1000, 1500], color: 'blue' },
    { id: 'summit', kind: 'box', min: [1500, 0, 1500], max: [2150, 1000, 1900], color: 'accent' },
    // Pillars of rising height to hop across.
    { id: 'pillar1', kind: 'box', min: [-150, 0, 1400], max: [50, 250, 1600], color: 'green' },
    { id: 'pillar2', kind: 'box', min: [250, 0, 1600], max: [450, 380, 1800], color: 'green' },
    { id: 'pillar3', kind: 'box', min: [650, 0, 1800], max: [850, 510, 2000], color: 'green' },
  ],
};

export class Course {
  /** @param {{solids: object[], spawn?: {x,y,z,yaw}}} def */
  constructor(def = COURSE) {
    this.spawn = { x: 0, y: 0, z: 0, yaw: 0, ...(def.spawn || {}) };
    this.solids = def.solids.map((s) => prepare(s));
  }

  /** Height of a solid's top at (x, z) (clamped to its footprint). */
  top(s, x, z) {
    if (s.kind !== 'ramp') return s.max[1];
    const { axis, dir } = s;
    const lo = axis === 'x' ? s.min[0] : s.min[2];
    const hi = axis === 'x' ? s.max[0] : s.max[2];
    let f = ((axis === 'x' ? x : z) - lo) / (hi - lo);
    f = clamp(f, 0, 1);
    if (dir < 0) f = 1 - f;
    return s.low + (s.max[1] - s.low) * f;
  }

  /** Highest floor under (x, z) at or below maxY → {y, normal: {x,y,z}, solid} or null. */
  findFloor(x, z, maxY) {
    let best = null;
    for (const s of this.solids) {
      if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2]) continue;
      const y = this.top(s, x, z);
      if (y > maxY) continue;
      if (!best || y > best.y) best = { y, normal: s.normal, solid: s };
    }
    return best;
  }

  /** Lowest ceiling (solid bottom) over (x, z) at or above minY, or Infinity. */
  findCeil(x, z, minY) {
    let best = Infinity;
    for (const s of this.solids) {
      if (x <= s.min[0] || x >= s.max[0] || z <= s.min[2] || z >= s.max[2]) continue;
      if (s.min[1] >= minY && s.min[1] < best) best = s.min[1];
    }
    return best;
  }

  /**
   * Push a vertical cylinder (radius r, spanning feetY+low … feetY+high) out of the solids it overlaps.
   * @returns {{x:number, z:number, wall: null | {x:number, z:number, upper:boolean, solid:object}}}
   *   wall: the outward normal of the last wall touched; `upper` when that solid also reaches above
   *   feetY + high (a full-height wall rather than a ledge you could climb onto).
   */
  resolveWalls(x, z, feetY, low, high, r) {
    let wall = null;
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.solids) {
        if (s.min[1] >= feetY + high) continue; // entirely above the body
        const cx = clamp(x, s.min[0], s.max[0]);
        const cz = clamp(z, s.min[2], s.max[2]);
        const dx = x - cx; const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const top = this.top(s, cx, cz);
        if (top <= feetY + low) continue; // low enough to step onto (or it's the floor you're on)
        let nx; let nz;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d;
          x = cx + nx * r; z = cz + nz * r;
        } else {
          // Center inside the footprint: leave by the nearest side.
          const pen = [[x - s.min[0], -1, 0], [s.max[0] - x, 1, 0], [z - s.min[2], 0, -1], [s.max[2] - z, 0, 1]];
          pen.sort((a, b) => a[0] - b[0]);
          [, nx, nz] = pen[0];
          if (nx) x = (nx < 0 ? s.min[0] : s.max[0]) + nx * r;
          else z = (nz < 0 ? s.min[2] : s.max[2]) + nz * r;
        }
        const upper = top > feetY + high;
        // Prefer reporting a full-height wall over a low one.
        if (!wall || upper || !wall.upper) wall = { x: nx, z: nz, upper, solid: s };
      }
    }
    return { x, z, wall };
  }
}

function prepare(s) {
  const out = { ...s, min: [...s.min], max: [...s.max] };
  if (s.kind === 'ramp') {
    out.axis = s.rise[1];
    out.dir = s.rise[0] === '-' ? -1 : 1;
    const len = out.axis === 'x' ? s.max[0] - s.min[0] : s.max[2] - s.min[2];
    const slope = (s.max[1] - s.low) / len; // rise per unit along the rise direction
    const n = { x: 0, y: 1, z: 0 };
    if (out.axis === 'x') n.x = -slope * out.dir; else n.z = -slope * out.dir;
    const k = Math.hypot(n.x, n.y, n.z);
    out.normal = { x: n.x / k, y: n.y / k, z: n.z / k };
  } else {
    out.normal = { x: 0, y: 1, z: 0 };
  }
  return out;
}
