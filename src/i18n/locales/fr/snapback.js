/**
 * French translations (snapback). English source text → translation.
 * Machine-drafted; NEEDS NATIVE REVIEW. Terminology: src/i18n/GLOSSARY.md.
 */
export default {
  // ---- Shared / generic (duplicated here so this area is complete on its own) ----
  'Left': 'Gauche',
  'Right': 'Droit',
  'Stick': 'Joystick',
  'Left stick': 'Joystick gauche',
  'Right stick': 'Joystick droit',
  'Off': 'Désactivé',
  'View': 'Afficher',

  // ---- View ----
  'Auto watches for the moment you let go and holds back only the rebound. There is no cutoff to tune.': 'Auto détecte le moment où vous relâchez le joystick et ne freine que le rebond ; aucune fréquence de coupure à régler.',
  'Filter off: the stick reports its raw output. Use this to see your stick’s natural snapback.': 'Filtre désactivé : le joystick transmet sa sortie brute. Utilisez ce mode pour voir le snapback naturel de votre joystick.',
  'Snapback filter': 'Filtre anti-snapback',
  'Changes apply instantly. Press Save to keep them.': 'Les modifications s’appliquent immédiatement ; appuyez sur Enregistrer pour les conserver.',
  '{stick}: snapback waveform': '{stick} : forme d’onde du snapback',
  'Flick the right stick…': 'Lâchez d’un coup le joystick droit…',
  'Flick the left stick…': 'Lâchez d’un coup le joystick gauche…',
  'No capture yet': 'Aucune capture pour l’instant',
  'Recent right stick captures': 'Captures récentes du joystick droit',
  'Recent left stick captures': 'Captures récentes du joystick gauche',
  'Waiting for the right stick to be flicked and released.': 'En attente d’un mouvement puis d’un relâchement du joystick droit.',
  'Waiting for the left stick to be flicked and released.': 'En attente d’un mouvement puis d’un relâchement du joystick gauche.',
  'Listening': 'À l’écoute',
  'Overshoot': 'Dépassement',
  'How far the stick swung past center to the other side after release. Lower is better.': 'Jusqu’où le joystick a dépassé le centre, de l’autre côté, après le relâchement. Plus c’est bas, mieux c’est.',
  'Settled': 'Stabilisé en',
  'Time until the stick stays within ±5 % of center.': 'Temps avant que le joystick reste à ±5 % du centre.',
  'Peak +': 'Pic +',
  'Highest value recorded.': 'Valeur la plus haute enregistrée.',
  'Peak −': 'Pic −',
  'Lowest value recorded.': 'Valeur la plus basse enregistrée.',
  '{axis} at {time}': '{axis} à {time}',
  'Analyzer': 'Analyseur',
  'What the right stick does in the 31 ms after you let go.': 'Ce que fait le joystick droit dans les 31 ms qui suivent le relâchement.',
  'What the left stick does in the 31 ms after you let go.': 'Ce que fait le joystick gauche dans les 31 ms qui suivent le relâchement.',
  'Captured': 'Capturé',
  'Flick again to compare. The last few captures stay below the plot.': 'Recommencez pour comparer ; les dernières captures restent sous le graphique.',
  'New right stick capture': 'Nouvelle capture du joystick droit',
  'New left stick capture': 'Nouvelle capture du joystick gauche',
  'How to test:': 'Comment tester :',
  'Push a stick all the way to one side and let it snap back. The controller records the moment it returns and shows it under that stick. Try each filter mode to compare.': 'Poussez un joystick à fond d’un côté et lâchez-le pour qu’il revienne seul. La manette enregistre le moment du retour et l’affiche sous ce joystick. Essayez chaque mode de filtre pour comparer.',

  // ---- Waveform ----
  'Left stick X': 'Joystick gauche X',
  'Left stick Y': 'Joystick gauche Y',
  'Right stick X': 'Joystick droit X',
  'Right stick Y': 'Joystick droit Y',
  'Snapback waveform': 'Forme d’onde du snapback',
  'Waiting for a flick…': 'En attente d’un relâchement…',

  // ---- Settings (settings.js) ----
  'Filter mode': 'Mode de filtre',
  'How the left stick suppresses the rebound past center after you let go.': 'Comment le joystick gauche supprime le rebond au-delà du centre après le relâchement.',
  'How the right stick suppresses the rebound past center after you let go.': 'Comment le joystick droit supprime le rebond au-delà du centre après le relâchement.',
  'Low-pass: smooths fast movement near the center (adjust with the cutoff). Auto: detects a release and holds back the rebound only when it happens. Off: raw stick output. Use this to see your stick’s natural snapback.': 'Passe-bas : lisse les mouvements rapides près du centre (réglable avec la fréquence de coupure). Auto : détecte un relâchement et ne freine le rebond que lorsqu’il se produit. Désactivé : sortie brute du joystick ; utilisez ce mode pour voir le snapback naturel de votre joystick.',
  'Low-pass': 'Passe-bas',
  'Auto': 'Auto',
  'Filter cutoff': 'Fréquence de coupure',
  'Low-pass cutoff frequency for the left stick. Lower = stronger smoothing.': 'Fréquence de coupure du filtre passe-bas du joystick gauche. Plus basse = lissage plus fort.',
  'Low-pass cutoff frequency for the right stick. Lower = stronger smoothing.': 'Fréquence de coupure du filtre passe-bas du joystick droit. Plus basse = lissage plus fort.',
  'Lower values remove more bounce but add a touch of delay to fast flicks near the center; higher values feel snappier but let more rebound through. Default 60 Hz. Only used in Low-pass mode.': 'Les valeurs basses suppriment davantage de rebond mais ajoutent un léger retard aux mouvements rapides près du centre ; les valeurs hautes paraissent plus vives mais laissent passer plus de rebond. 60 Hz par défaut. Utilisé uniquement en mode Passe-bas.',
  'Hz': 'Hz',
};
