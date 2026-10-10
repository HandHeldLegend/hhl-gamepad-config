/**
 * backup.js: Settings backup files (export / import), no DOM.
 *
 * A backup is a JSON file with every config block decoded by FIELD NAME (from the firmware layout),
 * so it can be restored onto newer firmware whose structs moved fields around or bumped a block
 * version. Button mappings are stored by enum name ("SOUTH" → "A"), so renumbered input or output
 * codes still restore correctly. Anything a newer firmware doesn't have is skipped and reported.
 *
 *   const file = await createBackup(session);            // plain object, JSON.stringify it
 *   const backup = parseBackup(text);                    // throws a translated Error when invalid
 *   const plan = planRestore(backup, session, { calibration });
 *   await applyRestore(plan, session);                   // writes the changed blocks and saves
 *
 * Never copied: block version fields (the controller's own stay), the controller's MAC address, the
 * paired host addresses, the split-defaults migration marker (gamepad_defaults_split) and the home
 * WLAN block (its password can't be read back, so restoring the block would erase it). Calibration (stick centers and angle maps, hall trigger ranges, gyro and
 * accelerometer offsets) belongs to one physical controller: restoring it is opt-in.
 *
 * Self-contained on purpose: ./card.js is the only UI, hooked into the Firmware page and updater.
 */
import { LAYOUT, createStruct, enumValues } from '../../device/struct.js';
import { device } from '../../device/hoja-device.js';
import { buildIdFromManifestUrl } from '../../firmware/changelog.js';
import { loadVersion } from '../../app/pwa.js';
import { t } from '../../i18n/index.js';

export const BACKUP_FORMAT = 'hoja-config-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** Blocks that are never backed up or restored (see above). */
const NEVER_BLOCKS = new Set(['wlan']);
/** Fields that are never written from a backup (identity and pairing). */
const NEVER = new Set(['gamepad_mac_address', 'host_mac_switch', 'host_mac_sinput', 'host_mac_wii', 'gamepad_defaults_split']);

/** Per-unit calibration. `true` = the whole block. */
const CALIBRATION = {
  hover: true,
  analog: new Set(['analog_calibration_set', 'lx_center', 'ly_center', 'rx_center', 'ry_center', 'joy_config_l', 'joy_config_r']),
  imu: new Set(['imu_a_gyro_offsets', 'imu_a_accel_config', 'imu_b_gyro_offsets', 'imu_b_accel_config']),
};

const isVersionField = (name) => /_version$/.test(name);
const isReserved = (name) => name.startsWith('reserved');
export const isCalibration = (block, name) => CALIBRATION[block] === true || !!CALIBRATION[block]?.has?.(name);

// ---- Button mappings by name -----------------------------------------------------------------

const INPUT_PROFILE = /^input_profile_(.+)$/;
/** Output code enum of a remap profile field (input_profile_switch → mapper_switch_code_t). */
function outputEnumOf(field) {
  const mode = field.match(INPUT_PROFILE)?.[1];
  if (!mode) return null;
  const name = mode.startsWith('wii') ? 'mapper_wii_code_t' : `mapper_${mode}_code_t`;
  return LAYOUT.enums[name] ? name : null;
}

/** "INPUT_CODE_SOUTH" → "SOUTH", "SWITCH_CODE_A" → "A", "MAPPER_OUTPUT_DIGITAL" → "DIGITAL". */
const shortName = (full) => full.replace(/^.*?_CODE_/, '').replace(/^MAPPER_OUTPUT_/, '');
const names = (enumName) => new Map(enumValues(enumName).map((e) => [e.value, shortName(e.name)]));
const values = (enumName) => new Map(enumValues(enumName).map((e) => [shortName(e.name), e.value]));

function profileToNames(slots, outEnum) {
  const inputs = names('mapper_input_code_t');
  const outs = names(outEnum);
  const modes = names('mapper_output_type_t');
  const out = {};
  slots.forEach((s, i) => {
    out[inputs.get(i) ?? `#${i}`] = {
      output: outs.get(s.output_code) ?? s.output_code,
      mode: modes.get(s.output_mode) ?? s.output_mode,
      static_output: s.static_output,
      threshold_delta: s.threshold_delta,
    };
  });
  return out;
}

// ---- Export ----------------------------------------------------------------------------------

/** Short stable id for "is this the same controller" (hash of its MAC; the MAC itself isn't stored). */
async function unitId(config) {
  const mac = config.gamepad?.gamepad_mac_address;
  if (!mac || !crypto?.subtle) return null;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(mac)));
  return Array.from(digest.subarray(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Build the backup object for the connected controller. */
export async function createBackup(session) {
  const blocks = {};
  for (const b of LAYOUT.blocks.config) {
    if (NEVER_BLOCKS.has(b.key) || device.missing.config.includes(b.key)) continue; // or never read from this controller
    const data = session.config[b.key].toJSON();
    const fields = {};
    for (const [name, value] of Object.entries(data)) {
      if (NEVER.has(name) || isVersionField(name)) continue;
      const outEnum = outputEnumOf(name);
      fields[name] = outEnum ? profileToNames(value, outEnum) : value;
    }
    const versionField = Object.keys(data).find((n) => /_config_version$/.test(n));
    blocks[b.key] = { version: versionField ? data[versionField] : null, fields };
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    created: new Date().toISOString(),
    app: { version: (await loadVersion().catch(() => null)) || null, layout: LAYOUT.source?.ref ?? null },
    controller: {
      name: session.info?.name ?? null,
      build: buildIdFromManifestUrl(session.info?.manifestUrl),
      fwVersion: session.info?.fwVersion ?? null,
      unit: await unitId(session.config),
    },
    blocks,
  };
}

/** File name: hoja-backup-<build or name>-<yyyy-mm-dd>.json */
export function backupFileName(backup) {
  const who = (backup.controller.build || backup.controller.name || 'controller').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
  return `hoja-backup-${who}-${backup.created.slice(0, 10)}.json`;
}

// ---- Import ----------------------------------------------------------------------------------

/** Parse and sanity-check a backup file's text. Throws an Error with a translated message. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(t('This file isn’t a settings backup.')); }
  if (data?.format !== BACKUP_FORMAT || typeof data.blocks !== 'object' || !data.blocks) throw new Error(t('This file isn’t a settings backup.'));
  if (data.formatVersion > BACKUP_FORMAT_VERSION) throw new Error(t('This backup was made by a newer version of the app. Update the app and try again.'));
  return data;
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Write one backup value into a struct field (recursing into nested structs). Returns false if unusable. */
function assignField(inst, field, value) {
  if (field.struct) {
    if (field.count == null) {
      if (!value || typeof value !== 'object') return false;
      const sub = inst[field.name];
      assignObject(sub, value);
      inst[field.name] = sub;
      return true;
    }
    if (!Array.isArray(value)) return false;
    const arr = inst[field.name];
    value.slice(0, field.count).forEach((v, i) => { if (v && typeof v === 'object') assignObject(arr[i], v); });
    inst[field.name] = arr;
    return true;
  }
  if (field.count != null) {
    if (!Array.isArray(value) || !value.every(finite)) return false;
    inst[field.name] = value.slice(0, field.count);
    return true;
  }
  if (!finite(value)) return false;
  inst[field.name] = value;
  return true;
}

function assignObject(inst, obj) {
  for (const f of inst.constructor.fields) {
    if (isReserved(f.name) || !(f.name in obj)) continue;
    assignField(inst, f, obj[f.name]);
  }
}

/** Remap profile by names → slot objects on this firmware. Unknown names are reported, not guessed. */
function profileFromNames(inst, field, named, skipped, label) {
  const outEnum = outputEnumOf(field.name);
  const inputs = values('mapper_input_code_t');
  const outs = values(outEnum);
  const modes = values('mapper_output_type_t');
  const slots = inst[field.name];
  for (const [inputName, s] of Object.entries(named || {})) {
    const i = inputs.get(inputName);
    if (i == null || i < 0 || i >= slots.length || !s) { skipped.push(`${label}: ${inputName}`); continue; }
    const code = typeof s.output === 'string' ? outs.get(s.output) : s.output;
    const mode = typeof s.mode === 'string' ? modes.get(s.mode) : s.mode;
    if (!finite(code) || !finite(mode)) { skipped.push(`${label}: ${inputName} → ${s.output}`); continue; }
    slots[i].output_code = code;
    slots[i].output_mode = mode;
    if (finite(s.static_output)) slots[i].static_output = s.static_output;
    if (finite(s.threshold_delta)) slots[i].threshold_delta = s.threshold_delta;
  }
  inst[field.name] = slots;
}

/**
 * Work out what a restore would change, without touching the controller.
 * @returns {{ blocks: Array<{key, next, settings: string[], calibration: string[]}>, skipped: string[],
 *   sameUnit: boolean|null, sameBuild: boolean|null, hasCalibration: boolean }}
 *   settings / calibration: names of fields whose value changes; skipped: what couldn't be restored
 */
export async function planRestore(backup, session, { calibration = false } = {}) {
  const skipped = [];
  const out = [];
  let hasCalibration = false;
  for (const b of LAYOUT.blocks.config) {
    const saved = backup.blocks[b.key];
    if (!saved?.fields || NEVER_BLOCKS.has(b.key)) continue;
    if (device.missing.config.includes(b.key)) { skipped.push(b.key); continue; }
    const current = session.config[b.key];
    const next = createStruct(b.struct, current.buffer.slice());
    const byName = new Map(next.constructor.fields.map((f) => [f.name, f]));
    const changed = { settings: [], calibration: [] };
    for (const [name, value] of Object.entries(saved.fields)) {
      const field = byName.get(name);
      if (!field) { skipped.push(`${b.key}.${name}`); continue; }
      if (NEVER.has(name) || isVersionField(name) || isReserved(name)) continue;
      const cal = isCalibration(b.key, name);
      if (cal) hasCalibration = true;
      if (cal && !calibration) continue;
      const before = JSON.stringify(next.toJSON()[name]);
      if (outputEnumOf(name)) profileFromNames(next, field, value, skipped, name.replace(INPUT_PROFILE, '$1'));
      else if (!assignField(next, field, value)) { skipped.push(`${b.key}.${name}`); continue; }
      if (JSON.stringify(next.toJSON()[name]) !== before) changed[cal ? 'calibration' : 'settings'].push(name);
    }
    if (changed.settings.length || changed.calibration.length) out.push({ key: b.key, next, ...changed });
  }
  const unit = await unitId(session.config);
  const build = buildIdFromManifestUrl(session.info?.manifestUrl);
  return {
    blocks: out,
    skipped,
    sameUnit: unit && backup.controller?.unit ? unit === backup.controller.unit : null,
    sameBuild: build && backup.controller?.build ? build === backup.controller.build : null,
    hasCalibration,
  };
}

/** Write the planned blocks to the controller and save them. Resolves with the save result. */
export async function applyRestore(plan, session) {
  for (const b of plan.blocks) {
    session.config[b.key].buffer.set(b.next.buffer);
    session.commit(b.key, { immediate: true });
  }
  const ok = await session.save();
  session.refreshAttention?.();
  return ok;
}

