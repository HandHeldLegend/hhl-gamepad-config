/**
 * help.js (The "Controls & help" tab): controls (with the build's printed button names), the move
 * list, options and an "About" note.
 */
import { h } from '../../ui/dom.js';
import { card, field, toggle, kv } from '../../ui/controls.js';
import { t } from '../../i18n/index.js';
import { store } from './store.js';
import { CHAIN, MOVES, WALL, SLOPE, STEP_MS } from './constants.js';

function controlsCard(app) {
  const names = (b, fallback) => app.input.label(b).join(' / ') || fallback;
  const rows = [
    [t('Move (push further to run faster)'), t('Left stick')],
    [t('Orbit the camera'), t('Right stick')],
    [t('Camera behind the hero'), names('camera', t('L or right-stick press'))],
    [t('Jump'), names('jump', 'A')],
    [t('Attack: punch · kick · dive'), names('attack', 'B')],
    [t('Crouch · ground pound'), names('crouch', t('ZL / ZR or Z'))],
    [t('Pause / resume'), names('pause', 'Start')],
    [t('Back to the start'), names('respawn', 'Select')],
  ];
  return card({ title: t('Controls'), subtitle: t('Read from your controller’s USB data, using the button names printed on it. Analog triggers count as crouch when pressed past halfway.'), icon: 'input', tone: 'green' },
    kv(rows));
}

function movesCard() {
  const ms = (n) => Math.round(n * STEP_MS);
  const moves = [
    [t('Walk and run'), t('Your speed follows how far you push the stick. You turn gradually while running; pull the stick the other way at speed to skid.')],
    [t('Double and triple jump'), t('Jump again within {n} frames (about {ms} ms) of landing for a higher double jump, then once more while running for an even higher triple jump.', { n: CHAIN.WINDOW, ms: ms(CHAIN.WINDOW) })],
    [t('Long jump'), t('While running, press crouch to slide, then jump within {n} frames. You need speed: when slow it’s a normal jump. Keep holding crouch and jump again as you land to chain long jumps.', { n: MOVES.CROUCH_SLIDE_WINDOW })],
    [t('Backflip'), t('Stand still, hold crouch, then jump: a high jump that carries you backward.')],
    [t('Side flip'), t('Run, pull the stick the opposite way to skid, and jump during the skid: a high jump in the new direction.')],
    [t('Ground pound'), t('In the air, press crouch: a spin, a short pause, then a fast drop straight down. You’re stuck for a moment after landing.')],
    [t('Dive and rollout'), t('Press attack while running fast with the stick pushed far (or in the air at speed). You land on your belly and slide; jump or attack to roll out.')],
    [t('Punch and kick'), t('Attack when slow punches on the ground and kicks in the air.')],
    [t('Wall kick'), t('Jump head-on into a tall wall at speed and you cling to it for a moment: press jump right then (up to {n} frames, about {ms} ms, including the start of the fall) to kick off. Between two facing walls you can climb by kicking back and forth.', { n: WALL.CONTACT_FRAMES + WALL.KICK_LATE_FRAMES, ms: ms(WALL.CONTACT_FRAMES + WALL.KICK_LATE_FRAMES) })],
    [t('Ledges'), t('Fall past the top of a ledge and you grab it. Push toward it or press jump to climb up; push away or press crouch to let go. Walking off an edge just drops you.')],
    [t('Slopes'), t('Floors steeper than {deg}° are too steep to stand on: you slide down. Jump to get out of a slide.', { deg: Math.round((Math.acos(SLOPE.STEEP_NY) * 180) / Math.PI) })],
    [t('Falling off'), t('Fall off the course and you’re back at the start.')],
  ];
  return card({ title: t('Moves'), subtitle: t('Frame windows are counted at 30 frames per second (about 33 ms per frame).'), icon: 'sparkle', tone: 'red' },
    h('dl.plat-moves', moves.flatMap(([k, v]) => [h('dt', k), h('dd', v)])));
}

function optionsCard() {
  const opt = (key, label, description) => field({ label, description,
    control: toggle({ checked: !!store.get(key), tone: 'yellow', label, onChange: (v) => store.set(key, v) }) });
  return card({ title: t('Options'), icon: 'settings', tone: 'yellow' },
    opt('showAction', t('Show the current move'), t('Names what you’re doing (for example “Long jump”) in the corner of the play area. Off by default.')),
    opt('autoCamera', t('Camera follows'), t('The camera slowly swings behind you while you run. Turn it off to only move it with the right stick.')),
    opt('invertX', t('Invert camera left/right'), t('Swap the right stick’s horizontal direction.')),
    opt('invertY', t('Invert camera up/down'), t('Swap the right stick’s vertical direction.')));
}

function aboutCard() {
  return card({ title: t('About the 3D Platformer'), icon: 'info', tone: 'lavender' },
    h('p.small', t('A small test course for your HOJA controller in three dimensions: analog walking speed, quick turns, camera control and precisely timed jumps show how your sticks and buttons feel in a 3D game. It reads only the controller connected to this app.')),
    h('p.small', t('Its movement is modelled on the publicly documented physics of classic 30 frames-per-second 3D platformers (speeds, jump heights, frame windows). The hero, the course and the code are original and were written for this app; it contains no game code, data or assets.')),
    h('p.small.muted', t('There are no enemies or collectibles, just blocks, ramps, walls and pillars to move around on.')));
}

export function renderHelp(panel, app) {
  panel.append(h('div.stack', controlsCard(app), movesCard(), optionsCard(), aboutCard()));
}
