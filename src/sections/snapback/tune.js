/**
 * tune.js: Tuning the Spring snapback filter (type 3) to one stick, in a dialog.
 *
 * The controller records the stick each time it comes back from a push (device.armSpringCapture →
 * 'spring-capture'). Three steps collect captures, each read by spring.js and turned away with a reason
 * when it isn't what was asked for:
 *   1. Releases: push to the edge and let go completely, 3 times in each of 8 directions (a compass
 *      with a target per direction). These give the stick's spring per direction (a1, a2).
 *   2. Turnarounds: tilt partway and let go, 10 times. These give the crossing speed and stiffness.
 *   3. Thumb moves: quick moves with the thumb on the stick the whole time, 10 times. These give the
 *      upper side of the thresholds.
 * Then the fit, and a scorecard from running the firmware's gate (ported exactly) over every capture
 * with the fitted values: rebounds held back, thumb moves left alone, the worst delay added. A step
 * that fails can be redone on its own. Save writes l_spring / r_spring (flagged tuned) and the Spring
 * type, then saves to the controller.
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
import { readRelease, readTurnaround, readThumb, fitSpring, scorecard } from './spring.js';
import { writeSpring } from './spring-config.js';

const PER_OCTANT = 3;
const TURNAROUNDS = 10;
const THUMBS = 10;
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
  const compass = h('svg.spr-compass', { viewBox: '-128 -128 256 256', role: 'img', 'aria-label': t('Your stick, live') },
    h('circle.spr-gate', { cx: 0, cy: 0, r: R }),
    h('line.spr-axis', { x1: -R, y1: 0, x2: R, y2: 0 }), h('line.spr-axis', { x1: 0, y1: -R, x2: 0, y2: R }),
    partRing, ...targets.map((x) => x.g), trails, stickDot);

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
  const capturePanel = h('div.spr-capture', compass, h('div.spr-side', stepTitle, howTo, counter, countDots, feedback));
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
    device.springCaptureHint?.({ stick, step, octant: step === 'releases' ? nextOctant() : -1 });
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
      stepTitle.textContent = t('Quick moves, thumb on the stick');
      howTo.textContent = t('Keep your thumb on the stick the whole time: dash from one side to the other, dash back and forth, and pull it back to the center. Don’t let go.');
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
  function onCapture(e) {
    const c = e.detail;
    if (c.stick !== stickIdx || step === 'results' || advanceTimer) return;
    if (step === 'releases') {
      const r = readRelease(c);
      trail(c, r.ok && perOctant[r.octant] < PER_OCTANT);
      if (!r.ok) {
        say(r.why === 'edge' ? t('Push it all the way to the edge first.')
          : r.why === 'guided' ? t('Let go completely. Don’t guide it back.')
            : t('That one didn’t spring back cleanly. Try again.'), 'warn');
        return;
      }
      if (perOctant[r.octant] >= PER_OCTANT) {
        say(t('That direction is done. Try one that’s still lit.'), 'warn');
        return;
      }
      perOctant[r.octant]++;
      caps.releases.push(c);
      asked = r.octant;
      say(t('Got it: {direction} ({n} of {of})', { direction: t(DIRECTIONS[r.octant]), n: fmt.number(perOctant[r.octant]), of: fmt.number(PER_OCTANT) }), 'good');
    } else if (step === 'turnarounds') {
      const r = readTurnaround(c);
      trail(c, r.ok);
      if (!r.ok) {
        say(r.why === 'release' ? t('That was a full release from the edge. Tilt only partway this time.')
          : t('Let it go so it springs back past the center.'), 'warn');
        return;
      }
      caps.turnarounds.push(c);
      say(t('Got it.'), 'good');
    } else {
      const r = readThumb(c);
      trail(c, r.ok);
      if (!r.ok) {
        say(t('That looked like a let-go. Keep your thumb on the stick the whole time.'), 'warn');
        return;
      }
      caps.thumbs.push(c);
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
    score = scorecard(fit.params, caps);
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
        row(score.delayOk, t('Most delay added to a thumb move'), ms(score.delayMs)),
        hz.length ? row(true, t('Your stick’s spring'), t('{low} to {high} Hz', { low: fmt.number(Math.min(...hz), { maximumFractionDigits: 0 }), high: fmt.number(Math.max(...hz), { maximumFractionDigits: 0 }) })) : null),
      ...(score.redo.length ? [callout({ tone: 'yellow', icon: 'warning' }, ...score.redo.map((id) => h('p', t(REDO[id]))))] : []));
    swap(resultPanel);
    setActions();
  }

  function redo(id) {
    caps[id] = [];
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
      h('p.muted', t('This stick now uses Spring with its own tuning. Flick it in the Analyzer to see the rebound held back.'))));
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
    stopInput();
    offState();
    device.removeEventListener('spring-capture', onCapture);
    if (session.connected) device.armSpringCapture(null)?.catch?.(() => {});
  });

  enterStep('releases');
  return dlg.result.then((v) => v === true && saved);
}
