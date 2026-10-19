// Icônes au choix pour une liste (« Nouvelle liste » / « Modifier la liste »).
// Module partagé entre le serveur (liste blanche vérifiée à chaque
// écriture) et le téléphone (grille de choix, carte d'accueil, en-tête).
//
// Chaque identifiant correspond à une icône du sprite (#i-<identifiant>,
// voir design/icons-sprite.html). Le libellé est lu par les lecteurs
// d'écran. L'ordre est celui de la grille.
//
// En base, une liste sans icône choisie a une valeur vide : elle montre
// l'icône de sa catégorie (chariot pour les courses, liste cochée sinon).

export const LIST_ICONS = [
  { id: 'cart', label: 'Courses' },
  { id: 'basket', label: 'Panier' },
  { id: 'bag', label: 'Sac' },
  { id: 'store', label: 'Magasin' },
  { id: 'tasks', label: 'Tâches' },
  { id: 'calendar', label: 'Agenda' },
  { id: 'home', label: 'Maison' },
  { id: 'spray', label: 'Ménage' },
  { id: 'meal', label: 'Repas' },
  { id: 'cup', label: 'Café' },
  { id: 'cake', label: 'Gâteau' },
  { id: 'gift', label: 'Cadeau' },
  { id: 'balloon', label: 'Fête' },
  { id: 'plane', label: 'Voyage' },
  { id: 'suitcase', label: 'Valise' },
  { id: 'car', label: 'Voiture' },
  { id: 'bike', label: 'Vélo' },
  { id: 'briefcase', label: 'Travail' },
  { id: 'school', label: 'École' },
  { id: 'book', label: 'Livre' },
  { id: 'wrench', label: 'Outils' },
  { id: 'hammer', label: 'Bricolage' },
  { id: 'plant', label: 'Jardin' },
  { id: 'health', label: 'Santé' },
  { id: 'dumbbell', label: 'Sport' },
  { id: 'paw', label: 'Animal' },
  { id: 'stroller', label: 'Enfant' },
  { id: 'shirt', label: 'Vêtements' },
  { id: 'euro', label: 'Budget' },
  { id: 'bulb', label: 'Idées' },
  { id: 'music', label: 'Musique' },
  { id: 'tv', label: 'Films et séries' },
  { id: 'gamepad', label: 'Jeux' },
  { id: 'heart', label: 'Cœur' },
  { id: 'star', label: 'Étoile' },
];

const KNOWN = new Set(LIST_ICONS.map((choice) => choice.id));

// Vrai si l'identifiant fait partie de la liste blanche
export function isListIcon(value) {
  return typeof value === 'string' && KNOWN.has(value);
}

// Icône de la catégorie (comportement d'avant le choix d'une icône)
export function categoryIcon(isShopping) {
  return isShopping ? 'cart' : 'tasks';
}

// Icône à afficher pour une liste : celle choisie, sinon celle de sa catégorie
export function listIcon(list) {
  return isListIcon(list?.icon) ? list.icon : categoryIcon(Boolean(list?.category?.isShopping));
}
