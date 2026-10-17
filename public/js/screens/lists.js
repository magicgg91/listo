// Écran « Mes listes » (maquettes mes-listes-1 à 3) et colonne de gauche de
// la version ordinateur (bureau-1) : une carte par liste, la plus récemment
// active en premier, et le bouton « Nouvelle liste ».

import { h, icon, iconButton, avatar, replace } from '../dom.js';
import { navigate, pathFor } from '../router.js';
import { relativeTime, remainingLabel, namesList } from '../format.js';
import { computeSummaries } from '../store.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill } from '../ui.js';

// Carte d'une liste (balisage de components.html)
export function listCard(list, { selected = false } = {}) {
  const members = list.members.filter((m) => m.active || m.isOwner);
  // Le propriétaire d'abord, puis les invités
  members.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

  let count;
  if (list.total > 0 && list.remaining === 0) {
    count = h('p', { class: 'list-card__count list-card__count--done' }, icon('check', 'icon--sm'), 'Tout est coché');
  } else {
    count = h('p', { class: 'list-card__count' }, list.total === 0 ? 'Liste vide' : remainingLabel(list.remaining));
  }

  return h('a', {
    class: `card list-card${selected ? ' is-selected' : ''}`,
    href: pathFor('list', { id: list.id }),
    'aria-current': selected ? 'page' : null,
    onClick: (event) => {
      // Navigation par le routeur (garde l'historique propre)
      event.preventDefault();
      navigate('list', { id: list.id }, { replace: selected });
    },
  },
  h('div', { class: 'list-card__head' },
    h('h2', { class: 'list-card__name' }, list.name),
    h('span', { class: 'list-card__time' }, relativeTime(list.lastActivity))),
  h('p', { class: 'list-card__meta' },
    h('span', {}, icon(list.category.isShopping ? 'cart' : 'tasks', 'icon--xs'), list.category.name),
    list.store ? h('span', {}, icon('store', 'icon--xs'), list.store.name) : null),
  h('div', { class: 'list-card__foot' },
    count,
    h('div', { class: 'avatars', role: 'img', 'aria-label': `Partagée avec ${namesList(members.map((m) => m.displayName))}` },
      members.slice(0, 4).map((m, i) => avatar(m.displayName, { second: i > 0 })))));
}

// Message quand il n'y a encore aucune liste (mes-listes-2)
function emptyLists() {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon('tasks', 'icon--lg')),
    h('h2', { class: 'empty__title' }, 'Aucune liste pour le moment'),
    h('p', { class: 'empty__text' }, 'Créez une première liste pour commencer à y ajouter des articles.'));
}

const loading = () => h('p', { class: 'empty muted', role: 'status' }, 'Chargement…');

// --- Écran « Mes listes » (téléphone) ---

export function renderLists(onLeave) {
  const content = h('div', { class: 'scroll' });

  const draw = () => {
    if (!app.data.loaded) {
      replace(content, loading());
      return;
    }
    const lists = computeSummaries(app.data);
    // Sur ordinateur, la colonne de gauche montre déjà les listes : on ouvre
    // directement la plus récente
    if (isDesktop() && lists.length) {
      navigate('list', { id: lists[0].id }, { replace: true });
      return;
    }
    replace(content, lists.length ? h('div', { class: 'cards' }, lists.map((list) => listCard(list))) : emptyLists());
  };
  onLeave(onDataChange(draw));
  draw();
  refreshData({ quiet: true });

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar topbar--plain' },
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, 'Mes listes')),
      iconButton('sliders', 'Réglages', () => navigate('settings'))),
    h('div', { class: 'statusbar' }, syncPill(() => refreshData())),
    content,
    h('button', { class: 'fab', type: 'button', onClick: () => navigate('newList') }, icon('plus'), 'Nouvelle liste'));
}

// --- Colonne de gauche (ordinateur) ---
// Renvoie la fonction de désabonnement.

export function renderSidePanel(side, selectedListId) {
  const cards = h('div', { class: 'scroll' });
  const draw = () => {
    if (!app.data.loaded) {
      replace(cards, loading());
      return;
    }
    const lists = computeSummaries(app.data);
    replace(cards, lists.length
      ? h('div', { class: 'cards cards--side' }, lists.map((list) => listCard(list, { selected: list.id === selectedListId })))
      : h('p', { class: 'empty__text muted side-empty' }, 'Aucune liste pour le moment.'));
  };
  const unsubscribe = onDataChange(draw);
  draw();

  replace(side,
    h('div', { class: 'side-head' },
      h('div', { class: 'brand-mark brand-mark--sm', 'aria-hidden': 'true' }, icon('logo')),
      h('p', { class: 'side-head__name' }, 'Listo'),
      iconButton('sliders', 'Réglages', () => navigate('settings'))),
    h('div', { class: 'statusbar statusbar--side' },
      h('h2', { class: 'side-title' }, 'Mes listes'),
      syncPill(() => refreshData())),
    cards,
    h('div', { class: 'side-foot' },
      h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('newList') }, icon('plus'), 'Nouvelle liste')));
  return unsubscribe;
}
