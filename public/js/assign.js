// Attribution d'une tâche à plusieurs personnes, ou « chacun son tour »
// (décisions du 11 novembre 2026). Module partagé par le téléphone et le
// serveur (server/lists.js, server/notify.js) : les mêmes règles partout.
//
// Trois façons d'attribuer une tâche (items.assign_mode) :
// - 'one'  : une personne (assigned_to), ou personne (comme avant) ;
// - 'all'  : plusieurs personnes à la fois (assign_people, 2 au moins) ;
//            la tâche est à chacune ; la première qui coche la termine ;
// - 'turn' : chacun son tour (assign_people, dans l'ordre, 2 au moins ;
//            seulement pour une tâche qui se répète). assigned_to est la
//            personne de cette fois ; quand quelqu'un coche, la tâche revient
//            à sa date suivante pour la personne qui SUIT, dans l'ordre,
//            celle qui a coché (Marc fait celle de Léa : la suivante est pour
//            Zoé). « Passer cette fois » garde la même personne.
//
// assign_people s'écrit « 3,5,7 » (identifiants de comptes, dans l'ordre).

export const ASSIGN_MODES = ['one', 'all', 'turn'];
export const PEOPLE_MIN = 2;
export const PEOPLE_MAX = 20;

// « 3,5,7 » <-> [3, 5, 7] (base de données)
export const parsePeople = (text) => (typeof text === 'string' && text ? text.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
export const formatPeople = (ids) => (ids.length ? ids.join(',') : null);

// Liste de personnes valable : 2 à 20 identifiants entiers, sans doublon
export function isPeopleList(ids) {
  return Array.isArray(ids) && ids.length >= PEOPLE_MIN && ids.length <= PEOPLE_MAX
    && ids.every((id) => Number.isInteger(id) && id > 0) && new Set(ids).size === ids.length;
}

// Mode d'une tâche ('one' si rien n'est dit)
export const modeOf = (item) => (ASSIGN_MODES.includes(item?.assignMode) ? item.assignMode : 'one');

// Les personnes d'une tâche (dans l'ordre), [] en mode 'one'
export const peopleOf = (item) => (modeOf(item) === 'one' ? [] : Array.isArray(item?.assignPeople) ? item.assignPeople : []);

// À qui la tâche est-elle en ce moment ? Plusieurs : toutes ; chacun son
// tour : la personne de cette fois ; sinon la personne, ou personne ([])
export function assigneesOf(item) {
  if (modeOf(item) === 'all') return peopleOf(item);
  return item?.assignedTo != null ? [item.assignedTo] : [];
}

// La tâche est-elle à cette personne en ce moment ?
export const isAssignedTo = (item, userId) => assigneesOf(item).includes(userId);

// Chacun son tour : la personne qui suit « after » dans l'ordre (la
// première si « after » n'en fait pas partie)
export function nextInTurn(people, after) {
  if (!people.length) return null;
  const index = people.indexOf(after);
  return people[(index + 1) % people.length];
}

// Chacun son tour : la personne de la fois suivante quand « checker » coche
// la tâche de cette fois (« current ») : celle qui suit la personne qui a
// coché si elle est dans le tour, sinon celle qui suit la personne de cette fois
export function turnAfterCheck(people, current, checker) {
  return nextInTurn(people, people.includes(checker) ? checker : current);
}

// Une personne quitte la liste ou passe en lecture seule : la tâche sans
// elle. Renvoie { mode, people, assignedTo } :
// - plus que 2 : le même mode ; chacun son tour, si c'était son tour, la
//   personne suivante prend la place ;
// - une seule : elle devient « la » personne de la tâche (mode 'one') ;
// - aucune : « Personne ».
export function withoutPerson({ mode, people, assignedTo }, userId) {
  if (mode === 'one') return { mode, people: [], assignedTo: assignedTo === userId ? null : assignedTo };
  if (!people.includes(userId)) return { mode, people, assignedTo };
  const rest = people.filter((id) => id !== userId);
  let current = assignedTo;
  if (mode === 'turn' && assignedTo === userId) current = nextInTurn(people, userId);
  if (rest.length >= PEOPLE_MIN) return { mode, people: rest, assignedTo: mode === 'turn' ? current : null };
  if (rest.length === 1) return { mode: 'one', people: [], assignedTo: rest[0] };
  return { mode: 'one', people: [], assignedTo: null };
}
