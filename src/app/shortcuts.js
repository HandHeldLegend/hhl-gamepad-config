/**
 * shortcuts.js: The taskbar shortcuts (manifest "shortcuts", opened through launchQueue): switch to a
 * settings profile, ./?profile=2 (1 to 4). Imported by shell.js for its launch handler.
 */
import { toast } from '../ui/overlay.js';
import { session } from '../device/session.js';
import { device, USB_FILTERS, isPicoBootloader, isCh340 } from '../device/hoja-device.js';
import { t } from '../i18n/index.js';

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

/**
 * The shortcuts open ./?profile=…: in a new window or, with the app open, through launchQueue. An old
 * ./?mode=… shortcut (the mode shortcuts are gone) is cleared from the address and does nothing.
 */
function onLaunch(url) {
  const params = new URL(url, location.href).searchParams;
  const profile = params.get('profile');
  if (!profile && !params.has('mode')) return;
  const clean = new URL(location.href);
  clean.searchParams.delete('mode');
  clean.searchParams.delete('profile');
  history.replaceState(history.state, '', clean);
  if (profile) profileFromShortcut(profile);
}

if ('launchQueue' in window) window.launchQueue.setConsumer((params) => params.targetURL && onLaunch(params.targetURL));
else onLaunch(location.href);
