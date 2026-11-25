// Textes de public/js/screens/claude-connections.js et public/js/screens/claude-consent.js, en français.
// Chaque nom commence par « claude. ».

export default {
  // Communs aux deux écrans
  'claude.acces.lecture': 'Lecture seule',
  'claude.acces.ecriture': 'Lecture et écriture',
  'claude.application.nom': '« {name} » ({detail})',
  'claude.application.nonVerifie': 'nom donné par l\'application, non vérifié',
  'claude.application.fourni': 'nom publié par le site de l\'application',
  'claude.local': 'une application sur cet ordinateur (localhost)',
  'claude.chargement': 'Chargement…',
  'claude.toutesMesListes': 'Toutes mes listes, mes notes et mes projets',

  // Assistants IA : en-tête et adresse
  'claude.connexions.titreLocal': '{host} (cet ordinateur)',
  'claude.connexions.copiee': 'Adresse copiée',
  'claude.connexions.copieImpossible': 'Copie impossible : sélectionnez l\'adresse à la main.',
  'claude.connexions.titre': 'Assistants IA',
  'claude.connexions.intro': 'Un assistant IA (par exemple Claude : claude.ai, l\'application mobile, Claude Desktop, Claude Code) peut lire vos listes et, si vous lui avez accordé « Lecture et écriture », y ajouter des éléments, les cocher et les modifier (nom, quantité, note, priorité, échéance), au nom de votre compte. Avec « Toutes mes listes, mes notes et mes projets », il peut aussi lire vos notes et vos projets et, en « Lecture et écriture », créer des notes, les compléter, poser leurs étiquettes ou les mettre à la corbeille, et, dans vos projets, avec votre rôle dans chacun, créer ou modifier des colonnes, des étiquettes, des cartes et des commentaires. Chaque connexion que vous avez autorisée apparaît ici.',
  'claude.connexions.adresse': 'Adresse à saisir dans votre assistant IA',
  'claude.connexions.adresse.detail': 'À ajouter comme connecteur personnalisé (ou serveur MCP) dans votre assistant IA :',
  'claude.connexions.copier': 'Copier l\'adresse',
  'claude.connexions.aide': 'Utiliser Listo avec un assistant IA',
  'claude.connexions.aide.detail': 'Aide : se connecter, ce que l\'assistant peut faire',

  // Assistants IA : chargement
  'claude.connexions.reseau': 'Connexion nécessaire',
  'claude.connexions.reseau.texte': 'Il faut du réseau pour voir et déconnecter les connexions des assistants IA.',
  'claude.connexions.indisponibles': 'Connexions indisponibles',

  // Assistants IA : la liste
  'claude.connexions.section': 'Connexions',
  'claude.connexions.aucune': 'Aucune connexion',
  'claude.connexions.aucune.texte': 'Ajoutez Listo dans votre assistant IA avec l\'adresse ci-dessus, puis autorisez-le.',
  'claude.connexions.deconnecter.question': 'Déconnecter {name} ?',
  'claude.connexions.deconnecter.texte': 'L\'assistant IA ne pourra plus lire ni modifier vos listes, vos notes et vos projets avec cette connexion. Pour le reconnecter, il faudra l\'autoriser de nouveau.',
  'claude.connexions.deconnecter': 'Déconnecter',
  'claude.connexions.deconnectee': 'Connexion déconnectée',
  'claude.connexions.tout.question': 'Tout déconnecter ?',
  'claude.connexions.tout.texte': 'Toutes vos connexions d\'assistants IA sont coupées tout de suite. Pour reconnecter un assistant, il faudra l\'autoriser de nouveau.',
  'claude.connexions.tout': 'Tout déconnecter',
  'claude.connexions.tout.fait': 'Toutes les connexions sont déconnectées',
  'claude.connexions.section.nombre': 'Connexions ({count})',

  // Assistants IA : une connexion
  'claude.connexions.aucuneListe': 'Aucune liste (supprimées ou quittées)',
  'claude.connexions.jamais': 'jamais',
  'claude.connexions.reponse': 'Réponse envoyée à : {host}',
  'claude.connexions.listes': 'Listes : {lists}',
  'claude.connexions.date': 'Connectée le {date}',
  'claude.connexions.utilisation': 'Dernière utilisation : {used}',
  'claude.connexions.deconnecter.nom': 'Déconnecter {name}',

  // Autoriser un assistant IA : niveaux d'accord
  'claude.autoriser.lecture.texte': 'L\'assistant IA pourra lire vos listes (et vos notes et vos projets, avec « Toutes mes listes, mes notes et mes projets »), sans rien y changer.',
  'claude.autoriser.ecriture.texte': 'L\'assistant IA pourra lire vos listes, y ajouter des éléments, les cocher et modifier leurs éléments (nom, quantité, note, priorité, échéance, répétition). Avec « Toutes mes listes, mes notes et mes projets », il pourra aussi lire vos notes, en créer, les compléter ou remplacer leur texte, poser leurs étiquettes et les mettre à la corbeille ; et, dans vos projets, avec votre rôle dans chacun, créer des projets, des colonnes, des étiquettes, des cartes et des commentaires, les modifier, déplacer des cartes, et mettre des cartes ou un projet à la corbeille. Jamais supprimer d\'élément ni de liste, ni effacer une note, une carte ou un projet pour de bon, ni partager.',
  'claude.autoriser.ecriture.avertissement': 'Une liste, une note ou un projet partagé peut contenir un texte piégé, écrit pour tromper l\'assistant IA et lui faire changer vos éléments, vos notes ou vos cartes. C\'est pourquoi ce niveau demande plus de confiance : choisissez-le seulement si vous en avez besoin.',

  // Autoriser un assistant IA : titre et demande introuvable
  'claude.autoriser.titre': 'Autoriser un assistant IA',
  'claude.autoriser.expiree': 'Demande introuvable ou expirée',
  'claude.autoriser.expiree.texte': 'Relancez la connexion depuis votre assistant IA.',
  'claude.autoriser.impossible': 'Demande impossible à afficher',

  // Autoriser un assistant IA : confirmation chez le fournisseur d'identité
  'claude.autoriser.fournisseur.echec': '{provider} n\'a pas redemandé la connexion : la confirmation n\'a pas abouti. Réessayez.',
  'claude.autoriser.refuser': 'Refuser',
  'claude.autoriser.intro': 'Un assistant IA demande l\'accès à vos listes, à vos notes et à vos projets Listo. Il agira avec votre compte et vos droits, jamais plus.',
  'claude.autoriser.attention': 'Ne continuez que si vous venez de lancer la connexion depuis votre assistant IA.',
  'claude.autoriser.nomSeul': '« {name} »',
  'claude.autoriser.application': 'Application qui demande l\'accès',
  'claude.autoriser.fournisseur.texte': 'Vous êtes connecté avec {provider} : confirmez d\'abord votre identité. {provider} vous redemandera de vous connecter, puis vous reviendrez ici pour choisir l\'accès et les listes.',
  'claude.autoriser.fournisseur.confirmer': 'Confirmer avec {provider}',

  // Autoriser un assistant IA : le formulaire
  'claude.autoriser.retour': 'La réponse sera envoyée ici',
  'claude.autoriser.compte': 'Votre compte Listo ({username})',
  'claude.autoriser.niveau': 'Accès',
  'claude.autoriser.aucuneListe': 'Vous n\'avez encore aucune liste.',
  'claude.autoriser.listes': 'Listes',
  'claude.autoriser.certainesListes': 'Certaines listes',
  'claude.autoriser.motDePasse': 'Mot de passe',
  'claude.autoriser.code': 'Code',
  'claude.autoriser.code.aide': 'Code à 6 chiffres de l\'application, ou l\'un de vos codes de secours.',
  'claude.autoriser.autoriser': 'Autoriser',
  'claude.autoriser.local': 'La réponse ira à une application installée sur cet ordinateur (par exemple Claude Code), pas à un site Internet. Refusez si vous ne l\'avez pas lancée vous-même.',
  // Avertissement pour un site (pas l'ordinateur) : {host}, celui qui recevra la réponse
  'claude.autoriser.site': 'Vérifiez que {host} est bien le site de votre assistant IA. Si vous n\'avez pas lancé cette connexion vous-même, refusez : quelqu\'un essaie peut-être d\'accéder à vos listes.',
  'claude.autoriser.fournisseur.confirme': 'Identité confirmée avec {provider} (valable 5 minutes).',
  'claude.autoriser.motDePasse.confirmer': 'Confirmez avec votre mot de passe.',
  'claude.autoriser.question': 'Vous venez de lancer cette connexion depuis votre assistant IA ? Si ce n\'est pas le cas, refusez.',
  'claude.autoriser.choisirListe': 'Choisissez au moins une liste.',
  'claude.autoriser.motDePasse.manquant': 'Saisissez votre mot de passe',
  'claude.autoriser.code.manquant': 'Saisissez un code',
};
