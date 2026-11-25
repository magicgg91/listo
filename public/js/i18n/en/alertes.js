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

  // Projects (step 3): new cards, assignment, comments and changes on a
  // followed card, reminder, sharing. count: number of people; {cards}:
  // “3 cards”. Without detail, the card is not named; never a comment's text.
  'alertes.projet.cartes': { one: '{count} card', other: '{count} cards' },
  'alertes.projet.ajoute': { one: '{people} added {cards} to “{project}”', other: '{people} added {cards} to “{project}”' },
  'alertes.projet.attribue': { one: '{people} assigned {cards} to you in “{project}”', other: '{people} assigned {cards} to you in “{project}”' },
  'alertes.projet.attribue.nom': { one: '{people} assigned “{card}” to you in “{project}”', other: '{people} assigned “{card}” to you in “{project}”' },
  'alertes.carte.commente': { one: '{people} commented on a card in “{project}”', other: '{people} commented on a card in “{project}”' },
  'alertes.carte.commente.nom': { one: '{people} commented on “{card}”', other: '{people} commented on “{card}”' },
  'alertes.carte.commentaires': { one: '{count} comment', other: '{count} comments' },
  'alertes.carte.modifie': { one: '{people} changed a card in “{project}”', other: '{people} changed a card in “{project}”' },
  'alertes.carte.modifie.nom': { one: '{people} changed “{card}”', other: '{people} changed “{card}”' },
  'alertes.carte.change.deplacee': 'Moved to “{column}”',
  'alertes.carte.change.move': 'Moved',
  'alertes.carte.change.due': 'Due date changed',
  'alertes.carte.change.done': 'Done',
  'alertes.carte.change.undone': 'No longer done',
  'alertes.carte.change.describe': 'Description changed',
  'alertes.carte.rappel.aujourdhui': 'Reminder: a card today at {time}',
  'alertes.carte.rappel.demain': 'Reminder: a card tomorrow at {time}',
  'alertes.carte.rappel.date': 'Reminder: a card on {date} at {time}',
  'alertes.carte.dansProjet': 'In “{project}”',
  'alertes.projet.partage': '{actor} shared the project “{project}” with you',
  'alertes.projet.droit.modifier': 'You can edit every card and column.',
  'alertes.projet.droit.contribuer': 'You can add cards and comment.',
  'alertes.projet.droit.lire': 'Read only.',
  'alertes.projet.allumer': 'Turn on “Projects” in Settings › Features to see it.',
  'alertes.liste.allumer': 'Turn on “Lists” in Settings › Features to see it.',

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
  // Avec des cartes des projets montrés dans Échéances (étape 4 du cadrage des projets)
  'alertes.echeances.aujourdhui.cartes': { one: '{count} item due today', other: '{count} items due today' },
  'alertes.echeances.retard.seules.cartes': { one: '{count} overdue item', other: '{count} overdue items' },
  'alertes.echeances.dansListesProjets': 'In {count} lists and projects',

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
