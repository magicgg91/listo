// Actions d'une liste, les mêmes dans les deux menus : le menu « ⋯ » d'une
// carte de « Mes listes » et le menu ⋮ de la liste ouverte. Même ordre, mêmes
// libellés, mêmes écrans :
// 1. « Modifier la liste » (propriétaire) : l'écran « Modifier la liste »
//    (nom, catégorie, magasin, personnes avec qui elle est partagée) ;
// 2. « Dupliquer la liste » (propriétaire, invité « Peut modifier ») : la
//    feuille de duplication (en ligne seulement) ;
// 3. « Partager par lien » (propriétaire) : la feuille du lien public ;
// 4. « Supprimer la liste » (propriétaire) : en dernier, après un trait, en rouge.
// Chaque action n'est proposée qu'à qui y a droit ; le serveur le revérifie
// à chaque requête. Aucune action : pas de bouton de menu.
//
// Suppression : une seule logique, avec sa confirmation, pour tous les chemins
// (ces deux menus et le bouton de « Modifier la liste »). La liste est
// supprimée tout de suite sur ce téléphone, puis envoyée par la file
// d'attente (avec ou sans réseau). Il n'existe pas d'opération pour la
// remettre : pas d'« Annuler ».

import * as actions from '../actions.js';
import { post, errorMessage } from '../api.js';
import { refreshData } from '../app.js';
import { h, field, errorNote, LABEL_INPUT } from '../dom.js';
import { navigate } from '../router.js';
import { canEditList } from '../store.js';
import { confirmDialog, openSheet, toast } from '../ui.js';
import { itemWords } from '../words.js';
import { copyName } from '../format.js';
import { openShareSheet } from './share.js';

// Éléments de menu (pour openMenu de ui.js). onDeleted : appelé après la
// suppression (la liste ouverte retourne alors à « Mes listes »).
export function listActions(list, { onDeleted } = {}) {
  const duplicate = { icon: 'copy', label: 'Dupliquer la liste', onSelect: () => openDuplicateSheet(list) };
  if (!list.isOwner) return canEditList(list) ? [duplicate] : [];
  return [
    { icon: 'pencil', label: 'Modifier la liste', onSelect: () => navigate('editList', { id: list.id }) },
    duplicate,
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

// --- Dupliquer la liste ---
// Feuille : « Titre de la liste » (« <nom> (copie) ») et « Copier les
// articles » / « Copier les éléments » (activé). La copie est faite par le
// serveur (POST /api/lists/:id/duplicate), en ligne seulement : catégorie,
// magasin, réglages, et les éléments non supprimés, tous décochés ; ni les
// invités, ni le lien public, ni les photos. On reste où l'on est : un
// message propose « Ouvrir » ; sur « Mes listes », la nouvelle carte est
// brièvement mise en évidence.
const OFFLINE_DUPLICATE = 'Connexion nécessaire pour dupliquer une liste';
const NAME_MAX = 100; // comme tout nom de liste

// Liste tout juste créée par une duplication : mise en évidence sur sa carte
// pendant quelques secondes (lists.js)
let fresh = { id: null, until: 0 };
export const isFreshList = (listId, now = Date.now()) => fresh.id === listId && now < fresh.until;

export function openDuplicateSheet(list) {
  if (!navigator.onLine) {
    toast(OFFLINE_DUPLICATE);
    return;
  }
  const words = itemWords(list);
  const name = h('input', { class: 'input', ...LABEL_INPUT, maxlength: String(NAME_MAX), value: copyName(list.name) });
  const nameField = field('Titre de la liste', name);
  let withItems = true;
  const state = h('span', { class: 'row__sub' });
  const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': `Copier les ${words.many}` });
  const paint = () => {
    toggle.setAttribute('aria-checked', String(withItems));
    state.textContent = withItems ? `Activé · tous les ${words.many}, décochés` : `Désactivé · liste vide`;
  };
  toggle.addEventListener('click', () => {
    withItems = !withItems;
    paint();
  });
  paint();
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Dupliquer');
  const cancel = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, 'Annuler');
  const form = h('form', { class: 'stack', novalidate: true },
    nameField.field,
    h('div', { class: 'card list-options' },
      h('div', { class: 'toggle-row' }, h('div', { class: 'grow' }, h('span', { class: 'row__title' }, `Copier les ${words.many}`), state), toggle)),
    h('p', { class: 'field__hint' }, 'La copie est privée : ni les personnes invitées, ni le lien public, ni les photos ne sont copiés.'),
    error.note,
    h('div', { class: 'sheet__actions' }, submit, cancel));
  const sheet = openSheet({ title: 'Dupliquer la liste', content: form });
  cancel.addEventListener('click', () => sheet.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    const title = name.value.replace(/\s+/g, ' ').trim();
    nameField.setError(title ? null : 'Le titre est obligatoire');
    if (!title) return;
    if (!navigator.onLine) {
      error.show(OFFLINE_DUPLICATE);
      return;
    }
    submit.disabled = true;
    try {
      const { list: created } = await post(`/api/lists/${list.id}/duplicate`, { name: title, withItems });
      fresh = { id: created.id, until: Date.now() + 4000 };
      sheet.close();
      await refreshData({ quiet: true });
      toast(`Liste « ${created.name} » créée`, { action: 'Ouvrir', onAction: () => navigate('list', { id: created.id }) });
    } catch (err) {
      submit.disabled = false;
      error.show(errorMessage(err));
    }
  });
}
