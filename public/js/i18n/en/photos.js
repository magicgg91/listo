// Textes de server/photos.js et server/routes/photos.js (réponses du serveur), en anglais (traduction à l'étape 4).
// Mêmes noms que public/js/i18n/fr/photos.js.

export default {
  // Contrôle du fichier envoyé (photos.js)
  'photos.pasJpeg': 'This file isn\'t a JPEG photo.',
  'photos.abimee': 'This JPEG photo is incomplete or damaged.',
  'photos.donneesApresFin': 'Unexpected data after the end of the photo.',
  // {max} : nombre de pixels de côté
  'photos.tropGrande': 'Photo is too large ({max} pixels per side at most).',
  'photos.introuvable': 'Photo not found.',

  // Routes de la photo d'un article (routes/photos.js) ; sans « article »
  // (voir lists.js)
  'photos.elementIntrouvable': 'Not found: it may have been deleted in the meantime.',
  'photos.tropDEnvois': 'Too many photos sent. Try again in an hour.',
};
