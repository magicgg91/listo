// Page Notifications (étape 4 du cadrage docs/cadrage-accueil-notes-notifications.md,
// migration 38) : la page se remplit SANS LISTO_PUSH et sans appareil
// (modifications, chacun son tour, partage d'une liste et d'une note, note
// modifiée, résumé du matin, rappel) ; mêmes filtres que le téléphone
// (catégorie coupée, sourdine d'une liste ou d'une note) ; regroupement ;
// lu sur un appareil = lu sur tous (temps réel) ; effacer ; 30 jours et 300
// lignes ; langue du compte au moment de la lecture ; lignes construites
// champ par champ ; jamais les lignes d'un autre ; cible revérifiée ;
// numéros propres à chaque personne ; avec LISTO_PUSH, une seule écriture
// pour la page et le téléphone (ni résumé ni rappel en double).

import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { GROUP_MS, localDay } from '../server/notify.js';
import { INBOX_MAX, INBOX_DAYS, INBOX_GROUP_MS, renderRow, parseSelection } from '../server/inbox.js';

const fixed = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let opCounter = 0;
const opId = () => fixed(700000 + (opCounter += 1));
const ROW_KEYS = ['at', 'category', 'count', 'createdAt', 'id', 'kind', 'read', 'sub', 'target', 'targetType', 'text'];

// Un foyer : Guillaume (Admin), Léa, Marc ; SANS LISTO_PUSH par défaut
async function family(t, { push = false } = {}) {
  const service = push ? fakePushService() : null;
  const app = await startTestApp(t, { config: { push }, ...(push ? { pushRequest: service } : {}) });
  t.after(() => app.ctx.notify.stop());
  if (service) service.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1 } };
  app.db.prepare("UPDATE users SET display_name = 'Guillaume' WHERE id = 1").run();
  for (const [key, name] of [['lea', 'Léa'], ['marc', 'Marc']]) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  const ops = async (who, list) => {
    const res = await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: opId(), ...op })) });
    assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
    return res.body.results;
  };
  const share = (listId, access, who = 'guillaume') => people[who].client.request('PUT', `/api/lists/${listId}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  const page = async (who) => {
    const res = await people[who].client.get('/api/inbox');
    assert.equal(res.status, 200, res.text);
    return res.body;
  };
  const texts = async (who) => (await page(who)).rows.map((r) => r.text);
  const tick = async (ms) => {
    app.clock.now += ms;
    await app.ctx.notify.flushDue();
    await app.ctx.push?.idle();
  };
  return { app, people, ops, share, page, texts, tick, service };
}

// Une liste de courses de Guillaume partagée avec Léa (modifier) et Marc (lecture)
async function withCourses(t, options) {
  const f = await family(t, options);
  const courses = fixed(1);
  await f.ops('guillaume', [{ type: 'list.create', listId: courses, name: 'Courses', listType: 'shopping' }]);
  assert.equal((await f.share(courses, { lea: 'modification', marc: 'lecture' })).status, 200);
  return { ...f, courses };
}

// Heure locale du serveur : tel jour (décalage), telle heure
function at(app, dayOffset, hour, minute = 0) {
  const date = new Date(app.clock.now);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

// Flux temps réel d'un client (comme test/events.test.js)
async function openStream(app, client) {
  const controller = new AbortController();
  const headers = { cookie: [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ') };
  const res = await fetch(`${app.base}/api/events`, { headers, signal: controller.signal });
  const stream = { events: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = block.match(/^event: (.*)$/m)?.[1];
          if (event) stream.events.push({ event, data: block.match(/^data: (.*)$/m)?.[1] });
        }
      }
    } catch {
      // flux coupé par le test
    }
  })();
  stream.count = (name) => stream.events.filter((e) => e.event === name).length;
  stream.waitFor = async (name, n = 1) => {
    for (let i = 0; i < 300 && stream.count(name) < n; i++) await pause(10);
    assert.ok(stream.count(name) >= n, `${name} × ${n} attendu`);
  };
  stream.close = () => controller.abort();
  await stream.waitFor('ready');
  return stream;
}

test('migration 38 : table inbox et compteur par personne ; base existante mise à jour ; lignes effacées avec le compte', () => {
  assert.equal(MIGRATIONS.length, 41);
  const db = openDatabase(':memory:');
  assert.equal(schemaVersion(db), 41);
  const cols = db.prepare('PRAGMA table_info(inbox)').all().map((c) => c.name);
  assert.deepEqual(cols, ['id', 'user_id', 'num', 'category', 'text_key', 'params', 'target_type', 'target_id', 'group_key', 'count', 'created_at', 'updated_at', 'read_at']);
  assert.ok(db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'inbox_seq'));
  db.prepare("INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'g', 'G', 'x')").run();
  const insert = db.prepare("INSERT INTO inbox (user_id, num, category, text_key, created_at, updated_at) VALUES (1, ?, ?, 'digest', 'x', 'x')");
  insert.run(1, 'due');
  assert.throws(() => insert.run(2, 'autre'), /CHECK/, 'catégorie inconnue refusée');
  assert.throws(() => insert.run(1, 'due'), /UNIQUE/, 'numéro unique par personne');
  db.prepare('DELETE FROM users WHERE id = 1').run();
  assert.equal(db.prepare('SELECT COUNT(*) FROM inbox').pluck().get(), 0, 'effacées avec le compte');
});

test('sans LISTO_PUSH ni appareil : modifications regroupées en une ligne, jamais à leur auteur ; partage ; lignes champ par champ', async (t) => {
  const f = await withCourses(t);
  assert.equal(f.app.ctx.push, null);
  // Partage : Léa et Marc ont chacun leur ligne
  assert.deepEqual(await f.texts('lea'), ['Guillaume a partagé la liste « Courses » avec vous']);
  assert.deepEqual(await f.texts('marc'), ['Guillaume a partagé la liste « Courses » avec vous']);
  assert.deepEqual(await f.texts('guillaume'), [], 'jamais l\'auteur');
  // Léa ajoute deux articles : une ligne chez Guillaume et Marc, une minute après
  await f.ops('lea', [
    { type: 'item.create', listId: f.courses, itemId: fixed(2), name: 'Lait' },
    { type: 'item.create', listId: f.courses, itemId: fixed(3), name: 'Pain' },
  ]);
  assert.deepEqual(await f.texts('guillaume'), [], 'rien avant la fin de la minute');
  await f.tick(GROUP_MS);
  const page = await f.page('guillaume');
  assert.equal(page.unread, 1);
  assert.equal(page.rows.length, 1);
  const [row] = page.rows;
  assert.deepEqual(Object.keys(row).sort(), ROW_KEYS, 'champ par champ : rien d\'interne (ni compte, ni valeurs brutes, ni clé de regroupement)');
  assert.equal(row.text, 'Léa a ajouté 2 articles dans « Courses »');
  assert.equal(row.sub, 'Modifications');
  assert.deepEqual([row.category, row.kind, row.read, row.count, row.targetType], ['changes', 'changes', false, 1, 'list']);
  assert.deepEqual(row.target, { type: 'list', listId: f.courses });
  assert.equal(row.id, 1, 'numéro propre à Guillaume');
  assert.equal((await f.page('lea')).rows.length, 1, 'Léa : seulement son partage');
  // Une coche dans la demi-heure : la MÊME ligne, mise à jour, de nouveau non lue
  assert.equal((await f.people.guillaume.client.post('/api/inbox/read', { ids: [1] })).status, 200);
  await f.tick(5 * 60 * 1000);
  await f.ops('lea', [{ type: 'item.check', itemId: fixed(2), checked: true }]);
  await f.tick(GROUP_MS);
  const again = await f.page('guillaume');
  assert.equal(again.rows.length, 1, 'regroupée');
  assert.deepEqual([again.rows[0].text, again.rows[0].count, again.rows[0].read], ['Léa a fait 3 changements dans « Courses »', 2, false]);
  // Plus d'une demi-heure après : une nouvelle ligne
  await f.tick(INBOX_GROUP_MS + 1000);
  await f.ops('lea', [{ type: 'item.create', listId: f.courses, itemId: fixed(4), name: 'Œufs' }]);
  await f.tick(GROUP_MS);
  assert.deepEqual(await f.texts('guillaume'), ['Léa a ajouté 1 article dans « Courses »', 'Léa a fait 3 changements dans « Courses »']);
  assert.equal((await f.page('lea')).rows.length, 1, 'jamais ses propres changements');
});

test('sans LISTO_PUSH : chacun son tour, note partagée puis modifiée (titre relu, jamais le texte)', async (t) => {
  const f = await family(t);
  const maison = fixed(10);
  const poubelles = fixed(11);
  await f.ops('guillaume', [{ type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', dueEnabled: true, assignEnabled: true }]);
  await f.share(maison, { lea: 'modification', marc: 'modification' });
  await f.ops('guillaume', [{ type: 'item.create', listId: maison, itemId: poubelles, name: 'Sortir les poubelles', dueDate: '2030-01-07', repeat: 'week:1', assignMode: 'turn', assignPeople: [f.people.lea.id, f.people.marc.id] }]);
  await f.tick(GROUP_MS);
  await f.ops('lea', [{ type: 'item.check', itemId: poubelles, checked: true }]);
  await f.tick(GROUP_MS);
  const [turn] = (await f.page('marc')).rows;
  assert.deepEqual([turn.text, turn.sub, turn.kind], ['C\'est votre tour : Sortir les poubelles', 'Modifications · Maison', 'turn']);
  // Note de Léa partagée avec Marc, puis modifiée par Léa
  const note = fixed(12);
  await f.ops('lea', [{ type: 'note.create', noteId: note, title: 'Vacances', body: 'Code du portail : 4711' }]);
  assert.equal((await f.people.lea.client.request('PUT', `/api/notes/${note}/members`, { userIds: [f.people.marc.id], access: { [f.people.marc.id]: 'lecture' } })).status, 200);
  const version = () => f.app.db.prepare('SELECT version FROM notes WHERE id = ?').pluck().get(note);
  await f.ops('lea', [{ type: 'note.update', noteId: note, title: 'Vacances', body: 'Code du portail : 9999', baseVersion: version() }]);
  await f.tick(GROUP_MS);
  const rows = (await f.page('marc')).rows;
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.text, r.sub, r.target]), [
    ['Léa a modifié la note « Vacances »', 'Modifications', { type: 'note', noteId: note }],
    ['Léa a partagé la note « Vacances » avec vous', 'Partage', { type: 'note', noteId: note }],
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /4711|9999|portail/, 'jamais le texte de la note');
  assert.doesNotMatch(f.app.db.prepare('SELECT group_concat(params) FROM inbox').pluck().get(), /Vacances|portail/, 'ni son titre ni son texte en base');
  // Titre changé : la page le relit ; note quittée : plus de titre, plus de cible
  await f.ops('lea', [{ type: 'note.update', noteId: note, title: 'Bretagne', body: 'x', baseVersion: version() }]);
  assert.equal((await f.page('marc')).rows.find((r) => r.target?.noteId === note).text, 'Léa a modifié la note « Bretagne »');
  assert.equal((await f.people.marc.client.post(`/api/notes/${note}/leave`)).status, 200);
  const gone = (await f.page('marc')).rows.filter((r) => r.targetType === 'note');
  assert.ok(gone.length === 2 && gone.every((r) => r.target === null), 'la ligne reste, sans cible');
  assert.deepEqual(gone.map((r) => r.text), ['Léa a modifié une note', 'Léa a partagé une note avec vous']);
});

test('sans LISTO_PUSH : résumé du matin (une fois par jour) et rappel (une fois par signature)', async (t) => {
  const f = await family(t);
  f.app.clock.now = at(f.app, 1, 6);
  const today = localDay(new Date(f.app.clock.now));
  const maison = fixed(20);
  await f.ops('guillaume', [
    { type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', dueEnabled: true },
    { type: 'item.create', listId: maison, itemId: fixed(21), name: 'Payer la cantine', dueDate: today },
    { type: 'item.create', listId: maison, itemId: fixed(22), name: 'Dentiste', dueDate: today, dueTime: '09:15', remindBefore: 15 },
  ]);
  await f.share(maison, { lea: 'modification' });
  await f.tick(GROUP_MS);
  f.app.clock.now = at(f.app, 0, 8);
  await f.app.ctx.notify.runDigest();
  await f.app.ctx.notify.runDigest();
  for (const who of ['guillaume', 'lea']) {
    const digest = (await f.page(who)).rows.filter((r) => r.kind === 'digest');
    assert.equal(digest.length, 1, `${who} : une seule fois`);
    assert.deepEqual([digest[0].text, digest[0].sub, digest[0].target, digest[0].category], ['2 tâches à faire aujourd\'hui', 'Résumé du matin', { type: 'deadlines' }, 'due']);
  }
  // Rappel : 15 min avant 9:15
  f.app.clock.now = at(f.app, 0, 9);
  await f.app.ctx.notify.runReminders();
  await f.app.ctx.notify.runReminders();
  for (const who of ['guillaume', 'lea']) {
    const reminders = (await f.page(who)).rows.filter((r) => r.kind === 'reminder');
    assert.equal(reminders.length, 1, `${who} : une seule fois`);
    assert.deepEqual([reminders[0].text, reminders[0].sub, reminders[0].target], ['Dentiste à 9:15', 'Rappel · Maison', { type: 'item', itemId: fixed(22), listId: maison }]);
  }
});

test('mêmes filtres que le téléphone : catégorie coupée, liste ou note dont on a coupé les notifications ; réglages sans LISTO_PUSH', async (t) => {
  const f = await withCourses(t);
  // Les réglages existent sans LISTO_PUSH (page et téléphone)
  const settings = await f.people.marc.client.get('/api/push/settings');
  assert.equal(settings.status, 200);
  assert.deepEqual(settings.body, { settings: { changes: true, due: true, wishes: true, sharing: true, detail: false }, mutedLists: [], mutedNotes: [] });
  assert.equal((await f.people.marc.client.get('/api/push')).status, 404, 'cet appareil : seulement avec LISTO_PUSH');
  assert.equal((await f.people.marc.client.request('PUT', '/api/push/settings', { changes: false })).status, 200);
  assert.equal((await f.people.guillaume.client.request('PUT', `/api/push/mutes/${f.courses}`, { muted: true })).status, 200);
  await f.ops('lea', [{ type: 'item.create', listId: f.courses, itemId: fixed(2), name: 'Lait' }]);
  await f.tick(GROUP_MS);
  assert.equal((await f.page('guillaume')).rows.length, 0, 'liste silencée');
  assert.equal((await f.page('marc')).rows.filter((r) => r.category === 'changes').length, 0, 'catégorie coupée');
  // Partage coupé
  assert.equal((await f.people.lea.client.request('PUT', '/api/push/settings', { sharing: false })).status, 200);
  const maison = fixed(5);
  await f.ops('guillaume', [{ type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks' }]);
  await f.share(maison, { lea: 'lecture' });
  assert.equal((await f.page('lea')).rows.filter((r) => r.text.includes('Maison')).length, 0);
  // Note dont Marc a coupé les notifications
  const note = fixed(6);
  await f.ops('lea', [{ type: 'note.create', noteId: note, title: 'Idées', body: 'a' }]);
  await f.people.lea.client.request('PUT', `/api/notes/${note}/members`, { userIds: [f.people.marc.id, f.people.guillaume.id], access: { [f.people.marc.id]: 'lecture', [f.people.guillaume.id]: 'lecture' } });
  assert.equal((await f.people.marc.client.request('PUT', `/api/push/note-mutes/${note}`, { muted: true })).status, 200);
  await f.ops('lea', [{ type: 'note.update', noteId: note, title: 'Idées', body: 'b', baseVersion: 1 }]);
  await f.tick(GROUP_MS);
  assert.ok(!(await f.texts('marc')).some((text) => text.includes('modifié la note')), 'note silencée');
  assert.ok((await f.texts('guillaume')).includes('Léa a modifié la note « Idées »'), 'les autres, oui');
});

test('lu sur un appareil = lu sur tous (temps réel) ; « Tout marquer comme lu » ne touche pas une ligne arrivée après ; file hors ligne', async (t) => {
  const f = await withCourses(t);
  const second = f.app.client();
  await login(second, 'lea', 'MotDePasse-lea');
  const stream = await openStream(f.app, second);
  t.after(() => stream.close());
  const marcStream = await openStream(f.app, f.people.marc.client);
  t.after(() => marcStream.close());
  const before = stream.count('inbox');
  const marcBefore = marcStream.count('inbox');
  await f.ops('guillaume', [{ type: 'item.create', listId: f.courses, itemId: fixed(2), name: 'Lait' }]);
  await f.tick(GROUP_MS);
  await stream.waitFor('inbox', before + 1);
  const rows = (await f.page('lea')).rows;
  assert.equal(rows.length, 2);
  assert.equal(stream.events.filter((e) => e.event === 'inbox').at(-1).data, '{}', 'aucune donnée dans le message');
  // Lu depuis le premier appareil, par la file d'attente (opération)
  const sync = (await f.people.lea.client.get('/api/sync')).body.inboxStamp;
  await f.ops('lea', [{ type: 'inbox.read', ids: [rows[0].id] }]);
  await stream.waitFor('inbox', before + 2);
  assert.deepEqual((await second.get('/api/inbox')).body.rows.map((r) => r.read), [true, false], 'le second appareil le voit lu');
  assert.notEqual((await second.get('/api/sync')).body.inboxStamp, sync, 'l\'empreinte de la synchronisation change');
  // « Tout marquer comme lu » jusqu'à la ligne vue ; une ligne arrivée après reste non lue
  const upTo = rows[0].at;
  f.app.clock.now += INBOX_GROUP_MS + 1000;
  await f.ops('guillaume', [{ type: 'item.create', listId: f.courses, itemId: fixed(3), name: 'Pain' }]);
  await f.tick(GROUP_MS);
  await f.ops('lea', [{ type: 'inbox.read', all: true, upTo }]);
  assert.deepEqual((await f.page('lea')).rows.map((r) => r.read), [false, true, true]);
  assert.equal((await f.page('lea')).unread, 1);
  // REST : tout
  assert.equal((await second.post('/api/inbox/read', { all: true })).body.unread, 0);
  assert.equal(marcStream.count('inbox') - marcBefore, 2, 'Marc : seulement ses propres lignes (deux modifications), rien de Léa');
  // Demandes invalides
  for (const bad of [{}, { ids: [] }, { ids: ['1'] }, { ids: [0] }, { all: true, ids: [1] }, { all: 'oui' }, { all: true, upTo: 'hier' }, [1]]) {
    assert.equal((await second.post('/api/inbox/read', bad)).status, 400, JSON.stringify(bad));
  }
  const refused = await f.people.lea.client.post('/api/ops', { ops: [{ id: opId(), type: 'inbox.delete', ids: 'tout' }] });
  assert.equal(refused.body.results[0].status, 400);
  assert.equal(refused.body.results[0].code, 'ops.inboxInvalide');
});

test('effacer une ligne, tout effacer ; jamais les lignes d\'un autre (lire, effacer : 404 ou rien)', async (t) => {
  const f = await withCourses(t);
  await f.ops('guillaume', [{ type: 'item.create', listId: f.courses, itemId: fixed(2), name: 'Lait' }]);
  await f.tick(GROUP_MS);
  const lea = (await f.page('lea')).rows;
  const marc = (await f.page('marc')).rows;
  assert.equal(lea.length, 2);
  assert.deepEqual(lea.map((r) => r.id), marc.map((r) => r.id), 'mêmes numéros chez chacun : ils ne se mélangent jamais');
  // Marc ne peut ni lire ni effacer celles de Léa : seules les siennes sont touchées
  await f.ops('marc', [{ type: 'inbox.delete', ids: [lea[0].id, lea[1].id] }]);
  assert.equal((await f.page('lea')).rows.length, 2, 'celles de Léa restent');
  assert.equal((await f.page('marc')).rows.length, 0);
  assert.equal((await f.people.marc.client.del(`/api/inbox/${lea[0].id}`)).status, 404);
  assert.equal((await f.people.marc.client.del('/api/inbox/abc')).status, 404);
  // Léa efface une ligne, puis tout
  const res = await f.people.lea.client.del(`/api/inbox/${lea[1].id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.rows.length, 1);
  assert.equal((await f.people.lea.client.del('/api/inbox')).body.rows.length, 0);
  assert.equal((await f.people.lea.client.del('/api/inbox?upTo=hier')).status, 400);
  // Le numéro suivant ne reprend jamais un numéro effacé
  await f.ops('guillaume', [{ type: 'item.create', listId: f.courses, itemId: fixed(3), name: 'Pain' }]);
  await f.tick(INBOX_GROUP_MS);
  assert.deepEqual((await f.page('lea')).rows.map((r) => r.id), [3]);
});

test('gardées 30 jours et 300 au plus par personne (les plus anciennes partent)', async (t) => {
  const f = await family(t);
  const inbox = f.app.ctx.inbox;
  for (let i = 0; i < INBOX_MAX + 5; i++) {
    inbox.add(f.people.lea.id, { category: 'due', textKey: 'digest', params: { today: i + 1, late: 0 }, targetType: 'deadlines' });
    f.app.clock.now += 1000;
  }
  const rows = (await f.page('lea')).rows;
  assert.equal(rows.length, INBOX_MAX);
  assert.equal(rows[0].id, INBOX_MAX + 5, 'la plus récente en haut');
  assert.equal(rows.at(-1).id, 6, 'les cinq plus anciennes sont parties');
  assert.equal(f.app.db.prepare('SELECT COUNT(*) FROM inbox WHERE user_id = ?').pluck().get(f.people.lea.id), INBOX_MAX);
  // 30 jours plus tard : plus rien à l'écran, puis effacées par le ménage
  f.app.clock.now += INBOX_DAYS * 24 * 3600 * 1000;
  assert.equal(inbox.rowsFor({ id: f.people.lea.id }).length, 0, 'plus montrées, même avant le ménage');
  assert.equal(inbox.purgeOld(), INBOX_MAX);
});

test('langue du compte au moment de la lecture : changer de langue traduit aussi l\'historique', async (t) => {
  const f = await withCourses(t);
  await f.ops('lea', [{ type: 'item.create', listId: f.courses, itemId: fixed(2), name: 'Lait' }]);
  await f.tick(GROUP_MS);
  assert.deepEqual((await f.page('guillaume')).rows.map((r) => [r.text, r.sub]), [['Léa a ajouté 1 article dans « Courses »', 'Modifications']]);
  f.app.db.prepare("UPDATE users SET locale = 'en' WHERE id = 1").run();
  assert.deepEqual((await f.page('guillaume')).rows.map((r) => [r.text, r.sub]), [['Léa added 1 item to “Courses”', 'Changes']]);
  assert.deepEqual((await f.page('marc')).rows.map((r) => r.text)[0], 'Léa a ajouté 1 article dans « Courses »', 'chacun sa langue');
  // Rappel en anglais : heure sur 12 heures, date américaine
  assert.equal(renderRow('reminder', { name: 'Dentist', list: 'Home', time: '14:30', date: '2026-11-12', when: 'date' }, 'due', 'en').text, 'Dentist on 11/12/2026 at 2:30 PM');
  assert.equal(renderRow('reminder', { name: 'Dentiste', list: 'Maison', time: '14:30', date: '2026-11-12', when: 'date' }, 'due', 'fr').text, 'Dentiste le 12/11/2026 à 14:30');
});

test('cible revérifiée à chaque lecture : retiré de la liste, liste supprimée : la ligne reste, sans cible', async (t) => {
  const f = await withCourses(t);
  await f.ops('lea', [{ type: 'item.create', listId: f.courses, itemId: fixed(2), name: 'Lait' }]);
  await f.tick(GROUP_MS);
  assert.deepEqual((await f.page('marc')).rows.map((r) => r.target), [{ type: 'list', listId: f.courses }, { type: 'list', listId: f.courses }]);
  await f.share(f.courses, { lea: 'modification' }); // Marc retiré
  const rows = (await f.page('marc')).rows;
  assert.equal(rows.length, 2, 'l\'historique reste');
  assert.ok(rows.every((r) => r.target === null && r.targetType === 'list'), 'plus d\'identifiant de la liste');
  await f.ops('guillaume', [{ type: 'list.delete', listId: f.courses }]);
  assert.ok((await f.page('lea')).rows.every((r) => r.target === null));
});

test('sélection : ids ou « tout » jusqu\'à une date ; rien d\'autre', () => {
  const now = '2026-11-23T10:00:00.000Z';
  assert.deepEqual(parseSelection({ ids: [3, 3, 4] }, now), { ids: [3, 4] });
  assert.deepEqual(parseSelection({ all: true }, now), { upTo: now });
  assert.deepEqual(parseSelection({ all: true, upTo: '2026-11-22T10:00:00.000Z' }, now), { upTo: '2026-11-22T10:00:00.000Z' });
  for (const bad of [null, [], {}, { ids: [] }, { ids: [1.5] }, { ids: [-1] }, { ids: Array.from({ length: INBOX_MAX + 1 }, (_, i) => i + 1) }, { all: false }, { all: true, upTo: 5 }]) {
    assert.equal(parseSelection(bad, now), null, JSON.stringify(bad));
  }
});

test('avec LISTO_PUSH : une seule écriture pour la page et le téléphone ; résumé et rappel jamais en double ; sans appareil, la page seule', async (t) => {
  const f = await family(t, { push: true });
  const lea = fakeDevice('https://fcm.googleapis.com/fcm/send/lea', 'lea');
  assert.equal((await f.people.lea.client.request('PUT', '/api/push/subscription', lea.subscription)).status, 200);
  f.app.clock.now = at(f.app, 1, 6);
  const today = localDay(new Date(f.app.clock.now));
  const maison = fixed(30);
  await f.ops('guillaume', [
    { type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', dueEnabled: true },
    { type: 'item.create', listId: maison, itemId: fixed(31), name: 'Dentiste', dueDate: today, dueTime: '09:15', remindBefore: 15 },
  ]);
  await f.share(maison, { lea: 'modification', marc: 'modification' });
  await f.tick(GROUP_MS);
  const pushes = () => f.service.calls.map((c) => lea.read(c.body).notification.title);
  assert.deepEqual(pushes(), ['Guillaume vous a ajouté à « Maison »']);
  f.app.clock.now = at(f.app, 0, 8);
  await f.app.ctx.notify.runDigest();
  await f.app.ctx.notify.runDigest();
  f.app.clock.now = at(f.app, 0, 9);
  await f.app.ctx.notify.runReminders();
  await f.app.ctx.notify.runReminders();
  await f.app.ctx.push.idle();
  assert.deepEqual(pushes(), ['Guillaume vous a ajouté à « Maison »', '1 tâche à faire aujourd\'hui', 'Rappel : une tâche aujourd\'hui à 9:15'], 'téléphone : une fois chacun');
  assert.deepEqual((await f.texts('lea')), ['Dentiste à 9:15', '1 tâche à faire aujourd\'hui', 'Guillaume a partagé la liste « Maison » avec vous'], 'page : les mêmes, une fois chacun');
  // Marc n'a aucun appareil : sa page a tout, aucun envoi pour lui
  assert.deepEqual((await f.texts('marc')).length, 3);
  assert.equal(f.service.calls.length, 3);
});
