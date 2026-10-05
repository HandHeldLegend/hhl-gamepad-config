#!/usr/bin/env node
/**
 * Arena gameplay tests (Node, no dependencies):  node src/sections/arena/tests/gameplay.test.mjs
 *
 * Drives the real Game / Fighter / PadState with scripted controller samples, the same way play.js
 * does (display-rate polling, fixed 60 Hz simulation, PressLatch in between).
 */
// Minimal browser stubs for modules that touch them at import time.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, setAttribute() {}, removeAttribute() {}, style: {} }, addEventListener() {} };
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};

const { Game } = await import('../game.js');
const { PressLatch } = await import('../input.js');
const { STEP_MS, FIGHTERS, fighterPhysics, TRIGGER } = await import('../constants.js');
const { meleeStick, meleeStickUnits, meleeTrigger } = await import('../melee.js');

let failures = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };

const blank = () => ({ lx: 0, ly: 0, cx: 0, cy: 0, l: 0, r: 0,
  btn: { attack: false, special: false, jump: false, z: false, shield: false, start: false, select: false, step: false }, edges: {} });

function newGame(o = {}) {
  const feed = [];
  const game = new Game({ onFeedback: (e) => feed.push(e.text), ...o });
  return { game, feed };
}

/** Run frames at 60 Hz with a per-frame input function. */
function frames(game, n, f = () => {}) {
  for (let i = 0; i < n; i++) { const s = blank(); f(s, i); game.step(s); }
}

/**
 * Simulate play.js at `hz` display rate for `ms`: one sample per display frame (sampleAt(t) → snapshot),
 * fixed 60 Hz sim steps from an accumulator. `latched`: use the PressLatch (the fix) or not (old code).
 */
function renderLoop(game, { hz, ms, sampleAt, latched = true }) {
  const latch = new PressLatch();
  let acc = 0;
  for (let t = 0; t <= ms; t += 1000 / hz) {
    const snap = sampleAt(t);
    if (latched) latch.sample({ ...snap.btn, trig: snap.btn.shield });
    acc += 1000 / hz;
    while (acc >= STEP_MS) {
      const presses = latched ? latch.take() : null;
      game.step(presses ? { ...snap, presses } : snap);
      acc -= STEP_MS;
    }
  }
}

console.log('Input latching');
{
  // At 144 Hz a display frame is ~6.9 ms and a sim frame 16.7 ms: some display frames run no sim step.
  // Put a one-display-frame tap on such a frame and check the jump still happens.
  const hz = 144;
  const dt = 1000 / hz;
  // Find a display frame whose sample is not followed by a sim step before the next sample.
  let acc = 0; let tapFrame = -1;
  for (let i = 0; i < 400; i++) {
    acc += dt;
    let steps = 0; while (acc >= STEP_MS) { acc -= STEP_MS; steps++; }
    if (i > 100 && steps === 0) { tapFrame = i; break; }
  }
  const tapT = tapFrame * dt;
  const sampleAt = (t) => { const s = blank(); if (Math.abs(t - tapT) < dt / 2) s.btn.jump = true; return s; };

  const old = newGame();
  renderLoop(old.game, { hz, ms: 2500, sampleAt, latched: false });
  check(!old.feed.some((x) => /hop/.test(x)), 'without the latch a 1-display-frame tap at 144 Hz is lost (the reported bug)');

  const fixed = newGame();
  renderLoop(fixed.game, { hz, ms: 2500, sampleAt });
  check(fixed.feed.some((x) => /^Short hop ✓/.test(x)), 'with the latch the same tap gives a short hop');

  // Release + re-press between two sim frames still counts as a new press.
  const latch = new PressLatch();
  latch.sample({ jump: true }); latch.sample({ jump: false }); latch.sample({ jump: true });
  check(latch.take()?.jump === 2, 'latch counts every press edge between sim frames');
  check(latch.take() === null, 'latch is empty after take()');
}

console.log('Ignored jump explanations');
{
  const { game, feed } = newGame();
  frames(game, 30);
  // Jump, aerial right away, land with the aerial's landing lag (no L-cancel), press jump during the lag.
  frames(game, 1, (s) => { s.btn.jump = true; });
  frames(game, 4, (s) => { s.btn.jump = true; });
  frames(game, 1, (s) => { s.btn.attack = true; });
  let landed = -1;
  for (let i = 0; i < 120 && landed < 0; i++) { frames(game, 1); if (game.fighter.state === 'landing') landed = i; }
  check(landed >= 0, 'fighter lands with landing lag');
  frames(game, 1, (s) => { s.btn.jump = true; });
  check(feed.some((x) => /^Jump ignored · landing lag \(\d+f left\)$/.test(x)), 'jump during landing lag → "Jump ignored · landing lag (Nf left)" chip');

  // Buffer on: the same press jumps as soon as the lag ends.
  const b = newGame({ jumpBuffer: true });
  frames(b.game, 30);
  frames(b.game, 5, (s) => { s.btn.jump = true; });
  frames(b.game, 1, (s) => { s.btn.attack = true; });
  for (let i = 0; i < 120 && b.game.fighter.state !== 'landing'; i++) frames(b.game, 1);
  while (b.game.fighter.state === 'landing' && b.game.fighter.landLag - b.game.fighter.sf > 2) frames(b.game, 1);
  frames(b.game, 1, (s) => { s.btn.jump = true; });
  frames(b.game, 6);
  check(b.feed.some((x) => /^Buffered jump · pressed \d+f early$/.test(x)), 'with the jump buffer on, a press in the last frames of landing lag is used');
  check(!b.feed.some((x) => /^Jump ignored/.test(x)), '… and no "ignored" chip is shown for it');

  // No jumps left.
  const n = newGame();
  frames(n.game, 30);
  frames(n.game, 6, (s) => { s.btn.jump = true; });
  frames(n.game, 10);
  frames(n.game, 1, (s) => { s.btn.jump = true; }); // double jump
  frames(n.game, 10);
  frames(n.game, 1, (s) => { s.btn.jump = true; }); // nothing left
  check(n.feed.includes('No jumps left'), '"No jumps left" when out of double jumps');
}

console.log('Melee input processing');
{
  check(meleeStickUnits(22, 0).x === 0 && meleeStickUnits(0, -22).y === 0, 'deadzone: 22 units → 0 (each axis)');
  check(meleeStickUnits(23, 0).x === 0.2875 && meleeStickUnits(0, -23).y === -0.2875, 'deadzone: 23 units → ±0.2875');
  check(meleeStickUnits(60, 10).y === 0 && meleeStickUnits(60, 10).x === 0.75, 'deadzone is per axis (a cross): (60, 10) → (0.75, 0)');
  check(meleeStickUnits(110, 0).ux === 80 && meleeStickUnits(-127, 0).x === -1, 'clamp: full deflection → 80 units = 1.0');
  const d = meleeStickUnits(100, 100);
  check(Math.hypot(d.ux, d.uy) <= 80 && d.ux === d.uy, 'clamp is radial (diagonal keeps its angle, ≤ 80 units)');
  check(meleeStick(0.2, 0).x === 0 && meleeStick(0.21, 0).x === 0.2875, 'controller value → GameCube byte (±110) → units: 0.2 → 22 u → 0, 0.21 → 23 u');
  check(Number.isInteger(meleeStick(0.37, -0.52).x * 80), 'values are whole units (0.0125 steps)');
  // Triggers: 0..255 → 0..140; below 43 doesn't shield.
  check(meleeTrigger(42 / 255).value === 0, 'trigger: 42/140 → no shield');
  check(Math.abs(meleeTrigger(43 / 255).value - 43 / 140) < 1e-9 && meleeTrigger(43 / 255).value >= TRIGGER.SHIELD_MIN, 'trigger: 43/140 → lightest shield');
  check(meleeTrigger(0.9).value === 1 && meleeTrigger(0, true).value === 1, 'trigger: ≥ 140 or a digital press → full (1.0)');

  // Dash timing on processed values: tilt zone for 1 frame still dashes; 2 frames is a walk.
  const run = (rawXs) => {
    const { game } = newGame();
    frames(game, 20);
    for (const rx of rawXs) frames(game, 1, (s) => { s.lx = meleeStick(rx, 0).x; });
    return game.fighter.state;
  };
  check(run([1]) === 'dash', 'dash: neutral → full in one frame');
  check(run([0.45, 1]) === 'dash', 'dash: one frame in the tilt zone (0.625) still dashes');
  check(run([0.45, 0.45, 1]) === 'walk', 'walk: two frames in the tilt zone → no dash');
}

console.log('Fighter profiles');
{
  const hop = (id, held) => {
    const { game, feed } = newGame({ fighter: id });
    frames(game, 30);
    frames(game, held, (s) => { s.btn.jump = true; });
    frames(game, 20);
    return feed.find((x) => /hop/.test(x)) || '';
  };
  for (const id of ['vix', 'dot', 'quill']) {
    const jsq = FIGHTERS.find((f) => f.id === id).jsq;
    check(/^Short hop/.test(hop(id, jsq - 1)), `${id}: jump held ${jsq - 1}f (jumpsquat ${jsq}) → short hop`);
    const full = hop(id, jsq + 1);
    check(/^Full hop/.test(full) && full.includes(`release within ${jsq}f`), `${id}: held ${jsq + 1}f → full hop, chip shows the ${jsq}f window`);
  }
  const ffSpeed = (id) => {
    const { game } = newGame({ fighter: id });
    frames(game, 30);
    frames(game, 8, (s) => { s.btn.jump = true; });
    for (let i = 0; i < 120 && game.fighter.vy > 0; i++) frames(game, 1);
    frames(game, 1); frames(game, 1, (s) => { s.ly = -1; });
    return -game.fighter.vy;
  };
  const vix = ffSpeed('vix'); const dot = ffSpeed('dot');
  check(Math.abs(vix - fighterPhysics(FIGHTERS.find((f) => f.id === 'vix')).FAST_FALL) < 1e-9, `vix fast-falls at its own speed (${vix.toFixed(2)})`);
  check(vix > dot, `vix fast-falls faster than dot (${vix.toFixed(2)} > ${dot.toFixed(2)})`);

  const wavedash = (id) => {
    const { game, feed } = newGame({ fighter: id });
    frames(game, 30);
    const x0 = game.fighter.x;
    frames(game, 1, (s) => { s.btn.jump = true; });
    for (let i = 0; i < 12 && game.fighter.state === 'jumpsquat'; i++) frames(game, 1, (s) => { s.btn.jump = true; });
    frames(game, 1, (s) => { const m = meleeStick(0.6, -0.4); s.lx = m.x; s.ly = m.y; s.r = 1; });
    frames(game, 90);
    return { dist: game.fighter.x - x0, ok: feed.some((x) => /^Wavedash/.test(x)) };
  };
  const rime = wavedash('rime'); const rosette = wavedash('rosette');
  check(rime.ok && rosette.ok, 'both fighters wavedash');
  check(rime.dist > rosette.dist, `low traction slides further: rime ${rime.dist.toFixed(1)} > rosette ${rosette.dist.toFixed(1)}`);
}

console.log('Sir Retro');
{
  const aerialLanding = (id) => {
    const { game, feed } = newGame({ fighter: id });
    frames(game, 30);
    frames(game, 1, (s) => { s.btn.jump = true; });       // short hop
    frames(game, 6);
    frames(game, 1, (s) => { s.btn.attack = true; });     // neutral air
    for (let i = 0; i < 120 && !game.fighter.ground; i++) {
      const pressNow = game.fighter.vy < 0 && game.fighter.y < 6; // shortly before touching down
      frames(game, 1, (s) => { s.btn.z = pressNow && !s._done; });
    }
    return { lag: game.fighter.landLag, feed };
  };
  const dot = aerialLanding('dot'); const retro = aerialLanding('sir-retro');
  check(dot.feed.some((x) => /^L-cancel ✓/.test(x)), 'dot: neutral air L-cancels');
  check(retro.feed.some((x) => /can’t be L-cancelled/.test(x)) && !retro.feed.some((x) => /^L-cancel/.test(x)), 'sir-retro: neutral air can’t be L-cancelled (chip explains it)');
  check(retro.lag > dot.lag, `sir-retro keeps the full landing lag (${retro.lag}f vs ${dot.lag}f)`);
  const P = (id) => fighterPhysics(FIGHTERS.find((f) => f.id === id));
  check(P('sir-retro').AIR_SPEED > P('dot').AIR_SPEED, 'sir-retro drifts faster in the air than dot');
}

console.log('Movesets & training dummy');
{
  const { movesetFor, knockback, hitstun, chargeMult } = await import('../movesets.js');
  const reach = (m) => Math.max(...m.hitboxes.map((h) => h.x + h.r));
  const maxDmg = (m) => Math.max(...m.hitboxes.map((h) => h.dmg));
  const sigs = FIGHTERS.map((f) => { const m = movesetFor(f.id).fsmash; return `${maxDmg(m)}/${reach(m)}/${m.from}`; });
  check(new Set(sigs).size === FIGHTERS.length, `every fighter's forward smash differs in damage/reach/startup (${sigs.join(', ')})`);
  check(reach(movesetFor('sable').fsmash) > reach(movesetFor('mochi').fsmash) + 8, 'Sable\'s sword reaches much further than Mochi\'s forward smash');
  check(Math.abs(chargeMult(60) - 1.3671) < 1e-9 && chargeMult(999) === chargeMult(60), 'full smash charge (60f) = ×1.3671 damage, capped');
  check(knockback(100, 15, 100, 30, 70) > knockback(20, 15, 100, 30, 70), 'knockback grows with percent');
  check(knockback(80, 15, 60, 30, 70) > knockback(80, 15, 104, 30, 70), 'lighter fighters take more knockback');
  check(hitstun(92.6) === 37, 'hitstun = floor(KB × 0.4)');

  /** Free-play game with the dummy `dist` units in front of the fighter (facing right). */
  const setup = (id, dist) => {
    const { game, feed } = newGame({ fighter: id });
    frames(game, 20);
    game.dummy.x = game.fighter.x + dist; game.dummy.prevX = game.dummy.x;
    return { game, feed, d: game.dummy };
  };
  const fsmash = (id, dist, hold) => {
    const s = setup(id, dist);
    frames(s.game, 1, (x) => { x.lx = 1; x.btn.attack = true; });          // flick + A on the same frame
    frames(s.game, 120, (x, i) => { x.btn.attack = i < hold; });
    return s;
  };
  const tap = fsmash('dot', 16, 0); const held = fsmash('dot', 16, 80);
  check(tap.game.fighter.state !== 'attack' && tap.d.percent > 0, `flick + A → forward smash hits the dummy (${tap.d.percent.toFixed(1)}%)`);
  check(held.d.percent > tap.d.percent * 1.3, `charged smash > uncharged (${held.d.percent.toFixed(1)}% vs ${tap.d.percent.toFixed(1)}%)`);
  check(held.feed.some((x) => /^Forward smash · [\d.]+% · KB \d+ · sweetspot · charged 60f$/.test(x)), 'last-hit chip: "Forward smash · 24.3% · KB n · sweetspot · charged 60f"');

  const kbAt = (pct) => { const s = setup('dot', 16); s.d.percent = pct; frames(s.game, 1, (x) => { x.lx = 1; x.btn.attack = true; }); frames(s.game, 30); return s.d; };
  const low = kbAt(0); const high = kbAt(120);
  check(high.stun > low.stun && Math.abs(high.kx) > Math.abs(low.kx), `knockback & hitstun grow with % (${low.stun}f → ${high.stun}f hitstun)`);

  const tip = fsmash('sable', 27, 0); const sour = fsmash('sable', 12, 0);
  check(tip.d.percent === 20 && sour.d.percent === 15, `Sable tipper 20% vs sourspot 15% (${tip.d.percent} / ${sour.d.percent})`);
  check(tip.feed.some((x) => / · tipper$/.test(x)) && tip.d.stun > sour.d.stun, 'tipper launches harder and is labelled');

  const shine = setup('vix', 8);
  frames(shine.game, 1, (x) => { x.ly = -1; x.btn.special = true; });
  check(shine.d.percent === 5, `Vix shine hits on frame 1 (${shine.d.percent}% after one frame)`);
  frames(shine.game, 3, (x) => { x.btn.special = true; });
  frames(shine.game, 1, (x) => { x.btn.special = true; x.btn.jump = true; });
  check(shine.game.fighter.state === 'jumpsquat', 'shine is jump-cancelable from frame 4');

  const rest = setup('mochi', 4);
  frames(rest.game, 1, (x) => { x.ly = -1; x.btn.special = true; });
  frames(rest.game, 2);
  check(rest.d.percent === 20 && rest.d.stun > 40, `Rest: tiny sweetspot, huge knockback (hitstun ${rest.d.stun}f at 20%)`);

  const ko = setup('rally', 15); ko.d.percent = 250;
  frames(ko.game, 1, (x) => { x.lx = 1; x.btn.attack = true; });
  frames(ko.game, 200);
  check(ko.feed.some((x) => /^Dummy KO/.test(x)) && ko.d.percent === 0 && ko.d.state === 'stand', 'dummy is KO\'d past the blast zone and respawns at 0%');

  // L-cancel halves landing lag per move; autocancel windows give normal lag.
  let ok = true; let checked = 0;
  for (const f of FIGHTERS) {
    const set = movesetFor(f.id);
    for (const name of ['nair', 'fair', 'bair', 'uair', 'dair']) {
      const m = set[name];
      const land = (lc, frame) => {
        const { game } = newGame({ fighter: f.id });
        const F = game.fighter;
        F.ground = null; F.state = 'air'; F.beginMove(m, name); F.moveFrame = frame;
        F.lastLcancel = lc ? game.frame : -9999;
        F.land(game.fighter.game.fighter.ground || { y: 0, x1: -68, x2: 68, solid: true });
        return F.landLag;
      };
      const mid = m.autocancel[0];
      const full = land(false, mid); const lc = land(true, mid);
      const noLc = f.noLcancel?.includes(name);
      if (full !== m.landLag || lc !== (noLc ? m.landLag : Math.floor(m.landLag / 2))) { ok = false; console.log('   ', f.id, name, full, lc); }
      if (land(false, m.autocancel[1]) !== 4) { ok = false; console.log('    autocancel', f.id, name); }
      checked++;
    }
  }
  check(ok, `L-cancel halves landing lag for each of ${checked} aerials (Sir Retro's nair/bair/uair excepted); autocancel → normal lag`);

  // Targets / target test still work with the new moves and projectiles.
  const tg = newGame({ mode: 'targets' });
  check(!tg.game.dummy && tg.game.targets.length === 10, 'target test: no dummy, all targets');
  frames(tg.game, 20);
  tg.game.fighter.x = -9;
  frames(tg.game, 1, (x) => { x.btn.attack = true; });          // jab the target at (0, 7)
  frames(tg.game, 20);
  check(tg.game.targetsLeft === 9, 'jab still breaks the target in front');
  const fb = newGame({ mode: 'targets' });
  frames(fb.game, 20);
  fb.game.fighter.x = -30; fb.game.fighter.facing = 1;
  frames(fb.game, 1, (x) => { x.btn.special = true; });
  frames(fb.game, 80);
  check(fb.game.targetsLeft === 9, 'fireball (bouncing projectile) breaks a target');
}

if (failures) { console.error(`\n${failures} arena test(s) failed`); process.exit(1); }
console.log('\nArena gameplay tests passed');
