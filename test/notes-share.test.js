// Notes, partage (étape 3 du cadrage docs/cadrage-accueil-notes-notifications.md,
// migration 37) : droits sur chaque opération et dans la synchronisation,
// partage et départ, épingle et nouveautés propres à chacun, temps réel aux
// seules personnes de la note, conflit entre deux personnes, corbeille,
// journal de sécurité, et lien public d'une note (page publique en lecture
// seule, construite champ par champ).
//
// Foyer : Léa (propriétaire des notes), Marc (« Peut modifier »), Zoé
// (« Lecture seule »), Paul (n'a rien), Guillaume (Admin, n'a rien non plus).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, createClient, tempDir, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { noteAccess } from '../server/notes.js';
import { emptyState, loadSync, mergeSync, applyOp, isNoteUnread, notesHaveNews, canEditNote, notePeople } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const HOUR = 60 * 60 * 1000;

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
  const share = (noteId, access, who = 'lea') => people[who].client.request('PUT', `/api/notes/${noteId}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  return { app, people, ops, one, sync, share };
}

// Une note de Léa, partagée avec Marc (modifier) et Zoé (lecture seule)
async function sharedNote(t) {
  const h = await household(t);
  const noteId = uuid();
  assert.equal((await h.one('lea', { type: 'note.create', noteId, title: 'Vacances', body: 'Gîte à Erquy, code 4711' })).status, 200);
  const res = await h.share(noteId, { marc: 'modification', zoe: 'lecture' });
  assert.equal(res.status, 200, res.text);
  return { ...h, noteId };
}

// --- Migration 37 ---

test('migration 37 : membres, lien public, lecture et sourdines ; base existante mise à jour, cascades', (t) => {
  assert.equal(MIGRATIONS.length, 40);
  const fresh = openDatabase(':memory:');
  assert.equal(schemaVersion(fresh), 40);
  for (const table of ['note_members', 'note_public_shares']) {
    assert.ok(fresh.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table);
  }
  const columns = fresh.prepare('PRAGMA table_info(note_user_state)').all().map((c) => c.name);
  for (const column of ['pinned', 'last_read_version', 'muted_news', 'muted_push']) assert.ok(columns.includes(column), column);
  // Base d'avant (version 36) avec une note épinglée : elle garde tout, et
  // reçoit sa date de synchronisation (changed_at = sa date de modification)
  const file = path.join(tempDir(t), 'old.db');
  const old = databaseAt(file, 36);
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('anne', 'Anne', 'x'), ('bob', 'Bob', 'x')").run();
  old.prepare("INSERT INTO notes (id, owner_id, title, body, created_at, updated_at) VALUES ('n1', 1, 'Codes', 'secret', '2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z')").run();
  old.prepare("INSERT INTO note_user_state (note_id, user_id, pinned) VALUES ('n1', 1, 1)").run();
  old.close();
  const db = openDatabase(file);
  assert.equal(schemaVersion(db), 40);
  assert.deepEqual(db.prepare('SELECT title, changed_at FROM notes').get(), { title: 'Codes', changed_at: '2026-11-02T00:00:00.000Z' });
  assert.deepEqual(db.prepare('SELECT pinned, last_read_version, muted_news, muted_push FROM note_user_state').get(), { pinned: 1, last_read_version: 0, muted_news: 0, muted_push: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) FROM note_members').pluck().get(), 0, 'aucune note partagée au départ');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  // Droit : 'modification' ou 'lecture' seulement
  assert.throws(() => db.prepare("INSERT INTO note_members (note_id, user_id, access) VALUES ('n1', 2, 'admin')").run(), /CHECK/);
  db.prepare("INSERT INTO note_members (note_id, user_id, access) VALUES ('n1', 2, 'lecture')").run();
  db.prepare("INSERT INTO note_public_shares (note_id, token_hash, token_sealed, created_by, created_at) VALUES ('n1', 'h', 's', 1, 'x')").run();
  // Un seul lien non arrêté par note
  assert.throws(() => db.prepare("INSERT INTO note_public_shares (note_id, token_hash, token_sealed, created_by, created_at) VALUES ('n1', 'h2', 's', 1, 'x')").run(), /UNIQUE/);
  // Effacer la note : ses membres, ses épingles et son lien partent avec elle
  db.prepare("DELETE FROM notes WHERE id = 'n1'").run();
  for (const table of ['note_members', 'note_user_state', 'note_public_shares']) assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, table);
});

// --- Droits ---

test('droits : propriétaire, « Peut modifier », « Lecture seule », non-membre et Admin, sur chaque opération', async (t) => {
  const h = await sharedNote(t);
  const { noteId } = h;
  const version = () => h.app.db.prepare('SELECT version FROM notes WHERE id = ?').pluck().get(noteId);
  // Peut modifier : écrit le titre et le texte
  assert.equal((await h.one('marc', { type: 'note.update', noteId, body: 'Gîte à Erquy, vélos', baseVersion: version() })).status, 200);
  // Lecture seule : refus 403, rien n'est écrit
  const read = await h.one('zoe', { type: 'note.update', noteId, body: 'Piraté', baseVersion: version() });
  assert.deepEqual([read.status, read.code], [403, 'ops.noteLectureSeule']);
  // Non-membre et Admin : 404, exactement comme une note inconnue
  for (const who of ['paul', 'guillaume']) {
    for (const op of [
      { type: 'note.update', noteId, body: 'Piraté', baseVersion: version() },
      { type: 'note.pin', noteId, pinned: true },
      { type: 'note.seen', noteId, upTo: 99 },
      { type: 'note.mute', noteId, muted: true },
      { type: 'note.delete', noteId },
      { type: 'note.restore', noteId },
    ]) {
      const res = await h.one(who, op);
      assert.deepEqual([res.status, res.code], [404, 'ops.noteIntrouvable'], `${who} ${op.type}`);
    }
    assert.equal((await h.one(who, { type: 'note.purge', noteIds: [noteId] })).purged, 0);
    for (const [method, url, body] of [
      ['PUT', `/api/notes/${noteId}/members`, { userIds: [] }],
      ['POST', `/api/notes/${noteId}/leave`, {}],
      ['GET', `/api/notes/${noteId}/share`, undefined],
      ['PUT', `/api/notes/${noteId}/share`, {}],
      ['DELETE', `/api/notes/${noteId}/share`, undefined],
    ]) assert.equal((await h.people[who].client.request(method, url, body)).status, 404, `${who} ${method} ${url}`);
    const mine = await h.sync(who);
    assert.deepEqual(mine.noteIds, []);
    assert.ok(!JSON.stringify(mine).includes('Erquy'), 'rien de la note dans sa synchronisation');
  }
  // Seul le propriétaire supprime, restaure, partage et gère le lien public :
  // un membre reçoit 403 (opérations) ou 404 (lien public, comme une note inconnue)
  for (const who of ['marc', 'zoe']) {
    assert.equal((await h.one(who, { type: 'note.delete', noteId })).code, 'ops.noteProprietaireSeulement', who);
    assert.equal((await h.one(who, { type: 'note.restore', noteId })).code, 'ops.noteProprietaireSeulement', who);
    assert.equal((await h.one(who, { type: 'note.purge', noteIds: [noteId] })).purged, 0);
    assert.equal((await h.people[who].client.request('PUT', `/api/notes/${noteId}/members`, { userIds: [h.people.paul.id] })).status, 403, who);
    assert.equal((await h.people[who].client.get(`/api/notes/${noteId}/share`)).status, 404, who);
    assert.equal((await h.people[who].client.request('PUT', `/api/notes/${noteId}/share`, {})).status, 404, who);
    // Chacun épingle et règle ses nouveautés pour lui-même, lecture seule comprise
    for (const op of [{ type: 'note.pin', noteId, pinned: true }, { type: 'note.mute', noteId, muted: false }, { type: 'note.seen', noteId, upTo: version() }]) {
      assert.equal((await h.one(who, op)).status, 200, `${who} ${op.type}`);
    }
  }
  assert.equal(h.app.db.prepare('SELECT deleted_at FROM notes').pluck().get(), null);
  // Le propriétaire ne quitte pas sa note
  const leave = await h.people.lea.client.post(`/api/notes/${noteId}/leave`);
  assert.equal(leave.status, 403);
  // Fonction unique des droits
  assert.equal(noteAccess({ id: 2 }, { owner_id: 2, deleted_at: 'x' }), 'owner');
  assert.equal(noteAccess({ id: 3 }, { owner_id: 2, member_access: 'modification' }), 'edit');
  assert.equal(noteAccess({ id: 4 }, { owner_id: 2, member_access: 'lecture' }), 'read');
  assert.equal(noteAccess({ id: 3 }, { owner_id: 2, member_access: 'modification', deleted_at: 'x' }), null, 'corbeille : propriétaire seul');
  assert.equal(noteAccess({ id: 5 }, { owner_id: 2, member_access: null }), null);
});

test('synchronisation : chacun reçoit son droit et les personnes, jamais l\'épingle ni les sourdines d\'un autre', async (t) => {
  const h = await sharedNote(t);
  const { noteId } = h;
  await h.one('lea', { type: 'note.pin', noteId, pinned: true });
  await h.one('lea', { type: 'note.mute', noteId, muted: true });
  const marc = await h.sync('marc');
  assert.deepEqual(marc.noteIds, [noteId]);
  const note = marc.notes[0];
  assert.equal(note.access, 'edit');
  assert.equal(note.body, 'Gîte à Erquy, code 4711');
  assert.deepEqual(note.members, [
    { id: h.people.lea.id, displayName: 'Léa', active: true, isOwner: true, access: 'modification' },
    { id: h.people.marc.id, displayName: 'Marc', active: true, isOwner: false, access: 'modification' },
    { id: h.people.zoe.id, displayName: 'Zoé', active: true, isOwner: false, access: 'lecture' },
  ]);
  // Seulement ce que les listes donnent de leurs membres : ni identifiant de
  // connexion, ni mot de passe, ni rôle ; jamais le lien public d'un autre
  assert.ok(!('publicLink' in note));
  assert.deepEqual(Object.keys(note).sort(), ['access', 'body', 'createdAt', 'deletedAt', 'id', 'members', 'ownerId', 'title', 'updatedAt', 'updatedBy', 'updatedByName', 'version']);
  assert.deepEqual(marc.pinnedNotes, [], 'l\'épingle de Léa n\'est pas la sienne');
  assert.deepEqual(marc.noteNews, { unread: [], muted: [] });
  assert.equal((await h.sync('zoe')).notes[0].access, 'read');
  const lea = await h.sync('lea');
  assert.equal(lea.notes[0].access, 'owner');
  assert.deepEqual(lea.pinnedNotes, [noteId]);
  assert.deepEqual(lea.noteNews.muted, [noteId]);
  assert.deepEqual(lea.notes[0].publicLink, null, 'le propriétaire voit l\'état du lien (aucun)');
  // Ajout d'une personne : elle reçoit la note par une synchronisation
  // « depuis », sans que la date de modification de la note change
  const since = (await h.sync('paul')).serverTime;
  const updatedAt = h.app.db.prepare('SELECT updated_at FROM notes').pluck().get();
  h.app.clock.now += 1000;
  assert.equal((await h.share(noteId, { marc: 'modification', zoe: 'lecture', paul: 'lecture' })).status, 200);
  const paul = await h.sync('paul', since);
  assert.deepEqual(paul.notes.map((n) => n.id), [noteId]);
  assert.equal(h.app.db.prepare('SELECT updated_at FROM notes').pluck().get(), updatedAt);
  assert.deepEqual(paul.noteNews.unread, [], 'une note qu\'on vient de me partager n\'est pas une nouveauté');
});

test('partage : retirer, changer le droit, quitter ; la personne perd la note et son épingle ; règles des listes', async (t) => {
  const h = await sharedNote(t);
  const { noteId } = h;
  await h.one('zoe', { type: 'note.pin', noteId, pinned: true });
  await h.one('zoe', { type: 'note.mute', noteId, muted: true });
  // Refus, avant toute écriture : compte inconnu ou désactivé, droit invalide,
  // droit donné au propriétaire ou à une personne non choisie
  const lea = h.people.lea.client;
  for (const body of [
    { userIds: [999] },
    { userIds: [h.people.paul.id], access: { [h.people.paul.id]: 'admin' } },
    { userIds: [h.people.paul.id], access: { [h.people.lea.id]: 'lecture' } },
    { userIds: [h.people.paul.id], access: { [h.people.marc.id]: 'lecture' } },
    { userIds: 'tous' },
    { userIds: Array.from({ length: 51 }, (_, i) => i + 10) },
  ]) assert.equal((await lea.request('PUT', `/api/notes/${noteId}/members`, body)).status, 400, JSON.stringify(body));
  h.app.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(h.people.paul.id);
  assert.equal((await lea.request('PUT', `/api/notes/${noteId}/members`, { userIds: [h.people.paul.id] })).status, 400);
  h.app.db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(h.people.paul.id);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM note_members').pluck().get(), 2, 'rien n\'a changé');
  // Zoé passe en « Peut modifier », puis est retirée : elle perd la note,
  // son épingle et sa sourdine
  assert.equal((await h.share(noteId, { marc: 'modification', zoe: 'modification' })).status, 200);
  assert.equal((await h.sync('zoe')).notes[0].access, 'edit');
  assert.equal((await h.share(noteId, { marc: 'modification' })).status, 200);
  const zoe = await h.sync('zoe');
  assert.deepEqual([zoe.noteIds, zoe.pinnedNotes, zoe.noteNews.muted], [[], [], []]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM note_user_state WHERE user_id = ?').pluck().get(h.people.zoe.id), 0);
  assert.equal((await h.one('zoe', { type: 'note.update', noteId, body: 'x', baseVersion: 1 })).status, 404, 'retirée : comme une note inconnue');
  // Remise dans la note : elle repart sans épingle
  assert.equal((await h.share(noteId, { marc: 'modification', zoe: 'lecture' })).status, 200);
  assert.deepEqual((await h.sync('zoe')).pinnedNotes, []);
  // Marc quitte la note : elle disparaît de ses appareils
  await h.one('marc', { type: 'note.pin', noteId, pinned: true });
  assert.equal((await h.people.marc.client.post(`/api/notes/${noteId}/leave`)).status, 200);
  const marc = await h.sync('marc');
  assert.deepEqual([marc.noteIds, marc.pinnedNotes], [[], []]);
  assert.equal((await h.people.marc.client.post(`/api/notes/${noteId}/leave`)).status, 404, 'plus membre');
  // Journal de sécurité (en anglais) : jamais le titre ni le texte de la note
  const journal = h.app.logs.join('\n');
  for (const event of ['note_member_added', 'note_access_changed', 'note_member_removed', 'note_left']) assert.match(journal, new RegExp(`\\[journal\\] ${event} `), event);
  assert.match(journal, /note_member_added user="lea" note="[0-9a-f-]+" member="marc" access="edit"/);
  assert.ok(!/Erquy|Vacances|4711/.test(journal));
  // Un compte membre d'une note n'est plus « jamais utilisé » : pas de suppression
  const removal = await h.people.guillaume.client.del(`/api/admin/users/${h.people.zoe.id}`);
  assert.notEqual(removal.status, 200);
});

test('corbeille : la note disparaît pour ses membres ; restaurée, elle revient avec leur épingle ; effacée, plus rien', async (t) => {
  const h = await sharedNote(t);
  const { noteId } = h;
  await h.one('marc', { type: 'note.pin', noteId, pinned: true });
  assert.equal((await h.one('lea', { type: 'note.delete', noteId })).status, 200);
  for (const who of ['marc', 'zoe']) {
    const mine = await h.sync(who);
    assert.deepEqual(mine.noteIds, [], who);
    assert.equal((await h.one(who, { type: 'note.pin', noteId, pinned: false })).status, 404, 'dans la corbeille : propriétaire seul');
  }
  const lea = await h.sync('lea');
  assert.ok(lea.notes[0].deletedAt);
  assert.equal((await h.one('lea', { type: 'note.restore', noteId })).status, 200);
  const marc = await h.sync('marc');
  assert.deepEqual([marc.noteIds, marc.pinnedNotes], [[noteId], [noteId]]);
  // Effacée pour de bon : membres et épingles partent avec elle
  await h.one('lea', { type: 'note.delete', noteId });
  assert.equal((await h.one('lea', { type: 'note.purge', noteIds: [noteId] })).purged, 1);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM note_members').pluck().get(), 0);
  assert.deepEqual((await h.sync('marc')).noteIds, []);
});

test('deux personnes écrivent en même temps : rien n\'est écrasé, le refus donne le prénom de l\'autre', async (t) => {
  const h = await sharedNote(t);
  const { noteId } = h;
  const first = await h.one('marc', { type: 'note.update', noteId, body: 'Version de Marc', baseVersion: 1 });
  assert.equal(first.status, 200);
  const second = await h.one('lea', { type: 'note.update', noteId, body: 'Version de Léa', baseVersion: 1 });
  assert.equal(second.status, 409);
  assert.equal(second.current.updatedByName, 'Marc');
  assert.equal(second.current.body, 'Version de Marc');
  assert.equal(h.app.db.prepare('SELECT body FROM notes').pluck().get(), 'Version de Marc');
  // « Garder la mienne » : sur la version actuelle, elle passe
  assert.equal((await h.one('lea', { type: 'note.update', noteId, body: 'Version de Léa', baseVersion: 2 })).status, 200);
  const zoe = (await h.sync('zoe')).notes[0];
  assert.deepEqual([zoe.body, zoe.updatedByName, zoe.version], ['Version de Léa', 'Léa', 3]);
});

test('nouveautés : une modification des autres est signalée ; lue sur un appareil, lue sur tous ; sourdine ; réglage « Nouveautés »', async (t) => {
  const h = await sharedNote(t);
  const { noteId } = h;
  assert.deepEqual((await h.sync('lea')).noteNews.unread, [], 'ma propre note n\'est pas une nouveauté');
  await h.one('marc', { type: 'note.update', noteId, body: 'Ajout de Marc', baseVersion: 1 });
  assert.deepEqual((await h.sync('lea')).noteNews.unread, [noteId]);
  assert.deepEqual((await h.sync('zoe')).noteNews.unread, [noteId]);
  assert.deepEqual((await h.sync('marc')).noteNews.unread, [], 'jamais ses propres modifications');
  // Léa l'ouvre sur un appareil : lue sur son autre appareil aussi
  const other = h.app.client();
  await login(other, 'lea', 'MotDePasse-lea');
  assert.equal((await h.one('lea', { type: 'note.seen', noteId, upTo: 2 })).status, 200);
  assert.deepEqual((await other.get('/api/sync')).body.noteNews.unread, []);
  // Jamais vers le bas, jamais au-delà de la version actuelle
  await h.one('lea', { type: 'note.seen', noteId, upTo: 0 });
  await h.one('lea', { type: 'note.seen', noteId, upTo: 99 });
  assert.equal(h.app.db.prepare('SELECT last_read_version FROM note_user_state WHERE user_id = ? AND note_id = ?').pluck().get(h.people.lea.id, noteId), 2);
  assert.equal((await h.one('lea', { type: 'note.seen', noteId, upTo: -1 })).status, 400);
  // Sourdine : rien n'est signalé ; « Nouveautés » désactivé : rien non plus
  await h.one('zoe', { type: 'note.mute', noteId, muted: true });
  assert.deepEqual((await h.sync('zoe')).noteNews, { unread: [], muted: [noteId] });
  await h.one('zoe', { type: 'note.mute', noteId, muted: false });
  assert.deepEqual((await h.sync('zoe')).noteNews.unread, [noteId]);
  await h.one('zoe', { type: 'account.news', enabled: false });
  assert.deepEqual((await h.sync('zoe')).noteNews.unread, []);
  // Copie locale du téléphone : même règle (et lue tout de suite à l'ouverture)
  await h.one('zoe', { type: 'account.news', enabled: true });
  const state = loadSync(emptyState(), await h.sync('zoe'));
  assert.equal(isNoteUnread(state, noteId), true);
  assert.equal(notesHaveNews(state), true);
  assert.equal(canEditNote(state.notes.get(noteId)), false, 'lecture seule');
  assert.deepEqual(notePeople(state.notes.get(noteId)).map((m) => m.displayName), ['Léa', 'Marc', 'Zoé']);
  applyOp(state, { id: uuid(), type: 'note.seen', noteId, upTo: 2 }, { user: { id: h.people.zoe.id }, now: 'x' });
  assert.equal(isNoteUnread(state, noteId), false);
  assert.equal(notesHaveNews(state), false);
  mergeSync(state, await h.sync('zoe', state.serverTime));
  assert.equal(isNoteUnread(state, noteId), true, 'le serveur fait foi (l\'opération n\'est pas partie)');
});

test('temps réel : seuls le propriétaire et les membres sont prévenus ; une personne retirée l\'est aussi, une dernière fois', async (t) => {
  const h = await sharedNote(t);
  const { noteId } = h;
  const calls = [];
  const original = h.app.ctx.events.notifyNotes;
  h.app.ctx.events.notifyNotes = (ids) => {
    calls.push([...new Set(ids)].sort());
    original(ids);
  };
  const ids = (...keys) => keys.map((k) => h.people[k].id).sort();
  await h.one('marc', { type: 'note.update', noteId, body: 'x', baseVersion: 1 });
  assert.deepEqual(calls.pop(), ids('lea', 'marc', 'zoe'));
  await h.one('zoe', { type: 'note.pin', noteId, pinned: true });
  assert.deepEqual(calls.pop(), ids('zoe'), 'l\'épingle ne regarde que moi');
  await h.share(noteId, { marc: 'modification' });
  assert.deepEqual(calls.pop(), ids('lea', 'marc', 'zoe'));
  await h.one('marc', { type: 'note.update', noteId, body: 'y', baseVersion: 2 });
  assert.deepEqual(calls.pop(), ids('lea', 'marc'), 'plus Zoé');
  // Refusé (lecture seule, ou personne) : personne n'est prévenu
  const before = calls.length;
  await h.one('paul', { type: 'note.update', noteId, body: 'z', baseVersion: 3 });
  assert.equal(calls.length, before);
});

// --- Lien public d'une note ---

const visitor = (h, ip = '203.0.113.7') => createClient(h.app.base, { ip });
async function createLink(h, body = {}) {
  const res = await h.people.lea.client.request('PUT', `/api/notes/${h.noteId}/share`, body);
  assert.equal(res.status, 201, res.text);
  return { share: res.body.share, token: res.body.share.url.split('/p/')[1] };
}

test('lien public d\'une note : page en lecture seule, réponse champ par champ, rien sur les personnes', async (t) => {
  const h = await sharedNote(t);
  await h.one('marc', { type: 'note.update', noteId: h.noteId, body: 'Gîte : https://exemple.fr/gite\nNe pas oublier javascript:alert(1)', baseVersion: 1 });
  await h.one('lea', { type: 'note.pin', noteId: h.noteId, pinned: true });
  const { share, token } = await createLink(h);
  assert.equal(share.protected, false);
  assert.ok(share.expiresAt, '24 heures par défaut');
  // Une seule personne : Léa voit son lien ; la carte le dit (publicLink)
  assert.deepEqual((await h.sync('lea')).notes[0].publicLink, { expiresAt: share.expiresAt });
  assert.equal((await h.people.lea.client.request('PUT', `/api/notes/${h.noteId}/share`, {})).status, 200, 'déjà actif : changement');
  const v = visitor(h);
  const page = await v.request('GET', `/p/${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /data-kind="note"/);
  assert.match(page.text, /<title>Listo · Note partagée<\/title>/);
  assert.ok(!page.text.includes('Erquy') && !page.text.includes('Vacances'), 'la page ne contient rien de la note');
  const data = (await v.get(`/api/public/${token}`)).body;
  assert.deepEqual(Object.keys(data).sort(), ['expiresAt', 'note']);
  assert.deepEqual(Object.keys(data.note).sort(), ['body', 'title', 'updatedAt']);
  assert.equal(data.note.title, 'Vacances');
  assert.match(data.note.body, /exemple\.fr/);
  const text = JSON.stringify(data);
  for (const secret of ['Léa', 'Marc', 'Zoé', 'lea', 'marc', 'pinned', h.noteId, '"id"', 'owner', 'members']) assert.ok(!text.includes(secret), secret);
  // Une note n'a ni photo ni souhait : réponse d'un lien inconnu
  assert.equal((await v.get(`/api/public/${token}/photos/${uuid()}`)).status, 404);
  assert.equal((await v.post(`/api/public/${token}/souhaits/${uuid()}`, { firstName: 'Ana' })).status, 404);
  // Aucune écriture possible
  assert.equal((await v.request('PUT', `/api/public/${token}`, { body: 'x' })).status, 404);
  // Page anglaise pour un navigateur anglais
  const en = await v.request('GET', `/p/${token}`, undefined, { 'accept-language': 'en-US' });
  assert.match(en.text, /<title>Listo · Shared note<\/title>/);
  // Le jeton n'est jamais écrit en clair : ni en base, ni dans le journal
  const tables = h.app.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
  for (const table of tables) assert.ok(!JSON.stringify(h.app.db.prepare(`SELECT * FROM ${table}`).all()).includes(token), table);
  assert.ok(!h.app.logs.join('\n').includes(token));
  assert.match(h.app.logs.join('\n'), /note_link_created user="lea" note="[0-9a-f-]+" share=1 ip="[^"]+" duration="24 h" password_protected=false/);
  assert.ok(!/Erquy|Vacances|exemple\.fr/.test(h.app.logs.join('\n')), 'jamais le texte de la note');
});

test('lien public d\'une note : expiration, arrêt, corbeille puis restauration, inconnu : la même page ; mot de passe et 5 essais', async (t) => {
  const h = await sharedNote(t);
  const { token } = await createLink(h, { durationHours: 2 });
  const v = visitor(h);
  const unknown = await v.request('GET', `/p/${'A'.repeat(43)}`);
  assert.equal(unknown.status, 404);
  const same = async (url) => {
    const res = await visitor(h, '198.51.100.9').request('GET', url);
    assert.equal(res.status, 404, url);
    assert.equal(res.text, unknown.text, 'même page, au caractère près');
  };
  // Corbeille : le lien ne mène plus à rien ; restaurée : il remarche
  await h.one('lea', { type: 'note.delete', noteId: h.noteId });
  await same(`/p/${token}`);
  assert.equal((await v.get(`/api/public/${token}`)).status, 404);
  await h.one('lea', { type: 'note.restore', noteId: h.noteId });
  assert.equal((await v.get(`/api/public/${token}`)).status, 200);
  // Expiré (horloge du serveur) : même page
  h.app.clock.now += 2 * HOUR + 1;
  await same(`/p/${token}`);
  // Un nouveau lien, protégé : mot de passe montré une seule fois
  const second = await createLink(h, { protect: true, durationHours: null });
  assert.equal(second.share.expiresAt, null);
  assert.match(second.share.password, /^.{16}$/);
  assert.equal((await h.people.lea.client.get(`/api/notes/${h.noteId}/share`)).body.share.password, undefined);
  const w = visitor(h, '192.0.2.44');
  assert.equal((await w.get(`/api/public/${second.token}`)).status, 401);
  for (let i = 0; i < 4; i++) assert.equal((await w.post(`/api/public/${second.token}/acces`, { password: 'faux' })).status, 401);
  assert.equal((await w.post(`/api/public/${second.token}/acces`, { password: 'faux' })).status, 429, '5e essai : bloqué');
  assert.equal((await w.post(`/api/public/${second.token}/acces`, { password: second.share.password })).status, 429, 'même le bon, pendant le blocage');
  const journal = h.app.logs.join('\n');
  assert.match(journal, /note_link_password_refused share=2/);
  assert.match(journal, /note_link_entry_blocked share=2/);
  assert.ok(!journal.includes(second.share.password) && !journal.includes(second.token));
  // Le lien reste bloqué 15 minutes (pour tous) ; ensuite, autre visiteur,
  // bon mot de passe : la note ; nouveau mot de passe : le cookie ne vaut plus
  h.app.clock.now += 16 * 60 * 1000;
  const x = visitor(h, '192.0.2.45');
  assert.equal((await x.post(`/api/public/${second.token}/acces`, { password: second.share.password })).status, 200);
  assert.equal((await x.get(`/api/public/${second.token}`)).status, 200);
  assert.equal((await h.people.lea.client.request('PUT', `/api/notes/${h.noteId}/share`, { password: 'new' })).status, 200);
  assert.equal((await x.get(`/api/public/${second.token}`)).status, 401);
  // Arrêt : même page ; le propriétaire désactivé arrête aussi ses liens
  assert.equal((await h.people.lea.client.del(`/api/notes/${h.noteId}/share`)).status, 200);
  await same(`/p/${second.token}`);
  assert.match(h.app.logs.join('\n'), /note_link_stopped user="lea"/);
});

test('lien public : un cookie ouvert pour une note n\'ouvre pas la liste dont le lien a le même numéro', async (t) => {
  const h = await sharedNote(t);
  // Lien de liste n° 1 (protégé) et lien de note n° 1 (protégé)
  const listId = uuid();
  await h.one('lea', { type: 'list.create', listId, name: 'Courses', listType: 'shopping' });
  const listLink = (await h.people.lea.client.request('PUT', `/api/lists/${listId}/share`, { protect: true })).body.share;
  const noteLink = (await createLink(h, { protect: true })).share;
  assert.equal(listLink.id, noteLink.id, 'mêmes numéros dans les deux tables');
  const listToken = listLink.url.split('/p/')[1];
  const noteToken = noteLink.url.split('/p/')[1];
  const v = visitor(h);
  assert.equal((await v.post(`/api/public/${noteToken}/acces`, { password: noteLink.password })).status, 200);
  assert.equal((await v.get(`/api/public/${noteToken}`)).status, 200);
  // Le cookie est posé pour l'adresse du lien de la note ; envoyé tel quel
  // à l'adresse de la liste, il n'ouvre rien
  const cookie = [...v.jar].map(([n, val]) => `${n}=${val}`).join('; ');
  const res = await fetch(`${h.app.base}/api/public/${listToken}`, { headers: { cookie, origin: h.app.base } });
  assert.equal(res.status, 401);
  // Et la page d'une liste reste celle d'une liste
  assert.match((await v.request('GET', `/p/${listToken}`)).text, /Liste partagée/);
});
