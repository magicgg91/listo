// Connexion Claude : priorité et échéance. add_items les accepte (si la
// liste les active) ; update_items (test/mcp-update.test.js) règle celles
// d'éléments existants. La règle est celle de l'application
// (itemOptionsError, server/lists.js).
//
// Foyer (mcp-helpers.js) : Guillaume (Admin) a « Courses » (courses, Marie en
// lecture seule), « Maison » (tâches, priorité et échéance activées ;
// « Ampoule » : élevée, 2026-11-05) et « Secret » (tâches, sans option) ;
// Marie a « Perso ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addUser, login } from './helpers.js';
import { uuid, SECOND, PASSWORD, MARIE_PASSWORD, household, connect, claude, data } from './mcp-helpers.js';
import { TOOLS } from '../server/mcp-tools.js';
import { PRIORITY_OFF, DUE_OFF, PRIORITY_NOT_HERE, DUE_NOT_HERE, BAD_PRIORITY, BAD_DUE, itemOptionsError } from '../server/lists.js';

const MINUTE = 60 * SECOND;
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const toolError = (res) => (res.body.result?.isError ? res.body.result.content[0].text : null);
const rpcError = (res) => res.body.error ?? null;
const write = (choice = {}) => ({ scope: 'write', ...choice });
const row = (h, id) => h.app.db.prepare('SELECT name, quantity, note, link, price_cents, checked, deleted_at, priority, due_date, updated_at FROM items WHERE id = ?').get(id);
const countItems = (h, listId) => h.app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ?').pluck().get(listId);

async function writer(t) {
  const h = await household(t);
  const tokens = await connect(h, h.guillaume, PASSWORD, write());
  const c = claude(h, tokens.access_token);
  return { h, c, tokens };
}
// Une nouvelle connexion de la même application remplace la précédente :
// on renomme d'abord l'application des connexions existantes
let appNumber = 0;
const separateApp = (h) => h.app.db.prepare('UPDATE oauth_grants SET app_key = ?').run(`autre-${++appNumber}`);

test('règle partagée : type de liste, réglage activé, valeur, vraie date du calendrier', () => {
  const on = { priorityEnabled: true, dueEnabled: true };
  assert.equal(itemOptionsError('tasks', on, { priority: 'high', dueDate: '2026-12-24' }), null);
  assert.equal(itemOptionsError('tasks', on, { dueDate: null }), null, 'null efface');
  assert.equal(itemOptionsError('wishes', on, { priority: 'low' }), null);
  assert.equal(itemOptionsError('wishes', on, { dueDate: '2026-12-24' }), DUE_NOT_HERE, 'jamais d\'échéance pour les envies');
  assert.equal(itemOptionsError('shopping', on, { priority: 'low' }), PRIORITY_NOT_HERE);
  assert.equal(itemOptionsError('shopping', on, { dueDate: '2026-12-24' }), DUE_NOT_HERE);
  assert.equal(itemOptionsError('tasks', { priorityEnabled: false, dueEnabled: true }, { priority: 'low' }), PRIORITY_OFF);
  assert.equal(itemOptionsError('tasks', { priorityEnabled: true, dueEnabled: false }, { dueDate: '2026-12-24' }), DUE_OFF);
  assert.equal(itemOptionsError('tasks', on, { priority: 'urgent' }), BAD_PRIORITY);
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-10', '1999-12-31', '2101-01-01', '2026-2-3', '2026-02-03T10:00', '', '24/12/2026']) {
    assert.equal(itemOptionsError('tasks', on, { dueDate: date }), BAD_DUE, date);
  }
  assert.equal(itemOptionsError('tasks', on, { dueDate: '2028-02-29' }), null, 'année bissextile');
  // L'application (item.update, item.create) et Claude utilisent cette seule fonction
  const lists = read('server/lists.js');
  assert.equal((lists.match(/itemOptionsError\(/g) ?? []).length, 4, 'définie une fois, utilisée par item.create, item.update et checkItemEdit (update_items)');
  assert.doesNotMatch(lists, /throw new OpError\(400, PRIORITY_OFF\)|throw new OpError\(400, DUE_OFF\)/, 'plus de règle en double');
  const tools = read('server/mcp-tools.js');
  assert.match(tools, /const error = itemOptionsError\(typeOf\(list\), list, \{ priority: item\.priority, dueDate: item\.due_date, repeat: ruleForCheck\(repeats\.get\(item\)\), dueTime: item\.due_time, remindBefore: remindOf\(item\) \}\);/);
});

test('add_items : priorité et échéance enregistrées si la liste les active ; sinon l\'appel entier est refusé et rien n\'est ajouté', async (t) => {
  const { h, c } = await writer(t);
  const res = data(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Clou', priority: 'high', due_date: '2026-12-24' }, { name: 'Vis', priority: 'low' }, { name: 'Colle' }] }));
  assert.equal(res.created, 3);
  const byName = Object.fromEntries(res.results.map((r) => [r.name, row(h, r.id)]));
  assert.deepEqual([byName.Clou.priority, byName.Clou.due_date], ['high', '2026-12-24']);
  assert.deepEqual([byName.Vis.priority, byName.Vis.due_date], ['low', null]);
  assert.deepEqual([byName.Colle.priority, byName.Colle.due_date], ['normal', null]);
  // Nouveautés : un seul événement « ajout » par élément (pas d'« ajout » puis « modification »)
  const ids = res.results.map((r) => r.id);
  const events = h.app.db.prepare(`SELECT type, COUNT(*) AS n FROM list_events WHERE list_id = ? AND item_id IN (${ids.map(() => '?').join(',')}) GROUP BY type`).all(h.ids.maison, ...ids);
  assert.deepEqual(events, [{ type: 'add', n: 3 }]);
  // Refus : réglage désactivé, mauvais type de liste, valeur ou date fausse ; un seul élément fautif suffit
  const cases = [
    [h.ids.secret, [{ name: 'A', priority: 'high' }], PRIORITY_OFF],
    [h.ids.secret, [{ name: 'A', due_date: '2026-12-24' }], DUE_OFF],
    [h.ids.courses, [{ name: 'A', priority: 'high' }], PRIORITY_NOT_HERE],
    [h.ids.courses, [{ name: 'A', due_date: '2026-12-24' }], DUE_NOT_HERE],
    [h.ids.maison, [{ name: 'Bon' }, { name: 'Faux', due_date: '2026-02-30' }], BAD_DUE],
    [h.ids.maison, [{ name: 'Bon', priority: 'high' }, { name: 'Faux', priority: 'urgent' }], BAD_PRIORITY],
    [h.ids.maison, [{ name: 'Faux', due_date: '1999-12-31' }], BAD_DUE],
  ];
  for (const [listId, items, message] of cases) {
    const before = countItems(h, listId);
    assert.equal(toolError(await c.tool('add_items', { list_id: listId, items })), message, JSON.stringify(items));
    assert.equal(countItems(h, listId), before, 'rien n\'est ajouté');
  }
  // Mauvais type de valeur : erreur d'arguments (-32602)
  for (const item of [{ name: 'A', priority: 3 }, { name: 'A', due_date: 20261224 }, { name: 'A', due_date: null }]) {
    assert.equal(rpcError(await c.tool('add_items', { list_id: h.ids.maison, items: [item] }))?.code, -32602, JSON.stringify(item));
  }
});

test('add_items : un élément déjà là (non coché) est ignoré et n\'est PAS modifié', async (t) => {
  const { h, c } = await writer(t);
  const before = row(h, h.ids.ampoule);
  const res = data(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'ampoule', priority: 'low', due_date: '2027-01-01' }] }));
  assert.deepEqual(res.results, [{ name: 'ampoule', status: 'ignored', reason: 'déjà dans la liste, non coché', existing_id: h.ids.ampoule }]);
  assert.deepEqual(row(h, h.ids.ampoule), before);
});

test('descriptions et instructions : ce que Claude peut faire, exactement ; read_list donne priorité et échéance', () => {
  const byName = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool]));
  assert.match(byName.read_list.description, /pour une liste de tâches, la priorité et l'échéance si elles sont activées \(due_time : l'heure, et remind : le rappel, s'il y en a\), repeat \(la répétition en clair, par exemple « Chaque lundi et mercredi »\) pour une tâche qui se répète, et assigned_to \(le prénom de la personne\) si la tâche est attribuée ; pour une liste d'envies, la priorité si elle est activée/);
  assert.match(byName.add_items.description, /priority \(low, normal ou high\) pour une liste de tâches ou d'envies dont la priorité est activée ; due_date \(date AAAA-MM-JJ\) pour une liste de tâches dont l'échéance est activée \(jamais pour une liste de courses ou d'envies\), avec si besoin due_time \(heure HH:MM\) et remind/);
  assert.match(byName.add_items.description, /l'appel entier est refusé et rien n'est ajouté/);
  assert.match(byName.add_items.description, /déjà dans la liste sans être coché \(il n'est pas modifié\)/);
  assert.deepEqual(Object.keys(byName.add_items.inputSchema.properties.items.items.properties), ['name', 'quantity', 'note', 'link', 'price', 'priority', 'due_date', 'repeat', 'due_time', 'remind', 'assigned_to', 'aisle', 'store']);
  // Plus d'outil set_item_options : update_items fait la même chose en plus large
  assert.equal(byName.set_item_options, undefined);
  assert.deepEqual(byName.update_items.inputSchema.properties.items.items.properties.priority.enum, ['low', 'normal', 'high']);
  assert.match(read('public/sw.js'), /const VERSION = `v(6[4-9]|[7-9]\d|\d{3,})-/);
});
