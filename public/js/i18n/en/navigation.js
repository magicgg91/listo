// Textes de public/js/tabbar.js et public/js/screens/pc-side.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/navigation.js.

export default {
  // Bandeau du bas (téléphone) et menu de gauche (ordinateur)
  'navigation.accueil': 'Home',
  'navigation.listes': 'Lists',
  'navigation.echeances': 'Due',
  'navigation.reglages': 'Settings',
  'navigation.notes': 'Notes',
  // Nom lu de « Échéances » avec ses pastilles (deadlines.js, deadlinesLabel)
  'navigation.echeances.pastille.retard': { one: 'Due, {count} overdue', other: 'Due, {count} overdue' },
  'navigation.echeances.pastille.aujourdhui': { one: 'Due, {count} today', other: 'Due, {count} today' },
  'navigation.echeances.pastilles': 'Due, {late} overdue, {today} today',
  'navigation.libelle': 'Navigation',

  // Menu de gauche : recherche
  'navigation.recherche.placeholder': 'Search',
  'navigation.recherche.libelle': 'Search lists',
  'navigation.recherche.effacer': 'Clear search',
  'navigation.recherche.resultats': 'Lists found',

  // Menu de gauche : entrée fixe « Listes », types de listes
  'navigation.listes.nombre': { one: 'Lists, {count} list', other: 'Lists, {count} lists' },
  'navigation.notes.nombre': { one: 'Notes, {count} note', other: 'Notes, {count} notes' },
  'navigation.types': 'Types',
  'navigation.types.libelle': 'List types',
  'navigation.chargement': 'Loading…',
  'navigation.recherche.aucune': 'No lists found.',
  'navigation.listes.aucune': 'No lists yet.',

  // Menu de gauche : marque, raccourcis, pied
  'navigation.marque.accueil': ': Home',
  // Marque quand l'Accueil est coupé : le premier écran choisi
  'navigation.marque.ecran': ': {name}',
  'navigation.raccourcis': 'Keyboard shortcuts',
  'navigation.raccourcis.infobulle': 'Keyboard shortcuts · ?',
  'navigation.nouvelleListe': 'New list',
  'navigation.nouvelleNote': 'New note',
  'navigation.role.admin': 'Admin',
  'navigation.role.invite': 'Guest',
  // Projects
  'navigation.projets': 'Projects',
  'navigation.projets.nombre': { one: 'Projects, {count} project', other: 'Projects, {count} projects' },
  'navigation.projets.nombre.nouveautes': { one: 'Projects, {count} project, new activity', other: 'Projects, {count} projects, new activity' },
  'navigation.projets.libelle': 'My projects',
  'navigation.projets.aucun': 'No projects',
  'navigation.projet.lu': { one: '{name}, {count} card', other: '{name}, {count} cards' },
  'navigation.projet.lu.nouveautes': { one: '{name}, {count} card, new activity', other: '{name}, {count} cards, new activity' },
  'navigation.nouveauProjet': 'New project',
  'navigation.nouvelleCarte': 'New card',
};
