/**
 * gyro-scale.js: Motion sensitivity limits and defaults, and the gyro scale change of IMU block 0x14.
 * Imports only the firmware layout, so the backup code can use it without loading the settings schema.
 * See ./settings.js for what the values mean.
 */
import { fwDefine } from '../../device/struct.js';

export const SENSITIVITY_MIN = fwDefine('IMU_SENSITIVITY_MIN', 50);
export const SENSITIVITY_MAX = fwDefine('IMU_SENSITIVITY_MAX', 200);
export const SENSITIVITY_UNITY = fwDefine('IMU_SENSITIVITY_UNITY', 100);
export const GYRO_SENSITIVITY_DEFAULT = fwDefine('IMU_GYRO_SENSITIVITY_DEFAULT', 120);
export const ACCEL_SENSITIVITY_DEFAULT = fwDefine('IMU_ACCEL_SENSITIVITY_DEFAULT', 100);

/** IMU config block version from which gyro sensitivity 1.00× is 1:1 (70 mdps a count). */
export const GYRO_SCALE_VERSION = 0x14;
/** Gyro default on firmware older than GYRO_SCALE_VERSION. */
export const GYRO_SENSITIVITY_DEFAULT_OLD = 120;
const OLD_MDPS = 61;
const NEW_MDPS = 70;

export const clampSens = (v) => Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, v));

/** The gyro sensitivity default (percent) of the connected controller's firmware. */
export function gyroDefault(s) {
  const version = s?.config?.imu?.imu_config_version ?? 0;
  return version && version < GYRO_SCALE_VERSION ? GYRO_SENSITIVITY_DEFAULT_OLD : GYRO_SENSITIVITY_DEFAULT;
}

/**
 * Gyro sensitivities saved under one IMU block version, as the same turn speed under another.
 * Old to new is the firmware's own migration: the old default on every axis becomes the new
 * default, anything else is scaled by 61/70 and clamped. New to old is its reverse. Values that
 * were never set (0) and versions on the same side of the change are returned as they are.
 * @param {number[]} values percent per axis
 * @param {number} from IMU block version the values were saved under
 * @param {number} to IMU block version of the controller they are written to
 */
export function convertGyroSensitivity(values, from, to) {
  if (!Array.isArray(values) || !from || !to) return values;
  const wasNew = from >= GYRO_SCALE_VERSION;
  const isNew = to >= GYRO_SCALE_VERSION;
  if (wasNew === isNew) return values;
  const [fromDefault, toDefault] = isNew ? [GYRO_SENSITIVITY_DEFAULT_OLD, 100] : [100, GYRO_SENSITIVITY_DEFAULT_OLD];
  if (values.length && values.every((v) => v === fromDefault)) return values.map(() => toDefault);
  return values.map((v) => {
    if (!v) return v;
    return clampSens(isNew ? Math.floor((v * 8719 + 5000) / 10000) : Math.round((v * NEW_MDPS) / OLD_MDPS));
  });
}
