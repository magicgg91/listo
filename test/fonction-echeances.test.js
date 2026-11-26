// « Échéances », une fonction qu'on peut désactiver (décision du
// propriétaire du 26 novembre 2026, réponse A ; migration 52). Dans
// Réglages › Fonctions, à côté de Notes et Projets ; activée au départ pour
// tous les comptes (Admin, Utilisateur, Invité) ; un choix de la personne
// seulement (aucune case de l'Admin). Désactivée : ni bouton du bandeau, ni
// tuile, ni entrée du menu de gauche, ni pastilles, ni premier écran, ni
// « Afficher dans Échéances » dans les menus des projets ; #/echeances mène
// au premier écran ; rien n'est effacé. Les notifications ne changent PAS :
// rappels et résumé du matin restent réglés dans Réglages › Notifications.
// Règles partagées : public/js/features.js, public/js/home-tiles.js,
// public/js/project-view.js ; serveur : server/features.js (seul lecteur
// de la colonne). Le rendu réel est vérifié dans Chromium (captures avant
// et après).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { featuresFromRow } from '../server/features.js';
import {
  FEATURES, FEATURE_ROUTES, PERSONAL_FEATURES, defaultFeatures, featuresChangeProblem, featureAllowed, offeredFeatures, screenFeatures, screenAllowed, usedFeatures, featureOf,
} from '../public/js/features.js';
import { PERMISSIONS, normalizeAllowed } from '../public/js/access.js';
import { HOME_TILES, firstScreen, tabScreens, startScreens, tilesFor, shownTiles } from '../public/js/home-tiles.js';
import { projectMenuEntries } from '../public/js/project-view.js';
import { emptyState, applyOp, loadSync, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { matchRoute } from '../public/js/router.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { GUIDE } from '../public/js/help-content.js';
import { GUIDE as GUIDE_EN } from '../public/js/help-content-en.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Code sans les commentaires de ligne
const code = (file) => read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
const pass = (name) => `MotDePasse-${name}`;

// Copie locale minimale (ce que lit screenFeatures) : fonctions reçues du
// serveur, et des projets (pour la règle d'un invité)
const data = (features, projects = []) => ({ features, projects: new Map(projects.map((p) => [p.id, p])) });
const shown = (features, role = 'user', projects = []) => screenFeatures(data(features, projects), role);

// --- Règles partagées ---

test('règle : « Échéances » activée au départ, en tête de Réglages › Fonctions, sans case de l\'Admin ; ses écrans', () => {
  assert.deepEqual(FEATURES, ['deadlines', 'lists', 'notes', 'projects']);
  assert.equal(defaultFeatures().deadlines, true);
  assert.deepEqual(PERSONAL_FEATURES, ['deadlines']);
  assert.ok(!PERMISSIONS.includes('deadlines'), 'pas de case « Échéances » dans « Fonctions autorisées »');
  assert.deepEqual(FEATURE_ROUTES.deadlines, ['deadlines']);
  assert.equal(featureOf(matchRoute('#/echeances').name), 'deadlines');
  // Proposée à tout Admin et Utilisateur (ils ont toujours les Listes) ; à un
  // invité qui a les Listes ou les Projets ; pas à un invité sans l'un ni
  // l'autre (il n'a rien à y voir)
  for (const role of ['admin', 'user']) {
    const allowed = normalizeAllowed({ notes: false, projects: false }, role);
    assert.equal(featureAllowed('deadlines', allowed), true, role);
    assert.equal(offeredFeatures(allowed, role)[0], 'deadlines', role);
  }
  const guest = (cases) => normalizeAllowed(cases, 'guest');
  assert.deepEqual(offeredFeatures(guest({ lists: true }), 'guest'), ['deadlines', 'lists']);
  assert.deepEqual(offeredFeatures(guest({ projects: true }), 'guest'), ['deadlines', 'projects']);
  assert.deepEqual(offeredFeatures(guest({ notes: true }), 'guest'), ['notes']);
  assert.deepEqual(offeredFeatures(guest({}), 'guest'), []);
  assert.equal(featuresChangeProblem({ deadlines: false }, guest({ notes: true }), 'guest'), 'ops.fonctionNonAutorisee');
  assert.equal(featuresChangeProblem({ deadlines: false }, guest({ lists: true }), 'guest'), null);
  assert.equal(featuresChangeProblem({ deadlines: false }, normalizeAllowed({}, 'user'), 'user'), null);
  assert.equal(featuresChangeProblem({ deadlines: 1 }), 'ops.fonctionsInvalides');
  // Utilisée = son interrupteur (pas de case : rien de l'Admin ne l'éteint)
  for (const on of [true, false]) {
    for (const role of ['admin', 'user', 'guest']) assert.equal(usedFeatures({ deadlines: on }, normalizeAllowed({}, role), role).deadlines, on, `${role} ${on}`);
  }
});

test('écran montré : interrupteur ET règle d\'un invité (ses Listes, ou un projet à l\'option « Échéances » activée)', () => {
  const withDeadlines = [{ id: 'p', deadlinesEnabled: true }];
  for (const role of ['admin', 'user']) {
    assert.equal(shown({ deadlines: true }, role).deadlines, true, role);
    assert.equal(shown({ deadlines: false }, role).deadlines, false, role);
  }
  // Invité : les deux règles à la fois
  const cases = [
    // [interrupteur, Listes, projets, projet à l'option « Échéances »] → écran
    [true, true, false, false, true],
    [true, false, true, true, true],
    [true, false, true, false, false],
    [true, false, false, true, false],
    [false, true, false, false, false],
    [false, false, true, true, false],
  ];
  for (const [deadlines, lists, projects, option, expected] of cases) {
    const value = shown({ deadlines, lists, notes: false, projects }, 'guest', option ? withDeadlines : [{ id: 'p', deadlinesEnabled: false }]);
    assert.equal(value.deadlines, expected, JSON.stringify({ deadlines, lists, projects, option }));
  }
  // L'adresse suit la même règle (routeur : app.js, screenAllowed(name, shownFeatures()))
  assert.equal(screenAllowed(matchRoute('#/echeances').name, shown({ deadlines: false })), false);
  assert.equal(screenAllowed(matchRoute('#/echeances').name, shown({ deadlines: true })), true);
  for (const hash of ['#/listes', '#/notes', '#/accueil', '#/reglages', '#/reglages/fonctions', '#/notifications']) {
    assert.equal(screenAllowed(matchRoute(hash).name, shown({ deadlines: false })), true, hash);
  }
});

// --- Bandeau du bas, tuiles, premier écran ---

test('bandeau du bas : toutes les combinaisons (Accueil, Échéances, Notes, Projets) ; une classe tabbar--N pour chaque nombre', () => {
  const counts = new Set();
  for (const home of [true, false]) {
    for (const deadlines of [true, false]) {
      for (const notes of [true, false]) {
        for (const projects of [true, false]) {
          const features = shown({ deadlines, notes, projects });
          const expected = [
            home ? 'home' : null, deadlines ? 'deadlines' : null, 'lists', notes ? 'notes' : null, projects ? 'projects' : null, 'settings',
          ].filter(Boolean);
          for (const start of ['deadlines', 'lists', 'notes', 'projects']) {
            const names = tabScreens({ enabled: home, start }, features);
            assert.deepEqual(names, expected, JSON.stringify({ home, start, deadlines, notes, projects }));
          }
          counts.add(expected.length);
        }
      }
    }
  }
  assert.deepEqual([...counts].sort(), [2, 3, 4, 5, 6]);
  // Six à deux boutons : chaque nombre a sa pastille (trois : celle de base)
  const css = read('public/css/listo.css');
  assert.match(css, /\.tabbar__pill \{ position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc\(\(100% - 10px\) \/ 3\);/);
  for (const count of [2, 4, 5, 6]) assert.match(css, new RegExp(`\\.tabbar--${count} \\.tabbar__pill \\{ width: calc\\(\\(100% - 10px\\) / ${count}\\); \\}`), String(count));
  // La section 16.54 est la même dans le kit et dans sa copie
  const part = (file) => read(file).slice(read(file).indexOf('/* 16.54'), read(file).indexOf('.tabbar--2 .tabbar__pill'));
  assert.ok(part('public/css/listo.css').length > 20);
  assert.equal(part('design/listo.css'), part('public/css/listo.css'));
  assert.match(read('design/listo.css'), /\.tabbar--2 \.tabbar__pill \{ width: calc\(\(100% - 10px\) \/ 2\); \}/);
  // Le bandeau lit ce qui est montré (shownFeatures) ; ses pastilles sont
  // dans le bouton « Échéances », absent du bandeau quand il est désactivé
  const tabbar = code('public/js/tabbar.js');
  assert.match(tabbar, /const names = tabScreens\(app\.data\.home, shownFeatures\(\)\);/);
  assert.match(tabbar, /replace\(nav, pill, names\.map\(\(name\) => buttons\.get\(name\)\)\);/);
  assert.match(tabbar, /name === 'deadlines' \? \[lateBadge, todayBadge\] : null/);
  // Invité « projets seulement », Accueil désactivé : deux boutons (la
  // pastille de 16.54 sert déjà là)
  const guest = shown({ deadlines: true, lists: false, notes: false, projects: true }, 'guest', [{ id: 'p', deadlinesEnabled: false }]);
  assert.deepEqual(tabScreens({ enabled: false, start: 'projects' }, guest), ['projects', 'settings']);
});

test('tuiles : ni la tuile Échéances ni sa ligne dans Réglages › Accueil ; son ordre et son état sont gardés', () => {
  const off = shown({ deadlines: false });
  const home = { order: ['lists', 'deadlines', 'notes', 'account', 'gifts', 'projects'], hidden: ['gifts'] };
  assert.deepEqual(tilesFor(home, off), ['lists', 'notes', 'account', 'gifts']);
  assert.deepEqual(shownTiles(home, off), ['lists', 'notes', 'account']);
  assert.deepEqual(shownTiles(home, shown({ deadlines: true })), ['lists', 'deadlines', 'notes', 'account']);
  assert.deepEqual(shownTiles(null, off), HOME_TILES.filter((name) => !['deadlines', 'projects'].includes(name)));
  // L'Accueil et Réglages › Accueil lisent ce qui est montré
  assert.match(code('public/js/screens/home.js'), /const present = shownTiles\(app\.data\.home, shownFeatures\(\)\)/);
  assert.match(code('public/js/screens/home-settings.js'), /const features = shownFeatures\(\);/);
  assert.match(code('public/js/screens/home-settings.js'), /const tiles = tilesFor\(home, features\);/);
});

test('premier écran : « Échéances » ni proposé ni ouvert quand il est désactivé ; repli silencieux sur l\'écran suivant', () => {
  const off = shown({ deadlines: false, notes: true, projects: true });
  assert.deepEqual(startScreens(off), ['lists', 'notes', 'projects']);
  assert.deepEqual(startScreens(shown({ deadlines: true, projects: true })), ['deadlines', 'lists', 'notes', 'projects']);
  assert.equal(firstScreen({ enabled: false, start: 'deadlines' }, off), 'lists');
  assert.equal(firstScreen({ enabled: false, start: 'deadlines' }, shown({ deadlines: true })), 'deadlines', 'réactivée : le choix gardé revient');
  assert.equal(firstScreen({ enabled: true, start: 'deadlines' }, off), 'home');
  // Invité sans Listes, « Échéances » choisi puis désactivé : le premier
  // écran possible (« Projets »)
  const guest = shown({ deadlines: false, lists: false, notes: false, projects: true }, 'guest', [{ id: 'p', deadlinesEnabled: true }]);
  assert.equal(firstScreen({ enabled: false, start: 'deadlines' }, guest), 'projects');
  // Le routeur mène toute adresse d'un écran non montré au premier écran
  const app = code('public/js/app.js');
  assert.match(app, /if \(!screenAllowed\(name, shownFeatures\(\)\)\) \{\s*navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);/);
  assert.match(app, /export const openingScreen = \(\) => firstScreen\(app\.data\.home, shownFeatures\(\)\);/);
  // … et quitte l'écran ouvert quand la fonction est désactivée ailleurs
  assert.match(app, /if \(app\.user && app\.route && !screenAllowed\(app\.route\.name, shownFeatures\(\)\)\) navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);/);
});

test('ordinateur : ni entrée « Échéances » ni ses pastilles dans le menu de gauche ; aucun raccourci clavier propre à Échéances', () => {
  const side = code('public/js/screens/pc-side.js');
  assert.match(side, /deadlinesLink\.hidden = !shownFeatures\(\)\.deadlines;/);
  // Les deux pastilles sont DANS l'entrée (cachées avec elle)
  assert.match(side, /const deadlinesLink = fixedLink\('deadlines', 'calendar', t\('navigation\.echeances'\), deadlinesLate, deadlinesToday\);/);
  // Raccourcis : aucun ne mène à Échéances (rien à désactiver)
  assert.doesNotMatch(code('public/js/shortcuts.js'), /deadlines|echeances/);
});

test('menus ⋮ d\'un projet : pas d\'« Afficher dans Échéances » quand l\'écran n\'est pas montré ; le choix est gardé', () => {
  const project = { id: 'p', role: 'owner', members: [], deadlinesEnabled: true };
  for (const inside of [true, false]) {
    assert.ok(projectMenuEntries(project, { inside }).includes('deadlines'), `montré ${inside}`);
    assert.ok(!projectMenuEntries(project, { inside, deadlinesScreen: false }).includes('deadlines'), `caché ${inside}`);
    // Le reste du menu ne change pas
    assert.deepEqual(projectMenuEntries(project, { inside, deadlinesScreen: false }), projectMenuEntries(project, { inside }).filter((entry) => entry !== 'deadlines'));
  }
  assert.match(code('public/js/screens/projects.js'), /deadlinesScreen: shownFeatures\(\)\.deadlines/);
  // Le choix de chacun (in_deadlines) n'est jamais effacé : aucune
  // opération n'est envoyée quand on désactive « Échéances »
  assert.doesNotMatch(code('public/js/actions.js'), /inDeadlines/);
});

// --- Copie locale (hors ligne) ---

test('copie locale : l\'opération s\'applique hors ligne (mêmes règles), gardée sur le téléphone ; l\'écran suit aussitôt', () => {
  const state = emptyState();
  loadSync(state, { serverTime: 't', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: defaultFeatures(), allowed: normalizeAllowed({}, 'user') });
  assert.equal(screenFeatures(state, 'user').deadlines, true);
  applyOp(state, { id: uuid(), type: 'account.features', deadlines: false }, { user: { id: 1 } });
  assert.equal(state.features.deadlines, false);
  assert.equal(screenFeatures(state, 'user').deadlines, false);
  assert.deepEqual(tabScreens({ enabled: true }, screenFeatures(state, 'user')), ['home', 'lists', 'notes', 'settings']);
  // Refusées par les mêmes règles : rien ne change
  applyOp(state, { id: uuid(), type: 'account.features', deadlines: 'oui' }, { user: { id: 1 } });
  assert.equal(state.features.deadlines, false);
  const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state, '2026-11-26T10:00:00.000Z'))));
  assert.equal(back.features.deadlines, false);
  applyOp(state, { id: uuid(), type: 'account.features', deadlines: true }, { user: { id: 1 } });
  assert.equal(screenFeatures(state, 'user').deadlines, true);
  // Invité sans Listes ni Projets : refusé sur le téléphone aussi
  const guestState = emptyState();
  loadSync(guestState, { serverTime: 't', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { ...defaultFeatures(), lists: false }, allowed: normalizeAllowed({ notes: true }, 'guest') });
  applyOp(guestState, { id: uuid(), type: 'account.features', deadlines: false }, { user: { id: 2 } });
  assert.equal(guestState.features.deadlines, true);
});

// --- Base et serveur ---

test('migration 52 : colonne deadlines_enabled, 1 pour tous (Admin, Utilisateur, Invité), 0 ou 1 seulement ; rien d\'autre ne change', (t) => {
  const db = openDatabase(':memory:');
  assert.equal(MIGRATIONS.length, 52);
  assert.equal(schemaVersion(db), 52);
  const id = db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('lea', 'Léa', 'x', 'user')").run().lastInsertRowid;
  assert.equal(db.prepare('SELECT deadlines_enabled FROM users WHERE id = ?').pluck().get(id), 1);
  for (const bad of [2, -1, null]) assert.throws(() => db.prepare('UPDATE users SET deadlines_enabled = ? WHERE id = ?').run(bad, id), /CHECK|NOT NULL/);
  db.prepare('UPDATE users SET deadlines_enabled = 0 WHERE id = ?').run(id);
  assert.equal(featuresFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)).deadlines, false);
  db.close();
  // Base en version 51 : tous les comptes gardent « Échéances »
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 51);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role, guest) VALUES ('a', 'A', 'x', 'admin', 0), ('b', 'B', 'y', 'user', 0), ('c', 'C', 'z', 'user', 1)").run();
  const before = old.prepare('SELECT * FROM users ORDER BY id').all();
  old.close();
  const migrated = openDatabase(file);
  t.after(() => migrated.close());
  assert.equal(schemaVersion(migrated), 52);
  const after = migrated.prepare('SELECT * FROM users ORDER BY id').all();
  assert.deepEqual(after.map(({ deadlines_enabled, ...rest }) => rest), before);
  assert.deepEqual(after.map((row) => row.deadlines_enabled), [1, 1, 1]);
  // Seul server/features.js lit ou écrit la colonne de la table users
  // (projects.deadlines_enabled, l'option « Échéances » d'un projet,
  // migration 46, est une autre colonne)
  const serverFiles = fs.readdirSync(path.join(ROOT, 'server'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `server/${f}`);
  for (const file of serverFiles.filter((f) => !['server/features.js', 'server/db.js'].includes(f))) {
    assert.doesNotMatch(read(file), /users\.deadlines_enabled|UPDATE users SET[^']*deadlines_enabled|'deadlines_enabled'|SELECT[^']*deadlines_enabled[^']*FROM users/, file);
  }
  assert.match(read('server/features.js'), /deadlines: 'deadlines_enabled'/);
  assert.doesNotMatch(read('server/notify.js'), /users\.deadlines_enabled|featuresFor\([^)]*\)\.deadlines/, 'les notifications ne lisent jamais cet interrupteur');
  assert.doesNotMatch(read('server/inbox.js'), /featuresFor\([^)]*\)\.deadlines/);
});

// Guillaume (Admin), Léa et Zoé (Utilisateurs), chacun avec un appareil abonné
async function family(t) {
  const push = fakePushService();
  const app = await startTestApp(t, { config: { push: true }, pushRequest: push });
  push.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1 } };
  for (const [key, name] of [['lea', 'Léa'], ['zoe', 'Zoé']]) {
    const id = await addUser(app.db, { username: key, password: pass(key), displayName: name });
    const client = app.client();
    await login(client, key, pass(key));
    people[key] = { client, id };
  }
  for (const [key, person] of Object.entries(people)) {
    person.device = fakeDevice(`https://fcm.googleapis.com/fcm/send/${key}`, key);
    assert.equal((await person.client.request('PUT', '/api/push/subscription', person.device.subscription)).status, 200);
  }
  const run = async (who, op) => {
    const { id, ...result } = (await people[who].client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
    return result;
  };
  const phone = (who) => push.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint).map((c) => people[who].device.read(c.body).notification);
  return { app, push, people, run, phone };
}

test('opération : chacun son seul réglage ; /api/me et la synchronisation le donnent ; l\'Admin ne le voit pas ; invité selon la règle', async (t) => {
  const f = await family(t);
  const { lea, zoe, guillaume } = f.people;
  assert.equal((await lea.client.get('/api/me')).body.user.features.deadlines, true);
  assert.equal((await f.app.client().post('/api/ops', { ops: [{ id: uuid(), type: 'account.features', deadlines: false }] })).status, 401);
  assert.deepEqual(await f.run('lea', { type: 'account.features', deadlines: false }), { status: 200 });
  assert.equal((await lea.client.get('/api/me')).body.user.features.deadlines, false);
  assert.equal((await lea.client.get('/api/sync')).body.features.deadlines, false);
  assert.equal((await zoe.client.get('/api/sync')).body.features.deadlines, true, 'Zoé : rien ne change');
  assert.deepEqual(f.app.db.prepare('SELECT deadlines_enabled FROM users ORDER BY id').pluck().all(), [1, 0, 1]);
  // Jamais le réglage d'un autre (le compte vient de la session)
  assert.equal((await f.run('lea', { type: 'account.features', deadlines: true, userId: zoe.id })).status, 400);
  assert.equal((await f.run('lea', { type: 'account.features', deadlines: 'non' })).status, 400);
  // L'Admin : la page du compte ne montre pas ce choix personnel
  const page = await guillaume.client.get('/api/admin/users');
  assert.equal(page.status, 200, page.text);
  const described = page.body.users.find((user) => user.id === lea.id);
  assert.equal(described.used.deadlines, undefined);
  assert.deepEqual(Object.keys(described.used).sort(), ['lists', 'notes', 'projects']);
  // Les assistants IA et le lien public n'en savent rien
  for (const file of ['server/mcp-tools.js', 'server/mcp.js', 'server/mcp-notes.js', 'server/mcp-projects.js', 'server/routes/public.js', 'server/shares.js', 'server/note-shares.js']) {
    assert.doesNotMatch(read(file), /users\.deadlines_enabled|'deadlines_enabled'|features\.deadlines|featuresFor\([^)]*\)\.deadlines|account\.features/, file);
  }
  // Rien n'est effacé : réactivée, tout revient
  assert.deepEqual(await f.run('lea', { type: 'account.features', deadlines: true }), { status: 200 });
  assert.equal((await lea.client.get('/api/sync')).body.features.deadlines, true);
  // Invité : activée au départ ; changeable avec les Listes ou les Projets,
  // refusé (403) sans l'un ni l'autre
  for (const [name, allowed, status] of [['max', { notes: true }, 403], ['ines', { projects: true }, 200], ['noe', { lists: true }, 200]]) {
    const res = await guillaume.client.post('/api/admin/users', { username: `${name}.login`, displayName: name, role: 'guest', password: pass(name), allowed });
    assert.equal(res.status, 201, res.text);
    f.app.db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(res.body.user.id);
    assert.equal(f.app.db.prepare('SELECT deadlines_enabled FROM users WHERE id = ?').pluck().get(res.body.user.id), 1, name);
    const client = f.app.client();
    await login(client, `${name}.login`, pass(name));
    assert.equal((await client.get('/api/me')).body.user.features.deadlines, true, name);
    const { results } = (await client.post('/api/ops', { ops: [{ id: uuid(), type: 'account.features', deadlines: false }] })).body;
    assert.equal(results[0].status, status, name);
  }
});

test('notifications inchangées (réponse A) : rappel et résumé du matin remis pareil, « Échéances » activée ou désactivée', async (t) => {
  const f = await family(t);
  const listId = uuid();
  const date = new Date(f.app.clock.now);
  date.setDate(date.getDate() + 1);
  date.setHours(8, 30, 0, 0);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  for (const op of [
    { type: 'list.create', listId, name: 'Maison', listType: 'tasks', dueEnabled: true },
    { type: 'item.create', listId, itemId: uuid(), name: 'Payer', dueDate: day },
    { type: 'item.create', listId, itemId: uuid(), name: 'Dentiste', dueDate: day, dueTime: '09:00', remindBefore: 15 },
  ]) assert.equal((await f.run('guillaume', op)).status, 200, op.type);
  const members = await f.people.guillaume.client.request('PUT', `/api/lists/${listId}/members`, { userIds: [f.people.lea.id, f.people.zoe.id], access: { [f.people.lea.id]: 'modification', [f.people.zoe.id]: 'modification' } });
  assert.equal(members.status, 200, members.text);
  // Zoé désactive « Échéances » ; Léa la garde
  assert.equal((await f.run('zoe', { type: 'account.features', deadlines: false })).status, 200);
  await f.app.ctx.push.idle();
  const before = { lea: f.phone('lea').length, zoe: f.phone('zoe').length };
  f.app.clock.now = date.getTime();
  await f.app.ctx.notify.runDigest();
  date.setHours(8, 50);
  f.app.clock.now = date.getTime();
  await f.app.ctx.notify.runReminders();
  await f.app.ctx.push.idle();
  const kinds = async (who) => (await f.people[who].client.get('/api/inbox')).body.rows.map((row) => [row.kind, row.category, row.targetType]).filter(([kind]) => ['digest', 'reminder'].includes(kind)).sort();
  const lea = await kinds('lea');
  assert.deepEqual(lea.map(([kind]) => kind), ['digest', 'reminder'], 'Léa les reçoit');
  assert.deepEqual(await kinds('zoe'), lea, 'Zoé les reçoit à l\'identique (page Notifications)');
  const sent = { lea: f.phone('lea').length - before.lea, zoe: f.phone('zoe').length - before.zoe };
  assert.ok(sent.lea >= 1, 'Léa : sur le téléphone');
  assert.equal(sent.zoe, sent.lea, 'Zoé : autant sur le téléphone');
  assert.deepEqual(f.phone('zoe').slice(-sent.zoe).map((n) => n.title), f.phone('lea').slice(-sent.lea).map((n) => n.title));
});

// --- Écrans, textes, aide ---

test('Réglages › Fonctions : la ligne « Échéances » (nom, phrase, interrupteur) ; Réglages la nomme sous « Fonctions »', () => {
  const screen = code('public/js/screens/features.js');
  assert.match(screen, /deadlines: \{ name: \(\) => t\('reglages\.fonctions\.echeances'\), sub: \(\) => t\('reglages\.fonctions\.echeances\.detail'\) \},/);
  // Aucun curseur mis tout seul : le focus revient seulement à l'interrupteur qui l'avait
  assert.equal((screen.match(/\.focus\(/g) ?? []).length, 1);
  const settings = code('public/js/screens/settings.js');
  assert.match(settings, /const featuresDetail = \(\) => t\(FEATURE_DETAIL\[offeredFeatures\(allowedNow\(\), app\.user\?\.role\)\.join\(','\)\]\);/);
  // Chaque combinaison possible a son texte, dans les deux langues
  const table = settings.slice(settings.indexOf('const FEATURE_DETAIL = {'), settings.indexOf('const featuresDetail'));
  const keys = [...table.matchAll(/'(reglages\.fonctions\.detail[^']*)'/g)].map((m) => m[1]);
  assert.equal(keys.length, 10);
  for (const key of keys) assert.ok(typeof fr[key] === 'string' && typeof en[key] === 'string', key);
  const combos = new Set();
  for (const role of ['admin', 'user', 'guest']) {
    for (const lists of [true, false]) {
      for (const notes of [true, false]) {
        for (const projects of [true, false]) combos.add(offeredFeatures(normalizeAllowed({ lists, notes, projects }, role), role).join(','));
      }
    }
  }
  for (const combo of combos) assert.match(table, new RegExp(`(^|[ {])'?${combo}'?: 'reglages`), combo || '(aucune)');
  assert.equal(fr['reglages.fonctions.detail'], 'Échéances, Notes, Projets');
  assert.equal(en['reglages.fonctions.detail'], 'Due, Notes, Projects');
  assert.equal(fr['reglages.fonctions.echeances'], 'Échéances');
  assert.equal(fr['reglages.fonctions.echeances.detail'], 'L\'écran des tâches et des cartes datées. Les rappels restent réglés dans Notifications.');
  assert.equal(en['reglages.fonctions.echeances'], 'Due');
  assert.equal(en['reglages.fonctions.echeances.detail'], 'The screen of dated tasks and cards. Reminders stay set in Notifications.');
});

test('aide : « Échéances » désactivable, notifications inchangées, dans les deux langues', () => {
  const text = (guide) => JSON.stringify(guide);
  assert.match(text(GUIDE), /Désactiver « Échéances »/);
  assert.match(text(GUIDE), /rappels et le résumé du matin ne changent pas/);
  assert.match(text(GUIDE_EN), /Disabling “Due”/);
  assert.match(text(GUIDE_EN), /reminders and the morning summary do not change/);
});
