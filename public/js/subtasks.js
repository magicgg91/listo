// Sous-tâches (décisions du 17 novembre 2026) : règles partagées par le
// serveur (server/lists.js), la copie locale du téléphone (store.js), les
// écrans et la page du lien public.
//
// - Option « Sous-tâches » d'une liste de tâches (désactivée au départ).
// - Un seul niveau : une tâche principale a des sous-tâches, une
//   sous-tâche n'en a pas.
// - Option coupée, ou liste d'un autre type : le lien (parentId) reste en
//   base mais n'est pas utilisé, les tâches s'affichent à plat ; tout se
//   regroupe quand l'option revient.
// - Une sous-tâche est rangée sous sa principale seulement si celle-ci est
//   présente (non supprimée) et n'est pas elle-même rangée sous une autre :
//   sinon elle s'affiche comme une tâche ordinaire. Le serveur empêche ces
//   cas, cette règle les rend seulement sans danger.

import { typeOf } from './list-types.js';

// Le type de liste peut-il avoir des sous-tâches ? (listes de tâches seulement)
export const usesSubtasks = (list) => typeOf(list) === 'tasks';

// Les sous-tâches sont-elles regroupées dans cette liste ? (description
// d'une liste envoyée au téléphone : subtasksEnabled)
export const nestsSubtasks = (list) => usesSubtasks(list) && list?.subtasksEnabled === true;

// Messages de refus (serveur), sans le mot « article » : noms des textes
// (public/js/i18n/fr/regles.js), traduits là où la réponse est écrite
// (Claude les reçoit en français)
export const SUBTASK_NOT_HERE = 'regles.sousTaches.pasIci';
export const SUBTASKS_OFF = 'regles.sousTaches.desactivees';
export const BAD_PARENT = 'regles.sousTaches.principaleIntrouvable';
export const PARENT_IS_SUBTASK = 'regles.sousTaches.pasDeSousNiveau';
export const HAS_SUBTASKS = 'regles.sousTaches.aDesSousTaches';
export const NOT_OWN_PARENT = 'regles.sousTaches.pasSaPropre';
export const SUBTASK_NO_REPEAT = 'regles.sousTaches.pasDeRepetition';
export const NOT_A_SUBTASK = 'regles.sousTaches.deplacement';
export const BAD_PLACE = 'regles.sousTaches.placeInconnue';

// Tâche principale d'un élément, telle qu'elle s'affiche : la tâche
// parentId si elle est dans byId (éléments présents de la même liste) et
// n'est pas elle-même rangée sous une autre tâche présente ; sinon null.
export function parentOf(item, byId) {
  if (!item?.parentId) return null;
  const parent = byId.get(item.parentId);
  if (!parent || parent.listId !== item.listId || parent.id === item.id) return null;
  if (parent.parentId && byId.has(parent.parentId)) return null;
  return parent;
}

// Regroupe les éléments présents d'une liste : tops (tâches principales et
// tâches ordinaires, dans l'ordre reçu) et childrenOf (identifiant d'une
// principale → ses sous-tâches, dans l'ordre reçu). on : regroupement
// actif (nestsSubtasks) ; sinon tout est à plat.
export function nestItems(items, on) {
  const childrenOf = new Map();
  if (!on) return { tops: [...items], childrenOf };
  const byId = new Map(items.map((item) => [item.id, item]));
  const tops = [];
  for (const item of items) {
    const parent = parentOf(item, byId);
    if (!parent) {
      tops.push(item);
      continue;
    }
    if (!childrenOf.has(parent.id)) childrenOf.set(parent.id, []);
    childrenOf.get(parent.id).push(item);
  }
  return { tops, childrenOf };
}

// Sous-tâches d'une principale (éléments présents de la liste)
export function childrenOf(items, parentId) {
  const { childrenOf: groups } = nestItems(items, true);
  return groups.get(parentId) ?? [];
}

// --- Ordre manuel (décisions du 17 novembre 2026) ---
// Les sous-tâches d'une principale suivent l'ordre choisi à la main, quel
// que soit le tri de la liste ; une sous-tâche cochée reste à sa place.
// position : nombre entier propre à chaque sous-tâche (1, 2, 3…, parmi
// celles de la même principale) ; une nouvelle va à la fin. À égalité (ou
// sans position) : date d'ajout, puis identifiant.

// Compare deux sous-tâches de la même principale
export const compareSubtasks = (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity)
  || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  || String(a.id).localeCompare(String(b.id));

// Sous-tâches dans l'ordre manuel (copie triée)
export const orderSubtasks = (children) => [...children].sort(compareSubtasks);

// Position d'une sous-tâche ajoutée à la fin
export const nextPosition = (siblings) => Math.max(0, ...siblings.map((child) => child.position ?? 0)) + 1;

// Nouvel ordre après le déplacement de movingId juste après afterId (null :
// en premier), parmi les sous-tâches de sa principale (moving comprise).
// Renvoie les identifiants dans le nouvel ordre, ou null si afterId n'est
// pas une sous-tâche de la même principale.
export function reorderedIds(siblings, movingId, afterId) {
  const ids = orderSubtasks(siblings).map((child) => child.id).filter((id) => id !== movingId);
  if (afterId === null) return [movingId, ...ids];
  const at = ids.indexOf(afterId);
  if (at < 0) return null;
  return [...ids.slice(0, at + 1), movingId, ...ids.slice(at + 1)];
}

// Compteur « 3/10 » d'une principale : sous-tâches cochées / toutes
export function progressOf(children) {
  return { done: children.filter((child) => child.checked).length, total: children.length };
}
