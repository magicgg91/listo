// Types de liste : le point unique qui dit ce qu'une liste sait faire.
// Module partagé entre le serveur (contrôle de chaque écriture, requêtes) et
// le téléphone (formulaire, écran de la liste, mots, tris).
//
// Trois types fixes (valeur en base, colonne lists.type) :
// - shopping (« Courses ») : magasin, rayons, mémoire des noms, codes-barres
//   et mode scan ;
// - tasks (« Tâches ») : priorité et échéance (si la liste les active) ;
// - wishes (« Envies ») : idées cadeaux pour un bénéficiaire, avec lien,
//   prix, priorité (si la liste l'active) et réservations cachées au
//   bénéficiaire (public/js/wishes.js). Une
//   liste d'envies ne change jamais de type, et une autre liste ne devient
//   pas une liste d'envies.
//
// Changer de type n'efface rien : les données propres à l'ancien type
// (rayons, magasin, codes-barres ; priorité, échéance) restent en base,
// cachées tant que le type ne s'en sert pas.
//
// Les anciennes « catégories » ont disparu (migration 32, 17 novembre 2026).
// Une copie hors ligne d'avant les types est écartée et rechargée
// (SNAPSHOT_VERSION, store.js).

import { t } from './i18n.js';

export const LIST_TYPES = ['shopping', 'tasks', 'wishes'];

// Types qu'on peut choisir à la création
export const CREATABLE_TYPES = ['shopping', 'tasks', 'wishes'];
// Types entre lesquels une liste existante peut passer (jamais les envies)
export const CHANGEABLE_TYPES = ['shopping', 'tasks'];

// Nom affiché de chaque type (TYPE_LABELS.tasks : « Tâches »), dans la
// langue des écrans : le texte est lu au moment où l'écran le demande
export const TYPE_LABELS = {
  get shopping() { return t('regles.type.courses'); },
  get tasks() { return t('regles.type.taches'); },
  get wishes() { return t('regles.type.envies'); },
};

// Icône par défaut de chaque type (sprite design/icons-sprite.html)
export const TYPE_ICONS = { shopping: 'cart', tasks: 'tasks', wishes: 'gift' };

// Refus d'un changement de type (serveur) : noms des textes
// (public/js/i18n/fr/regles.js), traduits là où la réponse est écrite
export const WISHES_FIXED = 'regles.envies.typeFixe';
export const NOT_TO_WISHES = 'regles.envies.conversionEnLigne';
// Phrase du formulaire « Modifier la liste » quand une liste de courses ou
// de tâches devient une liste d'envies (avant l'enregistrement)
export const CONVERT_TO_WISHES_WARNING = 'regles.envies.avertissementConversion';
// Phrase du formulaire « Modifier la liste » d'une liste d'envies (nom du
// texte : l'écran l'affiche avec t())
export const WISHES_LOCKED_HINT = 'regles.envies.verrouillee';

export function isListType(value) {
  return typeof value === 'string' && LIST_TYPES.includes(value);
}

// Type d'une liste ({ type }, ou directement une valeur de type) ; une
// valeur absente ou inconnue compte comme une liste de tâches (le cas le
// plus simple : ni rayon, ni magasin, ni code-barres).
export function typeOf(list) {
  if (isListType(list)) return list;
  if (isListType(list?.type)) return list.type;
  return 'tasks';
}

// Ce que le type utilise
export const isShoppingList = (list) => typeOf(list) === 'shopping'; // magasin, rayons, scan, codes-barres, mémoire des noms
// Priorité : listes de tâches et d'envies (désactivée au départ, le
// propriétaire l'active) ; échéance : listes de tâches seulement
export const usesPriority = (list) => ['tasks', 'wishes'].includes(typeOf(list));
export const usesDue = (list) => typeOf(list) === 'tasks';
// Attribuer une tâche à une personne de la liste : listes de tâches seulement
export const usesAssign = (list) => typeOf(list) === 'tasks';
export const isWishList = (list) => typeOf(list) === 'wishes';       // bénéficiaire, lien, prix, réservations

export const typeLabel = (list) => TYPE_LABELS[typeOf(list)];
export const typeIcon = (list) => TYPE_ICONS[typeOf(list)];

// Avertissement du formulaire quand le propriétaire change le type d'une
// liste existante : ce qui ne s'affichera plus, et qui reste conservé
export function typeChangeWarning(from, to) {
  if (from === to) return '';
  if (to === 'wishes') return t(CONVERT_TO_WISHES_WARNING);
  if (from === 'shopping') return t('regles.type.changement.depuisCourses');
  if (from === 'tasks') return t('regles.type.changement.depuisTaches');
  return '';
}
