// Textes de public/js/public.js (page d'une liste ouverte par son lien public), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/lienpublic.js.

export default {
  // Messages plein écran
  'lienpublic.tropEssais.texte': 'Too many attempts, try again later.',
  'lienpublic.invalide': 'Link expired or not found',
  'lienpublic.invalide.texte': 'This link is no longer valid. Ask the person who sent it for a new link.',
  'lienpublic.reseau': 'List unavailable',
  'lienpublic.reseau.texte': 'Can\'t reach Listo. Check your connection, then reload the page.',
  'lienpublic.tropEssais': 'Too many attempts',

  // Saisie du mot de passe
  'lienpublic.ouvrir': 'Open',
  'lienpublic.motDePasse': 'Password',
  'lienpublic.motDePasse.manquant': 'Enter the password.',
  'lienpublic.injoignable': 'Can\'t reach Listo. Try again.',
  'lienpublic.motDePasse.incorrect': 'Incorrect password',
  'lienpublic.protegee': 'Protected list',
  'lienpublic.protegee.texte': 'Enter the password you received with the link.',

  // La liste en lecture seule
  'lienpublic.actualiser': 'Refresh',
  'lienpublic.groupe.restants': '{many} left',
  'lienpublic.sansMagasin': 'No store',
  'lienpublic.sansRayon': 'No aisle',
  'lienpublic.vide': 'This list is empty',
  'lienpublic.lectureSeule': 'Read only',
  'lienpublic.pour': 'For {name}',
  'lienpublic.misAJour': 'Updated at {time}',
  'lienpublic.expire': 'This link expires on {date}',
  'lienpublic.sansExpiration': 'This link has no expiration date',

  // Page publique d'une note (étape 3 des notes)
  'lienpublic.note.protegee': 'Protected note',
  'lienpublic.note.reseau': 'Note unavailable',
  'lienpublic.note.sansTitre': 'Untitled note',
  'lienpublic.note.modifiee': 'Changed {date}',
  'lienpublic.note.vide': 'This note is empty',

  // Prénom du visiteur (liste d'envies)
  'lienpublic.prenom': 'Your first name',
  'lienpublic.prenom.aide': 'The family and friends who manage the list will see it, never the other visitors.',
  'lienpublic.continuer': 'Continue',
  'lienpublic.prenom.erreur': 'Enter your first name (1 to {max} characters).',
  'lienpublic.prenom.titre': 'Who\'s reserving?',
  'lienpublic.fermer': 'Close',

  // Réserver ou participer : résultat annoncé
  'lienpublic.annonce.participe': 'You\'re chipping in: {name}',
  'lienpublic.annonce.reserve': 'Reserved: {name}',
  'lienpublic.annonce.neParticipePlus': 'You\'re no longer chipping in: {name}',
  'lienpublic.annonce.impossible': 'Can\'t do that right now.',

  // Réserver ou participer : état et bouton d'un souhait
  'lienpublic.action.libelle': '{label}: {name}',
  'lienpublic.jeParticipe': 'I\'m in',
  'lienpublic.annuler': 'Cancel',
  'lienpublic.reserveOuvert': 'Reserved · open to others',
  'lienpublic.participer': 'Chip in',
  'lienpublic.reserve': 'Reserved',
  'lienpublic.reserver': 'Reserve',

  // Pastilles (priorité, prix, échéance, répétition), lues par les lecteurs d'écran
  'lienpublic.pastille.priorite': 'Priority',
  'lienpublic.pastille.prix': 'Approximate price:',
  'lienpublic.pastille.echeance': 'Due:',
  'lienpublic.pastille.repetition': 'Repeats:',

  // Ligne d'un élément
  'lienpublic.recu': 'Received',
  'lienpublic.pasEncoreRecu': 'Not received yet',
  'lienpublic.coche': 'Checked',
  'lienpublic.nonCoche': 'Not checked',
  'lienpublic.voir': 'View {name}',
  'lienpublic.photo.agrandir': 'Enlarge photo of {name}',
  'lienpublic.sousTaches.faites': {
    one: 'subtasks: {count} of {total} done',
    other: 'subtasks: {count} of {total} done',
  },
  'lienpublic.sousTaches.de': 'Subtasks of {name}',
  'lienpublic.repetition': 'repeats: {rule}',

  // Fiche d'un élément et photo agrandie (titre, avertissement et photo :
  // une phrase par sorte de liste, courses, tâches, envies)
  'lienpublic.fiche.titre.courses': 'Item details',
  'lienpublic.fiche.titre.taches': 'Item details',
  'lienpublic.fiche.titre.envies': 'Wish details',
  'lienpublic.fiche.lectureSeule.courses': 'Read-only list: this item can\'t be edited.',
  'lienpublic.fiche.lectureSeule.taches': 'Read-only list: this item can\'t be edited.',
  'lienpublic.fiche.lectureSeule.envies': 'Read-only list: this wish can\'t be edited.',
  'lienpublic.fiche.lien': 'Open link',
  'lienpublic.fiche.photo': 'Photo',
  'lienpublic.photo.fermer': 'Close photo',
  'lienpublic.photo.alt.courses': 'Photo of {name}',
  'lienpublic.photo.alt.taches': 'Photo of {name}',
  'lienpublic.photo.alt.envies': 'Photo of {name}',
};
