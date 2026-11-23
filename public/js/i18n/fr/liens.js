// Textes de server/shares.js, server/routes/shares.js, server/routes/public.js, server/reservations.js (réponses du serveur), en français.
// Chaque nom commence par « liens. ».

export default {
  // Lien public, côté propriétaire (routes/shares.js)
  'liens.listeIntrouvable': 'Liste introuvable.',
  'liens.dureeInvalide': 'Durée invalide : de 1 heure à 365 jours, ou illimitée.',
  'liens.protectInvalide': 'Valeur « protect » invalide.',
  'liens.passwordInvalide': 'Valeur « password » invalide (« new » ou « none »).',
  'liens.dejaActif': 'Un lien est déjà actif pour cette liste.',
  // Lien public d'une note (server/routes/notes.js)
  'liens.dejaActifNote': 'Un lien est déjà actif pour cette note.',
  'liens.sansMotDePasse': 'Ce lien n\'a pas de mot de passe.',
  'liens.arrete': 'Ce lien vient d\'être arrêté.',

  // Lien public, côté visiteur (routes/public.js). Lien inconnu, expiré,
  // arrêté… : toujours le même message
  'liens.public.invalide': 'Lien expiré ou inexistant.',
  'liens.public.tropDEssais': 'Trop d\'essais, réessayez plus tard.',
  'liens.public.motDePasse.incorrect': 'Mot de passe incorrect.',
  'liens.public.motDePasse.requis': 'Mot de passe requis.',
  'liens.public.tropDActions': 'Trop d\'actions en peu de temps. Réessayez dans quelques minutes.',
  'liens.public.requeteInvalide': 'Requête invalide.',
  'liens.public.photoIntrouvable': 'Photo introuvable.',
  'liens.public.requeteMalFormee': 'Requête mal formée.',
  'liens.public.requeteTropVolumineuse': 'Requête trop volumineuse.',
  'liens.public.erreurInterne': 'Erreur interne du serveur.',

  // Réservations des souhaits (reservations.js)
  'liens.envies.introuvable': 'Introuvable, peut-être supprimé entre-temps.',
  'liens.envies.horsEnvies': 'La réservation n\'existe que dans les listes d\'envies.',
  'liens.envies.beneficiaire': 'Vous ne réservez pas les souhaits de votre propre liste.',
  'liens.envies.dejaReserve': 'Déjà réservé.',
  'liens.envies.dejaParticipant': 'Vous participez déjà à ce cadeau.',
  'liens.envies.recu': 'Ce souhait est déjà reçu.',
  'liens.envies.nonReserve': 'Ce souhait n\'est pas réservé.',
  'liens.envies.nonParticipant': 'Vous ne participez pas à ce cadeau.',
  'liens.envies.participantsSeulement': 'Seuls les participants peuvent ouvrir ou fermer la réservation.',
  'liens.envies.gestionnaireSeulement': 'Seul le gestionnaire de la liste peut faire cela.',
  'liens.envies.ouvertInvalide': 'Valeur « ouvert à d\'autres » invalide (true ou false).',
  // Visiteurs du lien public ({max} : longueur maximale du prénom)
  'liens.envies.prenomInvalide': 'Indiquez votre prénom (1 à {max} caractères).',
  'liens.envies.limiteVisiteur': 'Vous avez déjà réservé beaucoup de souhaits sur ce lien. Annulez-en un pour en réserver un autre.',
  'liens.envies.souhaitComplet': 'Ce souhait ne peut plus recevoir de participation par le lien. Demandez à la personne qui vous l\'a envoyé.',
  'liens.envies.lienComplet': 'Ce lien a atteint son nombre de réservations. Demandez à la personne qui vous l\'a envoyé.',
};
