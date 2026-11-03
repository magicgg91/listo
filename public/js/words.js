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
// main dans les écrans.

import { isShoppingList, isWishList } from './list-types.js';

const WORDS = {
  shopping: { one: 'article', many: 'articles', the: 'l\'article', this: 'cet article', aNew: 'un nouvel article', New: 'Nouvel article', of: 'de l\'article' },
  tasks: { one: 'élément', many: 'éléments', the: 'l\'élément', this: 'cet élément', aNew: 'un nouvel élément', New: 'Nouvel élément', of: 'de l\'élément' },
  wishes: { one: 'souhait', many: 'souhaits', the: 'le souhait', this: 'ce souhait', aNew: 'un nouveau souhait', New: 'Nouveau souhait', of: 'du souhait' },
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
  const content = itemCount ? `Elle contient ${countItems(itemCount, list)}` : 'Elle est vide';
  const shared = sharedWith ? ` et elle est partagée avec ${sharedWith} ${sharedWith === 1 ? 'personne' : 'personnes'}` : '';
  return [
    `${content}${shared}.`,
    'Elle disparaît pour tout le monde. Vous pourrez la restaurer pendant 30 jours depuis Réglages > Corbeille des listes.',
  ];
}

// Corbeille des listes : « Suppression définitive dans 12 jours » (« dans
// 1 jour »). Le nombre de jours vient du serveur, calculé comme le nettoyage.
export const trashDaysText = (days) => `Suppression définitive dans ${days} ${days === 1 ? 'jour' : 'jours'}`;

// Zone des articles cochés, en bas de la liste (design : section 16.5) :
// textes selon la liste. title : titre de la zone ; reopen : action qui
// décoche tout ; remove : action qui supprime les cochés.
export function doneZoneWords(listOrFlag) {
  // Liste d'envies : cocher = « reçu » (sans lien avec la réservation)
  if (typeof listOrFlag !== 'boolean' && isWishList(listOrFlag)) {
    return { title: 'Reçus', reopen: 'Tout rouvrir', remove: 'Retirer les reçus' };
  }
  return isShopping(listOrFlag)
    ? { title: 'Dans le panier', reopen: 'Tout remettre à acheter', remove: 'Retirer du panier' }
    : { title: 'Terminés', reopen: 'Tout rouvrir', remove: 'Retirer les terminés' };
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
  const one = remaining <= 1;
  return `${remaining} ${one ? words.one : words.many} ${one ? 'restant' : 'restants'} sur ${total}`;
}
