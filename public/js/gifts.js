// « À offrir » : liste automatique de mes cadeaux (décisions du 23 novembre
// 2026). Tous les souhaits que je réserve ou auxquels je participe, dans
// toutes les listes d'envies dont je suis membre (jamais celles dont je suis
// le bénéficiaire : le serveur ne m'en envoie pas les réservations).
//
// - Personne ne peut y ajouter, renommer, partager ni supprimer quoi que ce
//   soit : c'est une vue. Un souhait en sort tout seul quand le bénéficiaire
//   l'a marqué « Reçu », quand ma réservation ou ma participation prend
//   fin, ou quand le souhait ou sa liste est supprimé.
// - « Acheté » : ma case à moi (opération gift.bought de la file
//   d'attente), que je suis seul à voir.
// - Tout est calculé ici, sur le téléphone, à partir de la copie locale
//   (store.js : listes, souhaits, réservations, et state.gifts : date de mes
//   réservations et marques « Acheté ») : aucune demande de plus au
//   serveur, marche hors ligne.
//
// Fonctions pures (sans réseau ni écran), testées automatiquement
// (test/gifts.test.js).

import { compareText } from './i18n.js';
import { beneficiaryId } from './wishes.js';

// À qui va un souhait : { key, name } (le compte bénéficiaire, la personne
// sans compte, ou le propriétaire d'une liste « Moi »). name : prénom
// affiché (null si inconnu).
export function recipientOf(list) {
  if (list.forName && !list.forUserId) return { key: `n:${list.forName.toLocaleLowerCase()}`, name: list.forName };
  const id = beneficiaryId({ ownerId: list.ownerId, forUserId: list.forUserId ?? null, forName: list.forName ?? null });
  const name = list.forDisplayName ?? list.members?.find((m) => m.id === id)?.displayName ?? null;
  return { key: `u:${id}`, name };
}

// Mes cadeaux, un par souhait : [{ item, list, recipient, reservedAt,
// bought, people, alone }]. people : nombre de participants (comptes et
// visiteurs du lien public) ; alone : je suis le seul (« Réservé »), sinon
// « Vous participez (N personnes) ».
// me : identifiant de mon compte.
export function myGifts(state, me) {
  const gifts = [];
  for (const [listId, rows] of Object.entries(state.reservations ?? {})) {
    const list = state.lists.get(listId);
    if (!list || list.type !== 'wishes' || list.isBeneficiary || !Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row.participants?.some((p) => p.userId === me)) continue;
      const item = state.items.get(row.itemId);
      // Souhait supprimé, d'une autre liste, ou « Reçu » : il sort de la liste
      if (!item || item.listId !== listId || item.deletedAt || item.checked) continue;
      const people = row.participants.length;
      gifts.push({
        item,
        list,
        recipient: recipientOf(list),
        reservedAt: state.gifts?.reservedAt?.[item.id] ?? '',
        bought: Boolean(state.gifts?.bought?.has(item.id)),
        people,
        alone: people === 1,
      });
    }
  }
  return gifts;
}

// Ordre d'un groupe : à acheter d'abord, puis achetés (en bas) ; dans
// chacun, par nom (puis par liste, puis identifiant : ordre stable)
const byName = (a, b) => compareText(a.item.name, b.item.name) || compareText(a.list.name, b.list.name) || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0);
const inGroupOrder = (a, b) => Number(a.bought) - Number(b.bought) || byName(a, b);

// La page « À offrir » : { groups, total, toBuy }. Un groupe par personne
// (« Pour Zoé »), rangés par prénom : [{ key, name, gifts }] ; dans chaque
// groupe, ceux à acheter puis ceux déjà achetés.
export function computeGifts(state, me) {
  const gifts = myGifts(state, me);
  const byPerson = new Map();
  for (const gift of gifts) {
    const { key, name } = gift.recipient;
    if (!byPerson.has(key)) byPerson.set(key, { key, name, gifts: [] });
    byPerson.get(key).gifts.push(gift);
  }
  const groups = [...byPerson.values()]
    .sort((a, b) => compareText(a.name ?? '', b.name ?? '') || (a.key < b.key ? -1 : 1));
  for (const group of groups) group.gifts.sort(inGroupOrder);
  return { groups, total: gifts.length, toBuy: gifts.filter((g) => !g.bought).length };
}

// Tuile « À offrir » de l'Accueil : les cadeaux pas encore achetés, les
// plus récemment réservés d'abord (limit : 3)
export function recentGifts(state, me, limit = 3) {
  return myGifts(state, me)
    .filter((gift) => !gift.bought)
    .sort((a, b) => (a.reservedAt < b.reservedAt ? 1 : a.reservedAt > b.reservedAt ? -1 : byName(a, b)))
    .slice(0, limit);
}

// La carte « À offrir » de Listes et la tuile de l'Accueil n'existent que
// si j'ai au moins une réservation ou participation en cours
export const hasGifts = (state, me) => myGifts(state, me).length > 0;
