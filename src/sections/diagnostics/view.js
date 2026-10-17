/**
 * Wireless diagnostics (#/diagnostics, hidden from the menu): for customers whose wireless module
 * (ESP32) update won't connect. Linked from the update dialog's Details, Help & about and the support
 * guide. It collects what support needs to find the cause, and nothing is written to the controller:
 *
 *   Before you start  puts the controller in update mode: connects it over USB if needed and sends
 *                   ENABLE_BLUETOOTH_UPLOAD, as the update dialog does (by hand works too)
 *   Your setup      controller, which USB port, anything else (optional)
 *   PC details      Windows only: a read-only PowerShell command (./powershell.js) for CPU, board,
 *                   BIOS, USB controllers and the CH340 driver; the user pastes its output back
 *   Connection test the serial probe (./serial-probe.js) on the port the user picks, plus the USB route
 *   Report          everything above plus browser details and the last update dialog log, to copy
 *                   (readable text) or download (JSON) and attach to a support ticket
 *
 * The page is `stable`: it stays mounted when the controller drops off USB to enter update mode.
 */
import { h, loadStyles } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { card, button, asyncButton, callout, select, textInput } from '../../ui/controls.js';
import { toast } from '../../ui/overlay.js';
import { isWindows } from '../../app/platform.js';
import { connectController } from '../../app/shell.js';
import { formatFwVersion } from '../../firmware/updater.js';
import { decodeText } from '../../device/struct.js';
import { loadVersion } from '../../app/pwa.js';
import { t, N_ } from '../../i18n/index.js';
import { POWERSHELL_COMMAND } from './powershell.js';
import { probeSerialPort, probeUsbDevice, serialVerdict, RESETS } from './serial-probe.js';
import { lastModuleUpdateLog } from '../wireless/module-updater.js';

loadStyles(new URL('./diagnostics.css', import.meta.url));

const TONE = 'blue';
const WCH_VENDOR = 0x1a86;

const CONTROLLERS = ['GC Ultimate 1', 'ProGCC 3+', 'ProGCC 3.1', 'ProGCC 3.2', 'Super Gamepad+', N_('Other')];
const PORTS = [N_('Back of the PC'), N_('Front of the PC'), N_('USB hub or dock'), N_('Laptop port'), N_('Other')];
const PORT_TYPES = [N_('USB 2.0'), N_('USB 3 (blue, red or teal)'), N_('USB-C'), N_('Not sure')];

/** Translated one-line verdict for the customer (the report carries the detailed English one). */
function customerVerdict(r) {
  if (!r.open?.ok) return [t('The port couldn’t be opened. Close other tabs and apps using it, then run the test again.'), 'red'];
  const resets = r.resets.filter((x) => x.id !== 'run');
  if (resets.some((x) => x.sync?.replied)) return [t('The module answered. The update should work on this port: try it again now.'), 'green'];
  if (resets.some((x) => x.outcome === 'download')) return [t('The module started its update mode but didn’t answer. Try another USB port or a USB 2.0 hub, then run the test again.'), 'yellow'];
  if (resets.some((x) => x.outcome === 'normal-boot')) return [t('The module restarted but didn’t enter its update mode. This points to USB timing on this PC. Try another USB port or a USB 2.0 hub.'), 'yellow'];
  return [t('Nothing came back from the module. Check that its lights pulse orange, then try another cable and port.'), 'red'];
}

/** How long to wait for the controller to drop off USB after the update-mode command (as the update dialog). */
const RESTART_TIMEOUT_MS = 6000;

/** Browser and system details the page can read on its own. */
async function environment() {
  const env = {
    userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language,
    cores: navigator.hardwareConcurrency ?? null, memoryGB: navigator.deviceMemory ?? null,
    webSerial: !!navigator.serial, webUSB: !!navigator.usb, online: navigator.onLine,
  };
  try {
    const ch = await navigator.userAgentData?.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'bitness', 'fullVersionList']);
    if (ch) env.clientHints = { platform: ch.platform, platformVersion: ch.platformVersion, architecture: ch.architecture, bitness: ch.bitness, browsers: (ch.fullVersionList || []).map((b) => `${b.brand} ${b.version}`) };
  } catch { /* not offered */ }
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (ext) env.gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch { /* no WebGL */ }
  try {
    const ports = await navigator.serial?.getPorts();
    if (ports) env.grantedSerialPorts = ports.map((p) => { const i = p.getInfo(); return `${hex(i.usbVendorId)}:${hex(i.usbProductId)}`; });
  } catch { /* ignore */ }
  env.appVersion = await loadVersion().catch(() => null);
  return env;
}

const hex = (n) => (n == null ? '?' : `0x${n.toString(16).padStart(4, '0')}`);

/** Readable English report (what gets pasted into a ticket). */
function reportText(rep) {
  const lines = [];
  const add = (...l) => lines.push(...l);
  add('HHL wireless module diagnostics', `Created: ${rep.created}`, `App: ${rep.env?.appVersion ?? '?'}`, '');
  add('== Setup ==', `Controller: ${rep.setup.controller || '-'}`, `Port: ${rep.setup.port || '-'} / ${rep.setup.portType || '-'}`, `Notes: ${rep.setup.notes || '-'}`, '');
  const e = rep.env || {};
  const m = rep.updateMode;
  add('== Update mode ==', m ? `Entered from this page: ${m.result}; controller ${m.name || '?'}, firmware ${m.firmware || '?'}, wireless part ${m.part || '?'}` : 'Entered by hand (or not recorded)', '');
  add('== Browser ==', `User agent: ${e.userAgent}`, `Client hints: ${JSON.stringify(e.clientHints || null)}`, `GPU: ${e.gpu || '-'}`,
    `Web Serial: ${e.webSerial}, WebUSB: ${e.webUSB}, cores: ${e.cores}, memory: ${e.memoryGB} GB, granted ports: ${(e.grantedSerialPorts || []).join(', ') || '-'}`, '');
  const s = rep.serial;
  add('== Serial test ==');
  if (!s) add('Not run');
  else {
    add(`Verdict: ${serialVerdict(s)}`, `Port picked: ${s.port?.usbVendorId}:${s.port?.usbProductId}${s.allPorts ? ' (from all ports)' : ''}`,
      `Open: ${s.open?.ok ? `ok in ${s.open.ms} ms` : s.open?.error}`);
    if (s.signals) add(`DTR/RTS change: ${s.signals.ok ? `median ${s.signals.medianMs} ms, min ${s.signals.minMs}, max ${s.signals.maxMs} (${s.signals.samples} samples)` : s.signals.error}`);
    for (const r of s.resets) {
      add(`- ${r.id} (${r.label}): ${r.error || `${r.outcome}, ${r.bytes} bytes, first byte ${r.firstByteMs ?? '-'} ms, signal calls ${JSON.stringify(r.signalMs)}${r.sync ? `, SYNC ${r.sync.replied ? 'answered' : 'no answer'} after ${r.sync.tries} tries (${r.sync.replyBytes} bytes back)` : ''}`}`);
      if (r.output) add(`    output: ${r.output.replace(/\n+/g, ' / ').slice(0, 300)}`);
    }
    if (s.readError) add(`Read error: ${s.readError}`);
  }
  add('', '== USB route ==', rep.usb ? JSON.stringify(rep.usb) : 'Not run', '');
  add('== PC details (PowerShell) ==', rep.powershell?.trim() || 'Not provided', '');
  add('== Last update dialog log ==', rep.updateLog?.trim() || 'None in this session');
  return lines.join('\n');
}

export function mount(root, { session }) {
  const report = {
    created: new Date().toISOString(), env: null,
    setup: { controller: '', port: '', portType: '', notes: '' },
    serial: null, usb: null, powershell: '', updateLog: lastModuleUpdateLog(), updateMode: null,
  };
  environment().then((env) => { report.env = env; });

  // ---- Before you start ------------------------------------------------------------------------
  const modeStatus = h('div');
  const say = (tone, text) => modeStatus.replaceChildren(callout({ tone, text }));

  /** Connect the controller (USB) if needed, then restart it into update mode, as the update dialog does. */
  async function enterUpdateMode() {
    if (!session.connected) {
      await connectController();
      if (!session.connected) { say('yellow', t('No controller connected. Connect it with a USB cable and try again, or enter update mode by hand.')); return false; }
    }
    if (session.caps.viaDongle) { say('yellow', t('Update mode needs a USB cable. Plug the controller in with a cable and try again.')); return false; }
    if (!session.caps.externalBaseband) { say('yellow', t('This controller has no ESP32 wireless module, so there’s nothing to test here.')); return false; }
    const info = {
      name: session.info?.name, firmware: formatFwVersion(session.info?.fwVersion),
      part: session.static?.bluetooth?.part_number ? decodeText(session.static.bluetooth.part_number) || null : null,
    };
    say('blue', t('The controller is restarting. Its lights will pulse orange.'));
    const dropped = new Promise((resolve) => {
      const off = session.on('state', ({ state }) => { if (state !== 'connected') { off(); resolve(true); } });
      setTimeout(() => { off(); resolve(false); }, RESTART_TIMEOUT_MS);
    });
    try { await session.flush(); } catch { /* the command below matters more */ }
    // The firmware reboots without answering (settings.c), so don't wait for a reply.
    session.command('gamepad', 'ENABLE_BLUETOOTH_UPLOAD', { timeout: 2000 }).catch(() => {});
    const ok = await dropped;
    report.updateMode = { ...info, result: ok ? 'controller left USB (update mode)' : 'controller stayed connected' };
    renderReport();
    if (ok) say('green', t('Done. The lights should now pulse orange: run the connection test below.'));
    else say('yellow', t('The controller didn’t restart. Unplug it and enter update mode by hand (step 2 above).'));
    return ok;
  }

  const intro = card({ title: t('Before you start'), icon: 'info', tone: TONE, subtitle: t('For a wireless module update that won’t connect.') },
    h('p.small.muted', t('This page tests each step the wireless module update relies on and collects the details we need to fix it. Nothing is written to the controller.')),
    h('ol.tips',
      h('li', t('Close other tabs and apps that use the controller, including the update dialog.')),
      h('li', t('Put the controller in update mode: press the button below and choose the controller. Or do it by hand: unplug it, hold R + Start (ZR + Start on the GC Ultimate 1) and plug it in. Its lights pulse orange.')),
      h('li', t('Use the same cable and USB port that didn’t work, so the test sees the same problem.'))),
    h('div.row', asyncButton({ label: t('Put the controller in update mode'), icon: 'refresh', variant: 'tonal', busyLabel: t('Restarting…'), run: enterUpdateMode })),
    modeStatus);

  // ---- Your setup ------------------------------------------------------------------------------
  const opt = (list) => list.map((x) => ({ value: x, label: t(x) }));
  // A dropdown that starts on its "Choose…" placeholder (select() leaves nothing selected without a value).
  const choose = (list, label, key) => {
    const el = select({ options: opt(list), placeholder: t('Choose…'), ariaLabel: label, onChange: (v) => { report.setup[key] = v; } });
    el.selectedIndex = 0;
    return el;
  };
  const setupCard = card({ title: t('Your setup'), icon: 'gamepad', tone: TONE, subtitle: t('Optional, but it helps us a lot.') },
    h('div.dg-fields',
      h('label.dg-field', h('span.field-label', t('Controller')), choose(CONTROLLERS, t('Controller'), 'controller')),
      h('label.dg-field', h('span.field-label', t('USB port')), choose(PORTS, t('USB port'), 'port')),
      h('label.dg-field', h('span.field-label', t('Port type')), choose(PORT_TYPES, t('Port type'), 'portType'))),
    h('label.dg-field', h('span.field-label', t('Anything else')),
      textInput({ placeholder: t('Processor, motherboard, what you already tried…'), ariaLabel: t('Anything else'), onInput: (v) => { report.setup.notes = v; } })));

  // ---- PC details (Windows) --------------------------------------------------------------------
  const paste = h('textarea.input.dg-paste', { rows: 6, spellcheck: false, placeholder: t('Paste the result here.'), 'aria-label': t('PowerShell result') });
  paste.addEventListener('input', () => { report.powershell = paste.value; });
  const pcCard = isWindows() && card({ title: t('PC details'), icon: 'settings', tone: TONE, subtitle: t('Your processor, motherboard and USB driver, which this page can’t see by itself.') },
    h('ol.tips',
      h('li', t('Press Copy command.')),
      h('li', t('Right-click the Start button and choose Terminal (or Windows PowerShell).')),
      h('li', t('Paste with a right-click or Ctrl+V and press Enter. It only reads information, then copies the result.')),
      h('li', t('Come back here and paste the result into the box.'))),
    h('div.row', button({
      label: t('Copy command'), icon: 'copy', variant: 'tonal', size: 'sm',
      onClick: async () => {
        try { await navigator.clipboard.writeText(POWERSHELL_COMMAND); toast(t('Command copied'), { tone: 'green', icon: 'check' }); }
        catch { toast(t('Couldn’t copy. Select the text and copy it yourself.'), { tone: 'red' }); }
      },
    })),
    paste);

  // ---- Connection test -------------------------------------------------------------------------
  const steps = h('ol.dg-steps');
  const verdict = h('div');
  const stepLabels = {
    open: t('Open the port'), signals: t('Signal timing'),
    ...Object.fromEntries(RESETS.map((r, i) => [r.id, i === 0 ? t('Normal restart') : t('Update-mode restart {n} of {total}', { n: i, total: RESETS.length - 1 })])),
  };
  const stepRow = {};
  const resetSteps = () => {
    steps.replaceChildren(...Object.entries(stepLabels).map(([id, label]) => {
      const state = h('span.dg-state', h('span.faint', '–'));
      stepRow[id] = state;
      return h('li', h('span', label), state);
    }));
  };
  const showStep = (id, st, data) => {
    const el = stepRow[id];
    if (!el) return;
    if (st === 'running') { el.replaceChildren(h('span.spinner.motion-ok')); return; }
    let good = true;
    let text = t('Done');
    if (id === 'open') { good = !!data?.ok; text = good ? t('Opened') : t('Failed'); }
    else if (id === 'signals') { good = !!data?.ok; text = good ? `${data.medianMs} ms` : t('Failed'); }
    else if (data?.error) { good = false; text = t('Failed'); }
    else if (id === 'run') { good = data.bytes > 0; text = good ? t('Module replied') : t('No reply'); }
    else { good = !!data.sync?.replied; text = good ? t('Module answered') : data.outcome === 'normal-boot' ? t('Normal start') : t('No answer'); }
    el.replaceChildren(icon(good ? 'check' : 'close'), h('span', text));
    el.classList.toggle('bad', !good);
  };

  async function runSerial(allPorts) {
    if (!navigator.serial) { toast(t('Web Serial isn’t available in this browser. Use Chrome or Edge on a computer.'), { tone: 'red' }); return false; }
    let port;
    try {
      port = await navigator.serial.requestPort(allPorts ? {} : { filters: [{ usbVendorId: WCH_VENDOR }] });
    } catch {
      return false; // picker canceled
    }
    resetSteps();
    verdict.replaceChildren();
    const result = await probeSerialPort(port, { onStep: showStep });
    result.allPorts = !!allPorts;
    result.at = new Date().toISOString();
    report.serial = result;
    const [text, tone] = customerVerdict(result);
    verdict.replaceChildren(callout({ tone, text: [text, ' ', t('Either way, copy the report below and send it to support.')] }));
    renderReport();
    return true;
  }

  async function runUsb() {
    if (!navigator.usb) { toast(t('WebUSB isn’t available in this browser.'), { tone: 'red' }); return false; }
    let device;
    try { device = await navigator.usb.requestDevice({ filters: [{ vendorId: WCH_VENDOR }] }); } catch { return false; }
    report.usb = await probeUsbDevice(device);
    renderReport();
    toast(t('USB route tested. It’s in the report.'), { tone: 'green', icon: 'check' });
    return true;
  }

  resetSteps();
  const testCard = card({ title: t('Connection test'), icon: 'usb', tone: TONE, subtitle: t('Takes about 15 seconds.') },
    h('p.small.muted', t('With the lights pulsing orange, press Run test and choose the USB serial device (usually USB-SERIAL CH340).')),
    h('div.row',
      asyncButton({ label: t('Run test'), icon: 'play', variant: 'primary', busyLabel: t('Testing…'), run: () => runSerial(false) }),
      button({ label: t('Not listed? Show all serial ports'), variant: 'ghost', size: 'sm', onClick: () => runSerial(true) })),
    steps, verdict,
    h('details.dg-more', h('summary', t('More tests')),
      h('p.small.muted', t('Checks whether the browser can reach the USB serial chip directly, the way the app does on Android and Linux. On Windows it usually can’t, which is expected.')),
      h('div.row', asyncButton({ label: t('Test the USB route'), icon: 'usb', variant: 'tonal', size: 'sm', run: runUsb }))));

  // ---- Report ----------------------------------------------------------------------------------
  const preview = h('pre.dg-report');
  const renderReport = () => { preview.textContent = reportText(report); };
  const reportCard = card({ title: t('Report'), icon: 'save', tone: 'green', subtitle: t('Send this with your support ticket.') },
    h('div.row',
      button({
        label: t('Copy report'), icon: 'copy', variant: 'primary', onClick: async () => {
          renderReport();
          try { await navigator.clipboard.writeText(preview.textContent); toast(t('Report copied'), { tone: 'green', icon: 'check' }); }
          catch { toast(t('Couldn’t copy. Select the text and copy it yourself.'), { tone: 'red' }); }
        },
      }),
      button({
        label: t('Download report'), icon: 'download', variant: 'tonal', onClick: () => {
          renderReport();
          const data = { tool: 'hhl-wireless-diagnostics', version: 1, ...report, text: preview.textContent };
          const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `hhl-wireless-diagnostics-${report.created.slice(0, 10)}.json` });
          document.body.append(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        },
      })),
    h('details.dg-preview', { ontoggle: renderReport }, h('summary', t('Show report')), preview));

  root.append(intro, setupCard, pcCard || '', testCard, reportCard);
}
