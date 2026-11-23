// Textes de public/js/words.js, en français.
// Chaque nom commence par « mots. ».

export default {
  // Le mot d'une ligne de liste de courses (mot seul : libellé, place où
  // toutes les langues l'acceptent tel quel), le titre d'un nouvel article,
  // un nombre d'articles et le compteur des lecteurs d'écran
  'mots.courses.un': 'article',
  'mots.courses.plusieurs': 'articles',
  'mots.courses.nouveau': 'Nouvel article',
  'mots.courses.nombre': { one: '{count} article', other: '{count} articles' },
  'mots.courses.progression': { one: '{count} article restant sur {total}', other: '{count} articles restants sur {total}' },

  // Liste de tâches
  'mots.taches.un': 'élément',
  'mots.taches.plusieurs': 'éléments',
  'mots.taches.nouveau': 'Nouvel élément',
  'mots.taches.nombre': { one: '{count} élément', other: '{count} éléments' },
  'mots.taches.progression': { one: '{count} élément restant sur {total}', other: '{count} éléments restants sur {total}' },

  // Liste d'envies
  'mots.envies.un': 'souhait',
  'mots.envies.plusieurs': 'souhaits',
  'mots.envies.nouveau': 'Nouveau souhait',
  'mots.envies.nombre': { one: '{count} souhait', other: '{count} souhaits' },
  'mots.envies.progression': { one: '{count} souhait restant sur {total}', other: '{count} souhaits restants sur {total}' },

  // Confirmation « Supprimer la liste » ({items} : « 3 articles »)
  'mots.suppression.contientPartagee': { one: 'Elle contient {items} et elle est partagée avec {count} personne.', other: 'Elle contient {items} et elle est partagée avec {count} personnes.' },
  'mots.suppression.contient': 'Elle contient {items}.',
  'mots.suppression.videPartagee': { one: 'Elle est vide et elle est partagée avec {count} personne.', other: 'Elle est vide et elle est partagée avec {count} personnes.' },
  'mots.suppression.vide': 'Elle est vide.',
  'mots.suppression.chemin.reglages': 'Réglages',
  'mots.suppression.chemin.corbeille': 'Corbeille des listes',
  'mots.suppression.suite': 'Elle disparaît pour tout le monde. Vous pourrez la restaurer pendant 30 jours depuis {path}.',

  // Zone des cochés, en bas de la liste
  'mots.coches.envies.titre': 'Reçus',
  'mots.coches.envies.rouvrir': 'Tout rouvrir',
  'mots.coches.envies.retirer': 'Retirer les reçus',
  'mots.coches.courses.titre': 'Dans le panier',
  'mots.coches.courses.rouvrir': 'Tout remettre à acheter',
  'mots.coches.courses.retirer': 'Retirer du panier',
  'mots.coches.taches.titre': 'Terminés',
  'mots.coches.taches.rouvrir': 'Tout rouvrir',
  'mots.coches.taches.retirer': 'Retirer les terminés',
};
