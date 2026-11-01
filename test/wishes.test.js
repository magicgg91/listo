// Listes d'envies : bénéficiaire, souhaits (lien, prix), « reçu », et
// réservations cachées au bénéficiaire, canal par canal (tableau du cahier
// des charges). RÈGLE CRITIQUE vérifiée ici : le bénéficiaire ne doit jamais
// savoir qu'un souhait est réservé, ni par qui, ni combien.
//
// Foyer : Guillaume (Admin, propriétaire des listes), Léa (bénéficiaire de
// « Noël de Léa »), Marie (proche, « Peut modifier »), Paul (proche,
// « Lecture seule »), Zoé (sans accès).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir } from './helpers.js';
import { openDatabase, schemaVersion, wishesMigration } from '../server/db.js';
import { emptyState, loadSync, mergeSync, toSnapshot } from '../public/js/store.js';
import { BENEFICIARY, ALREADY, NOT_YOURS } from '../server/reservations.js';
import { cleanLink, parsePrice, formatPrice } from '../public/js/wishes.js';

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
  const ids = { lea: uuid(), moi: uuid(), lucas: uuid(), velo: uuid(), livre: uuid(), jeu: uuid(), lampe: uuid(), doudou: uuid() };
  const res = await ops(guillaume, [
    { type: 'list.create', listId: ids.lea, name: 'Noël de Léa', listType: 'wishes', forUserId: people.leaId },
    { type: 'item.create', listId: ids.lea, itemId: ids.velo, name: 'Vélo', link: 'https://exemple.fr/velo', priceCents: 24990, note: 'Rouge' },
    { type: 'item.create', listId: ids.lea, itemId: ids.livre, name: 'Livre' },
    { type: 'list.create', listId: ids.moi, name: 'Mes envies', listType: 'wishes' },
    { type: 'item.create', listId: ids.moi, itemId: ids.jeu, name: 'Jeu de société' },
    { type: 'item.create', listId: ids.moi, itemId: ids.lampe, name: 'Lampe' },
    { type: 'list.create', listId: ids.lucas, name: 'Anniversaire de Lucas', listType: 'wishes', forName: 'Lucas' },
    { type: 'item.create', listId: ids.lucas, itemId: ids.doudou, name: 'Doudou' },
  ]);
  assert.deepEqual(res.map((r) => r.status), res.map(() => 200), JSON.stringify(res));
  const share = (listId, access) => guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: Object.keys(access).map(Number), access });
  assert.equal((await share(ids.lea, { [people.leaId]: 'modification', [people.marieId]: 'modification', [people.paulId]: 'lecture' })).status, 200);
  assert.equal((await share(ids.moi, { [people.marieId]: 'modification', [people.paulId]: 'lecture' })).status, 200);
  assert.equal((await share(ids.lucas, { [people.marieId]: 'lecture' })).status, 200);
  const reserve = (client, itemId) => client.post(`/api/items/${itemId}/reservation`, {});
  const release = (client, itemId) => client.del(`/api/items/${itemId}/reservation`);
  const reservedIn = async (client, listId) => (await client.get('/api/sync')).body.reservations[listId];
  return { app, ...people, ops, one, ids, reserve, release, reservedIn };
}

// Tout ce que reçoit un compte par l'API, en-têtes compris (sauf la date
// du serveur, qui suit l'horloge réelle et non celle du test)
async function snapshotOf(h, client, listId) {
  const view = async (url) => {
    const res = await client.get(url);
    const headers = Object.fromEntries([...res.headers].filter(([name]) => name !== 'date'));
    return { status: res.status, text: res.text, headers };
  };
  const since = '2026-10-16T11:00:00.000Z';
  const sync = await client.get('/api/sync');
  return {
    lists: await view('/api/lists'),
    list: await view(`/api/lists/${listId}`),
    sync: await view('/api/sync'),
    since: await view(`/api/sync?since=${encodeURIComponent(since)}`),
    me: await view('/api/me'),
    // Copie gardée sur le téléphone (IndexedDB), date d'enregistrement fixée
    local: JSON.stringify(toSnapshot(loadSync(emptyState(), sync.body), '2026-10-16T12:00:00.000Z')),
    localMerged: JSON.stringify(toSnapshot(mergeSync(loadSync(emptyState(), sync.body), (await client.get(`/api/sync?since=${encodeURIComponent(since)}`)).body), '2026-10-16T12:00:00.000Z')),
  };
}

// Flux temps réel brut d'un compte (tous les octets reçus)
function rawStream(t, h, client) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const headers = { cookie: [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ') };
  const state = { raw: '' };
  state.ready = (async () => {
    const res = await fetch(`${h.app.base}/api/events`, { headers, signal: controller.signal });
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
  })();
  return state;
}

test('création : bénéficiaire membre d\'office en « Peut modifier », « Moi », personne sans compte ; refus clairs', async (t) => {
  const h = await household(t);
  const leaList = (await h.lea.get('/api/lists')).body.lists.find((l) => l.id === h.ids.lea);
  assert.equal(leaList.type, 'wishes');
  assert.equal(leaList.canEdit, true, 'Léa ouvre sa liste et y ajoute ses souhaits');
  assert.deepEqual([leaList.forUserId, leaList.forName, leaList.forDisplayName, leaList.isBeneficiary], [h.leaId, null, 'Lea', true]);
  const asOwner = (await h.guillaume.get('/api/lists')).body.lists;
  assert.equal(asOwner.find((l) => l.id === h.ids.lea).isBeneficiary, false);
  assert.equal(asOwner.find((l) => l.id === h.ids.moi).isBeneficiary, true, '« Moi »');
  assert.deepEqual([asOwner.find((l) => l.id === h.ids.lucas).forName, asOwner.find((l) => l.id === h.ids.lucas).isBeneficiary], ['Lucas', false]);
  // Léa peut ajouter un souhait
  assert.equal((await h.one(h.lea, { type: 'list.create', listId: uuid(), name: 'x', listType: 'wishes', forUserId: h.leaId })).status, 200, 'pour soi-même = « Moi »');
  assert.equal((await h.one(h.lea, { type: 'item.create', listId: h.ids.lea, itemId: uuid(), name: 'Casque' })).status, 200);
  // Refus
  h.app.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(h.zoeId);
  const cases = [
    [{ listType: 'wishes', forUserId: h.zoeId }, 'Utilisateur inconnu ou désactivé.'],
    [{ listType: 'wishes', forUserId: 999 }, 'Utilisateur inconnu ou désactivé.'],
    [{ listType: 'wishes', forUserId: h.marieId, forName: 'Lucas' }, 'Choisissez un compte ou une personne sans compte, pas les deux.'],
    [{ listType: 'wishes', forName: '' }, 'Prénom invalide (1 à 80 caractères).'],
    [{ listType: 'wishes', forName: 'x'.repeat(81) }, 'Prénom invalide (1 à 80 caractères).'],
    [{ listType: 'wishes', forName: 'Lu\u0000cas' }, 'Prénom invalide (1 à 80 caractères).'],
    [{ listType: 'wishes', forName: 42 }, 'Prénom invalide (1 à 80 caractères).'],
    [{ listType: 'tasks', forName: 'Lucas' }, '« Pour qui ? » ne se choisit que pour une liste d\'envies.'],
    [{ listType: 'shopping', forUserId: h.marieId }, '« Pour qui ? » ne se choisit que pour une liste d\'envies.'],
  ];
  for (const [fields, error] of cases) {
    const res = await h.one(h.guillaume, { type: 'list.create', listId: uuid(), name: 'X', ...fields });
    assert.deepEqual([res.status, res.error], [400, error], JSON.stringify(fields));
  }
  assert.equal(h.app.db.prepare("SELECT for_name FROM lists WHERE name = 'X'").pluck().all().length, 0);
});

test('souhaits : lien http/https seulement (jamais appelé), prix en centimes, pas de quantité ; lien et prix refusés hors envies', async (t) => {
  const h = await household(t);
  const add = (fields) => h.one(h.lea, { type: 'item.create', listId: h.ids.lea, itemId: uuid(), name: 'Souhait', ...fields });
  for (const link of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://exemple.fr/x', 'file:///etc/passwd', 'https://user:pass@exemple.fr/', 'https://exemple.fr/a b', `https://exemple.fr/${'a'.repeat(490)}`, 'exemple.fr', 'https://', 42]) {
    const res = await add({ link });
    assert.deepEqual([res.status, res.error], [400, 'Lien invalide : une adresse web en http ou https, 500 caractères au plus.'], String(link));
  }
  for (const priceCents of [-1, 10000001, 12.5, '1200', true]) {
    assert.deepEqual((await add({ priceCents })).error, 'Prix invalide (de 0 à 100 000 €).', String(priceCents));
  }
  assert.equal((await add({ quantity: '2' })).error, 'Pas de quantité dans une liste d\'envies.');
  const ok = await add({ link: ' http://exemple.fr/Lampe?couleur=bleu ', priceCents: 0 });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.item.link, ok.item.priceCents], ['http://exemple.fr/Lampe?couleur=bleu', 0]);
  // Modifier, effacer
  const upd = await h.one(h.lea, { type: 'item.update', itemId: ok.item.id, link: null, priceCents: 1999 });
  assert.deepEqual([upd.item.link, upd.item.priceCents], [null, 1999]);
  assert.equal((await h.one(h.lea, { type: 'item.update', itemId: ok.item.id, link: 'javascript:void(0)' })).status, 400);
  assert.equal((await h.one(h.lea, { type: 'item.update', itemId: ok.item.id, priority: 'high' })).error, 'La priorité et l\'échéance ne se choisissent que dans une liste de tâches.');
  // Hors envies
  const tasks = uuid();
  await h.one(h.guillaume, { type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' });
  assert.equal((await h.one(h.guillaume, { type: 'item.create', listId: tasks, itemId: uuid(), name: 'X', link: 'https://exemple.fr' })).error, 'Le lien et le prix ne se choisissent que dans une liste d\'envies.');
  // Règles partagées avec le téléphone
  assert.equal(cleanLink('HTTPS://Exemple.fr'), 'https://exemple.fr/');
  assert.deepEqual(['25', '25,5', '25,50', '1 234,90 €', '12.99', '', ' '].map(parsePrice), [2500, 2550, 2550, 123490, 1299, null, null]);
  assert.ok(['abc', '1,234', '-3', '1000001'].map(parsePrice).every(Number.isNaN));
  assert.equal(formatPrice(24990).replace(/\s/g, ' '), '249,90 €');
});

test('figés : ni changement de type (dans les deux sens), ni de bénéficiaire, ni duplication, ni lien public', async (t) => {
  const h = await household(t);
  const tasks = uuid();
  await h.one(h.guillaume, { type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' });
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.ids.lea, listType: 'tasks' })).error, 'Une liste d\'envies ne change pas de type.');
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: tasks, listType: 'wishes' })).error, 'Une liste existante ne devient pas une liste d\'envies : créez une nouvelle liste.');
  for (const fields of [{ forUserId: h.marieId }, { forName: 'Paul' }, { forUserId: null }]) {
    assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.ids.lea, ...fields })).error, 'La personne à qui la liste est destinée ne change pas.');
  }
  // Ancien téléphone : il envoie toujours un identifiant de catégorie ; ignoré
  assert.equal((await h.one(h.guillaume, { type: 'list.update', listId: h.ids.lea, name: 'Noël 2026', categoryId: 2, storeId: null })).status, 200);
  assert.deepEqual(h.app.db.prepare('SELECT type, for_user_id FROM lists WHERE id = ?').get(h.ids.lea), { type: 'wishes', for_user_id: h.leaId });
  const dup = await h.guillaume.post(`/api/lists/${h.ids.lea}/duplicate`, { name: 'Copie' });
  assert.deepEqual([dup.status, dup.body.error], [400, 'Une liste d\'envies ne se duplique pas.']);
  const link = await h.guillaume.request('PUT', `/api/lists/${h.ids.lea}/share`, {});
  assert.deepEqual([link.status, link.body.error], [400, 'Pas de lien public pour une liste d\'envies.']);
  // Vue publique : refus défensif, même réponse qu'un lien inconnu (un lien
  // posé directement en base, comme s'il datait d'avant)
  const token = crypto.randomBytes(32).toString('base64url');
  h.app.db.prepare('INSERT INTO public_shares (list_id, token_hash, token_sealed, created_by, created_at) VALUES (?, ?, ?, 1, ?)').run(h.ids.lea, crypto.createHash('sha256').update(token).digest('hex'), 'scellé', '2026-10-16T12:00:00.000Z');
  const visitor = h.app.client({ ip: '203.0.113.5' });
  const wish = await visitor.get(`/api/public/${token}`);
  const unknown = await visitor.get(`/api/public/${crypto.randomBytes(32).toString('base64url')}`);
  assert.equal(wish.status, 404);
  assert.deepEqual([wish.status, wish.text], [unknown.status, unknown.text]);
});

test('qui voit les réservations : proches et gestionnaire oui ; bénéficiaire jamais ; « Moi » : pas le propriétaire ; sans compte : tous', async (t) => {
  const h = await household(t);
  assert.equal((await h.reserve(h.marie, h.ids.velo)).status, 200);
  assert.equal((await h.reserve(h.paul, h.ids.jeu)).status, 200, 'lecture seule : réserver n\'est pas modifier');
  assert.equal((await h.reserve(h.marie, h.ids.doudou)).status, 200);
  const velo = [{ itemId: h.ids.velo, userId: h.marieId, displayName: 'Marie' }];
  for (const client of [h.marie, h.paul, h.guillaume]) {
    assert.deepEqual(await h.reservedIn(client, h.ids.lea), velo);
    assert.deepEqual((await client.get(`/api/lists/${h.ids.lea}`)).body.reservations, velo);
  }
  // Léa : rien, nulle part
  const leaSync = (await h.lea.get('/api/sync')).body;
  assert.deepEqual(leaSync.reservations, {});
  assert.equal('reservations' in (await h.lea.get(`/api/lists/${h.ids.lea}`)).body, false);
  // « Mes envies » (Guillaume bénéficiaire) : Marie et Paul voient, Guillaume non
  assert.deepEqual((await h.reservedIn(h.marie, h.ids.moi)).map((r) => r.itemId), [h.ids.jeu]);
  assert.equal(await h.reservedIn(h.guillaume, h.ids.moi), undefined);
  assert.equal('reservations' in (await h.guillaume.get(`/api/lists/${h.ids.moi}`)).body, false);
  // « Lucas » (sans compte) : tout membre voit, Guillaume compris
  assert.equal((await h.reservedIn(h.guillaume, h.ids.lucas)).length, 1);
  assert.equal((await h.reservedIn(h.marie, h.ids.lucas)).length, 1);
  // Aucune trace dans les éléments eux-mêmes
  for (const client of [h.marie, h.guillaume, h.lea]) {
    const text = JSON.stringify((await client.get('/api/sync')).body.items);
    assert.equal(/reserv|Réserv/i.test(text), false);
  }
});

test('droits : bénéficiaire refusé (toujours la même réponse) ; libérer : soi-même ou le gestionnaire ; non-membre 404 ; une seule réservation gagne', async (t) => {
  const h = await household(t);
  // Le bénéficiaire : même réponse (statut, texte, en-têtes) que le souhait soit réservé ou non
  const answer = async (res) => ({ status: res.status, text: res.text, headers: Object.fromEntries([...res.headers].filter(([n]) => n !== 'date')) });
  const free = [await answer(await h.reserve(h.lea, h.ids.velo)), await answer(await h.release(h.lea, h.ids.velo))];
  assert.equal(free[0].status, 403);
  assert.equal(JSON.parse(free[0].text).error, BENEFICIARY);
  assert.deepEqual(free[0], free[1], 'réserver et libérer : même réponse');
  assert.equal((await h.reserve(h.marie, h.ids.velo)).status, 200);
  const booked = [await answer(await h.reserve(h.lea, h.ids.velo)), await answer(await h.release(h.lea, h.ids.velo))];
  assert.deepEqual(booked, free, 'réservé ou non : réponses identiques');
  // « Moi » : le propriétaire est le bénéficiaire
  assert.deepEqual(await answer(await h.reserve(h.guillaume, h.ids.jeu)), free[0]);
  // Non-membre : comme partout, « introuvable »
  assert.equal((await h.reserve(h.zoe, h.ids.velo)).status, 404);
  assert.equal((await h.release(h.zoe, h.ids.velo)).status, 404);
  assert.equal((await h.reserve(h.marie, uuid())).status, 404);
  // Déjà réservé : refus propre, aucun écrasement
  const twice = await h.reserve(h.paul, h.ids.velo);
  assert.deepEqual([twice.status, twice.body.error], [409, ALREADY]);
  assert.equal(h.app.db.prepare('SELECT user_id FROM reservations WHERE item_id = ?').pluck().get(h.ids.velo), h.marieId);
  // Paul ne libère pas la réservation de Marie ; le gestionnaire oui
  const notYours = await h.release(h.paul, h.ids.velo);
  assert.deepEqual([notYours.status, notYours.body.error], [403, NOT_YOURS]);
  assert.equal((await h.release(h.guillaume, h.ids.velo)).status, 200);
  assert.equal((await h.release(h.guillaume, h.ids.velo)).status, 404, 'déjà libre');
  // Chacun annule la sienne
  await h.reserve(h.paul, h.ids.livre);
  assert.equal((await h.release(h.paul, h.ids.livre)).status, 200);
  // Deux réservations simultanées : une seule gagne
  const race = await Promise.all([h.reserve(h.marie, h.ids.livre), h.reserve(h.paul, h.ids.livre), h.reserve(h.guillaume, h.ids.livre)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservations WHERE item_id = ?').pluck().get(h.ids.livre), 1);
  // Pas dans une autre liste
  const tasks = uuid();
  const item = uuid();
  await h.ops(h.guillaume, [{ type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' }, { type: 'item.create', listId: tasks, itemId: item, name: 'Ampoule' }]);
  assert.equal((await h.reserve(h.guillaume, item)).status, 400);
});

test('TEST FORT : tout ce que reçoit le bénéficiaire est strictement identique avant et après une réservation, puis une libération (corps, en-têtes, flux temps réel, copie locale)', async (t) => {
  const h = await household(t, { eventOptions: { keepaliveMs: 60 * 60 * 1000 } });
  const stream = rawStream(t, h, h.lea);
  const marieStream = rawStream(t, h, h.marie);
  await Promise.all([stream.ready, marieStream.ready]);
  await pause(150);
  const before = await snapshotOf(h, h.lea, h.ids.lea);
  const rawBefore = stream.raw;
  const updatedAt = () => h.app.db.prepare('SELECT (SELECT updated_at FROM lists WHERE id = ?) || \'|\' || (SELECT group_concat(updated_at) FROM items WHERE list_id = ?)').pluck().get(h.ids.lea, h.ids.lea);
  const stamps = updatedAt();
  const events = h.app.db.prepare('SELECT COUNT(*) FROM list_events').pluck().get();
  const logs = h.app.logs.length;
  const othersNews = JSON.stringify([(await h.marie.get('/api/sync')).body.news, (await h.paul.get('/api/sync')).body.news, (await h.guillaume.get('/api/sync')).body.news]);

  // Marie réserve deux souhaits, Paul un, puis le gestionnaire en libère un
  assert.equal((await h.reserve(h.marie, h.ids.velo)).status, 200);
  assert.equal((await h.reserve(h.paul, h.ids.livre)).status, 200);
  const during = await snapshotOf(h, h.lea, h.ids.lea);
  assert.equal((await h.release(h.guillaume, h.ids.livre)).status, 200);
  await pause(300);
  const after = await snapshotOf(h, h.lea, h.ids.lea);

  assert.deepEqual(during, before, 'pendant : rien de changé pour Léa');
  assert.deepEqual(after, before, 'après : rien de changé pour Léa');
  assert.equal(stream.raw, rawBefore, 'aucun octet de plus sur le flux temps réel de Léa');
  // Les proches, eux, ont été prévenus
  assert.ok((marieStream.raw.match(/event: list/g) ?? []).length >= 3, marieStream.raw);
  // Ni updated_at, ni nouveautés, ni journal
  assert.equal(updatedAt(), stamps, 'lists.updated_at et items.updated_at intacts');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_events').pluck().get(), events, 'aucune nouveauté');
  assert.equal(h.app.logs.length, logs, 'aucune ligne de journal');
  assert.equal(JSON.stringify([(await h.marie.get('/api/sync')).body.news, (await h.paul.get('/api/sync')).body.news, (await h.guillaume.get('/api/sync')).body.news]), othersNews, 'nouveautés des autres inchangées aussi');
});

test('bénéficiaire qui quitte la liste puis y revient : toujours exclu (identité du compte, pas appartenance) ; rajouté en « Peut modifier »', async (t) => {
  const h = await household(t);
  await h.reserve(h.marie, h.ids.velo);
  // Le propriétaire ne peut ni retirer Léa, ni la mettre en lecture seule
  const members = (access) => h.guillaume.request('PUT', `/api/lists/${h.ids.lea}/members`, { userIds: Object.keys(access).map(Number), access });
  assert.equal((await members({ [h.marieId]: 'modification', [h.paulId]: 'lecture' })).body.error, 'La personne à qui la liste est destinée ne peut pas en être retirée.');
  assert.equal((await members({ [h.leaId]: 'lecture', [h.marieId]: 'modification', [h.paulId]: 'lecture' })).body.error, 'La personne à qui la liste est destinée garde le droit « Peut modifier ».');
  // Elle part d'elle-même ; elle n'a plus accès à rien
  assert.equal((await h.lea.post(`/api/lists/${h.ids.lea}/leave`, {})).status, 200);
  assert.equal((await h.lea.get(`/api/lists/${h.ids.lea}`)).status, 404);
  assert.equal((await h.reserve(h.lea, h.ids.velo)).status, 404);
  // Rajoutée (sans droit précisé) : « Peut modifier » d'office, et toujours sans réservations
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.ids.lea}/members`, { userIds: [h.leaId, h.marieId, h.paulId], access: { [h.marieId]: 'modification', [h.paulId]: 'lecture' } })).status, 200);
  const back = (await h.lea.get(`/api/lists/${h.ids.lea}`)).body;
  assert.equal(back.list.canEdit, true);
  assert.equal('reservations' in back, false);
  assert.deepEqual((await h.lea.get('/api/sync')).body.reservations, {});
  assert.equal((await h.reserve(h.lea, h.ids.livre)).body.error, BENEFICIARY);
});

test('membre parti, compte désactivé : ses réservations restent ; le gestionnaire les voit et les libère', async (t) => {
  const h = await household(t);
  await h.reserve(h.marie, h.ids.velo);
  await h.reserve(h.paul, h.ids.livre);
  // Marie quitte la liste ; Paul est désactivé par l'Admin
  assert.equal((await h.marie.post(`/api/lists/${h.ids.lea}/leave`, {})).status, 200);
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/users/${h.paulId}`, { active: false })).status, 200);
  const seen = await h.reservedIn(h.guillaume, h.ids.lea);
  assert.deepEqual(seen.map((r) => r.displayName).sort(), ['Marie', 'Paul']);
  assert.equal((await h.release(h.guillaume, h.ids.velo)).status, 200);
  assert.equal((await h.release(h.guillaume, h.ids.livre)).status, 200);
  assert.deepEqual(await h.reservedIn(h.guillaume, h.ids.lea), []);
  // Un compte qui a réservé est « utilisé » : il ne se supprime pas (désactiver)
  await h.reserve(h.zoe, h.ids.velo).catch(() => {});
  await h.guillaume.request('PUT', `/api/lists/${h.ids.lucas}/members`, { userIds: [h.marieId, h.zoeId], access: { [h.marieId]: 'lecture', [h.zoeId]: 'lecture' } });
  await h.reserve(h.zoe, h.ids.doudou);
  await h.guillaume.request('PUT', `/api/lists/${h.ids.lucas}/members`, { userIds: [h.marieId], access: { [h.marieId]: 'lecture' } });
  assert.equal((await h.guillaume.del(`/api/admin/users/${h.zoeId}`)).status, 409);
});

test('souhait supprimé : sa réservation disparaît de la vue, et revient avec « Annuler » ; « reçu » : bénéficiaire et propriétaire seulement', async (t) => {
  const h = await household(t);
  await h.reserve(h.marie, h.ids.velo);
  assert.equal((await h.one(h.lea, { type: 'item.delete', itemId: h.ids.velo })).status, 200);
  assert.deepEqual(await h.reservedIn(h.marie, h.ids.lea), []);
  assert.equal((await h.reserve(h.paul, h.ids.velo)).status, 404);
  assert.equal((await h.one(h.lea, { type: 'item.restore', itemId: h.ids.velo })).status, 200);
  assert.equal((await h.reservedIn(h.marie, h.ids.lea)).length, 1);
  // Reçu
  const forbidden = 'Seul le bénéficiaire ou le propriétaire de la liste marque un souhait comme reçu.';
  assert.deepEqual([(await h.one(h.marie, { type: 'item.check', itemId: h.ids.livre, checked: true })).error], [forbidden]);
  assert.equal((await h.one(h.marie, { type: 'list.uncheckAll', listId: h.ids.lea })).error, forbidden);
  assert.equal((await h.one(h.paul, { type: 'item.check', itemId: h.ids.livre, checked: true })).status, 403);
  assert.equal((await h.one(h.lea, { type: 'item.check', itemId: h.ids.livre, checked: true })).status, 200);
  assert.equal((await h.one(h.guillaume, { type: 'item.check', itemId: h.ids.livre, checked: false })).status, 200);
  // « Moi » : le propriétaire ; sans compte : le propriétaire ; pas les proches
  assert.equal((await h.one(h.guillaume, { type: 'item.check', itemId: h.ids.jeu, checked: true })).status, 200);
  assert.equal((await h.one(h.marie, { type: 'item.check', itemId: h.ids.lampe, checked: true })).status, 403);
  // Reçu sans lien avec la réservation : le souhait reste réservé
  assert.equal((await h.one(h.lea, { type: 'item.check', itemId: h.ids.velo, checked: true })).status, 200);
  assert.equal((await h.reservedIn(h.marie, h.ids.lea)).length, 1);
});

test('administration : aucune route ne montre une liste d\'envies ni une réservation, même à l\'Admin bénéficiaire', async (t) => {
  const h = await household(t);
  await h.reserve(h.marie, h.ids.jeu); // « Mes envies » : Guillaume (Admin) en est le bénéficiaire
  await h.reserve(h.marie, h.ids.velo);
  for (const url of ['/api/admin/users', '/api/admin/stores', '/api/admin/aisles', '/api/admin/names', '/api/admin/names?q=jeu']) {
    const res = await h.guillaume.get(url);
    assert.equal(res.status, 200, url);
    for (const secret of ['Jeu de société', 'Vélo', 'Noël', 'Mes envies', 'reserv', 'Réserv']) assert.equal(res.text.includes(secret), false, `${url} : ${secret}`);
  }
  assert.equal((await h.guillaume.get('/api/admin/reservations')).status, 404);
  // Le journal de sécurité ne parle d'aucune réservation
  assert.equal(h.app.logs.some((l) => /reserv|réserv/i.test(l)), false);
});

test('migration 19 : colonnes et table ajoutées, rien d\'autre ne change, idempotente ; une sauvegarde d\'avant se restaure et migre', (t) => {
  const file = path.join(tempDir(t), 'sauvegarde.db');
  let db = databaseAt(file, 18);
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x')").run();
  db.prepare("INSERT INTO lists (id, name, type, category_id, owner_id) VALUES ('l1', 'Courses', 'shopping', 1, 1), ('l2', 'Maison', 'tasks', 2, 1)").run();
  db.prepare("INSERT INTO items (id, list_id, name, quantity, note, created_by) VALUES ('i1', 'l1', 'Lait', '2 L', 'demi', 1), ('i2', 'l2', 'Ampoule', '', '', 1)").run();
  const before = { lists: db.prepare('SELECT * FROM lists ORDER BY id').all(), items: db.prepare('SELECT * FROM items ORDER BY id').all() };
  db.close();
  db = openDatabase(file); // restauration : la copie est ouverte par Listo, la migration 19 s'applique
  assert.equal(schemaVersion(db), 19);
  assert.deepEqual(db.prepare('SELECT * FROM lists ORDER BY id').all().map(({ for_user_id: a, for_name: b, ...rest }) => rest), before.lists);
  assert.deepEqual(db.prepare('SELECT * FROM lists ORDER BY id').all().map((l) => [l.for_user_id, l.for_name]), [[null, null], [null, null]]);
  assert.deepEqual(db.prepare('SELECT * FROM items ORDER BY id').all().map(({ link, price_cents: price, ...rest }) => rest), before.items);
  assert.equal(db.prepare('SELECT COUNT(*) FROM reservations').pluck().get(), 0);
  // Contraintes : un seul réservant par souhait ; jamais compte ET prénom
  db.prepare("INSERT INTO reservations (item_id, user_id, created_at, updated_at) VALUES ('i1', 1, 'x', 'x')").run();
  assert.throws(() => db.prepare("INSERT INTO reservations (item_id, user_id, created_at, updated_at) VALUES ('i1', 1, 'y', 'y')").run(), /UNIQUE|PRIMARY/);
  assert.throws(() => db.prepare("UPDATE lists SET for_user_id = 1, for_name = 'Lucas' WHERE id = 'l2'").run(), /CHECK/);
  assert.throws(() => db.prepare("UPDATE items SET price_cents = -1 WHERE id = 'i2'").run(), /CHECK/);
  // Un souhait effacé pour de bon emporte sa réservation
  db.prepare("DELETE FROM items WHERE id = 'i1'").run();
  assert.equal(db.prepare('SELECT COUNT(*) FROM reservations').pluck().get(), 0);
  db.close();
  // Idempotente : relancer la fonction ne change rien
  const raw = new Database(file);
  const columns = raw.prepare('PRAGMA table_info(lists)').all().length;
  raw.close();
  db = openDatabase(file);
  assert.doesNotThrow(() => wishesMigration(db), 'déjà appliquée : rien à refaire');
  assert.equal(db.prepare('PRAGMA table_info(lists)').all().length, columns);
  db.close();
});
