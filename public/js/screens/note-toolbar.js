// Barre de mise en forme d'une note et feuille « Insérer un lien »
// (décisions du propriétaire du 24 novembre 2026 ; maquettes
// b-barre-au-dessus-du-clavier, d-inserer-un-lien et e-pc-barre).
//
// - Dix boutons carrés arrondis, dans cet ordre : Titre (H1), Sous-titre
//   (H2), Gras, Italique, Souligné, Surligné, Liste à puces, Liste
//   numérotée, Case à cocher, Insérer un lien. Chacun a son nom lu (et une
//   bulle sur ordinateur) ; la barre défile de côté si elle ne tient pas.
// - role="toolbar" : un seul arrêt de la touche Tab, puis les flèches
//   gauche et droite, Début et Fin passent d'un bouton à l'autre.
// - aria-pressed : la mise en forme déjà présente à l'endroit du curseur
//   (formatsAt, note-format.js) ; le bouton du lien n'en a pas.
// - Appuyer sur un bouton ne retire pas le curseur du texte (le clavier
//   du téléphone reste ouvert) : l'appui de la souris (mousedown) est
//   arrêté, le bouton agit au click.
// - Ce que fait chaque bouton : note.js (pick) avec applyFormat et
//   insertLink de note-format.js.

import { h, icon, field, errorNote } from '../dom.js';
import { openSheet } from '../ui.js';
import { t } from '../i18n.js';
import { TOOLBAR, linkAddress, linkLabel, sourceOffset } from '../note-format.js';

// Nom lu de chaque bouton
const NAMES = {
  h1: 'notes.format.h1',
  h2: 'notes.format.h2',
  bold: 'notes.format.gras',
  italic: 'notes.format.italique',
  underline: 'notes.format.souligne',
  highlight: 'notes.format.surligne',
  bullet: 'notes.format.puces',
  number: 'notes.format.numeros',
  task: 'notes.format.case',
  link: 'notes.format.lien',
};

// Ce qui est écrit sur les boutons de texte
const SHORT = {
  h1: 'notes.format.h1.court',
  h2: 'notes.format.h2.court',
  bold: 'notes.format.gras.court',
  italic: 'notes.format.italique.court',
  underline: 'notes.format.souligne.court',
  highlight: 'notes.format.surligne.court',
  bullet: 'notes.format.puces.court',
  number: 'notes.format.numeros.court',
};

// Ce qui est écrit (ou dessiné) sur chaque bouton
function face(kind) {
  if (kind === 'task') return h('span', { class: 'note-tool__box' }, icon('check', 'icon--xs'));
  if (kind === 'link') return icon('link', 'icon--sm');
  const text = t(SHORT[kind]);
  if (kind === 'bold') return h('b', {}, text);
  if (kind === 'italic') return h('i', { class: 'note-tool__italic' }, text);
  if (kind === 'underline') return h('u', {}, text);
  if (kind === 'highlight') return h('span', { class: 'note-tool__mark' }, text);
  return text;
}

// La barre. onPick(kind) : un bouton touché (ou Entrée, Espace au clavier).
// Renvoie { el, setActive(kinds) } ; kinds : Set des mises en forme
// présentes à l'endroit du curseur.
export function noteToolbar(onPick) {
  const buttons = TOOLBAR.map((kind, i) => h('button', {
    class: 'note-tool',
    type: 'button',
    'data-kind': kind,
    'aria-label': t(NAMES[kind]),
    title: t(NAMES[kind]),
    tabindex: i === 0 ? '0' : '-1',
    'aria-pressed': kind === 'link' ? null : 'false',
    'aria-haspopup': kind === 'link' ? 'dialog' : null,
  }, face(kind)));
  const bar = h('div', { class: 'note-tools', role: 'toolbar', 'aria-label': t('notes.format.barre') }, buttons);

  // Le curseur reste dans le texte pendant l'appui
  bar.addEventListener('mousedown', (event) => event.preventDefault());
  bar.addEventListener('click', (event) => {
    const button = event.target.closest('.note-tool');
    if (button) onPick(button.dataset.kind);
  });
  // Flèches, Début, Fin : d'un bouton à l'autre (geste de la personne)
  bar.addEventListener('keydown', (event) => {
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: buttons.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = buttons[(moves[event.key] + buttons.length) % buttons.length];
    for (const button of buttons) button.tabIndex = button === next ? 0 : -1;
    next.focus();
  });

  return {
    el: bar,
    setActive(kinds) {
      for (const button of buttons) {
        if (button.dataset.kind !== 'link') button.setAttribute('aria-pressed', String(kinds.has(button.dataset.kind)));
      }
    },
  };
}

// Feuille « Insérer un lien » : « Texte affiché » (le texte choisi, déjà
// rempli), « Adresse » (http ou https seulement, sinon un message et rien
// n'est inséré ; déjà remplie pour un lien qu'on modifie), « Insérer ».
// onInsert(texte, adresse) : adresse valable.
export function openLinkSheet({ label = '', address: start = '', onInsert }) {
  const text = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: '200', placeholder: t('notes.lien.texte.exemple'), value: linkLabel(label) });
  const address = h('input', { class: 'input', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '2000', placeholder: 'https://…', value: start || null });
  const textField = field(t('notes.lien.texte'), text);
  const addressField = field(t('notes.lien.adresse'), address, { hint: t('notes.lien.aide') });
  const error = errorNote();
  const form = h('form', { class: 'stack note-link-sheet', novalidate: true },
    textField.field, addressField.field, error.note,
    h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, icon('link', 'icon--sm'), t('notes.lien.inserer')));
  const sheet = openSheet({ title: t('notes.lien.titre'), sub: t('notes.lien.sous'), content: form });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    addressField.setError(null);
    error.show('');
    if (!linkAddress(address.value)) {
      error.show(t('notes.lien.invalide'), address);
      return;
    }
    sheet.close();
    onInsert(text.value, address.value);
  });
  return sheet;
}

// --- Texte affiché mis en forme : endroit touché, texte choisi (communs
// au texte d'une note, screens/note.js, et à la description d'une carte de
// projet, screens/card-description.js) ---

// Position du curseur dans le texte (marques comprises), à l'endroit
// touché du texte affiché, ou la fin du texte si le navigateur ne sait pas
// le dire
export function offsetAt(view, event, length) {
  const point = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  const range = point ? null : document.caretRangeFromPoint?.(event.clientX, event.clientY);
  const node = point?.offsetNode ?? range?.startContainer;
  const offset = point?.offset ?? range?.startOffset;
  if (!node || !view.contains(node)) return length;
  return Math.min(length, sourceOffset(node, offset) ?? length);
}

// Texte choisi dans le texte affiché (sélection sans clavier) : [début,
// fin] dans le texte, marques comprises, ou null
export function chosenRange(view) {
  const selection = document.getSelection?.();
  if (!selection || selection.isCollapsed || !view.contains(selection.anchorNode) || !view.contains(selection.focusNode)) return null;
  const a = sourceOffset(selection.anchorNode, selection.anchorOffset);
  const b = sourceOffset(selection.focusNode, selection.focusOffset);
  if (a === null || b === null || a === b) return null;
  return [Math.min(a, b), Math.max(a, b)];
}
