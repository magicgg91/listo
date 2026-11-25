// Textes de server/auth.js, server/routes/auth.js, server/routes/me.js, server/routes/admin-users.js, server/passwords.js (réponses du serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/comptes.js.

export default {
  // Contrôles d'accès (server/auth.js)
  'comptes.connexionRequise': 'Sign-in required.',
  'comptes.motDePasse.aChanger': 'Change your password before continuing.',
  'comptes.reserveAdmin': 'Admins only.',
  'comptes.origineInconnue': 'Request rejected: unknown origin.',

  // Règles du mot de passe (server/passwords.js)
  'comptes.motDePasse.manquant': 'Password missing.',
  'comptes.motDePasse.tropCourt': 'Password must be at least {min} characters.',
  'comptes.motDePasse.tropLong': 'Password must be no more than {max} characters.',

  // Règle de l'identifiant (server/validate.js)
  'comptes.identifiant.invalide': 'Invalid username: 2 to 50 characters (letters with no accents, numbers, . _ -).',

  // Premier Admin et connexion (server/routes/auth.js)
  'comptes.tropDeTentatives': 'Too many attempts. Try again in 15 minutes.',
  'comptes.dejaConfigure': 'Listo is already set up.',
  'comptes.codeDemarrage.incorrect': 'Incorrect setup code.',
  'comptes.nomAffiche.invalide': 'Invalid display name (1 to 100 characters).',
  'comptes.connexion.motDePasseDesactive': 'Password sign-in is disabled: use “Sign in with {provider}”.',
  'comptes.connexion.requis': 'Username and password required.',
  'comptes.connexion.incorrecte': 'Incorrect username or password.',
  'comptes.connexion.expiree': 'Sign-in expired: enter your password again.',
  'comptes.code.incorrect': 'Incorrect code.',

  // Mon compte : langue, mot de passe, double authentification (server/routes/me.js)
  'comptes.langue.inconnue': 'Unknown language.',
  'comptes.fournisseur.gere': 'Signed in with {provider}: your password and two-factor authentication are managed in {provider}.',
  'comptes.motDePasse.actuelIncorrect': 'Current password is incorrect.',
  'comptes.motDePasse.different': 'Choose a password different from the one the Admin gave you.',
  'comptes.deuxFacteurs.dejaActive': 'Two-factor authentication is already enabled.',
  'comptes.deuxFacteurs.aucuneActivation': 'No two-factor authentication setup in progress.',
  'comptes.deuxFacteurs.demanderQr': 'Start by requesting the setup QR code.',
  'comptes.deuxFacteurs.codeIncorrect': 'Incorrect code. Check the time on your phone and try again.',
  'comptes.deuxFacteurs.inactive': 'Two-factor authentication isn\'t enabled.',
  'comptes.deuxFacteurs.refus': 'Incorrect password or code.',

  // Administration des comptes et demandes de compte (server/routes/admin-users.js, server/oidc.js)
  'comptes.introuvable': 'Account not found.',
  'comptes.routeInconnue': 'Unknown route.',
  'comptes.demande.introuvable': 'Request not found or already handled.',
  'comptes.identifiant.pris': 'This username is already taken.',
  'comptes.fournisseur.dejaRelie': 'This {provider} account is already linked to a Listo account.',
  'comptes.role.invalide': 'Invalid role (user, guest or admin).',
  // Rôles (docs/cadrage-comptes.md) : jamais Admin ↔ Invité directement
  'comptes.role.inviteVersAdmin': 'A guest can\'t become an Admin directly: make them a user first.',
  'comptes.role.adminVersInvite': 'An Admin can\'t become a guest directly: make them a user first.',
  'comptes.role.destinataireEnvies': {
    one: 'A wish list is meant for {name}: this account can\'t become a guest.',
    other: '{count} wish lists are meant for {name}: this account can\'t become a guest.',
  },
  'comptes.identifiant.existe': 'This username already exists.',
  'comptes.rienAModifier': 'Nothing to change.',
  'comptes.fonctions.invalides': 'Invalid allowed features: notes, projects, projectsCreate or mcp, true or false.',
  'comptes.fonctions.admin': 'An Admin has access to everything: no features to allow.',
  'comptes.actif.invalide': 'Invalid “active” value (true or false).',
  'comptes.soiMeme.desactiver': 'You can\'t disable your own account or remove your own Admin role.',
  'comptes.dernierAdmin': 'There must always be at least one active Admin.',
  'comptes.motDePasse.desactiveServeur': 'Password sign-in is disabled on this server.',
  'comptes.soiMeme.motDePasse': 'Change your own password from your settings.',
  'comptes.soiMeme.deuxFacteurs': 'Disable your own 2FA from your settings.',
  'comptes.soiMeme.supprimer': 'You can\'t delete your own account.',
  'comptes.dejaServi': 'This account has already been used: it can be disabled, not deleted.',
};
