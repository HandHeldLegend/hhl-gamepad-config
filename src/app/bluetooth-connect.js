/**
 * bluetooth-connect.js ("Connect over Bluetooth" dialog): the steps before a Bluetooth session.
 *
 *   1. With the controller on and running wirelessly, Plus and Minus pressed together make it visible for
 *      10 seconds (HOJA-LIB-RP2040 hal/rp2040/ble_config.c). The dialog shows that; its button opens the
 *      browser's chooser, which only opens from a click.
 *   2. The app connects and shows the controller this browser's token from an earlier visit (ble-link.js).
 *   3. Without one, or one the controller forgot, the controller makes a code: six presses, three face
 *      buttons (as printed) and three d-pad directions, entered on the controller in order. A wrong press
 *      brings a new code; after 30 seconds it times out and a new one can be asked for. Once per browser.
 *   4. Then the dialog closes and the session reads the settings as over USB (session.connectBluetooth).
 *
 * chooseBluetoothController() resolves the allowed BleLink, or null when the user gave up.
 */
import { h, fillNodes, loadStyles } from '../ui/dom.js';
import { openDialog } from '../ui/overlay.js';
import { callout } from '../ui/controls.js';
import { glyph, outputName } from '../sections/input/parts.js';
import { BleLink, requestBluetoothController } from '../device/ble-link.js';
import { t, N_ } from '../i18n/index.js';

// Button glyphs (styles live with the Input section).
loadStyles(new URL('../sections/input/input.css', import.meta.url));

/** Code letters for the d-pad, as glyph labels; face buttons are drawn as their letter. */
const DPAD = { U: 'D Up', D: 'D Down', L: 'D Left', R: 'D Right' };

/** Web Bluetooth is there (Chromium on desktop and Android). */
export const canBluetooth = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

/** Plus + Minus, the way the connect guide draws a button combo. */
function beaconCombo() {
  const label = `${outputName('Plus')} + ${outputName('Minus')}`;
  return h('span.guide-combo.bt-combo', { title: label, role: 'img', 'aria-label': label },
    glyph('Plus', { size: 56 }), h('span.guide-plus', { 'aria-hidden': 'true' }, '+'), glyph('Minus', { size: 56 }));
}

/** The six presses as big glyphs; `entered` of them are done and the next one is marked. */
function codeRow(letters, entered) {
  const names = [...letters].map((c) => (DPAD[c] ? outputName(DPAD[c]) : c));
  return h('div.bt-code', { role: 'img', 'aria-label': names.join(', ') },
    [...letters].map((c, i) => h('span.bt-code-cell', { class: i < entered ? 'done' : i === entered ? 'next' : null },
      glyph(DPAD[c] || c, { size: 56 }))));
}

const BT_OFF = N_('Bluetooth is off or missing on this device. Turn it on, then try again.');
const CONNECT_FAILED = N_('Couldn’t connect over Bluetooth. Press + and − on the controller again, then choose it.');

/** Why the browser's chooser didn't open (closing it is no failure). */
function chooserFailure(err) {
  if (err?.name === 'NotFoundError') return t(BT_OFF);
  if (err?.name === 'SecurityError' || err?.name === 'NotAllowedError') return t('This browser didn’t allow Bluetooth here.');
  return t(CONNECT_FAILED);
}

/**
 * Walk the user through connecting over Bluetooth. Resolves an open BleLink this browser is allowed on,
 * or null (closed, or cancelled).
 */
export function chooseBluetoothController() {
  return new Promise((resolve) => {
    let link = null;
    let settled = false;
    let code = '';
    let codeNote = ''; // shown with the next code (after a wrong press)
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (!result) link?.close();
      dlg.close();
      resolve(result);
    };

    const dlg = openDialog({ title: t('Connect over Bluetooth'), icon: 'bluetooth', tone: 'blue', onClose: () => finish(null) });

    // ---- 1. Make it visible, then choose it -----------------------------------------------------
    function showBeacon(problem) {
      dlg.setTitle(t('Connect over Bluetooth'));
      dlg.setBody(
        h('div.bt-step',
          beaconCombo(),
          h('p', fillNodes(t('With the controller on and running wirelessly, press {buttons} together. It can be found for 10 seconds.'),
            { buttons: h('strong', `${outputName('Plus')} + ${outputName('Minus')}`) })),
          h('p.small.muted', t('Then choose it in the list your browser shows. The first time in this browser, you also enter a short button code on the controller.'))),
        problem && callout({ tone: 'red', text: problem }));
      dlg.setActions([
        { label: t('Cancel'), variant: 'ghost', value: null },
        // The chooser must open in this click: choose() calls it before its first await
        { label: t('Choose controller'), icon: 'bluetooth', variant: 'primary', onClick: () => { choose(); return false; } },
      ]);
    }

    function showBusy(text) {
      dlg.setBody(h('div.bt-busy', h('span.spinner.motion-ok'), h('span', text)));
      dlg.setActions([{ label: t('Cancel'), variant: 'ghost', value: null }]);
    }

    async function choose() {
      let bt;
      try {
        bt = await requestBluetoothController();
      } catch (err) {
        console.warn('[bluetooth] chooser failed', err);
        if (!settled) showBeacon(chooserFailure(err));
        return;
      }
      if (!bt || settled) return; // chooser closed: stay on this step

      const attempt = new BleLink(bt);
      let lost = false; // the link dropped: say that rather than the step that then failed
      link = attempt;
      showBusy(t('Connecting to {name}…', { name: bt.name || t('your controller') }));
      try {
        await attempt.open();
        if (settled) return;
        attempt.addEventListener('code', (e) => { code = e.detail.letters; showCode(0, codeNote); codeNote = ''; });
        attempt.addEventListener('code-state', (e) => onCodeState(e.detail));
        attempt.addEventListener('paired', () => finish(attempt));
        attempt.addEventListener('gone', () => {
          if (link !== attempt || settled) return;
          lost = true;
          showBeacon(t('The controller disconnected. Press + and − on it again, then choose it.'));
        });
        if (await attempt.authorize()) { finish(attempt); return; }
        if (settled) return;
        showBusy(t('Asking the controller for a code…'));
        await attempt.requestCode();
      } catch (err) {
        console.warn('[bluetooth] connect failed', err);
        if (link === attempt) link = null;
        attempt.close();
        if (!settled && !lost) showBeacon(t(CONNECT_FAILED));
      }
    }

    // ---- 2. A new browser: the code ---------------------------------------------------------------
    const status = h('p.bt-code-status', { 'aria-live': 'polite' });

    function showCode(entered, note = '') {
      if (settled) return;
      dlg.setTitle(t('Allow this browser'));
      status.textContent = note || t('{count} of {total} pressed', { count: entered, total: code.length });
      dlg.setBody(
        h('p', t('Press these buttons on the controller, in this order. This is needed once per browser.')),
        codeRow(code, entered),
        status);
      dlg.setActions([{ label: t('Cancel'), variant: 'ghost', value: null }]);
    }

    function onCodeState({ entered, state }) {
      if (settled || !code) return;
      if (state === 'entering') showCode(entered);
      // A new code follows straight away and replaces this one ('code' event)
      else if (state === 'wrong') codeNote = t('Wrong button. Here’s a new code: start again.');
      else if (state === 'timeout') {
        showCode(entered, t('Time ran out. Get a new code to try again.'));
        dlg.setActions([
          { label: t('Cancel'), variant: 'ghost', value: null },
          { label: t('New code'), icon: 'refresh', variant: 'primary', onClick: () => { newCode(); return false; } },
        ]);
      }
    }

    async function newCode() {
      showBusy(t('Asking the controller for a code…'));
      try {
        await link.requestCode();
      } catch (err) {
        console.warn('[bluetooth] no code', err);
        // A dropped link already said so ('gone'); otherwise let go of it and start over
        const failed = link;
        if (!failed?.isOpen) return;
        link = null;
        failed.close();
        if (!settled) showBeacon(t(CONNECT_FAILED));
      }
    }

    showBeacon();
    // Say so up front when the computer's Bluetooth is off (not every browser can tell)
    navigator.bluetooth.getAvailability?.().then((on) => {
      if (!on && !settled && !link) showBeacon(t(BT_OFF));
    }).catch(() => {});
  });
}
