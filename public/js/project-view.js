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

import { byPosition, daysLeft, cardDone, cardDated, deadlinesOn, projectRights } from './projects.js';
import { matches, isSearching } from './search.js';
import { plainText, taskCount } from './note-format.js';
import { isLate, compareDue } from './due-time.js';

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

// --- Menu ⋮ d'un projet ---
// Les MÊMES entrées, dans le même ordre, sur la carte de l'écran « Projets »
// et dans la barre du projet ouvert, téléphone et ordinateur (décision du
// propriétaire du 25 novembre 2026, après l'essai) ; seule différence,
// « Ouvrir », sur la carte de l'écran « Projets » (inside : false). Chaque
// entrée seulement si mon rôle la permet (le serveur revérifie tout) :
// open, share (propriétaire) ou people (les autres), settings (propriétaire
// et « Peut modifier »), duplicate (tout membre), cardTrash (tout membre :
// Lecture seule voit la liste, sans bouton), push (couper / réactiver les
// notifications), news (masquer les nouveautés, projet partagé), deadlines
// (« Afficher dans Échéances », option « Échéances » du projet allumée),
// puis, après un trait, delete (propriétaire) ou leave.
export function projectMenuEntries(project, { inside = false } = {}) {
  const rights = projectRights(project?.role);
  if (!rights.view) return [];
  const shared = (project.members ?? []).length > 1;
  return [
    inside ? null : 'open',
    rights.share ? 'share' : 'people',
    rights.settings ? 'settings' : null,
    rights.duplicate ? 'duplicate' : null,
    'cardTrash',
    'push',
    shared ? 'news' : null,
    deadlinesOn(project) ? 'deadlines' : null,
    rights.trash ? 'delete' : 'leave',
  ].filter(Boolean);
}

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

// Une carte trouvée par la recherche du projet (4.2) : son titre, sa
// description (sans les marques), le nom d'une de ses étiquettes ou le
// titre d'un de ses liens
export function cardMatches(card, project, query) {
  if (!isSearching(query)) return true;
  if (matches(card.title, query)) return true;
  if (card.description && matches(plainText(card.description), query)) return true;
  if ((card.links ?? []).some((link) => link.title && matches(link.title, query))) return true;
  const labels = new Map((project?.labels ?? []).map((label) => [label.id, label.name]));
  return (card.labelIds ?? []).some((id) => labels.has(id) && matches(labels.get(id), query));
}

// --- Filtre : personnes et étiquettes (4.2, maquette projet-2) ---
// { people, labels } : people, des numéros de comptes et 'none' (carte
// sans attribution, « Personne ») ; labels, des étiquettes du projet.
// Une carte est montrée si elle est à une des personnes cochées ET porte
// une des étiquettes choisies (aucun choix d'un côté : tout ce côté).
export const NO_ONE = 'none';
export const emptyFilter = () => ({ people: [], labels: [] });
export const filterCount = (filter) => filter.people.length + filter.labels.length;

// Filtre nettoyé : les étiquettes qui n'existent plus dans le projet et
// les personnes qui n'en sont plus membres sont ignorées. Accepte
// l'ancienne forme (tableau d'étiquettes, étape 1).
export function cleanFilter(project, value) {
  const raw = Array.isArray(value) ? { labels: value, people: [] } : (value && typeof value === 'object' ? value : {});
  const known = new Set((project?.labels ?? []).map((label) => label.id));
  const members = new Set((project?.members ?? []).map((member) => member.id));
  return {
    people: [...new Set((Array.isArray(raw.people) ? raw.people : []).filter((id) => id === NO_ONE || members.has(id)))],
    labels: [...new Set((Array.isArray(raw.labels) ? raw.labels : []).filter((id) => known.has(id)))],
  };
}
// (Étape 1 : filtre par étiquettes seulement ; gardé pour les écrans qui
// ne regardent que les étiquettes)
export const cleanLabelFilter = (project, labelIds) => cleanFilter(project, { labels: labelIds }).labels;

export function cardShown(card, filter) {
  const { people = [], labels = [] } = Array.isArray(filter) ? { labels: filter } : filter ?? {};
  const assignees = card.assigneeIds ?? [];
  const personOk = !people.length || people.some((id) => (id === NO_ONE ? !assignees.length : assignees.includes(id)));
  const labelOk = !labels.length || (card.labelIds ?? []).some((id) => labels.includes(id));
  return personOk && labelOk;
}

// Cartes d'une colonne, dans l'ordre, après filtre et recherche (filter :
// { people, labels } ; labelIds : l'ancienne forme, étiquettes seulement)
export function visibleCards(state, project, columnId, { filter, labelIds = [], query = '' } = {}) {
  const chosen = filter ?? { people: [], labels: labelIds };
  return byPosition(liveCards(state, project.id).filter((card) => card.columnId === columnId))
    .filter((card) => cardShown(card, chosen) && cardMatches(card, project, query));
}

// --- Repères d'une carte (face, maquettes projet-1 et pc-projet-1) ---

// État de l'échéance : null (aucune, ou option « Échéances » du projet
// coupée), 'done' (case « Fait » cochée : la seule marque de « fait »),
// 'late' (date ou heure passées), 'today', 'later'. today : « AAAA-MM-JJ »,
// now : « HH:MM » (heure de l'appareil) ; project : le projet de la carte.
export function cardDueState(card, today, now, project) {
  if (!cardDated(card, project)) return null;
  if (cardDone(card, project)) return 'done';
  if (isLate(card.dueDate, card.dueTime, today, now)) return 'late';
  return card.dueDate === today ? 'today' : 'later';
}

// Ce que montre la face d'une carte : description présente (seulement
// quand elle n'a pas de cases : « x/y » le dit déjà, maquette projet-1),
// « x/y » (cases cochées sur cases), nombre de liens
export function cardMarkers(card) {
  const tasks = taskCount(card.description ?? '');
  return {
    described: !tasks.total && Boolean(String(card.description ?? '').trim()),
    tasks: tasks.total ? tasks : null,
    links: (card.links ?? []).length,
  };
}

// --- « Mes cartes » (5.3) : attribuées à moi, pas faites, pas dans une
// corbeille, dans les projets que je vois. Option « Échéances » du projet
// coupée : la carte se lit sans échéance (jamais faite, jamais en retard) ---
export function myCards(state, meId, projectId = null) {
  if (meId === null || meId === undefined) return [];
  const visible = new Map(liveProjects(state).map((project) => [project.id, project]));
  return [...state.cards.values()].filter((card) => !card.deletedAt && visible.has(card.projectId)
    && (projectId === null || card.projectId === projectId)
    && (card.assigneeIds ?? []).includes(meId) && !cardDone(card, visible.get(card.projectId)));
}

// État de l'échéance d'une carte de la copie locale (son projet relu)
const dueStateIn = (state, card, today, now) => cardDueState(card, today, now, state.projects.get(card.projectId));

// « 2 cartes pour vous · 1 en retard » d'un projet (écran Projets)
export function myCardCounts(state, meId, projectId, today, now) {
  const mine = myCards(state, meId, projectId);
  return { count: mine.length, late: mine.filter((card) => dueStateIn(state, card, today, now) === 'late').length };
}

// Les plus urgentes de mes cartes (tuile de l'Accueil, 3.3) : en retard
// d'abord, puis par échéance (les cartes sans échéance après), puis les
// plus récemment modifiées
export function urgentCards(state, meId, today, now, limit = 3) {
  return myCards(state, meId)
    .map((card) => ({ card, late: dueStateIn(state, card, today, now) === 'late', dated: cardDated(card, state.projects.get(card.projectId)) }))
    .sort((a, b) => Number(b.late) - Number(a.late)
      || Number(!a.dated) - Number(!b.dated)
      || (a.dated && b.dated ? compareDue(a.card.dueDate, a.card.dueTime, b.card.dueDate, b.card.dueTime) : 0)
      || String(b.card.updatedAt ?? '').localeCompare(String(a.card.updatedAt ?? '')))
    .slice(0, limit)
    .map(({ card }) => card);
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

// Filtre d'un projet ({ people, labels } ; un tableau d'étiquettes gardé
// par l'étape 1 est relu comme { labels })
export function loadProjectFilter(projectId, store = storage) {
  try {
    const value = JSON.parse(store()?.getItem(FILTER_PREFIX + projectId) ?? '[]');
    const raw = Array.isArray(value) ? { labels: value } : (value && typeof value === 'object' ? value : {});
    return {
      people: (Array.isArray(raw.people) ? raw.people : []).filter((id) => id === NO_ONE || Number.isSafeInteger(id)),
      labels: (Array.isArray(raw.labels) ? raw.labels : []).filter((id) => typeof id === 'string'),
    };
  } catch {
    return emptyFilter();
  }
}
export function saveProjectFilter(projectId, filter, store = storage) {
  try {
    const value = Array.isArray(filter) ? { people: [], labels: filter } : filter;
    if (filterCount(value)) store()?.setItem(FILTER_PREFIX + projectId, JSON.stringify(value));
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

// --- Tuile de l'Accueil : « mes cartes » (urgentCards) ; projets récents
// (gardé pour d'autres écrans) ---
export const homeProjects = (state, limit = 3, compare) => sortedProjects(state, compare).slice(0, limit);
