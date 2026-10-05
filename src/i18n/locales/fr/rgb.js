/**
 * French translations (rgb). English source text → translation.
 * Machine-drafted; NEEDS NATIVE REVIEW. Terminology: src/i18n/GLOSSARY.md.
 */

/** Per-group color settings ("Group 1 color" … "Group 32 color") are generated, like rgb/settings.js. */
const groupColors = {};
for (let i = 1; i <= 32; i++) { // RGB_MAX_GROUPS
  groupColors[`Group ${i} color`] = `Couleur du groupe ${i}`;
  groupColors[`Color of LED group ${i} as listed on the RGB page (group names and count depend on the controller, e.g. "D-Pad" or "A").`] =
    `Couleur du groupe de LED ${i} tel qu’il apparaît sur la page RGB (le nom et le nombre de groupes dépendent de la manette, p. ex. « D-Pad » ou « A »).`;
}

export default {
  ...groupColors,

  // Lighting
  'Lighting': 'Éclairage',
  'Pick an effect. The preview shows roughly how it looks.': 'Choisissez un effet ; l’aperçu montre à peu près son rendu.',
  'Preview of the selected lighting effect': 'Aperçu de l’effet d’éclairage sélectionné',
  'Effect': 'Effet',
  'Lighting effect: Authentic (classic face-button colors for the output mode; called Chroma in older apps), Static (your colors), Rainbow, React (flash on press) or Fairy (blend between your first six colors).': 'Effet d’éclairage : Authentique (couleurs classiques des boutons de façade selon le mode de sortie ; appelé Chroma dans les anciennes applications), Fixe (vos couleurs), Arc-en-ciel, Réactif (flash à l’appui) ou Féerie (fondu entre vos six premières couleurs).',
  'Authentic': 'Authentique',
  'Static': 'Fixe',
  'Rainbow': 'Arc-en-ciel',
  'React': 'Réactif',
  'Fairy': 'Féerie',
  'Face buttons light up in the classic colors of the current output mode (Switch/SNES: A red, B yellow, X blue, Y green) and follow your remaps; other LEDs glow soft white. Your colors are only used for the player LEDs.': 'Les boutons de façade s’allument dans les couleurs classiques du mode de sortie actuel (Switch/SNES : A rouge, B jaune, X bleu, Y vert) et suivent vos réassignations ; les autres LED brillent d’un blanc doux. Vos couleurs ne servent qu’aux LED de joueur.',
  'Each group glows steadily in the color you pick below.': 'Chaque groupe brille en continu dans la couleur choisie ci-dessous.',
  'All LEDs (except the player LEDs) fade together through the colors of the rainbow. Animation time sets how long each color step takes.': 'Toutes les LED (sauf celles de joueur) passent ensemble par les couleurs de l’arc-en-ciel. La durée d’animation définit le temps de chaque étape de couleur.',
  'Lights flash on in your colors when you press an input, then fade out over the animation time. The player LEDs stay lit in their color.': 'Les lumières s’allument dans vos couleurs à chaque appui, puis s’estompent pendant la durée d’animation. Les LED de joueur restent allumées dans leur couleur.',
  'Every LED (except the player LEDs) slowly blends between the first six colors below, like fairy lights.': 'Chaque LED (sauf celles de joueur) passe lentement d’une des six premières couleurs ci-dessous à l’autre, comme une guirlande lumineuse.',
  'This controller is using an effect this app doesn’t know about.': 'Cette manette utilise un effet que cette application ne connaît pas.',

  // Brightness & timing
  'Brightness & timing': 'Luminosité et durée',
  'Changes apply instantly. Press Save to keep them.': 'Les modifications s’appliquent immédiatement ; appuyez sur Enregistrer pour les conserver.',
  'Brightness': 'Luminosité',
  'How bright the LEDs are, from off to full.': 'La luminosité des LED, d’éteintes à maximale.',
  'To save battery, the controller limits brightness to about a third while connected wirelessly.': 'Pour économiser la batterie, la manette limite la luminosité à environ un tiers en connexion sans fil.',
  'Animation time': 'Durée d’animation',
  'How long one animation step or fade takes, in milliseconds. Lower is faster.': 'Durée d’une étape d’animation ou d’un fondu, en millisecondes. Plus la valeur est basse, plus c’est rapide.',
  'ms': 'ms',
  'Idle glow': 'Lueur de veille',
  'After 5 minutes without input the lights go dark and a single LED glows to show battery status. Any input turns it off again. Turn this off to keep it dark too.': 'Après 5 minutes sans action, les lumières s’éteignent et une seule LED reste allumée pour indiquer l’état de la batterie. La moindre action l’éteint de nouveau. Désactivez cette option pour qu’elle reste aussi éteinte.',

  // Colors
  'Colors': 'Couleurs',
  'One color per LED group. Tap a swatch to pick, or type a hex code.': 'Une couleur par groupe de LED. Touchez une pastille pour choisir, ou saisissez un code hexadécimal.',
  'Group {n}': 'Groupe {n}',
  '{name} color': 'Couleur de {name}',
  'Player': 'Joueur',
  'These LEDs also show your player number when connected and chase while pairing, using this color.': 'Ces LED indiquent aussi votre numéro de joueur une fois connecté et défilent pendant l’appairage, dans cette couleur.',
  'Always shows this color, in every mode.': 'Affiche toujours cette couleur, dans tous les modes.',
  'Unused': 'Inutilisé',
  'Fairy {n}': 'Féerie {n}',
  'Authentic mode picks its own colors, so your colors are ignored, except the Player LED.': 'Le mode Authentique choisit ses propres couleurs : les vôtres sont ignorées, sauf celle de la LED de joueur.',
  'Your colors are ignored in Rainbow mode, except the Player LED.': 'En mode Arc-en-ciel, vos couleurs sont ignorées, sauf celle de la LED de joueur.',
  'Fairy mode blends between the first six colors below. The Player LED always keeps its own color.': 'Le mode Féerie fait un fondu entre les six premières couleurs ci-dessous. La LED de joueur garde toujours sa propre couleur.',
  'Quick palettes': 'Palettes rapides',
  'Color presets': 'Couleurs prédéfinies',
  'Ocean': 'Océan',
  'Sunset': 'Coucher de soleil',
  'Lavender': 'Lavande',
  'Snow': 'Neige',
  'Apply the {name} palette': 'Appliquer la palette {name}',
  '{name} colors applied': 'Couleurs {name} appliquées',
  'Undo': 'Annuler',
  'Paste to all': 'Coller partout',
  'Pasting…': 'Collage…',
  'Pasted': 'Collé',
  'No color': 'Aucune couleur',
  'Set every group to a hex color from your clipboard': 'Applique à tous les groupes une couleur hexadécimale de votre presse-papiers',
  'Clipboard access was blocked. Copy a hex color like #FF8800 and try again.': 'L’accès au presse-papiers a été bloqué. Copiez une couleur hexadécimale comme #FF8800 et réessayez.',
  'The clipboard doesn’t contain a hex color like #FF8800.': 'Le presse-papiers ne contient pas de couleur hexadécimale comme #FF8800.',
  'All group colors': 'Couleur de tous les groupes',
  'Set every LED group to the same color at once (like hoja2’s “Paste All”).': 'Applique la même couleur à tous les groupes de LED d’un coup (comme « Paste All » dans hoja2).',
  'On battery': 'Sur batterie',
  'Idle glow colors': 'Couleurs de la lueur de veille',
};
