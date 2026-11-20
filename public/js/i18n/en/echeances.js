// Textes de public/js/screens/deadlines.js et public/js/deadlines.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/echeances.js.

export default {
  // Groupes (public/js/deadlines.js)
  'echeances.groupe.retard': 'Overdue',
  'echeances.groupe.aujourdhui': 'Today',
  'echeances.groupe.demain': 'Tomorrow',
  'echeances.groupe.semaine': 'This week',
  'echeances.groupe.plusTard': 'Later',

  // Recherche
  'echeances.recherche.label': 'Search tasks',
  'echeances.recherche.placeholder.pc': 'Search',

  // « Toutes / Les miennes »
  'echeances.filtre.toutes': 'All',
  'echeances.filtre.miennes': 'Mine',
  'echeances.filtre.label': 'Tasks shown',

  // Cocher depuis cet écran (message, avec « Annuler »)
  'echeances.moi': 'Me',
  'echeances.prochaineFois': 'Next time: {date}',
  'echeances.prochaineFois.personne': 'Next time: {date} · {name}',
  'echeances.annuler': 'Undo',
  'echeances.coche': 'Checked: {name}',

  // Ligne d'une tâche (et ce que lit le lecteur d'écran)
  'echeances.lu.dans': 'in {name}',
  'echeances.lu.sousTache': 'subtask of {name}',
  'echeances.lu.repetition': 'repeats: {repeat}',
  'echeances.personnes.plus': '{name} +{more}',
  'echeances.lu.pour': 'for {names}',
  'echeances.lu.moi': 'me',
  'echeances.lectureSeule': 'Not checked, read only',
  'echeances.ouvrir': 'Open {name}, {details}',

  // Chargement, écran vide
  'echeances.chargement': 'Loading…',
  'echeances.vide.titre': 'Nothing due',
  'echeances.vide.miennes': 'No open tasks are assigned to you. “All” also shows other people\'s tasks and unassigned ones.',
  'echeances.vide.texte': 'Open tasks with a due date show up here, from all your lists. To give a task a due date, turn on the “Due date” option in “Edit list”.',
  // Nombre de tâches d'un groupe (lecteur d'écran)
  'echeances.groupe.nombre': { one: '{count} task', other: '{count} tasks' },

  // Aucun résultat
  'echeances.recherche.aucun': 'No results',
  'echeances.recherche.aucun.texte': 'No task matches “{query}”.',
  'echeances.recherche.effacer': 'Clear search',

  // En-tête
  'echeances.titre': 'Due',
  'echeances.pc.sousTitre': 'Open tasks from all your lists',
};
