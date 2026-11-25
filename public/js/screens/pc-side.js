// Menu de gauche de l'interface ordinateur (design/maquettes/pc-A, à partir
// de 1 024 px ; menu qui suit l'écran : décision du 23 novembre 2026,
// maquettes design/accueil-notes/pc-accueil-1 et pc-listes-1).
//
// De haut en bas :
// - la marque (lien vers l'Accueil) et le bouton d'aide (raccourcis) ;
// - le champ « Rechercher une liste » ;
// - les entrées fixes, dans l'ordre du bandeau du téléphone : « Accueil »
//   (absent quand la personne l'a coupé dans Réglages › Accueil : la marque
//   mène alors au premier écran choisi),
//   « Échéances » (avec ses deux pastilles, au bout de la ligne : la rouge
//   pour les tâches en retard, puis la verte pour celles du jour ; chacune
//   seulement si son nombre n'est pas nul ; décision du 24 novembre 2026),
//   « Listes » (nombre de listes), « Notes » (nombre de notes, étape 2 ;
//   absent quand la personne a coupé les notes dans Réglages › Fonctions),
//   « Projets » (nombre de projets ; seulement quand la personne a allumé
//   les projets, docs/cadrage-projets.md 3.4) ;
// - dessous, le menu suit l'écran :
//   · écrans des listes (Listes, une liste, « À offrir ») : seulement « Types », les types
//     que la personne a (Courses, Tâches, Envies), avec leur nombre de
//     listes et le point des nouveautés. Le type choisi montre au centre
//     seulement ses listes (lists.js) ; une liste ouverte met en avant son
//     type. L'entrée fixe « Listes » montre toutes les listes ;
//   · écrans des projets (Projets, un projet, une carte, réglages et cartes
//     supprimées d'un projet) : « Projets » et la liste de mes projets
//     (nom, point des nouveautés, nombre de cartes), le projet ouvert mis
//     en avant ;
//   · autres écrans (Accueil, Échéances, Notes, Réglages, Aide…) : rien de
//     plus (catégories des notes : abandonnées le 23 novembre 2026) ;
//   · pendant une recherche, sur n'importe quel écran : les listes trouvées,
//     groupées par type, avec leur compteur « restants/total » ;
// - en bas : « Nouvelle liste » (touche N), « Nouvelle note » sur les
//   écrans des notes (jamais quand les notes sont coupées), « Nouveau
//   projet » sur les écrans des projets et « Nouvelle carte » dans un projet
//   (pour qui peut créer des cartes), le compte connecté et « Réglages ».
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
import { computeSummaries, loadListSort, newsBadge, listCountsByType, notesHaveNews } from '../store.js';
import { liveNotes } from '../notes.js';
import { app, onDataChange, openingScreen } from '../app.js';
import { notesOn, projectsOn } from '../features.js';
import { projectRights } from '../projects.js';
import { cardCount, projectUnread } from '../project-view.js';
import { projectsInOrder, openNewProject } from './projects.js';
import { startNewCard } from './project.js';
import { drawWhenIdle, watchNewDay, watchMinute } from '../ui.js';
import { deadlineBadges, deadlinesLabel, badgeText } from '../deadlines.js';
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

// Noms des premiers écrans possibles (marque, Accueil coupé)
const SCREEN_NAMES = { deadlines: () => t('navigation.echeances'), lists: () => t('navigation.listes'), notes: () => t('navigation.notes'), projects: () => t('navigation.projets') };

// Écrans des listes : le menu y montre les types (« À offrir » compris :
// Envies y est mis en avant)
const LIST_SCREENS = ['lists', 'list', 'editList', 'newList', 'gifts'];
// Écrans des notes : « Notes » mis en avant, « Nouvelle note » en bas
export const NOTE_SCREENS = ['notes', 'note', 'newNote'];
// Écrans des projets : « Projets » mis en avant, les projets dessous
export const PROJECT_SCREENS = ['projects', 'project', 'projectCard', 'projectSettings', 'projectTrash'];
// Écrans d'un projet ouvert (« Nouvelle carte » en bas du menu)
const BOARD_SCREENS = ['project', 'projectCard'];

// Ordre des listes du menu (types dans l'ordre Courses, Tâches, Envies,
// puis le tri choisi) : celui des touches [ et ] (liste précédente,
// suivante) et des résultats d'une recherche
function listsInMenuOrder(lists) {
  return LIST_TYPES.flatMap((type) => lists.filter((list) => typeOf(list) === type));
}

// Nombre de notes (hors corbeille), dans la copie locale
const countNotes = () => liveNotes([...app.data.notes.values()]).length;

// Crée le menu. Renvoie { el, select(route), goList(delta), dispose() }.
export function createPcSide() {
  let selected = { name: null, listId: null, projectId: null, key: null };

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
  // « Échéances » (deadlines.js) avec ses deux pastilles : rouge (en
  // retard) puis verte (aujourd'hui), les nombres .count du kit ; cachées
  // aux lecteurs d'écran (les nombres sont dans le nom de l'entrée)
  const deadlinesLate = h('span', { class: 'count count--danger', 'aria-hidden': 'true', hidden: true });
  const deadlinesToday = h('span', { class: 'count count--success', 'aria-hidden': 'true', hidden: true });
  const deadlinesLink = fixedLink('deadlines', 'calendar', t('navigation.echeances'), deadlinesLate, deadlinesToday);
  // « Listes » avec le nombre de listes (lu « Listes, 5 listes »)
  const listsCount = h('span', { class: 'pc-nav__count', 'aria-hidden': 'true' });
  const listsLink = fixedLink('lists', 'tasks', t('navigation.listes'), listsCount);
  // « Notes » avec le nombre de notes (lu « Notes, 12 notes »)
  const notesCount = h('span', { class: 'pc-nav__count', 'aria-hidden': 'true' });
  // Point des nouveautés : une note partagée modifiée par quelqu'un d'autre
  // depuis ma dernière lecture (dit aussi dans le nom lu)
  const notesNews = h('span', { class: 'news-badge news-badge--dot', 'aria-hidden': 'true', hidden: true });
  const notesLink = fixedLink('notes', 'note', t('navigation.notes'), notesNews, notesCount);
  // « Projets » avec le nombre de projets (lu « Projets, 4 projets »)
  const projectsCount = h('span', { class: 'pc-nav__count', 'aria-hidden': 'true' });
  const projectsNews = h('span', { class: 'news-badge news-badge--dot', 'aria-hidden': 'true', hidden: true });
  const projectsLink = fixedLink('projects', 'kanban', t('navigation.projets'), projectsNews, projectsCount);
  const main = h('div', { class: 'pc-side__main' }, homeLink, deadlinesLink, listsLink, notesLink, projectsLink);

  // Bouton du bas : « Nouvelle liste », ou « Nouvelle note » sur les écrans
  // des notes (même touche N)
  const newList = h('button', { class: 'btn btn--primary btn--block', type: 'button', 'aria-keyshortcuts': 'N', onClick: () => navigate('newList') }, icon('plus', 'icon--sm'), t('navigation.nouvelleListe'), keycap('N'));
  const newNote = h('button', { class: 'btn btn--primary btn--block', type: 'button', 'aria-keyshortcuts': 'N', hidden: true, onClick: () => navigate('newNote', {}, { replace: ['note', 'newNote'].includes(selected.name) }) }, icon('plus', 'icon--sm'), t('navigation.nouvelleNote'), keycap('N'));
  // Écrans des projets : « Nouveau projet », ou « Nouvelle carte » dans un
  // projet (le champ « Ajouter une carte » de la colonne qui a le focus,
  // sinon de la première : geste fait pour écrire)
  const newProject = h('button', { class: 'btn btn--primary btn--block', type: 'button', 'aria-keyshortcuts': 'N', 'data-shortcut': 'n', hidden: true, onClick: () => openNewProject() }, icon('plus', 'icon--sm'), t('navigation.nouveauProjet'), keycap('N'));
  const newCard = h('button', { class: 'btn btn--primary btn--block', type: 'button', 'aria-keyshortcuts': 'N', 'data-shortcut': 'n', hidden: true, onClick: () => startNewCard() }, icon('plus', 'icon--sm'), t('navigation.nouvelleCarte'), keycap('N'));

  // --- Marque ---
  // La marque mène au premier écran : l'Accueil, ou l'écran choisi quand il
  // est coupé (adresse et nom lu posés par drawFixed)
  const brandScreen = h('span', { class: 'visually-hidden' });
  const home = h('a', {
    class: 'pc-brand__home',
    href: pathFor('home'),
    onClick: (event) => {
      event.preventDefault();
      const first = openingScreen();
      if (first === 'lists') setPcListType('all');
      navigate(first, {}, { replace: selected.name === first });
    },
  }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('logo')), h('span', { class: 'pc-brand__name' }, 'Listo'), brandScreen);

  const markCurrent = (link, on) => {
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  };
  const drawFixed = () => {
    const counts = app.data.loaded ? deadlineBadges(app.data, undefined, app.user?.id ?? null) : { late: 0, today: 0 };
    deadlinesLate.hidden = counts.late === 0;
    deadlinesLate.textContent = badgeText(counts.late);
    deadlinesToday.hidden = counts.today === 0;
    deadlinesToday.textContent = badgeText(counts.today);
    deadlinesLink.setAttribute('aria-label', deadlinesLabel(counts));
    const lists = app.data.loaded ? app.data.lists.size : null;
    listsCount.textContent = lists === null ? '' : String(lists);
    if (lists === null) listsLink.removeAttribute('aria-label');
    else listsLink.setAttribute('aria-label', t('navigation.listes.nombre', { count: lists }));
    // Accueil coupé : ni entrée « Accueil », ni « Accueil » dans le nom lu
    // de la marque (elle mène au premier écran choisi)
    const first = openingScreen();
    homeLink.hidden = first !== 'home';
    home.href = pathFor(first);
    brandScreen.textContent = ` ${first === 'home' ? t('navigation.marque.accueil') : t('navigation.marque.ecran', { name: SCREEN_NAMES[first]() })}`;
    markCurrent(homeLink, selected.name === 'home');
    markCurrent(deadlinesLink, selected.name === 'deadlines');
    markCurrent(listsLink, selected.name === 'lists' && pcType === 'all');
    const notes = app.data.loaded ? countNotes() : null;
    notesCount.textContent = notes === null ? '' : String(notes);
    const notesNew = app.data.loaded && notesHaveNews(app.data);
    notesNews.hidden = !notesNew;
    if (notes === null) notesLink.removeAttribute('aria-label');
    else notesLink.setAttribute('aria-label', t(notesNew ? 'notes.nav.nombre.nouveautes' : 'navigation.notes.nombre', { count: notes }));
    markCurrent(notesLink, NOTE_SCREENS.includes(selected.name));
    // Notes coupées (Réglages › Fonctions) : ni « Notes », ni « Nouvelle note »
    const notesUsed = notesOn(app.data.features);
    notesLink.hidden = !notesUsed;
    // Projets coupés (c'est le départ) : ni « Projets », ni leurs boutons
    const projectsUsed = projectsOn(app.data.features);
    const projects = app.data.loaded && projectsUsed ? projectsInOrder() : [];
    projectsLink.hidden = !projectsUsed;
    projectsCount.textContent = app.data.loaded ? String(projects.length) : '';
    const projectsNew = projects.some((project) => projectUnread(app.data, project.id));
    projectsNews.hidden = !projectsNew;
    if (app.data.loaded) projectsLink.setAttribute('aria-label', t(projectsNew ? 'navigation.projets.nombre.nouveautes' : 'navigation.projets.nombre', { count: projects.length }));
    else projectsLink.removeAttribute('aria-label');
    markCurrent(projectsLink, selected.name === 'projects');
    const onProjects = projectsUsed && PROJECT_SCREENS.includes(selected.name);
    const board = onProjects && BOARD_SCREENS.includes(selected.name) ? app.data.projects.get(selected.projectId) : null;
    const canAdd = Boolean(board && !board.deletedAt && projectRights(board.role).createCards);
    newCard.hidden = !canAdd;
    newProject.hidden = !onProjects || canAdd;
    newList.hidden = onProjects || (notesUsed && NOTE_SCREENS.includes(selected.name));
    newNote.hidden = onProjects || !(notesUsed && NOTE_SCREENS.includes(selected.name));
  };
  const stopDay = watchNewDay(drawFixed);
  // Une tâche du jour à heure précise passe « En retard » à son heure
  const stopMinute = watchMinute(drawFixed);

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
    // « À offrir » : une vue des listes d'envies
    const ofOpenList = (Boolean(open) && typeOf(open) === type) || (selected.name === 'gifts' && type === 'wishes');
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
    // Écrans des projets : « Projets » et mes projets, le projet ouvert mis
    // en avant (aria-current)
    if (PROJECT_SCREENS.includes(selected.name) && projectsOn(app.data.features)) {
      showNav(true);
      nav.setAttribute('aria-label', t('navigation.projets.libelle'));
      const projects = projectsInOrder();
      replace(nav,
        h('h2', { class: 'pc-nav__group', id: 'pc-nav-projets' }, t('navigation.projets')),
        projects.length
          ? h('ul', { 'aria-labelledby': 'pc-nav-projets' }, projects.map((project) => {
            const current = selected.projectId === project.id;
            const news = projectUnread(app.data, project.id);
            const count = cardCount(app.data, project.id);
            return h('li', {}, h('a', {
              class: 'pc-nav__item',
              href: pathFor('project', { id: project.id }),
              'aria-current': current ? (selected.name === 'project' ? 'page' : 'true') : null,
              'aria-label': t(news ? 'navigation.projet.lu.nouveautes' : 'navigation.projet.lu', { name: project.name, count }),
              onClick: (event) => {
                event.preventDefault();
                navigate('project', { id: project.id }, { replace: current && selected.name === 'project' });
              },
            },
            h('span', { class: 'pc-nav__icon' }, icon('kanban', 'icon--sm')),
            h('span', { class: 'pc-nav__name' }, project.name),
            news ? h('span', { class: 'news-badge news-badge--dot', 'aria-hidden': 'true' }) : null,
            h('span', { class: 'pc-nav__count', 'aria-hidden': 'true' }, String(count))));
          }))
          : h('p', { class: 'pc-nav__empty' }, t('navigation.projets.aucun')));
      return;
    }
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

  // --- Pied (« Nouvelle liste », compte, Réglages) ---
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
      newList,
      newNote,
      newProject,
      newCard,
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
      const projectId = PROJECT_SCREENS.includes(route?.name) ? route.params?.id ?? null : null;
      const name = route?.name ?? null;
      const key = JSON.stringify([name, listId, projectId, pcType]);
      if (key === selected.key) return;
      selected = { name, listId, projectId, key };
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
      stopMinute();
    },
  };
}

// Nom d'une liste, le texte cherché dans <mark class="hit"> (texte simple,
// jamais de HTML)
function nameWithHits(name, query) {
  if (!isSearching(query)) return name;
  return highlightParts(name, query).map((part) => (part.hit ? h('mark', { class: 'hit' }, part.text) : part.text));
}
