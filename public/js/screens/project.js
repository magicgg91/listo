// Écran d'un projet (#/projets/<id> ; docs/cadrage-projets.md, étape 1,
// sections 4.2 et 4.4 ; maquettes design/projets/captures/projet-1,
// projet-2, deplacer-1 et pc-projet-1).
//
// Téléphone : une colonne à la fois.
// - Barre du haut : retour, icône et nom du projet, « Projet · 55 cartes » ;
//   bouton des personnes (« Partager » pour le propriétaire, « Personnes »
//   pour les autres) ; menu ⋮ du projet (screens/projects.js).
// - Ligne d'état : pastille « À jour », « Filtrer » (avec le nombre de
//   filtres) quand le projet a des étiquettes.
// - Onglets des colonnes (role="tablist", défilent de côté) : point de
//   couleur, nom, nombre de cartes ; choisi : fond doux de sa couleur,
//   liseré, gras (jamais la couleur seule), toujours en vue. La dernière
//   colonne ouverte est retenue pour ce projet, sur cet appareil.
// - Les cartes de la colonne, dans l'ordre choisi ; glisser l'écran de côté
//   passe à la colonne voisine (project-drag.js, columnSwipe) ; un appui
//   long soulève une carte (cardDrag) : on change sa place, ou on la pose
//   sur un onglet (elle va en haut de cette colonne).
// - Barre d'ajout en verre : « Ajouter dans « Relecture » », la carte va en
//   bas de la colonne, le champ reste prêt pour la suivante (propriétaire,
//   « Peut modifier », Contributeur ; pas en Lecture seule) ; loupe ronde
//   au-dessus : cherche dans tout le projet (titres, étiquettes), résultats
//   rangés par colonne.
// - « Filtrer » (feuille « Filtrer les cartes ») : les étiquettes du projet,
//   plusieurs choix ; une carte est montrée si elle porte une des
//   étiquettes choisies ; retenu pour ce projet sur cet appareil ; les
//   nombres des onglets suivent (« 2 sur 5 » dans le nom lu). Le filtre par
//   personne viendra avec les personnes attribuées (étape 2).
//
// Ordinateur : le projet prend TOUTE la largeur (exception à la colonne de
// 1 040 px, validée par le propriétaire le 25 novembre 2026) : en-tête
// (nom, « Projet · 5 colonnes · 55 cartes », « À jour », « Partager » avec
// les personnes (touche P), recherche (touche /), ⋮), filtres par
// étiquette, puis les colonnes côte à côte (280 px), qui défilent de côté ;
// « + Ajouter une carte » en bas de chacune (curseur dans le champ : geste
// fait pour écrire), « + Colonne » au bout (propriétaire et « Peut
// modifier »), menu ⋮ de chaque colonne (Renommer, Couleur, Déplacer à
// gauche / à droite, Supprimer). Glisser-déposer à la souris ; au clavier :
// flèches haut et bas dans une colonne, gauche et droite d'une colonne à
// l'autre, Entrée ouvre la carte, M « Déplacer vers… ».
//
// Toucher une carte l'ouvre (screens/project-card.js). Les boutons absents
// sont ceux que mon rôle ne permet pas (projectRights, cardRights) ; le
// serveur revérifie tout. Ouvrir le projet le marque « vu » (Nouveautés)
// sur tous mes appareils. Textes posés par textContent (h()).

import { h, icon, iconButton, avatar, replace } from '../dom.js';
import { navigate, goBack, pathFor } from '../router.js';
import { namesList } from '../format.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, toast, drawWhenIdle, openMenu, openSheet, offlineBanner, onPc, isTextField } from '../ui.js';
import { createSearchRow } from '../search-row.js';
import { loupeButton } from '../tabbar.js';
import { keycap, singleKeysOn } from '../shortcuts.js';
import { isSearching } from '../search.js';
import { t } from '../i18n.js';
import { projectRights, cardRights, byPosition, afterIdForStep, cleanCardTitle, CARD_TITLE_MAX } from '../projects.js';
import {
  visibleCards, liveCards, cardCount, otherMembers, cleanLabelFilter, loadProjectFilter, saveProjectFilter,
  loadProjectColumn, saveProjectColumn, startColumn, neighbourColumn,
} from '../project-view.js';
import { columnCards } from '../project-store.js';
import * as projectActions from '../project-actions.js';
import { cardDrag, columnSwipe } from '../project-drag.js';
import { labelChip } from './note-labels.js';
import { projectMenuItems } from './projects.js';
import { openProjectShare } from './share-panel.js';
import { openColumnSheet, askDeleteColumn } from './project-settings.js';

// Projet ouvert (pas dans la corbeille)
export function liveProject(projectId) {
  const project = app.data.projects.get(projectId);
  return project && !project.deletedAt ? project : null;
}
// Ce que je peux faire sur une carte (règle partagée avec le serveur)
export const rightsOn = (card, project) => cardRights(card, app.user?.id ?? null, project?.role ?? null);

// Étiquettes d'une carte, dans l'ordre des étiquettes du projet
export function cardLabels(card, project) {
  const ids = new Set(card.labelIds ?? []);
  return (project.labels ?? []).filter((label) => ids.has(label.id));
}
export function labelRow(labels) {
  if (!labels.length) return null;
  return h('span', { class: 'labels', role: 'list', 'aria-label': t('projets.etiquettes') },
    labels.map((label) => labelChip(label, { role: 'listitem' })));
}

// --- Menu d'une carte (⋮ de la carte ouverte ; clic droit, touche Menu sur
// ordinateur) : Déplacer vers…, Monter, Descendre, Dupliquer, Supprimer,
// seulement ce que mon rôle permet sur CETTE carte ---
export function cardMenuItems(card, project, { onGone = () => {} } = {}) {
  const can = rightsOn(card, project);
  const rows = columnCards(app.data, card.columnId);
  const up = afterIdForStep(rows, card.id, 'up');
  const down = afterIdForStep(rows, card.id, 'down');
  return [
    can.move ? { icon: 'move', label: t('projets.carte.deplacer'), keys: { label: 'M', aria: 'M' }, onSelect: () => openMoveSheet(card.id) } : null,
    can.move && up !== undefined ? { icon: 'arrow-up', label: t('projets.carte.monter'), onSelect: () => projectActions.stepCard(card.id, 'up') } : null,
    can.move && down !== undefined ? { icon: 'arrow-down', label: t('projets.carte.descendre'), onSelect: () => projectActions.stepCard(card.id, 'down') } : null,
    can.duplicate ? { icon: 'copy', label: t('projets.carte.dupliquer'), onSelect: () => duplicateCard(card) } : null,
    can.remove ? { icon: 'trash', label: t('projets.carte.supprimer'), danger: true, separated: true, onSelect: () => deleteCard(card, onGone) } : null,
  ].filter(Boolean);
}

// Dupliquer : juste dessous, « (copie) », à moi (même un Contributeur sur
// la carte d'un autre : la copie est à lui)
export async function duplicateCard(card) {
  const copyId = await projectActions.duplicateCard(card.id);
  const copy = copyId ? app.data.cards.get(copyId) : null;
  if (copy) toast(t('projets.carte.dupliquee', { name: copy.title }), { action: t('projets.ouvrir'), onAction: () => navigate('projectCard', { id: copy.projectId, cardId: copy.id }) });
}

// Supprimer : vers les « Cartes supprimées » du projet (30 jours) ;
// « Annuler » la restaure tout de suite
export async function deleteCard(card, onGone = () => {}) {
  await projectActions.deleteCard(card.id);
  onGone();
  toast(t('projets.carte.supprimee'), { action: t('projets.annuler'), onAction: () => projectActions.restoreCard(card.id) });
}

// --- « Déplacer vers… » (maquette deplacer-1) : les colonnes (point de
// couleur, nom, nombre de cartes, « (actuelle) »), puis « En haut » ou
// « En bas » ; « Déplacer ». La carte part par la file d'attente. ---
export function openMoveSheet(cardId) {
  const card = app.data.cards.get(cardId);
  const project = card ? liveProject(card.projectId) : null;
  if (!card || card.deletedAt || !project || !rightsOn(card, project).move) return null;
  let target = card.columnId;
  let top = true;
  const columns = byPosition(project.columns ?? []);
  const counts = new Map(columns.map((column) => [column.id, columnCards(app.data, column.id).length]));
  const rows = columns.map((column) => {
    const row = h('button', { class: `radio-row c-${column.color}`, type: 'button', role: 'radio', 'data-column': column.id, onClick: () => {
      target = column.id;
      paint();
    } },
    h('span', { class: 'radio', 'aria-hidden': 'true' }),
    h('span', { class: 'coldot', 'aria-hidden': 'true' }),
    h('span', {}, column.name),
    column.id === card.columnId ? h('span', { class: 'move__current' }, t('projets.deplacer.actuelle')) : null,
    h('span', { class: 'move__count', 'aria-label': t('projets.nombreCartes', { count: counts.get(column.id) }) }, String(counts.get(column.id))));
    return row;
  });
  const place = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t('projets.deplacer.place') },
    [[true, t('projets.deplacer.haut')], [false, t('projets.deplacer.bas')]].map(([value, text]) => {
      const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', onClick: () => {
        top = value;
        paint();
      } }, text);
      option.dataset.top = String(value);
      return option;
    }));
  const paint = () => {
    for (const row of rows) {
      const on = row.dataset.column === target;
      row.setAttribute('aria-checked', String(on));
      row.classList.toggle('is-on', on);
      row.querySelector('.radio').classList.toggle('is-on', on);
    }
    for (const option of place.children) option.setAttribute('aria-checked', String(option.dataset.top === String(top)));
  };
  const move = () => {
    sheet.close();
    projectActions.moveCard(card.id, { columnId: target, ...(top ? { afterId: null } : {}) });
  };
  const sheet = openSheet({
    title: t('projets.deplacer.titre'),
    sub: t('projets.deplacer.carte', { name: card.title }),
    content: [
      h('div', { class: 'group', role: 'radiogroup', 'aria-label': t('projets.colonnes') }, rows),
      h('div', { class: 'move__where' }, h('span', { class: 'field__label' }, t('projets.deplacer.place')), place),
      h('div', { class: 'dialog__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('projets.annuler')),
        h('button', { class: 'btn btn--primary', type: 'button', 'data-initial-focus': 'true', onClick: move }, t('projets.deplacer.bouton'))),
    ],
    scroll: true,
    pc: 'modal',
    size: 'sm',
  });
  paint();
  return sheet;
}

// --- « Filtrer les cartes » (maquette projet-2) : les étiquettes du
// projet, plusieurs choix ; « Effacer », « Voir 3 cartes » ---
function openFilterSheet(project, current, onApply) {
  const chosen = new Set(current);
  const rows = (project.labels ?? []).map((label) => {
    const tick = h('span', { class: 'tick', 'aria-hidden': 'true' });
    const row = h('button', { class: 'tick-row', type: 'button', role: 'checkbox', onClick: () => {
      if (chosen.has(label.id)) chosen.delete(label.id);
      else chosen.add(label.id);
      paint();
    } }, tick, labelChip(label));
    row.dataset.label = label.id;
    return { row, tick, id: label.id };
  });
  const showButton = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => {
    sheet.close();
    onApply([...chosen]);
  } });
  const paint = () => {
    for (const { row, tick, id } of rows) {
      const on = chosen.has(id);
      row.setAttribute('aria-checked', String(on));
      tick.classList.toggle('is-on', on);
      replace(tick, on ? icon('check') : null);
    }
    const count = liveCards(app.data, project.id).filter((card) => !chosen.size || (card.labelIds ?? []).some((id) => chosen.has(id))).length;
    showButton.textContent = t('projets.filtre.voir', { count });
  };
  const sheet = openSheet({
    title: t('projets.filtre.titre'),
    content: [
      h('h3', { class: 'label-sheet__title' }, t('projets.etiquettes')),
      rows.length ? h('div', { class: 'group' }, rows.map((r) => r.row)) : h('p', { class: 'muted' }, t('projets.filtre.aucuneEtiquette')),
      h('div', { class: 'dialog__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => {
          chosen.clear();
          paint();
        } }, t('projets.filtre.effacer')),
        showButton),
    ],
    scroll: true,
    pc: 'modal',
    size: 'sm',
  });
  paint();
  return sheet;
}

// --- Face d'une carte (maquettes projet-1, pc-projet-1) : titre (trois
// lignes au plus), étiquettes. Toute la carte ouvre la carte (lien) ; une
// carte que je ne peux pas modifier le dit au lecteur d'écran. (Échéance,
// cases « 2/3 », liens, commentaires et personnes viendront avec
// l'étape 2.) ---
export function cardFace(card, project) {
  const can = rightsOn(card, project);
  const face = h('article', { class: 'card kcard', 'data-card': card.id },
    h('h3', { class: 'kcard__title' }, h('a', {
      class: 'kcard__link',
      href: pathFor('projectCard', { id: project.id, cardId: card.id }),
      onClick: (event) => {
        event.preventDefault();
        navigate('projectCard', { id: project.id, cardId: card.id });
      },
    }, card.title, can.edit ? null : h('span', { class: 'visually-hidden' }, t('projets.carte.lectureSeulePourVous')))),
    labelRow(cardLabels(card, project)));
  // Ordinateur : clic droit, même menu que la carte ouverte
  face.addEventListener('contextmenu', (event) => {
    if (!onPc()) return;
    const items = cardMenuItems(card, project);
    if (!items.length) return;
    event.preventDefault();
    openMenu(items, { label: t('projets.carte.actions', { name: card.title }), at: { x: event.clientX, y: event.clientY } });
  });
  return face;
}

// Projet introuvable (supprimé, quitté, jamais visible) : même réponse
export const projectGone = () => h('div', { class: 'empty' },
  h('div', { class: 'empty__icon' }, icon('kanban', 'icon--lg')),
  h('h2', { class: 'empty__title' }, t('projets.introuvable.titre')),
  h('p', { class: 'empty__text' }, t('projets.introuvable.texte')),
  h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => navigate('projects', {}, { replace: true }) }, t('projets.retourProjets')));

// Bouton des personnes : « Partager » (propriétaire) ou « Personnes », et
// qui partage, dans le nom lu
function peopleLabel(project) {
  const others = otherMembers(project, app.user.id).map((m) => m.displayName);
  if (project.role === 'owner') return others.length ? t('projets.partager.avec', { names: namesList(others) }) : t('projets.menu.partager');
  return t('projets.personnes.avec', { names: namesList(others) });
}

// « Projet · 55 cartes » (et « · 5 colonnes » sur ordinateur)
const projectSub = (project, pc) => (pc
  ? `${t('projets.sous.projet')} · ${t('projets.nombreColonnes', { count: (project.columns ?? []).length })} · ${t('projets.nombreCartes', { count: cardCount(app.data, project.id) })}`
  : t('projets.sous', { count: cardCount(app.data, project.id) }));

// --- Écran ---
export function renderProject(projectId, onLeave) {
  // Ouvrir vaut « vu » (sur tous mes appareils), et en quittant aussi : ce
  // qui est arrivé pendant la visite a été vu
  projectActions.markProjectSeen(projectId);
  onLeave(() => projectActions.markProjectSeen(projectId));
  refreshData({ quiet: true });
  return isDesktop() ? renderBoard(projectId, onLeave) : renderPhone(projectId, onLeave);
}

// --- Téléphone ---
function renderPhone(projectId, onLeave) {
  const project = () => liveProject(projectId);
  let columnId = null;
  let labelFilter = loadProjectFilter(projectId);
  let lastShownColumn = null;

  const titleText = h('h1', { class: 'topbar__title' });
  const sub = h('p', { class: 'topbar__sub' });
  const peopleButton = h('button', { class: 'icon-btn', type: 'button', 'aria-haspopup': 'dialog', onClick: () => openProjectShare(projectId) }, icon('users'));
  const menuLabel = t('projets.plusActions');
  const menuButton = iconButton('more', menuLabel, () => {
    const p = project();
    if (p) openMenu(projectMenuItems(p, { inside: true, onGone: () => navigate('projects', {}, { replace: true }) }), { label: menuLabel, anchor: menuButton });
  });
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');
  const filterText = h('span', {});
  const filterButton = h('button', { class: 'btn btn--sm btn--secondary', type: 'button', 'aria-haspopup': 'dialog', onClick: () => {
    const p = project();
    if (p) openFilterSheet(p, labelFilter, (ids) => {
      labelFilter = ids;
      saveProjectFilter(projectId, ids);
      draw();
    });
  } }, icon('filter', 'icon--sm'), filterText);
  const statusbar = h('div', { class: 'statusbar' }, syncPill(() => refreshData({ full: true }), { inBar: true }), filterButton);
  const tabs = h('div', { class: 'coltabs', role: 'tablist', 'aria-label': t('projets.colonnes') });
  const panelId = `projet-colonne-${Math.random().toString(36).slice(2, 8)}`;
  const panel = h('div', { class: 'kcards', role: 'tabpanel', id: panelId });
  const content = h('div', { class: 'scroll scroll--under-dock kswipe' }, panel);
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const loupe = loupeButton();
  const search = createSearchRow(content, {
    label: t('projets.recherche.projet'),
    onChange: () => draw(),
    status: searchMeta,
    onOpen: () => {
      loupe.sync();
      draw();
    },
  });
  loupe.set(search.loupe);

  // Barre d'ajout en verre : « Ajouter dans « Relecture » » ; la carte va
  // en bas de la colonne ; le champ garde le curseur (on enchaîne les titres)
  const input = h('input', { class: 'addbar__input', type: 'text', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done', maxlength: String(CARD_TITLE_MAX) });
  const addForm = h('form', { class: 'addbar__row', novalidate: true, onSubmit: (event) => {
    event.preventDefault();
    addTyped();
  } },
  h('label', { class: 'addbar__field' }, input),
  h('button', { class: 'btn btn--primary btn--icon', type: 'submit', 'aria-label': t('projets.ajouter') }, icon('plus')));
  const addbar = h('div', { class: 'addbar addbar--glass glass' }, addForm);
  const loupeDock = h('div', { class: 'list-dock' }, loupe.el);
  async function addTyped() {
    const p = project();
    const title = cleanCardTitle(input.value);
    if (!p || !title || !columnId) return;
    input.value = '';
    await projectActions.createCard(p.id, columnId, title);
  }

  const selectColumn = (id, { focusTab = false } = {}) => {
    if (!id || id === columnId) return;
    columnId = id;
    saveProjectColumn(projectId, id);
    draw();
    content.scrollTop = 0;
    if (focusTab) tabs.querySelector(`[data-column="${id}"]`)?.focus();
  };

  // Flèches gauche et droite dans les onglets (role="tablist")
  tabs.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const p = project();
    if (!step || !p) return;
    event.preventDefault();
    selectColumn(neighbourColumn(p, columnId, step)?.id, { focusTab: true });
  });

  const draw = () => {
    const p = project();
    if (!app.data.loaded) {
      replace(panel, h('p', { class: 'empty muted', role: 'status' }, t('projets.chargement')));
      return;
    }
    if (!p) {
      for (const el of [tabs, statusbar, addbar, loupeDock]) el.hidden = true;
      replace(panel, projectGone());
      return;
    }
    const rights = projectRights(p.role);
    titleText.textContent = p.name;
    document.title = `${p.name} · Listo`;
    sub.textContent = projectSub(p, false);
    peopleButton.setAttribute('aria-label', peopleLabel(p));
    labelFilter = cleanLabelFilter(p, labelFilter);
    filterButton.hidden = !(p.labels ?? []).length && !labelFilter.length;
    filterText.textContent = labelFilter.length ? t('projets.filtrer.nombre', { count: labelFilter.length }) : t('projets.filtrer');
    const column = startColumn(p, columnId ?? loadProjectColumn(projectId));
    columnId = column?.id ?? null;
    const query = search.value;
    const searching = isSearching(query);
    addbar.hidden = !rights.createCards || !column || search.open;
    loupeDock.classList.toggle('list-dock--high', !addbar.hidden);
    input.placeholder = column ? t('projets.ajouterDans', { name: column.name }) : '';
    input.setAttribute('aria-label', input.placeholder);
    const columns = byPosition(p.columns ?? []);
    // Recherche : les onglets laissent la place aux résultats, par colonne
    tabs.hidden = searching;
    if (searching) {
      panel.removeAttribute('role');
      const groups = columns.map((c) => [c, visibleCards(app.data, p, c.id, { labelIds: labelFilter, query })]).filter(([, cards]) => cards.length);
      const total = groups.reduce((sum, [, cards]) => sum + cards.length, 0);
      searchMeta.textContent = t('projets.recherche.cartes', { count: total });
      replace(panel, groups.length
        ? groups.map(([c, cards]) => h('section', { class: 'kgroup' },
          h('h2', { class: `kgroup__title c-${c.color}` }, h('span', { class: 'coldot', 'aria-hidden': 'true' }), c.name),
          h('div', { class: 'kcards', 'data-column': c.id }, cards.map((card) => cardFace(card, p)))))
        : h('p', { class: 'empty muted' }, t('projets.recherche.aucuneCarte')));
      return;
    }
    searchMeta.textContent = '';
    panel.setAttribute('role', 'tabpanel');
    replace(tabs, columns.map((c) => {
      const all = columnCards(app.data, c.id).length;
      const shown = labelFilter.length ? visibleCards(app.data, p, c.id, { labelIds: labelFilter }).length : all;
      const selected = c.id === columnId;
      const tab = h('button', {
        class: `coltab c-${c.color}`,
        type: 'button',
        role: 'tab',
        'data-column': c.id,
        'aria-selected': String(selected),
        'aria-controls': panelId,
        tabindex: selected ? '0' : '-1',
        'aria-label': labelFilter.length ? t('projets.onglet.filtre', { name: c.name, shown, count: all }) : t('projets.onglet', { name: c.name, count: all }),
        onClick: () => selectColumn(c.id),
      }, h('span', { class: 'coldot', 'aria-hidden': 'true' }), c.name, h('span', { class: 'coltab__count', 'aria-hidden': 'true' }, String(shown)));
      return tab;
    }));
    // L'onglet choisi reste en vue (seulement quand il change)
    if (column && lastShownColumn !== column.id) {
      lastShownColumn = column.id;
      requestAnimationFrame(() => tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
    }
    panel.setAttribute('aria-label', column?.name ?? '');
    panel.dataset.column = columnId ?? '';
    const cards = column ? visibleCards(app.data, p, column.id, { labelIds: labelFilter }) : [];
    replace(panel, cards.length
      ? cards.map((card) => cardFace(card, p))
      : h('p', { class: 'kempty' }, labelFilter.length ? t('projets.colonne.videFiltre') : t('projets.colonne.vide', { name: column?.name ?? '' })));
  };

  // Appui long et glisser ; glissement de côté pour changer de colonne
  const drag = cardDrag(content, {
    canMove: (cardId) => {
      const card = app.data.cards.get(cardId);
      return Boolean(card) && !isSearching(search.value) && rightsOn(card, project()).move;
    },
    onDrop: ({ cardId, columnId: target, afterId }) => projectActions.moveCard(cardId, { columnId: target, afterId }),
    scrollers: () => [content],
  });
  onLeave(() => drag.dispose());
  onLeave(columnSwipe(content, {
    busy: () => drag.dragging() || isSearching(search.value),
    onSwipe: (step) => {
      const p = project();
      if (p) selectColumn(neighbourColumn(p, columnId, step)?.id);
    },
  }));

  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('projets.retourProjets'), () => goBack('projects')),
      h('div', { class: 'topbar__main' }, h('div', { class: 'topbar__head' }, h('span', { class: 'topbar__icon', 'aria-hidden': 'true' }, icon('kanban')), titleText), sub),
      peopleButton,
      menuButton),
    statusbar,
    tabs,
    search.bar,
    content,
    addbar,
    loupeDock);
}

// --- Ordinateur : toute la largeur, colonnes côte à côte ---
function renderBoard(projectId, onLeave) {
  const project = () => liveProject(projectId);
  let labelFilter = loadProjectFilter(projectId);
  let showAllLabels = false;
  let adding = null; // colonne où l'on écrit une nouvelle carte (curseur dans son champ)

  const title = h('h1', { class: 'pc-head__title' });
  const sub = h('p', { class: 'pc-head__sub' }, icon('kanban', 'icon--xs'), h('span', {}));
  const shareFaces = h('span', { class: 'avatars', 'aria-hidden': 'true' });
  const shareText = h('span', {});
  const shareButton = h('button', { class: 'btn btn--secondary', type: 'button', 'data-action': 'share', 'aria-keyshortcuts': 'P', 'aria-haspopup': 'dialog', onClick: () => openProjectShare(projectId) },
    icon('users', 'icon--sm'), shareText, shareFaces);
  const menuLabel = t('projets.plusActions');
  const menuButton = iconButton('more', menuLabel, () => {
    const p = project();
    if (p) openMenu(projectMenuItems(p, { inside: true, onGone: () => navigate('projects', {}, { replace: true }) }), { label: menuLabel, anchor: menuButton });
  });
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');
  const board = h('div', { class: 'kboard', role: 'list', 'aria-label': t('projets.colonnes') });
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const search = createSearchRow(board, { label: t('projets.recherche.projet'), onChange: () => draw(), docked: true, placeholder: t('navigation.recherche.placeholder') });
  search.field.querySelector('input').setAttribute('aria-keyshortcuts', '/');
  search.field.append(keycap('/'));
  const filters = h('div', { class: 'kfilters' });

  // Une carte ajoutée depuis « + Ajouter une carte » : le champ reste prêt
  async function addCard(columnId, value, field) {
    const p = project();
    const titleValue = cleanCardTitle(value);
    if (!p || !titleValue) return;
    field.value = '';
    await projectActions.createCard(p.id, columnId, titleValue);
  }

  // Filtres par étiquette (les six premières, « + 2 » montre les autres)
  function drawFilters(p) {
    const labels = p.labels ?? [];
    filters.hidden = !labels.length;
    if (!labels.length) {
      replace(filters);
      return;
    }
    const shown = showAllLabels ? labels : labels.slice(0, 6);
    const toggle = (id) => {
      labelFilter = labelFilter.includes(id) ? labelFilter.filter((x) => x !== id) : [...labelFilter, id];
      saveProjectFilter(projectId, labelFilter);
      draw();
    };
    replace(filters,
      h('div', { class: 'kfilters__group', role: 'group', 'aria-label': t('projets.etiquettes') },
        h('span', { class: 'kfilters__name', 'aria-hidden': 'true' }, t('projets.etiquettes')),
        shown.map((label) => {
          const on = labelFilter.includes(label.id);
          return h('button', { class: 'label-filter__opt', type: 'button', 'aria-pressed': String(on), 'data-label': label.id, onClick: () => toggle(label.id) },
            labelChip(label, { extra: on ? icon('check') : null }));
        }),
        labels.length > shown.length ? h('button', { class: 'pfilter pfilter--text', type: 'button', onClick: () => {
          showAllLabels = true;
          draw();
        } }, t('projets.filtre.plus', { count: labels.length - shown.length })) : null),
      labelFilter.length ? h('button', { class: 'btn btn--sm btn--ghost kfilters__clear', type: 'button', onClick: () => {
        labelFilter = [];
        saveProjectFilter(projectId, []);
        draw();
      } }, t('projets.filtre.effacerTout')) : null);
  }

  // Une colonne : liseré de sa couleur, nom, nombre, ⋮ (propriétaire et
  // « Peut modifier »), ses cartes, « + Ajouter une carte »
  function columnEl(p, column, rights, query) {
    const cards = visibleCards(app.data, p, column.id, { labelIds: labelFilter, query });
    const all = columnCards(app.data, column.id).length;
    const columns = byPosition(p.columns ?? []);
    const at = columns.findIndex((c) => c.id === column.id);
    const menuLabelCol = t('projets.colonne.actions', { name: column.name });
    const colMenu = rights.columns ? iconButton('more', menuLabelCol, () => openMenu([
      { icon: 'pencil', label: t('projets.colonne.renommer'), onSelect: () => openColumnSheet(p.id, column.id) },
      at > 0 ? { icon: 'chev-l', label: t('projets.colonne.gauche'), onSelect: () => projectActions.moveColumn(p.id, column.id, columns[at - 2]?.id ?? null) } : null,
      at < columns.length - 1 ? { icon: 'chev-r', label: t('projets.colonne.droite'), onSelect: () => projectActions.moveColumn(p.id, column.id, columns[at + 1].id) } : null,
      columns.length > 1 ? { icon: 'trash', label: t('projets.colonne.supprimer'), danger: true, separated: true, onSelect: () => askDeleteColumn(p.id, column.id) } : null,
    ].filter(Boolean), { label: menuLabelCol, anchor: colMenu })) : null;
    colMenu?.setAttribute('aria-haspopup', 'menu');
    const list = h('div', { class: 'kcol__cards', role: 'list', 'data-column': column.id, 'aria-label': column.name },
      cards.map((card) => {
        const face = cardFace(card, p);
        face.setAttribute('role', 'listitem');
        return face;
      }));
    let foot = null;
    if (rights.createCards && !isSearching(query)) {
      if (adding === column.id) {
        const field = h('input', { class: 'input', type: 'text', maxlength: String(CARD_TITLE_MAX), autocomplete: 'off', placeholder: t('projets.carte.titreNouvelle'), 'aria-label': t('projets.ajouterDans', { name: column.name }) });
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            adding = null;
            draw();
          }
        });
        foot = h('form', { class: 'kcol__form', novalidate: true, onSubmit: (event) => {
          event.preventDefault();
          addCard(column.id, field.value, field);
        } }, field,
        h('div', { class: 'kcol__formbar' },
          h('button', { class: 'btn btn--sm btn--primary', type: 'submit' }, t('projets.ajouter')),
          h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: () => {
            adding = null;
            draw();
          } }, t('projets.annuler'))));
        // Geste fait pour écrire (« + Ajouter une carte », « Nouvelle carte », N)
        queueMicrotask(() => field.focus());
      } else {
        foot = h('button', { class: 'kcol__add', type: 'button', 'data-add-card': column.id, onClick: () => {
          adding = column.id;
          draw();
        } }, icon('plus', 'icon--sm'), t('projets.ajouterCarte'));
      }
    }
    return h('section', { class: `kcol c-${column.color}`, role: 'listitem', 'data-drop-list': '', 'aria-label': t('projets.onglet', { name: column.name, count: all }) },
      h('div', { class: 'kcol__head' },
        h('span', { class: 'coldot', 'aria-hidden': 'true' }),
        h('h2', { class: 'kcol__name' }, column.name),
        h('span', { class: 'count', 'aria-hidden': 'true' }, String(labelFilter.length || isSearching(query) ? cards.length : all)),
        colMenu),
      list,
      foot);
  }

  const draw = () => {
    const p = project();
    if (!app.data.loaded) {
      replace(board, h('p', { class: 'empty muted', role: 'status' }, t('projets.chargement')));
      return;
    }
    if (!p) {
      shareButton.hidden = true;
      menuButton.hidden = true;
      filters.hidden = true;
      replace(board, projectGone());
      return;
    }
    const rights = projectRights(p.role);
    title.textContent = p.name;
    document.title = `${p.name} · Listo`;
    sub.lastChild.textContent = projectSub(p, true);
    const people = (p.members ?? []).filter((m) => m.active !== false);
    shareText.textContent = rights.share ? t('projets.menu.partager') : t('projets.menu.personnes');
    shareButton.setAttribute('aria-label', peopleLabel(p));
    replace(shareFaces, people.length > 1 ? people.slice(0, 4).map((m, i) => avatar(m.displayName, { second: i > 0 })) : null);
    labelFilter = cleanLabelFilter(p, labelFilter);
    drawFilters(p);
    const query = search.value;
    const columns = byPosition(p.columns ?? []);
    if (adding && !columns.some((c) => c.id === adding)) adding = null;
    const held = board.contains(document.activeElement) && !isTextField(document.activeElement) ? document.activeElement.closest('[data-card]')?.dataset.card : null;
    const scrollLeft = board.scrollLeft;
    const scrolls = new Map([...board.querySelectorAll('.kcol__cards')].map((el) => [el.dataset.column, el.scrollTop]));
    searchMeta.textContent = isSearching(query)
      ? t('projets.recherche.cartes', { count: columns.reduce((sum, c) => sum + visibleCards(app.data, p, c.id, { labelIds: labelFilter, query }).length, 0) })
      : '';
    replace(board,
      columns.map((column) => columnEl(p, column, rights, query)),
      rights.columns && !isSearching(query) ? h('button', { class: 'kcol kcol--new', type: 'button', onClick: () => openColumnSheet(p.id, null) }, icon('plus', 'icon--sm'), t('projets.colonne.ajouter')) : null);
    board.scrollLeft = scrollLeft;
    for (const el of board.querySelectorAll('.kcol__cards')) el.scrollTop = scrolls.get(el.dataset.column) ?? 0;
    // La carte qui avait le focus clavier le retrouve
    if (held) board.querySelector(`[data-card="${held}"] .kcard__link`)?.focus({ preventScroll: true });
  };

  // Clavier : flèches haut et bas dans une colonne, gauche et droite d'une
  // colonne à l'autre ; M « Déplacer vers… » (touches à une touche :
  // désactivables, jamais pendant la saisie)
  board.addEventListener('keydown', (event) => {
    if (isTextField(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const face = event.target.closest?.('[data-card]');
    if (!face) return;
    const p = project();
    const card = app.data.cards.get(face.dataset.card);
    if (!p || !card) return;
    if (event.key.toLowerCase() === 'm' && singleKeysOn()) {
      if (rightsOn(card, p).move) {
        event.preventDefault();
        openMoveSheet(card.id);
      }
      return;
    }
    const lists = [...board.querySelectorAll('.kcol__cards')];
    const list = face.parentElement;
    const faces = [...list.querySelectorAll('[data-card]')];
    let next = null;
    if (event.key === 'ArrowDown') next = faces[faces.indexOf(face) + 1];
    else if (event.key === 'ArrowUp') next = faces[faces.indexOf(face) - 1];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const other = lists[lists.indexOf(list) + (event.key === 'ArrowRight' ? 1 : -1)];
      const others = other ? [...other.querySelectorAll('[data-card]')] : [];
      next = others[Math.min(faces.indexOf(face), others.length - 1)];
    } else return;
    event.preventDefault();
    if (!next) return;
    next.querySelector('.kcard__link')?.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  // Glisser-déposer à la souris (et au doigt sur un grand écran tactile)
  const drag = cardDrag(board, {
    canMove: (cardId) => {
      const card = app.data.cards.get(cardId);
      return Boolean(card) && rightsOn(card, project()).move;
    },
    onDrop: ({ cardId, columnId, afterId }) => projectActions.moveCard(cardId, { columnId, afterId }),
    scrollers: () => {
      const under = document.querySelector('.kcol .kdrop')?.closest('.kcol__cards');
      return [under, board];
    },
  });
  onLeave(() => drag.dispose());

  const idle = drawWhenIdle(board, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();

  return h('div', { class: 'screen kproject' },
    h('header', { class: 'pc-head' },
      h('div', { class: 'pc-head__main' }, title, sub),
      syncPill(() => refreshData({ full: true })),
      shareButton,
      search.field,
      menuButton),
    filters,
    searchMeta,
    offlineBanner(),
    board);
}

// « Nouvelle carte » (bas du menu de gauche, touche N) : le champ de la
// colonne qui a le focus, sinon de la première (pour qui peut créer des
// cartes ; le bouton n'existe pas sinon)
export function startNewCard() {
  const board = document.querySelector('.kboard');
  const button = board?.querySelector('.kcol:focus-within [data-add-card]') ?? board?.querySelector('[data-add-card]');
  button?.click();
}
