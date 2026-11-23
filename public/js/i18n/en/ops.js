// Textes de server/lists.js et server/routes/lists.js (opérations sur les listes, réponses du serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/ops.js.

export default {
  // Liste ou élément introuvable, droits
  'ops.listeIntrouvable': 'List not found.',
  'ops.introuvable': 'Not found: it may have been deleted in the meantime.',
  'ops.proprietaireSeulement': 'Only the list owner can do this.',
  'ops.lectureSeule': 'You have read-only access to this list.',
  'ops.proprietaireNePeutPasQuitter': "The owner can't leave their own list. Delete it instead.",

  // Priorité, échéance, rayon (règles des options de la liste)
  'ops.prioriteDesactivee': 'Priority is turned off for this list.',
  'ops.echeanceDesactivee': 'Due dates are turned off for this list.',
  'ops.multiSansRayon': "No aisles in a “Multi” list: choose the item's store.",
  'ops.prioritePasIci': 'Priority can only be set in a task or wish list.',
  'ops.echeancePasIci': 'A due date can only be set in a task list.',
  'ops.prioriteInconnue': 'Unknown priority (low, normal or high).',
  'ops.echeanceInvalide': 'Invalid due date (a YYYY-MM-DD date between 2000 and 2100, without a time).',

  // Tâches qui se répètent
  'ops.repetitionPasIci': 'A repeat can only be set in a task list.',
  'ops.repetitionDesactivee': 'A repeat needs a due date, which is turned off for this list.',
  'ops.repetitionInvalide': 'Invalid repeat.',
  'ops.repetitionSansEcheance': 'A repeating task needs a due date.',
  'ops.dateSuivanteInvalide': 'Invalid next date.',

  // Heure d'échéance et rappel
  'ops.heureInvalide': 'Invalid time (HH:MM, for example 09:30).',
  'ops.rappelInvalide': 'Invalid reminder.',
  'ops.heureSansDate': 'A time needs a due date.',
  'ops.rappelSansHeure': 'A reminder needs a time.',

  // Attribution d'une tâche
  'ops.attributionPasIci': 'Assignment can only be set in a task list.',
  'ops.attributionDesactivee': 'Assignment is turned off for this list.',
  'ops.personneNonAttribuable': "This person can't be assigned a task in this list (it must be the owner or someone who can edit it).",
  'ops.facondAttribuerInconnue': 'Unknown way to assign (one person, several or take turns).',
  'ops.personnesInvalides': 'Choose at least two people (twenty at most), with no duplicates, among those who can edit the list.',
  'ops.tourSansRepetition': '“Take turns” needs a repeating task.',

  // Champs envoyés par le téléphone
  'ops.identifiantListeInvalide': 'Invalid list ID.',
  'ops.identifiantInvalide': 'Invalid ID.',
  'ops.nomListeInvalide': 'Invalid list name (1 to 100 characters).',
  'ops.nomInvalide': 'Invalid name (1 to 100 characters).',
  'ops.quantiteInvalide': 'Invalid quantity.',
  'ops.quantiteTropLongue': 'Quantity too long ({max} characters max).',
  'ops.noteInvalide': 'Invalid note.',
  'ops.noteTropLongue': 'Note too long ({max} characters max).',
  'ops.reglageApresAjoutInvalide': 'Invalid “After adding” setting.',
  'ops.lienInvalide': 'Invalid link: a web address starting with http or https, 500 characters max.',
  'ops.prixInvalide': 'Invalid price (from 0 to 100,000).',
  'ops.prenomInvalide': 'Invalid first name (1 to {max} characters).',
  'ops.iconeInconnue': 'Unknown icon.',
  'ops.lienPrixPasIci': 'A link and a price can only be set in a wish list.',
  'ops.quantitePasIci': 'No quantity in a wish list.',

  // Type, magasin, rayon, code-barres
  'ops.typeInconnu': 'Unknown list type.',
  'ops.magasinInconnu': 'Unknown or disabled store.',
  'ops.rayonInconnu': 'Unknown or disabled aisle.',
  'ops.magasinNonPropose': "This store isn't offered for this list (unknown, disabled or not part of the group).",
  'ops.codeBarresInvalide': 'Invalid barcode: check the digits (8, 12 or 13 digits).',
  'ops.codeBarresPasIci': 'A barcode can only be set in a shopping list.',
  'ops.recuInterdit': 'Only the recipient or the list owner can mark a wish as received.',
  'ops.magasinMultiSeulement': 'A store can only be chosen in a “Multi” list.',

  // Réglages de la liste et du compte (vrai ou faux)
  'ops.reglagePrioriteInvalide': 'Invalid “Priority” setting.',
  'ops.reglageEcheanceInvalide': 'Invalid “Due date” setting.',
  'ops.reglageAttributionInvalide': 'Invalid “Assignment” setting.',
  'ops.reglageSousTachesInvalide': 'Invalid “Subtasks” setting.',
  'ops.reglageSourdineInvalide': "Invalid “Hide what's new in this list” setting.",
  'ops.reglageNouveautesInvalide': "Invalid “What's new” setting.",
  'ops.reglageSignalerCochesInvalide': 'Invalid “Include checked items” setting.',
  'ops.reglageCopierInvalide': 'Invalid “Copy items” setting.',

  // Créer, modifier une liste
  'ops.listeExisteDeja': 'This list already exists.',
  'ops.magasinCoursesSeulement': 'A store can only be chosen for a shopping list.',
  'ops.pourQuiPasIci': '“Who is it for?” can only be set for a wish list.',
  'ops.utilisateurInconnu': 'Unknown or disabled user.',
  'ops.compteOuPersonne': 'Choose an account or a person without an account, not both.',
  'ops.destinataireFixe': "The person the list is for can't be changed.",
  'ops.rienAModifier': 'Nothing to change.',
  'ops.souventAjoutesPasIci': '“Often added” only exists in shopping lists.',

  // Éléments
  'ops.identifiantDejaUtilise': 'This ID is already in use.',
  'ops.valeurCocheeInvalide': 'Invalid “checked” value (true or false).',
  'ops.repereLectureInvalide': 'Invalid read marker.',

  // Lot d'opérations
  'ops.identifiantOperationInvalide': 'Invalid operation ID.',
  'ops.identifiantOperationDejaUtilise': 'Operation ID already used.',
  'ops.operationInconnue': 'Unknown operation type.',
  'ops.lotInvalide': 'Invalid batch of operations (1 to {max} operations).',

  // Partage
  'ops.listePersonnesInvalide': 'Invalid list of people.',
  'ops.droitsPersonnesInvalides': 'Invalid access rights for people.',
  'ops.proprietaireTousDroits': 'The owner has full rights to their list.',
  'ops.droitSansPartage': "Access given to someone the list isn't shared with.",
  'ops.destinataireNonRetirable': "The person the list is for can't be removed from it.",
  'ops.destinataireGardeModifier': 'The person the list is for keeps “Can edit” access.',

  // Convertir en liste d'envies
  'ops.dejaEnvies': 'This list is already a wish list.',
  'ops.demandeInvalide': 'Invalid request.',
  'ops.pourSoiChoisirMoi': 'For yourself, choose “Me”.',

  // Dupliquer une liste
  'ops.enviesNonDupliquees': "A wish list can't be duplicated.",
  'ops.tropDeDuplications': 'Too many duplicates right now. Try again in a little while.',

  // Notes (server/notes.js)
  'ops.noteIntrouvable': 'Note not found.',
  'ops.noteExisteDeja': 'This note already exists.',
  'ops.noteProprietaireSeulement': 'Only the owner of the note can do that.',
  'ops.noteLectureSeule': 'You have read-only access to this note.',
  'ops.noteConflit': 'This note was changed in the meantime: nothing was overwritten.',
  'ops.versionNoteInvalide': 'Invalid note version.',
  'ops.titreNoteInvalide': 'Invalid note title.',
  'ops.titreNoteTropLong': 'Title too long ({max} characters at most).',
  'ops.texteNoteInvalide': 'Invalid note text.',
  'ops.texteNoteTropLong': 'Text too long ({max} characters at most).',
  'ops.epingleInvalide': 'Invalid “Pin” setting.',
  'ops.notesLimite': 'You already have {max} notes, trash included: delete some before creating another.',
  'ops.notesInvalides': 'Invalid list of notes.',
  'ops.notesTropVite': 'Too many note saves right now. They will be sent again in a little while.',

  // Synchronisation
  'ops.parametreSinceInvalide': 'Invalid “since” parameter.',
};
