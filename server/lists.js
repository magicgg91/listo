// Listes et articles : droits d'accès, opérations, historique, lecture,
// synchronisation et nettoyage.
//
// Règle d'or : chaque opération vérifie elle-même, dans la base, que le
// compte connecté est membre de la liste concernée (list_members). Le
// téléphone n'est jamais cru sur parole. Quelqu'un qui n'est pas membre
// reçoit exactement la même réponse que si la liste n'existait pas (404).
//
// Droits :
// - propriétaire : tout (renommer, changer le type et le magasin, partage et
//   droit de chaque personne, supprimer la liste) ;
// - contributeur (list_members.access = 'modification') :
//   articles seulement (ajouter, modifier, cocher, supprimer, tout décocher,
//   retirer les cochés, photo, mode scan) ;
// - invité « Lecture seule » ('lecture') : voit la liste, ses articles et
//   leurs photos, reçoit le temps réel ; toute écriture est refusée (403,
//   READ_ONLY). Une seule fonction décide : canEdit (plus bas) ;
// - un Admin n'a aucun droit particulier sur les listes des autres.
//
// Magasin « multi » (étape 6) : une liste de courses dont le magasin est
// « multi » n'a pas de rayon. Chaque article y a son propre magasin, choisi
// parmi ceux que regroupe le magasin de la liste (et actifs). Une liste à
// magasin simple garde ses rayons, sans magasin par article.
//
// Rayons propres à un magasin (21 novembre 2026, public/js/aisles.js) : une
// liste de courses à magasin simple propose les rayons de ce magasin et les
// rayons communs ; une liste sans magasin, les rayons communs seulement.
// Un rayon qui n'est pas proposé à la liste est refusé comme un rayon inconnu.
//
// Les dates (created_at, updated_at, deleted_at) sont toujours posées ici,
// par le serveur : celles qu'enverrait le téléphone sont ignorées.

import { createNewsService } from './news.js';
import { createNoteService } from './notes.js';
import { createInbox, inboxHandlers } from './inbox.js';
import { translate, compareText } from '../public/js/i18n.js';
import crypto from 'node:crypto';
import {
  normalizeItemName, suggest, usualAisle as sharedUsualAisle, usualStore as sharedUsualStore, recordUse, moveUse, hideHabitual,
} from '../public/js/history.js';
import { groupItems, compareNames } from '../public/js/sorting.js';
import { isListIcon } from '../public/js/list-icons.js';
import {
  isListType, isShoppingList, isWishList, usesPriority, usesDue, usesAssign, typeOf, WISHES_FIXED, NOT_TO_WISHES,
} from '../public/js/list-types.js';
import {
  wishListOf, beneficiaryId, mayMarkReceived, cleanLink, FOR_NAME_MAX, PRICE_MAX_CENTS,
} from '../public/js/wishes.js';
import { isRepeatRule, isOccurrence, nextDue } from '../public/js/repeat.js';
import { ASSIGN_MODES, parsePeople, formatPeople, isPeopleList, assigneesOf, turnAfterCheck, withoutPerson } from '../public/js/assign.js';
import { isDueTime, isReminder } from '../public/js/due-time.js';
import {
  usesSubtasks, SUBTASK_NOT_HERE, SUBTASKS_OFF, BAD_PARENT, PARENT_IS_SUBTASK, HAS_SUBTASKS, NOT_OWN_PARENT, SUBTASK_NO_REPEAT,
  NOT_A_SUBTASK, BAD_PLACE, nextPosition, reorderedIds,
} from '../public/js/subtasks.js';
import { aisleFits, aislesForStore, offeredAisles, rematchAisle } from '../public/js/aisles.js';
import { createReservationService } from './reservations.js';
import { cleanName, parseId } from './validate.js';
import { normalizeBarcode } from './products.js';

const DAY = 24 * 60 * 60 * 1000;

// Priorité et échéance d'un élément (listes autres que les courses)
export const PRIORITIES = ['low', 'normal', 'high'];
const FIRST_DAY = '2000-01-01';
const LAST_DAY = '2100-12-31';

// Vrai si value est une vraie date AAAA-MM-JJ (pas de 30 février, pas
// d'heure ni de fuseau), entre le 1er janvier 2000 et le 31 décembre 2100
export function isDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < FIRST_DAY || value > LAST_DAY) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export const PURGE_AFTER_DAYS = 30;
export const MAX_OPS_PER_BATCH = 100;

// Identifiant UUID (forme 8-4-4-4-12 en hexadécimal)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID.test(value);

// Erreur « métier » d'une opération : code (400, 403, 404, 409), nom du
// texte de refus (public/js/i18n/fr/ops.js…) et ses valeurs. message : ce
// texte en français (journal, connexion Claude) ; la réponse HTTP le
// traduit dans la langue de la requête : req.t(err.key, err.params).
class OpError extends Error {
  constructor(status, key, params = {}) {
    super(translate('fr', key, params));
    this.status = status;
    this.key = key;
    this.params = params;
  }
}

// Refus : noms des textes (public/js/i18n/fr/ops.js). Ceux qui sont
// exportés servent aussi à la connexion Claude (en français) et aux tests.
const LIST_NOT_FOUND = 'ops.listeIntrouvable';
// Messages sans le mot « article » : selon la liste, on dit « article »
// (courses) ou « élément » (autres listes), et ici la liste n'est pas connue
// (l'élément n'existe plus, ou la requête est mal formée).
const ITEM_NOT_FOUND = 'ops.introuvable';
const OWNER_ONLY = 'ops.proprietaireSeulement';
export const READ_ONLY = 'ops.lectureSeule';
export const OWNER_CANNOT_LEAVE = 'ops.proprietaireNePeutPasQuitter';
// Priorité ou échéance désactivée par le propriétaire pour cette liste
// (migration 13) : refus avant toute écriture
export const PRIORITY_OFF = 'ops.prioriteDesactivee';
export const DUE_OFF = 'ops.echeanceDesactivee';
// Rayon demandé dans une liste « multi » (un magasin par article, pas de rayon)
export const MULTI_NO_AISLE = 'ops.multiSansRayon';
export const PRIORITY_NOT_HERE = 'ops.prioritePasIci';
export const DUE_NOT_HERE = 'ops.echeancePasIci';
export const BAD_PRIORITY = 'ops.prioriteInconnue';
export const BAD_DUE = 'ops.echeanceInvalide';
// Tâches qui se répètent (public/js/repeat.js)
export const REPEAT_NOT_HERE = 'ops.repetitionPasIci';
export const REPEAT_OFF = 'ops.repetitionDesactivee';
export const BAD_REPEAT = 'ops.repetitionInvalide';
export const REPEAT_NEEDS_DUE = 'ops.repetitionSansEcheance';
export const BAD_NEXT_DUE = 'ops.dateSuivanteInvalide';
// Heure d'échéance et rappel (public/js/due-time.js)
export const BAD_TIME = 'ops.heureInvalide';
export const BAD_REMINDER = 'ops.rappelInvalide';
export const TIME_NEEDS_DUE = 'ops.heureSansDate';
export const REMIND_NEEDS_TIME = 'ops.rappelSansHeure';
// Attribuer une tâche (décisions du 11 novembre 2026)
export const ASSIGN_NOT_HERE = 'ops.attributionPasIci';
export const ASSIGN_OFF = 'ops.attributionDesactivee';
export const BAD_ASSIGNEE = 'ops.personneNonAttribuable';
export const BAD_ASSIGN_MODE = 'ops.facondAttribuerInconnue';
export const BAD_PEOPLE = 'ops.personnesInvalides';
export const TURN_NEEDS_REPEAT = 'ops.tourSansRepetition';

// Date du jour sur le serveur (AAAA-MM-JJ, fuseau du serveur : variable TZ)
export const serverToday = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// LA règle de la priorité et de l'échéance d'un élément, partagée par
// l'application (opérations item.create et item.update) et par la connexion
// Claude (add_items et update_items, qui s'en servent pour refuser un
// appel entier AVANT toute écriture). Renvoie le nom du texte de refus
// (public/js/i18n/fr/ops.js ; Claude le reçoit en français), ou null.
// type : type de la liste ; enabled : { priorityEnabled, dueEnabled }
// (réglages enregistrés de la liste) ; fields : { priority, dueDate, repeat }
// (undefined : non demandé ; dueDate null : effacer l'échéance ; repeat
// null : ne plus répéter). La répétition suit l'échéance : listes de
// tâches, échéance activée.
// Ordre : le type de liste s'en sert-il, le réglage est-il activé, la
// valeur est-elle permise (vraie date du calendrier, entre 2000 et 2100).
export function itemOptionsError(type, { priorityEnabled, dueEnabled }, { priority, dueDate, repeat, dueTime, remindBefore }) {
  // L'heure et le rappel suivent l'échéance (même type de liste, même réglage)
  const dueLike = [dueDate, dueTime, remindBefore].some((value) => value !== undefined);
  if (priority !== undefined && !usesPriority(type)) return PRIORITY_NOT_HERE;
  if (dueLike && !usesDue(type)) return DUE_NOT_HERE;
  if (repeat !== undefined && !usesDue(type)) return REPEAT_NOT_HERE;
  if (priority !== undefined && !priorityEnabled) return PRIORITY_OFF;
  if (dueLike && !dueEnabled) return DUE_OFF;
  if (repeat !== undefined && !dueEnabled) return REPEAT_OFF;
  if (priority !== undefined && !PRIORITIES.includes(priority)) return BAD_PRIORITY;
  if (dueDate !== undefined && dueDate !== null && !isDueDate(dueDate)) return BAD_DUE;
  if (repeat !== undefined && repeat !== null && !isRepeatRule(repeat)) return BAD_REPEAT;
  if (dueTime !== undefined && dueTime !== null && !isDueTime(dueTime)) return BAD_TIME;
  if (remindBefore !== undefined && remindBefore !== null && !isReminder(remindBefore)) return BAD_REMINDER;
  return null;
}
export const ACCESS = ['modification', 'lecture'];
// Droit écrit dans le journal de sécurité, toujours en anglais
const JOURNAL_ACCESS = { modification: 'edit', lecture: 'read' };
const journalAccess = (access) => JOURNAL_ACCESS[access] ?? access;

// Droit d'écriture d'un compte sur une liste : LE seul contrôle, utilisé par
// toutes les écritures (opérations, photos, mode scan) et par la description
// de la liste envoyée au téléphone. row : ce que la base dit de la liste et
// de l'appartenance du compte (owner_id ou list_owner_id, member_access).
// Le propriétaire a toujours tous les droits ; un membre, seulement en
// « modification » (contributeur). Jamais d'après ce que dit le téléphone.
export function canEdit(user, row) {
  const ownerId = row.owner_id ?? row.list_owner_id;
  return ownerId === user.id || row.member_access === 'modification';
}

// --- Vérification des champs envoyés par le téléphone ---

// key : refus « Identifiant de liste invalide. » ('ops.identifiantListeInvalide'),
// ou rien (élément d'une liste : mot neutre)
function requireUuid(value, key = 'ops.identifiantInvalide') {
  if (!isUuid(value)) throw new OpError(400, key);
  return value.toLowerCase();
}

function listName(value) {
  const name = cleanName(value);
  if (!name) throw new OpError(400, 'ops.nomListeInvalide');
  return name;
}

function itemName(value) {
  const name = cleanName(value);
  if (!name) throw new OpError(400, 'ops.nomInvalide');
  return name;
}

// Texte facultatif (quantité, note) : absent ou null = vide. invalid,
// tooLong : noms des deux refus (texte invalide, trop long)
function optionalText(value, max, invalid, tooLong) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new OpError(400, invalid);
  const text = value.normalize('NFC').trim();
  if (text.length > max) throw new OpError(400, tooLong, { max });
  return text;
}

// Icône choisie pour une liste : identifiant de la liste blanche
// (public/js/list-icons.js), « » pour revenir à l'icône de la catégorie, ou
// undefined si elle n'est pas envoyée (rien ne change)
// « Après l'ajout » : 'quick' (rester sur la liste) ou 'detail' (ouvrir la
// fiche), rien d'autre ; undefined : pas fourni
export const ADD_MODES = ['quick', 'detail'];
function addModeOf(value) {
  if (value === undefined) return undefined;
  if (!ADD_MODES.includes(value)) throw new OpError(400, 'ops.reglageApresAjoutInvalide');
  return value;
}

// Lien d'un souhait : http ou https seulement (public/js/wishes.js) ; null
// ou « » l'efface ; undefined : pas fourni
function linkOf(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const link = cleanLink(value);
  if (!link) throw new OpError(400, 'ops.lienInvalide');
  return link;
}

// Prix indicatif d'un souhait, en centimes (entier de 0 à 100 000 €) ; null
// l'efface ; undefined : pas fourni
function priceOf(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > PRICE_MAX_CENTS) throw new OpError(400, 'ops.prixInvalide');
  return value;
}

// Prénom d'une personne sans compte (liste d'envies) : texte simple, 80 caractères au plus
function forNameOf(value) {
  const name = typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (!name || [...name].length > FOR_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new OpError(400, 'ops.prenomInvalide', { max: FOR_NAME_MAX });
  }
  return name;
}

function listIconOf(value) {
  if (value === undefined) return undefined;
  if (value === '' || isListIcon(value)) return value;
  throw new OpError(400, 'ops.iconeInconnue');
}

const quantity = (value) => optionalText(value, 30, 'ops.quantiteInvalide', 'ops.quantiteTropLongue');
const note = (value) => optionalText(value, 500, 'ops.noteInvalide', 'ops.noteTropLongue');

// Lien et prix : listes d'envies seulement ; une liste d'envies n'a pas
// de quantité. Vérifié avant toute écriture.
function checkWishFields(wishes, op) {
  if (!wishes && (op.link !== undefined || op.priceCents !== undefined)) {
    throw new OpError(400, 'ops.lienPrixPasIci');
  }
  if (wishes && typeof op.quantity === 'string' && op.quantity.trim() !== '') {
    throw new OpError(400, 'ops.quantitePasIci');
  }
}

// Modification d'un élément par la connexion Claude (update_items) : les
// MÊMES règles que l'opération item.update de l'application (nom, quantité,
// note, quantité refusée dans une liste d'envies, priorité et échéance avec
// itemOptionsError), pour tout vérifier AVANT d'écrire. Renvoie { error }
// (message de l'application, en français : connexion Claude) ou { fields } : les valeurs telles que
// l'application les enregistrera (nom et textes nettoyés), seulement pour
// les champs demandés. type : type de la liste ; enabled : ses réglages.
export function checkItemEdit(type, enabled, op) {
  try {
    const fields = {};
    if (op.name !== undefined) fields.name = itemName(op.name);
    if (op.quantity !== undefined) fields.quantity = quantity(op.quantity);
    if (op.note !== undefined) fields.note = note(op.note);
    checkWishFields(isWishList(type), op);
    const error = itemOptionsError(type, enabled, op);
    if (error) return { error: translate('fr', error) };
    if (op.priority !== undefined) fields.priority = op.priority;
    if (op.dueDate !== undefined) fields.dueDate = op.dueDate;
    if (op.repeat !== undefined) fields.repeat = op.repeat;
    if (op.dueTime !== undefined) fields.dueTime = op.dueTime;
    if (op.remindBefore !== undefined) fields.remindBefore = op.remindBefore;
    return { fields };
  } catch (err) {
    if (err instanceof OpError) return { error: err.message };
    throw err;
  }
}

// --- Accès aux données ---

export function createListService(ctx) {
  const { db } = ctx;
  // Nouveautés : journal d'activité et repères de lecture (server/news.js)
  const news = ctx.news ?? (ctx.news = createNewsService(ctx));
  // Réservations des listes d'envies (server/reservations.js) : seul module
  // qui lit la table reservations, et qui filtre ce qu'en voit chaque compte
  const reservations = ctx.reservations ?? (ctx.reservations = createReservationService(ctx));
  // Notes (server/notes.js) : leurs opérations passent par la même file
  // (POST /api/ops, applied_ops) et leurs données par la même synchronisation
  const notes = ctx.notes ?? (ctx.notes = createNoteService(ctx, { OpError }));
  // Page Notifications (server/inbox.js) : ses opérations hors ligne
  // (« inbox.read », « inbox.delete ») et son empreinte dans la synchronisation
  const inbox = ctx.inbox ?? (ctx.inbox = createInbox(ctx));
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    store: db.prepare('SELECT * FROM stores WHERE id = ?'),
    userName: db.prepare('SELECT display_name FROM users WHERE id = ?').pluck(),
    activeUser: db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').pluck(),
    aisle: db.prepare('SELECT * FROM aisles WHERE id = ?'),
    allStores: db.prepare('SELECT * FROM stores'),
    allAisles: db.prepare('SELECT * FROM aisles'),

    // Une liste non supprimée dont le compte est membre
    // (is_multi : 1 si c'est une liste de courses à magasin « multi »)
    memberList: db.prepare(`
      SELECT lists.*, list_members.access AS member_access,
        (lists.type = 'shopping' AND COALESCE(stores.is_multi, 0) = 1) AS is_multi
      FROM lists
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      LEFT JOIN stores ON stores.id = lists.store_id
      WHERE lists.id = :listId AND lists.deleted_at IS NULL
    `),
    // Un article non supprimé d'une liste non supprimée dont le compte est membre
    memberItem: db.prepare(`
      SELECT items.*, lists.type AS list_type, lists.store_id AS list_store_id,
        lists.owner_id AS list_owner_id, list_members.access AS member_access,
        lists.for_user_id AS list_for_user_id, lists.for_name AS list_for_name,
        lists.priority_enabled AS list_priority_enabled, lists.due_enabled AS list_due_enabled,
        lists.assign_enabled AS list_assign_enabled, lists.subtasks_enabled AS list_subtasks_enabled,
        (lists.type = 'shopping' AND COALESCE(stores.is_multi, 0) = 1) AS is_multi
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      LEFT JOIN stores ON stores.id = lists.store_id
      WHERE items.id = :itemId AND items.deleted_at IS NULL
    `),
    // Un article supprimé (pas encore effacé) d'une liste dont le compte est membre
    deletedItemForMember: db.prepare(`
      SELECT items.*, lists.owner_id AS list_owner_id, list_members.access AS member_access FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.id = :itemId AND items.deleted_at IS NOT NULL
    `),
    anyList: db.prepare('SELECT id FROM lists WHERE id = ?'),
    anyItem: db.prepare('SELECT id FROM items WHERE id = ?'),
    item: db.prepare('SELECT * FROM items WHERE id = ?'),
    // Peut recevoir une tâche : membre « Peut modifier » (le propriétaire
    // l'est toujours), compte actif
    assignable: db.prepare(`SELECT 1 FROM list_members JOIN users ON users.id = list_members.user_id AND users.active = 1
      WHERE list_members.list_id = ? AND list_members.user_id = ? AND list_members.access = 'modification'`).pluck(),
    // Tâches qui ne sont plus attribuables (personne partie ou passée en
    // lecture seule) : remises à « Personne »
    // (une, plusieurs, ou chacun son tour : withoutPerson, public/js/assign.js)
    assignedOf: db.prepare(`SELECT id, assign_mode, assign_people, assigned_to FROM items
      WHERE list_id = :listId AND (assigned_to = :userId OR instr(',' || COALESCE(assign_people, '') || ',', ',' || CAST(:userId AS INTEGER) || ',') > 0)`),
    setAssignment: db.prepare('UPDATE items SET assign_mode = ?, assign_people = ?, assigned_to = ?, updated_at = ? WHERE id = ?'),
    members: db.prepare(`
      SELECT users.id, users.username, users.display_name, users.active, list_members.access
      FROM list_members JOIN users ON users.id = list_members.user_id
      WHERE list_members.list_id = ?
    `),
    // Mes listes (non supprimées), avec leur dernière activité
    myLists: db.prepare(`
      SELECT lists.*,
        MAX(lists.updated_at, COALESCE((SELECT MAX(updated_at) FROM items WHERE items.list_id = lists.id), '')) AS last_activity,
        (SELECT COUNT(*) FROM items WHERE items.list_id = lists.id AND items.deleted_at IS NULL AND items.checked = 0) AS remaining
      FROM lists JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = ?
      WHERE lists.deleted_at IS NULL
    `),
    liveItems: db.prepare('SELECT * FROM items WHERE list_id = ? AND deleted_at IS NULL'),
    // Sous-tâches : un élément présent d'une liste ; les sous-tâches
    // présentes d'une tâche (public/js/subtasks.js)
    presentItem: db.prepare('SELECT * FROM items WHERE id = ? AND list_id = ? AND deleted_at IS NULL'),
    childItems: db.prepare('SELECT * FROM items WHERE parent_id = ? AND list_id = ? AND deleted_at IS NULL'),
    // Magasins regroupés par un magasin « multi » (identifiants)
    memberStores: db.prepare('SELECT store_id FROM store_members WHERE multi_store_id = ?').pluck(),
    allStoreMembers: db.prepare('SELECT * FROM store_members'),
    // Toutes les lignes d'historique d'un article (générale et par magasin)
    history: db.prepare('SELECT * FROM item_history WHERE name_normalized = ?'),
    allHistory: db.prepare('SELECT * FROM item_history'),
    insertHistory: db.prepare(`
      INSERT INTO item_history (name_normalized, store_id, display_name, aisle_id, use_count, last_used_at, hidden_at)
      VALUES (:nameNormalized, :storeId, :name, :aisleId, :useCount, :lastUsedAt, :hiddenAt)
    `),
    updateHistory: db.prepare(`
      UPDATE item_history SET aisle_id = :aisleId, use_count = :useCount, last_used_at = :lastUsedAt, hidden_at = :hiddenAt
      WHERE id = :id
    `),
  };

  // --- Petits outils ---

  // Type demandé par une opération de liste (champ listType ; « type » est
  // déjà le nom de l'opération), ou undefined si l'opération ne demande rien
  function requestedType(op) {
    if (op.listType === undefined) return undefined;
    if (!isListType(op.listType)) throw new OpError(400, 'ops.typeInconnu');
    return op.listType;
  }

  // Magasin actif, ou null si aucun n'est demandé
  function activeStoreOrNull(id) {
    if (id === undefined || id === null) return null;
    const store = parseId(id) && q.store.get(parseId(id));
    if (!store || store.active !== 1) throw new OpError(400, 'ops.magasinInconnu');
    return store;
  }

  // Tous les rayons, sous la forme des règles partagées (public/js/aisles.js)
  const allAisles = () => q.allAisles.all().map(describeAisle);

  // Rayon proposé à une liste de ce magasin (storeId : magasin simple de la
  // liste, ou null), ou null pour « Sans rayon ». Un rayon désactivé, ou
  // d'un autre magasin, est refusé comme un rayon inconnu.
  function offeredAisleOrNull(id, storeId) {
    if (id === null) return null;
    const row = parseId(id) && q.aisle.get(parseId(id));
    if (!row || row.active !== 1 || !aisleFits(describeAisle(row), storeId)) throw new OpError(400, 'ops.rayonInconnu');
    return row;
  }

  // Rayons proposés à une liste de ce magasin (storeId : magasin simple de
  // la liste, ou null), { id, name }, dans l'ordre de l'application (ordre
  // alphabétique des noms) : ceux qu'on peut choisir pour un article.
  // Seul Claude (MCP) les lit : ordre français, comme ses réponses.
  function activeAisles(storeId = null) {
    return offeredAisles(allAisles(), storeId)
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => compareNames(a.name, b.name, 'fr'));
  }

  // Magasins proposés pour les articles d'une liste « multi » : ceux que
  // regroupe son magasin, et qui sont actifs
  function storeChoices(multiStoreId) {
    return q.memberStores.all(multiStoreId).filter((id) => q.store.get(id)?.active === 1);
  }

  // Les mêmes magasins, { id, name }, dans l'ordre de l'application (ordre
  // alphabétique des noms, comme storeChoices du téléphone) : ceux qu'on peut
  // choisir pour un article de cette liste « multi » (Claude seulement :
  // ordre français)
  function activeStoreChoices(multiStoreId) {
    return storeChoices(multiStoreId).map((id) => q.store.get(id))
      .map((row) => ({ id: row.id, name: row.name }))
      .sort((a, b) => compareNames(a.name, b.name, 'fr'));
  }

  // Magasin choisi pour un article d'une liste « multi » : vide (« Sans
  // magasin »), ou un des magasins regroupés par celui de la liste, actif.
  function chosenStore(value, multiStoreId) {
    if (value === null) return null;
    const id = parseId(value);
    if (!id || !storeChoices(multiStoreId).includes(id)) {
      throw new OpError(400, 'ops.magasinNonPropose');
    }
    return id;
  }

  // La liste, si le compte en est membre ; sinon 404 (comme si elle n'existait pas)
  function listForMember(user, listId) {
    const list = q.memberList.get({ userId: user.id, listId: requireUuid(listId, 'ops.identifiantListeInvalide') });
    if (!list) throw new OpError(404, LIST_NOT_FOUND);
    return list;
  }

  function listForOwner(user, listId) {
    const list = listForMember(user, listId);
    if (list.owner_id !== user.id) throw new OpError(403, OWNER_ONLY);
    return list;
  }

  function itemForMember(user, itemId) {
    const item = q.memberItem.get({ userId: user.id, itemId: requireUuid(itemId) });
    if (!item) throw new OpError(404, ITEM_NOT_FOUND);
    return item;
  }

  // Écritures : membre ET droit de modification (canEdit), sinon 403. Un
  // non-membre reçoit toujours le même 404 qu'avant (aucune fuite).
  function requireEdit(user, row) {
    if (!canEdit(user, row)) throw new OpError(403, READ_ONLY);
    return row;
  }
  const listForEditor = (user, listId) => requireEdit(user, listForMember(user, listId));
  const itemForEditor = (user, itemId) => requireEdit(user, itemForMember(user, itemId));

  // L'historique d'un article (toutes ses lignes), sous la forme utilisée par
  // les règles partagées (public/js/history.js)
  const historyOf = (name) => q.history.all(normalizeItemName(name)).map(describeHistory);

  // Enregistre les lignes modifiées par une règle partagée
  function saveHistory(entries) {
    for (const line of entries) {
      const entry = { ...line, hiddenAt: line.hiddenAt ?? null };
      if (entry.id) q.updateHistory.run(entry);
      else q.insertHistory.run(entry);
    }
  }

  // Met à jour l'historique commun, avec la règle partagée recordUse :
  // ligne générale (autocomplétion, rayon habituel) et ligne du magasin
  // (rayon habituel dans ce magasin, ou achat dans ce magasin pour une liste
  // « multi »). count = 1 pour un ajout, 0 pour une modification. Le nom
  // affiché reste celui de la première saisie (« LAIT » ne change pas « Lait »),
  // et un article « Sans rayon » n'efface pas un rayon habituel.
  function remember(name, { storeId = null, aisleId = null, count }) {
    saveHistory(recordUse(historyOf(name), { name, storeId, aisleId, count, now: nowIso() }));
  }

  // Rayon habituel (règle partagée) : d'abord celui de l'article dans ce
  // magasin, sinon son rayon général ; seulement s'il est encore proposé à
  // une liste de ce magasin (actif, commun ou de ce magasin)
  function usualAisle(name, storeId) {
    const offered = new Set(offeredAisles(allAisles(), storeId).map((a) => a.id));
    return sharedUsualAisle(historyOf(name), name, storeId, (id) => offered.has(id));
  }

  // Magasin habituel (règle partagée) parmi les magasins proposés par la liste
  function usualStore(name, multiStoreId) {
    return sharedUsualStore(historyOf(name), name, storeChoices(multiStoreId));
  }

  // Changement de magasin d'une liste (ou passage en liste de courses) :
  // chaque article garde son magasin ; seuls les champs vides sont
  // complétés par l'historique (règle choisie par le propriétaire) :
  // - liste « multi » : un article sans magasin, ou dont le magasin n'est pas
  //   regroupé par le nouveau, reçoit son magasin habituel s'il en a un ;
  //   les rayons ne changent pas (cachés, ils reviennent avec un magasin
  //   simple) ;
  // - liste à magasin simple ou sans magasin : un article dont le rayon
  //   n'est pas proposé pour le nouveau magasin va dans le rayon proposé de
  //   même nom, sinon « Sans rayon » (rematchAisle, public/js/aisles.js :
  //   même règle sur le téléphone, store.js) ; puis un article qui était
  //   déjà sans rayon reçoit son rayon habituel. Un article qui vient de
  //   perdre son rayon reste « Sans rayon » : le téléphone qui a fait le
  //   changement propose de le ranger. L'historique ne change pas.
  function completeItems(listId) {
    const list = db.prepare(`
      SELECT lists.*, COALESCE(stores.is_multi, 0) AS store_is_multi
      FROM lists LEFT JOIN stores ON stores.id = lists.store_id WHERE lists.id = ?
    `).get(listId);
    if (!isShoppingList(list)) return;
    const now = nowIso();
    const setStore = db.prepare('UPDATE items SET store_id = ?, updated_at = ? WHERE id = ?');
    const setAisle = db.prepare('UPDATE items SET aisle_id = ?, updated_at = ? WHERE id = ?');
    const aisles = allAisles();
    for (const item of q.liveItems.all(listId)) {
      if (list.store_is_multi === 1) {
        if (item.store_id !== null && q.memberStores.all(list.store_id).includes(item.store_id)) continue;
        const storeId = usualStore(item.name, list.store_id);
        if (storeId !== null) setStore.run(storeId, now, item.id);
      } else if (item.aisle_id === null) {
        const aisleId = usualAisle(item.name, list.store_id);
        if (aisleId !== null) setAisle.run(aisleId, now, item.id);
      } else {
        const aisleId = rematchAisle(item.aisle_id, aisles, list.store_id);
        if (aisleId !== item.aisle_id) setAisle.run(aisleId, now, item.id);
      }
    }
  }

  // Une liste « multi » n'a pas de rayon ; une autre liste n'a pas de
  // magasin par article. Le téléphone qui enverrait le mauvais champ est refusé.
  // Priorité : une des trois valeurs, rien d'autre
  // Réglage « Priorité » ou « Échéance » d'une liste : vrai, faux, ou
  // undefined s'il n'est pas envoyé (rien ne change). key : nom du refus
  // (« Réglage « Priorité » invalide. »…)
  function optionOf(value, key) {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new OpError(400, key);
    return value;
  }

  function priorityOf(value) {
    if (!PRIORITIES.includes(value)) throw new OpError(400, BAD_PRIORITY);
    return value;
  }
  // Échéance : null efface ; sinon une vraie date AAAA-MM-JJ (une chaîne vide
  // n'est pas null : elle est refusée)
  function dueDateOf(value) {
    if (value === null) return null;
    if (!isDueDate(value)) throw new OpError(400, BAD_DUE);
    return value;
  }

  // Code-barres (listes de courses) : null efface ; sinon un code de 8, 12
  // ou 13 chiffres avec une clé de contrôle valide, gardé sous sa forme
  // normalisée (UPC-A → EAN-13). Une chaîne vide n'est pas null : refusée.
  function eanOf(value) {
    if (value === null) return null;
    const code = normalizeBarcode(value);
    if (!code) throw new OpError(400, 'ops.codeBarresInvalide');
    return code;
  }
  // Attribution demandée (opération) : undefined (non demandée), null
  // (« Personne »), ou l'identifiant d'un compte qui peut recevoir la tâche
  // (propriétaire ou « Peut modifier », compte actif). Listes de tâches
  // dont l'attribution est activée seulement ; sinon refus, avant toute
  // écriture.
  function assigneeFor(type, assignEnabled, listId, value) {
    if (value === undefined) return undefined;
    if (!usesAssign(type)) throw new OpError(400, ASSIGN_NOT_HERE);
    if (!assignEnabled) throw new OpError(400, ASSIGN_OFF);
    if (value === null) return null;
    const id = typeof value === 'number' || typeof value === 'string' ? parseId(value) : null;
    if (!id || !q.assignable.get(listId, id)) throw new OpError(400, BAD_ASSIGNEE);
    return id;
  }

  // Façon d'attribuer demandée (opération : assignMode, assignPeople,
  // assignedTo), à partir de l'état actuel { mode, people, assignedTo }.
  // undefined : rien de demandé. Vérifiée avant toute écriture :
  // - 'one' : la personne (assignedTo) ou personne ;
  // - 'all' : 2 à 20 personnes qui peuvent recevoir la tâche ;
  // - 'turn' : de même, dans l'ordre, seulement si la tâche se répète
  //   (repeat : la règle après l'opération) ; la personne de cette fois :
  //   celle demandée, sinon l'actuelle si elle est dans le tour, sinon la
  //   première.
  // Sans assignMode, assignedTo seul : chacun son tour, change la personne
  // de cette fois (si elle est dans le tour) ; sinon passe en « une personne ».
  function assignmentFor(type, assignEnabled, listId, op, current, repeat) {
    if (op.assignMode === undefined && op.assignPeople === undefined && op.assignedTo === undefined) return undefined;
    if (!usesAssign(type)) throw new OpError(400, ASSIGN_NOT_HERE);
    if (!assignEnabled) throw new OpError(400, ASSIGN_OFF);
    if (op.assignMode !== undefined && !ASSIGN_MODES.includes(op.assignMode)) throw new OpError(400, BAD_ASSIGN_MODE);
    const person = assigneeFor(type, assignEnabled, listId, op.assignedTo);
    let mode = op.assignMode;
    if (mode === undefined) {
      if (op.assignPeople !== undefined) mode = current.mode === 'one' ? 'all' : current.mode;
      else mode = current.mode === 'turn' && person != null && current.people.includes(person) ? 'turn' : 'one';
    }
    if (mode === 'one') {
      if (op.assignPeople !== undefined && op.assignPeople !== null) throw new OpError(400, BAD_PEOPLE);
      return { mode, people: [], assignedTo: person !== undefined ? person : current.mode === 'all' ? null : current.assignedTo };
    }
    let people = current.people;
    if (op.assignPeople !== undefined) {
      const ids = Array.isArray(op.assignPeople) ? op.assignPeople.map((value) => (typeof value === 'number' || typeof value === 'string' ? parseId(value) : null)) : null;
      if (!ids || !isPeopleList(ids) || !ids.every((id) => q.assignable.get(listId, id))) throw new OpError(400, BAD_PEOPLE);
      people = ids;
    }
    if (!isPeopleList(people)) throw new OpError(400, BAD_PEOPLE);
    if (mode === 'all') return { mode, people, assignedTo: null };
    if (repeat === null) throw new OpError(400, TURN_NEEDS_REPEAT);
    const assignedTo = person != null && people.includes(person) ? person
      : current.assignedTo != null && people.includes(current.assignedTo) ? current.assignedTo : people[0];
    return { mode, people, assignedTo };
  }
  // --- Sous-tâches (public/js/subtasks.js, décisions du 17 novembre 2026) ---

  // Regroupement actif : liste de tâches dont l'option « Sous-tâches » est
  // activée. row : une liste (type, subtasks_enabled) ou un article lu avec
  // memberItem (list_type, list_subtasks_enabled).
  const nests = (row) => usesSubtasks(row.list_type ?? typeOf(row))
    && (row.list_subtasks_enabled ?? row.subtasks_enabled) === 1;

  // Un élément présent (non supprimé) de la liste, ou undefined
  const presentItem = (listId, itemId) => q.presentItem.get(itemId, listId);

  // Tâche principale d'un élément, telle qu'elle s'affiche (même règle que
  // parentOf dans subtasks.js) : présente, et pas elle-même rangée sous une
  // autre tâche présente ; sinon null
  function parentRow(row) {
    if (!row.parent_id) return null;
    const parent = presentItem(row.list_id, row.parent_id);
    if (!parent || parent.id === row.id) return null;
    if (parent.parent_id && presentItem(row.list_id, parent.parent_id)) return null;
    return parent;
  }

  // Sous-tâches présentes d'une tâche principale (elle-même pas rangée sous
  // une autre)
  const childRows = (row) => (parentRow(row) ? [] : q.childItems.all(row.id, row.list_id));
  // Ordre manuel : ce que les règles partagées lisent d'une sous-tâche
  const asOrdered = (row) => ({ id: row.id, position: row.position, createdAt: row.created_at });
  // Place d'une sous-tâche ajoutée (ou rangée) sous parent : à la fin
  const lastPosition = (parent) => nextPosition(childRows(parent).map(asOrdered));

  // Principale demandée par une opération (parentId) : undefined (pas
  // demandé), null (aucune : la tâche redevient ordinaire) ou la ligne de
  // la principale. Vérifié avant toute écriture : liste de tâches, option
  // activée, principale présente dans la même liste et pas elle-même une
  // sous-tâche, tâche déplacée sans sous-tâches. list : { id, type,
  // subtasks_enabled } ; itemId : la tâche déplacée (null pour un ajout).
  function parentFor(list, itemId, parentId) {
    if (parentId === undefined) return undefined;
    if (!usesSubtasks(typeOf(list))) throw new OpError(400, SUBTASK_NOT_HERE);
    if (list.subtasks_enabled !== 1) throw new OpError(400, SUBTASKS_OFF);
    if (parentId === null) return null;
    if (!isUuid(parentId)) throw new OpError(400, BAD_PARENT);
    if (parentId === itemId) throw new OpError(400, NOT_OWN_PARENT);
    const parent = presentItem(list.id, parentId);
    if (!parent) throw new OpError(400, BAD_PARENT);
    if (parentRow(parent)) throw new OpError(400, PARENT_IS_SUBTASK);
    if (itemId && q.childItems.all(itemId, list.id).length) throw new OpError(400, HAS_SUBTASKS);
    return parent;
  }

  // Une sous-tâche à faire sous une principale cochée : la principale se
  // décoche (il reste quelque chose à faire). Renvoie vrai si elle a changé.
  function reopenParent(parent, now) {
    if (!parent || parent.checked !== 1) return false;
    db.prepare('UPDATE items SET checked = 0, checked_at = NULL, updated_at = ? WHERE id = ?').run(now, parent.id);
    return true;
  }

  const assignmentOf = (item) => ({ mode: item.assign_mode ?? 'one', people: parsePeople(item.assign_people), assignedTo: item.assigned_to ?? null });
  // Pour comparer « avant / après » avec les règles partagées (assign.js)
  const asItem = ({ mode, people, assignedTo }) => ({ assignMode: mode, assignPeople: people, assignedTo });

  // Une personne quitte la liste, en est retirée ou passe en lecture seule :
  // retirée de ses tâches (une, plusieurs, chacun son tour), supprimées comprises
  function unassign(listId, userId, now) {
    for (const row of q.assignedOf.all({ listId, userId })) {
      const next = withoutPerson(assignmentOf(row), userId);
      q.setAssignment.run(next.mode, formatPeople(next.people), next.assignedTo, now, row.id);
    }
  }

  // La tâche se répète-t-elle en ce moment ? (règle, échéance, liste de
  // tâches dont l'échéance est activée : sinon la règle est gardée, cachée)
  function repeatsNow(item) {
    return Boolean(item.repeat && item.due_date) && usesDue(item.list_type) && item.list_due_enabled === 1;
  }

  // Refusé sur une liste autre que les courses (rien n'est écrit), vérifié
  // avant toute écriture
  function checkEanForList(isShopping, op) {
    if (!isShopping && op.ean !== undefined) {
      throw new OpError(400, 'ops.codeBarresPasIci');
    }
  }

  // « Reçu » (le coché) d'une liste d'envies : le bénéficiaire (compte) ou
  // le propriétaire seulement ; un proche ne peut pas le marquer
  function checkReceived(user, row, ownerId) {
    if (!isWishList(row.type ?? row.list_type)) return;
    const list = { ownerId, forUserId: row.for_user_id ?? row.list_for_user_id ?? null, forName: row.for_name ?? row.list_for_name ?? null };
    if (!mayMarkReceived(user.id, list)) {
      throw new OpError(403, 'ops.recuInterdit');
    }
  }

  function checkFieldsForList(multi, op) {
    if (multi && op.aisleId !== undefined && op.aisleId !== null) {
      throw new OpError(400, MULTI_NO_AISLE);
    }
    if (!multi && op.storeId !== undefined && op.storeId !== null) {
      throw new OpError(400, 'ops.magasinMultiSeulement');
    }
  }

  // --- Mise en forme des réponses ---

  const describeItem = (item) => ({
    id: item.id,
    listId: item.list_id,
    name: item.name,
    quantity: item.quantity,
    note: item.note,
    aisleId: item.aisle_id,
    storeId: item.store_id,
    photoAt: item.photo_at,
    priority: item.priority ?? 'normal',
    dueDate: item.due_date ?? null,
    // Règle de répétition (public/js/repeat.js), ou null
    repeat: item.repeat ?? null,
    // Personne à qui la tâche est attribuée (identifiant du compte), ou null
    assignedTo: item.assigned_to ?? null,
    // Plusieurs personnes ('all') ou chacun son tour ('turn', assignedTo :
    // la personne de cette fois) : les personnes, dans l'ordre (assign.js)
    assignMode: item.assign_mode ?? 'one',
    assignPeople: parsePeople(item.assign_people),
    // Heure « HH:MM » et rappel (minutes avant l'heure), ou null
    dueTime: item.due_time ?? null,
    remindBefore: item.remind_before ?? null,
    // Tâche principale d'une sous-tâche (identifiant), ou null
    // (public/js/subtasks.js : ignorée si l'option est coupée)
    parentId: item.parent_id ?? null,
    // Place parmi les sous-tâches de sa principale (ordre manuel), ou null
    position: item.position ?? null,
    ean: item.ean ?? null,
    // Liste d'envies : lien web et prix indicatif (centimes)
    link: item.link ?? null,
    priceCents: item.price_cents ?? null,
    checked: item.checked === 1,
    checkedAt: item.checked_at ?? null,
    createdBy: item.created_by,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    deletedAt: item.deleted_at,
  });

  function describeList(list, user) {
    const type = typeOf(list);
    const shopping = isShoppingList(type);
    const storeRow = list.store_id === null ? null : q.store.get(list.store_id);
    const store = storeRow && { id: storeRow.id, name: storeRow.name, active: storeRow.active === 1, isMulti: storeRow.is_multi === 1 };
    const rows = q.members.all(list.id);
    // access : le droit de chaque personne (le propriétaire : toujours
    // « modification ») ; canEdit : le droit du compte connecté
    const members = rows.map((m) => ({
      id: m.id, username: m.username, displayName: m.display_name, active: m.active === 1, isOwner: m.id === list.owner_id,
      access: m.id === list.owner_id ? 'modification' : m.access,
    }));
    const mine = rows.find((m) => m.id === user.id);
    // Liste d'envies : à qui elle est destinée (rien de secret ; les
    // réservations, elles, ne sont jamais ici : voir server/reservations.js)
    const wishes = isWishList(type) ? {
      forUserId: list.for_user_id ?? null,
      forName: list.for_name ?? null,
      forDisplayName: list.for_user_id ? q.userName.get(list.for_user_id) ?? null : null,
      isBeneficiary: beneficiaryId(wishListOf(list)) === user.id,
    } : {};
    return {
      id: list.id,
      name: list.name,
      ...wishes,
      // Icône choisie (« » : celle du type)
      icon: isListIcon(list.icon) ? list.icon : '',
      type,
      // Magasin : seulement si le type s'en sert. Une liste de tâches qui a
      // été une liste de courses garde son magasin en base, caché ici ;
      // keptStore le donne au seul propriétaire, pour que « Modifier la
      // liste » le remette s'il revient à Courses (rien d'autre ne le lit).
      store: shopping ? store : null,
      ...(!shopping && store && list.owner_id === user.id ? { keptStore: store } : {}),
      ownerId: list.owner_id,
      isOwner: list.owner_id === user.id,
      canEdit: canEdit(user, { owner_id: list.owner_id, member_access: mine?.access }),
      // Priorité et échéance activées pour cette liste (seule une liste de
      // tâches s'en sert ; les autres types les gardent, ignorées)
      priorityEnabled: list.priority_enabled === 1,
      dueEnabled: list.due_enabled === 1,
      // Attribution des tâches activée (listes de tâches)
      assignEnabled: list.assign_enabled === 1,
      // Sous-tâches activées (listes de tâches)
      subtasksEnabled: list.subtasks_enabled === 1,
      // « Après l'ajout » : 'quick' (rester sur la liste) ou 'detail' (ouvrir la fiche)
      addMode: list.add_mode === 'detail' ? 'detail' : 'quick',
      // Lien public en cours ({ expiresAt } ou null) : pour le propriétaire seulement
      ...(list.owner_id === user.id && ctx.shares ? { publicLink: ctx.shares.badgeFor(list.id) } : {}),
      members,
      remaining: list.remaining,
      lastActivity: list.last_activity,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      deletedAt: list.deleted_at,
    };
  }

  const describeReference = (row) => ({
    id: row.id,
    name: row.name,
    active: row.active === 1,
  });
  // Rayon : en plus, son magasin (null : « Tous les magasins »)
  const describeAisle = (row) => ({ ...describeReference(row), storeId: row.store_id ?? null });

  // Magasins : type (simple ou « multi ») et magasins regroupés
  function describeStores() {
    const members = new Map();
    for (const row of q.allStoreMembers.all()) {
      if (!members.has(row.multi_store_id)) members.set(row.multi_store_id, []);
      members.get(row.multi_store_id).push(row.store_id);
    }
    return q.allStores.all().map((row) => ({
      ...describeReference(row),
      isMulti: row.is_multi === 1,
      storeIds: row.is_multi === 1 ? members.get(row.id) ?? [] : [],
    }));
  }

  const describeHistory = (row) => ({
    id: row.id,
    name: row.display_name,
    nameNormalized: row.name_normalized,
    storeId: row.store_id,
    aisleId: row.aisle_id,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
    hiddenAt: row.hidden_at ?? null,
  });

  // Listes modifiées par l'opération en cours : leurs membres sont prévenus
  // (temps réel) seulement après l'écriture réussie en base.
  const touched = new Set();
  const changed = (listId) => touched.add(listId);
  // Changements qui ne regardent que la personne connectée (repère de
  // lecture, sourdine, réglages des nouveautés) : seuls ses propres appareils
  // sont prévenus (listId null : aucun en particulier)
  const touchedMine = new Set();
  const changedForMe = (listId) => touchedMine.add(listId);
  function notifyTouched(user) {
    for (const listId of touched) ctx.events?.notifyList(listId);
    for (const listId of touchedMine) ctx.events?.notifyUsers([user.id], listId);
    touched.clear();
    touchedMine.clear();
  }

  // --- Les opérations ---
  // Chacune reçoit le compte connecté et l'opération envoyée, vérifie les
  // droits et les champs, puis modifie la base. Elle renvoie ce qu'il faut
  // répondre au téléphone, ou lève une OpError.

  const handlers = {
    // Créer une liste : le créateur en est le propriétaire et le premier membre
    'list.create'(user, op) {
      const id = requireUuid(op.listId, 'ops.identifiantListeInvalide');
      if (q.anyList.get(id)) throw new OpError(409, 'ops.listeExisteDeja');
      const name = listName(op.name);
      const type = requestedType(op);
      if (type === undefined) throw new OpError(400, 'ops.typeInconnu');
      const store = activeStoreOrNull(op.storeId);
      if (store && !isShoppingList(type)) {
        throw new OpError(400, 'ops.magasinCoursesSeulement');
      }
      // Liste d'envies : « Pour qui ? », fixé ici pour toujours. Un autre
      // compte actif (forUserId), une personne sans compte (forName), ou ni
      // l'un ni l'autre : « Moi » (le propriétaire est le bénéficiaire).
      let forUserId = null;
      let forName = null;
      if (op.forUserId !== undefined && op.forUserId !== null) {
        if (!isWishList(type)) throw new OpError(400, 'ops.pourQuiPasIci');
        forUserId = parseId(op.forUserId);
        if (!forUserId || !q.activeUser.get(forUserId)) throw new OpError(400, 'ops.utilisateurInconnu');
        if (forUserId === user.id) forUserId = null; // « Moi »
      }
      if (op.forName !== undefined && op.forName !== null) {
        if (!isWishList(type)) throw new OpError(400, 'ops.pourQuiPasIci');
        if (forUserId) throw new OpError(400, 'ops.compteOuPersonne');
        forName = forNameOf(op.forName);
      }
      // Priorité et échéance : désactivées sauf demande explicite, pour tous
      // les types (liste d'envies comprise : le propriétaire l'active ensuite
      // dans « Modifier la liste », comme pour une liste de tâches)
      const priorityOn = optionOf(op.priorityEnabled, 'ops.reglagePrioriteInvalide') ?? false;
      const dueOn = optionOf(op.dueEnabled, 'ops.reglageEcheanceInvalide') ?? false;
      const assignOn = optionOf(op.assignEnabled, 'ops.reglageAttributionInvalide') ?? false;
      const subtasksOn = optionOf(op.subtasksEnabled, 'ops.reglageSousTachesInvalide') ?? false;
      const icon = listIconOf(op.icon) ?? ''; // rien de choisi : icône du type
      // « Après l'ajout » : sans choix, « Rester sur la liste » pour une liste
      // de courses, « Ouvrir la fiche » pour les autres
      const addMode = addModeOf(op.addMode) ?? (isShoppingList(type) ? 'quick' : 'detail');
      const now = nowIso();
      db.prepare('INSERT INTO lists (id, name, type, store_id, owner_id, priority_enabled, due_enabled, assign_enabled, subtasks_enabled, icon, add_mode, for_user_id, for_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, name, type, store?.id ?? null, user.id, Number(priorityOn), Number(dueOn), Number(assignOn), Number(subtasksOn), icon, addMode, forUserId, forName, now, now);
      db.prepare("INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, 'modification')").run(id, user.id);
      news.startReading(id, user.id);
      // Le compte bénéficiaire est membre d'office, en « Peut modifier » : il
      // ouvre sa liste et y ajoute ses souhaits (il ne verra jamais les réservations)
      if (forUserId) {
        db.prepare("INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, 'modification')").run(id, forUserId);
        news.startReading(id, forUserId);
      }
      changed(id);
      // Notification « partage » au compte destinataire (ajouté à la liste)
      if (forUserId) ctx.notify?.sharing({ listId: id, userId: forUserId, actorId: user.id, kind: 'added' });
      ctx.audit('list_created', { user: user.username, list: id });
      return { list: describeList(q.myLists.all(user.id).find((l) => l.id === id), user) };
    },

    // Renommer, changer de type, de magasin ou d'icône, activer ou non la
    // priorité et l'échéance, choisir « Après l'ajout » (propriétaire
    // seulement : contributeur et invité 403, non-membre 404 ; changer de
    // type ne change pas ce dernier choix). Un magasin désactivé reste
    // accepté s'il est déjà celui de la liste ; pour en changer, le nouveau
    // doit être actif.
    // Changer de type n'efface RIEN : une liste de courses qui devient une
    // liste de tâches garde son magasin (caché, voir describeList), ses
    // rayons et ses codes-barres ; une liste de tâches qui devient une liste
    // de courses garde ses réglages et ses valeurs de priorité et d'échéance
    // (ignorés). Tout réapparaît au retour au type d'origine.
    // Listes d'envies : ni changement de type (dans un sens ou dans l'autre),
    // ni changement de bénéficiaire (l'ancien bénéficiaire verrait d'un coup
    // toutes les réservations).
    'list.update'(user, op) {
      const list = listForOwner(user, op.listId);
      if (op.forUserId !== undefined || op.forName !== undefined) {
        throw new OpError(400, 'ops.destinataireFixe');
      }
      if ([op.name, op.listType, op.storeId, op.priorityEnabled, op.dueEnabled, op.assignEnabled, op.subtasksEnabled, op.icon, op.addMode].every((value) => value === undefined)) {
        throw new OpError(400, 'ops.rienAModifier');
      }
      const priorityOn = optionOf(op.priorityEnabled, 'ops.reglagePrioriteInvalide') ?? list.priority_enabled === 1;
      const dueOn = optionOf(op.dueEnabled, 'ops.reglageEcheanceInvalide') ?? list.due_enabled === 1;
      const assignOn = optionOf(op.assignEnabled, 'ops.reglageAttributionInvalide') ?? list.assign_enabled === 1;
      // Sous-tâches : couper l'option n'efface rien (les tâches s'affichent
      // à plat, et se regroupent quand elle revient)
      const subtasksOn = optionOf(op.subtasksEnabled, 'ops.reglageSousTachesInvalide') ?? list.subtasks_enabled === 1;
      const name = op.name === undefined ? list.name : listName(op.name);
      const icon = listIconOf(op.icon) ?? list.icon;
      const addMode = addModeOf(op.addMode) ?? list.add_mode;

      const before = typeOf(list);
      let type;
      if (isWishList(before)) {
        // Seul un listType différent est refusé
        if (op.listType !== undefined && op.listType !== 'wishes') throw new OpError(400, WISHES_FIXED);
        type = before;
      } else {
        type = requestedType(op) ?? before;
        if (isWishList(type)) throw new OpError(400, NOT_TO_WISHES);
      }

      let storeId = list.store_id;
      if (isShoppingList(type)) {
        if (op.storeId !== undefined) {
          if (op.storeId !== null && !parseId(op.storeId)) throw new OpError(400, 'ops.magasinInconnu');
          const wanted = op.storeId === null ? null : parseId(op.storeId);
          if (wanted !== list.store_id) storeId = activeStoreOrNull(wanted)?.id ?? null;
        }
      } else if (op.storeId !== undefined && op.storeId !== null) {
        // Pas de magasin à choisir pour une liste qui n'est pas de courses ;
        // « aucun magasin » (envoyé par un ancien téléphone) est ignoré : le
        // magasin conservé n'est pas effacé
        throw new OpError(400, 'ops.magasinCoursesSeulement');
      }

      db.prepare('UPDATE lists SET name = ?, type = ?, store_id = ?, priority_enabled = ?, due_enabled = ?, assign_enabled = ?, subtasks_enabled = ?, icon = ?, add_mode = ?, updated_at = ? WHERE id = ?')
        .run(name, type, storeId, Number(priorityOn), Number(dueOn), Number(assignOn), Number(subtasksOn), icon, addMode, nowIso(), list.id);
      if (isShoppingList(type) && (storeId !== list.store_id || type !== before)) completeItems(list.id);
      if (type !== before) ctx.audit('list_type_changed', { user: user.username, list: list.id, before, after: type });
      changed(list.id);
      return {};
    },

    // Supprimer une liste (propriétaire seulement). Suppression logique : les
    // autres téléphones l'apprendront à leur prochaine synchronisation.
    'list.delete'(user, op) {
      const list = listForOwner(user, op.listId);
      const now = nowIso();
      db.prepare('UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, list.id);
      news.dropList(list.id); // son journal disparaît avec elle
      changed(list.id);
      ctx.audit('list_deleted', { user: user.username, list: list.id });
      // Son lien public s'arrête avec elle
      const share = ctx.shares?.stopForList(list.id);
      if (share) ctx.audit('public_link_stopped', { user: user.username, list: list.id, share: share.id, reason: 'list deleted' });
      return {};
    },

    // Retirer les cochés (« Retirer du panier » / « Retirer les terminés ») :
    // supprime les articles cochés de cette liste, au moment où le serveur
    // reçoit l'opération. Tout membre de la liste peut le faire.
    // seulement. L'historique d'autocomplétion n'est pas touché.
    'list.removeChecked'(user, op) {
      const list = listForEditor(user, op.listId);
      const now = nowIso();
      // Sous-tâches (regroupement actif) : une sous-tâche cochée sous une
      // principale à faire reste à sa place (elle n'est pas dans les terminés)
      const kept = nests(list) ? new Set(db.prepare('SELECT * FROM items WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL AND parent_id IS NOT NULL').all(list.id)
        .filter((row) => parentRow(row)?.checked === 0).map((row) => row.id)) : new Set();
      const ids = db.prepare('SELECT id FROM items WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL').pluck().all(list.id).filter((id) => !kept.has(id));
      const remove = db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?');
      for (const id of ids) remove.run(now, now, id);
      const changes = ids.length;
      news.log(list.id, user.id, 'delete', ids);
      if (changes) changed(list.id);
      return { removed: changes };
    },

    // Tout décocher (« Tout remettre à acheter » / « Tout rouvrir ») : une
    // seule opération, quel que soit le nombre de cochés. Chaque article
    // décoché reçoit une nouvelle date de modification (synchronisation des
    // autres téléphones). Porte sur les articles cochés au moment où le
    // serveur reçoit l'opération. Tout membre de la liste peut le faire.
    'list.uncheckAll'(user, op) {
      const list = listForEditor(user, op.listId);
      checkReceived(user, list, list.owner_id);
      const ids = db.prepare('SELECT id FROM items WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL').pluck().all(list.id);
      const { changes } = db.prepare('UPDATE items SET checked = 0, checked_at = NULL, updated_at = ? WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL')
        .run(nowIso(), list.id);
      news.log(list.id, user.id, 'uncheck', ids);
      if (changes) changed(list.id);
      return { reopened: changes };
    },

    // Ajouter un article.
    // - liste à magasin simple : sans rayon précisé, un article déjà connu
    //   reprend son rayon habituel (celui de ce magasin, sinon le général) ;
    // - liste « multi » : pas de rayon ; sans magasin précisé, un article
    //   déjà acheté dans un des magasins de la liste reprend son magasin habituel.
    // Retirer un article de « Souvent ajoutés » (décision du 11 novembre
    // 2026) : pour toute la famille, dans le ou les magasins de cette liste de
    // courses (ligne générale si elle n'a pas de magasin). Il revient s'il
    // est de nouveau ajouté (recordUse efface la date). Demande le droit de
    // modifier la liste.
    'habitual.hide'(user, op) {
      const list = listForEditor(user, op.listId);
      if (!isShoppingList(list)) throw new OpError(400, 'ops.souventAjoutesPasIci');
      const name = itemName(op.name);
      const storeIds = !list.store_id ? [] : list.is_multi === 1 ? storeChoices(list.store_id) : [list.store_id];
      if (list.is_multi === 1 && !storeIds.length) return {};
      saveHistory(hideHabitual(historyOf(name), { name, storeIds, now: nowIso() }));
      changed(list.id);
      return {};
    },

    'item.create'(user, op) {
      const list = listForEditor(user, op.listId);
      const id = requireUuid(op.itemId);
      if (q.anyItem.get(id)) throw new OpError(409, 'ops.identifiantDejaUtilise');
      const name = itemName(op.name);
      checkFieldsForList(list.is_multi === 1, op);
      checkEanForList(isShoppingList(list), op);
      checkWishFields(isWishList(list), op);
      // Priorité et échéance dès l'ajout (facultatives ; utilisées par la
      // connexion Claude) : même règle que item.update (itemOptionsError)
      const optionsError = itemOptionsError(typeOf(list), { priorityEnabled: list.priority_enabled === 1, dueEnabled: list.due_enabled === 1 }, op);
      if (optionsError) throw new OpError(400, optionsError);
      const priority = op.priority === undefined ? 'normal' : op.priority;
      const dueDate = op.dueDate ?? null;
      const repeat = op.repeat ?? null;
      if (repeat !== null && dueDate === null) throw new OpError(400, REPEAT_NEEDS_DUE);
      // Sous-tâche (parentId) : vérifiée avant toute écriture ; jamais de
      // répétition
      const parent = parentFor(list, null, op.parentId) ?? null;
      if (parent && repeat !== null) throw new OpError(400, SUBTASK_NO_REPEAT);
      const assignment = assignmentFor(typeOf(list), list.assign_enabled === 1, list.id, op, { mode: 'one', people: [], assignedTo: null }, repeat)
        ?? { mode: 'one', people: [], assignedTo: null };
      const assignedTo = assignment.assignedTo;
      const dueTime = op.dueTime ?? null;
      const remindBefore = op.remindBefore ?? null;
      if (dueTime !== null && dueDate === null) throw new OpError(400, TIME_NEEDS_DUE);
      if (remindBefore !== null && dueTime === null) throw new OpError(400, REMIND_NEEDS_TIME);
      const ean = op.ean === undefined ? null : eanOf(op.ean);
      const link = linkOf(op.link) ?? null;
      const priceCents = priceOf(op.priceCents) ?? null;
      let aisleId = null;
      let storeId = null;
      if (list.is_multi === 1) {
        storeId = op.storeId === undefined ? usualStore(name, list.store_id) : chosenStore(op.storeId, list.store_id);
      } else if (isShoppingList(list)) {
        aisleId = op.aisleId === undefined ? usualAisle(name, list.store_id) : offeredAisleOrNull(op.aisleId, list.store_id)?.id ?? null;
      }
      const now = nowIso();
      // Sous-tâche : à la fin des sous-tâches de sa principale
      const position = parent ? lastPosition(parent) : null;
      db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, aisle_id, store_id, ean, link, price_cents, priority, due_date, repeat, assigned_to, assign_mode, assign_people, due_time, remind_before, parent_id, position, created_by, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, list.id, name, quantity(op.quantity), note(op.note), aisleId, storeId, ean, link, priceCents, priority, dueDate, repeat, assignedTo, assignment.mode, formatPeople(assignment.people), dueTime, remindBefore, parent?.id ?? null, position, user.id, now, now);
      // Une nouvelle sous-tâche à faire : sa principale cochée se décoche
      reopenParent(parent, now);
      // Historique (listes de courses seulement) : magasin de l'article
      // (« multi ») ou magasin de la liste (simple)
      if (isShoppingList(list)) remember(name, { storeId: list.is_multi === 1 ? storeId : list.store_id, aisleId, count: 1 });
      news.log(list.id, user.id, 'add', [id]);
      // Notification : « Léa vous a attribué une tâche » (regroupée avec ses
      // autres changements de la minute, server/notify.js)
      for (const userId of assigneesOf(asItem(assignment))) ctx.notify?.assigned({ listId: list.id, itemId: id, userId, actorId: user.id });
      changed(list.id);
      return { item: describeItem(q.item.get(id)) };
    },

    // Modifier un article (nom, quantité, note, rayon ou magasin ; code-barres
    // dans une liste de courses ; priorité et échéance hors listes de
    // courses). Un champ absent de l'opération ne change pas (un téléphone
    // qui ne connaît pas encore la priorité ou le code-barres ne les remet
    // pas à zéro) ; dueDate: null efface l'échéance, ean: null le code. Le nouveau
    // rayon, ou le nouveau nom, est mémorisé pour les prochains ajouts ; dans
    // une liste « multi », un changement de magasin reporte l'achat sur le
    // nouveau magasin (il devient le magasin habituel s'il est le plus fréquent).
    'item.update'(user, op) {
      const item = itemForEditor(user, op.itemId);
      const multi = item.is_multi === 1;
      checkFieldsForList(multi, op);
      // Priorité : listes de tâches et d'envies ; échéance : listes de tâches
      // seulement ; réglage de la liste activé (relu dans la base) ; valeur
      // permise. Vérifiées avant toute écriture (itemOptionsError, la même
      // règle que item.create et la connexion Claude)
      const optionsError = itemOptionsError(item.list_type, { priorityEnabled: item.list_priority_enabled === 1, dueEnabled: item.list_due_enabled === 1 }, op);
      if (optionsError) throw new OpError(400, optionsError);
      checkWishFields(isWishList(item.list_type), op);
      checkEanForList(isShoppingList(item.list_type), op);
      const ean = op.ean === undefined ? item.ean : eanOf(op.ean);
      const priority = op.priority === undefined ? item.priority : priorityOf(op.priority);
      const dueDate = op.dueDate === undefined ? item.due_date : dueDateOf(op.dueDate);
      // Répétition : effacer l'échéance arrête la répétition ; une tâche qui
      // se répète garde toujours une échéance
      const repeat = op.repeat !== undefined ? op.repeat : op.dueDate === null ? null : item.repeat ?? null;
      if (repeat !== null && !dueDate) throw new OpError(400, REPEAT_NEEDS_DUE);
      // Sous-tâche : ranger la tâche sous une autre (parentId) ou l'en
      // sortir (null). Regroupement actif : une sous-tâche ne se répète pas.
      const listRow = { id: item.list_id, type: item.list_type, subtasks_enabled: item.list_subtasks_enabled };
      const newParent = parentFor(listRow, item.id, op.parentId);
      const parentId = newParent === undefined ? item.parent_id ?? null : newParent?.id ?? null;
      const parent = newParent !== undefined ? newParent : nests(item) ? parentRow(item) : null;
      if (parent && repeat !== null) throw new OpError(400, SUBTASK_NO_REPEAT);
      // Attribution : vérifiée avant toute écriture (absente : inchangée)
      const before = assignmentOf(item);
      let assignment = assignmentFor(item.list_type, item.list_assign_enabled === 1, item.list_id, op, before, repeat) ?? before;
      // Plus de répétition : « chacun son tour » redevient « une personne » (celle de cette fois)
      if (assignment.mode === 'turn' && repeat === null) assignment = { mode: 'one', people: [], assignedTo: assignment.assignedTo };
      const assignedTo = assignment.assignedTo;
      // Heure et rappel : effacer l'échéance efface l'heure ; effacer
      // l'heure efface le rappel (comme la répétition)
      const dueTime = op.dueTime !== undefined ? op.dueTime : op.dueDate === null ? null : item.due_time ?? null;
      const remindBefore = op.remindBefore !== undefined ? op.remindBefore : dueTime === null ? null : item.remind_before ?? null;
      if (dueTime !== null && !dueDate) throw new OpError(400, TIME_NEEDS_DUE);
      if (remindBefore !== null && dueTime === null) throw new OpError(400, REMIND_NEEDS_TIME);
      const name = op.name === undefined ? item.name : itemName(op.name);
      const qty = op.quantity === undefined ? item.quantity : quantity(op.quantity);
      const text = op.note === undefined ? item.note : note(op.note);
      const link = op.link === undefined ? item.link : linkOf(op.link);
      const priceCents = op.priceCents === undefined ? item.price_cents : priceOf(op.priceCents);
      let aisleId = item.aisle_id;
      if (op.aisleId !== undefined && isShoppingList(item.list_type) && !multi) {
        if (op.aisleId !== null && !parseId(op.aisleId)) throw new OpError(400, 'ops.rayonInconnu');
        // Un rayon désactivé peut être gardé, pas choisi ; seulement un
        // rayon proposé à la liste (commun ou de son magasin)
        const wanted = op.aisleId === null ? null : parseId(op.aisleId);
        if (wanted !== item.aisle_id) aisleId = offeredAisleOrNull(wanted, item.list_store_id)?.id ?? null;
      }
      let storeId = item.store_id;
      if (op.storeId !== undefined && multi) {
        // Un magasin désactivé ou retiré du « multi » peut être gardé, pas choisi
        const wanted = op.storeId === null ? null : parseId(op.storeId);
        if (wanted !== item.store_id) storeId = chosenStore(op.storeId, item.list_store_id);
      }
      if ([op.name, op.quantity, op.note, op.aisleId, op.storeId, op.priority, op.dueDate, op.repeat, op.assignedTo, op.assignMode, op.assignPeople, op.dueTime, op.remindBefore, op.ean, op.link, op.priceCents, op.parentId].every((value) => value === undefined)) {
        throw new OpError(400, 'ops.rienAModifier');
      }
      const now = nowIso();
      // Ordre manuel : rangée sous une autre principale, la tâche va à la fin
      // de ses sous-tâches ; sortie, elle n'a plus de place
      const moved = newParent !== undefined && (newParent?.id ?? null) !== (item.parent_id ?? null);
      const position = !moved ? item.position ?? null : newParent ? lastPosition(newParent) : null;
      db.prepare('UPDATE items SET name = ?, quantity = ?, note = ?, aisle_id = ?, store_id = ?, priority = ?, due_date = ?, repeat = ?, assigned_to = ?, assign_mode = ?, assign_people = ?, due_time = ?, remind_before = ?, ean = ?, link = ?, price_cents = ?, parent_id = ?, position = ?, updated_at = ? WHERE id = ?')
        .run(name, qty, text, aisleId, storeId, priority, dueDate, repeat, assignedTo, assignment.mode, formatPeople(assignment.people), dueTime, remindBefore, ean, link, priceCents, parentId, position, now, item.id);
      // Tâche à faire rangée sous une principale cochée : celle-ci se décoche
      if (newParent && item.checked !== 1) reopenParent(newParent, now);

      // Historique : listes de courses seulement (une liste « multi » en est une)
      if (multi) {
        if (name !== item.name) remember(name, { storeId, count: 0 });
        else if (storeId !== item.store_id) saveHistory(moveUse(historyOf(name), { name, from: item.store_id, to: storeId, now: nowIso() }));
      } else if (isShoppingList(item.list_type) && (name !== item.name || aisleId !== item.aisle_id)) {
        remember(name, { storeId: item.list_store_id, aisleId, count: 0 });
      }
      news.log(item.list_id, user.id, 'update', [item.id]);
      // Tâche attribuée à quelqu'un d'autre (pas à soi, pas inchangée) :
      // « Léa vous a attribué une tâche » (server/notify.js)
      const already = new Set(assigneesOf(asItem(before)));
      for (const userId of assigneesOf(asItem(assignment))) {
        if (!already.has(userId)) ctx.notify?.assigned({ listId: item.list_id, itemId: item.id, userId, actorId: user.id });
      }
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Cocher ou décocher un article
    'item.check'(user, op) {
      const item = itemForEditor(user, op.itemId);
      if (typeof op.checked !== 'boolean') throw new OpError(400, 'ops.valeurCocheeInvalide');
      checkReceived(user, item, item.list_owner_id);
      // Tâche qui se répète (liste de tâches, échéance activée) : cochée, elle
      // revient décochée à la date suivante, au lieu d'aller dans « Terminés ».
      // nextDue : la date calculée par le téléphone (public/js/repeat.js, son
      // « aujourd'hui » au moment du geste, hors ligne compris), vérifiée ici.
      // Sans elle (Claude, ancienne version), ou si elle ne tombe plus sur la
      // règle (changée entre-temps par quelqu'un d'autre), le serveur la
      // calcule : le coché n'est jamais perdu.
      if (op.nextDue !== undefined && !isDueDate(op.nextDue)) throw new OpError(400, BAD_NEXT_DUE);
      if (op.checked && repeatsNow(item)) {
        const proposed = op.nextDue;
        const next = proposed !== undefined && proposed > item.due_date && isOccurrence(item.repeat, proposed, item.due_date)
          ? proposed
          : nextDue(item.repeat, item.due_date, serverToday(new Date(ctx.now())));
        // Chacun son tour (liste dont l'attribution est activée) : la fois
        // suivante est pour la personne qui suit, dans l'ordre, celle qui a
        // coché (ou, si elle n'est pas dans le tour, celle de cette fois)
        const turn = item.assign_mode === 'turn' && item.list_assign_enabled === 1;
        const nextPerson = turn ? turnAfterCheck(parsePeople(item.assign_people), item.assigned_to, user.id) : item.assigned_to ?? null;
        const at = nowIso();
        db.prepare('UPDATE items SET due_date = ?, assigned_to = ?, checked = 0, checked_at = NULL, updated_at = ? WHERE id = ?').run(next, nextPerson, at, item.id);
        // Sous-tâches (regroupement actif) : toutes décochées pour la fois
        // suivante (une check-list qui se répète)
        if (nests(item)) {
          for (const child of childRows(item)) {
            if (child.checked === 1) db.prepare('UPDATE items SET checked = 0, checked_at = NULL, updated_at = ? WHERE id = ?').run(at, child.id);
          }
        }
        news.log(item.list_id, user.id, 'check', [item.id]);
        // « C'est votre tour » (server/notify.js), jamais à la personne qui a coché
        if (turn && nextPerson != null) ctx.notify?.assigned({ listId: item.list_id, itemId: item.id, userId: nextPerson, actorId: user.id, turn: true });
        changed(item.list_id);
        return { item: describeItem(q.item.get(item.id)), repeated: next, ...(turn ? { nextPerson } : {}) };
      }
      // Date du coché : posée au premier coché (un second « cocher » la
      // garde), effacée au décoché
      const now = nowIso();
      const setChecked = db.prepare('UPDATE items SET checked = ?, checked_at = CASE WHEN ? = 1 THEN COALESCE(checked_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?');
      setChecked.run(op.checked ? 1 : 0, op.checked ? 1 : 0, now, now, item.id);
      // Sous-tâches (regroupement actif) : cocher une principale coche
      // aussi ses sous-tâches à faire (children : celles cochées ici, pour
      // « Annuler ») ; décocher une sous-tâche décoche sa principale cochée.
      // Une principale ne se coche jamais toute seule.
      const children = [];
      if (nests(item)) {
        if (op.checked) {
          for (const child of childRows(item)) {
            if (child.checked === 1) continue;
            setChecked.run(1, 1, now, now, child.id);
            children.push(child.id);
          }
        } else {
          reopenParent(parentRow(item), now);
        }
      }
      news.log(item.list_id, user.id, op.checked ? 'check' : 'uncheck', [item.id]);
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)), ...(children.length ? { children } : {}) };
    },

    // Ordre manuel des sous-tâches (décisions du 17 novembre 2026) :
    // déplacer une sous-tâche juste après afterId (une autre sous-tâche de la
    // même principale) ou en premier (afterId null). Les places de la
    // principale sont renumérotées 1, 2, 3… à partir de l'ordre du serveur
    // (deux déplacements en même temps : le dernier arrivé l'emporte, rien
    // ne se perd). Pas de Nouveautés : rien n'est ajouté ni changé.
    'item.move'(user, op) {
      const item = itemForEditor(user, op.itemId);
      const parent = nests(item) ? parentRow(item) : null;
      if (!parent) throw new OpError(400, NOT_A_SUBTASK);
      if (op.afterId !== null && !isUuid(op.afterId)) throw new OpError(400, BAD_PLACE);
      const siblings = childRows(parent).map(asOrdered);
      const order = reorderedIds(siblings, item.id, op.afterId);
      if (!order) throw new OpError(400, BAD_PLACE);
      const now = nowIso();
      const before = new Map(siblings.map((child) => [child.id, child.position]));
      const set = db.prepare('UPDATE items SET position = ?, updated_at = ? WHERE id = ?');
      order.forEach((id, index) => {
        if (before.get(id) !== index + 1) set.run(index + 1, now, id);
      });
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)) };
    },

    // Supprimer un article (suppression logique ; l'historique reste). Sa
    // photo est gardée jusqu'au nettoyage (30 jours) : « Annuler » la retrouve.
    // Sous-tâches (regroupement actif) : une principale part avec ses
    // sous-tâches, à la même date (« Annuler » les ramène ensemble).
    'item.delete'(user, op) {
      const item = itemForEditor(user, op.itemId);
      const now = nowIso();
      const ids = [item.id, ...(nests(item) ? childRows(item).map((child) => child.id) : [])];
      const remove = db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?');
      for (const id of ids) remove.run(now, now, id);
      news.log(item.list_id, user.id, 'delete', ids);
      changed(item.list_id);
      return {};
    },

    // Remettre un article supprimé (« Annuler »), avec sa photo, tant qu'il
    // n'a pas été effacé par le nettoyage. Membres de la liste seulement.
    'item.restore'(user, op) {
      const item = q.deletedItemForMember.get({ userId: user.id, itemId: requireUuid(op.itemId) });
      if (!item) throw new OpError(404, ITEM_NOT_FOUND);
      requireEdit(user, item);
      // « Annuler » une suppression : rien dans le journal (ni nouveauté, ni
      // suppression ; décision du 30 octobre 2026)
      // Sous-tâches : celles supprimées avec cette tâche (même date) reviennent
      // avec elle. Une sous-tâche dont la principale reste supprimée revient
      // comme une tâche ordinaire.
      const now = nowIso();
      const children = db.prepare('SELECT id FROM items WHERE parent_id = ? AND list_id = ? AND deleted_at = ?').pluck().all(item.id, item.list_id, item.deleted_at);
      const restore = db.prepare('UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?');
      restore.run(now, item.id);
      for (const id of children) restore.run(now, id);
      if (item.parent_id && !presentItem(item.list_id, item.parent_id)) {
        db.prepare('UPDATE items SET parent_id = NULL WHERE id = ?').run(item.id);
      }
      changed(item.list_id);
      return { item: describeItem(q.item.get(item.id)), ...(children.length ? { children } : {}) };
    },

    // --- Nouveautés (server/news.js) : propres à chaque personne ---
    // Tout membre de la liste, invité en lecture seule compris (ce n'est pas
    // une modification de la liste) ; non-membre : « Liste introuvable ».

    // « Vu » : mon repère de lecture monte jusqu'à upTo (numéro du dernier
    // événement connu du téléphone) ; jamais vers le bas, rejouable sans
    // effet (file d'attente hors ligne)
    'list.seen'(user, op) {
      const list = listForMember(user, op.listId);
      if (!Number.isSafeInteger(op.upTo) || op.upTo < 0) throw new OpError(400, 'ops.repereLectureInvalide');
      if (news.markSeen(list.id, user.id, op.upTo)) changedForMe(list.id);
      return {};
    },

    // « Ne plus me signaler cette liste » (muted: true) / « Signaler cette liste »
    'list.mute'(user, op) {
      const list = listForMember(user, op.listId);
      if (typeof op.muted !== 'boolean') throw new OpError(400, 'ops.reglageSourdineInvalide');
      if (news.setMuted(list.id, user.id, op.muted)) changedForMe(list.id);
      return {};
    },

    // Réglages du compte : « Nouveautés » (enabled), « Signaler les éléments
    // cochés » (checks)
    'account.news'(user, op) {
      for (const [value, key] of [[op.enabled, 'ops.reglageNouveautesInvalide'], [op.checks, 'ops.reglageSignalerCochesInvalide']]) {
        if (value !== undefined && typeof value !== 'boolean') throw new OpError(400, key);
      }
      if (op.enabled === undefined && op.checks === undefined) throw new OpError(400, 'ops.rienAModifier');
      if (news.setSettings(user.id, { enabled: op.enabled, checks: op.checks })) changedForMe(null);
      return {};
    },
  };

  // Opérations des notes (server/notes.js)
  for (const [type, handler] of Object.entries(notes.handlers)) handlers[type] = handler;
  // Opérations de la page Notifications (server/inbox.js) : lire, effacer
  for (const [type, handler] of Object.entries(inboxHandlers(inbox, { OpError, now: nowIso }))) handlers[type] = handler;

  // --- Lot d'opérations (POST /api/ops) ---
  //
  // Les opérations sont appliquées dans l'ordre, chacune dans un bloc
  // indivisible. Le résultat de chacune est enregistré avec son identifiant :
  // une opération renvoyée une deuxième fois (après une coupure réseau) n'est
  // pas appliquée de nouveau, on renvoie simplement le premier résultat.

  const findApplied = db.prepare('SELECT * FROM applied_ops WHERE id = ?');
  const saveApplied = db.prepare('INSERT INTO applied_ops (id, user_id, result, applied_at) VALUES (?, ?, ?, ?)');

  // Résultat d'une opération refusée : error, le texte en français (tel que
  // le reçoit Claude) ; code, le nom de ce texte (le téléphone reconnaît
  // ainsi un refus, quelle que soit la langue) ; params, ses valeurs s'il en
  // a. La route POST /api/ops traduit error dans la langue de la requête et
  // retire params (voir server/routes/lists.js).
  function refusal(id, status, key, params = {}) {
    return { id, status, error: translate('fr', key, params), code: key, ...(Object.keys(params).length ? { params } : {}) };
  }

  function applyOne(user, op) {
    if (!op || typeof op !== 'object' || Array.isArray(op) || !isUuid(op.id)) {
      return refusal(op?.id ?? null, 400, 'ops.identifiantOperationInvalide');
    }
    const opId = op.id.toLowerCase();
    const previous = findApplied.get(opId);
    if (previous) {
      if (previous.user_id !== user.id) return refusal(opId, 409, 'ops.identifiantOperationDejaUtilise');
      return { ...JSON.parse(previous.result), duplicate: true };
    }

    const handler = Object.hasOwn(handlers, op.type) ? handlers[op.type] : null;
    let result;
    touched.clear();
    touchedMine.clear();
    notes.clearNotify();
    try {
      result = db.transaction(() => {
        if (!handler) throw new OpError(400, 'ops.operationInconnue');
        const value = { id: opId, status: 200, ...handler(user, op) };
        saveApplied.run(opId, user.id, JSON.stringify(value), nowIso());
        return value;
      })();
      notifyTouched(user); // écriture réussie : les membres sont prévenus
      notes.flushNotify();
    } catch (err) {
      touched.clear(); // refus ou panne : rien n'a changé, personne n'est prévenu
      touchedMine.clear();
      notes.clearNotify();
      if (!(err instanceof OpError)) throw err; // vraie panne : erreur 500
      // Un refus est lui aussi mémorisé : renvoyée, l'opération donnera le
      // même refus (sans rien modifier). extra : ce que le refus apporte en
      // plus (note en conflit : sa version actuelle, champ par champ)
      result = { ...refusal(opId, err.status, err.key, err.params), ...(err.extra ?? {}) };
      saveApplied.run(opId, user.id, JSON.stringify(result), nowIso());
    }
    return result;
  }

  function applyOps(user, ops) {
    return ops.map((op) => applyOne(user, op));
  }

  // --- Lectures ---

  // Mes listes, de la plus récemment active à la plus ancienne
  function myLists(user) {
    return q.myLists.all(user.id)
      .sort((a, b) => b.last_activity.localeCompare(a.last_activity))
      .map((list) => describeList(list, user));
  }

  // Une liste avec ses articles groupés et triés ; null si pas membre.
  // locale : langue de l'ordre alphabétique (celle de la requête ; Claude :
  // le français)
  function readList(user, listId, locale = 'fr') {
    if (!isUuid(listId)) return null;
    const list = q.myLists.all(user.id).find((l) => l.id === listId.toLowerCase());
    if (!list) return null;
    const shopping = isShoppingList(list);
    // Rayons de cette liste seulement (communs et de son magasin)
    const aisles = aislesForStore(allAisles(), list.store_id);
    const items = q.liveItems.all(list.id).map(describeItem);
    const byStore = shopping && list.store_id !== null && q.store.get(list.store_id).is_multi === 1;
    const groups = groupItems(items, aisles, shopping, { byStore, stores: q.allStores.all(), locale });
    // Réservations : seulement pour ceux qui ont le droit de les voir ; pour
    // le bénéficiaire, le champ n'existe pas
    const booked = reservations.forList(user, list);
    return { list: describeList(list, user), groups, ...(booked ? { reservations: booked } : {}) };
  }

  // Suggestions d'autocomplétion (même règle que sur le téléphone). Le rayon
  // proposé n'est donné que s'il est encore actif (et, avec une liste,
  // proposé à cette liste : commun ou de son magasin). Avec une liste
  // (listId) : aucune suggestion si ce n'est pas une liste de courses (la
  // liste doit être une des miennes).
  // locale : langue de la requête (ordre alphabétique, à égalité)
  function suggestions(typed, { user, listId, locale = 'fr' } = {}) {
    const list = listId === undefined ? null : listForMember(user, listId);
    if (list && !isShoppingList(list)) return [];
    const aisles = allAisles();
    const activeAisles = new Set((list ? offeredAisles(aisles, list.store_id) : aisles.filter((a) => a.active)).map((a) => a.id));
    return suggest(q.allHistory.all().map(describeHistory), typed, undefined, { locale }).map((entry) => ({
      name: entry.name,
      aisleId: activeAisles.has(entry.aisleId) ? entry.aisleId : null,
      useCount: entry.useCount,
    }));
  }

  // --- Synchronisation : « tout ce qui a changé depuis tel instant » ---
  //
  // Le téléphone envoie l'heure « serverTime » reçue lors de sa synchro
  // précédente (heure du serveur, jamais celle du téléphone). On renvoie :
  // - les listes dont je suis membre modifiées depuis (suppressions comprises),
  //   avec tous leurs articles si la liste elle-même a changé (cas d'une liste
  //   qui vient d'être partagée avec moi) ;
  // - les articles modifiés ou supprimés depuis, dans mes listes ;
  // - listIds : toutes mes listes actuelles (une liste absente de ce tableau
  //   n'est plus accessible : supprimée, ou je n'en suis plus membre) ;
  // - les données de référence et l'historique (changé depuis).
  // Comparaison « >= » : une ligne peut revenir deux fois, jamais être oubliée.
  function changesSince(user, since) {
    const serverTime = nowIso();
    const from = since ?? '';
    const lists = db.prepare(`
      SELECT lists.* FROM lists JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = ?
      WHERE lists.updated_at >= ?
    `).all(user.id, from);
    const items = db.prepare(`
      SELECT items.* FROM items JOIN list_members ON list_members.list_id = items.list_id AND list_members.user_id = ?
      WHERE items.updated_at >= ?
    `).all(user.id, from);
    const seen = new Set(items.map((item) => item.id));
    for (const list of lists) {
      for (const item of db.prepare('SELECT * FROM items WHERE list_id = ?').all(list.id)) {
        if (!seen.has(item.id)) items.push(item);
      }
    }
    // Résumés (articles restants, dernière activité) de mes listes actuelles
    const summaries = new Map(q.myLists.all(user.id).map((l) => [l.id, l]));
    return {
      serverTime,
      lists: lists.map((list) => describeList({ remaining: 0, last_activity: list.updated_at, ...list, ...summaries.get(list.id) }, user)),
      listIds: [...summaries.keys()],
      items: items.map(describeItem),
      stores: describeStores(),
      // Rayons, avec leur magasin (storeId ; null : « Tous les magasins »)
      aisles: q.allAisles.all().map(describeAisle),
      // (lignes utilisées, ou retirées de « Souvent ajoutés », depuis la dernière synchronisation)
      history: db.prepare('SELECT * FROM item_history WHERE last_used_at >= ? OR hidden_at >= ?').all(from, from).map(describeHistory),
      // Comptes actifs (choix des personnes avec qui partager), gardés sur le téléphone pour
      // ouvrir le formulaire de liste sans réseau
      users: activeUsers(),
      // Mes nouveautés, en entier à chaque synchronisation (server/news.js)
      news: news.newsFor(user),
      // Réservations des listes d'envies où ce compte a le droit de les voir,
      // en entier à chaque synchronisation (une libération disparaît donc
      // d'elle-même) ; jamais celles d'une liste dont il est le bénéficiaire
      reservations: reservations.forUser(user),
      // Notes que je vois, mes épingles et mes nouveautés (server/notes.js)
      ...notes.syncFor(user, since),
      // Page Notifications : seulement son empreinte (le téléphone relit la
      // page, GET /api/inbox, quand elle a changé)
      inboxStamp: inbox.stamp(user.id),
    };
  }

  // --- Partage (PUT /api/lists/:id/members, propriétaire seulement) ---
  //
  // userIds : la liste complète des personnes souhaitées. Le propriétaire reste
  // toujours membre. Un compte désactivé ne peut pas être ajouté (mais un
  // membre déjà présent et désactivé depuis peut rester).
  // access (facultatif) : { "<id d'un membre>": "modification" | "lecture" }.
  // Une personne ajoutée sans droit précisé est en lecture seule ; un membre déjà
  // présent sans droit précisé garde le sien. Le propriétaire ne peut pas
  // recevoir de droit (il les a tous).
  function setMembers(user, listId, userIds, access = {}) {
    const list = listForOwner(user, listId);
    if (!Array.isArray(userIds) || userIds.length > 50 || !userIds.every((id) => parseId(id))) {
      throw new OpError(400, 'ops.listePersonnesInvalide');
    }
    if (access === null || typeof access !== 'object' || Array.isArray(access)) throw new OpError(400, 'ops.droitsPersonnesInvalides');
    const wanted = new Set(userIds.map(Number));
    wanted.delete(list.owner_id);
    const rights = new Map();
    for (const [key, value] of Object.entries(access)) {
      const id = parseId(key);
      if (!id || !ACCESS.includes(value)) throw new OpError(400, 'ops.droitsPersonnesInvalides');
      if (id === list.owner_id) throw new OpError(400, 'ops.proprietaireTousDroits');
      if (!wanted.has(id)) throw new OpError(400, 'ops.droitSansPartage');
      rights.set(id, value);
    }
    const before = new Map(q.members.all(list.id).filter((m) => m.id !== list.owner_id).map((m) => [m.id, m.access]));
    const current = new Set(before.keys());
    // Liste d'envies pour un autre compte : le bénéficiaire reste membre, en
    // « Peut modifier » ; le propriétaire ne peut ni le retirer, ni le mettre
    // en lecture seule. Il peut quitter la liste lui-même ; s'il est rajouté,
    // c'est toujours en « Peut modifier ».
    const beneficiary = list.for_user_id ?? null;
    if (beneficiary) {
      if (current.has(beneficiary) && !wanted.has(beneficiary)) throw new OpError(400, 'ops.destinataireNonRetirable');
      if (rights.has(beneficiary) && rights.get(beneficiary) !== 'modification') throw new OpError(400, 'ops.destinataireGardeModifier');
      if (wanted.has(beneficiary)) rights.set(beneficiary, 'modification');
    }

    for (const id of wanted) {
      if (current.has(id)) continue;
      const guest = db.prepare('SELECT id, active FROM users WHERE id = ?').get(id);
      if (!guest || guest.active !== 1) throw new OpError(400, 'ops.utilisateurInconnu');
    }

    const added = [...wanted].filter((id) => !current.has(id));
    const removed = [...current].filter((id) => !wanted.has(id));
    const nameOf = (id) => db.prepare('SELECT username FROM users WHERE id = ?').pluck().get(id);
    // Droits qui changent pour des membres déjà présents
    const changedRights = [...rights].filter(([id, value]) => current.has(id) && before.get(id) !== value);
    db.transaction(() => {
      // Sans droit précisé : lecture seule (valeur par défaut de la base)
      for (const id of added) {
        db.prepare('INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, ?)').run(list.id, id, rights.get(id) ?? 'lecture');
        news.startReading(list.id, id); // son repère démarre à son arrivée
      }
      for (const id of removed) {
        db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?').run(list.id, id);
        news.stopReading(list.id, id);
      }
      for (const [id, value] of changedRights) db.prepare('UPDATE list_members SET access = ? WHERE list_id = ? AND user_id = ?').run(value, list.id, id);
      // Leurs tâches attribuées reviennent à « Personne » : une personne
      // retirée ou en lecture seule ne peut plus les faire (ni les cocher)
      const now = nowIso();
      for (const id of removed) unassign(list.id, id, now);
      for (const [id, value] of changedRights) if (value !== 'modification') unassign(list.id, id, now);
      // La liste « change » : les membres l'apprendront à leur synchronisation
      // (et chacun son droit, dans la description de la liste)
      if (added.length || removed.length || changedRights.length) db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(nowIso(), list.id);
    })();
    // Temps réel : membres actuels, et personnes retirées (leur téléphone
    // apprend ainsi qu'il n'a plus accès à la liste)
    if (added.length || removed.length || changedRights.length) ctx.events?.notifyList(list.id, { alsoUsers: removed });
    for (const id of added) ctx.audit('list_member_added', { user: user.username, list: list.id, member: nameOf(id), access: journalAccess(rights.get(id) ?? 'lecture') });
    for (const id of removed) ctx.audit('list_member_removed', { user: user.username, list: list.id, member: nameOf(id) });
    for (const [id, value] of changedRights) ctx.audit('list_access_changed', { user: user.username, list: list.id, member: nameOf(id), access: journalAccess(value) });
    // Notifications « partage » : ajoutés, droits changés
    for (const id of added) ctx.notify?.sharing({ listId: list.id, userId: id, actorId: user.id, kind: 'added' });
    for (const [id] of changedRights) ctx.notify?.sharing({ listId: list.id, userId: id, actorId: user.id, kind: 'access' });
    return readList(user, list.id).list;
  }

  // Convertir une liste de courses ou de tâches EN liste d'envies
  // (POST /api/lists/:id/wishes, « Modifier la liste », en ligne seulement :
  // jamais par la file d'attente, list.update refuse toujours NOT_TO_WISHES).
  // Propriétaire seulement. Le type et le destinataire sont écrits ensemble,
  // dans une seule transaction : jamais de liste d'envies sans destinataire.
  // body : { forUserId } (un autre compte actif), { forName } (une personne
  // sans compte), ou rien (« Moi ») ; priorityEnabled (facultatif : sans
  // valeur, la liste garde son réglage actuel, rien n'est activé d'office).
  // Toutes les vérifications passent AVANT
  // la moindre écriture : un refus ne change rien.
  // Rien n'est effacé : quantités, échéances, rayons, codes-barres et magasin
  // restent en base (cachés pour une liste d'envies) ; un élément coché
  // devient « Reçu ». Un lien public en cours est arrêté (une liste d'envies
  // n'en a jamais). Aucune réservation n'existe encore.
  function convertToWishes(user, listId, body = {}) {
    const list = listForOwner(user, listId);
    if (isWishList(typeOf(list))) throw new OpError(400, 'ops.dejaEnvies');
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new OpError(400, 'ops.demandeInvalide');
    let forUserId = null;
    let forName = null;
    if (body.forUserId !== undefined && body.forUserId !== null) {
      forUserId = parseId(body.forUserId);
      if (!forUserId || !q.activeUser.get(forUserId)) throw new OpError(400, 'ops.utilisateurInconnu');
      if (forUserId === user.id) throw new OpError(400, 'ops.pourSoiChoisirMoi');
    }
    if (body.forName !== undefined && body.forName !== null) {
      if (forUserId) throw new OpError(400, 'ops.compteOuPersonne');
      forName = forNameOf(body.forName);
    }
    const priorityOn = optionOf(body.priorityEnabled, 'ops.reglagePrioriteInvalide') ?? list.priority_enabled === 1;
    const before = typeOf(list);
    const now = nowIso();
    let share = null;
    // Droit du destinataire avant le changement (notification « partage »)
    const accessBefore = forUserId ? db.prepare('SELECT access FROM list_members WHERE list_id = ? AND user_id = ?').pluck().get(list.id, forUserId) : undefined;
    db.transaction(() => {
      db.prepare('UPDATE lists SET type = ?, for_user_id = ?, for_name = ?, priority_enabled = ?, updated_at = ? WHERE id = ?')
        .run('wishes', forUserId, forName, Number(priorityOn), now, list.id);
      // Le compte destinataire : membre d'office en « Peut modifier », comme
      // à la création (passé en « Peut modifier » s'il était en lecture seule)
      if (forUserId) {
        db.prepare(`INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, 'modification')
          ON CONFLICT(list_id, user_id) DO UPDATE SET access = 'modification'`).run(list.id, forUserId);
        news.startReading(list.id, forUserId);
      }
      share = ctx.shares?.stopForList(list.id) ?? null;
    })();
    ctx.events?.notifyList(list.id);
    if (forUserId && accessBefore !== 'modification') {
      ctx.notify?.sharing({ listId: list.id, userId: forUserId, actorId: user.id, kind: accessBefore === undefined ? 'added' : 'access' });
    }
    ctx.audit('list_type_changed', { user: user.username, list: list.id, before, after: 'wishes' });
    if (share) ctx.audit('public_link_stopped', { user: user.username, list: list.id, share: share.id, reason: 'list converted to a wish list' });
    return { list: describeList(q.myLists.all(user.id).find((l) => l.id === list.id), user) };
  }

  // --- Quitter une liste (POST /api/lists/:id/leave) ---
  //
  // Un membre (contributeur ou invité) retire SA propre appartenance (jamais celle d'un autre : la
  // route ne prend aucun identifiant de personne). Le propriétaire ne peut
  // pas quitter sa liste (403) ; un non-membre reçoit « Liste introuvable »
  // (404), comme partout. Un invité en lecture seule peut quitter. Ses
  // éléments restent dans la liste (ils appartiennent à la liste). Les
  // membres restants et ses propres téléphones sont prévenus en temps réel ;
  // la liste disparaît de ses téléphones à leur synchronisation.
  function leaveList(user, listId) {
    const list = listForMember(user, listId);
    if (list.owner_id === user.id) throw new OpError(403, OWNER_CANNOT_LEAVE);
    db.transaction(() => {
      db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?').run(list.id, user.id);
      news.stopReading(list.id, user.id);
      // Ses tâches attribuées reviennent à « Personne »
      unassign(list.id, user.id, nowIso());
      db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(nowIso(), list.id);
    })();
    ctx.events?.notifyList(list.id, { alsoUsers: [user.id] });
    ctx.audit('list_left', { user: user.username, list: list.id });
    return {};
  }

  // --- Dupliquer une liste (POST /api/lists/:id/duplicate) ---
  //
  // Propriétaire ou contributeur (lecture seule : 403 ;
  // non-membre : 404, comme partout). En une seule transaction (tout ou
  // rien) : une nouvelle liste privée (la personne qui duplique en est la
  // propriétaire, sans partage ni lien public), même type, même magasin,
  // même icône, mêmes réglages de priorité, d'échéance et « Après l'ajout » ;
  // avec withItems (vrai par défaut) : les éléments non supprimés, avec nom,
  // quantité, note, rayon, magasin, priorité, échéance (et sa répétition) et code-barres, tous
  // décochés. Les photos ne
  // sont pas copiées (un fichier ne peut pas faire partie de la transaction,
  // et la copie échapperait au plafond d'envoi des photos). La mémoire des
  // noms suit la création d'éléments habituelle (listes de courses).
  // Journal : identifiants seulement, jamais de nom de liste ni de contenu.
  function duplicateList(user, listId, { name, withItems = true } = {}) {
    const source = listForEditor(user, listId);
    if (isWishList(source)) throw new OpError(400, 'ops.enviesNonDupliquees');
    const title = listName(name);
    if (typeof withItems !== 'boolean') throw new OpError(400, 'ops.reglageCopierInvalide');
    const id = crypto.randomUUID();
    const now = nowIso();
    const items = withItems ? q.liveItems.all(source.id) : [];
    db.transaction(() => {
      db.prepare(`INSERT INTO lists (id, name, type, store_id, owner_id, priority_enabled, due_enabled, assign_enabled, subtasks_enabled, icon, add_mode, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, title, typeOf(source), source.store_id, user.id, source.priority_enabled, source.due_enabled, source.assign_enabled ?? 0, source.subtasks_enabled ?? 0, source.icon, source.add_mode, now, now);
      db.prepare("INSERT INTO list_members (list_id, user_id, access) VALUES (?, ?, 'modification')").run(id, user.id);
      news.startReading(id, user.id);
      const insert = db.prepare(`INSERT INTO items (id, list_id, name, quantity, note, aisle_id, store_id, priority, due_date, repeat, due_time, remind_before, ean, created_by, created_at, updated_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      // Nouveaux identifiants ; les sous-tâches suivent leur principale
      // (le lien est posé une fois tous les éléments copiés)
      const newIds = new Map(items.map((item) => [item.id, crypto.randomUUID()]));
      for (const item of items) {
        insert.run(newIds.get(item.id), id, item.name, item.quantity, item.note, item.aisle_id, item.store_id, item.priority, item.due_date, item.repeat ?? null, item.due_time ?? null, item.remind_before ?? null, item.ean, user.id, now, now);
        // Comme un ajout : la mémoire des noms (listes de courses seulement)
        if (isShoppingList(source)) remember(item.name, { storeId: source.is_multi === 1 ? item.store_id : source.store_id, aisleId: item.aisle_id, count: 1 });
      }
      const link = db.prepare('UPDATE items SET parent_id = ?, position = ? WHERE id = ?');
      for (const item of items) if (item.parent_id && newIds.has(item.parent_id)) link.run(newIds.get(item.parent_id), item.position ?? null, newIds.get(item.id));
    })();
    ctx.events?.notifyList(id);
    ctx.audit('list_duplicated', { user: user.username, list: id, source: source.id, items: items.length });
    return { list: describeList(q.myLists.all(user.id).find((l) => l.id === id), user), copied: items.length };
  }

  // Mode scan, « mes produits » : nom et note d'un article qui porte ce
  // code-barres, parmi les listes dont le compte est membre (jamais celles
  // des autres comptes), articles supprimés compris tant qu'ils ne sont pas
  // effacés par le nettoyage (30 jours). Le plus récent d'abord. Seuls le
  // nom et la note sortent : ni identifiant, ni nom de liste. null si aucun.
  function knownProduct(user, ean) {
    const row = db.prepare(`
      SELECT items.name, items.note FROM items
      JOIN list_members ON list_members.list_id = items.list_id AND list_members.user_id = ?
      WHERE items.ean = ?
      ORDER BY items.updated_at DESC, items.created_at DESC
      LIMIT 1
    `).get(user.id, ean);
    return row ? { name: row.name, note: row.note ?? '' } : null;
  }

  // --- Nettoyage périodique ---
  // Efface pour de bon ce qui est marqué supprimé depuis plus de 30 jours
  // (les articles d'une liste effacée partent avec elle), ainsi que la trace
  // des opérations de plus de 30 jours.
  // Les fichiers photo des articles effacés le sont aussi (y compris ceux
  // des articles d'une liste effacée), puis un ménage retire les fichiers dont
  // l'article n'existe plus (coupure pendant un envoi, par exemple).
  function purgeDeleted() {
    const limit = new Date(ctx.now() - PURGE_AFTER_DAYS * DAY).toISOString();
    const result = db.transaction(() => {
      const photos = db.prepare(`
        SELECT items.id FROM items JOIN lists ON lists.id = items.list_id
        WHERE items.photo_at IS NOT NULL
          AND ((items.deleted_at IS NOT NULL AND items.deleted_at < :limit)
            OR (lists.deleted_at IS NOT NULL AND lists.deleted_at < :limit))
      `).pluck().all({ limit });
      return {
        photoIds: photos,
        items: db.prepare('DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes,
        lists: db.prepare('DELETE FROM lists WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes,
        ops: db.prepare('DELETE FROM applied_ops WHERE applied_at < ?').run(limit).changes,
      };
    })();
    const { photoIds, ...counts } = result;
    if (ctx.photos) {
      for (const id of photoIds) ctx.photos.remove(id);
      const known = db.prepare('SELECT 1 FROM items WHERE id = ?').pluck();
      counts.photos = photoIds.length + ctx.photos.sweep((id) => known.get(id) === 1, ctx.now());
    }
    return counts;
  }

  // --- Photos (routes /api/items/:id/photo) ---

  // L'article (non supprimé), si le compte est membre de sa liste ; sinon null
  function photoItem(user, itemId) {
    if (!isUuid(itemId)) return null;
    return q.memberItem.get({ userId: user.id, itemId: itemId.toLowerCase() }) ?? null;
  }

  // Note la date de la photo (ou son retrait : null). updated_at change : les
  // autres téléphones l'apprennent à leur synchronisation.
  // user : la personne qui ajoute, change ou retire la photo (journal des
  // nouveautés : une modification)
  function setPhotoDate(itemId, photoAt, user) {
    db.prepare('UPDATE items SET photo_at = ?, updated_at = ? WHERE id = ?').run(photoAt, nowIso(), itemId);
    const item = q.item.get(itemId);
    if (user) news.log(item.list_id, user.id, 'update', [item.id]);
    ctx.events?.notifyList(item.list_id); // temps réel, après l'écriture
    return describeItem(item);
  }

  // Comptes actifs, pour choisir avec qui partager une liste. Ordre de
  // départ, toujours le même (synchronisation) : chaque écran les range
  // ensuite dans sa langue (compareNames).
  function activeUsers() {
    return db.prepare('SELECT id, username, display_name FROM users WHERE active = 1').all()
      .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name }))
      .sort((a, b) => compareText(a.displayName, b.displayName, { locale: 'fr' }));
  }

  // --- Corbeille des listes (GET /api/lists/deleted, POST /api/lists/:id/restore) ---
  // Une liste supprimée (list.delete : suppression logique, deleted_at) reste
  // en base 30 jours, puis le nettoyage (purgeDeleted) l'efface pour de bon.
  // Pendant ces 30 jours, son PROPRIÉTAIRE, et lui seul, la voit dans sa
  // corbeille et peut la restaurer : jamais un membre, jamais l'Admin (qui
  // n'a aucun droit sur les listes des autres). La limite est EXACTEMENT celle
  // du nettoyage (deleted_at >= maintenant - 30 jours), pour que l'écran et
  // le nettoyage soient toujours d'accord.
  const purgeLimit = () => new Date(ctx.now() - PURGE_AFTER_DAYS * DAY).toISOString();
  const myDeletedList = db.prepare(`
    SELECT * FROM lists
    WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ?
  `);

  // Mes listes supprimées, de la plus récente à la plus ancienne. Réponse
  // construite champ par champ : nom, type, icône, nombre d'éléments, date de
  // suppression, date et jours restants avant l'effacement définitif.
  function deletedLists(user) {
    const now = ctx.now();
    const rows = db.prepare(`
      SELECT lists.id, lists.name, lists.type, lists.icon, lists.deleted_at,
        (SELECT COUNT(*) FROM items WHERE items.list_id = lists.id AND items.deleted_at IS NULL) AS item_count
      FROM lists
      WHERE lists.owner_id = ? AND lists.deleted_at IS NOT NULL AND lists.deleted_at >= ?
      ORDER BY lists.deleted_at DESC
    `).all(user.id, purgeLimit());
    return rows.map((row) => {
      const purgeAt = Date.parse(row.deleted_at) + PURGE_AFTER_DAYS * DAY;
      return {
        id: row.id,
        name: row.name,
        type: typeOf(row),
        icon: isListIcon(row.icon) ? row.icon : '', // icône inconnue ou vide : celle du type
        itemCount: row.item_count,
        deletedAt: row.deleted_at,
        purgeAt: new Date(purgeAt).toISOString(),
        // « Suppression définitive dans N jours » (au moins 1 : le nettoyage
        // passe toutes les heures)
        daysLeft: Math.max(1, Math.ceil((purgeAt - now) / DAY)),
      };
    });
  }

  // Restaurer une de mes listes supprimées : elle revient telle qu'elle était
  // (éléments, membres et leurs droits, réglages, photos, réservations des
  // listes d'envies : rien de tout cela n'a été effacé). Ne revient pas : le
  // lien public (arrêté à la suppression ; le propriétaire en recrée un) et le
  // journal des nouveautés (effacé à la suppression ; chaque membre repart de
  // « tout vu »). updated_at change : les téléphones des membres la
  // retrouvent à leur synchronisation, prévenus en temps réel. Liste d'un
  // autre, inconnue, pas supprimée (déjà restaurée) ou déjà effacée : la même
  // réponse, 404 « Liste introuvable. ».
  function restoreList(user, listId) {
    const list = isUuid(listId) ? myDeletedList.get(listId.toLowerCase(), user.id, purgeLimit()) : null;
    if (!list) throw new OpError(404, LIST_NOT_FOUND);
    const now = nowIso();
    db.transaction(() => {
      db.prepare('UPDATE lists SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, list.id);
      for (const userId of db.prepare('SELECT user_id FROM list_members WHERE list_id = ?').pluck().all(list.id)) {
        news.startReading(list.id, userId);
      }
    })();
    ctx.events?.notifyList(list.id);
    ctx.audit('list_restored', { user: user.username, list: list.id });
    return { list: describeList(q.myLists.all(user.id).find((l) => l.id === list.id), user) };
  }

  return {
    applyOps, myLists, readList, suggestions, changesSince, setMembers, convertToWishes, duplicateList, leaveList, purgeDeleted, activeUsers, news,
    deletedLists, restoreList, activeAisles, activeStoreChoices,
    photoItem, setPhotoDate, nowIso, OpError, listForMember, listForEditor, knownProduct, notes,
  };
}

export { OpError };
