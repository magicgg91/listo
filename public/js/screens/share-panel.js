// Partager une liste ou une note (décision du 24 novembre 2026, option
// « B » : un petit choix, puis deux feuilles ; le même parcours pour les
// listes et les notes, sur le téléphone et sur ordinateur).
//
// Le propriétaire, depuis l'entrée « Partager » (menu ⋮ d'une liste ou
// d'une note, menu ⋯ d'une carte, bouton « Partager » de l'en-tête d'une
// liste sur ordinateur, touche P, bouton des personnes de la barre d'une
// note), ouvre le choix « Partager « Maison » » (feuille du bas sur le
// téléphone, petite fenêtre au centre sur ordinateur), avec deux lignes qui
// disent l'état actuel :
// - « Avec des personnes de Listo » (« Léa et Zoé », « Seulement vous ») :
//   la feuille « Partager avec des personnes » (share-picker.js) ; « OK »
//   envoie tout le partage d'un coup (PUT …/members), en ligne seulement,
//   puis ramène au choix, mis à jour. La croix, Échap ou Retour ramènent au
//   choix sans rien changer. Une erreur : le message dans la feuille, rien
//   n'est changé (le serveur fait tout ou rien) ;
// - « Par un lien temporaire » (« Aucun lien », « Lien actif · expire dans
//   6 jours »…) : la feuille du lien public (share.js, linkPart ou
//   noteLinkPart), inchangée.
// Les deux feuilles s'ouvrent par-dessus le choix, qui reste dessous.
//
// Les autres membres, depuis « Personnes », voient seulement qui partage,
// avec le droit de chacun, en lecture : ni choix, ni lien public.
//
// Projets (docs/cadrage-projets.md, 4.6) : un projet n'a pas de lien
// public ; « Partager » ouvre donc directement la feuille des personnes,
// « Partager « DomoPi Articles » », avec la phrase « Avec des personnes de
// Listo seulement… » et le choix du droit à trois options sous chaque
// personne cochée (share-picker.js), puis une phrase par droit. « OK »
// envoie tout d'un coup (PUT /api/projects/:id/members), en ligne
// seulement. Les autres membres ont « Personnes » : qui, et avec quel rôle
// (« Propriétaire », « Peut modifier », « Contributeur », « Lecture seule »).
// Le serveur revérifie tout (server/projects.js setMembers, propriétaire
// seulement).
//
// Droits (inchangés, revérifiés par le serveur à chaque requête) :
// server/lists.js setMembers (propriétaire seulement, destinataire d'une
// liste d'envies jamais retiré, toujours « Peut modifier ») et
// server/notes.js (propriétaire seulement).

import { h, icon, avatar, replace, errorNote } from '../dom.js';
import { put, errorMessage } from '../api.js';
import { app, onDataChange, refreshData, pendingCount } from '../app.js';
import { openSheet, toast } from '../ui.js';
import { isWishList } from '../list-types.js';
import { isNoteOwner } from '../store.js';
import { noteTitle } from '../notes.js';
import { linkPart, noteLinkPart, knownLink } from './share.js';
import { peoplePicker, roleLegend } from './share-picker.js';
import { peopleSummary, linkSummary, membersChanged } from '../sharing.js';
import { t, compareText } from '../i18n.js';

// Ce qui est partagé : une liste…
function listSubject(listId) {
  return {
    current: () => app.data.lists.get(listId) ?? null,
    owner: (list) => Boolean(list.isOwner),
    name: (list) => list.name,
    // Destinataire d'une liste d'envies (un compte) : membre d'office
    beneficiaryId: (list) => (isWishList(list) ? list.forUserId ?? null : null),
    note: false,
    url: `/api/lists/${encodeURIComponent(listId)}/members`,
    link: (list, close) => linkPart(list, close),
    linkKey: listId,
    hint: (list) => (isWishList(list) ? t('partage.choix.aide.envies') : t('partage.choix.aide.liste')),
  };
}

// … ou une note (une note dans la corbeille ne se partage pas)
function noteSubject(noteId) {
  return {
    current: () => {
      const note = app.data.notes.get(noteId);
      return note && !note.deletedAt ? note : null;
    },
    owner: (note) => isNoteOwner(note),
    name: (note) => noteTitle(note) || t('notes.sansTitre'),
    beneficiaryId: () => null,
    note: true,
    url: `/api/notes/${encodeURIComponent(noteId)}/members`,
    link: (note, close) => noteLinkPart(note, close),
    linkKey: `note:${noteId}`,
    hint: () => t('partage.choix.aide.note'),
  };
}

// … ou un projet (pas de lien public ; quatre rôles). Ses personnes, dans
// la forme des listes et des notes : isOwner, et le droit de chacun
const ACCESS_OF_ROLE = { editor: 'modification', contributor: 'contribution', reader: 'lecture' };
const ROLE_TEXTS = { owner: 'projets.role.proprietaire', editor: 'projets.role.modifier', contributor: 'projets.role.contributeur', reader: 'projets.role.lecture' };
function projectSubject(projectId) {
  const current = () => {
    const project = app.data.projects.get(projectId);
    return project && !project.deletedAt ? project : null;
  };
  return {
    current: () => {
      const project = current();
      if (!project) return null;
      const members = (project.members ?? []).map((m) => ({ ...m, isOwner: m.role === 'owner', access: ACCESS_OF_ROLE[m.role] ?? null }));
      return { ...project, members };
    },
    owner: (project) => project.role === 'owner',
    name: (project) => project.name,
    beneficiaryId: () => null,
    note: false,
    project: true,
    url: `/api/projects/${encodeURIComponent(projectId)}/members`,
    // Titre de la feuille et phrase d'introduction (pas de choix « lien »)
    sheetTitle: (project) => t('partage.projet.titre', { name: project.name }),
    intro: () => t('partage.projet.intro'),
    level: (person) => t(ROLE_TEXTS[person.role] ?? ROLE_TEXTS.reader),
  };
}

// Point d'entrée : le choix pour le propriétaire, « Personnes » pour les autres
export const openListShare = (listId) => openShare(listSubject(listId));
export const openNoteShare = (noteId) => openShare(noteSubject(noteId));
// Projet : la feuille des personnes directement (propriétaire), sinon « Personnes »
export function openProjectShare(projectId) {
  const subject = projectSubject(projectId);
  const item = subject.current();
  if (!item) return null;
  return subject.owner(item) ? openPeopleSheet(subject) : openPeopleView(subject);
}

function openShare(subject) {
  const item = subject.current();
  if (!item) return null;
  return subject.owner(item) ? openChooser(subject) : openPeopleView(subject);
}

// --- Le choix « Partager « Maison » » (propriétaire) ---
function openChooser(subject) {
  const start = subject.current();
  const peopleSub = h('span', { class: 'row__sub' });
  const linkSub = h('span', { class: 'row__sub' });
  const row = (iconName, title, sub, onClick) => h('button', { class: 'row share-choice__row', type: 'button', 'aria-haspopup': 'dialog', onClick },
    h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(iconName)),
    h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, title), sub),
    icon('chev-r'));
  const hint = h('p', { class: 'share-choice__hint' });

  function paint() {
    const item = subject.current();
    if (!item || !subject.owner(item)) {
      sheet.close(); // supprimée, ou plus à moi
      return;
    }
    peopleSub.textContent = peopleSummary(item.members, app.user.id);
    // Mot de passe : seulement s'il est connu (feuille du lien ouverte
    // pendant cette visite) et pour ce même lien (même expiration) ; le
    // serveur ne l'envoie pas avec la liste
    const known = knownLink(subject.linkKey);
    const sameLink = Boolean(known && item.publicLink && known.expiresAt === item.publicLink.expiresAt);
    const link = linkSummary(item.publicLink ?? null, { isProtected: sameLink && Boolean(known.protected) });
    linkSub.textContent = link.text;
    linkSub.classList.toggle('share-choice__on', link.active);
    hint.textContent = subject.hint(item);
  }

  const stop = onDataChange(() => paint());
  const sheet = openSheet({
    title: t('partage.choix.titre', { name: subject.name(start) }),
    content: [
      h('div', { class: 'group share-choice sheet__keep' },
        // Au retour d'une feuille, le choix est redessiné (mot de passe du lien appris entre-temps)
        row('users', t('partage.choix.personnes'), peopleSub, () => openPeopleSheet(subject, paint)),
        row('link', t('partage.choix.lien'), linkSub, () => openLinkSheet(subject, paint))),
      hint,
    ],
    pc: 'modal',
    size: 'sm',
    onClose: stop,
  });
  paint();
  return sheet;
}

// --- « Partager avec des personnes » (propriétaire) ---
function openPeopleSheet(subject, onClosed) {
  const item = subject.current();
  if (!item) return;
  const picker = peoplePicker({
    me: app.user,
    users: app.data.users ?? [],
    members: item.members,
    beneficiaryId: subject.beneficiaryId(item),
    note: subject.note,
    project: Boolean(subject.project),
  });
  const offlineNote = h('p', { class: 'note', role: 'status', hidden: true }, icon('cloud-off', 'icon--sm'), h('span', {}, t('partage.personnes.horsLigne')));
  const error = errorNote();
  let busy = false;
  const ok = h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => apply() }, t('partage.personnes.ok'));

  // Hors ligne : le partage ne peut pas être changé (il demande le serveur)
  const paintNetwork = () => {
    const offline = !navigator.onLine;
    offlineNote.hidden = !offline;
    picker.element.inert = offline;
    picker.element.classList.toggle('is-off', offline);
    ok.disabled = busy || offline;
  };

  // « OK » : tout le partage d'un coup, seulement s'il a changé
  async function apply() {
    const now = subject.current();
    if (!now || busy) return;
    const payload = picker.payload();
    if (!membersChanged(now.members, payload)) {
      sheet.close();
      return;
    }
    busy = true;
    error.show('');
    paintNetwork();
    try {
      // Ce qui attend dans la file part d'abord (liste ou note créée hors
      // ligne : elle doit exister sur le serveur)
      await refreshData({ quiet: true });
      if (pendingCount() || !navigator.onLine) {
        error.show(t('partage.personnes.horsLigne'));
        return;
      }
      await put(subject.url, payload);
      await refreshData({ quiet: true });
      sheet.close(); // retour au choix, mis à jour
      toast(t('partage.personnes.fait'), { low: true });
    } catch (err) {
      error.show(t('partage.personnes.echec', { message: errorMessage(err) }));
    } finally {
      busy = false;
      paintNetwork();
    }
  }

  // Supprimée, ou plus à moi, pendant que la feuille est ouverte
  const stop = onDataChange(() => {
    const now = subject.current();
    if (!busy && (!now || !subject.owner(now))) sheet.close();
  });
  window.addEventListener('online', paintNetwork);
  window.addEventListener('offline', paintNetwork);
  // Projet (maquette partage-1) : le titre en entier, la phrase dessous,
  // « Annuler » et « OK » en bas, sous la phrase de chaque droit
  if (subject.project) ok.className = 'btn btn--primary';
  const sheet = openSheet({
    title: subject.sheetTitle ? subject.sheetTitle(item) : t('partage.personnes.titre'),
    sub: subject.intro ? subject.intro(item) : subject.name(item),
    tools: subject.project ? null : ok,
    content: [offlineNote, error.note, picker.element, subject.project ? [roleLegend(), h('div', { class: 'dialog__actions share-actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('fenetres.annuler')), ok)] : null],
    scroll: true,
    pc: 'modal',
    size: 'sm',
    onClose: () => {
      stop();
      window.removeEventListener('online', paintNetwork);
      window.removeEventListener('offline', paintNetwork);
      onClosed?.();
    },
  });
  paintNetwork();
}

// --- « Partager par un lien temporaire » (propriétaire) ---
function openLinkSheet(subject, onClosed) {
  const item = subject.current();
  if (!item) return;
  const part = subject.link(item, () => sheet.close());
  const sheet = openSheet({
    title: t('partage.feuille.titre'),
    content: part.body,
    scroll: true,
    pc: 'modal',
    size: 'sm',
    onClose: () => {
      part.dispose();
      onClosed?.();
    },
  });
  part.start();
}

// --- « Personnes » (les autres membres) : qui partage, en lecture ---
const levelLabel = (access) => (access === 'lecture' ? t('partage.vue.lectureSeule') : t('partage.vue.peutModifier'));

function openPeopleView(subject) {
  const start = subject.current();
  const people = h('ul', { class: 'share-view' });
  function draw() {
    const item = subject.current();
    if (!item) {
      sheet.close();
      return;
    }
    const beneficiary = subject.beneficiaryId(item);
    const members = (item.members ?? []).filter((m) => m.active !== false || m.isOwner)
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || compareText(a.displayName, b.displayName, { sensitivity: 'base' }));
    replace(people, members.map((person, index) => h('li', { class: 'share-row' },
      avatar(person.displayName, { second: index > 0 }),
      h('span', { class: 'grow' }, h('span', { class: 'row__title' },
        person.id === app.user.id ? t('partage.personnes.vous', { name: person.displayName }) : person.displayName)),
      person.isOwner ? h('span', { class: 'chip' }, t('partage.personnes.proprietaire'))
        : person.id === beneficiary ? h('span', { class: 'chip' }, t('partage.personnes.destinataire'))
          : h('span', { class: 'pc-meta' }, subject.level ? subject.level(person) : levelLabel(person.access)))));
  }
  const stop = onDataChange(() => draw());
  const sheet = openSheet({
    title: t('partage.vue.titre'),
    sub: subject.name(start),
    content: [people, h('p', { class: 'share-choice__hint' }, subject.project ? t('partage.vue.proprietaireSeul.projet') : t('partage.vue.proprietaireSeul'))],
    scroll: true,
    pc: 'modal',
    size: 'sm',
    onClose: stop,
  });
  draw();
  return sheet;
}
