/**
 * Gamepad view: port of hoja2/modules/gamepad-md.js (+ mac-address-selector, group-rgb-picker).
 *
 * Cards:
 *   1. Default mode       gamepad_default_mode (core_reportformat_t) + hoja2's config-app warning. On
 *                         firmware with split defaults (caps.splitDefaults): that byte is the wired
 *                         default (with Auto), plus gamepad_default_wireless for battery. The block
 *                         is always written whole, so the version byte and gamepad_defaults_split stay.
 *   2. Switch colors     body / buttons / grips (0x00RRGGBB) with a live controller preview
 *   3. Connection         WebUSB popup; WLAN dongle PIN link/editor (only when session.caps.wlan;
 *                         the PIN setting itself is owned by the Wireless section)
 *   4. MAC address base   6 hex bytes; the first byte's LSB is forced even (hoja2's rule)
 *   5. Device             name, maker, firmware build
 *   6. Support            reboot into the bootloader (firmware update mode), behind a confirmation
 *
 * All writes go through session.commit('gamepad'): live on the controller, persisted by Save.
 */
import { h, loadStyles } from '../../ui/dom.js';
import { card, callout, field, button, badge, kv, infoTip, segmented } from '../../ui/controls.js';
import { confirmDialog, toast } from '../../ui/overlay.js';
import { icon } from '../../ui/icons.js';
import { t, N_ } from '../../i18n/index.js';
import { settingField, refreshSettings } from '../../settings/field.js';
import { getSetting } from '../../settings/schema.js';
import { rebootToBootloaderOnly, formatFwVersion } from '../../firmware/updater.js';
import { DEFAULT_MODES, WIRED_MODES, WIRELESS_MODES, AUTO_MODE } from './settings.js';
import { padPreview } from './pad-preview.js';
import { openConnectGuide } from '../../app/connect-guide.js';
import { macEditor, formatMac } from './mac-editor.js';

loadStyles(new URL('./gamepad.css', import.meta.url));

const TONE = 'blue';

/** Switch color fields: setting key → preview slot → short row label (the setting label minus "color"). */
const COLOR_KEYS = [
  ['gamepad.bodyColor', 'body', N_('Body')],
  ['gamepad.buttonsColor', 'buttons', N_('Buttons')],
  ['gamepad.leftGripColor', 'leftGrip', N_('Left grip')],
  ['gamepad.rightGripColor', 'rightGrip', N_('Right grip')],
];

/** One-tap color sets for the Switch colors. Values are '#rrggbb' (data, not theme). */
const COLOR_PRESETS = [
  { name: N_('Neon'), body: '#828282', buttons: '#0f0f0f', leftGrip: '#0ab9e6', rightGrip: '#ff3c28' },
  { name: N_('Charcoal'), body: '#323232', buttons: '#ffffff', leftGrip: '#323232', rightGrip: '#323232' },
  { name: 'Super NES', body: '#c9c7d3', buttons: '#5b4a9b', leftGrip: '#c9c7d3', rightGrip: '#c9c7d3' },
  { name: 'Super Famicom', body: '#e9e8ee', buttons: '#6e6b7b', leftGrip: '#e23b3b', rightGrip: '#2f6bd8' },
  { name: N_('Indigo'), body: '#4b3f8c', buttons: '#e9e8ee', leftGrip: '#3a3070', rightGrip: '#3a3070' },
];

/** Modes that the config app can talk to (from hoja2's warning). Auto picks Steam on a PC. */
const APP_MODES = new Set(['Switch', 'Steam', 'Auto']);

export function mount(root, { session, navigate }) {
  const cfg = () => session.config.gamepad;
  const defs = Object.fromEntries(COLOR_KEYS.map(([k]) => [k, getSetting(k)]));

  // ---- 1. Default mode -----------------------------------------------------------------------
  const modeDef = getSetting('gamepad.defaultMode');
  const split = !!session.caps.splitDefaults;
  const supported = (m) => !m.requires || session.caps[m.requires];
  const modePicker = modeTiles({
    modes: (split ? WIRED_MODES : DEFAULT_MODES).filter(supported),
    value: modeDef.get(session),
    onChange: (v) => {
      // No toast: the warning above the tiles already explains how to get back to this app.
      modeDef.set(session, v);
      session.commit('gamepad');
    },
  });
  // Battery default: only with Bluetooth; Wii only where supported.
  const wirelessDef = getSetting('gamepad.defaultWireless');
  const wirelessModes = WIRELESS_MODES.filter((m) => m.value === AUTO_MODE || supported(m));
  const wirelessValue = wirelessModes.some((m) => m.value === wirelessDef.get(session)) ? wirelessDef.get(session) : AUTO_MODE;
  const wirelessPicker = split && session.caps.bluetooth && h('div.gp-default-group',
    h('div.gp-default-head', h('span.field-label', t('Wireless')),
      h('span.small.muted', t('Used on battery. Auto connects to whichever saved console or PC answers first: Switch, then Wii, then PC.'))),
    segmented({
      options: wirelessModes.map((m) => ({ value: m.value, label: m.label })),
      value: wirelessValue, tone: TONE, ariaLabel: t('Wireless default'),
      onChange: (v) => { wirelessDef.set(session, v); session.commit('gamepad'); },
    }));
  const wiredHead = split && h('div.gp-default-head', h('span.field-label', t('Wired')),
    h('span.small.muted', t('Used when plugged in. Auto detects a PC, Switch, GameCube, N64 or SNES / NES.')));

  const modeCard = card({
    title: t('Default mode'), subtitle: t('What the controller pretends to be when it starts up.'), icon: 'gamepad', tone: TONE,
    actions: button({
      label: t('How to connect'), icon: 'help', size: 'sm', variant: 'ghost',
      onClick: () => openConnectGuide({ focus: 'switch', session }),
    }),
  },
    callout({ tone: 'yellow', title: t('Warning.') },
      ...tNodes(t('Only {modes} connect to this app. After changing the default, hold {button} while plugging in to connect here.'),
        { modes: h('strong', t('Switch & Steam modes')), button: h('strong', t('A or B')) })),
    wiredHead, modePicker, wirelessPicker);

  // ---- 2. Switch colors -----------------------------------------------------------------------
  const current = () => Object.fromEntries(COLOR_KEYS.map(([k, slot]) => [slot, defs[k].get(session)]));
  const preview = padPreview(current());
  const colorRows = COLOR_KEYS.map(([key, slot, label]) => {
    const row = settingField(key, { label: t(label), description: '', tip: false, onChange: (v) => preview.set({ [slot]: v }) });
    // Live preview while dragging the native picker (settingField only reports committed changes).
    row.control.querySelector('input[type="color"]')?.addEventListener('input', (e) => preview.set({ [slot]: e.target.value }));
    return row;
  });

  const applyColors = (set) => {
    for (const [key, slot] of COLOR_KEYS) if (set[slot]) defs[key].set(session, set[slot]);
    session.commit('gamepad');
    preview.set(current());
    colorRows.forEach((r) => r.refresh());
  };
  const presetRow = h('div.gp-presets', { role: 'group', 'aria-label': t('Color presets') },
    COLOR_PRESETS.map((p) => h('button.gp-preset', {
      type: 'button', title: t('Apply the {name} colors', { name: t(p.name) }),
      onclick: () => {
        const before = current();
        applyColors(p);
        toast(t('{name} colors applied', { name: t(p.name) }), { tone: 'green', action: { label: t('Undo'), onClick: () => applyColors(before) } });
      },
    },
    h('span.gp-preset-dots', { 'aria-hidden': 'true' },
      ['body', 'buttons', 'leftGrip', 'rightGrip'].map((s) => h('span', { style: { background: p[s] } }))),
    t(p.name))));

  const colorCard = card({
    title: [t('Switch device colors'), ' ', infoTip(t('Colors which determine how the Switch displays the controller in menus and some games. They don’t change the LEDs (see the RGB page for those).'))],
    icon: 'palette', tone: TONE,
  },
  h('div.gp-colors', preview, h('div.gp-color-fields', colorRows)),
  h('div.gp-presets-wrap', h('div.gp-presets-label', t('Presets')), presetRow));

  // ---- 3. Connection ---------------------------------------------------------------------------
  const connCard = card({ title: t('Connection'), subtitle: t('How the controller introduces itself when you plug it in.'), icon: 'usb', tone: TONE },
    settingField('gamepad.webusbPopup', { tone: TONE }),
    session.caps.wlan && wlanPinRow(session, navigate));

  // ---- 4. MAC address --------------------------------------------------------------------------
  const macNote = h('div.field-desc.gp-mac-note', { 'aria-live': 'polite' });
  const mac = macEditor({
    value: cfg().gamepad_mac_address,
    onChange: (bytes) => {
      // hoja2 rule: the first byte's least-significant bit must be 0 (unicast), so odd → minus one.
      let note = '';
      if (bytes[0] & 0x01) {
        bytes[0] -= 1;
        note = t('The first byte must be even, so it was changed to {byte}.', { byte: bytes[0].toString(16).toUpperCase().padStart(2, '0') });
        mac.value = bytes;
      }
      cfg().gamepad_mac_address = bytes;
      session.commit('gamepad');
      macNote.textContent = note || t('Saved as {mac}. Press Save to keep it.', { mac: formatMac(bytes) });
    },
  });
  const macField = field({
      label: t('Base address'),
      description: t('Each connection mode uses its own address, counting up from this one, so your devices see each mode as a separate controller. Only change this if two controllers clash. You may need to pair again afterwards.'),
      tip: t('A MAC address is the hardware ID other devices use to recognize the controller over Bluetooth and USB. The first byte must be even.'),
      control: mac,
      stacked: true,
    });
  macField.classList.add('gp-mac-field');
  const macCard = card({ title: t('MAC address base'), subtitle: t('The hardware address used for USB and Bluetooth modes.'), icon: 'wireless', tone: TONE },
    macField, macNote);

  // ---- 5. Device info --------------------------------------------------------------------------
  const info = session.info;
  const devCard = card({ title: t('Device'), subtitle: t('What this controller reports about itself.'), icon: 'info', tone: TONE },
    kv([
      [t('Device'), info.name || t('Unknown')],
      info.maker && [t('Maker'), info.maker],
      [t('Firmware build'), h('span.gp-build', formatFwVersion(info.fwVersion))],
      info.manualUrl && [t('Manual'), h('a', { href: info.manualUrl, target: '_blank', rel: 'noopener' }, t('Open manual'), ' ', icon('external'))],
    ]));

  // ---- 6. Support ------------------------------------------------------------------------------
  const rebootBtn = button({
    label: t('Reboot to bootloader'), icon: 'firmware', variant: 'danger',
    onClick: async () => {
      const ok = await confirmDialog({
        title: t('Reboot into update mode?'),
        message: t('The controller will disconnect and restart in its bootloader so new firmware can be installed. This app offers to install it when the controller reappears. Unsaved changes will be lost. Only do this if you are updating the firmware.'),
        confirmLabel: t('Reboot'), danger: true,
      });
      if (!ok) return;
      const reset = () => { if (rebootBtn.isConnected) { rebootBtn.disabled = false; rebootBtn.setLabel(t('Reboot to bootloader')); } };
      rebootBtn.disabled = true;
      rebootBtn.setLabel(t('Rebooting…'));
      try {
        await rebootToBootloaderOnly(); // the button already reads "Rebooting…"; no toast
        // Normally the controller drops off and this page unmounts; re-arm the button if it didn't.
        setTimeout(reset, 8000);
      } catch (err) {
        console.error(err);
        toast(t('Couldn’t reboot the controller.'), { tone: 'red' });
        reset();
      }
    },
  });
  const supportCard = card({ title: t('Support options'), subtitle: t('For firmware updates and troubleshooting.'), icon: 'firmware', tone: TONE },
    callout({ tone: 'red', title: t('Warning.') },
      t('Pressing the button below will reboot your controller into a firmware update mode. This is only necessary if you are updating the firmware.')),
    h('div.row', rebootBtn));

  root.append(modeCard, colorCard, h('div.card-grid', connCard, macCard, devCard, supportCard));

  // Re-read everything if the block is refreshed elsewhere (e.g. a deep link re-applied values).
  return {
    update() {
      modePicker.value = modeDef.get(session);
      refreshSettings(root);
      preview.set(current());
      mac.value = cfg().gamepad_mac_address;
    },
  };
}

/**
 * Grid of radio tiles for the output modes this controller has (more readable than a 7-way segmented control).
 * @param {{modes: Array, value: number, onChange: (v: number) => void}} o
 */
function modeTiles(o) {
  const modes = o.modes;
  let current = o.value;
  const tiles = modes.map((m) => h('button.gp-mode', {
    type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { value: m.value },
    onclick: () => select(m.value, true),
  },
  h('span.gp-mode-top', h('span.gp-mode-name', m.label), APP_MODES.has(m.label) && badge(t('Config app'), 'green'),
    h('span.gp-mode-check', icon('check'))),
  h('span.gp-mode-about', t(m.about))));
  const el = h('div.gp-modes', { role: 'radiogroup', 'aria-label': t('Default mode') }, tiles);

  function select(v, fire) {
    current = v;
    tiles.forEach((tile) => {
      const on = Number(tile.dataset.value) === v;
      tile.setAttribute('aria-checked', String(on));
      tile.tabIndex = on ? 0 : -1;
    });
    if (fire) o.onChange(v);
  }
  el.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = modes.findIndex((m) => m.value === current);
    const next = modes[(i + dir + modes.length) % modes.length];
    select(next.value, true);
    tiles[modes.indexOf(next)].focus();
  });
  select(current, false);
  Object.defineProperty(el, 'value', { get: () => current, set: (v) => select(v, false) });
  return el;
}

/**
 * Swap the {placeholders} in an already-translated sentence for DOM nodes (e.g. <strong>), so each language
 * keeps its own word order. E.g. text 'Only {modes} work…' with { modes: <strong> } → ['Only ', <strong>, ' work…'].
 */
function tNodes(text, nodes) {
  return text.split(/(\{\w+\})/).filter(Boolean)
    .map((part) => { const k = part.match(/^\{(\w+)\}$/)?.[1]; return k && k in nodes ? nodes[k] : part; });
}

/**
 * WLAN dongle PIN row. The editor belongs to the Wireless section ('wireless.dongleKey'); when the
 * Wireless page is available we just link there, otherwise (WLAN without Bluetooth, so the page is
 * hidden) we render that same SettingDef here so the PIN is still reachable.
 */
function wlanPinRow(session, navigate) {
  const def = getSetting('wireless.dongleKey');
  if (session.caps.wireless || !def) {
    return field({
      label: t('WLAN dongle PIN'),
      description: t('The four-digit PIN that pairs the controller with its WLAN USB dongle is set on the Wireless page.'),
      control: button({ label: t('Open Wireless'), icon: 'wireless', variant: 'tonal', size: 'sm', onClick: () => navigate('wireless') }),
    });
  }
  return settingField(def, { tone: TONE });
}
