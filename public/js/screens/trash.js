// Écran « Corbeille des listes » (#/reglages/corbeille), ouvert depuis
// Réglages. Chaque personne y voit SEULEMENT ses propres listes supprimées
// (celles dont elle est propriétaire), pendant 30 jours ; le serveur
// (GET /api/lists/deleted) ne renvoie rien d'autre, pas même à l'Admin.
// Chaque ligne : icône et nom de la liste, type, nombre d'éléments, date de
// suppression, « Suppression définitive dans N jours », bouton « Restaurer »
// (44 px). Restaurer demande du réseau (POST /api/lists/:id/restore) : hors
// ligne, les boutons sont inactifs et une phrase l'explique. Après la
// restauration, une synchronisation remet la liste dans la copie locale et
// un message « Liste restaurée » propose « Ouvrir ».
// Il n'y a pas de suppression définitive à la main : seul le nettoyage
// automatique, au bout de 30 jours, efface une liste.
// Composants du kit (.group, .row, .btn, .empty, .note) ; textes posés avec
// textContent (h()) ; aucun curseur mis tout seul.

import { h, icon, replace } from '../dom.js';
import { get, post, errorMessage } from '../api.js';
import { refreshData } from '../app.js';
import { navigate, goBack } from '../router.js';
import { toast } from '../ui.js';
import { topbar } from './settings.js';
import { TYPE_LABELS, TYPE_ICONS } from '../list-types.js';
import { countItems, trashDaysText } from '../words.js';

export const OFFLINE_RESTORE = 'Restaurer une liste demande une connexion. Les boutons reviendront avec le réseau.';

// Date de suppression : « 3 nov. 2026 »
const dayLabel = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export function renderTrash(onLeave) {
  const offlineNote = h('div', { class: 'note', role: 'status', hidden: true }, icon('cloud-off'), h('p', {}, OFFLINE_RESTORE));
  const panel = h('div', {}, h('p', { class: 'muted' }, 'Chargement…'));
  let lists = [];
  let busy = false;

  // Boutons « Restaurer » : inactifs hors ligne ou pendant une restauration
  const paintOnline = () => {
    const online = navigator.onLine;
    offlineNote.hidden = online;
    for (const button of panel.querySelectorAll('button[data-restore]')) button.disabled = !online || busy;
  };

  async function restore(list) {
    if (!navigator.onLine || busy) return;
    busy = true;
    paintOnline();
    try {
      await post(`/api/lists/${encodeURIComponent(list.id)}/restore`);
      await refreshData({ quiet: true }); // la liste revient dans la copie locale
      lists = lists.filter((l) => l.id !== list.id);
      busy = false;
      paint();
      toast(`Liste « ${list.name} » restaurée`, { action: 'Ouvrir', onAction: () => navigate('list', { id: list.id }) });
    } catch (err) {
      busy = false;
      paintOnline();
      toast(errorMessage(err));
      load(); // la liste a pu être effacée entre-temps : l'écran se remet à jour
    }
  }

  function line(list) {
    const label = `Restaurer la liste « ${list.name} »`;
    const button = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'data-restore': list.id, 'aria-label': label, onClick: () => restore(list) },
      icon('reset', 'icon--sm'), 'Restaurer');
    return h('div', { class: 'row trash__row' },
      h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(list.icon || TYPE_ICONS[list.type] || 'tasks')),
      h('span', { class: 'row__body' },
        h('span', { class: 'row__title' }, list.name),
        h('span', { class: 'row__sub' }, `${TYPE_LABELS[list.type] ?? ''} · ${countItems(list.itemCount, { type: list.type })} · supprimée le ${dayLabel(list.deletedAt)}`),
        h('span', { class: 'row__sub trash__left' }, trashDaysText(list.daysLeft))),
      button);
  }

  function paint() {
    if (!lists.length) {
      replace(panel, h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon('trash', 'icon--lg')),
        h('h2', { class: 'empty__title' }, 'Aucune liste supprimée.'),
        h('p', { class: 'empty__text' }, 'Une liste que vous supprimez reste ici 30 jours : vous pouvez la restaurer pendant ce temps.')));
    } else {
      replace(panel, h('div', { class: 'group' }, lists.map(line)));
    }
    paintOnline();
  }

  async function load() {
    try {
      lists = (await get('/api/lists/deleted')).lists;
      paint();
    } catch (err) {
      replace(panel, h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon('cloud-off', 'icon--lg')),
        h('h2', { class: 'empty__title' }, 'Indisponible hors ligne'),
        h('p', { class: 'empty__text' }, navigator.onLine ? errorMessage(err) : 'La corbeille a besoin du réseau. Elle s\'affichera dès son retour.')));
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

  return h('div', { class: 'screen trash' },
    topbar('Corbeille des listes', () => goBack('settings')),
    h('div', { class: 'body' },
      h('p', { class: 'trash__intro' }, 'Vos listes supprimées restent ici 30 jours, puis elles sont effacées pour de bon. Seul le propriétaire d\'une liste la voit ici et peut la restaurer, avec ses éléments, ses partages et ses réglages.'),
      offlineNote,
      panel));
}
