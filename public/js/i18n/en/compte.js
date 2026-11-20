// Texts of “Mon compte” (public/js/screens/account.js), in English.
// Same names as public/js/i18n/fr/compte.js.

export default {
  'compte.titre': 'My account',
  'compte.identifiant': 'Username: {username}',
  'compte.connecte': 'Signed in',

  // Sécurité
  'compte.securite': 'Security',
  'compte.fournisseur.connecte': 'Signed in with {provider}',
  'compte.fournisseur.detail': 'Password and two-factor authentication: managed in {provider}',
  'compte.motDePasse.titre': 'Password',
  'compte.motDePasse.detail': 'Change my password',
  'compte.deuxFacteurs.titre': 'Two-factor authentication',
  'compte.deuxFacteurs.active': 'Enabled',
  'compte.deuxFacteurs.active.detail': '6-digit code each time you sign in',
  'compte.deuxFacteurs.desactivee': 'Disabled',

  // Apparence
  'compte.apparence': 'Appearance',
  'compte.theme': 'Theme',
  'compte.theme.clair': 'Light',
  'compte.theme.sombre': 'Dark',
  'compte.theme.auto': 'Auto',

  // Langue
  'compte.langue.titre': 'Language',
  'compte.langue.auto': 'Automatic',
  'compte.langue.enregistree': 'Language saved',

  // Claude
  'compte.claude': 'Claude',
  'compte.claude.connexions': 'Claude connections',
  'compte.claude.connexions.detail': 'View and disconnect Claude',

  // Ce téléphone (sur ordinateur : cet appareil)
  'compte.appareil.telephone': 'This phone',
  'compte.appareil.telephone.reinitialiser': 'Reset this phone\'s data',
  'compte.appareil.telephone.reinitialiser.question': 'Reset this phone\'s data?',
  'compte.appareil.telephone.reinitialiser.texte': 'The lists stored on this phone will be reloaded from the server.',
  'compte.appareil.pc': 'This device',
  'compte.appareil.pc.reinitialiser': 'Reset this device\'s data',
  'compte.appareil.pc.reinitialiser.question': 'Reset this device\'s data?',
  'compte.appareil.pc.reinitialiser.texte': 'The lists stored on this device will be reloaded from the server.',
  'compte.appareil.reinitialiser.detail': 'Reload lists from the server',
  'compte.appareil.reinitialiser.enAttente': {
    one: 'Your pending change is kept and will be sent.',
    other: 'Your {count} pending changes are kept and will be sent.',
  },
  'compte.appareil.reinitialiser': 'Reset',
  'compte.appareil.recharge': 'Data reloaded from the server',
  'compte.appareil.horsLigne': 'Unavailable offline: you need a connection to reload everything.',

  // Se déconnecter
  'compte.deconnexion': 'Sign out',
  'compte.deconnexion.question': 'Sign out?',
  'compte.deconnexion.texte': 'To come back, you\'ll need your username and password (and your two-factor authentication code, if it\'s enabled).',
  'compte.deconnexion.rester': 'Stay signed in',
};
