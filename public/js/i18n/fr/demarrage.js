// Messages du serveur dans la console (docker logs), en français :
// démarrage et arrêt (server/index.js), configuration refusée
// (server/config.js), outils de secours et de sauvegarde
// (server/admin-secours.js, server/backup-now.js), avertissements des
// modules du serveur. Ils suivent la langue de l'installation (LISTO_LANG),
// jamais celle d'un compte ; le journal de sécurité, lui, reste en anglais.
// Chaque nom commence par « demarrage. ».
// Jamais de mot de passe, de jeton ni de clé dans ces messages (seuls le
// code de démarrage et le mot de passe provisoire du secours sont affichés,
// volontairement, par le code qui les a tirés).

export default {
  // Démarrage (server/index.js)
  'demarrage.refus': 'Listo ne démarre pas : {problem}',
  'demarrage.contactIgnore': 'LISTO_PRODUCT_CONTACT ignorée : caractères non permis (lettres sans accent, chiffres, @ . : / - _ + ~ seulement).',
  'demarrage.base': 'Base de données : {path} (schéma version {version})',
  'demarrage.cle.creee': 'Clé de chiffrement créée : {path}',
  'demarrage.cle.copie': '  Pensez à en garder une copie à part (gestionnaire de mots de passe).',
  'demarrage.cle.chargee': 'Clé de chiffrement chargée : {path}',
  'demarrage.cle.invalide': 'La clé {path} est invalide (256 bits en base64 attendus). Restaurez la copie de sauvegarde de ce fichier.',
  'demarrage.push.creees': 'Notifications push activées. Clés créées : {path}',
  'demarrage.push.chargees': 'Notifications push activées. Clés chargées : {path}',
  'demarrage.push.copie': '  Gardez-en une copie avec la clé de chiffrement (sauvegarde à part).',
  'demarrage.push.fichierInvalide': 'Le fichier {path} est invalide. Restaurez sa copie de sauvegarde, ou effacez-le pour créer de nouvelles clés (chaque appareil devra alors réactiver les notifications, ou se réabonnera tout seul à la prochaine ouverture de Listo).',
  'demarrage.oidc.secretManquant': 'LISTO_OIDC=on demande la clé secrète du client dans {path} (une seule ligne, la même que dans la configuration du fournisseur d\'identité).',
  'demarrage.oidc.active': 'Connexion avec {name} activée : {issuer}',
  // Encadré du code de démarrage (le code lui-même est affiché entre les deux)
  'demarrage.code.titre': '  Aucun compte n\'existe encore. Code de démarrage :',
  'demarrage.code.consigne': '  Saisissez-le à l\'écran de première connexion pour créer le\n  compte Admin. Il ne sert qu\'une fois.',
  'demarrage.journal': 'Journal de sécurité : {path}',
  'demarrage.port': 'Listo est démarré sur le port {port}',
  'demarrage.sauvegardes': 'Sauvegardes nocturnes : {path}',
  'demarrage.signal': 'Signal {signal} reçu : arrêt de Listo.',
  'demarrage.arret': 'Base fermée. Listo est arrêté.',

  // Configuration refusée (server/config.js, configProblem)
  'demarrage.config.adresse': 'LISTO_PUBLIC_URL n\'est pas une adresse valide (« {value} »). Exemple : https://listo.exemple.fr',
  'demarrage.config.https': 'En production, LISTO_PUBLIC_URL doit commencer par https:// (actuellement « {value} »). Corrigez-la dans docker-compose.yml, puis relancez Listo.',
  'demarrage.config.langue': 'LISTO_LANG doit valoir fr ou en (actuellement « {value} »).',
  'demarrage.config.monnaie': 'LISTO_CURRENCY doit être le code d\'une monnaie à deux décimales, en trois lettres (EUR, USD, CHF…) ; actuellement « {value} ».',
  'demarrage.config.connexionLocale': 'LISTO_LOCAL_LOGIN=off coupe la connexion par mot de passe : il faut alors LISTO_OIDC=on (connexion avec un fournisseur d\'identité), sinon personne ne peut entrer.',
  'demarrage.config.oidcAdresse': 'LISTO_OIDC=on demande LISTO_OIDC_ISSUER, l\'adresse du fournisseur d\'identité (actuellement « {value} »). Exemple : https://auth.exemple.fr',
  'demarrage.config.oidcHttps': 'LISTO_OIDC_ISSUER doit commencer par https:// (actuellement « {value} »).',
  'demarrage.config.oidcSimple': 'LISTO_OIDC_ISSUER : adresse simple attendue, sans identifiant, ni « ? », ni « # ».',
  'demarrage.config.oidcClient': 'LISTO_OIDC_CLIENT_ID invalide (« {value} ») : lettres sans accent, chiffres, . _ ~ - (100 au plus).',
  'demarrage.config.sites': 'LISTO_MCP_SITES : un nom de site invalide (« {value} »). Attendu : des noms simples séparés par des virgules, sans https://, ni chemin, ni port, ni adresse IP, ni « * ». Exemple : claude.ai,claude.com',
  'demarrage.config.port': 'PORT invalide (« {value} ») : un nombre entre 1 et 65535 est attendu.',

  // Migrations de la base (server/db.js) : des nombres, jamais un nom de liste
  'demarrage.migration15': 'Migration 15 (« Après l\'ajout ») : {shopping} liste(s) de courses → « Rester sur la liste » ; {detail} autre(s) liste(s) avec priorité ou échéance → « Ouvrir la fiche » ; {quick} autre(s) liste(s) sans priorité ni échéance → « Rester sur la liste ».',
  'demarrage.migration18': 'Migration 18 (types de liste) : {shopping} liste(s) de courses, {tasks} liste(s) de tâches.',

  // Journal de sécurité écrit dans data/journal.log (server/audit.js)
  'demarrage.journal.retabli': 'Journal de sécurité : écriture dans {path} rétablie.',
  'demarrage.journal.impossible': 'Journal de sécurité : impossible d\'écrire dans {path} ({reason}). Listo continue ; le journal reste visible dans docker logs.',

  // Erreurs inattendues (le détail technique suit, jamais envoyé au téléphone)
  'demarrage.erreur': 'Erreur inattendue :',
  'demarrage.erreur.mcp': 'Erreur MCP inattendue :',
  'demarrage.erreur.lienPublic': 'Erreur inattendue (lien public) :',

  // Services extérieurs (server/update-check.js, server/products.js, server/push.js)
  'demarrage.majImpossible': 'Vérification de mise à jour impossible : {reason}',
  'demarrage.produitImpossible': 'Recherche de produit impossible : {reason}',
  'demarrage.raison.delai': 'délai dépassé',
  'demarrage.raison.http': 'réponse HTTP {status}',
  'demarrage.raison.autreSite': 'réponse venue d\'un autre site',
  'demarrage.raison.inattendue': 'réponse inattendue',
  'demarrage.raison.codeInvalide': 'code invalide',
  'demarrage.push.sansReponse': 'Notifications : un service de push n\'a pas répondu.',
  'demarrage.push.expire': 'Notifications : abonnement expiré retiré (HTTP {status}).',
  'demarrage.push.refuse': 'Notifications : envoi refusé par le service de push (HTTP {status}).',

  // Secours (server/admin-secours.js)
  // Ligne d'utilisation : {argument} est le nom de l'argument entre < >
  // (pas de < > dans les textes), « identifiant » ici
  'demarrage.secours.utilisation': 'Utilisation : node server/admin-secours.js {argument} [--retirer-2fa]',
  'demarrage.secours.argument': 'identifiant',
  'demarrage.secours.utilisateur': 'Lancez cette commande avec « -u node » :',
  'demarrage.secours.baseIntrouvable': 'Base introuvable ({path}).',
  'demarrage.secours.inconnu': 'Aucun compte avec l\'identifiant « {username} ».',
  'demarrage.secours.motDePasse': 'Compte « {username} » : mot de passe provisoire (à changer à la connexion) :',
  'demarrage.secours.sans2fa': 'La double authentification de ce compte est désactivée : réactivez-la depuis Réglages → Mon compte.',
  'demarrage.secours.desactive': 'Attention : ce compte est désactivé. Un Admin doit le réactiver (Administration → Comptes).',
  'demarrage.secours.tropDEssais': 'Si la connexion est refusée pour « trop d\'essais », redémarrez Listo : docker compose restart',

  // Sauvegarde à la demande (server/backup-now.js)
  'demarrage.sauvegarde.utilisateur': 'Sauvegarde non faite : lancez cette commande avec « -u node » :',
  'demarrage.sauvegarde.baseIntrouvable': 'Sauvegarde impossible : base introuvable ({path}).',
  'demarrage.sauvegarde.creee': 'Sauvegarde créée : {file}',
  'demarrage.sauvegarde.ratee': 'Sauvegarde ratée : {error}',
};
