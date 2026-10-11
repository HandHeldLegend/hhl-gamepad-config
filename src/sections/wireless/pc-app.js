/**
 * pc-app.js: "Use from this PC", part of the Home WLAN card: whether HHL Gamepad WLAN (the Windows app
 * that opens the controller over the home network) can be reached from this page.
 *
 * Chromium browsers ask before a page may talk to apps on this PC (Local Network Access). Connect never
 * triggers that prompt, so this is where it is explained first, and "Allow" makes the first request:
 *   not Windows   HHL Gamepad WLAN is a Windows app: a download link only, no permission query
 *   'prompt'      what the browser is about to ask and why, and an Allow button
 *   'denied'      where to turn it back on (site settings)
 *   'granted'     whether HHL Gamepad WLAN is running, with how many gamepads, or where to get it
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
  const el = h('div.wl-pc', h('div.field-label', t('Use from this PC')), body);
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

  async function refresh() {
    const { state, status } = await lanPermission();
    if (status && status !== watched) {
      watched?.removeEventListener('change', onChange);
      watched = status;
      watched.addEventListener('change', onChange);
    }
    if (state === 'granted') return running();
    if (state === 'denied') {
      show(text(t('This page isn’t allowed to reach apps on this PC. To use HHL Gamepad WLAN, open the site settings (the icon next to the address) and allow Local network access, then reload.')));
      return;
    }
    show(
      text(t('To configure this controller over WLAN, this page connects to HHL Gamepad WLAN, an app on this PC. Your browser will ask to let it access other apps and services on this device. That’s this connection: it stays on your PC, and nothing is sent to the internet.')),
      h('div.wl-actions', button({
        label: t('Allow'), icon: 'check', variant: 'tonal', size: 'sm',
        // This request is what makes the browser ask; then show whatever was decided.
        onClick: async () => { await listLanPads().catch(() => {}); refresh(); },
      })));
  }

  show(text(t('Checking…')));
  refresh();
  return el;
}
