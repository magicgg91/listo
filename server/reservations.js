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
// Visiteurs du lien public (partie B, migration 20) : un visiteur sans compte
// peut réserver un souhait libre (toujours fermé), participer à une
// réservation ouverte et quitter SA participation. Il est reconnu par
// l'empreinte du jeton de son cookie (table visitor_reservations, lue
// seulement ici). Il ne reçoit, par souhait, qu'un état (libre, réservé,
// réservé et ouvert) et « c'est la mienne » : jamais le prénom, le nombre ni
// l'identifiant d'un autre participant. Les membres qui voient les
// réservations reçoivent les visiteurs comme participants (prénom, marque
// « lien public », identifiant opaque v<numéro>) ; le bénéficiaire, rien.
// Un souhait est réservé dès qu'il a un participant, compte ou visiteur ; il
// redevient libre quand il n'en a plus aucun.
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
// Visiteurs du lien public
export const VISITOR_NAME_MAX = 40;
export const BAD_FIRST_NAME = `Indiquez votre prénom (1 à ${VISITOR_NAME_MAX} caractères).`;
export const VISITOR_LIMIT = 'Vous avez déjà réservé beaucoup de souhaits sur ce lien. Annulez-en un pour en réserver un autre.';
export const ITEM_FULL = 'Ce souhait ne peut plus recevoir de participation par le lien. Demandez à la personne qui vous l\'a envoyé.';
export const LINK_FULL = 'Ce lien a atteint son nombre de réservations. Demandez à la personne qui vous l\'a envoyé.';
// Limites des visiteurs (voir le cahier des charges)
export const VISITOR_LIMITS = { perVisitor: 20, perItem: 10, perLink: 100 };

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
      SELECT reservations.item_id, reservations.user_id, users.display_name, reservations.created_at, COALESCE(reservation_states.open, 0) AS open
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
    // --- Visiteurs du lien public ---
    visitors: db.prepare('SELECT rowid AS id, token_hash FROM visitor_reservations WHERE item_id = ?'),
    joinVisitor: db.prepare('INSERT INTO visitor_reservations (item_id, token_hash, first_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
    leaveVisitor: db.prepare('DELETE FROM visitor_reservations WHERE item_id = ? AND token_hash = ?'),
    removeVisitor: db.prepare('DELETE FROM visitor_reservations WHERE item_id = ? AND rowid = ?'),
    clearVisitors: db.prepare('DELETE FROM visitor_reservations WHERE item_id = ?'),
    // Participations actives d'un visiteur sur une liste, et de tous les visiteurs d'une liste
    visitorCountInList: db.prepare(`
      SELECT COUNT(*) FROM visitor_reservations JOIN items ON items.id = visitor_reservations.item_id AND items.deleted_at IS NULL
      WHERE items.list_id = ? AND visitor_reservations.token_hash = ?
    `).pluck(),
    allVisitorsInList: db.prepare(`
      SELECT COUNT(*) FROM visitor_reservations JOIN items ON items.id = visitor_reservations.item_id AND items.deleted_at IS NULL
      WHERE items.list_id = ?
    `).pluck(),
    // Visiteurs d'une liste (pour les membres), dans l'ordre d'arrivée
    visitorsOfList: db.prepare(`
      SELECT visitor_reservations.item_id, visitor_reservations.rowid AS id, visitor_reservations.first_name, visitor_reservations.created_at,
        COALESCE(reservation_states.open, 0) AS open
      FROM visitor_reservations
      JOIN items ON items.id = visitor_reservations.item_id AND items.deleted_at IS NULL
      LEFT JOIN reservation_states ON reservation_states.item_id = visitor_reservations.item_id
      WHERE items.list_id = ?
    `),
    // Un souhait (non supprimé) de CETTE liste (celle du lien public)
    listItem: db.prepare(`
      SELECT items.id, items.list_id, items.checked FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL AND lists.type = 'wishes'
      WHERE items.id = ? AND items.list_id = ? AND items.deleted_at IS NULL
    `),
    // État de chaque souhait réservé d'une liste (page publique) : ouvert ou non
    statesOfList: db.prepare(`
      SELECT reservation_states.item_id, reservation_states.open FROM reservation_states
      JOIN items ON items.id = reservation_states.item_id AND items.deleted_at IS NULL
      WHERE items.list_id = ?
    `),
    mineInList: db.prepare(`
      SELECT visitor_reservations.item_id FROM visitor_reservations
      JOIN items ON items.id = visitor_reservations.item_id AND items.deleted_at IS NULL
      WHERE items.list_id = ? AND visitor_reservations.token_hash = ?
    `).pluck(),
  };

  // Nombre de participants d'un souhait (comptes et visiteurs)
  const countAll = (itemId) => q.participants.all(itemId).length + q.visitors.all(itemId).length;

  // Réservations d'une liste (pour les membres qui ont le droit de les voir) :
  // [{ itemId, open, participants: [{ userId, displayName } ou
  // { visitorId, displayName, viaLink: true }] }], dans l'ordre d'arrivée
  function describeList(listId) {
    const byItem = new Map();
    const rows = [
      ...q.ofList.all(listId).map((row) => ({ itemId: row.item_id, open: row.open, at: row.created_at ?? '', participant: { userId: row.user_id, displayName: row.display_name } })),
      ...q.visitorsOfList.all(listId).map((row) => ({ itemId: row.item_id, open: row.open, at: row.created_at, participant: { visitorId: `v${row.id}`, displayName: row.first_name, viaLink: true } })),
    ].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    for (const row of rows) {
      if (!byItem.has(row.itemId)) byItem.set(row.itemId, { itemId: row.itemId, open: row.open === 1, participants: [] });
      byItem.get(row.itemId).participants.push(row.participant);
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
  // Plus aucun participant (ni compte, ni visiteur) : le souhait est libre
  const freeIfEmpty = (itemId) => {
    if (!countAll(itemId)) q.dropState.run(itemId);
  };

  // Réserver un souhait libre (open : « Ouvert à d'autres », faux par
  // défaut), ou participer à une réservation ouverte
  // (POST /api/items/:id/reservation)
  function reserve(user, itemId, body = {}) {
    return act(user, itemId, (item, list, participants) => {
      const open = openOf(body.open, false);
      if (item.checked === 1) throw new OpError(409, RECEIVED);
      const now = nowIso();
      if (!countAll(item.id)) {
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
      // Le gestionnaire peut ouvrir ou fermer même s'il n'y a que des visiteurs
      if (!countAll(item.id)) throw new OpError(404, NOT_RESERVED);
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

  // Gestionnaire : retirer un visiteur du lien public (DELETE
  // /api/items/:id/reservation/visitors/:visitorId, identifiant « v<numéro> »)
  function removeVisitor(user, itemId, visitorId) {
    return act(user, itemId, (item, list) => {
      if (!isManager(user.id, list)) throw new OpError(403, MANAGER_ONLY);
      const match = /^v(\d{1,15})$/.exec(String(visitorId ?? ''));
      if (!match || !q.removeVisitor.run(item.id, Number(match[1])).changes) throw new OpError(404, NOT_IN);
      freeIfEmpty(item.id);
    });
  }

  // Gestionnaire : libérer tout le souhait, comptes et visiteurs
  // (DELETE /api/items/:id/reservation/all)
  function releaseAll(user, itemId) {
    return act(user, itemId, (item, list) => {
      if (!isManager(user.id, list)) throw new OpError(403, MANAGER_ONLY);
      if (!countAll(item.id)) throw new OpError(404, NOT_RESERVED);
      q.clear.run(item.id);
      q.clearVisitors.run(item.id);
      q.dropState.run(item.id);
    });
  }

  // --- Visiteurs du lien public (appelés par server/routes/public.js, après
  // le contrôle du lien : jeton, mot de passe, expiration, arrêt) ---
  // listId : la liste du lien ; tokenHash : empreinte du jeton du visiteur.
  // Aucune écriture dans items, lists, list_events, ni dans le journal.

  // Prénom d'un visiteur : texte simple, espaces en trop retirés, 1 à 40 caractères
  function visitorName(value) {
    const name = typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
    // Refusés : caractères de contrôle et caractères invisibles de mise en
    // forme (par exemple l'inversion du sens du texte, qui pourrait cacher la
    // mention « (lien public) » et faire passer un visiteur pour un proche).
    // Seul le liant des émojis composés (U+200D) est permis.
    if (!name || [...name].length > VISITOR_NAME_MAX || /[\p{Cc}\p{Co}\p{Cs}]|(?!\u200d)\p{Cf}/u.test(name)) throw new OpError(400, BAD_FIRST_NAME);
    return name;
  }

  function visitorItem(listId, itemId) {
    const item = isUuid(itemId) ? q.listItem.get(itemId.toLowerCase(), listId) : null;
    if (!item) throw new OpError(404, NOT_FOUND);
    return item;
  }

  // Réserver un souhait libre (toujours fermé) ou participer à une réservation
  // ouverte. Course avec un compte : une seule transaction ; le premier gagne,
  // le second participe si c'est ouvert, sinon « Déjà réservé. ».
  function visitorReserve(listId, tokenHash, itemId, firstName, limits = VISITOR_LIMITS) {
    const item = visitorItem(listId, itemId);
    const name = visitorName(firstName);
    db.transaction(() => {
      if (item.checked === 1) throw new OpError(409, RECEIVED);
      const visitors = q.visitors.all(item.id);
      if (visitors.some((v) => v.token_hash === tokenHash)) throw new OpError(409, ALREADY_IN);
      const taken = q.participants.all(item.id).length + visitors.length > 0;
      if (taken && q.state.get(item.id) !== 1) throw new OpError(409, ALREADY);
      if (q.visitorCountInList.get(listId, tokenHash) >= limits.perVisitor) throw new OpError(429, VISITOR_LIMIT);
      if (visitors.length >= limits.perItem) throw new OpError(409, ITEM_FULL);
      if (q.allVisitorsInList.get(listId) >= limits.perLink) throw new OpError(409, LINK_FULL);
      const now = nowIso();
      q.joinVisitor.run(item.id, tokenHash, name, now, now);
      if (!taken) q.setState.run({ itemId: item.id, open: 0, now }); // réservation de visiteur : fermée
    })();
    notifyViewers(listId);
  }

  // Quitter SA participation (le jeton prouve qu'elle est la sienne)
  function visitorLeave(listId, tokenHash, itemId) {
    const item = visitorItem(listId, itemId);
    db.transaction(() => {
      if (item.checked === 1) throw new OpError(409, RECEIVED); // « Reçu » : plus aucune action de visiteur
      if (!q.leaveVisitor.run(item.id, tokenHash).changes) throw new OpError(404, NOT_IN);
      freeIfEmpty(item.id);
    })();
    notifyViewers(listId);
  }

  // Page publique d'un visiteur : pour chaque souhait réservé, son état
  // (« reserved » ou « open ») et « mine » ; RIEN d'autre (ni prénom, ni
  // nombre, ni identifiant d'un participant). Map itemId -> { state, mine }
  function forVisitor(listId, tokenHash) {
    const mine = new Set(tokenHash ? q.mineInList.all(listId, tokenHash) : []);
    const out = new Map();
    for (const row of q.statesOfList.all(listId)) out.set(row.item_id, { state: row.open === 1 ? 'open' : 'reserved', mine: mine.has(row.item_id) });
    return out;
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

  return { reserve, setOpen, leave, removeParticipant, removeVisitor, releaseAll, forList, forUser, visitorReserve, visitorLeave, forVisitor };
}
