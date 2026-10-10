/**
 * dongle.js: The WLAN dongle card: what the dongle reports about itself (board, firmware, PIN, the
 * host it detected and the mode it presents) and its firmware update.
 *
 * Shown on Home and the Firmware page while only a dongle is connected (session.state 'dongle'),
 * and on the Wireless page while the controller is connected through one (session.caps.viaDongle).
 * The values come from the dongle's 0xD0 reply (decodeDongleInfo in src/device/hoja-device.js).
 */
import { h, loadStyles } from '../../ui/dom.js';
import { card, kv, badge, button, asyncButton, callout } from '../../ui/controls.js';
import { checkDongleUpdate, openDongleUpdateWizard, formatFwVersion } from '../../firmware/updater.js';
import { formatPin } from './info.js';
import { t, N_ } from '../../i18n/index.js';

loadStyles(new URL('./wireless.css', import.meta.url));

/** Dongle boards (0xD0 byte 2). */
const BOARDS = { 1: 'HOJA', 2: 'Pico W', 3: 'Pico 2 W' };
/** Hosts the dongle detects (byte 10). Brand names stay untranslated (GLOSSARY.md). */
const HOSTS = { 1: N_('PC'), 2: 'Switch', 3: 'N64', 4: 'GameCube' };
/** Output modes (bytes 11 and 12); the UI calls the firmware's SInput mode "Steam". */
const MODES = { 0: 'Switch', 1: 'Steam', 2: 'XInput', 3: 'Slippi', 4: 'SNES', 5: 'N64', 6: 'GameCube' };

const name = (table, value) => (table[value] ? t(table[value]) : t('Unknown'));

function rows(d) {
  const pad = d.gamepad;
  return [
    [t('Board'), name(BOARDS, d.board)],
    [t('Firmware build'), formatFwVersion(d.fwVersion)],
    [t('PIN'), h('span.mono', formatPin(d.pin))],
    [t('Plugged into'), name(HOSTS, d.host)],
    [t('Mode'), name(MODES, d.hostMode)],
    pad && [t('Controller'), pad.name || t('Unknown')],
    pad && [t('Controller mode'), `${name(MODES, pad.mode)} · ${pad.modeAtPowerUp ? t('Chosen at power-up') : t('Follows the dongle')}`],
  ];
}

/**
 * @param {object} session
 * @param {{title?: string}} [o] title: defaults to "WLAN dongle"
 */
export function dongleCard(session, { title = t('WLAN dongle') } = {}) {
  const status = h('span', badge(t('Checking…')));
  const details = h('div');
  const latestCell = h('span.muted', t('Checking…'));
  const updateBtn = button({ label: t('Update dongle'), icon: 'download', variant: 'primary', onClick: () => openDongleUpdateWizard() });
  updateBtn.hidden = true;

  const paint = () => {
    const d = session.dongle;
    if (!d) return;
    details.replaceChildren(kv([...rows(d), [t('Latest build'), latestCell]]));
  };

  // Newest firmware for this board. No manifest yet (or offline): nothing to offer.
  const check = async () => {
    const u = await checkDongleUpdate();
    updateBtn.hidden = !u?.available;
    if (!u?.latest) {
      latestCell.textContent = navigator.onLine === false ? t('Offline') : t('Couldn’t check');
      latestCell.classList.add('muted');
      status.replaceChildren(badge(t('Unknown')));
      return;
    }
    latestCell.textContent = formatFwVersion(u.latest);
    latestCell.classList.remove('muted');
    status.replaceChildren(u.available ? badge(t('Update available'), 'blue') : badge(t('Up to date'), 'green'));
  };

  const el = card({
    title, icon: 'link', tone: 'blue', actions: status,
    subtitle: session.dongle?.gamepad ? t('Your controller is connected through this dongle.') : t('No controller is connected to it yet.'),
  },
  details,
  !session.dongle?.gamepad && callout({ tone: 'blue', icon: 'gamepad', text: t('Turn on your controller to set it up through the dongle.') }),
  h('div.wl-actions', updateBtn,
    asyncButton({ label: t('Check again'), icon: 'refresh', variant: 'ghost', size: 'sm', busyLabel: t('Checking…'), okLabel: t('Checked'),
      // A failed re-read keeps the last status; the update check still runs.
      run: async () => { await session.refreshDongle().catch(() => {}); paint(); await check(); return true; } })));

  paint();
  check();
  return el;
}
