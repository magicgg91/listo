// « À offrir » (décisions du 23 novembre 2026) : la liste automatique de mes
// réservations et participations dans les listes d'envies, la case
// « Acheté » (privée, migration 39), la carte de Listes, la tuile de
// l'Accueil (sans bandeau du bas, sans défilement quand tout tient).
//
// Foyer : Guillaume (Admin, propriétaire), Léa (bénéficiaire de « Noël de
// Léa »), Marie et Paul (proches), Zoé (sans accès à la liste).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { emptyState, loadSync, mergeSync, applyOp, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { myGifts, computeGifts, recentGifts, hasGifts, recipientOf } from '../public/js/gifts.js';
import { contentFits, markFit } from '../public/js/scroll-lock.js';
import { matchRoute, pathFor, ROUTES } from '../public/js/router.js';
import { translate } from '../public/js/i18n.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans ses commentaires (les commentaires parlent des règles)
const code = (file) => read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

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
  const ids = { lea: uuid(), velo: uuid(), livre: uuid(), lampe: uuid(), courses: uuid(), lait: uuid(), lucas: uuid(), doudou: uuid() };
  const res = await ops(guillaume, [
    { type: 'list.create', listId: ids.lea, name: 'Noël de Léa', listType: 'wishes', forUserId: people.leaId },
    { type: 'item.create', listId: ids.lea, itemId: ids.velo, name: 'Vélo', priceCents: 24990 },
    { type: 'item.create', listId: ids.lea, itemId: ids.livre, name: 'Livre' },
    { type: 'item.create', listId: ids.lea, itemId: ids.lampe, name: 'Lampe' },
    { type: 'list.create', listId: ids.lucas, name: 'Anniversaire de Lucas', listType: 'wishes', forName: 'Lucas' },
    { type: 'item.create', listId: ids.lucas, itemId: ids.doudou, name: 'Doudou' },
    { type: 'list.create', listId: ids.courses, name: 'Courses', listType: 'shopping' },
    { type: 'item.create', listId: ids.courses, itemId: ids.lait, name: 'Lait' },
  ]);
  assert.ok(res.every((r) => r.status === 200), JSON.stringify(res));
  const share = (listId, access) => guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: Object.keys(access).map(Number), access });
  assert.equal((await share(ids.lea, { [people.leaId]: 'modification', [people.marieId]: 'modification', [people.paulId]: 'lecture' })).status, 200);
  assert.equal((await share(ids.lucas, { [people.marieId]: 'lecture' })).status, 200);
  assert.equal((await share(ids.courses, { [people.marieId]: 'modification' })).status, 200);
  const reserve = (client, itemId, body = {}) => client.post(`/api/items/${itemId}/reservation`, body);
  const bought = (client, itemId, value = true) => one(client, { type: 'gift.bought', itemId, bought: value });
  const sync = async (client) => (await client.get('/api/sync')).body;
  return { app, ...people, ops, one, ids, reserve, bought, sync };
}

// --- Base de données ---

test('migration 39 : table gift_bought (clé personne + souhait), effacée avec le compte, le souhait, et la participation (déclencheur)', () => {
  const db = openDatabase(':memory:');
  assert.equal(MIGRATIONS.length, 47);
  assert.equal(schemaVersion(db), 47);
  const columns = db.prepare('PRAGMA table_info(gift_bought)').all().map((c) => c.name);
  assert.deepEqual(columns, ['user_id', 'item_id', 'created_at']);
  db.prepare("INSERT INTO users (id, username, display_name, password_hash) VALUES (1, 'g', 'G', 'x'), (2, 'm', 'M', 'x')").run();
  db.prepare("INSERT INTO lists (id, name, type, owner_id, for_name) VALUES ('l', 'Envies', 'wishes', 1, 'Zoé')").run();
  db.prepare("INSERT INTO items (id, list_id, name, created_by) VALUES ('a', 'l', 'Vélo', 1), ('b', 'l', 'Livre', 1)").run();
  const now = '2026-11-23T10:00:00.000Z';
  for (const [item, user] of [['a', 1], ['a', 2], ['b', 1]]) {
    db.prepare('INSERT INTO reservations (item_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(item, user, now, now);
    db.prepare('INSERT INTO gift_bought (user_id, item_id, created_at) VALUES (?, ?, ?)').run(user, item, now);
  }
  assert.throws(() => db.prepare('INSERT INTO gift_bought (user_id, item_id, created_at) VALUES (1, ?, ?)').run('a', now), /UNIQUE|PRIMARY/);
  assert.throws(() => db.prepare('INSERT INTO gift_bought (user_id, item_id, created_at) VALUES (1, ?, ?)').run('inconnu', now), /FOREIGN KEY/);
  const count = () => db.prepare('SELECT COUNT(*) FROM gift_bought').pluck().get();
  // Fin de la participation : la marque part avec elle (et seulement la sienne)
  db.prepare("DELETE FROM reservations WHERE item_id = 'a' AND user_id = 2").run();
  assert.equal(count(), 2);
  // Souhait effacé : ses marques aussi
  db.prepare("DELETE FROM items WHERE id = 'b'").run();
  assert.equal(count(), 1);
  // Compte effacé : ses marques aussi (cascade)
  db.prepare("DELETE FROM reservations WHERE user_id = 1").run();
  assert.equal(count(), 0);
});

// --- Droits sur « Acheté » (gift.bought) ---

test('« Acheté » : seulement sur MA réservation ou participation en cours ; bénéficiaire, autre proche, non-membre, Admin : refus d\'un élément inconnu', async (t) => {
  const h = await household(t);
  assert.equal((await h.reserve(h.marie, h.ids.velo, { open: true })).status, 200);
  assert.equal((await h.reserve(h.paul, h.ids.velo)).status, 200);
  const unknown = { status: 404, code: 'ops.introuvable' };
  const refusal = (r) => ({ status: r.status, code: r.code });
  // Participants : oui, rejouable sans effet
  assert.equal((await h.bought(h.marie, h.ids.velo)).status, 200);
  assert.equal((await h.bought(h.marie, h.ids.velo)).status, 200);
  assert.equal((await h.bought(h.paul, h.ids.velo, false)).status, 200, 'décocher sans marque : sans effet');
  // Bénéficiaire (même réponse que sur un souhait jamais réservé), proche
  // qui ne participe pas (gestionnaire compris), non-membre, Admin non membre
  for (const [label, client, itemId] of [
    ['bénéficiaire, souhait réservé', h.lea, h.ids.velo],
    ['bénéficiaire, souhait libre', h.lea, h.ids.livre],
    ['gestionnaire qui ne participe pas', h.guillaume, h.ids.velo],
    ['proche, souhait libre', h.marie, h.ids.livre],
    ['non-membre', h.zoe, h.ids.velo],
    ['souhait inconnu', h.marie, uuid()],
    ['identifiant invalide', h.marie, 'pas-un-uuid'],
    ['élément d\'une liste de courses', h.marie, h.ids.lait],
  ]) {
    assert.deepEqual(refusal(await h.bought(client, itemId)), unknown, label);
    assert.deepEqual(refusal(await h.bought(client, itemId, false)), unknown, `${label} (décocher)`);
  }
  // Le bénéficiaire reçoit la même réponse quelle que soit la valeur envoyée
  assert.deepEqual(refusal(await h.one(h.lea, { type: 'gift.bought', itemId: h.ids.velo, bought: 'oui' })), unknown);
  // Valeur invalide pour un participant
  assert.deepEqual(refusal(await h.one(h.marie, { type: 'gift.bought', itemId: h.ids.velo, bought: 'oui' })), { status: 400, code: 'ops.valeurAcheteInvalide' });
  // Admin (Guillaume, propriétaire et gestionnaire) : rien de plus qu'un
  // autre compte tant qu'il ne participe pas
  assert.deepEqual(refusal(await h.bought(h.guillaume, h.ids.doudou)), unknown);
  // Réservation terminée : refus, et la marque est effacée
  assert.equal((await h.marie.del(`/api/items/${h.ids.velo}/reservation`)).status, 200);
  assert.deepEqual(refusal(await h.bought(h.marie, h.ids.velo)), unknown);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM gift_bought WHERE user_id = ?').pluck().get(h.marieId), 0);
  // Souhait supprimé : refus
  assert.equal((await h.reserve(h.marie, h.ids.lampe)).status, 200);
  assert.equal((await h.one(h.guillaume, { type: 'item.delete', itemId: h.ids.lampe })).status, 200);
  assert.deepEqual(refusal(await h.bought(h.marie, h.ids.lampe)), unknown);
});

test('« Acheté » : jamais dans le journal de sécurité, les nouveautés, la page Notifications ; aucune date de liste ni de souhait ne bouge', async (t) => {
  const h = await household(t);
  await h.reserve(h.marie, h.ids.velo);
  const stamps = () => h.app.db.prepare("SELECT (SELECT updated_at FROM lists WHERE id = ?) || '|' || (SELECT group_concat(updated_at) FROM items WHERE list_id = ?)").pluck().get(h.ids.lea, h.ids.lea);
  const before = { stamps: stamps(), events: h.app.db.prepare('SELECT COUNT(*) FROM list_events').pluck().get(), logs: h.app.logs.length, inbox: h.app.db.prepare('SELECT COUNT(*) FROM inbox').pluck().get() };
  assert.equal((await h.bought(h.marie, h.ids.velo)).status, 200);
  assert.equal((await h.bought(h.marie, h.ids.velo, false)).status, 200);
  assert.equal((await h.bought(h.marie, h.ids.velo)).status, 200);
  assert.deepEqual({ stamps: stamps(), events: h.app.db.prepare('SELECT COUNT(*) FROM list_events').pluck().get(), logs: h.app.logs.length, inbox: h.app.db.prepare('SELECT COUNT(*) FROM inbox').pluck().get() }, before);
  // Ni l'accès des assistants IA, ni la page publique ne lisent la table
  for (const file of ['server/mcp-tools.js', 'server/mcp.js', 'server/routes/public.js', 'server/shares.js', 'server/news.js', 'server/notify.js', 'server/inbox.js', 'server/audit.js']) {
    assert.doesNotMatch(read(file), /gift_bought|giftsFor|setBought/, file);
  }
  // Seul server/reservations.js lit ou écrit gift_bought (et la migration la crée)
  const users = fs.readdirSync(new URL('../server/', import.meta.url), { recursive: true })
    .filter((f) => f.endsWith('.js') && /gift_bought/.test(read(`server/${f}`)));
  assert.deepEqual(users.sort(), ['db.js', 'reservations.js']);
});

// --- Synchronisation ---

test('synchronisation : seulement MES dates de réservation et MES marques « Acheté » ; rien pour le bénéficiaire', async (t) => {
  const h = await household(t);
  const start = h.app.clock.now;
  const at = (hours) => new Date(start + hours * 3600 * 1000).toISOString();
  h.app.clock.now = start + 3600 * 1000;
  await h.reserve(h.marie, h.ids.velo, { open: true });
  h.app.clock.now = start + 2 * 3600 * 1000;
  await h.reserve(h.paul, h.ids.velo);
  h.app.clock.now = start + 3 * 3600 * 1000;
  await h.reserve(h.marie, h.ids.livre);
  await h.reserve(h.guillaume, h.ids.lampe);
  await h.reserve(h.marie, h.ids.doudou);
  assert.equal((await h.bought(h.marie, h.ids.velo)).status, 200);
  assert.equal((await h.bought(h.paul, h.ids.velo)).status, 200);
  assert.equal((await h.bought(h.guillaume, h.ids.lampe)).status, 200);
  const marie = (await h.sync(h.marie)).gifts;
  assert.deepEqual(Object.keys(marie.reservedAt).sort(), [h.ids.velo, h.ids.livre, h.ids.doudou].sort());
  assert.equal(marie.reservedAt[h.ids.velo], at(1));
  assert.deepEqual(marie.bought, [h.ids.velo]);
  const paul = (await h.sync(h.paul)).gifts;
  assert.deepEqual(paul, { reservedAt: { [h.ids.velo]: at(2) }, bought: [h.ids.velo] });
  const guillaume = (await h.sync(h.guillaume)).gifts;
  assert.deepEqual(guillaume, { reservedAt: { [h.ids.lampe]: at(3) }, bought: [h.ids.lampe] });
  // Bénéficiaire et personne sans réservation : rien
  assert.deepEqual((await h.sync(h.lea)).gifts, { reservedAt: {}, bought: [] });
  assert.deepEqual((await h.sync(h.zoe)).gifts, { reservedAt: {}, bought: [] });
  // Synchronisation « depuis » : les mêmes, en entier
  assert.deepEqual((await h.marie.get(`/api/sync?since=${encodeURIComponent(at(4))}`)).body.gifts, marie);
  // Les réservations des proches restent comme avant (sans date ni marque)
  const velo = (await h.sync(h.guillaume)).reservations[h.ids.lea].find((r) => r.itemId === h.ids.velo);
  assert.deepEqual(velo.participants.map((p) => Object.keys(p).sort()), [['displayName', 'userId'], ['displayName', 'userId']]);
});

test('copie locale : la liste « À offrir » sort d\'elle-même (réservation terminée, « Reçu », souhait ou liste supprimés) ; marque gardée hors ligne', async (t) => {
  const h = await household(t);
  await h.reserve(h.marie, h.ids.velo, { open: true });
  await h.reserve(h.paul, h.ids.velo);
  await h.reserve(h.marie, h.ids.livre);
  await h.reserve(h.marie, h.ids.lampe);
  await h.reserve(h.marie, h.ids.doudou);
  await h.bought(h.marie, h.ids.livre);
  const me = h.marieId;
  let state = loadSync(emptyState(), await h.sync(h.marie));
  const names = () => myGifts(state, me).map((g) => g.item.name).sort();
  assert.deepEqual(names(), ['Doudou', 'Lampe', 'Livre', 'Vélo']);
  assert.deepEqual(computeGifts(state, me).total, 4);
  assert.deepEqual(computeGifts(state, me).toBuy, 3);
  // Hors ligne : la marque s'applique tout de suite (même opération que la file)
  applyOp(state, { type: 'gift.bought', itemId: h.ids.velo, bought: true }, { user: { id: me }, now: new Date().toISOString() });
  assert.equal(computeGifts(state, me).toBuy, 2);
  // … et survit à la copie gardée sur le téléphone
  state = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state))));
  assert.equal(computeGifts(state, me).toBuy, 2);
  // Réservation terminée (je quitte), « Reçu », souhait supprimé, liste supprimée
  await h.marie.del(`/api/items/${h.ids.livre}/reservation`);
  assert.equal((await h.one(h.lea, { type: 'item.check', itemId: h.ids.velo, checked: true })).status, 200);
  assert.equal((await h.one(h.guillaume, { type: 'item.delete', itemId: h.ids.lampe })).status, 200);
  assert.equal((await h.one(h.guillaume, { type: 'list.delete', listId: h.ids.lucas })).status, 200);
  state = mergeSync(state, await h.sync(h.marie));
  assert.deepEqual(names(), []);
  assert.equal(hasGifts(state, me), false);
  // Synchronisation complète : pareil
  assert.deepEqual(myGifts(loadSync(emptyState(), await h.sync(h.marie)), me), []);
  // La marque de « Livre » a disparu avec la réservation
  assert.deepEqual((await h.sync(h.marie)).gifts.bought, []);
});

// --- Calculs du téléphone (gifts.js), avec des données d'exemple ---

function fixture() {
  const state = emptyState();
  const list = (id, name, extra) => state.lists.set(id, { id, name, type: 'wishes', ownerId: 1, forUserId: null, forName: null, isBeneficiary: false, members: [{ id: 1, displayName: 'Guillaume', isOwner: true }], ...extra });
  list('zoe', 'Noël de Zoé', { forUserId: 4, forDisplayName: 'Zoé' });
  list('lea', 'Anniversaire de Léa', { forUserId: 2, forDisplayName: 'Léa' });
  list('papa', 'Idées cadeaux papa', { forName: 'Papa' });
  list('mien', 'Mes envies', { isBeneficiary: true });
  state.lists.set('courses', { id: 'courses', name: 'Courses', type: 'shopping', ownerId: 1, members: [] });
  const item = (id, listId, name, extra = {}) => state.items.set(id, { id, listId, name, checked: false, deletedAt: null, ...extra });
  item('lego', 'zoe', 'Lego Technic grue', { priceCents: 4990 });
  item('pyjama', 'zoe', 'Pyjama licorne', { priceCents: 2400 });
  item('velo', 'zoe', 'Vélo');
  item('coffret', 'lea', 'Coffret aquarelle', { priceCents: 6000 });
  item('livre', 'lea', 'Livre « Le Petit Prince »');
  item('recu', 'lea', 'Parfum', { checked: true });
  item('casque', 'papa', 'Casque audio', { priceCents: 12900 });
  item('montre', 'mien', 'Montre');
  const me = { userId: 9, displayName: 'Guillaume' };
  const other = { userId: 3, displayName: 'Marie' };
  const visitor = { visitorId: 'v1', displayName: 'Tante Jo', viaLink: true };
  state.reservations = {
    zoe: [{ itemId: 'lego', participants: [me] }, { itemId: 'pyjama', participants: [me] }, { itemId: 'velo', participants: [other] }],
    lea: [{ itemId: 'coffret', open: true, participants: [other, me] }, { itemId: 'livre', participants: [visitor, me] }, { itemId: 'recu', participants: [me] }],
    papa: [{ itemId: 'casque', participants: [me] }],
    // (jamais envoyé par le serveur pour une liste dont je suis le bénéficiaire ; ignoré quand même)
    mien: [{ itemId: 'montre', participants: [me] }],
  };
  state.gifts = { reservedAt: { lego: '2026-11-22T09:00:00.000Z', pyjama: '2026-11-19T09:00:00.000Z', coffret: '2026-11-21T10:00:00.000Z', livre: '2026-11-18T09:00:00.000Z', casque: '2026-11-20T09:00:00.000Z' }, bought: new Set(['pyjama', 'livre']) };
  state.loaded = true;
  return { state, me: 9 };
}

test('calculs : un groupe par personne (par prénom), à acheter puis achetés, nombres ; jamais le reçu, ni une liste dont je suis le bénéficiaire', () => {
  const { state, me } = fixture();
  const { groups, total, toBuy } = computeGifts(state, me);
  assert.equal(total, 5);
  assert.equal(toBuy, 3);
  assert.deepEqual(groups.map((g) => g.name), ['Léa', 'Papa', 'Zoé']);
  assert.deepEqual(groups.map((g) => g.gifts.map((x) => [x.item.name, x.bought])), [
    [['Coffret aquarelle', false], ['Livre « Le Petit Prince »', true]],
    [['Casque audio', false]],
    [['Lego Technic grue', false], ['Pyjama licorne', true]],
  ]);
  // Ma part : seul (« Réservé ») ou à plusieurs (« Vous participez (2 personnes) »), visiteurs compris
  const coffret = groups[0].gifts[0];
  assert.equal(coffret.alone, false);
  assert.equal(coffret.people, 2);
  assert.equal(groups[0].gifts[1].people, 2, 'un visiteur du lien public compte');
  assert.equal(groups[1].gifts[0].alone, true);
  // À qui : compte (son nom), personne sans compte, « Moi » d'un autre (le propriétaire)
  assert.deepEqual(recipientOf(state.lists.get('papa')), { key: 'n:papa', name: 'Papa' });
  assert.deepEqual(recipientOf({ ownerId: 1, forUserId: null, forName: null, members: [{ id: 1, displayName: 'Guillaume' }] }), { key: 'u:1', name: 'Guillaume' });
  // Rien sans réservation
  assert.deepEqual(computeGifts(emptyState(), me), { groups: [], total: 0, toBuy: 0 });
  assert.equal(hasGifts(emptyState(), me), false);
  assert.equal(hasGifts(state, me), true);
  // Tout acheté : plus rien à acheter, la liste reste
  for (const id of ['lego', 'coffret', 'casque']) state.gifts.bought.add(id);
  assert.equal(computeGifts(state, me).toBuy, 0);
  assert.deepEqual(recentGifts(state, me), []);
});

test('tuile de l\'Accueil : les trois derniers réservés pas encore achetés, du plus récent au plus ancien', () => {
  const { state, me } = fixture();
  assert.deepEqual(recentGifts(state, me).map((g) => g.item.name), ['Lego Technic grue', 'Coffret aquarelle', 'Casque audio']);
  assert.deepEqual(recentGifts(state, me, 1).map((g) => g.item.name), ['Lego Technic grue']);
  // Date pas encore connue (réservation toute neuve, avant la synchronisation) : à la fin
  delete state.gifts.reservedAt.casque;
  assert.equal(recentGifts(state, me).at(-1).item.name, 'Casque audio');
});

// --- Écrans ---

test('adresse : #/listes/a-offrir n\'est jamais prise pour l\'identifiant d\'une liste', () => {
  assert.deepEqual(matchRoute('#/listes/a-offrir'), { name: 'gifts', params: {} });
  assert.equal(pathFor('gifts'), '#/listes/a-offrir');
  const id = uuid();
  assert.deepEqual(matchRoute(`#/listes/${id}`), { name: 'list', params: { id } });
  const names = ROUTES.map((r) => r.name);
  assert.ok(names.indexOf('gifts') < names.indexOf('list'), 'déclarée avant /listes/:id');
  assert.match(read('public/js/app.js'), /case 'gifts': mount\(\(onLeave\) => renderGifts\(onLeave\)\); break;/);
});

test('page « À offrir » : ni barre d\'ajout ni menu ; case « Acheté » (aria-pressed) par la file d\'attente ; la ligne ouvre le souhait dans sa liste', () => {
  const screen = code('public/js/screens/gifts.js');
  assert.doesNotMatch(screen, /innerHTML|\.focus\(|addbar|openMenu|list-actions|listActions|api\.js|fetch\(/);
  assert.match(screen, /'aria-pressed': String\(bought\),/);
  assert.match(screen, /'aria-label': t\('offrir\.achete\.nom', \{ name: item\.name \}\),/);
  assert.match(screen, /onClick: \(\) => actions\.setGiftBought\(item\.id, !bought\),/);
  assert.match(screen, /app\.openItem = \{ listId: gift\.list\.id, itemId: gift\.item\.id \};\s*navigate\('list', \{ id: gift\.list\.id \}\);/);
  // Coché ET barré (classe du kit), jamais la couleur seule
  assert.match(screen, /h\('li', \{ class: `item\$\{bought \? ' is-done' : ''\}`/);
  assert.match(read('public/js/actions.js'), /export const setGiftBought = \(itemId, bought\) => perform\(\{ type: 'gift\.bought', itemId, bought \}\);/);
  // Téléphone : bandeau du bas avec « Listes » marqué ; ordinateur : Envies mis en avant
  assert.match(read('public/js/tabbar.js'), /const TAB_OF = \{ gifts: 'lists' \};/);
  assert.match(read('public/js/app.js'), /tabBar\(\)\.select\(tabOf\(app\.route\.name\)\);/);
  const side = code('public/js/screens/pc-side.js');
  assert.match(side, /const LIST_SCREENS = \['lists', 'list', 'editList', 'newList', 'gifts'\];/);
  assert.match(side, /\(selected\.name === 'gifts' && type === 'wishes'\)/);
});

test('carte « À offrir » de Listes : seulement avec des réservations, en tête des envies, sans menu ni personnes ; pas comptée parmi les listes', () => {
  const lists = code('public/js/screens/lists.js');
  const card = lists.slice(lists.indexOf('export function giftsCard'), lists.indexOf('function emptyLists'));
  assert.match(card, /if \(!total\) return null;/);
  assert.doesNotMatch(card, /list-card__menu|avatar|listActions|publicLink/);
  assert.match(card, /class: 'card list-card list-card--auto'/);
  assert.match(card, /progressText\(toBuy, total\)/);
  // Téléphone : sous « Toutes » et « Envies », en premier, hors recherche
  assert.match(lists, /const gifts = type === 'all' \|\| type === 'wishes' \? giftsCard\(\) : null;/);
  // Ordinateur : en tête des Envies, hors recherche
  assert.match(lists, /listType === 'wishes' && !searching \? giftsCard\(\) : null,/);
  // Une vue, pas une liste : les nombres de listes (tuile Listes, Types) ne la comptent pas
  assert.doesNotMatch(code('public/js/store.js'), /myGifts|computeGifts/);
  assert.equal(translate('fr', 'offrir.carte.compte', { count: 3, total: 5 }), '3 cadeaux à acheter sur 5');
  assert.equal(translate('en', 'offrir.carte.compte', { count: 1, total: 5 }), '1 gift to buy out of 5');
});

test('Accueil : tuile « À offrir » (toute la largeur, après Échéances et Listes), cachée sans réservation ; « Tout est acheté » ; pas de « Voir tout »', () => {
  const home = code('public/js/screens/home.js');
  const tile = home.slice(home.indexOf('function giftsTile'), home.indexOf('function accountTile'));
  assert.match(tile, /if \(!total\) return null;/);
  assert.match(tile, /const recent = recentGifts\(app\.data, app\.user\.id, 3\);/);
  assert.match(tile, /tile\(t\('offrir\.titre'\), 'gift', \(\) => navigate\('gifts'\)/, 'le titre ouvre la page');
  assert.match(tile, /emptyText\(t\('offrir\.tuile\.toutAchete'\)\)/);
  // Toujours toute la largeur du téléphone (WIDE_TILES, posé par tileLayout :
  // test/home-tiles.test.js ; « Projets » aussi, depuis le 25 novembre 2026)
  assert.match(read('public/js/home-tiles.js'), /export const WIDE_TILES = \['gifts', 'projects'\];/);
  assert.match(home, /present\.forEach\(\(\[, el\], i\) => el\.classList\.toggle\('tile--wide', layout\[i\]\.wide\)\);/);
  assert.doesNotMatch(tile, /voirTout|Voir tout/);
  assert.equal(Object.keys(fr).some((k) => /voirTout/i.test(k)), false);
  assert.match(read('public/css/listo.css'), /\.tile--wide \{ grid-column: 1 \/ -1; \}\n\.app--pc \.tile--wide \{ grid-column: auto; \}/);
  assert.equal(translate('fr', 'offrir.tuile.participe', { name: 'Léa', count: 2 }), 'Pour Léa · vous participez (2 personnes)');
  assert.equal(translate('fr', 'offrir.tuile.lu', { count: 3 }), 'À offrir, 3 cadeaux à acheter');
  assert.equal(translate('en', 'offrir.tuile.participe', { name: 'Léa', count: 2 }), 'For Léa · you\'re chipping in (2 people)');
});

test('Accueil : rien ne défile quand tout tient (classe posée et retirée selon la mesure), seulement sur l\'Accueil', () => {
  assert.equal(contentFits(700, 742), true);
  assert.equal(contentFits(743, 742), true, '1 px de marge (arrondis)');
  assert.equal(contentFits(760, 742), false);
  // Seule la marge du bas dépasse (12 px de vide) : tout tient, pas de défilement
  assert.equal(contentFits(754, 742, 12), true);
  assert.equal(contentFits(760, 742, 12), false);
  const classes = new Set();
  const el = { scrollHeight: 600, clientHeight: 742, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } };
  assert.equal(markFit(el), true);
  assert.ok(classes.has('scroll--fits'));
  el.scrollHeight = 900; // une tuile de plus, petit téléphone
  assert.equal(markFit(el), false);
  assert.equal(classes.has('scroll--fits'), false);
  const css = read('public/css/listo.css');
  assert.match(css, /\.home-scroll \{ overscroll-behavior: none; \}\n\.home-scroll\.scroll--fits \{ overflow-y: hidden; \}/);
  const home = code('public/js/screens/home.js');
  assert.match(home, /const content = h\('div', \{ class: 'scroll home-scroll' \}, tiles\);/);
  assert.match(home, /const fit = lockWhenFits\(content, tiles\);\s*onLeave\(fit\.stop\);/);
  // Aucun autre écran ne s'en sert
  for (const file of fs.readdirSync(new URL('../public/js/screens/', import.meta.url))) {
    if (file !== 'home.js') assert.doesNotMatch(read(`public/js/screens/${file}`), /home-scroll|lockWhenFits|scroll--fits/, file);
  }
});

test('textes : français et anglais (À offrir / To give, Automatique / Automatic, Acheté / Bought…)', () => {
  const pairs = {
    'offrir.titre': ['À offrir', 'To give'],
    'offrir.automatique': ['Automatique', 'Automatic'],
    'offrir.tuile.toutAchete': ['Tout est acheté', 'All bought'],
  };
  for (const [key, [french, english]] of Object.entries(pairs)) {
    assert.equal(fr[key], french, key);
    assert.equal(en[key], english, key);
  }
  assert.equal(translate('fr', 'offrir.achete.nom', { name: 'Vélo' }), 'Acheté : Vélo');
  assert.equal(translate('en', 'offrir.achete.nom', { name: 'Bike' }), 'Bought: Bike');
  assert.equal(translate('fr', 'regles.envies.pour', { name: 'Zoé' }), 'Pour Zoé');
  assert.equal(translate('en', 'regles.envies.pour', { name: 'Zoé' }), 'For Zoé');
  assert.equal(translate('fr', 'offrir.resume', { gifts: translate('fr', 'offrir.cadeaux', { count: 5 }), count: 3 }), '5 cadeaux · 3 à acheter');
  assert.equal(translate('en', 'offrir.resume', { gifts: translate('en', 'offrir.cadeaux', { count: 5 }), count: 3 }), '5 gifts · 3 to buy');
  assert.equal(translate('fr', 'offrir.ligne.participe', { list: 'Anniversaire de Léa', count: 2 }), 'Anniversaire de Léa · Vous participez (2 personnes)');
  assert.equal(translate('en', 'offrir.ligne.participe', { list: 'Léa\'s birthday', count: 2 }), 'Léa\'s birthday · You\'re chipping in (2 people)');
  assert.equal(translate('en', 'offrir.ligne.reserve', { list: 'Zoé\'s Christmas' }), 'Zoé\'s Christmas · Reserved');
});
