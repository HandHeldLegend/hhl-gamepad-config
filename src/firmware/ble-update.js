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
import { crc32 } from '../device/block-cache.js';
import { t, N_ } from '../i18n/index.js';
import { withTimeout } from '../util/async.js';
import { pico_download_bin } from './picoboot.js';

/** Staged parts start on whole flash sectors. */
const FLASH_SECTOR_LEN = 4096;
const RADIO_HEADER_LEN = 72; // boot_radio_header_s
/** The second stage boot code's length: a board image starts with it, and so does firmware built for the
 *  HOJA bootloader's layout (see bleUpdate). */
const BOOT2_LEN = 256;
const DEST = { APP: 0, RADIO: 1 };
const ENC = { STORED: 0, DEFLATE: 1 };
/** One part in BEGIN's payload: [dest][enc][staged length, staged CRC32, image length, image CRC32: u32 LE]. */
const PART_LEN = 18;
/** No acknowledgement this long: one went missing, so the stream goes again from what is written. */
const ACK_WAIT_MS = 3000;
/** No progress at all this long: the link is treated as lost (and connected again). */
const STALL_MS = 15000;
/** A dropped link is connected again at most this often in one update. */
const RECONNECT_TRIES = 3;
/** How long connecting again keeps trying: as long as the beacon the controller opens by itself. */
export const BEACON_WAIT_MS = 30000;
/** Each connect try gets at least this long, even near the end of the wait. */
const MIN_CONNECT_TRY_MS = 1000;

/** Why an update can't go over Bluetooth: shown as is (translated where shown). */
export const NEEDS_CABLE = N_('This update can’t be installed over Bluetooth. Connect a USB cable to install it.');

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const align = (n) => Math.ceil(n / FLASH_SECTOR_LEN) * FLASH_SECTOR_LEN;

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
          const at = sent;
          const n = Math.min(info.dataMax, stream.length - at);
          try {
            await link.updateData(at, stream.subarray(at, at + n));
          } catch {
            finish(new LinkLost('The Bluetooth link dropped'));
            return;
          }
          // An answer while this write was going may have sent the stream back to what is written
          if (sent === at) sent = at + n;
          continue;
        }
        const heard = await withTimeout(new Promise((r) => { wake = r; }), ACK_WAIT_MS, 'Waiting for progress')
          .then(() => true, () => false);
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
      await link.open({ connectTimeout: Math.max(MIN_CONNECT_TRY_MS, until - performance.now()) });
      if (await link.authorize()) return link;
      throw new NotAllowed(t('This browser isn’t allowed on the controller any more. Connect to it again from the app.'));
    } catch (err) {
      lastErr = err;
      link.close();
      if (err instanceof NotAllowed) throw err;
    }
  }
  console.warn('[ble] the controller didn’t come back', lastErr);
  throw new Error(t('The controller didn’t come back over Bluetooth.'));
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
 * install the update (reopenBluetooth(link.bluetoothDevice) connects to it again); throws an Error to show
 * (translated) when it can't.
 */
export async function bleUpdate({ link, url, checksum, onStatus = () => {} }) {
  onStatus({ phase: 'download', percent: 0 });
  const image = new Uint8Array(await pico_download_bin(url, checksum));

  onStatus({ phase: 'prepare', percent: 0 });
  const info = await link.updateInfo();
  if (!info) throw new Error(t(NEEDS_CABLE));
  if (!info.batteryOk) throw statusError(UPDATE_STATUS.BATTERY_LOW);

  // A build for this layout starts its firmware with its own second stage, as the image's start does. An older
  // build (no bootloader) would land in the wrong place: that one goes over USB.
  const boot2 = image.subarray(0, BOOT2_LEN);
  const firmwareStart = image.subarray(info.appOffset, info.appOffset + BOOT2_LEN);
  if (image.length <= info.appOffset || firmwareStart.some((b, i) => b !== boot2[i])) throw new Error(t(NEEDS_CABLE));

  const parts = await planParts(image, info);
  if (!parts) throw new Error(t(NEEDS_CABLE));
  const { begin, stream } = framePlan(parts);

  const use = { link }; // the link in use: a new one once a lost link was connected again
  try {
    await sendAll(use, begin, stream, info, onStatus);
    onStatus({ phase: 'finish', percent: 100 });
    // A link that drops once FINISH is out may be the controller restarting to install: the build it comes
    // back with tells (the caller connects again either way)
    const fin = await use.link.updateFinish();
    if (fin && fin.status !== UPDATE_STATUS.RESTARTING) throw statusError(fin.status);
  } catch (err) {
    // A link this update connected again belongs to nothing else: let go of it
    if (use.link !== link) use.link.close();
    throw err;
  }
}

/**
 * BEGIN, then the stream, until the controller has all of it. A lost link is connected again (use.link
 * then holds the new one) and the update carries on where it got to.
 */
async function sendAll(use, begin, stream, info, onStatus) {
  for (let tries = 0; ; tries++) {
    try {
      const answer = await use.link.updateBegin(begin);
      if (answer.status !== UPDATE_STATUS.OK) throw statusError(answer.status);
      onStatus({ phase: 'send', percent: (answer.written / stream.length) * 100 });
      await sendStream(use.link, stream, info, answer.written, (f) => onStatus({ phase: 'send', percent: f * 100 }));
      return;
    } catch (err) {
      // The link is lost when it dropped, stalled, or closed itself after a write got no answer. Any other
      // failure on an open link (a refusal, a missing answer) ends the update.
      if (!(err instanceof LinkLost) && use.link.isOpen) throw err;
      if (tries >= RECONNECT_TRIES) throw new Error(t('The Bluetooth link kept dropping. Move closer to the controller and try again.'));
      onStatus({ phase: 'reconnect', percent: null });
      use.link.close();
      use.link = await reopenBluetooth(use.link.bluetoothDevice);
    }
  }
}
