// Textes de server/auth.js, server/routes/auth.js, server/routes/me.js, server/routes/admin-users.js, server/passwords.js, server/validate.js, server/oidc.js (réponses du serveur), en français.
// Chaque nom commence par « comptes. ».

export default {
  // Contrôles d'accès (server/auth.js)
  'comptes.connexionRequise': 'Connexion requise.',
  'comptes.motDePasse.aChanger': 'Changez votre mot de passe avant de continuer.',
  'comptes.reserveAdmin': 'Réservé aux administrateurs.',
  'comptes.origineInconnue': 'Requête refusée : origine inconnue.',

  // Règles du mot de passe (server/passwords.js)
  'comptes.motDePasse.manquant': 'Mot de passe manquant.',
  'comptes.motDePasse.tropCourt': 'Le mot de passe doit faire au moins {min} caractères.',
  'comptes.motDePasse.tropLong': 'Le mot de passe doit faire au plus {max} caractères.',

  // Règle de l'identifiant (server/validate.js)
  'comptes.identifiant.invalide': 'Identifiant invalide : 2 à 50 caractères (lettres sans accent, chiffres, . _ -).',

  // Premier Admin et connexion (server/routes/auth.js)
  'comptes.tropDeTentatives': 'Trop de tentatives. Réessayez dans 15 minutes.',
  'comptes.dejaConfigure': 'Listo est déjà configuré.',
  'comptes.codeDemarrage.incorrect': 'Code de démarrage incorrect.',
  'comptes.nomAffiche.invalide': 'Nom affiché invalide (1 à 100 caractères).',
  'comptes.connexion.motDePasseDesactive': 'La connexion par mot de passe est désactivée : utilisez « Se connecter avec {provider} ».',
  'comptes.connexion.requis': 'Identifiant et mot de passe requis.',
  'comptes.connexion.incorrecte': 'Identifiant ou mot de passe incorrect.',
  'comptes.connexion.expiree': 'Connexion expirée : saisissez de nouveau votre mot de passe.',
  'comptes.code.incorrect': 'Code incorrect.',

  // Mon compte : langue, mot de passe, double authentification (server/routes/me.js)
  'comptes.langue.inconnue': 'Langue inconnue.',
  'comptes.fournisseur.gere': 'Connecté avec {provider} : votre mot de passe et votre double authentification se gèrent dans {provider}.',
  'comptes.motDePasse.actuelIncorrect': 'Mot de passe actuel incorrect.',
  'comptes.motDePasse.different': 'Choisissez un mot de passe différent de celui donné par l\'Admin.',
  'comptes.deuxFacteurs.dejaActive': 'La double authentification est déjà active.',
  'comptes.deuxFacteurs.aucuneActivation': 'Aucune activation de la double authentification en cours.',
  'comptes.deuxFacteurs.demanderQr': 'Commencez par demander le QR code d\'activation.',
  'comptes.deuxFacteurs.codeIncorrect': 'Code incorrect. Vérifiez l\'heure du téléphone et réessayez.',
  'comptes.deuxFacteurs.inactive': 'La double authentification n\'est pas active.',
  'comptes.deuxFacteurs.refus': 'Mot de passe ou code incorrect.',

  // Administration des comptes et demandes de compte (server/routes/admin-users.js, server/oidc.js)
  'comptes.introuvable': 'Compte introuvable.',
  'comptes.routeInconnue': 'Route inconnue.',
  'comptes.demande.introuvable': 'Demande introuvable ou déjà traitée.',
  'comptes.identifiant.pris': 'Cet identifiant est déjà pris.',
  'comptes.fournisseur.dejaRelie': 'Ce compte {provider} est déjà relié à un compte Listo.',
  'comptes.role.invalide': 'Rôle invalide (user, guest ou admin).',
  // Rôles (docs/cadrage-comptes.md) : jamais Admin ↔ Invité directement
  'comptes.role.inviteVersAdmin': 'Un invité ne devient pas Admin directement : faites-en d\'abord un utilisateur.',
  'comptes.role.adminVersInvite': 'Un Admin ne devient pas invité directement : faites-en d\'abord un utilisateur.',
  'comptes.role.destinataireEnvies': {
    one: 'Une liste d\'envies est destinée à {name} : ce compte ne peut pas devenir invité.',
    other: '{count} listes d\'envies sont destinées à {name} : ce compte ne peut pas devenir invité.',
  },
  'comptes.identifiant.existe': 'Cet identifiant existe déjà.',
  'comptes.rienAModifier': 'Rien à modifier.',
  'comptes.fonctions.invalides': 'Fonctions autorisées invalides : lists, notes, projects, projectsCreate ou mcp, vrai ou faux.',
  'comptes.fonctions.listesInviteSeulement': 'Un Utilisateur a toujours les listes : seule la page d\'un invité a la case « Listes ».',
  'comptes.fonctions.admin': 'Un Admin a accès à tout : pas de fonctions à autoriser.',
  'comptes.actif.invalide': 'Valeur « active » invalide (true ou false).',
  'comptes.soiMeme.desactiver': 'Vous ne pouvez pas vous désactiver ni vous retirer le rôle Admin.',
  'comptes.dernierAdmin': 'Il doit toujours rester au moins un Admin actif.',
  'comptes.motDePasse.desactiveServeur': 'La connexion par mot de passe est désactivée sur ce serveur.',
  'comptes.soiMeme.motDePasse': 'Changez votre propre mot de passe depuis vos réglages.',
  'comptes.soiMeme.deuxFacteurs': 'Désactivez votre propre 2FA depuis vos réglages.',
  'comptes.soiMeme.supprimer': 'Vous ne pouvez pas supprimer votre propre compte.',
  'comptes.dejaServi': 'Ce compte a déjà servi : il peut être désactivé, pas supprimé.',
};
