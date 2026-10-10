/**
 * Home: connect hero (disconnected), device overview (connected) or the WLAN dongle (only a dongle
 * connected, no controller on it yet), plus the section grid.
 */
import { h, replace, fillNodes } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button, card, callout, badge, face, kv } from '../../ui/controls.js';
import { SECTIONS } from '../registry.js';
import { connectController, unavailableReason, currentModeLabel, betaBadge } from '../../app/shell.js';
import { startDemo, isDemo } from '../../device/mock.js';
import { firmwareStatus, openUpdateWizard, formatFwVersion, CABLE_UPDATE_TEXT } from '../../firmware/updater.js';
import { dongleCard } from '../wireless/dongle.js';
import { t } from '../../i18n/index.js';
import { isIOS, isWindows, explainIOS } from '../../app/platform.js';
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
  // Windows without WebUSB can still connect through HHL Gamepad WLAN (connectController offers it).
  const connecting = session.state === 'connecting';
  const connectBtn = button({ label: connecting ? t('Connecting…') : t('Connect controller'), icon: 'usb', variant: 'primary', size: 'lg',
    disabled: connecting || (!webusb && !isWindows()), onClick: connectController });
  if (connecting) connectBtn.prepend(h('span.spinner.motion-ok'));
  return h('section.hero',
    h('div',
      h('h1', t('Let’s set up your controller')),
      h('p', t('Plug your HOJA controller in with a USB data cable, then connect. Everything you change applies instantly. Press Save to keep it.')),
      h('div.hero-actions',
        connectBtn,
        button({ label: t('Try the demo'), icon: 'play', variant: 'ghost', size: 'lg', onClick: () => startDemo() })),
      !webusb && h('div', { style: { marginTop: '16px' } }, isIOS()
        ? callout({ tone: 'yellow', title: t('iPhone and iPad can’t connect to controllers.'), text: t('Use a computer or an Android device to change settings. The demo works here.') },
          ' ', button({ label: t('Why?'), size: 'sm', variant: 'ghost', icon: 'info', onClick: () => explainIOS() }))
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

function deviceCard(session) {
  const fw = firmwareStatus();
  const { viaDongle, viaLan, viaWireless } = session.caps; // no updates without a USB cable
  const updateBtn = fw.state === 'available' && !viaWireless
    ? button({ label: t('Update firmware'), icon: 'download', variant: 'primary', onClick: () => openUpdateWizard() })
    : button({ label: t('Firmware'), icon: 'firmware', variant: 'tonal', onClick: () => { location.hash = '#/firmware'; } });
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
          fw.state === 'available' && badge(t('Update available'), 'blue'),
          fw.state === 'current' && badge(t('Firmware up to date'), 'green'))),
      updateBtn),
    kv([
      session.info.maker && [t('Maker'), session.info.maker],
      [t('Firmware build'), formatFwVersion(session.info.fwVersion)],
    ]),
    viaDongle && callout({ tone: 'blue', icon: 'link', text: `${t('Connected through a WLAN dongle.')} ` },
      h('a', { href: '#/wireless' }, t('Dongle details'), icon('chevron-right'))),
    viaLan && callout({ tone: 'blue', icon: 'link', text: t('Connected through HHL Gamepad WLAN on this PC.') }),
    viaWireless && fw.state === 'available' && callout({ tone: 'blue', icon: 'usb', text: t(CABLE_UPDATE_TEXT) }),
    atts.map(([id, a]) => callout({ tone: a.level === 'warn' ? 'yellow' : 'blue', text: `${t(a.text)} ` },
      h('a', { href: `#/${id}` }, t('Open'), icon('chevron-right')))));
}

export function mount(root, { session }) {
  const render = () => {
    const dongleOnly = session.state === 'dongle';
    replace(root,
      session.connected ? deviceCard(session) : dongleOnly ? dongleCard(session) : hero(session),
      !session.connected && !dongleOnly && connectTips(),
      h('h2.section-heading', session.connected ? t('Configure') : t('Explore')),
      tiles(session));
  };
  render();
  const offs = [session.on('attention', render), session.on('firmware', render)];
  return () => offs.forEach((f) => f());
}
