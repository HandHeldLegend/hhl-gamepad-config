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
 * The update this controller should be offered.
 * @returns {Promise<{channel: object, installed: number, latest: number|null, migrate: boolean,
 *           mismatch: boolean, available: boolean}>}
 *   migrate   legacy baseband → HCI bridge (recommended; re-pair afterwards)
 *   mismatch  the module runs the bridge but this controller firmware can only drive the legacy baseband
 *             (no Bluetooth until the baseband is reinstalled or the controller firmware is updated)
 */
export async function resolveModuleUpdate(bt) {
  const installed = bt?.external_version_number ?? 0;
  if (supportsBridge(bt)) {
    const latest = await latestVersion('bridge');
    if (latest) {
      const migrate = familyOf(installed) !== 'bridge';
      return { channel: CHANNELS.bridge, installed, latest, migrate, mismatch: false, available: migrate || installed < latest };
    }
    // Bridge not reachable: an old baseband still gets legacy updates (the fallback driver runs it).
    if (familyOf(installed) === 'bridge') return { channel: CHANNELS.bridge, installed, latest: null, migrate: false, mismatch: false, available: false };
  }
  const latest = await latestVersion('legacy');
  const mismatch = !supportsBridge(bt) && familyOf(installed) === 'bridge';
  return { channel: CHANNELS.legacy, installed, latest, migrate: false, mismatch, available: !!latest && (installed < latest || mismatch) };
}
