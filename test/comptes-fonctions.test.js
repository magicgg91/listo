// Comptes invités, étape 2 (docs/cadrage-comptes.md, décisions du
// propriétaire du 25 novembre 2026) : « Fonctions autorisées » par l'Admin
// (Notes, Projets, « Peut créer ses propres projets », Assistants IA ;
// migration 48). La case de l'Admin autorise, la personne allume ; pour un
// invité, une fonction cochée s'allume aussitôt. Une fonction est utilisée
// si elle est autorisée ET allumée : c'est ce que vérifient la
// synchronisation, les opérations, les routes, les notifications, les
// assistants IA et les écrans.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir } from './helpers.js';
import { connect, claude, data } from './mcp-helpers.js';
import { MIGRATIONS, migrate, schemaVersion } from '../server/db.js';
import {
  PERMISSIONS, defaultAllowed, normalizeAllowed, allowedChangeProblem, applyAllowedChange, mayCreateProjects, deadlinesShown, welcomeHint,
} from '../public/js/access.js';
import { usedFeatures, featuresChangeProblem, screenFeatures, screenAllowed, PERSONAL_FEATURES } from '../public/js/features.js';
import { tabScreens } from '../public/js/home-tiles.js';
import { projectMenuEntries } from '../public/js/project-view.js';
import { NOTES_NOT_ALLOWED as MCP_NOTES_NOT_ALLOWED } from '../server/mcp-notes.js';
import { PROJECTS_NOT_ALLOWED as MCP_PROJECTS_NOT_ALLOWED, PROJECTS_OFF as MCP_PROJECTS_OFF, PROJECT_CREATION_NOT_ALLOWED } from '../server/mcp-projects.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
const pass = (name) => `MotDePasse-${name}`;
const columns = () => [{ columnId: uuid(), name: 'À faire', color: 'gris' }, { columnId: uuid(), name: 'Fait', color: 'vert' }];
const NONE = { lists: false, notes: false, projects: false, projectsCreate: false, mcp: false };
const ALL = { lists: true, notes: true, projects: true, projectsCreate: true, mcp: true };

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

// Guillaume (Admin), Léa et Zoé (Utilisateurs) ; mcp : assistants IA
async function family(t, { mcp = false } = {}) {
  const app = await startTestApp(t, { config: { mcp } });
  const guillaume = await setupAdmin(app, { username: 'g.admin' });
  const ids = { guillaume: app.db.prepare("SELECT id FROM users WHERE username = 'g.admin'").pluck().get() };
  const h = { app, guillaume, ids };
  for (const [name, display] of [['lea', 'Léa'], ['zoe', 'Zoé']]) {
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
const setAllowed = (h, name, allowed, client = h.guillaume) => client.request('PATCH', `/api/admin/users/${h.ids[name]}`, { allowed });
const row = (h, name) => h.app.db.prepare('SELECT notes_allowed, projects_allowed, projects_create, mcp_allowed, notes_enabled, projects_enabled FROM users WHERE id = ?').get(h.ids[name]);
const listsRow = (h, name) => h.app.db.prepare('SELECT lists_allowed, lists_enabled FROM users WHERE id = ?').get(h.ids[name]);

// --- Règles pures (public/js/access.js, public/js/features.js) ---

test('règles : cases de départ par rôle, changement valable, invité allumé aussitôt, Utilisateur seulement autorisé', () => {
  assert.deepEqual(PERMISSIONS, ['lists', 'notes', 'projects', 'projectsCreate', 'mcp']);
  assert.deepEqual(defaultAllowed('user'), ALL);
  assert.deepEqual(defaultAllowed('admin'), ALL);
  assert.deepEqual(defaultAllowed('guest'), NONE);
  // Un Admin a tout, quelles que soient ses cases gardées
  assert.deepEqual(normalizeAllowed(NONE, 'admin'), ALL);
  assert.deepEqual(normalizeAllowed({ notes: false }, 'user'), { ...ALL, notes: false });
  assert.deepEqual(normalizeAllowed({ projects: true }, 'guest'), { ...NONE, projects: true });
  assert.deepEqual(normalizeAllowed(null, 'guest'), NONE);
  for (const bad of [null, [], 'x', { listes: true }, { notes: 'oui' }]) assert.equal(allowedChangeProblem(bad), 'comptes.fonctions.invalides', JSON.stringify(bad));
  // « Listes » : la case d'un invité seulement (étape 3)
  assert.equal(allowedChangeProblem({ lists: false }, 'user'), 'comptes.fonctions.listesInviteSeulement');
  assert.equal(allowedChangeProblem({ lists: true }, 'guest'), null);
  assert.deepEqual(applyAllowedChange('guest', NONE, { lists: true }), { allowed: { ...NONE, lists: true }, turnOn: ['lists'] });
  assert.deepEqual(normalizeAllowed({ ...ALL, lists: false }, 'user'), ALL, 'un Utilisateur a toujours les listes');
  assert.equal(allowedChangeProblem({}), 'comptes.rienAModifier');
  assert.equal(allowedChangeProblem({ notes: true, mcp: false }), null);
  // Invité : Notes et Projets cochés s'allument aussitôt ; pas les permissions
  assert.deepEqual(applyAllowedChange('guest', NONE, { projects: true, mcp: true }), { allowed: { ...NONE, projects: true, mcp: true }, turnOn: ['projects'] });
  assert.deepEqual(applyAllowedChange('guest', { ...NONE, projects: true }, { projects: true }).turnOn, [], 'déjà cochée : rien à rallumer');
  // Utilisateur : la case autorise seulement
  assert.deepEqual(applyAllowedChange('user', { ...ALL, notes: false }, { notes: true }), { allowed: ALL, turnOn: [] });
  assert.equal(mayCreateProjects(ALL, { projects: true }), true);
  assert.equal(mayCreateProjects({ ...ALL, projectsCreate: false }, { projects: true }), false);
  assert.equal(mayCreateProjects(ALL, { projects: false }), false);
  for (const key of ['comptes.fonctions.invalides', 'comptes.fonctions.admin', 'ops.fonctionNonAutorisee', 'ops.projetsNonAutorises', 'ops.creationProjetInterdite', 'ops.notesNonAutorisees', 'ops.personneSansNotes', 'ops.personneSansProjets', 'autorisation.compteNonAutorise']) {
    assert.ok(fr[key] && en[key], key);
  }
});

test('fonction utilisée = autorisée ET allumée (les quatre cas, notes et projets) ; une fonction non autorisée ne s\'allume ni ne s\'éteint', () => {
  for (const allowed of [true, false]) {
    for (const on of [true, false]) {
      const used = usedFeatures({ notes: on, projects: on }, { notes: allowed, projects: allowed });
      assert.deepEqual(used, { deadlines: true, lists: true, notes: allowed && on, projects: allowed && on }, `autorisée ${allowed}, allumée ${on}`);
      // Listes : un invité seulement (un Utilisateur les a toujours)
      assert.equal(usedFeatures({ lists: on }, { lists: allowed }, 'guest').lists, allowed && on);
      assert.equal(usedFeatures({ lists: on }, { lists: allowed }, 'user').lists, true);
    }
  }
  assert.equal(featuresChangeProblem({ projects: true }, { notes: true, projects: false }), 'ops.fonctionNonAutorisee');
  assert.equal(featuresChangeProblem({ projects: false }, { notes: true, projects: false }), 'ops.fonctionNonAutorisee');
  assert.equal(featuresChangeProblem({ notes: false }, { notes: true, projects: false }), null);
  assert.equal(featuresChangeProblem({ notes: false }), null, 'sans autorisations connues : comme avant');
  // « Échéances » (migration 52) : pas de case de l'Admin ; l'interrupteur
  // de la personne seulement, permis dès que les Listes ou les Projets sont
  // autorisés (un Admin et un Utilisateur ont toujours les Listes)
  for (const allowed of [true, false]) {
    for (const on of [true, false]) assert.equal(usedFeatures({ deadlines: on }, { ...NONE, notes: allowed }, 'guest').deadlines, on, `invité ${allowed} ${on}`);
  }
  assert.equal(featuresChangeProblem({ deadlines: false }, { ...NONE, lists: true }, 'user'), null);
  assert.equal(featuresChangeProblem({ deadlines: false }, { ...NONE, projects: true }, 'guest'), null);
  assert.equal(featuresChangeProblem({ deadlines: false }, { ...NONE, notes: true }, 'guest'), 'ops.fonctionNonAutorisee', 'invité sans Listes ni Projets : rien à y voir');
  assert.equal(featuresChangeProblem({ deadlines: 'non' }, ALL, 'user'), 'ops.fonctionsInvalides');
  assert.deepEqual(PERSONAL_FEATURES, ['deadlines']);
  assert.ok(!PERMISSIONS.includes('deadlines'), 'aucune case « Échéances » pour l\'Admin');
});

test('Échéances (décision 5) : toujours pour la famille ; pour un invité, ses Listes ou un projet à l\'option « Échéances » allumée', () => {
  assert.equal(deadlinesShown('user'), true);
  assert.equal(deadlinesShown('admin', { lists: false }), true);
  assert.equal(deadlinesShown('guest', { lists: true }), true);
  assert.equal(deadlinesShown('guest', { lists: false, projectDeadlines: true }), true);
  assert.equal(deadlinesShown('guest', { lists: false, projectDeadlines: false }), false);
  const data = (deadlines, projects = true) => ({ features: { notes: false, projects }, projects: new Map([['p', { id: 'p', deadlinesEnabled: deadlines }]]) });
  // Invité : ses Listes, ou un projet à l'option « Échéances » allumée
  assert.equal(screenFeatures(data(false), 'guest').deadlines, true, 'Listes reçues allumées');
  const noLists = (deadlines, projects = true) => ({ ...data(deadlines, projects), features: { lists: false, notes: false, projects } });
  assert.equal(screenFeatures(noLists(false), 'guest').deadlines, false);
  assert.equal(screenFeatures(noLists(true), 'guest').deadlines, true);
  assert.equal(screenFeatures(noLists(true, false), 'guest').deadlines, false, 'projets éteints : rien');
  assert.equal(screenFeatures(noLists(false), 'user').lists, true, 'jamais sans listes pour la famille');
  assert.equal(screenFeatures(data(true), 'user').deadlines, true);
  // La règle elle-même se lit dans screenAllowed (étape 3 : sans Listes)
  assert.equal(screenAllowed('deadlines', { deadlines: false }), false);
  assert.equal(screenAllowed('deadlines', {}), true);
  assert.deepEqual(tabScreens({ enabled: true }, { notes: false, projects: true, deadlines: false }), ['home', 'lists', 'projects', 'settings']);
  assert.match(code('public/js/features.js'), /return \{ \.\.\.features, deadlines: features\.deadlines && deadlinesShown\(role, \{ lists: features\.lists, projectDeadlines \}\) \};/);
  // Interrupteur « Échéances » désactivé (Réglages › Fonctions, 26 novembre
  // 2026) : l'écran n'est montré à personne, quelle que soit la règle
  // d'un invité ; les deux à la fois pour un invité
  const off = (data) => ({ ...data, features: { ...data.features, deadlines: false } });
  for (const role of ['admin', 'user', 'guest']) {
    assert.equal(screenFeatures(off(data(true)), role).deadlines, false, role);
    assert.equal(screenFeatures(off(noLists(true)), role).deadlines, false, role);
  }
  assert.equal(screenFeatures(noLists(true), 'guest').deadlines, true, 'activée : la règle d\'un invité décide');
});

test('invitation de l\'Accueil : seulement quand aucune fonction n\'est utilisée ; nomme la seule fonction autorisée', () => {
  assert.equal(welcomeHint({ notes: false, projects: false }, NONE), null, 'Listes inconnues : comme avant, là');
  assert.equal(welcomeHint({ lists: true, notes: false, projects: false }, NONE), null, 'les Listes sont là');
  assert.equal(welcomeHint({ lists: false, notes: false, projects: true }, { ...NONE, projects: true }), null);
  assert.deepEqual(welcomeHint({ lists: false, notes: false, projects: false }, { ...NONE, projects: true }), { kind: 'one', feature: 'projects' });
  assert.deepEqual(welcomeHint({ lists: false, notes: false, projects: false }, { ...NONE, lists: true }), { kind: 'one', feature: 'lists' });
  assert.deepEqual(welcomeHint({ lists: false, notes: false, projects: false }, { ...NONE, notes: true, projects: true }), { kind: 'several', feature: null });
  assert.deepEqual(welcomeHint({ lists: false, notes: false, projects: false }, NONE), { kind: 'none', feature: null });
  for (const key of ['accueil.bienvenue.titre', 'accueil.bienvenue.projets', 'accueil.bienvenue.notes', 'accueil.bienvenue.listes', 'accueil.bienvenue.plusieurs', 'accueil.bienvenue.aucune', 'accueil.bienvenue.bouton']) assert.ok(fr[key] && en[key], key);
});

// --- Migration 48 ---

test('migration 48 : quatre colonnes à 1 pour les comptes existants, 0 ou 1 seulement ; rien d\'autre ne change', (t) => {
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 47);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role, guest) VALUES ('a', 'A', 'x', 'admin', 0), ('b', 'B', 'y', 'user', 0), ('c', 'C', 'z', 'user', 1)").run();
  const before = old.prepare('SELECT * FROM users ORDER BY id').all();
  old.close();
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  migrate(db);
  t.after(() => db.close());
  assert.equal(schemaVersion(db), 52);
  assert.equal(MIGRATIONS.length, 52);
  const after = db.prepare('SELECT * FROM users ORDER BY id').all();
  assert.deepEqual(after.map(({ notes_allowed, projects_allowed, projects_create, mcp_allowed, lists_allowed, lists_enabled, home_projects, home_project_id, sso_only, deadlines_enabled, ...rest }) => rest), before);
  for (const user of after) assert.deepEqual([user.notes_allowed, user.projects_allowed, user.projects_create, user.mcp_allowed], [1, 1, 1, 1]);
  for (const column of ['notes_allowed', 'projects_allowed', 'projects_create', 'mcp_allowed']) {
    assert.throws(() => db.prepare(`UPDATE users SET ${column} = 2 WHERE id = 2`).run(), /CHECK/, column);
  }
  migrate(db);
  assert.equal(schemaVersion(db), 52);
});

test('nouveau compte : Utilisateur tout autorisé ; invité rien d\'autorisé ni d\'allumé ; cases choisies dans « Nouveau compte », allumées pour un invité ; journal', async (t) => {
  const h = await family(t);
  const user = await h.guillaume.post('/api/admin/users', { username: 'paul.login', displayName: 'Paul', password: pass('paul') });
  assert.equal(user.status, 201);
  assert.deepEqual(user.body.user.allowed, ALL);
  const max = await addGuest(h, 'max', 'Max');
  assert.deepEqual(max.allowed, NONE);
  assert.deepEqual(row(h, 'max'), { notes_allowed: 0, projects_allowed: 0, projects_create: 0, mcp_allowed: 0, notes_enabled: 0, projects_enabled: 0 });
  assert.deepEqual((await h.max.get('/api/me')).body.user.features, { deadlines: true, lists: false, notes: false, projects: false }, '« Échéances » activée au départ, invité compris');
  assert.deepEqual(listsRow(h, 'max'), { lists_allowed: 0, lists_enabled: 0 });
  assert.deepEqual((await h.max.get('/api/me')).body.user.allowed, NONE);
  const ines = await addGuest(h, 'ines', 'Inès', { projects: true });
  assert.deepEqual(ines.allowed, { ...NONE, projects: true });
  assert.deepEqual((await h.ines.get('/api/sync')).body.features, { deadlines: true, lists: false, notes: false, projects: true }, 'cochés : allumés aussitôt');
  assert.deepEqual((await h.ines.get('/api/sync')).body.allowed, { ...NONE, projects: true });
  // Cases invalides : rien n'est créé
  const bad = await h.guillaume.post('/api/admin/users', { username: 'x.login', role: 'user', password: pass('x'), allowed: { lists: false } });
  assert.equal(bad.status, 400);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM users WHERE username = 'x.login'").pluck().get(), 0);
  const journal = h.app.logs.join('\n');
  assert.match(journal, /admin_account_created admin="g\.admin" user="ines\.login" role="guest" lists=0 notes=0 projects=1 create=0 mcp=0/);
  assert.match(journal, /admin_account_created admin="g\.admin" user="paul\.login" role="user" lists=1 notes=1 projects=1 create=1 mcp=1/);
});

// --- Route de l'Admin ---

test('route des cases : Admin seulement ; invité allumé aussitôt, Utilisateur seulement autorisé ; décocher puis recocher garde l\'interrupteur ; journal', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max');
  // Personne d'autre que l'Admin (les routes d'administration : 403)
  assert.equal((await setAllowed(h, 'max', { projects: true }, h.lea)).status, 403);
  assert.equal((await setAllowed(h, 'zoe', { projects: false }, h.max)).status, 403);
  assert.equal(row(h, 'max').projects_allowed, 0);
  // Invité : cochée = allumée aussitôt
  const res = await setAllowed(h, 'max', { projects: true });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body.user.allowed, { ...NONE, projects: true });
  assert.equal(row(h, 'max').projects_enabled, 1);
  // Il l'éteint lui-même ; décochée puis recochée par l'Admin : rallumée
  // (c'est un invité : cochée = allumée)
  await ok(h.max, { type: 'account.features', projects: false });
  assert.equal(row(h, 'max').projects_enabled, 0);
  // Utilisateur : la case autorise seulement
  await ok(h.zoe, { type: 'account.features', notes: false });
  assert.equal((await setAllowed(h, 'zoe', { notes: false, projects: false })).status, 200);
  assert.deepEqual((await h.zoe.get('/api/sync')).body.features, { deadlines: true, lists: true, notes: false, projects: false });
  assert.equal((await setAllowed(h, 'zoe', { notes: true, projects: true })).status, 200);
  assert.deepEqual(row(h, 'zoe'), { notes_allowed: 1, projects_allowed: 1, projects_create: 1, mcp_allowed: 1, notes_enabled: 0, projects_enabled: 0 }, 'interrupteurs de Zoé inchangés');
  // Un Admin : pas de cases ; valeurs invalides : refusées, rien d'écrit
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.guillaume}`, { allowed: { notes: false } })).status, 400);
  assert.equal((await setAllowed(h, 'zoe', { notes: 'non' })).status, 400);
  assert.equal((await setAllowed(h, 'zoe', { lists: false })).status, 400);
  assert.equal((await setAllowed(h, 'zoe', {})).status, 400);
  assert.equal((await h.guillaume.request('PATCH', '/api/admin/users/99999', { allowed: { notes: false } })).status, 404);
  const journal = h.app.logs.join('\n');
  assert.match(journal, /admin_access_changed admin="g\.admin" user="max\.login" ip="[^"]+" lists=0 notes=0 projects=1 create=0 mcp=0 previous="lists=0 notes=0 projects=0 create=0 mcp=0" turned_on="projects"/);
  assert.match(journal, /admin_access_changed admin="g\.admin" user="zoe\.login" ip="[^"]+" lists=1 notes=0 projects=0 create=1 mcp=1 previous="lists=1 notes=1 projects=1 create=1 mcp=1"/);
  assert.doesNotMatch(journal, /admin_access_changed[^\n]*Zoé|admin_access_changed[^\n]*Max"/, 'jamais le nom affiché, seulement les identifiants');
  // Une fonction non autorisée ne s'allume ni ne s'éteint par la personne
  assert.equal((await setAllowed(h, 'zoe', { projects: false })).status, 200);
  for (const value of [true, false]) {
    const refused = await one(h.zoe, { type: 'account.features', projects: value });
    assert.deepEqual([refused.status, refused.error], [403, fr['ops.fonctionNonAutorisee']]);
  }
});

// --- Projets : les quatre cas, création, notifications, rappels ---

test('projets : autorisés × allumés (synchronisation, opérations, routes) ; non autorisés = refus nommé, rien d\'effacé', async (t) => {
  const h = await family(t);
  await ok(h.guillaume, { type: 'account.features', projects: true });
  await addGuest(h, 'max', 'Max', { projects: true });
  const project = uuid();
  const cols = columns();
  await ops(h.guillaume, [{ type: 'project.create', projectId: project, name: 'DomoPi', columns: cols }]);
  assert.equal((await h.guillaume.request('PUT', `/api/projects/${project}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'contribution' } })).status, 200);
  const card = { type: 'card.create', projectId: project, columnId: cols[0].columnId, title: 'Carte' };
  const see = async () => (await h.max.get('/api/sync')).body.projectIds.includes(project);
  // Autorisés et allumés
  assert.equal(await see(), true);
  await ok(h.max, { ...card, cardId: uuid() });
  // Autorisés, éteints par lui : comme aujourd'hui (coupés)
  await ok(h.max, { type: 'account.features', projects: false });
  assert.equal(await see(), false);
  const off = await one(h.max, { ...card, cardId: uuid() });
  assert.deepEqual([off.status, off.error], [403, fr['ops.projetsCoupes']]);
  // Non autorisés (quel que soit l'interrupteur) : refus nommé
  await ok(h.max, { type: 'account.features', projects: true });
  assert.equal((await setAllowed(h, 'max', { projects: false })).status, 200);
  assert.equal(await see(), false);
  const refused = await one(h.max, { ...card, cardId: uuid() });
  assert.deepEqual([refused.status, refused.error], [403, fr['ops.projetsNonAutorises']]);
  assert.equal((await h.max.post(`/api/projects/${project}/leave`)).status, 403);
  assert.equal((await h.max.get(`/api/projects/${project}/cards/${uuid()}/history`)).status, 403);
  assert.deepEqual((await h.max.get('/api/sync')).body.features, { deadlines: true, lists: false, notes: false, projects: false });
  // Rien n'est effacé : membre, cartes ; recochés, tout revient (allumés aussitôt)
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM project_members WHERE user_id = ?').pluck().get(h.ids.max), 1);
  assert.equal((await setAllowed(h, 'max', { projects: true })).status, 200);
  assert.equal(await see(), true);
  assert.equal((await h.max.get('/api/sync')).body.cards.length, 1);
  // Famille : Zoé sans projets ne peut pas être ajoutée (nommée) ; son annuaire le dit
  assert.equal((await setAllowed(h, 'zoe', { projects: false })).status, 200);
  const add = await h.guillaume.request('PUT', `/api/projects/${project}/members`, { userIds: [h.ids.max, h.ids.zoe] });
  assert.deepEqual([add.status, add.body.error], [400, fr['ops.personneSansProjets'].replace('{name}', 'Zoé')]);
  const lea = (await h.lea.get('/api/users')).body.users;
  assert.deepEqual(lea.find((u) => u.id === h.ids.zoe).uses, { lists: true, notes: true, projects: false });
});

test('« Peut créer ses propres projets » : sans elle, ni créer, ni dupliquer (application et assistant IA) ; les projets partagés restent', async (t) => {
  const h = await family(t, { mcp: true });
  await ok(h.guillaume, { type: 'account.features', projects: true });
  await addGuest(h, 'max', 'Max', { projects: true, mcp: true });
  const project = uuid();
  const cols = columns();
  await ops(h.guillaume, [{ type: 'project.create', projectId: project, name: 'DomoPi', columns: cols }]);
  await h.guillaume.request('PUT', `/api/projects/${project}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'contribution' } });
  const create = await one(h.max, { type: 'project.create', projectId: uuid(), name: 'À moi', columns: columns() });
  assert.deepEqual([create.status, create.error], [403, fr['ops.creationProjetInterdite']]);
  const duplicate = await one(h.max, { type: 'project.duplicate', projectId: project, newProjectId: uuid() });
  assert.deepEqual([duplicate.status, duplicate.error], [403, fr['ops.creationProjetInterdite']]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM projects WHERE owner_id = ?').pluck().get(h.ids.max), 0);
  // Ce que son rôle permet dans le projet partagé : toujours permis
  await ok(h.max, { type: 'card.create', projectId: project, cardId: uuid(), columnId: cols[0].columnId, title: 'Article' });
  // Assistant IA : create_project refusé
  const tokens = await connect(h, h.max, pass('max'), { scope: 'write', lists: 'all' });
  const ai = claude(h, tokens.access_token);
  const refused = await ai.tool('create_project', { name: 'Par l\'assistant' });
  assert.equal(refused.body.result.isError, true);
  assert.match(refused.body.result.content[0].text, new RegExp(PROJECT_CREATION_NOT_ALLOWED.slice(0, 30)));
  assert.equal(data(await ai.tool('list_projects')).projects.length, 1);
  // Cochée : il crée et duplique
  assert.equal((await setAllowed(h, 'max', { projectsCreate: true })).status, 200);
  await ok(h.max, { type: 'project.create', projectId: uuid(), name: 'À moi', columns: columns() });
  await ok(h.max, { type: 'project.duplicate', projectId: project, newProjectId: uuid() });
  assert.equal(data(await ai.tool('create_project', { name: 'Par l\'assistant' })).name, 'Par l\'assistant');
  // Écrans : pas de « + », de « Nouveau projet » ni de « Dupliquer le projet » sans elle
  assert.ok(!projectMenuEntries({ id: 'p', role: 'contributor', members: [] }, { canCreate: false }).includes('duplicate'));
  assert.match(code('public/js/screens/projects.js'), /if \(plus\) plus\.hidden = !canCreateProjects\(\);/);
  assert.match(code('public/js/screens/pc-side.js'), /newProject\.hidden = !onProjects \|\| canAdd \|\| !canCreateProjects\(\);/);
  assert.match(code('public/js/screens/home.js'), /canCreateProjects\(\) \? rowsOf\(\[addRow\(t\('accueil\.projets\.nouveau'\)/);
  assert.match(code('public/js/app.js'), /export const canCreateProjects = \(\) => mayCreateProjects\(allowedNow\(\), app\.data\.features\);/);
});

test('projets non autorisés : ni notification ni ligne de la page (même pas « Partage ») ; éteints : « Partage » seulement ; rappels de même', async (t) => {
  const h = await family(t);
  await ok(h.guillaume, { type: 'account.features', projects: true });
  await addGuest(h, 'max', 'Max', { projects: true });
  const project = uuid();
  const cols = columns();
  await ops(h.guillaume, [{ type: 'project.create', projectId: project, name: 'DomoPi', columns: cols }]);
  await h.guillaume.request('PUT', `/api/projects/${project}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'contribution' } });
  const page = async () => (await h.max.get('/api/inbox')).body.rows;
  assert.deepEqual((await page()).map((r) => [r.kind, r.targetType]), [['sharing', 'project']]);
  // Éteints par lui : « Partage » reste (l'invitation à les allumer)
  await ok(h.max, { type: 'account.features', projects: false });
  assert.deepEqual((await page()).map((r) => r.target), [{ type: 'features' }]);
  // Non autorisés : plus rien (il ne peut pas les allumer)
  await ok(h.max, { type: 'account.features', projects: true });
  await setAllowed(h, 'max', { projects: false });
  assert.deepEqual(await page(), []);
  // Rappels de cartes : jamais pour un compte sans projets utilisés
  const cardId = uuid();
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await ok(h.guillaume, { type: 'card.create', projectId: project, cardId, columnId: cols[0].columnId, title: 'Rappel' });
  h.app.db.prepare("UPDATE cards SET due_date = ?, due_time = '23:59', remind_before = 15 WHERE id = ?").run(day, cardId);
  h.app.db.prepare('INSERT OR IGNORE INTO card_assignees (card_id, user_id, position) VALUES (?, ?, 0)').run(cardId, h.ids.max);
  const late = Date.parse(`${day}T23:58:00`);
  assert.ok(!h.app.ctx.projects.takeCardReminders(late).some((r) => r.userId === h.ids.max));
  await setAllowed(h, 'max', { projects: true });
  h.app.db.prepare('DELETE FROM card_reminders').run();
  assert.ok(h.app.ctx.projects.takeCardReminders(late).some((r) => r.userId === h.ids.max), 'autorisés de nouveau : le rappel vient');
});

// --- Notes ---

test('notes : non autorisées = rien d\'envoyé (ni notes, ni étiquettes), tout refusé ; autorisées mais éteintes : comme avant ; partage refusé (nommé)', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { notes: true });
  const note = uuid();
  await ops(h.guillaume, [{ type: 'note.create', noteId: note, title: 'Codes', body: 'Texte' }]);
  assert.equal((await h.guillaume.request('PUT', `/api/notes/${note}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'modification' } })).status, 200);
  await h.guillaume.post('/api/labels', { name: 'Anniversaire Zoé' });
  const sync = async () => (await h.max.get('/api/sync')).body;
  assert.deepEqual((await sync()).noteIds, [note]);
  assert.equal((await sync()).labels.length, 1);
  // Éteintes par lui : comme une fonction coupée aujourd'hui (cachées sur
  // ses écrans, sans nouveautés ni notifications ; le serveur l'accepte)
  await ok(h.max, { type: 'account.features', notes: false });
  assert.deepEqual((await sync()).noteIds, [note]);
  await ok(h.max, { type: 'note.update', noteId: note, body: 'Texte 2', baseVersion: 1 });
  // Non autorisées : rien des notes, tout refusé (403 nommé)
  assert.equal((await setAllowed(h, 'max', { notes: false })).status, 200);
  const none = await sync();
  assert.deepEqual([none.notes, none.noteIds, none.labels, none.pinnedNotes], [[], [], [], []]);
  const create = await one(h.max, { type: 'note.create', noteId: uuid(), title: 'À moi', body: '' });
  assert.deepEqual([create.status, create.error], [403, fr['ops.notesNonAutorisees']]);
  const pin = await one(h.max, { type: 'note.pin', noteId: note, pinned: true });
  assert.equal(pin.status, 403);
  assert.equal((await h.max.post(`/api/notes/${note}/leave`)).status, 403);
  assert.equal((await h.max.post('/api/labels', { name: 'Autre' })).status, 403);
  // Pas d'ajout à une note pour un compte sans notes (nommé pour l'Admin, qui le voit)
  const other = uuid();
  await ops(h.guillaume, [{ type: 'note.create', noteId: other, title: 'Autre', body: '' }]);
  const add = await h.guillaume.request('PUT', `/api/notes/${other}/members`, { userIds: [h.ids.max] });
  assert.deepEqual([add.status, add.body.error], [400, fr['ops.personneSansNotes'].replace('{name}', 'Max')]);
  // Ni notification : « Partage » d'une note déjà partagée (droit changé)
  await h.guillaume.request('PUT', `/api/notes/${note}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'lecture' } });
  assert.deepEqual((await h.max.get('/api/inbox')).body.rows.filter((r) => r.targetType === 'note'), []);
  // Rien d'effacé : autorisées de nouveau (allumées aussitôt), la note revient
  assert.equal((await setAllowed(h, 'max', { notes: true })).status, 200);
  assert.deepEqual((await sync()).noteIds, [note]);
  assert.deepEqual((await sync()).features.notes, true);
});

// --- Assistants IA ---

test('« Assistants IA » : sans elle, l\'autorisation est refusée et les connexions existantes sont révoquées et refusées à chaque appel ; outils des fonctions non autorisées refusés', async (t) => {
  const h = await family(t, { mcp: true });
  await addGuest(h, 'max', 'Max', { mcp: true, projects: true });
  const tokens = await connect(h, h.max, pass('max'), { scope: 'read', lists: 'all' });
  const ai = claude(h, tokens.access_token);
  assert.equal((await ai.tool('list_lists')).status, 200);
  // Notes non autorisées : refus qui dit que c'est l'Admin
  const notes = await ai.tool('list_notes');
  assert.equal(notes.body.result.content[0].text, MCP_NOTES_NOT_ALLOWED);
  assert.ok(data(await ai.tool('list_projects')));
  await ok(h.max, { type: 'account.features', projects: false });
  assert.equal((await ai.tool('list_projects')).body.result.content[0].text, MCP_PROJECTS_OFF);
  await setAllowed(h, 'max', { projects: false });
  assert.equal((await ai.tool('list_projects')).body.result.content[0].text, MCP_PROJECTS_NOT_ALLOWED);
  // Décochée : connexions révoquées tout de suite, journal
  assert.equal((await setAllowed(h, 'max', { mcp: false })).status, 200);
  assert.equal((await ai.tool('list_lists')).status, 401);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM oauth_grants WHERE user_id = ? AND revoked_at IS NULL').pluck().get(h.ids.max), 0);
  assert.match(h.app.logs.join('\n'), /admin_access_changed [^\n]*mcp=0 [^\n]*revoked=1/);
  // L'écran d'autorisation le dit, l'accord est refusé
  const params = new URLSearchParams({ response_type: 'code', client_id: tokens.clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' });
  const start = await fetch(`${h.app.base}/oauth/authorize?${params}`, { redirect: 'manual' });
  const requestId = start.headers.get('location').split('/').pop();
  const screen = await h.max.get(`/api/oauth/demandes/${requestId}`);
  assert.deepEqual([screen.status, screen.body.error], [403, fr['autorisation.compteNonAutorise']]);
  const accord = await h.max.post(`/api/oauth/demandes/${requestId}/accord`, { password: pass('max'), scope: 'read', lists: 'all' });
  assert.equal(accord.status, 403);
  // Mon compte : plus d'« Assistants IA » (claudeUrl absent)
  assert.equal((await h.max.get('/api/me')).body.user.claudeUrl, null);
  assert.ok((await h.lea.get('/api/me')).body.user.claudeUrl);
  // Une connexion d'un compte à qui la case est retirée sans révocation
  // (écrite directement en base) est refusée à chaque appel de /mcp
  const lea = await connect(h, h.lea, pass('lea'), { scope: 'read', lists: 'all' });
  h.app.db.prepare('UPDATE users SET mcp_allowed = 0 WHERE id = ?').run(h.ids.lea);
  assert.equal((await claude(h, lea.access_token).tool('list_lists')).status, 401);
  h.app.db.prepare('UPDATE users SET mcp_allowed = 1 WHERE id = ?').run(h.ids.lea);
  assert.equal((await claude(h, lea.access_token).tool('list_lists')).status, 200, 'recochée : la connexion non révoquée revient');
  assert.match(code('public/js/screens/account.js'), /user\.claudeUrl && allowedNow\(\)\.mcp \? \[/);
});

// --- Temps réel ---

test('temps réel : les cases d\'un invité ne préviennent que lui ; celles d\'un Utilisateur, tout le monde (annuaires « N\'utilise pas… »)', () => {
  const route = code('server/routes/admin-users.js');
  assert.match(route, /if \(after === 'guest'\) ctx\.events\?\.notifyAccount\(\[user\.id\]\);\s*else ctx\.events\?\.notifyReferences\(\);/);
  const events = code('server/events.js');
  assert.match(events, /function notifyAccount\(userIds\) \{\s*const message = 'event: refs\\ndata: \{\}\\n\\n';/);
});

// --- Écrans ---

test('écrans : Réglages › Fonctions ne propose que l\'autorisé ; page d\'un compte avec ses cases ; « Nouveau compte » avec les cases du rôle ; aucun HTML', () => {
  const features = code('public/js/screens/features.js');
  assert.match(features, /const offered = offeredFeatures\(allowed, role\);/);
  assert.match(features, /: h\('div', \{ class: 'group group--pad' \}, h\('p', \{ class: 'muted' \}, t\('reglages\.fonctions\.aucune'\)\)\),/);
  const admin = code('public/js/screens/admin.js');
  for (const file of [features, admin, code('public/js/screens/home.js'), code('public/js/screens/share-picker.js')]) {
    assert.doesNotMatch(file, /innerHTML|insertAdjacentHTML|outerHTML|setAttribute\('style'|\.style\./);
  }
  // Interrupteurs : rôle switch, reliés à leur titre et leur phrase ; « Peut
  // créer » désactivé sans Projets ; la ligne « Listes » d'un invité seulement (étape 3 : access.js, permissionsFor)
  assert.match(admin, /class: 'switch', type: 'button', role: 'switch', disabled: self,\s*'aria-labelledby': `\$\{id\}-titre`, 'aria-describedby': `\$\{id\}-aide`/);
  assert.match(admin, /if \(name === 'projectsCreate'\) button\.disabled = self \|\| !values\.projects;/);
  assert.match(admin, /permissionsFor\(role\)\.map\(rowOf\)/);
  assert.match(admin, /user\.role === 'admin'\s*\? h\('p', \{ class: 'page-intro' \}, t\('administration\.fonctions\.admin'\)\)/);
  // « Nouveau compte » et demande acceptée : les cases suivent le rôle
  assert.equal((admin.match(/access\.setRole\(value\)/g) ?? []).length, 2);
  assert.match(admin, /role, allowed: access\.value\(\) \}\);/);
  // Lignes de la liste : « Invité · Projets », « Utilisateur · sans projets »
  assert.match(admin, /const access = user\.active \? accessPart\(user\) : null;/);
  // Kit : sections 16.49 (interrupteur décalé) et 16.51 (invitation), identiques dans les deux copies
  for (const file of ['design/listo.css', 'public/css/listo.css']) {
    const css = read(file);
    assert.match(css, /\.toggle-row\.toggle-row--sub \{ padding-left: calc\(var\(--space-2\) \+ 20px\); \}/, file);
    assert.match(css, /\.home-hint \{ grid-column: 1 \/ -1;/, file);
  }
  const part = (file) => read(file).slice(read(file).indexOf('/* 16.48'), read(file).indexOf('/* 16.51')) + read(file).slice(read(file).indexOf('.home-hint {'), read(file).indexOf('.home-hint__text'));
  assert.equal(part('design/listo.css'), part('public/css/listo.css'));
  // Un seul calcul : features.js (usedFeatures) et server/features.js
  for (const file of ['server/notify.js', 'server/inbox.js', 'server/projects.js', 'server/notes.js']) {
    assert.doesNotMatch(code(file), /notes_enabled|projects_enabled\s*=|SELECT projects_enabled/, file);
  }
});
