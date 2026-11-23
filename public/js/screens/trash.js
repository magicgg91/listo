// Écran « Corbeille des listes » (#/reglages/corbeille), ouvert depuis
// Réglages. Chaque personne y voit SEULEMENT ses propres listes supprimées
// (celles dont elle est propriétaire), pendant 30 jours ; le serveur
// (GET /api/lists/deleted) ne renvoie rien d'autre, pas même à l'Admin.
// Même écran que la corbeille des notes (morceaux communs :
// trash-parts.js) : nombre de listes et « Vider la corbeille » en haut ;
// chaque ligne : nom de la liste, « Supprimer définitivement » et
// « Restaurer », puis « Courses · 9 articles » et « Supprimée le 21 nov. ·
// encore 28 jours ».
// Restaurer (POST /api/lists/:id/restore) et supprimer définitivement
// (POST /api/lists/:id/purge, ou /api/lists/deleted/purge pour « Vider la
// corbeille ») demandent du réseau : hors ligne, les boutons sont inactifs
// et une phrase l'explique. Après la restauration, une synchronisation
// remet la liste dans la copie locale et un message « Liste restaurée »
// propose « Ouvrir ». La suppression définitive (confirmée) efface la liste
// comme le nettoyage automatique des 30 jours : rien ne revient ensuite.
// Composants du kit (.group, .btn, .empty, .note) ; textes posés avec
// textContent (h()) ; aucun curseur mis tout seul.

import { h, icon, replace } from '../dom.js';
import { get, post, errorMessage } from '../api.js';
import { refreshData } from '../app.js';
import { navigate } from '../router.js';
import { toast, confirmDialog } from '../ui.js';
import { TYPE_LABELS } from '../list-types.js';
import { countItems } from '../words.js';
import { t } from '../i18n.js';
import { trashScreen, trashRow, deletedText, trashEmpty, purgeQuestion, emptyQuestion } from './trash-parts.js';

export const offlineRestore = () => t('corbeille.horsLigne.restaurer');

// « Vider la corbeille » : au plus tant de listes par demande (comme le serveur)
const PURGE_BATCH = 500;

export function renderTrash(onLeave) {
  const offlineNote = h('div', { class: 'note note-banner', role: 'status', hidden: true }, icon('cloud-off'), h('p', { class: 'note-banner__text' }, offlineRestore()));
  let lists = [];
  let busy = false;
  const view = trashScreen({ title: t('corbeille.titre'), intro: t('corbeille.intro'), banner: offlineNote, onEmpty: () => emptyTrash() });
  replace(view.content, h('p', { class: 'page-intro' }, t('corbeille.chargement')));

  // Boutons (Restaurer, Supprimer définitivement, Vider la corbeille) :
  // inactifs hors ligne ou pendant une demande
  const paintOnline = () => {
    const online = navigator.onLine;
    offlineNote.hidden = online;
    for (const button of view.screen.querySelectorAll('button[data-trash-action]')) button.disabled = !online || busy;
  };

  // Une demande au serveur, une seule à la fois ; en cas d'échec, le message
  // et l'écran remis à jour (la liste a pu être effacée entre-temps)
  async function send(work) {
    if (!navigator.onLine || busy) return;
    busy = true;
    paintOnline();
    try {
      await work();
      busy = false;
      paint();
    } catch (err) {
      busy = false;
      paintOnline();
      toast(errorMessage(err));
      load();
    }
  }

  const restore = (list) => send(async () => {
    await post(`/api/lists/${encodeURIComponent(list.id)}/restore`);
    await refreshData({ quiet: true }); // la liste revient dans la copie locale
    lists = lists.filter((l) => l.id !== list.id);
    toast(t('corbeille.restauree', { name: list.name }), { action: t('corbeille.ouvrir'), onAction: () => navigate('list', { id: list.id }) });
  });

  async function purgeOne(list) {
    if (!navigator.onLine || busy) return;
    if (!await confirmDialog(purgeQuestion(list.name, t('corbeille.definitif.texte')))) return;
    await send(async () => {
      await post(`/api/lists/${encodeURIComponent(list.id)}/purge`);
      lists = lists.filter((l) => l.id !== list.id);
      toast(t('corbeille.supprimee', { name: list.name }));
    });
  }

  // « Vider la corbeille » : seulement les listes affichées (jamais une
  // liste mise à la corbeille entre-temps sur un autre appareil)
  async function emptyTrash() {
    if (!navigator.onLine || busy || !lists.length) return;
    const ids = lists.map((l) => l.id);
    if (!await confirmDialog(emptyQuestion(t('corbeille.vider.texte', { count: ids.length })))) return;
    await send(async () => {
      let purged = 0;
      for (let i = 0; i < ids.length; i += PURGE_BATCH) {
        purged += (await post('/api/lists/deleted/purge', { ids: ids.slice(i, i + PURGE_BATCH) })).purged;
      }
      lists = [];
      toast(t('corbeille.videe', { count: purged }));
    });
  }

  const row = (list) => trashRow({
    name: list.name,
    meta: [
      t('corbeille.liste', { type: TYPE_LABELS[list.type] ?? '', items: countItems(list.itemCount, { type: list.type }) }),
      deletedText(list.deletedAt, list.daysLeft),
    ],
    restoreLabel: t('corbeille.restaurer.label', { name: list.name }),
    onPurge: () => purgeOne(list),
    onRestore: () => restore(list),
  });

  function paint() {
    view.tools.hidden = lists.length === 0;
    view.count.textContent = t('corbeille.nombre', { count: lists.length });
    replace(view.content, lists.length
      ? h('div', { class: 'group' }, lists.map(row))
      : trashEmpty('trash', t('corbeille.vide.titre'), t('corbeille.vide.texte')));
    paintOnline();
  }

  async function load() {
    try {
      lists = (await get('/api/lists/deleted')).lists;
      paint();
    } catch (err) {
      view.tools.hidden = true;
      replace(view.content, trashEmpty('cloud-off', t('corbeille.horsLigne.titre'), navigator.onLine ? errorMessage(err) : t('corbeille.horsLigne.texte')));
      paintOnline();
    }
  }

  const onOnline = () => (lists.length ? paintOnline() : load());
  const onOffline = () => paintOnline();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  onLeave(() => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  });
  load();

  return view.screen;
}
