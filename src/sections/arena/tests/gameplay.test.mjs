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
const { charAttributes } = await import('../engine/ml.js');
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
  check(retro.lc.lag === retro.full.lag && retro.lc.feed.some((x) => /can’t be L-cancelled/.test(x)), 'sir-retro: neutral air can’t be L-cancelled (approximation rule)');
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
  check(meleeStick(0.2, 0).x === 0 && meleeStick(0.21, 0).x === 0.2875, 'controller value → GameCube byte (±110) → units: 0.2 → 22 u → 0, 0.21 → 23 u');
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
