/**
 * raw-view.js: The Analyzer's full-speed view, on firmware that records a stick at full rate (0xF9).
 *
 * While the page is open the viewed stick is recorded whenever it comes back from a push (a let-go, or a
 * flick across centre): 256 samples of x/y at 2 kHz, 48 of them before it fell under 500. The app's exact
 * copy of Auto's filter (spring.js) is replayed over each recording with the stick's tuning and deadzone as
 * they are now ("What the game sees"), next to the stick itself ("What the stick did"):
 *   - the path in the gate (2D, coloured by time; start and end marked; the deadzone circle)
 *   - distance from centre over time, with the deadzone and the stretches held at centre while the stick
 *     is out, and X and Y over time underneath
 *   - a strip with what the filter was doing (deciding, checking, holding) and why each decision or hold
 *     ended, so it's clear which rule acted
 *   - a scrubber: dragging across the time charts moves a marker on every view, with a readout
 *   - a summary: kind (from the stick's path), delay, time held, the furthest rebound blocked and the
 *     reason that ended the longest hold
 * A stick that isn't using a tuning (not tuned, or not on Auto) shows the stick alone and "filter not active".
 *
 * The last MAX_KEPT recordings stay in a list, worst delay first, filterable by kind, and download as JSON
 * lines in the tuning recordings' format, with the tuning and deadzone they were replayed with, so a bad
 * one seen here can be replayed against the firmware's tools. The trace is worked out on display, not kept.
 */
import { h } from '../../ui/dom.js';
import { button, select } from '../../ui/controls.js';
import { t, N_, fmt } from '../../i18n/index.js';
import { inspectCapture, GATE, CAPTURE_PRE, SAMPLE_MS, DEFAULT_DEADZONE } from './spring.js';
import { springParams } from './spring-config.js';

const MAX_KEPT = 50;
/** A delay past this is shown as a problem (one crossing check's built-in cost, and a sample). */
const DELAY_WARN_MS = 3.5;
const FULL = 2048;
/** Time charts: drawn in this box and stretched to the width. */
const W = 320;

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

const ms = (v) => t('{n} ms', { n: fmt.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });

export function rawView({ session, stick }) {
  const kept = [];
  let shown = null;
  let filter = 'all';
  let at = -1;  // scrubber sample

  // ---- Summary and actions ----------------------------------------------------------------------
  const download = button({ label: t('Download captures'), icon: 'download', variant: 'ghost', size: 'sm', disabled: true, onClick: save });
  const note = h('p.sb-raw-note.small.muted');
  const summary = h('div.sb-raw-summary');

  // ---- Path (2D) --------------------------------------------------------------------------------
  const R = 100;
  const px = (v) => (v / FULL) * R;
  const pathOut = h('polyline.sb-raw-path-out');
  const pathRaw = h('g.sb-raw-path-raw');
  const dzCircle = h('circle.sb-raw-path-dz', { cx: 0, cy: 0 });
  const startMark = h('circle.sb-raw-start', { r: 4 });
  const endMark = h('circle.sb-raw-end', { r: 4 });
  const markRaw = h('circle.sb-raw-mark-raw', { r: 5 });
  const markOut = h('circle.sb-raw-mark-out', { r: 5 });
  const path = h('svg.sb-raw-pathview', { viewBox: '-110 -110 220 220', role: 'img', 'aria-label': t('The stick’s path, and what the game sees') },
    h('circle.sb-raw-gate', { cx: 0, cy: 0, r: R }), dzCircle,
    h('line.sb-raw-axis', { x1: -R, y1: 0, x2: R, y2: 0 }), h('line.sb-raw-axis', { x1: 0, y1: -R, x2: 0, y2: R }),
    pathOut, pathRaw, startMark, endMark, markOut, markRaw);

  // ---- Time charts --------------------------------------------------------------------------------
  function timeChart(height, cls) {
    const svg = h(`svg.sb-raw-chart.${cls}`, { viewBox: `0 0 ${W} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const cursor = h('line.sb-raw-cursor', { y1: 0, y2: height });
    return { svg, height, cursor };
  }
  const dist = timeChart(90, 'dist');
  const xs = timeChart(44, 'xy');
  const ys = timeChart(44, 'xy');
  const strip = timeChart(12, 'strip');
  // Times count from the moment the stick fell under 500 (where the controller starts the recording's rest)
  const span = (n) => (n - CAPTURE_PRE) * SAMPLE_MS;
  const axis = h('div.sb-raw-axis-labels.small.faint', h('span', ms(span(0))), h('span', t('0 = back under 500')), h('span', ms(span(256))));
  const times = h('div.sb-raw-times',
    h('span.sb-raw-chart-label.small.muted', t('Distance from center')), dist.svg,
    h('div.sb-raw-xy', h('div', h('span.sb-raw-chart-label.small.muted', 'X'), xs.svg), h('div', h('span.sb-raw-chart-label.small.muted', 'Y'), ys.svg)),
    h('span.sb-raw-chart-label.small.muted', t('What the filter was doing')), strip.svg, axis);
  const readout = h('p.sb-raw-readout.small', { 'aria-live': 'polite' });
  const exitsList = h('ol.sb-raw-exits.small');
  const legend = h('div.sb-raw-legend.small',
    h('span.sb-raw-key.raw', t('What the stick did')),
    h('span.sb-raw-key.out', t('What the game sees')),
    h('span.sb-raw-key.held', t('Held at center')));
  const stateKey = h('div.sb-raw-legend.small',
    ...[GATE.DECIDING, GATE.CHECKING, GATE.HOLDING].map((s) => h(`span.sb-raw-key.state.${STATE_CLASS[s]}`, t(STATES[s]))));
  const views = h('div.sb-raw-views', path, times);
  const plot = h('div.sb-raw-plot', summary, views, readout, legend, stateKey, exitsList);
  plot.hidden = true;

  // ---- List -----------------------------------------------------------------------------------------
  const kindSelect = select({
    options: [{ value: 'all', label: t('All kinds') }, ...Object.entries(KINDS).map(([value, label]) => ({ value, label: t(label) }))],
    value: 'all', ariaLabel: t('Show captures of this kind'), onChange: (v) => { filter = v; paintList(); },
  });
  const list = h('div.sb-history.sb-raw-list', { role: 'list', 'aria-label': t('Full-speed captures, worst delay first') });

  const listHead = h('div.sb-raw-listhead', kindSelect);
  listHead.hidden = true;
  const el = h('div.sb-raw',
    h('div.sb-head', h('strong.small', t('Full-speed capture')), h('span.spacer'), download),
    note, plot, listHead, list);

  // ---- Drawing --------------------------------------------------------------------------------------
  const line = (vals, height, lo, hi, cls) => {
    const n = vals.length;
    const yOf = (v) => height - 2 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (height - 4);
    return h('polyline', { class: cls, points: vals.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ') });
  };
  const xAt = (i, n) => (i / (n - 1)) * W;

  function draw(e) {
    shown = e;
    const { c, a, dz } = e;
    const n = c.x.length;
    // Summary
    const facts = [h('span.sb-raw-kind', t(KINDS[a.kind]))];
    if (!a.g) facts.push(h('span.sb-raw-fact.muted', t('Filter not active')));
    else {
      const d = a.r.delayMs;
      facts.push(h('span.sb-raw-fact', { class: d == null ? 'muted' : d > DELAY_WARN_MS ? 'warn' : 'good' },
        d == null ? t('Let go: no delay to measure') : d ? t('Delay: {time}', { time: ms(d) }) : t('No delay')));
      if (a.heldMs) {
        facts.push(h('span.sb-raw-fact', t('Held {time}', { time: ms(a.heldMs) })));
        facts.push(h('span.sb-raw-fact', t('Rebound blocked: {n}%', { n: fmt.number(Math.round((a.peakBlocked / FULL) * 100)) })));
      }
      if (a.main) facts.push(h('span.sb-raw-fact.muted', t(REASONS[a.main])));
    }
    summary.replaceChildren(...facts);

    // Path: the output under the stick, the stick coloured from early (blue) to late (red)
    dzCircle.setAttribute('r', px(dz).toFixed(1));
    const pt = (x, y) => `${px(x).toFixed(1)},${(-px(y)).toFixed(1)}`;
    pathOut.setAttribute('points', a.g ? Array.from(a.g.x, (x, i) => pt(x, a.g.y[i])).join(' ') : '');
    const segs = [];
    for (let i = 1; i < n; i++) {
      segs.push(h('line', {
        x1: px(c.x[i - 1]).toFixed(1), y1: (-px(c.y[i - 1])).toFixed(1), x2: px(c.x[i]).toFixed(1), y2: (-px(c.y[i])).toFixed(1),
        style: `stroke: color-mix(in srgb, var(--red) ${Math.round((i / (n - 1)) * 100)}%, var(--blue))`,
      }));
    }
    pathRaw.replaceChildren(...segs);
    startMark.setAttribute('cx', px(c.x[0]).toFixed(1)); startMark.setAttribute('cy', (-px(c.y[0])).toFixed(1));
    endMark.setAttribute('cx', px(c.x[n - 1]).toFixed(1)); endMark.setAttribute('cy', (-px(c.y[n - 1])).toFixed(1));

    // Distance over time: deadzone, held shading, stick and output
    const yD = (v) => dist.height - 2 - (Math.min(FULL, v) / FULL) * (dist.height - 4);
    const dParts = [h('rect.sb-raw-dz', { x: 0, width: W, y: yD(dz), height: dist.height - yD(dz) })];
    if (a.g) for (const [s0, s1] of a.r.held) dParts.push(h('rect.sb-raw-held', { x: xAt(s0, n), width: Math.max(1, xAt(s1, n) - xAt(s0, n)), y: 0, height: dist.height }));
    dParts.push(line(a.rawD, dist.height, 0, FULL, 'sb-raw-line raw'));
    if (a.g) dParts.push(line(a.outD, dist.height, 0, FULL, 'sb-raw-line out'));
    dist.svg.replaceChildren(...dParts, dist.cursor);
    for (const [chart, axisVals, outVals] of [[xs, c.x, a.g?.x], [ys, c.y, a.g?.y]]) {
      chart.svg.replaceChildren(h('line.sb-raw-mid', { x1: 0, x2: W, y1: chart.height / 2, y2: chart.height / 2 }),
        line(Array.from(axisVals), chart.height, -FULL, FULL, 'sb-raw-line raw'),
        ...(outVals ? [line(Array.from(outVals), chart.height, -FULL, FULL, 'sb-raw-line out')] : []), chart.cursor);
    }

    // What the filter was doing: a band per state, a tick at every exit
    const sParts = [];
    if (a.g) {
      let from = 0;
      for (let i = 1; i <= n; i++) {
        if (i < n && a.g.state[i] === a.g.state[from]) continue;
        const cls = STATE_CLASS[a.g.state[from]];
        if (cls) sParts.push(h(`rect.sb-raw-state.${cls}`, { x: xAt(from, n), width: Math.max(1, xAt(i, n) - xAt(from, n)), y: 0, height: strip.height }));
        from = i;
      }
      for (const ex of a.exits) sParts.push(h('line.sb-raw-tick', { x1: xAt(ex.at, n), x2: xAt(ex.at, n), y1: 0, y2: strip.height }));
    }
    strip.svg.replaceChildren(...sParts, strip.cursor);
    exitsList.replaceChildren(...(a.g ? a.exits : []).map((ex) => h('li', { class: ex.start ? 'start' : 'end' },
      h('span.sb-raw-exit-t', ms(span(ex.at))), t(REASONS[ex.why]))));
    exitsList.hidden = !a.g || !a.exits.length;
    stateKey.hidden = !a.g;
    legend.classList.toggle('no-replay', !a.g);

    plot.hidden = false;
    scrub(at >= 0 && at < n ? at : -1);
    paintList();
  }

  /** Move the scrubber to sample i (-1: hide it). */
  function scrub(i) {
    at = i;
    const e = shown;
    const on = e && i >= 0;
    for (const ch of [dist, xs, ys, strip]) {
      ch.cursor.style.display = on ? '' : 'none';
      if (on) { const x = xAt(i, e.c.x.length).toFixed(1); ch.cursor.setAttribute('x1', x); ch.cursor.setAttribute('x2', x); }
    }
    markRaw.style.display = on ? '' : 'none';
    markOut.style.display = on && e.a.g ? '' : 'none';
    if (!on) { readout.textContent = t('Drag across the charts to follow the stick sample by sample.'); return; }
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
  function scrubFrom(ev) {
    const box = times.getBoundingClientRect();
    if (!shown || !box.width) return;
    const f = Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width));
    scrub(Math.round(f * (shown.c.x.length - 1)));
  }
  times.addEventListener('pointerdown', (ev) => { times.setPointerCapture?.(ev.pointerId); scrubFrom(ev); });
  times.addEventListener('pointermove', (ev) => { if (ev.buttons || ev.pointerType === 'mouse') scrubFrom(ev); });

  function paintList() {
    const order = kept.filter((e) => filter === 'all' || e.a.kind === filter)
      .sort((x, y) => (y.a.r?.delayMs ?? -1) - (x.a.r?.delayMs ?? -1));
    list.replaceChildren(...order.map((e) => h('button.sb-chip', {
      type: 'button', role: 'listitem', 'aria-pressed': String(e === shown),
      class: e.a.r && e.a.r.delayMs > DELAY_WARN_MS ? 'warn' : null, onclick: () => draw(e),
    }, h('span.sb-chip-dot'),
    !e.a.g ? '–' : e.a.r.delayMs == null ? t('Let go') : ms(e.a.r.delayMs),
    h('span.faint', t(KINDS[e.a.kind])))));
    download.disabled = !kept.length;
    listHead.hidden = !kept.length;
  }

  /** Download every kept capture: JSON lines, the tuning recordings' format plus the replay's delay. */
  function save() {
    const lines = kept.map((e) => JSON.stringify({
      label: 'analyzer', stick, number: e.c.number, period_us: SAMPLE_MS * 1000, pre: CAPTURE_PRE, time: e.time / 1000,
      deadzone: e.dz, tuned: !!e.params, params: e.params, delayMs: e.a.r ? e.a.r.delayMs : null, x: Array.from(e.c.x), y: Array.from(e.c.y),
    }));
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'application/x-ndjson' });
    const link = h('a', { href: URL.createObjectURL(blob), download: `analyzer-${stick}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return {
    el,
    /** Whether this stick is the one being recorded (only one is at a time). */
    setArmed(on) {
      note.textContent = on
        ? t('Recording this stick at full speed. Flick it or let it go: each one shows up here.')
        : t('Recording the other stick. Tap this column to record this one.');
    },
    add(c) {
      const params = springParams(session, stick);
      const dz = session.config.analog?.[stick === 'left' ? 'l_deadzone' : 'r_deadzone'] || DEFAULT_DEADZONE;
      const e = { c, time: Date.now(), params, dz, a: inspectCapture(c, params, dz) };
      kept.unshift(e);
      if (kept.length > MAX_KEPT) kept.pop();
      draw(e);
    },
  };
}
