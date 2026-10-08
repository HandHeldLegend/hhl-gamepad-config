/**
 * card.js: Backup & restore UI (the Firmware page card, the restore dialog, the updater prompt).
 * Logic lives in ./backup.js. To remove the feature: delete this folder and its two hooks
 * (src/sections/firmware/view.js, src/firmware/updater.js) plus the locale files' backup.js.
 */
import { h } from '../../ui/dom.js';
import { card, button, callout, toggle } from '../../ui/controls.js';
import { openDialog, toast } from '../../ui/overlay.js';
import { t, N_, plural, fmt } from '../../i18n/index.js';
import { createBackup, backupFileName, parseBackup, planRestore, applyRestore } from './backup.js';

const BLOCK_LABELS = {
  gamepad: N_('Gamepad'), hover: N_('Analog triggers'), analog: N_('Joysticks'), rgb: N_('RGB'), trigger: N_('Triggers'),
  imu: N_('Motion'), haptic: N_('Haptics'), user: N_('User'), input: N_('Button mapping'),
};

/** True once a backup was saved in this tab (the updater's "done" step mentions restoring it). */
let backedUp = false;
export const backedUpThisSession = () => backedUp;

/** Save the connected controller's settings to a .json file. */
export async function downloadBackup(session) {
  if (!session.connected) return false;
  try {
    const backup = await createBackup(session);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: backupFileName(backup) });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    backedUp = true;
    toast(t('Backup saved: {file}', { file: a.download }), { tone: 'green', icon: 'check' });
    return true;
  } catch (err) {
    console.error('[backup] export failed', err);
    toast(t('Couldn’t create the backup.'), { tone: 'red' });
    return false;
  }
}

/** Pick a backup file and open the restore preview. */
export function restoreFromFile(session) {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      openRestoreDialog(parseBackup(await file.text()), session);
    } catch (err) {
      toast(err.message || t('This file isn’t a settings backup.'), { tone: 'red', timeout: 6000 });
    }
  });
  document.body.append(input);
  input.click();
}

/** Preview what a backup would change, then restore and save on confirm. */
export async function openRestoreDialog(backup, session) {
  const created = new Date(backup.created);
  const from = [backup.controller?.name, Number.isNaN(created.getTime()) ? null : fmt.date(created)].filter(Boolean).join(' · ');
  const summary = h('div.bk-summary');
  const notice = h('div');
  const calRow = h('label.bk-cal');
  let includeCal = false;
  let plan = null;

  const dlg = openDialog({
    title: t('Restore settings'), icon: 'upload', tone: 'green',
    body: [h('p.muted', t('From {source}', { source: from || t('a backup file') })), notice, calRow, summary],
  });

  async function render() {
    plan = await planRestore(backup, session, { calibration: includeCal });
    notice.replaceChildren(
      plan.sameBuild === false ? callout({ tone: 'yellow', text: t('This backup is from a different controller model. Settings that don’t exist here are skipped.') }) : '');
    calRow.hidden = !plan.hasCalibration;
    const changes = plan.blocks.map((b) => {
      const n = b.settings.length + b.calibration.length;
      return h('li', h('strong', t(BLOCK_LABELS[b.key] || b.key)), ' ', h('span.muted', plural(n, '{n} change', '{n} changes')));
    });
    summary.replaceChildren(
      changes.length ? h('ul.bk-list', changes) : h('p.muted', t('Nothing to change: the controller already has these settings.')),
      plan.skipped.length === 0 ? '' : h('details.bk-skipped',
        h('summary', plural(plan.skipped.length, '{n} item not restored', '{n} items not restored')),
        h('p.small.muted', t('They don’t exist in this controller’s firmware.')),
        h('code.bk-skipped-list', plan.skipped.join(', '))));
    dlg.setActions([
      { label: t('Cancel'), variant: 'ghost' },
      { label: t('Restore and save'), icon: 'save', variant: 'primary', disabled: !changes.length, keepOpen: true, onClick: restore },
    ]);
  }

  async function restore() {
    dlg.setActions([]);
    summary.replaceChildren(h('p.muted', t('Restoring…')));
    const ok = await applyRestore(plan, session).catch((err) => { console.error('[backup] restore failed', err); return false; });
    dlg.close();
    toast(ok ? t('Settings restored and saved') : t('Restore failed. Nothing was saved.'), { tone: ok ? 'green' : 'red' });
    return false;
  }

  // Calibration belongs to one controller: on by default only when the backup is from this one.
  const pre = await planRestore(backup, session);
  includeCal = pre.sameUnit === true;
  calRow.append(toggle({ checked: includeCal, label: t('Include calibration'), onChange: (v) => { includeCal = v; render(); } }),
    h('span', h('strong', t('Include calibration')), h('span.small.muted.bk-cal-note', pre.sameUnit === true
      ? t('Stick centers and angle maps, trigger ranges and gyro offsets. This backup is from this controller.')
      : t('Stick centers and angle maps, trigger ranges and gyro offsets. Calibration belongs to one controller, so leave this off unless the backup is from this one.'))));
  render();
}

/** The Firmware page card. */
export function backupCard(session) {
  const style = h('style', `
    .bk-summary .bk-list { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
    .bk-cal { display: flex; gap: 12px; align-items: flex-start; }
    .bk-cal > span { display: grid; gap: 2px; }
    .bk-skipped summary { cursor: pointer; color: var(--text-muted); font-size: var(--text-sm); margin-top: var(--space-2); }
    .bk-skipped-list { display: block; font-size: var(--text-xs, 0.75rem); word-break: break-word; }
  `);
  const body = h('div.stack');
  const render = () => {
    const on = session.connected;
    body.replaceChildren(
      h('p.muted.small', t('Save this controller’s settings to a file, and load them back after an update or onto another controller.')),
      h('div.row',
        button({ label: t('Back up settings'), icon: 'download', variant: 'tonal', disabled: !on, onClick: () => downloadBackup(session) }),
        button({ label: t('Restore from file'), icon: 'upload', variant: 'ghost', disabled: !on, onClick: () => restoreFromFile(session) })),
      on ? '' : h('p.small.faint', t('Connect a controller to back up or restore.')));
  };
  render();
  const el = card({ title: t('Backup & restore'), icon: 'save', tone: 'green' }, style, body);
  el.refresh = render;
  return el;
}

/** Updater hook: a short "back up first" line for the update dialog (null when not connected). */
export function backupPrompt(session) {
  if (!session.connected) return null;
  return callout({ tone: 'blue', icon: 'save', text: t('Updates can reset settings. Save a backup first so you can restore them afterwards.') },
    ' ', button({ label: t('Back up settings'), icon: 'download', size: 'sm', variant: 'tonal', onClick: () => downloadBackup(session) }));
}
