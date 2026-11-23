// Textes de public/js/app.js, en français.
// Chaque nom commence par « application. ».

export default {
  // Synchronisation : modifications refusées par le serveur
  'application.refus': 'Une modification n\'a pas pu être enregistrée : {message}',
  'application.refus.etAutres': {
    one: 'Une modification n\'a pas pu être enregistrée : {message} (et {count} autre)',
    other: 'Une modification n\'a pas pu être enregistrée : {message} (et {count} autres)',
  },
  'application.lectureSeule.horsLigne': 'Cette liste est maintenant en lecture seule : vos modifications hors ligne n\'ont pas été envoyées.',
  'application.optionDesactivee': 'Cette option est désactivée pour cette liste.',
  'application.noteAVerifier': 'Une note est à vérifier : elle a été modifiée ailleurs pendant que vous écriviez. Ouvrez-la pour choisir la version à garder.',
  'application.reessayer': 'Réessayer',

  // Nouvelle version
  'application.nouvelleVersion': 'Nouvelle version disponible',
  'application.nouvelleVersion.recharger': 'Recharger',

  // Déconnexion avec des modifications pas encore envoyées
  'application.deconnexion.question': 'Se déconnecter ?',
  'application.deconnexion.texte': {
    one: '{count} modification n\'est pas encore envoyée. Si vous vous déconnectez maintenant, elle sera perdue.',
    other: '{count} modifications ne sont pas encore envoyées. Si vous vous déconnectez maintenant, elles seront perdues.',
  },
  'application.deconnexion.confirmer': 'Se déconnecter quand même',
  'application.deconnexion.annuler': 'Rester connecté',
  'application.sessionExpiree': 'Votre session a expiré : reconnectez-vous.',

  // Annuler (Ctrl+Z) dans une liste en lecture seule
  'application.annulation.lectureSeule': 'Liste en lecture seule : rien n\'est annulé.',

  // Lien d'évitement (ordinateur)
  'application.allerAuContenu': 'Aller au contenu',

  // Serveur injoignable au démarrage
  'application.injoignable': 'Listo est injoignable',
};
