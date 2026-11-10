// Raccourcis clavier de l'ordinateur (design/maquettes/pc-A,
// shortcuts.example.js), seulement avec .app--pc (à partir de 1 024 px) :
//
//   ?  fenêtre des raccourcis      N  nouvelle liste      /  rechercher
//   ,  Réglages                    [ ]  liste précédente, suivante
//   P  partager la liste           A  ajouter un article  S  sommaire de l'aide
//   ↓ ↑  article suivant, précédent    Espace  cocher ou décocher
//   Entrée  ouvrir la fiche        E  modifier            Suppr  supprimer (annulable)
//   Échap  fermer, effacer la recherche (géré par chaque fenêtre et chaque champ)
//   Ctrl+Z  annuler la dernière action (undo.js)   Ctrl+Entrée  enregistrer
//   Menu ou Maj+F10 (et clic droit)  menu de la ligne : Modifier, Cocher, Supprimer
//
// Règles :
// - aucun raccourci à une touche pendant la saisie dans un champ (seuls
//   Échap et Ctrl+Entrée y restent actifs), ni avec Ctrl, Alt ou Cmd ;
// - les raccourcis à une touche se désactivent dans Réglages (critère WCAG
//   2.1.4), réglage gardé sur cet appareil ; flèches, Entrée et les
//   combinaisons avec Ctrl restent ;
// - une fenêtre ou un tiroir ouvert garde la main : seuls ? et Échap ;
// - un raccourci ne fait qu'appuyer sur un bouton déjà présent à l'écran :
//   un bouton absent pour un rôle (lecture seule, destinataire d'une liste
//   d'envies…) n'a donc pas de raccourci. Aucun raccourci ne réserve. Le
//   serveur revérifie de toute façon chaque écriture.
// - « / » et « A » mettent le curseur dans le champ (geste dont le seul but
//   est d'écrire : exception à « aucun curseur automatique », décision du
//   10 novembre 2026, test/focus.test.js).

import { h, icon } from './dom.js';
import { navigate } from './router.js';
import { openSheet, openMenu, toast, isTextField } from './ui.js';

const KEY = 'listo-raccourcis';
const appRoot = () => document.getElementById('app');
const onPc = () => Boolean(appRoot()?.classList.contains('app--pc'));

// Réglage « Raccourcis à une touche » (activés par défaut), gardé sur cet appareil
export function singleKeysOn() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSingleKeys(on) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // stockage indisponible : le réglage vaut pour cette visite seulement
  }
  paintKeys();
}
// Les touches écrites sur les boutons (.keycap) disparaissent quand les
// raccourcis à une touche sont désactivés
export function paintKeys() {
  appRoot()?.classList.toggle('app--no-keys', !singleKeysOn());
}

// Une touche écrite sur un bouton (décorative : aria-keyshortcuts dit la touche)
export function keycap(label) {
  return h('kbd', { class: 'keycap', 'aria-hidden': 'true' }, label);
}

// Liste des raccourcis (fenêtre « ? », aide)
export const SHORTCUTS = [
  { group: 'Partout', keys: [
    [['?'], 'Afficher les raccourcis'],
    [['N'], 'Nouvelle liste'],
    [['/'], 'Rechercher'],
    [[','], 'Réglages'],
    [['Échap'], 'Fermer la fenêtre, effacer la recherche'],
    [['[', ']'], 'Liste précédente, suivante'],
    [['Ctrl', 'Z'], 'Annuler la dernière action'],
    [['Ctrl', 'Entrée'], 'Enregistrer (fiche, formulaire)'],
  ] },
  { group: 'Dans une liste', keys: [
    [['P'], 'Partager la liste'],
    [['A'], 'Ajouter un article'],
    [['↓', '↑'], 'Article suivant, précédent'],
    [['Espace'], 'Cocher ou décocher'],
    [['Entrée'], 'Ouvrir la fiche'],
    [['E'], 'Modifier'],
    [['Suppr'], 'Supprimer (annulable)'],
    [['Menu'], 'Menu de la ligne (ou Maj+F10, clic droit)'],
  ] },
  { group: 'Dans l\'aide', keys: [
    [['S'], 'Aller au sommaire'],
  ] },
];

// Fenêtre « Raccourcis clavier »
let shortcutsOpen = null;
export function openShortcuts() {
  if (shortcutsOpen) return;
  const on = singleKeysOn();
  const content = [
    on ? null : h('p', { class: 'note', role: 'status' }, icon('keyboard', 'icon--sm'),
      h('span', {}, 'Les raccourcis à une touche sont désactivés sur cet appareil (Réglages). Flèches, Entrée et les raccourcis avec Ctrl restent actifs.')),
    h('div', { class: 'keys' }, SHORTCUTS.map(({ group, keys }) => h('section', {},
      h('h3', { class: 'keys__title' }, group),
      h('dl', { class: 'keys__list' }, keys.map(([combo, label]) => h('div', { class: 'keys__row' },
        h('dt', { class: 'keys__label' }, label),
        h('dd', { class: 'keys__keys' }, combo.map((k) => h('kbd', { class: 'keycap' }, k))))))))),
    h('p', { class: 'pc-meta' }, 'Aucun raccourci à une touche pendant la saisie dans un champ. Ils se désactivent dans Réglages, « Raccourcis à une touche ».'),
  ];
  shortcutsOpen = openSheet({
    title: 'Raccourcis clavier',
    content,
    pc: 'modal',
    size: 'lg',
    footer: [h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => { shortcutsOpen?.close(); navigate('help'); } }, icon('book', 'icon--sm'), 'Ouvrir l\'aide'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => shortcutsOpen?.close() }, 'Fermer')],
    onClose: () => { shortcutsOpen = null; },
  });
}

// --- Aides ---

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const visible = (el) => Boolean(el) && el.getClientRects().length > 0 && !el.closest('[hidden], [inert]');
const typingIn = (el) => isTextField(el) || el?.tagName === 'SELECT';
// Fenêtre ouverte par-dessus l'écran (tiroir, fenêtre centrée, menu, photo)
const topLayer = () => $('#app > .pc-panel, #app > .lightbox, .menu, [aria-modal="true"]');
const rowOf = (el) => el?.closest?.('li.item');

// Articles de la liste ouverte, dans l'ordre de l'écran
const itemBodies = () => $$('.pc-col .scroll .item__body').filter(visible);
function moveInList(delta) {
  const items = itemBodies();
  if (!items.length) return false;
  const index = items.indexOf(document.activeElement?.closest('.item')?.querySelector('.item__body'));
  const next = index < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, index + delta));
  items[next].focus();
  items[next].scrollIntoView({ block: 'nearest' });
  return true;
}
// Liste précédente ou suivante, dans l'ordre du menu de gauche
function goList(delta) {
  const links = $$('.pc-nav__item');
  if (!links.length) return;
  const index = links.findIndex((a) => a.getAttribute('aria-current') === 'page');
  const target = links[Math.min(links.length - 1, Math.max(0, (index < 0 ? (delta > 0 ? -1 : links.length) : index) + delta))];
  target?.click();
}
// Champ de recherche de l'écran : celui de l'en-tête (liste, Mes listes,
// aide), sinon celui du menu de gauche
function focusSearch() {
  const field = [$('.pc-col .pc-head .searchfield__input'), $('.pc-col .help-search input'), $('.pc-side .searchfield__input')].find(visible);
  if (!field) return false;
  // Exception voulue à « aucun curseur automatique » : touche « / »
  field.focus();
  return true;
}
function focusAdd() {
  const field = $('.pc-add .addbar__input');
  if (!visible(field)) return false; // lecture seule : pas de champ d'ajout
  // Exception voulue à « aucun curseur automatique » : touche « A »
  field.focus();
  return true;
}
// Bouton d'une ligne (crayon, corbeille, case) : absent si le rôle n'y a pas droit
const rowButton = (row, selector) => (row ? row.querySelector(selector) : null);
function pressInRow(selector) {
  const button = rowButton(rowOf(document.activeElement), selector);
  if (!button || button.disabled) return false;
  button.click();
  return true;
}
// Suppr : supprime la ligne, puis le focus passe à la suivante (ou la précédente)
function deleteCurrent() {
  const row = rowOf(document.activeElement);
  const trash = rowButton(row, '[data-action="delete"]');
  if (!trash) return false;
  const items = itemBodies();
  const index = items.indexOf(row.querySelector('.item__body'));
  trash.click();
  // La liste est redessinée un instant plus tard : on attend que la ligne
  // supprimée ait disparu avant de passer le focus à la suivante
  let tries = 0;
  const next = () => {
    if (row.isConnected && tries++ < 20) {
      setTimeout(next, 50);
      return;
    }
    const rest = itemBodies();
    rest[Math.min(index, rest.length - 1)]?.focus();
  };
  next();
  return true;
}

// Menu de la ligne (clic droit, touche Menu, Maj+F10) : les mêmes actions
// que les boutons de la ligne, et seulement celles qui existent pour ce rôle
export function openRowMenu(row, at = null) {
  const name = row.querySelector('.item__name')?.textContent ?? '';
  const check = row.querySelector('button.check');
  const edit = row.querySelector('[data-action="edit"]');
  const trash = row.querySelector('[data-action="delete"]');
  const body = row.querySelector('.item__body');
  const items = [
    edit ? { icon: 'pencil', label: 'Modifier', keys: { label: 'E', aria: 'E' }, onSelect: () => edit.click() } : { icon: 'eye', label: 'Voir la fiche', keys: { label: 'Entrée', aria: 'Enter' }, onSelect: () => body?.click() },
    check ? { icon: 'check', label: check.getAttribute('aria-pressed') === 'true' ? 'Décocher' : 'Cocher', keys: { label: 'Espace', aria: 'Space' }, onSelect: () => check.click() } : null,
    trash ? { icon: 'trash', label: 'Supprimer', danger: true, separated: true, keys: { label: 'Suppr', aria: 'Delete' }, onSelect: () => trash.click() } : null,
  ].filter(Boolean);
  const rect = row.getBoundingClientRect();
  openMenu(items, { label: `Actions de ${name}`, at: at ?? { x: rect.left + 48, y: rect.bottom } });
}

// --- Démarrage ---
// onUndo : Ctrl+Z (voir app.js : annule dans la liste ouverte)
export function startShortcuts({ onUndo }) {
  paintKeys();
  // Espace sur un bouton « clique » au relâchement : sur une ligne, il coche
  // (voir keydown) et ne doit pas ouvrir la fiche en plus
  document.addEventListener('keyup', (event) => {
    if (event.key === ' ' && onPc() && event.target.closest?.('.item__body')) event.preventDefault();
  });
  // Clic droit sur une ligne : son menu
  document.addEventListener('contextmenu', (event) => {
    if (!onPc() || topLayer()) return;
    const row = rowOf(event.target);
    if (!row || !row.closest('.pc-col')) return;
    event.preventDefault();
    openRowMenu(row, { x: event.clientX, y: event.clientY });
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || !onPc()) return;
    const typing = typingIn(event.target);
    const mod = event.ctrlKey || event.metaKey;
    // Ctrl+Entrée : enregistre la fenêtre du dessus (fiche, formulaire), même en saisie
    if (mod && event.key === 'Enter') {
      const panel = $$('#app > .pc-panel').at(-1);
      const submit = panel && [...panel.querySelectorAll('button[type="submit"]')].find((b) => !b.disabled);
      if (submit) {
        event.preventDefault();
        submit.click();
      }
      return;
    }
    // Ctrl+Z : annule (pas pendant la saisie : le champ garde son annulation)
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (typing || topLayer()) return;
      event.preventDefault();
      onUndo();
      return;
    }
    if (typing || mod || event.altKey) return;
    // Menu de la ligne : touche Menu ou Maj+F10
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const row = rowOf(document.activeElement);
      if (row && !topLayer()) {
        event.preventDefault();
        openRowMenu(row);
      }
      return;
    }
    // Flèches : d'un article à l'autre (pas des raccourcis à une touche)
    if (!topLayer() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const inList = !document.activeElement || document.activeElement === document.body || document.activeElement.closest('.pc-col .scroll');
      if (inList && moveInList(event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault();
      return;
    }
    if (!singleKeysOn()) return;
    // Une fenêtre ouverte garde la main : seul « ? » (et Échap, géré par elle)
    if (topLayer() && event.key !== '?') return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const run = {
      '?': () => (openShortcuts(), true),
      n: () => (navigate('newList'), true),
      '/': () => focusSearch(),
      ',': () => (navigate('settings'), true),
      '[': () => (goList(-1), true),
      ']': () => (goList(1), true),
      p: () => {
        const share = $('.pc-head [data-action="share"]');
        if (!visible(share)) return false;
        share.click();
        return true;
      },
      a: () => focusAdd(),
      s: () => {
        const link = $('.pc-toc [aria-current="true"]') ?? $('.pc-toc a, .pc-toc button');
        if (!visible(link)) return false;
        link.focus();
        return true;
      },
      e: () => pressInRow('[data-action="edit"]'),
      ' ': () => pressInRow('button.check'),
      Delete: () => deleteCurrent(),
    }[key];
    if (run && run()) event.preventDefault();
  });
}

// Message annoncé après Ctrl+Z (role=status du message)
export function announce(text) {
  toast(text);
}
