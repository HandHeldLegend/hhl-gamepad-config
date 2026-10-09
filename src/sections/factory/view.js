/**
 * Factory station (#/factory?build=<id>): flash or update, self-check, calibrate and test one unit
 * after another, with a PASS / FAIL per unit and a CSV log for the shift.
 *
 *   #/factory?build=gcu_2&lang=zh
 *     build  target build id (folder in hoja-device-fw/builds). Without it each unit is updated to the
 *            newest firmware of its own build. The build's files are fetched once and cached.
 *     skip   comma list of steps to leave out: flash, calibrate, inputs, operator
 *
 * Per unit: plug in → (bootloader: flash) → (HOJA on another build or older firmware: update) →
 * hardware self-check → stick and trigger calibration → input test (every input, IMU axes live) →
 * operator checks (rumble, LEDs) → save → result. Unplug for the next unit.
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
import { setUpdaterQuiet, formatFwVersion } from '../../firmware/updater.js';
import { pico_update_attempt_flash, pico_prefetch_firmware, onFlashProgress } from '../../firmware/picoboot.js';
import { openCalibration } from '../joysticks/calibration.js';
import { createCalibration } from '../input/calibration.js';
import { glyph, meter, outputName } from '../input/parts.js';
import { formatMac } from '../wireless/info.js';
import { hardwareChecks, testInputs, inputReached, imuAxes } from './checks.js';

loadStyles(new URL('./factory.css', import.meta.url));
loadStyles(new URL('../input/input.css', import.meta.url)); // glyphs and meters

const LOG_KEY = 'hhl-factory-log';
/** Station setup guide (browser policy scripts for Chrome and Edge). */
const SETUP_URL = 'https://github.com/HandHeldLegend/hhl-gamepad-config/blob/main/docs/FACTORY.md';
const RESULT_TEXT = { pass: N_('Pass'), fail: N_('Fail'), na: N_('Not fitted') };
const RESULT_TONE = { pass: 'green', fail: 'red', na: null };
const RGB_STATIC = 1; // rgb_mode Static (RGB page)
const LED_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffffff];

// ---- Station state (module level: survives connects, disconnects and remounts) -------------------
const station = {
  params: {},
  target: null,          // { id, label, uf2Url, manifestUrl, version, checksum, cacheKey, cached }
  targetError: '',
  unit: null,            // the unit being tested (see newUnit)
  log: loadLog(),
  render: null,          // current view's render() (stage + checklist)
  renderHead: null,      // header only (target, counts): never rebuilds the step in progress
  usbHooked: false,
};

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
function go(stage) {
  if (!station.unit) return;
  station.unit.stage = stage;
  redraw();
}

// ---- Target build and its cached firmware -------------------------------------------------------
async function loadTarget(id) {
  station.target = null;
  station.targetError = '';
  if (!id) { redrawHead(); return; }
  const { builds } = await listBuilds();
  const b = builds.find((x) => x.id === id);
  if (!b) { station.targetError = t('Unknown build “{id}”.', { id }); redrawHead(); return; }
  const manifest = await getBuildManifest(b.manifestUrl);
  if (!manifest?.fw_version) { station.targetError = t('Couldn’t read the firmware manifest (offline?).'); redrawHead(); return; }
  const cacheKey = `${b.id}@${manifest.checksum || manifest.fw_version}`;
  station.target = { ...b, version: manifest.fw_version, checksum: manifest.checksum || null, cacheKey, cached: false };
  redrawHead();
  if (!isDemo()) {
    station.target.cached = await pico_prefetch_firmware(b.uf2Url, cacheKey);
    redrawHead();
  }
}

// ---- USB: connect units as they are plugged in ----------------------------------------------------
const isHoja = (usb) => USB_FILTERS.some((f) => f.vendorId === usb.vendorId && f.productId === usb.productId) && !isPicoBootloader(usb) && usb.vendorId !== 0x1a86;

function hookUsb(session) {
  if (station.usbHooked || !navigator.usb) return;
  station.usbHooked = true;
  navigator.usb.addEventListener('connect', (e) => {
    if (location.hash.split('?')[0] !== '#/factory') return;
    if (isPicoBootloader(e.device)) onBootloader();
    else if (isHoja(e.device) && !session.connected) setTimeout(() => session.reconnect(e.device).catch(() => {}), 300);
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
async function onBootloader(allowRequestDevice = false) {
  if (skips().has('flash')) return;
  if (!station.unit || station.unit.stage === 'done') station.unit = newUnit();
  const target = station.target;
  if (!target) { station.unit.note = t('A board in bootloader mode needs a target build: add ?build= to the address.'); go('connecting'); return; }
  if (station.unit.stage === 'flashing') return;
  station.unit.flash = { percent: 0, status: t('Preparing firmware...') };
  go('flashing');
  const result = await pico_update_attempt_flash(target.uf2Url, target.checksum, { allowRequestDevice, cacheKey: target.cacheKey });
  if (result === true) {
    station.unit.updated = true;
    station.unit.flash.status = t('Written. Waiting for the controller to restart…');
    go('rebooting');
  } else if (result?.needsUserAction && result.reason === 'permission') {
    station.unit.flash.needsPermission = true;
    go('flashing');
  } else {
    setResult('firmware', N_('Firmware'), 'fail', t('Direct USB flashing didn’t work on this unit.'));
    finish();
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

  if (!skips().has('flash') && !isDemo()) {
    // No ?build=: update each unit to the newest firmware of its own build.
    if (!station.target && !station.params.build && u.build) await loadTarget(u.build);
    const target = station.target;
    if (target && (u.build !== target.id || u.fw < (target.version >>> 0)) && !u.updated) {
      u.flash = { percent: 0, status: t('Restarting into update mode…') };
      go('flashing');
      try { await device.rebootToBootloader(); } catch { /* drops off USB mid-command: expected */ }
      return; // continues in onBootloader() when the bootloader appears
    }
  }
  const target = station.target;
  setResult('firmware', N_('Firmware'), !target || (u.build === target.id && u.fw >= (target.version >>> 0)) ? 'pass' : 'fail',
    `${humanizeBuildId(u.build || '?')} · ${formatFwVersion(u.fw)}`);
  for (const c of hardwareChecks(session)) setResult(c.id, c.label, c.result, c.detail);
  device.setInputMode(false).catch(() => {});
  go(skips().has('calibrate') ? nextAfter('calibrate', session) : 'calibrate');
}

function nextAfter(stage, session) {
  const order = ['calibrate', 'inputs', 'operator'];
  for (const s of order.slice(order.indexOf(stage) + 1)) {
    if (skips().has(s)) continue;
    if (s === 'operator' && !session.caps.haptics && !session.caps.rgb) continue;
    return s;
  }
  return 'saving';
}

async function saveAndFinish(session) {
  go('saving');
  const ok = await session.save().catch(() => false);
  setResult('save', N_('Saved to controller'), ok ? 'pass' : 'fail');
  finish();
}

function finish() {
  const u = station.unit;
  if (!u) return;
  const rows = [...u.results.values()];
  u.overall = rows.some((r) => r.result === 'fail') || u.aborted ? 'fail' : 'pass';
  u.finished = new Date().toISOString();
  station.log.push({
    unit: u.n, time: u.finished, name: u.name || '', build: u.build || '', firmware: u.fw ? formatFwVersion(u.fw) : '', mac: u.mac || '',
    updated: u.updated ? 'yes' : 'no', overall: u.overall.toUpperCase(), note: u.aborted ? 'unplugged before finishing' : '',
    results: Object.fromEntries(rows.map((r) => [r.id, r.result])),
  });
  saveLog();
  go('done');
}

// ---- CSV ---------------------------------------------------------------------------------------
function downloadCsv() {
  const ids = [...new Set(station.log.flatMap((e) => Object.keys(e.results)))];
  const head = ['unit', 'time', 'name', 'build', 'firmware', 'mac', 'updated', ...ids, 'overall', 'note'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(','), ...station.log.map((e) => [e.unit, e.time, e.name, e.build, e.firmware, e.mac, e.updated, ...ids.map((id) => e.results[id] || ''), e.overall, e.note].map(q).join(','))];
  const a = h('a', { href: URL.createObjectURL(new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv' })), download: `hoja-factory-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---- Page --------------------------------------------------------------------------------------
export function mount(root, { session, params = {} }) {
  station.params = params;
  setUpdaterQuiet(true);
  hookUsb(session);
  if (params.build && station.target?.id !== params.build) loadTarget(params.build);

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
    const tg = station.target;
    const passed = station.log.filter((e) => e.overall === 'PASS').length;
    return h('div.fac-head',
      h('div.fac-target',
        h('span.fac-label', t('Target firmware')),
        tg ? h('strong', `${tg.label} · ${formatFwVersion(tg.version)}`) : h('strong', station.params.build ? (station.targetError || t('Loading…')) : t('Each unit’s own build, newest version')),
        tg && h('span', badge(tg.cached ? t('Cached') : t('Downloading…'), tg.cached ? 'green' : 'yellow'))),
      h('div.fac-counts',
        h('span', t('Tested: {n}', { n: station.log.length })), h('span.fac-pass', t('Pass: {n}', { n: passed })), h('span.fac-fail', t('Fail: {n}', { n: station.log.length - passed }))),
      h('div.fac-head-actions',
        h('a.btn.btn-ghost.btn-sm', { href: SETUP_URL, target: '_blank', rel: 'noopener' }, h('span.btn-label', t('Station setup'))),
        button({ label: t('Download CSV'), icon: 'download', size: 'sm', variant: 'tonal', disabled: !station.log.length, onClick: downloadCsv }),
        button({ label: t('Clear log'), icon: 'trash', size: 'sm', variant: 'ghost', disabled: !station.log.length, onClick: async () => {
          const ok = await confirmDialog({ title: t('Clear the log?'), danger: true, confirmLabel: t('Clear log'),
            message: t('Clear the log of {n} units? Download the CSV first if you need it.', { n: station.log.length }) });
          if (!ok) return;
          station.log = []; saveLog(); renderHead();
        } })));
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
          button({ label: t('Connect'), icon: 'usb', variant: 'primary', size: 'lg', onClick: async () => {
            const r = await session.connect().catch(() => false);
            if (r === 'bootloader') onBootloader(true);
          } }));
      case 'flashing': {
        const bar = progressBar({ message: u.flash?.status || '' });
        bar.set(u.flash?.percent || 0, u.flash?.status || '');
        onFlashProgress((p) => { if (u.flash) { u.flash.percent = p.percent ?? u.flash.percent; u.flash.status = p.message || u.flash.status; } bar.set(u.flash?.percent || 0, u.flash?.status || ''); });
        stageCleanup = () => onFlashProgress(null);
        return big('download', t('Updating firmware'), t('Don’t unplug the controller.'), bar,
          u.flash?.needsPermission && button({ label: t('Allow the bootloader'), icon: 'usb', variant: 'primary', size: 'lg', onClick: () => onBootloader(true) }));
      }
      case 'rebooting':
        return big('refresh', t('Restarting'), t('Waiting for the controller to come back. If it doesn’t connect by itself, press Connect.'),
          button({ label: t('Connect'), icon: 'usb', variant: 'primary', size: 'lg', onClick: () => session.connect().catch(() => false) }));
      case 'calibrate': return calibrateView();
      case 'inputs': return inputsView();
      case 'operator': return operatorView();
      case 'saving': return big('save', t('Saving'), t('Writing calibration to the controller…'));
      case 'done': {
        const pass = u.overall === 'pass';
        return h('div.fac-result', { class: pass ? 'is-pass' : 'is-fail' },
          h('div.fac-result-word', pass ? t('PASS') : t('FAIL')),
          h('p', u.aborted ? t('The unit was unplugged before the test finished.') : pass ? t('Every check passed.') : t('{n} check(s) failed. See the list.', { n: [...u.results.values()].filter((r) => r.result === 'fail').length })),
          h('p.fac-next', t('Unplug the controller and plug in the next one.')));
      }
      default: return '';
    }
  }

  const big = (ic, title, text, ...rest) => h('div.fac-big', h('span.fac-big-icon', icon(ic)), h('h2', title), text && h('p.muted', text), ...rest);

  // Calibration: sticks with the Joysticks page's dialog, then analog triggers with the Input page's.
  function calibrateView() {
    const sticks = ['left', 'right'].filter((s) => session.caps[s === 'left' ? 'leftStick' : 'rightStick']);
    const hover = testInputs(session).filter((i) => i.type === 'hover');
    const doneSticks = station.unit.results.has('sticks');
    if (sticks.length && !doneSticks) {
      return big('calibrate', t('Calibrate the sticks'), t('Press Calibrate sticks, then Start calibration with the sticks let go. Roll each stick around its edge a few times and press Finish.'),
        h('div.row', { style: { justifyContent: 'center' } },
          button({ label: t('Calibrate sticks'), icon: 'calibrate', variant: 'primary', size: 'lg', onClick: () => openCalibration({ session, sticks, onFinished: (ok) => {
            setResult('sticks', N_('Stick calibration'), ok ? 'pass' : 'fail');
            render();
          } }) }),
          button({ label: t('Fail'), variant: 'ghost', onClick: () => { setResult('sticks', N_('Stick calibration'), 'fail'); render(); } })));
    }
    if (hover.length && !station.unit.results.has('triggers')) return triggerCalibration(hover);
    later(() => go(nextAfter('calibrate', session)));
    return '';
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
    return big('calibrate', t('Calibrate the analog triggers'), t('Press Start, push each one all the way in and let go a few times, then press Done.'),
      h('div.fac-meters', rows.map(({ i, m }) => h('div.fac-meter', glyph(i.name, { size: 34 }), m))),
      h('div.row', { style: { justifyContent: 'center' } }, startBtn, doneBtn,
        button({ label: t('Fail'), variant: 'ghost', onClick: () => { calib.stop().catch(() => {}); setResult('triggers', N_('Trigger calibration'), 'fail'); render(); } })));
  }

  // Input test: every physical input to full travel, and live data on every IMU axis.
  function inputsView() {
    const inputs = testInputs(session);
    const axes = imuAxes(session);
    const reached = new Set();
    const range = Object.fromEntries(axes.map((a) => [a.id, { min: Infinity, max: -Infinity }]));
    const tiles = new Map(inputs.map((i) => [i.code, h('div.fac-in', glyph(i.name, { size: 40 }), h('span', outputName(i.name)))]));
    const axisEls = new Map(axes.map((a) => [a.id, h('div.fac-axis', h('span', a.label), h('span.fac-axis-ok', icon('check')))]));
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
        if (!before && rg.max - rg.min >= a.spread) { axisEls.get(a.id).classList.add('ok'); changed = true; }
      }
      if (changed) update();
    });
    stageCleanup = off;
    update();
    return h('div.fac-inputs',
      h('h2', t('Test every input')),
      h('p.muted', t('Press every button, push each trigger all the way, move each stick to its edge in every direction{imu}.', { imu: axes.length ? t(', and turn the controller around') : '' })),
      h('div.fac-in-grid', [...tiles.values()]),
      axes.length > 0 && h('div.fac-axes', [...axisEls.values()]),
      status,
      h('div.row', { style: { justifyContent: 'center' } }, nextBtn,
        button({ label: t('Fail the rest'), variant: 'ghost', onClick: () => conclude(true) })));
  }

  // Operator checks: rumble (the Haptics page's test command) and LED colors, judged by eye and hand.
  function operatorView() {
    const items = [];
    if (session.caps.haptics && !station.unit.results.has('rumble')) items.push('rumble');
    if (session.caps.rgb && !station.unit.results.has('leds')) items.push('leds');
    if (!items.length) { later(() => saveAndFinish(session)); return ''; }
    const which = items[0];
    const judge = (ok) => { setResult(which, which === 'rumble' ? N_('Rumble') : N_('LEDs'), ok ? 'pass' : 'fail'); render(); };
    const verdict = h('div.row', { style: { justifyContent: 'center' } },
      button({ label: t('Pass'), icon: 'check', variant: 'primary', size: 'lg', onClick: () => judge(true) }),
      button({ label: t('Fail'), icon: 'close', variant: 'danger', size: 'lg', onClick: () => judge(false) }));
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
  if (session.connected) onUnitConnected(session); else connectFirst(session);

  return () => {
    offs.forEach((f) => f());
    stageCleanup?.();
    station.render = null;
    setUpdaterQuiet(false);
  };
}
