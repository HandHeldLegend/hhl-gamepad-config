/**
 * physics.js: the per-frame player update: hitlag, action state, movement, collision, ledges, blast zones.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { additionalOffset, coordinateIntercept, getSameAndOther, groundedECBSquashFactor, moveAlongGround, outwardsWallNormal, runCollisionRoutine, smallestECBWidth } from './collision.js';
import { getHorizontalDecay, getHorizontalVelocity, getLaunchAngle, getVerticalDecay, getVerticalVelocity, hitQueue } from './hit.js';
import { activeStage, characterSelections, ecb, edgeOffset, framesData, gameMode, gameSettings, lostStockQueue, player, playerType, versusMode } from './ml.js';
import { actionStates, turboAirborneInterrupt, turboGroundedInterrupt, turnOffHitboxes } from './shortcuts.js';
import { Box2D, Vec2D, deepObjectMerge, extremePoint, getSurfaceFromStage, moveECB, squashECBAt, subtract, toList } from './util.js';

// ---- physics/physics.js ----
function updatePosition(i, newPosition) {
  player[i].phys.pos = newPosition;
}
;
function dealWithDamagingStageCollision(i, normal, corner, angular, damageType) {
  const collisionData = {
    normal: normal,
    angular: angular,
    corner: corner
  };
  let damageTypeIndex = -1;
  switch (damageType) {
    case "fire":
      damageTypeIndex = 3;
      break;
    case "electric":
      damageTypeIndex = 4;
      break;
    case "slash":
      damageTypeIndex = 1;
      break;
    case "darkness":
      damageTypeIndex = 5;
      break;
    default:
      break;
  }
  if (damageTypeIndex !== -1) {
    hitQueue.push([i, collisionData, damageTypeIndex, false, false, true]);
  }
}
function dealWithWallCollision(i, newPosition, pt, wallType, wallIndex, input) {
  updatePosition(i, newPosition);
  let wallLabel = "L";
  let sign = -1;
  let isRight = 0;
  if (wallType[0].toLowerCase() === "r") {
    wallLabel = "R";
    sign = 1;
    isRight = 1;
  }
  const wall = getSurfaceFromStage([wallType, wallIndex], activeStage);
  const wallBottom = extremePoint(wall, "b");
  const wallTop = extremePoint(wall, "t");
  const wallNormal = outwardsWallNormal(wallBottom, wallTop, wallType);
  const damageType = wall[2] === undefined ? null : wall[2].damageType;
  const inDamageState = player[i].actionState === "DAMAGEFLYN" || player[i].actionState === "WALLDAMAGE" || player[i].actionState === "DAMAGEFALL";
  if (inDamageState && player[i].phys.techTimer > 0) {
    player[i].phys.face = sign;
    if (input[i][0].x || input[i][0].y || input[i][0].lsY > 0.7) {
      actionStates[characterSelections[i]].WALLTECHJUMP.init(i, input);
    } else {
      actionStates[characterSelections[i]].WALLTECH.init(i, input);
    }
  } else if (inDamageState && Math.sign(player[i].phys.kVel) !== sign && player[i].hit.hitlag === 0 && Math.pow(player[i].phys.kVel.x, 2) + Math.pow(player[i].phys.kVel.y, 2) >= 2.25) {
    player[i].phys.face = sign;
    actionStates[characterSelections[i]].WALLDAMAGE.init(i, input, wallNormal);
  } else if (player[i].hit.hitlag === 0) {
    if (damageType !== undefined && damageType !== null && player[i].phys.hurtBoxState === 0) {
      dealWithDamagingStageCollision(i, wallNormal, false, pt, damageType);
    } else if (actionStates[characterSelections[i]][player[i].actionState].specialWallCollide) {
      actionStates[characterSelections[i]][player[i].actionState].onWallCollide(i, input, wallLabel, wallIndex);
    } else if (player[i].phys.canWallJump) {
      if (player[i].phys.wallJumpTimer === 254) {
        if (player[i].phys.posDelta.x >= 0.5) {
          player[i].phys.wallJumpTimer = 0;
        }
      }
    }
    if (player[i].phys.wallJumpTimer >= 0 && player[i].phys.wallJumpTimer < 120) {
      if (sign * input[i][0].lsX >= 0.7 && sign * input[i][3].lsX <= 0 && player[i].charAttributes.walljump) {
        player[i].phys.wallJumpTimer = 254;
        player[i].phys.face = sign;
        actionStates[characterSelections[i]].WALLJUMP.init(i, input);
      } else {
        player[i].phys.wallJumpTimer++;
      }
    }
  }
}
;
function dealWithPlatformCollision(i, alreadyGrounded, newPosition, ecbpBottom, platformIndex, input) {
  const platform = getSurfaceFromStage(["p", platformIndex], activeStage);
  const damageType = platform[2] === undefined ? null : platform[2].damageType;
  const platLeft = extremePoint(platform, "l");
  const platRight = extremePoint(platform, "r");
  const platNormal = outwardsWallNormal(platLeft, platRight, "g");
  if (player[i].hit.hitlag > 0 || alreadyGrounded || player[i].phys.grabbedBy !== -1) {
    updatePosition(i, newPosition);
  } else {
    land(i, ecbpBottom, 1, platformIndex, platNormal, input);
  }
}
;
function dealWithGroundCollision(i, alreadyGrounded, newPosition, ecbpBottom, groundIndex, input) {
  const ground = getSurfaceFromStage(["g", groundIndex], activeStage);
  const damageType = ground[2] === undefined ? null : ground[2].damageType;
  const ignoreDamage = player[i].actionState === "DAMAGEFLYN" || player[i].actionState === "DAMAGEFALL" || player[i].actionState === "WALLDAMAGE";
  const groundLeft = extremePoint(ground, "l");
  const groundRight = extremePoint(ground, "r");
  const groundNormal = outwardsWallNormal(groundLeft, groundRight, "g");
  if (!ignoreDamage && damageType !== undefined && damageType !== null && player[i].phys.hurtBoxState === 0) {
    dealWithDamagingStageCollision(i, groundNormal, false, 0, damageType);
  } else {
    if (player[i].hit.hitlag > 0 || alreadyGrounded || player[i].phys.grabbedBy !== -1) {
      updatePosition(i, newPosition);
    } else {
      land(i, ecbpBottom, 0, groundIndex, groundNormal, input);
    }
  }
}
;
function fallOffGround(i, side, groundEdgePosition, disableFall, input) {
  let [stillGrounded, backward] = [true, false];
  let sign = 1;
  if (side === "r") {
    sign = -1;
  }
  if (disableFall) {
    player[i].phys.pos.y = Math.max(player[i].phys.pos.y, groundEdgePosition.y) + additionalOffset;
    player[i].phys.pos.x = groundEdgePosition.x + (side === "l" ? additionalOffset : -additionalOffset);
    player[i].phys.ECBp = moveECB(player[i].phys.ECBp, subtract(player[i].phys.pos, player[i].phys.ECBp[0]));
  } else if (actionStates[characterSelections[i]][player[i].actionState].canEdgeCancel) {
    if (player[i].phys.face === sign) {
      stillGrounded = false;
      player[i].phys.pos.y = Math.max(player[i].phys.pos.y, groundEdgePosition.y) + additionalOffset;
      backward = true;
    } else if (Math.abs(input[i][0].lsX) > 0.6 || player[i].phys.cVel.x === 0 && player[i].phys.kVel.x === 0 || actionStates[characterSelections[i]][player[i].actionState].disableTeeter || player[i].phys.shielding) {
      stillGrounded = false;
      player[i].phys.pos.y = Math.max(player[i].phys.pos.y, groundEdgePosition.y) + additionalOffset;
    } else {
      player[i].phys.cVel.x = 0;
      player[i].phys.pos.x = groundEdgePosition.x + sign * additionalOffset;
      actionStates[characterSelections[i]].OTTOTTO.init(i, input);
    }
  } else if (player[i].phys.cVel.x === 0 && player[i].phys.kVel.x === 0 && !actionStates[characterSelections[i]][player[i].actionState].inGrab) {
    stillGrounded = false;
    player[i].phys.pos.y = Math.max(player[i].phys.pos.y, groundEdgePosition.y) + additionalOffset;
  } else {
    player[i].phys.cVel.x = 0;
    player[i].phys.pos.x = groundEdgePosition.x + sign * additionalOffset;
  }
  return [stillGrounded, backward];
}
;
function dealWithGround(i, ground, groundTypeAndIndex, connected, input) {
  const damageType = ground[2] === undefined ? null : ground[2].damageType;
  const ignoreDamage = player[i].actionState === "DAMAGEFLYN" || player[i].actionState === "DAMAGEFALL" || player[i].actionState === "WALLDAMAGE";
  const leftmostGroundPoint = extremePoint(ground, "l");
  const rightmostGroundPoint = extremePoint(ground, "r");
  const groundNormal = outwardsWallNormal(leftmostGroundPoint, rightmostGroundPoint, "g");
  let [stillGrounded, backward] = [true, false];
  let groundOrPlatform = 0;
  if (groundTypeAndIndex[0] === "p") {
    groundOrPlatform = 1;
  }
  let disableFall = false;
  let maybeLeftGroundTypeAndIndex = null;
  let maybeRightGroundTypeAndIndex = null;
  const ecb0Height = Math.max(additionalOffset, player[i].phys.ECB1[2].y - player[i].phys.ECB1[0].y - additionalOffset);
  const maybeNextPosX = moveAlongGround(player[i].phys.ECB1[0], player[i].phys.ECBp[0], ecb0Height, ground, activeStage.ceiling);
  if (maybeNextPosX !== null) {
    player[i].phys.pos.x = maybeNextPosX;
    player[i].phys.ECBp = moveECB(player[i].phys.ECBp, new Vec2D(maybeNextPosX - player[i].phys.ECBp[0].x, 0));
  }
  if (player[i].phys.ECBp[0].x < leftmostGroundPoint.x) {
    if (connected !== null && connected !== undefined) {
      maybeLeftGroundTypeAndIndex = groundTypeAndIndex[0] === "g" ? connected[0][groundTypeAndIndex[1]][0] : connected[1][groundTypeAndIndex[1]][0];
    }
    if (maybeLeftGroundTypeAndIndex === null || maybeLeftGroundTypeAndIndex === undefined) {
      [stillGrounded, backward] = fallOffGround(i, "l", leftmostGroundPoint, disableFall, input);
    } else {
      const [leftGroundType, leftGroundIndex] = maybeLeftGroundTypeAndIndex;
      switch (leftGroundType) {
        case "g":
          [stillGrounded, backward] = dealWithGround(i, activeStage.ground[leftGroundIndex], ["g", leftGroundIndex], connected, input);
          break;
        case "p":
          [stillGrounded, backward] = dealWithGround(i, activeStage.platform[leftGroundIndex], ["p", leftGroundIndex], connected, input);
          break;
        case "r":
          const rightWallToTheLeft = activeStage.wallR[leftGroundIndex];
          if (extremePoint(rightWallToTheLeft, "l").y > leftmostGroundPoint.y) {
            disableFall = true;
          }
          [stillGrounded, backward] = fallOffGround(i, "l", leftmostGroundPoint, disableFall, input);
          break;
        default:
          [stillGrounded, backward] = fallOffGround(i, "l", leftmostGroundPoint, disableFall, input);
          break;
      }
    }
  } else if (player[i].phys.ECBp[0].x > rightmostGroundPoint.x) {
    if (connected !== null && connected !== undefined) {
      maybeRightGroundTypeAndIndex = groundTypeAndIndex[0] === "g" ? connected[0][groundTypeAndIndex[1]][1] : connected[1][groundTypeAndIndex[1]][1];
    }
    if (maybeRightGroundTypeAndIndex === null || maybeRightGroundTypeAndIndex === undefined) {
      [stillGrounded, backward] = fallOffGround(i, "r", rightmostGroundPoint, disableFall, input);
    } else {
      const [rightGroundType, rightGroundIndex] = maybeRightGroundTypeAndIndex;
      switch (rightGroundType) {
        case "g":
          [stillGrounded, backward] = dealWithGround(i, activeStage.ground[rightGroundIndex], ["g", rightGroundIndex], connected, input);
          break;
        case "p":
          [stillGrounded, backward] = dealWithGround(i, activeStage.platform[rightGroundIndex], ["p", rightGroundIndex], connected, input);
          break;
        case "l":
          const leftWallToTheRight = activeStage.wallL[rightGroundIndex];
          if (extremePoint(leftWallToTheRight, "r").y > rightmostGroundPoint.y) {
            disableFall = true;
          }
          [stillGrounded, backward] = fallOffGround(i, "r", rightmostGroundPoint, disableFall, input);
          break;
        default:
          [stillGrounded, backward] = fallOffGround(i, "r", rightmostGroundPoint, disableFall, input);
          break;
      }
    }
  } else {
    const ecbpBottom = player[i].phys.ECBp[0];
    const yIntercept = coordinateIntercept([ecbpBottom, new Vec2D(ecbpBottom.x, ecbpBottom.y + 1)], ground);
    player[i].phys.pos.y = player[i].phys.pos.y + yIntercept.y - ecbpBottom.y + additionalOffset;
    player[i].phys.ECBp = moveECB(player[i].phys.ECBp, new Vec2D(0, yIntercept.y - ecbpBottom.y + additionalOffset));
    player[i].phys.onSurface = [groundOrPlatform, groundTypeAndIndex[1]];
    player[i].phys.groundAngle = Math.atan2(groundNormal.y, groundNormal.x) || Math.PI / 2;
  }
  if (!ignoreDamage && damageType !== undefined && damageType !== null && player[i].phys.hurtBoxState === 0) {
    dealWithDamagingStageCollision(i, groundNormal, false, 0, damageType);
    stillGrounded = false;
  }
  return [stillGrounded, backward];
}
;
function dealWithCeilingCollision(i, newPosition, ecbTop, ceilingIndex, input) {
  updatePosition(i, newPosition);
  const ceiling = getSurfaceFromStage(["c", ceilingIndex], activeStage);
  const damageType = ceiling[2] === undefined ? null : ceiling[2].damageType;
  const ceilingLeft = extremePoint(ceiling, "l");
  const ceilingRight = extremePoint(ceiling, "r");
  const ceilingNormal = outwardsWallNormal(ceilingLeft, ceilingRight, "c");
  const ignoreDamage = player[i].actionState === "DAMAGEFLYN" || player[i].actionState === "DAMAGEFALL" || player[i].actionState === "WALLDAMAGE";
  if (!ignoreDamage && damageType !== undefined && damageType !== null && player[i].phys.hurtBoxState === 0) {
    dealWithDamagingStageCollision(i, ceilingNormal, false, 2, damageType);
  } else if (actionStates[characterSelections[i]][player[i].actionState].headBonk && player[i].phys.cVel.y + player[i].phys.kVel.y > 0) {
    if (player[i].hit.hitstun > 0) {
      if (player[i].phys.techTimer > 0) {
        actionStates[characterSelections[i]].TECHU.init(i, input);
      } else {
        actionStates[characterSelections[i]].STOPCEIL.init(i, input, ceilingNormal);
      }
    } else {
      actionStates[characterSelections[i]].STOPCEIL.init(i, input);
    }
  }
}
;
function dealWithCornerCollision(i, newPosition, ecb, angularParameter, damageType) {
  updatePosition(i, newPosition);
  const insideECBType = angularParameter < 2 ? "l" : "r";
  const [same, other] = getSameAndOther(angularParameter);
  const lowerECBPoint = other === 2 ? ecb[same] : ecb[0];
  const upperECBPoint = other === 2 ? ecb[2] : ecb[same];
  const normal = outwardsWallNormal(lowerECBPoint, upperECBPoint, insideECBType);
  if (player[i].hit.hitlag === 0 && damageType !== undefined && damageType !== null && player[i].phys.hurtBoxState === 0) {
    dealWithDamagingStageCollision(i, normal, true, angularParameter, damageType);
  }
}
;
export function land(i, newPosition, t, j, normal, input) {
  player[i].phys.pos = newPosition;
  player[i].phys.grounded = true;
  player[i].phys.doubleJumped = false;
  player[i].phys.jumpsUsed = 0;
  player[i].phys.airborneTimer = 0;
  player[i].phys.fastfalled = false;
  player[i].phys.chargeFrames = 0;
  player[i].phys.charging = false;
  player[i].phys.wallJumpCount = 0;
  player[i].phys.thrownHitbox = false;
  player[i].phys.sideBJumpFlag = true;
  player[i].phys.onSurface = [t, j];
  player[i].phys.onLedge = -1;
  player[i].rotation = 0;
  player[i].rotationPoint = new Vec2D(0, 0);
  player[i].colourOverlayBool = false;
  player[i].hitboxes.active = [false, false, false, false];
  let newNormal = normal;
  if (newNormal === null || newNormal === undefined || newNormal.x === 0 && newNormal.y === 0) {
    newNormal = new Vec2D(0, 1);
  }
  player[i].phys.groundAngle = Math.atan2(newNormal.y, newNormal.x);
  switch (actionStates[characterSelections[i]][player[i].actionState].landType) {
    case 0:
      if (player[i].phys.cVel.y >= -1) {
        actionStates[characterSelections[i]].WAIT.init(i, input);
      } else {
        actionStates[characterSelections[i]].LANDING.init(i, input);
      }
      break;
    case 1:
      actionStates[characterSelections[i]][player[i].actionState].land(i, input);
      break;
    case 2:
      if (player[i].phys.techTimer > 0) {
        if (input[i][0].lsX * player[i].phys.face > 0.5) {
          actionStates[characterSelections[i]].TECHF.init(i, input);
        } else if (input[i][0].lsX * player[i].phys.face < -0.5) {
          actionStates[characterSelections[i]].TECHB.init(i, input);
        } else {
          actionStates[characterSelections[i]].TECHN.init(i, input);
        }
      } else {
        actionStates[characterSelections[i]].DOWNBOUND.init(i, input);
      }
      break;
    default:
      actionStates[characterSelections[i]].LANDING.init(i, input);
      break;
  }
  player[i].phys.cVel.y = 0;
  player[i].phys.kVel.y = 0;
  player[i].hit.hitstun = 0;
}
;
function hitlagSwitchUpdate(i, input) {
  if (player[i].hit.hitlag > 0) {
    player[i].hit.hitlag--;
    if (player[i].hit.hitlag === 0 && player[i].hit.knockback > 0) {
      if (player[i].phys.grabbedBy === -1 || player[i].hit.knockback > 50) {
        const newAngle = getLaunchAngle(player[i].hit.angle, player[i].hit.knockback, player[i].hit.reverse, input[i][0].lsX, input[i][0].lsY, i);
        player[i].phys.cVel.x = 0;
        player[i].phys.cVel.y = 0;
        player[i].phys.kVel.x = getHorizontalVelocity(player[i].hit.knockback, newAngle);
        player[i].phys.kVel.y = getVerticalVelocity(player[i].hit.knockback, newAngle, player[i].phys.grounded, player[i].hit.angle);
        player[i].phys.kDec.x = getHorizontalDecay(newAngle);
        player[i].phys.kDec.y = getVerticalDecay(newAngle);
        player[i].phys.onLedge = -1;
        player[i].phys.charging = false;
        player[i].phys.chargeFrames = 0;
        player[i].phys.shielding = false;
        if (player[i].phys.kVel.y === 0) {
          if (player[i].hit.knockback >= 80) {
            player[i].phys.grounded = false;
            player[i].phys.pos.y += 0.0001;
          }
        }
        if (player[i].phys.kVel.y > 0) {
          player[i].phys.grounded = false;
        }
      }
      player[i].hit.knockback = 0;
    }
    switch (player[i].actionState) {
      case "DAMAGEN2":
      case "DAMAGEFLYN":
      case "GUARDON":
      case "GUARD":
      case "DOWNDAMAGE":
        if (player[i].hit.hitlag > 0) {
          if (input[i][0].lsX > 0.7 && input[i][1].lsX < 0.7 || input[i][0].lsX < -0.7 && input[i][1].lsX > -0.7 || input[i][0].lsY > 0.7 && input[i][1].lsY < 0.7 || input[i][0].lsY < -0.7 && input[i][1].lsY > -0.7) {
            if (!(input[i][0].lsX * input[i][0].lsX + input[i][0].lsY * input[i][0].lsY < 0.49)) {
              player[i].phys.pos.x += input[i][0].lsX * 6;
              player[i].phys.pos.y += player[i].phys.grounded ? 0 : input[i][0].lsY * 6;
            }
          }
        } else {
          player[i].phys.pos.x += input[i][0].lsX * 3;
          player[i].phys.pos.y += player[i].phys.grounded ? 0 : input[i][0].lsY * 3;
        }
        break;
      default:
        break;
    }
    if (player[i].hit.hitlag === 0) {
      hitlagSwitchUpdate(i, input);
    }
  } else {
    if (player[i].hit.shieldstun > 0) {
      player[i].hit.shieldstun--;
      if (player[i].hit.shieldstun < 0) {
        player[i].hit.shieldstun = 0;
      }
    }
    player[i].phys.canWallJump = actionStates[characterSelections[i]][player[i].actionState].wallJumpAble;
    player[i].phys.bTurnaroundTimer--;
    if (player[i].phys.bTurnaroundTimer < 0) {
      player[i].phys.bTurnaroundTimer = 0;
    }
    if (input[i][0].lsX > 0.9 && input[i][1].lsX < 0.9 || input[i][0].lsX < -0.9 && input[i][1].lsX > -0.9) {
      player[i].phys.bTurnaroundTimer = 20;
      player[i].phys.bTurnaroundDirection = Math.sign(input[i][0].lsX);
    }
    player[i].prevActionState = player[i].actionState;
    actionStates[characterSelections[i]][player[i].actionState].main(i, input);
    if (player[i].shocked > 0) {
      player[i].shocked--;
      if (player[i].shocked % 5 === 0) {}
    }
    if (player[i].burning > 0) {
      player[i].burning--;
      if (player[i].burning % 6 === 0) {}
    }
    if (player[i].prevActionState !== player[i].actionState) {
      player[i].hasHit = false;
    }
    if (gameSettings.turbo && gameMode !== 5) {
      if (player[i].hasHit) {
        if (player[i].actionState !== "CATCHATTACK") {
          if (player[i].phys.grounded) {
            if (turboGroundedInterrupt(i, input)) {
              player[i].hasHit = false;
            }
          } else {
            if (turboAirborneInterrupt(i, input)) {
              player[i].hasHit = false;
            }
          }
        }
      }
    }
    if (Math.abs(player[i].phys.kVel.x) > 0) {
      const oSign = Math.sign(player[i].phys.kVel.x);
      if (player[i].phys.grounded) {
        player[i].phys.kVel.x -= oSign * player[i].charAttributes.traction;
      } else {
        player[i].phys.kVel.x -= player[i].phys.kDec.x;
      }
      if (oSign !== Math.sign(player[i].phys.kVel.x)) {
        player[i].phys.kVel.x = 0;
      }
    }
    if (Math.abs(player[i].phys.kVel.y) > 0) {
      const oSign = Math.sign(player[i].phys.kVel.y);
      if (player[i].phys.grounded) {
        player[i].phys.kVel.y = 0;
      }
      player[i].phys.kVel.y -= player[i].phys.kDec.y;
      if (oSign !== Math.sign(player[i].phys.kVel.y)) {
        player[i].phys.kVel.y = 0;
      }
    }
    player[i].phys.pos.x += player[i].phys.cVel.x + player[i].phys.kVel.x;
    player[i].phys.pos.y += player[i].phys.cVel.y + player[i].phys.kVel.y;
  }
}
;
function hurtBoxStateUpdate(i) {
  if (player[i].actionState === "REBIRTH" || player[i].actionState === "REBIRTHWAIT") {
    player[i].phys.hurtBoxState = 1;
  } else {
    player[i].phys.hurtBoxState = 0;
  }
  if (player[i].phys.invincibleTimer > 0) {
    player[i].phys.invincibleTimer--;
    player[i].phys.hurtBoxState = 2;
  }
  if (player[i].phys.intangibleTimer > 0) {
    player[i].phys.intangibleTimer--;
    player[i].phys.hurtBoxState = 1;
  }
}
;
function outOfCameraUpdate(i) {
  if (player[i].phys.outOfCameraTimer >= 60) {
    if (player[i].percent < 150) {
      player[i].percent++;
    }
    player[i].phys.outOfCameraTimer = 0;
  }
}
;
function lCancelUpdate(i, input) {
  if (gameSettings.lCancelType === 2 && gameMode !== 5) {
    if (player[i].phys.lCancel) {
      if (player[i].actionState.substr(0, 16) === "LANDINGATTACKAIR") {
        player[i].actionState = "LANDING";
        player[i].timer = 1;
      }
    }
  }
  if (player[i].phys.lCancelTimer > 0) {
    player[i].phys.lCancelTimer--;
    if (player[i].phys.lCancelTimer === 0) {
      player[i].phys.lCancel = false;
    }
  }
  if (player[i].phys.lCancelTimer === 0 && (input[i][0].lA > 0 && input[i][1].lA === 0 || input[i][0].rA > 0 && input[i][1].rA === 0 || input[i][0].z && !input[i][1].z)) {
    if (gameSettings.lCancelType === 2 && gameMode !== 5) {
      player[i].phys.lCancelTimer = 11;
    } else {
      player[i].phys.lCancelTimer = 7;
    }
    player[i].phys.lCancel = true;
  }
  if (gameSettings.lCancelType === 1 && gameMode !== 5) {
    player[i].phys.lCancel = true;
  }
  if (player[i].phys.vCancelTimer > 0) {
    player[i].phys.vCancelTimer--;
  }
  if (player[i].phys.techTimer > 0) {
    player[i].phys.techTimer--;
  }
  if (player[i].phys.shoulderLockout > 0) {
    player[i].phys.shoulderLockout--;
  }
  if (input[i][0].l && !input[i][1].l || input[i][0].r && !input[i][1].r) {
    if (!player[i].phys.grounded) {
      if (player[i].phys.shoulderLockout === 0) {
        player[i].phys.vCancelTimer = 3;
        player[i].phys.techTimer = 20;
      }
    }
    player[i].phys.shoulderLockout = 40;
  }
}
;
const nullSquashDatum = {
  location: null,
  factor: 1
};
let ecbSquashData = [nullSquashDatum, nullSquashDatum, nullSquashDatum, nullSquashDatum];
// HOJA: per-world squash data (see world.js)
export function useEcbSquashData(a) {
  ecbSquashData = a;
}
function findAndResolveCollisions(i, input, oldBackward, oldNotTouchingWalls, ecbOffset) {
  let stillGrounded = true;
  let backward = oldBackward;
  const notTouchingWalls = oldNotTouchingWalls;
  const connected = activeStage.connected;
  if (player[i].phys.grounded) {
    const oldPosition = new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y);
    const relevantGroundIndex = player[i].phys.onSurface[1];
    let relevantGroundType = "g";
    let relevantGround = activeStage.ground[relevantGroundIndex];
    if (player[i].phys.onSurface[0] === 1) {
      relevantGroundType = "p";
      relevantGround = activeStage.platform[relevantGroundIndex];
    }
    const relevantGroundTypeAndIndex = [relevantGroundType, relevantGroundIndex];
    [stillGrounded, backward] = dealWithGround(i, relevantGround, relevantGroundTypeAndIndex, connected, input);
  }
  const notIgnoringPlatforms = (!actionStates[characterSelections[i]][player[i].actionState].canPassThrough || input[i][0].lsY > -0.56) && !player[i].phys.passing;
  const isImmune = player[i].phys.hurtBoxState !== 0;
  const playerStatusInfo = {
    ignoringPlatforms: !notIgnoringPlatforms,
    grounded: player[i].phys.grounded,
    immune: isImmune
  };
  const collisionData = runCollisionRoutine(player[i].phys.ECB1, player[i].phys.ECBp, player[i].phys.pos, ecbSquashData[i], playerStatusInfo, activeStage);
  ecbSquashData[i] = collisionData.squashDatum;
  const newPosition = collisionData.position;
  const newECB = collisionData.ecb;
  const touchingDatum = collisionData.touching;
  if (touchingDatum === null) {
    updatePosition(i, newPosition);
  } else if (touchingDatum.kind === "surface") {
    const surfaceLabel = touchingDatum.type;
    const surfaceIndex = touchingDatum.index;
    const pt = touchingDatum.pt;
    switch (surfaceLabel[0].toLowerCase()) {
      case "l":
        notTouchingWalls[0] = false;
        dealWithWallCollision(i, newPosition, pt, "l", surfaceIndex, input);
        break;
      case "r":
        notTouchingWalls[1] = false;
        dealWithWallCollision(i, newPosition, pt, "r", surfaceIndex, input);
        break;
      case "g":
        dealWithGroundCollision(i, player[i].phys.grounded, newPosition, newECB[0], surfaceIndex, input);
        break;
      case "c":
        dealWithCeilingCollision(i, newPosition, newECB[2], surfaceIndex, input);
        break;
      case "p":
        dealWithPlatformCollision(i, player[i].phys.grounded, newPosition, newECB[0], surfaceIndex, input);
        break;
      default:
        console.log("error in 'findAndResolveCollisions': unrecognised surface type.");
        break;
    }
  } else if (touchingDatum.kind === "corner") {
    const angularParameter = touchingDatum.angular;
    const cornerDamageType = touchingDatum.damageType !== undefined ? touchingDatum.damageType : null;
    dealWithCornerCollision(i, newPosition, newECB, angularParameter, cornerDamageType);
  }
  player[i].phys.ECB1 = newECB;
  if (player[i].phys.grounded) {
    const groundSquashFactor = groundedECBSquashFactor(new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y + ecbOffset[3]), new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y), toList(activeStage.ceiling));
    if (groundSquashFactor !== null && groundSquashFactor < ecbSquashData[i].factor) {
      ecbSquashData[i] = {
        location: 0,
        factor: groundSquashFactor
      };
    }
    if (ecbSquashData[i] !== null) {
      ecbSquashData[i].location = 0;
    }
  }
  return [stillGrounded, backward, notTouchingWalls];
}
;
function dealWithLedges(i, input) {
  const playerPosX = player[i].phys.pos.x;
  const playerPosY = player[i].phys.pos.y;
  const ledgeSnapBoxOffset2 = player[i].charAttributes.ledgeSnapBoxOffset[2];
  const ledgeSnapBoxOffset0 = player[i].charAttributes.ledgeSnapBoxOffset[0];
  const ledgeSnapBoxOffset1 = player[i].charAttributes.ledgeSnapBoxOffset[1];
  player[i].phys.ledgeSnapBoxF = new Box2D([playerPosX, playerPosY + ledgeSnapBoxOffset2], [playerPosX + ledgeSnapBoxOffset0, playerPosY + ledgeSnapBoxOffset1]);
  player[i].phys.ledgeSnapBoxB = new Box2D([playerPosX - ledgeSnapBoxOffset0, playerPosY + ledgeSnapBoxOffset2], [playerPosX, playerPosY + ledgeSnapBoxOffset1]);
  if (player[i].phys.ledgeRegrabCount) {
    player[i].phys.ledgeRegrabTimeout--;
    if (player[i].phys.ledgeRegrabTimeout === 0) {
      player[i].phys.ledgeRegrabCount = false;
    }
  }
  let lsBF = -1;
  let lsBB = -1;
  let foundLedge = 0;
  if (player[i].phys.onLedge === -1 && !player[i].phys.ledgeRegrabCount) {
    for (let j = 0; j < activeStage.ledge.length; j++) {
      let ledgeAvailable = true;
      for (let k = 0; k < 4; k++) {
        if (playerType[k] > -1) {
          if (k !== i) {
            if (player[k].phys.onLedge === j) {
              ledgeAvailable = false;
            }
          }
        }
      }
      if (ledgeAvailable && !player[i].phys.grounded && player[i].hit.hitstun <= 0) {
        const x = activeStage[activeStage.ledge[j][0]][activeStage.ledge[j][1]][activeStage.ledge[j][2]].x;
        const y = activeStage[activeStage.ledge[j][0]][activeStage.ledge[j][1]][activeStage.ledge[j][2]].y;
        if (x > player[i].phys.ledgeSnapBoxF.min.x && x < player[i].phys.ledgeSnapBoxF.max.x && y < player[i].phys.ledgeSnapBoxF.min.y && y > player[i].phys.ledgeSnapBoxF.max.y) {
          if (activeStage.ledge[j][2] === 0) {
            if (actionStates[characterSelections[i]][player[i].actionState].canGrabLedge[0]) {
              lsBF = j;
            }
          } else if (actionStates[characterSelections[i]][player[i].actionState].canGrabLedge[1]) {
            lsBF = j;
          }
        }
        if (x > player[i].phys.ledgeSnapBoxB.min.x && x < player[i].phys.ledgeSnapBoxB.max.x && y < player[i].phys.ledgeSnapBoxB.min.y && y > player[i].phys.ledgeSnapBoxF.max.y) {
          if (activeStage.ledge[j][2] === 1) {
            if (actionStates[characterSelections[i]][player[i].actionState].canGrabLedge[0]) {
              lsBB = j;
            }
          } else if (actionStates[characterSelections[i]][player[i].actionState].canGrabLedge[1]) {
            lsBB = j;
          }
        }
      }
      if (player[i].phys.cVel.y < 0 && input[i][0].lsY > -0.5) {
        if (lsBF > -1) {
          foundLedge = activeStage.ledge[lsBF];
          if (foundLedge[2] * -2 + 1 === player[i].phys.face || actionStates[characterSelections[i]][player[i].actionState].canGrabLedge[1]) {
            player[i].phys.onLedge = lsBF;
            player[i].phys.ledgeRegrabTimeout = 30;
            player[i].phys.face = foundLedge[2] * -2 + 1;
            player[i].phys.pos = new Vec2D(activeStage[foundLedge[0]][foundLedge[1]][foundLedge[2]].x + edgeOffset[0][0], activeStage[foundLedge[0]][foundLedge[1]][foundLedge[2]].y + edgeOffset[0][1]);
            actionStates[characterSelections[i]].CLIFFCATCH.init(i, input);
          }
        } else if (lsBB > -1) {
          foundLedge = activeStage.ledge[lsBB];
          if (foundLedge[2] * -2 + 1 === player[i].phys.face || actionStates[characterSelections[i]][player[i].actionState].canGrabLedge[1]) {
            player[i].phys.onLedge = lsBB;
            player[i].phys.ledgeRegrabTimeout = 30;
            player[i].phys.face = foundLedge[2] * -2 + 1;
            player[i].phys.pos = new Vec2D(activeStage[foundLedge[0]][foundLedge[1]][foundLedge[2]].x + edgeOffset[1][0], activeStage[foundLedge[0]][foundLedge[1]][foundLedge[2]].y + edgeOffset[1][1]);
            actionStates[characterSelections[i]].CLIFFCATCH.init(i, input);
          }
        }
      }
    }
  }
}
;
function dealWithDeath(i, input) {
  if (!actionStates[characterSelections[i]][player[i].actionState].dead && player[i].actionState !== "SLEEP") {
    let state = 0;
    if (player[i].phys.pos.x < activeStage.blastzone.min.x) {
      state = "DEADLEFT";
    } else if (player[i].phys.pos.x > activeStage.blastzone.max.x) {
      state = "DEADRIGHT";
    } else if (player[i].phys.pos.y < activeStage.blastzone.min.y) {
      state = "DEADDOWN";
    } else if (player[i].phys.pos.y > activeStage.blastzone.max.y && player[i].phys.kVel.y >= 2.4) {
      state = "DEADUP";
    }
    if (state !== 0) {
      player[i].phys.outOfCameraTimer = 0;
      turnOffHitboxes(i);
      player[i].stocks--;
      player[i].colourOverlayBool = false;
      lostStockQueue.push([i, player[i].stocks, 0]);
      if (player[i].stocks === 0 && versusMode) {
        player[i].stocks = 1;
      }
      actionStates[characterSelections[i]][state].init(i, input);
    }
  }
}
;
function updateHitboxes(i) {
  player[i].phys.isInterpolated = false;
  for (let j = 0; j < 4; j++) {
    if (player[i].hitboxes.active[j] && player[i].phys.prevFrameHitboxes.active[j]) {
      if (player[i].phys.prevFrameHitboxes.id[j].offset[player[i].phys.prevFrameHitboxes.frame] === undefined) {
        continue;
      }
      if (player[i].hitboxes.id[j].offset[player[i].hitboxes.frame] === undefined) {
        continue;
      }
      const h1 = new Vec2D(player[i].phys.posPrev.x + player[i].phys.prevFrameHitboxes.id[j].offset[player[i].phys.prevFrameHitboxes.frame].x * player[i].phys.facePrev, player[i].phys.posPrev.y + player[i].phys.prevFrameHitboxes.id[j].offset[player[i].phys.prevFrameHitboxes.frame].y);
      const h2 = new Vec2D(player[i].phys.pos.x + player[i].hitboxes.id[j].offset[player[i].hitboxes.frame].x * player[i].phys.face, player[i].phys.pos.y + player[i].hitboxes.id[j].offset[player[i].hitboxes.frame].y);
      const a = h2.x - h1.x;
      const b = h2.y - h1.y;
      let x = 0;
      if (!(a === 0 || b === 0)) {
        x = Math.atan(Math.abs(a) / Math.abs(b));
      }
      {
        const opp = Math.sin(x) * player[i].hitboxes.id[j].size;
        const adj = Math.cos(x) * player[i].hitboxes.id[j].size;
        const sigma = [h1.x, h1.y];
        let alpha1;
        let alpha2;
        let beta1;
        let beta2;
        if (a > 0 && b > 0 || a <= 0 && b <= 0) {
          alpha1 = new Vec2D(sigma[0] + adj, sigma[1] - opp);
          alpha2 = new Vec2D(alpha1.x + a, alpha1.y + b);
          beta1 = new Vec2D(sigma[0] - adj, sigma[1] + opp);
          beta2 = new Vec2D(beta1.x + a, beta1.y + b);
        } else {
          alpha1 = new Vec2D(sigma[0] - adj, sigma[1] - opp);
          alpha2 = new Vec2D(alpha1.x + a, alpha1.y + b);
          beta1 = new Vec2D(sigma[0] + adj, sigma[1] + opp);
          beta2 = new Vec2D(beta1.x + a, beta1.y + b);
        }
        player[i].phys.interPolatedHitbox[j] = [alpha1, alpha2, beta2, beta1];
      }
      {
        const opp = Math.sin(x) * player[i].hitboxes.id[j].size - gameSettings.phantomThreshold;
        const adj = Math.cos(x) * player[i].hitboxes.id[j].size - gameSettings.phantomThreshold;
        const sigma = [h1.x, h1.y];
        let alpha1;
        let alpha2;
        let beta1;
        let beta2;
        if (a > 0 && b > 0 || a <= 0 && b <= 0) {
          alpha1 = new Vec2D(sigma[0] + adj, sigma[1] - opp);
          alpha2 = new Vec2D(alpha1.x + a, alpha1.y + b);
          beta1 = new Vec2D(sigma[0] - adj, sigma[1] + opp);
          beta2 = new Vec2D(beta1.x + a, beta1.y + b);
        } else {
          alpha1 = new Vec2D(sigma[0] - adj, sigma[1] - opp);
          alpha2 = new Vec2D(alpha1.x + a, alpha1.y + b);
          beta1 = new Vec2D(sigma[0] + adj, sigma[1] + opp);
          beta2 = new Vec2D(beta1.x + a, beta1.y + b);
        }
        player[i].phys.interPolatedHitboxPhantom[j] = [alpha1, alpha2, beta2, beta1];
        player[i].phys.isInterpolated = true;
      }
    }
  }
}
;
export function physics(i, input) {
  player[i].phys.passing = false;
  player[i].phys.posPrev = new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y);
  player[i].phys.facePrev = player[i].phys.face;
  deepObjectMerge(true, player[i].phys.prevFrameHitboxes, player[i].hitboxes);
  hitlagSwitchUpdate(i, input);
  hurtBoxStateUpdate(i);
  outOfCameraUpdate(i);
  lCancelUpdate(i, input);
  if (!player[i].phys.grounded) {
    player[i].phys.airborneTimer++;
  }
  let frame = Math.floor(player[i].timer);
  if (frame === 0) {
    frame = 1;
  }
  if (frame > framesData[characterSelections[i]][player[i].actionState]) {
    frame = framesData[characterSelections[i]][player[i].actionState];
  }
  frame = Math.min(frame, ecb[characterSelections[i]][player[i].actionState]?.length || frame); // HOJA: approximated fighters may outlast the template ECB data: hold the last frame
  const ecbOffset = actionStates[characterSelections[i]][player[i].actionState].dead ? [0, 0, 0, 0] : [ecb[characterSelections[i]][player[i].actionState][frame - 1][0] * player[i].charAttributes.ecbScale, ecb[characterSelections[i]][player[i].actionState][frame - 1][1] * player[i].charAttributes.ecbScale, ecb[characterSelections[i]][player[i].actionState][frame - 1][2] * player[i].charAttributes.ecbScale, ecb[characterSelections[i]][player[i].actionState][frame - 1][3] * player[i].charAttributes.ecbScale];
  const playerPosX = player[i].phys.pos.x;
  const playerPosY = player[i].phys.pos.y;
  player[i].phys.ECBp = [new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y + (player[i].phys.grounded || player[i].phys.airborneTimer < 10 ? 0 : ecbOffset[0])), new Vec2D(player[i].phys.pos.x + Math.max(1, ecbOffset[1]), player[i].phys.pos.y + ecbOffset[2]), new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y + ecbOffset[3]), new Vec2D(player[i].phys.pos.x - ecbOffset[1], player[i].phys.pos.y + ecbOffset[2])];
  if (ecbSquashData[i] !== null && ecbSquashData[i].factor < 1) {
    if (ecbSquashData[i].factor * 2 * ecbOffset[1] < smallestECBWidth) {
      ecbSquashData[i].factor = (smallestECBWidth + 2 * additionalOffset) / (2 * ecbOffset[1]);
    }
    player[i].phys.ECBp = squashECBAt(player[i].phys.ECBp, {
      factor: ecbSquashData[i].factor,
      location: 0
    });
    if (!player[i].phys.grounded) {
      player[i].phys.ECBp = moveECB(player[i].phys.ECBp, new Vec2D(0, (ecbSquashData[i].factor - 1) * ecbOffset[0]));
    }
  }
  if (!actionStates[characterSelections[i]][player[i].actionState].ignoreCollision) {
    let notTouchingWalls = [true, true];
    let stillGrounded = true;
    let backward = false;
    [stillGrounded, backward, notTouchingWalls] = findAndResolveCollisions(i, input, backward, notTouchingWalls, ecbOffset);
    if (player[i].phys.grabbedBy === -1) {
      if (notTouchingWalls[0] && notTouchingWalls[1] && player[i].phys.canWallJump) {
        player[i].phys.wallJumpTimer = 254;
      }
      if (!notTouchingWalls[0] || !notTouchingWalls[1]) {
        if (player[i].phys.grounded) {
          const s = player[i].phys.onSurface[1];
          const surface = player[i].phys.onSurface[0] ? activeStage.platform[s] : activeStage.ground[s];
          if (player[i].phys.pos.x < surface[0].x - 0.1 || player[i].phys.pos.x > surface[1].x + 0.1) {
            stillGrounded = false;
          }
        }
      }
      if (!stillGrounded) {
        player[i].phys.grounded = false;
        if (typeof actionStates[characterSelections[i]][player[i].actionState].airborneState !== 'undefined') {
          player[i].actionState = actionStates[characterSelections[i]][player[i].actionState].airborneState;
        } else {
          if (actionStates[characterSelections[i]][player[i].actionState].missfoot && backward) {
            actionStates[characterSelections[i]].MISSFOOT.init(i, input);
          } else {
            if (player[i].phys.grabbing !== -1) {
              actionStates[characterSelections[player[i].phys.grabbing]].FALL.init(player[i].phys.grabbing, input, true);
              player[player[i].phys.grabbing].phys.grabbedBy = -1;
              player[i].phys.grabbing = -1;
            }
            actionStates[characterSelections[i]].FALL.init(i, input);
          }
          if (Math.abs(player[i].phys.cVel.x) > player[i].charAttributes.aerialHmaxV) {
            player[i].phys.cVel.x = Math.sign(player[i].phys.cVel.x) * player[i].charAttributes.aerialHmaxV;
          }
        }
        player[i].phys.shielding = false;
      }
      if (player[i].phys.grounded) {
        for (let j = 0; j < 4; j++) {
          if (playerType[j] > -1) {
            if (i !== j) {
              if (player[j].phys.grounded && player[j].phys.onSurface[0] === player[i].phys.onSurface[0] && player[j].phys.onSurface[1] === player[i].phys.onSurface[1]) {
                if (player[i].phys.grabbing !== j && player[i].phys.grabbedBy !== j) {
                  const diff = Math.abs(player[i].phys.pos.x - player[j].phys.pos.x);
                  if (diff < 6.5 && diff > 0) {
                    player[j].phys.pos.x += Math.sign(player[i].phys.pos.x - player[j].phys.pos.x) * -0.3;
                  } else if (diff === 0 && Math.abs(player[i].phys.cVel.x) > Math.abs(player[j].phys.cVel.x)) {
                    player[j].phys.pos.x += Math.sign(player[i].phys.cVel.x) * -0.3;
                  }
                }
              }
            }
          }
        }
      }
    }
  } else {
    player[i].phys.ECB1 = [new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y + (player[i].phys.grounded || player[i].phys.airborneTimer < 10 ? 0 : ecbOffset[0])), new Vec2D(player[i].phys.pos.x + ecbOffset[1], player[i].phys.pos.y + ecbOffset[2]), new Vec2D(player[i].phys.pos.x, player[i].phys.pos.y + ecbOffset[3]), new Vec2D(player[i].phys.pos.x - ecbOffset[1], player[i].phys.pos.y + ecbOffset[2])];
  }
  if (player[i].phys.shielding === false) {
    player[i].phys.shieldHP += 0.07;
    if (player[i].phys.shieldHP > 60) {
      player[i].phys.shieldHP = 60;
    }
  }
  dealWithLedges(i, input);
  dealWithDeath(i, input);
  player[i].phys.hurtbox = new Box2D([playerPosX - player[i].charAttributes.hurtboxOffset[0], playerPosY + player[i].charAttributes.hurtboxOffset[1]], [playerPosX + player[i].charAttributes.hurtboxOffset[0], playerPosY]);
  if (gameMode === 3 && player[i].phys.posPrev.y > -80 && playerPosY <= -80) {}
  updateHitboxes(i);
  player[i].phys.posDelta = new Vec2D(Math.abs(playerPosX - player[i].phys.posPrev.x), Math.abs(playerPosY - player[i].phys.posPrev.y));
}

