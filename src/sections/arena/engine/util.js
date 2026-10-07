/**
 * util.js: vectors, boxes, linear algebra, ECB transforms and small helpers used by the engine.
 *
 * Ported from meleelight (MIT, (c) 2016 Will Blackett, https://github.com/schmooblidon/meleelight).
 * Mechanically converted (Flow types, sounds, visual effects and debug output removed; imports
 * rewritten; modules bundled), then adapted by hand where noted with "HOJA:". See docs/ARENA-ENGINE.md.
 * The MIT notice: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software ... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND (full text in ATTRIBUTIONS.md).
 */
/* eslint-disable */
import { coordinateInterceptParameter } from './collision.js';

// ---- main/util/Vec2D.js ----
export class Vec2D {
  x;
  y;
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  dot(vector) {
    return this.x * vector.x + this.y * vector.y;
  }
}
;
export function getXOrYCoord(vec, xOrY) {
  if (xOrY === "x") {
    return vec.x;
  } else {
    return vec.y;
  }
}
;
export function putXOrYCoord(coord, xOrY) {
  if (xOrY === "x") {
    return new Vec2D(coord, 0);
  } else {
    return new Vec2D(0, coord);
  }
}
;
export function flipXOrY(xOrY) {
  return xOrY === "x" ? "y" : "x";
}


// ---- main/util/Box2D.js ----
export class Box2D {
  min;
  max;
  constructor(min, max) {
    this.min = new Vec2D(min[0], min[1]);
    this.max = new Vec2D(max[0], max[1]);
  }
}


// ---- main/util/Segment2D.js ----
export function Segment2D(x, y, vecx, vecy) {
  this.x = x;
  this.y = y;
  this.vecx = vecx;
  this.vecy = vecy;
  this.segLength = function () {
    const dx = this.vecx;
    const dy = this.vecy;
    return Math.sqrt(dx * dx + dy * dy);
  };
  this.project = function (segOnto) {
    const vec = new Vec2D(this.vecx, this.vecy);
    const onto = new Vec2D(segOnto.vecx, segOnto.vecy);
    const d = onto.dot(onto);
    if (0 < d) {
      const dp = vec.dot(onto);
      const multiplier = dp / d;
      const rx = onto.x * multiplier;
      const ry = onto.y * multiplier;
      return new Vec2D(rx, ry);
    }
    return new Vec2D(0, 0);
  };
}


// ---- main/linAlg.js ----
export function dotProd(vec1, vec2) {
  return vec1.x * vec2.x + vec1.y * vec2.y;
}
;
export function scalarProd(lambda, vec) {
  return new Vec2D(lambda * vec.x, lambda * vec.y);
}
;
export function norm(vec) {
  return Math.sqrt(dotProd(vec, vec));
}
export function add(vec1, vec2) {
  return new Vec2D(vec1.x + vec2.x, vec1.y + vec2.y);
}
export function subtract(vec1, vec2) {
  return new Vec2D(vec1.x - vec2.x, vec1.y - vec2.y);
}
function squaredDist(center1, center2) {
  return (center2.x - center1.x) * (center2.x - center1.x) + (center2.y - center1.y) * (center2.y - center1.y);
}
;
export function euclideanDist(center1, center2) {
  const sqDist = squaredDist(center1, center2);
  return sqDist <= 0 ? 0 : Math.sqrt(sqDist);
}
export function manhattanDist(center1, center2) {
  return Math.abs(center2.x - center1.x) + Math.abs(center2.y - center1.y);
}
;
export function orthogonalProjection(point, line) {
  const line0 = line[0];
  const [line0x, line0y] = [line0.x, line0.y];
  if (line0x === line[1].x && line0y === line[1].y) {
    console.log("error in function 'orthogonalProjection', line reduced to a point.");
    return line0;
  } else {
    const pointVec = new Vec2D(point.x - line0x, point.y - line0y);
    const lineVec = new Vec2D(line[1].x - line0x, line[1].y - line0y);
    const lineNorm = norm(lineVec);
    const lineElem = scalarProd(1 / lineNorm, lineVec);
    const factor = dotProd(pointVec, lineElem);
    const projVec = scalarProd(factor, lineElem);
    return new Vec2D(projVec.x + line0x, projVec.y + line0y);
  }
}
;
export function inverseMatrix([[x1, x2], [y1, y2]]) {
  const det = x1 * y2 - x2 * y1;
  if (Math.abs(det) < 0.00001) {
    console.log("error in inverseMatrix: determinant too small");
    return null;
  } else {
    return [[y2 / det, -x2 / det], [-y1 / det, x1 / det]];
  }
}
;
export function multMatVect([[x1, x2], [y1, y2]], [x, y]) {
  return [x1 * x + x2 * y, y1 * x + y2 * y];
}
;
export function reflect(reflectee, reflector) {
  const projVec = orthogonalProjection(reflectee, [new Vec2D(0, 0), reflector]);
  const moveVec = subtract(projVec, reflectee);
  return add(reflectee, scalarProd(2, moveVec));
}


// ---- main/util/ecbTransform.js ----
export function moveECB(ecb, vec) {
  return [new Vec2D(ecb[0].x + vec.x, ecb[0].y + vec.y), new Vec2D(ecb[1].x + vec.x, ecb[1].y + vec.y), new Vec2D(ecb[2].x + vec.x, ecb[2].y + vec.y), new Vec2D(ecb[3].x + vec.x, ecb[3].y + vec.y)];
}
;
export function squashECBAt(ecb, squashDatum) {
  const pos = ecbFocusFromAngularParameter(ecb, squashDatum.location);
  const t = squashDatum.factor;
  return [new Vec2D(t * ecb[0].x + (1 - t) * pos.x, t * ecb[0].y + (1 - t) * pos.y), new Vec2D(t * ecb[1].x + (1 - t) * pos.x, t * ecb[1].y + (1 - t) * pos.y), new Vec2D(t * ecb[2].x + (1 - t) * pos.x, t * ecb[2].y + (1 - t) * pos.y), new Vec2D(t * ecb[3].x + (1 - t) * pos.x, t * ecb[3].y + (1 - t) * pos.y)];
}
;
export function ecbFocusFromAngularParameter(ecb, t) {
  let focus = null;
  if (t === null) {
    focus = new Vec2D(ecb[0].x, (ecb[0].y + ecb[2].y) / 2);
  } else if (t <= 1) {
    focus = new Vec2D((1 - t) * ecb[0].x + t * ecb[1].x, (1 - t) * ecb[0].y + t * ecb[1].y);
  } else if (t <= 2) {
    focus = new Vec2D((1 - (t - 1)) * ecb[1].x + (t - 1) * ecb[2].x, (1 - (t - 1)) * ecb[1].y + (t - 1) * ecb[2].y);
  } else if (t <= 3) {
    focus = new Vec2D((1 - (t - 2)) * ecb[2].x + (t - 2) * ecb[3].x, (1 - (t - 2)) * ecb[2].y + (t - 2) * ecb[3].y);
  } else {
    focus = new Vec2D((1 - (t - 3)) * ecb[3].x + (t - 3) * ecb[0].x, (1 - (t - 3)) * ecb[3].y + (t - 3) * ecb[0].y);
  }
  return focus;
}
export function interpolateECB(srcECB, tgtECB, s) {
  return [new Vec2D((1 - s) * srcECB[0].x + s * tgtECB[0].x, (1 - s) * srcECB[0].y + s * tgtECB[0].y), new Vec2D((1 - s) * srcECB[1].x + s * tgtECB[1].x, (1 - s) * srcECB[1].y + s * tgtECB[1].y), new Vec2D((1 - s) * srcECB[2].x + s * tgtECB[2].x, (1 - s) * srcECB[2].y + s * tgtECB[2].y), new Vec2D((1 - s) * srcECB[3].x + s * tgtECB[3].x, (1 - s) * srcECB[3].y + s * tgtECB[3].y)];
}
export function makeECB(pos, halfWidth, height) {
  return [pos, add(pos, new Vec2D(halfWidth, 0)), add(pos, new Vec2D(0, height)), add(pos, new Vec2D(-halfWidth, 0))];
}


// ---- main/util/findSmallestWithin.js ----
export function findSmallestWithin(list, min, max, smallestSoFar = null) {
  if (list.length < 1) {
    return smallestSoFar;
  } else {
    const [head, ...tail] = list;
    if (head === null) {
      return findSmallestWithin(tail, min, max, smallestSoFar);
    } else if (head >= min && head <= max) {
      if (smallestSoFar === null) {
        return findSmallestWithin(tail, min, max, head);
      } else if (head > smallestSoFar) {
        return findSmallestWithin(tail, min, max, smallestSoFar);
      } else {
        return findSmallestWithin(tail, min, max, head);
      }
    } else {
      return findSmallestWithin(tail, min, max, smallestSoFar);
    }
  }
}
;
export function pickSmallestSweep(list, smallestSoFar = null) {
  if (list.length < 1) {
    return smallestSoFar;
  } else {
    const [head, ...tail] = list;
    if (head === null) {
      return pickSmallestSweep(tail, smallestSoFar);
    } else {
      if (smallestSoFar === null || head.sweep < smallestSoFar.sweep) {
        return pickSmallestSweep(tail, head);
      } else {
        return pickSmallestSweep(tail, smallestSoFar);
      }
    }
  }
}


// ---- main/util/solveQuadraticEquation.js ----
export function solveQuadraticEquation(a0, a1, a2, sign = 1) {
  if (a1 === 0 && a2 === 0) {
    if (a0 === 0) {
      return -1;
    } else {
      return null;
    }
  } else if (Math.abs(a0 * a0 * a2 / (a1 * a1)) < 1e-20) {
    return -a0 / a1;
  } else {
    const disc = a1 * a1 - 4 * a0 * a2;
    if (disc < 0) {
      return null;
    } else if (Math.sign(a1) === sign) {
      return 2 * a0 / (-a1 - sign * Math.sqrt(disc));
    } else {
      return (-a1 + sign * Math.sqrt(disc)) / (2 * a2);
    }
  }
}


// ---- main/util/lineAngle.js ----
export function lineAngle(line) {
  const v1 = line[0];
  const v2 = line[1];
  const theta = Math.atan2(v2.y - v1.y, v2.x - v1.x);
  if (theta < 0) {
    return theta + Math.PI;
  } else {
    return theta;
  }
}
;


// ---- main/util/toList.js ----
export function toList(list) {
  if (list.length === 0) {
    return [];
  } else {
    const [head, ...tail] = list;
    return [head].concat(toList(tail));
  }
}


// ---- main/util/zipLabels.js ----
export function zipLabels(list, string, start = 0) {
  if (list.length === 0) {
    return [];
  } else {
    const [head, ...tail] = list;
    return [[head, [string, start]]].concat(zipLabels(tail, string, start + 1));
  }
}


// ---- main/util/deepCopy.js ----
export function deepCopyObject(deep, object, exclusionList = []) {
  if (deep) {
    const result = {};
    for (const key in object) {
      if (object[key] === null || exclusionList.indexOf(key) !== -1) {
        result[key] = object[key];
      } else if (Array.isArray(object[key])) {
        result[key] = deepCopyArray(deep, object[key], exclusionList);
      } else if (typeof object[key] === "object") {
        result[key] = deepCopyObject(deep, object[key], exclusionList);
      } else {
        result[key] = object[key];
      }
    }
    return result;
  } else {
    return Object.assign({}, object);
  }
}
;
export function deepCopyArray(deep, array, exclusionList) {
  if (deep) {
    const result = [];
    for (let i = 0; i < array.length; i++) {
      if (array[i] === null || exclusionList && exclusionList.indexOf(i) !== -1) {
        result[i] = array[i];
      } else if (Array.isArray(array[i])) {
        result[i] = deepCopyArray(deep, array[i], exclusionList);
      } else if (typeof array[i] === "object") {
        result[i] = deepCopyObject(deep, array[i], exclusionList);
      } else {
        result[i] = array[i];
      }
    }
    result.length = array.length;
    return result;
  } else {
    return Object.assign({}, ...array);
  }
}
;


// ---- main/util/deepCopyObject.js ----
export function deepObjectMerge(deep, target, object, exclusionList) {
  if (deep) {
    let result = target;
    result = result || ({});
    for (let i = 2; i < arguments.length; i++) {
      const obj = arguments[i];
      if (arguments.length === 3 && obj instanceof Array) {
        result = [];
      }
      if (!obj) continue;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === 'object' && exclusionList && exclusionList.indexOf(key) === -1) result[key] = deepObjectMerge(deep, result[key], obj[key]); else result[key] = obj[key];
        }
      }
    }
    return result;
  } else {
    return Object.assign(target, object);
  }
}


// ---- main/util/createHitBox.js ----
export function createHitbox(offset, size, dmg, angle, kg, bk, sk, type, clank, hG, hA, throwex = false) {
  this.offset = offset;
  this.size = size;
  this.dmg = dmg;
  this.angle = angle;
  this.kg = kg;
  this.bk = bk;
  this.sk = sk;
  this.type = type;
  this.clank = clank;
  this.hitGrounded = hG;
  this.hitAirborne = hA;
  this.throwextra = throwex;
}


// ---- main/util/createHitboxObject.js ----
export function createHitboxObject(id0, id1, id2, id3) {
  this.id0 = id0;
  this.id1 = id1;
  this.id2 = id2;
  this.id3 = id3;
}


// ---- stages/util/extremePoint.js ----
export function extremePoint(wall, extreme) {
  const v1 = wall[0];
  const v2 = wall[1];
  switch (extreme) {
    case "u":
    case "t":
      if (v2.y < v1.y) {
        return v1;
      } else {
        return v2;
      }
    case "d":
    case "b":
      if (v2.y > v1.y) {
        return v1;
      } else {
        return v2;
      }
    case "l":
      if (v2.x > v1.x) {
        return v1;
      } else {
        return v2;
      }
    case "r":
      if (v2.x < v1.x) {
        return v1;
      } else {
        return v2;
      }
    default:
      console.log("error in 'extremePoint': invalid parameter " + extreme + ", not up/top/down/bottom/left/right");
      return v1;
  }
}
;


// ---- stages/util/detectIntersections.js ----
export function intersectsAny(newLine, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (intersects(newLine, lines[i])) {
      return true;
    }
  }
  return false;
}
function intersects(line1, line2) {
  const t1 = coordinateInterceptParameter(line1, line2);
  const t2 = coordinateInterceptParameter(line2, line1);
  if (isNaN(t1) || isNaN(t2) || t1 === Infinity || t2 === Infinity || t1 < 0 || t2 < 0 || t1 > 1 || t2 > 1) {
    return false;
  } else {
    return true;
  }
}
function isInside(point, lines) {
  const pt = new Vec2D(point.x + 0.001, point.y);
  const atInfinity = new Vec2D(point.x + 0.001, point.y + 100000);
  return !evenNumberOfTrue(lines.map(line => intersects(line, [pt, atInfinity])));
}
function evenNumberOfTrue(list) {
  if (list.length < 1) {
    return true;
  } else {
    const [head, ...tail] = list;
    if (head === true) {
      return !evenNumberOfTrue(tail);
    } else {
      return evenNumberOfTrue(tail);
    }
  }
}
function distanceToLines(point, lines) {
  if (isInside(point, lines)) {
    return -1;
  } else {
    return minimum(lines.map(line => distanceToLine(point, line)));
  }
}
export function distanceToLine(point, line) {
  if (euclideanDist(line[0], line[1]) < 0.001) {
    return euclideanDist(point, line[0]);
  } else {
    const projectedPoint = orthogonalProjection(point, line);
    const lineRight = extremePoint(line, "r");
    const lineLeft = extremePoint(line, "l");
    const lineTop = extremePoint(line, "t");
    const lineBot = extremePoint(line, "b");
    if (projectedPoint.x > lineRight.x) {
      return euclideanDist(point, lineRight);
    } else if (projectedPoint.x < lineLeft.x) {
      return euclideanDist(point, lineLeft);
    } else if (projectedPoint.y > lineTop.y) {
      return euclideanDist(point, lineTop);
    } else if (projectedPoint.y < lineBot.y) {
      return euclideanDist(point, lineBot);
    } else {
      return euclideanDist(point, projectedPoint);
    }
  }
}
function minimum(numbers) {
  if (numbers.length < 1) {
    return Infinity;
  } else {
    const [head, ...tail] = numbers;
    const next = minimum(tail);
    if (head < next) {
      return head;
    } else {
      return next;
    }
  }
}
export function distanceToPolygon(point, polygon) {
  return distanceToLines(point, linesOfPolygon(polygon));
}
function linesOfPolygon(polygon) {
  const lg = polygon.length;
  let pt = polygon[lg - 1];
  const lines = [];
  for (let i = 0; i < polygon.length; i++) {
    lines.push([pt, polygon[i]]);
    pt = polygon[i];
  }
  return lines;
}
function distanceBetweenLines(line1, line2) {
  if (intersects(line1, line2)) {
    return 0;
  } else {
    return minimum([distanceToLine(line1[0], line2), distanceToLine(line1[1], line2), distanceToLine(line2[0], line1), distanceToLine(line2[1], line1)]);
  }
}
export function lineDistanceToLines(thisLine, otherLines) {
  return minimum(otherLines.map(otherLine => distanceBetweenLines(thisLine, otherLine)));
}


// ---- stages/stage.js ----
export function getSurfaceFromStage(surfaceTypeAndIndex, stage) {
  const surfaceType = surfaceTypeAndIndex[0];
  const surfaceIndex = surfaceTypeAndIndex[1];
  switch (surfaceType) {
    case "l":
      return stage.wallL[surfaceIndex];
    case "r":
      return stage.wallR[surfaceIndex];
    case "p":
      return stage.platform[surfaceIndex];
    case "g":
    default:
      return stage.ground[surfaceIndex];
    case "c":
      return stage.ceiling[surfaceIndex];
  }
}
;

