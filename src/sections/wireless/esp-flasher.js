/**
 * esp-flasher.js: Writes ESP32 wireless-module firmware with esptool-js.
 *
 * Port of the flashing half of hoja_esptool/src/app.js (the standalone "HOJA Baseband Updater"
 * hoja2 opened in a new tab). Same offsets, USB filter, baud and flash options. The images come from
 * the update channel (./channels.js: legacy baseband or HCI bridge), always all three:
 *
 *   bootloader.bin       @ 0x1000
 *   partition-table.bin  @ 0x8000
 *   <app>.bin            @ 0x10000   (ESP32.bin for the baseband, hoja_hci_bridge.bin for the bridge)
 *   connect → eraseFlash() → writeFlash({ flashSize/mode/freq: 'keep', compress: true })
 *
 * Two transports, like the standalone page's Serial/WebUSB switch:
 *   'serial'  Web Serial (desktop Chrome/Edge, uses the OS CH340 driver)
 *   'usb'     WebUSB: ./ch340-port.js, a CH340 port built on Mitch's niceSerial driver (same chip setup)
 *             with one continuous read loop, so esptool's read timeouts work on current Chrome for
 *             Android. Always used on Android (no separate full-chip erase, like the standalone updater).
 *             ?usbdriver=nice uses the vendored niceSerial (./nice-serial.js) instead, for comparison.
 *
 * In demo mode (`simulate: true`) nothing touches USB or the network; a timed fake run drives the
 * same callbacks so the update dialog can be demonstrated.
 */
import { serial as niceSerial } from './nice-serial.js';
import { Ch340Port } from './ch340-port.js';

/** USB ids of the CH340 bridge used in HOJA controllers (same filter as the standalone updater). */
export const CH34X_FILTER = Object.freeze({ usbVendorId: 0x1a86, usbProductId: 0x7522 });
import { t } from '../../i18n/index.js';
import { CHANNELS } from './channels.js';
import { isLinux } from '../../app/linux.js';

/** Legacy baseband images (name: English, for the esptool-style log; label: translated where shown). */
export const BASEBAND_IMAGES = CHANNELS.legacy.images;

/** The baseband images are built for the original ESP32 (sdkconfig CONFIG_IDF_TARGET="esp32"). */
const EXPECTED_CHIP = 'ESP32';
const DEFAULT_BAUD = 115200;
/** Give up on the ROM bootloader sync after this long (esptool's own retries take well under this). */
const CONNECT_TIMEOUT_MS = 30000;
/**
 * After each reset esptool reads until the line goes quiet for 1 s before it syncs. A module that
 * keeps printing (e.g. it booted its app instead of the ROM loader) never goes quiet, which hung the
 * connect until CONNECT_TIMEOUT_MS. Cap that wait so esptool moves on to syncing and its next reset.
 */
const BOOT_DRAIN_MAX_MS = 2500;
const ESPTOOL_URL = new URL('../../../vendor/esptool-js/esptool.js', import.meta.url).href;
/**
 * The standalone updater always enabled esptool's packet tracing (hex dump of every USB packet to
 * the console). That's only useful for debugging and costs memory on a 1 MB write, so it's on
 * only with ?debug in the URL.
 */
const TRACE = new URLSearchParams(location.search).has('debug');

/** Which transports this browser can use. Android: WebUSB only. */
export function availableTransports() {
  // Android always uses WebUSB (the CH34x driver in ./nice-serial.js): Android's Web Serial doesn't
  // reach the module's USB serial chip. Never offer Web Serial there.
  // Test override (not linked anywhere, desktop only): ?transport=serial or ?transport=usb forces one route.
  if (isAndroid()) return { serial: false, usb: !!navigator.usb, preferred: 'usb' };
  // Desktop Linux: the kernel's ch341 driver owns the CH340 (it's /dev/ttyUSB0), and Chrome can't claim
  // a USB interface a kernel driver holds ("Unable to claim interface"). Web Serial only.
  if (isLinux() && navigator.serial) return { serial: true, usb: false, preferred: 'serial' };
  const force = new URLSearchParams(location.search).get('transport');
  if (force === 'serial' && navigator.serial) return { serial: true, usb: false, preferred: 'serial' };
  if (force === 'usb' && navigator.usb) return { serial: false, usb: true, preferred: 'usb' };
  const serial = !!navigator.serial && !isAndroid();
  return { serial, usb: !!navigator.usb, preferred: serial ? 'serial' : 'usb' };
}

/**
 * Android, also when the browser hides it: "Desktop site" mode (the default on many tablets) reports
 * a Linux desktop user agent, so also trust User-Agent Client Hints, and treat a touch-first
 * "X11; Linux" browser as Android (desktop Linux with Chrome is mouse-first; ChromeOS says CrOS).
 */
function isAndroid() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return true;
  const ch = navigator.userAgentData;
  if (ch && (/Android/i.test(ch.platform || '') || ch.mobile)) return true;
  const touchFirst = navigator.maxTouchPoints > 0 && !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  return /X11; Linux/.test(ua) && !/CrOS/.test(ua) && touchFirst;
}

/**
 * Send DTR/RTS changes made back to back as ONE setSignals call (esptool.py's "UnixTightReset").
 * esptool-js changes them one at a time (setRTS even re-sends DTR separately). Its reset goes DTR=1
 * while RTS is still 1, then RTS=0: in between both are high, the auto-reset circuit releases EN with
 * IO0 still high and the ESP32 boots its app instead of the ROM loader. Where each change is its own
 * USB control transfer (Linux's ch341 driver, WebUSB on Android) that gap is milliseconds, enough to
 * miss the bootloader; Windows' driver is quick enough to get away with it. esptool awaits each call,
 * which only takes microtasks here, so its consecutive changes land in the same flush.
 */
function tightSignals(transport, port) {
  const lines = { dtr: false, rts: false };
  let timer = 0;
  let chain = Promise.resolve();
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      const { dtr, rts } = lines;
      console.log(`Lines: DTR ${dtr ? 1 : 0} RTS ${rts ? 1 : 0}`);
      chain = chain.then(() => port.setSignals({ dataTerminalReady: dtr, requestToSend: rts }))
        .catch((err) => console.warn('setSignals failed:', err?.message || err));
    }, 0);
  };
  transport.setDTR = async (v) => { lines.dtr = !!v; schedule(); };
  transport.setRTS = async (v) => { lines.rts = !!v; schedule(); };
}

/**
 * Limit esptool's post-reset "read until quiet" loop (see BOOT_DRAIN_MAX_MS). A reset is a DTR/RTS
 * change; the loop ends at the next write (the first sync). In between, reads time out once the cap
 * has passed, exactly as if the line had gone quiet.
 */
function capBootDrain(transport) {
  let since = 0;
  const wrap = (name, fn) => { const orig = transport[name].bind(transport); transport[name] = (...a) => fn(orig, ...a); };
  wrap('setDTR', (orig, v) => { since = Date.now(); return orig(v); });
  wrap('setRTS', (orig, v) => { since = Date.now(); return orig(v); });
  wrap('write', (orig, d) => { since = 0; return orig(d); });
  wrap('read', (orig, ...a) => {
    if (since && Date.now() - since > BOOT_DRAIN_MAX_MS) { since = 0; return Promise.reject(new Error('Timeout')); }
    return orig(...a);
  });
}

/** Baud override: the same `?baud=` URL parameter the standalone updater honored. */
export function baudFromUrl(params = {}) {
  const raw = params.baud ?? new URLSearchParams(location.search).get('baud');
  const n = Number(raw);
  return raw != null && Number.isInteger(n) && n >= 9600 && n <= 2000000 ? n : DEFAULT_BAUD;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * esptool-js 0.4.3's prebuilt bundle decodes its flasher stubs with Node's Buffer
 * (`Buffer.from(b64, 'base64').toString('binary')`), which browsers don't have; bundlers like the
 * standalone updater's webpack polyfill it. Provide just that one conversion when Buffer is missing.
 */
function installBufferShim() {
  if (globalThis.Buffer) return;
  globalThis.Buffer = {
    from(data, encoding) {
      if (typeof data !== 'string' || encoding !== 'base64') throw new Error(`Buffer shim: unsupported Buffer.from(${encoding})`);
      const binary = atob(data);
      return { toString: (enc) => { if (enc && enc !== 'binary' && enc !== 'latin1') throw new Error(`Buffer shim: unsupported toString(${enc})`); return binary; } };
    },
  };
}

/** ArrayBuffer → "binary string" (one char per byte), the image format esptool-js 0.4 expects. */
function toBinaryString(buf) {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return out;
}

/**
 * Download the three images of a channel. The dialog does this *before* switching the controller
 * into update mode, so an offline browser fails early instead of leaving the controller stuck.
 * @param {{images?: Array, onProgress?: (done:number, total:number, label:string)=>void, simulate?: boolean}} [o]
 *   label: the image's English label (translate with t()); '' when everything is downloaded.
 * @returns {Promise<Array<{name:string, address:number, data:string, size:number}>>}
 */
export async function downloadBasebandImages({ images = BASEBAND_IMAGES, onProgress, simulate = false } = {}) {
  const out = [];
  for (const [i, img] of images.entries()) {
    onProgress?.(i, images.length, img.label);
    if (simulate) {
      await sleep(250);
      out.push({ ...img, data: '', size: [24576, 3072, 1048576][i] });
      continue;
    }
    const res = await fetch(img.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(t('Couldn’t download the {file} (HTTP {status}).', { file: t(img.label), status: res.status }));
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error(t('The downloaded {file} is empty.', { file: t(img.label) }));
    out.push({ ...img, data: toBinaryString(buf), size: buf.byteLength });
  }
  onProgress?.(images.length, images.length, '');
  return out;
}

/**
 * One flashing session: connect → erase → write → close.
 *
 *   const f = new EspFlasher({ log, simulate });
 *   await f.connect('serial');            // needs a user gesture (port picker)
 *   await f.erase();
 *   await f.write(images, (pct) => …);
 *   await f.close();
 */
export class EspFlasher {
  /** @param {{log?: (line:string)=>void, simulate?: boolean, baud?: number}} [o] */
  constructor({ log = () => {}, simulate = false, baud = DEFAULT_BAUD } = {}) {
    this.log = log;
    this.simulate = simulate;
    this.baud = baud;
    this.port = null;
    this.transport = null;
    this.loader = null;
    this.chip = null;
  }

  get connected() { return this.simulate ? !!this.chip : !!this.loader; }

  /**
   * Ask for the CH340 port and sync with the ESP32 ROM bootloader (uploads the flasher stub).
   * Call straight from a click handler: the port picker needs the user gesture.
   * @param {'serial'|'usb'} kind
   * @returns {Promise<string>} chip description, e.g. "ESP32-D0WD-V3 (revision v3.1)"
   */
  async connect(kind) {
    if (this.connected) return this.chip;
    if (this.simulate) {
      this.log('Connecting...');
      await sleep(700);
      this.log('Detecting chip type... ESP32');
      await sleep(500);
      this.chip = 'ESP32-D0WD-V3 (revision v3.1)';
      this.log(`Chip is ${this.chip}`);
      this.log('Uploading stub... Running stub...');
      await sleep(400);
      return this.chip;
    }

    // 1. Pick the port (user gesture). Canceling the picker throws a NotFoundError.
    if (kind === 'usb') {
      if (!navigator.usb) throw new Error(t('WebUSB is not available in this browser.'));
      const nice = new URLSearchParams(location.search).get('usbdriver') === 'nice';
      this.port = nice ? await niceSerial.requestPort({ filters: [CH34X_FILTER] }) : await Ch340Port.request();
      this.log(`WebUSB driver: ${nice ? 'niceSerial' : 'ch340-port'}`);
    }
    else {
      if (!navigator.serial) throw new Error(t('Web Serial isn’t available in this browser. Try the USB option.'));
      this.port = await navigator.serial.requestPort({ filters: [CH34X_FILTER] });
    }

    // 2. Load esptool-js lazily (only needed here) and sync with the chip's ROM loader.
    installBufferShim();
    const { ESPLoader, Transport } = await import(ESPTOOL_URL);
    // Once released (e.g. after the connect timeout), esptool's leftover retries stay out of the log.
    const terminal = { clean() {}, writeLine: (s) => this.transport && this.log(s), write: (s) => this.transport && this.log(s) };
    // Transport(device, tracing, enableSlipReader): SLIP reader off, as in the standalone updater.
    this.kind = kind;
    this.transport = new Transport(this.port, TRACE, false);
    tightSignals(this.transport, this.port);
    capBootDrain(this.transport);
    // Same options as the standalone updater. Note enableTracing overrides the Transport's tracing flag
    // (it did in the standalone updater too). Over WebUSB, esptool's debug log goes to Details for diagnosis.
    // esptool's debug lines (resets, sync attempts) go to Details on every route, for support logs.
    const loader = new ESPLoader({ transport: this.transport, baudrate: this.baud, terminal, enableTracing: false, debugLogging: true });
    try {
      // esptool retries its sync for a while; if the module never answers, don't spin forever.
      let timer = 0;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(t('The wireless module didn’t answer. Unplug the controller, put it back into update mode (lights pulsing orange) and try again.'))), CONNECT_TIMEOUT_MS); });
      try { this.chip = await Promise.race([loader.main(), timeout]); } finally { clearTimeout(timer); }
    } catch (err) {
      await this.#release();
      throw err;
    }
    const name = loader.chip?.CHIP_NAME;
    if (name && name !== EXPECTED_CHIP) {
      await this.#release();
      throw new Error(t('This wireless module is an {chip}, but the HOJA baseband firmware is built for the {expected}. Nothing was written.', { chip: name, expected: EXPECTED_CHIP }));
    }
    this.loader = loader;
    return this.chip;
  }

  /** Erase the whole flash (the standalone updater's "Erase" button). Takes ~10–30 s. */
  async erase() {
    if (this.simulate) {
      this.log('Erasing flash (this may take a while)...');
      await sleep(2200);
      this.log('Chip erase completed successfully');
      return;
    }
    if (!this.loader) throw new Error(t('Not connected to the wireless module.'));
    await this.loader.eraseFlash();
  }

  /**
   * Whether the install should run a separate full-chip erase first. Not over WebUSB: the standalone
   * updater (which works on Android) went straight to writing; writeFlash erases each region it writes.
   */
  get eraseFirst() {
    return this.kind !== 'usb';
  }

  /**
   * Write all images (the standalone updater's "Flash" button).
   * @param {Array<{name:string,address:number,data:string,size:number}>} images
   * @param {(percent:number, label:string)=>void} [onProgress] 0–100 across all files, weighted by size;
   *   label = the image's English label (translate with t())
   */
  async write(images, onProgress) {
    const total = images.reduce((n, img) => n + img.size, 0) || 1;
    const before = images.map((_, i) => images.slice(0, i).reduce((n, img) => n + img.size, 0));
    if (this.simulate) {
      for (const [i, img] of images.entries()) {
        this.log(`Writing ${img.name.toLowerCase()} at 0x${img.address.toString(16)}...`);
        const steps = Math.max(4, Math.round((img.size / total) * 40));
        for (let s = 1; s <= steps; s++) {
          await sleep(110);
          onProgress?.(((before[i] + (img.size * s) / steps) / total) * 100, img.label);
        }
        this.log(`Wrote ${img.size} bytes at 0x${img.address.toString(16)}.`);
      }
      this.log('Hash of data verified.');
      return;
    }
    if (!this.loader) throw new Error(t('Not connected to the wireless module.'));
    await this.loader.writeFlash({
      fileArray: images.map((img) => ({ data: img.data, address: img.address })),
      // 'keep' everywhere: write the images byte-for-byte (the standalone updater left mode/freq
      // unset, which esptool-js 0.4.3 also treats as "don't patch the bootloader header").
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, fileTotal) => {
        const img = images[fileIndex];
        const done = before[fileIndex] + (fileTotal ? (written / fileTotal) * img.size : 0);
        onProgress?.((done / total) * 100, img?.label || '');
      },
    });
  }

  /** Release the port. The controller stays in update mode until it is unplugged. */
  async close() {
    if (this.simulate) { this.chip = null; return; }
    await this.#release();
  }

  async #release() {
    const t = this.transport;
    this.loader = null;
    this.transport = null;
    this.port = null;
    if (t) { try { await t.disconnect(); } catch (err) { console.warn('[wireless] port close', err?.message || err); } }
  }
}
