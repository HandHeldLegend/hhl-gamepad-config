/**
 * updater.js: Controller firmware updates, HOJA installs on bare boards, and recovery.
 *
 * This is hoja2's firmware state machine (js/app.js) moved into its own module with a stepped
 * dialog UI. Modes:
 *
 *   hidden               nothing in progress
 *   update-available     connected controller has newer firmware → [Enter update mode]
 *   awaiting-bootloader  we asked it to reboot into BOOTSEL; waiting for the RP2 bootloader
 *   bootloader-flash     bootloader present and we know which firmware to write → flashing
 *   bootloader-install   bare bootloader, nothing known → user picks a build to install
 *   uf2-drive-select     PICOBOOT unavailable → user picks the RPI-RP2/RP2350 drive (or downloads)
 *   erase-flash          "Start fresh": writing the universal flash nuke (UF2 only → drive picker)
 *   awaiting-erase       nuke written; the wiped board reboots straight back into BOOTSEL → then
 *                        bootloader-flash writes the chosen firmware
 *   update-complete      done; reconnect when the controller reboots
 *
 * "Start fresh" (Reinstall + installer) inserts an Erase step: the image order is always
 * NUKE_BUILD first, then st.pendingUrl. st.erased says which one is next (see flashNext()).
 *
 * The dialog stays open across USB disconnects/reconnects (the controller vanishes and comes
 * back as a different device during an update), exactly like hoja2's header panel did.
 *
 * WLAN dongles: the same flow updates the dongle itself (st.dongle; it reboots with 0xD1). A
 * controller connected through a dongle is never updated: its bootloader can't be reached over
 * Wi-Fi (the firmware refuses the reboot), so the owner is asked to plug in a USB cable instead.
 *
 * Public API:
 *   initFirmware()                 wire session/USB events (called once from main.js)
 *   firmwareStatus()               { state: 'unknown'|'checking'|'current'|'available'|'offline', latest, url }
 *   openUpdateWizard({reinstall})  show the update flow for the connected controller (reinstall
 *                                  offers "Keep my settings" / "Start fresh")
 *   openInstallWizard(buildId?)    show the install flow (bare bootloader)
 *   checkDongleUpdate()            newest firmware for the connected WLAN dongle (null without one)
 *   openDongleUpdateWizard()       update the connected WLAN dongle
 *   formatFwVersion(n)             human-readable build stamp
 */
import { h, replace, fillNodes } from '../ui/dom.js';
import { openDialog, toast } from '../ui/overlay.js';
import { callout, progressBar, select } from '../ui/controls.js';
import { session } from '../device/session.js';
import { device, isPicoBootloader } from '../device/hoja-device.js';
import { isDemo } from '../device/mock.js';
import { prefs } from '../app/prefs.js';
import { listBuilds, getBuildManifest, dongleBuild, NUKE_BUILD } from './builds.js';
import { loadChangelog, pendingActions, buildIdFromManifestUrl, inlineRuns } from './changelog.js';
import {
  pico_update_attempt_flash, pico_exit_bootloader_attempt, pico_complete_uf2_picker_flash,
  pico_has_cached_uf2, pico_get_cached_uf2, supportsDirectoryPicker, setUpdateStatus, onFlashProgress,
} from './picoboot.js';
import { t, N_, fmt } from '../i18n/index.js';
import { fetchableUrl } from './urls.js';

// ---- Debug switches (same URL params as hoja2): ?debug=force-update forces the update prompt.
const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug') && !['0', 'false', 'off'].includes((params.get('debug') || '1').toLowerCase());
let debugForce = DEBUG && (params.get('debug') === 'force-update' || params.get('forceUpdate') === '1' || params.get('force-update') === '1');
export const debugForceUpdate = { get: () => debugForce, set: (v) => { debugForce = !!v; } };

// Step bar. "Start fresh" inserts an Erase step between Restart and Write.
const STEP_LABELS = { prepare: N_('Prepare'), restart: N_('Restart'), erase: N_('Erase'), write: N_('Write'), done: N_('Done') };
const stepPlan = () => (st.fresh ? ['prepare', 'restart', 'erase', 'write', 'done'] : ['prepare', 'restart', 'write', 'done']);
function currentStep() {
  switch (st.mode) {
    case 'update-available': case 'bootloader-install': return 'prepare';
    case 'awaiting-bootloader': return 'restart';
    case 'erase-flash': case 'awaiting-erase': return 'erase';
    case 'bootloader-flash': return 'write';
    case 'uf2-drive-select': return erasing() ? 'erase' : 'write';
    case 'update-complete': return 'done';
    default: return null;
  }
}

const st = {
  mode: 'hidden',
  pendingUrl: undefined,
  pendingChecksum: undefined,
  pendingLegacy: false,
  dongle: false,         // updating a WLAN dongle (reboots with 0xD1; dongle texts)
  bootloaderChip: null,  // 'rp2040' | 'rp2350': the last bootloader seen (filters the installer's dongle builds)
  fresh: false,          // "Start fresh": erase with NUKE_BUILD before writing pendingUrl
  erased: false,         // the nuke has been written in this run
  stagedImage: null,     // 'nuke' | 'firmware': which image picoboot.js staged for the drive picker
  manualUrl: undefined,  // UF2 offered as a manual download in uf2-drive-select
  status: { state: 'unknown', latest: null, url: null },
};

let ui = null; // dialog + elements while visible

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Build stamps are Unix timestamps; show them as a date when they look like one. */
export function formatFwVersion(n) {
  if (n == null) return t('Unknown');
  const v = Number(n) >>> 0;
  if (v > 1.4e9 && v < 4e9) {
    const d = new Date(v * 1000);
    return `${fmt.date(d)} · ${v}`;
  }
  return String(v);
}

export const firmwareStatus = () => st.status;

/** True while the next image to write is the flash nuke. */
const erasing = () => st.fresh && !st.erased;
const currentImageUrl = () => (erasing() ? NUKE_BUILD.uf2Url : st.pendingUrl);

function setStatus(next) {
  st.status = { ...st.status, ...next };
  session.dispatchEvent(new CustomEvent('firmware', { detail: st.status }));
}

async function fetchManifest(url) {
  if (!url) return null;
  try {
    const res = await fetch(fetchableUrl(url), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.fw_version ? { version: data.fw_version, checksum: data.checksum } : null;
  } catch {
    return null; // offline
  }
}

// ---------------------------------------------------------------------------------------------
// Dialog UI
// ---------------------------------------------------------------------------------------------

function ensureUi() {
  if (ui) return ui;
  const steps = h('div.steps', [1, 2, 3, 4].map(() => h('span.step')));
  const guide = h('p.muted');
  const notes = h('div'); // "Action" changelog entries for this update (showUpdateNotes)
  const backup = h('div'); // "Back up first" (src/sections/backup), while the controller is connected
  const progress = progressBar({ message: t('Ready') });

  const installConfirm = h('input', { type: 'checkbox' });
  const buildSelect = h('div');
  const picker = h('div.stack', { style: { '--gap': '12px' } },
    h('label.field-label', t('Choose your controller')), buildSelect,
    h('label.row.small', { style: { flexWrap: 'nowrap', alignItems: 'flex-start', '--gap': '10px' } }, installConfirm,
      h('span', t('I understand that installing the wrong firmware can brick this controller, and recovery may require opening it up to reach BOOTSEL again.'))));
  picker.hidden = true;

  const tips = callout({ tone: 'blue', title: t('In the folder window:') },
    h('ol', { style: { margin: '6px 0 0', paddingLeft: '1.2em' } }, driveSteps().map((s) => h('li', s))));
  tips.hidden = true;

  // Brave ships with the folder picker turned off: say where to turn it on.
  const folderHint = callout({ tone: 'yellow', title: t('Folder access is off in Brave') },
    h('p.small', { style: { margin: '4px 0 0' } }, t('To copy the firmware straight to {drive}, open {flag}, set it to Enabled and restart Brave.', { drive: 'RPI-RP2', flag: 'brave://flags/#file-system-access-api' })));
  folderHint.hidden = true;

  // Keep my settings / Start fresh (Reinstall + installer). Start fresh needs an explicit danger confirm.
  const keepRadio = h('input', { type: 'radio', name: 'fw-fresh', value: 'keep', checked: true });
  const freshRadio = h('input', { type: 'radio', name: 'fw-fresh', value: 'fresh' });
  const eraseConfirm = h('input', { type: 'checkbox' });
  const eraseWarn = callout({ tone: 'red', title: t('This erases all settings, calibration and pairings.') },
    h('p.small', { style: { margin: '4px 0 8px' } }, t('The whole flash is wiped first, then the firmware is written. The controller restarts in between, so keep it plugged in. Afterwards, calibrate the sticks and pair again.')),
    h('label.row.small', { style: { flexWrap: 'nowrap', alignItems: 'flex-start', '--gap': '10px' } }, eraseConfirm,
      h('span', t('Yes, erase everything on this controller'))));
  eraseWarn.hidden = true;
  const option = (input, title, text, cls) => h('label.fw-choice', { class: cls }, input,
    h('span', h('strong', title), h('span.small.muted', text)));
  const freshChoice = h('fieldset.fw-fresh',
    h('legend.field-label', t('Your settings')),
    option(keepRadio, t('Keep my settings'), t('Write the firmware over the current one. Settings, calibration and pairings stay.')),
    option(freshRadio, t('Start fresh: erase everything first'), t('Wipe the controller completely, then write the firmware. Try this if it misbehaves even after a reinstall.'), 'danger'),
    eraseWarn);
  freshChoice.hidden = true;
  const stepCaption = h('p.small.muted.fw-step-caption');
  const style = h('style', `
    .fw-step-caption { margin: 6px 0 0; }
    .fw-fresh { border: 0; padding: 0; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    .fw-fresh[hidden] { display: none; }
    .fw-fresh legend { padding: 0; margin-bottom: 8px; }
    .fw-choice { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border);
      border-radius: var(--radius-md); cursor: pointer; transition: background-color var(--dur-med), border-color var(--dur-med); }
    .fw-choice input { margin-top: 3px; flex: none; }
    .fw-choice > span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .fw-choice:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
    .fw-choice.danger:has(input:checked) { border-color: var(--red); background: var(--red-soft); }`);

  const dlg = openDialog({
    title: t('Firmware'), icon: 'firmware', tone: 'blue', dismissible: false,
    body: [style, steps, stepCaption, guide, notes, backup, picker, freshChoice, folderHint, tips, progress],
  });

  ui = { dlg, steps, stepCaption, guide, notes, backup, progress, picker, buildSelect, installConfirm, tips, folderHint, select: null,
    freshChoice, keepRadio, freshRadio, eraseConfirm, eraseWarn };
  installConfirm.addEventListener('change', refreshInstallState);
  const onFreshChange = () => {
    st.fresh = freshRadio.checked;
    eraseWarn.hidden = !st.fresh;
    if (!st.fresh) eraseConfirm.checked = false;
    paintSteps();
    if (st.mode === 'update-available') updateAvailableActions();
    if (st.mode === 'bootloader-install') installActions();
  };
  keepRadio.addEventListener('change', onFreshChange);
  freshRadio.addEventListener('change', onFreshChange);
  eraseConfirm.addEventListener('change', () => {
    if (st.mode === 'update-available') updateAvailableActions();
    refreshInstallState();
  });
  onFlashProgress(({ percent, message, flashing }) => {
    if (!ui) return;
    if (percent != null) ui.progress.set(percent, message);
    else ui.progress.set(null, message);
    ui.progress.busy(flashing && percent < 100);
  });
  dlg.result.then(() => { ui = null; onFlashProgress(null); });
  return ui;
}

/**
 * Where to find the boot drive in the browser's folder window, for this system. The window is a
 * folder chooser, so it only lists folders: the drive looks empty (its INFO_UF2.TXT isn't shown),
 * which the steps call out. Browsers give pages no option to show files there.
 */
function driveSteps() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || '';
  const drives = { drive: h('strong', 'RPI-RP2'), drive2: h('strong', 'RP2350') };
  const b = (text) => h('strong', text);
  const allow = t('If the browser asks to let this site edit files, allow it. Writing starts right after.');
  if (/Windows/i.test(platform) || /Windows/i.test(ua)) {
    return [
      fillNodes(t('In the left sidebar, click {place}.'), { place: b(t('This PC')) }),
      fillNodes(t('Click the drive named {drive} (or {drive2}) once to select it.'), drives),
      fillNodes(t('Press {button}. The drive looks empty in this window because it only shows folders. That’s normal.'), { button: b(t('Select Folder')) }),
      allow,
    ];
  }
  if (/mac/i.test(platform) || /Macintosh/.test(ua)) {
    return [
      fillNodes(t('In the left sidebar under {section}, click {drive} (or {drive2}).'), { section: b(t('Locations')), ...drives }),
      fillNodes(t('Press {button}. The drive may look empty in this window. That’s normal.'), { button: b(t('Select')) }),
      allow,
    ];
  }
  return [
    fillNodes(t('Find {drive} (or {drive2}) in the sidebar with your other drives and select it.'), drives),
    fillNodes(t('Press {button}. The drive may look empty in this window. That’s normal.'), { button: b(t('Select')) }),
    allow,
  ];
}

function paint(title, text, { tone = 'blue', icon = 'firmware' } = {}) {
  const u = ensureUi();
  u.dlg.setTitle(title);
  u.dlg.setIcon(icon, tone);
  u.guide.textContent = text;
  paintSteps();
}

function paintSteps() {
  if (!ui) return;
  const plan = stepPlan();
  const cur = currentStep();
  const n = plan.indexOf(cur) + 1;
  const done = st.mode === 'update-complete';
  ui.steps.replaceChildren(...plan.map((_, i) => {
    const s = h('span.step');
    s.dataset.state = done || i + 1 < n ? 'done' : i + 1 === n ? 'active' : '';
    return s;
  }));
  ui.stepCaption.textContent = n ? t('Step {n} of {total}: {name}', { n, total: plan.length, name: t(STEP_LABELS[cur]) }) : '';
}

/** Show/hide the optional dialog panels (build picker, keep/fresh choice, drive-picker tips). */
function panels({ picker = false, fresh = false, tips = false, folderHint = false } = {}) {
  const u = ensureUi();
  u.picker.hidden = !picker;
  u.freshChoice.hidden = !fresh;
  u.tips.hidden = !tips;
  u.folderHint.hidden = !folderHint;
}

function resetFresh() {
  st.fresh = false;
  st.erased = false;
  st.stagedImage = null;
  st.manualUrl = undefined;
  if (!ui) return;
  ui.keepRadio.checked = true;
  ui.eraseConfirm.checked = false;
  ui.eraseWarn.hidden = true;
}

/**
 * Set the dialog buttons. primary: { label, icon, enabled, run } ; restart / dismiss booleans.
 */
function actions({ primary, restart = false, dismiss = true, drive = false }) {
  const u = ensureUi();
  const list = [];
  if (dismiss) list.push({ label: st.mode === 'update-complete' ? t('Close') : t('Dismiss'), variant: 'ghost', keepOpen: true, onClick: () => { hide(); return false; } });
  if (restart) list.push({ label: t('Restart controller'), icon: 'refresh', variant: 'tonal', keepOpen: true, onClick: restartFromBootloader });
  // Way around WebUSB (e.g. the controller isn't listed in the browser's device window): the drive copy.
  if (drive) list.push({ label: t('Use the RPI-RP2 drive instead'), icon: 'upload', variant: 'tonal', keepOpen: true, onClick: () => { flashNext({ drive: true }); return false; } });
  if (primary) {
    list.push({
      id: 'primary', label: primary.label, icon: primary.icon, variant: primary.variant || 'primary', disabled: primary.enabled === false, keepOpen: true,
      onClick: async () => {
        const btn = u.dlg.action('primary');
        if (btn) btn.disabled = true;
        try { await primary.run(); } catch (err) { console.error(err); setUpdateStatus(err?.message ? t(err.message) : t('Something went wrong'), 0, false); }
        if (ui && ui.dlg.action('primary') === btn && btn) btn.disabled = primary.enabled === false;
        return false;
      },
    });
  }
  u.dlg.setActions(list);
}

/**
 * "Restart controller" in the wizard: on success the board leaves BOOTSEL, so there's nothing left to
 * do here: close the wizard (state → hidden, so a later bootloader appearance starts over) and leave
 * one calm toast. On failure the dialog stays open with picoboot.js's error in the progress line.
 */
async function restartFromBootloader() {
  const ok = await pico_exit_bootloader_attempt();
  if (ok === true) {
    hide();
    toast(t('Controller restarting: press Connect when it’s back'), { icon: 'refresh', timeout: 4500 });
  }
  return false;
}

function hide() {
  st.mode = 'hidden';
  st.pendingUrl = undefined;
  st.pendingChecksum = undefined;
  st.pendingLegacy = false;
  st.dongle = false;
  resetFresh();
  ui?.dlg.close();
  ui = null;
}

// ---------------------------------------------------------------------------------------------
// States (ported 1:1 from hoja2)
// ---------------------------------------------------------------------------------------------

function showUpdateAvailable(url, checksum, { legacy = false, debugForced = false, reinstall = false, dongle = false } = {}) {
  ensureUi();
  resetFresh();
  st.pendingUrl = url;
  st.pendingChecksum = checksum;
  st.pendingLegacy = legacy;
  st.dongle = dongle;
  st.mode = 'update-available';
  const u = ensureUi();
  panels({ fresh: reinstall && !legacy && !dongle });
  if (dongle) {
    paint(t('WLAN dongle update'), t('A newer dongle firmware is available. First the dongle restarts into update mode, then the new firmware is written. Keep it plugged in the whole time.'), { icon: 'download' });
  } else paint(debugForced ? t('Update available (debug)') : legacy ? t('This controller needs new firmware') : reinstall ? t('Reinstall firmware') : t('Firmware update available'),
    legacy
      ? t('This controller is running older firmware that this app can’t configure. Update it to unlock every setting.')
      : debugForced
        ? t('Debug mode: forcing the update flow even though firmware is current.')
        : reinstall
          ? t('Writes the latest firmware again. First the controller restarts into update mode, then the firmware is written. Keep it plugged in the whole time.')
          : t('A newer firmware is available. First the controller restarts into update mode, then the new firmware is written. Keep it plugged in the whole time.'),
    { icon: 'download' });
  u.progress.set(0, t('Ready'));
  u.progress.busy(false);
  updateAvailableActions();
  showUpdateNotes();
  showBackupPrompt();
}

/** Settings backup offer before updating (optional feature in src/sections/backup; loaded lazily). */
async function showBackupPrompt() {
  const u = ui;
  if (!u) return;
  replace(u.backup);
  if (!session.connected || st.pendingLegacy || st.dongle) return;
  const { backupPrompt } = await import('../sections/backup/card.js').catch(() => ({}));
  if (ui === u && st.mode === 'update-available' && backupPrompt) replace(u.backup, backupPrompt(session));
}

/**
 * Things the owner has to do after this update ("Action" entries in the firmware changelog that are
 * newer than the installed build). Shown from the first step and left up until the dialog closes.
 */
async function showUpdateNotes() {
  const u = ui;
  if (!u) return;
  replace(u.notes);
  if (st.dongle) return;
  const buildId = buildIdFromManifestUrl(session.info?.manifestUrl);
  if (!buildId) return;
  const res = await loadChangelog();
  const actions = res ? pendingActions(res.log, buildId, session.info?.fwVersion) : [];
  if (!actions.length || ui !== u) return;
  replace(u.notes, callout({ tone: 'yellow', title: t('After this update:') },
    h('ul', { style: { margin: '6px 0 0', paddingLeft: '1.2em' } },
      actions.map((a) => h('li', inlineRuns(a.text).map((r) => (r.code ? h('code', r.text) : r.text)))))));
}

function updateAvailableActions() {
  actions({ primary: st.fresh
    ? { label: t('Erase and reinstall'), icon: 'trash', variant: 'danger', enabled: !!ui?.eraseConfirm.checked, run: enterBootloader }
    : { label: t('Enter update mode'), icon: 'firmware', run: enterBootloader } });
}

async function enterBootloader() {
  st.mode = 'awaiting-bootloader';
  if (ui) replace(ui.backup);
  paint(t('Entering update mode'), t('Restarting into update mode. This takes a few seconds.'));
  setUpdateStatus(t('Sending reboot to bootloader…'), 10, true);
  panels();
  actions({ primary: { label: t('Update'), icon: 'download', run: () => flashNext({ allowRequestDevice: true }) } });
  try {
    if (st.pendingLegacy) device.rebootToBootloaderLegacy().catch(() => {});
    else if (st.dongle) await device.rebootDongleToBootloader();
    else await device.rebootToBootloader();
  } catch (err) {
    // The device often drops off USB mid-transfer; that's success for us.
    console.warn('[fw] reboot command:', err?.message || err);
  }
  setUpdateStatus(t('Waiting for the bootloader…'), 30, true);
  // If the browser already trusts the bootloader, flashing starts by itself within a second or two.
  // Otherwise it needs a click (WebUSB only shows a new device after a user gesture), so don't leave
  // a busy spinner up: after a short wait, ask for the click clearly.
  clearTimeout(st.nudgeTimer);
  st.nudgeTimer = setTimeout(showPressUpdate, NUDGE_MS);
}

/** How long to wait for an automatic start before asking the user to press Update. */
const NUDGE_MS = 3500;

/** awaiting-bootloader, and nothing started on its own: make the next action unmistakable. */
function showPressUpdate() {
  if (st.mode !== 'awaiting-bootloader') return;
  paint(t('One more step: press Update'), t('Your controller is now in update mode. Press Update, then choose “RP2 Boot” (or “RP2350 Boot”) in the window your browser opens and press Connect.'), { icon: 'download' });
  setUpdateStatus(t('Waiting for you to press Update'), 30, false);
  actions({ primary: { label: t('Update'), icon: 'download', run: () => flashNext({ allowRequestDevice: true }) }, drive: true });
  ui?.dlg.action('primary')?.classList.add('btn-attention');
}

function showBootloaderFlash() {
  st.mode = 'bootloader-flash';
  panels();
  paint(t('Writing firmware'), t('Don’t unplug the controller. If direct USB flashing is blocked, you’ll get simple steps to pick the RPI-RP2 drive.'));
  setUpdateStatus(t('Bootloader detected'), 40, true);
  // While writing, Update and Restart would interrupt the write: show Update disabled, no Restart.
  actions({ primary: { label: t('Update'), icon: 'download', enabled: false, run: () => {} }, dismiss: false });
}

function showUf2DriveStep() {
  st.mode = 'uf2-drive-select';
  st.manualUrl = undefined;
  panels({ tips: true });
  paint(t('Select the RPI-RP2 drive'), erasing()
    ? t('The erase tool is copied onto the RPI-RP2 drive. Read the steps, then press the button. A folder dialog will open on top of this window.')
    : t('The firmware is ready to copy onto the RPI-RP2 drive. Read the steps, then press the button. A folder dialog will open on top of this window.'),
  { icon: erasing() ? 'trash' : 'download', tone: erasing() ? 'red' : 'blue' });
  setUpdateStatus(t('Ready: pick RPI-RP2 in the next dialog'), 100, false);
  actions({ primary: { label: t('Select RPI-RP2'), icon: 'upload', run: completeUf2Step }, restart: true });
}

function showManualUf2Step(uf2Url) {
  st.mode = 'uf2-drive-select';
  st.manualUrl = uf2Url;
  panels({ folderHint: !!navigator.brave && !supportsDirectoryPicker() });
  paint(t('Copy the UF2 to RPI-RP2'), t('Download the UF2 file, then copy it onto the drive named RPI-RP2 (or RP2350). The controller restarts when the copy finishes.'), { icon: 'download' });
  setUpdateStatus(t('Download the UF2, then copy it to RPI-RP2'), 100, false);
  actions({ primary: { label: t('Download UF2'), icon: 'download', run: completeUf2Step } });
}

function showUpdateComplete() {
  const dongle = st.dongle;
  st.mode = 'update-complete';
  st.dongle = false;
  st.pendingUrl = undefined;
  st.pendingChecksum = undefined;
  st.pendingLegacy = false;
  st.stagedImage = null;
  st.manualUrl = undefined;
  const u = ensureUi();
  panels();
  const text = dongle
    ? t('The dongle firmware was written. Give the dongle a moment to restart, then press Connect.')
    : st.fresh
      ? t('The controller was erased and the firmware was written. Give it a moment to restart, then press Connect. After that, calibrate the sticks and pair again.')
      : t('Firmware was written successfully. Give the controller a moment to restart, then press Connect.');
  paint(t('Update complete'), text, { tone: 'green', icon: 'check' });
  setUpdateStatus(t('Done: connect when ready'), 100, true);
  u.progress.busy(false);
  import('../sections/backup/card.js').then(({ backedUpThisSession }) => {
    if (ui === u && !dongle && backedUpThisSession()) replace(u.backup, callout({ tone: 'blue', icon: 'save', text: t('Settings reset by the update? Restore your backup from the Firmware page once connected.') }));
  }).catch(() => {});
  actions({ primary: { label: t('Connect'), icon: 'usb', run: async () => { hide(); const { connectController } = await import('../app/shell.js'); connectController(); } } });
  setStatus({ state: 'unknown' });
}

async function showBootloaderInstall(preselect) {
  ensureUi();
  resetFresh();
  st.pendingUrl = undefined;
  st.pendingChecksum = undefined;
  st.pendingLegacy = false;
  st.mode = 'bootloader-install';
  const u = ensureUi();
  panels({ picker: true, fresh: true });
  u.installConfirm.checked = false;
  paint(t('Install HOJA firmware?'), t('A Raspberry Pi bootloader (BOOTSEL) was detected. Choose your controller below, then press Install.'), { icon: 'firmware' });
  setUpdateStatus(t('Choose a controller to continue'), 0, false);
  installActions();

  u.buildSelect.replaceChildren(h('span.muted.small', t('Loading builds…')));
  await fillBuildSelect(preselect);
}

/**
 * The installer's build list: controllers, then WLAN dongles (only those for the bootloader's chip,
 * once one has been seen), then the flash nuke. Runs again when a bootloader of the other chip appears.
 */
async function fillBuildSelect(preselect) {
  const { builds, dongles, offline } = await listBuilds();
  const u = ui;
  if (!u || st.mode !== 'bootloader-install') return;
  const forChip = dongles.filter((b) => !st.bootloaderChip || !b.chip || b.chip === st.bootloaderChip);
  const dongleGroup = t('WLAN dongle');
  const options = [{ value: '', label: t('Choose a controller…') },
    ...builds.map((b) => ({ value: b.id, label: b.label })),
    ...forChip.map((b) => ({ value: b.id, label: t(b.label), group: dongleGroup })),
    { value: NUKE_BUILD.id, label: t(NUKE_BUILD.label) }];
  const value = options.some((o) => o.value === preselect) ? preselect : '';
  u.select = select({ options, value, ariaLabel: t('Controller build'), onChange: refreshInstallState });
  u.select.style.width = '100%';
  replace(u.buildSelect, u.select, offline && h('p.small.muted', { style: { marginTop: '6px' } }, t('Offline: showing the last known list. Installing needs an internet connection.')));
  u.builds = [...builds, ...forChip, NUKE_BUILD];
  refreshInstallState();
}

function installActions() {
  actions({ primary: st.fresh
    ? { label: t('Erase and install'), icon: 'trash', variant: 'danger', enabled: false, run: runInstall }
    : { label: t('Install'), icon: 'download', enabled: false, run: runInstall }, restart: true });
  refreshInstallState();
}

function refreshInstallState() {
  if (st.mode !== 'bootloader-install' || !ui) return;
  const value = ui.select?.value;
  // The nuke on its own already erases everything, so "Start fresh" doesn't apply to it.
  const nukeOnly = value === NUKE_BUILD.id;
  ui.freshChoice.hidden = nukeOnly;
  if (nukeOnly && st.fresh) { ui.keepRadio.checked = true; ui.keepRadio.dispatchEvent(new Event('change')); return; }
  const ok = !!value && ui.installConfirm.checked && (!st.fresh || ui.eraseConfirm.checked);
  const btn = ui.dlg.action('primary');
  if (btn) btn.disabled = !ok;
}

async function resolveInstallSelection() {
  const id = ui?.select?.value;
  const build = ui?.builds?.find((b) => b.id === id);
  if (!build) return null;
  const manifest = await getBuildManifest(build.manifestUrl);
  return { url: build.uf2Url, checksum: manifest?.checksum || null };
}

async function runInstall() {
  const fw = await resolveInstallSelection();
  if (!fw) { setUpdateStatus(t('Choose a controller first.'), 0, false); return; }
  st.pendingUrl = fw.url;
  st.pendingChecksum = fw.checksum;
  // Installing the nuke itself is a plain one-image install.
  st.fresh = st.fresh && fw.url !== NUKE_BUILD.uf2Url;
  await flashNext({ allowRequestDevice: true });
}

/** Write whichever image is next: the flash nuke first when starting fresh, then the chosen firmware. */
function flashNext(opts) {
  return erasing() ? startEraseFlash(opts) : startBootloaderFlash(opts);
}

/** An image finished writing (PICOBOOT, drive picker or manual copy). */
function onImageWritten() {
  if (erasing()) { st.erased = true; showEraseWait(); return; }
  showUpdateComplete();
}

function applyFlashResult(result) {
  if (result === true) { onImageWritten(); return true; }
  if (result?.needsUserAction) {
    if (result.reason === 'directory-picker') { st.stagedImage = erasing() ? 'nuke' : 'firmware'; showUf2DriveStep(); return true; }
    if (result.reason === 'manual-download') {
      st.stagedImage = pico_has_cached_uf2() ? (erasing() ? 'nuke' : 'firmware') : null;
      showManualUf2Step(result.uf2Url);
      if (result.error) setUpdateStatus(t('Automatic download blocked ({reason}). Download the UF2, then copy it to RPI-RP2', { reason: result.error }), 100, false);
      return true;
    }
    paint(t('Permission needed'), t('Press Update and allow access to the Pico bootloader in the browser popup.'));
    setUpdateStatus(t('Press Update to continue'), 0, false);
    actions({ primary: { label: t('Authorize'), icon: 'usb', run: () => flashNext({ allowRequestDevice: true }) }, restart: true });
    return true;
  }
  return false;
}

/** drive: skip WebUSB and go straight to the RPI-RP2 drive copy (folder picker, else a download). */
async function startBootloaderFlash({ allowRequestDevice = true, drive = false } = {}) {
  if (!st.pendingUrl) { setUpdateStatus(t('No firmware selected.'), 0, false); return false; }
  if (st.flashing) return false; // a write is already running (auto-start or an earlier click)
  st.stagedImage = null;
  showBootloaderFlash();
  st.mode = 'bootloader-flash';
  // The nuke picked on its own in the installer has no .bin either.
  const uf2Only = drive || st.pendingUrl === NUKE_BUILD.uf2Url;
  let result = false;
  st.flashing = true;
  try {
    result = await pico_update_attempt_flash(st.pendingUrl, st.pendingChecksum, { allowRequestDevice, uf2Only });
  } finally {
    st.flashing = false;
  }
  if (applyFlashResult(result)) return true;
  showFlashRetry(() => startBootloaderFlash({ allowRequestDevice: true }));
  return false;
}

/**
 * A write ended without finishing (including a closed device window): offer Update (retry), the drive
 * copy and Restart; picoboot.js left the reason in the status line.
 */
function showFlashRetry(run) {
  actions({ primary: { label: t('Update'), icon: 'download', run }, restart: true, drive: true });
}

function showEraseFlash() {
  st.mode = 'erase-flash';
  panels();
  paint(t('Erasing the controller'), t('Wiping settings, calibration and pairings. Don’t unplug the controller. When the erase finishes, it restarts into the bootloader on its own.'), { tone: 'red', icon: 'trash' });
  setUpdateStatus(t('Preparing the erase…'), 0, true);
  actions({ primary: { label: t('Erase'), icon: 'trash', variant: 'danger', enabled: false, run: () => {} }, dismiss: false });
}

/** Write the universal flash nuke. It has no .bin, so it always goes through the UF2 path. */
async function startEraseFlash({ allowRequestDevice = true } = {}) {
  if (st.flashing) return false;
  st.stagedImage = null;
  showEraseFlash();
  let result = false;
  st.flashing = true;
  try {
    result = await pico_update_attempt_flash(NUKE_BUILD.uf2Url, null, { allowRequestDevice, uf2Only: true });
  } finally {
    st.flashing = false;
  }
  if (applyFlashResult(result)) return true;
  actions({ primary: { label: t('Erase'), icon: 'trash', variant: 'danger', run: () => startEraseFlash({ allowRequestDevice: true }) }, restart: true });
  return false;
}

function showEraseWait() {
  st.mode = 'awaiting-erase';
  st.stagedImage = null;
  st.manualUrl = undefined;
  panels();
  paint(t('Erasing: waiting for the bootloader'), t('The controller is wiping itself and comes back as {drive} in a few seconds. Writing the firmware then starts automatically. If nothing happens, press Continue.', { drive: 'RPI-RP2' }));
  setUpdateStatus(t('Waiting for the bootloader…'), null, true);
  actions({ primary: { label: t('Continue'), icon: 'download', run: () => startBootloaderFlash({ allowRequestDevice: true }) } });
}

/** Save the UF2 to Downloads (no new tab). Uses the staged bytes when they're for this image. */
async function saveUf2(imageUrl, staged) {
  let data = staged ? pico_get_cached_uf2() : null;
  if (!data) {
    try {
      const res = await fetch(fetchableUrl(imageUrl), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.arrayBuffer();
    } catch (err) {
      // The host doesn't let this page read the file: let the browser fetch it.
      console.warn('UF2 fetch for save failed:', err);
      window.open(imageUrl, '_blank');
      return;
    }
  }
  const name = decodeURIComponent(new URL(imageUrl, location.href).pathname.split('/').pop() || '') || 'firmware.uf2';
  const href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const a = h('a', { href, download: name.endsWith('.uf2') ? name : 'firmware.uf2' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

async function completeUf2Step() {
  const imageUrl = st.manualUrl || currentImageUrl();
  // Only reuse the staged file if it's the image this step is for (never re-send the nuke by mistake).
  const staged = pico_has_cached_uf2() && st.stagedImage === (erasing() ? 'nuke' : 'firmware');
  if (staged && supportsDirectoryPicker()) {
    try {
      await pico_complete_uf2_picker_flash();
      onImageWritten();
      return;
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || err).toLowerCase();
      if (imageUrl && (msg.includes('security policy') || msg.includes('folder picker'))) {
        await saveUf2(imageUrl, true);
        st.stagedImage = null;
        showManualUf2Step(imageUrl);
        return;
      }
      setUpdateStatus(err.message ? t(err.message) : t('Folder selection failed.'), 0, false);
      return;
    }
  }
  if (imageUrl) {
    await saveUf2(imageUrl, staged);
    onImageWritten();
    return;
  }
  setUpdateStatus(t('No firmware file ready.'), 0, false);
}

// ---------------------------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------------------------

const ACTIVE = ['awaiting-bootloader', 'bootloader-flash', 'bootloader-install', 'uf2-drive-select', 'erase-flash', 'awaiting-erase', 'update-complete'];

/**
 * Quiet mode (the factory station runs its own flow): no automatic update or install dialogs on
 * connect, bootloader or legacy firmware. Manual entry points still work.
 */
let quiet = false;
export function setUpdaterQuiet(on) { quiet = !!on; }

/** Remember which chip the bootloader is (RP2350 enumerates as PID 0x000f, RP2040 as 0x0003). */
function noteBootloader(usb) {
  if (!usb) return;
  const chip = usb.productId === 0x000f ? 'rp2350' : 'rp2040';
  if (chip === st.bootloaderChip) return;
  st.bootloaderChip = chip;
  if (st.mode === 'bootloader-install') fillBuildSelect(ui?.select?.value);
}

async function onBootloaderConnect(usb) {
  noteBootloader(usb);
  if (quiet) return;
  if (st.mode === 'uf2-drive-select' || st.mode === 'bootloader-flash' || st.mode === 'erase-flash') return;
  if (st.mode === 'update-complete' && !st.pendingUrl) { await showBootloaderInstall(); return; }
  if (st.pendingUrl) {
    // awaiting-bootloader → nuke (start fresh) or firmware; awaiting-erase → the firmware.
    try { await flashNext({ allowRequestDevice: false }); } catch (err) {
      console.error('[fw] auto-flash failed', err);
      setUpdateStatus(t('Press Update to retry'), 0, false);
    }
    return;
  }
  if (st.mode !== 'bootloader-install') await showBootloaderInstall();
}

function onBootloaderDisconnect() {
  if (st.mode === 'hidden') return; // e.g. the board leaving BOOTSEL after "Restart controller": nothing to do
  if (ACTIVE.includes(st.mode)) return; // keep the dialog through reboots
  hide();
}

/** Shown where an update would start for a controller connected through a WLAN dongle (it can't be updated that way). */
export const CABLE_UPDATE_TEXT = N_('An update is available. Connect the controller with a USB cable to update it.');
export const CABLE_ONLY_TEXT = N_('Connect the controller with a USB cable to update it.');

async function onControllerConnect() {
  if (quiet) return;
  if (isDemo()) { setStatus({ state: 'current', latest: null }); if (st.mode !== 'hidden') hide(); return; }
  const info = session.info;
  let shown = false;
  if (prefs.get('autoUpdateCheck') !== false || debugForce) {
    setStatus({ state: 'checking' });
    const latest = await fetchManifest(info.manifestUrl);
    if (!latest) setStatus({ state: navigator.onLine === false ? 'offline' : 'unknown', latest: null });
    const available = latest && latest.version > (info.fwVersion >>> 0);
    if (latest) setStatus({ state: available ? 'available' : 'current', latest: latest.version, url: info.firmwareUrl, checksum: latest.checksum });
    if (session.caps.viaDongle) {
      // Through a WLAN dongle the controller can't reach its bootloader: say so instead of offering it.
      if (available) toast(t(CABLE_UPDATE_TEXT), { tone: 'blue', icon: 'usb', timeout: 8000 });
    } else if ((available || debugForce) && info.firmwareUrl) {
      showUpdateAvailable(info.firmwareUrl, latest?.checksum ?? null, { debugForced: !available && debugForce });
      shown = true;
    }
  }
  // A HOJA controller connected, so any stale install prompt is moot.
  if (!shown && st.mode !== 'hidden') hide();
}

function onControllerDisconnect() {
  if (st.mode === 'update-available') hide();
  if (!ACTIVE.includes(st.mode)) setStatus({ state: 'unknown', latest: null });
}

/** A WLAN dongle with no controller connected: like a controller, it makes a stale install prompt moot. */
function onDongleConnect() {
  if (quiet) return;
  if (st.mode !== 'hidden') hide();
}

export function initFirmware() {
  session.on('state', ({ state }) => {
    if (state === 'connected') onControllerConnect();
    if (state === 'dongle') onDongleConnect();
    if (state === 'disconnected') onControllerDisconnect();
  });
  session.on('legacy', ({ url }) => {
    if (quiet) return;
    if (url) showUpdateAvailable(url, null, { legacy: true });
    else toast(t('This controller runs legacy firmware we don’t recognize. Use Firmware → Install with BOOTSEL.'), { tone: 'yellow', timeout: 8000 });
  });
  session.on('bootloader', ({ usb }) => onBootloaderConnect(usb));

  if (navigator.usb) {
    navigator.usb.addEventListener('connect', (e) => { if (isPicoBootloader(e.device)) onBootloaderConnect(e.device); });
    navigator.usb.addEventListener('disconnect', (e) => { if (isPicoBootloader(e.device)) onBootloaderDisconnect(); });
    navigator.usb.getDevices().then(async (devs) => {
      noteBootloader(devs.find(isPicoBootloader));
      if (!quiet && devs.some(isPicoBootloader) && !st.pendingUrl) await showBootloaderInstall();
    }).catch((err) => console.warn('[fw] getDevices failed', err));
  }
}

/**
 * Open the update flow for the connected controller (from Home / Firmware page).
 * reinstall: offer "Keep my settings" / "Start fresh: erase everything first".
 */
export async function openUpdateWizard({ reinstall = false } = {}) {
  if (!session.connected) { toast(t('Connect your controller first.'), { tone: 'yellow' }); return; }
  if (session.caps.viaDongle) { toast(t(CABLE_ONLY_TEXT), { tone: 'blue', icon: 'usb', timeout: 6000 }); return; }
  const latest = await fetchManifest(session.info.manifestUrl);
  const url = session.info.firmwareUrl;
  if (!url) { toast(t('This controller doesn’t report a firmware download location.'), { tone: 'yellow' }); return; }
  showUpdateAvailable(url, latest?.checksum ?? null, { reinstall, debugForced: !reinstall && (!latest || !(latest.version > (session.info.fwVersion >>> 0))) ? debugForce : false });
}

/** Open the install flow manually (e.g. Firmware page → "Install on a blank board"). */
export async function openInstallWizard(buildId) {
  await showBootloaderInstall(buildId);
}

/** Reboot the connected controller into BOOTSEL without starting an update (Gamepad page). */
export async function rebootToBootloaderOnly() {
  // Through a WLAN dongle the firmware refuses this: a bootloader can't be reached wirelessly.
  if (session.caps.viaDongle) throw new Error(CABLE_ONLY_TEXT);
  // When the bootloader then appears, onBootloaderConnect() offers the installer (as in hoja2).
  await device.rebootToBootloader();
  return true;
}

/**
 * Newest firmware for the connected WLAN dongle (on its own or with a controller through it), or null
 * without one. latest is null when its build has no manifest (not published yet, or offline): no update.
 * @returns {Promise<{build: object|null, installed: number, latest: number|null, checksum: string|null, available: boolean}|null>}
 */
export async function checkDongleUpdate() {
  const dongle = session.dongle;
  if (!dongle) return null;
  const build = dongleBuild(dongle.board);
  const latest = build ? await fetchManifest(build.manifestUrl) : null;
  return {
    build, installed: dongle.fwVersion, latest: latest?.version ?? null, checksum: latest?.checksum ?? null,
    available: !!latest && latest.version > (dongle.fwVersion >>> 0),
  };
}

/** Update the connected WLAN dongle: it reboots into BOOTSEL (0xD1), then its build is written. */
export async function openDongleUpdateWizard() {
  const u = await checkDongleUpdate();
  if (!u?.build) return;
  showUpdateAvailable(u.build.uf2Url, u.checksum, { dongle: true });
}

/** Restart a controller that's sitting in the bootloader. */
export const exitBootloader = () => pico_exit_bootloader_attempt();

/** Re-check the update manifest for the connected controller. */
export async function checkForFirmwareUpdate() {
  if (!session.connected) return st.status;
  setStatus({ state: 'checking' });
  const latest = await fetchManifest(session.info.manifestUrl);
  if (!latest) setStatus({ state: navigator.onLine === false ? 'offline' : 'unknown' });
  else setStatus({ state: latest.version > (session.info.fwVersion >>> 0) ? 'available' : 'current', latest: latest.version });
  return st.status;
}

// ---- Docs screenshots (?debug only): open the dialog at one step, without a controller.
const DOCS_URL = 'https://raw.githubusercontent.com/HandHeldLegend/hoja-device-fw/main/builds/gcu_2/gcu_2.uf2';
export const debugDialogSteps = DEBUG ? {
  available: () => showUpdateAvailable(DOCS_URL, null),
  writing: () => { st.pendingUrl = DOCS_URL; showBootloaderFlash(); setUpdateStatus(t('Writing firmware…'), 62, true); },
  drive: () => { st.pendingUrl = DOCS_URL; showUf2DriveStep(); },
  manual: () => { st.pendingUrl = DOCS_URL; showManualUf2Step(DOCS_URL); },
  complete: () => { st.pendingUrl = DOCS_URL; showUpdateComplete(); },
  install: () => showBootloaderInstall(),
} : null;
