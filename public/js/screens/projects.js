// Écran « Projets » (#/projets ; docs/cadrage-projets.md, étape 1,
// sections 4.1 et 4.4 ; maquettes design/projets/captures/projets-1 et
// pc-projets-1), et ce qui sert aux autres écrans des projets : le menu ⋮
// d'un projet, « Nouveau projet », « Dupliquer le projet », « Supprimer »
// et « Quitter le projet ».
//
// Téléphone : barre du haut (« Projets », pastille d'état, cloche quand
// l'Accueil est coupé, « + » Nouveau projet), loupe ronde du bandeau (nom
// des projets), une carte par projet, les plus récemment modifiés d'abord.
// Ordinateur : « Projets », « 4 projets · 3 partagés », pastille d'état et
// recherche dans l'en-tête, cartes en grille ; « Nouveau projet » (touche N)
// en bas du menu de gauche.
//
// Carte d'un projet : icône (avec le point des nouveautés), nom, heure de
// la dernière activité, menu ⋮ ; les colonnes en petites pastilles (point
// de couleur, nom, nombre de cartes) ; en bas, « Lecture seule » (œil) ou
// « Contributeur » selon mon rôle, « 2 cartes pour vous · 1 en retard »
// (mes cartes : attribuées à moi, pas faites ; « en retard » en rouge ET
// écrit), et les pastilles des personnes.
//
// Tout vient de la copie locale (hors ligne compris) ; chaque action passe
// par la file d'attente (project-actions.js) et le serveur revérifie les
// droits. Textes posés par textContent (h()), jamais de HTML.

import { h, icon, iconButton, avatar, replace, field, errorNote } from '../dom.js';
import { navigate, pathFor } from '../router.js';
import { relativeTime, namesList, todayKey } from '../format.js';
import { nowTime } from '../due-time.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, toast, drawWhenIdle, openMenu, openSheet, confirmDialog, offlineBanner, onPc } from '../ui.js';
import { topBell } from '../bell.js';
import { createSearchRow } from '../search-row.js';
import { tabBar } from '../tabbar.js';
import { keycap } from '../shortcuts.js';
import { isSearching } from '../search.js';
import { errorMessage } from '../api.js';
import { t, compareText } from '../i18n.js';
import { projectRights, cleanProjectName, PROJECT_NAME_MAX } from '../projects.js';
import { sortedProjects, projectMatches, columnCounts, cardCount, otherMembers, projectUnread, projectNewsMuted, lastActivity, myCardCounts } from '../project-view.js';
import * as projectActions from '../project-actions.js';
import { openProjectShare } from './share-panel.js';

const compareNames = (a, b) => compareText(a, b, { sensitivity: 'base', numeric: true });

// Projets visibles, les plus récemment modifiés d'abord
export const projectsInOrder = () => sortedProjects(app.data, compareNames);

// Nom lu d'un rôle (« Propriétaire », « Peut modifier », « Contributeur »,
// « Lecture seule »)
export function roleLabel(role) {
  if (role === 'owner') return t('projets.role.proprietaire');
  if (role === 'editor') return t('projets.role.modifier');
  if (role === 'contributor') return t('projets.role.contributeur');
  return t('projets.role.lecture');
}

// --- Menu ⋮ d'un projet (carte de l'écran « Projets », barre d'un projet) ---
// Dans l'ordre : Ouvrir (carte seulement), Partager (propriétaire) ou
// Personnes (les autres), Réglages du projet (propriétaire et « Peut
// modifier », dans le projet), Dupliquer le projet (tout membre), Cartes
// supprimées (dans le projet), Masquer / Afficher les nouveautés (projet
// partagé), Couper / Réactiver les notifications, « Afficher dans
// Échéances » (interrupteur à moi, étape 4) ; après un trait, Supprimer
// (propriétaire) ou Quitter le projet.
// Seulement ce que mon rôle permet ; le serveur revérifie chaque droit.
export function projectMenuItems(project, { inside = false, onGone = () => {} } = {}) {
  const rights = projectRights(project.role);
  const shared = (project.members ?? []).length > 1;
  const muted = projectNewsMuted(app.data, project.id);
  const pushMuted = Boolean(app.data.projectMine?.[project.id]?.mutedPush);
  const inDeadlines = app.data.projectMine?.[project.id]?.inDeadlines === true;
  return [
    inside ? null : { icon: 'kanban', label: t('projets.menu.ouvrir'), onSelect: () => navigate('project', { id: project.id }) },
    rights.share
      ? { icon: 'users', label: t('projets.menu.partager'), onSelect: () => openProjectShare(project.id) }
      : { icon: 'users', label: t('projets.menu.personnes'), onSelect: () => openProjectShare(project.id) },
    inside && rights.settings ? { icon: 'sliders', label: t('projets.menu.reglages'), onSelect: () => navigate('projectSettings', { id: project.id }) } : null,
    rights.duplicate ? { icon: 'copy', label: t('projets.menu.dupliquer'), onSelect: () => duplicate(project) } : null,
    inside ? { icon: 'trash', label: t('projets.menu.cartesSupprimees'), onSelect: () => navigate('projectTrash', { id: project.id }) } : null,
    shared ? {
      icon: muted ? 'eye' : 'eye-off',
      label: muted ? t('projets.menu.nouveautes.afficher') : t('projets.menu.nouveautes.masquer'),
      onSelect: () => {
        projectActions.setProjectState(project.id, { mutedNews: !muted });
        toast(muted ? t('projets.nouveautes.affichees') : t('projets.nouveautes.masquees'), { low: true });
      },
    } : null,
    // « Couper les notifications » de ce projet (page Notifications et
    // téléphone ; les rappels compris) : réglage à moi, indépendant des
    // nouveautés
    {
      icon: 'bell',
      label: pushMuted ? t('projets.menu.notifications.reactiver') : t('projets.menu.notifications.couper'),
      onSelect: () => {
        projectActions.setProjectState(project.id, { mutedPush: !pushMuted });
        toast(pushMuted ? t('projets.notifications.reactivees') : t('projets.notifications.coupees'), { low: true });
      },
    },
    // « Afficher dans Échéances » (étape 4, section 8) : interrupteur, coupé
    // au départ, réglage à moi pour ce projet (jamais transmis aux autres) ;
    // allumé, ses cartes datées et pas faites vont dans l'écran Échéances
    {
      icon: 'calendar',
      label: t('projets.menu.echeances'),
      toggle: true,
      checked: inDeadlines,
      onSelect: () => {
        projectActions.setProjectState(project.id, { inDeadlines: !inDeadlines });
        toast(inDeadlines ? t('projets.echeances.retire', { name: project.name }) : t('projets.echeances.ajoute', { name: project.name }), { low: true });
      },
    },
    rights.trash
      ? { icon: 'trash', label: t('projets.menu.supprimer'), danger: true, separated: true, onSelect: () => askDelete(project, onGone) }
      : { icon: 'logout', label: t('projets.menu.quitter'), danger: true, separated: true, onSelect: () => askLeave(project, onGone) },
  ].filter(Boolean);
}

// Dupliquer (tout membre, Lecture seule compris ; décision du 25 novembre
// 2026) : un projet à moi, « (copie) », mêmes colonnes et étiquettes, sans
// cartes ; hors ligne compris. Un message propose de l'ouvrir.
export async function duplicate(project) {
  const copyId = await projectActions.duplicateProject(project.id);
  const copy = copyId ? app.data.projects.get(copyId) : null;
  if (!copy) return;
  toast(t('projets.duplique', { name: copy.name }), { action: t('projets.ouvrir'), onAction: () => navigate('project', { id: copyId }) });
}

// Supprimer (propriétaire) : confirmation avec le nombre de cartes et de
// personnes ; le projet va dans Réglages › Corbeille (30 jours), pour tout
// le monde ; « Annuler » le restaure tout de suite
export async function askDelete(project, onDeleted = () => {}) {
  const cards = cardCount(app.data, project.id);
  const people = Math.max(0, (project.members ?? []).length - 1);
  const ok = await confirmDialog({
    title: t('projets.supprimer.question', { name: project.name }),
    text: [
      cards ? t('projets.supprimer.texte', { count: cards }) : t('projets.supprimer.texte.vide'),
      people ? t('projets.supprimer.partage', { count: people }) : null,
      t('projets.supprimer.corbeille'),
    ].filter(Boolean),
    confirmLabel: t('projets.supprimer.confirmer'),
    focusCancel: true,
  });
  if (!ok) return;
  await projectActions.deleteProject(project.id);
  onDeleted();
  toast(t('projets.supprime'), { action: t('projets.annuler'), onAction: () => projectActions.restoreProject(project.id) });
}

// Quitter un projet qu'on m'a partagé (confirmation ; en ligne seulement)
export async function askLeave(project, onLeft = () => {}) {
  if (!navigator.onLine) {
    toast(t('projets.quitter.horsLigne'));
    return;
  }
  const ok = await confirmDialog({
    title: t('projets.quitter.question', { name: project.name }),
    text: t('projets.quitter.texte'),
    confirmLabel: t('projets.quitter.confirmer'),
  });
  if (!ok) return;
  try {
    await projectActions.leaveProject(project.id);
  } catch (error) {
    toast(navigator.onLine ? errorMessage(error) : t('projets.quitter.horsLigne'));
    return;
  }
  onLeft();
  toast(t('projets.quitter.fait', { name: project.name }), { low: true });
}

// --- « Nouveau projet » : le nom (1 à 80 caractères) ---
// Le projet est créé avec « À faire », « En cours », « Fait » (choix du
// propriétaire du 25 novembre 2026), puis s'ouvre. Pas de partage ici
// (comme les listes depuis le 24 novembre 2026). Le curseur va dans le nom :
// le geste (« + », « Nouveau projet », touche N) est fait pour écrire
// (exception de test/focus.test.js).
export function openNewProject() {
  const input = h('input', { class: 'input', type: 'text', maxlength: String(PROJECT_NAME_MAX), autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done' });
  const name = field(t('projets.nouveau.nom'), input, { hint: t('projets.nouveau.aide') });
  const error = errorNote();
  let busy = false;
  const create = async (event) => {
    event?.preventDefault();
    if (busy) return;
    const value = cleanProjectName(input.value);
    if (!value) {
      name.setError(t('projets.nouveau.nomInvalide'));
      return;
    }
    busy = true;
    try {
      const projectId = await projectActions.createProject(value);
      sheet.close();
      navigate('project', { id: projectId });
    } catch (err) {
      error.show(errorMessage(err));
    } finally {
      busy = false;
    }
  };
  const form = h('form', { class: 'kform', novalidate: true, onSubmit: create },
    error.note,
    name.field,
    h('div', { class: 'dialog__actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('projets.annuler')),
      h('button', { class: 'btn btn--primary', type: 'submit' }, t('projets.nouveau.creer'))));
  const sheet = openSheet({ title: t('projets.nouveau.titre'), content: form, pc: 'modal', size: 'sm' });
  input.focus();
  return sheet;
}

// --- Carte d'un projet (maquette projets-1) ---
function projectCard(project) {
  const unread = projectUnread(app.data, project.id);
  const people = (project.members ?? []).filter((member) => member.active !== false);
  const shared = otherMembers(project, app.user.id).length > 0;
  const cols = columnCounts(app.data, project);
  const mine = myCardCounts(app.data, app.user.id, project.id, todayKey(), nowTime());
  const roleChip = project.role === 'reader'
    ? h('span', { class: 'chip chip--readonly' }, icon('eye', 'icon--xs'), t('projets.carte.lectureSeule'))
    : project.role === 'contributor' ? h('span', { class: 'chip' }, t('projets.carte.contributeur')) : null;
  const label = t('projets.carte.actions', { name: project.name });
  const menuButton = iconButton('more', label, () => openMenu(projectMenuItems(project), { label, anchor: menuButton }));
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');
  const card = h('article', { class: 'card proj-card' },
    h('div', { class: 'proj-card__head' },
      h('span', { class: 'proj-card__icon' }, icon('kanban'),
        unread ? h('span', { class: 'news-badge news-badge--dot', role: 'img', 'aria-label': t('projets.carte.nouveautes'), title: t('projets.carte.nouveautes') }) : null),
      h('h2', { class: 'proj-card__name' }, h('a', {
        class: 'proj-card__link',
        href: pathFor('project', { id: project.id }),
        onClick: (event) => {
          event.preventDefault();
          navigate('project', { id: project.id });
        },
      }, project.name)),
      h('span', { class: 'proj-card__time' }, relativeTime(lastActivity(app.data, project))),
      menuButton),
    // Colonnes : point de couleur, nom (toujours écrit), nombre de cartes
    cols.length ? h('ul', { class: 'proj-card__cols', 'aria-label': t('projets.carte.colonnes') },
      cols.map(({ column, count }) => h('li', { class: `colchip c-${column.color}` },
        h('span', { class: 'coldot', 'aria-hidden': 'true' }), column.name, ' ', h('b', {}, String(count))))) : null,
    roleChip || shared || mine.count ? h('div', { class: 'proj-card__foot' },
      h('span', { class: 'proj-card__mine' }, roleChip,
        mine.count ? [roleChip ? ' ' : null, t('projets.pourVous', { count: mine.count }),
          mine.late ? [' · ', h('strong', {}, t('projets.pourVous.retard', { count: mine.late }))] : null] : null),
      shared ? h('span', { class: 'avatars', role: 'img', 'aria-label': t('projets.carte.partage', { names: namesList(people.map((m) => m.displayName)) }) },
        people.slice(0, 4).map((m, i) => avatar(m.displayName, { second: i > 0 }))) : null) : null);
  // Ordinateur : clic droit sur la carte, même menu
  card.addEventListener('contextmenu', (event) => {
    if (!onPc()) return;
    event.preventDefault();
    openMenu(projectMenuItems(project), { label, at: { x: event.clientX, y: event.clientY } });
  });
  return card;
}

// Aucun projet (installation neuve) : phrase d'aide et « Nouveau projet »
const emptyProjects = () => h('div', { class: 'empty' },
  h('div', { class: 'empty__icon' }, icon('kanban', 'icon--lg')),
  h('h2', { class: 'empty__title' }, t('projets.vide.titre')),
  h('p', { class: 'empty__text' }, t('projets.vide.texte')),
  h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openNewProject() }, icon('plus', 'icon--sm'), t('projets.nouveau')));

const noResult = (query, search) => h('div', { class: 'empty' },
  h('div', { class: 'empty__icon' }, icon('search', 'icon--lg')),
  h('h2', { class: 'empty__title' }, t('projets.recherche.aucunResultat')),
  h('p', { class: 'empty__text' }, t('projets.recherche.aucun', { query: query.trim() })),
  h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => search.clear() }, t('projets.recherche.effacer')));

const loading = () => h('p', { class: 'empty muted', role: 'status' }, t('projets.chargement'));

// --- Écran « Projets » ---
export function renderProjects(onLeave) {
  const pc = isDesktop();
  const content = h('div', { class: 'scroll' });
  const sub = h('p', { class: 'pc-head__sub' });
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const search = pc
    ? createSearchRow(content, { label: t('projets.recherche.libelle'), onChange: () => draw(), docked: true, placeholder: t('navigation.recherche.placeholder') })
    : createSearchRow(content, { label: t('projets.recherche.libelle'), onChange: () => draw(), status: searchMeta, onOpen: () => tabBar().loupe.sync() });
  if (pc) {
    search.field.querySelector('input').setAttribute('aria-keyshortcuts', '/');
    search.field.append(keycap('/'));
  } else tabBar().loupe.set(search.loupe);

  const draw = () => {
    if (!app.data.loaded) {
      search.show(loading());
      return;
    }
    const all = projectsInOrder();
    const shared = all.filter((project) => otherMembers(project, app.user.id).length > 0).length;
    sub.textContent = shared ? `${t('projets.nombre', { count: all.length })} · ${t('projets.partages', { count: shared })}` : t('projets.nombre', { count: all.length });
    if (!all.length) {
      searchMeta.textContent = '';
      search.show(emptyProjects());
      return;
    }
    const query = search.value;
    const found = all.filter((project) => projectMatches(project, query));
    searchMeta.textContent = isSearching(query) ? t('projets.recherche.nombre', { count: found.length }) : '';
    search.show(found.length ? h('div', { class: pc ? 'pc-cards' : 'cards' }, found.map(projectCard)) : noResult(query, search));
  };
  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });

  if (pc) {
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' },
        h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__title' }, t('projets.titre')), sub),
        syncPill(() => refreshData({ full: true })), topBell(onLeave),
        search.field),
      offlineBanner(),
      searchMeta,
      content);
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar topbar--plain topbar--status' },
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('projets.titre'))),
      syncPill(() => refreshData({ full: true }), { inBar: true }),
      topBell(onLeave),
      iconButton('plus', t('projets.nouveau'), () => openNewProject(), 'icon-btn--accent')),
    search.bar,
    content);
}
