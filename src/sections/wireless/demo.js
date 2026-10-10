/**
 * Demo-controller hooks for the "wireless" section (used only with ?demo; see src/device/mock.js).
 *   seed(device)            adjust device.config / device.static after the base demo data is set
 *   command(block, cmd, device)  return { status, data } to customize a config command's reply,
 *                           or undefined for the default success. May dispatch events on device.
 *
 * mock.js already seeds an ESP32-C3 with external updates and WLAN supported. Here we:
 *   - report the part as "ESP32 HCI" (current controller firmware, which can drive the HCI bridge) with
 *     the older HOJA baseband installed, so the recommended bridge install shows when online;
 *   - give the controller a paired Switch and Wii (SInput left unpaired) and a WLAN PIN;
 *   - store a home network with a password (Home WLAN), which WLAN_CMD_CLEAR forgets as on hardware;
 *   - make ENABLE_BLUETOOTH_UPLOAD behave like hardware: the controller drops off USB shortly after,
 *     so the update dialog's survive-the-unmount path can be seen. The flash itself is simulated
 *     by module-updater.js / esp-flasher.js when isDemo() was true at the start of the update.
 */
import { encodeText, fwDefine } from '../../device/struct.js';

export function seed(device) {
  device.static.bluetooth.part_number = encodeText('ESP32 HCI', 24);
  device.static.bluetooth.external_version_number = 41000;
  const c = device.config.gamepad;
  c.host_mac_switch = [0x98, 0xb6, 0xe9, 0x4a, 0x2c, 0x11];
  c.host_mac_sinput = [0, 0, 0, 0, 0, 0];
  c.host_mac_wii = [0x00, 0x1f, 0x32, 0x8d, 0x5e, 0x07];
  c.wlan_dongle_key = 420;
  const w = device.config.wlan;
  w.wlan_config_version = fwDefine('CFG_BLOCK_WLAN_VERSION', 0);
  w.ssid = encodeText('HOJA Home', 33);
  w.flags = fwDefine('WLAN_FLAG_HOME_ENABLED', 0x01) | fwDefine('WLAN_FLAG_HAS_PASSWORD', 0x02);
}

export function command(block, cmd, device) {
  if (block === 'gamepad' && cmd === 'ENABLE_BLUETOOTH_UPLOAD') {
    // Real firmware reboots into ALTFLASH without replying; simulate the USB drop.
    setTimeout(() => device.disconnect(), 600);
    return { status: false, data: null };
  }
  if (block === 'wlan' && cmd === 'CLEAR') {
    const w = device.config.wlan;
    w.ssid = new Uint8Array(33);
    w.password = new Uint8Array(65);
    w.flags = 0;
  }
  return undefined;
}
