/**
 * movesets.js — Per-fighter attacks as data, plus the knockback helpers the training dummy uses.
 *
 * Every move: `from`/`to` default active frames, `total` frames, `hitboxes` [{x, y, r, dmg, angle, bkb,
 * kbg}] in arena units relative to the fighter's feet, facing right (+y up; the body is a circle of
 * radius 7 centred at y = 7). A hitbox may override `from`/`to`; `g` is its hit group (one hit per group
 * per move: sweetspot + sourspot share a group, multi-hit moves use one group per hit). Hitboxes are
 * listed in priority order (sweetspot first). Angle 361 = the "Sakurai angle".
 * Smash attacks (`smash`) can be charged on frame `charge` for up to 60 frames (damage × up to 1.3671).
 * Aerials: `landLag`, `lcLag` (L-cancelled: half, rounded down) and `autocancel` [a, b] — landing before
 * frame a or from frame b on gives normal landing lag.
 * `specials` are parameters for the archetypes in specials.js (no per-character code).
 *
 * Sources (behaviour / numbers reference only; no game code, data files or extracted hitbox tables):
 *   SmashWiki character pages, SSBM movesets (frame data, damage, landing lag), e.g.
 *     https://www.ssbwiki.com/Mario_(SSBM)  …/Fox_(SSBM)  …/Falco_(SSBM)  …/Marth_(SSBM)  …/Peach_(SSBM)
 *     …/Ice_Climbers_(SSBM)  …/Captain_Falcon_(SSBM)  …/Jigglypuff_(SSBM)  …/Mr._Game_%26_Watch_(SSBM)
 *   SmashWiki "Knockback" (formula), "Hitstun" (× 0.4), "Smash attack" (charge × 1.3671 over 60 frames),
 *     "Sakurai angle", "L-cancel", "Auto-cancel", "Weight" (weights are in constants.js → FIGHTERS.w).
 *   Community frame data: https://meleeframedata.com and https://ikneedata.com/calculator.html
 * Frame/damage values were compiled from those references by hand and NEED REVIEW: active windows,
 * totals and damage aim to match the published numbers; BKB/KBG of many moves and every hitbox
 * position/size are our approximations (drawn by eye to match each move's shape and reach — Sable's
 * sword and tipper, Rally's knee, Mochi's short reach …). Ice Climbers' partner is not modelled.
 */
import { N_ } from '../../i18n/index.js';

// Hit labels shown in the last-hit chip.
const TIP = N_('tipper');
const SOUR = N_('sourspot');
const SWEET = N_('sweetspot');
const CLEAN = N_('clean hit');
const LATE = N_('late hit');
const METEOR = N_('meteor');

/** Move names (translated where shown). Specials carry their own names. */
export const MOVE_NAMES = {
  jab: N_('Jab'), ftilt: N_('Side tilt'), utilt: N_('Up tilt'), dtilt: N_('Down tilt'), dash: N_('Dash attack'),
  fsmash: N_('Forward smash'), usmash: N_('Up smash'), dsmash: N_('Down smash'), grab: N_('Grab'),
  nair: N_('Neutral air'), fair: N_('Forward air'), bair: N_('Back air'), uair: N_('Up air'), dair: N_('Down air'),
};

// ---- Tiny builders -------------------------------------------------------------------------------
const hb = (x, y, r, dmg, angle, bkb, kbg, o = {}) => ({ x, y, r, dmg, angle, bkb, kbg, ...o });
const mv = (from, to, total, hitboxes, o = {}) => ({ from, to, total, hitboxes, ...o });
const sm = (from, to, total, hitboxes, o = {}) => mv(from, to, total, hitboxes, { smash: true, charge: Math.max(2, from - 4), ...o });
const air = (from, to, total, landLag, autocancel, hitboxes, o = {}) =>
  mv(from, to, total, hitboxes, { landLag, lcLag: Math.floor(landLag / 2), autocancel, ...o });
/** Multi-hit: one hitbox per start frame, each its own hit group. */
const hits = (starts, len, box) => starts.map((s, i) => ({ ...box, from: s, to: s + len - 1, g: i }));
const grab = (reach, r = 4) => mv(7, 8, 30, [hb(reach, 8, r, 0, 0, 0, 0, { grab: true })]);

// ---- Movesets -------------------------------------------------------------------------------------
const SETS = {
  // Mario — compact all-rounder: short reach, fireball, coin-punch recovery.
  dot: {
    jab: mv(2, 3, 17, [hb(10, 8, 4.5, 3, 361, 0, 50)]),
    ftilt: mv(5, 8, 31, [hb(15, 8, 4.5, 9, 361, 8, 100), hb(9, 8, 4, 7, 361, 8, 100)]),
    utilt: mv(5, 11, 30, [hb(5, 16, 5.5, 9, 96, 20, 125), hb(-3, 15, 4.5, 9, 96, 20, 125)]),
    dtilt: mv(5, 7, 30, [hb(14, 2, 4.5, 10, 80, 20, 70), hb(8, 2, 4, 10, 80, 20, 70)]),
    dash: mv(6, 25, 39, [hb(11, 3, 5, 9, 72, 30, 60, { to: 9, tag: CLEAN }), hb(11, 3, 4.5, 6, 72, 20, 50, { from: 10, tag: LATE })]),
    fsmash: sm(12, 15, 49, [hb(17, 8, 4.5, 17.8, 361, 25, 100, { tag: SWEET }), hb(10, 8, 4, 14.7, 361, 25, 100, { tag: SOUR })]),
    usmash: sm(9, 12, 39, [hb(2, 18, 6, 17, 85, 30, 95)]),
    dsmash: sm(5, 6, 49, [hb(12, 2, 5, 10, 361, 20, 70), hb(-12, 2, 5, 12, 361, 20, 70, { from: 15, to: 16, g: 1 })]),
    nair: air(3, 31, 49, 15, [2, 34], [hb(0, 7, 9, 12, 361, 0, 100, { to: 6, tag: CLEAN }), hb(0, 7, 8, 8, 361, 0, 100, { from: 7, tag: LATE })]),
    fair: air(16, 20, 59, 32, [3, 47], [hb(12, 5, 5, 14, 290, 10, 100, { tag: METEOR }), hb(8, 10, 4, 12, 361, 10, 100)]),
    bair: air(6, 17, 33, 15, [6, 21], [hb(-12, 7, 5.5, 11, 361, 0, 100, { to: 9, tag: CLEAN }), hb(-11, 7, 5, 8, 361, 0, 100, { from: 10, tag: LATE })]),
    uair: air(4, 8, 30, 15, [3, 16], [hb(3, 17, 6, 11, 70, 0, 100)]),
    dair: air(10, 29, 49, 23, [9, 40], hits([10, 13, 16, 19, 22, 25], 2, hb(0, 0, 6, 2, 80, 10, 30))),
    grab: grab(12),
    specials: {
      neutral: { kind: 'projectile', name: 'Fireball', total: 44, fire: 17, speed: 1.6, vy: -0.6, g: 0.1, bounce: 1.4, life: 90, r: 3, look: 'fire',
        hit: { dmg: 6, angle: 361, bkb: 5, kbg: 10 } },
      side: { kind: 'strike', name: 'Cape', from: 12, to: 18, total: 36, hitboxes: [hb(11, 8, 6, 7, 110, 30, 30)] },
      up: { kind: 'recovery', name: 'Super Jump Punch', startup: 3, total: 42, vy: 3.6, vx: 0.9,
        hitboxes: [hb(6, 11, 5.5, 10, 80, 40, 40, { from: 3, to: 3, tag: CLEAN }), ...hits([6, 10, 14, 18], 2, hb(5, 15, 5, 1, 90, 30, 0)).map((h) => ({ ...h, g: h.g + 1 }))] },
      down: { kind: 'strike', name: 'Tornado', from: 6, to: 30, total: 60, vy: 0.4,
        hitboxes: [...hits([6, 10, 14, 18, 22, 26], 2, hb(0, 7, 10, 1, 85, 10, 0)), hb(0, 7, 11, 4, 40, 40, 100, { from: 30, to: 30, g: 9 })] },
    },
  },

  // Fox — fast pokes, shine on frame 1, no-flinch laser.
  vix: {
    jab: mv(2, 3, 17, [hb(9, 9, 4, 4, 361, 0, 100)]),
    ftilt: mv(5, 8, 26, [hb(15, 6, 4.5, 9, 361, 8, 100, { tag: SWEET }), hb(9, 6, 4, 7, 361, 8, 100)]),
    utilt: mv(5, 11, 23, [hb(-6, 15, 5, 12, 110, 18, 140, { to: 7, tag: CLEAN }), hb(-4, 16, 4.5, 9, 110, 18, 140, { from: 8, tag: LATE })]),
    dtilt: mv(7, 9, 27, [hb(13, 2, 5, 10, 80, 30, 100)]),
    dash: mv(4, 17, 39, [hb(10, 6, 5, 7, 72, 30, 50, { to: 7, tag: CLEAN }), hb(10, 6, 4.5, 5, 72, 20, 50, { from: 8, tag: LATE })]),
    fsmash: sm(12, 22, 39, [hb(15, 8, 4.5, 15, 361, 10, 100, { to: 15, tag: CLEAN }), hb(13, 8, 4, 12, 361, 10, 100, { from: 16, tag: LATE })]),
    usmash: sm(7, 17, 41, [hb(1, 17, 6.5, 18, 80, 30, 112, { to: 8, tag: CLEAN }), hb(1, 17, 6, 13, 80, 30, 112, { from: 9, tag: LATE })]),
    dsmash: sm(6, 11, 50, [hb(11, 2, 5, 15, 25, 20, 65), hb(-11, 2, 5, 15, 25, 20, 65)]),
    nair: air(4, 31, 49, 15, [4, 42], [hb(5, 7, 6, 12, 361, 0, 100, { to: 7, tag: CLEAN }), hb(5, 7, 5.5, 9, 361, 0, 100, { from: 8, tag: LATE })]),
    fair: air(6, 41, 59, 22, [4, 53], hits([6, 16, 24, 33, 39], 3, hb(10, 8, 6, 5, 361, 10, 30))),
    bair: air(4, 19, 39, 20, [4, 24], [hb(-11, 7, 5, 15, 361, 0, 100, { to: 7, tag: CLEAN }), hb(-10, 7, 4.5, 9, 361, 0, 100, { from: 8, tag: LATE })]),
    uair: air(8, 14, 39, 18, [8, 28], [hb(2, 16, 5, 5, 80, 0, 50, { to: 9 }), hb(2, 17, 6, 13, 70, 30, 120, { from: 11, g: 1 })]),
    dair: air(5, 25, 49, 18, [5, 33], hits([5, 8, 11, 14, 17, 20, 23], 2, hb(0, 0, 5.5, 2, 290, 0, 30))),
    grab: grab(11),
    specials: {
      neutral: { kind: 'projectile', name: 'Blaster', total: 30, fire: 9, speed: 5, life: 40, r: 2, look: 'laser',
        hit: { dmg: 3, flinch: false } },
      side: { kind: 'dash', name: 'Illusion', total: 60, travel: [20, 27], speed: 6, helpless: true,
        hitboxes: [hb(0, 7, 8, 3, 80, 40, 30, { from: 20, to: 27 })] },
      up: { kind: 'recovery', name: 'Fire', travel: 'aim', startup: 43, travelFrames: 30, speed: 3, total: 90,
        hitboxes: [...hits([20, 26, 32, 38], 2, hb(0, 7, 8, 2, 90, 30, 0)), hb(0, 7, 9, 16, 361, 30, 60, { from: 43, to: 72, g: 9 })] },
      down: { kind: 'window', name: 'Reflector', effect: 'reflect', total: 21, window: [1, 20], hold: 4, jumpCancel: 4, stall: 4,
        hitboxes: [hb(0, 7, 9, 5, 361, 30, 50, { from: 1, to: 1 })] },
    },
  },

  // Falco — like Fox but stronger single hits, spiking down air, flinching laser, pop-up shine.
  quill: {
    jab: mv(2, 3, 17, [hb(9, 9, 4, 4, 361, 0, 100)]),
    ftilt: mv(5, 8, 26, [hb(14, 7, 4.5, 9, 361, 8, 100), hb(8, 7, 4, 7, 361, 8, 100)]),
    utilt: mv(5, 11, 23, [hb(-5, 16, 5.5, 13, 100, 20, 120)]),
    dtilt: mv(7, 10, 27, [hb(13, 2, 5, 12, 80, 20, 100, { to: 8, tag: CLEAN }), hb(13, 2, 4.5, 9, 80, 20, 100, { from: 9, tag: LATE })]),
    dash: mv(4, 7, 39, [hb(11, 6, 5, 9, 72, 30, 50)]),
    fsmash: sm(12, 22, 40, [hb(16, 9, 5, 16, 361, 20, 95, { to: 15, tag: CLEAN }), hb(13, 9, 4.5, 12, 361, 20, 95, { from: 16, tag: LATE })]),
    usmash: sm(7, 17, 40, [hb(0, 18, 7, 17, 80, 30, 110, { to: 8, tag: CLEAN }), hb(0, 18, 6.5, 13, 80, 30, 110, { from: 9, tag: LATE })]),
    dsmash: sm(5, 10, 45, [hb(12, 2, 5.5, 16, 25, 25, 70), hb(-12, 2, 5.5, 16, 25, 25, 70)]),
    nair: air(4, 31, 49, 15, [4, 42], [hb(5, 7, 6, 12, 361, 0, 100, { to: 7, tag: CLEAN }), hb(5, 7, 5.5, 8, 361, 0, 100, { from: 8, tag: LATE })]),
    fair: air(6, 41, 53, 22, [4, 47], hits([6, 13, 20, 27, 34, 41], 2, hb(11, 8, 6, 4, 361, 10, 30))),
    bair: air(4, 19, 39, 20, [4, 24], [hb(-11, 7, 5, 14, 361, 0, 100, { to: 7, tag: CLEAN }), hb(-10, 7, 4.5, 9, 361, 0, 100, { from: 8, tag: LATE })]),
    uair: air(8, 14, 39, 18, [8, 28], [hb(3, 16, 6, 9, 80, 20, 60, { to: 10 }), hb(3, 17, 6, 8, 80, 30, 110, { from: 12, g: 1 })]),
    dair: air(5, 25, 49, 32, [4, 32], [hb(1, -1, 5.5, 12, 290, 10, 100, { to: 14, tag: METEOR }), hb(1, -1, 5, 10, 361, 10, 100, { from: 15, tag: LATE })]),
    grab: grab(11),
    specials: {
      neutral: { kind: 'projectile', name: 'Blaster', total: 37, fire: 18, speed: 4, life: 45, r: 2.2, look: 'laser',
        hit: { dmg: 3, angle: 361, bkb: 10, kbg: 10 } },
      side: { kind: 'dash', name: 'Phantasm', total: 60, travel: [20, 27], speed: 6, helpless: true,
        hitboxes: [hb(0, 7, 8, 7, 361, 30, 50, { from: 20, to: 27 })] },
      up: { kind: 'recovery', name: 'Fire', travel: 'aim', startup: 43, travelFrames: 20, speed: 3.2, total: 80,
        hitboxes: [...hits([20, 26, 32, 38], 2, hb(0, 7, 8, 2, 90, 30, 0)), hb(0, 7, 9, 14, 361, 30, 60, { from: 43, to: 62, g: 9 })] },
      down: { kind: 'window', name: 'Reflector', effect: 'reflect', total: 21, window: [1, 20], hold: 4, jumpCancel: 4, stall: 4,
        hitboxes: [hb(0, 7, 9, 6, 84, 70, 50, { from: 1, to: 1 })] },
    },
  },

  // Marth — long sword reach; the tip of the blade ("tipper") hits much harder than the base.
  sable: {
    jab: mv(4, 7, 20, [hb(21, 9, 3, 6, 361, 0, 50, { tag: TIP }), hb(13, 9, 4.5, 4, 361, 0, 50, { tag: SOUR })]),
    ftilt: mv(7, 10, 35, [hb(24, 10, 3.5, 13, 361, 5, 90, { tag: TIP }), hb(15, 10, 5, 9, 361, 5, 90, { tag: SOUR })]),
    utilt: mv(6, 13, 39, [hb(4, 26, 3.5, 13, 90, 30, 100, { tag: TIP }), hb(3, 17, 5.5, 9, 90, 30, 100, { tag: SOUR })]),
    dtilt: mv(7, 9, 19, [hb(24, 1.5, 3, 10, 30, 30, 50, { tag: TIP }), hb(15, 2, 4, 9, 30, 30, 50, { tag: SOUR })]),
    dash: mv(12, 15, 45, [hb(22, 6, 3.5, 12, 361, 30, 80, { tag: TIP }), hb(13, 7, 5, 10, 361, 30, 80, { tag: SOUR })]),
    fsmash: sm(10, 13, 48, [hb(26, 7, 3.5, 20, 361, 30, 70, { tag: TIP }), hb(15, 8, 5.5, 15, 361, 30, 70, { tag: SOUR })]),
    usmash: sm(13, 16, 45, [hb(1, 30, 3.5, 17, 90, 30, 80, { tag: TIP }), hb(1, 20, 6, 13, 90, 30, 80, { tag: SOUR })]),
    dsmash: sm(5, 7, 70, [hb(23, 2, 3.5, 17, 30, 30, 70, { tag: TIP }), hb(14, 2, 5, 12, 30, 30, 70, { tag: SOUR }),
      hb(-23, 2, 3.5, 20, 30, 30, 70, { from: 21, to: 23, g: 1, tag: TIP }), hb(-14, 2, 5, 15, 30, 30, 70, { from: 21, to: 23, g: 1, tag: SOUR })]),
    nair: air(6, 21, 46, 15, [5, 30], [hb(16, 9, 3.5, 10, 361, 10, 60, { to: 7, tag: TIP }), hb(9, 9, 6, 8, 361, 10, 60, { to: 7, tag: SOUR }),
      hb(-16, 9, 3.5, 12, 361, 10, 80, { from: 15, g: 1, tag: TIP }), hb(-9, 9, 6, 10, 361, 10, 80, { from: 15, g: 1, tag: SOUR })]),
    fair: air(4, 7, 30, 15, [3, 27], [hb(19, 12, 3.5, 13, 361, 10, 70, { tag: TIP }), hb(11, 12, 6, 9, 361, 10, 70, { tag: SOUR })]),
    bair: air(7, 10, 39, 22, [6, 32], [hb(-19, 10, 3.5, 14, 361, 20, 80, { tag: TIP }), hb(-11, 10, 6, 12, 361, 20, 80, { tag: SOUR })]),
    uair: air(5, 8, 37, 16, [4, 32], [hb(2, 26, 3.5, 13, 80, 30, 90, { tag: TIP }), hb(2, 17, 6, 11, 80, 30, 90, { tag: SOUR })]),
    dair: air(6, 9, 47, 32, [5, 44], [hb(4, -9, 3.5, 14, 290, 10, 80, { tag: METEOR }), hb(4, 0, 6.5, 12, 361, 10, 80, { tag: SOUR })]),
    grab: grab(15, 5),
    specials: {
      neutral: { kind: 'strike', name: 'Shield Breaker', from: 21, to: 24, total: 47, vx: 0.3,
        hitboxes: [hb(24, 9, 3.5, 9, 361, 30, 50, { tag: TIP }), hb(15, 9, 5, 7, 361, 30, 50, { tag: SOUR })] },
      side: { kind: 'strike', name: 'Dancing Blade', from: 6, to: 9, total: 30, vx: 0.6,
        hitboxes: [hb(20, 9, 4, 4, 361, 20, 40, { tag: TIP }), hb(12, 9, 5.5, 3, 361, 20, 40, { tag: SOUR })] },
      up: { kind: 'recovery', name: 'Dolphin Slash', startup: 5, total: 50, vy: 4.2, vx: 0.8,
        hitboxes: [hb(9, 14, 5, 13, 80, 70, 70, { from: 5, to: 5, tag: CLEAN }), hb(8, 16, 4.5, 7, 80, 50, 70, { from: 6, to: 12, tag: LATE })] },
      down: { kind: 'window', name: 'Counter', effect: 'counter', total: 59, window: [5, 29] },
    },
  },

  // Peach — golf-club side smash, spinning down smash, Toad counter, turnip toss.
  rosette: {
    jab: mv(2, 4, 20, [hb(9, 8, 4, 3, 361, 0, 50)]),
    ftilt: mv(7, 10, 34, [hb(15, 4, 4.5, 12, 361, 10, 100), hb(9, 5, 4, 10, 361, 10, 100)]),
    utilt: mv(13, 16, 47, [hb(0, 18, 9, 15, 90, 30, 100)]),
    dtilt: mv(5, 13, 30, hits([5, 9, 13], 1, hb(13, 2, 5, 3, 80, 20, 40))),
    dash: mv(6, 19, 40, hits([6, 10, 14, 18], 2, hb(10, 6, 6, 2, 80, 20, 20))),
    fsmash: sm(18, 21, 52, [hb(21, 8, 4.5, 18, 361, 30, 95, { tag: SWEET }), hb(12, 8, 4, 15, 361, 30, 95, { tag: SOUR })]),
    usmash: sm(13, 16, 48, [hb(4, 18, 5, 17, 90, 30, 95, { tag: SWEET }), hb(0, 13, 7.5, 12, 90, 30, 95, { tag: SOUR })]),
    dsmash: sm(5, 20, 40, hits([5, 8, 11, 14, 17], 2, hb(0, 3, 13, 4, 361, 20, 30))),
    nair: air(3, 23, 37, 16, [2, 30], [hb(0, 7, 9, 13, 361, 10, 100, { to: 5, tag: CLEAN }), hb(0, 7, 8, 10, 361, 10, 100, { from: 6, tag: LATE })]),
    fair: air(16, 19, 49, 18, [3, 43], [hb(10, 10, 6, 16, 361, 20, 100)]),
    bair: air(4, 14, 36, 18, [3, 27], [hb(-9, 6, 6, 12, 361, 10, 100, { to: 7, tag: CLEAN }), hb(-8, 6, 5.5, 9, 361, 10, 100, { from: 8, tag: LATE })]),
    uair: air(7, 11, 39, 16, [6, 34], [hb(0, 17, 7, 13, 80, 20, 100)]),
    dair: air(8, 22, 39, 16, [7, 30], hits([8, 12, 16, 20], 2, hb(0, -1, 6, 3, 280, 0, 50))),
    grab: grab(12),
    specials: {
      neutral: { kind: 'window', name: 'Toad', effect: 'counter', total: 50, window: [6, 30] },
      side: { kind: 'dash', name: 'Peach Bomber', total: 50, travel: [6, 24], speed: 2.6,
        hitboxes: [hb(0, 6, 8, 12, 361, 30, 70, { from: 8, to: 24 })] },
      up: { kind: 'recovery', name: 'Parasol', startup: 4, total: 46, vy: 3.5, vx: 0.8,
        hitboxes: hits([4, 8, 12], 2, hb(2, 16, 7, 3, 90, 40, 40)) },
      down: { kind: 'projectile', name: 'Turnip', total: 36, fire: 14, speed: 2.2, vy: 1.4, g: 0.12, life: 90, r: 3.5, look: 'arc',
        hit: { dmg: 6, angle: 361, bkb: 20, kbg: 60 } },
    },
  },

  // Ice Climbers (lead climber only) — hammer reach, ice shot along the ground, Blizzard.
  rime: {
    jab: mv(3, 4, 16, [hb(11, 8, 4.5, 3, 361, 0, 50)]),
    ftilt: mv(9, 11, 30, [hb(16, 9, 5.5, 9, 361, 10, 90)]),
    utilt: mv(7, 16, 36, [hb(4, 18, 6, 11, 90, 30, 90)]),
    dtilt: mv(8, 10, 26, [hb(15, 2, 5, 7, 35, 20, 80)]),
    dash: mv(10, 13, 40, [hb(13, 6, 6, 8, 361, 30, 60)]),
    fsmash: sm(15, 18, 54, [hb(18, 9, 6, 16, 361, 25, 90, { tag: SWEET }), hb(10, 9, 4.5, 12, 361, 25, 90, { tag: SOUR })]),
    usmash: sm(10, 13, 46, [hb(2, 22, 6.5, 13, 90, 30, 90)]),
    dsmash: sm(8, 18, 46, [hb(16, 2, 5.5, 9, 30, 25, 80, { to: 11 }), hb(-16, 2, 5.5, 9, 30, 25, 80, { from: 15, g: 1 })]),
    nair: air(7, 26, 41, 15, [6, 32], [hb(0, 7, 9.5, 8, 361, 0, 100)]),
    fair: air(15, 18, 49, 22, [3, 39], [hb(13, 6, 6, 15, 290, 10, 100, { tag: METEOR }), hb(8, 11, 4.5, 12, 361, 10, 100)]),
    bair: air(6, 12, 33, 15, [5, 25], [hb(-12, 7, 5.5, 9, 361, 0, 100)]),
    uair: air(7, 15, 43, 18, [6, 33], [hb(0, 19, 7.5, 11, 80, 20, 100)]),
    dair: air(8, 20, 45, 18, [7, 35], [hb(0, -2, 6, 9, 290, 10, 80, { to: 12, tag: METEOR }), hb(0, -1, 5.5, 6, 361, 10, 80, { from: 13, tag: LATE })]),
    grab: grab(12),
    specials: {
      neutral: { kind: 'projectile', name: 'Ice Shot', total: 42, fire: 12, speed: 1.2, life: 80, r: 3.5, look: 'ice',
        hit: { dmg: 4, angle: 361, bkb: 10, kbg: 30 } },
      side: { kind: 'strike', name: 'Squall Hammer', from: 6, to: 37, total: 60, vx: 1.2, vy: 0.2,
        hitboxes: hits([6, 12, 18, 24, 30, 36], 2, hb(0, 8, 11, 2, 80, 20, 20)) },
      up: { kind: 'recovery', name: 'Belay', startup: 15, total: 60, vy: 2.6, vx: 0.4, hitboxes: [hb(0, 18, 5, 4, 80, 30, 50, { from: 15, to: 25 })] },
      down: { kind: 'strike', name: 'Blizzard', from: 11, to: 40, total: 58,
        hitboxes: hits([11, 17, 23, 29, 35], 2, hb(16, 8, 6, 1, 361, 0, 10)) },
    },
  },

  // Captain Falcon — slow but heavy; the knee's 1-frame-wide sweetspot, Falcon Punch, grab-style dive.
  rally: {
    jab: mv(3, 4, 17, [hb(10, 9, 4, 3, 361, 0, 50)]),
    ftilt: mv(8, 11, 29, [hb(16, 7, 4.5, 10, 361, 10, 100), hb(9, 7, 4, 9, 361, 10, 100)]),
    utilt: mv(15, 17, 39, [hb(10, 10, 5.5, 13, 80, 20, 100)]),
    dtilt: mv(10, 13, 33, [hb(15, 2, 5, 10, 30, 20, 90)]),
    dash: mv(7, 16, 37, [hb(11, 7, 5.5, 10, 70, 40, 60, { to: 10, tag: CLEAN }), hb(11, 7, 5, 7, 70, 30, 60, { from: 11, tag: LATE })]),
    fsmash: sm(18, 21, 52, [hb(16, 9, 4.5, 22, 361, 20, 90, { tag: SWEET }), hb(8, 9, 4, 19, 361, 20, 90, { tag: SOUR })]),
    usmash: sm(21, 31, 54, [hb(5, 16, 5, 9, 90, 40, 30, { from: 21, to: 22 }), hb(-5, 17, 5.5, 13, 90, 30, 100, { from: 30, to: 31, g: 1 })]),
    dsmash: sm(18, 30, 52, [hb(14, 3, 5, 16, 30, 30, 80, { to: 19 }), hb(-14, 3, 5, 18, 30, 30, 80, { from: 29, to: 30, g: 1 })]),
    nair: air(7, 24, 39, 15, [6, 36], [hb(0, 7, 8, 7, 361, 10, 50, { to: 10 }), hb(0, 7, 8, 8, 361, 20, 100, { from: 16, g: 1 })]),
    fair: air(14, 31, 47, 18, [3, 41], [hb(9, 6, 3, 22, 361, 10, 100, { to: 15, tag: N_('knee') }), hb(6, 7, 6, 6, 45, 20, 50, { from: 16, tag: SOUR })]),
    bair: air(6, 14, 34, 20, [5, 19], [hb(-11, 7, 5, 13, 361, 10, 100, { to: 9, tag: CLEAN }), hb(-10, 7, 4.5, 10, 361, 10, 100, { from: 10, tag: LATE })]),
    uair: air(6, 14, 38, 18, [5, 25], [hb(3, 17, 6, 13, 80, 20, 100, { to: 8, tag: CLEAN }), hb(3, 16, 5.5, 10, 80, 20, 100, { from: 9, tag: LATE })]),
    dair: air(16, 20, 49, 30, [15, 37], [hb(2, -2, 5, 16, 270, 10, 100, { tag: METEOR }), hb(2, 4, 4, 14, 361, 10, 100)]),
    grab: grab(12),
    specials: {
      neutral: { kind: 'strike', name: 'Falcon Punch', from: 53, to: 54, total: 112, vx: 0.9, lunge: [40, 56],
        hitboxes: [hb(14, 9, 6, 28, 361, 20, 90)] },
      side: { kind: 'dash', name: 'Raptor Boost', total: 60, travel: [10, 26], speed: 2.8, helpless: true,
        hitboxes: [hb(9, 7, 6, 7, 85, 50, 60, { from: 15, to: 26 })] },
      up: { kind: 'recovery', name: 'Falcon Dive', startup: 14, total: 50, vy: 3.4, vx: 0.5, fwd: 0.6,
        hitboxes: [hb(7, 10, 6, 16, 80, 50, 70, { from: 14, to: 29, catch: true })] },
      down: { kind: 'strike', name: 'Falcon Kick', from: 15, to: 30, total: 70, vx: 2.6, vy: -2.5, lunge: [15, 30],
        hitboxes: [hb(9, 4, 5, 15, 361, 30, 90, { to: 19, tag: CLEAN }), hb(8, 4, 4.5, 11, 361, 20, 90, { from: 20, tag: LATE })] },
    },
  },

  // Jigglypuff — tiny reach, strong air game, Rest: frame-1 tiny sweetspot with massive knockback.
  mochi: {
    jab: mv(4, 6, 20, [hb(9, 8, 3.5, 3, 361, 0, 50)]),
    ftilt: mv(7, 10, 28, [hb(13, 5, 4, 10, 361, 10, 100)]),
    utilt: mv(9, 11, 29, [hb(-3, 15, 5, 10, 95, 20, 110)]),
    dtilt: mv(8, 11, 31, [hb(13, 2, 4, 10, 28, 20, 80)]),
    dash: mv(5, 21, 39, [hb(9, 6, 5, 12, 361, 30, 60, { to: 9, tag: CLEAN }), hb(9, 6, 4.5, 8, 361, 20, 60, { from: 10, tag: LATE })]),
    fsmash: sm(12, 15, 39, [hb(13, 7, 4.5, 16, 361, 20, 100)]),
    usmash: sm(13, 16, 39, [hb(0, 16, 5.5, 15, 90, 30, 100)]),
    dsmash: sm(8, 11, 39, [hb(11, 2, 4.5, 12, 30, 20, 80), hb(-11, 2, 4.5, 12, 30, 20, 80)]),
    nair: air(6, 26, 49, 15, [5, 25], [hb(0, 7, 8, 11, 361, 10, 100, { to: 9, tag: CLEAN }), hb(0, 7, 7.5, 9, 361, 10, 100, { from: 10, tag: LATE })]),
    fair: air(6, 10, 39, 15, [5, 25], [hb(10, 7, 4.5, 10, 361, 10, 100)]),
    bair: air(9, 12, 35, 15, [8, 27], [hb(-11, 7, 4.5, 13, 361, 0, 100)]),
    uair: air(9, 12, 34, 15, [8, 25], [hb(0, 16, 5, 9, 70, 30, 100)]),
    dair: air(4, 25, 50, 24, [3, 35], hits([4, 8, 12, 16, 20, 24], 2, hb(0, 0, 5.5, 2, 280, 0, 30))),
    grab: grab(10),
    specials: {
      neutral: { kind: 'strike', name: 'Rollout', from: 30, to: 70, total: 90, vx: 2.0, lunge: [30, 70],
        hitboxes: [hb(0, 7, 8, 10, 361, 40, 60)] },
      side: { kind: 'strike', name: 'Pound', from: 12, to: 15, total: 40, vy: 0.3,
        hitboxes: [hb(11, 7, 5, 10, 361, 20, 80)] },
      up: { kind: 'strike', name: 'Sing', from: 1, to: 1, total: 80, hitboxes: [] },
      down: { kind: 'strike', name: 'Rest', from: 2, to: 2, total: 240,
        hitboxes: [hb(0, 7, 2.5, 20, 361, 100, 100, { tag: SWEET })] },
    },
  },

  // Mr. Game & Watch — flat LCD moves, random Judge, Oil Panic bucket (absorb), Chef.
  'sir-retro': {
    jab: mv(3, 4, 17, [hb(10, 8, 4, 4, 361, 0, 50)]),
    ftilt: mv(9, 11, 35, [hb(14, 7, 6, 13, 361, 20, 100)]),
    utilt: mv(6, 18, 39, [hb(0, 16, 7.5, 9, 90, 30, 100)]),
    dtilt: mv(6, 9, 26, [hb(14, 1.5, 5, 10, 120, 30, 70)]),
    dash: mv(8, 20, 39, hits([8, 12, 16, 20], 1, hb(8, 7, 7, 3, 70, 20, 30))),
    fsmash: sm(15, 18, 46, [hb(15, 8, 6, 18, 361, 25, 100)]),
    usmash: sm(10, 18, 44, [hb(0, 17, 6.5, 18, 90, 30, 100)]),
    dsmash: sm(7, 9, 35, [hb(12, 2, 5.5, 16, 30, 30, 80), hb(-12, 2, 5.5, 16, 30, 30, 80)]),
    nair: air(8, 32, 49, 18, [7, 40], hits([8, 14, 20, 26, 32], 2, hb(0, 4, 7, 4, 361, 10, 40))),
    fair: air(8, 12, 40, 18, [7, 32], [hb(9, 3, 7, 15, 361, 20, 100)]),
    bair: air(7, 22, 37, 18, [6, 32], hits([7, 12, 17], 3, hb(-10, 6, 6, 4, 361, 10, 40))),
    uair: air(6, 20, 40, 18, [5, 34], [hb(0, 18, 9, 4, 80, 30, 20)]),
    dair: air(10, 20, 45, 23, [9, 38], [hb(0, -3, 5, 14, 270, 20, 80, { to: 12, tag: METEOR }), hb(0, -2, 4.5, 10, 361, 20, 80, { from: 13, tag: LATE })]),
    grab: grab(11),
    specials: {
      neutral: { kind: 'projectile', name: 'Chef', total: 30, fire: 8, speed: 1.2, vy: 2.2, g: 0.12, life: 70, r: 3, look: 'arc',
        hit: { dmg: 5, angle: 361, bkb: 10, kbg: 40 } },
      side: { kind: 'strike', name: 'Judge', from: 13, to: 15, total: 46, judge: [2, 4, 6, 8, 10, 12, 14, 9, 32],
        hitboxes: [hb(12, 9, 6, 2, 361, 30, 80)] },
      up: { kind: 'recovery', name: 'Fire', startup: 2, total: 40, vy: 4.4, vx: 0.4, helpless: true,
        hitboxes: [hb(0, 2, 6, 6, 80, 40, 50, { from: 2, to: 6 })] },
      down: { kind: 'window', name: 'Oil Panic', effect: 'absorb', total: 30, window: [4, 22], hold: 10,
        dump: { name: 'Oil Panic', from: 9, to: 12, total: 44, hitboxes: [hb(14, 8, 9, 24, 361, 40, 90)] } },
    },
  },
};

/** Fill per-hitbox windows and groups so consumers never have to look at the move's defaults. */
function normalize(m) {
  m.hitboxes = (m.hitboxes || []).map((h) => ({ g: 0, ...h, from: h.from ?? m.from ?? 1, to: h.to ?? m.to ?? m.from ?? 1 }));
  return m;
}
for (const set of Object.values(SETS)) {
  for (const [id, m] of Object.entries(set)) if (id !== 'specials') { normalize(m); m.name = MOVE_NAMES[id]; }
  for (const d of Object.values(set.specials)) { normalize(d); if (d.dump) normalize(d.dump); }
}

/** The moveset of a roster id (falls back to Dot's). */
export const movesetFor = (id) => SETS[id] || SETS.dot;

// ---- Knockback (SmashWiki "Knockback", Melee) ---------------------------------------------------------
export const KB = {
  CHARGE_MAX: 60,          // frames a smash attack can be held
  CHARGE_BONUS: 0.3671,    // full charge = × 1.3671 damage
  HITSTUN: 0.4,            // hitstun frames = floor(KB × 0.4)
  LAUNCH: 0.03,            // launch speed (units/frame) per point of knockback
  DECAY: 0.051,            // launch speed lost per frame
};

/** Damage multiplier for a smash held `frames` frames. */
export const chargeMult = (frames) => 1 + KB.CHARGE_BONUS * Math.min(frames, KB.CHARGE_MAX) / KB.CHARGE_MAX;

/**
 * Melee knockback: ((((p/10 + p·d/20) · 200/(w+100) · 1.4) + 18) · kbg/100) + bkb, where p is the
 * target's percent AFTER the hit, d the hit's damage and w the target's weight.
 */
export function knockback(p, d, w, bkb, kbg) {
  return ((((p / 10 + (p * d) / 20) * (200 / (w + 100)) * 1.4) + 18) * (kbg / 100)) + bkb;
}

export const hitstun = (kb) => Math.floor(kb * KB.HITSTUN);
