/**
 * Firmware & backup, in three groups:
 *   This controller   its firmware (update / reinstall, maker, manual), Backup & restore, and Recovery
 *                     (reboot into the bootloader, restart out of it, manual UF2 downloads)
 *   Other hardware    install HOJA on a blank board, the dongle, the wireless module in update mode
 *
 * The flashing itself lives in src/firmware/ (updater.js state machine + picoboot.js protocol);
 * this page is the friendly front door to it. Deep links: #/firmware?build=<id> preselects a build
 * in the installer. The changelog has its own page (#/whats-new); #/firmware?changes= forwards there.
 */
import { h, replace, fillNodes } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { card, button, asyncButton, callout, kv, badge, segmented } from '../../ui/controls.js';
import { LAYOUT } from '../../device/struct.js';
import { confirmDialog, toast } from '../../ui/overlay.js';
import { connectController, connectWithUsbChooser } from '../../app/shell.js';
import { isIOS } from '../../app/platform.js';
import { listBuilds } from '../../firmware/builds.js';
import { hojaDriveLabel } from '../../firmware/drives.js';
import {
  firmwareStatus, openUpdateWizard, openInstallWizard, checkForFirmwareUpdate, exitBootloader, formatFwVersion, cableUpdateText, cableOnlyNote,
  bleUpdateSupported,
  rebootToBootloaderOnly, rebootToRomBootloaderOnly,
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
  // Only a dongle is connected: its own firmware can be updated here.
  if (session.state === 'dongle') return dongleCard(session);
  if (!session.connected) {
    return card({ title: t('Update your controller'), icon: 'download', tone: 'blue', subtitle: t('Connect to check for new firmware.') },
      h('p.muted', t('Updates are checked automatically every time you connect. Firmware downloads need an internet connection.')),
      h('div.row', button({ label: t('Connect controller'), icon: 'usb', variant: 'primary', onClick: () => connectController({ cable: true }) })));
  }
  const s = firmwareStatus();
  const [label, tone] = STATUS_TEXT[s.state] || STATUS_TEXT.unknown;
  const checkAgain = asyncButton({ label: t('Check again'), icon: 'refresh', variant: 'ghost', busyLabel: t('Checking…'), okLabel: t('Checked'),
    run: async () => { await checkForFirmwareUpdate(); return true; } });
  const actions = h('div.row', !session.caps.noCable && updateButton(s.state), checkAgain);
  // Through the dongle or over Bluetooth (no USB cable) the bootloader is out of reach, unless the
  // controller takes updates over Bluetooth: then the buttons are the same as on a cable.
  const cableNote = session.caps.noCable ? h('div') : null;
  if (cableNote) {
    const showCableNote = () => cableNote.replaceChildren(callout({ tone: 'blue', icon: 'usb',
      text: s.state === 'available' ? cableUpdateText() : cableOnlyNote() }));
    bleUpdateSupported().then((ok) => (ok ? actions.prepend(updateButton(s.state)) : showCableNote()), showCableNote);
  }
  return card({ title: session.info.name, icon: 'firmware', tone: 'blue', subtitle: t('Firmware on this controller'), actions: badge(t(label), tone) },
    kv([
      session.info.maker && [t('Maker'), session.info.maker],
      [t('Installed build'), formatFwVersion(session.info.fwVersion)],
      s.latest && [t('Latest build'), formatFwVersion(s.latest)],
      session.info.manualUrl && [t('Manual'), h('a', { href: session.info.manualUrl, target: '_blank', rel: 'noopener' }, t('Open manual'), ' ', icon('external'))],
    ]),
    cableNote, actions);
}

/** Update / Reinstall: over USB, or over Bluetooth when the controller takes updates that way. */
function updateButton(state) {
  return state === 'available'
    ? button({ label: t('Update now'), icon: 'download', variant: 'primary', onClick: () => openUpdateWizard() })
    : button({ label: t('Reinstall firmware'), icon: 'download', variant: 'tonal', onClick: () => openUpdateWizard({ reinstall: true }) });
}

function installCard(params) {
  return card({ title: t('Install HOJA on a blank board'), icon: 'sparkle', tone: 'lavender', subtitle: t('For new builds, or a controller that won’t start.') },
    h('ol.tips',
      h('li', t('Unplug the controller (and remove the battery if it has one).')),
      h('li', fillNodes(t('Hold the {bootsel} button (or bridge the boot pads) and plug it in. A drive named {drive} or {drive2} appears.'),
        { bootsel: h('strong', 'BOOTSEL'), drive: h('strong', 'RPI-RP2'), drive2: h('strong', 'RP2350') })),
      h('li', fillNodes(t('Press {button} and pick the “RP2 Boot” device. The installer opens automatically.'), { button: h('strong', t('Select bootloader')) }))),
    h('div.row',
      button({ label: t('Select bootloader'), icon: 'usb', variant: 'primary', onClick: () => connectWithUsbChooser() }),
      button({ label: t('Open installer'), icon: 'firmware', variant: 'tonal', onClick: () => openInstallWizard(params.build) })),
    callout({ tone: 'yellow', title: t('Pick the right build.'), text: t('Installing firmware made for different hardware can stop the controller working until it’s re-flashed from BOOTSEL.') }));
}

/**
 * Dongle by hand. Dongles update from the app (Home, once connected), but only once they run
 * firmware that answers 0xD1; before that the first update goes through BOOTSEL and the installer.
 */
function dongleInstallCard() {
  return card({ title: t('Dongle'), icon: 'link', tone: 'blue', subtitle: t('Update the dongle itself, not the controller.') },
    h('p.muted.small', t('To update a dongle by hand, hold both buttons on the dongle while plugging it in (on a Pico W or Pico 2 W, hold BOOTSEL), then choose its firmware here.')),
    h('div.row', button({ label: t('Open installer'), icon: 'firmware', variant: 'tonal', onClick: () => openInstallWizard() })));
}

/**
 * Reboot the connected controller into a bootloader, after a confirmation.
 * @param {{label: string, title: string, message: string, run: () => Promise<boolean>}} o
 */
function rebootButton(session, o) {
  const btn = button({
    label: o.label, icon: 'firmware', variant: 'tonal',
    // Without a USB cable the firmware refuses this: its bootloader can't be reached wirelessly.
    disabled: !session.connected || session.caps.noCable,
    onClick: async () => {
      const ok = await confirmDialog({ title: o.title, message: o.message, confirmLabel: t('Reboot'), danger: true });
      if (!ok) return;
      const reset = () => { if (btn.isConnected) { btn.disabled = false; btn.setLabel(o.label); } };
      btn.disabled = true;
      btn.setLabel(t('Rebooting…'));
      try {
        await o.run();
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

/** Without a cable: the update mode is reached over USB only, whatever the controller takes updates over. */
function byHandCableNote() {
  return isIOS() ? cableOnlyNote() : t('Needs a USB cable: the update mode works over USB only.');
}

/**
 * The two ways into a bootloader. Update mode (safe) is the HOJA bootloader where the board has one:
 * it shows a drive named after the controller and only takes this board's firmware. The boot ROM
 * (advanced) is the chip's own RPI-RP2 / RP2350 drive, past the HOJA bootloader's board checks.
 */
function bootloaderRows(session) {
  const name = session.connected ? hojaDriveLabel(session.info?.name) : '';
  const safe = h('div.fw-recovery-row',
    h('div', h('div.field-label', t('Update mode (safe)')),
      h('div.field-desc', session.caps.noCable ? byHandCableNote() : name
        ? t('Restarts the controller in its update mode, to install firmware by hand. It shows a drive named {drive} (on controllers without the HOJA bootloader: RPI-RP2 or RP2350).', { drive: name })
        : t('Restarts the controller in its update mode, to install firmware by hand. It shows a drive named after the controller (on controllers without the HOJA bootloader: RPI-RP2 or RP2350).'))),
    rebootButton(session, {
      label: t('Restart in update mode'),
      title: t('Reboot into update mode?'),
      message: t('The controller will disconnect and restart in its bootloader so new firmware can be installed. This app offers to install it when the controller reappears. Unsaved changes will be lost. Only do this if you are updating the firmware.'),
      run: rebootToBootloaderOnly,
    }));
  const rom = h('div.fw-recovery-row',
    h('div', h('div.field-label', t('Boot ROM (advanced)')),
      h('div.field-desc', session.caps.noCable ? byHandCableNote()
        : t('Restarts in the chip’s own bootloader, the RPI-RP2 or RP2350 drive. It skips the HOJA bootloader’s board checks, so use it only to recover a controller.'))),
    rebootButton(session, {
      label: t('Restart in boot ROM'),
      title: t('Restart in the chip’s own bootloader?'),
      message: t('The controller restarts in its chip’s boot ROM and shows the RPI-RP2 or RP2350 drive. This skips the HOJA bootloader’s board checks: firmware made for another board can be written there and stop the controller working. Only do this to recover a controller. Unsaved changes will be lost.'),
      run: rebootToRomBootloaderOnly,
    }));
  return [safe, rom];
}

/**
 * Reset settings without reinstalling the firmware, on the firmware there is today: the app writes
 * each settings block with its version byte blanked and saves. At the next boot the firmware sees the
 * mismatch and rebuilds that block's defaults (settings.c and each module's init; the trigger block
 * has no version byte and stays). Two scopes:
 *   settings     every block except gamepad: settings, the active profile's parts and calibration;
 *                default mode, Switch colors, the Bluetooth address and pairings stay
 *   everything   gamepad too, which gets a new random Bluetooth address: every host pairs again
 * Profiles saved apart from the live settings (the other slots) keep their stored copies.
 */
function resetSettingsRow(session) {
  let scope = 'settings';
  const run = async () => {
    const everything = scope === 'everything';
    const ok = await confirmDialog({
      title: everything ? t('Reset everything?') : t('Reset settings and calibration?'),
      message: everything
        ? t('All settings and calibration go back to their defaults when the controller restarts, and it gets a new Bluetooth address: pair it with your Switch, PC and other devices again. The firmware stays as it is. Back up first if you might want them again.')
        : t('All settings and calibration go back to their defaults when the controller restarts. The default mode, Switch colors and Bluetooth pairings stay. The firmware stays as it is. Back up first if you might want them again.'),
      confirmLabel: t('Reset'), danger: true,
    });
    if (!ok) return false;
    try {
      await resetSettingsBlocks(session, { everything });
      toast(t('Done. Unplug the controller and plug it back in (or turn it off and on) to start with the defaults.'), { tone: 'green', icon: 'check', timeout: 9000 });
      return true;
    } catch (err) {
      console.error('[firmware] reset settings failed', err);
      toast(t('Couldn’t reset the settings. Try again.'), { tone: 'red' });
      return false;
    }
  };
  return h('div.fw-recovery-row',
    h('div', h('div.field-label', t('Reset settings')),
      h('div.field-desc', t('Back to the defaults without reinstalling the firmware. It takes effect when the controller restarts.')),
      segmented({
        options: [{ value: 'settings', label: t('Settings and calibration') }, { value: 'everything', label: t('Everything, including pairings') }],
        value: scope, tone: 'red', ariaLabel: t('What to reset'), onChange: (v) => { scope = v; },
      })),
    asyncButton({ label: t('Reset…'), icon: 'trash', variant: 'tonal', disabled: !session.connected, run }));
}

/** Blank every settings block's version byte (gamepad only with `everything`), write them and save. */
async function resetSettingsBlocks(session, { everything = false } = {}) {
  const keys = [];
  for (const b of LAYOUT.blocks.config) {
    if (b.key === 'gamepad' && !everything) continue;
    const block = session.config[b.key];
    const field = LAYOUT.structs[b.struct]?.fields.find((f) => /_config_version$/.test(f.name));
    if (!block || !field) continue; // not served by this firmware, or no version byte (trigger)
    block[field.name] = 0;
    keys.push(b.key);
  }
  await Promise.all(keys.map((key) => session.commit(key, { immediate: true })));
  if (!(await session.save())) throw new Error('save not confirmed');
}

function recoveryCard(session) {
  const body = h('div.stack');
  const render = () => body.replaceChildren(
    ...bootloaderRows(session),
    resetSettingsRow(session),
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
