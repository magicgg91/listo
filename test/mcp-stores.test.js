// Connexion Claude : choisir le magasin d'un article dans une liste « multi »
// à l'ajout (add_items) et le changer (update_items). Même façon de faire que
// le rayon (test/mcp-aisles.test.js) : Claude lit les magasins proposés dans
// read_list (list.stores, des noms) ; un nom est comparé sans accents ni
// majuscules aux magasins que CETTE liste propose (actifs, regroupés par son
// magasin « multi ») ; le magasin passe par storeId, le même chemin que
// l'application (item.create, item.update, mémoire des noms).
//
// Foyer (mcp-helpers.js) : Guillaume (Admin) a « Courses » (courses sans
// magasin, Lait au rayon Crèmerie), « Maison » (tâches)… Ici on ajoute :
// - magasins simples E.Leclerc, Lidl (de départ), Primeur, Épicerie Fermée
//   (désactivée ensuite) et Carrefour (de départ, regroupé ailleurs) ;
// - « Tournée » (multi) : E.Leclerc, Lidl, Primeur, Épicerie Fermée ;
//   « Autre tournée » (multi) : Carrefour ;
// - listes « Samedi » (courses, magasin Tournée, avec Pommes chez Primeur),
//   « Lidl » (courses à magasin simple) et « Noël » (envies).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuid, PASSWORD, household, connect, claude, data } from './mcp-helpers.js';
import { READ_ONLY_GRANT, STORE_NOT_HERE, SIMPLE_NO_STORE, TOOLS } from '../server/mcp-tools.js';
import { INSTRUCTIONS } from '../server/mcp.js';
import { MULTI_NO_AISLE } from '../server/lists.js';
import { normalizeItemName } from '../public/js/history.js';

const MINUTE = 60 * 1000;
const toolError = (res) => (res.body.result?.isError ? res.body.result.content[0].text : null);
const storeOf = (h, itemId) => h.app.db.prepare('SELECT stores.name FROM items LEFT JOIN stores ON stores.id = items.store_id WHERE items.id = ?').pluck().get(itemId) ?? null;
const count = (h, listId) => h.app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ?').pluck().get(listId);
const storeId = (h, name) => h.app.db.prepare('SELECT id FROM stores WHERE name = ?').pluck().get(name);
const ops = (h, list) => h.guillaume.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });

// Le foyer, les magasins et les listes ci-dessus, puis une connexion
// (« Lecture et écriture » par défaut) créée APRÈS les listes
async function town(t, choice = { scope: 'write' }) {
  const h = await household(t);
  const addStore = async (name, isMulti = false) => {
    const res = await h.guillaume.post('/api/admin/stores', { name, isMulti });
    assert.equal(res.status, 201, res.text);
    return res.body.item.id;
  };
  const primeur = await addStore('Primeur');
  const fermee = await addStore('Épicerie Fermée');
  const tournee = await addStore('Tournée', true);
  const autre = await addStore('Autre tournée', true);
  const regroup = (id, storeIds) => h.guillaume.request('PATCH', `/api/admin/stores/${id}`, { storeIds });
  assert.equal((await regroup(tournee, [storeId(h, 'E.Leclerc'), storeId(h, 'Lidl'), primeur, fermee])).status, 200);
  assert.equal((await regroup(autre, [storeId(h, 'Carrefour')])).status, 200);
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/stores/${fermee}`, { active: false })).status, 200);
  const ids = { samedi: uuid(), lidl: uuid(), noel: uuid(), pommes: uuid() };
  await ops(h, [
    { type: 'list.create', listId: ids.samedi, name: 'Samedi', listType: 'shopping', storeId: tournee },
    { type: 'item.create', listId: ids.samedi, itemId: ids.pommes, name: 'Pommes', storeId: primeur },
    { type: 'list.create', listId: ids.lidl, name: 'Lidl', listType: 'shopping', storeId: storeId(h, 'Lidl') },
    { type: 'list.create', listId: ids.noel, name: 'Noël', listType: 'wishes' },
  ]);
  Object.assign(h.ids, ids);
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, choice)).access_token);
  return { h, c };
}

test('read_list : les magasins qu\'une liste « multi » propose (actifs, regroupés par son magasin, ordre de l\'application), des noms ; aucun ailleurs', async (t) => {
  const { h, c } = await town(t);
  const samedi = data(await c.tool('read_list', { list_id: h.ids.samedi })).list;
  assert.deepEqual(samedi.stores, ['E.Leclerc', 'Lidl', 'Primeur'], 'ni le magasin désactivé, ni Carrefour (regroupé par un autre « multi »)');
  assert.equal(samedi.store, 'Tournée');
  assert.equal(samedi.aisles, undefined, 'pas de rayons dans une liste « multi »');
  // Liste à magasin simple : ses rayons, pas de magasins ; tâches et envies : rien
  const lidl = data(await c.tool('read_list', { list_id: h.ids.lidl })).list;
  assert.equal(lidl.stores, undefined);
  assert.ok(Array.isArray(lidl.aisles));
  for (const id of [h.ids.courses, h.ids.maison, h.ids.noel]) assert.equal(data(await c.tool('read_list', { list_id: id })).list.stores, undefined);
  assert.ok(data(await c.tool('list_lists')).lists.every((l) => !('stores' in l)), 'list_lists inchangé');
});

test('add_items : magasin précisé (accents et majuscules ignorés) utilisé pour un article nouveau ; texte vide : sans magasin ; non précisé : magasin habituel inchangé ; réponse avec le magasin obtenu', async (t) => {
  const { h, c } = await town(t);
  const res = data(await c.tool('add_items', { list_id: h.ids.samedi, items: [
    { name: 'Lait', store: '  e.leclerc ' },
    { name: 'Salade', store: 'PRIMEUR' },
    { name: 'Piles', store: '' },
    { name: 'Lessive' },
  ] }));
  assert.equal(res.created, 4);
  const byName = Object.fromEntries(res.results.map((r) => [r.name, r]));
  assert.equal(byName.Lait.store, 'E.Leclerc');
  assert.equal(byName.Salade.store, 'Primeur');
  assert.equal('store' in byName.Piles, false, 'texte vide : sans magasin (pas de champ store)');
  assert.equal('store' in byName.Lessive, false, 'jamais vu, pas de magasin habituel : sans magasin, comme avant');
  assert.deepEqual([storeOf(h, byName.Lait.id), storeOf(h, byName.Salade.id), storeOf(h, byName.Piles.id), storeOf(h, byName.Lessive.id)], ['E.Leclerc', 'Primeur', null, null]);
  for (const r of res.results) assert.equal('aisle' in r, false, 'pas de rayon dans une liste « multi »');
  // L'application voit l'article dans le groupe de son magasin
  const groups = (await h.guillaume.get(`/api/lists/${h.ids.samedi}`)).body.groups;
  assert.ok(groups.find((g) => g.store?.name === 'E.Leclerc').items.some((i) => i.name === 'Lait'));
});

test('add_items : le magasin choisi est mémorisé (prochain ajout sans magasin : le même) ; un magasin précisé l\'emporte sur le magasin habituel', async (t) => {
  const { h, c } = await town(t);
  const first = data(await c.tool('add_items', { list_id: h.ids.samedi, items: [{ name: 'Lait', store: 'Lidl' }] })).results[0];
  assert.equal(first.store, 'Lidl');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM item_history WHERE name_normalized = ? AND store_id = ?').pluck().get(normalizeItemName('Lait'), storeId(h, 'Lidl')), 1, 'achat chez Lidl mémorisé');
  await ops(h, [{ type: 'item.delete', itemId: first.id }]);
  h.app.clock.now += 3 * MINUTE; // au-delà de l'anti-doublon (2 minutes)
  const again = data(await c.tool('add_items', { list_id: h.ids.samedi, items: [{ name: 'lait' }] })).results[0];
  assert.equal(again.store, 'Lidl', 'magasin habituel retrouvé, comme dans l\'application');
  await ops(h, [{ type: 'item.delete', itemId: again.id }]);
  h.app.clock.now += 3 * MINUTE;
  const chosen = data(await c.tool('add_items', { list_id: h.ids.samedi, items: [{ name: 'Lait', store: 'E.Leclerc' }] })).results[0];
  assert.equal(chosen.store, 'E.Leclerc');
  assert.equal(storeOf(h, chosen.id), 'E.Leclerc');
});

test('add_items : magasin inconnu, désactivé ou d\'une autre liste : l\'appel entier est refusé, rien n\'est ajouté, le message donne les magasins valides', async (t) => {
  const { h, c } = await town(t);
  const before = count(h, h.ids.samedi);
  for (const name of ['Auchan', 'Épicerie Fermée', 'Carrefour', 'Tournée']) {
    const error = toolError(await c.tool('add_items', { list_id: h.ids.samedi, items: [{ name: 'Pain', store: 'Lidl' }, { name: 'Beurre', store: name }] }));
    assert.equal(error, `Magasin inconnu, désactivé ou que cette liste ne propose pas : « ${name} ». Magasins disponibles : E.Leclerc, Lidl, Primeur. Rien n'a été écrit.`);
    assert.equal(count(h, h.ids.samedi), before, `rien n'est ajouté, même « Pain » (${name})`);
  }
  // Type de valeur : erreur d'arguments
  assert.equal((await c.tool('add_items', { list_id: h.ids.samedi, items: [{ name: 'X', store: 3 }] })).body.error?.code, -32602);
});

test('add_items : magasin refusé dans une liste à magasin simple, de tâches ou d\'envies ; rayon toujours refusé dans une liste « multi »', async (t) => {
  const { h, c } = await town(t);
  for (const listId of [h.ids.lidl, h.ids.courses]) {
    const before = count(h, listId);
    assert.equal(toolError(await c.tool('add_items', { list_id: listId, items: [{ name: 'Pain' }, { name: 'Lait', store: 'Lidl' }] })), SIMPLE_NO_STORE);
    assert.equal(toolError(await c.tool('add_items', { list_id: listId, items: [{ name: 'Lait', store: '' }] })), SIMPLE_NO_STORE, 'même vide');
    assert.equal(count(h, listId), before);
  }
  assert.match(SIMPLE_NO_STORE, /le magasin est celui de la liste/);
  assert.match(SIMPLE_NO_STORE, /choisissez son rayon \(aisle\)/);
  for (const listId of [h.ids.maison, h.ids.noel]) {
    assert.equal(toolError(await c.tool('add_items', { list_id: listId, items: [{ name: 'Vélo', store: 'Lidl' }] })), STORE_NOT_HERE);
    assert.equal(count(h, listId), listId === h.ids.maison ? 1 : 0);
  }
  // Liste « multi » : pas de rayon (inchangé), même avec un magasin valable
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.samedi, items: [{ name: 'Salade', store: 'Primeur', aisle: 'Fruits et légumes' }] })), MULTI_NO_AISLE);
  assert.equal(count(h, h.ids.samedi), 1);
});

test('update_items : changer le magasin (mémorisé), le vider, mêmes règles ; même magasin : inchangé ; plafond commun', async (t) => {
  const { h, c } = await town(t);
  assert.equal(storeOf(h, h.ids.pommes), 'Primeur');
  const moved = data(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, store: 'lidl' }] }));
  assert.equal(moved.updated, 1);
  assert.equal(moved.results[0].store, 'Lidl');
  assert.equal(storeOf(h, h.ids.pommes), 'Lidl');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM item_history WHERE name_normalized = ? AND store_id = ?').pluck().get('pommes', storeId(h, 'Lidl')), 1, 'achat déplacé chez Lidl (mémoire des noms)');
  // Même magasin : inchangé
  assert.equal(data(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, store: 'LIDL' }] })).unchanged, 1);
  // Un autre champ seul : le magasin est redonné dans la réponse
  assert.equal(data(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, quantity: '1 kg' }] })).results[0].store, 'Lidl');
  // Texte vide : sans magasin (pas de champ store dans la réponse)
  const none = data(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, store: '' }] }));
  assert.equal(none.updated, 1);
  assert.equal('store' in none.results[0], false);
  assert.equal(storeOf(h, h.ids.pommes), null);
  // Magasin inconnu, désactivé ou d'une autre liste : tout l'appel est refusé (même la note)
  for (const name of ['Auchan', 'Épicerie Fermée', 'Carrefour']) {
    const err = toolError(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, note: 'bio' }, { id: h.ids.pommes, store: name }] }));
    assert.match(err, new RegExp(`^Magasin inconnu, désactivé ou que cette liste ne propose pas : « ${name} »\\. Magasins disponibles : E\\.Leclerc, Lidl, Primeur\\.`));
  }
  assert.equal(h.app.db.prepare('SELECT note FROM items WHERE id = ?').pluck().get(h.ids.pommes), '');
  // Liste à magasin simple, de tâches : refusé ; rayon dans une liste « multi » : refusé
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.courses, items: [{ id: h.ids.lait, store: 'Lidl' }] })), SIMPLE_NO_STORE);
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, store: 'Lidl' }] })), STORE_NOT_HERE);
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, aisle: 'Boissons' }] })), MULTI_NO_AISLE);
  // Le plafond de 300 par heure compte aussi les changements de magasin (un seul compteur)
  const source = (await import('node:fs')).readFileSync(new URL('../server/mcp-tools.js', import.meta.url), 'utf8');
  assert.match(source, /if \(recent\.length \+ ops\.length > UPDATES_PER_HOUR\)/);
});

test('update_items : un magasin désactivé que l\'article avait déjà est gardé et redonné dans la réponse (pas « sans magasin »)', async (t) => {
  const { h, c } = await town(t);
  await h.guillaume.request('PATCH', `/api/admin/stores/${storeId(h, 'Primeur')}`, { active: false });
  const res = data(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, note: 'bien mûres' }] }));
  assert.equal(res.results[0].store, 'Primeur');
  assert.equal(storeOf(h, h.ids.pommes), 'Primeur');
});

test('messages d\'erreur d\'update_items : ils citent tous les champs acceptés, aisle et store compris', async (t) => {
  const { h, c } = await town(t);
  const extra = (await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, magasin: 'Lidl' }] })).body.error;
  assert.equal(extra.code, -32602);
  assert.match(extra.message, /seuls id, name, quantity, note, priority, due_date, repeat, aisle et store sont acceptés/);
  const empty = (await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes }] })).body.error;
  assert.match(empty.message, /au moins un champ à modifier \(name, quantity, note, priority, due_date, repeat, aisle ou store\)/);
  const shape = (await c.tool('update_items', { list_id: h.ids.samedi, items: ['x'] })).body.error;
  assert.match(shape.message, /\{ id, name\?, quantity\?, note\?, priority\?, due_date\?, repeat\?, aisle\?, store\? \}/);
});

test('connexion en lecture seule : toujours refusée, magasin ou pas', async (t) => {
  const { h, c } = await town(t, {});
  assert.equal(toolError(await c.tool('add_items', { list_id: h.ids.samedi, items: [{ name: 'Lait', store: 'Lidl' }] })), READ_ONLY_GRANT);
  assert.equal(toolError(await c.tool('update_items', { list_id: h.ids.samedi, items: [{ id: h.ids.pommes, store: 'Lidl' }] })), READ_ONLY_GRANT);
  assert.equal(count(h, h.ids.samedi), 1);
  assert.equal(storeOf(h, h.ids.pommes), 'Primeur');
  // La lecture, elle, donne toujours les magasins proposés
  assert.deepEqual(data(await c.tool('read_list', { list_id: h.ids.samedi })).list.stores, ['E.Leclerc', 'Lidl', 'Primeur']);
});

test('descriptions et consignes : lire les magasins, choisir parmi eux, ne pas en inventer, dire si un article est resté sans magasin', () => {
  const byName = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool]));
  assert.match(byName.read_list.description, /dans list\.stores les noms des magasins qu'on peut choisir pour un article \(liste « multi »\)/);
  assert.match(byName.add_items.description, /store \(facultatif\), le nom d'un magasin pris dans list\.stores de read_list/);
  assert.match(byName.add_items.description, /N'inventez pas de magasin : un magasin inconnu, désactivé ou que cette liste ne propose pas refuse l'appel entier \(le message donne les magasins valides\)/);
  assert.match(byName.add_items.description, /s'il est absent, l'article est sans magasin : dites-le à la personne/);
  assert.match(byName.update_items.description, /store \(liste « multi » : nom d'un magasin pris dans list\.stores de read_list ; texte vide : sans magasin ; jamais un magasin inventé\)/);
  assert.match(INSTRUCTIONS, /choisissez le magasin parmi ses magasins disponibles \(list\.stores\) et passez-le dans store ; n'inventez jamais de magasin\. La réponse dit le magasin obtenu : si un article est resté sans magasin, dites-le à la personne/);
  assert.ok(byName.add_items.inputSchema.properties.items.items.properties.store);
  assert.ok(byName.update_items.inputSchema.properties.items.items.properties.store);
});
