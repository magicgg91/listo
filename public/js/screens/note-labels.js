// Étiquettes des notes (décisions du propriétaire du 24 novembre 2026 ;
// maquettes l1 à l4 et p1) : ce que les écrans des notes en montrent.
//
// - labelChip : la pastille d'une étiquette (point de couleur et nom, écrit
//   en textContent : la couleur n'est jamais seule).
// - drawNoteLabels : sous le titre d'une note, ses étiquettes, et pour le
//   propriétaire ou « Peut modifier » le bouton « + Étiquette », toujours
//   visible pour eux (même sans étiquette : c'est le chemin pour en poser
//   une ; aussi par le menu ⋮, « Étiquettes ») ; en lecture seule, rien du
//   tout quand la note n'en a aucune.
// - openNoteLabelsSheet : la feuille « Étiquettes » (maquettes l3 et l4) :
//   un champ qui cherche ou crée (un nom qui existe déjà, majuscules et
//   accents ignorés, est proposé au lieu d'en créer un second), toutes les
//   étiquettes avec leur case, et pour un nom nouveau la palette de huit
//   couleurs (role="radiogroup"), l'aperçu et « Créer « Jardin » ». Cocher
//   passe par la file d'attente (hors ligne compris) ; créer demande le
//   réseau (bouton désactivé hors ligne, avec la phrase qui le dit).
// - labelFilter : le filtre de l'écran « Notes » (« Toutes » puis les
//   étiquettes de mes notes, un seul choix, retenu sur cet appareil comme
//   le tri).
//
// Le serveur revérifie tout (server/notes.js, server/labels.js). Aucun
// curseur n'est mis tout seul dans le champ de la feuille : on le touche
// pour écrire.

import { h, icon, replace, LABEL_INPUT } from '../dom.js';
import { app, onDataChange } from '../app.js';
import { openSheet, toast } from '../ui.js';
import { errorMessage } from '../api.js';
import { t, compareText } from '../i18n.js';
import * as actions from '../actions.js';
import { canEditNote } from '../store.js';
import { noteTitle } from '../notes.js';
import {
  LABEL_COLORS, DEFAULT_LABEL_COLOR, LABEL_NAME_MAX, LABELS_PER_NOTE_MAX, cleanLabelName, labelNameProblem,
  findLabel, labelsMatching, sortLabels, noteLabels, usedLabels,
} from '../labels.js';

const compare = (a, b) => compareText(a, b, { sensitivity: 'base', numeric: true });

// Toutes les étiquettes de la réserve, rangées par nom
export const allLabels = () => sortLabels(app.data.labels ?? [], compare);
// Étiquettes d'une note, rangées par nom
export const labelsOfNote = (note) => noteLabels(note, app.data.labels ?? [], compare);
// Étiquettes utilisées par ces notes (filtre de l'écran « Notes »)
export const labelsUsedBy = (notes) => usedLabels(notes, app.data.labels ?? [], compare);

// Nom d'une couleur, lu par les lecteurs d'écran (« Vert »)
const COLOR_NAMES = {
  gris: 'notes.etiquettes.couleur.gris',
  rouge: 'notes.etiquettes.couleur.rouge',
  orange: 'notes.etiquettes.couleur.orange',
  jaune: 'notes.etiquettes.couleur.jaune',
  vert: 'notes.etiquettes.couleur.vert',
  bleu: 'notes.etiquettes.couleur.bleu',
  violet: 'notes.etiquettes.couleur.violet',
  rose: 'notes.etiquettes.couleur.rose',
};
const colorName = (color) => t(COLOR_NAMES[color]);

// La pastille d'une étiquette (span), extra : enfant ajouté au début (la
// coche du filtre)
export function labelChip(label, { extra = null, role = null } = {}) {
  return h('span', { class: `label label--${LABEL_COLORS.includes(label.color) ? label.color : 'gris'}`, role },
    extra, h('span', { class: 'label__name' }, label.name));
}

// Rangée des étiquettes d'une carte ou d'une note : une liste (nommée
// « Étiquettes ») de pastilles ; null s'il n'y en a aucune
export function labelList(labels, extraClass = '') {
  if (!labels.length) return null;
  return h('span', { class: `labels${extraClass}`, role: 'list', 'aria-label': t('notes.etiquettes.titre') },
    labels.map((label) => labelChip(label, { role: 'listitem' })));
}

// Sous le titre d'une note : ses étiquettes, et « + Étiquette » pour qui
// peut la modifier. Caché (hidden : aucune place prise) seulement s'il n'y
// a rien à montrer : aucune étiquette et pas le droit d'en poser.
// Redessiné seulement quand ses étiquettes ou le droit changent.
export const noteLabelsSlot = () => h('div', { class: 'note-labels', hidden: true });
export function drawNoteLabels(slot, note) {
  const labels = note ? labelsOfNote(note) : [];
  const editable = Boolean(note) && canEditNote(note);
  const key = JSON.stringify([labels.map((label) => [label.id, label.name, label.color]), editable]);
  if (slot.dataset.key === key) return;
  slot.dataset.key = key;
  slot.hidden = !labels.length && !editable;
  if (slot.hidden) {
    replace(slot);
    return;
  }
  replace(slot, labels.length ? labelList(labels) : null, editable ? h('button', {
    class: 'note-labels__add',
    type: 'button',
    'aria-haspopup': 'dialog',
    onClick: () => openNoteLabelsSheet(note.id),
  }, icon('plus', 'icon--xs'), t('notes.etiquettes.ajouter')) : null);
}

// Palette des huit couleurs : un choix à options (role="radiogroup" : les
// flèches passent d'une couleur à l'autre, ui.js), chaque rond nommé par sa
// couleur. onChange(couleur) ; renvoie { element, set(couleur) }.
export function labelPalette(current, onChange, { label = t('notes.etiquettes.palette') } = {}) {
  const swatches = LABEL_COLORS.map((color) => {
    const swatch = h('button', {
      class: `label-swatch label--${color}`,
      type: 'button',
      role: 'radio',
      'aria-label': colorName(color),
      'aria-checked': String(color === current),
      onClick: () => {
        set(color);
        onChange(color);
      },
    }, h('span', { class: 'label-swatch__dot', 'aria-hidden': 'true' }));
    swatch.dataset.color = color;
    return swatch;
  });
  const set = (value) => {
    for (const swatch of swatches) swatch.setAttribute('aria-checked', String(swatch.dataset.color === value));
  };
  return { element: h('div', { class: 'label-palette', role: 'radiogroup', 'aria-label': label }, swatches), set };
}

// --- Feuille « Étiquettes » d'une note ---
export function openNoteLabelsSheet(noteId) {
  const note = () => {
    const found = app.data.notes.get(noteId);
    return found && !found.deletedAt ? found : null;
  };
  if (!note() || !canEditNote(note())) return null;
  let query = '';
  let color = DEFAULT_LABEL_COLOR;
  let busy = false;
  let shownKey = null;
  const rows = new Map(); // numéro d'étiquette -> ligne (case mise à jour sur place)

  const input = h('input', {
    class: 'input', ...LABEL_INPUT, maxlength: String(LABEL_NAME_MAX * 2), 'data-fit-keyboard': '',
    placeholder: t('notes.etiquettes.champ'), 'aria-label': t('notes.etiquettes.champ'),
  });
  const hint = h('p', { class: 'label-sheet__hint', role: 'status' });
  const body = h('div', { class: 'label-sheet__body' });
  // Le champ, la phrase et les choix dans un seul formulaire : Entrée (ou
  // « Créer ») l'envoie ; les cases et la palette sont des boutons simples
  const form = h('form', { class: 'label-sheet', novalidate: true }, input, hint, body);
  const chosen = () => new Set(note()?.labelIds ?? []);

  // Cocher ou décocher une étiquette (file d'attente, hors ligne compris)
  function toggle(label) {
    const n = note();
    if (!n) return;
    const ids = chosen();
    if (ids.has(label.id)) ids.delete(label.id);
    else if (ids.size >= LABELS_PER_NOTE_MAX) {
      toast(t('notes.etiquettes.limite', { max: LABELS_PER_NOTE_MAX }));
      return;
    } else ids.add(label.id);
    actions.setNoteLabels(noteId, [...ids]);
  }

  // Une ligne : case et pastille ; la case est mise à jour sur place
  // (le focus reste sur la ligne touchée au clavier)
  function row(label) {
    const tick = h('span', { class: 'tick', 'aria-hidden': 'true' });
    const line = h('button', { class: 'tick-row', type: 'button', role: 'checkbox', onClick: () => toggle(label) }, tick, labelChip(label));
    rows.set(label.id, { line, tick });
    return line;
  }
  function updateTicks() {
    const ids = chosen();
    for (const [id, { line, tick }] of rows) {
      const on = ids.has(id);
      line.setAttribute('aria-checked', String(on));
      tick.classList.toggle('is-on', on);
      replace(tick, on ? icon('check') : null);
    }
  }

  // Nouvelle étiquette (en ligne) : créée, ou celle du même nom, puis posée
  // sur la note
  async function create(name) {
    if (busy || !navigator.onLine) return;
    busy = true;
    draw();
    try {
      const { label, existing } = await actions.createLabel({ name, color });
      const ids = chosen();
      if (!ids.has(label.id)) {
        if (ids.size >= LABELS_PER_NOTE_MAX) toast(t('notes.etiquettes.limite', { max: LABELS_PER_NOTE_MAX }));
        else await actions.setNoteLabels(noteId, [...ids, label.id]);
      }
      input.value = '';
      query = '';
      toast(existing ? t('notes.etiquettes.ajoutee', { name: label.name }) : t('notes.etiquettes.creee', { name: label.name }), { low: true });
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      busy = false;
      draw();
    }
  }

  // Ce que la feuille montre pour le texte saisi
  function build() {
    rows.clear();
    const labels = allLabels();
    const typed = query.trim();
    const all = (except = null) => {
      const rest = labels.filter((label) => label !== except);
      return rest.length ? [h('p', { class: 'label-sheet__title' }, t('notes.etiquettes.toutes')), h('div', {}, rest.map(row))] : [];
    };
    hint.textContent = '';
    if (!typed) {
      replace(body, labels.length ? all() : h('p', { class: 'label-sheet__hint' }, t('notes.etiquettes.aucune')));
      return;
    }
    // Le nom existe déjà (majuscules et accents ignorés) : proposé en premier
    const twin = findLabel(labels, typed);
    if (twin) {
      hint.textContent = t('notes.etiquettes.existe', { name: twin.name });
      replace(body, h('div', {}, row(twin)), all(twin));
      return;
    }
    // Nom nouveau : celles qui le contiennent, puis la création
    const close = labelsMatching(labels, typed);
    const problem = labelNameProblem(typed);
    if (problem) {
      hint.textContent = t(problem === 'long' ? 'notes.etiquettes.nom.long' : 'notes.etiquettes.nom.caractere', { max: LABEL_NAME_MAX });
      replace(body, close.length ? h('div', {}, close.map(row)) : null);
      return;
    }
    const name = cleanLabelName(typed);
    const preview = labelChip({ name, color });
    const palette = labelPalette(color, (value) => {
      color = value;
      preview.className = `label label--${value}`;
    });
    const offline = !navigator.onLine;
    replace(body,
      close.length ? h('div', {}, close.map(row)) : null,
      h('p', { class: 'label-sheet__title' }, t('notes.etiquettes.nouvelle')),
      palette.element,
      h('div', { class: 'label-preview' }, preview),
      offline ? h('p', { class: 'note', role: 'status' }, icon('cloud-off', 'icon--sm'), h('span', {}, t('notes.etiquettes.horsLigne'))) : null,
      h('button', { class: 'btn btn--primary btn--block', type: 'submit', disabled: offline || busy }, icon('plus', 'icon--sm'), t('notes.etiquettes.creer', { name })));
  }

  // Redessine si ce qui est montré change (texte saisi, réserve, réseau) ;
  // sinon, seulement les cases
  function draw() {
    if (!note() || !canEditNote(note())) {
      sheet.close();
      return;
    }
    const key = JSON.stringify([query.trim(), (app.data.labels ?? []).map((l) => [l.id, l.name, l.color]), navigator.onLine, busy]);
    if (key !== shownKey) {
      shownKey = key;
      build();
    }
    updateTicks();
  }

  input.addEventListener('input', () => {
    query = input.value;
    draw();
  });
  // Entrée : coche le nom existant, ou crée le nouveau
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const typed = query.trim();
    if (!typed) return;
    const twin = findLabel(app.data.labels ?? [], typed);
    if (twin) {
      if (!chosen().has(twin.id)) toggle(twin);
      return;
    }
    const name = cleanLabelName(typed);
    if (name) create(name);
  });

  const stop = onDataChange(() => draw());
  const onNetwork = () => draw();
  window.addEventListener('online', onNetwork);
  window.addEventListener('offline', onNetwork);
  const sheet = openSheet({
    title: t('notes.etiquettes.titre'),
    sub: noteTitle(note()) || t('notes.sansTitre'),
    content: form,
    scroll: true,
    onClose: () => {
      stop();
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
    },
  });
  draw();
  return sheet;
}

// --- Filtre de l'écran « Notes » ---

// Étiquette choisie, gardée sur cet appareil (comme le tri) : son numéro,
// ou null pour « Toutes »
const FILTER_KEY = 'listo-etiquette-notes';
export function loadLabelFilter() {
  try {
    const value = Number(localStorage.getItem(FILTER_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
export function saveLabelFilter(value) {
  try {
    if (value) localStorage.setItem(FILTER_KEY, String(value));
    else localStorage.removeItem(FILTER_KEY);
  } catch {
    // stockage indisponible : le choix n'est pas retenu
  }
}

// Étiquette du filtre réellement appliquée : celle choisie, si elle est
// encore utilisée par une de ces notes ; sinon « Toutes » (null)
export function activeLabelFilter(notes) {
  const id = loadLabelFilter();
  return id && labelsUsedBy(notes).some((label) => label.id === id) ? id : null;
}

// Les boutons du filtre (« Toutes » puis chaque étiquette utilisée), dans
// container (role="group") ; caché s'il n'y a aucune étiquette à proposer.
// onChange() : après un choix (l'écran se redessine). Les mêmes étiquettes
// qu'au dessin précédent : seuls les boutons choisis changent, sur place
// (le focus reste sur le bouton touché au clavier).
export function drawLabelFilter(container, notes, onChange) {
  const labels = labelsUsedBy(notes);
  container.hidden = !labels.length;
  const key = JSON.stringify(labels.map((label) => [label.id, label.name, label.color]));
  if (container.dataset.key !== key) {
    container.dataset.key = key;
    const option = (id, chip) => {
      const button = h('button', {
        class: 'label-filter__opt',
        type: 'button',
        onClick: () => {
          saveLabelFilter(id);
          onChange();
        },
      }, chip);
      button.dataset.labelId = id ? String(id) : '';
      return button;
    };
    replace(container, labels.length ? [
      option(null, h('span', { class: 'label label--all' }, h('span', { class: 'label__name' }, t('notes.filtre.toutes')))),
      labels.map((label) => option(label.id, labelChip(label))),
    ] : null);
  }
  // Choix actuel : aria-pressed, coche ET contour (jamais la couleur seule)
  const current = activeLabelFilter(notes);
  for (const button of container.querySelectorAll('.label-filter__opt')) {
    const on = button.dataset.labelId === (current ? String(current) : '');
    button.setAttribute('aria-pressed', String(on));
    const chip = button.firstElementChild;
    const mark = chip.querySelector('.icon');
    if (on && !mark) chip.prepend(icon('check', 'icon--xs'));
    if (!on && mark) mark.remove();
  }
}

// Le conteneur du filtre (vide au départ)
export const labelFilterBar = () => h('div', { class: 'label-filter', role: 'group', 'aria-label': t('notes.filtre.libelle'), hidden: true });
