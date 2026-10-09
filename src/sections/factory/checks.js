/**
 * checks.js: Factory station verdicts, built on the same decoders the regular pages use (Battery,
 * Wireless, Input), so a fix there changes the station's verdicts too.
 *
 *   hardwareChecks(session)  automatic pass / fail from what the firmware reported at connect
 *   testInputs(session)      every physical input the build has, with how it is judged
 *   imuAxes(session)         the IMU axes to watch for live data
 *
 * Results: 'pass' | 'fail' | 'na' (not fitted on this build, not counted).
 */
import { decodeText } from '../../device/struct.js';
import { device } from '../../device/hoja-device.js';
import { decodePmicStatus, decodeFuelGauge, PACK } from '../battery/status.js';
import { chipStatus } from '../wireless/info.js';
import { reportedVersion } from '../wireless/channels.js';
import { INPUT_CODES, INPUT_TYPE } from '../input/mapping.js';
import { t, N_ } from '../../i18n/index.js';

/** Raw-stream thresholds (reports.js): hover inputs 0..127, joystick directions 0..64. */
export const HOVER_FULL = 100;
export const JOYSTICK_FULL = 52;
/** Live IMU: an axis passes once its readings have spread this far (raw int16 units). */
export const GYRO_SPREAD = 800;
export const ACCEL_SPREAD = 1500;

const row = (id, label, result, detail = '') => ({ id, label, result, detail });

/** Automatic checks from static info. Labels are English source text (translate where shown). */
export function hardwareChecks(session) {
  const st = session.static;
  const out = [];

  // Settings blocks the firmware didn't serve (the app can't read or save them).
  const missing = device.missing?.config || [];
  out.push(row('settings', N_('Settings memory'), missing.length ? 'fail' : 'pass', missing.join(', ')));

  // Charger (PMIC) and battery pack.
  const bat = st.battery;
  const pmic = decodePmicStatus(bat.pmic_status);
  const pmicPart = decodeText(bat.pmic_part_number);
  if (bat.pmic_status === 0) out.push(row('pmic', N_('Charger chip (PMIC)'), 'na'));
  else out.push(row('pmic', N_('Charger chip (PMIC)'), pmic.badge.tone === 'green' ? 'pass' : 'fail', [pmicPart, pmic.badge.text].filter(Boolean).join(' · ')));

  if (bat.battery_capacity_mah > 0 && pmic.pack !== PACK.NA) {
    const result = pmic.pack === PACK.PRESENT ? 'pass' : pmic.pack === PACK.ABSENT ? 'fail' : 'na';
    out.push(row('pack', N_('Battery pack'), result, pmic.pack === PACK.ABSENT ? t('Not detected') : ''));
  }

  // Fuel gauge. A voltage estimate through the wireless module only reads over Bluetooth: not judged here.
  const fgPart = decodeText(bat.fuelgauge_part_number);
  const fuel = decodeFuelGauge(bat.fuelgauge_status, fgPart);
  if (!fuel.present || (!fuel.active && /^ESP32$/i.test(fgPart))) out.push(row('fuel', N_('Fuel gauge'), 'na', fuel.present ? fuel.badge.text : ''));
  else out.push(row('fuel', N_('Fuel gauge'), fuel.active ? 'pass' : 'fail', [fgPart, fuel.badge.text].filter(Boolean).join(' · ')));

  // Wireless module, and its firmware version on ESP32 builds.
  const bt = st.bluetooth;
  const chip = chipStatus(bt);
  if (!chip.present) out.push(row('wireless', N_('Wireless module'), 'na'));
  else out.push(row('wireless', N_('Wireless module'), chip.state === 'active' ? 'pass' : 'fail', `${chip.model} · ${chip.label}`));
  if (chip.present && session.caps.externalBaseband) {
    const v = reportedVersion(bt);
    out.push(row('wireless-fw', N_('Wireless module firmware'), v != null ? 'pass' : 'fail', v != null ? String(v) : t('Not reported')));
  }
  return out;
}

/** Physical inputs to exercise: [{ code, key, name, type: 'digital'|'hover'|'joystick' }]. */
export function testInputs(session) {
  const infos = session.static.input?.input_info || [];
  const type = (n) => (n === INPUT_TYPE.HOVER ? 'hover' : n === INPUT_TYPE.JOYSTICK ? 'joystick' : 'digital');
  return INPUT_CODES
    .map(({ code, key }) => ({ code, key, info: infos[code] }))
    .filter((x) => x.info && x.info.input_type && x.info.input_type !== INPUT_TYPE.UNUSED)
    .map(({ code, key, info }) => ({ code, key, name: decodeText(info.input_name) || key, type: type(info.input_type) }));
}

/** Whether one raw-stream sample counts as that input reaching its full travel. */
export function inputReached(input, sample) {
  if (!sample) return false;
  if (input.type === 'hover') return sample.value >= HOVER_FULL;
  if (input.type === 'joystick') return sample.value >= JOYSTICK_FULL;
  return sample.pressed;
}

/** IMU axes to check for live data (none without an IMU). */
export function imuAxes(session) {
  if (!session.caps.imu) return [];
  return [
    ...['x', 'y', 'z'].map((a) => ({ id: `gyro-${a}`, source: 'gyro', axis: a, label: `${t('Gyro')} ${a.toUpperCase()}`, spread: GYRO_SPREAD })),
    ...['x', 'y', 'z'].map((a) => ({ id: `accel-${a}`, source: 'accel', axis: a, label: `${t('Accel')} ${a.toUpperCase()}`, spread: ACCEL_SPREAD })),
  ];
}
