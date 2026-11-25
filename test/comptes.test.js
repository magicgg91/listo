// Comptes invités, étape 1 (docs/cadrage-comptes.md, décisions du
// propriétaire du 25 novembre 2026) : rôle « Invité » (colonne users.guest,
// migration 47, lue par accountRole seulement), annuaire par compte
// (server/directory.js), contrôles des partages et du destinataire d'une
// liste d'envies, un invité ne partage jamais ce qu'il possède,
// changements de rôle, plus d'identifiant de connexion envoyé aux autres,
// et un compte qui n'a servi qu'aux projets n'est plus « jamais utilisé ».
//
// Le cœur : « annuaire identique avec ou sans invités » — tout ce que reçoit
// Léa (famille) est identique, octet pour octet, avant et après l'arrivée
// d'invités qui travaillent dans un projet dont elle n'est pas membre ; et
// quand Zoé devient invitée, Zoé disparaît de son annuaire, rien d'autre ne
// change.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir, ORIGIN } from './helpers.js';
import { connect, claude, data } from './mcp-helpers.js';
import { MIGRATIONS, migrate, schemaVersion } from '../server/db.js';
import { accountRole, roleColumns, directorySees, mayShareOwn, roleChangeProblem, isDiscreet, ROLES } from '../public/js/access.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ADMIN_PASSWORD = 'MotDePasseAdmin!';
const pass = (name) => `MotDePasse-${name}`;

// Identifiants de connexion différents des prénoms : on peut ainsi vérifier
// qu'aucun identifiant d'un autre compte n'est envoyé
const LOGINS = { guillaume: 'g.admin', lea: 'lea.login', zoe: 'zoe.login', hugo: 'hugo.login', max: 'max.login', ines: 'ines.login' };

async function ops(client, list) {
  const res = await client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
  assert.equal(res.status, 200, res.text);
  return res.body.results;
}
async function ok(client, op) {
  const [result] = await ops(client, [op]);
  assert.equal(result.status, 200, `${op.type} : ${result.error}`);
  return result;
}

// Le foyer : Guillaume (Admin), Léa, Zoé, Hugo (Utilisateurs)
async function family(t, { mcp = false } = {}) {
  const app = await startTestApp(t, { config: { mcp } });
  const guillaume = await setupAdmin(app, { username: LOGINS.guillaume });
  const ids = { guillaume: app.db.prepare('SELECT id FROM users WHERE username = ?').pluck().get(LOGINS.guillaume) };
  const clients = { guillaume };
  for (const [name, display] of [['lea', 'Léa'], ['zoe', 'Zoé'], ['hugo', 'Hugo']]) {
    ids[name] = await addUser(app.db, { username: LOGINS[name], password: pass(name), displayName: display });
    clients[name] = app.client();
    await login(clients[name], LOGINS[name], pass(name));
  }
  return { app, ...clients, ids };
}

// Un invité créé par l'Admin, par la route (mot de passe provisoire effacé
// ensuite, pour qu'il puisse agir tout de suite). allowed : ses fonctions
// autorisées (étapes 2 et 3) ; ici, par défaut, toutes cochées (allumées
// aussitôt pour lui, Listes comprises), pour essayer les règles de l'étape 1
const ALL_ALLOWED = { lists: true, notes: true, projects: true, projectsCreate: true, mcp: true };
async function addGuest(h, name, display, allowed = ALL_ALLOWED) {
  const res = await h.guillaume.post('/api/admin/users', { username: LOGINS[name], displayName: display, role: 'guest', password: pass(name), allowed });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.user.role, 'guest');
  h.app.db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(res.body.user.id);
  const client = h.app.client();
  await login(client, LOGINS[name], pass(name));
  h.ids[name] = res.body.user.id;
  h[name] = client;
  return client;
}

const columns = () => [{ columnId: uuid(), name: 'À faire', color: 'gris' }, { columnId: uuid(), name: 'Fait', color: 'vert' }];

// --- Règles pures (public/js/access.js) ---

test('règles des rôles : rôle calculé, colonnes, annuaire, partage, changements permis', () => {
  assert.deepEqual(ROLES, ['user', 'guest', 'admin']);
  assert.equal(accountRole({ role: 'admin', guest: 0 }), 'admin');
  assert.equal(accountRole({ role: 'user', guest: 0 }), 'user');
  assert.equal(accountRole({ role: 'user', guest: 1 }), 'guest');
  // En cas de doute : jamais Admin, jamais Utilisateur visible
  assert.equal(accountRole({ role: 'admin', guest: 1 }), 'guest');
  assert.equal(accountRole({ role: 'user' }), 'guest');
  assert.equal(accountRole(null), 'guest');
  assert.equal(accountRole({ role: 'autre', guest: 0 }), 'guest');
  for (const role of ROLES) assert.equal(accountRole(roleColumns(role)), role);
  assert.deepEqual(roleColumns('guest'), { role: 'user', guest: 1 });
  assert.equal(isDiscreet('guest'), true);
  assert.equal(isDiscreet('user'), false);
  assert.equal(isDiscreet('admin'), false);
  // Qui voit qui dans l'annuaire
  for (const target of ROLES) {
    assert.equal(directorySees('admin', target), true);
    assert.equal(directorySees('guest', target), false);
    assert.equal(directorySees('user', target), target !== 'guest');
  }
  assert.equal(mayShareOwn('guest'), false);
  assert.equal(mayShareOwn('user'), true);
  assert.equal(mayShareOwn('admin'), true);
  // Admin ↔ Invité jamais directement
  assert.equal(roleChangeProblem('guest', 'admin'), 'comptes.role.inviteVersAdmin');
  assert.equal(roleChangeProblem('admin', 'guest'), 'comptes.role.adminVersInvite');
  assert.equal(roleChangeProblem('user', 'guest'), null);
  assert.equal(roleChangeProblem('guest', 'user'), null);
  assert.equal(roleChangeProblem('user', 'admin'), null);
  assert.equal(roleChangeProblem('admin', 'user'), null);
  assert.equal(roleChangeProblem('user', 'chef'), 'comptes.role.invalide');
  for (const key of ['comptes.role.inviteVersAdmin', 'comptes.role.adminVersInvite', 'comptes.role.invalide']) assert.ok(fr[key] && en[key], key);
});

// --- Migration 47 ---

test('migration 47 : colonne guest à 0 pour tous, rien d\'autre ne change ; la base refuse « invité et Admin »', (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 46);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('a', 'A', 'x', 'admin'), ('b', 'B', 'y', 'user')").run();
  const before = old.prepare('SELECT * FROM users ORDER BY id').all();
  old.close();
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  migrate(db);
  t.after(() => db.close());
  assert.equal(schemaVersion(db), MIGRATIONS.length);
  assert.equal(MIGRATIONS.length, 51);
  const after = db.prepare('SELECT * FROM users ORDER BY id').all();
  // (migrations 47 et 48 : guest, puis les fonctions autorisées, tout à 1)
  assert.deepEqual(after.map(({ guest, notes_allowed, projects_allowed, projects_create, mcp_allowed, lists_allowed, lists_enabled, home_projects, home_project_id, sso_only, ...rest }) => rest), before);
  // (migration 49 : les Listes, lues pour un invité seulement : 1 pour la famille)
  assert.deepEqual(after.map((row) => [row.lists_allowed, row.lists_enabled]), [[1, 1], [1, 1]]);
  assert.deepEqual(after.map((row) => [row.notes_allowed, row.projects_allowed, row.projects_create, row.mcp_allowed]), [[1, 1, 1, 1], [1, 1, 1, 1]]);
  assert.deepEqual(after.map((row) => row.guest), [0, 0]);
  // Contrainte : jamais invité et Admin (ni l'un ni l'autre ordre)
  assert.throws(() => db.prepare('UPDATE users SET guest = 1 WHERE id = 1').run(), /CHECK/);
  db.prepare('UPDATE users SET guest = 1 WHERE id = 2').run();
  assert.throws(() => db.prepare("UPDATE users SET role = 'admin' WHERE id = 2").run(), /CHECK/);
  assert.throws(() => db.prepare('UPDATE users SET guest = 2 WHERE id = 2').run(), /CHECK/);
  // Relancer les migrations ne refait rien
  migrate(db);
  assert.equal(schemaVersion(db), 51);
});

// --- Une seule lecture du rôle ---

test('rôle lu par accountRole seulement : aucune autre lecture de users.role dans le serveur (hors administration des comptes)', () => {
  const files = [...fs.readdirSync(path.join(ROOT, 'server')).map((f) => `server/${f}`), ...fs.readdirSync(path.join(ROOT, 'server/routes')).map((f) => `server/routes/${f}`)]
    .filter((f) => f.endsWith('.js'));
  // L'administration des comptes (compter les Admin actifs) et le schéma
  // (db.js) sont les seuls endroits permis
  const allowed = new Set(['server/routes/admin-users.js', 'server/db.js']);
  const reads = [
    /\b(?:user|req\.user|row|account|owner|viewer|target|admin|person|guest|me|u)\.role\b/,
    /\busers\.role\b/,
    /\brole\s*(?:=|!=|<>|IN)\s*[('"]/i,
    /\brole\s*[!=]==?\s*'(?:admin|user)'/,
  ];
  for (const file of files.filter((f) => !allowed.has(f))) {
    const code = read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
    for (const pattern of reads) assert.doesNotMatch(code, pattern, `${file} : ${pattern}`);
  }
  // Ceux qui en ont besoin passent par accountRole
  for (const file of ['server/auth.js', 'server/directory.js', 'server/routes/me.js', 'server/routes/admin-users.js', 'server/lists.js', 'server/notes.js', 'server/projects.js']) {
    assert.match(read(file), /accountRole\(/, file);
  }
  // Un seul calcul de l'annuaire : plus de liste des comptes actifs envoyée
  // telle quelle (ancienne activeUsers)
  for (const file of files) assert.doesNotMatch(read(file), /activeUsers/, file);
  assert.match(read('server/directory.js'), /export function createDirectory/);
});

// --- Annuaire selon qui regarde ---

test('annuaire : l\'Admin voit tout le monde avec le rôle, la famille ne voit pas les invités, un invité ne voit personne ; jamais d\'identifiant', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max');
  await addGuest(h, 'ines', 'Inès');
  const users = async (client) => (await client.get('/api/users')).body.users;
  const sync = async (client) => (await client.get('/api/sync')).body.users;

  const admin = await users(h.guillaume);
  assert.deepEqual(admin.map((u) => u.displayName).sort(), ['Guillaume', 'Hugo', 'Inès', 'Léa', 'Max', 'Zoé']);
  assert.equal(admin.find((u) => u.id === h.ids.max).role, 'guest');
  assert.equal(admin.find((u) => u.id === h.ids.guillaume).role, 'admin');
  assert.equal(admin.find((u) => u.id === h.ids.lea).role, 'user');
  assert.deepEqual(await sync(h.guillaume), admin);

  const lea = await users(h.lea);
  assert.deepEqual(lea.map((u) => u.displayName).sort(), ['Guillaume', 'Hugo', 'Léa', 'Zoé']);
  // Champ par champ : id, prénom et fonctions autorisées (étape 2 : notes,
  // projets), ni rôle ni identifiant
  for (const u of lea) assert.deepEqual(Object.keys(u).sort(), ['displayName', 'id', 'uses']);
  for (const u of lea) assert.deepEqual(Object.keys(u.uses).sort(), ['lists', 'notes', 'projects']);
  assert.deepEqual(await sync(h.lea), lea);

  assert.deepEqual(await users(h.max), []);
  assert.deepEqual(await sync(h.max), []);
  for (const list of [admin, lea]) assert.ok(list.every((u) => !('username' in u)));
  // Un compte désactivé sort de tous les annuaires
  await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.ines}`, { active: false });
  assert.ok(!(await users(h.guillaume)).some((u) => u.id === h.ids.ines));
});

// --- Le cœur : identique avec ou sans invités ---

// Tout ce que reçoit un compte : annuaire, synchronisation complète
// (listes, membres, notes, projets, nouveautés…), listes, page
// Notifications, son compte ; et, avec un assistant IA, les outils de
// lecture des listes, des notes et des projets
async function everything(h, client, mcpToken) {
  const out = {
    users: (await client.get('/api/users')).text,
    sync: (await client.get('/api/sync')).text,
    lists: (await client.get('/api/lists')).text,
    inbox: (await client.get('/api/inbox')).text,
    me: (await client.get('/api/me')).text,
  };
  if (mcpToken) {
    const ai = claude(h, mcpToken);
    out.mcpLists = JSON.stringify(data(await ai.tool('list_lists')));
    const lists = data(await ai.tool('list_lists')).lists;
    out.mcpReadList = JSON.stringify(await Promise.all(lists.map(async (l) => data(await ai.tool('read_list', { list_id: l.id })))));
    out.mcpNotes = JSON.stringify(data(await ai.tool('list_notes')));
    const projects = data(await ai.tool('list_projects')).projects;
    out.mcpProjects = JSON.stringify(projects);
    out.mcpReadProjects = JSON.stringify(await Promise.all(projects.map(async (p) => data(await ai.tool('read_project', { project_id: p.id })))));
  }
  return out;
}

// Ouvre le flux temps réel d'un client et garde les messages reçus
async function openStream(app, client) {
  const controller = new AbortController();
  const cookie = [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const res = await fetch(`${app.base}/api/events`, { headers: { cookie }, signal: controller.signal });
  assert.equal(res.status, 200);
  const stream = { raw: '', events: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        stream.raw += text;
        for (const m of text.matchAll(/^event: (.*)$/gm)) stream.events.push(m[1]);
      }
    } catch {
      // flux coupé par le test
    }
  })();
  stream.close = () => controller.abort();
  return stream;
}

test('annuaire identique avec ou sans invités : Léa (famille) reçoit exactement la même chose, puis seulement Zoé en moins quand Zoé devient invitée', async (t) => {
  const h = await family(t, { mcp: true });
  // Léa : une liste partagée avec Zoé et Guillaume, une note partagée avec
  // Zoé, un projet partagé avec Hugo ; projets allumés
  const L = { courses: uuid(), envies: uuid() };
  const note = uuid();
  const projet = uuid();
  for (const who of [h.lea, h.guillaume, h.hugo, h.zoe]) await ok(who, { type: 'account.features', projects: true });
  await ops(h.lea, [
    { type: 'list.create', listId: L.courses, name: 'Courses', listType: 'tasks' },
    { type: 'item.create', listId: L.courses, itemId: uuid(), name: 'Pain' },
    { type: 'note.create', noteId: note, title: 'Vacances', body: 'Erquy' },
    { type: 'project.create', projectId: projet, name: 'Travaux', columns: columns() },
  ]);
  await h.lea.request('PUT', `/api/lists/${L.courses}/members`, { userIds: [h.ids.zoe, h.ids.guillaume], access: { [h.ids.zoe]: 'modification', [h.ids.guillaume]: 'lecture' } });
  await h.lea.request('PUT', `/api/notes/${note}/members`, { userIds: [h.ids.zoe], access: { [h.ids.zoe]: 'lecture' } });
  await h.lea.request('PUT', `/api/projects/${projet}/members`, { userIds: [h.ids.hugo], access: { [h.ids.hugo]: 'contribution' } });
  // Une liste d'envies de Guillaume pour Zoé, partagée avec Léa (réservation de Léa)
  const wish = uuid();
  await ops(h.guillaume, [
    { type: 'list.create', listId: L.envies, name: 'Envies de Zoé', listType: 'wishes', forUserId: h.ids.zoe },
    { type: 'item.create', listId: L.envies, itemId: wish, name: 'Vélo' },
  ]);
  await h.guillaume.request('PUT', `/api/lists/${L.envies}/members`, { userIds: [h.ids.zoe, h.ids.lea], access: { [h.ids.lea]: 'modification' } });
  await h.lea.post(`/api/items/${wish}/reservation`, {});
  const tokens = await connect(h, h.lea, pass('lea'), { scope: 'read', lists: 'all' });

  const before = await everything(h, h.lea, tokens.access_token);
  const stream = await openStream(h.app, h.lea);
  await pause(50);

  // Arrivée des invités, qui travaillent dans un projet de Guillaume dont
  // Léa n'est pas membre (avec Hugo), une liste et une note de Guillaume
  await addGuest(h, 'max', 'Max');
  await addGuest(h, 'ines', 'Inès');
  for (const who of [h.max, h.ines]) await ok(who, { type: 'account.features', projects: true });
  const domopi = uuid();
  const cols = columns();
  await ops(h.guillaume, [{ type: 'project.create', projectId: domopi, name: 'DomoPi Articles', columns: cols }]);
  const put = await h.guillaume.request('PUT', `/api/projects/${domopi}/members`, { userIds: [h.ids.hugo, h.ids.max, h.ids.ines], access: { [h.ids.hugo]: 'modification', [h.ids.max]: 'contribution', [h.ids.ines]: 'contribution' } });
  assert.equal(put.status, 200, put.text);
  const card = uuid();
  await ops(h.max, [{ type: 'card.create', projectId: domopi, cardId: card, columnId: cols[0].columnId, title: 'Article Wazuh' }]);
  await ops(h.ines, [{ type: 'comment.create', cardId: card, commentId: uuid(), text: 'Relu.' }]);
  await ops(h.hugo, [{ type: 'comment.create', cardId: card, commentId: uuid(), text: 'Merci.' }]);
  const maison = uuid();
  await ops(h.guillaume, [{ type: 'list.create', listId: maison, name: 'Atelier', listType: 'tasks' }]);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${maison}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'modification' } })).status, 200);
  await ops(h.max, [{ type: 'item.create', listId: maison, itemId: uuid(), name: 'Ranger' }]);
  const gnote = uuid();
  await ops(h.guillaume, [{ type: 'note.create', noteId: gnote, title: 'Codes', body: '1234' }]);
  assert.equal((await h.guillaume.request('PUT', `/api/notes/${gnote}/members`, { userIds: [h.ids.ines], access: { [h.ids.ines]: 'lecture' } })).status, 200);
  // Étape 2 (fonctions autorisées) : l'Admin change les cases d'un invité
  // (retire puis rend les notes, retire les assistants IA, la création de
  // projets) : rien n'en parvient à Léa, pas même un message temps réel
  // (étape 3 : de même pour ses Listes, retirées puis rendues)
  for (const allowed of [{ notes: false }, { notes: true }, { mcp: false, projectsCreate: false }, { lists: false }, { lists: true }]) {
    const res = await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.max}`, { allowed });
    assert.equal(res.status, 200, res.text);
  }
  await h.app.ctx.notify?.flushDue?.();
  await pause(150);

  const after = await everything(h, h.lea, tokens.access_token);
  for (const key of Object.keys(before)) assert.equal(after[key], before[key], `${key} : identique avec ou sans invités`);
  // Temps réel : aucun message pour Léa pendant tout ce travail (hors
  // « ready », envoyé à l'ouverture du flux)
  assert.deepEqual(stream.events.filter((event) => event !== 'ready'), []);
  stream.close();

  // Hugo, membre du projet avec eux, les voit DANS le projet, pas dans son annuaire
  const hugoSync = (await h.hugo.get('/api/sync')).body;
  const members = hugoSync.projects.find((p) => p.id === domopi).members.map((m) => m.displayName).sort();
  assert.deepEqual(members, ['Guillaume', 'Hugo', 'Inès', 'Max']);
  assert.ok(!hugoSync.users.some((u) => [h.ids.max, h.ids.ines].includes(u.id)));
  // Max voit Guillaume et Hugo dans le projet, personne dans son annuaire, jamais Léa
  const maxSync = (await h.max.get('/api/sync')).body;
  assert.deepEqual(maxSync.users, []);
  assert.ok(!JSON.stringify(maxSync).includes('Léa'));

  // Zoé devient invitée : elle sort de l'annuaire de Léa, rien d'autre ne change
  const wishFor = await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.zoe}`, { role: 'guest' });
  assert.equal(wishFor.status, 409, 'une liste d\'envies lui est destinée');
  h.app.db.prepare('DELETE FROM lists WHERE id = ?').run(L.envies);
  const reference = await everything(h, h.lea, tokens.access_token);
  const changed = await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.zoe}`, { role: 'guest' });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(changed.body.user.role, 'guest');
  const afterZoe = await everything(h, h.lea, tokens.access_token);
  const withoutZoe = (text) => JSON.stringify(JSON.parse(text).users.filter((u) => u.id !== h.ids.zoe));
  assert.equal(afterZoe.users, JSON.stringify({ users: JSON.parse(reference.users).users.filter((u) => u.id !== h.ids.zoe) }));
  assert.equal(JSON.stringify(JSON.parse(afterZoe.sync).users), withoutZoe(reference.sync));
  const syncRest = (text) => JSON.stringify({ ...JSON.parse(text), users: null });
  assert.equal(syncRest(afterZoe.sync), syncRest(reference.sync), 'synchronisation : seulement Zoé en moins dans l\'annuaire');
  for (const key of Object.keys(reference).filter((k) => !['users', 'sync'].includes(k))) assert.equal(afterZoe[key], reference[key], key);
  // Zoé reste membre de ce que Léa lui partage (et Léa l'y voit)
  const courses = JSON.parse(afterZoe.sync).lists.find((l) => l.id === L.courses);
  assert.ok(courses.members.some((m) => m.id === h.ids.zoe && m.active === true));
});

// --- Contrôles des partages ---

test('partage par numéro : un invité ajouté par la famille reçoit exactement la réponse d\'un compte inconnu, rien n\'est écrit (listes, notes, projets)', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max');
  await ok(h.lea, { type: 'account.features', projects: true });
  const list = uuid();
  const note = uuid();
  const project = uuid();
  await ops(h.lea, [
    { type: 'list.create', listId: list, name: 'Courses', listType: 'shopping' },
    { type: 'note.create', noteId: note, title: 'Note', body: 'Texte' },
    { type: 'project.create', projectId: project, name: 'Projet', columns: columns() },
  ]);
  for (const [url, access] of [[`/api/lists/${list}/members`, 'lecture'], [`/api/notes/${note}/members`, 'lecture'], [`/api/projects/${project}/members`, 'lecture']]) {
    const unknown = await h.lea.request('PUT', url, { userIds: [99999], access: { 99999: access } });
    const guest = await h.lea.request('PUT', url, { userIds: [h.ids.max], access: { [h.ids.max]: access } });
    assert.equal(guest.status, 400, url);
    assert.equal(guest.status, unknown.status);
    assert.equal(guest.text.replace(String(h.ids.max), ''), unknown.text.replace('99999', ''), url);
    assert.equal(guest.body.error, fr['ops.utilisateurInconnu']);
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE user_id = ?').pluck().get(h.ids.max), 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM note_members WHERE user_id = ?').pluck().get(h.ids.max), 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM project_members WHERE user_id = ?').pluck().get(h.ids.max), 0);
  // Un compte de la famille, lui, s'ajoute toujours
  assert.equal((await h.lea.request('PUT', `/api/lists/${list}/members`, { userIds: [h.ids.zoe] })).status, 200);
  // L'Admin, qui voit les invités, peut les ajouter
  await ok(h.guillaume, { type: 'account.features', projects: true });
  const mine = uuid();
  await ops(h.guillaume, [{ type: 'project.create', projectId: mine, name: 'DomoPi', columns: columns() }]);
  assert.equal((await h.guillaume.request('PUT', `/api/projects/${mine}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'contribution' } })).status, 200);
  // Un membre déjà présent (Max, devenu inconnu pour Hugo) peut rester ou
  // être retiré par un propriétaire de la famille
  await ok(h.hugo, { type: 'account.features', projects: true });
  const hugoProject = uuid();
  await ops(h.hugo, [{ type: 'project.create', projectId: hugoProject, name: 'Tests', columns: columns() }]);
  h.app.db.prepare("INSERT INTO project_members (project_id, user_id, access, added_at) VALUES (?, ?, 'lecture', '2026-10-16T12:00:00.000Z')").run(hugoProject, h.ids.max);
  assert.equal((await h.hugo.request('PUT', `/api/projects/${hugoProject}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'contribution' } })).status, 200);
  assert.equal((await h.hugo.request('PUT', `/api/projects/${hugoProject}/members`, { userIds: [] })).status, 200);
  assert.equal((await h.hugo.request('PUT', `/api/projects/${hugoProject}/members`, { userIds: [h.ids.max] })).status, 400, 'retiré, il ne peut plus être rajouté');
});

test('un invité ne partage jamais ce qu\'il possède : ni personnes, ni lien public (listes, notes, projets) ; il peut arrêter un ancien lien', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max');
  await ok(h.max, { type: 'account.features', projects: true });
  const list = uuid();
  const note = uuid();
  const project = uuid();
  await ops(h.max, [
    { type: 'list.create', listId: list, name: 'Mes courses', listType: 'shopping' },
    { type: 'note.create', noteId: note, title: 'Note', body: 'Texte' },
    { type: 'project.create', projectId: project, name: 'Mon projet', columns: columns() },
  ]);
  const refused = fr['ops.invitePartageInterdit'];
  for (const url of [`/api/lists/${list}/members`, `/api/notes/${note}/members`, `/api/projects/${project}/members`]) {
    const res = await h.max.request('PUT', url, { userIds: [h.ids.guillaume] });
    assert.equal(res.status, 403, url);
    assert.equal(res.body.error, refused);
    // Même vide : rien à partager
    assert.equal((await h.max.request('PUT', url, { userIds: [] })).status, 403, url);
  }
  for (const url of [`/api/lists/${list}/share`, `/api/notes/${note}/share`]) {
    const res = await h.max.request('PUT', url, {});
    assert.equal(res.status, 403, url);
    assert.equal(res.body.error, refused);
    assert.equal((await h.max.request('DELETE', url)).status, 200, url);
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares').pluck().get(), 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM note_public_shares').pluck().get(), 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE list_id = ?').pluck().get(list), 1);
  // Un non-membre reçoit toujours « introuvable » (rien n'est révélé)
  assert.equal((await h.lea.request('PUT', `/api/lists/${list}/members`, { userIds: [] })).status, 404);
  assert.equal((await h.lea.request('PUT', `/api/notes/${note}/members`, { userIds: [] })).status, 404);
});

test('liste d\'envies : jamais pour un invité (en ligne et par la file d\'attente) ; même réponse qu\'un compte inconnu pour la famille, refus nommé pour l\'Admin', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max');
  const create = async (client, forUserId) => {
    const [result] = await ops(client, [{ type: 'list.create', listId: uuid(), name: 'Envies', listType: 'wishes', forUserId }]);
    return result;
  };
  const unknown = await create(h.lea, 99999);
  const guest = await create(h.lea, h.ids.max);
  assert.equal(guest.status, 400);
  assert.equal(guest.status, unknown.status);
  assert.equal(guest.error, unknown.error);
  const admin = await create(h.guillaume, h.ids.max);
  assert.equal(admin.status, 400);
  assert.equal(admin.error, fr['ops.inviteDestinataire']);
  // Pour un proche : comme avant
  assert.equal((await create(h.lea, h.ids.zoe)).status, 200);
  // Conversion d'une liste existante
  for (const [client, expected] of [[h.lea, fr['ops.utilisateurInconnu']], [h.guillaume, fr['ops.inviteDestinataire']]]) {
    const id = uuid();
    await ok(client, { type: 'list.create', listId: id, name: 'Idées', listType: 'tasks' });
    const res = await client.post(`/api/lists/${id}/wishes`, { forUserId: h.ids.max });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, expected);
    assert.equal(h.app.db.prepare('SELECT type FROM lists WHERE id = ?').pluck().get(id), 'tasks');
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists WHERE for_user_id = ?').pluck().get(h.ids.max), 0);
  // Un invité qui crée une liste d'envies : pour lui-même ou une personne sans compte seulement
  const self = await create(h.max, h.ids.max);
  assert.equal(self.status, 200);
  assert.equal((await create(h.max, h.ids.lea)).error, fr['ops.utilisateurInconnu']);
});

// --- Identifiant de connexion ---

test('identifiant de connexion : jamais envoyé à un autre compte (annuaire, membres, synchronisation, Notifications, assistants IA)', async (t) => {
  const h = await family(t, { mcp: true });
  await addGuest(h, 'max', 'Max');
  for (const who of [h.lea, h.guillaume, h.max]) await ok(who, { type: 'account.features', projects: true });
  const list = uuid();
  const note = uuid();
  const project = uuid();
  await ops(h.guillaume, [
    { type: 'list.create', listId: list, name: 'Maison', listType: 'tasks', assignEnabled: true },
    { type: 'note.create', noteId: note, title: 'Note', body: 'Texte' },
    { type: 'project.create', projectId: project, name: 'Projet', columns: columns() },
  ]);
  await h.guillaume.request('PUT', `/api/lists/${list}/members`, { userIds: [h.ids.lea, h.ids.max], access: { [h.ids.lea]: 'modification', [h.ids.max]: 'modification' } });
  await h.guillaume.request('PUT', `/api/notes/${note}/members`, { userIds: [h.ids.lea, h.ids.max] });
  await h.guillaume.request('PUT', `/api/projects/${project}/members`, { userIds: [h.ids.lea, h.ids.max] });
  for (const [name, client] of [['lea', h.lea], ['max', h.max], ['guillaume', h.guillaume]]) {
    const others = Object.entries(LOGINS).filter(([who]) => who !== name).map(([, login]) => login);
    const tokens = await connect(h, client, name === 'guillaume' ? ADMIN_PASSWORD : pass(name), { scope: 'read', lists: 'all' });
    const all = await everything(h, client, tokens.access_token);
    for (const [key, text] of Object.entries(all)) {
      for (const login of others) assert.ok(!text.includes(login), `${name} : ${key} contient ${login}`);
    }
  }
  // L'Admin le voit dans Administration seulement
  const admin = (await h.guillaume.get('/api/admin/users')).body.users;
  assert.ok(admin.some((u) => u.username === LOGINS.max));
});

// --- Compte « jamais utilisé » ---

test('suppression d\'un compte : impossible s\'il possède un projet, en est membre ou y a écrit', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max');
  await addGuest(h, 'ines', 'Inès');
  const inUse = async (id) => (await h.guillaume.get('/api/admin/users')).body.users.find((u) => u.id === id).inUse;
  assert.equal(await inUse(h.ids.max), false);
  await ok(h.max, { type: 'account.features', projects: true });
  const project = uuid();
  await ops(h.max, [{ type: 'project.create', projectId: project, name: 'Projet de Max', columns: columns() }]);
  assert.equal(await inUse(h.ids.max), true);
  const res = await h.guillaume.request('DELETE', `/api/admin/users/${h.ids.max}`);
  assert.equal(res.status, 409);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM projects WHERE id = ?').pluck().get(project), 1, 'le projet est toujours là');
  // Membre d'un projet seulement
  await ok(h.guillaume, { type: 'account.features', projects: true });
  const domopi = uuid();
  await ops(h.guillaume, [{ type: 'project.create', projectId: domopi, name: 'DomoPi', columns: columns() }]);
  await h.guillaume.request('PUT', `/api/projects/${domopi}/members`, { userIds: [h.ids.ines], access: { [h.ids.ines]: 'contribution' } });
  assert.equal(await inUse(h.ids.ines), true);
  assert.equal((await h.guillaume.request('DELETE', `/api/admin/users/${h.ids.ines}`)).status, 409);
  // Une carte créée, puis le projet quitté : toujours « utilisé »
  const project2 = h.app.db.prepare('SELECT id FROM project_columns WHERE project_id = ? LIMIT 1').pluck().get(domopi);
  await ok(h.ines, { type: 'account.features', projects: true });
  await ok(h.ines, { type: 'card.create', projectId: domopi, cardId: uuid(), columnId: project2, title: 'Carte' });
  assert.equal((await h.ines.post(`/api/projects/${domopi}/leave`)).status, 200);
  assert.equal(await inUse(h.ids.ines), true);
  assert.equal((await h.guillaume.request('DELETE', `/api/admin/users/${h.ids.ines}`)).status, 409);
  // Un compte qui n'a rien fait se supprime toujours
  const empty = await h.guillaume.post('/api/admin/users', { username: 'vide.login', displayName: 'Vide', role: 'guest', password: pass('vide') });
  assert.equal(await inUse(empty.body.user.id), false);
  assert.equal((await h.guillaume.request('DELETE', `/api/admin/users/${empty.body.user.id}`)).status, 204);
});

// --- Changements de rôle ---

test('changements de rôle : Admin seulement ; Utilisateur ↔ Invité ; jamais Admin ↔ Invité ; son propre rôle ; liste d\'envies ; journal ; liens publics arrêtés', async (t) => {
  const h = await family(t);
  const patch = (client, id, body) => client.request('PATCH', `/api/admin/users/${id}`, body);
  // Réservé à l'Admin
  assert.equal((await patch(h.lea, h.ids.zoe, { role: 'guest' })).status, 403);
  // Rôle inconnu
  assert.equal((await patch(h.guillaume, h.ids.zoe, { role: 'chef' })).status, 400);
  // Zoé a un lien public : arrêté quand elle devient invitée
  const zlist = uuid();
  await ok(h.zoe, { type: 'list.create', listId: zlist, name: 'Zoé', listType: 'tasks' });
  assert.equal((await h.zoe.request('PUT', `/api/lists/${zlist}/share`, {})).status, 201);
  const res = await patch(h.guillaume, h.ids.zoe, { role: 'guest' });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.user.role, 'guest');
  assert.equal(h.app.db.prepare('SELECT guest, role FROM users WHERE id = ?').get(h.ids.zoe).guest, 1);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares WHERE list_id = ? AND revoked_at IS NULL').pluck().get(zlist), 0);
  // Fonctions inchangées : elle garde ses Listes (autorisées, allumées ; étape 3)
  assert.deepEqual((await h.zoe.get('/api/me')).body.user.features, { lists: true, notes: true, projects: false });
  assert.deepEqual(h.app.db.prepare('SELECT lists_allowed, lists_enabled FROM users WHERE id = ?').get(h.ids.zoe), { lists_allowed: 1, lists_enabled: 1 });
  assert.equal((await h.zoe.get('/api/me')).body.user.role, 'guest');
  // Invité → Admin : jamais directement (route et base)
  const direct = await patch(h.guillaume, h.ids.zoe, { role: 'admin' });
  assert.equal(direct.status, 400);
  assert.equal(direct.body.error, fr['comptes.role.inviteVersAdmin']);
  // Invité → Utilisateur → Admin
  assert.equal((await patch(h.guillaume, h.ids.zoe, { role: 'user' })).body.user.role, 'user');
  assert.equal((await patch(h.guillaume, h.ids.zoe, { role: 'admin' })).body.user.role, 'admin');
  // Admin → Invité : jamais directement
  const down = await patch(h.guillaume, h.ids.zoe, { role: 'guest' });
  assert.equal(down.status, 400);
  assert.equal(down.body.error, fr['comptes.role.adminVersInvite']);
  // Son propre rôle : jamais (ni vers Utilisateur, ni vers Invité)
  assert.equal((await patch(h.guillaume, h.ids.guillaume, { role: 'user' })).status, 400);
  assert.equal((await patch(h.guillaume, h.ids.guillaume, { role: 'guest' })).status, 400);
  // Zoé redescend : Guillaume reste seul Admin (les protections du dernier
  // Admin sont celles d'avant, test/admin.test.js)
  assert.equal((await patch(h.guillaume, h.ids.zoe, { role: 'user' })).status, 200);
  // Destinataire d'une liste d'envies : refus nommé, avec le nombre
  await ok(h.lea, { type: 'list.create', listId: uuid(), name: 'Pour Hugo', listType: 'wishes', forUserId: h.ids.hugo });
  await ok(h.lea, { type: 'list.create', listId: uuid(), name: 'Encore pour Hugo', listType: 'wishes', forUserId: h.ids.hugo });
  const wishes = await patch(h.guillaume, h.ids.hugo, { role: 'guest' });
  assert.equal(wishes.status, 409);
  assert.match(wishes.body.error, /^2 listes d'envies sont destinées à Hugo/);
  assert.equal(h.app.db.prepare('SELECT guest FROM users WHERE id = ?').pluck().get(h.ids.hugo), 0);
  // Journal (en anglais) : une ligne par changement réel, sans contenu
  const journal = h.app.logs.join('\n');
  assert.match(journal, /admin_role_changed admin="g\.admin" user="zoe\.login" ip="[^"]+" role="guest" previous="user"/);
  assert.match(journal, /public_link_stopped .*count=1 reason="account became a guest"/);
  assert.match(journal, /admin_role_changed .*role="admin" previous="user"/);
});

test('nouveau compte : rôle Invité créé discret ; rôle de chacun dans /api/me ; un invité n\'a pas l\'administration', async (t) => {
  const h = await family(t);
  const res = await h.guillaume.post('/api/admin/users', { username: 'max.login', displayName: 'Max', role: 'guest', password: pass('max') });
  assert.equal(res.status, 201);
  assert.deepEqual(h.app.db.prepare('SELECT role, guest FROM users WHERE id = ?').get(res.body.user.id), { role: 'user', guest: 1 });
  assert.match(h.app.logs.join('\n'), /admin_account_created admin="g\.admin" user="max\.login" role="guest"/);
  assert.equal((await h.guillaume.post('/api/admin/users', { username: 'x.login', role: 'chef', password: pass('x') })).status, 400);
  assert.equal((await h.guillaume.get('/api/me')).body.user.role, 'admin');
  assert.equal((await h.lea.get('/api/me')).body.user.role, 'user');
  // Un invité ne voit pas l'administration
  const max = h.app.client();
  h.app.db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(res.body.user.id);
  await login(max, 'max.login', pass('max'));
  assert.equal((await max.get('/api/me')).body.user.role, 'guest');
  assert.equal((await max.get('/api/admin/users')).status, 403);
});

// --- Écrans (vérifications du code) ---

test('écrans : Administration à trois rôles, « Discret », page d\'un compte ; « Invité · discret » dans le partage de l\'Admin ; encadré « Compte invité »', () => {
  const admin = read('public/js/screens/admin.js');
  assert.match(admin, /import \{ ROLES, permissionsFor, defaultAllowed \} from '\.\.\/access\.js';/);
  // Admin ↔ Invité désactivé, son propre rôle aussi
  assert.match(admin, /disabled: \(value\) => self \|\| \(user\.role === 'guest' && value === 'admin'\) \|\| \(user\.role === 'admin' && value === 'guest'\)/);
  // « Discret » : l'œil barré ET le mot
  assert.match(admin, /h\('span', \{ class: 'chip chip--discreet' \}, icon\('eye-off'\), t\('administration\.discret'\)\)/);
  // Invités rangés à part, sous leur titre
  assert.match(admin, /t\('administration\.invites\.titre'\)/);
  // Confirmations Utilisateur ↔ Invité
  assert.match(admin, /administration\.compte\.versInvite\.question/);
  assert.match(admin, /administration\.compte\.versUtilisateur\.question/);
  assert.match(read('public/js/router.js'), /\{ name: 'adminAccount', path: '\/administration\/comptes\/:id' \}/);
  // Feuille « Partager » : « Invité · discret » (rôle envoyé à l'Admin seul)
  const picker = read('public/js/screens/share-picker.js');
  assert.match(picker, /person\.role === 'guest' && person\.active\s*\? h\('span', \{ class: 'discreet-tag' \}, icon\('eye-off'\), t\('partage\.personnes\.invite'\)\)/);
  // Pas d'avertissement dans « Partager » (décision du 25 novembre 2026)
  assert.doesNotMatch(picker + read('public/js/screens/share-panel.js'), /share-warn/);
  // « Pour qui ? » : jamais un invité
  assert.match(read('public/js/screens/list-form.js'), /u\.id !== me\.id && u\.role !== 'guest'/);
  // Réglages : pastille et encadré
  const settings = read('public/js/screens/settings.js');
  assert.match(settings, /user\.role === 'guest' \? t\('reglages\.role\.invite'\) : t\('reglages\.role\.utilisateur'\)/);
  assert.match(settings, /class: 'acct-sees'/);
  // Composants du kit, à l'identique dans les deux copies
  for (const file of ['design/listo.css', 'public/css/listo.css']) {
    const css = read(file);
    for (const rule of ['.chip--discreet', '.discreet-tag', '.acct-card', '.acct-sees', '.acct-field', '.acct-split', '.segmented__opt:disabled']) assert.ok(css.includes(rule), `${file} : ${rule}`);
  }
  const section = (css) => css.slice(css.indexOf('/* 16.48'), css.indexOf('/* ---------- 17.') > 0 ? css.indexOf('/* ---------- 17.') : undefined);
  assert.equal(section(read('public/css/listo.css')).trim(), section(read('design/listo.css')).trim());
  // Service worker
  assert.match(read('public/sw.js'), /'\/js\/access\.js'/);
  // Textes en français et en anglais
  for (const key of ['administration.role.invite', 'administration.discret', 'administration.invites.titre', 'partage.personnes.invite', 'partage.vue.invite', 'reglages.role.invite', 'reglages.invite.titre', 'reglages.invite.texte', 'navigation.role.invite', 'ops.invitePartageInterdit', 'ops.inviteDestinataire', 'comptes.role.destinataireEnvies']) {
    assert.ok(fr[key] && en[key], key);
  }
});
