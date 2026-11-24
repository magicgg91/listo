// Réglages › Fonctions (24 novembre 2026, migration 41) : chacun peut couper
// les notes pour lui seul. Réglage de chaque compte, le même sur tous ses
// appareils : vérifié par le serveur (server/features.js), donné par
// /api/me et la synchronisation, modifié par l'opération
// « account.features » (file d'attente : hors ligne compris). Notes
// coupées : ni bouton, ni tuile, ni entrée du menu de gauche, ni
// nouveautés, ni notifications (page et téléphone) ; leurs adresses mènent
// au premier écran ; rien n'est effacé. Règles partagées
// (public/js/features.js, public/js/home-tiles.js). Le rendu réel est
// vérifié dans Chromium (captures avant et après).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { GROUP_MS, NOTE_QUIET_MS } from '../server/notify.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { featuresFromRow } from '../server/features.js';
import {
  FEATURES, FEATURE_ROUTES, defaultFeatures, normalizeFeatures, featuresChangeProblem, applyFeaturesChange, featureOn, notesOn, featureOf, screenAllowed,
} from '../public/js/features.js';
import { HOME_TILES, firstScreen, tabScreens, startScreens, tilesFor, shownTiles, mergeTileOrder } from '../public/js/home-tiles.js';
import { emptyState, applyOp, loadSync, mergeSync, toSnapshot, fromSnapshot, isNoteUnread, inboxShownRows, inboxUnread } from '../public/js/store.js';
import { matchRoute, pathFor } from '../public/js/router.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';
import { GUIDE } from '../public/js/help-content.js';
import { GUIDE as GUIDE_EN } from '../public/js/help-content-en.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les commentaires de ligne
const code = (file) => read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
const OFF = { notes: false };

// Résultat d'une opération, sans son identifiant
async function run(client, op) {
  const { id, ...result } = (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  return result;
}

// --- Règles partagées (public/js/features.js) ---

test('réglage de départ : les notes sont utilisées ; valeurs abîmées ou inconnues écartées', () => {
  assert.deepEqual(FEATURES, ['notes']);
  assert.deepEqual(defaultFeatures(), { notes: true });
  for (const value of [null, undefined, 'abîmé', 42, {}, [], { notes: 'non' }, { notes: 0 }]) assert.deepEqual(normalizeFeatures(value), { notes: true }, JSON.stringify(value));
  assert.deepEqual(normalizeFeatures({ notes: false, projets: false }), { notes: false });
  assert.equal(notesOn(null), true);
  assert.equal(notesOn(OFF), false);
  assert.equal(featureOn({ notes: true }, 'notes'), true);
  assert.equal(featureOn(OFF, 'inconnue'), false);
});

test('featuresChangeProblem : seulement des fonctions connues, des booléens ; rien à modifier refusé', () => {
  assert.equal(featuresChangeProblem({ notes: false }), null);
  assert.equal(featuresChangeProblem({ notes: true }), null);
  assert.equal(featuresChangeProblem({}), 'ops.rienAModifier');
  assert.equal(featuresChangeProblem(null), 'ops.fonctionsInvalides');
  assert.equal(featuresChangeProblem([true]), 'ops.fonctionsInvalides');
  assert.equal(featuresChangeProblem({ notes: 'non' }), 'ops.fonctionsInvalides');
  assert.equal(featuresChangeProblem({ notes: 0 }), 'ops.fonctionsInvalides');
  assert.equal(featuresChangeProblem({ notes: null }), 'ops.fonctionsInvalides');
  assert.equal(featuresChangeProblem({ projets: true }), 'ops.fonctionInconnue');
  assert.equal(featuresChangeProblem({ notes: false, userId: 1 }), 'ops.fonctionInconnue');
  assert.deepEqual(applyFeaturesChange(null, OFF), OFF);
  assert.deepEqual(applyFeaturesChange(OFF, { notes: true }), { notes: true });
  for (const key of ['ops.fonctionInconnue', 'ops.fonctionsInvalides']) assert.ok(fr[key] && en[key], key);
});

test('écrans des notes : #/notes, une note, une nouvelle note, la corbeille des notes (et son ancienne adresse)', () => {
  assert.deepEqual(FEATURE_ROUTES.notes, ['notes', 'newNote', 'note', 'noteTrash', 'oldNoteTrash']);
  for (const hash of ['#/notes', '#/notes/nouvelle', '#/notes/abc', '#/reglages/corbeille-notes', '#/notes/corbeille']) {
    const { name } = matchRoute(hash);
    assert.equal(featureOf(name), 'notes', hash);
    assert.equal(screenAllowed(name, OFF), false, hash);
    assert.equal(screenAllowed(name, null), true, hash);
  }
  for (const hash of ['#/accueil', '#/listes', '#/echeances', '#/reglages', '#/reglages/fonctions', '#/notifications', '#/listes/abc']) {
    assert.equal(screenAllowed(matchRoute(hash).name, OFF), true, hash);
  }
  assert.deepEqual(matchRoute('#/reglages/fonctions'), { name: 'features', params: {} });
  assert.equal(pathFor('features'), '#/reglages/fonctions');
});

// --- Accueil, bandeau, premier écran (public/js/home-tiles.js) ---

test('bandeau du bas : Accueil affiché ou coupé × notes utilisées ou coupées (cinq, quatre ou trois boutons)', () => {
  const on = { enabled: true };
  const off = { enabled: false, start: 'lists' };
  assert.deepEqual(tabScreens(on, null), ['home', 'deadlines', 'lists', 'notes', 'settings']);
  assert.deepEqual(tabScreens(on, OFF), ['home', 'deadlines', 'lists', 'settings']);
  assert.deepEqual(tabScreens(off, null), ['deadlines', 'lists', 'notes', 'settings']);
  assert.deepEqual(tabScreens(off, OFF), ['deadlines', 'lists', 'settings']);
  // Sans réglage « Fonctions » (ancienne copie) : comme avant
  assert.deepEqual(tabScreens(off), ['deadlines', 'lists', 'notes', 'settings']);
  // La pastille du kit pour trois boutons est celle de base (un tiers)
  const css = read('public/css/listo.css');
  assert.match(css, /\.tabbar__pill \{ position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc\(\(100% - 10px\) \/ 3\);/);
  assert.match(css, /\.tabbar\[data-current="2"\] \.tabbar__pill \{ transform: translateX\(200%\); \}/);
  // Le bandeau ôte toutes les anciennes classes tabbar--N avant d'en poser une
  const tabbar = code('public/js/tabbar.js');
  assert.match(tabbar, /for \(let count = 1; count <= TABS\.length; count\+\+\) nav\.classList\.remove\(`tabbar--\$\{count\}`\);/);
  assert.match(tabbar, /const names = tabScreens\(app\.data\.home, app\.data\.features\);/);
});

test('premier écran : « Notes » choisi puis notes coupées → « Listes » (le choix gardé revient avec les notes)', () => {
  const home = { enabled: false, start: 'notes' };
  assert.equal(firstScreen(home, null), 'notes');
  assert.equal(firstScreen(home, OFF), 'lists');
  assert.equal(firstScreen({ enabled: false, start: 'deadlines' }, OFF), 'deadlines');
  assert.equal(firstScreen({ enabled: true, start: 'notes' }, OFF), 'home');
  assert.deepEqual(startScreens(null), ['deadlines', 'lists', 'notes']);
  assert.deepEqual(startScreens(OFF), ['deadlines', 'lists']);
});

test('tuiles : la tuile Notes n\'est ni affichée ni proposée quand les notes sont coupées ; son ordre et son état sont gardés', () => {
  const home = { order: ['notes', 'lists', 'account', 'deadlines', 'gifts'], hidden: ['gifts'] };
  assert.deepEqual(tilesFor(home, null), ['notes', 'lists', 'account', 'deadlines', 'gifts']);
  assert.deepEqual(tilesFor(home, OFF), ['lists', 'account', 'deadlines', 'gifts']);
  assert.deepEqual(shownTiles(home, OFF), ['lists', 'account', 'deadlines']);
  assert.deepEqual(shownTiles(home, null), ['notes', 'lists', 'account', 'deadlines']);
  assert.deepEqual(shownTiles(null, OFF), HOME_TILES.filter((name) => name !== 'notes'));
  // Réordonner sans la tuile Notes : elle garde sa place dans l'ordre complet
  assert.deepEqual(mergeTileOrder(['deadlines', 'lists', 'gifts', 'notes', 'account'], ['deadlines', 'lists', 'account', 'gifts']), ['deadlines', 'lists', 'account', 'notes', 'gifts']);
  assert.deepEqual(mergeTileOrder(['notes', 'deadlines', 'lists', 'gifts', 'account'], ['account', 'deadlines', 'lists', 'gifts']), ['notes', 'account', 'deadlines', 'lists', 'gifts']);
  assert.deepEqual(mergeTileOrder(HOME_TILES, [...HOME_TILES].reverse()), [...HOME_TILES].reverse());
});

// --- Base et serveur ---

test('migration 41 : colonne notes_enabled (1 au départ, 0 ou 1 seulement) ; une base en version 40 migre sans rien changer', (t) => {
  const db = openDatabase(':memory:');
  assert.equal(MIGRATIONS.length, 41);
  assert.equal(schemaVersion(db), 41);
  const id = db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('lea', 'Léa', 'x', 'user')").run().lastInsertRowid;
  assert.equal(db.prepare('SELECT notes_enabled FROM users WHERE id = ?').pluck().get(id), 1);
  assert.deepEqual(featuresFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)), defaultFeatures());
  for (const bad of [2, -1, null]) assert.throws(() => db.prepare('UPDATE users SET notes_enabled = ? WHERE id = ?').run(bad, id), /CHECK|NOT NULL/);
  db.prepare('UPDATE users SET notes_enabled = 0 WHERE id = ?').run(id);
  assert.deepEqual(featuresFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)), OFF);
  // Ligne sans la colonne (avant la migration) : valeurs de départ
  assert.deepEqual(featuresFromRow({ id: 1 }), defaultFeatures());
  // Base en version 40 : les comptes existants gardent les notes
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 40);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role, home_enabled, home_start) VALUES ('paul', 'Paul', 'x', 'user', 0, 'notes')").run();
  old.close();
  const migrated = openDatabase(file);
  assert.equal(schemaVersion(migrated), 41);
  const paul = migrated.prepare("SELECT * FROM users WHERE username = 'paul'").get();
  assert.equal(paul.notes_enabled, 1);
  assert.equal(paul.home_enabled, 0);
  assert.equal(paul.home_start, 'notes');
  migrated.close();
});

test('serveur : chacun modifie son seul réglage ; /api/me et la synchronisation le donnent ; ses seuls appareils sont prévenus', async (t) => {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  assert.deepEqual((await admin.get('/api/me')).body.user.features, defaultFeatures());
  assert.deepEqual((await admin.get('/api/sync')).body.features, defaultFeatures());
  // Sans session : refusé
  assert.equal((await app.client().post('/api/ops', { ops: [{ id: uuid(), type: 'account.features', notes: false }] })).status, 401);
  // Temps réel : seuls les appareils de la personne
  const sent = [];
  const notifyUsers = app.ctx.events.notifyUsers.bind(app.ctx.events);
  app.ctx.events.notifyUsers = (userIds, listId) => {
    sent.push([[...userIds], listId]);
    notifyUsers(userIds, listId);
  };
  const notifyList = app.ctx.events.notifyList.bind(app.ctx.events);
  const lists = [];
  app.ctx.events.notifyList = (listId, options) => {
    lists.push(listId);
    notifyList(listId, options);
  };
  assert.deepEqual(await run(lea, { type: 'account.features', notes: false }), { status: 200 });
  assert.deepEqual(sent, [[[leaId], null]]);
  assert.deepEqual(lists, []);
  // Rien n'a changé : personne n'est prévenu
  sent.length = 0;
  assert.deepEqual(await run(lea, { type: 'account.features', notes: false }), { status: 200 });
  assert.deepEqual(sent, []);
  assert.deepEqual((await lea.get('/api/me')).body.user.features, OFF);
  assert.deepEqual((await lea.get('/api/sync')).body.features, OFF);
  // Un autre appareil de Léa reçoit le même réglage
  const phone = app.client();
  await login(phone, 'lea', 'MotDePasse-lea');
  assert.deepEqual((await phone.get('/api/sync')).body.features, OFF);
  assert.deepEqual((await phone.get('/api/me')).body.user.features, OFF);
  // Le compte de l'Admin n'a pas changé
  assert.deepEqual((await admin.get('/api/sync')).body.features, defaultFeatures());
  assert.equal(app.db.prepare('SELECT notes_enabled FROM users WHERE id = 1').pluck().get(), 1);
  // Rallumées : tout revient
  assert.deepEqual(await run(lea, { type: 'account.features', notes: true }), { status: 200 });
  assert.equal(app.db.prepare('SELECT notes_enabled FROM users WHERE id = ?').pluck().get(leaId), 1);
});

test('serveur : nom inconnu, autre champ (userId), valeur non booléenne, rien à modifier → 400, rien n\'est écrit', async (t) => {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const refusals = [
    [{ notes: 'non' }, 'ops.fonctionsInvalides'],
    [{ notes: 0 }, 'ops.fonctionsInvalides'],
    [{ notes: null }, 'ops.fonctionsInvalides'],
    [{ notes: [false] }, 'ops.fonctionsInvalides'],
    [{ projets: true }, 'ops.fonctionInconnue'],
    // Jamais le réglage d'un autre : un identifiant envoyé est refusé, rien n'est écrit
    [{ notes: false, userId: leaId }, 'ops.fonctionInconnue'],
    [{ notes: false, user_id: leaId }, 'ops.fonctionInconnue'],
    [{}, 'ops.rienAModifier'],
  ];
  for (const [change, key] of refusals) {
    const result = await run(admin, { type: 'account.features', ...change });
    assert.equal(result.status, 400, JSON.stringify(change));
    assert.equal(result.code, key, JSON.stringify(change));
    assert.equal(result.error, translate('fr', key));
  }
  assert.deepEqual((await admin.get('/api/sync')).body.features, defaultFeatures());
  assert.deepEqual(app.db.prepare('SELECT notes_enabled FROM users ORDER BY id').pluck().all(), [1, 1]);
  // Message en anglais pour un compte en anglais
  app.db.prepare("UPDATE users SET locale = 'en' WHERE id = 1").run();
  assert.equal((await run(admin, { type: 'account.features', notes: 'no' })).error, en['ops.fonctionsInvalides']);
});

test('ni les assistants IA, ni le lien public, ni l\'administration ne voient ce réglage ; seul server/features.js lit et écrit la colonne', () => {
  for (const file of ['server/mcp-tools.js', 'server/mcp.js', 'server/routes/public.js', 'server/routes/admin-users.js', 'server/shares.js', 'server/note-shares.js']) {
    assert.doesNotMatch(read(file), /notes_enabled|account\.features|featuresFor|featuresFromRow/, file);
  }
  for (const file of ['server/lists.js', 'server/auth.js', 'server/routes/me.js']) assert.doesNotMatch(read(file), /notes_enabled/, file);
  const service = read('server/features.js');
  assert.match(service, /const COLUMNS = \{ notes: 'notes_enabled' \};/);
  // Le compte vient toujours de la session (user.id), jamais de l'opération
  assert.match(read('server/lists.js'), /'account\.features'\(user, op\) \{\s*const \{ id, type, \.\.\.change \} = op;\s*const \{ problem, changed \} = features\.setFeatures\(user\.id, change\);\s*if \(problem\) throw new OpError\(400, problem\);\s*if \(changed\) changedForMe\(null\);/);
  // Dans le cahier des charges : les futurs outils MCP des notes refuseront
  assert.match(read('docs/cahier-des-charges.md'), /outils MCP des notes devront refuser quand la personne a coupé les notes/);
});

// --- Notifications des notes (page et téléphone) ---

const fixed = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOTE = fixed(41);

// Léa (propriétaire de la note), Marc (notes utilisées), Zoé (notes coupées),
// chacun avec un appareil abonné
async function family(t) {
  const push = fakePushService();
  const app = await startTestApp(t, { config: { push: true }, pushRequest: push });
  push.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1 } };
  for (const [key, name] of [['lea', 'Léa'], ['marc', 'Marc'], ['zoe', 'Zoé']]) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  for (const [key, person] of Object.entries(people)) {
    person.device = fakeDevice(`https://fcm.googleapis.com/fcm/send/${key}`, key);
    assert.equal((await person.client.request('PUT', '/api/push/subscription', person.device.subscription)).status, 200);
  }
  const ops = async (who, list) => {
    const res = await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
    assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
    return res.body.results;
  };
  const phone = (who) => push.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint)
    .map((c) => people[who].device.read(c.body).notification);
  const page = async (who) => (await people[who].client.get('/api/inbox')).body.rows;
  const tick = async (ms) => {
    app.clock.now += ms;
    await app.ctx.notify.flushDue();
    await app.ctx.push.idle();
  };
  const version = () => app.db.prepare('SELECT version FROM notes WHERE id = ?').pluck().get(NOTE);
  const edit = (who, body) => ops(who, [{ type: 'note.update', noteId: NOTE, body, baseVersion: version() }]);
  const share = (access) => people.lea.client.request('PUT', `/api/notes/${NOTE}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  await ops('lea', [{ type: 'note.create', noteId: NOTE, title: 'Vacances', body: 'Valises' }]);
  return { app, push, people, ops, phone, page, tick, edit, share };
}

test('notes coupées : ni partage ni modifications remis (page Notifications et téléphone) ; les autres les reçoivent ; rallumées, tout reprend', async (t) => {
  const f = await family(t);
  await f.ops('zoe', [{ type: 'account.features', notes: false }]);
  // Partage : Marc prévenu, Zoé non (ni page, ni téléphone)
  assert.equal((await f.share({ marc: 'modification', zoe: 'modification' })).status, 200);
  await f.app.ctx.push.idle();
  assert.equal(f.phone('marc').length, 1);
  assert.deepEqual((await f.page('marc')).map((r) => [r.targetType, r.category]), [['note', 'sharing']]);
  assert.deepEqual(f.phone('zoe'), []);
  assert.deepEqual(await f.page('zoe'), []);
  // La note est toujours partagée avec Zoé (rien d'effacé, rien de changé pour Léa)
  assert.ok((await f.people.zoe.client.get('/api/sync')).body.noteIds.includes(NOTE));
  assert.equal(f.app.db.prepare('SELECT access FROM note_members WHERE note_id = ? AND user_id = ?').pluck().get(NOTE, f.people.zoe.id), 'modification');
  // Modifications de Léa : Marc prévenu, Zoé non
  await f.edit('lea', 'Valises, passeports');
  await f.tick(GROUP_MS);
  assert.equal(f.phone('marc').length, 2);
  assert.deepEqual((await f.page('marc')).map((r) => r.category).sort(), ['changes', 'sharing']);
  assert.deepEqual(f.phone('zoe'), []);
  assert.deepEqual(await f.page('zoe'), []);
  // Les listes, elles, continuent de prévenir Zoé
  const listId = uuid();
  await f.ops('lea', [{ type: 'list.create', listId, name: 'Courses', listType: 'shopping' }]);
  assert.equal((await f.people.lea.client.request('PUT', `/api/lists/${listId}/members`, { userIds: [f.people.zoe.id], access: { [f.people.zoe.id]: 'modification' } })).status, 200);
  await f.app.ctx.push.idle();
  assert.deepEqual((await f.page('zoe')).map((r) => r.targetType), ['list']);
  assert.equal(f.phone('zoe').length, 1);
  // Rallumées : les notifications des notes reprennent
  await f.ops('zoe', [{ type: 'account.features', notes: true }]);
  await f.tick(NOTE_QUIET_MS);
  await f.edit('marc', 'Valises, passeports, chapeaux');
  await f.tick(GROUP_MS);
  assert.equal(f.phone('zoe').length, 2);
  assert.deepEqual((await f.page('zoe')).map((r) => r.targetType).sort(), ['list', 'note']);
});

test('le filtre est fait par le serveur, à l\'envoi (allowedNote, pour la page comme pour le téléphone)', () => {
  const notify = code('server/notify.js');
  assert.match(notify, /\(SELECT notes_enabled FROM users WHERE users\.id = :userId\) AS notes_enabled,/);
  assert.match(notify, /function allowedNote\(userId, noteId, category, actorId = null\) \{\s*if \(userId === actorId\) return null;\s*const note = visibleNote\(userId, noteId\);\s*if \(!note\) return null;\s*if \(note\.notes_enabled !== 1\) return null;/);
  // Toutes les notifications des notes passent par allowedNote
  assert.equal((notify.match(/targetType: 'note'/g) ?? []).length, 2);
  assert.equal((notify.match(/allowedNote\(/g) ?? []).length, 3);
});

// --- Copie locale du téléphone ---

test('copie locale : synchronisation, opération hors ligne (mêmes règles), copie gardée sur le téléphone', () => {
  const state = emptyState();
  assert.deepEqual(state.features, defaultFeatures());
  loadSync(state, { serverTime: 't', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: OFF });
  assert.deepEqual(state.features, OFF);
  applyOp(state, { id: uuid(), type: 'account.features', notes: true }, { user: { id: 1 } });
  assert.deepEqual(state.features, { notes: true });
  // Refusées par les mêmes règles : rien ne change
  applyOp(state, { id: uuid(), type: 'account.features', notes: 'non' }, { user: { id: 1 } });
  applyOp(state, { id: uuid(), type: 'account.features', notes: false, userId: 2 }, { user: { id: 1 } });
  assert.deepEqual(state.features, { notes: true });
  applyOp(state, { id: uuid(), type: 'account.features', notes: false }, { user: { id: 1 } });
  assert.deepEqual(state.features, OFF);
  // Gardée sur le téléphone et relue à l'identique
  const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state, '2026-11-24T10:00:00.000Z'))));
  assert.deepEqual(back.features, OFF);
  // Copie d'avant le réglage : tout est utilisé
  const snapshot = toSnapshot(state);
  delete snapshot.features;
  assert.deepEqual(fromSnapshot(JSON.parse(JSON.stringify(snapshot))).features, defaultFeatures());
  // Synchronisation « depuis » : remplacé en entier ; absent : gardé
  mergeSync(state, { serverTime: 't2', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [] });
  assert.deepEqual(state.features, OFF);
  mergeSync(state, { serverTime: 't3', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: defaultFeatures() });
  assert.deepEqual(state.features, defaultFeatures());
  assert.match(read('public/js/actions.js'), /export const setFeatures = \(change\) => perform\(\{ type: 'account\.features', \.\.\.change \}\);/);
  // Connu dès l'ouverture (/api/me), avant la synchronisation
  const app = code('public/js/app.js');
  assert.match(app, /if \(user\.features\) app\.data\.features = normalizeFeatures\(user\.features\);\s*queue\?\.stop\(\);/);
  assert.match(app, /if \(user\.home\) app\.data\.home = normalizeHome\(user\.home\);\s*if \(user\.features\) app\.data\.features = normalizeFeatures\(user\.features\);\s*openAccount\(user\)/);
});

test('notes coupées : aucune nouveauté de note ; lignes des notes de la page cachées (gardées), pastille de la cloche sans elles', () => {
  const state = emptyState();
  state.notes.set('n1', { id: 'n1', title: 'Vacances', body: '' });
  state.noteNews.unread.add('n1');
  assert.equal(isNoteUnread(state, 'n1'), true);
  state.inbox = { loaded: true, stamp: 's', rows: [
    { id: 1, targetType: 'note', target: { type: 'note', noteId: 'n1' }, read: false, at: '2026-11-24T09:00:00.000Z' },
    { id: 2, targetType: 'list', target: { type: 'list', listId: 'l1' }, read: false, at: '2026-11-24T08:00:00.000Z' },
    { id: 3, targetType: 'deadlines', target: { type: 'deadlines' }, read: true, at: '2026-11-24T07:00:00.000Z' },
  ] };
  assert.equal(inboxUnread(state), 2);
  applyOp(state, { id: uuid(), type: 'account.features', notes: false }, { user: { id: 1 } });
  assert.equal(isNoteUnread(state, 'n1'), false);
  assert.deepEqual(inboxShownRows(state).map((row) => row.id), [2, 3]);
  assert.equal(inboxUnread(state), 1);
  assert.equal(state.inbox.rows.length, 3, 'rien n\'est effacé');
  applyOp(state, { id: uuid(), type: 'account.features', notes: true }, { user: { id: 1 } });
  assert.equal(isNoteUnread(state, 'n1'), true);
  assert.equal(inboxUnread(state), 2);
  // La page montre seulement ces lignes ; « Tout marquer comme lu » et
  // « Tout effacer » ne visent alors que les lignes montrées
  assert.match(code('public/js/screens/inbox.js'), /const rows = inboxShownRows\(app\.data\);/);
  const actions = code('public/js/actions.js');
  assert.match(actions, /if \(shown\.length < \(app\.data\.inbox\?\.rows\.length \?\? 0\)\) return markInboxRead\(shown\.map\(\(row\) => row\.id\)\);/);
  assert.match(actions, /if \(shown\.length < \(app\.data\.inbox\?\.rows\.length \?\? 0\)\) return perform\(\{ type: 'inbox\.delete', ids: shown\.map\(\(row\) => row\.id\) \}\);/);
});

// --- Écrans ---

test('adresses des notes : menées au premier écran quand les notes sont coupées (aussi quand c\'est fait sur un autre appareil)', () => {
  const app = code('public/js/app.js');
  assert.match(app, /export const openingScreen = \(\) => firstScreen\(app\.data\.home, app\.data\.features\);/);
  assert.match(app, /if \(!screenAllowed\(name, app\.data\.features\)\) \{\s*navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);\s*return;\s*\}/);
  // La vérification passe avant le choix de l'écran
  assert.ok(app.indexOf('if (!screenAllowed(name, app.data.features))') < app.indexOf("case 'notes': mount("));
  assert.match(app, /if \(app\.user && app\.route && !screenAllowed\(app\.route\.name, app\.data\.features\)\) navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);/);
  assert.match(app, /case 'features': mount\(\(onLeave\) => renderFeatures\(onLeave\)\); break;/);
});

test('Accueil, bandeau, menu de gauche, raccourcis : rien des notes quand elles sont coupées', () => {
  assert.match(code('public/js/screens/home.js'), /const present = shownTiles\(app\.data\.home, app\.data\.features\)\.map/);
  const side = code('public/js/screens/pc-side.js');
  assert.match(side, /const notesUsed = notesOn\(app\.data\.features\);\s*notesLink\.hidden = !notesUsed;\s*newList\.hidden = notesUsed && NOTE_SCREENS\.includes\(selected\.name\);\s*newNote\.hidden = !newList\.hidden;/);
  const shortcuts = code('public/js/shortcuts.js');
  assert.match(shortcuts, /n: \(\) => \(notesShown\(\) && location\.hash\.startsWith\('#\/notes'\) \?/);
  assert.match(shortcuts, /\[\['N'\], t\(notesShown\(\) \? 'raccourcis\.partout\.nouvelleListe' : 'navigation\.nouvelleListe'\)\]/);
  assert.match(code('public/js/app.js'), /notesOn: \(\) => notesOn\(app\.data\.features\),/);
  // La recherche du menu de gauche ne cherche que des listes
  assert.doesNotMatch(read('public/js/search.js'), /notes/i);
  // Réglages › Accueil : tuiles et premiers écrans des fonctions utilisées
  const homeSettings = code('public/js/screens/home-settings.js');
  assert.match(homeSettings, /const tiles = tilesFor\(home, features\);/);
  assert.match(homeSettings, /startScreens\(features\)\.map\(/);
  assert.match(homeSettings, /actions\.setHome\(\{ order: mergeTileOrder\(home\.order, order\) \}\);/);
  assert.match(homeSettings, /const key = JSON\.stringify\(\[home, features, reordering\]\);/);
});

test('Réglages : « Fonctions » juste après « Accueil » (téléphone et ordinateur) ; « Corbeille des notes » cachée quand les notes sont coupées', () => {
  const settings = code('public/js/screens/settings.js');
  assert.match(settings, /const featuresRow = \(\) => row\(\{ iconName: 'layers', title: t\('reglages\.fonctions'\), sub: t\('reglages\.fonctions\.detail'\), onClick: \(\) => navigate\('features'\) \}\);/);
  assert.match(settings, /h\('div', \{ class: 'group' \}, homeRow\(\), featuresRow\(\), generalRows\(isAdmin\)\),/);
  assert.match(settings, /h\('div', \{ class: 'group' \}, homeRow\(\), featuresRow\(\), keysRow\(\), generalRows\(isAdmin\)\)/);
  assert.match(settings, /notesOn\(app\.data\.features\) \? row\(\{ iconName: 'trash', title: t\('reglages\.corbeilleNotes'\), onClick: \(\) => navigate\('noteTrash'\) \}\) : null,/);
  // Icône du sprite fourni
  assert.match(read('design/icons-sprite.html'), /id="i-layers"/);
});

test('écran Réglages › Fonctions : interrupteur relié à son titre et sa phrase, file d\'attente seulement, aucun HTML', () => {
  const screen = code('public/js/screens/features.js');
  assert.doesNotMatch(screen, /innerHTML|insertAdjacentHTML|outerHTML|setAttribute\('style'|style: /);
  assert.match(screen, /class: 'switch',\s*type: 'button',\s*role: 'switch',\s*'aria-checked': String\(on\),\s*'aria-labelledby': `fonction-\$\{name\}-titre`,\s*'aria-describedby': `fonction-\$\{name\}-aide`,/);
  assert.match(screen, /onClick: \(\) => actions\.setFeatures\(\{ \[name\]: !on \}\),/);
  assert.doesNotMatch(screen, /\bput\(|\bpost\(|fetch\(/);
  assert.equal((screen.match(/\.focus\(/g) ?? []).length, 1);
  // Le focus n'est rendu qu'à l'interrupteur qui l'avait (jamais un curseur mis tout seul)
  assert.match(screen, /if \(held\) body\.querySelector\(`\[data-key="\$\{held\}"\]`\)\?\.focus\(\);/);
  assert.match(screen, /h\('p', \{ class: 'page-intro' \}, t\('reglages\.fonctions\.intro'\)\)/);
  assert.match(screen, /FEATURES\.map\(\(name\) => featureRow\(features, name\)\)/);
  assert.match(screen, /h\('div', \{ class: 'group-after' \}, h\('p', \{ class: 'muted' \}, t\('reglages\.fonctions\.note'\)\)\)/);
  assert.match(screen, /topbar\(t\('reglages\.fonctions'\), \(\) => goBack\('settings'\)\)/);
});

test('textes : français et anglais, mêmes noms', () => {
  const keys = ['reglages.fonctions', 'reglages.fonctions.detail', 'reglages.fonctions.intro', 'reglages.fonctions.notes', 'reglages.fonctions.notes.detail', 'reglages.fonctions.note', 'ops.fonctionInconnue', 'ops.fonctionsInvalides'];
  for (const key of keys) assert.ok(typeof fr[key] === 'string' && typeof en[key] === 'string', key);
  assert.equal(fr['reglages.fonctions'], 'Fonctions');
  assert.equal(fr['reglages.fonctions.intro'], 'Choisissez les fonctions que vous utilisez. Une fonction coupée disparaît de vos écrans ; rien n\'est effacé.');
  assert.equal(fr['reglages.fonctions.notes.detail'], 'Des textes libres, à garder pour soi ou à partager.');
  assert.equal(fr['reglages.fonctions.note'], 'Vaut pour tous vos appareils.');
  assert.equal(en['reglages.fonctions'], 'Features');
  assert.equal(en['reglages.fonctions.intro'], 'Choose the features you use. A feature you turn off disappears from your screens; nothing is deleted.');
  assert.equal(en['reglages.fonctions.notes'], 'Notes');
  assert.equal(en['reglages.fonctions.notes.detail'], 'Free-form texts, to keep for yourself or to share.');
  assert.equal(en['reglages.fonctions.note'], 'Applies to all your devices.');
});

test('aide : « Fonctions » expliqué dans les deux langues (même structure, vérifiée par help-en.test.js)', () => {
  const text = (guide) => JSON.stringify(guide);
  assert.match(text(GUIDE), /Réglages, « Fonctions »/);
  assert.match(text(GUIDE), /couper les notes/i);
  assert.match(text(GUIDE_EN), /Settings, “Features”/);
  assert.match(text(GUIDE_EN), /turn notes off/i);
  for (const file of ['docs/guide.md', 'docs/guide.en.md', 'site/index.html', 'site/fr/index.html']) assert.ok(/Fonctions|Features/.test(read(file)), file);
  assert.match(read('README.md'), /Settings › Features/);
  assert.match(read('README.fr.md'), /Réglages › Fonctions/);
});

test('service worker : nouveaux fichiers gardés pour le hors-ligne, version changée', () => {
  const sw = read('public/sw.js');
  for (const file of ['/js/features.js', '/js/screens/features.js']) assert.ok(sw.includes(`'${file}'`), file);
  const version = Number(sw.match(/const VERSION = `v(\d+)-/)[1]);
  assert.ok(version >= 161, String(version));
});
