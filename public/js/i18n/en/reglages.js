// Textes de public/js/screens/settings.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/reglages.js.

export default {
  // Barre de titre, pastilles (aussi utilisées par account.js)
  'reglages.retour': 'Back',
  'reglages.demandesCompte': {
    one: '{count} pending account request',
    other: '{count} pending account requests',
  },
  'reglages.role.admin': 'Admin',
  'reglages.role.utilisateur': 'User',

  // Réglages (téléphone)
  'reglages.titre': 'Settings',
  'reglages.compte.lien': 'My account: {name}',
  'reglages.compte': 'My account',
  'reglages.general': 'General',
  'reglages.informations': 'Information',
  'reglages.corbeille': 'List trash',
  'reglages.corbeilleNotes': 'Notes trash',
  'reglages.administration': 'Administration',
  'reglages.aide': 'Help',
  'reglages.miseAJour': 'Update',
  'reglages.version': 'Version {version}',
  'reglages.aPropos.titre': 'About',

  // Réglages (ordinateur)
  'reglages.pc.compteAdmin': 'Admin account',
  'reglages.pc.compte': 'Account',
  'reglages.pc.compte.detail': 'My account: password, two-factor authentication, theme, sign out',
  'reglages.pc.raccourcis': 'Keyboard shortcuts',
  'reglages.pc.raccourcis.detail': 'Press ?',
  'reglages.notifications': 'Notifications',

  // Réglages › Accueil (screens/home-settings.js ; home-tiles.js)
  'reglages.accueil': 'Home',
  'reglages.accueil.detail': 'Tiles shown, first screen',
  'reglages.accueil.ecran': 'Home screen',
  'reglages.accueil.afficher': 'Show the Home screen',
  'reglages.accueil.afficher.oui': 'The first screen when Listo opens, with its tiles.',
  'reglages.accueil.afficher.non': 'Off: Listo opens on the screen chosen below, and the Home button leaves the bottom bar.',
  'reglages.accueil.tuiles': 'Tiles shown',
  'reglages.accueil.reordonner': 'Reorder',
  'reglages.accueil.termine': 'Done',
  'reglages.accueil.offrir.detail': 'Only when you\'ve reserved a gift',
  'reglages.accueil.compte.detail': 'Always shown: it leads to the settings',
  'reglages.accueil.note': 'Applies to all your devices.',
  'reglages.accueil.note.ordre': 'Drag a tile by its handle, or use the arrows. The Home screen follows this order.',
  'reglages.accueil.monter': 'Move {name} up',
  'reglages.accueil.descendre': 'Move {name} down',
  'reglages.accueil.glisser': 'Drag to move',
  'reglages.accueil.position': '“{name}” in position {position} of {total}',
  'reglages.accueil.premier': 'First screen',

  // Réglages › Fonctions (screens/features.js ; features.js)
  'reglages.fonctions': 'Features',
  'reglages.fonctions.detail': 'Notes',
  'reglages.fonctions.intro': 'Choose the features you use. A feature you turn off disappears from your screens; nothing is deleted.',
  'reglages.fonctions.notes': 'Notes',
  'reglages.fonctions.notes.detail': 'Free-form texts, to keep for yourself or to share.',
  'reglages.fonctions.note': 'Applies to all your devices.',

  // Raccourcis à une touche (ordinateur)
  'reglages.touches.activees': 'Single-key shortcuts enabled',
  'reglages.touches.desactivees': 'Single-key shortcuts disabled',
  'reglages.touches.titre': 'Single-key shortcuts',
  'reglages.touches.detail': 'Turn them off if you use voice control. On this device only.',

  // Page « À propos »
  'reglages.aPropos.scan.titre': 'Scan mode',
  'reglages.aPropos.scan.detail': 'Data: Open Food Facts (ODbL license)',
  'reglages.aPropos.verifier': 'Check now',
  'reglages.aPropos.version': 'Version:',
  'reglages.aPropos.version.lien': 'Version {version} on GitHub',
  'reglages.aPropos.aJour': 'Up to date',
  'reglages.aPropos.developpeur': 'Developer: {owner} on GitHub',
  'reglages.aPropos.projet.lien': 'Listo project on GitHub',
  'reglages.aPropos.projet': 'GitHub project',

  // Mot de passe
  'reglages.motDePasse.confirmation.exemple': 'Repeat the new password',
  'reglages.motDePasse.actuel': 'Current password',
  'reglages.motDePasse.nouveau': 'New password',
  'reglages.motDePasse.longueur': 'At least {min} characters',
  'reglages.motDePasse.confirmation': 'Confirm password',
  'reglages.enregistrer': 'Save',
  'reglages.motDePasse.titre': 'Password',
  'reglages.motDePasse.actuel.manquant': 'Enter your current password',
  'reglages.motDePasse.differents': 'The two passwords don\'t match',
  'reglages.motDePasse.modifie': 'Password changed. Your other devices are signed out.',

  // Double authentification : activation, étape 1
  'reglages.deuxFacteurs.titre': 'Two-factor authentication',
  'reglages.deuxFacteurs.preparation': 'Preparing…',
  'reglages.deuxFacteurs.code': '6-digit code',
  'reglages.deuxFacteurs.activer': 'Verify and enable',
  'reglages.deuxFacteurs.copierCle': 'Copy key',
  'reglages.deuxFacteurs.cleCopiee': 'Key copied',
  'reglages.deuxFacteurs.copieImpossible': 'Couldn\'t copy: type the key in by hand.',
  'reglages.deuxFacteurs.etape1': 'Step 1 of 2',
  'reglages.deuxFacteurs.scanner': 'Scan this QR code with your authenticator app.',
  'reglages.deuxFacteurs.qr': 'QR code to scan with your app',
  'reglages.deuxFacteurs.cle': 'Or enter this key',
  'reglages.deuxFacteurs.code.manquant': 'Enter the 6 digits shown in your app',

  // Double authentification : activation, étape 2 (codes de secours)
  'reglages.secours.copies': 'Codes copied',
  'reglages.secours.copieImpossible': 'Couldn\'t copy: write the codes down by hand.',
  'reglages.secours.copier': 'Copy codes',
  'reglages.secours.retour': 'Back to settings',
  'reglages.secours.titre': 'Recovery codes',
  'reglages.secours.etape2': 'Step 2 of 2',
  'reglages.secours.avertissement': 'These codes won\'t be shown again. Keep them somewhere safe: each one works only once.',
  'reglages.secours.conserves': 'I\'ve saved my codes',

  // Double authentification : désactivation
  'reglages.desactivation.motDePasse': 'Password',
  'reglages.desactivation.code': 'Code',
  'reglages.desactivation.code.aide': '6-digit code from your authenticator app, or one of your recovery codes.',
  'reglages.desactivation.bouton': 'Disable two-factor authentication',
  'reglages.desactivation.active': 'Two-factor authentication is enabled: you\'re asked for a 6-digit code each time you sign in.',
  'reglages.desactivation.consigne': 'To disable it, confirm with your password and a code.',
  'reglages.desactivation.manquant': 'Enter your password and a code.',
  'reglages.desactivation.faite': 'Two-factor authentication disabled',
};
