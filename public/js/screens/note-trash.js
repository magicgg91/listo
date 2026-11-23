// Corbeille des notes (#/notes/corbeille ; étape 2 du cadrage, maquette
// design/accueil-notes/notes-3), ouverte par le bouton poubelle de l'écran
// Notes (et non depuis les Réglages, comme celle des listes).
//
// Mes notes supprimées depuis moins de 30 jours (le serveur n'envoie que
// les miennes : jamais celles des autres, pas même à l'Admin), la plus
// récente en haut : titre, « Supprimée le … · encore N jours »,
// « Supprimer définitivement » (confirmation) et « Restaurer » ; en haut,
// « Vider la corbeille » (confirmation avec le nombre). Tout passe par la
// copie locale et la file d'attente : hors ligne compris.

import { h, icon, iconButton, replace } from '../dom.js';
import { goBack } from '../router.js';
import { app, onDataChange, isDesktop } from '../app.js';
import { toast, confirmDialog, drawWhenIdle } from '../ui.js';
import { trashDaysLeft } from '../notes.js';
import * as actions from '../actions.js';
import { t, formatDate } from '../i18n.js';
import { trashed, titleOf } from './notes.js';

export function renderNoteTrash(onLeave) {
  const count = h('span', { class: 'page-tools__count' });
  const emptyButton = h('button', { class: 'cart__action cart__action--danger', type: 'button', onClick: () => emptyTrash() }, icon('trash', 'icon--sm'), t('notes.corbeille.vider'));
  const tools = h('div', { class: 'page-tools' }, count, emptyButton);
  const list = h('div', {});

  async function emptyTrash() {
    const ids = trashed().map((note) => note.id);
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: t('notes.corbeille.vider.question'),
      text: t('notes.corbeille.vider.texte', { count: ids.length }),
      confirmLabel: t('notes.corbeille.vider.confirmer'),
      focusCancel: true,
    });
    if (ok) actions.purgeNotes(ids);
  }

  async function purgeOne(note) {
    const ok = await confirmDialog({
      title: t('notes.corbeille.definitif.question', { name: titleOf(note) }),
      text: t('notes.corbeille.definitif.texte'),
      confirmLabel: t('notes.corbeille.definitif'),
      focusCancel: true,
    });
    if (ok) actions.purgeNotes([note.id]);
  }

  async function restore(note) {
    await actions.restoreNote(note.id);
    toast(t('notes.corbeille.restauree', { name: titleOf(note) }));
  }

  // Une ligne : titre, date de suppression et jours restants, actions
  const row = (note) => {
    const name = titleOf(note);
    const date = formatDate(new Date(note.deletedAt), { day: 'numeric', month: 'long' });
    return h('div', { class: 'note-trash' },
      h('div', { class: 'note-trash__body' },
        h('span', { class: 'note-trash__title' }, name),
        h('span', { class: 'note-trash__when' }, t('notes.corbeille.ligne', { date, count: trashDaysLeft(note.deletedAt) }))),
      h('div', { class: 'note-trash__actions' },
        h('button', { class: 'cart__action cart__action--danger', type: 'button', 'aria-label': t('notes.corbeille.definitif.label', { name }), onClick: () => purgeOne(note) }, t('notes.corbeille.definitif')),
        h('button', { class: 'btn btn--sm btn--secondary', type: 'button', 'aria-label': t('notes.corbeille.restaurer.label', { name }), onClick: () => restore(note) }, t('notes.corbeille.restaurer'))));
  };

  const draw = () => {
    const notes = app.data.loaded ? trashed() : [];
    tools.hidden = notes.length === 0;
    count.textContent = t('notes.nombre', { count: notes.length });
    if (!notes.length) {
      replace(list, h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon('trash', 'icon--lg')),
        h('h2', { class: 'empty__title' }, t('notes.corbeille.vide.titre')),
        h('p', { class: 'empty__text' }, t('notes.corbeille.vide.texte'))));
      return;
    }
    replace(list, h('div', { class: 'group' }, notes.map(row)));
  };
  const body = h('div', { class: 'body body--flush' }, h('p', { class: 'page-intro' }, t('notes.corbeille.intro')), tools, list);
  const idle = drawWhenIdle(body, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();

  const title = h('h1', { class: isDesktop() ? 'pc-head__title' : 'topbar__title' }, t('notes.corbeille.titre'));
  if (isDesktop()) {
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' }, iconButton('chev-l', t('notes.retour'), () => goBack('notes')), h('div', { class: 'pc-head__main' }, title)),
      body);
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('notes.retour'), () => goBack('notes')),
      h('div', { class: 'topbar__main' }, title)),
    body);
}
