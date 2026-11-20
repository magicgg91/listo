// Textes de public/js/subtasks.js, assign.js, wishes.js, list-types.js, history.js, sorting.js (règles communes au téléphone et au serveur), en français.
// Chaque nom commence par « regles. ».

export default {
  // Sous-tâches : refus du serveur (sans le mot « article »)
  'regles.sousTaches.pasIci': 'Les sous-tâches n\'existent que dans une liste de tâches.',
  'regles.sousTaches.desactivees': 'Les sous-tâches sont désactivées pour cette liste.',
  'regles.sousTaches.principaleIntrouvable': 'Tâche principale introuvable dans cette liste.',
  'regles.sousTaches.pasDeSousNiveau': 'Une sous-tâche ne peut pas avoir de sous-tâches.',
  'regles.sousTaches.aDesSousTaches': 'Cette tâche a des sous-tâches : elle ne peut pas devenir une sous-tâche.',
  'regles.sousTaches.pasSaPropre': 'Une tâche ne peut pas être sa propre sous-tâche.',
  'regles.sousTaches.pasDeRepetition': 'Une sous-tâche ne se répète pas.',
  'regles.sousTaches.deplacement': 'Seule une sous-tâche se déplace parmi les sous-tâches de sa tâche principale.',
  'regles.sousTaches.placeInconnue': 'Place inconnue : choisissez une sous-tâche de la même tâche principale.',

  // Types de liste : noms
  'regles.type.courses': 'Courses',
  'regles.type.taches': 'Tâches',
  'regles.type.envies': 'Envies',
  // Changement de type : refus du serveur
  'regles.envies.typeFixe': 'Une liste d\'envies ne change pas de type.',
  'regles.envies.conversionEnLigne': 'Une liste devient une liste d\'envies seulement depuis « Modifier la liste », avec du réseau.',
  // Formulaire « Modifier la liste » : avertissements
  'regles.envies.avertissementConversion': 'Une fois enregistrée, la liste d\'envies ne pourra plus changer de type ni de destinataire. Rien n\'est effacé : quantités et échéances sont gardées sans être affichées, et les éléments cochés deviennent « Reçus ».',
  'regles.envies.verrouillee': 'Le type et la personne à qui la liste est destinée ne changent plus.',
  'regles.type.changement.depuisCourses': 'Les rayons, magasins et codes-barres ne s\'affichent plus pour ce type ; ils sont conservés si vous revenez à Courses.',
  'regles.type.changement.depuisTaches': 'La priorité et l\'échéance ne s\'affichent plus pour ce type ; elles sont conservées si vous revenez à Tâches.',

  // Liste d'envies : sous-titre (à qui elle est destinée)
  'regles.envies.pourVous': 'Pour vous',
  'regles.envies.pour': 'Pour {name}',
  'regles.envies.sansDestinataire': 'Envies',

  // Tris : en-têtes des groupes
  'regles.tri.prioriteElevee': 'Priorité élevée',
  'regles.tri.prioriteNormale': 'Priorité normale',
  'regles.tri.prioriteBasse': 'Priorité basse',
  'regles.tri.personne': 'Personne',
  'regles.tri.moi': 'Moi',
  'regles.tri.aPlusieurs': 'À plusieurs',
  'regles.tri.aAcheter': 'À acheter',
};
