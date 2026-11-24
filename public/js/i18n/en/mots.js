// Textes de public/js/words.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/mots.js.

export default {
  // Le mot d'une ligne de liste de courses (mot seul : libellé, place où
  // toutes les langues l'acceptent tel quel), le titre d'un nouvel article,
  // un nombre d'articles et le compteur des lecteurs d'écran
  'mots.courses.un': 'item',
  'mots.courses.plusieurs': 'items',
  'mots.courses.nouveau': 'New item',
  'mots.courses.nombre': { one: '{count} item', other: '{count} items' },
  'mots.courses.progression': { one: '{count} item left out of {total}', other: '{count} items left out of {total}' },

  // Liste de tâches
  'mots.taches.un': 'item',
  'mots.taches.plusieurs': 'items',
  'mots.taches.nouveau': 'New item',
  'mots.taches.nombre': { one: '{count} item', other: '{count} items' },
  'mots.taches.progression': { one: '{count} item left out of {total}', other: '{count} items left out of {total}' },

  // Liste d'envies
  'mots.envies.un': 'wish',
  'mots.envies.plusieurs': 'wishes',
  'mots.envies.nouveau': 'New wish',
  'mots.envies.nombre': { one: '{count} wish', other: '{count} wishes' },
  'mots.envies.progression': { one: '{count} wish left out of {total}', other: '{count} wishes left out of {total}' },

  // Confirmation « Supprimer la liste » ({items} : « 3 articles »)
  'mots.suppression.contientPartagee': { one: 'It contains {items} and is shared with {count} person.', other: 'It contains {items} and is shared with {count} people.' },
  'mots.suppression.contient': 'It contains {items}.',
  'mots.suppression.videPartagee': { one: "It's empty and shared with {count} person.", other: "It's empty and shared with {count} people." },
  'mots.suppression.vide': "It's empty.",
  'mots.suppression.chemin.reglages': 'Settings',
  'mots.suppression.chemin.corbeille': 'Trash',
  'mots.suppression.suite': 'It will disappear for everyone. You can restore it within 30 days from {path}.',

  // Zone des cochés, en bas de la liste
  'mots.coches.envies.titre': 'Received',
  'mots.coches.envies.rouvrir': 'Reopen all',
  'mots.coches.envies.retirer': 'Remove received',
  'mots.coches.courses.titre': 'In the cart',
  'mots.coches.courses.rouvrir': 'Put all back on the list',
  'mots.coches.courses.retirer': 'Clear the cart',
  'mots.coches.taches.titre': 'Done',
  'mots.coches.taches.rouvrir': 'Reopen all',
  'mots.coches.taches.retirer': 'Remove done items',
};
