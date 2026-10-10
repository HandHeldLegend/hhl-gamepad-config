/**
 * field.js: Render a SettingDef as a labeled, live-bound control.
 *
 *   settingField('haptics.intensity')          // by key
 *   settingField(def, { onChange })            // or by definition
 *
 * Changing the control writes the struct via def.set(), pushes the block to the controller
 * (session.commit) and lights up the Save button. The returned row has `.refresh()` to re-read
 * the struct (e.g. after a block was re-requested); refreshSettings(root) does it for a subtree.
 */
import { session } from '../device/session.js';
import { getSetting } from './schema.js';
import { field, slider, toggle, segmented, select, colorField, textInput } from '../ui/controls.js';
import { t } from '../i18n/index.js';
import { fitUtf8 } from '../device/struct.js';

/**
 * @param {string|import('./schema.js').SettingDef} keyOrDef
 * @param {{onChange?: (value:any)=>void, tone?: string, label?: string, description?: string,
 *          control?: 'segmented'|'select'|'slider', stacked?: boolean, tip?: false}} [o]  `tip: false` hides the definition's ? bubble.
 */
export function settingField(keyOrDef, o = {}) {
  const def = typeof keyOrDef === 'string' ? getSetting(keyOrDef) : keyOrDef;
  if (!def) throw new Error(`Unknown setting ${keyOrDef}`);

  const write = (value) => {
    def.set(session, value);
    session.commit(def.block);
    o.onChange?.(value);
  };

  let control;
  const value = def.get(session);
  switch (def.type) {
    case 'number':
      control = slider({ min: def.min, max: def.max, step: def.step, value, unit: def.unit && t(def.unit), tone: o.tone, ariaLabel: t(def.label), onChange: write });
      break;
    case 'boolean':
      control = toggle({ checked: value, label: t(def.label), tone: o.tone, onChange: write });
      break;
    case 'enum': {
      const options = def.options.map((opt) => ({ ...opt, label: t(opt.label) }));
      control = (o.control === 'select' || def.options.length > 5)
        ? select({ options, value, ariaLabel: t(def.label), onChange: write })
        : segmented({ options, value, tone: o.tone, ariaLabel: t(def.label), onChange: write });
      break;
    }
    case 'color':
      control = colorField({ value, ariaLabel: t(def.label), onChange: write });
      break;
    case 'text':
      // maxLength is the controller's byte budget (UTF-8), so 24 holds 24 Latin letters but only 8 CJK
      // characters. The input caps characters; on commit the text is cut to what fits in the bytes,
      // and the box shows exactly what was stored. (Not per keystroke: that would break IME input.)
      control = textInput({
        value, maxLength: def.maxLength, placeholder: def.placeholder && t(def.placeholder), ariaLabel: t(def.label),
        onChange: (v) => {
          const fit = def.maxLength ? fitUtf8(v, def.maxLength) : v;
          if (fit !== v) control.value = fit;
          write(fit);
        },
      });
      break;
    default:
      throw new Error(`Unsupported setting type ${def.type}`);
  }

  const row = field({
    // Setting text is English data (Node-importable); translate at render time.
    label: o.label || t(def.label),
    description: o.description ?? (def.description && t(def.description)),
    tip: o.tip === false ? null : (def.tip && t(def.tip)),
    control,
    stacked: o.stacked,
    settingKey: def.key,
  });
  row.refresh = () => { control.value = def.get(session); };
  row.control = control;
  return row;
}

/** Re-read every bound setting row inside `root`. */
export function refreshSettings(root) {
  for (const row of root.querySelectorAll('[data-setting]')) row.refresh?.();
}
