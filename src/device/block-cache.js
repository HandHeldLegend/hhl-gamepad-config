/**
 * block-cache.js: The settings blocks read from each controller before, kept in this browser (IndexedDB),
 * so connecting reads again only the blocks that changed. No DOM.
 *
 * The controller sends a CRC32 of every block first (hoja-device.js, WEBUSB_ID_BLOCK_FINGERPRINTS); a
 * cached block is used only when the CRC32 of its cached bytes equals that fingerprint exactly, so a
 * stale or foreign entry can never be used by mistake. Entries are keyed by the controller's MAC
 * address (the gamepad config block), the same over USB, Bluetooth and the dongle.
 *
 *   crc32(bytes)                         standard CRC-32 (reflected 0xEDB88320), as the firmware computes it
 *   findCacheByBlock(kind, index, crc)   the entry whose block matches (how the controller is recognized)
 *   loadCache(key)                       an entry, or null
 *   storeCacheBlocks(key, blocks)        add / replace blocks: [{ kind, index, bytes }]
 *
 * Entry: { key, used, config: { [index]: { bytes, crc } }, static: { ... } }
 * Everything resolves null / does nothing when IndexedDB is unavailable (private mode, blocked storage):
 * the app then reads every block, as without the cache.
 */

const DB_NAME = 'hhl-block-cache';
const STORE = 'controllers';
/** Controllers kept; the least recently used make room. */
const KEEP = 12;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 of `bytes` (init 0xFFFFFFFF, final xor), unsigned. */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

let dbPromise = null;
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('No IndexedDB'));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; }); // private mode etc.: try again next time
  return dbPromise;
}

const result = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

async function withStore(mode, fn) {
  const tx = (await openDb()).transaction(STORE, mode);
  const committed = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  const out = await fn(tx.objectStore(STORE));
  await committed;
  return out;
}

/** The block's cached bytes when they still match `crc`, else null. */
export function cachedBlock(entry, kind, index, crc) {
  const b = entry?.[kind]?.[index];
  if (!b?.bytes || crc == null || crc === 0) return null; // 0: the controller has no such block
  const bytes = b.bytes instanceof Uint8Array ? b.bytes : new Uint8Array(b.bytes);
  return crc32(bytes) === crc ? bytes : null;
}

/** The entry whose block `kind`/`index` matches `crc` (how a controller is recognized before reading). */
export async function findCacheByBlock(kind, index, crc) {
  try {
    const all = await withStore('readonly', (s) => result(s.getAll()));
    return all.find((e) => cachedBlock(e, kind, index, crc)) || null;
  } catch (err) {
    console.warn('[cache] not available', err?.message || err);
    return null;
  }
}

export async function loadCache(key) {
  if (!key) return null;
  try {
    return (await withStore('readonly', (s) => result(s.get(key)))) || null;
  } catch {
    return null;
  }
}

/** Add or replace blocks of controller `key`: [{ kind: 'config' | 'static', index, bytes }]. */
export async function storeCacheBlocks(key, blocks) {
  if (!key || !blocks.length) return;
  try {
    await withStore('readwrite', async (s) => {
      const entry = (await result(s.get(key))) || { key, config: {}, static: {} };
      for (const { kind, index, bytes } of blocks) {
        const copy = new Uint8Array(bytes);
        entry[kind][index] = { bytes: copy, crc: crc32(copy) };
      }
      entry.used = Date.now();
      s.put(entry);
      // Keep the most recently used few
      const all = await result(s.getAll());
      all.sort((a, b) => (b.used || 0) - (a.used || 0)).slice(KEEP).forEach((e) => s.delete(e.key));
    });
  } catch (err) {
    console.warn('[cache] not stored', err?.message || err);
  }
}
