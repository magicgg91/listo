// Projets, étape 4 du cadrage docs/cadrage-projets.md (section 8, sans
// migration : project_user_state.in_deadlines existe depuis la migration
// 43) : option « Afficher dans Échéances », par projet et par personne.
//
// Points sensibles vérifiés : nombres égaux partout (écran Échéances,
// pastilles, tuile de l'Accueil, résumé du matin) ; carte faite, sans date,
// supprimée, d'un projet dans la corbeille ou d'un projet où l'option est
// coupée : absente ; « Les miennes » avec une carte à moi, à personne, à un
// autre ; case « Fait » de la ligne seulement pour qui peut modifier la
// carte (quatre rôles, Contributeur sur sa carte, sur celle d'un autre qui
// lui est attribuée et sur une autre ; non-membre et Admin : 404) ; option
// propre à chacun ; projets coupés : rien des projets dans Échéances ;
// projets allumés sans option : l'écran est celui d'avant ; hors ligne
// (copie locale, file d'attente rejouée sans doublon).
//
// Foyer : Léa (propriétaire), Zoé (« Peut modifier »), Hugo (Contributeur),
// Marc (« Lecture seule »), Paul (n'a rien), Guillaume (Admin, n'a rien).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { localDay } from '../server/notify.js';
import { emptyState, loadSync, applyOp } from '../public/js/store.js';
import { computeDeadlines, deadlineBadges, deadlineCounts, scopeOffered, deadlineProjects, cardForMe } from '../public/js/deadlines.js';
import { myCardRights } from '../public/js/project-store.js';

const uuid = () => crypto.randomUUID();
const PEOPLE = [['lea', 'Léa'], ['zoe', 'Zoé'], ['hugo', 'Hugo'], ['marc', 'Marc'], ['paul', 'Paul']];
const DAY = 24 * 60 * 60 * 1000;
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

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
  // Copie locale du téléphone de cette personne, telle que la donne la synchronisation
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
  const inDeadlines = (who, p, on = true) => one(who, { type: 'project.state', projectId: p.projectId, inDeadlines: on });
  // Résumé du matin de cette personne (page Notifications) : les nombres
  const digest = async (who) => {
    await app.ctx.notify.runDigest();
    const row = (await people[who].client.get('/api/inbox')).body.rows.find((r) => r.kind === 'digest');
    return row ?? null;
  };
  // Messages reçus par le téléphone de cette personne
  const pushes = (who) => service.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint)
    .map((c) => people[who].device.read(c.body).notification)
    .map((n) => ({ ...n, title: n.title.replace(/\u00a0/g, ' '), body: n.body.replace(/\u00a0/g, ' ') }));
  return { app, service, people, ops, one, sync, local, share, project, card, inDeadlines, digest, today, dayAt, pushes };
}

// Identifiants de chaque groupe (tâches et cartes)
const ids = (groups) => groups.map((g) => [g.key, g.entries.map((e) => (e.card ? e.card.title : e.item.name))]);
const total = (groups) => groups.reduce((sum, g) => sum + g.entries.length, 0);

// Le jeu de Zoé : une tâche à elle (sans attribution) en retard, et dans
// « DomoPi Articles » (option allumée par Zoé) des cartes en retard, du
// jour, de demain, de plus tard ; à elle, à personne, à Hugo ; plus une
// faite, une sans date, une supprimée ; et « Travaux maison » (option
// coupée) avec une carte du jour
async function scene(h) {
  const listId = uuid();
  assert.equal((await h.one('zoe', { type: 'list.create', listId, name: 'Maison', listType: 'tasks', dueEnabled: true })).status, 200);
  assert.equal((await h.one('zoe', { type: 'item.create', listId, itemId: uuid(), name: 'Tâche Payer la cantine', dueDate: h.dayAt(-1) })).status, 200);
  const p = await h.project();
  const cards = {
    late: await h.card(p, { title: 'Carte en retard (Zoé)', due: { date: h.dayAt(-2) }, assignees: ['zoe'] }),
    today: await h.card(p, { title: 'Carte du jour (personne)', due: { date: h.today } }),
    lateHour: await h.card(p, { title: 'Carte de 7 h (Hugo)', due: { date: h.today, time: '07:00' }, assignees: ['hugo'] }),
    tomorrow: await h.card(p, { title: 'Carte de demain (personne)', due: { date: h.dayAt(1) } }),
    later: await h.card(p, { title: 'Carte plus tard (Hugo)', due: { date: h.dayAt(10) }, assignees: ['hugo'] }),
    done: await h.card(p, { title: 'Carte faite', due: { date: h.dayAt(-1) }, assignees: ['zoe'], done: true }),
    undated: await h.card(p, { title: 'Carte sans date' }),
    deleted: await h.card(p, { title: 'Carte supprimée', due: { date: h.today } }),
  };
  assert.equal((await h.one('lea', { type: 'card.delete', cardId: cards.deleted })).status, 200);
  const q = await h.project('Travaux maison');
  await h.card(q, { title: 'Carte d\'un projet sans l\'option', due: { date: h.today } });
  assert.equal((await h.inDeadlines('zoe', p)).status, 200);
  return { p, q, cards, listId };
}

test('Échéances : cartes datées et pas faites des projets où j\'ai allumé l\'option, mêlées aux tâches dans les mêmes groupes ; faite, sans date, supprimée, autre projet : absentes', async (t) => {
  const h = await household(t);
  await scene(h);
  const state = await h.local('zoe');
  const me = h.people.zoe.id;
  const groups = computeDeadlines(state, { today: h.today, me, now: '08:30' });
  assert.deepEqual(ids(groups), [
    ['late', ['Carte en retard (Zoé)', 'Tâche Payer la cantine', 'Carte de 7 h (Hugo)']],
    ['today', ['Carte du jour (personne)']],
    ['tomorrow', ['Carte de demain (personne)']],
    ['later', ['Carte plus tard (Hugo)']],
  ]);
  // La pastille de la ligne : « DomoPi Articles · À faire »
  const entry = groups[0].entries[0];
  assert.deepEqual([entry.project.name, entry.column.name], ['DomoPi Articles', 'À faire']);
  // Recherche : sur le titre de la carte aussi
  assert.deepEqual(ids(computeDeadlines(state, { today: h.today, me, now: '08:30', query: 'demain' })), [['tomorrow', ['Carte de demain (personne)']]]);
  // « Toutes / Les miennes » est proposé dès qu'un projet est montré
  assert.equal(scopeOffered(state), true);
});

test('nombres égaux partout : écran, pastilles, tuile de l\'Accueil, résumé du matin ; « Les miennes » = à moi et à personne, jamais à un autre', async (t) => {
  const h = await household(t);
  await scene(h);
  const state = await h.local('zoe');
  const me = h.people.zoe.id;
  const options = { today: h.today, me, now: '08:30' };
  // « Les miennes » : la carte à moi, celles de personne ; pas celles de
  // Hugo (la tâche sans attribution n'est pas « à moi », comme avant)
  const mine = computeDeadlines(state, { ...options, mine: true });
  assert.deepEqual(ids(mine), [
    ['late', ['Carte en retard (Zoé)']],
    ['today', ['Carte du jour (personne)']],
    ['tomorrow', ['Carte de demain (personne)']],
  ]);
  assert.equal(cardForMe({ assigneeIds: [] }, me), true);
  assert.equal(cardForMe({ assigneeIds: [me, 9] }, me), true);
  assert.equal(cardForMe({ assigneeIds: [9] }, me), false);
  // Tuile de l'Accueil : les nombres de l'écran, avec le même choix
  const all = computeDeadlines(state, options);
  const size = (groups, keys) => groups.filter((g) => keys.includes(g.key)).reduce((sum, g) => sum + g.entries.length, 0);
  assert.deepEqual(deadlineCounts(state, options), { late: size(all, ['late']), today: size(all, ['today']), later: size(all, ['tomorrow', 'week', 'later']) });
  assert.deepEqual(deadlineCounts(state, { ...options, mine: true }), { late: 1, today: 1, later: 1 });
  assert.deepEqual(deadlineCounts(state, options), { late: 3, today: 1, later: 2 });
  // Pastilles : en retard et du jour, les miennes et celles de personne
  // (la tâche de personne, la carte à moi, la carte de personne ; pas la
  // carte de 7 h de Hugo)
  const badges = deadlineBadges(state, h.today, me, '08:30');
  assert.deepEqual(badges, { late: 2, today: 1 });
  // Résumé du matin : le même nombre (aujourd'hui ou avant, à moi ou à personne)
  const row = await h.digest('zoe');
  assert.equal(row.text.replace(/ /g, ' '), '1 échéance aujourd\'hui · 2 en retard');
  assert.equal(row.category, 'due');
  assert.deepEqual(row.target, { type: 'deadlines' });
  const stored = JSON.parse(h.app.db.prepare("SELECT params FROM inbox WHERE user_id = ? AND text_key = 'digest'").pluck().get(me));
  assert.deepEqual(stored, { today: 1, late: 2, cards: 2 }, 'des nombres seulement, jamais un titre de carte');
  assert.equal(stored.today + stored.late, badges.late + badges.today);
  // Hugo n'a pas allumé l'option : ni carte dans ses Échéances, ni dans son résumé
  const hugo = await h.local('hugo');
  assert.equal(deadlineProjects(hugo).size, 0);
  assert.deepEqual(computeDeadlines(hugo, { ...options, me: h.people.hugo.id }), []);
  assert.deepEqual(deadlineBadges(hugo, h.today, h.people.hugo.id, '08:30'), { late: 0, today: 0 });
  assert.equal(await h.digest('hugo'), null);
});

test('résumé du matin avec des cartes : texte « échéances », détail avec les titres, ouvre Échéances ; projet aux notifications coupées ou projets coupés : sans ses cartes', async (t) => {
  const h = await household(t, { push: true });
  const { p } = await scene(h);
  const zoe = h.people.zoe.client;
  assert.equal((await zoe.request('PUT', '/api/push/settings', { detail: true })).status, 200);
  await h.app.ctx.push.idle();
  h.service.calls.length = 0;
  const row = await h.digest('zoe');
  await h.app.ctx.push.idle();
  assert.equal(row.text, '1 échéance aujourd\'hui · 2 en retard');
  const [message] = h.pushes('zoe');
  assert.equal(message.title, '1 échéance aujourd\'hui · 2 en retard');
  assert.equal(message.body, 'Carte en retard (Zoé), Tâche Payer la cantine, Carte du jour (personne)', 'avec le détail : les plus en retard d\'abord, tâches et cartes mêlées');
  assert.match(message.navigate, /#\/echeances$/, 'avec des cartes : l\'écran Échéances');
  // Sans le détail : « Dans 2 listes et projets »
  assert.equal((await zoe.request('PUT', '/api/push/settings', { detail: false })).status, 200);
  h.app.clock.now += DAY;
  h.service.calls.length = 0;
  await h.app.ctx.notify.runDigest();
  await h.app.ctx.push.idle();
  assert.equal(h.pushes('zoe')[0].body, 'Dans 2 listes et projets');
  // Notifications du projet coupées par Zoé : plus ses cartes (comme une
  // liste silencée), il reste la tâche en retard, avec le texte d'avant
  h.app.clock.now += DAY;
  assert.equal((await h.one('zoe', { type: 'project.state', projectId: p.projectId, mutedPush: true })).status, 200);
  await h.app.ctx.notify.runDigest();
  let rows = (await zoe.get('/api/inbox')).body.rows.filter((r) => r.kind === 'digest');
  assert.equal(rows[0].text, '1 tâche en retard', 'sans carte : le texte d\'avant');
  // Projets coupés par Zoé (notifications du projet rallumées) : rien des projets
  h.app.clock.now += DAY;
  assert.equal((await h.one('zoe', { type: 'project.state', projectId: p.projectId, mutedPush: false })).status, 200);
  assert.equal((await h.one('zoe', { type: 'account.features', projects: false })).status, 200);
  await h.app.ctx.notify.runDigest();
  rows = (await zoe.get('/api/inbox')).body.rows.filter((r) => r.kind === 'digest');
  assert.equal(rows[0].text, '1 tâche en retard');
  // Hugo (Contributeur), seulement des cartes d'un seul projet : « Dans « DomoPi Articles » »
  h.app.clock.now += DAY;
  assert.equal((await h.inDeadlines('hugo', p)).status, 200);
  h.service.calls.length = 0;
  await h.app.ctx.notify.runDigest();
  await h.app.ctx.push.idle();
  const hugo = h.pushes('hugo').at(-1);
  assert.equal(hugo.body, 'Dans « DomoPi Articles »');
  assert.match(hugo.title, /échéance/);
});

test('projets coupés : rien des projets dans Échéances, ni à l\'écran, ni dans les pastilles, ni dans la tuile ; option gardée, elle revient quand on rallume', async (t) => {
  const h = await household(t);
  await scene(h);
  const me = h.people.zoe.id;
  const options = { today: h.today, me, now: '08:30' };
  // Coupés sur ce téléphone (hors ligne : la copie locale garde encore les cartes)
  const state = await h.local('zoe');
  applyOp(state, { type: 'account.features', projects: false }, { user: { id: me }, now: new Date().toISOString() });
  assert.ok(state.cards.size > 0, 'la copie garde les cartes jusqu\'à la synchronisation');
  assert.deepEqual(ids(computeDeadlines(state, options)), [['late', ['Tâche Payer la cantine']]]);
  assert.deepEqual(deadlineBadges(state, h.today, me, '08:30'), { late: 1, today: 0 });
  assert.deepEqual(deadlineCounts(state, options), { late: 1, today: 0, later: 0 });
  assert.equal(scopeOffered(state), false, '« Toutes / Les miennes » comme avant (aucune liste avec attribution)');
  // Coupés sur le serveur : rien n'est envoyé ; rallumés : l'option est toujours là
  assert.equal((await h.one('zoe', { type: 'account.features', projects: false })).status, 200);
  const off = await h.local('zoe');
  assert.equal(off.cards.size, 0);
  assert.deepEqual(ids(computeDeadlines(off, options)), [['late', ['Tâche Payer la cantine']]]);
  assert.equal((await h.one('zoe', { type: 'account.features', projects: true })).status, 200);
  assert.equal(total(computeDeadlines(await h.local('zoe'), options)), 6);
});

test('projets allumés mais aucun projet montré : l\'écran Échéances est exactement celui des projets coupés', async (t) => {
  const h = await household(t);
  const { p } = await scene(h);
  assert.equal((await h.inDeadlines('zoe', p, false)).status, 200);
  const me = h.people.zoe.id;
  const options = { today: h.today, me, now: '08:30' };
  const on = await h.local('zoe');
  assert.ok(on.cards.size > 0);
  const off = await h.local('zoe');
  off.features = { ...off.features, projects: false };
  for (const mine of [false, true]) assert.deepEqual(computeDeadlines(on, { ...options, mine }), computeDeadlines(off, { ...options, mine }));
  assert.deepEqual(deadlineBadges(on, h.today, me, '08:30'), deadlineBadges(off, h.today, me, '08:30'));
  assert.deepEqual(deadlineCounts(on, options), deadlineCounts(off, options));
  assert.equal(scopeOffered(on), scopeOffered(off));
  assert.equal(deadlineProjects(on).size, 0);
});

test('case « Fait » de la ligne : seulement pour qui peut modifier la carte (quatre rôles, Contributeur sur sa carte, sur celle qui lui est attribuée, sur une autre) ; le serveur revérifie ; non-membre et Admin : 404', async (t) => {
  const h = await household(t);
  const p = await h.project();
  const due = { date: h.today };
  for (const who of ['lea', 'zoe', 'hugo', 'marc']) assert.equal((await h.inDeadlines(who, p)).status, 200, who);
  const cases = [
    ['lea', 'other', true], ['zoe', 'other', true],
    ['hugo', 'own', true], ['hugo', 'assigned', true], ['hugo', 'other', false],
    ['marc', 'other', false],
  ];
  for (const [who, kind, allowed] of cases) {
    const cardId = kind === 'own'
      ? await h.card(p, { who: 'hugo', title: `Carte de Hugo ${who}`, due })
      : await h.card(p, { title: `Carte ${who} ${kind}`, due, assignees: kind === 'assigned' ? ['hugo'] : [] });
    // Ce que montre l'écran Échéances de cette personne
    const state = await h.local(who);
    const entry = computeDeadlines(state, { today: h.today, me: h.people[who].id, now: '08:00' }).flatMap((g) => g.entries).find((e) => e.card?.id === cardId);
    assert.ok(entry, `${who} / ${kind} : la carte est dans ses Échéances`);
    assert.equal(myCardRights(state, entry.card, { id: h.people[who].id }).edit, allowed, `${who} / ${kind} : case affichée ?`);
    // Et le serveur accepte (ou refuse) la même chose
    const res = await h.one(who, { type: 'card.done', cardId, done: true });
    assert.equal(res.status, allowed ? 200 : 403, `${who} / ${kind} : ${JSON.stringify(res)}`);
    if (allowed) {
      const after = await h.local(who);
      assert.equal(computeDeadlines(after, { today: h.today, me: h.people[who].id, now: '08:00' }).flatMap((g) => g.entries).some((e) => e.card?.id === cardId), false, 'faite : elle quitte Échéances');
    }
  }
  const cardId = await h.card(p, { title: 'Carte de Léa', due });
  for (const who of ['paul', 'guillaume']) {
    assert.deepEqual([(await h.one(who, { type: 'card.done', cardId, done: true })).status], [404], who);
    const res = await h.one(who, { type: 'project.state', projectId: p.projectId, inDeadlines: true });
    assert.deepEqual([res.status, res.code], [404, 'ops.projetIntrouvable'], who);
    assert.deepEqual(computeDeadlines(await h.local(who), { today: h.today, me: h.people[who].id }), [], `${who} : rien`);
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM project_user_state WHERE user_id IN (?, ?)').pluck().get(h.people.paul.id, 1), 0);
});

test('option propre à chacun : allumée par Zoé, jamais transmise aux autres ; chaque rôle peut l\'allumer et l\'éteindre pour soi ; projets coupés : refusée', async (t) => {
  const h = await household(t);
  const p = await h.project();
  await h.card(p, { title: 'Carte datée', due: { date: h.today } });
  assert.equal((await h.inDeadlines('zoe', p)).status, 200);
  for (const who of ['lea', 'zoe', 'hugo', 'marc']) {
    const data = await h.sync(who);
    assert.equal(data.projectMine[p.projectId].inDeadlines, who === 'zoe', who);
    assert.ok(!JSON.stringify(data.projects).includes('inDeadlines'), `${who} : jamais dans la structure partagée du projet`);
    assert.equal(total(computeDeadlines(await h.local(who), { today: h.today, me: h.people[who].id })), who === 'zoe' ? 1 : 0, who);
  }
  for (const who of ['lea', 'hugo', 'marc']) {
    assert.equal((await h.inDeadlines(who, p)).status, 200, who);
    assert.equal((await h.inDeadlines(who, p, false)).status, 200, who);
  }
  assert.equal((await h.sync('zoe')).projectMine[p.projectId].inDeadlines, true, 'les autres n\'ont rien changé pour Zoé');
  h.app.db.prepare('UPDATE users SET projects_enabled = 0 WHERE id = ?').run(h.people.marc.id);
  const res = await h.inDeadlines('marc', p);
  assert.deepEqual([res.status, res.code], [403, 'ops.projetsCoupes']);
  // Perdre l'accès efface ses réglages (dont l'option)
  assert.equal((await h.share(p.projectId, { hugo: 'contribution', marc: 'lecture' })).status, 200);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM project_user_state WHERE project_id = ? AND user_id = ?').pluck().get(p.projectId, h.people.zoe.id), 0);
});

test('hors ligne : l\'option allumée sur le téléphone montre tout de suite les cartes ; la file d\'attente rejouée deux fois n\'applique l\'opération qu\'une fois ; même résultat après la synchronisation', async (t) => {
  const h = await household(t);
  const p = await h.project();
  await h.card(p, { title: 'Carte du jour', due: { date: h.today } });
  await h.card(p, { title: 'Carte de demain', due: { date: h.dayAt(1) }, assignees: ['hugo'] });
  const me = h.people.zoe.id;
  const options = { today: h.today, me, now: '08:30' };
  const state = await h.local('zoe');
  assert.deepEqual(computeDeadlines(state, options), []);
  const op = { id: uuid(), type: 'project.state', projectId: p.projectId, inDeadlines: true };
  applyOp(state, op, { user: { id: me }, now: new Date().toISOString() });
  const offline = ids(computeDeadlines(state, options));
  assert.deepEqual(offline, [['today', ['Carte du jour']], ['tomorrow', ['Carte de demain']]]);
  // Retour du réseau : la file part (deux fois, comme après une coupure)
  for (let i = 0; i < 2; i += 1) {
    const res = await h.people.zoe.client.post('/api/ops', { ops: [op] });
    assert.equal(res.status, 200);
    assert.equal(res.body.results[0].status, 200);
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM project_user_state WHERE project_id = ? AND user_id = ? AND in_deadlines = 1').pluck().get(p.projectId, me), 1);
  assert.deepEqual(ids(computeDeadlines(await h.local('zoe'), options)), offline);
  // Rejouée par-dessus l'état du serveur (opération encore en file) : rien ne change
  const replay = await h.local('zoe');
  applyOp(replay, op, { user: { id: me }, now: new Date().toISOString() });
  assert.deepEqual(ids(computeDeadlines(replay, options)), offline);
});

test('règles de la copie locale : projet dans la corbeille ou que je ne vois plus, priorité du projet (option), tri mêlé aux tâches', () => {
  const s = emptyState();
  s.loaded = true;
  s.features = { notes: true, projects: true };
  s.lists.set('maison', { id: 'maison', name: 'Maison', type: 'tasks', dueEnabled: true, priorityEnabled: false });
  s.items.set('t1', { id: 't1', listId: 'maison', name: 'Arroser', dueDate: '2026-11-25', priority: 'normal', checked: false });
  const columns = [{ id: 'c1', name: 'Relecture', color: 'bleu', position: 1 }];
  s.projects.set('p1', { id: 'p1', name: 'DomoPi Articles', role: 'reader', priorityEnabled: true, columns, members: [] });
  s.projects.set('p2', { id: 'p2', name: 'Corbeille', role: 'owner', deletedAt: '2026-11-20T10:00:00.000Z' });
  s.projects.set('p3', { id: 'p3', name: 'Quitté', role: 'editor', columns, members: [] });
  s.projectIds = new Set(['p1', 'p2']);
  s.projectMine = { p1: { inDeadlines: true }, p2: { inDeadlines: true }, p3: { inDeadlines: true } };
  const card = (id, projectId, title, extra = {}) => s.cards.set(id, { id, projectId, columnId: 'c1', title, dueDate: '2026-11-25', dueTime: null, done: false, assigneeIds: [], priority: 'normal', ...extra });
  card('k1', 'p1', 'Zèbre', { priority: 'high' });
  card('k2', 'p1', 'Abeille');
  card('k3', 'p2', 'Dans la corbeille');
  card('k4', 'p3', 'Projet quitté');
  card('k5', 'p1', 'Faite', { done: true });
  const groups = computeDeadlines(s, { today: '2026-11-25', me: 7, now: '08:00' });
  // Priorité élevée d'abord (option du projet), puis l'ordre alphabétique, tâches comprises
  assert.deepEqual(ids(groups), [['today', ['Zèbre', 'Abeille', 'Arroser']]]);
  s.projects.set('p1', { ...s.projects.get('p1'), priorityEnabled: false });
  assert.deepEqual(ids(computeDeadlines(s, { today: '2026-11-25', me: 7, now: '08:00' })), [['today', ['Abeille', 'Arroser', 'Zèbre']]], 'priorité coupée : ignorée');
  assert.deepEqual([...deadlineProjects(s).keys()], ['p1']);
  // Lecture seule : la carte est montrée, sans case « Fait »
  assert.equal(myCardRights(s, s.cards.get('k1'), { id: 7 }).edit, false);
});

test('écrans : la ligne d\'une carte (icône des projets, « Projet · Colonne », ouvre la carte, case seulement avec cardRights), l\'interrupteur du menu ⋮, textes sans HTML', () => {
  const screen = read('public/js/screens/deadlines.js');
  assert.match(screen, /icon\('kanban', 'icon--xs'\)/);
  assert.match(screen, /navigate\('projectCard', \{ id: card\.projectId, cardId: card\.id \}\)/);
  assert.match(screen, /myCardRights\(app\.data, card, app\.user\)\.edit/);
  assert.match(screen, /projectActions\.setCardDone\(card\.id, true\)/);
  assert.ok(!/innerHTML/.test(screen));
  const menu = read('public/js/screens/projects.js');
  assert.match(menu, /label: t\('projets\.menu\.echeances'\),\s*toggle: true,\s*checked: inDeadlines/);
  assert.match(menu, /setProjectState\(project\.id, \{ inDeadlines: !inDeadlines \}\)/);
  // Interrupteur d'un menu : rôle menuitemcheckbox, avec sa coche
  assert.match(read('public/js/ui.js'), /item\.toggle \? 'menuitemcheckbox' : 'menuitemradio'/);
});
