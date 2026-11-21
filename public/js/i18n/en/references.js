// Textes de server/routes/references.js, admin-references.js, admin-names.js, products.js (réponses du serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/references.js.

export default {
  // Nouveau magasin ou rayon créé depuis une liste (routes/references.js)
  'references.magasin.existe': 'The store “{name}” already exists: choose it from the list.',
  'references.magasin.existe.desactive': 'The store “{name}” already exists but is disabled: ask the Admin to re-enable it.',
  'references.rayon.existe': 'The aisle “{name}” already exists: choose it from the list.',
  'references.rayon.existe.desactive': 'The aisle “{name}” already exists but is disabled: ask the Admin to re-enable it.',
  'references.rayon.existe.autreMagasin': 'The store {store} already has an aisle called “{name}”: choose another name (an “All stores” aisle can\'t have the same name).',
  'references.rayon.horsCourses': 'Aisles can only be chosen in a shopping list without a “Multi” store.',
  'references.nomInvalide': 'Invalid name (1 to 100 characters).',
  'references.tropDeCreations': 'Too many new entries right now. Try again in a moment.',

  // Administration des magasins et des rayons (routes/admin-references.js)
  'references.magasin.introuvable': 'Store not found.',
  'references.magasin.doublon': 'A store with this name already exists.',
  'references.rayon.introuvable': 'Aisle not found.',
  'references.rayon.doublon': 'An aisle with this name already exists.',
  // Rayons propres à un magasin : nom unique parmi ce qu'une liste voit, magasin, déplacement
  'references.rayon.doublon.commun': 'An “All stores” aisle already has this name.',
  'references.rayon.doublon.magasin': 'The store {store} already has an aisle with this name.',
  'references.rayon.doublon.versCommun': 'The store {store} already has an aisle with this name: an “All stores” aisle can\'t have the same name.',
  'references.rayon.magasinInvalide': 'Invalid store: choose a single store, or “All stores”.',
  'references.rayon.deplacementRefuse': {
    one: 'This aisle is used in {count} list from another store or without a store: it can\'t go to {store}. Choose “All stores”, or first change the aisle of those items.',
    other: 'This aisle is used in {count} lists from other stores or without a store: it can\'t go to {store}. Choose “All stores”, or first change the aisle of those items.',
  },
  'references.isMultiInvalide': 'Invalid “isMulti” value (true or false).',
  'references.rienAModifier': 'Nothing to change.',
  'references.magasin.typeFixe': 'A store\'s type (single or Multi) can\'t change after it\'s created.',
  'references.regroupement.seulMulti': 'Only a “Multi” store can group other stores.',
  'references.regroupement.invalide': 'Invalid grouped stores (existing single stores only).',
  'references.activeInvalide': 'Invalid “active” value (true or false).',
  'references.dejaUtilise': 'This entry is already in use: it can be disabled, not deleted.',

  // Administration, onglet « Articles » (routes/admin-names.js)
  'references.historique.introuvable': 'This item isn\'t saved anymore (already fixed or removed?).',
  'references.historique.nomInvalide': 'Invalid name (1 to 100 characters, no control characters).',
  'references.historique.rayonInconnu': 'Unknown or disabled aisle.',

  // Mode scan (routes/products.js)
  'references.scan.coursesSeulement': 'Scanning only works in shopping lists.',
  'references.scan.tropDeRecherches': 'Too many searches. Try again in a minute.',
  'references.scan.codeInvalide': 'Invalid barcode.',
};
