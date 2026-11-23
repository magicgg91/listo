// Textes de public/js/screens/home.js (écran « Accueil »), en français.
// Chaque nom commence par « accueil. ».

export default {
  // En-tête : « Bonjour Guillaume », puis la date du jour (format.js)
  'accueil.bonjour': 'Bonjour {name}',
  'accueil.chargement': 'Chargement…',

  // Tuile « Échéances » : mêmes tâches et même choix « Toutes / Les
  // miennes » que l'écran Échéances
  'accueil.echeances': 'Échéances',
  'accueil.echeances.retard': 'En retard',
  'accueil.echeances.aujourdhui': 'Aujourd\'hui',
  'accueil.echeances.plusTard': 'Plus tard',
  'accueil.echeances.retard.lu': { one: 'En retard, {count} tâche', other: 'En retard, {count} tâches' },
  'accueil.echeances.aujourdhui.lu': { one: 'Aujourd\'hui, {count} tâche', other: 'Aujourd\'hui, {count} tâches' },
  'accueil.echeances.plusTard.lu': { one: 'Plus tard, {count} tâche', other: 'Plus tard, {count} tâches' },
  'accueil.echeances.aucune': 'Aucune échéance',

  // Tuile « Listes » : une ligne par type (lue « Courses, 3 listes »,
  // textes listes.type.lu)
  'accueil.listes': 'Listes',
  'accueil.listes.aucune': 'Aucune liste',
  'accueil.listes.nouvelle': 'Nouvelle liste',

  // Tuile « Notes » : nombre de notes, les dernières modifiées, « Nouvelle note »
  'accueil.notes': 'Notes',
  'accueil.notes.nombre': { one: '{count} note', other: '{count} notes' },
  'accueil.notes.lu': { one: 'Notes, {count} note', other: 'Notes, {count} notes' },
  'accueil.notes.aucune': 'Aucune note',
  'accueil.notes.nouvelle': 'Nouvelle note',

  // Tuile « Compte »
  'accueil.compte': 'Compte',
  'accueil.compte.monCompte': 'Mon compte',
  'accueil.compte.notifications': 'Notifications',
  'accueil.compte.reglages': 'Réglages',
  'accueil.compte.demandes': 'Demandes de compte',
  'accueil.compte.demandes.lu': {
    one: 'Demandes de compte, {count} en attente',
    other: 'Demandes de compte, {count} en attente',
  },
};
