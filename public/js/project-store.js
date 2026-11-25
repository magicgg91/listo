// Projets dans la copie locale du téléphone (store.js) : ce que reçoit la
// synchronisation, et l'effet de chaque opération des projets, le MÊME que
// celui du serveur (server/projects.js), hors ligne compris.
//
// Les règles (rôles, droits sur une carte, noms, ordre) viennent de
// projects.js, partagé avec le serveur. Le téléphone n'applique que ce que
// le rôle permet ; une opération qu'il croit permise et que le serveur
// refuse (rôle changé pendant une coupure) est signalée, puis la copie
// locale reprend l'état du serveur (app.js, refreshData).
//
// Fonctions « pures » : ni écran, ni réseau, ni texte affiché (testées
// automatiquement, test/projects-store.test.js).

import {
  projectRights, cardRights, assignChangeAllowed, assignableRole, placeFor, byPosition, nameTaken,
  cleanProjectName, cleanColumnName, cleanCardTitle, cleanProjectLabelName, cleanCardLabelIds, cleanAssigneeIds,
  isColumnColor, DEFAULT_COLUMN_COLOR, COLUMNS_MAX, PROJECT_LABELS_MAX,
  cleanCardDue, isCardPriority, cleanDescription, cleanLinkUrl, cleanLinkTitle, LINKS_PER_CARD_MAX,
} from './projects.js';
import { DEFAULT_LABEL_COLOR } from './labels.js';
import { setTaskAt } from './note-format.js';

// Projets dans l'état vide de la copie locale (store.js, emptyState)
export function emptyProjects() {
  return {
    projects: new Map(),     // id -> projet (structure décrite par le serveur ; corbeille : résumé)
    projectIds: new Set(),   // projets que je vois (les miens dans la corbeille compris)
    cards: new Map(),        // id -> carte (supprimées comprises : deletedAt)
    // MES réglages et mes nouveautés, par projet ({ mutedNews, mutedPush,
    // inDeadlines, lastEvent, unread }), remplacés en entier à chaque
    // synchronisation
    projectMine: {},
    // Vrai quand les projets viennent d'être rallumés : la prochaine
    // synchronisation doit tout recharger (le serveur n'envoyait rien tant
    // qu'ils étaient coupés)
    projectsReload: false,
    // Descriptions « À vérifier » (enregistrement refusé : la description a
    // changé entre-temps) : carte -> { description, at, byName } ; mon texte
    // reste sur ce téléphone jusqu'à mon choix, jamais effacé par une
    // synchronisation (comme les notes)
    cardConflicts: new Map(),
  };
}

// Forme enregistrable (tableaux simples)
export function projectsSnapshot(state) {
  return {
    projects: [...state.projects.values()],
    projectIds: [...state.projectIds],
    cards: [...state.cards.values()],
    projectMine: state.projectMine,
    projectsReload: state.projectsReload,
    cardConflicts: [...state.cardConflicts],
  };
}

// Copie relue sur le téléphone (une copie d'avant les projets : vide)
export function projectsFromSnapshot(state, snapshot) {
  state.projects = new Map((snapshot.projects ?? []).map((project) => [project.id, project]));
  state.projectIds = new Set(snapshot.projectIds ?? []);
  state.cards = new Map((snapshot.cards ?? []).map((card) => [card.id, card]));
  state.projectMine = snapshot.projectMine && typeof snapshot.projectMine === 'object' ? snapshot.projectMine : {};
  state.projectsReload = snapshot.projectsReload === true;
  state.cardConflicts = new Map(Array.isArray(snapshot.cardConflicts) ? snapshot.cardConflicts : []);
}

// Ce que la synchronisation apporte (full : synchronisation complète ;
// sinon, seulement ce qui a changé depuis). Un projet absent de projectIds
// n'est plus visible : il disparaît, avec ses cartes. Un projet dont la
// structure arrive : ses cartes absentes de cardIds ont été effacées pour de
// bon ; les étiquettes qu'il n'a plus sont retirées de ses cartes. Un projet
// dans la corbeille ne garde aucune carte sur le téléphone.
export function loadProjects(state, data, { full }) {
  if (!Array.isArray(data.projectIds)) return;
  state.projectIds = new Set(data.projectIds);
  if (full) {
    state.projects = new Map();
    state.cards = new Map();
    state.projectsReload = false;
  }
  for (const project of data.projects ?? []) if (state.projectIds.has(project.id)) state.projects.set(project.id, project);
  for (const id of [...state.projects.keys()]) if (!state.projectIds.has(id)) state.projects.delete(id);
  for (const card of data.cards ?? []) {
    const project = state.projects.get(card.projectId);
    if (project && !project.deletedAt) state.cards.set(card.id, card);
  }
  const structures = new Map((data.projects ?? []).map((project) => [project.id, project]));
  for (const [id, card] of [...state.cards]) {
    const project = state.projects.get(card.projectId);
    if (!project || project.deletedAt) {
      state.cards.delete(id);
      continue;
    }
    const structure = structures.get(card.projectId);
    if (!structure) continue;
    if (Array.isArray(structure.cardIds) && !structure.cardIds.includes(id)) {
      state.cards.delete(id);
      continue;
    }
    const known = new Set((structure.labels ?? []).map((label) => label.id));
    if ((card.labelIds ?? []).some((labelId) => !known.has(labelId))) {
      state.cards.set(id, { ...card, labelIds: card.labelIds.filter((labelId) => known.has(labelId)) });
    }
  }
  state.projectMine = data.projectMine && typeof data.projectMine === 'object' ? data.projectMine : {};
}

// --- Petites lectures (écrans et règles locales) ---

// Cartes présentes d'une colonne, dans l'ordre
export const columnCards = (state, columnId) => byPosition([...state.cards.values()].filter((card) => card.columnId === columnId && !card.deletedAt));
// Cartes d'un projet (présentes ; deleted : celles des cartes supprimées)
export const projectCards = (state, projectId, { deleted = false } = {}) => [...state.cards.values()]
  .filter((card) => card.projectId === projectId && Boolean(card.deletedAt) === deleted);
// Colonnes d'un projet, dans l'ordre
export const projectColumns = (project) => byPosition(project?.columns ?? []);
// Projet ouvert (pas dans la corbeille)
const liveProject = (state, id) => {
  const project = state.projects.get(id);
  return project && !project.deletedAt ? project : null;
};
// Ce que je peux faire sur une carte (règle partagée avec le serveur)
export function myCardRights(state, card, user) {
  const project = card ? liveProject(state, card.projectId) : null;
  return cardRights(card, user?.id ?? null, project?.role ?? null);
}
export const myProjectRights = (project) => projectRights(project?.role ?? null);

// Les positions d'une colonne changées par une renumérotation
function applyRenumber(state, renumber, now) {
  for (const row of renumber ?? []) {
    const card = state.cards.get(row.id);
    if (card) state.cards.set(row.id, { ...card, position: row.position, updatedAt: now });
  }
}
function applyColumnRenumber(project, renumber) {
  if (!renumber?.length) return project.columns;
  const positions = new Map(renumber.map((row) => [row.id, row.position]));
  return project.columns.map((column) => (positions.has(column.id) ? { ...column, position: positions.get(column.id) } : column));
}

// Colonne visée par une carte (créer, déplacer) : celle du projet, sinon
// (supprimée entre-temps) la première, comme le serveur
const targetColumn = (project, columnId) => project.columns.find((column) => column.id === columnId) ?? projectColumns(project)[0] ?? null;

// Voisine « après » valable dans une colonne (null : en haut ; absente ou
// d'une autre colonne : en bas)
const afterIn = (rows, afterId) => (afterId === null ? null : rows.some((row) => row.id === afterId) ? afterId : undefined);

// Place une carte dans une colonne (renumérote si besoin) ; renvoie la
// carte mise à jour, ou null si elle y était déjà
function placed(state, card, column, afterId, now) {
  const rows = columnCards(state, column.id);
  const place = placeFor(rows, card.id, afterIn(rows.filter((row) => row.id !== card.id), afterId));
  if (place.unchanged && card.columnId === column.id) return null;
  applyRenumber(state, place.renumber, now);
  return { ...card, columnId: column.id, position: place.position, updatedAt: now };
}

// --- Les opérations, même effet que le serveur ---

export const PROJECT_OP_TYPES = [
  'project.create', 'project.update', 'project.duplicate', 'project.delete', 'project.restore', 'project.state', 'project.seen',
  'column.create', 'column.update', 'column.move', 'column.delete',
  'label.create', 'label.update', 'label.delete',
  'card.create', 'card.update', 'card.move', 'card.delete', 'card.restore', 'card.duplicate', 'card.labels', 'card.assign',
  'card.done', 'card.describe', 'card.task', 'link.create', 'link.update', 'link.delete',
];

// Applique une opération des projets à la copie locale. Ce que mon rôle ne
// permet pas, ou une opération mal formée, ne change rien (le serveur la
// refusera). context : { user, now }.
export function applyProjectOp(state, op, { user, now }) {
  const me = user?.id ?? null;
  const project = op.projectId ? liveProject(state, op.projectId) : null;
  const rights = myProjectRights(project);
  const setProject = (next) => state.projects.set(next.id, next);
  switch (op.type) {
    case 'project.create': {
      const name = cleanProjectName(op.name);
      if (!name || state.projects.has(op.projectId) || !Array.isArray(op.columns)) return;
      const columns = op.columns.map((column, index) => ({
        id: column.columnId, name: cleanColumnName(column.name) ?? '', color: isColumnColor(column.color) ? column.color : DEFAULT_COLUMN_COLOR, position: 1024 * (index + 1),
      }));
      setProject({
        id: op.projectId, name, role: 'owner', priorityEnabled: false, createdAt: now, updatedAt: now, deletedAt: null,
        members: user ? [{ id: user.id, displayName: user.displayName, active: true, role: 'owner' }] : [],
        columns, labels: [], cardIds: [],
      });
      state.projectIds.add(op.projectId);
      return;
    }
    case 'project.update': {
      if (!project || !rights.rename) return;
      const name = op.name === undefined ? project.name : cleanProjectName(op.name);
      if (!name) return;
      setProject({ ...project, name, ...(typeof op.priorityEnabled === 'boolean' ? { priorityEnabled: op.priorityEnabled } : {}), updatedAt: now });
      return;
    }
    // Copie à moi : mêmes colonnes et étiquettes (identifiants choisis ici,
    // dans op.columnIds et op.labelIds), aucune carte, partagée avec personne
    case 'project.duplicate': {
      const name = cleanProjectName(op.name);
      if (!project || !rights.duplicate || !name || state.projects.has(op.newProjectId)) return;
      setProject({
        id: op.newProjectId, name, role: 'owner', priorityEnabled: project.priorityEnabled, createdAt: now, updatedAt: now, deletedAt: null,
        members: user ? [{ id: user.id, displayName: user.displayName, active: true, role: 'owner' }] : [],
        columns: (project.columns ?? []).map((column) => ({ ...column, id: op.columnIds?.[column.id] ?? column.id })),
        labels: (project.labels ?? []).map((label) => ({ ...label, id: op.labelIds?.[label.id] ?? label.id })),
        cardIds: [],
      });
      state.projectIds.add(op.newProjectId);
      return;
    }
    // Corbeille (propriétaire) : le projet devient un résumé, ses cartes
    // quittent le téléphone (elles reviennent avec la restauration)
    case 'project.delete': {
      if (!project || project.role !== 'owner') return;
      const cards = projectCards(state, project.id);
      setProject({ id: project.id, name: project.name, role: 'owner', priorityEnabled: project.priorityEnabled, createdAt: project.createdAt, updatedAt: project.updatedAt, deletedAt: now, cardCount: cards.length, memberCount: Math.max(0, (project.members?.length ?? 1) - 1) });
      for (const card of [...state.cards.values()]) if (card.projectId === project.id) state.cards.delete(card.id);
      return;
    }
    // Restaurer : le serveur renverra la structure et les cartes
    case 'project.restore': {
      const trashed = state.projects.get(op.projectId);
      if (trashed?.deletedAt && trashed.role === 'owner') setProject({ ...trashed, deletedAt: null, columns: [], labels: [], members: [], cardIds: [] });
      return;
    }
    case 'project.state': {
      if (!project) return;
      const mine = { ...(state.projectMine[project.id] ?? {}) };
      for (const key of ['mutedNews', 'mutedPush', 'inDeadlines']) if (typeof op[key] === 'boolean') mine[key] = op[key];
      if (mine.mutedNews) mine.unread = false;
      state.projectMine = { ...state.projectMine, [project.id]: mine };
      return;
    }
    case 'project.seen': {
      const mine = project ? state.projectMine[project.id] : null;
      if (mine && Number.isSafeInteger(op.upTo) && op.upTo >= (mine.lastEvent ?? 0)) state.projectMine = { ...state.projectMine, [project.id]: { ...mine, unread: false } };
      return;
    }

    // --- Colonnes ---
    case 'column.create': {
      const name = cleanColumnName(op.name);
      if (!project || !rights.columns || !name || project.columns.length >= COLUMNS_MAX || nameTaken(project.columns, name)) return;
      if (project.columns.some((column) => column.id === op.columnId)) return;
      const place = placeFor(project.columns, op.columnId, afterIn(project.columns, op.afterId));
      const columns = applyColumnRenumber(project, place.renumber);
      setProject({ ...project, columns: [...columns, { id: op.columnId, name, color: isColumnColor(op.color) ? op.color : DEFAULT_COLUMN_COLOR, position: place.position }] });
      return;
    }
    case 'column.update': {
      const column = project?.columns.find((c) => c.id === op.columnId);
      if (!column || !rights.columns) return;
      const name = op.name === undefined ? column.name : cleanColumnName(op.name);
      if (!name || nameTaken(project.columns, name, column.id) || (op.color !== undefined && !isColumnColor(op.color))) return;
      setProject({ ...project, columns: project.columns.map((c) => (c.id === column.id ? { ...c, name, color: op.color ?? c.color } : c)) });
      return;
    }
    case 'column.move': {
      const column = project?.columns.find((c) => c.id === op.columnId);
      if (!column || !rights.columns || op.afterId === undefined || op.afterId === column.id) return;
      const place = placeFor(project.columns, column.id, afterIn(project.columns, op.afterId));
      if (place.unchanged) return;
      const columns = applyColumnRenumber(project, place.renumber).map((c) => (c.id === column.id ? { ...c, position: place.position } : c));
      setProject({ ...project, columns });
      return;
    }
    // Supprimer une colonne : ses cartes vont en bas d'une autre (moveTo) ou
    // dans les cartes supprimées (deleteCards) ; sans l'un ni l'autre, rien
    // (le serveur refuse une colonne qui a des cartes)
    case 'column.delete': {
      const column = project?.columns.find((c) => c.id === op.columnId);
      if (!column || !rights.columns || project.columns.length <= 1) return;
      const cards = columnCards(state, column.id);
      const target = op.moveTo ? project.columns.find((c) => c.id === op.moveTo && c.id !== column.id) : null;
      if (cards.length && !target && op.deleteCards !== true) return;
      for (const card of cards) {
        if (target) {
          const next = placed(state, card, target, undefined, now);
          if (next) state.cards.set(card.id, next);
        } else {
          state.cards.set(card.id, { ...card, columnId: null, deletedAt: now, deletedByName: user?.displayName ?? null, deletedColumnName: column.name, updatedAt: now });
        }
      }
      setProject({ ...project, columns: project.columns.filter((c) => c.id !== column.id) });
      return;
    }

    // --- Étiquettes du projet ---
    case 'label.create': {
      const name = cleanProjectLabelName(op.name);
      if (!project || !rights.labels || !name || nameTaken(project.labels, name) || project.labels.length >= PROJECT_LABELS_MAX) return;
      if (project.labels.some((label) => label.id === op.labelId)) return;
      setProject({ ...project, labels: [...project.labels, { id: op.labelId, name, color: isColumnColor(op.color) ? op.color : DEFAULT_LABEL_COLOR }] });
      return;
    }
    case 'label.update': {
      const label = project?.labels.find((l) => l.id === op.labelId);
      if (!label || !rights.labels) return;
      const name = op.name === undefined ? label.name : cleanProjectLabelName(op.name);
      if (!name || nameTaken(project.labels, name, label.id) || (op.color !== undefined && !isColumnColor(op.color))) return;
      setProject({ ...project, labels: project.labels.map((l) => (l.id === label.id ? { ...l, name, color: op.color ?? l.color } : l)) });
      return;
    }
    case 'label.delete': {
      if (!project || !rights.labels) return;
      setProject({ ...project, labels: project.labels.filter((label) => label.id !== op.labelId) });
      for (const card of projectCards(state, project.id)) {
        if (card.labelIds?.includes(op.labelId)) state.cards.set(card.id, { ...card, labelIds: card.labelIds.filter((id) => id !== op.labelId), updatedAt: now });
      }
      return;
    }

    // --- Cartes ---
    case 'card.create': {
      const title = cleanCardTitle(op.title);
      const column = project ? targetColumn(project, op.columnId) : null;
      const labels = op.labelIds === undefined ? [] : cleanCardLabelIds(op.labelIds);
      if (!project || !rights.createCards || !title || !column || !labels || state.cards.has(op.cardId)) return;
      if (!labels.every((id) => project.labels.some((label) => label.id === id))) return;
      const rows = columnCards(state, column.id);
      const place = placeFor(rows, op.cardId, afterIn(rows, op.afterId));
      applyRenumber(state, place.renumber, now);
      state.cards.set(op.cardId, {
        id: op.cardId, projectId: project.id, columnId: column.id, position: place.position, title, labelIds: labels, assigneeIds: [],
        createdByMe: true, createdByName: user?.displayName ?? null, createdAt: now, updatedAt: now, updatedByName: user?.displayName ?? null,
        deletedAt: null, deletedByName: null, deletedColumnName: null,
        ...EMPTY_DETAILS,
      });
      setProject({ ...project, cardIds: [...(project.cardIds ?? []), op.cardId] });
      return;
    }
    default:
      applyCardOp(state, op, { user, me, now });
  }
}

// Détails d'une carte neuve (étape 2)
const EMPTY_DETAILS = {
  description: '', descriptionVersion: 1, descriptionByMe: false, descriptionByName: null, descriptionAt: null,
  priority: 'normal', dueDate: null, dueTime: null, remindBefore: null, done: false, doneAt: null, links: [],
};

// Opérations sur une carte existante
function applyCardOp(state, op, { user, me, now }) {
  const card = state.cards.get(op.cardId);
  const project = card ? liveProject(state, card.projectId) : null;
  if (!card || !project) return;
  const can = cardRights(card, me, project.role);
  const set = (next) => state.cards.set(card.id, { ...card, ...next, updatedAt: now, updatedByName: user?.displayName ?? null });
  switch (op.type) {
    // Seulement les champs donnés : titre, échéance (null : retirée, avec
    // « Fait »), priorité (option du projet allumée)
    case 'card.update': {
      if (card.deletedAt || !can.edit) return;
      const next = {};
      if (op.title !== undefined) {
        const title = cleanCardTitle(op.title);
        if (!title) return;
        next.title = title;
      }
      if (op.due !== undefined) {
        const due = cleanCardDue(op.due);
        if (due === undefined) return;
        Object.assign(next, { dueDate: due?.date ?? null, dueTime: due?.time ?? null, remindBefore: due?.remindBefore ?? null });
        if (due === null) Object.assign(next, { done: false, doneAt: null });
      }
      if (op.priority !== undefined) {
        if (!isCardPriority(op.priority) || !project.priorityEnabled) return;
        next.priority = op.priority;
      }
      if (Object.keys(next).length) set(next);
      return;
    }
    case 'card.done': {
      if (card.deletedAt || !can.edit || typeof op.done !== 'boolean' || !card.dueDate) return;
      if (Boolean(card.done) !== op.done) set({ done: op.done, doneAt: op.done ? now : null });
      return;
    }
    // Description : la version monte (le serveur en fait autant) ; une
    // version de départ dépassée ne change rien ici (le serveur refusera,
    // la carte passera « À vérifier »)
    case 'card.describe': {
      const text = cleanDescription(op.description);
      if (card.deletedAt || !can.edit || text === null || op.baseVersion !== card.descriptionVersion) return;
      if (text !== card.description) {
        set({ description: text, descriptionVersion: card.descriptionVersion + 1, descriptionByMe: true, descriptionByName: user?.displayName ?? null, descriptionAt: now });
      }
      return;
    }
    // Une case cochée : seulement elle, sur le texte actuel
    case 'card.task': {
      if (card.deletedAt || !can.edit || typeof op.checked !== 'boolean') return;
      const next = setTaskAt(card.description, op.index, op.text, op.checked);
      if (next !== null && next !== card.description) set({ description: next, descriptionVersion: card.descriptionVersion + 1, descriptionByMe: true, descriptionByName: user?.displayName ?? null, descriptionAt: now });
      return;
    }
    case 'link.create': {
      const url = cleanLinkUrl(op.url);
      const title = cleanLinkTitle(op.title);
      const links = card.links ?? [];
      if (card.deletedAt || !can.edit || !url || title === null || links.length >= LINKS_PER_CARD_MAX || links.some((link) => link.id === op.linkId)) return;
      set({ links: [...links, { id: op.linkId, title, url }] });
      return;
    }
    case 'link.update': {
      const link = (card.links ?? []).find((l) => l.id === op.linkId);
      if (card.deletedAt || !can.edit || !link) return;
      const title = op.title === undefined ? link.title : cleanLinkTitle(op.title);
      const url = op.url === undefined ? link.url : cleanLinkUrl(op.url);
      if (title === null || !url) return;
      set({ links: card.links.map((l) => (l.id === link.id ? { ...l, title, url } : l)) });
      return;
    }
    case 'link.delete': {
      if (card.deletedAt || !can.edit || !(card.links ?? []).some((l) => l.id === op.linkId)) return;
      set({ links: card.links.filter((l) => l.id !== op.linkId) });
      return;
    }
    case 'card.move': {
      if (card.deletedAt || !can.move || op.afterId === card.id) return;
      const column = op.columnId === undefined ? targetColumn(project, card.columnId) : targetColumn(project, op.columnId);
      if (!column) return;
      const lost = op.columnId !== undefined && column.id !== op.columnId;
      const next = placed(state, card, column, lost ? undefined : op.afterId, now);
      if (next) state.cards.set(card.id, { ...next, updatedByName: user?.displayName ?? null });
      return;
    }
    case 'card.delete': {
      if (card.deletedAt || !can.remove) return;
      const column = project.columns.find((c) => c.id === card.columnId);
      set({ deletedAt: now, deletedByName: user?.displayName ?? null, deletedColumnName: column?.name ?? null });
      return;
    }
    // En bas de sa colonne, ou de la première si la sienne n'existe plus
    case 'card.restore': {
      if (!card.deletedAt || !can.restore) return;
      const column = targetColumn(project, card.columnId);
      if (!column) return;
      const rows = columnCards(state, column.id);
      const place = placeFor(rows, card.id, undefined);
      applyRenumber(state, place.renumber, now);
      set({ deletedAt: null, deletedByName: null, deletedColumnName: null, columnId: column.id, position: place.position });
      return;
    }
    // Copie à moi, juste dessous
    case 'card.duplicate': {
      const title = cleanCardTitle(op.title);
      if (card.deletedAt || !can.duplicate || !title || state.cards.has(op.newCardId)) return;
      const rows = columnCards(state, card.columnId);
      const place = placeFor(rows, op.newCardId, card.id);
      applyRenumber(state, place.renumber, now);
      state.cards.set(op.newCardId, {
        ...card, id: op.newCardId, title, position: place.position, createdByMe: true, createdByName: user?.displayName ?? null,
        createdAt: now, updatedAt: now, updatedByName: user?.displayName ?? null,
        // Détails copiés, « Fait » décoché ; liens avec leurs nouveaux identifiants
        descriptionVersion: 1, descriptionByMe: Boolean(card.description), descriptionByName: card.description ? user?.displayName ?? null : null,
        descriptionAt: card.description ? now : null, done: false, doneAt: null,
        links: (card.links ?? []).map((link) => ({ ...link, id: op.linkIds?.[link.id] ?? link.id })),
      });
      state.projects.set(project.id, { ...project, cardIds: [...(project.cardIds ?? []), op.newCardId] });
      return;
    }
    case 'card.labels': {
      const ids = cleanCardLabelIds(op.labelIds);
      if (card.deletedAt || !can.edit || !ids || !ids.every((id) => project.labels.some((label) => label.id === id))) return;
      set({ labelIds: ids });
      return;
    }
    // Personnes : membres qui ne sont pas en lecture seule ; un Contributeur
    // sur une carte qu'il n'a pas créée peut seulement se retirer
    case 'card.assign': {
      const ids = cleanAssigneeIds(op.userIds);
      if (card.deletedAt || !ids || !assignChangeAllowed(can, card.assigneeIds ?? [], ids, me)) return;
      const roles = new Map((project.members ?? []).map((member) => [member.id, member.role]));
      if (!ids.every((id) => (card.assigneeIds ?? []).includes(id) || assignableRole(roles.get(id)))) return;
      set({ assigneeIds: ids });
      return;
    }
    default:
  }
}
