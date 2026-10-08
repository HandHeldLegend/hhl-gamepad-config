/**
 * What's new: the firmware changelog (CHANGELOG.md from hoja-device-fw), newest first.
 * Deep link: #/whats-new?changes=<section id> opens it filtered.
 */
import { h } from '../../ui/dom.js';
import { whatsNewCard, WHATS_NEW_CSS } from './changelog-card.js';

export function mount(root, { session, params = {} }) {
  const list = whatsNewCard({ session, params });
  root.append(h('style', WHATS_NEW_CSS), list);
  return session.on('state', () => list.refresh());
}
