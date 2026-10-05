/**
 * connect-guide.js — "How to connect" dialog: Switch (wired and Bluetooth) and Bluetooth pairing in
 * Steam mode. Opened from the Wireless page (pairing tip) and the Gamepad page (Default mode card).
 *
 * The guide shows only what applies to the connected controller:
 *   - Button names come from the controller itself (static input info: the names printed on the
 *     hardware), so it says "A + Plus" or "East + Start" as appropriate. Without a controller it
 *     falls back to "A (East)", "B (South)", "Start (+)".
 *   - Bluetooth parts appear only on controllers with a radio; USB-cable pairing only on the RPi RM2
 *     module (Switch mode); the WLAN dongle note only when the build supports a dongle.
 *
 * Firmware facts (HOJA-LIB-RP2040 utilities/boot.c, hal/rp2040/bluetooth_hal.c, device main.c files):
 *   - Holding Start (sync_on_boot_code = INPUT_CODE_START) while powering on enters Bluetooth pairing;
 *     held with a mode's boot button it picks the mode too: East = Switch, South = Steam. The same
 *     East/South buttons held while plugging in start a config-app mode.
 *   - RM2 (bluetooth part "RPI RM2"): in Switch mode the Switch can pair over the USB cable (the link
 *     key arrives through ns_api_hook_set_usbpair), then the controller reconnects over Bluetooth.
 *   - On battery, Switch and Steam (SInput) modes use Bluetooth; XInput, GameCube, N64 and Slippi use
 *     the WLAN dongle where supported. Plugged in, every mode is wired.
 *   - One host per mode is remembered (Paired hosts card); pairing again replaces it.
 *   - The controller doesn't wake on a button press: turn it on to reconnect.
 * The Switch only reads a wired Pro Controller with "Pro Controller Wired Communication" turned on.
 */
import { h, fillNodes } from '../ui/dom.js';
import { openDialog } from '../ui/overlay.js';
import { decodeText } from '../device/struct.js';
import { INPUT_CODES } from '../sections/input/mapping.js';
import { outputName } from '../sections/input/parts.js';
import { t } from '../i18n/index.js';

/** The controller's own name for an input code key ('EAST', 'START'…), or null. */
function inputName(session, key) {
  const code = INPUT_CODES.find((c) => c.key === key)?.code;
  const info = code == null ? null : session?.static?.input?.input_info?.[code];
  const name = info && info.input_type ? decodeText(info.input_name ?? new Uint8Array()) : '';
  return name ? outputName(name) : null;
}

/**
 * What to tell this controller's owner. Without a connected controller everything is generic.
 * @returns {{known: boolean, east: string, south: string, start: string,
 *            radio: 'rm2'|'esp32'|'other'|'none'|'unknown', wlan: boolean}}
 */
export function connectProfile(session) {
  const known = !!session?.connected;
  const east = (known && inputName(session, 'EAST')) || t('A (East)');
  const south = (known && inputName(session, 'SOUTH')) || t('B (South)');
  const start = (known && inputName(session, 'START')) || t('Start (+)');
  let radio = 'unknown';
  if (known) {
    const bt = session.static?.bluetooth || {};
    const part = decodeText(bt.part_number ?? new Uint8Array());
    if (!session.caps?.bluetooth) radio = 'none';
    else if (/RM2|CYW43/i.test(part)) radio = 'rm2';
    else if (/ESP32/i.test(part) || session.caps.externalBaseband) radio = 'esp32';
    else radio = 'other';
  }
  // The WLAN dongle pairs with the RM2 radio only (not ESP32 or wired-only builds).
  return { known, east, south, start, radio, wlan: radio === 'rm2' && !!session.caps?.wlan };
}

/** "A + Plus" style combo, bold. */
const combo = (...names) => h('strong', names.join(' + '));

const section = (title, ...steps) => h('section.guide-section',
  h('h3', title),
  h('ol', steps.filter(Boolean).map((s) => h('li', s))));

/**
 * One-line pairing tip for the Wireless page (null when the controller has no Bluetooth).
 * @returns {Node[]|null}
 */
export function pairingTipNodes(session) {
  const p = connectProfile(session);
  if (p.radio === 'none') return null;
  return fillNodes(t('unplug the controller, then hold {switch} for Switch or {steam} for Steam while you turn it on.'),
    { switch: combo(p.east, p.start), steam: combo(p.south, p.start) });
}

/**
 * @param {{focus?: 'switch'|'bluetooth', session?: object}} [o]
 *   focus: scroll that part into view; session: the connected controller (tailors the guide).
 */
export function openConnectGuide(o = {}) {
  const p = connectProfile(o.session);
  const bt = p.radio !== 'none';

  const wired = section(t('Nintendo Switch — wired'),
    h('span', t('On the Switch, open System Settings → Controllers and Sensors and turn on'), ' ', h('strong', t('Pro Controller Wired Communication')), '. ',
      t('Without it, the Switch only charges the controller over USB and ignores its buttons.')),
    h('span', fillNodes(t('Plug the controller into the dock or the console. Hold {button} while plugging in if Switch isn’t its default mode.'), { button: combo(p.east) })));

  const btSwitch = bt && section(t('Nintendo Switch — Bluetooth'),
    t('On the Switch Home menu, open Controllers → Change Grip/Order and leave that screen open.'),
    h('span', fillNodes(t('Unplug the controller, then hold {buttons} while you turn it on. It enters pairing mode and connects.'), { buttons: combo(p.east, p.start) })),
    (p.radio === 'rm2' || p.radio === 'unknown') && h('span',
      p.radio === 'unknown' && h('strong', t('Controllers with the RM2 wireless module:'), ' '),
      t('you can also pair with the cable — plug it into the Switch with USB in Switch mode once. It pairs on its own; unplug it and it connects over Bluetooth from then on.')),
    t('Next time, turn the controller on and it reconnects to the same Switch.'));

  const btSteam = bt && section(t('PC, Steam Deck, phone — Bluetooth (Steam mode)'),
    h('span', fillNodes(t('Unplug the controller, then hold {buttons} while you turn it on.'), { buttons: combo(p.south, p.start) })),
    t('Pair it from the device’s Bluetooth settings.'));

  const notes = h('ul.guide-notes',
    bt && h('li', t('Bluetooth works in Switch and Steam modes.')),
    p.wlan && h('li', t('XInput, GameCube, N64 and Slippi modes go wireless through the WLAN dongle instead.')),
    bt && h('li', t('The controller remembers one Switch and one Steam host. Pairing again replaces it — the Wireless page shows both.')),
    bt && h('li', t('Erasing the controller (“Start fresh” firmware install) forgets its pairings, so pair again afterwards.')),
    !bt && h('li', t('This controller is wired only.')));

  const dlg = openDialog({
    title: t('How to connect'), icon: 'link', tone: 'blue', wide: true,
    body: [
      !p.known && h('p.muted.small', t('Connect your controller to see the exact buttons and options for it.')),
      wired, btSwitch, btSteam, notes,
    ].filter(Boolean),
    actions: [{ label: t('Done'), variant: 'primary' }],
  });
  const target = o.focus === 'bluetooth' ? (btSwitch || wired) : o.focus === 'switch' ? wired : null;
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  return dlg;
}
