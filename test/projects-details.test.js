// Projets, détails de la carte (étape 2 du cadrage docs/cadrage-projets.md,
// migration 44) : description (version, conflit sans perte, cases cochées
// une à une), personnes attribuées (seulement les rôles permis, retirées en
// passant en lecture seule ; Contributeur), échéance, heure, rappel et case
// « Fait » (seule marque de « fait »), priorité (option du projet), liens
// (http et https seulement), duplication, synchronisation, rappels (une
// fois par signature, jamais pour une carte faite). Chaque opération
// ajoutée passe par les quatre rôles (le Contributeur sur sa carte, sur la
// carte d'un autre qui lui est attribuée et sur celle d'un autre qui ne
// l'est pas), le non-membre et l'Admin non membre (404).
//
// Foyer : Léa (propriétaire), Zoé (« Peut modifier »), Hugo (Contributeur),
// Marc (« Lecture seule »), Paul (n'a rien), Guillaume (Admin, n'a rien).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, tempDir, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion } from '../server/db.js';
import { cardDone, cleanLinkUrl, cleanCardDue } from '../public/js/projects.js';

const uuid = () => crypto.randomUUID();
const PEOPLE = [['lea', 'Léa'], ['zoe', 'Zoé'], ['hugo', 'Hugo'], ['marc', 'Marc'], ['paul', 'Paul']];
const statusOf = (res) => [res.status, res.code ?? null];

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
  const cardRow = (cardId) => app.db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  async function project() {
    const projectId = uuid();
    assert.equal((await one('lea', { type: 'project.create', projectId, name: 'DomoPi Articles' })).status, 200);
    assert.equal((await share(projectId, { zoe: 'modification', hugo: 'contribution', marc: 'lecture' })).status, 200);
    const col = app.db.prepare('SELECT id FROM project_columns WHERE project_id = ? ORDER BY position').pluck().get(projectId);
    return { projectId, col };
  }
  async function card(p, who = 'lea', { assignees = [], description = '', due = null } = {}) {
    const cardId = uuid();
    assert.equal((await one(who, { type: 'card.create', projectId: p.projectId, cardId, columnId: p.col, title: 'Article 2FAuth' })).status, 200);
    if (assignees.length) assert.equal((await one('lea', { type: 'card.assign', cardId, userIds: assignees.map((k) => people[k].id) })).status, 200);
    if (description) assert.equal((await one('lea', { type: 'card.describe', cardId, description, baseVersion: 1 })).status, 200);
    if (due) assert.equal((await one('lea', { type: 'card.update', cardId, due })).status, 200);
    return cardId;
  }
  // Les cartes de chaque cas de la matrice : Léa (à elle), Hugo (à lui), à
  // Léa attribuée à Hugo, à Léa sans Hugo
  async function cases(p, options = {}) {
    return {
      own: await card(p, 'hugo', options),
      assigned: await card(p, 'lea', { ...options, assignees: ['hugo'] }),
      other: await card(p, 'lea', options),
    };
  }
  return { app, people, ops, one, sync, share, project, card, cases, cardRow };
}

// Vérifie une opération (make(cardId) : l'opération) pour chaque rôle et
// chaque cas de carte : ce qui doit passer passe, le reste reçoit le bon refus
async function matrix(h, make, { setup = {} } = {}) {
  const p = await h.project();
  const expect = [
    ['lea', 'other', 200], ['zoe', 'other', 200],
    ['hugo', 'own', 200], ['hugo', 'assigned', 200], ['hugo', 'other', 403, 'ops.carteModifierSiennes'],
    ['marc', 'other', 403, 'ops.projetLectureSeule'],
    ['paul', 'other', 404, 'ops.carteIntrouvable'], ['guillaume', 'other', 404, 'ops.carteIntrouvable'],
  ];
  for (const [who, kind, status, code] of expect) {
    const ids = await h.cases(p, setup);
    const res = await h.one(who, make(ids[kind], p));
    assert.equal(res.status, status, `${who} / ${kind} : ${JSON.stringify(res)}`);
    if (code) assert.equal(res.code, code, `${who} / ${kind}`);
  }
}

// --- Migration 44 ---

test('migration 44 : description et version, priorité, échéance et « Fait », liens, rappels ; base 43 mise à jour ; contraintes et cascades', (t) => {
  const file = path.join(tempDir(t), 'old.db');
  const old = databaseAt(file, 43);
  old.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('anne', 'Anne', 'x')").run();
  old.prepare("INSERT INTO projects (id, owner_id, name, created_at, updated_at, changed_at) VALUES ('p', 1, 'P', 'x', 'x', 'x')").run();
  old.prepare("INSERT INTO project_columns VALUES ('c', 'p', 'C', 'c', 'gris', 1, 'x', 'x')").run();
  old.prepare("INSERT INTO cards (id, project_id, column_id, position, title, created_by, created_at, updated_at) VALUES ('k', 'p', 'c', 1, 'T', 1, 'x', 'x')").run();
  old.close();
  const db = openDatabase(file);
  assert.equal(schemaVersion(db), 52);
  assert.deepEqual(db.prepare('SELECT description, description_version, priority, due_date, due_time, remind_before, due_done FROM cards').get(),
    { description: '', description_version: 1, priority: 'normal', due_date: null, due_time: null, remind_before: null, due_done: 0 }, 'une carte d\'avant garde ses valeurs, avec les nouvelles à leur défaut');
  for (const table of ['card_links', 'card_reminders']) assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, table);
  assert.throws(() => db.prepare("UPDATE cards SET due_done = 1 WHERE id = 'k'").run(), /CHECK/, '« Fait » demande une échéance');
  assert.throws(() => db.prepare("UPDATE cards SET due_time = '18:00' WHERE id = 'k'").run(), /CHECK/, 'une heure demande une date');
  assert.throws(() => db.prepare("UPDATE cards SET due_date = '2026-11-28', remind_before = 60 WHERE id = 'k'").run(), /CHECK/, 'un rappel demande une heure');
  assert.throws(() => db.prepare("UPDATE cards SET priority = 'urgent' WHERE id = 'k'").run(), /CHECK/);
  db.prepare("UPDATE cards SET due_date = '2026-11-28', due_time = '18:00', remind_before = 60, due_done = 1 WHERE id = 'k'").run();
  assert.throws(() => db.prepare("INSERT INTO card_links (id, card_id, url, created_at) VALUES ('l0', 'k', 'javascript:alert(1)', 'x')").run(), /CHECK/);
  db.prepare("INSERT INTO card_links (id, card_id, url, created_at) VALUES ('l', 'k', 'https://docs.ntfy.sh/', 'x')").run();
  db.prepare("INSERT INTO card_reminders VALUES ('k', 1, '2026-11-28 18:00 60', 'x')").run();
  db.prepare("DELETE FROM cards WHERE id = 'k'").run();
  for (const table of ['card_links', 'card_reminders']) assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0, `${table} : effacé avec la carte`);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

// --- Matrice des droits, une opération ajoutée à la fois ---

test('échéance, heure, rappel (card.update due) : propriétaire, « Peut modifier », Contributeur sur sa carte et sur celle qui lui est attribuée ; refusé ailleurs (403), non-membre et Admin (404)', async (t) => {
  const h = await household(t);
  await matrix(h, (cardId) => ({ type: 'card.update', cardId, due: { date: '2026-11-28', time: '18:00', remindBefore: 60 } }));
});

test('« Fait » (card.done) : mêmes droits que modifier la carte', async (t) => {
  const h = await household(t);
  await matrix(h, (cardId) => ({ type: 'card.done', cardId, done: true }), { setup: { due: { date: '2026-11-28' } } });
});

test('description (card.describe) et case cochée (card.task) : mêmes droits que modifier la carte', async (t) => {
  const h = await household(t);
  await matrix(h, (cardId) => ({ type: 'card.describe', cardId, description: 'Installer avec Docker', baseVersion: 1 }));
  await matrix(h, (cardId) => ({ type: 'card.task', cardId, index: 0, text: 'Relire', checked: true }), { setup: { description: '- [ ] Relire' } });
});

test('liens (link.create, link.update, link.delete) : mêmes droits que modifier la carte', async (t) => {
  const h = await household(t);
  await matrix(h, (cardId) => ({ type: 'link.create', cardId, linkId: uuid(), title: 'Dépôt', url: 'https://github.com/Bubka/2FAuth' }));
  // Modifier et retirer : un lien posé par Léa sur chaque carte
  const p = await h.project();
  const expect = [
    ['lea', 'other', 200], ['zoe', 'other', 200], ['hugo', 'own', 200], ['hugo', 'assigned', 200],
    ['hugo', 'other', 403], ['marc', 'other', 403], ['paul', 'other', 404], ['guillaume', 'other', 404],
  ];
  for (const type of ['link.update', 'link.delete']) {
    for (const [who, kind, status] of expect) {
      const ids = await h.cases(p);
      const linkId = uuid();
      assert.equal((await h.one('lea', { type: 'link.create', cardId: ids[kind], linkId, url: 'https://docs.ntfy.sh' })).status, 200);
      const res = await h.one(who, { type, cardId: ids[kind], linkId, ...(type === 'link.update' ? { title: 'Doc' } : {}) });
      assert.equal(res.status, status, `${type} ${who} / ${kind}`);
    }
  }
});

test('priorité (card.update priority) : seulement quand l\'option du projet est allumée ; mêmes droits ; valeurs gardées quand elle est coupée', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.update', cardId, priority: 'high' })), [400, 'ops.prioriteProjetCoupee']);
  assert.equal((await h.one('lea', { type: 'project.update', projectId: p.projectId, priorityEnabled: true })).status, 200);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.update', cardId, priority: 'urgent' })), [400, 'ops.prioriteCarteInvalide']);
  assert.equal((await h.one('zoe', { type: 'card.update', cardId, priority: 'high' })).status, 200);
  assert.equal((await h.one('lea', { type: 'project.update', projectId: p.projectId, priorityEnabled: false })).status, 200);
  assert.equal(h.cardRow(cardId).priority, 'high', 'coupée : la valeur est gardée');
  const synced = (await h.sync('marc')).cards.find((c) => c.id === cardId);
  assert.equal(synced.priority, 'high');
  // Matrice (option allumée sur un projet neuf à chaque cas)
  const q = await h.project();
  await h.one('lea', { type: 'project.update', projectId: q.projectId, priorityEnabled: true });
  for (const [who, kind, status] of [['lea', 'other', 200], ['zoe', 'other', 200], ['hugo', 'own', 200], ['hugo', 'assigned', 200], ['hugo', 'other', 403], ['marc', 'other', 403], ['paul', 'other', 404], ['guillaume', 'other', 404]]) {
    const ids = await h.cases(q);
    assert.equal((await h.one(who, { type: 'card.update', cardId: ids[kind], priority: 'low' })).status, status, `${who} / ${kind}`);
  }
});

// --- Personnes attribuées ---

test('personnes : seulement le propriétaire, « Peut modifier » et Contributeur ; jamais en lecture seule ; retirées quand elles passent en lecture seule ou partent', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p);
  const ids = (...keys) => keys.map((k) => h.people[k].id);
  assert.equal((await h.one('lea', { type: 'card.assign', cardId, userIds: ids('lea', 'zoe', 'hugo') })).status, 200);
  for (const who of ['marc', 'paul', 'guillaume']) {
    assert.deepEqual(statusOf(await h.one('lea', { type: 'card.assign', cardId, userIds: ids('lea', who) })), [400, 'ops.personneNonAttribuableProjet'], who);
  }
  assert.deepEqual(h.app.db.prepare('SELECT user_id FROM card_assignees WHERE card_id = ? ORDER BY position').pluck().all(cardId), ids('lea', 'zoe', 'hugo'));
  // Hugo passe en lecture seule : retiré ; Zoé quitte : retirée ; l'historique le dit
  assert.equal((await h.share(p.projectId, { zoe: 'modification', hugo: 'lecture', marc: 'lecture' })).status, 200);
  assert.equal((await h.people.zoe.client.post(`/api/projects/${p.projectId}/leave`)).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT user_id FROM card_assignees WHERE card_id = ?').pluck().all(cardId), ids('lea'));
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM card_events WHERE card_id = ? AND type = 'unassign'").pluck().get(cardId), 2);
});

test('Contributeur attribué à la carte d\'un autre : modifie tout (titre, description, case, échéance, « Fait », étiquettes, liens, priorité) et la déplace, se retire, jamais n\'attribue ni ne supprime ; ne s\'attribue pas une carte qu\'il n\'a pas créée ; retiré, plus aucun droit de modification', async (t) => {
  const h = await household(t);
  const p = await h.project();
  await h.one('lea', { type: 'project.update', projectId: p.projectId, priorityEnabled: true });
  const labelId = uuid();
  await h.one('lea', { type: 'label.create', projectId: p.projectId, labelId, name: 'Sécurité' });
  const cardId = await h.card(p, 'lea', { assignees: ['hugo'], description: '- [ ] Relire' });
  const col2 = h.app.db.prepare('SELECT id FROM project_columns WHERE project_id = ? ORDER BY position LIMIT 1 OFFSET 1').pluck().get(p.projectId);
  const allowed = [
    { type: 'card.update', cardId, title: 'Article 2FAuth, relu' },
    { type: 'card.describe', cardId, description: '- [ ] Relire\nInstaller avec Docker', baseVersion: 2 },
    { type: 'card.task', cardId, index: 0, text: 'Relire', checked: true },
    { type: 'card.update', cardId, due: { date: '2026-11-28', time: '18:00' } },
    { type: 'card.done', cardId, done: true },
    { type: 'card.labels', cardId, labelIds: [labelId] },
    { type: 'link.create', cardId, linkId: uuid(), url: 'https://docs.2fauth.app' },
    { type: 'card.update', cardId, priority: 'high' },
    { type: 'card.move', cardId, columnId: col2 },
  ];
  for (const op of allowed) assert.equal((await h.one('hugo', op)).status, 200, `${op.type} : ${JSON.stringify(op)}`);
  // Attribuer quelqu'un d'autre, supprimer : refusés
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.assign', cardId, userIds: [h.people.hugo.id, h.people.zoe.id] })), [403, 'ops.carteAttribuerSiennes']);
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.delete', cardId })), [403, 'ops.carteSupprimerSiennes']);
  // Il ne s'attribue pas une carte qu'il n'a pas créée
  const other = await h.card(p, 'lea');
  assert.deepEqual(statusOf(await h.one('hugo', { type: 'card.assign', cardId: other, userIds: [h.people.hugo.id] })), [403, 'ops.carteModifierSiennes']);
  // Il se retire : plus aucun droit de modification
  assert.equal((await h.one('hugo', { type: 'card.assign', cardId, userIds: [] })).status, 200);
  for (const op of allowed.slice(0, 1).concat([{ type: 'card.done', cardId, done: false }, { type: 'link.create', cardId, linkId: uuid(), url: 'https://x.example' }])) {
    assert.deepEqual(statusOf(await h.one('hugo', op)), [403, 'ops.carteModifierSiennes'], op.type);
  }
  // Sur sa propre carte, il attribue n'importe quelle personne permise, lui compris
  const mine = await h.card(p, 'hugo');
  assert.equal((await h.one('hugo', { type: 'card.assign', cardId: mine, userIds: [h.people.hugo.id, h.people.zoe.id] })).status, 200);
});

// --- Liens ---

test('liens : http et https seulement (javascript:, data:, file:, mal formés, trop longs refusés), 20 au plus, cherchés dans la carte ; jamais appelés', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p);
  const other = await h.card(p);
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://x.example', 'https://', 'https://a b.example',
    'http://user:secret@x.example', 'www.example.com', `https://x.example/${'a'.repeat(500)}`, 42, null]) {
    assert.deepEqual(statusOf(await h.one('lea', { type: 'link.create', cardId, linkId: uuid(), url })), [400, 'ops.adresseLienInvalide'], String(url));
    assert.equal(cleanLinkUrl(url), null, String(url));
  }
  assert.deepEqual(statusOf(await h.one('lea', { type: 'link.create', cardId, linkId: uuid(), url: 'https://x.example', title: 'a'.repeat(101) })), [400, 'ops.titreLienInvalide']);
  const linkId = uuid();
  assert.equal((await h.one('lea', { type: 'link.create', cardId, linkId, title: '  Dépôt GitHub  ', url: 'HTTPS://GitHub.com/Bubka/2FAuth' })).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT title, url FROM card_links WHERE id = ?').get(linkId), { title: 'Dépôt GitHub', url: 'https://github.com/Bubka/2FAuth' });
  assert.deepEqual(statusOf(await h.one('lea', { type: 'link.update', cardId, linkId, url: 'javascript:void(0)' })), [400, 'ops.adresseLienInvalide']);
  // Un lien d'une autre carte : introuvable
  assert.deepEqual(statusOf(await h.one('lea', { type: 'link.update', cardId: other, linkId, title: 'x' })), [404, 'ops.lienIntrouvable']);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'link.delete', cardId: other, linkId })), [404, 'ops.lienIntrouvable']);
  // Opération rejouée : rien ne change
  const replay = { id: uuid(), type: 'link.create', cardId, linkId: uuid(), url: 'https://docs.2fauth.app' };
  for (let i = 0; i < 2; i += 1) assert.equal((await h.people.lea.client.post('/api/ops', { ops: [replay] })).body.results[0].status, 200);
  // 20 au plus
  for (let i = 0; i < 18; i += 1) assert.equal((await h.one('lea', { type: 'link.create', cardId, linkId: uuid(), url: `https://x.example/${i}` })).status, 200);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'link.create', cardId, linkId: uuid(), url: 'https://x.example/21' })), [400, 'ops.liensLimite']);
  assert.equal((await h.one('lea', { type: 'link.delete', cardId, linkId })).status, 200);
  assert.equal((await h.one('lea', { type: 'link.delete', cardId, linkId })).status, 200, 'déjà retiré : rejouable');
  const synced = (await h.sync('marc')).cards.find((c) => c.id === cardId);
  assert.equal(synced.links.length, 19);
  assert.deepEqual(Object.keys(synced.links[0]).sort(), ['id', 'title', 'url']);
});

// --- Description : version, conflit, cases ---

test('description : jamais d\'écrasement (version), refus 409 avec la version actuelle et son auteur ; afterOp ; trop longue refusée', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p);
  const first = await h.one('lea', { type: 'card.describe', cardId, description: 'Texte de Léa', baseVersion: 1 });
  assert.deepEqual([first.status, first.version], [200, 2]);
  // Zoé écrit sur la version 1 (elle n'avait pas reçu celle de Léa) : refusé, rien d'écrasé
  const late = await h.one('zoe', { type: 'card.describe', cardId, description: 'Texte de Zoé', baseVersion: 1 });
  assert.deepEqual(statusOf(late), [409, 'ops.carteConflit']);
  assert.deepEqual([late.current.version, late.current.description, late.current.updatedByName], [2, 'Texte de Léa', 'Léa']);
  assert.equal(h.cardRow(cardId).description, 'Texte de Léa');
  // Enregistrement suivant de Zoé, écrit après le refusé (afterOp) : refusé aussi
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'card.describe', cardId, description: 'Texte de Zoé, suite', baseVersion: 2, afterOp: late.id })), [409, 'ops.carteConflit']);
  // « Garder les deux » : la sienne ajoutée sous la leur, sur la version actuelle
  const both = await h.one('zoe', { type: 'card.describe', cardId, description: 'Texte de Léa\n\nVersion de Zoé\nTexte de Zoé', baseVersion: 2 });
  assert.deepEqual([both.status, both.version], [200, 3]);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.describe', cardId, description: 'x'.repeat(20001), baseVersion: 3 })), [400, 'ops.descriptionInvalide']);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.describe', cardId, description: 'x', baseVersion: 0 })), [400, 'ops.versionCarteInvalide']);
  // Plusieurs enregistrements rapprochés de la même personne : une seule ligne d'historique
  for (let v = 3; v < 6; v += 1) assert.equal((await h.one('lea', { type: 'card.describe', cardId, description: `v${v}`, baseVersion: v })).status, 200);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM card_events WHERE card_id = ? AND type = 'describe'").pluck().get(cardId), 3, 'Léa, Zoé, puis Léa encore (une ligne par quart d\'heure et par personne)');
  // Jamais le texte de la description dans l'historique ni le journal
  assert.ok(!h.app.db.prepare('SELECT params FROM card_events WHERE card_id = ?').pluck().all(cardId).some((params) => params.includes('Texte')));
  assert.ok(!h.app.logs.some((line) => line.includes('Texte de')));
});

test('cases : deux personnes qui cochent deux cases en même temps les gardent toutes les deux ; une case disparue est refusée sans rien écraser ; « x/y »', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const text = 'Installation avec **Docker**\n- [ ] Refaire les captures\n- [ ] Vérifier la sauvegarde\n- [ ] Relire l\'introduction';
  const cardId = await h.card(p, 'lea', { description: text });
  // Léa et Zoé ont la même version (2) sous les yeux ; chacune coche la sienne
  const [lea, zoe] = await Promise.all([
    h.one('lea', { type: 'card.task', cardId, index: 0, text: 'Refaire les captures', checked: true }),
    h.one('zoe', { type: 'card.task', cardId, index: 1, text: 'Vérifier la sauvegarde', checked: true }),
  ]);
  assert.deepEqual([lea.status, zoe.status], [200, 200]);
  assert.equal(h.cardRow(cardId).description, 'Installation avec **Docker**\n- [x] Refaire les captures\n- [x] Vérifier la sauvegarde\n- [ ] Relire l\'introduction');
  // Rejouée (déjà cochée) : rien ne change, pas de nouvelle version
  const version = h.cardRow(cardId).description_version;
  assert.equal((await h.one('hugo', { type: 'card.task', cardId, index: 0, text: 'Refaire les captures', checked: true })).status, 403, 'Hugo ne peut pas modifier cette carte');
  assert.equal((await h.one('lea', { type: 'card.task', cardId, index: 0, text: 'Refaire les captures', checked: true })).status, 200);
  assert.equal(h.cardRow(cardId).description_version, version);
  // Une ligne ajoutée au-dessus entre-temps : la case est retrouvée par son texte
  assert.equal((await h.one('lea', { type: 'card.describe', cardId, description: `- [ ] Nouvelle\n${h.cardRow(cardId).description}`, baseVersion: version })).status, 200);
  assert.equal((await h.one('zoe', { type: 'card.task', cardId, index: 2, text: 'Relire l\'introduction', checked: true })).status, 200);
  assert.match(h.cardRow(cardId).description, /- \[x\] Relire l'introduction/);
  assert.match(h.cardRow(cardId).description, /^- \[ \] Nouvelle/);
  // Case disparue : refus nommé
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'card.task', cardId, index: 9, text: 'Inconnue', checked: true })), [409, 'ops.caseIntrouvable']);
  assert.deepEqual(statusOf(await h.one('zoe', { type: 'card.task', cardId, index: -1, text: 'x', checked: true })), [400, 'ops.caseInvalide']);
  // Historique : le texte de la case (comme à l'écran), jamais le reste
  const events = h.app.db.prepare("SELECT params FROM card_events WHERE card_id = ? AND type = 'task'").pluck().all(cardId).map((params) => JSON.parse(params));
  assert.deepEqual(events.map((e) => e.text), ['Refaire les captures', 'Vérifier la sauvegarde', 'Relire l\'introduction']);
});

// --- Échéance et « Fait » ---

test('échéance : date valable, heure facultative, rappel seulement avec une heure ; « Fait » demande une échéance et en est la seule marque ; retirer l\'échéance retire « Fait »', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p);
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.done', cardId, done: true })), [400, 'ops.carteSansEcheance']);
  for (const due of [{ date: '2026-02-30' }, { date: '1999-12-31' }, { date: '2026-11-28', time: '25:00' }, { date: '2026-11-28', remindBefore: 60 }, { date: '2026-11-28', time: '18:00', remindBefore: 45 }, 'demain', []]) {
    assert.deepEqual(statusOf(await h.one('lea', { type: 'card.update', cardId, due })), [400, 'ops.echeanceCarteInvalide'], JSON.stringify(due));
    if (typeof due === 'object' && !Array.isArray(due)) assert.equal(cleanCardDue(due), undefined);
  }
  assert.equal((await h.one('lea', { type: 'card.update', cardId, due: { date: '2026-11-28', time: '18:00', remindBefore: 60 } })).status, 200);
  assert.equal((await h.one('zoe', { type: 'card.done', cardId, done: true })).status, 200);
  let row = h.cardRow(cardId);
  assert.deepEqual([row.due_date, row.due_time, row.remind_before, row.due_done, Boolean(row.due_done_at)], ['2026-11-28', '18:00', 60, 1, true]);
  // Une autre date garde la case ; « Fait » ne déplace jamais la carte (pas de colonne de fin)
  assert.equal((await h.one('lea', { type: 'card.update', cardId, due: { date: '2026-11-30' } })).status, 200);
  row = h.cardRow(cardId);
  assert.deepEqual([row.due_date, row.due_time, row.remind_before, row.due_done, row.column_id], ['2026-11-30', null, null, 1, p.col]);
  let synced = (await h.sync('marc')).cards.find((c) => c.id === cardId);
  assert.deepEqual([synced.dueDate, synced.done, cardDone(synced)], ['2026-11-30', true, true]);
  // Retirer l'échéance retire « Fait »
  assert.equal((await h.one('lea', { type: 'card.update', cardId, due: null })).status, 200);
  row = h.cardRow(cardId);
  assert.deepEqual([row.due_date, row.due_done, row.due_done_at], [null, 0, null]);
  synced = (await h.sync('marc')).cards.find((c) => c.id === cardId);
  assert.equal(cardDone(synced), false, 'sans échéance, jamais faite');
  const types = h.app.db.prepare('SELECT type FROM card_events WHERE card_id = ? ORDER BY id').pluck().all(cardId);
  assert.deepEqual(types, ['create', 'due', 'done', 'due', 'due']);
});

// --- Dupliquer ---

test('dupliquer : description, étiquettes, personnes, liens, priorité et échéance copiés, « Fait » décoché ; la copie est à qui duplique', async (t) => {
  const h = await household(t);
  const p = await h.project();
  await h.one('lea', { type: 'project.update', projectId: p.projectId, priorityEnabled: true });
  const cardId = await h.card(p, 'lea', { assignees: ['zoe'], description: '- [x] Relire' });
  const linkId = uuid();
  await h.ops('lea', [
    { type: 'card.update', cardId, due: { date: '2026-11-28', time: '18:00', remindBefore: 15 }, priority: 'high' },
    { type: 'card.done', cardId, done: true },
    { type: 'link.create', cardId, linkId, title: 'Doc', url: 'https://docs.2fauth.app' },
  ]);
  const newCardId = uuid();
  const newLinkId = uuid();
  assert.equal((await h.one('hugo', { type: 'card.duplicate', cardId, newCardId, title: 'Article 2FAuth (copie)', linkIds: { [linkId]: newLinkId } })).status, 200);
  const copy = h.cardRow(newCardId);
  assert.deepEqual([copy.description, copy.description_version, copy.priority, copy.due_date, copy.due_time, copy.remind_before, copy.due_done, copy.created_by],
    ['- [x] Relire', 1, 'high', '2026-11-28', '18:00', 15, 0, h.people.hugo.id]);
  assert.deepEqual(h.app.db.prepare('SELECT id, title, url FROM card_links WHERE card_id = ?').all(newCardId), [{ id: newLinkId, title: 'Doc', url: 'https://docs.2fauth.app/' }]);
  // Un identifiant de lien déjà pris : refus
  assert.deepEqual(statusOf(await h.one('lea', { type: 'card.duplicate', cardId, newCardId: uuid(), linkIds: { [linkId]: newLinkId } })), [409, 'ops.lienExisteDeja']);
});

// --- Rappels ---

test('rappels : une fois par personne et par signature (date, heure, délai), jamais pour une carte faite ; personnes attribuées sinon tous les membres ; projets coupés exclus', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const local = (ms) => {
    const d = new Date(ms);
    const two = (n) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
  };
  const at = local(h.app.clock.now + 60 * 60 * 1000); // dans une heure
  const assigned = await h.card(p, 'lea', { assignees: ['hugo', 'zoe'] });
  const nobody = await h.card(p, 'lea');
  const done = await h.card(p, 'lea', { assignees: ['hugo'] });
  await h.ops('lea', [
    { type: 'card.update', cardId: assigned, due: { ...at, remindBefore: 60 } },
    { type: 'card.update', cardId: nobody, due: { ...at, remindBefore: 60 } },
    { type: 'card.update', cardId: done, due: { ...at, remindBefore: 60 } },
    { type: 'card.done', cardId: done, done: true },
  ]);
  h.app.db.prepare('UPDATE users SET projects_enabled = 0 WHERE id = ?').run(h.people.marc.id);
  const take = () => h.app.ctx.projects.takeCardReminders(h.app.clock.now).map((r) => `${r.cardId === assigned ? 'assigned' : r.cardId === nobody ? 'nobody' : 'done'}:${r.userId}`).sort();
  const ids = h.people;
  assert.deepEqual(take(), [`assigned:${ids.zoe.id}`, `assigned:${ids.hugo.id}`, `nobody:${ids.lea.id}`, `nobody:${ids.zoe.id}`, `nobody:${ids.hugo.id}`].sort(),
    'attribuée : Hugo et Zoé ; à personne : tous les membres (Marc a coupé les projets) ; jamais la carte faite');
  assert.deepEqual(take(), [], 'une seule fois par signature');
  // Plus tard dans la fenêtre : toujours rien
  h.app.clock.now += 10 * 60 * 1000;
  assert.deepEqual(take(), []);
  // Nouvelle signature (autre délai) : de nouveau
  await h.one('lea', { type: 'card.update', cardId: nobody, due: { ...at, remindBefore: 30 } });
  h.app.clock.now += 25 * 60 * 1000;
  assert.equal(take().length, 3);
  // Trop tard (plus de 30 minutes) : abandonné
  await h.one('lea', { type: 'card.update', cardId: assigned, due: { ...at, remindBefore: 120 } });
  assert.deepEqual(take(), []);
  // Supprimée : plus rien
  await h.one('lea', { type: 'card.update', cardId: nobody, due: { ...at, remindBefore: 0 } });
  await h.one('lea', { type: 'card.delete', cardId: nobody });
  h.app.clock.now += 30 * 60 * 1000;
  assert.deepEqual(take(), []);
});

// --- Synchronisation et plafond ---

test('synchronisation : détails champ par champ pour tous les membres (Lecture seule compris), rien pour les autres ; jamais le numéro de qui a écrit la description', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p, 'lea', { description: 'Texte' });
  for (const who of ['zoe', 'hugo', 'marc']) {
    const synced = (await h.sync(who)).cards.find((c) => c.id === cardId);
    assert.deepEqual([synced.description, synced.descriptionVersion, synced.descriptionByName, synced.descriptionByMe], ['Texte', 2, 'Léa', false], who);
  }
  assert.equal((await h.sync('lea')).cards.find((c) => c.id === cardId).descriptionByMe, true);
  for (const who of ['paul', 'guillaume']) assert.ok(!(await h.sync(who)).cards.some((c) => c.id === cardId), who);
});

test('plafond des enregistrements de description : au-delà, tout le lot est refusé (429) et rien n\'est appliqué', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const cardId = await h.card(p);
  h.app.ctx.cardSaves.take(h.people.lea.id, 3600 - 1);
  const res = await h.people.lea.client.post('/api/ops', { ops: [
    { id: uuid(), type: 'card.describe', cardId, description: 'a', baseVersion: 1 },
    { id: uuid(), type: 'card.task', cardId, index: 0, text: 'x', checked: true },
  ] });
  assert.equal(res.status, 429);
  assert.equal(h.cardRow(cardId).description, '');
});
