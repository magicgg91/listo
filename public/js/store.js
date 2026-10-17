// Copie locale des données (listes, articles, rayons, magasins, catégories,
// historique), reçue du serveur par GET /api/sync, et calculs pour l'écran.
//
// Les écrans lisent cette copie ; chaque modification réussie y est
// reportée tout de suite (sans attendre une nouvelle synchronisation).
// À l'étape 7, cette copie sera aussi gardée sur le téléphone (IndexedDB)
// pour fonctionner sans réseau.
//
// Les fonctions « calculer… » sont pures : elles ne dépendent ni du réseau
// ni de l'écran, et sont testées automatiquement (test/front.test.js).

import { groupItems, compareNames } from './sorting.js';
import { normalizeItemName, suggest } from './history.js';

// --- État vide ---
export function emptyState() {
  return {
    loaded: false,
    serverTime: null,
    lists: new Map(),       // id -> liste (telle que décrite par le serveur)
    items: new Map(),       // id -> article (non supprimé)
    listIds: new Set(),     // listes auxquelles j'ai accès
    categories: [],
    stores: [],
    aisles: [],
    history: [],
  };
}

// Remplace tout par une synchronisation complète (réponse de /api/sync)
export function loadSync(state, data) {
  state.serverTime = data.serverTime;
  state.listIds = new Set(data.listIds);
  state.lists = new Map(data.lists.filter((l) => !l.deletedAt && state.listIds.has(l.id)).map((l) => [l.id, l]));
  state.items = new Map(data.items.filter((i) => !i.deletedAt && state.listIds.has(i.listId)).map((i) => [i.id, i]));
  state.categories = data.categories;
  state.stores = data.stores;
  state.aisles = data.aisles;
  state.history = data.history;
  state.loaded = true;
  return state;
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

// Met à jour l'historique local comme le fait le serveur : une utilisation
// de plus pour un ajout (count = 1, 0 pour une modification), et le rayon
// s'il est connu.
export function rememberItem(state, name, aisleId, { count = 1, now = new Date().toISOString() } = {}) {
  const key = normalizeItemName(name);
  const entry = state.history.find((e) => e.nameNormalized === key);
  if (entry) {
    entry.useCount += count;
    entry.lastUsedAt = now;
    if (aisleId !== null && aisleId !== undefined) entry.aisleId = aisleId;
  } else {
    state.history.push({ name, nameNormalized: key, aisleId: aisleId ?? null, useCount: 1, lastUsedAt: now });
  }
}

// --- Calculs pour l'écran ---

const itemsOf = (state, listId) => [...state.items.values()].filter((item) => item.listId === listId);

// Mes listes, de la plus récemment active à la plus ancienne, avec le nombre
// d'articles restants et le nombre total d'articles.
export function computeSummaries(state) {
  return [...state.lists.values()]
    .map((list) => {
      const items = itemsOf(state, list.id);
      const lastItem = items.reduce((max, item) => (item.updatedAt > max ? item.updatedAt : max), '');
      return {
        ...list,
        total: items.length,
        remaining: items.filter((item) => !item.checked).length,
        lastActivity: [list.updatedAt, list.lastActivity ?? '', lastItem].sort().at(-1),
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity) || compareNames(a.name, b.name));
}

// Une liste prête à afficher : ses articles groupés par rayon et triés, et
// le nombre d'articles cochés. null si la liste n'est pas (ou plus) accessible.
export function computeListView(state, listId) {
  const list = state.lists.get(listId);
  if (!list) return null;
  const items = itemsOf(state, listId);
  return {
    list,
    groups: groupItems(items, state.aisles, list.category.isShopping),
    checked: items.filter((item) => item.checked).length,
    total: items.length,
  };
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
  const key = normalizeItemName(name);
  return state.history.some((entry) => entry.nameNormalized === key);
}

// Éléments actifs (proposés pour une nouvelle liste ou un nouvel article),
// par ordre alphabétique français
export function activeOnly(rows) {
  return rows.filter((row) => row.active).sort((a, b) => compareNames(a.name, b.name));
}
