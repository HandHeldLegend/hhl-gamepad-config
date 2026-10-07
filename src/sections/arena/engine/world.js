/**
 * world.js: One running match of the ported engine: the fighter (port 0), an optional training dummy
 * (port 1, a second player that never presses anything), the stage, projectiles and the target test.
 *
 * step() is meleelight's gameTick() for a match in progress (main/main.js), and targetHits() its target
 * test collision (target/targetplay.js), ported from meleelight (MIT, (c) 2016 Will Blackett). The
 * input history (8 frames, [0] = this frame) follows interpretInputs(). Everything else is HOJA glue.
 *
 * The engine modules keep their state in module-level variables (as meleelight does). Each World owns
 * its own copy and swaps it in before stepping (activate()), so several Games (the tests) never share
 * players, projectiles or queues.
 */
import { setWorldGlobals, gameSettings, characterSelections as liveSel } from './ml.js';
import { playerObject } from './player.js';
import { physics, useEcbSquashData } from './physics.js';
import { resetHitQueue, hitDetect, executeHits, checkPhantoms, setPhantonQueue, phantomQueue, interpolatedHitCircleCollision } from './hit.js';
import { useArticles, aArticles, executeArticles, destroyArticles, articlesHitDetection, executeArticleHits,
  destroyArticleQueue, articles, interpolatedArticleCircleCollision } from './article.js';
import { actionStates } from './shortcuts.js';
import { Vec2D } from './util.js';

/** meleelight's per-frame input record (input/input.js inputData). Sticks −1..1 (+y up), triggers 0..1. */
export function inputData() {
  return { a: false, b: false, x: false, y: false, z: false, r: false, l: false, s: false,
    du: false, dr: false, dd: false, dl: false,
    lsX: 0, lsY: 0, csX: 0, csY: 0, lA: 0, rA: 0, rawX: 0, rawY: 0, rawcsX: 0, rawcsY: 0 };
}
const history = () => Array.from({ length: 8 }, inputData);

export class World {
  /**
   * @param {{stage: object, fighter: number, dummy?: number|null, targets?: Array<{x:number,y:number}>}} o
   *        fighter / dummy: engine character ids (roster.js); dummy null = no dummy.
   */
  constructor(o) {
    this.stage = o.stage;
    this.player = [];
    this.characterSelections = [o.fighter, o.dummy ?? 0, 0, 0];
    this.playerType = [0, o.dummy != null ? 0 : -1, -1, -1];
    this.input = [history(), history(), history(), history()];
    this.articles = [];
    this.phantoms = [];
    this.squash = [0, 1, 2, 3].map(() => ({ location: null, factor: 1 }));
    this.activate();
    this.spawn(0, o.fighter);
    if (o.dummy != null) this.spawn(1, o.dummy);
  }

  /** Point the engine's module-level state at this world. */
  activate() {
    setWorldGlobals(this);
    useArticles(this.articles);
    useEcbSquashData(this.squash);
    setPhantonQueue(this.phantoms);
  }

  /** Put a fresh player on the stage, standing (meleelight buildPlayerObject + startGame). */
  spawn(port, charId) {
    const s = this.stage;
    const at = s.startingPoint[port];
    const pl = new playerObject(charId, [at.x, at.y], s.startingFace[port]);
    const P = () => new Vec2D(at.x, at.y);
    pl.phys.ECB1 = [P(), P(), P(), P()];
    pl.phys.ECBp = [P(), P(), P(), P()];
    pl.inCSS = false;
    pl.stocks = 99;
    pl.phys.grounded = true;
    pl.phys.onSurface = [0, 0];
    this.player[port] = pl;
    this.characterSelections[port] = charId;
    this.squash[port] = { location: null, factor: 1 };
    actionStates[charId].WAIT.init(port, this.input);
  }

  /**
   * Advance one frame. `inputs[port]` is this frame's inputData() (missing ports read as nothing held).
   * Order as in meleelight's gameTick: articles, every player's physics, phantom hits, hit detection,
   * hits, article hits. `edges` (port 0): presses to treat as new this frame (latched taps and the
   * Arena's optional input buffer, see controller.js EngineInput): the previous frame reads as released.
   */
  step(inputs, { tapJump = true, edges = null } = {}) {
    this.activate();
    this.phantoms = phantomQueue; // setPhantonQueue may have replaced it last frame
    gameSettings.tapJumpOffp1 = tapJump ? 0 : 1;
    for (let i = 0; i < 4; i++) {
      if (this.playerType[i] < 0) continue;
      const h = this.input[i];
      h.pop();
      h.unshift(inputs[i] || inputData());
      if (i === 0 && edges) forceEdges(h[1], edges);
    }
    resetHitQueue();
    destroyArticles();
    executeArticles();
    for (let i = 0; i < 4; i++) if (this.playerType[i] > -1) physics(i, this.input);
    checkPhantoms();
    for (let i = 0; i < 4; i++) if (this.playerType[i] > -1) hitDetect(i, this.input);
    executeHits(this.input);
    articlesHitDetection();
    executeArticleHits(this.input);
    this.articles = aArticles; // the engine may have swapped the array (resetAArticles)
    this.phantoms = phantomQueue;
    // HOJA: float refresh (roster approximations only): landing or grabbing a ledge gives it back.
    for (const pl of this.player) {
      if (!pl || !pl.charAttributes.floatFrames) continue;
      if (pl.phys.grounded || pl.phys.onLedge > -1) { pl.phys.floatLeft = pl.charAttributes.floatFrames; pl.phys.floating = false; }
    }
  }

  /**
   * Target test collision for port `p` (meleelight targetHitDetection): returns the indices of `targets`
   * ({x, y, alive}) touched this frame by an active hitbox (or its swept path) or a projectile.
   */
  targetHits(targets, radius, p = 0) {
    this.activate();
    const pl = this.player[p];
    const hit = [];
    for (let t = 0; t < targets.length; t++) {
      const tg = targets[t];
      if (!tg.alive) continue;
      const at = new Vec2D(tg.x, tg.y);
      let done = false;
      for (let j = 0; j < 4 && !done; j++) {
        if (!pl.hitboxes.active[j]) continue;
        const swept = pl.phys.prevFrameHitboxes.active[j];
        if (hitTarget(pl, j, at, radius, false) || (swept && (hitTarget(pl, j, at, radius, true) || interpolatedHitCircleCollision(at, radius, p, j)))) {
          pl.hasHit = true;
          done = true;
        }
      }
      for (let a = 0; a < aArticles.length && !done; a++) {
        const inst = aArticles[a].instance;
        if (aArticles[a].player !== p) continue;
        const interpolate = inst.timer > 1;
        const near = (q) => (q.x - at.x) ** 2 + (q.y - at.y) ** 2 <= (inst.hb.size + radius) ** 2;
        if (near(inst.pos) || (interpolate && (near(inst.posPrev) || interpolatedArticleCircleCollision(a, at, radius)))) {
          if (articles[aArticles[a].name].canTurboCancel) pl.hasHit = true;
          destroyArticleQueue.push(a);
          done = true;
        }
      }
      if (done) hit.push(t);
    }
    return hit;
  }

  /** Engine character id of a port (as the engine sees it right now). */
  charOf(port) { return liveSel[port]; }
}

/** HOJA: make this frame's press an edge by clearing it from the previous frame's record. */
function forceEdges(prev, e) {
  if (e.x) { prev.x = false; prev.y = false; }
  if (e.a) prev.a = false;
  if (e.b) prev.b = false;
  if (e.z) prev.z = false;
  if (e.shield) { prev.l = false; prev.r = false; prev.lA = 0; prev.rA = 0; }
  if (e.cstick) { prev.csX = 0; prev.csY = 0; }
}

/** meleelight hitTargetCollision (target/targetplay.js). */
function hitTarget(pl, j, at, radius, previous) {
  const hb = previous ? pl.phys.prevFrameHitboxes : pl.hitboxes;
  const off = hb.id[j].offset[hb.frame];
  if (!off) return false;
  const pos = previous ? pl.phys.posPrev : pl.phys.pos;
  const face = previous ? pl.phys.facePrev : pl.phys.face;
  const x = pos.x + off.x * face;
  const y = pos.y + off.y;
  return (at.x - x) ** 2 + (y - at.y) ** 2 <= (pl.hitboxes.id[j].size + radius) ** 2;
}
