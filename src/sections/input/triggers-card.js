/**
 * triggers-card.js: The Triggers card on the Input page, for controllers that take mechanical
 * triggers (device/triggers.js). Per side: Auto / Analog / Mechanical, what the controller found from
 * use (on Auto), and a hint when a forced choice no longer matches the trigger fitted.
 *
 * The finding changes while the owner clicks, so the hover block is read again every few seconds
 * while the card is on screen (not while a hover change waits to be sent, or while calibrating).
 * onChange runs when a side starts or stops counting as mechanical: the page rebuilds its inputs.
 */
import { h } from '../../ui/dom.js';
import { card, segmented, button } from '../../ui/controls.js';
import { toast } from '../../ui/overlay.js';
import { t } from '../../i18n/index.js';
import { TRIGGER_SIDES, TRIGGER_CHOICE, triggerState, setTriggerChoice, mechanicalKey } from '../../device/triggers.js';

const POLL_MS = 1500;

export function triggersCard(session, { calib, onChange }) {
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
    const found = h('p.small.muted.inp-trig-found');
    const hint = h('div.inp-trig-hint');
    const el = h('div.inp-trig-row',
      h('div.inp-trig-head', h('strong', s.side === 'left' ? t('Left trigger') : t('Right trigger')), seg),
      found, hint);
    return { s, seg, found, hint, el };
  });

  function paint() {
    for (const r of rows) {
      const st = triggerState(session, r.s.index);
      if (r.seg.value !== st.choice) r.seg.value = st.choice;
      r.found.textContent = st.choice === TRIGGER_CHOICE.AUTO
        ? (st.detected ? t('Mechanical (found from use)') : t('Analog'))
        : '';
      r.found.hidden = st.choice !== TRIGGER_CHOICE.AUTO;
      r.hint.replaceChildren(...(st.mismatch ? [h('div.inp-trig-mismatch',
        h('span.small', st.mismatch === 'mechanical'
          ? t('This trigger clicks without moving; it looks mechanical.')
          : t('This trigger moves before it clicks; it looks analog.')),
        button({ label: t('Switch to Auto'), size: 'sm', variant: 'tonal', onClick: () => choose(r.s, TRIGGER_CHOICE.AUTO) }))] : []));
    }
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

  // Read the finding again while the owner clicks (skipped while something else uses the hover block)
  const timer = setInterval(async () => {
    if (busy || calib?.active != null || session.dirty.has('hover') || !session.connected) return;
    busy = true;
    try { await session.refresh('hover'); } catch { /* the next round reads again */ } finally { busy = false; }
    paint();
    changed();
  }, POLL_MS);

  paint();
  const el = card({ title: t('Triggers'), icon: 'trigger', tone: 'lavender',
    subtitle: t('Fitted mechanical triggers, or swapped them back? Leave this on Auto: click the trigger a few times and the controller notices. Or set it here.') },
  h('div.inp-trigs', rows.map((r) => r.el)));
  return { el, destroy: () => clearInterval(timer) };
}
