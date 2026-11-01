// Réservations des souhaits d'une liste d'envies, avec cotisation (compte
// connecté, en ligne seulement ; jamais par la file d'attente /api/ops) :
//   POST   /api/items/:id/reservation          réserver un souhait libre ({ open }
//                                              « Ouvert à d'autres », faux par défaut),
//                                              ou participer à une réservation ouverte
//   PATCH  /api/items/:id/reservation          ouvrir ou fermer ({ open }) : participants
//                                              (et gestionnaire)
//   DELETE /api/items/:id/reservation          quitter ma participation
//   DELETE /api/items/:id/reservation/all      libérer tout le souhait (gestionnaire)
//   DELETE /api/items/:id/reservation/participants/:userId
//                                              retirer un participant (gestionnaire)
// Toutes les règles, et la confidentialité vis-à-vis du bénéficiaire, sont
// dans server/reservations.js. Aucune ligne de journal (le journal de
// sécurité est lisible par l'Admin, qui peut être le bénéficiaire).

import express from 'express';
import { OpError } from '../lists.js';

export function reservationRoutes(ctx) {
  const router = express.Router();
  const run = (action) => (req, res) => {
    try {
      res.json(action(req));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
  const service = () => ctx.reservations;
  router.post('/items/:id/reservation', run((req) => service().reserve(req.user, req.params.id, req.body ?? {})));
  router.patch('/items/:id/reservation', run((req) => service().setOpen(req.user, req.params.id, req.body ?? {})));
  router.delete('/items/:id/reservation', run((req) => service().leave(req.user, req.params.id)));
  router.delete('/items/:id/reservation/all', run((req) => service().releaseAll(req.user, req.params.id)));
  router.delete('/items/:id/reservation/participants/:userId', run((req) => service().removeParticipant(req.user, req.params.id, req.params.userId)));
  return router;
}
