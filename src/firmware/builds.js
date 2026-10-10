/**
 * builds.js: The catalog of HOJA device firmware builds (github.com/HandHeldLegend/hoja-device-fw).
 *
 * Builds are listed live from GitHub's contents API. The last successful list is kept in
 * localStorage so the picker still shows names offline (flashing itself needs a download).
 *
 * Folders named dongle_* hold WLAN dongle firmware (the USB receiver, not a controller). They are
 * kept apart from the controller builds: listBuilds() returns them as `dongles`.
 */
// Marks a literal for translation (tools/test-i18n.mjs); kept local so this module stays Node-importable
// (the MCP server lists builds, and src/i18n/index.js needs a browser).
const N_ = (text) => text;

const BUILDS_API = 'https://api.github.com/repos/HandHeldLegend/hoja-device-fw/contents/builds';
const RAW_BASE = 'https://raw.githubusercontent.com/HandHeldLegend/hoja-device-fw/main/builds';
const CACHE_KEY = 'hhl-config:builds';

/** Friendly names for build folder ids. Unknown ids are title-cased automatically. */
export const DISPLAY_NAMES = {
  gcu_1: 'GC Ultimate 1',
  gcu_2: 'GC Ultimate 2',
  gcu_2s: 'GC Ultimate 2S',
  gcu_proto: 'GC Ultimate (Proto)',
  gcu_r4k: 'GC Ultimate 1', // renamed to gcu_1; folder kept so controllers on it still get updates
  hoverboard: 'Hoverboard',
  padbox_gs_c: 'Padbox GS-C',
  phob_2: 'Phob 2',
  pico_w: 'Pico W',
  progcc_3: 'ProGCC 3',
  progcc_3p: 'ProGCC 3+',
  'progcc_3.1': 'ProGCC 3.1',
  'progcc_3.2': 'ProGCC 3.2',
  progcc_3s: 'ProGCC 3S',
  super_gamepad: 'Super Gamepad+',
};

/**
 * Build folders that still exist on GitHub but shouldn't be offered: GCU R5 and S1 were renamed to
 * GC Ultimate 2 / 2S (gcu_2, gcu_2s), and the R4K to GC Ultimate 1 (gcu_1, same firmware). Filtered
 * from the live listing, the cache and the offline list.
 */
export const HIDDEN_BUILDS = new Set(['gcu_r5', 'gcu_s1', 'gcu_r4k']);

const visible = (ids) => ids.filter((id) => !HIDDEN_BUILDS.has(id));

/**
 * WLAN dongle builds, keyed by the board the dongle reports (0xD0 reply byte 2). `chip` is the
 * bootloader that runs it: RP2040 (USB PID 0x0003) or RP2350 (0x000f). Labels: t() them where shown.
 */
export const DONGLE_BUILDS = {
  1: { id: 'dongle_hoja', label: N_('HOJA WLAN Dongle'), chip: 'rp2350' },
  2: { id: 'dongle_pico_w', label: N_('WLAN Dongle (Pico W)'), chip: 'rp2040' },
  3: { id: 'dongle_pico2_w', label: N_('WLAN Dongle (Pico 2 W)'), chip: 'rp2350' },
};

export const isDongleBuild = (id) => id.startsWith('dongle_');
const dongleInfo = (id) => Object.values(DONGLE_BUILDS).find((d) => d.id === id);

/** Special entry: wipes the whole flash (recovery for badly corrupted boards). Label: t() it where shown. */
export const NUKE_BUILD = {
  id: 'full-reset-nuke',
  label: N_('Full reset: erase flash (nuke)'),
  uf2Url: new URL('../../firmware/universal_flash_nuke.uf2', import.meta.url).href,
  manifestUrl: null,
  danger: true,
};

export function humanizeBuildId(id) {
  return DISPLAY_NAMES[id] || dongleInfo(id)?.label || id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function toBuild(id) {
  return {
    id,
    label: humanizeBuildId(id),
    uf2Url: `${RAW_BASE}/${id}/${id}.uf2`,
    binUrl: `${RAW_BASE}/${id}/${id}.bin`,
    manifestUrl: `${RAW_BASE}/${id}/manifest.json`,
  };
}

/** The firmware build for a WLAN dongle board (1 HOJA, 2 Pico W, 3 Pico 2 W), or null when unknown. */
export function dongleBuild(board) {
  const d = DONGLE_BUILDS[board];
  return d ? { ...toBuild(d.id), chip: d.chip } : null;
}

/** Split folder ids into sorted controller builds and dongle builds. */
function catalog(ids, offline) {
  const byLabel = (a, b) => a.label.localeCompare(b.label);
  return {
    builds: ids.filter((id) => !isDongleBuild(id)).map(toBuild).sort(byLabel),
    dongles: ids.filter(isDongleBuild).map((id) => ({ ...toBuild(id), chip: dongleInfo(id)?.chip ?? null })).sort(byLabel),
    offline,
  };
}

let memo = null;

/** @returns {Promise<{builds: Array, dongles: Array, offline: boolean}>} builds: controllers only */
export async function listBuilds() {
  if (memo) return memo;
  try {
    const res = await fetch(BUILDS_API);
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const ids = visible((await res.json()).filter((e) => e.type === 'dir').map((e) => e.name));
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
    memo = catalog(ids, false);
  } catch (err) {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { /* ignore */ }
    ids = visible(Array.isArray(ids) ? ids : []);
    if (!ids.length) ids = visible(Object.keys(DISPLAY_NAMES));
    console.warn('[builds] using cached list:', err.message);
    return catalog(ids, true);
  }
  return memo;
}

export async function getBuildManifest(manifestUrl) {
  if (!manifestUrl) return null;
  try {
    const res = await fetch(manifestUrl, { cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
