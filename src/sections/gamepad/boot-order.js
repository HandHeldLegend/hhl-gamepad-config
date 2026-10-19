/**
 * boot-order.js: the Boot order card (Gamepad page). Where Auto mode looks, and in which order, on
 * firmware with gamepadConfig_s.auto_* (auto_order_version == AUTO_ORDER_VERSION).
 *
 *   Plugged in   the fixed order Auto checks (N64, SNES / NES, GameCube, then USB). On USB a Nintendo
 *                Switch that's found gets Switch mode; the fallback, for anything else, is chosen here:
 *                Steam, XInput, Slippi, or Switch (Switch mode every time)
 *   On battery   the dongle and the saved hosts, first to last: drag a row by its handle (or focus the
 *                handle and use the arrow keys) to reorder, and the switch leaves one out. Auto listens
 *                for a free dongle first either way, and takes it at its place in the list.
 *
 * Entries this controller can't use (no dongle link, no Wii mode) keep their place in the stored order
 * but aren't shown. Writes go through session.commit('gamepad') like the rest of the page.
 */
import { h } from '../../ui/dom.js';
import { card, segmented, toggle } from '../../ui/controls.js';
import { icon } from '../../ui/icons.js';
import { t, N_ } from '../../i18n/index.js';
import { LAYOUT } from '../../device/struct.js';
import { isPairedMac } from '../wireless/info.js';

const D = LAYOUT.defines || {};
const OFF = D.AUTO_HOST_OFF ?? 0x80;
const fmt = (name) => (LAYOUT.enums.core_reportformat_t || []).find((e) => e.name === `CORE_REPORTFORMAT_${name}`)?.value;

/** On battery: one entry per AUTO_HOST_* id. `mac` is the gamepad field holding its pairing. */
const HOSTS = [
  { id: D.AUTO_HOST_DONGLE, label: N_('Dongle'), icon: 'usb', requires: 'dongle', about: N_('A free HOJA dongle nearby, yours first') },
  { id: D.AUTO_HOST_SWITCH, label: 'Switch', icon: 'gamepad', mac: 'host_mac_switch' },
  { id: D.AUTO_HOST_WII, label: 'Wii', icon: 'motion', mac: 'host_mac_wii', requires: 'wii' },
  { id: D.AUTO_HOST_STEAM, label: 'Steam', icon: 'system', mac: 'host_mac_sinput', about: N_('Your PC or Steam Deck') },
];

/** Plugged in: what Auto checks for, in this order (USB comes last). */
const WIRED_STEPS = [
  { label: 'N64', requires: 'joybus' },
  { label: 'SNES / NES', requires: 'snes' },
  { label: 'GameCube', requires: 'joybus' },
];

/** What a computer gets over USB. Switch means every USB host gets Switch mode. */
const COMPUTER_MODES = [
  { name: 'SINPUT', label: 'Steam' },
  { name: 'XINPUT', label: 'XInput' },
  { name: 'SLIPPI', label: 'Slippi' },
  { name: 'SWPRO', label: 'Switch' },
];

/** The card, or null on firmware without a boot order. */
export function bootOrderCard(session, { tone } = {}) {
  const cfg = () => session.config.gamepad;
  if (D.AUTO_ORDER_VERSION == null || cfg().auto_order_version !== D.AUTO_ORDER_VERSION) return null;
  const caps = session.caps;
  const commit = () => session.commit('gamepad');

  // ---- Plugged in -------------------------------------------------------------------------------
  const computerOptions = COMPUTER_MODES.map((m) => ({ value: fmt(m.name), label: m.label })).filter((o) => o.value != null);
  const computerHint = h('p.bo-hint');
  const showComputerHint = (v) => {
    computerHint.textContent = v === fmt('SWPRO')
      ? t('Switch mode every time, whether a Switch is found or not.')
      : t('Used when no Nintendo Switch is found, such as on a computer.');
  };
  const computerValue = computerOptions.some((o) => o.value === cfg().auto_usb_computer) ? cfg().auto_usb_computer : fmt('SINPUT');
  showComputerHint(computerValue);

  const wiredSteps = WIRED_STEPS.filter((s) => caps[s.requires]);
  const wired = h('div.bo-col',
    h('div.bo-col-head', h('span.bo-col-title', icon('usb'), t('Plugged in')),
      h('span.bo-col-sub', t('In Auto mode, the controller checks for these in this order and uses the first it finds.'))),
    h('ol.bo-steps',
      wiredSteps.map((s, i) => h('li.bo-step',
        h('span.bo-node', String(i + 1)),
        h('div.bo-step-text', h('span.bo-step-name', s.label)))),
      h('li.bo-step.bo-step-usb',
        h('span.bo-node', String(wiredSteps.length + 1)),
        h('div.bo-step-text',
          h('span.bo-step-name', 'USB'),
          h('div.bo-usb',
            h('div.bo-usb-row',
              h('span.bo-usb-when', t('Nintendo Switch found')), icon('chevron-right'), h('span.bo-usb-fixed', 'Switch')),
            h('div.bo-usb-row.bo-usb-fallback',
              h('span.bo-usb-when', t('Otherwise (fallback)')), icon('chevron-right'),
              segmented({
                options: computerOptions, value: computerValue, tone, ariaLabel: t('Fallback mode on USB'),
                onChange: (v) => { cfg().auto_usb_computer = v; showComputerHint(v); commit(); },
              }))),
          computerHint))));

  // ---- On battery -------------------------------------------------------------------------------
  const shown = HOSTS.filter((x) => x.id != null && (!x.requires || caps[x.requires]));
  const list = h('ol.bo-list', { 'aria-label': t('Wireless order') });
  const live = h('span.sr-only', { 'aria-live': 'polite' });

  /** The stored order (ids with the off flag), each id once; anything else reads as the default. */
  const stored = () => {
    const bytes = [...(cfg().auto_wireless_order || [])];
    const ids = bytes.map((b) => b & ~OFF);
    const valid = HOSTS.every((x) => ids.filter((v) => v === x.id).length === 1);
    return valid ? bytes : HOSTS.map((x) => x.id);
  };
  const isOn = (id) => !(stored().find((b) => (b & ~OFF) === id) & OFF);

  /** Write the shown rows' order (with their on/off) back; hidden entries keep their place at the end. */
  function save() {
    const bytes = stored();
    const rows = [...list.children].map((li) => Number(li.dataset.id));
    const shownIds = new Set(rows);
    const flag = (id) => bytes.find((b) => (b & ~OFF) === id) & OFF;
    cfg().auto_wireless_order = [
      ...rows.map((id) => id | flag(id)),
      ...bytes.filter((b) => !shownIds.has(b & ~OFF)),
    ];
    commit();
    number();
  }

  function setOn(id, on) {
    cfg().auto_wireless_order = stored().map((b) => ((b & ~OFF) === id ? (on ? id : id | OFF) : b));
    commit();
    number();
  }

  /** Ranks for the rows that are on; off rows show a dash and dim. */
  function number() {
    let n = 0;
    for (const li of list.children) {
      const on = isOn(Number(li.dataset.id));
      li.dataset.on = String(on);
      li.querySelector('.bo-rank').textContent = on ? String(++n) : '–';
    }
  }

  const status = (x) => {
    if (!x.mac) return t(x.about);
    const paired = isPairedMac(cfg()[x.mac]);
    if (!paired) return t('Not paired, skipped');
    return x.about ? t(x.about) : t('Paired');
  };

  const rowFor = (x) => {
    const grip = h('button.bo-grip', {
      type: 'button', 'aria-label': t('Move {name}', { name: t(x.label) }),
      title: t('Drag to reorder, or use the arrow keys'),
    }, icon('menu'));
    const li = h('li.bo-row', { dataset: { id: String(x.id) } },
      grip,
      h('span.bo-rank'),
      h('span.bo-icon', icon(x.icon)),
      h('div.bo-row-text',
        h('span.bo-row-name', t(x.label)),
        h('span.bo-row-about', { dataset: { paired: String(!x.mac || isPairedMac(cfg()[x.mac])) } }, status(x))),
      toggle({ checked: isOn(x.id), tone, label: t('Use {name}', { name: t(x.label) }), onChange: (on) => setOn(x.id, on) }));
    dragOrder(li, grip, list, {
      onDrop: save,
      announce: (pos) => { live.textContent = t('{name}: {pos} of {count}', { name: t(x.label), pos, count: list.children.length }); },
    });
    return li;
  };

  const order = stored().map((b) => b & ~OFF);
  list.append(...order.map((id) => shown.find((x) => x.id === id)).filter(Boolean).map(rowFor));
  number();

  const wireless = caps.bluetooth && h('div.bo-col',
    h('div.bo-col-head',
      h('span.bo-col-title', icon('wireless'), t('On battery')),
      h('span.bo-col-sub', t('In Auto mode, the controller tries these in this order and uses the first that answers. Drag to change it.'))),
    list, live);

  return card({
    title: t('Boot order'),
    subtitle: t('Where Auto looks when the controller starts, and in which order.'),
    icon: 'sliders', tone, class: 'bo-card',
  }, h('div.bo-cols', wired, wireless));
}

// -------------------------------------------------------------------------------------------------
// Drag to reorder: pointer on the handle, or the arrow keys while it has focus. Rows that make room
// glide into place (FLIP); the dragged row follows the pointer. The dragged row itself never moves in
// the DOM (that would drop its pointer capture and the focus): its neighbours move around it.
// -------------------------------------------------------------------------------------------------

function dragOrder(li, grip, list, { onDrop, announce }) {
  const rowsOf = () => [...list.children];

  /** Run a DOM move with the other rows animating from where they were. */
  function flip(move) {
    const before = new Map(rowsOf().map((r) => [r, r.getBoundingClientRect().top]));
    move();
    for (const r of rowsOf()) {
      if (r === li) continue;
      const dy = before.get(r) - r.getBoundingClientRect().top;
      if (!dy) continue;
      r.style.transition = 'none';
      r.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => { r.style.transition = ''; r.style.transform = ''; });
    }
  }
  const upOne = () => { const prev = li.previousElementSibling; if (prev) list.insertBefore(prev, li.nextSibling); };
  const downOne = () => { const next = li.nextElementSibling; if (next) list.insertBefore(next, li); };

  grip.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!(dir < 0 ? li.previousElementSibling : li.nextElementSibling)) return;
    flip(dir < 0 ? upOne : downOne);
    announce(rowsOf().indexOf(li) + 1);
    onDrop();
  });

  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startIndex = rowsOf().indexOf(li);
    const anchor = e.clientY - li.getBoundingClientRect().top; // where on the row it was picked up
    li.classList.add('bo-dragging');

    const onMove = (ev) => {
      // Where the row would sit with no offset, then follow the pointer from there
      li.style.transform = '';
      const y = ev.clientY - anchor;
      const mid = y + li.offsetHeight / 2;
      const centre = (r) => r.getBoundingClientRect().top + r.offsetHeight / 2;
      // Past several rows in one move: swap until it settles
      for (let guard = 0; guard < 8; guard++) {
        const prev = li.previousElementSibling;
        const next = li.nextElementSibling;
        if (prev && mid < centre(prev)) flip(upOne);
        else if (next && mid > centre(next)) flip(downOne);
        else break;
      }
      li.style.transform = `translateY(${y - li.getBoundingClientRect().top}px)`;
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      grip.removeEventListener('lostpointercapture', onUp);
      li.classList.remove('bo-dragging');
      li.style.transform = '';
      const index = rowsOf().indexOf(li);
      if (index !== startIndex) { announce(index + 1); onDrop(); }
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
    grip.addEventListener('lostpointercapture', onUp);
  });
}
