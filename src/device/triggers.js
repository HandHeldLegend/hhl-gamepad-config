/**
 * triggers.js: Mechanical triggers (GCU 1 / GCU R4K). A mechanical trigger is a click with no travel:
 * its analog input (LT_ANALOG / RT_ANALOG) reads 0, and the click keeps its own mapping (or, unmapped,
 * presses the analog trigger's mapping fully). Firmware reports support in the device static block
 * (mechanical_triggers_supported) and keeps the setting in the hover block, for the whole controller:
 *
 *   trigger_hw_version   TRIGGER_HW_VERSION when valid (older firmware leaves 0xFF: unsupported)
 *   trigger_hw[0|1]      left, right. Bits 0-1: the owner's choice (Auto, Analog, Mechanical).
 *                        Bit 7: what the controller found from use (firmware owned: written back as read).
 *
 * A side counts as mechanical when the choice is Mechanical, or Auto and found mechanical. On Auto the
 * controller works it out: 5 clicks with no travel make it mechanical, 2 full pulls analog again.
 */
import { fwDefine, LAYOUT } from './struct.js';

const VERSION = fwDefine('TRIGGER_HW_VERSION', 1);
const CHOICE_MASK = fwDefine('TRIGGER_HW_CHOICE_MASK', 3);
const DETECTED = fwDefine('TRIGGER_HW_DETECTED_MECHANICAL', 0x80);

export const TRIGGER_CHOICE = {
  AUTO: fwDefine('TRIGGER_HW_AUTO', 0),
  ANALOG: fwDefine('TRIGGER_HW_ANALOG', 1),
  MECHANICAL: fwDefine('TRIGGER_HW_MECHANICAL', 2),
};

/** The two sides: index into trigger_hw, and the input code keys of the click and the analog input. */
export const TRIGGER_SIDES = [
  { side: 'left', index: 0, click: 'LT', analog: 'LT_ANALOG' },
  { side: 'right', index: 1, click: 'RT', analog: 'RT_ANALOG' },
];

/** Whether this controller has the setting (supporting firmware, and a block it has filled in). */
export function triggersSupported(session) {
  return !!session.static?.device?.mechanical_triggers_supported && session.config?.hover?.trigger_hw_version === VERSION;
}

/**
 * One side's state: { choice, detected, mechanical, mismatch }. mismatch: 'mechanical' when forced
 * Analog but it clicks without moving, 'analog' when forced Mechanical but it moves; else null.
 */
export function triggerState(session, index) {
  if (!triggersSupported(session)) return { choice: TRIGGER_CHOICE.AUTO, detected: false, mechanical: false, mismatch: null };
  const b = session.config.hover.trigger_hw[index] ?? 0;
  const choice = b & CHOICE_MASK;
  const detected = !!(b & DETECTED);
  const mechanical = choice === TRIGGER_CHOICE.MECHANICAL || (choice === TRIGGER_CHOICE.AUTO && detected);
  const mismatch = choice === TRIGGER_CHOICE.ANALOG && detected ? 'mechanical'
    : choice === TRIGGER_CHOICE.MECHANICAL && !detected ? 'analog' : null;
  return { choice, detected, mechanical, mismatch };
}

/** The sides that count as mechanical now, e.g. [{ side: 'left', click: 'LT', analog: 'LT_ANALOG', ... }]. */
export const mechanicalSides = (session) => TRIGGER_SIDES.filter((s) => triggerState(session, s.index).mechanical);

/** A key that changes whenever a side starts or stops counting as mechanical (to rebuild views). */
export const mechanicalKey = (session) => mechanicalSides(session).map((s) => s.side).join(',');

/**
 * Keep the finding current while a view shows it: ask for the block fingerprints every `ms` and read
 * the hover block again only when its CRC changes (the firmware saves the finding when it changes, so
 * the CRC moves exactly then). Firmware without fingerprints gets the block read every time. `paused()`
 * skips a round (a hover change waiting to be sent, calibrating). onRead runs after each read.
 * @returns {() => void} stop
 */
export function watchTriggers(session, onRead, { ms = 1000, paused = () => false } = {}) {
  const index = LAYOUT.blocks.config.find((b) => b.key === 'hover')?.index;
  let last;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || paused() || !session.connected) return;
    busy = true;
    try {
      const crcs = await session.configFingerprints();
      const crc = crcs?.[index];
      if (crc != null && crc === last) return;
      last = crc;
      await session.refresh('hover');
      onRead();
    } catch { /* the next round asks again */ } finally {
      busy = false;
    }
  }, ms);
  return () => clearInterval(timer);
}

/**
 * Set one side's choice. The block is read first, so the firmware's finding (bit 7) is current and
 * kept; only bits 0-1 change. Then written and saved like any hover block change.
 */
export async function setTriggerChoice(session, index, choice) {
  await session.flush();
  await session.refresh('hover');
  const hover = session.config.hover;
  const hw = hover.trigger_hw;
  hw[index] = (hw[index] & ~CHOICE_MASK & 0xff) | (choice & CHOICE_MASK);
  hover.trigger_hw = hw;
  await session.commit('hover', { immediate: true });
  return session.save();
}

// ---- Checked once ----------------------------------------------------------------------------
// The controller keeps its finding, but not whether its owner went through the check. This browser
// remembers that per controller (its Bluetooth address), so the Input page asks only until it's done.

const CHECKED_KEY = 'hhl-config:triggers-checked';
const unitKey = (session) => {
  const mac = session.config?.gamepad?.gamepad_mac_address;
  return mac ? Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('') : null;
};
function loadChecked() {
  try { const v = JSON.parse(localStorage.getItem(CHECKED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Whether the Input page should ask for the trigger check: supported, a side on Auto, never checked here. */
export function needsTriggerCheck(session) {
  if (!triggersSupported(session)) return false;
  if (!TRIGGER_SIDES.some((s) => triggerState(session, s.index).choice === TRIGGER_CHOICE.AUTO)) return false;
  const key = unitKey(session);
  return !!key && !loadChecked().includes(key);
}

/** Remember that this controller's triggers were checked (the last 32 controllers). */
export function markTriggersChecked(session) {
  const key = unitKey(session);
  if (!key) return;
  const list = [key, ...loadChecked().filter((k) => k !== key)].slice(0, 32);
  try { localStorage.setItem(CHECKED_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}
