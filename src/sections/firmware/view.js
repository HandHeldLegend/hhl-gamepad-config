/**
 * Firmware & backup, in three groups:
 *   This controller   its firmware (update / reinstall, maker, manual), Backup & restore, and Recovery
 *                     (reboot into the bootloader, restart out of it, manual UF2 downloads)
 *   Other hardware    install HOJA on a blank board, the WLAN dongle, the wireless module in update mode
 *
 * The flashing itself lives in src/firmware/ (updater.js state machine + picoboot.js protocol);
 * this page is the friendly front door to it. Deep links: #/firmware?build=<id> preselects a build
 * in the installer. The changelog has its own page (#/whats-new); #/firmware?changes= forwards there.
 */
import { h, replace, fillNodes } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { card, button, asyncButton, callout, kv, badge } from '../../ui/controls.js';
import { confirmDialog, toast } from '../../ui/overlay.js';
import { connectController } from '../../app/shell.js';
import { listBuilds } from '../../firmware/builds.js';
import {
  firmwareStatus, openUpdateWizard, openInstallWizard, checkForFirmwareUpdate, exitBootloader, formatFwVersion, CABLE_UPDATE_TEXT, cableOnlyNote,
  rebootToBootloaderOnly,
} from '../../firmware/updater.js';
import { t, N_ } from '../../i18n/index.js';
import { openModuleUpdaterInUpdateMode } from '../wireless/module-updater.js';
import { dongleCard } from '../wireless/dongle.js';
import { backupCard } from '../backup/card.js';

const STATUS_TEXT = {
  unknown: [N_('Not checked'), null],
  checking: [N_('Checking…'), 'lavender'],
  current: [N_('Up to date'), 'green'],
  available: [N_('Update available'), 'blue'],
  offline: [N_('Offline: can’t check'), 'yellow'],
};

function controllerCard(session) {
  // Only a WLAN dongle is connected: its own firmware can be updated here.
  if (session.state === 'dongle') return dongleCard(session);
  if (!session.connected) {
    return card({ title: t('Update your controller'), icon: 'download', tone: 'blue', subtitle: t('Connect to check for new firmware.') },
      h('p.muted', t('Updates are checked automatically every time you connect. Firmware downloads need an internet connection.')),
      h('div.row', button({ label: t('Connect controller'), icon: 'usb', variant: 'primary', onClick: connectController })));
  }
  const s = firmwareStatus();
  const [label, tone] = STATUS_TEXT[s.state] || STATUS_TEXT.unknown;
  return card({ title: session.info.name, icon: 'firmware', tone: 'blue', subtitle: t('Firmware on this controller'), actions: badge(t(label), tone) },
    kv([
      session.info.maker && [t('Maker'), session.info.maker],
      [t('Installed build'), formatFwVersion(session.info.fwVersion)],
      s.latest && [t('Latest build'), formatFwVersion(s.latest)],
      session.info.manualUrl && [t('Manual'), h('a', { href: session.info.manualUrl, target: '_blank', rel: 'noopener' }, t('Open manual'), ' ', icon('external'))],
    ]),
    // Without a USB cable (WLAN dongle, HHL Gamepad WLAN) the controller can't reach its bootloader.
    session.caps.viaWireless && callout({ tone: 'blue', icon: 'usb',
      text: s.state === 'available' ? t(CABLE_UPDATE_TEXT) : cableOnlyNote() }),
    h('div.row',
      !session.caps.viaWireless && (s.state === 'available'
        ? button({ label: t('Update now'), icon: 'download', variant: 'primary', onClick: () => openUpdateWizard() })
        : button({ label: t('Reinstall firmware'), icon: 'download', variant: 'tonal', onClick: () => openUpdateWizard({ reinstall: true }) })),
      asyncButton({ label: t('Check again'), icon: 'refresh', variant: 'ghost', busyLabel: t('Checking…'), okLabel: t('Checked'),
        run: async () => { await checkForFirmwareUpdate(); return true; } })));
}

function installCard(params) {
  return card({ title: t('Install HOJA on a blank board'), icon: 'sparkle', tone: 'lavender', subtitle: t('For new builds, or a controller that won’t start.') },
    h('ol.tips',
      h('li', t('Unplug the controller (and remove the battery if it has one).')),
      h('li', fillNodes(t('Hold the {bootsel} button (or bridge the boot pads) and plug it in. A drive named {drive} or {drive2} appears.'),
        { bootsel: h('strong', 'BOOTSEL'), drive: h('strong', 'RPI-RP2'), drive2: h('strong', 'RP2350') })),
      h('li', fillNodes(t('Press {button} and pick the “RP2 Boot” device. The installer opens automatically.'), { button: h('strong', t('Select bootloader')) }))),
    h('div.row',
      button({ label: t('Select bootloader'), icon: 'usb', variant: 'primary', onClick: () => connectController({ usbOnly: true }) }),
      button({ label: t('Open installer'), icon: 'firmware', variant: 'tonal', onClick: () => openInstallWizard(params.build) })),
    callout({ tone: 'yellow', title: t('Pick the right build.'), text: t('Installing firmware made for different hardware can stop the controller working until it’s re-flashed from BOOTSEL.') }));
}

/**
 * WLAN dongle by hand. Dongles update from the app (Home, once connected), but only once they run
 * firmware that answers 0xD1; before that the first update goes through BOOTSEL and the installer.
 */
function dongleInstallCard() {
  return card({ title: t('WLAN dongle'), icon: 'link', tone: 'blue', subtitle: t('Update the dongle itself, not the controller.') },
    h('p.muted.small', t('To update a WLAN dongle by hand, hold both buttons on the dongle while plugging it in (on a Pico W or Pico 2 W, hold BOOTSEL), then choose its firmware here.')),
    h('div.row', button({ label: t('Open installer'), icon: 'firmware', variant: 'tonal', onClick: () => openInstallWizard() })));
}

/** Reboot the connected controller into its bootloader (update mode), after a confirmation. */
function rebootButton(session) {
  const btn = button({
    label: t('Reboot to bootloader'), icon: 'firmware', variant: 'tonal',
    // Without a USB cable the firmware refuses this: its bootloader can't be reached wirelessly.
    disabled: !session.connected || session.caps.viaWireless,
    onClick: async () => {
      const ok = await confirmDialog({
        title: t('Reboot into update mode?'),
        message: t('The controller will disconnect and restart in its bootloader so new firmware can be installed. This app offers to install it when the controller reappears. Unsaved changes will be lost. Only do this if you are updating the firmware.'),
        confirmLabel: t('Reboot'), danger: true,
      });
      if (!ok) return;
      const reset = () => { if (btn.isConnected) { btn.disabled = false; btn.setLabel(t('Reboot to bootloader')); } };
      btn.disabled = true;
      btn.setLabel(t('Rebooting…'));
      try {
        await rebootToBootloaderOnly();
        // Normally the controller drops off and the page re-renders; re-arm the button if it didn't.
        setTimeout(reset, 8000);
      } catch (err) {
        console.error(err);
        toast(t('Couldn’t reboot the controller.'), { tone: 'red' });
        reset();
      }
    },
  });
  return btn;
}

/** Manual UF2 downloads, loaded the first time the list is opened. */
function downloadsList() {
  const list = h('div.build-list', h('span.muted.small', t('Loading…')));
  const el = h('details.fw-downloads', h('summary', t('Manual downloads: UF2 files to copy onto the RPI-RP2 drive yourself')), list);
  el.addEventListener('toggle', () => {
    if (!el.open || el.dataset.loaded) return;
    el.dataset.loaded = '1';
    listBuilds().then(({ builds, offline }) => {
      replace(list,
        offline && callout({ tone: 'yellow', text: t('You’re offline. Downloads need an internet connection.') }),
        h('div.build-grid', builds.map((b) => h('a.build-link', { href: b.uf2Url, download: '', rel: 'noopener' }, icon('download'), h('span', b.label)))));
    });
  });
  return el;
}

function recoveryCard(session) {
  const body = h('div.stack');
  const render = () => body.replaceChildren(
    h('div.fw-recovery-row',
      h('div', h('div.field-label', t('Install firmware by hand')),
        h('div.field-desc', session.caps.viaWireless ? cableOnlyNote() : t('Restarts the connected controller in update mode, to install firmware by hand.'))),
      rebootButton(session)),
    h('div.fw-recovery-row',
      h('div', h('div.field-label', t('Stuck in the bootloader?')),
        h('div.field-desc', t('After an interrupted update, restart it, or reinstall from the installer. If the board misbehaves even after reinstalling, reinstall again and choose “{fresh}” to wipe all settings, calibration and pairings first.', { fresh: t('Start fresh: erase everything first') }))),
      asyncButton({ label: t('Restart from bootloader'), icon: 'refresh', variant: 'tonal', busyLabel: t('Restarting…'), okLabel: t('Restarted'), run: exitBootloader })),
    downloadsList());
  render();
  const el = card({ title: t('Recovery'), icon: 'warning', tone: 'red', subtitle: t('Only needed if something went wrong, or to install firmware by hand.') }, body);
  el.refresh = render;
  return el;
}

/**
 * Wireless module (ESP32) update for a controller that is already in update mode. No controller
 * connection needed (in update mode only the CH340 is on USB), so the owner picks the firmware:
 * the HCI bridge needs controller firmware that reports "ESP32 HCI"; older firmware needs the baseband.
 */
function wirelessModuleCard(params) {
  return card({ title: t('Wireless module (ESP32)'), icon: 'wireless', tone: 'blue', subtitle: t('For a controller that’s already in update mode (lights pulsing orange).') },
    h('div.row', button({ label: t('Update wireless module'), icon: 'download', variant: 'tonal', onClick: () => openModuleUpdaterInUpdateMode(params) })));
}

export function mount(root, { session, params }) {
  // Old deep link: the changelog moved to its own page.
  if (params?.changes) { location.replace(`#/whats-new?changes=${encodeURIComponent(params.changes)}`); return; }
  const style = h('style', `
    .build-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .build-link { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--radius-md);
      background: var(--surface-2); color: var(--text); text-decoration: none; font-weight: 600; font-size: var(--text-sm);
      transition: background-color var(--dur-med); }
    .build-link:hover { background: var(--green-soft); color: var(--text); }
    .build-link .icon { color: var(--green); }
    .fw-recovery-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
    .fw-recovery-row > div { flex: 1 1 18rem; min-width: 0; }
    .fw-recovery-row + .fw-recovery-row { padding-top: var(--space-3); border-top: 1px solid var(--border); }
    .fw-downloads { padding-top: var(--space-3); border-top: 1px solid var(--border); }
    .fw-downloads summary { cursor: pointer; color: var(--text-muted); font-size: var(--text-sm); }
    .fw-downloads .build-list { margin-top: var(--space-3); }
`);
  const slot = h('div');
  const render = () => slot.replaceChildren(controllerCard(session));
  render();
  const backup = backupCard(session);
  const recovery = recoveryCard(session);
  root.append(style,
    h('h2.section-heading', t('This controller')), slot, backup, recovery,
    h('h2.section-heading', t('Other hardware')),
    h('div.card-grid', installCard(params), dongleInstallCard(), wirelessModuleCard(params)));
  const offs = [
    session.on('firmware', render), session.on('state', render),
    session.on('state', () => { backup.refresh(); recovery.refresh(); }), backup.destroy,
  ];
  return () => offs.forEach((f) => f());
}
