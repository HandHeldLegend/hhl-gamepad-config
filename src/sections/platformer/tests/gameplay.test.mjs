#!/usr/bin/env node
/**
 * 3D Platformer gameplay tests (Node, no dependencies):  node src/sections/platformer/tests/gameplay.test.mjs
 *
 * Drives the real Game / Hero / Course with scripted 30 Hz input frames: no rendering, no DOM.
 * Stick up with camYaw 0 moves toward +z.
 */
const { Game } = await import('../game.js');
const { stickToIntent } = await import('../hero.js');
const { COURSE, Course } = await import('../course.js');
const { POUND, WALL, SLOPE, GROUND, CHAIN, JUMPS, KILL_Y } = await import('../constants.js');

let failures = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };
const r1 = (n) => Math.round(n * 10) / 10;

const GROUND_BOX = { id: 'ground', kind: 'box', min: [-6000, -400, -6000], max: [6000, 0, 6000] };
function course(extra = [], spawn = { x: 0, y: 0, z: 0, yaw: 0 }) { return { spawn, solids: [GROUND_BOX, ...extra] }; }
const blank = (o = {}) => ({ sx: 0, sy: 0, camYaw: 0, jump: false, attack: false, crouch: false, ...o });

/** Step `n` frames; f(i, hero) returns input overrides for that frame. */
function run(game, n, f = () => ({})) {
  for (let i = 0; i < n; i++) game.step(blank(f(i, game.hero) || {}));
}
/** Step until pred(hero) or `max` frames; returns frames stepped (or -1). */
function until(game, pred, f = () => ({}), max = 400) {
  for (let i = 0; i < max; i++) {
    if (pred(game.hero)) return i;
    game.step(blank(f(i, game.hero) || {}));
  }
  return pred(game.hero) ? max : -1;
}
const FWD = { sy: 1 };
const airborne = (h) => !h.grounded;

console.log('Stick and walking');
{
  check(stickToIntent(0.1, 0).mag === 0, 'small stick deflections are inside the deadzone');
  const up = stickToIntent(0, 1, 0);
  check(Math.abs(up.yaw) < 1e-9 && up.speed === 32, 'stick up with the camera looking +z → yaw 0, target speed 32');
  const right = stickToIntent(1, 0, 0);
  check(Math.abs(right.yaw + Math.PI / 2) < 1e-9, 'stick right → camera right (−x when looking +z)');
  const g = new Game({ course: course() });
  run(g, 90, () => FWD);
  check(g.hero.action === 'walk' && Math.abs(g.hero.fwd - 32) < 1.5, `full stick runs at ≈32 (${r1(g.hero.fwd)})`);
  const g2 = new Game({ course: course() });
  run(g2, 90, () => ({ sy: 0.6 }));
  check(g2.hero.fwd > 5 && g2.hero.fwd < 12, `a partial push walks slower (${r1(g2.hero.fwd)})`);
  run(g, 60);
  check(g.hero.action === 'idle' && g.hero.fwd === 0, 'letting go decelerates to a stop');
}

/** Run to full speed, then jump (held) and return to the ground. Returns the peak height above the floor. */
function jumpAndLand(g, pressNow = true) {
  const startY = g.hero.pos.y;
  if (pressNow) g.step(blank({ ...FWD, jump: true, jumpPressed: true }));
  const action = g.hero.action;
  until(g, (h) => h.grounded, () => ({ ...FWD, jump: true }));
  return { action, peak: g.hero.peakY - startY };
}

console.log('Single → double → triple jump');
{
  const g = new Game({ course: course() });
  run(g, 60, () => FWD);
  const a = jumpAndLand(g);
  const b = jumpAndLand(g); // pressed on the first landing frame → inside the window
  const c = jumpAndLand(g);
  check(a.action === 'jump' && b.action === 'double' && c.action === 'triple', `chain: ${a.action} → ${b.action} → ${c.action}`);
  check(a.peak < b.peak && b.peak < c.peak, `heights increase: ${r1(a.peak)} < ${r1(b.peak)} < ${r1(c.peak)}`);
  // After a triple jump the chain resets.
  const d = jumpAndLand(g);
  check(d.action === 'jump', 'after a triple jump the next jump is a single jump');

  // Missing the window: wait past it, then jump → single again.
  const g2 = new Game({ course: course() });
  run(g2, 60, () => FWD);
  jumpAndLand(g2);
  run(g2, CHAIN.WINDOW + 2, () => FWD);
  const late = jumpAndLand(g2);
  check(late.action === 'jump', `jumping ${CHAIN.WINDOW + 2} frames after landing is a single jump again`);

  // Triple jump needs speed: a slow double-jump landing gives a single jump.
  const g3 = new Game({ course: course() });
  run(g3, 60, () => ({ sy: 0.5 }));
  g3.step(blank({ sy: 0.5, jump: true, jumpPressed: true }));
  until(g3, (h) => h.grounded, () => ({ sy: 0.5, jump: true }));
  g3.step(blank({ sy: 0.5, jump: true, jumpPressed: true }));
  const dbl = g3.hero.action;
  until(g3, (h) => h.grounded, () => ({ sy: 0.5, jump: true }));
  g3.step(blank({ sy: 0.5, jump: true, jumpPressed: true }));
  check(dbl === 'double' && g3.hero.action === 'jump', `slow (${r1(g3.hero.fwd)}) double-jump landing → no triple (${g3.hero.action})`);

  // Releasing jump early cuts the rise.
  const g4 = new Game({ course: course() });
  g4.step(blank({ jump: true, jumpPressed: true }));
  until(g4, (h) => h.grounded);
  const g5 = new Game({ course: course() });
  g5.step(blank({ jump: true, jumpPressed: true }));
  until(g5, (h) => h.grounded, () => ({ jump: true }));
  check(g4.hero.peakY < g5.hero.peakY * 0.7, `tapping jump hops lower than holding it (${r1(g4.hero.peakY)} vs ${r1(g5.hero.peakY)})`);
}

console.log('Long jump');
{
  const g = new Game({ course: course() });
  run(g, 60, () => FWD);
  const run0 = g.hero.fwd;
  g.step(blank({ ...FWD, crouch: true, crouchPressed: true }));
  check(g.hero.action === 'crouchSlide', 'crouch while running → crouch slide');
  g.step(blank({ ...FWD, crouch: true, jump: true, jumpPressed: true }));
  check(g.hero.action === 'longJump', 'jump during the crouch slide → long jump');
  check(g.hero.fwd > GROUND.MAX_WALK && g.hero.fwd > run0, `long jump forward speed ${r1(g.hero.fwd)} > run speed ${r1(run0)}`);
  const z0 = g.hero.pos.z;
  until(g, (h) => h.grounded, () => ({ ...FWD, jump: true }));
  const g2 = new Game({ course: course() });
  run(g2, 60, () => FWD);
  const z1 = g2.hero.pos.z;
  g2.step(blank({ ...FWD, jump: true, jumpPressed: true }));
  until(g2, (h) => h.grounded, () => ({ ...FWD, jump: true }));
  check(g.hero.pos.z - z0 > (g2.hero.pos.z - z1) * 1.3, `long jump covers more ground (${Math.round(g.hero.pos.z - z0)} vs ${Math.round(g2.hero.pos.z - z1)})`);

  // Too slow: crouch slide + jump is a plain jump.
  const s = new Game({ course: course() });
  run(s, 40, () => ({ sy: 0.4 }));
  s.step(blank({ sy: 0.4, crouch: true, crouchPressed: true }));
  s.step(blank({ sy: 0.4, crouch: true, jump: true, jumpPressed: true }));
  check(s.hero.action !== 'longJump', `long jump needs speed: at ${r1(s.hero.fwd)} it's a ${s.hero.action}`);

  // Window: jump more than 30 frames into the slide is not a long jump (slide ends long before on flat ground).
  const w = new Game({ course: course() });
  run(w, 60, () => FWD);
  w.step(blank({ ...FWD, crouch: true, crouchPressed: true }));
  run(w, 40, () => ({ ...FWD, crouch: true }));
  w.step(blank({ ...FWD, crouch: true, jump: true, jumpPressed: true }));
  check(w.hero.action !== 'longJump', `no long jump after the slide window (${w.hero.action})`);
}

console.log('Backflip and side flip');
{
  const single = new Game({ course: course() });
  single.step(blank({ jump: true, jumpPressed: true }));
  until(single, (h) => h.grounded, () => ({ jump: true }));
  const g = new Game({ course: course() });
  run(g, 3, () => ({ crouch: true }));
  check(g.hero.action === 'crouch', 'holding crouch while standing → crouch');
  g.step(blank({ crouch: true, jump: true, jumpPressed: true }));
  check(g.hero.action === 'backflip', 'crouch + jump → backflip');
  until(g, (h) => h.grounded, () => ({ jump: true }));
  check(g.hero.peakY > single.hero.peakY, `backflip peak ${r1(g.hero.peakY)} > single jump ${r1(single.hero.peakY)}`);
  check(g.hero.pos.z < -50 && g.hero.pos.z > -600, `backflip drifts backward a little (Δz ${Math.round(g.hero.pos.z)})`);

  const s = new Game({ course: course() });
  run(s, 60, () => FWD);
  s.step(blank({ sy: -1 }));
  check(s.hero.action === 'skid', 'stick pulled back at speed → skid');
  s.step(blank({ sy: -1, jump: true, jumpPressed: true }));
  check(s.hero.action === 'sideflip', 'jump during the skid → side flip');
  const zf = s.hero.pos.z;
  until(s, (h) => h.grounded, () => ({ jump: true }));
  check(s.hero.peakY > single.hero.peakY && s.hero.pos.z < zf, `side flip goes high (${r1(s.hero.peakY)}) and the new way (Δz ${Math.round(s.hero.pos.z - zf)})`);
}

console.log('Ground pound');
{
  const g = new Game({ course: course() });
  run(g, 30, () => FWD);
  g.step(blank({ ...FWD, jump: true, jumpPressed: true }));
  run(g, 6, () => ({ ...FWD, jump: true }));
  g.step(blank({ ...FWD, crouch: true, crouchPressed: true }));
  check(g.hero.action === 'groundPound', 'crouch in the air → ground pound');
  const x0 = g.hero.pos.x; const z0 = g.hero.pos.z; const y0 = g.hero.pos.y;
  let minVy = 0; let drift = 0; let hold = 0;
  const spinFrames = POUND.SPIN_FRAMES + POUND.HOLD_FRAMES;
  until(g, (h) => h.grounded, (i, h) => {
    minVy = Math.min(minVy, h.vy);
    drift = Math.max(drift, Math.hypot(h.pos.x - x0, h.pos.z - z0));
    if (i < spinFrames - 2 && h.vy === 0) hold++;
    return FWD;
  });
  check(hold >= spinFrames - 3, `spins in place first (${hold} frames without falling)`);
  check(drift < 1e-6, 'drops straight down (no horizontal movement)');
  check(minVy <= POUND.DROP_VY, `drops fast (vy reached ${minVy})`);
  check(g.hero.action === 'poundLand', 'lands into the ground-pound landing');
  const p = { ...g.hero.pos };
  run(g, POUND.STUN_FRAMES - 2, () => ({ sx: 1, jump: true, jumpPressed: true }));
  check(g.hero.action === 'poundLand' && Math.hypot(g.hero.pos.x - p.x, g.hero.pos.z - p.z) < 1e-6, 'briefly stunned: stick and jump do nothing');
  run(g, 3);
  check(g.hero.action === 'idle', `recovers after ${POUND.STUN_FRAMES} frames`);
  check(y0 > 0, 'started the pound in the air');
}

/** Wall-kick setup: a tall wall across +z at z=600; run up and jump into it. */
function wallSetup() {
  const g = new Game({ course: course([{ id: 'wall', kind: 'box', min: [-2000, 0, 600], max: [2000, 2000, 800] }], { x: 0, y: 0, z: -1500, yaw: 0 }) });
  until(g, (h) => h.pos.z > 150, () => FWD);
  g.step(blank({ ...FWD, jump: true, jumpPressed: true }));
  const n = until(g, (h) => h.action === 'wallHit' || h.grounded, () => ({ ...FWD, jump: true }));
  return { g, n };
}

console.log('Wall kick');
{
  const { g } = wallSetup();
  check(g.hero.action === 'wallHit', 'jumping head-on into a wall sticks to it');
  const yHit = g.hero.pos.y;
  g.step(blank({ jump: true, jumpPressed: true }));
  check(g.hero.action === 'wallKick', 'jump while touching the wall → wall kick');
  check(g.hero.vy > JUMPS.wallKick.vy - 5, `wall kick launches upward (vy ${g.hero.vy})`);
  const z = g.hero.pos.z;
  run(g, 5, () => ({ jump: true }));
  check(g.hero.pos.z < z - 50 && g.hero.pos.y > yHit, 'and away from the wall');

  const late = wallSetup().g;
  run(late, WALL.CONTACT_FRAMES + 2);
  check(late.hero.action === 'bonk', 'no jump → falls away from the wall');
  late.step(blank({ jump: true, jumpPressed: true }));
  check(late.hero.action === 'wallKick', 'a jump in the first frames of falling away still wall kicks');

  const tooLate = wallSetup().g;
  run(tooLate, WALL.CONTACT_FRAMES + WALL.KICK_LATE_FRAMES + 3);
  tooLate.step(blank({ jump: true, jumpPressed: true }));
  check(tooLate.hero.action !== 'wallKick', `too late: no wall kick (${tooLate.hero.action})`);

  // Glancing contact (moving along the wall) doesn't stick.
  const glance = new Game({ course: course([{ id: 'wall', kind: 'box', min: [300, 0, -4000], max: [500, 2000, 4000] }]) });
  run(glance, 40, () => ({ sx: -0.3, sy: 1 }));
  glance.step(blank({ sx: -0.3, sy: 1, jump: true, jumpPressed: true }));
  const n = until(glance, (h) => h.grounded || h.action === 'wallHit', () => ({ sx: -0.3, sy: 1, jump: true }));
  check(n >= 0 && glance.hero.action !== 'wallHit', 'brushing a wall at a shallow angle doesn’t stick');
}

console.log('Slopes');
{
  const steep = { id: 'steep', kind: 'ramp', min: [-500, 0, 0], max: [500, 1000, 1000], rise: '+z', low: 0 }; // 45°
  const gentle = { id: 'gentle', kind: 'ramp', min: [2000, 0, 0], max: [3000, 364, 1000], rise: '+z', low: 0 }; // 20°
  const g = new Game({ course: course([steep], { x: 0, y: 600, z: 600, yaw: 0 }) });
  const y0 = g.hero.pos.y;
  check(Math.abs(y0 - 600) < 1, 'spawned on the 45° slope');
  g.step(blank());
  check(g.hero.action === 'slide', 'a floor steeper than 38° makes you slide');
  run(g, 15);
  check(g.hero.pos.y < y0 - 100 && g.hero.pos.z < 600, `slides downhill (Δy ${Math.round(g.hero.pos.y - y0)})`);
  run(g, 15, () => ({ sy: 1 }));
  check(g.hero.pos.z < 600, 'can’t walk up it');
  run(g, 120);
  check(g.hero.action === 'idle', 'comes to rest on flat ground');

  const gg = new Game({ course: course([gentle], { x: 2500, y: 200, z: 549, yaw: 0 }) });
  const p = { ...gg.hero.pos };
  run(gg, 30);
  check(gg.hero.action === 'idle' && Math.abs(gg.hero.pos.z - p.z) < 1e-6, 'a 20° slope can be stood on');
  run(gg, 20, () => FWD);
  check(gg.hero.pos.y > p.y + 50 && gg.hero.action === 'walk', `and walked up (y ${Math.round(p.y)} → ${Math.round(gg.hero.pos.y)})`);
  const flat = new Game({ course: course() });
  run(flat, 20, () => FWD);
  check(gg.hero.fwd < flat.hero.fwd - 2, `speeding up uphill is slower than on the flat (${r1(gg.hero.fwd)} vs ${r1(flat.hero.fwd)})`);
  check(SLOPE.STEEP_NY > Math.cos((40 * Math.PI) / 180) && SLOPE.STEEP_NY < Math.cos((35 * Math.PI) / 180), 'steep threshold ≈ 38°');
}

console.log('Dive, belly slide and rollout');
{
  const g = new Game({ course: course() });
  run(g, 60, () => FWD);
  const f0 = g.hero.fwd;
  g.step(blank({ ...FWD, attack: true, attackPressed: true }));
  check(g.hero.action === 'dive' && g.hero.fwd > f0, `attack while running fast → dive (speed ${r1(f0)} → ${r1(g.hero.fwd)})`);
  until(g, (h) => h.grounded, () => FWD);
  check(g.hero.action === 'bellySlide', 'lands in a belly slide');
  run(g, 3, () => FWD);
  g.step(blank({ ...FWD, jump: true, jumpPressed: true }));
  check(g.hero.action === 'rollout', 'jump during the belly slide → rollout');
  const slow = new Game({ course: course() });
  run(slow, 20, () => ({ sy: 0.5 }));
  slow.step(blank({ sy: 0.5, attack: true, attackPressed: true }));
  check(slow.hero.action === 'punch', 'attack while walking slowly → punch');
}

console.log('Ledge grab and climb');
{
  const box = { id: 'box', kind: 'box', min: [-500, 0, 300], max: [500, 260, 800] };
  const g = new Game({ course: course([box], { x: 0, y: 0, z: 0, yaw: 0 }) });
  const h = g.hero;
  // Falling just in front of the box, drifting into it.
  h.set('freefall'); h.pos = { x: 0, y: 220, z: 240 }; h.fwd = 6; h.vy = 0;
  const n = until(g, (x) => x.action === 'ledgeHang' || x.grounded, () => FWD);
  check(n >= 0 && h.action === 'ledgeHang', 'falling past a ledge grabs it');
  check(Math.abs(h.pos.y - (260 - 160)) < 1e-6, 'hangs with the ledge at head height');
  g.step(blank({ jump: true, jumpPressed: true }));
  check(h.action === 'ledgeClimb', 'jump climbs up');
  until(g, (x) => x.action !== 'ledgeClimb');
  check(h.action === 'idle' && Math.abs(h.pos.y - 260) < 1e-6 && h.pos.z > 300, 'stands on top of the block');

  const d = new Game({ course: course([box]) });
  d.hero.set('freefall'); d.hero.pos = { x: 0, y: 220, z: 240 }; d.hero.fwd = 6;
  until(d, (x) => x.action === 'ledgeHang', () => FWD);
  d.step(blank({ crouch: true, crouchPressed: true }));
  until(d, (x) => x.grounded);
  check(d.hero.pos.y === 0, 'crouch lets go of the ledge');
}

console.log('Ceilings, steps, edges, respawn');
{
  const slab = { id: 'slab', kind: 'box', min: [-300, 300, 200], max: [300, 380, 600] };
  const g = new Game({ course: course([slab], { x: 0, y: 0, z: 400, yaw: 0 }) });
  g.step(blank({ jump: true, jumpPressed: true }));
  until(g, (h) => h.grounded, () => ({ jump: true }));
  check(g.hero.peakY <= 300 - 160 + 1e-6, `head bumps the ceiling (peak ${r1(g.hero.peakY)})`);

  const curb = { id: 'curb', kind: 'box', min: [-300, 0, 200], max: [300, 24, 400] };
  const s = new Game({ course: course([curb]) });
  until(s, (h) => h.pos.z > 300, () => FWD, 120);
  check(s.hero.pos.y === 24 && s.hero.action === 'walk', 'walks up onto a low curb without jumping');

  const plat = { spawn: { x: 0, y: 0, z: 0, yaw: 0 }, solids: [{ id: 'p', kind: 'box', min: [-300, -100, -300], max: [300, 0, 300] }] };
  let respawned = 0;
  const e = new Game({ course: plat, onRespawn: () => respawned++ });
  const n = until(e, (h) => h.action === 'freefall', () => FWD, 120);
  check(n > 0, 'walking off an edge falls');
  until(e, () => respawned > 0, () => FWD, 300);
  check(respawned === 1 && e.hero.pos.z === 0 && e.hero.pos.y === 0 && e.hero.action === 'idle', `falling below ${KILL_Y} respawns at the start`);
}

console.log('Default course');
{
  const c = new Course(COURSE);
  const g = new Game();
  check(g.hero.pos.y === 0 && g.hero.action === 'idle', 'spawns standing on the ground');
  const steep = c.solids.find((s) => s.id === 'steep');
  check(steep.normal.y < SLOPE.STEEP_NY, 'the course has a slope too steep to stand on');
  const ramp = c.solids.find((s) => s.id === 'ramp');
  check(ramp.normal.y > SLOPE.STEEP_NY, 'and a walkable ramp');
  // Wander for a while with changing input: nothing throws and the hero stays finite.
  let ok = true;
  for (let i = 0; i < 3000; i++) {
    const a = i * 0.037;
    g.step(blank({ sx: Math.sin(a), sy: Math.cos(a * 0.7), camYaw: a * 0.1, jump: i % 23 < 8, jumpPressed: i % 23 === 0,
      crouch: i % 41 < 3, crouchPressed: i % 41 === 0, attack: i % 57 === 0, attackPressed: i % 57 === 0 }));
    const p = g.hero.pos;
    if (![p.x, p.y, p.z, g.hero.yaw, g.hero.vy, g.hero.fwd].every(Number.isFinite)) { ok = false; break; }
  }
  check(ok, '3000 frames of random play stay finite');
}

if (failures) { console.error(`\n${failures} platformer test(s) failed`); process.exit(1); }
console.log('\nPlatformer gameplay tests passed');
