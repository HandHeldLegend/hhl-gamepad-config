/**
 * analyzer.js: The Snapback page's Analyzer, on firmware that records a stick at full rate (0xF9).
 *
 * The page records whichever stick was last pushed out (view.js arms it from the live stream) each time it
 * comes back from a push, a let-go or a flick across: 256 samples of x/y at 2 kHz, 48 of them before it fell
 * under 500. Each recording shows "What the stick did" against "What the game sees": the app's exact copy
 * of Auto's filter (spring.js) replayed with that stick's tuning and deadzone as they are now.
 *
 * The path view shows the stick live (a ring where it is now), and after each recording plays it back in
 * slow motion (PLAY_SLOWER times slower), over and over: the path draws itself as the stick and the game's
 * output move along it, and the time charts' cursors follow. Play/pause is on the path view; dragging the
 * scrubber pauses it. With reduced motion it doesn't start on its own.
 *
 * Three views, one of them large: the path in the gate (2D, coloured early to late), distance from centre
 * over time, and X and Y over time. Each small one has an expand button that makes it the large one. The
 * time views share a strip with what the filter was doing (deciding, checking, holding) and a scrubber:
 * dragging across them moves a marker on every view, with a readout. A summary gives the kind of move (from
 * the stick's path), the delay, the time held, the furthest rebound held back and why the hold ended.
 *
 * Game lines: a game's deadzone and the thresholds where a rebound turns into an input (games.js), drawn on
 * every view, so it's clear whether a rebound that got through would have done anything in that game.
 *
 * Recordings: the last MAX_KEPT, stepped through with back and forward (newest first), "Worst" for the
 * largest delay, and a kind filter. Download saves them as JSON lines in the tuning recordings' format with
 * the tuning and deadzone they were replayed with. A stick that isn't using a tuning (not tuned, or not on
 * Auto) shows the stick alone and "Filter not active".
 */
import { h } from '../../ui/dom.js';
import { card, button, select, dot } from '../../ui/controls.js';
import { icon } from '../../ui/icons.js';
import { prefersReducedMotion } from '../../ui/canvas-surface.js';
import { t, N_, fmt } from '../../i18n/index.js';
import { inspectCapture, GATE, CAPTURE_PRE, SAMPLE_MS, DEFAULT_DEADZONE } from './spring.js';
import { springParams } from './spring-config.js';
import { GAMES, reboundPast } from './games.js';

const MAX_KEPT = 30;
/** A delay past this is shown as a problem (one crossing check's built-in cost, and a sample). */
const DELAY_WARN_MS = 3.5;
const FULL = 2048;
/** Time charts are drawn in this box and stretched to their width. */
const W = 320;
const GAME_KEY = 'hoja3.snapback.game';
/** Slow motion: a recording (128 ms) plays this many times slower, then rests a moment before it repeats. */
const PLAY_SLOWER = 20;
const PLAY_REST_MS = 900;

const KINDS = {
  letgo: N_('Let-go'),
  turnaround: N_('Turnaround'),
  flick: N_('Flick to the far edge'),
  dashback: N_('Dash and return'),
  other: N_('Other'),
};
const REASONS = {
  release: N_('Held: let go'),
  rebound: N_('Held: rebound'),
  thumb: N_('Passed: the thumb had it'),
  thrown: N_('Passed: thrown by the hand'),
  passed: N_('Passed: not a rebound'),
  grab: N_('Released: the thumb took it back'),
  push: N_('Released: pushed away from center'),
  still: N_('Released: held still far out'),
  free: N_('Released: stopped moving like a let-go'),
  late: N_('Released: turned back too late'),
  beyond: N_('Released: went further than a let-go can'),
  settled: N_('Released: settled at center'),
  max: N_('Released: longest hold reached'),
};
const STATES = {
  [GATE.IDLE]: N_('Passing'),
  [GATE.EDGE]: N_('At the edge'),
  [GATE.DECIDING]: N_('Deciding'),
  [GATE.CHECKING]: N_('Checking'),
  [GATE.HOLDING]: N_('Holding'),
};
const STATE_CLASS = { [GATE.EDGE]: 'edge', [GATE.DECIDING]: 'decide', [GATE.CHECKING]: 'check', [GATE.HOLDING]: 'hold' };
const STICK_NAME = { left: N_('Left stick'), right: N_('Right stick') };
/** games.js line labels */
const LINE_NAMES = { deadzone: N_('Deadzone'), dash: N_('Dash and smash'), hard: N_('Hard press'), walk: N_('Walk and turn'), runturn: N_('Run turnaround') };

const ms = (v) => t('{n} ms', { n: fmt.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
/** Times count from the moment the stick fell back under 500. */
const span = (i) => (i - CAPTURE_PRE) * SAMPLE_MS;

function storedGame() {
  try { return GAMES.some((g) => g.id === localStorage.getItem(GAME_KEY)) ? localStorage.getItem(GAME_KEY) : 'none'; } catch { return 'none'; }
}

/** A small "make this the large view" glyph: two arrows out to the corners. */
function expandGlyph() {
  return h('svg.icon', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    h('path', { d: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

/**
 * @param {{session: object, tone: string}} o
 * @returns {{el: HTMLElement, add: (c: object) => void, setArmed: (stick: string|null) => void}}
 */
export function analyzer({ session, tone }) {
  const kept = [];        // newest first
  let shown = null;
  let filter = 'all';
  let game = storedGame();
  let big = 'path';
  let at = -1;            // scrubber sample

  // ---- Header -----------------------------------------------------------------------------------
  const listening = h('span.sb-status', dot(tone, true), t('Listening'));
  const download = button({ icon: 'download', variant: 'ghost', size: 'sm', title: t('Download recordings'), disabled: true, onClick: save });
  const gameSelect = select({
    options: GAMES.map((g) => ({ value: g.id, label: g.id === 'none' ? t('No game lines') : g.name })),
    value: game, ariaLabel: t('Show a game’s thresholds'),
    onChange: (v) => {
      game = v;
      try { localStorage.setItem(GAME_KEY, v); } catch { /* the choice just isn't kept */ }
      if (shown) draw(shown);
    },
  });
  const summary = h('div.an-summary');
  const empty = h('p.an-empty.muted', t('Push either stick out and let it go, or flick it across: it shows up here.'));

  // ---- Views ------------------------------------------------------------------------------------
  const R = 100;
  const px = (v) => (v / FULL) * R;
  const pathOut = h('polyline.an-path-out');
  const pathRaw = h('g.an-path-raw');
  const dzCircle = h('circle.an-dz-ring', { cx: 0, cy: 0 });
  const pathGame = h('g.an-game');
  const startMark = h('circle.an-start', { r: 4 });
  const endMark = h('circle.an-end', { r: 4 });
  const markRaw = h('circle.an-mark-raw', { r: 5 });
  const markOut = h('circle.an-mark-out', { r: 5 });
  const liveDot = h('g.an-live', {}, h('circle', { r: 7 }), h('circle.an-live-core', { r: 2 }));
  liveDot.style.display = 'none';
  const pathSvg = h('svg.an-pathview', { viewBox: '-110 -110 220 220', role: 'img', 'aria-label': t('The stick’s path, and what the game sees') },
    h('circle.an-gate', { cx: 0, cy: 0, r: R }), dzCircle,
    h('line.an-axis', { x1: -R, y1: 0, x2: R, y2: 0 }), h('line.an-axis', { x1: 0, y1: -R, x2: 0, y2: R }),
    pathGame, pathOut, pathRaw, startMark, endMark, markOut, markRaw, liveDot);

  function timeChart(cls, height) {
    const svg = h(`svg.an-chart.${cls}`, { viewBox: `0 0 ${W} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const cursor = h('line.an-cursor', { y1: 0, y2: height });
    return { svg, height, cursor };
  }
  const dist = timeChart('dist', 100);
  const xs = timeChart('xy', 60);
  const ys = timeChart('xy', 60);
  const strips = [timeChart('strip', 12), timeChart('strip', 12)];
  const axisLabels = () => h('div.an-axis-labels.small.faint', h('span', ms(span(0))), h('span', t('0 = back under 500')), h('span', ms(span(256))));

  function panel(key, title, tools, ...body) {
    const grow = button({ variant: 'ghost', size: 'sm', title: t('Make this view larger'), class: 'an-grow', onClick: () => setBig(key) });
    grow.replaceChildren(expandGlyph());
    const el = h('div.an-panel', { 'data-view': key }, h('div.an-panel-head', h('span.small.muted', title), h('span.spacer'), tools, grow), ...body);
    return el;
  }
  const playBtn = button({ icon: 'play', variant: 'ghost', size: 'sm', label: t('Slow motion'), class: 'an-play', disabled: true, onClick: () => (playing ? pause() : play()) });
  const panels = {
    path: panel('path', t('Path in the gate'), playBtn, pathSvg),
    dist: panel('dist', t('Distance from center'), null, h('div.an-times', dist.svg, strips[0].svg, axisLabels())),
    xy: panel('xy', t('X and Y'), null, h('div.an-times', h('span.an-chart-label.small.faint', 'X'), xs.svg, h('span.an-chart-label.small.faint', 'Y'), ys.svg, strips[1].svg, axisLabels())),
  };
  const views = h('div.an-views');
  function setBig(key) {
    big = key;
    const order = [key, ...Object.keys(panels).filter((k) => k !== key)];
    order.forEach((k, i) => { panels[k].dataset.slot = i === 0 ? 'big' : `s${i}`; });
    views.replaceChildren(...order.map((k) => panels[k]));
    views.classList.remove('rise-in');
    void views.offsetWidth;
    views.classList.add('rise-in');
  }
  setBig(big);
  views.classList.remove('rise-in');

  const readout = h('p.an-readout.small', { 'aria-live': 'polite' });
  const legend = h('div.an-legend.small');
  const exitsList = h('ol.an-exits.small');

  // ---- Navigator --------------------------------------------------------------------------------
  const prev = button({ icon: 'chevron-right', variant: 'ghost', size: 'sm', title: t('Newer'), class: 'an-flip', onClick: () => step(-1) });
  const next = button({ icon: 'chevron-right', variant: 'ghost', size: 'sm', title: t('Older'), onClick: () => step(1) });
  const position = h('span.an-pos.small');
  const worst = button({ label: t('Worst'), variant: 'ghost', size: 'sm', onClick: () => { const w = visible().reduce((a, e) => ((e.a.r?.delayMs ?? -1) > (a?.a.r?.delayMs ?? -1) ? e : a), null); if (w) draw(w); } });
  const kindSelect = select({
    options: [{ value: 'all', label: t('All kinds') }, ...Object.entries(KINDS).map(([value, label]) => ({ value, label: t(label) }))],
    value: 'all', ariaLabel: t('Show recordings of this kind'),
    onChange: (v) => { filter = v; const list = visible(); if (list.length && !list.includes(shown)) draw(list[0]); else paintNav(); },
  });
  const nav = h('div.an-nav', prev, position, next, worst, h('span.spacer'), kindSelect);
  const visible = () => kept.filter((e) => filter === 'all' || e.a.kind === filter);
  function step(d) {
    const list = visible();
    const i = list.indexOf(shown);
    const to = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + d))];
    if (to && to !== shown) draw(to);
  }
  function paintNav() {
    const list = visible();
    const i = list.indexOf(shown);
    position.textContent = list.length ? t('{n} of {of}', { n: fmt.number(i + 1), of: fmt.number(list.length) }) : t('None of this kind yet');
    prev.disabled = i <= 0;
    next.disabled = i < 0 || i >= list.length - 1;
    worst.disabled = !list.some((e) => e.a.r?.delayMs);
    download.disabled = !kept.length;
  }

  nav.hidden = true;
  const body = h('div.an-body', empty, summary, nav, views, readout, legend, exitsList);
  const el = card({
    title: t('Analyzer'), subtitle: t('What the stick did, against what the game sees.'),
    icon: 'bolt', tone, class: 'sb-analyzer an', actions: h('div.an-actions', listening, gameSelect, download),
  }, body);

  // ---- Drawing ----------------------------------------------------------------------------------
  const xAt = (i, n) => (i / (n - 1)) * W;
  const line = (vals, height, lo, hi, cls) => {
    const n = vals.length;
    const yOf = (v) => height - 2 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (height - 4);
    return h('polyline', { class: cls, points: vals.map((v, i) => `${xAt(i, n).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ') });
  };
  const gameLines = () => GAMES.find((g) => g.id === game)?.lines || [];

  function draw(e) {
    shown = e;
    const { c, a, dz } = e;
    const n = c.x.length;
    empty.hidden = true;
    nav.hidden = false;

    // Summary
    const facts = [h('span.an-stick', t(STICK_NAME[e.stick])), h('span.an-kind', t(KINDS[a.kind]))];
    if (!a.g) facts.push(h('span.an-fact.muted', t('Filter not active')));
    else {
      const d = a.r.delayMs;
      facts.push(h('span.an-fact', { class: d == null ? 'muted' : d > DELAY_WARN_MS ? 'warn' : 'good' },
        d == null ? t('Let go: no delay to measure') : d ? t('Delay: {time}', { time: ms(d) }) : t('No delay')));
      if (a.heldMs) {
        facts.push(h('span.an-fact', t('Held {time}', { time: ms(a.heldMs) })));
        facts.push(h('span.an-fact', t('Rebound blocked: {n}%', { n: fmt.number(Math.round((a.peakBlocked / FULL) * 100)) })));
      }
      if (a.main) facts.push(h('span.an-fact.muted', t(REASONS[a.main])));
    }
    const lines = gameLines();
    // A let-go with a game picked: would its rebound have counted there?
    if (a.g && lines.length && (a.kind === 'letgo' || a.kind === 'turnaround')) {
      const pk = c.x.slice(0, CAPTURE_PRE).reduce((b, x, i) => (Math.hypot(x, c.y[i]) > b.d ? { d: Math.hypot(x, c.y[i]), i } : b), { d: -1, i: 0 });
      const past = reboundPast(a.g, { x: c.x[pk.i], y: c.y[pk.i] }, lines);
      for (const { line, samples } of past) {
        facts.push(h('span.an-fact', { class: samples && line.kind === 'action' ? 'warn' : samples ? '' : 'good' },
          samples ? t('Rebound past: {line}, {time}', { line: t(LINE_NAMES[line.label]), time: ms(samples * SAMPLE_MS) })
            : t('Rebound stays under: {line}', { line: t(LINE_NAMES[line.label]) })));
      }
    }
    summary.replaceChildren(...facts);


    // Path: the game's lines, the output under the stick, the stick coloured from early (blue) to late (red)
    dzCircle.setAttribute('r', px(dz).toFixed(1));
    // Per-axis lines are chords of the gate (x or y at ±v, inside the circle); radial ones are rings
    pathGame.replaceChildren(...lines.map((l) => {
      if (l.shape !== 'axis') return h('circle', { class: `an-game-line ${l.kind}`, cx: 0, cy: 0, r: l.v * R });
      const at = l.v * R;
      const half = Math.sqrt(Math.max(0, R * R - at * at));
      return h('g', { class: `an-game-line ${l.kind}` },
        ...[-1, 1].flatMap((s) => [h('line', { x1: s * at, x2: s * at, y1: -half, y2: half }), h('line', { y1: s * at, y2: s * at, x1: -half, x2: half })]));
    }));
    const pt = (x, y) => `${px(x).toFixed(1)},${(-px(y)).toFixed(1)}`;
    outPts = a.g ? Array.from(a.g.x, (x, i) => pt(x, a.g.y[i])) : [];
    pathOut.setAttribute('points', outPts.join(' '));
    const segs = [];
    revealed = n - 1;
    for (let i = 1; i < n; i++) {
      segs.push(h('line', {
        x1: px(c.x[i - 1]).toFixed(1), y1: (-px(c.y[i - 1])).toFixed(1), x2: px(c.x[i]).toFixed(1), y2: (-px(c.y[i])).toFixed(1),
        style: `stroke: color-mix(in srgb, var(--red) ${Math.round((i / (n - 1)) * 100)}%, var(--blue))`,
      }));
    }
    pathRaw.replaceChildren(...segs);
    segLines = segs;
    startMark.setAttribute('cx', px(c.x[0]).toFixed(1)); startMark.setAttribute('cy', (-px(c.y[0])).toFixed(1));
    endMark.setAttribute('cx', px(c.x[n - 1]).toFixed(1)); endMark.setAttribute('cy', (-px(c.y[n - 1])).toFixed(1));

    // Distance over time: deadzone, held shading, the game's lines, stick and output
    const yD = (v) => dist.height - 2 - (Math.min(FULL, v) / FULL) * (dist.height - 4);
    const dParts = [h('rect.an-dz', { x: 0, width: W, y: yD(dz), height: dist.height - yD(dz) })];
    if (a.g) for (const [s0, s1] of a.r.held) dParts.push(h('rect.an-held', { x: xAt(s0, n), width: Math.max(1, xAt(s1, n) - xAt(s0, n)), y: 0, height: dist.height }));
    for (const l of lines) dParts.push(h('line', { class: `an-game-line ${l.kind}`, x1: 0, x2: W, y1: yD(l.v * FULL), y2: yD(l.v * FULL) }));
    dParts.push(line(a.rawD, dist.height, 0, FULL, 'an-line raw'));
    if (a.g) dParts.push(line(a.outD, dist.height, 0, FULL, 'an-line out'));
    dist.svg.replaceChildren(...dParts, dist.cursor);

    // X and Y over time, with the game's lines either side of centre
    for (const [chart, axisVals, outVals] of [[xs, c.x, a.g?.x], [ys, c.y, a.g?.y]]) {
      const yv = (v) => chart.height / 2 - (v / FULL) * (chart.height / 2 - 2);
      chart.svg.replaceChildren(h('line.an-mid', { x1: 0, x2: W, y1: chart.height / 2, y2: chart.height / 2 }),
        ...lines.flatMap((l) => [-1, 1].map((s) => h('line', { class: `an-game-line ${l.kind}`, x1: 0, x2: W, y1: yv(s * l.v * FULL), y2: yv(s * l.v * FULL) }))),
        line(Array.from(axisVals), chart.height, -FULL, FULL, 'an-line raw'),
        ...(outVals ? [line(Array.from(outVals), chart.height, -FULL, FULL, 'an-line out')] : []), chart.cursor);
    }

    // What the filter was doing: a band per state, a tick at every event
    for (const strip of strips) {
      const parts = [];
      if (a.g) {
        let from = 0;
        for (let i = 1; i <= n; i++) {
          if (i < n && a.g.state[i] === a.g.state[from]) continue;
          const cls = STATE_CLASS[a.g.state[from]];
          if (cls) parts.push(h(`rect.an-state.${cls}`, { x: xAt(from, n), width: Math.max(1, xAt(i, n) - xAt(from, n)), y: 0, height: strip.height }));
          from = i;
        }
        for (const ex of a.exits) parts.push(h('line.an-tick', { x1: xAt(ex.at, n), x2: xAt(ex.at, n), y1: 0, y2: strip.height }));
      }
      strip.svg.replaceChildren(...parts, strip.cursor);
      strip.svg.style.display = a.g ? '' : 'none';
    }
    exitsList.replaceChildren(...(a.g ? a.exits : []).map((ex) => h('li', { class: ex.start ? 'start' : 'end' },
      h('span.an-exit-t', ms(span(ex.at))), t(REASONS[ex.why]))));
    exitsList.hidden = !a.g || !a.exits.length;

    // Legend: the lines drawn, then the game's
    const g = GAMES.find((x) => x.id === game);
    legend.replaceChildren(
      h('span.an-key.raw', t('What the stick did')),
      ...(a.g ? [h('span.an-key.out', t('What the game sees')), h('span.an-key.held', t('Held at center'))] : []),
      ...(a.g ? [GATE.DECIDING, GATE.CHECKING, GATE.HOLDING].map((s) => h(`span.an-key.state.${STATE_CLASS[s]}`, t(STATES[s]))) : []),
      ...(g?.lines ? [h('span.an-key-game', g.name), ...g.lines.map((l) => h(`span.an-key.game.${l.kind}`, t('{name} {pct}%', { name: t(LINE_NAMES[l.label]), pct: fmt.number(Math.round(l.v * 100)) })))] : []));

    paintNav();
    playBtn.disabled = false;
    // A new recording plays back in slow motion on its own (not with reduced motion)
    if (prefersReducedMotion()) { pause(); scrub(at >= 0 && at < n ? at : -1); } else play();
  }

  // ---- Slow-motion playback -------------------------------------------------------------------
  let segLines = [];
  let outPts = [];
  let revealed = 0;
  let playing = false;
  let playFrame = 0;
  let playT0 = 0;
  /** Show the stick's path up to sample i (the rest stays faint) and the game's output up to it. */
  function reveal(i) {
    const lo = Math.min(i, revealed); const hi = Math.max(i, revealed);
    for (let j = lo; j < hi && j < segLines.length; j++) segLines[j].classList.toggle('ahead', j >= i);
    if (i !== revealed) pathOut.setAttribute('points', outPts.slice(0, i + 1).join(' '));
    revealed = i;
  }
  function play() {
    if (!shown) return;
    playing = true;
    playBtn.replaceChildren(icon('stop'), h('span.btn-label', t('Pause')));
    readout.setAttribute('aria-live', 'off');
    playT0 = performance.now();
    if (!playFrame) playFrame = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(playFrame);
    playFrame = 0;
    playBtn.replaceChildren(icon('play'), h('span.btn-label', t('Slow motion')));
    readout.setAttribute('aria-live', 'polite');
    reveal(segLines.length);
  }
  function tick(now) {
    playFrame = 0;
    if (!playing || !shown) return;
    const n = shown.c.x.length;
    const length = n * SAMPLE_MS * PLAY_SLOWER;
    const into = (now - playT0) % (length + PLAY_REST_MS);
    const i = Math.min(n - 1, Math.floor((into / length) * (n - 1)));
    reveal(i);
    scrub(i);
    playFrame = requestAnimationFrame(tick);
  }

  // ---- Live: where the stick is now -----------------------------------------------------------
  let liveStick = null;
  let livePos = null;
  let liveFrame = 0;
  function paintLive() {
    liveFrame = 0;
    const at2 = livePos?.[shown?.stick || liveStick];
    liveDot.style.display = at2 ? '' : 'none';
    if (at2) liveDot.setAttribute('transform', `translate(${px(at2[0]).toFixed(1)} ${(-px(at2[1])).toFixed(1)})`);
  }

  /** Move the scrubber to sample i (-1: hide it). */
  function scrub(i) {
    at = i;
    const e = shown;
    const on = e && i >= 0;
    for (const ch of [dist, xs, ys, ...strips]) {
      ch.cursor.style.display = on ? '' : 'none';
      if (on) { const x = xAt(i, e.c.x.length).toFixed(1); ch.cursor.setAttribute('x1', x); ch.cursor.setAttribute('x2', x); }
    }
    markRaw.style.display = on ? '' : 'none';
    markOut.style.display = on && e.a.g ? '' : 'none';
    if (!on) { readout.textContent = t('Drag across a time chart to follow the stick sample by sample.'); return; }
    const { c, a } = e;
    markRaw.setAttribute('cx', px(c.x[i]).toFixed(1)); markRaw.setAttribute('cy', (-px(c.y[i])).toFixed(1));
    const pos = (x, y) => t('({x}, {y}) {d}', { x: fmt.number(x), y: fmt.number(y), d: fmt.number(Math.round(Math.hypot(x, y))) });
    const parts = [ms(span(i)), t('Stick {pos}', { pos: pos(c.x[i], c.y[i]) })];
    if (a.g) {
      markOut.setAttribute('cx', px(a.g.x[i]).toFixed(1)); markOut.setAttribute('cy', (-px(a.g.y[i])).toFixed(1));
      parts.push(t('Game {pos}', { pos: pos(a.g.x[i], a.g.y[i]) }), t(STATES[a.g.state[i]]));
    }
    readout.textContent = parts.join(' · ');
  }
  for (const box of [panels.dist.querySelector('.an-times'), panels.xy.querySelector('.an-times')]) {
    const from = (ev) => {
      const r = box.getBoundingClientRect();
      if (!shown || !r.width) return;
      scrub(Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (shown.c.x.length - 1)));
    };
    box.addEventListener('pointerdown', (ev) => { box.setPointerCapture?.(ev.pointerId); pause(); from(ev); });
    box.addEventListener('pointermove', (ev) => { if (ev.buttons || (ev.pointerType === 'mouse' && !playing)) from(ev); });
  }

  /** Download every kept recording: JSON lines, the tuning recordings' format plus the replay's delay. */
  function save() {
    const lines = kept.map((e) => JSON.stringify({
      label: 'analyzer', stick: e.stick, number: e.c.number, period_us: SAMPLE_MS * 1000, pre: CAPTURE_PRE, time: e.time / 1000,
      deadzone: e.dz, tuned: !!e.params, params: e.params, delayMs: e.a.r ? e.a.r.delayMs : null, x: Array.from(e.c.x), y: Array.from(e.c.y),
    }));
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'application/x-ndjson' });
    const link = h('a', { href: URL.createObjectURL(blob), download: `analyzer-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return {
    el,
    /** Which stick is being recorded, for the header (null: none, while the tuning dialog has it). */
    setArmed(stick) {
      if (stick) liveStick = stick;
      listening.replaceChildren(dot(tone, !!stick), stick ? t('Listening: {stick}', { stick: t(STICK_NAME[stick]) }) : t('Paused'));
    },
    /** Where both sticks are now ({left: [x, y], right: [x, y]}, ±2048), from the live stream. */
    live(pos) {
      livePos = pos;
      if (!liveFrame) liveFrame = requestAnimationFrame(paintLive);
    },
    destroy() {
      pause();
      cancelAnimationFrame(liveFrame);
    },
    add(c) {
      const stick = c.stick === 1 ? 'right' : 'left';
      const params = springParams(session, stick);
      const dz = session.config.analog?.[stick === 'left' ? 'l_deadzone' : 'r_deadzone'] || DEFAULT_DEADZONE;
      const e = { c, stick, time: Date.now(), params, dz, a: inspectCapture(c, params, dz) };
      kept.unshift(e);
      if (kept.length > MAX_KEPT) kept.pop();
      // The newest is shown unless it's filtered out
      if (filter === 'all' || e.a.kind === filter || !shown) draw(e);
      else paintNav();
    },
  };
}
