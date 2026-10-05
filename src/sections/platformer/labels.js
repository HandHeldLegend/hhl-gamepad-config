/**
 * labels.js — Readable names of the hero's actions (hero.js), for the on-screen action readout.
 * Marked with N_() and translated where shown.
 */
import { N_ } from '../../i18n/index.js';
import { GROUND } from './constants.js';

const NAMES = {
  idle: N_('Standing'),
  decel: N_('Slowing down'),
  skid: N_('Skid'),
  turnEnd: N_('Turning around'),
  crouch: N_('Crouch'),
  crouchSlide: N_('Crouch slide'),
  punch: N_('Punch'),
  land: N_('Landing'),
  poundLand: N_('Ground pound landing'),
  bellySlide: N_('Belly slide'),
  getUp: N_('Getting up'),
  slide: N_('Sliding down a slope'),
  jump: N_('Jump'),
  double: N_('Double jump'),
  triple: N_('Triple jump'),
  backflip: N_('Backflip'),
  sideflip: N_('Side flip'),
  longJump: N_('Long jump'),
  wallKick: N_('Wall kick'),
  freefall: N_('Falling'),
  rollout: N_('Rollout'),
  kick: N_('Jump kick'),
  dive: N_('Dive'),
  bonk: N_('Bonk'),
  groundPound: N_('Ground pound'),
  wallHit: N_('Wall contact'),
  ledgeHang: N_('Hanging on a ledge'),
  ledgeClimb: N_('Climbing up'),
};
const WALK = N_('Walking');
const RUN = N_('Running');

/** English (untranslated) name of what the hero is doing; translate with t(). */
export function actionName(hero) {
  if (hero.action === 'walk') return hero.fwd >= GROUND.RUN_ANIM_SPEED ? RUN : WALK;
  return NAMES[hero.action] || hero.action;
}
