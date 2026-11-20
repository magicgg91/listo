// Textes de public/js/subtasks.js, assign.js, wishes.js, list-types.js, history.js, sorting.js (règles communes au téléphone et au serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/regles.js.

export default {
  // Sous-tâches : refus du serveur (sans le mot « article »)
  'regles.sousTaches.pasIci': 'Subtasks only exist in a task list.',
  'regles.sousTaches.desactivees': 'Subtasks are turned off for this list.',
  'regles.sousTaches.principaleIntrouvable': 'Main task not found in this list.',
  'regles.sousTaches.pasDeSousNiveau': "A subtask can't have subtasks.",
  'regles.sousTaches.aDesSousTaches': "This task has subtasks: it can't become a subtask.",
  'regles.sousTaches.pasSaPropre': "A task can't be its own subtask.",
  'regles.sousTaches.pasDeRepetition': "A subtask can't repeat.",
  'regles.sousTaches.deplacement': 'Only a subtask can be moved among the subtasks of its main task.',
  'regles.sousTaches.placeInconnue': 'Unknown position: choose a subtask of the same main task.',

  // Types de liste : noms
  'regles.type.courses': 'Shopping',
  'regles.type.taches': 'Tasks',
  'regles.type.envies': 'Wishes',
  // Changement de type : refus du serveur
  'regles.envies.typeFixe': "A wish list can't change type.",
  'regles.envies.conversionEnLigne': 'A list can only become a wish list from “Edit list”, with a connection.',
  // Formulaire « Modifier la liste » : avertissements
  'regles.envies.avertissementConversion': "Once saved, the wish list can't change its type or recipient again. Nothing is deleted: quantities and due dates are kept but no longer shown, and checked items become “Received”.",
  'regles.envies.verrouillee': "The type and the person the list is for can't be changed anymore.",
  'regles.type.changement.depuisCourses': "Aisles, stores and barcodes aren't shown for this type; they're kept if you switch back to Shopping.",
  'regles.type.changement.depuisTaches': "Priority and due dates aren't shown for this type; they're kept if you switch back to Tasks.",

  // Liste d'envies : sous-titre (à qui elle est destinée)
  'regles.envies.pourVous': 'For you',
  'regles.envies.pour': 'For {name}',
  // Après le type, sur l'ordinateur : « Envies · pour Léa »
  'regles.envies.pourVous.suite': 'for you',
  'regles.envies.pour.suite': 'for {name}',
  'regles.envies.sansDestinataire': 'Wishes',

  // Tris : en-têtes des groupes
  'regles.tri.prioriteElevee': 'High priority',
  'regles.tri.prioriteNormale': 'Normal priority',
  'regles.tri.prioriteBasse': 'Low priority',
  'regles.tri.personne': 'Nobody',
  'regles.tri.moi': 'Me',
  'regles.tri.aPlusieurs': 'Several people',
  'regles.tri.aAcheter': 'To buy',
};
