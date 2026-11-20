// Textes de public/js/screens/login.js, en français.
// Chaque nom commence par « connexion. ».

export default {
  // Nouveau mot de passe (premier Admin, changement imposé)
  'connexion.motDePasse.minimum': 'Au moins {min} caractères',
  'connexion.motDePasse.differents': 'Les deux mots de passe ne correspondent pas',

  // Retour du fournisseur d'identité ({name} : son nom réglé, LISTO_OIDC_NAME)
  'connexion.oidc.annulee': 'Connexion avec {name} annulée.',
  'connexion.oidc.erreur': 'La connexion avec {name} n\'a pas abouti. Réessayez.',
  'connexion.oidc.expiree': 'La connexion a pris trop de temps. Réessayez.',
  'connexion.oidc.indisponible': '{name} ne répond pas. Réessayez, ou connectez-vous avec votre mot de passe.',
  'connexion.oidc.refuse': 'Ce compte {name} ne peut pas ouvrir Listo. Demandez à l\'Admin.',
  'connexion.oidc.refusee': 'Votre demande de compte a été refusée.',
  'connexion.oidc.complet': 'Trop de demandes de compte en attente. Réessayez plus tard.',
  'connexion.oidc.demande': 'Votre demande de compte est envoyée à l\'Admin. Vous pourrez vous connecter quand il l\'aura acceptée.',
  'connexion.oidc.attente': 'Votre demande de compte attend encore l\'accord de l\'Admin.',

  // Bouton « Se connecter avec … »
  'connexion.oidc.horsLigne': 'Connexion à Internet nécessaire pour {name}.',
  'connexion.oidc.bouton': 'Se connecter avec {name}',

  // Identifiant + mot de passe
  'connexion.texte': 'Connectez-vous pour retrouver vos listes.',
  'connexion.identifiant': 'Identifiant',
  'connexion.motDePasse': 'Mot de passe',
  'connexion.seConnecter': 'Se connecter',
  'connexion.erreurVide': 'Saisissez votre identifiant et votre mot de passe.',

  // Code à 6 chiffres ou code de secours
  'connexion.code.secours': 'Code de secours',
  'connexion.code.sixChiffres': 'Code à 6 chiffres',
  'connexion.code.secours.aide': 'Chaque code ne fonctionne qu\'une seule fois.',
  'connexion.code.retour': 'Retour',
  'connexion.code.utiliserApplication': 'Utiliser le code de l\'application',
  'connexion.code.utiliserSecours': 'Utiliser un code de secours',
  'connexion.code.titre': 'Vérification en deux étapes',
  'connexion.code.secours.texte': 'Saisissez l\'un de vos codes de secours pour vous connecter.',
  'connexion.code.texte': 'Saisissez le code à 6 chiffres affiché par votre application d\'authentification.',
  'connexion.code.verifier': 'Vérifier',
  'connexion.code.secours.erreurVide': 'Saisissez un code de secours.',
  'connexion.code.erreurVide': 'Saisissez le code à 6 chiffres.',

  // Création du premier Admin
  'connexion.admin.identifiant.aide': '2 à 50 caractères : lettres sans accent, chiffres, . _ -',
  'connexion.admin.confirmation': 'Confirmation du mot de passe',
  'connexion.admin.code': 'Code de démarrage',
  'connexion.admin.code.aide': 'Code indiqué au démarrage du serveur (docker logs listo).',
  'connexion.admin.titre': 'Bienvenue sur Listo',
  'connexion.admin.texte': 'Créez le compte Admin pour démarrer.',
  'connexion.admin.creer': 'Créer le compte Admin',
  'connexion.admin.identifiant.invalide': 'Identifiant invalide',
  'connexion.admin.code.erreurVide': 'Saisissez le code de démarrage',
  'connexion.admin.dejaConfigure': 'Listo est déjà configuré : connectez-vous.',

  // Changement de mot de passe imposé par l'Admin
  'connexion.impose.confirmation.exemple': 'Répétez le nouveau mot de passe',
  'connexion.impose.provisoire': 'Mot de passe provisoire',
  'connexion.impose.provisoire.aide': 'Celui que l\'Admin vous a donné.',
  'connexion.impose.nouveau': 'Nouveau mot de passe',
  'connexion.impose.confirmation': 'Confirmation',
  'connexion.impose.deconnexion': 'Se déconnecter',
  'connexion.impose.texte': 'Votre mot de passe a été choisi par l\'Admin. Choisissez-en un nouveau pour continuer.',
  'connexion.impose.enregistrer': 'Enregistrer',
  'connexion.impose.different': 'Choisissez un mot de passe différent de celui donné par l\'Admin',
};
