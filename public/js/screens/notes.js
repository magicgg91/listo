// Écran « Notes » (#/notes ; étape 2 du cadrage, 23 novembre 2026 ;
// maquettes design/accueil-notes/notes-1 et pc-notes-1, sans catégories :
// abandonnées le 23 novembre 2026) et saisie rapide d'une note (tuile Notes
// de l'Accueil, maquette accueil-3).
//
// Téléphone : barre du haut (titre, pastille d'état, corbeille avec son
// nombre, ⋮ « Trier », « + » Nouvelle note), loupe ronde du bandeau (titres
// et textes), notes épinglées d'abord puis les autres. Ordinateur : les
// cartes à gauche, la note ouverte à droite (screens/note.js), « Nouvelle
// note » en bas du menu de gauche (touche N).
//
// Tout vient de la copie locale (hors ligne compris) ; chaque action passe
// par la file d'attente (actions.js) et le serveur revérifie les droits.
//
// Notes partagées (étape 3) : sur la carte, la pastille des nouveautés et
// « Modifiée par Léa » (quelqu'un d'autre l'a modifiée depuis ma dernière
// lecture), « Lecture seule » (œil, comme les listes), le lien public
// (propriétaire) et les pastilles des personnes ; menu selon le droit
// (Partager et Lien public : propriétaire ; Personnes, Quitter la note :
// les autres ; sourdines des nouveautés et des notifications : chacun).

import { h, icon, iconButton, avatar } from '../dom.js';
import { navigate, pathFor } from '../router.js';
import { relativeTime, namesList } from '../format.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, toast, drawWhenIdle, openMenu, confirmDialog, offlineBanner, onPc } from '../ui.js';
import { createSearchRow } from '../search-row.js';
import { tabBar } from '../tabbar.js';
import { keycap } from '../shortcuts.js';
import { isSearching, matches } from '../search.js';
import { liveNotes, trashedNotes, sortNotes, noteTitle, noteExcerpt, NOTE_SORTS, NOTE_TITLE_MAX } from '../notes.js';
import * as actions from '../actions.js';
import { t, compareText } from '../i18n.js';
import { errorMessage } from '../api.js';
import { isNoteUnread, isNoteNewsMuted, isNoteOwner, canEditNote, notePeople } from '../store.js';
import { isNotePushMuted, setNotePushMuted } from '../push.js';
import { openNoteSharePanel } from './share-panel.js';
import { openNoteLinkSheet } from './share.js';
import { noteEditor } from './note.js';

// --- Tri, gardé sur cet appareil ---
const SORT_KEY = 'listo-tri-notes';
export function loadNoteSort() {
  try {
    const value = localStorage.getItem(SORT_KEY);
    return NOTE_SORTS.includes(value) ? value : 'recent';
  } catch {
    return 'recent';
  }
}
function saveNoteSort(value) {
  try {
    localStorage.setItem(SORT_KEY, value);
  } catch {
    // stockage indisponible : le tri n'est pas retenu
  }
}

// Titre affiché d'une note (« Note sans titre » si tout est vide)
export const titleOf = (note) => noteTitle(note) || t('notes.sansTitre');

// Notes visibles (hors corbeille), dans l'ordre choisi
export function sortedNotes(sort = loadNoteSort()) {
  return sortNotes(liveNotes([...app.data.notes.values()]), app.data.pinnedNotes, sort, (a, b) => compareText(a, b, { sensitivity: 'base', numeric: true }));
}

// Notes de la corbeille (les miennes), la plus récemment supprimée d'abord
export const trashed = () => trashedNotes([...app.data.notes.values()]);

// Recherche dans le titre et le texte
const found = (notes, query) => (isSearching(query) ? notes.filter((note) => matches(note.title, query) || matches(note.body, query)) : notes);

// --- Menu d'une note (carte ⋮, clic droit ; écran de la note) ---
// Dans l'ordre : Épingler / Désépingler (chacun pour soi) ; Partager et
// Lien public (propriétaire) ou Personnes (les autres, note partagée) ;
// Dupliquer (une note à moi, non partagée) ; pour une note partagée,
// « Masquer les nouveautés de cette note » et « Couper les notifications
// de cette note » (si elles sont activées sur le serveur) ; enfin, après un
// trait, Supprimer (propriétaire) ou Quitter la note (les autres). Le
// serveur revérifie chaque droit. onDeleted : après la mise à la corbeille
// ou le départ. withPin : faux sur ordinateur (bouton épingle à part).
export function noteMenuItems(note, { onDeleted = () => {}, withPin = true, withPeople = true } = {}) {
  const pinned = app.data.pinnedNotes.has(note.id);
  const owner = isNoteOwner(note);
  const shared = notePeople(note).length > 0;
  return [
    withPin ? {
      icon: pinned ? 'pin-off' : 'pin',
      label: pinned ? t('notes.menu.desepingler') : t('notes.menu.epingler'),
      onSelect: () => actions.pinNote(note.id, !pinned),
    } : null,
    withPeople && (owner || shared) ? {
      icon: 'users',
      label: owner ? t('notes.menu.partager') : t('notes.menu.personnes'),
      onSelect: () => openNoteSharePanel(note.id),
    } : null,
    owner ? { icon: 'link', label: t('notes.menu.lienPublic'), onSelect: () => openNoteLinkSheet(note) } : null,
    {
      icon: 'copy',
      label: t('notes.menu.dupliquer'),
      onSelect: async () => {
        const copyId = await actions.duplicateNote(note);
        const copy = app.data.notes.get(copyId);
        toast(t('notes.dupliquee', { name: titleOf(copy) }), { action: t('notes.ouvrir'), onAction: () => navigate('note', { id: copyId }) });
      },
    },
    shared ? newsMuteItem(note) : null,
    shared ? pushMuteItem(note) : null,
    owner
      ? { icon: 'trash', label: t('notes.menu.supprimer'), danger: true, separated: true, onSelect: () => askDelete(note, onDeleted) }
      : { icon: 'logout', label: t('notes.menu.quitter'), danger: true, separated: true, onSelect: () => askLeave(note, onDeleted) },
  ].filter(Boolean);
}

// Nouveautés de cette note, pour moi seulement (sur tous mes appareils) ;
// indépendant de ses notifications (deux réglages séparés, comme les listes)
function newsMuteItem(note) {
  const muted = isNoteNewsMuted(app.data, note.id);
  return {
    icon: muted ? 'eye' : 'eye-off',
    label: muted ? t('notes.menu.nouveautes.afficher') : t('notes.menu.nouveautes.masquer'),
    onSelect: () => {
      actions.setNoteNewsMuted(note.id, !muted);
      toast(muted ? t('notes.nouveautes.affichees') : t('notes.nouveautes.masquees'), { low: true });
    },
  };
}

// Notifications de cette note (page Notifications et téléphone, même sans
// LISTO_PUSH depuis l'étape 4) ; en ligne seulement (réglage gardé par le serveur)
function pushMuteItem(note) {
  const muted = isNotePushMuted(note.id);
  return {
    icon: 'bell',
    label: muted ? t('notes.menu.notifications.reactiver') : t('notes.menu.notifications.couper'),
    onSelect: async () => {
      try {
        await setNotePushMuted(note.id, !muted);
        toast(muted ? t('notes.notifications.reactivees') : t('notes.notifications.coupees'), { low: true });
      } catch (error) {
        toast(errorMessage(error));
      }
    },
  };
}

// Quitter une note qu'on m'a partagée (confirmation ; en ligne seulement)
export async function askLeave(note, onLeft = () => {}) {
  if (!navigator.onLine) {
    toast(t('notes.quitter.horsLigne'));
    return;
  }
  const name = titleOf(note);
  const ok = await confirmDialog({
    title: t('notes.quitter.question', { name }),
    text: t('notes.quitter.texte'),
    confirmLabel: t('notes.quitter.confirmer'),
  });
  if (!ok) return;
  try {
    await actions.leaveNote(note.id);
  } catch (error) {
    toast(navigator.onLine ? errorMessage(error) : t('notes.quitter.horsLigne'));
    return;
  }
  onLeft();
  toast(t('notes.quitter.fait', { name }), { low: true });
}

// Supprimer (confirmation) : la note va dans la corbeille des notes ;
// « Annuler » la restaure tout de suite. Partagée : elle disparaît pour
// tout le monde (la confirmation le dit).
export async function askDelete(note, onDeleted = () => {}) {
  const ok = await confirmDialog({
    title: t('notes.supprimer.question', { name: titleOf(note) }),
    text: notePeople(note).length ? t('notes.supprimer.texte.partagee') : t('notes.supprimer.texte'),
    confirmLabel: t('notes.supprimer.confirmer'),
    focusCancel: true,
  });
  if (!ok) return;
  await actions.deleteNote(note.id);
  onDeleted();
  toast(t('notes.supprimee'), { action: t('notes.annuler'), onAction: () => actions.restoreNote(note.id) });
}

// --- Carte d'une note (balisage de design/accueil-notes, notes-1) ---
// Un lien (toute la carte ouvre la note) et, posé dans son coin, le bouton ⋮.
export function noteCard(note, { selected = false } = {}) {
  const pinned = app.data.pinnedNotes.has(note.id);
  const title = titleOf(note);
  const excerpt = noteExcerpt(note);
  const check = app.data.noteConflicts.has(note.id);
  // Nouveautés : quelqu'un d'autre l'a modifiée depuis ma dernière lecture
  const unread = isNoteUnread(app.data, note.id);
  const people = notePeople(note);
  const readOnly = !canEditNote(note);
  const link = isNoteOwner(note) && note.publicLink && (note.publicLink.expiresAt === null || Date.parse(note.publicLink.expiresAt) > Date.now());
  const chips = [
    // Note « À vérifier » (conflit pas encore tranché) : icône ET texte
    check ? h('span', { class: 'chip note-card__check' }, icon('alert', 'icon--xs'), t('notes.aVerifier')) : null,
    // Partagée avec moi en lecture seule : pastille (icône ET texte), comme les listes
    readOnly ? h('span', { class: 'chip chip--readonly' }, icon('eye', 'icon--xs'), t('notes.carte.lectureSeule')) : null,
  ].filter(Boolean);
  const right = people.length || link
    ? h('span', { class: 'note-card__people' },
      link ? h('span', { class: 'list-card__link', role: 'img', 'aria-label': t('notes.carte.lienPublic'), title: t('notes.carte.lienPublic') }, icon('link', 'icon--xs')) : null,
      people.length ? h('span', { class: 'avatars', role: 'img', 'aria-label': t('notes.carte.partagee', { names: namesList(people.map((m) => m.displayName)) }) },
        people.slice(0, 4).map((m, i) => avatar(m.displayName, { second: i > 0 }))) : null)
    : null;
  const card = h('a', {
    class: `card note-card${selected ? ' is-selected' : ''}`,
    href: pathFor('note', { id: note.id }),
    'aria-current': selected ? 'page' : null,
    onClick: (event) => {
      event.preventDefault();
      navigate('note', { id: note.id }, { replace: selected || app.route?.name === 'note' || app.route?.name === 'newNote' });
    },
  },
  h('div', { class: 'note-card__head' },
    h('span', { class: 'note-card__icon' }, icon('note', 'icon--sm'),
      unread ? h('span', { class: 'news-badge news-badge--dot', role: 'img', 'aria-label': t('notes.carte.nouveautes'), title: t('notes.carte.nouveautes') }) : null),
    h('h3', { class: 'note-card__title' }, title),
    h('span', { class: 'note-card__time' },
      pinned ? [icon('pin', 'icon--xs'), h('span', { class: 'visually-hidden' }, `${t('notes.carte.epinglee')}, `)] : null,
      relativeTime(note.updatedAt))),
  // « Modifiée par Léa » : la nouveauté dite en toutes lettres (jamais la couleur seule)
  unread && note.updatedByName ? h('span', { class: 'note-card__news' }, t('notes.carte.modifieePar', { name: note.updatedByName })) : null,
  excerpt ? h('p', { class: 'note-card__excerpt' }, excerpt) : null,
  chips.length || right ? h('div', { class: 'note-card__foot' }, chips.length ? h('span', { class: 'note-card__chips' }, chips) : null, right) : null);
  const label = t('notes.carte.actions', { name: title });
  const menuButton = iconButton('more', label, () => openMenu(noteMenuItems(note), { label, anchor: menuButton }), 'note-card__menu');
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');
  // Ordinateur : clic droit sur la carte, même menu
  card.addEventListener('contextmenu', (event) => {
    if (!onPc()) return;
    event.preventDefault();
    openMenu(noteMenuItems(note), { label, at: { x: event.clientX, y: event.clientY } });
  });
  return h('div', { class: 'note-card-wrap' }, card, menuButton);
}

// Épinglées, puis autres notes (titres de section seulement s'il y a des épinglées)
function noteSections(notes, { selectedId = null } = {}) {
  const pinned = notes.filter((note) => app.data.pinnedNotes.has(note.id));
  const others = notes.filter((note) => !app.data.pinnedNotes.has(note.id));
  const card = (note) => noteCard(note, { selected: note.id === selectedId });
  if (!pinned.length) return others.map(card);
  return [
    h('h2', { class: 'notes-section' }, icon('pin', 'icon--xs'), t('notes.section.epinglees')),
    pinned.map(card),
    others.length ? h('h2', { class: 'notes-section' }, t('notes.section.autres')) : null,
    others.map(card),
  ];
}

// Aucune note : phrase d'aide et « Nouvelle note »
const emptyNotes = () => h('div', { class: 'empty' },
  h('div', { class: 'empty__icon' }, icon('note', 'icon--lg')),
  h('h2', { class: 'empty__title' }, t('notes.vide.titre')),
  h('p', { class: 'empty__text' }, t('notes.vide.texte')),
  h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('newNote') }, icon('plus', 'icon--sm'), t('notes.nouvelle')));

const noResult = (query, search) => h('div', { class: 'empty' },
  h('div', { class: 'empty__icon' }, icon('search', 'icon--lg')),
  h('h2', { class: 'empty__title' }, t('notes.recherche.aucunResultat')),
  h('p', { class: 'empty__text' }, t('notes.recherche.aucune', { query: query.trim() })),
  h('button', {
    class: 'btn btn--secondary',
    type: 'button',
    onPointerdown: search.keepFocus.pointerdown,
    onMousedown: search.keepFocus.mousedown,
    onClick: () => search.clear(),
  }, t('notes.recherche.effacer')));

const loading = () => h('p', { class: 'empty muted', role: 'status' }, t('notes.chargement'));

// Menu ⋮ : « Trier » (plus récentes d'abord, ordre alphabétique)
function sortMenu(onChange) {
  const button = iconButton('more', t('notes.plusActions'), () => {
    const current = loadNoteSort();
    const pick = (value) => () => {
      saveNoteSort(value);
      onChange();
    };
    openMenu([
      { icon: 'clock', label: t('notes.tri.recent'), checked: current === 'recent', onSelect: pick('recent') },
      { icon: 'az', label: t('notes.tri.alpha'), checked: current === 'alpha', onSelect: pick('alpha') },
    ], { label: t('notes.trier'), anchor: button });
  });
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  return button;
}

// --- Écran « Notes » ---
// openId : ordinateur, note ouverte à droite ; 'new' : nouvelle note
export function renderNotes(onLeave, { openId = null } = {}) {
  if (isDesktop()) return renderNotesPc(onLeave, openId);
  const content = h('div', { class: 'scroll' });
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const search = createSearchRow(content, {
    label: t('notes.recherche.libelle'),
    onChange: () => draw(),
    status: searchMeta,
    onOpen: () => tabBar().loupe.sync(),
  });
  tabBar().loupe.set(search.loupe);

  const draw = () => {
    if (!app.data.loaded) {
      search.show(loading());
      return;
    }
    const all = sortedNotes();
    if (!all.length) {
      searchMeta.textContent = '';
      search.show(emptyNotes());
      return;
    }
    const query = search.value;
    const notes = found(all, query);
    searchMeta.textContent = isSearching(query) ? t('notes.recherche.nombre', { count: notes.length }) : '';
    searchMeta.classList.toggle('visually-hidden', notes.length === 0);
    search.show(notes.length ? h('div', { class: 'cards' }, noteSections(notes)) : noResult(query, search));
  };
  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar topbar--plain topbar--status' },
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('notes.titre'))),
      syncPill(() => refreshData({ full: true }), { inBar: true }),
      sortMenu(() => draw()),
      iconButton('plus', t('notes.nouvelle'), () => navigate('newNote'), 'icon-btn--accent')),
    search.bar,
    content);
}

// --- Ordinateur (maquette pc-notes-1, sans catégories) ---
// À gauche : titre « Notes », « 12 notes », recherche toujours visible,
// corbeille, pastille d'état, tri, cartes ; à droite : la note ouverte
// (screens/note.js), sans voile.
let pcScroll = 0;
function renderNotesPc(onLeave, openId) {
  const content = h('div', { class: 'scroll' });
  const sub = h('p', { class: 'pc-head__sub' });
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const search = createSearchRow(content, { label: t('notes.recherche.libelle'), onChange: () => draw(), docked: true, placeholder: t('navigation.recherche.placeholder') });
  search.field.querySelector('input').setAttribute('aria-keyshortcuts', '/');
  search.field.append(keycap('/'));
  const selectedId = () => (openId && openId !== 'new' ? openId : null);

  const draw = () => {
    if (!app.data.loaded) {
      search.show(loading());
      return;
    }
    const all = sortedNotes();
    sub.textContent = t('notes.nombre', { count: all.length });
    if (!all.length) {
      searchMeta.textContent = '';
      search.show(emptyNotes());
      return;
    }
    const query = search.value;
    const notes = found(all, query);
    searchMeta.textContent = isSearching(query) ? t('notes.recherche.nombre', { count: notes.length }) : '';
    search.show(notes.length ? h('div', { class: 'pc-notes__cards' }, noteSections(notes, { selectedId: selectedId() })) : noResult(query, search));
  };
  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });
  // Ouvrir une autre note redessine l'écran : les cartes gardent leur défilement
  onLeave(() => { pcScroll = content.scrollTop; });
  requestAnimationFrame(() => { content.scrollTop = pcScroll; });

  const list = h('div', { class: 'pc-notes__list' },
    h('header', { class: 'pc-head' },
      h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__title' }, t('notes.titre')), sub),
      search.field),
    h('div', { class: 'pc-tools' },
      searchMeta,
      h('div', { class: 'pc-tools__end' }, syncPill(() => refreshData({ full: true })), sortMenu(() => draw()))),
    offlineBanner(),
    content);
  const pane = openId ? noteEditor(openId === 'new' ? null : openId, onLeave, { pc: true }) : null;
  return h('div', { class: 'screen' }, h('div', { class: `pc-notes${pane ? '' : ' pc-notes--closed'}` }, list, pane));
}

// --- Nouvelle note depuis l'Accueil (tuile Notes) ---
// Ouvre directement une nouvelle note, comme « + » (décision du
// 23 novembre 2026 : l'ancienne saisie rapide, une feuille, passait sous le
// clavier de l'iPhone) ; le curseur va dans le texte de la note (geste fait
// pour écrire, exception de test/focus.test.js).
export function openQuickNote() {
  navigate('newNote');
}

// Nombre de notes (hors corbeille) : tuile de l'Accueil, menu de gauche
export const notesCount = () => liveNotes([...app.data.notes.values()]).length;
