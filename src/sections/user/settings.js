/**
 * User settings (userConfig_s). Pure data + pure functions only; imported by Node.
 * Shown on the Gamepad page (`section`); the key keeps its user. prefix so old deep links work.
 */
import { decodeText, encodeText } from '../../device/struct.js';

export default [
  {
    key: 'user.name',
    section: 'gamepad',
    label: 'Player name',
    description: 'Stored on the controller. Up to 24 characters.',
    block: 'user',
    type: 'text', maxLength: 24, placeholder: 'Enter a name…',
    requires: null,
    get: (s) => decodeText(s.config.user.user_name),
    set: (s, v) => { s.config.user.user_name = encodeText(v, 24); },
  },
];
