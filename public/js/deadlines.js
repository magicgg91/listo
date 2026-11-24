// Écran « Échéances » : les tâches à faire qui ont une échéance, toutes
// listes confondues, rangées par moment (décision du 11 novembre 2026).
//
// Ce module ne fait que des calculs sur la copie locale (aucune page, aucun
// réseau) : il est testé automatiquement (test/deadlines.test.js).
//
// Tâches retenues :
// - dans une liste de TÂCHES dont l'option « Échéance » est activée (jamais
//   une liste de courses ni une liste d'envies, pour personne) ;
// - non cochées, avec une échéance ;
// - seulement les listes de la copie locale, c'est-à-dire celles dont on est
//   membre (le serveur n'envoie que celles-là).
//
// Groupes : « En retard », « Aujourd'hui », « Demain », « Cette semaine »
// (jusqu'au dimanche), « Plus tard ». Dans un groupe : la date la plus
// proche d'abord, puis la priorité élevée, puis l'ordre alphabétique.
//
// Pastilles du bouton « Échéances » (24 novembre 2026) : une rouge pour les
// tâches en retard, une verte pour celles du jour (ensemble, comme le résumé
// de 8 h des notifications), sans celles attribuées à quelqu'un d'autre.
//
// Attribution (décisions du 11 novembre 2026) : « Les miennes » ne garde que
// les tâches qui me sont attribuées ; « Toutes » montre tout. Une
// attribution ne compte que si l'option est activée pour la liste.

import { assigneesOf } from './assign.js';
import { typeOf } from './list-types.js';
import { listOptions } from './store.js';
import { addDays, todayKey } from './format.js';
import { compareNames } from './sorting.js';
import { matches } from './search.js';
import { compareDue, isLate, nowTime } from './due-time.js';
import { t } from './i18n.js';

// Groupes, dans l'ordre : [clé, titre] (fonction : les titres sont lus dans
// la langue choisie)
export const deadlineGroups = () => [
  ['late', t('echeances.groupe.retard')],
  ['today', t('echeances.groupe.aujourdhui')],
  ['tomorrow', t('echeances.groupe.demain')],
  ['week', t('echeances.groupe.semaine')],
  ['later', t('echeances.groupe.plusTard')],
];

// Dimanche de la semaine de « today » (semaine du lundi au dimanche)
export function endOfWeek(today) {
  const [y, m, d] = today.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return addDays(today, day === 0 ? 0 : 7 - day);
}

// Groupe d'une échéance (« AAAA-MM-JJ », heure « HH:MM » facultative) par
// rapport au jour et à l'heure donnés : une tâche du jour dont l'heure est
// dépassée est « En retard »
export function deadlineGroup(dueDate, today, dueTime = null, now = nowTime()) {
  if (isLate(dueDate, dueTime, today, now)) return 'late';
  if (dueDate === today) return 'today';
  const tomorrow = addDays(today, 1);
  if (dueDate === tomorrow) return 'tomorrow';
  return dueDate <= endOfWeek(today) ? 'week' : 'later';
}

// La liste compte-t-elle pour « Échéances » ?
export function listHasDeadlines(list) {
  return Boolean(list) && typeOf(list) === 'tasks' && listOptions(list).due;
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

// Personnes à qui la tâche est en ce moment ([] : personne, ou attribution
// désactivée pour sa liste) : une, plusieurs, ou celle de cette fois
// (chacun son tour) ; assign.js
export const assigneesFor = (item, list) => (listOptions(list).assign ? assigneesOf(item) : []);

// Tâches retenues, chacune avec sa liste : [{ item, list }], triées.
// keep(item, list) : filtre de plus, facultatif.
function collect(state, keep = () => true) {
  const found = [];
  for (const item of state.items.values()) {
    if (item.checked || !item.dueDate) continue;
    const list = state.lists.get(item.listId);
    if (!listHasDeadlines(list) || !keep(item, list)) continue;
    found.push({ item, list });
  }
  const priority = (entry) => (listOptions(entry.list).priority ? PRIORITY_RANK[entry.item.priority] ?? 1 : 1);
  return found.sort((a, b) => compareDue(a.item.dueDate, a.item.dueTime, b.item.dueDate, b.item.dueTime)
    || priority(a) - priority(b)
    || compareNames(a.item.name, b.item.name));
}

// Groupes à afficher (vides retirés) : [{ key, title, entries }].
// query : texte cherché (nom de la tâche), facultatif ; mine : seulement les
// tâches attribuées à me (« Les miennes »).
export function computeDeadlines(state, { today = todayKey(), query = '', mine = false, me = null, now = nowTime() } = {}) {
  const keep = mine ? (item, list) => assigneesFor(item, list).includes(me) : undefined;
  const entries = collect(state, keep).filter((entry) => !query || matches(entry.item.name, query));
  return deadlineGroups()
    .map(([key, title]) => ({ key, title, entries: entries.filter((entry) => deadlineGroup(entry.item.dueDate, today, entry.item.dueTime, now) === key) }))
    .filter((group) => group.entries.length > 0);
}

// --- Choix « Toutes / Les miennes » (écran Échéances et tuile de l'Accueil) ---

// Le choix n'est proposé que si une de mes listes de tâches a l'attribution
// activée ; sinon, « Toutes » quel que soit le choix gardé
export const scopeOffered = (state) => [...state.lists.values()].some((list) => listOptions(list).assign);

// Choix « Les miennes » retenu sur cet appareil (jamais envoyé au serveur ;
// stockage indisponible : « Toutes » pour la visite)
export const SCOPE_KEY = 'listo-echeances-miennes';
export function loadDeadlineScope(storage = () => globalThis.localStorage) {
  try {
    return storage().getItem(SCOPE_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveDeadlineScope(mine, storage = () => globalThis.localStorage) {
  try {
    if (mine) storage().setItem(SCOPE_KEY, '1');
    else storage().removeItem(SCOPE_KEY);
  } catch {
    // stockage indisponible : le choix vaut pour la visite
  }
}

// « Les miennes » vraiment appliqué : choisi ET proposé
export const effectiveMine = (state, mine) => Boolean(mine) && scopeOffered(state);

// --- Tuile « Échéances » de l'Accueil (décision du 23 novembre 2026) ---
// Trois lignes : « En retard », « Aujourd'hui », « Plus tard » (Demain,
// Cette semaine et Plus tard de l'écran, réunis). Les nombres sont ceux de
// l'écran Échéances, avec le même choix « Toutes / Les miennes » : ils sont
// calculés par computeDeadlines, jamais recomptés à part.
export const HOME_DEADLINE_ROWS = [
  ['late', ['late']],
  ['today', ['today']],
  ['later', ['tomorrow', 'week', 'later']],
];

// { late, today, later } : nombre de tâches de chaque ligne de la tuile
export function deadlineCounts(state, { today = todayKey(), mine = false, me = null, now = nowTime() } = {}) {
  const groups = computeDeadlines(state, { today, mine, me, now });
  const size = (key) => groups.find((group) => group.key === key)?.entries.length ?? 0;
  return Object.fromEntries(HOME_DEADLINE_ROWS.map(([row, keys]) => [row, keys.reduce((sum, key) => sum + size(key), 0)]));
}

// Section de l'écran Échéances à montrer pour une ligne de la tuile : la
// première qui a des tâches (« Plus tard » : Demain, sinon Cette semaine,
// sinon Plus tard), ou null
export function deadlineSectionFor(state, row, { today = todayKey(), mine = false, me = null, now = nowTime() } = {}) {
  const keys = HOME_DEADLINE_ROWS.find(([name]) => name === row)?.[1] ?? [];
  const present = new Set(computeDeadlines(state, { today, mine, me, now }).map((group) => group.key));
  return keys.find((key) => present.has(key)) ?? null;
}

// Pastilles du bouton « Échéances » (décision du 24 novembre 2026 : deux
// pastilles au lieu d'une) : { late, today }, le nombre de tâches en retard
// (rouge) et le nombre de tâches du jour (verte), les miennes et celles de
// personne (pas celles attribuées à quelqu'un d'autre). Mêmes groupes que
// l'écran : une tâche du jour dont l'heure est passée est « En retard »
// (deadlineGroup) ; ensemble, ce sont toujours les tâches dont l'échéance
// est aujourd'hui ou avant.
export function deadlineBadges(state, today = todayKey(), me = null, now = nowTime()) {
  const keep = (item, list) => { const who = assigneesFor(item, list); return who.length === 0 || who.includes(me); };
  const counts = { late: 0, today: 0 };
  for (const { item } of collect(state, keep)) {
    const group = deadlineGroup(item.dueDate, today, item.dueTime, now);
    if (group === 'late' || group === 'today') counts[group] += 1;
  }
  return counts;
}

// Texte d'une pastille : le nombre, « 99+ » au-delà de 99
export const badgeText = (count) => (count > 99 ? '99+' : String(count));

// Nom lu du bouton (ou de l'entrée du menu) « Échéances » : seulement les
// nombres qui ne sont pas nuls (« Échéances, 2 en retard, 1 aujourd'hui »),
// sinon « Échéances ». Une phrase entière par cas (jamais de morceaux
// assemblés) ; les pastilles elles-mêmes sont cachées aux lecteurs d'écran.
export function deadlinesLabel({ late = 0, today = 0 } = {}) {
  if (late && today) return t('navigation.echeances.pastilles', { late, today });
  if (late) return t('navigation.echeances.pastille.retard', { count: late });
  if (today) return t('navigation.echeances.pastille.aujourdhui', { count: today });
  return t('navigation.echeances');
}
