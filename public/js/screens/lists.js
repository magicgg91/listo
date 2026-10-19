// Écran « Mes listes » (maquettes mes-listes-1 à 3) et colonne de gauche de
// la version ordinateur (bureau-1) : une carte par liste, la plus récemment
// active en premier, et le bouton « Nouvelle liste ».

import { h, icon, iconButton, avatar, replace, multiBadge } from '../dom.js';
import { navigate, pathFor } from '../router.js';
import { relativeTime, remainingLabel, namesList, listSortButton } from '../format.js';
import { computeSummaries, canEditList, loadListSort, saveListSort, pruneListMemory } from '../store.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, toast, drawWhenIdle, openMenu } from '../ui.js';
import { listActions, isFreshList } from './list-actions.js';
import { listIcon } from '../list-icons.js';

// Vrai si la liste a un lien public en cours (information donnée au
// propriétaire seulement ; l'expiration est revérifiée avec l'heure du téléphone)
export function hasPublicLink(list, now = Date.now()) {
  const link = list.publicLink;
  return Boolean(link) && (link.expiresAt === null || Date.parse(link.expiresAt) > now);
}

// Carte d'une liste (balisage de components.html). Avec des actions, la carte
// (un lien qui ouvre la liste) est accompagnée d'un bouton « ⋯ » posé dans son
// coin : un appui sur ce bouton ouvre le menu sans ouvrir la liste. Les
// actions sont les mêmes que dans le menu ⋮ de la liste (list-actions.js) ;
// après « Modifier la liste » ou le partage, on revient ici.
export function listCard(list, { selected = false } = {}) {
  const card = cardLink(list, { selected });
  const actions = listActions(list);
  if (!actions.length) return card;
  const menuButton = iconButton('more', `Actions de la liste ${list.name}`, () => {
    menuButton.setAttribute('aria-expanded', 'true');
    openMenu(actions, { label: `Actions de la liste ${list.name}`, anchor: menuButton, onClose: () => menuButton.setAttribute('aria-expanded', 'false') });
  }, 'list-card__menu');
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');
  return h('div', { class: 'list-card-wrap' }, card, menuButton);
}

function cardLink(list, { selected }) {
  const members = list.members.filter((m) => m.active || m.isOwner);
  // Le propriétaire d'abord, puis les invités
  members.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

  let count;
  if (list.total > 0 && list.remaining === 0) {
    count = h('p', { class: 'list-card__count list-card__count--done' }, icon('check', 'icon--sm'), 'Tout est coché');
  } else {
    count = h('p', { class: 'list-card__count' }, list.total === 0 ? 'Liste vide' : remainingLabel(list.remaining, list));
  }

  return h('a', {
    // Liste tout juste créée par « Dupliquer la liste » : brève mise en évidence
    class: `card list-card${selected ? ' is-selected' : ''}${isFreshList(list.id) ? ' list-card--fresh' : ''}`,
    href: pathFor('list', { id: list.id }),
    'aria-current': selected ? 'page' : null,
    onClick: (event) => {
      // Navigation par le routeur (garde l'historique propre)
      event.preventDefault();
      navigate('list', { id: list.id }, { replace: selected });
    },
  },
  h('div', { class: 'list-card__head' },
    // Icône de la liste (celle choisie, sinon celle de sa catégorie)
    h('span', { class: 'list-card__icon' }, icon(listIcon(list), 'icon--sm')),
    h('h2', { class: 'list-card__name' }, list.name),
    h('span', { class: 'list-card__time' }, relativeTime(list.lastActivity))),
  h('p', { class: 'list-card__meta' },
    h('span', {}, icon(list.category.isShopping ? 'cart' : 'tasks', 'icon--xs'), list.category.name),
    list.store ? h('span', {}, icon('store', 'icon--xs'), list.store.name, list.store.isMulti && list.category.isShopping ? [' ', multiBadge()] : null) : null,
    // Lien public en cours (propriétaire seulement) : petit rappel
    hasPublicLink(list) ? h('span', { role: 'img', 'aria-label': 'Partagée par lien public', title: 'Partagée par lien public' }, icon('link', 'icon--xs')) : null,
    // Liste partagée avec moi en lecture seule : pastille (icône ET texte)
    canEditList(list) ? null : h('span', { class: 'chip chip--readonly' }, icon('eye', 'icon--xs'), 'Lecture seule')),
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
    h('p', { class: 'empty__text' }, 'Créez une première liste pour commencer à y ajouter des éléments.'));
}

const loading = () => h('p', { class: 'empty muted', role: 'status' }, 'Chargement…');

// --- Tri des listes ---

// Tri choisi (« recent » ou « alpha »), gardé sur ce téléphone (voir store.js)
let listSort = null;
const currentSort = () => {
  listSort ??= loadListSort();
  return listSort;
};

// Bouton de tri (barre du haut) : un appui bascule entre « Plus récentes
// d'abord » et « Ordre alphabétique ». L'icône montre le tri actif ; le
// libellé lu par les lecteurs d'écran dit le tri actuel et l'effet d'un
// appui ; le nouveau tri est annoncé (zone masquée) et affiché 2 secondes.
// Masqué s'il y a moins de deux listes (rien à trier).
// onChange : redessine les listes. Renvoie { button, status, setCount }.
function sortControl(onChange) {
  const status = h('p', { class: 'visually-hidden', role: 'status' });
  const button = h('button', { class: 'icon-btn', type: 'button', onClick: () => {
    listSort = currentSort() === 'alpha' ? 'recent' : 'alpha';
    saveListSort(listSort);
    show();
    const { message } = listSortButton(listSort);
    status.textContent = message;
    toast(message, { duration: 2000 }); // au-dessus du bouton « Nouvelle liste »
    onChange();
  } });
  const show = () => {
    const { icon: iconName, label } = listSortButton(currentSort());
    button.setAttribute('aria-label', label);
    replace(button, icon(iconName));
  };
  show();
  return { button, status, setCount: (count) => { button.hidden = count < 2; } };
}

// --- Écran « Mes listes » (téléphone) ---

export function renderLists(onLeave) {
  const content = h('div', { class: 'scroll' });
  const sorter = sortControl(() => draw());

  const draw = () => {
    if (!app.data.loaded) {
      replace(content, loading());
      return;
    }
    // Sur ordinateur, la colonne de gauche montre déjà les listes : on ouvre
    // directement la plus récente
    if (isDesktop()) {
      const recent = computeSummaries(app.data);
      if (recent.length) {
        navigate('list', { id: recent[0].id }, { replace: true });
        return;
      }
    }
    const lists = computeSummaries(app.data, { sort: currentSort() });
    sorter.setCount(lists.length);
    pruneListMemory(lists.map((list) => list.id)); // tri et groupes repliés des listes disparues : oubliés
    replace(content, lists.length ? h('div', { class: 'cards' }, lists.map((list) => listCard(list))) : emptyLists());
  };
  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });

  return h('div', { class: 'screen' },
    // Barre du haut sur une ligne : titre, pastille d'état (réduite à
    // l'icône si la place manque), tri des listes, réglages
    h('header', { class: 'topbar topbar--plain topbar--status' },
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, 'Mes listes')),
      syncPill(() => refreshData({ full: true }), { inBar: true }),
      sorter.button,
      iconButton('sliders', 'Réglages', () => navigate('settings'))),
    sorter.status,
    content,
    h('button', { class: 'fab', type: 'button', onClick: () => navigate('newList') }, icon('plus'), 'Nouvelle liste'));
}

// --- Colonne de gauche (ordinateur) ---
// Renvoie la fonction de désabonnement.

export function renderSidePanel(side, selectedListId) {
  const cards = h('div', { class: 'scroll' });
  const sorter = sortControl(() => draw());
  const draw = () => {
    if (!app.data.loaded) {
      replace(cards, loading());
      return;
    }
    const lists = computeSummaries(app.data, { sort: currentSort() });
    sorter.setCount(lists.length);
    replace(cards, lists.length
      ? h('div', { class: 'cards cards--side' }, lists.map((list) => listCard(list, { selected: list.id === selectedListId })))
      : h('p', { class: 'empty__text muted side-empty' }, 'Aucune liste pour le moment.'));
  };
  const idle = drawWhenIdle(cards, draw);
  const unsubscribe = onDataChange(idle.request);
  draw();

  replace(side,
    h('div', { class: 'side-head' },
      h('div', { class: 'brand-mark brand-mark--sm', 'aria-hidden': 'true' }, icon('logo')),
      h('p', { class: 'side-head__name' }, 'Listo'),
      sorter.button,
      iconButton('sliders', 'Réglages', () => navigate('settings'))),
    sorter.status,
    h('div', { class: 'statusbar statusbar--side' },
      h('h2', { class: 'side-title' }, 'Mes listes'),
      syncPill(() => refreshData({ full: true }))),
    cards,
    h('div', { class: 'side-foot' },
      h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('newList') }, icon('plus'), 'Nouvelle liste')));
  return () => {
    unsubscribe();
    idle.stop();
  };
}
