// Onglet « Notes » de la Corbeille (Réglages › Corbeille,
// #/reglages/corbeille/notes, depuis le 24 novembre 2026 ; la page et ses
// onglets : trash-page.js). Les anciennes adresses #/reglages/corbeille-notes
// et #/notes/corbeille y mènent encore.
//
// Mes notes supprimées depuis moins de 30 jours (le serveur n'envoie que
// les miennes : jamais celles des autres, pas même à l'Admin), la plus
// récente en haut. Même contenu que l'onglet « Listes » (morceaux
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
import { trashPanel, trashRow, deletedText, trashEmpty, purgeQuestion, emptyQuestion } from './trash-parts.js';

// Contenu de l'onglet : renvoie { panel, count } ; count() donne le nombre
// de notes de la corbeille (null tant que la copie locale n'est pas
// chargée). onCount() est appelé à chaque dessin : la page met à jour ses
// onglets.
export function noteTrash(onLeave, onCount = () => {}) {
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

  const view = trashPanel({ intro: t('notes.corbeille.intro'), onEmpty: () => emptyTrash() });

  const draw = () => {
    const notes = app.data.loaded ? trashed() : [];
    view.tools.hidden = notes.length === 0;
    view.count.textContent = t('notes.nombre', { count: notes.length });
    if (!notes.length) replace(view.content, trashEmpty('trash', t('notes.corbeille.vide.titre'), t('notes.corbeille.vide.texte')));
    else replace(view.content, h('div', { class: 'group' }, notes.map(row)));
    onCount();
  };
  const idle = drawWhenIdle(view.panel, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  return { panel: view.panel, count: () => (app.data.loaded ? trashed().length : null) };
}
