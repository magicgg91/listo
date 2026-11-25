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
  // Avec des cartes des projets montrés dans Échéances (étape 4 des projets)
  'accueil.echeances.retard.lu.cartes': { one: 'Overdue, {count} task or card', other: 'Overdue, {count} tasks or cards' },
  'accueil.echeances.aujourdhui.lu.cartes': { one: 'Today, {count} task or card', other: 'Today, {count} tasks or cards' },
  'accueil.echeances.plusTard.lu.cartes': { one: 'Later, {count} task or card', other: 'Later, {count} tasks or cards' },

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
  'accueil.projets.aucun': 'No projects',
  'accueil.projets.nouveau': 'New project',
  // Welcome card (no feature in use: a guest, docs/cadrage-comptes.md 4.4)
  'accueil.bienvenue.titre': 'Welcome, {name}',
  'accueil.bienvenue.projets': 'Your account is ready. Turn on projects in Settings › Features to see the ones shared with you.',
  'accueil.bienvenue.notes': 'Your account is ready. Turn on notes in Settings › Features to see the ones shared with you.',
  'accueil.bienvenue.plusieurs': 'Your account is ready. Turn on a feature in Settings › Features to get started.',
  'accueil.bienvenue.aucune': 'Your account is ready. The Admin hasn\'t opened any feature for you yet: they take care of it.',
  'accueil.bienvenue.bouton': 'Open Settings › Features',
  'accueil.projets.aucuneCarte': 'No cards for you',
  'accueil.projets.retard': 'Overdue',
  'accueil.projets.cartes.lu': { one: 'Projects, {count} card for you', other: 'Projects, {count} cards for you' },
  'accueil.projets.cartes.lu.nouveautes': { one: 'Projects, {count} card for you, new activity', other: 'Projects, {count} cards for you, new activity' },
  'accueil.projets.lu.nouveautes': 'Projects, new activity',
};
