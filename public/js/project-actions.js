// Actions de l'utilisateur sur les projets (docs/cadrage-projets.md) : la
// couche de données que les écrans des projets utilisent.
//
// Comme pour les listes (actions.js) : chaque action entre dans la file
// d'attente, s'applique aussitôt à la copie locale (project-store.js, même
// effet que le serveur), puis part vers le serveur dès que possible. Les
// identifiants (projet, colonnes, étiquettes, cartes) sont créés ici, sur le
// téléphone : tout marche hors ligne. Le serveur revérifie chaque opération ;
// un refus (rôle changé pendant une coupure) est signalé et la copie locale
// reprend l'état du serveur (app.js).
//
// En ligne seulement (comme pour les listes) : partager, quitter, supprimer
// définitivement, vider une corbeille.

import { app, refreshData, dataChanged, flushSoon, queuedEntries, replaceQueuedOp, isQueuedSending } from './app.js';
import { uuid, get, post, put } from './api.js';
import { perform } from './actions.js';
import { copyName } from './format.js';
import { t } from './i18n.js';
import { DEFAULT_COLUMNS, PROJECT_NAME_MAX, CARD_TITLE_MAX, CARD_DESCRIPTION_MAX, afterIdForStep, cleanDescription } from './projects.js';
import { columnCards } from './project-store.js';

const enc = encodeURIComponent;

// --- Projets ---

// Nouveau projet : trois colonnes « À faire », « En cours », « Fait », dans
// la langue de l'écran. Renvoie son identifiant.
export async function createProject(name) {
  const projectId = uuid();
  const columns = DEFAULT_COLUMNS.map((column) => ({ columnId: uuid(), name: t(column.text), color: column.color }));
  await perform({ type: 'project.create', projectId, name, columns });
  return projectId;
}

export const renameProject = (projectId, name) => perform({ type: 'project.update', projectId, name });
export const setProjectPriority = (projectId, priorityEnabled) => perform({ type: 'project.update', projectId, priorityEnabled });
// Option « Échéances » du projet (propriétaire et « Peut modifier »)
export const setProjectDeadlines = (projectId, deadlinesEnabled) => perform({ type: 'project.update', projectId, deadlinesEnabled });

// Dupliquer (tout membre) : un projet à moi, « (copie) », mêmes colonnes et
// étiquettes, sans cartes. Renvoie l'identifiant de la copie.
export async function duplicateProject(projectId) {
  const source = app.data.projects.get(projectId);
  if (!source) return null;
  const newProjectId = uuid();
  const columnIds = Object.fromEntries((source.columns ?? []).map((column) => [column.id, uuid()]));
  const labelIds = Object.fromEntries((source.labels ?? []).map((label) => [label.id, uuid()]));
  await perform({ type: 'project.duplicate', projectId, newProjectId, name: copyName(source.name, PROJECT_NAME_MAX), columnIds, labelIds });
  return newProjectId;
}

export const deleteProject = (projectId) => perform({ type: 'project.delete', projectId });
export const restoreProject = (projectId) => perform({ type: 'project.restore', projectId });

// Réglages à moi : { mutedNews }, { mutedPush }, { inDeadlines }
export const setProjectState = (projectId, change) => perform({ type: 'project.state', projectId, ...change });

// Nouveautés : le projet ouvert est vu (sur tous mes appareils)
export function markProjectSeen(projectId) {
  const mine = app.data.projectMine?.[projectId];
  if (!mine?.unread) return null;
  return perform({ type: 'project.seen', projectId, upTo: mine.lastEvent ?? 0 });
}

// Partager (propriétaire, en ligne) : { userIds, access } avec les droits
// 'modification', 'contribution' ou 'lecture'
export async function shareProject(projectId, { userIds, access }) {
  await refreshData({ quiet: true });
  const result = await put(`/api/projects/${enc(projectId)}/members`, { userIds, access });
  await refreshData({ quiet: true });
  return result;
}

// Quitter un projet qu'on m'a partagé (en ligne) : ce qui attend dans la
// file part d'abord ; le projet disparaît ensuite de ce téléphone
export async function leaveProject(projectId) {
  await refreshData({ quiet: true });
  await post(`/api/projects/${enc(projectId)}/leave`);
  await refreshData({ quiet: true, full: true });
}

// Corbeille (onglet « Projets », propriétaire, en ligne)
export async function purgeProject(projectId) {
  await refreshData({ quiet: true });
  const result = await post(`/api/projects/${enc(projectId)}/purge`);
  await refreshData({ quiet: true, full: true });
  return result;
}
export async function emptyProjectTrash(projectIds) {
  await refreshData({ quiet: true });
  const result = await post('/api/projects/deleted/purge', { ids: projectIds });
  await refreshData({ quiet: true, full: true });
  return result;
}

// --- Colonnes (propriétaire et « Peut modifier ») ---

export async function createColumn(projectId, { name, color, afterId }) {
  const columnId = uuid();
  await perform({ type: 'column.create', projectId, columnId, name, ...(color ? { color } : {}), ...(afterId !== undefined ? { afterId } : {}) });
  return columnId;
}
export const updateColumn = (projectId, columnId, change) => perform({ type: 'column.update', projectId, columnId, ...change });
// afterId : la colonne qui précède (null : en premier)
export const moveColumn = (projectId, columnId, afterId) => perform({ type: 'column.move', projectId, columnId, afterId });
// Avec des cartes : { moveTo: <colonne> } ou { deleteCards: true }
export const deleteColumn = (projectId, columnId, choice = {}) => perform({ type: 'column.delete', projectId, columnId, ...choice });

// --- Étiquettes du projet (propriétaire et « Peut modifier ») ---

export async function createProjectLabel(projectId, { name, color }) {
  const labelId = uuid();
  await perform({ type: 'label.create', projectId, labelId, name, ...(color ? { color } : {}) });
  return labelId;
}
export const updateProjectLabel = (projectId, labelId, change) => perform({ type: 'label.update', projectId, labelId, ...change });
export const deleteProjectLabel = (projectId, labelId) => perform({ type: 'label.delete', projectId, labelId });

// --- Cartes ---

// Nouvelle carte, en bas de la colonne (afterId : null en haut, ou la carte
// qui précède). Renvoie son identifiant.
export async function createCard(projectId, columnId, title, { afterId, labelIds } = {}) {
  const cardId = uuid();
  await perform({ type: 'card.create', projectId, cardId, columnId, title, ...(afterId !== undefined ? { afterId } : {}), ...(labelIds ? { labelIds } : {}) });
  return cardId;
}
export const renameCard = (cardId, title) => perform({ type: 'card.update', cardId, title });
// « Déplacer vers… » : columnId, et afterId (null : en haut ; absent : en bas)
export const moveCard = (cardId, { columnId, afterId } = {}) => perform({
  type: 'card.move', cardId, ...(columnId !== undefined ? { columnId } : {}), ...(afterId !== undefined ? { afterId } : {}),
});
// « Monter » / « Descendre » : rien si la carte est déjà au bout
export function stepCard(cardId, direction) {
  const card = app.data.cards.get(cardId);
  if (!card) return null;
  const afterId = afterIdForStep(columnCards(app.data, card.columnId), cardId, direction);
  if (afterId === undefined) return null;
  return perform({ type: 'card.move', cardId, afterId });
}
export const deleteCard = (cardId) => perform({ type: 'card.delete', cardId });
export const restoreCard = (cardId) => perform({ type: 'card.restore', cardId });
// Dupliquer : juste dessous, « (copie) », à moi, avec sa description, ses
// liens (nouveaux identifiants, choisis ici), son échéance (« Fait »
// décoché). Renvoie l'identifiant.
export async function duplicateCard(cardId) {
  const card = app.data.cards.get(cardId);
  if (!card) return null;
  const newCardId = uuid();
  const linkIds = Object.fromEntries((card.links ?? []).map((link) => [link.id, uuid()]));
  await perform({ type: 'card.duplicate', cardId, newCardId, title: copyName(card.title, CARD_TITLE_MAX), ...(Object.keys(linkIds).length ? { linkIds } : {}) });
  return newCardId;
}
export const setCardLabels = (cardId, labelIds) => perform({ type: 'card.labels', cardId, labelIds });
export const setCardAssignees = (cardId, userIds) => perform({ type: 'card.assign', cardId, userIds });

// Cartes supprimées d'un projet effacées pour de bon (propriétaire, en ligne)
export async function purgeCards(projectId, cardIds) {
  await refreshData({ quiet: true });
  const result = await post(`/api/projects/${enc(projectId)}/cards/purge`, { cardIds });
  await refreshData({ quiet: true });
  return result;
}

// --- Détails d'une carte (étape 2) ---

// Échéance : { date, time, remindBefore } (heure et rappel facultatifs), ou
// null pour la retirer (avec « Fait »)
export const setCardDue = (cardId, due) => perform({ type: 'card.update', cardId, due });
// Case « Fait » de l'échéance
export const setCardDone = (cardId, done) => perform({ type: 'card.done', cardId, done });
// Priorité (option « Priorité » du projet) : 'low', 'normal', 'high'
export const setCardPriority = (cardId, priority) => perform({ type: 'card.update', cardId, priority });

// Liens : titre facultatif, adresse http ou https
export const addCardLink = (cardId, { title, url }) => perform({ type: 'link.create', cardId, linkId: uuid(), title, url });
export const updateCardLink = (cardId, linkId, change) => perform({ type: 'link.update', cardId, linkId, ...change });
export const removeCardLink = (cardId, linkId) => perform({ type: 'link.delete', cardId, linkId });

// Cocher ou décocher UNE case de la description (sans passer en saisie) :
// son numéro et son texte ; seule cette case change, même si quelqu'un en
// coche une autre au même moment
export const tickCardTask = (cardId, { index, text, checked }) => perform({ type: 'card.task', cardId, index, text, checked });

// --- Description : enregistrement automatique, version, conflit (comme
// les notes, actions.js) ---

// Dernier enregistrement de la description de cette carte encore en file
function lastQueuedDescription(cardId) {
  return queuedEntries().filter((entry) => entry.kind === 'op' && entry.op.cardId === cardId && entry.op.type === 'card.describe').at(-1) ?? null;
}
// Vrai si un enregistrement de la description attend encore d'être envoyé
export const cardDescriptionPending = (cardId) => Boolean(lastQueuedDescription(cardId));

// Enregistre la description. baseVersion : la version sur laquelle l'écran
// a écrit. Renvoie 'queued' (parti dans la file), 'conflict' (la
// description a changé entre-temps, ou était déjà « À vérifier » : mon
// texte est gardé sur ce téléphone jusqu'à mon choix, rien n'est envoyé) ou
// 'gone'. Enregistrements rapprochés : le précédent, pas encore parti, est
// remplacé ; sinon le nouveau le suit (afterOp : refusé si le précédent
// l'est).
export async function saveCardDescription(cardId, { description, baseVersion }) {
  const card = app.data.cards.get(cardId);
  if (!card || card.deletedAt) return 'gone';
  const text = String(description ?? '').slice(0, CARD_DESCRIPTION_MAX);
  const kept = app.data.cardConflicts.get(cardId);
  if (kept || card.descriptionVersion !== baseVersion) {
    app.data.cardConflicts.set(cardId, { ...(kept ?? {}), description: text, at: new Date().toISOString() });
    dataChanged();
    return 'conflict';
  }
  const previous = lastQueuedDescription(cardId);
  if (previous && !isQueuedSending(previous.seq) && await replaceQueuedOp(previous.seq, { ...previous.op, description: text })) {
    app.data.cards.set(cardId, { ...card, description: cleanDescription(text) ?? card.description, updatedAt: new Date().toISOString() });
    dataChanged();
    flushSoon();
    return 'queued';
  }
  await perform({ type: 'card.describe', cardId, description: text, baseVersion: card.descriptionVersion, ...(previous ? { afterOp: previous.op.id } : {}) });
  return 'queued';
}

// « Garder la mienne » : mon texte est enregistré sur la version actuelle
export async function keepMyCardDescription(cardId) {
  const kept = app.data.cardConflicts.get(cardId);
  const card = app.data.cards.get(cardId);
  if (!kept || !card) return;
  app.data.cardConflicts.delete(cardId);
  await perform({ type: 'card.describe', cardId, description: kept.description, baseVersion: card.descriptionVersion });
}

// « Prendre la leur » : mon texte est abandonné (après confirmation)
export function takeTheirCardDescription(cardId) {
  app.data.cardConflicts.delete(cardId);
  dataChanged();
}

// « Garder les deux » : ma version est ajoutée SOUS la leur, après une
// ligne « Version de Guillaume, 25 nov. 21:04 » (heading : cette ligne,
// écrite par l'écran dans sa langue) ; le tout tronqué à la taille
// permise
export async function keepBothCardDescriptions(cardId, heading) {
  const kept = app.data.cardConflicts.get(cardId);
  const card = app.data.cards.get(cardId);
  if (!kept || !card) return;
  app.data.cardConflicts.delete(cardId);
  const theirs = card.description ?? '';
  const joined = `${theirs}${theirs && !theirs.endsWith('\n') ? '\n' : ''}${theirs ? '\n' : ''}${heading}\n${kept.description}`.slice(0, CARD_DESCRIPTION_MAX);
  await perform({ type: 'card.describe', cardId, description: joined, baseVersion: card.descriptionVersion });
}

// --- Commentaires, cartes suivies, historique (étape 3) ---

// Écrire un commentaire (identifiant créé ici : hors ligne compris).
// Renvoie son identifiant.
export async function addComment(cardId, text) {
  const commentId = uuid();
  await perform({ type: 'comment.create', cardId, commentId, text });
  return commentId;
}
// Modifier MON commentaire
export const editComment = (cardId, commentId, text) => perform({ type: 'comment.update', cardId, commentId, text });
// Supprimer mon commentaire (ou, propriétaire du projet, celui d'un autre)
export const deleteComment = (cardId, commentId) => perform({ type: 'comment.delete', cardId, commentId });
// « Suivre » (true) / « Ne plus suivre » (false) une carte
export const followCard = (cardId, following) => perform({ type: 'card.follow', cardId, following });

// Historique d'une carte : en ligne seulement (jamais copié sur le
// téléphone). Renvoie les lignes, la plus récente d'abord.
export async function loadCardHistory(projectId, cardId) {
  const result = await get(`/api/projects/${enc(projectId)}/cards/${enc(cardId)}/history`);
  return Array.isArray(result?.lines) ? result.lines : [];
}
