// Éléments d'interface partagés par les écrans : feuille du bas, boîte de
// confirmation, menu, message temporaire (toast) et indicateur de synchro.
// Le balisage est celui de design/components.html.

import { h, icon, iconButton, replace } from './dom.js';
import { openOverlay } from './router.js';

// Élément dans lequel s'affichent les fenêtres : la colonne de l'écran
// courant (réglé par app.js à chaque écran).
let host = document.body;
export function setOverlayHost(element) {
  host = element;
}

// Ordinateur (.app--pc, à partir de 1 024 px, design/maquettes/pc-A) : les
// feuilles et les confirmations deviennent un tiroir à droite ou une
// fenêtre centrée, posés sur toute l'application (pcLayer : l'élément
// .app) ; le reste (.pc) devient inerte (inert : ni clic, ni Tab, ni
// lecteur d'écran) tant qu'une fenêtre est ouverte. Les menus restent dans
// l'écran. Sur téléphone, rien ne change.
let pcLayer = null;
export function setPcLayer(element) {
  pcLayer = element;
}
export const onPc = () => Boolean(pcLayer?.classList.contains('app--pc'));
let pcOpen = 0; // fenêtres ouvertes sur ordinateur
function setPcInert(on) {
  const rest = pcLayer?.querySelector(':scope > .pc');
  if (!rest) return;
  if (on) rest.setAttribute('inert', '');
  else rest.removeAttribute('inert');
}

// Champ de saisie de texte (le clavier du téléphone s'ouvre s'il reçoit le
// focus). Listo ne met jamais le curseur dans un tel champ de lui-même : le
// clavier ne s'ouvre que quand on touche le champ.
export function isTextField(element) {
  if (!element?.matches) return false;
  if (element.isContentEditable || element.matches('textarea')) return true;
  return element.matches('input') && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image', 'hidden'].includes(element.type);
}

// Retire le curseur d'un champ de saisie (le clavier du téléphone se
// replie). blur() est nécessaire sur iPhone : un champ retiré de la page
// sans blur() peut y laisser le clavier ouvert. Sans effet si aucun champ
// n'a le curseur. Appelée après un ajout, à la fermeture d'une fenêtre et
// au changement d'écran : jamais pendant la saisie.
export function releaseFocus() {
  const active = document.activeElement;
  if (isTextField(active)) active.blur();
}

// Éléments qu'on peut atteindre avec la touche Tab dans une fenêtre
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Ouvre une fenêtre superposée (fond grisé + contenu). Gère le bouton Retour
// du téléphone, la touche Échap, la touche Tab (le focus reste dans la
// fenêtre) et le retour du focus clavier à la fermeture.
// returnTo : élément qui reprend le focus à la fermeture (un bouton), utile
// sur un téléphone où toucher un bouton ne lui donne pas le focus ; sinon
// l'élément qui l'avait à l'ouverture.
// pc : fenêtre posée sur toute l'application sur ordinateur (voir pcLayer).
// beforeClose : appelée avant une fermeture demandée (Échap, croix, fond,
// « Annuler ») ; si elle répond faux, la fenêtre reste ouverte.
// history = false : pas d'entrée d'historique (voir openOverlay du routeur).
function overlay(build, { label, role = 'dialog', onClose, returnTo = null, pc = false, beforeClose = null, history = true } = {}) {
  const opener = returnTo ?? document.activeElement;
  const scrim = h('div', { class: 'scrim' });
  const target = pc && onPc() ? pcLayer : host;
  const onLayer = target === pcLayer;
  let closeViaRouter = null;
  let closed = false;

  // Fermeture effective (appelée une seule fois)
  const remove = () => {
    if (closed) return;
    closed = true;
    // Un champ de la fenêtre a encore le curseur : il le perd (clavier replié)
    if (panel.contains(document.activeElement)) releaseFocus();
    scrim.remove();
    panel.remove();
    document.removeEventListener('keydown', onKey);
    if (onLayer) {
      pcOpen = Math.max(0, pcOpen - 1);
      if (!pcOpen) setPcInert(false);
    }
    onClose?.();
    // Retour du focus à l'élément d'origine (bouton, ligne…), sauf si c'était
    // un champ de saisie : le clavier se rouvrirait tout seul
    if (opener?.isConnected && !isTextField(opener)) opener.focus();
  };
  const shut = () => (closeViaRouter ? closeViaRouter() : remove());
  let asking = false;
  const close = async () => {
    if (closed || asking) return;
    if (beforeClose) {
      asking = true;
      const ok = await beforeClose();
      asking = false;
      if (!ok) return;
    }
    shut();
  };
  const onKey = (event) => {
    // Seule la fenêtre du dessus répond à Échap (sur ordinateur)
    if (event.key === 'Escape' && onLayer && target.lastElementChild !== panel) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') keepFocusInside(event);
  };
  // Piège de focus : Tab et Maj+Tab tournent dans la fenêtre
  const keepFocusInside = (event) => {
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden]'));
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const inside = panel.contains(document.activeElement);
    if (event.shiftKey && (!inside || document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  const panel = build(close);
  panel.setAttribute('role', role);
  panel.setAttribute('aria-modal', 'true');
  if (label) panel.setAttribute('aria-label', label);
  scrim.addEventListener('click', () => close());
  target.append(scrim, panel);
  if (onLayer) {
    pcOpen++;
    setPcInert(true);
  }
  // Fenêtre ouverte par-dessus une autre (choix du rayon depuis une fiche,
  // « Nouveau rayon… » depuis ce choix…) : elle passe au-dessus, fond grisé
  // compris ; la fenêtre du dessous est grisée et ne réagit plus aux appuis
  const below = target.querySelectorAll(':scope > .scrim').length - 1;
  if (below > 0) {
    const base = parseInt(getComputedStyle(panel).zIndex, 10) || 11;
    scrim.style.zIndex = String(base + below * 2 - 1);
    panel.style.zIndex = String(base + below * 2);
  }
  document.addEventListener('keydown', onKey);
  closeViaRouter = openOverlay(remove, { push: history });
  // Fermeture forcée (sans beforeClose) : changement d'écran, droit retiré
  const forceClose = shut;

  // Focus sur le bouton de départ de la fenêtre (data-initial-focus, jamais
  // un champ de saisie), sinon sur la fenêtre elle-même : les lecteurs
  // d'écran annoncent son titre, et aucun clavier ne s'ouvre
  panel.setAttribute('tabindex', '-1');
  const start = panel.querySelector('[data-initial-focus]');
  if (start && !isTextField(start)) start.focus();
  else panel.focus();
  return { close, panel, forceClose };
}

// Feuille qui monte du bas (édition d'article, choix du rayon…).
// content : éléments à afficher sous le titre.
// scroll : la feuille défile si son contenu est haut (feuille Article avec photo).
// tools : boutons-icônes placés dans l'en-tête, avant la croix (fiche d'un
// article : poubelle et disquette « Enregistrer ») ; l'en-tête reste alors visible
// quand la feuille défile, et le titre tient sur une ligne (tronqué si besoin).
// returnTo : bouton qui reprend le focus à la fermeture (voir overlay).
// Ordinateur : pc = 'drawer' (tiroir à droite : fiche d'un article,
// partage) ou 'modal' (fenêtre centrée, par défaut : confirmations,
// choix, création) ; size : 'sm' ou 'lg' ; footer : boutons du pied
// (téléphone : ils restent dans le contenu, voir l'appelant) ; beforeClose :
// voir overlay.
export function openSheet({ title, sub, content, onClose, scroll = false, tools = null, returnTo = null, pc = 'modal', size = '', footer = null, beforeClose = null, history = true }) {
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  if (onPc()) {
    return overlay((close) => h('div', {
      class: `pc-panel ${pc === 'drawer' ? 'pc-drawer' : `pc-modal${size ? ` pc-modal--${size}` : ''}`}`,
      'aria-labelledby': titleId,
    },
    h('div', { class: 'pc-panel__head' },
      h('div', { class: 'pc-panel__heading' }, h('h2', { class: 'pc-panel__title', id: titleId }, title), sub ? h('p', { class: 'pc-panel__sub' }, sub) : null),
      tools,
      iconButton('close', 'Fermer', () => close())),
    h('div', { class: 'pc-panel__body' }, content),
    footer ? h('div', { class: 'pc-panel__foot' }, footer) : null,
    ), { onClose, returnTo, pc: true, beforeClose, history });
  }
  return overlay((close) => h('div', { class: `sheet${scroll ? ' sheet--scroll' : ''}`, 'aria-labelledby': titleId },
    h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }),
    h('div', { class: `sheet__head${tools ? ' sheet__head--tools' : ''}` },
      h('div', { class: tools ? 'sheet__heading' : null }, h('h2', { class: 'sheet__title', id: titleId }, title), sub ? h('p', { class: 'sheet__sub' }, sub) : null),
      tools ? h('div', { class: 'sheet__tools' }, tools, iconButton('close', 'Fermer', () => close())) : iconButton('close', 'Fermer', () => close())),
    content,
  ), { onClose, returnTo, beforeClose });
}

// Photo en plein écran (photo-plein-ecran-1) : titre, image, légende, Fermer.
// Le bouton Retour du téléphone et la touche Échap la ferment aussi.
export function openLightbox({ title, src, alt, caption }) {
  const titleId = `lb-${Math.random().toString(36).slice(2, 8)}`;
  return overlay((close) => h('div', { class: 'lightbox', 'aria-labelledby': titleId },
    h('div', { class: 'lightbox__bar' },
      h('h2', { class: 'lightbox__title', id: titleId }, title),
      iconButton('close', 'Fermer la photo', close)),
    h('div', { class: 'lightbox__stage' }, h('img', { class: 'lightbox__img', src, alt })),
    caption ? h('p', { class: 'lightbox__cap' }, caption) : null,
    h('div', { class: 'lightbox__foot' }, h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: close }, 'Fermer'))), { pc: true });
}

// Boîte de confirmation. Renvoie une promesse : true si l'action est confirmée.
// text : une phrase, ou plusieurs (un paragraphe chacune), lues par les
// lecteurs d'écran avec le titre (aria-describedby). focusCancel : le focus va
// sur « Annuler » à l'ouverture (action grave : supprimer une liste), sinon
// sur le bouton principal.
export function confirmDialog({ title, text, confirmLabel, cancelLabel = 'Annuler', danger = true, focusCancel = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const textId = `${titleId}-text`;
    const paragraphs = Array.isArray(text) ? text : [text];
    // Ordinateur : fenêtre centrée (maquette pc-A 18), mêmes boutons au pied
    const pc = onPc();
    const { close } = overlay((closeFn) => h('div', { class: pc ? 'pc-panel pc-modal pc-modal--sm' : 'dialog', 'aria-labelledby': titleId, 'aria-describedby': textId },
      pc ? h('div', { class: 'pc-panel__head' }, h('h2', { class: 'pc-panel__title', id: titleId }, title)) : h('h2', { class: 'dialog__title', id: titleId }, title),
      h('div', { id: textId, class: pc ? 'pc-panel__body' : null }, paragraphs.map((p) => h('p', { class: 'dialog__text' }, p))),
      h('div', { class: pc ? 'pc-panel__foot pc-panel__foot--end' : 'dialog__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: closeFn, 'data-initial-focus': focusCancel ? true : null }, cancelLabel),
        h('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
          type: 'button',
          'data-initial-focus': focusCancel ? null : true, // bouton principal : focus à l'ouverture, sauf focusCancel
          onClick: () => {
            answer = true;
            closeFn();
          },
        }, confirmLabel)),
    ), { role: 'alertdialog', onClose: () => resolve(answer), pc: true });
    void close;
  });
}

// Confirmation par une feuille du bas (zone des articles cochés) : titre,
// texte, avertissement facultatif (encadré rouge) et deux boutons. Renvoie une
// promesse : true si l'action est confirmée. La feuille prend le focus sur
// elle-même (jamais sur le bouton qui détruit).
export function confirmSheet({ title, text, warning, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet({
      title,
      content: [
        h('p', { class: 'sheet__sub' }, text),
        warning ? h('p', { class: 'note note--danger', role: 'alert' }, icon('alert', 'icon--sm'), h('span', {}, warning)) : null,
        h('div', { class: 'dialog__actions' },
          h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, 'Annuler'),
          h('button', {
            class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
            type: 'button',
            onClick: () => {
              answer = true;
              sheet.close();
            },
          }, confirmLabel)),
      ],
      onClose: () => resolve(answer),
      size: 'sm',
    });
  });
}

// Menu « ⋮ » : items = [{ icon, label, danger, onSelect }]
// item.danger : action destructrice (texte rouge) ; item.separated : séparée
// des actions précédentes par un trait. onClose : appelé à la fermeture.
// anchor : bouton qui ouvre le menu (carte de « Mes listes ») ; le menu
// s'affiche alors juste sous lui, sans jamais sortir de l'écran.
export function openMenu(items, { label = 'Menu', onClose, anchor = null } = {}) {
  let closeMenu;
  let panel;
  const { close } = overlay((close) => {
    closeMenu = close;
    panel = h('div', { class: 'menu' },
      items.map((item) => [item.separated ? h('div', { class: 'menu__sep', role: 'separator' }) : null, h('button', {
        class: `menu__item${item.danger ? ' menu__item--danger' : ''}`,
        type: 'button',
        // Choix exclusif (tri…) : l'option active a une coche ET son texte
        role: item.checked === undefined ? 'menuitem' : 'menuitemradio',
        'aria-checked': item.checked === undefined ? null : String(item.checked),
        onClick: () => {
          closeMenu();
          // L'action est lancée après la fermeture du menu (elle peut ouvrir
          // une autre fenêtre ou changer d'écran)
          setTimeout(() => item.onSelect(), 0);
        },
      }, icon(item.icon), h('span', { class: 'grow' }, item.label), item.checked ? icon('check', 'icon--check') : null)]));
    return panel;
  }, { role: 'menu', label, onClose });
  if (anchor) {
    const box = host.getBoundingClientRect();
    const below = anchor.getBoundingClientRect().bottom - box.top + 4;
    const room = box.height - panel.offsetHeight - 8;
    panel.style.top = `${Math.max(8, Math.min(below, room))}px`;
  }
  return close;
}

// Message temporaire en bas de l'écran, avec une action facultative
// (« Annuler »). Un seul message à la fois.
let currentToast = null;
export function toast(text, { action, onAction, duration, low = false } = {}) {
  currentToast?.remove();
  const el = h('div', { class: `toast${low ? ' toast--low' : ''}`, role: 'status' },
    h('span', { class: 'toast__text' }, text),
    action ? h('button', {
      class: 'toast__action',
      type: 'button',
      onClick: () => {
        el.remove();
        onAction?.();
      },
    }, action) : null);
  host.append(el);
  currentToast = el;
  setTimeout(() => el.remove(), duration ?? (action ? 6000 : 4000));
}

// Redessine à chaque changement de données, mais jamais pendant qu'un doigt
// est posé sur l'écran (cartes de « Mes listes », éléments d'une liste) :
// rien ne change de place sous le doigt. Le dessin attendu est fait juste
// après (le temps que l'appui ouvre ce qui a été touché). Renvoie
// { request, stop }.
export function drawWhenIdle(container, draw) {
  let touching = false;
  let waiting = false;
  let timer = null;
  const start = () => { touching = true; };
  const end = () => {
    touching = false;
    if (!waiting) return;
    waiting = false;
    timer = setTimeout(draw, 250);
  };
  container.addEventListener('pointerdown', start);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  return {
    request: () => {
      if (touching) waiting = true;
      else draw();
    },
    stop: () => {
      clearTimeout(timer);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    },
  };
}

// --- Indicateur de synchronisation ---
// Trois états : à jour, synchronisation en cours, hors ligne (pas de réseau,
// ou serveur qui ne répond pas). Toujours une icône ET un texte (jamais la
// couleur seule).

const SYNC = {
  ok: { className: 'sync--ok', icon: 'cloud-ok', text: () => 'À jour' },
  busy: { className: 'sync--busy', icon: 'sync', text: () => 'Synchronisation…' },
  off: {
    className: 'sync--off',
    icon: 'cloud-off',
    text: () => (pendingCount ? `Hors ligne · ${pendingCount} en attente` : 'Hors ligne'),
  },
};
let syncState = 'ok';
// Modifications en attente d'envoi, données par la file d'attente hors
// ligne (« Hors ligne · 3 en attente »)
let pendingCount = 0;
export function setPendingCount(count) {
  pendingCount = count;
  setSyncState(syncState);
}
const syncPills = new Set();

export function setSyncState(state) {
  syncState = state;
  for (const pill of [...syncPills]) {
    if (!pill.isConnected) syncPills.delete(pill);
    else paintPill(pill);
  }
}

// Dessine la pastille : icône + texte (+ le nombre en attente, montré
// seulement quand la pastille est réduite). Rien n'est redessiné si l'état
// affiché n'a pas changé : la zone aria-live n'annonce qu'un vrai changement,
// une seule fois. Pastille-bouton : son nom dit l'état ET l'action
// (« À jour, synchroniser maintenant »).
function paintPill(pill) {
  const info = SYNC[syncState];
  const text = info.text();
  const painted = `${syncState}|${text}`;
  if (pill.dataset.painted !== painted) {
    pill.dataset.painted = painted;
    pill.className = `sync ${info.className}`;
    replace(pill, icon(info.icon, 'icon--sm'), h('span', { class: 'sync__text' }, text),
      syncState === 'off' && pendingCount ? h('span', { class: 'sync__count', 'aria-hidden': 'true' }, String(pendingCount)) : null);
    if (pill.tagName === 'BUTTON') pill.setAttribute('aria-label', `${text}, synchroniser maintenant`);
  }
  fitPill(pill);
}

// Pastille dans une barre du haut : si son texte ne tient pas dans la place
// laissée par le titre et les boutons, elle se réduit à l'icône (et au
// nombre en attente). Le texte reste lu par les lecteurs d'écran (masqué
// visuellement seulement) : jamais un mot coupé, jamais de retour à la
// ligne, jamais un bouton poussé hors de l'écran.
function fitPill(pill) {
  const slot = pill.parentElement;
  if (!pill.dataset.fit || !slot || !pill.isConnected) return;
  pill.classList.remove('sync--compact');
  slot.style.minWidth = '';
  if (pill.scrollWidth > slot.clientWidth + 0.5) {
    pill.classList.add('sync--compact');
    slot.style.minWidth = `${pill.offsetWidth}px`;
  }
}

// Pastille d'état. Si onRefresh est donné, c'est un vrai bouton (annoncé
// comme tel, « À jour, synchroniser maintenant ») : un appui relance une
// synchronisation. Sinon, un simple texte d'état (role="status"). Dans les
// deux cas, un changement d'état est annoncé (aria-live).
// inBar : pastille posée dans une barre du haut (entre le titre et les
// boutons) ; renvoie alors l'emplacement qui la contient, et la pastille se
// réduit à l'icône quand la place manque (voir fitPill).
export function syncPill(onRefresh, { inBar = false } = {}) {
  const pill = onRefresh
    ? h('button', { type: 'button', 'aria-live': 'polite', onClick: onRefresh })
    : h('p', { role: 'status', 'aria-live': 'polite' });
  syncPills.add(pill);
  if (!inBar) {
    paintPill(pill);
    return pill;
  }
  pill.dataset.fit = '1';
  const slot = h('div', { class: 'topbar__status' }, pill);
  // La place change avec la largeur de l'écran ou la taille du texte
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitPill(pill)).observe(slot);
  paintPill(pill);
  return slot;
}
