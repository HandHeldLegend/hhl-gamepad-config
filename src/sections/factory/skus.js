/**
 * skus.js: Color SKUs for the factory station. Picking one writes these four colors to the controller's
 * Switch Pro Controller color fields (gamepad.bodyColor / buttonsColor / leftGripColor / rightGripColor),
 * so the Switch draws the controller in its shell color out of the box.
 *
 * Values are '#rrggbb'. PLACEHOLDERS until confirmed against the production color specs: replace them
 * with the official values. Names are product names and stay untranslated.
 */
export const COLOR_SKUS = [
  { id: 'ifixit-blue', label: 'iFixit Blue', body: '#0071ce', buttons: '#f2f2f2', leftGrip: '#0071ce', rightGrip: '#0071ce' },
  { id: 'atomic-purple', label: 'Atomic Purple', body: '#6a4c9c', buttons: '#3b2a63', leftGrip: '#6a4c9c', rightGrip: '#6a4c9c' },
  { id: 'funtastic-orange', label: 'Funtastic Orange', body: '#f26b1d', buttons: '#2b2b2b', leftGrip: '#f26b1d', rightGrip: '#f26b1d' },
  { id: 'transparent-blue-white', label: 'Transparent Blue / White', body: '#4a86d4', buttons: '#ffffff', leftGrip: '#ffffff', rightGrip: '#ffffff' },
  { id: 'ghost-black', label: 'Ghost Black', body: '#2b2b2e', buttons: '#1a1a1a', leftGrip: '#2b2b2e', rightGrip: '#2b2b2e' },
  { id: 'indigo-clear', label: 'Indigo / Clear', body: '#4b3f8c', buttons: '#e9e8ee', leftGrip: '#e6e6ec', rightGrip: '#e6e6ec' },
];

export const getSku = (id) => COLOR_SKUS.find((s) => s.id === id) || null;

/** Builds sold in these SKUs. Other builds have custom shells: the operator picks their four colors. */
export const SKU_BUILDS = new Set(['gcu_2', 'gcu_2s']);

/** Builds whose units carry an FCC ID label on the rear shell (checked by the operator, then logged). */
export const FCC_LABEL_BUILDS = new Set(['gcu_2']);
