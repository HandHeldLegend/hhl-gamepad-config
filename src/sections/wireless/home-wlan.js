/**
 * home-wlan.js: The Home WLAN card: the network the controller joins when no HOJA dongle is around,
 * so HHL Gamepad WLAN (the PC app) can use it over the home network.
 *
 * Block `wlan` (wlanConfig_s, firmware with home WLAN support; shown when session.caps.homeWlan):
 *   flags     WLAN_FLAG_HOME_ENABLED; WLAN_FLAG_HAS_PASSWORD (read only); WLAN_FLAG_KEEP_PASSWORD (write only)
 *   ssid      up to 32 bytes of UTF-8
 *   password  write-only: the firmware always reads it back blank and sets HAS_PASSWORD instead
 *
 * The firmware applies the block once the whole write has arrived. Every write here sends the whole
 * form, with KEEP_PASSWORD while the password box is left empty, so a saved password survives a name
 * or on/off change. Never send this block as read: that would erase the saved password. Like every
 * block, the change is live at once and Save keeps it.
 */
import { h, loadStyles } from '../../ui/dom.js';
import { card, badge, field, toggle, textInput, button, asyncButton } from '../../ui/controls.js';
import { confirmDialog, toast } from '../../ui/overlay.js';
import { encodeText, fwDefine } from '../../device/struct.js';
import { ssidText, ssidProblem, passwordProblem } from './info.js';
import { t } from '../../i18n/index.js';

loadStyles(new URL('./wireless.css', import.meta.url));

const HOME_ENABLED = fwDefine('WLAN_FLAG_HOME_ENABLED', 0x01);
const HAS_PASSWORD = fwDefine('WLAN_FLAG_HAS_PASSWORD', 0x02);
const KEEP_PASSWORD = fwDefine('WLAN_FLAG_KEEP_PASSWORD', 0x04);
const SSID_BYTES = 33;
const PASSWORD_BYTES = 65;

export function homeWlanCard(session) {
  const cfg = session.config.wlan;
  const hasPassword = () => !!(cfg.flags & HAS_PASSWORD);
  const stored = () => !!ssidText(cfg.ssid) || hasPassword();

  const status = h('span');
  const problem = h('p.wl-problem', { role: 'alert', hidden: true });
  const showProblem = (text) => { problem.textContent = text || ''; problem.hidden = !text; };

  // The switch sends the whole form too. When the form can't be sent it flips back; a failed send repaints.
  const enable = toggle({ label: t('Join this network'), tone: 'blue',
    onChange: () => apply().then((sent) => { if (!sent) enable.value = !enable.value; }, paint) });
  const name = textInput({ maxLength: 32, placeholder: t('Network name'), ariaLabel: t('Network name') });
  // A plain text box, masked by CSS: browsers offer to save anything typed into a real password field
  const password = textInput({ maxLength: 64, ariaLabel: t('Password') });
  password.name = 'wl-net-key';
  password.autocapitalize = 'off';
  password.setAttribute('autocorrect', 'off');
  password.classList.add('wl-masked');
  name.classList.add('wl-net-input');
  password.classList.add('wl-net-input');
  const showBtn = button({
    label: t('Show'), variant: 'ghost', size: 'sm',
    onClick: () => {
      const shown = password.classList.toggle('wl-masked') === false;
      showBtn.setLabel(shown ? t('Hide') : t('Show'));
      showBtn.setAttribute('aria-pressed', String(shown));
    },
  });
  showBtn.setAttribute('aria-pressed', 'false');
  for (const input of [name, password]) input.addEventListener('input', () => showProblem(null));

  const forgetBtn = button({ label: t('Forget network'), icon: 'trash', variant: 'ghost', size: 'sm', onClick: forget });

  /** Show what the controller has: the name, on/off, and whether a password is saved (never the password). */
  function paint() {
    enable.value = !!(cfg.flags & HOME_ENABLED);
    name.value = ssidText(cfg.ssid);
    password.value = '';
    password.placeholder = hasPassword() ? t('Saved. Leave blank to keep it.') : t('None (open network)');
    forgetBtn.hidden = !stored();
    status.replaceChildren(!stored() ? badge(t('Not set up'))
      : enable.value ? badge(t('On'), 'green') : badge(t('Off')));
  }

  /** Send the form to the controller. Resolves false (and says why) when the form isn't valid. */
  async function apply() {
    const problemText = ssidProblem(name.value) || passwordProblem(password.value);
    showProblem(problemText);
    if (problemText) return false;
    const keep = !password.value && hasPassword();
    const enabled = enable.value;
    cfg.ssid = encodeText(name.value, SSID_BYTES);
    cfg.password = encodeText(password.value, PASSWORD_BYTES);
    cfg.flags = (enabled ? HOME_ENABLED : 0) | (keep ? KEEP_PASSWORD : 0);
    try {
      await session.commit('wlan', { immediate: true });
    } finally {
      // Don't keep the password around: from here on it is only "saved", as the firmware reports it.
      const saved = keep || !!password.value;
      cfg.password = encodeText('', PASSWORD_BYTES);
      cfg.flags = (enabled ? HOME_ENABLED : 0) | (saved ? HAS_PASSWORD : 0);
    }
    await session.refresh('wlan').catch((err) => console.warn('[wireless] home network re-read failed', err?.message || err));
    paint();
    return true;
  }

  async function forget() {
    if (!await confirmDialog({
      title: t('Forget this network?'), confirmLabel: t('Forget'), danger: true,
      message: t('The controller forgets the network name and password and stops joining it. Press Save to keep the change.'),
    })) return;
    try {
      const { status: ok } = await session.command('wlan', 'CLEAR');
      if (!ok) throw new Error('not confirmed');
      await session.refresh('wlan');
      // Re-send what we just read (nothing is left to erase): lights up Save, as the input reset does.
      session.commit('wlan');
      showProblem(null);
      paint();
    } catch (err) {
      console.warn('[wireless] forget network failed', err);
      toast(t('The controller didn’t confirm. Try again.'), { tone: 'red' });
    }
  }

  const el = card({
    title: t('Home WLAN'), icon: 'wireless', tone: 'blue', actions: status,
    subtitle: t('When no HOJA dongle is around, the controller joins this network so HHL Gamepad WLAN on your PC can use it.'),
  },
  field({ label: t('Join this network'), description: t('Only when no HOJA dongle is around.'), control: enable }),
  field({ label: t('Network name'), stacked: true, control: name }),
  field({
    label: t('Password'), stacked: true, control: [password, showBtn],
    tip: t('Leave it empty for an open network. To drop a saved password, forget the network first.'),
  }),
  problem,
  h('div.wl-actions',
    asyncButton({ label: t('Use this network'), icon: 'check', variant: 'tonal', run: apply }),
    forgetBtn));

  paint();
  return el;
}
