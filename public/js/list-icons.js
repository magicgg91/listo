// Icônes au choix pour une liste (« Nouvelle liste » / « Modifier la liste »).
// Module partagé entre le serveur (liste blanche vérifiée à chaque
// écriture) et le téléphone (grille de choix, carte d'accueil, en-tête).
//
// Chaque identifiant correspond à une icône du sprite (#i-<identifiant>,
// voir design/icons-sprite.html). Le libellé est lu par les lecteurs
// d'écran ; son texte est pris à l'affichage, dans la langue choisie
// (public/js/i18n/fr/icones.js). L'ordre est celui de la grille.
//
// En base, une liste sans icône choisie a une valeur vide : elle montre
// l'icône de son type (public/js/list-types.js : chariot pour les courses,
// liste cochée pour les tâches, paquet cadeau pour les envies).

import { typeIcon } from './list-types.js';
import { t } from './i18n.js';

export const LIST_ICONS = [
  { id: 'cart', get label() { return t('icones.courses'); } },
  { id: 'basket', get label() { return t('icones.panier'); } },
  { id: 'bag', get label() { return t('icones.sac'); } },
  { id: 'store', get label() { return t('icones.magasin'); } },
  { id: 'tasks', get label() { return t('icones.taches'); } },
  { id: 'calendar', get label() { return t('icones.agenda'); } },
  { id: 'home', get label() { return t('icones.maison'); } },
  { id: 'spray', get label() { return t('icones.menage'); } },
  { id: 'meal', get label() { return t('icones.repas'); } },
  { id: 'cup', get label() { return t('icones.cafe'); } },
  { id: 'cake', get label() { return t('icones.gateau'); } },
  { id: 'gift', get label() { return t('icones.cadeau'); } },
  { id: 'balloon', get label() { return t('icones.fete'); } },
  { id: 'plane', get label() { return t('icones.voyage'); } },
  { id: 'suitcase', get label() { return t('icones.valise'); } },
  { id: 'car', get label() { return t('icones.voiture'); } },
  { id: 'bike', get label() { return t('icones.velo'); } },
  { id: 'briefcase', get label() { return t('icones.travail'); } },
  { id: 'school', get label() { return t('icones.ecole'); } },
  { id: 'book', get label() { return t('icones.livre'); } },
  { id: 'wrench', get label() { return t('icones.outils'); } },
  { id: 'hammer', get label() { return t('icones.bricolage'); } },
  { id: 'plant', get label() { return t('icones.jardin'); } },
  { id: 'health', get label() { return t('icones.sante'); } },
  { id: 'dumbbell', get label() { return t('icones.sport'); } },
  { id: 'paw', get label() { return t('icones.animal'); } },
  { id: 'stroller', get label() { return t('icones.enfant'); } },
  { id: 'shirt', get label() { return t('icones.vetements'); } },
  { id: 'euro', get label() { return t('icones.budget'); } },
  { id: 'bulb', get label() { return t('icones.idees'); } },
  { id: 'music', get label() { return t('icones.musique'); } },
  { id: 'tv', get label() { return t('icones.filmsSeries'); } },
  { id: 'gamepad', get label() { return t('icones.jeux'); } },
  { id: 'heart', get label() { return t('icones.coeur'); } },
  { id: 'star', get label() { return t('icones.etoile'); } },
];

const KNOWN = new Set(LIST_ICONS.map((choice) => choice.id));

// Vrai si l'identifiant fait partie de la liste blanche
export function isListIcon(value) {
  return typeof value === 'string' && KNOWN.has(value);
}

// Icône à afficher pour une liste : celle choisie, sinon celle de son type
export function listIcon(list) {
  return isListIcon(list?.icon) ? list.icon : typeIcon(list);
}
