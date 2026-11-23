// Textes de server/notify.js, server/push.js, server/routes/push.js, server/news.js (contenu des notifications, réponses du serveur), en français.
// Chaque nom commence par « alertes. ».

export default {
  // Dernier élément d'une énumération trop longue (formatList, server/notify.js) :
  // « Lait, Pain et 3 autres », « Léa, Marc et 2 autres »
  'alertes.noms.autres': { one: '{count} autre', other: '{count} autres' },
  // Auteur inconnu ou disparu
  'alertes.quelquun': 'Quelqu\'un',
  'alertes.ancienMembre': 'Un ancien membre',
  // Auteur d'une nouveauté dont le compte n'existe plus (Nouveautés, server/news.js)
  'alertes.nouveautes.ancienMembre': 'un ancien membre',

  // a) Modifications des autres (titre)
  'alertes.tour.detail': 'C\'est votre tour : {names}',
  'alertes.tour': 'C\'est votre tour dans « {list} »',
  // Une personne (un) ou plusieurs (plusieurs) ; count : nombre de tâches
  'alertes.attribue.un': { one: '{people} vous a attribué une tâche dans « {list} »', other: '{people} vous a attribué {count} tâches dans « {list} »' },
  'alertes.attribue.plusieurs': { one: '{people} vous ont attribué une tâche dans « {list} »', other: '{people} vous ont attribué {count} tâches dans « {list} »' },
  // count : nombre de personnes qui ont modifié la liste
  'alertes.modifie': { one: '{people} a modifié « {list} »', other: '{people} ont modifié « {list} »' },
  // a) Modifications des autres (texte)
  'alertes.changements': { one: '{count} changement', other: '{count} changements' },
  'alertes.detail.pourVous': 'Pour vous : {names}',
  'alertes.detail.ajoute': 'Ajouté : {names}',
  'alertes.detail.modifie': 'Modifié : {names}',
  'alertes.detail.coche': 'Coché : {names}',

  // c) Envies : réservation ou participation
  'alertes.envie.visiteur': '{name} (lien public)',
  'alertes.envie.participe.nom': '{actor} participe à « {item} »',
  'alertes.envie.participe': '{actor} participe à un cadeau',
  'alertes.envie.reserve.nom': '{actor} a réservé « {item} »',
  'alertes.envie.reserve': '{actor} a réservé un souhait',
  'alertes.envie.liste': 'Liste « {list} »',

  // d) Partage
  'alertes.partage.ajoute': '{actor} vous a ajouté à « {list} »',
  'alertes.partage.ajoute.modification': 'Vous pouvez la modifier.',
  'alertes.partage.ajoute.lecture': 'En lecture seule.',
  'alertes.partage.droit': 'Votre droit sur « {list} » a changé',
  'alertes.partage.droit.modification': 'Vous pouvez maintenant la modifier.',
  'alertes.partage.droit.lecture': 'Elle est maintenant en lecture seule pour vous.',

  // Notes (étape 3) : modifications des autres (count : nombre de
  // personnes), partage, droit changé ; sans titre : « une note »
  'alertes.note.modifie': { one: '{people} a modifié la note « {note} »', other: '{people} ont modifié la note « {note} »' },
  'alertes.note.modifie.sansTitre': { one: '{people} a modifié une note', other: '{people} ont modifié une note' },
  'alertes.note.partage': '{actor} a partagé la note « {note} » avec vous',
  'alertes.note.partage.sansTitre': '{actor} a partagé une note avec vous',
  'alertes.note.droit': 'Votre droit sur la note « {note} » a changé',
  'alertes.note.droit.sansTitre': 'Votre droit sur une note a changé',
  'alertes.noteIntrouvable': 'Note introuvable.',

  // b) Résumé quotidien des échéances
  'alertes.echeances.aujourdhui': { one: '{count} tâche à faire aujourd\'hui', other: '{count} tâches à faire aujourd\'hui' },
  // En retard, après « … à faire aujourd'hui »
  'alertes.echeances.retard': '{count} en retard',
  // En retard, seules
  'alertes.echeances.retard.seules': { one: '{count} tâche en retard', other: '{count} tâches en retard' },
  // Tâche à heure précise (détail) : « Plombier (14:00) »
  'alertes.echeances.heure': '{name} ({time})',
  'alertes.dans': 'Dans « {list} »',
  'alertes.dansListes': 'Dans {count} listes',

  // e) Rappel d'une tâche (sans le détail : titre)
  'alertes.rappel.aujourdhui': 'Rappel : une tâche aujourd\'hui à {time}',
  'alertes.rappel.demain': 'Rappel : une tâche demain à {time}',
  'alertes.rappel.date': 'Rappel : une tâche le {date} à {time}',
  // e) Rappel d'une tâche (avec le détail : titre, puis texte)
  'alertes.rappel.detail': 'Rappel : {name}',
  'alertes.rappel.detail.aujourdhui': 'Aujourd\'hui à {time} · « {list} »',
  'alertes.rappel.detail.demain': 'Demain à {time} · « {list} »',
  'alertes.rappel.detail.date': 'Le {date} à {time} · « {list} »',

  // Notification test (server/push.js)
  'alertes.test.corps': 'Notification test : les notifications arrivent bien sur cet appareil.',

  // Réponses de l'API des notifications (server/routes/push.js)
  'alertes.abonnementRefuse': 'Abonnement refusé : ce service de notification n\'est pas reconnu.',
  'alertes.autreCompte': 'Cet appareil reçoit déjà les notifications d\'un autre compte. Déconnectez ce compte sur cet appareil, puis réessayez.',
  'alertes.reglageInvalide': 'Réglage des notifications invalide.',
  'alertes.silencerInvalide': 'Valeur « muted » invalide (true ou false).',
  'alertes.listeIntrouvable': 'Liste introuvable.',
  'alertes.tropDeDemandes': 'Trop de demandes. Réessayez dans quelques minutes.',
  // Résultat de la notification test
  'alertes.test.inactif': 'Les notifications ne sont pas activées sur cet appareil.',
  'alertes.test.expire': 'L\'abonnement de cet appareil a expiré. Désactivez puis réactivez les notifications.',
  'alertes.test.refuse': 'Le service de notification a refusé l\'envoi. Réessayez plus tard.',
  'alertes.test.sansReponse': 'Le service de notification n\'a pas répondu. Réessayez plus tard.',
};
