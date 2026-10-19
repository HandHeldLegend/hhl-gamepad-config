/**
 * mode-switcher.js: The live mode switcher (Steam / Slippi / Switch) for a controller on its cable and
 * for the dongle on a computer, and the taskbar shortcuts (manifest "shortcuts", opened through
 * launchQueue): a mode, ./?mode=slippi, or a settings profile, ./?profile=2 (1 to 4).
 *
 * A switch lasts until the controller or dongle is unplugged, and leaves the saved mode as it is. The
 * device drops off USB and comes back in the new mode in under half a second; the session follows it.
 * The first time a mode's USB identity comes back, Chrome needs it allowed once (Connect).
 */
import { segmented } from '../ui/controls.js';
import { toast } from '../ui/overlay.js';
import { session } from '../device/session.js';
import { device, USB_FILTERS, isPicoBootloader, isCh340 } from '../device/hoja-device.js';
import { t } from '../i18n/index.js';

/** Brand names stay untranslated (GLOSSARY.md); the firmware's SInput mode is "Steam" in the UI. */
const OPTIONS = [
  { value: 'steam', label: 'Steam' },
  { value: 'slippi', label: 'Slippi' },
  { value: 'switch', label: 'Switch' },
];

/** Dolphin holds the GameCube adapter while it runs (see shell.js's ADAPTER_IN_USE). */
async function run(mode) {
  try {
    if (!(await session.switchMode(mode))) throw new Error('not taken');
    return true;
  } catch (err) {
    console.warn('[mode] switch failed', err?.message || err);
    toast(t('Couldn’t change the mode. Try again.'), { tone: 'red', timeout: 6000 });
    return false;
  }
}

/** The switcher for the connected controller or dongle (session.liveMode), or an empty span without one. */
export function modeSwitcher({ compact = false } = {}) {
  const current = session.liveMode;
  const picker = segmented({
    options: OPTIONS, value: current, ariaLabel: t('USB mode'),
    onChange: async (mode) => {
      if (!(await run(mode))) picker.value = session.liveMode;
    },
  });
  if (compact) picker.classList.add('seg-compact');
  return picker;
}

/** A shortcut needs a controller: wait for one opening, else open one this site may already use. */
async function connectForShortcut() {
  // The app may still be opening a device it found at start-up
  for (let waited = 0; session.state === 'connecting' && waited < 8000; waited += 200) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (session.state === 'disconnected' && navigator.usb) {
    const known = (await navigator.usb.getDevices().catch(() => []))
      .filter((usb) => USB_FILTERS.some((f) => f.vendorId === usb.vendorId && f.productId === usb.productId))
      .filter((usb) => !isPicoBootloader(usb) && !isCh340(usb));
    for (const usb of known) {
      try { if (await session.reconnect(usb)) break; } catch { /* the next one */ }
    }
  }
}

/** A taskbar shortcut asked for a mode: switch the connected device, or one this site may already open. */
export async function switchFromShortcut(mode) {
  if (!OPTIONS.some((o) => o.value === mode)) return;
  if (!session.liveMode) await connectForShortcut();
  if (!session.liveMode) {
    toast(t('Connect your controller or dongle first, then use the shortcut again.'), { tone: 'yellow', timeout: 7000 });
    return;
  }
  if (session.liveMode !== mode) await run(mode);
}

/**
 * A taskbar shortcut asked for a settings profile (1 to 4): make it live on the connected controller.
 * Unsaved changes are saved first, as the Home page does, so nothing is lost in the switch.
 */
export async function profileFromShortcut(number) {
  const n = Number(number) - 1;
  if (!Number.isInteger(n) || n < 0) return;
  if (!session.connected) await connectForShortcut();
  if (!session.connected) {
    toast(t('Connect your controller first, then use the shortcut again.'), { tone: 'yellow', timeout: 7000 });
    return;
  }
  const profiles = await device.readProfiles().catch(() => null);
  if (!profiles || n >= profiles.names.length) {
    toast(t('This controller’s firmware has no profiles. Update it to use them.'), { tone: 'yellow', timeout: 7000 });
    return;
  }
  const name = profiles.names[n] || t('Profile {n}', { n: n + 1 });
  if (profiles.active === n) {
    toast(t('{name} is already live.', { name }), { tone: 'blue' });
    return;
  }
  let ok = !session.dirty.size || await session.save().catch(() => false);
  ok = ok && await device.switchProfile(n).catch(() => false);
  if (ok) toast(t('{name} is live.', { name }), { tone: 'green' });
  else toast(t('Couldn’t switch profiles. Try again.'), { tone: 'red', timeout: 6000 });
}

/** The shortcuts open ./?mode=… or ./?profile=…: in a new window or, with the app open, through launchQueue. */
function onLaunch(url) {
  const params = new URL(url, location.href).searchParams;
  const mode = params.get('mode');
  const profile = params.get('profile');
  if (!mode && !profile) return;
  const clean = new URL(location.href);
  clean.searchParams.delete('mode');
  clean.searchParams.delete('profile');
  history.replaceState(history.state, '', clean);
  if (mode) switchFromShortcut(mode);
  else profileFromShortcut(profile);
}

if ('launchQueue' in window) window.launchQueue.setConsumer((params) => params.targetURL && onLaunch(params.targetURL));
else onLaunch(location.href);
