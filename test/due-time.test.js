// Heure d'échéance et rappel (décisions du 11 novembre 2026) : module
// partagé (public/js/due-time.js), règles du serveur (migration 26 ; refus
// sans rien écrire ; effacements en cascade), lien public (l'heure, jamais
// le rappel), rappels push (une fois, à la bonne personne, rattrapage de
// 30 minutes, ni coché ni silencé), résumé de 8 h avec l'heure, Claude,
// copie locale, « En retard » dès l'heure dépassée, tri.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { household as mcpHousehold, connect, claude, data, PASSWORD } from './mcp-helpers.js';
import { BAD_TIME, BAD_REMINDER, TIME_NEEDS_DUE, REMIND_NEEDS_TIME, DUE_NOT_HERE } from '../server/lists.js';
import { localDay, REMIND_LATE_MS } from '../server/notify.js';
import { isDueTime, isReminder, isLate, compareDue, reminderAt, timeLabel, nowTime, REMINDERS } from '../public/js/due-time.js';
import { dueChip } from '../public/js/format.js';
import { deadlineGroup } from '../public/js/deadlines.js';
import { sortTasks } from '../public/js/sorting.js';
import { emptyState, applyOp } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// --- Module partagé ---

test('heure et rappel : formes acceptées, « En retard » dès l\'heure dépassée, ordre, moment du rappel', () => {
  for (const ok of ['00:00', '09:05', '23:59', '12:30']) assert.ok(isDueTime(ok), ok);
  for (const bad of ['24:00', '9:05', '09:5', '09:60', '0905', ' 09:05', '09:05:00', '', null, 905]) assert.equal(isDueTime(bad), false, String(bad));
  assert.deepEqual(REMINDERS.map(([m]) => m), [null, 0, 15, 30, 60, 120, 1440]);
  for (const ok of [0, 15, 30, 60, 120, 1440]) assert.ok(isReminder(ok));
  for (const bad of [null, 5, 45, 90, '60', 60.5, -15]) assert.equal(isReminder(bad), false, String(bad));
  assert.equal(timeLabel('09:05'), '9:05');
  assert.equal(timeLabel('18:30'), '18:30');
  assert.equal(nowTime(new Date(2026, 10, 11, 7, 4)), '07:04');
  // En retard : date passée ; ou aujourd'hui, heure dépassée (pas à la minute même)
  assert.equal(isLate('2026-11-10', null, '2026-11-11', '08:00'), true);
  assert.equal(isLate('2026-11-11', null, '2026-11-11', '23:59'), false, 'sans heure : en retard seulement le lendemain');
  assert.equal(isLate('2026-11-11', '14:00', '2026-11-11', '14:00'), false);
  assert.equal(isLate('2026-11-11', '14:00', '2026-11-11', '14:01'), true);
  assert.equal(isLate('2026-11-12', '00:00', '2026-11-11', '23:59'), false);
  // Ordre : la date, puis l'heure ; sans heure après les heures du même jour
  const tasks = [['d', '2026-11-12', null], ['c', '2026-11-11', null], ['b', '2026-11-11', '18:00'], ['a', '2026-11-11', '09:00']];
  assert.deepEqual(tasks.sort((x, y) => compareDue(x[1], x[2], y[1], y[2])).map((t) => t[0]), ['a', 'b', 'c', 'd']);
  // Moment du rappel (heure locale)
  assert.equal(reminderAt('2026-11-12', '14:00', 60), new Date(2026, 10, 12, 13, 0).getTime());
  assert.equal(reminderAt('2026-11-12', '14:00', 1440), new Date(2026, 10, 11, 14, 0).getTime(), 'la veille, 24 h pile avant');
  assert.equal(reminderAt('2026-11-12', '14:00', 0), new Date(2026, 10, 12, 14, 0).getTime());
  assert.equal(reminderAt('2026-11-12', null, 60), null);
  assert.equal(reminderAt('2026-11-12', '14:00', null), null);
  // Pastille : l'heure, et « En retard » à l'heure dépassée
  assert.deepEqual(dueChip('2026-11-11', false, '2026-11-11', '18:30', '10:00'), { state: 'today', text: 'Aujourd\'hui · 18:30', label: 'Échéance : aujourd\'hui à 18:30' });
  assert.deepEqual(dueChip('2026-11-11', false, '2026-11-11', '09:00', '10:00'), { state: 'late', text: 'En retard · 9:00', label: 'Échéance : aujourd\'hui à 9:00, en retard' });
  assert.equal(dueChip('2026-11-12', false, '2026-11-11', '07:30', '10:00').text, 'Demain · 7:30');
  assert.equal(dueChip('2026-11-11', false, '2026-11-11', null, '23:00').text, 'Aujourd\'hui', 'sans heure : comme avant');
  assert.equal(deadlineGroup('2026-11-11', '2026-11-11', '09:00', '10:00'), 'late');
  assert.equal(deadlineGroup('2026-11-11', '2026-11-11', '11:00', '10:00'), 'today');
  // Tri « Par échéance » : l'heure départage
  const sorted = sortTasks([
    { name: 'Sans heure', dueDate: '2026-11-11' }, { name: 'Soir', dueDate: '2026-11-11', dueTime: '19:00' }, { name: 'Matin', dueDate: '2026-11-11', dueTime: '08:00' },
  ], 'due');
  assert.deepEqual(sorted[0].items.map((i) => i.name), ['Matin', 'Soir', 'Sans heure']);
});

// --- Serveur ---

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const lists = { maison: uuid(), courses: uuid() };
  const items = { plombier: uuid(), lait: uuid() };
  const res = await guillaume.post('/api/ops', { ops: [
    { type: 'list.create', listId: lists.maison, name: 'Maison', listType: 'tasks', dueEnabled: true },
    { type: 'item.create', listId: lists.maison, itemId: items.plombier, name: 'Plombier', dueDate: '2030-01-07' },
    { type: 'list.create', listId: lists.courses, name: 'Courses', listType: 'shopping' },
    { type: 'item.create', listId: lists.courses, itemId: items.lait, name: 'Lait' },
  ].map((o) => ({ id: uuid(), ...o })) });
  assert.ok(res.body.results.every((r) => r.status === 200), res.text);
  const row = (id) => app.db.prepare('SELECT due_date, due_time, remind_before, repeat FROM items WHERE id = ?').get(id);
  return { app, guillaume, lists, items, row };
}
const op = async (client, operation) => {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...operation }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
};

test('serveur : heure et rappel enregistrés ; refus sans rien écrire ; effacer la date efface l\'heure, effacer l\'heure efface le rappel', async (t) => {
  const h = await household(t);
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.plombier, dueTime: '14:00', remindBefore: 60 })).status, 200);
  assert.deepEqual(h.row(h.items.plombier), { due_date: '2030-01-07', due_time: '14:00', remind_before: 60, repeat: null });
  const before = h.row(h.items.plombier);
  for (const [fields, error] of [
    [{ dueTime: '24:00' }, BAD_TIME], [{ dueTime: '9:00' }, BAD_TIME], [{ dueTime: 900 }, BAD_TIME],
    [{ remindBefore: 45 }, BAD_REMINDER], [{ remindBefore: '60' }, BAD_REMINDER],
  ]) {
    const res = await op(h.guillaume, { type: 'item.update', itemId: h.items.plombier, name: 'Ne doit pas être écrit', ...fields });
    assert.equal(res.error, error, JSON.stringify(fields));
  }
  assert.deepEqual(h.row(h.items.plombier), before);
  // Liste de courses : refus
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.items.lait, dueTime: '10:00' })).error, DUE_NOT_HERE);
  // Création : heure sans date, rappel sans heure
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.lists.maison, itemId: uuid(), name: 'X', dueTime: '10:00' })).error, TIME_NEEDS_DUE);
  assert.equal((await op(h.guillaume, { type: 'item.create', listId: h.lists.maison, itemId: uuid(), name: 'Y', dueDate: '2030-01-08', remindBefore: 15 })).error, REMIND_NEEDS_TIME);
  // Effacer l'heure efface le rappel ; effacer la date efface l'heure
  await op(h.guillaume, { type: 'item.update', itemId: h.items.plombier, dueTime: null });
  assert.deepEqual(h.row(h.items.plombier), { due_date: '2030-01-07', due_time: null, remind_before: null, repeat: null });
  await op(h.guillaume, { type: 'item.update', itemId: h.items.plombier, dueTime: '08:00', remindBefore: 1440 });
  await op(h.guillaume, { type: 'item.update', itemId: h.items.plombier, dueDate: null });
  assert.deepEqual(h.row(h.items.plombier), { due_date: null, due_time: null, remind_before: null, repeat: null });
  // Tâche qui se répète : elle garde son heure et son rappel à sa date suivante
  await op(h.guillaume, { type: 'item.update', itemId: h.items.plombier, dueDate: '2030-01-07', repeat: 'week:1', dueTime: '07:30', remindBefore: 30 });
  assert.equal((await op(h.guillaume, { type: 'item.check', itemId: h.items.plombier, checked: true })).repeated, '2030-01-14');
  assert.deepEqual(h.row(h.items.plombier), { due_date: '2030-01-14', due_time: '07:30', remind_before: 30, repeat: 'week:1' });
  // Synchronisation, duplication
  const synced = (await h.guillaume.get('/api/sync')).body.items.find((i) => i.id === h.items.plombier);
  assert.deepEqual([synced.dueTime, synced.remindBefore], ['07:30', 30]);
  const copy = await h.guillaume.post(`/api/lists/${h.lists.maison}/duplicate`, { name: 'Maison (copie)', withItems: true });
  assert.deepEqual(h.app.db.prepare('SELECT due_time, remind_before FROM items WHERE list_id = ?').get(copy.body.list.id), { due_time: '07:30', remind_before: 30 });
  // Base : formes refusées même écrites directement
  assert.throws(() => h.app.db.prepare('UPDATE items SET due_time = ? WHERE id = ?').run('7:30', h.items.plombier), /CHECK/);
  assert.throws(() => h.app.db.prepare('UPDATE items SET remind_before = ? WHERE id = ?').run(45, h.items.plombier), /CHECK/);
  // Lien public : l'heure, jamais le rappel
  const share = await h.guillaume.request('PUT', `/api/lists/${h.lists.maison}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const page = (await createClient(h.app.base, { ip: '203.0.113.9' }).get(`/api/public/${token}`)).body;
  const plombier = page.groups.flatMap((g) => g.items).find((i) => i.name === 'Plombier');
  assert.equal(plombier.dueTime, '07:30');
  assert.doesNotMatch(JSON.stringify(page), /remind/i);
});

// --- Rappels ---

async function pushFamily(t) {
  const push = fakePushService();
  const app = await startTestApp(t, { config: { push: true }, pushRequest: push });
  push.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1 } };
  for (const key of ['lea', 'marc']) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  for (const [key, person] of Object.entries(people)) {
    person.device = fakeDevice(`https://fcm.googleapis.com/fcm/send/${key}`, key);
    assert.equal((await person.client.request('PUT', '/api/push/subscription', person.device.subscription)).status, 200);
  }
  const inbox = (who) => push.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint).map((c) => people[who].device.read(c.body).notification);
  const run = async (at) => {
    app.clock.now = at;
    await app.ctx.notify.runReminders();
    await app.ctx.push.idle();
  };
  return { app, push, people, inbox, run };
}

test('rappels : au bon moment, une seule fois ; à la personne attribuée, sinon aux membres ; rattrapage 30 min ; ni coché, ni silencé, ni catégorie coupée', async (t) => {
  const f = await pushFamily(t);
  const g = f.people.guillaume.client;
  const maison = uuid();
  const [tondre, vitres, linge] = [uuid(), uuid(), uuid()];
  const tomorrow = localDay(new Date(f.app.clock.now + 24 * 3600 * 1000));
  await g.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', dueEnabled: true, assignEnabled: true },
    { id: uuid(), type: 'item.create', listId: maison, itemId: tondre, name: 'Tondre', dueDate: tomorrow, dueTime: '14:00', remindBefore: 60 },
    { id: uuid(), type: 'item.create', listId: maison, itemId: vitres, name: 'Vitres', dueDate: tomorrow, dueTime: '16:00', remindBefore: 1440 },
    { id: uuid(), type: 'item.create', listId: maison, itemId: linge, name: 'Linge', dueDate: tomorrow, dueTime: '18:00', remindBefore: 0 },
  ] });
  await g.request('PUT', `/api/lists/${maison}/members`, { userIds: [f.people.lea.id, f.people.marc.id], access: { [f.people.lea.id]: 'modification', [f.people.marc.id]: 'modification' } });
  await g.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: tondre, assignedTo: f.people.lea.id }] });
  await f.app.ctx.push.idle();
  f.push.calls.length = 0;
  const at = (task, minutes) => {
    const [y, m, d] = tomorrow.split('-').map(Number);
    const [hh, mm] = task.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm).getTime() - minutes * 60000;
  };
  // Une minute avant le moment : rien
  await f.run(at('14:00', 60) - 60000);
  assert.equal(f.push.calls.length, 0);
  // Au moment : Léa seule (tâche attribuée), texte neutre
  await f.run(at('14:00', 60));
  assert.deepEqual(f.inbox('lea').map((n) => [n.title, n.body]), [['Rappel : une tâche aujourd\'hui à 14:00', 'Dans « Maison »']]);
  assert.equal(f.inbox('guillaume').length + f.inbox('marc').length, 0);
  // Une minute après : pas une seconde fois
  await f.run(at('14:00', 60) + 60000);
  assert.equal(f.inbox('lea').length, 1);
  // « La veille » (Vitres) : personne attribuée -> tous les membres, avec le détail pour Marc
  assert.equal((await f.people.marc.client.request('PUT', '/api/push/settings', { detail: true })).status, 200);
  f.push.calls.length = 0;
  await f.run(at('16:00', 1440));
  assert.equal(f.inbox('guillaume').length, 1);
  assert.equal(f.inbox('lea').length, 1);
  assert.deepEqual(f.inbox('marc').map((n) => [n.title, n.body]), [['Rappel : Vitres', 'Demain à 16:00 · « Maison »']]);
  // Changer l'heure prévoit un nouveau rappel
  f.push.calls.length = 0;
  await g.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: tondre, dueTime: '15:00' }] });
  await f.run(at('15:00', 60));
  assert.equal(f.inbox('lea').length, 1, 'nouvelle heure : nouveau rappel');
  // Rattrapage : plus de 30 min de retard -> abandonné ; coché -> rien
  f.push.calls.length = 0;
  await f.run(at('18:00', 0) + REMIND_LATE_MS + 60000);
  assert.equal(f.push.calls.length, 0, 'trop tard : abandonné');
  await g.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: linge, dueTime: '19:00' }, { id: uuid(), type: 'item.check', itemId: linge, checked: true }] });
  await f.run(at('19:00', 0));
  assert.equal(f.push.calls.length, 0, 'coché : rien');
  // Silencé, catégorie « Échéances » coupée
  await g.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId: maison, itemId: uuid(), name: 'Courrier', dueDate: tomorrow, dueTime: '20:00', remindBefore: 0 }] });
  assert.equal((await f.people.lea.client.request('PUT', `/api/push/mutes/${maison}`, { muted: true })).status, 200);
  assert.equal((await f.people.marc.client.request('PUT', '/api/push/settings', { due: false })).status, 200);
  f.push.calls.length = 0;
  await f.run(at('20:00', 0));
  assert.equal(f.inbox('marc').length, 0, 'catégorie coupée');
  assert.equal(f.inbox('lea').length, 0, 'liste silencée');
  assert.equal(f.inbox('guillaume').length, 1);
});

// --- Claude ---

test('Claude : due_time et remind en lecture et en écriture ; refus de tout l\'appel sinon', async (t) => {
  const h = await mcpHousehold(t);
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const toolError = (r) => (r.body.result?.isError ? r.body.result.content[0].text : null);
  const added = data(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Plombier', due_date: '2030-01-10', due_time: '14:00', remind: '30min' }] }));
  assert.deepEqual([added.results[0].due_time, added.results[0].remind], ['14:00', '30min']);
  const listed = data(await c.tool('read_list', { list_id: h.ids.maison })).items.find((i) => i.name === 'Plombier');
  assert.deepEqual([listed.due_date, listed.due_time, listed.remind], ['2030-01-10', '14:00', '30min']);
  const updated = data(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: listed.id, remind: 'day_before' }] }));
  assert.equal(updated.results[0].remind, 'day_before');
  assert.equal(data(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: listed.id, due_time: null }] })).results[0].remind, 'none', 'sans heure : plus de rappel');
  // Refus de tout l'appel
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'A' }, { name: 'B', due_time: '10:00' }] })), TIME_NEEDS_DUE);
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: listed.id, remind: '1h' }] })), REMIND_NEEDS_TIME);
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'C', due_date: '2030-01-10', due_time: '25:00' }] })), BAD_TIME);
  assert.equal((await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'D', due_date: '2030-01-10', due_time: '10:00', remind: '45min' }] })).body.error?.code, -32602);
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM items WHERE name IN ('A', 'B', 'C', 'D')").pluck().get(), 0);
});

// --- Téléphone ---

test('copie locale et écran : effacements en cascade ; champs « Heure » et « Rappel » avec l\'échéance seulement ; jamais le rappel sur la page publique', () => {
  const state = emptyState();
  const user = { id: 1, username: 'g', displayName: 'G' };
  const now = '2030-01-07T08:00:00.000Z';
  applyOp(state, { type: 'list.create', listId: 'l', name: 'Maison', listType: 'tasks', dueEnabled: true }, { user, now });
  applyOp(state, { type: 'item.create', listId: 'l', itemId: 'i', name: 'Plombier', dueDate: '2030-01-07', dueTime: '14:00', remindBefore: 60 }, { user, now });
  assert.deepEqual([state.items.get('i').dueTime, state.items.get('i').remindBefore], ['14:00', 60]);
  applyOp(state, { type: 'item.update', itemId: 'i', dueTime: null }, { user, now });
  assert.deepEqual([state.items.get('i').dueTime, state.items.get('i').remindBefore], [null, null]);
  applyOp(state, { type: 'item.update', itemId: 'i', dueTime: '09:00', remindBefore: 0 }, { user, now });
  applyOp(state, { type: 'item.update', itemId: 'i', dueDate: null }, { user, now });
  assert.deepEqual([state.items.get('i').dueTime, state.items.get('i').remindBefore], [null, null]);
  const list = read('public/js/screens/list.js');
  assert.match(list, /timeField\.hidden = !withDue \|\| !dueDate;\s*\/\/ [^\n]*\s*remindField\.hidden = !withDue \|\| !dueDate \|\| !dueTime \|\| !app\.user\?\.push;/);
  assert.match(list, /if \(enabled\.due && dueTime !== savedDueTime\) changes\.dueTime = dueTime; \/\/ null : sans heure\s*if \(enabled\.due && remind !== savedRemind\) changes\.remindBefore = remind; \/\/ null : aucun rappel/);
  assert.match(list, /const timeInput = h\('input', \{ class: 'due-picker__input', type: 'time', step: '60' \}\);/);
  // Rien d'écrit en HTML ; le rappel n'est jamais sur la page publique
  for (const file of ['public/js/due-time.js', 'public/js/screens/list.js', 'public/js/format.js']) assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /innerHTML|outerHTML|insertAdjacentHTML/, file);
  assert.doesNotMatch(read('public/js/public.js') + read('server/routes/public.js'), /remind/i);
  assert.match(read('public/sw.js'), /'\/js\/due-time\.js',/);
});

test('résumé de 8 h : inchangé, avec l\'heure en mode détaillé et les tâches à heure avant les autres', async (t) => {
  const f = await pushFamily(t);
  const at8 = () => {
    const date = new Date(f.app.clock.now);
    date.setDate(date.getDate() + 1);
    date.setHours(8, 30, 0, 0);
    return date.getTime();
  };
  f.app.clock.now = at8() - 3 * 3600 * 1000;
  const today = localDay(new Date(at8()));
  const g = f.people.guillaume.client;
  const maison = uuid();
  await g.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: maison, name: 'Maison', listType: 'tasks', dueEnabled: true },
    { id: uuid(), type: 'item.create', listId: maison, itemId: uuid(), name: 'Pain', dueDate: today },
    { id: uuid(), type: 'item.create', listId: maison, itemId: uuid(), name: 'Dentiste', dueDate: today, dueTime: '09:15' },
  ] });
  assert.equal((await g.request('PUT', '/api/push/settings', { detail: true })).status, 200);
  await f.app.ctx.push.idle();
  f.push.calls.length = 0;
  f.app.clock.now = at8();
  await f.app.ctx.notify.runDigest();
  await f.app.ctx.push.idle();
  const [digest] = f.inbox('guillaume');
  assert.equal(digest.title, '2 tâches à faire aujourd\'hui');
  assert.match(digest.body, /^Dentiste \(9:15\)/);
  assert.match(digest.body, /Pain/);
});
