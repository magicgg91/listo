// Textes de public/js/repeat.js et public/js/due-time.js (répétition, heure), en français.
// Chaque nom commence par « repetition. ».

export default {
  // Choix « Se répète »
  'repetition.choix.jamais': 'Jamais',
  'repetition.choix.jour': 'Chaque jour',
  'repetition.choix.semaine': 'Chaque semaine',
  'repetition.choix.deuxSemaines': 'Toutes les 2 semaines',
  'repetition.choix.mois': 'Chaque mois',
  'repetition.choix.annee': 'Chaque année',

  // Jours de la semaine : nom court (pastilles) et nom entier
  'repetition.jour.court.lundi': 'Lu',
  'repetition.jour.court.mardi': 'Ma',
  'repetition.jour.court.mercredi': 'Me',
  'repetition.jour.court.jeudi': 'Je',
  'repetition.jour.court.vendredi': 'Ve',
  'repetition.jour.court.samedi': 'Sa',
  'repetition.jour.court.dimanche': 'Di',
  'repetition.jour.lundi': 'lundi',
  'repetition.jour.mardi': 'mardi',
  'repetition.jour.mercredi': 'mercredi',
  'repetition.jour.jeudi': 'jeudi',
  'repetition.jour.vendredi': 'vendredi',
  'repetition.jour.samedi': 'samedi',
  'repetition.jour.dimanche': 'dimanche',

  // Rang dans le mois (« le 1er lundi », « le dernier vendredi »)
  'repetition.rang.premier': '1er',
  'repetition.rang.deuxieme': '2e',
  'repetition.rang.troisieme': '3e',
  'repetition.rang.quatrieme': '4e',
  'repetition.rang.dernier': 'dernier',

  // Phrase sous le choix (fiche)
  'repetition.phrase.jour': 'Chaque jour',
  'repetition.phrase.annee': 'Chaque année',
  'repetition.phrase.moisSemaine': 'Le {rang} {jour} de chaque mois',
  'repetition.phrase.mois': { '=1': 'Le 1er de chaque mois', other: 'Le {count} de chaque mois' },
  // Du 29 au 31 (ordinal en anglais : « 29th », « 31st »)
  'repetition.phrase.moisFin': { one: 'Le {count} de chaque mois (ou le dernier jour du mois)', other: 'Le {count} de chaque mois (ou le dernier jour du mois)' },
  'repetition.phrase.semaine': 'Chaque {jours}',
  'repetition.phrase.deuxSemaines': 'Toutes les 2 semaines, le {jours}',

  // Pastille de la ligne
  'repetition.pastille.jour': 'Chaque jour',
  'repetition.pastille.annee': 'Chaque année',
  'repetition.pastille.moisSemaine': '{rang} {jour}',
  'repetition.pastille.dernier': 'Dernier',
  'repetition.pastille.mois': { '=1': 'Le 1er', other: 'Le {count}' },
  'repetition.pastille.deuxSemaines': '2 sem. · {jours}',

  // Rappels proposés
  'repetition.rappel.aucun': 'Aucun',
  'repetition.rappel.aLHeure': 'À l\'heure',
  'repetition.rappel.quinzeMinutes': '15 min avant',
  'repetition.rappel.trenteMinutes': '30 min avant',
  'repetition.rappel.uneHeure': '1 h avant',
  'repetition.rappel.deuxHeures': '2 h avant',
  'repetition.rappel.veille': 'La veille (24 h avant)',
};
