// Textes de public/js/format.js, en français.
// Chaque nom commence par « format. ».

export default {
  // Date relative courte
  'format.relatif.instant': 'à l\'instant',
  'format.relatif.minutes': 'il y a {minutes} min',
  'format.relatif.heures': 'il y a {hours} h',
  'format.relatif.hier': 'hier',

  // Liste des prénoms : « Guillaume, Léa et Marie »
  'format.prenoms.et': '{first} et {last}',

  // Réglages › À propos : version et mise à jour
  'format.version.nonPrecisee': 'non précisée',
  'format.version.horsLigne': 'indisponible hors ligne',
  'format.version.pastille.horsLigne': 'Hors ligne',
  'format.version.nouvelle': 'Nouvelle version : {short}',
  'format.version.nouvelle.label': 'Nouvelle version disponible : {short}, ouvrir sur GitHub',
  'format.version.impossible': 'Vérification impossible',
  'format.version.verifie': 'Vérifié {when}',

  // Bouton de tri de « Mes listes »
  'format.tri.alpha.label': 'Tri : ordre alphabétique. Appuyer pour trier par plus récentes',
  'format.tri.alpha': 'Tri : ordre alphabétique',
  'format.tri.recentes.label': 'Tri : plus récentes d\'abord. Appuyer pour trier par ordre alphabétique',
  'format.tri.recentes': 'Tri : plus récentes d\'abord',

  // Pastille d'échéance
  'format.echeance.jourHeure': '{day} · {time}',
  'format.jourAHeure': '{day} à {time}',
  'format.echeance.label': 'Échéance : {when}',
  'format.echeance.retard': 'En retard · {when}',
  'format.echeance.label.retard': 'Échéance : {when}, en retard',
  'format.echeance.aujourdhui.parle': 'aujourd\'hui',
  'format.echeance.aujourdhui': 'Aujourd\'hui',
  'format.echeance.demain': 'Demain',
  'format.echeance.demain.parle': 'demain',

  // Nouveautés : repère d'une ligne
  'format.nouveaute.ajoute': 'Ajouté par {name}',
  'format.nouveaute.coche': 'Coché par {name}',
  'format.nouveaute.decoche': 'Décoché par {name}',
  'format.nouveaute.modifie': 'Modifié par {name}',

  // Pastille de « Mes listes » (lecteurs d'écran)
  'format.nouveautes.plusDe30': 'plus de 30 nouveautés',
  'format.nouveautes.une': '{text} nouveauté',
  'format.nouveautes.plusieurs': '{text} nouveautés',

  // Priorité
  'format.priorite.basse': 'Basse',
  'format.priorite.normale': 'Normale',
  'format.priorite.elevee': 'Élevée',

  // Fiche d'un article sur la page du lien public
  'format.fiche.etat.recu': 'Reçu',
  'format.fiche.etat.pasRecu': 'Pas encore reçu',
  'format.fiche.etat.panier': 'Coché, dans le panier',
  'format.fiche.etat.termine': 'Coché, terminé',
  'format.fiche.etat.acheter': 'À acheter',
  'format.fiche.etat.faire': 'À faire',
  'format.fiche.etat': 'État',
  'format.fiche.quantite': 'Quantité',
  'format.fiche.prix': 'Prix indicatif',
  'format.fiche.note': 'Note',
  'format.fiche.priorite': 'Priorité',
  'format.fiche.echeance': 'Échéance',
  'format.fiche.echeance.aucune': 'Aucune échéance',
  'format.fiche.repetition': 'Se répète',
  'format.fiche.codeBarres': 'Code-barres',
  'format.fiche.rayon': 'Rayon',
  'format.fiche.rayon.aucun': 'Sans rayon',
  'format.fiche.magasin': 'Magasin',
  'format.fiche.magasin.aucun': 'Sans magasin',

  // Pastille de priorité (lecteurs d'écran)
  'format.priorite.elevee.label': 'Priorité élevée',
  'format.priorite.basse.label': 'Priorité basse',

  // Temps restant avant l'expiration d'un lien public
  'format.reste.expire': 'Expiré',
  'format.reste.jours': 'Il reste {days} jours',
  'format.reste.heures': 'Il reste {hours} heures',
  'format.reste.minutes': 'Il reste {minutes} minutes',
  'format.reste.moinsUneMinute': 'Il reste moins d\'une minute',

  // Administration, onglet « Articles »
  'format.noms.listesCourses': { '=1': '{count} liste de courses', other: '{count} listes de courses' },
  'format.noms.utilisations': { '=1': '{count} utilisation', other: '{count} utilisations' },
  'format.noms.enListe': '{items} en liste',
  'format.noms.aucunEnListe': 'aucun {item} en liste',
  'format.correction.fusion': '« {oldName} » sera fusionné avec « {newName} », déjà enregistré.',
  'format.correction.renommage': '« {oldName} » deviendra « {newName} ».',
  'format.correction.impact.un': '{items} sera corrigé, dans {lists}.',
  'format.correction.impact.plusieurs': '{items} seront corrigés, dans {lists}.',
  'format.correction.impact.aucun': 'Aucun {item} en liste ne porte ce nom : seules les suggestions changent.',
  'format.correction.faite.suggestions': 'Nom corrigé dans les suggestions',
  'format.correction.faite.un': '{items} corrigé, dans {lists}',
  'format.correction.faite.plusieurs': '{items} corrigés, dans {lists}',

  // « Dupliquer la liste » : nom proposé pour la copie
  'format.copie': '{name} (copie)',
};
