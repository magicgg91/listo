// Glissement vers la gauche sur une ligne de liste (raccourci pour
// supprimer). La ligne suit le doigt et révèle derrière elle une zone rouge
// « Supprimer » ; au relâchement, elle reste ouverte au-delà d'un seuil,
// sinon elle revient. Rien n'est supprimé sans un appui sur la zone rouge.
//
// Événements tactiles natifs seulement (pas de glissement à la souris) ; la
// ligne garde le défilement vertical (CSS touch-action: pan-y). Le geste
// n'est pris en compte que s'il est nettement horizontal. Une seule ligne
// ouverte à la fois : toucher ailleurs, faire défiler, ou ouvrir une autre
// ligne la referme.

// Réglages du geste (en pixels)
export const SWIPE = {
  slop: 10,        // mouvement minimal avant de décider horizontal / vertical
  ratio: 1.5,      // horizontal si |dx| dépasse 1,5 fois |dy| (diagonales : défilement)
  edge: 24,        // bord gauche de l'écran : réservé au geste « retour » de l'iPhone
  threshold: 80,   // seuil d'ouverture (ou un tiers de la ligne si elle est plus étroite)
  reveal: 104,     // largeur de la zone rouge, position de la ligne ouverte
};

// Sens du geste après un déplacement (dx, dy) depuis le premier contact :
// 'undecided' (trop court), 'horizontal' ou 'vertical'
export function swipeIntent(dx, dy, { slop = SWIPE.slop, ratio = SWIPE.ratio } = {}) {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return 'undecided';
  return Math.abs(dx) > Math.abs(dy) * ratio ? 'horizontal' : 'vertical';
}

// Position de la ligne pendant le glissement : jamais vers la droite (0 au
// plus), jamais au-delà de sa largeur. startOpen : la ligne était ouverte.
export function swipeOffset(dx, startOpen, width, reveal = SWIPE.reveal) {
  const base = startOpen ? -reveal : 0;
  return Math.max(-width, Math.min(0, base + dx));
}

// Au relâchement : ouverte (zone rouge visible) si la ligne a été tirée
// au-delà du seuil, sinon refermée. Un glissement vers la droite d'une ligne
// ouverte la referme donc.
export function swipeRelease(offset, width, threshold = SWIPE.threshold) {
  return -offset >= Math.min(threshold, width / 3) ? 'open' : 'closed';
}

// Contrôleur d'un écran : rend des lignes glissables. Une seule ouverte à la
// fois. Renvoie { attach(li, slide, button), close(), stop() }.
// - li : la ligne (.item.swipe) ; slide : la partie qui glisse ;
// - button : la zone rouge (vrai bouton « Supprimer <nom> ») ;
// - scroller : l'élément qui défile (le défilement referme la ligne ouverte).
export function createSwipeController(scroller) {
  let open = null; // { li, slide, button } ouverte
  let suppressClickIn = null; // ligne dont le prochain appui est ignoré (sauf sur sa zone rouge)

  const place = (row, offset, animate) => {
    row.slide.classList.toggle('swipe__slide--moving', !animate);
    row.slide.style.transform = offset ? `translateX(${offset}px)` : '';
  };
  const setOpen = (row, isOpen) => {
    row.li.classList.toggle('is-open', isOpen);
    place(row, isOpen ? -SWIPE.reveal : 0, true);
    if (isOpen) {
      if (open && open !== row) setOpen(open, false);
      open = row;
    } else if (open === row) {
      open = null;
    }
  };
  const close = () => {
    if (open) setOpen(open, false);
  };

  // Toucher ailleurs que sur la zone rouge referme la ligne ouverte ; un
  // appui sur la ligne ouverte elle-même ne fait rien d'autre (pas de fiche)
  const onTouchOutside = (event) => {
    if (!open || open.button.contains(event.target)) return;
    if (open.li.contains(event.target)) suppressClickIn = open.li;
    close();
  };
  const onClick = (event) => {
    const target = event.target;
    if (suppressClickIn && suppressClickIn.contains(target) && !target.closest?.('.swipe__delete')) {
      event.preventDefault();
      event.stopPropagation();
    }
    suppressClickIn = null;
  };
  // (true : avant la ligne touchée ; un écouteur tactile sur document est
  // passif par défaut, il ne gêne jamais le défilement)
  document.addEventListener('touchstart', onTouchOutside, true);
  document.addEventListener('click', onClick, true);
  scroller.addEventListener('scroll', close, { passive: true });

  function attach(li, slide, button) {
    const row = { li, slide, button };
    let start = null; // { x, y, open, width, intent }
    li.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      const t = event.touches[0];
      // Bord gauche de l'écran : geste « retour » du téléphone, pas un glissement
      if (t.clientX < SWIPE.edge) return;
      start = { x: t.clientX, y: t.clientY, open: open === row, width: li.offsetWidth, intent: 'undecided' };
    }, { passive: true });
    li.addEventListener('touchmove', (event) => {
      if (!start || start.intent === 'vertical') return;
      const t = event.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (start.intent === 'undecided') {
        start.intent = swipeIntent(dx, dy);
        if (start.intent !== 'horizontal') return;
        if (open && open !== row) close(); // une seule ligne ouverte
        li.classList.add('is-swiping');
      }
      place(row, swipeOffset(dx, start.open, start.width), false);
    }, { passive: true });
    const end = (event) => {
      if (!start) return;
      const wasHorizontal = start.intent === 'horizontal';
      if (wasHorizontal) {
        const t = event.changedTouches?.[0];
        const dx = t ? t.clientX - start.x : 0;
        li.classList.remove('is-swiping');
        setOpen(row, event.type === 'touchend' && swipeRelease(swipeOffset(dx, start.open, start.width), start.width) === 'open');
        suppressClickIn = li; // la fin du glissement n'ouvre pas la fiche
        setTimeout(() => { if (suppressClickIn === li) suppressClickIn = null; }, 400);
      }
      start = null;
    };
    li.addEventListener('touchend', end);
    li.addEventListener('touchcancel', end);
  }

  function stop() {
    document.removeEventListener('touchstart', onTouchOutside, true);
    document.removeEventListener('click', onClick, true);
    scroller.removeEventListener('scroll', close);
  }

  return { attach, close, stop };
}
