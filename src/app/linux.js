/**
 * linux.js (Linux setup guide): one udev rule file that lets the signed-in user open the controller.
 *
 * Linux only lets ordinary users open USB/HID devices that a udev rule allows. Without it, the
 * browser lists the controller but opening it fails with "Access denied". One file covers:
 *   - this app over WebUSB (Switch Pro mode, Steam/SInput modes, RP2040/RP2350 bootloaders), and
 *   - the gamepad modes in games: SDL/Steam read SInput and Switch Pro controllers through hidraw.
 *
 * Browsers don't reveal the distribution, so the guide uses what works on every systemd distro
 * (TAG+="uaccess" grants the logged-in seat user access; the file sorts before 73-seat-late.rules)
 * and lists the known exceptions: Snap Chromium, Flatpak browsers, SteamOS sudo, non-systemd distros.
 * The command uses printf | sudo tee (no heredoc) so it pastes into bash, zsh and fish alike.
 */
import { h } from '../ui/dom.js';
import { button } from '../ui/controls.js';
import { openDialog, toast } from '../ui/overlay.js';
import { t } from '../i18n/index.js';

/** Desktop Linux (not Android or ChromeOS, which handle USB permissions themselves). */
export function isLinux() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || '';
  if (/Android|CrOS/.test(ua) || /Android|Chrome OS/.test(platform)) return false;
  return platform === 'Linux' || /Linux/.test(ua);
}

export const RULES_FILE = '70-hhl-gamepad.rules';
const RULES_PATH = `/etc/udev/rules.d/${RULES_FILE}`;

/** The rule file (keep the USB IDs in sync with USB_FILTERS in src/device/hoja-device.js). */
export const UDEV_RULES = [
  '# HHL / HOJA gamepads: browser config app (WebUSB) and gamepad modes in games (hidraw).',
  '# https://handheldlegend.github.io/hoja3/',
  '# Config app over WebUSB: Switch Pro mode, Steam (SInput) modes, RP2040/RP2350 bootloaders',
  'SUBSYSTEM=="usb", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="2009", TAG+="uaccess"',
  'SUBSYSTEM=="usb", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="10c6|10dd|10df|0003|000f", TAG+="uaccess"',
  '# Gamepad modes in games and Steam (SDL reads these through hidraw)',
  'KERNEL=="hidraw*", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="10c6|10dd|10df", TAG+="uaccess"',
  'KERNEL=="hidraw*", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="2009", TAG+="uaccess"',
  '# Wireless module (ESP32) updates over WebUSB: the CH340 USB serial chip',
  'SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7522", TAG+="uaccess"',
];

/** One paste-able command: write the file, reload udev, re-apply to plugged-in devices. */
export function installCommand() {
  const lines = UDEV_RULES.map((l) => `'${l}'`).join(' \\\n  ');
  return `printf '%s\\n' \\\n  ${lines} \\\n  | sudo tee ${RULES_PATH} > /dev/null\n`
    + 'sudo udevadm control --reload-rules && sudo udevadm trigger';
}

/** A <pre> with a Copy button. */
function codeBlock(text, label) {
  const copy = button({
    label: t('Copy'), icon: 'copy', size: 'sm', variant: 'tonal',
    onClick: async () => {
      try { await navigator.clipboard.writeText(text); toast(t('Copied'), { tone: 'green' }); }
      catch { toast(t('Couldn’t copy. Select the text and copy it yourself.'), { tone: 'red' }); }
    },
  });
  return h('div.code-copy', h('pre', { tabindex: '0', 'aria-label': label }, h('code', text)), copy);
}

function downloadRules() {
  const url = URL.createObjectURL(new Blob([`${UDEV_RULES.join('\n')}\n`], { type: 'text/plain' }));
  const a = h('a', { href: url, download: RULES_FILE });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The Linux setup dialog. */
export function explainLinux() {
  const note = (title, ...body) => h('li', h('strong', title), ' ', ...body);
  return openDialog({
    title: t('Set up Linux for your controller'), icon: 'usb', tone: 'blue', wide: true,
    body: [
      h('p', t('Linux only lets your account open USB devices that a udev rule allows. Without one, the controller shows up in the browser’s list but won’t connect (“Access denied”).')),
      h('p', t('This one-time rule covers this app and the controller’s Steam (SInput) and Switch modes in games and Steam. Browsers can’t tell which Linux distribution you use, so it’s written to work on all the common ones: Ubuntu, Fedora, Arch, SteamOS, Mint, Pop!_OS, openSUSE and more.')),
      h('ol.linux-steps',
        h('li', t('Open a terminal, paste this and press Enter. It asks for your password.'),
          codeBlock(installCommand(), t('Command that installs the udev rule'))),
        h('li', t('Unplug the controller and plug it back in (hold A or B to start it in config mode), then press Connect again.'))),
      h('details.linux-notes',
        h('summary', t('Special cases')),
        h('ul',
          note(t('Steam Deck / SteamOS:'), t('use Desktop Mode. If sudo says you have no password, run passwd first to set one.')),
          note(t('Chromium from the Snap Store (Ubuntu’s default):'), t('also run'), ' ', h('code', 'sudo snap connect chromium:raw-usb'), '.'),
          note(t('Flatpak browsers:'), t('give the browser USB access, for example'), ' ', h('code', 'flatpak override --user --device=all com.google.Chrome'), '.'),
          note(t('Without systemd (Void, Alpine, Gentoo with OpenRC):'), t('replace TAG+="uaccess" with MODE="0666" in the file.')),
          note(t('Prefer a file?'), t('Download it and copy it to {path}, then run the udevadm line above.', { path: RULES_PATH })))),
    ],
    actions: [
      { label: t('Download rules file'), icon: 'download', variant: 'ghost', keepOpen: true, onClick: () => { downloadRules(); } },
      { label: t('Done'), variant: 'primary' },
    ],
  });
}
