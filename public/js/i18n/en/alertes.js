// Textes de server/notify.js, server/push.js, server/routes/push.js, server/news.js (contenu des notifications, réponses du serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/alertes.js.

export default {
  // Dernier élément d'une énumération trop longue (formatList, server/notify.js) :
  // « Lait, Pain et 3 autres », « Léa, Marc et 2 autres »
  'alertes.noms.autres': { one: '{count} other', other: '{count} others' },
  // Auteur inconnu ou disparu
  'alertes.quelquun': 'Someone',
  'alertes.ancienMembre': 'A former member',
  // Auteur d'une nouveauté dont le compte n'existe plus (Nouveautés, server/news.js)
  'alertes.nouveautes.ancienMembre': 'a former member',

  // a) Modifications des autres (titre)
  'alertes.tour.detail': 'It\'s your turn: {names}',
  'alertes.tour': 'It\'s your turn in “{list}”',
  // Une personne (un) ou plusieurs (plusieurs) ; count : nombre de tâches
  'alertes.attribue.un': { one: '{people} assigned you a task in “{list}”', other: '{people} assigned you {count} tasks in “{list}”' },
  'alertes.attribue.plusieurs': { one: '{people} assigned you a task in “{list}”', other: '{people} assigned you {count} tasks in “{list}”' },
  // count : nombre de personnes qui ont modifié la liste
  'alertes.modifie': { one: '{people} edited “{list}”', other: '{people} edited “{list}”' },
  // a) Modifications des autres (texte)
  'alertes.changements': { one: '{count} change', other: '{count} changes' },
  'alertes.detail.pourVous': 'For you: {names}',
  'alertes.detail.ajoute': 'Added: {names}',
  'alertes.detail.modifie': 'Edited: {names}',
  'alertes.detail.coche': 'Checked: {names}',

  // c) Envies : réservation ou participation
  'alertes.envie.visiteur': '{name} (public link)',
  'alertes.envie.participe.nom': '{actor} is chipping in for “{item}”',
  'alertes.envie.participe': '{actor} is chipping in for a gift',
  'alertes.envie.reserve.nom': '{actor} reserved “{item}”',
  'alertes.envie.reserve': '{actor} reserved a wish',
  'alertes.envie.liste': 'List “{list}”',

  // d) Partage
  'alertes.partage.ajoute': '{actor} added you to “{list}”',
  'alertes.partage.ajoute.modification': 'You can edit it.',
  'alertes.partage.ajoute.lecture': 'Read only.',
  'alertes.partage.droit': 'Your access to “{list}” has changed',
  'alertes.partage.droit.modification': 'You can now edit it.',
  'alertes.partage.droit.lecture': 'It\'s now read only for you.',

  // Notes (étape 3) : modifications des autres (count : nombre de
  // personnes), partage, droit changé ; sans titre : « une note »
  'alertes.note.modifie': { one: '{people} edited the note “{note}”', other: '{people} edited the note “{note}”' },
  'alertes.note.modifie.sansTitre': { one: '{people} edited a note', other: '{people} edited a note' },
  'alertes.note.partage': '{actor} shared the note “{note}” with you',
  'alertes.note.partage.sansTitre': '{actor} shared a note with you',
  'alertes.note.droit': 'Your access to the note “{note}” has changed',
  'alertes.note.droit.sansTitre': 'Your access to a note has changed',
  'alertes.noteIntrouvable': 'Note not found.',

  // b) Résumé quotidien des échéances
  'alertes.echeances.aujourdhui': { one: '{count} task due today', other: '{count} tasks due today' },
  // En retard, après « … à faire aujourd'hui »
  'alertes.echeances.retard': '{count} overdue',
  // En retard, seules
  'alertes.echeances.retard.seules': { one: '{count} overdue task', other: '{count} overdue tasks' },
  // Tâche à heure précise (détail) : « Plombier (14:00) »
  'alertes.echeances.heure': '{name} ({time})',
  'alertes.dans': 'In “{list}”',
  'alertes.dansListes': 'In {count} lists',

  // e) Rappel d'une tâche (sans le détail : titre)
  'alertes.rappel.aujourdhui': 'Reminder: a task today at {time}',
  'alertes.rappel.demain': 'Reminder: a task tomorrow at {time}',
  'alertes.rappel.date': 'Reminder: a task on {date} at {time}',
  // e) Rappel d'une tâche (avec le détail : titre, puis texte)
  'alertes.rappel.detail': 'Reminder: {name}',
  'alertes.rappel.detail.aujourdhui': 'Today at {time} · “{list}”',
  'alertes.rappel.detail.demain': 'Tomorrow at {time} · “{list}”',
  'alertes.rappel.detail.date': 'On {date} at {time} · “{list}”',

  // Notification test (server/push.js)
  'alertes.test.corps': 'Test notification: notifications are reaching this device.',

  // Réponses de l'API des notifications (server/routes/push.js)
  'alertes.abonnementRefuse': 'Subscription refused: this notification service isn\'t recognized.',
  'alertes.autreCompte': 'This device already gets notifications for another account. Sign out of that account on this device, then try again.',
  'alertes.reglageInvalide': 'Invalid notification setting.',
  'alertes.silencerInvalide': 'Invalid “muted” value (true or false).',
  'alertes.listeIntrouvable': 'List not found.',
  'alertes.tropDeDemandes': 'Too many requests. Try again in a few minutes.',
  // Résultat de la notification test
  'alertes.test.inactif': 'Notifications aren\'t turned on for this device.',
  'alertes.test.expire': 'This device\'s subscription has expired. Turn notifications off, then on again.',
  'alertes.test.refuse': 'The notification service refused to send it. Try again later.',
  'alertes.test.sansReponse': 'The notification service didn\'t respond. Try again later.',
};
