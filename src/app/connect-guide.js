/**
 * connect-guide.js — "How to connect" dialog: Switch (wired and Bluetooth) and Bluetooth pairing in
 * Steam mode. Opened from the Wireless page (pairing tip) and the Gamepad page (Default mode card).
 *
 * Firmware facts (HOJA-LIB-RP2040 utilities/boot.c, device main.c files):
 *   - Holding Start (sync_on_boot_code = INPUT_CODE_START on wireless HHL controllers) while the
 *     controller powers on enters Bluetooth pairing.
 *   - On battery, Switch and Steam (SInput) modes use Bluetooth; XInput, GameCube, N64 and Slippi use
 *     the WLAN dongle instead. Plugged in, every mode is wired.
 *   - One host per mode is remembered (Paired hosts card); pairing again replaces it.
 * The Switch only reads a wired Pro Controller with "Pro Controller Wired Communication" turned on.
 */
import { h } from '../ui/dom.js';
import { openDialog } from '../ui/overlay.js';
import { t } from '../i18n/index.js';

const section = (title, ...steps) => h('section.guide-section',
  h('h3', title),
  h('ol', steps.map((s) => h('li', s))));

/**
 * @param {{focus?: 'switch'|'bluetooth', bluetooth?: boolean}} [o]
 *   focus: scroll that part into view; bluetooth: false hides the Bluetooth parts (no radio).
 */
export function openConnectGuide(o = {}) {
  const bt = o.bluetooth !== false;
  const wired = section(t('Nintendo Switch — wired'),
    h('span', t('On the Switch, open System Settings → Controllers and Sensors and turn on'), ' ', h('strong', t('Pro Controller Wired Communication')), '. ',
      t('Without it, the Switch only charges the controller over USB and ignores its buttons.')),
    t('Plug the controller into the dock or the console in Switch mode (the default unless you changed it on the Gamepad page).'));
  const btSwitch = bt && section(t('Nintendo Switch — Bluetooth'),
    t('On the Switch Home menu, open Controllers → Change Grip/Order and leave that screen open.'),
    h('span', t('Unplug the controller, then hold'), ' ', h('strong', t('Start (+)')), ' ', t('while you turn it on. It enters pairing mode and connects.')),
    t('Next time, just turn it on (or press a button) and it reconnects to the same Switch.'));
  const btSteam = bt && section(t('PC, Steam Deck, phone — Bluetooth (Steam mode)'),
    t('Set the Default mode to Steam on the Gamepad page and press Save.'),
    h('span', t('Unplug the controller, then hold'), ' ', h('strong', t('Start (+)')), ' ', t('while you turn it on.')),
    t('Pair it from the device’s Bluetooth settings.'));
  const notes = h('ul.guide-notes',
    bt && h('li', t('Bluetooth works in Switch and Steam modes. XInput, GameCube, N64 and Slippi modes go wireless through the WLAN dongle instead.')),
    bt && h('li', t('The controller remembers one Switch and one Steam host. Pairing again replaces it — the Wireless page shows both.')),
    h('li', t('Erasing the controller (“Start fresh” firmware install) forgets its pairings, so pair again afterwards.')));

  const dlg = openDialog({
    title: t('How to connect'), icon: 'link', tone: 'blue', wide: true,
    body: [wired, btSwitch, btSteam, notes].filter(Boolean),
    actions: [{ label: t('Done'), variant: 'primary' }],
  });
  const target = o.focus === 'bluetooth' ? btSwitch : o.focus === 'switch' ? wired : null;
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  return dlg;
}
