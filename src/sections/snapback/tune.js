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
 *      forth, pull back to the center), each from a given edge. A ghost on the compass acts the move out
 *      first. These give the upper side of the thresholds. Letting go at the end of one makes the stick
 *      snap back, which records a release; one right after a move counted is ignored, not scolded.
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
import { t, N_, fmt } from '../../i18n/index.js';
import { readRelease, readTurnaround, readThumb, fitSpring, scorecard, CAPTURE_PRE, SAMPLE_MS } from './spring.js';
import { writeSpring } from './spring-config.js';

const PER_OCTANT = 3;
const TURNAROUNDS = 10;
/** Thumb moves, in order: the move and the edge it starts from (octant). */
const THUMB_PLAN = [['across', 0], ['pull', 2], ['back', 4], ['across', 6], ['pull', 1], ['back', 3], ['across', 5], ['pull', 7], ['back', 2]];
const THUMBS = THUMB_PLAN.length;
const THUMB_MOVES = {
  across: { name: N_('Dash across'), how: N_('From the edge the guide starts at, sweep straight across to the opposite edge, then ease it back to the center.') },
  back: { name: N_('Dash back and forth'), how: N_('From the edge the guide starts at, flick to the opposite edge and straight back, then ease it back to the center.') },
  pull: { name: N_('Pull back'), how: N_('From the edge the guide starts at, bring it back to the center with your thumb and hold it there.') },
};
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
  const guide = h('g.spr-guide', {}, guideLine, guideStart, ghost);
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
    return { n: caps.thumbs.length, of: THUMBS };
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
      [...countDots.children].forEach((d, i) => d.classList.toggle('on', i < n));
    }
    capturePanel.dataset.step = step;
    const move = step === 'thumbs' ? THUMB_PLAN[Math.min(caps.thumbs.length, THUMBS - 1)] : null;
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
    if (kind === 'pull') return u < 0.2 ? E : seg(E, 0, 0.2, 0.55);
    if (kind === 'across') return u < 0.15 ? E : u < 0.5 ? seg(E, -E, 0.15, 0.5) : u < 0.65 ? -E : seg(-E, 0, 0.65, 1);
    return u < 0.12 ? E : u < 0.35 ? seg(E, -E, 0.12, 0.35) : u < 0.58 ? seg(-E, E, 0.35, 0.58) : u < 0.68 ? E : seg(E, 0, 0.68, 1);
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
      howTo.textContent = t('Watch the ghost on the circle, then do the same move. Keep your thumb on the stick the whole time and never let it snap back.');
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
  const thumbKinds = [];   // the move asked for, per thumb move taken
  function onCapture(e) {
    const c = e.detail;
    if (c.stick !== stickIdx || step === 'results' || advanceTimer) return;
    const entry = { label: { releases: 'release', turnarounds: 'turnaround', thumbs: 'thumb' }[step], c, time: Date.now() / 1000, accepted: false, why: null };
    if (step === 'thumbs') entry.kind = THUMB_PLAN[Math.min(caps.thumbs.length, THUMBS - 1)][0];
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
      if (!r.ok && r.why === 'released' && performance.now() - lastMoveAt < AFTER_MOVE_MS) { entry.why = 'let-go-after-move'; return; }
      trail(c, r.ok);
      if (!r.ok) {
        say(r.why === 'edge' ? t('Start each move with the stick pushed all the way to the edge the guide shows.')
          : t('That looked like a let-go. Keep your thumb on the stick until it’s back at the center.'), 'warn');
        return;
      }
      caps.thumbs.push(c);
      thumbKinds.push(entry.kind);
      took(c);
      lastMoveAt = performance.now();
      say(t('Got it.'), 'good');
    }
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
    fit = fitSpring(caps);
    score = scorecard(fit.params, caps, session.config.analog?.[stick === 'left' ? 'l_deadzone' : 'r_deadzone']);
    const hz = fit.shape.filter(Boolean).map((s) => s.hz);
    const row = (ok, label, value) => h('div.spr-row', { class: ok ? 'good' : 'warn' },
      h('span.spr-row-icon', icon(ok ? 'check' : 'warning')), h('span.spr-row-label', label), h('strong.spr-row-value', value));
    const ratio = (r) => t('{n} of {of}', { n: fmt.number(r.pass), of: fmt.number(r.of) });
    const ms = (v) => t('{n} ms', { n: fmt.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
    const REDO = {
      releases: N_('Some releases still bounced through. Redo the releases.'),
      turnarounds: N_('Some turnarounds still bounced through. Redo the turnarounds.'),
      thumbs: N_('Some thumb moves were held back. Redo the thumb moves.'),
    };
    resultPanel.replaceChildren(
      h('div.spr-verdict', { class: score.ok ? 'good' : 'warn' },
        h('span.spr-verdict-art', icon(score.ok ? 'sparkle' : 'warning')),
        h('div',
          h('strong', score.ok ? t('Your stick’s spring is learned') : t('Almost there')),
          h('p.muted.small', score.ok
            ? t('Every rebound was held back and every thumb move went through. Save it to the controller to use it.')
            : t('One step needs another go before this tuning holds up.')))),
      h('div.spr-rows',
        row(score.releases.pass === score.releases.of, t('Releases held back'), ratio(score.releases)),
        row(score.turnarounds.pass === score.turnarounds.of, t('Turnarounds held back'), ratio(score.turnarounds)),
        row(score.thumbs.pass === score.thumbs.of, t('Thumb moves left alone'), ratio(score.thumbs)),
        thumbList(ms),
        row(score.delayOk, t('Most delay added to a thumb move'), ms(score.delayMs)),
        hz.length ? row(true, t('Your stick’s spring'), t('{low} to {high} Hz', { low: fmt.number(Math.min(...hz), { maximumFractionDigits: 0 }), high: fmt.number(Math.max(...hz), { maximumFractionDigits: 0 }) })) : null),
      ...(score.redo.length ? [callout({ tone: 'yellow', icon: 'warning' }, ...score.redo.map((id) => h('p', t(REDO[id]))))] : []),
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
        h('span.spr-move-ms', m.delayMs ? t('{time} added', { time: ms(m.delayMs) }) : t('Untouched'))))));
  }

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
        accepted: e.accepted, why: e.why, ...(e.kind ? { kind: e.kind } : {}), x: Array.from(e.c.x), y: Array.from(e.c.y),
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
    caps[id] = [];
    if (id === 'thumbs') thumbKinds.length = 0;
    if (id === 'releases') perOctant.fill(0);
    returnTo = 'results';
    enterStep(id);
  }

  async function save() {
    dlg.setActions([{ label: t('Saving…'), icon: 'save', variant: 'primary', disabled: true }]);
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
        ? { label: t('Redo this step'), icon: 'refresh', variant: 'primary', onClick: () => { redo(redoFirst); return false; } }
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
