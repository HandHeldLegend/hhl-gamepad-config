/**
 * Motion settings (imuConfig_s). Port of the scalar controls in hoja2/modules/motion-md.js.
 * Pure data + pure functions only; imported by Node for the MCP server.
 *
 *   imu_disabled                 0 = motion on, 1 = motion off (hoja2: "Enabled, Disabled" selector).
 *                                The master switch: when 1, motion is off in every mode.
 *   imu_mode_disable_mask        (IMU block 0x13+) bit n set = motion off in core_reportformat_t n
 *                                (bit 0 Switch, bit 6 SInput/Steam, bit 7 Wii). 0 = on everywhere.
 *   imu_gyro_sensitivity[3]      per-axis X/Y/Z multiplier in percent, IMU_SENSITIVITY_MIN..MAX (50..200)
 *   imu_accel_sensitivity[3]     same for the accelerometer
 *
 * Sensitivities are stored as integer percent (120 = 1.20×) and shown as a multiplier. The firmware
 * multiplies each raw IMU sample by value / IMU_SENSITIVITY_UNITY before sending it to games.
 */
import { fwDefine, enumValues } from '../../device/struct.js';
import { clampInt } from '../../settings/schema.js';

export const SENSITIVITY_MIN = fwDefine('IMU_SENSITIVITY_MIN', 50);
export const SENSITIVITY_MAX = fwDefine('IMU_SENSITIVITY_MAX', 200);
export const SENSITIVITY_UNITY = fwDefine('IMU_SENSITIVITY_UNITY', 100);
export const GYRO_SENSITIVITY_DEFAULT = fwDefine('IMU_GYRO_SENSITIVITY_DEFAULT', 120);
export const ACCEL_SENSITIVITY_DEFAULT = fwDefine('IMU_ACCEL_SENSITIVITY_DEFAULT', 100);

export const AXES = ['x', 'y', 'z'];

/**
 * hoja2 readSensitivityAxes(): a 0 / missing value means "never set" and falls back to the default;
 * anything else is clamped into range.
 * @param {ArrayLike<number>|undefined} values
 * @param {number} fallback
 * @returns {number[]} three percent values
 */
export function readSensitivity(values, fallback) {
  return AXES.map((_, i) => {
    const v = values?.[i];
    if (!v) return fallback;
    return Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, v));
  });
}

/** Build the three per-axis SettingDefs for one sensor. */
function axisDefs(sensor) {
  const gyro = sensor === 'gyro';
  const field = gyro ? 'imu_gyro_sensitivity' : 'imu_accel_sensitivity';
  const fallback = gyro ? GYRO_SENSITIVITY_DEFAULT : ACCEL_SENSITIVITY_DEFAULT;
  const name = gyro ? 'Gyro' : 'Accelerometer';
  return AXES.map((axis, i) => ({
    key: `motion.${sensor}Sensitivity${axis.toUpperCase()}`,
    label: `${axis.toUpperCase()} axis`,
    description: `${name} ${axis.toUpperCase()}-axis multiplier (default ${(fallback / SENSITIVITY_UNITY).toFixed(2)}×).`,
    tip: gyro
      ? 'Scales how far the in-game camera or cursor turns when you rotate the controller. 1.00× is the sensor\'s natural response; higher feels faster.'
      : 'Scales the tilt and shake strength games see. 1.00× is the sensor\'s natural response.',
    block: 'imu',
    type: 'number',
    min: SENSITIVITY_MIN / SENSITIVITY_UNITY,
    max: SENSITIVITY_MAX / SENSITIVITY_UNITY,
    step: 0.01,
    unit: '×',
    requires: 'imu',
    get: (s) => readSensitivity(s.config.imu[field], fallback)[i] / SENSITIVITY_UNITY,
    // Same as hoja2 setSensitivityAxis(): normalize all three axes, then replace one.
    set: (s, v) => {
      const next = readSensitivity(s.config.imu[field], fallback);
      next[i] = clampInt(v * SENSITIVITY_UNITY, SENSITIVITY_MIN, SENSITIVITY_MAX);
      s.config.imu[field] = next;
    },
  }));
}

/** Bit of imu_mode_disable_mask for a core_reportformat_t name (SWPRO → 0, SINPUT → 6, WII → 7). */
export function modeBit(format) {
  const v = enumValues('core_reportformat_t').find((e) => e.name === `CORE_REPORTFORMAT_${format}`)?.value;
  return v >= 0 ? v : null;
}

/**
 * Per-mode motion switches (imu_mode_disable_mask). Each toggles only its own bit, so the other
 * modes (and any bits this app doesn't know) are left alone. Shown only when the controller's IMU
 * block is 0x13 or later (`imuModes` capability); Wii also needs Wii mode.
 */
const MODE_SWITCHES = [
  { key: 'motion.switchMotion', format: 'SWPRO', label: 'Switch motion', name: 'Switch', mode: 'Switch', requires: 'imuModes' },
  { key: 'motion.steamMotion', format: 'SINPUT', label: 'Steam motion', name: 'Steam', mode: 'Steam (SInput)', requires: 'imuModes' },
  { key: 'motion.wiiMotion', format: 'WII', label: 'Wii motion', name: 'Wii', mode: 'Wii', requires: 'imuModeWii' },
];

export const modeSwitchDefs = MODE_SWITCHES.map((m) => {
  const bit = 1 << modeBit(m.format);
  return {
    key: m.key,
    label: m.label,
    modeName: m.name, // brand name shown on the Motion page, under the "Motion per mode" heading
    description: `Motion in ${m.mode} mode. Only applies while Motion (all modes) is on.`,
    block: 'imu',
    type: 'boolean',
    requires: m.requires,
    get: (s) => !(s.config.imu.imu_mode_disable_mask & bit),
    set: (s, v) => {
      const mask = s.config.imu.imu_mode_disable_mask & 0xffff;
      s.config.imu.imu_mode_disable_mask = v ? mask & ~bit : mask | bit;
    },
  };
});

/** Reset every sensitivity axis to the firmware defaults (hoja2 "Defaults → Reset"). */
export function resetSensitivity(s) {
  s.config.imu.imu_gyro_sensitivity = AXES.map(() => GYRO_SENSITIVITY_DEFAULT);
  s.config.imu.imu_accel_sensitivity = AXES.map(() => ACCEL_SENSITIVITY_DEFAULT);
}

export default [
  {
    key: 'motion.enabled',
    label: 'Motion (all modes)',
    description: 'Turn the gyro and accelerometer on or off for every game.',
    tip: 'When off, the controller reports no motion at all. That\'s handy for games that use gyro aiming you don\'t want.',
    block: 'imu',
    type: 'boolean',
    requires: 'imu',
    get: (s) => !s.config.imu.imu_disabled,
    set: (s, v) => { s.config.imu.imu_disabled = v ? 0 : 1; },
  },
  ...modeSwitchDefs,
  ...axisDefs('gyro'),
  ...axisDefs('accel'),
];
