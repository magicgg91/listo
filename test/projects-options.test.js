// Projets : option « Échéances » d'un projet et menus ⋮ alignés (décisions
// du propriétaire du 25 novembre 2026, après l'essai ; migration 46).
//
// Points sensibles vérifiés :
// - l'option, comme « Priorité » mais allumée au départ (projets existants
//   compris), changée par le propriétaire et « Peut modifier » (refusée au
//   Contributeur et en « Lecture seule » : 403 ; non-membre et Admin non
//   membre : 404), « Priorité » et le nom restant au propriétaire ; copiée
//   par « Dupliquer le projet » ; synchronisée champ par champ ; copie
//   locale du téléphone (mêmes droits, file d'attente) ;
// - option coupée : échéance et « Fait » refusés par le serveur (400 nommé)
//   et par la copie locale, rien d'effacé (tout revient quand on la
//   rallume) ; cartes ignorées comme cartes datées partout (écran
//   Échéances, pastilles, tuile, résumé du matin, « cartes pour vous »,
//   tuile Projets de l'Accueil, rappels) ; « Afficher dans Échéances »
//   absent du menu (la valeur de chacun est gardée) ;
// - menus ⋮ : les mêmes entrées, dans le même ordre, sur l'écran « Projets »
//   et dans le projet, pour chaque rôle (seule différence : « Ouvrir »).
//
// Foyer : Léa (propriétaire), Zoé (« Peut modifier »), Hugo (Contributeur),
// Marc (« Lecture seule »), Paul (n'a rien), Guillaume (Admin, n'a rien).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, tempDir, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { localDay } from '../server/notify.js';
import { emptyState, loadSync, applyOp } from '../public/js/store.js';
import { computeDeadlines, deadlineBadges, deadlineCounts, deadlineProjects, scopeOffered } from '../public/js/deadlines.js';
import { projectRights, deadlinesOn, cardDated, cardDone } from '../public/js/projects.js';
import { cardDueState, myCards, myCardCounts, urgentCards, projectMenuEntries } from '../public/js/project-view.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const uuid = () => crypto.randomUUID();
const PEOPLE = [['lea', 'Léa'], ['zoe', 'Zoé'], ['hugo', 'Hugo'], ['marc', 'Marc'], ['paul', 'Paul']];
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

async function household(t) {
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
  app.db.prepare('UPDATE users SET projects_enabled = 1').run();
  // Le jour : demain à 8 h 30 (heure de la machine), pour le résumé du matin
  const at = new Date(app.clock.now);
  at.setDate(at.getDate() + 1);
  at.setHours(8, 30, 0, 0);
  app.clock.now = at.getTime();
  const today = localDay(at);
  const dayAt = (n) => localDay(new Date(at.getFullYear(), at.getMonth(), at.getDate() + n));
  const ops = async (who, list) => {
    const res = await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
    assert.equal(res.status, 200, res.text);
    return res.body.results;
  };
  const one = async (who, op) => (await ops(who, [op]))[0];
  const sync = async (who) => (await people[who].client.get('/api/sync')).body;
  const local = async (who) => loadSync(emptyState(), await sync(who));
  const share = (projectId, access) => people.lea.client.request('PUT', `/api/projects/${projectId}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  async function project(name = 'DomoPi Articles') {
    const projectId = uuid();
    assert.equal((await one('lea', { type: 'project.create', projectId, name })).status, 200);
    assert.equal((await share(projectId, { zoe: 'modification', hugo: 'contribution', marc: 'lecture' })).status, 200);
    const col = app.db.prepare('SELECT id FROM project_columns WHERE project_id = ? ORDER BY position').pluck().get(projectId);
    return { projectId, col };
  }
  async function card(p, { who = 'lea', title = 'Carte', due = null, assignees = [], done = false } = {}) {
    const cardId = uuid();
    assert.equal((await one(who, { type: 'card.create', projectId: p.projectId, cardId, columnId: p.col, title })).status, 200);
    if (due) assert.equal((await one('lea', { type: 'card.update', cardId, due })).status, 200);
    if (assignees.length) assert.equal((await one('lea', { type: 'card.assign', cardId, userIds: assignees.map((k) => people[k].id) })).status, 200);
    if (done) assert.equal((await one('lea', { type: 'card.done', cardId, done: true })).status, 200);
    return cardId;
  }
  const option = (p) => app.db.prepare('SELECT deadlines_enabled FROM projects WHERE id = ?').pluck().get(p.projectId);
  const digest = async (who) => {
    await app.ctx.notify.runDigest();
    return (await people[who].client.get('/api/inbox')).body.rows.find((r) => r.kind === 'digest') ?? null;
  };
  return { app, people, ops, one, sync, local, share, project, card, option, digest, today, dayAt };
}

// --- Migration 46 ---

test('migration 46 : projects.deadlines_enabled, allumée au départ (projets existants compris), 0 ou 1 seulement ; une base 45 migre sans rien changer', (t) => {
  assert.equal(MIGRATIONS.length, 46);
  const fresh = openDatabase(':memory:');
  assert.equal(schemaVersion(fresh), 46);
  const column = fresh.prepare('PRAGMA table_info(projects)').all().find((c) => c.name === 'deadlines_enabled');
  assert.deepEqual([column.notnull, column.dflt_value], [1, '1']);
  const file = path.join(tempDir(t), 'old.db');
  const old = databaseAt(file, 45);
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('anne', 'Anne', 'x')").run();
  old.prepare("INSERT INTO projects (id, owner_id, name, priority_enabled, created_at, updated_at, changed_at) VALUES ('p', 1, 'P', 1, 'x', 'x', 'x')").run();
  old.prepare("INSERT INTO project_columns VALUES ('c', 'p', 'C', 'c', 'gris', 1, 'x', 'x')").run();
  old.prepare("INSERT INTO cards (id, project_id, column_id, position, title, created_by, created_at, updated_at, due_date, due_done) VALUES ('k', 'p', 'c', 1, 'T', 1, 'x', 'x', '2026-11-28', 1)").run();
  old.close();
  const db = openDatabase(file);
  assert.equal(schemaVersion(db), 46);
  assert.deepEqual({ ...db.prepare('SELECT name, priority_enabled, deadlines_enabled FROM projects').get() }, { name: 'P', priority_enabled: 1, deadlines_enabled: 1 }, 'un projet d\'avant : option allumée, le reste inchangé');
  assert.deepEqual({ ...db.prepare('SELECT due_date, due_done FROM cards').get() }, { due_date: '2026-11-28', due_done: 1 });
  for (const bad of [2, -1, null]) assert.throws(() => db.prepare('UPDATE projects SET deadlines_enabled = ?').run(bad), /constraint/i, String(bad));
  db.close();
});

// --- Qui change l'option ---

test('option « Échéances » : propriétaire et « Peut modifier » ; Contributeur et Lecture seule refusés (403 nommé) ; non-membre et Admin non membre : 404 ; « Priorité » et le nom restent au propriétaire ; tout ou rien', async (t) => {
  const h = await household(t);
  const p = await h.project();
  assert.equal(h.option(p), 1, 'allumée au départ');
  for (const [who, status, code] of [
    ['hugo', 403, 'ops.echeancesProjetModifierSeulement'], ['marc', 403, 'ops.projetLectureSeule'],
    ['paul', 404, 'ops.projetIntrouvable'], ['guillaume', 404, 'ops.projetIntrouvable'],
  ]) {
    const res = await h.one(who, { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false });
    assert.deepEqual([res.status, res.code], [status, code], who);
    assert.equal(h.option(p), 1, `${who} : rien d'écrit`);
  }
  assert.equal(fr['ops.echeancesProjetModifierSeulement'].includes('Échéances'), true);
  assert.equal((await h.one('zoe', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false })).status, 200);
  assert.equal(h.option(p), 0);
  assert.equal((await h.one('lea', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: true })).status, 200);
  assert.equal(h.option(p), 1);
  // « Peut modifier » : ni la priorité, ni le nom ; une opération mêlée est refusée entière
  for (const op of [{ priorityEnabled: true }, { name: 'Autre' }, { deadlinesEnabled: false, priorityEnabled: true }]) {
    const res = await h.one('zoe', { type: 'project.update', projectId: p.projectId, ...op });
    assert.deepEqual([res.status, res.code], [403, 'ops.projetProprietaireSeulement'], JSON.stringify(op));
  }
  assert.deepEqual({ ...h.app.db.prepare('SELECT name, priority_enabled, deadlines_enabled FROM projects WHERE id = ?').get(p.projectId) },
    { name: 'DomoPi Articles', priority_enabled: 0, deadlines_enabled: 1 }, 'rien d\'écrit');
  // Valeur invalide : 400 nommé
  const bad = await h.one('lea', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: 'non' });
  assert.deepEqual([bad.status, bad.code], [400, 'ops.echeancesProjetInvalide']);
  // Synchronisation : le champ, construit champ par champ, pour chaque membre
  for (const who of ['lea', 'zoe', 'hugo', 'marc']) {
    const project = (await h.sync(who)).projects.find((x) => x.id === p.projectId);
    assert.equal(project.deadlinesEnabled, true, who);
  }
  assert.equal((await h.sync('paul')).projects.some((x) => x.id === p.projectId), false);
});

test('dupliquer le projet copie l\'option « Échéances » (comme « Priorité ») ; un nouveau projet l\'a allumée', async (t) => {
  const h = await household(t);
  const p = await h.project();
  assert.equal((await h.one('lea', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false, priorityEnabled: true })).status, 200);
  const copy = uuid();
  assert.equal((await h.one('marc', { type: 'project.duplicate', projectId: p.projectId, newProjectId: copy })).status, 200, 'tout membre, Lecture seule compris');
  assert.deepEqual({ ...h.app.db.prepare('SELECT owner_id, priority_enabled, deadlines_enabled FROM projects WHERE id = ?').get(copy) },
    { owner_id: h.people.marc.id, priority_enabled: 1, deadlines_enabled: 0 });
  // Copie locale : la même chose, hors ligne
  const state = await h.local('marc');
  applyOp(state, { type: 'project.duplicate', projectId: p.projectId, newProjectId: 'copie-locale', name: 'Copie', columnIds: {}, labelIds: {} }, { user: { id: h.people.marc.id, displayName: 'Marc' }, now: 'x' });
  assert.equal(state.projects.get('copie-locale').deadlinesEnabled, false);
  applyOp(state, { type: 'project.create', projectId: 'neuf', name: 'Neuf', columns: [{ columnId: 'c', name: 'A' }] }, { user: { id: h.people.marc.id, displayName: 'Marc' }, now: 'x' });
  assert.equal(state.projects.get('neuf').deadlinesEnabled, true);
  const fresh = await h.project('Neuf');
  assert.equal(h.option(fresh), 1);
});

// --- Option coupée : refus, rien d'effacé ---

test('option coupée : échéance (card.update due) et « Fait » (card.done) refusés 400 pour chaque rôle qui peut modifier la carte ; titre toujours permis ; rien d\'effacé ; rallumée, tout revient', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const at = { date: '2026-11-28', time: '18:00', remindBefore: 60 };
  const cards = {
    lea: await h.card(p, { due: at, done: true }),
    own: await h.card(p, { who: 'hugo', due: at }),
    assigned: await h.card(p, { due: at, assignees: ['hugo'] }),
    other: await h.card(p, { due: at }),
  };
  assert.equal((await h.one('lea', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false })).status, 200);
  const before = JSON.stringify(h.app.db.prepare('SELECT id, due_date, due_time, remind_before, due_done, due_done_at FROM cards ORDER BY id').all());
  for (const [who, kind, status, code] of [
    ['lea', 'lea', 400, 'ops.echeancesProjetCoupees'], ['zoe', 'other', 400, 'ops.echeancesProjetCoupees'],
    ['hugo', 'own', 400, 'ops.echeancesProjetCoupees'], ['hugo', 'assigned', 400, 'ops.echeancesProjetCoupees'],
    ['hugo', 'other', 403, 'ops.carteModifierSiennes'], ['marc', 'other', 403, 'ops.projetLectureSeule'],
    ['paul', 'other', 404, 'ops.carteIntrouvable'], ['guillaume', 'other', 404, 'ops.carteIntrouvable'],
  ]) {
    for (const op of [{ type: 'card.update', due: { date: '2026-12-01' } }, { type: 'card.update', due: null }, { type: 'card.done', done: false }, { type: 'card.done', done: true }]) {
      const res = await h.one(who, { ...op, projectId: p.projectId, cardId: cards[kind] });
      assert.deepEqual([res.status, res.code], [status, code], `${who} / ${kind} / ${JSON.stringify(op)}`);
    }
  }
  assert.equal(fr['ops.echeancesProjetCoupees'].includes('réglages du projet'), true);
  assert.ok(en['ops.echeancesProjetCoupees']);
  assert.equal(JSON.stringify(h.app.db.prepare('SELECT id, due_date, due_time, remind_before, due_done, due_done_at FROM cards ORDER BY id').all()), before, 'rien d\'effacé, rien d\'écrit');
  // Le reste de la carte se modifie toujours
  assert.equal((await h.one('hugo', { type: 'card.update', cardId: cards.assigned, title: 'Renommée' })).status, 200);
  // Rallumée : tout revient, et se modifie de nouveau
  assert.equal((await h.one('zoe', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: true })).status, 200);
  const synced = (await h.sync('hugo')).cards.find((c) => c.id === cards.lea);
  assert.deepEqual([synced.dueDate, synced.dueTime, synced.remindBefore, synced.done], ['2026-11-28', '18:00', 60, true]);
  assert.equal((await h.one('hugo', { type: 'card.done', cardId: cards.assigned, done: true })).status, 200);
});

test('copie locale (hors ligne) : mêmes droits sur l\'option que le serveur ; option coupée, échéance et « Fait » ne changent rien', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, { who: 'hugo', due: { date: '2026-11-28' } });
  const users = Object.fromEntries(Object.entries(h.people).map(([k, v]) => [k, { id: v.id, displayName: k }]));
  // Qui peut changer l'option sur son téléphone
  for (const [who, allowed] of [['lea', true], ['zoe', true], ['hugo', false], ['marc', false]]) {
    const state = await h.local(who);
    applyOp(state, { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false }, { user: users[who], now: 'x' });
    assert.equal(state.projects.get(p.projectId).deadlinesEnabled, !allowed, who);
    applyOp(state, { type: 'project.update', projectId: p.projectId, priorityEnabled: true }, { user: users[who], now: 'x' });
    assert.equal(state.projects.get(p.projectId).priorityEnabled, who === 'lea', `${who} : priorité`);
  }
  // Option coupée : la copie locale refuse comme le serveur
  assert.equal((await h.one('lea', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false })).status, 200);
  const state = await h.local('hugo');
  assert.equal(state.projects.get(p.projectId).deadlinesEnabled, false);
  applyOp(state, { type: 'card.update', cardId, due: { date: '2026-12-24' } }, { user: users.hugo, now: 'x' });
  applyOp(state, { type: 'card.update', cardId, due: null }, { user: users.hugo, now: 'x' });
  applyOp(state, { type: 'card.done', cardId, done: true }, { user: users.hugo, now: 'x' });
  const card = state.cards.get(cardId);
  assert.deepEqual([card.dueDate, card.done], ['2026-11-28', false]);
  applyOp(state, { type: 'card.update', cardId, title: 'Titre changé' }, { user: users.hugo, now: 'x' });
  assert.equal(state.cards.get(cardId).title, 'Titre changé');
});

// --- Option coupée : jamais comptée comme carte datée ---

test('option coupée : ni dans Échéances, ni dans les pastilles, la tuile ou le résumé du matin ; « cartes pour vous » sans retard, cartes faites comptées ; « Afficher dans Échéances » gardé', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const late = await h.card(p, { title: 'En retard (Zoé)', due: { date: h.dayAt(-2) }, assignees: ['zoe'] });
  await h.card(p, { title: 'Du jour (personne)', due: { date: h.today } });
  await h.card(p, { title: 'Faite (Zoé)', due: { date: h.dayAt(-1) }, assignees: ['zoe'], done: true });
  await h.card(p, { title: 'Sans date (Zoé)', assignees: ['zoe'] });
  assert.equal((await h.one('zoe', { type: 'project.state', projectId: p.projectId, inDeadlines: true })).status, 200);
  const me = h.people.zoe.id;
  const options = { today: h.today, me, now: '08:30' };
  // Allumée (comme avant)
  let state = await h.local('zoe');
  assert.equal(deadlineProjects(state).size, 1);
  assert.deepEqual(deadlineBadges(state, h.today, me, '08:30'), { late: 1, today: 1 });
  assert.deepEqual(deadlineCounts(state, options), { late: 1, today: 1, later: 0 });
  assert.deepEqual(myCardCounts(state, me, p.projectId, h.today, '08:30'), { count: 2, late: 1 });
  assert.equal(urgentCards(state, me, h.today, '08:30')[0].id, late);
  assert.match((await h.digest('zoe')).text.replace(/ /g, ' '), /1 échéance aujourd'hui · 1 en retard/);
  assert.ok(projectMenuEntries(state.projects.get(p.projectId), { inside: true }).includes('deadlines'));
  // Coupée par Léa
  assert.equal((await h.one('lea', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false })).status, 200);
  state = await h.local('zoe');
  const project = state.projects.get(p.projectId);
  assert.equal(deadlinesOn(project), false);
  assert.equal(deadlineProjects(state).size, 0);
  assert.deepEqual(computeDeadlines(state, options), []);
  assert.deepEqual(computeDeadlines(state, { ...options, mine: true }), []);
  assert.deepEqual(deadlineBadges(state, h.today, me, '08:30'), { late: 0, today: 0 });
  assert.deepEqual(deadlineCounts(state, options), { late: 0, today: 0, later: 0 });
  assert.equal(scopeOffered(state), false, 'plus de choix « Toutes / Les miennes » pour ce projet seul');
  // Résumé du matin : plus aucune carte (ni ligne, s'il ne reste rien)
  h.app.db.prepare("DELETE FROM inbox WHERE text_key = 'digest'").run();
  h.app.db.prepare('DELETE FROM push_digests').run();
  assert.equal(await h.digest('zoe'), null);
  // « Cartes pour vous » : les trois cartes à Zoé, sans retard ; la faite
  // compte (la carte se lit sans échéance)
  assert.deepEqual(myCardCounts(state, me, p.projectId, h.today, '08:30'), { count: 3, late: 0 });
  assert.equal(myCards(state, me).length, 3);
  for (const card of urgentCards(state, me, h.today, '08:30')) assert.equal(cardDueState(card, h.today, '08:30', project), null);
  for (const card of state.cards.values()) {
    assert.equal(cardDated(card, project), false);
    assert.equal(cardDone(card, project), false);
  }
  // Menu ⋮ : plus d'« Afficher dans Échéances » ; mon choix est gardé
  for (const inside of [true, false]) assert.equal(projectMenuEntries(project, { inside }).includes('deadlines'), false);
  assert.equal(state.projectMine[p.projectId].inDeadlines, true);
  assert.equal(h.app.db.prepare('SELECT in_deadlines FROM project_user_state WHERE project_id = ? AND user_id = ?').pluck().get(p.projectId, me), 1);
  // Rallumée : tout revient
  assert.equal((await h.one('zoe', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: true })).status, 200);
  state = await h.local('zoe');
  assert.deepEqual(deadlineBadges(state, h.today, me, '08:30'), { late: 1, today: 1 });
  assert.deepEqual(myCardCounts(state, me, p.projectId, h.today, '08:30'), { count: 2, late: 1 });
});

test('option coupée : aucun rappel de carte ; rallumée, le rappel est remis', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const local = (ms) => {
    const d = new Date(ms);
    const two = (n) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
  };
  const cardId = await h.card(p, { due: { ...local(h.app.clock.now + 60 * 60 * 1000), remindBefore: 60 }, assignees: ['hugo'] });
  assert.equal((await h.one('zoe', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: false })).status, 200);
  const take = () => h.app.ctx.projects.takeCardReminders(h.app.clock.now).map((r) => [r.cardId, r.userId]);
  assert.deepEqual(take(), [], 'option coupée : rien');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM card_reminders').pluck().get(), 0, 'rien de noté non plus');
  assert.equal((await h.one('zoe', { type: 'project.update', projectId: p.projectId, deadlinesEnabled: true })).status, 200);
  assert.deepEqual(take(), [[cardId, h.people.hugo.id]]);
});

// --- Menus ⋮ alignés ---

test('menus ⋮ d\'un projet : les mêmes entrées, dans le même ordre, sur l\'écran « Projets » et dans le projet, pour chaque rôle (seule différence : « Ouvrir »)', () => {
  const members = [{ id: 1 }, { id: 2 }];
  const expected = {
    owner: ['share', 'settings', 'duplicate', 'cardTrash', 'push', 'news', 'deadlines', 'delete'],
    editor: ['people', 'settings', 'duplicate', 'cardTrash', 'push', 'news', 'deadlines', 'leave'],
    contributor: ['people', 'duplicate', 'cardTrash', 'push', 'news', 'deadlines', 'leave'],
    reader: ['people', 'duplicate', 'cardTrash', 'push', 'news', 'deadlines', 'leave'],
  };
  for (const [role, entries] of Object.entries(expected)) {
    const project = { id: 'p', role, members, deadlinesEnabled: true };
    assert.deepEqual(projectMenuEntries(project, { inside: true }), entries, role);
    assert.deepEqual(projectMenuEntries(project, { inside: false }), ['open', ...entries], role);
    // « Réglages du projet » : exactement qui a l'écran des réglages
    assert.equal(entries.includes('settings'), projectRights(role).settings, role);
    // Non partagé : sans « Masquer les nouveautés » ; option coupée : sans « Afficher dans Échéances »
    assert.deepEqual(projectMenuEntries({ ...project, members: [{ id: 1 }] }, { inside: true }), entries.filter((e) => e !== 'news'), role);
    assert.deepEqual(projectMenuEntries({ ...project, deadlinesEnabled: false }, { inside: false }), ['open', ...entries.filter((e) => e !== 'deadlines')], role);
  }
  assert.deepEqual(projectMenuEntries({ id: 'p', role: null, members }), [], 'non-membre : rien');
  // L'écran s'en sert pour les deux menus (une seule liste)
  const screen = read('public/js/screens/projects.js');
  assert.match(screen, /return projectMenuEntries\(project, \{ inside \}\)\.map\(\(entry\) => items\[entry\]\(\)\);/);
  for (const key of ['open', 'share', 'people', 'settings', 'duplicate', 'cardTrash', 'push', 'news', 'deadlines', 'delete', 'leave']) assert.match(screen, new RegExp(`\\n    ${key}: \\(\\) => \\(`), key);
  assert.match(read('public/js/screens/project.js'), /projectMenuItems\(p, \{ inside: true,/);
});

// --- Droits et écrans ---

test('règles partagées : deadlines pour le propriétaire et « Peut modifier » ; une copie d\'avant la migration (sans le champ) vaut « allumée »', () => {
  assert.deepEqual(['owner', 'editor', 'contributor', 'reader', null].map((role) => projectRights(role).deadlines), [true, true, false, false, false]);
  assert.deepEqual(['owner', 'editor', 'contributor', 'reader'].map((role) => projectRights(role).priority), [true, false, false, false], '« Priorité » inchangée');
  assert.equal(deadlinesOn({}), true);
  assert.equal(deadlinesOn({ deadlinesEnabled: false }), false);
  assert.equal(deadlinesOn({ deadlines_enabled: 0 }), false);
  assert.equal(deadlinesOn({ deadlines_enabled: 1 }), true);
  const card = { dueDate: '2026-11-28', done: true };
  assert.equal(cardDone(card, { deadlinesEnabled: true }), true);
  assert.equal(cardDone(card, { deadlinesEnabled: false }), false);
  assert.equal(cardDueState(card, '2026-11-25', '10:00', { deadlinesEnabled: false }), null);
  assert.equal(cardDueState({ dueDate: '2026-11-20', done: false }, '2026-11-25', '10:00', { deadlinesEnabled: true }), 'late');
});

test('écrans : deux interrupteurs dans les réglages du projet (« Priorité » au propriétaire, « Échéances » aussi à « Peut modifier ») ; option coupée, la carte ouverte n\'a pas de section « Échéance » ; textes fr et en', () => {
  const settings = read('public/js/screens/project-settings.js');
  assert.match(settings, /rights\.priority \? optionRow\('priorite'/);
  assert.match(settings, /rights\.deadlines \? optionRow\('echeances', t\('projets\.reglages\.echeances'\), t\('projets\.reglages\.echeances\.aide'\), deadlinesOn\(p\),/);
  assert.match(settings, /rights\.priority \|\| rights\.deadlines \? optionsPart\(p, rights\) : null/);
  assert.match(settings, /role: 'switch'/);
  const card = read('public/js/screens/project-card.js');
  assert.match(card, /deadlinesOn\(project\) \? phoneField\('calendar', t\('projets\.echeance'\), dueValue\(card, project\)\) : null/);
  assert.match(card, /deadlinesOn\(project\) \? \[section\(t\('projets\.echeance'\)\), h\('div', \{ class: 'kside-field' \}, dueValue\(card, project\)\)\] : null/);
  assert.match(card, /!deadlinesOn\(start\.project\)\) return null;/);
  // Face d'une carte et tuile de l'Accueil : l'échéance lue avec son projet
  assert.match(read('public/js/screens/project.js'), /const due = cardDue\(card, project\);/);
  assert.match(read('public/js/screens/home.js'), /const due = cardDue\(card, project\);/);
  for (const key of ['projets.reglages.echeances', 'projets.reglages.echeances.aide']) {
    assert.ok(fr[key], key);
    assert.ok(en[key], key);
  }
  assert.equal(fr['projets.reglages.echeances.aide'], 'Une date, une heure et un rappel sur les cartes ; la case « Fait ».');
  for (const file of ['public/js/screens/project-settings.js', 'public/js/screens/project-card.js', 'public/js/screens/projects.js']) assert.ok(!/innerHTML/.test(read(file)), file);
});
