/**
 * Demo-controller hooks for the "gamepad" section (used only with ?demo; see src/device/mock.js).
 *   seed(device)            adjust device.config / device.static after the base demo data is set
 *   command(block, cmd, device, arg)  return { status, data } to customize a config command's reply,
 *                           or undefined for the default success. May dispatch events on device.
 *
 * Nothing extra needed: the base mock seeds mode, MAC, Switch colors and the WebUSB popup, and
 * wireless/demo.js seeds the paired hosts.
 */
export function seed(device) {}

// The Home hub's quick settings (live-status.js): the demo controller keeps them in memory
const live = { held: false, tourney: false };

export function command(block, cmd, device, arg) {
  if (block !== 'gamepad') return undefined;
  if (cmd === 'HOLD_INPUTS') { live.held = arg === 1; return { status: true, data: null }; }
  if (cmd === 'TOURNEY') { live.tourney = arg === 1; return { status: true, data: null }; }
  if (cmd === 'STATUS') {
    // USB, Switch mode, about 1000 reports a second
    const rate = 990 + Math.round(Math.random() * 20);
    return { status: true, data: new Uint8Array([3, 0, live.held ? 1 : 0, live.tourney ? 1 : 0, rate & 0xff, rate >> 8]) };
  }
  return undefined;
}
