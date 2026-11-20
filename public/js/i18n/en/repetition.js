// Textes de public/js/repeat.js et public/js/due-time.js (répétition, heure), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/repetition.js.

export default {
  // Choix « Se répète »
  'repetition.choix.jamais': 'Never',
  'repetition.choix.jour': 'Every day',
  'repetition.choix.semaine': 'Every week',
  'repetition.choix.deuxSemaines': 'Every 2 weeks',
  'repetition.choix.mois': 'Every month',
  'repetition.choix.annee': 'Every year',

  // Jours de la semaine : nom court (pastilles) et nom entier
  'repetition.jour.court.lundi': 'Mon',
  'repetition.jour.court.mardi': 'Tue',
  'repetition.jour.court.mercredi': 'Wed',
  'repetition.jour.court.jeudi': 'Thu',
  'repetition.jour.court.vendredi': 'Fri',
  'repetition.jour.court.samedi': 'Sat',
  'repetition.jour.court.dimanche': 'Sun',
  'repetition.jour.lundi': 'Monday',
  'repetition.jour.mardi': 'Tuesday',
  'repetition.jour.mercredi': 'Wednesday',
  'repetition.jour.jeudi': 'Thursday',
  'repetition.jour.vendredi': 'Friday',
  'repetition.jour.samedi': 'Saturday',
  'repetition.jour.dimanche': 'Sunday',

  // Rang dans le mois (« le 1er lundi », « le dernier vendredi »)
  'repetition.rang.premier': '1st',
  'repetition.rang.deuxieme': '2nd',
  'repetition.rang.troisieme': '3rd',
  'repetition.rang.quatrieme': '4th',
  'repetition.rang.dernier': 'last',

  // Phrase sous le choix (fiche)
  'repetition.phrase.jour': 'Every day',
  'repetition.phrase.annee': 'Every year',
  'repetition.phrase.moisSemaine': 'The {rang} {jour} of every month',
  'repetition.phrase.mois': {
    '=1': 'The 1st of every month',
    '=2': 'The 2nd of every month',
    '=3': 'The 3rd of every month',
    '=21': 'The 21st of every month',
    '=22': 'The 22nd of every month',
    '=23': 'The 23rd of every month',
    '=31': 'The 31st of every month',
    other: 'The {count}th of every month',
  },
  // Du 29 au 31 (ordinal en anglais : « 29th », « 31st »)
  'repetition.phrase.moisFin': {
    '=29': 'The 29th of every month (or the last day of the month)',
    '=30': 'The 30th of every month (or the last day of the month)',
    '=31': 'The 31st of every month (or the last day of the month)',
    one: 'The {count}th of every month (or the last day of the month)',
    other: 'The {count}th of every month (or the last day of the month)',
  },
  'repetition.phrase.semaine': 'Every {jours}',
  'repetition.phrase.deuxSemaines': 'Every 2 weeks, on {jours}',

  // Pastille de la ligne
  'repetition.pastille.jour': 'Every day',
  'repetition.pastille.annee': 'Every year',
  'repetition.pastille.moisSemaine': '{rang} {jour}',
  'repetition.pastille.dernier': 'Last',
  'repetition.pastille.mois': {
    '=1': 'The 1st',
    '=2': 'The 2nd',
    '=3': 'The 3rd',
    '=21': 'The 21st',
    '=22': 'The 22nd',
    '=23': 'The 23rd',
    '=31': 'The 31st',
    other: 'The {count}th',
  },
  'repetition.pastille.deuxSemaines': '2 wks · {jours}',

  // Rappels proposés
  'repetition.rappel.aucun': 'None',
  'repetition.rappel.aLHeure': 'At the time',
  'repetition.rappel.quinzeMinutes': '15 min before',
  'repetition.rappel.trenteMinutes': '30 min before',
  'repetition.rappel.uneHeure': '1 hour before',
  'repetition.rappel.deuxHeures': '2 hours before',
  'repetition.rappel.veille': 'The day before (24 hours)',
};
