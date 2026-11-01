// Types de liste : le point unique qui dit ce qu'une liste sait faire.
// Module partagé entre le serveur (contrôle de chaque écriture, requêtes) et
// le téléphone (formulaire, écran de la liste, mots, tris).
//
// Trois types fixes (valeur en base, colonne lists.type) :
// - shopping (« Courses ») : magasin, rayons, mémoire des noms, codes-barres
//   et mode scan ;
// - tasks (« Tâches ») : priorité et échéance (si la liste les active) ;
// - wishes (« Envies ») : accepté par le modèle, mais pas encore proposé
//   ni accepté à la création (étape suivante).
//
// Changer de type n'efface rien : les données propres à l'ancien type
// (rayons, magasin, codes-barres ; priorité, échéance) restent en base,
// cachées tant que le type ne s'en sert pas.
//
// Les anciens champs « catégorie » (list.category, categories, categoryId)
// ne sont PAS lus ici ni ailleurs dans le nouveau code : le serveur les
// envoie encore, provisoirement, pour les téléphones qui n'ont pas rechargé
// (voir describeList dans server/lists.js), et traduit lui-même une ancienne
// opération qui porte un identifiant de catégorie. Une copie hors ligne
// d'avant les types est écartée et rechargée (SNAPSHOT_VERSION, store.js).

export const LIST_TYPES = ['shopping', 'tasks', 'wishes'];

// Types qu'on peut choisir à la création ou au changement de type
export const CREATABLE_TYPES = ['shopping', 'tasks'];

export const TYPE_LABELS = { shopping: 'Courses', tasks: 'Tâches', wishes: 'Envies' };

// Icône par défaut de chaque type (sprite design/icons-sprite.html)
export const TYPE_ICONS = { shopping: 'cart', tasks: 'tasks', wishes: 'gift' };

export const WISHES_NOT_YET = 'Les listes d\'envies ne sont pas encore disponibles.';

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
export const usesTaskOptions = (list) => typeOf(list) === 'tasks';   // priorité, échéance

export const typeLabel = (list) => TYPE_LABELS[typeOf(list)];
export const typeIcon = (list) => TYPE_ICONS[typeOf(list)];

// Avertissement du formulaire quand le propriétaire change le type d'une
// liste existante : ce qui ne s'affichera plus, et qui reste conservé
export function typeChangeWarning(from, to) {
  if (from === to) return '';
  if (from === 'shopping') return 'Les rayons, magasins et codes-barres ne s\'affichent plus pour ce type ; ils sont conservés si vous revenez à Courses.';
  if (from === 'tasks') return 'La priorité et l\'échéance ne s\'affichent plus pour ce type ; elles sont conservées si vous revenez à Tâches.';
  return '';
}
