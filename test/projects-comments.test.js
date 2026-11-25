// Projets, étape 3 du cadrage docs/cadrage-projets.md (migration 45) :
// commentaires (écrire : propriétaire, « Peut modifier », Contributeur sur
// toutes les cartes, jamais « Lecture seule » ; modifier et supprimer les
// siens ; le propriétaire supprime ceux des autres, sans jamais les
// modifier), historique (en ligne, construit champ par champ), « Suivre » /
// « Ne plus suivre », Nouveautés (point par carte), notifications (page
// Notifications et téléphone : nouvelles cartes regroupées, attribution,
// commentaires et modifications d'une carte suivie, rappel, partage même
// projets coupés), sourdines. Chaque opération et route ajoutées passent
// par les quatre rôles, le non-membre et l'Admin non membre (404). Jamais
// le titre d'une carte ni le texte d'un commentaire dans la page
// Notifications (base) ni dans un journal.
//
// Foyer : Léa (propriétaire), Zoé (« Peut modifier »), Hugo (Contributeur),
// Marc (« Lecture seule »), Paul (n'a rien), Guillaume (Admin, n'a rien).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, tempDir, databaseAt } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { openDatabase, schemaVersion } from '../server/db.js';
import { GROUP_MS, NOTE_QUIET_MS } from '../server/notify.js';
import { cleanComment, commentRights, followsCard } from '../public/js/projects.js';

const uuid = () => crypto.randomUUID();
const PEOPLE = [['lea', 'Léa'], ['zoe', 'Zoé'], ['hugo', 'Hugo'], ['marc', 'Marc'], ['paul', 'Paul']];
const SECRET = 'Code secret du portail 4711';
const TITLE = 'Article 2FAuth confidentiel';

async function household(t, { push = false } = {}) {
  const service = push ? fakePushService() : null;
  const app = await startTestApp(t, push ? { config: { push: true }, pushRequest: service } : {});
  if (service) service.clock = app.clock;
  const guillaume = await setupAdmin(app);
  const people = { guillaume: { client: guillaume, id: 1 } };
  for (const [key, name] of PEOPLE) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  if (service) {
    for (const [key, person] of Object.entries(people)) {
      person.device = fakeDevice(`https://fcm.googleapis.com/fcm/send/${key}`, key);
      assert.equal((await person.client.request('PUT', '/api/push/subscription', person.device.subscription)).status, 200);
    }
  }
  app.db.prepare('UPDATE users SET projects_enabled = 1').run();
  const ops = async (who, list) => {
    const res = await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
    assert.equal(res.status, 200, res.text);
    return res.body.results;
  };
  const one = async (who, op) => (await ops(who, [op]))[0];
  const sync = async (who) => (await people[who].client.get('/api/sync')).body;
  const share = (projectId, access) => people.lea.client.request('PUT', `/api/projects/${projectId}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  async function project(name = 'DomoPi Articles') {
    const projectId = uuid();
    assert.equal((await one('lea', { type: 'project.create', projectId, name })).status, 200);
    assert.equal((await share(projectId, { zoe: 'modification', hugo: 'contribution', marc: 'lecture' })).status, 200);
    const cols = app.db.prepare('SELECT id FROM project_columns WHERE project_id = ? ORDER BY position').pluck().all(projectId);
    return { projectId, col: cols[0], cols };
  }
  async function card(p, who = 'lea', { assignees = [] } = {}) {
    const cardId = uuid();
    assert.equal((await one(who, { type: 'card.create', projectId: p.projectId, cardId, columnId: p.col, title: TITLE })).status, 200);
    if (assignees.length) assert.equal((await one('lea', { type: 'card.assign', cardId, userIds: assignees.map((k) => people[k].id) })).status, 200);
    return cardId;
  }
  const comment = async (who, cardId, text = SECRET) => {
    const commentId = uuid();
    const res = await one(who, { type: 'comment.create', cardId, commentId, text });
    return { res, commentId };
  };
  // Page Notifications d'une personne (lignes mises en phrases)
  // (all : avec les lignes « Partage » des projets, sinon sans elles)
  // Les textes des projets mettent une espace insécable dans les guillemets
  // (« Nom » ne se coupe pas en fin de ligne) : on la compare comme une espace.
  const plain = (value) => (typeof value === 'string' ? value.replace(/\u00a0/g, ' ') : value);
  const inbox = async (who, { all = false } = {}) => (await people[who].client.get('/api/inbox')).body.rows
    .filter((row) => all || row.category !== 'sharing')
    .map((row) => ({ ...row, text: plain(row.text), sub: plain(row.sub) }));
  // Le temps passe ; les groupes mûrs partent
  const tick = async (ms = GROUP_MS) => {
    app.clock.now += ms;
    await app.ctx.notify.flushDue();
    if (service) await app.ctx.push.idle();
  };
  const pushes = (who) => service.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint)
    .map((c) => people[who].device.read(c.body).notification)
    .map((n) => ({ ...n, title: plain(n.title), body: plain(n.body) }));
  return { app, people, ops, one, sync, share, project, card, comment, inbox, tick, pushes };
}

// --- Règles partagées ---

test('règles : texte d\'un commentaire (1 à 4 000 caractères, retours à la ligne gardés, caractères de contrôle refusés), droits sur un commentaire, cartes suivies', () => {
  assert.equal(cleanComment('  Relu.\r\nDeux coquilles.  '), 'Relu.\nDeux coquilles.');
  for (const bad of ['', '   ', 'a'.repeat(4001), 'a\u0007b', 'a‮b', 42, null]) assert.equal(cleanComment(bad), null, JSON.stringify(bad));
  assert.equal(cleanComment('é'.repeat(4000)).length, 4000);
  assert.deepEqual(commentRights({ userId: 3 }, 3, 'contributor'), { edit: true, remove: true });
  assert.deepEqual(commentRights({ userId: 3 }, 4, 'editor'), { edit: false, remove: false });
  assert.deepEqual(commentRights({ userId: 3 }, 4, 'owner'), { edit: false, remove: true }, 'modération : supprimer, jamais modifier');
  assert.deepEqual(commentRights({ userId: 3 }, 3, 'reader'), { edit: false, remove: false });
  assert.deepEqual(commentRights({ byMe: true }, 9, 'editor'), { edit: true, remove: true });
  assert.equal(followsCard({}), false);
  assert.equal(followsCard({ created: true }), true);
  assert.equal(followsCard({ assigned: true }), true);
  assert.equal(followsCard({ commented: true }), true);
  assert.equal(followsCard({ choice: false, created: true, assigned: true, commented: true }), false, '« Ne plus suivre » est gardé');
  assert.equal(followsCard({ choice: true }), true);
});

// --- Migration 45 ---

test('migration 45 : commentaires et cartes suivies ; inbox recréée avec ses lignes, cibles « project » et « card » acceptées ; contraintes et cascades', (t) => {
  const file = path.join(tempDir(t), 'old.db');
  const old = databaseAt(file, 44);
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('anne', 'Anne', 'x')").run();
  old.prepare(`INSERT INTO inbox (user_id, num, category, text_key, params, target_type, target_id, group_key, count, created_at, updated_at, read_at)
    VALUES (1, 7, 'changes', 'note.changes', '{"actors":["Léa"]}', 'note', 'n1', 'changes:note:n1', 3, 'a', 'b', 'c')`).run();
  old.prepare("INSERT INTO projects (id, owner_id, name, created_at, updated_at, changed_at) VALUES ('p', 1, 'P', 'x', 'x', 'x')").run();
  old.prepare("INSERT INTO project_columns VALUES ('c', 'p', 'C', 'c', 'gris', 1, 'x', 'x')").run();
  old.prepare("INSERT INTO cards (id, project_id, column_id, position, title, created_by, created_at, updated_at) VALUES ('k', 'p', 'c', 1, 'T', 1, 'x', 'x')").run();
  old.close();
  const db = openDatabase(file);
  assert.equal(schemaVersion(db), 49);
  assert.deepEqual(db.prepare('SELECT user_id, num, category, text_key, params, target_type, target_id, group_key, count, created_at, updated_at, read_at FROM inbox').get(),
    { user_id: 1, num: 7, category: 'changes', text_key: 'note.changes', params: '{"actors":["Léa"]}', target_type: 'note', target_id: 'n1', group_key: 'changes:note:n1', count: 3, created_at: 'a', updated_at: 'b', read_at: 'c' },
    'une ligne d\'avant est gardée telle quelle');
  for (const index of ['inbox_user_num', 'inbox_user', 'inbox_group', 'inbox_updated']) assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(index), index);
  for (const type of ['project', 'card']) db.prepare(`INSERT INTO inbox (user_id, num, category, text_key, target_type, created_at, updated_at) VALUES (1, ?, 'changes', 'x', ?, 'a', 'a')`).run(type === 'project' ? 8 : 9, type);
  assert.throws(() => db.prepare("INSERT INTO inbox (user_id, num, category, text_key, target_type, created_at, updated_at) VALUES (1, 10, 'changes', 'x', 'column', 'a', 'a')").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO card_comments (id, card_id, user_id, body, created_at, updated_at) VALUES ('m0', 'k', 1, '', 'x', 'x')").run(), /CHECK/, 'un commentaire présent n\'est jamais vide');
  assert.throws(() => db.prepare("INSERT INTO card_comments (id, card_id, user_id, body, created_at, updated_at) VALUES ('m0', 'k', 1, ?, 'x', 'x')").run('a'.repeat(4001)), /CHECK/);
  db.prepare("INSERT INTO card_comments (id, card_id, user_id, body, created_at, updated_at, deleted_at) VALUES ('m1', 'k', 1, '', 'x', 'x', 'x')").run();
  db.prepare("INSERT INTO card_comments (id, card_id, user_id, body, created_at, updated_at) VALUES ('m2', 'k', 1, 'Relu', 'x', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO card_follows VALUES ('k', 1, 2)").run(), /CHECK/);
  db.prepare("INSERT INTO card_follows VALUES ('k', 1, 0)").run();
  db.prepare("DELETE FROM users WHERE id = 1 AND 0").run();
  db.prepare("DELETE FROM cards WHERE id = 'k'").run();
  for (const table of ['card_comments', 'card_follows']) assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, `${table} : effacé avec la carte`);
});

// --- Commentaires : droits ---

test('écrire un commentaire : propriétaire, « Peut modifier », Contributeur sur toutes les cartes ; jamais « Lecture seule » (403) ; non-membre et Admin (404)', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const own = await h.card(p, 'hugo');
  const assigned = await h.card(p, 'lea', { assignees: ['hugo'] });
  const other = await h.card(p, 'lea');
  for (const [who, cardId, status, code] of [
    ['lea', other, 200], ['zoe', other, 200], ['hugo', own, 200], ['hugo', assigned, 200], ['hugo', other, 200],
    ['marc', other, 403, 'ops.projetLectureSeule'], ['paul', other, 404, 'ops.carteIntrouvable'], ['guillaume', other, 404, 'ops.carteIntrouvable'],
  ]) {
    const { res } = await h.comment(who, cardId);
    assert.equal(res.status, status, `${who} : ${JSON.stringify(res)}`);
    if (code) assert.equal(res.code, code, who);
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM card_comments').pluck().get(), 5);
  // Carte d'un autre projet, ou projet donné qui n'est pas le sien : 404
  const q = await h.project('Travaux');
  assert.equal((await h.one('lea', { type: 'comment.create', projectId: q.projectId, cardId: other, commentId: uuid(), text: 'x' })).status, 404);
  // Textes refusés
  for (const text of ['', 'a'.repeat(4001), 'a\u0000b', 12]) {
    const res = await h.one('lea', { type: 'comment.create', cardId: other, commentId: uuid(), text });
    assert.deepEqual([res.status, res.code], [400, 'ops.commentaireInvalide'], JSON.stringify(text));
  }
  // Identifiant déjà pris : 409 ; identifiant invalide : 400
  const { commentId } = await h.comment('zoe', other);
  assert.equal((await h.one('lea', { type: 'comment.create', cardId: other, commentId, text: 'x' })).status, 409);
  assert.equal((await h.one('lea', { type: 'comment.create', cardId: other, commentId: 'abc', text: 'x' })).status, 400);
  // Projets coupés : refus
  h.app.db.prepare('UPDATE users SET projects_enabled = 0 WHERE id = ?').run(h.people.zoe.id);
  assert.deepEqual([(await h.comment('zoe', other)).res.status, (await h.comment('zoe', other)).res.code], [403, 'ops.projetsCoupes']);
  // Le texte n'est jamais dans l'historique ni dans le journal
  const params = h.app.db.prepare("SELECT params FROM card_events WHERE type = 'comment'").pluck().all();
  assert.ok(params.length >= 5 && params.every((value) => value === '{}'), 'historique : « a ajouté un commentaire », sans le texte');
  assert.ok(!h.app.logs.join('\n').includes('portail'), 'jamais le texte d\'un commentaire dans le journal');
});

test('modifier : seulement le sien (le propriétaire ne modifie jamais celui d\'un autre) ; supprimer : le sien, ou celui d\'un autre par le propriétaire (modération) ; texte effacé ; supprimé entre-temps : refus', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'lea');
  const edit = (who, commentId, text = 'Corrigé') => h.one(who, { type: 'comment.update', cardId, commentId, text });
  const remove = (who, commentId) => h.one(who, { type: 'comment.delete', cardId, commentId });
  const hugo = (await h.comment('hugo', cardId)).commentId;
  for (const [who, status, code] of [
    ['lea', 403, 'ops.commentaireSiensSeulement'], ['zoe', 403, 'ops.commentaireSiensSeulement'], ['marc', 403, 'ops.projetLectureSeule'],
    ['paul', 404, 'ops.carteIntrouvable'], ['guillaume', 404, 'ops.carteIntrouvable'],
  ]) {
    const res = await edit(who, hugo);
    assert.deepEqual([res.status, res.code], [status, code], `modifier, ${who}`);
  }
  assert.equal((await edit('hugo', hugo)).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT body, edited FROM card_comments WHERE id = ?').get(hugo), { body: 'Corrigé', edited: 1 });
  for (const [who, status, code] of [
    ['zoe', 403, 'ops.commentaireSiensSeulement'], ['marc', 403, 'ops.projetLectureSeule'], ['paul', 404, 'ops.carteIntrouvable'], ['guillaume', 404, 'ops.carteIntrouvable'],
  ]) {
    const res = await remove(who, hugo);
    assert.deepEqual([res.status, res.code], [status, code], `supprimer, ${who}`);
  }
  // Modération : Léa (propriétaire) supprime le commentaire de Hugo
  assert.equal((await remove('lea', hugo)).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT body, deleted_at IS NOT NULL AS gone FROM card_comments WHERE id = ?').get(hugo), { body: '', gone: 1 }, 'le texte part tout de suite');
  assert.equal((await remove('lea', hugo)).status, 200, 'déjà supprimé : rejouable');
  assert.deepEqual([(await edit('hugo', hugo)).status, (await edit('hugo', hugo)).code], [404, 'ops.commentaireIntrouvable'], 'modifier un commentaire supprimé : refusé');
  // Chacun supprime le sien (Contributeur, « Peut modifier »)
  for (const who of ['hugo', 'zoe']) {
    const { commentId } = await h.comment(who, cardId);
    assert.equal((await remove(who, commentId)).status, 200, who);
  }
  // Un commentaire est cherché dans SA carte : autre carte, 404
  const otherCard = await h.card(p, 'lea');
  const { commentId } = await h.comment('lea', otherCard);
  assert.equal((await edit('lea', commentId)).status, 404);
  assert.equal((await remove('lea', commentId)).status, 404);
  // Lecture seule après coup : plus rien sur le sien
  const mine = (await h.comment('hugo', cardId)).commentId;
  await h.share(p.projectId, { zoe: 'modification', hugo: 'lecture', marc: 'lecture' });
  assert.equal((await edit('hugo', mine)).code, 'ops.projetLectureSeule');
  assert.equal((await remove('hugo', mine)).code, 'ops.projetLectureSeule');
});

test('limites : 500 commentaires par carte ; 120 commentaires par heure et par compte (tout le lot refusé, 429)', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'lea');
  const now = new Date(h.app.clock.now).toISOString();
  const insert = h.app.db.prepare('INSERT INTO card_comments (id, card_id, user_id, body, created_at, updated_at) VALUES (?, ?, 2, ?, ?, ?)');
  for (let i = 0; i < 500; i += 1) insert.run(uuid(), cardId, 'x', now, now);
  const res = await h.one('zoe', { type: 'comment.create', cardId, commentId: uuid(), text: 'Un de trop' });
  assert.deepEqual([res.status, res.code], [400, 'ops.commentairesLimite']);
  const other = await h.card(p, 'lea');
  // (le refus du 501e commentaire a déjà compté pour un)
  for (const size of [60, 59]) {
    const batch = Array.from({ length: size }, () => ({ id: uuid(), type: 'comment.create', cardId: other, commentId: uuid(), text: 'ok' }));
    assert.equal((await h.people.zoe.client.post('/api/ops', { ops: batch })).status, 200);
  }
  const late = await h.people.zoe.client.post('/api/ops', { ops: [{ id: uuid(), type: 'comment.create', cardId: other, commentId: uuid(), text: 'trop' }] });
  assert.equal(late.status, 429);
  // Un lot refusé n'use aucun autre plafond : renvoyé 25 fois (création de
  // projet + commentaire), il ne consomme pas les 20 créations de l'heure
  for (let i = 0; i < 25; i += 1) {
    const mixed = await h.people.zoe.client.post('/api/ops', { ops: [
      { id: uuid(), type: 'project.create', projectId: uuid(), name: 'Essai' },
      { id: uuid(), type: 'comment.create', cardId: other, commentId: uuid(), text: 'trop' },
    ] });
    assert.equal(mixed.status, 429);
  }
  assert.equal((await h.one('zoe', { type: 'project.create', projectId: uuid(), name: 'Seul' })).status, 200);
});

// --- Suivre ---

test('suivre : tous les rôles (Lecture seule compris) ; non-membre et Admin 404 ; propre à chacun (synchronisation), effacé en perdant l\'accès', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'lea');
  for (const [who, status] of [['lea', 200], ['zoe', 200], ['hugo', 200], ['marc', 200], ['paul', 404], ['guillaume', 404]]) {
    const res = await h.one(who, { type: 'card.follow', cardId, following: who !== 'lea' });
    assert.equal(res.status, status, who);
  }
  assert.equal((await h.one('marc', { type: 'card.follow', cardId, following: 'oui' })).status, 400);
  assert.deepEqual((await h.sync('lea')).cardFollows, [[cardId, false]]);
  assert.deepEqual((await h.sync('marc')).cardFollows, [[cardId, true]], 'jamais les choix des autres');
  assert.deepEqual(new Set(h.app.ctx.projects.followerIds(cardId)), new Set([h.people.zoe.id, h.people.hugo.id, h.people.marc.id]),
    'Léa a créé la carte mais a dit « Ne plus suivre »');
  await h.share(p.projectId, { zoe: 'modification', hugo: 'contribution' });
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM card_follows WHERE user_id = ?').pluck().get(h.people.marc.id), 0, 'Marc retiré : ses choix partent');
  // Suivre automatiquement : créée, attribuée, commentée
  const auto = await h.card(p, 'hugo');
  await h.one('lea', { type: 'card.assign', cardId: auto, userIds: [h.people.zoe.id] });
  assert.deepEqual(new Set(h.app.ctx.projects.followerIds(auto)), new Set([h.people.hugo.id, h.people.zoe.id]));
  await h.comment('lea', auto);
  assert.ok(h.app.ctx.projects.followerIds(auto).has(h.people.lea.id), 'commenter fait suivre');
});

// --- Historique ---

test('historique (en ligne) : tous les membres, Lecture seule compris ; non-membre et Admin 404 ; lignes champ par champ, jamais un titre ni un texte', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'hugo');
  await h.ops('lea', [
    { type: 'card.update', cardId, due: { date: '2026-11-28', time: '18:00' } },
    { type: 'card.assign', cardId, userIds: [h.people.hugo.id] },
    { type: 'card.move', cardId, columnId: p.cols[1] },
    { type: 'card.update', cardId, title: 'Nouveau titre secret' },
    { type: 'card.describe', cardId, description: `${SECRET}\n- [ ] Relire`, baseVersion: 1 },
  ]);
  await h.one('hugo', { type: 'card.task', cardId, index: 0, text: 'Relire', checked: true });
  await h.comment('zoe', cardId);
  const url = `/api/projects/${p.projectId}/cards/${cardId}/history`;
  for (const [who, status] of [['lea', 200], ['zoe', 200], ['hugo', 200], ['marc', 200], ['paul', 404], ['guillaume', 404]]) {
    const res = await h.people[who].client.get(url);
    assert.equal(res.status, status, who);
  }
  const { lines } = (await h.people.marc.client.get(url)).body;
  assert.deepEqual(lines.map((l) => l.type), ['comment', 'task', 'describe', 'rename', 'move', 'assign', 'due', 'create']);
  assert.deepEqual(lines.find((l) => l.type === 'move').params, { from: 'À faire', to: 'En cours' });
  assert.deepEqual(lines.find((l) => l.type === 'assign').params, { person: { name: 'Hugo', me: false } });
  assert.deepEqual(lines.find((l) => l.type === 'due').params, { date: '2026-11-28', time: '18:00' });
  assert.deepEqual(lines.find((l) => l.type === 'task').params, { text: 'Relire', checked: true });
  assert.deepEqual(Object.keys(lines[0]).sort(), ['actorName', 'ai', 'at', 'byMe', 'id', 'params', 'type']);
  const text = JSON.stringify(lines);
  for (const secret of ['secret', 'portail', TITLE]) assert.ok(!text.includes(secret), secret);
  assert.ok(!/"user_?id"|"userId"/.test(text), 'jamais un numéro de compte');
  // Carte d'un autre projet, identifiant mal formé : 404 / 400
  const q = await h.project('Travaux');
  assert.equal((await h.people.lea.client.get(`/api/projects/${q.projectId}/cards/${cardId}/history`)).status, 404);
  assert.equal((await h.people.lea.client.get(`/api/projects/${p.projectId}/cards/abc/history`)).status, 400);
  // Projets coupés : 403
  h.app.db.prepare('UPDATE users SET projects_enabled = 0 WHERE id = ?').run(h.people.zoe.id);
  assert.equal((await h.people.zoe.client.get(url)).status, 403);
});

// --- Synchronisation et Nouveautés ---

test('synchronisation : commentaires champ par champ pour tous les membres (texte vide une fois supprimé, jamais un numéro de compte) ; point des nouveautés par carte', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'lea');
  const quiet = await h.card(p, 'lea');
  await h.one('marc', { type: 'project.seen', projectId: p.projectId, upTo: 1e9 });
  const { commentId } = await h.comment('hugo', cardId);
  const synced = await h.sync('marc');
  const comment = synced.comments.find((c) => c.id === commentId);
  assert.deepEqual(Object.keys(comment).sort(), ['authorName', 'byMe', 'cardId', 'createdAt', 'deletedAt', 'edited', 'id', 'importedAt', 'importedAuthor', 'importedByName', 'projectId', 'text', 'updatedAt']);
  assert.deepEqual([comment.authorName, comment.byMe, comment.text], ['Hugo', false, SECRET]);
  assert.equal((await h.sync('hugo')).comments.find((c) => c.id === commentId).byMe, true);
  assert.deepEqual((await h.sync('paul')).comments, []);
  assert.deepEqual(synced.projectMine[p.projectId].newCards, [cardId], 'seule la carte commentée par un autre a un point');
  assert.ok(!synced.projectMine[p.projectId].newCards.includes(quiet));
  // Incrémentale : seulement ce qui a changé ; supprimé, texte vide
  const since = new Date(h.app.clock.now).toISOString();
  h.app.clock.now += 1000;
  await h.one('hugo', { type: 'comment.delete', cardId, commentId });
  const later = (await h.people.marc.client.get(`/api/sync?since=${encodeURIComponent(since)}`)).body;
  assert.deepEqual(later.comments.map((c) => [c.id, c.text, Boolean(c.deletedAt)]), [[commentId, '', true]]);
  // Vu : plus de point
  await h.one('marc', { type: 'project.seen', projectId: p.projectId, upTo: 1e9 });
  assert.deepEqual((await h.sync('marc')).projectMine[p.projectId].newCards, []);
  // Ménage : un commentaire supprimé depuis plus de 30 jours part
  h.app.clock.now += 31 * 24 * 60 * 60 * 1000;
  h.app.ctx.projects.purgeDeleted();
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM card_comments WHERE id = ?').pluck().get(commentId), 0);
});

// --- Notifications ---

test('nouvelles cartes : une ligne par projet et par personne, regroupée (« Léa a ajouté 3 cartes ») ; jamais à l\'auteur ; sourdine ; projets coupés ; déjà vu', async (t) => {
  const h = await household(t);
  const p = await h.project();
  h.app.db.prepare('UPDATE users SET projects_enabled = 0 WHERE id = ?').run(h.people.marc.id);
  await h.one('zoe', { type: 'project.state', projectId: p.projectId, mutedPush: true });
  for (let i = 0; i < 3; i += 1) await h.card(p, 'lea');
  await h.tick();
  const rows = await h.inbox('hugo');
  assert.deepEqual(rows.map((r) => [r.text, r.sub, r.targetType]), [['Léa a ajouté 3 cartes dans « DomoPi Articles »', 'Modifications', 'project']]);
  assert.deepEqual(rows[0].target, { type: 'project', projectId: p.projectId });
  for (const who of ['lea', 'zoe', 'marc', 'paul', 'guillaume']) assert.deepEqual(await h.inbox(who), [], who);
  // Une autre carte dans le quart d'heure : la même ligne se met à jour
  await h.card(p, 'lea');
  await h.tick(NOTE_QUIET_MS);
  assert.deepEqual((await h.inbox('hugo')).map((r) => [r.text, r.count]), [['Léa a ajouté 4 cartes dans « DomoPi Articles »', 2]]);
  // Déjà vu (projet ouvert) : rien
  await h.card(p, 'lea');
  await h.one('hugo', { type: 'project.seen', projectId: p.projectId, upTo: 1e9 });
  await h.tick(NOTE_QUIET_MS);
  assert.equal((await h.inbox('hugo'))[0].count, 2);
  // Rien du titre en base
  assert.ok(!h.app.db.prepare('SELECT params FROM inbox').pluck().all().join('').includes('2FAuth'));
});

test('attribution, commentaires et modifications d\'une carte suivie ; « Ne plus suivre » ; jamais l\'auteur ; titre relu à l\'affichage, jamais le texte d\'un commentaire en base', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'lea');
  await h.tick(NOTE_QUIET_MS); // nouvelles cartes : parties, puis effacées
  for (const who of ['lea', 'zoe', 'hugo', 'marc']) {
    await h.people[who].client.request('DELETE', '/api/inbox');
    await h.one(who, { type: 'project.seen', projectId: p.projectId, upTo: 1e9 });
  }
  // Léa attribue à Hugo
  await h.one('lea', { type: 'card.assign', cardId, userIds: [h.people.hugo.id] });
  await h.tick(NOTE_QUIET_MS);
  assert.deepEqual((await h.inbox('hugo')).map((r) => [r.text, r.target]), [[`Léa vous a attribué « ${TITLE} »`, { type: 'card', projectId: p.projectId, cardId }]]);
  // Hugo commente deux fois : Léa (créatrice) est prévenue, une seule ligne
  await h.comment('hugo', cardId);
  await h.comment('hugo', cardId, 'Deuxième');
  // Zoé suit la carte ; Marc ne la suit pas
  await h.one('zoe', { type: 'card.follow', cardId, following: true });
  await h.tick(NOTE_QUIET_MS);
  assert.deepEqual((await h.inbox('lea')).map((r) => [r.text, r.sub, r.kind]), [[`Hugo a ajouté 2 commentaires sur « ${TITLE} »`, 'Modifications · DomoPi Articles', 'comment']]);
  assert.deepEqual(await h.inbox('marc'), [], 'Marc ne suit pas la carte');
  assert.equal((await h.inbox('hugo')).length, 1, 'jamais l\'auteur');
  assert.equal((await h.inbox('zoe')).length, 0, 'Zoé s\'est mise à suivre après les commentaires');
  // Déplacée par Hugo : Léa et Zoé (qui suivent)
  await h.one('hugo', { type: 'card.move', cardId, columnId: p.cols[1] });
  await h.tick(NOTE_QUIET_MS);
  assert.equal((await h.inbox('zoe'))[0].text, `Hugo a déplacé « ${TITLE} » vers « En cours »`);
  // « Ne plus suivre » : plus rien, même pour la créatrice qui commente ensuite
  const before = (await h.inbox('lea')).length;
  await h.one('lea', { type: 'card.follow', cardId, following: false });
  await h.comment('lea', cardId);
  await h.one('hugo', { type: 'card.update', cardId, due: { date: '2026-11-28' } });
  await h.tick(NOTE_QUIET_MS);
  assert.equal((await h.inbox('lea')).length, before, 'Léa ne suit plus la carte');
  assert.ok((await h.inbox('zoe')).some((r) => r.text === `Hugo a modifié « ${TITLE} »`));
  // Base : jamais le titre ni le texte d'un commentaire
  const stored = h.app.db.prepare('SELECT params || text_key || COALESCE(group_key, \'\') FROM inbox').pluck().all().join('\n');
  for (const secret of ['2FAuth', 'portail', 'Deuxième']) assert.ok(!stored.includes(secret), secret);
  // Carte supprimée : la ligne reste, sans titre, et n'ouvre plus rien
  await h.one('lea', { type: 'card.delete', cardId });
  const gone = (await h.inbox('zoe')).filter((r) => r.targetType === 'card');
  assert.deepEqual(gone.map((r) => [r.text, r.target]).sort(), [['Hugo a modifié une carte', null], ['Léa a commenté une carte', null]]);
});

test('partage : remis même projets coupés, avec l\'invitation à les allumer (la ligne ouvre Réglages › Fonctions) ; rien d\'autre tant qu\'ils sont coupés', async (t) => {
  const h = await household(t, { push: true });
  const p = await h.project();
  h.app.db.prepare('UPDATE users SET projects_enabled = 0 WHERE id = ?').run(h.people.paul.id);
  await h.share(p.projectId, { zoe: 'modification', hugo: 'contribution', marc: 'lecture', paul: 'contribution' });
  await h.app.ctx.push.idle();
  const rows = await h.inbox('paul', { all: true });
  assert.deepEqual(rows.map((r) => [r.text, r.sub, r.target]), [['Léa a partagé le projet « DomoPi Articles » avec vous', 'Allumez « Projets » dans Réglages › Fonctions pour le voir.', { type: 'features' }]]);
  assert.deepEqual(h.pushes('paul').map((n) => [n.title, n.body]), [['Léa a partagé le projet « DomoPi Articles » avec vous', 'Allumez « Projets » dans Réglages › Fonctions pour le voir.']]);
  assert.ok(h.pushes('paul')[0].navigate.endsWith('/#/reglages/fonctions'));
  // Zoé, Hugo et Marc ont été prévenus à leur ajout (droit écrit)
  assert.deepEqual(h.pushes('hugo').map((n) => n.body), ['Vous pouvez ajouter des cartes et commenter.']);
  assert.deepEqual(h.pushes('lea'), [], 'jamais l\'auteur');
  // Projets coupés : ni nouvelles cartes, ni rien d'autre
  await h.card(p, 'lea');
  await h.tick();
  assert.equal((await h.inbox('paul', { all: true })).length, 1);
  assert.equal(h.pushes('paul').length, 1);
  // Des lignes reçues avant de couper les projets ne sont plus envoyées du
  // tout (ni titre de carte ni nom de projet) : seule la ligne « Partage » reste
  await h.card(p, 'lea', { assignees: ['hugo'] });
  await h.tick();
  assert.ok((await h.inbox('hugo')).some((r) => ['card', 'project'].includes(r.targetType)), 'Hugo a des lignes de carte');
  h.app.db.prepare('UPDATE users SET projects_enabled = 0 WHERE id = ?').run(h.people.hugo.id);
  const hidden = (await h.people.hugo.client.get('/api/inbox')).body.rows;
  assert.deepEqual(hidden.map((r) => [r.category, r.target]), [['sharing', { type: 'features' }]]);
  assert.ok(!JSON.stringify(hidden).includes(TITLE), 'jamais le titre d\'une carte');
  h.app.db.prepare('UPDATE users SET projects_enabled = 1 WHERE id = ?').run(h.people.hugo.id);
  // Rallumés : la ligne ouvre le projet
  h.app.db.prepare('UPDATE users SET projects_enabled = 1 WHERE id = ?').run(h.people.paul.id);
  assert.deepEqual((await h.inbox('paul', { all: true })).at(-1).target, { type: 'project', projectId: p.projectId });
  // Téléphone : nouvelles cartes, sans nommer la carte (pas de détail)
  const push = h.pushes('hugo').at(-1);
  assert.deepEqual([push.title, push.body ?? ''], ['Léa a ajouté 1 carte dans « DomoPi Articles »', '']);
});

test('rappels : remis une fois par signature par deliver (page et téléphone), aux personnes attribuées ; jamais pour une carte faite ; catégorie « Échéances » coupée ; sourdine', async (t) => {
  const h = await household(t, { push: true });
  const p = await h.project();
  const local = (ms) => {
    const d = new Date(ms);
    const two = (n) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
  };
  const at = local(h.app.clock.now + 60 * 60 * 1000);
  const assigned = await h.card(p, 'lea', { assignees: ['hugo', 'zoe'] });
  const done = await h.card(p, 'lea', { assignees: ['hugo'] });
  await h.ops('lea', [
    { type: 'card.update', cardId: assigned, due: { ...at, remindBefore: 60 } },
    { type: 'card.update', cardId: done, due: { ...at, remindBefore: 60 } },
    { type: 'card.done', cardId: done, done: true },
  ]);
  await h.people.zoe.client.request('PUT', '/api/push/settings', { due: false });
  await h.app.ctx.notify.runReminders();
  await h.app.ctx.push.idle();
  const reminders = (await h.inbox('hugo')).filter((r) => r.kind === 'reminder');
  assert.deepEqual(reminders.map((r) => [r.text, r.sub, r.target?.cardId]), [[`${TITLE} à ${at.time}`, 'Rappel · DomoPi Articles', assigned]]);
  assert.deepEqual(h.pushes('hugo').filter((n) => n.title.startsWith('Rappel')).map((n) => [n.title, n.body]), [[`Rappel : une carte aujourd'hui à ${at.time}`, 'Dans « DomoPi Articles »']]);
  assert.equal((await h.inbox('zoe')).filter((r) => r.kind === 'reminder').length, 0, '« Échéances » coupée');
  assert.equal((await h.inbox('lea')).filter((r) => r.kind === 'reminder').length, 0, 'attribuée à d\'autres');
  // Une seule fois par signature
  h.app.clock.now += 60 * 1000;
  await h.app.ctx.notify.runReminders();
  assert.equal((await h.inbox('hugo')).filter((r) => r.kind === 'reminder').length, 1);
  assert.ok(!h.app.db.prepare('SELECT params FROM inbox').pluck().all().join('').includes('2FAuth'));
});

test('liste d\'envies : rien ne change pour la page Notifications du bénéficiaire avec les projets (cibles nouvelles, filtre inchangé)', async (t) => {
  const h = await household(t);
  const p = await h.project();
  await h.card(p, 'lea');
  await h.tick();
  // Les lignes des projets n'apparaissent qu'aux membres
  assert.deepEqual(await h.inbox('paul'), []);
  assert.equal((await h.inbox('marc')).length, 1);
});
