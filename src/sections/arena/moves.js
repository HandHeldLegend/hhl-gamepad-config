/**
 * moves.js — Which attack a direction picks. The attacks themselves (frame data, hitboxes, damage)
 * are per fighter in movesets.js; specials are archetypes in specials.js.
 */

/** Pick a grounded move from a stick direction relative to facing ('neutral' | 'forward' | 'back' | 'up' | 'down'). */
export function groundMove(dir) {
  return { up: 'utilt', down: 'dtilt', forward: 'ftilt', back: 'ftilt', neutral: 'jab' }[dir];
}

/** Pick a smash attack from a smash direction relative to facing. */
export function smashMove(dir) {
  return { up: 'usmash', down: 'dsmash', forward: 'fsmash', back: 'fsmash' }[dir];
}

/** Pick an aerial from a stick direction relative to facing. */
export function airMove(dir) {
  return { up: 'uair', down: 'dair', forward: 'fair', back: 'bair', neutral: 'nair' }[dir];
}

/** Direction of a stick vector relative to facing, using `threshold` for "neutral". */
export function relDir(x, y, facing, threshold) {
  if (Math.hypot(x, y) < threshold) return 'neutral';
  if (Math.abs(y) > Math.abs(x)) return y > 0 ? 'up' : 'down';
  return Math.sign(x) === facing ? 'forward' : 'back';
}
