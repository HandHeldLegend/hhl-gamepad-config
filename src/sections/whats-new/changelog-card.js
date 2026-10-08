/**
 * changelog-card.js: The firmware changelog on the What's new page.
 *
 * Shows CHANGELOG.md from hoja-device-fw (parsed by src/firmware/changelog.js), newest first,
 * grouped by section, with a section filter. With a controller connected it shows that build's
 * changes and marks releases newer than its firmware; a switch widens it to every controller.
 * The newest release (and any the connected controller hasn't installed) is shown in full; older ones
 * are compact rows that expand in place.
 * Deep link: #/whats-new?changes=<section id> opens it filtered.
 */
import { h, replace } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { card, callout, badge, segmented, toggle } from '../../ui/controls.js';
import { setParams } from '../../app/router.js';
import { humanizeBuildId } from '../../firmware/builds.js';
import {
  loadChangelog, filterChangelog, sectionsWithChanges, isNewerThanInstalled, buildIdFromManifestUrl, inlineRuns,
  CHANGE_SECTIONS, CHANGE_KINDS,
} from '../../firmware/changelog.js';
import { t, plural, fmt } from '../../i18n/index.js';

export const WHATS_NEW_CSS = `
  .whats-new-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
  .whats-new-controls .seg { max-width: 100%; }
  .whats-new-scope { display: inline-flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--text-muted); }
  .whats-new-list { display: grid; gap: var(--space-4); margin-top: var(--space-4); }
  .wn-release-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .wn-release-date { font-weight: 700; }
  .wn-release-title { color: var(--text-muted); }
  .wn-group { margin: 8px 0 0; }
  .wn-group-title { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-sm); font-weight: 700;
    color: var(--text); text-decoration: none; }
  .wn-group-title:hover { color: var(--blue); }
  .wn-list { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 6px; }
  .wn-change { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: baseline; font-size: var(--text-sm); }
  .wn-change .badge { justify-self: start; }
  .wn-scope { display: block; color: var(--text-muted); font-size: var(--text-xs, 0.75rem); margin-top: 2px; }
  .wn-change code { font-family: var(--font-mono, monospace); font-size: 0.95em; }
  .wn-release + .wn-release { border-top: 1px solid var(--border); padding-top: var(--space-4); }
  .wn-older-title { margin: var(--space-2) 0 0; font-size: var(--text-xs, 0.75rem); font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-muted); }
  .wn-older-list { display: grid; gap: 6px; }
  .wn-older { border-radius: var(--radius-md); background: var(--surface-2); }
  .wn-older > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 12px; border-radius: var(--radius-md); font-size: var(--text-sm); }
  .wn-older > summary::-webkit-details-marker { display: none; }
  .wn-older > summary:hover { background: var(--surface-3); }
  .wn-older > summary .icon { width: 16px; height: 16px; color: var(--text-muted); transition: transform var(--dur-med) var(--ease-out); }
  .wn-older[open] > summary .icon { transform: rotate(90deg); }
  .wn-older .wn-count { margin-left: auto; color: var(--text-muted); font-size: var(--text-xs, 0.75rem); }
  .wn-older > .wn-older-body { padding: 4px 12px 12px; }
  @media (max-width: 560px) {
    .wn-change { grid-template-columns: 1fr; gap: 2px; }
    .wn-list { gap: 10px; }
  }
`;

/** "GC Ultimate 1 and ProGCC 3": friendly names, each once (renamed builds share a name). */
const boardList = (boards) => fmt.list([...new Set([...boards].map(humanizeBuildId))]);

const sectionInfo = (id) => CHANGE_SECTIONS.find((s) => s.id === id);

function entryText(text) {
  return inlineRuns(text).map((r) => (r.code ? h('code', r.text) : r.text));
}

function renderRelease(release, { section, installedVersion, showScope, compact = false, open = false, onToggle }) {
  const isNew = installedVersion != null && isNewerThanInstalled(release, installedVersion);
  const date = fmt.date(new Date(`${release.date}T00:00:00Z`), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const order = CHANGE_SECTIONS.map((s) => s.id).filter((id) => release.entries.some((e) => e.section === id));

  const item = (e) => h('li.wn-change',
    badge(t(CHANGE_KINDS[e.kind].label), CHANGE_KINDS[e.kind].tone),
    h('span', entryText(e.text),
      showScope && e.boards && e.boards.size < (release.boards?.size ?? Infinity) && h('span.wn-scope',
        t('Only on {boards}', { boards: boardList(e.boards) }))));

  const changes = section
    ? h('ul.wn-list', release.entries.map(item))
    : order.map((id) => {
      const s = sectionInfo(id);
      return h('div.wn-group',
        h('a.wn-group-title', { href: `#/${s.page}` }, icon(s.icon), t(s.title)),
        h('ul.wn-list', release.entries.filter((e) => e.section === id).map(item)));
    });

  // Older release: one compact row; tap to expand.
  if (compact) {
    const short = fmt.date(new Date(`${release.date}T00:00:00Z`), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const el = h('details.wn-older', { open },
      h('summary', icon('chevron-right'),
        h('span.wn-release-date', short),
        release.title && h('span.wn-release-title', release.title),
        isNew && badge(t('Not installed yet'), 'blue'),
        h('span.wn-count', plural(release.entries.length, '{n} change', '{n} changes'))),
      h('div.wn-older-body',
        showScope && release.boards && h('span.wn-scope', t('Only on {boards}', { boards: boardList(release.boards) })),
        changes));
    el.addEventListener('toggle', () => onToggle?.(el.open));
    return el;
  }

  return h('article.wn-release',
    h('div.wn-release-head',
      h('span.wn-release-date', date),
      release.title && h('span.wn-release-title', release.title),
      showScope && release.boards && h('span.wn-scope', t('Only on {boards}', { boards: boardList(release.boards) })),
      isNew && badge(t('Not installed yet'), 'blue')),
    // Filtered to one section: a flat list. Otherwise grouped, each group linking to its page.
    changes);
}

/** @param {{ session, params }} ctx */
export function whatsNewCard({ session, params }) {
  const body = h('div', h('span.muted.small', t('Loading…')));
  const state = {
    log: null,
    offline: false,
    section: CHANGE_SECTIONS.some((s) => s.id === params.changes) ? params.changes : null,
    everyController: false,
    opened: new Set(), // older releases the reader expanded (kept across re-renders)
  };

  const connectedBuild = () => (session.connected ? buildIdFromManifestUrl(session.info?.manifestUrl) : null);

  function render() {
    if (!state.log) return;
    const build = connectedBuild();
    const buildId = state.everyController ? null : build;
    const sections = sectionsWithChanges(state.log, buildId);
    if (state.section && !sections.some((s) => s.id === state.section)) state.section = null;
    const releases = filterChangelog(state.log, { buildId, section: state.section });

    const filter = segmented({
      ariaLabel: t('Filter changes by section'),
      value: state.section || 'all',
      tone: 'lavender',
      options: [{ value: 'all', label: t('All') }, ...sections.map((s) => ({ value: s.id, label: t(s.title), icon: s.icon }))],
      onChange: (v) => { state.section = v === 'all' ? null : v; setParams({ changes: state.section }); render(); },
    });

    replace(body,
      state.offline && callout({ tone: 'yellow', text: t('You’re offline. Showing the last saved copy.') }),
      h('div.whats-new-controls',
        sections.length > 1 && filter,
        build && h('label.whats-new-scope',
          toggle({ checked: state.everyController, label: t('All controllers'), onChange: (v) => { state.everyController = v; render(); } }),
          t('All controllers'))),
      releases.length ? releaseList(releases, buildId) : h('p.muted', t('Nothing listed here yet.')));
  }

  /** Newest release in full, plus any the controller hasn't installed; the rest as compact rows. */
  function releaseList(releases, buildId) {
    const installedVersion = buildId ? session.info?.fwVersion : null;
    const opts = { section: state.section, installedVersion, showScope: !buildId };
    const full = releases.filter((r, i) => i === 0 || (installedVersion != null && isNewerThanInstalled(r, installedVersion)));
    const older = releases.filter((r) => !full.includes(r));
    const key = (r) => `${r.date}|${r.title}`;
    return h('div.whats-new-list',
      full.map((r) => renderRelease(r, opts)),
      older.length > 0 && h('div.wn-older-list',
        h('h3.wn-older-title', t('Earlier releases')),
        older.map((r) => renderRelease(r, {
          ...opts, compact: true, open: state.opened.has(key(r)),
          onToggle: (open) => (open ? state.opened.add(key(r)) : state.opened.delete(key(r))),
        }))));
  }

  loadChangelog().then((res) => {
    if (!res) {
      replace(body, callout({ tone: 'yellow', text: t('Couldn’t load the changelog. It needs an internet connection the first time.') }));
      return;
    }
    state.log = res.log;
    state.offline = res.offline;
    render();
  });

  const el = card({ tone: 'lavender' }, body);
  el.refresh = render;
  return el;
}
