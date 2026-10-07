/**
 * shortcuts.js: shared action-state helpers (interrupt checks, air drift, fast fall, traction, shield).
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { actionSounds, characterSelections, floatStep, gameMode, gameSettings, intangibility, player, playerType, versusMode } from './ml.js';
import { S } from './shared.js';
import { Vec2D, deepCopyObject } from './util.js';

// ---- physics/actionStateShortcuts.js ----
export function randomShout(char) {
  switch (char) {
    case 0:
      var shout = Math.round(0.5 + Math.random() * 5.99);
      switch (shout) {
        case 1:
          break;
        case 2:
          break;
        case 3:
          break;
        case 4:
          break;
        case 5:
          break;
        case 6:
          break;
        default:
          break;
      }
      break;
    case 1:
      var shout = Math.round(0.5 + Math.random() * 4.99);
      switch (shout) {
        case 1:
          break;
        case 2:
          break;
        case 3:
          break;
        case 4:
          break;
        case 5:
          break;
        default:
          break;
      }
      break;
    case 2:
      var shout = Math.round(0.5 + Math.random() * 4.99);
      switch (shout) {
        case 1:
          break;
        case 2:
          break;
        case 3:
          break;
        case 4:
          break;
        case 5:
          break;
        default:
          break;
      }
      break;
    case 3:
      var shout = Math.round(0.5 + Math.random() * 4.99);
      switch (shout) {
        case 1:
          break;
        case 2:
          break;
        case 3:
          break;
        case 4:
          break;
        case 5:
          break;
        default:
          break;
      }
      break;
    case 4:
      var shout = Math.round(0.5 + Math.random() * 5.99);
      switch (shout) {
        case 1:
          break;
        case 2:
          break;
        case 3:
          break;
        case 4:
          break;
        case 5:
          break;
        case 6:
          break;
        default:
          break;
      }
    default:
      break;
  }
}
export function executeIntangibility(actionStateName, p) {
  const pl = player[p];
  if (pl.timer == intangibility[characterSelections[p]][actionStateName][0]) {
    pl.phys.intangibleTimer = intangibility[characterSelections[p]][actionStateName][1];
    pl.phys.hurtBoxState = 1;
  }
}
export function playSounds(actionStateName, p) {
  for (var i = 0; i < actionSounds[characterSelections[p]][actionStateName].length; i++) {
    if (player[p].timer == actionSounds[characterSelections[p]][actionStateName][i][0]) {}
  }
}
export function isFinalDeath() {
  if (gameMode == 5) {
    return true;
  } else if (versusMode) {
    return false;
  } else {
    let finalDeaths = 0;
    let totalPlayers = 0;
    for (let j = 0; j < 4; j++) {
      if (playerType[j] > -1) {
        totalPlayers++;
        if (player[j].stocks == 0) {
          finalDeaths++;
        }
      }
    }
    return finalDeaths >= Math.max(1, totalPlayers - 1);
  }
}
export function getAngle(x, y) {
  var angle = 0;
  if (x != 0 || y != 0) {
    angle = Math.atan2(y, x);
  }
  return angle;
}
export function turnOffHitboxes(p) {
  const pl = player[p];
  pl.hitboxes.active = [false, false, false, false];
  pl.hitboxes.hitList = [];
}
export function shieldTilt(p, shieldstun, input) {
  const pl = player[p];
  if (!shieldstun && !pl.inCSS) {
    var x = input[p][0].lsX;
    var y = input[p][0].lsY;
    var targetOffset = Math.sqrt(x * x + y * y) * 3;
    var targetAngle = getAngle(x, y);
    var targetPosition = new Vec2D(Math.cos(targetAngle) * targetOffset, Math.sin(targetAngle) * targetOffset);
    pl.phys.shieldPosition = new Vec2D(pl.phys.shieldPosition.x + ((targetPosition.x - pl.phys.shieldPosition.x) / 5 + 0.01), pl.phys.shieldPosition.y + ((targetPosition.y - pl.phys.shieldPosition.y) / 5 + 0.01));
  }
  pl.phys.shieldPositionReal = new Vec2D(pl.phys.pos.x + pl.phys.shieldPosition.x + pl.charAttributes.shieldOffset[0] * pl.phys.face / 4.5, pl.phys.pos.y + pl.phys.shieldPosition.y + pl.charAttributes.shieldOffset[1] / 4.5);
}
export function reduceByTraction(p, applyDouble) {
  const pl = player[p];
  if (pl.phys.cVel.x > 0) {
    if (applyDouble && pl.phys.cVel.x > pl.charAttributes.maxWalk) {
      pl.phys.cVel.x -= pl.charAttributes.traction * 2;
    } else {
      pl.phys.cVel.x -= pl.charAttributes.traction;
    }
    if (pl.phys.cVel.x < 0) {
      pl.phys.cVel.x = 0;
    }
  } else {
    if (applyDouble && pl.phys.cVel.x < -pl.charAttributes.maxWalk) {
      pl.phys.cVel.x += pl.charAttributes.traction * 2;
    } else {
      pl.phys.cVel.x += pl.charAttributes.traction;
    }
    if (pl.phys.cVel.x > 0) {
      pl.phys.cVel.x = 0;
    }
  }
}
export function airDrift(p, input) {
  const pl = player[p];
  if (Math.abs(input[p][0].lsX) < 0.3) {
    var tempMax = 0;
  } else {
    var tempMax = pl.charAttributes.aerialHmaxV * input[p][0].lsX;
  }
  if (tempMax < 0 && pl.phys.cVel.x < tempMax || tempMax > 0 && pl.phys.cVel.x > tempMax) {
    if (pl.phys.cVel.x > 0) {
      pl.phys.cVel.x -= pl.charAttributes.airFriction;
      if (pl.phys.cVel.x < 0) {
        pl.phys.cVel.x = 0;
      }
    } else {
      pl.phys.cVel.x += pl.charAttributes.airFriction;
      if (pl.phys.cVel.x > 0) {
        pl.phys.cVel.x = 0;
      }
    }
  } else if (Math.abs(input[p][0].lsX) > 0.3 && (tempMax < 0 && pl.phys.cVel.x > tempMax || tempMax > 0 && pl.phys.cVel.x < tempMax)) {
    pl.phys.cVel.x += pl.charAttributes.airMobA * input[p][0].lsX + Math.sign(input[p][0].lsX) * pl.charAttributes.airMobB;
  }
  if (Math.abs(input[p][0].lsX) < 0.3) {
    if (pl.phys.cVel.x > 0) {
      pl.phys.cVel.x -= pl.charAttributes.airFriction;
      if (pl.phys.cVel.x < 0) {
        pl.phys.cVel.x = 0;
      }
    } else {
      pl.phys.cVel.x += pl.charAttributes.airFriction;
      if (pl.phys.cVel.x > 0) {
        pl.phys.cVel.x = 0;
      }
    }
  }
}
export function fastfall(p, input) {
  const pl = player[p];
  if (pl.charAttributes.floatFrames && floatStep(p, input)) return; // HOJA: float (approximated Rosette)
  if (!pl.phys.fastfalled) {
    pl.phys.cVel.y -= pl.charAttributes.gravity;
    if (pl.phys.cVel.y < -pl.charAttributes.terminalV) {
      pl.phys.cVel.y = -pl.charAttributes.terminalV;
    }
    if (input[p][0].lsY < -0.65 && input[p][3].lsY > -0.1 && pl.phys.cVel.y < 0) {
      pl.phys.fastfalled = true;
      pl.phys.cVel.y = -pl.charAttributes.fastFallV;
    }
  }
}
export function shieldDepletion(p, input) {
  const pl = player[p];
  var input = Math.max(input[p][0].lA, input[p][0].rA);
  pl.phys.shieldHP -= 0.28 * input - (1 - input) / 10;
  if (pl.phys.shieldHP <= 0) {
    pl.phys.shielding = false;
    pl.phys.kVel.y = pl.charAttributes.shieldBreakVel;
    pl.phys.kDec.y = 0.051;
    pl.phys.kDec.x = 0;
    pl.phys.grounded = false;
    pl.phys.shieldHP = 0;
    actionStates[characterSelections[p]].SHIELDBREAKFALL.init(p, input);
  }
}
export function shieldSize(p, lock, input) {
  const pl = player[p];
  pl.phys.shieldAnalog = Math.max(input[p][0].lA, input[p][0].rA);
  if (pl.phys.shieldAnalog === 0) {
    pl.phys.shieldAnalog = 1;
  }
  if (lock && pl.phys.shieldAnalog == 0) {
    pl.phys.shieldAnalog = 1;
  }
  pl.phys.shieldSize = pl.charAttributes.shieldScale * 0.575 * pl.charAttributes.modelScale * (pl.phys.shieldHP / 60) + (1 - pl.phys.shieldAnalog) * 0.6 * pl.charAttributes.shieldScale + (60 - pl.phys.shieldHP) / 60 * 2;
}
export function mashOut(p, input) {
  if (input[p][0].a && !input[p][1].a) {
    return true;
  } else if (input[p][0].b && !input[p][1].b) {
    return true;
  } else if (input[p][0].x && !input[p][1].x) {
    return true;
  } else if (input[p][0].y && !input[p][1].y) {
    return true;
  } else if (input[p][0].lsX > 0.8 && !input[p][1].lsX < 0.7) {
    return true;
  } else if (input[p][0].lsX < -0.8 && !input[p][1].lsX < -0.7) {
    return true;
  } else if (input[p][0].lsY > 0.8 && !input[p][1].lsY < 0.7) {
    return true;
  } else if (input[p][0].lsY < -0.8 && !input[p][1].lsY > -0.7) {
    return true;
  } else if (input[p][0].csX > 0.8 && !input[p][1].csX < 0.7) {
    return true;
  } else if (input[p][0].csX < -0.8 && !input[p][1].csX < -0.7) {
    return true;
  } else if (input[p][0].csY > 0.8 && !input[p][1].csY < 0.7) {
    return true;
  } else if (input[p][0].csY < -0.8 && !input[p][1].csY > -0.7) {
    return true;
  } else {
    return false;
  }
}
export function checkForSmashes(p, input) {
  const pl = player[p];
  if (input[p][0].a && !input[p][1].a) {
    if (Math.abs(input[p][0].lsX) >= 0.79 && input[p][2].lsX * Math.sign(input[p][0].lsX) < 0.3) {
      pl.phys.face = Math.sign(input[p][0].lsX);
      return [true, "FORWARDSMASH"];
    } else if (input[p][0].lsY >= 0.66 && input[p][2].lsY < 0.3) {
      return [true, "UPSMASH"];
    } else if (input[p][0].lsY <= -0.66 && input[p][2].lsY > -0.3) {
      return [true, "DOWNSMASH"];
    } else {
      return [false, false];
    }
  } else if (Math.abs(input[p][0].csX) >= 0.79 && Math.abs(input[p][1].csX) < 0.79) {
    pl.phys.face = Math.sign(input[p][0].csX);
    return [true, "FORWARDSMASH"];
  } else if (input[p][0].csY >= 0.66 && input[p][1].csY < 0.66) {
    return [true, "UPSMASH"];
  } else if (input[p][0].csY <= -0.66 && input[p][1].csY > -0.66) {
    return [true, "DOWNSMASH"];
  } else {
    return [false, false];
  }
}
export function checkForTilts(p, input, reverse) {
  var reverse = reverse || 1;
  if (input[p][0].a && !input[p][1].a) {
    if (input[p][0].lsX * player[p].phys.face * reverse > 0.3 && Math.abs(input[p][0].lsX) - Math.abs(input[p][0].lsY) > -0.05) {
      return [true, "FORWARDTILT"];
    } else if (input[p][0].lsY < -0.3) {
      return [true, "DOWNTILT"];
    } else if (input[p][0].lsY > 0.3) {
      return [true, "UPTILT"];
    } else {
      return [true, "JAB1"];
    }
  } else {
    return [false, false];
  }
}
export function checkForIASA(p, input, isAerial) {
  const pl = player[p];
  if (pl.timer > pl.IASATimer) {
    if (isAerial) {
      const a = checkForAerials(p, input);
      if (checkForDoubleJump(p, input) && !pl.phys.doubleJumped || checkForMultiJump(p, input) && pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump) {
        if (input[p][0].lsX * pl.phys.face < -0.3) {
          S.JUMPAERIALB.init(p, input);
        } else {
          S.JUMPAERIALF.init(p, input);
        }
        return true;
      } else if (a[0]) {
        actionStates[characterSelections[p]][a[1]].init(p, input); // HOJA: meleelight hard-coded this for chars 0-2 only
        return true;
      } else {
        return false;
      }
    } else {}
  }
}
export function checkForSpecials(p, input) {
  const pl = player[p];
  if (input[p][0].b && !input[p][1].b) {
    if (pl.phys.grounded) {
      if (Math.abs(input[p][0].lsX) > 0.59 || input[p][0].lsY > 0.54 && Math.abs(input[p][0].lsX) > input[p][0].lsY - 0.2) {
        pl.phys.face = Math.sign(input[p][0].lsX);
        return [true, "SIDESPECIALGROUND"];
      } else if (input[p][0].lsY > 0.54) {
        return [true, "UPSPECIAL"];
      } else if (input[p][0].lsY < -0.54) {
        return [true, "DOWNSPECIALGROUND"];
      } else {
        return [true, "NEUTRALSPECIALGROUND"];
      }
    } else {
      if (input[p][0].lsY > 0.54 || Math.abs(input[p][0].lsX) > 0.59 && input[p][0].lsY > Math.abs(input[p][0].lsX) - 0.2) {
        return [true, "UPSPECIAL"];
      } else if (input[p][0].lsY < -0.54 || Math.abs(input[p][0].lsX) > 0.59 && -input[p][0].lsY > Math.abs(input[p][0].lsX) - 0.2) {
        return [true, "DOWNSPECIALAIR"];
      } else if (Math.abs(input[p][0].lsX) > 0.59) {
        pl.phys.face = Math.sign(input[p][0].lsX);
        return [true, "SIDESPECIALAIR"];
      } else {
        if (input[p][0].lsX * pl.phys.face < -0.25) {
          pl.phys.face *= -1;
        } else if (pl.phys.bTurnaroundTimer > 0) {
          pl.phys.face = pl.phys.bTurnaroundDirection;
        }
        return [true, "NEUTRALSPECIALAIR"];
      }
    }
  } else {
    return [false, false];
  }
}
export function checkForAerials(p, input) {
  const pl = player[p];
  if (input[p][0].csX * pl.phys.face >= 0.3 && input[p][1].csX * pl.phys.face < 0.3 && Math.abs(input[p][0].csX) > Math.abs(input[p][0].csY) - 0.1) {
    return [true, "ATTACKAIRF"];
  } else if (input[p][0].csX * pl.phys.face <= -0.3 && input[p][1].csX * pl.phys.face > -0.3 && Math.abs(input[p][0].csX) > Math.abs(input[p][0].csY) - 0.1) {
    return [true, "ATTACKAIRB"];
  } else if (input[p][0].csY >= 0.3 && input[p][1].csY < 0.3) {
    return [true, "ATTACKAIRU"];
  } else if (input[p][0].csY < -0.3 && input[p][1].csY > -0.3) {
    return [true, "ATTACKAIRD"];
  } else if (input[p][0].a && !input[p][1].a || input[p][0].z && !input[p][1].z) {
    if (input[p][0].lsX * pl.phys.face > 0.3 && Math.abs(input[p][0].lsX) > Math.abs(input[p][0].lsY) - 0.1) {
      return [true, "ATTACKAIRF"];
    } else if (input[p][0].lsX * pl.phys.face < -0.3 && Math.abs(input[p][0].lsX) > Math.abs(input[p][0].lsY) - 0.1) {
      return [true, "ATTACKAIRB"];
    } else if (input[p][0].lsY > 0.3) {
      return [true, "ATTACKAIRU"];
    } else if (input[p][0].lsY < -0.3) {
      return [true, "ATTACKAIRD"];
    } else {
      return [true, "ATTACKAIRN"];
    }
  }
  return [false, 0];
}
export function checkForDash(p, input) {
  const pl = player[p];
  return input[p][0].lsX * pl.phys.face > 0.79 && input[p][2].lsX * pl.phys.face < 0.3;
}
export function checkForSmashTurn(p, input) {
  const pl = player[p];
  return input[p][0].lsX * pl.phys.face < -0.79 && input[p][2].lsX * pl.phys.face > -0.3;
}
export function tiltTurnDashBuffer(p, input) {
  return input[p][1].lsX * player[p].phys.face > -0.3;
}
export function checkForTiltTurn(p, input) {
  return input[p][0].lsX * player[p].phys.face < -0.3;
}
export function checkForJump(p, input) {
  if (input[p][0].x && !input[p][1].x || input[p][0].y && !input[p][1].y) {
    return [true, 0];
  } else if (gameSettings["tapJumpOffp" + (p + 1)] == false && (input[p][0].lsY > 0.66 && input[p][3].lsY < 0.2)) {
    return [true, 1];
  } else {
    return [false, false];
  }
}
export function checkForDoubleJump(p, input) {
  return input[p][0].x && !input[p][1].x || input[p][0].y && !input[p][1].y || gameSettings["tapJumpOffp" + (p + 1)] == false && (input[p][0].lsY > 0.69 && input[p][1].lsY <= 0.69);
}
export function checkForMultiJump(p, input) {
  return !!(input[p][0].x || input[p][0].y || gameSettings["tapJumpOffp" + (p + 1)] == false && input[p][0].lsY > 0.7);
}
export function checkForSquat(p, input) {
  return input[p][0].lsY < -0.69;
}
export function turboAirborneInterrupt(p, input) {
  const pl = player[p];
  const acts = actionStates[characterSelections[p]];
  var a = checkForAerials(p, input);
  var b = checkForSpecials(p, input);
  if (a[0] && a[1] != pl.actionState) {
    turnOffHitboxes(p);
    acts[a[1]].init(p, input);
    return true;
  } else if (input[p][0].l && !input[p][1].l || input[p][0].r && !input[p][1].r) {
    turnOffHitboxes(p);
    acts.ESCAPEAIR.init(p, input);
    return true;
  } else if ((input[p][0].x && !input[p][1].x || input[p][0].y && !input[p][1].y || input[p][0].lsY > 0.7 && input[p][1].lsY <= 0.7) && (!pl.phys.doubleJumped || pl.phys.jumpsUsed < 5 && pl.charAttributes.multiJump)) {
    turnOffHitboxes(p);
    if (input[p][0].lsX * pl.phys.face < -0.3) {
      acts.JUMPAERIALB.init(p, input);
    } else {
      acts.JUMPAERIALF.init(p, input);
    }
    return true;
  } else if (b[0] && b[1] != pl.actionState) {
    turnOffHitboxes(p);
    acts[b[1]].init(p, input);
    return true;
  } else {
    return false;
  }
}
export function turboGroundedInterrupt(p, input) {
  const pl = player[p];
  const acts = actionStates[characterSelections[p]];
  var b = checkForSpecials(p, input);
  var t = checkForTilts(p, input);
  var s = checkForSmashes(p, input);
  var j = checkForJump(p, input);
  if (j[0]) {
    turnOffHitboxes(p);
    acts.KNEEBEND.init(p, j[1], input);
    return true;
  } else if (input[p][0].l || input[p][0].r) {
    turnOffHitboxes(p);
    acts.GUARDON.init(p, input);
    return true;
  } else if (input[p][0].lA > 0 || input[p][0].rA > 0) {
    turnOffHitboxes(p);
    acts.GUARDON.init(p, input);
    return true;
  } else if (b[0] && b[1] != pl.actionState) {
    turnOffHitboxes(p);
    acts[b[1]].init(p, input);
    return true;
  } else if (s[0] && s[1] != pl.actionState) {
    turnOffHitboxes(p);
    acts[s[1]].init(p, input);
    return true;
  } else if (t[0] && t[1] != pl.actionState) {
    turnOffHitboxes(p);
    acts[t[1]].init(p, input);
    return true;
  } else if (checkForSquat(p, input)) {
    turnOffHitboxes(p);
    acts.SQUAT.init(p, input);
    return true;
  } else if (checkForDash(p, input)) {
    turnOffHitboxes(p);
    acts.DASH.init(p, input);
    return true;
  } else if (checkForSmashTurn(p, input)) {
    turnOffHitboxes(p);
    acts.SMASHTURN.init(p, input);
    return true;
  } else if (checkForTiltTurn(p, input)) {
    turnOffHitboxes(p);
    pl.phys.dashbuffer = tiltTurnDashBuffer(p, input);
    acts.TILTTURN.init(p, input);
    return true;
  } else if (Math.abs(input[p][0].lsX) > 0.3) {
    turnOffHitboxes(p);
    acts.WALK.init(p, true, input);
    return true;
  } else {
    return false;
  }
}
export const actionStates = [];
export function setupActionStates(index, val) {
  actionStates[index] = deepCopyObject(true, val);
}

