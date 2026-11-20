// Textes de public/js/api.js, public/js/queue.js et public/js/localdb.js, en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/reseau.js.

export default {
  // Serveur injoignable (api.js)
  'reseau.injoignable': 'Can\'t reach Listo. Check your connection and try again.',

  // Messages par défaut quand le serveur n'en donne pas (api.js)
  'reseau.photoTropLourde': 'Photo too large.',
  'reseau.tropDeTentatives': 'Too many attempts. Try again in 15 minutes.',
  'reseau.probleme': 'Listo ran into a problem. Try again in a moment.',
  'reseau.refusee': 'The request was refused.',
  'reseau.inattendue': 'Something unexpected went wrong. Try again.',

  // File d'attente : refus sans message du serveur (queue.js)
  'reseau.modificationRefusee': 'change refused',
};
