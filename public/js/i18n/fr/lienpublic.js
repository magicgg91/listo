// Textes de public/js/public.js (page d'une liste ouverte par son lien public), en français.
// Chaque nom commence par « lienpublic. ».

export default {
  // Messages plein écran
  'lienpublic.tropEssais.texte': 'Trop d\'essais, réessayez plus tard.',
  'lienpublic.invalide': 'Lien expiré ou inexistant',
  'lienpublic.invalide.texte': 'Ce lien n\'est plus valide. Demander un nouveau lien à la personne qui l\'a envoyé.',
  'lienpublic.reseau': 'Liste indisponible',
  'lienpublic.reseau.texte': 'Impossible de joindre Listo. Vérifiez la connexion, puis rechargez la page.',
  'lienpublic.tropEssais': 'Trop d\'essais',

  // Saisie du mot de passe
  'lienpublic.ouvrir': 'Ouvrir',
  'lienpublic.motDePasse': 'Mot de passe',
  'lienpublic.motDePasse.manquant': 'Saisir le mot de passe.',
  'lienpublic.injoignable': 'Impossible de joindre Listo. Réessayez.',
  'lienpublic.motDePasse.incorrect': 'Mot de passe incorrect',
  'lienpublic.protegee': 'Liste protégée',
  'lienpublic.protegee.texte': 'Saisir le mot de passe reçu avec le lien.',

  // La liste en lecture seule
  'lienpublic.actualiser': 'Actualiser',
  'lienpublic.groupe.restants': '{many} restants',
  'lienpublic.sansMagasin': 'Sans magasin',
  'lienpublic.sansRayon': 'Sans rayon',
  'lienpublic.vide': 'Cette liste est vide',
  'lienpublic.lectureSeule': 'Lecture seule',
  'lienpublic.pour': 'Pour {name}',
  'lienpublic.misAJour': 'Mis à jour à {time}',
  'lienpublic.expire': 'Ce lien expire le {date}',
  'lienpublic.sansExpiration': 'Ce lien n\'a pas de date d\'expiration',

  // Prénom du visiteur (liste d'envies)
  'lienpublic.prenom': 'Votre prénom',
  'lienpublic.prenom.aide': 'Les proches qui gèrent la liste le verront, jamais les autres visiteurs.',
  'lienpublic.continuer': 'Continuer',
  'lienpublic.prenom.erreur': 'Indiquez votre prénom (1 à {max} caractères).',
  'lienpublic.prenom.titre': 'Qui réserve ?',
  'lienpublic.fermer': 'Fermer',

  // Réserver ou participer : résultat annoncé
  'lienpublic.annonce.participe': 'Vous participez : {name}',
  'lienpublic.annonce.reserve': 'Réservé : {name}',
  'lienpublic.annonce.neParticipePlus': 'Vous ne participez plus : {name}',
  'lienpublic.annonce.impossible': 'Action impossible pour le moment.',

  // Réserver ou participer : état et bouton d'un souhait
  'lienpublic.action.libelle': '{label} : {name}',
  'lienpublic.jeParticipe': 'Je participe',
  'lienpublic.annuler': 'Annuler',
  'lienpublic.reserveOuvert': 'Réservé · ouvert à d\'autres',
  'lienpublic.participer': 'Participer',
  'lienpublic.reserve': 'Réservé',
  'lienpublic.reserver': 'Réserver',

  // Pastilles (priorité, prix, échéance, répétition), lues par les lecteurs d'écran
  'lienpublic.pastille.priorite': 'Priorité',
  'lienpublic.pastille.prix': 'Prix indicatif :',
  'lienpublic.pastille.echeance': 'Échéance :',
  'lienpublic.pastille.repetition': 'Se répète :',

  // Ligne d'un élément
  'lienpublic.recu': 'Reçu',
  'lienpublic.pasEncoreRecu': 'Pas encore reçu',
  'lienpublic.coche': 'Coché',
  'lienpublic.nonCoche': 'Non coché',
  'lienpublic.voir': 'Voir {name}',
  'lienpublic.photo.agrandir': 'Agrandir la photo de {name}',
  'lienpublic.sousTaches.faites': {
    '=0': 'sous-tâches : {count} faite sur {total}',
    '=1': 'sous-tâches : {count} faite sur {total}',
    other: 'sous-tâches : {count} faites sur {total}',
  },
  'lienpublic.sousTaches.de': 'Sous-tâches de {name}',
  'lienpublic.repetition': 'se répète : {rule}',

  // Fiche d'un élément et photo agrandie
  'lienpublic.fiche.titre': 'Détail {of}',
  'lienpublic.fiche.lectureSeule': 'Liste en lecture seule : {what} ne peut pas être modifié.',
  'lienpublic.fiche.lien': 'Ouvrir le lien',
  'lienpublic.fiche.photo': 'Photo',
  'lienpublic.photo.fermer': 'Fermer la photo',
  'lienpublic.photo.alt': 'Photo {of} {name}',
};
