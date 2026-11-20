// Textes de public/js/format.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/format.js.

export default {
  // Date relative courte
  'format.relatif.instant': 'just now',
  'format.relatif.minutes': '{minutes} min ago',
  'format.relatif.heures': '{hours} hr ago',
  'format.relatif.hier': 'yesterday',

  // Réglages › À propos : version et mise à jour
  'format.version.nonPrecisee': 'not specified',
  'format.version.horsLigne': 'unavailable offline',
  'format.version.pastille.horsLigne': 'Offline',
  'format.version.nouvelle': 'New version: {short}',
  'format.version.nouvelle.label': 'New version available: {short}, open on GitHub',
  'format.version.impossible': "Couldn't check",
  'format.version.verifie': 'Checked {when}',

  // Bouton de tri de « Mes listes »
  'format.tri.alpha.label': 'Sort: alphabetical. Tap to sort by most recent',
  'format.tri.alpha': 'Sort: alphabetical',
  'format.tri.recentes.label': 'Sort: most recent first. Tap to sort alphabetically',
  'format.tri.recentes': 'Sort: most recent first',

  // Pastille d'échéance
  'format.echeance.jourHeure': '{day} · {time}',
  'format.jourAHeure': '{day} at {time}',
  'format.echeance.label': 'Due: {when}',
  'format.echeance.retard': 'Overdue · {when}',
  'format.echeance.label.retard': 'Due: {when}, overdue',
  'format.echeance.aujourdhui.parle': 'today',
  'format.echeance.aujourdhui': 'Today',
  'format.echeance.demain': 'Tomorrow',
  'format.echeance.demain.parle': 'tomorrow',

  // Nouveautés : repère d'une ligne
  'format.nouveaute.ajoute': 'Added by {name}',
  'format.nouveaute.coche': 'Checked by {name}',
  'format.nouveaute.decoche': 'Unchecked by {name}',
  'format.nouveaute.modifie': 'Edited by {name}',

  // Pastille de « Mes listes » (lecteurs d'écran)
  'format.nouveautes.plusDe30': 'more than 30 new updates',
  'format.nouveautes': { one: '{count} new update', other: '{count} new updates' },

  // Priorité
  'format.priorite.basse': 'Low',
  'format.priorite.normale': 'Normal',
  'format.priorite.elevee': 'High',

  // Fiche d'un article sur la page du lien public
  'format.fiche.etat.recu': 'Received',
  'format.fiche.etat.pasRecu': 'Not received yet',
  'format.fiche.etat.panier': 'Checked, in the cart',
  'format.fiche.etat.termine': 'Checked, done',
  'format.fiche.etat.acheter': 'To buy',
  'format.fiche.etat.faire': 'To do',
  'format.fiche.etat': 'Status',
  'format.fiche.quantite': 'Quantity',
  'format.fiche.prix': 'Approximate price',
  'format.fiche.note': 'Note',
  'format.fiche.priorite': 'Priority',
  'format.fiche.echeance': 'Due date',
  'format.fiche.echeance.aucune': 'No due date',
  'format.fiche.repetition': 'Repeats',
  'format.fiche.codeBarres': 'Barcode',
  'format.fiche.rayon': 'Aisle',
  'format.fiche.rayon.aucun': 'No aisle',
  'format.fiche.magasin': 'Store',
  'format.fiche.magasin.aucun': 'No store',

  // Pastille de priorité (lecteurs d'écran)
  'format.priorite.elevee.label': 'High priority',
  'format.priorite.basse.label': 'Low priority',

  // Temps restant avant l'expiration d'un lien public
  'format.reste.expire': 'Expired',
  'format.reste.jours': '{days} days left',
  'format.reste.heures': '{hours} hours left',
  'format.reste.minutes': '{minutes} minutes left',
  'format.reste.moinsUneMinute': 'Less than a minute left',

  // Administration, onglet « Articles » (seules les listes de courses
  // mémorisent des noms : toujours « article » ; {lists} : « 2 listes de courses »)
  'format.noms.listesCourses': { one: '{count} shopping list', other: '{count} shopping lists' },
  'format.noms.utilisations': { one: '{count} use', other: '{count} uses' },
  'format.noms.enListe': { one: '{count} item on a list', other: '{count} items on lists' },
  'format.noms.aucunEnListe': 'no items on lists',
  'format.correction.fusion': '“{oldName}” will be merged into “{newName}”, which is already saved.',
  'format.correction.renommage': '“{oldName}” will become “{newName}”.',
  'format.correction.impact': { one: '{count} item will be corrected, in {lists}.', other: '{count} items will be corrected, in {lists}.' },
  'format.correction.impact.aucun': 'No item on a list has this name: only the suggestions will change.',
  'format.correction.faite.suggestions': 'Name corrected in the suggestions',
  'format.correction.faite': { one: '{count} item corrected, in {lists}', other: '{count} items corrected, in {lists}' },

  // « Dupliquer la liste » : nom proposé pour la copie
  'format.copie': '{name} (copy)',
};
