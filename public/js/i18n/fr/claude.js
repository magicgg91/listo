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
  'claude.toutesMesListes': 'Toutes mes listes',

  // Connexions Claude : en-tête et adresse
  'claude.connexions.titreLocal': '{host} (cet ordinateur)',
  'claude.connexions.copiee': 'Adresse copiée',
  'claude.connexions.copieImpossible': 'Copie impossible : sélectionnez l\'adresse à la main.',
  'claude.connexions.titre': 'Connexions Claude',
  'claude.connexions.intro': 'Claude (claude.ai, l\'application mobile, Claude Desktop, Claude Code) peut lire vos listes et, si vous lui avez accordé « Lecture et écriture », y ajouter des éléments, les cocher et les modifier (nom, quantité, note, priorité, échéance), au nom de votre compte. Chaque connexion que vous avez autorisée apparaît ici.',
  'claude.connexions.adresse': 'Adresse à saisir dans Claude',
  'claude.connexions.adresse.detail': 'À ajouter comme connecteur personnalisé dans Claude :',
  'claude.connexions.copier': 'Copier l\'adresse',
  'claude.connexions.aide': 'Utiliser Listo avec Claude',
  'claude.connexions.aide.detail': 'Aide : se connecter, ce que Claude peut faire',

  // Connexions Claude : chargement
  'claude.connexions.reseau': 'Connexion nécessaire',
  'claude.connexions.reseau.texte': 'Il faut du réseau pour voir et déconnecter les connexions Claude.',
  'claude.connexions.indisponibles': 'Connexions indisponibles',

  // Connexions Claude : la liste
  'claude.connexions.section': 'Connexions',
  'claude.connexions.aucune': 'Aucune connexion',
  'claude.connexions.aucune.texte': 'Ajoutez Listo dans Claude avec l\'adresse ci-dessus, puis autorisez-le.',
  'claude.connexions.deconnecter.question': 'Déconnecter {name} ?',
  'claude.connexions.deconnecter.texte': 'Claude ne pourra plus lire ni modifier vos listes avec cette connexion. Pour le reconnecter, il faudra l\'autoriser de nouveau.',
  'claude.connexions.deconnecter': 'Déconnecter',
  'claude.connexions.deconnectee': 'Connexion déconnectée',
  'claude.connexions.tout.question': 'Tout déconnecter ?',
  'claude.connexions.tout.texte': 'Toutes vos connexions Claude sont coupées tout de suite. Pour reconnecter Claude, il faudra l\'autoriser de nouveau.',
  'claude.connexions.tout': 'Tout déconnecter',
  'claude.connexions.tout.fait': 'Toutes les connexions sont déconnectées',
  'claude.connexions.section.nombre': 'Connexions ({count})',

  // Connexions Claude : une connexion
  'claude.connexions.aucuneListe': 'Aucune liste (supprimées ou quittées)',
  'claude.connexions.jamais': 'jamais',
  'claude.connexions.reponse': 'Réponse envoyée à : {host}',
  'claude.connexions.listes': 'Listes : {lists}',
  'claude.connexions.date': 'Connectée le {date}',
  'claude.connexions.utilisation': 'Dernière utilisation : {used}',
  'claude.connexions.deconnecter.nom': 'Déconnecter {name}',

  // Autoriser Claude : niveaux d'accord
  'claude.autoriser.lecture.texte': 'Claude pourra lire vos listes, sans rien y changer.',
  'claude.autoriser.ecriture.texte': 'Claude pourra lire vos listes, y ajouter des éléments, les cocher et modifier leurs éléments (nom, quantité, note, priorité, échéance, répétition). Jamais supprimer d\'élément ni de liste, ni partager.',
  'claude.autoriser.ecriture.avertissement': 'Une liste partagée peut contenir un texte piégé, écrit pour tromper Claude et lui faire changer vos éléments. C\'est pourquoi ce niveau demande plus de confiance : choisissez-le seulement si vous en avez besoin.',

  // Autoriser Claude : titre et demande introuvable
  'claude.autoriser.titre': 'Autoriser Claude',
  'claude.autoriser.expiree': 'Demande introuvable ou expirée',
  'claude.autoriser.expiree.texte': 'Relancez la connexion depuis Claude.',
  'claude.autoriser.impossible': 'Demande impossible à afficher',

  // Autoriser Claude : confirmation chez le fournisseur d'identité
  'claude.autoriser.fournisseur.echec': '{provider} n\'a pas redemandé la connexion : la confirmation n\'a pas abouti. Réessayez.',
  'claude.autoriser.refuser': 'Refuser',
  'claude.autoriser.intro': 'Claude demande l\'accès à vos listes Listo. Il agira avec votre compte et vos droits, jamais plus.',
  'claude.autoriser.attention': 'Ne continuez que si vous venez de lancer la connexion depuis Claude.',
  'claude.autoriser.nomSeul': '« {name} »',
  'claude.autoriser.application': 'Application qui demande l\'accès',
  'claude.autoriser.fournisseur.texte': 'Vous êtes connecté avec {provider} : confirmez d\'abord votre identité. {provider} vous redemandera de vous connecter, puis vous reviendrez ici pour choisir l\'accès et les listes.',
  'claude.autoriser.fournisseur.confirmer': 'Confirmer avec {provider}',

  // Autoriser Claude : le formulaire
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
  'claude.autoriser.local': 'La réponse ira à une application installée sur cet ordinateur (par exemple Claude Code), pas à claude.ai. Refusez si vous ne l\'avez pas lancée vous-même.',
  'claude.autoriser.fournisseur.confirme': 'Identité confirmée avec {provider} (valable 5 minutes).',
  'claude.autoriser.motDePasse.confirmer': 'Confirmez avec votre mot de passe.',
  'claude.autoriser.question': 'Vous venez de lancer cette connexion depuis Claude ? Si ce n\'est pas le cas, refusez.',
  'claude.autoriser.choisirListe': 'Choisissez au moins une liste.',
  'claude.autoriser.motDePasse.manquant': 'Saisissez votre mot de passe',
  'claude.autoriser.code.manquant': 'Saisissez un code',
};
