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

import { isShoppingList } from './list-types.js';
import { app, dataChanged, queueEntry, flushSoon, refreshData, queuedEntries, replaceQueuedOp, isQueuedSending } from './app.js';
import { uuid, photoUrl, post, patch, del } from './api.js';
import { cleanNoteTitle, cleanNoteBody, applyOp, rememberItem, historyStoreFor, moveItemStore, usualAisleFor, usualStoreFor, remembersNames, listOptions, checkedToRemove } from './store.js';
import { nextDue } from './repeat.js';
import { modeOf, turnAfterCheck } from './assign.js';
import { todayKey } from './format.js';
import { isMultiList } from './sorting.js';
import { noteTitle, NOTE_TITLE_MAX } from './notes.js';
import { copyName } from './format.js';
import { t } from './i18n.js';

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
export async function addItem({ listId, name, quantity, note, aisleId, storeId, ean, link, priceCents, parentId }) {
  const list = app.data.lists.get(listId);
  if (!list) return null;
  const itemId = uuid();
  const fields = { listId, itemId, name };
  if (quantity !== undefined) fields.quantity = quantity;
  if (note !== undefined) fields.note = note;
  if (aisleId !== undefined) fields.aisleId = aisleId;
  if (storeId !== undefined) fields.storeId = storeId;
  if (ean !== undefined) fields.ean = ean; // code-barres normalisé (listes de courses)
  if (link !== undefined) fields.link = link; // lien et prix (listes d'envies)
  if (priceCents !== undefined) fields.priceCents = priceCents;
  if (parentId) fields.parentId = parentId; // sous-tâche de cette tâche (subtasks.js)
  const multi = isMultiList(list);
  const hint = {};
  if (multi && storeId === undefined) hint.storeId = usualStoreFor(app.data, list, name);
  if (!multi && isShoppingList(list) && aisleId === undefined) hint.aisleId = usualAisleFor(app.data, list, name);
  await perform({ type: 'item.create', ...fields }, { hint });
  const item = app.data.items.get(itemId);
  // Historique local (même règle que le serveur, listes de courses
  // seulement) : autocomplétion hors ligne
  if (remembersNames(list)) rememberItem(app.data, name, { aisleId: multi ? null : item.aisleId, storeId: historyStoreFor(list, item) });
  dataChanged();
  return item;
}

// Tâche qui se répète, en ce moment ? (règle et échéance, dans une liste de
// tâches dont l'échéance est activée : sinon la règle est gardée, cachée)
export function repeatsNow(item) {
  return Boolean(item?.repeat && item.dueDate) && listOptions(app.data.lists.get(item.listId)).due;
}
// Date suivante d'une tâche qui se répète (cochée ou « passée »), avec la
// date du téléphone ; null si elle ne se répète pas (repeat.js)
export const nextDueOf = (item) => (repeatsNow(item) ? nextDue(item.repeat, item.dueDate, todayKey()) : null);

// Chacun son tour : la personne de la fois suivante si JE coche cette tâche
// (assign.js) ; null si la tâche n'est pas à tour de rôle
export function nextTurnOf(item) {
  const list = app.data.lists.get(item.listId);
  if (modeOf(item) !== 'turn' || list?.assignEnabled !== true || !repeatsNow(item)) return null;
  return turnAfterCheck(item.assignPeople ?? [], item.assignedTo ?? null, app.user?.id);
}

// Ce que « Annuler » remet après le coché d'une tâche qui se répète : la
// date, et, à tour de rôle, la personne de cette fois
export const undoOfRepeat = (item) => ({ dueDate: item.dueDate, ...(nextTurnOf(item) !== null ? { assignedTo: item.assignedTo ?? null } : {}) });

// Cocher ou décocher. Une tâche qui se répète, cochée, revient décochée à la
// date suivante : la date est calculée ici (hors ligne compris) et vérifiée
// par le serveur.
export function checkItem(item, checked) {
  const next = checked ? nextDueOf(item) : null;
  return perform({ type: 'item.check', itemId: item.id, checked, ...(next ? { nextDue: next } : {}) });
}

// Retire un article de « Souvent ajoutés » de cette liste de courses (pour
// toute la famille, dans son magasin) ; il revient s'il est racheté
export function hideHabitual(list, name) {
  return perform({ type: 'habitual.hide', listId: list.id, name });
}

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

// Ordre manuel des sous-tâches : place item juste après afterId (une autre
// sous-tâche de la même principale), ou en premier (afterId null)
export const moveItem = (item, afterId) => perform({ type: 'item.move', itemId: item.id, afterId });

export const deleteItem = (item) => perform({ type: 'item.delete', itemId: item.id });
export const restoreItem = (itemId) => perform({ type: 'item.restore', itemId });

// Articles cochés d'une liste (copie locale)
const checkedCount = (listId) => [...app.data.items.values()].filter((item) => item.listId === listId && item.checked).length;

// Retire (supprime) les articles cochés d'une liste : « Retirer du panier » /
// « Retirer les terminés ». Une seule opération, quel que soit leur nombre.
// Renvoie le nombre d'articles retirés.
export async function removeChecked(listId) {
  // Sous-tâches : une sous-tâche cochée sous une principale à faire reste
  const count = checkedToRemove(app.data, listId).length;
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

export async function createList({ name, listType, storeId, priorityEnabled = false, dueEnabled = false, assignEnabled = false, subtasksEnabled = false, addMode, icon, forUserId, forName }) {
  const listId = uuid();
  // listType : 'shopping' ou 'tasks' (« type » est le nom de l'opération) ;
  // icon : envoyée seulement si une icône a été choisie ; addMode (« Après
  // l'ajout ») : sans valeur, le serveur choisit selon le type
  // forUserId / forName : « Pour qui ? » d'une liste d'envies (rien : « Moi »)
  await perform({
    type: 'list.create', listId, name, listType, storeId, priorityEnabled, dueEnabled, assignEnabled, subtasksEnabled,
    ...(addMode ? { addMode } : {}), ...(icon ? { icon } : {}),
    ...(forUserId ? { forUserId } : {}), ...(forName ? { forName } : {}),
  });
  return listId;
}

export const updateList = (listId, fields) => perform({ type: 'list.update', listId, ...fields });

// --- Nouveautés (propres à chaque personne, tout membre de la liste) ---
// Passent par la file d'attente comme le reste : hors ligne compris

// « Vu » : mon repère monte jusqu'au dernier événement connu de la liste
export const markSeen = (listId, upTo) => perform({ type: 'list.seen', listId, upTo });
// « Masquer les nouveautés de cette liste » / « Afficher les nouveautés de cette liste »
export const setListMuted = (listId, muted) => perform({ type: 'list.mute', listId, muted });
// Réglages du compte : « Nouveautés », « Signaler les éléments cochés »
export const setNewsSettings = (settings) => perform({ type: 'account.news', ...settings });
export const deleteList = (listId) => perform({ type: 'list.delete', listId });

// --- Réservations (listes d'envies) ---
// En ligne seulement, jamais par la file d'attente : la réponse dit tout de
// suite si quelqu'un a réservé entre-temps (« Déjà réservé. »). Ensuite, une
// synchronisation rapporte l'état à jour (les réservations ne sont jamais
// écrites dans la copie locale à la main).
// Liste de courses ou de tâches qui devient une liste d'envies, avec son
// destinataire ({ forUserId } ou { forName }, rien pour « Moi ») : en ligne
// seulement (jamais par la file d'attente), puis synchronisation
export async function convertToWishes(listId, body) {
  await post(`/api/lists/${encodeURIComponent(listId)}/wishes`, body);
  await refreshData({ quiet: true });
}

const reservationUrl = (itemId, rest = '') => `/api/items/${encodeURIComponent(itemId)}/reservation${rest}`;
// Réserver un souhait libre (open : « Ouvert à d'autres »), ou participer à
// une réservation ouverte
export async function reserveWish(itemId, open) {
  await post(reservationUrl(itemId), open === undefined ? {} : { open });
  await refreshData({ quiet: true });
}
// Ouvrir ou fermer la réservation (participants)
export async function setWishOpen(itemId, open) {
  await patch(reservationUrl(itemId), { open });
  await refreshData({ quiet: true });
}
// Quitter ma participation (le dernier qui part libère le souhait)
export async function leaveWish(itemId) {
  await del(reservationUrl(itemId));
  await refreshData({ quiet: true });
}
// Gestionnaire : libérer tout le souhait, ou retirer un participant
export async function releaseWish(itemId) {
  await del(reservationUrl(itemId, '/all'));
  await refreshData({ quiet: true });
}
export async function removeWishParticipant(itemId, userId) {
  await del(reservationUrl(itemId, `/participants/${encodeURIComponent(userId)}`));
  await refreshData({ quiet: true });
}
// Gestionnaire : retirer un visiteur du lien public (identifiant opaque « v<numéro> »)
export async function removeWishVisitor(itemId, visitorId) {
  await del(reservationUrl(itemId, `/visitors/${encodeURIComponent(visitorId)}`));
  await refreshData({ quiet: true });
}

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

// --- Notes (étape 2 ; server/notes.js) ---
// Comme le reste : copie locale d'abord, puis file d'attente (hors ligne
// compris). Chaque note a son numéro de version ; un enregistrement porte
// celui sur lequel le texte a été écrit (baseVersion).

// Nouvelle note (saisie rapide, « + », « Garder les deux », « Dupliquer ») ;
// renvoie son identifiant
export async function createNote({ title = '', body = '', pinned = false, noteId = uuid() } = {}) {
  await perform({ type: 'note.create', noteId, title, body, ...(pinned ? { pinned: true } : {}) });
  return noteId;
}

// Dernier enregistrement (création ou texte) de cette note encore en file
function lastQueuedSave(noteId) {
  return queuedEntries().filter((entry) => entry.kind === 'op' && entry.op.noteId === noteId
    && (entry.op.type === 'note.create' || entry.op.type === 'note.update')).at(-1) ?? null;
}

// Vrai si un enregistrement de cette note attend encore d'être envoyé
export const notePending = (noteId) => Boolean(lastQueuedSave(noteId));

// Enregistre le titre et le texte d'une note. baseVersion : la version sur
// laquelle l'écran a écrit. Renvoie 'queued' (parti dans la file) ou
// 'conflict' (la note a changé entre-temps, ou était déjà « À vérifier » :
// mon texte est gardé sur ce téléphone jusqu'à mon choix, rien n'est envoyé).
// Enregistrements rapprochés : tant que le précédent n'est pas parti, il
// est remplacé (un seul envoi, le dernier texte) ; sinon le nouveau le suit
// (afterOp : refusé si le précédent l'est, voir server/notes.js).
export async function saveNote(noteId, { title, body, baseVersion }) {
  const note = app.data.notes.get(noteId);
  if (!note) return 'gone';
  const kept = app.data.noteConflicts.get(noteId);
  if (kept || note.version !== baseVersion) {
    app.data.noteConflicts.set(noteId, { title, body, at: now() });
    dataChanged();
    return 'conflict';
  }
  const previous = lastQueuedSave(noteId);
  if (previous && !isQueuedSending(previous.seq) && await replaceQueuedOp(previous.seq, { ...previous.op, title, body })) {
    app.data.notes.set(noteId, { ...note, title: cleanNoteTitle(title), body: cleanNoteBody(body), updatedAt: now() });
    dataChanged();
    flushSoon();
    return 'queued';
  }
  await perform({ type: 'note.update', noteId, title, body, baseVersion: note.version, ...(previous ? { afterOp: previous.op.id } : {}) });
  return 'queued';
}

export const pinNote = (noteId, pinned) => perform({ type: 'note.pin', noteId, pinned });
export const deleteNote = (noteId) => perform({ type: 'note.delete', noteId });
export const restoreNote = (noteId) => perform({ type: 'note.restore', noteId });
// Supprimer définitivement (une note, ou toute la corbeille) : une seule opération
export const purgeNotes = (noteIds) => perform({ type: 'note.purge', noteIds });

// Titre d'une copie : « Vacances (copie) » (« Note sans titre (copie) »)
const copyTitle = (source) => copyName(noteTitle(source) || t('notes.sansTitre'), NOTE_TITLE_MAX);

// Dupliquer : une note à moi, même texte, titre « (copie) »
export function duplicateNote(note) {
  return createNote({ title: copyTitle(note), body: note.body });
}

// --- Conflit (note « À vérifier ») : les trois choix ---

// « Garder la mienne » : mon texte est enregistré sur la version actuelle
export async function keepMyNote(noteId) {
  const kept = app.data.noteConflicts.get(noteId);
  const note = app.data.notes.get(noteId);
  if (!kept || !note) return;
  app.data.noteConflicts.delete(noteId);
  await perform({ type: 'note.update', noteId, title: kept.title, body: kept.body, baseVersion: note.version });
}

// « Prendre la leur » : mon texte est abandonné (après confirmation)
export function takeTheirNote(noteId) {
  app.data.noteConflicts.delete(noteId);
  dataChanged();
}

// « Garder les deux » : mon texte devient une nouvelle note « (copie) »,
// épinglée comme l'originale ; l'originale garde leur texte. Renvoie
// l'identifiant de la copie.
export async function keepBothNotes(noteId) {
  const kept = app.data.noteConflicts.get(noteId);
  if (!kept) return null;
  app.data.noteConflicts.delete(noteId);
  return createNote({ title: copyTitle(kept), body: kept.body, pinned: app.data.pinnedNotes.has(noteId) });
}
