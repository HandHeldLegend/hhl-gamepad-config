/**
 * history.js: Automatic backups, kept in this browser (IndexedDB), no DOM.
 *
 * Each time a controller connects, its settings are backed up (the same object createBackup() makes
 * for a file). Per controller (backup.controller.unit, a hash of its MAC address) the last KEEP
 * different versions are kept: connecting again with unchanged settings only updates the newest
 * entry's `seen` time, so plugging in every day doesn't push out older versions. The updater
 * snapshots again before an update (snapshot()), so edits made since connecting are in it too.
 *
 *   initAutoBackup(session)       hook (main.js): snapshot on every connect
 *   listBackups()                 every entry, newest first
 *   connectionBackup()            the entry for the controller connected now, once it is stored
 *   history.on(fn)                called after entries change
 *
 * Entry: { id, unit, name, build, fwVersion, created, seen, content, backup }
 *   created: when this version was first seen; seen: when it was last confirmed on the controller;
 *   content: hash of the settings (backup.blocks), to tell versions apart.
 * The demo controller is never backed up.
 */
import { createBackup } from './backup.js';
import { isDemo } from '../../device/mock.js';

export const KEEP = 5;
const DB_NAME = 'hhl-backups';
const STORE = 'backups';

let dbPromise = null;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('unit', 'unit');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; }); // private mode etc.: try again next time
  return dbPromise;
}

const result = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** Run `fn(store)` in one transaction; resolves with its result once the transaction has committed. */
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

const newestFirst = (a, b) => (b.created.localeCompare(a.created)) || (b.id - a.id);

async function hash(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

const listeners = new Set();
export const history = {
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
const changed = () => listeners.forEach((fn) => fn());

let current = null; // the connected controller's entry

/** The stored entry for the controller connected now (null before its snapshot is stored). */
export const connectionBackup = () => current;

/** Every stored entry, newest first ([] when this browser can't store them). */
export async function listBackups() {
  if (!globalThis.indexedDB) return [];
  try {
    return (await withStore('readonly', (store) => result(store.getAll()))).sort(newestFirst);
  } catch (err) {
    console.warn('[backup] history unavailable', err);
    return [];
  }
}

/**
 * Back up the connected controller into the history. Resolves with its entry, or null when there is
 * nothing to store (demo, not connected, no storage, or no unit id to file it under).
 */
export async function snapshot(session) {
  if (!session.connected || isDemo() || !globalThis.indexedDB || !crypto?.subtle) return null;
  try {
    const backup = await createBackup(session);
    const { unit } = backup.controller;
    if (!unit) return null;
    const content = await hash(JSON.stringify(backup.blocks));
    const entry = await withStore('readwrite', async (store) => {
      const list = (await result(store.index('unit').getAll(unit))).sort(newestFirst);
      if (list[0]?.content === content) {
        list[0].seen = backup.created;
        store.put(list[0]);
        return list[0];
      }
      const e = {
        unit, name: backup.controller.name, build: backup.controller.build, fwVersion: backup.controller.fwVersion,
        created: backup.created, seen: backup.created, content, backup,
      };
      e.id = await result(store.add(e));
      for (const old of list.slice(KEEP - 1)) store.delete(old.id);
      return e;
    });
    if (session.connected) current = entry;
    changed();
    return entry;
  } catch (err) {
    console.warn('[backup] automatic backup failed', err);
    return null;
  }
}

/** Snapshot every controller as it connects. */
export function initAutoBackup(session) {
  session.on('state', ({ state }) => {
    if (state === 'connected') snapshot(session);
    else if (current) { current = null; changed(); }
  });
}
