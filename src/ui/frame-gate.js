/**
 * frame-gate.js: Caps how often a requestAnimationFrame loop does its (expensive) drawing.
 *
 * Browsers run rAF at the display's refresh rate, so a live view on a 144 Hz monitor redraws 144 times
 * a second. Our views don't need more than 60: the controller stream is 125 Hz, the Arena simulates
 * at 60 Hz and the Platformer at 30 Hz. Halving the draws roughly halves the CPU (and battery) a
 * live page costs on high-refresh screens.
 *
 *   const due = frameGate();
 *   function loop(now) { raf = requestAnimationFrame(loop); if (!due(now)) return; draw(); }
 *
 * On a 60 Hz display every frame is due (2 ms tolerance for vsync jitter); on 120 Hz every other
 * frame; on 144 Hz it alternates 2 and 3 frames for an average of 60. Simulations keep their own
 * fixed-step clocks; gate only the drawing (or a loop whose timing is elapsed-time based).
 */

/** Target redraw rate for live views. */
export const RENDER_FPS = 60;

/** @returns {(now: number) => boolean} true when this frame should draw */
export function frameGate(maxFps = RENDER_FPS) {
  const interval = 1000 / maxFps;
  let next = 0;
  return function due(now) {
    if (now < next - 2) return false;
    // Fell behind (tab was hidden, long frame): restart the cadence instead of bursting to catch up.
    next = now - next > interval ? now + interval : next + interval;
    return true;
  };
}
