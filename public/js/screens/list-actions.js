// Actions d'une liste, les mêmes dans les deux menus : le menu « ⋯ » d'une
// carte de « Mes listes » et le menu ⋮ de la liste ouverte. Même ordre, mêmes
// libellés, mêmes écrans :
// 1. « Modifier la liste » : l'écran « Modifier la liste » (nom, catégorie,
//    magasin, personnes avec qui elle est partagée) ;
// 2. « Partager par lien » : la feuille du lien public ;
// 3. « Supprimer la liste » : en dernier, après un trait, en rouge.
// Chaque action n'est proposée qu'à qui y a droit (aujourd'hui : le
// propriétaire pour les trois) ; le serveur le revérifie à chaque requête.
// Aucune action : pas de bouton de menu.
//
// Suppression : une seule logique, avec sa confirmation, pour tous les chemins
// (ces deux menus et le bouton de « Modifier la liste »). La liste est
// supprimée tout de suite sur ce téléphone, puis envoyée par la file
// d'attente (avec ou sans réseau). Il n'existe pas d'opération pour la
// remettre : pas d'« Annuler ».

import * as actions from '../actions.js';
import { navigate } from '../router.js';
import { confirmDialog, toast } from '../ui.js';
import { itemWords } from '../words.js';
import { openShareSheet } from './share.js';

// Éléments de menu (pour openMenu de ui.js). onDeleted : appelé après la
// suppression (la liste ouverte retourne alors à « Mes listes »).
export function listActions(list, { onDeleted } = {}) {
  if (!list.isOwner) return [];
  return [
    { icon: 'pencil', label: 'Modifier la liste', onSelect: () => navigate('editList', { id: list.id }) },
    { icon: 'link', label: 'Partager par lien', onSelect: () => openShareSheet(list) },
    { icon: 'trash', label: 'Supprimer la liste', danger: true, separated: true, onSelect: async () => {
      if (await deleteListWithConfirm(list)) onDeleted?.();
    } },
  ];
}

// Renvoie true si la liste a été supprimée, false si la confirmation a été
// refusée.
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
