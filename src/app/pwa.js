/**
 * pwa.js: Service worker registration, offline readiness, app updates and install prompts.
 *
 * Update flow (no silent swaps mid-session):
 *   1. A new sw.js is found → it precaches the new version in the background and posts
 *      { type: 'precache-progress', done, total } messages → we show a progress toast/dialog.
 *   2. When it's installed and waiting, we show "Update ready: Restart".
 *   3. Restart → postMessage('skip-waiting') → controllerchange → reload.
 *
 * Only the tab that asked for the update reloads. When another tab applies it, this tab is told
 * "ready" again and decides for itself (update-ui.js), so it is never reloaded mid-session.
 *
 * The service worker is skipped on localhost unless the URL has ?sw, so edits show up on a
 * plain refresh during development (see tools/serve.mjs).
 *
 * Events: pwa.on('installable', bool) · pwa.on('offline-ready') ·
 *         pwa.on('update', {state: 'downloading'|'ready'|'failed', done, total})
 */
const listeners = new Map();
const emit = (type, detail) => { for (const fn of listeners.get(type) || []) fn(detail); };

let deferredPrompt = null;
let waitingWorker = null;
let requested = false; // this tab asked for the update (Restart, or applied automatically)
const tracked = new WeakSet();

export const pwa = {
  canInstall: false,
  version: null,
  updateState: 'idle', // idle | downloading | ready
  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  },
  async promptInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    pwa.canInstall = false;
    emit('installable', false);
    return outcome === 'accepted';
  },
  /** True when running as an installed app. */
  get standalone() {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
  },
  get isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  applyUpdate() {
    requested = true;
    // Already in charge (another tab applied it): the reload is all that is left.
    if (!waitingWorker || navigator.serviceWorker?.controller === waitingWorker) return location.reload();
    waitingWorker.postMessage({ type: 'skip-waiting' });
  },
  async checkForUpdate() {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    return !!reg?.installing || !!reg?.waiting;
  },
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  pwa.canInstall = true;
  emit('installable', true);
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  pwa.canInstall = false;
  emit('installable', false);
});

/** Read the app version from the precache manifest (works offline once cached). */
export async function loadVersion() {
  try {
    await import('../../precache-manifest.js'); // sets self.__PRECACHE (shared with sw.js)
    pwa.version = self.__PRECACHE?.version || 'dev';
  } catch { pwa.version = 'dev'; }
  return pwa.version;
}

function trackWorker(worker) {
  // register() can resolve with the worker already installing and then fire updatefound for it too.
  if (!worker || tracked.has(worker)) return;
  tracked.add(worker);
  let installed = false;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') installed = true;
    if (worker.state === 'redundant' && !installed) {
      // The install failed (a file 404ed or the CDN still had the old copy). The browser retries later;
      // until then the current version keeps working, so drop the progress UI.
      if (pwa.updateState === 'downloading') pwa.updateState = 'idle';
      emit('update', { state: 'failed' });
    } else if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waitingWorker = worker;
      pwa.updateState = 'ready';
      emit('update', { state: 'ready' });
    } else if (worker.state === 'installed') {
      emit('offline-ready');
    }
  });
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const params = new URLSearchParams(location.search);
  if (local && !params.has('sw')) {
    // Dev mode: make sure no stale worker serves old files.
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) if (new URL(r.scope).pathname.startsWith(location.pathname.replace(/[^/]*$/, ''))) await r.unregister();
    return;
  }

  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'precache-progress') {
      pwa.updateState = m.done >= m.total ? pwa.updateState : 'downloading';
      emit('update', { state: 'downloading', done: m.done, total: m.total, first: !navigator.serviceWorker.controller });
    }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !waitingWorker) return;
    // Another tab applied the update. Reloading here could cut off a firmware write or drop unsaved
    // settings, so ask again; update-ui.js reloads right away only when nothing is going on.
    if (!requested) { emit('update', { state: 'ready' }); return; }
    reloading = true;
    location.reload();
  });

  const reg = await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
  if (reg.waiting && navigator.serviceWorker.controller) {
    waitingWorker = reg.waiting;
    pwa.updateState = 'ready';
    emit('update', { state: 'ready' });
  }
  if (reg.installing) trackWorker(reg.installing);
  reg.addEventListener('updatefound', () => trackWorker(reg.installing));

  // Look for updates when the app regains focus (cheap: sw.js is tiny and served no-cache).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
}
