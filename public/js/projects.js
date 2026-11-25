// Projets : règles communes au téléphone et au serveur (cadrage
// docs/cadrage-projets.md, validé par le propriétaire le 25 novembre 2026 ;
// migration 43).
//
// Ce module ne touche ni à l'écran ni au réseau, et ne contient aucun texte
// affiché (seulement des NOMS de textes, lus plus tard par t() ou
// translate()) : le serveur (server/projects.js, qui revérifie tout), la
// copie locale du téléphone (project-store.js) et les écrans appliquent
// ainsi exactement les mêmes règles, testées automatiquement
// (test/projects-rules.test.js).
//
// - Un projet a un seul tableau : des colonnes (nom, couleur, ordre) et des
//   cartes rangées dans les colonnes (ordre manuel).
// - Quatre rôles, valables pour tout le projet : le propriétaire (tout),
//   « Peut modifier » (les colonnes, les étiquettes et toutes les cartes),
//   « Contributeur » (créer des cartes ; modifier et déplacer celles qu'il a
//   créées OU qui lui sont attribuées ; supprimer seulement celles qu'il a
//   créées ; sur une carte qu'il n'a pas créée, seulement se retirer des
//   personnes), « Lecture seule » (voir, et ses réglages à soi).
// - Les étiquettes sont propres à chaque projet (même nom = même étiquette
//   dans le projet, majuscules et accents ignorés, comme labels.js).
// - L'ordre est une position réelle : « après telle carte » (afterId ; null
//   = en haut ; absent = en bas) ; quand deux voisines sont trop proches,
//   toute la colonne est renumérotée.

import { LABEL_COLORS, labelKey } from './labels.js';
import { safeLink } from './note-format.js';
import { isDueTime, isReminder } from './due-time.js';

// --- Limites (cadrage, sections 5.1, 10 et 13, validées le 25 novembre 2026) ---
export const PROJECT_NAME_MAX = 80;
export const COLUMN_NAME_MAX = 40;
export const CARD_TITLE_MAX = 200;
export const PROJECT_LABEL_NAME_MAX = 30;
export const PROJECTS_MAX = 100;          // par propriétaire, corbeille comprise
export const COLUMNS_MAX = 20;            // par projet
export const CARDS_MAX = 2000;            // par projet, cartes supprimées comprises
export const PROJECT_LABELS_MAX = 50;     // par projet
export const PROJECT_MEMBERS_MAX = 50;    // personnes avec qui un projet est partagé
export const LABELS_PER_CARD_MAX = 10;
export const ASSIGNEES_MAX = 10;          // personnes attribuées à une carte
export const PROJECT_TRASH_DAYS = 30;     // projets et cartes supprimés, ensuite effacés
export const CARD_HISTORY_MAX = 300;      // lignes d'historique gardées par carte
export const PROJECT_CREATIONS_PER_HOUR = 20; // créations et duplications, par compte
// Détails d'une carte (étape 2, migration 44)
export const CARD_DESCRIPTION_MAX = 20000;
export const LINKS_PER_CARD_MAX = 20;
export const LINK_TITLE_MAX = 100;
export const LINK_URL_MAX = 500;
export const TASK_TEXT_MAX = 200;         // texte d'une case gardé dans l'historique
// Commentaires (étape 3, migration 45)
export const COMMENT_MAX = 4000;          // caractères d'un commentaire
export const COMMENTS_PER_CARD_MAX = 500; // commentaires présents sur une carte
export const COMMENTS_PER_HOUR = 120;     // commentaires écrits par compte et par heure
export const IMPORTED_AUTHOR_MAX = 60;    // auteur d'origine d'un commentaire importé (étape 5)

// --- Rôles ---

// Droit d'un membre dans project_members.access (le propriétaire n'y figure
// pas : il a tous les droits)
export const PROJECT_ACCESS = ['modification', 'contribution', 'lecture'];
// Rôles d'un compte dans un projet
export const ROLES = ['owner', 'editor', 'contributor', 'reader'];
const ROLE_OF_ACCESS = { modification: 'editor', contribution: 'contributor', lecture: 'reader' };
// Rôle qui correspond à un droit de project_members (null : aucun)
export const roleOfAccess = (access) => (Object.hasOwn(ROLE_OF_ACCESS, access ?? '') ? ROLE_OF_ACCESS[access] : null);

// Ce que permet un rôle sur le projet (6, une ligne par action du tableau
// des droits). role : 'owner', 'editor', 'contributor', 'reader' ; tout
// autre valeur (non-membre) : rien.
export function projectRights(role) {
  const member = ROLES.includes(role);
  const owner = role === 'owner';
  const manager = owner || role === 'editor';
  const writer = manager || role === 'contributor';
  return {
    view: member,             // voir le projet, ses colonnes, cartes, étiquettes, personnes
    rename: owner,            // nom du projet
    priority: owner,          // option « Priorité »
    share: owner,             // partager, changer un rôle, retirer une personne
    trash: owner,             // supprimer (corbeille), restaurer, supprimer définitivement
    leave: member && !owner,  // quitter le projet
    duplicate: member,        // dupliquer (colonnes et étiquettes ; la copie est à qui duplique)
    columns: manager,         // colonnes : ajouter, renommer, couleur, ordre, supprimer
    labels: manager,          // étiquettes du projet : créer, renommer, couleur, supprimer
    settings: manager,        // ouvrir les réglages du projet
    createCards: writer,      // créer une carte
    comment: writer,          // écrire un commentaire (étape 3)
    purgeCards: owner,        // supprimer définitivement des cartes, vider les cartes supprimées
    ownState: member,         // réglages à soi (nouveautés, notifications, Échéances)
  };
}

// Ce que le compte me peut faire sur CETTE carte, selon son rôle (6) :
// - edit : titre, étiquettes posées, description, cases, échéance,
//   « Fait », priorité, liens (étape 2) ;
// - move : déplacer, ordonner ;
// - assign : attribuer ou retirer n'importe quelle personne permise ;
// - unassignSelf : seulement se retirer soi-même des personnes ;
// - remove : supprimer (cartes supprimées du projet) ; restore : restaurer ;
// - duplicate : dupliquer (la copie est à qui duplique) ; comment : commenter.
// card : sur le téléphone, la carte décrite par le serveur (createdByMe,
// assigneeIds) ; sur le serveur, { createdBy, assigneeIds }. me : numéro du
// compte. Contributeur : « créée par lui » ou « attribuée à lui » ; une
// carte qu'il n'a pas créée et qui ne lui est pas attribuée se lit et se
// commente seulement.
export function cardRights(card, me, role) {
  const none = { edit: false, move: false, assign: false, unassignSelf: false, remove: false, restore: false, duplicate: false, comment: false };
  if (!card || !ROLES.includes(role)) return none;
  if (role === 'owner' || role === 'editor') {
    return { edit: true, move: true, assign: true, unassignSelf: true, remove: true, restore: true, duplicate: true, comment: true };
  }
  if (role === 'reader') return none;
  const created = card.createdByMe === true || (me !== null && me !== undefined && card.createdBy === me);
  const assigned = me !== null && me !== undefined && (card.assigneeIds ?? []).includes(me);
  return {
    edit: created || assigned,
    move: created || assigned,
    assign: created,
    unassignSelf: created || assigned,
    remove: created,
    restore: created,
    duplicate: true,
    comment: true,
  };
}

// Nouvelle liste des personnes d'une carte permise ? rights : cardRights ;
// before, after : numéros des comptes (avant, voulus). Avec « assign »,
// toute liste (le serveur vérifie ensuite que chacun peut être attribué) ;
// avec seulement « unassignSelf », la liste d'avant sans moi, et rien
// d'autre (ou la même liste : rien ne change).
export function assignChangeAllowed(rights, before, after, me) {
  if (rights?.assign) return true;
  if (!rights?.unassignSelf) return false;
  const same = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));
  const wanted = new Set(after);
  // Rien ne change (opération rejouée) : permis
  if (same(wanted, new Set(before))) return true;
  return before.includes(me) && same(wanted, new Set(before.filter((id) => id !== me)));
}

// Rôles qui peuvent être attribués à une carte (5.2) : jamais « Lecture seule »
export const assignableRole = (role) => role === 'owner' || role === 'editor' || role === 'contributor';

// --- Noms et couleurs ---

// Les huit couleurs des colonnes : celles des étiquettes (kit, section 16.32)
export const COLUMN_COLORS = LABEL_COLORS;
export const DEFAULT_COLUMN_COLOR = 'gris';
export const isColumnColor = (value) => COLUMN_COLORS.includes(value);

// Colonnes d'un nouveau projet (choix du propriétaire du 25 novembre 2026) :
// « À faire », « En cours », « Fait », que l'on renomme à son goût. text :
// le NOM du texte (lu dans la langue du compte par t() ou translate()).
export const DEFAULT_COLUMNS = [
  { text: 'projets.colonne.aFaire', color: 'gris' },
  { text: 'projets.colonne.enCours', color: 'bleu' },
  { text: 'projets.colonne.fait', color: 'vert' },
];

// Caractères refusés dans un nom ou un titre : caractères de contrôle,
// privés, isolés, et caractères « invisibles » de mise en forme (sauf le
// liant des emojis, U+200D), qui pourraient tromper à l'affichage (même
// règle que les étiquettes, labels.js)
const FORBIDDEN = /[\p{Cc}\p{Co}\p{Cs}]|(?!‍)\p{Cf}/u;

// Nom ou titre tel qu'il est gardé : une seule ligne (retours à la ligne et
// tabulations remplacés par des espaces, espaces en trop retirés) ; null
// s'il n'est pas valable (pas un texte, vide, trop long, caractère interdit)
export function cleanName(value, max) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > max || FORBIDDEN.test(name)) return null;
  return name;
}

export const cleanProjectName = (value) => cleanName(value, PROJECT_NAME_MAX);
export const cleanColumnName = (value) => cleanName(value, COLUMN_NAME_MAX);
export const cleanCardTitle = (value) => cleanName(value, CARD_TITLE_MAX);
export function cleanProjectLabelName(value) {
  const name = cleanName(value, PROJECT_LABEL_NAME_MAX);
  return name && labelKey(name) ? name : null;
}

// Forme comparable d'un nom de colonne ou d'étiquette (majuscules et
// accents ignorés, labels.js) : deux noms de même forme sont le même dans
// un projet
export const nameKey = (name) => labelKey(name);

// Nom déjà pris dans ce projet ? (rows : colonnes ou étiquettes du projet ;
// exceptId : celle que l'on renomme)
export function nameTaken(rows, name, exceptId = null) {
  const key = nameKey(name);
  return rows.some((row) => row.id !== exceptId && nameKey(row.name) === key);
}

// Liste de numéros d'étiquettes (identifiants UUID) ou de comptes demandée
// pour une carte : sans doublon ; null si elle n'est pas valable
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
export function cleanCardLabelIds(value) {
  if (!Array.isArray(value) || !value.every(isUuid)) return null;
  const ids = [...new Set(value.map((id) => id.toLowerCase()))];
  return ids.length > LABELS_PER_CARD_MAX ? null : ids;
}
export function cleanAssigneeIds(value) {
  if (!Array.isArray(value) || !value.every((id) => Number.isSafeInteger(id) && id > 0)) return null;
  const ids = [...new Set(value)];
  return ids.length > ASSIGNEES_MAX ? null : ids;
}

// --- Détails d'une carte (étape 2 : sections 5.1 à 5.5) ---

// Priorité d'une carte (option « Priorité » du projet, coupée au départ) :
// basse, normale (par défaut), élevée, comme les tâches
export const CARD_PRIORITIES = ['low', 'normal', 'high'];
export const isCardPriority = (value) => CARD_PRIORITIES.includes(value);

// Vraie date AAAA-MM-JJ (pas de 30 février), du 1er janvier 2000 au
// 31 décembre 2100 (même règle que les tâches, server/lists.js)
export function isCardDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < '2000-01-01' || value > '2100-12-31') return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Échéance demandée pour une carte : null (retirée), ou { date, time,
// remindBefore } (heure « HH:MM » facultative ; rappel facultatif, parmi
// 0, 15, 30, 60, 120 ou 1 440 minutes avant, seulement avec une heure).
// undefined si elle n'est pas valable.
export function cleanCardDue(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isCardDate(value.date)) return undefined;
  const time = value.time ?? null;
  const remindBefore = value.remindBefore ?? null;
  if (time !== null && !isDueTime(time)) return undefined;
  if (remindBefore !== null && (time === null || !isReminder(remindBefore))) return undefined;
  return { date: value.date, time, remindBefore };
}

// Une carte faite ? La case « Fait » de l'échéance est la SEULE marque de
// « fait » (5.3) : une carte sans échéance n'est jamais faite
export const cardDone = (card) => Boolean(card?.dueDate) && card.done === true;

// Adresse d'un lien de carte : http ou https seulement (jamais
// javascript:, data:, file:…), avec un nom de site, sans identifiant ni
// mot de passe, 500 caractères au plus, sans espace ni caractère de
// contrôle. Renvoie l'adresse telle qu'elle est gardée, ou null.
export function cleanLinkUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > LINK_URL_MAX || /[\s\p{Cc}]/u.test(raw) || !/^https?:\/\//i.test(raw)) return null;
  const href = safeLink(raw);
  return href && href.length <= LINK_URL_MAX ? href : null;
}
// Titre d'un lien : facultatif ('' : l'adresse est montrée), une ligne,
// 100 caractères au plus ; null s'il n'est pas valable
export function cleanLinkTitle(value) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return '';
  return cleanName(value, LINK_TITLE_MAX);
}

// Description : un texte simple (marques des notes), 20 000 caractères au
// plus ; null s'il n'est pas valable
export function cleanDescription(value) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFC');
  return text.length > CARD_DESCRIPTION_MAX ? null : text;
}

// --- Commentaires (étape 3 : section 5.6) ---

// Caractères refusés dans un commentaire : les mêmes que dans un nom, sauf
// les retours à la ligne et les tabulations (gardés)
const COMMENT_FORBIDDEN = /[\p{Co}\p{Cs}]|(?![\n\t])\p{Cc}|(?!\u200D)\p{Cf}/u;

// Texte d'un commentaire tel qu'il est gardé : texte simple (jamais de
// HTML ni de mise en forme ; retours à la ligne gardés, espaces du début
// et de la fin retirés), 1 à 4 000 caractères ; null s'il n'est pas valable
export function cleanComment(value) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (!text || [...text].length > COMMENT_MAX || COMMENT_FORBIDDEN.test(text)) return null;
  return text;
}

// Ce que le compte peut faire sur UN commentaire (6) : modifier le sien
// (jamais celui d'un autre) ; supprimer le sien, ou celui d'un autre s'il
// est le propriétaire du projet (modération). En « Lecture seule », rien.
// comment : sur le téléphone, { byMe } ; sur le serveur, { userId }.
export function commentRights(comment, me, role) {
  if (!comment || !ROLES.includes(role) || role === 'reader') return { edit: false, remove: false };
  const mine = comment.byMe === true || (me !== null && me !== undefined && comment.userId === me);
  return { edit: mine, remove: mine || role === 'owner' };
}

// --- Commentaires importés (étape 5 : section 12.4) ---

// Auteur d'origine d'un commentaire importé par un assistant IA : simple
// texte d'une ligne (1 à 60 caractères, sans caractère de contrôle ni
// caractère invisible), jamais relié à un compte ; null s'il n'est pas valable
export const cleanImportedAuthor = (value) => cleanName(value, IMPORTED_AUTHOR_MAX);

// Date d'origine d'un commentaire importé : absente (null), une date
// AAAA-MM-JJ (gardée à midi UTC : le même jour partout) ou une date et
// heure ISO, du 1er janvier 2000 jusqu'à maintenant (now, en millisecondes ;
// jamais dans le futur). Renvoie la date ISO gardée, null (aucune), ou
// undefined si elle n'est pas valable.
export function cleanImportedAt(value, now) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 40) return undefined;
  let time;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isCardDate(value)) return undefined;
    time = Date.parse(`${value}T12:00:00.000Z`);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    time = Date.parse(value);
  } else return undefined;
  if (!Number.isFinite(time) || time < Date.parse('2000-01-01T00:00:00.000Z') || time > now) return undefined;
  return new Date(time).toISOString();
}

// --- Suivre une carte (étape 3 : section 9.2) ---

// Je suis une carte ? choice : mon choix explicite (true « Suivre », false
// « Ne plus suivre », null : aucun) ; sinon, je la suis si je l'ai créée,
// si elle m'est attribuée ou si je l'ai commentée. « Ne plus suivre » est
// gardé même si l'on m'attribue la carte ou que je la commente ensuite.
export function followsCard({ choice = null, created = false, assigned = false, commented = false }) {
  if (choice === true || choice === false) return choice;
  return Boolean(created || assigned || commented);
}

// --- Ordre (colonnes dans un projet, cartes dans une colonne) ---

export const POSITION_STEP = 1024;
// Écart minimal entre deux voisines : en dessous, la colonne est renumérotée
export const POSITION_MIN_GAP = 1e-6;

// Range par position (à égalité, par identifiant : le même ordre partout)
export function byPosition(rows) {
  return [...rows].sort((a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)));
}

// Place de movingId parmi rows (les cartes d'une colonne, ou les colonnes
// d'un projet, movingId compris ou non) : juste après afterId (null : en
// haut ; undefined : en bas ; un identifiant absent de rows : en bas aussi,
// cas d'une voisine déplacée ou supprimée entre-temps).
// Renvoie { position, renumber, unchanged } :
// - position : la nouvelle position de movingId ;
// - renumber : null, ou les autres lignes dont la position change
//   ([{ id, position }]) quand l'écart était trop petit (toute la série est
//   alors renumérotée de POSITION_STEP en POSITION_STEP) ;
// - unchanged : vrai si movingId était déjà à cette place (rien à écrire).
export function placeFor(rows, movingId, afterId) {
  const ordered = byPosition(rows);
  const current = ordered.find((row) => row.id === movingId) ?? null;
  const others = ordered.filter((row) => row.id !== movingId);
  let index = others.length;
  if (afterId === null) index = 0;
  else if (afterId !== undefined) {
    const at = others.findIndex((row) => row.id === afterId);
    if (at >= 0) index = at + 1;
  }
  // Déjà là : rien ne change
  if (current && ordered.indexOf(current) === index) return { position: current.position, renumber: null, unchanged: true };
  const prev = others[index - 1] ?? null;
  const next = others[index] ?? null;
  let position = null;
  if (!prev && !next) position = POSITION_STEP;
  else if (!next) position = prev.position + POSITION_STEP;
  else if (!prev) position = next.position - POSITION_STEP;
  else if (next.position - prev.position > POSITION_MIN_GAP * 2) position = (prev.position + next.position) / 2;
  if (position !== null && Number.isFinite(position) && Math.abs(position) < 1e12) return { position, renumber: null, unchanged: false };
  // Trop serré (ou positions hors d'usage) : toute la série renumérotée
  const ids = others.map((row) => row.id);
  ids.splice(index, 0, movingId);
  const before = new Map(others.map((row) => [row.id, row.position]));
  const renumber = [];
  let mine = POSITION_STEP;
  ids.forEach((id, i) => {
    const value = POSITION_STEP * (i + 1);
    if (id === movingId) mine = value;
    else if (before.get(id) !== value) renumber.push({ id, position: value });
  });
  return { position: mine, renumber, unchanged: false };
}

// Voisine pour « Monter » et « Descendre » (menu d'une carte) : l'afterId à
// envoyer, ou undefined si la carte est déjà tout en haut (monter) ou tout
// en bas (descendre)
export function afterIdForStep(rows, id, direction) {
  const ids = byPosition(rows).map((row) => row.id);
  const at = ids.indexOf(id);
  if (at < 0) return undefined;
  if (direction === 'up') {
    if (at === 0) return undefined;
    return at === 1 ? null : ids[at - 2];
  }
  return at === ids.length - 1 ? undefined : ids[at + 1];
}

// --- Corbeilles ---

const DAY = 24 * 60 * 60 * 1000;
// Jours restant avant l'effacement définitif d'un projet ou d'une carte
// supprimés (0 au plus bas)
export function daysLeft(deletedAt, now = Date.now()) {
  const left = Math.ceil((Date.parse(deletedAt) + PROJECT_TRASH_DAYS * DAY - now) / DAY);
  return Math.max(0, left);
}

// --- Historique (card_events.type, liste fermée) ---
export const CARD_EVENT_TYPES = [
  'create', 'move', 'rename', 'describe', 'task', 'assign', 'unassign', 'due', 'done', 'undone',
  'label', 'unlabel', 'link', 'unlink', 'comment', 'delete', 'restore', 'duplicate',
];
