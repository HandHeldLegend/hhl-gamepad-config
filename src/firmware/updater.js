/**
 * updater.js: Controller firmware updates, HOJA installs on bare boards, and recovery.
 *
 * This is hoja2's firmware state machine (js/app.js) moved into its own module with a stepped
 * dialog UI. Modes:
 *
 *   hidden               nothing in progress
 *   update-available     connected controller has newer firmware → [Enter update mode]
 *   awaiting-bootloader  we asked it to reboot into its bootloader; waiting for it (the RP2 boot ROM,
 *                        or the HOJA update mode on boards with the HOJA bootloader)
 *   bootloader-flash     bootloader present and we know which firmware to write → flashing
 *   bootloader-install   a bootloader with nothing pending → user picks a build to install (the HOJA
 *                        update mode names its build, so that one is chosen already)
 *   uf2-drive-select     PICOBOOT unavailable → user picks the RPI-RP2/RP2350 drive (or downloads)
 *   erase-flash          "Start fresh": writing the universal flash nuke (UF2 only → drive picker)
 *   awaiting-erase       nuke written; the wiped board reboots straight back into BOOTSEL → then
 *                        bootloader-flash writes the chosen firmware
 *   ble-sending          over Bluetooth (ble-update.js): the firmware is going to the controller
 *   ble-restarting       sent: the controller restarts to install it; reconnecting to it
 *   update-complete      done; reconnect when the controller reboots
 *
 * "Start fresh" (Reinstall + installer) inserts an Erase step: the image order is always
 * NUKE_BUILD first, then st.pendingUrl. st.erased says which one is next (see flashNext()).
 *
 * The dialog stays open across USB disconnects/reconnects (the controller vanishes and comes
 * back as a different device during an update), exactly like hoja2's header panel did.
 *
 * Bluetooth: a controller with the HOJA bootloader takes its update over the Bluetooth config link
 * (st.ble): prepare → write (sent) → restart (installs, reconnects) → done, with no USB step.
 *
 * Dongles: the same flow updates the dongle itself (st.dongle; it reboots with 0xD1). A controller
 * connected through a dongle is never updated: its bootloader can't be reached over the wireless
 * link (the firmware refuses the reboot), so the owner is asked to plug in a USB cable instead.
 *
 * Public API:
 *   initFirmware()                 wire session/USB events (called once from main.js)
 *   firmwareStatus()               { state: 'unknown'|'checking'|'current'|'available'|'offline', latest, url }
 *   openUpdateWizard({reinstall})  show the update flow for the connected controller (reinstall
 *                                  offers "Keep my settings" / "Start fresh")
 *   openInstallWizard(buildId?)    show the install flow (bare bootloader)
 *   bleUpdateSupported()           whether the connected controller takes updates over Bluetooth
 *   checkDongleUpdate()            newest firmware for the connected dongle (null without one)
 *   openDongleUpdateWizard()       update the connected dongle
 *   formatFwVersion(n)             human-readable build stamp
 */
import { h, replace, fillNodes } from '../ui/dom.js';
import { openDialog, toast } from '../ui/overlay.js';
import { callout, progressBar, select } from '../ui/controls.js';
import { session } from '../device/session.js';
import { device, isPicoBootloader, updateModeBuildId, isHojaUpdateMode } from '../device/hoja-device.js';
import { isDemo } from '../device/mock.js';
import { prefs } from '../app/prefs.js';
import { isIOS } from '../app/platform.js';
import { listBuilds, getBuildManifest, dongleBuild, NUKE_BUILD } from './builds.js';
import { hojaDriveLabel, hasHojaDrive, romDriveName } from './drives.js';
import { loadChangelog, pendingActions, buildIdFromManifestUrl, inlineRuns } from './changelog.js';
import {
  pico_update_attempt_flash, pico_exit_bootloader_attempt, pico_complete_uf2_picker_flash,
  pico_has_cached_uf2, pico_get_cached_uf2, pico_clear_cached_uf2, supportsDirectoryPicker, setUpdateStatus, onFlashProgress,
  pico_enter_rom_bootloader,
} from './picoboot.js';
import { t, N_, fmt } from '../i18n/index.js';
import { fetchableUrl } from './urls.js';
import { bleUpdate, bleUpdateInfo, reopenBluetooth, BEACON_WAIT_MS } from './ble-update.js';

// ---- Debug switches (same URL params as hoja2): ?debug=force-update forces the update prompt.
const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug') && !['0', 'false', 'off'].includes((params.get('debug') || '1').toLowerCase());
let debugForce = DEBUG && (params.get('debug') === 'force-update' || params.get('forceUpdate') === '1' || params.get('force-update') === '1');
export const debugForceUpdate = { get: () => debugForce, set: (v) => { debugForce = !!v; } };
// ?debug&fw=<url>: update from this image instead of the one the controller reports (an unpublished
// build). Its checksum is unknown, so the .bin is written unchecked.
const DEBUG_FW_URL = DEBUG ? params.get('fw') : null;

// Step bar. "Start fresh" inserts an Erase step between Restart and Write.
const STEP_LABELS = { prepare: N_('Prepare'), restart: N_('Restart'), erase: N_('Erase'), write: N_('Write'), done: N_('Done') };
/** The progress line for each phase of a Bluetooth update (ble-update.js onStatus); translated where shown. */
const BLE_PHASES = {
  download: N_('Downloading firmware…'),
  prepare: N_('Checking the controller…'),
  send: N_('Sending the firmware…'),
  reconnect: N_('The link dropped: reconnecting…'),
  finish: N_('Checking the firmware it received…'),
};
/** UPDATE_INFO asks before a controller over Bluetooth counts as not taking updates that way (for now). */
const BLE_INFO_TRIES = 2;
/** After a Bluetooth update: the controller's beacon wait, and half again in case the install runs long. */
const BLE_RESTART_WAIT_MS = BEACON_WAIT_MS * 1.5;
const stepPlan = () => (st.ble ? ['prepare', 'write', 'restart', 'done']
  : st.fresh ? ['prepare', 'restart', 'erase', 'write', 'done'] : ['prepare', 'restart', 'write', 'done']);
function currentStep() {
  switch (st.mode) {
    case 'update-available': case 'bootloader-install': return 'prepare';
    case 'awaiting-bootloader': case 'ble-restarting': return 'restart';
    case 'ble-sending': return 'write';
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
  dongle: false,         // updating a dongle (reboots with 0xD1; dongle texts)
  ble: false,            // updating over Bluetooth (ble-update.js)
  bleSupported: false,   // the controller connected over Bluetooth said it takes updates that way
  bootloaderChip: null,  // 'rp2040' | 'rp2350': the last bootloader seen (filters the installer's dongle builds)
  fresh: false,          // "Start fresh": erase with NUKE_BUILD before writing pendingUrl
  erased: false,         // the nuke has been written in this run
  stagedImage: null,     // 'nuke' | 'firmware': which image picoboot.js staged for the drive picker
  manualUrl: undefined,  // UF2 offered as a manual download in uf2-drive-select
  wantRom: false,        // "Boot ROM" recovery reboot asked: hand the HOJA update mode on to the boot ROM
  bootUsb: null,         // the bootloader that last appeared (which drive it shows, see bootDrive)
  lastName: '',          // the last connected controller's name (the HOJA drive is named after it)
  status: { state: 'unknown', latest: null, url: null },
};

let ui = null; // dialog + elements while visible
let bleSupportAsk = null; // the UPDATE_INFO exchange under way: callers meanwhile share it

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
    h('p.small', { style: { margin: '4px 0 0' } }, t('To copy the firmware straight to {drive}, open {flag}, set it to Enabled and restart Brave.', { drive: bootDrive().name || t('the controller’s drive'), flag: 'brave://flags/#file-system-access-api' })));
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
 * The drive the controller in its bootloader shows, from the bootloader that last appeared:
 *   { name }        HOJA update mode with its drive (bcdDevice 0xB002+): named after the controller,
 *                   e.g. "GCU 1" (name null when this tab never saw the controller's name);
 *                   or the chip's boot ROM: RPI-RP2 / RP2350
 *   { none: true }  HOJA update mode from before the drive: there is nothing to copy to
 *   { name: null }  no bootloader seen yet
 */
function bootDrive() {
  const usb = st.bootUsb;
  if (usb && isHojaUpdateMode(usb)) return hasHojaDrive(usb) ? { name: hojaDriveLabel(st.lastName) || null } : { none: true };
  if (usb) return { name: romDriveName(usb.productId === 0x000f ? 'rp2350' : 'rp2040') };
  return { name: null };
}

/**
 * Where to find the boot drive in the browser's folder window, for this system. The window is a
 * folder chooser, so it only lists folders: the drive looks empty (its INFO_UF2.TXT isn't shown),
 * which the steps call out. Browsers give pages no option to show files there.
 */
function driveSteps() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || '';
  const name = bootDrive().name;
  const drive = { drive: h('strong', name || '') };
  const b = (text) => h('strong', text);
  const allow = t('If the browser asks to let this site edit files, allow it. Writing starts right after.');
  if (/Windows/i.test(platform) || /Windows/i.test(ua)) {
    return [
      fillNodes(t('In the left sidebar, click {place}.'), { place: b(t('This PC')) }),
      name ? fillNodes(t('Click the drive named {drive} once to select it.'), drive)
        : t('Click the controller’s drive once to select it. It’s named after the controller, or RPI-RP2 / RP2350.'),
      fillNodes(t('Press {button}. The drive looks empty in this window because it only shows folders. That’s normal.'), { button: b(t('Select Folder')) }),
      allow,
    ];
  }
  if (/mac/i.test(platform) || /Macintosh/.test(ua)) {
    return [
      name ? fillNodes(t('In the left sidebar under {section}, click {drive}.'), { section: b(t('Locations')), ...drive })
        : fillNodes(t('In the left sidebar under {section}, click the controller’s drive (named after the controller, or RPI-RP2 / RP2350).'), { section: b(t('Locations')) }),
      fillNodes(t('Press {button}. The drive may look empty in this window. That’s normal.'), { button: b(t('Select')) }),
      allow,
    ];
  }
  return [
    name ? fillNodes(t('Find {drive} in the sidebar with your other drives and select it.'), drive)
      : t('Find the controller’s drive (named after the controller, or RPI-RP2 / RP2350) in the sidebar with your other drives and select it.'),
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
  // Way around WebUSB (e.g. the controller isn't listed in the browser's device window): the drive copy,
  // named as the controller shows it. A HOJA update mode from before the drive has nothing to copy to.
  const bd = bootDrive();
  if (drive && !bd.none) {
    list.push({ label: bd.name ? t('Use the {drive} drive instead', { drive: bd.name }) : t('Use the controller’s drive instead'),
      icon: 'upload', variant: 'tonal', keepOpen: true, onClick: () => { flashNext({ drive: true }); return false; } });
  }
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
  st.ble = false;
  st.pendingUrl = undefined;
  st.pendingChecksum = undefined;
  st.pendingLegacy = false;
  st.dongle = false;
  resetFresh();
  pico_clear_cached_uf2(); // a later run must download its own image
  ui?.dlg.close();
  ui = null;
}

// ---------------------------------------------------------------------------------------------
// States (ported 1:1 from hoja2)
// ---------------------------------------------------------------------------------------------

function showUpdateAvailable(url, checksum, { legacy = false, debugForced = false, reinstall = false, dongle = false, ble = false } = {}) {
  ensureUi();
  resetFresh();
  st.pendingUrl = url;
  st.pendingChecksum = checksum;
  st.pendingLegacy = legacy;
  st.dongle = dongle;
  st.ble = ble;
  st.mode = 'update-available';
  const u = ensureUi();
  panels({ fresh: reinstall && !legacy && !dongle && !ble });
  const title = updateTitle({ legacy, debugForced, reinstall });
  if (ble) {
    paint(title, t('The firmware is sent over Bluetooth, then the controller restarts to install it and reconnects. Keep it nearby and switched on. Game input pauses until it’s done.'),
      { icon: 'download' });
  } else if (dongle) {
    paint(t('Dongle update'), t('A newer dongle firmware is available. First the dongle restarts into update mode, then the new firmware is written. Keep it plugged in the whole time.'), { icon: 'download' });
  } else paint(title,
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

/** The update dialog's title for a controller (a dongle has its own). */
function updateTitle({ legacy, debugForced, reinstall }) {
  if (debugForced) return t('Update available (debug)');
  if (legacy) return t('This controller needs new firmware');
  return reinstall ? t('Reinstall firmware') : t('Firmware update available');
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
  if (st.ble) {
    actions({ primary: { label: t('Update over Bluetooth'), icon: 'download', run: runBleUpdate } });
    return;
  }
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
  // A controller this app can read keeps its settings for after the update, in case it comes back
  // reset (a new flash layout): see onControllerConnect. Not when starting fresh: erasing them is
  // the point.
  if (!st.pendingLegacy && !st.dongle && !st.fresh) await keepSettingsForUpdate();
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

/** Over Bluetooth: send, then the controller restarts to install the update and comes back by itself. */
async function runBleUpdate() {
  const link = device.bleLink;
  if (!link?.isOpen) {
    setUpdateStatus(t('Connect the controller over Bluetooth again, then try again.'), 0, false);
    return;
  }
  st.mode = 'ble-sending';
  if (ui) replace(ui.backup);
  panels();
  paint(t('Updating over Bluetooth'), t('Sending the firmware. Keep the controller nearby and switched on.'), { icon: 'download' });
  actions({ primary: { label: t('Update over Bluetooth'), icon: 'download', enabled: false, run: () => {} }, dismiss: false });

  try {
    await bleUpdate({
      link, url: st.pendingUrl, checksum: st.pendingChecksum,
      onStatus: ({ phase, percent }) => setUpdateStatus(t(BLE_PHASES[phase]), percent ?? null, true),
    });
  } catch (err) {
    console.error('[fw] Bluetooth update failed', err);
    st.mode = 'update-available';
    paint(t('The update didn’t finish'), err?.message || t('Something went wrong'), { tone: 'red', icon: 'download' });
    setUpdateStatus(t('Nothing was installed: the controller runs its firmware as before.'), 0, false);
    actions({ primary: { label: t('Try again'), icon: 'refresh', run: runBleUpdate } });
    return;
  }

  st.mode = 'ble-restarting';
  paint(t('Installing'), t('The controller restarts to install the update, then reconnects by itself. This takes a few seconds.'), { icon: 'refresh' });
  setUpdateStatus(t('Installing…'), 100, true);
  let reconnectFailed = false;
  try {
    // It opens its beacon once it's back
    await session.connectBluetooth(await reopenBluetooth(link.bluetoothDevice, BLE_RESTART_WAIT_MS));
  } catch (err) {
    console.warn('[fw] reconnect after the update failed', err);
    reconnectFailed = true;
  }
  showUpdateComplete({ reconnectFailed });
}

/** How long to wait for an automatic start before asking the user to press Update. */
const NUDGE_MS = 3500;

/** awaiting-bootloader, and nothing started on its own: make the next action unmistakable. */
function showPressUpdate() {
  if (st.mode !== 'awaiting-bootloader') return;
  paint(t('One more step: press Update'), t('Your controller is now in update mode. Press Update, then choose it in the window your browser opens (its name ends in “Update”, or it shows as “RP2 Boot” or “RP2350 Boot”) and press Connect.'), { icon: 'download' });
  setUpdateStatus(t('Waiting for you to press Update'), 30, false);
  actions({ primary: { label: t('Update'), icon: 'download', run: () => flashNext({ allowRequestDevice: true }) }, drive: true });
  ui?.dlg.action('primary')?.classList.add('btn-attention');
}

function showBootloaderFlash() {
  st.mode = 'bootloader-flash';
  panels();
  paint(t('Writing firmware'), t('Don’t unplug the controller. If direct USB flashing is blocked, you’ll get simple steps to copy it onto the controller’s drive instead.'));
  setUpdateStatus(t('Bootloader detected'), 40, true);
  // While writing, Update and Restart would interrupt the write: show Update disabled, no Restart.
  actions({ primary: { label: t('Update'), icon: 'download', enabled: false, run: () => {} }, dismiss: false });
}

function showUf2DriveStep() {
  st.mode = 'uf2-drive-select';
  st.manualUrl = undefined;
  panels({ tips: true });
  // The steps name the drive this bootloader shows, known only now that it has appeared
  ui.tips.querySelector('ol')?.replaceChildren(...driveSteps().map((s) => h('li', s)));
  const name = bootDrive().name;
  paint(name ? t('Select the {drive} drive', { drive: name }) : t('Select the controller’s drive'), erasing()
    ? t('The erase tool is copied onto the RPI-RP2 drive. Read the steps, then press the button. A folder dialog will open on top of this window.')
    : name ? t('The firmware is ready to copy onto the {drive} drive. Read the steps, then press the button. A folder dialog will open on top of this window.', { drive: name })
      : t('The firmware is ready to copy onto the controller’s drive. Read the steps, then press the button. A folder dialog will open on top of this window.'),
  { icon: erasing() ? 'trash' : 'download', tone: erasing() ? 'red' : 'blue' });
  setUpdateStatus(name ? t('Ready: pick {drive} in the next dialog', { drive: name }) : t('Ready: pick the controller’s drive in the next dialog'), 100, false);
  actions({ primary: { label: name ? t('Select {drive}', { drive: name }) : t('Select the drive'), icon: 'upload', run: completeUf2Step }, restart: true });
}

function showManualUf2Step(uf2Url) {
  st.mode = 'uf2-drive-select';
  st.manualUrl = uf2Url;
  panels({ folderHint: !!navigator.brave && !supportsDirectoryPicker() });
  const name = bootDrive().name;
  paint(name ? t('Copy the UF2 to {drive}', { drive: name }) : t('Copy the UF2 to the controller’s drive'),
    name ? t('Download the UF2 file, then copy it onto the drive named {drive}. The controller restarts when the copy finishes.', { drive: name })
      : t('Download the UF2 file, then copy it onto the controller’s drive (named after the controller, or RPI-RP2 / RP2350). The controller restarts when the copy finishes.'),
    { icon: 'download' });
  setUpdateStatus(name ? t('Download the UF2, then copy it to {drive}', { drive: name }) : t('Download the UF2, then copy it to the controller’s drive'), 100, false);
  actions({ primary: { label: t('Download UF2'), icon: 'download', run: completeUf2Step } });
}

/**
 * The last step. reconnectFailed: after a Bluetooth update, the controller didn't come back over
 * Bluetooth by itself (it restarted to install; the owner connects it again).
 */
function showUpdateComplete({ reconnectFailed = false } = {}) {
  const { dongle, ble } = st;
  const latest = st.status.latest;
  st.mode = 'update-complete';
  st.dongle = false;
  st.pendingUrl = undefined;
  st.pendingChecksum = undefined;
  st.pendingLegacy = false;
  st.stagedImage = null;
  st.manualUrl = undefined;
  const u = ensureUi();
  panels();
  if (ble) showBleComplete(latest, reconnectFailed);
  else showCableComplete(u, dongle);
  u.progress.busy(false);
  setStatus({ state: 'unknown' });
  if (ble && session.connected) checkForFirmwareUpdate();
}

/** Back over Bluetooth: the build it reports says whether the install took. */
function showBleComplete(latest, reconnectFailed) {
  const fw = session.connected ? session.info?.fwVersion >>> 0 : null;
  const stale = fw != null && latest != null && fw < latest;
  paint(stale ? t('The update didn’t install') : t('Update complete'),
    reconnectFailed ? t('The update was sent and the controller restarted to install it. Press Start + Select on it to connect again.')
      : stale ? t('The controller came back with its previous firmware. Try again, or update it with a USB cable.')
        : t('The update is installed and the controller is connected again.'),
    { tone: stale ? 'red' : 'green', icon: stale ? 'download' : 'check' });
  setUpdateStatus(t('Done'), 100, false);
  actions({ primary: { label: t('Done'), icon: 'check', run: () => hide() } });
}

/** Written over USB: the controller (or dongle) restarts with it, and the owner connects it again. */
function showCableComplete(u, dongle) {
  const text = dongle
    ? t('The dongle firmware was written. Give the dongle a moment to restart, then press Connect.')
    : st.fresh
      ? t('The controller was erased and the firmware was written. Give it a moment to restart, then press Connect. After that, calibrate the sticks and pair again.')
      : t('Firmware was written successfully. Give the controller a moment to restart, then press Connect.');
  paint(t('Update complete'), text, { tone: 'green', icon: 'check' });
  setUpdateStatus(t('Done: connect when ready'), 100, true);
  import('../sections/backup/card.js').then(({ backedUpThisSession }) => {
    if (ui === u && !dongle && backedUpThisSession()) replace(u.backup, callout({ tone: 'blue', icon: 'save', text: t('Settings reset by the update? Restore your backup from the Firmware page once connected.') }));
  }).catch(() => {});
  actions({ primary: { label: t('Connect'), icon: 'usb', run: async () => { hide(); const { connectController } = await import('../app/shell.js'); connectController({ cable: true }); } } });
}

/** preselect: a build id, as the HOJA update mode names it (updateModeBuildId) or the caller chose. */
async function showBootloaderInstall(preselect, { updateMode = false } = {}) {
  ensureUi();
  resetFresh();
  st.pendingUrl = undefined;
  st.pendingChecksum = undefined;
  st.pendingLegacy = false;
  st.mode = 'bootloader-install';
  const u = ensureUi();
  panels({ picker: true, fresh: true });
  u.installConfirm.checked = false;
  paint(t('Install HOJA firmware?'), updateMode
    ? t('Your controller is in update mode. Check that it’s the one chosen below, then press Install.')
    : t('A Raspberry Pi bootloader (BOOTSEL) was detected. Choose your controller below, then press Install.'), { icon: 'firmware' });
  setUpdateStatus(t('Choose a controller to continue'), 0, false);
  installActions();

  u.buildSelect.replaceChildren(h('span.muted.small', t('Loading builds…')));
  await fillBuildSelect(preselect);
}

/**
 * The installer's build list: controllers, then dongles (only those for the bootloader's chip,
 * once one has been seen), then the flash nuke. Runs again when a bootloader of the other chip appears.
 */
async function fillBuildSelect(preselect) {
  const { builds, dongles, offline } = await listBuilds();
  const u = ui;
  if (!u || st.mode !== 'bootloader-install') return;
  const forChip = dongles.filter((b) => !st.bootloaderChip || !b.chip || b.chip === st.bootloaderChip);
  const dongleGroup = t('Dongle');
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
      if (result.error) setUpdateStatus(t('Automatic download blocked ({reason}). Download the UF2, then copy it to the controller’s drive', { reason: result.error }), 100, false);
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

const ACTIVE = ['ble-sending', 'ble-restarting', 'awaiting-bootloader', 'bootloader-flash', 'bootloader-install', 'uf2-drive-select', 'erase-flash', 'awaiting-erase', 'update-complete'];

/**
 * Quiet mode (the factory station runs its own flow): no automatic update or install dialogs on
 * connect, bootloader or legacy firmware. Manual entry points still work.
 */
let quiet = false;
export function setUpdaterQuiet(on) { quiet = !!on; }

/** Remember which chip the bootloader is (RP2350 enumerates as PID 0x000f, RP2040 as 0x0003). */
function noteBootloader(usb) {
  if (!usb) return;
  st.bootUsb = usb;
  const chip = usb.productId === 0x000f ? 'rp2350' : 'rp2040';
  if (chip === st.bootloaderChip) return;
  st.bootloaderChip = chip;
  if (st.mode === 'bootloader-install') fillBuildSelect(ui?.select?.value);
}

/** The installer for a bootloader that just appeared: the HOJA update mode names its build. */
const installFor = (usb) => {
  const buildId = updateModeBuildId(usb);
  return showBootloaderInstall(buildId ?? undefined, { updateMode: !!buildId });
};

async function onBootloaderConnect(usb) {
  noteBootloader(usb);
  // "Boot ROM" recovery reboot on firmware without the ROM command: it came up in the HOJA update
  // mode, so hand it on to the boot ROM (PICOBOOT 0x21). The boot ROM then connects as usual.
  if (st.wantRom && isHojaUpdateMode(usb)) {
    st.wantRom = false;
    if (!(await pico_enter_rom_bootloader())) {
      toast(t('Couldn’t switch to the chip’s own bootloader. Unplug the controller, then hold BOOTSEL (or bridge the boot pads) while plugging it in.'), { tone: 'red', timeout: 9000 });
    }
    return;
  }
  st.wantRom = false;
  if (quiet) return;
  if (st.mode === 'uf2-drive-select' || st.mode === 'bootloader-flash' || st.mode === 'erase-flash') return;
  if (st.mode === 'update-complete' && !st.pendingUrl) { await installFor(usb); return; }
  if (st.pendingUrl) {
    // awaiting-bootloader → nuke (start fresh) or firmware; awaiting-erase → the firmware.
    try { await flashNext({ allowRequestDevice: false }); } catch (err) {
      console.error('[fw] auto-flash failed', err);
      setUpdateStatus(t('Press Update to retry'), 0, false);
    }
    return;
  }
  if (st.mode !== 'bootloader-install') await installFor(usb);
}

function onBootloaderDisconnect() {
  if (st.mode === 'hidden') return; // e.g. the board leaving BOOTSEL after "Restart controller": nothing to do
  if (ACTIVE.includes(st.mode)) return; // keep the dialog through reboots
  hide();
}

/**
 * Shown where an update would start for a controller connected through a dongle or over Bluetooth
 * instead of a USB cable (session.caps.noCable): it can't be updated that way.
 */
export const CABLE_UPDATE_TEXT = N_('An update is available. Connect the controller with a USB cable to update it.');
export const CABLE_ONLY_TEXT = N_('Connect the controller with a USB cable to update it.');

/** "An update is available…", translated: on iPhone / iPad, where USB needs a computer, it says so. */
export function cableUpdateText() {
  return isIOS() ? t('An update is available. Install it from a computer with Chrome or Edge and a USB cable.') : t(CABLE_UPDATE_TEXT);
}

/** Why updates aren't offered through the dongle or over Bluetooth, translated (for callouts). */
export function cableOnlyNote() {
  if (isIOS()) return t('Updates need a USB cable and a computer with Chrome or Edge.');
  return session.caps.viaBluetooth
    ? t('Updates need a USB cable. They can’t be installed over Bluetooth.')
    : t('Updates need a USB cable. They can’t be installed through the dongle.');
}

/**
 * Whether the connected controller can be updated without a cable: over Bluetooth, when it says it takes
 * updates that way. A yes holds for the connection; no answer is asked again, now and next time (older
 * firmware could drop its reply while the settings were still being read). Callers while it asks share
 * one exchange.
 */
export function bleUpdateSupported() {
  if (!session.caps.viaBluetooth) return Promise.resolve(false);
  if (st.bleSupported) return Promise.resolve(true);
  if (!bleSupportAsk) {
    const ask = askBleSupport(device.bleLink);
    const settled = () => { if (bleSupportAsk === ask) bleSupportAsk = null; };
    ask.then(settled, settled);
    bleSupportAsk = ask;
  }
  return bleSupportAsk;
}

/** UPDATE_INFO over `link`, up to BLE_INFO_TRIES times. A yes is kept while `link` is still the connection. */
async function askBleSupport(link) {
  for (let attempt = 0; attempt < BLE_INFO_TRIES; attempt++) {
    if (!(await bleUpdateInfo(link))) continue;
    if (link === device.bleLink) st.bleSupported = true;
    return true;
  }
  return false;
}

/** On connect: an update to offer over Bluetooth (one to install, on a controller that takes it that way). */
async function offersBleUpdate(info, available) {
  const something = available || debugForce || DEBUG_FW_URL;
  if (!something || !(DEBUG_FW_URL || info.firmwareUrl)) return false;
  return bleUpdateSupported();
}

/** The settings carry-over (src/sections/backup/carry-over.js; loaded lazily, as the backup feature is). */
const loadCarryOver = () => import('../sections/backup/carry-over.js').catch(() => ({}));

async function keepSettingsForUpdate() {
  const { keepForUpdate } = await loadCarryOver();
  await keepForUpdate?.(session);
}

/** Back after a USB update: settings it reset are written back from before it. */
async function carryOverSettings() {
  const { carryOver } = await loadCarryOver();
  const result = carryOver ? await carryOver(session) : null;
  if (result === 'restored') {
    toast(t('Your settings and calibration came across from before the update.'), { tone: 'green', icon: 'save', timeout: 8000 });
  } else if (result === 'failed') {
    toast(t('The update reset the settings, and they could not be put back. Restore your backup from the Firmware page.'),
      { tone: 'red', icon: 'save', timeout: 12000 });
  }
}

async function onControllerConnect() {
  if (quiet) return;
  // Back after a Bluetooth update: that flow reports the result itself
  if (st.mode === 'ble-restarting') return;
  if (isDemo()) { setStatus({ state: 'current', latest: null }); if (st.mode !== 'hidden') hide(); return; }
  await carryOverSettings();
  const info = session.info;
  let shown = false;
  if (prefs.get('autoUpdateCheck') !== false || debugForce) {
    setStatus({ state: 'checking' });
    const latest = await fetchManifest(info.manifestUrl);
    if (!latest) setStatus({ state: navigator.onLine === false ? 'offline' : 'unknown', latest: null });
    const available = latest && latest.version > (info.fwVersion >>> 0);
    if (latest) setStatus({ state: available ? 'available' : 'current', latest: latest.version, url: info.firmwareUrl, checksum: latest.checksum });
    if (await offersBleUpdate(info, available)) {
      showUpdateAvailable(DEBUG_FW_URL || info.firmwareUrl, DEBUG_FW_URL ? null : latest?.checksum ?? null,
        { ble: true, debugForced: !available });
      shown = true;
    } else if (session.caps.noCable) {
      // Without a USB cable the controller can't reach its bootloader: say so instead of offering it.
      if (available) toast(cableUpdateText(), { tone: 'blue', icon: 'usb', timeout: 8000 });
    } else if (DEBUG_FW_URL) {
      showUpdateAvailable(DEBUG_FW_URL, null, { debugForced: true });
      shown = true;
    } else if ((available || debugForce) && info.firmwareUrl) {
      showUpdateAvailable(info.firmwareUrl, latest?.checksum ?? null, { debugForced: !available && debugForce });
      shown = true;
    }
  }
  // A HOJA controller connected, so any stale install prompt is moot.
  if (!shown && st.mode !== 'hidden') hide();
}

function onControllerDisconnect() {
  // Whether it takes updates over Bluetooth is asked again on the next connection
  st.bleSupported = false;
  bleSupportAsk = null;
  if (st.mode === 'update-available') hide();
  if (!ACTIVE.includes(st.mode)) setStatus({ state: 'unknown', latest: null });
}

/** A dongle with no controller connected: like a controller, it makes a stale install prompt moot. */
function onDongleConnect() {
  if (quiet) return;
  if (st.mode !== 'hidden') hide();
}

export function initFirmware() {
  session.on('state', ({ state }) => {
    // The HOJA bootloader's drive is named after the controller: remember the name it last had.
    if (state === 'connected' && session.info?.name) st.lastName = session.info.name;
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
      const boot = devs.find(isPicoBootloader);
      noteBootloader(boot);
      if (!quiet && boot && !st.pendingUrl) await installFor(boot);
    }).catch((err) => console.warn('[fw] getDevices failed', err));
  }
}

/**
 * Open the update flow for the connected controller (from Home / Firmware page).
 * reinstall: offer "Keep my settings" / "Start fresh: erase everything first".
 */
export async function openUpdateWizard({ reinstall = false } = {}) {
  if (!session.connected) { toast(t('Connect your controller first.'), { tone: 'yellow' }); return; }
  const ble = await bleUpdateSupported();
  if (session.caps.noCable && !ble) { toast(t(CABLE_ONLY_TEXT), { tone: 'blue', icon: 'usb', timeout: 6000 }); return; }
  const latest = DEBUG_FW_URL ? null : await fetchManifest(session.info.manifestUrl);
  const url = DEBUG_FW_URL || session.info.firmwareUrl;
  if (!url) { toast(t('This controller doesn’t report a firmware download location.'), { tone: 'yellow' }); return; }
  showUpdateAvailable(url, latest?.checksum ?? null, { reinstall, ble, debugForced: !reinstall && (!latest || !(latest.version > (session.info.fwVersion >>> 0))) ? debugForce : false });
}

/** Open the install flow manually (e.g. Firmware page → "Install on a blank board"). */
export async function openInstallWizard(buildId) {
  await showBootloaderInstall(buildId);
}

/** How long a controller gets to leave USB after the boot ROM command before the fallback. */
const ROM_COMMAND_WAIT_MS = 2500;

/**
 * Reboot the connected controller into the chip's own boot ROM bootloader (RPI-RP2 / RP2350), past
 * the HOJA bootloader's board checks: the "Boot ROM" recovery button. Firmware with
 * GAMEPAD_CMD_RESET_TO_ROM_BOOTLOADER goes there directly. Older firmware ignores it and stays
 * connected, so then it restarts into the update mode as usual and onBootloaderConnect() hands the
 * HOJA update mode on to the boot ROM (boards without the HOJA bootloader are already there).
 */
export async function rebootToRomBootloaderOnly() {
  if (session.caps.noCable) throw new Error(CABLE_ONLY_TEXT);
  st.wantRom = true;
  const left = new Promise((resolve) => {
    const off = session.on('state', ({ state }) => { if (state !== 'connected') { off(); resolve(true); } });
    setTimeout(() => { off(); resolve(false); }, ROM_COMMAND_WAIT_MS);
  });
  try { await device.rebootToRomBootloader(); } catch (err) { console.warn('[fw] boot ROM command', err); }
  if (!(await left) && session.connected) await device.rebootToBootloader();
  return true;
}

/** Reboot the connected controller into the update mode without starting an update (Firmware page). */
export async function rebootToBootloaderOnly() {
  // Without a USB cable the firmware refuses this: a bootloader can't be reached wirelessly.
  if (session.caps.noCable) throw new Error(CABLE_ONLY_TEXT);
  // When the bootloader then appears, onBootloaderConnect() offers the installer (as in hoja2).
  await device.rebootToBootloader();
  return true;
}

/**
 * Newest firmware for the connected dongle (on its own or with a controller through it), or null
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

/** Update the connected dongle: it reboots into BOOTSEL (0xD1), then its build is written. */
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
