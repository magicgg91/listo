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

// Ouvre une fenêtre superposée (fond grisé + contenu). Gère le bouton Retour
// du téléphone, la touche Échap et le retour du focus clavier.
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
    if (opener?.isConnected) opener.focus();
  };
  const close = () => (closeViaRouter ? closeViaRouter() : remove());
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };

  const panel = build(close);
  panel.setAttribute('role', role);
  panel.setAttribute('aria-modal', 'true');
  if (label) panel.setAttribute('aria-label', label);
  scrim.addEventListener('click', close);
  host.append(scrim, panel);
  document.addEventListener('keydown', onKey);
  closeViaRouter = openOverlay(remove);

  // Focus sur le premier champ, sinon sur la fenêtre elle-même
  const first = panel.querySelector('input, textarea, [autofocus]');
  if (first) first.focus();
  else {
    panel.setAttribute('tabindex', '-1');
    panel.focus();
  }
  return { close, panel };
}

// Feuille qui monte du bas (édition d'article, choix du rayon…).
// content : éléments à afficher sous le titre.
export function openSheet({ title, sub, content, onClose }) {
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  return overlay((close) => h('div', { class: 'sheet', 'aria-labelledby': titleId },
    h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet__head' },
      h('div', {}, h('h2', { class: 'sheet__title', id: titleId }, title), sub ? h('p', { class: 'sheet__sub' }, sub) : null),
      iconButton('close', 'Fermer', close)),
    content,
  ), { onClose });
}

// Boîte de confirmation. Renvoie une promesse : true si l'action est confirmée.
export function confirmDialog({ title, text, confirmLabel, danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const { close } = overlay((closeFn) => h('div', { class: 'dialog', 'aria-labelledby': titleId },
      h('h2', { class: 'dialog__title', id: titleId }, title),
      h('p', { class: 'dialog__text' }, text),
      h('div', { class: 'dialog__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: closeFn }, 'Annuler'),
        h('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
          type: 'button',
          autofocus: true,
          onClick: () => {
            answer = true;
            closeFn();
          },
        }, confirmLabel)),
    ), { role: 'alertdialog', onClose: () => resolve(answer) });
    void close;
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
        role: 'menuitem',
        onClick: () => {
          closeMenu();
          // L'action est lancée après la fermeture du menu (elle peut ouvrir
          // une autre fenêtre ou changer d'écran)
          setTimeout(() => item.onSelect(), 0);
        },
      }, icon(item.icon), item.label)));
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

// --- Indicateur de synchronisation ---
// Trois états : à jour, synchronisation en cours, hors ligne. Toujours une
// icône ET un texte (jamais la couleur seule).

const SYNC = {
  ok: { className: 'sync--ok', icon: 'cloud-ok', text: 'À jour' },
  busy: { className: 'sync--busy', icon: 'sync', text: 'Synchronisation…' },
  off: { className: 'sync--off', icon: 'cloud-off', text: 'Hors ligne' },
};
let syncState = 'ok';
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
  replace(pill, icon(info.icon, 'icon--sm'), info.text);
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
