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
  // Avec des cartes des projets montrés dans Échéances (étape 4 des projets)
  'accueil.echeances.retard.lu.cartes': { one: 'En retard, {count} tâche ou carte', other: 'En retard, {count} tâches ou cartes' },
  'accueil.echeances.aujourdhui.lu.cartes': { one: 'Aujourd\'hui, {count} tâche ou carte', other: 'Aujourd\'hui, {count} tâches ou cartes' },
  'accueil.echeances.plusTard.lu.cartes': { one: 'Plus tard, {count} tâche ou carte', other: 'Plus tard, {count} tâches ou cartes' },

  // Tuile « Listes » : une ligne par type (lue « Courses, 3 listes »,
  // textes listes.type.lu)
  'accueil.listes': 'Listes',
  'accueil.listes.aucune': 'Aucune liste',
  'accueil.listes.nouvelle': 'Nouvelle liste',

  // Tuile « Notes » : nombre de notes, les dernières modifiées, « Nouvelle note »
  'accueil.notes': 'Notes',
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
  // Tuile « Projets » (fonction allumée ; docs/cadrage-projets.md, 3.3)
  'accueil.projets': 'Projets',
  'accueil.projets.aucun': 'Aucun projet',
  'accueil.projets.nouveau': 'Nouveau projet',
  // Invitation (aucune fonction utilisée : un invité, docs/cadrage-comptes.md 4.4)
  'accueil.bienvenue.titre': 'Bienvenue, {name}',
  'accueil.bienvenue.projets': 'Votre compte est prêt. Allumez les projets dans Réglages › Fonctions pour voir ceux qu\'on vous partage.',
  'accueil.bienvenue.notes': 'Votre compte est prêt. Allumez les notes dans Réglages › Fonctions pour voir celles qu\'on vous partage.',
  'accueil.bienvenue.plusieurs': 'Votre compte est prêt. Allumez une fonction dans Réglages › Fonctions pour commencer.',
  'accueil.bienvenue.aucune': 'Votre compte est prêt. L\'Admin ne vous a encore ouvert aucune fonction : il s\'en charge.',
  'accueil.bienvenue.bouton': 'Ouvrir Réglages › Fonctions',
  'accueil.projets.aucuneCarte': 'Aucune carte pour vous',
  'accueil.projets.retard': 'En retard',
  'accueil.projets.cartes.lu': { one: 'Projets, {count} carte pour vous', other: 'Projets, {count} cartes pour vous' },
  'accueil.projets.cartes.lu.nouveautes': { one: 'Projets, {count} carte pour vous, nouveautés', other: 'Projets, {count} cartes pour vous, nouveautés' },
  'accueil.projets.lu.nouveautes': 'Projets, nouveautés',
};
