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

import { app, refreshData } from './app.js';
import { uuid, post, put } from './api.js';
import { perform } from './actions.js';
import { copyName } from './format.js';
import { t } from './i18n.js';
import { DEFAULT_COLUMNS, PROJECT_NAME_MAX, CARD_TITLE_MAX, afterIdForStep } from './projects.js';
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
// Dupliquer : juste dessous, « (copie) », à moi. Renvoie l'identifiant.
export async function duplicateCard(cardId) {
  const card = app.data.cards.get(cardId);
  if (!card) return null;
  const newCardId = uuid();
  await perform({ type: 'card.duplicate', cardId, newCardId, title: copyName(card.title, CARD_TITLE_MAX) });
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
