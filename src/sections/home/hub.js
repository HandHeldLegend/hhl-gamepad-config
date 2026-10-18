/**
 * hub.js: Home's live quick settings while a controller is connected (the "hub").
 *
 *   Status strip   battery (from every live input report), how the app is connected (USB, Bluetooth with
 *                  its link interval, the dongle), the mode and link the game sees, and reports a second
 *                  to the game, refreshed about once a second (live-status.js, GAMEPAD_CMD_STATUS)
 *   Send inputs to game   off = HOLD_INPUTS 1: the game sees a controller at rest while the app tries
 *                  things; the controller lets go by itself when the app leaves
 *   Tournament lock       TOURNEY, the same lock as the button combo on the controller
 *
 * What needs STATUS stays hidden until the controller answered it (older firmware never does).
 */
import { h } from '../../ui/dom.js';
import { card, field, toggle } from '../../ui/controls.js';
import { toast } from '../../ui/overlay.js';
import { onInputReport } from '../../device/reports.js';
import { liveStatus } from '../../device/live-status.js';
import { t, fmt } from '../../i18n/index.js';

/** core_reportformat_t: brand names stay as they are. */
const MODES = ['Switch', 'XInput', 'Slippi', 'GameCube', 'N64', 'SNES', 'Steam', 'Wii'];

/** gamepad_transport_t: how the game is reached. */
function gameLink(transport) {
  return { 0: 'SNES', 1: 'N64', 2: 'GameCube', 3: 'USB', 4: t('Bluetooth'), 5: t('Dongle') }[transport] ?? '';
}

/** One label + value in the strip; set(value) changes the value, hide(bool) the whole item. */
function stat(label) {
  const value = h('span.hub-value', '–');
  const el = h('div.hub-stat', h('span.hub-label', label), value);
  el.set = (text) => { if (value.textContent !== text) value.textContent = text; };
  return el;
}

/**
 * The hub card for the connected controller. Returns the element with destroy() (stops its polling).
 * @param {import('../../device/session.js').session} session
 */
export function quickHub(session, device) {
  const battery = stat(t('Battery'));
  const connection = stat(t('Connection'));
  const game = stat(t('Game mode'));
  const rate = stat(t('Reports to the game'));
  battery.hidden = !session.caps.battery;

  const sendInputs = toggle({ checked: true, tone: 'green', label: t('Send inputs to game'),
    onChange: async (on) => {
      sendInputs.disabled = true;
      const ok = await liveStatus.setHold(!on).catch(() => false);
      sendInputs.disabled = false;
      if (!ok) toast(t('The controller didn’t take the change. Try again.'), { tone: 'red' });
      paint();
    } });
  const tourney = toggle({ checked: false, label: t('Tournament lock'),
    onChange: async (on) => {
      tourney.disabled = true;
      const ok = await liveStatus.setTourney(on).catch(() => false);
      tourney.disabled = false;
      if (!ok) toast(t('The controller didn’t take the change. Try again.'), { tone: 'red' });
      paint();
    } });
  const sendField = field({ label: t('Send inputs to game'), control: sendInputs,
    description: t('Off: the game sees a controller at rest while you try things here. It turns back on by itself when the app disconnects.') });
  const tourneyField = field({ label: t('Tournament lock'), control: tourney,
    description: t('Blocks the d-pad, Home, Start / Plus, Select / Minus and Share in the game.') });

  // Profiles: a quick profile switcher belongs here, under the two switches, once the firmware can
  // change profiles live (no UI for it yet).

  const el = card({ title: t('Quick settings'), icon: 'sliders', tone: 'lavender', class: 'hub-card' },
    h('div.hub-stats', battery, connection, game, rate),
    sendField, tourneyField);

  function connectionText() {
    if (session.caps.viaDongle) return t('Dongle');
    if (device.transport !== 'ble') return 'USB';
    const link = device.bleLinkInfo;
    // Connection interval in 1.25 ms units, as the controller reports it
    return link?.interval ? t('Bluetooth · {ms} ms', { ms: fmt.number(link.interval * 1.25, { maximumFractionDigits: 2 }) }) : t('Bluetooth');
  }

  function paint() {
    connection.set(connectionText());
    const ok = liveStatus.supported === true;
    const s = liveStatus.state;
    for (const node of [game, rate, sendField, tourneyField]) node.hidden = !ok;
    if (!ok || !s) return;
    const link = gameLink(s.transport);
    const mode = MODES[s.mode] ?? '';
    game.set([mode, link].filter(Boolean).join(' · ') || '–');
    rate.set(t('{count}/s', { count: fmt.number(s.rate) }));
    if (!sendInputs.disabled) sendInputs.value = !s.held;
    if (!tourney.disabled) tourney.value = s.tourney;
  }

  let lastBattery = '';
  const stopInput = onInputReport(device, (r) => {
    const text = `${r.batteryPercent}%${r.chargeDone ? ` · ${t('Fully charged')}` : r.charging ? ` · ${t('Charging')}` : ''}`;
    if (text !== lastBattery) { lastBattery = text; battery.set(text); }
  });
  const stopStatus = liveStatus.on(paint);
  const stopWatch = liveStatus.watch();
  paint();

  el.destroy = () => { stopInput(); stopStatus(); stopWatch(); };
  return el;
}
