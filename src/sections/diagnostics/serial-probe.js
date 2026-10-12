/**
 * serial-probe.js: Step-by-step tests of the path the wireless module update depends on, for support
 * reports (no DOM). Each step records what happened instead of retrying, so a report shows where it breaks:
 *
 *   port      which USB serial chip the user picked (vendor / product id)
 *   open      opening it at 115200 baud (the ESP32 ROM's speed)
 *   signals   how long each DTR/RTS change takes (the auto-reset depends on their timing)
 *   resets    several reset sequences, and what the module printed after each: the ROM's boot line
 *             says whether it reached download mode ("boot:0x3"), booted normally ("boot:0x13") or
 *             nothing came back at all; then whether the ROM answers a SYNC packet
 *
 * The module's auto-reset circuit: DTR drives IO0 and RTS drives EN, each inverted. EN low holds the
 * chip in reset; releasing EN while IO0 is low starts the ROM's download mode. esptool's "classic"
 * reset is DTR=0 RTS=1 (reset), wait, DTR=1 RTS=0 (run with IO0 low), wait, DTR=0.
 *
 *   const result = await probeSerialPort(port, { onStep });   // port from navigator.serial.requestPort()
 */

const BAUD = 115200;
const LISTEN_MS = 1200;      // how long to collect output after a reset
const SYNC_TRIES = 5;
const SYNC_WAIT_MS = 120;

/** The ESP32 ROM's SYNC command as a SLIP frame (esptool's _sync). */
const SYNC_FRAME = (() => {
  const data = [0x07, 0x07, 0x12, 0x20, ...new Array(32).fill(0x55)];
  const packet = [0x00, 0x08, data.length & 0xff, data.length >> 8, 0, 0, 0, 0, ...data];
  return new Uint8Array([0xc0, ...packet, 0xc0]);
})();

/**
 * Reset sequences to try, in order. "split" sends DTR and RTS as separate calls (as esptool-js does);
 * "tight" sends both lines in one call (as the app's updater does; on Windows the browser may still
 * apply them one at a time). A step is [dtr, rts], a pause in ms, or { dtr } / { rts } for one line.
 * The first one only restarts the module normally: it shows whether the module prints anything at all.
 */
export const RESETS = [
  { id: 'run', label: 'Normal restart (IO0 high)', steps: [[false, true], 100, [false, false]] },
  { id: 'split-50', label: 'Download reset, separate lines, 50 ms', split: true, steps: [[false, true], 100, [true, false], 50, [false, false]] },
  { id: 'tight-50', label: 'Download reset, lines together, 50 ms', steps: [[false, true], 100, [true, false], 50, [false, false]] },
  { id: 'split-550', label: 'Download reset, separate lines, 550 ms', split: true, steps: [[false, true], 100, [true, false], 550, [false, false]] },
  { id: 'tight-550', label: 'Download reset, lines together, 550 ms', steps: [[false, true], 100, [true, false], 550, [false, false]] },
  // A deliberate 10 ms gap between the DTR and RTS changes: if this fails where the others work, the
  // reset depends on how fast the second change arrives (EN's RC delay).
  { id: 'gap-10', label: 'Download reset, DTR then RTS 10 ms apart', steps: [[false, true], 100, { dtr: true }, 10, { rts: false }, 50, [false, false]] },
  // IO0 low first, then release EN alone. On the standard two-transistor circuit DTR=RTS=1 releases EN
  // (so this only restarts normally); on boards wired with IO0 and EN independent it reaches download
  // mode however slow the host is.
  { id: 'io0-first', label: 'IO0 low first (DTR+RTS), then release RTS', steps: [[false, true], 100, [true, true], 100, { rts: false }, 50, [false, false]] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
const round = (n) => Math.round(n * 10) / 10;
const ascii = (bytes) => Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : b === 10 ? '\n' : b === 13 ? '' : '.')).join('');

/** What the module's output says about the reset. */
export function classifyBoot(text, bytes) {
  if (/waiting for download/i.test(text) || /boot:0x(3|23)\b/i.test(text)) return 'download';
  if (/boot:0x[0-9a-f]+/i.test(text) || /rst:0x/i.test(text)) return 'normal-boot';
  if (bytes > 0) return 'other-output';
  return 'silent';
}

/** A SLIP response to SYNC: C0 01 08 ... (direction 1 = response, command 8 = SYNC). */
function hasSyncReply(bytes) {
  for (let i = 0; i + 2 < bytes.length; i++) if (bytes[i] === 0xc0 && bytes[i + 1] === 0x01 && bytes[i + 2] === 0x08) return true;
  return false;
}

/** Collects everything the port receives, with arrival times. */
class Receiver {
  constructor(port) {
    this.chunks = [];
    this.reader = port.readable.getReader();
    this.done = this.#loop();
  }

  async #loop() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) return;
        if (value?.length) this.chunks.push({ at: now(), bytes: value });
      }
    } catch (err) {
      this.error = err?.message || String(err);
    }
  }

  /** Bytes received since `since` (performance.now()), and when the first of them arrived. */
  since(since) {
    const parts = this.chunks.filter((c) => c.at >= since);
    const total = parts.reduce((n, c) => n + c.bytes.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of parts) { out.set(c.bytes, o); o += c.bytes.length; }
    return { bytes: out, firstAt: parts[0]?.at ?? null };
  }

  async stop() {
    try { await this.reader.cancel(); } catch { /* already closed */ }
    try { this.reader.releaseLock(); } catch { /* ignore */ }
    await this.done;
  }
}

/**
 * Run every step on an already chosen Web Serial port. Never throws: failures are recorded.
 * @param {SerialPort} port
 * @param {{onStep?: (id: string, state: 'running'|'done', data?: object) => void}} [o]
 */
export async function probeSerialPort(port, { onStep = () => {} } = {}) {
  const result = { port: null, open: null, signals: null, resets: [], closed: null };
  const info = port.getInfo?.() || {};
  result.port = {
    usbVendorId: info.usbVendorId != null ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : null,
    usbProductId: info.usbProductId != null ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : null,
  };

  // Open.
  onStep('open', 'running');
  const t0 = now();
  try {
    await port.open({ baudRate: BAUD, bufferSize: 16384 });
    result.open = { ok: true, ms: round(now() - t0) };
  } catch (err) {
    result.open = { ok: false, ms: round(now() - t0), error: `${err?.name || 'Error'}: ${err?.message || err}` };
    onStep('open', 'done', result.open);
    return result;
  }
  onStep('open', 'done', result.open);

  const rx = new Receiver(port);
  const writer = port.writable.getWriter();
  const set = async (dtr, rts) => port.setSignals({ dataTerminalReady: dtr, requestToSend: rts });

  try {
    // DTR/RTS timing: how long one change takes to complete.
    onStep('signals', 'running');
    const times = [];
    let signalError = null;
    for (let i = 0; i < 12; i++) {
      const s = now();
      try { await set(i % 2 === 0, false); } catch (err) { signalError = err?.message || String(err); break; }
      times.push(now() - s);
    }
    const sorted = [...times].sort((a, b) => a - b);
    result.signals = signalError ? { ok: false, error: signalError } : {
      ok: true, samples: times.length,
      medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0), maxMs: round(sorted.at(-1) ?? 0), minMs: round(sorted[0] ?? 0),
    };
    onStep('signals', 'done', result.signals);
    await set(false, false);
    await sleep(300);

    // Reset sequences.
    for (const r of RESETS) {
      onStep(r.id, 'running');
      const entry = { id: r.id, label: r.label };
      try {
        const start = now();
        const stepTimes = [];
        for (const step of r.steps) {
          if (typeof step === 'number') { await sleep(step); continue; }
          const s = now();
          if (!Array.isArray(step)) {
            // One line on its own: { dtr } or { rts }.
            await port.setSignals('dtr' in step ? { dataTerminalReady: step.dtr } : { requestToSend: step.rts });
            stepTimes.push(round(now() - s));
            continue;
          }
          const [dtr, rts] = step;
          if (r.split) {
            // As esptool-js does it: DTR, then RTS, as two separate changes.
            await port.setSignals({ dataTerminalReady: dtr });
            await port.setSignals({ requestToSend: rts });
          } else {
            await set(dtr, rts);
          }
          stepTimes.push(round(now() - s));
        }
        await sleep(LISTEN_MS);
        const boot = rx.since(start);
        const text = ascii(boot.bytes);
        entry.signalMs = stepTimes;
        entry.bytes = boot.bytes.length;
        entry.firstByteMs = boot.firstAt != null ? round(boot.firstAt - start) : null;
        entry.outcome = classifyBoot(text, boot.bytes.length);
        entry.output = text.slice(0, 400);

        // SYNC: does the ROM loader answer? (Only a module in download mode does.)
        if (r.id !== 'run') {
          const syncStart = now();
          let replied = false;
          let tries = 0;
          for (; tries < SYNC_TRIES && !replied; tries++) {
            await writer.write(SYNC_FRAME);
            await sleep(SYNC_WAIT_MS);
            replied = hasSyncReply(rx.since(syncStart).bytes);
          }
          const reply = rx.since(syncStart);
          entry.sync = { replied, tries, replyBytes: reply.bytes.length };
        }
      } catch (err) {
        entry.error = `${err?.name || 'Error'}: ${err?.message || err}`;
      }
      result.resets.push(entry);
      onStep(r.id, 'done', entry);
      // Let the module settle before the next sequence.
      try { await set(false, false); } catch { /* recorded above */ }
      await sleep(400);
    }
  } finally {
    try { writer.releaseLock(); } catch { /* ignore */ }
    await rx.stop();
    if (rx.error) result.readError = rx.error;
    try { await port.close(); result.closed = true; } catch (err) { result.closed = `${err?.name}: ${err?.message}`; }
  }
  return result;
}

/**
 * The USB route (WebUSB, as on Android and Linux): can the browser claim the chip directly? On
 * Windows the CH340 driver normally holds it, which is expected; a report records what happened.
 * @param {USBDevice} device from navigator.usb.requestDevice()
 */
export async function probeUsbDevice(device) {
  const out = {
    vendorId: `0x${device.vendorId.toString(16).padStart(4, '0')}`, productId: `0x${device.productId.toString(16).padStart(4, '0')}`,
    product: device.productName || null, usbVersion: `${device.usbVersionMajor}.${device.usbVersionMinor}`,
  };
  const step = async (name, fn) => {
    try { await fn(); out[name] = 'ok'; return true; } catch (err) { out[name] = `${err?.name || 'Error'}: ${err?.message || err}`; return false; }
  };
  if (await step('open', () => device.open())) {
    if (device.configuration == null) await step('selectConfiguration', () => device.selectConfiguration(1));
    if (await step('claimInterface', () => device.claimInterface(0))) await step('releaseInterface', () => device.releaseInterface(0));
    await step('close', () => device.close());
  }
  return out;
}

/** One-line English verdict for the report, from the serial result. */
export function serialVerdict(r) {
  if (!r?.open) return 'Not run';
  if (!r.open.ok) return `The port could not be opened (${r.open.error}).`;
  const resets = r.resets.filter((x) => x.id !== 'run');
  const synced = resets.filter((x) => x.sync?.replied).map((x) => x.id);
  if (synced.length) return `The module answered after: ${synced.join(', ')}.`;
  const run = r.resets.find((x) => x.id === 'run');
  if (resets.some((x) => x.outcome === 'download')) return 'The module reached download mode but never answered SYNC.';
  if (resets.some((x) => x.outcome === 'normal-boot')) return 'Resets work but the module boots normally: IO0 isn’t low when EN releases (reset timing).';
  if (run && run.bytes > 0) return 'The module prints on a normal restart, but no download reset reached the ROM loader.';
  return 'Nothing came back from the module after any reset (no data on the line).';
}
