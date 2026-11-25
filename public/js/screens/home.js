// Écran « Accueil » (#/accueil, premier écran depuis le 23 novembre 2026 ;
// maquettes design/accueil-notes/accueil-1, accueil-2 et pc-accueil-1) :
// voir d'un coup d'œil ce qui attend, sans arriver directement sur les
// listes.
//
// - En-tête : « Bonjour Guillaume », la date du jour dans la langue du
//   compte, la pastille d'état (un appui synchronise), puis la cloche
//   (étape 4 du cadrage) : elle ouvre la page Notifications, avec le nombre
//   de non lues en pastille (« 9+ » au-delà de 9 ; le nombre est dans son
//   nom lu, « Notifications, 3 non lues » ; bell.js). Ce nombre n'est
//   montré que sur la cloche (pas dans la tuile Compte) ; Accueil coupé, la
//   cloche passe dans la barre du haut d'Échéances, Listes et Notes.
// - Tuiles : Échéances, Listes, « À offrir » (mes réservations dans les
//   listes d'envies, seulement si j'en ai ; toute la largeur sur le
//   téléphone), Notes (étape 2 du cadrage), Compte. Depuis le 23 novembre
//   2026, chacun choisit leur ordre et masque celles qu'il veut (sauf
//   Compte) dans Réglages › Accueil (home-tiles.js) ; sans choix, cet
//   ordre-là, toutes affichées. Deux colonnes sur le téléphone (une sous
//   340 px) : une tuile restée seule sur sa ligne prend toute la largeur
//   (tileLayout), jamais de trou ; trois sur ordinateur (quatre au-delà de
//   1 440 px), où « toute la largeur » n'a pas d'effet. Notes coupées
//   (Réglages › Fonctions, features.js) : pas de tuile Notes. « Projets »
//   (docs/cadrage-projets.md, 3.3) : seulement quand la personne a allumé
//   la fonction ; en dernier, sur toute la largeur.
// - Accueil coupé dans les Réglages : cet écran mène tout de suite au
//   premier écran choisi (app.js le fait aussi pour #/accueil).
// - Chaque ligne est un vrai bouton (au moins 44 px), lu avec son nombre
//   (« En retard, 2 tâches »). Le titre d'une tuile ouvre l'écran entier.
// - Tout vient de la copie locale (aucune demande de plus au serveur) :
//   l'écran marche hors ligne et se redessine en temps réel, à minuit et à
//   chaque minute (une tâche du jour passe « En retard » à son heure).
// - Pas de bandeau du bas ni de loupe sur l'Accueil (décision du
//   propriétaire, de nouveau le 23 novembre 2026, après essai) : ses tuiles
//   mènent déjà partout.
// - Quand tout tient dans l'écran, rien ne défile ni ne rebondit (iPhone
//   compris) : scroll-lock.js mesure la zone et la bloque ; sinon (petit
//   téléphone, beaucoup de tuiles), elle défile normalement.
// Rien ici ne donne un droit : chaque écran ouvert revérifie les siens.

import { h, icon, replace } from '../dom.js';
import { navigate } from '../router.js';
import { longToday, todayKey } from '../format.js';
import { TYPE_LABELS } from '../list-types.js';
import { listCountsByType, saveTypeFilter } from '../store.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, drawWhenIdle, offlineBanner, watchNewDay, watchMinute } from '../ui.js';
import { deadlineCounts, deadlineSectionFor, effectiveMine, loadDeadlineScope } from '../deadlines.js';
import { setPcListType } from './pc-side.js';
import { sortedNotes, titleOf, openQuickNote } from './notes.js';
import { projectsInOrder, openNewProject } from './projects.js';
import { cardCount, projectUnread } from '../project-view.js';
import { isNoteUnread } from '../store.js';
import { computeGifts, recentGifts } from '../gifts.js';
import { openGift, forLabel } from './gifts.js';
import { lockWhenFits } from '../scroll-lock.js';
import { bell } from '../bell.js';
import { shownTiles, tileLayout, firstScreen } from '../home-tiles.js';
import { t } from '../i18n.js';

// --- Morceaux d'une tuile (balisage de design/accueil-notes) ---

// Tuile : carte avec son titre (un bouton qui ouvre l'écran entier) et ses
// lignes ; spoken : nom lu du titre s'il dit plus (« Notes, 12 notes ») ;
// count : petite pastille grise au bout du titre (tuile Notes : « 12 »),
// muette pour les lecteurs d'écran (le nombre est dans spoken)
// (« toute la largeur » sur le téléphone : tile--wide, posé par renderHome
// d'après tileLayout)
function tile(name, iconName, onOpen, rows, { spoken = null, count = null } = {}) {
  return h('section', { class: 'card tile', 'aria-label': name },
    h('button', { class: 'tile__head', type: 'button', 'aria-label': spoken, onClick: onOpen }, icon(iconName), h('span', { class: 'tile__name' }, name),
      count ? h('span', { class: 'count', 'aria-hidden': 'true' }, String(count)) : null),
    rows);
}

// Lignes d'une tuile (liste à puces sans puces)
const rowsOf = (rows) => h('ul', { class: 'tile__rows' }, rows.map((row) => h('li', {}, row)));

// Ligne : libellé, puis (à droite) le point des nouveautés et un nombre, ou
// un chevron. Le nombre et le point sont cachés aux lecteurs d'écran : ils
// sont dans le nom lu (label), jamais la couleur seule.
function row({ label, spoken = null, count = null, tone = '', dot = false, onClick }) {
  return h('button', { class: 'tile__row', type: 'button', 'aria-label': spoken, onClick },
    h('span', { class: 'tile__label' }, label),
    dot ? h('span', { class: 'tile__dot', 'aria-hidden': 'true' }) : null,
    count === null
      ? icon('chev-r', 'icon--sm')
      : h('span', { class: `count${tone ? ` count--${tone}` : ''}`, 'aria-hidden': 'true' }, String(count)));
}

// Ligne d'ajout (« Nouvelle liste ») : fond bleu clair, « + »
const addRow = (label, onClick) => h('button', { class: 'tile__row tile__row--add', type: 'button', onClick },
  icon('plus', 'icon--sm'), h('span', { class: 'tile__label' }, label));

const emptyText = (text) => h('p', { class: 'tile__empty' }, text);

// --- Les tuiles ---

// Échéances : « En retard » (rouge), « Aujourd'hui » (vert), « Plus tard »
// (gris) ; mêmes nombres que l'écran Échéances, avec son choix « Toutes /
// Les miennes » (deadlines.js). Un nombre nul reste gris.
function deadlinesTile() {
  const open = () => navigate('deadlines');
  const options = { today: todayKey(), mine: effectiveMine(app.data, loadDeadlineScope()), me: app.user.id };
  const counts = deadlineCounts(app.data, options);
  // Une ligne ouvre Échéances à sa section (screens/deadlines.js)
  const openAt = (name) => () => {
    app.openDeadlines = deadlineSectionFor(app.data, name, options);
    navigate('deadlines');
  };
  const lines = [
    ['late', t('accueil.echeances.retard'), (count) => t('accueil.echeances.retard.lu', { count }), 'danger'],
    ['today', t('accueil.echeances.aujourdhui'), (count) => t('accueil.echeances.aujourdhui.lu', { count }), 'success'],
    ['later', t('accueil.echeances.plusTard'), (count) => t('accueil.echeances.plusTard.lu', { count }), ''],
  ];
  const total = counts.late + counts.today + counts.later;
  return tile(t('accueil.echeances'), 'calendar', open, total === 0
    ? emptyText(t('accueil.echeances.aucune'))
    : rowsOf(lines.map(([name, label, spoken, tone]) => row({
      label,
      spoken: spoken(counts[name]),
      count: counts[name],
      tone: counts[name] ? tone : '',
      onClick: openAt(name),
    }))));
}

// Listes : une ligne par type que la personne a, avec son nombre de listes
// et le point des nouveautés. Une ligne ouvre « Listes » sur ce type :
// téléphone, le filtre retenu sur l'appareil ; ordinateur, le type choisi
// dans le menu de gauche.
function listsTile(pc) {
  const pick = (type) => {
    if (pc) setPcListType(type);
    else if (type !== null) saveTypeFilter(type);
  };
  // Le titre ouvre « Listes » : toutes sur ordinateur (comme l'entrée fixe
  // du menu), le filtre retenu sur le téléphone (comme le bandeau du bas)
  const open = () => {
    pick(pc ? 'all' : null);
    navigate('lists');
  };
  const types = listCountsByType(app.data);
  return tile(t('accueil.listes'), 'tasks', open, types.length === 0
    ? [emptyText(t('accueil.listes.aucune')), rowsOf([addRow(t('accueil.listes.nouvelle'), () => navigate('newList'))])]
    : rowsOf(types.map(({ type, count, news }) => row({
      label: TYPE_LABELS[type],
      spoken: news ? t('listes.type.lu.nouveautes', { type: TYPE_LABELS[type], count }) : t('listes.type.lu', { type: TYPE_LABELS[type], count }),
      count,
      dot: news,
      onClick: () => {
        pick(type);
        navigate('lists');
      },
    }))));
}

// Notes : le nombre de notes (pastille au bout du titre, « Notes, 12 notes »
// au lecteur d'écran ; décision du 23 novembre 2026), les dernières modifiées (deux ;
// quatre sur ordinateur), et « Nouvelle note » (saisie rapide, le curseur va
// dans le texte). Une note ouvre son écran ; le titre ouvre l'écran Notes.
function notesTile(pc) {
  const notes = sortedNotes('recent');
  const latest = [...notes].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, pc ? 4 : 2);
  const add = addRow(t('accueil.notes.nouvelle'), () => openQuickNote());
  const open = () => navigate('notes');
  if (!notes.length) return tile(t('accueil.notes'), 'note', open, [emptyText(t('accueil.notes.aucune')), rowsOf([add])]);
  return tile(t('accueil.notes'), 'note', open, [
    rowsOf([
      // Note modifiée par quelqu'un d'autre depuis ma dernière lecture : le
      // point des nouveautés (et dans le nom lu, jamais la couleur seule)
      ...latest.map((note) => {
        const news = isNoteUnread(app.data, note.id);
        return h('button', { class: 'tile__row', type: 'button', 'aria-label': news ? t('notes.tuile.nouveautes', { name: titleOf(note) }) : null, onClick: () => navigate('note', { id: note.id }) },
          h('span', { class: 'tile__label' }, titleOf(note)),
          news ? h('span', { class: 'tile__dot', 'aria-hidden': 'true' }) : null);
      }),
      add,
    ]),
  ], { spoken: t('accueil.notes.lu', { count: notes.length }), count: notes.length });
}

// « À offrir » (gifts.js) : seulement si j'ai au moins une réservation ou
// participation en cours. Le titre (avec le nombre de cadeaux encore à
// acheter) ouvre la page ; dessous, les trois derniers réservés pas encore
// achetés (« Lego Technic grue » / « Pour Zoé · réservé »), chacun ouvre le
// souhait dans sa liste. Tout acheté : « Tout est acheté ».
function giftsTile() {
  const { total, toBuy } = computeGifts(app.data, app.user.id);
  if (!total) return null;
  const recent = recentGifts(app.data, app.user.id, 3);
  const sub = (gift) => {
    const name = gift.recipient.name ?? forLabel(gift);
    return gift.alone ? t('offrir.tuile.reserve', { name }) : t('offrir.tuile.participe', { name, count: gift.people });
  };
  return tile(t('offrir.titre'), 'gift', () => navigate('gifts'), recent.length
    ? rowsOf(recent.map((gift) => h('button', { class: 'tile__row tile__row--two', type: 'button', onClick: () => openGift(gift) },
      h('span', { class: 'tile__label' },
        h('span', { class: 'tile__strong' }, gift.item.name),
        h('span', { class: 'tile__sub' }, sub(gift))),
      icon('chev-r', 'icon--sm'))))
    : emptyText(t('offrir.tuile.toutAchete')),
  { spoken: toBuy ? t('offrir.tuile.lu', { count: toBuy }) : t('offrir.tuile.lu.toutAchete'), count: toBuy || null });
}

// Projets (étape 1 du cadrage des projets : les projets récents ; « mes
// cartes », les plus urgentes, viendront avec les personnes attribuées et
// les échéances, étape 2) : le nombre de projets dans la pastille du titre
// (« Projets, 4 projets » au lecteur d'écran), les trois derniers modifiés
// (nom, et dessous le nombre de cartes ; point des nouveautés), chacun
// ouvre son projet ; aucun projet : « Aucun projet » et « Nouveau projet ».
// Le titre ouvre l'écran « Projets ».
function projectsTile() {
  const projects = projectsInOrder();
  const open = () => navigate('projects');
  if (!projects.length) {
    return tile(t('accueil.projets'), 'kanban', open,
      [emptyText(t('accueil.projets.aucun')), rowsOf([addRow(t('accueil.projets.nouveau'), () => openNewProject())])]);
  }
  return tile(t('accueil.projets'), 'kanban', open, rowsOf(projects.slice(0, 3).map((project) => {
    const news = projectUnread(app.data, project.id);
    const cards = t('accueil.projets.cartes', { count: cardCount(app.data, project.id) });
    return h('button', {
      class: 'tile__row tile__row--two', type: 'button',
      'aria-label': news ? t('accueil.projets.ligne.nouveautes', { name: project.name, cards }) : null,
      onClick: () => navigate('project', { id: project.id }),
    },
    h('span', { class: 'tile__label' },
      h('span', { class: 'tile__strong' }, project.name),
      h('span', { class: 'tile__sub' }, cards)),
    news ? h('span', { class: 'tile__dot', 'aria-hidden': 'true' }) : null,
    icon('chev-r', 'icon--sm'));
  })), { spoken: t('accueil.projets.lu', { count: projects.length }), count: projects.length });
}

// Compte : « Mon compte », « Notifications » (la page Notifications, sans
// son nombre : il n'est que sur la cloche), « Réglages » ; pour
// l'Admin, « Demandes de compte » quand il y en a en attente (connexion avec
// le fournisseur d'identité, LISTO_OIDC=on : nombre donné par /api/me). Le
// nombre de notifications non lues ne sera que sur la cloche.
function accountTile() {
  const requests = app.user.role === 'admin' ? app.user.accountRequests ?? 0 : 0;
  return tile(t('accueil.compte'), 'user', () => navigate('account'), rowsOf([
    row({ label: t('accueil.compte.monCompte'), onClick: () => navigate('account') }),
    row({ label: t('accueil.compte.notifications'), onClick: () => navigate('inbox') }),
    row({ label: t('accueil.compte.reglages'), onClick: () => navigate('settings') }),
    requests > 0 ? row({
      label: t('accueil.compte.demandes'),
      spoken: t('accueil.compte.demandes.lu', { count: requests }),
      count: requests,
      onClick: () => navigate('admin', { tab: 'comptes' }),
    }) : null,
  ].filter(Boolean)));
}

// --- Écran ---

export function renderHome(onLeave) {
  const pc = isDesktop();
  const tiles = h('div', { class: 'tiles' });
  const content = h('div', { class: 'scroll home-scroll' }, tiles);
  // Tout tient dans l'écran : rien ne défile (scroll-lock.js)
  const fit = lockWhenFits(content, tiles);
  onLeave(fit.stop);
  const date = h('p', { class: pc ? 'pc-head__sub' : 'home-head__date' });
  const notifications = bell();
  let leaving = false; // Accueil coupé : départ vers le premier écran demandé

  const draw = () => {
    date.textContent = longToday();
    notifications.paint();
    if (!app.data.loaded) {
      replace(tiles, h('p', { class: 'empty muted', role: 'status' }, t('accueil.chargement')));
      return;
    }
    // Accueil coupé (Réglages › Accueil, ici ou sur un autre appareil) :
    // le premier écran choisi le remplace
    // (un instant plus tard : jamais pendant que l'écran se pose)
    const first = firstScreen(app.data.home, app.data.features);
    if (first !== 'home') {
      if (!leaving) {
        leaving = true;
        setTimeout(() => {
          if (app.route?.name === 'home') navigate(first, {}, { replace: true });
        });
      }
      return;
    }
    // Tuiles dans l'ordre choisi, sans les masquées ; « À offrir »
    // seulement si j'ai des réservations ; pas de tuile d'une fonction
    // coupée (Notes) ; une tuile seule sur sa ligne du téléphone prend
    // toute la largeur
    const build = { deadlines: deadlinesTile, lists: () => listsTile(pc), gifts: giftsTile, notes: () => notesTile(pc), account: accountTile, projects: projectsTile };
    const present = shownTiles(app.data.home, app.data.features).map((name) => [name, build[name]()]).filter(([, el]) => el);
    const layout = tileLayout(present.map(([name]) => name));
    present.forEach(([, el], i) => el.classList.toggle('tile--wide', layout[i].wide));
    replace(tiles, present.map(([, el]) => el));
    fit.update();
  };
  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  onLeave(watchNewDay(draw));
  onLeave(watchMinute(() => idle.request()));
  draw();
  refreshData({ quiet: true });

  const hello = t('accueil.bonjour', { name: app.user.displayName ?? '' });
  const pill = syncPill(() => refreshData({ full: true }));
  if (pc) {
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' },
        h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__hello' }, hello), date),
        h('div', { class: 'pc-head__tools' }, pill, notifications.el)),
      offlineBanner(),
      content);
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'home-head' },
      h('h1', { class: 'home-head__hello' }, hello),
      h('div', { class: 'home-head__line' }, date, h('div', { class: 'home-head__tools' }, pill, notifications.el))),
    content);
}
