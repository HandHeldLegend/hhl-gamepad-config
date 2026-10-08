/**
 * ch340-port.js: A Web Serial-shaped port for the controller's CH340 over WebUSB (Android).
 *
 * Built on Mitch's niceSerial.js (hoja_esptool/src/plugin/niceSerial.js): the same CH340 init sequence
 * and registers (115200 baud), the same modem-control request for DTR/RTS and 32-byte OUT packets.
 * What changed is how reads are served, because esptool-js times out a read by cancelling the
 * stream's reader:
 *
 *   - niceSerial started a USB read per stream pull. When esptool cancelled a read, that transfer was
 *     left pending and the next read queued a second one behind it on the same endpoint. On current
 *     Chrome for Android those reads never complete, so esptool's 1 s timeouts never fire and the
 *     connect hangs at "Connecting...".
 *   - Here ONE read loop runs for as long as the port is open and fills a buffer. A stream pull takes
 *     from that buffer; cancelling a reader just detaches it. No transfer is abandoned and no byte is
 *     lost between esptool's reads.
 *   - Control transfers (init, DTR/RTS) are awaited and run in order.
 *
 * Implements what esptool-js's Transport uses: getInfo(), open(), close(), readable, writable,
 * setSignals({ dataTerminalReady, requestToSend }), getSignals().
 */

/** USB ids of the CH340 in HOJA controllers. */
export const CH340_IDS = Object.freeze({ vendorId: 0x1a86, productId: 0x7522 });

const CMD_W = 0x9a;  // write register(s)
const CMD_C1 = 0xa1; // serial init
const CMD_C2 = 0xa4; // modem control (DTR/RTS, active low on the wire)
const CTO_D = 0x20;  // DTR
const CTO_R = 0x40;  // RTS
const OUT_PACKET = 32;
const IN_REQUEST = 64;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A control transfer that hasn't finished after this long is logged and no longer waited for. */
const CONTROL_WAIT_MS = 1000;
const hex = (n) => '0x' + n.toString(16);

export class Ch340Port {
  /**
   * Reuse an already-authorized CH340 (e.g. picked in the app's Connect dialog), else show the
   * WebUSB picker (needs a user gesture).
   */
  static async request() {
    if (!navigator.usb) throw new Error('WebUSB is not available in this browser.');
    const known = await navigator.usb.getDevices();
    let usb = known.find((d) => d.vendorId === CH340_IDS.vendorId && d.productId === CH340_IDS.productId)
      || known.find((d) => d.vendorId === CH340_IDS.vendorId);
    if (!usb) usb = await navigator.usb.requestDevice({ filters: [{ vendorId: CH340_IDS.vendorId }] });
    return new Ch340Port(usb);
  }

  /** @param {USBDevice} usb */
  constructor(usb) {
    this.usb = usb;
    this.ctrl = 0;
    this.buf = [];        // received chunks not yet read
    this.waiter = null;   // resolve() of a pull waiting for data
    this.running = false;
    this.error = null;
    this._readable = null;
    this._writable = null;
    this.ctrlChain = Promise.resolve();
  }

  getInfo() {
    return { usbVendorId: this.usb.vendorId, usbProductId: this.usb.productId };
  }

  async open() {
    const usb = this.usb;
    if (!usb.opened) await usb.open();
    if (!usb.configuration) await usb.selectConfiguration(1);
    const iface = usb.configuration.interfaces[0];
    try { await usb.claimInterface(iface.interfaceNumber); } catch (err) { if (!iface.claimed) throw err; }
    const eps = iface.alternate.endpoints;
    this.epIn = eps.find((e) => e.direction === 'in' && e.type === 'bulk').endpointNumber;
    this.epOut = eps.find((e) => e.direction === 'out' && e.type === 'bulk').endpointNumber;
    console.log(`CH340 open: in=${this.epIn} out=${this.epOut}`);

    // niceSerial's init sequence (Linux ch341 driver values): init, 115200 baud, timeout, no flow control.
    await this.#control(CMD_C1, 0, 0);
    await this.#control(CMD_W, 0x1312, 0xd982);
    await this.#control(CMD_W, 0x0f2c, 0x0007);
    await this.#control(CMD_W, 0x2727, 0);

    this.buf = [];
    this.error = null;
    this.running = true;
    this.rx = { bytes: 0, transfers: 0, sample: '' };
    this.#readLoop();
    // Diagnostics: what arrived, every 2 s while something did.
    this.statTimer = setInterval(() => {
      if (!this.rx.transfers) return;
      console.log(`CH340 rx: ${this.rx.bytes} bytes in ${this.rx.transfers} transfers, first: ${this.rx.sample}`);
      this.rx = { bytes: 0, transfers: 0, sample: '' };
    }, 2000);
  }

  async close() {
    clearInterval(this.statTimer);
    this.running = false;
    this.#wake(null);
    this._readable = null;
    this._writable = null;
    try { await this.ctrlChain; } catch { /* ignore */ }
    try { if (this.usb.opened) await this.usb.close(); } catch { /* already gone */ }
  }

  async forget() { /* WebUSB permissions persist per origin */ }

  async getSignals() {
    return { dataCarrierDetect: false, clearToSend: false, ringIndicator: false, dataSetReady: false };
  }

  async setSignals(signals) {
    console.log(`CH340 signals ${JSON.stringify(signals)}`);
    if (signals.dataTerminalReady !== undefined) this.ctrl = signals.dataTerminalReady ? (this.ctrl | CTO_D) : (this.ctrl & ~CTO_D & 0xff);
    if (signals.requestToSend !== undefined) this.ctrl = signals.requestToSend ? (this.ctrl | CTO_R) : (this.ctrl & ~CTO_R & 0xff);
    await this.#control(CMD_C2, ~this.ctrl & 0xff, 0);
  }

  /**
   * Vendor control transfers, strictly in order. A failure is logged, not thrown (as in niceSerial).
   * One that takes longer than CONTROL_WAIT_MS is logged and the caller goes on (niceSerial never
   * waited for DTR/RTS at all); the next transfer still queues behind it.
   */
  #control(request, value, index) {
    const label = `${hex(request)} ${hex(value)}`;
    const started = performance.now();
    const transfer = this.ctrlChain.then(() => this.usb.controlTransferOut({ requestType: 'vendor', recipient: 'device', request, value, index }))
      .then((r) => { const ms = Math.round(performance.now() - started); if (r?.status !== 'ok' || ms > 100) console.log(`CH340 control ${label}: ${r?.status} in ${ms} ms`); })
      .catch((err) => console.error(`CH340 control ${label} failed:`, err?.message || err));
    this.ctrlChain = transfer;
    let timer = 0;
    const slow = new Promise((resolve) => { timer = setTimeout(() => { console.warn(`CH340 control ${label}: still pending after ${CONTROL_WAIT_MS} ms`); resolve(); }, CONTROL_WAIT_MS); });
    return Promise.race([transfer, slow]).finally(() => clearTimeout(timer));
  }

  /** The one read loop: keeps a single IN transfer going while open and buffers what arrives. */
  async #readLoop() {
    let failures = 0;
    while (this.running) {
      try {
        const r = await this.usb.transferIn(this.epIn, IN_REQUEST);
        if (!this.running) break;
        if (r.status === 'stall') { await this.usb.clearHalt('in', this.epIn); continue; }
        if (r.data && r.data.byteLength) {
          failures = 0;
          const chunk = new Uint8Array(r.data.buffer.slice(r.data.byteOffset, r.data.byteOffset + r.data.byteLength));
          if (!this.rx.transfers) this.rx.sample = Array.from(chunk.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join(' ');
          this.rx.transfers++;
          this.rx.bytes += chunk.byteLength;
          this.#push(chunk);
        }
      } catch (err) {
        if (!this.running) break;
        if (err?.name === 'NotFoundError' || ++failures > 20) {
          console.error('CH340 read stopped:', err?.message || err);
          this.running = false;
          this.error = err;
          this.#wake(null);
          break;
        }
        await sleep(10);
      }
    }
  }

  #push(chunk) {
    if (this.waiter) this.#wake(chunk);
    else this.buf.push(chunk);
  }

  #wake(value) {
    const w = this.waiter;
    this.waiter = null;
    w?.(value);
  }

  /** Next buffered chunk, or null once the port is closed. */
  #next() {
    if (this.buf.length) return Promise.resolve(this.buf.shift());
    if (!this.running) return Promise.resolve(null);
    return new Promise((resolve) => { this.waiter = resolve; });
  }

  get readable() {
    if (this._readable) return this._readable;
    const stream = new ReadableStream({
      pull: async (controller) => {
        const chunk = await this.#next();
        if (this._readable !== stream) { if (chunk) this.buf.unshift(chunk); return; } // cancelled meanwhile: keep the data
        if (chunk === null) { if (this.error) controller.error(this.error); else controller.close(); return; }
        controller.enqueue(chunk);
      },
      // esptool cancels a reader to time out a read: detach only (the read loop keeps running).
      cancel: () => {
        if (this._readable === stream) this._readable = null;
        if (this.waiter) this.#wake(undefined); // the pending pull sees the stream was cancelled and returns
      },
    }, { highWaterMark: 0 });
    this._readable = stream;
    return stream;
  }

  get writable() {
    if (this._writable) return this._writable;
    const stream = new WritableStream({
      write: async (chunk) => {
        try {
          for (let pos = 0; pos < chunk.byteLength; pos += OUT_PACKET) {
            await this.usb.transferOut(this.epOut, chunk.subarray(pos, pos + OUT_PACKET));
          }
        } catch (err) {
          if (this._writable === stream) this._writable = null; // an errored stream stays errored: start fresh next time
          throw err;
        }
      },
    });
    this._writable = stream;
    return stream;
  }
}
