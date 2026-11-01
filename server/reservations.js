// Réservations des souhaits d'une liste d'envies.
//
// RÈGLE CRITIQUE : le bénéficiaire de la liste ne doit jamais savoir qu'un
// souhait est réservé, ni par qui, ni combien. Ce module est le SEUL à lire
// la table reservations, et il filtre lui-même chaque canal :
// - lecture d'une liste (forList) et synchronisation (forUser) : seulement
//   pour les membres qui ont le droit de voir les réservations
//   (seesReservations : tout membre sauf le bénéficiaire, d'après l'identité
//   du compte, jamais d'après son appartenance à la liste) ;
// - temps réel : le signal « la liste a changé » ne part qu'à ces membres ;
// - aucune écriture ailleurs : ni dans items, ni dans lists (pas de
//   updated_at : rien ne bouge chez le bénéficiaire, ni l'ordre « plus
//   récemment active », ni un compteur), ni dans le journal des nouveautés,
//   ni dans le journal de sécurité (lisible par l'Admin, qui peut être le
//   bénéficiaire) ;
// - erreurs : un bénéficiaire reçoit toujours la même réponse (réserver,
//   annuler ou libérer, souhait réservé ou non), donnée AVANT toute lecture
//   de la table reservations.
//
// Réserver n'est pas modifier la liste : un membre en lecture seule peut
// réserver. En ligne seulement (pas de file d'attente). Un seul réservant
// par souhait (clé primaire item_id) : une seconde réservation reçoit
// « Déjà réservé. », jamais d'écrasement.

import { OpError } from './lists.js';
import { isUuid } from './lists.js';
import { wishListOf, seesReservations, isManager } from '../public/js/wishes.js';

export const NOT_FOUND = 'Introuvable, peut-être supprimé entre-temps.';
export const NOT_WISHES = 'La réservation n\'existe que dans les listes d\'envies.';
// Seule réponse donnée au bénéficiaire, quoi qu'il demande
export const BENEFICIARY = 'Vous ne réservez pas les souhaits de votre propre liste.';
export const ALREADY = 'Déjà réservé.';
export const NOT_RESERVED = 'Ce souhait n\'est pas réservé.';
export const NOT_YOURS = 'Seule la personne qui a réservé, ou le gestionnaire de la liste, peut libérer cette réservation.';

export function createReservationService(ctx) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    // Un souhait (non supprimé) d'une liste (non supprimée) dont le compte est membre
    memberItem: db.prepare(`
      SELECT items.id, items.list_id, lists.type, lists.owner_id, lists.for_user_id, lists.for_name
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.id = :itemId AND items.deleted_at IS NULL
    `),
    find: db.prepare('SELECT * FROM reservations WHERE item_id = ?'),
    insert: db.prepare('INSERT INTO reservations (item_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)'),
    remove: db.prepare('DELETE FROM reservations WHERE item_id = ?'),
    // Réservations des souhaits visibles d'une liste, avec le prénom du réservant
    ofList: db.prepare(`
      SELECT reservations.item_id, reservations.user_id, users.display_name
      FROM reservations
      JOIN items ON items.id = reservations.item_id AND items.deleted_at IS NULL
      JOIN users ON users.id = reservations.user_id
      WHERE items.list_id = ?
      ORDER BY reservations.created_at, reservations.item_id
    `),
    // Mes listes d'envies (membre, non supprimées)
    myWishLists: db.prepare(`
      SELECT lists.id, lists.owner_id, lists.for_user_id, lists.for_name FROM lists
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = ?
      WHERE lists.deleted_at IS NULL AND lists.type = 'wishes'
    `),
    activeMembers: db.prepare(`
      SELECT list_members.user_id FROM list_members JOIN users ON users.id = list_members.user_id
      WHERE list_members.list_id = ? AND users.active = 1
    `).pluck(),
    list: db.prepare('SELECT id, owner_id, for_user_id, for_name FROM lists WHERE id = ?'),
  };

  const describe = (row) => ({ itemId: row.item_id, userId: row.user_id, displayName: row.display_name });

  // Souhait visé par une demande, avec les contrôles communs, dans un ordre
  // fixe : membre (sinon 404), liste d'envies (sinon 400), bénéficiaire
  // (toujours la même réponse, sans rien lire des réservations)
  function wishFor(user, itemId) {
    const item = isUuid(itemId) ? q.memberItem.get({ userId: user.id, itemId: itemId.toLowerCase() }) : null;
    if (!item) throw new OpError(404, NOT_FOUND);
    if (item.type !== 'wishes') throw new OpError(400, NOT_WISHES);
    const list = wishListOf(item);
    if (!seesReservations(user.id, list)) throw new OpError(403, BENEFICIARY);
    return { item, list };
  }

  // Prévient les seuls membres qui voient les réservations (jamais le
  // bénéficiaire, même pas un signal générique)
  function notifyViewers(listId) {
    const row = q.list.get(listId);
    if (!row) return;
    const list = wishListOf(row);
    const viewers = q.activeMembers.all(listId).filter((id) => seesReservations(id, list));
    ctx.events?.notifyUsers(viewers, listId);
  }

  // Réserver un souhait (POST /api/items/:id/reservation)
  function reserve(user, itemId) {
    const { item } = wishFor(user, itemId);
    const now = nowIso();
    try {
      q.insert.run(item.id, user.id, now, now);
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) throw new OpError(409, ALREADY);
      throw err;
    }
    notifyViewers(item.list_id);
    return { reservation: describe({ item_id: item.id, user_id: user.id, display_name: user.display_name }) };
  }

  // Annuler sa réservation, ou (gestionnaire) libérer celle d'un autre
  // (DELETE /api/items/:id/reservation)
  function release(user, itemId) {
    const { item, list } = wishFor(user, itemId);
    const current = q.find.get(item.id);
    if (!current) throw new OpError(404, NOT_RESERVED);
    if (current.user_id !== user.id && !isManager(user.id, list)) throw new OpError(403, NOT_YOURS);
    q.remove.run(item.id);
    notifyViewers(item.list_id);
    return {};
  }

  // Réservations d'une liste pour ce compte : un tableau s'il a le droit de
  // les voir, sinon null (le champ n'est alors pas envoyé du tout).
  // row : la liste telle que lue en base (owner_id, for_user_id, for_name, type)
  function forList(user, row) {
    if (row.type !== 'wishes' || !seesReservations(user.id, wishListOf(row))) return null;
    return q.ofList.all(row.id).map(describe);
  }

  // Synchronisation : { <liste> : [réservations] } pour chaque liste d'envies
  // dont le compte est membre ET où il voit les réservations (tableau vide
  // compris : le téléphone apprend ainsi qu'une réservation a été libérée).
  // Renvoyé en entier à chaque synchronisation, comme les nouveautés.
  function forUser(user) {
    const out = {};
    for (const row of q.myWishLists.all(user.id)) {
      if (seesReservations(user.id, wishListOf(row))) out[row.id] = q.ofList.all(row.id).map(describe);
    }
    return out;
  }

  return { reserve, release, forList, forUser };
}
