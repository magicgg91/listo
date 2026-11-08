// Connexion Claude : priorité et échéance. add_items les accepte (si la
// liste les active) ; set_item_options règle celles d'éléments existants, et
// rien d'autre. La règle est celle de l'application (itemOptionsError,
// server/lists.js), appliquée par l'opération item.update.
//
// Foyer (mcp-helpers.js) : Guillaume (Admin) a « Courses » (courses, Marie en
// lecture seule), « Maison » (tâches, priorité et échéance activées ;
// « Ampoule » : élevée, 2026-11-05) et « Secret » (tâches, sans option) ;
// Marie a « Perso ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addUser, login } from './helpers.js';
import { uuid, SECOND, PASSWORD, MARIE_PASSWORD, household, connect, claude, data } from './mcp-helpers.js';
import { TOOLS, OPTIONS_MAX, OPTIONS_PER_HOUR, READ_ONLY_GRANT, LIST_NOT_FOUND } from '../server/mcp-tools.js';
import { INSTRUCTIONS } from '../server/mcp.js';
import { PRIORITY_OFF, DUE_OFF, PRIORITY_NOT_HERE, DUE_NOT_HERE, BAD_PRIORITY, BAD_DUE, READ_ONLY, itemOptionsError } from '../server/lists.js';

const MINUTE = 60 * SECOND;
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const toolError = (res) => (res.body.result?.isError ? res.body.result.content[0].text : null);
const rpcError = (res) => res.body.error ?? null;
const write = (choice = {}) => ({ scope: 'write', ...choice });
const row = (h, id) => h.app.db.prepare('SELECT name, quantity, note, link, price_cents, checked, deleted_at, priority, due_date, updated_at FROM items WHERE id = ?').get(id);
const countItems = (h, listId) => h.app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ?').pluck().get(listId);

async function writer(t) {
  const h = await household(t);
  const tokens = await connect(h, h.guillaume, PASSWORD, write());
  const c = claude(h, tokens.access_token);
  return { h, c, tokens };
}
// Une nouvelle connexion de la même application remplace la précédente :
// on renomme d'abord l'application des connexions existantes
let appNumber = 0;
const separateApp = (h) => h.app.db.prepare('UPDATE oauth_grants SET app_key = ?').run(`autre-${++appNumber}`);

test('règle partagée : type de liste, réglage activé, valeur, vraie date du calendrier', () => {
  const on = { priorityEnabled: true, dueEnabled: true };
  assert.equal(itemOptionsError('tasks', on, { priority: 'high', dueDate: '2026-12-24' }), null);
  assert.equal(itemOptionsError('tasks', on, { dueDate: null }), null, 'null efface');
  assert.equal(itemOptionsError('wishes', on, { priority: 'low' }), null);
  assert.equal(itemOptionsError('wishes', on, { dueDate: '2026-12-24' }), DUE_NOT_HERE, 'jamais d\'échéance pour les envies');
  assert.equal(itemOptionsError('shopping', on, { priority: 'low' }), PRIORITY_NOT_HERE);
  assert.equal(itemOptionsError('shopping', on, { dueDate: '2026-12-24' }), DUE_NOT_HERE);
  assert.equal(itemOptionsError('tasks', { priorityEnabled: false, dueEnabled: true }, { priority: 'low' }), PRIORITY_OFF);
  assert.equal(itemOptionsError('tasks', { priorityEnabled: true, dueEnabled: false }, { dueDate: '2026-12-24' }), DUE_OFF);
  assert.equal(itemOptionsError('tasks', on, { priority: 'urgent' }), BAD_PRIORITY);
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-10', '1999-12-31', '2101-01-01', '2026-2-3', '2026-02-03T10:00', '', '24/12/2026']) {
    assert.equal(itemOptionsError('tasks', on, { dueDate: date }), BAD_DUE, date);
  }
  assert.equal(itemOptionsError('tasks', on, { dueDate: '2028-02-29' }), null, 'année bissextile');
  // L'application (item.update, item.create) et Claude utilisent cette seule fonction
  const lists = read('server/lists.js');
  assert.equal((lists.match(/itemOptionsError\(/g) ?? []).length, 4, 'définie une fois, utilisée par item.create, item.update et checkItemEdit (update_items)');
  assert.doesNotMatch(lists, /throw new OpError\(400, PRIORITY_OFF\)|throw new OpError\(400, DUE_OFF\)/, 'plus de règle en double');
  const tools = read('server/mcp-tools.js');
  assert.match(tools, /const error = itemOptionsError\(typeOf\(list\), list, \{ priority: item\.priority, dueDate: item\.due_date \}\);/);
});

test('add_items : priorité et échéance enregistrées si la liste les active ; sinon l\'appel entier est refusé et rien n\'est ajouté', async (t) => {
  const { h, c } = await writer(t);
  const res = data(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Clou', priority: 'high', due_date: '2026-12-24' }, { name: 'Vis', priority: 'low' }, { name: 'Colle' }] }));
  assert.equal(res.created, 3);
  const byName = Object.fromEntries(res.results.map((r) => [r.name, row(h, r.id)]));
  assert.deepEqual([byName.Clou.priority, byName.Clou.due_date], ['high', '2026-12-24']);
  assert.deepEqual([byName.Vis.priority, byName.Vis.due_date], ['low', null]);
  assert.deepEqual([byName.Colle.priority, byName.Colle.due_date], ['normal', null]);
  // Nouveautés : un seul événement « ajout » par élément (pas d'« ajout » puis « modification »)
  const ids = res.results.map((r) => r.id);
  const events = h.app.db.prepare(`SELECT type, COUNT(*) AS n FROM list_events WHERE list_id = ? AND item_id IN (${ids.map(() => '?').join(',')}) GROUP BY type`).all(h.ids.maison, ...ids);
  assert.deepEqual(events, [{ type: 'add', n: 3 }]);
  // Refus : réglage désactivé, mauvais type de liste, valeur ou date fausse ; un seul élément fautif suffit
  const cases = [
    [h.ids.secret, [{ name: 'A', priority: 'high' }], PRIORITY_OFF],
    [h.ids.secret, [{ name: 'A', due_date: '2026-12-24' }], DUE_OFF],
    [h.ids.courses, [{ name: 'A', priority: 'high' }], PRIORITY_NOT_HERE],
    [h.ids.courses, [{ name: 'A', due_date: '2026-12-24' }], DUE_NOT_HERE],
    [h.ids.maison, [{ name: 'Bon' }, { name: 'Faux', due_date: '2026-02-30' }], BAD_DUE],
    [h.ids.maison, [{ name: 'Bon', priority: 'high' }, { name: 'Faux', priority: 'urgent' }], BAD_PRIORITY],
    [h.ids.maison, [{ name: 'Faux', due_date: '1999-12-31' }], BAD_DUE],
  ];
  for (const [listId, items, message] of cases) {
    const before = countItems(h, listId);
    assert.equal(toolError(await c.tool('add_items', { list_id: listId, items })), message, JSON.stringify(items));
    assert.equal(countItems(h, listId), before, 'rien n\'est ajouté');
  }
  // Mauvais type de valeur : erreur d'arguments (-32602)
  for (const item of [{ name: 'A', priority: 3 }, { name: 'A', due_date: 20261224 }, { name: 'A', due_date: null }]) {
    assert.equal(rpcError(await c.tool('add_items', { list_id: h.ids.maison, items: [item] }))?.code, -32602, JSON.stringify(item));
  }
});

test('add_items : un élément déjà là (non coché) est ignoré et n\'est PAS modifié', async (t) => {
  const { h, c } = await writer(t);
  const before = row(h, h.ids.ampoule);
  const res = data(await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'ampoule', priority: 'low', due_date: '2027-01-01' }] }));
  assert.deepEqual(res.results, [{ name: 'ampoule', status: 'ignored', reason: 'déjà dans la liste, non coché', existing_id: h.ids.ampoule }]);
  assert.deepEqual(row(h, h.ids.ampoule), before);
});

test('set_item_options : priorité et échéance réglées par item.update ; null efface ; même demande : inchangé (idempotent) ; Nouveautés et temps réel', async (t) => {
  const { h, c } = await writer(t);
  const before = row(h, h.ids.ampoule);
  const lastEvent = h.app.db.prepare('SELECT COALESCE(MAX(id), 0) FROM list_events').pluck().get();
  h.app.clock.now += MINUTE;
  const first = data(await c.tool('set_item_options', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, priority: 'low', due_date: '2026-12-24' }] }));
  assert.deepEqual(first, { list_id: h.ids.maison, results: [{ id: h.ids.ampoule, status: 'updated', priority: 'low', due_date: '2026-12-24' }], updated: 1, unchanged: 0, ignored: 0 });
  const after = row(h, h.ids.ampoule);
  assert.deepEqual([after.priority, after.due_date], ['low', '2026-12-24']);
  assert.notEqual(after.updated_at, before.updated_at, 'les téléphones l\'apprennent à leur synchronisation');
  // Rien d'autre n'a bougé
  for (const key of ['name', 'quantity', 'note', 'link', 'price_cents', 'checked', 'deleted_at']) assert.equal(after[key], before[key], key);
  // Nouveautés : une modification, au nom du compte
  assert.deepEqual(h.app.db.prepare('SELECT type, user_id, item_id FROM list_events WHERE id > ?').all(lastEvent), [{ type: 'update', user_id: 1, item_id: h.ids.ampoule }]);
  // Même demande : rien n'est écrit
  h.app.clock.now += MINUTE;
  const again = data(await c.tool('set_item_options', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, priority: 'low', due_date: '2026-12-24' }] }));
  assert.deepEqual([again.updated, again.unchanged], [0, 1]);
  assert.equal(row(h, h.ids.ampoule).updated_at, after.updated_at);
  // null efface l'échéance ; seulement la priorité ; seulement l'échéance
  assert.equal(data(await c.tool('set_item_options', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, due_date: null }] })).updated, 1);
  assert.deepEqual([row(h, h.ids.ampoule).priority, row(h, h.ids.ampoule).due_date], ['low', null]);
  assert.equal(data(await c.tool('set_item_options', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule.toUpperCase(), priority: 'high' }] })).updated, 1, 'identifiant en majuscules accepté');
  assert.deepEqual([row(h, h.ids.ampoule).priority, row(h, h.ids.ampoule).due_date], ['high', null]);
  // L'application voit la même chose (lecture de la liste)
  const item = (await h.guillaume.get(`/api/lists/${h.ids.maison}`)).body.groups.flatMap((g) => g.items).find((i) => i.id === h.ids.ampoule);
  assert.deepEqual([item.priority, item.dueDate], ['high', null]);
});

test('set_item_options : aucun autre champ (nom, note, quantité, lien, prix, coché, suppression) ; 1 à 20 éléments ; au moins priorité ou échéance', async (t) => {
  const { h, c } = await writer(t);
  const before = row(h, h.ids.ampoule);
  for (const extra of [{ name: 'X' }, { note: 'X' }, { quantity: '9' }, { link: 'https://exemple.fr' }, { price: 3 }, { checked: true }, { deleted: true }, { delete: true }, { list_id: h.ids.maison }]) {
    const res = await c.tool('set_item_options', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, priority: 'low', ...extra }] });
    assert.equal(rpcError(res)?.code, -32602, JSON.stringify(extra));
  }
  for (const items of [[], [{ id: h.ids.ampoule }], Array.from({ length: OPTIONS_MAX + 1 }, () => ({ id: h.ids.ampoule, priority: 'low' })), [{ priority: 'low' }], ['texte'], [{ id: h.ids.ampoule, priority: 2 }], [{ id: h.ids.ampoule, due_date: 20261224 }]]) {
    assert.equal(rpcError(await c.tool('set_item_options', { list_id: h.ids.maison, items }))?.code, -32602, JSON.stringify(items).slice(0, 80));
  }
  assert.equal(rpcError(await c.tool('set_item_options', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, priority: 'low' }], name: 'X' }))?.code, -32602, 'argument inconnu');
  assert.deepEqual(row(h, h.ids.ampoule), before, 'rien n\'a changé');
  // 20 éléments : accepté
  assert.equal(data(await c.tool('set_item_options', { list_id: h.ids.maison, items: Array.from({ length: OPTIONS_MAX }, () => ({ id: h.ids.ampoule, priority: 'low' })) })).updated, 1, 'le même identifiant compte une fois');
});

test('set_item_options : droits (connexion en lecture seule, compte lecteur, liste d\'un autre, hors connexion), option désactivée, date invalide, élément d\'une autre liste', async (t) => {
  const { h, c } = await writer(t);
  const before = row(h, h.ids.ampoule);
  const ask = (client, listId, items) => client.tool('set_item_options', { list_id: listId, items });
  const one = [{ id: h.ids.ampoule, priority: 'low' }];
  // Connexion en lecture seule
  separateApp(h);
  const readOnly = claude(h, (await connect(h, h.guillaume, PASSWORD)).access_token);
  assert.equal(toolError(await ask(readOnly, h.ids.maison, one)), READ_ONLY_GRANT);
  // Liste d'un autre compte, liste inconnue, liste hors de la connexion : « Liste introuvable. »
  assert.equal(toolError(await ask(c, h.ids.perso, one)), LIST_NOT_FOUND);
  assert.equal(toolError(await ask(c, uuid(), one)), LIST_NOT_FOUND);
  separateApp(h);
  const limited = claude(h, (await connect(h, h.guillaume, PASSWORD, write({ lists: [h.ids.courses] }))).access_token);
  assert.equal(toolError(await ask(limited, h.ids.maison, one)), LIST_NOT_FOUND);
  // Marie : lectrice de « Maison », puis « Peut modifier »
  const access = (value) => h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/members`, { userIds: [h.marieId], access: { [h.marieId]: value } });
  await access('lecture');
  const marie = claude(h, (await connect(h, h.marie, MARIE_PASSWORD, write())).access_token);
  assert.equal(toolError(await ask(marie, h.ids.maison, one)), READ_ONLY);
  assert.deepEqual(row(h, h.ids.ampoule), before);
  await access('modification');
  assert.equal(data(await ask(marie, h.ids.maison, one)).updated, 1, 'contributrice : permis');
  // Option désactivée, type de liste, date ou valeur invalide : appel entier refusé, rien n'est écrit
  const secretItem = data(await c.tool('add_items', { list_id: h.ids.secret, items: [{ name: 'Tâche' }] })).results[0].id;
  const mid = row(h, h.ids.ampoule);
  for (const [listId, items, message] of [
    [h.ids.secret, [{ id: secretItem, priority: 'high' }], PRIORITY_OFF],
    [h.ids.secret, [{ id: secretItem, due_date: '2026-12-24' }], DUE_OFF],
    [h.ids.courses, [{ id: h.ids.lait, priority: 'high' }], PRIORITY_NOT_HERE],
    [h.ids.maison, [{ id: h.ids.ampoule, priority: 'high' }, { id: h.ids.ampoule, due_date: '2026-02-30' }], BAD_DUE],
    [h.ids.maison, [{ id: h.ids.ampoule, priority: 'urgent' }], BAD_PRIORITY],
  ]) {
    assert.equal(toolError(await ask(c, listId, items)), message, JSON.stringify(items));
  }
  assert.deepEqual(row(h, h.ids.ampoule), mid);
  // Élément d'une autre liste, inconnu ou supprimé : même réponse, ignoré
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.delete', itemId: secretItem }] });
  const unknownId = uuid();
  const res = data(await ask(c, h.ids.maison, [{ id: h.ids.lait, priority: 'high' }, { id: unknownId, priority: 'high' }, { id: secretItem, priority: 'high' }]));
  assert.deepEqual(res.results.map((r) => [r.status, r.reason]), Array(3).fill(['ignored', 'élément introuvable dans cette liste']));
  assert.equal(row(h, h.ids.lait).priority, 'normal');
});

test(`set_item_options : plafond de ${OPTIONS_PER_HOUR} réglages par heure et par connexion (heure glissante), propre à l'outil`, async (t) => {
  const { h, tokens } = await writer(t);
  let c = claude(h, tokens.access_token);
  const ids = data(await c.tool('add_items', { list_id: h.ids.maison, items: Array.from({ length: OPTIONS_MAX }, (_, i) => ({ name: `Case ${i}` })) })).results.map((r) => r.id);
  const set = (priority, list = ids) => c.tool('set_item_options', { list_id: h.ids.maison, items: list.map((id) => ({ id, priority })) });
  let state = 'normal';
  const rounds = async (n) => {
    for (let i = 0; i < n; i++) {
      state = state === 'high' ? 'low' : 'high';
      assert.equal(data(await set(state)).updated, OPTIONS_MAX);
    }
  };
  await rounds(5);
  h.app.clock.now += 30 * MINUTE;
  await rounds(10); // 300
  assert.deepEqual([data(await set(state)).updated, data(await set(state)).unchanged], [0, OPTIONS_MAX], 'inchangés : ne comptent pas');
  const over = toolError(await set(state === 'high' ? 'low' : 'high', [ids[0]]));
  assert.match(over, /^Plafond atteint : 300 réglages par heure et par connexion \(encore 0 possibles\)/);
  assert.equal(row(h, ids[0]).priority, state, 'rien n\'est écrit');
  // Les autres outils ont leurs propres plafonds
  assert.equal(data(await c.tool('set_checked', { list_id: h.ids.maison, item_ids: [ids[0]], checked: true })).changed, 1);
  // Une heure après les premiers : de la place de nouveau (même connexion :
  // jeton renouvelé, l'accès ne vit qu'une heure)
  h.app.clock.now += 31 * MINUTE;
  const renewed = await fetch(`${h.app.base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: tokens.clientId }) });
  c = claude(h, (await renewed.json()).access_token);
  assert.equal(data(await set(state === 'high' ? 'low' : 'high', ids.slice(0, 5))).updated, 5);
});

test('journal : outil, compteurs et identifiants seulement, jamais le contenu (nom, priorité, date)', async (t) => {
  const { h, c } = await writer(t);
  const start = h.app.logs.length;
  await c.tool('set_item_options', { list_id: h.ids.maison, items: [{ id: h.ids.ampoule, priority: 'low', due_date: '2026-12-24' }] });
  await c.tool('add_items', { list_id: h.ids.maison, items: [{ name: 'Tournevis secret', priority: 'high', due_date: '2027-03-15' }] });
  const lines = h.app.logs.slice(start).filter((l) => /claude\.outil/.test(l));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /outil="set_item_options"/);
  assert.match(lines[0], /modifies=1/);
  for (const line of lines) {
    for (const secret of ['Ampoule', 'Tournevis', '2026-12-24', '2027-03-15', 'low', 'high']) assert.equal(line.includes(secret), false, `${secret} : ${line}`);
  }
});

test('listes d\'envies : priorité seulement, jamais d\'échéance ; aucune donnée de réservation lue ni renvoyée ; le destinataire ne reçoit rien de plus', async (t) => {
  const h = await household(t);
  const paulId = await addUser(h.app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const paul = h.app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  const ids = { noel: uuid(), velo: uuid(), lampe: uuid() };
  await h.guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: ids.noel, name: 'Noël de Marie', listType: 'wishes', forUserId: h.marieId, priorityEnabled: true },
    { id: uuid(), type: 'item.create', listId: ids.noel, itemId: ids.velo, name: 'Vélo' },
  ] });
  await h.guillaume.request('PUT', `/api/lists/${ids.noel}/members`, { userIds: [h.marieId, paulId], access: { [h.marieId]: 'modification', [paulId]: 'modification' } });
  assert.equal((await paul.post(`/api/items/${ids.velo}/reservation`, { open: true })).status, 200);
  const marieView = async () => ({ list: (await h.marie.get(`/api/lists/${ids.noel}`)).text.replace(/"updatedAt":"[^"]*"|"lastActivity":"[^"]*"/g, ''), sync: (await h.marie.get('/api/sync')).body.reservations });
  const marieBefore = await marieView();
  const c = claude(h, (await connect(h, h.guillaume, PASSWORD, write())).access_token);
  // Ajout avec priorité (permis), avec échéance (refusé, même si un ancien réglage d'échéance traîne)
  h.app.db.prepare('UPDATE lists SET due_enabled = 1 WHERE id = ?').run(ids.noel);
  assert.equal(toolError(await c.tool('add_items', { list_id: ids.noel, items: [{ name: 'Lampe', due_date: '2026-12-24' }] })), DUE_NOT_HERE);
  const added = data(await c.tool('add_items', { list_id: ids.noel, items: [{ name: 'Lampe', priority: 'high', price: 35 }] }));
  assert.equal(row(h, added.results[0].id).priority, 'high');
  // Réglage d'un souhait réservé : priorité seulement ; réponse sans aucune réservation
  assert.equal(toolError(await c.tool('set_item_options', { list_id: ids.noel, items: [{ id: ids.velo, due_date: '2026-12-24' }] })), DUE_NOT_HERE);
  const res = await c.tool('set_item_options', { list_id: ids.noel, items: [{ id: ids.velo, priority: 'high' }] });
  assert.deepEqual(data(res).results, [{ id: ids.velo, status: 'updated', priority: 'high' }]);
  assert.doesNotMatch(JSON.stringify(res.body), /reserv|particip|Paul|open|due_date/i);
  // La réservation est intacte ; la destinataire voit la priorité, et rien de la réservation
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservations WHERE item_id = ?').pluck().get(ids.velo), 1);
  const marieAfter = await marieView();
  assert.deepEqual(marieAfter.sync, marieBefore.sync);
  assert.equal(marieAfter.sync?.[ids.noel], undefined, 'aucune réservation pour la destinataire');
  assert.doesNotMatch(marieAfter.list, /reserv|particip/i); // (Paul y figure seulement comme membre de la liste)
  // Le code de l'outil ne lit jamais les réservations
  assert.doesNotMatch(read('server/mcp-tools.js').replace(/\/\/.*$/gm, ''), /reservations|reservation_states|visitor_reservations/);
});

test('descriptions et instructions : ce que Claude peut faire, exactement ; read_list donne priorité et échéance', () => {
  const byName = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool]));
  assert.match(byName.read_list.description, /pour une liste de tâches, la priorité et l'échéance si elles sont activées ; pour une liste d'envies, la priorité si elle est activée/);
  assert.match(byName.add_items.description, /priority \(low, normal ou high\) pour une liste de tâches ou d'envies dont la priorité est activée ; due_date \(date AAAA-MM-JJ, sans heure\) pour une liste de tâches dont l'échéance est activée/);
  assert.match(byName.add_items.description, /l'appel entier est refusé et rien n'est ajouté/);
  assert.match(byName.add_items.description, /déjà dans la liste sans être coché \(il n'est pas modifié\)/);
  assert.deepEqual(Object.keys(byName.add_items.inputSchema.properties.items.items.properties), ['name', 'quantity', 'note', 'link', 'price', 'priority', 'due_date']);
  const options = byName.set_item_options;
  assert.match(options.description, /et rien d'autre \(ni nom, ni note, ni quantité, ni lien, ni prix, ni suppression\)/);
  assert.match(options.description, /Exige une connexion « Lecture et ajout » et le droit de modifier la liste\./);
  assert.deepEqual(Object.keys(options.inputSchema.properties.items.items.properties), ['id', 'priority', 'due_date']);
  assert.equal(options.inputSchema.properties.items.items.additionalProperties, false);
  assert.deepEqual(options.inputSchema.properties.items.items.properties.priority.enum, ['low', 'normal', 'high']);
  assert.match(INSTRUCTIONS, /« Lecture et ajout » : en plus, add_items, set_checked et set_item_options \(modification limitée à la priorité et à l'échéance\)/);
  assert.doesNotMatch(INSTRUCTIONS, /rien d'autre : ni suppression, ni modification/);
  // Écrans de l'application : autorisation et « Connexions Claude »
  assert.match(read('public/js/screens/claude-consent.js'), /Claude pourra lire vos listes, y ajouter des éléments, les cocher et régler leur priorité et leur échéance\. Jamais supprimer, renommer ni partager\./);
  assert.match(read('public/js/screens/claude-connections.js'), /y ajouter des éléments, les cocher et régler leur priorité et leur échéance/);
  assert.match(read('public/sw.js'), /const VERSION = `v6[4-9]-/);
});
