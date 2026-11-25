// Textes de server/oauth.js et server/routes/oauth.js (écran « Autoriser un assistant IA », réponses du serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/autorisation.js.

export default {
  // Écran « Autoriser un assistant IA » (routes/oauth.js)
  'autorisation.tropDeTentatives': 'Too many attempts. Try again in 15 minutes.',
  'autorisation.demandeExpiree': 'Request not found or expired. Start the connection again from your AI assistant.',
  'autorisation.choisirNiveau': 'Choose “Read only” or “Read and write”.',
  'autorisation.lectureSeulementDemandee': 'This app only asked for read access.',
  'autorisation.choisirListe': 'Choose at least one list.',
  'autorisation.listeIntrouvable': 'List not found.',
  // {provider} : nom du fournisseur d'identité (LISTO_OIDC_NAME)
  'autorisation.confirmerAvecFournisseur': 'Confirm with {provider} first.',
  'autorisation.saisirMotDePasse': 'Enter your password.',
  'autorisation.saisirCode': 'Enter the 6-digit code, or a recovery code.',
  'autorisation.motDePasseIncorrect': 'Incorrect password.',
  'autorisation.codeIncorrect': 'Incorrect code.',
  // Accord refusé par oauth.js ({max} : nombre maximal de connexions)
  'autorisation.tropDeConnexions': 'You already have {max} active AI assistant connections (the maximum). A connection unused for 30 days frees up its spot on its own.',
  // Account without « AI assistants » (Admin's tick, docs/cadrage-comptes.md)
  'autorisation.compteNonAutorise': 'Your account can\'t authorize an AI assistant: the Listo Admin allows it.',

  // Écran « Assistants IA »
  'autorisation.connexionIntrouvable': 'Connection not found.',
};
