/**
 * store.js — 3D Platformer preferences, kept per browser in localStorage under 'hhl-config:platformer'.
 * (Not part of the controller settings schema.)
 */
import { STORAGE_KEY } from './constants.js';

const DEFAULTS = {
  tab: 'play',
  showAction: false,   // on-screen readout of the current move (off by default, like the Arena's feedback)
  autoCamera: true,    // camera swings behind the hero while running
  invertX: false,      // right stick X
  invertY: false,      // right stick Y
};

const values = { ...DEFAULTS };
try { Object.assign(values, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { /* private mode */ }

export const store = {
  get: (k) => values[k],
  set(k, v) {
    values[k] = v;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* quota / private mode */ }
  },
};
