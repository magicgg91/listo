// Textes de public/js/screens/list.js, en français.
// Chaque nom commence par « liste. ».

export default {
  // Recherche et menu
  'liste.recherche.label': 'Rechercher dans la liste',
  'liste.recherche.placeholder.pc': 'Rechercher',
  'liste.menu': 'Menu de la liste',

  // Tri (choix du menu, puis message affiché après le choix)
  'liste.tri.rayon': 'Par rayon',
  'liste.tri.rayon.message': 'Tri : par rayon',
  'liste.tri.alpha': 'Ordre alphabétique',
  'liste.tri.alpha.message': 'Tri : ordre alphabétique',
  'liste.tri.priorite': 'Par priorité',
  'liste.tri.priorite.message': 'Tri : par priorité',
  'liste.tri.echeance': 'Par échéance',
  'liste.tri.echeance.message': 'Tri : par échéance',
  'liste.tri.personne': 'Par personne',
  'liste.tri.personne.message': 'Tri : par personne',
  'liste.tri.magasin': 'Par magasin',
  'liste.tri.magasin.message': 'Tri : par magasin',
  'liste.tri.bouton': 'Trier la liste',

  // En-tête de l'ordinateur
  'liste.pc.partageeAvec': 'Partagée avec {names}',
  'liste.pc.partager': 'Partager',
  'liste.pc.personnes': 'Personnes',

  // Liste d'envies : ce que la personne voit des réservations
  'liste.envies.beneficiaire': 'Vous ne voyez jamais les réservations : la surprise reste entière.',
  'liste.envies.visibles.cache': 'Réservations visibles. {name}, à qui la liste est destinée, ne les voit pas.',
  'liste.envies.visibles': 'Réservations visibles par les personnes qui partagent la liste.',
  'liste.lectureSeule': 'Lecture seule',

  // Groupes repliables
  'liste.toutReplier': 'Tout replier',
  'liste.toutDeplier': 'Tout déplier',

  // Recherche sans résultat
  'liste.recherche.aucunResultat': 'Aucun résultat',
  'liste.recherche.aucun': 'Aucun {word} ne correspond à « {query} ».',
  'liste.recherche.effacer': 'Effacer la recherche',

  // Dessin de la liste : chargement, liste introuvable, liste vide
  'liste.chargement': 'Chargement…',
  'liste.introuvable': 'Liste introuvable',
  'liste.introuvable.texte': 'Cette liste a été supprimée, ou elle n\'est plus partagée avec vous.',
  'liste.retourMesListes': 'Retour à mes listes',
  // Champ d'ajout (courses, tâches, envies)
  'liste.ajout.placeholder.courses': 'Ajouter un article',
  'liste.ajout.placeholder.taches': 'Ajouter un élément',
  'liste.ajout.placeholder.envies': 'Ajouter un souhait',
  'liste.vide': 'Cette liste est vide',
  'liste.vide.ajouter.pc': 'Ajoutez un premier {word} avec le champ ci-dessus.',
  'liste.vide.ajouter': 'Ajoutez un premier {word} avec le champ ci-dessous.',
  'liste.vide.lectureSeule': 'Rien à afficher pour le moment.',
  // « Astuce : appuyez sur [A] pour aller au champ d'ajout. » : une phrase
  // entière ; {key} marque la place de la touche, dessinée par l'écran
  'liste.vide.astuce': 'Astuce : appuyez sur {key} pour aller au champ d\'ajout.',
  'liste.sansMagasin': 'Sans magasin',
  'liste.sansRayon': 'Sans rayon',

  // Pastilles d'une ligne, lues par les lecteurs d'écran
  'liste.lecture.repete': 'se répète : {rule}',
  'liste.lecture.pour': 'pour {names}',
  'liste.lecture.moi': 'moi',
  'liste.lecture.tour': 'chacun son tour, cette fois {name}',

  // Attribution (« Pour »)
  'liste.personne': 'Personne',
  'liste.pour.tour.detail': 'Chacun son tour : {names} (cette fois : {name})',
  'liste.pour.personneMinuscule': 'personne',
  'liste.moi': 'Moi',

  // Liste d'envies : pastilles de réservation
  'liste.envies.ouvert': 'Ouvert à d\'autres',
  'liste.envies.ouvert.lecture': 'ouvert à d\'autres',
  'liste.envies.visiteur': '{name} (lien public)',
  'liste.envies.vous': 'vous',
  'liste.envies.reservePar': 'Réservé par {names}',

  // Ligne d'un article ou d'un élément
  'liste.supprimer.nom': 'Supprimer {name}',
  'liste.supprimer': 'Supprimer',
  'liste.envies.recu.nom': 'Reçu : {name}',
  'liste.etat.recu': 'Reçu',
  'liste.etat.pasRecu': 'Pas encore reçu',
  'liste.etat.coche': 'Coché',
  'liste.etat.nonCoche': 'Non coché',
  'liste.modifier.nom': 'Modifier {name}',
  'liste.voir.nom': 'Voir {name}',
  'liste.photo.agrandir': 'Agrandir la photo de {name}',

  // Sous-tâches
  'liste.sousTaches.progression': {
    one: 'Sous-tâches de {name} : {count} faite sur {total}',
    other: 'Sous-tâches de {name} : {count} faites sur {total}',
  },
  'liste.sousTaches.ajouter.nom': 'Ajouter une sous-tâche à {name}',
  'liste.sousTaches.ajouter': 'Ajouter une sous-tâche',
  'liste.sousTaches.reordonner.nom': 'Réordonner les sous-tâches de {name}',
  'liste.sousTaches.reordonner': 'Réordonner',

  // « Réordonner » les sous-tâches
  'liste.reordonner.monter': 'Monter {name}',
  'liste.reordonner.descendre': 'Descendre {name}',
  'liste.reordonner.glisser': 'Glisser pour déplacer',
  'liste.reordonner.termine': 'Terminé',
  'liste.reordonner.position': '« {name} » en position {position} sur {total}',

  // Feuille « Nouvelle sous-tâche »
  'liste.sousTaches.champ': 'Nom de la sous-tâche',
  'liste.ajouter': 'Ajouter',
  'liste.sousTaches.nouvelle': 'Nouvelle sous-tâche',
  'liste.sousTaches.ajoutee': '« {name} » ajoutée',

  // Actions au bout de la ligne (ordinateur), « Réserver »
  'liste.pc.modifier.astuce': 'Modifier · E',
  'liste.pc.supprimer.astuce': 'Supprimer · Suppr',
  'liste.envies.reserver.nom': 'Réserver {name}',
  'liste.envies.horsLigne': 'Réserver, participer ou quitter demande une connexion.',
  'liste.envies.reserve': 'Souhait réservé',
  'liste.envies.reserver': 'Réserver',

  // Photo en plein écran (courses, tâches, envies)
  'liste.photo.alt.courses': 'Photo de l\'article {name}',
  'liste.photo.alt.taches': 'Photo de l\'élément {name}',
  'liste.photo.alt.envies': 'Photo du souhait {name}',

  // Supprimer, cocher (messages avec « Annuler »)
  'liste.supprime.avecSousTaches': {
    one:'« {name} » et sa sous-tâche supprimées',
    other: '« {name} » et {count} sous-tâches supprimées',
  },
  'liste.supprime': '« {name} » supprimé',
  'liste.annuler.pc': 'Annuler (Ctrl+Z)',
  'liste.annuler': 'Annuler',
  // Bouton « Annuler » de la fiche sur ordinateur (fermer sans enregistrer)
  'liste.fiche.annuler': 'Annuler',
  'liste.coche.avecSousTaches': {
    one:'« {name} » et sa sous-tâche cochées',
    other: '« {name} » et {count} sous-tâches cochées',
  },
  'liste.prochaineFois': 'Prochaine fois : {date}',

  // « Tout remettre à acheter » / « Tout rouvrir » ({items} : « 3 articles »)
  'liste.rouvrir.courses.titre': 'Remettre {items} à acheter ?',
  'liste.rouvrir.titre': 'Rouvrir {items} ?',
  'liste.rouvrir.courses.texte.magasin': {
    one:'Il reviendra dans son magasin, décoché.',
    other: 'Ils reviendront dans leur magasin, décochés.',
  },
  'liste.rouvrir.courses.texte.rayon': {
    one:'Il reviendra dans son rayon, décoché.',
    other: 'Ils reviendront dans leur rayon, décochés.',
  },
  'liste.rouvrir.texte': {
    one:'Il reviendra dans la liste, décoché.',
    other: 'Ils reviendront dans la liste, décochés.',
  },
  'liste.confirmer': 'Confirmer',
  'liste.rouvrir.courses.fait': '{items} remis à acheter',
  'liste.rouvrir.fait': {
    one:'{items} rouvert',
    other: '{items} rouverts',
  },

  // « Retirer du panier » / « Retirer les terminés »
  'liste.retirerCoches.titre': 'Retirer {items} de la liste ?',
  'liste.retirerCoches.texte': {
    one:'Il sera supprimé pour tout le monde.',
    other: 'Ils seront supprimés pour tout le monde.',
  },
  'liste.retirerCoches.avertissement': {
    one:'C\'est définitif : impossible de le récupérer.',
    other: 'C\'est définitif : impossible de les récupérer.',
  },
  'liste.retirer': 'Retirer',
  'liste.retirerCoches.fait': {
    one:'{items} retiré',
    other: '{items} retirés',
  },

  // Ajout : suggestions et « Souvent ajoutés »
  'liste.suggestions': 'Suggestions',
  'liste.souvent.remis': 'Remis dans la liste : {name}',
  'liste.souvent.ajoute': 'Ajouté : {name}',
  'liste.souvent.retirer.nom': 'Retirer {name} de « Souvent ajoutés »',
  'liste.souvent.retire': 'Retiré de « Souvent ajoutés » : {name}',
  'liste.fermer': 'Fermer',
  'liste.souvent.titre': 'Souvent ajoutés',
  'liste.ajout.nouveau': 'Ajouter « {text} »',
  // Plusieurs éléments d'un coup : « 2 sur 3 », puis « 3 articles ajoutés »
  'liste.ajout.etape': '{index} sur {total}',
  'liste.ajout.plusieurs': '{items} ajoutés',

  // Rayon ou magasin d'un nouvel article (listes de courses seulement)
  'liste.place.magasin.connu': '« {name} » n\'a encore jamais été acheté dans ces magasins. Son magasin sera retenu pour la prochaine fois.',
  'liste.place.magasin.nouveau': '« {name} » est un nouvel article. Son magasin sera retenu pour la prochaine fois.',
  'liste.place.magasin.titre': 'Dans quel magasin ?',
  'liste.place.ajouter': 'Ajouter à la liste',
  'liste.place.rayon.titre': 'Dans quel rayon ?',
  'liste.place.rayon.nouveau': '« {name} » est un nouvel article. Son rayon sera retenu pour la prochaine fois.',

  // Réservation d'un souhait
  'liste.envies.ouvert.detail': 'D\'autres proches peuvent participer au cadeau.',
  'liste.envies.pasReserve': 'Pas encore réservé',
  'liste.envies.participer': 'Participer',
  'liste.envies.participez': 'Vous participez',
  'liste.envies.quitter': 'Quitter',
  'liste.envies.neParticipezPlus': 'Vous ne participez plus',
  'liste.envies.neParticipePlus': '{name} ne participe plus',
  'liste.envies.retirer.nom': 'Retirer {name}',
  'liste.envies.liberer': 'Libérer',
  'liste.envies.liberee': 'Réservation libérée',
  'liste.envies.reservation': 'Réservation',
  'liste.envies.jamaisMontrees': 'Les réservations ne sont jamais montrées à {name}.',
  'liste.envies.ouvrirLien': 'Ouvrir le lien',

  // Fiche « Modifier » : lien et prix (souhait), rayon, magasin
  'liste.fiche.lien': 'Lien (facultatif)',
  'liste.fiche.prix.exemple': 'ex. 24,90',
  'liste.fiche.prix': 'Prix indicatif (facultatif)',
  'liste.fiche.prix.unite': 'en {currency}',
  'liste.rayon': 'Rayon',
  'liste.choisir': 'Choisir',
  'liste.magasin': 'Magasin',

  // Fiche : priorité et échéance
  'liste.fiche.priorite.basse': 'Basse',
  'liste.fiche.priorite.normale': 'Normale',
  'liste.fiche.priorite.elevee': 'Élevée',
  'liste.effacer': 'Effacer',
  'liste.fiche.aucuneEcheance': 'Aucune échéance',
  'liste.fiche.echeance.choisir': 'Échéance : {label}. Choisir une date',

  // Fiche : se répète
  'liste.fiche.repete.jours': 'Jours de la semaine',
  // Jour du mois : forme exacte pour le 1er (ordinal ; en anglais, aussi
  // « 2nd », « 3rd », « 21st »…)
  'liste.fiche.repete.leJour': { '=1': 'Le 1er', other: 'Le {count}' },
  'liste.fiche.repete.mode.jourMois.choix': 'Un jour du mois (le 5)',
  'liste.fiche.repete.mode.jourSemaine.choix': 'Un jour de la semaine (le 1er lundi)',
  // « Le 1er », « Le dernier » ({rank} vient de repeat.js)
  'liste.fiche.repete.leRang': 'Le {rank}',
  'liste.fiche.passer': 'Passer cette fois',
  'liste.fiche.jamais': 'Jamais',
  'liste.fiche.repete.changer': 'Se répète : {label}. Changer',
  'liste.fiche.repete.mode.jourSemaine': 'Un jour de la semaine',
  'liste.fiche.repete.mode.jourMois': 'Un jour du mois',
  'liste.fiche.repete.mode.changer': 'Chaque mois : {label}. Changer',
  'liste.fiche.repete.rang.changer': 'Rang dans le mois : {label}. Changer',
  'liste.fiche.repete.jourSemaine.changer': 'Jour de la semaine : {label}. Changer',
  'liste.fiche.repete.chaqueMois.premier': 'Le 1er de chaque mois',
  // Ordinal (forme exacte pour le 1er ; en anglais, aussi « 2nd », « 3rd »…)
  'liste.fiche.repete.chaqueMois': { '=1': 'Le 1er de chaque mois', other: 'Le {count} de chaque mois' },
  'liste.fiche.repete.jourMois.changer': 'Jour du mois : {label}. Changer',

  // Fiche : heure et rappel
  'liste.fiche.heure': 'Heure (facultative)',
  'liste.fiche.rappel': 'Rappel',
  'liste.fiche.aucuneHeure': 'Aucune heure',
  'liste.fiche.heure.choisir': 'Heure : {label}. Choisir une heure',
  'liste.fiche.rappel.changer': 'Rappel : {label}. Changer',
  'liste.fiche.rappel.aide.pour': 'Une notification à la personne choisie dans « Pour », sinon à tous les membres, si leurs notifications sont activées.',
  'liste.fiche.rappel.aide': 'Une notification à tous les membres de la liste, si leurs notifications sont activées.',
  'liste.fiche.priorite': 'Priorité',

  // Fiche : date (raccourcis)
  'liste.fiche.date.semaine': 'Dans 1 sem.',
  'liste.fiche.date.semaine.lecture': 'Dans une semaine',
  'liste.fiche.date': 'Date',
  'liste.fiche.date.aujourdhui': 'Aujourd\'hui',
  'liste.fiche.date.demain': 'Demain',

  // Fiche : pour (attribution)
  'liste.fiche.pour.personnes': 'Personnes',
  'liste.fiche.ancienMembre': 'Ancien membre',
  'liste.fiche.pour.plusieurs.choix': 'Plusieurs personnes…',
  'liste.fiche.pour.tour.choix': 'Chacun son tour…',
  'liste.fiche.pour.plusieurs': 'Plusieurs personnes',
  'liste.fiche.pour.tour': 'Chacun son tour',
  'liste.fiche.pour.changer': 'Pour : {label}. Changer',
  'liste.fiche.pour.rang': '{name}, numéro {rank} dans le tour',
  'liste.fiche.pour.plusieurs.aide': 'La tâche est à chacune des personnes choisies (au moins deux) ; la première qui la coche la termine.',
  'liste.fiche.pour.tour.aide.cetteFois': 'Touchez les personnes dans l\'ordre du tour (au moins deux). Cette fois : {name}.',
  'liste.fiche.pour.tour.aide': 'Touchez les personnes dans l\'ordre du tour (au moins deux).',
  'liste.fiche.pour': 'Pour',
  'liste.fiche.repete': 'Se répète',

  // Fiche : sous-pages et « Sous-tâche de »
  'liste.fiche.retour': 'Retour à la fiche',
  'liste.fiche.echeance': 'Échéance',
  'liste.fiche.sousTacheDe': 'Sous-tâche de',
  'liste.fiche.parent.aDesSousTaches': {
    one:'Cette tâche a une sous-tâche : elle ne peut pas devenir une sous-tâche.',
    other: 'Cette tâche a {count} sous-tâches : elle ne peut pas devenir une sous-tâche.',
  },
  'liste.fiche.parent.repete': 'Une tâche qui se répète ne peut pas devenir une sous-tâche : retirez d\'abord la répétition.',
  'liste.fiche.parent.aucune': 'Aucune (tâche principale)',

  // Fiche : résumés des sous-pages
  'liste.fiche.resume.rappel': 'rappel {label}',
  'liste.fiche.resume.tour.cetteFois': 'Chacun son tour : {names} · cette fois : {name}',
  'liste.fiche.resume.tour': 'Chacun son tour : {names}',
  'liste.fiche.resume.tacheSupprimee': 'Tâche supprimée',
  'liste.fiche.resume.principale': {
    one: 'Tâche principale · {count} sous-tâche',
    other: 'Tâche principale · {count} sous-tâches',
  },
  'liste.fiche.resume.aucune': 'Aucune',
  'liste.fiche.sousPage.modifier': '{title} : {text}. Modifier',

  // Fiche : code-barres
  'liste.fiche.codeBarres.effacer': 'Effacer le code-barres',
  'liste.fiche.codeBarres.scanner': 'Scanner un code-barres',
  'liste.fiche.codeBarres': 'Code-barres',
  'liste.fiche.codeBarres.format': '8, 12 ou 13 chiffres',
  'liste.fiche.codeBarres.double': '« {name} » a déjà ce code-barres dans la liste.',
  'liste.fiche.codeBarres.lecture': 'Lecture du code-barres…',
  'liste.fiche.codeBarres.nonLu': 'Code non lu, réessayez plus près et bien à plat, ou saisissez-le.',
  'liste.fiche.codeBarres.illisible': 'Ce fichier n\'est pas une image lisible. Réessayez avec une photo, ou saisissez le code.',
  'liste.fiche.codeBarres.indisponible': 'La lecture des codes-barres n\'est pas disponible pour le moment (au premier scan, il faut du réseau). Vous pouvez saisir le code.',

  // Fiche : photo (une phrase par sorte de liste : courses, tâches, envies)
  'liste.photo.titre.courses': 'Photo de l\'article',
  'liste.photo.titre.taches': 'Photo de l\'élément',
  'liste.photo.titre.envies': 'Photo du souhait',
  'liste.photo.changer': 'Changer la photo',
  'liste.photo.retirer': 'Retirer la photo',
  'liste.photo.ajouter': 'Ajouter une photo',
  'liste.photo.preparation': 'Préparation de la photo…',
  'liste.photo.enAttente': 'Photo en attente d\'envoi : elle partira dès que possible.',
  'liste.photo.retirer.question': 'Retirer la photo ?',
  'liste.photo.retirer.texte': 'La photo sera supprimée pour toutes les personnes de la liste.',

  // Fiche : modifiée ou supprimée par une autre personne (courses, tâches, envies)
  'liste.fiche.conflit.supprime.courses': 'Cet article a été supprimé par une autre personne.',
  'liste.fiche.conflit.supprime.taches': 'Cet élément a été supprimé par une autre personne.',
  'liste.fiche.conflit.supprime.envies': 'Ce souhait a été supprimé par une autre personne.',
  'liste.fiche.conflit.modifie.courses': 'Cet article vient d\'être modifié par une autre personne. Seuls vos changements seront enregistrés.',
  'liste.fiche.conflit.modifie.taches': 'Cet élément vient d\'être modifié par une autre personne. Seuls vos changements seront enregistrés.',
  'liste.fiche.conflit.modifie.envies': 'Ce souhait vient d\'être modifié par une autre personne. Seuls vos changements seront enregistrés.',

  // Fiche : en-tête, pied et champs (titre et suppression : courses, tâches, envies)
  'liste.fiche.supprimer.courses': 'Supprimer l\'article',
  'liste.fiche.supprimer.taches': 'Supprimer l\'élément',
  'liste.fiche.supprimer.envies': 'Supprimer le souhait',
  'liste.enregistrer': 'Enregistrer',
  // Touche du clavier écrite sur le bouton « Enregistrer » (ordinateur)
  'liste.fiche.touche.ctrl': 'Ctrl',
  'liste.fiche.nonEnregistre': 'Modifications non enregistrées',
  'liste.fiche.quantite': 'Quantité',
  'liste.fiche.quantite.exemple': 'par exemple 2 ou 500 g',
  'liste.fiche.note': 'Note (facultative)',
  'liste.fiche.photo': 'Photo (facultative)',
  'liste.fiche.titre.courses': 'Modifier l\'article',
  'liste.fiche.titre.taches': 'Modifier l\'élément',
  'liste.fiche.titre.envies': 'Modifier le souhait',
  'liste.fiche.abandonner.question': 'Abandonner les modifications ?',
  'liste.fiche.abandonner.texte': 'Ce que vous avez changé dans cette fiche ne sera pas enregistré.',
  'liste.fiche.abandonner': 'Abandonner',
  'liste.fiche.continuer': 'Continuer',

  // Fiche : erreurs à l'enregistrement
  'liste.fiche.erreur.nom': 'Le nom est obligatoire',
  'liste.fiche.erreur.codeBarres': 'Code invalide : vérifiez les chiffres',
  'liste.fiche.erreur.lien': 'Adresse web invalide (http ou https)',
  'liste.fiche.erreur.prix': 'Prix invalide (par exemple 24,90)',
  'liste.fiche.erreur.deuxPersonnes': 'Choisissez au moins deux personnes.',
  'liste.fiche.erreur.sousTacheRepete': 'Une sous-tâche ne se répète pas : retirez d\'abord la répétition.',

  // Fiche à consulter (lecture seule) ; avertissement et titre : courses, tâches, envies
  'liste.detail.lectureSeule.courses': 'Liste en lecture seule : cet article ne peut pas être modifié.',
  'liste.detail.lectureSeule.taches': 'Liste en lecture seule : cet élément ne peut pas être modifié.',
  'liste.detail.lectureSeule.envies': 'Liste en lecture seule : ce souhait ne peut pas être modifié.',
  'liste.detail.prix': 'Prix indicatif',
  'liste.detail.note': 'Note',
  'liste.detail.echeance.heure': '{date} à {time}',
  'liste.detail.photo': 'Photo',
  'liste.detail.titre.courses': 'Détail de l\'article',
  'liste.detail.titre.taches': 'Détail de l\'élément',
  'liste.detail.titre.envies': 'Détail du souhait',

  // Choix du rayon ou du magasin
  'liste.choix.nouveauRayon': 'Nouveau rayon…',

  // « Ranger les articles » : après un changement de magasin, les articles qui ont perdu leur rayon
  'liste.ranger.titre': 'Ranger les articles',
  'liste.ranger.texte.magasin': {
    one: 'Cet article est passé « Sans rayon » : son rayon n\'existe pas chez {store}. Choisissez-en un maintenant, ou plus tard depuis sa fiche.',
    other: 'Ces {count} articles sont passés « Sans rayon » : leur rayon n\'existe pas chez {store}. Choisissez les nouveaux maintenant, ou plus tard depuis leur fiche.',
  },
  'liste.ranger.texte.sansMagasin': {
    one: 'Cet article est passé « Sans rayon » : son rayon appartenait à l\'ancien magasin. Choisissez-en un maintenant, ou plus tard depuis sa fiche.',
    other: 'Ces {count} articles sont passés « Sans rayon » : leur rayon appartenait à l\'ancien magasin. Choisissez les nouveaux maintenant, ou plus tard depuis leur fiche.',
  },
  'liste.ranger.rayonDe': 'Rayon de « {name} »',
  'liste.ranger.termine': 'Terminé',
  'liste.choix.nouveauMagasin': 'Nouveau magasin…',

  // Droit changé pendant que la liste est ouverte
  'liste.droit.modification': 'Vous pouvez maintenant modifier cette liste.',
  'liste.droit.lectureSeule': 'Cette liste est maintenant en lecture seule.',
};
