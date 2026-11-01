// Réservations des souhaits d'une liste d'envies, avec cotisation : un
// souhait peut avoir plusieurs participants (aucun montant, aucune part,
// aucun paiement : on sait seulement qui participe).
//
// États d'un souhait : libre (aucun participant) ; réservé fermé (personne
// d'autre ne peut se joindre) ; réservé ouvert (les autres peuvent
// « Participer »). L'état « ouvert » est rangé dans reservation_states, à
// part, pour ne toucher ni items ni lists.
//
// RÈGLE CRITIQUE : le bénéficiaire de la liste ne doit jamais savoir qu'un
// souhait est réservé, ni par qui, ni combien. Ce module est le SEUL à lire
// les tables reservations et reservation_states, et il filtre lui-même
// chaque canal :
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
// - erreurs : un bénéficiaire reçoit toujours la même réponse, quelle que
//   soit l'action et quel que soit l'état du souhait, donnée AVANT toute
//   lecture des réservations et avant de lire le corps de la requête.
//
// Réserver n'est pas modifier la liste : un membre en lecture seule peut
// réserver. En ligne seulement (pas de file d'attente). Chaque action est
// évaluée dans une transaction (états lus et écrits d'un seul bloc).
// Deux premières réservations simultanées : la première crée la réservation
// (fermée ou ouverte, comme elle l'a demandé) ; la seconde, traitée juste
// après, la trouve déjà prise : elle devient participante si la réservation
// est ouverte, sinon elle reçoit 409 « Déjà réservé. ».

import { OpError, isUuid } from './lists.js';
import { wishListOf, seesReservations, isManager } from '../public/js/wishes.js';

export const NOT_FOUND = 'Introuvable, peut-être supprimé entre-temps.';
export const NOT_WISHES = 'La réservation n\'existe que dans les listes d\'envies.';
// Seule réponse donnée au bénéficiaire, quoi qu'il demande
export const BENEFICIARY = 'Vous ne réservez pas les souhaits de votre propre liste.';
export const ALREADY = 'Déjà réservé.';
export const ALREADY_IN = 'Vous participez déjà à ce cadeau.';
export const RECEIVED = 'Ce souhait est déjà reçu.';
export const NOT_RESERVED = 'Ce souhait n\'est pas réservé.';
export const NOT_IN = 'Vous ne participez pas à ce cadeau.';
export const PARTICIPANTS_ONLY = 'Seuls les participants peuvent ouvrir ou fermer la réservation.';
export const MANAGER_ONLY = 'Seul le gestionnaire de la liste peut faire cela.';
export const BAD_OPEN = 'Valeur « ouvert à d\'autres » invalide (true ou false).';

export function createReservationService(ctx) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    // Un souhait (non supprimé) d'une liste (non supprimée) dont le compte est membre
    memberItem: db.prepare(`
      SELECT items.id, items.list_id, items.checked, lists.type, lists.owner_id, lists.for_user_id, lists.for_name
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.id = :itemId AND items.deleted_at IS NULL
    `),
    participants: db.prepare('SELECT user_id FROM reservations WHERE item_id = ?').pluck(),
    state: db.prepare('SELECT open FROM reservation_states WHERE item_id = ?').pluck(),
    join: db.prepare('INSERT INTO reservations (item_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)'),
    leave: db.prepare('DELETE FROM reservations WHERE item_id = ? AND user_id = ?'),
    clear: db.prepare('DELETE FROM reservations WHERE item_id = ?'),
    setState: db.prepare(`INSERT INTO reservation_states (item_id, open, created_at, updated_at) VALUES (:itemId, :open, :now, :now)
      ON CONFLICT(item_id) DO UPDATE SET open = :open, updated_at = :now`),
    dropState: db.prepare('DELETE FROM reservation_states WHERE item_id = ?'),
    // Souhaits réservés d'une liste (non supprimés), participants dans
    // l'ordre d'arrivée, avec leur prénom
    ofList: db.prepare(`
      SELECT reservations.item_id, reservations.user_id, users.display_name, COALESCE(reservation_states.open, 0) AS open
      FROM reservations
      JOIN items ON items.id = reservations.item_id AND items.deleted_at IS NULL
      JOIN users ON users.id = reservations.user_id
      LEFT JOIN reservation_states ON reservation_states.item_id = reservations.item_id
      WHERE items.list_id = ?
      ORDER BY reservations.item_id, reservations.created_at, reservations.user_id
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

  // Réservations d'une liste : [{ itemId, open, participants: [{ userId, displayName }] }]
  function describeList(listId) {
    const byItem = new Map();
    for (const row of q.ofList.all(listId)) {
      if (!byItem.has(row.item_id)) byItem.set(row.item_id, { itemId: row.item_id, open: row.open === 1, participants: [] });
      byItem.get(row.item_id).participants.push({ userId: row.user_id, displayName: row.display_name });
    }
    return [...byItem.values()];
  }
  const describeItem = (listId, itemId) => describeList(listId).find((r) => r.itemId === itemId) ?? null;

  // Souhait visé par une demande, avec les contrôles communs, dans un ordre
  // fixe : membre (sinon 404), liste d'envies (sinon 400), bénéficiaire
  // (toujours la même réponse, sans rien lire des réservations ni de la demande)
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

  // Action commune : contrôles, puis la modification dans une transaction,
  // puis le signal aux proches ; renvoie l'état du souhait (ou null s'il est libre)
  function act(user, itemId, change) {
    const { item, list } = wishFor(user, itemId);
    db.transaction(() => change(item, list, q.participants.all(item.id)))();
    notifyViewers(item.list_id);
    return { reservation: describeItem(item.list_id, item.id) };
  }

  const openOf = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new OpError(400, BAD_OPEN);
    return value;
  };
  const freeIfEmpty = (itemId) => {
    if (!q.participants.all(itemId).length) q.dropState.run(itemId);
  };

  // Réserver un souhait libre (open : « Ouvert à d'autres », faux par
  // défaut), ou participer à une réservation ouverte
  // (POST /api/items/:id/reservation)
  function reserve(user, itemId, body = {}) {
    return act(user, itemId, (item, list, participants) => {
      const open = openOf(body.open, false);
      if (item.checked === 1) throw new OpError(409, RECEIVED);
      const now = nowIso();
      if (!participants.length) {
        q.join.run(item.id, user.id, now, now);
        q.setState.run({ itemId: item.id, open: open ? 1 : 0, now });
        return;
      }
      if (participants.includes(user.id)) throw new OpError(409, ALREADY_IN);
      if (q.state.get(item.id) !== 1) throw new OpError(409, ALREADY);
      q.join.run(item.id, user.id, now, now);
    });
  }

  // Ouvrir ou fermer la réservation : tout participant (ou le gestionnaire)
  // (PATCH /api/items/:id/reservation, { open })
  function setOpen(user, itemId, body = {}) {
    return act(user, itemId, (item, list, participants) => {
      const open = openOf(body.open, undefined);
      if (open === undefined) throw new OpError(400, BAD_OPEN);
      if (!participants.length) throw new OpError(404, NOT_RESERVED);
      if (!participants.includes(user.id) && !isManager(user.id, list)) throw new OpError(403, PARTICIPANTS_ONLY);
      q.setState.run({ itemId: item.id, open: open ? 1 : 0, now: nowIso() });
    });
  }

  // Quitter sa participation ; le dernier qui part libère le souhait
  // (DELETE /api/items/:id/reservation)
  function leave(user, itemId) {
    return act(user, itemId, (item, list, participants) => {
      if (!participants.includes(user.id)) throw new OpError(404, NOT_IN);
      q.leave.run(item.id, user.id);
      freeIfEmpty(item.id);
    });
  }

  // Gestionnaire : retirer un participant (DELETE
  // /api/items/:id/reservation/participants/:userId)
  function removeParticipant(user, itemId, participantId) {
    return act(user, itemId, (item, list, participants) => {
      if (!isManager(user.id, list)) throw new OpError(403, MANAGER_ONLY);
      const id = Number(participantId);
      if (!Number.isSafeInteger(id) || !participants.includes(id)) throw new OpError(404, NOT_IN);
      q.leave.run(item.id, id);
      freeIfEmpty(item.id);
    });
  }

  // Gestionnaire : libérer tout le souhait (DELETE /api/items/:id/reservation/all)
  function releaseAll(user, itemId) {
    return act(user, itemId, (item, list, participants) => {
      if (!isManager(user.id, list)) throw new OpError(403, MANAGER_ONLY);
      if (!participants.length) throw new OpError(404, NOT_RESERVED);
      q.clear.run(item.id);
      q.dropState.run(item.id);
    });
  }

  // Réservations d'une liste pour ce compte : un tableau s'il a le droit de
  // les voir, sinon null (le champ n'est alors pas envoyé du tout).
  // row : la liste telle que lue en base (owner_id, for_user_id, for_name, type)
  function forList(user, row) {
    if (row.type !== 'wishes' || !seesReservations(user.id, wishListOf(row))) return null;
    return describeList(row.id);
  }

  // Synchronisation : { <liste> : [réservations] } pour chaque liste d'envies
  // dont le compte est membre ET où il voit les réservations (tableau vide
  // compris : le téléphone apprend ainsi qu'une réservation a été libérée).
  // Renvoyé en entier à chaque synchronisation, comme les nouveautés.
  function forUser(user) {
    const out = {};
    for (const row of q.myWishLists.all(user.id)) {
      if (seesReservations(user.id, wishListOf(row))) out[row.id] = describeList(row.id);
    }
    return out;
  }

  return { reserve, setOpen, leave, removeParticipant, releaseAll, forList, forUser };
}
