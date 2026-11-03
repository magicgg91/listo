// Lien public d'une liste d'envies (lecture seule, sans compte ; décision du
// 3 novembre 2026) : seul le propriétaire le gère ; mêmes règles que les
// autres listes (jeton, mot de passe, expiration, arrêt, liste supprimée) ;
// champs exacts d'un souhait, jamais d'identifiant interne ni de
// réservation ; lien dangereux jamais rendu ; et la réponse publique est
// strictement identique avant et après chaque action de réservation.
//
// Foyer : Guillaume (Admin, propriétaire), Léa (destinataire, « Peut
// modifier »), Marie (« Peut modifier »), Paul (« Lecture seule »), Zoé (sans accès).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { publicItemDetails } from '../public/js/format.js';

const uuid = () => crypto.randomUUID();
const HOUR = 60 * 60 * 1000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const people = { guillaume };
  for (const name of ['lea', 'marie', 'paul', 'zoe']) {
    people[`${name}Id`] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name[0].toUpperCase() + name.slice(1), people[`${name}Id`]);
    people[name] = app.client();
    await login(people[name], name, `MotDePasse-${name}`);
  }
  const ids = { noel: uuid(), moi: uuid(), lucas: uuid(), tasks: uuid(), velo: uuid(), livre: uuid(), lampe: uuid(), vis: uuid() };
  const ops = (client, list) => client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
  const res = await ops(guillaume, [
    { type: 'list.create', listId: ids.noel, name: 'Noël de Léa', listType: 'wishes', forUserId: people.leaId },
    { type: 'item.create', listId: ids.noel, itemId: ids.velo, name: 'Vélo', link: 'https://exemple.fr/velo', priceCents: 24990, note: 'Rouge' },
    { type: 'item.update', itemId: ids.velo, priority: 'high' },
    { type: 'item.create', listId: ids.noel, itemId: ids.livre, name: 'Livre' },
    { type: 'item.check', itemId: ids.livre, checked: true },
    { type: 'item.create', listId: ids.noel, itemId: ids.lampe, name: 'Lampe', priceCents: 0 },
    { type: 'list.create', listId: ids.moi, name: 'Mes envies', listType: 'wishes' },
    { type: 'list.create', listId: ids.lucas, name: 'Pour Lucas', listType: 'wishes', forName: 'Lucas' },
    { type: 'list.create', listId: ids.tasks, name: 'Maison', listType: 'tasks', priorityEnabled: true },
    { type: 'item.create', listId: ids.tasks, itemId: ids.vis, name: 'Vis', quantity: '12' },
  ]);
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  const access = { [people.leaId]: 'modification', [people.marieId]: 'modification', [people.paulId]: 'lecture' };
  assert.equal((await guillaume.request('PUT', `/api/lists/${ids.noel}/members`, { userIds: Object.keys(access).map(Number), access })).status, 200);
  const link = async (listId, body = {}) => {
    const r = await guillaume.request('PUT', `/api/lists/${listId}/share`, body);
    assert.equal(r.status, 201, r.text);
    return { share: r.body.share, token: r.body.share.url.split('/p/')[1] };
  };
  const visitor = (ip = '203.0.113.21') => createClient(app.base, { ip });
  return { app, ...people, ids, link, visitor };
}

// Réponse complète (corps et en-têtes, sauf la date qui suit l'horloge réelle)
async function snapshot(client, url) {
  const res = await client.get(url);
  return { status: res.status, text: res.text, headers: Object.fromEntries([...res.headers].filter(([name]) => name !== 'date')) };
}

test('droits : seul le propriétaire crée, lit, modifie et arrête le lien ; contributeur, destinataire, invité et non-membre refusés', async (t) => {
  const h = await household(t);
  const url = `/api/lists/${h.ids.noel}/share`;
  for (const [who, client] of [['contributrice', h.marie], ['destinataire', h.lea], ['invité', h.paul], ['non-membre', h.zoe]]) {
    for (const [method, body] of [['PUT', {}], ['GET', undefined], ['DELETE', undefined]]) {
      const r = await client.request(method, url, body);
      assert.equal(r.status, 404, `${who} ${method}`);
    }
  }
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares').pluck().get(), 0);
  const { token } = await h.link(h.ids.noel);
  assert.equal((await h.guillaume.get(url)).body.share.url.split('/p/')[1], token);
  assert.equal((await h.guillaume.request('PUT', url, { durationHours: 48 })).status, 200);
  assert.equal((await h.guillaume.del(url)).status, 200);
  // Journal : création et arrêt comme pour les autres listes, sans contenu
  assert.ok(h.app.logs.some((l) => l.includes('lien_public_cree')));
  assert.ok(h.app.logs.some((l) => l.includes('lien_public_arrete')));
  assert.ok(!h.app.logs.some((l) => /Vélo|Noël de Léa|exemple\.fr/.test(l)), 'aucun contenu dans le journal');
  // Duplication : toujours refusée
  assert.equal((await h.guillaume.post(`/api/lists/${h.ids.noel}/duplicate`, { name: 'Copie' })).status, 400);
});

test('page publique d\'une liste d\'envies : champs exacts d\'un souhait, « Pour Léa », reçus à part ; le bénéficiaire connecté n\'a aucune réservation ; un visiteur, seulement un état', async (t) => {
  const h = await household(t);
  await h.marie.post(`/api/items/${h.ids.velo}/reservation`, { open: true });
  await h.paul.post(`/api/items/${h.ids.velo}/reservation`, {});
  const { token } = await h.link(h.ids.noel);
  // Bénéficiaire reconnu par sa session : la lecture seule, sans aucune réservation ni identifiant
  const res = await h.lea.get(`/api/public/${token}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.list, { name: 'Noël de Léa', type: 'wishes', forName: 'Lea', store: null, grouping: 'none' });
  assert.equal(res.body.groups.length, 1);
  const [velo, lampe] = [...res.body.groups[0].items].sort((a, b) => a.name.localeCompare(b.name, 'fr')).reverse();
  assert.deepEqual(velo, { name: 'Vélo', note: 'Rouge', checked: false, photo: null, priority: 'high', link: 'https://exemple.fr/velo', priceCents: 24990 });
  assert.deepEqual(lampe, { name: 'Lampe', note: '', checked: false, photo: null, priority: 'normal', priceCents: 0 }, 'ni lien vide, ni quantité');
  assert.deepEqual(res.body.done, [{ name: 'Livre', note: '', checked: true, photo: null, priority: 'normal' }], 'souhait reçu : zone « Reçus »');
  assert.doesNotMatch(res.text, new RegExp([h.ids.velo, h.ids.livre, h.ids.noel, 'reserv', 'particip', '"open"', 'Marie', 'Paul', 'userId', 'ownerId', 'forUserId', 'mine', 'canReserve'].join('|'), 'i'));
  assert.equal(res.headers.get('set-cookie'), null, 'session lue sans être prolongée');
  // Visiteur : en plus, l'identifiant du souhait (pour réserver), son état et « le mien » ; jamais qui, ni combien
  const anon = await h.visitor().get(`/api/public/${token}`);
  assert.equal(anon.body.list.canReserve, true);
  const anonVelo = anon.body.groups[0].items.find((i) => i.name === 'Vélo');
  assert.deepEqual(anonVelo, { ...velo, id: h.ids.velo, reservation: 'open', mine: false });
  assert.deepEqual(anon.body.done, res.body.done, 'rien pour un souhait reçu');
  assert.doesNotMatch(anon.text, new RegExp([h.ids.noel, 'Marie', 'Paul', 'userId', 'participants', 'ownerId', 'forUserId'].join('|')));
  // Photo : seulement l'adresse publique, pour les articles qui en ont une (mêmes règles que les autres listes)
  h.app.db.prepare('UPDATE items SET photo_at = ? WHERE id = ?').run('2026-10-16T12:00:00.000Z', h.ids.lampe);
  const withPhoto = (await h.visitor().get(`/api/public/${token}`)).body.groups[0].items.find((i) => i.name === 'Lampe');
  assert.equal(withPhoto.photo, `/api/public/${token}/photos/${h.ids.lampe}`);
  // Priorité désactivée : plus donnée
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.update', listId: h.ids.noel, priorityEnabled: false }] });
  assert.ok((await h.visitor().get(`/api/public/${token}`)).body.groups[0].items.every((i) => !('priority' in i)));
  // « Pour qui » : personne sans compte ; « Moi » : le prénom du propriétaire
  assert.equal((await h.visitor().get(`/api/public/${(await h.link(h.ids.lucas)).token}`)).body.list.forName, 'Lucas');
  assert.equal((await h.visitor().get(`/api/public/${(await h.link(h.ids.moi)).token}`)).body.list.forName, 'Guillaume');
});

test('lien dangereux (javascript:, data:, identifiants) jamais rendu, même s\'il était en base', async (t) => {
  const h = await household(t);
  const { token } = await h.link(h.ids.noel);
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'https://moi:secret@exemple.fr/', 'ftp://exemple.fr/', 'https://exemple.fr/a b']) {
    h.app.db.prepare('UPDATE items SET link = ? WHERE id = ?').run(bad, h.ids.velo);
    const body = (await h.visitor().get(`/api/public/${token}`)).body;
    const velo = body.groups[0].items.find((i) => i.name === 'Vélo');
    assert.equal('link' in velo, false, bad);
    assert.doesNotMatch(JSON.stringify(body), /javascript:|data:text|secret@|ftp:/);
  }
  // Page du visiteur : lien vérifié encore avant affichage, nouvel onglet, sans referrer ni suivi
  const page = code('public/js/public.js');
  assert.match(page, /const safe = listType === 'wishes' \? cleanLink\(item\.link \?\? ''\) : null;/);
  assert.match(page, /h\('a', \{ class: 'btn btn--secondary btn--sm', href: safe, target: '_blank', rel: 'noopener noreferrer nofollow' \}/);
  assert.doesNotMatch(page, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('mêmes règles que les autres listes : mot de passe, expiration, lien arrêté, jeton inconnu, liste supprimée', async (t) => {
  const h = await household(t);
  const unknown = await h.visitor('203.0.113.99').get(`/api/public/${crypto.randomBytes(32).toString('base64url')}`);
  assert.equal(unknown.status, 404);
  // Mot de passe
  const { share, token } = await h.link(h.ids.noel, { protect: true, durationHours: 2 });
  const v = h.visitor();
  assert.equal((await v.get(`/api/public/${token}`)).status, 401);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: 'mauvais' })).status, 401);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: share.password })).status, 200);
  assert.equal((await v.get(`/api/public/${token}`)).status, 200);
  // Expiration contrôlée par le serveur
  h.app.clock.now += 3 * HOUR;
  const expired = await v.get(`/api/public/${token}`);
  assert.deepEqual([expired.status, expired.text], [unknown.status, unknown.text]);
  // Lien arrêté
  await h.guillaume.del(`/api/lists/${h.ids.noel}/share`);
  const { token: second } = await h.link(h.ids.noel);
  assert.equal((await h.visitor().get(`/api/public/${second}`)).status, 200);
  await h.guillaume.del(`/api/lists/${h.ids.noel}/share`);
  const stopped = await h.visitor().get(`/api/public/${second}`);
  assert.deepEqual([stopped.status, stopped.text], [unknown.status, unknown.text]);
  // Liste supprimée : le lien s'arrête avec elle
  const { token: third } = await h.link(h.ids.noel);
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId: h.ids.noel }] });
  const gone = await h.visitor().get(`/api/public/${third}`);
  assert.deepEqual([gone.status, gone.text], [unknown.status, unknown.text]);
  assert.equal((await h.visitor().get(`/p/${third}`)).status, 404);
});

test('TEST FORT : pour le bénéficiaire connecté, la réponse publique d\'une liste d\'envies est strictement identique avant et après chaque action de réservation des comptes (corps et en-têtes)', async (t) => {
  const h = await household(t);
  const { token } = await h.link(h.ids.noel);
  const v = h.lea; // le bénéficiaire, avec sa session (voir test/wishes-visitors.test.js pour les visiteurs)
  const urls = [`/api/public/${token}`, `/p/${token}`];
  const before = await Promise.all(urls.map((u) => snapshot(v, u)));
  assert.equal(before[0].status, 200);
  assert.ok(before[0].headers.etag && before[0].headers['content-length'], 'ETag et taille comparés aussi');
  const reserve = (client, itemId, body = {}) => client.post(`/api/items/${itemId}/reservation`, body);
  const actions = [
    ['réserver ouvert', () => reserve(h.marie, h.ids.velo, { open: true })],
    ['participer', () => reserve(h.paul, h.ids.velo)],
    ['fermer', () => h.marie.request('PATCH', `/api/items/${h.ids.velo}/reservation`, { open: false })],
    ['réserver fermé', () => reserve(h.guillaume, h.ids.lampe)],
    ['ouvrir', () => h.guillaume.request('PATCH', `/api/items/${h.ids.lampe}/reservation`, { open: true })],
    ['quitter', () => h.paul.del(`/api/items/${h.ids.velo}/reservation`)],
    ['retirer un participant', () => h.guillaume.del(`/api/items/${h.ids.velo}/reservation/participants/${h.marieId}`)],
    ['libérer tout', () => h.guillaume.del(`/api/items/${h.ids.lampe}/reservation/all`)],
  ];
  for (const [label, action] of actions) {
    assert.equal((await action()).status, 200, label);
    await pause(20);
    assert.deepEqual(await Promise.all(urls.map((u) => snapshot(v, u))), before, `${label} : rien de changé pour le visiteur`);
  }
  // Même avec des réservations en cours
  await reserve(h.marie, h.ids.velo, { open: true });
  await reserve(h.paul, h.ids.velo);
  assert.deepEqual(await Promise.all(urls.map((u) => snapshot(v, u))), before);
  // Le serveur public ne lit jamais les tables des réservations directement (seulement par server/reservations.js)
  assert.doesNotMatch(read('server/routes/public.js').replace(/\/\/.*$/gm, ''), /FROM reservations|visitor_reservations|reservation_states/i);
});

test('autres types inchangés : liste de tâches (quantité, priorité, ni lien, ni prix, ni « pour qui »)', async (t) => {
  const h = await household(t);
  const { token } = await h.link(h.ids.tasks);
  const body = (await h.visitor().get(`/api/public/${token}`)).body;
  assert.deepEqual(body.list, { name: 'Maison', type: 'tasks', store: null, grouping: 'none' });
  assert.deepEqual(body.groups[0].items[0], { name: 'Vis', quantity: '12', note: '', checked: false, photo: null, priority: 'normal' });
});

test('page du visiteur et écran du lien : mots des envies, prix, « Reçu », phrase d\'information et avertissement sur le destinataire', () => {
  // Fiche d'un souhait (lecture seule)
  const rows = publicItemDetails({ name: 'Vélo', note: 'Rouge', checked: false, priority: 'high', priceCents: 24990, link: 'https://exemple.fr/velo' }, { grouping: 'none', type: 'wishes' });
  assert.deepEqual(rows.map((r) => [r.label, r.text.replace(/\s/g, ' ')]), [['Souhait', 'Vélo'], ['État', 'Pas encore reçu'], ['Prix indicatif', '249,90 €'], ['Note', 'Rouge'], ['Priorité', 'Élevée']]);
  assert.equal(publicItemDetails({ name: 'Livre', checked: true }, { grouping: 'none', type: 'wishes' })[1].text, 'Reçu');
  const page = code('public/js/public.js');
  assert.match(page, /words = isWishList\(list\) \? itemWords\(list\) : itemWords\(list\.grouping !== 'none'\);/);
  assert.match(page, /const kind = isWishList\(list\) \? list : shopping;\s*const zone = doneZoneWords\(kind\);/);
  assert.match(page, /isWishList\(list\) && list\.forName \? `Pour \$\{list\.forName\}` : typeLabel\(list\.type\)/);
  assert.match(page, /'aria-label': listType === 'wishes' \? \(item\.checked \? 'Reçu' : 'Pas encore reçu'\)/);
  // Écran du lien : la phrase pour une liste d'envies, et la place (vide) d'un futur avertissement
  const share = read('public/js/screens/share.js');
  assert.match(share, /export const WISH_SHARE_NOTE = 'Les personnes qui ont ce lien voient les souhaits, leurs liens et leurs prix, et peuvent réserver un souhait ou participer à un cadeau, sans compte\. Elles ne voient jamais qui a réservé\.';/);
  assert.match(share, /export const WISH_SHARE_WARNING = 'Si la personne à qui la liste est destinée ouvre ce lien sans être connectée à Listo, elle verra quels souhaits sont réservés \(jamais par qui\)\. Ne le lui donnez pas\.';/);
  assert.match(share, /h\('p', \{ class: 'note note--danger', id: 'share-wish-warning', role: 'note' \}/);
  assert.equal((share.match(/wishNotes\(\),/g) ?? []).length, 2, 'à la création et pour un lien actif');
  // Menu : « Partager par lien » proposé aussi pour une liste d'envies ; pas de duplication
  const actions = code('public/js/screens/list-actions.js');
  assert.match(actions, /wishes \? null : duplicate,\s*\{ icon: 'link', label: 'Partager par lien'/);
});
