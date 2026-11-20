// Vocabulaire des listes : le mot qui désigne une ligne de la liste.
//
// - Liste de courses (type « shopping ») : « article ».
// - Liste d'envies (type « wishes ») : « souhait ».
// - Liste de tâches : « élément ».
//
// Les trois mots sont masculins ; « souhait » commence par une consonne, d'où
// les formes complètes ci-dessous (the : « l'article » / « le souhait » ;
// this : « cet article » / « ce souhait » ; aNew : « un nouvel article » /
// « un nouveau souhait » ; New : « Nouvel article » / « Nouveau souhait » ;
// of : « de l'article » / « du souhait »).
// Tous les textes affichés passent par ce module : aucun mot recopié à la
// main dans les écrans. Les mots eux-mêmes sont dans le dictionnaire
// (public/js/i18n/fr/mots.js).

import { isShoppingList, isWishList } from './list-types.js';
import { t } from './i18n.js';

// Chaque forme est lue au moment où elle sert (get), dans la langue choisie :
// itemWords() peut donc être appelé n'importe où, même au chargement d'un
// écran, sans figer la langue.
const WORDS = {
  shopping: {
    get one() { return t('mots.courses.un'); },
    get many() { return t('mots.courses.plusieurs'); },
    get the() { return t('mots.courses.le'); },
    get this() { return t('mots.courses.ce'); },
    get aNew() { return t('mots.courses.unNouveau'); },
    get New() { return t('mots.courses.nouveau'); },
    get of() { return t('mots.courses.de'); },
  },
  tasks: {
    get one() { return t('mots.taches.un'); },
    get many() { return t('mots.taches.plusieurs'); },
    get the() { return t('mots.taches.le'); },
    get this() { return t('mots.taches.ce'); },
    get aNew() { return t('mots.taches.unNouveau'); },
    get New() { return t('mots.taches.nouveau'); },
    get of() { return t('mots.taches.de'); },
  },
  wishes: {
    get one() { return t('mots.envies.un'); },
    get many() { return t('mots.envies.plusieurs'); },
    get the() { return t('mots.envies.le'); },
    get this() { return t('mots.envies.ce'); },
    get aNew() { return t('mots.envies.unNouveau'); },
    get New() { return t('mots.envies.nouveau'); },
    get of() { return t('mots.envies.de'); },
  },
};

// Vrai pour une liste de courses. Accepte une liste telle que décrite par le
// serveur ({ type }) ou directement un booléen.
export function isShopping(listOrFlag) {
  if (typeof listOrFlag === 'boolean') return listOrFlag;
  return isShoppingList(listOrFlag);
}

// Le mot au singulier (one) et au pluriel (many), et ses formes complètes,
// selon la liste (un booléen : courses ou tâches)
export function itemWords(listOrFlag) {
  if (typeof listOrFlag !== 'boolean' && isWishList(listOrFlag)) return WORDS.wishes;
  return isShopping(listOrFlag) ? WORDS.shopping : WORDS.tasks;
}

// « 1 article », « 3 éléments »… (singulier pour 1 seulement)
export function countItems(count, listOrFlag) {
  const words = itemWords(listOrFlag);
  return `${count} ${count === 1 ? words.one : words.many}`;
}

// Confirmation « Supprimer la liste » : ce qu'elle contient, avec qui elle
// est partagée (seulement s'il y a quelqu'un), puis ce qui va se passer.
// Deux paragraphes. itemCount : éléments non supprimés ; sharedWith : nombre
// de personnes avec qui elle est partagée (le propriétaire non compris).
export function deleteListText(list, itemCount, sharedWith) {
  // Une phrase entière par cas : vide ou non, partagée ou non (« 1 personne »,
  // « 2 personnes »)
  let first;
  if (itemCount) {
    const items = countItems(itemCount, list);
    first = sharedWith ? t('mots.suppression.contientPartagee', { items, count: sharedWith }) : t('mots.suppression.contient', { items });
  } else {
    first = sharedWith ? t('mots.suppression.videPartagee', { count: sharedWith }) : t('mots.suppression.vide');
  }
  // Chemin « Réglages > Corbeille des listes » : le chevron est posé ici, les
  // dictionnaires n'ayant jamais de « < » ni de « > » (règle anti-HTML)
  const path = [t('mots.suppression.chemin.reglages'), t('mots.suppression.chemin.corbeille')].join(' > ');
  return [
    first,
    t('mots.suppression.suite', { path }),
  ];
}

// Corbeille des listes : « Suppression définitive dans 12 jours » (« dans
// 1 jour »). Le nombre de jours vient du serveur, calculé comme le nettoyage.
export const trashDaysText = (days) => t('mots.corbeille.jours', { count: days });

// Zone des articles cochés, en bas de la liste (design : section 16.5) :
// textes selon la liste. title : titre de la zone ; reopen : action qui
// décoche tout ; remove : action qui supprime les cochés.
export function doneZoneWords(listOrFlag) {
  // Liste d'envies : cocher = « reçu » (sans lien avec la réservation)
  if (typeof listOrFlag !== 'boolean' && isWishList(listOrFlag)) {
    return { title: t('mots.coches.envies.titre'), reopen: t('mots.coches.envies.rouvrir'), remove: t('mots.coches.envies.retirer') };
  }
  return isShopping(listOrFlag)
    ? { title: t('mots.coches.courses.titre'), reopen: t('mots.coches.courses.rouvrir'), remove: t('mots.coches.courses.retirer') }
    : { title: t('mots.coches.taches.titre'), reopen: t('mots.coches.taches.rouvrir'), remove: t('mots.coches.taches.retirer') };
}

// Compteur « X/Y » (carte de « Mes listes », en-tête de groupe) : X restants
// à faire, Y au total (cochés compris, supprimés exclus). Sans texte ni
// espace : « 3/8 ».
export function progressText(remaining, total) {
  return `${remaining}/${total}`;
}

// Le même compteur pour les lecteurs d'écran et l'infobulle :
// « 3 articles restants sur 8 », « 1 élément restant sur 4 »,
// « 0 article restant sur 5 » (singulier pour 0 et 1)
export function progressLabel(remaining, total, listOrFlag) {
  const words = itemWords(listOrFlag);
  return remaining <= 1
    ? t('mots.progression.singulier', { remaining, item: words.one, total })
    : t('mots.progression.pluriel', { remaining, item: words.many, total });
}
