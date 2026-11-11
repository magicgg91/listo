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
// Pastille du bouton « Échéances » : tâches en retard + tâches du jour
// (comme le résumé de 8 h des notifications), sans celles attribuées à
// quelqu'un d'autre.
//
// Attribution (décisions du 11 novembre 2026) : « Les miennes » ne garde que
// les tâches qui me sont attribuées ; « Toutes » montre tout. Une
// attribution ne compte que si l'option est activée pour la liste.

import { typeOf } from './list-types.js';
import { listOptions } from './store.js';
import { addDays, todayKey } from './format.js';
import { compareNames } from './sorting.js';
import { matches } from './search.js';
import { compareDue, isLate, nowTime } from './due-time.js';

export const DEADLINE_GROUPS = [
  ['late', 'En retard'],
  ['today', "Aujourd'hui"],
  ['tomorrow', 'Demain'],
  ['week', 'Cette semaine'],
  ['later', 'Plus tard'],
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

// Personne à qui la tâche est attribuée (null : personne, ou attribution
// désactivée pour sa liste)
export const assigneeOf = (item, list) => (listOptions(list).assign ? item.assignedTo ?? null : null);

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
  const keep = mine ? (item, list) => assigneeOf(item, list) === me : undefined;
  const entries = collect(state, keep).filter((entry) => !query || matches(entry.item.name, query));
  return DEADLINE_GROUPS
    .map(([key, title]) => ({ key, title, entries: entries.filter((entry) => deadlineGroup(entry.item.dueDate, today, entry.item.dueTime, now) === key) }))
    .filter((group) => group.entries.length > 0);
}

// Nombre de la pastille : tâches en retard et tâches du jour, les miennes et
// celles de personne (pas celles attribuées à quelqu'un d'autre)
export function deadlineBadge(state, today = todayKey(), me = null) {
  const keep = (item, list) => { const who = assigneeOf(item, list); return who === null || who === me; };
  return collect(state, keep).filter((entry) => entry.item.dueDate <= today).length;
}
