/**
 * connect-module.js (the Connect popup): one place to connect a controller, over USB or Bluetooth. Every
 * Connect button opens it (shell.js connectController), so the browser's own choosers never appear unasked
 * and it is always clear which controllers are on a cable and which are wireless.
 *
 * What it shows
 *   - How a controller turns up: plugged in with a USB data cable, or (on and running wirelessly) with Plus
 *     and Minus pressed together, which makes it visible over Bluetooth for 10 seconds (ble_config.c).
 *   - A live list, each entry marked USB or Bluetooth:
 *       USB        controllers this site may already use that are plugged in (navigator.usb.getDevices,
 *                  kept current on connect / disconnect). A click connects, with no browser chooser.
 *       Bluetooth  controllers this site was allowed on before, where the browser can list them
 *                  (navigator.bluetooth.getDevices). While the popup is open the app looks for them: it
 *                  watches their advertisements where it can (watchAdvertisements), otherwise it keeps
 *                  trying to connect, so after Plus + Minus the controller connects by itself. A click
 *                  tries that one now.
 *   - "Add USB controller…" / "Add Bluetooth controller…" for one this site hasn't used yet: the browser's
 *     chooser, only ever from these buttons (it needs the click).
 *   - Why Bluetooth can't be used, where it can't: Brave (off until enabled in brave://flags), browsers
 *     without Web Bluetooth (Firefox, Safari), Bluetooth off on the computer.
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
import { openDialog } from '../ui/overlay.js';
import { callout } from '../ui/controls.js';
import { glyph, outputName } from '../sections/input/parts.js';
import { isListedUsb, requestUsbController } from '../device/hoja-device.js';
import { BleLink, requestBluetoothController, rememberedBluetoothControllers } from '../device/ble-link.js';
import { t, N_ } from '../i18n/index.js';

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
const CONNECT_FAILED = N_('Couldn’t connect over Bluetooth. Press + and − on the controller again, then choose it.');
const NO_USB = N_('This browser can’t talk to USB devices. Use Chrome or Edge on desktop or Android.');

/** Brave ships Web Bluetooth switched off (navigator.brave exists only there). */
async function isBraveBrowser() {
  try { return !!(await navigator.brave?.isBrave?.()); } catch { return false; }
}

/** Plus + Minus, the way the connect guide draws a button combo. */
function beaconCombo(size) {
  const label = `${outputName('Plus')} + ${outputName('Minus')}`;
  return h('span.guide-combo', { title: label, role: 'img', 'aria-label': label },
    glyph('Plus', { size }), h('span.guide-plus', { 'aria-hidden': 'true' }, '+'), glyph('Minus', { size }));
}

/** The six presses as big glyphs; `entered` of them are done and the next one is marked. */
function codeRow(letters, entered) {
  const names = [...letters].map((c) => (DPAD[c] ? outputName(DPAD[c]) : c));
  return h('div.bt-code', { role: 'img', 'aria-label': names.join(', ') },
    [...letters].map((c, i) => h('span.bt-code-cell', { class: i < entered ? 'done' : i === entered ? 'next' : null },
      glyph(DPAD[c] || c, { size: 56 }))));
}

function braveNote() {
  return callout({ tone: 'yellow', title: t('Bluetooth is off in Brave.'),
    text: fillNodes(t('To turn it on, open {flag}, set Web Bluetooth API to Enabled, then relaunch Brave.'),
      { flag: h('code.cm-flag', 'brave://flags/#brave-web-bluetooth-api') }) });
}

/**
 * Open the Connect popup.
 * @param {{cable?: boolean}} [o] cable: USB only (the flow needs the cable).
 * @returns {Promise<{usb: USBDevice}|{link: BleLink}|null>}
 */
export function openConnectModule({ cable = false } = {}) {
  return new Promise((resolve) => {
    const withBluetooth = !cable;
    const canBluetooth = withBluetooth && !!navigator.bluetooth; // the browser offers it (it may still fail: Brave)
    let settled = false;
    let step = 'list';    // 'list' | 'busy' | 'code'
    let usbDevices = [];
    /** @type {{bt: BluetoothDevice, seenAt: number, watching: boolean}[]} */
    let remembered = [];
    let brave = false;
    let btNote = null;    // why Bluetooth can't be used here (a callout), or null
    let problem = null;   // what went wrong last (text), shown above the list
    let searchTimer = 0;
    let searchNext = 0;
    let attemptSeq = 0;   // bumps when an attempt is abandoned: its late results are ignored
    let pending = null;   // a BleLink being opened
    let link = null;      // the BleLink past open(): letting this browser in
    let code = '';
    let codeNote = '';    // shown with the next code (after a wrong press)
    const watching = new AbortController();

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

    const seenNow = (e) => e.seenAt > 0 && performance.now() - e.seenAt < SEEN_MS;

    function item({ kind, name, status, live, onClick }) {
      return h('button.cm-item', { type: 'button', role: 'listitem', class: live ? 'live' : null, onclick: onClick },
        h('span.cm-kind', icon(kind)),
        h('span.cm-text', h('span.cm-name', name),
          h('span.cm-sub', h('span.cm-tag', kind === 'usb' ? 'USB' : t('Bluetooth')), ' · ', status)),
        icon('chevron-right'));
    }

    function renderList() {
      if (step !== 'list') return;
      const rows = [
        ...usbDevices.map((usb) => item({ kind: 'usb', name: usb.productName || t('USB device'), status: t('Plugged in now'), live: true,
          onClick: () => finish({ usb }) })),
        ...remembered.map((e) => item({ kind: 'bluetooth', name: e.bt.name || t('Bluetooth controller'), live: seenNow(e),
          status: seenNow(e) ? t('Visible now') : t('Press + and − on it to connect'),
          onClick: () => { cancelAttempt(); reach(e.bt, { manual: true }); } })),
      ];
      listEl.replaceChildren(...(rows.length ? rows
        : [h('p.cm-empty', t('No controllers here yet. Plug one in, or add one below.'))]));
      if (searchTimer) listEl.append(h('p.cm-search', h('span.spinner.motion-ok'), t('Looking for your Bluetooth controllers…')));
    }

    function renderNotes() {
      if (step !== 'list') return;
      notesEl.replaceChildren(...[
        problem && callout({ tone: 'red', text: problem }),
        !navigator.usb && callout({ tone: 'yellow', text: t(NO_USB) }),
        btNote,
      ].filter(Boolean));
    }

    function showList() {
      step = 'list';
      dlg.setTitle(t('Connect a controller'));
      dlg.setBody(
        h('div.cm-ways',
          h('div.cm-way', h('span.cm-way-art', icon('usb')), h('p', t('Plug the controller in with a USB data cable.'))),
          canBluetooth && h('div.cm-way', h('span.cm-way-art', beaconCombo(30)),
            h('p', fillNodes(t('Or, with it on and running wirelessly, press {buttons} together to connect over Bluetooth.'),
              { buttons: h('strong', `${outputName('Plus')} + ${outputName('Minus')}`) })))),
        notesEl,
        h('div.cm-list-head', t('Controllers')),
        listEl,
        canBluetooth && h('p.small.muted', t('The first time over Bluetooth, you enter a short button code on the controller, once per browser.')));
      dlg.setActions([
        navigator.usb && { label: t('Add USB controller…'), icon: 'usb', variant: 'tonal', onClick: () => { addUsb(); return false; } },
        canBluetooth && { label: t('Add Bluetooth controller…'), icon: 'bluetooth', variant: 'tonal', onClick: () => { addBluetooth(); return false; } },
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
        console.warn('[connect] USB chooser failed', err);
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
        console.warn('[connect] Bluetooth chooser failed', err);
        if (settled) return;
        problem = null;
        // Brave can offer the API and still refuse it while its flag is off
        if (brave) btNote = braveNote();
        else if (err?.name === 'NotFoundError') problem = t(BT_OFF);
        else if (err?.name === 'SecurityError' || err?.name === 'NotAllowedError') problem = t('This browser didn’t allow Bluetooth here.');
        else problem = t(CONNECT_FAILED);
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
      const name = bt.name || t('your controller');
      pending = attempt;
      if (manual) showBusy(t('Connecting to {name}…', { name }), t('If it doesn’t connect, press + and − on the controller.'));
      try {
        await attempt.open(tryFor ? { connectTimeout: tryFor } : undefined);
      } catch (err) {
        if (pending === attempt) pending = null;
        if (manual && seq === attemptSeq && !settled) { console.warn('[connect] Bluetooth connect failed', err); backToList(t(CONNECT_FAILED)); }
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
        if (link === attempt && !settled) backToList(t('The controller disconnected. Press + and − on it again, then choose it.'));
      });
      showBusy(t('Connecting to {name}…', { name }));
      try {
        if (await attempt.authorize()) { if (link === attempt) finish({ link: attempt }); return; }
        if (link !== attempt || settled) return;
        showBusy(t('Asking the controller for a code…'));
        await attempt.requestCode();
      } catch (err) {
        console.warn('[connect] Bluetooth sign-in failed', err);
        if (link === attempt && !settled) backToList(t(CONNECT_FAILED));
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
        console.warn('[connect] no code', err);
        // A dropped link already went back to the list ('gone')
        if (link === current && !settled) backToList(t(CONNECT_FAILED));
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
          btNote = brave ? braveNote()
            : callout({ tone: 'blue', text: t('Bluetooth isn’t supported in this browser. Use Chrome or Edge to connect over Bluetooth.') });
        } else if ((await navigator.bluetooth.getAvailability?.().catch(() => true)) === false) {
          btNote = callout({ tone: 'yellow', text: t(BT_OFF) });
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
