#!/usr/bin/env node
/**
 * check-changelog.mjs: Check the firmware changelog (CHANGELOG.md in hoja-device-fw).
 *
 *   node tools/check-changelog.mjs                       # finds ../hoja-device-fw next to this repo
 *   node tools/check-changelog.mjs path/to/CHANGELOG.md
 *
 * Fails on any line the app can't read, and on board ids that have no build folder (when the
 * firmware checkout's builds/ folder is there). Prints a short summary otherwise.
 * Exit code 2 when no changelog was found (tools/test.mjs treats that as "skipped").
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog, namedBoards } from '../src/firmware/changelog.js';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = ['../hoja-device-fw', '../../hoja-device-fw'];

async function findChangelog(arg) {
  if (arg) return path.resolve(arg);
  for (const c of CANDIDATES) {
    const p = path.resolve(APP_ROOT, '..', c, 'CHANGELOG.md');
    try { await readFile(p); return p; } catch { /* next */ }
  }
  return null;
}

const file = await findChangelog(process.argv[2]);
if (!file) {
  console.error('Could not find hoja-device-fw/CHANGELOG.md. Pass its path.');
  process.exit(2);
}

const log = parseChangelog(await readFile(file, 'utf8'));
const problems = log.errors.map((e) => `line ${e.line}: ${e.message}`);

// Board ids must match build folders, when the builds are next to the changelog.
let builds = null;
try {
  builds = new Set((await readdir(path.join(path.dirname(file), 'builds'), { withFileTypes: true }))
    .filter((e) => e.isDirectory()).map((e) => e.name));
} catch { /* no builds folder: skip */ }
if (builds) {
  for (const id of namedBoards(log)) if (!builds.has(id)) problems.push(`unknown board "${id}" (no builds/${id} folder)`);
}

if (problems.length) {
  console.error(`${path.relative(process.cwd(), file)}:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const entries = log.releases.reduce((n, r) => n + r.entries.length, 0);
console.log(`changelog OK: ${log.releases.length} release(s), ${entries} entries (${path.relative(process.cwd(), file)})`);
