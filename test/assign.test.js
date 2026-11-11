// Attribuer une tâche (décisions du 11 novembre 2026) : option de liste
// (migration 25), une personne par tâche (le propriétaire ou une personne
// « Peut modifier »), refus sans rien écrire, remise à « Personne » quand
// la personne quitte la liste, en est retirée ou passe en lecture seule,
// jamais sur la page publique ; notifications (« vous a attribué une
// tâche », résumé de 8 h sans les tâches des autres) ; Claude (par le
// prénom) ; copie locale, tri « Par personne », « Les miennes » sur
// « Échéances ».

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { household as mcpHousehold, connect, claude, data, PASSWORD } from './mcp-helpers.js';
import { ASSIGN_NOT_HERE, ASSIGN_OFF, BAD_ASSIGNEE } from '../server/lists.js';
import { GROUP_MS, localDay } from '../server/notify.js';
import { emptyState, applyOp, listOptions, availableSorts, computeListView, assignablePeople } from '../public/js/store.js';
import { sortTasks } from '../public/js/sorting.js';
import { computeDeadlines, deadlineBadge } from '../public/js/deadlines.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Foyer : Guillaume (propriétaire), Léa (« Peut modifier »), Paul (lecture
// seule), Zoé (pas membre) ; « Maison » (tâches, attribution activée),
// « Perso » (tâches, attribution désactivée), « Courses »
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = { lea: 0, paul: 0, zoe: 0 };
  for (const name of ['lea', 'paul', 'zoe']) ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
  const client = async (name) => {
    const c = app.client();
    await login(c, name, `MotDePasse-${name}`);
    return c;
  };
  const lea = await client('lea');
  const paul = await client('paul');
  const lists = { maison: uuid(), perso: uuid(), courses: uuid() };
  const items = { ampoule: uuid(), poubelles: uuid(), lait: uuid(), perso: uuid() };
  const res = await guillaume.post('/api/ops', { ops: [
    { type: 'list.create', listId: lists.maison, name: 'Maison', listType: 'tasks', dueEnabled: true, assignEnabled: true },
    { type: 'item.create', listId: lists.maison, itemId: items.ampoule, name: 'Ampoule' },
    { type: 'item.create', listId: lists.maison, itemId: items.poubelles, name: 'Poubelles', dueDate: '2030-01-07', repeat: 'week:1' },
    { type: 'list.create', listId: lists.perso, name: 'Perso', listType: 'tasks' },
    { type: 'item.create', listId: lists.perso, itemId: items.perso, name: 'Lire' },
    { type: 'list.create', listId: lists.courses, name: 'Courses', listType: 'shopping' },
    { type: 'item.create', listId: lists.courses, itemId: items.lait, name: 'Lait' },
  ].map((o) => ({ id: uuid(), ...o })) });
  assert.ok(res.body.results.every((r) => r.status === 200), res.text);
  for (const id of [lists.maison, lists.perso, lists.courses]) {
    const shared = await guillaume.request('PUT', `/api/lists/${id}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
    assert.equal(shared.status, 200, shared.text);
  }
  const row = (id) => app.db.prepare('SELECT assigned_to, updated_at FROM items WHERE id = ?').get(id);
  return { app, guillaume, lea, paul, ids, lists, items, row };
}

const op = async (client, operation) => {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...operation }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
};

// --- Serveur ---

test('migration 25 : option désactivée et personne au départ ; la synchronisation donne les deux', async (t) => {
  const h = await household(t);
  assert.equal(h.app.db.prepare('SELECT assign_enabled FROM lists WHERE id = ?').pluck().get(h.lists.perso), 0, 'désactivée par défaut');
  assert.equal(h.row(h.items.ampoule).assigned_to, null);
  const sync = (await h.lea.get('/api/sync')).body;
  assert.equal(sync.lists.find((l) => l.id === h.lists.maison).assignEnabled, true);
  assert.equal(sync.lists.find((l) => l.id === h.lists.perso).assignEnabled, false);
  assert.equal(sync.items.find((i) => i.id === h.items.ampoule).assignedTo, null);
  // La base refuse une valeur hors 0/1
  assert.throws(() => h.app.db.prepare('UPDATE lists SET assign_enabled = 2 WHERE id = ?').run(h.lists.maison), /CHECK/);
});

test('attribuer : propriétaire et « Peut modifier » seulement ; refus sans rien écrire ; null : à personne', async (t) => {
  const h = await household(t);
  // À soi, à Léa, par Léa à Guillaume
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.ampoule, assignedTo: 1 })).status, 200);
  assert.equal(h.row(h.items.ampoule).assigned_to, 1);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.ampoule, assignedTo: h.ids.lea })).status, 200);
  assert.equal(h.row(h.items.ampoule).assigned_to, h.ids.lea);
  assert.equal((await op(h.lea, { type: 'item.update', itemId: h.items.ampoule, assignedTo: '1' })).status, 200, 'identifiant en texte accepté');
  assert.equal(h.row(h.items.ampoule).assigned_to, 1);
  // Refusés : lecture seule, pas membre, compte inconnu ou désactivé, valeurs invalides
  const before = h.row(h.items.ampoule);
  h.app.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(h.ids.zoe);
  for (const value of [h.ids.paul, h.ids.zoe, 9999, 0, -1, 1.5, '1 ', 'lea', true, {}, []]) {
    const res = await op(h.guillaume, { type: 'item.update', itemId: h.items.ampoule, assignedTo: value, name: 'Ne doit pas être écrit' });
    assert.equal(res.status, 400, JSON.stringify(value));
    assert.equal(res.error, BAD_ASSIGNEE);
  }
  assert.deepEqual(h.row(h.items.ampoule), before, 'rien n\'est écrit');
  // Liste sans l'option, liste de courses : refus
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.perso, assignedTo: 1 })).error, ASSIGN_OFF);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.lait, assignedTo: null })).error, ASSIGN_NOT_HERE);
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.lists.courses, itemId: uuid(), name: 'Pain', assignedTo: 1 })).error, ASSIGN_NOT_HERE);
  // Paul (lecture seule) ne peut rien attribuer
  assert.equal((await op(h.paul, { type: 'item.update', itemId: h.items.ampoule, assignedTo: h.ids.paul })).status, 403);
  // Dès l'ajout, puis « Personne »
  const fresh = uuid();
  assert.equal((await op(h.lea, { type: 'item.create', listId: h.lists.maison, itemId: fresh, name: 'Tondre', assignedTo: h.ids.lea })).status, 200);
  assert.equal(h.row(fresh).assigned_to, h.ids.lea);
  assert.equal((await op(h.lea, { type: 'item.update', itemId: fresh, assignedTo: null })).status, 200);
  assert.equal(h.row(fresh).assigned_to, null);
  // L'option désactivée ensuite : la valeur reste en base (cachée), et ne se change plus
  await op(h.guillaume, { type: 'list.update', listId: h.lists.maison, assignEnabled: false });
  assert.equal(h.row(h.items.ampoule).assigned_to, 1);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.ampoule, assignedTo: null })).error, ASSIGN_OFF);
  // Seul le propriétaire change l'option
  assert.equal((await op(h.lea, { type: 'list.update', listId: h.lists.maison, assignEnabled: true })).status, 403);
  assert.equal((await op(h.guillaume, { type: 'list.update', listId: h.lists.maison, assignEnabled: 'oui' })).status, 400);
});

test('la personne quitte la liste, en est retirée ou passe en lecture seule : ses tâches reviennent à « Personne » (et la synchronisation l\'apprend)', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'item.update', itemId: h.items.ampoule, assignedTo: h.ids.lea });
  await op(h.guillaume, { type: 'item.update', itemId: h.items.poubelles, assignedTo: h.ids.lea });
  const since = (await h.guillaume.get('/api/sync')).body.serverTime;
  h.app.clock.now += 1000;
  // Lecture seule
  await h.guillaume.request('PUT', `/api/lists/${h.lists.maison}/members`, { userIds: [h.ids.lea, h.ids.paul], access: { [h.ids.lea]: 'lecture' } });
  assert.equal(h.row(h.items.ampoule).assigned_to, null);
  assert.equal(h.row(h.items.poubelles).assigned_to, null);
  const changes = (await h.guillaume.get(`/api/sync?since=${encodeURIComponent(since)}`)).body;
  assert.ok(changes.items.some((i) => i.id === h.items.ampoule && i.assignedTo === null), 'la remise à « Personne » est synchronisée');
  // De nouveau « Peut modifier », attribuée, puis retirée
  await h.guillaume.request('PUT', `/api/lists/${h.lists.maison}/members`, { userIds: [h.ids.lea, h.ids.paul], access: { [h.ids.lea]: 'modification' } });
  await op(h.guillaume, { type: 'item.update', itemId: h.items.ampoule, assignedTo: h.ids.lea });
  await h.guillaume.request('PUT', `/api/lists/${h.lists.maison}/members`, { userIds: [h.ids.paul], access: {} });
  assert.equal(h.row(h.items.ampoule).assigned_to, null);
  // Rajoutée, attribuée, puis elle quitte la liste elle-même ; une tâche supprimée
  // entre-temps n'est pas « rendue » à une personne partie
  await h.guillaume.request('PUT', `/api/lists/${h.lists.maison}/members`, { userIds: [h.ids.lea, h.ids.paul], access: { [h.ids.lea]: 'modification' } });
  await op(h.guillaume, { type: 'item.update', itemId: h.items.ampoule, assignedTo: h.ids.lea });
  await op(h.guillaume, { type: 'item.delete', itemId: h.items.ampoule });
  assert.equal((await h.lea.post(`/api/lists/${h.lists.maison}/leave`, {})).status, 200);
  await op(h.guillaume, { type: 'item.restore', itemId: h.items.ampoule });
  assert.equal(h.row(h.items.ampoule).assigned_to, null);
});

test('tâche qui se répète : cochée, elle garde sa personne ; dupliquer la liste copie l\'option, pas les attributions ; page publique : jamais', async (t) => {
  const h = await household(t);
  await op(h.guillaume, { type: 'item.update', itemId: h.items.poubelles, assignedTo: h.ids.lea });
  const checked = await op(h.lea, { type: 'item.check', itemId: h.items.poubelles, checked: true });
  assert.equal(checked.repeated, '2030-01-14');
  assert.equal(h.row(h.items.poubelles).assigned_to, h.ids.lea);
  const copy = await h.guillaume.post(`/api/lists/${h.lists.maison}/duplicate`, { name: 'Maison (copie)', withItems: true });
  assert.equal(copy.status, 201, copy.text);
  assert.equal(h.app.db.prepare('SELECT assign_enabled FROM lists WHERE id = ?').pluck().get(copy.body.list.id), 1);
  assert.deepEqual(h.app.db.prepare('SELECT DISTINCT assigned_to FROM items WHERE list_id = ?').pluck().all(copy.body.list.id), [null], 'copie privée : personne');
  const share = await h.guillaume.request('PUT', `/api/lists/${h.lists.maison}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const page = await createClient(h.app.base, { ip: '203.0.113.9' }).get(`/api/public/${token}`);
  const text = JSON.stringify(page.body);
  assert.doesNotMatch(text, /assign/i, 'ni le champ, ni l\'option');
  assert.ok(page.body.groups.flatMap((g) => g.items).every((item) => !('assignedTo' in item)));
});

// --- Notifications ---

async function pushFamily(t) {
  const push = fakePushService();
  const app = await startTestApp(t, { config: { push: true }, pushRequest: push });
  push.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1 } };
  app.db.prepare("UPDATE users SET display_name = 'Guillaume' WHERE id = 1").run();
  for (const [key, name] of [['lea', 'Léa'], ['marc', 'Marc']]) {
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
  const inbox = (who) => push.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint).map((c) => people[who].device.read(c.body).notification);
  const tick = async (ms) => {
    app.clock.now += ms;
    await app.ctx.notify.flushDue();
    await app.ctx.push.idle();
  };
  return { app, push, people, inbox, tick };
}

test('notification « Modifications » : « Guillaume vous a attribué une tâche » (détail : son nom) ; jamais à soi ; les autres voient « a modifié »', async (t) => {
  const f = await pushFamily(t);
  const maison = uuid();
  const tasks = [uuid(), uuid()];
  const g = f.people.guillaume.client;
  await g.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', assignEnabled: true },
    { id: uuid(), type: 'item.create', listId: maison, itemId: tasks[0], name: 'Tondre' },
    { id: uuid(), type: 'item.create', listId: maison, itemId: tasks[1], name: 'Vitres' },
  ] });
  await g.request('PUT', `/api/lists/${maison}/members`, { userIds: [f.people.lea.id, f.people.marc.id], access: { [f.people.lea.id]: 'modification', [f.people.marc.id]: 'modification' } });
  await f.tick(GROUP_MS);
  f.push.calls.length = 0;
  // Guillaume attribue « Tondre » à Léa, et se donne « Vitres »
  await g.post('/api/ops', { ops: [
    { id: uuid(), type: 'item.update', itemId: tasks[0], assignedTo: f.people.lea.id },
    { id: uuid(), type: 'item.update', itemId: tasks[1], assignedTo: 1 },
  ] });
  await f.tick(GROUP_MS);
  assert.deepEqual(f.inbox('lea').map((n) => [n.title, n.body]), [['Guillaume vous a attribué une tâche dans « Maison »', '2 changements']]);
  assert.deepEqual(f.inbox('marc').map((n) => n.title), ['Guillaume a modifié « Maison »']);
  assert.deepEqual(f.inbox('guillaume'), [], 'jamais à soi');
  // Avec le détail : le nom de la tâche
  await f.people.lea.client.request('PUT', '/api/push/settings', { detail: true });
  f.push.calls.length = 0;
  await f.people.marc.client.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: tasks[1], assignedTo: f.people.lea.id }] });
  await f.tick(GROUP_MS);
  assert.deepEqual(f.inbox('lea').map((n) => [n.title, n.body]), [['Marc vous a attribué une tâche dans « Maison »', 'Pour vous : Vitres · Modifié : Vitres']]);
  // Tâche reprise avant l'envoi (attribuée à quelqu'un d'autre) : plus « vous a attribué »
  f.push.calls.length = 0;
  await g.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: tasks[0], assignedTo: null }, { id: uuid(), type: 'item.update', itemId: tasks[0], assignedTo: f.people.lea.id }] });
  await g.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: tasks[0], assignedTo: f.people.marc.id }] });
  await f.tick(GROUP_MS);
  assert.match(f.inbox('lea')[0].title, /^Guillaume a modifié « Maison »$/);
});

test('résumé de 8 h : mes tâches et celles de personne, jamais celles attribuées à quelqu\'un d\'autre (si l\'option est activée)', async (t) => {
  const f = await pushFamily(t);
  const at8 = () => {
    const date = new Date(f.app.clock.now);
    date.setDate(date.getDate() + 1);
    date.setHours(8, 30, 0, 0);
    return date.getTime();
  };
  f.app.clock.now = at8() - 3 * 3600 * 1000; // la veille au soir… puis 5 h 30
  const today = localDay(new Date(at8()));
  const maison = uuid();
  const [moi, lea, personne] = [uuid(), uuid(), uuid()];
  const g = f.people.guillaume.client;
  await g.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', dueEnabled: true, assignEnabled: true },
    { id: uuid(), type: 'item.create', listId: maison, itemId: moi, name: 'Moi', dueDate: today },
    { id: uuid(), type: 'item.create', listId: maison, itemId: lea, name: 'Léa', dueDate: today },
    { id: uuid(), type: 'item.create', listId: maison, itemId: personne, name: 'Personne', dueDate: today },
  ] });
  await g.request('PUT', `/api/lists/${maison}/members`, { userIds: [f.people.lea.id], access: { [f.people.lea.id]: 'modification' } });
  await g.post('/api/ops', { ops: [
    { id: uuid(), type: 'item.update', itemId: moi, assignedTo: 1 },
    { id: uuid(), type: 'item.update', itemId: lea, assignedTo: f.people.lea.id },
  ] });
  await f.tick(GROUP_MS);
  f.push.calls.length = 0;
  f.app.clock.now = at8();
  await f.app.ctx.notify.runDigest();
  await f.app.ctx.push.idle();
  assert.equal(f.inbox('guillaume')[0].title, '2 tâches à faire aujourd\'hui', 'la sienne et celle de personne');
  assert.equal(f.inbox('lea')[0].title, '2 tâches à faire aujourd\'hui', 'la sienne et celle de personne');
});

// --- Claude ---

test('Claude : read_list donne les personnes et à qui est chaque tâche ; add_items et update_items attribuent par le prénom, tout ou rien', async (t) => {
  const h = await mcpHousehold(t);
  const marieId = h.marieId;
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.update', listId: h.ids.maison, assignEnabled: true }] });
  h.app.db.prepare("UPDATE users SET display_name = 'Guillaume' WHERE id = 1").run();
  await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/members`, { userIds: [marieId], access: { [marieId]: 'modification' } });
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const toolError = (r) => (r.body.result?.isError ? r.body.result.content[0].text : null);
  let list = data(await c.tool('read_list', { list_id: h.ids.maison }));
  assert.deepEqual(list.list.people.sort(), ['Guillaume', 'Marie']);
  assert.equal(list.list.you, 'Guillaume');
  // Attribuer par le prénom (accents et majuscules ignorés)
  const updated = data(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, assigned_to: 'marie' }] }));
  assert.equal(updated.results[0].assigned_to, 'Marie');
  list = data(await c.tool('read_list', { list_id: h.ids.maison }));
  assert.equal(list.items.find((i) => i.id === h.ids.ampoule).assigned_to, 'Marie');
  const added = data(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Tondre', assigned_to: 'Guillaume' }] }));
  assert.equal(added.results[0].assigned_to, 'Guillaume');
  // Texte vide : à personne
  assert.equal(data(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, assigned_to: '' }] })).results[0].assigned_to, null);
  // Prénom inconnu : refus de tout l'appel, la liste des personnes donnée, rien n'est écrit
  const count = () => h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get();
  const before = count();
  const unknown = toolError(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'A' }, { name: 'B', assigned_to: 'Zoé' }] }));
  assert.match(unknown, /^Personne inconnue dans cette liste : « Zoé »\. Personnes possibles : .*Guillaume.*Marie|^Personne inconnue dans cette liste : « Zoé »\. Personnes possibles : .*Marie.*Guillaume/);
  assert.equal(count(), before);
  // Liste sans l'option, liste de courses
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.secret, items: [{ name: 'X', assigned_to: 'Marie' }] })), ASSIGN_OFF);
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, assigned_to: 'Marie' }] })), ASSIGN_NOT_HERE);
  // Pas de « people » sans l'option
  assert.equal(data(await c.tool('read_list', { list_id: h.ids.secret })).list.people, undefined);
  // Mauvais type : paramètres refusés
  assert.equal((await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, assigned_to: 2 }] })).body.error?.code, -32602);
});

// --- Téléphone ---

test('copie locale : option, attribution, tri « Par personne » (Moi, les autres, Personne) ; « Les miennes » et pastille d\'« Échéances »', () => {
  const state = emptyState();
  const user = { id: 1, username: 'g', displayName: 'Guillaume' };
  const now = '2030-01-07T08:00:00.000Z';
  applyOp(state, { type: 'list.create', listId: 'l', name: 'Maison', listType: 'tasks', dueEnabled: true, assignEnabled: true }, { user, now });
  const list = state.lists.get('l');
  state.lists.set('l', { ...list, members: [...list.members, { id: 2, displayName: 'Léa', active: true, isOwner: false, access: 'modification' }, { id: 3, displayName: 'Paul', active: true, isOwner: false, access: 'lecture' }, { id: 4, displayName: 'Anne', active: true, isOwner: false, access: 'modification' }] });
  assert.deepEqual(listOptions(state.lists.get('l')), { priority: false, due: true, assign: true });
  assert.deepEqual(availableSorts(state.lists.get('l')), ['alpha', 'due', 'person']);
  assert.deepEqual(assignablePeople(state.lists.get('l')).map((p) => p.displayName), ['Anne', 'Guillaume', 'Léa'], 'pas Paul (lecture seule)');
  for (const [id, name, assignedTo] of [['a', 'Zinc', 2], ['b', 'Bois', 1], ['c', 'Clou', null], ['d', 'Ail', 4], ['e', 'Eau', 2]]) {
    applyOp(state, { type: 'item.create', listId: 'l', itemId: id, name, dueDate: '2030-01-07', ...(assignedTo ? { assignedTo } : {}) }, { user, now });
  }
  assert.equal(state.items.get('a').assignedTo, 2);
  applyOp(state, { type: 'item.update', itemId: 'c', name: 'Clous' }, { user, now });
  assert.equal(state.items.get('c').assignedTo, null, 'champ absent : inchangé');
  const view = computeListView(state, 'l', { sort: 'person', me: 1 });
  assert.deepEqual(view.groups.map((g) => [g.label, g.items.map((i) => i.name)]), [['Moi', ['Bois']], ['Anne', ['Ail']], ['Léa', ['Eau', 'Zinc']], ['Personne', ['Clous']]]);
  assert.deepEqual(sortTasks([{ name: 'X', assignedTo: 99 }], 'person', { people: new Map([[1, 'G']]), me: 1 }).map((g) => g.label), ['Personne'], 'plus membre : « Personne »');
  // « Les miennes » : seulement les miennes ; pastille : les miennes et celles de personne
  const mine = computeDeadlines(state, { today: '2030-01-07', mine: true, me: 1 }).flatMap((g) => g.entries.map((e) => e.item.name));
  assert.deepEqual(mine, ['Bois']);
  assert.equal(computeDeadlines(state, { today: '2030-01-07', me: 1 }).flatMap((g) => g.entries).length, 5, '« Toutes »');
  assert.equal(deadlineBadge(state, '2030-01-07', 1), 2, 'Bois et Clous');
  assert.equal(deadlineBadge(state, '2030-01-07', 2), 3, 'Léa : Eau, Zinc et Clous');
  // Option désactivée : plus de tri par personne, plus de filtre, tout compte
  applyOp(state, { type: 'list.update', listId: 'l', assignEnabled: false }, { user, now });
  assert.deepEqual(availableSorts(state.lists.get('l')), ['alpha', 'due']);
  assert.equal(deadlineBadge(state, '2030-01-07', 1), 5);
});

test('écran : « Pour » seulement avec l\'option ; pastille « Moi » ou prénom ; jamais sur la page publique ; « Toutes / Les miennes » retenu ; texte sûr', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /\[assignField, options\(\)\.assign\]/);
  assert.match(list, /if \(assignMode === 'one'\) changes\.assignedTo = assignee;/);
  assert.match(list, /if \(people\.some\(\(p\) => p\.id === app\.user\.id\)\) choices\.push\(\[String\(app\.user\.id\), 'Moi'\]\);/);
  assert.match(list, /icon\(turn \? 'users' : 'user', 'icon--xs'\), who\.name\)/);
  assert.match(list, /\['person', 'users', 'Par personne', 'Tri : par personne'\]/);
  const page = read('public/js/public.js') + read('public/js/format.js');
  assert.doesNotMatch(page, /assignedTo|assign/);
  assert.doesNotMatch(read('server/routes/public.js'), /assigned_to|assignedTo|assign_enabled/);
  const deadlines = read('public/js/screens/deadlines.js');
  assert.match(deadlines, /const SCOPE_KEY = 'listo-echeances-miennes';/);
  assert.match(deadlines, /const offered = \[\.\.\.app\.data\.lists\.values\(\)\]\.some\(\(list\) => listOptions\(list\)\.assign\);/);
  for (const file of ['public/js/screens/list.js', 'public/js/screens/deadlines.js', 'public/js/screens/list-form.js', 'public/js/deadlines.js', 'public/js/sorting.js']) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /innerHTML|outerHTML|insertAdjacentHTML/, file);
  }
  // Formulaire de la liste : l'interrupteur, pour les listes de tâches seulement
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /\['assign', 'Attribution', 'Confier une tâche à une personne de la liste\.'\],/);
  assert.match(form, /if \(withAssign && options\.assign !== saved\.assign\) switches\.assignEnabled = options\.assign;/);
  // Notifications : la catégorie s'appelle « Modifications »
  assert.match(read('public/js/screens/notifications.js'), /\['changes', 'Modifications', /);
});
