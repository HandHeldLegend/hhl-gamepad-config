/**
 * play.js — The "Play" tab: toolbar, the 3D stage and its small overlays (input status, action readout,
 * pause screen).
 *
 * Timing: one requestAnimationFrame loop. A fixed-timestep accumulator advances the simulation in exact
 * 1/30 s steps (presses latched from the USB stream are handed to the step that follows them); the
 * camera moves at the display rate and the hero is drawn interpolated between the last two frames.
 * The game pauses when the tab is hidden, and while paused nothing advances.
 */
import { h } from '../../ui/dom.js';
import { button } from '../../ui/controls.js';
import { t } from '../../i18n/index.js';
import { STEP_MS, MAX_STEPS_PER_RAF } from './constants.js';
import { loadThree, Renderer, FollowCamera } from './render.js';
import { actionName } from './labels.js';
import { store } from './store.js';
import { readTheme } from '../arena/theme.js';

export function renderPlay(panel, app) {
  const { game, input } = app;
  let destroyed = false;
  let raf = 0;
  let renderer = null;

  // ---- Toolbar -----------------------------------------------------------------------------------
  const pauseBtn = button({ label: t('Pause'), icon: 'stop', variant: 'tonal', size: 'sm', onClick: () => { setPaused(!app.paused); refocus(); } });
  const respawnBtn = button({ label: t('Back to start'), icon: 'refresh', variant: 'ghost', size: 'sm', title: t('Back to the start (Select)'),
    onClick: () => { game.respawn(); refocus(); } });
  const camBtn = button({ label: t('Camera behind'), icon: 'calibrate', variant: 'ghost', size: 'sm', title: t('Put the camera behind the hero (L or right-stick press)'),
    onClick: () => { cam?.reset(); refocus(); } });
  const toolbar = h('div.plat-toolbar', h('div.plat-tools', pauseBtn, respawnBtn, camBtn));

  // ---- Stage --------------------------------------------------------------------------------------
  const canvas = h('canvas.plat-canvas', { 'aria-label': t('3D Platformer: a small round hero on a test course of blocks, ramps, walls and pillars') });
  const status = h('span.plat-chip', h('span.plat-chip-dot'), h('span.plat-chip-text', t('Waiting for input…')));
  const readout = h('div.plat-action', { role: 'status', 'aria-live': 'polite', hidden: true });
  const pausedEl = h('div.plat-overlay', { hidden: true },
    h('div.plat-overlay-card',
      h('strong', t('Paused')),
      h('span.small.muted', t('Press Start or Resume to keep playing.')),
      button({ label: t('Resume'), icon: 'play', variant: 'primary', size: 'sm', onClick: () => { setPaused(false); refocus(); } })));
  const loading = h('div.plat-overlay', h('div.plat-overlay-card', h('span.muted', t('Loading 3D view…'))));
  const stage = h('div.plat-stage', { tabindex: '0', onpointerdown: () => stage.focus({ preventScroll: true }) },
    canvas, h('div.plat-hud', status), readout, pausedEl, loading);
  const refocus = () => stage.focus({ preventScroll: true });
  const hint = h('p.small.muted.plat-hint', t('Play needs your controller: move with the left stick, orbit the camera with the right stick, jump with A. All moves are listed under Controls & help.'));
  panel.append(h('div.plat-play', toolbar, stage, hint));

  function setPaused(v) {
    app.setPaused(v);
    pausedEl.hidden = !app.paused;
    pauseBtn.setLabel(app.paused ? t('Resume') : t('Pause'));
    if (!app.paused) { input.clearPresses(); acc = 0; last = performance.now(); }
  }
  const syncPause = () => { pausedEl.hidden = !app.paused; pauseBtn.setLabel(app.paused ? t('Resume') : t('Pause')); };
  const offPause = app.onPause(syncPause);
  syncPause(); // e.g. paused while the help tab was open

  // ---- Loop ---------------------------------------------------------------------------------------
  let cam = null;
  let acc = 0;
  let last = performance.now();
  let shownAction = '';
  let shownStatus = '';
  let errors = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    try { tick(now); } catch (err) { if (errors++ < 5) console.error('[platformer]', err); }
  }

  function tick(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const held = input.poll();
    if (app.paused) {
      const p = input.takePresses();
      if (p.pause) setPaused(false);
    } else {
      acc += dt * 1000;
      let steps = 0;
      while (acc >= STEP_MS && steps < MAX_STEPS_PER_RAF) {
        const p = input.takePresses();
        if (p.pause) { setPaused(true); break; }
        if (p.respawn) { game.respawn(); cam.snap(game.hero); }
        if (p.camera) cam.reset();
        const s = input.poll();
        game.step({
          sx: s.lx, sy: s.ly, camYaw: cam.yaw,
          jump: s.jump, attack: s.attack, crouch: s.crouch,
          jumpPressed: !!p.jump, attackPressed: !!p.attack, crouchPressed: !!p.crouch,
        });
        acc -= STEP_MS;
        steps++;
      }
      if (steps >= MAX_STEPS_PER_RAF) acc = 0; // fell far behind (stall): drop the backlog
    }
    const alpha = app.paused ? 1 : Math.min(1, acc / STEP_MS);
    const hero = game.hero;
    const v = renderer.heroView(alpha);
    if (!app.paused) {
      cam.update(dt, v, v.yaw, hero.speed, hero.grounded, { rx: held.rx, ry: held.ry },
        { autoCamera: store.get('autoCamera'), invertX: store.get('invertX'), invertY: store.get('invertY') }, game.course);
    }
    renderer.resize(stage.clientWidth, stage.clientHeight);
    renderer.render(alpha, cam, app.paused ? 0 : dt);

    // Overlays (only touch the DOM when something changed).
    const st = input.live ? 'usb' : 'none';
    if (st !== shownStatus) {
      shownStatus = st;
      status.dataset.source = st;
      status.lastElementChild.textContent = st === 'usb' ? t('Reading {name} over USB', { name: app.deviceName }) : t('Waiting for input…');
    }
    const show = !!store.get('showAction');
    if (readout.hidden === show) readout.hidden = !show;
    if (show) {
      const name = t(actionName(hero));
      if (name !== shownAction) { shownAction = name; readout.textContent = name; }
    }
  }

  // Respawning from the toolbar should also put the camera back behind the hero.
  const prevRespawn = game.onRespawn;
  game.onRespawn = () => { prevRespawn?.(); cam?.snap(game.hero); };

  loadThree().then((THREE) => {
    if (destroyed) return;
    try {
      renderer = new Renderer(canvas, THREE, game, readTheme());
    } catch (err) {
      console.error('[platformer] WebGL unavailable', err);
      loading.firstElementChild.replaceChildren(h('span', t('3D graphics aren’t available in this browser (WebGL is off or unsupported).')));
      return;
    }
    cam = new FollowCamera(game.hero);
    loading.remove();
    const offTheme = app.onTheme((th) => renderer?.setTheme(th));
    cleanups.push(offTheme);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }).catch((err) => {
    if (destroyed) return;
    console.error('[platformer]', err);
    loading.firstElementChild.replaceChildren(h('span', t('The 3D view couldn’t be loaded. Check your connection and reopen this page.')));
  });

  const cleanups = [];
  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    offPause();
    for (const fn of cleanups) fn();
    game.onRespawn = prevRespawn;
    renderer?.destroy();
    renderer = null;
  };
}
