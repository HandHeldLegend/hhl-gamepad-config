/**
 * Home: connect hero (disconnected), device overview and the live quick settings hub (connected, hub.js)
 * or the dongle (only a dongle connected, no controller on it yet), plus the section grid.
 */
import { h, replace, fillNodes } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button, card, callout, badge, face, kv } from '../../ui/controls.js';
import { SECTIONS } from '../registry.js';
import { connectController, unavailableReason, currentModeLabel, betaBadge } from '../../app/shell.js';
import { startDemo, isDemo } from '../../device/mock.js';
import { firmwareStatus, openUpdateWizard, formatFwVersion, cableUpdateText, bleUpdateSupported } from '../../firmware/updater.js';
import { dongleCard } from '../wireless/dongle.js';
import { quickHub } from './hub.js';
import { t } from '../../i18n/index.js';
import { isIOS, explainIOS } from '../../app/platform.js';
import { isLinux, explainLinux } from '../../app/linux.js';

function tiles(session) {
  return h('div.tiles', SECTIONS.filter((s) => s.id !== 'home' && !s.hidden).map((s) => {
    const reason = unavailableReason(s);
    const att = session.attention[s.id];
    return h('a.tile', {
      href: `#/${s.id}`, class: [`tone-${s.tone}`, reason && session.connected ? 'disabled' : null, reason && !session.connected ? 'waiting' : null].filter(Boolean),
      title: reason || t(s.summary),
    },
    face(s.icon, s.tone, 42),
    h('div', h('div.tile-title', t(s.title), s.beta && betaBadge()), h('div.tile-sub', t(s.summary))),
    att && h('span.tile-badge', badge(att.level === 'warn' ? t('Needs attention') : t('Update'), att.level === 'warn' ? 'yellow' : 'blue')));
  }));
}

function hero(session) {
  const webusb = !!navigator.usb;
  // While a controller is being opened the button says so (Home remounts when the state changes).
  const connecting = session.state === 'connecting';
  const connectBtn = button({ label: connecting ? t('Connecting…') : t('Connect controller'), icon: 'usb', variant: 'primary', size: 'lg',
    disabled: connecting, onClick: () => connectController() });
  if (connecting) connectBtn.prepend(h('span.spinner.motion-ok'));
  return h('section.hero',
    h('div',
      h('h1', t('Let’s set up your controller')),
      h('p', isIOS()
        ? t('Connect your HOJA controller over Bluetooth. Everything you change applies instantly. Press Save to keep it.')
        : t('Plug your HOJA controller in with a USB data cable, then connect. Everything you change applies instantly. Press Save to keep it.')),
      h('div.hero-actions',
        connectBtn,
        button({ label: t('Try the demo'), icon: 'play', variant: 'ghost', size: 'lg', onClick: () => startDemo() })),
      !webusb && h('div', { style: { marginTop: '16px' } }, isIOS()
        ? callout({ tone: 'blue', title: navigator.bluetooth ? t('USB needs a computer.') : t('On iPhone and iPad, Bluetooth needs the free Bluefy browser.'),
          text: t('Firmware updates need a computer with Chrome or Edge.') },
          ' ', button({ label: t('More'), size: 'sm', variant: 'ghost', icon: 'info', onClick: () => explainIOS() }))
        : callout({ tone: 'red', title: t('USB isn’t available in this browser.'), text: t('Use Chrome, Edge or another Chromium browser on desktop or Android.') })),
      webusb && isLinux() && h('div', { style: { marginTop: '16px' } },
        callout({ tone: 'blue', icon: 'info', title: t('On Linux?'), text: t('Add a udev rule once so your browser and games can use the controller.') },
          ' ', button({ label: t('Linux setup'), size: 'sm', variant: 'ghost', icon: 'usb', onClick: () => explainLinux() })))),
    h('img.hero-art', { src: 'assets/icons/app/icon-512.png', alt: '' }));
}

function connectTips() {
  return card({ title: t('Having trouble connecting?'), icon: 'help', tone: 'blue' },
    h('ul.tips',
      h('li', fillNodes(t('Hold {buttons} while plugging in to start the controller in config mode.'), { buttons: h('strong', t('A or B')) })),
      h('li', t('Use a cable that carries data. Many charge-only cables don’t.')),
      isLinux() && h('li', fillNodes(t('On Linux, “Access denied” means a udev rule is missing. See {setup}.'), { setup: h('a', { href: '#/home', onclick: (e) => { e.preventDefault(); explainLinux(); } }, t('Linux setup')) })),
      h('li', t('Only Switch and Steam modes talk to this app. If you changed the default mode, hold A or B while plugging in.')),
      h('li', fillNodes(t('Blank board or bricked? Hold BOOTSEL while plugging in, then open {firmware} to install HOJA.'), { firmware: h('a', { href: '#/firmware' }, t('Firmware')) }))));
}

const updateButton = () => button({ label: t('Update firmware'), icon: 'download', variant: 'primary', onClick: () => openUpdateWizard() });

/**
 * Without a USB cable, where an update is available: Update firmware and a note that it goes over Bluetooth
 * when the controller takes it that way, else the note that it needs the cable. Fills `note` once known.
 */
function wirelessUpdate(note, updateBtn) {
  const cableNote = () => note.replaceChildren(callout({ tone: 'blue', icon: 'usb', text: cableUpdateText() }));
  bleUpdateSupported().then((ok) => {
    if (!ok) { cableNote(); return; }
    updateBtn.replaceWith(updateButton());
    note.replaceChildren(callout({ tone: 'blue', icon: 'download', text: t('An update is available. It installs over Bluetooth.') }));
  }, cableNote);
}

function deviceCard(session) {
  const fw = firmwareStatus();
  const { viaDongle, viaBluetooth, noCable } = session.caps; // without a USB cable: over Bluetooth, or no update
  const updateBtn = fw.state === 'available' && !noCable
    ? updateButton()
    : button({ label: t('Firmware'), icon: 'firmware', variant: 'tonal', onClick: () => { location.hash = '#/firmware'; } });
  const updateNote = noCable && fw.state === 'available' ? h('div') : null;
  if (updateNote) wirelessUpdate(updateNote, updateBtn);
  const atts = Object.entries(session.attention);
  return card({ class: 'device-card' },
    h('div.device-head',
      face('gamepad', 'lavender', 56),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div.device-name.ellipsis', session.info.name),
        h('div.row', { style: { '--gap': '8px', marginTop: '4px' } },
          badge(isDemo() ? t('Demo controller') : t('Connected'), isDemo() ? 'lavender' : 'green'),
          // The output mode it is running as right now (Switch / Steam), from its USB IDs.
          !isDemo() && currentModeLabel() && h('span', { title: t('Running in {mode}', { mode: currentModeLabel() }) }, badge(currentModeLabel(), 'blue')),
          viaBluetooth && badge(t('Bluetooth'), 'blue'),
          fw.state === 'available' && badge(t('Update available'), 'blue'),
          fw.state === 'current' && badge(t('Firmware up to date'), 'green'))),
      updateBtn),
    kv([
      session.info.maker && [t('Maker'), session.info.maker],
      [t('Firmware build'), formatFwVersion(session.info.fwVersion)],
    ]),
    viaDongle && callout({ tone: 'blue', icon: 'link', text: `${t('Connected through the dongle.')} ` },
      h('a', { href: '#/wireless' }, t('Dongle details'), icon('chevron-right'))),
    updateNote,
    atts.map(([id, a]) => callout({ tone: a.level === 'warn' ? 'yellow' : 'blue', text: `${t(a.text)} ` },
      h('a', { href: `#/${id}` }, t('Open'), icon('chevron-right')))));
}

export function mount(root, { session, device }) {
  let hub = null;
  const render = () => {
    const dongleOnly = session.state === 'dongle';
    hub?.destroy();
    hub = session.connected ? quickHub(session, device) : null;
    replace(root,
      session.connected ? deviceCard(session) : dongleOnly ? dongleCard(session) : hero(session),
      hub,
      !session.connected && !dongleOnly && connectTips(),
      h('h2.section-heading', session.connected ? t('Configure') : t('Explore')),
      tiles(session));
  };
  render();
  const offs = [session.on('attention', render), session.on('firmware', render)];
  return () => { offs.forEach((f) => f()); hub?.destroy(); };
}
