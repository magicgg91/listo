// Étiquettes des notes (décisions du propriétaire du 24 novembre 2026,
// migration 42). Les règles des noms et des couleurs sont celles de
// public/js/labels.js, vérifiées ici avant toute écriture.
//
// - Une seule réserve, commune à tous les comptes : chaque compte actif
//   reçoit toutes les étiquettes (numéro, nom, couleur ; jamais qui l'a
//   créée) à chaque synchronisation.
// - Même nom = même étiquette, majuscules et accents ignorés (colonne
//   name_key, UNIQUE) : créer un nom qui existe renvoie l'étiquette
//   existante, sans en créer une seconde.
// - Tout compte connecté crée une étiquette (en ligne ; 20 créations par
//   heure et par compte au plus, comme les magasins et les rayons ; 300
//   étiquettes en tout au plus). Seul l'Admin la renomme, change sa couleur
//   ou la supprime (routes /api/admin/labels, réservées au rôle Admin par
//   server/routes/admin.js) ; la supprimer la retire de ses notes, sans
//   toucher aux notes.
// - Poser des étiquettes sur une note : opération « note.labels » de
//   server/notes.js (propriétaire et « Peut modifier », droits vérifiés par
//   noteAccess) ; ce module ne fait que lire et écrire les tables.
// - Journal de sécurité (en anglais) : création, renommage, couleur,
//   suppression, avec le nom de l'étiquette ; jamais le texte d'une note.

import { cleanLabelName, labelKey, isLabelColor, LABELS_MAX, DEFAULT_LABEL_COLOR } from '../public/js/labels.js';
import { parseId } from './validate.js';

// Refus (noms des textes, public/js/i18n/fr/ops.js)
export const LABEL_NOT_FOUND = 'ops.etiquetteIntrouvable';

export function createLabelService(ctx, { OpError }) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    all: db.prepare('SELECT id, name, color FROM labels ORDER BY id'),
    get: db.prepare('SELECT id, name, name_key, color FROM labels WHERE id = ?'),
    byKey: db.prepare('SELECT id, name, name_key, color FROM labels WHERE name_key = ?'),
    count: db.prepare('SELECT COUNT(*) FROM labels').pluck(),
    insert: db.prepare('INSERT INTO labels (name, name_key, color, created_at) VALUES (?, ?, ?, ?)'),
    rename: db.prepare('UPDATE labels SET name = ?, name_key = ? WHERE id = ?'),
    recolor: db.prepare('UPDATE labels SET color = ? WHERE id = ?'),
    erase: db.prepare('DELETE FROM labels WHERE id = ?'),
    // Nombre de notes qui portent chaque étiquette (Administration), corbeille comprise
    counts: db.prepare('SELECT label_id, COUNT(*) AS notes FROM note_labels GROUP BY label_id'),
    notesOf: db.prepare('SELECT note_id FROM note_labels WHERE label_id = ?').pluck(),
    // Étiquettes d'une note
    ofNote: db.prepare('SELECT label_id FROM note_labels WHERE note_id = ? ORDER BY label_id').pluck(),
    link: db.prepare('INSERT OR IGNORE INTO note_labels (note_id, label_id) VALUES (?, ?)'),
    unlink: db.prepare('DELETE FROM note_labels WHERE note_id = ? AND label_id = ?'),
    // La note revient dans la synchronisation de ses membres (sans changer
    // sa date de modification ni sa version : voir server/notes.js)
    touchNote: db.prepare('UPDATE notes SET changed_at = ? WHERE id = ?'),
  };

  // Ce que les téléphones reçoivent d'une étiquette : construit champ par champ
  const describe = (row) => ({ id: row.id, name: row.name, color: row.color });

  // Toute la réserve (synchronisation de chaque compte actif)
  const all = () => q.all.all().map(describe);

  // Étiquettes d'une note (numéros, dans l'ordre croissant)
  const idsOfNote = (noteId) => q.ofNote.all(noteId);

  // Vrai si chaque numéro est celui d'une étiquette existante
  const allExist = (ids) => ids.every((id) => Boolean(q.get.get(id)));

  // Remplace les étiquettes d'une note par ids (déjà vérifiés). Renvoie
  // vrai si quelque chose a changé.
  function setNoteLabels(noteId, ids) {
    const before = new Set(idsOfNote(noteId));
    const wanted = new Set(ids);
    const added = ids.filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !wanted.has(id));
    if (!added.length && !removed.length) return false;
    for (const id of removed) q.unlink.run(noteId, id);
    for (const id of added) q.link.run(noteId, id);
    q.touchNote.run(nowIso(), noteId);
    return true;
  }

  // Nom et couleur demandés, vérifiés (refus 400 sinon)
  function nameOf(value) {
    const name = cleanLabelName(value);
    if (!name) throw new OpError(400, 'ops.nomEtiquetteInvalide');
    return name;
  }
  function colorOf(value) {
    if (!isLabelColor(value)) throw new OpError(400, 'ops.couleurEtiquetteInvalide');
    return value;
  }

  // --- Créer (tout compte connecté, POST /api/labels) ---
  // Nom déjà pris (majuscules et accents ignorés) : l'étiquette existante,
  // telle quelle (existing: true), sans rien créer ni compter.
  function create(user, { name: rawName, color: rawColor } = {}) {
    const name = nameOf(rawName);
    const color = rawColor === undefined ? DEFAULT_LABEL_COLOR : colorOf(rawColor);
    const key = labelKey(name);
    const twin = q.byKey.get(key);
    if (twin) return { label: describe(twin), existing: true };
    if (q.count.get() >= LABELS_MAX) throw new OpError(400, 'ops.etiquettesLimite', { max: LABELS_MAX });
    if (!ctx.labelCreations.take(user.id)) throw new OpError(429, 'ops.tropDEtiquettes');
    const id = Number(q.insert.run(name, key, color, nowIso()).lastInsertRowid);
    ctx.audit('label_created', { user: user.username, label: name, color });
    ctx.events?.notifyReferences(); // les téléphones connectés se mettent à jour
    return { label: describe(q.get.get(id)), existing: false };
  }

  // --- Administration (Admin seulement, server/routes/labels.js) ---

  // Toutes les étiquettes, avec le nombre de notes qui les portent (jamais
  // lesquelles : l'Admin ne voit pas les notes des autres)
  function adminList() {
    const counts = new Map(q.counts.all().map((row) => [row.label_id, row.notes]));
    return q.all.all().map((row) => ({ ...describe(row), notes: counts.get(row.id) ?? 0 }));
  }

  function target(id) {
    const labelId = parseId(id);
    const row = labelId && q.get.get(labelId);
    if (!row) throw new OpError(404, LABEL_NOT_FOUND);
    return row;
  }

  // Renommer et / ou changer la couleur. Un nom déjà pris par une AUTRE
  // étiquette (majuscules et accents ignorés) est refusé (409) ; changer
  // seulement les majuscules ou les accents d'une étiquette est permis.
  function update(admin, id, { name: rawName, color: rawColor } = {}, ip = null) {
    const row = target(id);
    if (rawName === undefined && rawColor === undefined) throw new OpError(400, 'ops.rienAModifier');
    const name = rawName === undefined ? row.name : nameOf(rawName);
    const color = rawColor === undefined ? row.color : colorOf(rawColor);
    const key = labelKey(name);
    const twin = q.byKey.get(key);
    if (twin && twin.id !== row.id) throw new OpError(409, 'ops.etiquetteExisteDeja', { name: twin.name });
    db.transaction(() => {
      if (name !== row.name) q.rename.run(name, key, row.id);
      if (color !== row.color) q.recolor.run(color, row.id);
    })();
    const who = { admin: admin.username, label: name, ip };
    if (name !== row.name) ctx.audit('admin_label_renamed', { ...who, old: row.name });
    if (color !== row.color) ctx.audit('admin_label_recolored', { ...who, color, old: row.color });
    // Les notes ne gardent que le numéro : la réserve, envoyée en entier à
    // chaque synchronisation, suffit
    if (name !== row.name || color !== row.color) ctx.events?.notifyReferences();
    return { ...describe(q.get.get(row.id)), notes: q.notesOf.all(row.id).length };
  }

  // Supprimer : l'étiquette disparaît de la réserve et de ses notes ; les
  // notes elles-mêmes ne changent pas (ni texte, ni version, ni date de
  // modification) : elles reviennent seulement dans la synchronisation de
  // leurs membres, sans l'étiquette.
  function remove(admin, id, ip = null) {
    const row = target(id);
    const noteIds = q.notesOf.all(row.id);
    db.transaction(() => {
      const now = nowIso();
      for (const noteId of noteIds) q.touchNote.run(now, noteId);
      q.erase.run(row.id); // ses liens partent avec elle (ON DELETE CASCADE)
    })();
    ctx.audit('admin_label_deleted', { admin: admin.username, label: row.name, notes: noteIds.length, ip });
    ctx.events?.notifyReferences();
    return { notes: noteIds.length };
  }

  return { all, idsOfNote, allExist, setNoteLabels, create, adminList, update, remove };
}
