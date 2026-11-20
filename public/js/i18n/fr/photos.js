// Textes de server/photos.js et server/routes/photos.js (réponses du serveur), en français.
// Chaque nom commence par « photos. ».

export default {
  // Contrôle du fichier envoyé (photos.js)
  'photos.pasJpeg': 'Ce fichier n\'est pas une photo JPEG.',
  'photos.abimee': 'Photo JPEG incomplète ou abîmée.',
  'photos.donneesApresFin': 'Données inattendues après la fin de la photo.',
  // {max} : nombre de pixels de côté
  'photos.tropGrande': 'Photo trop grande ({max} pixels de côté au plus).',
  'photos.introuvable': 'Photo introuvable.',

  // Routes de la photo d'un article (routes/photos.js) ; sans « article »
  // (voir lists.js)
  'photos.elementIntrouvable': 'Introuvable, peut-être supprimé entre-temps.',
  'photos.tropDEnvois': 'Trop de photos envoyées. Réessayez dans une heure.',
};
