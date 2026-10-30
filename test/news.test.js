// Nouveautés (migration 16) : ce que les AUTRES membres d'une liste ont
// ajouté ou modifié depuis ma dernière consultation. Calcul par le serveur,
// repères indépendants, sourdine et réglages, purge, migration, droits,
// temps réel, copie locale et écran. Le comportement à l'écran (pastille,
// halo, arrière-plan, hors ligne) est aussi vérifié dans Chromium
// (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { openDatabase, schemaVersion } from '../server/db.js';
import { MAX_EVENTS_PER_LIST, FORMER_MEMBER } from '../server/news.js';
import { emptyState, applyOp, mergeSync, toSnapshot, fromSnapshot, listNews, newsBadge, newsTotal, seenTarget, isListMuted } from '../public/js/store.js';
import { newsMark, newsBadgeLabel } from '../public/js/format.js';

const uuid = () => crypto.randomUUID();
const DAY = 24 * 60 * 60 * 1000;
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Guillaume (propriétaire), Marie (« Peut modifier »), Paul (« Lecture
// seule »), Zoé (pas membre). Une liste de courses partagée.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const ids = { guillaume: 1 };
  const clients = { guillaume };
  for (const name of ['marie', 'paul', 'zoe']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name[0].toUpperCase() + name.slice(1), ids[name]);
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  const listId = uuid();
  await run(guillaume, { type: 'list.create', listId, name: 'Courses', categoryId: 1 });
  await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [ids.marie, ids.paul], access: { [ids.marie]: 'modification', [ids.paul]: 'lecture' } });
  const newsOf = async (client) => (await client.get('/api/sync')).body.news;
  const listNewsOf = async (client) => (await newsOf(client)).lists[listId];
  const add = (client, name) => {
    const itemId = uuid();
    return run(client, { type: 'item.create', listId, itemId, name, aisleId: 4 }).then(() => itemId);
  };
  return { app, ...clients, ids, listId, newsOf, listNewsOf, add };
}

async function run(client, op) {
  const { id, ...result } = (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  return result;
}

test('calcul : jamais ses propres actions ; ajouté puis modifié = 1 ; ajouté puis supprimé = 0 ; suppressions ignorées', async (t) => {
  const h = await household(t);
  assert.equal((await h.listNewsOf(h.guillaume)).count, 0, 'repère posé à l\'arrivée : rien de nouveau');
  const lait = await h.add(h.marie, 'Lait');
  await run(h.marie, { type: 'item.update', itemId: lait, quantity: '2 L' });
  const pain = await h.add(h.marie, 'Pain');
  await run(h.marie, { type: 'item.delete', itemId: pain });
  const own = await h.add(h.guillaume, 'Riz');
  let news = await h.listNewsOf(h.guillaume);
  assert.equal(news.count, 1);
  assert.deepEqual(news.items, [{ itemId: lait, kind: 'added', by: 'Marie' }], 'ajouté puis modifié : une fois, « Ajouté »');
  // Marie : le Riz de Guillaume, jamais ses propres actions
  assert.deepEqual((await h.listNewsOf(h.marie)).items, [{ itemId: own, kind: 'added', by: 'Guillaume' }]);
  // Une modification seule : « Modifié » par son dernier auteur
  await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: news.lastEventId });
  await run(h.paul, { type: 'list.seen', listId: h.listId, upTo: news.lastEventId }); // (Paul, lecture seule)
  await run(h.marie, { type: 'item.update', itemId: own, note: 'basmati' });
  news = await h.listNewsOf(h.guillaume);
  assert.deepEqual(news.items, [{ itemId: own, kind: 'updated', by: 'Marie' }]);
  // Une suppression n'est jamais une nouveauté, et « Annuler » non plus
  await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: news.lastEventId });
  await run(h.marie, { type: 'item.delete', itemId: lait });
  await run(h.marie, { type: 'item.restore', itemId: lait });
  assert.equal((await h.listNewsOf(h.guillaume)).count, 0);
});

test('cochés : exclus par défaut, signalés avec « Signaler aussi les cochés » (« checked » / « unchecked »)', async (t) => {
  const h = await household(t);
  const lait = await h.add(h.guillaume, 'Lait');
  const end = async (client) => (await h.listNewsOf(client)).lastEventId;
  await run(h.marie, { type: 'list.seen', listId: h.listId, upTo: await end(h.marie) });
  await run(h.guillaume, { type: 'item.check', itemId: lait, checked: true });
  assert.equal((await h.listNewsOf(h.marie)).count, 0, 'cochés exclus par défaut');
  assert.deepEqual(await run(h.marie, { type: 'account.news', checks: true }), { status: 200 });
  assert.deepEqual((await h.listNewsOf(h.marie)).items, [{ itemId: lait, kind: 'checked', by: 'Guillaume' }]);
  await run(h.guillaume, { type: 'item.check', itemId: lait, checked: false });
  assert.deepEqual((await h.listNewsOf(h.marie)).items, [{ itemId: lait, kind: 'unchecked', by: 'Guillaume' }]);
  // « Tout décocher » et « Retirer du panier » : un événement par élément
  await run(h.guillaume, { type: 'item.check', itemId: lait, checked: true });
  await run(h.guillaume, { type: 'list.uncheckAll', listId: h.listId });
  const types = h.app.db.prepare('SELECT type FROM list_events WHERE item_id = ? ORDER BY id').pluck().all(lait);
  assert.deepEqual(types, ['add', 'check', 'uncheck', 'check', 'uncheck']);
  // Aucun texte d'élément dans le journal
  const columns = h.app.db.prepare('PRAGMA table_info(list_events)').all().map((c) => c.name);
  assert.deepEqual(columns, ['id', 'list_id', 'user_id', 'type', 'item_id', 'created_at']);
});

test('trois membres, trois repères indépendants ; « vu » idempotent et monotone (rejouable hors ligne)', async (t) => {
  const h = await household(t);
  await h.add(h.marie, 'Lait');
  const g = await h.listNewsOf(h.guillaume);
  assert.equal(g.count, 1);
  assert.equal((await h.listNewsOf(h.paul)).count, 1);
  // Guillaume a vu : lui seul
  const seen = { id: uuid(), type: 'list.seen', listId: h.listId, upTo: g.lastEventId };
  assert.equal((await h.guillaume.post('/api/ops', { ops: [seen] })).body.results[0].status, 200);
  assert.equal((await h.listNewsOf(h.guillaume)).count, 0);
  assert.equal((await h.listNewsOf(h.paul)).count, 1, 'Paul garde la sienne');
  // La même opération renvoyée (file d'attente après une coupure) : rien de plus
  assert.equal((await h.guillaume.post('/api/ops', { ops: [seen] })).body.results[0].duplicate, true);
  // Un repère plus ancien ne fait jamais redescendre
  assert.deepEqual(await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: 0 }), { status: 200 });
  assert.equal((await h.listNewsOf(h.guillaume)).seen, g.lastEventId);
  // Au-delà de la fin du journal : ramené à la fin (rien d'inventé)
  await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: 999999 });
  await h.add(h.marie, 'Pain');
  assert.equal((await h.listNewsOf(h.guillaume)).count, 1, 'le prochain ajout de Marie compte');
  // Hors ligne : « vu » envoyé plus tard avec l'ancien repère connu du téléphone
  // ne cache pas ce qui est arrivé entre-temps
  await run(h.paul, { type: 'list.seen', listId: h.listId, upTo: g.lastEventId });
  assert.equal((await h.listNewsOf(h.paul)).count, 1, 'Pain, arrivé après, reste nouveau pour Paul');
  // Valeurs refusées
  for (const bad of [-1, 1.5, '3', null, undefined]) {
    assert.deepEqual(await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: bad }), { status: 400, error: 'Repère de lecture invalide.' }, String(bad));
  }
});

test('nouveau membre : sans historique ; membre retiré : perd son repère ; liste supprimée : journal effacé', async (t) => {
  const h = await household(t);
  await h.add(h.marie, 'Lait');
  await h.guillaume.request('PUT', `/api/lists/${h.listId}/members`, { userIds: [h.ids.marie, h.ids.paul, h.ids.zoe] });
  assert.equal((await h.listNewsOf(h.zoe)).count, 0, 'Zoé arrive : l\'historique n\'est pas nouveau');
  await h.add(h.marie, 'Pain');
  assert.equal((await h.listNewsOf(h.zoe)).count, 1, 'ce qui suit son arrivée compte');
  // Retirée : plus de repère, plus de nouveautés de cette liste
  await h.guillaume.request('PUT', `/api/lists/${h.listId}/members`, { userIds: [h.ids.marie, h.ids.paul] });
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_reads WHERE list_id = ? AND user_id = ?').pluck().get(h.listId, h.ids.zoe), 0);
  assert.equal((await h.newsOf(h.zoe)).lists[h.listId], undefined);
  // Quitter la liste : pareil
  assert.equal((await h.paul.post(`/api/lists/${h.listId}/leave`)).status, 200);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_reads WHERE list_id = ? AND user_id = ?').pluck().get(h.listId, h.ids.paul), 0);
  // Liste supprimée : journal et repères effacés
  await run(h.guillaume, { type: 'list.delete', listId: h.listId });
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_events WHERE list_id = ?').pluck().get(h.listId), 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_reads WHERE list_id = ?').pluck().get(h.listId), 0);
});

test('nettoyage : 30 jours et 500 événements par liste ; repère plus ancien que le journal : « 30+ »', async (t) => {
  const h = await household(t);
  const lait = await h.add(h.marie, 'Lait');
  // Événement vieux de 31 jours : effacé par le nettoyage (les sessions,
  // elles, durent 30 jours : on vieillit l'événement plutôt que l'horloge)
  h.app.db.prepare('UPDATE list_events SET created_at = ? WHERE item_id = ?').run(new Date(h.app.clock.now - 31 * DAY).toISOString(), lait);
  await h.add(h.marie, 'Pain');
  const removed = h.app.ctx.news.purgeOld();
  assert.equal(removed, 1);
  const news = await h.listNewsOf(h.guillaume);
  assert.equal(news.behind, true, 'mon repère est plus ancien que le journal gardé');
  assert.equal(news.count, 1, 'seul le Pain est encore connu (l\'ajout du Lait a été effacé) : d\'où « 30+ »');
  // Marie (à jour grâce à ses propres actions) : pas « behind »
  assert.equal((await h.listNewsOf(h.marie)).behind, false);
  // « vu » jusqu'au bout : « behind » retombe
  await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: news.lastEventId });
  assert.equal((await h.listNewsOf(h.guillaume)).behind, false);
  // Plafond : 500 événements par liste au plus
  const itemId = await h.add(h.guillaume, 'Riz');
  h.app.ctx.news.log(h.listId, h.ids.marie, 'update', Array.from({ length: MAX_EVENTS_PER_LIST + 20 }, () => itemId));
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_events WHERE list_id = ?').pluck().get(h.listId), MAX_EVENTS_PER_LIST);
  assert.equal((await h.listNewsOf(h.guillaume)).behind, true, 'des événements non vus ont été effacés : « 30+ »');
  // À l'écran : « 30+ », lu « plus de 30 nouveautés »
  const state = emptyState();
  state.listIds.add('x');
  state.news = { enabled: true, checks: false, lists: { x: { count: 3, behind: true, muted: false, seen: 1, lastEventId: 9, items: [] } } };
  assert.equal(newsBadge(state, 'x'), '30+');
  assert.equal(newsBadgeLabel('30+'), 'plus de 30 nouveautés');
  assert.equal(newsTotal(state), 30);
});

test('migration 16 : tables du journal et des repères, repère de chaque membre posé sur le dernier événement, réglages par défaut', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listo-news-'));
  const file = path.join(dir, 'listo.db');
  let db = openDatabase(file);
  db.exec('DROP TABLE list_events; DROP TABLE list_reads; ALTER TABLE users DROP COLUMN news_enabled; ALTER TABLE users DROP COLUMN news_checks');
  db.pragma('user_version = 15');
  db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES ('a', 'A', 'x'), ('b', 'B', 'x')").run();
  db.prepare("INSERT INTO lists (id, name, category_id, owner_id) VALUES ('l1', 'Courses', 1, 1), ('l2', 'Maison', 2, 2)").run();
  db.prepare("INSERT INTO list_members (list_id, user_id, access) VALUES ('l1', 1, 'modification'), ('l1', 2, 'lecture'), ('l2', 2, 'modification')").run();
  db.close();
  db = openDatabase(file);
  assert.equal(schemaVersion(db), 16);
  assert.deepEqual(db.prepare('SELECT list_id, user_id, last_seen, behind, muted FROM list_reads ORDER BY list_id, user_id').all().map((r) => ({ ...r })), [
    { list_id: 'l1', user_id: 1, last_seen: 0, behind: 0, muted: 0 },
    { list_id: 'l1', user_id: 2, last_seen: 0, behind: 0, muted: 0 },
    { list_id: 'l2', user_id: 2, last_seen: 0, behind: 0, muted: 0 },
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) FROM list_events').pluck().get(), 0, 'journal vide : personne ne voit l\'historique comme nouveau');
  assert.deepEqual(db.prepare('SELECT news_enabled, news_checks FROM users').all().map((u) => ({ ...u })), [{ news_enabled: 1, news_checks: 0 }, { news_enabled: 1, news_checks: 0 }]);
  for (const bad of ["'renommé'", "'add2'"]) assert.throws(() => db.prepare(`INSERT INTO list_events (list_id, user_id, type, item_id, created_at) VALUES ('l1', 1, ${bad}, 'i', 'x')`).run(), /CHECK/);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('droits : non-membre « Liste introuvable » ; invité en lecture seule peut marquer comme vu et mettre en sourdine ; aucun nom envoyé à un non-membre', async (t) => {
  const h = await household(t);
  await h.add(h.marie, 'Lait');
  for (const op of [{ type: 'list.seen', listId: h.listId, upTo: 1 }, { type: 'list.mute', listId: h.listId, muted: true }]) {
    assert.deepEqual(await run(h.zoe, op), { status: 404, error: 'Liste introuvable.' });
  }
  const zoe = await h.newsOf(h.zoe);
  assert.equal(zoe.lists[h.listId], undefined);
  assert.doesNotMatch(JSON.stringify(zoe), /Marie|"by"/, 'aucun nom d\'auteur pour un non-membre');
  // L'Admin (Guillaume l'est) n'a rien de plus : seulement ses listes
  assert.deepEqual(Object.keys((await h.newsOf(h.guillaume)).lists), [h.listId]);
  // Paul, lecture seule : vu et sourdine permis (ce n'est pas une modification)
  const paul = await h.listNewsOf(h.paul);
  assert.deepEqual(await run(h.paul, { type: 'list.seen', listId: h.listId, upTo: paul.lastEventId }), { status: 200 });
  assert.deepEqual(await run(h.paul, { type: 'list.mute', listId: h.listId, muted: true }), { status: 200 });
  assert.deepEqual(await run(h.paul, { type: 'item.create', listId: h.listId, itemId: uuid(), name: 'X' }), { status: 403, error: 'Vous avez un accès en lecture seule à cette liste.' });
  // Lien public : ni journal, ni nouveautés, ni nom
  const share = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const pub = await createClient(h.app.base, { ip: '203.0.113.50' }).get(`/api/public/${token}`);
  assert.equal(pub.status, 200);
  assert.doesNotMatch(pub.text, /news|Marie|added|lastEventId/);
  assert.doesNotMatch(read('server/routes/public.js'), /news|list_events|list_reads/);
});

test('sourdine et réglage « Nouveautés » : plus rien à signaler ; valeurs invalides refusées', async (t) => {
  const h = await household(t);
  await h.add(h.marie, 'Lait');
  await run(h.guillaume, { type: 'list.mute', listId: h.listId, muted: true });
  let news = await h.listNewsOf(h.guillaume);
  assert.deepEqual([news.muted, news.count, news.items], [true, 0, []]);
  await run(h.guillaume, { type: 'list.mute', listId: h.listId, muted: false });
  assert.equal((await h.listNewsOf(h.guillaume)).count, 1, 'sortie de sourdine : la nouveauté revient (repère inchangé)');
  await run(h.guillaume, { type: 'account.news', enabled: false });
  news = await h.newsOf(h.guillaume);
  assert.equal(news.enabled, false);
  assert.equal(news.lists[h.listId].count, 0);
  assert.deepEqual(await run(h.guillaume, { type: 'account.news', enabled: 'non' }), { status: 400, error: 'Réglage « Nouveautés » invalide.' });
  assert.deepEqual(await run(h.guillaume, { type: 'account.news', checks: 1 }), { status: 400, error: 'Réglage « Signaler aussi les cochés » invalide.' });
  assert.deepEqual(await run(h.guillaume, { type: 'account.news' }), { status: 400, error: 'Rien à modifier.' });
  assert.deepEqual(await run(h.guillaume, { type: 'list.mute', listId: h.listId, muted: 'oui' }), { status: 400, error: 'Réglage « Ne plus me signaler cette liste » invalide.' });
});

test('temps réel : « vu », sourdine et réglages préviennent mes autres appareils (moi seul) ; un ajout prévient les membres', async (t) => {
  const h = await household(t);
  const sent = [];
  const members = [];
  const notifyList = h.app.ctx.events.notifyList.bind(h.app.ctx.events);
  h.app.ctx.events.notifyList = (listId, options) => {
    members.push(listId);
    notifyList(listId, options);
  };
  const notifyUsers = h.app.ctx.events.notifyUsers.bind(h.app.ctx.events);
  h.app.ctx.events.notifyUsers = (userIds, listId) => {
    sent.push([[...userIds].sort(), listId]);
    notifyUsers(userIds, listId);
  };
  await h.add(h.marie, 'Lait');
  assert.deepEqual(members, [h.listId], 'membres prévenus de l\'ajout (synchronisation : nouveautés recalculées)');
  sent.length = 0;
  const news = await h.listNewsOf(h.guillaume);
  await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: news.lastEventId });
  assert.deepEqual(sent, [[[h.ids.guillaume], h.listId]]);
  sent.length = 0;
  await run(h.guillaume, { type: 'list.seen', listId: h.listId, upTo: news.lastEventId });
  assert.deepEqual(sent, [], 'rien n\'a changé : personne n\'est prévenu');
  await run(h.guillaume, { type: 'list.mute', listId: h.listId, muted: true });
  await run(h.guillaume, { type: 'account.news', checks: true });
  assert.deepEqual(sent, [[[h.ids.guillaume], h.listId], [[h.ids.guillaume], null]]);
});

test('auteur désactivé : « un ancien membre » ; photo ajoutée : une modification', async (t) => {
  const h = await household(t);
  const lait = await h.add(h.marie, 'Lait');
  h.app.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(h.ids.marie);
  assert.deepEqual((await h.listNewsOf(h.guillaume)).items, [{ itemId: lait, kind: 'added', by: FORMER_MEMBER }]);
  assert.equal(FORMER_MEMBER, 'un ancien membre');
  // Photo : passe par setPhotoDate avec la personne qui l'envoie
  const riz = await h.add(h.guillaume, 'Riz');
  h.app.ctx.lists.setPhotoDate(riz, new Date(h.app.clock.now).toISOString(), { id: h.ids.paul });
  assert.equal(h.app.db.prepare("SELECT type FROM list_events WHERE item_id = ? AND user_id = ? ORDER BY id DESC").pluck().get(riz, h.ids.paul), 'update');
  assert.match(read('server/routes/photos.js'), /service\.setPhotoDate\(req\.item\.id, service\.nowIso\(\), req\.user\)/);
  assert.match(read('server/routes/photos.js'), /service\.setPhotoDate\(req\.item\.id, null, req\.user\)/);
});

test('copie locale : nouveautés gardées (hors ligne), « vu » et sourdine appliqués tout de suite ; pastille, total, repère à envoyer', () => {
  const state = emptyState();
  state.listIds = new Set(['a', 'b']);
  state.lists.set('a', { id: 'a' });
  state.lists.set('b', { id: 'b' });
  mergeSync(state, {
    serverTime: 't', listIds: ['a', 'b'], lists: [], items: [], categories: [], stores: [], aisles: [], history: [],
    news: { enabled: true, checks: false, lists: {
      a: { count: 2, behind: false, muted: false, seen: 3, lastEventId: 7, items: [{ itemId: 'i1', kind: 'added', by: 'Marie' }, { itemId: 'i2', kind: 'updated', by: 'Paul' }] },
      b: { count: 1, behind: false, muted: false, seen: 4, lastEventId: 5, items: [{ itemId: 'i3', kind: 'added', by: 'Marie' }] },
    } },
  });
  assert.equal(newsBadge(state, 'a'), '2');
  assert.equal(newsTotal(state), 3);
  assert.equal(seenTarget(state, 'a'), 7);
  // Copie gardée sur le téléphone : relue à l'identique
  assert.deepEqual(fromSnapshot(toSnapshot(state)).news, state.news);
  // « vu » : pastille partie tout de suite (hors ligne compris)
  applyOp(state, { type: 'list.seen', listId: 'a', upTo: 7 }, { user: { id: 1 } });
  assert.equal(newsBadge(state, 'a'), '');
  assert.equal(listNews(state, 'a'), null);
  assert.equal(seenTarget(state, 'a'), null, 'plus rien à envoyer');
  // Sourdine : ni pastille ni total
  applyOp(state, { type: 'list.mute', listId: 'b', muted: true }, { user: { id: 1 } });
  assert.equal(isListMuted(state, 'b'), true);
  assert.equal(newsTotal(state), 0);
  // « Nouveautés » désactivé : rien
  applyOp(state, { type: 'list.mute', listId: 'b', muted: false }, { user: { id: 1 } });
  state.news.lists.b.count = 1;
  applyOp(state, { type: 'account.news', enabled: false }, { user: { id: 1 } });
  assert.equal(newsBadge(state, 'b'), '');
  // Libellés
  assert.deepEqual(['added', 'updated', 'checked', 'unchecked'].map((k) => newsMark(k, 'Marie')), ['Ajouté par Marie', 'Modifié par Marie', 'Coché par Marie', 'Décoché par Marie']);
  assert.deepEqual(['1', '3'].map(newsBadgeLabel), ['1 nouveauté', '3 nouveautés']);
});

test('écran : halo gardé pendant la visite (jusqu\'au toucher de la ligne), absent à la visite suivante ; repère monté seulement à l\'écran', () => {
  const list = read('public/js/screens/list.js');
  const body = list.slice(list.indexOf('export function renderList('));
  // La mémoire du halo appartient à l'écran ouvert : une nouvelle visite repart de zéro
  assert.match(body, /const visitNews = new Map\(\); \/\/ id de l'élément -> \{ kind, by \}/);
  assert.doesNotMatch(list.slice(0, list.indexOf('export function renderList(')), /visitNews/);
  // Prise des nouveautés : seulement application visible
  assert.match(body, /if \(document\.visibilityState !== 'visible' \|\| !app\.data\.loaded \|\| !app\.data\.lists\.has\(listId\)\) return false;/);
  assert.match(body, /if \(upTo !== null && upTo > sentSeen\) \{\s*sentSeen = upTo;\s*actions\.markSeen\(listId, upTo\);/);
  assert.match(body, /document\.addEventListener\('visibilitychange', onVisible\);/);
  // Toucher la ligne retire son halo, pour la visite seulement
  assert.match(body, /for \(const type of \['pointerdown', 'click'\]\) row\.addEventListener\(type, \(\) => forgetNews\(item\.id, row\), true\);/);
  // Halo ET texte : jamais la couleur seule
  assert.match(body, /meta\.news \? h\('span', \{ class: 'item__news' \}, meta\.news\) : null,/);
  // Kit de design, section 16.13 (identique dans design/ et public/)
  const css = read('public/css/listo.css');
  const section = css.slice(css.indexOf('/* 16.13 Nouveautés'));
  assert.match(section, /\.item--news \{ background: var\(--color-accent-soft\); \}/);
  assert.match(section, /\.news-badge \{[^}]*background: var\(--color-accent\); color: var\(--color-on-accent\);/);
  assert.doesNotMatch(section, /animation|transition|#[0-9a-f]{3,6}\b|--[a-z-]+:/i, 'statique, couleurs et variables du kit seulement');
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  // Aucun focus automatique
  assert.doesNotMatch(body.slice(body.indexOf('// --- Nouveautés de cette visite'), body.indexOf('// Ligne touchée')), /\.focus\(/);
  // Badge de l'icône : essai facultatif
  assert.match(read('public/js/app.js'), /const done = total > 0 \? navigator\.setAppBadge\?\.\(total\) : navigator\.clearAppBadge\?\.\(\);/);
});
