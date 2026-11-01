// « Quitter la liste » : un invité retire sa propre appartenance (et jamais
// celle d'un autre) ; le propriétaire ne peut pas ; un non-membre reçoit
// « Liste introuvable ». Temps réel, synchronisation, file hors ligne, et
// les menus (mêmes actions dans le même ordre aux deux endroits). Le rendu
// est aussi vérifié dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, ORIGIN } from './helpers.js';
import { createQueue } from '../public/js/queue.js';
import { memoryLocal } from '../public/js/localdb.js';
import { emptyState, loadSync, mergeSync } from '../public/js/store.js';
import { OWNER_CANNOT_LEAVE } from '../server/lists.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Guillaume (propriétaire) ; Léa « Peut modifier » ; Paul « Lecture seule » ;
// Zoé, non-membre. Deux listes partagées avec Léa et Paul.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = {};
  const clients = { guillaume };
  for (const name of ['lea', 'paul', 'zoe']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const [shop, tasks, milk] = [uuid(), uuid(), uuid()];
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: shop, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' },
  ] });
  for (const listId of [shop, tasks]) {
    await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.lea, ids.paul], access: { [ids.lea]: 'modification', [ids.paul]: 'lecture' } });
  }
  // Un article ajouté par Léa
  await clients.lea.post('/api/ops', { ops: [{ id: uuid(), type: 'item.create', listId: shop, itemId: milk, name: 'Lait', aisleId: 4 }] });
  const notified = [];
  const notify = app.ctx.events.notifyList.bind(app.ctx.events);
  app.ctx.events.notifyList = (listId, options = {}) => {
    notified.push({ listId, alsoUsers: options.alsoUsers ?? [] });
    notify(listId, options);
  };
  const members = (listId) => app.db.prepare('SELECT user_id, access FROM list_members WHERE list_id = ? ORDER BY user_id').all(listId).map((m) => [m.user_id, m.access]);
  return { app, ...clients, ids, shop, tasks, milk, notified, members };
}

const leave = (client, listId, body) => client.post(`/api/lists/${listId}/leave`, body);

test('un invité quitte : il ne voit plus la liste ; ses articles restent ; les autres membres et listes sont intacts', async (t) => {
  const h = await household(t);
  const res = await leave(h.lea, h.shop);
  assert.equal(res.status, 200);
  assert.deepEqual(h.members(h.shop), [[1, 'modification'], [h.ids.paul, 'lecture']]);
  assert.deepEqual(h.members(h.tasks), [[1, 'modification'], [h.ids.lea, 'modification'], [h.ids.paul, 'lecture']], 'autre liste intacte');
  const sync = (await h.lea.get('/api/sync')).body;
  assert.ok(!sync.listIds.includes(h.shop));
  assert.ok(sync.listIds.includes(h.tasks));
  assert.equal((await h.lea.get(`/api/lists/${h.shop}`)).status, 404);
  assert.equal(h.app.db.prepare('SELECT name FROM items WHERE id = ?').pluck().get(h.milk), 'Lait', 'ses articles appartiennent à la liste');
  // Le propriétaire voit la liste des personnes à jour
  const owner = (await h.guillaume.get('/api/sync')).body.lists.find((l) => l.id === h.shop);
  assert.deepEqual(owner.members.map((m) => m.id).sort(), [1, h.ids.paul]);
  // Journal : identifiants seulement
  const entry = h.app.logs.find((l) => l.includes('liste_quittee'));
  assert.ok(entry);
  assert.doesNotMatch(entry, /Courses|Lait/);
  // Quitter une seconde fois : plus membre → « Liste introuvable »
  assert.deepEqual([(await leave(h.lea, h.shop)).status], [404]);
});

test('un invité ne retire jamais quelqu\'un d\'autre ; le propriétaire est refusé ; non-membre : « Liste introuvable »', async (t) => {
  const h = await household(t);
  const before = h.members(h.shop);
  // Un identifiant envoyé dans le corps est ignoré : seule sa propre appartenance
  assert.equal((await leave(h.paul, h.shop, { userId: h.ids.lea, userIds: [h.ids.lea] })).status, 200);
  assert.deepEqual(h.members(h.shop), before.filter(([id]) => id !== h.ids.paul), 'Léa est toujours là');
  const owner = await leave(h.guillaume, h.shop);
  assert.deepEqual([owner.status, owner.body.error], [403, OWNER_CANNOT_LEAVE]);
  assert.equal(OWNER_CANNOT_LEAVE, 'Le propriétaire ne peut pas quitter sa liste. Supprimez-la à la place.');
  const stranger = await leave(h.zoe, h.shop);
  assert.deepEqual([stranger.status, stranger.body.error], [404, 'Liste introuvable.']);
  assert.deepEqual((await leave(h.zoe, uuid())).body.error, 'Liste introuvable.');
  assert.equal((await leave(h.zoe, 'pas-un-uuid')).status, 400);
  assert.deepEqual(h.members(h.shop), [[1, 'modification'], [h.ids.lea, 'modification']]);
});

test('un invité en lecture seule peut quitter, et ne peut toujours rien modifier d\'autre', async (t) => {
  const h = await household(t);
  assert.equal((await h.paul.post('/api/ops', { ops: [{ id: uuid(), type: 'list.update', listId: h.tasks, name: 'X' }] })).body.results[0].status, 403);
  assert.equal((await leave(h.paul, h.tasks)).status, 200);
  assert.ok(!(await h.paul.get('/api/sync')).body.listIds.includes(h.tasks));
});

test('temps réel : les membres restants et les téléphones de la personne qui part sont prévenus ; sa copie locale perd la liste', async (t) => {
  const h = await household(t);
  const first = (await h.lea.get('/api/sync')).body;
  const phone = loadSync(emptyState(), first);
  assert.ok(phone.lists.has(h.shop));
  h.app.clock.now += 60 * 1000;
  await leave(h.lea, h.shop);
  // Membres actifs restants (Guillaume, Paul) + la personne qui part (Léa)
  assert.deepEqual(h.notified, [{ listId: h.shop, alsoUsers: [h.ids.lea] }]);
  assert.match(read('server/events.js'), /function notifyList\(listId, \{ alsoUsers = \[\] \} = \{\}\) \{\s*notifyUsers\(\[\.\.\.activeMembers\.all\(listId\), \.\.\.alsoUsers\], listId\);/);
  mergeSync(phone, (await h.lea.get(`/api/sync?since=${encodeURIComponent(first.serverTime)}`)).body);
  assert.equal(phone.lists.has(h.shop), false);
  assert.ok(![...phone.items.values()].some((i) => i.listId === h.shop));
  assert.ok(phone.lists.has(h.tasks));
});

test('file hors ligne : les opérations de la personne partie sont refusées et retirées, sans boucle', async (t) => {
  const h = await household(t);
  const cookie = () => [...h.lea.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const calls = [];
  const refused = [];
  const queue = createQueue({
    storage: memoryLocal(),
    transport: {
      sendOps: async (ops) => {
        calls.push(ops.length);
        const res = await fetch(`${h.app.base}/api/ops`, { method: 'POST', headers: { cookie: cookie(), origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });
        return (await res.json()).results;
      },
      putPhoto: async () => {},
      deletePhoto: async () => {},
    },
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
    events: { refused: (entry, message) => refused.push(message) },
  });
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.check', itemId: h.milk, checked: true } });
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.create', listId: h.shop, itemId: uuid(), name: 'Pain' } });
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.create', listId: h.tasks, itemId: uuid(), name: 'Ampoule' } });
  await leave(h.lea, h.shop); // depuis un autre téléphone
  assert.equal(await queue.flush(), 'done');
  assert.equal(queue.count(), 0);
  assert.equal(refused.length, 2);
  assert.ok(refused.every((m) => /introuvable/i.test(m)), refused.join(' | '));
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM items WHERE name = 'Ampoule'").pluck().get(), 1, 'l\'autre liste reçoit sa modification');
  assert.equal(h.app.db.prepare('SELECT checked FROM items WHERE id = ?').pluck().get(h.milk), 0);
  calls.length = 0;
  assert.equal(await queue.flush(), 'done');
  assert.deepEqual(calls, [], 'pas de boucle');
});

test('menus : mêmes actions, même ordre, aux deux endroits, pour chaque profil ; pas de « ⋯ » sans action', () => {
  const source = read('public/js/screens/list-actions.js');
  // Propriétaire : Modifier, Dupliquer, Partager, sourdine (nouveautés), — Supprimer
  assert.match(source, /return \[\s*\{ icon: 'pencil', label: 'Modifier la liste'[^\n]*\n\s*duplicate,\s*\{ icon: 'link', label: 'Partager par lien'[^\n]*\n\s*mute,\s*\{ icon: 'trash', label: 'Supprimer la liste', danger: true, separated: true,/);
  // Invité : « Peut modifier » : Dupliquer, — Quitter ; lecture seule : Quitter (sans trait au-dessus)
  assert.match(source, /const leave = \{ icon: 'logout', label: 'Quitter la liste', danger: true, separated: canEdit, onSelect: async \(\) => \{\s*if \(!\(await leaveListWithConfirm\(list\)\)\) return;/);
  assert.match(source, /onDeleted\(\);\s*setTimeout\(\(\) => toast\(message, \{ low: true \}\), 400\);/);
  assert.match(source, /return canEdit \? \[duplicate, mute, leave\] : \[mute, leave\];/);
  // Confirmation et hors ligne
  assert.match(source, /title: `Quitter la liste « \$\{list\.name\} » \?`,\s*text: 'Vous ne la verrez plus\. Le propriétaire pourra de nouveau la partager avec vous\.',\s*confirmLabel: 'Quitter',/);
  assert.match(source, /const OFFLINE_LEAVE = 'Connexion nécessaire pour quitter une liste';/);
  assert.match(source, /await refreshData\(\{ quiet: true \}\); \/\/ envoie d'abord ce qui attend\s*await post\(`\/api\/lists\/\$\{list\.id\}\/leave`\);/);
  // Les deux menus viennent de listActions ; liste ouverte : retour à l'accueil après départ
  assert.match(read('public/js/screens/lists.js'), /const actions = listActions\(list\);\s*if \(!actions\.length\) return card;/);
  assert.match(read('public/js/screens/list.js'), /listActions\(view\.list, \{ onDeleted: \(\) => navigate\('lists', \{\}, \{ replace: true \}\) \}\)/);
  assert.doesNotMatch(source, /innerHTML|\.focus\(/);
});
