// Panneau « Partager la liste » de l'ordinateur (design/maquettes/pc-A,
// capture 07) : un tiroir à droite qui réunit les personnes de la liste,
// avec leur droit, et le lien public.
//
// Droits (inchangés, revérifiés par le serveur) :
// - le propriétaire choisit le droit de chaque personne (« Peut modifier »
//   ou « Lecture seule »), retire une personne, en ajoute une parmi les
//   comptes existants (pas d'e-mail : Listo n'a pas d'inscription), et gère
//   le lien public (même contenu que la feuille du téléphone, share.js) ;
// - les autres membres voient seulement la liste « Personnes », en lecture,
//   sans aucun bouton de gestion ni le lien public.
// Le destinataire d'une liste d'envies reste « Peut modifier », sans choix.
// Chaque changement part tout de suite par la même route que le formulaire
// de la liste (PUT /api/lists/:id/members), en ligne seulement.

import { h, icon, iconButton, avatar, replace } from '../dom.js';
import { put, errorMessage } from '../api.js';
import { app, onDataChange, refreshData } from '../app.js';
import { openSheet, toast } from '../ui.js';
import { isWishList } from '../list-types.js';
import { linkPart } from './share.js';

const LEVELS = [['modification', 'Peut modifier'], ['lecture', 'Lecture seule']];
const levelLabel = (access) => (access === 'lecture' ? 'Lecture seule' : 'Peut modifier');
const compare = (a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' });

export function openSharePanel(listId) {
  const current = () => app.data.lists.get(listId);
  const start = current();
  if (!start) return;
  const owner = Boolean(start.isOwner);
  let busy = false;
  const people = h('ul', { class: 'pc-share__people', 'aria-labelledby': 'pc-share-people' });
  const addRow = h('div', { class: 'share-row share-row--add' });
  const offlineNote = h('p', { class: 'note', role: 'status' }, icon('cloud-off', 'icon--sm'), h('span', {}, 'Indisponible hors ligne : reconnectez-vous pour changer le partage.'));

  // Le destinataire d'une liste d'envies : membre d'office, sans choix
  const beneficiary = (list, person) => isWishList(list) && list.forUserId === person.id;

  // Envoie la nouvelle composition du partage (personnes et droits)
  async function send(nextMembers) {
    if (busy) return;
    busy = true;
    draw();
    try {
      const others = nextMembers.filter((m) => !m.isOwner);
      await put(`/api/lists/${encodeURIComponent(listId)}/members`, {
        userIds: others.map((m) => m.id),
        access: Object.fromEntries(others.map((m) => [m.id, m.access ?? 'modification'])),
      });
      await refreshData({ quiet: true });
    } catch (error) {
      toast(`Le partage n'a pas pu être changé : ${errorMessage(error)}`);
    } finally {
      busy = false;
      draw();
    }
  }

  function draw() {
    const list = current();
    if (!list) {
      panel.close();
      return;
    }
    const offline = !navigator.onLine;
    const off = busy || offline;
    const members = list.members.filter((m) => m.active || m.isOwner).sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || compare(a, b));
    replace(people, members.map((person, index) => {
      const me = person.id === app.user.id;
      const name = `${person.displayName}${me ? ' (vous)' : ''}`;
      let right;
      if (person.isOwner) right = h('span', { class: 'chip' }, 'Propriétaire');
      else if (beneficiary(list, person)) right = h('span', { class: 'chip' }, 'Destinataire · Peut modifier');
      else if (!owner) right = h('span', { class: 'pc-meta' }, levelLabel(person.access));
      else {
        const select = h('select', { class: 'input select--sm', 'aria-label': `Droit de ${person.displayName}`, disabled: off },
          LEVELS.map(([value, label]) => h('option', { value, selected: (person.access ?? 'modification') === value }, label)));
        select.addEventListener('change', () => send(members.map((m) => (m.id === person.id ? { ...m, access: select.value } : m))));
        const remove = iconButton('close', `Retirer ${person.displayName}`, () => send(members.filter((m) => m.id !== person.id)));
        remove.disabled = off;
        right = [select, remove];
      }
      return h('li', { class: 'share-row' },
        avatar(person.displayName, { second: index > 0 }),
        h('span', { class: 'grow' }, h('span', { class: 'row__title' }, name)),
        right);
    }));
    // Ajouter une personne : parmi les comptes qui ne sont pas encore membres
    if (owner) {
      const candidates = (app.data.users ?? []).filter((u) => !members.some((m) => m.id === u.id)).sort(compare);
      if (!candidates.length) {
        replace(addRow, h('p', { class: 'pc-meta' }, 'Tous les comptes ont déjà accès à cette liste.'));
      } else {
        const who = h('select', { class: 'input grow', 'aria-label': 'Personne à ajouter', disabled: off },
          candidates.map((u) => h('option', { value: String(u.id) }, u.displayName)));
        const level = h('select', { class: 'input select--sm', 'aria-label': 'Droit de la personne ajoutée', disabled: off },
          LEVELS.map(([value, label]) => h('option', { value, selected: value === 'lecture' }, label)));
        const add = h('button', { class: 'btn btn--primary', type: 'button', disabled: off, onClick: () => {
          const user = candidates.find((u) => String(u.id) === who.value);
          if (user) send([...members, { id: user.id, displayName: user.displayName, access: level.value }]);
        } }, 'Ajouter');
        replace(addRow, who, level, add);
      }
    }
    offlineNote.hidden = !offline || !owner;
  }

  const link = owner ? linkPart(start, () => panel.close()) : null;
  const content = [
    h('h3', { class: 'pc-share__title', id: 'pc-share-people' }, 'Personnes'),
    offlineNote,
    people,
    owner ? addRow : h('p', { class: 'pc-meta' }, 'Seul le propriétaire choisit les personnes, leur droit et le lien public.'),
    link ? [h('h3', { class: 'pc-share__title' }, 'Lien public'), link.body] : null,
  ];
  const stop = onDataChange(() => {
    if (!busy) draw();
  });
  const onNetwork = () => draw();
  window.addEventListener('online', onNetwork);
  window.addEventListener('offline', onNetwork);
  const panel = openSheet({
    title: owner ? 'Partager la liste' : 'Personnes',
    sub: start.name,
    content,
    pc: 'drawer',
    footer: [h('span', { class: 'grow' }), h('button', { class: 'btn btn--primary', type: 'button', onClick: () => panel.close() }, 'Terminé')],
    onClose: () => {
      stop();
      link?.dispose();
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
    },
  });
  draw();
  link?.start();
  return panel;
}
