// Tâches qui se répètent (décisions du 11 novembre 2026) : la règle et la
// date suivante (public/js/repeat.js, partagé par le téléphone et le
// serveur), la colonne items.repeat (migration 24), les opérations
// (création, modification, cochage avec ou sans date proposée, refus sans
// rien écrire), la synchronisation, la copie locale (hors ligne), « Dupliquer
// la liste », la page publique (lecture seule) et Claude (read_list,
// set_checked). Les dates des tests sont fixes, ou loin dans le futur quand
// le serveur calcule avec sa date du jour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { household as mcpHousehold, connect, claude, data, PASSWORD } from './mcp-helpers.js';
import { REPEAT_NOT_HERE, REPEAT_OFF, BAD_REPEAT, REPEAT_NEEDS_DUE, BAD_NEXT_DUE, BAD_DUE, serverToday } from '../server/lists.js';
import {
  parseRepeat, isRepeatRule, makeRepeat, isOccurrence, occurrenceAfter, firstOccurrence, nextDue,
  weekdayOf, repeatSentence, repeatChip, REPEAT_RULE_MAX,
} from '../public/js/repeat.js';
import { publicItemDetails } from '../public/js/format.js';
import { emptyState, applyOp } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// --- La règle (repeat.js) ---

test('règle : formes acceptées, tout le reste refusé', () => {
  assert.deepEqual(parseRepeat('day'), { kind: 'day' });
  assert.deepEqual(parseRepeat('year'), { kind: 'year' });
  assert.deepEqual(parseRepeat('week:1,3'), { kind: 'week', days: [1, 3] });
  assert.deepEqual(parseRepeat('2week:5'), { kind: '2week', days: [5] });
  assert.deepEqual(parseRepeat('week:1,2,3,4,5,6,7'), { kind: 'week', days: [1, 2, 3, 4, 5, 6, 7] });
  assert.deepEqual(parseRepeat('month:31'), { kind: 'month', monthDay: 31 });
  for (const bad of ['', 'Day', 'jour', 'week', 'week:', 'week:0', 'week:8', 'week:3,1', 'week:1,1', 'week:1,,3', 'week: 1',
    '3week:1', 'month:0', 'month:32', 'month:05', 'month:', 'year:1', 'day ', null, undefined, 1, {}, ['day'], 'x'.repeat(REPEAT_RULE_MAX + 1)]) {
    assert.equal(isRepeatRule(bad), false, JSON.stringify(bad));
  }
  // Fabriquée par l'écran : jours triés, sans doublon ; aucun jour = pas de règle
  assert.equal(makeRepeat('week', { days: [3, 1, 3] }), 'week:1,3');
  assert.equal(makeRepeat('2week', { days: [7] }), '2week:7');
  assert.equal(makeRepeat('week', { days: [] }), null);
  assert.equal(makeRepeat('month', { monthDay: 31 }), 'month:31');
  assert.equal(makeRepeat('day'), 'day');
  assert.equal(makeRepeat(''), null);
  // Toute règle fabriquée par l'écran est acceptée par le serveur
  for (const kind of ['day', 'week', '2week', 'month', 'year']) {
    for (const days of [[1], [1, 3], [1, 2, 3, 4, 5, 6, 7]]) {
      for (const monthDay of [1, 15, 28, 29, 30, 31]) {
        const rule = makeRepeat(kind, { days, monthDay });
        assert.ok(isRepeatRule(rule) && rule.length <= REPEAT_RULE_MAX, rule);
      }
    }
  }
});

test('date suivante : après aujourd\'hui, ou après l\'échéance si elle est plus tard ; jamais déjà en retard', () => {
  // Mercredi 11 novembre 2026 ; « chaque lundi et mercredi », échéance lundi 9
  assert.equal(weekdayOf('2026-11-09'), 1);
  assert.equal(weekdayOf('2026-11-15'), 7);
  const rule = 'week:1,3';
  assert.equal(nextDue(rule, '2026-11-09', '2026-11-09'), '2026-11-11', 'faite le lundi : mercredi');
  assert.equal(nextDue(rule, '2026-11-09', '2026-11-07'), '2026-11-11', 'faite en avance (samedi d\'avant) : la suivante après l\'échéance');
  assert.equal(nextDue(rule, '2026-11-09', '2026-11-12'), '2026-11-16', 'faite en retard (jeudi) : le lundi suivant, pas déjà en retard');
  assert.equal(nextDue(rule, '2026-11-09', '2026-11-11'), '2026-11-16', 'faite le mercredi : jamais aujourd\'hui');
  // Chaque jour, en retard de dix jours : demain
  assert.equal(nextDue('day', '2026-11-01', '2026-11-11'), '2026-11-12');
  assert.equal(nextDue('day', '2026-11-20', '2026-11-11'), '2026-11-21');
  // Le 31 de chaque mois : dernier jour des mois plus courts, puis de nouveau le 31
  assert.equal(nextDue('month:31', '2026-10-31', '2026-10-31'), '2026-11-30');
  assert.equal(nextDue('month:31', '2026-11-30', '2026-11-30'), '2026-12-31');
  assert.equal(nextDue('month:31', '2027-01-31', '2027-01-31'), '2027-02-28');
  assert.equal(nextDue('month:29', '2028-01-29', '2028-01-29'), '2028-02-29', 'année bissextile');
  assert.equal(nextDue('month:5', '2026-11-05', '2026-11-11'), '2026-12-05');
  // Chaque année : même jour, même mois ; un 29 février devient le 28
  assert.equal(nextDue('year', '2026-11-11', '2026-11-11'), '2027-11-11');
  assert.equal(nextDue('year', '2028-02-29', '2028-02-29'), '2029-02-28');
  assert.equal(nextDue('year', '2026-03-15', '2027-05-01'), '2028-03-15', 'faite très en retard : l\'année suivante');
  // Toutes les 2 semaines : semaines comptées à partir de l'échéance
  assert.equal(nextDue('2week:1', '2030-01-07', '2030-01-07'), '2030-01-21');
  assert.equal(nextDue('2week:1,5', '2030-01-07', '2030-01-07'), '2030-01-11', 'même semaine : le vendredi');
  assert.equal(nextDue('2week:1,5', '2030-01-11', '2030-01-11'), '2030-01-21', 'puis le lundi deux semaines après');
  assert.equal(nextDue('2week:1', '2030-01-07', '2030-01-16'), '2030-01-21', 'faite en retard : même rythme');
  assert.equal(nextDue('2week:1', '2030-01-07', '2030-01-22'), '2030-02-04');
  // La date suivante tombe toujours sur la règle, toujours après la date de départ
  for (const r of ['day', 'week:2', 'week:6,7', '2week:3', '2week:1,4', 'month:1', 'month:30', 'year']) {
    let due = '2026-01-31';
    for (let i = 0; i < 40; i++) {
      const next = nextDue(r, due, due);
      assert.ok(next > due && isOccurrence(r, next, due), `${r} après ${due} : ${next}`);
      due = next;
    }
  }
  // Première date (choix de la règle dans la fiche) : aujourd'hui compris
  assert.equal(firstOccurrence('week:3', '2026-11-11'), '2026-11-11');
  assert.equal(firstOccurrence('week:1', '2026-11-11'), '2026-11-16');
  assert.equal(firstOccurrence('month:5', '2026-11-11'), '2026-12-05');
  assert.equal(occurrenceAfter('n\'importe quoi', '2026-11-11'), null);
});

test('textes : phrase de la fiche et pastille de la ligne', () => {
  assert.equal(repeatSentence('week:1'), 'Chaque lundi');
  assert.equal(repeatSentence('week:1,3'), 'Chaque lundi et mercredi');
  assert.equal(repeatSentence('week:1,3,5'), 'Chaque lundi, mercredi et vendredi');
  assert.equal(repeatSentence('week:1,2,3,4,5,6,7'), 'Chaque jour');
  assert.equal(repeatSentence('2week:1'), 'Toutes les 2 semaines, le lundi');
  assert.equal(repeatSentence('month:1'), 'Le 1er de chaque mois');
  assert.equal(repeatSentence('month:5'), 'Le 5 de chaque mois');
  assert.equal(repeatSentence('month:31'), 'Le 31 de chaque mois (ou le dernier jour du mois)');
  assert.equal(repeatSentence('day'), 'Chaque jour');
  assert.equal(repeatSentence('year'), 'Chaque année');
  assert.equal(repeatSentence('faux'), '');
  assert.equal(repeatChip('week:1,3'), 'Lu, Me');
  assert.equal(repeatChip('2week:1'), '2 sem. · Lu');
  assert.equal(repeatChip('month:5'), 'Le 5');
  assert.equal(repeatChip('month:1'), 'Le 1er');
  assert.equal(repeatChip('day'), 'Chaque jour');
  assert.equal(repeatChip('year'), 'Chaque année');
});

// --- Serveur ---

// Foyer de test : Guillaume (propriétaire), Léa (modification), Paul
// (lecture seule) ; une liste de tâches avec échéance, une sans, une liste
// de courses
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const paulId = await addUser(app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const paul = app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  const ids = { tasks: uuid(), plain: uuid(), shopping: uuid(), bins: uuid(), other: uuid(), milk: uuid() };
  const res = await guillaume.post('/api/ops', { ops: [
    { type: 'list.create', listId: ids.tasks, name: 'Maison', listType: 'tasks', priorityEnabled: true, dueEnabled: true },
    { type: 'item.create', listId: ids.tasks, itemId: ids.bins, name: 'Sortir les poubelles', dueDate: '2030-01-07', repeat: 'week:1,3' },
    { type: 'item.create', listId: ids.tasks, itemId: ids.other, name: 'Changer l\'ampoule' },
    { type: 'list.create', listId: ids.plain, name: 'Sans échéance', listType: 'tasks' },
    { type: 'list.create', listId: ids.shopping, name: 'Courses', listType: 'shopping' },
    { type: 'item.create', listId: ids.shopping, itemId: ids.milk, name: 'Lait', aisleId: 4 },
  ].map((o) => ({ id: uuid(), ...o })) });
  assert.deepEqual(res.body.results.map((r) => r.status), [200, 200, 200, 200, 200, 200], res.text);
  await guillaume.request('PUT', `/api/lists/${ids.tasks}/members`, { userIds: [leaId, paulId], access: { [leaId]: 'modification', [paulId]: 'lecture' } });
  const row = (id) => app.db.prepare('SELECT name, checked, checked_at, due_date, repeat, updated_at FROM items WHERE id = ?').get(id);
  return { app, guillaume, lea, paul, ids, row };
}

const op = async (client, operation) => {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...operation }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
};

test('création et modification : règle enregistrée, refus sans rien écrire (pas d\'échéance, mauvaise liste, option désactivée, règle invalide)', async (t) => {
  const h = await household(t);
  assert.deepEqual([h.row(h.ids.bins).due_date, h.row(h.ids.bins).repeat], ['2030-01-07', 'week:1,3']);
  // Refusés, et rien n'est créé
  const refused = [
    [{ listId: h.ids.tasks, repeat: 'day' }, REPEAT_NEEDS_DUE],
    [{ listId: h.ids.tasks, repeat: 'chaque lundi', dueDate: '2030-01-07' }, BAD_REPEAT],
    [{ listId: h.ids.tasks, repeat: 'week:8', dueDate: '2030-01-07' }, BAD_REPEAT],
    [{ listId: h.ids.tasks, repeat: 42, dueDate: '2030-01-07' }, BAD_REPEAT],
    [{ listId: h.ids.plain, repeat: 'day' }, REPEAT_OFF],
    [{ listId: h.ids.shopping, repeat: 'day' }, REPEAT_NOT_HERE],
  ];
  const count = () => h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get();
  const before = count();
  for (const [fields, message] of refused) {
    const res = await op(h.guillaume, { type: 'item.create', itemId: uuid(), name: 'Essai', ...fields });
    assert.equal(res.status, 400, JSON.stringify(fields));
    assert.equal(res.error, message);
  }
  assert.equal(count(), before, 'rien n\'est créé');
  // Modification : refus sans rien écrire
  const other = h.row(h.ids.other);
  for (const [fields, message] of [
    [{ repeat: 'day' }, REPEAT_NEEDS_DUE],
    [{ repeat: 'week:1', dueDate: null }, REPEAT_NEEDS_DUE],
    [{ repeat: 'tous les jours', dueDate: '2030-01-07' }, BAD_REPEAT],
  ]) {
    const res = await op(h.guillaume, { type: 'item.update', itemId: h.ids.other, name: 'Ne doit pas être écrit', ...fields });
    assert.equal(res.status, 400, JSON.stringify(fields));
    assert.equal(res.error, message);
  }
  assert.deepEqual(h.row(h.ids.other), other, 'rien n\'est écrit');
  const milk = await op(h.guillaume, { type: 'item.update', itemId: h.ids.milk, repeat: null });
  assert.equal(milk.error, REPEAT_NOT_HERE);
  // Léa (modification) pose une règle et une échéance ; Paul (lecture seule) ne peut rien
  assert.equal((await op(h.lea, { type: 'item.update', itemId: h.ids.other, dueDate: '2030-02-05', repeat: 'month:5' })).status, 200);
  assert.deepEqual([h.row(h.ids.other).due_date, h.row(h.ids.other).repeat], ['2030-02-05', 'month:5']);
  assert.equal((await op(h.paul, { type: 'item.update', itemId: h.ids.other, repeat: null })).status, 403);
  assert.equal(h.row(h.ids.other).repeat, 'month:5');
  // Changer seulement l'échéance garde la règle ; l'effacer arrête la répétition
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.ids.other, dueDate: '2030-03-05' })).status, 200);
  assert.equal(h.row(h.ids.other).repeat, 'month:5');
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.ids.other, dueDate: null })).status, 200);
  assert.deepEqual([h.row(h.ids.other).due_date, h.row(h.ids.other).repeat], [null, null]);
  // « Jamais » : null
  assert.equal((await op(h.guillaume, { type: 'item.update', itemId: h.ids.bins, repeat: null })).status, 200);
  assert.deepEqual([h.row(h.ids.bins).due_date, h.row(h.ids.bins).repeat], ['2030-01-07', null]);
  // La base refuse aussi une règle trop longue écrite directement
  assert.throws(() => h.app.db.prepare('UPDATE items SET repeat = ? WHERE id = ?').run('x'.repeat(21), h.ids.bins), /CHECK/);
});

test('cocher une tâche qui se répète : elle revient décochée à la date proposée par le téléphone (vérifiée), ou calculée par le serveur', async (t) => {
  const h = await household(t);
  // Date proposée par le téléphone, qui tombe sur la règle : gardée
  const first = await op(h.lea, { type: 'item.check', itemId: h.ids.bins, checked: true, nextDue: '2030-01-09' });
  assert.equal(first.status, 200);
  assert.equal(first.repeated, '2030-01-09');
  assert.deepEqual([h.row(h.ids.bins).checked, h.row(h.ids.bins).checked_at, h.row(h.ids.bins).due_date], [0, null, '2030-01-09']);
  assert.equal(first.item.checked, false);
  assert.equal(first.item.dueDate, '2030-01-09');
  assert.equal(first.item.repeat, 'week:1,3');
  // Sans date (Claude, ancienne version) : le serveur la calcule (échéance
  // dans le futur : la suivante après elle, quelle que soit sa date du jour)
  const second = await op(h.guillaume, { type: 'item.check', itemId: h.ids.bins, checked: true });
  assert.equal(second.repeated, '2030-01-14');
  // Date qui ne tombe pas sur la règle (changée entre-temps), ou pas après
  // l'échéance : le serveur calcule, le coché n'est pas perdu
  assert.equal((await op(h.lea, { type: 'item.check', itemId: h.ids.bins, checked: true, nextDue: '2030-01-15' })).repeated, '2030-01-16');
  assert.equal((await op(h.lea, { type: 'item.check', itemId: h.ids.bins, checked: true, nextDue: '2030-01-16' })).repeated, '2030-01-21');
  assert.equal(h.row(h.ids.bins).due_date, '2030-01-21');
  // Valeur qui n'est pas une date : refus, rien n'est écrit
  const before = h.row(h.ids.bins);
  for (const nextDueValue of ['demain', '2030-02-30', 20300121, null, '2101-01-06']) {
    const res = await op(h.lea, { type: 'item.check', itemId: h.ids.bins, checked: true, nextDue: nextDueValue });
    assert.equal(res.status, 400, JSON.stringify(nextDueValue));
    assert.equal(res.error, BAD_NEXT_DUE);
  }
  assert.deepEqual(h.row(h.ids.bins), before);
  // Lecture seule : refusé
  assert.equal((await op(h.paul, { type: 'item.check', itemId: h.ids.bins, checked: true })).status, 403);
  assert.deepEqual(h.row(h.ids.bins), before);
  // Échéance en retard : la suivante après aujourd'hui (date du serveur,
  // ici son horloge de test : vendredi 16 octobre 2026)
  await op(h.guillaume, { type: 'item.update', itemId: h.ids.bins, dueDate: '2020-01-06', repeat: 'week:1' });
  const late = await op(h.guillaume, { type: 'item.check', itemId: h.ids.bins, checked: true });
  assert.equal(serverToday(new Date(h.app.clock.now)), '2026-10-16');
  assert.equal(late.repeated, '2026-10-19', 'le lundi qui suit, jamais déjà en retard');
  // Option « Échéance » désactivée ensuite : la tâche se coche normalement
  await op(h.guillaume, { type: 'list.update', listId: h.ids.tasks, dueEnabled: false });
  const off = await op(h.guillaume, { type: 'item.check', itemId: h.ids.bins, checked: true, nextDue: '2099-01-05' });
  assert.equal(off.repeated, undefined);
  assert.equal(h.row(h.ids.bins).checked, 1);
  // Une tâche sans règle : cochée normalement, la date proposée est ignorée
  const plain = await op(h.guillaume, { type: 'item.check', itemId: h.ids.other, checked: true, nextDue: '2030-01-09' });
  assert.deepEqual([plain.repeated, h.row(h.ids.other).checked, h.row(h.ids.other).due_date], [undefined, 1, null]);
});

test('file d\'attente rejouée : la même opération ne fait avancer la date qu\'une fois ; synchronisation et copie locale identiques', async (t) => {
  const h = await household(t);
  const checkOp = { id: uuid(), type: 'item.check', itemId: h.ids.bins, checked: true, nextDue: '2030-01-09' };
  const once = await h.lea.post('/api/ops', { ops: [checkOp] });
  const again = await h.lea.post('/api/ops', { ops: [checkOp] });
  assert.equal(once.body.results[0].repeated, '2030-01-09');
  const { duplicate, ...replayed } = again.body.results[0];
  assert.equal(duplicate, true);
  assert.deepEqual(replayed, once.body.results[0], 'même résultat, rien de plus');
  assert.equal(h.row(h.ids.bins).due_date, '2030-01-09');
  // Synchronisation : la règle et la nouvelle date, décochée
  const synced = (await h.paul.get('/api/sync')).body.items.find((i) => i.id === h.ids.bins);
  assert.deepEqual([synced.checked, synced.dueDate, synced.repeat], [false, '2030-01-09', 'week:1,3']);
  // Copie locale (hors ligne) : même effet que le serveur
  const state = emptyState();
  const user = { id: 1, username: 'g', displayName: 'G' };
  const now = '2030-01-07T08:00:00.000Z';
  applyOp(state, { type: 'list.create', listId: 'l', name: 'Maison', listType: 'tasks', dueEnabled: true }, { user, now });
  applyOp(state, { type: 'item.create', listId: 'l', itemId: 'i', name: 'Poubelles', dueDate: '2030-01-07', repeat: 'week:1,3' }, { user, now });
  assert.equal(state.items.get('i').repeat, 'week:1,3');
  applyOp(state, { type: 'item.check', itemId: 'i', checked: true, nextDue: '2030-01-09' }, { user, now });
  assert.deepEqual([state.items.get('i').checked, state.items.get('i').checkedAt, state.items.get('i').dueDate], [false, null, '2030-01-09']);
  // Sans date proposée : coché comme avant
  applyOp(state, { type: 'item.check', itemId: 'i', checked: true }, { user, now });
  assert.equal(state.items.get('i').checked, true);
  // Effacer l'échéance efface aussi la règle ; changer la règle seule la garde
  applyOp(state, { type: 'item.update', itemId: 'i', repeat: 'day' }, { user, now });
  assert.deepEqual([state.items.get('i').dueDate, state.items.get('i').repeat], ['2030-01-09', 'day']);
  applyOp(state, { type: 'item.update', itemId: 'i', dueDate: null }, { user, now });
  assert.deepEqual([state.items.get('i').dueDate, state.items.get('i').repeat], [null, null]);
});

test('dupliquer la liste : la règle est copiée ; page publique : la règle, en lecture seule, seulement avec l\'échéance', async (t) => {
  const h = await household(t);
  const copy = await h.guillaume.post(`/api/lists/${h.ids.tasks}/duplicate`, { name: 'Maison (copie)', withItems: true });
  assert.equal(copy.status, 201, copy.text);
  const copied = h.app.db.prepare("SELECT due_date, repeat FROM items WHERE list_id = ? AND name = 'Sortir les poubelles'").get(copy.body.list.id);
  assert.deepEqual(copied, { due_date: '2030-01-07', repeat: 'week:1,3' });
  const share = await h.guillaume.request('PUT', `/api/lists/${h.ids.tasks}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const visitor = createClient(h.app.base, { ip: '203.0.113.9' });
  const items = async () => (await visitor.get(`/api/public/${token}`)).body.groups.flatMap((group) => group.items);
  const bins = (await items()).find((item) => item.name === 'Sortir les poubelles');
  assert.deepEqual(Object.keys(bins).sort(), ['checked', 'dueDate', 'name', 'note', 'photo', 'priority', 'quantity', 'repeat']);
  assert.equal(bins.repeat, 'week:1,3');
  assert.deepEqual(Object.keys((await items()).find((item) => item.name === 'Changer l\'ampoule')).sort(), ['checked', 'dueDate', 'name', 'note', 'photo', 'priority', 'quantity'], 'pas de règle : pas de champ');
  assert.deepEqual(publicItemDetails(bins, { grouping: 'none', today: '2030-01-01' }).map((r) => [r.label, r.text]).slice(-2), [['Échéance', 'lun. 7 janv.'], ['Se répète', 'Chaque lundi et mercredi']]);
  // Option « Échéance » désactivée : ni échéance ni règle
  await op(h.guillaume, { type: 'list.update', listId: h.ids.tasks, dueEnabled: false });
  assert.ok((await items()).every((item) => !('repeat' in item) && !('dueDate' in item)));
});

// --- Claude ---

test('Claude : read_list donne la répétition en clair ; set_checked fait revenir la tâche et dit la date suivante', async (t) => {
  const h = await mcpHousehold(t);
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: h.ids.ampoule, dueDate: '2030-01-07', repeat: '2week:1' }] });
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const list = data(await c.tool('read_list', { list_id: h.ids.maison }));
  const item = list.items.find((i) => i.id === h.ids.ampoule);
  assert.equal(item.repeat, 'Toutes les 2 semaines, le lundi');
  assert.equal(item.due_date, '2030-01-07');
  const res = data(await c.tool('set_checked', { list_id: h.ids.maison, item_ids: [h.ids.ampoule], checked: true }));
  const slot = res.results.find((i) => i.id === h.ids.ampoule);
  assert.equal(slot.next_due_date, '2030-01-21');
  const row = h.app.db.prepare('SELECT checked, due_date, repeat FROM items WHERE id = ?').get(h.ids.ampoule);
  assert.deepEqual(row, { checked: 0, due_date: '2030-01-21', repeat: '2week:1' });
  // Une tâche sans règle : aucun champ repeat ni next_due_date
  const plain = data(await c.tool('read_list', { list_id: h.ids.courses })).items;
  assert.ok(plain.every((i) => !('repeat' in i)));
});

// --- Écran (téléphone et ordinateur) ---

test('écran : « Se répète » seulement avec l\'échéance, règle avec la date, coche et « Passer cette fois » avec « Annuler », texte sûr', () => {
  const list = read('public/js/screens/list.js');
  // Champ affiché et caché avec l'échéance ; envoyé seulement si l'échéance est activée
  assert.match(list, /\[\[priorityField, withPriority\], \[dueField, withDue\], \[repeatField, withDue\], \[assignField, options\(\)\.assign\]\]/);
  assert.match(list, /if \(enabled\.due && repeat !== savedRepeat\) changes\.repeat = repeat;/);
  // Échéance effacée : plus de répétition ; règle choisie : la date suit
  assert.match(list, /if \(!dueDate && repeatKind\) \{\s*repeatKind = '';\s*repeat = null;\s*\}/);
  assert.match(list, /if \(repeat && \(!dueDate \|\| !isOccurrence\(repeat, dueDate, dueDate\)\)\) \{/);
  // Au moins un jour ; jours annoncés par leur nom entier, état par aria-pressed
  assert.match(list, /if \(on && repeatDays\.length === 1\) return; \/\/ au moins un jour/);
  assert.match(list, /h\('button', \{ class: 'weekdays__opt', type: 'button', 'aria-label': long,/);
  assert.match(list, /button\.setAttribute\('aria-pressed', String\(repeatDays\.includes\(Number\(button\.dataset\.day\)\)\)\)/);
  // Cocher : « Prochaine fois : … » et « Annuler » qui remet l'ancienne date (Ctrl+Z aussi)
  assert.match(list, /const next = item\.checked \? null : actions\.nextDueOf\(item\);\s*if \(next\) \{\s*checkRepeating\(item, next\);/);
  assert.match(list, /toast\(`Prochaine fois : \$\{dueDateLabel\(next\)\}`/);
  assert.match(list, /if \(current && current\.dueDate === next\) actions\.updateItem\(current, before\);/);
  // « Passer cette fois » : seulement sur la règle et la date enregistrées, même calcul
  assert.match(list, /skipRow\.hidden = !\(saved && !saved\.checked && actions\.repeatsNow\(saved\) && repeat === savedRepeat && repeat === saved\.repeat && dueDate === savedDue\);/);
  assert.match(list, /const next = saved \? actions\.nextDueOf\(saved\) : null;\s*if \(!next \|\| !editable\(\)\) return;/);
  // Pastille de la ligne : icône ET texte
  assert.match(list, /icon\('repeat', 'icon--xs'\), repeatChip\(item\.repeat\)/);
  // Le calcul de la date est le même partout (repeat.js), avec la date du téléphone
  const actions = read('public/js/actions.js');
  assert.match(actions, /export const nextDueOf = \(item\) => \(repeatsNow\(item\) \? nextDue\(item\.repeat, item\.dueDate, todayKey\(\)\) : null\);/);
  for (const file of ['public/js/repeat.js', 'public/js/screens/list.js', 'public/js/screens/deadlines.js', 'public/js/public.js']) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /innerHTML|outerHTML|insertAdjacentHTML/, file);
  }
  // Icône identique dans le kit et dans l'application ; nouveau fichier dans le service worker
  const symbol = (html) => html.match(/<symbol id="i-repeat"[^]*?<\/symbol>/)?.[0];
  assert.ok(symbol(read('design/icons-sprite.html')));
  assert.equal(symbol(read('public/index.html')), symbol(read('design/icons-sprite.html')));
  assert.match(read('public/sw.js'), /'\/js\/repeat\.js',/);
  // Aucun curseur posé par la fiche ou par « Passer cette fois »
  const sheet = list.slice(list.indexOf('// --- Se répète'), list.indexOf('const repeatField'));
  assert.doesNotMatch(sheet, /\.focus\(/);
});

test('Claude : add_items crée une tâche qui se répète (échéance posée comme dans la fiche) ; refus de tout l\'appel sinon', async (t) => {
  const h = await mcpHousehold(t); // horloge du serveur de test : vendredi 16 octobre 2026
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const rowOf = (name) => h.app.db.prepare('SELECT due_date, repeat FROM items WHERE name = ? AND deleted_at IS NULL').get(name);
  const count = () => h.app.db.prepare('SELECT COUNT(*) FROM items').pluck().get();
  const res = data(await c.tool('add_items', { list_id: h.ids.maison, items: [
    { name: 'Poubelles', repeat: { every: 'week', weekdays: ['monday', 'thursday'] } },
    { name: 'Loyer', due_date: '2026-11-05', repeat: { every: 'month' } },
    { name: 'Anniversaire de Léa', repeat: { every: 'year' } },
    { name: 'Arroser', repeat: { every: '2weeks', weekdays: ['sunday'] } },
    { name: 'Vider le lave-vaisselle' },
  ] }));
  assert.equal(res.created, 5);
  const [bins, rent, birthday, water, plain] = res.results;
  assert.deepEqual([bins.due_date, bins.repeat], ['2026-10-19', 'Chaque lundi et jeudi'], 'sans échéance : le prochain lundi ou jeudi');
  assert.deepEqual([rent.due_date, rent.repeat], ['2026-11-05', 'Le 5 de chaque mois'], 'échéance donnée gardée ; jour du mois pris d\'elle');
  assert.deepEqual([birthday.due_date, birthday.repeat], ['2026-10-16', 'Chaque année']);
  assert.deepEqual([water.due_date, water.repeat], ['2026-10-18', 'Toutes les 2 semaines, le dimanche']);
  assert.ok(!('repeat' in plain) && !('due_date' in plain), 'sans répétition : réponse inchangée');
  assert.deepEqual(rowOf('Poubelles'), { due_date: '2026-10-19', repeat: 'week:1,4' });
  assert.deepEqual(rowOf('Loyer'), { due_date: '2026-11-05', repeat: 'month:5' });
  // Refus : l'appel entier, rien n'est ajouté (règle de l'application)
  const before = count();
  const toolError = (r) => r.body.result?.isError ? r.body.result.content[0].text : null;
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'Lait', repeat: { every: 'week' } }] })), REPEAT_NOT_HERE);
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.secret, items: [{ name: 'Clé', repeat: { every: 'day' } }] })), REPEAT_OFF);
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Bien', repeat: { every: 'day' } }, { name: 'Mal', due_date: '2026-02-30', repeat: { every: 'day' } }] })), BAD_DUE);
  assert.equal(rowOf('Bien'), undefined, 'rien n\'est ajouté');
  // Forme invalide : paramètres refusés (-32602)
  for (const repeat of ['week', { every: 'weekly' }, { every: 'month', weekdays: ['monday'] }, { every: 'week', month_day: 5 }, { every: 'month', month_day: 32 },
    { every: 'month', month_day: 1.5 }, { every: 'week', weekdays: ['lundi'] }, { every: 'week', weekdays: [] }, { every: 'day', at: '8h' }, [], null]) {
    const r = await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Essai', repeat }] });
    if (repeat === null) {
      assert.equal(r.body.result?.isError ?? false, false, 'null : pas de répétition');
      continue;
    }
    assert.equal(r.body.error?.code, -32602, JSON.stringify(repeat));
  }
  assert.equal(count(), before + 1, 'seul l\'essai sans répétition (null) a été ajouté');
  assert.equal(rowOf('Essai').repeat, null);
});

test('Claude : update_items pose, change ou arrête la répétition ; échéance gardée, donnée ou posée ; jamais sans échéance', async (t) => {
  const h = await mcpHousehold(t); // vendredi 16 octobre 2026 ; Ampoule : échéance jeudi 5 novembre
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const row = () => h.app.db.prepare('SELECT due_date, repeat FROM items WHERE id = ?').get(h.ids.ampoule);
  const update = async (fields) => data(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, ...fields }] }));
  // Chaque semaine, sans jours : le jour de l'échéance, gardée
  let res = await update({ repeat: { every: 'week' } });
  assert.deepEqual([res.results[0].due_date, res.results[0].repeat], ['2026-11-05', 'Chaque jeudi']);
  assert.deepEqual(row(), { due_date: '2026-11-05', repeat: 'week:4' });
  // Même demande : inchangé
  assert.equal((await update({ repeat: { every: 'week', weekdays: ['thursday'] } })).unchanged, 1);
  // Le lundi : l'échéance (un jeudi) passe au prochain lundi
  res = await update({ repeat: { every: 'week', weekdays: ['monday'] } });
  assert.deepEqual(row(), { due_date: '2026-10-19', repeat: 'week:1' });
  // Échéance donnée : gardée telle quelle
  await update({ due_date: '2026-11-07', repeat: { every: '2weeks', weekdays: ['saturday'] } });
  assert.deepEqual(row(), { due_date: '2026-11-07', repeat: '2week:6' });
  // Changer seulement l'échéance garde la règle
  await update({ due_date: '2026-11-21' });
  assert.deepEqual(row(), { due_date: '2026-11-21', repeat: '2week:6' });
  // null : ne se répète plus, l'échéance reste
  res = await update({ repeat: null });
  assert.deepEqual([res.results[0].due_date, res.results[0].repeat], ['2026-11-21', null]);
  assert.deepEqual(row(), { due_date: '2026-11-21', repeat: null });
  // Répétition ET échéance effacée : refus de tout l'appel, rien n'est écrit
  const toolError = (r) => (r.body.result?.isError ? r.body.result.content[0].text : null);
  const both = await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, name: 'Ne doit pas être écrit', due_date: null, repeat: { every: 'day' } }] });
  assert.equal(toolError(both), REPEAT_NEEDS_DUE);
  assert.deepEqual(row(), { due_date: '2026-11-21', repeat: null });
  // Effacer l'échéance arrête la répétition (comme dans l'application)
  await update({ repeat: { every: 'month', month_day: 31 } });
  assert.deepEqual(row(), { due_date: '2026-10-31', repeat: 'month:31' });
  res = await update({ due_date: null });
  assert.deepEqual([res.results[0].due_date, res.results[0].repeat], [null, null]);
  // Liste de courses : refusé
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, repeat: null }] })), REPEAT_NOT_HERE);
  // Connexion « Lecture seule » : refusé
  const reader = claude(h, (await connect(h, h.guillaume, PASSWORD)).access_token);
  assert.ok(toolError(await reader.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, repeat: { every: 'day' } }] })));
  assert.equal(row().repeat, null);
});
