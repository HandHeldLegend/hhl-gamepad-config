/**
 * game.js (The simulation): one hero on one course, stepped at a fixed 30 Hz. No DOM.
 *
 *   const game = new Game();                 // default course (course.js)
 *   game.step({ sx, sy, camYaw, jump, attack, crouch, jumpPressed, attackPressed, crouchPressed });
 *   game.hero.pos / .yaw / .action / .t      // state for rendering and the action readout
 *
 * Falling below KILL_Y (off the edge of the course) respawns the hero at the start.
 */
import { Course, COURSE } from './course.js';
import { Hero } from './hero.js';
import { KILL_Y } from './constants.js';

export class Game {
  /** @param {{course?: object, onRespawn?: Function}} o */
  constructor(o = {}) {
    this.course = new Course(o.course || COURSE);
    this.hero = new Hero(this.course);
    this.onRespawn = o.onRespawn || null;
    this.frame = 0;
    this.respawns = 0;
  }

  step(input) {
    this.hero.step(input);
    this.frame++;
    if (this.hero.pos.y < KILL_Y) this.respawn();
  }

  respawn() {
    this.hero.respawn();
    this.respawns++;
    this.onRespawn?.();
  }
}
