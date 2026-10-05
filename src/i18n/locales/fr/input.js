/**
 * French (France/international) translations — input. English source text → translation.
 * Machine-drafted; NEEDS NATIVE REVIEW. Terminology: src/i18n/GLOSSARY.md.
 */
export default {
  // ---- Page, tabs, mode card (view.js) ----
  "Remap": "Réassigner",
  "Analog calibration": "Calibrage analogique",
  "Output mode": "Mode de sortie",
  "{mode} mode": "Mode {mode}",
  "{mode}:": "{mode} :",
  "Each mode has its own layout. Pick the one you play in, then tap a button below to change it.":
    "Chaque mode a sa propre configuration. Choisissez celui dans lequel vous jouez, puis touchez un bouton ci-dessous pour le modifier.",
  "Reset this mode": "Réinitialiser ce mode",
  "Reset {mode}": "Réinitialiser {mode}",
  "Reset all modes": "Réinitialiser tous les modes",
  "Quickly reset this mode to its default layout.": "Rétablit rapidement la configuration par défaut de ce mode.",
  "Reset every mode?": "Réinitialiser tous les modes ?",
  "Reset {mode} mode?": "Réinitialiser le mode {mode} ?",
  "All six layouts go back to this controller's defaults. Your changes in every mode are lost.":
    "Les six configurations reviennent aux valeurs par défaut de cette manette. Vos modifications dans tous les modes seront perdues.",
  "Every input in {mode} mode goes back to this controller's default layout and settings. Other modes are not affected.":
    "Toutes les entrées du mode {mode} reviennent à la configuration et aux réglages par défaut de cette manette. Les autres modes ne sont pas affectés.",
  "All modes reset to defaults — press Save to keep it.": "Tous les modes ont été réinitialisés — appuyez sur Enregistrer pour conserver ce changement.",
  "{mode} mode reset to defaults — press Save to keep it.": "Le mode {mode} a été réinitialisé — appuyez sur Enregistrer pour conserver ce changement.",
  "The controller did not confirm the reset. Try again.": "La manette n’a pas confirmé la réinitialisation. Réessayez.",
  "Reset": "Réinitialiser",
  "Done": "Terminé",
  "Save": "Enregistrer",
  "Cancel": "Annuler",
  "This controller doesn't have a {mode} connection, so this layout is only kept for completeness.":
    "Cette manette n’a pas de connexion {mode} ; cette configuration n’est conservée que pour que le profil soit complet.",

  // ---- Mode descriptions (mapping.js) ----
  "Nintendo Switch, and Switch Pro mode on PC.": "Nintendo Switch, et mode Switch Pro sur PC.",
  "Windows PCs and Xbox-style games.": "PC Windows et jeux de type Xbox.",
  "SNES / NES consoles through the controller port.": "Consoles SNES / NES via le port manette.",
  "Nintendo 64 through the controller port.": "Nintendo 64 via le port manette.",
  "GameCube / Wii through the controller port, and GameCube adapter (Slippi) mode over USB.":
    "GameCube / Wii via le port manette, et mode adaptateur GameCube (Slippi) en USB.",
  "Steam mode for Steam and SDL games on PC (supports paddles and extra buttons).":
    "Mode Steam pour les jeux Steam et SDL sur PC (prend en charge les palettes et les boutons supplémentaires).",

  // ---- Input grid ----
  "Buttons & inputs": "Boutons et entrées",
  "What each input sends.": "Ce que chaque entrée envoie.",
  "What each input sends in {mode} mode. Pressed inputs light up.": "Ce que chaque entrée envoie en mode {mode}. Les entrées pressées s’allument.",
  "Buttons": "Boutons",
  "Analog inputs": "Entrées analogiques",
  "Stick directions": "Directions du joystick",
  "Inputs that measure how far they are pressed, such as analog triggers (the sensor type depends on your controller). They can act as a button with an adjustable activation point, as rapid trigger, or as a full analog output.":
    "Entrées qui mesurent jusqu’où elles sont enfoncées, comme les gâchettes analogiques (le type de capteur dépend de votre manette). Elles peuvent servir de bouton avec un point d’activation réglable, de rapid trigger ou de sortie entièrement analogique.",
  "Each stick direction can be sent somewhere else too — for example to the d-pad or a button.":
    "Chaque direction du joystick peut aussi être envoyée ailleurs — par exemple vers la croix directionnelle ou un bouton.",
  "This controller did not report any remappable inputs.": "Cette manette n’a signalé aucune entrée réassignable.",
  "{input} sends {output} in {mode} mode.": "{input} envoie {output} en mode {mode}.",
  "{input} is off in {mode} mode.": "{input} est désactivé en mode {mode}.",
  "Threshold mode, activation point {value}.": "Mode seuil, point d’activation {value}.",
  "Rapid trigger mode.": "Mode rapid trigger.",
  "Full analog mode.": "Mode entièrement analogique.",
  "Threshold {value}": "Seuil {value}",
  "Rapid": "Rapid",
  "Analog inputs need calibration.": "Les entrées analogiques doivent être calibrées.",
  "Calibrate them so presses register across their full travel.": "Calibrez-les pour que les appuis soient détectés sur toute leur course.",
  "Calibrate now": "Calibrer maintenant",
  "Needs calibration": "À calibrer",
  "Close editor": "Fermer l’éditeur",

  // ---- Editor (editor.js) ----
  "{input} in {mode} mode": "{input} en mode {mode}",
  "sends in {mode} mode": "envoie en mode {mode}",
  "Change": "Modifier",
  "Nothing": "Rien",
  "Input disabled in this mode": "Entrée désactivée dans ce mode",
  "Send in {mode} mode": "Envoyer en mode {mode}",
  "Outputs in {mode} mode": "Sorties en mode {mode}",
  "None": "Aucune",
  "Disable this input in this mode": "Désactiver cette entrée dans ce mode",
  "used by {inputs}": "utilisé par {inputs}",
  "D-pad": "Croix directionnelle",
  "Analog triggers": "Gâchettes analogiques",
  "Live": "En direct",
  "What the controller reports for this input with the current settings. Press it to test.":
    "Ce que la manette transmet pour cette entrée avec les réglages actuels. Appuyez dessus pour tester.",
  "{input} live value": "Valeur en direct de {input}",
  "Pressed": "Appuyé",
  "Released": "Relâché",
  "Mode": "Mode",
  "Analog mode": "Mode analogique",
  "Presses as soon as it moves down, and releases as soon as it starts coming back up — great for fast repeated presses.":
    "S’active dès qu’elle descend et se relâche dès qu’elle commence à remonter — idéal pour des appuis rapides et répétés.",
  "Counts as pressed once it passes the activation point, like a normal button with an adjustable trigger point.":
    "Compte comme appuyé une fois le point d’activation franchi, comme un bouton normal avec un point de déclenchement réglable.",
  "Sends the full analog travel, so games see exactly how far it is pressed.":
    "Envoie toute la course analogique, pour que les jeux sachent exactement jusqu’où elle est enfoncée.",
  "Pick an output to set how this analog input behaves.": "Choisissez une sortie pour définir le comportement de cette entrée analogique.",
  "Rapid trigger sensitivity": "Sensibilité du rapid trigger",
  "Activation point": "Point d’activation",
  "How far it has to travel to change state: down this much to press, back up this much to release. Smaller = quicker re-presses, but more sensitive to light touches.":
    "La course nécessaire pour changer d’état : descendre de cette distance pour appuyer, remonter d’autant pour relâcher. Plus petit = appuis répétés plus rapides, mais plus sensible aux effleurements.",
  "How far you press before it counts. {half} is halfway down.": "Jusqu’où appuyer pour que l’appui compte. {half} correspond à mi-course.",
  "Travel needed to press or release.": "Course nécessaire pour appuyer ou relâcher.",
  "How far down it must go to count as pressed.": "Jusqu’où elle doit descendre pour compter comme appuyée.",
  "Output when pressed": "Sortie à l’appui",
  "How far {output} is pushed when this input fires.": "Intensité de {output} quand cette entrée se déclenche.",
  "In GameCube mode, analog triggers driven this way always output at least {min} (the console's resting minimum).":
    "En mode GameCube, les gâchettes analogiques pilotées ainsi envoient toujours au moins {min} (le minimum au repos de la console).",
  "Copy settings": "Copier les réglages",
  "Paste settings": "Coller les réglages",
  "Copy this input's mode and values, then paste them onto another analog input.":
    "Copiez le mode et les valeurs de cette entrée, puis collez-les sur une autre entrée analogique.",
  "Settings copied — open another analog input and press Paste.": "Réglages copiés — ouvrez une autre entrée analogique et appuyez sur Coller les réglages.",
  "Settings copied inside the app (clipboard access was blocked).": "Réglages copiés dans l’app (l’accès au presse-papiers a été bloqué).",
  "Nothing to paste — copy an analog input's settings first.": "Rien à coller — copiez d’abord les réglages d’une entrée analogique.",
  "Settings pasted.": "Réglages collés.",
  "Calibration": "Calibrage",
  "Calibrate": "Calibrer",
  "Finish": "Terminer",
  "Calibrating all…": "Calibrage de tout…",
  "Press Calibrate, push it all the way down and release 3–4 times, then press Finish.":
    "Appuyez sur Calibrer, enfoncez l’entrée à fond et relâchez-la 3 ou 4 fois, puis appuyez sur Terminer.",

  // ---- Input / output kinds and analog modes (mapping.js) ----
  "Button": "Bouton",
  "Analog": "Analogique",
  "Stick direction": "Direction du joystick",
  "Off": "Désactivé",
  "Disabled": "Désactivé",
  "Analog trigger": "Gâchette analogique",
  "Rapid trigger": "Rapid trigger",
  "Threshold": "Seuil",
  "Full analog": "Entièrement analogique",

  // ---- Output names (descriptive ones; printed button names stay as-is) ----
  "D Up": "Croix haut",
  "D Down": "Croix bas",
  "D Left": "Croix gauche",
  "D Right": "Croix droite",
  "Plus": "Bouton +",
  "Minus": "Bouton −",
  "Capture": "Capture",
  "Back": "Retour",
  "Guide": "Guide",
  "Share": "Partager",
  "South": "Sud",
  "East": "Est",
  "West": "Ouest",
  "North": "Nord",
  "C Up": "C haut",
  "C Down": "C bas",
  "C Left": "C gauche",
  "C Right": "C droite",
  "S Guide": "Guide S",

  // ---- Output hints ----
  "Left trigger (analog)": "Gâchette gauche (analogique)",
  "Right trigger (analog)": "Gâchette droite (analogique)",
  "L trigger (analog)": "Gâchette L (analogique)",
  "R trigger (analog)": "Gâchette R (analogique)",
  "L trigger click (digital)": "Clic de la gâchette L (numérique)",
  "R trigger click (digital)": "Clic de la gâchette R (numérique)",
  "Left trigger (digital)": "Gâchette gauche (numérique)",
  "Right trigger (digital)": "Gâchette droite (numérique)",
  "Left paddle 1": "Palette gauche 1",
  "Right paddle 1": "Palette droite 1",
  "Left paddle 2": "Palette gauche 2",
  "Right paddle 2": "Palette droite 2",
  "Misc 3 (power)": "Divers 3 (alimentation)",
  "Misc 4": "Divers 4",
  "Misc 5": "Divers 5",
  "Misc 6": "Divers 6",
  "Touchpad 1": "Pavé tactile 1",
  "Touchpad 2": "Pavé tactile 2",
  "Stick left": "Joystick gauche",
  "Stick right": "Joystick droit",

  // ---- Calibration tab (calibration.js) ----
  "Teach the controller the full travel of its analog inputs, such as triggers.":
    "Apprenez à la manette la course complète de ses entrées analogiques, comme les gâchettes.",
  "Start calibration": "Lancer le calibrage",
  "Finish calibration": "Terminer le calibrage",
  "Press {button}.": "Appuyez sur {button}.",
  "Fully press and release every analog input below 3–4 times.": "Enfoncez à fond puis relâchez chaque entrée analogique ci-dessous 3 ou 4 fois.",
  "Check each bar now reaches both ends, then press {button}.": "Vérifiez que chaque barre atteint maintenant les deux extrémités, puis appuyez sur {button}.",
  "Calibrating.": "Calibrage en cours.",
  "Fully press and release every analog input 3–4 times, then press Finish.":
    "Enfoncez à fond puis relâchez chaque entrée analogique 3 ou 4 fois, puis appuyez sur Terminer le calibrage.",
  "Calibrating…": "Calibrage…",
  "Calibrated": "Calibré",
  "Range {min}–{max}": "Plage {min}–{max}",
  "Not calibrated": "Non calibré",
  "This controller has no analog inputs to calibrate.": "Cette manette n’a aucune entrée analogique à calibrer.",
  "The controller did not start calibrating. Try again.": "La manette n’a pas démarré le calibrage. Réessayez.",
  "Calibration finished — press Save to keep it.": "Calibrage terminé — appuyez sur Enregistrer pour le conserver.",
  "The controller did not confirm the calibration.": "La manette n’a pas confirmé le calibrage.",
};
