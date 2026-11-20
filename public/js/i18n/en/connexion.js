// Textes de public/js/screens/login.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/connexion.js.

export default {
  // Nouveau mot de passe (premier Admin, changement imposé)
  'connexion.motDePasse.minimum': 'At least {min} characters',
  'connexion.motDePasse.differents': 'The two passwords don\'t match',

  // Retour du fournisseur d'identité ({name} : son nom réglé, LISTO_OIDC_NAME)
  'connexion.oidc.annulee': 'Sign-in with {name} canceled.',
  'connexion.oidc.erreur': 'Signing in with {name} didn\'t work. Try again.',
  'connexion.oidc.expiree': 'Signing in took too long. Try again.',
  'connexion.oidc.indisponible': '{name} isn\'t responding. Try again, or sign in with your password.',
  'connexion.oidc.refuse': 'This {name} account can\'t open Listo. Ask the Admin.',
  'connexion.oidc.refusee': 'Your account request was declined.',
  'connexion.oidc.complet': 'Too many account requests are pending. Try again later.',
  'connexion.oidc.demande': 'Your account request has been sent to the Admin. You\'ll be able to sign in once it\'s accepted.',
  'connexion.oidc.attente': 'Your account request is still waiting for the Admin\'s approval.',

  // Bouton « Se connecter avec … »
  'connexion.oidc.horsLigne': 'You need an internet connection to use {name}.',
  'connexion.oidc.bouton': 'Sign in with {name}',

  // Identifiant + mot de passe
  'connexion.texte': 'Sign in to get to your lists.',
  'connexion.identifiant': 'Username',
  'connexion.motDePasse': 'Password',
  'connexion.seConnecter': 'Sign in',
  'connexion.erreurVide': 'Enter your username and password.',

  // Code à 6 chiffres ou code de secours
  'connexion.code.secours': 'Recovery code',
  'connexion.code.sixChiffres': '6-digit code',
  'connexion.code.secours.aide': 'Each code works only once.',
  'connexion.code.retour': 'Back',
  'connexion.code.utiliserApplication': 'Use the code from your app',
  'connexion.code.utiliserSecours': 'Use a recovery code',
  'connexion.code.titre': 'Two-factor authentication',
  'connexion.code.secours.texte': 'Enter one of your recovery codes to sign in.',
  'connexion.code.texte': 'Enter the 6-digit code shown in your authenticator app.',
  'connexion.code.verifier': 'Verify',
  'connexion.code.secours.erreurVide': 'Enter a recovery code.',
  'connexion.code.erreurVide': 'Enter the 6-digit code.',

  // Création du premier Admin
  'connexion.admin.identifiant.aide': '2 to 50 characters: letters (no accents), numbers, . _ -',
  'connexion.admin.confirmation': 'Confirm password',
  'connexion.admin.code': 'Setup code',
  'connexion.admin.code.aide': 'Code shown when the server starts (docker logs listo).',
  'connexion.admin.titre': 'Welcome to Listo',
  'connexion.admin.texte': 'Create the Admin account to get started.',
  'connexion.admin.creer': 'Create Admin account',
  'connexion.admin.identifiant.invalide': 'Invalid username',
  'connexion.admin.code.erreurVide': 'Enter the setup code',
  'connexion.admin.dejaConfigure': 'Listo is already set up: sign in.',

  // Changement de mot de passe imposé par l'Admin
  'connexion.impose.confirmation.exemple': 'Repeat the new password',
  'connexion.impose.provisoire': 'Temporary password',
  'connexion.impose.provisoire.aide': 'The one the Admin gave you.',
  'connexion.impose.nouveau': 'New password',
  'connexion.impose.confirmation': 'Confirm password',
  'connexion.impose.deconnexion': 'Sign out',
  'connexion.impose.texte': 'Your password was set by the Admin. Choose a new one to continue.',
  'connexion.impose.enregistrer': 'Save',
  'connexion.impose.different': 'Choose a password different from the one the Admin gave you',
};
