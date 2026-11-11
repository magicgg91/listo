// Plusieurs personnes sur une tâche, et « chacun son tour » (décisions du
// 11 novembre 2026, migration 28) : règles partagées (public/js/assign.js),
// serveur (refus sans rien écrire, tour au coché, « Passer cette fois »,
// départ d'un membre), notifications (« C'est votre tour », résumé de 8 h,
// rappels), copie locale, Claude, écran.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { household as mcpHousehold, connect, claude, data, PASSWORD } from './mcp-helpers.js';
import { BAD_PEOPLE, TURN_NEEDS_REPEAT, BAD_ASSIGN_MODE } from '../server/lists.js';
import { GROUP_MS } from '../server/notify.js';
import { nextInTurn, turnAfterCheck, withoutPerson, isPeopleList, assigneesOf, parsePeople, formatPeople } from '../public/js/assign.js';
import { emptyState, applyOp } from '../public/js/store.js';
import { sortTasks } from '../public/js/sorting.js';
import { computeDeadlines, deadlineBadge } from '../public/js/deadlines.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// --- Règles partagées ---

test('règles : tour suivant (après celui qui coche), départ d\'une personne, listes valables', () => {
  const [lea, marc, zoe] = [2, 3, 4];
  assert.equal(nextInTurn([lea, marc, zoe], lea), marc);
  assert.equal(nextInTurn([lea, marc, zoe], zoe), lea);
  assert.equal(nextInTurn([lea, marc, zoe], 99), lea, 'hors du tour : la première');
  // Léa coche son tour : Marc ; Marc fait celle de Léa : Zoé ; quelqu'un hors du tour : après Léa
  assert.equal(turnAfterCheck([lea, marc, zoe], lea, lea), marc);
  assert.equal(turnAfterCheck([lea, marc, zoe], lea, marc), zoe);
  assert.equal(turnAfterCheck([lea, marc, zoe], lea, 1), marc);
  // Départ : la suivante prend sa place ; seule restante : « une personne » ; personne : Personne
  assert.deepEqual(withoutPerson({ mode: 'turn', people: [lea, marc, zoe], assignedTo: lea }, lea), { mode: 'turn', people: [marc, zoe], assignedTo: marc });
  assert.deepEqual(withoutPerson({ mode: 'turn', people: [lea, marc, zoe], assignedTo: marc }, lea), { mode: 'turn', people: [marc, zoe], assignedTo: marc });
  assert.deepEqual(withoutPerson({ mode: 'turn', people: [lea, marc], assignedTo: lea }, lea), { mode: 'one', people: [], assignedTo: marc });
  assert.deepEqual(withoutPerson({ mode: 'all', people: [lea, marc, zoe], assignedTo: null }, marc), { mode: 'all', people: [lea, zoe], assignedTo: null });
  assert.deepEqual(withoutPerson({ mode: 'all', people: [lea, marc], assignedTo: null }, marc), { mode: 'one', people: [], assignedTo: lea });
  assert.deepEqual(withoutPerson({ mode: 'one', people: [], assignedTo: lea }, lea), { mode: 'one', people: [], assignedTo: null });
  for (const bad of [[], [2], [2, 2], [2, 0], [2, 1.5], Array.from({ length: 21 }, (_, i) => i + 1), '2,3']) assert.equal(isPeopleList(bad), false, JSON.stringify(bad));
  assert.equal(isPeopleList([2, 3]), true);
  assert.deepEqual(parsePeople('3,5,7'), [3, 5, 7]);
  assert.equal(formatPeople([]), null);
  assert.deepEqual(assigneesOf({ assignMode: 'all', assignPeople: [2, 3], assignedTo: null }), [2, 3]);
  assert.deepEqual(assigneesOf({ assignMode: 'turn', assignPeople: [2, 3], assignedTo: 3 }), [3]);
});

// --- Serveur ---

async function family(t, { push = false } = {}) {
  const pushService = push ? fakePushService() : null;
  const app = await startTestApp(t, push ? { config: { push: true }, pushRequest: pushService } : {});
  if (pushService) pushService.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1 } };
  app.db.prepare("UPDATE users SET display_name = 'Guillaume' WHERE id = 1").run();
  for (const [key, name] of [['lea', 'Léa'], ['marc', 'Marc'], ['camille', 'Camille']]) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  const { lea, marc, camille } = people;
  const g = people.guillaume.client;
  const maison = uuid();
  const send = async (client, op) => (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  await send(g, { type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', dueEnabled: true, assignEnabled: true });
  await g.request('PUT', `/api/lists/${maison}/members`, { userIds: [lea.id, marc.id, camille.id], access: { [lea.id]: 'modification', [marc.id]: 'modification', [camille.id]: 'lecture' } });
  const row = (id) => app.db.prepare('SELECT assign_mode AS mode, assign_people AS people, assigned_to AS current, due_date AS due FROM items WHERE id = ?').get(id);
  let inbox = null;
  if (push) {
    for (const [key, person] of Object.entries(people)) {
      person.device = fakeDevice(`https://fcm.googleapis.com/fcm/send/${key}`, key);
      assert.equal((await person.client.request('PUT', '/api/push/subscription', person.device.subscription)).status, 200);
    }
    inbox = (who) => pushService.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint).map((c) => people[who].device.read(c.body).notification);
  }
  return { app, people, g, maison, send, row, push: pushService, inbox };
}

test('serveur : plusieurs personnes et chacun son tour enregistrés ; refus sans rien écrire', async (t) => {
  const f = await family(t);
  const { lea, marc, camille } = f.people;
  const garage = uuid();
  assert.equal((await f.send(f.g, { type: 'item.create', listId: f.maison, itemId: garage, name: 'Garage', assignMode: 'all', assignPeople: [lea.id, marc.id] })).status, 200);
  assert.deepEqual(f.row(garage), { mode: 'all', people: `${lea.id},${marc.id}`, current: null, due: null });
  const count = () => f.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get();
  const before = count();
  for (const [fields, error] of [
    [{ assignMode: 'all', assignPeople: [lea.id] }, BAD_PEOPLE],
    [{ assignMode: 'all', assignPeople: [lea.id, lea.id] }, BAD_PEOPLE],
    [{ assignMode: 'all', assignPeople: [lea.id, camille.id] }, BAD_PEOPLE], // lecture seule
    [{ assignMode: 'all', assignPeople: [lea.id, 999] }, BAD_PEOPLE],
    [{ assignMode: 'turn', assignPeople: [lea.id, marc.id] }, TURN_NEEDS_REPEAT], // ne se répète pas
    [{ assignMode: 'tous' }, BAD_ASSIGN_MODE],
  ]) {
    const res = await f.send(f.g, { type: 'item.create', listId: f.maison, itemId: uuid(), name: 'Refusée', ...fields });
    assert.equal(res.error, error, JSON.stringify(fields));
  }
  assert.equal(count(), before);
  // La base refuse aussi une forme invalide écrite directement
  assert.throws(() => f.app.db.prepare("UPDATE items SET assign_mode = 'tous' WHERE id = ?").run(garage), /CHECK/);
  assert.throws(() => f.app.db.prepare("UPDATE items SET assign_people = 'a,b' WHERE id = ?").run(garage), /CHECK/);
  // Repasser en « une personne »
  assert.equal((await f.send(f.g, { type: 'item.update', itemId: garage, assignMode: 'one', assignedTo: marc.id })).status, 200);
  assert.deepEqual(f.row(garage), { mode: 'one', people: null, current: marc.id, due: null });
});

test('chacun son tour : la fois suivante va à celui qui suit la personne qui a coché ; « Passer cette fois » garde la même ; plus de répétition : une personne', async (t) => {
  const f = await family(t);
  const { lea, marc } = f.people;
  const g = f.people.guillaume;
  const poubelles = uuid();
  // Ordre : Léa → Marc → Guillaume ; cette fois : Léa (la première)
  assert.equal((await f.send(f.g, { type: 'item.create', listId: f.maison, itemId: poubelles, name: 'Poubelles', dueDate: '2030-01-07', repeat: 'week:1', assignMode: 'turn', assignPeople: [lea.id, marc.id, g.id] })).status, 200);
  assert.deepEqual(f.row(poubelles), { mode: 'turn', people: `${lea.id},${marc.id},${g.id}`, current: lea.id, due: '2030-01-07' });
  // Léa coche : Marc, la semaine suivante
  const done = await f.send(lea.client, { type: 'item.check', itemId: poubelles, checked: true });
  assert.deepEqual([done.repeated, done.nextPerson], ['2030-01-14', marc.id]);
  assert.equal(f.row(poubelles).current, marc.id);
  // Guillaume fait celle de Marc : la suivante est pour celui qui suit Guillaume (Léa)
  await f.send(f.g, { type: 'item.check', itemId: poubelles, checked: true });
  assert.deepEqual([f.row(poubelles).due, f.row(poubelles).current], ['2030-01-21', lea.id]);
  // « Passer cette fois » (la date avance seule) : toujours Léa
  await f.send(f.g, { type: 'item.update', itemId: poubelles, dueDate: '2030-02-04' });
  assert.equal(f.row(poubelles).current, lea.id);
  // « Annuler » d'un coché : la date et la personne d'avant reviennent (personne du tour : reste « chacun son tour »)
  await f.send(lea.client, { type: 'item.check', itemId: poubelles, checked: true });
  await f.send(lea.client, { type: 'item.update', itemId: poubelles, dueDate: '2030-02-04', assignedTo: lea.id });
  assert.deepEqual(f.row(poubelles), { mode: 'turn', people: `${lea.id},${marc.id},${g.id}`, current: lea.id, due: '2030-02-04' });
  // Plus de répétition : « une personne », celle de cette fois
  await f.send(f.g, { type: 'item.update', itemId: poubelles, repeat: null });
  assert.deepEqual(f.row(poubelles), { mode: 'one', people: null, current: lea.id, due: '2030-02-04' });
});

test('départ d\'un membre : retiré du tour ou du groupe ; une seule restante : elle seule ; jamais sur le lien public', async (t) => {
  const f = await family(t);
  const { lea, marc } = f.people;
  const g = f.people.guillaume;
  const tour = uuid();
  const groupe = uuid();
  await f.send(f.g, { type: 'item.create', listId: f.maison, itemId: tour, name: 'Vaisselle', dueDate: '2030-01-07', repeat: 'day', assignMode: 'turn', assignPeople: [lea.id, marc.id, g.id] });
  await f.send(f.g, { type: 'item.create', listId: f.maison, itemId: groupe, name: 'Garage', assignMode: 'all', assignPeople: [lea.id, marc.id] });
  // Léa quitte la liste : Marc prend son tour ; le garage revient à Marc seul
  assert.equal((await lea.client.post(`/api/lists/${f.maison}/leave`, {})).status, 200);
  assert.deepEqual(f.row(tour), { mode: 'turn', people: `${marc.id},${g.id}`, current: marc.id, due: '2030-01-07' });
  assert.deepEqual(f.row(groupe), { mode: 'one', people: null, current: marc.id, due: null });
  // Marc passe en lecture seule : le tour se réduit à Guillaume, seul
  await f.g.request('PUT', `/api/lists/${f.maison}/members`, { userIds: [marc.id], access: { [marc.id]: 'lecture' } });
  assert.deepEqual(f.row(tour), { mode: 'one', people: null, current: g.id, due: '2030-01-07' });
  assert.equal(f.row(groupe).current, null);
  // Lien public : ni personnes, ni mode
  const share = await f.g.request('PUT', `/api/lists/${f.maison}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const page = (await f.app.client({ ip: '203.0.113.9' }).get(`/api/public/${token}`)).body;
  assert.doesNotMatch(JSON.stringify(page), /assign|turn|people|Marc|Léa/i);
});

test('notifications : « C\'est votre tour » à la personne suivante (jamais à celle qui coche) ; résumé de 8 h et rappels à chacune', async (t) => {
  const f = await family(t, { push: true });
  const { lea, marc } = f.people;
  const g = f.people.guillaume;
  const flush = async (ms = GROUP_MS) => {
    f.app.clock.now += ms;
    await f.app.ctx.notify.flushDue();
    await f.app.ctx.push.idle();
  };
  const poubelles = uuid();
  await f.send(f.g, { type: 'item.create', listId: f.maison, itemId: poubelles, name: 'Poubelles', dueDate: '2030-01-07', repeat: 'week:1', assignMode: 'turn', assignPeople: [g.id, lea.id, marc.id] });
  await flush();
  f.push.calls.length = 0;
  // Guillaume coche son tour : Léa reçoit « C'est votre tour » (neutre), personne d'autre ne la reçoit
  await f.send(f.g, { type: 'item.check', itemId: poubelles, checked: true });
  await flush();
  assert.deepEqual(f.inbox('lea').map((n) => n.title), ['C\'est votre tour dans « Maison »']);
  assert.equal(f.inbox('guillaume').length, 0);
  assert.ok(f.inbox('marc').every((n) => !/votre tour/.test(n.title)));
  // Avec le détail : le nom de la tâche
  assert.equal((await marc.client.request('PUT', '/api/push/settings', { detail: true })).status, 200);
  f.push.calls.length = 0;
  await f.send(lea.client, { type: 'item.check', itemId: poubelles, checked: true });
  await flush();
  assert.deepEqual(f.inbox('marc').map((n) => n.title), ['C\'est votre tour : Poubelles']);
  // Résumé de 8 h : la tâche à plusieurs compte pour chacune ; la tâche du tour, seulement pour celle de cette fois
  const day = new Date(f.app.clock.now);
  const today = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  await f.send(f.g, { type: 'item.create', listId: f.maison, itemId: uuid(), name: 'Garage', dueDate: today, assignMode: 'all', assignPeople: [g.id, lea.id] });
  await f.send(f.g, { type: 'item.update', itemId: poubelles, dueDate: today }); // tour de Marc
  // Le lendemain à 8 h 30 : vrai résumé (server/notify.js, runDigest)
  const at8 = new Date(f.app.clock.now);
  at8.setDate(at8.getDate() + 1);
  at8.setHours(8, 30, 0, 0);
  f.app.clock.now = at8.getTime();
  f.push.calls.length = 0;
  await f.app.ctx.notify.runDigest();
  await f.app.ctx.push.idle();
  const digest = (who) => f.inbox(who).find((n) => /tâche/.test(n.title));
  assert.equal(digest('guillaume').title, '1 tâche en retard', 'le garage (à plusieurs)');
  assert.equal(digest('lea').title, '1 tâche en retard', 'le garage (à plusieurs)');
  assert.deepEqual([digest('marc').title, digest('marc').body], ['1 tâche en retard', 'Poubelles'], 'les poubelles (son tour), pas le garage');
  // Rappels : à chacune des personnes (plusieurs), à celle de cette fois (tour)
  assert.match(read('server/notify.js'), /const people = task\.assign_enabled === 1 \? assigneesOf\(\{ assignMode: task\.assign_mode, assignPeople: parsePeople\(task\.assign_people\), assignedTo: task\.assigned_to \}\) : \[\];\s*const recipients = people\.length \? people : q\.members\.all\(task\.list_id\);/);
});

// --- Téléphone (copie locale, Échéances, tri) ---

test('copie locale : le tour passe au coché (hors ligne), « Les miennes » et la pastille d\'Échéances, tri « Par personne »', () => {
  const state = emptyState();
  const [me, lea, marc] = [1, 2, 3];
  const now = '2030-01-07T08:00:00.000Z';
  state.lists.set('l', { id: 'l', type: 'tasks', dueEnabled: true, assignEnabled: true, members: [{ id: me, displayName: 'Moi' }, { id: lea, displayName: 'Léa' }, { id: marc, displayName: 'Marc' }] });
  applyOp(state, { type: 'item.create', listId: 'l', itemId: 't', name: 'Poubelles', dueDate: '2030-01-07', repeat: 'week:1', assignMode: 'turn', assignPeople: [lea, marc, me] }, { user: { id: me }, now });
  assert.equal(state.items.get('t').assignedTo, lea, 'cette fois : la première');
  // Je fais la tâche de Léa : la suivante est pour celui qui me suit (Léa)
  applyOp(state, { type: 'item.check', itemId: 't', checked: true, nextDue: '2030-01-14' }, { user: { id: me }, now });
  assert.deepEqual([state.items.get('t').dueDate, state.items.get('t').assignedTo], ['2030-01-14', lea]);
  applyOp(state, { type: 'item.check', itemId: 't', checked: true, nextDue: '2030-01-21' }, { user: { id: lea }, now });
  assert.equal(state.items.get('t').assignedTo, marc);
  // Plus de répétition : une personne
  applyOp(state, { type: 'item.update', itemId: 't', repeat: null }, { user: { id: me }, now });
  assert.deepEqual([state.items.get('t').assignMode, state.items.get('t').assignPeople, state.items.get('t').assignedTo], ['one', [], marc]);
  // Plusieurs personnes : dans « Les miennes » de chacune
  applyOp(state, { type: 'item.create', listId: 'l', itemId: 'g', name: 'Garage', dueDate: '2030-01-07', assignMode: 'all', assignPeople: [me, lea] }, { user: { id: me }, now });
  const mine = (who) => computeDeadlines(state, { today: '2030-01-07', mine: true, me: who }).flatMap((group) => group.entries.map((e) => e.item.name));
  assert.deepEqual(mine(me), ['Garage']);
  assert.deepEqual(mine(lea), ['Garage']);
  assert.deepEqual(mine(marc), ['Poubelles'], 'une personne : Marc, celle de la dernière fois');
  assert.equal(deadlineBadge(state, '2030-01-07', lea), 1);
  // Tri « Par personne » : « Moi » si j'en fais partie, sinon « À plusieurs »
  const groups = sortTasks([...state.items.values()], 'person', { people: new Map([[lea, 'Léa'], [marc, 'Marc'], [me, 'Moi']]), me: marc });
  assert.deepEqual(groups.map((group) => group.label), ['Moi', 'À plusieurs']);
});

// --- Claude ---

test('Claude : together et turn en lecture et en écriture ; refus de tout l\'appel sinon', async (t) => {
  const h = await mcpHousehold(t);
  const marieId = h.marieId;
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.update', listId: h.ids.maison, assignEnabled: true, dueEnabled: true }] });
  h.app.db.prepare("UPDATE users SET display_name = 'Guillaume' WHERE id = 1").run();
  await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/members`, { userIds: [marieId], access: { [marieId]: 'modification' } });
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const toolError = (r) => (r.body.result?.isError ? r.body.result.content[0].text : null);
  const added = data(await c.tool('add_items', { list_id: h.ids.maison, items: [
    { name: 'Garage', together: ['marie', 'Guillaume'] },
    { name: 'Poubelles', due_date: '2030-01-07', repeat: { every: 'week' }, turn: ['Marie', 'Guillaume'] },
  ] }));
  assert.deepEqual(added.results.map((r) => [r.together ?? null, r.turn ?? null, r.assigned_to ?? null]), [[['Marie', 'Guillaume'], null, null], [null, ['Marie', 'Guillaume'], 'Marie']]);
  const listed = data(await c.tool('read_list', { list_id: h.ids.maison })).items;
  assert.deepEqual(listed.find((i) => i.name === 'Garage').together, ['Marie', 'Guillaume']);
  assert.deepEqual(listed.find((i) => i.name === 'Poubelles').turn, ['Marie', 'Guillaume']);
  // Refus : tour sans répétition, prénom inconnu, un seul prénom, les deux à la fois
  const before = h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get();
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'A' }, { name: 'B', turn: ['Marie', 'Guillaume'] }] })), TURN_NEEDS_REPEAT);
  assert.match(toolError(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'C', together: ['Marie', 'Zorro'] }] })), /Personne inconnue/);
  assert.equal((await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'D', together: ['Marie'] }] })).body.error?.code, -32602);
  assert.equal((await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'E', together: ['Marie', 'Guillaume'], turn: ['Marie', 'Guillaume'] }] })).body.error?.code, -32602);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get(), before, 'rien d\'écrit');
  // Modifier : passer le garage en « une personne »
  const garage = listed.find((i) => i.name === 'Garage');
  const updated = data(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: garage.id, assigned_to: 'Marie' }] }));
  assert.equal(updated.results[0].assigned_to, 'Marie');
  assert.equal(updated.results[0].together, undefined);
});

// --- Écran ---

test('écran : « Plusieurs personnes… » et « Chacun son tour… » (tâche qui se répète), au moins deux, pastilles et message du tour', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /choices\.push\(\['all', 'Plusieurs personnes…'\]\);\s*if \(repeat \|\| assignMode === 'turn'\) choices\.push\(\['turn', 'Chacun son tour…'\]\);/);
  assert.match(list, /if \(enabled\.assign && assignMode !== 'one' && assignPeople\.length < 2\) \{\s*toast\('Choisissez au moins deux personnes\.'\);\s*return;\s*\}/);
  assert.match(list, /const text = assignMode === 'turn' && on \? `\$\{rank \+ 1\} · \$\{nameOf\(id\)\}` : nameOf\(id\);/);
  assert.match(list, /toast\(`Prochaine fois : \$\{dueDateLabel\(next\)\}\$\{who\}`/);
  assert.match(read('public/js/actions.js'), /return turnAfterCheck\(item\.assignPeople \?\? \[\], item\.assignedTo \?\? null, app\.user\?\.id\);/);
  assert.match(read('public/sw.js'), /'\/js\/assign\.js',/);
  for (const file of ['public/js/assign.js', 'public/js/screens/list.js', 'public/js/screens/deadlines.js']) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /innerHTML|outerHTML|insertAdjacentHTML/, file);
  }
});

// --- Fiche d'une tâche en sous-pages ---

test('fiche d\'une tâche : lignes résumées, sous-pages, Retour et Échap reviennent à la fiche, pas de quantité', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /const dueSub = tasks \? subpage\('Échéance', 'calendar', \[dueField, timeField, remindField\]\) : null;/);
  assert.match(list, /const repeatSub = tasks \? subpage\('Se répète', 'repeat', \[repeatField\]\) : null;/);
  assert.match(list, /const assignSub = tasks \? subpage\('Pour', 'users', \[assignField\]\) : null;/);
  assert.match(list, /sheet\.setBack\(\(\) => leaveSub\(\)\);/);
  assert.match(list, /: tasks && !item\.quantity \? null/);
  assert.match(list, /h\('div', \{ class: 'due-shortcuts due-shortcuts--row' \}, shortcut\("Aujourd'hui", 0\), shortcut\('Demain', 1\), weekShortcut\)\)/);
  // Le focus va au titre de la sous-page (jamais un champ), et revient à la ligne
  assert.match(list, /entry\.heading\.focus\(\);/);
  // Sous-page : une seule ligne (« ‹ » et le titre), en-tête et pied de la fiche cachés ; pas de hauteur forcée
  assert.match(list, /:scope > \.sheet__head, :scope > \.pc-panel__head, :scope > \.pc-panel__foot'\) \?\? \[\]\) part\.hidden = !shown;/);
  assert.match(read('public/js/ui.js'), /scrim\.addEventListener\('click', \(\) => \{\s*if \(backHandler\?\.\(\)\) return;\s*close\(\);/);
  assert.match(list, /currentSub = entry;\s*showSheetActions\(false\);/);
  assert.match(list, /form\.classList\.remove\('is-sub'\);\s*showSheetActions\(true\);/);
  assert.doesNotMatch(list, /form\.style\.minHeight/);
  assert.match(list, /const heading = h\('h3', \{ class: 'subpage__title', tabindex: '-1' \}, title\);/);
  // Retour : la fenêtre gère d'abord le retour (ui.js), le routeur remet son entrée
  const ui = read('public/js/ui.js');
  assert.match(ui, /if \(event\.key === 'Escape' && backHandler\?\.\(\)\) return;/);
  assert.match(ui, /openOverlay\(remove, \{ push: history, back: \(\) => Boolean\(backHandler\?\.\(\)\) \}\)/);
  assert.match(read('public/js/router.js'), /if \(top\.pushed && top\.back\?\.\(\)\) \{\s*history\.pushState\(\{ depth: depth\(\), overlay: true \}, '', location\.hash\);\s*return;\s*\}/);
  const css = read('public/css/app.css');
  assert.match(css, /\.is-sub > :not\(\.subpage\) \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 359px\) \{ \.due-shortcuts--row \.btn \{ font-size: var\(--text-sm\); \} \}/);
});

test('routeur : une fenêtre qui gère Retour reste ouverte, son entrée d\'historique revient', async () => {
  // Petit faux navigateur : historique et écouteurs, sans DOM
  const listeners = {};
  const entries = [{ state: null, hash: '#/listes/a' }];
  let index = 0;
  globalThis.location = { get hash() { return entries[index].hash; } };
  globalThis.history = {
    get state() { return entries[index].state; },
    replaceState(state, _t, hash) { entries[index] = { state, hash: hash ?? entries[index].hash }; },
    pushState(state, _t, hash) { entries.splice(index + 1); entries.push({ state, hash }); index++; },
    back() { index--; queueMicrotask(() => listeners.popstate?.()); },
    go(n) { index += n; queueMicrotask(() => listeners.popstate?.()); },
  };
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  const router = await import(`../public/js/router.js?test=${Date.now()}`);
  router.startRouter(() => {});
  let closed = false;
  let sub = true;
  router.openOverlay(() => { closed = true; }, { back: () => { if (!sub) return false; sub = false; return true; } });
  await new Promise((r) => setTimeout(r, 10));
  const depth = entries.length;
  // Retour avec une sous-page ouverte : la sous-page se ferme, la fenêtre reste
  history.back();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual([closed, sub, entries.length, index], [false, false, depth, depth - 1]);
  // Retour suivant : la fenêtre se ferme
  history.back();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, true);
  delete globalThis.location; delete globalThis.history; delete globalThis.window;
});
