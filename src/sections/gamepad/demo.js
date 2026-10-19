/**
 * Demo-controller hooks for the "gamepad" section (used only with ?demo; see src/device/mock.js).
 *   seed(device)            adjust device.config / device.static after the base demo data is set
 *   command(block, cmd, device, arg)  return { status, data } to customize a config command's reply,
 *                           or undefined for the default success. May dispatch events on device.
 *
 * The base mock seeds mode, MAC, Switch colors and the WebUSB popup, and wireless/demo.js the paired
 * hosts. Here: the boot order at the firmware's defaults (dongle, Switch, Wii, Steam; Steam on a
 * computer), so the Boot order card shows.
 */
import { LAYOUT } from '../../device/struct.js';

export function seed(device) {
  const d = LAYOUT.defines || {};
  if (d.AUTO_ORDER_VERSION == null) return;
  const c = device.config.gamepad;
  c.auto_order_version = d.AUTO_ORDER_VERSION;
  c.auto_wireless_order = [d.AUTO_HOST_DONGLE, d.AUTO_HOST_SWITCH, d.AUTO_HOST_WII, d.AUTO_HOST_STEAM];
  c.auto_usb_computer = (LAYOUT.enums.core_reportformat_t || []).find((e) => e.name === 'CORE_REPORTFORMAT_SINPUT')?.value ?? 6;
}

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
