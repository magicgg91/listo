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
import { t } from './i18n.js';

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

// Notes utilisées par la personne ? (Réglages › Fonctions ; donné par
// app.js à startShortcuts) : coupées, N ne mène qu'à « Nouvelle liste »
let notesShown = () => true;

// Liste des raccourcis (fenêtre « ? », aide), lue à l'ouverture (dans la
// langue choisie)
export function shortcuts() {
  return [
    { group: t('raccourcis.partout'), keys: [
      [['?'], t('raccourcis.partout.afficher')],
      [['N'], t(notesShown() ? 'raccourcis.partout.nouvelleListe' : 'navigation.nouvelleListe')],
      [['/'], t('raccourcis.partout.rechercher')],
      [[','], t('raccourcis.partout.reglages')],
      [[t('raccourcis.touche.echap')], t('raccourcis.partout.fermer')],
      [['[', ']'], t('raccourcis.partout.listeVoisine')],
      [[t('raccourcis.touche.ctrl'), 'Z'], t('raccourcis.partout.annuler')],
      [[t('raccourcis.touche.ctrl'), t('raccourcis.touche.entree')], t('raccourcis.partout.enregistrer')],
    ] },
    { group: t('raccourcis.liste'), keys: [
      [['P'], t('raccourcis.liste.partager')],
      [['A'], t('raccourcis.liste.ajouter')],
      [['↓', '↑'], t('raccourcis.liste.suivant')],
      [[t('raccourcis.touche.espace')], t('raccourcis.liste.cocher')],
      [[t('raccourcis.touche.entree')], t('raccourcis.liste.ouvrir')],
      [['E'], t('raccourcis.liste.modifier')],
      [[t('raccourcis.touche.suppr')], t('raccourcis.liste.supprimer')],
      [[t('raccourcis.touche.menu')], t('raccourcis.liste.menu')],
    ] },
    { group: t('raccourcis.aide'), keys: [
      [['S'], t('raccourcis.aide.sommaire')],
    ] },
  ];
}

// Fenêtre « Raccourcis clavier »
let shortcutsOpen = null;
export function openShortcuts() {
  if (shortcutsOpen) return;
  const on = singleKeysOn();
  const content = [
    on ? null : h('p', { class: 'note', role: 'status' }, icon('keyboard', 'icon--sm'),
      h('span', {}, t('raccourcis.fenetre.desactives'))),
    h('div', { class: 'keys' }, shortcuts().map(({ group, keys }) => h('section', {},
      h('h3', { class: 'keys__title' }, group),
      h('dl', { class: 'keys__list' }, keys.map(([combo, label]) => h('div', { class: 'keys__row' },
        h('dt', { class: 'keys__label' }, label),
        h('dd', { class: 'keys__keys' }, combo.map((k) => h('kbd', { class: 'keycap' }, k))))))))),
    h('p', { class: 'pc-meta' }, t('raccourcis.fenetre.saisie')),
  ];
  shortcutsOpen = openSheet({
    title: t('raccourcis.fenetre.titre'),
    content,
    pc: 'modal',
    size: 'lg',
    footer: [h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => { shortcutsOpen?.close(); navigate('help'); } }, icon('book', 'icon--sm'), t('raccourcis.fenetre.aide')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => shortcutsOpen?.close() }, t('raccourcis.fenetre.fermer'))],
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
// Champ de recherche de l'écran : celui de l'en-tête (liste, Listes,
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
    edit ? { icon: 'pencil', label: t('raccourcis.menu.modifier'), keys: { label: 'E', aria: 'E' }, onSelect: () => edit.click() } : { icon: 'eye', label: t('raccourcis.menu.voir'), keys: { label: t('raccourcis.touche.entree'), aria: 'Enter' }, onSelect: () => body?.click() },
    check ? { icon: 'check', label: check.getAttribute('aria-pressed') === 'true' ? t('raccourcis.menu.decocher') : t('raccourcis.menu.cocher'), keys: { label: t('raccourcis.touche.espace'), aria: 'Space' }, onSelect: () => check.click() } : null,
    trash ? { icon: 'trash', label: t('raccourcis.menu.supprimer'), danger: true, separated: true, keys: { label: t('raccourcis.touche.suppr'), aria: 'Delete' }, onSelect: () => trash.click() } : null,
  ].filter(Boolean);
  const rect = row.getBoundingClientRect();
  openMenu(items, { label: t('raccourcis.menu.titre', { name }), at: at ?? { x: rect.left + 48, y: rect.bottom } });
}

// Espace traitée par un raccourci : son relâchement est bloqué (voir keyup)
let spaceHandled = false;

// --- Démarrage ---
// onUndo : Ctrl+Z (voir app.js : annule dans la liste ouverte)
// onGoList(delta) : [ et ], liste précédente ou suivante, dans l'ordre du
// menu de gauche (pc-side.js : le menu ne nomme plus les listes une à une
// depuis le 23 novembre 2026, il donne donc lui-même cet ordre)
export function startShortcuts({ onUndo, onGoList, notesOn = () => true }) {
  notesShown = notesOn;
  paintKeys();
  // Espace sur un bouton « clique » au relâchement : sur une ligne, il coche
  // (voir keydown) et ne doit rien faire de plus au relâchement, quel que
  // soit le bouton de la ligne qui a le focus (corps de la ligne : ouvrir la
  // fiche ; case : décocher aussitôt ; crayon, corbeille). Firefox clique au
  // relâchement même quand l'appui a été traité : on bloque donc le
  // relâchement de chaque Espace traitée par un raccourci.
  document.addEventListener('keyup', (event) => {
    if (event.key !== ' ' || !onPc()) return;
    if (spaceHandled || event.target.closest?.('.item__body')) event.preventDefault();
    spaceHandled = false;
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
      // N : « Nouvelle liste », ou « Nouvelle note » sur les écrans des notes
      // (le curseur va alors dans le texte : geste fait pour écrire) ;
      // notes coupées : toujours « Nouvelle liste »
      n: () => (notesShown() && location.hash.startsWith('#/notes') ? navigate('newNote', {}, { replace: /^#\/notes\/(?!corbeille)/.test(location.hash) }) : navigate('newList'), true),
      '/': () => focusSearch(),
      ',': () => (navigate('settings'), true),
      '[': () => (onGoList(-1), true),
      ']': () => (onGoList(1), true),
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
    if (run && run()) {
      event.preventDefault();
      if (key === ' ') spaceHandled = true; // son relâchement ne cliquera pas
    }
  });
}

// Message annoncé après Ctrl+Z (role=status du message)
export function announce(text) {
  toast(text);
}
