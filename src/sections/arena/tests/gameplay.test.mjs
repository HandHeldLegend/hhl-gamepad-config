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
// Feedback chips are off by default in the app; the tests assert on them, so switch them on.
(await import('../store.js')).store.set('techFeedback', true);
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
  // Strict (no input buffer): the chip comes on the press frame.
  const { game, feed } = newGame({ inputBuffer: 0 });
  frames(game, 30);
  // Jump, aerial right away, land with the aerial's landing lag (no L-cancel), press jump during the lag.
  frames(game, 1, (s) => { s.btn.jump = true; });
  frames(game, 4, (s) => { s.btn.jump = true; });
  frames(game, 1, (s) => { s.btn.attack = true; });
  let landed = -1;
  for (let i = 0; i < 120 && landed < 0; i++) { frames(game, 1); if (game.fighter.state === 'landing') landed = i; }
  check(landed >= 0, 'fighter lands with landing lag');
  frames(game, 1, (s) => { s.btn.jump = true; });
  check(feed.some((x) => /^Jump ignored · landing lag \(\d+f left\)$/.test(x)), 'buffer 0: jump during landing lag → "Jump ignored · landing lag (Nf left)" chip');

  // Default buffer (3): a press too early for the buffer still gets the chip once the buffer gives up on it.
  const d = newGame();
  check(d.game.inputBuffer === 3, 'input buffer is on by default (3 frames)');
  frames(d.game, 30);
  frames(d.game, 5, (s) => { s.btn.jump = true; });
  frames(d.game, 1, (s) => { s.btn.attack = true; });
  for (let i = 0; i < 120 && d.game.fighter.state !== 'landing'; i++) frames(d.game, 1);
  frames(d.game, 1, (s) => { s.btn.jump = true; });
  frames(d.game, 4);
  check(d.feed.some((x) => /^Jump ignored · landing lag/.test(x)), 'buffer 3: a press 10+ frames early still explains itself after the buffer expires');

  // No jumps left.
  const n = newGame();
  frames(n.game, 30);
  frames(n.game, 6, (s) => { s.btn.jump = true; });
  frames(n.game, 10);
  frames(n.game, 1, (s) => { s.btn.jump = true; }); // double jump
  frames(n.game, 10);
  frames(n.game, 1, (s) => { s.btn.jump = true; }); // nothing left
  frames(n.game, 4);
  check(n.feed.includes('No jumps left'), '"No jumps left" when out of double jumps');
}

console.log('IASA & actionability');
{
  const { movesetFor } = await import('../movesets.js');
  const dsm = movesetFor('vix').dsmash;
  check(dsm.iasa === 46 && dsm.total === 50, `Vix down smash: IASA frame 46 of 50 (meleeframedata), got ${dsm.iasa}/${dsm.total}`);
  // Jump pressed on move frame `at` of a C-stick down smash (buffer 0 = strict).
  const jumpAt = (at, buffer = 0) => {
    const { game } = newGame({ fighter: 'vix', inputBuffer: buffer });
    frames(game, 20);
    frames(game, 1, (s) => { s.cy = -1; });
    const F = game.fighter;
    while (F.state === 'attack' && F.moveFrame + 1 < at) frames(game, 1);
    frames(game, 1, (s) => { s.btn.jump = true; });
    const now = F.state;
    frames(game, 3);
    return { now, later: F.state };
  };
  check(jumpAt(dsm.iasa).now === 'jumpsquat', `jump on the IASA frame (${dsm.iasa}) interrupts the down smash`);
  check(jumpAt(dsm.iasa - 1).now === 'attack' && jumpAt(dsm.iasa - 1).later === 'attack', `jump one frame before IASA (${dsm.iasa - 1}) is ignored without the buffer`);
  check(jumpAt(dsm.iasa - 1, 3).later !== 'attack', '… and with the buffer it comes out on the IASA frame');
  // Aerial IASA: Vix's neutral air (IASA 42) can be cut by a double jump.
  {
    const { game } = newGame({ fighter: 'vix', inputBuffer: 0 });
    const F = game.fighter;
    frames(game, 20);
    F.ground = null; F.y = 80; F.enterAir(false); F.beginMove(F.moves.nair, 'nair'); F.moveFrame = F.moves.nair.iasa - 2;
    frames(game, 1, (s) => { s.btn.jump = true; });
    const before = F.jumps;
    frames(game, 1, (s) => { s.btn.jump = true; });
    frames(game, 1);
    check(before === 1 && F.jumps === 1, 'aerial: jump before IASA is ignored');
    const g2 = newGame({ fighter: 'vix', inputBuffer: 0 });
    const G = g2.game.fighter;
    frames(g2.game, 20);
    G.ground = null; G.y = 80; G.enterAir(false); G.beginMove(G.moves.nair, 'nair'); G.moveFrame = G.moves.nair.iasa - 1;
    frames(g2.game, 1, (s) => { s.btn.jump = true; });
    check(G.jumps === 0 && !G.move, 'aerial: jump on the IASA frame double-jumps and ends the aerial');
  }

  // Jump out of shield, during shield startup and during shield release.
  {
    const { game } = newGame({ inputBuffer: 0 });
    frames(game, 20);
    frames(game, 2, (s) => { s.r = 1; });
    check(game.fighter.state === 'shield', 'shield is up');
    frames(game, 1, (s) => { s.r = 1; s.btn.jump = true; });
    check(game.fighter.state === 'jumpsquat', 'jump out of shield (3rd shield frame)');
    const r = newGame({ inputBuffer: 0 });
    frames(r.game, 20);
    frames(r.game, 12, (s) => { s.r = 1; });
    frames(r.game, 3);
    check(r.game.fighter.state === 'shieldRelease', 'releasing the trigger → shield drop lag');
    frames(r.game, 1, (s) => { s.btn.jump = true; });
    check(r.game.fighter.state === 'jumpsquat', 'jump during shield drop lag still works (Melee GuardOff)');
    const q = newGame({ inputBuffer: 0 });
    frames(q.game, 20);
    frames(q.game, 12, (s) => { s.r = 1; });
    let n = 0;
    while (q.game.fighter.state !== 'idle' && n < 40) { frames(q.game, 1); n++; }
    check(n === 16, `shield drop lag: 15 frames, actionable on the 16th after letting go (${n})`);
  }

  // Buffered jump out of landing lag.
  const landJump = (buffer) => {
    const { game } = newGame({ inputBuffer: buffer });
    const F = game.fighter;
    frames(game, 20);
    frames(game, 1, (s) => { s.btn.jump = true; });
    for (let i = 0; i < 120 && F.state !== 'landing'; i++) frames(game, 1);
    const lag = F.landLag;
    while (F.state === 'landing' && F.sf < lag - 2) frames(game, 1);
    frames(game, 1, (s) => { s.btn.jump = true; }); // 2 frames before the first actionable frame
    const s1 = F.state;
    frames(game, 1);
    const s2 = F.state;
    frames(game, 1);                                 // first actionable frame
    return { s1, s2, s3: F.state };
  };
  const lb = landJump(3);
  check(lb.s1 === 'landing' && lb.s2 === 'landing' && lb.s3 === 'jumpsquat', `buffer 3: jump pressed 2f before landing lag ends → jumpsquat on the first actionable frame (${lb.s1} → ${lb.s2} → ${lb.s3})`);
  const l0 = landJump(0);
  check(l0.s3 === 'idle', `buffer 0: the same press is dropped (${l0.s3})`);
  {
    const b = newGame();
    frames(b.game, 30);
    frames(b.game, 1, (s) => { s.btn.jump = true; });
    for (let i = 0; i < 120 && b.game.fighter.state !== 'landing'; i++) frames(b.game, 1);
    while (b.game.fighter.state === 'landing' && b.game.fighter.landLag - b.game.fighter.sf > 1) frames(b.game, 1);
    frames(b.game, 1, (s) => { s.btn.jump = true; });
    frames(b.game, 6);
    check(b.feed.some((x) => /^Buffered jump · pressed \d+f early$/.test(x)) && !b.feed.some((x) => /^Jump ignored/.test(x)), 'buffered jump shows "Buffered jump · pressed Nf early" and no "ignored" chip');
  }

  // L-cancel is never buffered.
  const lcancel = (pressBefore, buffer) => {
    const { game, feed } = newGame({ inputBuffer: buffer });
    const F = game.fighter;
    frames(game, 20);
    F.ground = null; F.y = 30; F.vy = 0; F.enterAir(false); F.fastfall = true;
    frames(game, 1, (s) => { s.btn.attack = true; }); // neutral air
    // Fast-falling at a constant speed: landing frame is predictable.
    const landIn = Math.ceil(F.y / F.P.FAST_FALL);
    for (let i = 1; i < landIn + 1; i++) frames(game, 1, (s) => { if (landIn - i + 1 === pressBefore) s.r = 1; });
    frames(game, 6);
    return { feed };
  };
  for (const buffer of [0, 3]) {
    const ok = lcancel(3, buffer); const late = lcancel(10, buffer);
    check(ok.feed.some((x) => /^L-cancel ✓/.test(x)) && late.feed.some((x) => /^L-cancel missed/.test(x)) && !ok.feed.some((x) => /^Wave/.test(x)) && !late.feed.some((x) => /^Wave/.test(x)),
      `buffer ${buffer}: L-cancel window unchanged (pressed shortly before ✓, 10f before missed) and the press never turns into an airdodge`);
  }
}

console.log('Smash attacks (lenient window)');
{
  // Stick flicked right on frame 0, A pressed `aAt` frames later (negative = before the flick).
  const smash = (aAt, buffer = 3) => {
    const { game } = newGame({ inputBuffer: buffer });
    const F = game.fighter;
    frames(game, 20);
    game.dummy.x = 200;
    const x0 = F.x;
    let xAtSmash = null;
    for (let i = Math.min(0, aAt); i <= Math.max(aAt, 0) + 1; i++) {
      frames(game, 1, (s) => { s.lx = i >= 0 ? 1 : 0; s.btn.attack = i === aAt; });
      if (F.moveName === 'fsmash' && F.state === 'attack' && xAtSmash == null) xAtSmash = F.x;
    }
    return { name: F.state === 'attack' ? F.moveName : F.state, dx: xAtSmash == null ? null : xAtSmash - x0 };
  };
  for (let k = 1; k <= 5; k++) {
    const r = smash(k);
    check(r.name === 'fsmash' && r.dx === 0, `A ${k}f after the flick → forward smash, zero displacement before it starts (buffer 3; dx ${r.dx})`);
  }
  check(smash(5, 0).name === 'dash', 'A 5f after the flick with buffer 0 → dash attack (the strict 3f window)');
  check(smash(3, 0).name === 'fsmash', 'A 3f after the flick with buffer 0 → forward smash');
  check(smash(-2).name === 'fsmash', 'A 2f BEFORE the flick → forward smash (buffer 3)');
  check(smash(-2, 0).name === 'jab', 'A 2f before the flick with buffer 0 → jab');
  check(smash(0).name === 'fsmash', 'flick + A on the same frame → forward smash');
  {
    const { game } = newGame();
    frames(game, 20);
    const x0 = game.fighter.x;
    frames(game, 8, (s) => { s.lx = 1; });
    check(game.fighter.state === 'dash' && game.fighter.x - x0 > 5, 'flick without A → a normal dash, moving from its first frame');
    frames(game, 1, (s) => { s.lx = -1; });
    check(game.fighter.state === 'dash' && game.fighter.dashDir === -1 && game.fighter.stats.dashback.ok === 1, 'dash back during the initial dash still works');
  }
  {
    const { game } = newGame();
    frames(game, 20);
    game.dummy.x = 200;
    frames(game, 1, (s) => { s.lx = 1; });
    frames(game, 3, (s) => { s.lx = 1; });
    frames(game, 40, (s) => { s.lx = 1; s.btn.attack = true; });
    check(game.fighter.chargeFrames > 20, `late A held → the smash charges (${game.fighter.chargeFrames}f)`);
  }
}

console.log('Stage edges & ledge');
{
  const at = (x, id = 'vix') => { const g = newGame({ fighter: id }); frames(g.game, 20); g.game.fighter.x = x; g.game.fighter.prevX = x; return g; };
  {
    const { game } = at(56);
    let grabbed = false; let air = false;
    for (let i = 0; i < 40; i++) { frames(game, 1, (s) => { s.lx = 1; }); if (game.fighter.state === 'ledge') grabbed = true; if (game.fighter.state === 'air' && game.fighter.x > 68) air = true; }
    check(air && !grabbed, 'dash off the edge facing outward → airborne past the edge, no ledge grab');
  }
  {
    const { game } = at(20);
    const F = game.fighter;
    let i = 0;
    while (F.x < 54 && i++ < 100) frames(game, 1, (s) => { s.lx = 1; });
    const ran = F.state;
    frames(game, 1, (s) => { s.lx = -1; });  // turn around at the edge: slide off backwards
    let grabbed = false;
    for (let j = 0; j < 60 && !grabbed; j++) { frames(game, 1); grabbed = F.state === 'ledge'; }
    check(ran === 'run' && grabbed && F.ledge?.x === 68, `run, turn back at the edge, slide off facing the stage → ledge grab (${ran})`);
  }
  {
    const { game } = at(60, 'dot');
    const F = game.fighter;
    frames(game, 30, (s) => { s.lx = 0.45; });
    check(!F.ground, 'walking with the stick held past the edge walks off');
    const b = at(66.5, 'dot');
    b.game.fighter.vx = 0.8; // let go of the stick while walking toward the edge: slides at walking speed
    frames(b.game, 30);
    check(!!b.game.fighter.ground && b.game.fighter.x === 68, `walk to the edge and let go → stops (teeters) right at the edge (x ${b.game.fighter.x.toFixed(1)})`);
    const w = at(60, 'dot');
    w.game.fighter.vx = 3; w.game.fighter.state = 'landing'; w.game.fighter.landLag = 10; // a wavedash slide
    frames(w.game, 10);
    check(!w.game.fighter.ground, 'sliding faster than a walk (wavedash) carries the fighter off the edge');
  }
  {
    const { game, feed } = at(20, 'dot');
    const F = game.fighter;
    F.ground = null; F.x = 62; F.y = -4; F.facing = -1; F.enterAir(false); F.vy = -1;
    for (let i = 0; i < 10 && F.state !== 'ledge'; i++) frames(game, 1);
    check(F.state === 'ledge', 'falling into the ledge box facing it grabs the ledge');
    frames(game, 10);
    frames(game, 1, (s) => { s.lx = 1; });                    // let go (away from the stage)
    frames(game, 2);
    frames(game, 1, (s) => { s.btn.jump = true; });            // double jump
    for (let i = 0; i < 40 && F.y < 4; i++) frames(game, 1, (s) => { s.lx = -1; });
    frames(game, 1, (s) => { const m = meleeStick(-0.9, -0.4); s.lx = m.x; s.ly = m.y; s.r = 1; }); // airdodge down-in
    frames(game, 20);
    check(feed.some((x) => /^Ledgedash/.test(x)), 'ledge drop → double jump → airdodge onto the stage = ledgedash');
    const h = at(20, 'dot');
    const G = h.game.fighter;
    G.ground = null; G.x = 62; G.y = -4; G.facing = -1; G.enterAir(false); G.vy = -1;
    for (let i = 0; i < 6; i++) frames(h.game, 1, (s) => { s.ly = -1; });
    check(G.state !== 'ledge', 'holding down falls past the ledge without grabbing it');
  }
}

console.log('Wavedash');
{
  // Jump, then shield on frame `adAt` relative to lift-off (0 = the first airborne frame).
  const wd = (id, adAt, stick = [0.95, -0.3], buffer = 3) => {
    const { game, feed } = newGame({ fighter: id, inputBuffer: buffer });
    const F = game.fighter;
    frames(game, 30);
    game.dummy.x = 200;
    const x0 = F.x;
    const jsq = F.P.JUMPSQUAT;
    const m = meleeStick(stick[0], stick[1]);
    for (let i = 0; i <= jsq; i++) {
      frames(game, 1, (s) => {
        s.btn.jump = i === 0;
        if (i >= jsq + adAt) { s.lx = m.x; s.ly = m.y; }
        if (i === jsq + adAt) s.r = 1;
      });
    }
    const lag = F.state === 'landing' ? F.landLag : null;
    frames(game, 90);
    return { dist: F.x - x0, feed, lag };
  };
  const perfect = wd('dot', 0);
  check(perfect.feed.some((x) => /^Wavedash · .* · frame-perfect/.test(x)) && perfect.lag === 10, `airdodge on the first airborne frame → frame-perfect wavedash, 10f landing lag (${perfect.lag})`);
  const buffered = wd('dot', -2);
  check(buffered.feed.some((x) => /^Wavedash · .* · frame-perfect/.test(x)) && !buffered.feed.some((x) => /too early/.test(x)), 'buffer 3: shield 2f before lift-off → wavedash on the first airborne frame');
  const strict = wd('dot', -2, undefined, 0);
  check(!strict.feed.some((x) => /^Wavedash/.test(x)) && strict.feed.some((x) => /^Airdodge 2f too early/.test(x)), 'buffer 0: the same press is "2f too early" and no wavedash');
  const shallow = wd('dot', 0, [0.95, -0.3]); const steep = wd('dot', 0, [0.6, -0.8]);
  check(shallow.dist > steep.dist * 1.2, `shallower angle slides further (${shallow.dist.toFixed(1)} vs ${steep.dist.toFixed(1)})`);
  const half = wd('dot', 0, [0.4, -0.4]); const full = wd('dot', 0, [1, -1]);
  check(Math.abs(half.dist - full.dist) < 1e-9, `airdodge speed depends on the stick angle, not its magnitude (${half.dist.toFixed(2)} = ${full.dist.toFixed(2)})`);
  const ranks = ['rime', 'dot', 'rosette'].map((id) => [id, wd(id, 0).dist]);
  check(ranks[0][1] > ranks[1][1] && ranks[1][1] > ranks[2][1], `wavedash length follows traction: ${ranks.map(([id, d]) => `${id} ${d.toFixed(1)}`).join(' > ')}`);
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
    check(/^Full hop/.test(hop(id, jsq)), `${id}: held through all ${jsq} jumpsquat frames → full hop`);
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
