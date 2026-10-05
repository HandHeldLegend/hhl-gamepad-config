/**
 * platform.js — Which devices can't use WebUSB, and the explainer shown to iPhone/iPad visitors.
 *
 * Every browser on iPhone and iPad must use Apple's WebKit engine, and WebKit doesn't implement
 * WebUSB (Apple has declined it over privacy/fingerprinting concerns). So no iOS browser can connect
 * to the controller, and nothing in this app can change that; the explainer says so plainly.
 */
import { h } from '../ui/dom.js';
import { openDialog } from '../ui/overlay.js';
import { startDemo } from '../device/mock.js';
import { t } from '../i18n/index.js';

/** iPhone, iPod or iPad (iPadOS reports a Mac user agent, so check for touch on "Macintosh"). */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** "Why can't I connect on iPhone/iPad?" dialog. */
export function explainIOS() {
  return openDialog({
    title: t('Why iPhone and iPad can’t connect'), icon: 'info', tone: 'blue',
    body: [
      h('p', t('This app talks to your controller through WebUSB, a browser feature that lets a web page connect to a USB device you pick.')),
      h('p', t('Apple has chosen not to support WebUSB, citing privacy and security. Every browser on iPhone and iPad — Chrome, Edge and Firefox included — has to use Apple’s Safari engine, so none of them can offer it.')),
      h('p', h('strong', t('This is out of our hands.')), ' ', t('It’s Apple’s decision, and they haven’t announced any plans to change it. If that changes, this app will work on iPhone and iPad without an update on your side.')),
      h('p', t('To change your controller’s settings:')),
      h('ul',
        h('li', t('Use Chrome or Edge on a Windows, Mac, Linux or ChromeOS computer.')),
        h('li', t('Or use Chrome on an Android phone or tablet with a USB cable.'))),
    ],
    actions: [
      { label: t('Try the demo'), variant: 'ghost', icon: 'play', onClick: () => { startDemo(); } },
      { label: t('Got it'), variant: 'primary' },
    ],
  });
}
