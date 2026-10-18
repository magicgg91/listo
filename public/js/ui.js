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

// Champ de saisie de texte (le clavier du téléphone s'ouvre s'il reçoit le
// focus). Listo ne met jamais le curseur dans un tel champ de lui-même : le
// clavier ne s'ouvre que quand on touche le champ.
export function isTextField(element) {
  if (!element?.matches) return false;
  if (element.isContentEditable || element.matches('textarea')) return true;
  return element.matches('input') && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image', 'hidden'].includes(element.type);
}

// Éléments qu'on peut atteindre avec la touche Tab dans une fenêtre
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Ouvre une fenêtre superposée (fond grisé + contenu). Gère le bouton Retour
// du téléphone, la touche Échap, la touche Tab (le focus reste dans la
// fenêtre) et le retour du focus clavier à la fermeture.
function overlay(build, { label, role = 'dialog', onClose } = {}) {
  const opener = document.activeElement;
  const scrim = h('div', { class: 'scrim' });
  let closeViaRouter = null;
  let closed = false;

  // Fermeture effective (appelée une seule fois)
  const remove = () => {
    if (closed) return;
    closed = true;
    scrim.remove();
    panel.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
    // Retour du focus à l'élément d'origine (bouton, ligne…), sauf si c'était
    // un champ de saisie : le clavier se rouvrirait tout seul
    if (opener?.isConnected && !isTextField(opener)) opener.focus();
  };
  const close = () => (closeViaRouter ? closeViaRouter() : remove());
  const onKey = (event) => {
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
  scrim.addEventListener('click', close);
  host.append(scrim, panel);
  document.addEventListener('keydown', onKey);
  closeViaRouter = openOverlay(remove);

  // Focus sur le bouton de départ de la fenêtre (data-initial-focus, jamais
  // un champ de saisie), sinon sur la fenêtre elle-même : les lecteurs
  // d'écran annoncent son titre, et aucun clavier ne s'ouvre
  panel.setAttribute('tabindex', '-1');
  const start = panel.querySelector('[data-initial-focus]');
  if (start && !isTextField(start)) start.focus();
  else panel.focus();
  return { close, panel };
}

// Feuille qui monte du bas (édition d'article, choix du rayon…).
// content : éléments à afficher sous le titre.
// scroll : la feuille défile si son contenu est haut (feuille Article avec photo).
export function openSheet({ title, sub, content, onClose, scroll = false }) {
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  return overlay((close) => h('div', { class: `sheet${scroll ? ' sheet--scroll' : ''}`, 'aria-labelledby': titleId },
    h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet__head' },
      h('div', {}, h('h2', { class: 'sheet__title', id: titleId }, title), sub ? h('p', { class: 'sheet__sub' }, sub) : null),
      iconButton('close', 'Fermer', close)),
    content,
  ), { onClose });
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
    h('div', { class: 'lightbox__foot' }, h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: close }, 'Fermer'))));
}

// Boîte de confirmation. Renvoie une promesse : true si l'action est confirmée.
export function confirmDialog({ title, text, confirmLabel, cancelLabel = 'Annuler', danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const { close } = overlay((closeFn) => h('div', { class: 'dialog', 'aria-labelledby': titleId },
      h('h2', { class: 'dialog__title', id: titleId }, title),
      h('p', { class: 'dialog__text' }, text),
      h('div', { class: 'dialog__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: closeFn }, cancelLabel),
        h('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
          type: 'button',
          'data-initial-focus': true, // bouton principal : focus à l'ouverture
          onClick: () => {
            answer = true;
            closeFn();
          },
        }, confirmLabel)),
    ), { role: 'alertdialog', onClose: () => resolve(answer) });
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
    });
  });
}

// Menu « ⋮ » : items = [{ icon, label, danger, onSelect }]
export function openMenu(items, { label = 'Menu' } = {}) {
  let closeMenu;
  const { close } = overlay((close) => {
    closeMenu = close;
    return h('div', { class: 'menu' },
      items.map((item) => h('button', {
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
      }, icon(item.icon), h('span', { class: 'grow' }, item.label), item.checked ? icon('check', 'icon--check') : null)));
  }, { role: 'menu', label });
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

function paintPill(pill) {
  const info = SYNC[syncState];
  pill.className = `sync ${info.className}`;
  replace(pill, icon(info.icon, 'icon--sm'), info.text());
}

// Pastille d'état. Si onRefresh est donné, un appui lance une actualisation.
export function syncPill(onRefresh) {
  const pill = onRefresh
    ? h('button', { type: 'button', role: 'status', 'aria-live': 'polite', title: 'Actualiser', onClick: onRefresh })
    : h('p', { role: 'status', 'aria-live': 'polite' });
  syncPills.add(pill);
  paintPill(pill);
  return pill;
}
