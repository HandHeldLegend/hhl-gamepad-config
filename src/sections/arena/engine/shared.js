/**
 * shared.js: the shared action states (movement, jumps, shield, ledge, hitstun, tech, grabs...) used by every fighter.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { activeStage, blendColours, characterSelections, finishGame, framesData, pPal, palettes, player, sounds, templateOf } from './ml.js';
import { actionStates, airDrift, checkForAerials, checkForDash, checkForDoubleJump, checkForJump, checkForSmashTurn, checkForSmashes, checkForSpecials, checkForSquat, checkForTiltTurn, checkForTilts, executeIntangibility, fastfall, getAngle, isFinalDeath, mashOut, reduceByTraction, shieldDepletion, shieldSize, shieldTilt, tiltTurnDashBuffer, turnOffHitboxes } from './shortcuts.js';
import { Vec2D, dotProd, reflect } from './util.js';

/** Shared action states by name. */
export const S = {};

S.WAIT = {
  name: "WAIT",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "WAIT";
    pl.timer = 1;
    actionStates[characterSelections[p]].WAIT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer += 1;
    if (!acts.WAIT.interrupt(p, input)) {
      reduceByTraction(p, false);
      if (pl.timer > framesData[characterSelections[p]].WAIT) {
        acts.WAIT.init(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    let b;
    let t;
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (pl.inCSS) {
      b = [false, false];
      t = [false, false];
    } else {
      b = checkForSpecials(p, input);
      t = checkForTilts(p, input);
    }
    if (j[0] && !pl.inCSS) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (checkForSquat(p, input) && !pl.inCSS) {
      acts.SQUAT.init(p, input);
      return true;
    } else if (checkForDash(p, input) && !pl.inCSS) {
      acts.DASH.init(p, input);
      return true;
    } else if (checkForSmashTurn(p, input) && !pl.inCSS) {
      acts.SMASHTURN.init(p, input);
      return true;
    } else if (checkForTiltTurn(p, input) && !pl.inCSS) {
      pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
      acts.TILTTURN.init(p, input);
      return true;
    } else if (Math.abs(input[p][0].lsX) > 0.3 && !pl.inCSS) {
      acts.WALK.init(p, true, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DASH = {
  name: "DASH",
  canEdgeCancel: true,
  disableTeeter: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DASH";
    pl.timer = 0;
    actionStates[characterSelections[p]].DASH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DASH.interrupt(p, input)) {
      if (pl.timer === 2) {
        pl.phys.cVel.x += pl.charAttributes.dInitV * pl.phys.face;
        if (Math.abs(pl.phys.cVel.x) > pl.charAttributes.dMaxV) {
          pl.phys.cVel.x = pl.charAttributes.dMaxV * pl.phys.face;
        }
      }
      if (pl.timer === 4) {}
      if (pl.timer > 1) {
        if (Math.abs(input[p][0].lsX) < 0.3) {
          reduceByTraction(p, false);
        } else {
          const tempMax = input[p][0].lsX * pl.charAttributes.dMaxV;
          const tempAcc = input[p][0].lsX * pl.charAttributes.dAccA;
          pl.phys.cVel.x += tempAcc;
          if (tempMax > 0 && pl.phys.cVel.x > tempMax || tempMax < 0 && pl.phys.cVel.x < tempMax) {
            reduceByTraction(p, false);
            if (tempMax > 0 && pl.phys.cVel.x < tempMax || tempMax < 0 && pl.phys.cVel.x > tempMax) {
              pl.phys.cVel.x = tempMax;
            }
          } else {
            pl.phys.cVel.x += tempAcc;
            if (tempMax > 0 && pl.phys.cVel.x > tempMax || tempMax < 0 && pl.phys.cVel.x < tempMax) {
              pl.phys.cVel.x = tempMax;
            }
          }
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const j = checkForJump(p, input);
    if (input[p][0].l || input[p][0].r) {
      pl.phys.cVel.x *= 0.25;
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      pl.phys.cVel.x *= 0.25;
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].a && !input[p][1].a) {
      if (pl.timer < 4 && input[p][0].lsX * pl.phys.face >= 0.8) {
        pl.phys.cVel.x *= 0.25;
        acts.FORWARDSMASH.init(p, input);
      } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
        acts.GRAB.init(p, input);
      } else {
        acts.ATTACKDASH.init(p, input);
      }
      return true;
    } else if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].b && !input[p][1].b && Math.abs(input[p][0].lsX) > 0.6) {
      pl.phys.face = Math.sign(input[p][0].lsX);
      if (pl.phys.grounded) {
        acts.SIDESPECIALGROUND.init(p, input);
      } else {
        acts.SIDESPECIALAIR.init(p, input);
      }
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (pl.timer > 4 && checkForSmashTurn(p, input)) {
      pl.phys.cVel.x *= 0.25;
      acts.SMASHTURN.init(p, input);
      return true;
    } else if (pl.timer > pl.charAttributes.dashFrameMax && input[p][0].lsX * pl.phys.face > 0.79 && input[p][2].lsX * pl.phys.face < 0.3) {
      acts.DASH.init(p, input);
      return true;
    } else if (pl.timer > pl.charAttributes.dashFrameMin && input[p][0].lsX * pl.phys.face > 0.62) {
      acts.RUN.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].DASH) {
      acts.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.RUN = {
  name: "RUN",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "RUN";
    pl.timer = 1;
    actionStates[characterSelections[p]].RUN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer > framesData[characterSelections[p]].RUN) {
      pl.timer = 1;
    }
    if (!actionStates[characterSelections[p]].RUN.interrupt(p, input)) {
      const footstep = [false, false];
      if (pl.timer < 2) {
        footstep[0] = true;
      }
      if (pl.timer < 10) {
        footstep[1] = true;
      }
      const tempMax = input[p][0].lsX * pl.charAttributes.dMaxV;
      pl.phys.cVel.x += (pl.charAttributes.dMaxV * input[p][0].lsX - pl.phys.cVel.x) * (1 / (pl.charAttributes.dMaxV * 2.5)) * (pl.charAttributes.dAccA + pl.charAttributes.dAccB / Math.abs(input[p][0].lsX));
      if (pl.phys.cVel.x * pl.phys.face > tempMax * pl.phys.face) {
        pl.phys.cVel.x = tempMax;
      }
      const time = pl.phys.cVel.x * pl.phys.face / pl.charAttributes.dMaxV * pl.charAttributes.runAnimSpeed;
      if (time > 0) {
        pl.timer += time;
      }
      if (pl.timer > framesData[characterSelections[p]].RUN) {
        pl.timer = 1;
      }
      if (footstep[0] && pl.timer >= 2 || footstep[1] && pl.timer >= 10) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const j = checkForJump(p, input);
    if (input[p][0].a && !input[p][1].a) {
      if (input[p][0].lA > 0 || input[p][0].rA > 0) {
        acts.GRAB.init(p, input);
      } else {
        acts.ATTACKDASH.init(p, input);
      }
      return true;
    } else if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].b && !input[p][1].b && Math.abs(input[p][0].lsX) > 0.6) {
      pl.phys.face = Math.sign(input[p][0].lsX);
      if (pl.phys.grounded) {
        acts.SIDESPECIALGROUND.init(p, input);
      } else {
        acts.SIDESPECIALAIR.init(p, input);
      }
      return true;
    } else if (input[p][0].b && !input[p][1].b && input[p][0].lsY < -0.58) {
      acts.DOWNSPECIALGROUND.init(p, input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (Math.abs(input[p][0].lsX) < 0.62) {
      acts.RUNBRAKE.init(p, input);
      return true;
    } else if (input[p][0].lsX * pl.phys.face < -0.3) {
      acts.RUNTURN.init(p, input);
      return true;
    }
  }
};

S.SMASHTURN = {
  name: "SMASHTURN",
  canEdgeCancel: true,
  reverseModel: true,
  canBeGrabbed: true,
  disableTeeter: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SMASHTURN";
    pl.timer = 0;
    pl.phys.face *= -1;
    actionStates[characterSelections[p]].SMASHTURN.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].SMASHTURN.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const t = checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].b && !input[p][1].b && Math.abs(input[p][0].lsX) > 0.6) {
      pl.phys.face = Math.sign(input[p][0].lsX);
      if (pl.phys.grounded) {
        acts.SIDESPECIALGROUND.init(p, input);
      } else {
        acts.SIDESPECIALAIR.init(p, input);
      }
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (pl.timer === 2 && input[p][0].lsX * pl.phys.face > 0.79) {
      acts.DASH.init(p, input);
      return true;
    } else if (pl.timer > 11) {
      acts.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.TILTTURN = {
  name: "TILTTURN",
  canEdgeCancel: true,
  canBeGrabbed: true,
  disableTeeter: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "TILTTURN";
    pl.timer = 0;
    actionStates[characterSelections[p]].TILTTURN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer === 6) {
      pl.phys.face *= -1;
    }
    if (!actionStates[characterSelections[p]].TILTTURN.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const t = pl.timer < 6 ? checkForTilts(p, input, -1) : checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].b && !input[p][1].b && Math.abs(input[p][0].lsX) > 0.6) {
      pl.phys.face = Math.sign(input[p][0].lsX);
      if (pl.phys.grounded) {
        acts.SIDESPECIALGROUND.init(p, input);
      } else {
        acts.SIDESPECIALAIR.init(p, input);
      }
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      if (pl.timer < 6) {
        pl.phys.face *= -1;
      }
      acts[t[1]].init(p, input);
    } else if (pl.timer > 11) {
      acts.WAIT.init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (pl.timer === 6 && input[p][0].lsX * pl.phys.face > 0.79 && pl.phys.dashbuffer) {
      acts.DASH.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.RUNBRAKE = {
  name: "RUNBRAKE",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "RUNBRAKE";
    pl.timer = 0;
    actionStates[characterSelections[p]].RUNBRAKE.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].RUNBRAKE.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const j = checkForJump(p, input);
    if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (pl.timer > 1 && checkForSquat(p, input)) {
      acts.SQUAT.init(p, input);
      return true;
    } else if (input[p][0].lsX * pl.phys.face < -0.3) {
      acts.RUNTURN.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].RUNBRAKE) {
      acts.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.RUNTURN = {
  name: "RUNTURN",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "RUNTURN";
    pl.timer = 0;
    actionStates[characterSelections[p]].RUNTURN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    let tempAcc;
    pl.timer++;
    if (!actionStates[characterSelections[p]].RUNTURN.interrupt(p, input)) {
      if (pl.timer === pl.charAttributes.runTurnBreakPoint + 1) {
        pl.phys.face *= -1;
      }
      if (pl.timer <= pl.charAttributes.runTurnBreakPoint && input[p][0].lsX * pl.phys.face < -0.3) {
        tempAcc = (pl.charAttributes.dAccA - (1 - Math.abs(input[p][0].lsX)) * pl.charAttributes.dAccA) * pl.phys.face;
        pl.phys.cVel.x -= tempAcc;
      } else if (pl.timer > pl.charAttributes.runTurnBreakPoint && input[p][0].lsX * pl.phys.face > 0.3) {
        tempAcc = (pl.charAttributes.dAccA - (1 - Math.abs(input[p][0].lsX)) * pl.charAttributes.dAccA) * pl.phys.face;
        pl.phys.cVel.x += tempAcc;
      } else {
        reduceByTraction(p, true);
      }
      if (pl.timer === pl.charAttributes.runTurnBreakPoint) {
        if (pl.phys.cVel.x * pl.phys.face > 0) {
          pl.timer--;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const j = checkForJump(p, input);
    if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].RUNTURN) {
      if (input[p][0].lsX * pl.phys.face > 0.6) {
        acts.RUN.init(p, input);
      } else {
        acts.WAIT.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

S.WALK = {
  name: "WALK",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, addInitV, input) {
    const pl = player[p];
    pl.actionState = "WALK";
    pl.timer = 1;
    if (addInitV) {
      const tempInit = pl.charAttributes.walkInitV * pl.phys.face;
      if (tempInit > 0 && pl.phys.cVel.x < tempInit || tempInit < 0 && pl.phys.cVel.x > tempInit) {
        pl.phys.cVel.x += pl.charAttributes.walkInitV * pl.phys.face;
      }
    }
    actionStates[characterSelections[p]].WALK.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (!actionStates[characterSelections[p]].WALK.interrupt(p, input)) {
      const footstep = [false, false];
      if (pl.timer < 5) {
        footstep[0] = true;
      }
      if (pl.timer < 15) {
        footstep[1] = true;
      }
      const tempMax = pl.charAttributes.walkMaxV * input[p][0].lsX;
      if (Math.abs(pl.phys.cVel.x) > Math.abs(tempMax)) {
        reduceByTraction(p, true);
      } else {
        const tempAcc = (tempMax - pl.phys.cVel.x) * (1 / (pl.charAttributes.walkMaxV * 2)) * (pl.charAttributes.walkInitV + pl.charAttributes.walkAcc);
        pl.phys.cVel.x += tempAcc;
        if (pl.phys.cVel.x * pl.phys.face > tempMax * pl.phys.face) {
          pl.phys.cVel.x = tempMax;
        }
      }
      const time = pl.phys.cVel.x * pl.phys.face / pl.charAttributes.walkMaxV * pl.charAttributes.walkAnimSpeed;
      if (time > 0) {
        pl.timer += time;
      }
      if (footstep[0] && pl.timer >= 5 || footstep[1] && pl.timer >= 15) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const b = checkForSpecials(p, input);
    const t = checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (pl.timer > framesData[characterSelections[p]].WALK) {
      acts.WALK.init(p, false, input);
      return true;
    }
    if (input[p][0].lsX === 0) {
      acts.WAIT.init(p, input);
      return true;
    } else if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (checkForSquat(p, input)) {
      acts.SQUAT.init(p, input);
      return true;
    } else if (checkForDash(p, input)) {
      acts.DASH.init(p, input);
      return true;
    } else if (checkForSmashTurn(p, input)) {
      acts.SMASHTURN.init(p, input);
      return true;
    } else if (checkForTiltTurn(p, input)) {
      pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
      acts.TILTTURN.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.KNEEBEND = {
  name: "KNEEBEND",
  canEdgeCancel: true,
  disableTeeter: true,
  canBeGrabbed: true,
  init: function (p, type, input) {
    const pl = player[p];
    pl.actionState = "KNEEBEND";
    pl.timer = 0;
    pl.phys.jumpType = 1;
    pl.phys.jumpSquatType = type;
    actionStates[characterSelections[p]].KNEEBEND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].KNEEBEND.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.phys.jumpSquatType) {
        if (input[p][0].lsY < 0.67) {
          pl.phys.jumpType = 0;
        }
      } else {
        if (!input[p][0].x && !input[p][0].y) {
          pl.phys.jumpType = 0;
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer === pl.charAttributes.jumpSquat) {
      pl.phys.pos.y += 0.001;
    }
    if (pl.timer > pl.charAttributes.jumpSquat) {
      if (input[p][2].lsX * pl.phys.face >= -0.3) {
        acts.JUMPF.init(p, pl.phys.jumpType, input);
      } else {
        acts.JUMPB.init(p, pl.phys.jumpType, input);
      }
      return true;
    } else if (input[p][0].a && !input[p][1].a && (input[p][0].lA > 0 || input[p][0].rA > 0)) {
      acts.GRAB.init(p, input);
      return true;
    } else if (input[p][0].a && !input[p][1].a && input[p][0].lsY >= 0.8 && input[p][3].lsY < 0.3 || input[p][0].csY >= 0.8 && input[p][3].csY < 0.3) {
      acts.UPSMASH.init(p, input);
      return true;
    } else if (input[p][0].b && !input[p][1].b && input[p][0].lsY > 0.58) {
      acts.UPSPECIAL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.JUMPF = {
  name: "JUMPF",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  vCancel: true,
  init: function (p, type, input) {
    const pl = player[p];
    pl.actionState = "JUMPF";
    pl.timer = 0;
    if (type) {
      pl.phys.cVel.y += pl.charAttributes.fHopInitV;
    } else {
      pl.phys.cVel.y += pl.charAttributes.sHopInitV;
    }
    pl.phys.cVel.x = pl.phys.cVel.x * pl.charAttributes.groundToAir + input[p][0].lsX * pl.charAttributes.jumpHinitV;
    if (Math.abs(pl.phys.cVel.x) > pl.charAttributes.jumpHmaxV) {
      pl.phys.cVel.x = pl.charAttributes.jumpHmaxV * Math.sign(pl.phys.cVel.x);
    }
    pl.phys.grounded = false;
    actionStates[characterSelections[p]].JUMPF.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].JUMPF.interrupt(p, input)) {
      if (pl.timer > 1) {
        fastfall(p, input);
        airDrift(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        acts.JUMPAERIALB.init(p, input);
      } else {
        acts.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].JUMPF) {
      acts.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.JUMPB = {
  name: "JUMPB",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  vCancel: true,
  init: function (p, type, input) {
    const pl = player[p];
    pl.actionState = "JUMPB";
    pl.timer = 0;
    if (type) {
      pl.phys.cVel.y += pl.charAttributes.fHopInitV;
    } else {
      pl.phys.cVel.y += pl.charAttributes.sHopInitV;
    }
    pl.phys.cVel.x = pl.phys.cVel.x * pl.charAttributes.groundToAir + input[p][0].lsX * pl.charAttributes.jumpHinitV;
    if (Math.abs(pl.phys.cVel.x) > pl.charAttributes.jumpHmaxV) {
      pl.phys.cVel.x = pl.charAttributes.jumpHmaxV * Math.sign(pl.phys.cVel.x);
    }
    pl.phys.grounded = false;
    actionStates[characterSelections[p]].JUMPB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].JUMPB.interrupt(p, input)) {
      if (pl.timer > 1) {
        fastfall(p, input);
        airDrift(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        acts.JUMPAERIALB.init(p, input);
      } else {
        acts.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].JUMPB) {
      acts.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.LANDING = {
  name: "LANDING",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "LANDING";
    pl.timer = 0;
    actionStates[characterSelections[p]].LANDING.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].LANDING.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 4 && pl.timer <= 30) {
      const b = checkForSpecials(p, input);
      const t = checkForTilts(p, input);
      const s = checkForSmashes(p, input);
      const j = checkForJump(p, input);
      if (j[0]) {
        acts.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (input[p][0].l || input[p][0].r) {
        acts.GUARDON.init(p, input);
        return true;
      } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
        acts.GUARDON.init(p, input);
        return true;
      } else if (b[0]) {
        acts[b[1]].init(p, input);
        return true;
      } else if (s[0]) {
        acts[s[1]].init(p, input);
        return true;
      } else if (t[0]) {
        acts[t[1]].init(p, input);
        return true;
      } else if (input[p][0].du) {
        acts.APPEAL.init(p, input);
        return true;
      } else if (checkForDash(p, input)) {
        acts.DASH.init(p, input);
        return true;
      } else if (checkForSmashTurn(p, input)) {
        acts.SMASHTURN.init(p, input);
        return true;
      } else if (checkForTiltTurn(p, input)) {
        pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
        acts.TILTTURN.init(p, input);
        return true;
      } else if (Math.abs(input[p][0].lsX) > 0.3) {
        acts.WALK.init(p, true, input);
        return true;
      } else if (pl.timer === 5 && input[p][0].lsY < -0.5) {
        acts.SQUATWAIT.init(p, input);
        return true;
      } else {
        return false;
      }
    } else if (pl.timer > 30) {
      acts.WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.ESCAPEAIR = {
  name: "ESCAPEAIR",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  vCancel: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ESCAPEAIR";
    pl.timer = 0;
    if (Math.abs(input[p][0].lsX) > 0 || Math.abs(input[p][0].lsY) > 0) {
      const ang = getAngle(input[p][0].lsX, input[p][0].lsY);
      pl.phys.cVel.x = 3.1 * Math.cos(ang);
      pl.phys.cVel.y = 3.1 * Math.sin(ang);
    } else {
      pl.phys.cVel.x = 0;
      pl.phys.cVel.y = 0;
    }
    pl.phys.fastfalled = false;
    pl.phys.landingMultiplier = 3;
    actionStates[characterSelections[p]].ESCAPEAIR.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].ESCAPEAIR.interrupt(p, input)) {
      if (pl.timer < 30) {
        pl.phys.cVel.x *= 0.9;
        pl.phys.cVel.y *= 0.9;
      } else {
        airDrift(p, input);
        fastfall(p, input);
      }
      executeIntangibility("ESCAPEAIR", p);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 49) {
      actionStates[characterSelections[p]].FALLSPECIAL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    const pl = player[p];
    pl.phys.intangibleTimer = 0;
    pl.phys.hurtBoxState = 0;
    actionStates[characterSelections[p]].LANDINGFALLSPECIAL.init(p, input);
  }
};

S.LANDINGFALLSPECIAL = {
  name: "LANDINGFALLSPECIAL",
  canEdgeCancel: true,
  canGrabLedge: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "LANDINGFALLSPECIAL";
    pl.timer = 0;
    actionStates[characterSelections[p]].LANDINGFALLSPECIAL.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += pl.phys.landingMultiplier;
    if (!actionStates[characterSelections[p]].LANDINGFALLSPECIAL.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 30) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.FALL = {
  name: "FALL",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  vCancel: true,
  init: function (p, input, disableInputs = false) {
    const pl = player[p];
    pl.actionState = "FALL";
    pl.timer = 0;
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].FALL.main(p, input, disableInputs);
  },
  main: function (p, input, disableInputs = false) {
    const pl = player[p];
    pl.timer++;
    if (disableInputs) {
      pl.phys.cVel.y -= pl.charAttributes.gravity;
      airDrift(p, input);
    } else {
      if (!actionStates[characterSelections[p]].FALL.interrupt(p, input)) {
        fastfall(p, input);
        airDrift(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        acts.JUMPAERIALB.init(p, input);
      } else {
        acts.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].FALL) {
      acts.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.FALLAERIAL = {
  name: "FALLAERIAL",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  vCancel: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FALLAERIAL";
    pl.timer = 0;
    actionStates[characterSelections[p]].FALLAERIAL.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].FALLAERIAL.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        acts.JUMPAERIALB.init(p, input);
      } else {
        acts.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].FALLAERIAL) {
      acts.FALLAERIAL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.FALLSPECIAL = {
  name: "FALLSPECIAL",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  vCancel: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FALLSPECIAL";
    pl.timer = 0;
    actionStates[characterSelections[p]].FALLSPECIAL.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].FALLSPECIAL.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].FALLSPECIAL) {
      actionStates[characterSelections[p]].FALLSPECIAL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {
    actionStates[characterSelections[p]].LANDINGFALLSPECIAL.init(p, input);
  }
};

S.SQUAT = {
  name: "SQUAT",
  canEdgeCancel: true,
  canBeGrabbed: true,
  crouch: true,
  disableTeeter: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SQUAT";
    pl.timer = 0;
    actionStates[characterSelections[p]].SQUAT.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].SQUAT.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const b = checkForSpecials(p, input);
    const t = checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (pl.timer === 4 && (input[p][0].lsY < -0.65 || input[p][1].lsY < -0.65 || input[p][2].lsY < -0.65) && input[p][6].lsY > -0.3 && pl.phys.onSurface[0] === 1) {
      acts.PASS.init(p, input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].SQUAT) {
      acts.SQUATWAIT.init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else {
      return false;
    }
  }
};

S.SQUATWAIT = {
  name: "SQUATWAIT",
  canEdgeCancel: true,
  canBeGrabbed: true,
  crouch: true,
  disableTeeter: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SQUATWAIT";
    pl.timer = 0;
    actionStates[characterSelections[p]].SQUATWAIT.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].SQUATWAIT.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    const acts = actionStates[characterSelections[p]];
    const b = checkForSpecials(p, input);
    const t = checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (input[p][0].lsY > -0.61) {
      acts.SQUATRV.init(p, input);
      return true;
    } else if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (checkForDash(p, input)) {
      acts.DASH.init(p, input);
      return true;
    } else if (checkForSmashTurn(p, input)) {
      acts.SMASHTURN.init(p, input);
      return true;
    } else if (player[p].timer > framesData[characterSelections[p]].SQUATWAIT) {
      acts.SQUATWAIT.init(p, input);
    } else {
      return false;
    }
  }
};

S.SQUATRV = {
  name: "SQUATRV",
  canEdgeCancel: true,
  canBeGrabbed: true,
  crouch: true,
  disableTeeter: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SQUATRV";
    pl.timer = 0;
    actionStates[characterSelections[p]].SQUATRV.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].SQUATRV.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    const acts = actionStates[characterSelections[p]];
    const b = checkForSpecials(p, input);
    const t = checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (player[p].timer > framesData[characterSelections[p]].SQUATRV) {
      acts.WAIT.init(p, input);
      return true;
    } else if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (checkForSmashTurn(p, input)) {
      acts.SMASHTURN.init(p, input);
      return true;
    } else if (Math.abs(input[p][0].lsX) > 0.3) {
      acts.WALK.init(p, true, input);
      return true;
    } else {
      return false;
    }
  }
};

S.JUMPAERIALF = {
  name: "JUMPAERIALF",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  vCancel: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JUMPAERIALF";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = pl.charAttributes.fHopInitV * pl.charAttributes.djMultiplier;
    pl.phys.cVel.x = input[p][0].lsX * pl.charAttributes.djMomentum;
    actionStates[characterSelections[p]].JUMPAERIALF.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].JUMPAERIALF.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (player[p].timer > framesData[characterSelections[p]].JUMPAERIALF) {
      acts.FALLAERIAL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.JUMPAERIALB = {
  name: "JUMPAERIALB",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  vCancel: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "JUMPAERIALB";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = true;
    pl.phys.cVel.y = pl.charAttributes.fHopInitV * pl.charAttributes.djMultiplier;
    pl.phys.cVel.x = input[p][0].lsX * pl.charAttributes.djMomentum;
    actionStates[characterSelections[p]].JUMPAERIALB.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].JUMPAERIALB.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (player[p].timer > framesData[characterSelections[p]].JUMPAERIALB) {
      acts.FALLAERIAL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.PASS = {
  name: "PASS",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "PASS";
    pl.timer = 0;
    pl.phys.grounded = false;
    pl.phys.passFastfall = false;
    pl.phys.cVel.y = -0.5;
    pl.phys.passing = true;
    actionStates[characterSelections[p]].PASS.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer > 1) {
      if (!actionStates[characterSelections[p]].PASS.interrupt(p, input)) {
        if (pl.phys.passFastfall) {
          fastfall(p, input);
        } else {
          pl.phys.cVel.y -= pl.charAttributes.gravity;
          if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
            pl.phys.cVel.y = -pl.charAttributes.terminalV;
          }
          if (input[p][0].lsY > -0.3) {
            pl.phys.passFastfall = true;
          }
        }
        airDrift(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        acts.JUMPAERIALB.init(p, input);
      } else {
        acts.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].PASS) {
      acts.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.GUARDON = {
  name: "GUARDON",
  canEdgeCancel: true,
  canBeGrabbed: true,
  missfoot: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "GUARDON";
    pl.timer = 0;
    pl.phys.shielding = true;
    pl.phys.shieldPosition = new Vec2D(0, 0);
    pl.phys.powerShielded = false;
    shieldSize(p, true, input);
    if (Math.max(input[p][0].lA, input[p][0].rA) === 1) {
      pl.phys.powerShieldActive = true;
      pl.phys.powerShieldReflectActive = true;
    } else {
      pl.phys.powerShieldActive = false;
      pl.phys.powerShieldReflectActive = false;
    }
    actionStates[characterSelections[p]].GUARDON.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.hit.shieldstun > 0) {
      reduceByTraction(p, false);
      shieldTilt(p, true, input);
    } else {
      pl.timer++;
      if (pl.timer === 3) {
        pl.phys.powerShieldReflectActive = false;
      }
      if (pl.timer === 5) {
        pl.phys.powerShieldActive = false;
      }
      if (!actionStates[characterSelections[p]].GUARDON.interrupt(p, input)) {
        if (pl.timer === 1) {}
        if (!pl.inCSS) {
          reduceByTraction(p, false);
          shieldDepletion(p, input);
        }
        shieldTilt(p, false, input);
        shieldSize(p, null, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (!pl.inCSS) {
      const j = checkForJump(p, input);
      if (j[0] || input[p][0].csY > 0.65) {
        pl.phys.shielding = false;
        acts.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (input[p][0].a && !input[p][1].a) {
        pl.phys.shielding = false;
        acts.GRAB.init(p, input);
        return true;
      } else if (input[p][0].lsY < -0.7 && input[p][4].lsY > -0.3 || input[p][0].csY < -0.7) {
        pl.phys.shielding = false;
        acts.ESCAPEN.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face > 0.7 && input[p][4].lsX * pl.phys.face < 0.3 || input[p][0].csX * pl.phys.face > 0.7) {
        pl.phys.shielding = false;
        acts.ESCAPEF.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face < -0.7 && input[p][4].lsX * pl.phys.face > -0.3 || input[p][0].csX * pl.phys.face < -0.7) {
        pl.phys.shielding = false;
        acts.ESCAPEB.init(p, input);
        return true;
      } else if (pl.timer > 1 && input[p][0].lsY < -0.65 && input[p][6].lsY > -0.3 && pl.phys.onSurface[0] === 1) {
        pl.phys.shielding = false;
        acts.PASS.init(p, input);
        return true;
      } else if (pl.timer > framesData[characterSelections[p]].GUARDON) {
        acts.GUARD.init(p, input);
        return true;
      } else {
        return false;
      }
    } else {
      if (pl.timer > 8) {
        acts.GUARD.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  }
};

S.GUARD = {
  name: "GUARD",
  canEdgeCancel: true,
  canBeGrabbed: true,
  missfoot: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "GUARD";
    pl.timer = 0;
    pl.phys.powerShieldActive = false;
    pl.phys.powerShieldReflectActive = false;
    actionStates[characterSelections[p]].GUARD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.hit.shieldstun > 0) {
      reduceByTraction(p, false);
      shieldTilt(p, true, input);
    } else {
      pl.timer++;
      if (!actionStates[characterSelections[p]].GUARD.interrupt(p, input)) {
        if (!pl.inCSS) {
          reduceByTraction(p, false);
          shieldDepletion(p, input);
        }
        shieldTilt(p, false, input);
        shieldSize(p, null, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (!pl.inCSS) {
      const j = checkForJump(p, input);
      if (j[0] || input[p][0].csY > 0.66) {
        pl.phys.shielding = false;
        acts.KNEEBEND.init(p, j[1], input);
        return true;
      } else if (input[p][0].a && !input[p][1].a) {
        pl.phys.shielding = false;
        acts.GRAB.init(p, input);
        return true;
      } else if (input[p][0].lsY < -0.7 && input[p][4].lsY > -0.3 || input[p][0].csY < -0.7) {
        pl.phys.shielding = false;
        acts.ESCAPEN.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face > 0.7 && input[p][4].lsX * pl.phys.face < 0.3 || input[p][0].csX * pl.phys.face > 0.7) {
        pl.phys.shielding = false;
        acts.ESCAPEF.init(p, input);
        return true;
      } else if (input[p][0].lsX * pl.phys.face < -0.7 && input[p][4].lsX * pl.phys.face > -0.3 || input[p][0].csX * pl.phys.face < -0.7) {
        pl.phys.shielding = false;
        acts.ESCAPEB.init(p, input);
        return true;
      } else if (input[p][0].lsY < -0.65 && input[p][6].lsY > -0.3 && pl.phys.onSurface[0] === 1) {
        pl.phys.shielding = false;
        acts.PASS.init(p, input);
        return true;
      } else if (input[p][0].lA < 0.3 && input[p][0].rA < 0.3) {
        pl.phys.shielding = false;
        acts.GUARDOFF.init(p, input);
        return true;
      } else if (pl.timer > 1) {
        acts.GUARD.init(p, input);
        return true;
      } else {
        return false;
      }
    } else {
      if (input[p][0].lA < 0.3 && input[p][0].rA < 0.3) {
        pl.phys.shielding = false;
        acts.GUARDOFF.init(p, input);
        return true;
      } else if (pl.timer > 1) {
        acts.GUARD.init(p, input);
        return true;
      } else {
        return false;
      }
    }
  }
};

S.GUARDOFF = {
  name: "GUARDOFF",
  canEdgeCancel: true,
  canBeGrabbed: true,
  missfoot: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "GUARDOFF";
    pl.timer = 0;
    actionStates[characterSelections[p]].GUARDOFF.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].GUARDOFF.interrupt(p, input)) {
      reduceByTraction(p, false);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    let s;
    const j = checkForJump(p, input);
    if (j[0] && !pl.inCSS) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].GUARDOFF) {
      acts.WAIT.init(p, input);
      return true;
    } else if (pl.phys.powerShielded) {
      if (!pl.inCSS) {
        const t = checkForTilts(p, input);
        s = checkForSmashes(p, input);
        if (s[0]) {
          acts[s[1]].init(p, input);
          return true;
        } else if (t[0]) {
          acts[t[1]].init(p, input);
          return true;
        } else if (checkForSquat(p, input)) {
          acts.SQUAT.init(p, input);
          return true;
        } else if (checkForDash(p, input)) {
          acts.DASH.init(p, input);
          return true;
        } else if (checkForSmashTurn(p, input)) {
          acts.SMASHTURN.init(p, input);
          return true;
        } else if (checkForTiltTurn(p, input)) {
          pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
          acts.TILTTURN.init(p, input);
          return true;
        } else if (Math.abs(input[p][0].lsX) > 0.3) {
          acts.WALK.init(p, true, input);
          return true;
        } else {
          return false;
        }
      } else {
        s = checkForSmashes(p, input);
        if (s[0]) {
          acts[s[1]].init(p, input);
          return true;
        } else {
          return false;
        }
      }
    } else {
      return false;
    }
  }
};

S.CLIFFCATCH = {
  name: "CLIFFCATCH",
  canGrabLedge: false,
  canBeGrabbed: false,
  posOffset: [],
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFCATCH";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.phys.thrownHitbox = false;
    pl.phys.fastfalled = false;
    pl.phys.doubleJumped = false;
    pl.phys.jumpsUsed = 0;
    pl.phys.intangibleTimer = 38;
    pl.phys.ledgeHangTimer = 0;
    pl.rotation = 0;
    pl.rotationPoint = new Vec2D(0, 0);
    pl.colourOverlayBool = false;
    pl.phys.chargeFrames = 0;
    pl.phys.charging = false;
    turnOffHitboxes(p);
    const l = activeStage.ledge[pl.phys.onLedge];
    actionStates[characterSelections[p]].CLIFFCATCH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.CLIFFCATCH.interrupt(p, input)) {
      const onLedge = pl.phys.onLedge;
      if (onLedge === -1) {
        return;
      }
      const l = activeStage.ledge[onLedge];
      const x = activeStage[l[0]][l[1]][l[2]].x;
      const y = activeStage[l[0]][l[1]][l[2]].y;
      pl.phys.pos = new Vec2D(x + (acts.CLIFFCATCH.posOffset[pl.timer - 1][0] + 68.4) * pl.phys.face, y + acts.CLIFFCATCH.posOffset[pl.timer - 1][1]);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].CLIFFCATCH) {
      actionStates[characterSelections[p]].CLIFFWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.CLIFFWAIT = {
  name: "CLIFFWAIT",
  canGrabLedge: false,
  canBeGrabbed: false,
  wallJumpAble: false,
  posOffset: [],
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CLIFFWAIT";
    pl.timer = 0;
    actionStates[characterSelections[p]].CLIFFWAIT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].CLIFFWAIT.interrupt(p, input)) {
      pl.phys.ledgeHangTimer++;
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (input[p][0].lsX * pl.phys.face < -0.2 && input[p][1].lsX * pl.phys.face >= -0.2 || input[p][0].lsY < -0.2 && input[p][1].lsY >= -0.2 || input[p][0].csX * pl.phys.face < -0.2 && input[p][1].csX * pl.phys.face >= -0.2 || input[p][0].csY < -0.2 && input[p][1].csY >= -0.2) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = true;
      acts.FALL.init(p, input, true);
      return true;
    } else if (input[p][0].x && !input[p][1].x || input[p][0].y && !input[p][1].y || input[p][0].lsY > 0.65 && input[p][1].lsY <= 0.65) {
      if (pl.percent < 100) {
        acts.CLIFFJUMPQUICK.init(p, input);
      } else {
        acts.CLIFFJUMPSLOW.init(p, input);
      }
      return true;
    } else if (input[p][0].lsX * pl.phys.face > 0.2 && input[p][1].lsX * pl.phys.face <= 0.2 || input[p][0].lsY > 0.2 && input[p][1].lsY <= 0.2) {
      if (pl.percent < 100) {
        acts.CLIFFGETUPQUICK.init(p, input);
      } else {
        acts.CLIFFGETUPSLOW.init(p, input);
      }
      return true;
    } else if (input[p][0].a && !input[p][1].a || input[p][0].b && !input[p][1].b || input[p][0].csY > 0.65 && input[p][1].csY <= 0.65) {
      if (pl.percent < 100) {
        acts.CLIFFATTACKQUICK.init(p, input);
      } else {
        acts.CLIFFATTACKSLOW.init(p, input);
      }
      return true;
    } else if (input[p][0].lA > 0.3 && input[p][1].lA <= 0.3 || input[p][0].rA > 0.3 && input[p][1].rA <= 0.3 || input[p][0].csX * pl.phys.face > 0.8 && input[p][1].csX * pl.phys.face <= 0.8) {
      if (pl.percent < 100) {
        acts.CLIFFESCAPEQUICK.init(p, input);
      } else {
        acts.CLIFFESCAPESLOW.init(p, input);
      }
      return true;
    } else if (pl.phys.ledgeHangTimer > 600) {
      pl.phys.onLedge = -1;
      pl.phys.ledgeRegrabCount = true;
      acts.DAMAGEFALL.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].CLIFFWAIT) {
      acts.CLIFFWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DEADLEFT = {
  name: "DEADLEFT",
  canBeGrabbed: false,
  ignoreCollision: true,
  dead: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DEADLEFT";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.percent = 0;
    if (!isFinalDeath()) {}
    actionStates[characterSelections[p]].DEADLEFT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DEADLEFT.interrupt(p, input)) {
      pl.phys.outOfCameraTimer = 0;
      pl.phys.intangibleTimer = 2;
      pl.phys.hurtBoxState = 1;
      if (pl.timer === 4) {
        if (isFinalDeath()) {
          finishGame(input);
        } else {}
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 60) {
      if (pl.stocks > 0) {
        acts.REBIRTH.init(p, input);
      } else {
        acts.SLEEP.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

S.DEADRIGHT = {
  name: "DEADRIGHT",
  canBeGrabbed: false,
  ignoreCollision: true,
  dead: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DEADRIGHT";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.percent = 0;
    if (!isFinalDeath()) {}
    actionStates[characterSelections[p]].DEADRIGHT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DEADRIGHT.interrupt(p, input)) {
      pl.phys.outOfCameraTimer = 0;
      pl.phys.intangibleTimer = 2;
      pl.phys.hurtBoxState = 1;
      if (pl.timer === 4) {
        if (isFinalDeath()) {
          finishGame(input);
        } else {}
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 60) {
      if (pl.stocks > 0) {
        acts.REBIRTH.init(p, input);
      } else {
        acts.SLEEP.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

S.DEADUP = {
  name: "DEADUP",
  canBeGrabbed: false,
  ignoreCollision: true,
  dead: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DEADUP";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.percent = 0;
    if (!isFinalDeath()) {}
    actionStates[characterSelections[p]].DEADUP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DEADUP.interrupt(p, input)) {
      pl.phys.outOfCameraTimer = 0;
      pl.phys.intangibleTimer = 2;
      pl.phys.hurtBoxState = 1;
      if (pl.timer === 4) {
        if (isFinalDeath()) {
          finishGame(input);
        } else {}
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 60) {
      if (pl.stocks > 0) {
        acts.REBIRTH.init(p, input);
      } else {
        acts.SLEEP.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

S.DEADDOWN = {
  name: "DEADDOWN",
  canBeGrabbed: false,
  ignoreCollision: true,
  dead: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DEADDOWN";
    pl.timer = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.percent = 0;
    if (!isFinalDeath()) {}
    actionStates[characterSelections[p]].DEADDOWN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DEADDOWN.interrupt(p, input)) {
      pl.phys.outOfCameraTimer = 0;
      pl.phys.intangibleTimer = 2;
      pl.phys.hurtBoxState = 1;
      if (pl.timer === 4) {
        if (isFinalDeath()) {
          finishGame(input);
        } else {}
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 60) {
      if (pl.stocks > 0) {
        acts.REBIRTH.init(p, input);
      } else {
        acts.SLEEP.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  }
};

S.REBIRTH = {
  name: "REBIRTH",
  canBeGrabbed: false,
  ignoreCollision: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "REBIRTH";
    pl.timer = 1;
    pl.phys.pos.x = activeStage.respawnPoints[p].x;
    pl.phys.pos.y = activeStage.respawnPoints[p].y + 135;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = -1.5;
    pl.phys.face = activeStage.respawnFace[p];
    pl.phys.doubleJumped = false;
    pl.phys.fastfalled = false;
    pl.phys.jumpsUsed = 0;
    pl.phys.wallJumpCount = 0;
    pl.phys.sideBJumpFlag = true;
    pl.spawnWaitTime = 0;
    pl.percent = 0;
    pl.phys.kVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.hit.hitstun = 0;
    pl.phys.shieldHP = 60;
    pl.burning = 0;
    pl.shocked = 0;
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += 1;
    if (!actionStates[characterSelections[p]].REBIRTH.interrupt(p, input)) {
      pl.phys.outOfCameraTimer = 0;
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 90) {
      actionStates[characterSelections[p]].REBIRTHWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.REBIRTHWAIT = {
  name: "REBIRTHWAIT",
  canBeGrabbed: false,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "REBIRTHWAIT";
    pl.timer = 1;
    pl.phys.cVel.y = 0;
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += 1;
    pl.spawnWaitTime++;
    if (!actionStates[characterSelections[p]].REBIRTHWAIT.interrupt(p, input)) {
      pl.phys.outOfCameraTimer = 0;
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    const j = checkForDoubleJump(p, input);
    if (a[0]) {
      pl.phys.grounded = false;
      pl.phys.invincibleTimer = 120;
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      pl.phys.grounded = false;
      pl.phys.invincibleTimer = 120;
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (j) {
      pl.phys.grounded = false;
      pl.phys.invincibleTimer = 120;
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        acts.JUMPAERIALB.init(p, input);
      } else {
        acts.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (b[0]) {
      pl.phys.grounded = false;
      pl.phys.invincibleTimer = 120;
      acts[b[1]].init(p, input);
      return true;
    }
    if (pl.timer > framesData[characterSelections[p]].WAIT) {
      acts.REBIRTHWAIT.init(p, input);
      return true;
    } else if (pl.spawnWaitTime > 300) {
      pl.phys.grounded = false;
      pl.phys.invincibleTimer = 120;
      acts.FALL.init(p, input);
      return true;
    } else if (Math.abs(input[p][0].lsX) > 0.3 || Math.abs(input[p][0].lsY) > 0.3) {
      pl.phys.grounded = false;
      pl.phys.invincibleTimer = 120;
      acts.FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DAMAGEFLYN = {
  name: "DAMAGEFLYN",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: true,
  canBeGrabbed: true,
  landType: 2,
  init: function (p, input, drawStuff) {
    const pl = player[p];
    pl.actionState = "DAMAGEFLYN";
    pl.timer = 0;
    pl.phys.grabbing = -1;
    pl.phys.grabbedBy = -1;
    pl.phys.fastfalled = false;
    pl.rotation = 0;
    pl.rotationPoint = new Vec2D(0, 0);
    pl.colourOverlayBool = false;
    if (drawStuff) {}
    pl.hitboxes.id[0] = pl.charHitboxes.thrown.id0;
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].DAMAGEFLYN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.phys.thrownHitbox) {
      if (pl.timer === 1 && pl.phys.cVel.y + pl.phys.kVel.y > 0) {
        pl.hitboxes.active = [true, false, false, false];
        pl.hitboxes.frame = 0;
      }
      if (pl.timer > 1 && pl.phys.cVel.y + pl.phys.kVel.y > 0) {}
      if (pl.phys.cVel.y + pl.phys.kVel.y <= 0) {
        turnOffHitboxes(p);
      }
    }
    if (pl.timer < framesData[characterSelections[p]].DAMAGEFLYN) {
      pl.timer++;
    }
    if (pl.hit.hitstun % 10 === 0) {}
    if (!actionStates[characterSelections[p]].DAMAGEFLYN.interrupt(p, input)) {
      if (pl.timer > 1) {
        pl.hit.hitstun--;
        if (!pl.phys.grounded) {
          pl.phys.cVel.y -= pl.charAttributes.gravity;
          if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
            pl.phys.cVel.y = -pl.charAttributes.terminalV;
          }
        }
      }
    } else {
      pl.phys.thrownHitbox = false;
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > 1 && pl.hit.hitstun === 0) {
      actionStates[characterSelections[p]].DAMAGEFALL.init(p, input);
      pl.phys.thrownHitbox = false;
      return true;
    } else {
      return false;
    }
  }
};

S.DAMAGEFALL = {
  name: "DAMAGEFALL",
  canPassThrough: false,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: true,
  canBeGrabbed: true,
  landType: 2,
  vCancel: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DAMAGEFALL";
    pl.timer = 0;
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].DAMAGEFALL.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].DAMAGEFALL.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const a = checkForAerials(p, input);
    const b = checkForSpecials(p, input);
    if (a[0]) {
      acts[a[1]].init(p, input);
      return true;
    } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
      acts.ESCAPEAIR.init(p, input);
      return true;
    } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
      if (input[p][0].lsX * pl.phys.face < -0.3) {
        acts.JUMPAERIALB.init(p, input);
      } else {
        acts.JUMPAERIALF.init(p, input);
      }
      return true;
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (input[p][0].lsX > 0.7 && input[p][1].lsX < 0.7 || input[p][0].lsX < -0.7 && input[p][1].lsX > -0.7 || input[p][0].lsY > 0.7 && input[p][1].lsY < 0.7 || input[p][0].lsY < -0.7 && input[p][1].lsY > -0.7) {
      acts.FALL.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].DAMAGEFALL) {
      acts.DAMAGEFALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DAMAGEN2 = {
  name: "DAMAGEN2",
  canEdgeCancel: true,
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 1,
  missfoot: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DAMAGEN2";
    pl.timer = 0;
    pl.phys.grabbing = -1;
    pl.phys.grabbedBy = -1;
    pl.phys.fastfalled = false;
    pl.rotation = 0;
    pl.rotationPoint = new Vec2D(0, 0);
    pl.colourOverlayBool = false;
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].DAMAGEN2.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.inCSS) {
      pl.timer += 0.7;
    } else {
      pl.timer++;
    }
    if (!actionStates[characterSelections[p]].DAMAGEN2.interrupt(p, input)) {
      if (pl.timer > 1) {
        pl.hit.hitstun--;
        if (!pl.phys.grounded) {
          pl.phys.cVel.y -= pl.charAttributes.gravity;
          if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
            pl.phys.cVel.y = -pl.charAttributes.terminalV;
          }
        } else {
          reduceByTraction(p, false);
        }
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    let b;
    if (pl.timer > framesData[characterSelections[p]].DAMAGEN2) {
      if (pl.hit.hitstun > 0) {
        pl.timer--;
        return false;
      } else {
        if (pl.phys.grounded || pl.inCSS) {
          acts.WAIT.init(p, input);
        } else {
          acts.FALL.init(p, input);
        }
        return true;
      }
    } else if (pl.hit.hitstun <= 0 && !pl.inCSS) {
      if (pl.phys.grounded) {
        b = checkForSpecials(p, input);
        const t = checkForTilts(p, input);
        const s = checkForSmashes(p, input);
        const j = checkForJump(p, input);
        if (j[0]) {
          acts.KNEEBEND.init(p, j[1], input);
          return true;
        } else if (input[p][0].l || input[p][0].r) {
          acts.GUARDON.init(p, input);
          return true;
        } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
          acts.GUARDON.init(p, input);
          return true;
        } else if (b[0]) {
          acts[b[1]].init(p, input);
          return true;
        } else if (s[0]) {
          acts[s[1]].init(p, input);
          return true;
        } else if (t[0]) {
          acts[t[1]].init(p, input);
          return true;
        } else if (checkForSquat(p, input)) {
          acts.SQUAT.init(p, input);
          return true;
        } else if (checkForDash(p, input)) {
          acts.DASH.init(p, input);
          return true;
        } else if (checkForSmashTurn(p, input)) {
          acts.SMASHTURN.init(p, input);
          return true;
        } else if (checkForTiltTurn(p, input)) {
          pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
          acts.TILTTURN.init(p, input);
          return true;
        } else if (Math.abs(input[p][0].lsX) > 0.3) {
          acts.WALK.init(p, true, input);
          return true;
        } else {
          return false;
        }
      } else {
        const a = checkForAerials(p, input);
        b = checkForSpecials(p, input);
        if (a[0]) {
          acts[a[1]].init(p, input);
          return true;
        } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
          acts.ESCAPEAIR.init(p, input);
          return true;
        } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
          if (input[p][0].lsX * pl.phys.face < -0.3) {
            acts.JUMPAERIALB.init(p, input);
          } else {
            acts.JUMPAERIALF.init(p, input);
          }
          return true;
        } else if (b[0]) {
          acts[b[1]].init(p, input);
          return true;
        } else if (input[p][0].lsX > 0.7 && input[p][1].lsX < 0.7 || input[p][0].lsX < -0.7 && input[p][1].lsX > -0.7 || input[p][0].lsY > 0.7 && input[p][1].lsY < 0.7 || input[p][0].lsY < -0.7 && input[p][1].lsY > -0.7) {
          acts.FALL.init(p, input);
          return true;
        } else {
          return false;
        }
      }
    } else {
      return false;
    }
  },
  land: function (p, input) {
    if (player[p].hit.hitstun <= 0) {
      actionStates[characterSelections[p]].LANDING.init(p, input);
    }
  }
};

S.LANDINGATTACKAIRN = {
  name: "LANDINGATTACKAIRN",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "LANDINGATTACKAIRN";
    pl.timer = 0;
    if (pl.phys.lCancel && !(pl.charAttributes.noLcancel || []).includes("ATTACKAIRN")) { // HOJA: noLcancel (Sir Retro: these aerials ignore L-cancel)
      pl.phys.landingLagScaling = 2;
    } else {
      pl.phys.landingLagScaling = 1;
    }
    actionStates[characterSelections[p]].LANDINGATTACKAIRN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += pl.phys.landingLagScaling;
    if (!actionStates[characterSelections[p]].LANDINGATTACKAIRN.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].LANDINGATTACKAIRN) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.LANDINGATTACKAIRF = {
  name: "LANDINGATTACKAIRF",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "LANDINGATTACKAIRF";
    pl.timer = 0;
    if (pl.phys.lCancel && !(pl.charAttributes.noLcancel || []).includes("ATTACKAIRF")) { // HOJA: noLcancel (Sir Retro: these aerials ignore L-cancel)
      pl.phys.landingLagScaling = 2;
    } else {
      pl.phys.landingLagScaling = 1;
    }
    actionStates[characterSelections[p]].LANDINGATTACKAIRF.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += pl.phys.landingLagScaling;
    if (!actionStates[characterSelections[p]].LANDINGATTACKAIRF.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].LANDINGATTACKAIRF) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.LANDINGATTACKAIRB = {
  name: "LANDINGATTACKAIRB",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "LANDINGATTACKAIRB";
    pl.timer = 0;
    if (pl.phys.lCancel && !(pl.charAttributes.noLcancel || []).includes("ATTACKAIRB")) { // HOJA: noLcancel (Sir Retro: these aerials ignore L-cancel)
      pl.phys.landingLagScaling = 2;
    } else {
      pl.phys.landingLagScaling = 1;
    }
    actionStates[characterSelections[p]].LANDINGATTACKAIRB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += pl.phys.landingLagScaling;
    if (!actionStates[characterSelections[p]].LANDINGATTACKAIRB.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].LANDINGATTACKAIRB) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.LANDINGATTACKAIRD = {
  name: "LANDINGATTACKAIRD",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "LANDINGATTACKAIRD";
    pl.timer = 0;
    if (pl.phys.lCancel && !(pl.charAttributes.noLcancel || []).includes("ATTACKAIRD")) { // HOJA: noLcancel (Sir Retro: these aerials ignore L-cancel)
      pl.phys.landingLagScaling = 2;
    } else {
      pl.phys.landingLagScaling = 1;
    }
    actionStates[characterSelections[p]].LANDINGATTACKAIRD.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += pl.phys.landingLagScaling;
    if (!actionStates[characterSelections[p]].LANDINGATTACKAIRD.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].LANDINGATTACKAIRD) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.LANDINGATTACKAIRU = {
  name: "LANDINGATTACKAIRU",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "LANDINGATTACKAIRU";
    pl.timer = 0;
    if (pl.phys.lCancel && !(pl.charAttributes.noLcancel || []).includes("ATTACKAIRU")) { // HOJA: noLcancel (Sir Retro: these aerials ignore L-cancel)
      pl.phys.landingLagScaling = 2;
    } else {
      pl.phys.landingLagScaling = 1;
    }
    actionStates[characterSelections[p]].LANDINGATTACKAIRU.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer += pl.phys.landingLagScaling;
    if (!actionStates[characterSelections[p]].LANDINGATTACKAIRU.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].LANDINGATTACKAIRU) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.ESCAPEB = {
  name: "ESCAPEB",
  setVelocities: [],
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ESCAPEB";
    pl.timer = 0;
    pl.phys.shielding = false;
    actionStates[characterSelections[p]].ESCAPEB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.ESCAPEB.interrupt(p, input)) {
      pl.phys.cVel.x = acts.ESCAPEB.setVelocities[pl.timer - 1] * pl.phys.face;
      executeIntangibility("ESCAPEB", p);
      if (pl.timer === 4) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > framesData[characterSelections[p]].ESCAPEB) {
      pl.phys.cVel.x = 0;
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.ESCAPEF = {
  name: "ESCAPEF",
  setVelocities: [],
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ESCAPEF";
    pl.timer = 0;
    pl.phys.shielding = false;
    actionStates[characterSelections[p]].ESCAPEF.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.ESCAPEF.interrupt(p, input)) {
      pl.phys.cVel.x = acts.ESCAPEF.setVelocities[pl.timer - 1] * pl.phys.face;
      executeIntangibility("ESCAPEF", p);
      if (pl.timer === 4) {}
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.timer > framesData[characterSelections[p]].ESCAPEF) {
      pl.phys.cVel.x = 0;
      pl.phys.face *= -1;
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.ESCAPEN = {
  name: "ESCAPEN",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ESCAPEN";
    pl.timer = 0;
    pl.phys.shielding = false;
    actionStates[characterSelections[p]].ESCAPEN.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].ESCAPEN.interrupt(p, input)) {
      if (pl.timer === 1) {}
      reduceByTraction(p, true);
      executeIntangibility("ESCAPEN", p);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].ESCAPEN) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DOWNBOUND = {
  name: "DOWNBOUND",
  canEdgeCancel: true,
  disableTeeter: true,
  canBeGrabbed: false,
  downed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNBOUND";
    pl.timer = 0;
    pl.phys.kVel.y = 0;
    pl.phys.jabReset = false;
    actionStates[characterSelections[p]].DOWNBOUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DOWNBOUND.interrupt(p, input)) {
      if (pl.timer === 1) {
        reduceByTraction(p, true);
      } else {
        pl.phys.cVel.x = 0;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].DOWNBOUND) {
      actionStates[characterSelections[p]].DOWNWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DOWNWAIT = {
  name: "DOWNWAIT",
  canEdgeCancel: true,
  disableTeeter: true,
  canBeGrabbed: false,
  downed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNWAIT";
    pl.timer = 0;
    actionStates[characterSelections[p]].DOWNWAIT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DOWNWAIT.interrupt(p, input)) {
      reduceByTraction(p, true);
      if (pl.timer > 1) {
        pl.hit.hitstun--;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > framesData[characterSelections[p]].DOWNWAIT) {
      acts.DOWNWAIT.init(p, input);
      return true;
    } else if (pl.phys.jabReset) {
      if (pl.hit.hitstun <= 0) {
        if (input[p][0].lsX * pl.phys.face < -0.7) {
          acts.DOWNSTANDB.init(p, input);
          return true;
        } else if (input[p][0].lsX * pl.phys.face > 0.7) {
          acts.DOWNSTANDF.init(p, input);
          return true;
        } else if (input[p][0].a && !input[p][1].a || input[p][0].b && !input[p][1].b) {
          acts.DOWNATTACK.init(p, input);
          return true;
        } else {
          acts.DOWNSTANDN.init(p, input);
          return true;
        }
      } else {
        return false;
      }
    } else if (input[p][0].lsX * pl.phys.face < -0.7) {
      acts.DOWNSTANDB.init(p, input);
      return true;
    } else if (input[p][0].lsX * pl.phys.face > 0.7) {
      acts.DOWNSTANDF.init(p, input);
      return true;
    } else if (input[p][0].lsY > 0.7) {
      acts.DOWNSTANDN.init(p, input);
      return true;
    } else if (input[p][0].a && !input[p][1].a || input[p][0].b && !input[p][1].b) {
      acts.DOWNATTACK.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DOWNDAMAGE = {
  name: "DOWNDAMAGE",
  canEdgeCancel: true,
  disableTeeter: true,
  airborneState: "DOWNDAMAGE",
  canBeGrabbed: true,
  downed: true,
  landType: 1,
  canGrabLedge: [false, false],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNDAMAGE";
    pl.timer = 0;
    pl.phys.jabReset = true;
    pl.phys.grounded = false;
    actionStates[characterSelections[p]].DOWNDAMAGE.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].DOWNDAMAGE.interrupt(p, input)) {
      if (!pl.phys.grounded) {
        pl.phys.cVel.y -= pl.charAttributes.gravity;
      } else {
        reduceByTraction(p, true);
      }
      if (pl.timer > 1) {
        pl.hit.hitstun--;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 13) {
      if (pl.phys.grounded) {
        if (pl.hit.hitstun <= 0) {
          acts.DOWNSTANDN.init(p, input);
        } else {
          acts.DOWNWAIT.init(p, input);
        }
      } else {
        acts.FALL.init(p, input);
      }
      return true;
    } else {
      return false;
    }
  },
  land: function (p, input) {}
};

S.DOWNSTANDN = {
  name: "DOWNSTANDN",
  canEdgeCancel: true,
  disableTeeter: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSTANDN";
    pl.timer = 0;
    actionStates[characterSelections[p]].DOWNSTANDN.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].DOWNSTANDN.interrupt(p, input)) {
      reduceByTraction(p, true);
      executeIntangibility("DOWNSTANDN", p);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].DOWNSTANDN) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DOWNSTANDB = {
  name: "DOWNSTANDB",
  canEdgeCancel: false,
  canBeGrabbed: true,
  setVelocities: [],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSTANDB";
    pl.timer = 0;
    actionStates[characterSelections[p]].DOWNSTANDB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.DOWNSTANDB.interrupt(p, input)) {
      pl.phys.cVel.x = acts.DOWNSTANDB.setVelocities[pl.timer - 1] * pl.phys.face;
      executeIntangibility("DOWNSTANDB", p);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].DOWNSTANDB) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.DOWNSTANDF = {
  name: "DOWNSTANDF",
  canEdgeCancel: false,
  canBeGrabbed: true,
  setVelocities: [],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "DOWNSTANDF";
    pl.timer = 0;
    actionStates[characterSelections[p]].DOWNSTANDF.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.DOWNSTANDF.interrupt(p, input)) {
      pl.phys.cVel.x = acts.DOWNSTANDF.setVelocities[pl.timer - 1] * pl.phys.face;
      executeIntangibility("DOWNSTANDF", p);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].DOWNSTANDF) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.TECHN = {
  name: "TECHN",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "TECHN";
    pl.timer = 0;
    actionStates[characterSelections[p]].TECHN.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].TECHN.interrupt(p, input)) {
      reduceByTraction(p, true);
      executeIntangibility("TECHN", p);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].TECHN) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.TECHB = {
  name: "TECHB",
  canEdgeCancel: false,
  canBeGrabbed: true,
  setVelocities: [],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "TECHB";
    pl.timer = 0;
    actionStates[characterSelections[p]].TECHB.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.TECHB.interrupt(p, input)) {
      executeIntangibility("TECHB", p);
      pl.phys.cVel.x = acts.TECHB.setVelocities[pl.timer - 1] * pl.phys.face;
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].TECHB) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.TECHF = {
  name: "TECHF",
  canEdgeCancel: false,
  canBeGrabbed: true,
  setVelocities: [],
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "TECHF";
    pl.timer = 0;
    actionStates[characterSelections[p]].TECHF.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.TECHF.interrupt(p, input)) {
      executeIntangibility("TECHF", p);
      pl.phys.cVel.x = acts.TECHF.setVelocities[pl.timer - 1] * pl.phys.face;
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].TECHF) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.SHIELDBREAKFALL = {
  name: "SHIELDBREAKFALL",
  canPassThrough: false,
  canBeGrabbed: true,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  headBonk: false,
  landType: 1,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SHIELDBREAKFALL";
    pl.timer = 0;
    actionStates[characterSelections[p]].SHIELDBREAKFALL.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].SHIELDBREAKFALL.interrupt(p, input)) {
      pl.phys.intangibleTimer = 1;
      pl.phys.cVel.y -= pl.charAttributes.gravity;
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].SHIELDBREAKFALL) {
      actionStates[characterSelections[p]].SHIELDBREAKFALL.init(p, input);
      return true;
    } else {
      return false;
    }
  },
  land: function (p, normal, input) {
    actionStates[characterSelections[p]].SHIELDBREAKDOWNBOUND.init(p, normal, input);
  }
};

S.SHIELDBREAKDOWNBOUND = {
  name: "SHIELDBREAKDOWNBOUND",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, normal, input) {
    const pl = player[p];
    pl.actionState = "SHIELDBREAKDOWNBOUND";
    pl.timer = 0;
    pl.phys.cVel.y = 0;
    pl.phys.kVel.y = 0;
    actionStates[characterSelections[p]].SHIELDBREAKDOWNBOUND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].SHIELDBREAKDOWNBOUND.interrupt(p, input)) {
      pl.phys.intangibleTimer = 1;
      if (pl.timer === 1) {
        reduceByTraction(p, true);
      } else {
        pl.phys.cVel.x = 0;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].SHIELDBREAKDOWNBOUND) {
      actionStates[characterSelections[p]].SHIELDBREAKSTAND.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.SHIELDBREAKSTAND = {
  name: "SHIELDBREAKSTAND",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SHIELDBREAKSTAND";
    pl.timer = 0;
    actionStates[characterSelections[p]].SHIELDBREAKSTAND.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].SHIELDBREAKSTAND.interrupt(p, input)) {
      reduceByTraction(p, true);
      pl.phys.intangibleTimer = 1;
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].SHIELDBREAKSTAND) {
      actionStates[characterSelections[p]].FURAFURA.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.FURAFURA = {
  name: "FURAFURA",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FURAFURA";
    pl.timer = 0;
    pl.phys.stuckTimer = 490;
    pl.furaLoopID = sounds.furaloop.play();
    actionStates[characterSelections[p]].FURAFURA.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].FURAFURA.interrupt(p, input)) {
      if (pl.timer % 100 === 65) {}
      reduceByTraction(p, true);
      if (pl.timer % 49 === 0) {}
      if (pl.timer % 49 === 20) {}
      if (pl.phys.shieldHP > 30) {
        pl.phys.shieldHP = 30;
      }
      pl.phys.stuckTimer--;
      if (mashOut(p, input)) {
        pl.phys.stuckTimer -= 3;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.phys.stuckTimer <= 0) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].FURAFURA) {
      pl.timer = 1;
      return false;
    } else {
      return false;
    }
  }
};

S.CAPTUREPULLED = {
  name: "CAPTUREPULLED",
  canEdgeCancel: false,
  canBeGrabbed: false,
  inGrab: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CAPTUREPULLED";
    pl.timer = 0;
    pl.phys.grounded = true;
    const grabbedBy = pl.phys.grabbedBy;
    if (grabbedBy === -1) {
      return;
    }
    pl.phys.face = -1 * player[grabbedBy].phys.face;
    pl.phys.onSurface = [player[grabbedBy].phys.onSurface[0], player[grabbedBy].phys.onSurface[1]];
    pl.phys.stuckTimer = 100 + 2 * pl.percent;
    actionStates[characterSelections[p]].CAPTUREPULLED.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].CAPTUREPULLED.interrupt(p, input)) {
      if (pl.timer === 2) {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + -16.41205 * pl.phys.face, player[grabbedBy].phys.pos.y);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 2) {
      acts.CAPTUREWAIT.init(p, input);
      const grabbedBy = pl.phys.grabbedBy;
      if (grabbedBy === -1) {
        return;
      }
      acts.CATCHWAIT.init(grabbedBy, input);
      return true;
    } else {
      return false;
    }
  }
};

S.CAPTUREWAIT = {
  name: "CAPTUREWAIT",
  canEdgeCancel: false,
  canBeGrabbed: false,
  inGrab: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CAPTUREWAIT";
    pl.timer = 0;
    const grabbedBy = pl.phys.grabbedBy;
    if (grabbedBy === -1) {
      return;
    }
    pl.phys.pos = new Vec2D(player[grabbedBy].phys.pos.x + -9.04298 * pl.phys.face, player[grabbedBy].phys.pos.y);
    actionStates[characterSelections[p]].CAPTUREWAIT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].CAPTUREWAIT.interrupt(p, input)) {
      pl.phys.stuckTimer--;
      if (mashOut(p, input)) {
        pl.phys.stuckTimer -= 3;
        pl.phys.pos.x += 0.5 * Math.sign(Math.random() - 0.5);
      } else {
        const grabbedBy = pl.phys.grabbedBy;
        if (grabbedBy === -1) {
          return;
        }
        pl.phys.pos.x = player[grabbedBy].phys.pos.x + -9.04298 * pl.phys.face;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.phys.stuckTimer < 0) {
      const grabbedBy = pl.phys.grabbedBy;
      if (grabbedBy === -1) {
        return;
      }
      acts.CATCHCUT.init(grabbedBy, input);
      acts.CAPTURECUT.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].CAPTUREWAIT) {
      acts.CAPTUREWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.CATCHWAIT = {
  name: "CATCHWAIT",
  canEdgeCancel: false,
  canBeGrabbed: true,
  inGrab: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CATCHWAIT";
    pl.timer = 0;
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].CATCHWAIT.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].CATCHWAIT.interrupt(p, input)) {}
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (input[p][0].a && !input[p][1].a) {
      acts.CATCHATTACK.init(p, input);
      return true;
    } else if (input[p][0].lsY > 0.7 && input[p][1].lsY <= 0.7 || input[p][0].csY > 0.7 && input[p][1].csY <= 0.7) {
      acts.THROWUP.init(p, input);
      return true;
    } else if (input[p][0].lsY < -0.7 && input[p][1].lsY >= -0.7 || input[p][0].csY < -0.7) {
      acts.THROWDOWN.init(p, input);
      return true;
    } else if (input[p][0].lsX * pl.phys.face < -0.7 && input[p][1].lsX * pl.phys.face >= -0.7 || input[p][0].csX * pl.phys.face < -0.7 && input[p][1].csX * pl.phys.face >= -0.7) {
      acts.THROWBACK.init(p, input);
      return true;
    } else if (input[p][0].lsX * pl.phys.face > 0.7 && input[p][1].lsX * pl.phys.face <= 0.7 || input[p][0].csX * pl.phys.face > 0.7 && input[p][1].csX * pl.phys.face <= 0.7) {
      acts.THROWFORWARD.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].CATCHWAIT) {
      acts.CATCHWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.CAPTURECUT = {
  name: "CAPTURECUT",
  canEdgeCancel: false,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  canBeGrabbed: true,
  inGrab: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CAPTURECUT";
    pl.timer = 0;
    pl.phys.grabbedBy = -1;
    pl.phys.cVel.x = -1 * pl.phys.face;
    actionStates[characterSelections[p]].CAPTURECUT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].CAPTURECUT.interrupt(p, input)) {
      if (pl.timer === 2) {
        pl.phys.grabTech = false;
      }
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].CAPTURECUT) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.CATCHCUT = {
  name: "CATCHCUT",
  canEdgeCancel: false,
  canGrabLedge: [true, false],
  canBeGrabbed: true,
  inGrab: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CATCHCUT";
    pl.timer = 0;
    pl.phys.grabbing = -1;
    pl.phys.cVel.x = -1 * pl.phys.face;
    actionStates[characterSelections[p]].CATCHCUT.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].CATCHCUT.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].CATCHCUT) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.CAPTUREDAMAGE = {
  name: "CAPTUREDAMAGE",
  canEdgeCancel: false,
  canBeGrabbed: false,
  setPositions: [9.478, 9.478, 9.478, 9.478, 9.478, 9.478, 9.478, 9.478, 9.478, 9.306, 8.920, 8.516, 8.290, 8.293, 8.410, 8.593, 8.792, 8.959, 9.043, 9.068],
  inGrab: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "CAPTUREDAMAGE";
    pl.timer = 0;
    actionStates[characterSelections[p]].CAPTUREDAMAGE.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    pl.timer++;
    if (!acts.CAPTUREDAMAGE.interrupt(p, input)) {
      const grabbedBy = pl.phys.grabbedBy;
      if (grabbedBy === -1) {
        return;
      }
      pl.phys.pos.x = player[grabbedBy].phys.pos.x + -acts.CAPTUREDAMAGE.setPositions[pl.timer - 1] * pl.phys.face;
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].CAPTUREDAMAGE) {
      actionStates[characterSelections[p]].CAPTUREWAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.WALLDAMAGE = {
  name: "WALLDAMAGE",
  canPassThrough: false,
  canGrabLedge: [false, false],
  wallJumpAble: false,
  canBeGrabbed: true,
  headBonk: true,
  landType: 2,
  init: function (p, input, normal) {
    const pl = player[p];
    pl.actionState = "WALLDAMAGE";
    pl.timer = 0;
    pl.phys.hurtBoxState = 1;
    pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 15);
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    const tangent = new Vec2D(-normal.y, normal.x);
    const totalVel = new Vec2D(pl.phys.kVel.x + pl.phys.cVel.x, pl.phys.kVel.y + pl.phys.cVel.y);
    const reflectedDec = dotProd(totalVel, normal) < 0 ? reflect(pl.phys.kDec, tangent) : pl.phys.kDec;
    const reflectedVel = dotProd(totalVel, normal) < 0 ? reflect(totalVel, tangent) : pl.phys.kVel;
    pl.phys.kVel.x = reflectedVel.x * 0.8;
    pl.phys.kVel.y = reflectedVel.y * 0.8;
    pl.phys.kDec.x = reflectedDec.x;
    pl.phys.kDec.y = reflectedDec.y;
    actionStates[characterSelections[p]].WALLDAMAGE.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.hit.hitstun % 10 === 0) {}
    if (!actionStates[characterSelections[p]].WALLDAMAGE.interrupt(p, input)) {
      pl.hit.hitstun--;
      pl.phys.cVel.y -= pl.charAttributes.gravity;
      if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
        pl.phys.cVel.y = -pl.charAttributes.terminalV;
      }
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].WALLDAMAGE) {
      actionStates[characterSelections[p]].DAMAGEFALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.WALLTECH = {
  name: "WALLTECH",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: false,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "WALLTECH";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.hit.knockback = 0;
    pl.hit.hitstun = 0;
    pl.phys.kVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 14);
    if (pl.phys.face === 1) {} else {}
    actionStates[characterSelections[p]].WALLTECH.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer < 1) {
      pl.timer += 0.15;
      if (pl.timer > 1) {
        pl.timer = 1;
      }
    } else {
      pl.timer++;
    }
    if (!actionStates[characterSelections[p]].WALLTECH.interrupt(p, input)) {
      if (pl.timer === 2) {}
      if (pl.timer > 0.89 && pl.timer < 0.91) {
        pl.phys.cVel.x = pl.phys.face * 0.5;
      }
      if (pl.timer >= 1) {
        fastfall(p, input);
        airDrift(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 1) {
      const a = checkForAerials(p, input);
      const b = checkForSpecials(p, input);
      if (a[0]) {
        acts[a[1]].init(p, input);
        return true;
      } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
        acts.ESCAPEAIR.init(p, input);
        return true;
      } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
        if (input[p][0].lsX * pl.phys.face < -0.3) {
          acts.JUMPAERIALB.init(p, input);
        } else {
          acts.JUMPAERIALF.init(p, input);
        }
        return true;
      } else if (b[0]) {
        acts[b[1]].init(p, input);
        return true;
      } else if (pl.timer > framesData[characterSelections[p]].WALLTECH) {
        acts.FALL.init(p, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

S.WALLJUMP = {
  name: "WALLJUMP",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: false,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "WALLJUMP";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.hit.hitstun = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 14);
    pl.phys.cVel.x = pl.phys.face * pl.charAttributes.wallJumpVelX;
    pl.phys.cVel.y = pl.charAttributes.wallJumpVelY * Math.pow(0.97, pl.phys.wallJumpCount);
    pl.phys.wallJumpCount++;
    pl.hit.hitlag = 5;
    pl.hit.knockback = 0;
    if (pl.phys.face === 1) {} else {}
    actionStates[characterSelections[p]].WALLJUMP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer === 2) {}
    if (!actionStates[characterSelections[p]].WALLJUMP.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 1) {
      const a = checkForAerials(p, input);
      const b = checkForSpecials(p, input);
      if (a[0]) {
        acts[a[1]].init(p, input);
        return true;
      } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
        acts.ESCAPEAIR.init(p, input);
        return true;
      } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
        if (input[p][0].lsX * pl.phys.face < -0.3) {
          acts.JUMPAERIALB.init(p, input);
        } else {
          acts.JUMPAERIALF.init(p, input);
        }
        return true;
      } else if (b[0]) {
        acts[b[1]].init(p, input);
        return true;
      } else if (pl.timer > framesData[characterSelections[p]].WALLJUMP) {
        acts.FALL.init(p, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

S.WALLTECHJUMP = {
  name: "WALLTECHJUMP",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: true,
  headBonk: false,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "WALLTECHJUMP";
    pl.timer = 0;
    pl.phys.fastfalled = false;
    pl.hit.knockback = 0;
    pl.hit.hitstun = 0;
    pl.phys.kVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 14);
    if (pl.phys.face === 1) {} else {}
    actionStates[characterSelections[p]].WALLTECHJUMP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    if (pl.timer < 1) {
      pl.timer += 0.15;
      if (pl.timer > 1) {
        pl.timer = 1;
      }
    } else {
      pl.timer++;
    }
    if (pl.timer === 2) {}
    if (!actionStates[characterSelections[p]].WALLTECH.interrupt(p, input)) {
      if (pl.timer > 0.89 && pl.timer < 0.91) {
        pl.phys.cVel.x = pl.phys.face * pl.charAttributes.wallJumpVelX;
        pl.phys.cVel.y = pl.charAttributes.wallJumpVelY;
      }
      if (pl.timer >= 1) {
        fastfall(p, input);
        airDrift(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 1) {
      const a = checkForAerials(p, input);
      const b = checkForSpecials(p, input);
      if (a[0]) {
        acts[a[1]].init(p, input);
        return true;
      } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
        acts.ESCAPEAIR.init(p, input);
        return true;
      } else if (checkForDoubleJump(p, input) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
        if (input[p][0].lsX * pl.phys.face < -0.3) {
          acts.JUMPAERIALB.init(p, input);
        } else {
          acts.JUMPAERIALF.init(p, input);
        }
        return true;
      } else if (b[0]) {
        acts[b[1]].init(p, input);
        return true;
      } else if (pl.timer > framesData[characterSelections[p]].WALLJUMP) {
        acts.FALL.init(p, input);
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

S.OTTOTTO = {
  name: "OTTOTTO",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "OTTOTTO";
    pl.timer = 1;
    pl.phys.cVel.x = 0;
    actionStates[characterSelections[p]].OTTOTTO.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].OTTOTTO.interrupt(p, input)) {}
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    const b = checkForSpecials(p, input);
    const t = checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (pl.timer > framesData[characterSelections[p]].OTTOTTO) {
      acts.OTTOTTOWAIT.init(p, input);
      return true;
    } else if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (checkForSquat(p, input)) {
      acts.SQUAT.init(p, input);
      return true;
    } else if (checkForDash(p, input)) {
      acts.DASH.init(p, input);
      return true;
    } else if (checkForSmashTurn(p, input)) {
      acts.SMASHTURN.init(p, input);
      return true;
    } else if (checkForTiltTurn(p, input)) {
      pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
      acts.TILTTURN.init(p, input);
      return true;
    } else if (Math.abs(input[p][0].lsX) > 0.6) {
      acts.WALK.init(p, true, input);
      return true;
    } else {
      return false;
    }
  }
};

S.OTTOTTOWAIT = {
  name: "OTTOTTOWAIT",
  canEdgeCancel: false,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "OTTOTTOWAIT";
    pl.timer = 1;
    if (templateOf[characterSelections[p]] !== 1 && templateOf[characterSelections[p]] !== 4) {} // HOJA: template id for approximated fighters
    pl.phys.cVel.x = 0;
    actionStates[characterSelections[p]].OTTOTTOWAIT.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (pl.timer > framesData[characterSelections[p]].OTTOTTOWAIT) {
      pl.timer = 0;
    }
    if (!actionStates[characterSelections[p]].OTTOTTOWAIT.interrupt(p, input)) {}
  },
  interrupt: function (p, input) {
    const acts = actionStates[characterSelections[p]];
    const b = checkForSpecials(p, input);
    const t = checkForTilts(p, input);
    const s = checkForSmashes(p, input);
    const j = checkForJump(p, input);
    if (j[0]) {
      acts.KNEEBEND.init(p, j[1], input);
      return true;
    } else if (input[p][0].l || input[p][0].r) {
      acts.GUARDON.init(p, input);
      return true;
    } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
      acts.GUARDON.init(p, input);
    } else if (b[0]) {
      acts[b[1]].init(p, input);
      return true;
    } else if (s[0]) {
      acts[s[1]].init(p, input);
      return true;
    } else if (t[0]) {
      acts[t[1]].init(p, input);
      return true;
    } else if (input[p][0].du) {
      acts.APPEAL.init(p, input);
      return true;
    } else if (checkForSquat(p, input)) {
      acts.SQUAT.init(p, input);
      return true;
    } else if (checkForDash(p, input)) {
      acts.DASH.init(p, input);
      return true;
    } else if (checkForSmashTurn(p, input)) {
      acts.SMASHTURN.init(p, input);
      return true;
    } else if (checkForTiltTurn(p, input)) {
      player[p].phys.dashbuffer = tiltTurnDashBuffer(p, input);
      acts.TILTTURN.init(p, input);
      return true;
    } else if (Math.abs(input[p][0].lsX) > 0.6) {
      acts.WALK.init(p, true, input);
      return true;
    } else {
      return false;
    }
  }
};

S.MISSFOOT = {
  name: "MISSFOOT",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: true,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "MISSFOOT";
    pl.timer = 0;
    pl.hit.hitstun = 0;
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].MISSFOOT.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].MISSFOOT.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > 26) {
      actionStates[characterSelections[p]].DAMAGEFALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.FURASLEEPSTART = {
  name: "FURASLEEPSTART",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FURASLEEPSTART";
    pl.timer = 0;
    pl.phys.stuckTimer = 95 + 2 * Math.floor(pl.percent);
    actionStates[characterSelections[p]].FURASLEEPSTART.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    let newCol;
    pl.timer++;
    if (!actionStates[characterSelections[p]].FURASLEEPSTART.interrupt(p, input)) {
      pl.phys.stuckTimer--;
      reduceByTraction(p, true);
      let originalColour = palettes[pPal[p]][0];
      originalColour = originalColour.substr(4, originalColour.length - 5);
      const colourArray = originalColour.split(",");
      const part = pl.timer % 30;
      if (part < 25) {
        pl.colourOverlayBool = true;
        if (part < 13) {
          newCol = blendColours(colourArray, [207, 45, 190], Math.min(1, part / 12));
        } else {
          newCol = blendColours(colourArray, [207, 45, 190], Math.max(0, 1 - (part - 1)));
        }
        pl.colourOverlay = "rgb(" + newCol[0] + "," + newCol[1] + "," + newCol[2] + ")";
      } else {
        pl.colourOverlayBool = false;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.phys.stuckTimer <= 0) {
      pl.colourOverlayBool = false;
      acts.FURASLEEPEND.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].FURASLEEPSTART) {
      pl.colourOverlayBool = false;
      acts.FURASLEEPLOOP.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.FURASLEEPLOOP = {
  name: "FURASLEEPLOOP",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FURASLEEPLOOP";
    pl.timer = 0;
    actionStates[characterSelections[p]].FURASLEEPLOOP.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    let newCol;
    pl.timer++;
    if (!actionStates[characterSelections[p]].FURASLEEPLOOP.interrupt(p, input)) {
      pl.phys.stuckTimer--;
      let originalColour = palettes[pPal[p]][0];
      originalColour = originalColour.substr(4, originalColour.length - 5);
      const colourArray = originalColour.split(",");
      const part = pl.timer % 30;
      if (part < 25) {
        pl.colourOverlayBool = true;
        if (part < 13) {
          newCol = blendColours(colourArray, [207, 45, 190], Math.min(1, part / 12));
        } else {
          newCol = blendColours(colourArray, [207, 45, 190], Math.max(0, 1 - (part - 1)));
        }
        pl.colourOverlay = "rgb(" + newCol[0] + "," + newCol[1] + "," + newCol[2] + ")";
      } else {
        pl.colourOverlayBool = false;
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    if (pl.phys.stuckTimer <= 0) {
      pl.colourOverlayBool = false;
      actionStates[characterSelections[p]].FURASLEEPEND.init(p, input);
      return true;
    } else if (pl.timer > framesData[characterSelections[p]].FURASLEEPLOOP) {
      pl.timer = 1;
      pl.colourOverlayBool = false;
      return false;
    } else {
      return false;
    }
  }
};

S.FURASLEEPEND = {
  name: "FURASLEEPEND",
  canEdgeCancel: true,
  canBeGrabbed: true,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "FURASLEEPEND";
    pl.timer = 0;
    actionStates[characterSelections[p]].FURASLEEPEND.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].FURASLEEPEND.interrupt(p, input)) {
      reduceByTraction(p, true);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].FURASLEEPEND) {
      actionStates[characterSelections[p]].WAIT.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.STOPCEIL = {
  name: "STOPCEIL",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: true,
  canBeGrabbed: true,
  landType: 1,
  init: function (p, input, normal = null) {
    const pl = player[p];
    pl.actionState = "STOPCEIL";
    pl.timer = 0;
    pl.phys.cVel.y = 0;
    if (normal !== null) {
      pl.phys.hurtBoxState = 1;
      pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 15);
      const tangent = new Vec2D(-normal.y, normal.x);
      const reflectedDec = dotProd(pl.phys.kVel, normal) < 0 ? reflect(pl.phys.kDec, tangent) : pl.phys.kDec;
      const reflectedVel = dotProd(pl.phys.kVel, normal) < 0 ? reflect(pl.phys.kVel, tangent) : pl.phys.kVel;
      pl.phys.kVel.x = reflectedVel.x * 0.8;
      pl.phys.kVel.y = reflectedVel.y * 0.8;
      pl.phys.kDec.x = reflectedDec.x;
      pl.phys.kDec.y = reflectedDec.y;
    }
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].STOPCEIL.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    if (!actionStates[characterSelections[p]].STOPCEIL.interrupt(p, input)) {
      if (pl.hit.hitstun > 0) {
        if (pl.hit.hitstun % 10 === 0) {}
        pl.hit.hitstun--;
        pl.phys.cVel.y -= pl.charAttributes.gravity;
        if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
          pl.phys.cVel.y = -pl.charAttributes.terminalV;
        }
      } else {
        airDrift(p, input);
      }
    }
  },
  interrupt: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.timer > 5 && pl.hit.hitstun <= 0) {
      acts.FALL.init(p, input);
    } else if (pl.timer > framesData[characterSelections[p]].STOPCEIL) {
      if (pl.hit.hitstun <= 0) {
        acts.DAMAGEFALL.init(p, input);
        return true;
      } else {
        pl.timer = framesData[characterSelections[p]].STOPCEIL;
        return false;
      }
    } else {
      return false;
    }
  },
  land: function (p, input) {
    const pl = player[p];
    const acts = actionStates[characterSelections[p]];
    if (pl.hit.hitstun > 0) {
      if (pl.phys.techTimer > 0) {
        if (input[p][0].lsX * pl.phys.face > 0.5) {
          acts.TECHF.init(p, input);
        } else if (input[p][0].lsX * pl.phys.face < -0.5) {
          acts.TECHB.init(p, input);
        } else {
          acts.TECHN.init(p, input);
        }
      } else {
        acts.DOWNBOUND.init(p, input);
      }
    } else {
      acts.LANDING.init(p, input);
    }
  }
};

S.TECHU = {
  name: "TECHU",
  canPassThrough: true,
  canGrabLedge: [true, false],
  wallJumpAble: false,
  headBonk: false,
  canBeGrabbed: true,
  landType: 0,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "TECHU";
    pl.timer = 0;
    pl.phys.cVel.y = 0;
    pl.phys.cVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.fastfalled = false;
    pl.hit.knockback = 0;
    pl.hit.hitstun = 0;
    pl.phys.intangibleTimer = Math.max(pl.phys.intangibleTimer, 14);
    turnOffHitboxes(p);
    actionStates[characterSelections[p]].TECHU.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    if (!actionStates[characterSelections[p]].TECHU.interrupt(p, input)) {
      fastfall(p, input);
      airDrift(p, input);
    }
  },
  interrupt: function (p, input) {
    if (player[p].timer > framesData[characterSelections[p]].TECHU) {
      actionStates[characterSelections[p]].FALL.init(p, input);
      return true;
    } else {
      return false;
    }
  }
};

S.SLEEP = {
  name: "SLEEP",
  canBeGrabbed: false,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "SLEEP";
    pl.timer = 0;
    pl.hit.hitstun = 0;
    pl.phys.kVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.pos.x = 300;
    actionStates[characterSelections[p]].SLEEP.main(p, input);
  },
  main: function (p, input) {
    player[p].phys.outOfCameraTimer = 0;
  },
  interrupt: function (p, input) {
    return false;
  }
};

S.ENTRANCE = {
  name: "ENTRANCE",
  canBeGrabbed: false,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "ENTRANCE";
    pl.timer = 0;
    pl.phys.grounded = false;
    actionStates[characterSelections[p]].ENTRANCE.main(p, input);
  },
  main: function (p, input) {
    player[p].timer++;
    actionStates[characterSelections[p]].ENTRANCE.interrupt(p, input);
  },
  interrupt: function (p, input) {
    if (player[p].timer > 60) {
      actionStates[characterSelections[p]].FALL.init(p, input);
    }
  }
};

S.THROWNFALCONDIVE = {
  name: "THROWNFALCONDIVE",
  canEdgeCancel: false,
  canGrabLedge: [false, false],
  canBeGrabbed: false,
  wallJumpAble: false,
  reverseModel: false,
  init: function (p, input) {
    const pl = player[p];
    pl.actionState = "THROWNFALCONDIVE";
    pl.phys.cVel.x = 0;
    pl.phys.cVel.y = 0;
    pl.phys.kVel.x = 0;
    pl.phys.kVel.y = 0;
    pl.phys.grounded = false;
    pl.timer = 0;
    actionStates[characterSelections[p]].THROWNFALCONDIVE.main(p, input);
  },
  main: function (p, input) {
    const pl = player[p];
    pl.timer++;
    pl.phys.kVel = new Vec2D(0, 0);
    if (!actionStates[characterSelections[p]].THROWNFALCONDIVE.interrupt(p, input)) {}
  },
  interrupt: function (p, input) {
    return false;
  }
};
