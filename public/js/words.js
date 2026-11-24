// Vocabulaire des listes : le mot qui désigne une ligne de la liste.
//
// - Liste de courses (type « shopping ») : « article ».
// - Liste d'envies (type « wishes ») : « souhait ».
// - Liste de tâches : « élément ».
//
// Grammaire (décisions du 20 novembre 2026, pour l'anglais) : ce module ne
// donne que des mots seuls (one : « article », many : « articles », New :
// « Nouvel article »), pour un libellé ou une place où toutes les langues
// les acceptent tels quels (« Aucun {word} ne correspond… »). Une phrase
// qui a besoin d'un article ou d'un accord (« Modifier l'article »,
// « Photo du souhait », « Ajouter un élément ») est écrite en entier, une
// par sorte de liste, et choisie avec byKind ; un nombre d'éléments passe
// par countItems (pluriel de la langue : « 0 article », « 3 articles »).
// Les mots et les phrases sont dans le dictionnaire (public/js/i18n/fr/).

import { isShoppingList, isWishList } from './list-types.js';
import { t } from './i18n.js';

// Chaque forme est lue au moment où elle sert (get), dans la langue choisie :
// itemWords() peut donc être appelé n'importe où, même au chargement d'un
// écran, sans figer la langue.
const WORDS = {
  shopping: {
    get one() { return t('mots.courses.un'); },
    get many() { return t('mots.courses.plusieurs'); },
    get New() { return t('mots.courses.nouveau'); },
  },
  tasks: {
    get one() { return t('mots.taches.un'); },
    get many() { return t('mots.taches.plusieurs'); },
    get New() { return t('mots.taches.nouveau'); },
  },
  wishes: {
    get one() { return t('mots.envies.un'); },
    get many() { return t('mots.envies.plusieurs'); },
    get New() { return t('mots.envies.nouveau'); },
  },
};

// Vrai pour une liste de courses. Accepte une liste telle que décrite par le
// serveur ({ type }) ou directement un booléen.
export function isShopping(listOrFlag) {
  if (typeof listOrFlag === 'boolean') return listOrFlag;
  return isShoppingList(listOrFlag);
}

// Sorte de liste pour le vocabulaire : 'shopping' (courses), 'tasks'
// (tâches) ou 'wishes' (envies). Un booléen : courses (true) ou tâches ;
// une sorte déjà connue (« wishes ») est rendue telle quelle.
export function wordKind(listOrFlag) {
  if (Object.hasOwn(WORDS, listOrFlag)) return listOrFlag;
  if (typeof listOrFlag !== 'boolean' && isWishList(listOrFlag)) return 'wishes';
  return isShopping(listOrFlag) ? 'shopping' : 'tasks';
}

// La phrase entière de cette sorte de liste, parmi les trois :
// byKind(list, { shopping: t('…courses'), tasks: t('…taches'), wishes: t('…envies') })
export const byKind = (listOrFlag, texts) => texts[wordKind(listOrFlag)];

// Le mot au singulier (one) et au pluriel (many), et le titre d'un nouvel
// élément (New), selon la liste (un booléen : courses ou tâches)
export function itemWords(listOrFlag) {
  return WORDS[wordKind(listOrFlag)];
}

// « 1 article », « 3 éléments », « 0 souhait » (pluriel de la langue : en
// français, 0 et 1 au singulier)
export function countItems(count, listOrFlag) {
  return byKind(listOrFlag, {
    shopping: t('mots.courses.nombre', { count }),
    tasks: t('mots.taches.nombre', { count }),
    wishes: t('mots.envies.nombre', { count }),
  });
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

// Part cochée, en pour cent (0 à 100, arrondie), pour la petite barre du
// compteur d'une liste ouverte : 1 restant sur 6 → 83 ; tout coché → 100 ;
// liste vide → 0 (le compteur n'est alors pas affiché)
export function progressShare(remaining, total) {
  if (!(total > 0)) return 0;
  const done = Math.min(Math.max(total - remaining, 0), total);
  return Math.round((100 * done) / total);
}

// Le même compteur pour les lecteurs d'écran et l'infobulle :
// « 3 articles restants sur 8 », « 1 élément restant sur 4 »,
// « 0 article restant sur 5 » (pluriel de la langue, selon les restants)
export function progressLabel(remaining, total, listOrFlag) {
  return byKind(listOrFlag, {
    shopping: t('mots.courses.progression', { count: remaining, total }),
    tasks: t('mots.taches.progression', { count: remaining, total }),
    wishes: t('mots.envies.progression', { count: remaining, total }),
  });
}
