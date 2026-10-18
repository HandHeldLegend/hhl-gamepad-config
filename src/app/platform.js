/**
 * platform.js: What iPhone and iPad can do, and the explainer shown to their visitors.
 *
 * Every browser on iPhone and iPad must use Apple's WebKit engine, which has neither WebUSB nor Web
 * Bluetooth. The free Bluefy browser adds Web Bluetooth, so there the app connects over Bluetooth as
 * anywhere else. USB (firmware updates, update mode) needs a computer with Chrome or Edge.
 *
 *   isIOS()           iPhone, iPod or iPad
 *   openInBluefy()    this page in Bluefy, or its App Store page when Bluefy isn't installed
 *   BLUEFY_STORE_URL  Bluefy on the App Store
 */
import { h } from '../ui/dom.js';
import { openDialog } from '../ui/overlay.js';
import { startDemo } from '../device/mock.js';
import { t } from '../i18n/index.js';

export const BLUEFY_STORE_URL = 'https://apps.apple.com/app/id1492822055';
/** If Bluefy opened, this page is hidden by then; otherwise it isn't installed. */
const BLUEFY_WAIT_MS = 1500;

/**
 * Bluefy's link for this page. Whether Bluefy wants the address percent-encoded isn't documented:
 * ?bluefyRaw=1 tries it as is, to compare both on a real iPad without a new build.
 */
export function bluefyLink(href = location.href) {
  const raw = new URLSearchParams(location.search).has('bluefyRaw');
  return raw ? `bluefy://open?url=${href}` : `bluefy://open?url=${encodeURIComponent(href)}`;
}

/**
 * Open this page in Bluefy. When the page is still showing after BLUEFY_WAIT_MS, Bluefy isn't installed:
 * go to the App Store (Safari may first show its own "address is invalid" alert; that can't be helped).
 */
export function openInBluefy() {
  let left = false;
  const away = () => { left = true; };
  const onVisibility = () => { if (document.visibilityState === 'hidden') left = true; };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', away, { once: true });
  location.href = bluefyLink();
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', away);
    if (!left && document.visibilityState === 'visible') location.href = BLUEFY_STORE_URL;
  }, BLUEFY_WAIT_MS);
}

/** iPhone, iPod or iPad (iPadOS reports a Mac user agent, so check for touch on "Macintosh"). */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Windows (by the browser's platform or user agent). */
export function isWindows() {
  return /Windows/i.test(navigator.userAgentData?.platform || '') || /Windows/.test(navigator.userAgent || '');
}

/** "How do I connect on iPhone/iPad?" dialog. */
export function explainIOS() {
  const bluefy = !!navigator.bluetooth; // already in Bluefy (or another browser with Web Bluetooth)
  return openDialog({
    title: t('Connecting on iPhone and iPad'), icon: 'info', tone: 'blue',
    body: [
      h('p', t('Every browser on iPhone and iPad uses Apple’s Safari engine, which can’t talk to Bluetooth or USB devices from a web page.')),
      h('p', h('strong', t('Bluetooth:')), ' ', bluefy
        ? t('this browser can do it. Connect your controller over Bluetooth to change its settings.')
        : t('the free Bluefy browser adds it. Open this app in Bluefy to connect your controller and change its settings.')),
      h('p', h('strong', t('USB:')), ' ', t('no iPhone or iPad browser supports it, so firmware updates need a computer with Chrome or Edge (Windows, Mac, Linux or ChromeOS), or Chrome on Android.')),
    ],
    actions: [
      { label: t('Try the demo'), variant: 'ghost', icon: 'play', onClick: () => { startDemo(); } },
      !bluefy && { label: t('Open in Bluefy'), variant: 'tonal', icon: 'bluetooth', onClick: () => { openInBluefy(); return false; } },
      { label: t('Got it'), variant: 'primary' },
    ].filter(Boolean),
  });
}
