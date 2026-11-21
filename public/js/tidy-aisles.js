// « Ranger les articles » (rayons propres à un magasin, 21 novembre 2026) :
// quand le propriétaire change le magasin d'une liste de courses, les
// articles dont le rayon n'existe pas dans le nouveau magasin passent
// « Sans rayon » (public/js/aisles.js). Sur l'appareil qui a fait le
// changement, juste après l'enregistrement, une feuille propose de les
// ranger (écran de la liste, list.js). Les autres appareils reçoivent
// simplement le résultat par la synchronisation.
//
// Le formulaire de la liste note ici les articles à ranger (askTidy) ;
// l'écran de la liste les reprend une seule fois à son ouverture
// (takeTidy). Rien n'est gardé au-delà de TIDY_DELAY, ni après la fermeture
// de l'application : ce n'est qu'une proposition, chaque article se range
// aussi plus tard depuis sa fiche.

// Au-delà de 10 minutes, la proposition est oubliée (la liste ouverte bien
// plus tard ne surprend pas avec une feuille d'un ancien changement)
export const TIDY_DELAY = 10 * 60 * 1000;

const pending = new Map(); // identifiant de la liste -> { itemIds, at }

// Note les articles à ranger d'une liste (identifiants) ; aucun : rien
export function askTidy(listId, itemIds, now = Date.now()) {
  if (!itemIds.length) {
    pending.delete(listId);
    return;
  }
  pending.set(listId, { itemIds: [...itemIds], at: now });
}

// Reprend (une seule fois) les articles à ranger de cette liste : leurs
// identifiants, ou [] s'il n'y a rien (ou si c'est trop ancien)
export function takeTidy(listId, now = Date.now()) {
  const entry = pending.get(listId);
  pending.delete(listId);
  if (!entry || now - entry.at > TIDY_DELAY) return [];
  return entry.itemIds;
}
