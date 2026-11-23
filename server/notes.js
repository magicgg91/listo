// Notes : droits, opérations, synchronisation et nettoyage (étape 2 du
// cadrage docs/cadrage-accueil-notes-notifications.md, migration 36).
//
// Règle d'or, comme pour les listes : chaque opération relit la note dans la
// base et vérifie le droit du compte connecté avec UNE seule fonction,
// noteAccess. Une note inconnue, ou qu'on n'a pas le droit de voir, reçoit
// exactement la même réponse (404 « Note introuvable. »). L'Admin n'a aucun
// droit sur les notes des autres.
//
// Étape 2 : une note n'est visible que par son propriétaire. Le partage
// (étape 3) ajoutera des membres (droits 'edit' et 'read') dans noteAccess
// et dans la requête des notes visibles, sans changer le reste.
//
// Épingle : propre à chaque personne (note_user_state), jamais transmise
// à une autre. (Catégories des notes : abandonnées le 23 novembre 2026.)
//
// Deux enregistrements faits sur la même version (deux appareils, ou deux
// personnes à l'étape 3) : chaque note.update porte la version sur laquelle
// le texte a été écrit (baseVersion). Si la note a changé entre-temps, rien
// n'est écrasé : refus 409 avec la version actuelle (champ « current »),
// et le téléphone propose le choix (Garder la mienne, Prendre la leur,
// Garder les deux). afterOp : l'enregistrement précédent de la même note
// encore en file sur ce téléphone ; s'il a été refusé, celui-ci l'est aussi
// (sinon, écrit sur la version prévue par le téléphone, il pourrait passer
// par-dessus le texte de l'autre).
//
// Les dates sont posées ici, par le serveur. Le texte d'une note n'est
// jamais écrit dans un journal.

import { NOTE_TITLE_MAX, NOTE_BODY_MAX, NOTES_MAX, NOTE_TRASH_DAYS } from '../public/js/notes.js';

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
  return {
    take(userId, n = 1) {
      const time = now();
      let entry = counts.get(userId);
      if (!entry || time - entry.start >= windowMs) {
        entry = { start: time, count: 0 };
        counts.set(userId, entry);
      }
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

// Droit d'un compte sur une note : 'owner' (propriétaire : tout), 'edit'
// (« Peut modifier », étape 3), 'read' (« Lecture seule », étape 3) ou null
// (aucun : la note est traitée comme inconnue). LE seul contrôle, utilisé
// par toutes les opérations et par la synchronisation. Une note dans la
// corbeille n'est visible que par son propriétaire.
export function noteAccess(user, note) {
  if (!user || !note) return null;
  if (note.owner_id === user.id) return 'owner';
  return null;
}

export function createNoteService(ctx, { OpError }) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();
  const purgeLimit = () => new Date(ctx.now() - NOTE_TRASH_DAYS * DAY).toISOString();

  const q = {
    note: db.prepare('SELECT * FROM notes WHERE id = ?'),
    countMine: db.prepare('SELECT COUNT(*) FROM notes WHERE owner_id = ?').pluck(),
    insert: db.prepare(`INSERT INTO notes (id, owner_id, title, body, version, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)`),
    update: db.prepare('UPDATE notes SET title = ?, body = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?'),
    trash: db.prepare('UPDATE notes SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?'),
    untrash: db.prepare('UPDATE notes SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?'),
    erase: db.prepare('DELETE FROM notes WHERE id = ?'),
    setPin: db.prepare(`INSERT INTO note_user_state (note_id, user_id, pinned) VALUES (:noteId, :userId, :pinned)
      ON CONFLICT (note_id, user_id) DO UPDATE SET pinned = :pinned`),
    applied: db.prepare('SELECT user_id, result FROM applied_ops WHERE id = ?'),
    userName: db.prepare('SELECT display_name FROM users WHERE id = ?').pluck(),
  };

  // --- Prévenir les appareils (temps réel), après l'écriture réussie ---
  // Étape 2 : seulement les appareils du propriétaire (étape 3 : aussi les
  // membres de la note). Le message ne contient aucune donnée de la note.
  const touched = new Set(); // comptes à prévenir
  const changedFor = (userId) => touched.add(userId);
  function flushNotify() {
    if (touched.size) ctx.events?.notifyNotes([...touched]);
    touched.clear();
  }
  const clearNotify = () => touched.clear();

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
    const note = q.note.get(requireUuid(noteId));
    const access = noteAccess(user, note);
    if (!access) throw new OpError(404, NOTE_NOT_FOUND);
    return { note, access };
  }

  // Note du propriétaire seulement (supprimer, restaurer, effacer) ; un
  // membre (étape 3) reçoit 403
  function ownNote(user, noteId) {
    const found = noteFor(user, noteId);
    if (found.access !== 'owner') throw new OpError(403, 'ops.noteProprietaireSeulement');
    return found.note;
  }

  const setPin = (noteId, userId, pinned) => q.setPin.run({ noteId, userId, pinned: pinned ? 1 : 0 });

  // Ce que le téléphone reçoit d'une note : construit champ par champ
  function describeNote(note, user) {
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
      access: noteAccess(user, note),
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
      q.insert.run(id, user.id, title, body, now, now, user.id);
      if (op.pinned) setPin(id, user.id, true);
      changedFor(user.id);
      // Réponse courte : le texte arrive par la synchronisation (la réponse
      // est gardée 30 jours dans applied_ops, sans le texte de la note)
      return { version: 1 };
    },

    // Enregistrer le titre et le texte (propriétaire ; « Peut modifier » à
    // l'étape 3). Jamais d'écrasement : version différente de baseVersion,
    // ou enregistrement précédent (afterOp) refusé : refus 409 avec la
    // version actuelle.
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
      q.update.run(title ?? note.title, body ?? note.body, nowIso(), user.id, note.id);
      changedFor(user.id);
      return { version: note.version + 1 };
    },

    // Mettre à la corbeille (propriétaire) : elle disparaît pour tous ;
    // l'épingle de chacun est gardée. Déjà dans la
    // corbeille : rien ne change (rejouable).
    'note.delete'(user, op) {
      const note = ownNote(user, op.noteId);
      if (!note.deleted_at) {
        const now = nowIso();
        q.trash.run(now, user.id, now, note.id);
        changedFor(user.id);
      }
      return {};
    },

    // Restaurer depuis la corbeille (propriétaire, moins de 30 jours) : elle
    // revient telle qu'elle était, épingle comprise. Déjà restaurée : rien ne change (rejouable).
    'note.restore'(user, op) {
      const note = ownNote(user, op.noteId);
      if (note.deleted_at) {
        if (note.deleted_at < purgeLimit()) throw new OpError(404, NOTE_NOT_FOUND);
        q.untrash.run(nowIso(), note.id);
        changedFor(user.id);
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
        const note = q.note.get(requireUuid(value));
        if (noteAccess(user, note) !== 'owner' || !note.deleted_at) continue;
        q.erase.run(note.id);
        purged += 1;
      }
      if (purged) changedFor(user.id);
      return { purged };
    },

    // Épingler ou désépingler (pour moi)
    'note.pin'(user, op) {
      const { note } = noteFor(user, op.noteId);
      if (typeof op.pinned !== 'boolean') throw new OpError(400, 'ops.epingleInvalide');
      setPin(note.id, user.id, op.pinned);
      changedFor(user.id);
      return {};
    },

  };

  // --- Synchronisation (ajoutée à GET /api/sync, server/lists.js) ---
  // - notes : celles que je vois (étape 2 : les miennes, corbeille
  //   comprise) modifiées depuis « since », texte compris ;
  // - noteIds : toutes celles que je vois (une note absente de ce tableau a
  //   été effacée, ou je n'y ai plus accès) ;
  // - pinnedNotes : celles que j'ai épinglées, en entier.
  // Jamais l'épingle d'une autre personne.
  function syncFor(user, since) {
    const from = since ?? '';
    const visible = db.prepare('SELECT * FROM notes WHERE owner_id = ?').all(user.id);
    const visibleIds = new Set(visible.map((note) => note.id));
    return {
      notes: visible.filter((note) => note.updated_at >= from).map((note) => describeNote(note, user)),
      noteIds: [...visibleIds],
      pinnedNotes: db.prepare('SELECT note_id FROM note_user_state WHERE user_id = ? AND pinned = 1').pluck()
        .all(user.id)
        .filter((id) => visibleIds.has(id)),
    };
  }

  // --- Ménage : notes dans la corbeille depuis plus de 30 jours ---
  // (leur épingle part avec elles, ON DELETE CASCADE)
  function purgeDeleted() {
    return db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(purgeLimit()).changes;
  }

  return { handlers, syncFor, purgeDeleted, flushNotify, clearNotify, noteAccess };
}
