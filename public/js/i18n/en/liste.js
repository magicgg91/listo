// Textes de public/js/screens/list.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/liste.js.

export default {
  // Recherche et menu
  'liste.recherche.label': 'Search this list',
  'liste.recherche.placeholder.pc': 'Search',
  'liste.menu': 'List menu',

  // Tri (choix du menu, puis message affiché après le choix)
  'liste.tri.rayon': 'By aisle',
  'liste.tri.rayon.message': 'Sort: by aisle',
  'liste.tri.alpha': 'Alphabetical',
  'liste.tri.alpha.message': 'Sort: alphabetical',
  'liste.tri.priorite': 'By priority',
  'liste.tri.priorite.message': 'Sort: by priority',
  'liste.tri.echeance': 'By due date',
  'liste.tri.echeance.message': 'Sort: by due date',
  'liste.tri.personne': 'By person',
  'liste.tri.personne.message': 'Sort: by person',
  'liste.tri.magasin': 'By store',
  'liste.tri.magasin.message': 'Sort: by store',
  'liste.tri.bouton': 'Sort list',

  // En-tête de l'ordinateur
  'liste.pc.partageeAvec': 'Shared with {names}',
  'liste.pc.partager': 'Share',
  'liste.pc.personnes': 'People',

  // Liste d'envies : ce que la personne voit des réservations
  'liste.envies.beneficiaire': 'You never see reservations, so the surprise stays safe.',
  'liste.envies.visibles.cache': 'Reservations are visible. {name}, who this list is for, can\'t see them.',
  'liste.envies.visibles': 'Reservations are visible to the people sharing this list.',
  'liste.lectureSeule': 'Read only',

  // Compteur d'avancement de l'ordinateur (« 5/6 left ») : le nombre
  // « 5/6 » prend la place de {progress} ; pluriel selon les restants
  'liste.progression.restants': { one: '{progress} left', other: '{progress} left' },

  // Groupes repliables
  'liste.toutReplier': 'Collapse all',
  'liste.toutDeplier': 'Expand all',

  // Recherche sans résultat
  'liste.recherche.aucunResultat': 'No results',
  'liste.recherche.aucun': 'No {word} matches “{query}”.',
  'liste.recherche.effacer': 'Clear search',

  // Dessin de la liste : chargement, liste introuvable, liste vide
  'liste.chargement': 'Loading…',
  'liste.introuvable': 'List not found',
  'liste.introuvable.texte': 'This list was deleted, or it\'s no longer shared with you.',
  'liste.retourMesListes': 'Back to lists',
  // Champ d'ajout (courses, tâches, envies)
  'liste.ajout.placeholder.courses': 'Add an item',
  'liste.ajout.placeholder.taches': 'Add an item',
  'liste.ajout.placeholder.envies': 'Add a wish',
  'liste.vide': 'This list is empty',
  'liste.vide.ajouter.pc': 'Add your first {word} with the field above.',
  'liste.vide.ajouter': 'Add your first {word} with the field below.',
  'liste.vide.lectureSeule': 'Nothing to show yet.',
  // « Astuce : appuyez sur [A] pour aller au champ d'ajout. » : une phrase
  // entière ; {key} marque la place de la touche, dessinée par l'écran
  'liste.vide.astuce': 'Tip: press {key} to jump to the add field.',
  'liste.sansMagasin': 'No store',
  'liste.sansRayon': 'No aisle',

  // Pastilles d'une ligne, lues par les lecteurs d'écran
  'liste.lecture.repete': 'repeats: {rule}',
  'liste.lecture.pour': 'for {names}',
  'liste.lecture.moi': 'me',
  'liste.lecture.tour': 'taking turns, this time {name}',

  // Attribution (« Pour »)
  'liste.personne': 'Nobody',
  'liste.pour.tour.detail': 'Take turns: {names} (this time: {name})',
  'liste.pour.personneMinuscule': 'nobody',
  'liste.moi': 'Me',

  // Liste d'envies : pastilles de réservation
  'liste.envies.ouvert': 'Open to others',
  'liste.envies.ouvert.lecture': 'open to others',
  'liste.envies.visiteur': '{name} (public link)',
  'liste.envies.vous': 'you',
  'liste.envies.reservePar': 'Reserved by {names}',

  // Ligne d'un article ou d'un élément
  'liste.supprimer.nom': 'Delete {name}',
  'liste.supprimer': 'Delete',
  'liste.envies.recu.nom': 'Received: {name}',
  'liste.etat.recu': 'Received',
  'liste.etat.pasRecu': 'Not received yet',
  'liste.etat.coche': 'Checked',
  'liste.etat.nonCoche': 'Not checked',
  'liste.modifier.nom': 'Edit {name}',
  'liste.voir.nom': 'View {name}',
  'liste.photo.agrandir': 'Enlarge photo of {name}',

  // Sous-tâches
  'liste.sousTaches.progression': {
    one: 'Subtasks of {name}: {count} of {total} done',
    other: 'Subtasks of {name}: {count} of {total} done',
  },
  'liste.sousTaches.ajouter.nom': 'Add a subtask to {name}',
  'liste.sousTaches.ajouter': 'Add a subtask',
  'liste.sousTaches.reordonner.nom': 'Reorder the subtasks of {name}',
  'liste.sousTaches.reordonner': 'Reorder',

  // « Réordonner » les sous-tâches
  'liste.reordonner.monter': 'Move {name} up',
  'liste.reordonner.descendre': 'Move {name} down',
  'liste.reordonner.glisser': 'Drag to move',
  'liste.reordonner.termine': 'Done',
  'liste.reordonner.position': '“{name}” in position {position} of {total}',

  // Feuille « Nouvelle sous-tâche »
  'liste.sousTaches.champ': 'Subtask name',
  'liste.ajouter': 'Add',
  'liste.sousTaches.nouvelle': 'New subtask',
  'liste.sousTaches.ajoutee': '“{name}” added',

  // Actions au bout de la ligne (ordinateur), « Réserver »
  'liste.pc.modifier.astuce': 'Edit · E',
  'liste.pc.supprimer.astuce': 'Delete · Del',
  'liste.envies.reserver.nom': 'Reserve {name}',
  'liste.envies.horsLigne': 'Reserving, chipping in or leaving needs a connection.',
  'liste.envies.reserve': 'Wish reserved',
  'liste.envies.reserver': 'Reserve',

  // Photo en plein écran (courses, tâches, envies)
  'liste.photo.alt.courses': 'Photo of {name}',
  'liste.photo.alt.taches': 'Photo of {name}',
  'liste.photo.alt.envies': 'Photo of {name}',

  // Supprimer, cocher (messages avec « Annuler »)
  'liste.supprime.avecSousTaches': {
    one:'“{name}” and its subtask deleted',
    other: '“{name}” and {count} subtasks deleted',
  },
  'liste.supprime': '“{name}” deleted',
  'liste.annuler.pc': 'Undo (Ctrl+Z)',
  'liste.annuler': 'Undo',
  // Bouton « Annuler » de la fiche sur ordinateur (fermer sans enregistrer)
  'liste.fiche.annuler': 'Cancel',
  'liste.coche.avecSousTaches': {
    one:'“{name}” and its subtask checked',
    other: '“{name}” and {count} subtasks checked',
  },
  'liste.prochaineFois': 'Next time: {date}',

  // « Tout remettre à acheter » / « Tout rouvrir » ({items} : « 3 articles »)
  'liste.rouvrir.courses.titre': 'Put {items} back on the list?',
  'liste.rouvrir.titre': 'Reopen {items}?',
  'liste.rouvrir.courses.texte.magasin': {
    one:'It\'ll go back to its store, unchecked.',
    other: 'They\'ll go back to their stores, unchecked.',
  },
  'liste.rouvrir.courses.texte.rayon': {
    one:'It\'ll go back to its aisle, unchecked.',
    other: 'They\'ll go back to their aisles, unchecked.',
  },
  'liste.rouvrir.texte': {
    one:'It\'ll go back to the list, unchecked.',
    other: 'They\'ll go back to the list, unchecked.',
  },
  'liste.confirmer': 'Confirm',
  'liste.rouvrir.courses.fait': '{items} back on the list',
  'liste.rouvrir.fait': {
    one:'{items} reopened',
    other: '{items} reopened',
  },

  // « Retirer du panier » / « Retirer les terminés »
  'liste.retirerCoches.titre': 'Remove {items} from the list?',
  'liste.retirerCoches.texte': {
    one:'It will be deleted for everyone.',
    other: 'They will be deleted for everyone.',
  },
  'liste.retirerCoches.avertissement': {
    one:'This is permanent: there\'s no way to get it back.',
    other: 'This is permanent: there\'s no way to get them back.',
  },
  'liste.retirer': 'Remove',
  'liste.retirerCoches.fait': {
    one:'{items} removed',
    other: '{items} removed',
  },

  // Ajout : suggestions et « Souvent ajoutés »
  'liste.suggestions': 'Suggestions',
  'liste.souvent.remis': 'Back on the list: {name}',
  'liste.souvent.ajoute': 'Added: {name}',
  'liste.souvent.retirer.nom': 'Remove {name} from “Often added”',
  'liste.souvent.retire': 'Removed from “Often added”: {name}',
  'liste.fermer': 'Close',
  'liste.souvent.titre': 'Often added',
  'liste.ajout.nouveau': 'Add “{text}”',
  // Plusieurs éléments d'un coup : « 2 sur 3 », puis « 3 articles ajoutés »
  'liste.ajout.etape': '{index} of {total}',
  'liste.ajout.plusieurs': '{items} added',

  // Rayon ou magasin d'un nouvel article (listes de courses seulement)
  'liste.place.magasin.connu': '“{name}” has never been bought at these stores before. Its store will be remembered for next time.',
  'liste.place.magasin.nouveau': '“{name}” is a new item. Its store will be remembered for next time.',
  'liste.place.magasin.titre': 'Which store?',
  'liste.place.ajouter': 'Add to list',
  'liste.place.rayon.titre': 'Which aisle?',
  'liste.place.rayon.nouveau': '“{name}” is a new item. Its aisle will be remembered for next time.',

  // Réservation d'un souhait
  'liste.envies.ouvert.detail': 'Other friends and family can chip in on the gift.',
  'liste.envies.pasReserve': 'Not reserved yet',
  'liste.envies.participer': 'Chip in',
  'liste.envies.participez': 'You\'re chipping in',
  'liste.envies.quitter': 'Leave',
  'liste.envies.neParticipezPlus': 'You\'re no longer chipping in',
  'liste.envies.neParticipePlus': '{name} is no longer chipping in',
  'liste.envies.retirer.nom': 'Remove {name}',
  'liste.envies.liberer': 'Release',
  'liste.envies.liberee': 'Reservation released',
  'liste.envies.reservation': 'Reservation',
  'liste.envies.jamaisMontrees': 'Reservations are never shown to {name}.',
  'liste.envies.ouvrirLien': 'Open link',

  // Fiche « Modifier » : lien et prix (souhait), rayon, magasin
  'liste.fiche.lien': 'Link (optional)',
  'liste.fiche.prix.exemple': 'e.g. 24.90',
  'liste.fiche.prix': 'Approximate price (optional)',
  'liste.fiche.prix.unite': 'in {currency}',
  'liste.rayon': 'Aisle',
  'liste.choisir': 'Choose',
  'liste.magasin': 'Store',

  // Fiche : priorité et échéance
  'liste.fiche.priorite.basse': 'Low',
  'liste.fiche.priorite.normale': 'Normal',
  'liste.fiche.priorite.elevee': 'High',
  'liste.effacer': 'Clear',
  'liste.fiche.aucuneEcheance': 'No due date',
  'liste.fiche.echeance.choisir': 'Due date: {label}. Choose a date',

  // Fiche : se répète
  'liste.fiche.repete.jours': 'Days of the week',
  // Jour du mois : forme exacte pour le 1er (ordinal ; en anglais, aussi
  // « 2nd », « 3rd », « 21st »…)
  'liste.fiche.repete.leJour': {
    '=1': 'The 1st',
    '=2': 'The 2nd',
    '=3': 'The 3rd',
    '=21': 'The 21st',
    '=22': 'The 22nd',
    '=23': 'The 23rd',
    '=31': 'The 31st',
    other: 'The {count}th',
  },
  'liste.fiche.repete.mode.jourMois.choix': 'A day of the month (the 5th)',
  'liste.fiche.repete.mode.jourSemaine.choix': 'A day of the week (the 1st Monday)',
  // « Le 1er », « Le dernier » ({rank} vient de repeat.js)
  'liste.fiche.repete.leRang': 'The {rank}',
  'liste.fiche.passer': 'Skip this time',
  'liste.fiche.jamais': 'Never',
  'liste.fiche.repete.changer': 'Repeats: {label}. Change',
  'liste.fiche.repete.mode.jourSemaine': 'A day of the week',
  'liste.fiche.repete.mode.jourMois': 'A day of the month',
  'liste.fiche.repete.mode.changer': 'Every month: {label}. Change',
  'liste.fiche.repete.rang.changer': 'Which one in the month: {label}. Change',
  'liste.fiche.repete.jourSemaine.changer': 'Day of the week: {label}. Change',
  'liste.fiche.repete.chaqueMois.premier': 'The 1st of every month',
  // Ordinal (forme exacte pour le 1er ; en anglais, aussi « 2nd », « 3rd »…)
  'liste.fiche.repete.chaqueMois': {
    '=1': 'The 1st of every month',
    '=2': 'The 2nd of every month',
    '=3': 'The 3rd of every month',
    '=21': 'The 21st of every month',
    '=22': 'The 22nd of every month',
    '=23': 'The 23rd of every month',
    '=31': 'The 31st of every month',
    other: 'The {count}th of every month',
  },
  'liste.fiche.repete.jourMois.changer': 'Day of the month: {label}. Change',

  // Fiche : heure et rappel
  'liste.fiche.heure': 'Time (optional)',
  'liste.fiche.rappel': 'Reminder',
  'liste.fiche.aucuneHeure': 'No time',
  'liste.fiche.heure.choisir': 'Time: {label}. Choose a time',
  'liste.fiche.rappel.changer': 'Reminder: {label}. Change',
  'liste.fiche.rappel.aide.pour': 'A notification to the person chosen in “For”, otherwise to all members, if their notifications are on.',
  'liste.fiche.rappel.aide': 'A notification to all members of the list, if their notifications are on.',
  'liste.fiche.priorite': 'Priority',

  // Fiche : date (raccourcis)
  'liste.fiche.date.semaine': 'In 1 week',
  'liste.fiche.date.semaine.lecture': 'In one week',
  'liste.fiche.date': 'Date',
  'liste.fiche.date.aujourdhui': 'Today',
  'liste.fiche.date.demain': 'Tomorrow',

  // Fiche : pour (attribution)
  'liste.fiche.pour.personnes': 'People',
  'liste.fiche.ancienMembre': 'Former member',
  'liste.fiche.pour.plusieurs.choix': 'Several people…',
  'liste.fiche.pour.tour.choix': 'Take turns…',
  'liste.fiche.pour.plusieurs': 'Several people',
  'liste.fiche.pour.tour': 'Take turns',
  'liste.fiche.pour.changer': 'For: {label}. Change',
  'liste.fiche.pour.rang': '{name}, number {rank} in the rotation',
  'liste.fiche.pour.plusieurs.aide': 'The task goes to each person chosen (at least two); the first one to check it completes it.',
  'liste.fiche.pour.tour.aide.cetteFois': 'Tap people in turn order (at least two). This time: {name}.',
  'liste.fiche.pour.tour.aide': 'Tap people in turn order (at least two).',
  'liste.fiche.pour': 'For',
  'liste.fiche.repete': 'Repeats',

  // Fiche : sous-pages et « Sous-tâche de »
  'liste.fiche.retour': 'Back to details',
  'liste.fiche.echeance': 'Due date',
  'liste.fiche.sousTacheDe': 'Subtask of',
  'liste.fiche.parent.aDesSousTaches': {
    one:'This task has a subtask, so it can\'t become a subtask.',
    other: 'This task has {count} subtasks, so it can\'t become a subtask.',
  },
  'liste.fiche.parent.repete': 'A repeating task can\'t become a subtask: remove the repeat first.',
  'liste.fiche.parent.aucune': 'None (main task)',

  // Fiche : résumés des sous-pages
  'liste.fiche.resume.rappel': 'reminder {label}',
  'liste.fiche.resume.tour.cetteFois': 'Take turns: {names} · this time: {name}',
  'liste.fiche.resume.tour': 'Take turns: {names}',
  'liste.fiche.resume.tacheSupprimee': 'Deleted task',
  'liste.fiche.resume.principale': {
    one: 'Main task · {count} subtask',
    other: 'Main task · {count} subtasks',
  },
  'liste.fiche.resume.aucune': 'None',
  'liste.fiche.sousPage.modifier': '{title}: {text}. Edit',

  // Fiche : code-barres
  'liste.fiche.codeBarres.effacer': 'Clear barcode',
  'liste.fiche.codeBarres.scanner': 'Scan a barcode',
  'liste.fiche.codeBarres': 'Barcode',
  'liste.fiche.codeBarres.format': '8, 12 or 13 digits',
  'liste.fiche.codeBarres.double': '“{name}” already has this barcode in the list.',
  'liste.fiche.codeBarres.lecture': 'Reading barcode…',
  'liste.fiche.codeBarres.nonLu': 'Couldn\'t read the code. Try again closer, holding it flat, or type it in.',
  'liste.fiche.codeBarres.illisible': 'This file isn\'t a readable image. Try again with a photo, or type the code.',
  'liste.fiche.codeBarres.indisponible': 'Barcode reading isn\'t available right now (the first scan needs a network connection). You can type the code.',

  // Fiche : photo (une phrase par sorte de liste : courses, tâches, envies)
  'liste.photo.titre.courses': 'Item photo',
  'liste.photo.titre.taches': 'Item photo',
  'liste.photo.titre.envies': 'Wish photo',
  'liste.photo.changer': 'Change photo',
  'liste.photo.retirer': 'Remove photo',
  'liste.photo.ajouter': 'Add a photo',
  'liste.photo.preparation': 'Preparing photo…',
  'liste.photo.enAttente': 'Photo waiting to upload: it will be sent as soon as possible.',
  'liste.photo.retirer.question': 'Remove the photo?',
  'liste.photo.retirer.texte': 'The photo will be deleted for everyone on the list.',

  // Fiche : modifiée ou supprimée par une autre personne (courses, tâches, envies)
  'liste.fiche.conflit.supprime.courses': 'This item was deleted by someone else.',
  'liste.fiche.conflit.supprime.taches': 'This item was deleted by someone else.',
  'liste.fiche.conflit.supprime.envies': 'This wish was deleted by someone else.',
  'liste.fiche.conflit.modifie.courses': 'Someone else just changed this item. Only your changes will be saved.',
  'liste.fiche.conflit.modifie.taches': 'Someone else just changed this item. Only your changes will be saved.',
  'liste.fiche.conflit.modifie.envies': 'Someone else just changed this wish. Only your changes will be saved.',

  // Fiche : en-tête, pied et champs (titre et suppression : courses, tâches, envies)
  'liste.fiche.supprimer.courses': 'Delete item',
  'liste.fiche.supprimer.taches': 'Delete item',
  'liste.fiche.supprimer.envies': 'Delete wish',
  'liste.enregistrer': 'Save',
  // Touche du clavier écrite sur le bouton « Enregistrer » (ordinateur)
  'liste.fiche.touche.ctrl': 'Ctrl',
  'liste.fiche.nonEnregistre': 'Unsaved changes',
  'liste.fiche.quantite': 'Quantity',
  'liste.fiche.quantite.exemple': 'e.g. 2 or 500 g',
  'liste.fiche.note': 'Note (optional)',
  'liste.fiche.photo': 'Photo (optional)',
  'liste.fiche.titre.courses': 'Edit item',
  'liste.fiche.titre.taches': 'Edit item',
  'liste.fiche.titre.envies': 'Edit wish',
  'liste.fiche.abandonner.question': 'Discard changes?',
  'liste.fiche.abandonner.texte': 'What you changed here won\'t be saved.',
  'liste.fiche.abandonner': 'Discard',
  'liste.fiche.continuer': 'Keep editing',

  // Fiche : erreurs à l'enregistrement
  'liste.fiche.erreur.nom': 'A name is required',
  'liste.fiche.erreur.codeBarres': 'Invalid code: check the digits',
  'liste.fiche.erreur.lien': 'Invalid web address (http or https)',
  'liste.fiche.erreur.prix': 'Invalid price (for example 24.90)',
  'liste.fiche.erreur.deuxPersonnes': 'Choose at least two people.',
  'liste.fiche.erreur.sousTacheRepete': 'A subtask can\'t repeat: remove the repeat first.',

  // Fiche à consulter (lecture seule) ; avertissement et titre : courses, tâches, envies
  'liste.detail.lectureSeule.courses': 'Read-only list: this item can\'t be edited.',
  'liste.detail.lectureSeule.taches': 'Read-only list: this item can\'t be edited.',
  'liste.detail.lectureSeule.envies': 'Read-only list: this wish can\'t be edited.',
  'liste.detail.prix': 'Approximate price',
  'liste.detail.note': 'Note',
  'liste.detail.echeance.heure': '{date} at {time}',
  'liste.detail.photo': 'Photo',
  'liste.detail.titre.courses': 'Item details',
  'liste.detail.titre.taches': 'Item details',
  'liste.detail.titre.envies': 'Wish details',

  // Choix du rayon ou du magasin
  'liste.choix.nouveauRayon': 'New aisle…',

  // « Ranger les articles » : après un changement de magasin, les articles qui ont perdu leur rayon
  'liste.ranger.titre': 'Put items in aisles',
  'liste.ranger.texte.magasin': {
    one: 'This item is now in “No aisle”: its aisle doesn\'t exist at {store}. Choose one now, or later from its details.',
    other: 'These {count} items are now in “No aisle”: their aisle doesn\'t exist at {store}. Choose new ones now, or later from their details.',
  },
  'liste.ranger.texte.sansMagasin': {
    one: 'This item is now in “No aisle”: its aisle belonged to the previous store. Choose one now, or later from its details.',
    other: 'These {count} items are now in “No aisle”: their aisle belonged to the previous store. Choose new ones now, or later from their details.',
  },
  'liste.ranger.rayonDe': 'Aisle for “{name}”',
  'liste.ranger.termine': 'Done',
  'liste.choix.nouveauMagasin': 'New store…',

  // Droit changé pendant que la liste est ouverte
  'liste.droit.modification': 'You can now edit this list.',
  'liste.droit.lectureSeule': 'This list is now read only.',
};
