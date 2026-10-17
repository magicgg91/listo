// Tests du lien public d'une liste (étape 10) : la seule partie de Listo
// ouverte sans compte. On avance l'horloge du serveur pour l'expiration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login, createClient, ORIGIN } from './helpers.js';
import { generateSharePassword, PASSWORD_FAMILIES, PASSWORD_LENGTH, TOKEN_PATTERN } from '../server/shares.js';

const HOUR = 60 * 60 * 1000;
const uuid = () => crypto.randomUUID();

// Petit JPEG valide (structure seulement) pour les photos
const u16 = (n) => Buffer.from([n >> 8, n & 0xff]);
const block = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  block(0xdb, Buffer.alloc(65, 1)),
  block(0xc0, Buffer.from([8, 0, 8, 0, 8, 1, 1, 0x11, 0])),
  block(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34]),
  Buffer.from([0xff, 0xd9]),
]);

// Champs autorisés dans la réponse publique (liste blanche)
const ALLOWED = {
  top: ['expiresAt', 'groups', 'list'],
  list: ['category', 'grouping', 'name', 'store'],
  group: ['items', 'name'],
  item: ['checked', 'name', 'note', 'photo', 'quantity'],
};

// Guillaume (propriétaire) et Léa (invitée) ; une liste de courses partagée
// avec 2 articles dont 1 avec photo, et une 2e liste avec sa propre photo.
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const listId = uuid();
  const otherListId = uuid();
  const items = { lait: uuid(), pain: uuid(), secret: uuid() };
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Courses', categoryId: 1, storeId: 1 },
    { id: uuid(), type: 'item.create', listId, itemId: items.lait, name: 'Lait', quantity: '2 L', note: 'demi-écrémé', aisleId: 4 },
    { id: uuid(), type: 'item.create', listId, itemId: items.pain, name: 'Pain', aisleId: null },
    { id: uuid(), type: 'item.check', itemId: items.pain, checked: true },
    { id: uuid(), type: 'list.create', listId: otherListId, name: 'Autre liste', categoryId: 1 },
    { id: uuid(), type: 'item.create', listId: otherListId, itemId: items.secret, name: 'Cadeau secret' },
  ] });
  await guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId] });
  for (const id of [items.lait, items.secret]) {
    await fetch(`${app.base}/api/items/${id}/photo`, {
      method: 'PUT', body: JPEG,
      headers: { origin: ORIGIN, 'content-type': 'image/jpeg', cookie: [...guillaume.jar].map(([n, v]) => `${n}=${v}`).join('; ') },
    });
  }
  return { app, guillaume, lea, leaId, listId, otherListId, items };
}

// Crée le lien (options du PUT) et renvoie { share, token }
async function createLink(h, body = {}, listId = h.listId) {
  const res = await h.guillaume.request('PUT', `/api/lists/${listId}/share`, body);
  assert.equal(res.status, 201, res.text);
  const token = res.body.share.url.split('/p/')[1];
  return { share: res.body.share, token };
}

// Un visiteur sans compte (son propre « navigateur », sa propre adresse IP)
const visitor = (h, ip = '203.0.113.7') => createClient(h.app.base, { ip });

// Ce que répondent la page et l'API pour un jeton (statut et contenu exact)
async function answers(h, token, ip) {
  const v = visitor(h, ip);
  const page = await v.request('GET', `/p/${token}`);
  const data = await v.get(`/api/public/${token}`);
  const photo = await v.get(`/api/public/${token}/photos/${h.items.lait}`);
  const access = await v.post(`/api/public/${token}/acces`, { password: 'x' });
  return [page, data, photo, access].map((r) => `${r.status} ${r.text}`);
}

test('mot de passe généré : 16 caractères, les quatre familles, sans caractère ambigu', () => {
  const allowed = new Set(Object.values(PASSWORD_FAMILIES).join(''));
  for (const ambiguous of '0O1lI') assert.equal(allowed.has(ambiguous), false, ambiguous);
  for (let i = 0; i < 500; i++) {
    const password = generateSharePassword();
    assert.equal(password.length, PASSWORD_LENGTH);
    for (const [name, family] of Object.entries(PASSWORD_FAMILIES)) {
      assert.ok([...password].some((c) => family.includes(c)), `${name} manquant dans ${password}`);
    }
    assert.ok([...password].every((c) => allowed.has(c)));
  }
  // Mélange : le caractère spécial obligatoire n'est pas toujours au même endroit
  const positions = new Set();
  for (let i = 0; i < 200; i++) {
    positions.add([...generateSharePassword()].findIndex((c) => PASSWORD_FAMILIES.special.includes(c)));
  }
  assert.ok(positions.size > 5);
});

test('seul le propriétaire gère le lien : invitée et autre compte reçoivent 404', async (t) => {
  const h = await household(t);
  await addUser(h.app.db, { username: 'paul', password: 'MotDePasse-paul' });
  const paul = h.app.client();
  await login(paul, 'paul', 'MotDePasse-paul');
  for (const client of [h.lea, paul]) {
    assert.equal((await client.get(`/api/lists/${h.listId}/share`)).status, 404);
    assert.equal((await client.request('PUT', `/api/lists/${h.listId}/share`, {})).status, 404);
    assert.equal((await client.del(`/api/lists/${h.listId}/share`)).status, 404);
  }
  const anonymous = createClient(h.app.base);
  assert.equal((await anonymous.get(`/api/lists/${h.listId}/share`)).status, 401);
  // Aucun lien n'a été créé
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares').pluck().get(), 0);
});

test('création : 24 heures par défaut, adresse construite avec LISTO_PUBLIC_URL, un seul lien par liste', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h);
  assert.ok(share.url.startsWith(`${ORIGIN}/p/`));
  assert.match(token, TOKEN_PATTERN);
  assert.equal(Buffer.from(token, 'base64url').length, 32, '256 bits');
  assert.equal(share.expiresAt, new Date(h.app.clock.now + 24 * HOUR).toISOString());
  assert.equal(share.protected, false);
  assert.equal(share.password, undefined);

  // Un faux en-tête Host ne change pas l'adresse
  const res = await fetch(`${h.app.base}/api/lists/${h.listId}/share`, {
    headers: { host: 'attaquant.example', cookie: [...h.guillaume.jar].map(([n, v]) => `${n}=${v}`).join('; ') },
  });
  assert.equal((await res.json()).share.url, share.url);

  // Un second PUT modifie le lien existant au lieu d'en créer un autre
  const again = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { durationHours: 2 });
  assert.equal(again.status, 200);
  assert.equal(again.body.share.url, share.url);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares').pluck().get(), 1);

  // Durées hors limites refusées
  for (const durationHours of [0, -1, 1.5, 365 * 24 + 1, '24', {}]) {
    assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { durationHours })).status, 400, String(durationHours));
  }
  // 365 jours et illimité acceptés
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { durationHours: 365 * 24 })).status, 200);
  const unlimited = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { durationHours: null });
  assert.equal(unlimited.body.share.expiresAt, null);

  // Mes listes : l'icône « lien » pour le propriétaire seulement
  const mine = (await h.guillaume.get('/api/lists')).body.lists.find((l) => l.id === h.listId);
  assert.deepEqual(mine.publicLink, { expiresAt: null });
  const hers = (await h.lea.get('/api/lists')).body.lists.find((l) => l.id === h.listId);
  assert.equal('publicLink' in hers, false);
});

test('visiteur : la page et les données en lecture seule, champ par champ (liste blanche)', async (t) => {
  const h = await household(t);
  const { token } = await createLink(h);
  const v = visitor(h);
  const page = await v.request('GET', `/p/${token}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.text, /<script type="module" src="\/js\/public\.js"><\/script>/);
  assert.doesNotMatch(page.text, /Courses|Lait/, 'la page ne contient rien de la liste');

  const res = await v.get(`/api/public/${token}`);
  assert.equal(res.status, 200);
  const data = res.body;
  assert.deepEqual(Object.keys(data).sort(), ALLOWED.top);
  assert.deepEqual(Object.keys(data.list).sort(), ALLOWED.list);
  assert.deepEqual(data.list, { name: 'Courses', category: 'Courses', store: 'Carrefour', grouping: 'aisle' });
  for (const group of data.groups) {
    assert.deepEqual(Object.keys(group).sort(), ALLOWED.group);
    for (const item of group.items) assert.deepEqual(Object.keys(item).sort(), ALLOWED.item);
  }
  assert.deepEqual(data.groups.map((g) => g.name), ['Crèmerie', null]);
  const [lait] = data.groups[0].items;
  assert.deepEqual(lait, { name: 'Lait', quantity: '2 L', note: 'demi-écrémé', checked: false, photo: `/api/public/${token}/photos/${h.items.lait}` });
  assert.equal(data.groups[1].items[0].checked, true);

  // Rien sur les comptes, l'historique ou l'autre liste
  for (const forbidden of ['guillaume', 'Guillaume', 'lea', 'Cadeau', 'Autre liste', h.listId, h.otherListId, 'members', 'owner', 'createdBy', 'history']) {
    assert.equal(res.text.includes(forbidden), false, `« ${forbidden} » ne doit pas apparaître`);
  }

  // Article supprimé : absent
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'item.delete', itemId: h.items.pain }] });
  const after = await v.get(`/api/public/${token}`);
  assert.deepEqual(after.body.groups.flatMap((g) => g.items.map((i) => i.name)), ['Lait']);

  // Photo de cette liste : servie ; photo d'une autre liste : refusée
  const photo = await fetch(`${h.app.base}${lait.photo}`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.equal(photo.headers.get('cache-control'), 'no-store');
  assert.equal((await v.get(`/api/public/${token}/photos/${h.items.secret}`)).status, 404);
  assert.equal((await v.get(`/api/public/${token}/photos/${h.items.pain}`)).status, 404, 'pas de photo');
  assert.equal((await v.get(`/api/public/${token}/photos/..%2F..%2Fdb`)).status, 404);
});

test('liste « multi » : regroupement par magasin', async (t) => {
  const h = await household(t);
  const multi = await h.guillaume.post('/api/admin/stores', { name: 'Centre-ville', isMulti: true });
  await h.guillaume.request('PATCH', `/api/admin/stores/${multi.body.item.id}`, { storeIds: [1, 2] });
  const listId = uuid();
  await h.guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Centre', categoryId: 1, storeId: multi.body.item.id },
    { id: uuid(), type: 'item.create', listId, itemId: uuid(), name: 'Comté', storeId: 2 },
    { id: uuid(), type: 'item.create', listId, itemId: uuid(), name: 'Piles', storeId: null },
  ] });
  const { token } = await createLink(h, {}, listId);
  const data = (await visitor(h).get(`/api/public/${token}`)).body;
  assert.equal(data.list.grouping, 'store');
  assert.equal(data.list.store, 'Centre-ville');
  const storeName = h.app.db.prepare('SELECT name FROM stores WHERE id = 2').pluck().get();
  assert.deepEqual(data.groups.map((g) => g.name), [storeName, null]);
});

test('en-têtes sur toutes les routes publiques (valides ou non)', async (t) => {
  const h = await household(t);
  const { token } = await createLink(h);
  const urls = [
    `/p/${token}`, `/api/public/${token}`, `/api/public/${token}/photos/${h.items.lait}`,
    '/p/inconnu', `/api/public/${'A'.repeat(43)}`, `/api/public/${'A'.repeat(43)}/photos/x`,
  ];
  for (const url of urls) {
    const res = await fetch(`${h.app.base}${url}`, { headers: { 'x-forwarded-for': '198.51.100.1' } });
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', url);
    assert.equal(res.headers.get('cache-control'), 'no-store', url);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer', url);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/, url);
  }
  const access = await visitor(h).post(`/api/public/${token}/acces`, { password: 'x' });
  assert.equal(access.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(access.headers.get('cache-control'), 'no-store');
});

test('inconnu, expiré, arrêté, liste supprimée, propriétaire désactivé : réponses identiques octet pour octet', async (t) => {
  const h = await household(t);
  const ip = '198.51.100.20';
  const unknown = await answers(h, crypto.randomBytes(32).toString('base64url'), ip);
  assert.ok(unknown[0].startsWith('404 <!doctype html>'));
  assert.match(unknown[0], /Lien expiré ou inexistant/);
  assert.doesNotMatch(unknown[0], /<script|connexion|Se connecter/i, 'sans script ni bouton de connexion');
  assert.equal(unknown[1], '404 {"error":"Lien expiré ou inexistant."}');
  assert.deepEqual(unknown.slice(1).map((a) => a), Array(3).fill('404 {"error":"Lien expiré ou inexistant."}'));
  const malformed = await answers(h, 'pas-un-jeton', ip);
  assert.deepEqual(malformed, unknown);

  // Expiré (horloge avancée)
  const expired = await createLink(h, { durationHours: 1 });
  assert.equal((await visitor(h).get(`/api/public/${expired.token}`)).status, 200);
  h.app.clock.now += HOUR + 1000;
  assert.deepEqual(await answers(h, expired.token, '198.51.100.21'), unknown, 'expiré');

  // Arrêté
  const stopped = await createLink(h);
  assert.equal((await h.guillaume.del(`/api/lists/${h.listId}/share`)).status, 200);
  assert.deepEqual(await answers(h, stopped.token, '198.51.100.22'), unknown, 'arrêté');

  // Liste supprimée
  const deleted = await createLink(h, {}, h.otherListId);
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId: h.otherListId }] });
  assert.deepEqual(await answers(h, deleted.token, '198.51.100.23'), unknown, 'liste supprimée');

  // Propriétaire désactivé (Léa propriétaire de sa propre liste ; Guillaume
  // admin la désactive)
  const herList = uuid();
  await h.lea.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId: herList, name: 'Liste de Léa', categoryId: 2 }] });
  const hers = await h.lea.request('PUT', `/api/lists/${herList}/share`, {});
  const herToken = hers.body.share.url.split('/p/')[1];
  assert.equal((await visitor(h).get(`/api/public/${herToken}`)).status, 200);
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/users/${h.leaId}`, { active: false })).status, 200);
  assert.deepEqual(await answers(h, herToken, '198.51.100.24'), unknown, 'propriétaire désactivé');
  // … et le lien reste arrêté si le compte est réactivé
  await h.guillaume.request('PATCH', `/api/admin/users/${h.leaId}`, { active: true });
  assert.deepEqual(await answers(h, herToken, '198.51.100.25'), unknown, 'arrêt définitif');
});

test('expiration contrôlée à chaque requête : page, données, photo, mot de passe, cookie de consultation', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h, { durationHours: 2, protect: true });
  const v = visitor(h);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: share.password })).status, 200);
  assert.equal((await v.get(`/api/public/${token}`)).status, 200);
  assert.equal((await v.get(`/api/public/${token}/photos/${h.items.lait}`)).status, 200);

  h.app.clock.now += 2 * HOUR; // pile à l'expiration
  assert.equal((await v.request('GET', `/p/${token}`)).status, 404);
  assert.equal((await v.get(`/api/public/${token}`)).status, 404, 'le cookie ne suffit plus');
  assert.equal((await v.get(`/api/public/${token}/photos/${h.items.lait}`)).status, 404);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: share.password })).status, 404);

  // Le propriétaire ne voit plus de lien en cours, et peut en créer un nouveau
  assert.equal((await h.guillaume.get(`/api/lists/${h.listId}/share`)).body.share, null);
  const fresh = await createLink(h);
  assert.notEqual(fresh.token, token);
});

test('changer la durée : le délai repart de maintenant', async (t) => {
  const h = await household(t);
  const { token } = await createLink(h, { durationHours: 2 });
  h.app.clock.now += HOUR;
  const res = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { durationHours: 2 });
  assert.equal(res.body.share.expiresAt, new Date(h.app.clock.now + 2 * HOUR).toISOString());
  h.app.clock.now += 1.5 * HOUR; // 2 h 30 après la création : encore valable
  assert.equal((await visitor(h).get(`/api/public/${token}`)).status, 200);
});

test('mot de passe : saisie sans rien révéler, cookie limité à ce lien, 12 heures au plus', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h, { durationHours: 48, protect: true });
  assert.equal(share.protected, true);
  assert.equal(share.password.length, 16);
  // Relu ensuite : jamais réaffiché
  const again = await h.guillaume.get(`/api/lists/${h.listId}/share`);
  assert.equal(again.body.share.password, undefined);
  assert.equal(again.body.share.protected, true);

  const v = visitor(h);
  const locked = await v.get(`/api/public/${token}`);
  assert.equal(locked.status, 401);
  assert.deepEqual(locked.body, { error: 'Mot de passe requis.', passwordRequired: true });
  assert.equal((await v.get(`/api/public/${token}/photos/${h.items.lait}`)).status, 401);

  const wrong = await v.post(`/api/public/${token}/acces`, { password: 'mauvais' });
  assert.deepEqual([wrong.status, wrong.body], [401, { error: 'Mot de passe incorrect.' }]);
  const ok = await v.post(`/api/public/${token}/acces`, { password: share.password });
  assert.equal(ok.status, 200);
  const cookie = ok.setCookies.find((c) => c.startsWith('listo_lien='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, new RegExp(`Path=/api/public/${token}(;|$)`));
  assert.match(cookie, /Max-Age=43200/, '12 heures');
  assert.equal((await v.get(`/api/public/${token}`)).status, 200);
  assert.equal((await v.get(`/api/public/${token}/photos/${h.items.lait}`)).status, 200);

  // Le cookie ne vaut pas pour un autre lien
  const other = await createLink(h, { protect: true }, h.otherListId);
  const jarCookie = v.jar.get('listo_lien');
  const res = await fetch(`${h.app.base}/api/public/${other.token}`, { headers: { cookie: `listo_lien=${jarCookie}` } });
  assert.equal(res.status, 401);

  // Le cookie expire au bout de 12 heures, même si le lien reste valable
  h.app.clock.now += 12 * HOUR;
  assert.equal((await v.get(`/api/public/${token}`)).status, 401);
});

test('cookie de consultation : jamais au-delà de l\'expiration du lien', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h, { durationHours: 3, protect: true });
  const ok = await visitor(h).post(`/api/public/${token}/acces`, { password: share.password });
  assert.match(ok.setCookies.find((c) => c.startsWith('listo_lien=')), /Max-Age=10800/);
});

test('le cookie de consultation n\'ouvre rien d\'autre : toutes les routes de modification le refusent', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h, { protect: true });
  const v = visitor(h);
  await v.post(`/api/public/${token}/acces`, { password: share.password });
  assert.ok(v.jar.has('listo_lien'));
  // Le cookie est envoyé partout (on force), et rien ne s'ouvre
  const send = (method, url, body) => fetch(`${h.app.base}${url}`, {
    method,
    headers: { origin: ORIGIN, cookie: `listo_lien=${v.jar.get('listo_lien')}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const attempts = [
    ['POST', '/api/ops', { ops: [{ id: uuid(), type: 'item.check', itemId: h.items.lait, checked: true }] }],
    ['PUT', `/api/items/${h.items.lait}/photo`, undefined],
    ['DELETE', `/api/items/${h.items.lait}/photo`, undefined],
    ['PUT', `/api/lists/${h.listId}/members`, { userIds: [] }],
    ['PUT', `/api/lists/${h.listId}/share`, { durationHours: null }],
    ['DELETE', `/api/lists/${h.listId}/share`, undefined],
    ['POST', '/api/me/password', { currentPassword: 'x', newPassword: 'yyyyyyyyyyyy' }],
    ['POST', '/api/admin/users', { username: 'pirate', password: 'MotDePasse-pirate' }],
    ['GET', '/api/lists', undefined],
    ['GET', `/api/lists/${h.listId}`, undefined],
    ['GET', '/api/sync', undefined],
    ['GET', `/api/items/${h.items.lait}/photo`, undefined],
  ];
  for (const [method, url, body] of attempts) {
    assert.equal((await send(method, url, body)).status, 401, `${method} ${url}`);
  }
  // Les routes publiques n'ont aucune méthode de modification
  for (const method of ['PUT', 'PATCH', 'DELETE', 'POST']) {
    const res = await send(method, `/api/public/${token}`, {});
    assert.equal(res.status, 404, method);
  }
  // Rien n'a changé
  assert.equal(h.app.db.prepare('SELECT checked FROM items WHERE id = ?').pluck().get(h.items.lait), 0);
});

test('5 mots de passe faux bloquent la saisie (par lien, et par adresse IP)', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h, { protect: true });
  const attacker = visitor(h, '203.0.113.50');
  for (let i = 1; i <= 4; i++) assert.equal((await attacker.post(`/api/public/${token}/acces`, { password: `faux${i}` })).status, 401);
  const fifth = await attacker.post(`/api/public/${token}/acces`, { password: 'faux5' });
  assert.deepEqual([fifth.status, fifth.body.error], [429, "Trop d'essais, réessayez plus tard."]);
  // Même le bon mot de passe est refusé pendant le blocage, depuis n'importe où (blocage du lien)
  assert.equal((await attacker.post(`/api/public/${token}/acces`, { password: share.password })).status, 429);
  assert.equal((await visitor(h, '203.0.113.51').post(`/api/public/${token}/acces`, { password: share.password })).status, 429);
  // 15 minutes plus tard : débloqué
  h.app.clock.now += 15 * 60 * 1000 + 1;
  assert.equal((await visitor(h, '203.0.113.51').post(`/api/public/${token}/acces`, { password: share.password })).status, 200);

  // Blocage par adresse IP : 5 échecs répartis sur deux liens
  const other = await createLink(h, { protect: true }, h.otherListId);
  const ip = visitor(h, '203.0.113.60');
  for (let i = 0; i < 3; i++) await ip.post(`/api/public/${token}/acces`, { password: 'faux' });
  await ip.post(`/api/public/${other.token}/acces`, { password: 'faux' });
  assert.equal((await ip.post(`/api/public/${other.token}/acces`, { password: 'faux' })).status, 429);
  assert.equal((await ip.post(`/api/public/${other.token}/acces`, { password: other.share.password })).status, 429);
  assert.ok(h.app.logs.some((line) => line.includes('lien_public_saisie_bloquee')));
});

test('plafond de liens invalides essayés par adresse IP', async (t) => {
  const h = await household(t);
  const { token } = await createLink(h);
  const scanner = visitor(h, '203.0.113.70');
  for (let i = 0; i < 19; i++) assert.equal((await scanner.get(`/api/public/${crypto.randomBytes(32).toString('base64url')}`)).status, 404);
  assert.equal((await scanner.request('GET', `/p/${crypto.randomBytes(32).toString('base64url')}`)).status, 404); // 20e
  const blocked = await scanner.get(`/api/public/${token}`);
  assert.deepEqual([blocked.status, blocked.body.error], [429, "Trop d'essais, réessayez plus tard."]);
  assert.equal((await scanner.request('GET', `/p/${token}`)).status, 429);
  // Les autres adresses ne sont pas touchées
  assert.equal((await visitor(h, '203.0.113.71').get(`/api/public/${token}`)).status, 200);
  assert.ok(h.app.logs.some((line) => line.includes('lien_public_ip_bloquee')));
});

test('« Nouveau mot de passe » et « Retirer » : l\'ancien mot de passe et les cookies ne marchent plus', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h, { protect: true });
  const v = visitor(h);
  await v.post(`/api/public/${token}/acces`, { password: share.password });
  assert.equal((await v.get(`/api/public/${token}`)).status, 200);

  // Nouveau mot de passe
  const renewed = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { password: 'new' });
  assert.equal(renewed.status, 200);
  const newPassword = renewed.body.share.password;
  assert.equal(newPassword.length, 16);
  assert.notEqual(newPassword, share.password);
  assert.equal((await v.get(`/api/public/${token}`)).status, 401, 'cookie invalidé');
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: share.password })).status, 401, 'ancien refusé');
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: newPassword })).status, 200);
  assert.equal((await v.get(`/api/public/${token}`)).status, 200);

  // Retirer le mot de passe : le lien devient ouvert, le cookie est effacé…
  const removed = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { password: 'none' });
  assert.equal(removed.body.share.protected, false);
  assert.equal(h.app.ctx.publicAccess.size(), 0);
  assert.equal((await visitor(h, '203.0.113.90').get(`/api/public/${token}`)).status, 200);
  // … et quand un mot de passe est remis, l'ancien cookie ne revient pas
  const added = await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { password: 'new' });
  assert.equal((await v.get(`/api/public/${token}`)).status, 401);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: newPassword })).status, 401);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: added.body.share.password })).status, 200);

  // Arrêt du lien : cookie effacé
  await h.guillaume.del(`/api/lists/${h.listId}/share`);
  assert.equal(h.app.ctx.publicAccess.size(), 0);
  // Retirer un mot de passe absent : refusé
  await createLink(h);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { password: 'none' })).status, 400);
});

test('ni le jeton ni le mot de passe en clair dans la base ou le journal', async (t) => {
  const h = await household(t);
  const { share, token } = await createLink(h, { protect: true });
  const renewed = (await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { password: 'new' })).body.share.password;
  const v = visitor(h);
  await v.post(`/api/public/${token}/acces`, { password: 'faux' });
  await v.post(`/api/public/${token}/acces`, { password: renewed });
  await v.get(`/api/public/${token}`);
  await h.guillaume.request('PUT', `/api/lists/${h.listId}/share`, { durationHours: 5 });
  await h.guillaume.del(`/api/lists/${h.listId}/share`);

  // Tout le contenu de la base, table par table, en texte
  const tables = h.app.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
  const dump = tables.map((name) => JSON.stringify(h.app.db.prepare(`SELECT * FROM "${name}"`).all())).join('\n');
  for (const secret of [token, share.password, renewed, v.jar.get('listo_lien') ?? 'x'.repeat(43)]) {
    assert.equal(dump.includes(secret), false, 'secret trouvé dans la base');
    assert.equal(h.app.logs.join('\n').includes(secret), false, 'secret trouvé dans le journal');
  }
  const row = h.app.db.prepare('SELECT * FROM public_shares').get();
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  assert.match(row.token_sealed, /^v1:/);
  // Le journal cite le partage par son numéro
  for (const event of ['lien_public_cree', 'lien_public_nouveau_mot_de_passe', 'lien_public_mot_de_passe_refuse', 'lien_public_ouvert', 'lien_public_duree_changee', 'lien_public_arrete']) {
    assert.ok(h.app.logs.some((line) => line.includes(event) && line.includes(`partage=${row.id}`)), event);
  }
});

test('nettoyage : liens arrêtés ou expirés depuis plus de 30 jours supprimés', async (t) => {
  const h = await household(t);
  await createLink(h, { durationHours: 1 });                      // expirera
  await createLink(h, {}, h.otherListId);
  await h.guillaume.del(`/api/lists/${h.otherListId}/share`);     // arrêté
  const thirdList = uuid();
  await h.guillaume.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId: thirdList, name: 'Durable', categoryId: 2 }] });
  await createLink(h, { durationHours: null }, thirdList);        // illimité : gardé
  h.app.clock.now += 29 * 24 * HOUR;
  assert.equal(h.app.ctx.shares.purgeOld(), 0);
  h.app.clock.now += 2 * 24 * HOUR;
  assert.equal(h.app.ctx.shares.purgeOld(), 2);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM public_shares').pluck().get(), 1);
});
