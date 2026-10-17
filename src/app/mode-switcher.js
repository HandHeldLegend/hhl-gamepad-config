/**
 * mode-switcher.js: The live mode switcher (Steam / Slippi / Switch) for a controller on its cable and
 * for the dongle on a computer, and the taskbar shortcuts that use it (manifest "shortcuts", opened
 * through launchQueue: ./?mode=slippi).
 *
 * A switch lasts until the controller or dongle is unplugged, and leaves the saved mode as it is. The
 * device drops off USB and comes back in the new mode in under half a second; the session follows it.
 * The first time a mode's USB identity comes back, Chrome needs it allowed once (Connect).
 */
import { segmented } from '../ui/controls.js';
import { toast } from '../ui/overlay.js';
import { session } from '../device/session.js';
import { USB_FILTERS, isPicoBootloader, isCh340 } from '../device/hoja-device.js';
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

/** A taskbar shortcut asked for a mode: switch the connected device, or one this site may already open. */
export async function switchFromShortcut(mode) {
  if (!OPTIONS.some((o) => o.value === mode)) return;
  // The app may still be opening a device it found at start-up
  for (let waited = 0; session.state === 'connecting' && waited < 8000; waited += 200) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!session.liveMode && navigator.usb && session.state === 'disconnected') {
    const known = (await navigator.usb.getDevices().catch(() => []))
      .filter((usb) => USB_FILTERS.some((f) => f.vendorId === usb.vendorId && f.productId === usb.productId))
      .filter((usb) => !isPicoBootloader(usb) && !isCh340(usb));
    for (const usb of known) {
      try { if (await session.reconnect(usb)) break; } catch { /* the next one */ }
    }
  }
  if (!session.liveMode) {
    toast(t('Connect your controller or dongle first, then use the shortcut again.'), { tone: 'yellow', timeout: 7000 });
    return;
  }
  if (session.liveMode !== mode) await run(mode);
}

/** The shortcuts open ./?mode=…: in a new window or, with the app open, through launchQueue. */
function onLaunch(url) {
  const mode = new URL(url, location.href).searchParams.get('mode');
  if (!mode) return;
  const clean = new URL(location.href);
  clean.searchParams.delete('mode');
  history.replaceState(history.state, '', clean);
  switchFromShortcut(mode);
}

if ('launchQueue' in window) window.launchQueue.setConsumer((params) => params.targetURL && onLaunch(params.targetURL));
else onLaunch(location.href);
