// Textes de server/routes/references.js, admin-references.js, admin-names.js, products.js (réponses du serveur), en français.
// Chaque nom commence par « references. ».

export default {
  // Nouveau magasin ou rayon créé depuis une liste (routes/references.js)
  'references.magasin.existe': 'Le magasin « {name} » existe déjà : choisissez-le dans la liste.',
  'references.magasin.existe.desactive': 'Le magasin « {name} » existe déjà mais il est désactivé : demandez à l\'Admin de le réactiver.',
  'references.rayon.existe': 'Le rayon « {name} » existe déjà : choisissez-le dans la liste.',
  'references.rayon.existe.desactive': 'Le rayon « {name} » existe déjà mais il est désactivé : demandez à l\'Admin de le réactiver.',
  'references.rayon.existe.autreMagasin': 'Le magasin {store} a déjà un rayon « {name} » : choisissez un autre nom (un rayon de « Tous les magasins » ne peut pas porter le même).',
  'references.rayon.horsCourses': 'Un rayon ne se choisit que dans une liste de courses sans magasin « multi ».',
  'references.nomInvalide': 'Nom invalide (1 à 100 caractères).',
  'references.tropDeCreations': 'Trop de créations pour le moment. Réessayez dans un moment.',

  // Administration des magasins et des rayons (routes/admin-references.js)
  'references.magasin.introuvable': 'Magasin introuvable.',
  'references.magasin.doublon': 'Un magasin porte déjà ce nom.',
  'references.rayon.introuvable': 'Rayon introuvable.',
  'references.rayon.doublon': 'Un rayon porte déjà ce nom.',
  // Rayons propres à un magasin : nom unique parmi ce qu'une liste voit, magasin, déplacement
  'references.rayon.doublon.commun': 'Un rayon de « Tous les magasins » porte déjà ce nom.',
  'references.rayon.doublon.magasin': 'Le magasin {store} a déjà un rayon de ce nom.',
  'references.rayon.doublon.versCommun': 'Le magasin {store} a déjà un rayon de ce nom : un rayon de « Tous les magasins » ne peut pas porter le même.',
  'references.rayon.magasinInvalide': 'Magasin invalide : choisissez un magasin simple, ou « Tous les magasins ».',
  'references.rayon.deplacementRefuse': {
    one: 'Ce rayon sert dans {count} liste d\'un autre magasin ou sans magasin : il ne peut pas aller dans {store}. Choisissez « Tous les magasins », ou changez d\'abord le rayon de ces articles.',
    other: 'Ce rayon sert dans {count} listes d\'autres magasins ou sans magasin : il ne peut pas aller dans {store}. Choisissez « Tous les magasins », ou changez d\'abord le rayon de ces articles.',
  },
  'references.isMultiInvalide': 'Valeur « isMulti » invalide (true ou false).',
  'references.rienAModifier': 'Rien à modifier.',
  'references.magasin.typeFixe': 'Le type d\'un magasin (simple ou multi) ne change pas après sa création.',
  'references.regroupement.seulMulti': 'Seul un magasin « multi » regroupe d\'autres magasins.',
  'references.regroupement.invalide': 'Magasins regroupés invalides (magasins simples existants uniquement).',
  'references.activeInvalide': 'Valeur « active » invalide (true ou false).',
  'references.dejaUtilise': 'Cet élément est déjà utilisé : il peut être désactivé, pas supprimé.',

  // Administration, onglet « Articles » (routes/admin-names.js)
  'references.historique.introuvable': 'Cet article n\'est plus enregistré (déjà corrigé ou retiré ?).',
  'references.historique.nomInvalide': 'Nom invalide (1 à 100 caractères, sans caractère de contrôle).',
  'references.historique.rayonInconnu': 'Rayon inconnu ou désactivé.',

  // Mode scan (routes/products.js)
  'references.scan.coursesSeulement': 'Le scan existe seulement dans les listes de courses.',
  'references.scan.tropDeRecherches': 'Trop de recherches. Réessayez dans une minute.',
  'references.scan.codeInvalide': 'Code-barres invalide.',
};
