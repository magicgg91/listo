// Menu de gauche de l'interface ordinateur (design/maquettes/pc-A, à partir
// de 1 024 px ; menu qui suit l'écran : décision du 23 novembre 2026,
// maquettes design/accueil-notes/pc-accueil-1 et pc-listes-1).
//
// De haut en bas :
// - la marque (lien vers l'Accueil) et le bouton d'aide (raccourcis) ;
// - le champ « Rechercher une liste » ;
// - les entrées fixes, dans l'ordre du bandeau du téléphone : « Accueil »,
//   « Échéances » (avec sa pastille : tâches en retard et du jour),
//   « Listes » (nombre de listes). « Notes » viendra après « Listes »
//   (étape 2 du cadrage) ;
// - dessous, le menu suit l'écran :
//   · écrans des listes (Listes, une liste) : seulement « Types », les types
//     que la personne a (Courses, Tâches, Envies), avec leur nombre de
//     listes et le point des nouveautés. Le type choisi montre au centre
//     seulement ses listes (lists.js) ; une liste ouverte met en avant son
//     type. L'entrée fixe « Listes » montre toutes les listes ;
//   · autres écrans (Accueil, Échéances, Réglages, Aide…) : rien de plus ;
//   · pendant une recherche, sur n'importe quel écran : les listes trouvées,
//     groupées par type, avec leur compteur « restants/total » ;
// - en bas : « Nouvelle liste » (touche N), le compte connecté et
//   « Réglages ».
//
// Le menu est créé une fois et gardé d'un écran à l'autre (texte cherché et
// défilement conservés) ; seul ce qui dépend de l'écran change.
// Rien ici ne donne un droit : chaque action est revérifiée par le serveur.

import { h, icon, iconButton, avatar, replace } from '../dom.js';
import { navigate, pathFor } from '../router.js';
import { newsBadgeLabel } from '../format.js';
import { progressText, progressLabel } from '../words.js';
import { listIcon } from '../list-icons.js';
import { LIST_TYPES, TYPE_LABELS, TYPE_ICONS, typeOf, isListType } from '../list-types.js';
import { computeSummaries, loadListSort, newsBadge, listCountsByType } from '../store.js';
import { app, onDataChange } from '../app.js';
import { drawWhenIdle, watchNewDay } from '../ui.js';
import { deadlineBadge } from '../deadlines.js';
import { deadlinesLabel } from '../tabbar.js';
import { keepFieldFocus } from '../tap.js';
import { isSearching, filterLists, highlightParts, listsLabel } from '../search.js';
import { openShortcuts, keycap } from '../shortcuts.js';
import { t } from '../i18n.js';

// --- Type de listes choisi (ordinateur) ---
// « all » (entrée fixe « Listes ») ou un type (shopping, tasks, wishes).
// Gardé pour la visite seulement (ce n'est pas un réglage) ; lu par l'écran
// « Listes » de l'ordinateur (lists.js) et choisi par le menu ou par une
// ligne de la tuile « Listes » de l'Accueil (home.js).
let pcType = 'all';
export const pcListType = () => pcType;
export function setPcListType(type) {
  pcType = isListType(type) ? type : 'all';
}

// Écrans des listes : le menu y montre les types
const LIST_SCREENS = ['lists', 'list', 'editList', 'newList'];

// Ordre des listes du menu (types dans l'ordre Courses, Tâches, Envies,
// puis le tri choisi) : celui des touches [ et ] (liste précédente,
// suivante) et des résultats d'une recherche
function listsInMenuOrder(lists) {
  return LIST_TYPES.flatMap((type) => lists.filter((list) => typeOf(list) === type));
}

// Crée le menu. Renvoie { el, select(route), goList(delta), dispose() }.
export function createPcSide() {
  let selected = { name: null, listId: null, key: null };

  // --- Recherche des listes (sur le nom, listes partagées comprises) ---
  const input = h('input', {
    class: 'searchfield__input',
    type: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: '100',
    placeholder: t('navigation.recherche.placeholder'),
    'aria-label': t('navigation.recherche.libelle'),
    'aria-keyshortcuts': '/',
  });
  const clearButton = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': t('navigation.recherche.effacer'),
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

  // --- Entrées fixes : Accueil, Échéances, Listes ---
  // Un lien réel (adresse de l'écran) ; le routeur garde l'historique propre
  const fixedLink = (name, iconName, label, ...end) => h('a', {
    class: 'pc-nav__item',
    href: pathFor(name),
    onClick: (event) => {
      event.preventDefault();
      if (name === 'lists') setPcListType('all'); // « Listes » : toutes les listes
      navigate(name, {}, { replace: selected.name === name });
    },
  }, h('span', { class: 'pc-nav__icon' }, icon(iconName, 'icon--sm')), h('span', { class: 'pc-nav__name' }, label), ...end);

  const homeLink = fixedLink('home', 'home', t('navigation.accueil'));
  // « Échéances » (deadlines.js) avec sa pastille numérique
  const deadlinesCount = h('span', { class: 'news-badge', 'aria-hidden': 'true', hidden: true });
  const deadlinesLink = fixedLink('deadlines', 'calendar', t('navigation.echeances'), deadlinesCount);
  // « Listes » avec le nombre de listes (lu « Listes, 5 listes »)
  const listsCount = h('span', { class: 'pc-nav__count', 'aria-hidden': 'true' });
  const listsLink = fixedLink('lists', 'tasks', t('navigation.listes'), listsCount);
  // (étape 2 du cadrage : l'entrée « Notes » se placera ici, après « Listes »)
  const main = h('div', { class: 'pc-side__main' }, homeLink, deadlinesLink, listsLink);

  const markCurrent = (link, on) => {
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  };
  const drawFixed = () => {
    const count = app.data.loaded ? deadlineBadge(app.data, undefined, app.user?.id ?? null) : 0;
    deadlinesCount.hidden = count === 0;
    deadlinesCount.textContent = count > 99 ? '99+' : String(count);
    deadlinesLink.setAttribute('aria-label', deadlinesLabel(count));
    const lists = app.data.loaded ? app.data.lists.size : null;
    listsCount.textContent = lists === null ? '' : String(lists);
    if (lists === null) listsLink.removeAttribute('aria-label');
    else listsLink.setAttribute('aria-label', t('navigation.listes.nombre', { count: lists }));
    markCurrent(homeLink, selected.name === 'home');
    markCurrent(deadlinesLink, selected.name === 'deadlines');
    markCurrent(listsLink, selected.name === 'lists' && pcType === 'all');
  };
  const stopDay = watchNewDay(drawFixed);

  // --- Partie qui suit l'écran : types, ou résultats de la recherche ---
  const nav = h('nav', { class: 'pc-nav' });
  // Place laissée libre quand il n'y a rien dessous (le pied reste en bas)
  const filler = h('div', { class: 'grow', hidden: true });
  const showNav = (on) => {
    nav.hidden = !on;
    filler.hidden = on;
  };

  // Une liste trouvée : icône (avec la pastille des nouveautés), nom, « 5/8 »
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

  // Un type : icône, nom, point des nouveautés, nombre de listes. Choisi
  // (écran « Listes » filtré sur ce type) : aria-current="page" ; type de la
  // liste ouverte : aria-current="true" (même mise en avant)
  const typeEntry = ({ type, count, news }) => {
    const chosen = selected.name === 'lists' && pcType === type;
    const open = selected.listId ? app.data.lists.get(selected.listId) : null;
    const ofOpenList = Boolean(open) && typeOf(open) === type;
    return h('li', {}, h('a', {
      class: 'pc-nav__item',
      href: pathFor('lists'),
      'aria-current': chosen ? 'page' : ofOpenList ? 'true' : null,
      'aria-label': news
        ? t('listes.type.lu.nouveautes', { type: TYPE_LABELS[type], count })
        : t('listes.type.lu', { type: TYPE_LABELS[type], count }),
      onClick: (event) => {
        event.preventDefault();
        setPcListType(type);
        navigate('lists', {}, { replace: selected.name === 'lists' });
      },
    },
    h('span', { class: 'pc-nav__icon' }, icon(TYPE_ICONS[type], 'icon--sm')),
    h('span', { class: 'pc-nav__name' }, TYPE_LABELS[type]),
    news ? h('span', { class: 'news-badge news-badge--dot', 'aria-hidden': 'true' }) : null,
    h('span', { class: 'pc-nav__count', 'aria-hidden': 'true' }, String(count))));
  };

  const draw = () => {
    drawFixed();
    const query = input.value;
    const searching = isSearching(query);
    if (!app.data.loaded) {
      status.textContent = '';
      showNav(searching || LIST_SCREENS.includes(selected.name));
      nav.removeAttribute('aria-label');
      replace(nav, h('p', { class: 'pc-nav__empty', role: 'status' }, t('navigation.chargement')));
      return;
    }
    // Recherche : les listes trouvées, sur n'importe quel écran
    if (searching) {
      const lists = filterLists(computeSummaries(app.data, { sort: loadListSort() }), query);
      status.textContent = listsLabel(lists.length);
      showNav(true);
      nav.setAttribute('aria-label', t('navigation.recherche.resultats'));
      if (!lists.length) {
        replace(nav, h('p', { class: 'pc-nav__empty' }, t('navigation.recherche.aucune')));
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
      return;
    }
    status.textContent = '';
    // Autres écrans : seulement les entrées fixes
    if (!LIST_SCREENS.includes(selected.name)) {
      showNav(false);
      replace(nav);
      return;
    }
    // Écrans des listes : « Types »
    showNav(true);
    nav.setAttribute('aria-label', t('navigation.types.libelle'));
    const types = listCountsByType(app.data);
    if (!types.length) {
      replace(nav, h('p', { class: 'pc-nav__empty' }, t('navigation.listes.aucune')));
      return;
    }
    replace(nav,
      h('h2', { class: 'pc-nav__group', id: 'pc-nav-types' }, t('navigation.types')),
      h('ul', { 'aria-labelledby': 'pc-nav-types' }, types.map(typeEntry)));
  };
  const idle = drawWhenIdle(nav, draw);
  const unsubscribe = onDataChange(idle.request);

  // --- Marque, pied (« Nouvelle liste », compte, Réglages) ---
  const home = h('a', {
    class: 'pc-brand__home',
    href: pathFor('home'),
    onClick: (event) => {
      event.preventDefault();
      navigate('home', {}, { replace: selected.name === 'home' });
    },
  }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('logo')), h('span', { class: 'pc-brand__name' }, 'Listo'),
  h('span', { class: 'visually-hidden' }, ` ${t('navigation.marque.accueil')}`));
  const user = app.user ?? {};
  const el = h('aside', { class: 'pc-side', 'aria-label': t('navigation.libelle') },
    // « ? » : la fenêtre des raccourcis (elle mène aussi à l'aide)
    h('div', { class: 'pc-brand' }, home, h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': t('navigation.raccourcis'), 'aria-haspopup': 'dialog', 'aria-keyshortcuts': '?', 'data-pc-tip': t('navigation.raccourcis.infobulle'), onClick: () => openShortcuts(),
    }, icon('help'))),
    h('label', { class: 'searchfield' }, icon('search', 'icon--sm'), input, clearButton, keycap('/')),
    status,
    main,
    nav,
    filler,
    h('div', { class: 'pc-side__foot' },
      h('button', { class: 'btn btn--primary btn--block', type: 'button', 'aria-keyshortcuts': 'N', onClick: () => navigate('newList') }, icon('plus', 'icon--sm'), t('navigation.nouvelleListe'), keycap('N')),
      h('div', { class: 'pc-user' },
        avatar(user.displayName),
        h('span', { class: 'pc-user__text' },
          h('span', { class: 'pc-user__name' }, user.displayName ?? ''),
          // Rôle du compte (pas un droit sur une liste) : « Admin » seulement
          user.role === 'admin' ? h('span', { class: 'pc-user__role' }, t('navigation.role.admin')) : null),
        iconButton('sliders', t('navigation.reglages'), () => navigate('settings')))));
  draw();

  return {
    el,
    // Écran affiché : repère l'entrée fixe, le type choisi, ou la liste
    // ouverte (et son type)
    select(route) {
      const listId = ['list', 'editList'].includes(route?.name) ? route.params.id : null;
      const name = route?.name ?? null;
      const key = JSON.stringify([name, listId, pcType]);
      if (key === selected.key) return;
      selected = { name, listId, key };
      draw();
    },
    // Touches [ et ] : liste précédente ou suivante, dans l'ordre du menu
    // (types, puis le tri choisi ; seulement les listes trouvées pendant une
    // recherche). Sans liste ouverte : la première, ou la dernière.
    goList(delta) {
      if (!app.data.loaded) return;
      const all = computeSummaries(app.data, { sort: loadListSort() });
      const lists = listsInMenuOrder(isSearching(input.value) ? filterLists(all, input.value) : all);
      if (!lists.length) return;
      const index = lists.findIndex((list) => list.id === selected.listId);
      const next = lists[Math.min(lists.length - 1, Math.max(0, (index < 0 ? (delta > 0 ? -1 : lists.length) : index) + delta))];
      if (next && next.id !== selected.listId) navigate('list', { id: next.id });
    },
    dispose() {
      unsubscribe();
      idle.stop();
      stopDay();
    },
  };
}

// Nom d'une liste, le texte cherché dans <mark class="hit"> (texte simple,
// jamais de HTML)
function nameWithHits(name, query) {
  if (!isSearching(query)) return name;
  return highlightParts(name, query).map((part) => (part.hit ? h('mark', { class: 'hit' }, part.text) : part.text));
}
