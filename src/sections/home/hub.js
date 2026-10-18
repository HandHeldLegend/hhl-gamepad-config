/**
 * hub.js: Home's live quick settings while a controller is connected (the "hub").
 *
 *   Status strip   battery (from every live input report), the app's connection (USB, Bluetooth with its
 *                  link interval, the dongle), the game's connection (mode and what carries it: USB,
 *                  Bluetooth, the dongle or a console cable), and reports a second to the game ("Not
 *                  polled" for a console mode nothing polls), refreshed about once a second (live-status.js)
 * Order: profile and tournament lock first (what's reached for most), then the status strip and send
 * inputs to game.
 *
 *   Send inputs to game   off = HOLD_INPUTS 1: the game sees a controller at rest while the app tries
 *                  things; the controller lets go by itself when the app leaves. Off from the start over
 *                  USB (live-status.js): the game is on this computer then
 *   Tournament lock       TOURNEY, the same lock as the button combo on the controller; the buttons it
 *                  blocks are drawn with this controller's own glyphs
 *   Profile        which of the controller's four settings profiles is live, renaming and copying them
 *                  (hoja-device.js, 0x07). Only the app switches them. Hidden when the firmware has none
 *
 * What needs STATUS stays hidden until the controller answered it (older firmware never does).
 */
import { h, fillNodes } from '../../ui/dom.js';
import { button, card, field, select, textInput, toggle } from '../../ui/controls.js';
import { openDialog, toast } from '../../ui/overlay.js';
import { onInputReport } from '../../device/reports.js';
import { liveStatus } from '../../device/live-status.js';
import { t, fmt } from '../../i18n/index.js';
import { rawName } from '../../app/connect-guide.js';
import { glyph } from '../input/parts.js';

/** What the tournament lock blocks (HOJA-LIB-RP2040 input/hover.c), as input code keys. */
const TOURNEY_KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'START', 'SELECT', 'SHARE'];

/** "Blocks [glyphs] in the game": the blocked buttons this controller has, as it labels them. */
function tourneyText(session) {
  const names = TOURNEY_KEYS.map((key) => rawName(session, key)).filter(Boolean);
  if (!names.length) return t('Blocks the d-pad, Home, Start / Plus, Select / Minus and Share in the game.');
  const buttons = h('span.hub-glyphs', { role: 'img', 'aria-label': names.join(', '),
    style: { display: 'inline-flex', gap: '4px', verticalAlign: 'middle', flexWrap: 'wrap' } },
  names.map((name) => glyph(name, { size: 22 })));
  return fillNodes(t('Blocks {buttons} in the game.'), { buttons });
}

/** core_reportformat_t: brand names stay as they are. */
const MODES = ['Switch', 'XInput', 'Slippi', 'GameCube', 'N64', 'SNES', 'Steam', 'Wii'];

/** gamepad_transport_t values for the console ports (NES/SNES bus, N64 and GameCube joybus). */
const CONSOLE_PORTS = [0, 1, 2];

/** gamepad_transport_t: what the game is connected through (never the mode again: "GameCube · console cable"). */
function gameLink(transport) {
  if (CONSOLE_PORTS.includes(transport)) return t('console cable');
  return { 3: 'USB', 4: t('Bluetooth'), 5: t('Dongle') }[transport] ?? '';
}

/** The last profile list each controller sent (by transport id): Home draws it at once, so the page
 *  doesn't grow under a restored scroll position while the controller answers again. */
const profilesSeen = new Map();

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
  // Two links, labelled so they can't read as one: the app's to the controller, the game's
  const connection = stat(t('App connection'));
  const game = stat(t('Game connection'));
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
    description: t('Off: the game sees a controller at rest while you try things here. Over USB it starts off, so presses don’t reach games on this computer; over Bluetooth it starts on. It turns back on by itself when the app disconnects.') });
  const tourneyField = field({ label: t('Tournament lock'), control: tourney,
    description: tourneyText(session) });

  // Profiles: null until the controller answered (and for good when its firmware has none)
  const profilesKey = device.transportId ?? 'this';
  let profiles = profilesSeen.get(profilesKey) ?? null;
  const profileName = (n) => profiles?.names[n] || t('Profile {n}', { n: n + 1 });
  const profilePick = h('div', { role: 'group', 'aria-label': t('Profile'),
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', width: '100%' } });
  const renameBtn = button({ label: t('Rename'), variant: 'ghost', size: 'sm', onClick: () => renameProfile() });
  const copyBtn = button({ label: t('Copy from…'), icon: 'copy', variant: 'ghost', size: 'sm', onClick: () => copyProfile() });
  const profileField = field({ label: t('Profile'), stacked: true,
    control: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start', width: '100%' } },
      profilePick,
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, renameBtn, copyBtn)),
    description: t('Stick notches and angles, deadzones and curves, remaps, RGB, motion and rumble strength belong to the profile. Calibration, pairings and your name stay the same in every profile.') });
  profileField.hidden = true;

  function paintProfiles(busy = false) {
    profileField.hidden = !profiles;
    if (!profiles) return;
    // One button per profile, all in view (two to a row on a phone)
    profilePick.replaceChildren(...profiles.names.map((_, n) => {
      const b = button({ label: profileName(n), variant: n === profiles.active ? 'primary' : 'tonal', disabled: busy,
        onClick: () => switchProfile(n) });
      b.setAttribute('aria-pressed', String(n === profiles.active));
      b.style.minWidth = '0';
      b.querySelector('.btn-label')?.style.setProperty('overflow', 'hidden');
      b.querySelector('.btn-label')?.style.setProperty('text-overflow', 'ellipsis');
      return b;
    }));
    renameBtn.disabled = copyBtn.disabled = busy;
  }

  async function switchProfile(n) {
    if (n === profiles.active) return;
    paintProfiles(true);
    // The controller stores what's live with the old profile as it switches: save it the usual way
    // first, so nothing reads as unsaved afterwards
    let ok = !session.dirty.size || await session.save().catch(() => false);
    ok = ok && await device.switchProfile(n).catch(() => false);
    if (ok) profiles.active = n;
    paintProfiles();
    if (ok) toast(t('{name} is live.', { name: profileName(n) }), { tone: 'green' });
    else toast(t('The controller didn’t take the change. Try again.'), { tone: 'red' });
  }

  async function renameProfile() {
    const n = profiles.active;
    const input = textInput({ value: profiles.names[n], placeholder: t('Profile {n}', { n: n + 1 }),
      maxLength: 24, ariaLabel: t('Profile name') });
    const dlg = openDialog({ title: t('Rename profile'), icon: 'sliders', body: input,
      actions: [
        { label: t('Cancel'), variant: 'ghost', value: null },
        { label: t('Rename'), variant: 'primary', onClick: () => input.value.trim() },
      ] });
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') dlg.close(input.value.trim()); });
    const name = await dlg.result;
    if (name == null || name === profiles.names[n]) return;
    paintProfiles(true);
    const ok = await device.renameProfile(n, name).catch(() => false);
    if (ok) profiles.names[n] = name;
    paintProfiles();
    if (!ok) toast(t('The controller didn’t take the change. Try again.'), { tone: 'red' });
  }

  async function copyProfile() {
    const to = profiles.active;
    const others = profiles.names.map((_, n) => n).filter((n) => n !== to);
    const from = select({ ariaLabel: t('Copy from'), value: others[0],
      options: others.map((n) => ({ value: n, label: profileName(n) })) });
    const dlg = openDialog({ title: t('Copy a profile into {name}', { name: profileName(to) }), icon: 'copy',
      body: [h('p.muted', t('Its settings replace this profile’s, and go live now. The name stays.')), from],
      actions: [
        { label: t('Cancel'), variant: 'ghost', value: null },
        { label: t('Copy'), variant: 'primary', onClick: () => from.value },
      ] });
    const source = await dlg.result;
    if (source == null) return;
    paintProfiles(true);
    let ok = !session.dirty.size || await session.save().catch(() => false);
    ok = ok && await device.copyProfile(source, to, to).catch(() => false);
    paintProfiles();
    if (ok) toast(t('{name} has {from}’s settings now.', { name: profileName(to), from: profileName(source) }), { tone: 'green' });
    else toast(t('The controller didn’t take the change. Try again.'), { tone: 'red' });
  }

  paintProfiles();
  device.readProfiles?.().then((p) => {
    profiles = p;
    profilesSeen.set(profilesKey, p);
    paintProfiles();
  }).catch(() => {});

  const el = card({ title: t('Quick settings'), icon: 'sliders', tone: 'lavender', class: 'hub-card' },
    profileField, tourneyField,
    h('div.hub-stats', battery, connection, game, rate),
    sendField);

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
    // A console mode on USB power only: nothing polls it, so there is no rate to show
    rate.set(!s.rate && CONSOLE_PORTS.includes(s.transport) ? t('Not polled') : t('{count}/s', { count: fmt.number(s.rate) }));
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
