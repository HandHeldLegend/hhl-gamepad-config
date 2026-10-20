/**
 * connect-module.js (the Connect popup): one place to connect a controller, over USB or Bluetooth. Every
 * Connect button opens it (shell.js connectController), so the browser's own choosers never appear unasked
 * and it is always clear which controllers are on a cable and which are wireless.
 *
 * What it shows
 *   - How a controller turns up: plugged in with a USB data cable, or (on and running wirelessly) with its
 *     Start and Select pressed together (Plus and Minus on some), which makes it visible over Bluetooth for
 *     10 seconds (ble_config.c). Each controller's card names it and its buttons as the controller does
 *     (see "Controllers this browser knows" below).
 *   - A live list, each entry marked USB or Bluetooth:
 *       USB        controllers this site may already use that are plugged in (navigator.usb.getDevices,
 *                  kept current on connect / disconnect). A click connects, with no browser chooser.
 *       Bluetooth  controllers this site was allowed on before, where the browser can list them
 *                  (navigator.bluetooth.getDevices). While the popup is open the app looks for them: it
 *                  watches their advertisements where it can (watchAdvertisements), otherwise it keeps
 *                  trying to connect, so after Plus + Minus the controller connects by itself. A click
 *                  tries that one now.
 *   - "Add USB controller…" / "Add Bluetooth controller…" for one this site hasn't used yet: the browser's
 *     chooser, only ever from these buttons (it needs the click). Where the browser can't list Bluetooth
 *     controllers (Chrome and Edge without the new-permissions-backend flag), every Bluetooth connect goes
 *     through the chooser: the button reads "Connect over Bluetooth…", and a tip names the flag.
 *   - Why Bluetooth can't be used, where it can't: Brave (off until enabled in brave://flags), Chrome,
 *     Chromium, Edge and Brave on Linux (off until the experimental web platform features flag is on),
 *     browsers without Web Bluetooth (Firefox, Safari), Bluetooth off on the computer.
 * Once a Bluetooth controller is reached (ble-link.js), the token this browser got before lets it straight
 * in; without one (or one the controller forgot) a code of six presses is entered on the controller, a step
 * in this popup: three face buttons as printed and three d-pad directions, a new code after a wrong press,
 * another on request after 30 seconds. Once per browser.
 *
 * openConnectModule() resolves { usb } (a USBDevice to open), { link } (an open BleLink this browser is
 * allowed on), or null. { cable: true } leaves Bluetooth out, for what needs the cable (firmware, diagnostics).
 */
import { h, fillNodes, loadStyles } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openDialog, toast } from '../ui/overlay.js';
import { button, callout } from '../ui/controls.js';
import { glyph, outputName, rawInputName } from '../sections/input/parts.js';
import { device, isListedUsb, requestUsbController } from '../device/hoja-device.js';
import { session } from '../device/session.js';
import { decodeText } from '../device/struct.js';
import { isDemo } from '../device/mock.js';
import { BleLink, requestBluetoothController, rememberedBluetoothControllers } from '../device/ble-link.js';
import { t, N_ } from '../i18n/index.js';
import { isIOS, openInBluefy, BLUEFY_STORE_URL } from './platform.js';
import { isLinux } from './linux.js';

// Button glyphs (styles live with the Input section).
loadStyles(new URL('../sections/input/input.css', import.meta.url));

/** Code letters for the d-pad, as glyph labels; face buttons are drawn as their letter. */
const DPAD = { U: 'D Up', D: 'D Down', L: 'D Left', R: 'D Right' };

/** Looking for remembered Bluetooth controllers: one try this often, each this long. */
const SEARCH_EVERY_MS = 2500;
const SEARCH_TRY_MS = 3000;
/** An advertisement within this long: the controller counts as visible. */
const SEEN_MS = 12000;

const BT_OFF = N_('Bluetooth is off or missing on this device. Turn it on, then try again.');
const CONNECT_FAILED = N_('Couldn’t connect over Bluetooth. Press {buttons} on the controller again, then choose it.');
const NO_USB = N_('This browser can’t talk to USB devices. Use Chrome or Edge on desktop or Android.');

/** Brave ships Web Bluetooth switched off (navigator.brave exists only there). */
async function isBraveBrowser() {
  try { return !!(await navigator.brave?.isBrave?.()); } catch { return false; }
}

// ---- Controllers this browser knows -------------------------------------------------------------
// Each controller's card shows it as the app knows it: its model and the owner's name for it (user
// config), and for Bluetooth the buttons that make it visible, its own Start and Select (ble_config.c:
// INPUT_CODE_START + INPUT_CODE_SELECT), which boards name differently (Plus and Minus on a GCU 2). All of
// it is kept per browser when a session reads the settings, and again after each save, by USB serial or
// Bluetooth id. Before a controller ever connected, its card falls back to what the browser reports.

const KNOWN_KEY = 'hhl-config:known-controllers';
const KNOWN_MAX = 16;

function loadKnown() {
  try {
    const v = JSON.parse(localStorage.getItem(KNOWN_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; } // private mode, storage blocked
}

/**
 * Keep what the connected controller's card shows (not the demo's). Not through a dongle: the dongle's
 * USB serial would then carry this controller's name, and the dongle's card would keep showing it after
 * the controller leaves (or another joins). A name filed that way before is dropped.
 */
function forgetKnown(id) {
  const known = loadKnown();
  if (!id || !(id in known)) return;
  delete known[id];
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify(known)); } catch { /* storage blocked */ }
}
function rememberController() {
  const id = device.transportId;
  if (isDemo() || !id || !session.connected) return;
  if (session.caps.viaDongle) { forgetKnown(id); return; }
  const known = loadKnown();
  delete known[id];
  known[id] = { // newest last; the oldest make room
    model: session.info.name || '',
    user: decodeText(device.config.user?.user_name ?? new Uint8Array()).trim(),
    start: rawInputName(device, 'START'),
    select: rawInputName(device, 'SELECT'),
  };
  const kept = Object.fromEntries(Object.entries(known).slice(-KNOWN_MAX));
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify(kept)); } catch { /* storage blocked */ }
}
session.on('state', ({ state }) => {
  if (state === 'connected') rememberController();
  else if (state === 'dongle' && !isDemo()) forgetKnown(device.transportId);
});
session.on('saved', rememberController); // the owner's name may have changed

/** A card's title: "GCU 2 · Mitch", the model alone without an owner's name, else `fallback`. */
function cardTitle(info, fallback) {
  if (!info?.model) return fallback;
  return info.user ? `${info.model} · ${info.user}` : info.model;
}

/** A controller's Start + Select as text, in its own names; "Start + Select" when it isn't known. */
function chordText(info) {
  return info?.start && info?.select ? `${outputName(info.start)} + ${outputName(info.select)}` : 'Start + Select';
}

/** Two buttons as glyphs, the way the connect guide draws a combo. */
function chordGlyphs(a, b, size) {
  return h('span.guide-combo.cm-chord', { role: 'img', 'aria-label': `${outputName(a)} + ${outputName(b)}` },
    glyph(a, { size }), h('span.guide-plus', { 'aria-hidden': 'true' }, '+'), glyph(b, { size }));
}

/** The six presses as big glyphs; `entered` of them are done and the next one is marked. */
function codeRow(letters, entered) {
  const names = [...letters].map((c) => (DPAD[c] ? outputName(DPAD[c]) : c));
  return h('div.bt-code', { role: 'img', 'aria-label': names.join(', ') },
    [...letters].map((c, i) => h('span.bt-code-cell', { class: i < entered ? 'done' : i === entered ? 'next' : null },
      glyph(DPAD[c] || c, { size: 56 }))));
}

/** iPhone / iPad without Web Bluetooth: Bluefy adds it (platform.js). */
function bluefyNote() {
  return callout({ tone: 'blue', icon: 'bluetooth', text: t('On iPhone and iPad, Bluetooth needs the free Bluefy browser.') },
    h('div.row.cm-note-actions',
      button({ label: t('Open in Bluefy'), icon: 'bluetooth', variant: 'tonal', size: 'sm', onClick: () => openInBluefy() }),
      button({ label: t('Get Bluefy'), icon: 'external', variant: 'ghost', size: 'sm', onClick: () => { location.href = BLUEFY_STORE_URL; } })));
}

/** A browser flag's address with a button that copies it (pages can't open the flags page). */
function flagRow(address) {
  const copy = button({
    label: t('Copy'), icon: 'copy', size: 'sm', variant: 'tonal',
    onClick: async () => {
      try { await navigator.clipboard.writeText(address); toast(t('Copied. Paste it into the address bar.'), { tone: 'green' }); }
      catch { toast(t('Couldn’t copy. Select the text and copy it yourself.'), { tone: 'red' }); }
    },
  });
  return h('div.cm-flag-row', h('code.cm-flag', address), copy);
}

/**
 * Bluetooth that's switched off in the browser: one small line, with the steps and flag addresses
 * behind "How to turn it on" (USB still works, so it shouldn't crowd the popup).
 */
function bluetoothOffCard(title, text, addresses) {
  return h('details.cm-bt-off',
    h('summary', icon('bluetooth'), h('span.cm-bt-off-title', title),
      h('span.cm-bt-off-more', t('How to turn it on')), icon('chevron-down', 'cm-bt-off-chev')),
    h('div.cm-bt-off-body', h('p', text), addresses.map(flagRow)));
}

function braveNote() {
  // On Linux, Brave also needs Chromium's experimental features flag (linuxBluetoothNote)
  if (isLinux()) return linuxBluetoothNote({ scheme: 'brave', name: 'Brave' });
  return bluetoothOffCard(t('Bluetooth is off in Brave.'),
    t('To turn it on, open this address, set Web Bluetooth API to Enabled, then relaunch Brave.'),
    ['brave://flags/#brave-web-bluetooth-api']);
}

/**
 * Chrome, Chromium, Edge, Opera and Brave on Linux keep Web Bluetooth for websites behind the
 * experimental web platform features flag (navigator.bluetooth is missing until it's on). Brave also
 * has its own switch. `b` is chromiumBrowser()'s answer.
 */
function linuxBluetoothNote({ scheme, name }) {
  const browser = name || t('your browser');
  return bluetoothOffCard(t('Bluetooth is turned off in this browser on Linux.'),
    fillNodes(scheme === 'brave'
      ? t('On Linux, {browser} needs two settings for Bluetooth. Open each address below, set it to Enabled, then relaunch {browser}.')
      : t('On Linux, {browser} keeps Bluetooth behind a setting. Open this address, set it to Enabled, then relaunch {browser}.'), { browser }),
    [...(scheme === 'brave' ? ['brave://flags/#brave-web-bluetooth-api'] : []), `${scheme}://flags/#enable-experimental-web-platform-features`]);
}

/**
 * Which Chromium-based browser this is: { scheme, name }, where scheme is the address scheme of its
 * flags page (brave://, edge://, opera://, chrome://) and name what to call it (null when unsure, e.g.
 * Vivaldi, which reports itself as Chrome; chrome://flags works there too). Null for other browsers
 * (Firefox, Safari). Brave is told by navigator.brave, the others by their user-agent brands.
 */
function chromiumBrowser(brave) {
  if (brave) return { scheme: 'brave', name: 'Brave' };
  const ua = navigator.userAgent || '';
  const brands = (navigator.userAgentData?.brands || []).map((b) => b.brand);
  const has = (re) => brands.some((b) => re.test(b));
  if (has(/Edge/) || /Edg\//.test(ua)) return { scheme: 'edge', name: 'Edge' };
  if (has(/^Opera/) || /OPR\//.test(ua)) return { scheme: 'opera', name: 'Opera' };
  if (has(/Google Chrome/)) return { scheme: 'chrome', name: 'Chrome' };
  if (has(/Chromium/) || /Chrome\//.test(ua)) return { scheme: 'chrome', name: has(/Chromium/) && brands.filter((b) => !/Not.?A.?Brand/i.test(b)).length === 1 ? 'Chromium' : null };
  return null;
}

/** The tip for a browser that can remember Bluetooth controllers behind a flag: the steps, the flag's
 *  address and a button that copies it. */
function flagTip(browser, address) {
  return h('div.cm-tip',
    h('p.small.muted', fillNodes(t('Tip: {browser} can remember Bluetooth controllers, so they connect by themselves next time. Copy this address, paste it into the address bar, set it to Enabled, then relaunch {browser}.'), { browser })),
    flagRow(address));
}

/**
 * Open the Connect popup.
 * @param {{cable?: boolean}} [o] cable: USB only (the flow needs the cable).
 * @returns {Promise<{usb: USBDevice}|{link: BleLink}|null>}
 */
export function openConnectModule({ cable = false } = {}) {
  return new Promise((resolve) => {
    const withBluetooth = !cable;
    const ios = isIOS();
    const canBluetooth = withBluetooth && !!navigator.bluetooth; // the browser offers it (it may still fail: Brave)
    // The browser lists controllers allowed before (getDevices), so they can be found by themselves. Chrome
    // and Edge only do this with a flag; without it every Bluetooth connect goes through the chooser.
    const remembers = canBluetooth && !!navigator.bluetooth.getDevices;
    let settled = false;
    let step = 'list';    // 'list' | 'busy' | 'code'
    let usbDevices = [];
    /** @type {{bt: BluetoothDevice, seenAt: number, watching: boolean}[]} */
    let remembered = [];
    let brave = false;
    let btNote = null;    // why Bluetooth can't be used here (a callout), or null
    let btTip = null;     // how Chrome / Edge could remember controllers (a line), or null
    let problem = null;   // what went wrong last (text), shown above the list
    let searchTimer = 0;
    let searchNext = 0;
    let attemptSeq = 0;   // bumps when an attempt is abandoned: its late results are ignored
    let pending = null;   // a BleLink being opened
    let link = null;      // the BleLink past open(): letting this browser in
    let code = '';
    let codeNote = '';    // shown with the next code (after a wrong press)
    const watching = new AbortController();
    const known = loadKnown();
    const knownBt = (bt) => known[`ble:${bt.id}`] || null;
    const btTitle = (bt) => cardTitle(knownBt(bt), bt.name || t('Bluetooth controller'));

    const dlg = openDialog({ title: t('Connect a controller'), icon: 'gamepad', tone: 'blue', onClose: () => finish(null) });

    function finish(result) {
      if (settled) return;
      settled = true;
      stopSearch();
      watching.abort();
      for (const e of remembered) e.bt.removeEventListener('advertisementreceived', onAdvertisement);
      navigator.usb?.removeEventListener('connect', refreshUsb);
      navigator.usb?.removeEventListener('disconnect', refreshUsb);
      pending?.close();
      if (!result?.link) link?.close();
      dlg.close();
      resolve(result);
    }

    // ---- The list ---------------------------------------------------------------------------------
    const listEl = h('div.cm-list', { role: 'list' });
    const notesEl = h('div.cm-notes');
    const tipEl = h('div.cm-notes');

    const seenNow = (e) => e.seenAt > 0 && performance.now() - e.seenAt < SEEN_MS;

    function item({ kind, name, status, live, onClick }) {
      return h('button.cm-item', { type: 'button', role: 'listitem', class: live ? 'live' : null, onclick: onClick },
        h('span.cm-kind', icon(kind)),
        h('span.cm-text', h('span.cm-name', name),
          h('span.cm-sub', h('span.cm-tag', kind === 'usb' ? 'USB' : t('Bluetooth')), ' · ', status)),
        icon('chevron-right'));
    }

    // Rows by device, kept while they look the same: the list redraws every few seconds while it
    // searches, and new elements would make every icon blink.
    const rowCache = new Map(); // USBDevice or BluetoothDevice -> { sig, el }
    const row = (key, sig, make) => {
      const kept = rowCache.get(key);
      if (kept?.sig === sig) return kept.el;
      const el = make();
      rowCache.set(key, { sig, el });
      return el;
    };
    let emptyEl = null;
    let searchEl = null;

    function renderList() {
      if (step !== 'list') return;
      const rows = [
        ...usbDevices.map((usb) => {
          const name = cardTitle(usb.serialNumber && known[`usb:${usb.serialNumber}`], usb.productName || t('USB device'));
          return row(usb, name, () => item({ kind: 'usb', live: true, status: t('Plugged in now'), name, onClick: () => finish({ usb }) }));
        }),
        ...remembered.map((e) => {
          const info = knownBt(e.bt);
          const seen = seenNow(e);
          return row(e.bt, [btTitle(e.bt), seen, info?.start, info?.select].join('|'), () => {
            // Its own buttons where it connected before
            const buttons = info?.start && info?.select ? chordGlyphs(info.start, info.select, 18) : h('strong', chordText(null));
            return item({ kind: 'bluetooth', name: btTitle(e.bt), live: seen,
              status: seen ? t('Visible now') : fillNodes(t('Press {buttons} on it to connect'), { buttons }),
              onClick: () => { cancelAttempt(); reach(e.bt, { manual: true }); } });
          });
        }),
      ];
      const next = rows.length ? rows
        : [emptyEl ||= h('p.cm-empty', ios ? t('No controllers here yet. Add one below.') : t('No controllers here yet. Plug one in, or add one below.'))];
      if (searchTimer) next.push(searchEl ||= h('p.cm-search', h('span.spinner.motion-ok'), t('Looking for your Bluetooth controllers…')));
      // Touch the DOM only when the rows themselves changed
      const now = [...listEl.children];
      if (now.length !== next.length || now.some((el, i) => el !== next[i])) listEl.replaceChildren(...next);
    }

    function renderNotes() {
      if (step !== 'list') return;
      notesEl.replaceChildren(...[
        problem && callout({ tone: 'red', text: problem }),
        !navigator.usb && !ios && callout({ tone: 'yellow', text: t(NO_USB) }),
        btNote,
      ].filter(Boolean));
      tipEl.replaceChildren(...(btTip ? [btTip] : []));
    }

    function showList() {
      step = 'list';
      dlg.setTitle(t('Connect a controller'));
      dlg.setBody(
        h('div.cm-ways',
          // No iPhone or iPad browser has WebUSB: say where USB works instead of offering it
          h('div.cm-way', h('span.cm-way-art', icon('usb')), h('p', ios
            ? t('USB setup needs a computer with Chrome or Edge.')
            : t('Plug the controller in with a USB data cable.'))),
          canBluetooth && h('div.cm-way', h('span.cm-way-art', chordGlyphs('Plus', 'Minus', 28)),
            h('p', fillNodes(remembers
              ? t('Or, with it on and running wirelessly, press {buttons} together to connect over Bluetooth.')
              : ios ? t('With the controller on and running wirelessly, press {buttons} together, then choose it with Connect over Bluetooth.')
              : t('Or, for Bluetooth: with it on and running wirelessly, press {buttons} together, then choose it with Connect over Bluetooth.'),
            { buttons: h('strong', chordText(null)) })))),
        notesEl,
        // Nothing can connect in this browser (iPhone / iPad without Bluefy): no list to fill
        (navigator.usb || canBluetooth) && h('div.cm-list-head', t('Controllers')),
        (navigator.usb || canBluetooth) && listEl,
        canBluetooth && h('p.small.muted', t('The first time over Bluetooth, you enter a short button code on the controller. After that, this browser connects without it.')),
        tipEl);
      dlg.setActions([
        navigator.usb && { label: t('Add USB controller…'), icon: 'usb', variant: 'tonal', onClick: () => { addUsb(); return false; } },
        canBluetooth && { label: remembers ? t('Add Bluetooth controller…') : t('Connect over Bluetooth…'), icon: 'bluetooth', variant: 'tonal', onClick: () => { addBluetooth(); return false; } },
      ].filter(Boolean));
      renderNotes();
      startSearch();
      renderList();
    }

    function showBusy(text, hint) {
      step = 'busy';
      stopSearch();
      dlg.setBody(h('div.bt-busy', h('span.spinner.motion-ok'), h('span', text)), hint && h('p.small.muted', hint));
      dlg.setActions([{ label: t('Back'), icon: 'back', variant: 'ghost', onClick: () => { backToList(); return false; } }]);
    }

    function backToList(why = null) {
      cancelAttempt();
      problem = why;
      showList();
    }

    // ---- USB --------------------------------------------------------------------------------------
    async function refreshUsb() {
      if (!navigator.usb || settled) return;
      const devices = await navigator.usb.getDevices().catch(() => []);
      usbDevices = devices.filter(isListedUsb);
      renderList();
    }

    async function addUsb() {
      cancelAttempt();
      let usb;
      try {
        usb = await requestUsbController(); // first thing in the click: the browser requires it
      } catch (err) {
        console.warn(`[connect] USB chooser failed: ${err?.name}: ${err?.message}`);
        if (!settled) { problem = t('Couldn’t connect. Unplug the controller, hold A or B while plugging it back in, then try again.'); renderNotes(); }
        return;
      }
      if (usb && !settled) finish({ usb });
    }

    // ---- Bluetooth --------------------------------------------------------------------------------
    async function addBluetooth() {
      cancelAttempt();
      let bt;
      try {
        bt = await requestBluetoothController(); // first thing in the click: the browser requires it
      } catch (err) {
        console.warn(`[connect] Bluetooth chooser failed: ${err?.name}: ${err?.message}`);
        if (settled) return;
        problem = null;
        // Brave can offer the API and still refuse it while its flag is off
        if (brave) btNote = braveNote();
        else if (err?.name === 'NotFoundError') problem = t(BT_OFF);
        else if (err?.name === 'SecurityError' || err?.name === 'NotAllowedError') problem = t('This browser didn’t allow Bluetooth here.');
        else problem = t(CONNECT_FAILED, { buttons: chordText(null) });
        renderNotes();
        return;
      }
      if (bt && !settled) reach(bt, { manual: true });
    }

    /** Drop the Bluetooth attempt in progress, if any (cleared first: closing fires 'gone'). */
    function cancelAttempt() {
      attemptSeq++;
      const open = [pending, link];
      pending = null;
      link = null;
      open.forEach((l) => l?.close());
    }

    /**
     * Connect to `bt`, then let this browser in (its token, else the code). manual: the user picked it, so
     * progress and a failure show; from the search only a success does. tryFor: how long to try reaching it.
     */
    async function reach(bt, { manual = false, tryFor } = {}) {
      if (settled || pending || link) return;
      const seq = attemptSeq;
      const attempt = new BleLink(bt);
      const name = cardTitle(knownBt(bt), bt.name || t('your controller'));
      const buttons = chordText(knownBt(bt));
      pending = attempt;
      if (manual) showBusy(t('Connecting to {name}…', { name }), t('If it doesn’t connect, press {buttons} on the controller.', { buttons }));
      try {
        await attempt.open(tryFor ? { connectTimeout: tryFor } : undefined);
      } catch (err) {
        if (pending === attempt) pending = null;
        console.warn(`[connect] Bluetooth connect failed${manual ? '' : ' (looking for it)'}: ${err?.name}: ${err?.message}`);
        if (manual && seq === attemptSeq && !settled) backToList(t(CONNECT_FAILED, { buttons }));
        return;
      }
      if (pending === attempt) pending = null;
      if (seq !== attemptSeq || settled) { attempt.close(); return; }

      link = attempt;
      const entry = remembered.find((e) => e.bt === bt);
      if (entry) entry.seenAt = performance.now();
      attempt.addEventListener('code', (e) => { code = e.detail.letters; showCode(0, codeNote); codeNote = ''; });
      attempt.addEventListener('code-state', (e) => onCodeState(e.detail));
      attempt.addEventListener('paired', () => { if (link === attempt) finish({ link: attempt }); });
      attempt.addEventListener('gone', () => {
        if (link === attempt && !settled) backToList(t('The controller disconnected. Press {buttons} on it again, then choose it.', { buttons }));
      });
      showBusy(t('Connecting to {name}…', { name }));
      try {
        if (await attempt.authorize()) { if (link === attempt) finish({ link: attempt }); return; }
        if (link !== attempt || settled) return;
        showBusy(t('Asking the controller for a code…'));
        await attempt.requestCode();
      } catch (err) {
        console.warn(`[connect] Bluetooth sign-in failed: ${err?.name}: ${err?.message}`);
        if (link === attempt && !settled) backToList(t(CONNECT_FAILED, { buttons }));
      }
    }

    function onAdvertisement(event) {
      const entry = remembered.find((e) => e.bt === event.target || e.bt.id === event.device?.id);
      if (!entry || settled) return;
      entry.seenAt = performance.now();
      renderList();
      if (step === 'list') reach(entry.bt, { tryFor: SEARCH_TRY_MS * 2 });
    }

    /** Watch a remembered controller's advertisements, where the browser can (it may refuse). */
    async function watch(entry) {
      if (!entry.bt.watchAdvertisements) return;
      entry.bt.addEventListener('advertisementreceived', onAdvertisement);
      try {
        await entry.bt.watchAdvertisements({ signal: watching.signal });
        entry.watching = true;
      } catch {
        entry.bt.removeEventListener('advertisementreceived', onAdvertisement);
      }
    }

    function startSearch() {
      if (!withBluetooth || !remembered.length || searchTimer || settled) return;
      searchTimer = setInterval(() => {
        if (step !== 'list' || pending || link) return;
        // Controllers whose advertisements can't be watched: just try to connect, one at a time
        const blind = remembered.filter((e) => !e.watching);
        if (blind.length) reach(blind[searchNext++ % blind.length].bt, { tryFor: SEARCH_TRY_MS });
        renderList(); // "Visible now" fades after a while
      }, SEARCH_EVERY_MS);
    }

    function stopSearch() {
      clearInterval(searchTimer);
      searchTimer = 0;
    }

    // ---- The code ---------------------------------------------------------------------------------
    const status = h('p.bt-code-status', { 'aria-live': 'polite' });

    function showCode(entered, note = '') {
      if (settled || !link) return;
      step = 'code';
      stopSearch();
      dlg.setTitle(t('Allow this browser'));
      status.textContent = note || t('{count} of {total} pressed', { count: entered, total: code.length });
      dlg.setBody(
        h('p', t('Press these buttons on the controller, in this order. This is needed once per browser.')),
        codeRow(code, entered),
        status);
      dlg.setActions([{ label: t('Back'), icon: 'back', variant: 'ghost', onClick: () => { backToList(); return false; } }]);
    }

    function onCodeState({ entered, state }) {
      if (settled || !code || step !== 'code') return;
      if (state === 'entering') showCode(entered);
      // A new code follows straight away and replaces this one ('code' event)
      else if (state === 'wrong') codeNote = t('Wrong button. Here’s a new code: start again.');
      else if (state === 'timeout') {
        showCode(entered, t('Time ran out. Get a new code to try again.'));
        dlg.setActions([
          { label: t('Back'), icon: 'back', variant: 'ghost', onClick: () => { backToList(); return false; } },
          { label: t('New code'), icon: 'refresh', variant: 'primary', onClick: () => { newCode(); return false; } },
        ]);
      }
    }

    async function newCode() {
      const current = link;
      showBusy(t('Asking the controller for a code…'));
      try {
        await current.requestCode();
      } catch (err) {
        console.warn(`[connect] no code: ${err?.name}: ${err?.message}`);
        // A dropped link already went back to the list ('gone')
        if (link === current && !settled) backToList(t(CONNECT_FAILED, { buttons: chordText(null) }));
      }
    }

    // ---- Start ------------------------------------------------------------------------------------
    showList();
    if (navigator.usb) {
      navigator.usb.addEventListener('connect', refreshUsb);
      navigator.usb.addEventListener('disconnect', refreshUsb);
      refreshUsb();
    }
    if (withBluetooth) {
      (async () => {
        brave = await isBraveBrowser();
        if (!navigator.bluetooth) {
          const linuxBrowser = isLinux() ? chromiumBrowser(brave) : null;
          btNote = linuxBrowser ? linuxBluetoothNote(linuxBrowser) : brave ? braveNote() : ios ? bluefyNote()
            : callout({ tone: 'blue', text: t('Bluetooth isn’t supported in this browser. Use Chrome or Edge to connect over Bluetooth.') });
        } else if ((await navigator.bluetooth.getAvailability?.().catch(() => true)) === false) {
          btNote = callout({ tone: 'yellow', text: t(BT_OFF) });
        }
        // A tip, not a warning: Chrome and Edge can remember controllers between visits behind a flag
        const browser = chromiumBrowser(brave);
        if (canBluetooth && !remembers && !brave && browser) {
          // Pages can't open the browser's own flags page: the address is copied for the owner to paste
          btTip = flagTip(browser.name || t('your browser'), `${browser.scheme}://flags/#enable-web-bluetooth-new-permissions-backend`);
        }
        const found = await rememberedBluetoothControllers();
        if (settled) return;
        remembered = found.map((bt) => ({ bt, seenAt: 0, watching: false }));
        remembered.forEach(watch);
        renderNotes();
        startSearch();
        renderList();
      })();
    }
  });
}
