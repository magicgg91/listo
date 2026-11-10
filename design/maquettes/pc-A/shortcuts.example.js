// Raccourcis clavier de Listo (PC) : exemple de référence, à adapter au code existant.
// Principes : aucun raccourci à une touche pendant la saisie ; désactivables dans Réglages ;
// chaque action du survol ou du clic droit a un équivalent ici.
(() => {
  const settings = { singleKeys: true }; // lu depuis Réglages > « Raccourcis à une touche »
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const topLayer = () => $('[role="dialog"][data-open], .pc-drawer[data-open], .pc-modal[data-open]');
  const undoStack = [];

  const itemButtons = () => $$('.item__body');
  const focusRelative = (delta) => {
    const items = itemButtons();
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = i < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, i + delta));
    items[next].focus();
  };
  const currentItem = () => document.activeElement && document.activeElement.closest('.item');
  const goList = (delta) => {
    const links = $$('.pc-nav__item');
    const i = links.findIndex((a) => a.getAttribute('aria-current') === 'page');
    const target = links[Math.min(links.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta))];
    if (target) target.click();
  };
  const deleteCurrent = () => {
    const item = currentItem();
    const btn = item && $('[data-action="delete-item"]', item);
    if (!btn) return;
    btn.click(); // l'application masque la ligne, affiche le toast « Annuler Ctrl Z » et empile l'annulation
  };

  // Raccourcis à une touche (désactivables)
  const single = {
    '?': () => $('[data-action="show-shortcuts"]').click(),
    n: () => $('[data-action="new-list"]').click(),
    '/': () => $('.pc-head .searchfield__input, .pc-side .searchfield__input').focus(),
    a: () => $('.pc-add .addbar__input') && $('.pc-add .addbar__input').focus(),
    ',': () => $('[data-action="open-settings"]').click(),
    '[': () => goList(-1),
    ']': () => goList(1),
    p: () => $('[data-action="share-list"]') && $('[data-action="share-list"]').click(),
    s: () => $('.toc__link') && $('.toc__link').focus(),
    e: () => { const i = currentItem(); i && $('[data-action="edit-item"]', i).click(); },
    ' ': () => { const i = currentItem(); i && $('.check', i).click(); },
    ArrowDown: () => focusRelative(1),
    ArrowUp: () => focusRelative(-1),
    Delete: deleteCurrent,
  };

  // Espace sur un bouton déclenche le clic au relâchement : on l'annule pour qu'il coche au lieu d'ouvrir la fiche.
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && settingsOn() && e.target.closest && e.target.closest('.item__body')) e.preventDefault();
  });
  const settingsOn = () => settings.singleKeys && !isTyping(document.activeElement) && !topLayer();

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const typing = isTyping(e.target);

    // Valable partout, même pendant la saisie
    if (e.key === 'Escape') {
      const field = e.target.closest && e.target.closest('.searchfield');
      if (field && e.target.value) { e.target.value = ''; e.target.dispatchEvent(new Event('input', { bubbles: true })); return; }
      const layer = topLayer();
      if (layer) { $('[data-action="close-panel"]', layer).click(); e.preventDefault(); return; }
      if (typing) e.target.blur();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { const save = $('[data-action="save"]', topLayer() || document); if (save) { save.click(); e.preventDefault(); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { const undo = undoStack.pop(); if (undo) { undo(); e.preventDefault(); } return; }

    // Pas de raccourci à une touche : en saisie, avec une touche de commande, ou si l'utilisateur les a désactivés
    if (typing || e.ctrlKey || e.metaKey || e.altKey || !settings.singleKeys) return;
    // Une fenêtre ouverte garde le focus : seul « ? » et Échap restent actifs
    if (topLayer() && e.key !== '?') return;
    const fn = single[e.key] || single[e.key.toLowerCase()];
    if (fn) { fn(); e.preventDefault(); }
  });
})();
