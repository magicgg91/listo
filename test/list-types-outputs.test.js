// Types de liste dans les sorties du serveur : accès depuis Claude (MCP) et
// lien public. Le type remplace la catégorie ; le magasin conservé par une
// liste passée de Courses à Tâches n'apparaît nulle part tant qu'elle est
// une liste de tâches, et réapparaît au retour à Courses. Le code du serveur
// ne lit plus la catégorie que pour traduire une ancienne opération et
// remplir les champs provisoires.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from './helpers.js';
import { PASSWORD, household, connect, claude, data } from './mcp-helpers.js';
import { TOOLS } from '../server/mcp-tools.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

// Courses avec le magasin « Lidl » et un article au rayon Crèmerie ; un lien public
async function setup(t) {
  const h = await household(t);
  const op = async (operation) => (await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), ...operation }] })).body.results[0];
  const lidl = h.app.db.prepare("SELECT id FROM stores WHERE name = 'Lidl'").pluck().get();
  assert.equal((await op({ type: 'list.update', listId: h.ids.courses, storeId: lidl })).status, 200);
  const share = await h.guillaume.request('PUT', `/api/lists/${h.ids.courses}/share`, {});
  assert.equal(share.status, 201, share.text);
  const token = share.body.share.url.split('/p/')[1];
  const visitor = createClient(h.app.base, { ip: '203.0.113.9' });
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  const pub = async () => (await visitor.get(`/api/public/${token}`)).body;
  const mcpList = async () => data(await c.tool('list_lists')).lists.find((l) => l.id === h.ids.courses);
  const mcpRead = async () => data(await c.tool('read_list', { list_id: h.ids.courses, include_checked: true }));
  return { h, c, op, pub, mcpList, mcpRead };
}

test('MCP : list_lists et read_list donnent le type (shopping, tasks), jamais la catégorie ; descriptions « courses ou tâches »', async (t) => {
  const { h, c, mcpList } = await setup(t);
  const lists = data(await c.tool('list_lists')).lists;
  for (const list of lists) {
    assert.deepEqual(Object.keys(list).sort(), ['access', 'checked_count', 'id', 'item_count', 'name', 'type']);
    assert.ok(['shopping', 'tasks'].includes(list.type), list.type);
  }
  assert.equal((await mcpList()).type, 'shopping');
  assert.equal(lists.find((l) => l.id === h.ids.maison).type, 'tasks');
  const maison = data(await c.tool('read_list', { list_id: h.ids.maison }));
  assert.deepEqual(Object.keys(maison.list).sort(), ['access', 'id', 'name', 'type']);
  assert.equal(JSON.stringify(lists).includes('category'), false);
  const text = JSON.stringify(TOOLS);
  assert.match(text, /type \(shopping : liste de courses, tasks : liste de tâches, wishes : liste d'envies, des idées cadeaux\)/);
  assert.match(text, /pour une liste de tâches, la priorité et l'échéance/);
  assert.doesNotMatch(text, /catégorie|courses ou autre|'other'|"other"/);
});

test('magasin conservé : caché pour Claude et sur le lien public tant que la liste est de tâches ; il revient au retour à Courses', async (t) => {
  const { op, pub, mcpList, mcpRead, h } = await setup(t);
  // Courses : le magasin et les rayons se voient partout
  assert.equal((await mcpRead()).list.store, 'Lidl');
  assert.equal((await pub()).list.store, 'Lidl');
  assert.equal((await pub()).list.type, 'shopping');
  assert.equal((await pub()).list.grouping, 'aisle');

  // Tâches : plus aucune trace du magasin ni des rayons, ni des codes-barres
  assert.equal((await op({ type: 'list.update', listId: h.ids.courses, listType: 'tasks' })).status, 200);
  const asTasks = await mcpRead();
  assert.equal(asTasks.list.type, 'tasks');
  assert.equal('store' in asTasks.list, false);
  const mcpText = JSON.stringify(asTasks) + JSON.stringify(await mcpList());
  for (const hidden of ['Lidl', 'Crèmerie', '"aisle"', '"store"', '"ean"', '3428272950019']) assert.equal(mcpText.includes(hidden), false, `Claude : ${hidden}`);
  const page = await pub();
  assert.equal(page.list.type, 'tasks');
  assert.equal(page.list.store, null);
  assert.equal(page.list.grouping, 'none');
  const pageText = JSON.stringify(page);
  for (const hidden of ['Lidl', 'Crèmerie', '"aisle"', '"ean"', '3428272950019']) assert.equal(pageText.includes(hidden), false, `lien public : ${hidden}`);
  // Le magasin reste en base
  assert.notEqual(h.app.db.prepare('SELECT store_id FROM lists WHERE id = ?').pluck().get(h.ids.courses), null);

  // Retour à Courses : le magasin, les rayons et le code-barres reviennent
  assert.equal((await op({ type: 'list.update', listId: h.ids.courses, listType: 'shopping' })).status, 200);
  const back = await mcpRead();
  assert.equal(back.list.store, 'Lidl');
  assert.ok(back.items.some((i) => i.aisle === 'Crèmerie' && i.ean === '3428272950019'), JSON.stringify(back.items));
  assert.equal((await pub()).list.store, 'Lidl');
  assert.equal((await pub()).list.grouping, 'aisle');
});

test('le code du serveur ne lit plus la catégorie : seulement la traduction des anciennes opérations et les champs provisoires', () => {
  for (const file of ['server/mcp-tools.js', 'server/mcp.js', 'server/routes/public.js', 'server/routes/oauth.js', 'server/routes/products.js',
    'server/routes/references.js', 'server/routes/admin-names.js', 'server/routes/admin-references.js', 'server/routes/lists.js', 'server/news.js']) {
    assert.doesNotMatch(code(file), /categor/i, file);
  }
  // server/lists.js : le caractère « courses » d'une catégorie n'est lu qu'à
  // trois endroits : le choix de la catégorie à écrire dans category_id
  // (legacyCategoryId), la description des catégories envoyées aux anciens
  // téléphones (champ provisoire « categories ») et la traduction d'une
  // ancienne opération (requestedType)
  const lists = code('server/lists.js');
  const reads = lists.split('\n').filter((line) => /is_shopping/.test(line)).map((line) => line.trim());
  assert.deepEqual(reads, [
    "legacyCategory: db.prepare('SELECT id FROM categories WHERE is_shopping = ? ORDER BY id LIMIT 1').pluck(),",
    "type = category.is_shopping === 1 ? 'shopping' : 'tasks';",
    '...(row.is_shopping !== undefined ? { isShopping: row.is_shopping === 1 } : {}),',
  ]);
  assert.match(lists, /function requestedType\(op\)/);
  assert.match(lists, /function legacyCategoryId\(type\)/);
  // Pas de JOIN sur les catégories : le type vient de la colonne lists.type
  assert.doesNotMatch(lists, /JOIN categories/);
});
