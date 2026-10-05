/**
 * analysis.js — Snapback warnings in Play.
 *
 *   SnapbackWatch  spots a stick that, after being released from a full press, bounces past neutral
 *                  to the OTHER side and back — the classic cause of unwanted turnarounds.
 */
import { STICK } from './constants.js';
import { t } from '../../i18n/index.js';

// ---------------------------------------------------------------------------------------------
// Snapback
// ---------------------------------------------------------------------------------------------

const SNAP_WINDOW_MS = 100; // a rebound has to start within this long of letting go
const SNAP_MAX_MS = 40;     // …and be over this quickly (a deliberate tilt the other way lasts longer)

class AxisSnap {
  constructor(axis) { this.axis = axis; this.reset(); }
  reset() { this.armed = 0; this.releasedAt = -1; this.crossedAt = -1; this.peak = 0; }
  update(v, t, report) {
    if (Math.abs(v) >= STICK.SMASH_X) { this.reset(); this.armed = Math.sign(v); return; }
    if (!this.armed) return;
    if (this.releasedAt < 0) {
      if (Math.abs(v) < STICK.NEUTRAL || Math.sign(v) !== this.armed) this.releasedAt = t; else return;
    }
    const opp = -this.armed * v; // > 0 when on the opposite side
    if (opp >= STICK.NEUTRAL) {
      if (this.crossedAt < 0) this.crossedAt = t;
      this.peak = Math.max(this.peak, opp);
      if (this.peak >= STICK.SMASH_X) { this.reset(); return; } // a deliberate flick the other way
    } else if (this.crossedAt >= 0) {
      if (t - this.crossedAt <= SNAP_MAX_MS) report({ axis: this.axis, from: this.armed, peak: this.peak, after: this.crossedAt - this.releasedAt, lasted: t - this.crossedAt });
      this.reset();
      return;
    }
    if (t - this.releasedAt > SNAP_WINDOW_MS && this.crossedAt < 0) this.reset();
  }
}

export class SnapbackWatch {
  constructor(report) {
    this.report = report;
    this.x = new AxisSnap('X');
    this.y = new AxisSnap('Y');
  }
  /** Feed a stick sample; t in ms. */
  update(x, y, t) {
    this.x.update(x, t, this.report);
    this.y.update(y, t, this.report);
  }
}

export function describeSnap(e) {
  const dir = e.axis === 'X' ? (e.from > 0 ? t('right → left') : t('left → right')) : (e.from > 0 ? t('up → down') : t('down → up'));
  return t('Snapback on {axis} ({dir}): bounced to {value} for {ms} ms',
    { axis: e.axis, dir, value: (e.from * -e.peak).toFixed(2), ms: Math.max(1, Math.round(e.lasted)) });
}
