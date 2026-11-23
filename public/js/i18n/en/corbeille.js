// Textes des deux corbeilles (trash.js, note-trash.js, trash-parts.js), en anglais.
// Mêmes noms que public/js/i18n/fr/corbeille.js.

export default {
  // Commun aux deux corbeilles (même écran depuis le 23 novembre 2026)
  'corbeille.vider': 'Empty the trash',
  'corbeille.vider.question': 'Empty the trash?',
  'corbeille.vider.confirmer': 'Empty',
  'corbeille.restaurer': 'Restore',
  'corbeille.definitif': 'Delete for good',
  'corbeille.definitif.label': 'Delete “{name}” for good',
  'corbeille.definitif.question': 'Delete “{name}” for good?',
  // Ligne : date de suppression (« Nov 21 ») et jours restants
  'corbeille.ligne': { one: 'Deleted {date} · {count} day left', other: 'Deleted {date} · {count} days left' },

  // Corbeille des listes : écran
  'corbeille.titre': 'List trash',
  'corbeille.intro': 'Your deleted lists stay here for 30 days, then they\'re erased for good.',
  'corbeille.chargement': 'Loading…',
  'corbeille.nombre': { one: '{count} list', other: '{count} lists' },
  // Ligne : type · nombre d'éléments
  'corbeille.liste': '{type} · {items}',

  // Hors ligne : « Restaurer » et « Supprimer définitivement » inactifs
  'corbeille.horsLigne.restaurer': 'Restoring or deleting a list needs a connection. The buttons will come back when you\'re online.',

  // Restauration
  'corbeille.restauree': 'List “{name}” restored',
  'corbeille.ouvrir': 'Open',
  'corbeille.restaurer.label': 'Restore the list “{name}”',

  // Suppression définitive (une liste, ou toute la corbeille)
  'corbeille.definitif.texte': 'It will be erased for good, with its items and photos. There\'s no going back.',
  'corbeille.vider.texte': {
    one: 'The list in the trash will be erased for good, with its items and photos. There\'s no going back.',
    other: 'The {count} lists in the trash will be erased for good, with their items and photos. There\'s no going back.',
  },
  'corbeille.supprimee': 'List “{name}” deleted for good',
  'corbeille.videe': { one: '{count} list deleted for good', other: '{count} lists deleted for good' },

  // Corbeille vide
  'corbeille.vide.titre': 'No deleted lists.',
  'corbeille.vide.texte': 'A list you delete stays here for 30 days: you can restore it during that time.',

  // Corbeille indisponible (hors ligne)
  'corbeille.horsLigne.titre': 'Unavailable offline',
  'corbeille.horsLigne.texte': 'The trash needs a connection. It will show up as soon as you\'re back online.',
};
