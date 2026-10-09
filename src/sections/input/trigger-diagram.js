/**
 * trigger-diagram.js: Dual-stage (GameCube style) trigger detection and the travel diagram shown when
 * calibrating them (Input page, factory station).
 *
 * A dual-stage trigger is an analog input (LT_ANALOG / RT_ANALOG) whose digital partner (LT / RT) clicks
 * at full press. Calibration stops at the top of the membrane so the click stays a second stage. Other
 * analog inputs (plain analog triggers, hall buttons) are not dual-stage.
 */
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { INPUT_CODES, INPUT_TYPE } from './mapping.js';

const codeOf = (key) => INPUT_CODES.find((c) => c.key === key)?.code;

/**
 * Dual-stage triggers on this build.
 * @returns {Array<{side: 'left'|'right', analog: number, click: number}>} input codes
 */
export function dualStageTriggers(session) {
  const infos = session.static.input?.input_info || [];
  return [['LT', 'left'], ['RT', 'right']]
    .map(([key, side]) => ({ side, analog: codeOf(`${key}_ANALOG`), click: codeOf(key) }))
    .filter((p) => infos[p.analog]?.input_type === INPUT_TYPE.HOVER && infos[p.click]?.input_type === INPUT_TYPE.DIGITAL);
}

/**
 * Trigger travel diagram (few words, so it reads the same in every language).
 * mode 'calibrate': press down to the membrane (green), stop at the line, never into the click (red).
 * mode 'check':     1 down to the membrane, 2 on through to the click; both are wanted.
 * An animated marker shows the motion (still with prefers-reduced-motion). Styles: input.css.
 */
export function triggerDiagram(mode) {
  const W = 360; const STOP = 220; const END = 330; const X0 = 30; const Y = 46;
  const cal = mode === 'calibrate';
  const svg = `
<svg viewBox="0 0 ${W} 74" class="tdiag-svg" aria-hidden="true">
  <defs><pattern id="td-hatch-${mode}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="8" height="8" class="td-click-bg"/><line x1="0" y1="0" x2="0" y2="8" class="td-hatch"/></pattern></defs>
  <rect x="${X0}" y="${Y - 12}" width="${STOP - X0}" height="24" rx="6" class="td-ok"/>
  <rect x="${STOP}" y="${Y - 12}" width="${END - STOP}" height="24" rx="6" ${cal ? `fill="url(#td-hatch-${mode})" class="td-bad"` : 'class="td-click"'}/>
  <line x1="${STOP}" y1="${Y - 22}" x2="${STOP}" y2="${Y + 22}" class="td-stop"/>
  <circle cx="${X0}" cy="${Y}" r="5" class="td-rest"/>
  <g class="td-mark td-${mode}"><path d="M0 ${Y - 30} l-9 -14 h18 z" class="td-arrow"/></g>
  <text x="${(X0 + STOP) / 2}" y="${Y + 5}" class="td-sym">${cal ? '✓' : '1'}</text>
  <text x="${(STOP + END) / 2}" y="${Y + 5}" class="td-sym ${cal ? 'is-bad' : ''}">${cal ? '✕' : '2'}</text>
</svg>`;
  const el = h('div.tdiag');
  el.innerHTML = svg;
  el.append(h('div.tdiag-labels',
    h('span', { style: { left: `${((X0 + STOP) / 2 / W) * 100}%` } }, cal ? t('Press') : t('To the membrane')),
    h('span.is-stop', { style: { left: `${(STOP / W) * 100}%` } }, cal ? t('Stop here') : ''),
    h('span.is-end', { class: cal ? 'is-bad' : null, style: { right: `${((W - END) / W) * 100}%` } }, cal ? t('Don’t click') : t('Then click'))));
  return el;
}
