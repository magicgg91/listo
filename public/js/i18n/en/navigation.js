// Textes de public/js/tabbar.js et public/js/screens/pc-side.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/navigation.js.

export default {
  // Bandeau du bas (téléphone) et menu de gauche (ordinateur)
  'navigation.accueil': 'Home',
  'navigation.listes': 'Lists',
  'navigation.echeances': 'Due',
  'navigation.reglages': 'Settings',
  'navigation.notes': 'Notes',
  'navigation.echeances.pastille': {
    one: 'Due, {count} task overdue or due today',
    other: 'Due, {count} tasks overdue or due today',
  },
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
};
