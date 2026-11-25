// Réglages d'un projet (#/projets/<id>/reglages ; docs/cadrage-projets.md,
// 4.5 ; maquettes design/projets/captures/reglages-projet-1, colonne-1 et
// pc-reglages-projet-1 ; en deux onglets depuis le 25 novembre 2026,
// variante A choisie par le propriétaire), la feuille d'une colonne et
// celle d'une étiquette du projet.
//
// Propriétaire et « Peut modifier » seulement (Contributeur et Lecture
// seule n'ont pas cet écran : l'adresse ramène au projet). Le nom, l'option
// « Priorité » et « Supprimer le projet » : propriétaire seulement (« Peut
// modifier » voit le nom sans pouvoir le changer) ; l'option « Échéances » :
// propriétaire et « Peut modifier ». Colonnes et étiquettes : les deux
// (projectRights : columns, labels), donc l'onglet « Étiquettes » est
// toujours là, toujours modifiable, pour qui ouvre cet écran.
//
// Deux onglets sous le titre (role="tablist", .tabs / .tab du kit, comme
// « Commentaires · Historique » d'une carte), hors de la zone qui défile :
// toujours visibles. Flèches gauche et droite d'un onglet à l'autre. Chaque
// onglet a son adresse (project-settings-tabs.js), posée sans redessiner
// l'écran ni ajouter d'entrée à l'historique (replaceAddress).
//
// Onglet « Projet », dans l'ordre : nom, options, colonnes, « Supprimer le
// projet » (ordinateur : nom, options et « Supprimer » à gauche, colonnes à
// droite).
// - Nom du projet (1 à 80 caractères) : enregistré en quittant le champ ou
//   avec Entrée.
// - Options : « Priorité » (propriétaire ; désactivée au départ) et
//   « Échéances » (propriétaire et « Peut modifier » ; activée au départ ;
//   désactivée, les cartes n'ont plus ni échéance, ni rappel, ni case
//   « Fait », rien n'est effacé : décision du 25 novembre 2026, après
//   l'essai). Le même interrupteur pour les deux.
// - Colonnes : une ligne par colonne (poignée pour changer l'ordre en
//   glissant, point de couleur, nom, nombre de cartes, crayon) ; « Ajouter
//   une colonne ». La feuille d'une colonne : nom (1 à 40 caractères,
//   unique dans le projet, majuscules et accents ignorés), huit couleurs,
//   place (« Avant « Brouillons » », « Après « Planifiés » » : l'alternative
//   au glisser), « Supprimer la colonne ». Une colonne qui a des cartes :
//   « Déplacer ses 5 cartes vers… » ou « Supprimer la colonne et ses 5
//   cartes » (elles vont dans les cartes supprimées du projet) ; un projet
//   garde toujours au moins une colonne.
// - « Supprimer le projet » (propriétaire).
//
// Onglet « Étiquettes · 25 » (étiquettes propres au projet : décision du
// 25 novembre 2026) :
// - « Rechercher une étiquette » : filtre en tapant (majuscules et accents
//   ignorés, search.js), partie trouvée marquée dans la pastille, « 12
//   étiquettes sur 25 » pendant une recherche, croix pour effacer ; jamais
//   de curseur mis tout seul dans le champ ;
// - « Nouvelle étiquette » en tête (pendant une recherche, le nom proposé
//   est le texte cherché) ;
// - les étiquettes par ordre alphabétique (nombres lus comme des nombres,
//   majuscules et accents ignorés) : pastille, nombre de cartes, crayon
//   (nom, couleur, supprimer avec « retirée de 4 cartes »). Ordinateur : sur
//   deux colonnes dans le même groupe.
//
// Tout passe par la file d'attente (hors ligne compris) ; le serveur
// revérifie les droits et les noms. Textes posés par textContent (h()).

import { h, icon, iconButton, replace, field, errorNote, LABEL_INPUT } from '../dom.js';
import { navigate, goBack, replaceAddress } from '../router.js';
import { app, onDataChange, isDesktop } from '../app.js';
import { openSheet, toast, confirmDialog, drawWhenIdle, offlineBanner } from '../ui.js';
import { t, getLocale } from '../i18n.js';
import { keepFieldFocus } from '../tap.js';
import { isSearching, highlightParts } from '../search.js';
import { SETTINGS_TABS, sortedLabels, foundLabels } from '../project-settings-tabs.js';
import {
  projectRights, deadlinesOn, byPosition, cleanProjectName, cleanColumnName, cleanProjectLabelName, nameTaken,
  PROJECT_NAME_MAX, COLUMN_NAME_MAX, PROJECT_LABEL_NAME_MAX, COLUMNS_MAX, PROJECT_LABELS_MAX, DEFAULT_COLUMN_COLOR,
} from '../projects.js';
import { DEFAULT_LABEL_COLOR } from '../labels.js';
import { columnCards } from '../project-store.js';
import { labelUse } from '../project-view.js';
import * as projectActions from '../project-actions.js';
import { labelChip, labelPalette } from './note-labels.js';
import { liveProject, projectGone } from './project.js';
import { askDelete } from './projects.js';
import { topbar } from './settings.js';

// --- Feuille d'une colonne (maquette colonne-1) ; columnId null : nouvelle ---
export function openColumnSheet(projectId, columnId) {
  const project = liveProject(projectId);
  if (!project || !projectRights(project.role).columns) return null;
  const creating = columnId === null;
  const column = creating ? null : (project.columns ?? []).find((c) => c.id === columnId);
  if (!creating && !column) return null;
  if (creating && (project.columns ?? []).length >= COLUMNS_MAX) {
    toast(t('projets.colonne.limite', { max: COLUMNS_MAX }));
    return null;
  }
  let color = column?.color ?? DEFAULT_COLUMN_COLOR;
  const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: String(COLUMN_NAME_MAX), value: column?.name ?? '' });
  const name = field(t('projets.colonne.nom'), input);
  const palette = labelPalette(color, (value) => { color = value; }, { label: t('projets.colonne.couleur') });
  const error = errorNote();

  // Enregistrer : le nom (unique dans le projet) et la couleur
  const save = async (event) => {
    event?.preventDefault();
    const now = liveProject(projectId);
    if (!now) return sheet.close();
    const value = cleanColumnName(input.value);
    if (!value) return name.setError(t('projets.colonne.nomInvalide'));
    if (nameTaken(now.columns ?? [], value, column?.id ?? null)) return name.setError(t('projets.colonne.nomPris'));
    sheet.close();
    if (creating) await projectActions.createColumn(projectId, { name: value, color });
    else if (value !== column.name || color !== column.color) await projectActions.updateColumn(projectId, column.id, { name: value, color });
  };

  // Place : « Avant « Brouillons » » et « Après « Planifiés » » (un cran à
  // chaque appui, comme glisser la poignée) ; la feuille reste ouverte
  const placeButtons = h('div', { class: 'col-place' });
  const paintPlace = () => {
    const now = liveProject(projectId);
    const columns = byPosition(now?.columns ?? []);
    const at = columns.findIndex((c) => c.id === columnId);
    if (at < 0) return replace(placeButtons);
    const before = columns[at - 1];
    const after = columns[at + 1];
    replace(placeButtons,
      h('button', { class: 'btn btn--secondary', type: 'button', disabled: !before, onClick: () => projectActions.moveColumn(projectId, columnId, columns[at - 2]?.id ?? null) },
        icon('arrow-up', 'icon--sm'), before ? t('projets.colonne.avant', { name: before.name }) : t('projets.colonne.premiere')),
      h('button', { class: 'btn btn--secondary', type: 'button', disabled: !after, onClick: () => projectActions.moveColumn(projectId, columnId, after.id) },
        icon('arrow-down', 'icon--sm'), after ? t('projets.colonne.apres', { name: after.name }) : t('projets.colonne.derniere')));
  };
  const stop = creating ? () => {} : onDataChange(() => {
    if (!liveProject(projectId)?.columns?.some((c) => c.id === columnId)) sheet.close();
    else paintPlace();
  });
  const cards = creating ? 0 : columnCards(app.data, columnId).length;
  const only = !creating && (project.columns ?? []).length <= 1;
  const form = h('form', { class: 'kform', novalidate: true, onSubmit: save },
    error.note,
    name.field,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('projets.colonne.couleur')), palette.element),
    creating ? null : h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('projets.colonne.place')), placeButtons),
    creating ? h('div', { class: 'dialog__actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('projets.annuler')),
      h('button', { class: 'btn btn--primary', type: 'submit' }, t('projets.colonne.creer'))) : null,
    creating ? null : h('button', { class: 'btn btn--danger-outline btn--block', type: 'button', disabled: only, onClick: () => {
      sheet.close();
      askDeleteColumn(projectId, columnId);
    } }, icon('trash', 'icon--sm'), t('projets.colonne.supprimer')),
    creating ? null : h('p', { class: 'field__hint' }, only ? t('projets.colonne.derniereRestante')
      : cards ? t('projets.colonne.supprimer.aide', { count: cards }) : t('projets.colonne.supprimer.vide')));
  const sheet = openSheet({
    title: creating ? t('projets.colonne.nouvelle') : t('projets.colonne.titre', { name: column.name }),
    tools: creating ? null : h('button', { class: 'btn btn--primary btn--icon', type: 'button', 'aria-label': t('projets.enregistrer'), onClick: save }, icon('disquette')),
    content: form,
    scroll: true,
    pc: 'modal',
    size: 'sm',
    onClose: stop,
  });
  paintPlace();
  return sheet;
}

// --- Supprimer une colonne : vide, elle part sans autre question ; avec
// des cartes, le choix « Déplacer ses 5 cartes vers… » (une autre colonne)
// ou « Supprimer la colonne et ses 5 cartes » (cartes supprimées du projet,
// 30 jours) ---
export function askDeleteColumn(projectId, columnId) {
  const project = liveProject(projectId);
  const column = project?.columns?.find((c) => c.id === columnId);
  if (!project || !column || !projectRights(project.role).columns) return;
  if ((project.columns ?? []).length <= 1) {
    toast(t('projets.colonne.derniereRestante'));
    return;
  }
  const count = columnCards(app.data, columnId).length;
  if (!count) {
    projectActions.deleteColumn(projectId, columnId);
    toast(t('projets.colonne.supprimee', { name: column.name }), { low: true });
    return;
  }
  const others = byPosition(project.columns).filter((c) => c.id !== columnId);
  let choice = 'move';
  let target = others[0].id;
  const select = h('select', { class: 'input', 'aria-label': t('projets.colonne.versColonne') },
    others.map((c) => h('option', { value: c.id }, c.name)));
  select.addEventListener('change', () => { target = select.value; });
  const options = [
    ['move', t('projets.colonne.supprimer.deplacer', { count })],
    ['delete', t('projets.colonne.supprimer.cartes', { count })],
  ].map(([value, text]) => {
    const row = h('button', { class: 'radio-row', type: 'button', role: 'radio', onClick: () => {
      choice = value;
      paint();
    } }, h('span', { class: 'radio', 'aria-hidden': 'true' }), h('span', {}, text));
    row.dataset.value = value;
    return row;
  });
  const paint = () => {
    for (const row of options) {
      const on = row.dataset.value === choice;
      row.setAttribute('aria-checked', String(on));
      row.classList.toggle('is-on', on);
      row.querySelector('.radio').classList.toggle('is-on', on);
    }
    select.disabled = choice !== 'move';
  };
  const confirm = () => {
    sheet.close();
    projectActions.deleteColumn(projectId, columnId, choice === 'move' ? { moveTo: target } : { deleteCards: true });
    toast(t('projets.colonne.supprimee', { name: column.name }), { low: true });
  };
  const sheet = openSheet({
    title: t('projets.colonne.supprimer.question', { name: column.name }),
    content: [
      h('div', { class: 'group', role: 'radiogroup', 'aria-label': t('projets.colonne.supprimer.choix') }, options[0], options[1]),
      h('div', { class: 'field' }, select),
      h('p', { class: 'field__hint' }, t('projets.colonne.supprimer.corbeille')),
      h('div', { class: 'dialog__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', 'data-initial-focus': 'true', onClick: () => sheet.close() }, t('projets.annuler')),
        h('button', { class: 'btn btn--danger', type: 'button', onClick: confirm }, t('projets.colonne.supprimer'))),
    ],
    pc: 'modal',
    size: 'sm',
  });
  paint();
}

// --- Feuille d'une étiquette du projet ; labelId null : nouvelle.
// onCreated(id) : appelée avec l'étiquette créée (posée sur une carte) ;
// name : nom proposé pour une nouvelle (le texte cherché dans l'onglet
// « Étiquettes ») ---
export function openLabelSheet(projectId, labelId, { onCreated = null, name: proposed = '' } = {}) {
  const project = liveProject(projectId);
  if (!project || !projectRights(project.role).labels) return null;
  const creating = labelId === null;
  const label = creating ? null : (project.labels ?? []).find((l) => l.id === labelId);
  if (!creating && !label) return null;
  if (creating && (project.labels ?? []).length >= PROJECT_LABELS_MAX) {
    toast(t('projets.etiquette.limite', { max: PROJECT_LABELS_MAX }));
    return null;
  }
  let color = label?.color ?? DEFAULT_LABEL_COLOR;
  const input = h('input', { class: 'input', ...LABEL_INPUT, maxlength: String(PROJECT_LABEL_NAME_MAX), value: label?.name ?? proposed.slice(0, PROJECT_LABEL_NAME_MAX) });
  const name = field(t('projets.etiquette.nom'), input);
  const preview = h('div', { class: 'label-preview' });
  const paintPreview = () => replace(preview, labelChip({ name: input.value.trim() || t('projets.etiquette.apercu'), color }));
  input.addEventListener('input', paintPreview);
  const palette = labelPalette(color, (value) => {
    color = value;
    paintPreview();
  }, { label: t('projets.etiquette.couleur') });
  const save = async (event) => {
    event?.preventDefault();
    const now = liveProject(projectId);
    if (!now) return sheet.close();
    const value = cleanProjectLabelName(input.value);
    if (!value) return name.setError(t('projets.etiquette.nomInvalide'));
    if (nameTaken(now.labels ?? [], value, label?.id ?? null)) return name.setError(t('projets.etiquette.nomPris'));
    sheet.close();
    if (creating) {
      const id = await projectActions.createProjectLabel(projectId, { name: value, color });
      onCreated?.(id);
    } else if (value !== label.name || color !== label.color) await projectActions.updateProjectLabel(projectId, label.id, { name: value, color });
  };
  const remove = async () => {
    const count = labelUse(app.data, projectId, labelId);
    const ok = await confirmDialog({
      title: t('projets.etiquette.supprimer.question', { name: label.name }),
      text: count ? t('projets.etiquette.supprimer.texte', { count }) : t('projets.etiquette.supprimer.aucune'),
      confirmLabel: t('projets.etiquette.supprimer'),
      focusCancel: true,
    });
    if (!ok) return;
    sheet.close();
    projectActions.deleteProjectLabel(projectId, labelId);
  };
  paintPreview();
  const form = h('form', { class: 'kform', novalidate: true, onSubmit: save },
    name.field,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('projets.etiquette.couleur')), palette.element),
    preview,
    h('div', { class: 'dialog__actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('projets.annuler')),
      h('button', { class: 'btn btn--primary', type: 'submit' }, creating ? t('projets.etiquette.creer') : t('projets.enregistrer'))),
    creating ? null : h('button', { class: 'btn btn--danger-outline btn--block', type: 'button', onClick: remove }, icon('trash', 'icon--sm'), t('projets.etiquette.supprimer')));
  const sheet = openSheet({
    title: creating ? t('projets.etiquette.nouvelle') : t('projets.etiquette.titre', { name: label.name }),
    content: form,
    scroll: true,
    pc: 'modal',
    size: 'sm',
  });
  return sheet;
}

// Glisser la poignée d'une colonne : la ligne suit le doigt (ou la souris)
// et passe devant ou derrière ses voisines à mi-hauteur ; au lâcher, un
// seul déplacement (column.move), rien si la place n'a pas changé (comme
// l'ordre des tuiles de l'Accueil)
function startColumnDrag(event, row, projectId) {
  if (event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  const list = row.parentElement;
  const ids = () => [...list.querySelectorAll('[data-column]')].map((el) => el.dataset.column);
  const startOrder = ids().join();
  let originY = event.clientY;
  row.classList.add('is-dragging');
  const follow = (y) => {
    row.style.transform = `translateY(${y - originY}px)`;
    const next = row.nextElementSibling?.dataset?.column ? row.nextElementSibling : null;
    const prev = row.previousElementSibling?.dataset?.column ? row.previousElementSibling : null;
    const box = row.getBoundingClientRect();
    if (next) {
      const nextBox = next.getBoundingClientRect();
      if (box.bottom > nextBox.top + nextBox.height / 2) {
        list.insertBefore(next, row);
        originY += nextBox.height;
        row.style.transform = `translateY(${y - originY}px)`;
        return;
      }
    }
    if (prev) {
      const prevBox = prev.getBoundingClientRect();
      if (box.top < prevBox.top + prevBox.height / 2) {
        list.insertBefore(row, prev);
        originY -= prevBox.height;
        row.style.transform = `translateY(${y - originY}px)`;
      }
    }
  };
  const onMove = (moveEvent) => follow(moveEvent.clientY);
  const finish = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    row.style.transform = '';
    row.classList.remove('is-dragging');
    const order = ids();
    if (order.join() === startOrder) return;
    const at = order.indexOf(row.dataset.column);
    projectActions.moveColumn(projectId, row.dataset.column, at > 0 ? order[at - 1] : null);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

// --- Écran ---
// tab : l'onglet ouvert au départ (« projet » ou « etiquettes »,
// project-settings-tabs.js)
export function renderProjectSettings(projectId, tab, onLeave) {
  const pc = isDesktop();
  const nameInput = h('input', { class: 'input', type: 'text', maxlength: String(PROJECT_NAME_MAX), autocomplete: 'off', enterkeyhint: 'done' });
  const nameField = field(t('projets.reglages.nom'), nameInput);
  let shownName = null;
  const saveName = () => {
    const p = liveProject(projectId);
    if (!p || !projectRights(p.role).rename) return;
    const value = cleanProjectName(nameInput.value);
    if (!value) {
      nameField.setError(t('projets.nouveau.nomInvalide'));
      return;
    }
    nameField.setError('');
    if (value !== p.name) projectActions.renameProject(projectId, value);
  };
  nameInput.addEventListener('change', saveName);
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveName();
    }
  });

  // Onglets (role="tablist") et leurs deux zones (role="tabpanel"), dans
  // la même zone qui défile ; seule celle de l'onglet choisi est visible
  const panels = {
    projet: h('div', { class: pc ? 'pc-settings kset' : 'kset', role: 'tabpanel', id: 'reglages-projet-zone', 'aria-labelledby': 'reglages-projet-onglet' }),
    etiquettes: h('div', { class: pc ? 'pc-settings kset kset--labels' : 'kset kset--labels', role: 'tabpanel', id: 'reglages-etiquettes-zone', 'aria-labelledby': 'reglages-etiquettes-onglet' }),
  };
  const tabButtons = {};
  for (const key of SETTINGS_TABS) {
    tabButtons[key] = h('button', {
      class: 'tab', type: 'button', role: 'tab', id: `reglages-${key}-onglet`, 'aria-controls': `reglages-${key}-zone`,
      onClick: () => select(key),
    });
  }
  tabButtons.projet.textContent = t('projets.reglages.onglet.projet');
  const tabBar = h('div', { class: 'tabs kset-tabs', role: 'tablist', 'aria-label': t('projets.reglages.titre') }, SETTINGS_TABS.map((key) => tabButtons[key]));
  // Flèches gauche et droite d'un onglet à l'autre (clavier)
  tabBar.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = SETTINGS_TABS[(SETTINGS_TABS.indexOf(tab) + step + SETTINGS_TABS.length) % SETTINGS_TABS.length];
    select(next);
    const nextTab = tabButtons[next];
    nextTab.focus();
  });
  const scroll = h('div', { class: 'scroll' }, panels.projet, panels.etiquettes);

  // Onglet affiché : le sien marqué (souligné ET texte plus foncé, jamais
  // la couleur seule), sa zone seule visible
  const showTab = () => {
    for (const key of SETTINGS_TABS) {
      const on = key === tab;
      tabButtons[key].setAttribute('aria-selected', String(on));
      tabButtons[key].tabIndex = on ? 0 : -1;
      panels[key].hidden = !on;
    }
  };
  // Choisir un onglet : son adresse posée sans redessiner l'écran ni
  // ajouter d'entrée à l'historique ; la zone repart du haut
  const select = (key) => {
    if (key === tab) return;
    tab = key;
    showTab();
    scroll.scrollTop = 0;
    if (key === 'projet') replaceAddress('projectSettings', { id: projectId });
    else replaceAddress('projectSettingsTab', { id: projectId, tab: key });
  };
  // Nom de l'onglet « Étiquettes » : « Étiquettes · 25 », lu « Étiquettes,
  // 25 étiquettes » ; « Étiquettes » seul quand il n'y en a aucune
  const paintTabs = (count) => {
    const button = tabButtons.etiquettes;
    button.textContent = count ? t('projets.reglages.onglet.etiquettes.nombre', { count }) : t('projets.reglages.onglet.etiquettes');
    if (count) button.setAttribute('aria-label', t('projets.reglages.onglet.etiquettes.lu', { count }));
    else button.removeAttribute('aria-label');
  };

  // --- Onglet « Étiquettes » : recherche (champ gardé d'un dessin à
  // l'autre : le texte et le curseur ne bougent pas), « Nouvelle étiquette »,
  // étiquettes par ordre alphabétique ---
  const searchInput = h('input', {
    class: 'searchfield__input', type: 'search', enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    maxlength: '100', placeholder: t('projets.reglages.recherche'), 'aria-label': t('projets.reglages.recherche'),
  });
  // La croix vide le champ ; un appui ne retire pas le curseur du champ
  // s'il y était (keepFieldFocus), et ne l'y met jamais
  const clearButton = h('button', {
    class: 'icon-btn', type: 'button', 'aria-label': t('projets.reglages.recherche.effacer'), hidden: true,
    onPointerdown: keepFieldFocus.pointerdown, onMousedown: keepFieldFocus.mousedown,
    onClick: () => {
      searchInput.value = '';
      paintLabels();
    },
  }, icon('x-circle'));
  const searchField = h('label', { class: 'searchfield' }, icon('search', 'icon--sm'), searchInput, clearButton);
  // « 12 étiquettes sur 25 » : seulement pendant une recherche (vide et
  // caché sinon), annoncé par les lecteurs d'écran
  const found = h('p', { class: 'field__hint kset__found', role: 'status' });
  const labelsGroup = h('div', { class: 'group' });
  replace(panels.etiquettes, h('div', { class: 'kset__search' }, searchField, found), labelsGroup);
  searchInput.addEventListener('input', () => paintLabels());
  searchInput.addEventListener('keydown', (event) => {
    // Échap vide la recherche (le champ garde le curseur)
    if (event.key === 'Escape' && searchInput.value) {
      event.preventDefault();
      event.stopPropagation();
      searchInput.value = '';
      paintLabels();
    }
  });

  let labelsDrawn = '';
  const paintLabels = () => {
    const p = liveProject(projectId);
    if (!p || !projectRights(p.role).labels) return;
    const query = searchInput.value;
    const searching = isSearching(query);
    clearButton.hidden = query === '';
    const all = p.labels ?? [];
    const uses = all.map((l) => labelUse(app.data, projectId, l.id));
    const key = JSON.stringify([getLocale(), all, uses, searching ? query : '']);
    if (key === labelsDrawn) return;
    labelsDrawn = key;
    const shown = sortedLabels(foundLabels(all, query));
    found.textContent = searching ? t('projets.reglages.recherche.trouvees', { count: shown.length, total: all.length }) : '';
    replace(labelsGroup,
      all.length < PROJECT_LABELS_MAX ? h('button', {
        class: 'label-row label-row--add', type: 'button',
        // Pendant une recherche, le nom proposé est le texte cherché
        onClick: () => openLabelSheet(projectId, null, { name: isSearching(searchInput.value) ? searchInput.value.trim() : '' }),
      }, icon('plus'), t('projets.etiquette.nouvelle')) : null,
      shown.length ? h('div', { class: 'kset__labels' },
        shown.map((label) => h('div', { class: 'label-row' },
          labelChip(label, { content: searching ? highlightParts(label.name, query).map((part) => (part.hit ? h('mark', { class: 'hit' }, part.text) : part.text)) : null }),
          h('span', { class: 'label-row__count' }, t('projets.nombreCartes', { count: labelUse(app.data, projectId, label.id) })),
          iconButton('pencil', t('projets.reglages.modifierEtiquette', { name: label.name }), () => openLabelSheet(projectId, label.id))))) : null);
  };

  // --- Onglet « Projet » ---
  const groupTitle = (text, aside) => h('div', { class: 'group-title' }, h('h2', { class: 'section-title' }, text), h('span', { class: 'group-title__aside' }, aside));

  const columnsPart = (p) => {
    const columns = byPosition(p.columns ?? []);
    return [
      groupTitle(t('projets.colonnes'), t('projets.nombreColonnes', { count: columns.length })),
      h('div', { class: 'group' },
        columns.map((column) => {
          const grip = h('button', { class: 'icon-btn col-row__grip', type: 'button', 'aria-label': t('projets.reglages.place', { name: column.name }), onClick: () => openColumnSheet(projectId, column.id) }, icon('grip'));
          const row = h('div', { class: `col-row c-${column.color}`, 'data-column': column.id },
            grip,
            h('span', { class: 'coldot', 'aria-hidden': 'true' }),
            h('span', { class: 'col-row__name' }, column.name),
            h('span', { class: 'col-row__count' }, t('projets.nombreCartes', { count: columnCards(app.data, column.id).length })),
            iconButton('pencil', t('projets.reglages.modifierColonne', { name: column.name }), () => openColumnSheet(projectId, column.id)));
          grip.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' || event.button === 0) startColumnDrag(event, row, projectId);
          });
          return row;
        }),
        columns.length < COLUMNS_MAX ? h('button', { class: 'col-row col-row--add', type: 'button', onClick: () => openColumnSheet(projectId, null) }, icon('plus'), t('projets.colonne.ajouter')) : null),
    ];
  };

  // Une option : son nom, sa ligne d'aide et son interrupteur
  const optionRow = (key, title, help, on, onClick) => h('div', { class: 'toggle-row' },
    h('div', { class: 'grow' },
      h('span', { class: 'row__title', id: `projet-${key}-titre` }, title),
      h('span', { class: 'row__sub', id: `projet-${key}-aide` }, help)),
    h('button', {
      class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on),
      'aria-labelledby': `projet-${key}-titre`, 'aria-describedby': `projet-${key}-aide`, 'data-key': key,
      onClick,
    }));
  // Options : « Priorité » (propriétaire), puis « Échéances » (propriétaire
  // et « Peut modifier »)
  const optionsPart = (p, rights) => [
    groupTitle(t('projets.reglages.options'), ''),
    h('div', { class: 'group list-options' },
      rights.priority ? optionRow('priorite', t('projets.reglages.priorite'), t('projets.reglages.priorite.aide'), Boolean(p.priorityEnabled),
        () => projectActions.setProjectPriority(projectId, !p.priorityEnabled)) : null,
      rights.deadlines ? optionRow('echeances', t('projets.reglages.echeances'), t('projets.reglages.echeances.aide'), deadlinesOn(p),
        () => projectActions.setProjectDeadlines(projectId, !deadlinesOn(p))) : null),
  ];

  let drawn = '';
  const draw = () => {
    const p = liveProject(projectId);
    if (!app.data.loaded) return;
    if (!p) {
      tabBar.hidden = true;
      replace(scroll, projectGone());
      return;
    }
    const rights = projectRights(p.role);
    // Contributeur et Lecture seule n'ont pas cet écran : retour au projet
    if (!rights.settings) {
      navigate('project', { id: projectId }, { replace: true });
      return;
    }
    paintTabs((p.labels ?? []).length);
    paintLabels();
    // Onglet « Projet » : redessiné seulement quand quelque chose de
    // l'onglet a changé
    const counts = (p.columns ?? []).map((c) => columnCards(app.data, c.id).length).join();
    const key = JSON.stringify([p.name, p.role, p.priorityEnabled, deadlinesOn(p), p.columns, counts]);
    if (key === drawn) return;
    drawn = key;
    if (shownName !== p.name && document.activeElement !== nameInput) {
      nameInput.value = p.name;
      shownName = p.name;
    }
    nameInput.readOnly = !rights.rename;
    const body = panels.projet;
    const held = body.contains(document.activeElement) ? document.activeElement.dataset?.key : null;
    const namePart = h('div', { class: 'kset__name' }, nameField.field,
      rights.rename ? null : h('p', { class: 'field__hint' }, t('projets.reglages.nomProprietaire')));
    const options = rights.priority || rights.deadlines ? optionsPart(p, rights) : null;
    const danger = rights.trash ? h('div', { class: 'kset__danger' }, h('button', { class: 'btn btn--danger-outline btn--block', type: 'button', onClick: () => askDelete(p, () => navigate('projects', {}, { replace: true })) },
      icon('trash', 'icon--sm'), t('projets.reglages.supprimer'))) : null;
    // Ordinateur (maquette planche-pc) : nom, options et « Supprimer le
    // projet » à gauche, colonnes à droite. Téléphone : nom, options,
    // colonnes, puis « Supprimer le projet »
    if (pc) replace(body, h('div', { class: 'kset__col' }, namePart, options, danger), h('div', { class: 'kset__col' }, columnsPart(p)));
    else replace(body, namePart, options, columnsPart(p), danger);
    if (held) body.querySelector(`[data-key="${held}"]`)?.focus();
  };
  showTab();
  paintTabs(0);
  const idle = drawWhenIdle(scroll, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();

  const back = () => goBack('project', { id: projectId });
  if (pc) {
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' },
        iconButton('chev-l', t('projets.reglages.retour'), back),
        h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__title' }, t('projets.reglages.titre')))),
      tabBar,
      offlineBanner(),
      scroll);
  }
  return h('div', { class: 'screen' },
    topbar(t('projets.reglages.titre'), back),
    tabBar,
    scroll);
}
