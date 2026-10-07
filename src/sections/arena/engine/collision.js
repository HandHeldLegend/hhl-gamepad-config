/**
 * collision.js: environmental collision (ECB vs stage surfaces, corners, squashing) and swept-circle tests.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { Vec2D, add, distanceToPolygon, dotProd, ecbFocusFromAngularParameter, euclideanDist, extremePoint, findSmallestWithin, getXOrYCoord, interpolateECB, lineAngle, makeECB, moveECB, pickSmallestSweep, putXOrYCoord, solveQuadraticEquation, squashECBAt, subtract, zipLabels } from './util.js';

// ---- physics/environmentalCollision.js ----
export const additionalOffset = 0.00001;
export const smallestECBWidth = 1.95;
export const smallestECBHeight = 1.95;
const maxRecursion = 6;
export function hLineThrough(point) {
  return [point, new Vec2D(point.x + 1, point.y)];
}
;
export function hLineAt(y) {
  return hLineThrough(new Vec2D(0, y));
}
export function vLineThrough(point) {
  return [point, new Vec2D(point.x, point.y + 1)];
}
;
export function vLineAt(x) {
  return vLineThrough(new Vec2D(x, 0));
}
export function lineThrough(point, xOrY) {
  if (xOrY === "x") {
    return hLineThrough(point);
  } else {
    return vLineThrough(point);
  }
}
;
function turn(number, counterclockwise = true) {
  if (counterclockwise) {
    if (number === 3) {
      return 0;
    } else {
      return number + 1;
    }
  } else {
    if (number === 0) {
      return 3;
    } else {
      return number - 1;
    }
  }
}
;
export function outwardsWallNormal(wallBottomOrLeft, wallTopOrRight, wallType) {
  let sign = 1;
  switch (wallType) {
    case "l":
    case "g":
    case "b":
    case "d":
    case "p":
      sign = -1;
      break;
    default:
      break;
  }
  return new Vec2D(sign * (wallTopOrRight.y - wallBottomOrLeft.y), sign * (wallBottomOrLeft.x - wallTopOrRight.x));
}
function movingInto(vec, wallTopOrRight, wallBottomOrLeft, wallType) {
  return dotProd(vec, outwardsWallNormal(wallBottomOrLeft, wallTopOrRight, wallType)) < 0;
}
;
function isOutside(point, wallTopOrRight, wallBottomOrLeft, wallType) {
  return !movingInto(new Vec2D(point.x - wallBottomOrLeft.x, point.y - wallBottomOrLeft.y), wallTopOrRight, wallBottomOrLeft, wallType);
}
;
export function coordinateInterceptParameter(line1, line2) {
  return ((line1[0].x - line2[0].x) * (line1[1].y - line1[0].y) + (line1[0].x - line1[1].x) * (line1[0].y - line2[0].y)) / ((line2[1].x - line2[0].x) * (line1[1].y - line1[0].y) + (line1[1].x - line1[0].x) * (line2[0].y - line2[1].y));
}
;
export function coordinateIntercept(line1, line2) {
  const t = coordinateInterceptParameter(line1, line2);
  return new Vec2D(line2[0].x + t * (line2[1].x - line2[0].x), line2[0].y + t * (line2[1].y - line2[0].y));
}
;
function runPointSweep(ecb1, ecbp, same, wall, wallType, wallIndex, wallBottomOrLeft, wallTopOrRight, xOrY) {
  let result = null;
  const wallAngle = lineAngle([wallBottomOrLeft, wallTopOrRight]);
  if (wallType === "l" || wallType === "r") {
    const sameResult = pointSweepingCheck(ecb1, ecbp, same, wall, wallType, wallIndex, wallTopOrRight, wallBottomOrLeft, xOrY);
    const other = wallType === "l" && wallAngle < Math.PI / 2 || wallType === "r" && wallAngle > Math.PI / 2 ? 0 : 2;
    const otherResult = pointSweepingCheck(ecb1, ecbp, other, wall, wallType, wallIndex, wallTopOrRight, wallBottomOrLeft, xOrY);
    result = pickSmallestSweep([sameResult, otherResult]);
  } else if (wallType === "c") {
    const topResult = pointSweepingCheck(ecb1, ecbp, 2, wall, wallType, wallIndex, wallTopOrRight, wallBottomOrLeft, xOrY);
    const side = wallAngle < Math.PI / 2 ? 3 : 1;
    const sideResult = pointSweepingCheck(ecb1, ecbp, side, wall, wallType, wallIndex, wallTopOrRight, wallBottomOrLeft, xOrY);
    result = pickSmallestSweep([topResult, sideResult]);
  } else {
    result = pointSweepingCheck(ecb1, ecbp, same, wall, wallType, wallIndex, wallTopOrRight, wallBottomOrLeft, xOrY);
  }
  return result;
}
;
function pointSweepingCheck(ecb1, ecbp, pt, wall, wallType, wallIndex, wallTopOrRight, wallBottomOrLeft, xOrY) {
  let result = null;
  if (isOutside(ecb1[pt], wallTopOrRight, wallBottomOrLeft, wallType) && !isOutside(ecbp[pt], wallTopOrRight, wallBottomOrLeft, wallType)) {
    const s = coordinateInterceptParameter(wall, [ecb1[pt], ecbp[pt]]);
    if (!(isNaN(s) || s === Infinity || s > 1 || s < 0)) {
      const intersection = new Vec2D((1 - s) * ecb1[pt].x + s * ecbp[pt].x, (1 - s) * ecb1[pt].y + s * ecbp[pt].y);
      if (getXOrYCoord(intersection, xOrY) <= getXOrYCoord(wallTopOrRight, xOrY) && getXOrYCoord(intersection, xOrY) >= getXOrYCoord(wallBottomOrLeft, xOrY)) {
        result = {
          sweep: s,
          kind: "surface",
          surface: wall,
          type: wallType,
          index: wallIndex,
          pt: pt
        };
      }
    }
  }
  return result;
}
;
function lineSweepParameters(line1, line2, flip = false) {
  let sign = 1;
  if (flip) {
    sign = -1;
  }
  const x1 = line1[0].x;
  const x2 = line1[1].x;
  const x3 = line2[0].x;
  const x4 = line2[1].x;
  const y1 = line1[0].y;
  const y2 = line1[1].y;
  const y3 = line2[0].y;
  const y4 = line2[1].y;
  const a0 = x2 * y1 - x1 * y2;
  const a1 = x4 * y1 - 2 * x2 * y1 + 2 * x1 * y2 - x3 * y2 + x2 * y3 - x1 * y4;
  const a2 = x2 * y1 - x4 * y1 - x1 * y2 + x3 * y2 - x2 * y3 + x4 * y3 + x1 * y4 - x3 * y4;
  const s = solveQuadraticEquation(a0, a1, a2, sign);
  if (s === null || isNaN(s) || s === Infinity || s < 0 || s > 1) {
    return null;
  } else {
    const t = (s * (x1 - x3) - x1) / (x2 - x1 + s * (x1 - x2 - x3 + x4));
    if (isNaN(t) || t === Infinity || t < 0 || t > 1) {
      return null;
    } else {
      return [t, s];
    }
  }
}
;
function runEdgeSweep(ecb1, ecbp, same, wallType, wallLeft, wallRight, wallBottomOrLeft, wallTopOrRight, xOrY, damageType) {
  let other = 0;
  let counterclockwise = true;
  let corner = null;
  let otherCorner = null;
  let edgeSweepResult = null;
  let otherEdgeSweepResult = null;
  const flip = wallType === "r" || wallType === "c" ? false : true;
  if (getXOrYCoord(ecb1[same], xOrY) > getXOrYCoord(wallTopOrRight, xOrY)) {
    counterclockwise = !flip;
    other = turn(same, counterclockwise);
    if (getXOrYCoord(ecbp[other], xOrY) < getXOrYCoord(wallTopOrRight, xOrY)) {
      corner = wallTopOrRight;
    }
  } else if (getXOrYCoord(ecb1[same], xOrY) < getXOrYCoord(wallBottomOrLeft, xOrY)) {
    counterclockwise = flip;
    other = turn(same, counterclockwise);
    if (getXOrYCoord(ecbp[other], xOrY) > getXOrYCoord(wallBottomOrLeft, xOrY)) {
      corner = wallBottomOrLeft;
    }
  }
  if (corner !== null) {
    let interiorECBside = "l";
    if (counterclockwise === false) {
      interiorECBside = "r";
    }
    if (!isOutside(corner, ecbp[same], ecbp[other], interiorECBside) && isOutside(corner, ecb1[same], ecb1[other], interiorECBside)) {
      edgeSweepResult = edgeSweepingCheck(ecb1, ecbp, same, other, counterclockwise, corner, damageType);
    }
  }
  if ((wallType === "l" || wallType === "r") && other === 0) {
    let otherCounterclockwise = false;
    otherCorner = wallRight;
    if (wallType === "l") {
      otherCounterclockwise = true;
      otherCorner = wallLeft;
    }
    let otherInteriorECBside = "l";
    if (otherCounterclockwise === false) {
      otherInteriorECBside = "r";
    }
    if (!isOutside(otherCorner, ecbp[same], ecbp[2], otherInteriorECBside) && isOutside(otherCorner, ecb1[same], ecb1[2], otherInteriorECBside)) {
      otherEdgeSweepResult = edgeSweepingCheck(ecb1, ecbp, same, 2, otherCounterclockwise, otherCorner, damageType);
    }
  }
  return pickSmallestSweep([edgeSweepResult, otherEdgeSweepResult]);
}
;
function edgeSweepingCheck(ecb1, ecbp, same, other, counterclockwise, corner, damageType) {
  let output = null;
  let interiorECBside = "l";
  if (counterclockwise === false) {
    interiorECBside = "r";
  }
  if (!isOutside(corner, ecbp[same], ecbp[other], interiorECBside) && isOutside(corner, ecb1[same], ecb1[other], interiorECBside)) {
    const recenteredECB1Edge = [new Vec2D(ecb1[same].x - corner.x, ecb1[same].y - corner.y), new Vec2D(ecb1[other].x - corner.x, ecb1[other].y - corner.y)];
    const recenteredECBpEdge = [new Vec2D(ecbp[same].x - corner.x, ecbp[same].y - corner.y), new Vec2D(ecbp[other].x - corner.x, ecbp[other].y - corner.y)];
    const lineSweepResult = lineSweepParameters(recenteredECB1Edge, recenteredECBpEdge, counterclockwise);
    if (lineSweepResult !== null) {
      const [t, s] = lineSweepResult;
      const angularParameter = getAngularParameter(t, same, other);
      output = {
        kind: "corner",
        corner: corner,
        sweep: s,
        angular: angularParameter,
        damageType: damageType
      };
    }
  }
  return output;
}
;
export function findCollision(ecb1, ecbp, labelledSurface) {
  const [wall, [wallType, wallIndex]] = labelledSurface;
  const damageType = wall[2] !== undefined ? wall[2].damageType : null;
  const wallTop = extremePoint(wall, "t");
  const wallBottom = extremePoint(wall, "b");
  const wallLeft = extremePoint(wall, "l");
  const wallRight = extremePoint(wall, "r");
  let wallTopOrRight = wallTop;
  let wallBottomOrLeft = wallBottom;
  let same = 3;
  let xOrY = "y";
  let isPlatform = false;
  switch (wallType) {
    case "l":
      same = 1;
      break;
    case "p":
      isPlatform = true;
    case "g":
      same = 0;
      wallTopOrRight = wallRight;
      wallBottomOrLeft = wallLeft;
      xOrY = "x";
      break;
    case "c":
      same = 2;
      wallTopOrRight = wallRight;
      wallBottomOrLeft = wallLeft;
      xOrY = "x";
      break;
    default:
      break;
  }
  if (ecbp[0].y > wallTop.y && ecb1[0].y > wallTop.y || ecbp[2].y < wallBottom.y && ecb1[2].y < wallBottom.y || ecbp[3].x > wallRight.x && ecb1[3].x > wallRight.x || ecbp[1].x < wallLeft.x && ecb1[1].x < wallLeft.x) {
    return null;
  } else {
    if (isPlatform) {
      if (!isOutside(ecb1[same], wallTopOrRight, wallBottomOrLeft, wallType)) {
        return null;
      }
    }
    const closestEdgeCollision = runEdgeSweep(ecb1, ecbp, same, wallType, wallLeft, wallRight, wallBottomOrLeft, wallTopOrRight, xOrY, damageType);
    const closestPointCollision = runPointSweep(ecb1, ecbp, same, wall, wallType, wallIndex, wallBottomOrLeft, wallTopOrRight, xOrY, damageType);
    let finalCollision = null;
    if (closestEdgeCollision === null) {
      finalCollision = closestPointCollision;
    } else if (closestPointCollision === null) {
      finalCollision = closestEdgeCollision;
    } else if (closestEdgeCollision.sweep > closestPointCollision.sweep) {
      finalCollision = closestPointCollision;
    } else {
      finalCollision = closestEdgeCollision;
    }
    return finalCollision;
  }
}
;
function findClosestCollision(ecb1, ecbp, labelledSurfaces) {
  const touchingData = [null];
  const collisionData = labelledSurfaces.map(labelledSurface => findCollision(ecb1, ecbp, labelledSurface));
  for (let i = 0; i < collisionData.length; i++) {
    const collisionDatum = collisionData[i];
    if (collisionDatum !== null) {
      if (collisionDatum.kind === "surface") {
        touchingData.push({
          sweep: collisionDatum.sweep,
          object: {
            kind: "surface",
            surface: collisionDatum.surface,
            type: collisionDatum.type,
            index: collisionDatum.index,
            pt: collisionDatum.pt
          }
        });
      } else if (collisionDatum.kind === "corner") {
        touchingData.push({
          sweep: collisionDatum.sweep,
          object: {
            kind: "corner",
            corner: collisionDatum.corner,
            angular: collisionDatum.angular,
            damageType: collisionDatum.damageType
          }
        });
      }
    }
  }
  return pickSmallestSweep(touchingData);
}
;
function resolveECB(ecb1, ecbp, playerStatusInfo, labelledSurfaces) {
  return runSlideRoutine(ecb1, ecbp, ecbp, playerStatusInfo, labelledSurfaces, null, {
    type: null,
    angular: null
  }, false, true, 0);
}
function runSlideRoutine(srcECB, tgtECB, ecbp, playerStatusInfo, labelledSurfaces, oldTouchingDatum, slidingAgainst, squashed, final, recursionCounter) {
  let output;
  if (recursionCounter > maxRecursion) {
    console.log("'runSlideRoutine': excessive recursion, aborting.");
    output = {
      ecb: srcECB,
      touching: null,
      squashed: squashed
    };
  } else {
    const slideDatum = slideECB(srcECB, tgtECB, labelledSurfaces, slidingAgainst, playerStatusInfo);
    let newECBp = ecbp;
    if (slideDatum.event === "end") {
      output = {
        ecb: slideDatum.finalECB,
        touching: slideDatum.touching,
        squashed: squashed
      };
    } else if (slideDatum.event === "continue") {
      if (final) {
        output = {
          ecb: tgtECB,
          touching: oldTouchingDatum,
          squashed: squashed
        };
      } else {
        newECBp = updateECBp(srcECB, tgtECB, ecbp, slidingAgainst.type, 0);
        output = runSlideRoutine(tgtECB, newECBp, newECBp, playerStatusInfo, labelledSurfaces, oldTouchingDatum, slidingAgainst, squashed, true, recursionCounter + 1);
      }
    } else {
      const newSrcECB = slideDatum.midECB;
      const slideObject = slideDatum.object;
      let newTouchingDatum;
      let angular;
      let newFinal;
      let newTgtECB;
      let newSlidingType = null;
      let same;
      let other;
      if (slideObject.kind === "surface") {
        const surface = slideObject.surface;
        const surfaceType = slideObject.type;
        if (surfaceType === "l" || surfaceType === "r" || surfaceType === "c") {
          newSlidingType = surfaceType;
        }
        same = surfaceType === "l" ? 1 : 3;
        angular = slideObject.pt;
        newECBp = updateECBp(srcECB, slideDatum.midECB, ecbp, newSlidingType, same);
        newTouchingDatum = {
          kind: "surface",
          type: surfaceType,
          index: slideObject.index,
          pt: angular
        };
        [newTgtECB, newFinal] = findNextTargetFromSurface(newSrcECB, newECBp, surface, surfaceType, angular);
      } else {
        const corner = slideObject.corner;
        angular = slideObject.angular;
        if (angular < 2 && angular > 0) {
          newSlidingType = "l";
        } else if (angular > 2) {
          newSlidingType = "r";
        }
        [same, other] = getSameAndOther(angular);
        newECBp = updateECBp(srcECB, slideDatum.midECB, ecbp, newSlidingType, same);
        [newTgtECB, newFinal] = findNextTargetFromCorner(newSrcECB, newECBp, corner, angular);
        newTouchingDatum = {
          kind: "corner",
          angular: angular
        };
      }
      if (slideDatum.event === "transfer") {
        output = runSlideRoutine(newSrcECB, newTgtECB, newECBp, playerStatusInfo, labelledSurfaces, newTouchingDatum, {
          type: newSlidingType,
          angular: angular
        }, squashed, newFinal, recursionCounter + 1);
      } else {
        const otherTgtECB = slideDatum.tgtECB;
        const [squashTgtECB, abort] = agreeOnTargetECB(newSrcECB, otherTgtECB, newTgtECB, newECBp, same, playerStatusInfo.grounded);
        if (abort) {
          output = {
            ecb: srcECB,
            touching: oldTouchingDatum,
            squashed: squashed
          };
        } else {
          output = runSlideRoutine(newSrcECB, squashTgtECB, newECBp, playerStatusInfo, labelledSurfaces, newTouchingDatum, {
            type: newSlidingType,
            angular: angular
          }, true, newFinal && final, recursionCounter + 1);
        }
      }
    }
  }
  return output;
}
;
function slideECB(srcECB, tgtECB, labelledSurfaces, slidingAgainst, playerStatusInfo) {
  let output;
  const touchingDatum = findClosestCollision(srcECB, tgtECB, labelledSurfaces);
  if (touchingDatum === null) {
    output = {
      event: "continue"
    };
  } else {
    const s = touchingDatum.sweep;
    const r = Math.max(0, s - additionalOffset / 10);
    const midECB = interpolateECB(srcECB, tgtECB, r);
    const collisionObject = touchingDatum.object;
    let damageType = null;
    if (!playerStatusInfo.immune) {
      if (collisionObject.kind === "surface") {
        const surfaceProperties = collisionObject.surface[2];
        if (surfaceProperties !== null && surfaceProperties !== undefined) {
          damageType = surfaceProperties.damageType;
        }
      } else if (collisionObject.kind === "corner") {
        damageType = collisionObject.damageType;
      }
    }
    if (damageType !== null && damageType !== undefined) {
      if (collisionObject.kind === "surface") {
        output = {
          event: "end",
          finalECB: midECB,
          touching: {
            kind: "surface",
            type: collisionObject.type,
            index: collisionObject.index,
            pt: collisionObject.pt,
            damageType: damageType
          }
        };
      } else {
        output = {
          event: "end",
          finalECB: midECB,
          touching: {
            kind: "corner",
            angular: collisionObject.angular,
            damageType: damageType
          }
        };
      }
    } else if (slidingAgainst.type === null) {
      if (collisionObject.kind === "surface") {
        if (collisionObject.type === "g" || collisionObject.type === "p") {
          output = {
            event: "end",
            finalECB: midECB,
            touching: {
              kind: "surface",
              type: collisionObject.type,
              index: collisionObject.index,
              pt: collisionObject.pt
            }
          };
        } else {
          output = {
            event: "transfer",
            midECB: midECB,
            object: {
              kind: "surface",
              surface: collisionObject.surface,
              type: collisionObject.type,
              pt: collisionObject.pt,
              index: collisionObject.index
            }
          };
        }
      } else {
        output = {
          event: "transfer",
          midECB: midECB,
          object: {
            kind: "corner",
            corner: collisionObject.corner,
            angular: collisionObject.angular
          }
        };
      }
    } else {
      const slidingType = slidingAgainst.type;
      if (collisionObject.kind === "surface") {
        const surfaceType = collisionObject.type;
        if (surfaceType === slidingType) {
          output = {
            event: "transfer",
            midECB: midECB,
            object: {
              kind: "surface",
              surface: collisionObject.surface,
              type: collisionObject.type,
              pt: collisionObject.pt,
              index: collisionObject.index
            }
          };
        } else if (slidingType === "c" || surfaceType === "c" || surfaceType === "g" || surfaceType === "p") {
          output = {
            event: "end",
            finalECB: midECB,
            touching: {
              kind: "surface",
              type: collisionObject.type,
              index: collisionObject.index,
              pt: collisionObject.pt
            }
          };
        } else {
          output = {
            event: "squash",
            midECB: midECB,
            tgtECB: tgtECB,
            object: collisionObject,
            pt: collisionObject.pt
          };
        }
      } else {
        const angularParameter = collisionObject.angular;
        const side = getSameAndOther(angularParameter)[0];
        if (slidingType === "c") {
          output = {
            event: "end",
            finalECB: midECB,
            touching: {
              kind: "corner",
              angular: angularParameter
            }
          };
        } else if (slidingType === null || side === 3 && slidingType === "r" || side === 1 && slidingType === "l") {
          output = {
            event: "transfer",
            midECB: midECB,
            object: {
              kind: "corner",
              corner: collisionObject.corner,
              angular: angularParameter
            }
          };
        } else {
          output = {
            event: "squash",
            midECB: midECB,
            tgtECB: tgtECB,
            side: side,
            object: collisionObject
          };
        }
      }
    }
  }
  return output;
}
;
function findNextTargetFromSurface(srcECB, ecbp, wall, wallType, pt) {
  let wallForward;
  let s = 1;
  let tgtECB = ecbp;
  let pushout = 0;
  let final = true;
  const sign = wallType === "l" || wallType === "c" ? -1 : 1;
  const additionalPushout = sign * additionalOffset;
  const xOrY = wallType === "l" || wallType === "r" ? "x" : "y";
  if (wallType === "c") {
    const wallLeft = extremePoint(wall, "l");
    const wallRight = extremePoint(wall, "r");
    if (ecbp[pt].x <= wallRight.x && ecbp[pt].x >= wallLeft.x) {
      const intercept = coordinateIntercept(vLineThrough(ecbp[pt]), wall);
      pushout = intercept.y - ecbp[pt].y;
    } else {
      wallForward = ecbp[pt].x < srcECB[pt].x ? wallLeft : wallRight;
      s = (wallForward.x - srcECB[pt].x) / (ecbp[pt].x - srcECB[pt].x);
      s = Math.min(Math.max(s, 0), 1);
      tgtECB = interpolateECB(srcECB, ecbp, s);
      pushout = wallForward.y - tgtECB[pt].y;
    }
  } else {
    const wallBottom = extremePoint(wall, "b");
    const wallTop = extremePoint(wall, "t");
    if (ecbp[pt].y <= wallTop.y && ecbp[pt].y >= wallBottom.y) {
      const intercept = coordinateIntercept(hLineThrough(ecbp[pt]), wall);
      pushout = intercept.x - ecbp[pt].x;
    } else {
      wallForward = ecbp[pt].y < srcECB[pt].y ? wallBottom : wallTop;
      s = (wallForward.y - srcECB[pt].y) / (ecbp[pt].y - srcECB[pt].y);
      s = Math.min(Math.max(s, 0), 1);
      tgtECB = interpolateECB(srcECB, ecbp, s);
      pushout = wallForward.x - tgtECB[pt].x;
    }
  }
  if (s < 1 || sign * pushout < 0) {
    final = false;
  }
  tgtECB = moveECB(tgtECB, putXOrYCoord(pushout + additionalPushout, xOrY));
  return [tgtECB, final];
}
;
function findNextTargetFromCorner(srcECB, ecbp, corner, angularParameter) {
  const [same, other] = getSameAndOther(angularParameter);
  const LRSign = same === 1 ? -1 : 1;
  const UDSign = other === 2 ? -1 : 1;
  const additionalPushout = LRSign * additionalOffset;
  let tgtECB = ecbp;
  let s = 1;
  let pushout = 0;
  let final = true;
  if (UDSign * ecbp[same].y < UDSign * corner.y) {
    s = (corner.y - srcECB[same].y) / (ecbp[same].y - srcECB[same].y);
    s = Math.min(Math.max(s, 0), 1);
    tgtECB = interpolateECB(srcECB, ecbp, s);
    pushout = corner.x - tgtECB[same].x;
  } else if (UDSign * ecbp[other].y < UDSign * corner.y) {
    const intercept = coordinateIntercept(hLineThrough(corner), [ecbp[same], ecbp[other]]);
    pushout = corner.x - intercept.x + additionalPushout;
  } else {
    s = (corner.y - srcECB[other].y) / (ecbp[other].y - srcECB[other].y);
    s = Math.min(Math.max(s, 0), 1);
    tgtECB = interpolateECB(srcECB, ecbp, s);
    pushout = corner.x - tgtECB[other].x;
  }
  if (s < 1 || LRSign * pushout < 0) {
    final = false;
  }
  tgtECB = moveECB(tgtECB, putXOrYCoord(pushout + additionalPushout, "x"));
  return [tgtECB, final];
}
;
function updateECBp(startECB, endECB, ecbp, slidingType, pt) {
  if (slidingType === null) {
    return ecbp;
  } else {
    let xOrY = slidingType === "l" || slidingType === "r" ? "y" : "x";
    let t;
    if (getXOrYCoord(ecbp[pt], xOrY) - getXOrYCoord(startECB[pt], xOrY) === 0) {
      xOrY = xOrY === "x" ? "y" : "x";
      if (getXOrYCoord(ecbp[pt], xOrY) - getXOrYCoord(startECB[pt], xOrY) === 0) {
        t = 1;
      } else {
        t = (getXOrYCoord(endECB[pt], xOrY) - getXOrYCoord(startECB[pt], xOrY)) / (getXOrYCoord(ecbp[pt], xOrY) - getXOrYCoord(startECB[pt], xOrY));
      }
    } else {
      t = (getXOrYCoord(endECB[pt], xOrY) - getXOrYCoord(startECB[pt], xOrY)) / (getXOrYCoord(ecbp[pt], xOrY) - getXOrYCoord(startECB[pt], xOrY));
    }
    let midECB;
    if (t <= 0) {
      midECB = startECB;
    } else if (t >= 1) {
      midECB = ecbp;
    } else {
      midECB = interpolateECB(startECB, ecbp, t);
    }
    return [add(ecbp[0], subtract(endECB[0], midECB[0])), add(ecbp[1], subtract(endECB[1], midECB[1])), add(ecbp[2], subtract(endECB[2], midECB[2])), add(ecbp[3], subtract(endECB[3], midECB[3]))];
  }
}
;
function agreeOnTargetECB(srcECB, fstTgtECB, sndTgtECB, ecbp, pt, grounded) {
  let output;
  const flipPt = pt === 1 ? 3 : 1;
  const [closestTgtECB, furthestTgtECB, same] = Math.abs(fstTgtECB[pt].y - srcECB[pt].y) < Math.abs(sndTgtECB[flipPt].y - srcECB[flipPt].y) ? [fstTgtECB, sndTgtECB, pt] : [sndTgtECB, fstTgtECB, flipPt];
  const diff = same === 1 ? 3 : 1;
  let otherTgtECB;
  if (furthestTgtECB[diff].y === srcECB[diff].y) {
    otherTgtECB = furthestTgtECB;
  } else {
    const t = (closestTgtECB[same].y - srcECB[same].y) / (furthestTgtECB[diff].y - srcECB[diff].y);
    if (t <= 0) {
      otherTgtECB = srcECB;
    } else if (t >= 1) {
      otherTgtECB = furthestTgtECB;
    } else {
      otherTgtECB = interpolateECB(srcECB, furthestTgtECB, t);
    }
  }
  const tgtECB = [new Vec2D(0, 0), new Vec2D(0, 0), new Vec2D(0, 0), new Vec2D(0, 0)];
  let abort;
  let squashFactor = 1;
  const sign = Math.sign(closestTgtECB[same].x - closestTgtECB[diff].x);
  if (Math.abs(otherTgtECB[same].x - closestTgtECB[diff].x) > smallestECBWidth && Math.sign(otherTgtECB[same].x - closestTgtECB[diff].x) === sign) {
    if (Math.abs(otherTgtECB[same].x - closestTgtECB[diff].x) > Math.abs(closestTgtECB[same].x - closestTgtECB[diff].x)) {
      abort = false;
      console.log("'agreeOnTargetECB' warning: function called when no squashing was required.");
      output = [closestTgtECB, abort];
    } else {
      abort = false;
      squashFactor = (otherTgtECB[same].x - closestTgtECB[diff].x) / (closestTgtECB[same].x - closestTgtECB[diff].x);
      tgtECB[same] = new Vec2D(otherTgtECB[same].x - sign * additionalOffset, otherTgtECB[same].y);
      tgtECB[diff] = new Vec2D(closestTgtECB[diff].x + sign * additionalOffset, closestTgtECB[diff].y);
      tgtECB[2].y = tgtECB[same].y + squashFactor * (closestTgtECB[2].y - closestTgtECB[same].y);
      tgtECB[0].y = grounded ? srcECB[0].y : tgtECB[same].y + squashFactor * (closestTgtECB[0].y - closestTgtECB[same].y);
      tgtECB[2].x = (tgtECB[1].x + tgtECB[3].x) / 2;
      tgtECB[0].x = (tgtECB[1].x + tgtECB[3].x) / 2;
      output = [tgtECB, abort];
    }
  } else {
    const sameLine = [srcECB[same], otherTgtECB[same]];
    const diffLine = [srcECB[diff], closestTgtECB[diff]];
    const offsetDiffLine = [add(diffLine[0], new Vec2D(sign * smallestECBWidth, 0)), add(diffLine[1], new Vec2D(sign * smallestECBWidth, 0))];
    const intercept = coordinateIntercept(sameLine, offsetDiffLine);
    if (Math.abs(closestTgtECB[same].y - srcECB[same].y) >= Math.abs(intercept.y - srcECB[same].y)) {
      abort = true;
      tgtECB[same] = new Vec2D(intercept.x + sign * additionalOffset, intercept.y);
      tgtECB[diff] = new Vec2D(intercept.x - sign * smallestECBWidth - sign * additionalOffset, intercept.y);
      squashFactor = (tgtECB[same].x - tgtECB[diff].x) / (closestTgtECB[same].x - closestTgtECB[diff].x);
      tgtECB[2].y = tgtECB[same].y + squashFactor * (closestTgtECB[2].y - closestTgtECB[same].y);
      tgtECB[0].y = grounded ? srcECB[0].y : tgtECB[same].y + squashFactor * (closestTgtECB[0].y - closestTgtECB[same].y);
      tgtECB[2].x = (tgtECB[1].x + tgtECB[3].x) / 2;
      tgtECB[0].x = (tgtECB[1].x + tgtECB[3].x) / 2;
      output = [tgtECB, abort];
    } else {
      abort = false;
      squashFactor = (otherTgtECB[same].x - closestTgtECB[diff].x - 2 * sign * additionalOffset) / (closestTgtECB[same].x - closestTgtECB[diff].x);
      if (squashFactor >= 1) {
        output = [closestTgtECB, abort];
      } else {
        tgtECB[same] = new Vec2D(otherTgtECB[same].x - sign * additionalOffset, otherTgtECB[same].y);
        tgtECB[diff] = new Vec2D(closestTgtECB[diff].x + sign * additionalOffset, closestTgtECB[diff].y);
        tgtECB[2].y = tgtECB[same].y + squashFactor * (closestTgtECB[2].y - closestTgtECB[same].y);
        tgtECB[0].y = grounded ? srcECB[0].y : tgtECB[same].y + squashFactor * (closestTgtECB[0].y - closestTgtECB[same].y);
        tgtECB[2].x = (tgtECB[1].x + tgtECB[3].x) / 2;
        tgtECB[0].x = (tgtECB[1].x + tgtECB[3].x) / 2;
        output = [tgtECB, abort];
      }
    }
  }
  return output;
}
function getAngularParameter(t, same, other) {
  if (same === 3 && other === 0) {
    return (1 - t) * 3 + t * 4;
  } else if (same === 0 && other === 3) {
    return (1 - t) * 4 + t * 3;
  } else {
    return (1 - t) * same + t * other;
  }
}
;
export function getSameAndOther(a) {
  if (a < 1) {
    return [1, 0];
  } else if (a < 2) {
    return [1, 2];
  } else if (a < 3) {
    return [3, 2];
  } else {
    return [3, 0];
  }
}
;
export function moveAlongGround(pos, posNext, ecbHeight, ground, ceilings) {
  if (pos.x === posNext.x) {
    return null;
  } else {
    const dir = posNext.x < pos.x ? "l" : "r";
    const groundLeft = extremePoint(ground, "l");
    const groundRight = extremePoint(ground, "r");
    if (dir === "l" && pos.x < groundLeft.x || dir === "r" && pos.x > groundRight.x) {
      return null;
    } else {
      const start = dir === "l" ? Math.min(pos.x, groundRight.x) : Math.max(pos.x, groundLeft.x);
      const end = dir === "l" ? Math.max(posNext.x, groundLeft.x) : Math.min(posNext.x, groundRight.x);
      const groundStart = coordinateIntercept(ground, vLineAt(start));
      const groundEnd = coordinateIntercept(ground, vLineAt(end));
      let startECB = makeECB(groundStart, additionalOffset, smallestECBHeight);
      let endECB = makeECB(groundEnd, additionalOffset, smallestECBHeight);
      const labelledCeilings = zipLabels(ceilings, "c");
      let firstCeilingCollision = findClosestCollision(startECB, endECB, labelledCeilings);
      if (firstCeilingCollision === null) {
        if (ecbHeight > smallestECBHeight) {
          return null;
        } else {
          startECB = makeECB(groundStart, additionalOffset / 10, ecbHeight);
          endECB = makeECB(groundEnd, additionalOffset / 10, ecbHeight);
          firstCeilingCollision = findClosestCollision(startECB, endECB, labelledCeilings);
          if (firstCeilingCollision === null || firstCeilingCollision.object.kind === "corner") {
            return null;
          } else {
            const ceiling = firstCeilingCollision.object.surface;
            const intercept = coordinateIntercept(ceiling, [add(groundStart, new Vec2D(0, smallestECBHeight)), add(groundEnd, new Vec2D(0, smallestECBHeight))]);
            return intercept.x + (dir === "l" ? additionalOffset : -additionalOffset);
          }
        }
      } else {
        const s = firstCeilingCollision.sweep;
        return (1 - s) * pos.x + s * posNext.x + (dir === "l" ? additionalOffset : -additionalOffset);
      }
    }
  }
}
export function groundedECBSquashFactor(ecbTop, ecbBottom, ceilings) {
  const ceilingYValues = ceilings.map(ceil => {
    if (ecbTop.x < extremePoint(ceil, "l").x || ecbTop.x > extremePoint(ceil, "r").x) {
      return null;
    } else {
      return coordinateIntercept([ecbBottom, ecbTop], ceil).y;
    }
  });
  const lowestCeilingYValue = findSmallestWithin(ceilingYValues, ecbBottom.y, ecbTop.y);
  const offset = additionalOffset / 10;
  if (lowestCeilingYValue === null) {
    return null;
  } else {
    return Math.max(offset, (lowestCeilingYValue - ecbBottom.y) / (ecbTop.y - ecbBottom.y) - offset);
  }
}
;
function inflateECB(ecb, t, focus, relevantSurfaces) {
  const offset = additionalOffset / 10;
  const pointlikeECB = [new Vec2D(focus.x, focus.y - offset), new Vec2D(focus.x + offset, focus.y), new Vec2D(focus.x, focus.y + offset), new Vec2D(focus.x - offset, focus.y)];
  const closestCollision = findClosestCollision(pointlikeECB, ecb, relevantSurfaces);
  if (closestCollision === null) {
    return {
      location: t,
      factor: 1
    };
  } else {
    const newLocation = t === null ? closestCollision.object.kind === "surface" ? closestCollision.object.pt : closestCollision.object.angular : t;
    return {
      location: newLocation,
      factor: Math.max(additionalOffset, closestCollision.sweep - additionalOffset)
    };
  }
}
function reinflateECB(ecb, position, relevantSurfaces, oldecbSquashDatum, grounded) {
  let q = 1;
  const angularParameter = oldecbSquashDatum.location;
  if (oldecbSquashDatum.factor < 1) {
    q = 1 / oldecbSquashDatum.factor + additionalOffset / 20;
    const focus = ecbFocusFromAngularParameter(ecb, angularParameter);
    const fullsizeecb = [new Vec2D(q * ecb[0].x + (1 - q) * focus.x, q * ecb[0].y + (1 - q) * focus.y), new Vec2D(q * ecb[1].x + (1 - q) * focus.x, q * ecb[1].y + (1 - q) * focus.y), new Vec2D(q * ecb[2].x + (1 - q) * focus.x, q * ecb[2].y + (1 - q) * focus.y), new Vec2D(q * ecb[3].x + (1 - q) * focus.x, q * ecb[3].y + (1 - q) * focus.y)];
    const ecbSquashDatum = inflateECB(fullsizeecb, angularParameter, focus, relevantSurfaces);
    const squashedecb = squashECBAt(fullsizeecb, {
      factor: ecbSquashDatum.factor,
      location: angularParameter
    });
    const newPosition = new Vec2D(position.x + squashedecb[0].x - ecb[0].x, grounded ? position.y : position.y + squashedecb[0].y - ecb[0].y);
    const newAngular = ecbSquashDatum.location;
    return [newPosition, ecbSquashDatum, squashedecb];
  } else {
    return [position, {
      location: angularParameter,
      factor: 1
    }, ecb];
  }
}
;
export function runCollisionRoutine(ecb1, ecbp, position, ecbSquashDatum, playerStatusInfo, stage) {
  const stageWalls = zipLabels(stage.wallL, "l").concat(zipLabels(stage.wallR, "r"));
  const stageGrounds = zipLabels(stage.ground, "g");
  const stageCeilings = zipLabels(stage.ceiling, "c");
  const stagePlatforms = zipLabels(stage.platform, "p");
  const grounded = playerStatusInfo.grounded;
  let horizIgnore = "none";
  if (grounded) {
    horizIgnore = "all";
  } else {
    horizIgnore = playerStatusInfo.ignoringPlatforms ? "platforms" : "none";
  }
  const allSurfacesMinusPlatforms = stageWalls.concat(stageGrounds).concat(stageCeilings);
  let relevantSurfaces = [];
  switch (horizIgnore) {
    case "platforms":
      relevantSurfaces = stageWalls.concat(stageGrounds).concat(stageCeilings);
      break;
    case "none":
    default:
      relevantSurfaces = stageWalls.concat(stageGrounds).concat(stageCeilings).concat(stagePlatforms);
      break;
    case "all":
      relevantSurfaces = stageWalls;
      break;
  }
  const resolution = resolveECB(ecb1, ecbp, playerStatusInfo, relevantSurfaces);
  const newTouching = resolution.touching;
  let newECBp = resolution.ecb;
  const newSquashFactor = resolution.squashed ? Math.min(1, (newECBp[1].x - newECBp[3].x) / (ecbp[1].x - ecbp[3].x)) : 1;
  let newSquashLocation = null;
  if (newTouching !== null) {
    if (newTouching.kind === "surface") {
      newSquashLocation = newTouching.pt;
    } else {
      newSquashLocation = newTouching.angular;
    }
  }
  let newSquashDatum = {
    location: newSquashLocation,
    factor: newSquashFactor
  };
  newSquashDatum.factor *= ecbSquashDatum.factor;
  let newPosition = subtract(add(position, newECBp[0]), ecbp[0]);
  if (newSquashDatum.factor < 1) {
    let squashingLocation = null;
    if (grounded) {
      squashingLocation = 0;
    }
    [newPosition, newSquashDatum, newECBp] = reinflateECB(newECBp, newPosition, allSurfacesMinusPlatforms, {
      factor: newSquashDatum.factor,
      location: squashingLocation
    }, grounded);
    if (!grounded && newSquashDatum.factor < 1) {
      [newPosition, newSquashDatum, newECBp] = reinflateECB(newECBp, newPosition, allSurfacesMinusPlatforms, newSquashDatum, false);
    }
  }
  return {
    position: newPosition,
    touching: newTouching,
    squashDatum: newSquashDatum,
    ecb: newECBp
  };
}
;


// ---- physics/interpolatedCollision.js ----
export function sweepCircleVsSweepCircle(p1, r1, p2, r2, q1, s1, q2, s2) {
  if (euclideanDist(p1, q1) < r1 + s1) {
    return new Vec2D(0.5 * p1.x + 0.5 * q1.x, 0.5 * p1.y + 0.5 * q1.y);
  } else {
    const u = p1.x + q2.x - p2.x - q1.x;
    const v = p1.y + q2.y - p2.y - q1.y;
    const w = r1 + s1 - r2 - s2;
    const a0 = Math.pow(p1.x - q1.x, 2) + Math.pow(p1.y - q1.y, 2) - Math.pow(r1 + s1, 2);
    const a1 = -2 * ((p1.x - q1.x) * u + (p1.y - q1.y) * v - (r1 + s1) * w);
    const a2 = Math.pow(u, 2) + Math.pow(v, 2) - Math.pow(w, 2);
    const t1 = solveQuadraticEquation(a0, a1, a2);
    let t = null;
    if (t1 !== null && !isNaN(t1)) {
      const t2 = a0 / (a2 * t1);
      if (t1 < 0 || t1 > 1) {
        if (t2 < 0 || t2 > 1 || isNaN(t2)) {
          t = null;
        } else {
          t = t2;
        }
      } else {
        if (t2 < 0 || t2 > 1 || isNaN(t2)) {
          t = t1;
        } else {
          t = Math.min(t1, t2);
        }
      }
    }
    if (t === null) {
      return null;
    } else {
      const r = (1 - t) * r1 + t * r2;
      const s = (1 - t) * s1 + t * s2;
      const p = new Vec2D((1 - t) * p1.x + t * p2.x, (1 - t) * p1.y + t * p2.y);
      const q = new Vec2D((1 - t) * q1.x + t * q2.x, (1 - t) * q1.y + t * q2.y);
      const wp = s / (r + s);
      const wq = r / (r + s);
      return new Vec2D(wp * p.x + wq * q.x, wp * p.y + wq * q.y);
    }
  }
}
export function sweepCircleVsAABB(p1, r1, p2, r2, bl, tr) {
  const br = new Vec2D(tr.x, bl.y);
  const tl = new Vec2D(bl.x, tr.y);
  if (distanceToPolygon(p1, [bl, br, tr, tl]) <= r1) {
    return p1;
  } else if (p1.x + r1 < bl.x && p2.x + r2 < bl.x || p1.x - r1 > tr.x && p2.x - r2 > tr.x || p1.y + r1 < bl.y && p2.y + r2 < bl.y || p1.y - r1 > tr.y && p2.y - r2 > tr.y) {
    return null;
  } else {
    let checks;
    if (p1.x <= bl.x) {
      if (p1.y <= bl.y) {
        checks = [{
          case: "corner",
          corner: bl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: tl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: br,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: vLineThrough(bl),
          line2: [add(p1, new Vec2D(r1, 0)), add(p2, new Vec2D(r2, 0))]
        }, {
          case: "line",
          line1: hLineThrough(bl),
          line2: [add(p1, new Vec2D(0, r1)), add(p2, new Vec2D(0, r2))]
        }];
      } else if (p1.y >= tr.y) {
        checks = [{
          case: "corner",
          corner: tl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: bl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: tr,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: vLineThrough(bl),
          line2: [add(p1, new Vec2D(r1, 0)), add(p2, new Vec2D(r2, 0))]
        }, {
          case: "line",
          line1: hLineThrough(tr),
          line2: [add(p1, new Vec2D(0, -r1)), add(p2, new Vec2D(0, -r2))]
        }];
      } else {
        checks = [{
          case: "corner",
          corner: bl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: tl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: vLineThrough(bl),
          line2: [add(p1, new Vec2D(r1, 0)), add(p2, new Vec2D(r2, 0))]
        }];
      }
    } else if (p1.x >= tr.x) {
      if (p1.y <= bl.y) {
        checks = [{
          case: "corner",
          corner: br,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: bl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: tr,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: vLineThrough(tr),
          line2: [add(p1, new Vec2D(-r1, 0)), add(p2, new Vec2D(-r2, 0))]
        }, {
          case: "line",
          line1: hLineThrough(bl),
          line2: [add(p1, new Vec2D(0, r1)), add(p2, new Vec2D(0, r2))]
        }];
      } else if (p1.y >= tr.y) {
        checks = [{
          case: "corner",
          corner: tr,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: tl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: br,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: vLineThrough(tr),
          line2: [add(p1, new Vec2D(-r1, 0)), add(p2, new Vec2D(-r2, 0))]
        }, {
          case: "line",
          line1: hLineThrough(tr),
          line2: [add(p1, new Vec2D(0, -r1)), add(p2, new Vec2D(0, -r2))]
        }];
      } else {
        checks = [{
          case: "corner",
          corner: tr,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: br,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: vLineThrough(tr),
          line2: [add(p1, new Vec2D(-r1, 0)), add(p2, new Vec2D(-r2, 0))]
        }];
      }
    } else {
      if (p1.y <= bl.y) {
        checks = [{
          case: "corner",
          corner: bl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: br,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: hLineThrough(bl),
          line2: [add(p1, new Vec2D(0, r1)), add(p2, new Vec2D(0, r2))]
        }];
      } else {
        checks = [{
          case: "corner",
          corner: tl,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "corner",
          corner: tr,
          p1: p1,
          p2: p2,
          r1: r1,
          r2: r2
        }, {
          case: "line",
          line1: hLineThrough(tr),
          line2: [add(p1, new Vec2D(0, -r1)), add(p2, new Vec2D(0, -r2))]
        }];
      }
    }
    const first = pickSmallestSweep(checks.map(aabbChecker));
    if (first === null) {
      return null;
    } else {
      return first.point;
    }
  }
}
function aabbChecker(check) {
  if (check.case === "corner") {
    const c = check.corner;
    const p1 = check.p1;
    const p2 = check.p2;
    const r1 = check.r1;
    const r2 = check.r2;
    if (euclideanDist(c, p1) < r1) {
      return {
        sweep: 0,
        point: c
      };
    } else {
      const a0 = Math.pow(p1.x - c.x, 2) + Math.pow(p1.y - c.y, 2) - Math.pow(r1, 2);
      const a1 = -2 * ((p1.x - c.x) * (p1.x - p2.x) + (p1.y - c.y) * (p1.y - p2.y) - r1 * (r1 - r2));
      const a2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) - Math.pow(r1 - r2, 2);
      const t1 = solveQuadraticEquation(a0, a1, a2);
      let t = null;
      if (t1 !== null && !isNaN(t1)) {
        const t2 = a0 / (a2 * t1);
        if (t1 < 0 || t1 > 1) {
          if (t2 < 0 || t2 > 1 || isNaN(t2)) {
            t = null;
          } else {
            t = t2;
          }
        } else {
          if (t2 < 0 || t2 > 1 || isNaN(t2)) {
            t = t1;
          } else {
            t = Math.min(t1, t2);
          }
        }
      }
      if (t === null) {
        return null;
      } else {
        return {
          sweep: t,
          point: c
        };
      }
    }
  } else {
    const p = check.line1[0];
    const q = check.line1[1];
    const s = coordinateInterceptParameter(check.line2, check.line1);
    if (s < 0 || s > 1 || isNaN(s) || s === Infinity) {
      return null;
    } else {
      const pt = new Vec2D((1 - s) * p.x + s * q.x, (1 - s) * p.y + s * q.y);
      if (pt.x < Math.min(check.line2[0].x, check.line2[1].x) || pt.x > Math.max(check.line2[0].x, check.line2[1].x) || pt.y < Math.min(check.line2[0].y, check.line2[1].y) || pt.y > Math.max(check.line2[0].y, check.line2[1].y)) {
        return null;
      } else {
        return {
          sweep: s,
          point: pt
        };
      }
    }
  }
}

