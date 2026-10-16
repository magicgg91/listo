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
// Les dates (created_at, updated_at, deleted_at) sont toujours posées ici,
// par le serveur : celles qu'enverrait le téléphone sont ignorées.

import { normalizeItemName, suggest } from '../public/js/history.js';
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
const ITEM_NOT_FOUND = 'Article introuvable.';
const OWNER_ONLY = 'Seul le propriétaire de la liste peut faire cela.';

// --- Vérification des champs envoyés par le téléphone ---

function requireUuid(value, what) {
  if (!isUuid(value)) throw new OpError(400, `Identifiant ${what} invalide.`);
  return value.toLowerCase();
}

function listName(value) {
  const name = cleanName(value);
  if (!name) throw new OpError(400, 'Nom de liste invalide (1 à 100 caractères).');
  return name;
}

function itemName(value) {
  const name = cleanName(value);
  if (!name) throw new OpError(400, "Nom d'article invalide (1 à 100 caractères).");
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
    memberList: db.prepare(`
      SELECT lists.*, categories.is_shopping
      FROM lists
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      JOIN categories ON categories.id = lists.category_id
      WHERE lists.id = :listId AND lists.deleted_at IS NULL
    `),
    // Un article non supprimé d'une liste non supprimée dont le compte est membre
    memberItem: db.prepare(`
      SELECT items.*, categories.is_shopping
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      JOIN categories ON categories.id = lists.category_id
      WHERE items.id = :itemId AND items.deleted_at IS NULL
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
    history: db.prepare('SELECT * FROM item_history WHERE name_normalized = ?'),
    allHistory: db.prepare('SELECT * FROM item_history'),
    insertHistory: db.prepare(`
      INSERT INTO item_history (name_normalized, display_name, aisle_id, use_count, last_used_at)
      VALUES (:key, :name, :aisleId, :count, :now)
    `),
    updateHistory: db.prepare(`
      UPDATE item_history SET aisle_id = COALESCE(:aisleId, aisle_id),
        use_count = use_count + :count, last_used_at = :now
      WHERE name_normalized = :key
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
    const item = q.memberItem.get({ userId: user.id, itemId: requireUuid(itemId, "d'article") });
    if (!item) throw new OpError(404, ITEM_NOT_FOUND);
    return item;
  }

  // Met à jour l'historique commun (autocomplétion et rayon habituel).
  // count = 1 pour un ajout (compte une utilisation), 0 pour une modification.
  // Le nom affiché dans les suggestions reste celui de la première saisie :
  // taper « LAIT » ensuite ne change pas la suggestion « Lait ».
  // Le rayon n'est mémorisé que s'il est connu (on n'efface pas un rayon
  // habituel en ajoutant un article « Sans rayon »).
  function remember(name, aisleId, count) {
    const params = { key: normalizeItemName(name), name, aisleId, count, now: nowIso() };
    if (q.history.get(params.key)) q.updateHistory.run(params);
    else q.insertHistory.run({ ...params, count: Math.max(count, 1) });
  }

  // Rayon habituel d'un article (seulement s'il est encore actif)
  function usualAisle(name) {
    const entry = q.history.get(normalizeItemName(name));
    if (!entry || entry.aisle_id === null) return null;
    const aisle = q.aisle.get(entry.aisle_id);
    return aisle && aisle.active === 1 ? aisle.id : null;
  }

  // --- Mise en forme des réponses ---

  const describeItem = (item) => ({
    id: item.id,
    listId: item.list_id,
    name: item.name,
    quantity: item.quantity,
    note: item.note,
    aisleId: item.aisle_id,
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
      store: store && { id: store.id, name: store.name, active: store.active === 1 },
      ownerId: list.owner_id,
      isOwner: list.owner_id === user.id,
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

  const describeHistory = (row) => ({
    name: row.display_name,
    nameNormalized: row.name_normalized,
    aisleId: row.aisle_id,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
  });

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
      return {};
    },

    // Supprimer une liste (propriétaire seulement). Suppression logique : les
    // autres téléphones l'apprendront à leur prochaine synchronisation.
    'list.delete'(user, op) {
      const list = listForOwner(user, op.listId);
      const now = nowIso();
      db.prepare('UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, list.id);
      ctx.audit('liste_supprimee', { utilisateur: user.username, liste: list.id });
      return {};
    },

    // Vider les barrés : supprime les articles cochés de cette liste
    // seulement. L'historique d'autocomplétion n'est pas touché.
    'list.clearChecked'(user, op) {
      const list = listForMember(user, op.listId);
      const now = nowIso();
      const { changes } = db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL')
        .run(now, now, list.id);
      return { removed: changes };
    },

    // Ajouter un article. Sans rayon précisé, un article déjà connu reprend
    // son rayon habituel (liste de courses seulement).
    'item.create'(user, op) {
      const list = listForMember(user, op.listId);
      const id = requireUuid(op.itemId, "d'article");
      if (q.anyItem.get(id)) throw new OpError(409, 'Cet article existe déjà.');
      const name = itemName(op.name);
      let aisleId = null;
      if (list.is_shopping === 1) {
        aisleId = op.aisleId === undefined ? usualAisle(name) : activeAisleOrNull(op.aisleId)?.id ?? null;
      }
      const now = nowIso();
      db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, aisle_id, created_by, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, list.id, name, quantity(op.quantity), note(op.note), aisleId, user.id, now, now);
      remember(name, aisleId, 1);
      return { item: describeItem(q.item.get(id)) };
    },

    // Modifier un article (nom, quantité, note, rayon). Le nouveau rayon, ou
    // le nouveau nom, est mémorisé pour les prochains ajouts.
    'item.update'(user, op) {
      const item = itemForMember(user, op.itemId);
      const name = op.name === undefined ? item.name : itemName(op.name);
      const qty = op.quantity === undefined ? item.quantity : quantity(op.quantity);
      const text = op.note === undefined ? item.note : note(op.note);
      let aisleId = item.aisle_id;
      if (op.aisleId !== undefined && item.is_shopping === 1) {
        if (op.aisleId !== null && !parseId(op.aisleId)) throw new OpError(400, 'Rayon inconnu ou désactivé.');
        // Un rayon désactivé peut être gardé, pas choisi
        const wanted = op.aisleId === null ? null : parseId(op.aisleId);
        if (wanted !== item.aisle_id) aisleId = activeAisleOrNull(wanted)?.id ?? null;
      }
      if (op.name === undefined && op.quantity === undefined && op.note === undefined && op.aisleId === undefined) {
        throw new OpError(400, 'Rien à modifier.');
      }
      db.prepare('UPDATE items SET name = ?, quantity = ?, note = ?, aisle_id = ?, updated_at = ? WHERE id = ?')
        .run(name, qty, text, aisleId, nowIso(), item.id);
      if (name !== item.name || aisleId !== item.aisle_id) {
        remember(name, item.is_shopping === 1 ? aisleId : null, 0);
      }
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Cocher ou décocher un article
    'item.check'(user, op) {
      const item = itemForMember(user, op.itemId);
      if (typeof op.checked !== 'boolean') throw new OpError(400, 'Valeur « checked » invalide (true ou false).');
      db.prepare('UPDATE items SET checked = ?, updated_at = ? WHERE id = ?').run(op.checked ? 1 : 0, nowIso(), item.id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Supprimer un article (suppression logique ; l'historique reste)
    'item.delete'(user, op) {
      const item = itemForMember(user, op.itemId);
      const now = nowIso();
      db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, item.id);
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
    try {
      result = db.transaction(() => {
        if (!handler) throw new OpError(400, "Type d'opération inconnu.");
        const value = { id: opId, status: 200, ...handler(user, op) };
        saveApplied.run(opId, user.id, JSON.stringify(value), nowIso());
        return value;
      })();
    } catch (err) {
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
    const groups = groupItems(items, aisles, category.is_shopping === 1);
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
      stores: q.allStores.all().map(describeReference),
      aisles: q.allAisles.all().map(describeReference),
      history: db.prepare('SELECT * FROM item_history WHERE last_used_at >= ?').all(from).map(describeHistory),
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
    for (const id of added) ctx.audit('liste_partage_ajoute', { utilisateur: user.username, liste: list.id, invite: nameOf(id) });
    for (const id of removed) ctx.audit('liste_partage_retire', { utilisateur: user.username, liste: list.id, invite: nameOf(id) });
    return readList(user, list.id).list;
  }

  // --- Nettoyage périodique ---
  // Efface pour de bon ce qui est marqué supprimé depuis plus de 30 jours
  // (les articles d'une liste effacée partent avec elle), ainsi que la trace
  // des opérations de plus de 30 jours.
  function purgeDeleted() {
    const limit = new Date(ctx.now() - PURGE_AFTER_DAYS * DAY).toISOString();
    return db.transaction(() => ({
      items: db.prepare('DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes,
      lists: db.prepare('DELETE FROM lists WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes,
      ops: db.prepare('DELETE FROM applied_ops WHERE applied_at < ?').run(limit).changes,
    }))();
  }

  // Comptes actifs, pour choisir avec qui partager une liste
  function activeUsers() {
    return db.prepare('SELECT id, username, display_name FROM users WHERE active = 1').all()
      .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  }

  return { applyOps, myLists, readList, suggestions, changesSince, setMembers, purgeDeleted, activeUsers, OpError };
}

export { OpError };
