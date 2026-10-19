// Champ de recherche masqué en haut d'une zone qui défile (design/recherche,
// variante B) : dans une liste et sur « Mes listes ». Aucune loupe, la barre
// du haut ne change pas.
//
// - Le champ est le premier élément de la zone .scroll. À l'arrivée sur
//   l'écran, la zone est défilée de sa hauteur : il est hors de vue et
//   l'écran est le même qu'avant. On tire la liste vers le bas (ou on
//   remonte tout en haut) pour le voir.
// - Jamais de curseur mis tout seul : le clavier ne s'ouvre qu'au toucher
//   du champ.
// - Tant qu'il sert (curseur dedans, ou texte tapé), il reste en haut de la
//   zone, même en faisant défiler les résultats. Vide et sans curseur, il
//   repart avec le défilement.
// - Touche « rechercher » du clavier : le clavier se ferme, le texte reste.
//   La croix (et « Effacer la recherche ») vide le texte et garde le curseur.
// - Liste courte : une marge invisible en bas permet quand même de défiler
//   de la hauteur du champ (sans elle, il resterait visible). Elle ne fait
//   jamais apparaître de bande vide : défilé tout en bas, l'écran montre
//   exactement la même chose qu'avant.

import { h, icon } from './dom.js';
import { keepFieldFocus } from './tap.js';
import { releaseFocus } from './ui.js';

// content : la zone .scroll ; label : « Rechercher dans la liste »… ;
// onChange(texte) : le texte cherché a changé ; onActive(actif) : le champ
// sert (curseur dedans ou texte tapé) ou ne sert plus ; status : élément
// gardé juste sous le champ (nombre de résultats annoncé), ou rien.
export function createSearchRow(content, { label, onChange, onActive = () => {}, status = null }) {
  const input = h('input', {
    class: 'searchfield__input',
    type: 'search',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: '100',
    placeholder: label,
    'aria-label': label,
  });
  // Croix « Effacer la saisie » : un appui ne retire pas le curseur du champ
  const clearButton = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': 'Effacer la saisie',
    hidden: true,
    onPointerdown: keepFieldFocus.pointerdown,
    onMousedown: keepFieldFocus.mousedown,
    onClick: () => clear(),
  }, icon('x-circle'));
  const row = h('div', { class: 'searchrow', hidden: true },
    h('label', { class: 'searchfield' }, icon('search', 'icon--sm'), input, clearButton));
  // Marge invisible en bas (liste courte), toujours le dernier élément
  const room = h('div', { class: 'searchroom', 'aria-hidden': 'true' });

  let active = false;
  let focused = false;
  // Prévient l'écran quand le champ se met à servir ou cesse de servir, et
  // quand le curseur y entre ou en sort (clavier ouvert ou fermé)
  const updateActive = () => {
    const nowFocused = document.activeElement === input;
    const now = nowFocused || input.value !== '';
    clearButton.hidden = input.value === '';
    if (now === active && nowFocused === focused) return;
    active = now;
    focused = nowFocused;
    row.classList.toggle('searchrow--pinned', now); // reste en haut tant qu'il sert
    content.classList.toggle('scroll--searching', now);
    onActive(now);
  };

  input.addEventListener('input', () => {
    updateActive();
    onChange(input.value);
    content.scrollTop = 0; // résultats montrés depuis le début, champ compris
  });
  input.addEventListener('focus', updateActive);
  input.addEventListener('blur', updateActive);
  // Touche « rechercher » (Entrée) : ferme le clavier, garde le texte
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    releaseFocus();
  });

  // Vide la recherche ; le curseur reste là où il était (dans le champ s'il y
  // était : la croix et « Effacer la recherche » ne le lui retirent pas)
  function clear() {
    if (input.value === '') return;
    input.value = '';
    updateActive();
    onChange('');
    content.scrollTop = 0;
  }

  // Hauteur de la marge du bas : juste de quoi défiler de la hauteur du champ
  function updateRoom() {
    if (row.hidden) {
      room.style.height = '0px';
      return;
    }
    // Hauteur de tout ce qui précède la marge, plus l'espace du bas de la
    // zone (scrollHeight ne convient pas : il ne descend jamais sous la
    // hauteur visible)
    const top = room.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
    const others = top + (parseFloat(getComputedStyle(content).paddingBottom) || 0);
    const missing = content.clientHeight + row.offsetHeight - others;
    room.style.height = `${Math.max(0, Math.ceil(missing))}px`;
  }
  // Clavier ouvert ou fermé, rotation : la zone change de hauteur
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateRoom).observe(content);

  // Le champ est masqué une seule fois, à l'arrivée sur l'écran (dès que la
  // zone est affichée avec quelque chose à chercher)
  let hiddenOnce = false;
  function hideOnce() {
    if (hiddenOnce || row.hidden) return;
    if (!content.isConnected) {
      requestAnimationFrame(hideOnce); // écran pas encore posé
      return;
    }
    hiddenOnce = true;
    updateRoom();
    content.scrollTop = row.offsetHeight;
  }

  return {
    // Le texte cherché
    get value() { return input.value; },
    // Le champ sert : curseur dedans ou texte tapé
    get active() { return active; },
    // Curseur dans le champ (clavier ouvert sur un téléphone)
    get focused() { return document.activeElement === input; },
    clear,
    // Boutons qui vident la recherche sans retirer le curseur du champ
    keepFocus: keepFieldFocus,
    // Remplace le contenu de la zone (le champ reste en tête, avec sa saisie
    // et son curseur ; la marge reste à la fin). available : faux quand il
    // n'y a rien à chercher (chargement, liste vide ou introuvable).
    show(nodes, { available = true } = {}) {
      row.hidden = !available;
      // Le champ (et l'élément gardé sous lui) restent en place, sans être
      // déplacés : la saisie, le curseur et les annonces ne sont pas perdus.
      // Tout ce qui les suit est retiré, puis remplacé.
      const head = status ?? row;
      if (row.parentNode !== content) content.prepend(row);
      if (status && status.previousSibling !== row) row.after(status);
      while (head.nextSibling) head.nextSibling.remove();
      while (content.firstChild !== row) content.firstChild.remove();
      content.append(...[nodes].flat(Infinity).filter((node) => node !== null && node !== undefined && node !== false), room);
      updateRoom();
      if (available) hideOnce();
    },
  };
}
