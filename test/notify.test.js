// Notifications push, étape 2 : modifications des autres (regroupées),
// envies (réservation, participation), partage ; préférences, détail,
// « Silencer cette liste », plafond, droits relus à l'envoi ; et la
// confidentialité des listes d'envies : le bénéficiaire reçoit EXACTEMENT les
// mêmes notifications avec ou sans réservation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { connect, claude, PASSWORD } from './mcp-helpers.js';
import { GROUP_MS, HOURLY_CAP } from '../server/notify.js';

// Identifiants fixes : deux foyers identiques donnent les mêmes notifications
const fixed = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let opCounter = 0;
const opId = () => fixed(900000 + (opCounter += 1));

// Un foyer : Guillaume (Admin), Léa, Marc, Zoé ; chacun connecté sur un
// appareil abonné aux notifications (clés fixes, tirées de son prénom)
async function family(t, { mcp = false } = {}) {
  const push = fakePushService();
  const app = await startTestApp(t, { config: { push: true, mcp }, pushRequest: push });
  push.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1, name: 'Guillaume' } };
  app.db.prepare("UPDATE users SET display_name = 'Guillaume' WHERE id = 1").run();
  for (const [key, name] of [['lea', 'Léa'], ['marc', 'Marc'], ['zoe', 'Zoé']]) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id, name };
  }
  for (const [key, person] of Object.entries(people)) {
    person.device = fakeDevice(`https://fcm.googleapis.com/fcm/send/${key}`, key);
    const res = await person.client.request('PUT', '/api/push/subscription', person.device.subscription);
    assert.equal(res.status, 200, res.text);
  }
  const ops = async (who, list) => {
    const res = await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: opId(), ...op })) });
    assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
    return res.body.results;
  };
  const share = (listId, access, who = 'guillaume') => people[who].client.request('PUT', `/api/lists/${listId}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  // Ce qu'a reçu l'appareil d'une personne, déchiffré, dans l'ordre (avec
  // l'heure de l'envoi et les en-têtes qui comptent)
  const inbox = (who) => push.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint)
    .map((c) => ({ at: c.at, ttl: c.headers.TTL, urgency: c.headers.Urgency, size: c.body.length, ...people[who].device.read(c.body).notification }));
  // Le temps passe : les groupes mûrs partent, puis on attend les envois
  const tick = async (ms) => {
    app.clock.now += ms;
    await app.ctx.notify.flushDue();
    await app.ctx.push.idle();
  };
  const settle = () => app.ctx.push.idle();
  return { app, push, people, ops, share, inbox, tick, settle };
}

// Une liste de courses de Guillaume, partagée avec Léa (modifier) et Marc (lecture seule)
async function withCourses(t, options) {
  const f = await family(t, options);
  const ids = { courses: fixed(1), lait: fixed(2), pain: fixed(3), oeufs: fixed(4) };
  await f.ops('guillaume', [{ type: 'list.create', listId: ids.courses, name: 'Courses', listType: 'shopping' }]);
  assert.equal((await f.share(ids.courses, { lea: 'modification', marc: 'lecture' })).status, 200);
  await f.tick(GROUP_MS); // notifications « partage » de Léa et Marc envoyées
  f.push.calls.length = 0;
  return { ...f, ids };
}

// --- a) Modifications des autres ---

test('modifications : regroupées 60 s par personne et par liste, une seule notification, jamais à leur auteur', async (t) => {
  const f = await withCourses(t);
  await f.ops('lea', [
    { type: 'item.create', listId: f.ids.courses, itemId: f.ids.lait, name: 'Lait' },
    { type: 'item.create', listId: f.ids.courses, itemId: f.ids.pain, name: 'Pain' },
  ]);
  await f.tick(30 * 1000);
  await f.ops('lea', [{ type: 'item.check', itemId: f.ids.lait, checked: true }]);
  assert.equal(f.push.calls.length, 0, 'rien avant la fin de la fenêtre');
  await f.tick(30 * 1000);
  const [notif] = f.inbox('guillaume');
  assert.equal(f.inbox('guillaume').length, 1);
  assert.equal(notif.title, 'Léa a modifié « Courses »');
  assert.equal(notif.body, '3 changements', 'neutre : sans le nom des articles');
  assert.equal(notif.tag, `liste-${f.ids.courses}`, 'un tag par liste');
  assert.equal(notif.navigate, `http://listo.test/#/listes/${f.ids.courses}`);
  assert.equal(f.inbox('marc').length, 1, 'membre en lecture seule : notifié aussi');
  assert.equal(f.inbox('lea').length, 0, 'jamais l\'auteur');
  assert.equal(f.inbox('zoe').length, 0, 'jamais un non-membre');
  // Nouveau changement : nouvelle fenêtre ; deux auteurs nommés
  await f.ops('lea', [{ type: 'item.create', listId: f.ids.courses, itemId: f.ids.oeufs, name: 'Œufs' }]);
  await f.ops('guillaume', [{ type: 'item.check', itemId: f.ids.pain, checked: true }]);
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('marc').at(-1).title, 'Léa et Guillaume ont modifié « Courses »');
  assert.equal(f.inbox('marc').at(-1).body, '2 changements');
  assert.equal(f.inbox('guillaume').at(-1).title, 'Léa a modifié « Courses »', 'Guillaume ne compte pas sa propre coche');
  assert.equal(f.inbox('guillaume').at(-1).body, '1 changement');
  // Décocher et supprimer : rien
  const before = f.push.calls.length;
  await f.ops('lea', [{ type: 'item.check', itemId: f.ids.lait, checked: false }, { type: 'item.delete', itemId: f.ids.oeufs }]);
  await f.tick(GROUP_MS);
  assert.equal(f.push.calls.length, before);
});

test('détail : désactivé au départ ; activé, la notification nomme les articles ; préférences par catégorie', async (t) => {
  const f = await withCourses(t);
  let res = await f.people.guillaume.client.get('/api/push');
  assert.deepEqual(res.body.settings, { changes: true, due: true, wishes: true, sharing: true, detail: false });
  res = await f.people.guillaume.client.request('PUT', '/api/push/settings', { detail: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.detail, true);
  res = await f.people.marc.client.request('PUT', '/api/push/settings', { changes: false });
  assert.equal(res.body.settings.changes, false);
  for (const bad of [{}, { detail: 'oui' }, { inconnu: true }, [true], null]) {
    assert.equal((await f.people.marc.client.request('PUT', '/api/push/settings', bad)).status, 400, JSON.stringify(bad));
  }
  await f.ops('lea', [
    { type: 'item.create', listId: f.ids.courses, itemId: f.ids.lait, name: 'Lait' },
    { type: 'item.create', listId: f.ids.courses, itemId: f.ids.pain, name: 'Pain' },
    { type: 'item.check', itemId: f.ids.lait, checked: true },
    { type: 'item.update', itemId: f.ids.pain, quantity: '2' },
  ]);
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('guillaume')[0].body, 'Ajouté : Lait, Pain · Modifié : Pain · Coché : Lait');
  assert.equal(f.inbox('marc').length, 0, 'catégorie coupée');
});

test('« Silencer cette liste » : plus rien d\'elle, quelle que soit la catégorie ; membres seulement ; oubliée au départ', async (t) => {
  const f = await withCourses(t);
  const mute = (who, listId, muted) => f.people[who].client.request('PUT', `/api/push/mutes/${listId}`, { muted });
  let res = await mute('guillaume', f.ids.courses, true);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.mutedLists, [f.ids.courses]);
  assert.deepEqual((await f.people.guillaume.client.get('/api/push')).body.mutedLists, [f.ids.courses]);
  res = await mute('marc', f.ids.courses, true);
  await f.ops('lea', [{ type: 'item.create', listId: f.ids.courses, itemId: f.ids.lait, name: 'Lait' }]);
  // Partage : le droit de Marc change sur une liste qu'il a silencée
  await f.share(f.ids.courses, { lea: 'modification', marc: 'modification' });
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('guillaume').length, 0);
  assert.equal(f.inbox('marc').length, 0, 'ni modification, ni partage');
  // Non-membre, liste inconnue, valeur invalide
  assert.equal((await mute('zoe', f.ids.courses, true)).status, 404);
  assert.equal((await mute('zoe', fixed(999), true)).status, 404);
  assert.equal((await mute('zoe', 'pas-un-uuid', true)).status, 404);
  assert.equal((await mute('guillaume', f.ids.courses, 'oui')).status, 400);
  // Réactivée : de nouveau notifié
  await mute('guillaume', f.ids.courses, false);
  await f.ops('lea', [{ type: 'item.check', itemId: f.ids.lait, checked: true }]);
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('guillaume').length, 1);
  // Marc quitte la liste : sa sourdine est oubliée
  await f.people.marc.client.post(`/api/lists/${f.ids.courses}/leave`);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) FROM push_list_mutes WHERE user_id = ?').pluck().get(f.people.marc.id), 0);
});

test('droits relus à l\'envoi : retiré de la liste, compte désactivé, liste supprimée ou déjà vue : rien', async (t) => {
  const f = await withCourses(t);
  await f.ops('lea', [{ type: 'item.create', listId: f.ids.courses, itemId: f.ids.lait, name: 'Lait' }]);
  // Pendant la fenêtre : Marc est retiré, Guillaume a vu la liste (ouverte)
  await f.share(f.ids.courses, { lea: 'modification' });
  const lastEvent = f.app.db.prepare('SELECT MAX(id) FROM list_events WHERE list_id = ?').pluck().get(f.ids.courses);
  await f.ops('guillaume', [{ type: 'list.seen', listId: f.ids.courses, upTo: lastEvent }]);
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('marc').length, 0, 'plus membre');
  assert.equal(f.inbox('guillaume').length, 0, 'déjà vu');
  // Compte désactivé
  await f.ops('lea', [{ type: 'item.check', itemId: f.ids.lait, checked: true }]);
  f.app.db.prepare('UPDATE users SET active = 0 WHERE id = 1').run();
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('guillaume').length, 0);
  f.app.db.prepare('UPDATE users SET active = 1 WHERE id = 1').run();
  // Liste supprimée entre-temps
  await f.ops('lea', [{ type: 'item.check', itemId: f.ids.lait, checked: false }, { type: 'item.create', listId: f.ids.courses, itemId: f.ids.pain, name: 'Pain' }]);
  await f.ops('guillaume', [{ type: 'list.delete', listId: f.ids.courses }]);
  await f.tick(GROUP_MS);
  assert.equal(f.push.calls.length, 0);
});

test(`plafond : ${HOURLY_CAP} notifications au plus par personne et par heure`, async (t) => {
  const f = await withCourses(t);
  for (let i = 0; i < HOURLY_CAP + 5; i++) {
    await f.ops('lea', [{ type: 'item.create', listId: f.ids.courses, itemId: fixed(5000 + i), name: `Article ${i}` }]);
    await f.tick(GROUP_MS);
  }
  assert.equal(f.inbox('guillaume').length, HOURLY_CAP);
  await f.tick(60 * 60 * 1000);
  await f.ops('lea', [{ type: 'item.create', listId: f.ids.courses, itemId: fixed(6000), name: 'Encore' }]);
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('guillaume').length, HOURLY_CAP + 1, 'une heure plus tard, de nouveau');
});

test('Claude : une action faite au nom d\'un compte compte comme la sienne (il n\'est pas notifié, les autres oui)', async (t) => {
  const f = await withCourses(t, { mcp: true });
  const tokens = await connect({ app: f.app }, f.people.guillaume.client, PASSWORD, { scope: 'write' });
  const res = await claude({ app: f.app }, tokens.access_token).tool('add_items', { list_id: f.ids.courses, items: [{ name: 'Thé' }] });
  assert.equal(res.status, 200, res.text);
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('guillaume').length, 0);
  assert.equal(f.inbox('lea')[0].title, 'Guillaume a modifié « Courses »');
});

// --- d) Partage ---

test('partage : ajouté à une liste, droit changé, liste d\'envies créée pour moi ; jamais à l\'auteur', async (t) => {
  const f = await family(t);
  const ids = { maison: fixed(10), cadeaux: fixed(11) };
  await f.ops('guillaume', [{ type: 'list.create', listId: ids.maison, name: 'Maison', listType: 'tasks' }]);
  await f.share(ids.maison, { zoe: 'lecture' });
  await f.settle();
  assert.deepEqual(f.inbox('zoe').map((n) => [n.title, n.body, n.tag]), [['Guillaume vous a ajouté à « Maison »', 'En lecture seule.', `partage-${ids.maison}`]]);
  await f.share(ids.maison, { zoe: 'modification' });
  await f.settle();
  assert.deepEqual([f.inbox('zoe')[1].title, f.inbox('zoe')[1].body], ['Votre droit sur « Maison » a changé', 'Vous pouvez maintenant la modifier.']);
  await f.ops('marc', [{ type: 'list.create', listId: ids.cadeaux, name: 'Anniversaire de Zoé', listType: 'wishes', forUserId: f.people.zoe.id }]);
  await f.settle();
  assert.equal(f.inbox('zoe')[2].title, 'Marc vous a ajouté à « Anniversaire de Zoé »');
  assert.equal(f.inbox('guillaume').length + f.inbox('marc').length, 0, 'jamais l\'auteur');
  // Catégorie coupée
  await f.people.lea.client.request('PUT', '/api/push/settings', { sharing: false });
  await f.share(ids.maison, { zoe: 'modification', lea: 'lecture' });
  await f.settle();
  assert.equal(f.inbox('lea').length, 0);
});

// --- c) Envies, et confidentialité ---

// Liste d'envies « Noël de Léa » (destinataire : le compte de Léa), créée par
// Guillaume, partagée avec Marc (modifier) et Zoé (lecture) ; plus une liste
// de courses partagée avec tout le monde, où il se passe des choses
async function withWishes(t) {
  const f = await family(t);
  const ids = { noel: fixed(20), velo: fixed(21), livre: fixed(22), lampe: fixed(23), courses: fixed(24), moi: fixed(25), montre: fixed(26) };
  await f.ops('guillaume', [
    { type: 'list.create', listId: ids.noel, name: 'Noël de Léa', listType: 'wishes', forUserId: f.people.lea.id },
    { type: 'item.create', listId: ids.noel, itemId: ids.velo, name: 'Vélo' },
    { type: 'item.create', listId: ids.noel, itemId: ids.livre, name: 'Livre' },
    { type: 'item.create', listId: ids.noel, itemId: ids.lampe, name: 'Lampe' },
    { type: 'list.create', listId: ids.courses, name: 'Courses', listType: 'shopping' },
    { type: 'list.create', listId: ids.moi, name: 'Mes envies', listType: 'wishes' },
    { type: 'item.create', listId: ids.moi, itemId: ids.montre, name: 'Montre' },
  ]);
  await f.share(ids.noel, { lea: 'modification', marc: 'modification', zoe: 'lecture' });
  await f.share(ids.courses, { lea: 'modification', marc: 'modification', zoe: 'lecture' });
  await f.share(ids.moi, { marc: 'modification', zoe: 'lecture' });
  await f.tick(GROUP_MS);
  f.push.calls.length = 0;
  const reserve = (who, itemId, body = {}) => f.people[who].client.post(`/api/items/${itemId}/reservation`, body);
  const link = async () => {
    const r = await f.people.guillaume.client.request('PUT', `/api/lists/${ids.noel}/share`, {});
    assert.equal(r.status, 201, r.text);
    return r.body.share.url.split('/p/')[1];
  };
  return { ...f, ids, reserve, link };
}

test('envies : réservation et participation notifiées aux seuls membres qui voient les réservations (jamais le bénéficiaire, ni l\'auteur)', async (t) => {
  const f = await withWishes(t);
  assert.equal((await f.reserve('marc', f.ids.velo, { open: true })).status, 200);
  await f.settle();
  assert.deepEqual(f.inbox('guillaume').map((n) => [n.title, n.body, n.tag]), [['Marc a réservé un souhait', 'Liste « Noël de Léa »', `envies-${f.ids.noel}`]]);
  assert.equal(f.inbox('zoe').length, 1, 'membre en lecture seule : il voit les réservations');
  assert.equal(f.inbox('marc').length, 0, 'jamais l\'auteur');
  assert.equal(f.inbox('lea').length, 0, 'jamais le bénéficiaire');
  assert.equal((await f.reserve('zoe', f.ids.velo)).status, 200);
  await f.settle();
  assert.equal(f.inbox('guillaume').at(-1).title, 'Zoé participe à un cadeau');
  assert.equal(f.inbox('marc').at(-1).title, 'Zoé participe à un cadeau');
  // Détail : le nom du souhait
  await f.people.guillaume.client.request('PUT', '/api/push/settings', { detail: true });
  const token = await f.link();
  const visitor = createClient(f.app.base, { ip: '203.0.113.7' });
  assert.equal((await visitor.post(`/api/public/${token}/souhaits/${f.ids.livre}`, { firstName: 'Tante Jo' })).status, 200);
  await f.settle();
  assert.equal(f.inbox('guillaume').at(-1).title, 'Tante Jo (lien public) a réservé « Livre »');
  assert.equal(f.inbox('marc').at(-1).title, 'Tante Jo (lien public) a réservé un souhait');
  // Ouvrir, fermer, quitter : rien
  const before = f.push.calls.length;
  await f.people.marc.client.request('PATCH', `/api/items/${f.ids.velo}/reservation`, { open: false });
  await f.people.zoe.client.del(`/api/items/${f.ids.velo}/reservation`);
  await f.settle();
  assert.equal(f.push.calls.length, before);
  assert.equal(f.inbox('lea').length, 0, 'toujours rien pour Léa');
  // Catégorie coupée
  const zoeWishes = () => f.inbox('zoe').filter((n) => n.tag?.startsWith('envies-')).length;
  const zoeBefore = zoeWishes();
  await f.people.zoe.client.request('PUT', '/api/push/settings', { wishes: false });
  assert.equal((await f.reserve('marc', f.ids.lampe)).status, 200);
  await f.settle();
  assert.equal(zoeWishes(), zoeBefore);
  assert.equal(f.inbox('guillaume').at(-1).title, 'Marc a réservé « Lampe »', 'les autres, oui');
  // Liste « Moi » : le propriétaire est le bénéficiaire, il ne reçoit rien
  assert.equal((await f.reserve('marc', f.ids.montre)).status, 200);
  await f.settle();
  assert.ok(!f.inbox('guillaume').some((n) => n.body === 'Liste « Mes envies »'));
});

test('envies : le bénéficiaire ne reçoit rien des ajouts et modifications des autres dans sa propre liste (la surprise)', async (t) => {
  const f = await withWishes(t);
  await f.ops('marc', [
    { type: 'item.create', listId: f.ids.noel, itemId: fixed(30), name: 'Puzzle' },
    { type: 'item.update', itemId: f.ids.livre, note: 'Poche' },
  ]);
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('lea').length, 0);
  assert.equal(f.inbox('guillaume')[0].title, 'Marc a modifié « Noël de Léa »');
  assert.equal(f.inbox('zoe').length, 1);
});

// Le même scénario dans deux foyers identiques ; le second ajoute des
// réservations (comptes et visiteur) au milieu. Tout ce que reçoit Léa
// (texte, titre, tag, adresse, nombre, heure, taille, en-têtes) est comparé.
async function scenario(t, withReservations) {
  opCounter = 0;
  const f = await withWishes(t);
  const token = await f.link();
  await f.ops('marc', [{ type: 'item.create', listId: f.ids.courses, itemId: fixed(40), name: 'Lait' }]);
  if (withReservations) {
    await f.reserve('marc', f.ids.velo, { open: true });
    await f.reserve('zoe', f.ids.velo);
  }
  await f.tick(20 * 1000);
  await f.ops('marc', [{ type: 'item.create', listId: f.ids.noel, itemId: fixed(41), name: 'Puzzle' }]); // dans la liste de Léa
  if (withReservations) {
    const visitor = createClient(f.app.base, { ip: '203.0.113.9' });
    assert.equal((await visitor.post(`/api/public/${token}/souhaits/${f.ids.livre}`, { firstName: 'Tante Jo' })).status, 200);
    await f.people.zoe.client.del(`/api/items/${f.ids.velo}/reservation`);
  }
  await f.tick(45 * 1000);
  await f.ops('guillaume', [{ type: 'item.check', itemId: fixed(40), checked: true }]);
  await f.share(f.ids.courses, { lea: 'lecture', marc: 'modification', zoe: 'lecture' }); // droit de Léa changé
  if (withReservations) await f.people.guillaume.client.del(`/api/items/${f.ids.velo}/reservation/all`);
  await f.tick(GROUP_MS);
  await f.settle();
  const others = f.push.calls.filter((c) => c.endpoint !== f.people.lea.device.subscription.endpoint).length;
  return { lea: f.inbox('lea'), others };
}

test('TEST FORT : le bénéficiaire reçoit exactement les mêmes notifications avec ou sans réservation (compte et visiteur)', async (t) => {
  const without = await scenario(t, false);
  const withRes = await scenario(t, true);
  assert.ok(without.lea.length >= 2, 'Léa reçoit bien des notifications (liste de courses, partage)');
  assert.deepEqual(withRes.lea, without.lea, 'texte, titre, tag, adresse, heure, taille et en-têtes identiques');
  assert.ok(withRes.others > without.others, 'les réservations ont bien été notifiées aux autres');
  // Rien de ce qu'a reçu Léa ne parle de réservation
  assert.doesNotMatch(JSON.stringify(withRes.lea), /réserv|particip|envies-|Tante Jo|lien public|Vélo|Livre/i);
});
