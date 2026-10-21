/**
 * triggers-card.js: The Triggers tab on the Input page, for controllers that take mechanical triggers
 * (device/triggers.js). Per side: Auto / Analog / Mechanical, a click check on Auto, and a hint when a
 * forced choice no longer matches the trigger fitted.
 *
 * Until this controller was checked here (needsTriggerCheck), every side on Auto shows the check: a
 * ring around the trigger's glyph with a dot per click (counted from the live input stream) and its
 * travel sweeping inside. After the 5th click the hover block is read and the controller's finding
 * shown; that side then locks (more clicks don't start over) and offers Check again. With both done, a
 * summary, a note that it can be changed here any time, and Done, which remembers the check and leaves
 * a compact view. The controller decides (5 clicks with no travel: mechanical; 2 full pulls: analog
 * again); the dots only show the owner how far along they are.
 *
 * watchTriggers reads the finding when the hover block's fingerprint changes (not while a hover change
 * waits to be sent, or while calibrating). onChange runs when a side starts or stops counting as
 * mechanical (the page rebuilds its inputs); onChecked when the owner finishes with Done.
 */
import { h } from '../../ui/dom.js';
import { card, segmented, button } from '../../ui/controls.js';
import { toast } from '../../ui/overlay.js';
import { icon } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { onInputReport } from '../../device/reports.js';
import { INPUT_CODES } from './mapping.js';
import { glyph } from './parts.js';
import {
  TRIGGER_SIDES, TRIGGER_CHOICE, triggerState, setTriggerChoice, mechanicalKey, watchTriggers,
  needsTriggerCheck, markTriggersChecked,
} from '../../device/triggers.js';

/** Clicks the controller needs to call a trigger mechanical. */
const CLICKS = 5;
/** After the 5th click, when to read the controller's finding (it judges the click as it lands and
 *  saves a change straight away). */
const READ_AFTER_MS = 350;
/** A read that hasn't answered by then counts as failed (slow links, a busy controller). */
const READ_TIMEOUT_MS = 4000;
/** "Checking…" never lasts longer than this: the result shows from what the app has by then. */
const CHECK_MAX_MS = 8000;

const codeOf = (key) => INPUT_CODES.find((c) => c.key === key)?.code;

/**
 * The check survives the page rebuilding (a new finding changes the inputs): side → { phase, clicks }
 * while a check is under way or just finished.
 */
const kept = new Map();

export function triggersCard(session, { device, calib, onChange, onChecked }) {
  let key = mechanicalKey(session);
  let busy = false;
  const changed = () => {
    const k = mechanicalKey(session);
    if (k === key) return;
    key = k;
    onChange?.();
  };
  const sideName = (s) => (s.side === 'left' ? t('Left trigger') : t('Right trigger'));
  const typeName = (st) => (st.mechanical ? t('Mechanical') : t('Analog'));
  // Checking: until this controller was checked here, or after Check again
  const fresh = needsTriggerCheck(session);

  const rows = TRIGGER_SIDES.map((s) => {
    const seg = segmented({
      options: [
        { value: TRIGGER_CHOICE.AUTO, label: t('Auto') },
        { value: TRIGGER_CHOICE.ANALOG, label: t('Analog') },
        { value: TRIGGER_CHOICE.MECHANICAL, label: t('Mechanical') },
      ],
      value: triggerState(session, s.index).choice, tone: 'lavender', ariaLabel: sideName(s),
      onChange: (v) => choose(s, v),
    });
    const dots = Array.from({ length: CLICKS }, (_, i) => h('span.inp-trig-dot', { style: { '--i': i } }));
    const ring = h('div.inp-trig-ring', h('span.inp-trig-sweep'), dots,
      h('span.inp-trig-glyph', glyph(s.side === 'left' ? 'L' : 'R', { size: 34 })), h('span.inp-trig-badge', icon('check')));
    const statusText = h('span.inp-trig-status-text');
    const statusIcon = h('span.inp-trig-status-icon');
    const check = h('div.inp-trig-check', { role: 'status', 'aria-live': 'polite' },
      ring, h('div.inp-trig-status', statusIcon, statusText));
    // Compact (checked): the type, and Check again
    const summary = h('div.inp-trig-summary');
    const hint = h('div.inp-trig-hint');
    const el = h('div.inp-trig-row', h('strong.inp-trig-name', sideName(s)), seg, check, summary, hint);
    const k = kept.get(s.side);
    return {
      s, seg, dots, ring, statusText, statusIcon, check, summary, hint, el,
      clickCode: codeOf(s.click), analogCode: codeOf(s.analog),
      checking: k ? true : fresh, phase: k?.phase || 'idle', clicks: k?.clicks || 0, down: false, timer: 0,
    };
  });

  const finish = h('div.inp-trig-finish');
  // A check that was waiting for its result when the page rebuilt (a new finding changes the inputs):
  // read it now, or it would wait forever
  for (const r of rows) if (r.phase === 'checking') r.timer = setTimeout(() => readFinding(r), 0);
  const save = (r) => kept.set(r.s.side, { phase: r.phase, clicks: r.clicks });

  function paint() {
    for (const r of rows) {
      const st = triggerState(session, r.s.index);
      if (r.seg.value !== st.choice) r.seg.value = st.choice;
      const auto = st.choice === TRIGGER_CHOICE.AUTO;
      r.check.hidden = !auto || !r.checking;
      r.summary.hidden = !r.check.hidden;
      if (!r.check.hidden) paintCheck(r, st);
      else {
        r.summary.replaceChildren(
          h('span.inp-trig-type', { class: st.mechanical ? 'is-mech' : null }, typeName(st)),
          ...(auto ? [button({ label: t('Check again'), icon: 'refresh', size: 'sm', variant: 'ghost', onClick: () => restart(r) })] : []));
      }
      r.hint.replaceChildren(...(st.mismatch ? [h('div.inp-trig-mismatch',
        h('span.small', st.mismatch === 'mechanical'
          ? t('This trigger clicks without moving; it looks mechanical.')
          : t('This trigger moves before it clicks; it looks analog.')),
        button({ label: t('Switch to Auto'), size: 'sm', variant: 'tonal', onClick: () => choose(r.s, TRIGGER_CHOICE.AUTO) }))] : []));
    }
    paintFinish();
  }

  function paintCheck(r, st) {
    r.dots.forEach((d, i) => d.classList.toggle('on', i < Math.min(r.clicks, CLICKS)));
    r.check.dataset.phase = r.phase;
    const [spin, text] = r.phase === 'counting' ? [false, t('{n} of {total} clicks', { n: Math.min(r.clicks, CLICKS), total: CLICKS })]
      : r.phase === 'checking' ? [true, t('Checking…')]
        : r.phase === 'done' ? [false, t('Found: {result}', { result: typeName(st) })]
          : [false, t('Click this trigger {n} times.', { n: CLICKS })];
    r.statusText.textContent = text;
    r.statusIcon.replaceChildren(spin ? h('span.spinner.motion-ok') : '');
  }

  /** Every check done: what was found, that it can change here later, and Done. */
  function paintFinish() {
    const active = rows.filter((r) => !r.check.hidden);
    const allDone = active.length > 0 && active.every((r) => r.phase === 'done');
    finish.hidden = !allDone;
    if (!allDone) { finish.replaceChildren(); return; }
    finish.replaceChildren(
      h('div.inp-trig-finish-text',
        h('strong', t('Your triggers are set.')),
        h('span', rows.map((r) => `${sideName(r.s)}: ${typeName(triggerState(session, r.s.index))}`).join(' · ')),
        h('span.small.muted', t('Fitted other triggers later? Come back to this Triggers tab and check them again, or set them by hand.'))),
      button({ label: t('Done'), icon: 'check', variant: 'primary', onClick: done }));
  }

  function done() {
    markTriggersChecked(session);
    kept.clear();
    for (const r of rows) { r.checking = false; r.phase = 'idle'; r.clicks = 0; }
    paint();
    onChecked?.();
  }

  function restart(r) {
    r.checking = true;
    r.phase = 'idle';
    r.clicks = 0;
    kept.delete(r.s.side);
    paint();
  }

  // Count clicks and show travel from the live input stream
  const offReports = onInputReport(device, (rep) => {
    if (rep.kind !== 'raw') return;
    for (const r of rows) {
      if (r.check.hidden) continue;
      const c = rep.inputs[r.clickCode];
      r.ring.style.setProperty('--v', Math.min(1, (rep.inputs[r.analogCode]?.value || 0) / 127).toFixed(3));
      r.ring.classList.toggle('pressed', !!c?.pressed);
      // Count up to the 5th click; a finished side stays as it is (Check again starts over)
      if (c?.pressed && !r.down && (r.phase === 'idle' || r.phase === 'counting')) {
        r.clicks++;
        r.phase = r.clicks >= CLICKS ? 'checking' : 'counting';
        save(r);
        // Read the finding right after the 5th click
        if (r.phase === 'checking') r.timer = setTimeout(() => readFinding(r), READ_AFTER_MS);
        paint();
      }
      r.down = !!c?.pressed;
    }
  });

  /**
   * The 5th click landed: read the hover block now and show what the controller found. It always ends:
   * a read that fails or doesn't answer is tried again, and after CHECK_MAX_MS the result shows from
   * what was read last (the background watch keeps it current afterwards).
   */
  async function readFinding(r, attempt = 0) {
    if (r.phase !== 'checking') return;
    r.checkStart ||= Date.now();
    const late = Date.now() - r.checkStart > CHECK_MAX_MS;
    if (busy && !late) { r.timer = setTimeout(() => readFinding(r, attempt), 100); return; }
    let ok = false;
    if (!late) {
      busy = true;
      try {
        await Promise.race([session.refresh('hover'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('no answer')), READ_TIMEOUT_MS))]);
        ok = true;
      } catch (err) {
        console.warn('[input] trigger finding not read', err?.message || err);
      } finally {
        busy = false;
      }
    }
    if (r.phase !== 'checking') return;
    if (!ok && !late && attempt < 3) { r.timer = setTimeout(() => readFinding(r, attempt + 1), 300); return; }
    r.phase = 'done';
    r.checkStart = 0;
    save(r);
    paint();
    changed();
  }

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

  // A finding can also change on its own (the owner clicking with the check closed)
  const stopWatch = watchTriggers(session, () => { paint(); changed(); },
    { paused: () => busy || calib?.active != null || session.dirty.has('hover') });

  paint();
  const el = card({ title: t('Triggers'), icon: 'trigger', tone: 'lavender',
    subtitle: t('Fitted mechanical triggers, or swapped them back? Leave this on Auto: click the trigger a few times and the controller notices. Or set it here.') },
  h('div.inp-trigs', rows.map((r) => r.el)), finish);
  return {
    el,
    destroy: () => { stopWatch(); offReports(); rows.forEach((r) => clearTimeout(r.timer)); },
  };
}
