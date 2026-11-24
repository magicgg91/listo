// Morceaux communs aux deux onglets de la Corbeille des Réglages (une seule
// page depuis le 24 novembre 2026, trash-page.js) : « Listes » (trash.js)
// et « Notes » (note-trash.js). Les deux onglets sont faits pareil, en
// compact :
// - une phrase courte (.page-intro) ;
// - une ligne d'outils (.page-tools) : le nombre à gauche (« 4 listes »,
//   « 2 notes »), « Vider la corbeille » à droite ;
// - une carte .group de lignes .trash-row (titre et actions sur la même
//   ligne, puis les lignes d'information en petit gris).
// La page (trash-page.js) pose au-dessus la barre du haut des Réglages et
// les onglets.
// Textes posés avec textContent (h()) ; aucun curseur mis tout seul.

import { h, icon } from '../dom.js';
import { t, formatDate } from '../i18n.js';

// Contenu d'un onglet : renvoie ses morceaux pour que chaque corbeille les
// remplisse. panel : le bloc posé dans la page (caché quand l'onglet ne
// l'est pas). banner (facultatif) : bandeau sous la phrase (hors ligne,
// listes). onEmpty : « Vider la corbeille » (confirmation faite par
// l'appelant).
export function trashPanel({ intro, banner = null, onEmpty }) {
  const count = h('span', { class: 'page-tools__count' });
  const emptyButton = h('button', { class: 'cart__action cart__action--danger', type: 'button', 'data-trash-action': 'empty', onClick: onEmpty },
    icon('trash', 'icon--sm'), t('corbeille.vider'));
  const tools = h('div', { class: 'page-tools', hidden: true }, count, emptyButton);
  const content = h('div', {});
  const panel = h('div', {}, h('p', { class: 'page-intro' }, intro), banner, tools, content);
  return { panel, tools, count, content };
}

// Une ligne de la corbeille. Ligne 1 : le titre (gras, passe à la ligne)
// et, à droite, « Supprimer définitivement » (poubelle rouge, 44 px) puis
// « Restaurer » ; dessous, sur toute la largeur, les lignes d'information
// (meta : textes, les vides sont ignorés). Les deux boutons portent le nom
// dans leur nom lu (restoreLabel : « Restaurer la liste « Courses » »).
export function trashRow({ name, meta, restoreLabel, onPurge, onRestore }) {
  return h('div', { class: 'trash-row' },
    h('span', { class: 'trash-row__title' }, name),
    h('span', { class: 'trash-row__actions' },
      h('button', { class: 'icon-btn trash-row__purge', type: 'button', 'data-trash-action': 'purge', 'aria-label': t('corbeille.definitif.label', { name }), onClick: onPurge }, icon('trash')),
      h('button', { class: 'btn btn--sm btn--secondary', type: 'button', 'data-trash-action': 'restore', 'aria-label': restoreLabel, onClick: onRestore }, t('corbeille.restaurer'))),
    meta.filter(Boolean).map((line) => h('span', { class: 'trash-row__meta' }, line)));
}

// « Supprimée le 21 nov. · encore 28 jours » (« Deleted Nov 21 · 28 days
// left ») : même date courte et même pluriel pour les listes et les notes
export const deletedText = (deletedAt, daysLeft) =>
  t('corbeille.ligne', { date: formatDate(new Date(deletedAt), { day: 'numeric', month: 'short' }), count: daysLeft });

// Corbeille vide (ou indisponible) : le bloc .empty du kit
export function trashEmpty(iconName, title, text) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconName, 'icon--lg')),
    h('h2', { class: 'empty__title' }, title),
    h('p', { class: 'empty__text' }, text));
}

// Demande de confirmation commune (« Supprimer définitivement « X » ? »,
// bouton rouge, focus de départ sur « Annuler »)
export const purgeQuestion = (name, text) => ({
  title: t('corbeille.definitif.question', { name }),
  text,
  confirmLabel: t('corbeille.definitif'),
  focusCancel: true,
});
export const emptyQuestion = (text) => ({
  title: t('corbeille.vider.question'),
  text,
  confirmLabel: t('corbeille.vider.confirmer'),
  focusCancel: true,
});
