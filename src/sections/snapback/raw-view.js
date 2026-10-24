/**
 * raw-view.js: The Analyzer's full-speed view, on firmware that records a stick at full rate (0xF9).
 *
 * While the page is open the viewed stick is recorded whenever it comes back from a push (a let-go, or a
 * flick across centre): 256 samples of x/y at 2 kHz, 48 of them before it fell under 500. Each recording is
 * drawn as "What the stick did", and the app's exact copy of Auto's filter (spring.js) is replayed over it
 * with the stick's tuning and deadzone as they are now, drawn as "What the game sees". Stretches where the
 * output is held at centre while the stick is past the deadzone are shaded, and the delay on the side the
 * stick ends up is shown (spring.js replay). A stick that isn't using a tuning (not tuned, or not on
 * Auto) shows the stick alone and "filter not active".
 *
 * The last MAX_KEPT recordings stay in a list, worst delay first, and download as JSON lines in the tuning
 * recordings' format, so a bad one seen here can be replayed against the firmware's tools.
 */
import { h } from '../../ui/dom.js';
import { button } from '../../ui/controls.js';
import { t, fmt } from '../../i18n/index.js';
import { replay, CAPTURE_PRE, SAMPLE_MS, DEFAULT_DEADZONE } from './spring.js';
import { springParams } from './spring-config.js';

const MAX_KEPT = 50;
/** A delay past this is shown as a problem (one crossing check's built-in cost, and a sample). */
const DELAY_WARN_MS = 3.5;
const W = 320;
const H = 140;
const FULL = 2048;

export function rawView({ session, stick }) {
  const kept = [];
  let shown = null;

  const delay = h('span.sb-raw-delay');
  const download = button({ label: t('Download captures'), icon: 'download', variant: 'ghost', size: 'sm', disabled: true, onClick: save });
  const note = h('p.sb-raw-note.small.muted');
  const svg = h('svg.sb-raw-chart', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': t('What the stick did and what the game sees') });
  const legend = h('div.sb-raw-legend.small',
    h('span.sb-raw-key.raw', t('What the stick did')),
    h('span.sb-raw-key.out', t('What the game sees')),
    h('span.sb-raw-key.held', t('Held at center')));
  const axis = h('div.sb-raw-axis.small.faint', h('span', t('{n} ms', { n: fmt.number(0) })), h('span', t('{n} ms', { n: fmt.number(128) })));
  const list = h('div.sb-history.sb-raw-list', { role: 'list', 'aria-label': t('Full-speed captures, worst delay first') });
  const plot = h('div.sb-raw-plot', svg, axis, legend);
  const el = h('div.sb-raw',
    h('div.sb-head', h('strong.small', t('Full-speed capture')), h('span.spacer'), delay, download),
    note, plot, list);
  plot.hidden = true;

  const y = (v) => H / 2 - (Math.max(-FULL, Math.min(FULL, v)) / FULL) * (H / 2 - 4);
  const line = (vals, cls) => h('polyline', {
    class: cls, points: vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
  });

  function draw(e) {
    shown = e;
    const n = e.c.x.length;
    const xAt = (i) => (i / (n - 1)) * W;
    const parts = [
      h('rect.sb-raw-dz', { x: 0, width: W, y: y(e.dz), height: y(-e.dz) - y(e.dz) }),
      h('line.sb-raw-mid', { x1: 0, x2: W, y1: H / 2, y2: H / 2 }),
    ];
    if (e.r) {
      for (const [a, b] of e.r.held) parts.push(h('rect.sb-raw-held', { x: xAt(a), width: Math.max(1, xAt(b) - xAt(a)), y: 0, height: H }));
      parts.push(line(e.r.raw, 'sb-raw-line raw'), line(e.r.out, 'sb-raw-line out'));
    } else {
      // No replay: the stick alone, along the direction it was pushed
      const pk = e.c.x.slice(0, CAPTURE_PRE).reduce((best, x, i) => (Math.hypot(x, e.c.y[i]) > best.d ? { d: Math.hypot(x, e.c.y[i]), i } : best), { d: -1, i: 0 });
      const ux = e.c.x[pk.i] / (pk.d || 1); const uy = e.c.y[pk.i] / (pk.d || 1);
      parts.push(line(Array.from(e.c.x, (x, i) => x * ux + e.c.y[i] * uy), 'sb-raw-line raw'));
    }
    svg.replaceChildren(...parts);
    legend.classList.toggle('no-replay', !e.r);
    plot.hidden = false;
    delay.className = `sb-raw-delay ${!e.r ? 'muted' : e.r.delayMs > DELAY_WARN_MS ? 'warn' : 'good'}`;
    delay.textContent = !e.r ? t('Filter not active')
      : e.r.side === 0 ? t('Let go: no delay to measure')
        : e.r.delayMs ? t('Delay: {time}', { time: t('{n} ms', { n: fmt.number(e.r.delayMs, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) })
          : t('No delay');
    paintList();
  }

  function paintList() {
    const order = [...kept].sort((a, b) => (b.r?.delayMs ?? -1) - (a.r?.delayMs ?? -1));
    list.replaceChildren(...order.map((e) => h('button.sb-chip', {
      type: 'button', role: 'listitem', 'aria-pressed': String(e === shown), class: e.r && e.r.delayMs > DELAY_WARN_MS ? 'warn' : null,
      onclick: () => draw(e),
    }, h('span.sb-chip-dot'), !e.r ? '–' : e.r.side === 0 ? t('Let go')
      : t('{n} ms', { n: fmt.number(e.r.delayMs, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }),
    h('span.faint', fmt.date(e.time, { minute: '2-digit', second: '2-digit' })))));
    download.disabled = !kept.length;
  }

  /** Download every kept capture: JSON lines, the tuning recordings' format plus the replay's delay. */
  function save() {
    const lines = kept.map((e) => JSON.stringify({
      label: 'analyzer', stick, number: e.c.number, period_us: SAMPLE_MS * 1000, pre: CAPTURE_PRE, time: e.time / 1000,
      deadzone: e.dz, tuned: !!e.params, delayMs: e.r ? e.r.delayMs : null, x: Array.from(e.c.x), y: Array.from(e.c.y),
    }));
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'application/x-ndjson' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `analyzer-${stick}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
      const e = { c, time: Date.now(), params, dz, r: params ? replay(c, params, dz) : null };
      kept.unshift(e);
      if (kept.length > MAX_KEPT) kept.pop();
      draw(e);
    },
  };
}
