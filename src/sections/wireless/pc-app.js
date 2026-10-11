/**
 * pc-app.js: The HHL Gamepad WLAN part of the Home WLAN card: what the Windows app is for (play over
 * the home network with no dongle, and configure the controller here without a cable), and whether
 * this page can reach it.
 *
 * Chromium browsers ask before a page may talk to apps on this PC (Local Network Access). Connect never
 * triggers that prompt, so this is where it is explained first, and "Allow" makes the first request:
 *   not Windows   HHL Gamepad WLAN is a Windows app: a download link only, no permission query
 *   'prompt'      what the browser is about to ask and why, and an Allow button
 *   'denied'      where to turn it on (site settings), and Try again (a browser that can still ask, asks)
 *   'granted'     whether HHL Gamepad WLAN is running, with how many gamepads, or where to get it
 * The button is always there until it works: browsers report this permission inconsistently, so the
 * request itself is the real test. If it reached HHL Gamepad WLAN, the page shows it running.
 * The permission's change event repaints it (e.g. allowed or blocked from the site settings).
 */
import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button, asyncButton } from '../../ui/controls.js';
import { isWindows } from '../../app/platform.js';
import { listLanPads, lanPermission, LAN_APP_URL } from '../../device/lan-transport.js';
import { t, plural } from '../../i18n/index.js';

/** How long the running check waits for HHL Gamepad WLAN. */
const CHECK_MS = 1500;

const downloadLink = () => h('a', { href: LAN_APP_URL, target: '_blank', rel: 'noopener noreferrer' },
  t('Download HHL Gamepad WLAN'), ' ', icon('external'));

export function pcAppSection() {
  const body = h('div.wl-pc-body');
  const el = h('div.wl-pc',
    h('div.field-label', t('HHL Gamepad WLAN for Windows')),
    h('div.field-desc', t('Play on your PC over this network, no dongle needed: games and Steam see the controller as if it were plugged in. While the app runs, this page can also configure the controller without a cable.')),
    body);
  const show = (...nodes) => body.replaceChildren(...nodes.filter(Boolean));
  const text = (s) => h('p.small.muted', s);

  if (!isWindows()) {
    show(text(t('HHL Gamepad WLAN is available for Windows.')), downloadLink());
    return el;
  }

  let watched = null; // the PermissionStatus whose change event repaints this
  const onChange = () => { if (el.isConnected) refresh(); else watched?.removeEventListener('change', onChange); };

  async function running() {
    const pads = await listLanPads({ timeout: CHECK_MS }).catch(() => null);
    const again = asyncButton({ label: t('Check again'), icon: 'refresh', variant: 'ghost', size: 'sm', run: refresh });
    if (!pads) {
      show(text(t('HHL Gamepad WLAN isn’t running. Start it, or download it for Windows.')), h('div.wl-actions', downloadLink(), again));
      return;
    }
    show(text(pads.length
      ? plural(pads.length, 'HHL Gamepad WLAN is running on this PC with {n} gamepad open.', 'HHL Gamepad WLAN is running on this PC with {n} gamepads open.')
      : t('HHL Gamepad WLAN is running on this PC. No gamepads are open in it yet.')), h('div.wl-actions', again));
  }

  // This request is what makes the browser ask. Reaching HHL Gamepad WLAN settles it; otherwise show
  // whatever the browser now reports, as blocked once it has been tried.
  let tried = false;
  async function ask() {
    const pads = await listLanPads().catch(() => null);
    tried = true;
    refresh();
    return pads;
  }

  async function refresh() {
    const { state, status } = await lanPermission();
    if (status && status !== watched) {
      watched?.removeEventListener('change', onChange);
      watched = status;
      watched.addEventListener('change', onChange);
    }
    if (state === 'granted') return running();
    if (state === 'denied' || tried) {
      show(
        // Brave names this setting differently and asks through it instead of Local network access.
        text(navigator.brave
          ? t('This page can’t reach apps on this PC yet. If your browser asks, choose Allow. If it doesn’t, open the site settings (the icon next to the address) and allow Localhost access, then try again. HHL Gamepad WLAN must be running too.')
          : t('This page can’t reach apps on this PC yet. If your browser asks, choose Allow. If it doesn’t, open the site settings (the icon next to the address) and allow Local network access, then try again. HHL Gamepad WLAN must be running too.')),
        h('div.wl-actions', asyncButton({ label: t('Try again'), icon: 'refresh', variant: 'tonal', size: 'sm', run: ask }), downloadLink()));
      return;
    }
    show(
      text(t('To find HHL Gamepad WLAN, this page needs your browser’s permission to reach apps on this PC. The connection stays on your PC; nothing is sent to the internet.')),
      h('div.wl-actions', asyncButton({ label: t('Allow'), icon: 'check', variant: 'tonal', size: 'sm', run: ask })));
  }

  show(text(t('Checking…')));
  refresh();
  return el;
}
