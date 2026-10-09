/**
 * Factory station (#/factory?build=<id>): flash or update, self-check, calibrate and test one unit
 * after another, with a PASS / FAIL per unit and a CSV log for the shift.
 *
 *   #/factory?build=gcu_2,gcu_2s&lang=zh
 *     build  the line's models (build ids, comma separated). Every unit is identified on its own: a
 *            HOJA unit by the build it reports (checked against this list, updated to the newest
 *            firmware of ITS build); a blank board in bootloader mode by the operator when the line
 *            has more than one model. Without it any HOJA unit is accepted (blank boards can't be
 *            flashed). Each model's firmware is fetched once and cached.
 *     skip   comma list of steps to leave out: flash, calibrate, inputs, operator
 *     sku    color SKU id (skus.js); also picked in the header and kept between units
 *
 * Per unit: plug in → (bootloader: flash) → (HOJA on another build or older firmware: update) →
 * hardware self-check → color SKU applied to the Switch colors → stick and trigger calibration →
 * input test (every input, IMU axes live) → operator checks (FCC label on GCU 2, rumble, LEDs) →
 * save → result. Unplug for the next unit.
 *
 * Reuses the regular app's pieces so fixes there flow in here: stick calibration dialog (Joysticks),
 * trigger calibration (Input), verdict decoders (Battery, Wireless; see checks.js), button glyphs and
 * meters (Input), the haptics test command and the firmware flasher (picoboot.js). The global
 * updater's automatic dialogs are switched off while this page is open (setUpdaterQuiet).
 *
 * Connecting without clicks: Chrome asks once per physical USB device. On station PCs the Chrome
 * policy WebUsbAllowDevicesForUrls can pre-approve HOJA controllers (2e8a:10c6/10dd/10df, 057e:2009)
 * and the RP2040/RP2350 bootloaders (2e8a:0003/000f) for this site; then units connect on plug-in.
 */
import { h, loadStyles } from '../../ui/dom.js';
import { button, badge, progressBar } from '../../ui/controls.js';
import { confirmDialog } from '../../ui/overlay.js';
import { icon } from '../../ui/icons.js';
import { t, N_ } from '../../i18n/index.js';
import { device, isPicoBootloader, USB_FILTERS } from '../../device/hoja-device.js';
import { onInputReport } from '../../device/reports.js';
import { isDemo } from '../../device/mock.js';
import { listBuilds, getBuildManifest, humanizeBuildId } from '../../firmware/builds.js';
import { buildIdFromManifestUrl } from '../../firmware/changelog.js';
import { setUpdaterQuiet, formatFwVersion, exitBootloader } from '../../firmware/updater.js';
import { languagePicker, connectController } from '../../app/shell.js';
import { pico_update_attempt_flash, pico_prefetch_firmware, pico_complete_uf2_picker_flash, onFlashProgress } from '../../firmware/picoboot.js';
import { createStickCalibration } from '../joysticks/calibration.js';
import { createImuReadout } from '../motion/imu-readout.js';
import { createCalibration } from '../input/calibration.js';
import { glyph, meter, outputName } from '../input/parts.js';
import { triggerDiagram } from '../input/trigger-diagram.js';
import { formatMac, identityText } from '../wireless/info.js';
import { getSetting } from '../../settings/schema.js';
import { COLOR_SKUS, getSku, FCC_LABEL_BUILDS } from './skus.js';
import { hardwareChecks, testInputs, inputReached, imuAxes, dualStageTriggers, DUAL_FULL } from './checks.js';

loadStyles(new URL('./factory.css', import.meta.url));
loadStyles(new URL('../input/input.css', import.meta.url)); // glyphs and meters
loadStyles(new URL('../joysticks/joysticks.css', import.meta.url)); // stick calibration previews
loadStyles(new URL('../motion/motion.css', import.meta.url)); // live IMU bars

const LOG_KEY = 'hhl-factory-log';
const SKU_KEY = 'hhl-factory-sku';
/** Station setup guide (browser policy scripts for Chrome and Edge). */
const SETUP_URL = 'https://github.com/HandHeldLegend/hhl-gamepad-config/blob/main/docs/FACTORY.md';
const RESULT_TEXT = { pass: N_('Pass'), fail: N_('Fail'), na: N_('Not fitted') };
const RESULT_TONE = { pass: 'green', fail: 'red', na: null };
const RGB_STATIC = 1; // rgb_mode Static (RGB page)
const LED_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffffff];

// ---- Station state (module level: survives connects, disconnects and remounts) -------------------
const station = {
  params: {},
  models: [],            // the line's build ids (?build=); [] = any HOJA unit
  targets: new Map(),    // build id → { id, label, uf2Url, version, checksum, cacheKey, cached } | null
  targetErrors: new Map(),
  unit: null,            // the unit being tested (see newUnit)
  log: loadLog(),
  sku: loadSku(),        // color SKU id for this batch (skus.js)
  render: null,          // current view's render() (stage + checklist)
  renderHead: null,      // header only (target, counts): never rebuilds the step in progress
  usbHooked: false,
};

/** Station state, exported for debugging from the console (e.g. stepping a demo unit through states). */
export { station as factoryStation, flashed as factoryFlashed };

function loadSku() { try { return localStorage.getItem(SKU_KEY) || ''; } catch { return ''; } }
function setSku(id) { station.sku = id; try { localStorage.setItem(SKU_KEY, id); } catch { /* storage blocked */ } }
function loadLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } }
function saveLog() { try { localStorage.setItem(LOG_KEY, JSON.stringify(station.log)); } catch { /* storage blocked */ } }
const skips = () => new Set(String(station.params.skip || '').split(',').map((s) => s.trim()).filter(Boolean));
const redraw = () => station.render?.();
const redrawHead = () => station.renderHead?.();
/** Stage changes requested while a view is being built run right after it. */
const later = (fn) => setTimeout(fn, 0);

function newUnit() {
  return { n: station.log.length + 1, started: new Date().toISOString(), stage: 'connecting', updated: false, results: new Map(), flash: null, note: '' };
}
function setResult(id, label, result, detail = '') {
  station.unit?.results.set(id, { id, label, result, detail });
}
/** Stick calibration in progress (survives redraws; dropped when the step is left or the unit ends). */
let stickCal = null;
function dropStickCal() { stickCal?.destroy(); stickCal = null; }

function go(stage) {
  if (!station.unit) return;
  if (stage !== 'calibrate') dropStickCal();
  station.unit.stage = stage;
  redraw();
}

/** Which results belong to which step (Back clears them so the step runs again). */
const STEP_RESULTS = {
  sticks: (id) => id === 'sticks',
  triggers: (id) => id === 'triggers',
  triggercheck: (id) => id.startsWith('dual-'),
  inputs: (id) => id.startsWith('in-') || /^(gyro|accel)-/.test(id) || id === 'inputs-operator',
  operator: (id) => ['fcc-label', 'rumble', 'leds'].includes(id),
};
/** Go back one step: clear its results and the previous step's, then run the previous step again. */
function back(fromStage) {
  const u = station.unit;
  if (!u) return;
  const clear = (key) => { for (const id of [...u.results.keys()]) if (STEP_RESULTS[key](id)) u.results.delete(id); };
  clear(fromStage);
  if (fromStage === 'triggers') { clear('sticks'); go('calibrate'); return; }
  if (fromStage === 'triggercheck') { clear('triggers'); go('calibrate'); return; }
  if (fromStage === 'inputs') {
    const hasDual = [...u.results.keys()].some(STEP_RESULTS.triggercheck);
    if (hasDual) clear('triggercheck'); else if (u.results.has('triggers')) clear('triggers'); else clear('sticks');
    go('calibrate');
    return;
  }
  if (fromStage === 'operator') { clear('inputs'); go('inputs'); }
}

// ---- Firmware per build (cached; nothing here belongs to a unit) ------------------------------
const pendingTargets = new Map();

/** Newest firmware of a build: manifest read once, files prefetched into the flasher's cache. */
async function getTarget(id) {
  if (!id) return null;
  if (station.targets.has(id)) return station.targets.get(id);
  if (pendingTargets.has(id)) return pendingTargets.get(id);
  const job = (async () => {
    const { builds } = await listBuilds();
    const b = builds.find((x) => x.id === id);
    if (!b) { station.targetErrors.set(id, t('Unknown build “{id}”.', { id })); return null; }
    const manifest = await getBuildManifest(b.manifestUrl);
    if (!manifest?.fw_version) { station.targetErrors.set(id, t('Couldn’t read the firmware manifest (offline?).')); return null; }
    const cacheKey = `${b.id}@${manifest.checksum || manifest.fw_version}`;
    const target = { ...b, version: manifest.fw_version, checksum: manifest.checksum || null, cacheKey, cached: false };
    if (!isDemo()) pico_prefetch_firmware(b.uf2Url, cacheKey).then((ok) => { target.cached = ok; redrawHead(); });
    return target;
  })();
  pendingTargets.set(id, job);
  const target = await job.catch(() => null);
  pendingTargets.delete(id);
  station.targets.set(id, target);
  redrawHead();
  return target;
}

// ---- USB: connect units as they are plugged in ----------------------------------------------------
const isHoja = (usb) => USB_FILTERS.some((f) => f.vendorId === usb.vendorId && f.productId === usb.productId) && !isPicoBootloader(usb) && usb.vendorId !== 0x1a86;

function hookUsb(session) {
  if (station.usbHooked || !navigator.usb) return;
  station.usbHooked = true;
  const onStation = () => location.hash.split('?')[0] === '#/factory';
  navigator.usb.addEventListener('connect', async (e) => {
    if (!onStation()) return;
    if (isPicoBootloader(e.device)) { onBootloader(); return; }
    if (!isHoja(e.device)) return;
    // A finished unit may still count as connected (left plugged in, or its unplug was missed):
    // the next unit takes over.
    if (session.connected && station.unit?.stage === 'done') { station.unit = null; await session.disconnect().catch(() => {}); }
    if (!session.connected) setTimeout(() => session.reconnect(e.device).catch(() => {}), 300);
  });
  // Any HOJA controller unplugged while its result shows: ready for the next one.
  navigator.usb.addEventListener('disconnect', (e) => {
    if (!onStation() || !isHoja(e.device) || station.unit?.stage !== 'done') return;
    station.unit = null;
    redraw();
  });
}

async function connectFirst(session) {
  if (!navigator.usb || session.connected) return;
  const devs = await navigator.usb.getDevices().catch(() => []);
  if (devs.some(isPicoBootloader)) { onBootloader(); return; }
  const unit = devs.find(isHoja);
  if (unit) session.reconnect(unit).catch(() => {});
}

// ---- Flashing --------------------------------------------------------------------------------------
/** How long to wait for an allowed bootloader to appear before asking the operator to allow it. */
const BOOTLOADER_WAIT_MS = 4000;

async function onBootloader(allowRequestDevice = false) {
  if (skips().has('flash')) return;
  if (!station.unit || station.unit.stage === 'done') station.unit = newUnit();
  const u = station.unit;
  if (u.flashing) return; // a write is already running
  // Which firmware: the unit's own (an update), the line's only model, or ask (a blank board can't tell).
  if (!u.target && station.models.length === 1) u.target = await getTarget(station.models[0]);
  if (!u.target) {
    if (station.models.length > 1) { u.allowRequestDevice = allowRequestDevice; go('model'); return; }
    u.note = t('A board in bootloader mode needs the line’s models: add ?build= to the address.');
    go('connecting');
    return;
  }
  const target = u.target;
  clearTimeout(u.waitTimer);
  u.flashing = true;
  u.flash = { percent: 0, status: t('Preparing firmware...') };
  go('flashing');
  let result = false;
  try {
    result = await pico_update_attempt_flash(target.uf2Url, target.checksum, { allowRequestDevice, cacheKey: target.cacheKey });
  } finally {
    u.flashing = false;
  }
  if (result === true) { flashed(); return; }
  if (result?.needsUserAction && result.reason === 'permission') {
    // The browser hasn't allowed this unit's bootloader yet: the operator picks it once.
    u.flash = { percent: 0, status: t('Press Allow the bootloader and pick “RP2 Boot” (or “RP2350 Boot”).'), needsPermission: true };
    go('flashing');
  } else if (result?.needsUserAction && result.reason === 'directory-picker') {
    // Direct USB flashing isn't available: copy the (already downloaded) firmware onto the RPI-RP2 drive.
    u.flash = { percent: 100, status: t('Direct USB flashing isn’t available here. Press Select the RPI-RP2 drive and pick the drive in the folder window.'), needsDrive: true };
    go('flashing');
  } else {
    // Device window closed, the bootloader not listed, or the write failed: let the operator choose.
    u.flash = { percent: 0, status: t('The firmware wasn’t written. Try again, or copy it onto the RPI-RP2 drive instead.'), needsPermission: true };
    go('flashing');
  }
}

/** Skip direct USB flashing: stage the cached UF2 for the RPI-RP2 drive copy (folder window next). */
async function useDrive() {
  const u = station.unit;
  const target = u?.target;
  if (!u || !target || u.flashing) return;
  clearTimeout(u.waitTimer);
  u.flashing = true;
  let result = false;
  try {
    result = await pico_update_attempt_flash(target.uf2Url, null, { uf2Only: true, cacheKey: target.cacheKey });
  } finally {
    u.flashing = false;
  }
  if (result?.needsUserAction && result.reason === 'directory-picker') {
    u.flash = { percent: 100, status: t('Press Select the RPI-RP2 drive and pick the drive in the folder window.'), needsDrive: true };
  } else {
    u.flash = { percent: 0, status: t('This browser can’t write to the drive. Use Chrome or Edge.'), needsPermission: true };
  }
  go('flashing');
}

function flashed() {
  const u = station.unit;
  u.updated = true;
  u.flash = { percent: 100, status: t('Written. Waiting for the controller to restart…') };
  u.reboot = { since: Date.now(), seen: '', stillBootloader: false, long: false };
  go('rebooting');
  watchReboot(u);
}

/**
 * While the unit restarts: every second, reconnect an allowed HOJA controller (in case the plug-in
 * event was missed), notice a board that stayed in the bootloader, and list what the browser sees
 * (shown on screen for diagnosis). After a while, ask for Connect plainly.
 */
function watchReboot(u) {
  clearInterval(u.rebootTimer);
  u.rebootTimer = setInterval(async () => {
    if (station.unit !== u || u.stage !== 'rebooting') { clearInterval(u.rebootTimer); return; }
    const devs = navigator.usb ? await navigator.usb.getDevices().catch(() => []) : [];
    const hex = (n) => n.toString(16).padStart(4, '0');
    const seen = devs.map((d) => `${hex(d.vendorId)}:${hex(d.productId)}${isPicoBootloader(d) ? ' (bootloader)' : ''}`).join(', ');
    const waited = Date.now() - u.reboot.since;
    const boot = devs.some(isPicoBootloader);
    const hoja = devs.find(isHoja);
    const was = JSON.stringify(u.reboot);
    u.reboot.seen = seen;
    u.reboot.stillBootloader = boot && waited > 5000;
    u.reboot.long = waited > 8000;
    if (hoja && station.session && !station.session.connected && !u.reconnecting) {
      u.reconnecting = true;
      station.session.reconnect(hoja).catch((err) => console.warn('[factory] reconnect', err)).finally(() => { u.reconnecting = false; });
    }
    if (JSON.stringify(u.reboot) !== was) redraw();
  }, 1000);
}

/** The RPI-RP2 drive copy (needs the operator's click for the folder window). */
async function copyToDrive() {
  const u = station.unit;
  try {
    await pico_complete_uf2_picker_flash();
    flashed();
  } catch (err) {
    u.flash = { ...u.flash, status: err?.message ? t(err.message) : t('Folder selection failed.') };
    go('flashing');
  }
}

/** A HOJA unit connected: update it first when it isn't on the target firmware. */
async function onUnitConnected(session) {
  if (!station.unit || station.unit.stage === 'done') station.unit = newUnit();
  const u = station.unit;
  u.name = session.info.name;
  u.build = buildIdFromManifestUrl(session.info.manifestUrl) || '';
  u.fw = session.info.fwVersion >>> 0;
  u.mac = formatMac(session.config.gamepad.gamepad_mac_address);

  // Every unit is identified by the build it reports; nothing carries over from the previous unit.
  if (station.models.length && u.build && !station.models.includes(u.build)) {
    setResult('firmware', N_('Firmware'), 'fail', t('Not a model on this line: the unit runs {unit}. This line is set for {models}.',
      { unit: humanizeBuildId(u.build), models: station.models.map(humanizeBuildId).join(', ') }));
    finish();
    return;
  }
  // A blank board was flashed as the model the operator picked: it must come back as that model.
  if (u.boardModel && u.build && u.build !== u.boardModel) {
    setResult('firmware', N_('Firmware'), 'fail', t('Came back as {unit}, but was flashed as {model}.', { unit: humanizeBuildId(u.build), model: humanizeBuildId(u.boardModel) }));
    finish();
    return;
  }
  u.target = u.build ? await getTarget(u.build) : null; // the newest firmware of THIS unit's build
  if (!skips().has('flash') && !isDemo()) {
    const target = u.target;
    if (target && u.fw < (target.version >>> 0) && !u.updated) {
      u.flash = { percent: 0, status: t('Restarting into update mode…') };
      go('flashing');
      try { await device.rebootToBootloader(); } catch { /* drops off USB mid-command: expected */ }
      // Continues in onBootloader() when an allowed bootloader appears. If none does (the browser
      // hasn't allowed this unit's bootloader), ask the operator to allow it.
      clearTimeout(u.waitTimer);
      u.waitTimer = setTimeout(() => {
        if (station.unit !== u || u.stage !== 'flashing' || u.flashing) return;
        u.flash = { percent: 0, status: t('Press Allow the bootloader and pick “RP2 Boot” (or “RP2350 Boot”).'), needsPermission: true };
        redraw();
      }, BOOTLOADER_WAIT_MS);
      return;
    }
  }
  const target = u.target;
  setResult('firmware', N_('Firmware'), !target || u.fw >= (target.version >>> 0) ? 'pass' : 'fail',
    `${humanizeBuildId(u.build || '?')} · ${formatFwVersion(u.fw)}`);
  for (const c of hardwareChecks(session)) setResult(c.id, c.label, c.result, c.detail);
  // Firmware that doesn't fit the hardware: a GCU 2 has a radio, a GCU 2S doesn't.
  if (EXPECTS_RADIO.has(u.build) && u.results.get('wireless')?.result !== 'pass') {
    setResult('model-match', N_('Firmware matches the hardware'), 'fail', t('{model} firmware, but no working radio: this may be another model running the wrong firmware.', { model: humanizeBuildId(u.build) }));
  }
  device.setInputMode(false).catch(() => {});
  go('sku'); // every unit confirms its color SKU (one tap when it's the same as the last one)
}

/** Write the batch's SKU colors to the Switch color fields (saved with everything at the end). */
function applySku(session) {
  const sku = getSku(station.sku);
  if (!sku) return;
  const set = (key, hex) => getSetting(key).set(session, hex);
  set('gamepad.bodyColor', sku.body);
  set('gamepad.buttonsColor', sku.buttons);
  set('gamepad.leftGripColor', sku.leftGrip);
  set('gamepad.rightGripColor', sku.rightGrip);
  session.commit('gamepad', { immediate: true }).catch(() => {});
  station.unit.sku = sku.label;
  setResult('colors', N_('Switch colors'), 'pass', sku.label);
}

function continueAfterSku(session) {
  applySku(session);
  go(skips().has('calibrate') ? nextAfter('calibrate', session) : 'calibrate');
}

/** Builds whose hardware has a wireless radio (a unit without one is running the wrong firmware). */
const EXPECTS_RADIO = new Set(['gcu_2']);
const needsFccLabel = () => FCC_LABEL_BUILDS.has(station.unit?.build);

function nextAfter(stage, session) {
  const order = ['calibrate', 'inputs', 'operator'];
  for (const s of order.slice(order.indexOf(stage) + 1)) {
    if (skips().has(s)) continue;
    if (s === 'operator' && !session.caps.haptics && !session.caps.rgb && !needsFccLabel()) continue;
    return s;
  }
  return 'saving';
}

async function saveAndFinish(session) {
  go('saving');
  const ok = await session.save().catch(() => false);
  setResult('save', N_('Saved to controller'), ok ? 'pass' : 'fail');
  // Colors: confirm the controller holds the SKU's values after saving.
  const sku = getSku(station.sku);
  if (sku && station.unit?.results.has('colors')) {
    const get = (key) => String(getSetting(key).get(session)).toLowerCase();
    const match = get('gamepad.bodyColor') === sku.body && get('gamepad.buttonsColor') === sku.buttons
      && get('gamepad.leftGripColor') === sku.leftGrip && get('gamepad.rightGripColor') === sku.rightGrip;
    setResult('colors', N_('Switch colors'), ok && match ? 'pass' : 'fail', sku.label);
  }
  finish();
}

function finish() {
  const u = station.unit;
  if (!u) return;
  dropStickCal();
  clearInterval(u.rebootTimer);
  const rows = [...u.results.values()];
  u.overall = rows.some((r) => r.result === 'fail') || u.aborted ? 'fail' : 'pass';
  u.finished = new Date().toISOString();
  station.log.push({
    unit: u.n, time: u.finished, name: u.name || '', build: u.build || '', firmware: u.fw ? formatFwVersion(u.fw) : '', mac: u.mac || '',
    updated: u.updated ? 'yes' : 'no', sku: u.sku || '', overall: u.overall.toUpperCase(), note: u.aborted ? 'unplugged before finishing' : '',
    results: Object.fromEntries(rows.map((r) => [r.id, r.result])),
  });
  saveLog();
  go('done');
}

// ---- CSV ---------------------------------------------------------------------------------------
function downloadCsv() {
  const ids = [...new Set(station.log.flatMap((e) => Object.keys(e.results)))];
  const head = ['unit', 'time', 'name', 'build', 'firmware', 'mac', 'updated', 'sku', ...ids, 'overall', 'note'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(','), ...station.log.map((e) => [e.unit, e.time, e.name, e.build, e.firmware, e.mac, e.updated, e.sku || '', ...ids.map((id) => e.results[id] || ''), e.overall, e.note].map(q).join(','))];
  const a = h('a', { href: URL.createObjectURL(new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv' })), download: `hoja-factory-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---- Page --------------------------------------------------------------------------------------
export function mount(root, { session, params = {} }) {
  station.params = params;
  station.session = session;
  setUpdaterQuiet(true);
  hookUsb(session);
  station.models = String(params.build || '').split(',').map((x) => x.trim()).filter(Boolean);
  station.models.forEach((id) => getTarget(id)); // prefetch every line model's firmware

  const headEl = h('div');
  const mainEl = h('div.fac-main');
  root.append(h('div.fac', headEl, mainEl));
  let stageCleanup = null;

  function render() {
    stageCleanup?.(); // every render rebuilds the step, so drop the previous one's listeners
    stageCleanup = null;
    const u = station.unit;
    renderHead();
    mainEl.replaceChildren(h('div.fac-stage', stageView(u?.stage || 'idle')), u ? checklist(u) : '');
  }
  function renderHead() { headEl.replaceChildren(header()); }
  station.render = render;
  station.renderHead = renderHead;

  // ---- Header: target, cache, counts, log ----
  function header() {
    const passed = station.log.filter((e) => e.overall === 'PASS').length;
    const stat = (label, n, cls) => h('div.fac-stat', { class: cls }, h('span.fac-stat-n', String(n)), h('span.fac-stat-label', label));
    return h('div.fac-head',
      // Row 1: what this station installs and paints, plus language and setup.
      h('div.fac-head-row',
        h('div.fac-head-group',
          h('div.fac-field', h('span.fac-label', t('Line models')),
            h('div.fac-target',
              station.models.length
                ? station.models.map((id) => {
                  const tg = station.targets.get(id);
                  return h('span.fac-model', h('strong', humanizeBuildId(id)),
                    tg ? h('span.faint', formatFwVersion(tg.version)) : h('span.faint', station.targetErrors.get(id) || t('Loading…')),
                    tg && !isDemo() && badge(tg.cached ? t('Cached') : t('Downloading…'), tg.cached ? 'green' : 'yellow'));
                })
                : h('strong', t('Any model (each unit’s own build, newest version)')))),
),
        h('div.fac-head-group',
          languagePicker(),
          h('a.btn.btn-ghost.btn-sm', { href: SETUP_URL, target: '_blank', rel: 'noopener' }, h('span.btn-label', t('Station setup'))))),
      // Row 2: this shift's counts and the log.
      h('div.fac-head-row',
        h('div.fac-stats', stat(t('Tested'), station.log.length, ''), stat(t('Pass'), passed, 'is-pass'), stat(t('Fail'), station.log.length - passed, 'is-fail')),
        h('div.fac-head-group',
          button({ label: t('Download CSV'), icon: 'download', size: 'sm', variant: 'tonal', disabled: !station.log.length, onClick: downloadCsv }),
          button({ label: t('Clear log'), icon: 'trash', size: 'sm', variant: 'ghost', disabled: !station.log.length, onClick: async () => {
            const ok = await confirmDialog({ title: t('Clear the log?'), danger: true, confirmLabel: t('Clear log'),
              message: t('Clear the log of {n} units? Download the CSV first if you need it.', { n: station.log.length }) });
            if (!ok) return;
            station.log = []; saveLog(); renderHead();
          } }))));
  }

  // ---- Checklist (right side) ----
  function checklist(u) {
    return h('div.fac-list',
      h('div.fac-list-head', t('Unit {n}', { n: u.n }), u.mac && h('span.faint', u.mac)),
      [...u.results.values()].map((r) => h('div.fac-row', { class: `is-${r.result}` },
        h('span.fac-row-icon', icon(r.result === 'pass' ? 'check' : r.result === 'fail' ? 'close' : 'minus')),
        h('span.fac-row-label', t(r.label)), r.detail && h('span.fac-row-detail', r.detail),
        badge(t(RESULT_TEXT[r.result]), RESULT_TONE[r.result]))));
  }

  // ---- Stages ----
  function stageView(stage) {
    const u = station.unit;
    switch (stage) {
      case 'idle':
      case 'connecting':
        return big('usb', t('Plug in the next controller'), u?.note || t('Units connect by themselves when this computer already allows them. Otherwise press Connect and pick the controller.'),
          button({ label: t('Connect'), icon: 'usb', variant: 'primary', size: 'lg', onClick: connectUnit }));
      case 'flashing': {
        const bar = progressBar({ message: u.flash?.status || '' });
        bar.set(u.flash?.percent || 0, u.flash?.status || '');
        onFlashProgress((p) => { if (u.flash) { u.flash.percent = p.percent ?? u.flash.percent; u.flash.status = p.message || u.flash.status; } bar.set(u.flash?.percent || 0, u.flash?.status || ''); });
        stageCleanup = () => onFlashProgress(null);
        return big('download', t('Updating firmware'), t('Don’t unplug the controller.'), bar,
          (u.flash?.needsPermission || u.flash?.needsDrive) && h('div.row.fac-actions',
            u.flash.needsPermission && button({ label: t('Allow the bootloader'), icon: 'usb', variant: 'primary', size: 'lg', onClick: () => onBootloader(true) }),
            u.flash.needsPermission && button({ label: t('Use the RPI-RP2 drive instead'), icon: 'upload', variant: 'tonal', onClick: () => useDrive() }),
            u.flash.needsDrive && button({ label: t('Select the RPI-RP2 drive'), icon: 'upload', variant: 'primary', size: 'lg', onClick: () => copyToDrive() }),
            button({ label: t('Fail'), variant: 'ghost', onClick: () => { setResult('firmware', N_('Firmware'), 'fail', t('Not updated')); finish(); } })));
      }
      case 'rebooting': {
        const rb = u.reboot || {};
        const text = rb.stillBootloader
          ? t('The firmware was written, but the controller is still in update mode. Press Restart controller.')
          : rb.long
            ? t('The controller restarted, but this browser needs your permission to reconnect. Press Connect and pick the controller.')
            : t('Waiting for the controller to come back…');
        return big('refresh', t('Restarting'), text,
          h('div.row.fac-actions',
            rb.stillBootloader && button({ label: t('Restart controller'), icon: 'refresh', variant: 'primary', size: 'lg', onClick: () => exitBootloader() }),
            button({ label: t('Connect'), icon: 'usb', variant: rb.long && !rb.stillBootloader ? 'primary' : 'tonal', size: 'lg', onClick: connectUnit }),
            button({ label: t('Fail'), variant: 'ghost', onClick: () => { setResult('firmware', N_('Firmware'), 'fail', t('Didn’t come back after the update')); finish(); } })),
          h('p.small.faint.fac-seen', t('USB devices this browser can use: {list}', { list: rb.seen || t('none') })));
      }
      case 'model': return big('firmware', t('Which controller is this board?'), t('A board in bootloader mode can’t tell which model it is. Pick the model to install.'),
        h('div.fac-skus', station.models.map((id) => h('button.fac-sku-btn', { type: 'button', onclick: async () => {
          u.boardModel = id;
          u.target = await getTarget(id);
          onBootloader(!!u.allowRequestDevice);
        } }, humanizeBuildId(id)))),
        button({ label: t('Fail'), variant: 'ghost', onClick: () => { setResult('firmware', N_('Firmware'), 'fail', t('Not updated')); finish(); } }));
      case 'sku': {
        const dots = (x) => h('span.fac-sku-dots', [x.body, x.buttons, x.leftGrip, x.rightGrip].map((c) => h('span', { style: { background: c } })));
        const last = getSku(station.sku);
        const pick = (x) => { setSku(x.id); continueAfterSku(session); };
        return big('palette', t('Which color is this unit?'), t('Check the shell color. It sets the colors the Switch shows for the controller.'),
          last && button({ label: t('Continue with {sku}', { sku: last.label }), icon: 'check', variant: 'primary', size: 'lg', class: 'fac-pass-btn', onClick: () => pick(last) }),
          h('div.fac-skus', COLOR_SKUS.map((x) => h('button.fac-sku-btn', { type: 'button', class: x.id === station.sku ? 'is-last' : null, onclick: () => pick(x) }, dots(x), x.label))));
      }
      case 'calibrate': return calibrateView();
      case 'inputs': return inputsView();
      case 'operator': return operatorView();
      case 'saving': return big('save', t('Saving'), t('Writing calibration to the controller…'));
      case 'done': {
        const pass = u.overall === 'pass';
        return h('div.fac-result', { class: pass ? 'is-pass' : 'is-fail' },
          h('div.fac-result-word', pass ? t('PASS') : t('FAIL')),
          h('p', u.aborted ? t('The unit was unplugged before the test finished.') : pass ? t('Every check passed.') : t('{n} check(s) failed. See the list.', { n: [...u.results.values()].filter((r) => r.result === 'fail').length })),
          !pass && h('div.fac-failed', [...u.results.values()].filter((r) => r.result === 'fail').map((r) => h('span.fac-failed-chip', t(r.label)))),
          h('p.fac-next', t('Unplug it and plug in the next one. It starts by itself where the browser allows it; otherwise press Next unit.')),
          button({ label: t('Next unit'), icon: 'chevron-right', variant: 'primary', size: 'lg', onClick: connectUnit }));
      }
      default: return '';
    }
  }

  /** The app's connect flow (it explains failures); a picked bootloader goes to flashing. */
  const connectUnit = async () => {
    // Starting a new unit: let go of the finished one first (it may still be open).
    if (!station.unit || station.unit.stage === 'done') {
      station.unit = null;
      if (session.connected) await session.disconnect().catch(() => {});
      render();
    }
    const r = await connectController();
    if (r === 'bootloader') onBootloader(true);
  };
  const backButton = (onClick) => button({ label: t('Back'), icon: 'back', variant: 'ghost', class: 'fac-back', onClick });
  const big = (ic, title, text, ...rest) => h('div.fac-big', h('span.fac-big-icon', icon(ic)), h('h2', title), text && h('p.muted', text), ...rest);

  // Calibration: sticks with the Joysticks page's dialog, then analog triggers with the Input page's.
  function calibrateView() {
    const sticks = ['left', 'right'].filter((s) => session.caps[s === 'left' ? 'leftStick' : 'rightStick']);
    const hover = testInputs(session).filter((i) => i.type === 'hover');
    const doneSticks = station.unit.results.has('sticks');
    if (sticks.length && !doneSticks) return stickCalibration(sticks);
    if (hover.length && !station.unit.results.has('triggers')) return triggerCalibration(hover);
    const dual = dualStageTriggers(session);
    if (dual.length && !dual.every((d) => station.unit.results.has(d.id))) return triggerCheck(dual);
    later(() => go(nextAfter('calibrate', session)));
    return '';
  }

  // Sticks: the Joysticks page's calibration engine, laid out inline with both sticks side by side.
  function stickCalibration(sticks) {
    const cal = stickCal || (stickCal = createStickCalibration(session, sticks));
    const calibrating = cal.phase === 'calibrating';
    const status = h('p.cal-status.muted', { role: 'status' }, calibrating ? t('Roll each stick slowly around its edge until its shape is complete.') : '');
    const off = cal.onProgress((all) => {
      status.className = `cal-status ${all ? 'ok' : 'muted'}`;
      status.replaceChildren(all ? h('span', icon('check'), ' ', t('Both sticks have enough data. Press Finish.')) : t('Roll each stick slowly around its edge until its shape is complete.'));
    });
    stageCleanup = off; // the engine itself stays (redraws must not cancel a calibration)
    const fail = async () => { await cal.cancel(); dropStickCal(); setResult('sticks', N_('Stick calibration'), 'fail'); render(); };
    const actions = calibrating
      ? [button({ label: t('Finish'), icon: 'check', variant: 'primary', size: 'lg', class: 'fac-pass-btn', onClick: async (e) => {
          e.currentTarget.disabled = true;
          const ok = await cal.finish();
          dropStickCal();
          setResult('sticks', N_('Stick calibration'), ok ? 'pass' : 'fail');
          render();
        } }),
        button({ label: t('Cancel'), variant: 'ghost', onClick: async () => { await cal.cancel(); dropStickCal(); render(); } }),
        button({ label: t('Fail'), variant: 'ghost', onClick: fail })]
      : [button({ label: t('Start calibration'), icon: 'play', variant: 'primary', size: 'lg', onClick: async (e) => {
          e.currentTarget.disabled = true;
          try { await cal.start(); } catch (err) { status.className = 'cal-status'; status.textContent = err?.message || String(err); e.currentTarget.disabled = false; return; }
          render();
        } }),
        button({ label: t('Fail'), variant: 'ghost', onClick: fail })];
    return h('div.fac-cal',
      h('h2', t('Calibrate the sticks')),
      h('p.muted', calibrating
        ? t('Keep gentle pressure against the rim and go all the way round, slowly. The green shape grows as each direction is captured.')
        : t('Let go of both sticks and leave the controller still, then press Start calibration. The resting center is recorded at that moment.')),
      // Before Start the shapes are the current calibration: dimmed until a new one is captured.
      h('div.fac-cal-sticks', { class: calibrating ? null : 'idle', style: { '--n': String(cal.previews.length) } }, cal.previews.map((pv) => pv.el)),
      status,
      h('div.row.fac-actions', actions));
  }

  function triggerCalibration(hover) {
    const calib = createCalibration(session);
    const rows = hover.map((i) => ({ i, m: meter({ label: i.name }) }));
    let running = false;
    const startBtn = button({ label: t('Start'), icon: 'calibrate', variant: 'primary', size: 'lg', onClick: async () => {
      running = await calib.start('all');
      startBtn.hidden = running; doneBtn.hidden = !running;
    } });
    const doneBtn = button({ label: t('Done'), icon: 'check', variant: 'primary', size: 'lg', onClick: async () => {
      const ok = await calib.stop();
      setResult('triggers', N_('Trigger calibration'), ok ? 'pass' : 'fail');
      render();
    } });
    doneBtn.hidden = true;
    const off = onInputReport(device, (r) => { if (r.kind === 'raw') rows.forEach(({ i, m }) => m.set((r.inputs[i.code]?.value || 0) / 127, r.inputs[i.code]?.pressed)); });
    stageCleanup = () => { off(); if (running && !station.unit?.results.has('triggers')) calib.stop().catch(() => {}); };
    // Dual-stage (GameCube) triggers: calibrate only to the top of the membrane, never through the click.
    const dual = dualStageTriggers(session).length > 0;
    return big('calibrate', t('Calibrate the analog triggers'),
      dual ? t('Press Start. Press each trigger down to the membrane and let go, a few times. Don’t click. Then press Done.')
        : t('Press Start, push each one all the way in and let go a few times, then press Done.'),
      dual && triggerDiagram('calibrate'),
      h('div.fac-meters', rows.map(({ i, m }) => h('div.fac-meter', glyph(i.name, { size: 34 }), m))),
      h('div.row.fac-actions', startBtn, doneBtn,
        button({ label: t('Fail'), variant: 'ghost', onClick: () => { calib.stop().catch(() => {}); setResult('triggers', N_('Trigger calibration'), 'fail'); render(); } }),
        backButton(() => { if (running) calib.stop().catch(() => {}); running = false; back('triggers'); })));
  }

  // Dual-stage trigger check: full analog at the top of the membrane, then the click only after that.
  function triggerCheck(pairs) {
    const state = Object.fromEntries(pairs.map((p) => [p.id, { full: false, click: false, early: false }]));
    const ui = pairs.map((p) => {
      const m = meter({ label: p.analog.name });
      const fullEl = h('span.fac-check', icon('check'), t('Full at the membrane'));
      const clickEl = h('span.fac-check', icon('check'), t('Click (full press)'));
      const warn = h('span.fac-check-warn', { hidden: true }, t('Clicked before the analog was full: recalibrate.'));
      return { p, m, fullEl, clickEl, warn, el: h('div.fac-dual', glyph(p.analog.name, { size: 38 }), m, h('div.fac-dual-checks', fullEl, clickEl, warn), glyph(p.click.name, { size: 38 })) };
    });
    const label = (p) => (p.side === 'left' ? N_('Left trigger (dual-stage)') : N_('Right trigger (dual-stage)'));
    let done = false;
    const off = onInputReport(device, (r) => {
      if (r.kind !== 'raw' || done) return;
      for (const u of ui) {
        const a = r.inputs[u.p.analog.code] || { value: 0 };
        const c = r.inputs[u.p.click.code] || { pressed: false };
        const st = state[u.p.id];
        u.m.set(a.value / 127, c.pressed);
        if (a.value >= DUAL_FULL && !st.full) { st.full = true; u.fullEl.classList.add('ok'); }
        if (c.pressed && !st.click) {
          if (a.value >= DUAL_FULL) { st.click = true; u.clickEl.classList.add('ok'); } else if (!st.early) { st.early = true; u.warn.hidden = false; }
        }
      }
      if (pairs.every((p) => state[p.id].full && state[p.id].click)) {
        done = true;
        later(() => { pairs.forEach((p) => setResult(p.id, label(p), state[p.id].early ? 'fail' : 'pass')); render(); });
      }
    });
    stageCleanup = off;
    return big('trigger', t('Check the triggers'), t('Press each trigger slowly down to the membrane: the bar fills. Then press harder until it clicks.'),
      triggerDiagram('check'),
      h('div.fac-duals', ui.map((u) => u.el)),
      h('div.row.fac-actions',
        button({ label: t('Fail'), variant: 'ghost', onClick: () => { pairs.forEach((p) => setResult(p.id, label(p), state[p.id].full && state[p.id].click && !state[p.id].early ? 'pass' : 'fail')); render(); } }),
        backButton(() => back('triggercheck'))));
  }

  // Input test: every physical input to full travel, and live data on every IMU axis.
  function inputsView() {
    const inputs = testInputs(session);
    const axes = imuAxes(session);
    const reached = new Set();
    const range = Object.fromEntries(axes.map((a) => [a.id, { min: Infinity, max: -Infinity }]));
    const tiles = new Map(inputs.map((i) => [i.code, h('div.fac-in', glyph(i.name, { size: 40 }), h('span', outputName(i.name)))]));
    // Motion sensors: the Motion page's live bars, with a check per axis once it has moved enough.
    const readout = axes.length ? createImuReadout() : null;
    const axisRows = new Map();
    if (readout) {
      const rows = readout.el.querySelectorAll('.imu-row'); // gyro x, y, z then accel x, y, z, like imuAxes()
      axes.forEach((a, i) => { const row = rows[i]; if (!row) return; row.append(h('span.fac-imu-ok', icon('check'))); axisRows.set(a.id, row); });
    }
    const status = h('p.muted');
    let concluded = false;
    const nextBtn = button({ label: t('Next'), icon: 'chevron-right', variant: 'primary', size: 'lg', disabled: true, onClick: () => conclude(false) });
    const conclude = (forceFail) => {
      inputs.forEach((i) => setResult(`in-${i.key}`, i.name, reached.has(i.code) ? 'pass' : 'fail'));
      axes.forEach((a) => { const r = range[a.id]; setResult(a.id, a.label, r.max - r.min >= a.spread ? 'pass' : 'fail'); });
      if (forceFail && inputs.every((i) => reached.has(i.code))) setResult('inputs-operator', N_('Input test'), 'fail');
      go(nextAfter('inputs', session));
    };
    const update = () => {
      const axesOk = axes.filter((a) => range[a.id].max - range[a.id].min >= a.spread).length;
      status.textContent = t('{done} of {total} inputs, {axes} of {axesTotal} motion axes', { done: reached.size, total: inputs.length, axes: axesOk, axesTotal: axes.length });
      const all = reached.size === inputs.length && axesOk === axes.length;
      nextBtn.disabled = !all;
      if (all && !concluded) { concluded = true; later(() => conclude(false)); }
    };
    const off = onInputReport(device, (r) => {
      if (r.kind !== 'raw') return;
      let changed = false;
      for (const i of inputs) {
        if (!reached.has(i.code) && inputReached(i, r.inputs[i.code])) { reached.add(i.code); tiles.get(i.code).classList.add('ok'); changed = true; }
      }
      for (const a of axes) {
        const v = r[a.source][a.axis];
        const rg = range[a.id];
        const before = rg.max - rg.min >= a.spread;
        rg.min = Math.min(rg.min, v); rg.max = Math.max(rg.max, v);
        if (!before && rg.max - rg.min >= a.spread) { axisRows.get(a.id)?.classList.add('fac-ok'); changed = true; }
      }
      readout?.set(r.gyro, r.accel);
      if (changed) update();
    });
    stageCleanup = () => { off(); readout?.destroy(); };
    update();
    return h('div.fac-inputs',
      h('h2', t('Test every input')),
      h('p.muted', t('Press every button, push each trigger all the way and move each stick to its edge in every direction.')),
      h('div.fac-inputs-body',
        h('div.fac-in-grid', [...tiles.values()]),
        readout && h('div.fac-imu',
          h('h3', t('Motion sensors')),
          h('p.small.muted', t('Turn and tilt the controller in every direction until every axis has a check.')),
          readout.el)),
      status,
      h('div.row.fac-actions', nextBtn,
        button({ label: t('Fail the rest'), variant: 'ghost', onClick: () => conclude(true) }),
        backButton(() => back('inputs'))));
  }

  // Operator checks: rumble (the Haptics page's test command) and LED colors, judged by eye and hand.
  function operatorView() {
    const items = [];
    if (needsFccLabel() && !station.unit.results.has('fcc-label')) items.push('fcc-label');
    if (session.caps.haptics && !station.unit.results.has('rumble')) items.push('rumble');
    if (session.caps.rgb && !station.unit.results.has('leds')) items.push('leds');
    if (!items.length) { later(() => saveAndFinish(session)); return ''; }
    const which = items[0];
    const label = { 'fcc-label': N_('FCC label'), rumble: N_('Rumble'), leds: N_('LEDs') }[which];
    const fccId = identityText(session.static.bluetooth?.fcc_id ?? new Uint8Array());
    const judge = (ok) => { setResult(which, label, ok ? 'pass' : 'fail', which === 'fcc-label' ? fccId : ''); render(); };
    const verdict = h('div.row.fac-actions',
      button({ label: t('Pass'), icon: 'check', variant: 'primary', size: 'lg', class: 'fac-pass-btn', onClick: () => judge(true) }),
      button({ label: t('Fail'), icon: 'close', variant: 'danger', size: 'lg', onClick: () => judge(false) }),
      backButton(() => back('operator')));
    if (which === 'fcc-label') {
      return big('info', t('Is the FCC label on the rear shell?'), t('Check the sticker is applied, straight and readable, and that it shows this FCC ID:'),
        h('div.fac-fcc', fccId ? `FCC ID: ${fccId}` : t('This unit doesn’t report an FCC ID.')), verdict);
    }
    if (which === 'rumble') {
      const play = () => session.command('haptic', 'TEST_STRENGTH', { timeout: 10000 }).catch(() => {});
      play();
      return big('haptics', t('Does it rumble?'), t('The controller buzzes for about a second.'),
        button({ label: t('Play again'), icon: 'play', variant: 'tonal', onClick: play }), verdict);
    }
    // LEDs: cycle red, green, blue, white on every group (Static mode), then put the settings back.
    const rgb = session.config.rgb;
    const snapshot = rgb.buffer.slice();
    let i = 0;
    const show = () => {
      rgb.rgb_mode = RGB_STATIC;
      rgb.rgb_colors = Array(rgb.rgb_colors.length).fill(LED_COLORS[i++ % LED_COLORS.length]);
      session.commit('rgb', { immediate: true }).catch(() => {});
    };
    show();
    const timer = setInterval(show, 800);
    stageCleanup = () => { clearInterval(timer); rgb.buffer.set(snapshot); session.commit('rgb', { immediate: true }).catch(() => {}); };
    return big('rgb', t('Do all the LEDs light?'), t('Every LED cycles red, green, blue and white.'), verdict);
  }

  // ---- Connection events ----
  const offs = [
    session.on('state', ({ state }) => {
      if (state === 'connected') { onUnitConnected(session); return; }
      if (state !== 'disconnected') return;
      const u = station.unit;
      if (!u) return;
      if (u.stage === 'done') { station.unit = null; render(); return; }
      if (['flashing', 'rebooting', 'connecting'].includes(u.stage)) return; // expected during updates
      u.aborted = true;
      finish();
    }),
  ];

  render();
  // A remount (e.g. a language change) keeps the unit in progress; only a fresh visit starts one.
  if (session.connected) { if (!station.unit) onUnitConnected(session); } else connectFirst(session);

  return () => {
    offs.forEach((f) => f());
    stageCleanup?.();
    station.render = null;
    setUpdaterQuiet(false);
  };
}
