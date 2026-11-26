/**
 * app-log.js: The app's recent warnings, errors and connection changes, kept in memory for the
 * support report (sections/about/support-report.js). Nothing is stored or sent anywhere.
 *
 *   installAppLog(session)   once at boot: records console.warn / console.error, uncaught errors,
 *                            rejected promises and the controller's connection state
 *   note(text)               add a line yourself
 *   appLog()                 [{ t: ISO time, level: 'info'|'warn'|'error', text }], oldest first
 *
 * Addresses (aa:bb:cc:dd:ee:ff) are blanked as lines are recorded, so the report never carries one.
 */
const MAX_ENTRIES = 300;
const MAX_TEXT = 600;
const entries = [];

const ADDRESS = /\b[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}\b/gi;

function textOf(value) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}

function add(level, parts) {
  let text;
  try { text = parts.map(textOf).join(' '); } catch { text = '(unreadable)'; }
  text = text.replace(ADDRESS, 'xx:xx:xx:xx:xx:xx');
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}…`;
  entries.push({ t: new Date().toISOString(), level, text });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

/** Add an information line to the log. */
export function note(text) { add('info', [text]); }

/** A copy of the log, oldest first. */
export function appLog() { return entries.map((e) => ({ ...e })); }

let installed = false;

/** Start recording. Safe to call more than once. */
export function installAppLog(session) {
  if (installed) return;
  installed = true;
  for (const level of ['warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => { add(level, args); original(...args); };
  }
  window.addEventListener('error', (e) => add('error', [`Uncaught: ${e.message}`, e.filename ? `(${e.filename}:${e.lineno})` : '']));
  window.addEventListener('unhandledrejection', (e) => add('error', ['Unhandled rejection:', e.reason]));
  session?.on?.('state', ({ state }) => add('info', [`Controller: ${state}`]));
  window.addEventListener('hashchange', () => add('info', [`Page: ${location.hash.split('?')[0] || '#/'}`]));
  add('info', [`App started on ${location.hash.split('?')[0] || '#/'}`]);
}
