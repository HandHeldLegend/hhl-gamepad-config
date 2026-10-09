/**
 * channels.js: Which ESP32 wireless-module firmware a controller can take, and where it comes from.
 *
 * Two firmwares run on the ESP32 next to the RP2040:
 *   legacy  "HOJA baseband" (versions 0xA0xx). Bluetooth runs on the ESP32.
 *   bridge  "HCI bridge" (versions 0xB000 and up). Bluetooth (BTstack) runs on the RP2040 and the ESP32
 *           only passes HCI traffic, which brings Wii mode, the current Switch / SInput code and
 *           USB-to-Bluetooth pairing to these boards.
 *
 * The controller's Bluetooth static block decides (no layout change, existing fields only):
 *   part_number "ESP32 HCI"  RP2040 firmware can drive the bridge (it reports this even while it runs
 *                            the fallback driver for an old baseband) → bridge channel. While the ESP32 is
 *                            still below 0xB000, the bridge is offered as a recommended migration.
 *   part_number "ESP32"      old RP2040 driver, legacy baseband only → legacy channel (never the bridge:
 *                            old RP2040 firmware has no Bluetooth on a bridge-flashed ESP32).
 *   anything else            no ESP32 updates (e.g. "RPI RM2"); caps.externalBaseband is already false.
 * If the bridge's manifest can't be fetched (not published yet, or offline), a controller on the old
 * baseband falls back to legacy updates, which its fallback driver still runs.
 *
 * Both firmwares use the same flash layout addresses: bootloader @ 0x1000, partition table @ 0x8000,
 * app @ 0x10000 (the bridge's from its build/flasher_args.json). All three images are written.
 */
import { decodeText } from '../../device/struct.js';
import { N_ } from '../../i18n/index.js';

/** First version number of the HCI bridge firmware; legacy baseband versions are 0xA0xx. */
export const BRIDGE_MIN_VERSION = 0xb000;

const LEGACY_BASE = 'https://raw.githubusercontent.com/HandHeldLegend/HOJA-ESP32-Baseband/master';
// Published bridge builds (same layout as the baseband repo: build/ + manifest.json); default branch is main.
const BRIDGE_BASE = 'https://raw.githubusercontent.com/HandHeldLegend/HOJA-ESP32-HCI-Bridge/main';

const images = (base, app) => Object.freeze([
  { name: 'Bootloader', label: N_('bootloader'), url: `${base}/build/bootloader/bootloader.bin`, address: 0x1000 },
  { name: 'Partition table', label: N_('partition table'), url: `${base}/build/partition_table/partition-table.bin`, address: 0x8000 },
  { name: 'Firmware', label: N_('firmware'), url: `${base}/build/${app}`, address: 0x10000 },
]);

export const CHANNELS = Object.freeze({
  legacy: { id: 'legacy', name: N_('HOJA baseband'), manifest: `${LEGACY_BASE}/manifest.json`, images: images(LEGACY_BASE, 'ESP32.bin') },
  bridge: { id: 'bridge', name: N_('HCI bridge'), manifest: `${BRIDGE_BASE}/manifest.json`, images: images(BRIDGE_BASE, 'hoja_hci_bridge.bin') },
});

/**
 * The module's reported version, or null when it didn't report one. 0 = no answer; 0xFFFF = the
 * ESP32 acknowledged but sent nothing (an empty I2C reply reads as all ones), which the controller
 * firmware passes on as if it were a version.
 */
export const reportedVersion = (bt) => {
  const v = bt?.external_version_number ?? 0;
  return v > 0 && v < 0xffff ? v : null;
};

/** The firmware family an installed version belongs to. */
export const familyOf = (version) => (version >= BRIDGE_MIN_VERSION ? 'bridge' : 'legacy');

/** True when the controller's RP2040 firmware can drive the HCI bridge. */
export function supportsBridge(bt) {
  return /^ESP32 HCI$/i.test(decodeText(bt?.part_number ?? new Uint8Array()).trim());
}

const manifestCache = new Map();
/** Forget the cached manifests, so the next check fetches them again ("Check again"). */
export function clearManifestCache() { manifestCache.clear(); }

/** Latest version from a channel's manifest (cached per page load), or null when unknown/offline. */
export async function latestVersion(channelId) {
  if (manifestCache.has(channelId)) return manifestCache.get(channelId);
  let v = null;
  try {
    const res = await fetch(CHANNELS[channelId].manifest, { cache: 'no-store' });
    if (res.ok) v = (await res.json())?.fw_version || null;
  } catch { /* offline */ }
  if (v != null) manifestCache.set(channelId, v);
  return v;
}

/**
 * The update this controller should be offered. Only the HCI bridge is installed now; the HOJA baseband
 * (legacy channel) is still recognized when it is installed, but never offered.
 * @returns {Promise<{channel: object, installed: number|null, latest: number|null, migrate: boolean,
 *           unknown: boolean, needsControllerUpdate: boolean, available: boolean}>}
 *   migrate                the module runs the HOJA baseband: install the HCI bridge (re-pair afterwards)
 *   unknown                the module didn't report a valid version (installed is null)
 *   needsControllerUpdate  this controller's firmware can't drive the HCI bridge yet ("ESP32", not
 *                          "ESP32 HCI"): update the controller firmware first
 */
export async function resolveModuleUpdate(bt) {
  const installed = reportedVersion(bt);
  const latest = await latestVersion('bridge');
  const base = { channel: CHANNELS.bridge, installed, latest, migrate: false, unknown: installed == null, needsControllerUpdate: false };
  if (!supportsBridge(bt)) return { ...base, needsControllerUpdate: true, available: false };
  if (installed == null) return { ...base, available: !!latest };
  const migrate = familyOf(installed) !== 'bridge';
  return { ...base, migrate, available: !!latest && (migrate || installed < latest) };
}
