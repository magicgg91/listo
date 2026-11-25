// Textes de public/js/screens/claude-connections.js et public/js/screens/claude-consent.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/claude.js.

export default {
  // Communs aux deux écrans
  'claude.acces.lecture': 'Read only',
  'claude.acces.ecriture': 'Read and write',
  'claude.application.nom': '“{name}” ({detail})',
  'claude.application.nonVerifie': 'name given by the app, not verified',
  'claude.application.fourni': 'name published by the app\'s website',
  'claude.local': 'an app on this computer (localhost)',
  'claude.chargement': 'Loading…',
  'claude.toutesMesListes': 'All my lists, notes and projects',

  // Assistants IA : en-tête et adresse
  'claude.connexions.titreLocal': '{host} (this computer)',
  'claude.connexions.copiee': 'Address copied',
  'claude.connexions.copieImpossible': 'Can\'t copy: select the address and copy it yourself.',
  'claude.connexions.titre': 'AI assistants',
  'claude.connexions.intro': 'An AI assistant (for example Claude: claude.ai, the mobile app, Claude Desktop, Claude Code) can read your lists and, if you gave it “Read and write”, add items, check them and edit them (name, quantity, note, priority, due date), on behalf of your account. With “All my lists, notes and projects”, it can also read your notes and projects and, with “Read and write”, create notes, add to them, set their labels or move them to the trash, and, in your projects, with your role in each one, create or edit columns, labels, cards and comments. Every connection you have authorized shows up here.',
  'claude.connexions.adresse': 'Address to enter in your AI assistant',
  'claude.connexions.adresse.detail': 'Add it as a custom connector (or MCP server) in your AI assistant:',
  'claude.connexions.copier': 'Copy address',
  'claude.connexions.aide': 'Using Listo with an AI assistant',
  'claude.connexions.aide.detail': 'Help: connecting, what the assistant can do',

  // Assistants IA : chargement
  'claude.connexions.reseau': 'Internet connection needed',
  'claude.connexions.reseau.texte': 'You need to be online to see and disconnect AI assistant connections.',
  'claude.connexions.indisponibles': 'Connections unavailable',

  // Assistants IA : la liste
  'claude.connexions.section': 'Connections',
  'claude.connexions.aucune': 'No connections',
  'claude.connexions.aucune.texte': 'Add Listo in your AI assistant with the address above, then authorize it.',
  'claude.connexions.deconnecter.question': 'Disconnect {name}?',
  'claude.connexions.deconnecter.texte': 'The AI assistant will no longer be able to read or change your lists, notes and projects through this connection. To reconnect it, you\'ll have to authorize it again.',
  'claude.connexions.deconnecter': 'Disconnect',
  'claude.connexions.deconnectee': 'Disconnected',
  'claude.connexions.tout.question': 'Disconnect all?',
  'claude.connexions.tout.texte': 'All your AI assistant connections are cut off right away. To reconnect an assistant, you\'ll have to authorize it again.',
  'claude.connexions.tout': 'Disconnect all',
  'claude.connexions.tout.fait': 'All connections disconnected',
  'claude.connexions.section.nombre': 'Connections ({count})',

  // Assistants IA : une connexion
  'claude.connexions.aucuneListe': 'No lists (deleted or left)',
  'claude.connexions.jamais': 'never',
  'claude.connexions.reponse': 'Response sent to: {host}',
  'claude.connexions.listes': 'Lists: {lists}',
  'claude.connexions.date': 'Connected on {date}',
  'claude.connexions.utilisation': 'Last used: {used}',
  'claude.connexions.deconnecter.nom': 'Disconnect {name}',

  // Autoriser un assistant IA : niveaux d'accord
  'claude.autoriser.lecture.texte': 'The AI assistant will be able to read your lists (and your notes and projects, with “All my lists, notes and projects”), without changing anything.',
  'claude.autoriser.ecriture.texte': 'The AI assistant will be able to read your lists, add items, check them and edit their items (name, quantity, note, priority, due date, repeat). With “All my lists, notes and projects”, it will also be able to read your notes, create notes, add to them or replace their text, set their labels and move them to the trash; and, in your projects, with your role in each one, create projects, columns, labels, cards and comments, edit them, move cards, and move cards or a project to the trash. It can never delete an item or a list, delete a note, a card or a project for good, or share anything.',
  'claude.autoriser.ecriture.avertissement': 'A shared list, note or project can contain booby-trapped text, written to trick the AI assistant into changing your items, notes or cards. That\'s why this level requires more trust: choose it only if you need it.',

  // Autoriser un assistant IA : titre et demande introuvable
  'claude.autoriser.titre': 'Authorize an AI assistant',
  'claude.autoriser.expiree': 'Request not found or expired',
  'claude.autoriser.expiree.texte': 'Start the connection again from your AI assistant.',
  'claude.autoriser.impossible': 'Can\'t show this request',

  // Autoriser un assistant IA : confirmation chez le fournisseur d'identité
  'claude.autoriser.fournisseur.echec': '{provider} didn\'t ask you to sign in again: the confirmation didn\'t go through. Try again.',
  'claude.autoriser.refuser': 'Deny',
  'claude.autoriser.intro': 'An AI assistant is asking for access to your Listo lists, notes and projects. It will act with your account and your permissions, never more.',
  'claude.autoriser.attention': 'Only continue if you just started the connection from your AI assistant.',
  'claude.autoriser.nomSeul': '“{name}”',
  'claude.autoriser.application': 'App requesting access',
  'claude.autoriser.fournisseur.texte': 'You are signed in with {provider}: confirm your identity first. {provider} will ask you to sign in again, then you\'ll come back here to choose the access and the lists.',
  'claude.autoriser.fournisseur.confirmer': 'Confirm with {provider}',

  // Autoriser un assistant IA : le formulaire
  'claude.autoriser.retour': 'The response will be sent here',
  'claude.autoriser.compte': 'Your Listo account ({username})',
  'claude.autoriser.niveau': 'Access',
  'claude.autoriser.aucuneListe': 'You don\'t have any lists yet.',
  'claude.autoriser.listes': 'Lists',
  'claude.autoriser.certainesListes': 'Some lists',
  'claude.autoriser.motDePasse': 'Password',
  'claude.autoriser.code': 'Code',
  'claude.autoriser.code.aide': '6-digit code from your authenticator app, or one of your recovery codes.',
  'claude.autoriser.autoriser': 'Authorize',
  'claude.autoriser.local': 'The response will go to an app installed on this computer (for example Claude Code), not to a website. Deny if you didn\'t start it yourself.',
  // Avertissement pour un site (pas l'ordinateur) : {host}, celui qui recevra la réponse
  'claude.autoriser.site': 'Check that {host} really is the website of your AI assistant. If you didn\'t start this connection yourself, deny: someone may be trying to get into your lists.',
  'claude.autoriser.fournisseur.confirme': 'Identity confirmed with {provider} (valid for 5 minutes).',
  'claude.autoriser.motDePasse.confirmer': 'Confirm with your password.',
  'claude.autoriser.question': 'Did you just start this connection from your AI assistant? If not, deny.',
  'claude.autoriser.choisirListe': 'Choose at least one list.',
  'claude.autoriser.motDePasse.manquant': 'Enter your password',
  'claude.autoriser.code.manquant': 'Enter a code',
};
