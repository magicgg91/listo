// Projets, le socle (étape 1 du cadrage docs/cadrage-projets.md, migration
// 43) : migration ; fonction coupée (rien d'envoyé, opérations et routes
// refusées) ; matrice des droits ligne par ligne (section 6) pour chaque
// opération et chaque route, avec les quatre rôles, le Contributeur sur sa
// carte, sur la carte d'un autre qui lui est attribuée et sur celle d'un
// autre qui ne l'est pas, le non-membre et l'Admin non membre ; changement
// de rôle ; objets d'un autre projet ; duplication ; ordre ; suppression
// d'une colonne avec ses cartes ; corbeilles et ménage ; limites ;
// étiquettes jamais hors du projet ; synchronisation selon le rôle ;
// renvoi d'une opération ; temps réel ; historique ; journal.
//
// Foyer : Léa (propriétaire des projets), Zoé (« Peut modifier »), Hugo
// (Contributeur), Marc (« Lecture seule »), Paul (n'a rien), Guillaume
// (Admin, n'a rien non plus).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, tempDir, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { projectAccess } from '../server/projects.js';

const uuid = () => crypto.randomUUID();
const DAY = 24 * 60 * 60 * 1000;
const PEOPLE = [['lea', 'Léa'], ['zoe', 'Zoé'], ['hugo', 'Hugo'], ['marc', 'Marc'], ['paul', 'Paul']];

async function household(t, { projectsOn = true } = {}) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const people = { guillaume: { client: guillaume, id: 1 } };
  for (const [key, name] of PEOPLE) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  if (projectsOn) app.db.prepare('UPDATE users SET projects_enabled = 1').run();
  const ops = async (who, list) => {
    const res = await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
    assert.equal(res.status, 200, res.text);
    return res.body.results;
  };
  const one = async (who, op) => (await ops(who, [op]))[0];
  const sync = async (who, since) => (await people[who].client.get(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync')).body;
  const share = (projectId, access, who = 'lea') => people[who].client.request('PUT', `/api/projects/${projectId}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  const columnsOf = (projectId) => app.db.prepare('SELECT * FROM project_columns WHERE project_id = ? ORDER BY position').all(projectId);
  const cardRow = (cardId) => app.db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  // Nouveau projet de Léa, partagé avec Zoé (modifier), Hugo (contribuer)
  // et Marc (lire), avec une étiquette
  async function project({ owner = 'lea', name = 'DomoPi Articles', shared = true } = {}) {
    const projectId = uuid();
    const created = await one(owner, { type: 'project.create', projectId, name });
    assert.equal(created.status, 200, JSON.stringify(created));
    if (shared) assert.equal((await share(projectId, { zoe: 'modification', hugo: 'contribution', marc: 'lecture' }, owner)).status, 200);
    const labelId = uuid();
    assert.equal((await one(owner, { type: 'label.create', projectId, labelId, name: 'Sécurité', color: 'rouge' })).status, 200);
    const columns = columnsOf(projectId);
    return { projectId, labelId, columns, col: columns[0].id, col2: columns[1].id };
  }
  // Nouvelle carte (par who), dans la première colonne ; assignees : comptes attribués (par Léa)
  async function card(p, who = 'lea', { title = 'Article 2FAuth', assignees = [], columnId = p.col } = {}) {
    const cardId = uuid();
    const res = await one(who, { type: 'card.create', projectId: p.projectId, cardId, columnId, title });
    assert.equal(res.status, 200, JSON.stringify(res));
    if (assignees.length) assert.equal((await one('lea', { type: 'card.assign', cardId, userIds: assignees.map((k) => people[k].id) })).status, 200);
    return cardId;
  }
  return { app, people, ops, one, sync, share, project, card, columnsOf, cardRow };
}

const statusOf = (res) => [res.status, res.code ?? null];

// --- Migration 43 ---

test('migration 43 : tables des projets, projects_enabled coupé au départ, home_start accepte « projects » ; base existante mise à jour, cascades', (t) => {
  assert.equal(MIGRATIONS.length, 46);
  const fresh = openDatabase(':memory:');
  assert.equal(schemaVersion(fresh), MIGRATIONS.length);
  for (const table of ['projects', 'project_members', 'project_columns', 'project_labels', 'cards', 'card_labels', 'card_assignees', 'card_events', 'project_user_state']) {
    assert.ok(fresh.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table);
    assert.equal(fresh.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, `${table} vide : une installation n'a aucun projet`);
  }
  // Base en version 42, avec un compte qui a choisi « Notes » comme premier écran
  const file = path.join(tempDir(t), 'old.db');
  const old = databaseAt(file, 42);
  old.prepare("INSERT INTO users (username, display_name, password_hash, home_enabled, home_start, notes_enabled) VALUES ('anne', 'Anne', 'x', 0, 'notes', 0), ('bob', 'Bob', 'x', 1, 'deadlines', 1)").run();
  old.close();
  const db = openDatabase(file);
  assert.equal(schemaVersion(db), 46);
  assert.deepEqual(db.prepare('SELECT username, home_enabled, home_start, notes_enabled, projects_enabled FROM users ORDER BY id').all(), [
    { username: 'anne', home_enabled: 0, home_start: 'notes', notes_enabled: 0, projects_enabled: 0 },
    { username: 'bob', home_enabled: 1, home_start: 'deadlines', notes_enabled: 1, projects_enabled: 0 },
  ]);
  db.prepare("UPDATE users SET home_start = 'projects' WHERE username = 'anne'").run();
  assert.throws(() => db.prepare("UPDATE users SET home_start = 'admin'").run(), /CHECK/);
  assert.throws(() => db.prepare('UPDATE users SET projects_enabled = 2').run(), /CHECK/);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  // Contraintes : droits, couleurs, types d'historique ; une carte présente a une colonne
  db.prepare("INSERT INTO projects (id, owner_id, name, created_at, updated_at, changed_at) VALUES ('p', 1, 'P', 'x', 'x', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO project_members (project_id, user_id, access, added_at) VALUES ('p', 2, 'owner', 'x')").run(), /CHECK/);
  db.prepare("INSERT INTO project_members (project_id, user_id, access, added_at) VALUES ('p', 2, 'contribution', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO project_columns VALUES ('c0', 'p', 'C', 'c', 'turquoise', 1, 'x', 'x')").run(), /CHECK/);
  db.prepare("INSERT INTO project_columns VALUES ('c', 'p', 'C', 'c', 'gris', 1, 'x', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO project_columns VALUES ('c2', 'p', 'c', 'c', 'gris', 2, 'x', 'x')").run(), /UNIQUE/);
  db.prepare("INSERT INTO cards (id, project_id, column_id, position, title, created_by, created_at, updated_at) VALUES ('k', 'p', 'c', 1, 'T', 2, 'x', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO card_events (project_id, card_id, type, created_at) VALUES ('p', 'k', 'hack', 'x')").run(), /CHECK/);
  db.prepare("INSERT INTO card_events (project_id, card_id, type, created_at) VALUES ('p', 'k', 'create', 'x')").run();
  assert.throws(() => db.prepare("DELETE FROM project_columns WHERE id = 'c'").run(), /CHECK/, 'une colonne ne part jamais avec une carte présente');
  // Effacer le projet : tout part avec lui
  db.prepare("DELETE FROM projects WHERE id = 'p'").run();
  for (const table of ['project_members', 'project_columns', 'cards', 'card_events']) assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, table);
});

// --- Fonction coupée ---

test('projets coupés (au départ) : rien d\'envoyé, opérations et routes refusées (403), rien d\'effacé ; rallumés, tout revient', async (t) => {
  const h = await household(t, { projectsOn: false });
  assert.deepEqual((await h.people.lea.client.get('/api/me')).body.user.features, { notes: true, projects: false });
  let data = await h.sync('lea');
  assert.deepEqual([data.features, data.projects, data.projectIds, data.cards, data.projectMine], [{ notes: true, projects: false }, [], [], [], {}]);
  const projectId = uuid();
  const refused = await h.one('lea', { type: 'project.create', projectId, name: 'Secret' });
  assert.deepEqual(statusOf(refused), [403, 'ops.projetsCoupes']);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM projects').pluck().get(), 0);
  // Léa rallume, crée et partage avec Zoé (projets coupés chez elle)
  assert.equal((await h.one('lea', { type: 'account.features', projects: true })).status, 200);
  assert.equal((await h.one('lea', { type: 'project.create', projectId, name: 'Travaux' })).status, 200);
  assert.equal((await h.share(projectId, { zoe: 'modification' })).status, 200, 'on peut partager avec quelqu\'un qui a coupé les projets');
  const zoe = await h.sync('zoe');
  assert.deepEqual([zoe.projects, zoe.projectIds, zoe.cards], [[], [], []], 'Zoé (projets coupés) ne reçoit rien');
  const col = h.columnsOf(projectId)[0].id;
  for (const op of [
    { type: 'card.create', projectId, cardId: uuid(), columnId: col, title: 'x' },
    { type: 'project.state', projectId, mutedNews: true },
    { type: 'column.update', projectId, columnId: col, name: 'Y' },
  ]) assert.deepEqual(statusOf(await h.one('zoe', op)), [403, 'ops.projetsCoupes'], op.type);
  for (const [method, url, body] of [
    ['POST', `/api/projects/${projectId}/leave`, {}],
    ['PUT', `/api/projects/${projectId}/members`, { userIds: [] }],
    ['POST', '/api/projects/deleted/purge', { ids: [projectId] }],
  ]) assert.equal((await h.people.zoe.client.request(method, url, body)).status, 403, url);
  // Léa coupe : plus rien n'est envoyé, rien n'est effacé
  assert.equal((await h.one('lea', { type: 'account.features', projects: false })).status, 200);
  data = await h.sync('lea');
  assert.deepEqual([data.projects, data.projectIds], [[], []]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM projects').pluck().get(), 1);
  // Zoé rallume : le projet partagé arrive, avec son rôle
  assert.equal((await h.one('zoe', { type: 'account.features', projects: true })).status, 200);
  const back = await h.sync('zoe');
  assert.deepEqual(back.projectIds, [projectId]);
  assert.equal(back.projects[0].role, 'editor');
});

// --- Matrice des droits : opérations du projet ---

// Acteur de chaque rôle (le Contributeur est Hugo)
const ACTORS = { owner: 'lea', editor: 'zoe', contributor: 'hugo', reader: 'marc', nonMember: 'paul', admin: 'guillaume' };
const ORDER = ['admin', 'nonMember', 'reader', 'contributor', 'editor', 'owner'];

test('droits sur le projet, ligne par ligne : propriétaire, Peut modifier, Contributeur, Lecture seule, non-membre, Admin non membre', async (t) => {
  const h = await household(t);
  const NF = [404, 'ops.projetIntrouvable'];
  const RO = [403, 'ops.projetLectureSeule'];
  const OWN = [403, 'ops.projetProprietaireSeulement'];
  const MGR = [403, 'ops.projetModifierSeulement'];
  const OK = [200, null];
  // Chaque ligne : l'opération (construite pour chaque rôle, sur le même
  // projet), et la réponse attendue pour chaque rôle
  const rows = [
    ['renommer', (p) => ({ type: 'project.update', projectId: p.projectId, name: `Nom ${uuid().slice(0, 4)}` }), { owner: OK, editor: OWN, contributor: OWN, reader: RO }],
    ['option Priorité', (p, role) => ({ type: 'project.update', projectId: p.projectId, priorityEnabled: role === 'owner' }), { owner: OK, editor: OWN, contributor: OWN, reader: RO }],
    ['dupliquer', (p) => ({ type: 'project.duplicate', projectId: p.projectId, newProjectId: uuid() }), { owner: OK, editor: OK, contributor: OK, reader: OK }],
    ['ajouter une colonne', (p) => ({ type: 'column.create', projectId: p.projectId, columnId: uuid(), name: `Colonne ${uuid().slice(0, 6)}` }), { owner: OK, editor: OK, contributor: MGR, reader: RO }],
    ['renommer une colonne', (p) => ({ type: 'column.update', projectId: p.projectId, columnId: p.col, name: `Idées ${uuid().slice(0, 6)}`, color: 'violet' }), { owner: OK, editor: OK, contributor: MGR, reader: RO }],
    ['déplacer une colonne', (p, role) => ({ type: 'column.move', projectId: p.projectId, columnId: p.columns[2].id, afterId: role === 'owner' ? null : p.col }), { owner: OK, editor: OK, contributor: MGR, reader: RO }],
    ['supprimer une colonne vide', async (p) => {
      const columnId = uuid();
      await h.one('lea', { type: 'column.create', projectId: p.projectId, columnId, name: `Vide ${uuid().slice(0, 6)}` });
      return { type: 'column.delete', projectId: p.projectId, columnId };
    }, { owner: OK, editor: OK, contributor: MGR, reader: RO }],
    ['créer une étiquette', (p) => ({ type: 'label.create', projectId: p.projectId, labelId: uuid(), name: `Étiquette ${uuid().slice(0, 6)}` }), { owner: OK, editor: OK, contributor: MGR, reader: RO }],
    ['renommer une étiquette', (p) => ({ type: 'label.update', projectId: p.projectId, labelId: p.labelId, name: `Sécu ${uuid().slice(0, 6)}`, color: 'vert' }), { owner: OK, editor: OK, contributor: MGR, reader: RO }],
    ['supprimer une étiquette', async (p) => {
      const labelId = uuid();
      await h.one('lea', { type: 'label.create', projectId: p.projectId, labelId, name: `Jetable ${uuid().slice(0, 6)}` });
      return { type: 'label.delete', projectId: p.projectId, labelId };
    }, { owner: OK, editor: OK, contributor: MGR, reader: RO }],
    ['créer une carte', (p) => ({ type: 'card.create', projectId: p.projectId, cardId: uuid(), columnId: p.col, title: 'Nouvelle' }), { owner: OK, editor: OK, contributor: OK, reader: RO }],
    ['réglages à soi', (p) => ({ type: 'project.state', projectId: p.projectId, mutedNews: true, inDeadlines: true }), { owner: OK, editor: OK, contributor: OK, reader: OK }],
    ['nouveautés vues', (p) => ({ type: 'project.seen', projectId: p.projectId, upTo: 999 }), { owner: OK, editor: OK, contributor: OK, reader: OK }],
    // Supprimer (corbeille) : en dernier sur le projet de la ligne
    ['mettre à la corbeille', (p) => ({ type: 'project.delete', projectId: p.projectId }), { owner: OK, editor: OWN, contributor: OWN, reader: RO }],
  ];
  for (const [name, build, expected] of rows) {
    const p = await h.project();
    for (const role of ORDER) {
      const res = await h.one(ACTORS[role], await build(p, role));
      assert.deepEqual(statusOf(res), expected[role] ?? NF, `${name} : ${role}`);
    }
  }
  // Restaurer : un projet dans la corbeille n'est visible que de son propriétaire
  const p = await h.project();
  assert.equal((await h.one('lea', { type: 'project.delete', projectId: p.projectId })).status, 200);
  for (const role of ORDER) {
    const res = await h.one(ACTORS[role], { type: 'project.restore', projectId: p.projectId });
    assert.deepEqual(statusOf(res), role === 'owner' ? OK : NF, `restaurer : ${role}`);
  }
  // Un projet inconnu : la même réponse qu'un projet qu'on ne voit pas
  assert.deepEqual(statusOf(await h.one('lea', { type: 'project.update', projectId: uuid(), name: 'X' })), NF);
});

test('droits sur le projet, les routes : partager, quitter, supprimer définitivement, vider', async (t) => {
  const h = await household(t);
  const route = (who, method, url, body) => h.people[ACTORS[who]].client.request(method, url, body);
  // Partager : propriétaire seulement (Zoé : 403 nommé ; les autres membres :
  // 403 ; non-membre et Admin : 404)
  let p = await h.project();
  for (const role of ORDER) {
    const res = await route(role, 'PUT', `/api/projects/${p.projectId}/members`, { userIds: [h.people.zoe.id, h.people.hugo.id, h.people.marc.id], access: { [h.people.zoe.id]: 'modification', [h.people.hugo.id]: 'contribution', [h.people.marc.id]: 'lecture' } });
    assert.equal(res.status, { owner: 200, editor: 403, contributor: 403, reader: 403 }[role] ?? 404, `partager : ${role}`);
    if (res.status === 404) assert.equal(res.body.error, 'Projet introuvable.');
  }
  // Quitter : tout membre sauf le propriétaire
  for (const role of ORDER) {
    p = await h.project();
    const res = await route(role, 'POST', `/api/projects/${p.projectId}/leave`, {});
    assert.equal(res.status, { owner: 403, editor: 200, contributor: 200, reader: 200 }[role] ?? 404, `quitter : ${role}`);
  }
  // Supprimer définitivement des cartes supprimées : propriétaire seulement
  p = await h.project();
  const cardId = await h.card(p);
  await h.one('lea', { type: 'card.delete', cardId });
  for (const role of ORDER) {
    const res = await route(role, 'POST', `/api/projects/${p.projectId}/cards/purge`, { cardIds: [cardId] });
    assert.equal(res.status, { owner: 200, editor: 403, contributor: 403, reader: 403 }[role] ?? 404, `effacer des cartes : ${role}`);
  }
  assert.equal(h.cardRow(cardId), undefined);
  // Supprimer définitivement un projet de la corbeille, vider la corbeille :
  // propriétaire seulement (les autres ne le voient pas : 404, ou rien d'effacé)
  p = await h.project();
  await h.one('lea', { type: 'project.delete', projectId: p.projectId });
  for (const role of ORDER.filter((r) => r !== 'owner')) {
    assert.equal((await route(role, 'POST', `/api/projects/${p.projectId}/purge`, {})).status, 404, `effacer le projet : ${role}`);
    assert.equal((await route(role, 'POST', '/api/projects/deleted/purge', { ids: [p.projectId] })).body.purged, 0, `vider : ${role}`);
  }
  assert.deepEqual((await route('owner', 'POST', `/api/projects/${p.projectId}/purge`, {})).body, { purged: 1 });
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM projects WHERE id = ?').pluck().get(p.projectId), 0);
  // Un projet pas dans la corbeille ne s'efface pas
  const live = await h.project();
  assert.equal((await route('owner', 'POST', `/api/projects/${live.projectId}/purge`, {})).status, 404);
  assert.equal((await route('owner', 'POST', '/api/projects/deleted/purge', { ids: [live.projectId] })).body.purged, 0);
  assert.equal((await route('owner', 'POST', '/api/projects/deleted/purge', { ids: 'x' })).status, 400);
});

// --- Matrice des droits : les cartes ---

test('droits sur une carte, ligne par ligne : Contributeur sur sa carte, attribuée, d\'un autre ; Lecture seule ; non-membre ; Admin', async (t) => {
  const h = await household(t);
  const OK = [200, null];
  const RO = [403, 'ops.projetLectureSeule'];
  const EDIT = [403, 'ops.carteModifierSiennes'];
  const DEL = [403, 'ops.carteSupprimerSiennes'];
  const RESTORE = [403, 'ops.carteRestaurerSiennes'];
  const ASSIGN = [403, 'ops.carteAttribuerSiennes'];
  const NF = [404, 'ops.carteIntrouvable'];
  // Cas : qui agit, et sur quelle carte (créée par qui, attribuée à qui)
  const CASES = {
    owner: { who: 'lea', by: 'lea' },
    editor: { who: 'zoe', by: 'lea' },
    contribOwn: { who: 'hugo', by: 'hugo' },
    contribAssigned: { who: 'hugo', by: 'lea', assignees: ['hugo', 'zoe'] },
    contribOther: { who: 'hugo', by: 'lea', assignees: ['zoe'] },
    reader: { who: 'marc', by: 'lea' },
    nonMember: { who: 'paul', by: 'lea' },
    admin: { who: 'guillaume', by: 'lea' },
  };
  const rows = [
    ['renommer', (c) => ({ type: 'card.update', cardId: c, title: 'Renommée' }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: OK, contribOther: EDIT, reader: RO }],
    ['déplacer dans une autre colonne', (c, p) => ({ type: 'card.move', cardId: c, columnId: p.col2, afterId: null }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: OK, contribOther: EDIT, reader: RO }],
    ['ordonner (en haut)', (c) => ({ type: 'card.move', cardId: c, afterId: null }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: OK, contribOther: EDIT, reader: RO }],
    ['poser une étiquette', (c, p) => ({ type: 'card.labels', cardId: c, labelIds: [p.labelId] }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: OK, contribOther: EDIT, reader: RO }],
    ['attribuer quelqu\'un d\'autre', (c, p, people) => ({ type: 'card.assign', cardId: c, userIds: [people.zoe.id, people.hugo.id, people.lea.id].slice(0, 3) }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: ASSIGN, contribOther: EDIT, reader: RO }],
    ['s\'attribuer la carte', (c, p, people, who) => ({ type: 'card.assign', cardId: c, userIds: [people.zoe.id, people[who].id] }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: OK, contribOther: EDIT, reader: RO }],
    ['supprimer', (c) => ({ type: 'card.delete', cardId: c }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: DEL, contribOther: DEL, reader: RO }],
    ['dupliquer', (c) => ({ type: 'card.duplicate', cardId: c, newCardId: uuid() }), { owner: OK, editor: OK, contribOwn: OK, contribAssigned: OK, contribOther: OK, reader: RO }],
  ];
  const p = await h.project();
  for (const [name, build, expected] of rows) {
    for (const [key, spec] of Object.entries(CASES)) {
      const cardId = await h.card(p, spec.by, { assignees: spec.assignees ?? [] });
      const res = await h.one(spec.who, build(cardId, p, h.people, spec.who));
      assert.deepEqual(statusOf(res), expected[key] ?? NF, `${name} : ${key}`);
    }
  }
  // Se retirer d'une carte qu'il n'a pas créée : le Contributeur attribué peut,
  // puis il n'a plus que la lecture (et les commentaires, étape 3)
  const assignedCard = await h.card(p, 'lea', { assignees: ['hugo', 'zoe'] });
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.assign', cardId: assignedCard, userIds: [h.people.zoe.id] })), OK);
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.update', cardId: assignedCard, title: 'Encore' })), EDIT);
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.assign', cardId: assignedCard, userIds: [h.people.zoe.id, h.people.hugo.id] })), EDIT, 'ni se réattribuer');
  // Restaurer une carte supprimée : mêmes droits que supprimer
  for (const [key, spec] of Object.entries(CASES)) {
    const cardId = await h.card(p, spec.by, { assignees: spec.assignees ?? [] });
    assert.equal((await h.one('lea', { type: 'card.delete', cardId })).status, 200);
    const res = await h.one(spec.who, { type: 'card.restore', cardId });
    const expected = { owner: OK, editor: OK, contribOwn: OK, contribAssigned: RESTORE, contribOther: RESTORE, reader: RO }[key] ?? NF;
    assert.deepEqual(statusOf(res), expected, `restaurer : ${key}`);
  }
  // Personne en lecture seule : jamais attribuée ; un non-membre non plus
  const cardId = await h.card(p);
  for (const who of ['marc', 'paul', 'guillaume']) {
    assert.deepEqual(statusOf(await h.one('lea', { type: 'card.assign', cardId, userIds: [h.people[who].id] })), [400, 'ops.personneNonAttribuableProjet'], who);
  }
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.assign', cardId, userIds: Array.from({ length: 11 }, (_, i) => i + 1) })), [400, 'ops.personnesCarteInvalides']);
  // Rien n'a été écrit par les refus : la carte de Léa n'a jamais été renommée par Hugo
  assert.equal(h.cardRow(assignedCard).title, 'Article 2FAuth');
});

test('changement de rôle pris en compte à la demande suivante ; lecture seule ou départ : retiré de ses cartes (l\'historique le dit) ; réglages effacés', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const own = await h.card(p, 'hugo');
  const assigned = await h.card(p, 'lea', { assignees: ['hugo'] });
  assert.equal((await h.one('zoe', { type: 'column.update', projectId: p.projectId, columnId: p.col, name: 'Idées' })).status, 200);
  // Zoé passe Contributeur : plus les colonnes, plus les cartes des autres
  assert.equal((await h.share(p.projectId, { zoe: 'contribution', hugo: 'contribution', marc: 'lecture' })).status, 200);
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'column.update', projectId: p.projectId, columnId: p.col, name: 'Brouillons' })), [403, 'ops.projetModifierSeulement']);
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'card.update', cardId: own, title: 'X' })), [403, 'ops.carteModifierSiennes']);
  // Hugo passe en lecture seule : retiré de la carte attribuée, plus rien sur la sienne
  await h.one('hugo', { type: 'project.state', projectId: p.projectId, mutedPush: true });
  assert.equal((await h.share(p.projectId, { zoe: 'contribution', hugo: 'lecture', marc: 'lecture' })).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT user_id FROM card_assignees WHERE card_id = ?').pluck().all(assigned), []);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM card_events WHERE card_id = ? AND type = 'unassign'").pluck().get(assigned), 1);
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.update', cardId: own, title: 'X' })), [403, 'ops.projetLectureSeule']);
  assert.ok(h.app.db.prepare('SELECT 1 FROM project_user_state WHERE project_id = ? AND user_id = ?').get(p.projectId, h.people.hugo.id), 'ses réglages restent tant qu\'il est membre');
  // Retiré du projet : ses réglages partent, le projet lui devient inconnu
  assert.equal((await h.share(p.projectId, { zoe: 'contribution', marc: 'lecture' })).status, 200);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM project_user_state WHERE project_id = ? AND user_id = ?').pluck().get(p.projectId, h.people.hugo.id), 0);
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.update', cardId: own, title: 'X' })), [404, 'ops.carteIntrouvable']);
  assert.deepEqual((await h.sync('hugo')).projectIds, []);
  // Quitter : Zoé, attribuée, en est retirée
  const zoeCard = await h.card(p, 'lea', { assignees: ['zoe'] });
  assert.equal((await h.people.zoe.client.post(`/api/projects/${p.projectId}/leave`)).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT user_id FROM card_assignees WHERE card_id = ?').pluck().all(zoeCard), []);
  // projectAccess : la règle seule
  assert.equal(projectAccess({ id: 1 }, { owner_id: 1, deleted_at: 'x' }), 'owner');
  assert.equal(projectAccess({ id: 2 }, { owner_id: 1, deleted_at: 'x', member_access: 'modification' }), null);
  assert.equal(projectAccess({ id: 2 }, { owner_id: 1, member_access: 'contribution' }), 'contributor');
  assert.equal(projectAccess({ id: 2 }, { owner_id: 1, member_access: null }), null);
});

test('objet d\'un autre projet : toujours 404 (colonne, étiquette, carte voisine, carte d\'un autre projet)', async (t) => {
  const h = await household(t);
  const a = await h.project({ name: 'A' });
  const b = await h.project({ name: 'B' });
  const cardA = await h.card(a);
  const cardB = await h.card(b);
  const cases = [
    [{ type: 'card.labels', cardId: cardA, labelIds: [b.labelId] }, [404, 'ops.etiquetteProjetIntrouvable']],
    [{ type: 'card.move', cardId: cardA, columnId: b.col }, [404, 'ops.colonneIntrouvable']],
    [{ type: 'card.move', cardId: cardA, afterId: cardB }, [404, 'ops.carteIntrouvable']],
    [{ type: 'card.create', projectId: a.projectId, cardId: uuid(), columnId: b.col, title: 'x' }, [404, 'ops.colonneIntrouvable']],
    [{ type: 'card.create', projectId: a.projectId, cardId: uuid(), columnId: a.col, title: 'x', labelIds: [b.labelId] }, [404, 'ops.etiquetteProjetIntrouvable']],
    [{ type: 'card.update', projectId: a.projectId, cardId: cardB, title: 'x' }, [404, 'ops.carteIntrouvable']],
    [{ type: 'column.update', projectId: a.projectId, columnId: b.col, name: 'x' }, [404, 'ops.colonneIntrouvable']],
    [{ type: 'column.delete', projectId: a.projectId, columnId: b.col }, [404, 'ops.colonneIntrouvable']],
    [{ type: 'column.delete', projectId: a.projectId, columnId: a.col, moveTo: b.col }, [404, 'ops.colonneIntrouvable']],
    [{ type: 'column.move', projectId: a.projectId, columnId: a.col, afterId: b.col }, [404, 'ops.colonneIntrouvable']],
    [{ type: 'label.update', projectId: a.projectId, labelId: b.labelId, name: 'x' }, [404, 'ops.etiquetteProjetIntrouvable']],
  ];
  for (const [op, expected] of cases) assert.deepEqual(statusOf(await h.one('lea', op)), expected, JSON.stringify(op));
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM card_labels').pluck().get(), 0);
  assert.equal(h.cardRow(cardB).title, 'Article 2FAuth');
  // Supprimer l'étiquette d'un autre projet par son identifiant : rien ne se passe
  await h.one('lea', { type: 'card.labels', cardId: cardB, labelIds: [b.labelId] });
  assert.equal((await h.one('lea', { type: 'label.delete', projectId: a.projectId, labelId: b.labelId })).status, 200);
  assert.ok(h.app.db.prepare('SELECT 1 FROM project_labels WHERE id = ?').get(b.labelId));
  assert.deepEqual(h.app.db.prepare('SELECT label_id FROM card_labels WHERE card_id = ?').pluck().all(cardB), [b.labelId]);
});

// --- Création, duplication ---

test('nouveau projet : « À faire », « En cours », « Fait » dans la langue du compte, ou les colonnes du téléphone ; noms vérifiés', async (t) => {
  const h = await household(t);
  const p = await h.project({ shared: false });
  assert.deepEqual(h.columnsOf(p.projectId).map((c) => [c.name, c.color]), [['À faire', 'gris'], ['En cours', 'bleu'], ['Fait', 'vert']]);
  h.app.db.prepare("UPDATE users SET locale = 'en' WHERE username = 'zoe'").run();
  const en = uuid();
  await h.one('zoe', { type: 'project.create', projectId: en, name: 'Garden' });
  assert.deepEqual(h.columnsOf(en).map((c) => c.name), ['To do', 'In progress', 'Done']);
  const mine = uuid();
  const columns = [{ columnId: uuid(), name: 'Idées', color: 'jaune' }, { columnId: uuid(), name: 'Publiés' }];
  assert.equal((await h.one('lea', { type: 'project.create', projectId: mine, name: '  DomoPi\nTests  ', columns })).status, 200);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'project.create', projectId: mine, name: 'X' })), [409, 'ops.projetExisteDeja']);
  assert.deepEqual(h.columnsOf(mine).map((c) => [c.id, c.name, c.color]), [[columns[0].columnId, 'Idées', 'jaune'], [columns[1].columnId, 'Publiés', 'gris']]);
  assert.equal(h.app.db.prepare('SELECT name FROM projects WHERE id = ?').pluck().get(mine), 'DomoPi Tests');
  for (const [op, code] of [
    [{ name: '' }, 'ops.nomProjetInvalide'],
    [{ name: 'x'.repeat(81) }, 'ops.nomProjetInvalide'],
    [{ name: 'a‮b' }, 'ops.nomProjetInvalide'],
    [{ name: 'Ok', columns: [] }, 'ops.colonnesInvalides'],
    [{ name: 'Ok', columns: [{ columnId: uuid(), name: 'Été' }, { columnId: uuid(), name: 'ete' }] }, 'ops.nomColonneExiste'],
    [{ name: 'Ok', columns: [{ columnId: uuid(), name: 'A', color: 'turquoise' }] }, 'ops.couleurInvalide'],
    [{ name: 'Ok', columns: Array.from({ length: 21 }, (_, i) => ({ columnId: uuid(), name: `C${i}` })) }, 'ops.colonnesInvalides'],
  ]) assert.deepEqual(statusOf(await h.one('lea', { type: 'project.create', projectId: uuid(), ...op })), [400, code], JSON.stringify(op).slice(0, 60));
});

test('dupliquer : colonnes, étiquettes et option copiées, aucune carte, à qui duplique (Lecture seule compris), partagé avec personne', async (t) => {
  const h = await household(t);
  const p = await h.project();
  await h.one('lea', { type: 'project.update', projectId: p.projectId, priorityEnabled: true });
  await h.one('lea', { type: 'column.update', projectId: p.projectId, columnId: p.col, name: 'Idées', color: 'jaune' });
  await h.card(p);
  await h.card(p, 'hugo');
  const copyId = uuid();
  const columnIds = Object.fromEntries(p.columns.map((c) => [c.id, uuid()]));
  const labelIds = { [p.labelId]: uuid() };
  assert.equal((await h.one('marc', { type: 'project.duplicate', projectId: p.projectId, newProjectId: copyId, name: 'DomoPi Tutoriels', columnIds, labelIds })).status, 200);
  const copy = h.app.db.prepare('SELECT * FROM projects WHERE id = ?').get(copyId);
  assert.equal(copy.owner_id, h.people.marc.id);
  assert.equal(copy.name, 'DomoPi Tutoriels');
  assert.equal(copy.priority_enabled, 1);
  assert.equal(copy.duplicated_from, p.projectId);
  assert.deepEqual(h.columnsOf(copyId).map((c) => [c.id, c.name, c.color]), h.columnsOf(p.projectId).map((c) => [columnIds[c.id], c.name, c.color]));
  assert.deepEqual(h.app.db.prepare('SELECT id, name, color FROM project_labels WHERE project_id = ?').all(copyId), [{ id: labelIds[p.labelId], name: 'Sécurité', color: 'rouge' }]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM cards WHERE project_id = ?').pluck().get(copyId), 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM project_members WHERE project_id = ?').pluck().get(copyId), 0);
  // Marc voit la copie en propriétaire ; Léa ne la voit pas
  assert.equal((await h.sync('marc')).projects.find((x) => x.id === copyId).role, 'owner');
  assert.ok(!(await h.sync('lea')).projectIds.includes(copyId));
  // Sans nom ni identifiants : « (copie) » dans la langue du compte, identifiants posés par le serveur
  const second = uuid();
  assert.equal((await h.one('zoe', { type: 'project.duplicate', projectId: p.projectId, newProjectId: second })).status, 200);
  assert.equal(h.app.db.prepare('SELECT name FROM projects WHERE id = ?').pluck().get(second), 'DomoPi Articles (copie)');
  assert.equal(h.columnsOf(second).length, 3);
  // Identifiant déjà pris : refus, rien de créé
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'project.duplicate', projectId: p.projectId, newProjectId: uuid(), columnIds: { [p.col]: p.col } })), [409, 'ops.colonneExisteDeja']);
});

// --- Ordre ---

test('ordre : en bas par défaut, en haut, après une carte, renumérotation, deux déplacements en même temps', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const order = () => h.app.db.prepare('SELECT id FROM cards WHERE column_id = ? AND deleted_at IS NULL ORDER BY position, id').pluck().all(p.col);
  const a = await h.card(p, 'lea', { title: 'A' });
  const b = await h.card(p, 'lea', { title: 'B' });
  const c = await h.card(p, 'lea', { title: 'C' });
  assert.deepEqual(order(), [a, b, c], 'chaque carte va en bas');
  const top = uuid();
  await h.one('lea', { type: 'card.create', projectId: p.projectId, cardId: top, columnId: p.col, title: 'Haut', afterId: null });
  assert.deepEqual(order(), [top, a, b, c]);
  await h.one('lea', { type: 'card.move', cardId: c, afterId: top });
  assert.deepEqual(order(), [top, c, a, b]);
  // Déjà à sa place : rien n'est écrit (pas de nouvelle date)
  const before = h.cardRow(c).updated_at;
  h.app.clock.now += 1000;
  await h.one('lea', { type: 'card.move', cardId: c, afterId: top });
  assert.equal(h.cardRow(c).updated_at, before);
  // Voisine supprimée entre-temps : en bas
  await h.one('lea', { type: 'card.delete', cardId: a });
  await h.one('lea', { type: 'card.move', cardId: top, afterId: a });
  assert.deepEqual(order(), [c, b, top]);
  // Une carte après elle-même : refusé
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.move', cardId: c, afterId: c })), [400, 'ops.placeInvalide']);
  // Positions trop serrées : la colonne est renumérotée, l'ordre est gardé
  h.app.db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(1, c);
  h.app.db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(1 + 1e-9, b);
  h.app.db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(2, top);
  await h.one('lea', { type: 'card.move', cardId: top, afterId: c });
  assert.deepEqual(order(), [c, top, b]);
  assert.deepEqual(h.app.db.prepare('SELECT position FROM cards WHERE column_id = ? AND deleted_at IS NULL ORDER BY position').pluck().all(p.col), [1024, 2048, 3072]);
  // Deux personnes déplacent en même temps deux cartes au même endroit : les
  // deux passent, l'ordre reste net (positions toutes différentes)
  const d = await h.card(p, 'lea', { title: 'D' });
  const e = await h.card(p, 'hugo', { title: 'E' });
  await Promise.all([
    h.one('zoe', { type: 'card.move', cardId: d, afterId: c }),
    h.one('hugo', { type: 'card.move', cardId: e, afterId: c }),
  ]);
  const final = order();
  assert.equal(final.length, 5);
  assert.equal(final[0], c);
  assert.deepEqual(new Set(final.slice(1, 3)), new Set([d, e]));
  const positions = h.app.db.prepare('SELECT position FROM cards WHERE column_id = ? AND deleted_at IS NULL').pluck().all(p.col);
  assert.equal(new Set(positions).size, positions.length);
  // Colonnes : même règle (null : en premier)
  const third = p.columns[2].id;
  await h.one('lea', { type: 'column.move', projectId: p.projectId, columnId: third, afterId: null });
  assert.deepEqual(h.columnsOf(p.projectId).map((col) => col.id), [third, p.col, p.col2]);
  await h.one('lea', { type: 'column.move', projectId: p.projectId, columnId: third, afterId: p.col2 });
  assert.deepEqual(h.columnsOf(p.projectId).map((col) => col.id), [p.col, p.col2, third]);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'column.move', projectId: p.projectId, columnId: third })), [400, 'ops.placeInvalide']);
});

test('supprimer une colonne : jamais de carte effacée sans le dire ; déplacées en bas d\'une autre, ou dans les cartes supprimées ; jamais la dernière', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const [first, second, third] = p.columns.map((c) => c.id);
  const target = await h.card(p, 'lea', { title: 'Déjà là', columnId: second });
  const x = await h.card(p, 'lea', { title: 'X' });
  const y = await h.card(p, 'hugo', { title: 'Y' });
  const refused = await h.one('zoe', { type: 'column.delete', projectId: p.projectId, columnId: first });
  assert.deepEqual(statusOf(refused), [400, 'ops.colonneNonVide']);
  assert.match(refused.error, /2 cartes/);
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'column.delete', projectId: p.projectId, columnId: first, moveTo: first })), [400, 'ops.colonneDestinationInvalide']);
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'column.delete', projectId: p.projectId, columnId: first, moveTo: second, deleteCards: true })), [400, 'ops.colonneDestinationInvalide']);
  // Déplacées en bas de « En cours », dans leur ordre
  const moved = await h.one('zoe', { type: 'column.delete', projectId: p.projectId, columnId: first, moveTo: second });
  assert.deepEqual([moved.status, moved.moved, moved.deleted], [200, 2, 0]);
  assert.deepEqual(h.app.db.prepare('SELECT id FROM cards WHERE column_id = ? ORDER BY position').pluck().all(second), [target, x, y]);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM card_events WHERE type = 'move' AND card_id IN (?, ?)").pluck().get(x, y), 2);
  // Supprimée avec ses cartes : elles vont dans les cartes supprimées, avec le nom de la colonne
  const removed = await h.one('lea', { type: 'column.delete', projectId: p.projectId, columnId: second, deleteCards: true });
  assert.deepEqual([removed.status, removed.deleted], [200, 3]);
  for (const id of [target, x, y]) {
    const row = h.cardRow(id);
    assert.ok(row.deleted_at);
    assert.equal(row.deleted_column_name, 'En cours');
    assert.equal(row.column_id, null, 'la colonne est partie');
  }
  // Restaurer une de ces cartes : en bas de la première colonne qui reste
  assert.equal((await h.one('hugo', { type: 'card.restore', cardId: y })).status, 200);
  assert.deepEqual([h.cardRow(y).column_id, h.cardRow(y).deleted_at], [third, null]);
  // La dernière colonne reste
  assert.deepEqual(statusOf(await h.one('lea', { type: 'column.delete', projectId: p.projectId, columnId: third, deleteCards: true })), [400, 'ops.derniereColonne']);
  // Une carte envoyée hors ligne vers une colonne supprimée : en bas de la première
  const late = uuid();
  assert.equal((await h.one('hugo', { type: 'card.create', projectId: p.projectId, cardId: late, columnId: first, title: 'Hors ligne' })).status, 200);
  assert.equal(h.cardRow(late).column_id, third);
  assert.equal((await h.one('hugo', { type: 'card.move', cardId: late, columnId: second, afterId: null })).status, 200);
  assert.equal(h.cardRow(late).column_id, third);
});

// --- Corbeilles et ménage ---

test('corbeilles : projet (propriétaire, 30 jours, revient pour tous avec ses cartes) ; cartes supprimées du projet ; ménage nocturne', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cards = [await h.card(p), await h.card(p, 'hugo'), await h.card(p, 'hugo')];
  const zoeBefore = await h.sync('zoe');
  assert.equal(zoeBefore.cards.length, 3);
  assert.equal((await h.one('lea', { type: 'project.delete', projectId: p.projectId })).status, 200);
  // Les membres ne le voient plus ; Léa le voit dans sa corbeille, en résumé
  const zoeAfter = await h.sync('zoe', zoeBefore.serverTime);
  assert.deepEqual(zoeAfter.projectIds, []);
  const lea = await h.sync('lea');
  const trashed = lea.projects.find((x) => x.id === p.projectId);
  assert.deepEqual(Object.keys(trashed).sort(), ['cardCount', 'createdAt', 'deadlinesEnabled', 'deletedAt', 'id', 'memberCount', 'name', 'priorityEnabled', 'role', 'updatedAt']);
  assert.deepEqual([trashed.cardCount, trashed.memberCount], [3, 3]);
  assert.equal(lea.cards.filter((c) => c.projectId === p.projectId).length, 0, 'ses cartes ne sont pas envoyées');
  // Dans la corbeille : plus aucune modification, même par le propriétaire
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.update', cardId: cards[0], title: 'x' })), [404, 'ops.carteIntrouvable']);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'project.update', projectId: p.projectId, name: 'x' })), [404, 'ops.projetIntrouvable']);
  // Restauré : il revient pour tous, et Zoé reçoit de nouveau toutes ses cartes
  h.app.clock.now += 1000;
  assert.equal((await h.one('lea', { type: 'project.restore', projectId: p.projectId })).status, 200);
  const zoeBack = await h.sync('zoe', zoeAfter.serverTime);
  assert.deepEqual(zoeBack.projectIds, [p.projectId]);
  assert.deepEqual(new Set(zoeBack.cards.map((c) => c.id)), new Set(cards));
  // Rejouable : restaurer un projet déjà restauré, supprimer deux fois
  assert.equal((await h.one('lea', { type: 'project.restore', projectId: p.projectId })).status, 200);
  // Cartes supprimées du projet : visibles de tous (Lecture seule compris), 30 jours
  assert.equal((await h.one('hugo', { type: 'card.delete', cardId: cards[1] })).status, 200);
  const marc = await h.sync('marc');
  const gone = marc.cards.find((c) => c.id === cards[1]);
  assert.ok(gone.deletedAt);
  assert.equal(gone.deletedByName, 'Hugo');
  assert.equal(gone.deletedColumnName, 'À faire');
  // 31 jours plus tard : effacée par le ménage, oubliée par les appareils
  // (absente des cardIds de la structure) ; restaurer n'est plus possible
  await h.one('hugo', { type: 'card.delete', cardId: cards[2] });
  const ago = (days) => new Date(h.app.clock.now - days * DAY).toISOString();
  h.app.db.prepare('UPDATE cards SET deleted_at = ? WHERE id = ?').run(ago(29), cards[2]);
  assert.equal((await h.one('hugo', { type: 'card.restore', cardId: cards[2] })).status, 200, 'encore possible à 29 jours');
  await h.one('hugo', { type: 'card.delete', cardId: cards[2] });
  h.app.db.prepare('UPDATE cards SET deleted_at = ? WHERE id = ?').run(ago(31), cards[1]);
  h.app.clock.now += 1000;
  const since = (await h.sync('marc')).serverTime;
  h.app.clock.now += 1000;
  assert.deepEqual(h.app.ctx.projects.purgeDeleted(), { projects: 0, cards: 1 });
  assert.equal(h.cardRow(cards[1]), undefined);
  const after = await h.sync('marc', since);
  const structure = after.projects.find((x) => x.id === p.projectId);
  assert.ok(!structure.cardIds.includes(cards[1]));
  assert.ok(structure.cardIds.includes(cards[2]));
  // Projet dans la corbeille depuis plus de 30 jours : effacé avec tout
  assert.equal((await h.one('lea', { type: 'project.delete', projectId: p.projectId })).status, 200);
  h.app.db.prepare('UPDATE projects SET deleted_at = ? WHERE id = ?').run(ago(31), p.projectId);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'project.restore', projectId: p.projectId })), [404, 'ops.projetIntrouvable']);
  assert.equal(h.app.ctx.projects.purgeDeleted().projects, 1);
  for (const table of ['projects', 'project_columns', 'project_labels', 'cards', 'card_events', 'project_members', 'project_user_state']) {
    assert.equal(h.app.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, table);
  }
});

// --- Limites ---

test('limites : projets, colonnes, étiquettes, cartes, personnes, étiquettes par carte, créations par heure', async (t) => {
  const h = await household(t);
  const p = await h.project();
  // 20 colonnes
  for (let i = 3; i < 20; i++) assert.equal((await h.one('lea', { type: 'column.create', projectId: p.projectId, columnId: uuid(), name: `C${i}` })).status, 200);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'column.create', projectId: p.projectId, columnId: uuid(), name: 'C20' })), [400, 'ops.colonnesLimite']);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'column.create', projectId: p.projectId, columnId: uuid(), name: 'x'.repeat(41) })), [400, 'ops.nomColonneInvalide']);
  // 50 étiquettes, même nom refusé (avec l'étiquette existante)
  const same = await h.one('lea', { type: 'label.create', projectId: p.projectId, labelId: uuid(), name: 'SECURITE' });
  assert.deepEqual(statusOf(same), [409, 'ops.etiquetteProjetExiste']);
  assert.deepEqual(same.label, { id: p.labelId, name: 'Sécurité', color: 'rouge' });
  for (let i = 1; i < 50; i++) h.app.db.prepare("INSERT INTO project_labels (id, project_id, name, name_key, color, created_at) VALUES (?, ?, ?, ?, 'gris', 'x')").run(uuid(), p.projectId, `L${i}`, `l${i}`);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'label.create', projectId: p.projectId, labelId: uuid(), name: 'Une de trop' })), [400, 'ops.etiquettesProjetLimite']);
  // 10 étiquettes par carte
  const cardId = await h.card(p);
  const labelIds = h.app.db.prepare('SELECT id FROM project_labels WHERE project_id = ? LIMIT 11').pluck().all(p.projectId);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.labels', cardId, labelIds })), [400, 'ops.etiquettesCarteInvalides']);
  assert.equal((await h.one('lea', { type: 'card.labels', cardId, labelIds: labelIds.slice(0, 10) })).status, 200);
  // 2 000 cartes par projet, cartes supprimées comprises
  const insert = h.app.db.prepare("INSERT INTO cards (id, project_id, column_id, position, title, created_by, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, 'x', 2, 'x', 'x', ?)");
  h.app.db.transaction(() => { for (let i = 1; i < 2000; i++) insert.run(uuid(), p.projectId, p.col, i, i % 2 ? null : '2026-10-16T00:00:00.000Z'); })();
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.create', projectId: p.projectId, cardId: uuid(), columnId: p.col, title: 'De trop' })), [400, 'ops.cartesLimite']);
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.duplicate', cardId, newCardId: uuid() })), [400, 'ops.cartesLimite']);
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.create', projectId: p.projectId, cardId: uuid(), columnId: p.col, title: 'x'.repeat(201) })), [400, 'ops.titreCarteInvalide']);
  // 50 personnes au plus dans un partage
  const many = await h.people.lea.client.request('PUT', `/api/projects/${p.projectId}/members`, { userIds: Array.from({ length: 51 }, (_, i) => i + 2) });
  assert.equal(many.status, 400);
  // 100 projets par propriétaire, corbeille comprise
  const insertProject = h.app.db.prepare("INSERT INTO projects (id, owner_id, name, created_at, updated_at, changed_at, deleted_at) VALUES (?, ?, 'x', 'x', 'x', 'x', ?)");
  h.app.db.transaction(() => { for (let i = 1; i < 100; i++) insertProject.run(uuid(), h.people.lea.id, i % 2 ? null : '2026-10-16T00:00:00.000Z'); })();
  assert.deepEqual(statusOf(await h.one('lea', { type: 'project.create', projectId: uuid(), name: 'De trop' })), [400, 'ops.projetsLimite']);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'project.duplicate', projectId: p.projectId, newProjectId: uuid() })), [400, 'ops.projetsLimite']);
  // 20 créations ou duplications par heure et par compte : au-delà, tout le lot est refusé (429), rien n'est appliqué
  for (let i = 0; i < 20; i++) await h.one('zoe', { type: 'project.create', projectId: uuid(), name: `Z${i}` });
  const limited = await h.people.zoe.client.post('/api/ops', { ops: [{ id: uuid(), type: 'project.create', projectId: uuid(), name: 'Z20' }] });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, 'Trop de projets créés ou dupliqués pour le moment. Réessayez dans une heure.');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM projects WHERE owner_id = ?').pluck().get(h.people.zoe.id), 20);
});

// --- Synchronisation ---

test('synchronisation : seulement mes projets, champ par champ ; mon rôle, createdByMe, jamais le numéro de qui a créé ; mes réglages à moi seul ; étiquettes jamais hors du projet', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const other = await h.project({ owner: 'zoe', name: 'Travaux maison', shared: false });
  const leaCard = await h.card(p);
  const hugoCard = await h.card(p, 'hugo');
  await h.one('lea', { type: 'card.labels', cardId: leaCard, labelIds: [p.labelId] });
  await h.one('lea', { type: 'card.assign', cardId: leaCard, userIds: [h.people.hugo.id] });
  await h.one('marc', { type: 'project.state', projectId: p.projectId, mutedNews: true, inDeadlines: true });
  const roles = { lea: 'owner', zoe: 'editor', hugo: 'contributor', marc: 'reader' };
  for (const [who, role] of Object.entries(roles)) {
    const data = await h.sync(who);
    const project = data.projects.find((x) => x.id === p.projectId);
    assert.equal(project.role, role, who);
    assert.deepEqual(Object.keys(project).sort(), ['cardIds', 'columns', 'createdAt', 'deadlinesEnabled', 'deletedAt', 'id', 'labels', 'members', 'name', 'priorityEnabled', 'role', 'updatedAt']);
    assert.deepEqual(project.members.map((m) => [m.displayName, m.role]), [['Léa', 'owner'], ['Zoé', 'editor'], ['Hugo', 'contributor'], ['Marc', 'reader']]);
    assert.deepEqual(Object.keys(project.members[0]).sort(), ['active', 'displayName', 'id', 'role']);
    assert.deepEqual(project.labels, [{ id: p.labelId, name: 'Sécurité', color: 'rouge' }]);
    const card = data.cards.find((c) => c.id === leaCard);
    assert.deepEqual(Object.keys(card).sort(), ['assigneeIds', 'columnId', 'createdAt', 'createdByMe', 'createdByName', 'deletedAt', 'deletedByName', 'deletedColumnName',
      'description', 'descriptionAt', 'descriptionByMe', 'descriptionByName', 'descriptionVersion', 'done', 'doneAt', 'dueDate', 'dueTime',
      'id', 'labelIds', 'links', 'position', 'priority', 'projectId', 'remindBefore', 'title', 'updatedAt', 'updatedByName']);
    assert.equal(card.createdByMe, who === 'lea');
    assert.equal(card.createdByName, 'Léa');
    assert.deepEqual(card.labelIds, [p.labelId]);
    assert.deepEqual(card.assigneeIds, [h.people.hugo.id]);
    assert.equal(data.cards.find((c) => c.id === hugoCard).createdByMe, who === 'hugo');
    // Mes réglages, jamais ceux de Marc chez les autres
    assert.deepEqual(data.projectMine[p.projectId].mutedNews, who === 'marc');
    assert.deepEqual(data.projectMine[p.projectId].inDeadlines, who === 'marc');
    // Le projet de Zoé non partagé : ni lui, ni ses colonnes, ni ses étiquettes
    if (who !== 'zoe') {
      assert.ok(!data.projectIds.includes(other.projectId));
      assert.ok(!JSON.stringify(data).includes(other.labelId));
    }
  }
  for (const who of ['paul', 'guillaume']) {
    const data = await h.sync(who);
    assert.deepEqual([data.projects, data.projectIds, data.cards], [[], [], []], who);
  }
  // Depuis : seulement ce qui a changé (Hugo a déjà tout vu)
  await h.one('hugo', { type: 'project.seen', projectId: p.projectId, upTo: (await h.sync('hugo')).projectMine[p.projectId].lastEvent });
  assert.equal((await h.sync('hugo')).projectMine[p.projectId].unread, false);
  h.app.clock.now += 1000;
  const base = await h.sync('zoe');
  h.app.clock.now += 1000;
  await h.one('hugo', { type: 'card.update', cardId: hugoCard, title: 'Nouveau titre' });
  const delta = await h.sync('zoe', base.serverTime);
  assert.deepEqual(delta.cards.map((c) => c.id), [hugoCard]);
  assert.deepEqual(delta.projects, [], 'la structure n\'a pas changé');
  // Nouveautés : le changement de Hugo est nouveau pour Zoé, pas pour Hugo ; vu, il ne l'est plus
  assert.equal(delta.projectMine[p.projectId].unread, true);
  assert.equal((await h.sync('hugo')).projectMine[p.projectId].unread, false);
  await h.one('zoe', { type: 'project.seen', projectId: p.projectId, upTo: delta.projectMine[p.projectId].lastEvent });
  assert.equal((await h.sync('zoe')).projectMine[p.projectId].unread, false);
  // Une personne ajoutée reçoit tout le projet, même avec « since », et démarre « à jour »
  const paulBase = await h.sync('paul');
  h.app.clock.now += 1000;
  await h.share(p.projectId, { zoe: 'modification', hugo: 'contribution', marc: 'lecture', paul: 'lecture' });
  const paul = await h.sync('paul', paulBase.serverTime);
  assert.deepEqual(paul.projectIds, [p.projectId]);
  assert.equal(paul.cards.length, 2);
  assert.equal(paul.projectMine[p.projectId].unread, false);
});

// --- File d'attente ---

test('renvoi d\'une opération (réseau revenu) : jamais appliquée deux fois ; opération refusée après un changement de rôle, et le même refus au renvoi', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const op = { id: uuid(), type: 'card.create', projectId: p.projectId, cardId: uuid(), columnId: p.col, title: 'Hors ligne' };
  const first = (await h.people.hugo.client.post('/api/ops', { ops: [op] })).body.results[0];
  const again = (await h.people.hugo.client.post('/api/ops', { ops: [op] })).body.results[0];
  assert.equal(first.status, 200);
  assert.equal(again.duplicate, true);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM cards WHERE project_id = ?').pluck().get(p.projectId), 1);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM card_events WHERE type = 'create'").pluck().get(), 1);
  // Hugo passe en lecture seule pendant qu'il est hors ligne : ses opérations en file sont refusées
  await h.share(p.projectId, { zoe: 'modification', hugo: 'lecture', marc: 'lecture' });
  const queued = { id: uuid(), type: 'card.update', cardId: op.cardId, title: 'Écrit hors ligne' };
  const refused = (await h.people.hugo.client.post('/api/ops', { ops: [queued] })).body.results[0];
  assert.deepEqual(statusOf(refused), [403, 'ops.projetLectureSeule']);
  assert.equal(refused.error, 'Vous avez un accès en lecture seule à ce projet.');
  const replay = (await h.people.hugo.client.post('/api/ops', { ops: [queued] })).body.results[0];
  assert.deepEqual([replay.status, replay.duplicate], [403, true]);
  assert.equal(h.cardRow(op.cardId).title, 'Hors ligne');
  // Le même identifiant d'opération par un autre compte : refusé
  assert.equal((await h.people.zoe.client.post('/api/ops', { ops: [op] })).body.results[0].status, 409);
});

// --- Temps réel ---

test('temps réel : « project » aux seuls membres (et une dernière fois à une personne retirée), jamais après un refus', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const sent = [];
  const original = h.app.ctx.events.notifyProjects.bind(h.app.ctx.events);
  h.app.ctx.events.notifyProjects = (userIds) => {
    sent.push([...new Set(userIds)].sort());
    original(userIds);
  };
  const members = [h.people.lea.id, h.people.zoe.id, h.people.hugo.id, h.people.marc.id].sort();
  await h.card(p, 'hugo');
  assert.deepEqual(sent, [members]);
  sent.length = 0;
  await h.one('marc', { type: 'card.create', projectId: p.projectId, cardId: uuid(), columnId: p.col, title: 'x' });
  assert.deepEqual(sent, [], 'refus : personne n\'est prévenu');
  await h.one('marc', { type: 'project.state', projectId: p.projectId, mutedPush: true });
  assert.deepEqual(sent, [[h.people.marc.id]], 'réglage à soi : ses seuls appareils');
  sent.length = 0;
  await h.share(p.projectId, { zoe: 'modification', hugo: 'contribution' });
  assert.deepEqual(sent, [members], 'Marc, retiré, est prévenu une dernière fois');
  // Le flux lui-même : « event: project », sans aucune donnée
  const res = await fetch(`${h.app.base}/api/events`, { headers: { origin: 'http://listo.test', cookie: [...h.people.zoe.client.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
  const reader = res.body.getReader();
  await reader.read(); // « ready »
  await h.card(p, 'lea');
  const { value } = await reader.read();
  assert.equal(new TextDecoder().decode(value), 'event: project\ndata: {}\n\n');
  await reader.cancel();
});

// --- Historique et journal ---

test('historique : une ligne par changement, jamais le titre d\'une carte ; 300 lignes au plus par carte', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'hugo', { title: 'Titre très secret' });
  await h.one('hugo', { type: 'card.update', cardId, title: 'Autre titre secret' });
  await h.one('hugo', { type: 'card.move', cardId, columnId: p.col2 });
  await h.one('hugo', { type: 'card.labels', cardId, labelIds: [p.labelId] });
  await h.one('hugo', { type: 'card.assign', cardId, userIds: [h.people.zoe.id] });
  await h.one('hugo', { type: 'card.delete', cardId });
  await h.one('hugo', { type: 'card.restore', cardId });
  await h.one('hugo', { type: 'card.duplicate', cardId, newCardId: uuid() });
  const rows = h.app.db.prepare('SELECT type, params, user_id, source FROM card_events WHERE card_id = ? ORDER BY id').all(cardId);
  assert.deepEqual(rows.map((r) => r.type), ['create', 'rename', 'move', 'label', 'assign', 'delete', 'restore']);
  assert.ok(rows.every((r) => r.user_id === h.people.hugo.id && r.source === 'app'));
  assert.deepEqual(JSON.parse(rows[2].params), { from: p.col, fromName: 'À faire', to: p.col2, toName: 'En cours' });
  assert.deepEqual(JSON.parse(rows[4].params), { user: h.people.zoe.id });
  const all = h.app.db.prepare('SELECT params FROM card_events').pluck().all().join(' ');
  assert.ok(!all.includes('secret'), 'jamais le titre');
  // Source « mcp » (assistant IA) : gardée telle quelle
  h.app.ctx.lists.applyOps({ id: h.people.lea.id, username: 'lea' }, [{ id: uuid(), type: 'card.update', cardId, title: 'Par un assistant' }], { source: 'mcp' });
  assert.equal(h.app.db.prepare('SELECT source FROM card_events WHERE card_id = ? ORDER BY id DESC LIMIT 1').pluck().get(cardId), 'mcp');
  // 300 lignes au plus : les plus anciennes partent
  const ops = Array.from({ length: 100 }, (_, i) => ({ type: 'card.update', cardId, title: `T${i}` }));
  for (let i = 0; i < 4; i++) await h.ops('lea', ops.map((op) => ({ ...op, title: `${op.title}-${i}` })));
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM card_events WHERE card_id = ?').pluck().get(cardId), 300);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM card_events WHERE card_id = ? AND type = 'create'").pluck().get(cardId), 0);
});

test('journal de sécurité (en anglais) : création, duplication, partage, départ, corbeille, effacements ; jamais un nom de projet, de colonne ni un titre', async (t) => {
  const h = await household(t);
  const p = await h.project({ name: 'Projet Confidentiel' });
  const cardId = await h.card(p, 'lea', { title: 'Carte Confidentielle' });
  await h.one('hugo', { type: 'project.duplicate', projectId: p.projectId, newProjectId: uuid() });
  await h.share(p.projectId, { zoe: 'contribution', hugo: 'contribution' });
  await h.people.hugo.client.post(`/api/projects/${p.projectId}/leave`);
  await h.one('lea', { type: 'card.delete', cardId });
  await h.people.lea.client.post(`/api/projects/${p.projectId}/cards/purge`, { cardIds: [cardId] });
  await h.one('lea', { type: 'project.delete', projectId: p.projectId });
  await h.one('lea', { type: 'project.restore', projectId: p.projectId });
  await h.one('lea', { type: 'project.delete', projectId: p.projectId });
  await h.people.lea.client.post('/api/projects/deleted/purge', { ids: [p.projectId] });
  const lines = h.app.logs.filter((line) => /project_|card_purged/.test(line));
  const events = lines.map((line) => line.split(' ')[2]);
  assert.deepEqual(events, [
    'project_created', 'project_shared', 'project_shared', 'project_shared', 'project_duplicated',
    'project_shared', 'project_shared', 'project_left', 'card_purged', 'project_deleted', 'project_restored', 'project_deleted', 'project_purged', 'project_trash_emptied',
  ]);
  assert.match(lines[1], /project_shared user="lea" project="[0-9a-f-]+" member="zoe" change="added" access="edit"/);
  assert.match(lines[2], /member="hugo" change="added" access="contribute"/);
  assert.match(lines[3], /member="marc" change="added" access="read"/);
  assert.match(lines[5], /member="marc" change="removed"/);
  assert.match(lines[6], /member="zoe" change="access" access="contribute"/);
  assert.match(lines[8], /card_purged user="lea" project="[0-9a-f-]+" cards=1/);
  assert.match(lines.at(-1), /project_trash_emptied user="lea" projects=1/);
  const everything = h.app.logs.join('\n');
  for (const secret of ['Confidentiel', 'Confidentielle', 'Sécurité', 'À faire']) assert.ok(!everything.includes(secret), secret);
  // « via=mcp » : seulement quand l'opération vient vraiment d'un assistant IA
  const q1 = await h.project({ shared: false });
  await h.one('lea', { type: 'project.delete', projectId: q1.projectId, via: 'mcp' });
  assert.doesNotMatch(h.app.logs.at(-1), /via=/);
  const q2 = await h.project({ shared: false });
  h.app.ctx.lists.applyOps({ id: h.people.lea.id, username: 'lea' }, [{ id: uuid(), type: 'project.delete', projectId: q2.projectId }], { source: 'mcp' });
  assert.match(h.app.logs.at(-1), /project_deleted user="lea" project="[0-9a-f-]+" via="mcp"/);
});
