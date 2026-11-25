// Textes de public/js/screens/home.js (écran « Accueil »), en anglais.
// Mêmes noms que public/js/i18n/fr/accueil.js.

export default {
  // En-tête : « Bonjour Guillaume », puis la date du jour (format.js)
  'accueil.bonjour': 'Hello {name}',
  'accueil.chargement': 'Loading…',

  // Tuile « Échéances »
  'accueil.echeances': 'Due',
  'accueil.echeances.retard': 'Overdue',
  'accueil.echeances.aujourdhui': 'Today',
  'accueil.echeances.plusTard': 'Later',
  'accueil.echeances.retard.lu': { one: 'Overdue, {count} task', other: 'Overdue, {count} tasks' },
  'accueil.echeances.aujourdhui.lu': { one: 'Today, {count} task', other: 'Today, {count} tasks' },
  'accueil.echeances.plusTard.lu': { one: 'Later, {count} task', other: 'Later, {count} tasks' },
  'accueil.echeances.aucune': 'No due tasks',

  // Tuile « Listes »
  'accueil.listes': 'Lists',
  'accueil.listes.aucune': 'No lists',
  'accueil.listes.nouvelle': 'New list',

  // Tuile « Notes »
  'accueil.notes': 'Notes',
  'accueil.notes.lu': { one: 'Notes, {count} note', other: 'Notes, {count} notes' },
  'accueil.notes.aucune': 'No notes',
  'accueil.notes.nouvelle': 'New note',

  // Tuile « Compte »
  'accueil.compte': 'Account',
  'accueil.compte.monCompte': 'My account',
  'accueil.compte.notifications': 'Notifications',
  'accueil.compte.reglages': 'Settings',
  'accueil.compte.demandes': 'Account requests',
  'accueil.compte.demandes.lu': {
    one: 'Account requests, {count} pending',
    other: 'Account requests, {count} pending',
  },
  // “Projects” tile
  'accueil.projets': 'Projects',
  'accueil.projets.lu': { one: 'Projects, {count} project', other: 'Projects, {count} projects' },
  'accueil.projets.aucun': 'No projects',
  'accueil.projets.nouveau': 'New project',
  'accueil.projets.cartes': { one: '{count} card', other: '{count} cards' },
  'accueil.projets.ligne.nouveautes': '{name}, {cards}, new activity',
};
