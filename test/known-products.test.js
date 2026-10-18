// Mode scan, « mes produits » (partie E) : un code déjà porté par un article
// de MES listes (celles dont le compte est membre, articles supprimés depuis
// moins de 30 jours compris) donne mon nom et ma note, sans aucune demande à
// Open Food Facts. Jamais les articles des autres comptes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { emptyState, knownItemForEan } from '../public/js/store.js';

const uuid = () => crypto.randomUUID();
const NUTELLA = '3017620422003';
const DAY = 24 * 60 * 60 * 1000;

// Open Food Facts simulé : il connaît Nutella sous un autre nom ; toute
// demande est notée
async function household(t) {
  const asked = [];
  const app = await startTestApp(t, {
    productRequest: async (code) => {
      asked.push(code);
      if (code === NUTELLA) return { status: 'success', product: { product_name_fr: 'Pâte à tartiner aux noisettes', brands: 'Ferrero', quantity: '400 g' } };
      return { notFound: true };
    },
  });
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  await addUser(app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const paul = app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  const courses = uuid();
  const weekend = uuid();
  const paulList = uuid();
  const jar = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: courses, name: 'Courses', categoryId: 1 },
    { id: uuid(), type: 'list.create', listId: weekend, name: 'Week-end', categoryId: 1 },
    { id: uuid(), type: 'item.create', listId: weekend, itemId: jar, name: 'Pâte à tartiner maison', note: 'le grand pot', ean: NUTELLA },
  ] });
  await paul.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId: paulList, name: 'Courses de Paul', categoryId: 1 }] });
  const lookup = (client, listId, code) => client.post(`/api/lists/${listId}/products`, { code });
  return { app, guillaume, lea, paul, leaId, courses, weekend, paulList, jar, asked, lookup };
}

test('code connu dans une autre de mes listes : mon nom et ma note, sans Open Food Facts', async (t) => {
  const h = await household(t);
  const res = await h.lookup(h.guillaume, h.courses, NUTELLA);
  assert.equal(res.status, 200);
  // Champ par champ : ni identifiant, ni nom de liste
  assert.deepEqual(res.body, { status: 'known', name: 'Pâte à tartiner maison', note: 'le grand pot' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(h.asked, [], 'aucune demande sortante');
  // UPC-A : même code une fois normalisé
  const upc = uuid();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId: h.weekend, itemId: upc, name: 'Pain de mie', ean: '012345678905' }] });
  assert.deepEqual((await h.lookup(h.guillaume, h.courses, '012345678905')).body, { status: 'known', name: 'Pain de mie', note: '' });
  assert.deepEqual(h.asked, []);
});

test('jamais les articles des autres comptes', async (t) => {
  const h = await household(t);
  // Paul n'est membre d'aucune liste de Guillaume : Open Food Facts
  assert.deepEqual((await h.lookup(h.paul, h.paulList, NUTELLA)).body.status, 'found');
  assert.equal((await h.lookup(h.paul, h.paulList, NUTELLA)).body.name, 'Pâte à tartiner aux noisettes');
  assert.ok(h.asked.includes(NUTELLA));
  // Son propre article : son nom à lui
  await h.paul.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId: h.paulList, itemId: uuid(), name: 'Nutella de Paul', ean: NUTELLA }] });
  assert.equal((await h.lookup(h.paul, h.paulList, NUTELLA)).body.name, 'Nutella de Paul');
  // Et Guillaume ne voit toujours que le sien
  assert.equal((await h.lookup(h.guillaume, h.courses, NUTELLA)).body.name, 'Pâte à tartiner maison');
});

test('liste partagée : un membre retrouve le produit ; retiré de la liste, plus rien', async (t) => {
  const h = await household(t);
  await h.guillaume.request('PUT', `/api/lists/${h.weekend}/members`, { userIds: [h.leaId], access: { [h.leaId]: 'modification' } });
  const leaList = uuid();
  await h.lea.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId: leaList, name: 'Courses de Léa', categoryId: 1 }] });
  assert.equal((await h.lookup(h.lea, leaList, NUTELLA)).body.status, 'known');
  await h.guillaume.request('PUT', `/api/lists/${h.weekend}/members`, { userIds: [] });
  assert.equal((await h.lookup(h.lea, leaList, NUTELLA)).body.status, 'found');
});

test('article supprimé récemment : retrouvé ; effacé par le nettoyage (30 jours) : plus retrouvé', async (t) => {
  const h = await household(t);
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.delete', itemId: h.jar }] });
  assert.deepEqual((await h.lookup(h.guillaume, h.courses, NUTELLA)).body, { status: 'known', name: 'Pâte à tartiner maison', note: 'le grand pot' });
  assert.deepEqual(h.asked, []);
  // Supprimé il y a 31 jours : le nettoyage l'efface (la date est reculée
  // dans la base ; avancer l'horloge ferait expirer la session du test)
  h.app.db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(new Date(h.app.clock.now - 31 * DAY).toISOString(), h.jar);
  h.app.ctx.lists.purgeDeleted();
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items WHERE id = ?').pluck().get(h.jar), 0);
  const res = await h.lookup(h.guillaume, h.courses, NUTELLA);
  assert.equal(res.body.status, 'found');
  assert.deepEqual(h.asked, [NUTELLA]);
});

test('le plus récent d\'abord ; mon nom gagne sur celui d\'Open Food Facts', async (t) => {
  const h = await household(t);
  h.app.clock.now += 60 * 1000;
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.update', itemId: h.jar, name: 'Nutella (maison)' }] });
  h.app.clock.now += 60 * 1000;
  const other = uuid();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId: h.courses, itemId: other, name: 'Pâte chocolat', ean: NUTELLA }] });
  assert.equal((await h.lookup(h.guillaume, h.weekend, NUTELLA)).body.name, 'Pâte chocolat');
  assert.deepEqual(h.asked, [], 'Open Food Facts n\'est pas demandé, même s\'il connaît ce code');
});

test('produit connu : rien dans le compteur des demandes sortantes (10 par minute)', async (t) => {
  const h = await household(t);
  for (let i = 0; i < 15; i += 1) assert.equal((await h.lookup(h.guillaume, h.courses, NUTELLA)).body.status, 'known');
  // Les 10 demandes sortantes de la minute restent disponibles (codes EAN-8
  // fabriqués, clé de contrôle calculée)
  const codes = [];
  for (let n = 3200000; codes.length < 10; n += 1) {
    const digits = String(n);
    let sum = 0;
    for (let i = digits.length - 1, w = 3; i >= 0; i -= 1, w = 4 - w) sum += Number(digits[i]) * w;
    codes.push(`${digits}${(10 - (sum % 10)) % 10}`);
  }
  let sent = 0;
  for (const code of codes) if ((await h.lookup(h.guillaume, h.courses, code)).body.status === 'unknown') sent += 1;
  assert.equal(sent, 10);
  assert.equal(h.asked.length, sent);
});

test('journaux : ni le code ni le nom', async (t) => {
  const lines = [];
  for (const method of ['log', 'warn', 'error', 'info']) t.mock.method(console, method, (...args) => lines.push(args.join(' ')));
  const h = await household(t);
  await h.lookup(h.guillaume, h.courses, NUTELLA);
  await h.lookup(h.paul, h.paulList, NUTELLA);
  assert.doesNotMatch([...lines, ...h.app.logs].join('\n'), /3017620422003|tartiner|grand pot/);
});

test('sur le téléphone : article d\'une autre de mes listes (hors ligne), le plus récent', () => {
  const state = emptyState();
  const put = (id, listId, name, ean, updatedAt) => state.items.set(id, { id, listId, name, ean, updatedAt, note: '' });
  put('a', 'courses', 'Nutella', NUTELLA, '2026-10-18T09:00:00.000Z');
  put('b', 'week-end', 'Pâte à tartiner maison', NUTELLA, '2026-10-18T10:00:00.000Z');
  put('c', 'week-end', 'Pain', null, '2026-10-18T11:00:00.000Z');
  assert.equal(knownItemForEan(state, NUTELLA, { exceptListId: 'courses' }).name, 'Pâte à tartiner maison');
  assert.equal(knownItemForEan(state, NUTELLA).name, 'Pâte à tartiner maison');
  assert.equal(knownItemForEan(state, NUTELLA, { exceptListId: 'week-end' }).name, 'Nutella');
  assert.equal(knownItemForEan(state, '96385074'), null);
  assert.equal(knownItemForEan(state, null), null);
});
