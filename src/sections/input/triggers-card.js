/**
 * triggers-card.js: The Triggers card on the Input page, for controllers that take mechanical
 * triggers (device/triggers.js). Per side: Auto / Analog / Mechanical, a guided check on Auto, and a
 * hint when a forced choice no longer matches the trigger fitted.
 *
 * The check on Auto: the card asks for 5 clicks, fills a dot per click (counted from the live input
 * stream, with the trigger's travel beside it), then waits for the controller's own finding and shows
 * it. The controller decides (5 clicks with no travel: mechanical; 2 full pulls: analog again); the
 * dots only show the owner how far along they are. watchTriggers reads the finding when the hover
 * block's fingerprint changes (not while a hover change waits to be sent, or while calibrating).
 * onChange runs when a side starts or stops counting as mechanical: the page rebuilds its inputs.
 */
import { h } from '../../ui/dom.js';
import { card, segmented, button } from '../../ui/controls.js';
import { toast } from '../../ui/overlay.js';
import { icon } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { onInputReport } from '../../device/reports.js';
import { INPUT_CODES } from './mapping.js';
import { glyph } from './parts.js';
import { TRIGGER_SIDES, TRIGGER_CHOICE, triggerState, setTriggerChoice, mechanicalKey, watchTriggers } from '../../device/triggers.js';

/** Clicks the controller needs to call a trigger mechanical. */
const CLICKS = 5;
/** After the last click, how long to wait for the controller's finding before showing the result anyway. */
const SETTLE_MS = 2500;

const codeOf = (key) => INPUT_CODES.find((c) => c.key === key)?.code;

/** Sides whose finding just changed (side → time): a finding rebuilds the page, and the new card
 *  still shows the result instead of starting over. */
const justFound = new Map();
const FOUND_SHOWN_MS = 20000;

export function triggersCard(session, { device, calib, onChange }) {
  let key = mechanicalKey(session);
  let busy = false;
  const changed = () => {
    const k = mechanicalKey(session);
    if (k === key) return;
    key = k;
    onChange?.();
  };

  const rows = TRIGGER_SIDES.map((s) => {
    const seg = segmented({
      options: [
        { value: TRIGGER_CHOICE.AUTO, label: t('Auto') },
        { value: TRIGGER_CHOICE.ANALOG, label: t('Analog') },
        { value: TRIGGER_CHOICE.MECHANICAL, label: t('Mechanical') },
      ],
      value: triggerState(session, s.index).choice, tone: 'lavender',
      ariaLabel: s.side === 'left' ? t('Left trigger') : t('Right trigger'),
      onChange: (v) => choose(s, v),
    });
    // The guided check (Auto only): a ring around the trigger's glyph, one dot per click around it, and
    // the trigger's travel sweeping inside it
    const dots = Array.from({ length: CLICKS }, (_, i) => h('span.inp-trig-dot', { style: { '--i': i } }));
    const ring = h('div.inp-trig-ring', h('span.inp-trig-sweep'), dots,
      h('span.inp-trig-glyph', glyph(s.side === 'left' ? 'L' : 'R', { size: 34 })), h('span.inp-trig-badge', icon('check')));
    const statusText = h('span.inp-trig-status-text');
    const statusIcon = h('span.inp-trig-status-icon');
    const check = h('div.inp-trig-check', { role: 'status', 'aria-live': 'polite' },
      ring, h('div.inp-trig-status', statusIcon, statusText));
    const hint = h('div.inp-trig-hint');
    const el = h('div.inp-trig-row',
      h('strong.inp-trig-name', s.side === 'left' ? t('Left trigger') : t('Right trigger')), seg,
      check, hint);
    return {
      s, seg, dots, ring, statusText, statusIcon, check, hint, el,
      clickCode: codeOf(s.click), analogCode: codeOf(s.analog),
      clicks: justFound.get(s.side) > Date.now() - FOUND_SHOWN_MS ? CLICKS : 0, down: false, settle: 0,
      phase: justFound.get(s.side) > Date.now() - FOUND_SHOWN_MS ? 'done' : 'idle', // idle → counting → checking → done
    };
  });

  function paint() {
    for (const r of rows) {
      const st = triggerState(session, r.s.index);
      if (r.seg.value !== st.choice) r.seg.value = st.choice;
      const auto = st.choice === TRIGGER_CHOICE.AUTO;
      r.check.hidden = !auto;
      if (auto) paintCheck(r, st);
      r.hint.replaceChildren(...(st.mismatch ? [h('div.inp-trig-mismatch',
        h('span.small', st.mismatch === 'mechanical'
          ? t('This trigger clicks without moving; it looks mechanical.')
          : t('This trigger moves before it clicks; it looks analog.')),
        button({ label: t('Switch to Auto'), size: 'sm', variant: 'tonal', onClick: () => choose(r.s, TRIGGER_CHOICE.AUTO) }))] : []));
    }
  }

  function paintCheck(r, st) {
    r.dots.forEach((d, i) => d.classList.toggle('on', i < Math.min(r.clicks, CLICKS)));
    r.check.dataset.phase = r.phase;
    const found = st.detected ? t('Mechanical (found from use)') : t('Analog');
    const [ic, text] = r.phase === 'counting' ? [null, t('{n} of {total} clicks', { n: Math.min(r.clicks, CLICKS), total: CLICKS })]
      : r.phase === 'checking' ? ['spinner', t('Checking…')]
        : r.phase === 'done' ? [null, t('Found: {result}', { result: found })] // the ring shows the check
          : [null, t('Now: {result}. Click the trigger {n} times to check it.', { result: found, n: CLICKS })];
    r.statusText.textContent = text;
    r.statusIcon.replaceChildren(ic === 'spinner' ? h('span.spinner.motion-ok') : ic ? icon(ic) : '');
  }

  // Count clicks and show travel from the live input stream
  const offReports = onInputReport(device, (rep) => {
    if (rep.kind !== 'raw') return;
    for (const r of rows) {
      if (r.check.hidden) continue;
      const c = rep.inputs[r.clickCode];
      r.ring.style.setProperty('--v', Math.min(1, (rep.inputs[r.analogCode]?.value || 0) / 127).toFixed(3));
      r.ring.classList.toggle('pressed', !!c?.pressed);
      if (c?.pressed && !r.down) {
        if (r.phase === 'done' || r.phase === 'idle') { r.clicks = 0; justFound.delete(r.s.side); }
        r.clicks++;
        r.phase = r.clicks >= CLICKS ? 'checking' : 'counting';
        clearTimeout(r.settle);
        // The finding arrives through watchTriggers; show the result even if it didn't change
        if (r.phase === 'checking') r.settle = setTimeout(() => { if (r.phase === 'checking') { r.phase = 'done'; paint(); } }, SETTLE_MS);
        paint();
      }
      r.down = !!c?.pressed;
    }
  });

  async function choose(s, choice) {
    busy = true;
    try {
      if (!(await setTriggerChoice(session, s.index, choice))) throw new Error('save not confirmed');
    } catch (err) {
      console.warn('[input] trigger choice not saved', err);
      toast(t('Couldn’t save the trigger setting. Try again.'), { tone: 'red' });
    } finally {
      busy = false;
    }
    paint();
    changed();
  }

  // Read the finding again while the owner clicks (skipped while something else uses the hover block)
  let lastDetected = rows.map((r) => triggerState(session, r.s.index).detected);
  const stopWatch = watchTriggers(session, () => {
    rows.forEach((r, i) => {
      const d = triggerState(session, r.s.index).detected;
      if (d !== lastDetected[i]) {
        justFound.set(r.s.side, Date.now());
        if (r.phase === 'checking' || r.phase === 'counting') { r.phase = 'done'; r.clicks = CLICKS; clearTimeout(r.settle); }
      }
      lastDetected[i] = d;
    });
    paint();
    changed();
  }, { paused: () => busy || calib?.active != null || session.dirty.has('hover') });

  paint();
  const el = card({ title: t('Triggers'), icon: 'trigger', tone: 'lavender',
    subtitle: t('Fitted mechanical triggers, or swapped them back? Leave this on Auto: click the trigger a few times and the controller notices. Or set it here.') },
  h('div.inp-trigs', rows.map((r) => r.el)));
  return {
    el,
    destroy: () => { stopWatch(); offReports(); rows.forEach((r) => clearTimeout(r.settle)); },
  };
}
