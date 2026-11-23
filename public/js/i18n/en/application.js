// Textes de public/js/app.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/application.js.

export default {
  // Synchronisation : modifications refusées par le serveur
  'application.refus': 'A change couldn\'t be saved: {message}',
  'application.refus.etAutres': {
    one: 'A change couldn\'t be saved: {message} (and {count} more)',
    other: 'A change couldn\'t be saved: {message} (and {count} more)',
  },
  'application.lectureSeule.horsLigne': 'This list is now read only: your offline changes weren\'t sent.',
  'application.optionDesactivee': 'This option is turned off for this list.',
  'application.noteAVerifier': 'A note needs checking: it was changed elsewhere while you were writing. Open it to choose which version to keep.',
  'application.reessayer': 'Try again',

  // Nouvelle version
  'application.nouvelleVersion': 'New version available',
  'application.nouvelleVersion.recharger': 'Reload',

  // Déconnexion avec des modifications pas encore envoyées
  'application.deconnexion.question': 'Sign out?',
  'application.deconnexion.texte': {
    one: '{count} change hasn\'t been sent yet. If you sign out now, it will be lost.',
    other: '{count} changes haven\'t been sent yet. If you sign out now, they will be lost.',
  },
  'application.deconnexion.confirmer': 'Sign out anyway',
  'application.deconnexion.annuler': 'Stay signed in',
  'application.sessionExpiree': 'Your session has expired: please sign in again.',

  // Annuler (Ctrl+Z) dans une liste en lecture seule
  'application.annulation.lectureSeule': 'This list is read only: nothing was undone.',

  // Lien d'évitement (ordinateur)
  'application.allerAuContenu': 'Skip to content',

  // Serveur injoignable au démarrage
  'application.injoignable': 'Can\'t reach Listo',
};
