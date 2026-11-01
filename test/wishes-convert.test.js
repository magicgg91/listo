// Liste de courses ou de tâches qui devient une liste d'envies (« Modifier
// la liste », POST /api/lists/:id/wishes) : propriétaire seulement, sens
// inverse toujours refusé, type et destinataire écrits ensemble (un refus ne
// change rien), destinataire passé en « Peut modifier », lien public arrêté,
// rien d'effacé, cochés devenus « Reçus », et confidentialité intacte : après
// la conversion, le destinataire ne reçoit aucune réservation, par aucun canal.
//
// Foyer : Guillaume (Admin, propriétaire), Léa (lecture seule sur « Maison »),
// Marie (« Peut modifier »), Paul (lecture seule), Zoé (compte désactivé).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { emptyState, loadSync, mergeSync, toSnapshot, fromSnapshot, computeListView } from '../public/js/store.js';
import { WISHES_FIXED } from '../public/js/list-types.js';

const uuid = () => crypto.randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function household(t, options = {}) {
  const app = await startTestApp(t, options);
  const guillaume = await setupAdmin(app);
  const people = { guillaume, guillaumeId: 1 };
  for (const name of ['lea', 'marie', 'paul', 'zoe']) {
    people[`${name}Id`] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name[0].toUpperCase() + name.slice(1), people[`${name}Id`]);
    people[name] = app.client();
    await login(people[name], name, `MotDePasse-${name}`);
  }
  const ops = async (client, list) => (await client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) })).body.results;
  const one = async (client, op) => (await ops(client, [op]))[0];
  const ids = { maison: uuid(), courses: uuid(), ampoule: uuid(), peinture: uuid(), lait: uuid() };
  const res = await ops(guillaume, [
    { type: 'list.create', listId: ids.maison, name: 'Maison', listType: 'tasks', priorityEnabled: false, dueEnabled: true },
    { type: 'item.create', listId: ids.maison, itemId: ids.ampoule, name: 'Ampoule', quantity: '3', note: 'E27' },
    { type: 'item.update', itemId: ids.ampoule, dueDate: '2026-11-05' },
    { type: 'item.create', listId: ids.maison, itemId: ids.peinture, name: 'Peinture' },
    { type: 'item.check', itemId: ids.peinture, checked: true },
    { type: 'list.create', listId: ids.courses, name: 'Courses', listType: 'shopping', storeId: 1 },
    { type: 'item.create', listId: ids.courses, itemId: ids.lait, name: 'Lait', quantity: '2 L', aisleId: 4, ean: '3428272950019' },
  ]);
  assert.deepEqual(res.map((r) => r.status), res.map(() => 200), JSON.stringify(res));
  const access = { [people.leaId]: 'lecture', [people.marieId]: 'modification', [people.paulId]: 'lecture' };
  assert.equal((await guillaume.request('PUT', `/api/lists/${ids.maison}/members`, { userIds: Object.keys(access).map(Number), access })).status, 200);
  // Zoé : compte désactivé
  app.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(people.zoeId);
  const convert = (client, listId, body = {}) => client.post(`/api/lists/${listId}/wishes`, body);
  // État complet d'une liste en base (pour vérifier qu'un refus ne change rien)
  const dbState = (listId) => JSON.stringify([
    app.db.prepare('SELECT * FROM lists WHERE id = ?').get(listId),
    app.db.prepare('SELECT * FROM list_members WHERE list_id = ? ORDER BY user_id').all(listId),
    app.db.prepare('SELECT * FROM list_reads WHERE list_id = ? ORDER BY user_id').all(listId),
    app.db.prepare('SELECT * FROM items WHERE list_id = ? ORDER BY id').all(listId),
    app.db.prepare('SELECT id, revoked_at FROM public_shares WHERE list_id = ?').all(listId),
  ]);
  const listOf = async (client, listId) => (await client.get('/api/lists')).body.lists.find((l) => l.id === listId);
  return { app, ...people, ops, one, ids, convert, dbState, listOf };
}

test('droits : seul le propriétaire convertit ; contributeur, invité et non-membre refusés ; sens inverse et seconde conversion refusés', async (t) => {
  const h = await household(t);
  const before = h.dbState(h.ids.maison);
  assert.equal((await h.convert(h.marie, h.ids.maison)).status, 403, 'contributeur (« Peut modifier »)');
  assert.equal((await h.convert(h.paul, h.ids.maison)).status, 403, 'invité (lecture seule)');
  assert.equal((await h.convert(h.zoe, h.ids.courses)).status, 401, 'compte désactivé : plus de session');
  const outsider = await h.convert(h.lea, h.ids.courses);
  assert.deepEqual([outsider.status, outsider.body.error], [404, 'Liste introuvable.'], 'non-membre : comme une liste inconnue');
  assert.equal((await h.convert(h.guillaume, uuid())).status, 404);
  assert.equal(h.dbState(h.ids.maison), before, 'rien n\'a changé');
  // Par la file d'attente : toujours refusé (la conversion passe par sa route, en ligne)
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.ids.maison, listType: 'wishes' })).status, 400);
  // Le propriétaire : accepté
  const ok = await h.convert(h.guillaume, h.ids.maison);
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.list.type, 'wishes');
  // Sens inverse : toujours refusé ; une seconde conversion aussi
  for (const listType of ['tasks', 'shopping']) {
    const back = await h.one(h.guillaume, { type: 'list.update', listId: h.ids.maison, listType });
    assert.deepEqual([back.status, back.error], [400, WISHES_FIXED], listType);
  }
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.ids.maison, forUserId: h.leaId })).status, 400, 'destinataire figé');
  assert.deepEqual([(await h.convert(h.guillaume, h.ids.maison, { forUserId: h.leaId })).status], [400]);
  assert.equal(h.app.db.prepare('SELECT for_user_id FROM lists WHERE id = ?').pluck().get(h.ids.maison), null, '« Moi » : toujours sans destinataire');
});

test('destinataire : compte inactif, moi-même, prénom vide ou trop long, les deux à la fois : refusés, et rien ne change', async (t) => {
  const h = await household(t);
  const share = await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/share`, {});
  assert.equal(share.status, 201);
  const before = h.dbState(h.ids.maison);
  const cases = [
    [{ forUserId: h.zoeId }, 'Utilisateur inconnu ou désactivé.'],
    [{ forUserId: 999 }, 'Utilisateur inconnu ou désactivé.'],
    [{ forUserId: 'abc' }, 'Utilisateur inconnu ou désactivé.'],
    [{ forUserId: h.guillaumeId }, 'Pour vous-même, choisissez « Moi ».'],
    [{ forName: '' }, 'Prénom invalide (1 à 80 caractères).'],
    [{ forName: '   ' }, 'Prénom invalide (1 à 80 caractères).'],
    [{ forName: 'x'.repeat(81) }, 'Prénom invalide (1 à 80 caractères).'],
    [{ forName: 42 }, 'Prénom invalide (1 à 80 caractères).'],
    [{ forUserId: h.leaId, forName: 'Lucas' }, 'Choisissez un compte ou une personne sans compte, pas les deux.'],
    [{ priorityEnabled: 'oui' }, 'Réglage « Priorité » invalide.'],
  ];
  for (const [body, error] of cases) {
    const res = await h.convert(h.guillaume, h.ids.maison, body);
    assert.deepEqual([res.status, res.body.error], [400, error], JSON.stringify(body));
    assert.equal(h.dbState(h.ids.maison), before, `${JSON.stringify(body)} : rien n'a changé (type, destinataire, membres, lien public)`);
  }
  // Prénom de 80 caractères : accepté
  assert.equal((await h.convert(h.guillaume, h.ids.maison, { forName: 'é'.repeat(80) })).status, 200);
  assert.equal(h.app.db.prepare('SELECT for_name FROM lists WHERE id = ?').pluck().get(h.ids.maison), 'é'.repeat(80));
});

test('atomicité : une panne au milieu de la conversion ne laisse rien de changé (ni type, ni destinataire, ni membre, ni lien)', async (t) => {
  const h = await household(t);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/share`, {})).status, 201);
  const before = h.dbState(h.ids.maison);
  // Dernière étape de la transaction (arrêt du lien public) qui tombe en panne
  const real = h.app.ctx.shares.stopForList;
  h.app.ctx.shares.stopForList = () => { throw new Error('panne simulée'); };
  const res = await h.convert(h.guillaume, h.ids.maison, { forUserId: h.leaId });
  h.app.ctx.shares.stopForList = real;
  assert.equal(res.status, 500);
  assert.equal(h.dbState(h.ids.maison), before, 'tout est revenu en arrière');
  assert.equal((await h.listOf(h.guillaume, h.ids.maison)).type, 'tasks');
});

test('conversion vers un compte : type et destinataire ensemble, destinataire passé de lecture seule à « Peut modifier », lecteur de la liste, lien public arrêté', async (t) => {
  const h = await household(t);
  const share = await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  assert.equal((await h.app.client().get(`/api/public/${token}`)).status, 200);
  assert.ok((await h.listOf(h.guillaume, h.ids.maison)).publicLink, 'lien en cours avant');
  h.app.db.prepare('DELETE FROM list_reads WHERE list_id = ? AND user_id = ?').run(h.ids.maison, h.leaId);

  const res = await h.convert(h.guillaume, h.ids.maison, { forUserId: h.leaId });
  assert.equal(res.status, 200, res.text);
  const row = h.app.db.prepare('SELECT type, for_user_id, for_name, priority_enabled, due_enabled FROM lists WHERE id = ?').get(h.ids.maison);
  assert.deepEqual(row, { type: 'wishes', for_user_id: h.leaId, for_name: null, priority_enabled: 1, due_enabled: 1 }, 'priorité activée (règle des envies) ; échéance gardée en base, ignorée');
  assert.equal(h.app.db.prepare('SELECT access FROM list_members WHERE list_id = ? AND user_id = ?').pluck().get(h.ids.maison, h.leaId), 'modification');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_reads WHERE list_id = ? AND user_id = ?').pluck().get(h.ids.maison, h.leaId), 1, 'news.startReading');
  // Les autres membres gardent leur droit
  assert.equal(h.app.db.prepare('SELECT access FROM list_members WHERE list_id = ? AND user_id = ?').pluck().get(h.ids.maison, h.paulId), 'lecture');
  // Lien public arrêté, et plus jamais possible
  assert.equal((await h.app.client().get(`/api/public/${token}`)).status, 404);
  assert.equal((await h.listOf(h.guillaume, h.ids.maison)).publicLink ?? null, null);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares WHERE list_id = ? AND revoked_at IS NULL').pluck().get(h.ids.maison), 0);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/share`, {})).status, 400);
  // Vue de Léa : sa liste, « Pour vous », en « Peut modifier »
  const lea = await h.listOf(h.lea, h.ids.maison);
  assert.deepEqual([lea.type, lea.isBeneficiary, lea.canEdit, lea.forUserId], ['wishes', true, true, h.leaId]);
  // Aucune réservation n'existe
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservations WHERE item_id IN (SELECT id FROM items WHERE list_id = ?)').pluck().get(h.ids.maison), 0);
  // Journal : changement de type et lien arrêté
  assert.ok(h.app.logs.some((l) => l.includes('liste_type_change') && l.includes('wishes')));
  assert.ok(h.app.logs.some((l) => l.includes('lien_public_arrete')));
  // Le partage se modifie ensuite comme pour toute liste d'envies : Léa reste, en « Peut modifier »
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/members`, { userIds: [h.marieId, h.paulId], access: {} })).status, 400);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/members`, { userIds: [h.leaId, h.marieId], access: { [h.leaId]: 'modification' } })).status, 200);
});

test('destinataire qui n\'était pas membre : ajouté d\'office en « Peut modifier » ; « Moi » et personne sans compte : aucun membre ajouté', async (t) => {
  const h = await household(t);
  assert.equal((await h.convert(h.guillaume, h.ids.courses, { forUserId: h.marieId, priorityEnabled: false })).status, 200);
  assert.equal(h.app.db.prepare('SELECT access FROM list_members WHERE list_id = ? AND user_id = ?').pluck().get(h.ids.courses, h.marieId), 'modification');
  assert.equal(h.app.db.prepare('SELECT priority_enabled FROM lists WHERE id = ?').pluck().get(h.ids.courses), 0, 'priorité désactivée sur demande');
  const marie = await h.listOf(h.marie, h.ids.courses);
  assert.deepEqual([marie.type, marie.isBeneficiary], ['wishes', true]);

  const other = { me: uuid(), lucas: uuid() };
  await h.ops(h.guillaume, [
    { type: 'list.create', listId: other.me, name: 'Pour moi', listType: 'tasks' },
    { type: 'list.create', listId: other.lucas, name: 'Pour Lucas', listType: 'tasks' },
  ]);
  assert.equal((await h.convert(h.guillaume, other.me)).status, 200);
  assert.equal((await h.convert(h.guillaume, other.lucas, { forName: '  Lucas  ' })).status, 200);
  const rows = h.app.db.prepare('SELECT id, for_user_id, for_name FROM lists WHERE id IN (?, ?) ORDER BY name').all(other.me, other.lucas);
  assert.deepEqual(rows.map((r) => [r.for_user_id, r.for_name]), [[null, 'Lucas'], [null, null]]);
  for (const id of Object.values(other)) assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_members WHERE list_id = ?').pluck().get(id), 1);
  assert.equal((await h.listOf(h.guillaume, other.me)).isBeneficiary, true, '« Moi » : le propriétaire est le bénéficiaire');
});

test('rien n\'est effacé : quantité, note, échéance, rayon, code-barres et magasin gardés ; coché devenu « Reçu » ; magasin caché (keptStore au propriétaire)', async (t) => {
  const h = await household(t);
  const items = (listId) => h.app.db.prepare('SELECT id, name, quantity, note, due_date, aisle_id, ean, checked, priority FROM items WHERE list_id = ? ORDER BY id').all(listId);
  const before = { maison: items(h.ids.maison), courses: items(h.ids.courses) };
  assert.equal((await h.convert(h.guillaume, h.ids.maison, { forUserId: h.leaId })).status, 200);
  assert.equal((await h.convert(h.guillaume, h.ids.courses)).status, 200);
  assert.deepEqual(items(h.ids.maison), before.maison);
  assert.deepEqual(items(h.ids.courses), before.courses);
  assert.equal(h.app.db.prepare('SELECT store_id FROM lists WHERE id = ?').pluck().get(h.ids.courses), 1, 'magasin gardé en base');
  const courses = await h.listOf(h.guillaume, h.ids.courses);
  assert.equal(courses.store, null);
  assert.equal(courses.keptStore.id, 1, 'le propriétaire seul garde la trace du magasin');
  // Coché : « Reçu » (zone « Reçus ») ; la bénéficiaire peut le décocher, Marie non
  const read = (await h.lea.get(`/api/lists/${h.ids.maison}`)).body;
  const all = read.groups.flatMap((g) => g.items);
  assert.equal(all.find((i) => i.id === h.ids.peinture).checked, true);
  assert.equal((await h.one(h.marie, { type: 'item.check', itemId: h.ids.peinture, checked: false })).status, 403, 'un proche ne touche pas à « Reçu »');
  assert.equal((await h.one(h.lea, { type: 'item.check', itemId: h.ids.peinture, checked: false })).status, 200, 'la bénéficiaire, si');
  // Un souhait ne prend plus de quantité, mais un lien et un prix
  assert.equal((await h.one(h.lea, { type: 'item.update', itemId: h.ids.ampoule, quantity: '4' })).status, 400);
  assert.equal((await h.one(h.lea, { type: 'item.update', itemId: h.ids.ampoule, link: 'https://exemple.fr/ampoule', priceCents: 499, priority: 'high' })).status, 200);
  assert.equal((await h.one(h.lea, { type: 'item.update', itemId: h.ids.ampoule, dueDate: '2026-12-01' })).status, 400, 'pas d\'échéance');
});

// Ce que reçoit un compte par l'API (corps et en-têtes, sauf la date), et sa copie locale
async function snapshotOf(client, listId) {
  const view = async (url) => {
    const res = await client.get(url);
    return { status: res.status, text: res.text, headers: Object.fromEntries([...res.headers].filter(([name]) => name !== 'date')) };
  };
  const sync = (await client.get('/api/sync')).body;
  return {
    lists: await view('/api/lists'),
    list: await view(`/api/lists/${listId}`),
    sync: await view('/api/sync'),
    local: JSON.stringify(toSnapshot(loadSync(emptyState(), sync), 'x')),
  };
}

test('confidentialité après conversion : la destinataire ne reçoit aucune réservation (lecture, synchronisation, temps réel, copie locale), strictement identique avant et après', async (t) => {
  const h = await household(t, { eventOptions: { keepaliveMs: 60 * 60 * 1000 } });
  assert.equal((await h.convert(h.guillaume, h.ids.maison, { forUserId: h.leaId })).status, 200);
  // Flux temps réel brut de Léa et de Marie
  const streams = {};
  for (const name of ['lea', 'marie']) {
    const controller = new AbortController();
    t.after(() => controller.abort());
    const cookie = [...h[name].jar].map(([n, v]) => `${n}=${v}`).join('; ');
    const state = { raw: '' };
    const res = await fetch(`${h.app.base}/api/events`, { headers: { cookie }, signal: controller.signal });
    const reader = res.body.getReader();
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          state.raw += new TextDecoder().decode(value);
        }
      } catch {
        // flux coupé par le test
      }
    })();
    streams[name] = state;
  }
  await pause(150);
  const before = await snapshotOf(h.lea, h.ids.maison);
  const rawBefore = streams.lea.raw;
  // Les proches réservent et cotisent (Paul en lecture seule compris)
  const reserve = (client, itemId, body = {}) => client.post(`/api/items/${itemId}/reservation`, body);
  assert.equal((await reserve(h.marie, h.ids.ampoule, { open: true })).status, 200);
  assert.equal((await reserve(h.paul, h.ids.ampoule)).status, 200);
  assert.equal((await reserve(h.guillaume, h.ids.peinture)).status, 409, 'souhait déjà reçu : ne se réserve plus');
  await pause(100);
  // Les proches voient la cotisation
  const marieSync = (await h.marie.get('/api/sync')).body;
  assert.deepEqual(marieSync.reservations[h.ids.maison].map((r) => r.participants.map((p) => p.displayName)), [['Marie', 'Paul']]);
  assert.match(streams.marie.raw, /event: list/);
  // Léa : rien, par aucun canal
  assert.deepEqual(await snapshotOf(h.lea, h.ids.maison), before, 'lecture, synchronisation, en-têtes et copie locale identiques');
  assert.equal(streams.lea.raw, rawBefore, 'aucun octet de plus sur son flux temps réel');
  const read = (await h.lea.get(`/api/lists/${h.ids.maison}`)).body;
  assert.equal('reservations' in read, false);
  const sync = (await h.lea.get('/api/sync')).body;
  assert.equal(h.ids.maison in (sync.reservations ?? {}), false);
  assert.deepEqual(toSnapshot(loadSync(emptyState(), sync), 'x').reservations, {});
  assert.doesNotMatch(JSON.stringify([read, sync]), /"participants"|"open"/);
  // Et toujours la même réponse si elle essaie de réserver
  const tries = await reserve(h.lea, h.ids.ampoule);
  assert.deepEqual([tries.status, tries.body.error], [403, 'Vous ne réservez pas les souhaits de votre propre liste.']);
});

test('ancien téléphone ou onglet resté ouvert : la synchronisation suivante lui apprend le nouveau type, et sa copie locale (IndexedDB) bascule', async (t) => {
  const h = await household(t);
  // Copie locale de Marie avant la conversion (liste de tâches), enregistrée puis relue
  const first = (await h.marie.get('/api/sync')).body;
  const leaFirst = (await h.lea.get('/api/sync')).body;
  let state = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(loadSync(emptyState(), first), 'x'))));
  assert.equal(state.lists.get(h.ids.maison).type, 'tasks');
  h.app.clock.now += 60 * 1000;
  assert.equal((await h.convert(h.guillaume, h.ids.maison, { forUserId: h.leaId })).status, 200);
  // Synchronisation partielle (depuis la dernière) : la liste revient avec son nouveau type
  const later = (await h.marie.get(`/api/sync?since=${encodeURIComponent(first.serverTime)}`)).body;
  state = mergeSync(state, later);
  const list = state.lists.get(h.ids.maison);
  assert.deepEqual([list.type, list.forUserId, list.forDisplayName], ['wishes', h.leaId, 'Lea']);
  const view = computeListView(state, h.ids.maison);
  assert.ok(view.reservations instanceof Map, 'Marie (proche) reçoit le canal des réservations');
  // Copie enregistrée puis relue : même version de copie, nouveau type gardé
  const saved = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state, 'y'))));
  assert.equal(saved.lists.get(h.ids.maison).type, 'wishes');
  // Léa (destinataire) : sa copie bascule aussi, sans canal de réservations pour cette liste
  const leaState = mergeSync(loadSync(emptyState(), leaFirst), (await h.lea.get(`/api/sync?since=${encodeURIComponent(leaFirst.serverTime)}`)).body);
  assert.equal(leaState.lists.get(h.ids.maison).type, 'wishes');
  assert.equal(computeListView(leaState, h.ids.maison).reservations, null);
});
