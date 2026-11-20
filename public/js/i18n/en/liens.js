// Textes de server/shares.js, server/routes/shares.js, server/routes/public.js, server/reservations.js (réponses du serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/liens.js.

export default {
  // Lien public, côté propriétaire (routes/shares.js)
  'liens.listeIntrouvable': 'List not found.',
  'liens.dureeInvalide': 'Invalid duration: from 1 hour to 365 days, or unlimited.',
  'liens.protectInvalide': 'Invalid “protect” value.',
  'liens.passwordInvalide': 'Invalid “password” value (“new” or “none”).',
  'liens.dejaActif': 'A link is already active for this list.',
  'liens.sansMotDePasse': 'This link has no password.',
  'liens.arrete': 'This link has just been stopped.',

  // Lien public, côté visiteur (routes/public.js). Lien inconnu, expiré,
  // arrêté… : toujours le même message
  'liens.public.invalide': 'Link expired or not found.',
  'liens.public.tropDEssais': 'Too many attempts, try again later.',
  'liens.public.motDePasse.incorrect': 'Incorrect password.',
  'liens.public.motDePasse.requis': 'Password required.',
  'liens.public.tropDActions': 'Too many actions in a short time. Try again in a few minutes.',
  'liens.public.requeteInvalide': 'Invalid request.',
  'liens.public.photoIntrouvable': 'Photo not found.',
  'liens.public.requeteMalFormee': 'Malformed request.',
  'liens.public.requeteTropVolumineuse': 'Request too large.',
  'liens.public.erreurInterne': 'Internal server error.',

  // Réservations des souhaits (reservations.js)
  'liens.envies.introuvable': 'Not found: it may have been deleted in the meantime.',
  'liens.envies.horsEnvies': 'Reservations only exist in wish lists.',
  'liens.envies.beneficiaire': 'You can\'t reserve wishes on your own list.',
  'liens.envies.dejaReserve': 'Already reserved.',
  'liens.envies.dejaParticipant': 'You\'re already chipping in for this gift.',
  'liens.envies.recu': 'This wish has already been received.',
  'liens.envies.nonReserve': 'This wish isn\'t reserved.',
  'liens.envies.nonParticipant': 'You\'re not chipping in for this gift.',
  'liens.envies.participantsSeulement': 'Only the people chipping in can open or close the reservation.',
  'liens.envies.gestionnaireSeulement': 'Only the list owner can do that.',
  'liens.envies.ouvertInvalide': 'Invalid “open to others” value (true or false).',
  // Visiteurs du lien public ({max} : longueur maximale du prénom)
  'liens.envies.prenomInvalide': 'Enter your first name (1 to {max} characters).',
  'liens.envies.limiteVisiteur': 'You have already reserved a lot of wishes with this link. Cancel one to reserve another.',
  'liens.envies.souhaitComplet': 'This wish can\'t take any more contributions through the link. Ask the person who sent it to you.',
  'liens.envies.lienComplet': 'This link has reached its reservation limit. Ask the person who sent it to you.',
};
