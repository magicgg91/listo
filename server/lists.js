// Listes et articles : droits d'accès, opérations, historique, lecture,
// synchronisation et nettoyage.
//
// Règle d'or : chaque opération vérifie elle-même, dans la base, que le
// compte connecté est membre de la liste concernée (list_members). Le
// téléphone n'est jamais cru sur parole. Quelqu'un qui n'est pas membre
// reçoit exactement la même réponse que si la liste n'existait pas (404).
//
// Droits :
// - propriétaire : tout (renommer, changer le type et le magasin, partage et
//   droit de chaque personne, supprimer la liste) ;
// - contributeur (list_members.access = 'modification') :
//   articles seulement (ajouter, modifier, cocher, supprimer, tout décocher,
//   retirer les cochés, photo, mode scan) ;
// - invité « Lecture seule » ('lecture') : voit la liste, ses articles et
//   leurs photos, reçoit le temps réel ; toute écriture est refusée (403,
//   READ_ONLY). Une seule fonction décide : canEdit (plus bas) ;
// - un Admin n'a aucun droit particulier sur les listes des autres.
//
// Magasin « multi » (étape 6) : une liste de courses dont le magasin est
// « multi » n'a pas de rayon. Chaque article y a son propre magasin, choisi
// parmi ceux que regroupe le magasin de la liste (et actifs). Une liste à
// magasin simple garde ses rayons, sans magasin par article.
//
// Les dates (created_at, updated_at, deleted_at) sont toujours posées ici,
// par le serveur : celles qu'enverrait le téléphone sont ignorées.

import { createNewsService } from './news.js';
import crypto from 'node:crypto';
import {
  normalizeItemName, suggest, usualAisle as sharedUsualAisle, usualStore as sharedUsualStore, recordUse, moveUse,
} from '../public/js/history.js';
import { groupItems } from '../public/js/sorting.js';
import { isListIcon } from '../public/js/list-icons.js';
import {
  isListType, isShoppingList, isWishList, usesTaskOptions, typeOf, TYPE_LABELS, WISHES_FIXED, NOT_TO_WISHES,
} from '../public/js/list-types.js';
import {
  wishListOf, beneficiaryId, mayMarkReceived, cleanLink, FOR_NAME_MAX, PRICE_MAX_CENTS,
} from '../public/js/wishes.js';
import { createReservationService } from './reservations.js';
import { cleanName, parseId } from './validate.js';
import { normalizeBarcode } from './products.js';

const DAY = 24 * 60 * 60 * 1000;

// Priorité et échéance d'un élément (listes autres que les courses)
export const PRIORITIES = ['low', 'normal', 'high'];
const FIRST_DAY = '2000-01-01';
const LAST_DAY = '2100-12-31';

// Vrai si value est une vraie date AAAA-MM-JJ (pas de 30 février, pas
// d'heure ni de fuseau), entre le 1er janvier 2000 et le 31 décembre 2100
export function isDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < FIRST_DAY || value > LAST_DAY) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export const PURGE_AFTER_DAYS = 30;
export const MAX_OPS_PER_BATCH = 100;

// Identifiant UUID (forme 8-4-4-4-12 en hexadécimal)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID.test(value);

// Erreur « métier » d'une opération : code (400, 403, 404, 409) et message
class OpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const LIST_NOT_FOUND = 'Liste introuvable.';
// Messages sans le mot « article » : selon la liste, on dit « article »
// (courses) ou « élément » (autres listes), et ici la liste n'est pas connue
// (l'élément n'existe plus, ou la requête est mal formée).
const ITEM_NOT_FOUND = 'Introuvable, peut-être supprimé entre-temps.';
const OWNER_ONLY = 'Seul le propriétaire de la liste peut faire cela.';
export const READ_ONLY = 'Vous avez un accès en lecture seule à cette liste.';
export const OWNER_CANNOT_LEAVE = 'Le propriétaire ne peut pas quitter sa liste. Supprimez-la à la place.';
// Priorité ou échéance désactivée par le propriétaire pour cette liste
// (migration 13) : refus avant toute écriture
export const PRIORITY_OFF = 'La priorité est désactivée pour cette liste.';
export const DUE_OFF = "L'échéance est désactivée pour cette liste.";
export const ACCESS = ['modification', 'lecture'];

// Droit d'écriture d'un compte sur une liste : LE seul contrôle, utilisé par
// toutes les écritures (opérations, photos, mode scan) et par la description
// de la liste envoyée au téléphone. row : ce que la base dit de la liste et
// de l'appartenance du compte (owner_id ou list_owner_id, member_access).
// Le propriétaire a toujours tous les droits ; un membre, seulement en
// « modification » (contributeur). Jamais d'après ce que dit le téléphone.
export function canEdit(user, row) {
  const ownerId = row.owner_id ?? row.list_owner_id;
  return ownerId === user.id || row.member_access === 'modification';
}

// --- Vérification des champs envoyés par le téléphone ---

// what : « de liste », ou rien (élément d'une liste : mot neutre)
function requireUuid(value, what) {
  if (!isUuid(value)) throw new OpError(400, what ? `Identifiant ${what} invalide.` : 'Identifiant invalide.');
  return value.toLowerCase();
}

function listName(value) {
  const name = cleanName(value);
  if (!name) throw new OpError(400, 'Nom de liste invalide (1 à 100 caractères).');
  return name;
}

function itemName(value) {
  const name = cleanName(value);
  if (!name) throw new OpError(400, 'Nom invalide (1 à 100 caractères).');
  return name;
}

// Texte facultatif (quantité, note) : absent ou null = vide
function optionalText(value, max, label) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new OpError(400, `${label} invalide.`);
  const text = value.normalize('NFC').trim();
  if (text.length > max) throw new OpError(400, `${label} trop longue (${max} caractères au plus).`);
  return text;
}

// Icône choisie pour une liste : identifiant de la liste blanche
// (public/js/list-icons.js), « » pour revenir à l'icône de la catégorie, ou
// undefined si elle n'est pas envoyée (rien ne change)
// « Après l'ajout » : 'quick' (rester sur la liste) ou 'detail' (ouvrir la
// fiche), rien d'autre ; undefined : pas fourni
export const ADD_MODES = ['quick', 'detail'];
function addModeOf(value) {
  if (value === undefined) return undefined;
  if (!ADD_MODES.includes(value)) throw new OpError(400, 'Réglage « Après l\'ajout » invalide.');
  return value;
}

// Lien d'un souhait : http ou https seulement (public/js/wishes.js) ; null
// ou « » l'efface ; undefined : pas fourni
function linkOf(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const link = cleanLink(value);
  if (!link) throw new OpError(400, 'Lien invalide : une adresse web en http ou https, 500 caractères au plus.');
  return link;
}

// Prix indicatif d'un souhait, en centimes (entier de 0 à 100 000 €) ; null
// l'efface ; undefined : pas fourni
function priceOf(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > PRICE_MAX_CENTS) throw new OpError(400, 'Prix invalide (de 0 à 100 000 €).');
  return value;
}

// Prénom d'une personne sans compte (liste d'envies) : texte simple, 80 caractères au plus
function forNameOf(value) {
  const name = typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (!name || [...name].length > FOR_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new OpError(400, `Prénom invalide (1 à ${FOR_NAME_MAX} caractères).`);
  }
  return name;
}

function listIconOf(value) {
  if (value === undefined) return undefined;
  if (value === '' || isListIcon(value)) return value;
  throw new OpError(400, 'Icône inconnue.');
}

const quantity = (value) => optionalText(value, 30, 'Quantité');
const note = (value) => optionalText(value, 500, 'Note');

// --- Accès aux données ---

export function createListService(ctx) {
  const { db } = ctx;
  // Nouveautés : journal d'activité et repères de lecture (server/news.js)
  const news = ctx.news ?? (ctx.news = createNewsService(ctx));
  // Réservations des listes d'envies (server/reservations.js) : seul module
  // qui lit la table reservations, et qui filtre ce qu'en voit chaque compte
  const reservations = ctx.reservations ?? (ctx.reservations = createReservationService(ctx));
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    // Catégories : plus utilisées que pour traduire une ancienne opération et
    // remplir les champs provisoires (voir describeList)
    category: db.prepare('SELECT * FROM categories WHERE id = ?'),
    legacyCategory: db.prepare('SELECT id FROM categories WHERE is_shopping = ? ORDER BY id LIMIT 1').pluck(),
    store: db.prepare('SELECT * FROM stores WHERE id = ?'),
    userName: db.prepare('SELECT display_name FROM users WHERE id = ?').pluck(),
    activeUser: db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').pluck(),
    aisle: db.prepare('SELECT * FROM aisles WHERE id = ?'),
    allCategories: db.prepare('SELECT * FROM categories'),
    allStores: db.prepare('SELECT * FROM stores'),
    allAisles: db.prepare('SELECT * FROM aisles'),

    // Une liste non supprimée dont le compte est membre
    // (is_multi : 1 si c'est une liste de courses à magasin « multi »)
    memberList: db.prepare(`
      SELECT lists.*, list_members.access AS member_access,
        (lists.type = 'shopping' AND COALESCE(stores.is_multi, 0) = 1) AS is_multi
      FROM lists
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      LEFT JOIN stores ON stores.id = lists.store_id
      WHERE lists.id = :listId AND lists.deleted_at IS NULL
    `),
    // Un article non supprimé d'une liste non supprimée dont le compte est membre
    memberItem: db.prepare(`
      SELECT items.*, lists.type AS list_type, lists.store_id AS list_store_id,
        lists.owner_id AS list_owner_id, list_members.access AS member_access,
        lists.for_user_id AS list_for_user_id, lists.for_name AS list_for_name,
        lists.priority_enabled AS list_priority_enabled, lists.due_enabled AS list_due_enabled,
        (lists.type = 'shopping' AND COALESCE(stores.is_multi, 0) = 1) AS is_multi
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      LEFT JOIN stores ON stores.id = lists.store_id
      WHERE items.id = :itemId AND items.deleted_at IS NULL
    `),
    // Un article supprimé (pas encore effacé) d'une liste dont le compte est membre
    deletedItemForMember: db.prepare(`
      SELECT items.*, lists.owner_id AS list_owner_id, list_members.access AS member_access FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.id = :itemId AND items.deleted_at IS NOT NULL
    `),
    anyList: db.prepare('SELECT id FROM lists WHERE id = ?'),
    anyItem: db.prepare('SELECT id FROM items WHERE id = ?'),
    item: db.prepare('SELECT * FROM items WHERE id = ?'),
    members: db.prepare(`
      SELECT users.id, users.username, users.display_name, users.active, list_members.access
      FROM list_members JOIN users ON users.id = list_members.user_id
      WHERE list_members.list_id = ?
    `),
    // Mes listes (non supprimées), avec leur dernière activité
    myLists: db.prepare(`
      SELECT lists.*,
        MAX(lists.updated_at, COALESCE((SELECT MAX(updated_at) FROM items WHERE items.list_id = lists.id), '')) AS last_activity,
        (SELECT COUNT(*) FROM items WHERE items.list_id = lists.id AND items.deleted_at IS NULL AND items.checked = 0) AS remaining
      FROM lists JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = ?
      WHERE lists.deleted_at IS NULL
    `),
    liveItems: db.prepare('SELECT * FROM items WHERE list_id = ? AND deleted_at IS NULL'),
    // Magasins regroupés par un magasin « multi » (identifiants)
    memberStores: db.prepare('SELECT store_id FROM store_members WHERE multi_store_id = ?').pluck(),
    allStoreMembers: db.prepare('SELECT * FROM store_members'),
    // Toutes les lignes d'historique d'un article (générale et par magasin)
    history: db.prepare('SELECT * FROM item_history WHERE name_normalized = ?'),
    allHistory: db.prepare('SELECT * FROM item_history'),
    insertHistory: db.prepare(`
      INSERT INTO item_history (name_normalized, store_id, display_name, aisle_id, use_count, last_used_at)
      VALUES (:nameNormalized, :storeId, :name, :aisleId, :useCount, :lastUsedAt)
    `),
    updateHistory: db.prepare(`
      UPDATE item_history SET aisle_id = :aisleId, use_count = :useCount, last_used_at = :lastUsedAt
      WHERE id = :id
    `),
  };

  // --- Petits outils ---

  // Type demandé par une opération de liste : le champ listType (nouveau
  // téléphone ; « type » est déjà le nom de l'opération), sinon l'identifiant de catégorie d'une ancienne opération
  // (file d'attente hors ligne, téléphone qui n'a pas rechargé), traduit en
  // type : catégorie « courses » -> shopping, autre -> tasks. undefined si
  // l'opération ne demande rien.
  function requestedType(op) {
    let type;
    if (op.listType !== undefined) {
      if (!isListType(op.listType)) throw new OpError(400, 'Type de liste inconnu.');
      type = op.listType;
    } else if (op.categoryId !== undefined) {
      const category = parseId(op.categoryId) && q.category.get(parseId(op.categoryId));
      if (!category) throw new OpError(400, 'Type de liste inconnu.');
      type = category.is_shopping === 1 ? 'shopping' : 'tasks';
    } else {
      return undefined;
    }
    return type;
  }

  // lists.category_id reste obligatoire en base (colonne gardée pour pouvoir
  // revenir à l'image précédente) : on y écrit la première catégorie qui
  // correspond au type (courses ou non). La migration 18 garantit qu'il en
  // existe une de chaque sorte.
  function legacyCategoryId(type) {
    return q.legacyCategory.get(type === 'shopping' ? 1 : 0);
  }

  // Magasin actif, ou null si aucun n'est demandé
  function activeStoreOrNull(id) {
    if (id === undefined || id === null) return null;
    const store = parseId(id) && q.store.get(parseId(id));
    if (!store || store.active !== 1) throw new OpError(400, 'Magasin inconnu ou désactivé.');
    return store;
  }

  // Rayon actif, ou null pour « Sans rayon »
  function activeAisleOrNull(id) {
    if (id === null) return null;
    const aisle = parseId(id) && q.aisle.get(parseId(id));
    if (!aisle || aisle.active !== 1) throw new OpError(400, 'Rayon inconnu ou désactivé.');
    return aisle;
  }

  // Magasins proposés pour les articles d'une liste « multi » : ceux que
  // regroupe son magasin, et qui sont actifs
  function storeChoices(multiStoreId) {
    return q.memberStores.all(multiStoreId).filter((id) => q.store.get(id)?.active === 1);
  }

  // Magasin choisi pour un article d'une liste « multi » : vide (« Sans
  // magasin »), ou un des magasins regroupés par celui de la liste, actif.
  function chosenStore(value, multiStoreId) {
    if (value === null) return null;
    const id = parseId(value);
    if (!id || !storeChoices(multiStoreId).includes(id)) {
      throw new OpError(400, "Ce magasin n'est pas proposé pour cette liste (inconnu, désactivé ou non regroupé).");
    }
    return id;
  }

  // La liste, si le compte en est membre ; sinon 404 (comme si elle n'existait pas)
  function listForMember(user, listId) {
    const list = q.memberList.get({ userId: user.id, listId: requireUuid(listId, 'de liste') });
    if (!list) throw new OpError(404, LIST_NOT_FOUND);
    return list;
  }

  function listForOwner(user, listId) {
    const list = listForMember(user, listId);
    if (list.owner_id !== user.id) throw new OpError(403, OWNER_ONLY);
    return list;
  }

  function itemForMember(user, itemId) {
    const item = q.memberItem.get({ userId: user.id, itemId: requireUuid(itemId) });
    if (!item) throw new OpError(404, ITEM_NOT_FOUND);
    return item;
  }

  // Écritures : membre ET droit de modification (canEdit), sinon 403. Un
  // non-membre reçoit toujours le même 404 qu'avant (aucune fuite).
  function requireEdit(user, row) {
    if (!canEdit(user, row)) throw new OpError(403, READ_ONLY);
    return row;
  }
  const listForEditor = (user, listId) => requireEdit(user, listForMember(user, listId));
  const itemForEditor = (user, itemId) => requireEdit(user, itemForMember(user, itemId));

  // L'historique d'un article (toutes ses lignes), sous la forme utilisée par
  // les règles partagées (public/js/history.js)
  const historyOf = (name) => q.history.all(normalizeItemName(name)).map(describeHistory);

  // Enregistre les lignes modifiées par une règle partagée
  function saveHistory(entries) {
    for (const entry of entries) {
      if (entry.id) q.updateHistory.run(entry);
      else q.insertHistory.run(entry);
    }
  }

  // Met à jour l'historique commun, avec la règle partagée recordUse :
  // ligne générale (autocomplétion, rayon habituel) et ligne du magasin
  // (rayon habituel dans ce magasin, ou achat dans ce magasin pour une liste
  // « multi »). count = 1 pour un ajout, 0 pour une modification. Le nom
  // affiché reste celui de la première saisie (« LAIT » ne change pas « Lait »),
  // et un article « Sans rayon » n'efface pas un rayon habituel.
  function remember(name, { storeId = null, aisleId = null, count }) {
    saveHistory(recordUse(historyOf(name), { name, storeId, aisleId, count, now: nowIso() }));
  }

  // Rayon habituel (règle partagée) : d'abord celui de l'article dans ce
  // magasin, sinon son rayon général ; seulement s'il est encore actif
  function usualAisle(name, storeId) {
    return sharedUsualAisle(historyOf(name), name, storeId, (id) => q.aisle.get(id)?.active === 1);
  }

  // Magasin habituel (règle partagée) parmi les magasins proposés par la liste
  function usualStore(name, multiStoreId) {
    return sharedUsualStore(historyOf(name), name, storeChoices(multiStoreId));
  }

  // Changement de magasin d'une liste (ou passage en liste de courses) :
  // chaque article garde son rayon et son magasin ; seuls les champs vides
  // sont complétés par l'historique (règle choisie par le propriétaire) :
  // - liste « multi » : un article sans magasin, ou dont le magasin n'est pas
  //   regroupé par le nouveau, reçoit son magasin habituel s'il en a un ;
  // - liste à magasin simple : un article sans rayon reçoit son rayon habituel.
  function completeItems(listId) {
    const list = db.prepare(`
      SELECT lists.*, COALESCE(stores.is_multi, 0) AS store_is_multi
      FROM lists LEFT JOIN stores ON stores.id = lists.store_id WHERE lists.id = ?
    `).get(listId);
    if (!isShoppingList(list)) return;
    const now = nowIso();
    const setStore = db.prepare('UPDATE items SET store_id = ?, updated_at = ? WHERE id = ?');
    const setAisle = db.prepare('UPDATE items SET aisle_id = ?, updated_at = ? WHERE id = ?');
    for (const item of q.liveItems.all(listId)) {
      if (list.store_is_multi === 1) {
        if (item.store_id !== null && q.memberStores.all(list.store_id).includes(item.store_id)) continue;
        const storeId = usualStore(item.name, list.store_id);
        if (storeId !== null) setStore.run(storeId, now, item.id);
      } else if (item.aisle_id === null) {
        const aisleId = usualAisle(item.name, list.store_id);
        if (aisleId !== null) setAisle.run(aisleId, now, item.id);
      }
    }
  }

  // Une liste « multi » n'a pas de rayon ; une autre liste n'a pas de
  // magasin par article. Le téléphone qui enverrait le mauvais champ est refusé.
  // Priorité : une des trois valeurs, rien d'autre
  // Réglage « Priorité » ou « Échéance » d'une liste : vrai, faux, ou
  // undefined s'il n'est pas envoyé (rien ne change)
  function optionOf(value, label) {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new OpError(400, `Réglage « ${label} » invalide.`);
    return value;
  }

  function priorityOf(value) {
    if (!PRIORITIES.includes(value)) throw new OpError(400, 'Priorité inconnue (basse, normale ou élevée).');
    return value;
  }
  // Échéance : null efface ; sinon une vraie date AAAA-MM-JJ (une chaîne vide
  // n'est pas null : elle est refusée)
  function dueDateOf(value) {
    if (value === null) return null;
    if (!isDueDate(value)) throw new OpError(400, 'Échéance invalide (une date AAAA-MM-JJ entre 2000 et 2100, sans heure).');
    return value;
  }

  // Code-barres (listes de courses) : null efface ; sinon un code de 8, 12
  // ou 13 chiffres avec une clé de contrôle valide, gardé sous sa forme
  // normalisée (UPC-A → EAN-13). Une chaîne vide n'est pas null : refusée.
  function eanOf(value) {
    if (value === null) return null;
    const code = normalizeBarcode(value);
    if (!code) throw new OpError(400, 'Code-barres invalide : vérifiez les chiffres (8, 12 ou 13 chiffres).');
    return code;
  }
  // Refusé sur une liste autre que les courses (rien n'est écrit), vérifié
  // avant toute écriture
  function checkEanForList(isShopping, op) {
    if (!isShopping && op.ean !== undefined) {
      throw new OpError(400, 'Le code-barres ne se choisit que dans une liste de courses.');
    }
  }

  // Lien et prix : listes d'envies seulement ; une liste d'envies n'a pas
  // de quantité. Vérifié avant toute écriture.
  function checkWishFields(wishes, op) {
    if (!wishes && (op.link !== undefined || op.priceCents !== undefined)) {
      throw new OpError(400, 'Le lien et le prix ne se choisissent que dans une liste d\'envies.');
    }
    if (wishes && typeof op.quantity === 'string' && op.quantity.trim() !== '') {
      throw new OpError(400, 'Pas de quantité dans une liste d\'envies.');
    }
  }

  // « Reçu » (le coché) d'une liste d'envies : le bénéficiaire (compte) ou
  // le propriétaire seulement ; un proche ne peut pas le marquer
  function checkReceived(user, row, ownerId) {
    if (!isWishList(row.type ?? row.list_type)) return;
    const list = { ownerId, forUserId: row.for_user_id ?? row.list_for_user_id ?? null, forName: row.for_name ?? row.list_for_name ?? null };
    if (!mayMarkReceived(user.id, list)) {
      throw new OpError(403, 'Seul le bénéficiaire ou le propriétaire de la liste marque un souhait comme reçu.');
    }
  }

  function checkFieldsForList(multi, op) {
    if (multi && op.aisleId !== undefined && op.aisleId !== null) {
      throw new OpError(400, "Pas de rayon dans une liste « multi » : choisissez le magasin de l'article.");
    }
    if (!multi && op.storeId !== undefined && op.storeId !== null) {
      throw new OpError(400, 'Le magasin ne se choisit que dans une liste « multi ».');
    }
  }

  // --- Mise en forme des réponses ---

  const describeItem = (item) => ({
    id: item.id,
    listId: item.list_id,
    name: item.name,
    quantity: item.quantity,
    note: item.note,
    aisleId: item.aisle_id,
    storeId: item.store_id,
    photoAt: item.photo_at,
    priority: item.priority ?? 'normal',
    dueDate: item.due_date ?? null,
    ean: item.ean ?? null,
    // Liste d'envies : lien web et prix indicatif (centimes)
    link: item.link ?? null,
    priceCents: item.price_cents ?? null,
    checked: item.checked === 1,
    checkedAt: item.checked_at ?? null,
    createdBy: item.created_by,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    deletedAt: item.deleted_at,
  });

  function describeList(list, user) {
    const type = typeOf(list);
    const shopping = isShoppingList(type);
    const storeRow = list.store_id === null ? null : q.store.get(list.store_id);
    const store = storeRow && { id: storeRow.id, name: storeRow.name, active: storeRow.active === 1, isMulti: storeRow.is_multi === 1 };
    const category = q.category.get(list.category_id);
    const rows = q.members.all(list.id);
    // access : le droit de chaque personne (le propriétaire : toujours
    // « modification ») ; canEdit : le droit du compte connecté
    const members = rows.map((m) => ({
      id: m.id, username: m.username, displayName: m.display_name, active: m.active === 1, isOwner: m.id === list.owner_id,
      access: m.id === list.owner_id ? 'modification' : m.access,
    }));
    const mine = rows.find((m) => m.id === user.id);
    // Liste d'envies : à qui elle est destinée (rien de secret ; les
    // réservations, elles, ne sont jamais ici : voir server/reservations.js)
    const wishes = isWishList(type) ? {
      forUserId: list.for_user_id ?? null,
      forName: list.for_name ?? null,
      forDisplayName: list.for_user_id ? q.userName.get(list.for_user_id) ?? null : null,
      isBeneficiary: beneficiaryId(wishListOf(list)) === user.id,
    } : {};
    return {
      id: list.id,
      name: list.name,
      ...wishes,
      // Icône choisie (« » : celle du type)
      icon: isListIcon(list.icon) ? list.icon : '',
      type,
      // Magasin : seulement si le type s'en sert. Une liste de tâches qui a
      // été une liste de courses garde son magasin en base, caché ici ;
      // keptStore le donne au seul propriétaire, pour que « Modifier la
      // liste » le remette s'il revient à Courses (rien d'autre ne le lit).
      store: shopping ? store : null,
      ...(!shopping && store && list.owner_id === user.id ? { keptStore: store } : {}),
      // PROVISOIRE : catégorie, pour les téléphones qui n'ont pas encore
      // rechargé (l'ancien code lit list.category.isShopping). Le nouveau
      // code ne la lit pas. À retirer avec le nettoyage, quand plus aucun
      // téléphone n'a l'ancien code.
      category: {
        id: category?.id ?? null,
        name: category?.name ?? TYPE_LABELS[type],
        isShopping: shopping,
        active: category ? category.active === 1 : true,
      },
      ownerId: list.owner_id,
      isOwner: list.owner_id === user.id,
      canEdit: canEdit(user, { owner_id: list.owner_id, member_access: mine?.access }),
      // Priorité et échéance activées pour cette liste (seule une liste de
      // tâches s'en sert ; les autres types les gardent, ignorées)
      priorityEnabled: list.priority_enabled === 1,
      dueEnabled: list.due_enabled === 1,
      // « Après l'ajout » : 'quick' (rester sur la liste) ou 'detail' (ouvrir la fiche)
      addMode: list.add_mode === 'detail' ? 'detail' : 'quick',
      // Lien public en cours ({ expiresAt } ou null) : pour le propriétaire seulement
      ...(list.owner_id === user.id && ctx.shares ? { publicLink: ctx.shares.badgeFor(list.id) } : {}),
      members,
      remaining: list.remaining,
      lastActivity: list.last_activity,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      deletedAt: list.deleted_at,
    };
  }

  const describeReference = (row) => ({
    id: row.id,
    name: row.name,
    active: row.active === 1,
    ...(row.is_shopping !== undefined ? { isShopping: row.is_shopping === 1 } : {}),
  });

  // Magasins : type (simple ou « multi ») et magasins regroupés
  function describeStores() {
    const members = new Map();
    for (const row of q.allStoreMembers.all()) {
      if (!members.has(row.multi_store_id)) members.set(row.multi_store_id, []);
      members.get(row.multi_store_id).push(row.store_id);
    }
    return q.allStores.all().map((row) => ({
      ...describeReference(row),
      isMulti: row.is_multi === 1,
      storeIds: row.is_multi === 1 ? members.get(row.id) ?? [] : [],
    }));
  }

  const describeHistory = (row) => ({
    id: row.id,
    name: row.display_name,
    nameNormalized: row.name_normalized,
    storeId: row.store_id,
    aisleId: row.aisle_id,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
  });

  // Listes modifiées par l'opération en cours : leurs membres sont prévenus
  // (temps réel) seulement après l'écriture réussie en base.
  const touched = new Set();
  const changed = (listId) => touched.add(listId);
  // Changements qui ne regardent que la personne connectée (repère de
  // lecture, sourdine, réglages des nouveautés) : seuls ses propres appareils
  // sont prévenus (listId null : aucun en particulier)
  const touchedMine = new Set();
  const changedForMe = (listId) => touchedMine.add(listId);
  function notifyTouched(user) {
    for (const listId of touched) ctx.events?.notifyList(listId);
    for (const listId of touchedMine) ctx.events?.notifyUsers([user.id], listId);
    touched.clear();
    touchedMine.clear();
  }

  // --- Les opérations ---
  // Chacune reçoit le compte connecté et l'opération envoyée, vérifie les
  // droits et les champs, puis modifie la base. Elle renvoie ce qu'il faut
  // répondre au téléphone, ou lève une OpError.

  const handlers = {
    // Créer une liste : le créateur en est le propriétaire et le premier membre
    'list.create'(user, op) {
      const id = requireUuid(op.listId, 'de liste');
      if (q.anyList.get(id)) throw new OpError(409, 'Cette liste existe déjà.');
      const name = listName(op.name);
      const type = requestedType(op);
      if (type === undefined) throw new OpError(400, 'Type de liste inconnu.');
      const store = activeStoreOrNull(op.storeId);
      if (store && !isShoppingList(type)) {
        throw new OpError(400, 'Un magasin ne se choisit que pour une liste de courses.');
      }
      // Liste d'envies : « Pour qui ? », fixé ici pour toujours. Un autre
      // compte actif (forUserId), une personne sans compte (forName), ou ni
      // l'un ni l'autre : « Moi » (le propriétaire est le bénéficiaire).
      let forUserId = null;
      let forName = null;
      if (op.forUserId !== undefined && op.forUserId !== null) {
        if (!isWishList(type)) throw new OpError(400, '« Pour qui ? » ne se choisit que pour une liste d\'envies.');
        forUserId = parseId(op.forUserId);
        if (!forUserId || !q.activeUser.get(forUserId)) throw new OpError(400, 'Utilisateur inconnu ou désactivé.');
        if (forUserId === user.id) forUserId = null; // « Moi »
      }
      if (op.forName !== undefined && op.forName !== null) {
        if (!isWishList(type)) throw new OpError(400, '« Pour qui ? » ne se choisit que pour une liste d\'envies.');
        if (forUserId) throw new OpError(400, 'Choisissez un compte ou une personne sans compte, pas les deux.');
        forName = forNameOf(op.forName);
      }
      // Priorité et échéance : désactivées sauf demande explicite
      const priorityOn = optionOf(op.priorityEnabled, 'Priorité') ?? false;
      const dueOn = optionOf(op.dueEnabled, 'Échéance') ?? false;
      const icon = listIconOf(op.icon) ?? ''; // rien de choisi : icône du type
      // « Après l'ajout » : sans choix, « Rester sur la liste » pour une liste
      // de courses, « Ouvrir la fiche » pour les autres
      const addMode = addModeOf(op.addMode) ?? (isShoppingList(type) ? 'quick' : 'detail');
      const now = nowIso();
      db.prepare('INSERT INTO lists (id, name, type, category_id, store_id, owner_id, priority_enabled, due_enabled, icon, add_mode, for_user_id, for_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, name, type, legacyCategoryId(type), store?.id ?? null, user.id, Number(priorityOn), Number(dueOn), icon, addMode, forUserId, forName, now, now);
      db.prepare("INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, 'modification')").run(id, user.id);
      news.startReading(id, user.id);
      // Le compte bénéficiaire est membre d'office, en « Peut modifier » : il
      // ouvre sa liste et y ajoute ses souhaits (il ne verra jamais les réservations)
      if (forUserId) {
        db.prepare("INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, 'modification')").run(id, forUserId);
        news.startReading(id, forUserId);
      }
      changed(id);
      ctx.audit('liste_creee', { utilisateur: user.username, liste: id });
      return { list: describeList(q.myLists.all(user.id).find((l) => l.id === id), user) };
    },

    // Renommer, changer de type, de magasin ou d'icône, activer ou non la
    // priorité et l'échéance, choisir « Après l'ajout » (propriétaire
    // seulement : contributeur et invité 403, non-membre 404 ; changer de
    // type ne change pas ce dernier choix). Un magasin désactivé reste
    // accepté s'il est déjà celui de la liste ; pour en changer, le nouveau
    // doit être actif.
    // Changer de type n'efface RIEN : une liste de courses qui devient une
    // liste de tâches garde son magasin (caché, voir describeList), ses
    // rayons et ses codes-barres ; une liste de tâches qui devient une liste
    // de courses garde ses réglages et ses valeurs de priorité et d'échéance
    // (ignorés). Tout réapparaît au retour au type d'origine.
    // Listes d'envies : ni changement de type (dans un sens ou dans l'autre),
    // ni changement de bénéficiaire (l'ancien bénéficiaire verrait d'un coup
    // toutes les réservations).
    'list.update'(user, op) {
      const list = listForOwner(user, op.listId);
      if (op.forUserId !== undefined || op.forName !== undefined) {
        throw new OpError(400, 'La personne à qui la liste est destinée ne change pas.');
      }
      if ([op.name, op.listType, op.categoryId, op.storeId, op.priorityEnabled, op.dueEnabled, op.icon, op.addMode].every((value) => value === undefined)) {
        throw new OpError(400, 'Rien à modifier.');
      }
      const priorityOn = optionOf(op.priorityEnabled, 'Priorité') ?? list.priority_enabled === 1;
      const dueOn = optionOf(op.dueEnabled, 'Échéance') ?? list.due_enabled === 1;
      const name = op.name === undefined ? list.name : listName(op.name);
      const icon = listIconOf(op.icon) ?? list.icon;
      const addMode = addModeOf(op.addMode) ?? list.add_mode;

      const before = typeOf(list);
      let type;
      if (isWishList(before)) {
        // Un ancien téléphone envoie toujours un identifiant de catégorie
        // (traduit en « tâches ») : il est ignoré ; seul un listType
        // différent est refusé
        if (op.listType !== undefined && op.listType !== 'wishes') throw new OpError(400, WISHES_FIXED);
        type = before;
      } else {
        type = requestedType(op) ?? before;
        if (isWishList(type)) throw new OpError(400, NOT_TO_WISHES);
      }
      const categoryId = type === before ? list.category_id : legacyCategoryId(type);

      let storeId = list.store_id;
      if (isShoppingList(type)) {
        if (op.storeId !== undefined) {
          if (op.storeId !== null && !parseId(op.storeId)) throw new OpError(400, 'Magasin inconnu ou désactivé.');
          const wanted = op.storeId === null ? null : parseId(op.storeId);
          if (wanted !== list.store_id) storeId = activeStoreOrNull(wanted)?.id ?? null;
        }
      } else if (op.storeId !== undefined && op.storeId !== null) {
        // Pas de magasin à choisir pour une liste qui n'est pas de courses ;
        // « aucun magasin » (envoyé par un ancien téléphone) est ignoré : le
        // magasin conservé n'est pas effacé
        throw new OpError(400, 'Un magasin ne se choisit que pour une liste de courses.');
      }

      db.prepare('UPDATE lists SET name = ?, type = ?, category_id = ?, store_id = ?, priority_enabled = ?, due_enabled = ?, icon = ?, add_mode = ?, updated_at = ? WHERE id = ?')
        .run(name, type, categoryId, storeId, Number(priorityOn), Number(dueOn), icon, addMode, nowIso(), list.id);
      if (isShoppingList(type) && (storeId !== list.store_id || type !== before)) completeItems(list.id);
      if (type !== before) ctx.audit('liste_type_change', { utilisateur: user.username, liste: list.id, avant: before, apres: type });
      changed(list.id);
      return {};
    },

    // Supprimer une liste (propriétaire seulement). Suppression logique : les
    // autres téléphones l'apprendront à leur prochaine synchronisation.
    'list.delete'(user, op) {
      const list = listForOwner(user, op.listId);
      const now = nowIso();
      db.prepare('UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, list.id);
      news.dropList(list.id); // son journal disparaît avec elle
      changed(list.id);
      ctx.audit('liste_supprimee', { utilisateur: user.username, liste: list.id });
      // Son lien public s'arrête avec elle
      const share = ctx.shares?.stopForList(list.id);
      if (share) ctx.audit('lien_public_arrete', { utilisateur: user.username, liste: list.id, partage: share.id, raison: 'liste supprimée' });
      return {};
    },

    // Retirer les cochés (« Retirer du panier » / « Retirer les terminés ») :
    // supprime les articles cochés de cette liste, au moment où le serveur
    // reçoit l'opération. Tout membre de la liste peut le faire.
    // seulement. L'historique d'autocomplétion n'est pas touché.
    'list.removeChecked'(user, op) {
      const list = listForEditor(user, op.listId);
      const now = nowIso();
      const ids = db.prepare('SELECT id FROM items WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL').pluck().all(list.id);
      const { changes } = db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL')
        .run(now, now, list.id);
      news.log(list.id, user.id, 'delete', ids);
      if (changes) changed(list.id);
      return { removed: changes };
    },

    // Ancien nom de « list.removeChecked » : une modification restée en file
    // d'attente sur un téléphone pendant la mise à jour est encore acceptée
    'list.clearChecked'(user, op) {
      return handlers['list.removeChecked'](user, op);
    },

    // Tout décocher (« Tout remettre à acheter » / « Tout rouvrir ») : une
    // seule opération, quel que soit le nombre de cochés. Chaque article
    // décoché reçoit une nouvelle date de modification (synchronisation des
    // autres téléphones). Porte sur les articles cochés au moment où le
    // serveur reçoit l'opération. Tout membre de la liste peut le faire.
    'list.uncheckAll'(user, op) {
      const list = listForEditor(user, op.listId);
      checkReceived(user, list, list.owner_id);
      const ids = db.prepare('SELECT id FROM items WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL').pluck().all(list.id);
      const { changes } = db.prepare('UPDATE items SET checked = 0, checked_at = NULL, updated_at = ? WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL')
        .run(nowIso(), list.id);
      news.log(list.id, user.id, 'uncheck', ids);
      if (changes) changed(list.id);
      return { reopened: changes };
    },

    // Ajouter un article.
    // - liste à magasin simple : sans rayon précisé, un article déjà connu
    //   reprend son rayon habituel (celui de ce magasin, sinon le général) ;
    // - liste « multi » : pas de rayon ; sans magasin précisé, un article
    //   déjà acheté dans un des magasins de la liste reprend son magasin habituel.
    'item.create'(user, op) {
      const list = listForEditor(user, op.listId);
      const id = requireUuid(op.itemId);
      if (q.anyItem.get(id)) throw new OpError(409, 'Cet identifiant est déjà utilisé.');
      const name = itemName(op.name);
      checkFieldsForList(list.is_multi === 1, op);
      checkEanForList(isShoppingList(list), op);
      checkWishFields(isWishList(list), op);
      const ean = op.ean === undefined ? null : eanOf(op.ean);
      const link = linkOf(op.link) ?? null;
      const priceCents = priceOf(op.priceCents) ?? null;
      let aisleId = null;
      let storeId = null;
      if (list.is_multi === 1) {
        storeId = op.storeId === undefined ? usualStore(name, list.store_id) : chosenStore(op.storeId, list.store_id);
      } else if (isShoppingList(list)) {
        aisleId = op.aisleId === undefined ? usualAisle(name, list.store_id) : activeAisleOrNull(op.aisleId)?.id ?? null;
      }
      const now = nowIso();
      db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, aisle_id, store_id, ean, link, price_cents, created_by, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, list.id, name, quantity(op.quantity), note(op.note), aisleId, storeId, ean, link, priceCents, user.id, now, now);
      // Historique (listes de courses seulement) : magasin de l'article
      // (« multi ») ou magasin de la liste (simple)
      if (isShoppingList(list)) remember(name, { storeId: list.is_multi === 1 ? storeId : list.store_id, aisleId, count: 1 });
      news.log(list.id, user.id, 'add', [id]);
      changed(list.id);
      return { item: describeItem(q.item.get(id)) };
    },

    // Modifier un article (nom, quantité, note, rayon ou magasin ; code-barres
    // dans une liste de courses ; priorité et échéance hors listes de
    // courses). Un champ absent de l'opération ne change pas (un téléphone
    // qui ne connaît pas encore la priorité ou le code-barres ne les remet
    // pas à zéro) ; dueDate: null efface l'échéance, ean: null le code. Le nouveau
    // rayon, ou le nouveau nom, est mémorisé pour les prochains ajouts ; dans
    // une liste « multi », un changement de magasin reporte l'achat sur le
    // nouveau magasin (il devient le magasin habituel s'il est le plus fréquent).
    'item.update'(user, op) {
      const item = itemForEditor(user, op.itemId);
      const multi = item.is_multi === 1;
      checkFieldsForList(multi, op);
      // Priorité et échéance : listes de tâches seulement (rien n'est écrit),
      // vérifiées avant toute écriture
      if (!usesTaskOptions(item.list_type) && (op.priority !== undefined || op.dueDate !== undefined)) {
        throw new OpError(400, 'La priorité et l\'échéance ne se choisissent que dans une liste de tâches.');
      }
      checkWishFields(isWishList(item.list_type), op);
      // Réglage de la liste désactivé (relu dans la base) : refus, rien n'est écrit
      if (op.priority !== undefined && item.list_priority_enabled !== 1) throw new OpError(400, PRIORITY_OFF);
      if (op.dueDate !== undefined && item.list_due_enabled !== 1) throw new OpError(400, DUE_OFF);
      checkEanForList(isShoppingList(item.list_type), op);
      const ean = op.ean === undefined ? item.ean : eanOf(op.ean);
      const priority = op.priority === undefined ? item.priority : priorityOf(op.priority);
      const dueDate = op.dueDate === undefined ? item.due_date : dueDateOf(op.dueDate);
      const name = op.name === undefined ? item.name : itemName(op.name);
      const qty = op.quantity === undefined ? item.quantity : quantity(op.quantity);
      const text = op.note === undefined ? item.note : note(op.note);
      const link = op.link === undefined ? item.link : linkOf(op.link);
      const priceCents = op.priceCents === undefined ? item.price_cents : priceOf(op.priceCents);
      let aisleId = item.aisle_id;
      if (op.aisleId !== undefined && isShoppingList(item.list_type) && !multi) {
        if (op.aisleId !== null && !parseId(op.aisleId)) throw new OpError(400, 'Rayon inconnu ou désactivé.');
        // Un rayon désactivé peut être gardé, pas choisi
        const wanted = op.aisleId === null ? null : parseId(op.aisleId);
        if (wanted !== item.aisle_id) aisleId = activeAisleOrNull(wanted)?.id ?? null;
      }
      let storeId = item.store_id;
      if (op.storeId !== undefined && multi) {
        // Un magasin désactivé ou retiré du « multi » peut être gardé, pas choisi
        const wanted = op.storeId === null ? null : parseId(op.storeId);
        if (wanted !== item.store_id) storeId = chosenStore(op.storeId, item.list_store_id);
      }
      if ([op.name, op.quantity, op.note, op.aisleId, op.storeId, op.priority, op.dueDate, op.ean, op.link, op.priceCents].every((value) => value === undefined)) {
        throw new OpError(400, 'Rien à modifier.');
      }
      db.prepare('UPDATE items SET name = ?, quantity = ?, note = ?, aisle_id = ?, store_id = ?, priority = ?, due_date = ?, ean = ?, link = ?, price_cents = ?, updated_at = ? WHERE id = ?')
        .run(name, qty, text, aisleId, storeId, priority, dueDate, ean, link, priceCents, nowIso(), item.id);

      // Historique : listes de courses seulement (une liste « multi » en est une)
      if (multi) {
        if (name !== item.name) remember(name, { storeId, count: 0 });
        else if (storeId !== item.store_id) saveHistory(moveUse(historyOf(name), { name, from: item.store_id, to: storeId, now: nowIso() }));
      } else if (isShoppingList(item.list_type) && (name !== item.name || aisleId !== item.aisle_id)) {
        remember(name, { storeId: item.list_store_id, aisleId, count: 0 });
      }
      news.log(item.list_id, user.id, 'update', [item.id]);
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Cocher ou décocher un article
    'item.check'(user, op) {
      const item = itemForEditor(user, op.itemId);
      if (typeof op.checked !== 'boolean') throw new OpError(400, 'Valeur « checked » invalide (true ou false).');
      checkReceived(user, item, item.list_owner_id);
      // Date du coché : posée au premier coché (un second « cocher » la
      // garde), effacée au décoché
      const now = nowIso();
      db.prepare('UPDATE items SET checked = ?, checked_at = CASE WHEN ? = 1 THEN COALESCE(checked_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?')
        .run(op.checked ? 1 : 0, op.checked ? 1 : 0, now, now, item.id);
      news.log(item.list_id, user.id, op.checked ? 'check' : 'uncheck', [item.id]);
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Supprimer un article (suppression logique ; l'historique reste). Sa
    // photo est gardée jusqu'au nettoyage (30 jours) : « Annuler » la retrouve.
    'item.delete'(user, op) {
      const item = itemForEditor(user, op.itemId);
      const now = nowIso();
      db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, item.id);
      news.log(item.list_id, user.id, 'delete', [item.id]);
      changed(item.list_id);
      return {};
    },

    // Remettre un article supprimé (« Annuler »), avec sa photo, tant qu'il
    // n'a pas été effacé par le nettoyage. Membres de la liste seulement.
    'item.restore'(user, op) {
      const item = q.deletedItemForMember.get({ userId: user.id, itemId: requireUuid(op.itemId) });
      if (!item) throw new OpError(404, ITEM_NOT_FOUND);
      requireEdit(user, item);
      // « Annuler » une suppression : rien dans le journal (ni nouveauté, ni
      // suppression ; décision du 30 octobre 2026)
      db.prepare('UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), item.id);
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // --- Nouveautés (server/news.js) : propres à chaque personne ---
    // Tout membre de la liste, invité en lecture seule compris (ce n'est pas
    // une modification de la liste) ; non-membre : « Liste introuvable ».

    // « Vu » : mon repère de lecture monte jusqu'à upTo (numéro du dernier
    // événement connu du téléphone) ; jamais vers le bas, rejouable sans
    // effet (file d'attente hors ligne)
    'list.seen'(user, op) {
      const list = listForMember(user, op.listId);
      if (!Number.isSafeInteger(op.upTo) || op.upTo < 0) throw new OpError(400, 'Repère de lecture invalide.');
      if (news.markSeen(list.id, user.id, op.upTo)) changedForMe(list.id);
      return {};
    },

    // « Ne plus me signaler cette liste » (muted: true) / « Signaler cette liste »
    'list.mute'(user, op) {
      const list = listForMember(user, op.listId);
      if (typeof op.muted !== 'boolean') throw new OpError(400, 'Réglage « Ne plus me signaler cette liste » invalide.');
      if (news.setMuted(list.id, user.id, op.muted)) changedForMe(list.id);
      return {};
    },

    // Réglages du compte : « Nouveautés » (enabled), « Signaler les éléments
    // cochés » (checks)
    'account.news'(user, op) {
      for (const [value, label] of [[op.enabled, 'Nouveautés'], [op.checks, 'Signaler les éléments cochés']]) {
        if (value !== undefined && typeof value !== 'boolean') throw new OpError(400, `Réglage « ${label} » invalide.`);
      }
      if (op.enabled === undefined && op.checks === undefined) throw new OpError(400, 'Rien à modifier.');
      if (news.setSettings(user.id, { enabled: op.enabled, checks: op.checks })) changedForMe(null);
      return {};
    },
  };

  // --- Lot d'opérations (POST /api/ops) ---
  //
  // Les opérations sont appliquées dans l'ordre, chacune dans un bloc
  // indivisible. Le résultat de chacune est enregistré avec son identifiant :
  // une opération renvoyée une deuxième fois (après une coupure réseau) n'est
  // pas appliquée de nouveau, on renvoie simplement le premier résultat.

  const findApplied = db.prepare('SELECT * FROM applied_ops WHERE id = ?');
  const saveApplied = db.prepare('INSERT INTO applied_ops (id, user_id, result, applied_at) VALUES (?, ?, ?, ?)');

  function applyOne(user, op) {
    if (!op || typeof op !== 'object' || Array.isArray(op) || !isUuid(op.id)) {
      return { id: op?.id ?? null, status: 400, error: "Identifiant d'opération invalide." };
    }
    const opId = op.id.toLowerCase();
    const previous = findApplied.get(opId);
    if (previous) {
      if (previous.user_id !== user.id) return { id: opId, status: 409, error: "Identifiant d'opération déjà utilisé." };
      return { ...JSON.parse(previous.result), duplicate: true };
    }

    const handler = Object.hasOwn(handlers, op.type) ? handlers[op.type] : null;
    let result;
    touched.clear();
    touchedMine.clear();
    try {
      result = db.transaction(() => {
        if (!handler) throw new OpError(400, "Type d'opération inconnu.");
        const value = { id: opId, status: 200, ...handler(user, op) };
        saveApplied.run(opId, user.id, JSON.stringify(value), nowIso());
        return value;
      })();
      notifyTouched(user); // écriture réussie : les membres sont prévenus
    } catch (err) {
      touched.clear(); // refus ou panne : rien n'a changé, personne n'est prévenu
      touchedMine.clear();
      if (!(err instanceof OpError)) throw err; // vraie panne : erreur 500
      // Un refus est lui aussi mémorisé : renvoyée, l'opération donnera le
      // même refus (sans rien modifier).
      result = { id: opId, status: err.status, error: err.message };
      saveApplied.run(opId, user.id, JSON.stringify(result), nowIso());
    }
    return result;
  }

  function applyOps(user, ops) {
    return ops.map((op) => applyOne(user, op));
  }

  // --- Lectures ---

  // Mes listes, de la plus récemment active à la plus ancienne
  function myLists(user) {
    return q.myLists.all(user.id)
      .sort((a, b) => b.last_activity.localeCompare(a.last_activity))
      .map((list) => describeList(list, user));
  }

  // Une liste avec ses articles groupés et triés ; null si pas membre
  function readList(user, listId) {
    if (!isUuid(listId)) return null;
    const list = q.myLists.all(user.id).find((l) => l.id === listId.toLowerCase());
    if (!list) return null;
    const shopping = isShoppingList(list);
    const aisles = q.allAisles.all();
    const items = q.liveItems.all(list.id).map(describeItem);
    const byStore = shopping && list.store_id !== null && q.store.get(list.store_id).is_multi === 1;
    const groups = groupItems(items, aisles, shopping, { byStore, stores: q.allStores.all() });
    // Réservations : seulement pour ceux qui ont le droit de les voir ; pour
    // le bénéficiaire, le champ n'existe pas
    const booked = reservations.forList(user, list);
    return { list: describeList(list, user), groups, ...(booked ? { reservations: booked } : {}) };
  }

  // Suggestions d'autocomplétion (même règle que sur le téléphone). Le rayon
  // proposé n'est donné que s'il est encore actif. Avec une liste (listId) :
  // aucune suggestion si ce n'est pas une liste de courses (la liste doit
  // être une des miennes).
  function suggestions(typed, { user, listId } = {}) {
    if (listId !== undefined && !isShoppingList(listForMember(user, listId))) return [];
    const activeAisles = new Set(q.allAisles.all().filter((a) => a.active === 1).map((a) => a.id));
    return suggest(q.allHistory.all().map(describeHistory), typed).map((entry) => ({
      name: entry.name,
      aisleId: activeAisles.has(entry.aisleId) ? entry.aisleId : null,
      useCount: entry.useCount,
    }));
  }

  // --- Synchronisation : « tout ce qui a changé depuis tel instant » ---
  //
  // Le téléphone envoie l'heure « serverTime » reçue lors de sa synchro
  // précédente (heure du serveur, jamais celle du téléphone). On renvoie :
  // - les listes dont je suis membre modifiées depuis (suppressions comprises),
  //   avec tous leurs articles si la liste elle-même a changé (cas d'une liste
  //   qui vient d'être partagée avec moi) ;
  // - les articles modifiés ou supprimés depuis, dans mes listes ;
  // - listIds : toutes mes listes actuelles (une liste absente de ce tableau
  //   n'est plus accessible : supprimée, ou je n'en suis plus membre) ;
  // - les données de référence et l'historique (changé depuis).
  // Comparaison « >= » : une ligne peut revenir deux fois, jamais être oubliée.
  function changesSince(user, since) {
    const serverTime = nowIso();
    const from = since ?? '';
    const lists = db.prepare(`
      SELECT lists.* FROM lists JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = ?
      WHERE lists.updated_at >= ?
    `).all(user.id, from);
    const items = db.prepare(`
      SELECT items.* FROM items JOIN list_members ON list_members.list_id = items.list_id AND list_members.user_id = ?
      WHERE items.updated_at >= ?
    `).all(user.id, from);
    const seen = new Set(items.map((item) => item.id));
    for (const list of lists) {
      for (const item of db.prepare('SELECT * FROM items WHERE list_id = ?').all(list.id)) {
        if (!seen.has(item.id)) items.push(item);
      }
    }
    // Résumés (articles restants, dernière activité) de mes listes actuelles
    const summaries = new Map(q.myLists.all(user.id).map((l) => [l.id, l]));
    return {
      serverTime,
      lists: lists.map((list) => describeList({ remaining: 0, last_activity: list.updated_at, ...list, ...summaries.get(list.id) }, user)),
      listIds: [...summaries.keys()],
      items: items.map(describeItem),
      // PROVISOIRE (voir describeList) : catégories, pour les téléphones qui
      // n'ont pas encore rechargé ; le nouveau code ne les lit pas
      categories: q.allCategories.all().map(describeReference),
      stores: describeStores(),
      aisles: q.allAisles.all().map(describeReference),
      history: db.prepare('SELECT * FROM item_history WHERE last_used_at >= ?').all(from).map(describeHistory),
      // Comptes actifs (choix des personnes avec qui partager), gardés sur le téléphone pour
      // ouvrir le formulaire de liste sans réseau
      users: activeUsers(),
      // Mes nouveautés, en entier à chaque synchronisation (server/news.js)
      news: news.newsFor(user),
      // Réservations des listes d'envies où ce compte a le droit de les voir,
      // en entier à chaque synchronisation (une libération disparaît donc
      // d'elle-même) ; jamais celles d'une liste dont il est le bénéficiaire
      reservations: reservations.forUser(user),
    };
  }

  // --- Partage (PUT /api/lists/:id/members, propriétaire seulement) ---
  //
  // userIds : la liste complète des personnes souhaitées. Le propriétaire reste
  // toujours membre. Un compte désactivé ne peut pas être ajouté (mais un
  // membre déjà présent et désactivé depuis peut rester).
  // access (facultatif) : { "<id d'un membre>": "modification" | "lecture" }.
  // Une personne ajoutée sans droit précisé est en lecture seule ; un membre déjà
  // présent sans droit précisé garde le sien. Le propriétaire ne peut pas
  // recevoir de droit (il les a tous).
  function setMembers(user, listId, userIds, access = {}) {
    const list = listForOwner(user, listId);
    if (!Array.isArray(userIds) || userIds.length > 50 || !userIds.every((id) => parseId(id))) {
      throw new OpError(400, 'Liste des personnes invalide.');
    }
    if (access === null || typeof access !== 'object' || Array.isArray(access)) throw new OpError(400, 'Droits des personnes invalides.');
    const wanted = new Set(userIds.map(Number));
    wanted.delete(list.owner_id);
    const rights = new Map();
    for (const [key, value] of Object.entries(access)) {
      const id = parseId(key);
      if (!id || !ACCESS.includes(value)) throw new OpError(400, 'Droits des personnes invalides.');
      if (id === list.owner_id) throw new OpError(400, 'Le propriétaire a tous les droits sur sa liste.');
      if (!wanted.has(id)) throw new OpError(400, 'Droit donné à une personne avec qui la liste n\'est pas partagée.');
      rights.set(id, value);
    }
    const before = new Map(q.members.all(list.id).filter((m) => m.id !== list.owner_id).map((m) => [m.id, m.access]));
    const current = new Set(before.keys());
    // Liste d'envies pour un autre compte : le bénéficiaire reste membre, en
    // « Peut modifier » ; le propriétaire ne peut ni le retirer, ni le mettre
    // en lecture seule. Il peut quitter la liste lui-même ; s'il est rajouté,
    // c'est toujours en « Peut modifier ».
    const beneficiary = list.for_user_id ?? null;
    if (beneficiary) {
      if (current.has(beneficiary) && !wanted.has(beneficiary)) throw new OpError(400, 'La personne à qui la liste est destinée ne peut pas en être retirée.');
      if (rights.has(beneficiary) && rights.get(beneficiary) !== 'modification') throw new OpError(400, 'La personne à qui la liste est destinée garde le droit « Peut modifier ».');
      if (wanted.has(beneficiary)) rights.set(beneficiary, 'modification');
    }

    for (const id of wanted) {
      if (current.has(id)) continue;
      const guest = db.prepare('SELECT id, active FROM users WHERE id = ?').get(id);
      if (!guest || guest.active !== 1) throw new OpError(400, 'Utilisateur inconnu ou désactivé.');
    }

    const added = [...wanted].filter((id) => !current.has(id));
    const removed = [...current].filter((id) => !wanted.has(id));
    const nameOf = (id) => db.prepare('SELECT username FROM users WHERE id = ?').pluck().get(id);
    // Droits qui changent pour des membres déjà présents
    const changedRights = [...rights].filter(([id, value]) => current.has(id) && before.get(id) !== value);
    db.transaction(() => {
      // Sans droit précisé : lecture seule (valeur par défaut de la base)
      for (const id of added) {
        db.prepare('INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, ?)').run(list.id, id, rights.get(id) ?? 'lecture');
        news.startReading(list.id, id); // son repère démarre à son arrivée
      }
      for (const id of removed) {
        db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?').run(list.id, id);
        news.stopReading(list.id, id);
      }
      for (const [id, value] of changedRights) db.prepare('UPDATE list_members SET access = ? WHERE list_id = ? AND user_id = ?').run(value, list.id, id);
      // La liste « change » : les membres l'apprendront à leur synchronisation
      // (et chacun son droit, dans la description de la liste)
      if (added.length || removed.length || changedRights.length) db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(nowIso(), list.id);
    })();
    // Temps réel : membres actuels, et personnes retirées (leur téléphone
    // apprend ainsi qu'il n'a plus accès à la liste)
    if (added.length || removed.length || changedRights.length) ctx.events?.notifyList(list.id, { alsoUsers: removed });
    for (const id of added) ctx.audit('liste_partage_ajoute', { utilisateur: user.username, liste: list.id, personne: nameOf(id), droit: rights.get(id) ?? 'lecture' });
    for (const id of removed) ctx.audit('liste_partage_retire', { utilisateur: user.username, liste: list.id, personne: nameOf(id) });
    for (const [id, value] of changedRights) ctx.audit('liste_droit_change', { utilisateur: user.username, liste: list.id, personne: nameOf(id), droit: value });
    return readList(user, list.id).list;
  }

  // --- Quitter une liste (POST /api/lists/:id/leave) ---
  //
  // Un membre (contributeur ou invité) retire SA propre appartenance (jamais celle d'un autre : la
  // route ne prend aucun identifiant de personne). Le propriétaire ne peut
  // pas quitter sa liste (403) ; un non-membre reçoit « Liste introuvable »
  // (404), comme partout. Un invité en lecture seule peut quitter. Ses
  // éléments restent dans la liste (ils appartiennent à la liste). Les
  // membres restants et ses propres téléphones sont prévenus en temps réel ;
  // la liste disparaît de ses téléphones à leur synchronisation.
  function leaveList(user, listId) {
    const list = listForMember(user, listId);
    if (list.owner_id === user.id) throw new OpError(403, OWNER_CANNOT_LEAVE);
    db.transaction(() => {
      db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?').run(list.id, user.id);
      news.stopReading(list.id, user.id);
      db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(nowIso(), list.id);
    })();
    ctx.events?.notifyList(list.id, { alsoUsers: [user.id] });
    ctx.audit('liste_quittee', { utilisateur: user.username, liste: list.id });
    return {};
  }

  // --- Dupliquer une liste (POST /api/lists/:id/duplicate) ---
  //
  // Propriétaire ou contributeur (lecture seule : 403 ;
  // non-membre : 404, comme partout). En une seule transaction (tout ou
  // rien) : une nouvelle liste privée (la personne qui duplique en est la
  // propriétaire, sans partage ni lien public), même type, même magasin,
  // même icône, mêmes réglages de priorité, d'échéance et « Après l'ajout » ;
  // avec withItems (vrai par défaut) : les éléments non supprimés, avec nom,
  // quantité, note, rayon, magasin, priorité, échéance et code-barres, tous
  // décochés. Les photos ne
  // sont pas copiées (un fichier ne peut pas faire partie de la transaction,
  // et la copie échapperait au plafond d'envoi des photos). La mémoire des
  // noms suit la création d'éléments habituelle (listes de courses).
  // Journal : identifiants seulement, jamais de nom de liste ni de contenu.
  function duplicateList(user, listId, { name, withItems = true } = {}) {
    const source = listForEditor(user, listId);
    if (isWishList(source)) throw new OpError(400, 'Une liste d\'envies ne se duplique pas.');
    const title = listName(name);
    if (typeof withItems !== 'boolean') throw new OpError(400, 'Réglage « Copier les éléments » invalide.');
    const id = crypto.randomUUID();
    const now = nowIso();
    const items = withItems ? q.liveItems.all(source.id) : [];
    db.transaction(() => {
      db.prepare(`INSERT INTO lists (id, name, type, category_id, store_id, owner_id, priority_enabled, due_enabled, icon, add_mode, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, title, typeOf(source), source.category_id, source.store_id, user.id, source.priority_enabled, source.due_enabled, source.icon, source.add_mode, now, now);
      db.prepare("INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, 'modification')").run(id, user.id);
      news.startReading(id, user.id);
      const insert = db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, aisle_id, store_id, priority, due_date, ean, created_by, created_at, updated_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of items) {
        insert.run(crypto.randomUUID(), id, item.name, item.quantity, item.note, item.aisle_id, item.store_id, item.priority, item.due_date, item.ean, user.id, now, now);
        // Comme un ajout : la mémoire des noms (listes de courses seulement)
        if (isShoppingList(source)) remember(item.name, { storeId: source.is_multi === 1 ? item.store_id : source.store_id, aisleId: item.aisle_id, count: 1 });
      }
    })();
    ctx.events?.notifyList(id);
    ctx.audit('liste_dupliquee', { utilisateur: user.username, liste: id, source: source.id, elements: items.length });
    return { list: describeList(q.myLists.all(user.id).find((l) => l.id === id), user), copied: items.length };
  }

  // Mode scan, « mes produits » : nom et note d'un article qui porte ce
  // code-barres, parmi les listes dont le compte est membre (jamais celles
  // des autres comptes), articles supprimés compris tant qu'ils ne sont pas
  // effacés par le nettoyage (30 jours). Le plus récent d'abord. Seuls le
  // nom et la note sortent : ni identifiant, ni nom de liste. null si aucun.
  function knownProduct(user, ean) {
    const row = db.prepare(`
      SELECT items.name, items.note FROM items
      JOIN list_members ON list_members.list_id = items.list_id AND list_members.user_id = ?
      WHERE items.ean = ?
      ORDER BY items.updated_at DESC, items.created_at DESC
      LIMIT 1
    `).get(user.id, ean);
    return row ? { name: row.name, note: row.note ?? '' } : null;
  }

  // --- Nettoyage périodique ---
  // Efface pour de bon ce qui est marqué supprimé depuis plus de 30 jours
  // (les articles d'une liste effacée partent avec elle), ainsi que la trace
  // des opérations de plus de 30 jours.
  // Les fichiers photo des articles effacés le sont aussi (y compris ceux
  // des articles d'une liste effacée), puis un ménage retire les fichiers dont
  // l'article n'existe plus (coupure pendant un envoi, par exemple).
  function purgeDeleted() {
    const limit = new Date(ctx.now() - PURGE_AFTER_DAYS * DAY).toISOString();
    const result = db.transaction(() => {
      const photos = db.prepare(`
        SELECT items.id FROM items JOIN lists ON lists.id = items.list_id
        WHERE items.photo_at IS NOT NULL
          AND ((items.deleted_at IS NOT NULL AND items.deleted_at < :limit)
            OR (lists.deleted_at IS NOT NULL AND lists.deleted_at < :limit))
      `).pluck().all({ limit });
      return {
        photoIds: photos,
        items: db.prepare('DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes,
        lists: db.prepare('DELETE FROM lists WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes,
        ops: db.prepare('DELETE FROM applied_ops WHERE applied_at < ?').run(limit).changes,
      };
    })();
    const { photoIds, ...counts } = result;
    if (ctx.photos) {
      for (const id of photoIds) ctx.photos.remove(id);
      const known = db.prepare('SELECT 1 FROM items WHERE id = ?').pluck();
      counts.photos = photoIds.length + ctx.photos.sweep((id) => known.get(id) === 1, ctx.now());
    }
    return counts;
  }

  // --- Photos (routes /api/items/:id/photo) ---

  // L'article (non supprimé), si le compte est membre de sa liste ; sinon null
  function photoItem(user, itemId) {
    if (!isUuid(itemId)) return null;
    return q.memberItem.get({ userId: user.id, itemId: itemId.toLowerCase() }) ?? null;
  }

  // Note la date de la photo (ou son retrait : null). updated_at change : les
  // autres téléphones l'apprennent à leur synchronisation.
  // user : la personne qui ajoute, change ou retire la photo (journal des
  // nouveautés : une modification)
  function setPhotoDate(itemId, photoAt, user) {
    db.prepare('UPDATE items SET photo_at = ?, updated_at = ? WHERE id = ?').run(photoAt, nowIso(), itemId);
    const item = q.item.get(itemId);
    if (user) news.log(item.list_id, user.id, 'update', [item.id]);
    ctx.events?.notifyList(item.list_id); // temps réel, après l'écriture
    return describeItem(item);
  }

  // Comptes actifs, pour choisir avec qui partager une liste
  function activeUsers() {
    return db.prepare('SELECT id, username, display_name FROM users WHERE active = 1').all()
      .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  }

  return {
    applyOps, myLists, readList, suggestions, changesSince, setMembers, duplicateList, leaveList, purgeDeleted, activeUsers, news,
    photoItem, setPhotoDate, nowIso, OpError, listForMember, listForEditor, knownProduct,
  };
}

export { OpError };
