// Textes de public/js/api.js, public/js/queue.js et public/js/localdb.js, en français.
// Chaque nom commence par « reseau. ».

export default {
  // Serveur injoignable (api.js)
  'reseau.injoignable': 'Impossible de joindre Listo. Vérifiez la connexion et réessayez.',

  // Messages par défaut quand le serveur n'en donne pas (api.js)
  'reseau.photoTropLourde': 'Photo trop lourde.',
  'reseau.tropDeTentatives': 'Trop de tentatives. Réessayez dans 15 minutes.',
  'reseau.probleme': 'Listo a rencontré un problème. Réessayez dans un instant.',
  'reseau.refusee': 'La demande a été refusée.',
  'reseau.inattendue': 'Une erreur inattendue est survenue. Réessayez.',

  // File d'attente : refus sans message du serveur (queue.js)
  'reseau.modificationRefusee': 'modification refusée',
};
