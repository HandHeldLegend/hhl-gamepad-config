/**
 * ble-update.js: Firmware updates over the Bluetooth config link, for controllers with the HOJA bootloader.
 *
 * The controller stages what it receives past its running firmware, and its bootloader writes it into place on
 * the next boot (HOJA-LIB-RP2040 hal/rp2040/boot_update.h, ble_config.c; frames in device/ble-link.js):
 *   1. the board image (.bin) is downloaded and checked against the manifest;
 *   2. the parts: the firmware, and the radio region when its header differs from the controller's (new radio
 *      firmware goes with the firmware built for it, written together in one boot);
 *   3. each part goes as it is, or compressed (raw deflate, the browser's CompressionStream) when the controller
 *      has no room for it otherwise;
 *   4. the stream goes out within the controller's window, and written sectors come back as progress. A link that
 *      drops is connected again (the controller opens its beacon by itself) and the update carries on where it
 *      got to;
 *   5. FINISH: the controller checks every part and restarts to install them, then opens its beacon again.
 *
 * bleUpdate() resolves once the controller is restarting; reopenBluetooth() then connects to it again.
 */
import { BleLink, UPDATE_STATUS } from '../device/ble-link.js';
import { t, N_ } from '../i18n/index.js';
import { pico_download_bin } from './picoboot.js';

const SECTOR = 4096;
const RADIO_HEADER_LEN = 72; // boot_radio_header_s
const DEST = { APP: 0, RADIO: 1 };
const ENC = { STORED: 0, DEFLATE: 1 };
const PART_LEN = 18;
/** No progress this long: resend from what is written. Twice that without any: the link is gone. */
const ACK_WAIT_MS = 3000;
const STALL_MS = 15000;
/** A dropped link is connected again this often, each try as long as the beacon the controller opens. */
const RECONNECT_TRIES = 3;
export const BEACON_WAIT_MS = 30000;

/** Why an update can't go over Bluetooth: shown as is (translated where shown). */
export const NEEDS_CABLE = N_('This update can’t be installed over Bluetooth. Connect a USB cable to install it.');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

/** Reflected CRC-32 (0xEDB88320), as the controller checks it. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const align = (n) => Math.ceil(n / SECTOR) * SECTOR;

/** The radio region without its unused (erased) tail. */
function trimErased(bytes) {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0xff) end--;
  return bytes.subarray(0, end);
}

class LinkLost extends Error {}
class NotAllowed extends Error {}

/** An error the owner can act on, from a status the controller answered. */
function statusError(status) {
  switch (status) {
    case UPDATE_STATUS.BATTERY_LOW:
      return new Error(t('Charge the controller to at least 30%, or plug it in, then try again.'));
    case UPDATE_STATUS.NO_ROOM:
    case UPDATE_STATUS.BAD_REQUEST:
    case UPDATE_STATUS.UNSUPPORTED:
      return new Error(t(NEEDS_CABLE));
    default:
      return new Error(t('The update didn’t arrive intact. Try again.'));
  }
}

/**
 * The parts to send, stored when the controller has room for them as they are, else compressed. Null when
 * there's no room either way.
 */
async function planParts(image, info) {
  const sources = [];
  if (info.radioSize) {
    const header = image.subarray(info.radioOffset, info.radioOffset + RADIO_HEADER_LEN);
    if (crc32(header) !== info.radioHeaderCrc) {
      sources.push({ dest: DEST.RADIO, offset: info.radioOffset, image: trimErased(image.subarray(info.radioOffset, info.appOffset)) });
    }
  }
  sources.push({ dest: DEST.APP, offset: info.appOffset, image: image.subarray(info.appOffset) });

  // Room: the staged data lies below the stage header, above this firmware and above everything written
  const writtenEnd = Math.max(...sources.map((s) => s.offset + s.image.length));
  const fits = (parts) => {
    const base = info.stageHeaderOffset - parts.reduce((sum, p) => sum + align(p.staged.length), 0);
    return base >= info.runningEnd && base >= writtenEnd;
  };

  const stored = sources.map((s) => ({ ...s, enc: ENC.STORED, staged: s.image }));
  if (fits(stored)) return stored;
  const compressed = await Promise.all(sources.map(async (s) => ({ ...s, enc: ENC.DEFLATE, staged: await deflateRaw(s.image) })));
  return fits(compressed) ? compressed : null;
}

/** BEGIN's payload, and the stream: each part's staged data padded to whole sectors (0xFF), back to back. */
function framePlan(parts) {
  const begin = new Uint8Array(1 + parts.length * PART_LEN);
  const v = new DataView(begin.buffer);
  begin[0] = parts.length;
  let length = 0;
  parts.forEach((p, i) => {
    const at = 1 + i * PART_LEN;
    begin[at] = p.dest;
    begin[at + 1] = p.enc;
    v.setUint32(at + 2, p.staged.length, true);
    v.setUint32(at + 6, crc32(p.staged), true);
    v.setUint32(at + 10, p.image.length, true);
    v.setUint32(at + 14, crc32(p.image), true);
    length += align(p.staged.length);
  });
  const stream = new Uint8Array(length).fill(0xff);
  let at = 0;
  for (const p of parts) {
    stream.set(p.staged, at);
    at += align(p.staged.length);
  }
  return { begin, stream };
}

/** Send the stream from `written` (what the controller has), within its window, until it has all of it. */
function sendStream(link, stream, info, written, onProgress) {
  return new Promise((resolve, reject) => {
    let sent = written;
    let lastProgressAt = performance.now();
    let wake = null;
    let done = false;

    const finish = (err) => {
      if (done) return;
      done = true;
      link.removeEventListener('update-state', onState);
      link.removeEventListener('gone', onGone);
      if (err) reject(err);
      else resolve();
    };
    const onState = (e) => {
      const s = e.detail;
      if (s.written > written) {
        written = s.written;
        lastProgressAt = performance.now();
        onProgress(written / stream.length);
      }
      if (s.status === UPDATE_STATUS.OUT_OF_ORDER) sent = written;
      else if (s.status !== UPDATE_STATUS.OK) finish(statusError(s.status));
      wake?.();
    };
    const onGone = () => finish(new LinkLost('The Bluetooth link dropped'));
    link.addEventListener('update-state', onState);
    link.addEventListener('gone', onGone);

    (async () => {
      while (!done) {
        if (written >= stream.length) { finish(); return; }
        if (sent < stream.length && sent - written + info.dataMax <= info.window) {
          const n = Math.min(info.dataMax, stream.length - sent);
          try {
            await link.updateData(sent, stream.subarray(sent, sent + n));
          } catch {
            finish(new LinkLost('The Bluetooth link dropped'));
            return;
          }
          sent += n;
          continue;
        }
        const heard = await new Promise((r) => {
          wake = () => r(true);
          setTimeout(() => r(false), ACK_WAIT_MS);
        });
        wake = null;
        if (heard) continue;
        // Nothing came back: an acknowledgement went missing, or the link stalled
        if (performance.now() - lastProgressAt > STALL_MS) { finish(new LinkLost('No progress over Bluetooth')); return; }
        sent = written;
      }
    })();
  });
}

/**
 * Connect to a controller again over Bluetooth and sign in with this browser's token: after its restart, or
 * after a dropped link (its beacon opens by itself both times). Resolves an open, allowed BleLink.
 */
export async function reopenBluetooth(bt, tryFor = BEACON_WAIT_MS) {
  const until = performance.now() + tryFor;
  let lastErr = null;
  while (performance.now() < until) {
    const link = new BleLink(bt);
    try {
      await link.open({ connectTimeout: Math.max(1000, until - performance.now()) });
      if (await link.authorize()) return link;
      link.close();
      throw new NotAllowed(t('This browser isn’t allowed on the controller any more. Connect to it again from the app.'));
    } catch (err) {
      lastErr = err;
      link.close();
      if (err instanceof NotAllowed) throw err;
    }
  }
  throw lastErr || new Error(t('The controller didn’t come back over Bluetooth.'));
}

/**
 * Whether the connected controller takes updates over Bluetooth: its UPDATE_INFO, or null.
 * @param {import('../device/ble-link.js').BleLink} link
 */
export function bleUpdateInfo(link) {
  return link?.isOpen ? link.updateInfo() : Promise.resolve(null);
}

/**
 * Send the build at `url` to the controller over `link` and have it install it. onStatus({ phase, percent }):
 * phase 'download' | 'prepare' | 'send' | 'reconnect' | 'finish'. Resolves once the controller restarts to
 * install the update; throws an Error to show (translated) when it can't.
 */
export async function bleUpdate({ link, url, checksum, onStatus = () => {} }) {
  const bt = link.bluetoothDevice;

  onStatus({ phase: 'download', percent: 0 });
  const image = new Uint8Array(await pico_download_bin(url, checksum));

  onStatus({ phase: 'prepare', percent: 0 });
  const info = await link.updateInfo();
  if (!info) throw new Error(t(NEEDS_CABLE));
  if (!info.batteryOk) throw statusError(UPDATE_STATUS.BATTERY_LOW);

  // A build for this layout starts its firmware with its own second stage, as the image's start does. An older
  // build (no bootloader) would land in the wrong place: that one goes over USB.
  const boot2 = image.subarray(0, 256);
  const firmwareStart = image.subarray(info.appOffset, info.appOffset + 256);
  if (image.length <= info.appOffset || firmwareStart.some((b, i) => b !== boot2[i])) throw new Error(t(NEEDS_CABLE));

  const parts = await planParts(image, info);
  if (!parts) throw new Error(t(NEEDS_CABLE));
  const { begin, stream } = framePlan(parts);

  let current = link;
  for (let tries = 0; ; tries++) {
    try {
      const answer = await current.updateBegin(begin);
      if (answer.status !== UPDATE_STATUS.OK) throw statusError(answer.status);
      onStatus({ phase: 'send', percent: (answer.written / stream.length) * 100 });
      await sendStream(current, stream, info, answer.written, (f) => onStatus({ phase: 'send', percent: f * 100 }));
      break;
    } catch (err) {
      if (!(err instanceof LinkLost) && !/dropped|Not connected/.test(err?.message || '')) throw err;
      if (tries >= RECONNECT_TRIES) throw new Error(t('The Bluetooth link kept dropping. Move closer to the controller and try again.'));
      onStatus({ phase: 'reconnect', percent: null });
      current.close();
      current = await reopenBluetooth(bt);
    }
  }

  onStatus({ phase: 'finish', percent: 100 });
  const fin = await current.updateFinish();
  if (fin.status !== UPDATE_STATUS.RESTARTING) throw statusError(fin.status);
  return { link: current, bt };
}
