// Textes de public/js/screens/admin.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/administration.js.

export default {
  // Onglets et choix de « Courses »
  'administration.magasins': 'Stores',
  'administration.magasins.nouveau': 'New store',
  'administration.rayons': 'Aisles',
  'administration.rayons.nouveau': 'New aisle',
  'administration.onglets.comptes': 'Accounts',
  'administration.onglets.courses': 'Shopping',
  'administration.rubriques': 'Sections',

  // Écran (hors ligne, titre, chargement)
  'administration.horsLigne.titre': 'Unavailable offline',
  'administration.horsLigne.texte': 'Administration needs a network connection. It will show up as soon as you\'re back online.',
  'administration.retour': 'Back to settings',
  'administration.titre': 'Administration',
  'administration.chargement': 'Loading…',
  'administration.reessayer': 'Try again',

  // Rôle (Utilisateur / Admin)
  'administration.role.utilisateur': 'User',
  'administration.role.admin': 'Admin',
  'administration.role': 'Role',

  // Comptes : liste et demandes de compte
  'administration.compte.deuxFacteurs.active': '2FA enabled',
  'administration.compte.deuxFacteurs.desactive': '2FA disabled',
  'administration.compte.desactive': 'account disabled',
  'administration.demande.titre': {
    one: 'Account request',
    other: 'Account requests',
  },
  'administration.demande.detail': '{username} · via {provider}',
  'administration.demande.refuser': 'Decline',
  'administration.demande.accepter': 'Accept',
  'administration.compte.desactive.puce': 'Disabled',
  'administration.compte.gerer': 'Manage {name}\'s account',
  'administration.compte.ajouter': 'Add account',

  // Feuille d'un compte
  'administration.motDePasse.reinitialiser.titre': 'Reset password',
  'administration.compte.deuxFacteurs.question': 'Disable two-factor authentication?',
  'administration.compte.deuxFacteurs.texte': '{name} will be able to sign in with just their password, then turn 2FA back on in their settings.',
  'administration.compte.desactiver': 'Disable',
  'administration.compte.deuxFacteurs.desactivee': 'Two-factor authentication disabled',
  'administration.compte.deuxFacteurs.desactiver': 'Disable two-factor authentication',
  'administration.compte.desactiver.question': 'Disable account?',
  'administration.compte.desactiver.texte': '{name} will be signed out right away and won\'t be able to sign in anymore. Their lists are kept.',
  'administration.compte.desactive.fait': 'Account disabled',
  'administration.compte.desactiver.titre': 'Disable account',
  'administration.compte.reactive': 'Account re-enabled',
  'administration.compte.reactiver': 'Re-enable account',
  'administration.compte.supprimer.question': 'Delete account?',
  'administration.compte.supprimer.texte': '{name}\'s account has never been used: it will be deleted permanently.',
  'administration.supprimer': 'Delete',
  'administration.compte.supprime': 'Account deleted',
  'administration.compte.supprimer': 'Delete account',
  'administration.compte.delier.question': 'Unlink {provider} account?',
  'administration.compte.delier.texte': 'The next {provider} account named “{username}” will be able to open {name}\'s account.',
  'administration.compte.delier': 'Unlink',
  'administration.compte.delie': '{provider} account unlinked',
  'administration.compte.delier.titre': 'Unlink {provider} account',
  'administration.compte.role.admin': 'Role set to Admin',
  'administration.compte.role.utilisateur': 'Role set to User',
  'administration.compte.role.soiMeme': 'You can\'t change your own role.',
  'administration.compte.soiMeme': 'Your password and 2FA are managed in your settings.',

  // Réinitialisation du mot de passe
  'administration.motDePasse.provisoire': 'Temporary password',
  'administration.motDePasse.reinitialiser.aide': '{name} will have to change it at their next sign-in. They\'ll be signed out everywhere.',
  'administration.motDePasse.reinitialiser': 'Reset',
  'administration.motDePasse.court': 'At least 10 characters',
  'administration.motDePasse.reinitialise': 'Password reset',

  // Demande de compte : accepter, refuser
  'administration.identifiant': 'Username',
  'administration.identifiant.aide': '2 to 50 characters: letters (no accents), numbers, . _ -',
  'administration.nomAffiche': 'Display name',
  'administration.compte.creer': 'Create account',
  'administration.demande.fournisseur': 'This person will sign in with {provider}; they don\'t have a Listo password.',
  'administration.demande.accepter.titre': 'Accept request',
  'administration.identifiant.invalide': 'Invalid username',
  'administration.nomAffiche.obligatoire': 'Display name required',
  'administration.compte.cree': 'Account created',
  'administration.demande.refuser.question': 'Decline request?',
  'administration.demande.refuser.texte': '{name} ({username}) won\'t be able to get into Listo. They can send a new request in 30 days.',
  'administration.demande.refusee': 'Request declined',

  // Nouveau compte
  'administration.nomAffiche.facultatif': 'Display name (optional)',
  'administration.motDePasse.provisoire.aide': 'They\'ll change it the first time they sign in.',
  'administration.nouveauCompte.fournisseur': 'This person will sign in with {provider}, using the same username.',
  'administration.nouveauCompte.titre': 'New account',

  // Magasins, rayons : ajout
  'administration.ajouter': 'Add',
  'administration.magasins.multi.aide': 'A “Multi” store groups several stores: items are sorted by store, with no aisles.',
  'administration.magasins.type': 'Store type',
  'administration.magasins.type.simple': 'Single',
  'administration.magasins.type.multi': 'Multi',
  'administration.ajoute': '“{name}” added',
  'administration.ajoutee': '“{name}” added',
  'administration.vide': 'Nothing here yet.',

  // Magasin « multi » : magasins regroupés
  'administration.magasins.regroupes.voir': 'Stores grouped in {name}',
  'administration.magasins.desactive': '(disabled)',
  'administration.magasins.supprimer': 'Delete this store',
  'administration.magasins.regroupes': 'Grouped stores',
  'administration.magasins.aucunSimple': 'Add some single stores first.',
  'administration.magasins.sansMagasin': 'Items without a store come last, under “No store”.',

  // Rayons : groupés par magasin, magasin d'un nouveau rayon, changement de magasin
  'administration.rayons.tousMagasins': 'All stores',
  'administration.rayons.magasin': 'Aisle\'s store',
  'administration.rayons.magasin.choisir': 'Store for the new aisle: {store}',
  'administration.rayons.magasin.valider': 'Choose',
  'administration.rayons.ajoute': '“{name}” added to {store}',
  'administration.rayons.deplacer': 'Change the store of {name}',
  'administration.rayons.deplacer.titre': 'Store for “{name}”',
  'administration.rayons.deplacer.texte': 'An “All stores” aisle is used in every list; a store\'s aisle, only in that store\'s lists.',
  'administration.rayons.deplacer.valider': 'Move',
  'administration.rayons.deplace': '“{name}”: {store}',

  // État d'un magasin ou d'un rayon
  'administration.etat.active': 'Active',
  'administration.etat.actif': 'Active',
  'administration.etat.desactivee': 'Disabled',
  'administration.etat.desactive': 'Disabled',
  'administration.etat.multi': {
    one: '{count} store · {state}',
    other: '{count} stores · {state}',
  },
  'administration.etat.simple': 'Single · {state}',

  // Ligne d'un magasin ou d'un rayon : modifier, supprimer, interrupteur, renommer
  'administration.modifier': 'Edit {name}',
  'administration.supprimer.element': 'Delete {name}',
  'administration.interrupteur.active': '{name} active',
  'administration.interrupteur.actif': '{name} active',
  'administration.interrupteur.desactivee': '{name} disabled',
  'administration.interrupteur.desactive': '{name} disabled',
  'administration.renommer': 'Rename “{label}”',
  'administration.renommer.enregistrer': 'Save new name',
  'administration.annuler': 'Cancel',
  'administration.supprimer.question': 'Delete “{name}”?',
  'administration.supprimer.texte': 'This has never been used: it will be deleted permanently.',
  'administration.supprime': '“{name}” deleted',
  'administration.supprimee': '“{name}” deleted',

  // Articles enregistrés (mémoire des noms) : recherche, tri, pages
  // (seules les listes de courses mémorisent des noms : toujours « article »)
  'administration.noms.rechercher': 'Search items',
  'administration.noms.trier': 'Sort',
  'administration.noms.trier.nom': 'By name',
  'administration.noms.trier.utilisation': 'By use',
  'administration.noms.aucunResultat': 'No items match this search.',
  'administration.noms.vide': 'No saved items yet.',
  'administration.noms.plus': { one: 'Show more ({count} left)', other: 'Show more ({count} left)' },

  // Ligne d'un article enregistré : corriger, rayon, retirer
  'administration.noms.corriger': 'Correct {name}',
  'administration.noms.modifierRayon': 'Change aisle for {name}',
  'administration.noms.retirer': 'Remove {name} from suggestions',
  'administration.noms.orthographe': 'New spelling for “{label}”',
  'administration.noms.corriger.valider': 'Correct name',
  'administration.noms.corriger.question': 'Correct this name?',
  'administration.noms.corriger.bouton': 'Correct',

  // Rayon habituel d'un article
  'administration.noms.aucunRayon': 'No aisle',
  'administration.noms.enregistrer': 'Save',
  'administration.noms.rayon.titre': 'Aisle for “{name}”',
  'administration.noms.rayon': 'Aisle',
  'administration.noms.rayon.fait': 'Aisle for “{name}”: {aisle}',
  'administration.noms.rayon.aucun': '“{name}” no longer has a usual aisle',
  'administration.noms.rayon.magasin': '{aisle} ({store})',

  // Retirer un article des suggestions
  'administration.noms.retirer.question': 'Remove “{name}” from suggestions?',
  'administration.noms.retirer.texte': 'It won\'t be suggested anymore when you type an item. Lists don\'t change. If it\'s typed again in a shopping list, it will be saved again.',
  'administration.noms.retirer.bouton': 'Remove',
  'administration.noms.retire': '“{name}” removed from suggestions',
};
