// Textes de public/js/screens/trash.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/corbeille.js.

export default {
  // Hors ligne : « Restaurer » inactif
  'corbeille.horsLigne.restaurer': 'Restoring a list needs a connection. The buttons will come back when you\'re online.',
  'corbeille.chargement': 'Loading…',

  // Restauration
  'corbeille.restauree': 'List “{name}” restored',
  'corbeille.ouvrir': 'Open',
  'corbeille.restaurer.label': 'Restore the list “{name}”',
  'corbeille.restaurer': 'Restore',
  // Ligne : type · nombre d'éléments · date de suppression
  'corbeille.ligne': '{type} · {items} · deleted {date}',

  // Corbeille vide
  'corbeille.vide.titre': 'No deleted lists.',
  'corbeille.vide.texte': 'A list you delete stays here for 30 days: you can restore it during that time.',

  // Corbeille indisponible (hors ligne)
  'corbeille.horsLigne.titre': 'Unavailable offline',
  'corbeille.horsLigne.texte': 'The trash needs a connection. It will show up as soon as you\'re back online.',

  // Écran
  'corbeille.titre': 'List trash',
  'corbeille.intro': 'Your deleted lists stay here for 30 days, then they\'re erased for good. Only a list\'s owner sees it here and can restore it, with its items, sharing and settings.',
};
