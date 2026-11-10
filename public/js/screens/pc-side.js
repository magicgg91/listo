// Menu de gauche de l'interface ordinateur (design/maquettes/pc-A, à partir
// de 1 024 px) : marque (lien vers « Mes listes ») et bouton d'aide, champ
// « Rechercher une liste », listes groupées par type (Courses, Tâches,
// Envies) avec leur compteur « restants/total », puis « Nouvelle liste »,
// le compte connecté et « Réglages ».
//
// Le menu est créé une fois et gardé d'un écran à l'autre (texte cherché et
// défilement conservés) ; seule la liste ouverte change (aria-current).
// Rien ici ne donne un droit : chaque action est revérifiée par le serveur.

import { h, icon, iconButton, avatar, replace } from '../dom.js';
import { navigate, pathFor } from '../router.js';
import { newsBadgeLabel } from '../format.js';
import { progressText, progressLabel } from '../words.js';
import { listIcon } from '../list-icons.js';
import { LIST_TYPES, TYPE_LABELS, typeOf } from '../list-types.js';
import { computeSummaries, loadListSort, newsBadge } from '../store.js';
import { app, onDataChange } from '../app.js';
import { drawWhenIdle } from '../ui.js';
import { keepFieldFocus } from '../tap.js';
import { isSearching, filterLists, highlightParts, listsLabel } from '../search.js';
import { openShortcuts, keycap } from '../shortcuts.js';

// Crée le menu. Renvoie { el, select(route), dispose() }.
export function createPcSide() {
  let selected = { name: null, listId: null };

  // --- Recherche des listes (sur le nom, listes partagées comprises) ---
  const input = h('input', {
    class: 'searchfield__input',
    type: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: '100',
    placeholder: 'Rechercher',
    'aria-label': 'Rechercher une liste',
    'aria-keyshortcuts': '/',
  });
  const clearButton = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': 'Effacer la saisie',
    hidden: true,
    onPointerdown: keepFieldFocus.pointerdown,
    onMousedown: keepFieldFocus.mousedown,
    onClick: () => setQuery(''),
  }, icon('x-circle'));
  // Nombre de listes trouvées, annoncé aux lecteurs d'écran
  const status = h('p', { class: 'visually-hidden', role: 'status' });
  const setQuery = (value) => {
    input.value = value;
    clearButton.hidden = value === '';
    draw();
  };
  input.addEventListener('input', () => setQuery(input.value));
  // Échap : vide le champ (le curseur reste)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value !== '') {
      event.preventDefault();
      setQuery('');
    }
  });

  // --- Listes groupées par type ---
  const nav = h('nav', { class: 'pc-nav', 'aria-label': 'Mes listes' });

  // Une entrée : icône (avec la pastille des nouveautés), nom, « 5/8 »
  const entry = (list, query) => {
    const current = selected.listId === list.id;
    const text = progressLabel(list.remaining, list.total, list);
    const news = newsBadge(app.data, list.id);
    return h('li', {}, h('a', {
      class: 'pc-nav__item',
      href: pathFor('list', { id: list.id }),
      'aria-current': current ? 'page' : null,
      onClick: (event) => {
        event.preventDefault();
        navigate('list', { id: list.id }, { replace: current });
      },
    },
    h('span', { class: 'pc-nav__icon' }, icon(listIcon(list), 'icon--sm')),
    h('span', { class: 'pc-nav__name' }, nameWithHits(list.name, query)),
    // Nouveautés : pastille numérique avant le compteur (« 3 nouveautés »)
    news ? h('span', { class: 'news-badge', role: 'img', 'aria-label': newsBadgeLabel(news), title: newsBadgeLabel(news) }, news) : null,
    h('span', { class: 'pc-nav__count', role: 'img', 'aria-label': text, title: text }, progressText(list.remaining, list.total))));
  };

  const draw = () => {
    if (!app.data.loaded) {
      replace(nav, h('p', { class: 'pc-nav__empty', role: 'status' }, 'Chargement…'));
      return;
    }
    const all = computeSummaries(app.data, { sort: loadListSort() });
    const query = input.value;
    const lists = isSearching(query) ? filterLists(all, query) : all;
    status.textContent = isSearching(query) ? listsLabel(lists.length) : '';
    if (!lists.length) {
      replace(nav, h('p', { class: 'pc-nav__empty' }, isSearching(query) ? 'Aucune liste trouvée.' : 'Aucune liste pour le moment.'));
      return;
    }
    replace(nav, LIST_TYPES.map((type) => {
      const ofType = lists.filter((list) => typeOf(list) === type);
      if (!ofType.length) return null;
      const id = `pc-nav-${type}`;
      return [
        h('h2', { class: 'pc-nav__group', id }, TYPE_LABELS[type]),
        h('ul', { 'aria-labelledby': id }, ofType.map((list) => entry(list, query))),
      ];
    }));
  };
  const idle = drawWhenIdle(nav, draw);
  const unsubscribe = onDataChange(idle.request);

  // --- Marque, pied (« Nouvelle liste », compte, Réglages) ---
  const home = h('a', {
    class: 'pc-brand__home',
    href: pathFor('lists'),
    onClick: (event) => {
      event.preventDefault();
      navigate('lists');
    },
  }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('logo')), h('span', { class: 'pc-brand__name' }, 'Listo'),
  h('span', { class: 'visually-hidden' }, ' : Mes listes'));
  const user = app.user ?? {};
  const el = h('aside', { class: 'pc-side', 'aria-label': 'Navigation' },
    // « ? » : la fenêtre des raccourcis (elle mène aussi à l'aide)
    h('div', { class: 'pc-brand' }, home, h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': 'Raccourcis clavier', 'aria-haspopup': 'dialog', 'aria-keyshortcuts': '?', 'data-pc-tip': 'Raccourcis clavier · ?', onClick: () => openShortcuts(),
    }, icon('help'))),
    h('label', { class: 'searchfield' }, icon('search', 'icon--sm'), input, clearButton, keycap('/')),
    status,
    nav,
    h('div', { class: 'pc-side__foot' },
      h('button', { class: 'btn btn--primary btn--block', type: 'button', 'aria-keyshortcuts': 'N', onClick: () => navigate('newList') }, icon('plus', 'icon--sm'), 'Nouvelle liste', keycap('N')),
      h('div', { class: 'pc-user' },
        avatar(user.displayName),
        h('span', { class: 'pc-user__text' },
          h('span', { class: 'pc-user__name' }, user.displayName ?? ''),
          // Rôle du compte (pas un droit sur une liste) : « Admin » seulement
          user.role === 'admin' ? h('span', { class: 'pc-user__role' }, 'Admin') : null),
        iconButton('sliders', 'Réglages', () => navigate('settings')))));
  draw();

  return {
    el,
    // Écran affiché : repère la liste ouverte, ou « Mes listes »
    select(route) {
      const listId = ['list', 'editList'].includes(route?.name) ? route.params.id : null;
      const name = route?.name ?? null;
      if (listId === selected.listId && name === selected.name) return;
      selected = { name, listId };
      if (name === 'lists') home.setAttribute('aria-current', 'page');
      else home.removeAttribute('aria-current');
      draw();
    },
    dispose() {
      unsubscribe();
      idle.stop();
    },
  };
}

// Nom d'une liste, le texte cherché dans <mark class="hit"> (texte simple,
// jamais de HTML)
function nameWithHits(name, query) {
  if (!isSearching(query)) return name;
  return highlightParts(name, query).map((part) => (part.hit ? h('mark', { class: 'hit' }, part.text) : part.text));
}
