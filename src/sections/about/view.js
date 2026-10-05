/**
 * Help & about: quick troubleshooting, links, version info and third-party attributions.
 *
 * Quick help entries can carry a button that opens a full guide (Linux udev setup, How to connect,
 * the iPhone/iPad explainer). These are always reachable here, whatever platform detection decided.
 * Deep link: #/about?guide=linux|connect|ios opens that guide.
 */
import { h, fillNodes } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { card, kv, button } from '../../ui/controls.js';
import { pwa, loadVersion } from '../../app/pwa.js';
import { LAYOUT } from '../../device/struct.js';
import { ATTRIBUTIONS } from './attributions.js';
import { t, N_ } from '../../i18n/index.js';
import { explainLinux } from '../../app/linux.js';
import { openConnectGuide } from '../../app/connect-guide.js';
import { explainIOS } from '../../app/platform.js';

const WHATS_NEW = 'https://docs.handheldlegend.com/s/portal/doc/whats-new-xmtMoBg2Pu';

const FAQ = [
  [N_('The controller won’t connect'), N_('Hold A or B while plugging it in, use a data-capable USB cable, and close other tabs or apps using the controller. Only Switch and Steam modes talk to this app.')],
  [N_('My browser says USB isn’t supported'), N_('Use Chrome, Edge, Opera or another Chromium browser on Windows, macOS, Linux, ChromeOS or Android. Safari, Firefox and all iOS browsers don’t support WebUSB.')],
  [N_('My changes disappeared after unplugging'), N_('Changes apply instantly but are only stored when you press Save. The Save button glows yellow while there are unsaved changes.')],
  [N_('The stick drifts or doesn’t reach the corners'), N_('Open Joysticks and run calibration. Then check the deadzone. Turn on Trace in the live view to see exactly what the controller reports.')],
  [N_('Linux: the controller shows up but won’t connect'), N_('Linux only lets your account open USB devices that a udev rule allows. A one-time rule fixes it for this app and for Steam and Switch modes in games.'),
    { label: N_('Linux setup'), icon: 'usb', guide: 'linux' }],
  [N_('Connecting to a Switch or pairing over Bluetooth'), N_('Wired play on a Switch needs Pro Controller Wired Communication turned on. To pair over Bluetooth, hold the mode button and Start while turning the controller on.'),
    { label: N_('How to connect'), icon: 'help', guide: 'connect' }],
  [N_('I’m on an iPhone or iPad'), N_('iPhone and iPad browsers can’t use WebUSB, so they can’t connect to the controller. This is Apple’s choice and out of our hands. The demo still works.'),
    { label: N_('Why?'), icon: 'info', guide: 'ios' }],
  [N_('A firmware update was interrupted'), N_('Hold BOOTSEL while plugging in, then open Firmware → Install and pick your controller. Your board is very hard to permanently brick.')],
];

function link(href, text) {
  return h('a', { href, target: '_blank', rel: 'noopener' }, text, ' ', icon('external'));
}

function openGuide(name, session) {
  if (name === 'linux') return explainLinux();
  if (name === 'connect') return openConnectGuide({ session });
  if (name === 'ios') return explainIOS();
  return null;
}

export function mount(root, ctx = {}) {
  const version = h('span', pwa.version || '…');
  loadVersion().then((v) => { version.textContent = v || 'dev'; });

  root.append(
    // Wide pages: Quick help on the left, About + assistants stacked on the right; attributions below.
    h('div.card-grid',
    card({ title: t('Quick help'), icon: 'help', tone: 'blue', class: 'span-rows' },
      h('div.faq', FAQ.map(([q, a, action]) => h('details', h('summary', t(q)), h('p.muted', t(a)),
        action && button({ label: t(action.label), icon: action.icon, size: 'sm', variant: 'tonal', onClick: () => openGuide(action.guide, ctx.session) }))))),

    card({ title: t('About'), icon: 'info', tone: 'lavender' },
      h('p', fillNodes(t('{app} configures, calibrates and updates controllers running HOJA firmware from Hand Held Legend. It runs entirely in your browser and works offline once installed.'), { app: h('strong', 'HHL Gamepad Config') })),
      kv([
        [t('App version'), version],
        [t('Firmware layout'), `HOJA-LIB-RP2040 @ ${LAYOUT.source?.ref ?? t('unknown')}`],
      ]),
      h('div.row',
        button({ label: t('What’s new'), icon: 'sparkle', variant: 'tonal', onClick: () => window.open(WHATS_NEW, '_blank', 'noopener') }),
        link('https://handheldlegend.com', 'handheldlegend.com'),
        link('https://github.com/HandHeldLegend/HOJA-LIB-RP2040', t('Firmware source')))),

    card({ title: t('For AI assistants'), icon: 'link', tone: 'green', subtitle: t('Let an assistant help you set up your controller.') },
      h('p.muted.small', fillNodes(t('Every page and many settings can be opened with a link. Assistants can read the guide at {guide} or use the HHL Gamepad Config MCP server to build links for you. Links that change settings always ask you to confirm first.'),
        { guide: h('a', { href: 'llms.txt', target: '_blank' }, 'llms.txt') })))),

    card({ title: t('Attributions'), icon: 'sparkle', tone: 'red', subtitle: t('Made possible by these people and projects.') },
      h('ul.attributions', ATTRIBUTIONS.map((a) => h('li',
        h('div', h('strong', a.name), ' · ', a.author, ' · ', h('span.badge', a.license)),
        h('div.muted.small', t(a.usedFor), ' · ', h('a', { href: a.url, target: '_blank', rel: 'noopener' }, t('source')))))),
      h('p.faint.xs', t('Super Famicom-inspired colors are a tribute; this app is not affiliated with or endorsed by Nintendo.'))),
  );

  if (ctx.params?.guide) setTimeout(() => openGuide(ctx.params.guide, ctx.session), 0);

  root.append(h('style', `
    .faq details { border-bottom: 1px dashed var(--border); padding: 9px 0; }
    .faq details:last-child { border-bottom: 0; }
    .faq summary { cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
    .faq summary::after { content: "+"; color: var(--text-muted); font-weight: 700; transition: transform var(--dur-med) var(--ease-out); }
    .faq details[open] summary::after { transform: rotate(45deg); }
    .faq details p { margin-top: 6px; font-size: var(--text-sm); }
    .faq details .btn { margin-top: 4px; }
    .attributions { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px 24px; grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr)); }
    .attributions li { min-width: 0; overflow-wrap: anywhere; }
    .attributions .badge { white-space: normal; }
  `));
}
