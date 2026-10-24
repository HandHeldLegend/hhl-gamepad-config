/**
 * tune.js: Tuning the Spring snapback filter (type 3) to one stick, in a dialog.
 *
 * The controller records the stick each time it comes back from a push (device.armSpringCapture →
 * 'spring-capture'). Three steps collect captures, each read by spring.js and turned away with a reason
 * when it isn't what was asked for:
 *   1. Releases: push to the edge and let go completely, 3 times in each of 8 directions (a compass
 *      with a target per direction). These give the stick's spring per direction (a1, a2).
 *   2. Turnarounds: tilt partway and let go, 10 times. These give the crossing speed and stiffness.
 *   3. Thumb moves: 9 set moves with the thumb on the stick the whole time (dash across, dash back and
 *      forth, pull back to the center), each from a marked edge and each ending held still at a target
 *      (the far edge, the starting edge, or the center). A ghost on the compass acts the move out. A move
 *      counts once its capture has arrived and the stick has then been held in the target for 300 ms (the
 *      target fills as it's held), so every move gives clean data whatever the player's skill: a move that
 *      ends in a hold can't be a release. These give the upper side of the thresholds.
 *      Letting go after a move makes the stick snap back, which records a release; one right after a
 *      move counted is ignored, not scolded. Moves the results flag (unclear, or held back) are redone
 *      on their own.
 * Then the fit, and a scorecard from running the firmware's gate (ported exactly) over every capture
 * with the fitted values: rebounds held back, thumb moves left alone, the worst delay added. A step
 * that fails can be redone on its own. Save writes l_spring / r_spring (flagged tuned) and the Spring
 * type, then saves to the controller.
 *
 * Download tuning data saves the whole run as JSON for checking it against the firmware tools: every
 * capture (taken or turned away, in the bench recorder's fields: label, stick, x, y, pre, period_us),
 * the fitted values, and what the scorecard found per thumb move.
 *
 * The compass shows the live stick (joystick stream; the capture only runs while the app streams) and
 * draws each capture's path, so every push and let-go visibly lands somewhere.
 */
import { h } from '../../ui/dom.js';
import { button, callout } from '../../ui/controls.js';
import { openDialog } from '../../ui/overlay.js';
import { icon } from '../../ui/icons.js';
import { prefersReducedMotion } from '../../ui/canvas-surface.js';
import { onInputReport } from '../../device/reports.js';
import { t, N_, fmt, plural } from '../../i18n/index.js';
import { isDemo } from '../../device/mock.js';
import { readRelease, readTurnaround, readThumb, fitSpring, scorecard, CAPTURE_PRE, SAMPLE_MS } from './spring.js';
import { writeSpring } from './spring-config.js';

const PER_OCTANT = 3;
const TURNAROUNDS = 10;
/** Thumb moves, in order: the move and the edge it starts from (octant). */
const THUMB_PLAN = [['across', 0], ['pull', 2], ['back', 4], ['across', 6], ['pull', 1], ['back', 3], ['across', 5], ['pull', 7], ['back', 2]];
const THUMBS = THUMB_PLAN.length;
/** end: where the move finishes, held: the far edge, the starting edge, or the center. */
const THUMB_MOVES = {
  across: { end: 'far', name: N_('Dash across'), how: N_('Push to the marked edge, sweep all the way across, and keep holding at the far edge until the target fills.') },
  back: { end: 'start', name: N_('Dash back and forth'), how: N_('Push to the marked edge, flick to the far edge and straight back, and keep holding at the marked edge until the target fills.') },
  pull: { end: 'center', name: N_('Pull back'), how: N_('Push to the marked edge, then slowly bring it back to the center and hold it there until the target fills.') },
};
/** Holding in the end target this long finishes a move. */
const HOLD_MS = 300;
/** A move's capture waits this long for the hold, then the move has to be done again. */
const HOLD_WAIT_MS = 3000;
/** After a thumb move counts, a release this soon is the stick being let go afterwards. */
const AFTER_MOVE_MS = 3000;
/** One showing of a move by the ghost. */
const GUIDE_MS = 2600;
/** How long a finished step's last "Got it" shows before the next step. */
const STEP_PAUSE_MS = 900;
const TRAIL_MS = 1400;

const STEPS = [
  { id: 'releases', title: N_('Releases') },
  { id: 'turnarounds', title: N_('Turnarounds') },
  { id: 'thumbs', title: N_('Thumb moves') },
  { id: 'results', title: N_('Results') },
];

const DIRECTIONS = [N_('right'), N_('up-right'), N_('up'), N_('up-left'), N_('left'), N_('down-left'), N_('down'), N_('down-right')];

/**
 * Open the tuning dialog for one stick. Resolves true once a tuning was saved.
 * @param {{session: object, device: object, stick: 'left'|'right'}} o
 */
export function tuneSpring({ session, device, stick }) {
  const stickIdx = stick === 'left' ? 0 : 1;
  const caps = { releases: [], turnarounds: [], thumbs: [] };
  const perOctant = Array(8).fill(0);
  let step = 'releases';
  let returnTo = null;       // redoing one step from the results: go straight back to them
  let fit = null;
  let score = null;
  let advanceTimer = 0;

  // ---- Compass -------------------------------------------------------------------------------
  const R = 100;
  const pos = (x, y, r = R) => [(x / 2048) * r, (-y / 2048) * r];
  const targets = DIRECTIONS.map((_, o) => {
    const a = (o * Math.PI) / 4;
    const [cx, cy] = [Math.cos(a) * R, -Math.sin(a) * R];
    const pips = Array.from({ length: PER_OCTANT }, (_, i) => {
      const pa = a + ((i - 1) * Math.PI) / 30;
      return h('circle.spr-pip', { cx: Math.cos(pa) * (R + 16), cy: -Math.sin(pa) * (R + 16), r: 3.2 });
    });
    const g = h('g.spr-target', {}, h('circle.spr-target-ring', { cx, cy, r: 11 }), h('circle.spr-target-core', { cx, cy, r: 5 }), ...pips);
    return { g, pips };
  });
  const partRing = h('circle.spr-part', { cx: 0, cy: 0, r: R * 0.55 });
  const trails = h('g.spr-trails');
  const stickDot = h('circle.spr-stick', { cx: 0, cy: 0, r: 7 });
  // Thumb moves: the move's path and a ghost stick acting it out
  const guideLine = h('line.spr-guide-line');
  const guideStart = h('circle.spr-guide-start', { r: 12 });
  const ghost = h('circle.spr-ghost', { r: 7 });
  // Where the move ends: hold the stick in it until it fills
  const endFill = h('circle.spr-end-fill', { r: 14, pathLength: 100 });
  const endTarget = h('g.spr-end', {}, h('circle.spr-end-ring', { r: 14 }), endFill);
  const guide = h('g.spr-guide', {}, guideLine, guideStart, endTarget, ghost);
  const compass = h('svg.spr-compass', { viewBox: '-128 -128 256 256', role: 'img', 'aria-label': t('Your stick, live') },
    h('circle.spr-gate', { cx: 0, cy: 0, r: R }),
    h('line.spr-axis', { x1: -R, y1: 0, x2: R, y2: 0 }), h('line.spr-axis', { x1: 0, y1: -R, x2: 0, y2: R }),
    partRing, ...targets.map((x) => x.g), guide, trails, stickDot);

  /** Draw a capture's path; it fades out on its own. */
  function trail(c, good) {
    const pts = Array.from(c.x, (x, i) => pos(x, c.y[i]).map((v) => v.toFixed(1)).join(',')).join(' ');
    const line = h('polyline.spr-trail', { points: pts, class: good ? 'good' : 'bad' });
    trails.append(line);
    setTimeout(() => line.remove(), TRAIL_MS);
  }

  // ---- Panels ---------------------------------------------------------------------------------
  const pills = STEPS.map((s, i) => h('li.spr-pill', h('span.spr-pill-n', fmt.number(i + 1)), h('span.spr-pill-label', t(s.title))));
  const stepTitle = h('h3.spr-title');
  const howTo = h('p.spr-how');
  const counter = h('div.spr-count', { 'aria-hidden': 'true' });
  const countDots = h('div.spr-dots');
  const feedback = h('p.spr-feedback', { role: 'status', 'aria-live': 'polite' });
  const moveName = h('strong.spr-move-name');
  const moveHow = h('span.spr-move-how');
  const moveCard = h('div.spr-move', moveName, moveHow);
  const capturePanel = h('div.spr-capture', compass, h('div.spr-side', stepTitle, howTo, moveCard, counter, countDots, feedback));
  const resultPanel = h('div.spr-results');
  const stage = h('div.spr-stage', capturePanel);
  const body = h('div.spr', h('ol.spr-steps', pills), stage);

  const dlg = openDialog({
    title: stick === 'left' ? t('Tune Spring: left stick') : t('Tune Spring: right stick'),
    icon: 'snapback', tone: 'green', wide: true, dismissible: false, body,
  });
  dlg.el.classList.add('spr-dialog');

  function say(text, tone = '') {
    feedback.className = `spr-feedback ${tone}`;
    feedback.replaceChildren(text ? h('span.spr-say', text) : '');
  }

  function count() {
    if (step === 'releases') return { n: perOctant.reduce((a, v) => a + Math.min(v, PER_OCTANT), 0), of: 8 * PER_OCTANT };
    if (step === 'turnarounds') return { n: caps.turnarounds.length, of: TURNAROUNDS };
    return { n: thumbSlots.filter(Boolean).length, of: THUMBS };
  }

  /** The direction to ask for next: the first one still short, going round from the last one asked. */
  let asked = 0;
  function nextOctant() {
    for (let i = 0; i < 8; i++) {
      const o = (asked + i) % 8;
      if (perOctant[o] < PER_OCTANT) return o;
    }
    return -1;
  }

  function paintSteps() {
    const at = STEPS.findIndex((s) => s.id === step);
    pills.forEach((p, i) => {
      p.classList.toggle('active', i === at);
      p.classList.toggle('done', i < at || (step === 'results' && i < 3));
    });
  }

  function paintCapture() {
    const { n, of } = count();
    counter.textContent = t('{n} of {of}', { n: fmt.number(n), of: fmt.number(of) });
    if (step === 'releases') {
      countDots.replaceChildren();
      const o = nextOctant();
      targets.forEach((tg, i) => {
        tg.g.classList.toggle('next', i === o);
        tg.g.classList.toggle('full', perOctant[i] >= PER_OCTANT);
        tg.pips.forEach((p, k) => p.classList.toggle('on', k < perOctant[i]));
      });
    } else {
      const want = step === 'turnarounds' ? TURNAROUNDS : THUMBS;
      if (countDots.children.length !== want) countDots.replaceChildren(...Array.from({ length: want }, () => h('span.spr-dot')));
      [...countDots.children].forEach((d, i) => d.classList.toggle('on', step === 'thumbs' ? !!thumbSlots[i] : i < n));
    }
    capturePanel.dataset.step = step;
    const move = step === 'thumbs' ? THUMB_PLAN[nextSlot()] ?? null : null;
    moveCard.hidden = !move;
    if (move) showMove(move);
    device.springCaptureHint?.({ stick, step, octant: step === 'releases' ? nextOctant() : move ? move[1] : -1, kind: move?.[0] });
  }

  // ---- The thumb move guide --------------------------------------------------------------------
  let guideMove = null;
  let guideFrame = 0;
  let guideT0 = 0;
  const E = 1900;
  const ease = (a, b, u) => a + (b - a) * (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;
  /** Where the move has the stick at phase u (0..1), along its edge direction: +E is the starting edge. */
  function along(kind, u) {
    const seg = (from, to, a, b) => ease(from, to, (u - a) / (b - a));
    // Each ends held still where the move finishes
    if (kind === 'pull') return u < 0.2 ? E : seg(E, 0, 0.2, 0.65);
    if (kind === 'across') return u < 0.15 ? E : seg(E, -E, 0.15, 0.45);
    return u < 0.12 ? E : u < 0.32 ? seg(E, -E, 0.12, 0.32) : seg(-E, E, 0.32, 0.55);
  }
  function showMove([kind, o]) {
    if (guideMove && guideMove[0] === kind && guideMove[1] === o) return;
    const first = !guideMove;
    guideMove = [kind, o];
    moveName.textContent = t(THUMB_MOVES[kind].name);
    moveHow.textContent = t(THUMB_MOVES[kind].how);
    if (!first) replay(moveCard);
    const a = (o * Math.PI) / 4;
    const [sx, sy] = [Math.cos(a) * R, -Math.sin(a) * R];
    const end = kind === 'pull' ? 0 : -1;
    Object.entries({ x1: sx, y1: sy, x2: sx * end, y2: sy * end }).forEach(([k, v]) => guideLine.setAttribute(k, v.toFixed(1)));
    guideStart.setAttribute('cx', sx.toFixed(1));
    guideStart.setAttribute('cy', sy.toFixed(1));
    const endAt = { far: -1, start: 1, center: 0 }[THUMB_MOVES[kind].end];
    endTarget.setAttribute('transform', `translate(${(sx * endAt).toFixed(1)} ${(sy * endAt).toFixed(1)})`);
    setHold(0);
    guideT0 = performance.now();
    if (prefersReducedMotion()) { placeGhost(0.1); return; }
    if (!guideFrame) guideFrame = requestAnimationFrame(animateGuide);
  }
  function placeGhost(u) {
    const [kind, o] = guideMove;
    const a = (o * Math.PI) / 4;
    const s = along(kind, u);
    const [x, y] = pos(Math.cos(a) * s, Math.sin(a) * s);
    ghost.setAttribute('cx', x.toFixed(1));
    ghost.setAttribute('cy', y.toFixed(1));
    // Fade in at the start of each showing, out at its end
    ghost.style.opacity = String(Math.min(1, u * 12, (1 - u) * 8));
  }
  function animateGuide(now) {
    guideFrame = 0;
    if (step !== 'thumbs' || !guideMove) return;
    placeGhost(((now - guideT0) % GUIDE_MS) / GUIDE_MS);
    guideFrame = requestAnimationFrame(animateGuide);
  }

  // ---- Holding at the end of a thumb move --------------------------------------------------------
  // pending: the move's capture, taken, waiting for the hold. zoneSince: since when the live stick has
  // been in the end target (null: it isn't).
  let pending = null;
  let zoneSince = null;
  let holdShown = -1;
  let holdTimer = 0;
  function setHold(f) {
    if (f === holdShown) return;
    holdShown = f;
    endFill.style.strokeDashoffset = String(100 - f * 100);
    endTarget.classList.toggle('done', f >= 1);
  }
  /** Is the live stick inside the current move's end target? */
  function inEndZone(x, y) {
    if (!guideMove) return false;
    const [kind, o] = guideMove;
    const d = Math.hypot(x, y);
    const end = THUMB_MOVES[kind].end;
    if (end === 'center') return d < 350;
    const a = (o * Math.PI) / 4 + (end === 'far' ? Math.PI : 0);
    return d > 1400 && (x * Math.cos(a) + y * Math.sin(a)) / d > Math.cos(Math.PI / 6);
  }
  function paintHold(now) {
    if (!pending) { setHold(0); return; }
    if (now - pending.at > HOLD_WAIT_MS) {
      pending.entry.why = 'not-held';
      pending = null;
      say(t('Keep holding at the end of the move until the target fills.'), 'warn');
      setHold(0);
      return;
    }
    // The demo has no thumb to hold with: its captures stand in for the hold
    const since = isDemo() ? pending.at : zoneSince;
    const f = since == null ? 0 : Math.min(1, (now - Math.max(since, pending.at - HOLD_MS)) / HOLD_MS);
    setHold(f);
    if (f >= 1) finishMove();
  }
  function finishMove() {
    const { c, entry, slot } = pending;
    pending = null;
    thumbSlots[slot] = { c, kind: THUMB_PLAN[slot][0], entry };
    entry.accepted = true;
    entry.why = null;
    lastMoveAt = performance.now();
    say(t('Got it.'), 'good');
    afterTake();
  }

  function enterStep(id) {
    clearTimeout(advanceTimer);
    step = id;
    paintSteps();
    if (id === 'results') return showResults();
    if (stage.firstChild !== capturePanel) swap(capturePanel);
    else replay(capturePanel.querySelector('.spr-side'));
    if (id === 'releases') {
      stepTitle.textContent = t('Push to the edge and let go');
      howTo.textContent = t('Push the stick all the way to the lit direction, then let go completely so it snaps back by itself. Three times in each direction.');
    } else if (id === 'turnarounds') {
      stepTitle.textContent = t('Tilt partway, then let go');
      howTo.textContent = t('Tilt the stick about halfway out (the dashed ring), then let go. Mix it up: different directions, small and bigger tilts.');
    } else {
      stepTitle.textContent = t('Copy the moves, thumb on the stick');
      howTo.textContent = t('Watch the ghost on the circle, then do the same move. Keep your thumb on the stick the whole time, and end each move holding still until the target fills.');
      pending = null;
    }
    say('');
    paintCapture();
    setActions();
  }

  /** Fade a panel in place of the current one. The stage never gets shorter, so the dialog doesn't jump. */
  function swap(panel) {
    stage.style.minHeight = `${stage.offsetHeight}px`;
    stage.replaceChildren(panel);
    replay(panel);
  }
  function replay(el) {
    el.classList.remove('rise-in');
    void el.offsetWidth;
    el.classList.add('rise-in');
  }

  // ---- Captures --------------------------------------------------------------------------------
  let lastMoveAt = -Infinity;
  /** Every capture of the run, taken or not, for the export. */
  const log = [];
  /** The thumb moves done, by place in THUMB_PLAN ({c, kind}; null: still to do). */
  const thumbSlots = Array(THUMBS).fill(null);
  const nextSlot = () => thumbSlots.findIndex((x) => !x);
  function onCapture(e) {
    const c = e.detail;
    if (c.stick !== stickIdx || step === 'results' || advanceTimer) return;
    const entry = { label: { releases: 'release', turnarounds: 'turnaround', thumbs: 'thumb' }[step], c, time: Date.now() / 1000, accepted: false, why: null };
    if (step === 'thumbs') entry.kind = THUMB_PLAN[nextSlot()]?.[0];
    log.push(entry);
    const took = (c2) => { entry.accepted = true; entry.c = c2; };
    if (step === 'releases') {
      const r = readRelease(c);
      trail(c, r.ok && perOctant[r.octant] < PER_OCTANT);
      entry.why = r.ok ? null : r.why;
      if (!r.ok) {
        say(r.why === 'edge' ? t('Push it all the way to the edge first.')
          : r.why === 'guided' ? t('Let go completely. Don’t guide it back.')
            : t('That one didn’t spring back cleanly. Try again.'), 'warn');
        return;
      }
      if (perOctant[r.octant] >= PER_OCTANT) {
        entry.why = 'direction-done';
        say(t('That direction is done. Try one that’s still lit.'), 'warn');
        return;
      }
      perOctant[r.octant]++;
      caps.releases.push(c);
      took(c);
      asked = r.octant;
      say(t('Got it: {direction} ({n} of {of})', { direction: t(DIRECTIONS[r.octant]), n: fmt.number(perOctant[r.octant]), of: fmt.number(PER_OCTANT) }), 'good');
    } else if (step === 'turnarounds') {
      const r = readTurnaround(c);
      entry.why = r.ok ? null : r.why;
      trail(c, r.ok);
      if (!r.ok) {
        say(r.why === 'release' ? t('That was a full release from the edge. Tilt only partway this time.')
          : r.why === 'slow-crossing' ? t('That one came back too slowly. Tilt a bit further out and let go faster.')
            : t('Let it go so it springs back past the center.'), 'warn');
        return;
      }
      caps.turnarounds.push(c);
      took(c);
      say(t('Got it.'), 'good');
    } else {
      const r = readThumb(c);
      entry.why = r.ok ? null : r.why;
      // Let go after the last move: the stick snapped back on its own, that's fine
      if (!r.ok && r.why === 'released' && !pending && performance.now() - lastMoveAt < AFTER_MOVE_MS) { entry.why = 'let-go-after-move'; return; }
      trail(c, r.ok);
      if (!r.ok) {
        if (pending) { pending.entry.why = 'not-held'; pending = null; }
        say(r.why === 'edge' ? t('Start each move with the stick pushed all the way to the edge the guide shows.')
          : t('That one was let go. Keep your thumb on the stick and hold still at the end until the target fills.'), 'warn');
        return;
      }
      // Taken once the stick is held still at the end of the move (paintHold)
      if (pending) pending.entry.why = 'replaced';
      entry.why = 'waiting-for-hold';
      pending = { c, entry, slot: nextSlot(), at: performance.now() };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => paintHold(performance.now()), HOLD_WAIT_MS + 50);
      say(t('Now hold it still in the target…'), '');
      return;
    }
    afterTake();
  }

  /** A capture was taken: repaint, and move on once the step is complete. */
  function afterTake() {
    paintCapture();
    const { n, of } = count();
    if (n >= of) {
      say(t('Step done!'), 'good');
      const to = returnTo || STEPS[STEPS.findIndex((s) => s.id === step) + 1].id;
      advanceTimer = setTimeout(() => { advanceTimer = 0; returnTo = null; enterStep(to); }, STEP_PAUSE_MS);
    }
  }

  // ---- Results ---------------------------------------------------------------------------------
  function showResults() {
    caps.thumbs = thumbSlots.filter(Boolean).map((x) => x.c);
    thumbKinds = thumbSlots.filter(Boolean).map((x) => x.kind);
    const dz = session.config.analog?.[stick === 'left' ? 'l_deadzone' : 'r_deadzone'];
    fit = fitSpring(caps, dz || undefined);
    score = scorecard(fit.params, caps, dz);
    const hz = fit.shape.filter(Boolean).map((s) => s.hz);
    const row = (ok, label, value) => h('div.spr-row', { class: ok ? 'good' : 'warn' },
      h('span.spr-row-icon', icon(ok ? 'check' : 'warning')), h('span.spr-row-label', label), h('strong.spr-row-value', value));
    const ratio = (r) => t('{n} of {of}', { n: fmt.number(r.pass), of: fmt.number(r.of) });
    const ms = (v) => t('{n} ms', { n: fmt.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
    // Rebounds that still get through, with nothing to redo: the best this stick allows
    const leaks = score.releases.of - score.releases.pass + score.turnarounds.of - score.turnarounds.pass;
    const limit = !score.ok && !score.redo.length;
    resultPanel.replaceChildren(
      h('div.spr-verdict', { class: score.ok ? 'good' : 'warn' },
        h('span.spr-verdict-art', icon(score.ok ? 'sparkle' : 'warning')),
        h('div',
          h('strong', score.ok ? t('Your stick’s spring is learned') : limit ? t('Learned as well as this stick allows') : t('Almost there')),
          h('p.muted.small', score.ok
            ? t('Every rebound was held back and every thumb move went through. Save it to the controller to use it.')
            : limit ? t('Some rebounds still get through, even with the best tuning for this stick. Redoing the steps won’t change that. Save it to use it.')
              : t('A few thumb moves need another go before this tuning holds up.')))),
      h('div.spr-rows',
        row(score.releases.pass === score.releases.of, t('Releases held back'), ratio(score.releases)),
        row(score.turnarounds.pass === score.turnarounds.of, t('Turnarounds held back'), ratio(score.turnarounds)),
        row(score.thumbs.pass === score.thumbs.of, t('Thumb moves left alone'), ratio(score.thumbs)),
        thumbList(ms),
        row(score.delayOk, t('Most delay added to a thumb move'), ms(score.delayMs)),
        hz.length ? row(true, t('Your stick’s spring'), t('{low} to {high} Hz', { low: fmt.number(Math.min(...hz), { maximumFractionDigits: 0 }), high: fmt.number(Math.max(...hz), { maximumFractionDigits: 0 }) })) : null),
      ...(score.redo.length ? [callout({ tone: 'yellow', icon: 'warning' },
        h('p', t('Some thumb moves were held back or unclear. Do those moves again.')))] : []),
      ...(limit && leaks ? [callout({ tone: 'blue', icon: 'info' },
        h('p', plural(leaks, '{n} rebound still gets through.', '{n} rebounds still get through.')))] : []),
      exportRow());
    swap(resultPanel);
    setActions();
  }

  /** Each thumb move: what it was and the delay it got. Open when one of them failed. */
  function thumbList(ms) {
    const moves = score.thumbs.moves;
    if (!moves.length) return null;
    return h('details.spr-moves', { open: moves.some((m) => !m.pass) },
      h('summary', t('Each thumb move')),
      h('ol.spr-move-list', moves.map((m, i) => h('li', { class: m.pass ? 'good' : 'warn' },
        h('span.spr-move-kind', thumbKinds[i] ? t(THUMB_MOVES[thumbKinds[i]].name) : t('Other')),
        h('span.spr-move-ms', m.unclear ? t('Unclear, do it again')
          : m.delayMs ? t('{time} added', { time: ms(m.delayMs) }) : t('Untouched'))))));
  }
  let thumbKinds = [];

  function exportRow() {
    return h('div.spr-export', button({ label: t('Download tuning data'), icon: 'download', variant: 'ghost', size: 'sm', onClick: exportData }));
  }

  /** The whole run as JSON: captures in the bench recorder's fields, the fit, and the scorecard. */
  function exportData() {
    const dz = score.deadzone;
    const data = {
      format: 'hoja-spring-tuning', version: 1, created: new Date().toISOString(),
      controller: session.info?.name || null, stick, deadzone: dz,
      params: fit.params,
      shape: fit.shape, notes: fit.notes,
      score: { ...score, thumbs: { pass: score.thumbs.pass, of: score.thumbs.of } },
      thumbs: score.thumbs.moves.map((m, i) => ({ index: i, kind: thumbKinds[i] || 'other', ...m })),
      captures: log.map((e) => ({
        label: e.label, stick, number: e.c.number, period_us: SAMPLE_MS * 1000, pre: CAPTURE_PRE, time: e.time,
        accepted: e.accepted, superseded: !!e.superseded, why: e.why, ...(e.kind ? { kind: e.kind } : {}), x: Array.from(e.c.x), y: Array.from(e.c.y),
      })),
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `spring-tuning-${stick}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function redo(id) {
    if (id === 'thumbs') {
      // Only the moves that were held back or unclear (in the order they were asked)
      const done = thumbSlots.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
      done.forEach((slot, k) => {
        if (score.thumbs.moves[k]?.pass) return;
        thumbSlots[slot].entry.superseded = true;
        thumbSlots[slot] = null;
      });
    } else {
      // Redone captures replace the step's earlier ones (the export keeps those, marked superseded)
      const label = { releases: 'release', turnarounds: 'turnaround' }[id];
      for (const e of log) if (e.label === label && e.accepted) e.superseded = true;
      caps[id] = [];
    }
    if (id === 'releases') perOctant.fill(0);
    returnTo = 'results';
    enterStep(id);
  }

  async function save() {
    dlg.setActions([{ label: t('Saving…'), icon: 'save', variant: 'primary', disabled: true }]);
    // Nothing more to record: stop the capture packets so the write has the link to itself
    await device.armSpringCapture(null)?.catch?.(() => {});
    const ok = await writeSpring(session, stick, fit.params);
    if (!ok) {
      setActions();
      resultPanel.querySelector('.spr-save-failed')?.remove();
      resultPanel.append(h('div.spr-save-failed.rise-in', callout({ tone: 'red', icon: 'warning' },
        t('Couldn’t save to the controller. Check the cable and try again.'))));
      return false;
    }
    resultPanel.replaceChildren(h('div.spr-done',
      h('span.spr-done-art', icon('check')),
      h('h3', t('Saved')),
      h('p.muted', t('This stick now uses Spring with its own tuning. Flick it in the Analyzer to see the rebound held back.')),
      exportRow()));
    replay(resultPanel);
    saved = true;
    setActions();
    return false;
  }

  let saved = false;
  function setActions() {
    const cancel = { label: t('Cancel'), variant: 'ghost', value: false };
    if (step !== 'results') {
      dlg.setActions([cancel]);
      return;
    }
    if (saved) { dlg.setActions([{ label: t('Done'), variant: 'primary', value: true }]); return; }
    const redoFirst = score.redo[0];
    dlg.setActions([
      cancel,
      ...(redoFirst ? [{ label: t('Save anyway'), variant: 'ghost', onClick: save }] : []),
      redoFirst
        ? { label: t('Redo those moves'), icon: 'refresh', variant: 'primary', onClick: () => { redo(redoFirst); return false; } }
        : { label: t('Save to controller'), icon: 'save', variant: 'primary', onClick: save },
    ]);
  }

  // ---- Live stick ------------------------------------------------------------------------------
  let frame = 0;
  let live = null;
  const stopInput = onInputReport(device, (r) => {
    const s = r.sticks?.snapback;
    if (!s) return;
    live = stick === 'left' ? [s.lx, s.ly] : [s.rx, s.ry];
    if (step === 'thumbs') {
      const inZone = inEndZone(live[0], live[1]);
      if (!inZone) zoneSince = null;
      else if (zoneSince == null) zoneSince = performance.now();
      paintHold(performance.now()); // on every report, not per frame: frames pause in a background tab
    }
    if (!frame) frame = requestAnimationFrame(drawStick);
  });
  function drawStick() {
    frame = 0;
    if (!live) return;
    const [x, y] = pos(live[0], live[1]);
    stickDot.setAttribute('cx', x.toFixed(1));
    stickDot.setAttribute('cy', y.toFixed(1));
  }

  // ---- Wiring --------------------------------------------------------------------------------
  device.addEventListener('spring-capture', onCapture);
  device.setInputMode(true)?.catch?.(() => {});
  device.armSpringCapture(stick)?.catch?.(() => {});
  const offState = session.on('state', () => { if (!session.connected) dlg.close(false); });
  if (prefersReducedMotion()) body.classList.add('still');

  dlg.result.finally(() => {
    clearTimeout(advanceTimer);
    clearTimeout(holdTimer);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(guideFrame);
    stopInput();
    offState();
    device.removeEventListener('spring-capture', onCapture);
    if (session.connected) device.armSpringCapture(null)?.catch?.(() => {});
  });

  enterStep('releases');
  return dlg.result.then((v) => v === true && saved);
}
