// Notifications push, étape 1 (socle) : adresses autorisées (anti-SSRF),
// abonnements liés au compte et à la session, notification test chiffrée,
// nettoyage des abonnements, clés VAPID dans secrets/, fonction coupée.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { startTestApp, setupAdmin, addUser, login, tempDir, ORIGIN } from './helpers.js';
import { checkEndpoint, checkKeys, fetchPush, preparePushKeys, loadOrCreateVapidKeys, buildMessage, MAX_DEVICES } from '../server/push.js';
import { decryptMessage, verifyVapid, toB64url, generateVapidKeys, MAX_PLAINTEXT_BYTES } from '../server/webpush.js';
import { loadConfig } from '../server/config.js';

// Faux appareil : une paire de clés et un secret, comme un navigateur
function fakeDevice(endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomBytes(12).toString('hex')}`) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    subscription: { endpoint, keys: { p256dh: toB64url(ecdh.getPublicKey()), auth: toB64url(auth) } },
    read: (body) => JSON.parse(decryptMessage({ body, uaPrivate: ecdh.getPrivateKey(), uaPublic: ecdh.getPublicKey(), authSecret: auth }).toString()),
  };
}

// Faux service de push : note chaque envoi et répond le statut demandé
function fakePushService(status = 201) {
  const calls = [];
  const service = async (endpoint, { headers, body }) => {
    calls.push({ endpoint, headers, body });
    return { status: typeof service.status === 'function' ? service.status(endpoint) : service.status };
  };
  service.status = status;
  service.calls = calls;
  return service;
}

const put = (client, url, body) => client.request('PUT', url, body);

async function startPush(t, options = {}) {
  const push = fakePushService();
  const app = await startTestApp(t, { config: { push: true }, pushRequest: push, ...options });
  const admin = await setupAdmin(app);
  return { app, admin, push };
}

// --- Adresses (anti-SSRF) ---

test('adresses autorisées : les services de push connus, en https, et rien d\'autre', () => {
  const ok = [
    'https://fcm.googleapis.com/fcm/send/abc:APA91bH',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
    'https://push.services.mozilla.com/wpush/v1/gAAAAA',
    'https://web.push.apple.com/QGuQyavXutnMH2Kr',
    'https://wns2-by3p.notify.windows.com/w/?token=BQYAAAD',
  ];
  for (const url of ok) assert.equal(checkEndpoint(url), url, url);
  const refused = [
    'http://fcm.googleapis.com/fcm/send/abc',             // pas https
    'https://localhost/push',                              // domaine local
    'https://listo.local/push',
    'https://127.0.0.1/push',                              // adresses IP écrites en chiffres
    'https://192.168.1.10/push',
    'https://10.0.0.1/push',
    'https://169.254.169.254/latest/meta-data',
    'https://2130706433/push',                             // 127.0.0.1 en un seul nombre
    'https://0x7f.1/push',
    'https://[::1]/push',                                  // IPv6
    'https://[fe80::1]/push',
    'https://[::ffff:127.0.0.1]/push',
    'https://fcm.googleapis.com:8443/fcm/send/abc',        // port inhabituel
    'https://fcm.googleapis.com:80/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',   // identifiant dans l'adresse
    'https://fcm.googleapis.com.evil.example/fcm/send/abc', // faux suffixe
    'https://evil.fcm.googleapis.com/fcm/send/abc',        // sous-domaine non prévu
    'https://evilfcm.googleapis.com/fcm/send/abc',
    'https://push.apple.com/abc',                          // suffixe sans sous-domaine
    'https://push.apple.com.evil.example/abc',
    'https://evilpush.apple.com/abc',
    'https://notify.windows.com.evil.example/w/',
    'https://fcm.googleapis.com./fcm/send/abc',            // point final
    'https://fcm.googleapis.com/fcm/send/abc#x',
    'https://fcm.googleapis.com/fcm/send/a b',
    `https://fcm.googleapis.com/${'a'.repeat(1100)}`,      // trop longue
    'javascript:alert(1)', '', null, 42,
  ];
  for (const url of refused) assert.equal(checkEndpoint(url), null, String(url));
});

test('clés d\'un abonnement : clé P-256 valable (65 octets, sur la courbe) et secret de 16 octets', () => {
  const { subscription } = fakeDevice();
  assert.deepEqual(checkKeys(subscription.keys), subscription.keys);
  assert.equal(checkKeys({ ...subscription.keys, auth: toB64url(crypto.randomBytes(15)) }), null);
  assert.equal(checkKeys({ ...subscription.keys, p256dh: toB64url(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)])) }), null);
  assert.equal(checkKeys({ p256dh: 'pas du base64 !', auth: subscription.keys.auth }), null);
  assert.equal(checkKeys(null), null);
});

// --- Envoi réel (fetchPush), contre un petit serveur local ---

async function localServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('envoi : aucune redirection suivie, réponse lue sur 4 ko au plus, délai court', async (t) => {
  let followed = false;
  const base = await localServer(t, (req, res) => {
    if (req.url === '/redirige') { res.writeHead(302, { Location: '/ailleurs' }); return res.end(); }
    if (req.url === '/ailleurs') { followed = true; res.writeHead(201); return res.end(); }
    if (req.url === '/enorme') { res.writeHead(201); res.write(Buffer.alloc(64 * 1024, 120)); return res.end(); }
    if (req.url === '/muet') return; // ne répond jamais
    res.writeHead(201);
    res.end();
  });
  assert.equal((await fetchPush(`${base}/redirige`, { headers: {}, body: Buffer.from('x') })).status, 302);
  assert.equal(followed, false, 'la redirection n\'est pas suivie');
  assert.equal((await fetchPush(`${base}/enorme`, { headers: {}, body: Buffer.from('x') })).status, 201);
  await assert.rejects(fetchPush(`${base}/muet`, { headers: {}, body: Buffer.from('x'), timeoutMs: 200 }));
});

// --- Abonnement et notification test ---

test('abonnement : lié au compte et à la session ; la notification test est chiffrée pour cet appareil seulement', async (t) => {
  const { app, admin, push } = await startPush(t);
  const device = fakeDevice();
  const me = await admin.get('/api/me');
  assert.equal(me.body.user.push, true);

  let res = await admin.get('/api/push');
  assert.equal(res.status, 200);
  assert.equal(res.body.device.subscribed, false);
  assert.match(res.body.publicKey, /^B[\w-]{86}$/, 'clé publique non compressée (65 octets)');

  res = await put(admin, '/api/push/subscription', device.subscription);
  assert.equal(res.status, 200);
  assert.equal(res.body.device.subscribed, true);

  // Un autre appareil (autre session) du même compte n'est pas « cet appareil »
  const other = app.client();
  await login(other, 'guillaume', 'MotDePasseAdmin!');
  assert.equal((await other.get('/api/push')).body.device.subscribed, false);
  assert.equal((await other.post('/api/push/test')).status, 409);
  assert.equal(push.calls.length, 0);

  res = await admin.post('/api/push/test');
  assert.equal(res.status, 200);
  assert.equal(push.calls.length, 1);
  const [call] = push.calls;
  assert.equal(call.endpoint, device.subscription.endpoint);
  assert.equal(call.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(call.headers.TTL, '300');
  assert.ok(call.body.length <= 4096);
  const vapid = verifyVapid(call.headers.Authorization);
  assert.ok(vapid, 'signature VAPID valable');
  assert.equal(vapid.claims.aud, 'https://fcm.googleapis.com');
  assert.equal(vapid.claims.sub, ORIGIN, 'sujet : l\'adresse publique de Listo, jamais une adresse e-mail');
  assert.equal(vapid.publicKey, res.body.publicKey ?? (await admin.get('/api/push')).body.publicKey);
  const message = device.read(call.body);
  assert.deepEqual(message, {
    web_push: 8030,
    notification: { title: 'Listo', lang: 'fr-FR', dir: 'ltr', navigate: `${ORIGIN}/#/reglages/notifications`, body: 'Notification test : les notifications arrivent bien sur cet appareil.', tag: 'listo-test' },
  });
  // Rien de l'abonnement dans la base en dehors de sa table, rien dans les journaux
  assert.ok(!app.logs.join('\n').includes(device.subscription.endpoint));
  assert.ok(!app.logs.join('\n').includes(device.subscription.keys.p256dh));
});

test('abonnement refusé : service inconnu, adresse interne, clés invalides (400) ; rien n\'est enregistré ni appelé', async (t) => {
  const { app, admin, push } = await startPush(t);
  for (const endpoint of ['https://127.0.0.1/x', 'https://192.168.1.10/x', 'https://[::1]/x', 'https://exemple.fr/push', 'https://fcm.googleapis.com:444/x', 'http://fcm.googleapis.com/x']) {
    const res = await put(admin, '/api/push/subscription', { ...fakeDevice(endpoint).subscription });
    assert.equal(res.status, 400, endpoint);
    assert.match(res.body.error, /pas reconnu/);
  }
  const bad = fakeDevice().subscription;
  assert.equal((await put(admin, '/api/push/subscription', { ...bad, keys: { ...bad.keys, auth: 'AAAA' } })).status, 400);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM push_subscriptions').pluck().get(), 0);
  assert.equal(push.calls.length, 0);
});

test('abonnement : protection CSRF et session obligatoires', async (t) => {
  const { app, admin } = await startPush(t);
  const device = fakeDevice();
  // Sans session
  const anonymous = app.client();
  assert.equal((await put(anonymous, '/api/push/subscription', device.subscription)).status, 401);
  // Depuis un autre site : même cookie, autre origine
  const foreign = app.client({ origin: 'https://autre-site.example' });
  for (const [name, value] of admin.jar) foreign.jar.set(name, value);
  assert.equal((await put(foreign, '/api/push/subscription', device.subscription)).status, 403);
  assert.equal((await foreign.post('/api/push/test')).status, 403);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM push_subscriptions').pluck().get(), 0);
});

test('nettoyage : déconnexion de l\'appareil, réponse 404 ou 410 du service, compte supprimé', async (t) => {
  const { app, admin, push } = await startPush(t);
  const count = () => app.db.prepare('SELECT COUNT(*) FROM push_subscriptions').pluck().get();
  const warn = t.mock.method(console, 'warn', () => {});

  // Déconnexion : l'abonnement de cet appareil disparaît
  await put(admin, '/api/push/subscription', fakeDevice().subscription);
  assert.equal(count(), 1);
  await admin.post('/api/logout');
  assert.equal(count(), 0);

  // 410 (et 404) : abonnement effacé, une ligne sans adresse dans les journaux
  for (const status of [410, 404]) {
    const client = app.client();
    await login(client, 'guillaume', 'MotDePasseAdmin!');
    const device = fakeDevice();
    await put(client, '/api/push/subscription', device.subscription);
    push.status = status;
    const res = await client.post('/api/push/test');
    assert.equal(res.status, 409);
    assert.match(res.body.error, /expiré/);
    assert.equal(count(), 0);
    const lines = warn.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.match(lines, new RegExp(`HTTP ${status}`));
    assert.ok(!lines.includes(device.subscription.endpoint));
  }
  push.status = 201;

  // Compte supprimé : ses abonnements partent avec lui (cascade)
  const userId = await addUser(app.db, { username: 'lea', password: 'MotDePasseLea!!' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasseLea!!');
  await put(lea, '/api/push/subscription', fakeDevice().subscription);
  assert.equal(count(), 1);
  app.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  assert.equal(count(), 0);
});

test('nettoyage : session expirée ; compte désactivé ou session fermée entre-temps : rien n\'est envoyé', async (t) => {
  const { app, admin, push } = await startPush(t);
  const userId = await addUser(app.db, { username: 'lea', password: 'MotDePasseLea!!' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasseLea!!');
  await put(lea, '/api/push/subscription', fakeDevice().subscription);
  // Compte désactivé : l'envoi n'a pas lieu
  app.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(userId);
  await app.ctx.push.sendToUser(userId, buildMessage({ title: 'x', navigate: `${ORIGIN}/` }));
  assert.equal(push.calls.length, 0);
  app.db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(userId);
  await app.ctx.push.sendToUser(userId, buildMessage({ title: 'x', navigate: `${ORIGIN}/` }));
  assert.equal(push.calls.length, 1);
  // Session expirée : plus rien, puis le ménage l'efface avec son abonnement
  app.clock.now += 31 * 24 * 3600 * 1000;
  await app.ctx.push.sendToUser(userId, buildMessage({ title: 'x', navigate: `${ORIGIN}/` }));
  assert.equal(push.calls.length, 1);
  app.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(app.clock.now).toISOString());
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM push_subscriptions').pluck().get(), 0);
  void admin;
});

test(`au plus ${MAX_DEVICES} appareils par compte : le plus ancien laisse sa place ; une adresse change de session`, async (t) => {
  const { app } = await startPush(t);
  const devices = [];
  for (let i = 0; i <= MAX_DEVICES; i++) {
    const client = app.client();
    await login(client, 'guillaume', 'MotDePasseAdmin!');
    const device = fakeDevice();
    app.clock.now += 1000;
    assert.equal((await put(client, '/api/push/subscription', device.subscription)).status, 200);
    devices.push({ client, device });
  }
  const endpoints = app.db.prepare('SELECT endpoint FROM push_subscriptions').pluck().all();
  assert.equal(endpoints.length, MAX_DEVICES);
  assert.ok(!endpoints.includes(devices[0].device.subscription.endpoint), 'le plus ancien est parti');
  assert.equal((await devices[0].client.get('/api/push')).body.device.subscribed, false);
  // La même adresse, envoyée depuis une autre session : elle y passe (une seule ligne)
  await put(devices[1].client, '/api/push/subscription', devices[5].device.subscription);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM push_subscriptions WHERE endpoint = ?').pluck().get(devices[5].device.subscription.endpoint), 1);
  assert.equal((await devices[5].client.get('/api/push')).body.device.subscribed, false);
});

test('limites : 10 notifications test par heure et par compte, 30 changements d\'abonnement', async (t) => {
  const { app, admin } = await startPush(t);
  await put(admin, '/api/push/subscription', fakeDevice().subscription);
  for (let i = 0; i < 10; i++) assert.equal((await admin.post('/api/push/test')).status, 200);
  const res = await admin.post('/api/push/test');
  assert.equal(res.status, 429);
  app.clock.now += 61 * 60 * 1000;
  assert.equal((await admin.post('/api/push/test')).status, 200);
  let last;
  for (let i = 0; i < 30; i++) last = await put(admin, '/api/push/subscription', fakeDevice().subscription);
  assert.equal(last.status, 200);
  assert.equal((await put(admin, '/api/push/subscription', fakeDevice().subscription)).status, 429);
});

test('message : format Declarative Web Push, 4 ko au plus une fois chiffré (texte raccourci au besoin)', () => {
  const text = buildMessage({ title: 'Léa a modifié « Courses »', body: 'x'.repeat(10000), navigate: 'https://listo.exemple.fr/#/listes/1', tag: 'liste-1' });
  assert.ok(Buffer.byteLength(text) <= MAX_PLAINTEXT_BYTES);
  const message = JSON.parse(text);
  assert.equal(message.web_push, 8030);
  assert.equal(message.notification.title, 'Léa a modifié « Courses »');
  assert.equal(message.notification.navigate, 'https://listo.exemple.fr/#/listes/1');
  assert.ok(message.notification.body.endsWith('…'));
});

// --- Fonction coupée ---

test('LISTO_PUSH absente : aucune clé créée, adresses inconnues (404), aucune demande sortante', async (t) => {
  assert.equal(loadConfig({}).push, false, 'désactivée par défaut');
  assert.equal(loadConfig({ LISTO_PUSH: 'yes' }).push, false);
  assert.equal(loadConfig({ LISTO_PUSH: ' ON ' }).push, true);
  const dir = tempDir(t);
  const file = path.join(dir, 'vapid.json');
  assert.equal(preparePushKeys({ push: false, vapidPath: file }), null);
  assert.equal(fs.existsSync(file), false, 'aucune clé créée');

  const push = fakePushService();
  const app = await startTestApp(t, { pushRequest: push });
  const admin = await setupAdmin(app);
  assert.equal(app.ctx.push, null);
  assert.equal((await admin.get('/api/me')).body.user.push, false);
  for (const [method, url] of [['GET', '/api/push'], ['PUT', '/api/push/subscription'], ['DELETE', '/api/push/subscription'], ['POST', '/api/push/test']]) {
    const res = await admin.request(method, url, method === 'GET' ? undefined : fakeDevice().subscription);
    assert.equal(res.status, 404, `${method} ${url}`);
  }
  // Activité ordinaire : aucune demande vers un service de push
  const listId = crypto.randomUUID();
  await admin.post('/api/ops', { ops: [
    { id: crypto.randomUUID(), type: 'list.create', listId, name: 'Courses', listType: 'shopping' },
    { id: crypto.randomUUID(), type: 'item.create', listId, itemId: crypto.randomUUID(), name: 'Lait' },
  ] });
  assert.equal(push.calls.length, 0);
});

test('clés VAPID : créées une fois dans secrets/ (droits 600), relues ensuite ; un fichier abîmé arrête Listo', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'secrets', 'vapid.json');
  const first = preparePushKeys({ push: true, vapidPath: file });
  assert.equal(first.created, true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const second = loadOrCreateVapidKeys(file);
  assert.equal(second.created, false);
  assert.deepEqual(second.keys, first.keys);
  // Même dossier que la clé de chiffrement (LISTO_KEY_PATH)
  assert.equal(loadConfig({ LISTO_KEY_PATH: '/secrets/secret.key' }).vapidPath, '/secrets/vapid.json');
  // Paire qui ne va pas ensemble, ou fichier illisible : arrêt avec un message clair
  fs.writeFileSync(file, JSON.stringify({ publicKey: first.keys.publicKey, privateKey: generateVapidKeys().privateKey }));
  assert.throws(() => loadOrCreateVapidKeys(file), /invalide.*Restaurez/);
  fs.writeFileSync(file, 'abîmé');
  assert.throws(() => loadOrCreateVapidKeys(file), /invalide/);
});
