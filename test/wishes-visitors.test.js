// Partie B : un visiteur sans compte, par le lien public d'une liste
// d'envies, réserve un souhait libre (fermé), participe à une cotisation
// ouverte et annule SA participation. Première écriture sans compte de
// Listo : sécurité d'abord.
//
// Foyer : Guillaume (Admin, propriétaire, gestionnaire), Léa (destinataire),
// Marie (« Peut modifier »), Paul (« Lecture seule »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { emptyState, loadSync, toSnapshot } from '../public/js/store.js';
import { dropOrphanStates } from '../server/db.js';
import { ALREADY, ALREADY_IN, RECEIVED, NOT_FOUND, NOT_IN, BAD_FIRST_NAME, VISITOR_LIMIT, ITEM_FULL, LINK_FULL } from '../server/reservations.js';

const uuid = () => crypto.randomUUID();
const HOUR = 60 * 60 * 1000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
let ipCounter = 10;

async function household(t, options = {}) {
  const app = await startTestApp(t, options);
  const guillaume = await setupAdmin(app);
  const people = { guillaume, guillaumeId: 1 };
  for (const name of ['lea', 'marie', 'paul']) {
    people[`${name}Id`] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name[0].toUpperCase() + name.slice(1), people[`${name}Id`]);
    people[name] = app.client();
    await login(people[name], name, `MotDePasse-${name}`);
  }
  const ids = { noel: uuid(), moi: uuid(), courses: uuid(), velo: uuid(), livre: uuid(), lampe: uuid(), jeu: uuid(), autre: uuid(), lait: uuid() };
  const ops = (client, list) => client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
  const res = await ops(guillaume, [
    { type: 'list.create', listId: ids.noel, name: 'Noël de Léa', listType: 'wishes', forUserId: people.leaId, priorityEnabled: true },
    { type: 'item.create', listId: ids.noel, itemId: ids.velo, name: 'Vélo', priceCents: 24990 },
    { type: 'item.create', listId: ids.noel, itemId: ids.livre, name: 'Livre' },
    { type: 'item.check', itemId: ids.livre, checked: true },
    { type: 'item.create', listId: ids.noel, itemId: ids.lampe, name: 'Lampe' },
    { type: 'item.create', listId: ids.noel, itemId: ids.jeu, name: 'Jeu' },
    { type: 'list.create', listId: ids.moi, name: 'Mes envies', listType: 'wishes' },
    { type: 'item.create', listId: ids.moi, itemId: ids.autre, name: 'Montre' },
    { type: 'list.create', listId: ids.courses, name: 'Courses', listType: 'shopping' },
    { type: 'item.create', listId: ids.courses, itemId: ids.lait, name: 'Lait', aisleId: 4 },
  ]);
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  const access = { [people.leaId]: 'modification', [people.marieId]: 'modification', [people.paulId]: 'lecture' };
  assert.equal((await guillaume.request('PUT', `/api/lists/${ids.noel}/members`, { userIds: Object.keys(access).map(Number), access })).status, 200);
  const link = async (listId = ids.noel, body = {}) => {
    const r = await guillaume.request('PUT', `/api/lists/${listId}/share`, body);
    assert.equal(r.status, 201, r.text);
    return { share: r.body.share, token: r.body.share.url.split('/p/')[1] };
  };
  // Un visiteur : son propre navigateur (cookies), sa propre adresse IP
  const visitor = () => createClient(app.base, { ip: `203.0.113.${ipCounter++}` });
  const act = (client, token, itemId, method = 'POST', firstName = 'Tante Jo') => client.request(method, `/api/public/${token}/souhaits/${itemId}`, method === 'POST' ? { firstName } : undefined);
  const view = async (client, token) => (await client.get(`/api/public/${token}`)).body;
  const wish = async (client, token, name) => {
    const body = await view(client, token);
    return [...body.groups.flatMap((g) => g.items), ...body.done].find((i) => i.name === name);
  };
  const reservationsOf = async (client) => (await client.get('/api/sync')).body.reservations?.[ids.noel];
  const stateOf = async (client, itemId) => (await reservationsOf(client))?.find((r) => r.itemId === itemId) ?? null;
  return { app, ...people, ids, link, visitor, act, view, wish, reservationsOf, stateOf };
}

test('visiteur : réserver (toujours fermé), un autre ne peut pas ; le gestionnaire ouvre ; participer ; un compte rejoint seulement si c\'est ouvert ; le dernier qui part libère', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  const [jo, max] = [h.visitor(), h.visitor()];
  // Libre
  assert.deepEqual(await h.wish(jo, token, 'Vélo'), { name: 'Vélo', note: '', checked: false, photo: null, priority: 'normal', priceCents: 24990, id: h.ids.velo, reservation: 'free', mine: false });
  // Jo réserve : fermé
  const first = await h.act(jo, token, h.ids.velo, 'POST', 'Tante Jo');
  assert.equal(first.status, 200, first.text);
  assert.equal(first.setCookies.length, 1);
  assert.deepEqual((await h.wish(jo, token, 'Vélo')).reservation, 'reserved');
  assert.equal((await h.wish(jo, token, 'Vélo')).mine, true);
  assert.deepEqual([(await h.wish(max, token, 'Vélo')).reservation, (await h.wish(max, token, 'Vélo')).mine], ['reserved', false]);
  // Max ne peut pas : fermé
  const refused = await h.act(max, token, h.ids.velo, 'POST', 'Oncle Max');
  assert.deepEqual([refused.status, refused.body.error], [409, ALREADY]);
  // Jo ne peut pas participer deux fois
  assert.deepEqual((await h.act(jo, token, h.ids.velo)).body.error, ALREADY_IN);
  // Un compte ne rejoint pas une réservation fermée d'un visiteur
  assert.deepEqual((await h.marie.post(`/api/items/${h.ids.velo}/reservation`, {})).body.error, ALREADY);
  // Les proches voient le visiteur, marqué « lien public » ; le gestionnaire ouvre (il n'y a que des visiteurs)
  assert.deepEqual(await h.stateOf(h.marie, h.ids.velo), { itemId: h.ids.velo, open: false, participants: [{ visitorId: 'v1', displayName: 'Tante Jo', viaLink: true }] });
  assert.equal((await h.guillaume.request('PATCH', `/api/items/${h.ids.velo}/reservation`, { open: true })).status, 200);
  assert.equal((await h.wish(max, token, 'Vélo')).reservation, 'open');
  // Max puis Marie participent (dans l'ordre d'arrivée)
  h.app.clock.now += 1000;
  assert.equal((await h.act(max, token, h.ids.velo, 'POST', 'Oncle Max')).status, 200);
  h.app.clock.now += 1000;
  assert.equal((await h.marie.post(`/api/items/${h.ids.velo}/reservation`, {})).status, 200);
  assert.deepEqual((await h.stateOf(h.paul, h.ids.velo)).participants.map((p) => p.displayName), ['Tante Jo', 'Oncle Max', 'Marie']);
  // Chacun ne voit que « ouvert » et « le mien » : ni prénom, ni nombre, ni identifiant d'un autre
  for (const [client, mine] of [[jo, true], [max, true], [h.visitor(), false]]) {
    const body = await h.view(client, token);
    assert.deepEqual((await h.wish(client, token, 'Vélo')).reservation, 'open');
    assert.equal((await h.wish(client, token, 'Vélo')).mine, mine);
    assert.doesNotMatch(JSON.stringify(body), /Tante|Oncle|Marie|Paul|participants|visitorId|"v\d|count/);
  }
  // Annuler : chacun la sienne ; le dernier qui part libère (comptes ET visiteurs)
  assert.equal((await h.act(jo, token, h.ids.velo, 'DELETE')).status, 200);
  assert.equal((await h.act(max, token, h.ids.velo, 'DELETE')).status, 200);
  assert.equal((await h.wish(jo, token, 'Vélo')).reservation, 'open', 'Marie y est encore');
  assert.equal((await h.marie.del(`/api/items/${h.ids.velo}/reservation`)).status, 200);
  assert.equal((await h.wish(jo, token, 'Vélo')).reservation, 'free');
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservation_states').pluck().get(), 0);
  // Une réservation de visiteur crée l'état fermé, même si un compte l'avait ouvert avant
  assert.equal((await h.act(jo, token, h.ids.velo)).status, 200);
  assert.equal(h.app.db.prepare('SELECT open FROM reservation_states WHERE item_id = ?').pluck().get(h.ids.velo), 0);
});

test('visiteur : il n\'annule que ses participations ; il ne peut ni ouvrir, ni fermer, ni retirer, ni libérer, ni agir sur un souhait reçu, supprimé ou d\'une autre liste', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  const [jo, max] = [h.visitor(), h.visitor()];
  assert.equal((await h.act(jo, token, h.ids.velo)).status, 200);
  // Max (son propre cookie) et un faux cookie : rien trouvé
  assert.deepEqual([(await h.act(max, token, h.ids.velo, 'DELETE')).status, (await h.act(max, token, h.ids.velo, 'DELETE')).body.error], [404, NOT_IN]);
  const forged = h.visitor();
  forged.jar.set('listo_visiteur_1', crypto.randomBytes(16).toString('base64url'));
  assert.equal((await h.act(forged, token, h.ids.velo, 'DELETE')).status, 404);
  forged.jar.set('listo_visiteur_1', 'pas-un-jeton');
  assert.equal((await h.act(forged, token, h.ids.velo, 'DELETE')).status, 404);
  assert.equal((await h.wish(jo, token, 'Vélo')).mine, true, 'la participation de Jo est intacte');
  // Aucune route pour ouvrir, fermer, retirer, libérer ou modifier
  for (const [method, path, body] of [['PATCH', `/souhaits/${h.ids.velo}`, { open: true }], ['PUT', `/souhaits/${h.ids.velo}`, {}], ['DELETE', `/souhaits/${h.ids.velo}/all`], ['DELETE', `/souhaits/${h.ids.velo}/visitors/v1`], ['POST', `/souhaits/${h.ids.velo}/reservation`, {}], ['POST', '/items', { name: 'x' }]]) {
    assert.equal((await jo.request(method, `/api/public/${token}${path}`, body)).status, 404, `${method} ${path}`);
  }
  // Reçu : ni réserver, ni annuler sa participation (même la sienne)
  assert.equal((await h.act(max, token, h.ids.lampe, 'POST', 'Oncle Max')).status, 200);
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.check', itemId: h.ids.lampe, checked: true }] });
  assert.deepEqual([(await h.act(max, token, h.ids.lampe, 'DELETE')).status, (await h.act(max, token, h.ids.lampe, 'DELETE')).body.error], [409, RECEIVED]);
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.check', itemId: h.ids.lampe, checked: false }] });
  assert.equal((await h.act(max, token, h.ids.lampe, 'DELETE')).status, 200);
  // Reçu, supprimé, d'une autre liste, identifiant invalide
  assert.deepEqual([(await h.act(jo, token, h.ids.livre)).status, (await h.act(jo, token, h.ids.livre)).body.error], [409, RECEIVED]);
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.delete', itemId: h.ids.lampe }] });
  for (const id of [h.ids.lampe, h.ids.autre, h.ids.lait, uuid(), 'pas-un-uuid']) {
    const r = await h.act(jo, token, id);
    assert.deepEqual([r.status, r.body.error], [404, NOT_FOUND], id);
  }
  // Le gestionnaire retire un visiteur et libère (les deux tables)
  assert.equal((await h.act(max, token, h.ids.jeu, 'POST', 'Oncle Max')).status, 200);
  const jeu = await h.stateOf(h.guillaume, h.ids.jeu);
  assert.equal((await h.marie.del(`/api/items/${h.ids.jeu}/reservation/visitors/${jeu.participants[0].visitorId}`)).status, 403, 'pas gestionnaire');
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.jeu}/reservation/visitors/${jeu.participants[0].visitorId}`)).status, 200);
  assert.equal(await h.stateOf(h.guillaume, h.ids.jeu), null, 'plus personne : libre');
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.jeu}/reservation/visitors/v999`)).status, 404);
  await h.guillaume.request('PATCH', `/api/items/${h.ids.velo}/reservation`, { open: true });
  await h.act(max, token, h.ids.velo, 'POST', 'Oncle Max');
  await h.marie.post(`/api/items/${h.ids.velo}/reservation`, {});
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.velo}/reservation/all`)).status, 200);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM visitor_reservations').pluck().get(), 0);
  assert.equal((await h.wish(jo, token, 'Vélo')).reservation, 'free');
});

test('prénom obligatoire (1 à 40 caractères, texte simple) ; JSON seulement ; origine contrôlée', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  const jo = h.visitor();
  for (const firstName of [undefined, '', '   ', 'x'.repeat(41), 'Jo\u0000', 'Jo\u0085', 'Jo\u202e', 'Jo\u200b', 'Jo\u2066', 42, { a: 1 }]) {
    const r = await jo.request('POST', `/api/public/${token}/souhaits/${h.ids.velo}`, { firstName });
    assert.deepEqual([r.status, r.body.error], [400, BAD_FIRST_NAME], JSON.stringify(firstName));
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM visitor_reservations').pluck().get(), 0, 'rien enregistré');
  assert.equal((await jo.request('POST', `/api/public/${token}/souhaits/${h.ids.velo}`, { firstName: `  ${'é'.repeat(40)}  ` })).status, 200);
  assert.equal(h.app.db.prepare('SELECT first_name FROM visitor_reservations').pluck().get(), 'é'.repeat(40));
  // Espaces fusionnés, NFC ; un émoji composé (liant U+200D) est permis
  assert.equal((await jo.request('POST', `/api/public/${token}/souhaits/${h.ids.jeu}`, { firstName: ' Tante\n\t Jo 👩\u200d👧 ' })).status, 200);
  assert.ok(h.app.db.prepare('SELECT first_name FROM visitor_reservations').pluck().all().includes('Tante Jo 👩\u200d👧'));
  // Pas en JSON : refusé
  const plain = await fetch(`${h.app.base}/api/public/${token}/souhaits/${h.ids.lampe}`, { method: 'POST', headers: { origin: h.app.ctx.config.publicUrl, 'content-type': 'text/plain', 'x-forwarded-for': '203.0.113.200' }, body: 'firstName=Jo' });
  assert.equal(plain.status, 415);
  // Autre site (pas d'en-tête Origin de Listo) : refusé
  const foreign = createClient(h.app.base, { origin: 'https://evil.example', ip: '203.0.113.201' });
  assert.equal((await h.act(foreign, token, h.ids.lampe)).status, 403);
  const none = createClient(h.app.base, { origin: null, ip: '203.0.113.202' });
  assert.equal((await h.act(none, token, h.ids.lampe)).status, 403);
});

test('lien protégé, expiré, arrêté, liste supprimée : actions refusées comme un lien inconnu ; les participations restent, le gestionnaire les gère', async (t) => {
  const h = await household(t);
  const unknown = await h.act(h.visitor(), crypto.randomBytes(32).toString('base64url'), h.ids.velo);
  assert.equal(unknown.status, 404);
  // Mot de passe
  const { share, token } = await h.link(h.ids.noel, { protect: true, durationHours: 2 });
  const jo = h.visitor();
  assert.equal((await h.act(jo, token, h.ids.velo)).status, 401);
  assert.equal((await jo.post(`/api/public/${token}/acces`, { password: share.password })).status, 200);
  assert.equal((await h.act(jo, token, h.ids.velo)).status, 200);
  // Expiré
  h.app.clock.now += 3 * HOUR;
  const expired = await h.act(jo, token, h.ids.velo, 'DELETE');
  assert.deepEqual([expired.status, expired.text], [unknown.status, unknown.text]);
  // La participation reste ; le gestionnaire la voit
  assert.deepEqual((await h.stateOf(h.guillaume, h.ids.velo)).participants.map((p) => p.displayName), ['Tante Jo']);
  // Lien arrêté
  await h.guillaume.del(`/api/lists/${h.ids.noel}/share`);
  const { token: second } = await h.link();
  const max = h.visitor();
  assert.equal((await h.act(max, second, h.ids.lampe, 'POST', 'Max')).status, 200);
  await h.guillaume.del(`/api/lists/${h.ids.noel}/share`);
  const stopped = await h.act(max, second, h.ids.lampe, 'DELETE');
  assert.deepEqual([stopped.status, stopped.text], [unknown.status, unknown.text]);
  assert.equal((await h.stateOf(h.marie, h.ids.lampe)).participants[0].displayName, 'Max');
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.lampe}/reservation/all`)).status, 200, 'le gestionnaire libère');
  // Liste supprimée
  const { token: third } = await h.link();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId: h.ids.noel }] });
  const gone = await h.act(h.visitor(), third, h.ids.jeu);
  assert.deepEqual([gone.status, gone.text], [unknown.status, unknown.text]);
  // Une autre liste qu'une liste d'envies : comme un lien inconnu
  const { token: shop } = await h.link(h.ids.courses);
  const notWishes = await h.act(h.visitor(), shop, h.ids.lait);
  assert.deepEqual([notWishes.status, notWishes.text], [unknown.status, unknown.text]);
});

test('course entre un compte et un visiteur : le premier gagne ; le second participe si c\'est ouvert, sinon « Déjà réservé. »', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  const jo = h.visitor();
  // Les deux en même temps sur un souhait libre (fermé) : un seul gagne
  const [a, b] = await Promise.all([h.act(jo, token, h.ids.velo), h.marie.post(`/api/items/${h.ids.velo}/reservation`, {})]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal((await h.stateOf(h.guillaume, h.ids.velo)).participants.length, 1);
  // Le compte d'abord, ouvert : le visiteur participe
  assert.equal((await h.marie.post(`/api/items/${h.ids.lampe}/reservation`, { open: true })).status, 200);
  assert.equal((await h.act(jo, token, h.ids.lampe)).status, 200);
  // Le compte d'abord, fermé : « Déjà réservé. »
  assert.equal((await h.paul.post(`/api/items/${h.ids.jeu}/reservation`, {})).status, 200);
  assert.deepEqual((await h.act(jo, token, h.ids.jeu)).body.error, ALREADY);
  // Le visiteur d'abord : le compte reçoit « Déjà réservé. » ; une fois ouvert, il participe
  await h.guillaume.request('PATCH', `/api/items/${h.ids.velo}/reservation`, { open: true });
  const late = await h.paul.post(`/api/items/${h.ids.velo}/reservation`, {});
  assert.equal(late.status, 200);
});

test('limites : 30 actions en 15 minutes par adresse IP ; 20 participations par visiteur ; 10 visiteurs par souhait ; 100 par lien', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  // Par adresse IP
  const busy = h.visitor();
  let last;
  for (let i = 0; i < 31; i++) last = await h.act(busy, token, h.ids.velo, i % 2 ? 'DELETE' : 'POST');
  assert.deepEqual([last.status, last.body.error], [429, 'Trop d\'actions en peu de temps. Réessayez dans quelques minutes.']);
  h.app.clock.now += 16 * 60 * 1000;
  assert.equal((await h.act(busy, token, h.ids.velo, 'DELETE')).status, 404, '15 minutes plus tard : de nouveau permis');
  // Par visiteur : 20 participations actives
  const many = Array.from({ length: 21 }, () => uuid());
  await h.guillaume.post('/api/ops', { ops: many.map((itemId, i) => ({ id: uuid(), type: 'item.create', listId: h.ids.noel, itemId, name: `Idée ${i}` })) });
  const greedy = h.visitor();
  for (const itemId of many.slice(0, 20)) assert.equal((await h.act(greedy, token, itemId)).status, 200);
  assert.deepEqual([(await h.act(greedy, token, many[20])).status, (await h.act(greedy, token, many[20])).body.error], [429, VISITOR_LIMIT]);
  // Par souhait : 10 visiteurs
  await h.marie.post(`/api/items/${h.ids.lampe}/reservation`, { open: true });
  for (let i = 0; i < 10; i++) assert.equal((await h.act(h.visitor(), token, h.ids.lampe, 'POST', `V${i}`)).status, 200);
  const eleventh = await h.act(h.visitor(), token, h.ids.lampe, 'POST', 'V10');
  assert.deepEqual([eleventh.status, eleventh.body.error], [409, ITEM_FULL]);
  assert.doesNotMatch(eleventh.body.error, /\d/, 'aucun nombre dans le message');
  // Par lien : 100 participations (vérifié avec une limite plus basse, mêmes règles)
  const svc = h.app.ctx.reservations;
  const hash = () => crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');
  const total = h.app.db.prepare('SELECT COUNT(*) FROM visitor_reservations').pluck().get();
  assert.throws(() => svc.visitorReserve(h.ids.noel, hash(), h.ids.jeu, 'Zoé', { perVisitor: 20, perItem: 10, perLink: total }), (err) => err.status === 409 && err.message === LINK_FULL);
  assert.equal(total, 30, '20 + 10 participations de visiteurs');
});

test('jeton du visiteur : 128 bits aléatoires, un cookie par lien (HttpOnly, SameSite=Lax, préfixe __Host- en production) ; jamais en clair en base ni dans les journaux', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  const jo = h.visitor();
  const r = await h.act(jo, token, h.ids.velo);
  const cookie = r.setCookies[0];
  assert.match(cookie, /^listo_visiteur_1=[A-Za-z0-9_-]{22}; Max-Age=\d+; Path=\/; Expires=[^;]+; HttpOnly; SameSite=Lax$/);
  const value = cookie.split(';')[0].split('=')[1];
  assert.equal(Buffer.from(value, 'base64url').length, 16, '128 bits');
  assert.equal(h.app.db.prepare('SELECT token_hash FROM visitor_reservations').pluck().get(), crypto.createHash('sha256').update(value).digest('hex'));
  // Deuxième action : le même cookie, pas de nouveau
  assert.equal((await h.act(jo, token, h.ids.lampe)).setCookies.length, 0);
  // Jamais en clair : ni dans aucune table, ni dans les journaux (aucune ligne pour une action de visiteur)
  for (const { name } of h.app.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    assert.ok(!JSON.stringify(h.app.db.prepare(`SELECT * FROM "${name}"`).all()).includes(value), name);
  }
  assert.ok(!h.app.logs.some((line) => line.includes(value) || /visiteur|souhaits\//i.test(line)), 'journal');
  // En production : __Host-, Secure, chemin /
  const prod = await household(t, { config: { production: true } });
  const { token: prodToken } = await prod.link();
  const p = await prod.act(prod.visitor(), prodToken, prod.ids.velo);
  assert.equal(p.status, 200, p.text);
  assert.match(p.setCookies[0], /^__Host-listo_visiteur_1=[A-Za-z0-9_-]{22}; Max-Age=\d+; Path=\/; Expires=[^;]+; HttpOnly; Secure; SameSite=Lax$/);
});

test('bénéficiaire reconnu par sa session (et propriétaire d\'une liste « Moi ») : réponse de la lecture seule, actions refusées comme un lien inconnu', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  const unknown = await h.act(h.visitor(), crypto.randomBytes(32).toString('base64url'), h.ids.velo);
  await h.act(h.visitor(), token, h.ids.velo);
  const lea = await h.lea.get(`/api/public/${token}`);
  assert.doesNotMatch(lea.text, /reservation|mine|canReserve|"id"/);
  for (const method of ['POST', 'DELETE']) {
    const r = await h.act(h.lea, token, h.ids.lampe, method);
    assert.deepEqual([r.status, r.text], [unknown.status, unknown.text], method);
  }
  // « Moi » : le propriétaire est le bénéficiaire
  const { token: mine } = await h.link(h.ids.moi);
  assert.doesNotMatch((await h.guillaume.get(`/api/public/${mine}`)).text, /reservation|mine|canReserve/);
  assert.equal((await h.act(h.guillaume, mine, h.ids.autre)).status, 404);
  // Les autres comptes (Marie) agissent comme des visiteurs
  assert.equal((await h.view(h.marie, mine)).list.canReserve, true);
  // Limite (dite clairement) : le bénéficiaire sans session voit quels souhaits sont réservés, jamais par qui
  const anonymous = await h.view(h.visitor(), token);
  assert.equal(anonymous.groups[0].items.find((i) => i.name === 'Vélo').reservation, 'reserved');
  assert.doesNotMatch(JSON.stringify(anonymous), /Tante/);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM visitor_reservations').pluck().get(), 1, 'rien écrit par Léa');
});

// Tout ce que reçoit un compte par l'API (corps et en-têtes, sauf la date), et sa copie locale
async function snapshotOf(client, listId, token) {
  const view = async (url) => {
    const res = await client.get(url);
    return { status: res.status, text: res.text, headers: Object.fromEntries([...res.headers].filter(([name]) => name !== 'date')) };
  };
  const since = '2026-10-16T11:00:00.000Z';
  const sync = (await client.get('/api/sync')).body;
  return {
    lists: await view('/api/lists'),
    list: await view(`/api/lists/${listId}`),
    sync: await view('/api/sync'),
    since: await view(`/api/sync?since=${encodeURIComponent(since)}`),
    me: await view('/api/me'),
    local: JSON.stringify(toSnapshot(loadSync(emptyState(), sync), '2026-10-16T12:00:00.000Z')),
    publicApi: await view(`/api/public/${token}`),
    publicPage: await view(`/p/${token}`),
  };
}

function rawStream(t, h, client) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const state = { raw: '' };
  state.ready = (async () => {
    const res = await fetch(`${h.app.base}/api/events`, { headers: { cookie: [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ') }, signal: controller.signal });
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

test('TEST FORT : ce que reçoit la destinataire (lecture, synchronisation, temps réel, copie locale, page publique avec sa session) est strictement identique avant et après chaque action de visiteur', async (t) => {
  const h = await household(t, { eventOptions: { keepaliveMs: 60 * 60 * 1000 } });
  const { token } = await h.link();
  const stream = rawStream(t, h, h.lea);
  const marieStream = rawStream(t, h, h.marie);
  await Promise.all([stream.ready, marieStream.ready]);
  await pause(150);
  const before = await snapshotOf(h.lea, h.ids.noel, token);
  const rawBefore = stream.raw;
  const stamps = () => h.app.db.prepare("SELECT (SELECT updated_at FROM lists WHERE id = ?) || '|' || (SELECT group_concat(updated_at) FROM items WHERE list_id = ?)").pluck().get(h.ids.noel, h.ids.noel);
  const stampsBefore = stamps();
  const events = h.app.db.prepare('SELECT COUNT(*) FROM list_events').pluck().get();
  const logs = h.app.logs.length;
  const [jo, max] = [h.visitor(), h.visitor()];
  let joId;
  const actions = [
    ['visiteur : réserver', () => h.act(jo, token, h.ids.velo)],
    ['gestionnaire : ouvrir', () => h.guillaume.request('PATCH', `/api/items/${h.ids.velo}/reservation`, { open: true })],
    ['visiteur : participer', () => h.act(max, token, h.ids.velo, 'POST', 'Oncle Max')],
    ['visiteur : quitter', () => h.act(max, token, h.ids.velo, 'DELETE')],
    ['gestionnaire : retirer un visiteur', async () => {
      joId = (await h.stateOf(h.guillaume, h.ids.velo)).participants[0].visitorId;
      return h.guillaume.del(`/api/items/${h.ids.velo}/reservation/visitors/${joId}`);
    }],
    ['visiteur : réserver de nouveau', () => h.act(jo, token, h.ids.lampe)],
    ['gestionnaire : libérer', () => h.guillaume.del(`/api/items/${h.ids.lampe}/reservation/all`)],
    ['visiteur : réserver un troisième', () => h.act(max, token, h.ids.jeu, 'POST', 'Oncle Max')],
  ];
  for (const [label, action] of actions) {
    assert.equal((await action()).status, 200, label);
    await pause(60);
    assert.deepEqual(await snapshotOf(h.lea, h.ids.noel, token), before, `${label} : rien de changé pour Léa`);
    assert.equal(stream.raw, rawBefore, `${label} : aucun octet de plus sur son flux temps réel`);
  }
  // Les proches, eux, ont été prévenus ; ni updated_at, ni nouveautés, ni journal
  assert.ok((marieStream.raw.match(/event: list/g) ?? []).length >= actions.length, marieStream.raw);
  assert.equal(stamps(), stampsBefore);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_events').pluck().get(), events);
  assert.equal(h.app.logs.length, logs, 'aucune ligne de journal');
});

test('écrans : visiteurs marqués « (lien public) » et retirés par le gestionnaire ; page publique : boutons, prénom gardé pour ce lien, annonces ; avertissement sur le destinataire', () => {
  const list = code('public/js/screens/list.js');
  assert.match(list, /const participantLabel = \(p\) => \(p\.viaLink \? `\$\{p\.displayName\} \(lien public\)` : p\.displayName\);/);
  assert.match(list, /p\.viaLink \? actions\.removeWishVisitor\(item\.id, p\.visitorId\) : actions\.removeWishParticipant\(item\.id, p\.userId\)/);
  assert.match(list, /mine \|\| manager \? openSwitch\(current\.open/);
  assert.match(read('public/js/actions.js'), /await del\(reservationUrl\(itemId, `\/visitors\/\$\{encodeURIComponent\(visitorId\)\}`\)\);/);
  const page = code('public/js/public.js');
  assert.match(page, /const NAME_KEY = `listo_prenom_\$\{token\}`;/);
  assert.match(page, /if \(!canReserve \|\| item\.checked \|\| !item\.id\) return null;/);
  for (const label of ['Je participe', 'Annuler', 'Réservé · ouvert à d\\\'autres', 'Participer', 'Réservé', 'Réserver']) assert.ok(page.includes(label), label);
  assert.match(page, /h\('div', \{ class: 'toast', role: 'status' \}/);
  assert.match(page, /document\.addEventListener\('visibilitychange', \(\) => \{/);
  assert.doesNotMatch(page, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(read('public/css/listo.css'), /\.btn--sm \{ min-height: var\(--tap-min\);/);
  const share = read('public/js/screens/share.js');
  assert.match(share, /ouvre ce lien sans être connectée à Listo, elle verra quels souhaits sont réservés \(jamais par qui\)\. Ne le lui donnez pas\./);
  assert.match(read('public/sw.js'), /const VERSION = `v(6[0-9]|[7-9]\d|\d{3,})-/);
});

// --- État « ouvert à d'autres » resté seul (correction avant fusion) ---
// reservation_states n'a de sens que si le souhait a au moins un participant.
// Supprimer un compte efface ses participations (ON DELETE CASCADE) : l'état
// doit disparaître avec la dernière, sinon le souhait paraîtrait « Réservé »
// aux visiteurs et le gestionnaire ne pourrait pas le libérer.
const statesCount = (h) => h.app.db.prepare('SELECT COUNT(*) FROM reservation_states').pluck().get();

test('compte participant supprimé (après avoir quitté la liste) : le souhait redevient libre partout, et un visiteur peut le réserver', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  // Paul réserve (ouvert), puis quitte la liste : sa participation reste (voulu)
  assert.equal((await h.paul.post(`/api/items/${h.ids.velo}/reservation`, { open: true })).status, 200);
  // Sur la lampe, Paul et un visiteur : elle restera réservée après la suppression de Paul
  assert.equal((await h.paul.post(`/api/items/${h.ids.lampe}/reservation`, { open: true })).status, 200);
  const jo = h.visitor();
  assert.equal((await h.act(jo, token, h.ids.lampe)).status, 200);
  assert.equal((await h.paul.post(`/api/lists/${h.ids.noel}/leave`)).status, 200);
  assert.equal((await h.wish(h.visitor(), token, 'Vélo')).reservation, 'open', 'Paul parti : toujours réservé');
  assert.deepEqual((await h.stateOf(h.marie, h.ids.velo)).participants, [{ userId: h.paulId, displayName: 'Paul' }]);
  // L'Admin supprime le compte de Paul (il n'a plus servi à rien : permis)
  assert.equal((await h.guillaume.del(`/api/admin/users/${h.paulId}`)).status, 204);
  // Vélo : aucun participant, aucun état resté seul
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservation_states WHERE item_id = ?').pluck().get(h.ids.velo), 0);
  const visitor = h.visitor();
  assert.deepEqual([(await h.wish(visitor, token, 'Vélo')).reservation, (await h.wish(visitor, token, 'Vélo')).mine], ['free', false]);
  // Lampe : Jo reste, l'état « ouvert » est gardé
  assert.equal((await h.wish(visitor, token, 'Lampe')).reservation, 'open');
  assert.deepEqual(await h.stateOf(h.marie, h.ids.lampe), { itemId: h.ids.lampe, open: true, participants: [{ visitorId: 'v1', displayName: 'Tante Jo', viaLink: true }] });
  // Synchronisation des membres cohérente : le vélo n'y est plus, rien pour Léa
  assert.equal(await h.stateOf(h.marie, h.ids.velo), null);
  assert.equal(await h.stateOf(h.guillaume, h.ids.velo), null);
  assert.equal((await h.lea.get('/api/sync')).body.reservations?.[h.ids.noel], undefined);
  // Rien à libérer : la réponse de « pas réservé » est juste
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.velo}/reservation/all`)).status, 404);
  // Un visiteur peut le réserver ; la réservation est FERMÉE (l'ancien « ouvert » n'a pas survécu)
  assert.equal((await h.act(visitor, token, h.ids.velo, 'POST', 'Oncle Max')).status, 200);
  assert.deepEqual(await h.stateOf(h.marie, h.ids.velo), { itemId: h.ids.velo, open: false, participants: [{ visitorId: 'v2', displayName: 'Oncle Max', viaLink: true }] });
  assert.equal((await h.wish(h.visitor(), token, 'Vélo')).reservation, 'reserved');
  assert.deepEqual((await h.marie.post(`/api/items/${h.ids.velo}/reservation`, {})).body.error, ALREADY);
  // Le gestionnaire libère : plus rien, dans aucune table
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.velo}/reservation/all`)).status, 200);
  assert.equal((await h.wish(h.visitor(), token, 'Vélo')).reservation, 'free');
});

test('état resté seul (base d\'avant la correction) : ignoré par tous les lecteurs, effacé par la migration ; un compte et un visiteur réservent normalement', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  // Un état seul, comme en laissait la suppression d'un compte avant la correction
  const orphan = (itemId, open = 1) => h.app.db.prepare("INSERT INTO reservation_states (item_id, open, created_at, updated_at) VALUES (?, ?, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z')").run(itemId, open);
  orphan(h.ids.velo);
  orphan(h.ids.lampe, 0);
  // Lecture : libre pour un visiteur, absent pour les membres
  assert.equal((await h.wish(h.visitor(), token, 'Vélo')).reservation, 'free');
  assert.equal((await h.wish(h.visitor(), token, 'Lampe')).reservation, 'free');
  assert.equal(await h.stateOf(h.marie, h.ids.velo), null);
  // Ouvrir ou libérer : « pas réservé »
  assert.equal((await h.guillaume.request('PATCH', `/api/items/${h.ids.velo}/reservation`, { open: true })).status, 404);
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.velo}/reservation/all`)).status, 404);
  // Un compte réserve fermé : l'ancien état « ouvert » est remplacé
  assert.equal((await h.marie.post(`/api/items/${h.ids.velo}/reservation`, {})).status, 200);
  assert.equal((await h.stateOf(h.paul, h.ids.velo)).open, false);
  assert.deepEqual((await h.act(h.visitor(), token, h.ids.velo)).body.error, ALREADY, 'fermé : un visiteur ne rejoint pas');
  // Un visiteur réserve la lampe : fermée
  assert.equal((await h.act(h.visitor(), token, h.ids.lampe)).status, 200);
  assert.equal((await h.stateOf(h.paul, h.ids.lampe)).open, false);
  // La migration efface les états restés seuls (et eux seulement)
  orphan(h.ids.jeu);
  assert.equal(dropOrphanStates(h.app.db), 1);
  assert.equal(statesCount(h), 2);
  assert.equal(dropOrphanStates(h.app.db), 0, 'rien de plus');
});

test('les déclencheurs effacent l\'état avec le dernier participant, par tous les chemins (départ, effacement en cascade d\'un compte, d\'un visiteur)', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  // Effacement direct dans la base (comme une suppression en cascade) : l'état part avec le dernier
  await h.marie.post(`/api/items/${h.ids.velo}/reservation`, { open: true });
  await h.act(h.visitor(), token, h.ids.velo);
  h.app.db.prepare('DELETE FROM reservations WHERE item_id = ?').run(h.ids.velo);
  assert.equal(statesCount(h), 1, 'un visiteur reste : état gardé');
  h.app.db.prepare('DELETE FROM visitor_reservations WHERE item_id = ?').run(h.ids.velo);
  assert.equal(statesCount(h), 0, 'plus personne : état effacé');
  // Les chemins habituels restent justes
  await h.marie.post(`/api/items/${h.ids.lampe}/reservation`, {});
  assert.equal((await h.marie.del(`/api/items/${h.ids.lampe}/reservation`)).status, 200);
  assert.equal(statesCount(h), 0);
  const names = h.app.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").pluck().all();
  assert.deepEqual(names, ['reservations_state_cleanup', 'visitor_reservations_state_cleanup']);
});

test('compte désactivé ou qui quitte la liste : ses participations restent, le souhait reste réservé (voulu) ; le gestionnaire peut libérer', async (t) => {
  const h = await household(t);
  const { token } = await h.link();
  await h.paul.post(`/api/items/${h.ids.velo}/reservation`, {});
  await h.marie.post(`/api/items/${h.ids.lampe}/reservation`, { open: true });
  // Paul quitte la liste ; Marie est désactivée par l'Admin
  assert.equal((await h.paul.post(`/api/lists/${h.ids.noel}/leave`)).status, 200);
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/users/${h.marieId}`, { active: false })).status, 200);
  const visitor = h.visitor();
  assert.equal((await h.wish(visitor, token, 'Vélo')).reservation, 'reserved');
  assert.equal((await h.wish(visitor, token, 'Lampe')).reservation, 'open');
  assert.deepEqual((await h.stateOf(h.guillaume, h.ids.velo)).participants, [{ userId: h.paulId, displayName: 'Paul' }]);
  assert.deepEqual((await h.stateOf(h.guillaume, h.ids.lampe)).participants, [{ userId: h.marieId, displayName: 'Marie' }]);
  assert.equal(statesCount(h), 2);
  // Fermé : un visiteur ne peut pas ; ouvert : il participe
  assert.deepEqual((await h.act(visitor, token, h.ids.velo)).body.error, ALREADY);
  assert.equal((await h.act(visitor, token, h.ids.lampe)).status, 200);
  // Le gestionnaire libère (comptes partis ou désactivés compris)
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.velo}/reservation/all`)).status, 200);
  assert.equal((await h.guillaume.del(`/api/items/${h.ids.lampe}/reservation/all`)).status, 200);
  assert.equal((await h.wish(visitor, token, 'Vélo')).reservation, 'free');
  assert.equal((await h.wish(visitor, token, 'Lampe')).reservation, 'free');
  assert.equal(statesCount(h), 0);
});
