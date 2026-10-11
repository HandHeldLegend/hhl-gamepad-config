/**
 * Wireless view: port of hoja2/modules/wireless-md.js.
 *
 * Cards (each hidden exactly when hoja2 hid the matching panel):
 *   Wireless chip       part number + status badge (wireless_part_status), BR/EDR, LE, WLAN support
 *   Module firmware     external_update_supported only: installed vs latest baseband version and the
 *                       in-app ESP32 update (module-updater.js, replaces hoja2's "Enter Update Mode"
 *                       button + the separate hoja_baseband/ esptool page)
 *   WLAN dongle         wlan_supported only: the 4-digit pairing PIN (authoritative editor;
 *                       setting `wireless.dongleKey` in settings.js)
 *   Connected dongle    caps.viaDongle only: the WLAN dongle the controller is connected through and
 *                       its firmware update (dongle.js). The module update needs a USB cable then.
 *   Home WLAN           caps.homeWlan only: the network the controller joins for HHL Gamepad WLAN (home-wlan.js)
 *   Paired hosts        host_mac_switch / host_mac_sinput, plus host_mac_wii on Wii-capable builds (read-only)
 *   Regulatory          FCC ID + Part 15 statement when the controller reports an FCC ID
 *
 * Deep links: #/wireless?update=1 opens the module update dialog (when supported);
 * ?baud=<n> overrides the esptool baud rate like the standalone updater did.
 *
 * The update dialog is independent of this page: when the controller drops off USB to enter
 * update mode the shell destroys this view, and the dialog carries on (see module-updater.js).
 */
import { h, loadStyles } from '../../ui/dom.js';
import { card, badge, kv, field, infoTip, button, asyncButton, callout } from '../../ui/controls.js';
import { openConnectGuide, pairingTipNodes } from '../../app/connect-guide.js';
import { resolveModuleUpdate, familyOf, reportedVersion, CHANNELS, clearManifestCache } from './channels.js';
import { getSetting } from '../../settings/schema.js';
import {
  chipStatus, identityText, isPairedMac, formatMac, formatPin, sanitizePin, pinToValue,
  FCC_STATEMENT, UPDATE_GUIDE_URL,
} from './info.js';
import { openModuleUpdater } from './module-updater.js';
import { dongleCard } from './dongle.js';
import { homeWlanCard } from './home-wlan.js';
import { cableOnlyNote } from '../../firmware/updater.js';
import { t, i18n } from '../../i18n/index.js';

loadStyles(new URL('./wireless.css', import.meta.url));

const TONE = 'blue';
const yesNo = (v) => (v ? t('Supported') : t('Not supported'));

export function mount(root, ctx) {
  const { session } = ctx;
  const bt = session.static.bluetooth;
  const caps = session.caps;
  let alive = true;
  let latest = null; // newest baseband version from the manifest (null until known / offline)
  let update = null; // resolveModuleUpdate() result: channel, latest, migrate, available

  // ---- Wireless chip ------------------------------------------------------------------------
  const chip = chipStatus(bt);
  const chipCard = card({
    title: t('Wireless chip'), subtitle: t('The radio that handles Bluetooth and wireless dongles.'),
    icon: 'wireless', tone: TONE, actions: badge(chip.label, chip.tone),
  },
  kv([
    [t('Part'), chip.model],
    [t('Status'), h('span.wl-inline', chip.label, infoTip(
      t('Active: the wireless hardware answered when the controller started. Not responding: it’s fitted but didn’t answer (try a restart; if it persists the module may need its firmware reinstalled). Inactive / Not present: nothing was detected.')))],
    [t('Bluetooth Classic'), h('span.wl-inline', yesNo(bt.bluetooth_bdr_supported), infoTip(t('Bluetooth BR/EDR, used for Switch and most console/PC pairing.')))],
    [t('Bluetooth LE'), h('span.wl-inline', yesNo(bt.bluetooth_ble_supported), infoTip(t('Bluetooth Low Energy.')))],
    [t('WLAN dongle'), yesNo(bt.wlan_supported)],
  ]));

  // ---- Module firmware (ESP32 baseband) -------------------------------------------------------
  let firmwareCard = null;
  // Without a USB cable the controller can't enter module update mode (the firmware refuses it).
  const moduleUpdates = !caps.viaWireless;
  if (caps.externalBaseband) {
    const installed = reportedVersion(bt); // null: the module didn't report a valid version
    const status = h('span', badge(t('Checking…')));
    const latestCell = h('span.muted', t('Checking…'));
    const migrateNote = h('div', { hidden: true });
    const updateBtn = button({
      label: t('Update wireless module'), icon: 'download', variant: 'tonal',
      onClick: () => openModuleUpdater({ installed, latest: update?.latest ?? null, channel: update?.channel, migrate: !!update?.migrate, params: ctx.params }),
    });
    firmwareCard = card({
      title: t('Wireless module firmware'),
      subtitle: t('The ESP32 module runs its own firmware, updated separately from the controller.'),
      icon: 'firmware', tone: TONE, actions: status,
    },
    kv([[t('Installed version'), installed != null ? `${installed} (${t(CHANNELS[familyOf(installed)].name)})`
      : h('span.wl-inline', t('Not reported'), infoTip(t('The module answered but didn’t report a valid firmware version (raw value {raw}). Installing its firmware again usually fixes this.', { raw: bt.external_version_number })))],
      [t('Latest version'), latestCell]]),
    migrateNote,
    !moduleUpdates && callout({ tone: 'blue', icon: 'usb', text: cableOnlyNote() }),
    h('div.wl-actions', updateBtn,
      asyncButton({ label: t('Check again'), icon: 'refresh', variant: 'ghost', size: 'sm', busyLabel: t('Checking…'), okLabel: t('Checked'),
        run: async () => { clearManifestCache(); await check(); session.refreshAttention?.(); return !!update?.latest; } }),
      h('a.btn.btn-ghost.btn-sm', { href: UPDATE_GUIDE_URL, target: '_blank', rel: 'noopener noreferrer' }, h('span.btn-label', t('Update guide')))));

    // Fetch the latest versions and paint the card. Also run by "Check again" (after clearing the cache).
    const check = () => resolveModuleUpdate(bt).then((u) => {
      if (!alive) return;
      update = u;
      latest = u.latest;
      migrateNote.hidden = true;
      migrateNote.replaceChildren();
      updateBtn.classList.replace('btn-primary', 'btn-tonal');
      updateBtn.setLabel(t('Update wireless module'));
      updateBtn.hidden = false;
      if (u.needsControllerUpdate) {
        // The HCI bridge needs current controller firmware: that comes first.
        latestCell.textContent = u.latest ? `${u.latest} (${t(u.channel.name)})` : t('Couldn’t check');
        status.replaceChildren(badge(t('Update the controller first'), 'yellow'));
        migrateNote.replaceChildren(callout({ tone: 'yellow', text: t('This controller’s firmware is too old for the HCI bridge. Update the controller firmware first, then update the wireless module here.') },
          ' ', button({ label: t('Firmware'), icon: 'firmware', size: 'sm', variant: 'tonal', onClick: () => ctx.navigate?.('firmware') })));
        migrateNote.hidden = false;
        updateBtn.hidden = true;
        return;
      }
      if (!u.latest) {
        latestCell.textContent = navigator.onLine === false ? t('Offline') : t('Couldn’t check');
        latestCell.classList.add('muted');
        status.replaceChildren(badge(t('Unknown')));
        return;
      }
      latestCell.textContent = `${u.latest} (${t(u.channel.name)})`;
      latestCell.classList.remove('muted');
      status.replaceChildren(u.migrate ? badge(t('Recommended'), 'yellow')
        : u.available ? badge(t('Update available'), 'yellow') : badge(t('Up to date'), 'green'));
      if (u.unknown) {
        migrateNote.replaceChildren(callout({ tone: 'yellow', text: t('The wireless module didn’t report its firmware version. Install the {name} firmware to fix it.', { name: t(u.channel.name) }) }));
        migrateNote.hidden = false;
      }
      if (u.migrate) {
        // Legacy baseband → HCI bridge: say what it brings and that hosts need pairing again.
        migrateNote.replaceChildren(callout({ tone: 'blue', icon: 'wireless', text: t('The HCI bridge firmware is recommended for this controller. It unlocks Wii mode and the newer Bluetooth features (current Switch and Steam modes, pairing over USB).') }, ' ', t('Afterwards, pair the Switch and any other Bluetooth hosts again once: the module’s Bluetooth address changes.')));
        migrateNote.hidden = false;
      }
      if (u.available) {
        updateBtn.classList.replace('btn-tonal', 'btn-primary');
        updateBtn.setLabel(u.migrate || u.unknown ? t('Install HCI bridge') : t('Update now'));
      }
      if (!moduleUpdates) updateBtn.hidden = true;
    });

    const checked = check();
    // Deep link: open the dialog once the version check has finished (so it can show "latest").
    // The link opens it once: clear ?update so a remount (reconnect, dongle, language) does not reopen it.
    if (ctx.params?.update && moduleUpdates) checked.then(() => { if (!alive) return; updateBtn.click(); ctx.setParams?.({ update: null }); });
  }

  // ---- WLAN dongle PIN -----------------------------------------------------------------------
  let pinRow = null;
  if (caps.wlan) {
    const def = getSetting('wireless.dongleKey');
    const input = h('input.input.mono.wl-pin', {
      type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxLength: 4, autocomplete: 'off', spellcheck: false,
      value: formatPin(def.get(session)), 'aria-label': t(def.label),
    });
    input.addEventListener('input', () => { input.value = sanitizePin(input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('change', () => {
      const value = pinToValue(sanitizePin(input.value));
      input.value = formatPin(value);
      if (value === def.get(session)) return;
      def.set(session, value);
      session.commit(def.block);
    });
    // Setting texts are English data (settings.js); translate where rendered.
    pinRow = field({ label: t(def.label), description: t(def.description), tip: t(def.tip), control: input, settingKey: def.key });
    pinRow.refresh = () => { input.value = formatPin(def.get(session)); };
  }
  const wlanCard = pinRow && card({
    title: t('WLAN dongle'), subtitle: t('Pair with a Raspberry Pi wireless dongle instead of Bluetooth.'),
    icon: 'link', tone: TONE,
  }, pinRow);

  // ---- Home WLAN (HHL Gamepad WLAN) ----------------------------------------------------------
  const homeCard = caps.homeWlan && homeWlanCard(session);

  // ---- Paired hosts --------------------------------------------------------------------------
  const cfg = session.config.gamepad;
  const macCell = (bytes) => (isPairedMac(bytes)
    ? h('span.wl-mac', formatMac(bytes))
    : h('span.muted', t('Not paired')));
  const hostsCard = card({
    title: t('Paired hosts'), subtitle: t('What this controller reconnects to over Bluetooth. Pairing again replaces it.'),
    icon: 'gamepad', tone: TONE,
  },
  kv([
    ['Nintendo Switch', macCell(cfg.host_mac_switch)],
    [t('Steam host'), h('span.wl-inline', macCell(cfg.host_mac_sinput), infoTip(t('The PC or device paired in Steam mode.')))],
    session.caps.wii && ['Wii', h('span.wl-inline', macCell(cfg.host_mac_wii), infoTip(t('The Wii console paired in Wii mode.')))],
  ]));

  // ---- Regulatory ----------------------------------------------------------------------------
  const fccId = identityText(bt.fcc_id);
  // The FCC statement stays in its official English wording (lang="en"). Other languages get a
  // reference translation below it, labelled as such (draft; the English text is what counts).
  const fccTranslated = t(FCC_STATEMENT);
  const fccCard = fccId && card({ title: t('Regulatory'), icon: 'info', tone: TONE, class: 'wl-fcc span-2' },
    h('div.wl-fcc-id', 'FCC ID: ', h('span.mono', fccId)),
    h('p.small.muted', { lang: 'en' }, FCC_STATEMENT),
    i18n.lang !== 'en' && fccTranslated !== FCC_STATEMENT && h('div.wl-fcc-translation',
      h('p.xs.faint.wl-fcc-note', t('Translation for reference only. The English statement above is the official text.')),
      h('p.small.muted', fccTranslated)));

  // Pairing is the most common question: a one-line answer on top, the full guide one tap away.
  // Button names come from the controller (connect-guide.js), e.g. "A + Plus" or "East + Start".
  const hasBt = !!(bt.bluetooth_bdr_supported || bt.bluetooth_ble_supported);
  const tipNodes = hasBt && pairingTipNodes(session);
  const pairTip = tipNodes && callout({ tone: 'blue', icon: 'wireless', title: t('Pairing over Bluetooth:') },
    ...tipNodes, ' ',
    button({ label: t('How to connect'), size: 'sm', variant: 'ghost', icon: 'help', onClick: () => openConnectGuide({ session }) }));
  if (pairTip) { pairTip.style.marginBottom = 'var(--space-4)'; root.append(pairTip); }

  // Side by side on wide pages; the long regulatory text spans the full row.
  const connectedDongle = caps.viaDongle && session.dongle && dongleCard(session, { title: t('Connected dongle') });
  // What people come here for first (pairings, networks, the dongle), then the hardware behind it.
  root.append(h('div.card-grid', ...[hostsCard, homeCard, wlanCard, connectedDongle, chipCard, firmwareCard, fccCard].filter(Boolean)));

  return {
    destroy() { alive = false; },
    update(params) {
      if (params?.update && caps.externalBaseband && moduleUpdates) {
        openModuleUpdater({ installed: reportedVersion(bt), latest, channel: update?.channel, migrate: !!update?.migrate, params });
        ctx.setParams?.({ update: null });
      }
      pinRow?.refresh();
    },
  };
}
