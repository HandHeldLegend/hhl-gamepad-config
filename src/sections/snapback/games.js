/**
 * games.js: Games' stick thresholds, for the Analyzer's reference lines. No DOM.
 *
 * Each line is where a stick past it counts in that game: kind 'deadzone' (below it the game reads
 * neutral) or 'action' (a rebound past it becomes an input the other way: a dash, a hard press). `v` is
 * a fraction of the stick's full travel as HOJA reports it (±2048); `label` names it (analyzer.js
 * LINE_NAMES); `shape` 'axis' means the game tests x
 * and y separately, 'radial' the distance from centre. The lines assume the stick's full travel reaches
 * the game's full range; HOJA's own deadzone and output scaling shift them a little.
 *
 * `hz` is how often the game reads the stick (its frame rate; Rocket League's physics tick), for the
 * Analyzer's frame lines.
 *
 * Sources (Oct 2026):
 *   Melee: deadzone 0.2875 and dash/smash 0.8 of Melee's range (80 units), tested per axis
 *     (smashboards.com/ucf, ssbwiki.com/Turn, sites.google.com/view/kadanosnapback). In GameCube mode HOJA
 *     sends full travel as 110 units (core_gamecube.c), so 23 and 64 units are 23/110 and 64/110 of it.
 *   Smash Ultimate: datamined fighter common params, per axis in Ultimate's units, where 80 GameCube units
 *     are 1.0 (github.com/fudgepop01/amiibo_research research/paramDecoding/common/param/common.xml, a 2019
 *     dump whose smash windows still match ssbwiki.com/Control_stick; GameCube units from HayBox's
 *     Ultimate mode, github.com/JonnyHaystack/HayBox). walk_stick_x 0.18 (turn_stick_x 0.20): a rebound
 *     past it walks or turns around; turn_run_stick_x 0.60: a run turnaround or brake; dash_stick_x 0.85
 *     within 2 frames: dash, and side smash with A. As for Melee, in GameCube mode that's x 80/110 of
 *     HOJA's full travel.
 *   Rivals of Aether II: hard press (tap: dash, platform drop, tap jump) at 0.80 by default, per coordinate
 *     (dragdown.wiki/wiki/RoA2/Controls).
 *   Rocket League: 0.30 controller deadzone by default (commonly cited); physics and input at 120 Hz.
 *   The Smash games and Rivals II run at 60 frames a second.
 */
const GC_UNIT = 1 / 110; // one GameCube unit, as a fraction of HOJA's full travel in GameCube mode
const ULTIMATE = 80 * GC_UNIT; // Ultimate's 1.0 (80 GameCube units)

export const GAMES = [
  { id: 'none' },
  {
    id: 'melee', name: 'Smash Bros. Melee', hz: 60,
    lines: [
      { v: 23 * GC_UNIT, kind: 'deadzone', shape: 'axis', label: 'deadzone' },
      { v: 64 * GC_UNIT, kind: 'action', shape: 'axis', label: 'dash' },
    ],
  },
  {
    id: 'ultimate', name: 'Smash Bros. Ultimate', hz: 60,
    lines: [
      { v: 0.18 * ULTIMATE, kind: 'deadzone', shape: 'axis', label: 'walk' },
      { v: 0.6 * ULTIMATE, kind: 'action', shape: 'axis', label: 'runturn' },
      { v: 0.85 * ULTIMATE, kind: 'action', shape: 'axis', label: 'dash' },
    ],
  },
  {
    id: 'rivals2', name: 'Rivals of Aether II', hz: 60,
    lines: [{ v: 0.8, kind: 'action', shape: 'axis', label: 'hard' }],
  },
  {
    id: 'rocketleague', name: 'Rocket League', hz: 120,
    lines: [{ v: 0.3, kind: 'deadzone', shape: 'radial', label: 'deadzone' }],
  },
];

/**
 * How the game would read a let-go's rebound: for each line, how long the output stays past it on the far
 * side (opposite the edge it was let go from), in samples. Per-axis lines count either axis past the line
 * on the far side; radial ones the distance.
 * @param {{x: ArrayLike<number>, y: ArrayLike<number>}} out  what the game sees
 * @param {{x: number, y: number}} edge  where the stick was let go from
 * @returns {{line: object, samples: number}[]}
 */
export function reboundPast(out, edge, lines) {
  const n = Math.hypot(edge.x, edge.y) || 1;
  const ux = edge.x / n; const uy = edge.y / n;
  return lines.map((line) => {
    const lim = line.v * 2048;
    let samples = 0;
    for (let i = 0; i < out.x.length; i++) {
      const x = out.x[i]; const y = out.y[i];
      if (x * ux + y * uy >= 0) continue; // still on the side it was let go from
      const past = line.shape === 'axis'
        ? (Math.abs(x) > lim && Math.sign(x) === -Math.sign(edge.x)) || (Math.abs(y) > lim && Math.sign(y) === -Math.sign(edge.y))
        : Math.hypot(x, y) > lim;
      if (past) samples++;
    }
    return { line, samples };
  });
}
