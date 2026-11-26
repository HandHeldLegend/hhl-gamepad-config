/**
 * support-report.js: One file a customer can send to support for any problem with the app or a
 * controller. No DOM apart from the download itself.
 *
 *   const report = await buildSupportReport(session);   // plain object
 *   const file = saveSupportReport(report);             // hands it to the browser, returns the name
 *
 * What it holds:
 *   app         version, firmware layout, language, page, installed or in a tab
 *   browser     user agent, system, what the browser offers (WebUSB, Bluetooth, Serial)
 *   controller  name, maker, firmware, build, how it is connected, USB IDs, capabilities, settings
 *               blocks that didn't answer, unsaved blocks, warnings, profiles, dongle
 *   hardware    the controller's static info blocks (what the board has)
 *   settings    every settings block, as in a settings backup (sections/backup/backup.js)
 *   log         the app's recent warnings, errors and connection changes (app/app-log.js)
 *
 * What it leaves out: the controller's address and its pairings (the backup's identity fields), the
 * dongle's address, and any address in a log line. The controller is named by the same short hash a
 * backup uses, so two reports can be told to be the same unit.
 */
import { h } from '../../ui/dom.js';
import { LAYOUT, decodeText } from '../../device/struct.js';
import { device } from '../../device/hoja-device.js';
import { isDemo } from '../../device/mock.js';
import { loadVersion } from '../../app/pwa.js';
import { appLog } from '../../app/app-log.js';
import { i18n } from '../../i18n/index.js';
import { buildIdFromManifestUrl } from '../../firmware/changelog.js';
import { createBackup, unitId } from '../backup/backup.js';

export const REPORT_TOOL = 'hhl-support-report';
export const REPORT_VERSION = 1;

const hex4 = (n) => (n == null ? null : Number(n).toString(16).padStart(4, '0'));
const TEXT_FIELD = /(name|names|maker|url|part_number|fcc_id)$/;
const ADDRESS_FIELD = /mac/i;

/** A static block as plain data: text fields decoded, addresses and padding dropped. */
export function plainStatic(value, name = '') {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const list = Array.from(value);
    if (TEXT_FIELD.test(name) && list.every((v) => typeof v === 'number')) return decodeText(Uint8Array.from(list)).trim();
    return list.map((v) => plainStatic(v, name));
  }
  if (value && typeof value === 'object') {
    const src = typeof value.toJSON === 'function' ? value.toJSON() : value;
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      if (ADDRESS_FIELD.test(k) || k.startsWith('reserved')) continue;
      out[k] = plainStatic(v, k);
    }
    return out;
  }
  return value;
}

async function browserInfo() {
  const info = {
    userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language,
    cores: navigator.hardwareConcurrency ?? null, memoryGB: navigator.deviceMemory ?? null, online: navigator.onLine,
    webUSB: !!navigator.usb, webBluetooth: !!navigator.bluetooth, webSerial: !!navigator.serial, gamepadApi: !!navigator.getGamepads,
    screen: `${window.screen?.width}x${window.screen?.height} @${window.devicePixelRatio}`, window: `${window.innerWidth}x${window.innerHeight}`,
  };
  try {
    const ch = await navigator.userAgentData?.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'bitness', 'fullVersionList']);
    if (ch) info.clientHints = { platform: ch.platform, platformVersion: ch.platformVersion, architecture: ch.architecture, bitness: ch.bitness, browsers: (ch.fullVersionList || []).map((b) => `${b.brand} ${b.version}`) };
  } catch { /* not offered */ }
  return info;
}

async function controllerInfo(session) {
  const out = { state: session.state, demo: isDemo() };
  if (!session.connected) return out;
  const usb = device.usbDevice;
  const fw = session.info?.fwVersion ?? null;
  Object.assign(out, {
    name: session.info?.name ?? null,
    maker: session.info?.maker ?? null,
    build: buildIdFromManifestUrl(session.info?.manifestUrl),
    fwVersion: fw,
    fwDate: fw > 1.4e9 && fw < 4e9 ? new Date(fw * 1000).toISOString() : null,
    unit: await unitId(session.config).catch(() => null),
    transport: device.transport,
    viaDongle: !!device.dongle,
    usb: usb ? { vendorId: hex4(usb.vendorId), productId: hex4(usb.productId), version: `${usb.deviceVersionMajor}.${usb.deviceVersionMinor}.${usb.deviceVersionSubminor}`, product: usb.productName ?? null } : null,
    capabilities: Object.entries(session.caps || {}).filter(([, v]) => v).map(([k]) => k).sort(),
    missingBlocks: { config: [...device.missing.config], static: [...device.missing.static] },
    unsavedBlocks: [...(session.dirty || [])],
    warnings: Object.keys(session.attention || {}),
    blockVersions: {},
  });
  for (const b of LAYOUT.blocks.config) {
    if (device.missing.config.includes(b.key)) continue;
    const field = LAYOUT.structs[b.struct]?.fields.find((f) => /_config_version$/.test(f.name));
    if (field) out.blockVersions[b.key] = session.config[b.key]?.[field.name] ?? null;
  }
  out.profiles = await device.readProfiles().catch(() => null);
  if (device.dongle) out.dongle = plainStatic({ ...device.dongle });
  return out;
}

function hardwareInfo(session) {
  const out = {};
  for (const b of LAYOUT.blocks.static) {
    if (device.missing.static.includes(b.key)) continue;
    try { out[b.key] = plainStatic(session.static[b.key]); } catch { out[b.key] = null; }
  }
  return out;
}

/** Build the report for the app as it is now, with or without a controller connected. */
export async function buildSupportReport(session) {
  const report = {
    tool: REPORT_TOOL,
    version: REPORT_VERSION,
    created: new Date().toISOString(),
    app: {
      version: (await loadVersion().catch(() => null)) || null,
      layout: LAYOUT.source?.ref ?? null,
      language: i18n.lang,
      page: location.hash.split('?')[0] || '#/',
      installed: !!window.matchMedia?.('(display-mode: standalone)').matches,
    },
    browser: await browserInfo(),
    controller: null, hardware: null, settings: null,
    log: appLog(),
  };
  // Each part on its own: a controller that stops answering halfway still gives a report.
  try { report.controller = await controllerInfo(session); } catch (err) { report.controller = { error: String(err?.message || err) }; }
  if (session.connected) {
    try { report.hardware = hardwareInfo(session); } catch (err) { report.hardware = { error: String(err?.message || err) }; }
    try { report.settings = (await createBackup(session)).blocks; } catch (err) { report.settings = { error: String(err?.message || err) }; }
  }
  return report;
}

/** File name: hhl-support-report-<build or name>-<yyyy-mm-dd-hhmm>.json */
export function supportReportFileName(report) {
  const who = (report.controller?.build || report.controller?.name || 'no-controller').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
  return `hhl-support-report-${who}-${report.created.slice(0, 16).replace(/[:T]/g, '-')}.json`;
}

/** Hand the report to the browser as a .json download. Returns the file name. */
export function saveSupportReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: supportReportFileName(report) });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return a.download;
}
