/**
 * shell.js (The app frame): app bar, navigation, and page mounting.
 *
 * Layout
 *   ≥ 960px : app bar + persistent sidebar + page
 *   < 960px : app bar + page; Home shows the section grid, other pages get a back button
 *
 * Page lifecycle
 *   The router reports a route → the shell finds the section in registry.js → lazy-imports its
 *   view → calls view.mount(root, ctx). Device pages are only mounted while a controller is
 *   connected and has the required capability; otherwise a friendly empty state is shown.
 *   Leaving a device page flushes pending writes and refreshes the attention badges (like hoja2).
 *
 * Language changes rebuild the frame and remount the current page in place, so the controller
 * connection and any unsaved changes survive (src/i18n/index.js).
 */
import { h, replace } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, emptyState, dot, face } from '../ui/controls.js';
import { toast, confirmDialog } from '../ui/overlay.js';
import { SECTIONS, GROUPS, getSection } from '../sections/registry.js';
import { session } from '../device/session.js';
import { device } from '../device/hoja-device.js';
import { isDemo, startDemo } from '../device/mock.js';
import { onRoute, currentRoute, navigate, setParams } from './router.js';
import { prefs } from './prefs.js';
import { pwa } from './pwa.js';
import { isIOS, explainIOS } from './platform.js';
import { isLinux, explainLinux } from './linux.js';
import { applyFromRoute } from '../settings/apply.js';
import { t, i18n, LANGUAGES, detectLanguage, setLanguage } from '../i18n/index.js';

const WIDE = matchMedia('(min-width: 960px)');

/**
 * App bar language picker: a globe with the current language's short name over a native <select>
 * (keyboard, screen reader and phone pickers for free). Its label is in every supported language, so
 * anyone can find it whatever language the app is showing.
 */
function languagePicker() {
  const SHORT = { en: 'EN', es: 'ES', ja: '日本語', fr: 'FR' };
  const label = 'Language · Idioma · 言語 · Langue';
  const auto = LANGUAGES.find((l) => l.code === detectLanguage());
  const sel = h('select.lang-pick-select', { 'aria-label': label, title: label, onchange: (e) => setLanguage(e.target.value) },
    h('option', { value: 'auto' }, t('Automatic ({language})', { language: auto.native })),
    LANGUAGES.map((l) => h('option', { value: l.code, lang: l.code }, l.native)));
  // A ?lang= link shows that language; otherwise the saved choice (or Automatic).
  sel.value = new URLSearchParams(location.search).get('lang') ? i18n.lang : (prefs.get('language') || 'auto');
  return h('div.lang-pick', icon('globe'), h('span.lang-pick-code', { 'aria-hidden': 'true' }, SHORT[i18n.lang] || i18n.lang.toUpperCase()), sel);
}

/** Small "BETA" pill for sections marked beta in registry.js. */
export function betaBadge() {
  return h('span.beta-badge', { title: t('This feature is in beta and may change.') }, t('BETA'));
}

/** Is a section usable right now? Returns null when available, otherwise a (translated) reason. */
export function unavailableReason(section) {
  if (!section.device) return null;
  if (!session.connected) return t('Connect a controller to use this page.');
  if (section.requires && !session.caps[section.requires]) return t('This controller doesn’t have this hardware.');
  return null;
}

/**
 * What the connected controller is running as right now, from its USB IDs (translated), or null.
 * Only two output modes talk to this app over USB (HOJA-LIB-RP2040 descriptors):
 *   057e:2009          Switch mode (Nintendo Switch Pro Controller descriptor, ns_lib_hid.c)
 *   2e8a:<board PID>   Steam mode (SInput; 0x10C6 generic, or the board's own usb_pid, core_sinput.c)
 * XInput (045e:028e), Slippi (057e:0337) and the console modes can't be reached from the app.
 */
export function currentModeLabel() {
  if (!session.connected) return null;
  if (isDemo()) return t('Demo mode');
  const usb = device.usbDevice;
  if (!usb) return null;
  if (usb.vendorId === 0x057e && usb.productId === 0x2009) return t('Switch mode');
  if (usb.vendorId === 0x2e8a) return t('Steam mode');
  return null;
}

/** Shared connect flow used by the app bar, Home and empty states. */
export async function connectController() {
  if (!navigator.usb && !isDemo()) {
    if (isIOS()) { explainIOS(); return false; }
    toast(t('This browser can’t talk to USB devices. Use Chrome or Edge on desktop or Android.'), { tone: 'red', timeout: 6000 });
    return false;
  }
  try {
    // No "connected" toast: the app bar chip and Home already show the controller and its mode.
    const ok = await session.connect();
    // Some firmware doesn't serve every settings block; the app connects anyway (see device.missing).
    const missing = device.missing?.config || [];
    if (ok === true && missing.length) {
      toast(t('Connected, but this controller didn’t send some settings ({blocks}). Those stay unchanged on the controller. A firmware update usually fixes this.', { blocks: missing.join(', ') }),
        { tone: 'yellow', timeout: 10000 });
    }
    return ok;
  } catch (err) {
    console.error(err);
    // On Linux, "Access denied" almost always means the udev rule is missing (see linux.js).
    if (isLinux() && /Access denied|SecurityError/i.test(`${err?.name} ${err?.message}`)) {
      toast(t('Linux blocked access to the controller. A one-time udev rule fixes this.'),
        { tone: 'red', timeout: 12000, action: { label: t('Linux setup'), onClick: () => explainLinux() } });
      return false;
    }
    toast(err?.message?.includes('Access denied')
      ? t('The controller is busy in another tab or app. Close it and try again.')
      : t('Couldn’t connect. Unplug the controller, hold A or B while plugging it back in, then try again.'), { tone: 'red', timeout: 7000 });
    return false;
  }
}

export function createShell(root) {
  // Frame elements; (re)created by build() so a language change can redraw every label.
  let chipDot; let chipName; let chipSub; let chip;
  let saveBtn; let connectBtn; let installBtn;
  let page; let main; let frame;
  const navLinks = new Map();

  function build() {
    // ---- App bar -----------------------------------------------------------------------
    const brand = h('a.brand', { href: '#/', 'aria-label': t('HHL Gamepad Config, home') },
      h('img.brand-mark', { src: 'assets/icons/app/icon-96.png', alt: '', width: 32, height: 32 }),
      h('span.brand-text', h('strong', 'HHL'), ' Gamepad Config'));

    chipDot = dot('lavender');
    chipName = h('span.chip-name');
    chipSub = h('span.chip-sub');
    chip = h('button.device-chip', { type: 'button', onclick: () => navigate('home') }, chipDot, h('span.chip-text', chipName, chipSub));

    saveBtn = button({ label: t('Save'), icon: 'save', variant: 'tonal', title: t('Save settings to the controller'), onClick: onSave });
    saveBtn.classList.add('save-btn');
    connectBtn = button({ label: t('Connect'), icon: 'usb', variant: 'primary', onClick: onConnectClick });
    connectBtn.classList.add('connect-btn');
    installBtn = button({ label: t('Install'), icon: 'install', variant: 'ghost', title: t('Install as an app'), onClick: () => pwa.promptInstall() });
    installBtn.classList.add('install-btn');
    installBtn.hidden = !pwa.canInstall;
    const settingsBtn = button({ icon: 'settings', variant: 'ghost', title: t('App settings'), onClick: () => navigate('settings') });
    settingsBtn.classList.add('appbar-settings');

    const appbar = h('header.appbar', brand, h('div.spacer'), chip, installBtn, saveBtn, connectBtn, languagePicker(), settingsBtn);

    // ---- Sidebar -------------------------------------------------------------------------
    const nav = h('nav.sidebar', { 'aria-label': t('Sections') });
    navLinks.clear();
    for (const g of GROUPS) {
      const items = SECTIONS.filter((s) => s.group === g.id);
      if (!items.length) continue;
      nav.append(h('div.nav-group', g.id !== 'start' && h('div.nav-group-title', t(g.title)),
        items.map((s) => {
          const a = h('a.nav-link', { href: `#/${s.id === 'home' ? '' : s.id}`, class: `tone-${s.tone}`, dataset: { section: s.id } },
            h('span.nav-icon', icon(s.icon)), h('span.nav-label', h('span.nav-text', t(s.title)), s.beta && betaBadge()), h('span.nav-badge'));
          navLinks.set(s.id, a);
          return a;
        })));
    }
    nav.append(h('div.nav-foot', h('span.sfc-dots', h('i'), h('i'), h('i'), h('i')), h('span.faint.xs', 'Hand Held Legend')));

    page = h('div.page');
    main = h('main.main', { id: 'main' }, page);
    frame = h('div.app', { class: WIDE.matches ? 'wide' : null }, appbar, nav, main);
    replace(root, frame);
  }

  // ---- State → UI ------------------------------------------------------------------------
  function renderChrome() {
    const st = session.state;
    const connected = st === 'connected';
    chipDot.className = `dot tone-${connected ? 'green' : st === 'connecting' ? 'yellow' : st === 'legacy' ? 'red' : 'lavender'}${connected ? ' live' : ''}`;
    chipName.textContent = connected ? session.info.name : st === 'legacy' ? t('Legacy firmware') : t('No controller');
    const mode = currentModeLabel(); // e.g. "Switch mode": what the controller is running as right now
    chipSub.textContent = connected ? (mode || t('Connected')) : st === 'connecting' ? t('Connecting…') : t('Not connected');
    chip.title = mode ? t('Running in {mode}', { mode }) : '';
    chip.classList.toggle('demo', isDemo());

    connectBtn.setLabel(connected || st === 'legacy' ? t('Disconnect') : st === 'connecting' ? t('Connecting…') : t('Connect'));
    connectBtn.className = `btn connect-btn ${connected || st === 'legacy' ? 'btn-ghost' : 'btn-primary'}`;
    connectBtn.querySelector('use').setAttribute('href', connectBtn.querySelector('use').getAttribute('href').replace(/#i-.*/, connected ? '#i-unplug' : '#i-usb'));
    connectBtn.disabled = st === 'connecting';

    saveBtn.disabled = !connected;
    const dirty = session.dirty.size > 0;
    saveBtn.classList.toggle('dirty', dirty);
    saveBtn.querySelector('.pip')?.remove();
    if (dirty) saveBtn.append(h('span.pip.motion-ok'));
    saveBtn.title = dirty ? t('You have unsaved changes: save them to the controller') : t('Save settings to the controller');

    for (const s of SECTIONS) {
      const a = navLinks.get(s.id);
      const reason = unavailableReason(s);
      a.classList.toggle('disabled', !!reason && session.connected);
      a.classList.toggle('waiting', !!reason && !session.connected);
      a.title = reason || t(s.summary);
      const att = session.attention[s.id];
      const b = a.querySelector('.nav-badge');
      b.className = `nav-badge${att ? ` tone-${att.level === 'warn' ? 'yellow' : 'blue'} on` : ''}`;
      b.title = att ? t(att.text) : '';
    }
  }

  async function onConnectClick() {
    if (session.state === 'connected' || session.state === 'legacy') {
      if (session.dirty.size && !await confirmDialog({
        title: t('Disconnect without saving?'), confirmLabel: t('Disconnect'), danger: true,
        message: t('You have unsaved changes. Disconnect anyway? They will be lost when the controller powers off.'),
      })) return;
      await session.disconnect(); // the chip shows "No controller"; no toast needed
    } else {
      await connectController();
    }
  }

  async function onSave() {
    saveBtn.disabled = true;
    saveBtn.dataset.state = 'busy';
    const ok = await session.save().catch(() => false);
    saveBtn.disabled = !session.connected;
    renderChrome();
    // Success shows on the button itself (green check + "Saved"); only a failure needs a toast.
    if (ok) {
      saveBtn.dataset.state = 'ok';
      saveBtn.setLabel(t('Saved'));
      saveBtn.querySelector('use')?.setAttribute('href', saveBtn.querySelector('use').getAttribute('href').replace(/#i-.*/, '#i-check'));
      clearTimeout(onSave.timer);
      onSave.timer = setTimeout(() => {
        delete saveBtn.dataset.state;
        saveBtn.setLabel(t('Save'));
        saveBtn.querySelector('use')?.setAttribute('href', saveBtn.querySelector('use').getAttribute('href').replace(/#i-.*/, '#i-save'));
      }, 1600);
    } else {
      delete saveBtn.dataset.state;
      toast(t('Save failed: check the connection and try again'), { tone: 'red', timeout: 5000 });
    }
  }

  // ---- Pages -----------------------------------------------------------------------------
  let mounted = null; // { section, cleanup, update, key }
  let renderToken = 0;

  function teardown() {
    if (!mounted) return;
    const { cleanup, section } = mounted;
    try { cleanup?.(); } catch (err) { console.error('[shell] cleanup failed', err); }
    mounted = null;
    if (section.device && session.connected) {
      session.flush().catch(() => {});
      session.refreshAttention();
    }
  }

  function pageHeader(section) {
    const showBack = section.id !== 'home';
    return h('header.page-head', { class: `tone-${section.tone}` },
      showBack && button({ icon: 'back', variant: 'ghost', title: t('Back to home'), onClick: () => navigate('home') }),
      section.id !== 'home' && face(section.icon, section.tone, 44),
      h('div.page-titles', h('h1', t(section.title), section.beta && betaBadge()), h('p.muted', t(section.summary))),
      h('div.page-head-extra'));
  }

  async function render(route) {
    if (route.section === 'apply') {
      await applyFromRoute(route);
      return;
    }
    const section = getSection(route.section) || getSection('home');
    const token = ++renderToken;
    const reason = unavailableReason(section);
    const key = `${section.id}|${reason || 'ok'}|${session.state}|${i18n.lang}`;

    // Same page, only params changed → let the view handle it without remounting.
    if (mounted && mounted.key === key && mounted.update) { mounted.update(route.params); return; }

    teardown();
    for (const [id, a] of navLinks) a.toggleAttribute('aria-current', id === section.id);
    frame.dataset.page = section.id;
    document.title = section.id === 'home' ? 'HHL Gamepad Config' : `${t(section.title)} · HHL Gamepad Config`;

    const content = h('div.page-body');
    replace(page, pageHeader(section), content);
    page.classList.remove('page-enter'); void page.offsetWidth; page.classList.add('page-enter');
    main.scrollTo({ top: 0 });

    if (reason) {
      content.append(session.connected
        ? emptyState({ icon: section.icon, tone: section.tone, title: t('Not available on this controller'), text: reason,
          action: button({ label: t('Back to home'), variant: 'tonal', onClick: () => navigate('home') }) })
        : emptyState({ icon: 'usb', tone: section.tone, title: t('Connect your controller'), text: t('Plug in your controller with a USB data cable, then press Connect.'),
          action: h('div.row', { style: { justifyContent: 'center' } },
            button({ label: t('Connect controller'), icon: 'usb', variant: 'primary', size: 'lg', onClick: connectController }),
            button({ label: t('Try the demo'), icon: 'play', variant: 'ghost', onClick: () => startDemo() })) }));
      mounted = { section, key, cleanup: null };
      return;
    }

    let view;
    try {
      view = await section.load();
    } catch (err) {
      console.error(`[shell] failed to load ${section.id}`, err);
      content.append(emptyState({ icon: 'warning', tone: 'red', title: t('This page failed to load'), text: String(err?.message || err),
        action: button({ label: t('Reload app'), icon: 'refresh', variant: 'tonal', onClick: () => location.reload() }) }));
      return;
    }
    if (token !== renderToken) return; // user navigated away while loading

    const ctx = {
      session, device, section, params: route.params, sub: route.sub,
      navigate, setParams,
      header: page.querySelector('.page-head-extra'),
    };
    let result;
    try {
      result = view.mount(content, ctx);
    } catch (err) {
      console.error(`[shell] ${section.id} mount failed`, err);
      content.append(emptyState({ icon: 'warning', tone: 'red', title: t('Something went wrong'), text: String(err?.message || err) }));
    }
    mounted = {
      section, key,
      cleanup: typeof result === 'function' ? result : result?.destroy?.bind(result),
      update: typeof result === 'object' && result?.update ? result.update.bind(result) : null,
    };
    if (section.id !== 'home' && section.id !== 'apply') prefs.set('lastSection', section.id);
  }

  // ---- Wiring (registered once; build() can run again) ------------------------------------
  build();

  // Remount when connection state or capabilities change (e.g. device page becomes usable).
  session.on('state', () => { renderChrome(); render(currentRoute()); });
  session.on('dirty', renderChrome);
  session.on('attention', renderChrome);
  pwa.on('installable', (can) => { installBtn.hidden = !can; });
  onRoute((route) => render(route));

  // Language changed: redraw the frame and remount the page in the new language.
  i18n.onChange(() => {
    teardown();
    build();
    renderChrome();
    render(currentRoute());
  });

  // Escape returns home from a section (like hoja2), unless a dialog is open.
  // Views can claim Escape first (e.g. to close a side panel) by calling event.preventDefault().
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]') && currentRoute().section !== 'home'
      && !e.target.closest?.('input, textarea, select')) navigate('home');
  });

  WIDE.addEventListener('change', () => frame.classList.toggle('wide', WIDE.matches));

  // Warn before closing the tab with unsaved changes.
  window.addEventListener('beforeunload', (e) => {
    if (session.dirty.size) { e.preventDefault(); e.returnValue = ''; }
  });

  renderChrome();
  render(currentRoute());
  return { renderChrome };
}
