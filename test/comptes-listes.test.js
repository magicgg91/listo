// Comptes invités, étape 3 (docs/cadrage-comptes.md, décisions du
// propriétaire du 25 novembre 2026, points 3 et 5) : les Listes d'un
// invité (migration 49 : users.lists_allowed, users.lists_enabled). Un
// Admin et un Utilisateur ont toujours les Listes ; un invité, seulement
// si l'Admin les coche (allumées aussitôt) et qu'il ne les a pas éteintes.
// Sans Listes, le serveur ne lui envoie et n'accepte RIEN des listes : un
// seul contrôle (server/features.js, listsRefusal), posé devant toutes les
// routes des listes (server/app.js), dans la file d'attente et la
// synchronisation (server/lists.js), les notifications et la page
// Notifications, le temps réel et les assistants IA. Rien n'est effacé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir } from './helpers.js';
import { connect, claude, data } from './mcp-helpers.js';
import { MIGRATIONS, migrate, schemaVersion } from '../server/db.js';
import { LIST_ROUTE_PATHS } from '../server/features.js';
import { LIST_OPS } from '../server/lists.js';
import { LISTS_NOT_ALLOWED as MCP_LISTS_NOT_ALLOWED, LISTS_OFF as MCP_LISTS_OFF, LIST_TOOLS } from '../server/mcp-tools.js';
import { GROUP_MS } from '../server/notify.js';
import { permissionsFor, welcomeHint, deadlinesShown, defaultAllowed } from '../public/js/access.js';
import { usedFeatures, screenFeatures, screenAllowed, offeredFeatures, featuresChangeProblem, FEATURE_ROUTES } from '../public/js/features.js';
import { tabScreens, firstScreen, shownTiles, startScreens } from '../public/js/home-tiles.js';
import { loadSync, mergeSync, emptyState, inboxShownRows } from '../public/js/store.js';
import { matchRoute } from '../public/js/router.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pass = (name) => `MotDePasse-${name}`;
const columns = () => [{ columnId: uuid(), name: 'À faire', color: 'gris' }, { columnId: uuid(), name: 'Fait', color: 'vert' }];

async function ops(client, list) {
  const res = await client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
  assert.equal(res.status, 200, res.text);
  return res.body.results;
}
const one = async (client, op) => (await ops(client, [op]))[0];
async function ok(client, op) {
  const result = await one(client, op);
  assert.equal(result.status, 200, `${op.type} : ${result.error}`);
  return result;
}

// Guillaume (Admin), Léa et Hugo (Utilisateurs)
async function family(t, { mcp = false } = {}) {
  const app = await startTestApp(t, { config: { mcp } });
  const guillaume = await setupAdmin(app, { username: 'g.admin' });
  const ids = { guillaume: app.db.prepare("SELECT id FROM users WHERE username = 'g.admin'").pluck().get() };
  const h = { app, guillaume, ids };
  for (const [name, display] of [['lea', 'Léa'], ['hugo', 'Hugo']]) {
    ids[name] = await addUser(app.db, { username: `${name}.login`, password: pass(name), displayName: display });
    h[name] = app.client();
    await login(h[name], `${name}.login`, pass(name));
  }
  return h;
}

// Un invité créé par l'Admin, avec ses cases (allowed : facultatif)
async function addGuest(h, name, display, allowed) {
  const res = await h.guillaume.post('/api/admin/users', { username: `${name}.login`, displayName: display, role: 'guest', password: pass(name), ...(allowed ? { allowed } : {}) });
  assert.equal(res.status, 201, res.text);
  h.app.db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(res.body.user.id);
  h.ids[name] = res.body.user.id;
  h[name] = h.app.client();
  await login(h[name], `${name}.login`, pass(name));
  return res.body.user;
}
const setAllowed = (h, name, allowed) => h.guillaume.request('PATCH', `/api/admin/users/${h.ids[name]}`, { allowed });
const listsRow = (h, name) => h.app.db.prepare('SELECT lists_allowed, lists_enabled FROM users WHERE id = ?').get(h.ids[name]);

// Une liste de courses de Guillaume (un article, un rayon) partagée en
// modification avec les comptes donnés
async function sharedList(h, names, { type = 'shopping' } = {}) {
  const listId = uuid();
  const itemId = uuid();
  await ops(h.guillaume, [
    { type: 'list.create', listId, name: 'Atelier', listType: type },
    { type: 'item.create', listId, itemId, name: 'Vis' },
  ]);
  const res = await h.guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: names.map((n) => h.ids[n]), access: Object.fromEntries(names.map((n) => [h.ids[n], 'modification'])) });
  assert.equal(res.status, 200, res.text);
  return { listId, itemId };
}

// --- Migration 49 ---

test('migration 49 : lists_allowed et lists_enabled, 1 pour la famille, 0 pour un invité déjà créé ; 0 ou 1 seulement ; rien d\'autre ne change', (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 48);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role, guest) VALUES ('a', 'A', 'x', 'admin', 0), ('b', 'B', 'y', 'user', 0), ('c', 'C', 'z', 'user', 1)").run();
  const before = old.prepare('SELECT * FROM users ORDER BY id').all();
  old.close();
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  migrate(db);
  t.after(() => db.close());
  assert.equal(MIGRATIONS.length, 50);
  assert.equal(schemaVersion(db), 50);
  const after = db.prepare('SELECT * FROM users ORDER BY id').all();
  assert.deepEqual(after.map(({ lists_allowed, lists_enabled, home_projects, home_project_id, ...rest }) => rest), before);
  assert.deepEqual(after.map((row) => [row.lists_allowed, row.lists_enabled]), [[1, 1], [1, 1], [0, 0]], 'invité déjà créé : listes non autorisées (le plus sûr)');
  for (const column of ['lists_allowed', 'lists_enabled']) {
    assert.throws(() => db.prepare(`UPDATE users SET ${column} = 2 WHERE id = 3`).run(), /CHECK/, column);
    assert.throws(() => db.prepare(`UPDATE users SET ${column} = NULL WHERE id = 3`).run(), /NOT NULL/, column);
  }
  migrate(db);
  assert.equal(schemaVersion(db), 50);
});

// --- Règles pures ---

test('règle : Listes toujours pour un Admin et un Utilisateur ; pour un invité, autorisées ET allumées (les quatre cas)', () => {
  for (const role of ['admin', 'user']) {
    for (const allowed of [true, false]) {
      for (const on of [true, false]) assert.equal(usedFeatures({ lists: on }, { lists: allowed }, role).lists, true, `${role} ${allowed} ${on}`);
    }
  }
  for (const allowed of [true, false]) {
    for (const on of [true, false]) assert.equal(usedFeatures({ lists: on }, { lists: allowed }, 'guest').lists, allowed && on, `invité ${allowed} ${on}`);
  }
  // Cases proposées : « Listes » pour un invité seulement, en premier
  assert.deepEqual(permissionsFor('guest'), ['lists', 'notes', 'projects', 'projectsCreate', 'mcp']);
  assert.deepEqual(permissionsFor('user'), ['notes', 'projects', 'projectsCreate', 'mcp']);
  assert.deepEqual(permissionsFor('admin'), []);
  assert.equal(defaultAllowed('guest').lists, false);
  // Réglages › Fonctions : la ligne « Listes » d'un invité seulement
  assert.deepEqual(offeredFeatures({ lists: true, notes: true, projects: false }, 'guest'), ['lists', 'notes']);
  assert.deepEqual(offeredFeatures({ lists: true, notes: true, projects: true }, 'user'), ['notes', 'projects']);
  // Un Utilisateur n'a pas d'interrupteur « Listes » ; un invité, s'il est autorisé
  assert.equal(featuresChangeProblem({ lists: false }, { lists: true, notes: true, projects: true }, 'user'), 'ops.fonctionInconnue');
  assert.equal(featuresChangeProblem({ lists: false }, { lists: true }, 'guest'), null);
  assert.equal(featuresChangeProblem({ lists: true }, { lists: false }, 'guest'), 'ops.fonctionNonAutorisee');
  // Les écrans des listes appartiennent à la fonction
  assert.deepEqual(FEATURE_ROUTES.lists, ['lists', 'list', 'newList', 'editList', 'gifts']);
  for (const hash of ['#/listes', '#/listes/abc', '#/listes/nouvelle', '#/listes/abc/modifier', '#/listes/a-offrir']) {
    assert.equal(screenAllowed(matchRoute(hash).name, { lists: false }), false, hash);
    assert.equal(screenAllowed(matchRoute(hash).name, {}), true, hash);
  }
});

test('écrans sans Listes : bandeau à 3, 4, 5 ou 6 boutons ; tuiles ; premier écran ; Échéances (décision 5) ; invitation', () => {
  const guest = (features, projects = []) => screenFeatures({ features, projects: new Map(projects.map((p) => [p.id, p])) }, 'guest');
  const deadlineProject = { id: 'p', deadlinesEnabled: true };
  const noDeadlines = { id: 'p', deadlinesEnabled: false };
  const home = { enabled: true };
  // Invité « projets seulement » : Accueil, Projets, Réglages (trois)
  const projectsOnly = guest({ lists: false, notes: false, projects: true }, [noDeadlines]);
  assert.deepEqual(tabScreens(home, projectsOnly), ['home', 'projects', 'settings']);
  // Un projet à l'option « Échéances » : Échéances revient (quatre)
  assert.deepEqual(tabScreens(home, guest({ lists: false, notes: false, projects: true }, [deadlineProject])), ['home', 'deadlines', 'projects', 'settings']);
  // Notes et projets : cinq ; Listes en plus : six
  assert.deepEqual(tabScreens(home, guest({ lists: false, notes: true, projects: true }, [deadlineProject])), ['home', 'deadlines', 'notes', 'projects', 'settings']);
  assert.deepEqual(tabScreens(home, guest({ lists: true, notes: true, projects: true })), ['home', 'deadlines', 'lists', 'notes', 'projects', 'settings']);
  // Rien d'utilisé : Accueil et Réglages
  assert.deepEqual(tabScreens(home, guest({ lists: false, notes: false, projects: false })), ['home', 'settings']);
  // La famille : jamais sans Listes, même si une copie dit le contraire
  const family = screenFeatures({ features: { lists: false, notes: true, projects: false } }, 'user');
  assert.deepEqual(tabScreens(home, family), ['home', 'deadlines', 'lists', 'notes', 'settings']);
  // Tuiles : ni Listes, ni « À offrir », ni Échéances (sans projet daté)
  assert.deepEqual(shownTiles({}, projectsOnly), ['account', 'projects']);
  assert.ok(shownTiles({}, guest({ lists: true, notes: false, projects: false })).includes('gifts'));
  // Accueil coupé : le premier écran possible (Projets), jamais une liste
  assert.equal(firstScreen({ enabled: false, start: 'lists' }, projectsOnly), 'projects');
  assert.deepEqual(startScreens(projectsOnly), ['projects']);
  assert.equal(firstScreen({ enabled: false }, guest({ lists: false, notes: false, projects: false })), 'home', 'rien d\'utilisé : l\'Accueil et son invitation');
  // Échéances pour un invité : ses Listes, ou un projet à l'option allumée
  assert.equal(deadlinesShown('guest', { lists: false, projectDeadlines: false }), false);
  assert.equal(projectsOnly.deadlines, false);
  // Invitation : seulement quand rien n'est utilisé ; nomme « Listes » si c'est la seule
  assert.equal(welcomeHint(projectsOnly, { lists: false, notes: false, projects: true }), null);
  assert.deepEqual(welcomeHint({ lists: false, notes: false, projects: false }, { lists: true, notes: false, projects: false }), { kind: 'one', feature: 'lists' });
  assert.equal(welcomeHint(family, { lists: true }), null);
  for (const key of ['accueil.bienvenue.listes', 'reglages.fonctions.listes', 'reglages.fonctions.listes.detail', 'administration.fonctions.listes', 'administration.fonctions.listes.detail.invite', 'administration.fonctions.retirer.listes.question', 'administration.fonctions.retirer.listes.texte', 'administration.acces.listesProjets', 'administration.compte.versInvite.listes', 'ops.listesNonAutorisees', 'ops.listesCoupees', 'ops.personneSansListes', 'partage.personnes.sansListes', 'alertes.liste.activer', 'corbeille.vide.aucune', 'raccourcis.partout.nouvelleNote', 'claude.autoriser.sansListes', 'comptes.fonctions.listesInviteSeulement']) {
    assert.ok(fr[key] && en[key] && fr[key] !== en[key], key);
  }
});

test('copie locale : listes rallumées = tout recharger ; éteintes = mémoire des articles oubliée ; Notifications sans les lignes des listes', () => {
  const state = emptyState();
  loadSync(state, { serverTime: 'a', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [{ nameNormalized: 'pain', name: 'Pain' }], features: { lists: true, notes: true, projects: false } });
  mergeSync(state, { serverTime: 'b', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { lists: false, notes: true, projects: false } });
  assert.deepEqual(state.history, [], 'sans listes : rien de la mémoire des articles');
  assert.equal(state.projectsReload, false);
  mergeSync(state, { serverTime: 'c', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { lists: true, notes: true, projects: false } });
  assert.equal(state.projectsReload, true, 'rallumées : la prochaine synchronisation recharge tout');
  state.features = { lists: false, notes: true, projects: true };
  state.inbox = { rows: [
    { id: 1, targetType: 'list', kind: 'changes' },
    { id: 2, targetType: 'item', kind: 'reminder' },
    { id: 3, targetType: 'list', kind: 'sharing' },
    { id: 4, targetType: 'project', kind: 'changes' },
  ] };
  assert.deepEqual(inboxShownRows(state).map((row) => row.id), [3, 4]);
});

// --- Serveur : la case de l'Admin, l'interrupteur de l'invité ---

test('Admin : case « Listes » d\'un invité seulement ; cochée = allumée aussitôt ; il l\'éteint, la rallume ; rien d\'effacé ; journal', async (t) => {
  const h = await family(t);
  const max = await addGuest(h, 'max', 'Max');
  assert.equal(max.allowed.lists, false);
  assert.deepEqual(listsRow(h, 'max'), { lists_allowed: 0, lists_enabled: 0 });
  // Un Utilisateur : pas de case « Listes » (refus, rien d'écrit)
  const refused = await setAllowed(h, 'lea', { lists: false });
  assert.deepEqual([refused.status, refused.body.error], [400, fr['comptes.fonctions.listesInviteSeulement']]);
  assert.equal((await h.guillaume.post('/api/admin/users', { username: 'paul.login', password: pass('paul'), role: 'user', allowed: { lists: false } })).status, 400);
  // Ni l'invité, ni la famille ne changent une case
  assert.equal((await h.max.request('PATCH', `/api/admin/users/${h.ids.max}`, { allowed: { lists: true } })).status, 403);
  assert.equal((await h.lea.request('PATCH', `/api/admin/users/${h.ids.max}`, { allowed: { lists: true } })).status, 403);
  // Cochée : allumée aussitôt
  const on = await setAllowed(h, 'max', { lists: true });
  assert.equal(on.status, 200, on.text);
  assert.deepEqual(listsRow(h, 'max'), { lists_allowed: 1, lists_enabled: 1 });
  assert.equal((await h.max.get('/api/sync')).body.features.lists, true);
  // Il l'éteint lui-même, puis la rallume
  await ok(h.max, { type: 'account.features', lists: false });
  assert.equal((await h.max.get('/api/sync')).body.features.lists, false);
  await ok(h.max, { type: 'account.features', lists: true });
  assert.equal((await h.max.get('/api/sync')).body.features.lists, true);
  // Un Utilisateur n'a pas d'interrupteur « Listes »
  const userSwitch = await one(h.lea, { type: 'account.features', lists: false });
  assert.deepEqual([userSwitch.status, userSwitch.error], [400, fr['ops.fonctionInconnue']]);
  // Non autorisée : il ne l'allume ni ne l'éteint
  assert.equal((await setAllowed(h, 'max', { lists: false })).status, 200);
  for (const value of [true, false]) {
    const res = await one(h.max, { type: 'account.features', lists: value });
    assert.deepEqual([res.status, res.error], [403, fr['ops.fonctionNonAutorisee']]);
  }
  // Ligne de l'Administration : « Invité · Listes, Projets »
  await setAllowed(h, 'max', { lists: true, projects: true });
  const row = (await h.guillaume.get('/api/admin/users')).body.users.find((u) => u.id === h.ids.max);
  assert.deepEqual([row.allowed.lists, row.allowed.projects, row.used.lists], [true, true, true]);
  const journal = h.app.logs.join('\n');
  assert.match(journal, /admin_access_changed admin="g\.admin" user="max\.login" ip="[^"]+" lists=1 notes=0 projects=0 create=0 mcp=0 previous="lists=0 notes=0 projects=0 create=0 mcp=0" turned_on="lists"/);
});

// --- Le contrôle des routes : toutes, une à une ---

test('routes des listes : 403 pour un invité sans Listes (non autorisées, puis éteintes) ; comme avant avec ; non-membre 404 ; famille inchangée', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true });
  const { listId, itemId } = await sharedList(h, ['max', 'lea']);
  // Une liste d'envies de Guillaume pour Léa, partagée avec Max (souhait)
  const wishes = uuid();
  const wish = uuid();
  await ops(h.guillaume, [
    { type: 'list.create', listId: wishes, name: 'Envies de Léa', listType: 'wishes', forUserId: h.ids.lea },
    { type: 'item.create', listId: wishes, itemId: wish, name: 'Livre' },
  ]);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${wishes}/members`, { userIds: [h.ids.lea, h.ids.max], access: { [h.ids.max]: 'modification' } })).status, 200);
  // Toutes les adresses des listes et de ce qui en dépend
  const requests = [
    ['GET', '/api/lists'],
    ['GET', '/api/lists/deleted'],
    ['POST', '/api/lists/deleted/purge', { ids: [] }],
    ['POST', `/api/lists/${listId}/restore`, {}],
    ['POST', `/api/lists/${listId}/purge`, {}],
    ['GET', `/api/lists/${listId}`],
    ['PUT', `/api/lists/${listId}/members`, { userIds: [] }],
    ['POST', `/api/lists/${listId}/wishes`, {}],
    ['POST', `/api/lists/${listId}/duplicate`, {}],
    ['GET', `/api/lists/${listId}/share`],
    ['PUT', `/api/lists/${listId}/share`, {}],
    ['DELETE', `/api/lists/${listId}/share`],
    ['POST', `/api/lists/${listId}/products`, { code: '3017620422003' }],
    ['GET', '/api/suggestions?q=vi'],
    ['GET', `/api/suggestions?q=vi&listId=${listId}`],
    ['POST', '/api/stores', { name: 'Brico' }],
    ['POST', '/api/aisles', { name: 'Quincaillerie', listId }],
    ['GET', `/api/items/${itemId}/photo`],
    ['DELETE', `/api/items/${itemId}/photo`],
    ['POST', `/api/items/${wish}/reservation`, {}],
    ['PATCH', `/api/items/${wish}/reservation`, { open: true }],
    ['DELETE', `/api/items/${wish}/reservation`],
    ['DELETE', `/api/items/${wish}/reservation/all`],
    ['DELETE', `/api/items/${wish}/reservation/participants/${h.ids.lea}`],
    ['PUT', `/api/push/mutes/${listId}`, { muted: true }],
    ['POST', `/api/lists/${listId}/leave`, {}],
  ];
  // Chaque préfixe du contrôle est essayé ici
  for (const prefix of LIST_ROUTE_PATHS) assert.ok(requests.some(([, url]) => url.startsWith(`/api${prefix}`)), prefix);
  const before = h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE user_id = ?').pluck().get(h.ids.max);
  for (const [state, expected] of [['non autorisées', fr['ops.listesNonAutorisees']], ['éteintes', fr['ops.listesCoupees']]]) {
    if (state === 'non autorisées') assert.equal((await setAllowed(h, 'max', { lists: false })).status, 200);
    else {
      assert.equal((await setAllowed(h, 'max', { lists: true })).status, 200);
      await ok(h.max, { type: 'account.features', lists: false });
    }
    for (const [method, url, body] of requests) {
      const res = await h.max.request(method, url, body);
      assert.deepEqual([res.status, res.body?.error], [403, expected], `${state} : ${method} ${url}`);
    }
    // La photo : refusée avant même de lire l'envoi
    const photo = await h.max.request('PUT', `/api/items/${itemId}/photo`, undefined, { 'content-type': 'image/jpeg' });
    assert.equal(photo.status, 403, `${state} : photo`);
  }
  // Rien n'a changé pour lui : toujours membre, rien d'effacé, rien réservé
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE user_id = ?').pluck().get(h.ids.max), before);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservations').pluck().get(), 0);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM stores WHERE name = 'Brico'").pluck().get(), 0);
  // Rallumées : les mêmes adresses répondent comme pour tout membre
  await ok(h.max, { type: 'account.features', lists: true });
  assert.equal((await h.max.get('/api/lists')).body.lists.length, 2);
  assert.equal((await h.max.get(`/api/lists/${listId}`)).status, 200);
  assert.equal((await h.max.get('/api/suggestions?q=vi')).status, 200);
  assert.equal((await h.max.request('PUT', `/api/push/mutes/${listId}`, { muted: true })).status, 200);
  // Un non-membre de la famille : « introuvable », comme avant ; un membre : comme avant
  assert.equal((await h.hugo.get(`/api/lists/${listId}`)).status, 404);
  assert.equal((await h.hugo.get('/api/lists')).body.lists.length, 0);
  assert.equal((await h.lea.get(`/api/lists/${listId}`)).status, 200);
  assert.equal((await h.guillaume.get(`/api/lists/${listId}/share`)).status, 200);
  // L'annuaire n'est pas une route des listes (il sert aux notes et projets)
  assert.equal((await h.max.get('/api/users')).status, 200);
});

// --- File d'attente ---

test('file d\'attente : toute opération des listes refusée (403) sans Listes, avant tout traitement ; les autres passent', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true, notes: true });
  const { listId, itemId } = await sharedList(h, ['max']);
  await ok(h.max, { type: 'account.features', lists: false });
  const tries = [
    { type: 'list.create', listId: uuid(), name: 'À moi', listType: 'tasks' },
    { type: 'list.update', listId, name: 'Renommée' },
    { type: 'list.delete', listId },
    { type: 'list.removeChecked', listId },
    { type: 'list.uncheckAll', listId },
    { type: 'list.seen', listId, lastEventId: 1 },
    { type: 'list.mute', listId, muted: true },
    { type: 'item.create', listId, itemId: uuid(), name: 'Clous' },
    { type: 'item.update', itemId, name: 'Écrous' },
    { type: 'item.check', itemId, checked: true },
    { type: 'item.move', itemId, afterId: null },
    { type: 'item.delete', itemId },
    { type: 'item.restore', itemId },
    { type: 'gift.bought', itemId, bought: true },
    { type: 'habitual.hide', name: 'Vis' },
  ];
  // Chaque famille d'opérations des listes est essayée
  for (const prefix of LIST_OPS) assert.ok(tries.some((op) => op.type.startsWith(prefix)), prefix);
  const before = h.app.db.prepare('SELECT name, checked, deleted_at FROM items WHERE id = ?').get(itemId);
  for (const op of tries) {
    const res = await one(h.max, op);
    assert.deepEqual([res.status, res.error], [403, fr['ops.listesCoupees']], op.type);
  }
  assert.deepEqual(h.app.db.prepare('SELECT name, checked, deleted_at FROM items WHERE id = ?').get(itemId), before);
  assert.equal(h.app.db.prepare('SELECT name FROM lists WHERE id = ?').pluck().get(listId), 'Atelier');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists WHERE owner_id = ?').pluck().get(h.ids.max), 0);
  // Les autres opérations : selon leur fonction
  await ok(h.max, { type: 'note.create', noteId: uuid(), title: 'Note', body: 'Texte' });
  await ok(h.max, { type: 'account.news', enabled: false });
  // Allumées : la même opération passe
  await ok(h.max, { type: 'account.features', lists: true });
  await ok(h.max, { type: 'item.check', itemId, checked: true });
});

// --- Synchronisation, temps réel ---

test('synchronisation : rien des listes sans Listes (listes, articles, envies, « À offrir », mémoire, magasins, rayons, nouveautés) ; liste partagée gardée, de retour quand rallumées', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true, projects: true });
  const { listId } = await sharedList(h, ['max']);
  const wishes = uuid();
  const wish = uuid();
  await ops(h.guillaume, [
    { type: 'list.create', listId: wishes, name: 'Envies de Léa', listType: 'wishes', forUserId: h.ids.lea },
    { type: 'item.create', listId: wishes, itemId: wish, name: 'Livre' },
  ]);
  await h.guillaume.request('PUT', `/api/lists/${wishes}/members`, { userIds: [h.ids.lea, h.ids.max], access: { [h.ids.max]: 'modification' } });
  assert.equal((await h.max.post(`/api/items/${wish}/reservation`, {})).status, 200);
  await ok(h.max, { type: 'gift.bought', itemId: wish, bought: true });
  const full = (await h.max.get('/api/sync')).body;
  assert.equal(full.listIds.length, 2);
  assert.ok(full.stores.length > 0 && full.aisles.length > 0 && full.history.length > 0);
  assert.ok(Object.keys(full.reservations).length && Object.keys(full.gifts.reservedAt).length);
  // L'Admin retire les Listes : la synchronisation n'en dit plus rien
  assert.equal((await setAllowed(h, 'max', { lists: false })).status, 200);
  for (const since of [null, full.serverTime]) {
    const body = (await h.max.get(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync')).body;
    assert.deepEqual([body.lists, body.listIds, body.items, body.stores, body.aisles, body.history], [[], [], [], [], [], []], String(since));
    assert.deepEqual([body.reservations, body.gifts, body.news.lists], [{}, { reservedAt: {}, bought: [] }, {}]);
    assert.equal(body.features.lists, false);
    assert.equal(body.allowed.lists, false);
    assert.ok(!JSON.stringify(body).includes('Atelier') && !JSON.stringify(body).includes('Livre') && !JSON.stringify(body).includes('Vis'), 'aucun nom de liste ni d\'article');
    // Le reste : comme avant (projets, annuaire vide, page Notifications)
    assert.deepEqual(body.users, []);
    assert.ok(Array.isArray(body.projects));
  }
  // Rien n'est effacé : membre, réservation, « Acheté »
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE user_id = ?').pluck().get(h.ids.max), 2);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservations WHERE user_id = ?').pluck().get(h.ids.max), 1);
  // Recochées (allumées aussitôt) : tout revient
  assert.equal((await setAllowed(h, 'max', { lists: true })).status, 200);
  const back = (await h.max.get('/api/sync')).body;
  assert.deepEqual(back.listIds.sort(), [listId, wishes].sort());
  assert.ok(back.items.some((item) => item.name === 'Vis'));
  assert.equal(back.gifts.bought.length, 1);
});

// Ouvre le flux temps réel d'un client et garde les messages reçus
async function openStream(app, client) {
  const controller = new AbortController();
  const cookie = [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const res = await fetch(`${app.base}/api/events`, { headers: { cookie }, signal: controller.signal });
  assert.equal(res.status, 200);
  const stream = { events: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const m of decoder.decode(value, { stream: true }).matchAll(/^event: (.*)$/gm)) stream.events.push(m[1]);
      }
    } catch {
      // flux coupé par le test
    }
  })();
  stream.close = () => controller.abort();
  return stream;
}

test('temps réel : ni « event: list » ni « refs » des magasins sans Listes ; avec, comme avant', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true });
  const { listId } = await sharedList(h, ['max']);
  await ok(h.max, { type: 'account.features', lists: false });
  const off = await openStream(h.app, h.max);
  await pause(50);
  await ops(h.guillaume, [{ type: 'item.create', listId, itemId: uuid(), name: 'Clous' }]);
  assert.equal((await h.guillaume.post('/api/admin/stores', { name: 'Brico' })).status, 201);
  await pause(100);
  assert.deepEqual(off.events.filter((event) => event !== 'ready'), []);
  off.close();
  await ok(h.max, { type: 'account.features', lists: true });
  const on = await openStream(h.app, h.max);
  await pause(50);
  await ops(h.guillaume, [{ type: 'item.create', listId, itemId: uuid(), name: 'Écrous' }]);
  assert.equal((await h.guillaume.post('/api/admin/stores', { name: 'Leroy' })).status, 201);
  await pause(100);
  assert.ok(on.events.includes('list') && on.events.includes('refs'), on.events.join(','));
  on.close();
});

// --- Notifications ---

test('notifications : rien des listes sans Listes (modifications, partage non autorisé, résumé du matin) ; « Partage » invite à les rallumer quand elles sont éteintes', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true });
  const page = async () => (await h.max.get('/api/inbox')).body.rows;
  const flush = async () => {
    h.app.clock.now += GROUP_MS + 1000;
    await h.app.ctx.notify.flushDue();
  };
  // Avec Listes : partage et modifications arrivent
  const { listId } = await sharedList(h, ['max']);
  await ops(h.guillaume, [{ type: 'item.create', listId, itemId: uuid(), name: 'Clous' }]);
  await flush();
  assert.deepEqual((await page()).map((row) => row.kind).sort(), ['changes', 'sharing']);
  // Éteintes : les lignes déjà là disparaissent, sauf « Partage » (qui
  // ouvre Réglages › Fonctions) ; plus rien de nouveau, sauf un partage
  await ok(h.max, { type: 'account.features', lists: false });
  let rows = await page();
  assert.deepEqual(rows.map((row) => [row.kind, row.target, row.sub]), [['sharing', { type: 'features' }, fr['alertes.liste.activer']]]);
  await ops(h.guillaume, [{ type: 'item.create', listId, itemId: uuid(), name: 'Écrous' }]);
  const other = uuid();
  await ops(h.guillaume, [{ type: 'list.create', listId: other, name: 'Garage', listType: 'tasks' }]);
  await h.guillaume.request('PUT', `/api/lists/${other}/members`, { userIds: [h.ids.max] });
  await flush();
  rows = await page();
  assert.deepEqual(rows.map((row) => row.kind), ['sharing', 'sharing']);
  assert.ok(rows.every((row) => row.target?.type === 'features'));
  // Non autorisées : rien, pas même « Partage »
  assert.equal((await setAllowed(h, 'max', { lists: false })).status, 200);
  assert.deepEqual(await page(), []);
  const third = uuid();
  await ops(h.guillaume, [{ type: 'list.create', listId: third, name: 'Cave', listType: 'tasks' }]);
  // (l'Admin ne peut pas la lui partager : refus nommé)
  const share = await h.guillaume.request('PUT', `/api/lists/${third}/members`, { userIds: [h.ids.max] });
  assert.deepEqual([share.status, share.body.error], [400, fr['ops.personneSansListes'].replace('{name}', 'Max')]);
  // Rien n'est effacé : autorisées de nouveau, les lignes reviennent
  assert.equal((await setAllowed(h, 'max', { lists: true })).status, 200);
  assert.ok((await page()).some((row) => row.kind === 'changes'));
});

test('résumé du matin et rappels : jamais les tâches d\'un invité sans Listes', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true });
  const listId = uuid();
  const date = new Date(h.app.clock.now);
  date.setDate(date.getDate() + 1);
  date.setHours(8, 30, 0, 0);
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  await ops(h.guillaume, [
    { type: 'list.create', listId, name: 'Maison', listType: 'tasks', dueEnabled: true },
    { type: 'item.create', listId, itemId: uuid(), name: 'Payer', dueDate: today },
    { type: 'item.create', listId, itemId: uuid(), name: 'Dentiste', dueDate: today, dueTime: '09:00', remindBefore: 15 },
  ]);
  await h.guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [h.ids.max, h.ids.lea] });
  await ok(h.max, { type: 'account.features', lists: false });
  h.app.clock.now = date.getTime();
  await h.app.ctx.notify.runDigest();
  date.setHours(8, 50);
  h.app.clock.now = date.getTime();
  await h.app.ctx.notify.runReminders();
  const kinds = (rows) => rows.map((row) => row.kind).filter((kind) => ['digest', 'reminder'].includes(kind)).sort();
  assert.deepEqual(kinds((await h.lea.get('/api/inbox')).body.rows), ['digest', 'reminder'], 'Léa les reçoit');
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM inbox WHERE user_id = ? AND category = 'due'").pluck().get(h.ids.max), 0, 'rien pour Max, pas même en base');
});

// --- Assistants IA ---

test('assistants IA : les cinq outils des listes refusés sans Listes (message clair), les autres selon leur fonction ; l\'autorisation ne propose pas « Certaines listes »', async (t) => {
  const h = await family(t, { mcp: true });
  await addGuest(h, 'max', 'Max', { lists: true, notes: true, mcp: true });
  const { listId, itemId } = await sharedList(h, ['max']);
  const tokens = await connect(h, h.max, pass('max'), { scope: 'write', lists: 'all' });
  const ai = claude(h, tokens.access_token);
  assert.equal(data(await ai.tool('list_lists')).lists.length, 1);
  const args = {
    list_lists: {},
    read_list: { list_id: listId },
    add_items: { list_id: listId, items: [{ name: 'Clous' }] },
    set_checked: { list_id: listId, item_ids: [itemId], checked: true },
    update_items: { list_id: listId, items: [{ id: itemId, name: 'Écrous' }] },
  };
  assert.deepEqual(Object.keys(args), LIST_TOOLS);
  for (const [state, message] of [['éteintes', MCP_LISTS_OFF], ['non autorisées', MCP_LISTS_NOT_ALLOWED]]) {
    if (state === 'éteintes') await ok(h.max, { type: 'account.features', lists: false });
    else assert.equal((await setAllowed(h, 'max', { lists: false })).status, 200);
    for (const [name, value] of Object.entries(args)) {
      const res = await ai.tool(name, value);
      assert.equal(res.body.result.isError, true, `${state} : ${name}`);
      assert.equal(res.body.result.content[0].text, message, `${state} : ${name}`);
    }
    // Les notes, elles, répondent
    assert.ok(Array.isArray(data(await ai.tool('list_notes')).notes));
  }
  assert.equal(h.app.db.prepare('SELECT name FROM items WHERE id = ?').pluck().get(itemId), 'Vis', 'rien d\'écrit');
  // Écran « Autoriser un assistant IA » : listsUsed faux, la liste des listes vide
  const params = new URLSearchParams({ response_type: 'code', client_id: tokens.clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 's' });
  const start = await fetch(`${h.app.base}/oauth/authorize?${params}`, { redirect: 'manual' });
  const requestId = start.headers.get('location').split('/').pop();
  const consent = await h.max.get(`/api/oauth/demandes/${requestId}`);
  assert.equal(consent.status, 200, consent.text);
  assert.deepEqual([consent.body.listsUsed, consent.body.lists], [false, []]);
  // « Certaines listes » : aucune liste à lui (refus)
  const some = await h.max.post(`/api/oauth/demandes/${requestId}/accord`, { password: pass('max'), scope: 'read', lists: [listId] });
  assert.equal(some.status, 400);
  // Consignes données à l'assistant : le refus est expliqué
  assert.match(read('server/mcp.js'), /Un compte invité peut ne pas avoir les listes/);
  assert.match(code('public/js/screens/claude-consent.js'), /const listsField = !listsUsed \? /);
});

// --- Liens publics arrêtés quand l'Admin retire une fonction ---

test('Notes décochées (tout compte) : les liens publics de ses notes s\'arrêtent, journal en anglais ; pas sans raison', async (t) => {
  const h = await family(t);
  const note = uuid();
  await ok(h.lea, { type: 'note.create', noteId: note, title: 'Recette', body: 'Crêpes' });
  assert.equal((await h.lea.request('PUT', `/api/notes/${note}/share`, {})).status, 201);
  const live = () => h.app.db.prepare('SELECT COUNT(*) FROM note_public_shares WHERE note_id = ? AND revoked_at IS NULL').pluck().get(note);
  assert.equal(live(), 1);
  // Un autre changement (assistants IA) : le lien reste
  assert.equal((await setAllowed(h, 'lea', { mcp: false })).status, 200);
  assert.equal(live(), 1);
  assert.equal((await setAllowed(h, 'lea', { notes: false })).status, 200);
  assert.equal(live(), 0);
  assert.match(h.app.logs.join('\n'), /note_link_stopped admin="g\.admin" user="lea\.login" ip="[^"]+" count=1 reason="notes no longer allowed by the admin"/);
  assert.doesNotMatch(h.app.logs.join('\n'), /Recette|Crêpes/, 'jamais le contenu');
  // Recochées : le lien ne revient pas tout seul (elle le recrée si elle veut)
  assert.equal((await setAllowed(h, 'lea', { notes: true })).status, 200);
  assert.equal(live(), 0);
  // La confirmation de l'Admin le dit
  assert.match(fr['administration.fonctions.retirer.notes.texte'], /liens publics de ses notes seront arrêtés/);
  assert.match(fr['administration.fonctions.retirer.listes.texte'], /liens publics de ses listes seront arrêtés/);
});

test('Listes décochées pour un invité : ses liens publics de listes s\'arrêtent (un ancien lien, d\'avant son rôle d\'invité)', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true });
  const listId = uuid();
  await ok(h.max, { type: 'list.create', listId, name: 'À moi', listType: 'tasks' });
  // (un lien d'avant : posé en base, un invité n'en crée jamais)
  h.app.db.prepare("INSERT INTO public_shares (list_id, token_hash, token_sealed, created_by, created_at, expires_at) VALUES (?, 'h', 's', ?, '2026-10-16T12:00:00.000Z', '2026-12-16T12:00:00.000Z')").run(listId, h.ids.max);
  assert.equal((await setAllowed(h, 'max', { lists: false })).status, 200);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares WHERE revoked_at IS NULL').pluck().get(), 0);
  assert.match(h.app.logs.join('\n'), /public_link_stopped admin="g\.admin" user="max\.login" ip="[^"]+" count=1 reason="lists no longer allowed by the admin"/);
});

test('Utilisateur devenu invité : il garde ses Listes (autorisées, allumées) ; la confirmation le dit', async (t) => {
  const h = await family(t);
  const listId = uuid();
  await ok(h.hugo, { type: 'list.create', listId, name: 'Vélo', listType: 'tasks' });
  h.app.db.prepare('UPDATE users SET lists_allowed = 0, lists_enabled = 0 WHERE id = ?').run(h.ids.hugo);
  assert.equal((await h.hugo.get('/api/sync')).body.features.lists, true, 'Utilisateur : les valeurs ne comptent pas');
  const res = await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.hugo}`, { role: 'guest' });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual([res.body.user.allowed.lists, res.body.user.used.lists], [true, true]);
  assert.deepEqual((await h.hugo.get('/api/sync')).body.listIds, [listId]);
  assert.match(code('public/js/screens/admin.js'), /t\('administration\.compte\.versInvite\.listes'\),/);
});

// --- Écrans : rien des listes ---

test('écrans : Réglages › Fonctions (« Listes » d\'un invité), page d\'un compte, menu de gauche, Corbeille, Notifications, raccourcis, partage ; jamais de HTML', () => {
  const files = ['public/js/screens/features.js', 'public/js/screens/admin.js', 'public/js/screens/pc-side.js', 'public/js/screens/trash-page.js', 'public/js/screens/notifications.js', 'public/js/screens/home.js', 'public/js/screens/settings.js', 'public/js/screens/share-picker.js', 'public/js/screens/claude-consent.js', 'public/js/shortcuts.js'];
  for (const file of files) assert.doesNotMatch(code(file), /innerHTML|insertAdjacentHTML|outerHTML/, file);
  assert.match(code('public/js/screens/features.js'), /lists: \{ name: \(\) => t\('reglages\.fonctions\.listes'\)/);
  // Menu de gauche : ni « Listes », ni recherche des listes, ni « Nouvelle liste », ni « Types »
  const side = code('public/js/screens/pc-side.js');
  assert.match(side, /listsLink\.hidden = !listsUsed;\s*searchField\.hidden = !listsUsed;/);
  assert.match(side, /if \(!LIST_SCREENS\.includes\(selected\.name\) \|\| !shownFeatures\(\)\.lists\) \{/);
  // Notifications : ni « Envies », ni « Signaler les éléments cochés », ni le rappel des réglages d'une liste
  const notifications = code('public/js/screens/notifications.js');
  assert.match(notifications, /export const LIST_ONLY_KINDS = \['wishes'\];/);
  assert.match(notifications, /if \(key === 'checks'\) row\.hidden = !app\.data\.news\?\.enabled \|\| !shownFeatures\(\)\.lists;/);
  assert.match(notifications, /listsUsed \? h\('div', \{ class: 'group-after' \}, h\('p', \{ class: 'muted' \}, perListNote\(\)\)\) : null/);
  // Raccourcis : N ne crée pas de liste, [ et ] ne font rien
  const keys = code('public/js/shortcuts.js');
  assert.match(keys, /else if \(listsShown\(\)\) navigate\('newList'\);\s*else return false;/);
  assert.match(read('public/js/app.js'), /listsOn: \(\) => shownFeatures\(\)\.lists,/);
  // Partage de l'Admin : un invité sans Listes est grisé
  assert.match(code('public/js/screens/share-picker.js'), /const feature = project \? 'projects' : note \? 'notes' : 'lists';/);
  // Accueil : l'invitation suit les fonctions montrées (Listes comprises)
  assert.match(code('public/js/screens/home.js'), /const hint = welcomeHint\(shownFeatures\(\), allowedNow\(\)\);/);
  // Service worker : nouvelle version
  assert.ok(Number(/const VERSION = `v(\d+)-/.exec(read('public/sw.js'))?.[1]) >= 181);
});

test('un seul contrôle des listes : listsRefusal (server/features.js), repris par les routes, la file d\'attente, la synchronisation, les notifications, le temps réel et les assistants IA', () => {
  assert.match(code('server/features.js'), /function listsRefusal\(userId\) \{/);
  assert.match(code('server/app.js'), /api\.use\(LIST_ROUTE_PATHS, requireLists\(ctx\)\);\s*api\.use\(listRoutes\(ctx\)\);/);
  assert.deepEqual(LIST_ROUTE_PATHS, ['/lists', '/items', '/suggestions', '/stores', '/aisles', '/push/mutes']);
  const lists = code('server/lists.js');
  assert.match(lists, /const refusal = features\.listsRefusal\(user\.id\);\s*if \(refusal\) throw new OpError\(403, refusal\);/);
  assert.match(lists, /if \(!features\.listsUsed\(user\.id\)\) \{\s*return syncBody\(/);
  assert.match(code('server/notify.js'), /const refusal = features\.listsRefusal\(userId\);/);
  assert.match(code('server/inbox.js'), /const refusal = features\.listsRefusal\(user\.id\);/);
  assert.match(code('server/events.js'), /const usesLists = \(userId\) => ctx\.features\?\.listsUsed\(userId\) \?\? true;/);
  assert.match(code('server/mcp-tools.js'), /const refusal = ctx\.features\?\.listsRefusal\(access\.user\.id\);/);
  // Les colonnes ne sont lues que par server/features.js (et le schéma)
  for (const dir of ['server', 'server/routes']) {
    for (const file of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`)) {
      if (['server/features.js', 'server/db.js', 'server/directory.js'].includes(file)) continue;
      assert.doesNotMatch(read(file), /lists_allowed|lists_enabled/, file);
    }
  }
});
