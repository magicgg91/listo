// Actions d'une liste, les mêmes dans les deux menus : le menu « ⋯ » d'une
// carte de « Listes » et le menu ⋮ de la liste ouverte. Même ordre, mêmes
// libellés, mêmes écrans. Libellés courts (décision du 24 novembre 2026) :
// le menu porte déjà le nom de la liste (« Actions de la liste Maison »,
// lu par les lecteurs d'écran), inutile de le répéter dans chaque ligne.
// 1. « Modifier » (propriétaire) : l'écran « Modifier la liste »
//    (nom, catégorie, magasin, personnes avec qui elle est partagée) ;
// 2. « Dupliquer » (propriétaire, contributeur) : la feuille « Dupliquer
//    la liste » (en ligne seulement) ;
// 3. « Partager par lien » (propriétaire) : la feuille du lien public ;
// 4. « Supprimer » (propriétaire) : en dernier, après un trait, en rouge ;
//    « Quitter » (contributeur ou invité, à la place) : pareil, avec sa confirmation
//    (en ligne seulement).
// Un contributeur voit donc « Dupliquer » puis « Quitter » ; un invité en
// lecture seule, « Quitter » seulement. Les confirmations gardent le nom
// complet (« Supprimer la liste « Maison » ? »).
// « Masquer les nouveautés » (Nouveautés) et « Couper les notifications »
// (page Notifications et téléphone) : pour tout membre, juste avant
// « Supprimer » ou « Quitter ».
// Chaque action n'est proposée qu'à qui y a droit ; le serveur le revérifie
// à chaque requête. Aucune action : pas de bouton de menu.
//
// Suppression : une seule logique, avec sa confirmation, pour tous les chemins
// (ces deux menus et le bouton de « Modifier la liste »). La liste est
// supprimée tout de suite sur ce téléphone, puis envoyée par la file
// d'attente (avec ou sans réseau). Il n'existe pas d'opération pour la
// remettre : pas d'« Annuler ».

import { isWishList } from '../list-types.js';
import * as actions from '../actions.js';
import { post, errorMessage } from '../api.js';
import { app, refreshData } from '../app.js';
import { h, field, errorNote, LABEL_INPUT } from '../dom.js';
import { navigate } from '../router.js';
import { canEditList, isListMuted } from '../store.js';
import { confirmDialog, openSheet, toast } from '../ui.js';
import { itemWords, deleteListText } from '../words.js';
import { copyName } from '../format.js';
import { openShareSheet } from './share.js';
import { isListPushMuted, setListPushMuted } from '../push.js';
import { t } from '../i18n.js';

// Éléments de menu (pour openMenu de ui.js). onDeleted : appelé après la
// suppression ou le départ (la liste ouverte retourne alors à « Mes listes »).
export function listActions(list, { onDeleted } = {}) {
  const duplicate = { icon: 'copy', label: t('menu.dupliquer'), onSelect: () => openDuplicateSheet(list) };
  const wishes = isWishList(list);
  // Nouveautés : « Masquer les nouveautés » / « Afficher les nouveautés »,
  // pour chaque membre, invité en lecture seule compris (ce n'est
  // pas une modification de la liste)
  const mute = newsMuteAction(list);
  const pushMute = pushMuteAction(list);
  if (!list.isOwner) {
    const canEdit = canEditList(list);
    const leave = { icon: 'logout', label: t('menu.quitter'), danger: true, separated: canEdit, onSelect: async () => {
      if (!(await leaveListWithConfirm(list))) return;
      const message = t('menu.quitter.fait', { name: list.name });
      if (!onDeleted) {
        toast(message, { low: true });
        return;
      }
      // Liste ouverte : retour à l'accueil, puis le message (sur le nouvel écran)
      onDeleted();
      setTimeout(() => toast(message, { low: true }), 400);
    } };
    return (canEdit && !wishes ? [duplicate, mute, pushMute, leave] : [mute, pushMute, leave]).filter(Boolean);
  }
  return [
    { icon: 'pencil', label: t('menu.modifier'), onSelect: () => navigate('editList', { id: list.id }) },
    // Liste d'envies : pas de duplication (refusée aussi par le serveur) ; lien public permis, sans réservations
    wishes ? null : duplicate,
    { icon: 'link', label: t('menu.partagerLien'), onSelect: () => openShareSheet(list) },
    mute,
    pushMute,
    { icon: 'trash', label: t('menu.supprimer'), danger: true, separated: true, onSelect: async () => {
      if (await deleteListWithConfirm(list)) onDeleted?.();
    } },
  ].filter(Boolean);
}

// Sourdine des nouveautés d'une liste, pour moi seulement (sur tous mes
// appareils) : ni pastille, ni halo, ni compte dans le badge de l'icône.
// Indépendante de « Couper les notifications » (deux
// réglages séparés, en base comme à l'écran ; libellés du 10 novembre 2026).
function newsMuteAction(list) {
  return isListMuted(app.data, list.id)
    ? { icon: 'eye', label: t('menu.nouveautes.afficher'), onSelect: () => {
      actions.setListMuted(list.id, false);
      toast(t('menu.nouveautes.affichees'), { low: true });
    } }
    : { icon: 'eye-off', label: t('menu.nouveautes.masquer'), onSelect: () => {
      actions.setListMuted(list.id, true);
      toast(t('menu.nouveautes.masquees'), { low: true });
    } };
}

// Notifications : « Couper les notifications » (plus aucune notification
// venant de cette liste, quelle que soit la catégorie) / « Réactiver les
// notifications ». Toujours (depuis l'étape 4 du cadrage :
// la sourdine vaut aussi pour la page Notifications, même sans LISTO_PUSH) ;
// en ligne seulement (réglage du compte, gardé par le serveur).
function pushMuteAction(list) {
  const muted = isListPushMuted(list.id);
  const run = async () => {
    try {
      await setListPushMuted(list.id, !muted);
      toast(muted ? t('menu.notifications.reactivees') : t('menu.notifications.coupees'), { low: true });
    } catch (error) {
      toast(errorMessage(error));
    }
  };
  return muted
    ? { icon: 'bell', label: t('menu.notifications.reactiver'), onSelect: run }
    : { icon: 'bell', label: t('menu.notifications.couper'), onSelect: run };
}

// Renvoie true si la liste a été supprimée, false si la confirmation a été
// refusée.
// Même confirmation depuis le menu ⋮ d'une carte, le menu de la liste et
// « Modifier la liste ». Nombres tirés de la copie locale : éléments non
// supprimés, personnes avec qui elle est partagée. « Supprimer » est rouge ;
// le focus va sur « Annuler » (le choix par défaut).
export async function deleteListWithConfirm(list) {
  const itemCount = [...app.data.items.values()].filter((item) => item.listId === list.id).length;
  const sharedWith = (list.members ?? []).filter((m) => !m.isOwner).length;
  const ok = await confirmDialog({
    title: t('menu.supprimer.question', { name: list.name }),
    text: deleteListText(list, itemCount, sharedWith),
    confirmLabel: t('menu.supprimer.confirmer'),
    focusCancel: true,
  });
  if (!ok) return false;
  await actions.deleteList(list.id);
  toast(t('menu.supprimer.fait'), { low: true });
  return true;
}

// --- Dupliquer la liste ---
// Feuille : « Titre de la liste » (« <nom> (copie) ») et « Copier les
// articles » / « Copier les éléments » (activé). La copie est faite par le
// serveur (POST /api/lists/:id/duplicate), en ligne seulement : catégorie,
// magasin, réglages, et les éléments non supprimés, tous décochés ; ni les
// personnes avec qui la liste est partagée, ni le lien public, ni les photos. On reste où l'on est : un
// message propose « Ouvrir » ; sur « Mes listes », la nouvelle carte est
// brièvement mise en évidence.
const offlineDuplicate = () => t('menu.dupliquer.horsLigne');
const NAME_MAX = 100; // comme tout nom de liste

// Liste tout juste créée par une duplication : mise en évidence sur sa carte
// pendant quelques secondes (lists.js)
let fresh = { id: null, until: 0 };
export const isFreshList = (listId, now = Date.now()) => fresh.id === listId && now < fresh.until;

export function openDuplicateSheet(list) {
  if (!navigator.onLine) {
    toast(offlineDuplicate());
    return;
  }
  const words = itemWords(list);
  const name = h('input', { class: 'input', ...LABEL_INPUT, maxlength: String(NAME_MAX), value: copyName(list.name) });
  const nameField = field(t('menu.dupliquer.titre'), name);
  let withItems = true;
  const state = h('span', { class: 'row__sub' });
  const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': t('menu.dupliquer.copier', { items: words.many }) });
  const paint = () => {
    toggle.setAttribute('aria-checked', String(withItems));
    state.textContent = withItems ? t('menu.dupliquer.copier.active', { items: words.many }) : t('menu.dupliquer.copier.desactive');
  };
  toggle.addEventListener('click', () => {
    withItems = !withItems;
    paint();
  });
  paint();
  const error = errorNote();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('menu.dupliquer.valider'));
  const cancel = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, t('menu.dupliquer.annuler'));
  const form = h('form', { class: 'stack', novalidate: true },
    nameField.field,
    h('div', { class: 'card list-options' },
      h('div', { class: 'toggle-row' }, h('div', { class: 'grow' }, h('span', { class: 'row__title' }, t('menu.dupliquer.copier', { items: words.many })), state), toggle)),
    h('p', { class: 'field__hint' }, t('menu.dupliquer.prive')),
    error.note,
    h('div', { class: 'sheet__actions' }, submit, cancel));
  const sheet = openSheet({ title: t('menu.dupliquer.feuille'), content: form });
  cancel.addEventListener('click', () => sheet.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    const title = name.value.replace(/\s+/g, ' ').trim();
    nameField.setError(title ? null : t('menu.dupliquer.titre.obligatoire'));
    if (!title) return;
    if (!navigator.onLine) {
      error.show(offlineDuplicate());
      return;
    }
    submit.disabled = true;
    try {
      const { list: created } = await post(`/api/lists/${list.id}/duplicate`, { name: title, withItems });
      fresh = { id: created.id, until: Date.now() + 4000 };
      sheet.close();
      await refreshData({ quiet: true });
      toast(t('menu.dupliquer.fait', { name: created.name }), { action: t('menu.dupliquer.ouvrir'), onAction: () => navigate('list', { id: created.id }) });
    } catch (err) {
      submit.disabled = false;
      error.show(errorMessage(err));
    }
  });
}

// --- Quitter la liste (contributeur ou invité) ---
// Confirmation, puis le serveur retire l'appartenance de ce compte, et
// seulement la sienne (POST /api/lists/:id/leave), en ligne seulement. Ce qui
// attendait dans la file est envoyé avant. La liste disparaît ensuite de ce
// téléphone (et des autres, par le temps réel). Renvoie true si la liste a
// été quittée.
const offlineLeave = () => t('menu.quitter.horsLigne');

export async function leaveListWithConfirm(list) {
  if (!navigator.onLine) {
    toast(offlineLeave());
    return false;
  }
  const ok = await confirmDialog({
    title: t('menu.quitter.question', { name: list.name }),
    text: t('menu.quitter.texte'),
    confirmLabel: t('menu.quitter.confirmer'),
  });
  if (!ok) return false;
  try {
    await refreshData({ quiet: true }); // envoie d'abord ce qui attend
    await post(`/api/lists/${list.id}/leave`);
  } catch (err) {
    toast(navigator.onLine ? errorMessage(err) : offlineLeave());
    return false;
  }
  refreshData({ quiet: true, full: true }); // la liste disparaît de la copie locale
  return true;
}
