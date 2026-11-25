// Étiquettes des notes (décisions du propriétaire du 24 novembre 2026,
// migration 42) : règles partagées (nom, forme comparable, couleurs),
// migration, création par tout compte (le même nom, majuscules et accents
// ignorés, donne la même étiquette), droits sur une note (propriétaire et
// « Peut modifier » ; « Lecture seule », personne d'autre et Admin non
// membre refusés), synchronisation, gestion par l'Admin seulement,
// journal de sécurité, file d'attente hors ligne, page publique sans
// étiquettes, recherche par nom d'étiquette.
//
// Foyer : Léa (propriétaire de la note), Marc (« Peut modifier »), Zoé
// (« Lecture seule »), Paul (n'a rien), Guillaume (Admin, n'a rien).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, createClient, tempDir, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import {
  LABEL_COLORS, LABEL_NAME_MAX, LABELS_PER_NOTE_MAX, cleanLabelName, labelNameProblem, labelKey, findLabel,
  labelsMatching, sortLabels, noteLabels, usedLabels, cleanLabelIds,
} from '../public/js/labels.js';
import { emptyState, loadSync, mergeSync, applyOp } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const people = { guillaume: { client: guillaume, id: 1 } };
  for (const [key, name] of [['lea', 'Léa'], ['marc', 'Marc'], ['zoe', 'Zoé'], ['paul', 'Paul']]) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  const ops = async (who, list) => (await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) })).body.results;
  const one = async (who, op) => (await ops(who, [op]))[0];
  const sync = async (who, since) => (await people[who].client.get(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync')).body;
  const create = (who, body) => people[who].client.post('/api/labels', body);
  return { app, people, ops, one, sync, create };
}

// Une note de Léa (texte reconnaissable), partagée avec Marc (modifier) et Zoé (lecture seule)
async function sharedNote(t) {
  const h = await household(t);
  const noteId = uuid();
  assert.equal((await h.one('lea', { type: 'note.create', noteId, title: 'Vacances', body: 'Gîte à Erquy, code 4711' })).status, 200);
  const res = await h.people.lea.client.request('PUT', `/api/notes/${noteId}/members`, {
    userIds: [h.people.marc.id, h.people.zoe.id],
    access: { [h.people.marc.id]: 'modification', [h.people.zoe.id]: 'lecture' },
  });
  assert.equal(res.status, 200, res.text);
  const famille = (await h.create('lea', { name: 'Famille', color: 'rose' })).body.label;
  const maison = (await h.create('marc', { name: 'Maison', color: 'bleu' })).body.label;
  return { ...h, noteId, famille, maison };
}

// --- Règles partagées (public/js/labels.js) ---

test('nom : espaces retirés, 1 à 30 caractères, sans caractère de contrôle ni invisible', () => {
  assert.equal(cleanLabelName('  Maison   de   vacances '), 'Maison de vacances');
  assert.equal(cleanLabelName('Été'), 'Été');
  assert.equal(cleanLabelName('Été'), 'Été', 'forme NFC');
  assert.equal(cleanLabelName('x'.repeat(LABEL_NAME_MAX)), 'x'.repeat(30));
  assert.equal(cleanLabelName('🏖️ Plage'), '🏖️ Plage');
  assert.equal(cleanLabelName('👨‍👩‍👧 Famille'), '👨‍👩‍👧 Famille', 'le liant des emojis (U+200D) est permis');
  // Hangul : 30 syllabes donnent jusqu'à 90 lettres une fois décomposées (forme comparable)
  assert.equal(labelKey('한'.repeat(30)).length, 90);
  assert.equal(cleanLabelName('한'.repeat(30)), '한'.repeat(30));
  for (const bad of ['\u0301', ' \u0301\u0308 ', '', '   ', 'x'.repeat(31), 'Mai\u0007son', 'Mai\u0000son', 'Ma‮ison', 'Mai​son', 'Mai⁦son', 42, null, undefined, { name: 'x' }, ['x']]) {
    assert.equal(cleanLabelName(bad), null, JSON.stringify(bad));
  }
  assert.equal(labelNameProblem(' '), 'vide');
  assert.equal(labelNameProblem('x'.repeat(31)), 'long');
  assert.equal(labelNameProblem('a‮b'), 'caractere');
  assert.equal(labelNameProblem('Jardin'), null);
});

test('même nom = même étiquette : majuscules, accents et espaces ignorés', () => {
  for (const name of ['Été', 'ete', 'ÉTÉ', ' été ', 'Été', 'éTÉ']) assert.equal(labelKey(name), 'ete', name);
  assert.equal(labelKey('Maison  de   vacances'), labelKey('maison de VACANCES'));
  assert.notEqual(labelKey('Maison'), labelKey('Maisons'));
  const labels = [{ id: 1, name: 'Maison', color: 'bleu' }, { id: 2, name: 'Été', color: 'jaune' }];
  assert.equal(findLabel(labels, 'MAISON').id, 1);
  assert.equal(findLabel(labels, 'ete').id, 2);
  assert.equal(findLabel(labels, 'Jardin'), null);
  assert.equal(findLabel(labels, '  '), null);
  assert.deepEqual(labelsMatching(labels, 'AIS').map((l) => l.id), [1]);
  assert.deepEqual(labelsMatching(labels, '').map((l) => l.id), [1, 2]);
});

test('couleurs, liste des étiquettes d\'une note, ordre, étiquettes utilisées', () => {
  assert.deepEqual(LABEL_COLORS, ['gris', 'rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose']);
  assert.deepEqual(cleanLabelIds([3, 1, 3, 2]), [1, 2, 3]);
  assert.deepEqual(cleanLabelIds([]), []);
  for (const bad of [null, '1', [0], [-1], [1.5], ['1'], [Number.MAX_SAFE_INTEGER + 1], Array.from({ length: LABELS_PER_NOTE_MAX + 1 }, (_, i) => i + 1)]) {
    assert.equal(cleanLabelIds(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(cleanLabelIds([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]), [1, 2], 'doublons comptés une fois');
  const labels = [{ id: 1, name: 'Vacances' }, { id: 2, name: 'Famille' }, { id: 3, name: 'Recettes' }];
  assert.deepEqual(sortLabels(labels).map((l) => l.name), ['Famille', 'Recettes', 'Vacances']);
  assert.deepEqual(noteLabels({ labelIds: [1, 2, 99] }, labels).map((l) => l.name), ['Famille', 'Vacances'], 'étiquette inconnue ignorée');
  assert.deepEqual(noteLabels({}, labels), []);
  assert.deepEqual(usedLabels([{ labelIds: [3] }, { labelIds: [1, 3] }, {}], labels).map((l) => l.id), [3, 1]);
});

// --- Migration 42 ---

test('migration 42 : tables labels et note_labels ; une base en version 41 migre sans rien changer ; nom unique, couleur, cascades', (t) => {
  assert.equal(MIGRATIONS.length, 44);
  const fresh = openDatabase(':memory:');
  assert.equal(schemaVersion(fresh), 44);
  for (const table of ['labels', 'note_labels']) assert.ok(fresh.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table);
  const file = path.join(tempDir(t), 'old.db');
  const old = databaseAt(file, 41);
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('anne', 'Anne', 'x')").run();
  old.prepare("INSERT INTO notes (id, owner_id, title, body, version, created_at, updated_at, changed_at) VALUES ('n1', 1, 'Codes', 'secret', 3, '2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z')").run();
  old.close();
  const db = openDatabase(file);
  assert.equal(schemaVersion(db), 44);
  assert.deepEqual(db.prepare('SELECT title, body, version, updated_at, changed_at FROM notes').get(), { title: 'Codes', body: 'secret', version: 3, updated_at: '2026-11-02T00:00:00.000Z', changed_at: '2026-11-02T00:00:00.000Z' });
  assert.equal(db.prepare('SELECT COUNT(*) FROM labels').pluck().get(), 0);
  const add = db.prepare("INSERT INTO labels (name, name_key, color, created_at) VALUES (?, ?, ?, '2026-11-24T00:00:00.000Z')");
  add.run('Été', 'ete', 'jaune');
  assert.throws(() => add.run('ÉTÉ', 'ete', 'vert'), /UNIQUE/);
  assert.throws(() => add.run('Noir', 'noir', 'noir'), /CHECK/);
  assert.throws(() => add.run('x'.repeat(31), 'x'.repeat(31), 'gris'), /CHECK/);
  add.run('Maison', 'maison', 'bleu');
  db.prepare("INSERT INTO note_labels (note_id, label_id) VALUES ('n1', 1), ('n1', 2)").run();
  assert.throws(() => db.prepare("INSERT INTO note_labels (note_id, label_id) VALUES ('n1', 99)").run(), /FOREIGN KEY/);
  db.prepare('DELETE FROM labels WHERE id = 1').run();
  assert.deepEqual(db.prepare('SELECT label_id FROM note_labels').pluck().all(), [2], 'étiquette effacée : retirée de la note');
  assert.equal(db.prepare('SELECT COUNT(*) FROM notes').pluck().get(), 1, 'la note reste');
  db.prepare("DELETE FROM notes WHERE id = 'n1'").run();
  assert.equal(db.prepare('SELECT COUNT(*) FROM note_labels').pluck().get(), 0, 'note effacée : ses liens aussi');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

// --- Créer ---

test('créer : tout compte connecté ; le même nom (majuscules, accents) renvoie l\'étiquette existante ; journal', async (t) => {
  const h = await household(t);
  const created = await h.create('lea', { name: '  Été  ', color: 'jaune' });
  assert.equal(created.status, 201, created.text);
  assert.deepEqual(created.body, { label: { id: 1, name: 'Été', color: 'jaune' }, existing: false });
  for (const [who, name] of [['marc', 'ete'], ['paul', 'ÉTÉ'], ['guillaume', 'ÉTÉ']]) {
    const again = await h.create(who, { name, color: 'vert' });
    assert.equal(again.status, 200, name);
    assert.deepEqual(again.body, { label: { id: 1, name: 'Été', color: 'jaune' }, existing: true }, 'rien de créé, rien de changé');
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM labels').pluck().get(), 1);
  // Couleur facultative (bleu au départ)
  assert.equal((await h.create('zoe', { name: 'Lecture' })).body.label.color, 'bleu');
  const journal = h.app.logs.join('\n');
  assert.match(journal, /\[journal\] label_created user="lea" label="Été" color="jaune"/);
  assert.equal((journal.match(/label_created/g) ?? []).length, 2, 'une ligne par vraie création');
  // Sans session : refusé
  assert.equal((await h.app.client().post('/api/labels', { name: 'Jardin', color: 'vert' })).status, 401);
});

test('créer : nom ou couleur invalides refusés (400), rien d\'écrit', async (t) => {
  const h = await household(t);
  for (const body of [{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(31) }, { name: 'a\u0007b' }, { name: 'a‮b' }, { name: 42 }, { name: ['Maison'] },
    { name: 'Maison', color: 'noir' }, { name: 'Maison', color: 'BLEU' }, { name: 'Maison', color: 3 }, { name: 'Maison', color: null }]) {
    const res = await h.create('lea', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.body.error);
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM labels').pluck().get(), 0);
  // Un nom fait seulement d'accents seuls : refusé (400, jamais une erreur de la base)
  assert.equal((await h.create('lea', { name: '\u0301\u0301' })).status, 400);
  // 30 syllabes coréennes : 90 lettres une fois décomposées, accepté
  assert.equal((await h.create('lea', { name: '한'.repeat(30), color: 'gris' })).status, 201);
});

test('créer : 20 par heure et par compte au plus (429) ; un nom existant ne compte pas', async (t) => {
  const h = await household(t);
  for (let i = 0; i < 20; i += 1) assert.equal((await h.create('lea', { name: `Étiquette ${i}`, color: 'gris' })).status, 201);
  const over = await h.create('lea', { name: 'Encore une', color: 'gris' });
  assert.equal(over.status, 429);
  assert.equal(over.body.error, 'Trop d\'étiquettes créées pour le moment. Réessayez dans une heure.');
  assert.equal((await h.create('lea', { name: 'étiquette 3' })).status, 200, 'existante : toujours donnée');
  assert.equal((await h.create('marc', { name: 'Encore une', color: 'gris' })).status, 201, 'un autre compte a son propre compteur');
  h.app.clock.now += 60 * 60 * 1000;
  assert.equal((await h.create('lea', { name: 'Une heure après', color: 'gris' })).status, 201);
});

// --- Poser des étiquettes sur une note ---

test('droits : propriétaire et « Peut modifier » posent les étiquettes ; « Lecture seule » 403 ; personne d\'autre ni l\'Admin non membre (404)', async (t) => {
  const h = await sharedNote(t);
  const { noteId, famille, maison } = h;
  const set = (who, labelIds) => h.one(who, { type: 'note.labels', noteId, labelIds });
  const linked = () => h.app.db.prepare('SELECT label_id FROM note_labels WHERE note_id = ? ORDER BY label_id').pluck().all(noteId);
  const lea = await set('lea', [maison.id, famille.id]);
  assert.equal(lea.status, 200, JSON.stringify(lea));
  assert.deepEqual(lea.labelIds, [famille.id, maison.id]);
  assert.equal((await set('marc', [famille.id])).status, 200);
  assert.deepEqual(linked(), [famille.id]);
  const zoe = await set('zoe', [maison.id]);
  assert.equal(zoe.status, 403);
  assert.equal(zoe.code, 'ops.noteLectureSeule');
  for (const who of ['paul', 'guillaume']) {
    const res = await set(who, []);
    assert.equal(res.status, 404, who);
    assert.equal(res.code, 'ops.noteIntrouvable', 'même réponse qu\'une note inconnue');
  }
  assert.equal((await h.one('lea', { type: 'note.labels', noteId: uuid(), labelIds: [] })).status, 404);
  assert.deepEqual(linked(), [famille.id], 'rien n\'a changé');
});

test('opération : 10 étiquettes au plus, numéros valables, étiquette inconnue refusée ; rejouable', async (t) => {
  const h = await sharedNote(t);
  const { noteId, famille } = h;
  const ids = [];
  for (let i = 0; i < 11; i += 1) ids.push((await h.create('lea', { name: `E${i}`, color: 'vert' })).body.label.id);
  const tooMany = await h.one('lea', { type: 'note.labels', noteId, labelIds: ids });
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.code, 'ops.etiquettesNoteInvalides');
  for (const labelIds of [undefined, null, 'x', [0], ['1'], [1.5]]) assert.equal((await h.one('lea', { type: 'note.labels', noteId, labelIds })).status, 400, JSON.stringify(labelIds));
  const unknown = await h.one('lea', { type: 'note.labels', noteId, labelIds: [famille.id, 999] });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.code, 'ops.etiquetteIntrouvable');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM note_labels').pluck().get(), 0, 'refus : rien de posé');
  assert.equal((await h.one('lea', { type: 'note.labels', noteId, labelIds: ids.slice(0, 10) })).status, 200, '10 : permis');
  // La même opération envoyée deux fois : appliquée une seule fois
  const op = { id: uuid(), type: 'note.labels', noteId, labelIds: [famille.id] };
  const first = (await h.people.lea.client.post('/api/ops', { ops: [op] })).body.results[0];
  const second = (await h.people.lea.client.post('/api/ops', { ops: [op] })).body.results[0];
  assert.equal(first.status, 200);
  assert.equal(second.duplicate, true);
  assert.deepEqual(h.app.db.prepare('SELECT label_id FROM note_labels').pluck().all(), [famille.id]);
});

test('discret : ni version, ni date de modification, ni nouveauté, ni notification ; aucun conflit avec un enregistrement du texte', async (t) => {
  const h = await sharedNote(t);
  const { noteId, famille, maison } = h;
  const before = h.app.db.prepare('SELECT version, updated_at, updated_by, title, body FROM notes WHERE id = ?').get(noteId);
  const inboxBefore = h.app.db.prepare('SELECT COUNT(*) FROM inbox').pluck().get();
  h.app.clock.now += 60 * 1000;
  assert.equal((await h.one('marc', { type: 'note.labels', noteId, labelIds: [famille.id, maison.id] })).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT version, updated_at, updated_by, title, body FROM notes WHERE id = ?').get(noteId), before);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM inbox').pluck().get(), inboxBefore, 'aucune ligne dans la page Notifications');
  for (const who of ['lea', 'zoe']) assert.deepEqual((await h.sync(who)).noteNews.unread, [], `${who} : pas une nouveauté`);
  // Léa enregistre son texte sur la version 1 : pas de conflit
  const save = await h.one('lea', { type: 'note.update', noteId, body: 'Nouveau texte', baseVersion: 1 });
  assert.equal(save.status, 200);
  assert.equal(save.version, 2);
  assert.deepEqual(h.app.db.prepare('SELECT label_id FROM note_labels ORDER BY label_id').pluck().all(), [famille.id, maison.id], 'les étiquettes restent');
});

test('temps réel : les seules personnes de la note sont prévenues ; une opération sans changement ne prévient personne', async (t) => {
  const h = await sharedNote(t);
  const calls = [];
  const original = h.app.ctx.events.notifyNotes;
  h.app.ctx.events.notifyNotes = (ids) => {
    calls.push([...new Set(ids)].sort());
    original(ids);
  };
  await h.one('lea', { type: 'note.labels', noteId: h.noteId, labelIds: [h.famille.id] });
  assert.deepEqual(calls.pop(), [h.people.lea.id, h.people.marc.id, h.people.zoe.id].sort());
  await h.one('lea', { type: 'note.labels', noteId: h.noteId, labelIds: [h.famille.id] });
  assert.equal(calls.length, 0, 'rien de changé : personne n\'est prévenu');
});

test('synchronisation : toute la réserve (numéro, nom, couleur) pour chacun ; les étiquettes d\'une note pour ceux qui la voient seulement', async (t) => {
  const h = await sharedNote(t);
  const { noteId, famille, maison } = h;
  const lone = (await h.create('paul', { name: 'Sans note', color: 'gris' })).body.label;
  const since = (await h.sync('marc')).serverTime;
  h.app.clock.now += 1000;
  await h.one('lea', { type: 'note.labels', noteId, labelIds: [famille.id] });
  for (const who of ['lea', 'marc', 'zoe', 'paul', 'guillaume']) {
    const data = await h.sync(who);
    assert.deepEqual(data.labels, [
      { id: famille.id, name: 'Famille', color: 'rose' },
      { id: maison.id, name: 'Maison', color: 'bleu' },
      { id: lone.id, name: 'Sans note', color: 'gris' },
    ], `${who} : toute la réserve, sans le créateur`);
    for (const label of data.labels) assert.deepEqual(Object.keys(label).sort(), ['color', 'id', 'name']);
    const note = data.notes.find((n) => n.id === noteId);
    if (['lea', 'marc', 'zoe'].includes(who)) assert.deepEqual(note.labelIds, [famille.id], who);
    else assert.equal(note, undefined, `${who} ne voit pas la note`);
  }
  // Synchronisation « depuis » : la note revient, avec ses étiquettes
  const delta = await h.sync('marc', since);
  assert.deepEqual(delta.notes.map((n) => [n.id, n.labelIds]), [[noteId, [famille.id]]]);
  // Ni l'identité du créateur, ni rien d'autre, nulle part dans la réponse
  assert.ok(!JSON.stringify((await h.sync('paul')).labels).includes('marc'));
});

test('corbeille : la note garde ses étiquettes ; restaurée, elle les retrouve', async (t) => {
  const h = await sharedNote(t);
  await h.one('lea', { type: 'note.labels', noteId: h.noteId, labelIds: [h.maison.id] });
  await h.one('lea', { type: 'note.delete', noteId: h.noteId });
  assert.deepEqual((await h.sync('lea')).notes[0].labelIds, [h.maison.id]);
  assert.equal((await h.sync('marc')).notes.length, 0);
  await h.one('lea', { type: 'note.restore', noteId: h.noteId });
  assert.deepEqual((await h.sync('marc')).notes[0].labelIds, [h.maison.id]);
});

// --- Administration (Admin seulement) ---

test('administration : Admin seulement ; liste avec le nombre de notes, jamais lesquelles', async (t) => {
  const h = await sharedNote(t);
  const other = uuid();
  await h.one('paul', { type: 'note.create', noteId: other, title: 'Secret de Paul', body: 'code 9999' });
  await h.one('paul', { type: 'note.labels', noteId: other, labelIds: [h.maison.id] });
  await h.one('lea', { type: 'note.labels', noteId: h.noteId, labelIds: [h.maison.id, h.famille.id] });
  for (const who of ['lea', 'marc', 'paul']) {
    const client = h.people[who].client;
    assert.equal((await client.get('/api/admin/labels')).status, 403, who);
    assert.equal((await client.request('PATCH', `/api/admin/labels/${h.maison.id}`, { name: 'Pirate' })).status, 403, who);
    assert.equal((await client.del(`/api/admin/labels/${h.maison.id}`)).status, 403, who);
  }
  assert.equal((await h.app.client().get('/api/admin/labels')).status, 401);
  const list = await h.people.guillaume.client.get('/api/admin/labels');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items, [
    { id: h.famille.id, name: 'Famille', color: 'rose', notes: 1 },
    { id: h.maison.id, name: 'Maison', color: 'bleu', notes: 2 },
  ]);
  assert.ok(!/Secret|9999|Vacances|Erquy|noteId|note_id/.test(list.text), 'aucune donnée des notes');
});

test('administration : renommer (un nom pris par une autre étiquette est refusé), changer la couleur ; journal en anglais', async (t) => {
  const h = await sharedNote(t);
  const admin = h.people.guillaume.client;
  const patch = (id, body) => admin.request('PATCH', `/api/admin/labels/${id}`, body);
  const clash = await patch(h.famille.id, { name: 'MAISON' });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error, 'L\'étiquette « Maison » existe déjà (majuscules et accents ne comptent pas).');
  assert.equal((await patch(h.famille.id, { name: 'máïsôn' })).status, 409, 'accents ignorés');
  const own = await patch(h.maison.id, { name: 'MAISON' });
  assert.equal(own.status, 200, 'changer seulement les majuscules de sa propre étiquette : permis');
  assert.equal(own.body.item.name, 'MAISON');
  const renamed = await patch(h.famille.id, { name: 'Les nôtres', color: 'violet' });
  assert.equal(renamed.status, 200);
  assert.deepEqual(renamed.body.item, { id: h.famille.id, name: 'Les nôtres', color: 'violet', notes: 0 });
  assert.equal((await h.create('zoe', { name: 'les notres' })).body.existing, true, 'nouveau nom : même règle');
  for (const body of [{}, { name: '' }, { name: 'x'.repeat(31) }, { color: 'noir' }, { name: 'a‮b' }]) assert.equal((await patch(h.famille.id, body)).status, 400, JSON.stringify(body));
  for (const id of ['999', 'abc', '0', '-1']) assert.equal((await patch(id, { name: 'X' })).status, 404, id);
  assert.deepEqual((await h.sync('paul')).labels.find((l) => l.id === h.famille.id), { id: h.famille.id, name: 'Les nôtres', color: 'violet' });
  const journal = h.app.logs.join('\n');
  assert.match(journal, /\[journal\] admin_label_renamed admin="guillaume" label="Les nôtres" ip="[^"]+" old="Famille"/);
  assert.match(journal, /\[journal\] admin_label_recolored admin="guillaume" label="Les nôtres" ip="[^"]+" color="violet" old="rose"/);
  assert.ok(!/Erquy|4711|Vacances/.test(journal), 'jamais le texte d\'une note');
});

test('administration : supprimer retire l\'étiquette de ses notes sans toucher aux notes ; leurs membres les reçoivent sans elle', async (t) => {
  const h = await sharedNote(t);
  await h.one('lea', { type: 'note.labels', noteId: h.noteId, labelIds: [h.famille.id, h.maison.id] });
  const before = h.app.db.prepare('SELECT title, body, version, updated_at FROM notes WHERE id = ?').get(h.noteId);
  const since = (await h.sync('zoe')).serverTime;
  h.app.clock.now += 1000;
  const res = await h.people.guillaume.client.del(`/api/admin/labels/${h.maison.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { notes: 1 });
  assert.deepEqual(h.app.db.prepare('SELECT title, body, version, updated_at FROM notes WHERE id = ?').get(h.noteId), before, 'la note ne change pas');
  const delta = await h.sync('zoe', since);
  assert.deepEqual(delta.notes.map((n) => n.labelIds), [[h.famille.id]]);
  assert.deepEqual(delta.labels.map((l) => l.id), [h.famille.id]);
  assert.equal((await h.people.guillaume.client.del(`/api/admin/labels/${h.maison.id}`)).status, 404, 'déjà supprimée');
  // Une opération encore en file avec l'étiquette supprimée : refusée
  assert.equal((await h.one('marc', { type: 'note.labels', noteId: h.noteId, labelIds: [h.maison.id] })).code, 'ops.etiquetteIntrouvable');
  assert.match(h.app.logs.join('\n'), /\[journal\] admin_label_deleted admin="guillaume" label="Maison" notes=1 ip="[^"]+"/);
});

// --- Lien public, file d'attente hors ligne ---

test('page publique d\'une note : jamais ses étiquettes', async (t) => {
  const h = await sharedNote(t);
  await h.one('lea', { type: 'note.labels', noteId: h.noteId, labelIds: [h.famille.id] });
  const share = await h.people.lea.client.request('PUT', `/api/notes/${h.noteId}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const data = await createClient(h.app.base, { ip: '203.0.113.8' }).get(`/api/public/${token}`);
  assert.equal(data.status, 200);
  assert.deepEqual(Object.keys(data.body.note).sort(), ['body', 'title', 'updatedAt']);
  assert.ok(!/Famille|label/i.test(data.text));
});

test('copie locale : l\'opération hors ligne a le même effet que le serveur ; rejouée après la synchronisation', async (t) => {
  const h = await sharedNote(t);
  const user = { id: h.people.marc.id, displayName: 'Marc' };
  const state = loadSync(emptyState(), await h.sync('marc'));
  assert.deepEqual(state.labels.map((l) => l.name), ['Famille', 'Maison']);
  assert.deepEqual(state.notes.get(h.noteId).labelIds, []);
  const op = { id: uuid(), type: 'note.labels', noteId: h.noteId, labelIds: [h.maison.id, h.famille.id, h.maison.id] };
  applyOp(state, op, { user, now: new Date().toISOString() });
  const local = state.notes.get(h.noteId);
  assert.deepEqual(local.labelIds, [h.famille.id, h.maison.id]);
  assert.equal(local.version, 1, 'pas de nouvelle version');
  // Lecture seule : rien ne change sur le téléphone non plus
  const zoeState = loadSync(emptyState(), await h.sync('zoe'));
  applyOp(zoeState, { ...op, id: uuid() }, { user: { id: h.people.zoe.id }, now: new Date().toISOString() });
  assert.deepEqual(zoeState.notes.get(h.noteId).labelIds, []);
  // Invalide (trop d'étiquettes) : ignorée sur le téléphone comme refusée par le serveur
  applyOp(state, { id: uuid(), type: 'note.labels', noteId: h.noteId, labelIds: Array.from({ length: 11 }, (_, i) => i + 1) }, { user });
  assert.deepEqual(state.notes.get(h.noteId).labelIds, [h.famille.id, h.maison.id]);
  // Envoyée au serveur : même résultat, puis la synchronisation le confirme
  const since = state.serverTime;
  assert.equal((await h.people.marc.client.post('/api/ops', { ops: [op] })).body.results[0].status, 200);
  mergeSync(state, await h.sync('marc', since));
  assert.deepEqual(state.notes.get(h.noteId).labelIds, [h.famille.id, h.maison.id]);
  // Étiquette supprimée par l'Admin : elle disparaît de la réserve, et de la note
  await h.people.guillaume.client.del(`/api/admin/labels/${h.famille.id}`);
  mergeSync(state, await h.sync('marc', state.serverTime));
  assert.deepEqual(state.labels.map((l) => l.id), [h.maison.id]);
  assert.deepEqual(state.notes.get(h.noteId).labelIds, [h.maison.id]);
});
