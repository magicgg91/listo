// Vocabulaire (« article » pour les courses, « élément » ailleurs) : les
// messages du serveur qui peuvent s'afficher ne contiennent jamais le mot
// « article », car le serveur ne connaît pas toujours la liste concernée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin } from './helpers.js';

const uuid = () => crypto.randomUUID();

test('messages du serveur : neutres, sans le mot « article »', async (t) => {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const listId = uuid();
  const itemId = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Tâches', listType: 'tasks' },
    { id: uuid(), type: 'item.create', listId, itemId, name: 'Arroser' },
    { id: uuid(), type: 'item.delete', itemId },
  ] });
  const results = (await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'item.check', itemId, checked: true },                  // supprimé
    { id: uuid(), type: 'item.create', listId, itemId: uuid(), name: '   ' },    // nom vide
    { id: uuid(), type: 'item.create', listId, itemId: 'pas-un-uuid', name: 'X' },
    { id: uuid(), type: 'item.create', listId, itemId: uuid(), name: 'Y', storeId: 1 }, // magasin hors « multi »
  ] })).body.results;
  const messages = results.map((r) => r.error);
  assert.deepEqual(messages, [
    'Introuvable, peut-être supprimé entre-temps.',
    'Nom invalide (1 à 100 caractères).',
    'Identifiant invalide.',
    'Le magasin ne se choisit que dans une liste « multi ».',
  ]);
  const photo = await guillaume.get(`/api/items/${itemId}/photo`);
  assert.equal(photo.status, 404);
  for (const text of [...messages, photo.body.error]) assert.doesNotMatch(text, /article/i);
});
