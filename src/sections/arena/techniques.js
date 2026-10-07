/**
 * techniques.js: The technique coach. Watches the engine's fighter frame by frame (action-state
 * transitions, timers, the input) and turns what happened into feedback chips and session stats:
 * short / full hops, wavedashes / wavelands / ledgedashes, L-cancels, dash backs, fast falls, shield
 * drops, ledge grabs, KOs, and why a jump press did nothing.
 *
 * It only observes; the engine (engine/) decides what the fighter does. Original code (the action-state
 * names are meleelight's, MIT, (c) 2016 Will Blackett).
 */
import { framesData } from './engine/ml.js';
import { FRAMES } from './constants.js';
import { N_, t } from '../../i18n/index.js';

/** Display names of attacks, by action state (translated where shown). */
const MOVE_NAMES = [
  [/^JAB/, N_('Jab')], [/^FORWARDTILT$/, N_('Side tilt')], [/^UPTILT$/, N_('Up tilt')], [/^DOWNTILT$/, N_('Down tilt')],
  [/^ATTACKDASH$/, N_('Dash attack')], [/^FORWARDSMASH$/, N_('Forward smash')], [/^UPSMASH$/, N_('Up smash')],
  [/^DOWNSMASH$/, N_('Down smash')], [/^(GRAB|CATCH)/, N_('Grab')], [/^THROW/, N_('Throw')],
  [/ATTACKAIRN$/, N_('Neutral air')], [/ATTACKAIRF$/, N_('Forward air')], [/ATTACKAIRB$/, N_('Back air')],
  [/ATTACKAIRU$/, N_('Up air')], [/ATTACKAIRD$/, N_('Down air')],
  [/^NEUTRALSPECIAL/, N_('Neutral special')], [/^SIDESPECIAL/, N_('Side special')], [/^UPSPECIAL|^FIREFOX/, N_('Up special')],
  [/^DOWNSPECIAL/, N_('Down special')], [/^(CLIFFATTACK|DOWNATTACK)/, N_('Getup attack')],
];
/** Translated name of the attack an action state performs (or a generic label). */
export function moveName(state) {
  for (const [re, name] of MOVE_NAMES) if (re.test(state)) return t(name);
  return t('Hit');
}

const isAerial = (s) => /^ATTACKAIR[NFBUD]$/.test(s);
const isJump = (s) => s === 'JUMPF' || s === 'JUMPB';
/** States a press can't change (landing, falling, being hit...): a change INTO one of these doesn't use a press. */
const PASSIVE = /^(WAIT|LANDING|LANDINGFALLSPECIAL|LANDINGATTACKAIR.|FALL|FALLAERIAL|FALLSPECIAL|OTTOTTO|OTTOTTOWAIT|DAMAGE.*|CLIFFCATCH|CLIFFWAIT|DEAD.*|REBIRTH.*|DOWN(BOUND|WAIT|DAMAGE)|MISSFOOT|STOPCEIL|CAPTURE.*|THROWN.*|SHIELDBREAK.*|FURAFURA|RUNBRAKE|SQUAT|SQUATWAIT|SQUATRV|WALLDAMAGE)$/;

/** Did the fighter start something new this frame (so the press offered this frame was used)? */
export function pressUsed(before, after) {
  if (after.state !== before.state) return !PASSIVE.test(after.state);
  return after.timer < before.timer && !PASSIVE.test(after.state);
}

export class Coach {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.lastLcPress = -9999;   // frame of the last shield / Z press (L-cancel)
    this.lcMissedAt = -9999;
    this.lcLateNoted = true;
    this.jumpFrame = -9999;     // frame the current jump left the ground (JUMPF / JUMPB entered from jumpsquat)
    this.jsqHeld = 0;           // frames jump was held during jumpsquat
    this.jsqTap = false;
    this.earlyAirdodge = -1;
    this.ledgeDropFrame = -9999;
    this.ad = null;             // the airdodge in progress {angle, late, fromJump, fromLedge}
    this.apexFrame = -1;
    this.ffNoted = false;
    this.prevVy = 0;
    this.lastAerial = null;     // {state, timer} of the aerial on the previous frame
    this.dashTilt = 0;          // frames the stick sat on the other side during a dash without a dash back
    this.dummyPercent = 0;
  }

  feedback(text, tone) { this.game.feedback(text, tone); }
  get stats() { return this.game.stats; }

  /**
   * One frame. before/after: {state, timer, vy, grounded} of the fighter around the engine step;
   * input: the engine input record used; pad: PadState; offered: presses offered (real or buffered).
   */
  frame({ before, after, input, pad, real, offered = real, frame, pl }) {
    const g = this.game;
    const st = after.state;
    const changed = st !== before.state;
    if (real.shield || real.z) {
      // Pressed just after landing an aerial with full lag? Say how late it was.
      if (!this.lcLateNoted && /^LANDINGATTACKAIR/.test(st) && frame - this.lcMissedAt <= 12) {
        this.lcLateNoted = true;
        this.feedback(t('L-cancel {n}f late', { n: frame - this.lcMissedAt }), 'yellow');
      }
      this.lastLcPress = frame;
    }

    // ---- Jumpsquat → short / full hop
    if (st === 'KNEEBEND') {
      if (!changed) {
        if (pad.held.jump || (pl.phys.jumpSquatType && pad.y >= 0.67)) { if (this.jsqHeld === after.timer - 1) this.jsqHeld = after.timer; }
        if (real.shield) this.earlyAirdodge = pl.charAttributes.jumpSquat - after.timer + 1;
      } else {
        this.jsqHeld = 1; this.jsqTap = !!pl.phys.jumpSquatType; this.earlyAirdodge = -1;
      }
    }
    if (before.state === 'KNEEBEND' && (isJump(st) || st === 'ESCAPEAIR' || st === 'LANDINGFALLSPECIAL' || isAerial(st) || /^JUMPAERIAL/.test(st))) {
      this.jumpFrame = frame;
      const short = pl.phys.jumpType === 0;
      const s = this.stats.hops; s.n++;
      const window = pl.charAttributes.jumpSquat;
      if (short) {
        s.short++;
        this.feedback(this.jsqTap ? t('Short hop ✓ · tap jump') : t('Short hop ✓ · jump held {n}f', { n: this.jsqHeld }), 'green');
      } else {
        this.feedback(t('Full hop · held {n}f+ (short hop: release within {window}f)', { n: this.jsqHeld, window }), 'lavender');
      }
      if (this.earlyAirdodge > 0 && st !== 'ESCAPEAIR' && st !== 'LANDINGFALLSPECIAL') {
        this.feedback(t('Airdodge {n}f too early: press it after lift-off', { n: this.earlyAirdodge }), 'yellow');
      }
      this.apexFrame = -1; this.ffNoted = false;
    }

    // ---- Airdodge → wavedash / waveland / ledgedash
    // (an airdodge into the ground can start and land on the same frame: straight to LANDINGFALLSPECIAL)
    const adLanded = st === 'LANDINGFALLSPECIAL' && changed && before.state !== 'ESCAPEAIR' && offered.shield;
    if ((st === 'ESCAPEAIR' && changed) || adLanded) {
      const x = input.lsX; const y = input.lsY;
      this.ad = {
        angle: x || y ? Math.atan2(y, x) : null,
        late: frame - this.jumpFrame,
        fromJump: frame - this.jumpFrame <= FRAMES.WAVEDASH_MAX_AIR,
        fromLedge: frame - this.ledgeDropFrame <= FRAMES.LEDGEDASH_MAX,
      };
    }
    if ((before.state === 'ESCAPEAIR' || adLanded) && st === 'LANDINGFALLSPECIAL' && this.ad) this.reportWaveland(frame);
    if (st !== 'ESCAPEAIR' && before.state !== 'ESCAPEAIR') this.ad = null;

    // ---- Aerial landing: L-cancel / autocancel
    if (isAerial(before.state)) this.lastAerial = { state: before.state, timer: before.timer };
    if (/^LANDINGATTACKAIR/.test(st) && changed && this.lastAerial) this.reportLcancel(pl, frame);
    if (st === 'LANDING' && changed && isAerial(before.state)) {
      this.feedback(t('Autocancel · {move} landed on frame {n}', { move: moveName(before.state), n: before.timer }), 'blue');
    }
    if (!isAerial(st)) this.lastAerial = isAerial(before.state) ? this.lastAerial : null;

    // ---- Dash back (DASH → SMASHTURN → DASH)
    if (before.state === 'DASH' && st === 'SMASHTURN') {
      const s = this.stats.dashback; s.n++;
      this.pendingDashBack = { frame, tilt: Math.abs(this.prevLsX ?? 0) >= 0.3 && Math.sign(this.prevLsX) === Math.sign(input.lsX) ? 1 : 0 };
    }
    if (before.state === 'SMASHTURN' && st === 'DASH' && this.pendingDashBack) {
      const s = this.stats.dashback; s.ok++;
      const n = this.pendingDashBack.tilt;
      if (n === 0) { s.perfect++; this.feedback(t('Dash back · frame-perfect'), 'green'); }
      else this.feedback(t('Dash back ✓ · {n}f in the tilt zone', { n }), 'green');
      this.pendingDashBack = null;
    }
    if (st !== 'SMASHTURN' && before.state === 'SMASHTURN') this.pendingDashBack = null;
    if (st === 'DASH' && input.lsX * pl.phys.face <= -0.3 && input.lsX * pl.phys.face > -0.79) {
      this.dashTilt++;
      if (this.dashTilt === 2) {
        this.stats.dashback.n++;
        this.feedback(t('Dash back missed · stick sat {n}f in the tilt zone', { n: this.dashTilt }), 'yellow');
      }
    } else this.dashTilt = 0;
    this.prevLsX = input.lsX;

    // ---- Fast fall
    const vy = pl.phys.cVel.y;
    if (!pl.phys.grounded) {
      if (this.prevVy > 0 && vy <= 0 && this.apexFrame < 0) this.apexFrame = frame;
      if (!before.fastfalled && pl.phys.fastfalled) {
        const late = this.apexFrame < 0 ? 0 : Math.max(0, frame - this.apexFrame - 1);
        const s = this.stats.fastfall; s.n++;
        if (late === 0) { s.perfect++; this.feedback(t('Fast fall · frame-perfect'), 'green'); }
        else this.feedback(t('Fast fall · {n}f after the peak', { n: late }), late <= 3 ? 'green' : 'blue');
        this.ffNoted = true;
      } else if (!pl.phys.fastfalled && !this.ffNoted && vy > 0 && pad.yDownSmash && /^(JUMP|FALL|ATTACKAIR)/.test(st)) {
        this.ffNoted = true;
        this.feedback(t('Fast fall too early · {n}f before the peak', { n: Math.ceil(vy / pl.charAttributes.gravity) }), 'yellow');
      }
    } else { this.apexFrame = -1; this.ffNoted = false; }
    if (/^JUMPAERIAL/.test(st) && changed) { this.apexFrame = -1; this.ffNoted = false; }
    this.prevVy = vy;

    // ---- Shield drop (GUARD → PASS) vs spot dodge on a platform
    if (before.state === 'GUARD' && st === 'PASS') {
      const s = this.stats.shieldDrop; s.n++; s.ok++;
      this.feedback(t('Shield drop ✓ · stick {angle}° from straight down', { angle: (Math.abs(Math.atan2(input.lsX, -input.lsY)) * 180 / Math.PI).toFixed(1) }), 'green');
    } else if (/^GUARD/.test(before.state) && st === 'ESCAPEN' && pl.phys.onSurface[0] === 1) {
      this.stats.shieldDrop.n++;
      this.feedback(t('Spot dodge instead of a shield drop: stop the stick between −0.65 and −0.7'), 'yellow');
    } else if (st === 'PASS' && changed) this.feedback(t('Platform drop'), 'blue');

    // ---- Ledge, KO, shield break
    if (st === 'CLIFFCATCH' && changed) { this.stats.ledge++; this.feedback(t('Ledge grab'), 'blue'); }
    if (before.state === 'CLIFFWAIT' && /^(FALL|JUMP)/.test(st)) this.ledgeDropFrame = frame;
    if (/^DEAD/.test(st) && changed) { this.stats.ko++; this.feedback(t('Out of bounds! Respawning…'), 'red'); }
    if (st === 'SHIELDBREAKFALL' && changed) this.feedback(t('Shield broke! Let go of the trigger a little sooner'), 'red');
  }

  reportWaveland() {
    const ad = this.ad;
    this.ad = null;
    const below = ad.angle == null ? null : Math.atan2(-Math.sin(ad.angle), Math.abs(Math.cos(ad.angle))) * 180 / Math.PI;
    const ang = below == null ? t('neutral, no slide') : `${below.toFixed(1)}°`;
    if (ad.fromLedge) {
      const n = this.game.frame - this.ledgeDropFrame;
      this.feedback(t('Ledgedash · {angle} · landed {n}f after letting go', { angle: ang, n }), n <= 30 ? 'green' : 'blue');
      return;
    }
    if (ad.fromJump) {
      const s = this.stats.wavedash; s.n++;
      if (below != null) s.angleSum += below;
      const late = ad.late;
      if (late === 0) s.perfect++;
      const rating = late === 0 ? t('frame-perfect') : t('{n}f late', { n: late });
      const steep = below != null && below > 45;
      this.feedback(steep ? t('Wavedash · {angle} · {rating} · steep (shallower slides further)', { angle: ang, rating })
        : t('Wavedash · {angle} · {rating}', { angle: ang, rating }), late === 0 && below != null && below <= 45 ? 'green' : 'blue');
      return;
    }
    this.feedback(t('Waveland · {angle}', { angle: ang }), 'blue');
  }

  reportLcancel(pl, frame) {
    const a = this.lastAerial;
    this.lastAerial = null;
    const move = moveName(a.state);
    if ((pl.charAttributes.noLcancel || []).includes(a.state)) {
      this.feedback(t('{move} can’t be L-cancelled · full landing lag', { move }), 'lavender');
      return;
    }
    const s = this.stats.lcancel; s.n++;
    const since = frame - this.lastLcPress; // 0 = pressed on the landing frame
    this.lcLateNoted = false;
    if (pl.phys.landingLagScaling === 2) {
      s.ok++;
      this.lcMissedAt = -9999;
      this.feedback(t('L-cancel ✓ · pressed {n}f before landing', { n: since }), 'green');
      return;
    }
    this.lcMissedAt = frame;
    if (since <= 40) this.feedback(t('L-cancel missed · {n}f early (window {window}f)', { n: since, window: FRAMES.LCANCEL }), 'yellow');
    else this.feedback(t('L-cancel missed · {move} landed with full lag', { move }), 'yellow');
  }

  /** Why a jump press did nothing in `state` (null = it could have worked). n = frames left when known. */
  jumpBlockedReason(pl) {
    const s = pl.actionState;
    const busy = (action, n) => (n != null && n > 0
      ? t('Jump ignored · {action} ({n}f left)', { action, n: Math.ceil(n) })
      : t('Jump ignored · {action}', { action }));
    const frames = framesData[this.game.world.characterSelections[0]] || {};
    if (/^LANDING/.test(s)) return busy(t('landing lag'), ((frames[s] ?? 0) - pl.timer) / (pl.phys.landingLagScaling || 1) + 1);
    if (s === 'KNEEBEND') return busy(t('already in jumpsquat'));
    if (isAerial(s)) return pl.timer <= pl.IASATimer ? busy(t('aerial attack'), pl.IASATimer - pl.timer + 1) : (pl.phys.doubleJumped ? t('No jumps left') : null);
    if (/^(JUMP|FALL|AERIALTURN)/.test(s) && s !== 'FALLSPECIAL') return pl.phys.doubleJumped && !pl.charAttributes.multiJump ? t('No jumps left') : null;
    if (s === 'ESCAPEAIR') return busy(t('airdodge'), 50 - pl.timer);
    if (s === 'FALLSPECIAL') return busy(t('helpless fall (until you land or grab a ledge)'));
    if (/^ESCAPE[BF]$/.test(s)) return busy(t('roll'), (frames[s] ?? 0) - pl.timer + 1);
    if (s === 'ESCAPEN') return busy(t('spot dodge'), (frames[s] ?? 0) - pl.timer + 1);
    if (/^(FURAFURA|SHIELDBREAK)/.test(s)) return busy(t('shield break'));
    if (s === 'CLIFFCATCH') return busy(t('ledge grab'));
    if (/^CLIFF(GETUP|ATTACK|ESCAPE)/.test(s)) return busy(t('ledge getup'));
    if (/^(DEAD|REBIRTH)/.test(s)) return busy(t('respawning'));
    if (/SPECIAL|^FIREFOX/.test(s)) return busy(t('special'));
    if (/^(JAB|FORWARD|UPTILT|DOWNTILT|UPSMASH|DOWNSMASH|ATTACKDASH|GRAB|CATCH|THROW)/.test(s)) return busy(t('attack'));
    return null;
  }
}
