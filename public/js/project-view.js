// Projets : ce que montrent les écrans (docs/cadrage-projets.md, étape 1),
// calculé depuis la copie locale du téléphone (store.js, project-store.js),
// hors ligne compris.
//
// Fonctions « pures » : ni écran, ni réseau, ni texte affiché (seulement
// des nombres, des listes et des noms de textes) ; testées automatiquement
// (test/projects-ui.test.js). Les écrans (screens/projects.js, project.js,
// project-card.js, project-settings.js, project-trash.js) s'en servent.
//
// Rien ici ne donne un droit : les règles des rôles viennent de
// projects.js (projectRights, cardRights), partagé avec le serveur, qui
// revérifie toujours tout.

import { byPosition, daysLeft } from './projects.js';
import { matches, isSearching } from './search.js';

// --- Projets ---

// Projets ouverts que je vois (pas dans la corbeille)
export function liveProjects(state) {
  return [...state.projects.values()].filter((project) => !project.deletedAt && state.projectIds.has(project.id));
}

// Mes projets dans la corbeille (propriétaire seulement : le serveur n'envoie
// que les miens), le plus récemment supprimé d'abord
export function trashedProjects(state) {
  return [...state.projects.values()]
    .filter((project) => project.deletedAt && project.role === 'owner' && state.projectIds.has(project.id))
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

// Cartes présentes d'un projet (hors cartes supprimées)
export const liveCards = (state, projectId) => [...state.cards.values()].filter((card) => card.projectId === projectId && !card.deletedAt);

// Dernière activité d'un projet : son nom ou son option changés, ou une de
// ses cartes créée, modifiée, déplacée (le plus récent)
export function lastActivity(state, project) {
  let last = String(project.updatedAt ?? project.createdAt ?? '');
  for (const card of state.cards.values()) {
    if (card.projectId === project.id && String(card.updatedAt ?? '') > last) last = String(card.updatedAt);
  }
  return last;
}

// Projets de l'écran « Projets » et du menu de gauche : les plus récemment
// modifiés d'abord (à égalité, par nom ; compare : comparaison des noms
// dans la langue de l'écran)
export function sortedProjects(state, compare = (a, b) => a.localeCompare(b)) {
  return liveProjects(state)
    .map((project) => ({ project, last: lastActivity(state, project) }))
    .sort((a, b) => b.last.localeCompare(a.last) || compare(a.project.name, b.project.name))
    .map(({ project }) => project);
}

// Projet trouvé par la recherche de l'écran « Projets » (sur son nom)
export const projectMatches = (project, query) => !isSearching(query) || matches(project.name, query);

// Colonnes d'un projet avec leur nombre de cartes (dans l'ordre)
export function columnCounts(state, project) {
  const counts = new Map();
  for (const card of liveCards(state, project.id)) counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
  return byPosition(project.columns ?? []).map((column) => ({ column, count: counts.get(column.id) ?? 0 }));
}

// Nombre de cartes présentes d'un projet
export const cardCount = (state, projectId) => liveCards(state, projectId).length;

// Les autres personnes du projet (pas moi), le propriétaire d'abord
export const otherMembers = (project, meId) => (project?.members ?? []).filter((member) => member.id !== meId && member.active !== false);

// Nouveautés du projet (quelqu'un d'autre y a fait quelque chose depuis ma
// dernière visite ; réglage « Nouveautés » et sourdine déjà pris en compte
// par le serveur)
export const projectUnread = (state, projectId) => Boolean(state.projectMine?.[projectId]?.unread);
export const projectNewsMuted = (state, projectId) => Boolean(state.projectMine?.[projectId]?.mutedNews);

// --- Cartes d'un projet : recherche et filtre ---

// Une carte trouvée par la recherche du projet : son titre ou le nom d'une
// de ses étiquettes (les descriptions et les liens viendront avec l'étape 2)
export function cardMatches(card, project, query) {
  if (!isSearching(query)) return true;
  if (matches(card.title, query)) return true;
  const labels = new Map((project?.labels ?? []).map((label) => [label.id, label.name]));
  return (card.labelIds ?? []).some((id) => labels.has(id) && matches(labels.get(id), query));
}

// Filtre par étiquettes (plusieurs choix) : une carte est montrée si elle
// porte une des étiquettes choisies ; aucun choix : toutes. Les étiquettes
// qui n'existent plus dans le projet sont ignorées.
export function cleanLabelFilter(project, labelIds) {
  const known = new Set((project?.labels ?? []).map((label) => label.id));
  return [...new Set((Array.isArray(labelIds) ? labelIds : []).filter((id) => known.has(id)))];
}
export function cardShown(card, labelIds) {
  return !labelIds.length || (card.labelIds ?? []).some((id) => labelIds.includes(id));
}

// Cartes d'une colonne, dans l'ordre, après filtre et recherche
export function visibleCards(state, project, columnId, { labelIds = [], query = '' } = {}) {
  return byPosition(liveCards(state, project.id).filter((card) => card.columnId === columnId))
    .filter((card) => cardShown(card, labelIds) && cardMatches(card, project, query));
}

// Nombre de cartes d'une étiquette dans le projet (réglages du projet)
export const labelUse = (state, projectId, labelId) => liveCards(state, projectId).filter((card) => (card.labelIds ?? []).includes(labelId)).length;

// Cartes supprimées d'un projet, la plus récemment supprimée d'abord
export function deletedCards(state, projectId) {
  return [...state.cards.values()]
    .filter((card) => card.projectId === projectId && card.deletedAt)
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

// Jours restant avant l'effacement (corbeilles des projets et des cartes)
export const trashDays = (deletedAt, now = Date.now()) => daysLeft(deletedAt, now);

// --- Réglages gardés sur cet appareil seulement ---
// (colonne ouverte et filtres de chaque projet : jamais envoyés au serveur)

const COLUMN_PREFIX = 'listo-projet-colonne-';
const FILTER_PREFIX = 'listo-projet-filtre-';
const storage = () => globalThis.localStorage;

// Dernière colonne ouverte d'un projet (téléphone)
export function loadProjectColumn(projectId, store = storage) {
  try {
    return store()?.getItem(COLUMN_PREFIX + projectId) ?? null;
  } catch {
    return null;
  }
}
export function saveProjectColumn(projectId, columnId, store = storage) {
  try {
    store()?.setItem(COLUMN_PREFIX + projectId, columnId);
  } catch {
    // stockage indisponible : la colonne n'est pas retenue
  }
}

// Étiquettes choisies dans le filtre d'un projet
export function loadProjectFilter(projectId, store = storage) {
  try {
    const value = JSON.parse(store()?.getItem(FILTER_PREFIX + projectId) ?? '[]');
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export function saveProjectFilter(projectId, labelIds, store = storage) {
  try {
    if (labelIds.length) store()?.setItem(FILTER_PREFIX + projectId, JSON.stringify(labelIds));
    else store()?.removeItem(FILTER_PREFIX + projectId);
  } catch {
    // stockage indisponible : le filtre vaut pour cette visite
  }
}

// Colonne montrée à l'ouverture d'un projet sur le téléphone : la dernière
// ouverte si elle existe encore, sinon la première
export function startColumn(project, remembered) {
  const columns = byPosition(project?.columns ?? []);
  return columns.find((column) => column.id === remembered) ?? columns[0] ?? null;
}

// Colonne voisine (glissement de côté, flèches) : direction +1 ou -1 ;
// null au bout
export function neighbourColumn(project, columnId, direction) {
  const columns = byPosition(project?.columns ?? []);
  const at = columns.findIndex((column) => column.id === columnId);
  if (at < 0) return null;
  return columns[at + direction] ?? null;
}

// --- Tuile de l'Accueil (étape 1 : les projets récents ; « mes cartes »
// viendra à l'étape 2) ---
export const homeProjects = (state, limit = 3, compare) => sortedProjects(state, compare).slice(0, limit);
