// « Le 1er lundi du mois », « le dernier vendredi » (décision du 11 novembre
// 2026, complément des tâches qui se répètent) : règle 'monthw:<rang>:<jour>'
// de public/js/repeat.js, partagée par le téléphone et le serveur ; fiche,
// serveur, Claude. Aucune migration (la colonne repeat garde sa forme courte).

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseRepeat, isRepeatRule, makeRepeat, isOccurrence, nextDue, monthWeekOf, repeatSentence, repeatChip, MONTH_WEEKS } from '../public/js/repeat.js';
import { startTestApp, setupAdmin } from './helpers.js';
import { household as mcpHousehold, connect, claude, data, PASSWORD } from './mcp-helpers.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('règle : rang 1 à 4 ou dernier, jour de la semaine ; dates, textes, choix par défaut', () => {
  assert.deepEqual(parseRepeat('monthw:1:1'), { kind: 'month', nth: 1, weekday: 1 });
  assert.deepEqual(parseRepeat('monthw:-1:5'), { kind: 'month', nth: -1, weekday: 5 });
  for (const bad of ['monthw:0:1', 'monthw:5:1', 'monthw:-2:1', 'monthw:1:8', 'monthw:1', 'monthw:1:1:1', 'monthw:01:1']) assert.equal(isRepeatRule(bad), false, bad);
  assert.equal(makeRepeat('month', { nth: 1, weekday: 1 }), 'monthw:1:1');
  assert.equal(makeRepeat('month', { nth: -1, weekday: 5 }), 'monthw:-1:5');
  assert.equal(makeRepeat('month', { monthDay: 5 }), 'month:5', 'sans rang : le jour du mois, comme avant');
  assert.deepEqual(MONTH_WEEKS.map(([n]) => n), [1, 2, 3, 4, -1]);
  // Novembre 2026 : lundis 2, 9, 16, 23, 30 ; vendredis 6, 13, 20, 27
  assert.equal(isOccurrence('monthw:1:1', '2026-11-02'), true);
  assert.equal(isOccurrence('monthw:1:1', '2026-11-09'), false);
  assert.equal(isOccurrence('monthw:-1:1', '2026-11-30'), true, 'dernier lundi : le 5e');
  assert.equal(isOccurrence('monthw:4:1', '2026-11-23'), true);
  assert.equal(isOccurrence('monthw:-1:5', '2026-11-27'), true, 'dernier vendredi : le 4e');
  // Date suivante (jamais déjà en retard)
  assert.equal(nextDue('monthw:1:1', '2026-11-02', '2026-11-02'), '2026-12-07');
  assert.equal(nextDue('monthw:-1:5', '2026-11-27', '2026-11-27'), '2026-12-25');
  assert.equal(nextDue('monthw:-1:5', '2026-12-25', '2027-01-10'), '2027-01-29', 'faite en retard : le prochain à venir');
  assert.equal(nextDue('monthw:2:3', '2026-11-11', '2026-11-11'), '2026-12-09');
  // Rang d'une échéance (choix proposé au départ)
  assert.deepEqual(['2026-11-02', '2026-11-13', '2026-11-28', '2026-11-30'].map(monthWeekOf), [1, 2, 4, -1]);
  // Textes
  assert.equal(repeatSentence('monthw:1:1'), 'Le 1er lundi de chaque mois');
  assert.equal(repeatSentence('monthw:2:3'), 'Le 2e mercredi de chaque mois');
  assert.equal(repeatSentence('monthw:-1:5'), 'Le dernier vendredi de chaque mois');
  assert.equal(repeatChip('monthw:1:1'), '1er Lu');
  assert.equal(repeatChip('monthw:-1:5'), 'Dernier Ve');
});

test('serveur : règle acceptée, cocher la fait revenir au bon jour', async (t) => {
  const app = await startTestApp(t);
  const g = await setupAdmin(app);
  const send = async (op) => (await g.post('/api/ops', { ops: [{ id: crypto.randomUUID(), ...op }] })).body.results[0];
  const list = crypto.randomUUID();
  const item = crypto.randomUUID();
  await send({ type: 'list.create', listId: list, name: 'Maison', listType: 'tasks', dueEnabled: true });
  assert.equal((await send({ type: 'item.create', listId: list, itemId: item, name: 'Réunion', dueDate: '2030-01-07', repeat: 'monthw:1:1' })).status, 200);
  assert.equal((await send({ type: 'item.update', itemId: item, repeat: 'monthw:6:1' })).status, 400);
  // Sans date proposée par le téléphone : le serveur calcule (1er lundi de février 2030 : le 4)
  assert.equal((await send({ type: 'item.check', itemId: item, checked: true })).repeated, '2030-02-04');
  assert.deepEqual(app.db.prepare('SELECT due_date, repeat, checked FROM items WHERE id = ?').get(item), { due_date: '2030-02-04', repeat: 'monthw:1:1', checked: 0 });
});

test('Claude : month_week (first … last) avec un jour ; refus des formes invalides', async (t) => {
  const h = await mcpHousehold(t);
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const added = data(await c.tool('add_items', { list_id: h.ids.maison, items: [
    { name: 'Réunion', due_date: '2030-01-07', repeat: { every: 'month', month_week: 'first', weekdays: ['monday'] } },
    { name: 'Compta', due_date: '2030-01-25', repeat: { every: 'month', month_week: 'last' } }, // jour de l'échéance : vendredi
  ] }));
  assert.deepEqual(added.results.map((r) => [r.due_date, r.repeat]), [['2030-01-07', 'Le 1er lundi de chaque mois'], ['2030-01-25', 'Le dernier vendredi de chaque mois']]);
  for (const repeat of [
    { every: 'month', month_week: 'fifth', weekdays: ['monday'] },
    { every: 'month', month_week: 'first', weekdays: ['monday', 'friday'] },
    { every: 'month', month_week: 'first', month_day: 5 },
    { every: 'week', month_week: 'first' },
  ]) {
    assert.equal((await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Essai', due_date: '2030-01-07', repeat }] })).body.error?.code, -32602, JSON.stringify(repeat));
  }
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM items WHERE name = 'Essai'").pluck().get(), 0);
});

test('écran : « Un jour du mois » ou « Un jour de la semaine », rang et jour proposés depuis l\'échéance', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /h\('option', \{ value: 'day' \}, 'Un jour du mois \(le 5\)'\),\s*h\('option', \{ value: 'week' \}, 'Un jour de la semaine \(le 1er lundi\)'\)\);/);
  assert.match(list, /if \(!monthNth\) monthNth = monthWeekOf\(base\);\s*if \(!monthWeekday\) monthWeekday = weekdayOf\(base\);/);
  assert.match(list, /monthPicker\.el\.hidden = repeatKind !== 'month' \|\| monthMode !== 'day';/);
  assert.match(list, /monthWeekRow\.hidden = repeatKind !== 'month' \|\| monthMode !== 'week';/);
});
