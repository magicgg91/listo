// Champ de recherche d'un écran, en deux façons :
//
// 1. Téléphone (toggled) : ouvert par la loupe ronde en bas à droite
//    (décision du 11 novembre 2026, sur « Mes listes », « Échéances » et
//    dans chaque liste). Le champ s'ouvre SOUS LE TITRE, à une place fixe :
//    il ne bouge pas quand le clavier s'ouvre. La loupe est un geste dont le
//    seul but est d'écrire : le curseur va dans le champ (exception permise,
//    voir test/focus.test.js). Pour refermer : la croix du champ, la loupe
//    retouchée, le bouton Retour du téléphone ou Échap ; le texte est vidé.
//    Quitter le champ sans rien y avoir tapé la referme aussi.
//    La propriété bar est la rangée à poser par l'écran sous son titre.
// 2. Ordinateur (docked) : le champ est toujours visible, posé par l'écran
//    dans son en-tête (propriété field) ; Échap le vide puis le quitte.
//
// Dans les deux cas : touche « rechercher » du clavier (Entrée) : le clavier
// se ferme, le texte reste. Les résultats remplacent le contenu de la zone
// qui défile (show).

import { h, icon } from './dom.js';
import { keepFieldFocus } from './tap.js';
import { releaseFocus } from './ui.js';
import { openOverlay } from './router.js';

// content : la zone .scroll ; label : « Rechercher dans la liste »… ;
// onChange(texte) : le texte cherché a changé ; onActive(actif) : le champ
// sert (curseur dedans ou texte tapé) ou ne sert plus ; onOpen(ouvert) :
// téléphone, la recherche s'ouvre ou se ferme ; status : élément gardé juste
// au-dessus des résultats (nombre de résultats annoncé), ou rien.
// docked : ordinateur (voir plus haut) ; sinon, téléphone (loupe).
export function createSearchRow(content, { label, onChange, onActive = () => {}, onOpen = () => {}, status = null, docked = false, placeholder = label }) {
  const toggled = !docked;
  const input = h('input', {
    class: 'searchfield__input',
    type: 'search',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: '100',
    placeholder,
    'aria-label': label,
  });
  // Ordinateur : croix « Effacer la saisie » (un appui ne retire pas le
  // curseur du champ). Téléphone : croix « Fermer la recherche », toujours
  // là (elle vide le texte et referme).
  const clearButton = toggled
    ? h('button', { class: 'icon-btn searchfield__close', type: 'button', 'aria-label': 'Fermer la recherche', onClick: () => close() }, icon('close'))
    : h('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'Effacer la saisie',
      hidden: true,
      onPointerdown: keepFieldFocus.pointerdown,
      onMousedown: keepFieldFocus.mousedown,
      onClick: () => clear(),
    }, icon('x-circle'));
  const field = h('label', { class: `searchfield${toggled ? ' searchfield--glass glass' : ''}` }, icon('search', 'icon--sm'), input, clearButton);
  // Téléphone : rangée à poser sous le titre, cachée tant que la loupe n'a
  // pas été touchée
  const barId = `recherche-${Math.random().toString(36).slice(2, 10)}`;
  const bar = toggled ? h('div', { class: 'searchbar', id: barId, hidden: true }, field) : null;

  let active = false;
  let focused = false;
  // Prévient l'écran quand le champ se met à servir ou cesse de servir, et
  // quand le curseur y entre ou en sort (clavier ouvert ou fermé)
  const updateActive = () => {
    const nowFocused = document.activeElement === input;
    const now = nowFocused || input.value !== '';
    if (!toggled) clearButton.hidden = input.value === '';
    if (now === active && nowFocused === focused) return;
    active = now;
    focused = nowFocused;
    onActive(now);
  };

  input.addEventListener('input', () => {
    updateActive();
    onChange(input.value);
    content.scrollTop = 0; // résultats montrés depuis le début
  });
  input.addEventListener('focus', updateActive);
  input.addEventListener('blur', () => {
    updateActive();
    // Téléphone : champ quitté sans rien y avoir tapé (on a touché ailleurs,
    // on a changé d'avis) : la recherche se referme d'elle-même et la barre
    // d'ajout revient. Un instant d'attente : si c'est la croix ou la loupe
    // qui a été touchée, elle a déjà refermé la recherche (pas de double effet).
    if (toggled) setTimeout(() => {
      if (isOpen && input.value === '' && document.activeElement !== input) close();
    }, 200);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Téléphone : Échap referme. Ordinateur : vide le champ, puis (déjà
      // vide) le quitte.
      if (toggled) close();
      else if (input.value !== '') clear();
      else releaseFocus();
      return;
    }
    // Touche « rechercher » (Entrée) : ferme le clavier, garde le texte
    if (event.key !== 'Enter') return;
    event.preventDefault();
    releaseFocus();
  });

  // Vide la recherche ; le curseur reste là où il était (dans le champ s'il y
  // était : « Effacer la recherche » ne le lui retire pas)
  function clear() {
    if (input.value === '') return;
    input.value = '';
    updateActive();
    onChange('');
    content.scrollTop = 0;
  }

  // --- Téléphone : ouvrir et refermer ---
  let isOpen = false;
  let closeOverlay = null;
  // Referme sans toucher à l'historique (bouton Retour, changement d'écran)
  function hide() {
    if (!isOpen) return;
    isOpen = false;
    closeOverlay = null;
    if (document.activeElement === input) input.blur(); // clavier replié
    bar.hidden = true;
    clear();
    updateActive();
    onOpen(false);
  }
  // Loupe touchée : la rangée apparaît sous le titre et le curseur va dans
  // le champ (geste dont le but est d'écrire). Le bouton Retour du téléphone
  // la referme, comme une fenêtre.
  function open() {
    if (!toggled || isOpen) return;
    isOpen = true;
    bar.hidden = false;
    closeOverlay = openOverlay(hide);
    onOpen(true);
    input.focus();
  }
  function close() {
    if (!isOpen) return;
    const done = closeOverlay;
    if (done) done(); // appelle hide() et retire l'entrée de l'historique
    else hide();
  }

  return {
    // Le champ (ordinateur : à poser dans l'en-tête de l'écran)
    field,
    // Téléphone : la rangée du champ, à poser sous le titre
    bar,
    // Le texte cherché
    get value() { return input.value; },
    // Le champ sert : curseur dedans ou texte tapé
    get active() { return active; },
    // Curseur dans le champ (clavier ouvert sur un téléphone)
    get focused() { return document.activeElement === input; },
    clear,
    // Téléphone : recherche ouverte, ouvrir, refermer, basculer (loupe)
    get open() { return isOpen; },
    openSearch: open,
    close,
    // Ce qu'attend la loupe (tabbar.js) : libellé, état, bascule
    loupe: { label, controls: barId, isOpen: () => isOpen, toggle: () => (isOpen ? close() : open()) },
    // Boutons qui vident la recherche sans retirer le curseur du champ
    keepFocus: keepFieldFocus,
    // Remplace le contenu de la zone qui défile. status (s'il y en a un)
    // reste en tête, sans être recréé (annonces non perdues).
    show(nodes) {
      content.replaceChildren(...[status, nodes].flat(Infinity).filter((node) => node !== null && node !== undefined && node !== false));
    },
  };
}
