/**
 * connect-guide.js ("How to connect" dialog): a modes-at-a-glance table (button per mode, wired /
 * battery behavior, pairing), then Switch (wired and Bluetooth), Bluetooth pairing in Steam mode,
 * and Wii mode on controllers that support it. Opened from the Wireless page (pairing
 * tip) and the Gamepad page (Default mode card).
 *
 * The guide shows only what applies to the connected controller:
 *   - Button names come from the controller itself (static input info: the names printed on the
 *     hardware), so it says "A + Plus" or "East + Start" as appropriate. Without a controller it
 *     falls back to "A", "B", "Start (+)".
 *   - Bluetooth parts appear only on controllers with a radio; USB-cable pairing only on the RPi RM2
 *     module (Switch mode); the WLAN dongle note only when the build supports a dongle; Wii mode only
 *     when the controller reports it (session.caps.wii: RM2 builds, and ESP32 builds with the HCI bridge).
 *
 * Firmware facts (HOJA-LIB-RP2040 utilities/boot.c, hal/rp2040/bluetooth_hal.c, device main.c files):
 *   - Holding Start (sync_on_boot_code = INPUT_CODE_START) while powering on enters Bluetooth pairing;
 *     held with a mode's boot button it picks the mode too. The boot buttons follow the LABELS on the
 *     face buttons, whatever their position (boot.c k_face_formats per sewn layout): A = Switch,
 *     B = Steam, X = XInput, Y = Slippi. E.g. on GameCube-style controllers (GC Ultimate) the button
 *     on the East side is labeled X, so Switch is still "A + Start", not "East + Start". Without
 *     A/B labels it falls back to position: East = Switch, South = Steam. The same buttons held
 *     while plugging in start a config-app mode.
 *   - RM2 (bluetooth part "RPI RM2"): in Switch mode the Switch can pair over the USB cable (the link
 *     key arrives through ns_api_hook_set_usbpair), then the controller reconnects over Bluetooth.
 *   - On battery, Switch and Steam (SInput) modes use Bluetooth; XInput, GameCube, N64 and Slippi use
 *     the WLAN dongle where supported. Plugged in, every mode is wired.
 *   - One host per mode is remembered (Paired hosts card); pairing again replaces it.
 *   - The controller doesn't wake on a button press: turn it on to reconnect.
 *   - Console modes by d-pad at boot (k_dpad_formats): Left = SNES, Down = N64, Right = GameCube.
 *   - Auto (split-defaults firmware): no button; detects the host plugged in, or calls saved hosts.
 *   - Wii mode (core_wii.c, boot.c): d-pad up at boot (with Start to pair again; up alone pairs only the first time), always Bluetooth, status LED pink. Pair by pressing
 *     SYNC on the Wii. A short power-button tap cycles Upright (Remote + Nunchuk) → Sideways (Remote
 *     alone) → Classic (Remote + Classic Controller); the LED flashes white / yellow / blue. The
 *     Extension Attach/Detach output (Capture by default) plugs the extension in or out (LED green /
 *     red). It reports as a Wii Remote Plus (MotionPlus built in) and turns itself off a few seconds
 *     after the Wii is switched off.
 * The Switch only reads a wired Pro Controller with "Pro Controller Wired Communication" turned on.
 */
import { h, fillNodes, loadStyles } from '../ui/dom.js';
import { openDialog } from '../ui/overlay.js';
import { decodeText } from '../device/struct.js';
import { INPUT_CODES } from '../sections/input/mapping.js';
import { outputName, glyph } from '../sections/input/parts.js';
import { t } from '../i18n/index.js';

// Button glyphs (styles live with the Input section).
loadStyles(new URL('../sections/input/input.css', import.meta.url));

/** The controller's own (raw) name for an input code key ('EAST', 'START'…), or ''. */
function rawName(session, key) {
  const code = INPUT_CODES.find((c) => c.key === key)?.code;
  const info = code == null ? null : session?.static?.input?.input_info?.[code];
  return info && info.input_type ? decodeText(info.input_name ?? new Uint8Array()).trim() : '';
}

/**
 * A button for the guide: { name: display text, glyph: glyph label }. With a controller connected
 * both come from its own button names, so the glyphs match the hardware; otherwise the fallbacks.
 */
function button(raw, fallbackName, fallbackGlyph) {
  return raw ? { name: outputName(raw), glyph: raw } : { name: fallbackName, glyph: fallbackGlyph };
}

const FACE_KEYS = ['SOUTH', 'EAST', 'WEST', 'NORTH'];

/**
 * The face button that boots a mode: the one LABELED `label` ('A' Switch, 'B' Steam), else the
 * button at `fallbackKey`'s position (controllers without ABXY labels).
 */
function modeButton(session, label, fallbackKey) {
  const key = FACE_KEYS.find((k) => rawName(session, k).toUpperCase() === label) || fallbackKey;
  return key ? rawName(session, key) : '';
}

/**
 * What to tell this controller's owner. Without a connected controller everything is generic.
 * @returns {{known: boolean, east: string, south: string, start: string, up: string, capture: string,
 *            radio: 'rm2'|'esp32'|'other'|'none'|'unknown', wlan: boolean, wii: boolean}}
 */
export function connectProfile(session) {
  const known = !!session?.connected;
  // east/south keep their names for the call sites; they are the Switch and Steam boot buttons.
  const raw = (key) => (known ? rawName(session, key) : '');
  const east = button(known && modeButton(session, 'A', 'EAST'), t('A'), 'A');
  const south = button(known && modeButton(session, 'B', 'SOUTH'), t('B'), 'B');
  const start = button(raw('START'), t('Start (+)'), 'Start');
  const up = button(raw('UP'), t('D-pad up'), 'D Up');
  const capture = button(raw('CAPTURE'), t('Capture'), 'Capture');
  // XInput and Slippi boot buttons: the ones labeled X and Y (no position fallback in the firmware).
  const x = button(known && modeButton(session, 'X', null), 'X', 'X');
  const y = button(known && modeButton(session, 'Y', null), 'Y', 'Y');
  // Console modes are picked with the d-pad at startup (boot.c k_dpad_formats).
  const left = button(raw('LEFT'), t('D-pad left'), 'D Left');
  const down = button(raw('DOWN'), t('D-pad down'), 'D Down');
  const right = button(raw('RIGHT'), t('D-pad right'), 'D Right');
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
  const caps = session?.caps || {};
  return {
    known, east, south, start, up, capture, x, y, left, down, right, radio, wlan: radio === 'rm2' && !!caps.wlan, wii: known && !!caps.wii,
    // Unknown controller: list every mode. Known: only what this build has.
    joybus: !known || !!caps.joybus, snes: !known || !!caps.snes, auto: !!caps.splitDefaults,
  };
}

/**
 * "Modes at a glance": every output mode with the button that picks it at startup, what it does
 * plugged in and on battery, and how it pairs. Rows and columns follow the controller's abilities.
 */
function modesTable(p) {
  const bt = p.radio !== 'none';
  const dash = () => h('span.faint', '–'); // a new node per cell
  const wlanOr = () => (p.wlan ? t('WLAN dongle') : dash());
  const rows = [
    p.auto && [t('Auto'), h('span', t('No button')), t('Detects a PC, Switch or console'), bt ? t('Connects to the first saved host that answers') : dash()],
    [t('Switch'), combo(p.east), h('span', t('Wired'), ' · ', h('span.guide-app', t('config app'))), bt ? fillNodes(t('Bluetooth. Pair: {buttons}'), { buttons: combo(p.east, p.start) }) : dash()],
    [t('Steam'), combo(p.south), h('span', t('Wired'), ' · ', h('span.guide-app', t('config app'))), bt ? fillNodes(t('Bluetooth. Pair: {buttons}'), { buttons: combo(p.south, p.start) }) : dash()],
    [t('XInput'), combo(p.x), t('Wired'), wlanOr()],
    [t('Slippi'), combo(p.y), t('Wired'), wlanOr()],
    p.wii && [t('Wii'), combo(p.up), dash(), fillNodes(t('Bluetooth. Pair: {buttons}, then SYNC on the Wii'), { buttons: combo(p.up, p.start) })],
    p.joybus && [t('GameCube'), combo(p.right), t('Wired'), wlanOr()],
    p.joybus && [t('N64'), combo(p.down), t('Wired'), wlanOr()],
    p.snes && [t('SNES / NES'), combo(p.left), t('Wired'), dash()],
  ].filter(Boolean);
  return h('section.guide-section',
    h('h3', t('Modes at a glance')),
    h('p.small.muted', t('Hold a mode’s button while you plug in the controller or turn it on. With Start held too, Switch and Steam modes enter Bluetooth pairing. Without a button it starts in its default mode (Gamepad page).')),
    h('div.guide-modes', { role: 'table' },
      h('div.guide-modes-row.head', { role: 'row' }, [t('Mode'), t('Hold'), t('Wired'), t('Wireless')].map((c) => h('span', { role: 'columnheader' }, c))),
      rows.map((r) => h('div.guide-modes-row', { role: 'row' }, r.map((c, i) => h(i ? 'span' : 'strong', { role: 'cell' }, c))))),
    h('p.small.muted', t('Only Switch and Steam modes connect to this config app.')));
}

/** A button combo as the controller's glyphs ("A + Start"), with the names as its accessible text. */
function combo(...buttons) {
  const label = buttons.map((b) => b.name).join(' + ');
  return h('span.guide-combo', { title: label, role: 'img', 'aria-label': label },
    buttons.flatMap((b, i) => [i ? h('span.guide-plus', { 'aria-hidden': 'true' }, '+') : null, glyph(b.glyph, { size: 28 })]));
}

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

  const wired = section(t('Nintendo Switch (wired)'),
    h('span', t('On the Switch, open System Settings → Controllers and Sensors and turn on'), ' ', h('strong', t('Pro Controller Wired Communication')), '. ',
      t('Without it, the Switch only charges the controller over USB and ignores its buttons.')),
    h('span', fillNodes(t('Plug the controller into the dock or the console. Hold {button} while plugging in if Switch isn’t its default mode.'), { button: combo(p.east) })));

  const btSwitch = bt && section(t('Nintendo Switch (Bluetooth)'),
    t('On the Switch Home menu, open Controllers → Change Grip/Order and leave that screen open.'),
    h('span', fillNodes(t('Unplug the controller, then hold {buttons} while you turn it on. It enters pairing mode and connects.'), { buttons: combo(p.east, p.start) })),
    (p.radio === 'rm2' || p.radio === 'unknown') && h('span',
      p.radio === 'unknown' && h('strong', t('Controllers with the RM2 wireless module:'), ' '),
      t('you can also pair with the cable: plug it into the Switch with USB in Switch mode once. It pairs on its own; unplug it and it connects over Bluetooth from then on.')),
    t('Next time, turn the controller on and it reconnects to the same Switch.'));

  const btPhone = bt && section(t('Phone or tablet (Bluetooth, Switch mode)'),
    h('span', fillNodes(t('Unplug the controller, then hold {buttons} while you turn it on.'), { buttons: combo(p.east, p.start) })),
    t('Pair it from the device’s Bluetooth settings.'));

  const btSteam = bt && section(t('PC and Steam Deck (Bluetooth, Steam mode)'),
    h('span', fillNodes(t('Unplug the controller, then hold {buttons} while you turn it on.'), { buttons: combo(p.south, p.start) })),
    t('Pair it from the device’s Bluetooth settings.'));

  const wii = p.wii && section(t('Nintendo Wii (Bluetooth, Wii mode)'),
    h('span', fillNodes(t('To pair, hold {buttons} while you turn the controller on (the very first time, {button} alone also works). The status LED turns pink.'), { buttons: combo(p.up, p.start), button: combo(p.up) })),
    t('Press the SYNC button on the Wii. The controller pairs and connects as a Wii Remote.'),
    h('span', fillNodes(t('After that, hold {button} while you turn it on to reconnect to the same Wii.'), { button: combo(p.up) })),
    t('Tap the power button to switch between Upright (Wii Remote with Nunchuk), Sideways (Wii Remote alone) and Classic (with a Classic Controller). The LED flashes white, yellow or blue to show which.'),
    h('span', fillNodes(t('By default, {button} plugs in or unplugs the Nunchuk or Classic Controller, for games that ask you to remove it. The LED flashes green when it is attached and red when it is not.'), { button: combo(p.capture) })),
    t('It works as a Wii Remote Plus with MotionPlus built in, so MotionPlus games such as Wii Sports Resort work. It turns itself off a few seconds after the Wii is switched off.'));

  const notes = h('ul.guide-notes',
    bt && h('li', p.wii ? t('Bluetooth works in Switch, Steam and Wii modes.') : t('Bluetooth works in Switch and Steam modes.')),
    p.wlan && h('li', t('XInput, GameCube, N64 and Slippi modes go wireless through the WLAN dongle instead.')),
    bt && h('li', p.wii
      ? t('The controller remembers one Switch, one Steam host and one Wii. Pairing again replaces it. The Wireless page shows all three.')
      : t('The controller remembers one Switch and one Steam host. Pairing again replaces it. The Wireless page shows both.')),
    bt && h('li', t('Erasing the controller (“Start fresh” firmware install) forgets its pairings, so pair again afterwards.')),
    !bt && h('li', t('This controller is wired only.')));

  const dlg = openDialog({
    title: t('How to connect'), icon: 'link', tone: 'blue', wide: true,
    body: [
      !p.known && h('p.muted.small', t('Connect your controller to see the exact buttons and options for it.')),
      modesTable(p), wired, btSwitch, btPhone, btSteam, wii, notes,
    ].filter(Boolean),
    actions: [{ label: t('Done'), variant: 'primary' }],
  });
  const target = o.focus === 'bluetooth' ? (btSwitch || wired) : o.focus === 'switch' ? wired : null;
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  return dlg;
}
