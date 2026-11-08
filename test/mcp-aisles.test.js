// Connexion Claude : choisir le rayon à l'ajout (add_items) et le changer
// (update_items). Claude lit les rayons disponibles dans read_list
// (list.aisles, des noms) ; un nom est comparé sans accents ni majuscules
// aux rayons actifs ; le rayon passe par aisleId, le même chemin que
// l'application (item.create, item.update, mémoire des noms).
//
// Foyer (mcp-helpers.js) : Guillaume (Admin) a « Courses » (courses, Marie
// en lecture seule ; Lait au rayon Crèmerie, Pain coché), « Maison » (tâches)
// et « Secret » (tâches) ; Marie a « Perso ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuid, PASSWORD, household, connect, claude, data } from './mcp-helpers.js';
import { READ_ONLY_GRANT, AISLE_NOT_HERE, TOOLS } from '../server/mcp-tools.js';
import { INSTRUCTIONS } from '../server/mcp.js';
import { MULTI_NO_AISLE } from '../server/lists.js';
import { normalizeItemName } from '../public/js/history.js';

const toolError = (res) => (res.body.result?.isError ? res.body.result.content[0].text : null);
const aisleOf = (h, itemId) => h.app.db.prepare('SELECT aisles.name FROM items LEFT JOIN aisles ON aisles.id = items.aisle_id WHERE items.id = ?').pluck().get(itemId) ?? null;
const aisleId = (h, name) => h.app.db.prepare('SELECT id FROM aisles WHERE name = ?').pluck().get(name);
const count = (h, listId) => h.app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ?').pluck().get(listId);

async function writer(t) {
  const h = await household(t);
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  return { h, c };
}

test('read_list : les rayons qu\'on peut choisir (noms actifs, ordre de l\'application), seulement pour une liste de courses à magasin simple', async (t) => {
  const { h, c } = await writer(t);
  // Un rayon désactivé n'est pas proposé
  h.app.db.prepare("UPDATE aisles SET active = 0 WHERE name = 'Surgelés'").run();
  const courses = data(await c.tool('read_list', { list_id: h.ids.courses })).list;
  const expected = h.app.db.prepare('SELECT name FROM aisles WHERE active = 1').pluck().all().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }) || a.localeCompare(b, 'fr'));
  assert.deepEqual(courses.aisles, expected);
  assert.ok(courses.aisles.includes('Fruits et légumes') && !courses.aisles.includes('Surgelés'));
  assert.ok(courses.aisles.every((name) => typeof name === 'string'), 'des noms, aucun identifiant');
  // Liste de tâches : pas de rayons ; list_lists inchangé
  assert.equal(data(await c.tool('read_list', { list_id: h.ids.maison })).list.aisles, undefined);
  assert.ok(data(await c.tool('list_lists')).lists.every((l) => !('aisles' in l)));
});

test('add_items : rayon précisé pour un article nouveau (accents et majuscules ignorés), utilisé et mémorisé ; non précisé : rayon habituel inchangé ; réponse avec le rayon obtenu', async (t) => {
  const { h, c } = await writer(t);
  const res = data(await c.tool('add_items', { list_id: h.ids.courses, items: [
    { name: 'Tomates', aisle: 'fruits ET LEGUMES' },
    { name: 'Glace vanille', aisle: '  surgeles ' },
    { name: 'Lessive' },
    { name: 'Truc inconnu', aisle: '' },
  ] }));
  assert.equal(res.created, 4);
  const byName = Object.fromEntries(res.results.map((r) => [r.name, r]));
  assert.equal(byName.Tomates.aisle, 'Fruits et légumes');
  assert.equal(byName['Glace vanille'].aisle, 'Surgelés');
  assert.equal(byName.Lessive.aisle, undefined, 'article jamais vu, pas de rayon habituel : sans rayon');
  assert.equal(byName['Truc inconnu'].aisle, undefined, 'texte vide : sans rayon');
  assert.deepEqual([aisleOf(h, byName.Tomates.id), aisleOf(h, byName['Glace vanille'].id), aisleOf(h, byName.Lessive.id)], ['Fruits et légumes', 'Surgelés', null]);
  // Mémorisé comme dans l'application : le prochain ajout sans rayon le retrouve
  const history = h.app.db.prepare('SELECT aisle_id FROM item_history WHERE name_normalized = ? AND store_id IS NULL').pluck().get(normalizeItemName('Tomates'));
  assert.equal(history, aisleId(h, 'Fruits et légumes'));
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.delete', itemId: byName.Tomates.id }] });
  h.app.clock.now += 3 * 60 * 1000; // au-delà de l'anti-doublon (2 minutes)
  const again = data(await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'tomates' }] }));
  assert.equal(again.results[0].aisle, 'Fruits et légumes', 'rayon habituel retrouvé');
  // Un rayon précisé l'emporte sur le rayon habituel
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.delete', itemId: again.results[0].id }] });
  h.app.clock.now += 3 * 60 * 1000;
  assert.equal(data(await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'Tomates', aisle: 'Épicerie salée' }] })).results[0].aisle, 'Épicerie salée');
  // L'application voit l'article dans son rayon
  const groups = (await h.guillaume.get(`/api/lists/${h.ids.courses}`)).body.groups;
  assert.ok(groups.find((g) => g.aisle?.name === 'Épicerie salée').items.some((i) => i.name === 'Tomates'));
});

test('add_items : rayon inconnu ou désactivé, liste multi, de tâches ou d\'envies : l\'appel entier est refusé, rien n\'est ajouté ; le message donne les rayons valides', async (t) => {
  const { h, c } = await writer(t);
  h.app.db.prepare("UPDATE aisles SET active = 0 WHERE name = 'Surgelés'").run();
  const before = count(h, h.ids.courses);
  const unknown = toolError(await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'Pommes', aisle: 'Fruits et légumes' }, { name: 'Bonbons', aisle: 'Confiserie' }] }));
  assert.match(unknown, /^Rayon inconnu ou désactivé : « Confiserie »\. Rayons disponibles : Boissons, Boucherie, Boulangerie, Crèmerie, .*Fruits et légumes.*\. Rien n'a été écrit\.$/);
  assert.doesNotMatch(unknown, /Surgelés/);
  assert.match(toolError(await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'Glace', aisle: 'Surgelés' }] })), /^Rayon inconnu ou désactivé : « Surgelés »/);
  assert.equal(count(h, h.ids.courses), before, 'rien n\'est ajouté, même « Pommes »');
  // Tâches et envies
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Vis', aisle: 'Boissons' }] })), AISLE_NOT_HERE);
  const noel = uuid();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId: noel, name: 'Noël', listType: 'wishes' }] });
  assert.equal(toolError(await c.tool('add_items', { list_id: noel, items: [{ name: 'Vélo', aisle: '' }] })), AISLE_NOT_HERE);
  // Liste « multi »
  const store = async (name, isMulti = false) => (await h.guillaume.post('/api/admin/stores', { name, isMulti })).body.item.id;
  const primeur = await store('Primeur');
  const tournee = await store('Tournée', true);
  await h.guillaume.request('PATCH', `/api/admin/stores/${tournee}`, { storeIds: [primeur] });
  const multi = uuid();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId: multi, name: 'Samedi', listType: 'shopping', storeId: tournee }] });
  separate(h);
  const all = claude(h, (await connect(h, h.guillaume, PASSWORD, { scope: 'write' })).access_token);
  assert.equal(data(await all.tool('read_list', { list_id: multi })).list.aisles, undefined, 'liste multi : pas de rayons proposés');
  assert.equal(toolError(await all.tool('add_items', { list_id: multi, items: [{ name: 'Salade', aisle: 'Fruits et légumes' }] })), MULTI_NO_AISLE);
  assert.equal(count(h, multi), 0);
  // Type de valeur : erreur d'arguments
  assert.equal((await all.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'X', aisle: 3 }] })).body.error?.code, -32602);
});

let appNumber = 0;
const separate = (h) => h.app.db.prepare('UPDATE oauth_grants SET app_key = ?').run(`autre-${++appNumber}`);

test('update_items : changer le rayon (mémorisé), « Sans rayon » avec un texte vide, même règles ; même rayon : inchangé ; plafond commun aux modifications', async (t) => {
  const { h, c } = await writer(t);
  assert.equal(aisleOf(h, h.ids.lait), 'Crèmerie');
  const moved = data(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, aisle: 'épicerie SUCRÉE' }] }));
  assert.equal(moved.results[0].aisle, 'Épicerie sucrée');
  assert.equal(aisleOf(h, h.ids.lait), 'Épicerie sucrée');
  assert.equal(h.app.db.prepare('SELECT aisle_id FROM item_history WHERE name_normalized = ? AND store_id IS NULL').pluck().get('lait'), aisleId(h, 'Épicerie sucrée'), 'mémorisé');
  // Même rayon : inchangé
  assert.equal(data(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, aisle: 'Epicerie sucree' }] })).unchanged, 1);
  // Texte vide : sans rayon (pas de champ aisle dans la réponse)
  const none = data(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, aisle: '' }] }));
  assert.equal(none.updated, 1);
  assert.equal('aisle' in none.results[0], false);
  assert.equal(aisleOf(h, h.ids.lait), null);
  // Rayon inconnu : tout l'appel est refusé (même le nom)
  const err = toolError(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, name: 'Lait entier' }, { id: h.ids.pain, aisle: 'Viennoiseries' }] }));
  assert.match(err, /^Rayon inconnu ou désactivé : « Viennoiseries »\. Rayons disponibles : /);
  assert.equal(h.app.db.prepare('SELECT name FROM items WHERE id = ?').pluck().get(h.ids.lait), 'Lait');
  // Liste de tâches : refusé
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, aisle: 'Boissons' }] })), AISLE_NOT_HERE);
  // Le plafond de 300 par heure compte aussi les changements de rayon (un seul compteur)
  const source = (await import('node:fs')).readFileSync(new URL('../server/mcp-tools.js', import.meta.url), 'utf8');
  assert.match(source, /if \(recent\.length \+ ops\.length > UPDATES_PER_HOUR\)/);
});

test('connexion en lecture seule : toujours refusée, rayon ou pas', async (t) => {
  const h = await household(t);
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD)).access_token);
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.courses, items: [{ name: 'Tomates', aisle: 'Fruits et légumes' }] })), READ_ONLY_GRANT);
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, aisle: 'Boissons' }] })), READ_ONLY_GRANT);
  assert.equal(aisleOf(h, h.ids.lait), 'Crèmerie');
});

test('descriptions et consignes : lire les rayons, choisir parmi eux, ne pas en inventer, dire si un article est resté sans rayon', () => {
  const byName = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool]));
  assert.match(byName.read_list.description, /dans list\.aisles les noms des rayons qu'on peut choisir/);
  assert.match(byName.add_items.description, /aisle \(facultatif\), le nom d'un rayon pris dans list\.aisles de read_list/);
  assert.match(byName.add_items.description, /N'inventez pas de rayon : un rayon inconnu ou désactivé refuse l'appel entier \(le message donne les rayons valides\)/);
  assert.match(byName.add_items.description, /s'il est absent, l'article est sans rayon : dites-le à la personne/);
  assert.match(byName.update_items.description, /aisle \(liste de courses à magasin simple : nom d'un rayon pris dans list\.aisles de read_list ; texte vide : sans rayon ; jamais un rayon inventé\)/);
  assert.match(INSTRUCTIONS, /choisissez le rayon parmi ses rayons disponibles \(list\.aisles\) et passez-le dans aisle ; n'inventez jamais de rayon\. La réponse dit le rayon obtenu : si un article est resté sans rayon, dites-le à la personne/);
});
