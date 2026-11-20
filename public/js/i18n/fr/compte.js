// Textes de « Mon compte » (public/js/screens/account.js), en français.
// Chaque nom commence par « compte. » (un nom ne sert qu'à un seul écran).

export default {
  'compte.titre': 'Mon compte',
  'compte.identifiant': 'Identifiant : {username}',
  'compte.connecte': 'Compte connecté',

  // Sécurité
  'compte.securite': 'Sécurité',
  'compte.fournisseur.connecte': 'Connecté avec {provider}',
  'compte.fournisseur.detail': 'Mot de passe et double authentification : dans {provider}',
  'compte.motDePasse.titre': 'Mot de passe',
  'compte.motDePasse.detail': 'Modifier mon mot de passe',
  'compte.deuxFacteurs.titre': 'Double authentification',
  'compte.deuxFacteurs.active': 'Activée',
  'compte.deuxFacteurs.active.detail': 'Code à 6 chiffres à chaque connexion',
  'compte.deuxFacteurs.desactivee': 'Désactivée',

  // Apparence
  'compte.apparence': 'Apparence',
  'compte.theme': 'Thème',
  'compte.theme.clair': 'Clair',
  'compte.theme.sombre': 'Sombre',
  'compte.theme.auto': 'Auto',

  // Langue
  'compte.langue.titre': 'Langue',
  'compte.langue.auto': 'Automatique',
  'compte.langue.enregistree': 'Langue enregistrée',

  // Claude
  'compte.claude': 'Claude',
  'compte.claude.connexions': 'Connexions Claude',
  'compte.claude.connexions.detail': 'Voir et déconnecter Claude',

  // Ce téléphone (sur ordinateur : cet appareil)
  'compte.appareil.telephone': 'Ce téléphone',
  'compte.appareil.telephone.reinitialiser': 'Réinitialiser les données de ce téléphone',
  'compte.appareil.telephone.reinitialiser.question': 'Réinitialiser les données de ce téléphone ?',
  'compte.appareil.telephone.reinitialiser.texte': 'Les listes gardées sur ce téléphone seront rechargées depuis le serveur.',
  'compte.appareil.pc': 'Cet appareil',
  'compte.appareil.pc.reinitialiser': 'Réinitialiser les données de cet appareil',
  'compte.appareil.pc.reinitialiser.question': 'Réinitialiser les données de cet appareil ?',
  'compte.appareil.pc.reinitialiser.texte': 'Les listes gardées sur cet appareil seront rechargées depuis le serveur.',
  'compte.appareil.reinitialiser.detail': 'Recharger les listes depuis le serveur',
  'compte.appareil.reinitialiser.enAttente': {
    one: 'La modification en attente est gardée et sera envoyée.',
    other: 'Les {count} modifications en attente sont gardées et seront envoyées.',
  },
  'compte.appareil.reinitialiser': 'Réinitialiser',
  'compte.appareil.recharge': 'Données rechargées depuis le serveur',
  'compte.appareil.horsLigne': 'Indisponible hors ligne : il faut du réseau pour tout recharger.',

  // Se déconnecter
  'compte.deconnexion': 'Se déconnecter',
  'compte.deconnexion.question': 'Se déconnecter ?',
  'compte.deconnexion.texte': 'Pour revenir, il faudra votre identifiant et votre mot de passe (et le code de double authentification s\'il est activé).',
  'compte.deconnexion.rester': 'Rester connecté',
};
