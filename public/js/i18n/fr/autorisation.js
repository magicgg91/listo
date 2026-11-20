// Textes de server/oauth.js et server/routes/oauth.js (écran « Autoriser Claude », réponses du serveur), en français.
// Chaque nom commence par « autorisation. ».

export default {
  // Écran « Autoriser Claude » (routes/oauth.js)
  'autorisation.tropDeTentatives': 'Trop de tentatives. Réessayez dans 15 minutes.',
  'autorisation.demandeExpiree': 'Demande introuvable ou expirée. Relancez la connexion depuis Claude.',
  'autorisation.choisirNiveau': 'Choisissez « Lecture seule » ou « Lecture et écriture ».',
  'autorisation.lectureSeulementDemandee': 'Cette application n\'a demandé que la lecture.',
  'autorisation.choisirListe': 'Choisissez au moins une liste.',
  'autorisation.listeIntrouvable': 'Liste introuvable.',
  // {provider} : nom du fournisseur d'identité (LISTO_OIDC_NAME)
  'autorisation.confirmerAvecFournisseur': 'Confirmez d\'abord avec {provider}.',
  'autorisation.saisirMotDePasse': 'Saisissez votre mot de passe.',
  'autorisation.saisirCode': 'Saisissez le code à 6 chiffres, ou un code de secours.',
  'autorisation.motDePasseIncorrect': 'Mot de passe incorrect.',
  'autorisation.codeIncorrect': 'Code incorrect.',
  // Accord refusé par oauth.js ({max} : nombre maximal de connexions)
  'autorisation.tropDeConnexions': 'Vous avez déjà {max} connexions Claude actives (le maximum). Une connexion inutilisée pendant 30 jours se libère d\'elle-même.',

  // Écran « Connexions Claude »
  'autorisation.connexionIntrouvable': 'Connexion introuvable.',
};
