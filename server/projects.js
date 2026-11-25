// Projets : droits, opérations, partage, synchronisation et ménage (étape 1
// du cadrage docs/cadrage-projets.md, migration 43).
//
// Règle d'or, comme pour les listes et les notes : chaque opération relit
// le projet dans la base et vérifie le rôle du compte connecté avec UNE
// seule fonction, projectAccess ; pour une carte, cardRights
// (public/js/projects.js) dit en plus ce que le compte peut faire sur CETTE
// carte. Un projet inconnu, ou qu'on n'a pas le droit de voir, reçoit
// exactement la même réponse (404 « Projet introuvable. ») : l'Admin n'a
// aucun droit sur les projets des autres. Un membre dont le rôle ne suffit
// pas reçoit 403, avec un message qui dit pourquoi.
//
// Quatre rôles (public/js/projects.js) : propriétaire (owner_id), « Peut
// modifier », « Contributeur » et « Lecture seule » (project_members). Une
// carte, une colonne ou une étiquette est toujours cherchée DANS le projet
// de la demande : un identifiant d'un autre projet répond 404.
//
// Un projet dans la corbeille n'est visible que de son propriétaire, et
// seulement pour le restaurer ou l'effacer : toute autre opération y répond
// 404 (une suppression l'emporte sur une modification).
//
// Fonction « Projets » coupée pour le compte (Réglages › Fonctions,
// users.projects_enabled) : rien des projets n'est envoyé à ses appareils,
// et toute opération ou route des projets est refusée (403) : il ne voit
// rien, il ne doit rien pouvoir changer. Rien n'est effacé.
//
// Historique (card_events) : une ligne par changement d'une carte, avec la
// personne et l'heure ; ses valeurs sont construites champ par champ
// (identifiants, noms de colonnes et d'étiquettes d'alors), jamais le titre
// d'une carte. Rien du contenu d'un projet n'est écrit dans le journal de
// sécurité (seulement des identifiants et des nombres).
//
// Détails d'une carte (étape 2, migration 44) : description (marques des
// notes, numéro de version : jamais d'écrasement, comme une note ; une case
// se coche seule, par son numéro et son texte, sans gêner une autre case
// cochée en même temps), échéance (date, heure et rappel facultatifs) et
// case « Fait » (la seule marque de « fait »), priorité (option du projet),
// liens (http et https seulement, vérifiés ici, jamais appelés par le
// serveur). Rappels : choisis ici (takeCardReminders, une fois par
// personne et par signature date + heure + délai, jamais pour une carte
// faite), remis par server/notify.js (runReminders, deliver).
//
// Commentaires, historique, cartes suivies, notifications (étape 3,
// migration 45) : écrire un commentaire (propriétaire, « Peut modifier »,
// Contributeur, sur toutes les cartes ; jamais en « Lecture seule »),
// modifier le sien, supprimer le sien (le propriétaire du projet peut
// supprimer celui d'un autre : modération, jamais le modifier) ; le texte
// d'un commentaire ne sort jamais du projet (ni journal, ni historique, ni
// page Notifications). « Suivre » / « Ne plus suivre » une carte
// (card_follows, propre à chacun). L'historique d'une carte est lu en
// ligne (cardHistory), phrase par phrase construites par le téléphone à
// partir de valeurs choisies champ par champ. Après chaque écriture
// réussie, ce qui peut donner une notification est confié à
// server/notify.js (projectActivity), qui choisit qui la reçoit.
//
// Option « Échéances » du projet (décision du 25 novembre 2026, après
// l'essai ; migration 46) : comme « Priorité », mais allumée au départ et
// changée par le propriétaire et « Peut modifier ». Coupée, rien n'est
// effacé, mais une échéance ou « Fait » sont refusés (400) et les cartes
// du projet ne donnent plus de rappel (règle commune : deadlinesOn,
// public/js/projects.js ; résumé du matin : server/notify.js).
//
// Les dates sont posées ici, par le serveur.

import crypto from 'node:crypto';
import {
  PROJECT_ACCESS, PROJECTS_MAX, COLUMNS_MAX, CARDS_MAX, PROJECT_LABELS_MAX, PROJECT_MEMBERS_MAX,
  PROJECT_TRASH_DAYS, CARD_HISTORY_MAX, DEFAULT_COLUMNS, DEFAULT_COLUMN_COLOR, PROJECT_NAME_MAX,
  LABELS_PER_CARD_MAX, ASSIGNEES_MAX, LINKS_PER_CARD_MAX, CARD_DESCRIPTION_MAX, TASK_TEXT_MAX,
  cleanCardDue, isCardPriority, cleanLinkUrl, cleanLinkTitle, cleanDescription,
  roleOfAccess, projectRights, cardRights, deadlinesOn, assignChangeAllowed, assignableRole, isColumnColor,
  cleanProjectName, cleanColumnName, cleanCardTitle, cleanProjectLabelName, nameKey,
  cleanCardLabelIds, cleanAssigneeIds, placeFor, byPosition, isUuid,
  cleanComment, commentRights, followsCard, COMMENTS_PER_CARD_MAX, COMMENT_MAX, cleanImportedAuthor, cleanImportedAt,
} from '../public/js/projects.js';
import { DEFAULT_LABEL_COLOR } from '../public/js/labels.js';
import { setTaskAt } from '../public/js/note-format.js';
import { reminderAt } from '../public/js/due-time.js';
import { translate } from '../public/js/i18n.js';
import { userLocale } from './locale.js';

const DAY = 24 * 60 * 60 * 1000;

// Refus (noms des textes, public/js/i18n/fr/ops.js)
export const PROJECT_NOT_FOUND = 'ops.projetIntrouvable';
export const CARD_NOT_FOUND = 'ops.carteIntrouvable';
export const COLUMN_NOT_FOUND = 'ops.colonneIntrouvable';
export const PROJECT_LABEL_NOT_FOUND = 'ops.etiquetteProjetIntrouvable';
export const PROJECT_READ_ONLY = 'ops.projetLectureSeule';
export const PROJECT_OWNER_ONLY = 'ops.projetProprietaireSeulement';
export const PROJECT_MANAGERS_ONLY = 'ops.projetModifierSeulement';
export const CARD_EDIT_OWN = 'ops.carteModifierSiennes';
export const CARD_DELETE_OWN = 'ops.carteSupprimerSiennes';
export const CARD_RESTORE_OWN = 'ops.carteRestaurerSiennes';
export const CARD_ASSIGN_OWN = 'ops.carteAttribuerSiennes';
export const PROJECTS_OFF = 'ops.projetsCoupes';
export const CARD_CONFLICT = 'ops.carteConflit';
export const LINK_NOT_FOUND = 'ops.lienIntrouvable';
export const COMMENT_NOT_FOUND = 'ops.commentaireIntrouvable';
export const COMMENT_OWN = 'ops.commentaireSiensSeulement';
export const DEADLINES_OFF = 'ops.echeancesProjetCoupees';
export const DEADLINES_MANAGERS_ONLY = 'ops.echeancesProjetModifierSeulement';

// Opérations des projets (file d'attente, POST /api/ops). Les créations et
// duplications de projets sont comptées par un plafond (route POST /api/ops).
export const PROJECT_CREATIONS = ['project.create', 'project.duplicate'];
// Enregistrements de la description d'une carte (et cases cochées) :
// comptés par un plafond, comme les notes (route POST /api/ops)
export const CARD_SAVES = ['card.describe', 'card.task'];
// Commentaires écrits : comptés par un plafond (120 par heure et par
// compte, route POST /api/ops)
export const COMMENT_WRITES = ['comment.create'];
// Lignes d'historique rendues par cardHistory (les plus récentes d'abord)
const HISTORY_SHOWN = 300;
// Plus de nouveautés listées carte par carte au-delà (le point du projet suffit)
const NEW_CARDS_MAX = 500;
// Rappel d'une carte envoyé avec moins de 30 minutes de retard (serveur
// arrêté au bon moment), sinon abandonné, comme les tâches
const REMIND_LATE_MS = 30 * 60 * 1000;
// Plusieurs enregistrements de la description par la même personne en un
// quart d'heure : une seule ligne d'historique
const DESCRIBE_EVENT_MS = 15 * 60 * 1000;

// Droit écrit dans le journal de sécurité, toujours en anglais
const JOURNAL_ACCESS = { modification: 'edit', contribution: 'contribute', lecture: 'read' };

// Rôle d'un compte sur un projet : 'owner', 'editor', 'contributor',
// 'reader', ou null (aucun : le projet est traité comme inconnu). LE seul
// contrôle, utilisé par toutes les opérations, les routes et la
// synchronisation. project : la ligne de la base, avec member_access, le
// droit de CE compte dans project_members (lu par la même requête). Un
// projet dans la corbeille n'est visible que par son propriétaire.
export function projectAccess(user, project) {
  if (!user || !project) return null;
  if (project.owner_id === user.id) return 'owner';
  if (project.deleted_at) return null;
  return roleOfAccess(project.member_access);
}

export function createProjectService(ctx, { OpError }) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();
  const purgeLimit = () => new Date(ctx.now() - PROJECT_TRASH_DAYS * DAY).toISOString();
  const newId = () => crypto.randomUUID();

  const q = {
    // Un projet, avec le droit de CE compte dans project_members
    projectFor: db.prepare(`SELECT projects.*,
        (SELECT access FROM project_members WHERE project_id = projects.id AND user_id = :userId) AS member_access
      FROM projects WHERE projects.id = :projectId`),
    project: db.prepare('SELECT * FROM projects WHERE id = ?'),
    countOwned: db.prepare('SELECT COUNT(*) FROM projects WHERE owner_id = ?').pluck(),
    insertProject: db.prepare(`INSERT INTO projects (id, owner_id, name, priority_enabled, deadlines_enabled, duplicated_from, created_at, updated_at, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    renameProject: db.prepare('UPDATE projects SET name = ?, updated_at = ?, changed_at = ? WHERE id = ?'),
    setPriority: db.prepare('UPDATE projects SET priority_enabled = ?, updated_at = ?, changed_at = ? WHERE id = ?'),
    setDeadlines: db.prepare('UPDATE projects SET deadlines_enabled = ?, updated_at = ?, changed_at = ? WHERE id = ?'),
    trashProject: db.prepare('UPDATE projects SET deleted_at = ?, deleted_by = ?, changed_at = ? WHERE id = ?'),
    untrashProject: db.prepare('UPDATE projects SET deleted_at = NULL, deleted_by = NULL, changed_at = ?, cards_reset_at = ? WHERE id = ?'),
    // La structure a changé (partage, colonnes, étiquettes, cartes effacées)
    touch: db.prepare('UPDATE projects SET changed_at = ? WHERE id = ?'),
    eraseProject: db.prepare('DELETE FROM projects WHERE id = ?'),

    // Personnes
    user: db.prepare('SELECT id, username, display_name, active FROM users WHERE id = ?'),
    userName: db.prepare('SELECT display_name FROM users WHERE id = ?').pluck(),
    members: db.prepare(`SELECT users.id, users.username, users.display_name, users.active, project_members.access
      FROM project_members JOIN users ON users.id = project_members.user_id WHERE project_members.project_id = ? ORDER BY users.id`),
    memberIds: db.prepare('SELECT user_id FROM project_members WHERE project_id = ?').pluck(),
    addMember: db.prepare('INSERT INTO project_members (project_id, user_id, access, added_at) VALUES (?, ?, ?, ?)'),
    removeMember: db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?'),
    setAccess: db.prepare('UPDATE project_members SET access = ? WHERE project_id = ? AND user_id = ?'),
    projectsEnabled: db.prepare('SELECT projects_enabled FROM users WHERE id = ?').pluck(),
    newsEnabled: db.prepare('SELECT news_enabled FROM users WHERE id = ?').pluck(),
    locale: db.prepare('SELECT locale FROM users WHERE id = ?').pluck(),

    // Colonnes
    columns: db.prepare('SELECT * FROM project_columns WHERE project_id = ?'),
    column: db.prepare('SELECT * FROM project_columns WHERE id = ? AND project_id = ?'),
    anyColumn: db.prepare('SELECT project_id FROM project_columns WHERE id = ?').pluck(),
    insertColumn: db.prepare(`INSERT INTO project_columns (id, project_id, name, name_key, color, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    updateColumn: db.prepare('UPDATE project_columns SET name = ?, name_key = ?, color = ?, updated_at = ? WHERE id = ?'),
    moveColumn: db.prepare('UPDATE project_columns SET position = ?, updated_at = ? WHERE id = ?'),
    deleteColumn: db.prepare('DELETE FROM project_columns WHERE id = ?'),

    // Étiquettes du projet
    labels: db.prepare('SELECT * FROM project_labels WHERE project_id = ?'),
    label: db.prepare('SELECT * FROM project_labels WHERE id = ? AND project_id = ?'),
    anyLabel: db.prepare('SELECT project_id FROM project_labels WHERE id = ?').pluck(),
    insertLabel: db.prepare('INSERT INTO project_labels (id, project_id, name, name_key, color, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    updateLabel: db.prepare('UPDATE project_labels SET name = ?, name_key = ?, color = ? WHERE id = ?'),
    deleteLabel: db.prepare('DELETE FROM project_labels WHERE id = ?'),
    cardsWithLabel: db.prepare(`SELECT cards.id FROM card_labels JOIN cards ON cards.id = card_labels.card_id
      WHERE card_labels.label_id = ? AND cards.deleted_at IS NULL`).pluck(),

    // Cartes
    card: db.prepare('SELECT * FROM cards WHERE id = ?'),
    projectCard: db.prepare('SELECT * FROM cards WHERE id = ? AND project_id = ?'),
    countCards: db.prepare('SELECT COUNT(*) FROM cards WHERE project_id = ?').pluck(),
    liveCount: db.prepare('SELECT COUNT(*) FROM cards WHERE project_id = ? AND deleted_at IS NULL').pluck(),
    columnCards: db.prepare('SELECT id, position FROM cards WHERE column_id = ? AND deleted_at IS NULL'),
    projectCardIds: db.prepare('SELECT id FROM cards WHERE project_id = ?').pluck(),
    insertCard: db.prepare(`INSERT INTO cards (id, project_id, column_id, position, title, created_by, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    renameCard: db.prepare('UPDATE cards SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?'),
    placeCard: db.prepare('UPDATE cards SET column_id = ?, position = ?, updated_at = ?, updated_by = ? WHERE id = ?'),
    // Renumérotation d'une colonne : la date change aussi (les autres
    // appareils reçoivent ainsi les nouvelles positions)
    renumberCard: db.prepare('UPDATE cards SET position = ?, updated_at = ? WHERE id = ?'),
    touchCard: db.prepare('UPDATE cards SET updated_at = ?, updated_by = ? WHERE id = ?'),
    trashCard: db.prepare('UPDATE cards SET deleted_at = ?, deleted_by = ?, deleted_column_name = ?, updated_at = ?, updated_by = ? WHERE id = ?'),
    untrashCard: db.prepare(`UPDATE cards SET deleted_at = NULL, deleted_by = NULL, deleted_column_name = NULL, column_id = ?, position = ?,
      updated_at = ?, updated_by = ? WHERE id = ?`),
    eraseCard: db.prepare('DELETE FROM cards WHERE id = ?'),
    cardLabelIds: db.prepare('SELECT label_id FROM card_labels WHERE card_id = ? ORDER BY label_id').pluck(),
    addCardLabel: db.prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)'),
    removeCardLabel: db.prepare('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?'),
    projectCardLabels: db.prepare('SELECT card_labels.card_id, card_labels.label_id FROM card_labels JOIN cards ON cards.id = card_labels.card_id WHERE cards.project_id = ?'),
    cardAssignees: db.prepare('SELECT user_id FROM card_assignees WHERE card_id = ? ORDER BY position, user_id').pluck(),
    addAssignee: db.prepare('INSERT OR IGNORE INTO card_assignees (card_id, user_id, position) VALUES (?, ?, ?)'),
    removeAssignee: db.prepare('DELETE FROM card_assignees WHERE card_id = ? AND user_id = ?'),
    projectAssignees: db.prepare(`SELECT card_assignees.card_id, card_assignees.user_id FROM card_assignees
      JOIN cards ON cards.id = card_assignees.card_id WHERE cards.project_id = ? ORDER BY card_assignees.position, card_assignees.user_id`),
    // Cartes d'un projet attribuées à une personne (elle part, ou passe en lecture seule)
    assignedIn: db.prepare(`SELECT cards.id FROM card_assignees JOIN cards ON cards.id = card_assignees.card_id
      WHERE cards.project_id = ? AND card_assignees.user_id = ?`).pluck(),

    // Détails (étape 2) : description, échéance, « Fait », priorité
    describeCard: db.prepare(`UPDATE cards SET description = ?, description_version = description_version + 1, description_by = ?, description_at = ?,
      updated_at = ?, updated_by = ? WHERE id = ?`),
    setDue: db.prepare('UPDATE cards SET due_date = ?, due_time = ?, remind_before = ?, due_done = ?, due_done_at = ?, updated_at = ?, updated_by = ? WHERE id = ?'),
    setCardPriority: db.prepare('UPDATE cards SET priority = ?, updated_at = ?, updated_by = ? WHERE id = ?'),
    copyDetails: db.prepare(`UPDATE cards SET description = ?, description_by = ?, description_at = ?, priority = ?, due_date = ?, due_time = ?, remind_before = ?
      WHERE id = ?`),
    // Enregistrement précédent encore en file sur le téléphone (afterOp)
    applied: db.prepare('SELECT user_id, result FROM applied_ops WHERE id = ?'),
    lastCardEvent: db.prepare('SELECT * FROM card_events WHERE card_id = ? ORDER BY id DESC LIMIT 1'),
    // Liens d'une carte (toujours cherchés DANS la carte)
    links: db.prepare('SELECT * FROM card_links WHERE card_id = ? ORDER BY position, created_at, id'),
    link: db.prepare('SELECT * FROM card_links WHERE id = ? AND card_id = ?'),
    anyLink: db.prepare('SELECT card_id FROM card_links WHERE id = ?').pluck(),
    countLinks: db.prepare('SELECT COUNT(*) FROM card_links WHERE card_id = ?').pluck(),
    nextLinkPosition: db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM card_links WHERE card_id = ?').pluck(),
    insertLink: db.prepare('INSERT INTO card_links (id, card_id, title, url, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    updateLink: db.prepare('UPDATE card_links SET title = ?, url = ? WHERE id = ?'),
    deleteLink: db.prepare('DELETE FROM card_links WHERE id = ?'),
    projectLinks: db.prepare(`SELECT card_links.* FROM card_links JOIN cards ON cards.id = card_links.card_id
      WHERE cards.project_id = ? ORDER BY card_links.position, card_links.created_at, card_links.id`),

    // Historique et réglages propres à chacun
    insertEvent: db.prepare('INSERT INTO card_events (project_id, card_id, user_id, type, params, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    trimEvents: db.prepare(`DELETE FROM card_events WHERE card_id = :cardId AND id <= (
      SELECT id FROM card_events WHERE card_id = :cardId ORDER BY id DESC LIMIT 1 OFFSET :keep)`),
    lastEvent: db.prepare('SELECT COALESCE(MAX(id), 0) FROM card_events WHERE project_id = ?').pluck(),
    lastOthersEvent: db.prepare('SELECT COALESCE(MAX(id), 0) FROM card_events WHERE project_id = ? AND (user_id IS NULL OR user_id <> ?)').pluck(),
    state: db.prepare('SELECT * FROM project_user_state WHERE project_id = ? AND user_id = ?'),
    states: db.prepare('SELECT * FROM project_user_state WHERE user_id = ?'),
    ensureState: db.prepare('INSERT OR IGNORE INTO project_user_state (project_id, user_id) VALUES (?, ?)'),
    setSeen: db.prepare('UPDATE project_user_state SET last_seen_event = MAX(last_seen_event, ?) WHERE project_id = ? AND user_id = ?'),
    setMutedNews: db.prepare('UPDATE project_user_state SET muted_news = ? WHERE project_id = ? AND user_id = ?'),
    setMutedPush: db.prepare('UPDATE project_user_state SET muted_push = ? WHERE project_id = ? AND user_id = ?'),
    setInDeadlines: db.prepare('UPDATE project_user_state SET in_deadlines = ? WHERE project_id = ? AND user_id = ?'),
    dropState: db.prepare('DELETE FROM project_user_state WHERE project_id = ? AND user_id = ?'),
    newCards: db.prepare(`SELECT DISTINCT card_id FROM card_events WHERE project_id = ? AND id > ? AND (user_id IS NULL OR user_id <> ?)
      LIMIT ${NEW_CARDS_MAX}`).pluck(),

    // Commentaires (étape 3), toujours cherchés DANS la carte
    comment: db.prepare('SELECT * FROM card_comments WHERE id = ? AND card_id = ?'),
    anyComment: db.prepare('SELECT card_id FROM card_comments WHERE id = ?').pluck(),
    countComments: db.prepare('SELECT COUNT(*) FROM card_comments WHERE card_id = ? AND deleted_at IS NULL').pluck(),
    insertComment: db.prepare('INSERT INTO card_comments (id, card_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    // Commentaire importé par un assistant IA (étape 5, section 12.4) :
    // l'auteur et la date d'origine dans leurs colonnes, jamais dans le texte
    insertImportedComment: db.prepare(`INSERT INTO card_comments (id, card_id, user_id, body, imported_author, imported_at, imported_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    editComment: db.prepare('UPDATE card_comments SET body = ?, edited = 1, updated_at = ? WHERE id = ?'),
    // Supprimé : le texte part tout de suite ; la ligne reste (synchronisation)
    dropComment: db.prepare("UPDATE card_comments SET body = '', deleted_at = ?, updated_at = ? WHERE id = ?"),
    commented: db.prepare('SELECT 1 FROM card_comments WHERE card_id = ? AND user_id = ? LIMIT 1').pluck(),
    commenters: db.prepare('SELECT DISTINCT user_id FROM card_comments WHERE card_id = ? AND user_id IS NOT NULL').pluck(),
    commentsSince: db.prepare(`SELECT card_comments.*, cards.project_id FROM card_comments JOIN cards ON cards.id = card_comments.card_id
      WHERE cards.project_id = ? AND card_comments.updated_at >= ?`),
    allComments: db.prepare(`SELECT card_comments.*, cards.project_id FROM card_comments JOIN cards ON cards.id = card_comments.card_id
      WHERE cards.project_id = ?`),
    // Cartes suivies (choix explicites ; propres à chacun)
    follow: db.prepare('SELECT following FROM card_follows WHERE card_id = ? AND user_id = ?').pluck(),
    follows: db.prepare('SELECT user_id, following FROM card_follows WHERE card_id = ?'),
    setFollow: db.prepare(`INSERT INTO card_follows (card_id, user_id, following) VALUES (?, ?, ?)
      ON CONFLICT (card_id, user_id) DO UPDATE SET following = excluded.following`),
    myFollows: db.prepare(`SELECT card_follows.card_id, card_follows.following FROM card_follows
      JOIN cards ON cards.id = card_follows.card_id WHERE card_follows.user_id = ? AND cards.project_id = ?`),
    dropFollows: db.prepare('DELETE FROM card_follows WHERE user_id = ? AND card_id IN (SELECT id FROM cards WHERE project_id = ?)'),
    // Historique d'une carte, le plus récent d'abord
    history: db.prepare(`SELECT id, user_id, type, params, source, created_at FROM card_events WHERE card_id = ? ORDER BY id DESC LIMIT ${HISTORY_SHOWN}`),
  };

  // --- Prévenir les appareils (temps réel), après l'écriture réussie ---
  // « event: project », sans aucune donnée : chaque appareil demande ensuite
  // les changements par /api/sync, droits revérifiés.
  const touched = new Set();
  const changedFor = (userId) => touched.add(userId);
  const changedForProject = (project) => {
    changedFor(project.owner_id);
    for (const id of q.memberIds.all(project.id)) changedFor(id);
  };
  // Ce qui peut donner une notification (server/notify.js, projectActivity),
  // confié seulement après une écriture réussie : des identifiants, jamais
  // un titre ni un texte
  const activity = [];
  const notifyLater = (entry) => activity.push(entry);
  function flushNotify() {
    if (touched.size) ctx.events?.notifyProjects?.([...touched]);
    touched.clear();
    for (const entry of activity.splice(0)) ctx.notify?.projectActivity?.(entry);
  }
  const clearNotify = () => {
    touched.clear();
    activity.length = 0;
  };

  // --- Petits outils ---

  function requireUuid(value, key = 'ops.identifiantInvalide') {
    if (!isUuid(value)) throw new OpError(400, key);
    return value.toLowerCase();
  }

  // Fonction « Projets » utilisée par le compte ? Sinon, refus (403) : il
  // ne voit rien des projets, il n'y change rien
  function requireProjectsOn(user) {
    if (q.projectsEnabled.get(user.id) !== 1) throw new OpError(403, PROJECTS_OFF);
  }
  const projectsOn = (userId) => q.projectsEnabled.get(userId) === 1;

  const localeOf = (user) => userLocale({ locale: q.locale.get(user.id) }, ctx.config);

  // Projet que le compte voit, avec son rôle ; sinon 404 comme un projet
  // inconnu. trashed : le projet peut être dans la corbeille (restaurer,
  // effacer : propriétaire seulement) ; sinon un projet dans la corbeille
  // est inconnu, même pour son propriétaire.
  function projectFor(user, projectId, { trashed = false } = {}) {
    requireProjectsOn(user);
    const project = q.projectFor.get({ userId: user.id, projectId: requireUuid(projectId) });
    const role = projectAccess(user, project);
    if (!role || (project.deleted_at && !trashed)) throw new OpError(404, PROJECT_NOT_FOUND);
    return { project, role, rights: projectRights(role) };
  }

  // Refus pour un rôle insuffisant : le message dit pourquoi
  function deny(role, ownerOnly = false) {
    if (role === 'reader') return new OpError(403, PROJECT_READ_ONLY);
    return new OpError(403, ownerOnly ? PROJECT_OWNER_ONLY : PROJECT_MANAGERS_ONLY);
  }

  // Carte d'un projet que le compte voit : { card, project, role, rights,
  // can } (can : cardRights de cette carte). deleted : la carte doit être
  // dans les cartes supprimées (restaurer) ; sinon, une carte supprimée est
  // inconnue. projectId (facultatif) : la carte doit être dans CE projet.
  function cardFor(user, cardId, { deleted = false, projectId } = {}) {
    requireProjectsOn(user);
    const card = q.card.get(requireUuid(cardId));
    if (!card || (projectId !== undefined && projectId !== null && card.project_id !== requireUuid(projectId))) throw new OpError(404, CARD_NOT_FOUND);
    let found;
    try {
      found = projectFor(user, card.project_id);
    } catch (err) {
      if (err instanceof OpError && err.status === 404) throw new OpError(404, CARD_NOT_FOUND);
      throw err;
    }
    if (Boolean(card.deleted_at) !== deleted) throw new OpError(404, CARD_NOT_FOUND);
    const can = cardRights({ createdBy: card.created_by, assigneeIds: q.cardAssignees.all(card.id) }, user.id, found.role);
    return { card, ...found, can };
  }

  // Refus d'une modification de carte : lecture seule, ou Contributeur hors
  // de ses cartes
  const cardDenied = (role, key) => (role === 'reader' ? new OpError(403, PROJECT_READ_ONLY) : new OpError(403, key));

  // Colonne de ce projet (404 si elle est d'un autre projet ou inconnue)
  function columnOf(project, columnId) {
    const column = q.column.get(requireUuid(columnId), project.id);
    if (!column) throw new OpError(404, COLUMN_NOT_FOUND);
    return column;
  }

  // Colonne visée par une carte (créer, déplacer). Une colonne d'un autre
  // projet : 404. Une colonne qui n'existe plus (supprimée pendant que le
  // téléphone était hors ligne) : la première colonne du projet (11.3).
  function targetColumn(project, columnId) {
    const id = requireUuid(columnId);
    const column = q.column.get(id, project.id);
    if (column) return column;
    if (q.anyColumn.get(id)) throw new OpError(404, COLUMN_NOT_FOUND);
    return byPosition(q.columns.all(project.id))[0];
  }

  // Voisine « après » d'une carte (afterId) : null (en haut), absente (en
  // bas), ou une carte de ce projet (une carte d'un autre projet : 404 ;
  // une carte supprimée ou d'une autre colonne : en bas, voir placeFor)
  function afterCardOf(project, value) {
    if (value === undefined || value === null) return value;
    const id = requireUuid(value, 'ops.placeInvalide');
    const card = q.card.get(id);
    if (card && card.project_id !== project.id) throw new OpError(404, CARD_NOT_FOUND);
    return id;
  }

  // Voisine « après » d'une colonne : null (en premier), absente (à la
  // fin), ou une colonne de ce projet (d'un autre projet : 404 ; inconnue,
  // supprimée entre-temps : à la fin)
  function afterColumnOf(project, value) {
    if (value === undefined || value === null) return value;
    const id = requireUuid(value, 'ops.placeInvalide');
    if (!q.column.get(id, project.id) && q.anyColumn.get(id)) throw new OpError(404, COLUMN_NOT_FOUND);
    return id;
  }

  // Place une carte dans une colonne (après afterId) ; renumérote la
  // colonne si besoin. Renvoie la position, ou null si la carte y était
  // déjà (rien n'est écrit).
  function placeCard(card, column, afterId, user, now) {
    const place = placeFor(q.columnCards.all(column.id), card.id, afterId);
    if (place.unchanged) return null;
    for (const row of place.renumber ?? []) q.renumberCard.run(row.position, now, row.id);
    q.placeCard.run(column.id, place.position, now, user.id, card.id);
    return place.position;
  }

  // Ligne d'historique d'une carte (300 au plus par carte : les plus
  // anciennes partent). params : construit champ par champ par l'appelant.
  // Renvoie le numéro de la ligne écrite.
  function logEvent(card, user, type, params, source) {
    const id = Number(q.insertEvent.run(card.project_id, card.id, user?.id ?? null, type, JSON.stringify(params ?? {}), source, nowIso()).lastInsertRowid);
    q.trimEvents.run({ cardId: card.id, keep: CARD_HISTORY_MAX });
    return id;
  }

  // Ceux qui suivent une carte (9.2) : parmi les personnes qui voient le
  // projet, celles qui l'ont choisi, ou qui l'ont créée, y sont attribuées
  // ou l'ont commentée, sauf « Ne plus suivre »
  function followerIds(cardId) {
    const card = q.card.get(cardId);
    const project = card ? q.project.get(card.project_id) : null;
    if (!card || !project || project.deleted_at) return new Set();
    const choices = new Map(q.follows.all(card.id).map((row) => [row.user_id, row.following === 1]));
    const assigned = new Set(q.cardAssignees.all(card.id));
    const commenters = new Set(q.commenters.all(card.id));
    const out = new Set();
    for (const userId of [project.owner_id, ...q.memberIds.all(project.id)]) {
      const follows = followsCard({
        choice: choices.has(userId) ? choices.get(userId) : null,
        created: card.created_by === userId,
        assigned: assigned.has(userId),
        commented: commenters.has(userId),
      });
      if (follows) out.add(userId);
    }
    return out;
  }

  // Une activité d'une carte à confier aux notifications : kind ('card'
  // nouvelle carte, 'assign', 'comment', 'move', 'due', 'done', 'undone',
  // 'describe') ; eventId : la ligne d'historique (Nouveautés : déjà vu ?)
  function cardActivity(kind, card, user, eventId, extra = {}) {
    notifyLater({ kind, projectId: card.project_id, cardId: card.id, actorId: user.id, eventId, ...extra });
  }

  // Une personne n'a plus le droit d'être attribuée dans ce projet (partie,
  // retirée, passée en lecture seule) : retirée de ses cartes (l'historique
  // le dit)
  function unassignEverywhere(project, userId, actor, source, now) {
    for (const cardId of q.assignedIn.all(project.id, userId)) {
      q.removeAssignee.run(cardId, userId);
      q.touchCard.run(now, actor.id, cardId);
      logEvent({ id: cardId, project_id: project.id }, actor, 'unassign', { user: userId }, source);
    }
  }

  // Rôle d'une personne dans un projet (pour l'attribution)
  function roleOfUser(project, userId) {
    if (userId === project.owner_id) return 'owner';
    return roleOfAccess(q.projectFor.get({ userId, projectId: project.id })?.member_access);
  }

  // --- Ce que reçoit le téléphone (construit champ par champ) ---

  // Personnes du projet, le propriétaire d'abord : identifiant, prénom,
  // compte actif, rôle
  function membersOf(project) {
    const owner = q.user.get(project.owner_id);
    const people = owner ? [{ id: owner.id, displayName: owner.display_name, active: owner.active === 1, role: 'owner' }] : [];
    for (const m of q.members.all(project.id)) {
      people.push({ id: m.id, displayName: m.display_name, active: m.active === 1, role: roleOfAccess(m.access) });
    }
    return people;
  }

  // La structure d'un projet. Dans la corbeille (propriétaire seulement) :
  // ce que montre l'onglet « Projets » de la Corbeille (nombres), sans les
  // colonnes ni les étiquettes.
  function describeProject(project, user) {
    const role = projectAccess(user, project);
    const base = {
      id: project.id,
      name: project.name,
      role,
      priorityEnabled: project.priority_enabled === 1,
      deadlinesEnabled: project.deadlines_enabled !== 0,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      deletedAt: project.deleted_at ?? null,
    };
    if (project.deleted_at) {
      return { ...base, cardCount: q.liveCount.get(project.id), memberCount: q.memberIds.all(project.id).length };
    }
    return {
      ...base,
      members: membersOf(project),
      columns: byPosition(q.columns.all(project.id)).map((column) => ({ id: column.id, name: column.name, color: column.color, position: column.position })),
      labels: q.labels.all(project.id).map((label) => ({ id: label.id, name: label.name, color: label.color })),
      // Toutes ses cartes, supprimées comprises : une carte absente a été
      // effacée pour de bon (le téléphone l'oublie)
      cardIds: q.projectCardIds.all(project.id),
    };
  }

  // Une carte. createdByMe : vrai pour les cartes que j'ai créées (avec mon
  // rôle et les personnes attribuées, le téléphone applique cardRights ; le
  // serveur revérifie toujours). Jamais le numéro du compte qui l'a créée.
  function describeCard(card, user, { labelsOf, assigneesOf, linksOf, names }) {
    return {
      id: card.id,
      projectId: card.project_id,
      columnId: card.column_id ?? null,
      position: card.position,
      title: card.title,
      labelIds: labelsOf.get(card.id) ?? [],
      assigneeIds: assigneesOf.get(card.id) ?? [],
      createdByMe: card.created_by === user.id,
      createdByName: card.created_by ? names.get(card.created_by) ?? null : null,
      createdAt: card.created_at,
      updatedAt: card.updated_at,
      updatedByName: card.updated_by ? names.get(card.updated_by) ?? null : null,
      deletedAt: card.deleted_at ?? null,
      deletedByName: card.deleted_by ? names.get(card.deleted_by) ?? null : null,
      deletedColumnName: card.deleted_column_name ?? null,
      // Détails (étape 2). descriptionByMe / descriptionByName : qui a écrit
      // la version actuelle de la description (choix d'un conflit)
      description: card.description ?? '',
      descriptionVersion: card.description_version ?? 1,
      descriptionByMe: card.description_by === user.id,
      descriptionByName: card.description_by ? names.get(card.description_by) ?? null : null,
      descriptionAt: card.description_at ?? null,
      priority: card.priority ?? 'normal',
      dueDate: card.due_date ?? null,
      dueTime: card.due_time ?? null,
      remindBefore: card.remind_before ?? null,
      done: card.due_done === 1,
      doneAt: card.due_done_at ?? null,
      links: (linksOf?.get(card.id) ?? []).map((link) => ({ id: link.id, title: link.title, url: link.url })),
    };
  }

  // Étiquettes et personnes de toutes les cartes d'un projet (une requête chacune)
  function cardLinks(projectId) {
    const labelsOf = new Map();
    for (const row of q.projectCardLabels.all(projectId)) {
      if (!labelsOf.has(row.card_id)) labelsOf.set(row.card_id, []);
      labelsOf.get(row.card_id).push(row.label_id);
    }
    for (const ids of labelsOf.values()) ids.sort();
    const assigneesOf = new Map();
    for (const row of q.projectAssignees.all(projectId)) {
      if (!assigneesOf.has(row.card_id)) assigneesOf.set(row.card_id, []);
      assigneesOf.get(row.card_id).push(row.user_id);
    }
    const linksOf = new Map();
    for (const row of q.projectLinks.all(projectId)) {
      if (!linksOf.has(row.card_id)) linksOf.set(row.card_id, []);
      linksOf.get(row.card_id).push(row);
    }
    return { labelsOf, assigneesOf, linksOf };
  }

  // --- Vérification des champs ---

  function nameOf(value, clean, key, max) {
    const name = clean(value);
    if (name === null) throw new OpError(400, key, { max });
    return name;
  }
  const projectNameOf = (value) => nameOf(value, cleanProjectName, 'ops.nomProjetInvalide', PROJECT_NAME_MAX);
  const columnNameOf = (value) => nameOf(value, cleanColumnName, 'ops.nomColonneInvalide', 40);
  const cardTitleOf = (value) => nameOf(value, cleanCardTitle, 'ops.titreCarteInvalide', 200);
  const labelNameOf = (value) => nameOf(value, cleanProjectLabelName, 'ops.nomEtiquetteProjetInvalide', 30);
  function colorOf(value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (!isColumnColor(value)) throw new OpError(400, 'ops.couleurInvalide');
    return value;
  }
  const booleanOf = (value, key) => {
    if (value !== undefined && typeof value !== 'boolean') throw new OpError(400, key);
    return value;
  };

  // Colonnes demandées à la création d'un projet : [{ columnId, name,
  // color? }], 1 à 20, noms uniques ; absentes : « À faire », « En cours »,
  // « Fait » dans la langue du compte (identifiants posés ici)
  function columnsOf(value, user) {
    if (value === undefined || value === null) {
      const locale = localeOf(user);
      return DEFAULT_COLUMNS.map((column) => ({ id: newId(), name: translate(locale, column.text), color: column.color }));
    }
    if (!Array.isArray(value) || value.length === 0 || value.length > COLUMNS_MAX) throw new OpError(400, 'ops.colonnesInvalides', { max: COLUMNS_MAX });
    const columns = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') throw new OpError(400, 'ops.colonnesInvalides', { max: COLUMNS_MAX });
      const id = requireUuid(entry.columnId);
      const name = columnNameOf(entry.name);
      if (columns.some((c) => c.id === id) || q.anyColumn.get(id)) throw new OpError(409, 'ops.colonneExisteDeja');
      if (columns.some((c) => nameKey(c.name) === nameKey(name))) throw new OpError(400, 'ops.nomColonneExiste');
      columns.push({ id, name, color: colorOf(entry.color, DEFAULT_COLUMN_COLOR) });
    }
    return columns;
  }

  const insertColumns = (projectId, columns, now) => columns.forEach((column, index) => {
    q.insertColumn.run(column.id, projectId, column.name, nameKey(column.name), column.color, column.position ?? 1024 * (index + 1), now, now);
  });

  // Étiquettes du projet demandées pour une carte : toutes dans CE projet
  // (une étiquette d'un autre projet, ou effacée : refus de l'opération)
  function cardLabelsOf(project, value) {
    const ids = cleanCardLabelIds(value);
    if (!ids) throw new OpError(400, 'ops.etiquettesCarteInvalides', { max: LABELS_PER_CARD_MAX });
    for (const id of ids) if (!q.label.get(id, project.id)) throw new OpError(404, PROJECT_LABEL_NOT_FOUND);
    return ids;
  }

  // Étiquettes d'une carte remplacées par ids (historique : ajoutées, retirées)
  function setCardLabels(card, ids, user, source) {
    const before = q.cardLabelIds.all(card.id);
    const added = ids.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !ids.includes(id));
    for (const id of removed) {
      const label = q.label.get(id, card.project_id);
      q.removeCardLabel.run(card.id, id);
      logEvent(card, user, 'unlabel', { label: id, name: label?.name ?? null, color: label?.color ?? null }, source);
    }
    for (const id of added) {
      const label = q.label.get(id, card.project_id);
      q.addCardLabel.run(card.id, id);
      logEvent(card, user, 'label', { label: id, name: label.name, color: label.color }, source);
    }
    return added.length + removed.length > 0;
  }

  // --- Détails d'une carte (étape 2) ---

  // Description actuelle d'une carte, jointe au refus d'un enregistrement
  // en conflit (le téléphone propose alors le choix, comme pour une note)
  function cardConflict(card) {
    const err = new OpError(409, CARD_CONFLICT);
    err.extra = {
      current: {
        version: card.description_version,
        description: card.description,
        updatedAt: card.description_at ?? card.updated_at,
        updatedBy: card.description_by ?? null,
        updatedByName: card.description_by ? q.userName.get(card.description_by) ?? null : null,
      },
    };
    return err;
  }

  // Ligne d'historique « description modifiée » : une seule par personne et
  // par quart d'heure (l'enregistrement automatique écrit souvent)
  function logDescribe(card, user, source) {
    const last = q.lastCardEvent.get(card.id);
    if (last?.type === 'describe' && last.user_id === user.id && last.source === source && Date.parse(last.created_at) > ctx.now() - DESCRIBE_EVENT_MS) return;
    logEvent(card, user, 'describe', {}, source);
  }

  // Écrit une nouvelle description (version + 1) ; renvoie la version
  function writeDescription(card, text, user) {
    const now = nowIso();
    q.describeCard.run(text, user.id, now, now, user.id, card.id);
    return card.description_version + 1;
  }

  // Un lien de CETTE carte (un lien d'une autre carte : 404)
  function linkOf(card, linkId) {
    const link = q.link.get(requireUuid(linkId), card.id);
    if (!link) throw new OpError(404, LINK_NOT_FOUND);
    return link;
  }
  function linkUrlOf(value) {
    const url = cleanLinkUrl(value);
    if (!url) throw new OpError(400, 'ops.adresseLienInvalide');
    return url;
  }
  function linkTitleOf(value) {
    const title = cleanLinkTitle(value);
    if (title === null) throw new OpError(400, 'ops.titreLienInvalide');
    return title;
  }

  const requireCardRoom = (project) => {
    if (q.countCards.get(project.id) >= CARDS_MAX) throw new OpError(400, 'ops.cartesLimite', { max: CARDS_MAX });
  };

  // --- Les opérations (appliquées par la file de server/lists.js) ---
  // meta.source : 'app' (l'application) ou 'mcp' (un assistant IA), écrit
  // dans l'historique.

  const handlers = {
    // Nouveau projet : le créateur en est le propriétaire ; colonnes
    // données par le téléphone (identifiants créés hors ligne), sinon
    // « À faire », « En cours », « Fait ». Partagé avec personne.
    'project.create'(user, op) {
      requireProjectsOn(user);
      const id = requireUuid(op.projectId);
      if (q.project.get(id)) throw new OpError(409, 'ops.projetExisteDeja');
      const name = projectNameOf(op.name);
      const columns = columnsOf(op.columns, user);
      if (q.countOwned.get(user.id) >= PROJECTS_MAX) throw new OpError(400, 'ops.projetsLimite', { max: PROJECTS_MAX });
      const now = nowIso();
      q.insertProject.run(id, user.id, name, 0, 1, null, now, now, now);
      insertColumns(id, columns, now);
      changedFor(user.id);
      ctx.audit('project_created', { user: user.username, project: id });
      return { columnIds: columns.map((column) => column.id) };
    },

    // Renommer, option « Priorité » : propriétaire seulement ; option
    // « Échéances » (décision du 25 novembre 2026, après l'essai) :
    // propriétaire et « Peut modifier ». Tout est vérifié avant d'écrire.
    'project.update'(user, op) {
      const { project, role, rights } = projectFor(user, op.projectId);
      const name = op.name === undefined ? undefined : projectNameOf(op.name);
      const priority = booleanOf(op.priorityEnabled, 'ops.prioriteProjetInvalide');
      const deadlines = booleanOf(op.deadlinesEnabled, 'ops.echeancesProjetInvalide');
      if (name === undefined && priority === undefined && deadlines === undefined) throw new OpError(400, 'ops.rienAModifier');
      if ((name !== undefined && !rights.rename) || (priority !== undefined && !rights.priority)) throw deny(role, true);
      if (deadlines !== undefined && !rights.deadlines) throw cardDenied(role, DEADLINES_MANAGERS_ONLY);
      const now = nowIso();
      if (name !== undefined && name !== project.name) q.renameProject.run(name, now, now, project.id);
      if (priority !== undefined && Number(priority) !== project.priority_enabled) q.setPriority.run(Number(priority), now, now, project.id);
      if (deadlines !== undefined && Number(deadlines) !== project.deadlines_enabled) q.setDeadlines.run(Number(deadlines), now, now, project.id);
      changedForProject(project);
      return {};
    },

    // Dupliquer (tout membre, Lecture seule compris) : un projet à moi, non
    // partagé, avec les mêmes colonnes, étiquettes et options « Priorité »
    // et « Échéances »,
    // sans aucune carte. columnIds / labelIds : { <identifiant d'origine> :
    // <nouvel identifiant> }, choisis par le téléphone (hors ligne) ; une
    // colonne ou une étiquette sans nouvel identifiant en reçoit un ici.
    'project.duplicate'(user, op) {
      const { project: source } = projectFor(user, op.projectId);
      const id = requireUuid(op.newProjectId);
      if (q.project.get(id)) throw new OpError(409, 'ops.projetExisteDeja');
      const name = op.name === undefined ? cleanProjectName(translate(localeOf(user), 'format.copie', { name: source.name.slice(0, PROJECT_NAME_MAX - 12).trimEnd() })) : projectNameOf(op.name);
      const mapping = (value) => {
        if (value === undefined) return {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OpError(400, 'ops.identifiantInvalide');
        return value;
      };
      const columnIds = mapping(op.columnIds);
      const labelIds = mapping(op.labelIds);
      const used = new Set();
      const fresh = (wanted) => {
        if (wanted === undefined) return newId();
        const value = requireUuid(wanted);
        if (used.has(value) || q.anyColumn.get(value) || q.anyLabel.get(value)) throw new OpError(409, 'ops.colonneExisteDeja');
        used.add(value);
        return value;
      };
      if (q.countOwned.get(user.id) >= PROJECTS_MAX) throw new OpError(400, 'ops.projetsLimite', { max: PROJECTS_MAX });
      const now = nowIso();
      q.insertProject.run(id, user.id, name, source.priority_enabled, source.deadlines_enabled, source.id, now, now, now);
      insertColumns(id, byPosition(q.columns.all(source.id)).map((column) => ({
        id: fresh(Object.hasOwn(columnIds, column.id) ? columnIds[column.id] : undefined), name: column.name, color: column.color, position: column.position,
      })), now);
      for (const label of q.labels.all(source.id)) {
        q.insertLabel.run(fresh(Object.hasOwn(labelIds, label.id) ? labelIds[label.id] : undefined), id, label.name, label.name_key, label.color, now);
      }
      changedFor(user.id);
      ctx.audit('project_duplicated', { user: user.username, project: id, source: source.id });
      return {};
    },

    // Mettre à la corbeille (propriétaire) : il disparaît pour tous ses
    // membres ; rejouable sans effet
    'project.delete'(user, op, meta) {
      const { project, role } = projectFor(user, op.projectId, { trashed: true });
      if (role !== 'owner') throw deny(role, true);
      if (!project.deleted_at) {
        const now = nowIso();
        changedForProject(project);
        q.trashProject.run(now, user.id, now, project.id);
        // (via=mcp : par un assistant IA ; jamais d'après ce que dit l'opération)
        ctx.audit('project_deleted', { user: user.username, project: project.id, ...(meta.source === 'mcp' ? { via: 'mcp' } : {}) });
      }
      return {};
    },

    // Restaurer depuis la corbeille (propriétaire, moins de 30 jours) : il
    // revient pour tous ses membres, avec ses colonnes, cartes et réglages ;
    // ses membres reçoivent de nouveau toutes ses cartes (cards_reset_at)
    'project.restore'(user, op) {
      const { project, role } = projectFor(user, op.projectId, { trashed: true });
      if (role !== 'owner') throw deny(role, true);
      if (project.deleted_at) {
        if (project.deleted_at < purgeLimit()) throw new OpError(404, PROJECT_NOT_FOUND);
        const now = nowIso();
        q.untrashProject.run(now, now, project.id);
        changedForProject(project);
        ctx.audit('project_restored', { user: user.username, project: project.id });
      }
      return {};
    },

    // Réglages à soi (tout membre) : « Masquer les nouveautés » (mutedNews),
    // « Couper les notifications » (mutedPush), « Afficher dans Échéances »
    // (inDeadlines). Jamais transmis aux autres.
    'project.state'(user, op) {
      const { project } = projectFor(user, op.projectId);
      const mutedNews = booleanOf(op.mutedNews, 'ops.reglageProjetInvalide');
      const mutedPush = booleanOf(op.mutedPush, 'ops.reglageProjetInvalide');
      const inDeadlines = booleanOf(op.inDeadlines, 'ops.reglageProjetInvalide');
      if (mutedNews === undefined && mutedPush === undefined && inDeadlines === undefined) throw new OpError(400, 'ops.rienAModifier');
      q.ensureState.run(project.id, user.id);
      if (mutedNews !== undefined) q.setMutedNews.run(Number(mutedNews), project.id, user.id);
      if (mutedPush !== undefined) q.setMutedPush.run(Number(mutedPush), project.id, user.id);
      if (inDeadlines !== undefined) q.setInDeadlines.run(Number(inDeadlines), project.id, user.id);
      changedFor(user.id);
      return {};
    },

    // Nouveautés : « vu » jusqu'à l'événement upTo (jamais au-delà du
    // dernier, jamais vers le bas) ; vaut sur tous mes appareils
    'project.seen'(user, op) {
      const { project } = projectFor(user, op.projectId);
      if (!Number.isSafeInteger(op.upTo) || op.upTo < 0) throw new OpError(400, 'ops.repereLectureProjetInvalide');
      const upTo = Math.min(op.upTo, q.lastEvent.get(project.id));
      q.ensureState.run(project.id, user.id);
      if (upTo > (q.state.get(project.id, user.id)?.last_seen_event ?? 0)) {
        q.setSeen.run(upTo, project.id, user.id);
        changedFor(user.id);
      }
      return {};
    },

    // --- Colonnes (propriétaire et « Peut modifier ») ---

    'column.create'(user, op) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.columns) throw deny(role);
      const id = requireUuid(op.columnId);
      if (q.anyColumn.get(id)) throw new OpError(409, 'ops.colonneExisteDeja');
      const name = columnNameOf(op.name);
      const color = colorOf(op.color, DEFAULT_COLUMN_COLOR);
      const columns = q.columns.all(project.id);
      if (columns.length >= COLUMNS_MAX) throw new OpError(400, 'ops.colonnesLimite', { max: COLUMNS_MAX });
      if (columns.some((c) => nameKey(c.name) === nameKey(name))) throw new OpError(400, 'ops.nomColonneExiste');
      const place = placeFor(columns, id, afterColumnOf(project, op.afterId));
      const now = nowIso();
      for (const row of place.renumber ?? []) q.moveColumn.run(row.position, now, row.id);
      q.insertColumn.run(id, project.id, name, nameKey(name), color, place.position, now, now);
      q.touch.run(now, project.id);
      changedForProject(project);
      return {};
    },

    // Renommer, changer la couleur
    'column.update'(user, op) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.columns) throw deny(role);
      const column = columnOf(project, op.columnId);
      const name = op.name === undefined ? column.name : columnNameOf(op.name);
      const color = op.color === undefined ? column.color : colorOf(op.color);
      if (op.name === undefined && op.color === undefined) throw new OpError(400, 'ops.rienAModifier');
      if (q.columns.all(project.id).some((c) => c.id !== column.id && nameKey(c.name) === nameKey(name))) throw new OpError(400, 'ops.nomColonneExiste');
      if (name === column.name && color === column.color) return {};
      const now = nowIso();
      q.updateColumn.run(name, nameKey(name), color, now, column.id);
      q.touch.run(now, project.id);
      changedForProject(project);
      return {};
    },

    // Changer l'ordre : afterId, la colonne qui précède (null : en premier)
    'column.move'(user, op) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.columns) throw deny(role);
      const column = columnOf(project, op.columnId);
      if (op.afterId === undefined) throw new OpError(400, 'ops.placeInvalide');
      const after = afterColumnOf(project, op.afterId);
      if (after === column.id) throw new OpError(400, 'ops.placeInvalide');
      const place = placeFor(q.columns.all(project.id), column.id, after);
      if (place.unchanged) return {};
      const now = nowIso();
      for (const row of place.renumber ?? []) q.moveColumn.run(row.position, now, row.id);
      q.moveColumn.run(place.position, now, column.id);
      q.touch.run(now, project.id);
      changedForProject(project);
      return {};
    },

    // Supprimer une colonne (jamais la dernière). Avec des cartes : moveTo
    // (une autre colonne du projet : elles y vont en bas, dans leur ordre)
    // ou deleteCards: true (elles vont dans les cartes supprimées du
    // projet) ; sans l'un ni l'autre, refus : jamais de carte effacée sans
    // le dire. Une colonne supprimée ne se restaure pas.
    'column.delete'(user, op, meta) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.columns) throw deny(role);
      const column = columnOf(project, op.columnId);
      const columns = q.columns.all(project.id);
      if (columns.length <= 1) throw new OpError(400, 'ops.derniereColonne');
      const cards = byPosition(q.columnCards.all(column.id));
      const deleteCards = booleanOf(op.deleteCards, 'ops.colonneDestinationInvalide') === true;
      let target = null;
      if (op.moveTo !== undefined && op.moveTo !== null) {
        if (deleteCards) throw new OpError(400, 'ops.colonneDestinationInvalide');
        target = columnOf(project, op.moveTo);
        if (target.id === column.id) throw new OpError(400, 'ops.colonneDestinationInvalide');
      }
      if (cards.length && !target && !deleteCards) throw new OpError(400, 'ops.colonneNonVide', { count: cards.length });
      const now = nowIso();
      const { source } = meta;
      for (const row of cards) {
        const card = q.card.get(row.id);
        if (target) {
          placeCard(card, target, undefined, user, now);
          logEvent(card, user, 'move', { from: column.id, fromName: column.name, to: target.id, toName: target.name }, source);
        } else {
          q.trashCard.run(now, user.id, column.name, now, user.id, card.id);
          logEvent(card, user, 'delete', { column: column.id, columnName: column.name }, source);
        }
      }
      q.deleteColumn.run(column.id);
      q.touch.run(now, project.id);
      changedForProject(project);
      return { moved: target ? cards.length : 0, deleted: target ? 0 : cards.length };
    },

    // --- Étiquettes du projet (propriétaire et « Peut modifier ») ---

    // Même nom qu'une étiquette du projet (majuscules et accents ignorés) :
    // refus 409, avec l'étiquette existante (le téléphone la prend)
    'label.create'(user, op) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.labels) throw deny(role);
      const id = requireUuid(op.labelId);
      if (q.anyLabel.get(id)) throw new OpError(409, 'ops.etiquetteProjetExisteDeja');
      const name = labelNameOf(op.name);
      const color = colorOf(op.color, DEFAULT_LABEL_COLOR);
      const labels = q.labels.all(project.id);
      const same = labels.find((label) => label.name_key === nameKey(name));
      if (same) {
        const err = new OpError(409, 'ops.etiquetteProjetExiste');
        err.extra = { label: { id: same.id, name: same.name, color: same.color } };
        throw err;
      }
      if (labels.length >= PROJECT_LABELS_MAX) throw new OpError(400, 'ops.etiquettesProjetLimite', { max: PROJECT_LABELS_MAX });
      const now = nowIso();
      q.insertLabel.run(id, project.id, name, nameKey(name), color, now);
      q.touch.run(now, project.id);
      changedForProject(project);
      return {};
    },

    'label.update'(user, op) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.labels) throw deny(role);
      const label = q.label.get(requireUuid(op.labelId), project.id);
      if (!label) throw new OpError(404, PROJECT_LABEL_NOT_FOUND);
      if (op.name === undefined && op.color === undefined) throw new OpError(400, 'ops.rienAModifier');
      const name = op.name === undefined ? label.name : labelNameOf(op.name);
      const color = op.color === undefined ? label.color : colorOf(op.color);
      if (q.labels.all(project.id).some((other) => other.id !== label.id && other.name_key === nameKey(name))) throw new OpError(409, 'ops.etiquetteProjetExiste');
      if (name === label.name && color === label.color) return {};
      const now = nowIso();
      q.updateLabel.run(name, nameKey(name), color, label.id);
      q.touch.run(now, project.id);
      changedForProject(project);
      return {};
    },

    // Supprimer : retirée de ses cartes (l'historique de chaque carte le
    // dit), les cartes restent
    'label.delete'(user, op, meta) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.labels) throw deny(role);
      const label = q.label.get(requireUuid(op.labelId), project.id);
      if (!label) return {}; // déjà supprimée : rejouable
      const now = nowIso();
      const { source } = meta;
      const cardIds = q.cardsWithLabel.all(label.id);
      for (const cardId of cardIds) {
        logEvent({ id: cardId, project_id: project.id }, user, 'unlabel', { label: label.id, name: label.name, color: label.color }, source);
        q.touchCard.run(now, user.id, cardId);
      }
      q.deleteLabel.run(label.id);
      q.touch.run(now, project.id);
      changedForProject(project);
      return { cards: cardIds.length };
    },

    // --- Cartes ---

    // Nouvelle carte (propriétaire, « Peut modifier », Contributeur) : elle
    // est à qui la crée. afterId : la carte qui précède (null : en haut ;
    // absent : en bas de la colonne).
    'card.create'(user, op, meta) {
      const { project, role, rights } = projectFor(user, op.projectId);
      if (!rights.createCards) throw deny(role);
      const id = requireUuid(op.cardId);
      if (q.card.get(id)) throw new OpError(409, 'ops.carteExisteDeja');
      const title = cardTitleOf(op.title);
      const column = targetColumn(project, op.columnId);
      const labels = op.labelIds === undefined ? [] : cardLabelsOf(project, op.labelIds);
      requireCardRoom(project);
      const after = afterCardOf(project, op.afterId);
      const now = nowIso();
      const place = placeFor(q.columnCards.all(column.id), id, after);
      for (const row of place.renumber ?? []) q.renumberCard.run(row.position, now, row.id);
      q.insertCard.run(id, project.id, column.id, place.position, title, user.id, now, now, user.id);
      const card = q.card.get(id);
      const eventId = logEvent(card, user, 'create', { column: column.id, columnName: column.name }, meta.source);
      for (const labelId of labels) q.addCardLabel.run(id, labelId);
      changedForProject(project);
      cardActivity('card', card, user, eventId);
      return {};
    },

    // Modifier les champs simples d'une carte, seulement ceux qui changent
    // (la dernière modification reçue gagne, champ par champ) : title ;
    // due ({ date, time?, remindBefore? } ou null : retirée, « Fait »
    // compris ; option « Échéances » du projet allumée) ; priority ('low',
    // 'normal', 'high' : option « Priorité » du projet allumée). Seulement si
    // mon rôle permet de modifier CETTE carte.
    // Tout est vérifié avant la moindre écriture.
    'card.update'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      if (op.title === undefined && op.due === undefined && op.priority === undefined) throw new OpError(400, 'ops.rienAModifier');
      const title = op.title === undefined ? undefined : cardTitleOf(op.title);
      const due = op.due === undefined ? undefined : cleanCardDue(op.due);
      if (op.due !== undefined && due === undefined) throw new OpError(400, 'ops.echeanceCarteInvalide');
      if (op.due !== undefined && !deadlinesOn(project)) throw new OpError(400, DEADLINES_OFF);
      if (op.priority !== undefined && !isCardPriority(op.priority)) throw new OpError(400, 'ops.prioriteCarteInvalide');
      if (op.priority !== undefined && project.priority_enabled !== 1) throw new OpError(400, 'ops.prioriteProjetCoupee');
      const now = nowIso();
      let changed = false;
      if (title !== undefined && title !== card.title) {
        q.renameCard.run(title, now, user.id, card.id);
        logEvent(card, user, 'rename', {}, meta.source);
        changed = true;
      }
      if (due !== undefined) {
        const same = due === null
          ? card.due_date === null
          : card.due_date === due.date && card.due_time === due.time && card.remind_before === due.remindBefore;
        if (!same) {
          // Sans échéance, pas de case « Fait » ; une échéance changée garde
          // sa case
          const done = due === null ? 0 : card.due_done;
          q.setDue.run(due?.date ?? null, due?.time ?? null, due?.remindBefore ?? null, done, done ? card.due_done_at : null, now, user.id, card.id);
          cardActivity('due', card, user, logEvent(card, user, 'due', due === null ? { date: null } : { date: due.date, time: due.time }, meta.source));
          changed = true;
        }
      }
      if (op.priority !== undefined && op.priority !== card.priority) {
        q.setCardPriority.run(op.priority, now, user.id, card.id);
        changed = true;
      }
      if (changed) changedForProject(project);
      return {};
    },

    // Case « Fait » de l'échéance (la seule marque de « fait ») : done,
    // vrai ou faux ; une carte sans échéance n'en a pas (refus), ni une
    // carte d'un projet dont l'option « Échéances » est coupée
    'card.done'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      if (typeof op.done !== 'boolean') throw new OpError(400, 'ops.faitInvalide');
      if (!deadlinesOn(project)) throw new OpError(400, DEADLINES_OFF);
      if (!card.due_date) throw new OpError(400, 'ops.carteSansEcheance');
      if ((card.due_done === 1) === op.done) return {};
      const now = nowIso();
      q.setDue.run(card.due_date, card.due_time, card.remind_before, Number(op.done), op.done ? now : null, now, user.id, card.id);
      cardActivity(op.done ? 'done' : 'undone', card, user, logEvent(card, user, op.done ? 'done' : 'undone', {}, meta.source));
      changedForProject(project);
      return {};
    },

    // Enregistrer la description (comme le texte d'une note) : baseVersion,
    // la version sur laquelle le texte a été écrit ; si la description a
    // changé entre-temps, ou si l'enregistrement précédent de ce téléphone
    // (afterOp) a été refusé, refus 409 avec la version actuelle : rien
    // n'est écrasé.
    'card.describe'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      if (!Number.isSafeInteger(op.baseVersion) || op.baseVersion < 1) throw new OpError(400, 'ops.versionCarteInvalide');
      const text = cleanDescription(op.description);
      if (text === null) throw new OpError(400, 'ops.descriptionInvalide', { max: CARD_DESCRIPTION_MAX });
      if (op.afterOp !== undefined && op.afterOp !== null) {
        const previous = q.applied.get(requireUuid(op.afterOp, 'ops.identifiantOperationInvalide'));
        if (previous && previous.user_id === user.id && JSON.parse(previous.result).status !== 200) throw cardConflict(card);
      }
      if (card.description_version !== op.baseVersion) throw cardConflict(card);
      if (text === card.description) return { version: card.description_version };
      const version = writeDescription(card, text, user);
      logDescribe(card, user, meta.source);
      cardActivity('describe', card, user, q.lastEvent.get(project.id));
      changedForProject(project);
      return { version };
    },

    // Cocher ou décocher UNE case de la description (sans passer en
    // saisie) : index (son numéro), text (son texte, tel qu'il est montré),
    // checked. Seule cette case change, sur le texte actuel : deux
    // personnes qui cochent deux cases en même temps ne se gênent pas. La
    // case n'est plus là : refus nommé, rien d'écrasé.
    'card.task'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      if (!Number.isSafeInteger(op.index) || op.index < 0 || typeof op.text !== 'string' || op.text.length > CARD_DESCRIPTION_MAX || typeof op.checked !== 'boolean') {
        throw new OpError(400, 'ops.caseInvalide');
      }
      const next = setTaskAt(card.description, op.index, op.text, op.checked);
      if (next === null) throw new OpError(409, 'ops.caseIntrouvable');
      if (next === card.description) return { version: card.description_version };
      const version = writeDescription(card, next, user);
      // Le texte de la case est gardé (comme dans l'écran), 200 caractères au plus
      cardActivity('describe', card, user, logEvent(card, user, 'task', { text: [...op.text].slice(0, TASK_TEXT_MAX).join(''), checked: op.checked }, meta.source));
      changedForProject(project);
      return { version };
    },

    // --- Liens d'une carte (20 au plus ; mêmes droits que modifier la carte) ---

    // linkId : choisi par le téléphone (hors ligne) ; title facultatif ;
    // url http ou https (jamais appelée par le serveur)
    'link.create'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      const id = requireUuid(op.linkId);
      const url = linkUrlOf(op.url);
      const title = linkTitleOf(op.title);
      const owner = q.anyLink.get(id);
      if (owner === card.id) return {}; // déjà ajouté (opération rejouée)
      if (owner) throw new OpError(409, 'ops.lienExisteDeja');
      if (q.countLinks.get(card.id) >= LINKS_PER_CARD_MAX) throw new OpError(400, 'ops.liensLimite', { max: LINKS_PER_CARD_MAX });
      const now = nowIso();
      q.insertLink.run(id, card.id, title, url, q.nextLinkPosition.get(card.id), user.id, now);
      q.touchCard.run(now, user.id, card.id);
      logEvent(card, user, 'link', { link: id }, meta.source);
      changedForProject(project);
      return {};
    },

    // Modifier le titre ou l'adresse d'un lien de cette carte
    'link.update'(user, op) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      const link = linkOf(card, op.linkId);
      if (op.title === undefined && op.url === undefined) throw new OpError(400, 'ops.rienAModifier');
      const title = op.title === undefined ? link.title : linkTitleOf(op.title);
      const url = op.url === undefined ? link.url : linkUrlOf(op.url);
      if (title === link.title && url === link.url) return {};
      q.updateLink.run(title, url, link.id);
      q.touchCard.run(nowIso(), user.id, card.id);
      changedForProject(project);
      return {};
    },

    // Retirer un lien (déjà retiré : rien ne change, rejouable)
    'link.delete'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      const id = requireUuid(op.linkId);
      const link = q.link.get(id, card.id);
      if (!link) {
        if (q.anyLink.get(id)) throw new OpError(404, LINK_NOT_FOUND);
        return {};
      }
      q.deleteLink.run(link.id);
      q.touchCard.run(nowIso(), user.id, card.id);
      logEvent(card, user, 'unlink', { link: link.id }, meta.source);
      changedForProject(project);
      return {};
    },

    // Déplacer et ordonner : columnId (absent : la même colonne), afterId
    // (null : en haut ; absent : en bas). Une colonne supprimée entre-temps :
    // en bas de la première colonne.
    'card.move'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.move) throw cardDenied(role, CARD_EDIT_OWN);
      const column = op.columnId === undefined ? q.column.get(card.column_id, project.id) : targetColumn(project, op.columnId);
      const lost = op.columnId !== undefined && column.id !== requireUuid(op.columnId);
      const after = lost ? undefined : afterCardOf(project, op.afterId);
      if (after === card.id) throw new OpError(400, 'ops.placeInvalide');
      const now = nowIso();
      const from = q.column.get(card.column_id, project.id);
      if (placeCard(card, column, after, user, now) === null) return {};
      if (from.id !== column.id) {
        cardActivity('move', card, user, logEvent(card, user, 'move', { from: from.id, fromName: from.name, to: column.id, toName: column.name }, meta.source), { columnId: column.id });
      }
      changedForProject(project);
      return {};
    },

    // Mettre dans les cartes supprimées du projet (propriétaire et « Peut
    // modifier » : toutes ; Contributeur : celles qu'il a créées)
    'card.delete'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.remove) throw cardDenied(role, CARD_DELETE_OWN);
      const column = q.column.get(card.column_id, project.id);
      const now = nowIso();
      q.trashCard.run(now, user.id, column?.name ?? null, now, user.id, card.id);
      logEvent(card, user, 'delete', { column: card.column_id, columnName: column?.name ?? null }, meta.source);
      changedForProject(project);
      return {};
    },

    // Restaurer (mêmes droits que supprimer ; moins de 30 jours) : en bas
    // de sa colonne, ou de la première si la sienne n'existe plus
    'card.restore'(user, op, meta) {
      let found;
      try {
        found = cardFor(user, op.cardId, { deleted: true, projectId: op.projectId });
      } catch (err) {
        // Déjà restaurée (opération rejouée) : rien ne change
        if (err instanceof OpError && err.status === 404 && isUuid(op.cardId) && q.card.get(op.cardId.toLowerCase())?.deleted_at === null) {
          cardFor(user, op.cardId, { projectId: op.projectId });
          return {};
        }
        throw err;
      }
      const { card, project, role, can } = found;
      if (!can.restore) throw cardDenied(role, CARD_RESTORE_OWN);
      if (card.deleted_at < purgeLimit()) throw new OpError(404, CARD_NOT_FOUND);
      const column = (card.column_id && q.column.get(card.column_id, project.id)) || byPosition(q.columns.all(project.id))[0];
      const now = nowIso();
      const place = placeFor(q.columnCards.all(column.id), card.id, undefined);
      for (const row of place.renumber ?? []) q.renumberCard.run(row.position, now, row.id);
      q.untrashCard.run(column.id, place.position, now, user.id, card.id);
      logEvent(card, user, 'restore', { column: column.id, columnName: column.name }, meta.source);
      changedForProject(project);
      return {};
    },

    // Dupliquer (tous sauf Lecture seule ; la copie est à qui duplique) :
    // même colonne, juste dessous, titre « (copie) » (choisi par le
    // téléphone, sinon dans la langue du compte), mêmes étiquettes,
    // personnes, description, priorité, échéance (case « Fait » décochée) et
    // liens (linkIds : { <lien d'origine> : <nouvel identifiant> }, choisis
    // par le téléphone, hors ligne ; sinon posés ici) ; ni commentaires ni
    // historique
    'card.duplicate'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.duplicate) throw cardDenied(role, CARD_EDIT_OWN);
      const id = requireUuid(op.newCardId);
      if (q.card.get(id)) throw new OpError(409, 'ops.carteExisteDeja');
      if (op.linkIds !== undefined && (!op.linkIds || typeof op.linkIds !== 'object' || Array.isArray(op.linkIds))) throw new OpError(400, 'ops.identifiantInvalide');
      const links = q.links.all(card.id).map((link) => {
        const wanted = op.linkIds && Object.hasOwn(op.linkIds, link.id) ? requireUuid(op.linkIds[link.id]) : newId();
        if (q.anyLink.get(wanted)) throw new OpError(409, 'ops.lienExisteDeja');
        return { ...link, id: wanted };
      });
      if (new Set(links.map((link) => link.id)).size !== links.length) throw new OpError(400, 'ops.identifiantInvalide');
      const title = op.title === undefined
        ? cleanCardTitle(translate(localeOf(user), 'format.copie', { name: card.title.slice(0, 190).trimEnd() }))
        : cardTitleOf(op.title);
      requireCardRoom(project);
      const now = nowIso();
      const place = placeFor(q.columnCards.all(card.column_id), id, card.id);
      for (const row of place.renumber ?? []) q.renumberCard.run(row.position, now, row.id);
      q.insertCard.run(id, project.id, card.column_id, place.position, title, user.id, now, now, user.id);
      for (const labelId of q.cardLabelIds.all(card.id)) q.addCardLabel.run(id, labelId);
      q.cardAssignees.all(card.id).forEach((userId, index) => q.addAssignee.run(id, userId, index));
      q.copyDetails.run(card.description, card.description ? user.id : null, card.description ? now : null, card.priority, card.due_date, card.due_time, card.remind_before, id);
      for (const link of links) q.insertLink.run(link.id, id, link.title, link.url, link.position, user.id, now);
      const copy = q.card.get(id);
      cardActivity('card', copy, user, logEvent(copy, user, 'duplicate', { from: card.id }, meta.source));
      changedForProject(project);
      return {};
    },

    // Étiquettes posées (la liste complète voulue, 10 au plus, toutes du
    // projet) : mêmes droits que modifier la carte
    'card.labels'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.edit) throw cardDenied(role, CARD_EDIT_OWN);
      const ids = cardLabelsOf(project, op.labelIds);
      if (setCardLabels(card, ids, user, meta.source)) {
        q.touchCard.run(nowIso(), user.id, card.id);
        changedForProject(project);
      }
      return { labelIds: ids };
    },

    // Personnes attribuées (la liste complète voulue, 10 au plus) : des
    // membres qui ne sont pas en lecture seule. Propriétaire et « Peut
    // modifier » : toutes les cartes ; Contributeur : les cartes qu'il a
    // créées ; sur une carte qu'il n'a pas créée et qui lui est attribuée,
    // seulement se retirer (il ne peut pas s'attribuer une carte qu'il n'a
    // pas créée : il se donnerait le droit de la modifier).
    'card.assign'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      const ids = cleanAssigneeIds(op.userIds);
      if (!ids) throw new OpError(400, 'ops.personnesCarteInvalides', { max: ASSIGNEES_MAX });
      const before = q.cardAssignees.all(card.id);
      if (!assignChangeAllowed(can, before, ids, user.id)) {
        if (role === 'reader') throw new OpError(403, PROJECT_READ_ONLY);
        throw new OpError(403, can.edit ? CARD_ASSIGN_OWN : CARD_EDIT_OWN);
      }
      for (const id of ids) {
        if (before.includes(id)) continue;
        const person = q.user.get(id);
        if (!person || person.active !== 1 || !assignableRole(roleOfUser(project, id))) throw new OpError(400, 'ops.personneNonAttribuableProjet');
      }
      const added = ids.filter((id) => !before.includes(id));
      const removed = before.filter((id) => !ids.includes(id));
      if (!added.length && !removed.length) return {};
      for (const id of removed) {
        q.removeAssignee.run(card.id, id);
        logEvent(card, user, 'unassign', { user: id }, meta.source);
      }
      ids.forEach((id, index) => {
        if (added.includes(id)) {
          q.addAssignee.run(card.id, id, index);
          const eventId = logEvent(card, user, 'assign', { user: id }, meta.source);
          if (id !== user.id) cardActivity('assign', card, user, eventId, { userId: id });
        }
      });
      q.touchCard.run(nowIso(), user.id, card.id);
      changedForProject(project);
      return {};
    },

    // --- Commentaires (étape 3, section 5.6) ---

    // Écrire (propriétaire, « Peut modifier », Contributeur : toutes les
    // cartes ; jamais en « Lecture seule ») : commentId choisi par le
    // téléphone (hors ligne) ; texte simple, 1 à 4 000 caractères ; 500 au
    // plus par carte. Le texte ne va ni dans l'historique ni dans le journal.
    // Commentaire importé (étape 5, section 12.4 ; seulement par un
    // assistant IA, meta.source 'mcp' : venus de l'application, ces champs
    // sont refusés) : importedAuthor, l'auteur d'origine comme simple texte
    // (1 à 60 caractères, jamais relié à un compte), importedAt, sa date
    // d'origine (passée, facultative) ; le commentaire est au nom du compte
    // qui l'importe (lui seul le modifie ; lui ou le propriétaire du projet
    // le supprime, comme tout commentaire).
    'comment.create'(user, op, meta) {
      const { card, project, role, can } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (!can.comment) throw cardDenied(role, PROJECT_READ_ONLY);
      const id = requireUuid(op.commentId);
      const owner = q.anyComment.get(id);
      if (owner === card.id && q.comment.get(id, card.id).user_id === user.id) return {}; // déjà écrit (opération rejouée)
      if (owner) throw new OpError(409, 'ops.commentaireExisteDeja');
      const body = commentOf(op.text);
      const imported = op.importedAuthor !== undefined || op.importedAt !== undefined;
      if (imported && meta.source !== 'mcp') throw new OpError(400, 'ops.commentaireImporteInvalide');
      const author = imported ? cleanImportedAuthor(op.importedAuthor) : null;
      const importedAt = imported ? cleanImportedAt(op.importedAt, ctx.now()) : null;
      if (imported && (author === null || importedAt === undefined)) throw new OpError(400, 'ops.commentaireImporteInvalide');
      if (q.countComments.get(card.id) >= COMMENTS_PER_CARD_MAX) throw new OpError(400, 'ops.commentairesLimite', { max: COMMENTS_PER_CARD_MAX });
      const now = nowIso();
      if (imported) q.insertImportedComment.run(id, card.id, user.id, body, author, importedAt, user.id, now, now);
      else q.insertComment.run(id, card.id, user.id, body, now, now);
      const eventId = logEvent(card, user, 'comment', {}, meta.source);
      changedForProject(project);
      cardActivity('comment', card, user, eventId);
      return {};
    },

    // Modifier SON commentaire (jamais celui d'un autre, même le
    // propriétaire) ; « modifié » écrit à côté de la date. Un commentaire
    // supprimé entre-temps : refusé (404).
    'comment.update'(user, op) {
      const { card, project, role } = cardFor(user, op.cardId, { projectId: op.projectId });
      const comment = existingComment(card, op.commentId);
      if (!commentRights({ userId: comment.user_id }, user.id, role).edit) throw role === 'reader' ? new OpError(403, PROJECT_READ_ONLY) : new OpError(403, COMMENT_OWN);
      const body = commentOf(op.text);
      if (body === comment.body) return {};
      q.editComment.run(body, nowIso(), comment.id);
      changedForProject(project);
      return {};
    },

    // Supprimer : le sien ; le propriétaire du projet, aussi celui d'un
    // autre (modération). Déjà supprimé : rien ne change (rejouable).
    'comment.delete'(user, op) {
      const { card, project, role } = cardFor(user, op.cardId, { projectId: op.projectId });
      const id = requireUuid(op.commentId);
      const comment = q.comment.get(id, card.id);
      if (!comment) throw new OpError(404, COMMENT_NOT_FOUND);
      if (!commentRights({ userId: comment.user_id }, user.id, role).remove) throw role === 'reader' ? new OpError(403, PROJECT_READ_ONLY) : new OpError(403, COMMENT_OWN);
      if (comment.deleted_at) return {};
      const now = nowIso();
      q.dropComment.run(now, now, comment.id);
      changedForProject(project);
      return {};
    },

    // « Suivre » (following: true) ou « Ne plus suivre » (false) une carte
    // (tous les rôles, Lecture seule compris) : propre à chacun, jamais
    // transmis aux autres
    'card.follow'(user, op) {
      const { card } = cardFor(user, op.cardId, { projectId: op.projectId });
      if (typeof op.following !== 'boolean') throw new OpError(400, 'ops.suivreInvalide');
      if (q.follow.get(card.id, user.id) === Number(op.following)) return {};
      q.setFollow.run(card.id, user.id, Number(op.following));
      changedFor(user.id);
      return {};
    },
  };

  // Texte d'un commentaire (1 à 4 000 caractères, texte simple)
  function commentOf(value) {
    const body = cleanComment(value);
    if (body === null) throw new OpError(400, 'ops.commentaireInvalide', { max: COMMENT_MAX });
    return body;
  }
  // Un commentaire présent de CETTE carte (d'une autre carte, inconnu ou
  // supprimé : 404)
  function existingComment(card, commentId) {
    const comment = q.comment.get(requireUuid(commentId), card.id);
    if (!comment || comment.deleted_at) throw new OpError(404, COMMENT_NOT_FOUND);
    return comment;
  }

  // --- Partage (PUT /api/projects/:id/members, propriétaire seulement) ---
  //
  // Même règle que les listes et les notes : userIds, la liste complète
  // des personnes souhaitées (comptes existants et actifs, 50 au plus ; le
  // propriétaire n'en fait jamais partie) ; access (facultatif) :
  // { "<id>": "modification" | "contribution" | "lecture" }. Une personne
  // ajoutée sans droit précisé est en lecture seule ; un membre déjà présent
  // sans droit précisé garde le sien. Toutes les vérifications passent AVANT
  // la moindre écriture. Une personne retirée perd ses réglages à elle et
  // ses cartes attribuées ; une personne passée en lecture seule, ses cartes
  // attribuées ; une personne ajoutée démarre « à jour » (rien n'est une
  // nouveauté pour elle).
  function setMembers(user, projectId, userIds, access = {}) {
    const { project, role } = projectFor(user, projectId);
    if (role !== 'owner') throw deny(role, true);
    if (!Array.isArray(userIds) || userIds.length > PROJECT_MEMBERS_MAX || !userIds.every((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0 && String(Number(id)) === String(id))) {
      throw new OpError(400, 'ops.listePersonnesInvalide');
    }
    if (access === null || typeof access !== 'object' || Array.isArray(access)) throw new OpError(400, 'ops.droitsPersonnesInvalides');
    const wanted = new Set(userIds.map(Number));
    wanted.delete(project.owner_id);
    const rights = new Map();
    for (const [key, value] of Object.entries(access)) {
      const id = Number(key);
      if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== key || !PROJECT_ACCESS.includes(value)) throw new OpError(400, 'ops.droitsPersonnesInvalides');
      if (id === project.owner_id) throw new OpError(400, 'ops.proprietaireTousDroitsProjet');
      if (!wanted.has(id)) throw new OpError(400, 'ops.droitSansPartageProjet');
      rights.set(id, value);
    }
    const before = new Map(q.members.all(project.id).map((m) => [m.id, m.access]));
    for (const id of wanted) {
      if (before.has(id)) continue;
      const guest = q.user.get(id);
      if (!guest || guest.active !== 1) throw new OpError(400, 'ops.utilisateurInconnu');
    }
    const added = [...wanted].filter((id) => !before.has(id));
    const removed = [...before.keys()].filter((id) => !wanted.has(id));
    const changedRights = [...rights].filter(([id, value]) => before.has(id) && before.get(id) !== value);
    if (added.length || removed.length || changedRights.length) {
      const now = nowIso();
      const lastEvent = q.lastEvent.get(project.id);
      db.transaction(() => {
        for (const id of added) {
          q.addMember.run(project.id, id, rights.get(id) ?? 'lecture', now);
          q.ensureState.run(project.id, id);
          q.setSeen.run(lastEvent, project.id, id); // rien n'est une nouveauté pour elle
        }
        for (const id of removed) {
          unassignEverywhere(project, id, user, 'app', now);
          q.removeMember.run(project.id, id);
          q.dropState.run(project.id, id);
          q.dropFollows.run(id, project.id);
        }
        for (const [id, value] of changedRights) {
          q.setAccess.run(value, project.id, id);
          if (value === 'lecture') unassignEverywhere(project, id, user, 'app', now);
        }
        q.touch.run(now, project.id);
      })();
      // Temps réel : le propriétaire, les membres, et les personnes retirées
      // (leurs appareils apprennent ainsi qu'elles n'y ont plus accès)
      ctx.events?.notifyProjects?.([project.owner_id, ...q.memberIds.all(project.id), ...removed]);
    }
    const usernameOf = (id) => q.user.get(id)?.username ?? null;
    for (const id of added) ctx.audit('project_shared', { user: user.username, project: project.id, member: usernameOf(id), change: 'added', access: JOURNAL_ACCESS[rights.get(id) ?? 'lecture'] });
    for (const id of removed) ctx.audit('project_shared', { user: user.username, project: project.id, member: usernameOf(id), change: 'removed' });
    for (const [id, value] of changedRights) ctx.audit('project_shared', { user: user.username, project: project.id, member: usernameOf(id), change: 'access', access: JOURNAL_ACCESS[value] });
    // « Partage » : la personne ajoutée est prévenue, même si elle a coupé
    // les projets (avec l'invitation à les allumer ; décision du 25 novembre 2026)
    for (const id of added) ctx.notify?.projectShared?.({ projectId: project.id, userId: id, actorId: user.id });
    return describeProject(q.projectFor.get({ userId: user.id, projectId: project.id }), user);
  }

  // --- Quitter un projet (POST /api/projects/:id/leave) ---
  // Un membre retire SA propre appartenance (la route ne prend aucun
  // identifiant de personne). Le propriétaire ne peut pas quitter son
  // projet (403) ; un non-membre reçoit « Projet introuvable » (404).
  function leaveProject(user, projectId) {
    const { project, role } = projectFor(user, projectId);
    if (role === 'owner') throw new OpError(403, 'ops.proprietaireNePeutPasQuitterProjet');
    const now = nowIso();
    db.transaction(() => {
      unassignEverywhere(project, user.id, user, 'app', now);
      q.removeMember.run(project.id, user.id);
      q.dropState.run(project.id, user.id);
      q.dropFollows.run(user.id, project.id);
      q.touch.run(now, project.id);
    })();
    ctx.events?.notifyProjects?.([project.owner_id, ...q.memberIds.all(project.id), user.id]);
    ctx.audit('project_left', { user: user.username, project: project.id });
    return {};
  }

  // --- Supprimer définitivement (routes, en ligne seulement) ---

  // Des projets de MA corbeille (« Supprimer définitivement » : un seul ;
  // « Vider la corbeille » : ceux que l'écran montrait, 100 au plus). Un
  // projet inconnu, d'un autre ou pas dans la corbeille est ignoré (rien
  // n'est dit de lui). Renvoie le nombre effacé.
  function purgeProjects(user, projectIds, { emptyTrash = false } = {}) {
    requireProjectsOn(user);
    if (!Array.isArray(projectIds) || projectIds.length === 0 || projectIds.length > PROJECTS_MAX || !projectIds.every(isUuid)) {
      throw new OpError(400, 'ops.projetsInvalides');
    }
    let purged = 0;
    for (const value of projectIds) {
      const project = q.projectFor.get({ userId: user.id, projectId: value.toLowerCase() });
      if (projectAccess(user, project) !== 'owner' || !project.deleted_at) continue;
      q.eraseProject.run(project.id); // colonnes, cartes, membres, historique : effacés avec lui
      ctx.audit('project_purged', { user: user.username, project: project.id });
      purged += 1;
    }
    if (emptyTrash) ctx.audit('project_trash_emptied', { user: user.username, projects: purged });
    if (purged) ctx.events?.notifyProjects?.([user.id]);
    return { purged };
  }

  // Un projet de ma corbeille (« Supprimer définitivement ») : 404 s'il n'y
  // est pas
  function purgeProject(user, projectId) {
    const { project, role } = projectFor(user, projectId, { trashed: true });
    if (role !== 'owner' || !project.deleted_at) throw new OpError(404, PROJECT_NOT_FOUND);
    return purgeProjects(user, [project.id]);
  }

  // Cartes supprimées d'un projet effacées pour de bon (propriétaire
  // seulement : « Supprimer définitivement », « Vider ») : cardIds, celles
  // que l'écran montrait ; une carte qui n'est pas dans les cartes
  // supprimées de CE projet est ignorée.
  function purgeCards(user, projectId, cardIds) {
    const { project, role, rights } = projectFor(user, projectId);
    if (!rights.purgeCards) throw deny(role, true);
    if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > CARDS_MAX || !cardIds.every(isUuid)) {
      throw new OpError(400, 'ops.cartesInvalides');
    }
    let purged = 0;
    db.transaction(() => {
      for (const value of cardIds) {
        const card = q.projectCard.get(value.toLowerCase(), project.id);
        if (!card || !card.deleted_at) continue;
        q.eraseCard.run(card.id);
        purged += 1;
      }
      if (purged) q.touch.run(nowIso(), project.id);
    })();
    if (purged) {
      ctx.events?.notifyProjects?.([project.owner_id, ...q.memberIds.all(project.id)]);
      ctx.audit('card_purged', { user: user.username, project: project.id, cards: purged });
    }
    return { purged };
  }

  // --- Synchronisation (ajoutée à GET /api/sync, server/lists.js) ---
  // Projets coupés : rien (seulement des tableaux vides). Sinon :
  // - projects : la structure de ceux que je vois qui a changé depuis
  //   « since » (changed_at), ou tous s'ils viennent de m'être partagés ou
  //   d'être restaurés ; mes projets dans la corbeille, en résumé ;
  // - projectIds : tous ceux que je vois (un absent a été effacé, ou je n'y
  //   ai plus accès) ;
  // - cards : les cartes changées depuis (supprimées comprises), ou toutes
  //   pour un projet qui vient de m'être partagé ou d'être restauré ;
  // - projectMine : MES réglages et mes nouveautés, en entier, pour chaque
  //   projet (jamais ceux d'une autre personne).
  const visibleQuery = db.prepare(`
    SELECT projects.*, project_members.access AS member_access, project_members.added_at AS member_added_at
    FROM projects LEFT JOIN project_members ON project_members.project_id = projects.id AND project_members.user_id = :me
    WHERE projects.owner_id = :me OR (project_members.user_id IS NOT NULL AND projects.deleted_at IS NULL)
  `);
  const cardsSince = db.prepare('SELECT * FROM cards WHERE project_id = ? AND updated_at >= ?');
  const allCards = db.prepare('SELECT * FROM cards WHERE project_id = ?');
  const allNames = db.prepare('SELECT id, display_name FROM users');
  function syncFor(user, since) {
    if (!projectsOn(user.id)) return { projects: [], projectIds: [], cards: [], comments: [], cardFollows: [], projectMine: {} };
    const from = since ?? '';
    const visible = visibleQuery.all({ me: user.id }).filter((project) => projectAccess(user, project));
    const names = new Map(allNames.all().map((row) => [row.id, row.display_name]));
    const states = new Map(q.states.all(user.id).map((row) => [row.project_id, row]));
    const newsOn = q.newsEnabled.get(user.id) === 1;
    const projects = [];
    const cards = [];
    const comments = [];
    const cardFollows = [];
    const projectMine = {};
    for (const project of visible) {
      const fresh = !since || (project.member_added_at ?? '') >= from || (project.cards_reset_at ?? '') >= from;
      if (fresh || project.changed_at >= from) projects.push(describeProject(project, user));
      if (project.deleted_at) continue;
      const rows = fresh ? allCards.all(project.id) : cardsSince.all(project.id, from);
      if (rows.length) {
        const links = { ...cardLinks(project.id), names };
        for (const card of rows) cards.push(describeCard(card, user, links));
      }
      for (const comment of fresh ? q.allComments.all(project.id) : q.commentsSince.all(project.id, from)) comments.push(describeComment(comment, user, names));
      // Mes choix « Suivre » / « Ne plus suivre » (en entier : jamais ceux des autres)
      for (const row of q.myFollows.all(user.id, project.id)) cardFollows.push([row.card_id, row.following === 1]);
      const state = states.get(project.id);
      const lastSeen = state?.last_seen_event ?? 0;
      const unread = newsOn && state?.muted_news !== 1 && q.lastOthersEvent.get(project.id, user.id) > lastSeen;
      projectMine[project.id] = {
        mutedNews: state?.muted_news === 1,
        mutedPush: state?.muted_push === 1,
        inDeadlines: state?.in_deadlines === 1,
        lastEvent: q.lastEvent.get(project.id),
        unread,
        // Cartes changées par les autres depuis ma dernière visite (point
        // sur chaque carte concernée, 9.1)
        newCards: unread ? q.newCards.all(project.id, lastSeen, user.id) : [],
      };
    }
    return { projects, projectIds: visible.map((project) => project.id), cards, comments, cardFollows, projectMine };
  }

  // Un commentaire, champ par champ : auteur (prénom relu maintenant ;
  // byMe : le mien), texte (vide s'il est supprimé), dates, « modifié » ;
  // commentaire importé (étape 5) : l'auteur d'origine comme simple texte.
  // Jamais le numéro d'un compte.
  function describeComment(comment, user, names) {
    return {
      id: comment.id,
      cardId: comment.card_id,
      projectId: comment.project_id,
      byMe: comment.user_id === user.id,
      authorName: comment.user_id ? names.get(comment.user_id) ?? null : null,
      text: comment.deleted_at ? '' : comment.body,
      importedAuthor: comment.imported_author ?? null,
      importedAt: comment.imported_at ?? null,
      importedByName: comment.imported_by ? names.get(comment.imported_by) ?? null : null,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      edited: comment.edited === 1,
      deletedAt: comment.deleted_at ?? null,
    };
  }

  // --- Historique d'une carte (GET /api/projects/:id/cards/:cardId/history,
  // en ligne seulement ; tout membre, Lecture seule compris) ---
  // Les lignes, la plus récente d'abord, construites champ par champ : le
  // type (liste fermée), qui (prénom relu maintenant ; « Un ancien compte »
  // s'il a disparu : null), « (assistant IA) » (source), la date, et
  // seulement les valeurs que le type permet (noms de colonnes d'alors,
  // date et heure, personne relue, étiquette d'alors, texte d'une case).
  // Jamais le titre, la description ni un commentaire.
  function cardHistory(user, projectId, cardId) {
    const { card, project } = cardFor(user, cardId, { projectId });
    const names = new Map(allNames.all().map((row) => [row.id, row.display_name]));
    const lines = q.history.all(card.id).map((row) => {
      let p = {};
      try {
        p = JSON.parse(row.params);
      } catch {
        p = {};
      }
      const text = (value, max = 200) => (typeof value === 'string' ? [...value].slice(0, max).join('') : null);
      const person = (value) => (Number.isSafeInteger(value) ? { name: names.get(value) ?? null, me: value === user.id } : null);
      const params = {};
      switch (row.type) {
        case 'create': case 'delete': case 'restore':
          params.column = text(p.columnName, 40);
          break;
        case 'move':
          params.from = text(p.fromName, 40);
          params.to = text(p.toName, 40);
          break;
        case 'due':
          params.date = typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
          params.time = typeof p.time === 'string' && /^\d{2}:\d{2}$/.test(p.time) ? p.time : null;
          break;
        case 'task':
          params.text = text(p.text);
          params.checked = p.checked === true;
          break;
        case 'assign': case 'unassign':
          params.person = person(p.user);
          break;
        case 'label': case 'unlabel':
          params.label = text(p.name, 30);
          params.color = typeof p.color === 'string' && /^[a-z]{2,10}$/.test(p.color) ? p.color : null;
          break;
        default:
      }
      return {
        id: row.id,
        type: row.type,
        actorName: row.user_id ? names.get(row.user_id) ?? null : null,
        byMe: row.user_id === user.id,
        ai: row.source === 'mcp',
        at: row.created_at,
        params,
      };
    });
    return { projectId: project.id, cardId: card.id, lines };
  }

  // --- Rappels des cartes (section 9.3) ---
  // Cartes à faire (pas « Fait »), présentes, d'un projet présent dont
  // l'option « Échéances » est allumée, avec date, heure et délai, autour
  // d'aujourd'hui ; le moment exact est calculé ensuite, en heure locale du
  // serveur (comme les tâches)
  const reminderCards = db.prepare(`SELECT cards.id, cards.project_id, cards.due_date, cards.due_time, cards.remind_before
    FROM cards JOIN projects ON projects.id = cards.project_id AND projects.deleted_at IS NULL AND projects.deadlines_enabled = 1
    WHERE cards.deleted_at IS NULL AND cards.due_done = 0 AND cards.due_time IS NOT NULL AND cards.remind_before IS NOT NULL
      AND cards.due_date BETWEEN ? AND ?`);
  // « Rappel remis à cette personne pour cette signature » : noté AVANT la
  // remise ; changes = 0 : déjà fait
  const claimReminder = db.prepare(`INSERT INTO card_reminders (card_id, user_id, signature, sent_at) VALUES (:cardId, :userId, :signature, :now)
    ON CONFLICT (card_id, user_id) DO UPDATE SET signature = :signature, sent_at = :now WHERE card_reminders.signature <> :signature`);
  const activeUser = db.prepare('SELECT active, projects_enabled FROM users WHERE id = ?');

  // Les rappels à remettre maintenant : [{ cardId, projectId, userId,
  // signature }], chacun noté dans card_reminders (une seule fois par
  // personne et par signature « date heure délai » ; changer l'échéance ou
  // le délai donne une nouvelle signature). Destinataires : les personnes
  // attribuées, sinon tous les membres du projet (comme les tâches) ;
  // seulement les comptes actifs qui ont les projets allumés et voient
  // toujours le projet. Jamais pour une carte faite, supprimée, ou dont le
  // moment est passé depuis plus de 30 minutes (serveur arrêté).
  // (Remis par server/notify.js, runReminders, avec deliver.)
  function takeCardReminders(now = ctx.now()) {
    const day = (ms) => {
      const date = new Date(ms);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const out = [];
    const stamp = new Date(now).toISOString();
    for (const card of reminderCards.all(day(now - DAY), day(now + 2 * DAY))) {
      const at = reminderAt(card.due_date, card.due_time, card.remind_before);
      if (at === null || at > now || now - at > REMIND_LATE_MS) continue;
      const signature = `${card.due_date} ${card.due_time} ${card.remind_before}`;
      const project = q.project.get(card.project_id);
      const assigned = q.cardAssignees.all(card.id);
      const people = assigned.length ? assigned : [project.owner_id, ...q.memberIds.all(project.id)];
      for (const userId of people) {
        const person = activeUser.get(userId);
        if (person?.active !== 1 || person.projects_enabled !== 1 || !roleOfUser(project, userId)) continue;
        if (!claimReminder.run({ cardId: card.id, userId, signature, now: stamp }).changes) continue;
        out.push({ cardId: card.id, projectId: project.id, userId, signature });
      }
    }
    return out;
  }

  // --- Ménage : projets et cartes dans une corbeille depuis plus de 30 jours ---
  // (avec leurs colonnes, étiquettes, personnes et historique, ON DELETE
  // CASCADE). Les projets dont une carte est effacée voient leur structure
  // changer (leurs membres l'oublient à la synchronisation suivante).
  function purgeDeleted() {
    const limit = purgeLimit();
    const projects = db.prepare('DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes;
    const touchedProjects = db.prepare('SELECT DISTINCT project_id FROM cards WHERE deleted_at IS NOT NULL AND deleted_at < ?').pluck().all(limit);
    const cards = db.prepare('DELETE FROM cards WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes;
    // Commentaires supprimés (texte déjà effacé) : la ligne part après 30 jours
    db.prepare('DELETE FROM card_comments WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit);
    const now = nowIso();
    for (const id of touchedProjects) {
      q.touch.run(now, id);
      const project = q.project.get(id);
      if (project) ctx.events?.notifyProjects?.([project.owner_id, ...q.memberIds.all(id)]);
    }
    return { projects, cards };
  }

  // (Les opérations sont appliquées par la file de server/lists.js :
  // handler(user, op, { source }).)
  return {
    handlers, syncFor, purgeDeleted, flushNotify, clearNotify, projectFor, cardFor, setMembers, leaveProject,
    purgeProjects, purgeProject, purgeCards, describeProject, takeCardReminders, followerIds, cardHistory,
  };
}
