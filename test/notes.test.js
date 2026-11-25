// Notes, socle (étape 2 du cadrage docs/cadrage-accueil-notes-notifications.md,
// migration 36) : droits, opérations rejouables, conflits, épingle propre à
// chaque personne, corbeille, ménage, limites, adresses web,
// copie locale du téléphone (même résultat que le serveur) et file
// d'attente hors ligne.
//
// Foyer : Guillaume (Admin) et Léa. Étape 2 : une note n'est visible que
// par son propriétaire ; l'Admin ne voit jamais celles des autres.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, tempDir, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { emptyState, loadSync, mergeSync, applyOp, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { createQueue } from '../public/js/queue.js';
import { memoryLocal } from '../public/js/localdb.js';
import {
  linkParts, safeLink, noteTitle, noteExcerpt, sortNotes, liveNotes, trashedNotes, NOTE_BODY_MAX, NOTE_TITLE_MAX, NOTES_MAX, trashDaysLeft,
} from '../public/js/notes.js';
import { noteAccess } from '../server/notes.js';

const uuid = () => crypto.randomUUID();
const DAY = 24 * 60 * 60 * 1000;

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  app.db.prepare("UPDATE users SET display_name = 'Léa' WHERE id = ?").run(leaId);
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const ops = async (client, list) => (await client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) })).body.results;
  const one = async (client, op) => (await ops(client, [op]))[0];
  const sync = async (client, since) => (await client.get(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync')).body;
  return { app, guillaume, lea, leaId, ops, one, sync };
}

// --- Migration 36 ---

test('migration 36 : tables des notes créées sur une base neuve et sur une base existante, clés étrangères en ordre', (t) => {
  assert.equal(MIGRATIONS.length, 45); // (37 : partage des notes, test/notes-share.test.js)
  const fresh = openDatabase(':memory:');
  assert.equal(schemaVersion(fresh), 45);
  for (const table of ['notes', 'note_user_state']) {
    assert.ok(fresh.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table);
  }
  // Base d'avant (version 35) avec un compte et une liste : rien ne change pour eux
  const file = path.join(tempDir(t), 'old.db');
  const old = databaseAt(file, 35);
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('anne', 'Anne', 'x')").run();
  old.prepare("INSERT INTO lists (id, name, type, owner_id) VALUES ('11111111-1111-4111-8111-111111111111', 'Courses', 'shopping', 1)").run();
  old.close();
  const db = openDatabase(file);
  assert.equal(schemaVersion(db), 45);
  assert.equal(db.prepare('SELECT COUNT(*) FROM notes').pluck().get(), 0);
  assert.equal(db.prepare('SELECT name FROM lists').pluck().get(), 'Courses');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'note_categories'").get(), undefined, 'pas de catégories (abandonnées le 23 novembre 2026)');
  // Effacer une note : son épingle part avec elle
  db.prepare("INSERT INTO notes (id, owner_id, created_at, updated_at) VALUES ('n1', 1, 'x', 'x')").run();
  db.prepare("INSERT INTO note_user_state (note_id, user_id, pinned) VALUES ('n1', 1, 1)").run();
  db.prepare("DELETE FROM notes WHERE id = 'n1'").run();
  assert.equal(db.prepare('SELECT COUNT(*) FROM note_user_state').pluck().get(), 0);
  assert.throws(() => db.prepare("INSERT INTO notes (id, owner_id, body, created_at, updated_at) VALUES ('n2', 1, ?, 'x', 'x')").run('a'.repeat(NOTE_BODY_MAX + 1)), /CHECK/);
});

// --- Droits ---

test('droits : seul le propriétaire voit et modifie sa note ; une autre personne et l\'Admin reçoivent 404, rien dans leur synchronisation', async (t) => {
  const h = await household(t);
  const noteId = uuid();
  const created = await h.one(h.lea, { type: 'note.create', noteId, title: 'Codes', body: 'Wi-Fi : secret' });
  assert.equal(created.status, 200);
  assert.deepEqual(Object.keys(created).sort(), ['id', 'status', 'version'], 'réponse courte, sans le texte');
  assert.equal(created.version, 1);
  // L'Admin (Guillaume) : la note n'existe pas pour lui, quelle que soit l'opération
  for (const op of [
    { type: 'note.update', noteId, title: 'Piraté', baseVersion: 1 },
    { type: 'note.delete', noteId },
    { type: 'note.restore', noteId },
    { type: 'note.pin', noteId, pinned: true },
  ]) {
    const res = await h.one(h.guillaume, op);
    assert.equal(res.status, 404, op.type);
    assert.equal(res.code, 'ops.noteIntrouvable');
  }
  // Même réponse qu'une note inconnue
  assert.equal((await h.one(h.guillaume, { type: 'note.update', noteId: uuid(), title: 'x', baseVersion: 1 })).code, 'ops.noteIntrouvable');
  // « Supprimer définitivement » une note d'un autre : rien n'est effacé, rien n'est dit
  assert.deepEqual((await h.one(h.guillaume, { type: 'note.purge', noteIds: [noteId] })).purged, 0);
  const admin = await h.sync(h.guillaume);
  assert.deepEqual(admin.notes, []);
  assert.deepEqual(admin.noteIds, []);
  assert.ok(!JSON.stringify(admin).includes('Wi-Fi'));
  const mine = await h.sync(h.lea);
  assert.deepEqual(mine.noteIds, [noteId]);
  assert.equal(mine.notes[0].body, 'Wi-Fi : secret');
  assert.equal(h.app.db.prepare('SELECT title FROM notes').pluck().get(), 'Codes');
  // Fonction unique des droits
  assert.equal(noteAccess({ id: 2 }, { owner_id: 2 }), 'owner');
  assert.equal(noteAccess({ id: 1 }, { owner_id: 2 }), null);
  assert.equal(noteAccess({ id: 1 }, undefined), null);
  // Le journal de sécurité ne contient jamais le texte d'une note
  assert.ok(!h.app.logs.join('\n').includes('Wi-Fi'));
});

test('opérations rejouables : la même opération deux fois ne crée qu\'une note et ne change la version qu\'une fois', async (t) => {
  const h = await household(t);
  const noteId = uuid();
  const create = { id: uuid(), type: 'note.create', noteId, body: 'Pain' };
  const update = { id: uuid(), type: 'note.update', noteId, body: 'Pain, beurre', baseVersion: 1 };
  const first = (await h.lea.post('/api/ops', { ops: [create, update] })).body.results;
  const again = (await h.lea.post('/api/ops', { ops: [create, update] })).body.results;
  assert.deepEqual(first.map((r) => r.status), [200, 200]);
  assert.ok(again.every((r) => r.duplicate === true));
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM notes').pluck().get(), 1);
  assert.equal(h.app.db.prepare('SELECT version FROM notes').pluck().get(), 2);
});

// --- Conflits ---

test('conflit : deux enregistrements sur la même version, le second est refusé avec la version actuelle ; rien n\'est écrasé', async (t) => {
  const h = await household(t);
  const noteId = uuid();
  await h.one(h.lea, { type: 'note.create', noteId, title: 'Vacances', body: 'Gîte' });
  // Deux appareils de Léa, tous deux sur la version 1
  const phone = await h.one(h.lea, { type: 'note.update', noteId, body: 'Gîte à Erquy', baseVersion: 1 });
  assert.equal(phone.status, 200);
  assert.equal(phone.version, 2);
  const laptop = await h.one(h.lea, { type: 'note.update', noteId, body: 'Gîte, vélos', baseVersion: 1 });
  assert.equal(laptop.status, 409);
  assert.equal(laptop.code, 'ops.noteConflit');
  assert.deepEqual(Object.keys(laptop.current).sort(), ['body', 'title', 'updatedAt', 'updatedBy', 'updatedByName', 'version']);
  assert.equal(laptop.current.version, 2);
  assert.equal(laptop.current.body, 'Gîte à Erquy');
  assert.equal(h.app.db.prepare('SELECT body FROM notes').pluck().get(), 'Gîte à Erquy');
  // Enregistrement suivant du même appareil (écrit après le refusé) : refusé aussi
  const chained = await h.one(h.lea, { type: 'note.update', noteId, body: 'Gîte, vélos, crème', baseVersion: 2, afterOp: laptop.id });
  assert.equal(chained.status, 409);
  assert.equal(h.app.db.prepare('SELECT body FROM notes').pluck().get(), 'Gîte à Erquy');
  // « Garder la mienne » : sur la version actuelle
  const mine = await h.one(h.lea, { type: 'note.update', noteId, body: 'Gîte, vélos, crème', baseVersion: 2 });
  assert.equal(mine.status, 200);
  assert.equal(mine.version, 3);
  // « Garder les deux » : le téléphone crée une copie (« (copie) »), épinglée comme la mienne
  await h.one(h.lea, { type: 'note.pin', noteId, pinned: true });
  const copy = uuid();
  assert.equal((await h.one(h.lea, { type: 'note.create', noteId: copy, title: 'Vacances (copie)', body: 'Gîte, vélos', pinned: true })).status, 200);
  const data = await h.sync(h.lea);
  assert.equal(data.notes.length, 2);
  assert.deepEqual(data.pinnedNotes.sort(), [noteId, copy].sort());
});

test('file d\'attente hors ligne : rejouée au retour du réseau sans perte ni doublon ; un conflit garde mon texte', async (t) => {
  const h = await household(t);
  const noteId = uuid();
  await h.one(h.lea, { type: 'note.create', noteId, title: 'Courses', body: 'Lait' });
  // Le téléphone de Léa (hors ligne) : copie locale et file
  const user = { id: h.leaId, displayName: 'Léa' };
  const state = loadSync(emptyState(), await h.sync(h.lea));
  const storage = memoryLocal();
  let online = false;
  const refused = [];
  const queue = createQueue({
    storage,
    transport: {
      sendOps: async (list) => {
        if (!online) throw new Error('hors ligne');
        return (await h.lea.post('/api/ops', { ops: list })).body.results;
      },
    },
    events: { refused: (entry, message, code, result) => refused.push({ entry, code, result }) },
    delay: () => 1e9,
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
  });
  const perform = async (op) => {
    const full = { id: uuid(), ...op };
    await queue.add({ kind: 'op', op: full });
    applyOp(state, full, { user, now: new Date().toISOString() });
    return full;
  };
  const first = await perform({ type: 'note.update', noteId, body: 'Lait, œufs', baseVersion: 1 });
  await perform({ type: 'note.update', noteId, body: 'Lait, œufs, pain', baseVersion: 2, afterOp: first.id });
  const other = uuid();
  await perform({ type: 'note.create', noteId: other, body: 'Idée' });
  assert.equal(state.notes.get(noteId).version, 3, 'version prévue sur le téléphone');
  assert.equal(await queue.flush(), 'offline');
  online = true;
  assert.equal(await queue.flush(), 'done');
  assert.equal(await queue.flush(), 'done', 'file vide : rien à envoyer, la file reste utilisable');
  const server = await h.sync(h.lea);
  assert.equal(server.notes.length, 2, 'aucun doublon');
  assert.equal(server.notes.find((n) => n.id === noteId).body, 'Lait, œufs, pain');
  assert.equal(server.notes.find((n) => n.id === noteId).version, 3, 'même version que prévue sur le téléphone');
  assert.deepEqual(refused, []);

  // Un autre appareil enregistre pendant que ce téléphone est hors ligne
  online = false;
  const mine = await perform({ type: 'note.update', noteId, body: 'Mon texte hors ligne', baseVersion: 3 });
  await perform({ type: 'note.update', noteId, body: 'Mon texte hors ligne, suite', baseVersion: 4, afterOp: mine.id });
  await h.one(h.lea, { type: 'note.update', noteId, body: 'Texte de l\'ordinateur', baseVersion: 3 });
  online = true;
  assert.equal(await queue.flush(), 'done');
  assert.deepEqual(refused.map((r) => r.code), ['ops.noteConflit', 'ops.noteConflit'], 'les deux enregistrements refusés, rien d\'écrasé');
  assert.equal(refused[1].entry.op.body, 'Mon texte hors ligne, suite', 'mon dernier texte est connu du téléphone');
  assert.equal(refused[0].result.current.body, 'Texte de l\'ordinateur');
  assert.equal(h.app.db.prepare('SELECT body FROM notes WHERE id = ?').pluck().get(noteId), 'Texte de l\'ordinateur');
});

test('copie locale : applyOp donne le même résultat que le serveur (notes, épingles, corbeille)', async (t) => {
  const h = await household(t);
  const user = { id: h.leaId, displayName: 'Léa' };
  const state = loadSync(emptyState(), await h.sync(h.lea));
  const [n1, n2, n3] = [uuid(), uuid(), uuid()];
  const list = [
    { type: 'note.create', noteId: n1, title: 'Crêpes\nrecette', body: 'Farine\r\nœufs' },
    { type: 'note.create', noteId: n2, body: 'Gîte', pinned: true },
    { type: 'note.create', noteId: n3, body: 'Brouillon' },
    { type: 'note.update', noteId: n1, body: 'Farine, lait', baseVersion: 1 },
    { type: 'note.update', noteId: n1, title: 'Crêpes', baseVersion: 2 },
    { type: 'note.pin', noteId: n1, pinned: true },
    { type: 'note.pin', noteId: n2, pinned: false },
    { type: 'note.delete', noteId: n2 },
    { type: 'note.delete', noteId: n3 },
    { type: 'note.purge', noteIds: [n3] },
  ].map((op) => ({ id: uuid(), ...op }));
  for (const op of list) applyOp(state, op, { user, now: '2026-11-23T10:00:00.000Z' });
  const results = (await h.lea.post('/api/ops', { ops: list })).body.results;
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results));
  const server = loadSync(emptyState(), await h.sync(h.lea));
  const shape = (s) => ({
    notes: [...s.notes.values()].map(({ id, title, body, version, deletedAt }) => ({ id, title, body, version, deleted: Boolean(deletedAt) })).sort((a, b) => a.id.localeCompare(b.id)),
    pinned: [...s.pinnedNotes].sort(),
    ids: [...s.noteIds].sort(),
  });
  assert.deepEqual(shape(state), shape(server));
  assert.equal(server.notes.get(n1).title, 'Crêpes');
  assert.equal(server.notes.get(n1).body, 'Farine, lait');
  assert.equal(server.notes.get(n1).version, 3);
  assert.ok(!server.notes.has(n3));
  // La copie gardée sur le téléphone relit tout (notes « À vérifier » comprises)
  state.noteConflicts.set(n1, { title: 'Crêpes', body: 'mon texte', at: 'x' });
  const again = fromSnapshot(toSnapshot(state));
  assert.deepEqual(shape(again), shape(state));
  assert.equal(again.noteConflicts.get(n1).body, 'mon texte');
  // Une synchronisation ne retire jamais une note « À vérifier »
  mergeSync(again, await h.sync(h.lea, state.serverTime));
  assert.equal(again.noteConflicts.get(n1).body, 'mon texte');
});

test('épingle propre à chaque personne : jamais transmise à une autre', async (t) => {
  const h = await household(t);
  const noteId = uuid();
  await h.ops(h.lea, [{ type: 'note.create', noteId, body: 'x' }, { type: 'note.pin', noteId, pinned: true }]);
  assert.deepEqual((await h.sync(h.lea)).pinnedNotes, [noteId]);
  assert.deepEqual((await h.sync(h.guillaume)).pinnedNotes, []);
  assert.equal((await h.one(h.lea, { type: 'note.pin', noteId, pinned: 'oui' })).code, 'ops.epingleInvalide');
});

test('corbeille : la note disparaît des notes, garde son épingle et revient telle qu\'elle était ; rejouable', async (t) => {
  const h = await household(t);
  const [a, b] = [uuid(), uuid()];
  await h.ops(h.lea, [
    { type: 'note.create', noteId: a, body: 'Wi-Fi', pinned: true },
    { type: 'note.create', noteId: b, body: 'Gîte' },
    { type: 'note.delete', noteId: a },
  ]);
  let state = loadSync(emptyState(), await h.sync(h.lea));
  assert.deepEqual(liveNotes([...state.notes.values()]).map((n) => n.id), [b]);
  assert.deepEqual(trashedNotes([...state.notes.values()]).map((n) => n.id), [a]);
  assert.ok(state.pinnedNotes.has(a), 'épingle gardée pendant la corbeille');
  // Rejouer « supprimer » ne change rien
  assert.equal((await h.one(h.lea, { type: 'note.delete', noteId: a })).status, 200);
  await h.one(h.lea, { type: 'note.restore', noteId: a });
  state = loadSync(emptyState(), await h.sync(h.lea));
  assert.equal(liveNotes([...state.notes.values()]).length, 2);
  assert.ok(state.pinnedNotes.has(a));
  // Rejouer « restaurer » ne change rien de plus
  assert.equal((await h.one(h.lea, { type: 'note.restore', noteId: a })).status, 200);
});

test('ménage : une note dans la corbeille depuis plus de 30 jours est effacée pour de bon ; « Vider la corbeille »', async (t) => {
  const h = await household(t);
  const [old, recent, live] = [uuid(), uuid(), uuid()];
  await h.ops(h.lea, [
    { type: 'note.create', noteId: old, body: 'Vieille' },
    { type: 'note.create', noteId: recent, body: 'Récente' },
    { type: 'note.create', noteId: live, body: 'Vivante' },
    { type: 'note.delete', noteId: old },
  ]);
  h.app.clock.now += 20 * DAY;
  await h.one(h.lea, { type: 'note.delete', noteId: recent });
  h.app.clock.now += 11 * DAY;
  // Restaurer au-delà de 30 jours : introuvable
  assert.equal((await h.one(h.lea, { type: 'note.restore', noteId: old })).code, 'ops.noteIntrouvable');
  assert.equal(h.app.ctx.notes.purgeDeleted(), 1);
  const data = await h.sync(h.lea);
  assert.deepEqual(data.noteIds.sort(), [recent, live].sort());
  // Le téléphone l'oublie à sa synchronisation
  const state = loadSync(emptyState(), data);
  assert.ok(!state.notes.has(old));
  // Jours restants : au moins 1
  assert.equal(trashDaysLeft(new Date(h.app.clock.now - 11 * DAY).toISOString(), h.app.clock.now), 19);
  // Vider la corbeille : seules les notes de la corbeille partent
  const res = await h.one(h.lea, { type: 'note.purge', noteIds: [recent, live] });
  assert.equal(res.purged, 1);
  assert.deepEqual((await h.sync(h.lea)).noteIds, [live]);
});

test('limites : titre, texte (413), 2 000 notes corbeille comprise', async (t) => {
  const h = await household(t);
  const long = await h.one(h.lea, { type: 'note.create', noteId: uuid(), title: 'x'.repeat(NOTE_TITLE_MAX + 1) });
  assert.equal(long.status, 400);
  assert.equal(long.code, 'ops.titreNoteTropLong');
  const big = await h.one(h.lea, { type: 'note.create', noteId: uuid(), body: 'x'.repeat(NOTE_BODY_MAX + 1) });
  assert.equal(big.status, 413);
  assert.equal(big.code, 'ops.texteNoteTropLong');
  // Une note de 20 000 caractères accentués passe (lot jusqu'à 2 Mo)
  assert.equal((await h.one(h.lea, { type: 'note.create', noteId: uuid(), body: 'é'.repeat(NOTE_BODY_MAX) })).status, 200);
  // 2 000 notes, corbeille comprise
  const insert = h.app.db.prepare("INSERT INTO notes (id, owner_id, created_at, updated_at, deleted_at) VALUES (?, ?, 'x', 'x', ?)");
  h.app.db.transaction(() => {
    for (let i = 1; i < NOTES_MAX; i++) insert.run(uuid(), h.leaId, i % 2 ? '2026-10-16T00:00:00.000Z' : null);
  })();
  const full = await h.one(h.lea, { type: 'note.create', noteId: uuid(), body: 'une de trop' });
  assert.equal(full.status, 400);
  assert.equal(full.code, 'ops.notesLimite');
});

test('plafond de débit : un lot qui dépasse le plafond des enregistrements est refusé en entier (429), rien n\'est appliqué', async (t) => {
  const h = await household(t);
  h.app.ctx.noteSaves.take(h.leaId, 3599);
  const noteId = uuid();
  const res = await h.lea.post('/api/ops', { ops: [{ id: uuid(), type: 'note.create', noteId, body: 'a' }, { id: uuid(), type: 'note.update', noteId, body: 'b', baseVersion: 1 }] });
  assert.equal(res.status, 429);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM notes').pluck().get(), 0);
  // Les autres personnes ne sont pas gênées
  assert.equal((await h.one(h.guillaume, { type: 'note.create', noteId: uuid(), body: 'ok' })).status, 200);
});

test('temps réel : seuls les appareils du propriétaire sont prévenus, sans aucune donnée de la note', async (t) => {
  const h = await household(t);
  const sent = [];
  const original = h.app.ctx.events.notifyNotes;
  h.app.ctx.events.notifyNotes = (ids) => {
    sent.push(ids);
    original(ids);
  };
  await h.one(h.lea, { type: 'note.create', noteId: uuid(), body: 'secret' });
  await h.one(h.lea, { type: 'note.update', noteId: uuid(), body: 'refusé', baseVersion: 1 });
  assert.deepEqual(sent, [[h.leaId]], 'une fois, pour Léa seulement ; rien après un refus');
});

// --- Règles partagées (public/js/notes.js) ---

test('adresses web : seulement http et https, jamais javascript:, data: ni une adresse mal formée', () => {
  const parts = linkParts('Réservation : https://www.exemple.fr/gite-erquy.\nVoir (http://exemple.org/a?b=1), fin');
  assert.deepEqual(parts.filter((p) => p.href).map((p) => p.text), ['https://www.exemple.fr/gite-erquy', 'http://exemple.org/a?b=1']);
  assert.equal(parts.map((p) => p.text).join(''), 'Réservation : https://www.exemple.fr/gite-erquy.\nVoir (http://exemple.org/a?b=1), fin');
  for (const text of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://', 'https://', 'ftp://exemple.fr', 'https://user:pass@exemple.fr', 'jaVascript://exemple.fr/%0aalert(1)', 'www.exemple.fr', 'mailto:a@b.fr']) {
    assert.ok(linkParts(text).every((p) => !p.href), text);
  }
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('https://exemple.fr/a b'), 'https://exemple.fr/a%20b');
  // « https://exemple.fr" onclick=… » : le guillemet arrête l'adresse
  assert.deepEqual(linkParts('https://exemple.fr" onclick="x').filter((p) => p.href).map((p) => p.href), ['https://exemple.fr/']);
});

test('titre affiché, extrait, ordre : règles partagées', () => {
  assert.equal(noteTitle({ title: '  ', body: '\n\n  Première ligne \nSuite' }), 'Première ligne');
  assert.equal(noteTitle({ title: '', body: '' }), '');
  assert.equal(noteExcerpt({ title: '', body: 'Titre\nLigne 1\n\nLigne 2' }), 'Ligne 1 Ligne 2');
  assert.equal(noteExcerpt({ title: 'Titre', body: 'Ligne 1' }), 'Ligne 1');
  const pinned = new Set(['b']);
  const notes = [{ id: 'a', title: 'Zèbre', updatedAt: '2' }, { id: 'b', title: 'Mer', updatedAt: '1' }, { id: 'c', title: 'Avion', updatedAt: '3' }];
  assert.deepEqual(sortNotes(notes, pinned).map((n) => n.id), ['b', 'c', 'a']);
  assert.deepEqual(sortNotes(notes, pinned, 'alpha').map((n) => n.id), ['b', 'c', 'a']);
  assert.deepEqual(sortNotes(notes, new Set(), 'alpha').map((n) => n.id), ['c', 'b', 'a']);
  assert.deepEqual(trashedNotes([{ id: 'x', deletedAt: '1' }, { id: 'y' }, { id: 'z', deletedAt: '2' }]).map((n) => n.id), ['z', 'x']);
});
