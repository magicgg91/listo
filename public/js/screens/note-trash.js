// Corbeille des notes (#/reglages/corbeille-notes, dans Réglages juste sous
// la corbeille des listes depuis le 23 novembre 2026 ; étape 2 du cadrage).
// L'ancienne adresse #/notes/corbeille y mène encore.
//
// Mes notes supprimées depuis moins de 30 jours (le serveur n'envoie que
// les miennes : jamais celles des autres, pas même à l'Admin), la plus
// récente en haut. Même écran que la corbeille des listes (morceaux
// communs : trash-parts.js) : nombre et « Vider la corbeille » en haut
// (confirmation avec le nombre) ; chaque ligne : titre, « Supprimer
// définitivement » (confirmation) et « Restaurer », puis « Partagée avec
// 2 personnes » si elle l'est et « Supprimée le 21 nov. · encore 28 jours ».
// Tout passe par la copie locale et la file d'attente : hors ligne compris.

import { h, replace } from '../dom.js';
import { app, onDataChange } from '../app.js';
import { toast, confirmDialog, drawWhenIdle } from '../ui.js';
import { trashDaysLeft } from '../notes.js';
import * as actions from '../actions.js';
import { t } from '../i18n.js';
import { trashed, titleOf } from './notes.js';
import { trashScreen, trashRow, deletedText, trashEmpty, purgeQuestion, emptyQuestion } from './trash-parts.js';

export function renderNoteTrash(onLeave) {
  async function emptyTrash() {
    const ids = trashed().map((note) => note.id);
    if (!ids.length) return;
    if (await confirmDialog(emptyQuestion(t('notes.corbeille.vider.texte', { count: ids.length })))) actions.purgeNotes(ids);
  }

  async function purgeOne(note) {
    if (await confirmDialog(purgeQuestion(titleOf(note), t('notes.corbeille.definitif.texte')))) actions.purgeNotes([note.id]);
  }

  async function restore(note) {
    await actions.restoreNote(note.id);
    toast(t('notes.corbeille.restauree', { name: titleOf(note) }));
  }

  // Nombre de personnes avec qui la note est partagée (sans moi)
  const shared = (note) => (note.members ?? []).filter((m) => !m.isOwner).length;

  // Une ligne ; partagée : restaurée, elle revient aussi pour ces personnes
  const row = (note) => trashRow({
    name: titleOf(note),
    meta: [
      shared(note) ? t('notes.corbeille.partagee', { count: shared(note) }) : null,
      deletedText(note.deletedAt, trashDaysLeft(note.deletedAt)),
    ],
    restoreLabel: t('notes.corbeille.restaurer.label', { name: titleOf(note) }),
    onPurge: () => purgeOne(note),
    onRestore: () => restore(note),
  });

  const view = trashScreen({ title: t('notes.corbeille.titre'), intro: t('notes.corbeille.intro'), onEmpty: () => emptyTrash() });

  const draw = () => {
    const notes = app.data.loaded ? trashed() : [];
    view.tools.hidden = notes.length === 0;
    view.count.textContent = t('notes.nombre', { count: notes.length });
    if (!notes.length) {
      replace(view.content, trashEmpty('trash', t('notes.corbeille.vide.titre'), t('notes.corbeille.vide.texte')));
      return;
    }
    replace(view.content, h('div', { class: 'group' }, notes.map(row)));
  };
  const idle = drawWhenIdle(view.body, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  return view.screen;
}
