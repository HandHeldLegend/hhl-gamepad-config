/**
 * card.js: Backup & restore UI (the Firmware page card with the automatic backups, the restore
 * dialog, the updater prompt). Logic lives in ./backup.js and ./history.js. To remove the feature:
 * delete this folder and its three hooks (src/main.js, src/sections/firmware/view.js,
 * src/firmware/updater.js) plus the locale files' backup.js.
 */
import { h } from '../../ui/dom.js';
import { card, button, callout, toggle, badge } from '../../ui/controls.js';
import { icon } from '../../ui/icons.js';
import { openDialog, toast } from '../../ui/overlay.js';
import { t, N_, plural, fmt } from '../../i18n/index.js';
import { createBackup, backupFileName, parseBackup, planRestore, applyRestore, unitId } from './backup.js';
import { listBackups, connectionBackup, snapshot, history, KEEP } from './history.js';

const BLOCK_LABELS = {
  gamepad: N_('Gamepad'), hover: N_('Analog triggers'), analog: N_('Joysticks'), rgb: N_('RGB'), trigger: N_('Triggers'),
  imu: N_('Motion'), haptic: N_('Haptics'), user: N_('User'), input: N_('Button mapping'),
};

/**
 * True once this controller's settings are backed up: a file saved in this tab, or the automatic
 * backup made when it connected (the updater's "done" step mentions restoring it).
 */
let backedUp = false;
export const backedUpThisSession = () => backedUp || !!connectionBackup();

/** Hand a backup object to the browser as a .json download. */
function saveFile(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: backupFileName(backup) });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(t('Backup saved: {file}', { file: a.download }), { tone: 'green', icon: 'check' });
}

/** Save the connected controller's settings to a .json file. */
export async function downloadBackup(session) {
  if (!session.connected) return false;
  try {
    saveFile(await createBackup(session));
    backedUp = true;
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
    if (ok) snapshot(session); // the restored settings become the newest automatic backup
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

const when = (iso) => fmt.date(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
/** A firmware build stamp as its build date (the stamp is a Unix time), else the raw number. */
const fwDate = (n) => {
  const v = Number(n) >>> 0;
  return v > 1.4e9 && v < 4e9 ? fmt.date(new Date(v * 1000)) : String(v);
};

/** How many controllers show before "Show N more". */
const SHOWN = 4;

/** The owner's name saved in a backup (the User page), or ''. */
function ownerName(backup) {
  const v = backup?.blocks?.user?.fields?.user_name;
  if (typeof v === 'string') return v.replace(/\0.*$/s, '').trim();
  if (Array.isArray(v)) {
    const end = v.indexOf(0);
    try { return new TextDecoder().decode(new Uint8Array(end < 0 ? v : v.slice(0, end))).trim(); } catch { return ''; }
  }
  return '';
}

/** One automatic backup on a controller's timeline: when, which firmware, and Restore / Download. */
function entryRow(e, session, { isCurrent }) {
  return h('li.bk-entry', { class: isCurrent ? 'is-current' : null },
    h('span.bk-entry-dot'),
    h('span.bk-entry-text',
      h('span.bk-entry-when', when(e.created), isCurrent && badge(t('Current settings'), 'green')),
      e.fwVersion != null && h('span.field-desc', t('Firmware from {date}', { date: fwDate(e.fwVersion) }))),
    h('span.bk-entry-actions',
      button({
        label: t('Restore'), icon: 'upload', size: 'sm', variant: 'ghost', disabled: !session.connected || isCurrent,
        title: isCurrent ? t('The controller already has these settings.') : null,
        onClick: () => openRestoreDialog(e.backup, session),
      }),
      button({ icon: 'download', size: 'sm', variant: 'ghost', title: t('Download as a file'), onClick: () => saveFile(e.backup) })));
}

/**
 * The automatic backups, one card per controller (newest first, the connected one on top and open):
 * its name, how many versions and the latest, and its versions as a timeline when opened. One card is
 * open at a time. Past SHOWN controllers, the rest wait behind "Show N more".
 */
async function autoBackups(session, ui) {
  const all = await listBackups();
  const unit = session.connected ? await unitId(session.config) : null;
  const latest = connectionBackup();
  // Group by controller, newest backup first (listBackups is newest first)
  const groups = new Map();
  for (const e of all) {
    if (!groups.has(e.unit)) groups.set(e.unit, []);
    groups.get(e.unit).push(e);
  }
  const list = [...groups.entries()].map(([u, entries]) => ({ unit: u, entries, mine: u === unit }));
  list.sort((a, b) => (b.mine - a.mine) || (Date.parse(b.entries[0].created) - Date.parse(a.entries[0].created)));
  // Same model twice: tell them apart by the owner's name, else a short id
  const names = list.map((g) => g.entries[0].name || t('Controller'));
  const title = (g, i) => {
    const owner = ownerName(g.entries[0].backup);
    if (owner) return `${names[i]} · ${owner}`;
    return names.filter((n) => n === names[i]).length > 1 ? `${names[i]} · ${String(g.unit).slice(0, 4).toUpperCase()}` : names[i];
  };

  const cards = list.map((g, i) => {
    const d = h('details.bk-unit', { name: 'bk-units', class: g.mine ? 'is-mine' : null },
      h('summary',
        h('span.bk-unit-art', icon('gamepad')),
        h('span.bk-unit-text',
          h('span.bk-unit-name', title(g, i), g.mine && badge(t('This controller'), 'green')),
          h('span.bk-unit-sub', plural(g.entries.length, '{n} backup', '{n} backups'), ' · ',
            t('latest {when}', { when: when(g.entries[0].created) }))),
        h('span.bk-unit-chev', icon('chevron-down'))),
      h('ol.bk-entries', g.entries.map((e) => entryRow(e, session, { isCurrent: !!latest && e.id === latest.id }))));
    if (ui.open === g.unit || (ui.open == null && g.mine)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) ui.open = g.unit; else if (ui.open === g.unit) ui.open = ''; });
    return d;
  });
  const hide = ui.all ? [] : cards.slice(SHOWN).filter((c) => !c.open);
  hide.forEach((c) => { c.hidden = true; });
  const more = hide.length > 0 && button({
    label: plural(hide.length, 'Show {n} more controller', 'Show {n} more controllers'),
    icon: 'chevron-down', size: 'sm', variant: 'ghost',
    onClick: () => { ui.all = true; hide.forEach((c) => { c.hidden = false; c.classList.add('bk-unit-in'); }); more.remove(); },
  });

  return h('div.bk-auto',
    h('div.bk-auto-head', h('span.field-label', t('Automatic backups')),
      h('span.field-desc', t('Saved in this browser each time a controller connects. The last {n} versions of each controller are kept.', { n: KEEP }))),
    cards.length
      ? h('div.bk-units', cards, more)
      : h('p.small.faint', session.connected ? t('No automatic backups of this controller yet.') : t('Connect a controller to restore one of its automatic backups.')));
}

/** The Firmware page card. */
export function backupCard(session) {
  const style = h('style', `
    .bk-auto { display: grid; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--border); }
    .bk-auto-head { display: grid; gap: 2px; }
    .bk-auto .field-desc { margin: 0; }
    .bk-units { display: grid; gap: var(--space-2); justify-items: stretch; }
    .bk-units > .btn { justify-self: start; }
    .bk-unit { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); transition: border-color var(--dur-med), box-shadow var(--dur-med); }
    .bk-unit[hidden] { display: none; }
    .bk-unit.bk-unit-in { animation: rise-in var(--dur-slow) var(--ease-out); }
    .bk-unit[open] { border-color: var(--border-strong); box-shadow: 0 6px 18px -12px rgba(0, 0, 0, 0.45); }
    .bk-unit.is-mine { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); }
    .bk-unit > summary { display: flex; align-items: center; gap: var(--space-3); padding: 10px 12px; cursor: pointer; list-style: none; border-radius: var(--radius-md);
      transition: background-color var(--dur-fast); }
    .bk-unit > summary::-webkit-details-marker { display: none; }
    .bk-unit > summary:hover { background: var(--surface-sunken); }
    .bk-unit > summary:focus-visible { box-shadow: var(--focus-ring); outline: none; }
    .bk-unit-art { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: var(--green-soft); color: var(--green);
      transition: transform var(--dur-slow) var(--ease-spring); }
    .bk-unit:not(.is-mine) .bk-unit-art { background: var(--surface-sunken); color: var(--text-muted); }
    .bk-unit[open] .bk-unit-art { transform: rotate(-10deg) scale(1.06); }
    .bk-unit-text { flex: 1; min-width: 0; display: grid; gap: 1px; }
    .bk-unit-name { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-weight: 700; }
    .bk-unit-sub { font-size: var(--text-xs); color: var(--text-muted); }
    .bk-unit-chev { flex: none; color: var(--text-faint); transition: transform var(--dur-med) var(--ease-out); }
    .bk-unit[open] .bk-unit-chev { transform: rotate(180deg); }
    /* A controller's versions: a small timeline */
    .bk-entries { list-style: none; margin: 0; padding: 0 12px 10px 30px; display: grid; gap: 2px; position: relative; }
    .bk-entries::before { content: ''; position: absolute; left: 30px; top: 12px; bottom: 22px; width: 2px; background: var(--border); border-radius: 1px; }
    .bk-entry { position: relative; display: flex; align-items: center; gap: var(--space-2); padding: 6px 6px 6px 22px; border-radius: var(--radius-sm); transition: background-color var(--dur-fast); }
    .bk-entry:hover { background: var(--surface-sunken); }
    .bk-entry-dot { position: absolute; left: -5px; top: 50%; width: 12px; height: 12px; margin-top: -6px; border-radius: 50%; background: var(--surface); border: 2px solid var(--text-faint); }
    .bk-entry.is-current .bk-entry-dot { background: var(--green); border-color: var(--green); box-shadow: 0 0 8px var(--green); }
    .bk-entry-text { flex: 1; min-width: 0; display: grid; }
    .bk-entry-text .field-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bk-entry-when { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-weight: 600; font-size: var(--text-sm); }
    .bk-entry-actions { display: flex; gap: 2px; flex: none; }
    .bk-summary .bk-list { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
    .bk-cal { display: flex; gap: 12px; align-items: flex-start; }
    .bk-cal > span { display: grid; gap: 2px; }
    .bk-skipped summary { cursor: pointer; color: var(--text-muted); font-size: var(--text-sm); margin-top: var(--space-2); }
    .bk-skipped-list { display: block; font-size: var(--text-xs, 0.75rem); word-break: break-word; }
  `);
  const body = h('div.stack');
  const auto = h('div');
  let token = 0; // only the latest render of the list lands
  const ui = { open: null, all: false }; // the open controller and "show all", kept across redraws
  const renderAuto = async () => {
    const mine = ++token;
    const list = await autoBackups(session, ui);
    if (mine === token) auto.replaceChildren(list);
  };
  const render = () => {
    const on = session.connected;
    body.replaceChildren(
      h('p.muted.small', t('Save this controller’s settings to a file, and load them back after an update or onto another controller.')),
      h('div.row',
        button({ label: t('Back up settings'), icon: 'download', variant: 'tonal', disabled: !on, onClick: () => downloadBackup(session) }),
        button({ label: t('Restore from file'), icon: 'upload', variant: 'ghost', disabled: !on, onClick: () => restoreFromFile(session) })),
      on ? '' : h('p.small.faint', t('Connect a controller to back up or restore.')),
      auto);
    renderAuto();
  };
  render();
  const el = card({ title: t('Backup & restore'), icon: 'save', tone: 'green' }, style, body);
  el.refresh = render;
  /** Stop following the automatic backups (the Firmware page's cleanup). */
  el.destroy = history.on(renderAuto);
  return el;
}

/** Updater hook: one quiet "back up first" line for the update dialog (null when not connected). */
export function backupPrompt(session) {
  if (!session.connected) return null;
  if (!document.getElementById('bk-prompt-style')) {
    document.head.append(h('style#bk-prompt-style', `
      .bk-prompt { display: flex; align-items: flex-start; gap: 8px; font-size: var(--text-sm); color: var(--text-muted); }
      .bk-prompt .icon { width: 16px; height: 16px; flex: none; margin-top: 2px; }
      .bk-prompt > span { flex: 1; min-width: 0; }
      .bk-prompt .bk-link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--accent-ink);
        text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
      .bk-prompt .bk-link:hover { color: var(--text); }
      .bk-prompt.done { color: var(--green); }`));
  }
  const el = h('p.bk-prompt');
  const render = (auto) => {
    const done = backedUp || !!auto;
    el.classList.toggle('done', done);
    let text;
    if (backedUp) text = t('Settings backed up.');
    else if (auto) {
      text = h('span', t('Settings backed up automatically. If the update resets them, restore them from the Firmware page.'), ' ',
        h('button.bk-link', { type: 'button', onclick: () => saveFile(auto.backup) }, t('Download a copy')));
    } else {
      text = h('span', t('Updates can reset settings.'), ' ',
        h('button.bk-link', { type: 'button', onclick: async () => { if (await downloadBackup(session)) render(null); } }, t('Save a backup first')));
    }
    el.replaceChildren(icon(done ? 'check' : 'save'), text);
  };
  render(connectionBackup());
  // Back up again now, so edits made since the controller connected are in the automatic backup too.
  snapshot(session).then((e) => { if (e && el.isConnected) render(e); });
  return el;
}
