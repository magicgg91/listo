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
import { LIST_TYPES, isListType, isShoppingList, usesPriority, usesDue, usesAssign, typeOf } from './list-types.js';
import { modeOf, turnAfterCheck } from './assign.js';
import { nestsSubtasks, nestItems, parentOf, orderSubtasks, nextPosition, reorderedIds } from './subtasks.js';
import { t, compareText } from './i18n.js';
import { suggest, habitual, hideHabitual, isKnownName, usualAisle, usualStore, recordUse, moveUse, normalizeItemName } from './history.js';
import { aislesForStore, offeredAisles, rematchAisle } from './aisles.js';
import { NOTE_TITLE_MAX, NOTE_BODY_MAX } from './notes.js';
import { cleanLabelIds } from './labels.js';
import { normalizeHome, homeChangeProblem, applyHomeChange } from './home-tiles.js';
import { normalizeFeatures, featuresChangeProblem, applyFeaturesChange, notesOn, projectsOn } from './features.js';
import { emptyProjects, projectsSnapshot, projectsFromSnapshot, loadProjects, applyProjectOp, PROJECT_OP_TYPES } from './project-store.js';

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
    // « À offrir » (liste automatique de mes réservations, gifts.js) : pour
    // MES seules participations en cours, la date de ma réservation
    // (reservedAt, souhait -> date) et les souhaits que j'ai cochés
    // « Acheté » (bought). Privé : le serveur ne l'envoie qu'à moi.
    // Remplacé en entier à chaque synchronisation.
    gifts: emptyGifts(),
    news: emptyNews(),      // mes nouveautés (voir « Nouveautés » plus bas)
    // Mon réglage « Accueil » (Réglages › Accueil, home-tiles.js), le même
    // sur tous mes appareils ; valeurs de départ avant la première
    // synchronisation (Accueil affiché, toutes les tuiles, ordre de départ)
    home: normalizeHome(null),
    // Mon réglage « Fonctions » (Réglages › Fonctions, features.js), de
    // même ; valeurs de départ : tout est utilisé
    features: normalizeFeatures(null),
    trash: new Map(),       // articles supprimés ici (pour « Annuler »), en mémoire seulement
    // Notes (notes.js, server/notes.js) : celles que je vois, corbeille
    // comprise (deletedAt rempli)
    notes: new Map(),       // id -> note
    noteIds: new Set(),     // notes auxquelles j'ai accès
    pinnedNotes: new Set(), // notes que j'ai épinglées (propre à chaque personne)
    // Étiquettes des notes (labels.js, server/labels.js) : toute la réserve,
    // commune au foyer ({ id, name, color }), remplacée en entier à chaque
    // synchronisation ; chaque note porte les numéros des siennes (labelIds)
    labels: [],
    // Notes « À vérifier » : enregistrement refusé parce que la note a
    // changé entre-temps (deux appareils, ou deux personnes) ; mon texte
    // est gardé ici, sur ce téléphone seulement, jusqu'à mon choix
    // (id -> { title, body, at }). Jamais remplacé par une synchronisation.
    noteConflicts: new Map(),
    // Nouveautés des notes (server/notes.js, étape 3) : notes modifiées par
    // quelqu'un d'autre depuis ma dernière lecture (unread), et celles dont
    // j'ai masqué les nouveautés (muted). Remplacées en entier à chaque
    // synchronisation.
    noteNews: emptyNoteNews(),
    // Page Notifications (server/inbox.js, étape 4) : la dernière copie
    // reçue de GET /api/inbox (lignes déjà mises en phrases par le serveur)
    // et son empreinte (stamp) ; la synchronisation donne l'empreinte du
    // serveur, la page est relue quand elle diffère. Gardée sur le
    // téléphone : la page s'affiche hors ligne.
    inbox: emptyInbox(),
    // Projets (project-store.js, server/projects.js) : ceux que je vois,
    // leurs cartes et mes réglages ; rien quand j'ai coupé les projets
    ...emptyProjects(),
  };
}

const emptyInbox = () => ({ rows: [], stamp: null, loaded: false });

const emptyGifts = () => ({ reservedAt: {}, bought: new Set() });
// « À offrir » reçu du serveur (/api/sync) ou relu sur le téléphone
const giftsFrom = (value) => ({
  reservedAt: value?.reservedAt && typeof value.reservedAt === 'object' ? { ...value.reservedAt } : {},
  bought: new Set(Array.isArray(value?.bought) ? value.bought : []),
});

const emptyNoteNews = () => ({ unread: new Set(), muted: new Set() });

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
// Version 4 : notes (23 novembre 2026). Même chose : une copie sans notes
// est rechargée entièrement (une synchronisation « depuis » n'apporterait
// pas les notes plus anciennes).
// Version 5 : partage des notes (droit, personnes, nouveautés). Une copie
// de la version 4 est rechargée entièrement : ses notes n'ont pas leurs
// personnes, et une synchronisation « depuis » ne les apporterait pas.
export const SNAPSHOT_VERSION = 5;

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
    home: state.home,
    features: state.features,
    reservations: state.reservations,
    gifts: { reservedAt: state.gifts.reservedAt, bought: [...state.gifts.bought] },
    notes: [...state.notes.values()],
    noteIds: [...state.noteIds],
    pinnedNotes: [...state.pinnedNotes],
    labels: state.labels,
    noteConflicts: [...state.noteConflicts],
    noteNews: { unread: [...state.noteNews.unread], muted: [...state.noteNews.muted] },
    inbox: state.inbox,
    ...projectsSnapshot(state),
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
    // (copie d'avant le réglage « Accueil » : valeurs de départ, remplacées
    // à la synchronisation suivante)
    state.home = normalizeHome(snapshot.home);
    // (copie d'avant le réglage « Fonctions » : tout est utilisé)
    state.features = normalizeFeatures(snapshot.features);
    state.reservations = snapshot.reservations ?? {};
    // (copie d'avant « À offrir » : vide, remplie à la synchronisation suivante)
    state.gifts = giftsFrom(snapshot.gifts);
    state.notes = new Map((snapshot.notes ?? []).map((note) => [note.id, note]));
    state.noteIds = new Set(snapshot.noteIds ?? []);
    state.pinnedNotes = new Set(snapshot.pinnedNotes ?? []);
    // (copie d'avant les étiquettes : aucune, remplies à la synchronisation
    // suivante ; ses notes n'en portaient aucune, rien d'autre à recharger)
    state.labels = Array.isArray(snapshot.labels) ? [...snapshot.labels] : [];
    state.noteConflicts = new Map(snapshot.noteConflicts ?? []);
    state.noteNews = { unread: new Set(snapshot.noteNews?.unread ?? []), muted: new Set(snapshot.noteNews?.muted ?? []) };
    // (copie d'avant la page Notifications : vide, relue au premier passage du réseau)
    state.inbox = Array.isArray(snapshot.inbox?.rows) ? { rows: snapshot.inbox.rows, stamp: snapshot.inbox.stamp ?? null, loaded: true } : emptyInbox();
    // (copie d'avant les projets : aucun ; ils arrivent tous quand la
    // personne allume la fonction, voir projectsReload)
    projectsFromSnapshot(state, snapshot);
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
  state.gifts = giftsFrom(data.gifts);
  if (data.users) state.users = data.users;
  if (data.news) state.news = data.news;
  if (data.home) state.home = normalizeHome(data.home);
  if (data.features) state.features = normalizeFeatures(data.features);
  loadNotes(state, data, { full: true });
  loadProjects(state, data, { full: true });
  state.loaded = true;
  refreshListReferences(state);
  return state;
}

// Notes reçues du serveur (/api/sync) : full, synchronisation complète ;
// sinon, seulement les notes changées depuis. Épingles : toujours en entier. Une note absente de noteIds n'est plus visible
// (effacée, ou accès retiré) : elle disparaît. Les notes « À vérifier »
// (noteConflicts) restent : mon texte n'est jamais perdu.
function loadNotes(state, data, { full }) {
  if (!Array.isArray(data.noteIds)) return;
  state.noteIds = new Set(data.noteIds);
  if (full) state.notes = new Map();
  for (const note of data.notes ?? []) if (state.noteIds.has(note.id)) state.notes.set(note.id, note);
  for (const id of [...state.notes.keys()]) if (!state.noteIds.has(id)) state.notes.delete(id);
  state.pinnedNotes = new Set(data.pinnedNotes ?? []);
  // Étiquettes : toute la réserve, en entier à chaque synchronisation
  if (Array.isArray(data.labels)) state.labels = data.labels;
  // Nouveautés des notes : en entier à chaque synchronisation
  if (data.noteNews) state.noteNews = { unread: new Set(data.noteNews.unread ?? []), muted: new Set(data.noteNews.muted ?? []) };
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
  // Réglage « Accueil » : de même
  if (data.home) state.home = normalizeHome(data.home);
  // Réglage « Fonctions » : de même. Projets rallumés (sur un autre
  // appareil) : tout recharger, le serveur n'en envoyait rien
  if (data.features) {
    if (projectsOn(data.features) && !projectsOn(state.features)) state.projectsReload = true;
    state.features = normalizeFeatures(data.features);
  }
  // Réservations : en entier à chaque synchronisation (une libération
  // disparaît d'elle-même) ; rien pour une liste où je suis bénéficiaire
  state.reservations = data.reservations ?? {};
  // « À offrir » : de même, en entier (une réservation terminée emporte sa
  // marque « Acheté »)
  state.gifts = giftsFrom(data.gifts);
  loadNotes(state, data, { full: false });
  loadProjects(state, data, { full: false });
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
  // Projets (project-store.js, même effet que server/projects.js) ; rien
  // quand je les ai coupés (le serveur les refuse alors)
  if (PROJECT_OP_TYPES.includes(op.type)) {
    if (projectsOn(state.features)) applyProjectOp(state, op, { user, now });
    return;
  }
  const item = op.itemId ? state.items.get(op.itemId) : null;
  switch (op.type) {
    case 'list.create': {
      // Type : celui demandé (listType ; le serveur refuse tout autre valeur)
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
      // Destinataire (un autre compte) : membre « Peut modifier » d'office,
      // comme sur le serveur (le formulaire n'envoie plus le partage)
      const beneficiary = type === 'wishes' && op.forUserId && op.forUserId !== user.id ? state.users.find((u) => u.id === op.forUserId) : null;
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
        assignEnabled: op.assignEnabled === true,
        subtasksEnabled: op.subtasksEnabled === true,
        addMode: ADD_MODES.includes(op.addMode) ? op.addMode : defaultAddMode(isShoppingList(type)),
        members: [
          { id: user.id, username: user.username, displayName: user.displayName, active: true, isOwner: true, access: 'modification' },
          ...(beneficiary ? [{ id: beneficiary.id, username: beneficiary.username, displayName: beneficiary.displayName, active: true, isOwner: false, access: 'modification' }] : []),
        ],
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
      if (typeof op.assignEnabled === 'boolean') next.assignEnabled = op.assignEnabled;
      if (typeof op.subtasksEnabled === 'boolean') next.subtasksEnabled = op.subtasksEnabled;
      if (ADD_MODES.includes(op.addMode)) next.addMode = op.addMode;
      state.lists.set(list.id, next);
      // Nouveau magasin (ou retour au type « Courses ») : chaque article dont
      // le rayon n'est plus proposé va dans le rayon de même nom, sinon
      // « Sans rayon » (même règle que le serveur, public/js/aisles.js)
      const storeBefore = (list.store ?? list.keptStore)?.id ?? null;
      if (isShoppingList(next) && !isMultiList(next) && ((next.store?.id ?? null) !== storeBefore || next.type !== list.type)) {
        rematchItems(state, list.id, next.store?.id ?? null, now);
      }
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
    // Réglage « Accueil » (mêmes règles que le serveur, home-tiles.js) :
    // effet tout de suite, hors ligne compris
    case 'account.home':
      if (homeChangeProblem(op)) return;
      state.home = applyHomeChange(state.home, op);
      return;
    // Réglage « Fonctions » (mêmes règles que le serveur, features.js) :
    // effet tout de suite, hors ligne compris
    case 'account.features': {
      const { id, type, ...change } = op;
      if (featuresChangeProblem(change)) return;
      const next = applyFeaturesChange(state.features, change);
      // Projets rallumés : la prochaine synchronisation recharge tout
      if (projectsOn(next) && !projectsOn(state.features)) state.projectsReload = true;
      state.features = next;
      return;
    }
    // « Acheté » dans « À offrir » (propre à moi ; le serveur vérifie que
    // je réserve bien ce souhait en ce moment)
    case 'gift.bought':
      if (typeof op.bought !== 'boolean' || !op.itemId) return;
      if (op.bought) state.gifts.bought.add(op.itemId);
      else state.gifts.bought.delete(op.itemId);
      return;
    case 'list.removeChecked': {
      // Sous-tâches : une sous-tâche cochée sous une principale à faire
      // reste à sa place (même règle que le serveur)
      for (const it of checkedToRemove(state, op.listId)) state.items.delete(it.id);
      return;
    }
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
        priority: op.priority ?? 'normal', // priorité et échéance dès l'ajout (comme le serveur)
        dueDate: op.dueDate ?? null,
        repeat: op.repeat ?? null, // répétition (listes de tâches, repeat.js)
        assignedTo: op.assignedTo ?? (op.assignMode === 'turn' ? op.assignPeople?.[0] ?? null : null), // personne (de cette fois)
        // Plusieurs personnes ('all') ou chacun son tour ('turn') : assign.js
        assignMode: op.assignMode ?? 'one',
        assignPeople: op.assignMode && op.assignMode !== 'one' ? op.assignPeople ?? [] : [],
        dueTime: op.dueTime ?? null, // heure de l'échéance (« HH:MM ») et rappel (minutes avant)
        remindBefore: op.remindBefore ?? null,
        parentId: op.parentId ?? null, // tâche principale (sous-tâches, subtasks.js)
        // Ordre manuel : une nouvelle sous-tâche va à la fin (le serveur confirme)
        position: op.parentId ? nextPosition(itemsOf(state, op.listId).filter((it) => it.parentId === op.parentId)) : null,
        photoAt: null,
        checked: false,
        checkedAt: null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      // Nouvelle sous-tâche : sa principale cochée se décoche (comme le serveur)
      reopenParent(state, state.items.get(op.itemId), now);
      return;
    case 'item.update': {
      if (!item) return;
      const next = { ...item, updatedAt: now };
      // Seuls les champs présents changent (dueDate: null efface l'échéance,
      // ean: null le code-barres)
      for (const field of ['name', 'quantity', 'note', 'aisleId', 'storeId', 'priority', 'dueDate', 'repeat', 'assignedTo', 'assignMode', 'assignPeople', 'dueTime', 'remindBefore', 'ean', 'link', 'priceCents', 'parentId']) if (op[field] !== undefined) next[field] = op[field];
      // Attribution (mêmes règles que le serveur, assign.js) : une personne
      // demandée seule fait repasser en « une personne », sauf si c'est la
      // personne de cette fois d'un tour ; plusieurs : personne « de cette fois »
      if (op.assignedTo !== undefined && op.assignMode === undefined && !(modeOf(item) === 'turn' && (item.assignPeople ?? []).includes(op.assignedTo))) next.assignMode = 'one';
      if (modeOf(next) === 'one') next.assignPeople = [];
      if (modeOf(next) === 'all') next.assignedTo = null;
      // Effacer l'échéance arrête la répétition et efface l'heure ; effacer
      // l'heure efface le rappel (mêmes règles que le serveur)
      if (op.dueDate === null && op.repeat === undefined) next.repeat = null;
      // Plus de répétition : « chacun son tour » redevient « une personne »
      if (next.repeat == null && modeOf(next) === 'turn') Object.assign(next, { assignMode: 'one', assignPeople: [] });
      if (op.dueDate === null && op.dueTime === undefined) next.dueTime = null;
      if (next.dueTime == null && op.remindBefore === undefined) next.remindBefore = null;
      // Ordre manuel (comme le serveur) : rangée sous une autre principale,
      // à la fin de ses sous-tâches ; sortie, plus de place
      if (op.parentId !== undefined && (op.parentId ?? null) !== (item.parentId ?? null)) {
        next.position = op.parentId ? nextPosition(itemsOf(state, item.listId).filter((it) => it.parentId === op.parentId && it.id !== item.id)) : null;
      }
      state.items.set(item.id, next);
      // Tâche à faire rangée sous une principale cochée : celle-ci se décoche
      if (op.parentId) reopenParent(state, next, now);
      return;
    }
    // Retirer un article de « Souvent ajoutés » (même règle que le serveur)
    case 'habitual.hide': {
      const list = state.lists.get(op.listId);
      if (!list || !isShoppingList(list)) return;
      hideHabitual(state.history, { name: op.name, storeIds: habitualStoreIds(state, list), now });
      return;
    }
    case 'item.check':
      if (!item) return;
      // Tâche qui se répète : elle revient décochée à la date suivante
      // (nextDue, calculée par actions.js avec repeat.js)
      if (op.checked && op.nextDue) {
        // Chacun son tour : la fois suivante est pour la personne qui suit
        // celle qui a coché (assign.js, même règle que le serveur)
        const turn = modeOf(item) === 'turn' && state.lists.get(item.listId)?.assignEnabled === true;
        const assignedTo = turn ? turnAfterCheck(item.assignPeople ?? [], item.assignedTo ?? null, user?.id) : item.assignedTo ?? null;
        state.items.set(item.id, { ...item, dueDate: op.nextDue, assignedTo, checked: false, checkedAt: null, updatedAt: now });
        // Sous-tâches : toutes décochées pour la fois suivante
        for (const child of subtasksOf(state, item)) if (child.checked) state.items.set(child.id, { ...child, checked: false, checkedAt: null, updatedAt: now });
        return;
      }
      // Date du coché : celle du téléphone en attendant celle du serveur
      state.items.set(item.id, { ...item, checked: op.checked, checkedAt: op.checked ? item.checkedAt ?? now : null, updatedAt: now });
      // Sous-tâches (mêmes règles que le serveur) : cocher une principale
      // coche ses sous-tâches à faire ; décocher une sous-tâche décoche sa
      // principale cochée
      if (op.checked) {
        for (const child of subtasksOf(state, item)) if (!child.checked) state.items.set(child.id, { ...child, checked: true, checkedAt: now, updatedAt: now });
      } else {
        reopenParent(state, state.items.get(item.id), now);
      }
      return;
    // Ordre manuel des sous-tâches (comme le serveur) : places renumérotées
    case 'item.move': {
      if (!item || !nestsSubtasks(state.lists.get(item.listId))) return;
      const byId = new Map(itemsOf(state, item.listId).map((it) => [it.id, it]));
      const parent = parentOf(item, byId);
      if (!parent) return;
      const siblings = nestItems([...byId.values()], true).childrenOf.get(parent.id) ?? [];
      const order = reorderedIds(siblings, item.id, op.afterId ?? null);
      if (!order) return;
      order.forEach((id, index) => {
        const child = state.items.get(id);
        if (child.position !== index + 1) state.items.set(id, { ...child, position: index + 1, updatedAt: now });
      });
      return;
    }
    case 'item.delete':
      if (item) {
        // Sous-tâches : parties avec leur principale (deletedWith), revenues avec elle
        for (const child of subtasksOf(state, item)) {
          state.trash.set(child.id, { ...child, deletedWith: item.id });
          state.items.delete(child.id);
        }
        state.trash.set(item.id, item); // pour « Annuler »
        state.items.delete(item.id);
      }
      return;
    case 'note.create':
    case 'note.update':
    case 'note.delete':
    case 'note.restore':
    case 'note.purge':
    case 'note.pin':
    case 'note.seen':
    case 'note.mute':
    case 'note.labels':
      applyNoteOp(state, op, { user, now });
      return;
    // Page Notifications : lire, effacer (comme le serveur, server/inbox.js)
    case 'inbox.read':
    case 'inbox.delete':
      applyInboxOp(state, op, { now });
      return;
    case 'item.restore': {
      const old = state.trash.get(op.itemId);
      if (!old || !state.lists.has(old.listId)) return;
      const { deletedWith, ...back } = old;
      // Une sous-tâche dont la principale reste supprimée revient comme une
      // tâche ordinaire (comme le serveur)
      if (back.parentId && !state.items.has(back.parentId)) back.parentId = null;
      state.items.set(back.id, { ...back, updatedAt: now });
      for (const [id, child] of [...state.trash]) {
        if (child.deletedWith !== old.id) continue;
        const { deletedWith: _, ...restored } = child;
        state.items.set(id, { ...restored, updatedAt: now });
        state.trash.delete(id);
      }
      return;
    }
    default:
  }
}

// --- Page Notifications : même effet que le serveur (server/inbox.js) ---

// Lignes visées : ids, ou toutes celles reçues jusqu'à upTo (« Tout… ») ;
// une ligne arrivée après n'est pas touchée
function inboxSelected(row, op) {
  if (Array.isArray(op.ids)) return op.ids.includes(row.id);
  return op.all === true && typeof op.upTo === 'string' && row.at <= op.upTo;
}
function applyInboxOp(state, op, { now }) {
  const rows = state.inbox?.rows ?? [];
  if (op.type === 'inbox.read') {
    state.inbox = { ...state.inbox, rows: rows.map((row) => (!row.read && inboxSelected(row, op) ? { ...row, read: true, readAt: now } : row)) };
  } else {
    state.inbox = { ...state.inbox, rows: rows.filter((row) => !inboxSelected(row, op)) };
  }
}

// Copie de la page reçue du serveur (GET /api/inbox) : remplacée en entier
export function loadInbox(state, data) {
  state.inbox = { rows: Array.isArray(data?.rows) ? data.rows : [], stamp: data?.stamp ?? null, loaded: true };
  return state;
}

// Lignes de la page montrées : toutes, sauf celles des notes quand je les
// ai coupées, et celles des projets quand je les ai coupés, sauf
// « Partage » (l'invitation à les allumer) (Réglages › Fonctions,
// features.js ; gardées, elles reviennent quand je les rallume)
export function inboxShownRows(state) {
  const rows = state.inbox?.rows ?? [];
  const notes = notesOn(state.features);
  const projects = projectsOn(state.features);
  return rows.filter((row) => (notes || row.targetType !== 'note')
    && (projects || !['project', 'card'].includes(row.targetType) || row.kind === 'sharing'));
}

// Nombre de notifications non lues (pastille de la cloche)
export const inboxUnread = (state) => inboxShownRows(state).filter((row) => !row.read).length;

// Lignes non lues dont la cible est cette liste (ou un de ses éléments),
// cette note, ou l'écran Échéances : ouvrir la cible les rend lues (une
// notification du téléphone touchée ouvre sa cible)
export function inboxRowsFor(state, { listId = null, noteId = null, deadlines = false, projectId = null, cardId = null }) {
  return (state.inbox?.rows ?? []).filter((row) => !row.read && row.target && (
    (listId && row.target.listId === listId)
    || (noteId && row.target.noteId === noteId)
    || (deadlines && row.target.type === 'deadlines')
    || (projectId && row.target.type === 'project' && row.target.projectId === projectId)
    || (cardId && row.target.type === 'card' && row.target.cardId === cardId))).map((row) => row.id);
}

// Cible d'une ligne encore ouverte sur CE téléphone ? (copie locale : une
// liste quittée, une note retirée ou un élément effacé ne s'ouvrent plus)
export function inboxTargetAvailable(state, target) {
  if (!target) return false;
  switch (target.type) {
    case 'deadlines': return true;
    case 'list': return state.lists.has(target.listId);
    case 'item': return state.lists.has(target.listId) && state.items.has(target.itemId);
    case 'note': {
      const note = state.notes.get(target.noteId);
      return Boolean(note) && !note.deletedAt;
    }
    // Projets (étape 3) ; « features » : Réglages › Fonctions (partage
    // d'un projet reçu projets coupés)
    case 'project': {
      const project = state.projects?.get(target.projectId);
      return Boolean(project) && !project.deletedAt;
    }
    case 'card': {
      const card = state.cards?.get(target.cardId);
      const project = card ? state.projects?.get(card.projectId) : null;
      return Boolean(card) && !card.deletedAt && Boolean(project) && !project.deletedAt;
    }
    case 'features': return true;
    default: return false;
  }
}

// --- Notes : même effet que le serveur (server/notes.js), hors ligne compris ---

// Titre et texte tels que le serveur les garde (une ligne pour le titre ;
// retours à la ligne du texte gardés)
export const cleanNoteTitle = (value) => String(value ?? '').normalize('NFC').replace(/[\r\n]+/g, ' ').trim().slice(0, NOTE_TITLE_MAX);
export const cleanNoteBody = (value) => String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').slice(0, NOTE_BODY_MAX);

function applyNoteOp(state, op, { user, now }) {
  const note = op.noteId ? state.notes.get(op.noteId) : null;
  switch (op.type) {
    case 'note.create': {
      if (state.notes.has(op.noteId)) return;
      state.notes.set(op.noteId, {
        id: op.noteId,
        title: cleanNoteTitle(op.title),
        body: cleanNoteBody(op.body),
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: user?.id ?? null,
        updatedByName: user?.displayName ?? null,
        deletedAt: null,
        ownerId: user?.id ?? null,
        access: 'owner',
        // Partagée avec personne (le serveur enverra les personnes)
        members: user ? [{ id: user.id, displayName: user.displayName, active: true, isOwner: true, access: 'modification' }] : [],
        labelIds: [],
      });
      state.noteIds.add(op.noteId);
      if (op.pinned === true) state.pinnedNotes.add(op.noteId);
      return;
    }
    case 'note.update':
      // Seulement sur la version prévue (sinon le serveur refusera : conflit)
      if (!note || note.version !== op.baseVersion) return;
      state.notes.set(note.id, {
        ...note,
        ...(op.title === undefined ? {} : { title: cleanNoteTitle(op.title) }),
        ...(op.body === undefined ? {} : { body: cleanNoteBody(op.body) }),
        version: note.version + 1,
        updatedAt: now,
        updatedBy: user?.id ?? null,
        updatedByName: user?.displayName ?? null,
      });
      state.noteNews.unread.delete(note.id); // ma propre modification
      return;
    case 'note.delete':
      if (note && !note.deletedAt) state.notes.set(note.id, { ...note, deletedAt: now, updatedAt: now });
      return;
    case 'note.restore':
      if (note?.deletedAt) state.notes.set(note.id, { ...note, deletedAt: null, updatedAt: now });
      return;
    case 'note.purge':
      for (const id of op.noteIds ?? []) {
        if (!state.notes.get(id)?.deletedAt) continue;
        state.notes.delete(id);
        state.noteIds.delete(id);
        state.pinnedNotes.delete(id);
      }
      return;
    case 'note.pin':
      if (!note || typeof op.pinned !== 'boolean') return;
      if (op.pinned) state.pinnedNotes.add(note.id);
      else state.pinnedNotes.delete(note.id);
      return;
    // Nouveautés : la note ouverte est lue (sur tous mes appareils, par le serveur)
    case 'note.seen':
      if (note && Number.isSafeInteger(op.upTo) && op.upTo >= note.version) state.noteNews.unread.delete(note.id);
      return;
    // Étiquettes de la note (propriétaire ou « Peut modifier ») : la liste
    // complète remplace l'ancienne ; ni version ni date de modification
    // (comme le serveur). Liste invalide, ou étiquette inconnue : rien ne
    // change (le serveur la refusera).
    case 'note.labels': {
      const ids = cleanLabelIds(op.labelIds);
      const known = new Set(state.labels.map((label) => label.id));
      if (!note || !canEditNote(note) || !ids || !ids.every((id) => known.has(id))) return;
      state.notes.set(note.id, { ...note, labelIds: ids });
      return;
    }
    // Menu de la note : « Masquer les nouveautés » / « Afficher… »
    case 'note.mute':
      if (!note || typeof op.muted !== 'boolean') return;
      if (op.muted) {
        state.noteNews.muted.add(note.id);
        state.noteNews.unread.delete(note.id);
      } else state.noteNews.muted.delete(note.id);
      return;
    default:
  }
}

// Range de nouveau les articles d'une liste qui change de magasin (storeId :
// magasin simple, ou null pour « aucun magasin ») : chaque article dont le
// rayon ne sert pas dans ce magasin va dans le rayon proposé de même nom,
// sinon « Sans rayon » (rematchAisle, la même règle que le serveur)
function rematchItems(state, listId, storeId, now) {
  for (const item of itemsOf(state, listId)) {
    if (item.aisleId === null || item.aisleId === undefined) continue;
    const aisleId = rematchAisle(item.aisleId, state.aisles, storeId);
    if (aisleId !== item.aisleId) state.items.set(item.id, { ...item, aisleId, updatedAt: now });
  }
}

// Articles d'une liste qui avaient un rayon (before : Map identifiant ->
// rayon, prise avant un changement de magasin) et n'en ont plus : ceux que
// la feuille « Ranger les articles » propose de ranger, par ordre alphabétique
export function itemsWithoutAisle(state, listId, before) {
  return itemsOf(state, listId)
    .filter((item) => (item.aisleId ?? null) === null && (before.get(item.id) ?? null) !== null)
    .sort((a, b) => compareNames(a.name, b.name));
}

// Rayon de chaque article d'une liste, avant un changement (voir itemsWithoutAisle)
export const aislesOfItems = (state, listId) => new Map(itemsOf(state, listId).map((item) => [item.id, item.aisleId ?? null]));

// Éléments retirés par « Retirer les terminés » : les cochés, sauf une
// sous-tâche cochée sous une principale à faire (elle n'est pas dans les
// terminés ; même règle que le serveur)
export function checkedToRemove(state, listId) {
  const nest = nestsSubtasks(state.lists.get(listId));
  const items = itemsOf(state, listId);
  const byId = new Map(items.map((it) => [it.id, it]));
  return items.filter((it) => it.checked && !(nest && parentOf(it, byId)?.checked === false));
}

// Sous-tâches présentes d'une tâche, si la liste les regroupe (vide sinon,
// ou si la tâche est elle-même une sous-tâche)
function subtasksOf(state, item) {
  if (!nestsSubtasks(state.lists.get(item.listId))) return [];
  return nestItems(itemsOf(state, item.listId), true).childrenOf.get(item.id) ?? [];
}

// Une sous-tâche à faire sous une principale cochée : la principale se
// décoche (il reste quelque chose à faire ; même règle que le serveur)
function reopenParent(state, item, now) {
  if (!item || item.checked || !nestsSubtasks(state.lists.get(item.listId))) return;
  const parent = parentOf(item, new Map(itemsOf(state, item.listId).map((it) => [it.id, it])));
  if (parent?.checked) state.items.set(parent.id, { ...parent, checked: false, checkedAt: null, updatedAt: now });
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

// --- Filtre des types de « Mes listes » (téléphone) : le dernier choisi
// est retenu sur ce téléphone (décision du 11 novembre 2026). 'all'
// (Toutes) par défaut ; toute autre valeur inconnue y retombe.
export const TYPE_FILTER_KEY = 'listo-type-listes';
export const typeFilterFrom = (value) => (value === 'all' || isListType(value) ? value : 'all');
export function loadTypeFilter(storage = () => globalThis.localStorage) {
  try {
    return typeFilterFrom(storage().getItem(TYPE_FILTER_KEY));
  } catch {
    return 'all';
  }
}
export function saveTypeFilter(value, storage = () => globalThis.localStorage) {
  try {
    storage().setItem(TYPE_FILTER_KEY, typeFilterFrom(value));
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
  pruneByPrefix([ITEM_SORT_PREFIX, FOLDED_PREFIX, ZONE_PREFIX, OPEN_SUBTASKS_PREFIX], listIds, storage);
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

// --- Sous-tâches dépliées d'une liste (subtasks.js) ---
// Repliées par défaut ; les tâches principales dépliées sont mémorisées sur
// ce téléphone seulement, pour chaque liste (clé
// listo-sous-taches-ouvertes-<identifiant>), jamais envoyées au serveur.
// Une tâche disparue est oubliée au prochain dépliage.
export const OPEN_SUBTASKS_PREFIX = 'listo-sous-taches-ouvertes-';
export function loadOpenSubtasks(listId, storage = () => globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage().getItem(OPEN_SUBTASKS_PREFIX + listId) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}
export function saveOpenSubtasks(listId, open, storage = () => globalThis.localStorage) {
  try {
    if (open.size) storage().setItem(OPEN_SUBTASKS_PREFIX + listId, JSON.stringify([...open]));
    else storage().removeItem(OPEN_SUBTASKS_PREFIX + listId);
  } catch {
    // sans importance : l'état vaut pour cette visite
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
  if ('person' in group) return `u:${group.person ?? 'aucun'}`;
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
    // Par personne : les membres de mes listes, et « Personne »
    ...[...state.lists.values()].flatMap((list) => (list.members ?? []).map((m) => `u:${m.id}`)), 'u:aucun', 'u:all',
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

// Ordre alphabétique de la langue des écrans (majuscules et accents ignorés)
const byName = (a, b) => compareText(a.name, b.name, { sensitivity: 'base', numeric: true });
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

// --- Notes partagées (étape 3) ---
// Nouveautés d'une note : modifiée par quelqu'un d'autre depuis ma dernière
// lecture (calculé par le serveur), « Nouveautés » activé, note pas en
// sourdine ni dans la corbeille
// (notes coupées dans Réglages › Fonctions : jamais de nouveautés)
export function isNoteUnread(state, noteId) {
  const note = state.notes.get(noteId);
  return Boolean(note) && !note.deletedAt && state.news?.enabled !== false && notesOn(state.features)
    && state.noteNews.unread.has(noteId) && !state.noteNews.muted.has(noteId);
}
// Une note au moins a des nouveautés (point de la tuile Notes, du menu de gauche)
export const notesHaveNews = (state) => [...state.noteNews.unread].some((id) => isNoteUnread(state, id));
export const isNoteNewsMuted = (state, noteId) => state.noteNews.muted.has(noteId);
// Droit sur une note : propriétaire ou « Peut modifier » écrivent ; une
// copie d'avant le partage (sans droit) est la mienne
export const canEditNote = (note) => Boolean(note) && (note.access === undefined || note.access === 'owner' || note.access === 'edit');
export const isNoteOwner = (note) => Boolean(note) && (note.access === undefined || note.access === 'owner');
// Personnes d'une note partagée (comptes actifs, le propriétaire d'abord) ;
// [] si elle n'est partagée avec personne
export function notePeople(note) {
  const people = (note?.members ?? []).filter((m) => m.active !== false || m.isOwner);
  if (people.filter((m) => !m.isOwner).length === 0) return [];
  return people.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
}

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
    // Attribution (11 novembre 2026) : activée seulement si le réglage le dit
    // (une copie d'avant ce réglage, sans valeur : désactivée)
    assign: Boolean(list) && usesAssign(list) && list.assignEnabled === true,
    // Sous-tâches (17 novembre 2026) : listes de tâches, réglage activé
    subtasks: nestsSubtasks(list),
  };
}

// Personnes à qui on peut attribuer une tâche de cette liste : le
// propriétaire et les membres « Peut modifier », comptes actifs (le serveur
// revérifie) ; prénom en ordre alphabétique, « Moi » à part dans l'écran
export const assignablePeople = (list) => (list?.members ?? [])
  .filter((m) => m.active !== false && (m.isOwner || m.access === 'modification'))
  .sort((a, b) => compareNames(a.displayName, b.displayName));

// Prénom des membres d'une liste (Map identifiant -> prénom)
export const memberNames = (list) => new Map((list?.members ?? []).map((m) => [m.id, m.displayName]));

// Interrupteur « Priorité » du formulaire de liste, à l'ouverture :
// - nouvelle liste, quel que soit son type (liste d'envies comprise) :
//   désactivée ; le propriétaire l'active s'il la veut ;
// - liste existante, y compris une liste en cours de conversion en liste
//   d'envies : son réglage ENREGISTRÉ, jamais une valeur forcée (une copie
//   d'avant ces réglages, sans valeur : activée, comme listOptions).
// Le type choisi dans le formulaire ne change pas l'interrupteur.
// list : la liste telle qu'enregistrée, ou null pour une nouvelle liste.
export function priorityAtStart(list) {
  return Boolean(list) && list.priorityEnabled !== false;
}

// Tris proposés : liste de courses, « par rayon » (ou « par magasin » pour
// une liste « multi ») puis l'ordre alphabétique ; autre liste, l'ordre
// alphabétique toujours, « par priorité » et « par échéance » seulement si
// le réglage est activé. Le premier est le tri par défaut.
export function availableSorts(list) {
  if (isShoppingList(list)) return ['aisle', 'alpha'];
  const options = listOptions(list);
  return ['alpha', 'priority', 'due', 'person'].filter((sort) => sort === 'alpha' || (sort === 'priority' && options.priority) || (sort === 'due' && options.due) || (sort === 'person' && options.assign));
}
export const defaultSort = (list) => availableSorts(list)[0];

// Tri à appliquer : le choix gardé sur ce téléphone s'il est encore proposé,
// sinon le tri par défaut de la liste (le choix gardé n'est pas effacé : il
// revient si le réglage est réactivé)
export function effectiveSort(list, sort) {
  const wanted = itemSortFrom(sort);
  return availableSorts(list).includes(wanted) ? wanted : defaultSort(list);
}

// Avancement d'une liste : { remaining, total }. remaining : éléments non
// cochés ; total : tous les éléments de la copie locale (les supprimés n'y
// sont plus), cochés compris, sous-tâches comprises. Le seul calcul du
// compteur « X/Y » : carte de « Listes » et compteur de la liste ouverte
// (screens/list.js, décision du 24 novembre 2026), toujours les mêmes nombres.
export function listProgress(state, listId) {
  const items = itemsOf(state, listId);
  return { remaining: items.filter((item) => !item.checked).length, total: items.length };
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
        ...listProgress(state, list.id),
        lastActivity: [list.updatedAt, list.lastActivity ?? '', lastItem].sort().at(-1),
      };
    }), sort);
}

// Listes par type (tuile « Listes » de l'Accueil, types du menu de gauche
// de l'ordinateur) : [{ type, count, news }], dans l'ordre Courses, Tâches,
// Envies, seulement les types que la personne a. news : une liste de ce
// type a des nouveautés à montrer (listNews : hors sourdine, « Nouveautés »
// activé). Les mêmes listes que l'écran « Listes » (toute la copie locale).
export function listCountsByType(state) {
  const lists = [...state.lists.values()];
  return LIST_TYPES.map((type) => {
    const ofType = lists.filter((list) => typeOf(list) === type);
    return { type, count: ofType.length, news: ofType.some((list) => Boolean(listNews(state, list.id))) };
  }).filter((entry) => entry.count > 0);
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
export function computeListView(state, listId, { sort = null, me = null } = {}) {
  const list = state.lists.get(listId);
  if (!list) return null;
  const items = itemsOf(state, listId);
  const multi = isMultiList(list);
  // Sous-tâches : seules les tâches principales (et ordinaires) sont
  // groupées et triées ; chaque principale garde ses sous-tâches à part
  // (subtasks : identifiant -> sous-tâches, à faire puis cochées)
  const { tops, childrenOf } = nestItems(items, nestsSubtasks(list));
  const chosen = effectiveSort(list, sort);
  const { groups, done } = splitDone(tops, aislesForList(state, list), isShoppingList(list), { byStore: multi, stores: state.stores, sort: chosen, people: memberNames(list), me });
  // Sous-tâches : toujours l'ordre manuel (cochées à leur place)
  const subtasks = new Map([...childrenOf].map(([id, children]) => [id, orderSubtasks(children)]));
  return {
    list,
    multi,
    groups,
    done,
    subtasks,
    checked: done.length,
    total: tops.length,
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

// Rayons d'une liste de courses (public/js/aisles.js) : ceux de son magasin
// simple et les rayons communs ; liste sans magasin, les rayons communs ;
// liste « multi » ou d'un autre type, aucun.
// aislesForList : actifs ou non (groupes, nom du rayon d'un article) ;
// offeredAislesFor : actifs seulement (ceux qu'on peut choisir), par ordre alphabétique.
export function aislesForList(state, list) {
  if (!isShoppingList(list) || isMultiList(list)) return [];
  return aislesForStore(state.aisles, list.store?.id ?? null);
}
export function offeredAislesFor(state, list) {
  if (!isShoppingList(list) || isMultiList(list)) return [];
  return activeOnly(offeredAisles(state.aisles, list.store?.id ?? null));
}

// Rayon habituel d'un article dans une liste à magasin simple (null si
// inconnu) : seulement s'il est proposé à cette liste
export function usualAisleFor(state, list, name) {
  const offered = new Set(offeredAisles(state.aisles, list.store?.id ?? null).map((aisle) => aisle.id));
  return usualAisle(state.history, name, list.store?.id ?? null, (id) => offered.has(id));
}

// Suggestions d'autocomplétion (même règle que le serveur), avec le nom du
// rayon habituel s'il est encore actif (et, avec une liste, proposé à
// cette liste : commun ou de son magasin).
export function computeSuggestions(state, typed, limit = 5, list = null) {
  const choices = list ? offeredAisles(state.aisles, list.store?.id ?? null) : state.aisles.filter((a) => a.active);
  const aisleName = new Map(choices.map((a) => [a.id, a.name]));
  return suggest(state.history, typed, limit).map((entry) => ({
    name: entry.name,
    aisleId: aisleName.has(entry.aisleId) ? entry.aisleId : null,
    aisleName: aisleName.get(entry.aisleId) ?? null,
  }));
}

// « Souvent ajoutés » d'une liste de courses (history.js, habitual) : les
// articles les plus ajoutés dans son magasin (ou ses magasins, liste
// « multi »), sans ceux déjà à acheter dans la liste. Chaque entrée garde
// son nom et, pour l'écran, son rayon habituel (magasin simple) ou son
// magasin habituel (« multi »). Liste qui n'est pas de courses : [].
// Calculé sur la copie locale : marche hors ligne.
export function computeHabitual(state, list, { now = new Date().toISOString(), limit } = {}) {
  if (!list || !isShoppingList(list)) return [];
  const multi = isMultiList(list);
  const storeIds = habitualStoreIds(state, list);
  if (multi && !storeIds.length) return [];
  const exclude = new Set(itemsOf(state, list.id).filter((item) => !item.checked).map((item) => normalizeItemName(item.name)));
  const aisleName = new Map(state.aisles.filter((a) => a.active).map((a) => [a.id, a.name]));
  const storeName = new Map(state.stores.map((store) => [store.id, store.name]));
  return habitual(state.history, { storeIds, exclude, now, ...(limit ? { limit } : {}) }).map((entry) => ({
    name: entry.name,
    hint: multi ? storeName.get(usualStoreFor(state, list, entry.name)) ?? null : aisleName.get(usualAisleFor(state, list, entry.name)) ?? null,
  }));
}

// Magasins dont « Souvent ajoutés » tient compte : celui de la liste, ceux
// d'une liste « multi » ; aucun (lignes générales) pour une liste sans magasin
export function habitualStoreIds(state, list) {
  if (isMultiList(list)) return storeChoices(state, list).map((store) => store.id);
  return list.store?.id ? [list.store.id] : [];
}

// Article coché (« Dans le panier ») de cette liste qui porte ce nom
// (majuscules et accents ignorés), ou null
export function checkedNamed(state, listId, name) {
  const key = normalizeItemName(name);
  return itemsOf(state, listId).find((item) => item.checked && normalizeItemName(item.name) === key) ?? null;
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
  const cart = duplicate.where === 'cart';
  if (duplicate.by === 'code') return cart ? t('donnees.doublon.panier.code', { name: duplicate.name }) : t('donnees.doublon.liste.code', { name: duplicate.name });
  return cart ? t('donnees.doublon.panier') : t('donnees.doublon.liste');
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
