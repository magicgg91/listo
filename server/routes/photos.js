// Photo d'un article (compte connecté, membre de la liste de l'article) :
//   PUT    /api/items/:id/photo   envoyer ou remplacer la photo (corps : le
//                                 fichier JPEG brut, 2 Mo au plus)
//   GET    /api/items/:id/photo   lire la photo
//   DELETE /api/items/:id/photo   retirer la photo
//
// Quelqu'un qui n'est pas membre de la liste reçoit la même réponse que pour
// un article qui n'existe pas (404). Envoyer ou retirer une photo est une
// écriture : refusée (403) à un membre en lecture seule (canEdit de lists.js) ;
// la lire reste permis. Le fichier est contrôlé et nettoyé par
// photos.js avant d'être écrit dans data/photos/<id de l'article>.jpg.

import express from 'express';
import { cleanJpeg, sendPhoto, MAX_PHOTO_BYTES } from '../photos.js';
import { canEdit, READ_ONLY } from '../lists.js';

const ITEM_NOT_FOUND = 'Introuvable, peut-être supprimé entre-temps.'; // sans « article » (voir lists.js)

export function photoRoutes(ctx) {
  const router = express.Router();
  const { photos, uploads } = ctx;
  const service = ctx.lists; // créé par les routes des listes

  // Trouve l'article et vérifie que le compte est membre de sa liste
  const findItem = (req, res, next) => {
    const item = service.photoItem(req.user, req.params.id);
    if (!item) return res.status(404).json({ error: ITEM_NOT_FOUND });
    req.item = item;
    next();
  };

  // Envoyer ou retirer : droit de modification sur la liste (après findItem)
  const mayEdit = (req, res, next) => {
    if (!canEdit(req.user, req.item)) return res.status(403).json({ error: READ_ONLY });
    next();
  };

  // Plafond d'envois par compte et par heure (compté avant de lire le fichier)
  const uploadQuota = (req, res, next) => {
    if (!uploads.take(req.user.id)) {
      ctx.audit('photo_plafond_atteint', { utilisateur: req.user.username, ip: req.ip });
      return res.status(429).json({ error: "Trop de photos envoyées. Réessayez dans une heure." });
    }
    next();
  };

  // Corps de la requête lu tel quel, quel que soit le type annoncé : c'est
  // le contenu qui est vérifié, pas l'étiquette
  const rawBody = express.raw({ type: () => true, limit: MAX_PHOTO_BYTES });

  router.put('/items/:id/photo', findItem, mayEdit, uploadQuota, rawBody, async (req, res) => {
    const checked = cleanJpeg(Buffer.isBuffer(req.body) ? req.body : null);
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    await photos.save(req.item.id, checked.jpeg);
    // L'article a pu être supprimé pendant l'envoi : la suppression l'emporte
    if (!service.photoItem(req.user, req.item.id)) {
      photos.remove(req.item.id);
      return res.status(404).json({ error: ITEM_NOT_FOUND });
    }
    res.json({ item: service.setPhotoDate(req.item.id, service.nowIso(), req.user) });
  });

  router.get('/items/:id/photo', findItem, (req, res) => {
    if (!req.item.photo_at) return res.status(404).json({ error: 'Photo introuvable.' });
    sendPhoto(res, photos, req.item.id);
  });

  router.delete('/items/:id/photo', findItem, mayEdit, (req, res) => {
    photos.remove(req.item.id);
    res.json({ item: service.setPhotoDate(req.item.id, null, req.user) });
  });

  return router;
}
