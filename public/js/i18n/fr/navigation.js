// Textes de public/js/tabbar.js et public/js/screens/pc-side.js, en français.
// Chaque nom commence par « navigation. ».

export default {
  // Bandeau du bas (téléphone) et menu de gauche (ordinateur)
  'navigation.accueil': 'Accueil',
  'navigation.listes': 'Listes',
  'navigation.echeances': 'Échéances',
  'navigation.reglages': 'Réglages',
  'navigation.notes': 'Notes',
  // Nom lu de « Échéances » avec ses pastilles (deadlines.js,
  // deadlinesLabel) : seulement les nombres non nuls. « en retard » et
  // « aujourd'hui » ne s'accordent pas, mais les formes du pluriel restent
  // là pour une autre langue.
  'navigation.echeances.pastille.retard': { one: 'Échéances, {count} en retard', other: 'Échéances, {count} en retard' },
  'navigation.echeances.pastille.aujourdhui': { one: 'Échéances, {count} aujourd\'hui', other: 'Échéances, {count} aujourd\'hui' },
  'navigation.echeances.pastilles': 'Échéances, {late} en retard, {today} aujourd\'hui',
  'navigation.libelle': 'Navigation',

  // Menu de gauche : recherche
  'navigation.recherche.placeholder': 'Rechercher',
  'navigation.recherche.libelle': 'Rechercher une liste',
  'navigation.recherche.effacer': 'Effacer la saisie',
  'navigation.recherche.resultats': 'Listes trouvées',

  // Menu de gauche : entrée fixe « Listes » (lue « Listes, 5 listes »),
  // types de listes (écrans des listes)
  'navigation.listes.nombre': { one: 'Listes, {count} liste', other: 'Listes, {count} listes' },
  'navigation.notes.nombre': { one: 'Notes, {count} note', other: 'Notes, {count} notes' },
  'navigation.types': 'Types',
  'navigation.types.libelle': 'Types de listes',
  'navigation.chargement': 'Chargement…',
  'navigation.recherche.aucune': 'Aucune liste trouvée.',
  'navigation.listes.aucune': 'Aucune liste pour le moment.',

  // Menu de gauche : marque, raccourcis, pied
  'navigation.marque.accueil': ': Accueil',
  // Marque quand l'Accueil est désactivé : le premier écran choisi
  'navigation.marque.ecran': ': {name}',
  'navigation.raccourcis': 'Raccourcis clavier',
  'navigation.raccourcis.infobulle': 'Raccourcis clavier · ?',
  'navigation.nouvelleListe': 'Nouvelle liste',
  'navigation.nouvelleNote': 'Nouvelle note',
  'navigation.role.admin': 'Admin',
  'navigation.role.invite': 'Invité',
  // Projets (docs/cadrage-projets.md, 3.2 et 3.4)
  'navigation.projets': 'Projets',
  'navigation.projets.nombre': { one: 'Projets, {count} projet', other: 'Projets, {count} projets' },
  'navigation.projets.nombre.nouveautes': { one: 'Projets, {count} projet, nouveautés', other: 'Projets, {count} projets, nouveautés' },
  'navigation.projets.libelle': 'Mes projets',
  'navigation.projets.aucun': 'Aucun projet',
  'navigation.projet.lu': { one: '{name}, {count} carte', other: '{name}, {count} cartes' },
  'navigation.projet.lu.nouveautes': { one: '{name}, {count} carte, nouveautés', other: '{name}, {count} cartes, nouveautés' },
  'navigation.nouveauProjet': 'Nouveau projet',
  'navigation.nouvelleCarte': 'Nouvelle carte',
};
