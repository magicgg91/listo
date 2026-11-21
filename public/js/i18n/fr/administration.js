// Textes de public/js/screens/admin.js, en français.
// Chaque nom commence par « administration. ».

export default {
  // Onglets et choix de « Courses »
  'administration.magasins': 'Magasins',
  'administration.magasins.nouveau': 'Nouveau magasin',
  'administration.rayons': 'Rayons',
  'administration.rayons.nouveau': 'Nouveau rayon',
  'administration.onglets.comptes': 'Comptes',
  'administration.onglets.courses': 'Courses',
  'administration.rubriques': 'Rubriques',

  // Écran (hors ligne, titre, chargement)
  'administration.horsLigne.titre': 'Indisponible hors ligne',
  'administration.horsLigne.texte': 'L\'administration a besoin du réseau. Elle s\'affichera dès son retour.',
  'administration.retour': 'Retour aux réglages',
  'administration.titre': 'Administration',
  'administration.chargement': 'Chargement…',
  'administration.reessayer': 'Réessayer',

  // Rôle (Utilisateur / Admin)
  'administration.role.utilisateur': 'Utilisateur',
  'administration.role.admin': 'Admin',
  'administration.role': 'Rôle',

  // Comptes : liste et demandes de compte
  'administration.compte.deuxFacteurs.active': '2FA activé',
  'administration.compte.deuxFacteurs.desactive': '2FA désactivé',
  'administration.compte.desactive': 'compte désactivé',
  'administration.demande.titre': {
    one: 'Demande de compte',
    other: 'Demandes de compte',
  },
  'administration.demande.detail': '{username} · par {provider}',
  'administration.demande.refuser': 'Refuser',
  'administration.demande.accepter': 'Accepter',
  'administration.compte.desactive.puce': 'Désactivé',
  'administration.compte.gerer': 'Gérer le compte de {name}',
  'administration.compte.ajouter': 'Ajouter un compte',

  // Feuille d'un compte
  'administration.motDePasse.reinitialiser.titre': 'Réinitialiser le mot de passe',
  'administration.compte.deuxFacteurs.question': 'Désactiver la double authentification ?',
  'administration.compte.deuxFacteurs.texte': '{name} pourra se connecter avec son seul mot de passe, puis réactiver la 2FA dans ses réglages.',
  'administration.compte.desactiver': 'Désactiver',
  'administration.compte.deuxFacteurs.desactivee': 'Double authentification désactivée',
  'administration.compte.deuxFacteurs.desactiver': 'Désactiver la double authentification',
  'administration.compte.desactiver.question': 'Désactiver le compte ?',
  'administration.compte.desactiver.texte': '{name} sera déconnecté tout de suite et ne pourra plus se connecter. Ses listes sont conservées.',
  'administration.compte.desactive.fait': 'Compte désactivé',
  'administration.compte.desactiver.titre': 'Désactiver le compte',
  'administration.compte.reactive': 'Compte réactivé',
  'administration.compte.reactiver': 'Réactiver le compte',
  'administration.compte.supprimer.question': 'Supprimer le compte ?',
  'administration.compte.supprimer.texte': 'Le compte de {name} n\'a jamais servi : il sera supprimé définitivement.',
  'administration.supprimer': 'Supprimer',
  'administration.compte.supprime': 'Compte supprimé',
  'administration.compte.supprimer': 'Supprimer le compte',
  'administration.compte.delier.question': 'Délier le compte {provider} ?',
  'administration.compte.delier.texte': 'Le prochain compte {provider} nommé « {username} » pourra ouvrir le compte de {name}.',
  'administration.compte.delier': 'Délier',
  'administration.compte.delie': 'Compte {provider} délié',
  'administration.compte.delier.titre': 'Délier le compte {provider}',
  'administration.compte.role.admin': 'Rôle Admin donné',
  'administration.compte.role.utilisateur': 'Rôle Utilisateur donné',
  'administration.compte.role.soiMeme': 'Vous ne pouvez pas changer votre propre rôle.',
  'administration.compte.soiMeme': 'Votre mot de passe et votre 2FA se gèrent dans vos réglages.',

  // Réinitialisation du mot de passe
  'administration.motDePasse.provisoire': 'Mot de passe provisoire',
  'administration.motDePasse.reinitialiser.aide': '{name} devra le changer à sa prochaine connexion. Toutes ses sessions sont fermées.',
  'administration.motDePasse.reinitialiser': 'Réinitialiser',
  'administration.motDePasse.court': 'Au moins 10 caractères',
  'administration.motDePasse.reinitialise': 'Mot de passe réinitialisé',

  // Demande de compte : accepter, refuser
  'administration.identifiant': 'Identifiant',
  'administration.identifiant.aide': '2 à 50 caractères : lettres sans accent, chiffres, . _ -',
  'administration.nomAffiche': 'Nom affiché',
  'administration.compte.creer': 'Créer le compte',
  'administration.demande.fournisseur': 'La personne se connectera avec {provider} ; elle n\'a pas de mot de passe Listo.',
  'administration.demande.accepter.titre': 'Accepter la demande',
  'administration.identifiant.invalide': 'Identifiant invalide',
  'administration.nomAffiche.obligatoire': 'Nom affiché obligatoire',
  'administration.compte.cree': 'Compte créé',
  'administration.demande.refuser.question': 'Refuser la demande ?',
  'administration.demande.refuser.texte': '{name} ({username}) ne pourra pas entrer dans Listo. Une nouvelle demande sera possible dans 30 jours.',
  'administration.demande.refusee': 'Demande refusée',

  // Nouveau compte
  'administration.nomAffiche.facultatif': 'Nom affiché (facultatif)',
  'administration.motDePasse.provisoire.aide': 'À changer par la personne à sa première connexion.',
  'administration.nouveauCompte.fournisseur': 'La personne se connectera avec {provider}, avec le même identifiant.',
  'administration.nouveauCompte.titre': 'Nouveau compte',

  // Magasins, rayons : ajout
  'administration.ajouter': 'Ajouter',
  'administration.magasins.multi.aide': 'Un magasin multi regroupe plusieurs magasins : les articles sont classés par magasin, sans rayons.',
  'administration.magasins.type': 'Type de magasin',
  'administration.magasins.type.simple': 'Simple',
  'administration.magasins.type.multi': 'Multi',
  'administration.ajoute': '« {name} » ajouté',
  'administration.ajoutee': '« {name} » ajoutée',
  'administration.vide': 'Aucun élément pour le moment.',

  // Magasin « multi » : magasins regroupés
  'administration.magasins.regroupes.voir': 'Magasins regroupés de {name}',
  'administration.magasins.desactive': '(désactivé)',
  'administration.magasins.supprimer': 'Supprimer ce magasin',
  'administration.magasins.regroupes': 'Magasins regroupés',
  'administration.magasins.aucunSimple': 'Ajoutez d\'abord des magasins simples.',
  'administration.magasins.sansMagasin': 'Les articles sans magasin passent en dernier, sous « Sans magasin ».',

  // Rayons : groupés par magasin, magasin d'un nouveau rayon, changement de magasin
  'administration.rayons.tousMagasins': 'Tous les magasins',
  'administration.rayons.magasin': 'Magasin du rayon',
  'administration.rayons.magasin.choisir': 'Magasin du nouveau rayon : {store}',
  'administration.rayons.magasin.valider': 'Choisir',
  'administration.rayons.ajoute': '« {name} » ajouté à {store}',
  'administration.rayons.deplacer': 'Changer le magasin de {name}',
  'administration.rayons.deplacer.titre': 'Magasin de « {name} »',
  'administration.rayons.deplacer.texte': 'Un rayon de « Tous les magasins » sert dans toutes les listes ; un rayon d\'un magasin, seulement dans les listes de ce magasin.',
  'administration.rayons.deplacer.valider': 'Déplacer',
  'administration.rayons.deplace': '« {name} » : {store}',

  // État d'un magasin ou d'un rayon
  'administration.etat.active': 'Active',
  'administration.etat.actif': 'Actif',
  'administration.etat.desactivee': 'Désactivée',
  'administration.etat.desactive': 'Désactivé',
  'administration.etat.multi': {
    one: '{count} magasin · {state}',
    other: '{count} magasins · {state}',
  },
  'administration.etat.simple': 'Simple · {state}',

  // Ligne d'un magasin ou d'un rayon : modifier, supprimer, interrupteur, renommer
  'administration.modifier': 'Modifier {name}',
  'administration.supprimer.element': 'Supprimer {name}',
  'administration.interrupteur.active': '{name} active',
  'administration.interrupteur.actif': '{name} actif',
  'administration.interrupteur.desactivee': '{name} désactivée',
  'administration.interrupteur.desactive': '{name} désactivé',
  'administration.renommer': 'Renommer « {label} »',
  'administration.renommer.enregistrer': 'Enregistrer le nouveau nom',
  'administration.annuler': 'Annuler',
  'administration.supprimer.question': 'Supprimer « {name} » ?',
  'administration.supprimer.texte': 'Cet élément n\'a jamais servi : il sera supprimé définitivement.',
  'administration.supprime': '« {name} » supprimé',
  'administration.supprimee': '« {name} » supprimée',

  // Articles enregistrés (mémoire des noms) : recherche, tri, pages
  // (seules les listes de courses mémorisent des noms : toujours « article »)
  'administration.noms.rechercher': 'Rechercher un article',
  'administration.noms.trier': 'Trier',
  'administration.noms.trier.nom': 'Par nom',
  'administration.noms.trier.utilisation': 'Par utilisation',
  'administration.noms.aucunResultat': 'Aucun article ne correspond à cette recherche.',
  'administration.noms.vide': 'Aucun article enregistré pour le moment.',
  'administration.noms.plus': { one: 'Afficher plus ({count} restant)', other: 'Afficher plus ({count} restants)' },

  // Ligne d'un article enregistré : corriger, rayon, retirer
  'administration.noms.corriger': 'Corriger {name}',
  'administration.noms.modifierRayon': 'Modifier le rayon de {name}',
  'administration.noms.retirer': 'Retirer {name} des suggestions',
  'administration.noms.orthographe': 'Orthographe corrigée de « {label} »',
  'administration.noms.corriger.valider': 'Corriger le nom',
  'administration.noms.corriger.question': 'Corriger ce nom ?',
  'administration.noms.corriger.bouton': 'Corriger',

  // Rayon habituel d'un article
  'administration.noms.aucunRayon': 'Aucun rayon',
  'administration.noms.enregistrer': 'Enregistrer',
  'administration.noms.rayon.titre': 'Rayon de « {name} »',
  'administration.noms.rayon': 'Rayon',
  'administration.noms.rayon.fait': 'Rayon de « {name} » : {aisle}',
  'administration.noms.rayon.aucun': '« {name} » n\'a plus de rayon habituel',
  'administration.noms.rayon.magasin': '{aisle} ({store})',

  // Retirer un article des suggestions
  'administration.noms.retirer.question': 'Retirer « {name} » des suggestions ?',
  'administration.noms.retirer.texte': 'Il ne sera plus proposé pendant la saisie d\'un article. Les listes ne changent pas. S\'il est saisi de nouveau dans une liste de courses, il sera de nouveau enregistré.',
  'administration.noms.retirer.bouton': 'Retirer',
  'administration.noms.retire': '« {name} » retiré des suggestions',
};
