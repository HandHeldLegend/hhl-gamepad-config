/**
 * carry-over.js: Settings carried across a firmware update written over USB, no DOM.
 *
 * An update that changes where a controller keeps its settings can bring it back reset: the first
 * install of the HOJA bootloader on a board whose old settings page lies where the new image is
 * written, for one. Before the update the controller's settings are kept here, its identity
 * included (createBackup). When it comes back as the same board with another MAC address (a reset
 * gives it a new random one), they are written back, calibration and identity too, and if it now
 * has profiles they all start from them. A controller that kept its settings is left as it is.
 *
 *   keepForUpdate(session)   before the controller restarts into its bootloader
 *   carryOver(session)       once it reconnects: 'restored', 'kept', 'failed', or null (none pending)
 */
import { createBackup, planRestore, applyRestore, unitId } from './backup.js';
import { device } from '../../device/hoja-device.js';
import { isDemo } from '../../device/mock.js';
import { buildIdFromManifestUrl } from '../../firmware/changelog.js';

const KEY = 'hhl-config:carry-over';
/** A carry-over older than this belongs to an update that was given up on. */
const CARRY_MAX_AGE_MS = 30 * 60 * 1000;

let pending = null; // also in sessionStorage, should the page reload during the update

function store(value) {
  pending = value;
  try {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage blocked: the copy in memory still serves this page */ }
}

function load() {
  if (pending) return pending;
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}

/** Keep the connected controller's settings for after its update. */
export async function keepForUpdate(session) {
  if (!session.connected || isDemo()) return;
  try {
    const backup = await createBackup(session, { identity: true });
    const profiles = await device.readProfiles().catch(() => null);
    store({
      build: buildIdFromManifestUrl(session.info?.manifestUrl),
      unit: backup.controller.unit,
      kept: Date.now(),
      hadProfiles: !!profiles,
      backup,
    });
  } catch (err) {
    console.warn('[carry-over] could not keep the settings', err);
  }
}

/** Every profile but the live one becomes a copy of it (a controller's first profiles, after a reset). */
async function seedProfiles() {
  const profiles = await device.readProfiles().catch(() => null);
  if (!profiles) return true;
  for (let n = 0; n < profiles.names.length; n++) {
    if (n !== profiles.active && !(await device.copyProfile(profiles.active, n).catch(() => false))) return false;
  }
  return true;
}

/** The restored fields the controller doesn't hold as planned, read back from it ('block.field'). */
async function unconfirmed(plan, session) {
  const off = [];
  for (const b of plan.blocks) {
    await device.requestBlock(b.key);
    const want = b.next.toJSON();
    const have = session.config[b.key].toJSON();
    for (const name of [...b.settings, ...b.calibration]) {
      if (JSON.stringify(want[name]) !== JSON.stringify(have[name])) off.push(`${b.key}.${name}`);
    }
  }
  return off;
}

/** After an update: write the kept settings back if the controller came back reset. */
export async function carryOver(session) {
  const carry = load();
  if (!carry) return null;
  const build = buildIdFromManifestUrl(session.info?.manifestUrl);
  if (!build || build !== carry.build) return null; // another controller: keep it for ours
  store(null);
  if (Date.now() - carry.kept > CARRY_MAX_AGE_MS) return null;

  if ((await unitId(session.config)) === carry.unit) return 'kept';
  try {
    // A block that didn't answer while connecting can't be written back: read it again first
    const missing = await device.rereadMissing();
    const plan = await planRestore(carry.backup, session, { calibration: true, identity: true });
    console.info('[carry-over] restoring', plan.blocks.map((b) => b.key).join(', '),
      missing.length ? `(still missing: ${missing.join(', ')})` : '', plan.skipped.length ? { skipped: plan.skipped } : '');
    if (missing.length) return 'failed';
    if (!(await applyRestore(plan, session))) return 'failed';
    // Read back: anything on the controller that wrote over the restore (a routine started by the
    // reset) shows here. Written once more, then reported.
    let off = await unconfirmed(plan, session);
    if (off.length) {
      console.warn('[carry-over] not held, writing again:', off.join(', '));
      if (!(await applyRestore(plan, session))) return 'failed';
      off = await unconfirmed(plan, session);
      if (off.length) {
        console.warn('[carry-over] still not held:', off.join(', '));
        return 'failed';
      }
    }
    if (!carry.hadProfiles && !(await seedProfiles())) return 'failed';
    return 'restored';
  } catch (err) {
    console.warn('[carry-over] could not restore the settings', err);
    return 'failed';
  }
}
