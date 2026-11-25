// Notes : droits, opérations, partage, synchronisation et nettoyage (étapes
// 2 et 3 du cadrage docs/cadrage-accueil-notes-notifications.md, migrations
// 36 et 37).
//
// Règle d'or, comme pour les listes : chaque opération relit la note dans la
// base et vérifie le droit du compte connecté avec UNE seule fonction,
// noteAccess. Une note inconnue, ou qu'on n'a pas le droit de voir, reçoit
// exactement la même réponse (404 « Note introuvable. »). L'Admin n'a aucun
// droit sur les notes des autres.
//
// Partage (étape 3) : le propriétaire partage sa note avec des comptes
// existants (note_members), en « Peut modifier » (modifier le titre et le
// texte) ou « Lecture seule » (lire, épingler pour soi). Seul le
// propriétaire supprime, restaure, partage et gère le lien public. Chacun,
// sauf le propriétaire, peut quitter la note. Une note dans la corbeille
// n'est visible que par son propriétaire. Une personne qui perd l'accès
// perd aussi son épingle, sa lecture et ses sourdines (note_user_state).
//
// Ce qui est propre à chaque personne (note_user_state), jamais transmis à
// une autre : l'épingle, la dernière version lue (Nouveautés), « Masquer
// les nouveautés de cette note » et « Couper les notifications de cette
// note ». (Catégories des notes : abandonnées le 23 novembre 2026.)
//
// Deux enregistrements faits sur la même version (deux appareils, ou deux
// personnes) : chaque note.update porte la version sur laquelle le texte a
// été écrit (baseVersion). Si la note a changé entre-temps, rien n'est
// écrasé : refus 409 avec la version actuelle (champ « current », avec le
// prénom de la personne qui l'a écrite), et le téléphone propose le choix
// (Garder la mienne, Prendre la leur, Garder les deux). afterOp :
// l'enregistrement précédent de la même note encore en file sur ce
// téléphone ; s'il a été refusé, celui-ci l'est aussi (sinon, écrit sur la
// version prévue par le téléphone, il pourrait passer par-dessus le texte de
// l'autre).
//
// Étiquettes (24 novembre 2026, migration 42, server/labels.js) : communes
// à la note (tous ceux qui la voient les voient), posées par le
// propriétaire et « Peut modifier » (opération « note.labels »). Changer
// les étiquettes est discret : ni nouveauté, ni notification, ni nouvelle
// version du texte (aucun conflit avec un enregistrement du texte) ; seule
// la date de synchronisation (changed_at) change, pour que les membres
// reçoivent la note avec ses étiquettes.
//
// Les dates sont posées ici, par le serveur. Le texte d'une note n'est
// jamais écrit dans un journal.

import { NOTE_TITLE_MAX, NOTE_BODY_MAX, NOTES_MAX, NOTE_TRASH_DAYS } from '../public/js/notes.js';
import { cleanLabelIds, LABELS_PER_NOTE_MAX } from '../public/js/labels.js';
import { createLabelService, LABEL_NOT_FOUND } from './labels.js';

const DAY = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Refus (noms des textes, public/js/i18n/fr/ops.js)
export const NOTE_NOT_FOUND = 'ops.noteIntrouvable';
export const NOTE_CONFLICT = 'ops.noteConflit';

// Opérations de notes qui écrivent un texte : comptées par le plafond de
// débit (createSaveCounter, route POST /api/ops)
export const NOTE_SAVES = ['note.create', 'note.update'];

// Plafond de débit des enregistrements de notes, par compte : count
// enregistrements par fenêtre de windowMs. Le téléphone en envoie au plus un
// par seconde et par note (une seconde après la dernière frappe) ; ce
// plafond large n'arrête qu'un abus. take(compte, n) : faux si le plafond
// serait dépassé (rien n'est compté alors).
export function createSaveCounter({ limit = 3600, windowMs = 60 * 60 * 1000, now = Date.now } = {}) {
  const counts = new Map();
  // Compte en cours de la personne (une nouvelle fenêtre si l'ancienne est finie)
  function current(userId) {
    const time = now();
    let entry = counts.get(userId);
    if (!entry || time - entry.start >= windowMs) {
      entry = { start: time, count: 0 };
      counts.set(userId, entry);
    }
    return entry;
  }
  return {
    // Reste-t-il de la place pour n enregistrements ? (sans rien prendre)
    can(userId, n = 1) {
      return current(userId).count + n <= limit;
    },
    take(userId, n = 1) {
      const entry = current(userId);
      if (entry.count + n > limit) return false;
      entry.count += n;
      return true;
    },
    prune() {
      const time = now();
      for (const [userId, entry] of counts) if (time - entry.start >= windowMs) counts.delete(userId);
    },
  };
}

// Droits proposés au partage, comme pour les listes (note_members.access)
export const NOTE_ACCESS = ['modification', 'lecture'];
// Personnes avec qui une note peut être partagée, au plus (comme une liste)
export const NOTE_MEMBERS_MAX = 50;
// Droit écrit dans le journal de sécurité, toujours en anglais
const JOURNAL_ACCESS = { modification: 'edit', lecture: 'read' };

// Droit d'un compte sur une note : 'owner' (propriétaire : tout), 'edit'
// (« Peut modifier »), 'read' (« Lecture seule ») ou null (aucun : la note
// est traitée comme inconnue). LE seul contrôle, utilisé par toutes les
// opérations, les routes du partage et la synchronisation. note : la ligne
// de la base, avec member_access, le droit de CE compte dans note_members
// (lu par la même requête, voir q.noteFor). Une note dans la corbeille
// n'est visible que par son propriétaire.
export function noteAccess(user, note) {
  if (!user || !note) return null;
  if (note.owner_id === user.id) return 'owner';
  if (note.deleted_at) return null;
  if (note.member_access === 'modification') return 'edit';
  if (note.member_access === 'lecture') return 'read';
  return null;
}

export function createNoteService(ctx, { OpError }) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();
  // Réserve des étiquettes (server/labels.js), créée une fois
  const labels = ctx.labels ?? (ctx.labels = createLabelService(ctx, { OpError }));
  const purgeLimit = () => new Date(ctx.now() - NOTE_TRASH_DAYS * DAY).toISOString();

  const q = {
    // Une note, avec le droit de CE compte dans note_members (member_access)
    noteFor: db.prepare(`SELECT notes.*,
        (SELECT access FROM note_members WHERE note_members.note_id = notes.id AND note_members.user_id = :userId) AS member_access
      FROM notes WHERE notes.id = :noteId`),
    note: db.prepare('SELECT * FROM notes WHERE id = ?'),
    countMine: db.prepare('SELECT COUNT(*) FROM notes WHERE owner_id = ?').pluck(),
    insert: db.prepare(`INSERT INTO notes (id, owner_id, title, body, version, created_at, updated_at, updated_by, changed_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`),
    update: db.prepare('UPDATE notes SET title = ?, body = ?, version = version + 1, updated_at = ?, updated_by = ?, changed_at = ? WHERE id = ?'),
    trash: db.prepare('UPDATE notes SET deleted_at = ?, deleted_by = ?, updated_at = ?, changed_at = ? WHERE id = ?'),
    untrash: db.prepare('UPDATE notes SET deleted_at = NULL, deleted_by = NULL, updated_at = ?, changed_at = ? WHERE id = ?'),
    // Le partage ou le lien public a changé : la note revient dans la
    // synchronisation de ses membres, sans changer sa date de modification
    touch: db.prepare('UPDATE notes SET changed_at = ? WHERE id = ?'),
    erase: db.prepare('DELETE FROM notes WHERE id = ?'),
    setPin: db.prepare(`INSERT INTO note_user_state (note_id, user_id, pinned) VALUES (:noteId, :userId, :pinned)
      ON CONFLICT (note_id, user_id) DO UPDATE SET pinned = :pinned`),
    // Dernière version lue : ne fait que monter
    setRead: db.prepare(`INSERT INTO note_user_state (note_id, user_id, last_read_version) VALUES (:noteId, :userId, :version)
      ON CONFLICT (note_id, user_id) DO UPDATE SET last_read_version = MAX(last_read_version, :version)`),
    readOf: db.prepare('SELECT last_read_version FROM note_user_state WHERE note_id = ? AND user_id = ?').pluck(),
    setMutedNews: db.prepare(`INSERT INTO note_user_state (note_id, user_id, muted_news) VALUES (:noteId, :userId, :muted)
      ON CONFLICT (note_id, user_id) DO UPDATE SET muted_news = :muted`),
    mutedNewsOf: db.prepare('SELECT muted_news FROM note_user_state WHERE note_id = ? AND user_id = ?').pluck(),
    dropState: db.prepare('DELETE FROM note_user_state WHERE note_id = ? AND user_id = ?'),
    applied: db.prepare('SELECT user_id, result FROM applied_ops WHERE id = ?'),
    userName: db.prepare('SELECT display_name FROM users WHERE id = ?').pluck(),
    user: db.prepare('SELECT id, username, display_name, active FROM users WHERE id = ?'),
    // Personnes avec qui la note est partagée (sans le propriétaire)
    members: db.prepare(`SELECT users.id, users.username, users.display_name, users.active, note_members.access
      FROM note_members JOIN users ON users.id = note_members.user_id WHERE note_members.note_id = ?`),
    memberIds: db.prepare('SELECT user_id FROM note_members WHERE note_id = ?').pluck(),
    addMember: db.prepare('INSERT INTO note_members (note_id, user_id, access) VALUES (?, ?, ?)'),
    removeMember: db.prepare('DELETE FROM note_members WHERE note_id = ? AND user_id = ?'),
    setAccess: db.prepare('UPDATE note_members SET access = ? WHERE note_id = ? AND user_id = ?'),
    newsEnabled: db.prepare('SELECT news_enabled FROM users WHERE id = ?').pluck(),
  };

  // --- Prévenir les appareils (temps réel), après l'écriture réussie ---
  // Le message ne contient aucune donnée de la note : chaque appareil
  // demande ensuite les changements par /api/sync, droits revérifiés.
  const touched = new Set(); // comptes à prévenir
  const changedFor = (userId) => touched.add(userId);
  // Tous ceux qui voient la note : le propriétaire et les membres
  const changedForNote = (note) => {
    changedFor(note.owner_id);
    for (const id of q.memberIds.all(note.id)) changedFor(id);
  };
  // Notifications « Modifications » (server/notify.js : page Notifications,
  // et téléphone avec LISTO_PUSH), envoyées seulement si l'écriture a réussi
  const pushes = [];
  function flushNotify() {
    if (touched.size) ctx.events?.notifyNotes([...touched]);
    touched.clear();
    for (const push of pushes.splice(0)) ctx.notify?.noteChanged?.(push);
  }
  const clearNotify = () => {
    touched.clear();
    pushes.length = 0;
  };

  // --- Vérification des champs ---

  function requireUuid(value, key = 'ops.identifiantInvalide') {
    if (typeof value !== 'string' || !UUID.test(value)) throw new OpError(400, key);
    return value.toLowerCase();
  }

  // Titre : une ligne (retours à la ligne remplacés par des espaces), 120
  // caractères au plus ; absent : '' (création) ou inchangé (modification)
  function titleOf(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw new OpError(400, 'ops.titreNoteInvalide');
    const title = value.normalize('NFC').replace(/[\r\n]+/g, ' ').trim();
    if (title.length > NOTE_TITLE_MAX) throw new OpError(400, 'ops.titreNoteTropLong', { max: NOTE_TITLE_MAX });
    return title;
  }

  // Texte : gardé tel quel (retours à la ligne compris), 20 000 caractères
  // au plus (413 : trop volumineux)
  function bodyOf(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw new OpError(400, 'ops.texteNoteInvalide');
    const body = value.normalize('NFC').replace(/\r\n?/g, '\n');
    if (body.length > NOTE_BODY_MAX) throw new OpError(413, 'ops.texteNoteTropLong', { max: NOTE_BODY_MAX });
    return body;
  }

  // Note que le compte a le droit de voir (dans la corbeille comprise pour
  // le propriétaire), avec son droit ; sinon 404, comme une note inconnue
  function noteFor(user, noteId) {
    const note = q.noteFor.get({ userId: user.id, noteId: requireUuid(noteId) });
    const access = noteAccess(user, note);
    if (!access) throw new OpError(404, NOTE_NOT_FOUND);
    return { note, access };
  }

  // Note du propriétaire seulement (supprimer, restaurer, partager, lien
  // public) ; un membre reçoit 403
  function ownNote(user, noteId) {
    const found = noteFor(user, noteId);
    if (found.access !== 'owner') throw new OpError(403, 'ops.noteProprietaireSeulement');
    return found.note;
  }

  const setPin = (noteId, userId, pinned) => q.setPin.run({ noteId, userId, pinned: pinned ? 1 : 0 });
  const markRead = (noteId, userId, version) => q.setRead.run({ noteId, userId, version });

  // Personnes de la note, le propriétaire d'abord : ce que les listes
  // envoient de leurs membres (identifiant, prénom, compte actif, droit)
  function membersOf(note) {
    const owner = q.user.get(note.owner_id);
    const people = owner ? [{ id: owner.id, displayName: owner.display_name, active: owner.active === 1, isOwner: true, access: 'modification' }] : [];
    for (const m of q.members.all(note.id)) {
      people.push({ id: m.id, displayName: m.display_name, active: m.active === 1, isOwner: false, access: m.access });
    }
    return people;
  }

  // Ce que le téléphone reçoit d'une note : construit champ par champ.
  // Jamais l'épingle, la lecture ni les sourdines d'une autre personne.
  function describeNote(note, user) {
    const access = noteAccess(user, note);
    return {
      id: note.id,
      title: note.title,
      body: note.body,
      version: note.version,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      updatedBy: note.updated_by ?? null,
      updatedByName: note.updated_by ? q.userName.get(note.updated_by) ?? null : null,
      deletedAt: note.deleted_at ?? null,
      ownerId: note.owner_id,
      access,
      members: membersOf(note),
      // Étiquettes de la note (numéros ; noms et couleurs : la réserve,
      // envoyée à part), les mêmes pour tous ceux qui la voient
      labelIds: labels.idsOfNote(note.id),
      // Lien public en cours ({ expiresAt } ou null) : pour le propriétaire seulement
      ...(access === 'owner' && ctx.noteShares ? { publicLink: ctx.noteShares.badgeFor(note.id) } : {}),
    };
  }

  // Version actuelle d'une note, jointe au refus d'un enregistrement en conflit
  const currentOf = (note) => ({
    version: note.version,
    title: note.title,
    body: note.body,
    updatedAt: note.updated_at,
    updatedBy: note.updated_by ?? null,
    updatedByName: note.updated_by ? q.userName.get(note.updated_by) ?? null : null,
  });

  function conflict(note) {
    const err = new OpError(409, NOTE_CONFLICT);
    err.extra = { current: currentOf(note) };
    return err;
  }

  // --- Les opérations (appliquées par la file de server/lists.js) ---

  const handlers = {
    // Nouvelle note : le créateur en est le propriétaire ; son épingle
    // (facultative) est rangée chez lui
    'note.create'(user, op) {
      const id = requireUuid(op.noteId);
      if (q.note.get(id)) throw new OpError(409, 'ops.noteExisteDeja');
      const title = titleOf(op.title) ?? '';
      const body = bodyOf(op.body) ?? '';
      if (op.pinned !== undefined && typeof op.pinned !== 'boolean') throw new OpError(400, 'ops.epingleInvalide');
      if (q.countMine.get(user.id) >= NOTES_MAX) throw new OpError(400, 'ops.notesLimite', { max: NOTES_MAX });
      const now = nowIso();
      q.insert.run(id, user.id, title, body, now, now, user.id, now);
      if (op.pinned) setPin(id, user.id, true);
      markRead(id, user.id, 1);
      changedFor(user.id);
      // Réponse courte : le texte arrive par la synchronisation (la réponse
      // est gardée 30 jours dans applied_ops, sans le texte de la note)
      return { version: 1 };
    },

    // Enregistrer le titre et le texte (propriétaire ou « Peut modifier » ;
    // « Lecture seule » : 403). Jamais d'écrasement : version différente de
    // baseVersion, ou enregistrement précédent (afterOp) refusé : refus 409
    // avec la version actuelle.
    'note.update'(user, op) {
      const { note, access } = noteFor(user, op.noteId);
      if (access === 'read') throw new OpError(403, 'ops.noteLectureSeule');
      if (!Number.isSafeInteger(op.baseVersion) || op.baseVersion < 1) throw new OpError(400, 'ops.versionNoteInvalide');
      const title = titleOf(op.title);
      const body = bodyOf(op.body);
      if (title === undefined && body === undefined) throw new OpError(400, 'ops.rienAModifier');
      if (op.afterOp !== undefined && op.afterOp !== null) {
        const previous = q.applied.get(requireUuid(op.afterOp, 'ops.identifiantOperationInvalide'));
        if (previous && previous.user_id === user.id && JSON.parse(previous.result).status !== 200) throw conflict(note);
      }
      if (note.version !== op.baseVersion) throw conflict(note);
      const now = nowIso();
      q.update.run(title ?? note.title, body ?? note.body, now, user.id, now, note.id);
      const version = note.version + 1;
      // Ma propre modification n'est jamais une nouveauté pour moi
      markRead(note.id, user.id, version);
      changedForNote(note);
      pushes.push({ noteId: note.id, actorId: user.id, version });
      return { version };
    },

    // Mettre à la corbeille (propriétaire) : elle disparaît pour tous ses
    // membres ; l'épingle de chacun est gardée. Déjà dans la corbeille : rien
    // ne change (rejouable). Le lien public ne mène plus à rien tant
    // qu'elle y est (server/note-shares.js).
    'note.delete'(user, op) {
      const note = ownNote(user, op.noteId);
      if (!note.deleted_at) {
        const now = nowIso();
        q.trash.run(now, user.id, now, now, note.id);
        changedForNote(note);
      }
      return {};
    },

    // Restaurer depuis la corbeille (propriétaire, moins de 30 jours) : elle
    // revient telle qu'elle était, pour ses membres aussi, épingles
    // comprises. Déjà restaurée : rien ne change (rejouable).
    'note.restore'(user, op) {
      const note = ownNote(user, op.noteId);
      if (note.deleted_at) {
        if (note.deleted_at < purgeLimit()) throw new OpError(404, NOTE_NOT_FOUND);
        const now = nowIso();
        q.untrash.run(now, now, note.id);
        changedForNote(note);
      }
      return {};
    },

    // Supprimer définitivement des notes de MA corbeille (« Supprimer
    // définitivement », « Vider la corbeille » : noteIds, 2 000 au plus).
    // Une note inconnue, d'un autre ou pas dans la corbeille est laissée
    // telle quelle (rien n'est dit d'elle). Renvoie le nombre effacé.
    'note.purge'(user, op) {
      if (!Array.isArray(op.noteIds) || op.noteIds.length === 0 || op.noteIds.length > NOTES_MAX) throw new OpError(400, 'ops.notesInvalides');
      let purged = 0;
      for (const value of op.noteIds) {
        const note = q.noteFor.get({ userId: user.id, noteId: requireUuid(value) });
        if (noteAccess(user, note) !== 'owner' || !note.deleted_at) continue;
        changedForNote(note);
        q.erase.run(note.id); // membres, épingles, lien public : effacés avec elle
        purged += 1;
      }
      return { purged };
    },

    // Épingler ou désépingler (pour moi), quel que soit mon droit
    'note.pin'(user, op) {
      const { note } = noteFor(user, op.noteId);
      if (typeof op.pinned !== 'boolean') throw new OpError(400, 'ops.epingleInvalide');
      setPin(note.id, user.id, op.pinned);
      changedFor(user.id);
      return {};
    },

    // Nouveautés : « lue » jusqu'à la version upTo (celle que le téléphone
    // affiche) ; jamais au-delà de la version actuelle, jamais vers le bas
    // (rejouable sans effet). Vaut sur tous mes appareils.
    'note.seen'(user, op) {
      const { note } = noteFor(user, op.noteId);
      if (!Number.isSafeInteger(op.upTo) || op.upTo < 0) throw new OpError(400, 'ops.repereLectureNoteInvalide');
      const before = q.readOf.get(note.id, user.id) ?? 0;
      const target = Math.min(op.upTo, note.version);
      if (target > before) {
        markRead(note.id, user.id, target);
        changedFor(user.id);
      }
      return {};
    },

    // Étiquettes de la note (propriétaire ou « Peut modifier » ; « Lecture
    // seule » : 403, comme pour le texte) : labelIds, la liste complète
    // voulue (10 au plus), qui remplace l'ancienne ; rejouable sans effet.
    // Une étiquette inconnue (effacée par l'Admin entre-temps) : refus de
    // toute l'opération. Discret : ni version, ni date de modification, ni
    // nouveauté, ni notification ; seulement la synchronisation des membres.
    'note.labels'(user, op) {
      const { note, access } = noteFor(user, op.noteId);
      if (access === 'read') throw new OpError(403, 'ops.noteLectureSeule');
      const ids = cleanLabelIds(op.labelIds);
      if (!ids) throw new OpError(400, 'ops.etiquettesNoteInvalides', { max: LABELS_PER_NOTE_MAX });
      if (!labels.allExist(ids)) throw new OpError(404, LABEL_NOT_FOUND);
      if (labels.setNoteLabels(note.id, ids)) changedForNote(note);
      return { labelIds: ids };
    },

    // Menu de la note, « Masquer les nouveautés » (muted: true) / « Afficher… »,
    // pour moi seulement, quel que soit mon droit
    'note.mute'(user, op) {
      const { note } = noteFor(user, op.noteId);
      if (typeof op.muted !== 'boolean') throw new OpError(400, 'ops.reglageSourdineNoteInvalide');
      if ((q.mutedNewsOf.get(note.id, user.id) ?? 0) !== Number(op.muted)) {
        q.setMutedNews.run({ noteId: note.id, userId: user.id, muted: Number(op.muted) });
        changedFor(user.id);
      }
      return {};
    },
  };

  // --- Partage (PUT /api/notes/:id/members, propriétaire seulement) ---
  //
  // Même règle que les listes (server/lists.js, setMembers) : userIds, la
  // liste complète des personnes souhaitées (comptes existants et actifs,
  // 50 au plus ; le propriétaire n'en fait jamais partie) ; access
  // (facultatif) : { "<id>": "modification" | "lecture" }. Une personne
  // ajoutée sans droit précisé est en lecture seule ; un membre déjà présent
  // sans droit précisé garde le sien. Toutes les vérifications passent AVANT
  // la moindre écriture. Une personne retirée perd son épingle, sa lecture
  // et ses sourdines ; une personne ajoutée démarre « à jour » (la note
  // n'est pas une nouveauté pour elle).
  function setMembers(user, noteId, userIds, access = {}) {
    const note = ownNote(user, noteId);
    if (note.deleted_at) throw new OpError(404, NOTE_NOT_FOUND);
    if (!Array.isArray(userIds) || userIds.length > NOTE_MEMBERS_MAX || !userIds.every((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0 && String(Number(id)) === String(id))) {
      throw new OpError(400, 'ops.listePersonnesInvalide');
    }
    if (access === null || typeof access !== 'object' || Array.isArray(access)) throw new OpError(400, 'ops.droitsPersonnesInvalides');
    const wanted = new Set(userIds.map(Number));
    wanted.delete(note.owner_id);
    const rights = new Map();
    for (const [key, value] of Object.entries(access)) {
      const id = Number(key);
      if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== key || !NOTE_ACCESS.includes(value)) throw new OpError(400, 'ops.droitsPersonnesInvalides');
      if (id === note.owner_id) throw new OpError(400, 'ops.proprietaireTousDroitsNote');
      if (!wanted.has(id)) throw new OpError(400, 'ops.droitSansPartageNote');
      rights.set(id, value);
    }
    const before = new Map(q.members.all(note.id).map((m) => [m.id, m.access]));
    for (const id of wanted) {
      if (before.has(id)) continue;
      const guest = q.user.get(id);
      if (!guest || guest.active !== 1) throw new OpError(400, 'ops.utilisateurInconnu');
    }
    const added = [...wanted].filter((id) => !before.has(id));
    const removed = [...before.keys()].filter((id) => !wanted.has(id));
    const changedRights = [...rights].filter(([id, value]) => before.has(id) && before.get(id) !== value);
    if (added.length || removed.length || changedRights.length) {
      db.transaction(() => {
        for (const id of added) {
          q.addMember.run(note.id, id, rights.get(id) ?? 'lecture');
          markRead(note.id, id, note.version); // la note n'est pas une nouveauté pour elle
        }
        for (const id of removed) {
          q.removeMember.run(note.id, id);
          q.dropState.run(note.id, id);
        }
        for (const [id, value] of changedRights) q.setAccess.run(value, note.id, id);
        q.touch.run(nowIso(), note.id);
      })();
      // Temps réel : le propriétaire, les membres, et les personnes retirées
      // (leurs appareils apprennent ainsi qu'elles n'y ont plus accès)
      ctx.events?.notifyNotes([note.owner_id, ...q.memberIds.all(note.id), ...removed]);
    }
    const nameOf = (id) => q.user.get(id)?.username ?? null;
    for (const id of added) ctx.audit('note_member_added', { user: user.username, note: note.id, member: nameOf(id), access: JOURNAL_ACCESS[rights.get(id) ?? 'lecture'] });
    for (const id of removed) ctx.audit('note_member_removed', { user: user.username, note: note.id, member: nameOf(id) });
    for (const [id, value] of changedRights) ctx.audit('note_access_changed', { user: user.username, note: note.id, member: nameOf(id), access: JOURNAL_ACCESS[value] });
    // Notifications « Partage » : personnes ajoutées, droits changés
    for (const id of added) ctx.notify?.noteShared?.({ noteId: note.id, userId: id, actorId: user.id, kind: 'added' });
    for (const [id] of changedRights) ctx.notify?.noteShared?.({ noteId: note.id, userId: id, actorId: user.id, kind: 'access' });
    return describeNote(q.noteFor.get({ userId: user.id, noteId: note.id }), user);
  }

  // --- Quitter une note (POST /api/notes/:id/leave) ---
  // Un membre retire SA propre appartenance (la route ne prend aucun
  // identifiant de personne). Le propriétaire ne peut pas quitter sa note
  // (403) ; un non-membre reçoit « Note introuvable » (404). Il perd son
  // épingle, sa lecture et ses sourdines.
  function leaveNote(user, noteId) {
    const { note, access } = noteFor(user, noteId);
    if (access === 'owner') throw new OpError(403, 'ops.proprietaireNePeutPasQuitterNote');
    db.transaction(() => {
      q.removeMember.run(note.id, user.id);
      q.dropState.run(note.id, user.id);
      q.touch.run(nowIso(), note.id);
    })();
    ctx.events?.notifyNotes([note.owner_id, ...q.memberIds.all(note.id), user.id]);
    ctx.audit('note_left', { user: user.username, note: note.id });
    return {};
  }

  // Lien public : la note a changé pour son propriétaire (icône « lien » de
  // la carte) ; ses appareils l'apprennent à leur prochaine synchronisation
  function touchForOwner(note) {
    q.touch.run(nowIso(), note.id);
    ctx.events?.notifyNotes([note.owner_id]);
  }

  // --- Synchronisation (ajoutée à GET /api/sync, server/lists.js) ---
  // - notes : celles que je vois (les miennes, corbeille comprise ; celles
  //   qu'on m'a partagées, hors corbeille) qui ont changé depuis « since »
  //   (texte, corbeille, partage, lien public, étiquettes), texte et
//   étiquettes compris ;
  // - noteIds : toutes celles que je vois (une note absente de ce tableau a
  //   été effacée, mise à la corbeille par son propriétaire, ou je n'y ai
  //   plus accès) ;
  // - pinnedNotes : celles que j'ai épinglées, en entier ;
  // - labels : toute la réserve des étiquettes, en entier ;
  // - noteNews : en entier, { unread: notes modifiées par quelqu'un d'autre
  //   depuis ma dernière lecture (rien si « Nouveautés » est désactivé ou
  //   la note en sourdine), muted: celles dont j'ai masqué les nouveautés }.
  // Jamais l'épingle, la lecture ni les sourdines d'une autre personne.
  const visibleQuery = db.prepare(`
    SELECT notes.*, note_members.access AS member_access
    FROM notes LEFT JOIN note_members ON note_members.note_id = notes.id AND note_members.user_id = :me
    WHERE notes.owner_id = :me OR (note_members.user_id IS NOT NULL AND notes.deleted_at IS NULL)
  `);
  const stateQuery = db.prepare('SELECT note_id, pinned, last_read_version, muted_news FROM note_user_state WHERE user_id = ?');
  function syncFor(user, since) {
    const from = since ?? '';
    const visible = visibleQuery.all({ me: user.id }).filter((note) => noteAccess(user, note));
    const byId = new Map(visible.map((note) => [note.id, note]));
    const states = stateQuery.all(user.id).filter((row) => byId.has(row.note_id));
    const stateOf = new Map(states.map((row) => [row.note_id, row]));
    const newsOn = q.newsEnabled.get(user.id) === 1;
    const unread = newsOn ? visible.filter((note) => {
      const state = stateOf.get(note.id);
      return !note.deleted_at && note.updated_by !== null && note.updated_by !== user.id
        && note.version > (state?.last_read_version ?? 0) && (state?.muted_news ?? 0) === 0;
    }).map((note) => note.id) : [];
    return {
      // Toute la réserve des étiquettes (numéro, nom, couleur), à chaque fois
      labels: labels.all(),
      notes: visible.filter((note) => (note.changed_at ?? note.updated_at) >= from).map((note) => describeNote(note, user)),
      noteIds: [...byId.keys()],
      pinnedNotes: states.filter((row) => row.pinned === 1).map((row) => row.note_id),
      noteNews: {
        unread,
        muted: states.filter((row) => row.muted_news === 1).map((row) => row.note_id),
      },
    };
  }

  // --- Ménage : notes dans la corbeille depuis plus de 30 jours ---
  // (leurs membres, épingles et liens publics partent avec elles, ON DELETE CASCADE)
  function purgeDeleted() {
    return db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(purgeLimit()).changes;
  }

  return { handlers, syncFor, purgeDeleted, flushNotify, clearNotify, noteAccess, noteFor, ownNote, setMembers, leaveNote, touchForOwner, describeNote };
}
