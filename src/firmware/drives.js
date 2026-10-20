/**
 * drives.js: The USB drive a controller shows when it is in a bootloader, by name.
 *
 *   HOJA bootloader (update mode, bcdDevice 0xB002 and later): a drive named after the controller.
 *     The firmware (HOJA-LIB-RP2040 bootloader/boot_uf2.c) builds the FAT label from the board's
 *     device name: '.' becomes '-', '+' becomes 'P', "*,/:;<=>?[\]| are dropped, and a name longer
 *     than 11 characters loses its spaces, then its end. "ProGCC 3.1" shows as "ProGCC 3-1".
 *   The chip's own boot ROM: RPI-RP2 (RP2040) or RP2350.
 */
const LABEL_LEN = 11;

/** The drive label the HOJA bootloader gives a controller named `name` (e.g. "GCU 1"). */
export function hojaDriveLabel(name) {
  const clean = Array.from(String(name || ''))
    .map((c) => (c === '.' ? '-' : c === '+' ? 'P' : c))
    .filter((c) => !'"*,/:;<=>?[\\]|'.includes(c));
  const squeezed = clean.length > LABEL_LEN ? clean.filter((c) => c !== ' ') : clean;
  return squeezed.slice(0, LABEL_LEN).join('').trim();
}

/**
 * HOJA update mode with the UF2 drive: bcdDevice 0xB002 or later. WebUSB splits bcdDevice into
 * major (high byte), minor (high nibble of the low byte) and subminor (low nibble).
 */
export function hasHojaDrive(usb) {
  const low = ((usb?.deviceVersionMinor ?? 0) << 4) | (usb?.deviceVersionSubminor ?? 0);
  return usb?.deviceVersionMajor === 0xb0 && low >= 0x02;
}

/** The boot ROM drive for a chip: 'RP2350' or 'RPI-RP2'. */
export const romDriveName = (chip) => (chip === 'rp2350' ? 'RP2350' : 'RPI-RP2');
