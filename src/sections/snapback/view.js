/**
 * Snapback view.
 *
 * "Snapback" is the rebound past center when you let go of a stick: the spring flings it to the other
 * side for a few milliseconds, which games can read as a flick in the opposite direction.
 *
 * Layout: the shared left/right split (docs/SECTIONS.md "Left/right layouts") with each stick's
 * Snapback filter card: filter mode (l/r_snapback_type: Low-pass / Auto / Off) and the low-pass cutoff
 * (l/r_snapback_intensity, tenths of a Hz), written live through settingField (settings.js). On firmware
 * with the spring model, Auto shows the stick's tuning in place of the cutoff: tuned to this stick or not
 * (standard Auto), Tune (tune.js) and Reset tuning (spring-config.js). Narrow pages show one column at a
 * time with a Left/Right switch; single-stick builds show one column.
 *
 * Analyzer, on firmware that records a stick at full rate (analyzer.js): one card under both columns. The
 * controller records one stick at a time (device.armSpringCapture), so the page watches both on the live
 * stream and records whichever was last pushed out (while the other is near centre): the Analyzer follows
 * the stick that was last flicked or let go. The tuning dialog takes the recording over while it's open.
 *
 * Older firmware has only the controller's own analog dump (report 0xFA, waveform.js): there each column
 * keeps the previous Analyzer, that stick's latest dump (X or Y axis) with its stats and a short history.
 *
 * Deep link: #/snapback?stick=right selects that column (narrow) or scrolls to and highlights it (wide).
 */
import { h, loadStyles } from '../../ui/dom.js';
import { card, segmented, callout, badge, dot, button, asyncButton } from '../../ui/controls.js';
import { settingField } from '../../settings/field.js';
import { prefersReducedMotion } from '../../ui/canvas-surface.js';
import { waveformView, parseDump, analyze, AXES } from './waveform.js';
import { t, N_, fmt } from '../../i18n/index.js';
import { springStatus, resetSpring } from './spring-config.js';
import { tuneSpring } from './tune.js';
import { analyzer as fullAnalyzer } from './analyzer.js';
import { onInputReport } from '../../device/reports.js';

loadStyles(new URL('./snapback.css', import.meta.url));

const TONE = 'green';
const HISTORY = 6;            // captures kept per stick (older firmware's Analyzer)
/** The live stream: a stick this far out, with the recorded one near centre, takes the recording over. */
const TAKE_OVER = 1100;
const NEAR_CENTER = 600;
const WIDE_PX = 640;          // matches the .lr-split container query in css/components.css
const HIGHLIGHT_MS = 1200;    // matches the lr-flash animation
const NAME = { left: N_('Left'), right: N_('Right') };
const STICK_NAME = { left: N_('Left stick'), right: N_('Right stick') };

/** Short explanation shown in place of the cutoff when it does not apply (keeps both columns aligned). */
const MODE_NOTE = {
  1: N_('Auto watches for the moment you let go and holds back only the rebound. There is no cutoff to tune.'),
  2: N_('Filter off: the stick reports its raw output. Use this to see your stick’s natural snapback.'),
};

function stat(label, value, tip) {
  return h('div.sb-stat', { 'data-tip': tip }, h('span.sb-stat-label', label), h('span.sb-stat-value', value));
}

/**
 * Auto, on firmware with the spring model: whether it's tuned to this stick, and the way to tune it.
 * @returns {{el: HTMLElement, paint: () => void}}
 */
function springPanel(stick, { session, device, onTuned, onTuning }) {
  const state = h('div.sb-spring-state');
  let tuning = false;
  const reset = asyncButton({
    label: t('Reset tuning'), icon: 'refresh', variant: 'ghost', size: 'sm',
    run: async () => { const ok = await resetSpring(session, stick); paint(); return ok; },
  });
  const tune = button({
    label: t('Tune to my stick'), icon: 'sparkle', variant: 'tonal', size: 'sm',
    onClick: async () => {
      if (tuning) return; // a second press while the dialog opens
      tuning = true;
      onTuning(true);
      try { if (await tuneSpring({ session, device, stick })) { paint(); onTuned(stick); } } finally { tuning = false; onTuning(false); }
    },
  });
  function paint() {
    const tuned = springStatus(session, stick) === 'tuned';
    state.replaceChildren(
      badge(tuned ? t('Tuned to this stick') : t('Not tuned (standard Auto)'), tuned ? TONE : 'lavender'),
      h('span.muted.small', tuned
        ? t('Fitted to how this stick springs back. The same in every profile. Tune again after recalibrating the stick.')
        : t('Tuning takes about 2 minutes.')));
    tune.setLabel(tuned ? t('Tune again') : t('Tune to my stick'));
    // Reset fades in and out (it sits after Tune, so nothing else moves)
    clearTimeout(resetTimer);
    if (tuned && reset.hidden) { reset.hidden = false; reset.classList.remove('sb-leaving'); reset.classList.add('rise-in'); }
    else if (!tuned && !reset.hidden) {
      reset.classList.add('sb-leaving');
      resetTimer = setTimeout(() => { reset.hidden = true; reset.classList.remove('sb-leaving', 'rise-in'); }, 400);
    }
  }
  let resetTimer = 0;
  reset.hidden = springStatus(session, stick) !== 'tuned';
  paint();
  const el = h('div.sb-spring',
    h('p.sb-spring-about.small', t('Auto learns how this stick springs back, so it can hold back the rebound without slowing your own moves.')),
    state,
    h('div.sb-spring-actions', tune, reset));
  return { el, paint };
}

/**
 * One stick's column: header, filter card, and (older firmware) its own analyzer card.
 * @returns {{el: HTMLElement, add: (c: object) => void, destroy: () => void}}
 */
function stickColumn(stick, { session, device, onTuned, onTuning, fullSpeed }) {
  const right = stick === 'right';
  const stickName = t(STICK_NAME[stick]);

  // ---- Filter settings -----------------------------------------------------------------------
  const note = h('p.sb-mode-note.muted.small');
  let cutoff;
  let spring;
  const tunable = !!session.caps.snapbackSpring;
  const syncMode = (v) => {
    cutoff.hidden = v !== 0; // the cutoff is only used by the low-pass mode
    spring.el.hidden = !(tunable && v === 1);
    note.hidden = v === 0 || !spring.el.hidden;
    note.textContent = MODE_NOTE[v] ? t(MODE_NOTE[v]) : '';
  };
  const type = settingField(`snapback.${stick}Type`, { tone: TONE, stacked: true, onChange: syncMode });
  cutoff = settingField(`snapback.${stick}Intensity`, { tone: TONE, stacked: true });
  spring = springPanel(stick, { session, device, onTuned, onTuning });
  syncMode(type.control.value);

  const filterCard = card({
    title: t('Snapback filter'),
    icon: 'snapback', tone: TONE, class: 'sb-filter',
  }, type, cutoff, spring.el, note);

  if (fullSpeed) {
    // The Analyzer is one card under both columns (analyzer.js)
    const el = h('section.lr-col', { 'data-side': stick, 'aria-label': stickName },
      h('div.lr-col-head', h('span.lr-tag', stick === 'left' ? 'L' : 'R'), stickName), filterCard);
    return { el, refresh() { type.refresh(); syncMode(type.control.value); spring.paint(); }, add() {}, destroy() {} };
  }

  // ---- Analyzer (older firmware: the controller's own analog dump) -------------------------------
  const wave = waveformView({
    label: t('{stick}: snapback waveform', { stick: stickName }),
    emptyText: right ? t('Flick the right stick…') : t('Flick the left stick…'),
  });
  const axisBadge = h('span.sb-axis', h('span.muted.small', t('No capture yet')));
  const stats = h('div.sb-stats');
  const history = h('div.sb-history', { role: 'list', 'aria-label': right ? t('Recent right stick captures') : t('Recent left stick captures') });
  const status = h('span.sb-status', {
    'data-tip': right ? t('Waiting for the right stick to be flicked and released.') : t('Waiting for the left stick to be flicked and released.'),
  }, dot(TONE, true), t('Listening'));
  const captures = [];
  let shown = null;

  function show(c, animate = true) {
    shown = c;
    wave.show(c, animate);
    const ax = AXES[c.axis];
    axisBadge.replaceChildren(badge(ax.name, ax.color), h('span.muted.small', t(ax.label)));
    const a = analyze(c.samples);
    const pct = (v) => fmt.percent(v / 100);
    stats.replaceChildren(
      stat(t('Overshoot'), pct(a.overshoot), t('How far the stick swung past center to the other side after release. Lower is better.')),
      stat(t('Settled'), a.settledMs == null ? `> ${fmt.number(31)} ms` : `${fmt.number(a.settledMs, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ms`,
        t('Time until the stick stays within ±5 % of center.')),
      stat(t('Peak +'), pct(a.peakPos), t('Highest value recorded.')),
      stat(t('Peak −'), pct(a.peakNeg), t('Lowest value recorded.')));
    renderHistory();
  }

  function renderHistory() {
    history.replaceChildren(...captures.map((c) => {
      const ax = AXES[c.axis];
      return h('button.sb-chip', {
        type: 'button', role: 'listitem', class: `tone-${ax.color}`, 'aria-pressed': String(c === shown),
        title: t('{axis} at {time}', { axis: t(ax.label), time: fmt.date(c.time, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) }), onclick: () => show(c),
      }, h('span.sb-chip-dot'), ax.name, h('span.faint', fmt.date(c.time, { minute: '2-digit', second: '2-digit' })));
    }));
  }

  const analyzerCard = card({
    title: t('Analyzer'), subtitle: right ? t('What the right stick does in the 31 ms after you let go.') : t('What the left stick does in the 31 ms after you let go.'),
    icon: 'bolt', tone: TONE, actions: status, class: 'sb-analyzer',
  },
  h('div.sb-plot',
    h('div.sb-head', axisBadge, h('span.spacer'), stats),
    wave.el,
    history));

  const el = h('section.lr-col', { 'data-side': stick, 'aria-label': stickName },
    h('div.lr-col-head', h('span.lr-tag', stick === 'left' ? 'L' : 'R'), stickName),
    filterCard,
    analyzerCard);

  return {
    el,
    analyzer: analyzerCard,
    refresh() { type.refresh(); syncMode(type.control.value); spring.paint(); },
    add(c) {
      captures.unshift(c);
      captures.length = Math.min(captures.length, HISTORY);
      show(c);
      status.replaceChildren(dot(TONE, true), t('Captured'));
      status.dataset.tip = t('Flick again to compare. The last few captures stay below the plot.');
    },
    destroy() { wave.destroy(); },
  };
}

export function mount(root, ctx) {
  const { session, device } = ctx;
  const sticks = ['left', 'right'].filter((s) => session.caps[`${s}Stick`]);
  const single = sticks.length < 2;
  let active = sticks.includes(ctx.params.stick) ? ctx.params.stick : sticks[0];
  let highlightTimer = 0;
  let highlightFrame = 0;

  // After tuning, bring the Analyzer into view (a completion step: the next thing to do is flick it)
  const onTuned = (s) => {
    const card = full?.el || columns[s]?.analyzer;
    if (!card) return;
    pick(s);
    card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  };
  // The full-speed recording: one stick at a time, whichever was last pushed out; the tuning dialog has
  // it while open
  const rawOn = !!session.caps.snapbackSpring;
  const full = rawOn ? fullAnalyzer({ session, tone: TONE }) : null;
  let tuningOpen = false;
  let armed = null;
  function arm(stick) {
    if (!rawOn || tuningOpen || !stick) return;
    armed = stick;
    device.springCaptureHint?.({ stick, step: 'analyzer' });
    device.armSpringCapture(stick)?.catch?.(() => {});
    full.setArmed(stick);
  }
  const onTuning = (open) => {
    tuningOpen = open;
    if (open) full?.setArmed(null);
    else arm(armed || sticks[0]);
  };
  const columns = Object.fromEntries(sticks.map((s) => [s, stickColumn(s, { session, device, onTuned, onTuning, fullSpeed: rawOn })]));
  // The live stream: where the sticks are now (the Analyzer's live dot), and following the stick being
  // used: one pushed far out while the recorded one rests takes the recording over
  const stopLive = rawOn ? onInputReport(device, (r) => {
    const sb = r.sticks?.snapback;
    if (!sb) return;
    full.live({ left: [sb.lx, sb.ly], right: [sb.rx, sb.ry] });
    if (tuningOpen || sticks.length < 2) return;
    const d = { left: Math.hypot(sb.lx, sb.ly), right: Math.hypot(sb.rx, sb.ry) };
    for (const s of sticks) if (s !== armed && d[s] > TAKE_OVER && (!armed || d[armed] < NEAR_CENTER)) arm(s);
  }) : null;

  // ---- Left/right switch (narrow pages only; CSS hides it on wide ones) ------------------------
  // A capture for the hidden stick would otherwise go unnoticed on a phone, so offer a shortcut to it.
  const newCapture = h('button.sb-new', { type: 'button', hidden: true, onclick: () => pick(newCapture.dataset.side) });
  const stickSeg = !single && segmented({
    options: sticks.map((s) => ({ value: s, label: t(NAME[s]) })),
    value: active, tone: TONE, ariaLabel: t('Stick'),
    onChange: (v) => pick(v),
  });

  const split = h('div.lr-split.sb-split', { class: [`tone-${TONE}`, single ? 'single' : null].filter(Boolean) },
    !single && h('div.lr-switch', h('div.sb-switch', stickSeg, newCapture)),
    h('div.lr-cols', sticks.map((s) => columns[s].el)));

  const isWide = () => split.clientWidth >= WIDE_PX;

  function setActive(side) {
    if (!columns[side]) return false;
    const changed = side !== active;
    active = side;
    for (const s of sticks) columns[s].el.toggleAttribute('data-active', s === side);
    if (stickSeg) stickSeg.value = side;
    if (newCapture.dataset.side === side) newCapture.hidden = true;
    return changed;
  }

  /** User picked a stick (switch, shortcut or interacting with a column): reflect it in the URL. */
  function pick(side) {
    if (setActive(side)) ctx.setParams({ stick: side });
  }

  /** Deep link on a wide page: bring the column into view and flash it. */
  function highlight(side) {
    const col = columns[side]?.el;
    if (single || !col || !isWide()) return;
    // Both columns start level, so bringing the column's top into view shows the pair.
    const top = col.getBoundingClientRect().top;
    const minTop = parseFloat(getComputedStyle(col).scrollMarginTop) || 0;
    if (top < minTop || top > innerHeight * 0.5) {
      col.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    col.removeAttribute('data-highlight');
    void col.offsetWidth; // restart the animation
    col.setAttribute('data-highlight', '');
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => col.removeAttribute('data-highlight'), HIGHLIGHT_MS);
  }

  // On wide pages both columns are visible; whichever one you work in becomes the one shown when the
  // page narrows (and the one a shared link points at).
  for (const s of sticks) {
    columns[s].el.addEventListener('focusin', () => pick(s));
    columns[s].el.addEventListener('pointerdown', () => pick(s));
  }

  // ---- Captures ------------------------------------------------------------------------------
  const onDump = (e) => {
    const c = parseDump(e.detail);
    if (!c) return;
    const side = AXES[c.axis].stick;
    if (!columns[side]) return; // axis this build doesn't have
    columns[side].add(c);
    if (!single && side !== active && !isWide()) {
      newCapture.dataset.side = side;
      newCapture.replaceChildren(dot(TONE, true), side === 'right' ? t('New right stick capture') : t('New left stick capture'), h('span.sb-new-go', t('View')));
      newCapture.hidden = false;
    }
  };
  const onRaw = (e) => {
    if (tuningOpen) return;
    full.add(e.detail);
  };
  if (rawOn) {
    device.addEventListener('spring-capture', onRaw);
    device.setInputMode(true)?.catch?.(() => {}); // the controller records only while the app streams
    arm(sticks.includes(active) ? active : sticks[0]);
  } else device.addEventListener('snapback', onDump);

  setActive(active);
  root.append(h('div.stack',
    callout({ tone: 'blue' },
      h('strong', t('How to test:')), ' ',
      rawOn
        ? t('Push either stick all the way out and let it snap back, or flick it across. The Analyzer below shows the last one, from the stick you used. Try each filter mode to compare.')
        : t('Push a stick all the way to one side and let it snap back. The controller records the moment it returns and shows it under that stick. Try each filter mode to compare.')),
    split,
    full?.el));

  // Wait one frame for layout so we know whether the page is wide.
  if (sticks.includes(ctx.params.stick)) highlightFrame = requestAnimationFrame(() => highlight(ctx.params.stick));

  return {
    update(params) {
      if (!sticks.includes(params.stick)) return;
      setActive(params.stick);
      highlight(params.stick);
    },
    destroy() {
      cancelAnimationFrame(highlightFrame);
      clearTimeout(highlightTimer);
      device.removeEventListener('snapback', onDump);
      stopLive?.();
      full?.destroy();
      if (rawOn) {
        device.removeEventListener('spring-capture', onRaw);
        if (session.connected) device.armSpringCapture(null)?.catch?.(() => {});
      }
      for (const s of sticks) columns[s].destroy();
    },
  };
}
