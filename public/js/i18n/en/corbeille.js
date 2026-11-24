// Textes de la Corbeille (trash-page.js, trash.js, note-trash.js, trash-parts.js), en anglais.
// Mêmes noms que public/js/i18n/fr/corbeille.js.

export default {
  // La page (une seule depuis le 24 novembre 2026) et ses deux onglets
  'corbeille.titre': 'Trash',
  'corbeille.onglets': 'Trash contents',
  'corbeille.onglet.listes': 'Lists',
  'corbeille.onglet.listes.nombre': { one: 'Lists ({count})', other: 'Lists ({count})' },
  'corbeille.onglet.listes.label': { one: 'Lists, {count} deleted list', other: 'Lists, {count} deleted lists' },
  'corbeille.onglet.notes': 'Notes',
  'corbeille.onglet.notes.nombre': { one: 'Notes ({count})', other: 'Notes ({count})' },
  'corbeille.onglet.notes.label': { one: 'Notes, {count} deleted note', other: 'Notes, {count} deleted notes' },

  // Commun aux deux onglets (même contenu depuis le 23 novembre 2026)
  'corbeille.vider': 'Empty the trash',
  'corbeille.vider.question': 'Empty the trash?',
  'corbeille.vider.confirmer': 'Empty',
  'corbeille.restaurer': 'Restore',
  'corbeille.definitif': 'Delete for good',
  'corbeille.definitif.label': 'Delete “{name}” for good',
  'corbeille.definitif.question': 'Delete “{name}” for good?',
  // Ligne : date de suppression (« Nov 21 ») et jours restants
  'corbeille.ligne': { one: 'Deleted {date} · {count} day left', other: 'Deleted {date} · {count} days left' },

  // Onglet « Listes »
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
