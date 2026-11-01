// Copie locale des données (listes, articles, rayons, magasins, historique,
// comptes proposés au partage), reçue du serveur par GET
// /api/sync, et calculs pour l'écran.
//
// Les écrans lisent cette copie ; chaque modification y est reportée tout de
// suite (avant même d'être envoyée au serveur, voir actions.js). Elle est
// gardée sur le téléphone (IndexedDB, voir localdb.js) pour fonctionner sans
// réseau.
//
// Les fonctions « calculer… » sont pures : elles ne dépendent ni du réseau
// ni de l'écran, et sont testées automatiquement (test/front.test.js).

import { splitDone, compareNames, isMultiList, ITEM_SORTS } from './sorting.js';
import { isListIcon } from './list-icons.js';
import { isListType, isShoppingList, usesPriority, usesDue } from './list-types.js';
import { suggest, isKnownName, usualAisle, usualStore, recordUse, moveUse, normalizeItemName } from './history.js';

// --- État vide ---
export function emptyState() {
  return {
    loaded: false,
    serverTime: null,
    lists: new Map(),       // id -> liste (telle que décrite par le serveur)
    items: new Map(),       // id -> article (non supprimé)
    listIds: new Set(),     // listes auxquelles j'ai accès
    stores: [],
    aisles: [],
    history: [],
    users: [],              // comptes actifs, pour choisir avec qui partager
    // Réservations des listes d'envies, { <liste> : [{ itemId, userId,
    // displayName }] }, SEULEMENT pour les listes où le serveur a jugé que
    // ce compte peut les voir (jamais celles dont il est le bénéficiaire :
    // le serveur ne les envoie pas). Remplacées en entier à chaque synchronisation.
    reservations: {},
    news: emptyNews(),      // mes nouveautés (voir « Nouveautés » plus bas)
    trash: new Map(),       // articles supprimés ici (pour « Annuler »), en mémoire seulement
  };
}

// Nouveautés avant la première synchronisation : rien à signaler (réglages
// par défaut du compte : « Nouveautés » activé, cochés non signalés)
const emptyNews = () => ({ enabled: true, checks: false, lists: {} });

// --- Copie gardée sur le téléphone (IndexedDB) ---

// Version 2 : types de liste (list.type). Une copie de la version 1 (avec
// les anciennes catégories) est écartée : tout est rechargé du serveur à
// l'ouverture suivante (le nouveau code ne lit jamais les catégories). La
// file d'attente, gardée à part, n'est pas touchée.
// Version 3 : listes d'envies (lien, prix, réservations). Une copie plus
// ancienne est écartée et rechargée de la même façon.
export const SNAPSHOT_VERSION = 3;

// Forme enregistrable de la copie (tableaux simples, sans Map ni Set)
export function toSnapshot(state, savedAt = new Date().toISOString()) {
  return {
    version: SNAPSHOT_VERSION,
    savedAt,
    serverTime: state.serverTime,
    lists: [...state.lists.values()],
    items: [...state.items.values()],
    listIds: [...state.listIds],
    stores: state.stores,
    aisles: state.aisles,
    history: state.history,
    users: state.users,
    news: state.news,
    reservations: state.reservations,
  };
}

// Copie relue depuis le téléphone ; null si elle est illisible ou d'une
// autre version (elle sera alors rechargée entièrement depuis le serveur)
export function fromSnapshot(snapshot) {
  try {
    if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) return null;
    const state = emptyState();
    state.serverTime = snapshot.serverTime ?? null;
    state.listIds = new Set(snapshot.listIds);
    state.lists = new Map(snapshot.lists.map((list) => [list.id, list]));
    state.items = new Map(snapshot.items.map((item) => [item.id, item]));
    state.stores = [...snapshot.stores];
    state.aisles = [...snapshot.aisles];
    state.history = [...snapshot.history];
    state.users = [...(snapshot.users ?? [])];
    state.news = snapshot.news ?? emptyNews();
    state.reservations = snapshot.reservations ?? {};
    state.loaded = true;
    refreshListReferences(state);
    return state;
  } catch {
    return null;
  }
}

// Copie trop ancienne : le serveur efface les suppressions au bout de 30
// jours, une synchronisation « depuis » ne suffirait plus. Au-delà de 25 jours
// sans synchronisation, tout est rechargé.
export const SNAPSHOT_MAX_AGE_DAYS = 25;
export function isTooOld(state, now = Date.now()) {
  if (!state.serverTime) return true;
  return now - Date.parse(state.serverTime) > SNAPSHOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

// Magasin d'une liste : le serveur ne garde que son identifiant
// (lists.store_id) et décrit la liste avec son nom du moment. Mais une
// synchronisation « depuis » ne renvoie que les listes modifiées, alors que
// les magasins arrivent en entier à chaque fois : après un renommage par l'Admin (qui ne modifie
// aucune liste), le nom copié dans chaque liste resterait l'ancien. On le
// relit donc ici, par l'identifiant, dans les données de référence reçues.
export function refreshListReferences(state) {
  const stores = new Map(state.stores.map((s) => [s.id, s]));
  const fresh = (store) => {
    const found = store && stores.get(store.id);
    return found ? { id: found.id, name: found.name, active: found.active, isMulti: Boolean(found.isMulti) } : store;
  };
  for (const [id, list] of state.lists) {
    if (!list.store && !list.keptStore) continue;
    state.lists.set(id, { ...list, store: fresh(list.store), ...(list.keptStore ? { keptStore: fresh(list.keptStore) } : {}) });
  }
}

// Remplace tout par une synchronisation complète (réponse de /api/sync)
export function loadSync(state, data) {
  state.serverTime = data.serverTime;
  state.listIds = new Set(data.listIds);
  state.lists = new Map(data.lists.filter((l) => !l.deletedAt && state.listIds.has(l.id)).map((l) => [l.id, l]));
  state.items = new Map(data.items.filter((i) => !i.deletedAt && state.listIds.has(i.listId)).map((i) => [i.id, i]));
  state.stores = data.stores;
  state.aisles = data.aisles;
  state.history = data.history;
  state.reservations = data.reservations ?? {};
  if (data.users) state.users = data.users;
  if (data.news) state.news = data.news;
  state.loaded = true;
  refreshListReferences(state);
  return state;
}

// Ajoute « ce qui a changé depuis » (réponse de /api/sync?since=…) à la
// copie locale : listes et articles modifiés ou supprimés, listes devenues
// inaccessibles (retiré du partage), données de référence, historique.
export function mergeSync(state, data) {
  state.serverTime = data.serverTime;
  state.listIds = new Set(data.listIds);
  for (const list of data.lists) {
    if (list.deletedAt || !state.listIds.has(list.id)) state.lists.delete(list.id);
    else state.lists.set(list.id, list);
  }
  for (const item of data.items) {
    if (item.deletedAt || !state.listIds.has(item.listId)) state.items.delete(item.id);
    else state.items.set(item.id, item);
  }
  // Listes auxquelles je n'ai plus accès : elles disparaissent, avec leurs articles
  for (const id of [...state.lists.keys()]) if (!state.listIds.has(id)) state.lists.delete(id);
  for (const [id, item] of [...state.items]) if (!state.listIds.has(item.listId)) state.items.delete(id);
  state.stores = data.stores;
  state.aisles = data.aisles;
  if (data.users) state.users = data.users;
  // Nouveautés : envoyées en entier à chaque synchronisation
  if (data.news) state.news = data.news;
  // Réservations : en entier à chaque synchronisation (une libération
  // disparaît d'elle-même) ; rien pour une liste où je suis bénéficiaire
  state.reservations = data.reservations ?? {};
  refreshListReferences(state);
  // Historique : la ligne du serveur remplace la ligne locale du même article
  // et du même magasin
  for (const entry of data.history) {
    const index = state.history.findIndex((e) => e.nameNormalized === entry.nameNormalized && (e.storeId ?? null) === (entry.storeId ?? null));
    if (index >= 0) state.history[index] = entry;
    else state.history.push(entry);
  }
  return state;
}

// --- Écriture d'abord locale ---
//
// applyOp applique une opération (la même que celle envoyée à /api/ops) à la
// copie locale, avec le même effet que le serveur. Elle sert deux fois :
// - au moment de l'action, pour que l'écran change tout de suite ;
// - après chaque synchronisation, pour rejouer les opérations encore en file
//   d'attente par-dessus l'état du serveur (rien ne « revient en arrière »).
// context : { user (compte connecté), now (date ISO), hint (rayon ou magasin
// prévu sur le téléphone quand le serveur le choisira lui-même) }.
// Fonction pure (testée automatiquement) : elle ne parle pas au réseau.
export function applyOp(state, op, { user, now, hint = {} } = {}) {
  const item = op.itemId ? state.items.get(op.itemId) : null;
  switch (op.type) {
    case 'list.create': {
      // Type : celui demandé (listType) ; une ancienne opération (identifiant
      // de catégorie, jamais lu ici) compte comme une liste de tâches jusqu'à
      // la réponse du serveur, qui la traduit
      const type = isListType(op.listType) ? op.listType : 'tasks';
      // Liste d'envies : bénéficiaire (rien de secret : les réservations ne
      // sont jamais dans la description d'une liste)
      const wishes = type === 'wishes' ? {
        forUserId: op.forUserId ?? null,
        forName: op.forName ?? null,
        forDisplayName: op.forUserId ? state.users.find((u) => u.id === op.forUserId)?.displayName ?? null : null,
        isBeneficiary: !op.forUserId && !op.forName,
      } : {};
      const store = op.storeId == null || !isShoppingList(type) ? null : state.stores.find((st) => st.id === op.storeId) ?? null;
      state.lists.set(op.listId, {
        id: op.listId,
        name: op.name,
        icon: isListIcon(op.icon) ? op.icon : '', // rien de choisi : icône du type
        type,
        ...wishes,
        store: store && { id: store.id, name: store.name, active: store.active, isMulti: Boolean(store.isMulti) },
        ownerId: user.id,
        isOwner: true,
        canEdit: true, // le propriétaire a tous les droits
        priorityEnabled: op.priorityEnabled === true, // désactivées sauf demande
        dueEnabled: op.dueEnabled === true,
        addMode: ADD_MODES.includes(op.addMode) ? op.addMode : defaultAddMode(isShoppingList(type)),
        members: [{ id: user.id, username: user.username, displayName: user.displayName, active: true, isOwner: true, access: 'modification' }],
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
        deletedAt: null,
      });
      state.listIds.add(op.listId);
      return;
    }
    case 'list.update': {
      const list = state.lists.get(op.listId);
      if (!list) return;
      const next = { ...list, updatedAt: now };
      if (op.name !== undefined) next.name = op.name;
      if (op.icon !== undefined) next.icon = isListIcon(op.icon) ? op.icon : '';
      // Changement de type (même règle que le serveur : rien n'est effacé).
      // Le magasin d'une liste qui n'est plus de courses est caché (keptStore),
      // et revient si elle redevient une liste de courses.
      if (isListType(op.listType)) next.type = op.listType;
      if (isShoppingList(next)) {
        if (!next.store && next.keptStore) next.store = next.keptStore;
        delete next.keptStore;
        if (op.storeId !== undefined) {
          const store = op.storeId == null ? null : state.stores.find((st) => st.id === op.storeId);
          next.store = store ? { id: store.id, name: store.name, active: store.active, isMulti: Boolean(store.isMulti) } : null;
        }
      } else if (next.store) {
        next.keptStore = next.store;
        next.store = null;
      }
      if (typeof op.priorityEnabled === 'boolean') next.priorityEnabled = op.priorityEnabled;
      if (typeof op.dueEnabled === 'boolean') next.dueEnabled = op.dueEnabled;
      if (ADD_MODES.includes(op.addMode)) next.addMode = op.addMode;
      state.lists.set(list.id, next);
      return;
    }
    case 'list.delete':
      removeList(state, op.listId);
      return;
    // Nouveautés (propres à chaque personne) : effet local tout de suite,
    // hors ligne compris ; le serveur fait de même à l'envoi
    case 'list.seen': {
      const news = state.news.lists[op.listId];
      if (!news || !Number.isSafeInteger(op.upTo)) return;
      news.seen = Math.max(news.seen ?? 0, Math.min(op.upTo, news.lastEventId ?? op.upTo));
      if (op.upTo >= (news.lastEventId ?? 0)) state.news.lists[op.listId] = { ...news, count: 0, behind: false, items: [] };
      return;
    }
    case 'list.mute': {
      const news = state.news.lists[op.listId];
      if (!news || typeof op.muted !== 'boolean') return;
      state.news.lists[op.listId] = op.muted ? { ...news, muted: true, count: 0, behind: false, items: [] } : { ...news, muted: false };
      return;
    }
    case 'account.news':
      if (typeof op.enabled === 'boolean') state.news.enabled = op.enabled;
      if (typeof op.checks === 'boolean') state.news.checks = op.checks;
      return;
    case 'list.removeChecked':
    case 'list.clearChecked': // ancien nom (opération restée en file d'attente)
      for (const [id, it] of [...state.items]) if (it.listId === op.listId && it.checked) state.items.delete(id);
      return;
    case 'list.uncheckAll':
      for (const [id, it] of [...state.items]) {
        if (it.listId === op.listId && it.checked) state.items.set(id, { ...it, checked: false, checkedAt: null, updatedAt: now });
      }
      return;
    case 'item.create':
      if (!state.lists.has(op.listId)) return;
      state.items.set(op.itemId, {
        id: op.itemId,
        listId: op.listId,
        name: op.name,
        quantity: op.quantity ?? '',
        note: op.note ?? '',
        aisleId: op.aisleId !== undefined ? op.aisleId : hint.aisleId ?? null,
        storeId: op.storeId !== undefined ? op.storeId : hint.storeId ?? null,
        ean: op.ean ?? null, // code-barres (listes de courses), déjà normalisé
        link: op.link ?? null, // lien web (listes d'envies)
        priceCents: op.priceCents ?? null, // prix indicatif (listes d'envies)
        photoAt: null,
        checked: false,
        checkedAt: null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      return;
    case 'item.update': {
      if (!item) return;
      const next = { ...item, updatedAt: now };
      // Seuls les champs présents changent (dueDate: null efface l'échéance,
      // ean: null le code-barres)
      for (const field of ['name', 'quantity', 'note', 'aisleId', 'storeId', 'priority', 'dueDate', 'ean', 'link', 'priceCents']) if (op[field] !== undefined) next[field] = op[field];
      state.items.set(item.id, next);
      return;
    }
    case 'item.check':
      // Date du coché : celle du téléphone en attendant celle du serveur
      if (item) state.items.set(item.id, { ...item, checked: op.checked, checkedAt: op.checked ? item.checkedAt ?? now : null, updatedAt: now });
      return;
    case 'item.delete':
      if (item) {
        state.trash.set(item.id, item); // pour « Annuler »
        state.items.delete(item.id);
      }
      return;
    case 'item.restore': {
      const old = state.trash.get(op.itemId);
      if (old && state.lists.has(old.listId)) state.items.set(old.id, { ...old, updatedAt: now });
      return;
    }
    default:
  }
}

// Reporte un article créé ou modifié (ou le retire s'il est supprimé)
export function putItem(state, item) {
  if (item.deletedAt) state.items.delete(item.id);
  else state.items.set(item.id, item);
}

export function removeItem(state, itemId) {
  state.items.delete(itemId);
}

export function putList(state, list) {
  if (list.deletedAt) {
    removeList(state, list.id);
    return;
  }
  state.lists.set(list.id, list);
  state.listIds.add(list.id);
}

export function removeList(state, listId) {
  state.lists.delete(listId);
  state.listIds.delete(listId);
  for (const [id, item] of state.items) if (item.listId === listId) state.items.delete(id);
}

// Vrai si cette liste mémorise les noms saisis et les suggère : les listes
// de courses seulement (décision du 17 octobre 2026 ; même règle que le
// serveur). Une liste de tâches n'écrit rien dans l'historique et n'affiche
// pas de suggestions.
export function remembersNames(list) {
  return isShoppingList(list);
}

// Met à jour l'historique local avec la même règle que le serveur
// (public/js/history.js) : une utilisation de plus pour un ajout (count = 1,
// 0 pour une modification), le rayon s'il est connu, et la ligne du magasin
// (magasin de l'article dans une liste « multi », magasin de la liste sinon).
export function rememberItem(state, name, { aisleId = null, storeId = null, count = 1, now = new Date().toISOString() } = {}) {
  recordUse(state.history, { name, aisleId, storeId, count, now });
}

// Un article d'une liste « multi » a changé de magasin : son achat est
// reporté sur le nouveau magasin (même règle que le serveur)
export function moveItemStore(state, name, from, to, now = new Date().toISOString()) {
  moveUse(state.history, { name, from, to, now });
}

// Magasin à mémoriser dans l'historique pour un article de cette liste
export function historyStoreFor(list, item) {
  if (isMultiList(list)) return item.storeId ?? null;
  return isShoppingList(list) ? list.store?.id ?? null : null;
}

// --- Calculs pour l'écran ---

const itemsOf = (state, listId) => [...state.items.values()].filter((item) => item.listId === listId);

// --- Tri de « Mes listes » (choix gardé sur ce téléphone) ---
// - 'recent' : plus récentes d'abord, par dernière activité (création ou
//   renommage de la liste, ajout, modification, coche ou suppression d'un
//   élément) ; à égalité, ordre alphabétique. C'est le tri d'origine : il
//   reste le choix par défaut.
// - 'alpha' : ordre alphabétique, sans tenir compte des majuscules ni des
//   accents, nombres dans l'ordre naturel (« Liste 2 » avant « Liste 10 »).
// À l'intérieur d'une liste, rien ne change (voir sorting.js).
export const LIST_SORTS = ['recent', 'alpha'];
export const DEFAULT_LIST_SORT = 'recent';
export const LIST_SORT_KEY = 'listo-tri-listes';

// Valeur lue sur le téléphone : toute autre valeur retombe sur le défaut
export const listSortFrom = (value) => (LIST_SORTS.includes(value) ? value : DEFAULT_LIST_SORT);

// Choix gardé sur le téléphone (localStorage). storage : fonction qui renvoie
// le stockage (les tests en donnent un faux) ; stockage indisponible
// (navigation privée…) : tri par défaut, sans erreur.
export function loadListSort(storage = () => globalThis.localStorage) {
  try {
    return listSortFrom(storage().getItem(LIST_SORT_KEY));
  } catch {
    return DEFAULT_LIST_SORT;
  }
}
export function saveListSort(sort, storage = () => globalThis.localStorage) {
  try {
    storage().setItem(LIST_SORT_KEY, listSortFrom(sort));
  } catch {
    // sans importance : le choix vaut pour cette visite
  }
}

// --- Tri d'une liste (choix gardé sur ce téléphone, pour chaque liste :
// clé listo-tri-liste-<identifiant>). Sans choix gardé (null), la liste a
// son tri par défaut (defaultSort) : par rayon pour une liste de courses,
// ordre alphabétique sinon. ---
export const ITEM_SORT_PREFIX = 'listo-tri-liste-';
export const itemSortFrom = (value) => (ITEM_SORTS.includes(value) ? value : null);
export function loadItemSort(listId, storage = () => globalThis.localStorage) {
  try {
    return itemSortFrom(storage().getItem(ITEM_SORT_PREFIX + listId));
  } catch {
    return null;
  }
}
export function saveItemSort(listId, sort, storage = () => globalThis.localStorage) {
  const value = itemSortFrom(sort);
  if (!value) return;
  try {
    storage().setItem(ITEM_SORT_PREFIX + listId, value);
  } catch {
    // sans importance : le choix vaut pour cette visite
  }
}
// Ménage : oublie le tri des listes qui ne sont plus sur ce téléphone
export function pruneItemSorts(listIds, storage = () => globalThis.localStorage) {
  pruneByPrefix([ITEM_SORT_PREFIX], listIds, storage);
}
// Ménage complet, à l'écran « Mes listes » : tri, groupes repliés et zone
// des cochés des listes qui ne sont plus sur ce téléphone
export function pruneListMemory(listIds, storage = () => globalThis.localStorage) {
  pruneByPrefix([ITEM_SORT_PREFIX, FOLDED_PREFIX, ZONE_PREFIX], listIds, storage);
}
function pruneByPrefix(prefixes, listIds, storage) {
  try {
    const store = storage();
    const keep = new Set(listIds);
    const keys = [];
    for (let i = 0; i < store.length; i++) keys.push(store.key(i));
    for (const key of keys) {
      const prefix = prefixes.find((p) => key?.startsWith(p));
      if (prefix && !keep.has(key.slice(prefix.length))) store.removeItem(key);
    }
  } catch {
    // sans importance
  }
}

// --- Groupes repliés d'une liste (rayons, magasins, priorités) ---
// Mémorisés sur ce téléphone seulement, pour chaque liste (clé
// listo-groupes-replies-<identifiant>) : jamais envoyés au serveur. Tout est
// déplié par défaut. Le stockage du navigateur peut être indisponible
// (navigation privée…) : l'état vaut alors pour la visite, sans plus.
export const FOLDED_PREFIX = 'listo-groupes-replies-';

// Identifiant stable d'un groupe affiché, d'un dessin à l'autre :
// « a:<rayon> », « s:<magasin> » (liste « multi »), « p:<priorité> » ;
// « aucun » pour « Sans rayon » / « Sans magasin »
export function groupKey(group) {
  if (group.all) return 'tous';
  if (group.priority) return `p:${group.priority}`;
  if ('store' in group) return `s:${group.store?.id ?? 'aucun'}`;
  return `a:${group.aisle?.id ?? 'aucun'}`;
}

// Groupes qui peuvent exister : tous les rayons et magasins connus (actifs ou
// non), « sans », et les trois priorités. Un groupe absent de cette liste
// (rayon ou magasin supprimé) est oublié.
export function possibleGroupKeys(state) {
  return new Set([
    ...state.aisles.map((aisle) => `a:${aisle.id}`), 'a:aucun',
    ...state.stores.map((store) => `s:${store.id}`), 's:aucun',
    'p:high', 'p:normal', 'p:low', 'tous',
  ]);
}

export function loadFoldedGroups(listId, storage = () => globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage().getItem(FOLDED_PREFIX + listId) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}
export function saveFoldedGroups(listId, folded, storage = () => globalThis.localStorage) {
  try {
    if (folded.size) storage().setItem(FOLDED_PREFIX + listId, JSON.stringify([...folded]));
    else storage().removeItem(FOLDED_PREFIX + listId);
  } catch {
    // stockage indisponible : l'état n'est pas retenu, sans conséquence
  }
}
// Retire les groupes qui n'existent plus ; vrai si quelque chose a changé
export function pruneFoldedGroups(folded, possible) {
  let changed = false;
  for (const key of [...folded]) {
    if (!possible.has(key)) {
      folded.delete(key);
      changed = true;
    }
  }
  return changed;
}

// --- Zone des cochés repliée ou ouverte (même principe, clé
// listo-zone-repliee-<identifiant>). Ouverte par défaut. ---
export const ZONE_PREFIX = 'listo-zone-repliee-';
export function isZoneOpen(listId, storage = () => globalThis.localStorage) {
  try {
    return storage().getItem(ZONE_PREFIX + listId) !== '1';
  } catch {
    return true;
  }
}
export function rememberZone(listId, open, storage = () => globalThis.localStorage) {
  try {
    if (open) storage().removeItem(ZONE_PREFIX + listId);
    else storage().setItem(ZONE_PREFIX + listId, '1');
  } catch {
    // stockage indisponible : l'état n'est pas retenu, sans conséquence
  }
}

const nameCollator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const byName = (a, b) => nameCollator.compare(a.name, b.name);
const byRecent = (a, b) => b.lastActivity.localeCompare(a.lastActivity);
// Dernier recours, pour un ordre toujours le même : majuscules, puis numéro
const byExactName = (a, b) => compareNames(a.name, b.name) || String(a.id).localeCompare(String(b.id));

// Trie les cartes de « Mes listes » (calcul pur). À égalité de nom : la plus
// récente d'abord ; à égalité d'activité : ordre alphabétique.
export function sortSummaries(lists, sort = DEFAULT_LIST_SORT) {
  const compare = listSortFrom(sort) === 'alpha'
    ? (a, b) => byName(a, b) || byRecent(a, b) || byExactName(a, b)
    : (a, b) => byRecent(a, b) || byName(a, b) || byExactName(a, b);
  return [...lists].sort(compare);
}

// Ce téléphone peut-il modifier la liste ? Le serveur l'indique dans chaque
// liste (canEdit : propriétaire, ou contributeur) et refuse de
// toute façon chaque écriture d'un invité en lecture seule ; l'écran s'en sert
// seulement pour ne pas proposer ce qui serait refusé. Une copie gardée
// d'avant cette information (aucun canEdit) reste modifiable jusqu'à la
// prochaine synchronisation.
export function canEditList(list) {
  return Boolean(list) && list.canEdit !== false;
}

// --- Nouveautés (server/news.js) ---
// Ce que les autres membres ont ajouté ou modifié depuis ma dernière visite,
// calculé par le serveur et gardé tel quel dans la copie locale.

// Nouveautés d'une liste à montrer, ou null : « Nouveautés » désactivé,
// liste en sourdine, ou rien de neuf
export function listNews(state, listId) {
  const news = state.news?.lists?.[listId];
  if (!state.news?.enabled || !news || news.muted) return null;
  if (!news.count && !news.behind) return null;
  return news;
}

// Texte de la pastille de « Mes listes » : « 3 », « 30+ » (repère plus ancien
// que le journal gardé, 30 jours), ou « » (rien)
export function newsBadge(state, listId) {
  const news = listNews(state, listId);
  if (!news) return '';
  return news.behind ? '30+' : String(news.count);
}

// Total pour le badge de l'icône de l'application (listes hors sourdine)
export function newsTotal(state) {
  let total = 0;
  for (const listId of state.listIds) {
    const news = listNews(state, listId);
    if (news) total += news.behind ? Math.max(30, news.count) : news.count;
  }
  return total;
}

// Repère à envoyer (« vu ») : le dernier événement de la liste, s'il est
// plus récent que mon repère ; sinon null (rien à envoyer)
export function seenTarget(state, listId) {
  const news = state.news?.lists?.[listId];
  if (!news) return null;
  return (news.lastEventId ?? 0) > (news.seen ?? 0) || news.count > 0 || news.behind ? news.lastEventId ?? 0 : null;
}

export const isListMuted = (state, listId) => Boolean(state.news?.lists?.[listId]?.muted);

// « Après l'ajout » : 'quick' (rester sur la liste) ou 'detail' (ouvrir la
// fiche de l'élément ajouté). Sans choix, une nouvelle liste de courses
// reste sur la liste, une autre ouvre la fiche. Une copie d'avant ce
// réglage (pas encore synchronisée) : rester sur la liste, comme avant.
export const ADD_MODES = ['quick', 'detail'];
export const defaultAddMode = (isShopping) => (isShopping ? 'quick' : 'detail');
export const addModeOf = (list) => (list?.addMode === 'detail' ? 'detail' : 'quick');

// Priorité et échéance utilisées dans cette liste ? Priorité : listes de
// tâches et d'envies ; échéance : listes de tâches ; chacune selon son
// réglage (choisi par le propriétaire). Une copie gardée d'avant ces réglages (aucune valeur) les
// montre, comme avant, jusqu'à la prochaine synchronisation. Les valeurs des
// éléments ne sont jamais effacées : un réglage désactivé les cache.
export function listOptions(list) {
  return {
    priority: Boolean(list) && usesPriority(list) && list.priorityEnabled !== false,
    due: Boolean(list) && usesDue(list) && list.dueEnabled !== false,
  };
}

// Tris proposés : liste de courses, « par rayon » (ou « par magasin » pour
// une liste « multi ») puis l'ordre alphabétique ; autre liste, l'ordre
// alphabétique toujours, « par priorité » et « par échéance » seulement si
// le réglage est activé. Le premier est le tri par défaut.
export function availableSorts(list) {
  if (isShoppingList(list)) return ['aisle', 'alpha'];
  const options = listOptions(list);
  return ['alpha', 'priority', 'due'].filter((sort) => sort === 'alpha' || (sort === 'priority' && options.priority) || (sort === 'due' && options.due));
}
export const defaultSort = (list) => availableSorts(list)[0];

// Tri à appliquer : le choix gardé sur ce téléphone s'il est encore proposé,
// sinon le tri par défaut de la liste (le choix gardé n'est pas effacé : il
// revient si le réglage est réactivé)
export function effectiveSort(list, sort) {
  const wanted = itemSortFrom(sort);
  return availableSorts(list).includes(wanted) ? wanted : defaultSort(list);
}

// Cartes de « Mes listes » : nombre d'éléments, restants, dernière activité,
// triées selon le choix (sort : 'recent' par défaut, ou 'alpha')
export function computeSummaries(state, { sort = DEFAULT_LIST_SORT } = {}) {
  return sortSummaries([...state.lists.values()]
    .map((list) => {
      const items = itemsOf(state, list.id);
      const lastItem = items.reduce((max, item) => (item.updatedAt > max ? item.updatedAt : max), '');
      return {
        ...list,
        total: items.length,
        remaining: items.filter((item) => !item.checked).length,
        lastActivity: [list.updatedAt, list.lastActivity ?? '', lastItem].sort().at(-1),
      };
    }), sort);
}

// Une liste prête à afficher : ses articles à acheter groupés par rayon et
// triés (groups), ses articles cochés dans l'ordre de la zone « Dans le
// panier » / « Terminés » (done, du plus récemment coché au plus ancien), et
// leur nombre. null si la liste n'est pas (ou plus) accessible.
// Dans une liste « multi », les groupes sont des magasins (group.store) au
// lieu des rayons (group.aisle).
// sort : tri choisi sur ce téléphone (voir availableSorts ; sans choix, le
// tri par défaut de la liste). Liste de courses en ordre alphabétique : un
// seul groupe « À acheter » (group.all).
export function computeListView(state, listId, { sort = null } = {}) {
  const list = state.lists.get(listId);
  if (!list) return null;
  const items = itemsOf(state, listId);
  const multi = isMultiList(list);
  const { groups, done } = splitDone(items, state.aisles, isShoppingList(list), { byStore: multi, stores: state.stores, sort: effectiveSort(list, sort) });
  return {
    list,
    multi,
    groups,
    done,
    checked: done.length,
    total: items.length,
    // Liste d'envies : réservations par souhait (Map), seulement si le
    // serveur les a envoyées pour cette liste ; sinon null (bénéficiaire,
    // ou autre type de liste)
    reservations: reservationsOf(state, listId),
  };
}

// Réservations d'une liste d'envies telles que reçues du serveur : Map
// <souhait> -> { itemId, userId, displayName }, ou null si le serveur n'en a
// envoyé aucune pour cette liste (le bénéficiaire n'en reçoit jamais)
export function reservationsOf(state, listId) {
  const rows = state.reservations?.[listId];
  if (!Array.isArray(rows)) return null;
  return new Map(rows.map((row) => [row.itemId, row]));
}

// Magasins proposés aux articles d'une liste « multi » : ceux que regroupe son
// magasin, actifs, par ordre alphabétique
export function storeChoices(state, list) {
  const multi = state.stores.find((store) => store.id === list.store?.id);
  const ids = new Set(multi?.storeIds ?? []);
  return activeOnly(state.stores.filter((store) => ids.has(store.id)));
}

// Magasin habituel d'un article dans une liste « multi » (null si inconnu)
export function usualStoreFor(state, list, name) {
  return usualStore(state.history, name, storeChoices(state, list).map((store) => store.id));
}

// Rayon habituel d'un article dans une liste à magasin simple (null si inconnu)
export function usualAisleFor(state, list, name) {
  const active = new Set(state.aisles.filter((aisle) => aisle.active).map((aisle) => aisle.id));
  return usualAisle(state.history, name, list.store?.id ?? null, (id) => active.has(id));
}

// Suggestions d'autocomplétion (même règle que le serveur), avec le nom du
// rayon habituel s'il est encore actif.
export function computeSuggestions(state, typed, limit = 5) {
  const aisleName = new Map(state.aisles.filter((a) => a.active).map((a) => [a.id, a.name]));
  return suggest(state.history, typed, limit).map((entry) => ({
    name: entry.name,
    aisleId: aisleName.has(entry.aisleId) ? entry.aisleId : null,
    aisleName: aisleName.get(entry.aisleId) ?? null,
  }));
}

// Vrai si ce nom d'article est déjà connu (dans l'historique commun)
export function isKnownItem(state, name) {
  return isKnownName(state.history, name);
}

// Éléments actifs (proposés pour une nouvelle liste ou un nouvel article),
// par ordre alphabétique français
export function activeOnly(rows) {
  return rows.filter((row) => row.active).sort((a, b) => compareNames(a.name, b.name));
}

// --- Mode scan (listes de courses) ---

// Article déjà dans la liste : même code-barres, ou même nom (majuscules et
// accents ignorés). Renvoie null, ou { where, by, name } : where = 'list' (à
// acheter) ou 'cart' (coché : dans le panier) ; by = 'code' ou 'name' (le
// code passe avant le nom) ; name = nom de l'article trouvé.
export function duplicateOf(view, name, ean = null) {
  if (!view) return null;
  const all = [...view.groups.flatMap((group) => group.items), ...view.done];
  const wanted = normalizeItemName(name);
  const tests = [
    ['code', (item) => Boolean(ean) && item.ean === ean],
    ['name', (item) => Boolean(wanted) && normalizeItemName(item.name) === wanted],
  ];
  for (const [by, same] of tests) {
    const found = all.filter(same);
    if (!found.length) continue;
    const first = found.find((item) => !item.checked) ?? found[0];
    return { where: first.checked ? 'cart' : 'list', by, name: first.name };
  }
  return null;
}

// Texte de l'avertissement « Déjà dans la liste »
export function duplicateText(duplicate) {
  const place = duplicate.where === 'cart' ? 'Déjà dans le panier (coché)' : 'Déjà dans la liste';
  return duplicate.by === 'code' ? `${place} : « ${duplicate.name} » a ce code-barres.` : `${place}.`;
}

// Scan pour cocher : article de la liste ouverte qui porte ce code-barres,
// d'après les données déjà sur le téléphone (aucun appel au serveur : marche
// hors ligne). Plusieurs articles avec le même code : le premier non coché
// (dans l'ordre de la liste), sinon le dernier coché. null si aucun.
export function listItemForEan(view, ean) {
  if (!view || !ean) return null;
  const todo = view.groups.flatMap((group) => group.items).filter((item) => !item.checked && item.ean === ean);
  if (todo.length) return todo[0];
  const done = view.done.filter((item) => item.ean === ean);
  if (!done.length) return null;
  return done.reduce((last, item) => ((item.checkedAt ?? '') > (last.checkedAt ?? '') ? item : last));
}

// Mes produits (partie E) : article d'une autre de mes listes qui porte ce
// code-barres, d'après les données du téléphone (marche hors ligne) ; le
// plus récemment modifié. Les articles supprimés n'y sont plus : le serveur
// les cherche ensuite. null si aucun.
export function knownItemForEan(state, ean, { exceptListId = null } = {}) {
  if (!state || !ean) return null;
  let best = null;
  for (const item of state.items.values()) {
    if (item.ean !== ean || item.listId === exceptListId) continue;
    if (!best || (item.updatedAt ?? '') > (best.updatedAt ?? '')) best = item;
  }
  return best;
}
