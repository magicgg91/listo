// Suppression d'une liste, avec sa confirmation : une seule logique pour les
// trois chemins (menu « ⋯ » d'une carte de « Mes listes », menu ⋮ de la liste
// ouverte, bouton de « Modifier la liste »).
//
// Propriétaire seulement : le bouton n'est proposé qu'à lui, et le serveur le
// revérifie (opération list.delete). La liste est supprimée tout de suite sur
// ce téléphone, puis envoyée par la file d'attente (avec ou sans réseau). Il
// n'existe pas d'opération pour la remettre : pas d'« Annuler ».

import * as actions from '../actions.js';
import { confirmDialog, toast } from '../ui.js';
import { itemWords } from '../words.js';

// Renvoie true si la liste a été supprimée (l'appelant quitte alors l'écran
// de la liste), false si la confirmation a été refusée.
export async function deleteListWithConfirm(list) {
  const ok = await confirmDialog({
    title: `Supprimer la liste « ${list.name} » ?`,
    // « ses articles » (liste de courses) ou « ses éléments »
    text: `Elle disparaît avec ses ${itemWords(list).many} pour toutes les personnes de la liste. Elle ne pourra pas être récupérée (effacement complet au bout de 30 jours).`,
    confirmLabel: 'Supprimer',
  });
  if (!ok) return false;
  await actions.deleteList(list.id);
  toast('Liste supprimée', { low: true });
  return true;
}
