// Accès depuis Claude (MCP) aux listes d'envies : read_list et list_lists ne
// donnent jamais de réservation (ni au bénéficiaire, ni au gestionnaire) ;
// le bénéficiaire reçoit exactement la même chose avant et après une
// réservation ; add_items accepte lien et prix ; aucun outil de réservation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addUser, login } from './helpers.js';
import { uuid, PASSWORD, MARIE_PASSWORD, household, connect, claude, data } from './mcp-helpers.js';
import { TOOLS } from '../server/mcp-tools.js';

// « Noël de Marie » : Guillaume (propriétaire, gestionnaire) l'a créée pour
// Marie ; Paul, un proche, y réserve
async function setup(t) {
  const h = await household(t);
  const paulId = await addUser(h.app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const paul = h.app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  const ids = { noel: uuid(), velo: uuid(), livre: uuid() };
  const res = (await h.guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: ids.noel, name: 'Noël de Marie', listType: 'wishes', forUserId: h.marieId },
    { id: uuid(), type: 'item.create', listId: ids.noel, itemId: ids.velo, name: 'Vélo', link: 'https://exemple.fr/velo', priceCents: 24990, note: 'Rouge' },
    { id: uuid(), type: 'item.create', listId: ids.noel, itemId: ids.livre, name: 'Livre' },
  ] })).body.results;
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200]);
  await h.guillaume.request('PUT', `/api/lists/${ids.noel}/members`, { userIds: [h.marieId, paulId], access: { [h.marieId]: 'modification', [paulId]: 'lecture' } });
  return { h, paul, ids };
}

test('Claude du bénéficiaire : list_lists et read_list strictement identiques avant et après une réservation ; souhaits avec lien et prix', async (t) => {
  const { h, paul, ids } = await setup(t);
  const c = claude(h, (await connect(h, h.marie, MARIE_PASSWORD, { scope: 'write' })).access_token);
  // Résultats complets (sans le numéro de requête JSON-RPC, propre à chaque appel)
  const outputs = async () => JSON.stringify([
    (await c.tool('list_lists')).body.result,
    (await c.tool('read_list', { list_id: ids.noel, include_checked: true })).body.result,
  ]);
  const before = await outputs();
  const read = data(await c.tool('read_list', { list_id: ids.noel }));
  assert.equal(read.list.type, 'wishes');
  assert.deepEqual(read.items.find((i) => i.name === 'Vélo'), { id: ids.velo, name: 'Vélo', quantity: '', checked: false, note: 'Rouge', link: 'https://exemple.fr/velo', price: 249.9 });
  assert.equal((await paul.post(`/api/items/${ids.velo}/reservation`, {})).status, 200);
  assert.equal((await h.guillaume.post(`/api/items/${ids.livre}/reservation`, {})).status, 200);
  assert.equal(await outputs(), before, 'rien de changé pour Claude au nom du bénéficiaire');
});

test('Claude du gestionnaire et d\'un proche : jamais de réservation non plus ; aucun outil de réservation', async (t) => {
  const { h, paul, ids } = await setup(t);
  await paul.post(`/api/items/${ids.velo}/reservation`, {});
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD)).access_token);
  const text = JSON.stringify((await c.tool('read_list', { list_id: ids.noel, include_checked: true })).body) + JSON.stringify((await c.tool('list_lists')).body);
  assert.equal(/reserv|réserv|Paul|paul/i.test(text), false);
  assert.deepEqual(TOOLS.map((tool) => tool.name), ['list_lists', 'read_list', 'add_items', 'set_checked']);
  const descriptions = JSON.stringify(TOOLS);
  assert.match(descriptions, /wishes : liste d'envies/);
  assert.match(descriptions, /les réservations des listes d'envies ne sont jamais données/);
  assert.match(descriptions, /cocher signifie « reçu » : seuls le bénéficiaire et le propriétaire de la liste le peuvent/);
});

test('add_items sur une liste d\'envies : lien et prix acceptés, quantité refusée ; lien refusé ailleurs ; « reçu » réservé au bénéficiaire et au propriétaire', async (t) => {
  const { h, ids } = await setup(t);
  const c = claude(h, (await connect(h, h.marie, MARIE_PASSWORD, { scope: 'write' })).access_token);
  const out = data(await c.tool('add_items', { list_id: ids.noel, items: [
    { name: 'Casque', link: 'https://exemple.fr/casque', price: 59.99 },
    { name: 'Puzzle', quantity: '2' },
    { name: 'Lampe', link: 'javascript:alert(1)' },
  ] }));
  assert.deepEqual(out.results.map((r) => r.status), ['created', 'ignored', 'ignored']);
  assert.equal(out.results[1].reason, 'Pas de quantité dans une liste d\'envies.');
  assert.match(out.results[2].reason, /^Lien invalide/);
  const casque = h.app.db.prepare("SELECT link, price_cents FROM items WHERE name = 'Casque'").get();
  assert.deepEqual(casque, { link: 'https://exemple.fr/casque', price_cents: 5999 });
  assert.equal((await c.tool('add_items', { list_id: ids.noel, items: [{ name: 'X', price: -1 }] })).body.error.code, -32602);
  // Ailleurs : lien refusé
  const ailleurs = data(await c.tool('add_items', { list_id: h.ids.perso, items: [{ name: 'Y', link: 'https://exemple.fr' }] }));
  assert.equal(ailleurs.results[0].reason, 'Le lien et le prix ne se choisissent que dans une liste d\'envies.');
  // Reçu : Marie (bénéficiaire) oui
  assert.equal(data(await c.tool('set_checked', { list_id: ids.noel, item_ids: [ids.livre], checked: true })).changed, 1);
});
