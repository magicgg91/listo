// Tests de la file d'attente hors ligne (étape 9), avec le vrai serveur :
// mode avion puis retour du réseau, coupure en plein envoi, ordre (la photo
// part après son article), refus, erreur réseau, suppression ailleurs,
// session expirée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login, ORIGIN } from './helpers.js';
import { createQueue, isTemporary } from '../public/js/queue.js';
import { memoryLocal } from '../public/js/localdb.js';

const uuid = () => crypto.randomUUID();

// Petit JPEG valide (structure seulement) pour les photos
const u16 = (n) => Buffer.from([n >> 8, n & 0xff]);
const block = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  block(0xdb, Buffer.alloc(65, 1)),
  block(0xc0, Buffer.from([8, 0, 8, 0, 8, 1, 1, 0x11, 0])),
  block(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34]),
  Buffer.from([0xff, 0xd9]),
]);

// Erreurs comme celles de api.js
const networkError = () => Object.assign(new Error('Impossible de joindre Listo.'), { status: undefined });
const apiError = (status, message) => Object.assign(new Error(message), { status });

// « Téléphone » de test : réseau coupable, et parfois une réponse perdue
// (le serveur a reçu et appliqué, mais la réponse n'arrive jamais).
function phoneTransport(app, client) {
  const net = { online: true, loseNextResponse: false, calls: [] };
  const cookie = () => [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  async function call(kind, method, url, body, headers = {}) {
    net.calls.push(kind);
    if (!net.online) throw networkError();
    const res = await fetch(`${app.base}${url}`, { method, headers: { cookie: cookie(), origin: ORIGIN, ...headers }, body });
    const data = await res.json().catch(() => null);
    if (net.loseNextResponse) {
      net.loseNextResponse = false;
      throw networkError();
    }
    if (!res.ok) throw apiError(res.status, data?.error ?? 'refus');
    return data;
  }
  return {
    net,
    transport: {
      sendOps: async (ops) => (await call('ops', 'POST', '/api/ops', JSON.stringify({ ops }), { 'content-type': 'application/json' })).results,
      putPhoto: (itemId, jpeg) => call('photo', 'PUT', `/api/items/${itemId}/photo`, jpeg, { 'content-type': 'image/jpeg' }),
      deletePhoto: (itemId) => call('photoDelete', 'DELETE', `/api/items/${itemId}/photo`),
    },
  };
}

// Minuteurs de test : on décide quand le « plus tard » arrive
function fakeTimers() {
  const pending = [];
  return {
    pending,
    setTimeout: (fn, ms) => { pending.push({ fn, ms }); return pending.length; },
    clearTimeout: () => {},
  };
}

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const listId = uuid();
  await guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Courses', categoryId: 1 }] });
  await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId] });
  return { app, guillaume, lea, listId };
}

function makeQueue(app, client, events = {}) {
  const { net, transport } = phoneTransport(app, client);
  const timers = fakeTimers();
  const log = { refused: [], dropped: [], offline: 0, unauthorized: 0 };
  const storage = memoryLocal();
  const queue = createQueue({
    storage,
    transport,
    timers,
    delay: (attempt) => 1000 * 2 ** attempt,
    events: {
      refused: (entry, message) => log.refused.push({ entry, message }),
      dropped: (entry) => log.dropped.push(entry),
      offline: () => { log.offline += 1; },
      unauthorized: () => { log.unauthorized += 1; },
      ...events,
    },
  });
  return { queue, net, timers, log, storage };
}

const op = (type, fields) => ({ kind: 'op', op: { id: uuid(), type, ...fields } });
const itemsOf = async (client, listId) => (await client.get(`/api/lists/${listId}`)).body.groups.flatMap((g) => g.items);

test('erreur passagère ou refus définitif', () => {
  assert.equal(isTemporary(networkError()), true);
  assert.equal(isTemporary(apiError(503)), true);
  assert.equal(isTemporary(apiError(429)), true);
  for (const status of [400, 403, 404, 409, 413]) assert.equal(isTemporary(apiError(status)), false, status);
});

test('mode avion : 3 ajouts, 2 cochages, 1 photo ; au retour du réseau, tout arrive chez l\'autre, sans doublon, dans l\'ordre', async (t) => {
  const h = await household(t);
  const { queue, net, timers, log } = makeQueue(h.app, h.guillaume);
  net.online = false; // mode avion
  const ids = [uuid(), uuid(), uuid()];
  await queue.add(op('item.create', { listId: h.listId, itemId: ids[0], name: 'Pain' }));
  await queue.add(op('item.create', { listId: h.listId, itemId: ids[1], name: 'Beurre' }));
  await queue.add({ kind: 'photo', itemId: ids[1], blob: JPEG });
  await queue.add(op('item.create', { listId: h.listId, itemId: ids[2], name: 'Confiture' }));
  await queue.add(op('item.check', { itemId: ids[0], checked: true }));
  await queue.add(op('item.check', { itemId: ids[2], checked: true }));

  assert.equal(await queue.flush(), 'offline');
  assert.equal(queue.count(), 6, 'rien n\'est perdu');
  assert.equal(log.offline, 1);
  assert.equal(timers.pending.length, 1, 'nouvel essai programmé');
  assert.equal(timers.pending[0].ms, 1000);
  assert.equal(await queue.flush(), 'offline');
  assert.equal(timers.pending.at(-1).ms, 2000, 'délai croissant');

  net.online = true; // retour du réseau
  net.calls.length = 0;
  assert.equal(await queue.flush(), 'done');
  assert.equal(queue.count(), 0);
  assert.deepEqual(net.calls, ['ops', 'photo', 'ops'], 'la photo part après la création de son article, puis la suite');

  const items = await itemsOf(h.lea, h.listId);
  assert.deepEqual(items.map((i) => i.name).sort(), ['Beurre', 'Confiture', 'Pain'], 'chez Léa, sans doublon');
  assert.deepEqual(items.filter((i) => i.checked).map((i) => i.name).sort(), ['Confiture', 'Pain']);
  assert.ok(items.find((i) => i.name === 'Beurre').photoAt, 'la photo est arrivée');
  assert.deepEqual(log.refused, []);
});

test('coupure en plein envoi : le serveur a reçu, la réponse est perdue ; le renvoi n\'applique rien deux fois', async (t) => {
  const h = await household(t);
  const { queue, net } = makeQueue(h.app, h.guillaume);
  const itemId = uuid();
  await queue.add(op('item.create', { listId: h.listId, itemId, name: 'Lait' }));
  await queue.add(op('item.check', { itemId, checked: true }));
  net.loseNextResponse = true;
  assert.equal(await queue.flush(), 'offline');
  assert.equal(queue.count(), 2, 'sans réponse, les opérations restent en file');
  assert.equal((await itemsOf(h.lea, h.listId)).length, 1, 'mais le serveur les a déjà appliquées');
  assert.equal(await queue.flush(), 'done'); // renvoi des mêmes opérations
  const items = await itemsOf(h.lea, h.listId);
  assert.equal(items.length, 1, 'toujours un seul « Lait »');
  assert.equal(items[0].checked, true);
});

test('opération refusée : sortie de la file, raison donnée, jamais renvoyée ; la suite continue', async (t) => {
  const h = await household(t);
  const { queue, log, net } = makeQueue(h.app, h.lea);
  const itemId = uuid();
  await queue.add(op('list.update', { listId: h.listId, name: 'Renommée par Léa' })); // invitée : refusé
  await queue.add(op('item.create', { listId: h.listId, itemId, name: 'Œufs' }));
  assert.equal(await queue.flush(), 'done');
  assert.equal(queue.count(), 0);
  assert.equal(log.refused.length, 1);
  assert.equal(log.refused[0].entry.op.type, 'list.update');
  assert.match(log.refused[0].message, /propriétaire/);
  assert.equal((await itemsOf(h.guillaume, h.listId)).length, 1, 'l\'opération suivante est passée');
  net.calls.length = 0;
  assert.equal(await queue.flush(), 'done');
  assert.deepEqual(net.calls, [], 'rien n\'est renvoyé');
});

test('une suppression ailleurs l\'emporte sur ma modification (et sur ma photo)', async (t) => {
  const h = await household(t);
  const itemId = uuid();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId: h.listId, itemId, name: 'Jambon' }] });
  const { queue, net, log } = makeQueue(h.app, h.lea);
  net.online = false;
  await queue.add(op('item.update', { itemId, quantity: '4 tranches' }));
  await queue.add({ kind: 'photo', itemId, blob: JPEG });
  // Pendant ce temps, Guillaume supprime l'article
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.delete', itemId }] });
  net.online = true;
  assert.equal(await queue.flush(), 'done');
  assert.equal(queue.count(), 0);
  assert.equal(log.refused.length, 1, 'ma modification est refusée (article introuvable)');
  assert.equal(log.dropped.length, 1, 'ma photo est abandonnée');
  assert.equal((await itemsOf(h.guillaume, h.listId)).length, 0, 'l\'article reste supprimé');
  assert.equal(h.app.db.prepare('SELECT photo_at FROM items WHERE id = ?').pluck().get(itemId), null);
});

test('photo d\'un article supprimé plus loin dans la file : abandonnée sans être envoyée', async (t) => {
  const h = await household(t);
  const { queue, net, log } = makeQueue(h.app, h.guillaume);
  const itemId = uuid();
  await queue.add(op('item.create', { listId: h.listId, itemId, name: 'Fleurs' }));
  await queue.add({ kind: 'photo', itemId, blob: JPEG });
  await queue.add(op('item.delete', { itemId }));
  assert.equal(await queue.flush(), 'done');
  assert.deepEqual(net.calls, ['ops', 'ops'], 'aucun envoi de photo');
  assert.equal(log.dropped.length, 1);
});

test('session expirée : la file est gardée, puis repart après la reconnexion', async (t) => {
  const h = await household(t);
  const first = makeQueue(h.app, h.guillaume);
  await first.queue.add(op('item.create', { listId: h.listId, itemId: uuid(), name: 'Café' }));
  await h.guillaume.post('/api/logout'); // session terminée (expirée)
  assert.equal(await first.queue.flush(), 'unauthorized');
  assert.equal(first.log.unauthorized, 1);
  assert.equal(first.queue.count(), 1, 'la file est gardée');
  assert.equal(first.timers.pending.length, 0, 'pas de nouvel essai en boucle sans session');

  // Reconnexion : même téléphone (même stockage), nouvelle file chargée depuis lui
  await login(h.guillaume, 'guillaume', 'MotDePasseAdmin!');
  const { transport } = phoneTransport(h.app, h.guillaume);
  const again = createQueue({ storage: first.storage, transport, timers: fakeTimers() });
  await again.load();
  assert.equal(again.count(), 1);
  assert.equal(await again.flush(), 'done');
  assert.deepEqual((await itemsOf(h.lea, h.listId)).map((i) => i.name), ['Café']);
});
