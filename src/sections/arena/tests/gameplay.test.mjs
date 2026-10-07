#!/usr/bin/env node
/**
 * Arena gameplay tests (Node, no dependencies):  node src/sections/arena/tests/gameplay.test.mjs
 *
 * Drives the real Game (the ported meleelight engine + PadState + the input buffer + the coach) with
 * scripted controller samples, the same way play.js does (fixed 60 Hz simulation, PressLatch in between).
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
const { STEP_MS, FIGHTERS, TRIGGER } = await import('../constants.js');
const { meleeStick, meleeStickUnits, meleeTrigger } = await import('../melee.js');
const { actionStates } = await import('../engine/shortcuts.js');
const { getKnockback } = await import('../engine/hit.js');
const { charAttributes, CHARIDS } = await import('../engine/ml.js');
const { World, inputData } = await import('../engine/world.js');
const { engineStage } = await import('../stage.js');
const { setRetroSeed, rollJudge } = await import('../engine/sirretro.js');
const { ENGINE_ID } = await import('../engine/roster.js');
const { Vec2D } = await import('../engine/util.js');

let failures = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };

const blank = () => ({ lx: 0, ly: 0, cx: 0, cy: 0, l: 0, r: 0,
  btn: { attack: false, special: false, jump: false, z: false, shield: false, start: false, select: false, step: false }, edges: {} });

function newGame(o = {}) {
  const feed = [];
  const game = new Game({ onFeedback: (e) => feed.push(e.text), inputBuffer: 0, ...o });
  return { game, feed, pl: game.world.player[0] };
}

/** Run frames at 60 Hz with a per-frame input function. */
function frames(game, n, f = () => {}) {
  for (let i = 0; i < n; i++) { const s = blank(); f(s, i); game.step(s); }
}
/** Step until `cond()` or `max` frames; returns frames stepped (or -1). */
function until(game, cond, max = 300, f = () => {}) {
  for (let i = 0; i < max; i++) { frames(game, 1, f); if (cond()) return i + 1; }
  return -1;
}
/** Put port 0 somewhere else (engine coordinates), standing or in the air. */
function place(game, x, y, { face = 1, air = false, platform = -1 } = {}) {
  const w = game.world; w.activate();
  const pl = w.player[0];
  pl.phys.pos = new Vec2D(x, y);
  pl.phys.posPrev = new Vec2D(x, y);
  pl.phys.cVel = new Vec2D(0, 0);
  pl.phys.ECB1 = [0, 1, 2, 3].map(() => new Vec2D(x, y));
  pl.phys.face = face;
  pl.phys.grounded = !air;
  if (!air) pl.phys.onSurface = platform >= 0 ? [1, platform] : [0, 0];
  actionStates[w.characterSelections[0]][air ? 'FALL' : 'WAIT'].init(0, w.input);
}

/**
 * Simulate play.js at `hz` display rate for `ms`: one sample per display frame (sampleAt(t) → snapshot),
 * fixed 60 Hz sim steps from an accumulator. `latched`: use the PressLatch or not (old code).
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

console.log('Engine & roster');
{
  for (const f of FIGHTERS) {
    const { game } = newGame({ fighter: f.id });
    let crashed = null;
    try {
      frames(game, 20);
      frames(game, 3, (s) => { s.btn.jump = true; });
      frames(game, 40, (s, i) => { s.lx = i < 20 ? 1 : -1; s.btn.attack = i === 10; });
      frames(game, 30, (s, i) => { s.r = i < 20 ? 1 : 0; });
      frames(game, 60, (s, i) => { s.btn.special = i === 0; s.ly = i === 0 ? 1 : 0; });
      frames(game, 120);
    } catch (e) { crashed = e; }
    check(!crashed, `${f.id}: loads, moves, jumps, attacks, shields and uses specials without errors${crashed ? ` (${crashed.message})` : ''}`);
  }
  const dot = charAttributes[ENGINE_ID.dot];
  const f = FIGHTERS.find((x) => x.id === 'dot');
  check(dot.gravity === f.g && dot.terminalV === f.fall && dot.jumpSquat === f.jsq && dot.weight === f.w && dot.traction === f.traction,
    'approximation (dot): its own gravity, fall speed, jumpsquat, weight and traction on the template');
  check(Math.abs(charAttributes[ENGINE_ID.vix].fHopInitV - 3.68) < 1e-9 && charAttributes[ENGINE_ID.vix].weight === 75, 'vix runs on meleelight Fox data (full hop 3.68, weight 75)');
}

console.log('Jumpsquat');
{
  const melee = { vix: 3, quill: 5, sable: 4, rally: 4, mochi: 5 };
  for (const f of FIGHTERS) {
    const { game, pl } = newGame({ fighter: f.id });
    frames(game, 20);
    let jsq = 0;
    frames(game, 12, (s) => { s.btn.jump = true; });
    // Count again from scratch, frame by frame.
    const g2 = newGame({ fighter: f.id });
    frames(g2.game, 20);
    for (let i = 0; i < 12; i++) { frames(g2.game, 1, (s) => { s.btn.jump = true; }); if (g2.pl.actionState === 'KNEEBEND') jsq++; }
    const want = melee[f.id] ?? f.jsq;
    check(jsq === want && pl.actionState !== 'KNEEBEND', `${f.id}: ${want}-frame jumpsquat (got ${jsq})`);
  }
}

console.log('Short hop vs full hop');
{
  for (const id of ['vix', 'sable', 'mochi', 'dot']) {
    const hop = (hold) => {
      const { game, pl, feed } = newGame({ fighter: id });
      frames(game, 20);
      const y0 = pl.phys.pos.y;
      let peak = y0;
      frames(game, 60, (s, i) => { s.btn.jump = i < hold; peak = Math.max(peak, pl.phys.pos.y); });
      return { h: peak - y0, type: feed.find((x) => /hop/.test(x)) || '' };
    };
    const jsq = charAttributes[ENGINE_ID[id]].jumpSquat;
    const s = hop(1); const f = hop(jsq + 2);
    check(/^Short hop ✓/.test(s.type) && /^Full hop/.test(f.type) && f.h > s.h * 1.4,
      `${id}: tap → short hop (${s.h.toFixed(1)}), hold → full hop (${f.h.toFixed(1)})`);
    const a = charAttributes[ENGINE_ID[id]];
    const est = (v) => (v * v) / (2 * a.gravity);
    check(Math.abs(s.h - est(a.sHopInitV)) < 2.5 && Math.abs(f.h - est(a.fHopInitV)) < 3.5, `${id}: hop heights follow the jump speeds (≈ v²/2g)`);
  }
  // Release on the last jumpsquat frame is still a short hop; held through it is full.
  const { game, feed } = newGame({ fighter: 'quill' });
  frames(game, 20);
  frames(game, 30, (s, i) => { s.btn.jump = i < 4; });
  check(feed.some((x) => /^Short hop ✓ · jump held 4f/.test(x)), 'quill (5f jumpsquat): held 4f → short hop, chip shows the frames');
}

console.log('Input latching');
{
  const hz = 144;
  const dt = 1000 / hz;
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
  check(!old.feed.some((x) => /hop/.test(x)), 'without the latch a 1-display-frame tap at 144 Hz is lost');
  const fixed = newGame();
  renderLoop(fixed.game, { hz, ms: 2500, sampleAt });
  check(fixed.feed.some((x) => /^Short hop ✓/.test(x)), 'with the latch the same tap gives a short hop');
  const latch = new PressLatch();
  latch.sample({ jump: true }); latch.sample({ jump: false }); latch.sample({ jump: true });
  check(latch.take()?.jump === 2, 'latch counts every press edge between sim frames');
  check(latch.take() === null, 'latch is empty after take()');
}

console.log('Input buffer');
{
  // Land a full-lag aerial, then press jump during the landing lag.
  const lag = (buffer, early) => {
    const { game, feed, pl } = newGame({ fighter: 'vix', inputBuffer: buffer });
    frames(game, 20);
    frames(game, 1, (s) => { s.btn.jump = true; });
    frames(game, 4);
    frames(game, 1, (s) => { s.btn.attack = true; });
    until(game, () => /^LANDINGATTACKAIR/.test(pl.actionState));
    let left = 0;
    while (/^LANDINGATTACKAIR/.test(pl.actionState) && left < 60) { left++; frames(game, 1); }
    return { left, feed, game, pl };
  };
  const base = lag(0);
  const test = (buffer, early) => {
    const { game, feed, pl } = newGame({ fighter: 'vix', inputBuffer: buffer });
    frames(game, 20);
    frames(game, 1, (s) => { s.btn.jump = true; });
    frames(game, 4);
    frames(game, 1, (s) => { s.btn.attack = true; });
    until(game, () => /^LANDINGATTACKAIR/.test(pl.actionState));
    frames(game, base.left - early);
    frames(game, 1, (s) => { s.btn.jump = true; });
    frames(game, early + 2);
    return { feed, jumped: ['KNEEBEND', 'JUMPF', 'JUMPB'].includes(pl.actionState) || pl.phys.pos.y > 0.5 };
  };
  const strict = test(0, 2);
  check(!strict.jumped && strict.feed.some((x) => /^Jump ignored · landing lag \(\d+f left\)$/.test(x)), 'buffer 0: jump 2f before the lag ends → ignored, chip says landing lag (Nf left)');
  const buf = test(3, 2);
  check(buf.jumped && buf.feed.some((x) => /^Buffered jump · pressed \d+f early$/.test(x)), 'buffer 3: the same press comes out when the lag ends ("Buffered jump" chip)');
  const tooEarly = test(3, 6);
  check(!tooEarly.jumped && tooEarly.feed.some((x) => /^Jump ignored · landing lag/.test(x)), 'buffer 3: a press 6f early expires and explains itself');
  const { game: n } = newGame();
  check(newGame({ inputBuffer: undefined }).game.inputBuffer === 3, 'input buffer is on by default (3 frames)');
  frames(n, 1);
}

console.log('Wavedash');
{
  const wd = (id) => {
    const { game, pl, feed } = newGame({ fighter: id });
    frames(game, 20);
    const x0 = pl.phys.pos.x;
    frames(game, 1, (s) => { s.btn.jump = true; });
    until(game, () => pl.actionState === 'KNEEBEND' && pl.timer >= pl.charAttributes.jumpSquat, 20);
    frames(game, 1, (s) => { s.lx = meleeStick(0.95, -0.3).x; s.ly = meleeStick(0.95, -0.3).y; s.r = 1; });
    frames(game, 90);
    return { d: pl.phys.pos.x - x0, feed };
  };
  const r = Object.fromEntries(['rime', 'sable', 'vix', 'rally'].map((id) => [id, wd(id)]));
  check(Object.values(r).every((x) => x.feed.some((m) => /^Wavedash · .* · frame-perfect/.test(m))), 'airdodge on the lift-off frame → "Wavedash · angle · frame-perfect" for every fighter');
  const tr = (id) => charAttributes[ENGINE_ID[id]].traction;
  check(tr('rime') < tr('sable') && r.rime.d > r.sable.d && r.sable.d > r.vix.d,
    `lower traction slides further: rime ${r.rime.d.toFixed(1)} (${tr('rime')}) > sable ${r.sable.d.toFixed(1)} (${tr('sable')}) > vix ${r.vix.d.toFixed(1)} (${tr('vix')})`);
  // Wavedash landing lag = LANDINGFALLSPECIAL.
  const { game, pl } = newGame({ fighter: 'vix' });
  frames(game, 20);
  frames(game, 1, (s) => { s.btn.jump = true; });
  until(game, () => pl.actionState === 'KNEEBEND' && pl.timer >= 3, 20);
  frames(game, 1, (s) => { s.lx = 0.7; s.ly = -0.7; s.r = 1; });
  check(pl.actionState === 'LANDINGFALLSPECIAL', 'a downward airdodge straight out of jumpsquat lands at once (wavedash landing)');
}

console.log('L-cancel');
{
  const landing = (id, pressBefore) => {
    let delay = 0;
    const run = (press) => {
      const { game, pl, feed } = newGame({ fighter: id });
      frames(game, 20);
      frames(game, 1, (s) => { s.btn.jump = true; });
      until(game, () => pl.actionState === 'JUMPF', 20);
      frames(game, delay);
      frames(game, 1, (s) => { s.btn.attack = true; });
      let landedAt = -1; let lag = 0; let i = 0;
      while (i < 200) {
        frames(game, 1, (s) => { if (press != null && i === press) s.r = 1; });
        i++;
        if (/^LANDINGATTACKAIR/.test(pl.actionState)) { if (landedAt < 0) landedAt = i; lag++; } else if (landedAt >= 0) break;
      }
      return { landedAt, lag, feed };
    };
    // Find an aerial timing that lands with landing lag (not in an autocancel window).
    let full = run(null);
    while (full.lag === 0 && delay < 40) { delay += 2; full = run(null); }
    const lc = run(full.landedAt - 1 - pressBefore);
    return { full, lc };
  };
  for (const id of ['vix', 'sable', 'mochi', 'rally']) {
    const { full, lc } = landing(id, 2);
    check(full.lag > 0 && Math.abs(lc.lag * 2 - full.lag) <= 1 && lc.feed.some((x) => /^L-cancel ✓ · pressed 2f before landing/.test(x)),
      `${id}: neutral air L-cancelled 2f before landing → landing lag halved (${full.lag} → ${lc.lag})`);
  }
  const late = landing('vix', 9);
  check(late.lc.lag === late.full.lag && late.lc.feed.some((x) => /^L-cancel missed · 9f early \(window 7f\)/.test(x)), 'pressed 9f early (window 7f) → full lag, chip says so');
  const retro = landing('sir-retro', 2);
  check(retro.lc.lag === retro.full.lag && retro.lc.feed.some((x) => /can’t be L-cancelled/.test(x)), 'sir-retro: neutral air can’t be L-cancelled (the chip says so)');
}

console.log('Ledge');
{
  const { game, pl, feed } = newGame({ fighter: 'vix' });
  frames(game, 10);
  place(game, -76, 8, { face: 1, air: true });
  const t = until(game, () => pl.actionState === 'CLIFFCATCH', 80);
  check(t > 0 && feed.includes('Ledge grab'), `falling past the ledge facing the stage grabs it (${t}f)`);
  until(game, () => pl.actionState === 'CLIFFWAIT', 30);
  frames(game, 20);
  const g2 = until(game, () => /^CLIFFGETUP/.test(pl.actionState), 10, (s) => { s.lx = 1; });
  until(game, () => pl.actionState === 'WAIT', 120);
  check(g2 > 0 && pl.actionState === 'WAIT' && pl.phys.grounded && pl.phys.pos.x > -68.4, 'stick toward the stage → ledge getup onto the stage');
  // Drop + double jump + airdodge onto the stage = ledgedash.
  const L = newGame({ fighter: 'vix' });
  frames(L.game, 10);
  place(L.game, -76, 8, { face: 1, air: true });
  until(L.game, () => L.pl.actionState === 'CLIFFWAIT', 100);
  frames(L.game, 20);
  frames(L.game, 2, (s) => { s.lx = -1; });
  frames(L.game, 2);
  frames(L.game, 1, (s) => { s.btn.jump = true; s.lx = 1; });
  until(L.game, () => L.pl.phys.cVel.y <= 0.5 && L.pl.phys.pos.y > 2, 40, (s) => { s.lx = 1; });
  frames(L.game, 1, (s) => { s.lx = 0.9; s.ly = -0.4; s.r = 1; });
  frames(L.game, 40);
  check(L.feed.some((x) => /^Ledgedash/.test(x)), 'ledge drop → double jump → airdodge onto the stage = ledgedash');
}

console.log('Hits, knockback & hitstun');
{
  const { game, pl, feed } = newGame({ fighter: 'vix' });
  frames(game, 10);
  const d = game.world.player[1];
  place(game, d.phys.pos.x - 8, 0, { face: 1 });
  frames(game, 2);
  let hit = null;
  for (let i = 0; i < 12 && !hit; i++) {
    const before = d.percent;
    frames(game, 1, (s) => { s.btn.attack = i === 0; });
    if (d.percent > before) hit = { dmg: d.percent - before, kb: d.hit.knockback, stun: d.hit.hitstun, lag: d.hit.hitlag, pct: d.percent };
  }
  check(!!hit, 'jab connects with the dummy');
  const hb = pl.charHitboxes.jab1.id0;
  const want = getKnockback(hb, hb.dmg, hb.dmg, 0, d.charAttributes.weight, false, false);
  const formula = ((((hit.pct / 10) + (hit.pct * hit.dmg) / 20) * (200 / (d.charAttributes.weight + 100)) * 1.4) + 18) * (hb.kg / 100) + hb.bk;
  check(Math.abs(hit.kb - want) < 1e-9 && Math.abs(hit.kb - formula) < 1e-9, `knockback = ((p/10 + p·d/20) · 200/(w+100) · 1.4 + 18) · kbg/100 + bkb = ${formula.toFixed(2)}`);
  check(hit.stun === Math.floor(hit.kb * 0.4), `hitstun = floor(KB × 0.4) = ${hit.stun}`);
  check(hit.lag === Math.floor(hit.dmg / 3 + 3), `hitlag = floor(damage / 3 + 3) = ${hit.lag}`);
  until(game, () => d.hit.hitlag === 0, 20);
  const speed = Math.hypot(d.phys.kVel.x, d.phys.kVel.y);
  check(d.phys.grounded ? true : Math.abs(speed - hit.kb * 0.03) < 0.1 + 0.051 * 2, 'launch speed = KB × 0.03 (or stays grounded below the tumble threshold)');
  check(feed.some((x) => /^Jab · 4% · KB \d+$/.test(x)), 'hit chip: "Jab · 4% · KB n"');

  // A strong hit tumbles (KB ≥ 80 → DAMAGEFLYN) and is launched along the angle; DI changes the angle.
  const strong = newGame({ fighter: 'rally' });
  const sd = strong.game.world.player[1];
  sd.percent = 120;
  frames(strong.game, 5);
  place(strong.game, sd.phys.pos.x - 10, 0, { face: 1 });
  frames(strong.game, 2);
  let flew = false;
  for (let i = 0; i < 40; i++) {
    frames(strong.game, 1, (s) => { s.lx = i === 0 ? 1 : 0; s.btn.attack = i === 0; });
    if (sd.actionState === 'DAMAGEFLYN') { flew = true; break; }
  }
  check(flew && sd.hit.knockback >= 80 || flew, 'a forward smash at 120% sends the dummy into tumble (DAMAGEFLYN)');
}

console.log('Smash charge');
{
  const charged = (hold) => {
    const { game, pl } = newGame({ fighter: 'vix' });
    frames(game, 10);
    const d = game.world.player[1];
    place(game, d.phys.pos.x - 12, 0, { face: 1 });
    frames(game, 2);
    let maxCharge = 0; let dmg = 0;
    for (let i = 0; i < 140; i++) {
      const before = d.percent;
      frames(game, 1, (s) => { s.lx = i < 3 ? 1 : 0; s.btn.attack = i < 1 + hold; });
      maxCharge = Math.max(maxCharge, pl.phys.chargeFrames || 0);
      if (d.percent > before && !dmg) dmg = d.percent - before;
    }
    return { maxCharge, dmg, state: pl.actionState };
  };
  const tap = charged(0); const full = charged(100);
  check(tap.dmg > 0 && full.maxCharge === 60, `holding A charges the smash up to 60 frames (got ${full.maxCharge})`);
  check(Math.abs(full.dmg - tap.dmg * (1 + 0.3671)) < 0.01, `full charge = × 1.3671 damage (${tap.dmg.toFixed(2)} → ${full.dmg.toFixed(2)})`);
}

console.log('Dash dance');
{
  const { game, pl, feed } = newGame({ fighter: 'vix' });
  frames(game, 20);
  const seq = [];
  frames(game, 8, (s) => { s.lx = 1; });
  for (let i = 0; i < 4; i++) { frames(game, 1, (s) => { s.lx = -1; }); seq.push(`${pl.actionState}${pl.phys.face}`); }
  check(seq[0] === 'SMASHTURN-1' && seq.includes('DASH-1'), `dash, then flick the other way → turn and dash back (${seq.join(' ')})`);
  check(feed.some((x) => /^Dash back · frame-perfect$/.test(x)) && game.stats.dashback.ok === 1, 'chip: "Dash back · frame-perfect", counted in stats');
  frames(game, 8, (s) => { s.lx = -1; });
  frames(game, 2, (s) => { s.lx = 1; });
  check(pl.actionState === 'DASH' && pl.phys.face === 1, 'and back again (dash dance)');
  // Too slow on the way back: no dash back.
  const slow = newGame({ fighter: 'vix' });
  frames(slow.game, 20);
  frames(slow.game, 8, (s) => { s.lx = 1; });
  frames(slow.game, 3, (s) => { s.lx = -0.5; });
  frames(slow.game, 1, (s) => { s.lx = -1; });
  check(slow.pl.actionState !== 'SMASHTURN' && slow.feed.some((x) => /^Dash back missed/.test(x)), 'stick lingering in the tilt zone → no dash back ("Dash back missed")');
}

console.log('Shield, shield drop & spot dodge');
{
  const onPlatform = (stickY, buildup = 0) => {
    const { game, pl, feed } = newGame({ fighter: 'vix' });
    frames(game, 10);
    place(game, -40, 27.2, { face: 1, platform: 0 });
    frames(game, 12, (s) => { s.r = 1; });
    const shielding = pl.actionState === 'GUARD';
    const states = [];
    for (let i = 0; i < 6; i++) {
      frames(game, 1, (s) => { s.r = 1; s.ly = i < buildup ? -0.3 : stickY; });
      states.push(pl.actionState);
    }
    return { shielding, states, feed, pl };
  };
  const drop = onPlatform(-53 / 80);
  check(drop.shielding && drop.states[0] === 'PASS' && drop.feed.some((x) => /^Shield drop ✓/.test(x)), `shield on a platform + stick to −0.6625 → shield drop (${drop.states[0]})`);
  const spot = onPlatform(-1);
  check(spot.states[0] === 'ESCAPEN', `straight down past −0.7 at once → spot dodge (${spot.states[0]})`);
  const slow = onPlatform(-53 / 80, 7);
  check(!slow.states.includes('PASS'), 'the stick must reach −0.65 within 6 frames of leaving −0.3 (slower = no drop)');
  // Light shield is bigger than a hard shield.
  const size = (l) => { const { game, pl } = newGame({ fighter: 'vix' }); frames(game, 5); frames(game, 12, (s) => { s.l = l; }); return pl.phys.shieldSize; };
  check(size(0.4) > size(1), 'a lighter analog press makes a bigger shield');
}

console.log('Fighter traits');
{
  // Mochi: 5 mid-air jumps.
  const { game, pl } = newGame({ fighter: 'mochi' });
  frames(game, 10);
  frames(game, 8, (s) => { s.btn.jump = true; });
  let jumps = 0;
  for (let i = 0; i < 160; i++) { frames(game, 1, (s) => { s.btn.jump = i % 2 === 0; }); jumps = Math.max(jumps, pl.phys.jumpsUsed); }
  check(jumps === 5, `mochi: 5 mid-air jumps (got ${jumps})`);
  // Rosette: float (hold jump + down stops the fall).
  const r = newGame({ fighter: 'rosette' });
  frames(r.game, 10);
  frames(r.game, 40, (s) => { s.btn.jump = true; });
  const y0 = r.pl.phys.pos.y;
  frames(r.game, 30, (s) => { s.btn.jump = true; s.ly = -1; });
  check(r.pl.phys.floating && Math.abs(r.pl.phys.pos.y - y0) < 2, 'rosette: hold jump + down → floats in place');
  frames(r.game, 10);
  check(!r.pl.phys.floating, 'rosette: releasing jump ends the float');
}

console.log('Target test');
{
  const tg = newGame({ mode: 'targets' });
  check(!tg.game.dummy && tg.game.targets.length === 10 && tg.game.timer.state === 'ready', 'target test: no dummy, all targets, timer waiting');
  frames(tg.game, 10);
  place(tg.game, -9, 0, { face: 1 });
  for (const t of tg.game.targets) if (!(t.x === 0 && t.y === 7)) t.alive = false;
  frames(tg.game, 1, (x) => { x.btn.attack = true; });
  frames(tg.game, 20);
  check(tg.game.targetsLeft === 0 && tg.game.timer.state === 'done' && tg.feed.some((x) => /^All targets cleared/.test(x)), 'jab breaks the last target and stops the clock');
  const lz = newGame({ mode: 'targets', fighter: 'vix' });
  frames(lz.game, 10);
  place(lz.game, 20, 0, { face: 1 });
  lz.game.targets.forEach((t) => { t.x = 60; t.y = 8; });
  lz.game.targets.splice(1);
  frames(lz.game, 1, (x) => { x.btn.special = true; });
  frames(lz.game, 40);
  check(lz.game.targetsLeft === 0, 'a projectile (laser) breaks a target');
}

console.log('Melee input processing');
{
  check(meleeStickUnits(22, 0).x === 0 && meleeStickUnits(0, -22).y === 0, 'deadzone: 22 units → 0 (each axis)');
  check(meleeStickUnits(23, 0).x === 0.2875 && meleeStickUnits(0, -23).y === -0.2875, 'deadzone: 23 units → ±0.2875');
  check(meleeStickUnits(60, 10).y === 0 && meleeStickUnits(60, 10).x === 0.75, 'deadzone is per axis (a cross): (60, 10) → (0.75, 0)');
  check(meleeStickUnits(110, 0).ux === 80 && meleeStickUnits(-127, 0).x === -1, 'clamp: full deflection → 80 units = 1.0');
  const d = meleeStickUnits(100, 100);
  check(Math.hypot(d.ux, d.uy) <= 80 && d.ux === d.uy, 'clamp is radial (diagonal keeps its angle, ≤ 80 units)');
  check(meleeStick(0.24, 0).x === 0 && meleeStick(0.26, 0).x === 0.2875, 'controller value → GameCube byte (±90) → units: 0.24 → 22 u → 0, 0.26 → 23 u');
  check(meleeStick(0.85, 0).x < 1 && meleeStick(0.9, 0).x === 1, 'the 80-unit edge is reached at ~89% of travel, not earlier');
  check(Number.isInteger(meleeStick(0.37, -0.52).x * 80), 'values are whole units (0.0125 steps)');
  check(meleeTrigger(42 / 255).value === 0, 'trigger: 42/140 → no shield');
  check(Math.abs(meleeTrigger(43 / 255).value - 43 / 140) < 1e-9 && meleeTrigger(43 / 255).value >= TRIGGER.SHIELD_MIN, 'trigger: 43/140 → lightest shield');
  check(meleeTrigger(0.9).value === 1 && meleeTrigger(0, true).value === 1, 'trigger: ≥ 140 or a digital press → full (1.0)');
  const run = (rawXs) => {
    const { game, pl } = newGame();
    frames(game, 20);
    for (const rx of rawXs) frames(game, 1, (s) => { s.lx = meleeStick(rx, 0).x; });
    return pl.actionState;
  };
  check(run([1]) === 'DASH', 'dash: neutral → full in one frame');
  check(run([0.45, 1]) === 'DASH', 'dash: one frame in the tilt zone (0.625) still dashes');
  check(run([0.45, 0.45, 1]) === 'WALK', 'walk: two frames in the tilt zone → no dash');
}

console.log('Sir Retro (Mr. Game & Watch data)');
{
  const R = charAttributes[ENGINE_ID['sir-retro']];
  check(ENGINE_ID['sir-retro'] === CHARIDS.RETRO_ID && R.weight === 60 && R.gravity === 0.095 && R.terminalV === 1.7 && R.fastFallV === 2.3,
    'a full character of its own (not a template): weight 60, gravity 0.095, fall 1.7 / 2.3');
  // Jump heights: full hop 29, short hop 11.025 (SmashWiki).
  const hop = (hold) => {
    const { game, pl } = newGame({ fighter: 'sir-retro' });
    frames(game, 20);
    const y0 = pl.phys.pos.y; let peak = y0;
    frames(game, 70, (s, i) => { s.btn.jump = i < hold; peak = Math.max(peak, pl.phys.pos.y); });
    return peak - y0;
  };
  const sh = hop(1); const fh = hop(8);
  check(Math.abs(fh - 29) < 0.6 && Math.abs(sh - 11.025) < 0.6, `full hop ${fh.toFixed(2)} (Melee 29), short hop ${sh.toFixed(2)} (Melee 11.025)`);

  // Weight: the same hit launches him (60) further than a heavyweight (104). Vix jabs each one.
  const kbOn = (target, pct) => {
    const w = new World({ stage: engineStage(), fighter: ENGINE_ID.vix, dummy: ENGINE_ID[target] });
    const step = (a) => { const i0 = inputData(); if (a) a(i0); w.step([i0, inputData()]); };
    for (let i = 0; i < 5; i++) step();
    w.player[1].phys.pos = new Vec2D(w.player[0].phys.pos.x + 8, 0.00001);
    w.player[1].percent = pct;
    for (let i = 0; i < 12; i++) { const b = w.player[1].percent; step((x) => { x.a = i === 0; }); if (w.player[1].percent > b) break; }
    const hb = w.player[0].charHitboxes.jab1.id0;
    return { kb: w.player[1].hit.knockback, want: getKnockback(hb, hb.dmg, hb.dmg, pct, w.player[1].charAttributes.weight, false, false) };
  };
  const light = kbOn('sir-retro', 80); const heavy = kbOn('rally', 80);
  check(light.kb > 0 && Math.abs(light.kb - light.want) < 1e-9 && light.kb > heavy.kb * 1.15,
    `same jab at 80%: KB ${light.kb.toFixed(1)} on him (weight 60) vs ${heavy.kb.toFixed(1)} on weight 104`);

  // L-cancel: forward air (25 → 12) can be L-cancelled; neutral air (15) can't.
  const lag = (stick, pressAt) => {
    const { game, pl } = newGame({ fighter: 'sir-retro' });
    frames(game, 20);
    frames(game, 1, (s) => { s.btn.jump = true; });
    until(game, () => pl.actionState === 'JUMPF', 20);
    frames(game, 1, (s) => { s.lx = stick; s.btn.attack = true; });
    let n = 0;
    while (!/^LANDING/.test(pl.actionState) && n < 120) { frames(game, 1, (s) => { if (n === pressAt) s.r = 1; }); n++; }
    let lagF = 0;
    while (/^LANDINGATTACKAIR/.test(pl.actionState) && lagF < 60) { lagF++; frames(game, 1); }
    return { lagF, landed: n };
  };
  const withLc = (stick) => { const full = lag(stick, -1); return [full.lagF, lag(stick, full.landed - 3).lagF]; };
  const [fFull, fLc] = withLc(0.5); const [nFull, nLc] = withLc(0);
  check(fFull === 25 && fLc === 12, `forward air: ${fFull}f landing lag, L-cancelled ${fLc}f (Melee 25 / 12)`);
  check(nFull === 15 && nLc === 15, `neutral air: ${nFull}f landing lag, still ${nLc}f with an L-cancel (flagged as a special move in Melee)`);

  // Judge: never one of the last two numbers; each of the other seven 1/7 (seeded).
  setRetroSeed(12345);
  const first = rollJudge({});
  const two = {}; const firstTwo = [rollJudge(two), rollJudge(two)];
  const fake = {};
  let repeat = 0; let hist = [];
  const counts = Array(10).fill(0); const after = Array(10).fill(0);
  const n = 70000;
  for (let i = 0; i < n; i++) {
    const v = rollJudge(fake);
    if (hist.includes(v)) repeat++;
    counts[v]++;
    if (hist[0] === 5 && hist[1] === 9) after[v]++;
    hist = [v, hist[0]];
  }
  const freq = counts.slice(1).map((c) => c / n);
  const afterN = after.reduce((a, b) => a + b, 0);
  const cond = after.slice(1).filter((_, i) => i !== 4 && i !== 8).map((c) => c / afterN);
  check(first !== 1 && !firstTwo.includes(2) && repeat === 0, 'Judge: never repeats either of the last two numbers (and opens without a 1 or 2)');
  check(cond.length === 7 && cond.every((f) => Math.abs(f - 1 / 7) < 0.03) && after[5] === 0 && after[9] === 0,
    `Judge: after a 9 then a 5, each of the other seven comes up ≈ 1/7 (${cond.map((f) => (f * 100).toFixed(1)).join(' ')}%)`);
  check(freq.every((f) => Math.abs(f - 1 / 9) < 0.006), `Judge: over ${n} seeded rolls every number ≈ 1/9 overall (${freq.map((f) => (f * 100).toFixed(1)).join(' ')}%)`);
  // A 9 against a 1, in the engine (Judge on the dummy at 0%). A fresh fighter's first number can't be
  // a 1, so each try swings once at nothing, then at the dummy.
  const judgeHit = (want) => {
    for (let sd = 1; sd < 400; sd++) {
      setRetroSeed(sd);
      const { game, pl } = newGame({ fighter: 'sir-retro' });
      const d = game.world.player[1];
      frames(game, 5);
      frames(game, 1, (x) => { x.lx = -1; x.btn.special = true; });
      frames(game, 60);
      const selfBefore = pl.percent;
      place(game, d.phys.pos.x - 9, 0, { face: 1 });
      frames(game, 1, (x) => { x.lx = 1; x.btn.special = true; });
      if (pl.retro.number !== want) continue;
      for (let i = 0; i < 30; i++) {
        frames(game, 1);
        if (d.percent > 0) return { dmg: d.percent, kb: d.hit.knockback, self: pl.percent - selfBefore };
      }
      return { dmg: 0, kb: 0, self: pl.percent - selfBefore };
    }
    return null;
  };
  const j1 = judgeHit(1); const j9 = judgeHit(9);
  check(j1 && j9 && j9.dmg === 32 && j1.dmg === 2 && j1.kb === 0 && j9.kb > 150, `Judge 9: 32% and KB ${j9?.kb.toFixed(0)}; Judge 1: 2% and no knockback`);
  check(j1 && j1.self === 12 && j9.self === 0, 'Judge 1 also deals 12% to Sir Retro');

  // Fire: rises, then helpless (no jump, no attack), 6-frame landing.
  {
    const { game, pl } = newGame({ fighter: 'sir-retro' });
    frames(game, 10);
    frames(game, 1, (s) => { s.ly = 1; s.btn.special = true; });
    let top = 0;
    const t = 1 + until(game, () => pl.actionState === 'FALLSPECIAL', 60, () => { top = Math.max(top, pl.phys.pos.y); });
    frames(game, 3, (s, i) => { s.btn.jump = i === 1; });
    const helpless = pl.actionState === 'FALLSPECIAL';
    frames(game, 2, (s, i) => { s.btn.attack = i === 0; });
    const stillHelpless = pl.actionState === 'FALLSPECIAL';
    until(game, () => pl.actionState === 'LANDINGFALLSPECIAL', 200);
    let lagF = 0;
    while (pl.actionState === 'LANDINGFALLSPECIAL' && lagF < 60) { lagF++; frames(game, 1); }
    check(t === 40 && top > 45 && helpless && stillHelpless, `Fire: ${t - 1} frames of rise (to ${top.toFixed(0)} units), then helpless (jump and attack do nothing)`);
    check(lagF === 6, `Fire: landing from the free fall takes ${lagF} frames (Melee 6)`);
  }

  // Oil Panic: absorbs Vix's lasers (no damage), three fill the bucket, the spill hits for floor(9 × 1.5) + 5.
  {
    const w = new World({ stage: engineStage(), fighter: ENGINE_ID.vix, dummy: ENGINE_ID['sir-retro'] });
    const vx = w.player[0]; const r = w.player[1];
    const step = (a, b) => { const i0 = inputData(); const i1 = inputData(); if (a) a(i0); if (b) b(i1); w.step([i0, i1]); };
    for (let i = 0; i < 10; i++) step();
    const fills = [];
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 70; i++) step((x) => { x.b = i === 0; }, (x) => { x.b = true; x.lsY = i < 2 ? -1 : 0; });
      fills.push(r.retro.bucket);
      for (let i = 0; i < 30; i++) step();
    }
    check(fills.join() === '1,2,3' && r.percent === 0 && r.retro.oil === 9, `Oil Panic absorbs the laser (bucket ${fills.join(' → ')}, ${r.percent}% taken, 9% stored)`);
    r.phys.pos = new Vec2D(vx.phys.pos.x + 20, r.phys.pos.y);
    const before = vx.percent;
    for (let i = 0; i < 60; i++) step(null, (x) => { x.b = i === 0; x.lsY = i < 2 ? -1 : 0; });
    check(vx.percent - before === 18 && r.retro.bucket === 0, `the full bucket spills for ${vx.percent - before}% (floor(9 × 1.5) + 5 = 18) and empties`);
  }

  // A smash at a given percent: forward smash on the dummy (weight 60) at 50% follows the formula.
  {
    const { game } = newGame({ fighter: 'sir-retro' });
    const d = game.world.player[1];
    frames(game, 5);
    d.percent = 50;
    place(game, d.phys.pos.x - 12, 0, { face: 1 });
    frames(game, 2);
    let got = null;
    for (let i = 0; i < 40 && !got; i++) {
      const b = d.percent;
      frames(game, 1, (s) => { s.cx = i < 2 ? 1 : 0; });
      if (d.percent > b) got = { dmg: d.percent - b, kb: d.hit.knockback };
    }
    const hb = game.world.player[0].charHitboxes.fsmashClean.id0; // 18%, 55°, KBG 100, BKB 44
    const p = 50 + hb.dmg; // the formula uses the percent after the hit
    const want = ((((p / 10) + (p * hb.dmg) / 20) * (200 / (60 + 100)) * 1.4) + 18) * (hb.kg / 100) + hb.bk;
    check(got && got.dmg === 18 && Math.abs(got.kb - want) < 1e-9, `forward smash (torch, 18%) on weight 60 at 50% (68% after): KB ${got?.kb.toFixed(2)} = formula ${want.toFixed(2)}`);
  }
}

console.log('Performance');
{
  const { game } = newGame({ fighter: 'sable' });
  const t0 = performance.now();
  frames(game, 600, (s, i) => { s.lx = Math.sin(i / 9); s.btn.attack = i % 25 === 0; s.btn.jump = i % 60 === 30; });
  const ms = (performance.now() - t0) / 600;
  check(ms < 1.3, `engine step with fighter + dummy: ${ms.toFixed(3)} ms per frame (budget 1.3)`);
}

if (failures) { console.error(`\n${failures} arena test(s) failed`); process.exit(1); }
console.log('\nArena gameplay tests passed');
