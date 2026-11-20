// Textes de public/js/screens/share.js et public/js/screens/share-panel.js, en français.
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

  // Feuille « Partager par lien »
  'partage.feuille.titre': 'Partager par lien',
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

  // Panneau « Partager la liste » (ordinateur, share-panel.js)
  'partage.panneau.peutModifier': 'Peut modifier',
  'partage.panneau.lectureSeule': 'Lecture seule',
  'partage.panneau.horsLigne': 'Indisponible hors ligne : reconnectez-vous pour changer le partage.',
  'partage.panneau.echec': 'Le partage n\'a pas pu être changé : {message}',
  'partage.panneau.vous': '{name} (vous)',
  'partage.panneau.proprietaire': 'Propriétaire',
  'partage.panneau.destinataire': 'Destinataire · Peut modifier',
  'partage.panneau.droitDe': 'Droit de {name}',
  'partage.panneau.retirer': 'Retirer {name}',
  'partage.panneau.tousLesComptes': 'Tous les comptes ont déjà accès à cette liste.',
  'partage.panneau.ajout.personne': 'Personne à ajouter',
  'partage.panneau.ajout.droit': 'Droit de la personne ajoutée',
  'partage.panneau.ajouter': 'Ajouter',
  'partage.panneau.personnes': 'Personnes',
  'partage.panneau.proprietaireSeul': 'Seul le propriétaire choisit les personnes, leur droit et le lien public.',
  'partage.panneau.lienPublic': 'Lien public',
  'partage.panneau.titre': 'Partager la liste',
  'partage.panneau.termine': 'Terminé',
};
