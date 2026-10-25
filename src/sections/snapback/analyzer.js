/**
 * analyzer.js: The Snapback page's Analyzer, on firmware that records a stick at full rate (0xF9).
 *
 * The page records whichever stick was last pushed out (view.js arms it from the live stream) each time it
 * comes back from a push, a let-go or a flick across: 256 samples of x/y at 2 kHz, 48 of them before it fell
 * under 500. Each recording shows what the stick did against what the game sees: the app's exact copy of
 * stick's filter replayed with its settings and deadzone as they were when it was recorded: Auto with a
 * tuning (spring.js), or the low-pass filter or untuned Auto (legacy-filters.js), all bit-exact; Off has
 * nothing to replay.
 *
 * Three views in fixed places, in a box that keeps its height: the stick path on the left, the wave and
 * X and Y stacked beside it (all three stacked on a narrow card). The expand button on one grows it
 * smoothly: the path widens its column; the wave or X and Y takes the whole right side and the other folds
 * to its title. Under the views, the summary always shows all its parts (placeholders until the first
 * recording), so nothing changes height when one arrives:
 *   - Stick path: the stick coloured early to late, the game's output, where the stick is now (live),
 *     and a slow-motion replay of each recording, PLAY_SLOWER times slower, over and over: the path draws
 *     itself as the stick and the game's output move along it. Play/pause is on the view; dragging a time
 *     chart pauses it. With reduced motion it doesn't start on its own.
 *   - Snapback wave: the stick's position along the direction it was pushed, as the wave it is: above zero
 *     the side it was pushed to, below zero the other side (where a rebound lands), each side shaded its own
 *     colour, with the deadzone band and the game's output over it.
 *   - X and Y over time: each axis on its own.
 * Under the time views, a strip with what the filter was doing (deciding, checking, holding), and a
 * scrubber: dragging across a time view moves a marker on every view, with a readout. A summary gives the
 * kind of move (from the stick's path), the delay, the time held, the furthest rebound held back and what
 * ended the hold, and a one-line timeline of the filter's decisions.
 *
 * Game lines: a game's deadzone and the thresholds where a rebound turns into an input (games.js), drawn and
 * labelled on every view; for a let-go the summary says whether the rebound would have counted there. The
 * time views also mark the game's frames (it reads the stick once a frame), counted from 0; where a real
 * game's frames fall against the stick isn't known, so they show the spacing, not the exact moments.
 *
 * Each recording is named by the kind of move (captureKind) with a sentence on what that move was.
 *
 * Recordings: the last MAX_KEPT, stepped through with back and forward (newest first), "Worst" for the
 * largest delay, and a kind filter (a new recording of another kind puts it back to all kinds). Download saves them as JSON lines in the tuning recordings' format with
 * the filter, tuning and deadzone they were replayed with. A stick with its filter off shows the stick alone.
 */
import { h } from '../../ui/dom.js';
import { card, button, select, dot } from '../../ui/controls.js';
import { icon } from '../../ui/icons.js';
import { prefersReducedMotion } from '../../ui/canvas-surface.js';
import { t, N_, fmt } from '../../i18n/index.js';
import { inspectCapture, inspectOutput, GATE, CAPTURE_PRE, SAMPLE_MS, DEFAULT_DEADZONE } from './spring.js';
import { lowPass, autoLegacy } from './legacy-filters.js';
import { springParams } from './spring-config.js';
import { GAMES, reboundPast } from './games.js';

const MAX_KEPT = 30;
/** A delay past this is shown as a problem (one crossing check's built-in cost, and a sample). */
const DELAY_WARN_MS = 3.5;
const FULL = 2048;
/** Time charts are drawn in this box and stretched to their size. */
const W = 320;
const GAME_KEY = 'hoja3.snapback.game';
/** Slow motion: a recording (128 ms) plays this many times slower, then rests a moment before it repeats. */
const PLAY_SLOWER = 20;
const PLAY_REST_MS = 900;

const KINDS = {
  letgo: N_('Let go from the edge'),
  turnaround: N_('Let go from partway'),
  flick: N_('Flick across'),
  dashback: N_('Across and back'),
  other: N_('Other move'),
};
/** What each kind of move was, in plain words. */
const KIND_INFO = {
  letgo: N_('You pushed the stick all the way out and let go. It springs back and bounces past center: that bounce is snapback, and the filter should hide it.'),
  turnaround: N_('You let go before the stick reached the edge. Same as a let-go, with a smaller bounce.'),
  flick: N_('You moved the stick from one side to the other and held it there, like a dash back. The filter must let this through right away.'),
  dashback: N_('You flicked to the other side and back again, like a dash dance. Both moves should come through right away.'),
  other: N_('A move that isn’t a let-go or a flick, such as a slow push or a circle.'),
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

/** The direction the stick was pushed: its furthest point before it came back. */
function pushDirection(c) {
  let best = -1; let at = 0;
  for (let i = 0; i < Math.min(CAPTURE_PRE, c.x.length); i++) {
    const d = Math.hypot(c.x[i], c.y[i]);
    if (d > best) { best = d; at = i; }
  }
  const n = best || 1;
  return { ux: c.x[at] / n, uy: c.y[at] / n, x: c.x[at], y: c.y[at] };
}

/**
 * @param {{session: object, tone: string}} o
 * @returns {{el: HTMLElement, add: (c: object) => void, setArmed: (stick: string|null) => void,
 *   live: (pos: object) => void, destroy: () => void}}
 */
export function analyzer({ session, tone }) {
  const kept = [];        // newest first
  let shown = null;
  let filter = 'all';
  let game = storedGame();
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
      if (shown) draw(shown, { keepPlaying: true }); else paintSummary(null, gameLines(), null);
    },
  });
  const title = h('div.an-title');
  const kindInfo = h('p.an-kind-info.small.muted');
  const stats = h('div.an-stats');
  const timeline = h('p.an-timeline.small');
  /** Shown where a value will be, until there is one (so nothing changes height when it arrives). */
  const NONE = '–';

  // ---- Path view ------------------------------------------------------------------------------
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
  const pathSvg = h('svg.an-pathview', { viewBox: '-112 -112 224 224', role: 'img', 'aria-label': t('The stick’s path, and what the game sees') },
    h('circle.an-gate', { cx: 0, cy: 0, r: R }), dzCircle,
    h('line.an-axis', { x1: -R, y1: 0, x2: R, y2: 0 }), h('line.an-axis', { x1: 0, y1: -R, x2: 0, y2: R }),
    pathGame, pathOut, pathRaw, startMark, endMark, markOut, markRaw, liveDot);

  // ---- Time views -------------------------------------------------------------------------------
  function timeChart(cls, height) {
    const svg = h(`svg.an-chart.${cls}`, { viewBox: `0 0 ${W} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const cursor = h('line.an-cursor', { y1: 0, y2: height });
    const labels = h('div.an-labels');
    const wrap = h('div.an-chart-wrap', svg, labels);
    return { svg, height, cursor, labels, wrap };
  }
  const wave = timeChart('wave', 120);
  const xs = timeChart('xy', 60);
  const ys = timeChart('xy', 60);
  const strips = [timeChart('strip', 10), timeChart('strip', 10)];
  const axisLabels = () => h('div.an-axis-labels.small.faint', h('span', ms(span(0))), h('span', { title: t('0 = back under 500') }, ms(0)), h('span', ms(span(256))));
  const stateKey = () => h('div.an-key.small',
    ...[GATE.DECIDING, GATE.CHECKING, GATE.HOLDING].map((s) => h(`span.an-swatch.${STATE_CLASS[s]}`, t(STATES[s]))));

  // A tiny key in each view's corner: only what that view draws
  const pathKey = h('div.an-key.small', h('span.an-swatch.raw', t('Stick')), h('span.an-swatch.out', t('Game')), h('span.an-swatch.live', t('Now')));
  // The game's frames: in the keys of the time views while a game is picked
  const frameKeys = [0, 1].map(() => h('span.an-swatch.frame', { title: t('The game reads the stick once a frame. Where its frames fall against your stick varies, so this shows their spacing.') }));
  const waveKey = h('div.an-key.small', h('span.an-swatch.raw-line', t('Stick')), h('span.an-swatch.out', t('Game')), h('span.an-swatch.held', t('Held')), frameKeys[0]);
  const xyKey = h('div.an-key.small', h('span.an-swatch.raw-line', t('Stick')), h('span.an-swatch.out', t('Game')), frameKeys[1]);

  const waveStateKey = stateKey();
  const playBtn = button({ icon: 'play', variant: 'ghost', size: 'sm', label: t('Slow motion'), class: 'an-play', disabled: true, onClick: () => (playing ? pause() : play()) });
  const growButtons = {};
  function panel(key, heading, tools, ...body) {
    const grow = button({ variant: 'ghost', size: 'sm', title: t('Make this view larger'), class: 'an-grow', onClick: () => setBig(key) });
    grow.replaceChildren(expandGlyph());
    growButtons[key] = grow;
    return h('div.an-panel', { 'data-view': key },
      h('div.an-panel-head', h('span.an-panel-title.small', heading), h('span.spacer'), tools, grow), ...body);
  }
  const panels = {
    path: panel('path', t('Stick path'), playBtn, pathSvg, pathKey),
    wave: panel('wave', t('Snapback wave'), null,
      h('div.an-times.wave', wave.wrap, strips[0].wrap, axisLabels()), waveKey, waveStateKey),
    xy: panel('xy', t('X and Y over time'), null,
      h('div.an-times.xy', h('span.an-chart-label.small.faint', 'X'), xs.wrap, h('span.an-chart-label.small.faint', 'Y'), ys.wrap, strips[1].wrap, axisLabels()), xyKey),
  };
  const views = h('div.an-views', panels.path, panels.wave, panels.xy);
  /** One view grows (smoothly, in place) and the others shrink beside it. */
  function setBig(key) {
    views.dataset.big = key;
    // The wave and X and Y share the right side: the large one takes it, the other folds to its title
    const folded = key === 'wave' ? 'xy' : key === 'xy' ? 'wave' : null;
    for (const [k, p] of Object.entries(panels)) {
      p.classList.toggle('is-big', k === key);
      p.classList.toggle('is-folded', k === folded);
      growButtons[k].disabled = k === key;
    }
  }
  setBig('wave');

  const readout = h('p.an-readout.small', { 'aria-live': 'polite' }, t('Push either stick out and let it go, or flick it across: it shows up here.'));

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

  // The views stay put at the top; the summary goes under them, every part of it always there (with
  // placeholders until the first recording), so nothing changes height when a recording arrives
  const details = h('div.an-details', h('div.an-head', title, kindInfo), stats, timeline, nav);
  const body = h('div.an-body', views, readout, details);
  /** Animate the details' height from h0 to what it is now (a recording changes what they hold). */
  let grow = null;
  function settle(h0) {
    const h1 = details.offsetHeight;
    if (h0 === h1 || prefersReducedMotion() || !details.isConnected) return;
    grow?.cancel();
    grow = details.animate([{ height: `${h0}px`, opacity: h1 > h0 ? 0.4 : 1 }, { height: `${h1}px`, opacity: 1 }],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
  const el = card({
    title: t('Analyzer'), subtitle: t('What the stick did, against what the game sees.'),
    icon: 'bolt', tone, class: 'sb-analyzer an', actions: h('div.an-actions', listening, gameSelect, download),
  }, body);

  // ---- Drawing ----------------------------------------------------------------------------------
  const xAt = (i, n) => (i / (n - 1)) * W;
  const yAt = (v, height) => height / 2 - (Math.max(-FULL, Math.min(FULL, v)) / FULL) * (height / 2 - 3);
  const polyline = (vals, height, cls) => h('polyline', { class: cls, points: vals.map((v, i) => `${xAt(i, vals.length).toFixed(1)},${yAt(v, height).toFixed(1)}`).join(' ') });
  /** The area between a signed curve and zero, on one side only. */
  const area = (vals, height, sign, cls) => {
    const n = vals.length;
    const pts = vals.map((v, i) => `${xAt(i, n).toFixed(1)},${yAt(sign > 0 ? Math.max(0, v) : Math.min(0, v), height).toFixed(1)}`);
    return h('polygon', { class: cls, points: `0,${yAt(0, height)} ${pts.join(' ')} ${W},${yAt(0, height)}` });
  };
  const gameLines = () => GAMES.find((g) => g.id === game)?.lines || [];
  /** A label on a chart's line, at its height (the chart stretches, so these are HTML over it). */
  const lineLabel = (text, v, height, kind) => h('span', { class: `an-line-label ${kind}`, style: { top: `${(yAt(v, height) / height) * 100}%` } }, text);

  /** Title and stats: always the same tiles, a placeholder where there's nothing (yet) to show. */
  function paintSummary(e, lines, dir) {
    const a = e?.a;
    title.replaceChildren(e ? h('span.an-stick', t(STICK_NAME[e.stick])) : h('span.an-stick.muted', t('No recording yet')),
      h('span.an-kind', { class: e ? '' : 'muted' }, e ? t(KINDS[a.kind]) : NONE),
      e ? h('span.an-filter.small.muted', filterName(e.filter)) : null);
    kindInfo.textContent = e ? t(KIND_INFO[a.kind]) : t('Each recording is named by the move you made, with what it means here.');
    const stat = (label, value, cls = '') => h('div.an-stat', { class: value === NONE ? `${cls} muted` : cls }, h('span.an-stat-label', label), h('span.an-stat-value', value));
    const on = !!a?.g;
    const d = on ? a.r.delayMs : undefined;
    const g = GAMES.find((x) => x.id === game);
    // A let-go with a game picked: would its rebound have counted there?
    let verdict = [NONE, ''];
    if (!lines.length) verdict = [t('No game lines'), 'muted'];
    else if (on && (a.kind === 'letgo' || a.kind === 'turnaround')) {
      const worstLine = reboundPast(a.g, dir, lines).filter((v) => v.samples).pop();
      verdict = worstLine ? [t('Past {line} for {time}', { line: t(LINE_NAMES[worstLine.line.label]), time: ms(worstLine.samples * SAMPLE_MS) }), worstLine.line.kind === 'action' ? 'warn' : '']
        : [t('No input: the rebound stays under every line'), 'good'];
    }
    stats.replaceChildren(
      stat(t('Delay'), !on ? NONE : d == null ? t('None (let go)') : d ? ms(d) : t('None'), d > DELAY_WARN_MS ? 'warn' : d == null ? 'muted' : 'good'),
      stat(t('Held'), !on ? NONE : a.heldMs ? ms(a.heldMs) : t('Not held')),
      stat(t('Rebound held back'), on && a.heldMs ? t('{n}%', { n: fmt.number(Math.round((a.peakBlocked / FULL) * 100)) }) : NONE),
      stat(t('How the hold ended'), e && !on ? t('Filter off') : on && a.main ? t(REASONS[a.main]) : on && e.filter.mode === 'lowpass' ? t('Low-pass: smooths, never holds') : NONE, `wide${e && !on ? ' muted' : ''}`),
      stat(g && lines.length ? g.name : t('Game'), verdict[0], `wide ${verdict[1]}`));
  }

  function draw(e, { keepPlaying = false } = {}) {
    shown = e;
    const { c, a, dz } = e;
    const n = c.x.length;
    const lines = gameLines();
    const dir = pushDirection(c);
    grow?.cancel();
    const h0 = details.offsetHeight;
    paintSummary(e, lines, dir);

    // Path: the game's lines, the output under the stick, the stick coloured from early (blue) to late (red)
    dzCircle.setAttribute('r', px(dz).toFixed(1));
    pathGame.replaceChildren(...lines.map((l) => {
      const name = t(LINE_NAMES[l.label]);
      if (l.shape !== 'axis') {
        return h('g', { class: `an-game-line ${l.kind}` }, h('circle', { cx: 0, cy: 0, r: l.v * R }),
          h('text', { x: 0, y: -l.v * R - 2, 'text-anchor': 'middle' }, name));
      }
      const at2 = l.v * R;
      const half = Math.sqrt(Math.max(0, R * R - at2 * at2));
      return h('g', { class: `an-game-line ${l.kind}` },
        ...[-1, 1].flatMap((s) => [h('line', { x1: s * at2, x2: s * at2, y1: -half, y2: half }), h('line', { y1: s * at2, y2: s * at2, x1: -half, x2: half })]),
        h('text', { x: at2 + 2, y: -half + 6 }, name));
    }));
    const pt = (x, y) => `${px(x).toFixed(1)},${(-px(y)).toFixed(1)}`;
    outPts = a.g ? Array.from(a.g.x, (x, i) => pt(x, a.g.y[i])) : [];
    pathOut.setAttribute('points', outPts.join(' '));
    const segs = [];
    for (let i = 1; i < n; i++) {
      segs.push(h('line', {
        x1: px(c.x[i - 1]).toFixed(1), y1: (-px(c.y[i - 1])).toFixed(1), x2: px(c.x[i]).toFixed(1), y2: (-px(c.y[i])).toFixed(1),
        style: `stroke: color-mix(in srgb, var(--red) ${Math.round((i / (n - 1)) * 100)}%, var(--blue))`,
      }));
    }
    pathRaw.replaceChildren(...segs);
    segLines = segs;
    revealed = segs.length;
    startMark.setAttribute('cx', px(c.x[0]).toFixed(1)); startMark.setAttribute('cy', (-px(c.y[0])).toFixed(1));
    endMark.setAttribute('cx', px(c.x[n - 1]).toFixed(1)); endMark.setAttribute('cy', (-px(c.y[n - 1])).toFixed(1));

    // The game's frames, counted from 0 (back under 500) both ways
    const hz = GAMES.find((x) => x.id === game)?.hz;
    const frameAt = [];
    if (hz) {
      const step = 1000 / hz / SAMPLE_MS;
      for (let i = CAPTURE_PRE % step; i < n; i += step) frameAt.push(i);
    }
    for (const k of frameKeys) {
      k.hidden = !hz;
      k.textContent = hz ? t('Frames ({time} each)', { time: ms(1000 / hz) }) : '';
    }
    const frames = (height) => frameAt.map((i) => h('line.an-frame', { x1: xAt(i, n), x2: xAt(i, n), y1: 0, y2: height }));

    // Along the push: the wave, each side shaded its own colour, the deadzone band, the game's lines
    const along = (xs2, ys2) => Array.from(xs2, (x, i) => x * dir.ux + ys2[i] * dir.uy);
    const rawA = along(c.x, c.y);
    const wParts = [
      h('rect.an-dz', { x: 0, width: W, y: yAt(dz, wave.height), height: yAt(-dz, wave.height) - yAt(dz, wave.height) }),
      h('line.an-mid', { x1: 0, x2: W, y1: wave.height / 2, y2: wave.height / 2 }),
      ...frames(wave.height),
    ];
    if (a.g) for (const [s0, s1] of a.r.held) wParts.push(h('rect.an-held', { x: xAt(s0, n), width: Math.max(1, xAt(s1, n) - xAt(s0, n)), y: 0, height: wave.height }));
    wParts.push(area(rawA, wave.height, 1, 'an-area pushed'), area(rawA, wave.height, -1, 'an-area other'));
    for (const l of lines) for (const s of [-1, 1]) wParts.push(h('line', { class: `an-game-line ${l.kind}`, x1: 0, x2: W, y1: yAt(s * l.v * FULL, wave.height), y2: yAt(s * l.v * FULL, wave.height) }));
    wParts.push(polyline(rawA, wave.height, 'an-line raw'));
    if (a.g) wParts.push(polyline(along(a.g.x, a.g.y), wave.height, 'an-line out'));
    wave.svg.replaceChildren(...wParts, wave.cursor);
    wave.labels.replaceChildren(
      h('span.an-side.pushed', { style: { top: '4px' } }, t('+ Pushed side')),
      h('span.an-side.other', { style: { bottom: '4px' } }, t('− Other side')),
      ...lines.map((l) => lineLabel(t(LINE_NAMES[l.label]), -l.v * FULL, wave.height, l.kind)));

    // X and Y over time, with the game's lines either side of centre
    for (const [chart, axisVals, outVals] of [[xs, c.x, a.g?.x], [ys, c.y, a.g?.y]]) {
      chart.svg.replaceChildren(h('line.an-mid', { x1: 0, x2: W, y1: chart.height / 2, y2: chart.height / 2 }), ...frames(chart.height),
        ...lines.flatMap((l) => [-1, 1].map((s) => h('line', { class: `an-game-line ${l.kind}`, x1: 0, x2: W, y1: yAt(s * l.v * FULL, chart.height), y2: yAt(s * l.v * FULL, chart.height) }))),
        polyline(Array.from(axisVals), chart.height, 'an-line raw'),
        ...(outVals ? [polyline(Array.from(outVals), chart.height, 'an-line out')] : []), chart.cursor);
    }

    // What the filter was doing: a band per state, a tick at every decision
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
      // (the low-pass filter has no states: it only smooths)
      strip.wrap.style.display = a.g && e.filter.mode !== 'lowpass' ? '' : 'none';
    }
    // The filter's decisions in one line: time, what happened, in order
    waveStateKey.hidden = !a.g || e.filter.mode === 'lowpass';
    timeline.replaceChildren(...(a.g ? a.exits : []).flatMap((ex, i) => [
      i ? h('span.an-arrow', '→') : null,
      h('span.an-event', { class: ex.start ? 'start' : 'end' }, h('span.an-event-t', ms(span(ex.at))), ' ', t(REASONS[ex.why]))]).filter(Boolean));
    if (!a.g || !a.exits.length) timeline.replaceChildren(h('span.faint', t('The filter’s decisions show up here.')));

    paintNav();
    settle(h0);
    playBtn.disabled = false;
    // A new recording plays back in slow motion on its own (not with reduced motion)
    if (prefersReducedMotion()) { pause(); scrub(at >= 0 && at < n ? at : -1); } else if (!keepPlaying) play();
    else if (!playing) { reveal(segLines.length); scrub(at >= 0 && at < n ? at : -1); }
    // (still playing a redrawn recording: the next frame carries on where it was)
  }

  /** Move the scrubber to sample i (-1: hide it). */
  function scrub(i) {
    at = i;
    const e = shown;
    const on = e && i >= 0;
    for (const ch of [wave, xs, ys, ...strips]) {
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
  for (const box of [panels.wave.querySelector('.an-times'), panels.xy.querySelector('.an-times')]) {
    const from = (ev) => {
      const r = box.getBoundingClientRect();
      if (!shown || !r.width) return;
      scrub(Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (shown.c.x.length - 1)));
    };
    box.addEventListener('pointerdown', (ev) => { box.setPointerCapture?.(ev.pointerId); pause(); from(ev); });
    box.addEventListener('pointermove', (ev) => { if (ev.buttons || (ev.pointerType === 'mouse' && !playing)) from(ev); });
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
    const lo = Math.max(0, Math.min(i, revealed)); const hi = Math.min(segLines.length, Math.max(i, revealed));
    for (let j = lo; j < hi; j++) segLines[j].classList.toggle('ahead', j >= i);
    if (i !== revealed) pathOut.setAttribute('points', outPts.slice(0, Math.max(0, i) + 1).join(' '));
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
    // Ask for the next frame first, so nothing in this one can stop the loop
    playFrame = requestAnimationFrame(tick);
    const n = shown.c.x.length;
    const length = n * SAMPLE_MS * PLAY_SLOWER;
    // A frame's time can be a little before the recording arrived (playT0): count that as the start
    const into = Math.max(0, now - playT0) % (length + PLAY_REST_MS);
    const i = Math.max(0, Math.min(n - 1, Math.floor((into / length) * (n - 1))));
    reveal(i);
    scrub(i);
  }

  // ---- Live: where the stick is now -----------------------------------------------------------
  let liveStick = null;
  let livePos = null;
  let liveFrame = 0;
  function paintLive() {
    liveFrame = 0;
    const p = livePos?.[shown?.stick || liveStick];
    liveDot.style.display = p ? '' : 'none';
    if (p) liveDot.setAttribute('transform', `translate(${px(p[0]).toFixed(1)} ${(-px(p[1])).toFixed(1)})`);
  }

  /** The filter a stick is on (l/r_snapback_type: 0 low-pass, 1 or 3 Auto, 2 off; anything else the
   *  firmware runs as low-pass), and with Auto whether it has a tuning. */
  function stickFilter(stick, params) {
    const s = stick === 'left' ? 'l' : 'r';
    const type = session.config.analog?.[`${s}_snapback_type`];
    if (type === 2) return { mode: 'off' };
    if (type === 1 || type === 3) return { mode: params ? 'spring' : 'auto' };
    return { mode: 'lowpass', cutoff: session.config.analog?.[`${s}_snapback_intensity`] ?? 600 };
  }
  function filterName(f) {
    if (f.mode === 'spring') return t('Auto, tuned');
    if (f.mode === 'auto') return t('Auto, not tuned');
    if (f.mode === 'lowpass') return t('Low-pass {hz} Hz', { hz: fmt.number(Math.max(300, Math.min(1500, f.cutoff)) / 10, { maximumFractionDigits: 1 }) });
    return t('Filter off');
  }

  /** Download every kept recording: JSON lines, the tuning recordings' format plus the replay's delay. */
  function save() {
    const out = kept.map((e) => JSON.stringify({
      label: 'analyzer', stick: e.stick, number: e.c.number, period_us: SAMPLE_MS * 1000, pre: CAPTURE_PRE, time: e.time / 1000,
      deadzone: e.dz, filter: e.filter, tuned: !!e.params, params: e.params, delayMs: e.a.r ? e.a.r.delayMs : null, x: Array.from(e.c.x), y: Array.from(e.c.y),
    }));
    const blob = new Blob([`${out.join('\n')}\n`], { type: 'application/x-ndjson' });
    const link = h('a', { href: URL.createObjectURL(blob), download: `analyzer-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  paintSummary(null, gameLines(), null);
  paintNav();

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
    add(c) {
      const stick = c.stick === 1 ? 'right' : 'left';
      const params = springParams(session, stick);
      const dz = session.config.analog?.[stick === 'left' ? 'l_deadzone' : 'r_deadzone'] || DEFAULT_DEADZONE;
      const sf = stickFilter(stick, params);
      const a = sf.mode === 'spring' ? inspectCapture(c, params, dz)
        : sf.mode === 'lowpass' ? inspectOutput(c, lowPass(c.x, c.y, { cutoff: sf.cutoff }), dz)
        : sf.mode === 'auto' ? (({ x, y, holding }) => inspectOutput(c, { x, y }, dz, holding))(autoLegacy(c.x, c.y))
        : inspectCapture(c, null, dz);
      const e = { c, stick, time: Date.now(), params, dz, filter: sf, a };
      kept.unshift(e);
      if (kept.length > MAX_KEPT) kept.pop();
      // The newest is always shown: one of another kind puts the kind filter back to all kinds (else a
      // filter left on would hide every new move)
      if (filter !== 'all' && e.a.kind !== filter) { filter = 'all'; kindSelect.value = 'all'; }
      draw(e);
    },
    destroy() {
      pause();
      cancelAnimationFrame(liveFrame);
    },
  };
}
