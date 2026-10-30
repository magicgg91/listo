// Actions de l'utilisateur sur les listes et les articles (étape 9 : écriture
// d'abord locale).
//
// Chaque action :
// 1. entre dans la file d'attente (queue.js), enregistrée sur le téléphone ;
// 2. s'applique aussitôt à la copie locale (applyOp, même effet que le
//    serveur) : l'écran change immédiatement, avec ou sans réseau ;
// 3. la file part vers le serveur dès que possible.
// Les écrans n'attendent donc jamais le serveur. Si le serveur refuse une
// modification, l'application revient à son état et prévient (app.js).
//
// Les règles partagées (rayon et magasin automatiques, historique) sont
// appliquées ici aussi : elles marchent hors ligne.

import { app, dataChanged, queueEntry, flushSoon } from './app.js';
import { uuid, photoUrl } from './api.js';
import { applyOp, rememberItem, historyStoreFor, moveItemStore, usualAisleFor, usualStoreFor, remembersNames } from './store.js';
import { isMultiList } from './sorting.js';

const now = () => new Date().toISOString();

// Met une opération en file (enregistrée sur le téléphone d'abord : fermer
// l'application juste après ne perd rien), puis l'applique ici
async function perform(operation, { hint } = {}) {
  const op = { id: uuid(), ...operation };
  await queueEntry({ kind: 'op', op, hint });
  applyOp(app.data, op, { user: app.user, now: now(), hint });
  dataChanged();
  flushSoon();
  return op;
}

// --- Articles ---

// Ajoute un article. aisleId / storeId : choix explicite (y compris null,
// « Sans rayon » / « Sans magasin ») ; absent, le serveur choisira le rayon ou
// le magasin habituel, et le téléphone affiche en attendant sa prévision.
export async function addItem({ listId, name, quantity, note, aisleId, storeId, ean }) {
  const list = app.data.lists.get(listId);
  if (!list) return null;
  const itemId = uuid();
  const fields = { listId, itemId, name };
  if (quantity !== undefined) fields.quantity = quantity;
  if (note !== undefined) fields.note = note;
  if (aisleId !== undefined) fields.aisleId = aisleId;
  if (storeId !== undefined) fields.storeId = storeId;
  if (ean !== undefined) fields.ean = ean; // code-barres normalisé (listes de courses)
  const multi = isMultiList(list);
  const hint = {};
  if (multi && storeId === undefined) hint.storeId = usualStoreFor(app.data, list, name);
  if (!multi && list.category.isShopping && aisleId === undefined) hint.aisleId = usualAisleFor(app.data, list, name);
  await perform({ type: 'item.create', ...fields }, { hint });
  const item = app.data.items.get(itemId);
  // Historique local (même règle que le serveur, listes de courses
  // seulement) : autocomplétion hors ligne
  if (remembersNames(list)) rememberItem(app.data, name, { aisleId: multi ? null : item.aisleId, storeId: historyStoreFor(list, item) });
  dataChanged();
  return item;
}

export const checkItem = (item, checked) => perform({ type: 'item.check', itemId: item.id, checked });

// Modifie un article (seulement les champs changés)
export async function updateItem(item, changes) {
  const list = app.data.lists.get(item.listId);
  await perform({ type: 'item.update', itemId: item.id, ...changes });
  const updated = app.data.items.get(item.id);
  if (!list || !updated) return;
  // Historique local, même règle que le serveur : listes de courses
  // seulement (une liste « multi » en est toujours une)
  if (isMultiList(list)) {
    if (changes.name) rememberItem(app.data, updated.name, { storeId: updated.storeId, count: 0 });
    else if ('storeId' in changes) moveItemStore(app.data, item.name, item.storeId ?? null, updated.storeId);
  } else if (remembersNames(list) && (changes.name || 'aisleId' in changes)) {
    rememberItem(app.data, updated.name, { aisleId: updated.aisleId, storeId: historyStoreFor(list, updated), count: 0 });
  }
  dataChanged();
}

export const deleteItem = (item) => perform({ type: 'item.delete', itemId: item.id });
export const restoreItem = (itemId) => perform({ type: 'item.restore', itemId });

// Articles cochés d'une liste (copie locale)
const checkedCount = (listId) => [...app.data.items.values()].filter((item) => item.listId === listId && item.checked).length;

// Retire (supprime) les articles cochés d'une liste : « Retirer du panier » /
// « Retirer les terminés ». Une seule opération, quel que soit leur nombre.
// Renvoie le nombre d'articles retirés.
export async function removeChecked(listId) {
  const count = checkedCount(listId);
  if (count) await perform({ type: 'list.removeChecked', listId });
  return count;
}

// Décoche tous les articles cochés d'une liste : « Tout remettre à acheter » /
// « Tout rouvrir ». Une seule opération, rejouée sans doublon hors ligne.
// Renvoie le nombre d'articles décochés.
export async function uncheckAll(listId) {
  const count = checkedCount(listId);
  if (count) await perform({ type: 'list.uncheckAll', listId });
  return count;
}

// --- Listes ---

export async function createList({ name, categoryId, storeId, priorityEnabled = false, dueEnabled = false, addMode, icon }) {
  const listId = uuid();
  // icon : envoyée seulement si une icône a été choisie ; addMode (« Après
  // l'ajout ») : sans valeur, le serveur choisit selon la catégorie
  await perform({ type: 'list.create', listId, name, categoryId, storeId, priorityEnabled, dueEnabled, ...(addMode ? { addMode } : {}), ...(icon ? { icon } : {}) });
  return listId;
}

export const updateList = (listId, fields) => perform({ type: 'list.update', listId, ...fields });

// --- Nouveautés (propres à chaque personne, tout membre de la liste) ---
// Passent par la file d'attente comme le reste : hors ligne compris

// « Vu » : mon repère monte jusqu'au dernier événement connu de la liste
export const markSeen = (listId, upTo) => perform({ type: 'list.seen', listId, upTo });
// « Ne plus me signaler cette liste » / « Signaler cette liste »
export const setListMuted = (listId, muted) => perform({ type: 'list.mute', listId, muted });
// Réglages du compte : « Nouveautés », « Signaler aussi les cochés »
export const setNewsSettings = (settings) => perform({ type: 'account.news', ...settings });
export const deleteList = (listId) => perform({ type: 'list.delete', listId });

// --- Photos ---
// Une photo prise (même hors ligne) est gardée dans la file d'attente et part
// à sa place, après la création de son article. En attendant, elle s'affiche
// depuis le téléphone (adresse /photo-locale/…, servie par le service worker).

export async function setPhoto(item, jpeg) {
  const entry = await queueEntry({ kind: 'photo', itemId: item.id, blob: jpeg }, { replacesPhotoOf: item.id });
  const current = app.data.items.get(item.id);
  if (current) app.data.items.set(item.id, { ...current, localPhoto: entry.seq });
  dataChanged();
  flushSoon();
}

export async function removePhoto(item) {
  const current = app.data.items.get(item.id);
  await queueEntry({ kind: 'photoDelete', itemId: item.id }, { replacesPhotoOf: item.id, onlyIfSent: Boolean(current?.photoAt) });
  if (current) app.data.items.set(item.id, { ...current, photoAt: null, localPhoto: null });
  dataChanged();
  flushSoon();
}

// Adresse de la photo à afficher : celle du téléphone si elle n'est pas
// encore envoyée, sinon celle du serveur
export function photoSrc(item) {
  if (item.localPhoto) return `/photo-locale/${app.user.id}/${item.localPhoto}`;
  return photoUrl(item);
}

export const hasPhoto = (item) => Boolean(item.localPhoto || item.photoAt);
