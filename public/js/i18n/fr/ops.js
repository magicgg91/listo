// Textes de server/lists.js et server/routes/lists.js (opérations sur les listes, réponses du serveur), en français.
// Chaque nom commence par « ops. ».

export default {
  // Liste ou élément introuvable, droits
  'ops.listeIntrouvable': 'Liste introuvable.',
  'ops.introuvable': 'Introuvable, peut-être supprimé entre-temps.',
  'ops.proprietaireSeulement': 'Seul le propriétaire de la liste peut faire cela.',
  'ops.lectureSeule': 'Vous avez un accès en lecture seule à cette liste.',
  'ops.proprietaireNePeutPasQuitter': 'Le propriétaire ne peut pas quitter sa liste. Supprimez-la à la place.',

  // « Vider la corbeille » : demande mal formée
  'ops.corbeilleInvalide': 'Liste des listes à effacer invalide.',

  // Priorité, échéance, rayon (règles des options de la liste)
  'ops.prioriteDesactivee': 'La priorité est désactivée pour cette liste.',
  'ops.echeanceDesactivee': "L'échéance est désactivée pour cette liste.",
  'ops.multiSansRayon': "Pas de rayon dans une liste « multi » : choisissez le magasin de l'article.",
  'ops.prioritePasIci': 'La priorité ne se choisit que dans une liste de tâches ou d\'envies.',
  'ops.echeancePasIci': 'L\'échéance ne se choisit que dans une liste de tâches.',
  'ops.prioriteInconnue': 'Priorité inconnue (basse, normale ou élevée).',
  'ops.echeanceInvalide': 'Échéance invalide (une date AAAA-MM-JJ entre 2000 et 2100, sans heure).',

  // Tâches qui se répètent
  'ops.repetitionPasIci': 'La répétition ne se choisit que dans une liste de tâches.',
  'ops.repetitionDesactivee': "La répétition demande l'échéance, désactivée pour cette liste.",
  'ops.repetitionInvalide': 'Répétition invalide.',
  'ops.repetitionSansEcheance': "Une tâche qui se répète a besoin d'une échéance.",
  'ops.dateSuivanteInvalide': 'Date suivante invalide.',

  // Heure d'échéance et rappel
  'ops.heureInvalide': 'Heure invalide (HH:MM, par exemple 09:30).',
  'ops.rappelInvalide': 'Rappel invalide.',
  'ops.heureSansDate': "Une heure demande une date d'échéance.",
  'ops.rappelSansHeure': 'Un rappel demande une heure.',

  // Attribution d'une tâche
  'ops.attributionPasIci': "L'attribution ne se choisit que dans une liste de tâches.",
  'ops.attributionDesactivee': "L'attribution est désactivée pour cette liste.",
  'ops.personneNonAttribuable': 'Cette personne ne peut pas recevoir de tâche dans cette liste (le propriétaire ou une personne qui peut la modifier).',
  'ops.facondAttribuerInconnue': 'Façon d\'attribuer inconnue (une personne, plusieurs, ou chacun son tour).',
  'ops.personnesInvalides': 'Choisissez au moins deux personnes (vingt au plus), sans doublon, parmi celles qui peuvent modifier la liste.',
  'ops.tourSansRepetition': '« Chacun son tour » demande une tâche qui se répète.',

  // Champs envoyés par le téléphone
  'ops.identifiantListeInvalide': 'Identifiant de liste invalide.',
  'ops.identifiantInvalide': 'Identifiant invalide.',
  'ops.nomListeInvalide': 'Nom de liste invalide (1 à 100 caractères).',
  'ops.nomInvalide': 'Nom invalide (1 à 100 caractères).',
  'ops.quantiteInvalide': 'Quantité invalide.',
  'ops.quantiteTropLongue': 'Quantité trop longue ({max} caractères au plus).',
  'ops.noteInvalide': 'Note invalide.',
  'ops.noteTropLongue': 'Note trop longue ({max} caractères au plus).',
  'ops.reglageApresAjoutInvalide': 'Réglage « Après l\'ajout » invalide.',
  'ops.lienInvalide': 'Lien invalide : une adresse web en http ou https, 500 caractères au plus.',
  'ops.prixInvalide': 'Prix invalide (de 0 à 100 000).',
  'ops.prenomInvalide': 'Prénom invalide (1 à {max} caractères).',
  'ops.iconeInconnue': 'Icône inconnue.',
  'ops.lienPrixPasIci': 'Le lien et le prix ne se choisissent que dans une liste d\'envies.',
  'ops.quantitePasIci': 'Pas de quantité dans une liste d\'envies.',

  // Type, magasin, rayon, code-barres
  'ops.typeInconnu': 'Type de liste inconnu.',
  'ops.magasinInconnu': 'Magasin inconnu ou désactivé.',
  'ops.rayonInconnu': 'Rayon inconnu ou désactivé.',
  'ops.magasinNonPropose': "Ce magasin n'est pas proposé pour cette liste (inconnu, désactivé ou non regroupé).",
  'ops.codeBarresInvalide': 'Code-barres invalide : vérifiez les chiffres (8, 12 ou 13 chiffres).',
  'ops.codeBarresPasIci': 'Le code-barres ne se choisit que dans une liste de courses.',
  'ops.recuInterdit': 'Seul le bénéficiaire ou le propriétaire de la liste marque un souhait comme reçu.',
  'ops.magasinMultiSeulement': 'Le magasin ne se choisit que dans une liste « multi ».',

  // Réglages de la liste et du compte (vrai ou faux)
  'ops.reglagePrioriteInvalide': 'Réglage « Priorité » invalide.',
  'ops.reglageEcheanceInvalide': 'Réglage « Échéance » invalide.',
  'ops.reglageAttributionInvalide': 'Réglage « Attribution » invalide.',
  'ops.reglageSousTachesInvalide': 'Réglage « Sous-tâches » invalide.',
  'ops.reglageSourdineInvalide': 'Réglage « Masquer les nouveautés de cette liste » invalide.',
  'ops.reglageNouveautesInvalide': 'Réglage « Nouveautés » invalide.',
  'ops.reglageSignalerCochesInvalide': 'Réglage « Signaler les éléments cochés » invalide.',
  'ops.reglageCopierInvalide': 'Réglage « Copier les éléments » invalide.',

  // Réglage « Accueil » (Réglages › Accueil, public/js/home-tiles.js)
  'ops.accueilReglageInvalide': 'Réglage « Afficher l\'Accueil » invalide.',
  'ops.accueilPremierEcranInvalide': 'Premier écran inconnu : Échéances, Listes ou Notes.',
  'ops.accueilTuilesInvalides': 'Tuiles de l\'Accueil invalides : chaque tuile connue, une seule fois.',
  'ops.accueilCompteToujours': 'La tuile Compte est toujours affichée.',
  'ops.fonctionInconnue': 'Fonction inconnue : seulement les notes et les projets.',
  'ops.fonctionsInvalides': 'Réglage des fonctions invalide : oui ou non pour chaque fonction.',

  // Créer, modifier une liste
  'ops.listeExisteDeja': 'Cette liste existe déjà.',
  'ops.magasinCoursesSeulement': 'Un magasin ne se choisit que pour une liste de courses.',
  'ops.pourQuiPasIci': '« Pour qui ? » ne se choisit que pour une liste d\'envies.',
  'ops.utilisateurInconnu': 'Utilisateur inconnu ou désactivé.',
  'ops.compteOuPersonne': 'Choisissez un compte ou une personne sans compte, pas les deux.',
  'ops.destinataireFixe': 'La personne à qui la liste est destinée ne change pas.',
  'ops.rienAModifier': 'Rien à modifier.',
  'ops.souventAjoutesPasIci': '« Souvent ajoutés » n\'existe que dans les listes de courses.',

  // Éléments
  'ops.identifiantDejaUtilise': 'Cet identifiant est déjà utilisé.',
  'ops.valeurCocheeInvalide': 'Valeur « checked » invalide (true ou false).',
  'ops.valeurAcheteInvalide': 'Valeur « bought » invalide (true ou false).',
  'ops.repereLectureInvalide': 'Repère de lecture invalide.',

  // Lot d'opérations
  'ops.identifiantOperationInvalide': "Identifiant d'opération invalide.",
  'ops.identifiantOperationDejaUtilise': "Identifiant d'opération déjà utilisé.",
  'ops.operationInconnue': "Type d'opération inconnu.",
  'ops.lotInvalide': "Lot d'opérations invalide (1 à {max} opérations).",

  // Partage
  'ops.listePersonnesInvalide': 'Liste des personnes invalide.',
  'ops.droitsPersonnesInvalides': 'Droits des personnes invalides.',
  'ops.proprietaireTousDroits': 'Le propriétaire a tous les droits sur sa liste.',
  'ops.droitSansPartage': 'Droit donné à une personne avec qui la liste n\'est pas partagée.',
  'ops.destinataireNonRetirable': 'La personne à qui la liste est destinée ne peut pas en être retirée.',
  'ops.destinataireGardeModifier': 'La personne à qui la liste est destinée garde le droit « Peut modifier ».',

  // Convertir en liste d'envies
  'ops.dejaEnvies': 'Cette liste est déjà une liste d\'envies.',
  'ops.demandeInvalide': 'Demande invalide.',
  'ops.pourSoiChoisirMoi': 'Pour vous-même, choisissez « Moi ».',

  // Dupliquer une liste
  'ops.enviesNonDupliquees': 'Une liste d\'envies ne se duplique pas.',
  'ops.tropDeDuplications': 'Trop de duplications pour le moment. Réessayez dans un moment.',

  // Notes (server/notes.js)
  'ops.noteIntrouvable': 'Note introuvable.',
  'ops.noteExisteDeja': 'Cette note existe déjà.',
  'ops.noteProprietaireSeulement': 'Seul le propriétaire de la note peut faire cela.',
  'ops.noteLectureSeule': 'Vous avez un accès en lecture seule à cette note.',
  'ops.noteConflit': 'Cette note a été modifiée entre-temps : rien n\'a été écrasé.',
  'ops.versionNoteInvalide': 'Version de la note invalide.',
  'ops.titreNoteInvalide': 'Titre de note invalide.',
  'ops.titreNoteTropLong': 'Titre trop long ({max} caractères au plus).',
  'ops.texteNoteInvalide': 'Texte de note invalide.',
  'ops.texteNoteTropLong': 'Texte trop long ({max} caractères au plus).',
  'ops.epingleInvalide': 'Réglage « Épingler » invalide.',
  'ops.notesLimite': 'Vous avez déjà {max} notes, corbeille comprise : supprimez-en avant d\'en créer une autre.',
  'ops.notesInvalides': 'Liste des notes invalide.',
  'ops.notesTropVite': 'Trop d\'enregistrements de notes pour le moment. Ils repartiront dans un moment.',
  // Étiquettes des notes (server/labels.js, 24 novembre 2026)
  'ops.etiquetteIntrouvable': 'Étiquette introuvable.',
  'ops.nomEtiquetteInvalide': 'Nom d\'étiquette invalide : de 1 à 30 caractères, sans caractère spécial invisible.',
  'ops.couleurEtiquetteInvalide': 'Couleur d\'étiquette invalide.',
  'ops.etiquettesLimite': 'Il y a déjà {max} étiquettes : demandez à l\'Admin d\'en supprimer avant d\'en créer une autre.',
  'ops.tropDEtiquettes': 'Trop d\'étiquettes créées pour le moment. Réessayez dans une heure.',
  'ops.etiquetteExisteDeja': 'L\'étiquette « {name} » existe déjà (majuscules et accents ne comptent pas).',
  'ops.etiquettesNoteInvalides': 'Étiquettes de la note invalides ({max} au plus).',
  // Partage des notes (étape 3)
  'ops.proprietaireNePeutPasQuitterNote': 'Le propriétaire ne peut pas quitter sa note. Supprimez-la à la place.',
  'ops.proprietaireTousDroitsNote': 'Le propriétaire a tous les droits sur sa note.',
  'ops.droitSansPartageNote': 'Droit donné à une personne avec qui la note n\'est pas partagée.',
  'ops.repereLectureNoteInvalide': 'Repère de lecture de la note invalide.',
  'ops.reglageSourdineNoteInvalide': 'Réglage « Masquer les nouveautés de cette note » invalide.',

  // Projets (server/projects.js, 25 novembre 2026)
  'ops.projetIntrouvable': 'Projet introuvable.',
  'ops.carteIntrouvable': 'Carte introuvable, peut-être supprimée entre-temps.',
  'ops.colonneIntrouvable': 'Colonne introuvable.',
  'ops.etiquetteProjetIntrouvable': 'Étiquette du projet introuvable.',
  'ops.projetLectureSeule': 'Vous avez un accès en lecture seule à ce projet.',
  'ops.projetProprietaireSeulement': 'Seul le propriétaire du projet peut faire cela.',
  'ops.projetModifierSeulement': 'Seuls le propriétaire et les personnes qui peuvent modifier le projet gèrent ses colonnes et ses étiquettes.',
  'ops.carteModifierSiennes': 'Vous ne pouvez modifier que les cartes que vous avez créées ou qui vous sont attribuées.',
  'ops.carteSupprimerSiennes': 'Vous ne pouvez supprimer que les cartes que vous avez créées.',
  'ops.carteRestaurerSiennes': 'Vous ne pouvez restaurer que les cartes que vous avez créées.',
  'ops.carteAttribuerSiennes': 'Sur une carte que vous n\'avez pas créée, vous pouvez seulement vous retirer des personnes.',
  'ops.projetsCoupes': 'Les projets sont coupés pour votre compte (Réglages › Fonctions).',
  'ops.projetExisteDeja': 'Ce projet existe déjà.',
  'ops.projetsLimite': 'Vous avez déjà {max} projets, corbeille comprise : supprimez-en avant d\'en créer un autre.',
  'ops.projetsTropVite': 'Trop de projets créés ou dupliqués pour le moment. Réessayez dans une heure.',
  'ops.projetsInvalides': 'Liste des projets invalide.',
  'ops.nomProjetInvalide': 'Nom du projet invalide : de 1 à {max} caractères, sans caractère spécial invisible.',
  'ops.prioriteProjetInvalide': 'Réglage « Priorité » du projet invalide.',
  'ops.echeancesProjetInvalide': 'Réglage « Échéances » du projet invalide.',
  'ops.reglageProjetInvalide': 'Réglage du projet invalide.',
  'ops.repereLectureProjetInvalide': 'Repère de lecture du projet invalide.',
  'ops.proprietaireNePeutPasQuitterProjet': 'Le propriétaire ne peut pas quitter son projet. Supprimez-le à la place.',
  'ops.proprietaireTousDroitsProjet': 'Le propriétaire a tous les droits sur son projet.',
  'ops.droitSansPartageProjet': 'Droit donné à une personne avec qui le projet n\'est pas partagé.',
  'ops.couleurInvalide': 'Couleur inconnue.',
  'ops.nomColonneInvalide': 'Nom de colonne invalide : de 1 à {max} caractères, sans caractère spécial invisible.',
  'ops.nomColonneExiste': 'Une colonne porte déjà ce nom dans ce projet (majuscules et accents ne comptent pas).',
  'ops.colonnesInvalides': 'Colonnes invalides (de 1 à {max}).',
  'ops.colonneExisteDeja': 'Cette colonne existe déjà.',
  'ops.colonnesLimite': 'Ce projet a déjà {max} colonnes.',
  'ops.derniereColonne': 'Un projet garde toujours au moins une colonne.',
  'ops.colonneNonVide': { one: 'Cette colonne a 1 carte : choisissez où la déplacer, ou supprimez-la avec la colonne.', other: 'Cette colonne a {count} cartes : choisissez où les déplacer, ou supprimez-les avec la colonne.' },
  'ops.colonneDestinationInvalide': 'Colonne de destination invalide.',
  'ops.placeInvalide': 'Place invalide.',
  'ops.nomEtiquetteProjetInvalide': 'Nom d\'étiquette invalide : de 1 à {max} caractères, sans caractère spécial invisible.',
  'ops.etiquetteProjetExiste': 'Une étiquette porte déjà ce nom dans ce projet (majuscules et accents ne comptent pas).',
  'ops.etiquetteProjetExisteDeja': 'Cette étiquette existe déjà.',
  'ops.etiquettesProjetLimite': 'Ce projet a déjà {max} étiquettes.',
  'ops.carteExisteDeja': 'Cette carte existe déjà.',
  'ops.cartesLimite': 'Ce projet a déjà {max} cartes, cartes supprimées comprises.',
  'ops.cartesInvalides': 'Liste des cartes invalide.',
  'ops.titreCarteInvalide': 'Titre de carte invalide : de 1 à {max} caractères, sans caractère spécial invisible.',
  'ops.etiquettesCarteInvalides': 'Étiquettes de la carte invalides ({max} au plus).',
  'ops.personnesCarteInvalides': 'Personnes de la carte invalides ({max} au plus).',
  'ops.personneNonAttribuableProjet': 'Seuls les membres du projet qui ne sont pas en lecture seule peuvent être attribués à une carte.',
  'ops.carteConflit': 'La description de cette carte a changé entre-temps : votre texte est gardé sur ce téléphone, à vérifier.',
  'ops.versionCarteInvalide': 'Version de la description invalide.',
  'ops.descriptionInvalide': 'Description invalide : {max} caractères au plus.',
  'ops.caseInvalide': 'Case de la description invalide.',
  'ops.caseIntrouvable': 'Cette case n\'est plus dans la description (elle a été modifiée entre-temps).',
  'ops.echeanceCarteInvalide': 'Échéance invalide : une date (de 2000 à 2100), une heure facultative et un rappel seulement avec une heure.',
  'ops.prioriteCarteInvalide': 'Priorité invalide.',
  'ops.prioriteProjetCoupee': 'L\'option « Priorité » de ce projet est coupée.',
  'ops.echeancesProjetCoupees': 'L\'option « Échéances » de ce projet est coupée : allumez-la dans les réglages du projet.',
  'ops.echeancesProjetModifierSeulement': 'Seuls le propriétaire et les personnes qui peuvent modifier le projet changent son option « Échéances ».',
  'ops.faitInvalide': 'Case « Fait » invalide.',
  'ops.carteSansEcheance': 'Cette carte n\'a pas d\'échéance : ajoutez-en une avant de la marquer faite.',
  'ops.lienIntrouvable': 'Lien introuvable, peut-être retiré entre-temps.',
  'ops.lienExisteDeja': 'Ce lien existe déjà.',
  'ops.liensLimite': 'Cette carte a déjà {max} liens.',
  'ops.adresseLienInvalide': 'Adresse invalide : seulement une adresse web qui commence par http:// ou https:// (500 caractères au plus).',
  'ops.titreLienInvalide': 'Titre du lien invalide : 100 caractères au plus, sans caractère spécial invisible.',
  'ops.cartesTropVite': 'Trop d\'enregistrements de cartes pour le moment. Réessayez dans un moment.',
  // Commentaires et cartes suivies (étape 3)
  'ops.commentaireIntrouvable': 'Commentaire introuvable, peut-être supprimé entre-temps.',
  'ops.commentaireSiensSeulement': 'Vous ne pouvez modifier ou supprimer que vos propres commentaires.',
  'ops.commentaireExisteDeja': 'Ce commentaire existe déjà.',
  'ops.commentaireInvalide': 'Un commentaire compte de 1 à {max} caractères, en texte simple.',
  'ops.commentaireImporteInvalide': 'Commentaire importé invalide : auteur d\'origine de 1 à 60 caractères, en texte simple, et date passée ; seulement par un assistant IA.',
  'ops.commentairesLimite': 'Une carte compte {max} commentaires au plus.',
  'ops.commentairesTropVite': 'Trop de commentaires pour le moment. Réessayez dans un moment.',
  'ops.suivreInvalide': 'Valeur « following » invalide (true ou false).',

  // Page Notifications (server/inbox.js)
  'ops.inboxInvalide': 'Choix des notifications invalide.',
  'ops.inboxIntrouvable': 'Notification introuvable.',

  // Synchronisation
  'ops.parametreSinceInvalide': 'Paramètre « since » invalide.',
};
