// Textes de public/js/screens/share.js, share-panel.js, share-picker.js et public/js/sharing.js, en français.
// Chaque nom commence par « partage. ».

export default {
  // Liste d'envies : ce que voient les visiteurs, et l'avertissement sur le destinataire
  'partage.envies.note': 'Les personnes qui ont ce lien voient les souhaits, leurs liens et leurs prix, et peuvent réserver un souhait ou participer à un cadeau, sans compte. Elles ne voient jamais qui a réservé.',
  'partage.envies.avertissement': 'Si la personne à qui la liste est destinée ouvre ce lien sans être connectée à Listo, elle verra quels souhaits sont réservés (jamais par qui). Ne le lui donnez pas.',

  // Durée de validité du lien
  'partage.duree.uneHeure': '1 heure',
  'partage.duree.vingtQuatreHeures': '24 heures',
  'partage.duree.septJours': '7 jours',
  'partage.duree.trenteJours': '30 jours',
  'partage.duree.personnalisee': 'Personnalisée',
  'partage.duree.illimitee': 'Illimitée',
  'partage.horsLigne': 'Indisponible hors ligne. Reconnectez-vous pour créer ou arrêter un lien.',
  'partage.duree.nombre': 'Nombre',
  'partage.duree.heures': 'Heures',
  'partage.duree.jours': 'Jours',
  'partage.duree.choixPersonnalise': 'Durée personnalisée',
  'partage.duree.unite': 'Unité',
  'partage.duree.titre': 'Durée de validité',
  'partage.duree.erreur.jours': 'Entre 1 et 365 jours.',
  'partage.duree.erreur.heures': 'Entre 1 et {max} heures.',

  // Copie
  'partage.copie.impossible': 'Copie impossible : sélectionnez le texte et copiez-le à la main.',

  // Feuille « Partager par un lien temporaire »
  'partage.feuille.titre': 'Partager par un lien temporaire',
  'partage.chargement': 'Chargement…',
  'partage.lienActif': 'Un lien public est actif pour cette liste.',

  // Aucun lien : création
  'partage.protection': 'Protéger par mot de passe',
  'partage.creer': 'Créer le lien',
  'partage.cree': 'Lien créé',
  'partage.creation.texte': 'Toute personne avec le lien voit la liste en lecture seule, sans compte.',
  'partage.protection.detail': '16 caractères, créé par Listo',

  // Lien actif : expiration et durée
  'partage.expiration.date': 'Expire le {date}',
  'partage.expiration.aucune': 'Sans date d\'expiration',
  'partage.expiration.aucune.detail': 'Valable jusqu\'à l\'arrêt du partage',
  'partage.annuler': 'Annuler',
  'partage.enregistrer': 'Enregistrer',
  'partage.duree.changee': 'Durée changée',
  'partage.duree.changer': 'Changer la durée',

  // Lien actif : mot de passe
  'partage.motDePasse.copie': 'Mot de passe copié',
  'partage.copier': 'Copier',
  'partage.motDePasse.masque': 'Mot de passe masqué',
  'partage.motDePasse': 'Mot de passe',
  'partage.motDePasse.uneFois': 'Ce mot de passe ne sera plus affiché.',
  'partage.motDePasse.nouveau': 'Nouveau mot de passe',
  'partage.motDePasse.nouveau.question': 'Nouveau mot de passe ?',
  'partage.motDePasse.nouveau.texte': 'L\'ancien ne marchera plus : il faudra donner le nouveau aux personnes qui ont le lien.',
  'partage.motDePasse.nouveau.confirmer': 'Créer',
  'partage.motDePasse.retirer': 'Retirer le mot de passe',
  'partage.motDePasse.retirer.question': 'Retirer le mot de passe ?',
  'partage.motDePasse.retirer.texte': 'Toute personne avec le lien pourra voir la liste.',
  'partage.motDePasse.retirer.confirmer': 'Retirer',
  'partage.motDePasse.retire': 'Mot de passe retiré',
  'partage.sansMotDePasse': 'Toute personne avec ce lien peut voir la liste.',
  'partage.motDePasse.ajouter': 'Ajouter un mot de passe',

  // Lien actif : adresse et arrêt du partage
  'partage.lien': 'Lien',
  'partage.lien.copie': 'Lien copié',
  'partage.lien.copier': 'Copier le lien',
  'partage.lien.illisible': 'L\'adresse de ce lien ne peut plus être affichée (la clé de Listo a changé). Arrêtez le partage, puis créez un nouveau lien.',
  'partage.arreter': 'Arrêter le partage',
  'partage.arreter.question': 'Arrêter le partage ?',
  'partage.arreter.texte': 'Le lien ne fonctionnera plus. Vous pourrez en créer un nouveau.',
  'partage.arreter.confirmer': 'Arrêter',
  'partage.arrete': 'Partage arrêté',

  // Entrée des menus (sharing.js) : « Partager » (propriétaire) ou « Personnes » (les autres)
  'partage.menu.partager': 'Partager',
  'partage.menu.personnes': 'Personnes',

  // Choix « Partager « Maison » » (share-panel.js, 24 novembre 2026)
  'partage.choix.titre': 'Partager « {name} »',
  'partage.choix.personnes': 'Avec des personnes de Listo',
  'partage.choix.lien': 'Par un lien temporaire',
  'partage.choix.personnes.aucune': 'Seulement vous',
  'partage.choix.personnes.autres': { one: '{count} autre personne', other: '{count} autres personnes' },
  'partage.choix.lien.aucun': 'Aucun lien',
  'partage.choix.lien.actif': 'Lien actif · {expiry}',
  'partage.choix.lien.actif.motDePasse': 'Lien actif · {expiry} · protégé par mot de passe',
  'partage.choix.lien.illimite': 'Lien actif · sans limite',
  'partage.choix.lien.illimite.motDePasse': 'Lien actif · sans limite · protégé par mot de passe',
  'partage.choix.lien.jours': { one: 'expire dans {count} jour', other: 'expire dans {count} jours' },
  'partage.choix.lien.heures': { one: 'expire dans {count} heure', other: 'expire dans {count} heures' },
  'partage.choix.lien.minutes': { one: 'expire dans {count} minute', other: 'expire dans {count} minutes' },
  'partage.choix.lien.bientot': 'expire dans moins d\'une minute',
  'partage.choix.aide.liste': 'Les personnes de Listo voient et modifient la liste selon leur droit. Le lien donne une lecture seule, sans compte.',
  'partage.choix.aide.envies': 'Les personnes de Listo voient et modifient la liste selon leur droit. Avec le lien, on voit les souhaits et on peut en réserver un, sans compte.',
  'partage.choix.aide.note': 'Les personnes de Listo voient et modifient la note selon leur droit. Le lien donne une lecture seule, sans compte.',

  // Feuille « Partager avec des personnes » (share-picker.js, share-panel.js)
  'partage.personnes.titre': 'Partager avec des personnes',
  'partage.personnes.ok': 'OK',
  'partage.personnes.vous': '{name} (vous)',
  'partage.personnes.proprietaire': 'Propriétaire',
  'partage.personnes.destinataire': 'Destinataire · Peut modifier',
  'partage.personnes.desactive': 'Compte désactivé',
  'partage.personnes.horsLigne': 'Indisponible hors ligne : reconnectez-vous pour changer le partage.',
  'partage.personnes.echec': 'Le partage n\'a pas pu être changé : {message}',
  'partage.personnes.fait': 'Partage enregistré',
  'partage.droit.modifier': 'Modifier',
  'partage.droit.lire': 'Lire',
  'partage.droit.choix': 'Droit de {name} sur la liste',
  'partage.droit.choix.note': 'Droit de {name} sur la note',

  // « Personnes » (les autres membres) : qui partage, en lecture
  'partage.vue.titre': 'Personnes',
  'partage.vue.peutModifier': 'Peut modifier',
  'partage.vue.lectureSeule': 'Lecture seule',
  'partage.vue.proprietaireSeul': 'Seul le propriétaire choisit les personnes, leur droit et le lien.',
  // Projets (docs/cadrage-projets.md, 4.6) : pas de lien public, trois
  // droits à donner (quatre rôles avec le propriétaire)
  'partage.droit.contribuer': 'Contribuer',
  'partage.droit.choix.projet': 'Droit de {name} sur le projet',
  'partage.legende.separateur': ' : ',
  'partage.legende.modifier': 'toutes les cartes et les colonnes.',
  'partage.legende.contribuer': 'ajouter des cartes, commenter, modifier ses cartes et celles qu\'on lui attribue.',
  'partage.legende.lire': 'voir, sans rien changer.',
  'partage.projet.titre': 'Partager « {name} »',
  'partage.projet.intro': 'Avec des personnes de Listo seulement : un projet n\'a pas de lien public. Le droit vaut pour tout le projet.',
  'partage.vue.proprietaireSeul.projet': 'Seul le propriétaire choisit les personnes et leur droit.',

  // Comptes invités (docs/cadrage-comptes.md) : « Invité · discret » sous le
  // prénom, dans la feuille de l'Admin seulement ; « Personnes » d'un
  // propriétaire invité (il ne partage jamais)
  'partage.personnes.invite': 'Invité · discret',
  'partage.vue.invite': 'Un compte invité ne partage pas : l\'Admin s\'en charge.',
};
