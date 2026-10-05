/**
 * popover.js — Light, non-modal popover that holds the input editor next to the tile that opened it.
 *
 *   - No backdrop: the page stays visible and usable; the tile stays highlighted (aria-current).
 *   - Wide screens: anchored beside the tile (right, else left), else below/above it. It shifts and
 *     shrinks (content scrolls) to stay on screen and never covers the tile. Re-placed every frame
 *     while open (`track()`), so scrolling, resizing and layout changes keep it attached.
 *   - Phones (< 640px): a bottom sheet with a grab handle (drag down to close) and a max height, so
 *     part of the grid stays visible; the page scrolls the tile above the sheet.
 *   - Closes on Escape (preventDefault, so the shell doesn't go Home), outside click, the close
 *     button or a downward drag: the owner gets `onDismiss({ returnFocus })` and calls `hide()`.
 *   - role="dialog" + aria-labelledby; focus moves in on show and (if asked) back to the tile on hide.
 *
 * Uses popover="manual" (top layer, so no ancestor transform or overflow can clip it) when supported.
 */
import { h } from '../../ui/dom.js';
import { button } from '../../ui/controls.js';
import { icon } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';

const SHEET = '(max-width: 639.98px)';
const MARGIN = 12; // min distance from the viewport edges
const GAP = 8; // distance from the tile
const WIDTH = 380;
let uid = 0;

/**
 * @param {{onDismiss: (o: {returnFocus: boolean}) => void,
 *          ignore?: string}} o  `ignore`: selector of elements whose clicks are not "outside" (the tiles).
 */
export function createPopover(o) {
  const titleId = `inp-pop-title-${++uid}`;
  const titleEl = h('h2.inp-pop-title', { id: titleId });
  const body = h('div.inp-pop-body');
  const grab = h('div.inp-pop-grab', { 'aria-hidden': 'true' });
  const head = h('div.inp-pop-head', h('span.inp-pop-art', icon('input')), titleEl,
    button({ icon: 'close', variant: 'ghost', size: 'sm', title: t('Close editor'), onClick: () => o.onDismiss({ returnFocus: true }) }));
  const el = h('div.inp-pop.tone-lavender', { role: 'dialog', 'aria-labelledby': titleId, tabindex: '-1', hidden: true },
    grab, head, body);
  const usePopover = typeof el.showPopover === 'function';
  if (usePopover) { el.hidden = false; el.setAttribute('popover', 'manual'); }
  const sheetMq = matchMedia(SHEET);

  let anchor = null;
  let open = false;
  let last = '';
  let shownAt = 0;

  // ---- Placement -------------------------------------------------------------------------------

  function place() {
    if (!open || !anchor) return;
    const sheet = sheetMq.matches;
    el.classList.toggle('sheet', sheet);
    // Shortly after opening, the page may still be settling (deep link on load): keep the tile in view.
    const age = performance.now() - shownAt;
    if (age > 700 && age < 1600 && !tileVisible()) reveal(false);
    if (sheet) {
      if (last !== 'sheet') { last = 'sheet'; for (const p of ['left', 'top', 'width', 'maxHeight']) el.style[p] = ''; }
      return;
    }
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = Math.min(WIDTH, vw - 2 * MARGIN);
    // Natural height: what it would take without a max-height (the body scrolls when capped).
    const natural = head.offsetHeight + body.scrollHeight + 2;
    const right = vw - r.right - GAP - MARGIN;
    const left = r.left - GAP - MARGIN;
    const full = vh - 2 * MARGIN;
    let x; let y; let maxH;
    if (right >= w || left >= w) {
      x = right >= w ? r.right + GAP : r.left - GAP - w;
      maxH = full;
      const hgt = Math.min(natural, maxH);
      y = Math.max(MARGIN, Math.min(r.top - 8, vh - MARGIN - hgt)); // line up with the tile's top
    } else {
      const below = vh - r.bottom - GAP - MARGIN;
      const above = r.top - GAP - MARGIN;
      const down = below >= natural || (above < natural && below >= above);
      maxH = Math.max(160, down ? below : above);
      const hgt = Math.min(natural, maxH);
      y = down ? r.bottom + GAP : r.top - GAP - hgt;
      x = Math.max(MARGIN, Math.min(r.left + r.width / 2 - w / 2, vw - MARGIN - w));
    }
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(maxH)}`;
    if (key === last) return;
    last = key;
    Object.assign(el.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, width: `${Math.round(w)}px`, maxHeight: `${Math.round(maxH)}px` });
  }

  /** Bottom edge of the area the tile may use: above the sheet on phones, the viewport otherwise. */
  const usableBottom = () => (sheetMq.matches ? el.getBoundingClientRect().top - GAP : window.innerHeight);
  function tileVisible() {
    const r = anchor.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= usableBottom();
  }

  /**
   * Scroll the page so the tile is on screen — above the sheet on phones (padding at the bottom of the
   * page makes room to scroll the last tiles up).
   */
  function reveal(smooth) {
    if (!anchor) return;
    const host = el.parentElement;
    if (host) host.style.paddingBottom = sheetMq.matches ? `${Math.ceil(el.offsetHeight)}px` : '';
    if (tileVisible()) return;
    const r = anchor.getBoundingClientRect();
    const bottom = usableBottom();
    const room = bottom - r.height;
    // Center the tile in the space left visible (or as low as fits).
    const target = Math.max(MARGIN, room / 2);
    window.scrollBy({ top: r.top - target, behavior: smooth ? 'smooth' : 'instant' });
  }

  // ---- Show / hide -------------------------------------------------------------------------------

  /**
   * Show (or move) the popover for `tile`. Waits a frame when the page isn't attached yet (deep link
   * on load); `focus` is the element to focus inside (defaults to the popover itself).
   */
  function show(tile, { title, content, focus }) {
    anchor = tile;
    titleEl.textContent = title;
    body.replaceChildren(content);
    body.scrollTop = 0;
    const start = () => {
      if (anchor !== tile) return;
      if (!el.isConnected || !tile.isConnected) { requestAnimationFrame(start); return; }
      if (!open) {
        open = true;
        if (usePopover) { try { el.showPopover(); } catch { /* already open */ } } else el.hidden = false;
        el.classList.remove('leaving');
        document.addEventListener('pointerdown', onOutside, true);
        window.addEventListener('keydown', onKey, true);
      }
      shownAt = performance.now();
      last = '';
      place();
      reveal(sheetMq.matches); // bring the tile on screen (deep link to an input further down the page)
      place();
      (focus?.isConnected ? focus : el).focus({ preventScroll: true });
    };
    start();
  }

  function hide({ returnFocus = false } = {}) {
    const tile = anchor;
    anchor = null;
    if (!open) return;
    open = false;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('keydown', onKey, true);
    if (el.parentElement) el.parentElement.style.paddingBottom = '';
    if (usePopover) { try { el.hidePopover(); } catch { /* not open */ } } else el.hidden = true;
    body.replaceChildren();
    if (returnFocus && tile?.isConnected) tile.focus({ preventScroll: true });
  }

  // ---- Dismissal ---------------------------------------------------------------------------------

  function onOutside(e) {
    const tgt = e.target;
    const root = document.documentElement;
    if (el.contains(tgt) || e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) return; // inside, or a scrollbar
    if (tgt.closest?.(`${o.ignore || '.never'}, .tip-bubble, .toasts, dialog[open]`)) return;
    o.onDismiss({ returnFocus: false });
  }

  function onKey(e) {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    e.preventDefault(); // the shell would go Home otherwise
    e.stopPropagation();
    o.onDismiss({ returnFocus: true });
  }

  // Drag the sheet down by its handle/header to close it.
  let drag = null;
  const onDragStart = (e) => {
    if (!el.classList.contains('sheet') || e.target.closest('button')) return;
    drag = { y: e.clientY, id: e.pointerId, dy: 0 };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  };
  el.addEventListener('pointerdown', (e) => { if (grab.contains(e.target) || head.contains(e.target)) onDragStart(e); });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    el.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
  });
  const onDragEnd = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy } = drag;
    drag = null;
    el.classList.remove('dragging');
    el.style.transform = '';
    if (dy > 80) o.onDismiss({ returnFocus: true });
  };
  el.addEventListener('pointerup', onDragEnd);
  el.addEventListener('pointercancel', onDragEnd);

  return {
    el,
    /** Re-place the popover (call every animation frame while open). */
    track: place,
    show,
    hide,
    get isOpen() { return open; },
    destroy() { hide(); el.remove(); },
  };
}
