// Tests du temps réel (étape 8) : flux SSE GET /api/events.
// Accès, destinataires des messages, contenu des messages, délai, coupures,
// plafond de connexions et libération des connexions fermées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login, ORIGIN } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;
const uuid = () => crypto.randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ouvre le flux d'un client (avec ses cookies) et range les messages reçus.
// Renvoie { status, headers, events, waitFor, ended, close }.
async function openStream(app, client, { origin } = {}) {
  const controller = new AbortController();
  const headers = {};
  if (client?.jar.size) headers.cookie = [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  if (origin) headers.origin = origin;
  const res = await fetch(`${app.base}/api/events`, { headers, signal: controller.signal });
  const stream = { status: res.status, headers: res.headers, events: [], raw: '', ended: false };
  if (res.status !== 200) {
    stream.body = await res.json();
    return stream;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  stream.done = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        stream.raw += text;
        buffer += text;
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = block.match(/^event: (.*)$/m)?.[1];
          const data = block.match(/^data: (.*)$/m)?.[1];
          if (event) stream.events.push({ event, data: JSON.parse(data), raw: block, at: Date.now() });
        }
      }
    } catch {
      // flux coupé par le test (abort)
    }
    stream.ended = true;
  })();
  // Attend un message qui vérifie la condition (ou échoue après timeout ms)
  stream.waitFor = async (predicate, timeout = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = stream.events.find(predicate);
      if (found) return found;
      await pause(10);
    }
    throw new Error('Message attendu non reçu');
  };
  stream.lists = () => stream.events.filter((e) => e.event === 'list').map((e) => e.data.listId);
  stream.close = () => controller.abort();
  await stream.waitFor((e) => e.event === 'ready');
  return stream;
}

async function run(client, op) {
  const res = await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] });
  assert.equal(res.status, 200, res.text);
  return res.body.results[0];
}

// Guillaume (Admin), Marie et Paul connectés ; une liste de Guillaume partagée avec Marie
async function household(t, options) {
  const app = await startTestApp(t, options);
  const guillaume = await setupAdmin(app);
  const ids = { guillaume: app.db.prepare("SELECT id FROM users WHERE username = 'guillaume'").pluck().get() };
  const clients = { guillaume };
  for (const name of ['marie', 'paul']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const courses = app.db.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  const listId = uuid();
  await run(guillaume, { type: 'list.create', listId, name: 'Courses secrètes', categoryId: courses });
  await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.marie], access: { [ids.marie]: 'modification' } });
  return { app, ...clients, ids, listId, courses };
}

test('flux : réservé aux comptes connectés, refusé depuis un autre site', async (t) => {
  const h = await household(t);
  const visitor = await openStream(h.app, h.app.client());
  assert.equal(visitor.status, 401);
  const crossSite = await openStream(h.app, h.marie, { origin: 'https://pirate.example' });
  assert.equal(crossSite.status, 403);
  // Mot de passe provisoire pas encore changé : refusé aussi
  await h.guillaume.post('/api/admin/users', { username: 'lea', password: 'mot de passe provisoire', role: 'user' });
  const lea = h.app.client();
  await login(lea, 'lea', 'mot de passe provisoire');
  assert.equal((await openStream(h.app, lea)).status, 403);
  assert.equal(h.app.ctx.events.count(), 0);

  const ok = await openStream(h.app, h.marie, { origin: ORIGIN });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(ok.headers.get('x-accel-buffering'), 'no');
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  ok.close();
});

test('un changement arrive chez l\'autre en moins de 3 s ; message sans aucune donnée de la liste ; non-membre : rien', async (t) => {
  const h = await household(t);
  const marie = await openStream(h.app, h.marie);
  const paul = await openStream(h.app, h.paul);
  const itemId = uuid();
  const start = Date.now();
  await run(h.guillaume, { type: 'item.create', listId: h.listId, itemId, name: 'Champagne millésimé', note: 'cadeau surprise' });
  const message = await marie.waitFor((e) => e.event === 'list', 3000);
  assert.ok(message.at - start < 3000, `reçu en ${message.at - start} ms`);
  assert.deepEqual(message.data, { listId: h.listId });
  assert.deepEqual(Object.keys(message.data), ['listId'], 'seulement l\'identifiant de la liste');
  for (const secret of ['Champagne', 'cadeau', 'Courses secrètes', itemId, 'guillaume', 'marie']) {
    assert.equal(marie.raw.includes(secret), false, `« ${secret} » ne doit pas apparaître dans le flux`);
  }
  await run(h.guillaume, { type: 'item.check', itemId, checked: true });
  await marie.waitFor((e, i) => i > 0 && e.event === 'list' && marie.lists().length >= 2);
  await pause(200);
  assert.deepEqual(paul.lists(), [], 'Paul n\'est pas membre : aucun message');
  marie.close();
  paul.close();
});

test('déclencheurs : opérations, photo, partage, suppression ; rien pour une opération refusée', async (t) => {
  const h = await household(t);
  const marie = await openStream(h.app, h.marie);
  const count = () => marie.lists().length;
  const expectOne = async (action, label) => {
    const before = count();
    await action();
    await marie.waitFor(() => count() > before, 3000).catch(() => assert.fail(`aucun message pour : ${label}`));
  };
  const itemId = uuid();
  await expectOne(() => run(h.guillaume, { type: 'item.create', listId: h.listId, itemId, name: 'Lait' }), 'ajout');
  await expectOne(() => run(h.guillaume, { type: 'item.update', itemId, quantity: '2' }), 'modification');
  await expectOne(() => run(h.guillaume, { type: 'list.update', listId: h.listId, name: 'Renommée' }), 'renommage');
  const jpeg = Buffer.from('ffd8ffdb0043' + '01'.repeat(65) + 'ffc0000b080008000801011100ffda0008010100003f00' + '1234' + 'ffd9', 'hex');
  await expectOne(async () => {
    const cookie = [...h.guillaume.jar].map(([n, v]) => `${n}=${v}`).join('; ');
    const res = await fetch(`${h.app.base}/api/items/${itemId}/photo`, { method: 'PUT', headers: { cookie, origin: ORIGIN, 'content-type': 'image/jpeg' }, body: jpeg });
    assert.equal(res.status, 200, await res.text());
  }, 'photo');
  await expectOne(() => run(h.guillaume, { type: 'item.delete', itemId }), 'suppression d\'article');

  // Opération refusée (article inconnu) : aucun message
  const before = count();
  const refused = await run(h.guillaume, { type: 'item.update', itemId: uuid(), quantity: '3' });
  assert.equal(refused.status, 404);
  await pause(200);
  assert.equal(count(), before);

  await expectOne(() => run(h.guillaume, { type: 'list.delete', listId: h.listId }), 'suppression de la liste');
  marie.close();
});

test('invitée retirée de la liste : un dernier message, puis plus rien', async (t) => {
  const h = await household(t);
  const marie = await openStream(h.app, h.marie);
  await h.guillaume.request('PUT', `/api/lists/${h.listId}/members`, { userIds: [] });
  await marie.waitFor((e) => e.event === 'list');
  const after = marie.lists().length;
  await run(h.guillaume, { type: 'item.create', listId: h.listId, itemId: uuid(), name: 'Pain' });
  await pause(300);
  assert.equal(marie.lists().length, after, 'plus aucun message après son retrait');
  // Ajoutée de nouveau : les messages reviennent
  await h.guillaume.request('PUT', `/api/lists/${h.listId}/members`, { userIds: [h.ids.marie], access: { [h.ids.marie]: 'modification' } });
  await marie.waitFor(() => marie.lists().length > after);
  marie.close();
});

test('compte désactivé ou déconnecté : son flux est coupé, et il ne peut plus le rouvrir', async (t) => {
  const h = await household(t);
  const marie = await openStream(h.app, h.marie);
  const paul = await openStream(h.app, h.paul);
  await h.guillaume.request('PATCH', `/api/admin/users/${h.ids.marie}`, { active: false });
  await marie.done;
  assert.equal(marie.ended, true, 'flux de Marie coupé tout de suite');
  assert.equal(h.app.ctx.events.count(h.ids.marie), 0);
  await run(h.guillaume, { type: 'item.create', listId: h.listId, itemId: uuid(), name: 'Pain' });
  assert.equal((await openStream(h.app, h.marie)).status, 401);

  // Déconnexion : le flux de cette session est coupé
  await h.paul.post('/api/logout');
  await paul.done;
  assert.equal(paul.ended, true);
  assert.equal(h.app.ctx.events.count(), 0);
});

test('signal de maintien ; session expirée : flux coupé au signal suivant', async (t) => {
  const h = await household(t, { eventOptions: { keepaliveMs: 100 } });
  const marie = await openStream(h.app, h.marie);
  await pause(250);
  assert.ok(marie.raw.includes(': ping'), 'signal de maintien envoyé');
  assert.equal(marie.ended, false);
  h.app.clock.now += 31 * DAY; // la session (30 jours) a expiré
  await marie.done;
  assert.equal(marie.ended, true);
  assert.equal(h.app.ctx.events.count(), 0);
});

test('connexions fermées libérées ; plafond de 5 par compte (la plus ancienne laisse sa place)', async (t) => {
  const h = await household(t);
  const first = await openStream(h.app, h.marie);
  assert.equal(h.app.ctx.events.count(h.ids.marie), 1);
  first.close();
  for (let i = 0; i < 50 && h.app.ctx.events.count() > 0; i++) await pause(10);
  assert.equal(h.app.ctx.events.count(), 0, 'connexion fermée par le téléphone : libérée');

  const streams = [];
  for (let i = 0; i < 6; i++) streams.push(await openStream(h.app, h.marie));
  await streams[0].done;
  assert.equal(streams[0].ended, true, 'la plus ancienne est fermée');
  assert.equal(h.app.ctx.events.count(h.ids.marie), 5);
  // Les 5 autres reçoivent toujours les messages
  await run(h.guillaume, { type: 'item.create', listId: h.listId, itemId: uuid(), name: 'Pain' });
  for (const stream of streams.slice(1)) await stream.waitFor((e) => e.event === 'list');
  for (const stream of streams) stream.close();
  for (let i = 0; i < 50 && h.app.ctx.events.count() > 0; i++) await pause(10);
  assert.equal(h.app.ctx.events.count(), 0);
});

test('reconnexion : après une coupure, un nouveau flux reçoit de nouveau les messages', async (t) => {
  const h = await household(t);
  const first = await openStream(h.app, h.marie);
  h.app.ctx.events.disconnectUser(h.ids.marie); // coupure côté serveur (redémarrage, proxy…)
  await first.done;
  const second = await openStream(h.app, h.marie);
  await run(h.guillaume, { type: 'item.create', listId: h.listId, itemId: uuid(), name: 'Pain' });
  await second.waitFor((e) => e.event === 'list');
  second.close();
});
