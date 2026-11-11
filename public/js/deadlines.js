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
// (comme le résumé de 8 h des notifications).

import { typeOf } from './list-types.js';
import { listOptions } from './store.js';
import { addDays, todayKey } from './format.js';
import { compareNames } from './sorting.js';
import { matches } from './search.js';

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

// Groupe d'une échéance (« AAAA-MM-JJ ») par rapport au jour donné
export function deadlineGroup(dueDate, today) {
  if (dueDate < today) return 'late';
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

// Tâches retenues, chacune avec sa liste : [{ item, list }], triées
function collect(state) {
  const found = [];
  for (const item of state.items.values()) {
    if (item.checked || !item.dueDate) continue;
    const list = state.lists.get(item.listId);
    if (!listHasDeadlines(list)) continue;
    found.push({ item, list });
  }
  const priority = (entry) => (listOptions(entry.list).priority ? PRIORITY_RANK[entry.item.priority] ?? 1 : 1);
  return found.sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate)
    || priority(a) - priority(b)
    || compareNames(a.item.name, b.item.name));
}

// Groupes à afficher (vides retirés) : [{ key, title, entries }].
// query : texte cherché (nom de la tâche), facultatif.
export function computeDeadlines(state, { today = todayKey(), query = '' } = {}) {
  const entries = collect(state).filter((entry) => !query || matches(entry.item.name, query));
  return DEADLINE_GROUPS
    .map(([key, title]) => ({ key, title, entries: entries.filter((entry) => deadlineGroup(entry.item.dueDate, today) === key) }))
    .filter((group) => group.entries.length > 0);
}

// Nombre de la pastille : tâches en retard et tâches du jour
export function deadlineBadge(state, today = todayKey()) {
  return collect(state).filter((entry) => entry.item.dueDate <= today).length;
}
