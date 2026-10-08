/**
 * module-updater.js: Stepped dialog that updates the ESP32 wireless module ("baseband").
 *
 * hoja2 did this in two places: the Wireless page sent GAMEPAD_CMD_ENABLE_BLUETOOTH_UPLOAD
 * ("Enter Update Mode"), then the user opened a separate esptool page (hoja_baseband/) to
 * connect → erase → flash. Here both halves live in one dialog that looks like the controller
 * firmware updater (src/firmware/updater.js):
 *
 *   1 Prepare      download the three images first (fail early when offline)
 *   2 Restart      ENABLE_BLUETOOTH_UPLOAD → firmware stores a boot flag and reboots into "ALTFLASH":
 *                  the RP2040 pulses its LEDs orange and its USB mux hands the port to a CH340
 *                  bridge wired to the ESP32 UART. The HOJA controller therefore drops off WebUSB.
 *   3 Connect      user picks the CH340 (Web Serial, or WebUSB on Android) → esptool syncs
 *   4 Install      erase → write → done; unplug the controller to leave update mode
 *
 * Page lifecycle: the shell unmounts device pages when the controller disconnects, which is
 * exactly what step 2 causes. hoja2 special-cased this (keepWirelessModuleForExternalUpdate in
 * js/app.js). Here the dialog is a module-level singleton appended to <body>, so it simply keeps
 * running after view.js is destroyed; nothing in it depends on the page or a connected session.
 *
 * Demo (?demo): the same steps run against a simulated flasher; the demo controller "drops off"
 * after the restart command (see demo.js), so the page-unmount behavior is demonstrable too.
 */
import { h } from '../../ui/dom.js';
import { openDialog, toast } from '../../ui/overlay.js';
import { button, callout, kv, progressBar, segmented } from '../../ui/controls.js';
import { session } from '../../device/session.js';
import { isDemo, startDemo } from '../../device/mock.js';
import { EspFlasher, availableTransports, baudFromUrl, downloadBasebandImages } from './esp-flasher.js';
import { CHANNELS, familyOf } from './channels.js';
import { LOCAL_UPDATER_URL, STANDALONE_UPDATER_URL, UPDATE_GUIDE_URL } from './info.js';
import { t, N_, plural, fmt } from '../../i18n/index.js';

/** How long to wait for the controller to drop off USB after the restart command. */
const RESTART_TIMEOUT_MS = 6000;
const LOG_MAX_LINES = 400;

const STEP_OF = { intro: 1, downloading: 1, restarting: 2, connect: 3, connecting: 3, installing: 4, done: 4 };
const STEP_LABELS = [N_('Download'), N_('Restart'), N_('Connect'), N_('Install')];
const BUSY = new Set(['downloading', 'restarting', 'connecting', 'installing']);

/** The one running update (null when the dialog is closed). */
let run = null;

/** True while the update dialog is open (the page uses this to avoid opening a second one). */
export const moduleUpdateOpen = () => !!run;

/**
 * Open the wireless module update dialog (no-op if it's already open).
 * @param {{installed?: number, latest?: number|null, params?: object}} [o]
 *   installed  bluetooth_static.external_version_number
 *   latest     newest version from the baseband manifest (null = unknown/offline)
 *   params     deep-link params (supports `baud`, like the standalone updater's ?baud=)
 */
export function openModuleUpdater({ installed, latest = null, channel = CHANNELS.legacy, migrate = false, startAt = 'intro', chooseChannel = false, params = {} } = {}) {
  if (run) return;
  const demo = isDemo();
  const transports = availableTransports();

  run = {
    mode: 'intro',
    demo,
    installed,
    latest,
    channel,
    migrate,
    chooseChannel,
    images: null,
    transport: transports.preferred,
    transports,
    connectFailed: false, // the connection method choice only appears after a failed attempt
    flasher: null,
    stopWaiting: null,
  };
  run.flasher = new EspFlasher({ log, simulate: demo, baud: baudFromUrl(params) });

  // ---- Static dialog parts ----------------------------------------------------------------
  const steps = h('div.steps.wl-steps', STEP_LABELS.map((label) => h('div.wl-step', h('span.step'), h('span.wl-step-label', t(label)))));
  const guide = h('p.muted');
  const versions = h('div.wl-versions');
  const notice = h('div');
  const transportRow = h('div.wl-transport');
  // Firmware choice, shown when the controller couldn't be asked (it's already in update mode).
  const channelRow = h('div.wl-transport', { hidden: !chooseChannel });
  if (chooseChannel) {
    channelRow.append(h('div.field-label', t('Wireless module firmware')),
      segmented({
        options: [{ value: 'bridge', label: t('HCI bridge') }, { value: 'legacy', label: t('HOJA baseband') }],
        value: channel.id, tone: 'blue', ariaLabel: t('Wireless module firmware'),
        onChange: (v) => { if (run) { run.channel = CHANNELS[v]; run.images = null; } },
      }),
      h('p.small.muted', t('Pick the firmware that matches the controller’s firmware: the HCI bridge for current controller firmware (the Wireless page lists the part as “ESP32 HCI”), the HOJA baseband for older firmware.')));
  }
  const progress = progressBar({ message: t('Ready') });
  // The app's own log lines are translated; esptool's output (and the simulated copy of it) stays English.
  const logPre = h('pre.wl-log', { 'aria-live': 'off', 'data-empty': t('Nothing yet.') });
  // Other ways to update: shown with errors, and always inside Details.
  const helpLinks = () => h('div.wl-help-links',
    linkButton(t('Update guide'), UPDATE_GUIDE_URL),
    linkButton(t('Standalone updater'), STANDALONE_UPDATER_URL),
    linkButton(t('Windows updater (.zip)'), LOCAL_UPDATER_URL, t('Command-line updater for Windows driver or connection problems')));
  const logBox = h('details.wl-log-box', h('summary', t('Details')), logPre, helpLinks());
  // Intro: a quiet way in for a controller that's already in update mode.
  const skip = h('p.small.muted.wl-skip', t('Lights already pulsing orange?'), ' ',
    h('button.link-btn', { type: 'button', onclick: () => run && showConnect() }, t('Skip to connecting')));

  if (transports.serial && transports.usb) {
    transportRow.append(h('div.field-label', t('Connect using')),
      segmented({
        options: [{ value: 'serial', label: t('Serial port') }, { value: 'usb', label: t('USB (WebUSB)') }],
        value: run.transport, tone: 'blue', ariaLabel: t('Connection method'),
        onChange: (v) => { if (run) run.transport = v; },
      }),
      h('p.small.muted', t('Didn’t connect? Try the other method. Serial uses the computer’s CH340 driver; USB talks to the chip directly.')));
  }

  const dlg = openDialog({
    title: t('Update wireless module'), icon: 'wireless', tone: 'blue', dismissible: false,
    body: [steps, guide, skip, versions, notice, channelRow, transportRow, progress, logBox],
  });
  run.ui = { dlg, steps, guide, skip, versions, notice, channelRow, transportRow, progress, logPre, logBox, helpLinks };
  dlg.result.then(() => cleanup());

  // startAt 'connect': the controller is already in update mode (e.g. opened from the Firmware page
  // without a connected controller); the images are downloaded during the install step.
  if (startAt === 'connect') showConnect();
  else showIntro();
}

// ---------------------------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------------------------

function linkButton(label, href, tip) {
  return h('a.btn.btn-ghost.btn-sm', { href, target: '_blank', rel: 'noopener noreferrer', 'data-tip': tip || null },
    h('span.btn-label', label));
}

function log(line) {
  if (!run) return;
  const pre = run.ui?.logPre;
  if (!pre) return;
  const text = String(line ?? '').replace(/\s+$/, '');
  if (!text) return;
  pre.append(`${text}\n`);
  while (pre.childNodes.length > LOG_MAX_LINES) pre.firstChild.remove();
  pre.scrollTop = pre.scrollHeight;
}

/** Title, guide text, icon and step pips for the current mode. */
function paint(title, text, { tone = 'blue', icon = 'wireless' } = {}) {
  const u = run.ui;
  u.dlg.setTitle(title);
  u.dlg.setIcon(icon, tone);
  u.guide.textContent = text;
  const n = STEP_OF[run.mode] || 0;
  [...u.steps.children].forEach((col, i) => {
    const state = run.mode === 'done' || i + 1 < n ? 'done' : i + 1 === n ? 'active' : '';
    col.dataset.state = state;
    col.querySelector('.step').dataset.state = state;
  });
  u.skip.hidden = run.mode !== 'intro';
  // Nothing to show before work starts: the bar appears once something is running (or finished).
  u.progress.hidden = run.mode === 'intro' || run.mode === 'connect';
  u.transportRow.hidden = !(run.connectFailed && (run.mode === 'connect' || run.mode === 'connecting'));
  u.transportRow.querySelectorAll('button').forEach((b) => { b.disabled = run.mode === 'connecting'; });
}

/**
 * Footer buttons. `primary` = { label, icon, variant?, run }; `secondary` likewise (tonal).
 * Dismiss is hidden while something is in progress so a flash can't be abandoned by accident.
 */
function actions({ primary, secondary } = {}) {
  const list = [];
  if (!BUSY.has(run.mode)) {
    list.push({ label: run.mode === 'done' ? t('Close') : t('Dismiss'), variant: 'ghost', keepOpen: true, onClick: () => { dismiss(); return false; } });
  }
  for (const [id, a, variant] of [['secondary', secondary, 'tonal'], ['primary', primary, 'primary']]) {
    if (!a) continue;
    list.push({
      id, label: a.label, icon: a.icon, variant: a.variant || variant, keepOpen: true, disabled: a.disabled,
      onClick: () => { a.run(); return false; },
    });
  }
  run.ui.dlg.setActions(list);
}

function setVersions() {
  const { installed, latest } = run;
  run.ui.versions.replaceChildren(kv([
    [t('Installed'), installed != null ? `${installed} (${t(CHANNELS[familyOf(installed)].name)})` : t('Unknown')],
    [t('Latest'), latest ? `${latest} (${t(run.channel.name)})` : t('Couldn’t check (offline?)')],
  ]));
}

function setNotice(node) {
  run.ui.notice.replaceChildren(node || '');
  run.ui.notice.hidden = !node; // an empty block would still take a flex gap
}

function errorText(err) {
  if (err?.name === 'NotFoundError') return t('No device was selected.');
  if (err?.name === 'SecurityError') return t('The browser blocked access to the device.');
  if (err?.name === 'NetworkError' || /failed to open/i.test(err?.message || '')) {
    return t('Couldn’t open the port. Close other apps or tabs using it (e.g. the standalone updater) and try again.');
  }
  return err?.message || String(err); // our own errors are already translated; esptool's stay English
}

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

/** Step 1: explain, warn about unsaved changes, offer Start / "already in update mode". */
function showIntro(errorMsg) {
  run.mode = 'intro';
  const upToDate = !run.migrate && run.latest && run.installed >= run.latest;
  paint(run.migrate ? t('Install HCI bridge firmware') : upToDate ? t('Reinstall wireless firmware') : t('Update wireless module'),
    t('The wireless module (ESP32) has its own firmware. The controller restarts into a special update mode (its lights pulse orange), then the new firmware is written over USB. It takes about a minute, so keep it plugged in.'));
  setVersions();
  run.ui.versions.hidden = false;

  const dirty = session.connected && session.dirty.size > 0;
  setNotice(errorMsg
    ? callout({ tone: 'red', title: t('Update didn’t start.'), text: errorMsg })
    : dirty
      ? callout({ tone: 'yellow', title: t('Unsaved changes.'), text: t('The controller restarts during the update and anything not saved is lost.') },
        button({ label: t('Save now'), icon: 'save', size: 'sm', variant: 'tonal', onClick: async (e) => {
          e.currentTarget.disabled = true;
          const ok = await session.save().catch(() => false);
          toast(ok ? t('Saved to controller') : t('Save failed'), { tone: ok ? 'green' : 'red' });
          if (run?.mode === 'intro') showIntro();
        } }))
      : run.migrate ? callout({ tone: 'blue', icon: 'wireless', text: t('The HCI bridge firmware is recommended for this controller. It unlocks Wii mode and the newer Bluetooth features (current Switch and Steam modes, pairing over USB).') }, ' ', t('Afterwards, pair the Switch and any other Bluetooth hosts again once: the module’s Bluetooth address changes.'))
        : upToDate ? callout({ tone: 'green', text: t('This module already has the latest firmware. You can reinstall it if wireless isn’t working right.') }) : null);

  run.ui.progress.set(0, t('Ready'));
  run.ui.progress.busy(false);
  actions({
    primary: { label: upToDate ? t('Reinstall') : t('Start update'), icon: 'download', run: startUpdate },
  });
}

/** Steps 1→2: download images, then send ENABLE_BLUETOOTH_UPLOAD and wait for the USB drop. */
async function startUpdate() {
  run.mode = 'downloading';
  paint(t('Downloading firmware'), t('Getting the latest wireless firmware before the controller restarts.'));
  setNotice(null);
  actions({});
  run.ui.progress.busy(true);
  try {
    run.images = await downloadBasebandImages({
      images: run.channel.images,
      simulate: run.demo,
      onProgress: (done, total, label) => {
        run?.ui.progress.set((done / total) * 100, label ? t('Downloading {file}…', { file: t(label) }) : t('Downloaded'));
        if (label) log(t('Downloading {file}…', { file: t(label) }));
      },
    });
    const bytes = fmt.number(run.images.reduce((n, i) => n + i.size, 0));
    log(plural(run.images.length, 'Downloaded {n} file ({bytes} bytes).', 'Downloaded {n} files ({bytes} bytes).', { bytes }));
  } catch (err) {
    console.error('[wireless] download failed', err);
    if (!run) return;
    log(t('Error: {message}', { message: err?.message || err }));
    showIntro(navigator.onLine === false ? t('You’re offline. Connect to the internet and try again.') : errorText(err));
    return;
  }
  if (!run) return;
  await enterUpdateMode();
}

async function enterUpdateMode() {
  if (!session.connected) { showConnect(); return; } // e.g. unplugged meanwhile: maybe already in update mode
  run.mode = 'restarting';
  paint(t('Restarting into update mode'), t('The controller is restarting. Its lights will pulse orange.'));
  run.ui.progress.indeterminate(true, t('Waiting for the controller to restart…'));
  actions({});

  const dropped = new Promise((resolve) => {
    const off = session.on('state', ({ state }) => { if (state !== 'connected') { off(); resolve(true); } });
    const timer = setTimeout(() => { off(); resolve(false); }, RESTART_TIMEOUT_MS);
    run.stopWaiting = () => { clearTimeout(timer); off(); resolve(false); };
  });

  try {
    await session.flush(); // pending writes first, like hoja2's sendBlock-then-command ordering
  } catch { /* the command below still matters more */ }
  log(t('Sending {command}…', { command: 'ENABLE_BLUETOOTH_UPLOAD' }));
  // The firmware reboots without acknowledging (settings.c), so don't wait for a reply.
  session.command('gamepad', 'ENABLE_BLUETOOTH_UPLOAD', { timeout: 2000 }).catch(() => {});

  const ok = await dropped;
  if (!run) return;
  run.stopWaiting = null;
  log(ok ? t('Controller left USB (now in update mode).') : t('Controller is still connected; continuing anyway.'));
  showConnect(ok ? null : t('The controller didn’t restart as expected. If its lights aren’t pulsing orange, unplug it, plug it back in and try again.'));
}

/** Step 3: pick the serial device. */
function showConnect(warning) {
  run.mode = 'connect';
  paint(t('Connect to the wireless module'), run.transport === 'usb'
    ? t('When the controller’s lights pulse orange, press Connect and choose the USB device (usually “USB2.0-Ser!” or “USB Single Serial”). To cancel, just unplug the controller.')
    : t('When the controller’s lights pulse orange, press Connect and choose the USB serial device (usually “USB-SERIAL CH340” or “USB Single Serial”). To cancel, just unplug the controller.'));
  run.ui.versions.hidden = true;
  setNotice(warning ? callout({ tone: 'yellow', text: warning }, run.connectFailed && run.ui.helpLinks()) : null);
  run.ui.progress.indeterminate(false);
  run.ui.progress.set(0, t('Ready to connect'));
  run.ui.progress.busy(false);
  actions({ primary: { label: t('Connect'), icon: 'usb', run: connectAndInstall } });
}

/** Step 3→4. Called straight from the click so the port picker keeps the user gesture. */
async function connectAndInstall() {
  run.mode = 'connecting';
  paint(t('Connecting'), t('Talking to the wireless module’s bootloader…'));
  setNotice(null);
  actions({});
  run.ui.progress.indeterminate(true, t('Connecting…'));
  run.ui.channelRow.hidden = true;
  log(`Connection: ${run.transport === 'usb' ? 'WebUSB' : 'Web Serial'} · Web Serial API ${navigator.serial ? 'present' : 'absent'} · ${navigator.userAgent}`);
  mirrorConsole(); // driver and esptool console output into Details (both routes, for diagnosis)
  try {
    const chip = await run.flasher.connect(run.transport);
    if (!run) return;
    log(t('Connected: {chip}', { chip }));
  } catch (err) {
    console.error('[wireless] connect failed', err);
    if (!run) return;
    log(t('Error: {message}', { message: err?.message || err }));
    // Picker closed without a choice isn't a failed connection; anything else offers the other method.
    if (err?.name !== 'NotFoundError') run.connectFailed = true;
    showConnect(errorText(err));
    return;
  }
  await install();
}

/** Step 4: (download if skipped) → erase → write → release the port. */
async function install() {
  run.mode = 'installing';
  paint(t('Installing wireless firmware'), t('Don’t unplug the controller or close this tab.'));
  setNotice(null);
  actions({});
  window.addEventListener('beforeunload', guardUnload);
  const p = run.ui.progress;
  try {
    if (!run.images) {
      p.indeterminate(true, t('Downloading firmware…'));
      run.images = await downloadBasebandImages({ images: run.channel.images, simulate: run.demo, onProgress: (d, n, label) => label && log(t('Downloading {file}…', { file: t(label) })) });
    }
    if (run.flasher.eraseFirst) {
      p.indeterminate(true, t('Erasing (this can take 30 seconds)…'));
      log(t('Erasing…'));
      await run.flasher.erase();
    }
    p.set(0, t('Writing…'));
    p.busy(true);
    log(t('Flashing…'));
    await run.flasher.write(run.images, (pct, label) => run?.ui.progress.set(pct, t('Writing {file}…', { file: t(label) })));
    await run.flasher.close();
  } catch (err) {
    console.error('[wireless] install failed', err);
    window.removeEventListener('beforeunload', guardUnload);
    if (!run) return;
    log(t('Error: {message}', { message: err?.message || err }));
    p.indeterminate(false);
    p.busy(false);
    run.mode = 'connect';
    paint(t('Install didn’t finish'), t('Nothing is broken yet: the module can always be rewritten while in update mode. Try again; if it keeps failing, unplug the controller, plug it back in and start over.'), { tone: 'red', icon: 'warning' });
    setNotice(callout({ tone: 'red', text: errorText(err) }, run.ui.helpLinks()));
    actions({ primary: { label: t('Try again'), icon: 'refresh', run: () => (run.flasher.connected ? install() : connectAndInstall()) } });
    return;
  }
  window.removeEventListener('beforeunload', guardUnload);
  if (!run) return;
  log(t('Flashing is complete. Please unplug your controller to finish the update.'));
  showDone();
}

function showDone() {
  run.mode = 'done';
  paint(t('Wireless module updated'), t('Unplug the controller, wait a moment, plug it back in, then press Connect.'), { tone: 'green', icon: 'check' });
  setNotice(run.migrate ? callout({ tone: 'yellow', title: t('Pair again.'), text: t('The module’s Bluetooth address changed. Pair the Switch and any other Bluetooth hosts again once.') }) : null);
  const p = run.ui.progress;
  p.indeterminate(false);
  p.set(100, t('Done: unplug the controller to finish'));
  p.busy(false);
  actions({
    primary: {
      label: t('Connect'), icon: 'usb',
      run: async () => {
        const demo = run.demo;
        dismiss();
        if (demo) { startDemo(); return; }
        const { connectController } = await import('../../app/shell.js');
        connectController();
      },
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------------------------

function guardUnload(e) { e.preventDefault(); e.returnValue = ''; }

function dismiss() {
  if (!run) return;
  const midUpdate = run.mode === 'connect' && !run.demo;
  run.ui.dlg.close();
  if (midUpdate) toast(t('If the lights are pulsing orange, unplug the controller to leave update mode.'), { tone: 'blue', timeout: 7000 });
}

/**
 * While the WebUSB driver (nice-serial.js) runs, copy its console output into the Details log, so a
 * failure can be diagnosed on a phone without remote debugging. Restored in cleanup().
 */
let consoleRestore = null;
function mirrorConsole() {
  if (consoleRestore) return;
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const fmt = (args) => args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (a && typeof a === 'object') { try { return JSON.stringify(a, (k, v) => (typeof USBEndpoint !== 'undefined' && v instanceof USBEndpoint ? `ep${v.endpointNumber} ${v.direction} ${v.type}` : v)); } catch { return String(a); } }
    return String(a);
  }).join(' ');
  let lines = 0; // esptool's packet tracing is on for WebUSB: keep the copy to a readable size
  for (const k of ['log', 'warn', 'error']) {
    console[k] = (...args) => {
      orig[k].apply(console, args);
      const line = fmt(args);
      if (/^Write chunk of/.test(line)) return; // one line per write would flood the log
      if (k === 'log' && ++lines > 400) return;
      log(`[usb] ${line.slice(0, 300)}`);
    };
  }
  consoleRestore = () => { Object.assign(console, orig); consoleRestore = null; };
}

function cleanup() {
  consoleRestore?.();
  if (!run) return;
  run.stopWaiting?.();
  window.removeEventListener('beforeunload', guardUnload);
  const f = run.flasher;
  run = null;
  f?.close().catch(() => {});
}

/**
 * Open the updater for a controller that is already in update mode (picked as its CH340, or from a
 * page that can't reach the controller): straight to Connect, with the firmware choice shown.
 */
export function openModuleUpdaterInUpdateMode(params = {}) {
  openModuleUpdater({ installed: null, latest: null, channel: CHANNELS.bridge, startAt: 'connect', chooseChannel: true, params });
}
