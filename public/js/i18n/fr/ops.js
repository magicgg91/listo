// Textes de server/lists.js et server/routes/lists.js (opérations sur les listes, réponses du serveur), en français.
// Chaque nom commence par « ops. ».

export default {
  // Liste ou élément introuvable, droits
  'ops.listeIntrouvable': 'Liste introuvable.',
  'ops.introuvable': 'Introuvable, peut-être supprimé entre-temps.',
  'ops.proprietaireSeulement': 'Seul le propriétaire de la liste peut faire cela.',
  'ops.lectureSeule': 'Vous avez un accès en lecture seule à cette liste.',
  'ops.proprietaireNePeutPasQuitter': 'Le propriétaire ne peut pas quitter sa liste. Supprimez-la à la place.',

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

  // Synchronisation
  'ops.parametreSinceInvalide': 'Paramètre « since » invalide.',
};
