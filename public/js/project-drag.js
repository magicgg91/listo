// Glisser une carte d'un projet (docs/cadrage-projets.md, 4.2 et 4.4 ;
// choix du propriétaire du 25 novembre 2026).
//
// - Téléphone : un APPUI LONG soulève la carte (elle se colle sous le
//   doigt, un peu tournée, avec une ombre) ; on la fait glisser pour
//   changer sa place dans la colonne (une place en pointillés montre où elle
//   tombera), ou on la pose sur un onglet de colonne : elle va en haut de
//   cette colonne. Un doigt qui bouge avant la fin de l'appui fait défiler
//   l'écran, comme d'habitude (rien n'est soulevé).
// - Ordinateur : la souris tenue et déplacée de quelques pixels soulève la
//   carte ; on la pose dans la même colonne ou dans une autre.
// - Une carte que mon rôle ne permet pas de déplacer ne se soulève pas
//   (canMove) ; le serveur revérifie de toute façon chaque déplacement.
// - Jamais une action possible seulement en glissant : « Déplacer vers… »,
//   « Monter » et « Descendre » (menu de la carte) font la même chose, au
//   doigt, au clavier et au lecteur d'écran.
// - Mouvement réduit demandé par le téléphone : la carte tenue n'est pas
//   tournée (listo.css).
//
// Aucun texte ici, aucune donnée changée : au lâcher, onDrop({ cardId,
// columnId, afterId }) dit où la carte doit aller (afterId : la carte qui
// la précède, null en haut) ; l'écran envoie l'opération (card.move).
// La position de la carte tenue suit le doigt par element.style (calculée
// à chaque mouvement : inévitable, la CSP n'est pas concernée).

const LONG_PRESS_MS = 450; // appui long du téléphone
const TOUCH_SLOP = 10;     // au-delà (px), le doigt fait défiler : pas d'appui long
const MOUSE_SLOP = 6;      // souris : distance qui soulève la carte
const EDGE = 48;           // près d'un bord : la zone défile toute seule

// root : l'élément qui contient les cartes (écoute des appuis) ;
// canMove(cardId) ; onDrop({ cardId, columnId, afterId }) ;
// scrollers() : les zones qui défilent pendant le glisser ([verticale,
// horizontale facultative]). Les listes de cartes portent
// data-column="<colonne>", les cartes data-card="<carte>", les onglets de
// colonne (téléphone) .coltab[data-column]. Renvoie { dispose(), dragging() }.
export function cardDrag(root, { canMove, onDrop, scrollers = () => [] }) {
  let press = null;   // appui en cours { id, card, x, y, touch, timer }
  let drag = null;    // carte soulevée { card, ghost, drop, dx, dy, tab }
  let justDropped = false;

  const reset = () => {
    if (press?.timer) clearTimeout(press.timer);
    press = null;
  };

  function lift() {
    if (!press || drag) return;
    const { card } = press;
    const box = card.getBoundingClientRect();
    // La place où la carte tombera : un cadre en pointillés de sa hauteur
    const drop = document.createElement('div');
    drop.className = 'kdrop';
    drop.setAttribute('aria-hidden', 'true');
    drop.style.height = `${box.height}px`;
    // La carte tenue : une copie qui suit le doigt (l'originale est cachée)
    const ghost = card.cloneNode(true);
    ghost.classList.add('is-dragging', 'kghost');
    ghost.setAttribute('aria-hidden', 'true');
    // Posée dans l'application (.app, qui ne défile pas), à la place de la
    // carte : ses coordonnées sont comptées depuis le coin de .app
    const layer = document.getElementById('app') ?? document.body;
    const origin = layer.getBoundingClientRect();
    ghost.style.width = `${box.width}px`;
    ghost.style.left = `${box.left - origin.left}px`;
    ghost.style.top = `${box.top - origin.top}px`;
    card.before(drop);
    card.hidden = true;
    layer.append(ghost);
    drag = { card, ghost, drop, dx: press.x - box.left + origin.left, dy: press.y - box.top + origin.top, tab: null, from: placeOf(drop) };
    document.documentElement.classList.add('is-card-dragging');
    navigator.vibrate?.(10);
  }

  // Téléphone : plus de défilement tant que la carte est tenue. Écouté dès
  // le départ (et pas seulement pendant le glisser) : le navigateur sait
  // ainsi, dès que le doigt se pose, qu'il doit attendre la réponse avant
  // de faire défiler.
  const stopScroll = (event) => {
    if (drag) event.preventDefault();
  };

  // Liste (colonne) et carte qui précède la place en pointillés
  function placeOf(drop) {
    const list = drop.parentElement;
    let before = drop.previousElementSibling;
    while (before && !before.dataset?.card) before = before.previousElementSibling;
    return { columnId: list?.dataset.column ?? null, afterId: before ? before.dataset.card : null };
  }

  function follow(x, y) {
    const { ghost, drop } = drag;
    ghost.style.left = `${x - drag.dx}px`;
    ghost.style.top = `${y - drag.dy}px`;
    const under = document.elementFromPoint(x, y);
    // Un onglet de colonne (téléphone) : la carte ira en haut de la colonne
    const tab = under?.closest?.('.coltab[data-column]') ?? null;
    if (tab !== drag.tab) {
      drag.tab?.classList.remove('is-drop');
      tab?.classList.add('is-drop');
      drag.tab = tab;
    }
    if (tab) return;
    // Une liste de cartes : la place se met avant la première carte dont le
    // milieu est plus bas que le doigt
    // (ordinateur : n'importe où dans une colonne, son en-tête ou son bas
    // compris, vise la liste de ses cartes, data-drop-list)
    const list = under?.closest?.('[data-column]:not(.coltab)') ?? under?.closest?.('[data-drop-list]')?.querySelector('[data-column]') ?? null;
    if (list && root.contains(list)) {
      const cards = [...list.children].filter((el) => el.dataset?.card && !el.hidden && el !== drag.card);
      const next = cards.find((el) => {
        const box = el.getBoundingClientRect();
        return y < box.top + box.height / 2;
      }) ?? null;
      if (next) {
        if (drop.nextElementSibling !== next) next.before(drop);
      } else {
        const last = cards.at(-1);
        if (last) {
          if (last.nextElementSibling !== drop) last.after(drop);
        } else if (drop.parentElement !== list) list.prepend(drop);
      }
    }
    // Près d'un bord : la zone défile
    const [vertical, horizontal] = scrollers();
    edgeScroll(vertical, y, 'y');
    edgeScroll(horizontal, x, 'x');
  }

  function edgeScroll(box, at, axis) {
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const start = axis === 'y' ? rect.top : rect.left;
    const end = axis === 'y' ? rect.bottom : rect.right;
    const step = at < start + EDGE ? -12 : at > end - EDGE ? 12 : 0;
    if (!step) return;
    if (axis === 'y') box.scrollTop += step;
    else box.scrollLeft += step;
  }

  function finish(cancelled) {
    const current = drag;
    drag = null;
    reset();
    document.documentElement.classList.remove('is-card-dragging');
    if (!current) return;
    justDropped = true;
    setTimeout(() => { justDropped = false; }, 400);
    const { card, ghost, drop, tab } = current;
    tab?.classList.remove('is-drop');
    const target = tab ? { columnId: tab.dataset.column, afterId: null } : placeOf(drop);
    ghost.remove();
    drop.remove();
    card.hidden = false;
    if (cancelled || !target.columnId) return;
    if (!tab && target.columnId === current.from.columnId && target.afterId === current.from.afterId) return;
    onDrop({ cardId: card.dataset.card, ...target });
  }

  const onDown = (event) => {
    if (event.button !== 0 || drag) return;
    const card = event.target.closest?.('[data-card]');
    if (!card || !root.contains(card) || event.target.closest('.icon-btn, input, textarea')) return;
    if (!canMove(card.dataset.card)) return;
    const touch = event.pointerType !== 'mouse';
    press = { id: event.pointerId, card, x: event.clientX, y: event.clientY, touch, timer: null };
    if (touch) press.timer = setTimeout(lift, LONG_PRESS_MS);
  };
  const onMove = (event) => {
    if (drag) {
      if (event.pointerId !== press?.id) return;
      event.preventDefault();
      follow(event.clientX, event.clientY);
      return;
    }
    if (!press || event.pointerId !== press.id) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (press.touch) {
      if (moved > TOUCH_SLOP) reset(); // le doigt fait défiler
      return;
    }
    if (moved > MOUSE_SLOP) {
      lift();
      follow(event.clientX, event.clientY);
    }
  };
  const onUp = (event) => {
    if (press && event.pointerId !== press.id) return;
    if (drag) finish(false);
    else reset();
  };
  const onCancel = () => {
    if (drag) finish(true);
    else reset();
  };
  // Après un glisser, le « clic » qui suit le lâcher n'ouvre pas la carte ;
  // l'appui long n'ouvre pas le menu du système (iPhone, Android)
  const onClick = (event) => {
    if (!justDropped) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onContext = (event) => {
    if (press?.touch || drag) event.preventDefault();
  };
  const onKey = (event) => {
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      finish(true);
    }
  };

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('touchmove', stopScroll, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  root.addEventListener('click', onClick, true);
  root.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', onKey);
  return {
    dragging: () => Boolean(drag),
    dispose() {
      if (drag) finish(true);
      reset();
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('touchmove', stopScroll);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('contextmenu', onContext);
      document.removeEventListener('keydown', onKey);
    },
  };
}

// Glissement de côté sur le téléphone : changer de colonne (choix du
// propriétaire du 25 novembre 2026). Le geste part du milieu de l'écran,
// jamais du bord gauche (le retour de l'iPhone) ; il doit être nettement
// de côté (pas un défilement) et assez long. L'équivalent sans geste : les
// onglets des colonnes. onSwipe(+1 : colonne suivante, -1 : précédente).
// busy() : vrai pendant un glisser de carte (rien alors).
const SWIPE_EDGE = 32;      // bord gauche réservé au retour (px)
const SWIPE_MIN = 64;       // distance de côté minimale (px)
export function columnSwipe(root, { onSwipe, busy = () => false }) {
  let start = null;
  const onDown = (event) => {
    if (event.pointerType === 'mouse' || busy()) return;
    start = event.clientX > SWIPE_EDGE ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  };
  const onUp = (event) => {
    if (!start || event.pointerId !== start.id || busy()) {
      start = null;
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  };
  const onCancel = () => { start = null; };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onCancel);
  return () => {
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onCancel);
  };
}
