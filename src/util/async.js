/**
 * async.js: Promise helpers shared by the device drivers (USB, Bluetooth) and the firmware updaters. No DOM.
 *
 *   sleep(ms)                       resolves after `ms` milliseconds
 *   withTimeout(promise, ms, what)  `promise`, or a rejection once `ms` pass without it settling
 */

/** Resolve after `ms` milliseconds. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `promise`, or a rejection once `ms` milliseconds pass without it settling. That error reads
 * "<what> timed out" and has timeout: true, so a caller can tell it from the operation's own failure.
 * The operation itself carries on: cancelling it is the caller's job (closing the device, the link).
 */
export function withTimeout(promise, ms, what = 'Waiting') {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${what} timed out`), { timeout: true })), ms);
  })]).finally(() => clearTimeout(timer));
}
