// Listes et articles : droits d'accès, opérations, historique, lecture,
// synchronisation et nettoyage.
//
// Règle d'or : chaque opération vérifie elle-même, dans la base, que le
// compte connecté est membre de la liste concernée (list_members). Le
// téléphone n'est jamais cru sur parole. Quelqu'un qui n'est pas membre
// reçoit exactement la même réponse que si la liste n'existait pas (404).
//
// Droits :
// - propriétaire : tout (renommer, changer catégorie et magasin, partage,
//   supprimer la liste) ;
// - invité : articles seulement (ajouter, modifier, cocher, supprimer,
//   vider les barrés) ;
// - un Admin n'a aucun droit particulier sur les listes des autres.
//
// Magasin « multi » (étape 6) : une liste de courses dont le magasin est
// « multi » n'a pas de rayon. Chaque article y a son propre magasin, choisi
// parmi ceux que regroupe le magasin de la liste (et actifs). Une liste à
// magasin simple garde ses rayons, sans magasin par article.
//
// Les dates (created_at, updated_at, deleted_at) sont toujours posées ici,
// par le serveur : celles qu'enverrait le téléphone sont ignorées.

import {
  normalizeItemName, suggest, usualAisle as sharedUsualAisle, usualStore as sharedUsualStore, recordUse, moveUse,
} from '../public/js/history.js';
import { groupItems } from '../public/js/sorting.js';
import { cleanName, parseId } from './validate.js';

const DAY = 24 * 60 * 60 * 1000;
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

const quantity = (value) => optionalText(value, 30, 'Quantité');
const note = (value) => optionalText(value, 500, 'Note');

// --- Accès aux données ---

export function createListService(ctx) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    category: db.prepare('SELECT * FROM categories WHERE id = ?'),
    store: db.prepare('SELECT * FROM stores WHERE id = ?'),
    aisle: db.prepare('SELECT * FROM aisles WHERE id = ?'),
    allCategories: db.prepare('SELECT * FROM categories'),
    allStores: db.prepare('SELECT * FROM stores'),
    allAisles: db.prepare('SELECT * FROM aisles'),

    // Une liste non supprimée dont le compte est membre
    // (is_multi : 1 si c'est une liste de courses à magasin « multi »)
    memberList: db.prepare(`
      SELECT lists.*, categories.is_shopping,
        (categories.is_shopping = 1 AND COALESCE(stores.is_multi, 0) = 1) AS is_multi
      FROM lists
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      JOIN categories ON categories.id = lists.category_id
      LEFT JOIN stores ON stores.id = lists.store_id
      WHERE lists.id = :listId AND lists.deleted_at IS NULL
    `),
    // Un article non supprimé d'une liste non supprimée dont le compte est membre
    memberItem: db.prepare(`
      SELECT items.*, categories.is_shopping, lists.store_id AS list_store_id,
        (categories.is_shopping = 1 AND COALESCE(stores.is_multi, 0) = 1) AS is_multi
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      JOIN categories ON categories.id = lists.category_id
      LEFT JOIN stores ON stores.id = lists.store_id
      WHERE items.id = :itemId AND items.deleted_at IS NULL
    `),
    // Un article supprimé (pas encore effacé) d'une liste dont le compte est membre
    deletedItemForMember: db.prepare(`
      SELECT items.* FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.id = :itemId AND items.deleted_at IS NOT NULL
    `),
    anyList: db.prepare('SELECT id FROM lists WHERE id = ?'),
    anyItem: db.prepare('SELECT id FROM items WHERE id = ?'),
    item: db.prepare('SELECT * FROM items WHERE id = ?'),
    members: db.prepare(`
      SELECT users.id, users.username, users.display_name, users.active
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

  // Catégorie active (obligatoire), sinon erreur
  function activeCategory(id) {
    const category = parseId(id) && q.category.get(parseId(id));
    if (!category || category.active !== 1) throw new OpError(400, 'Catégorie inconnue ou désactivée.');
    return category;
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
      SELECT lists.*, categories.is_shopping, COALESCE(stores.is_multi, 0) AS store_is_multi
      FROM lists JOIN categories ON categories.id = lists.category_id
      LEFT JOIN stores ON stores.id = lists.store_id WHERE lists.id = ?
    `).get(listId);
    if (list.is_shopping !== 1) return;
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
    checked: item.checked === 1,
    createdBy: item.created_by,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    deletedAt: item.deleted_at,
  });

  function describeList(list, user) {
    const category = q.category.get(list.category_id);
    const store = list.store_id === null ? null : q.store.get(list.store_id);
    const members = q.members.all(list.id).map((m) => ({
      id: m.id, username: m.username, displayName: m.display_name, active: m.active === 1, isOwner: m.id === list.owner_id,
    }));
    return {
      id: list.id,
      name: list.name,
      category: { id: category.id, name: category.name, isShopping: category.is_shopping === 1, active: category.active === 1 },
      store: store && { id: store.id, name: store.name, active: store.active === 1, isMulti: store.is_multi === 1 },
      ownerId: list.owner_id,
      isOwner: list.owner_id === user.id,
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
  function notifyTouched() {
    for (const listId of touched) ctx.events?.notifyList(listId);
    touched.clear();
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
      const category = activeCategory(op.categoryId);
      const store = activeStoreOrNull(op.storeId);
      if (store && category.is_shopping !== 1) {
        throw new OpError(400, 'Un magasin ne se choisit que pour une liste de courses.');
      }
      const now = nowIso();
      db.prepare('INSERT INTO lists (id, name, category_id, store_id, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, name, category.id, store?.id ?? null, user.id, now, now);
      db.prepare('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)').run(id, user.id);
      changed(id);
      ctx.audit('liste_creee', { utilisateur: user.username, liste: id });
      return { list: describeList(q.myLists.all(user.id).find((l) => l.id === id), user) };
    },

    // Renommer, changer de catégorie ou de magasin (propriétaire seulement).
    // Une catégorie ou un magasin désactivé reste accepté s'il est déjà celui
    // de la liste ; pour en changer, le nouveau doit être actif.
    'list.update'(user, op) {
      const list = listForOwner(user, op.listId);
      if (op.name === undefined && op.categoryId === undefined && op.storeId === undefined) {
        throw new OpError(400, 'Rien à modifier.');
      }
      const name = op.name === undefined ? list.name : listName(op.name);

      let category = q.category.get(list.category_id);
      if (op.categoryId !== undefined && parseId(op.categoryId) !== list.category_id) {
        category = activeCategory(op.categoryId);
      }

      let storeId = list.store_id;
      if (op.storeId !== undefined) {
        if (op.storeId !== null && !parseId(op.storeId)) throw new OpError(400, 'Magasin inconnu ou désactivé.');
        const wanted = op.storeId === null ? null : parseId(op.storeId);
        if (wanted !== list.store_id) storeId = activeStoreOrNull(wanted)?.id ?? null;
      }

      // Pas de magasin pour une liste qui n'est pas de courses : si la liste
      // passe à une telle catégorie, son magasin est retiré
      if (category.is_shopping !== 1) {
        if (op.storeId !== undefined && op.storeId !== null) {
          throw new OpError(400, 'Un magasin ne se choisit que pour une liste de courses.');
        }
        storeId = null;
      }

      db.prepare('UPDATE lists SET name = ?, category_id = ?, store_id = ?, updated_at = ? WHERE id = ?')
        .run(name, category.id, storeId, nowIso(), list.id);
      if (storeId !== list.store_id || category.is_shopping !== list.is_shopping) completeItems(list.id);
      changed(list.id);
      return {};
    },

    // Supprimer une liste (propriétaire seulement). Suppression logique : les
    // autres téléphones l'apprendront à leur prochaine synchronisation.
    'list.delete'(user, op) {
      const list = listForOwner(user, op.listId);
      const now = nowIso();
      db.prepare('UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, list.id);
      changed(list.id);
      ctx.audit('liste_supprimee', { utilisateur: user.username, liste: list.id });
      // Son lien public s'arrête avec elle
      const share = ctx.shares?.stopForList(list.id);
      if (share) ctx.audit('lien_public_arrete', { utilisateur: user.username, liste: list.id, partage: share.id, raison: 'liste supprimée' });
      return {};
    },

    // Vider les barrés : supprime les articles cochés de cette liste
    // seulement. L'historique d'autocomplétion n'est pas touché.
    'list.clearChecked'(user, op) {
      const list = listForMember(user, op.listId);
      const now = nowIso();
      const { changes } = db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL')
        .run(now, now, list.id);
      if (changes) changed(list.id);
      return { removed: changes };
    },

    // Ajouter un article.
    // - liste à magasin simple : sans rayon précisé, un article déjà connu
    //   reprend son rayon habituel (celui de ce magasin, sinon le général) ;
    // - liste « multi » : pas de rayon ; sans magasin précisé, un article
    //   déjà acheté dans un des magasins de la liste reprend son magasin habituel.
    'item.create'(user, op) {
      const list = listForMember(user, op.listId);
      const id = requireUuid(op.itemId);
      if (q.anyItem.get(id)) throw new OpError(409, 'Cet identifiant est déjà utilisé.');
      const name = itemName(op.name);
      checkFieldsForList(list.is_multi === 1, op);
      let aisleId = null;
      let storeId = null;
      if (list.is_multi === 1) {
        storeId = op.storeId === undefined ? usualStore(name, list.store_id) : chosenStore(op.storeId, list.store_id);
      } else if (list.is_shopping === 1) {
        aisleId = op.aisleId === undefined ? usualAisle(name, list.store_id) : activeAisleOrNull(op.aisleId)?.id ?? null;
      }
      const now = nowIso();
      db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, aisle_id, store_id, created_by, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, list.id, name, quantity(op.quantity), note(op.note), aisleId, storeId, user.id, now, now);
      // Historique : magasin de l'article (multi) ou magasin de la liste (simple)
      const historyStore = list.is_multi === 1 ? storeId : list.is_shopping === 1 ? list.store_id : null;
      remember(name, { storeId: historyStore, aisleId, count: 1 });
      changed(list.id);
      return { item: describeItem(q.item.get(id)) };
    },

    // Modifier un article (nom, quantité, note, rayon ou magasin). Le nouveau
    // rayon, ou le nouveau nom, est mémorisé pour les prochains ajouts ; dans
    // une liste « multi », un changement de magasin reporte l'achat sur le
    // nouveau magasin (il devient le magasin habituel s'il est le plus fréquent).
    'item.update'(user, op) {
      const item = itemForMember(user, op.itemId);
      const multi = item.is_multi === 1;
      checkFieldsForList(multi, op);
      const name = op.name === undefined ? item.name : itemName(op.name);
      const qty = op.quantity === undefined ? item.quantity : quantity(op.quantity);
      const text = op.note === undefined ? item.note : note(op.note);
      let aisleId = item.aisle_id;
      if (op.aisleId !== undefined && item.is_shopping === 1 && !multi) {
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
      if ([op.name, op.quantity, op.note, op.aisleId, op.storeId].every((value) => value === undefined)) {
        throw new OpError(400, 'Rien à modifier.');
      }
      db.prepare('UPDATE items SET name = ?, quantity = ?, note = ?, aisle_id = ?, store_id = ?, updated_at = ? WHERE id = ?')
        .run(name, qty, text, aisleId, storeId, nowIso(), item.id);

      if (multi) {
        if (name !== item.name) remember(name, { storeId, count: 0 });
        else if (storeId !== item.store_id) saveHistory(moveUse(historyOf(name), { name, from: item.store_id, to: storeId, now: nowIso() }));
      } else if (name !== item.name || aisleId !== item.aisle_id) {
        const shopping = item.is_shopping === 1;
        remember(name, { storeId: shopping ? item.list_store_id : null, aisleId: shopping ? aisleId : null, count: 0 });
      }
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Cocher ou décocher un article
    'item.check'(user, op) {
      const item = itemForMember(user, op.itemId);
      if (typeof op.checked !== 'boolean') throw new OpError(400, 'Valeur « checked » invalide (true ou false).');
      db.prepare('UPDATE items SET checked = ?, updated_at = ? WHERE id = ?').run(op.checked ? 1 : 0, nowIso(), item.id);
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Supprimer un article (suppression logique ; l'historique reste). Sa
    // photo est gardée jusqu'au nettoyage (30 jours) : « Annuler » la retrouve.
    'item.delete'(user, op) {
      const item = itemForMember(user, op.itemId);
      const now = nowIso();
      db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, item.id);
      changed(item.list_id);
      return {};
    },

    // Remettre un article supprimé (« Annuler »), avec sa photo, tant qu'il
    // n'a pas été effacé par le nettoyage. Membres de la liste seulement.
    'item.restore'(user, op) {
      const item = q.deletedItemForMember.get({ userId: user.id, itemId: requireUuid(op.itemId) });
      if (!item) throw new OpError(404, ITEM_NOT_FOUND);
      db.prepare('UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), item.id);
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
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
    try {
      result = db.transaction(() => {
        if (!handler) throw new OpError(400, "Type d'opération inconnu.");
        const value = { id: opId, status: 200, ...handler(user, op) };
        saveApplied.run(opId, user.id, JSON.stringify(value), nowIso());
        return value;
      })();
      notifyTouched(); // écriture réussie : les membres sont prévenus
    } catch (err) {
      touched.clear(); // refus ou panne : rien n'a changé, personne n'est prévenu
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
    const category = q.category.get(list.category_id);
    const aisles = q.allAisles.all();
    const items = q.liveItems.all(list.id).map(describeItem);
    const byStore = category.is_shopping === 1 && list.store_id !== null && q.store.get(list.store_id).is_multi === 1;
    const groups = groupItems(items, aisles, category.is_shopping === 1, { byStore, stores: q.allStores.all() });
    return { list: describeList(list, user), groups };
  }

  // Suggestions d'autocomplétion (même règle que sur le téléphone). Le rayon
  // proposé n'est donné que s'il est encore actif.
  function suggestions(typed) {
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
      categories: q.allCategories.all().map(describeReference),
      stores: describeStores(),
      aisles: q.allAisles.all().map(describeReference),
      history: db.prepare('SELECT * FROM item_history WHERE last_used_at >= ?').all(from).map(describeHistory),
      // Comptes actifs (choix des invités), gardés sur le téléphone pour
      // ouvrir le formulaire de liste sans réseau
      users: activeUsers(),
    };
  }

  // --- Partage (PUT /api/lists/:id/members, propriétaire seulement) ---
  //
  // userIds : la liste complète des invités souhaitée. Le propriétaire reste
  // toujours membre. Un compte désactivé ne peut pas être ajouté (mais un
  // invité déjà présent et désactivé depuis peut rester).
  function setMembers(user, listId, userIds) {
    const list = listForOwner(user, listId);
    if (!Array.isArray(userIds) || userIds.length > 50 || !userIds.every((id) => parseId(id))) {
      throw new OpError(400, 'Liste des invités invalide.');
    }
    const wanted = new Set(userIds.map(Number));
    wanted.delete(list.owner_id);
    const current = new Set(q.members.all(list.id).map((m) => m.id).filter((id) => id !== list.owner_id));

    for (const id of wanted) {
      if (current.has(id)) continue;
      const guest = db.prepare('SELECT id, active FROM users WHERE id = ?').get(id);
      if (!guest || guest.active !== 1) throw new OpError(400, 'Utilisateur inconnu ou désactivé.');
    }

    const added = [...wanted].filter((id) => !current.has(id));
    const removed = [...current].filter((id) => !wanted.has(id));
    const nameOf = (id) => db.prepare('SELECT username FROM users WHERE id = ?').pluck().get(id);
    db.transaction(() => {
      for (const id of added) db.prepare('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)').run(list.id, id);
      for (const id of removed) db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?').run(list.id, id);
      // La liste « change » : les membres l'apprendront à leur synchronisation
      if (added.length || removed.length) db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(nowIso(), list.id);
    })();
    // Temps réel : membres actuels, et invités retirés (leur téléphone
    // apprend ainsi qu'il n'a plus accès à la liste)
    if (added.length || removed.length) ctx.events?.notifyList(list.id, { alsoUsers: removed });
    for (const id of added) ctx.audit('liste_partage_ajoute', { utilisateur: user.username, liste: list.id, invite: nameOf(id) });
    for (const id of removed) ctx.audit('liste_partage_retire', { utilisateur: user.username, liste: list.id, invite: nameOf(id) });
    return readList(user, list.id).list;
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
  function setPhotoDate(itemId, photoAt) {
    db.prepare('UPDATE items SET photo_at = ?, updated_at = ? WHERE id = ?').run(photoAt, nowIso(), itemId);
    const item = q.item.get(itemId);
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
    applyOps, myLists, readList, suggestions, changesSince, setMembers, purgeDeleted, activeUsers,
    photoItem, setPhotoDate, nowIso, OpError,
  };
}

export { OpError };
