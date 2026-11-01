// Réservations des souhaits d'une liste d'envies (compte connecté, en ligne
// seulement ; jamais par la file d'attente /api/ops) :
//   POST   /api/items/:id/reservation   réserver ce souhait
//   DELETE /api/items/:id/reservation   annuler ma réservation, ou (gestionnaire)
//                                       libérer celle d'un autre
// Toutes les règles, et la confidentialité vis-à-vis du bénéficiaire, sont
// dans server/reservations.js. Aucune ligne de journal (le journal de
// sécurité est lisible par l'Admin, qui peut être le bénéficiaire).

import express from 'express';
import { OpError } from '../lists.js';

export function reservationRoutes(ctx) {
  const router = express.Router();
  const run = (action) => (req, res) => {
    try {
      res.json(action(req.user, req.params.id));
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };
  router.post('/items/:id/reservation', run((user, id) => ctx.reservations.reserve(user, id)));
  router.delete('/items/:id/reservation', run((user, id) => ctx.reservations.release(user, id)));
  return router;
}
