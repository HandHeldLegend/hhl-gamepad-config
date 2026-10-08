/**
 * changelog.js: The firmware changelog (CHANGELOG.md in github.com/HandHeldLegend/hoja-device-fw).
 *
 * The changelog is one hand-written Markdown file next to the builds; the format guide is at the
 * top of that file. This module parses it, scopes it to a build and a section, and finds the
 * "Action" entries an owner has to act on after updating. Parsing is strict: anything it can't
 * read is reported with its line number (tools/check-changelog.mjs fails on those) and skipped in
 * the app, so one bad line never hides the rest.
 *
 * DOM-free and Node-importable (tools/check-changelog.mjs uses it).
 */
// Marks a literal for translation (tools/test-i18n.mjs); kept local so this module stays Node-importable.
const N_ = (text) => text;

export const CHANGELOG_URL = 'https://raw.githubusercontent.com/HandHeldLegend/hoja-device-fw/main/CHANGELOG.md';
const CACHE_KEY = 'hhl-config:changelog';

/** The changelog's sections, in display order. page: the app page it links to (registry id). */
export const CHANGE_SECTIONS = [
  { id: 'input', title: N_('Input'), icon: 'input', page: 'input' },
  { id: 'joysticks', title: N_('Joysticks'), icon: 'joystick', page: 'joysticks' },
  { id: 'snapback', title: N_('Snapback'), icon: 'snapback', page: 'snapback' },
  { id: 'motion', title: N_('Motion'), icon: 'motion', page: 'motion' },
  { id: 'rgb', title: N_('RGB'), icon: 'rgb', page: 'rgb' },
  { id: 'haptics', title: N_('Haptics'), icon: 'haptics', page: 'haptics' },
  { id: 'battery', title: N_('Battery'), icon: 'battery', page: 'battery' },
  { id: 'wireless', title: N_('Wireless'), icon: 'wireless', page: 'wireless' },
  { id: 'modes', title: N_('Modes'), icon: 'gamepad', page: 'gamepad' },
  { id: 'system', title: N_('System'), icon: 'firmware', page: 'firmware' },
];

/** Entry kinds, as written at the start of each bullet ("- Fix: ..."). */
export const CHANGE_KINDS = {
  new: { label: N_('New'), tone: 'green' },
  fix: { label: N_('Fix'), tone: 'blue' },
  change: { label: N_('Changed'), tone: 'lavender' },
  action: { label: N_('Action needed'), tone: 'yellow' },
};

const SECTION_BY_NAME = new Map(CHANGE_SECTIONS.map((s) => [s.id, s]));

/**
 * Parse CHANGELOG.md.
 * @returns {{ groups: Object<string, string[]>, releases: Array, errors: Array<{line:number, message:string}> }}
 *   releases (in file order, newest first): { date, title, boards: Set|null (null = all), line, entries }
 *   entries: { section, kind, text, scope: string[]|null, boards: Set|null (null = all), line }
 */
export function parseChangelog(text) {
  const groups = {};
  const releases = [];
  const errors = [];
  const err = (line, message) => errors.push({ line, message });

  // Drop HTML comments (the format guide) but keep line numbers.
  const src = String(text || '').replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));
  const lines = src.split(/\r?\n/);

  let mode = null; // 'groups' | 'release'
  let release = null;
  let section = null;
  let badSection = false;
  let entry = null;
  const pendingScopes = [];

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trimEnd();
    if (!line.trim()) { entry = null; return; }

    // Wrapped bullet text
    if (entry && /^\s{2,}\S/.test(line)) { entry.text += ` ${line.trim()}`; return; }
    entry = null;

    if (/^# /.test(line)) return; // document title

    let m = line.match(/^## (.+)$/);
    if (m) {
      section = null;
      badSection = false;
      if (/^board groups$/i.test(m[1].trim())) { mode = 'groups'; release = null; return; }
      const d = m[1].match(/^(\d{4}-\d{2}-\d{2})(?:\s+[-–—·]\s+(.+))?$/);
      if (!d || Number.isNaN(Date.parse(`${d[1]}T00:00:00Z`))) {
        err(n, `Release heading must be "## YYYY-MM-DD" (optionally "## YYYY-MM-DD - Title"), got "${line}"`);
        mode = null; release = null; return;
      }
      if (releases.length && d[1] > releases[releases.length - 1].date) err(n, `Releases must be newest first (${d[1]} is after ${releases[releases.length - 1].date})`);
      release = { date: d[1], title: d[2]?.trim() || '', boards: undefined, boardTokens: null, line: n, entries: [] };
      releases.push(release);
      mode = 'release';
      return;
    }

    if (mode === 'groups') {
      m = line.match(/^- ([\w.-]+):\s*(.+)$/);
      if (!m) { err(n, 'Board groups are "- name: build_id, build_id, ..."'); return; }
      groups[m[1]] = splitList(m[2]);
      return;
    }

    if (mode !== 'release') { err(n, 'Text outside a release (start one with "## YYYY-MM-DD")'); return; }

    m = line.match(/^Boards:\s*(.+)$/i);
    if (m) {
      if (release.boardTokens) err(n, 'A release has one "Boards:" line');
      release.boardTokens = /^all$/i.test(m[1].trim()) ? 'all' : splitList(m[1]);
      return;
    }

    m = line.match(/^### (.+)$/);
    if (m) {
      const name = m[1].trim().toLowerCase();
      section = SECTION_BY_NAME.get(name) ? name : null;
      badSection = !section;
      if (!section) err(n, `Unknown section "${m[1].trim()}". Use one of: ${CHANGE_SECTIONS.map((s) => s.title).join(', ')}`);
      return;
    }

    m = line.match(/^- (\w+):\s*(?:\[([^\]]+)\]\s*)?(.+)$/);
    if (m) {
      const kind = m[1].toLowerCase();
      if (!section) { if (!badSection) err(n, 'Bullet before any "### Section"'); return; }
      if (!CHANGE_KINDS[kind]) { err(n, `Unknown kind "${m[1]}". Start bullets with New:, Fix:, Change: or Action:`); return; }
      entry = { section, kind, text: m[3].trim(), scope: m[2] ? splitList(m[2]) : null, boards: null, line: n };
      release.entries.push(entry);
      pendingScopes.push([release, entry]);
      return;
    }

    err(n, `Can't read this line: "${line.trim()}"`);
  });

  // Resolve board lists now that every group is known.
  const resolve = (tokens, n) => {
    const out = new Set();
    for (const tok of tokens) {
      if (groups[tok]) groups[tok].forEach((id) => out.add(id));
      else out.add(tok);
    }
    if (!out.size) err(n, 'Empty board list');
    return out;
  };
  for (const r of releases) {
    if (!r.boardTokens) { err(r.line, 'Release needs a "Boards:" line (build ids, groups or "all")'); r.boards = null; }
    else r.boards = r.boardTokens === 'all' ? null : resolve(r.boardTokens, r.line);
    delete r.boardTokens;
    if (!r.entries.length) err(r.line, 'Release has no entries');
  }
  for (const [r, e] of pendingScopes) {
    let boards = e.scope ? resolve(e.scope, e.line) : null;
    if (boards && r.boards) {
      boards = new Set([...boards].filter((id) => r.boards.has(id)));
      if (!boards.size) err(e.line, 'None of this bullet\'s boards are in its release\'s "Boards:" line');
    }
    e.boards = boards ?? r.boards;
  }

  return { groups, releases, errors };
}

function splitList(s) {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Every build id the changelog names (for the checker). */
export function namedBoards(log) {
  const ids = new Set();
  for (const list of Object.values(log.groups)) list.forEach((id) => ids.add(id));
  for (const r of log.releases) {
    r.boards?.forEach((id) => ids.add(id));
    for (const e of r.entries) e.boards?.forEach((id) => ids.add(id));
  }
  return ids;
}

const appliesTo = (boards, buildId) => !buildId || !boards || boards.has(buildId);

/**
 * Releases scoped to a build (null = every build) and a section (null = every section),
 * keeping only releases with something left.
 */
export function filterChangelog(log, { buildId = null, section = null } = {}) {
  return log.releases
    .filter((r) => appliesTo(r.boards, buildId))
    .map((r) => ({ ...r, entries: r.entries.filter((e) => appliesTo(e.boards, buildId) && (!section || e.section === section)) }))
    .filter((r) => r.entries.length);
}

/** Sections that have at least one entry for this build, in display order. */
export function sectionsWithChanges(log, buildId = null) {
  const used = new Set(filterChangelog(log, { buildId }).flatMap((r) => r.entries.map((e) => e.section)));
  return CHANGE_SECTIONS.filter((s) => used.has(s.id));
}

/** Build date (YYYY-MM-DD, UTC) of a firmware version stamp, or null when it isn't a build timestamp. */
export function buildDate(fwVersion) {
  const v = Number(fwVersion) >>> 0;
  if (!(v > 1.4e9 && v < 4e9)) return null;
  return new Date(v * 1000).toISOString().slice(0, 10);
}

/**
 * Whether a release is newer than the firmware on the controller. A release dated the same day as
 * the installed build counts as installed. null when the installed version isn't a build date.
 */
export function isNewerThanInstalled(release, fwVersion) {
  const d = buildDate(fwVersion);
  return d ? release.date > d : null;
}

/** "Action" entries for a build that are newer than its installed firmware, newest first. */
export function pendingActions(log, buildId, fwVersion) {
  const installed = buildDate(fwVersion);
  return filterChangelog(log, { buildId })
    .filter((r) => !installed || r.date > installed)
    .flatMap((r) => r.entries.filter((e) => e.kind === 'action').map((e) => ({ ...e, date: r.date })));
}

/** Build id from a controller's manifest URL (".../builds/<id>/manifest.json"), or null. */
export function buildIdFromManifestUrl(url) {
  const m = String(url || '').match(/\/builds\/([^/]+)\/manifest\.json(?:[?#].*)?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Split entry text into plain and `code` runs: [{ text, code }]. */
export function inlineRuns(text) {
  return String(text).split(/(`[^`]+`)/).filter(Boolean)
    .map((part) => (part.startsWith('`') && part.endsWith('`') ? { text: part.slice(1, -1), code: true } : { text: part, code: false }));
}

let memo = null;

/**
 * Fetch and parse the changelog. The last good copy is kept in localStorage, so it still shows
 * offline. @returns {Promise<{log, offline: boolean}|null>} null when there's no copy at all.
 */
export async function loadChangelog() {
  if (memo) return memo;
  try {
    const res = await fetch(CHANGELOG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const text = await res.text();
    try { localStorage.setItem(CACHE_KEY, text); } catch { /* ignore */ }
    memo = { log: parseChangelog(text), offline: false };
    if (memo.log.errors.length) console.warn('[changelog] skipped lines:', memo.log.errors);
    return memo;
  } catch (err) {
    let text = null;
    try { text = localStorage.getItem(CACHE_KEY); } catch { /* ignore */ }
    console.warn('[changelog] using cached copy:', err.message);
    return text ? { log: parseChangelog(text), offline: true } : null;
  }
}
