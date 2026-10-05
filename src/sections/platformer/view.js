/**
 * 3D Platformer: a small 3D test course: run, jump, flip, long jump, ground pound and wall kick with
 * the connected controller, to feel how its sticks and buttons behave in a 3D game.
 *
 * Like the Arena it reads only the HOJA controller connected to the app (its USB input stream). The
 * shell mounts this page only while a controller (or the demo controller) is connected.
 *
 * Module map:
 *   constants.js  every tunable number (30 Hz physics, frame windows, camera) and the behaviour references
 *   course.js     the test course (boxes and ramps) and its floor / wall / ceiling queries
 *   hero.js       the hero's action state machine (pure; tested in tests/gameplay.test.mjs)
 *   game.js       hero + course + respawn
 *   input.js      USB stream → sticks, buttons and latched presses
 *   render.js     three.js scene (lazy-loaded), the mascot, follow camera
 *   play.js / help.js  the two tabs; labels.js action names; store.js preferences
 *
 * Deep links: #/platformer?tab=play|help
 */
import { h, loadStyles } from '../../ui/dom.js';
import { tabView } from '../../ui/controls.js';
import { t } from '../../i18n/index.js';
import { Game } from './game.js';
import { PlatformerInput } from './input.js';
import { store } from './store.js';
import { renderPlay } from './play.js';
import { renderHelp } from './help.js';
import { readTheme, watchTheme } from '../arena/theme.js';

const TABS = ['play', 'help'];
const resolveTab = (params = {}) => (TABS.includes(params.tab) ? params.tab : params.tab === 'controls' ? 'help' : null);

export function mount(root, ctx) {
  loadStyles(new URL('./platformer.css', import.meta.url));
  const input = new PlatformerInput({ device: ctx.device, session: ctx.session });
  const game = new Game();
  const themeFns = new Set();
  const pauseFns = new Set();

  const app = {
    game, input,
    deviceName: ctx.session.info?.name || t('your controller'),
    paused: false,
    theme: readTheme(),
    setPaused(v) { app.paused = !!v; for (const fn of pauseFns) fn(app.paused); },
    onPause(fn) { pauseFns.add(fn); return () => pauseFns.delete(fn); },
    onTheme(fn) { themeFns.add(fn); return () => themeFns.delete(fn); },
  };
  const offTheme = watchTheme((th) => { app.theme = th; for (const fn of themeFns) fn(th); });

  const tabs = tabView({
    tone: 'blue',
    value: resolveTab(ctx.params) || store.get('tab') || 'play',
    tabs: [
      { id: 'play', label: t('Play'), icon: 'platformer', render: (p) => renderPlay(p, app) },
      { id: 'help', label: t('Controls & help'), icon: 'help', render: (p) => renderHelp(p, app) },
    ],
    onChange: (id) => { store.set('tab', id); ctx.setParams?.({ tab: id }); },
  });
  root.append(h('div.plat-root', tabs));

  // Pause when the page is hidden (the browser also stops animation frames).
  const onVisibility = () => { if (document.hidden) app.setPaused(true); };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    update(params) {
      const tab = resolveTab(params);
      if (tab && tab !== tabs.value) tabs.select(tab);
    },
    destroy() {
      document.removeEventListener('visibilitychange', onVisibility);
      tabs.destroy();
      offTheme();
      themeFns.clear();
      pauseFns.clear();
      input.destroy();
    },
  };
}
