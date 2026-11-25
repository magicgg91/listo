// Connexion avec Authelia (OpenID Connect, LISTO_OIDC=on, 15 novembre 2026).
// Un faux Authelia (aucun vrai réseau) signe de vrais jetons RS256 ; les
// tests suivent le parcours complet : départ, retour, échange du code,
// vérifications du jeton, correspondance des comptes, demandes de compte,
// double authentification, et tout ce qui doit être refusé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { verifyIdToken, usernameFrom, MAX_PENDING_REQUESTS } from '../server/oidc.js';
import { configProblem, loadConfig } from '../server/config.js';
import { ISSUER, SECRET, fakeAuthelia, OIDC_CONFIG, oidcApp, signIn, PEOPLE } from './oidc-helpers.js';

test('désactivée (par défaut) : /oidc/… répond 404, aucun bouton, aucun appel vers Authelia', async (t) => {
  const fake = fakeAuthelia();
  const app = await startTestApp(t, { oidcRequest: fake.request });
  const client = app.client();
  for (const url of ['/oidc/connexion', '/oidc/retour?code=x&state=y']) {
    assert.equal((await client.request('GET', url, undefined, {}, { redirect: 'manual' })).status, 404, url);
  }
  assert.equal((await client.get('/api/setup')).body.oidc, null);
  assert.deepEqual(fake.calls, []);
});

test('activée : le bouton est annoncé (son nom seul) ; départ vers Authelia avec state, nonce et PKCE, cookie lié au navigateur', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const client = app.client();
  assert.deepEqual((await client.get('/api/setup')).body.oidc, { name: 'Authelia' });
  const start = await client.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  assert.equal(start.status, 303);
  const url = new URL(start.headers.get('location'));
  assert.match(url.searchParams.get('redirect_uri'), /^https?:\/\/[^/]+\/oidc\/retour$/);
  for (const key of ['state', 'nonce', 'code_challenge']) assert.ok(url.searchParams.get(key).length >= 43, key);
  const cookie = start.setCookies.find((c) => c.startsWith('listo_oidc='));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(start.headers.get('cache-control'), 'no-store');
});

test('même identifiant : le compte Listo s\'ouvre, relié à ce compte Authelia ; majuscules ignorées ; pas de second code si Authelia a fait la double authentification', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'LEA'), '/#/listes');
  const me = await browser.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'lea');
  assert.equal(app.db.prepare('SELECT oidc_sub FROM users WHERE id = ?').pluck().get(leaId), 'sub-lea');
  assert.ok(app.logs.some((line) => line.includes('login_success') && line.includes('method="oidc"')));
  // Journal toujours en anglais, sans nom de fournisseur écrit en dur
  assert.ok(!app.logs.filter((line) => line.includes('[journal]')).some((line) => /authelia/i.test(line)));
  // Jamais de jeton ni de secret dans le journal
  assert.ok(!app.logs.join('\n').includes(SECRET));
});

test('un autre compte Authelia avec le même nom est refusé une fois le compte relié', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  await setupAdmin(app);
  await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  assert.equal(await signIn(app.client(), fake, 'lea'), '/#/listes');
  const intruder = app.client();
  assert.equal(await signIn(intruder, fake, 'imposteur'), '/#/connexion?authelia=refuse');
  assert.equal((await intruder.get('/api/me')).status, 401);
  assert.equal(app.db.prepare("SELECT COUNT(*) FROM account_requests").pluck().get(), 0);
});

test('compte désactivé : refusé', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  await setupAdmin(app);
  await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea', active: 0 });
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'lea'), '/#/connexion?authelia=refuse');
  assert.equal((await browser.get('/api/me')).status, 401);
});

test('double authentification Listo activée et pas faite chez Authelia : le code à 6 chiffres est demandé', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  await setupAdmin(app);
  app.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = 'x' WHERE username = 'guillaume'").run();
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'admin2fa'), '/#/connexion?authelia=code');
  assert.equal((await browser.get('/api/me')).status, 401, 'pas de session avant le code');
  assert.ok([...browser.jar.keys()].some((name) => name.endsWith('listo_2fa')), 'connexion en attente du code');
  // Faite chez Authelia (amr contient « mfa ») : pas de second code
  const other = app.client();
  assert.equal(await signIn(other, fake, 'adminmfa'), '/#/listes');
  assert.equal((await other.get('/api/me')).status, 200);
});

test('personne inconnue : demande de compte à l\'Admin, une seule ; refusée, elle n\'est pas refaite avant 30 jours', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  fake.nowS = () => Math.floor(app.clock.now / 1000); // Authelia suit l'horloge du test
  await setupAdmin(app);
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'nouveau'), '/#/connexion?authelia=demande');
  assert.equal((await browser.get('/api/me')).status, 401);
  assert.deepEqual(app.db.prepare('SELECT oidc_sub, username, display_name, status FROM account_requests').all(),
    [{ oidc_sub: 'sub-nouveau', username: 'nouveau.venu', display_name: 'Nouveau Venu', status: 'pending' }]);
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=attente');
  app.db.prepare("UPDATE account_requests SET status = 'refused', refused_at = ?").run(new Date(app.clock.now).toISOString());
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=refusee');
  app.clock.now += 31 * 24 * 60 * 60 * 1000;
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=demande');
});

test(`au plus ${MAX_PENDING_REQUESTS} demandes en attente`, async (t) => {
  const users = {};
  for (let i = 0; i <= MAX_PENDING_REQUESTS; i++) users[`p${i}`] = { sub: `sub-${i}`, username: `personne${i}`, name: `Personne ${i}` };
  const fake = fakeAuthelia({ users });
  const app = await oidcApp(t, fake);
  for (let i = 0; i < MAX_PENDING_REQUESTS; i++) assert.equal(await signIn(app.client(), fake, `p${i}`), '/#/connexion?authelia=demande');
  assert.equal(await signIn(app.client(), fake, `p${MAX_PENDING_REQUESTS}`), '/#/connexion?authelia=complet');
});

test('retour refusé : sans cookie, autre state, state réutilisé, expiré, erreur d\'Authelia', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  await setupAdmin(app);
  await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  // Autre navigateur que celui du départ (pas de cookie) : refusé
  const a = app.client();
  const start = await a.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  const back = fake.authorize(start.headers.get('location'), 'lea');
  const thief = app.client();
  const stolen = await thief.request('GET', `/oidc/retour?code=${back.code}&state=${back.state}`, undefined, {}, { redirect: 'manual' });
  assert.equal(stolen.headers.get('location'), '/#/connexion?authelia=erreur');
  assert.equal((await thief.get('/api/me')).status, 401);
  // state modifié
  assert.equal(await signIn(app.client(), fake, 'lea', { alter: (p) => p.set('state', 'x'.repeat(43)) }), '/#/connexion?authelia=erreur');
  // Réutilisé : le premier passage réussit, le second non
  const b = app.client();
  const s2 = await b.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  const back2 = fake.authorize(s2.headers.get('location'), 'lea');
  const cookie = [...b.jar].find(([name]) => name === 'listo_oidc');
  assert.equal((await b.request('GET', `/oidc/retour?code=${back2.code}&state=${back2.state}`, undefined, {}, { redirect: 'manual' })).headers.get('location'), '/#/listes');
  const replay = app.client();
  replay.jar.set(...cookie);
  assert.equal((await replay.request('GET', `/oidc/retour?code=${back2.code}&state=${back2.state}`, undefined, {}, { redirect: 'manual' })).headers.get('location'), '/#/connexion?authelia=expiree');
  // Plus de 10 minutes chez Authelia
  const c = app.client();
  const s3 = await c.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  const back3 = fake.authorize(s3.headers.get('location'), 'lea');
  app.clock.now += 11 * 60 * 1000;
  assert.equal((await c.request('GET', `/oidc/retour?code=${back3.code}&state=${back3.state}`, undefined, {}, { redirect: 'manual' })).headers.get('location'), '/#/connexion?authelia=expiree');
  // Annulé chez Authelia : jamais le texte d'Authelia dans l'adresse
  const d = app.client();
  const s4 = await d.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  const state4 = new URL(s4.headers.get('location')).searchParams.get('state');
  const cancelled = await d.request('GET', `/oidc/retour?error=access_denied&error_description=%3Cscript%3E&state=${state4}`, undefined, {}, { redirect: 'manual' });
  assert.equal(cancelled.headers.get('location'), '/#/connexion?authelia=annulee');
});

test('jeton refusé : mauvaise signature, « none », autre émetteur, autre destinataire, expiré, nonce différent, userinfo d\'un autre compte', async (t) => {
  const cases = [
    ['signature d\'une autre clé', (fake) => { fake.tweak.idToken = (claims) => fake.sign(claims, { key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }); }],
    ['algorithme none', (fake) => { fake.tweak.idToken = (claims) => fake.sign(claims, { alg: 'none' }); }],
    ['autre émetteur', (fake) => { fake.tweak.claims = { iss: 'https://ailleurs.test' }; }],
    ['autre destinataire', (fake) => { fake.tweak.claims = { aud: ['autre'], azp: 'autre' }; }],
    ['expiré', (fake) => { fake.tweak.claims = { exp: fake.nowS() - 3600 }; }],
    ['nonce différent', (fake) => { fake.tweak.claims = { nonce: 'pas-le-bon' }; }],
    ['userinfo d\'un autre compte', (fake) => { fake.tweak.userinfoSub = 'sub-autre'; }],
  ];
  for (const [label, setup] of cases) {
    const fake = fakeAuthelia({ users: PEOPLE });
    setup(fake);
    const app = await oidcApp(t, fake);
    await setupAdmin(app);
    await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
    const browser = app.client();
    assert.equal(await signIn(browser, fake, 'lea'), '/#/connexion?authelia=erreur', label);
    assert.equal((await browser.get('/api/me')).status, 401, label);
    assert.equal(app.db.prepare("SELECT oidc_sub FROM users WHERE username = 'lea'").pluck().get(), null, label);
  }
});

test('description d\'Authelia : adresses hors de son site refusées (aucun appel vers ailleurs)', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  fake.tweak.metadata = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/oidc/authorization`,
    token_endpoint: 'https://pirate.test/token',
    jwks_uri: `${ISSUER}/jwks.json`,
    userinfo_endpoint: `${ISSUER}/api/oidc/userinfo`,
  };
  const app = await oidcApp(t, fake);
  const start = await app.client().request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  assert.equal(start.headers.get('location'), '/#/connexion?authelia=indisponible');
  assert.ok(fake.calls.every((call) => call.includes(ISSUER)));
});

test('verifyIdToken et usernameFrom (calculs purs)', () => {
  assert.equal(usernameFrom(' Léa.Martin '), 'la.martin');
  assert.equal(usernameFrom('ZOE'), 'zoe');
  assert.throws(() => verifyIdToken('a.b', { keys: [], issuer: ISSUER, clientId: 'listo', nonce: 'n', nowS: 0 }), /malformed token/);
  const hs = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{}').toString('base64url')}.x`;
  assert.throws(() => verifyIdToken(hs, { keys: [{}], issuer: ISSUER, clientId: 'listo', nonce: 'n', nowS: 0 }), /signature algorithm refused/);
});

test('configuration : LISTO_OIDC=on exige l\'adresse d\'Authelia (https en production) et un client_id simple', () => {
  const base = loadConfig({ LISTO_PUBLIC_URL: 'https://listo.test', NODE_ENV: 'production' });
  assert.equal(base.oidc, false);
  assert.match(configProblem({ ...base, oidc: true, oidcIssuer: '' }), /LISTO_OIDC_ISSUER/);
  assert.match(configProblem({ ...base, oidc: true, oidcIssuer: 'http://auth.test' }), /https/);
  assert.match(configProblem({ ...base, oidc: true, oidcIssuer: 'https://u:p@auth.test' }), /adresse simple/);
  assert.match(configProblem({ ...base, oidc: true, oidcIssuer: 'https://auth.test', oidcClientId: 'a b' }), /CLIENT_ID/);
  assert.equal(configProblem({ ...base, oidc: true, oidcIssuer: 'https://auth.test', oidcClientId: 'listo' }), null);
  const full = loadConfig({ LISTO_OIDC: 'on', LISTO_OIDC_ISSUER: 'https://auth.test', LISTO_OIDC_NAME: '<script>' });
  assert.equal(full.oidc, true);
  assert.equal(full.oidcName, 'SSO', 'nom invalide : nom neutre par défaut');
  assert.equal(full.oidcClientId, 'listo');
  assert.match(full.oidcSecretPath, /oidc-client-secret$/);
});

// Comptes invités (docs/cadrage-comptes.md) : « Accepter » propose aussi le
// rôle Invité ; jamais Admin et invité à la fois
test('Administration : une demande acceptée avec le rôle Invité crée un compte discret, qui entre avec le fournisseur', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const admin = await setupAdmin(app);
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=demande');
  const request = (await admin.get('/api/admin/users')).body.accountRequests[0];
  assert.equal((await admin.post(`/api/admin/account-requests/${request.id}/accept`, { username: 'nouveau', displayName: 'Nouveau', role: 'chef' })).status, 400);
  const accepted = await admin.post(`/api/admin/account-requests/${request.id}/accept`, { username: 'nouveau', displayName: 'Nouveau', role: 'guest' });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.user.role, 'guest');
  assert.deepEqual(app.db.prepare('SELECT role, guest FROM users WHERE id = ?').get(accepted.body.user.id), { role: 'user', guest: 1 });
  assert.match(app.logs.join('\n'), /account_request_accepted .*user="nouveau" role="guest"/);
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'nouveau'), '/#/listes');
  assert.equal((await browser.get('/api/me')).body.user.role, 'guest');
  // Son annuaire est vide ; celui de l'Admin le contient, avec son rôle
  assert.deepEqual((await browser.get('/api/users')).body.users, []);
  assert.equal((await admin.get('/api/users')).body.users.find((u) => u.displayName === 'Nouveau').role, 'guest');
});

test('Administration : l\'Admin voit la demande, l\'accepte (identifiant corrigé) ; la personne entre ensuite avec Authelia ; pastille de Réglages', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const admin = await setupAdmin(app);
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=demande');
  assert.equal((await admin.get('/api/me')).body.user.accountRequests, 1);
  const list = (await admin.get('/api/admin/users')).body;
  assert.equal(list.oidc, true);
  assert.equal(list.accountRequests.length, 1);
  const request = list.accountRequests[0];
  assert.deepEqual(Object.keys(request).sort(), ['createdAt', 'displayName', 'id', 'username'], 'jamais l\'identifiant interne d\'Authelia');
  // Identifiant invalide ou déjà pris : refusé
  assert.equal((await admin.post(`/api/admin/account-requests/${request.id}/accept`, { username: 'a b', displayName: 'X' })).status, 400);
  assert.equal((await admin.post(`/api/admin/account-requests/${request.id}/accept`, { username: 'guillaume', displayName: 'X' })).status, 409);
  const accepted = await admin.post(`/api/admin/account-requests/${request.id}/accept`, { username: 'nouveau', displayName: 'Nouveau Venu' });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.user.authelia, true);
  assert.equal(accepted.body.user.role, 'user');
  assert.equal((await admin.post(`/api/admin/account-requests/${request.id}/accept`, { username: 'autre', displayName: 'X' })).status, 404, 'déjà traitée');
  // Relié par son identifiant interne : il entre, même si son nom Authelia diffère
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'nouveau'), '/#/listes');
  assert.equal((await browser.get('/api/me')).body.user.username, 'nouveau');
  // Pas de connexion par mot de passe : personne ne connaît le sien
  assert.equal((await app.client().post('/api/login', { username: 'nouveau', password: 'nimporte quoi 123' })).status, 401);
});

test('Administration : refuser une demande ; délier un compte ; réservé à l\'Admin ; 404 quand la connexion Authelia est coupée', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const admin = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=demande');
  const [request] = (await admin.get('/api/admin/users')).body.accountRequests;
  assert.equal((await lea.post(`/api/admin/account-requests/${request.id}/refuse`)).status, 403);
  assert.equal((await lea.get('/api/me')).body.user.accountRequests, undefined, 'pas de pastille pour un Utilisateur');
  assert.equal((await admin.post(`/api/admin/account-requests/${request.id}/refuse`)).status, 204);
  assert.equal((await admin.get('/api/admin/users')).body.accountRequests.length, 0);
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=refusee');
  // Délier : un autre compte Authelia « lea » peut ensuite ouvrir le compte
  assert.equal(await signIn(app.client(), fake, 'lea'), '/#/listes');
  assert.equal(await signIn(app.client(), fake, 'imposteur'), '/#/connexion?authelia=refuse');
  assert.equal((await lea.del(`/api/admin/users/${leaId}/authelia`)).status, 403);
  const unlinked = await admin.del(`/api/admin/users/${leaId}/authelia`);
  assert.equal(unlinked.body.user.authelia, false);
  assert.equal(await signIn(app.client(), fake, 'imposteur'), '/#/listes');
  // Connexion Authelia coupée : routes des demandes inconnues
  const off = await startTestApp(t);
  const offAdmin = await setupAdmin(off);
  assert.equal((await offAdmin.post('/api/admin/account-requests/1/accept', { username: 'x1', displayName: 'X' })).status, 404);
  assert.deepEqual((await offAdmin.get('/api/admin/users')).body.accountRequests, []);
  assert.equal((await offAdmin.get('/api/me')).body.user.accountRequests, undefined);
});

test('mot de passe provisoire jamais changé : effacé à la connexion avec Authelia (pas d\'écran « Nouveau mot de passe », l\'Admin ne peut plus s\'en servir)', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const admin = await setupAdmin(app);
  await admin.post('/api/admin/users', { username: 'lea', displayName: 'Léa', password: 'provisoire-lea-123' });
  assert.equal(app.db.prepare("SELECT must_change_password FROM users WHERE username = 'lea'").pluck().get(), 1);
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'lea'), '/#/listes');
  assert.equal((await browser.get('/api/me')).body.user.mustChangePassword, false);
  assert.equal((await app.client().post('/api/login', { username: 'lea', password: 'provisoire-lea-123' })).status, 401);
  assert.ok(app.logs.some((line) => line.includes('temporary_password_cleared')));
});

test('échecs répétés depuis une même adresse : connexion avec Authelia bloquée 15 minutes', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const attacker = app.client({ ip: '203.0.113.9' });
  for (let i = 0; i < 5; i++) {
    const res = await attacker.request('GET', `/oidc/retour?code=x&state=${'y'.repeat(43)}`, undefined, {}, { redirect: 'manual' });
    assert.equal(res.headers.get('location'), '/#/connexion?authelia=erreur');
  }
  const blocked = await attacker.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  assert.equal(blocked.headers.get('location'), '/#/connexion?authelia=erreur', 'pas de départ vers Authelia');
  // Une autre adresse n'est pas touchée
  const other = await app.client({ ip: '203.0.113.10' }).request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' });
  assert.match(other.headers.get('location'), /^https:\/\/auth\.exemple\.test\//);
  app.clock.now += 16 * 60 * 1000;
  assert.match((await attacker.request('GET', '/oidc/connexion', undefined, {}, { redirect: 'manual' })).headers.get('location'), /^https:\/\/auth\.exemple\.test\//);
});

// --- Mode de connexion de la session, connexion locale coupée, Claude (15 novembre 2026) ---

test('session Authelia : indiquée (loginMethod), mot de passe et double authentification refusés ; session par mot de passe : permis', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const admin = await setupAdmin(app);
  assert.equal((await admin.get('/api/me')).body.user.loginMethod, 'password');
  const viaAuthelia = app.client();
  assert.equal(await signIn(viaAuthelia, fake, 'adminmfa'), '/#/listes');
  const me = (await viaAuthelia.get('/api/me')).body.user;
  assert.equal(me.loginMethod, 'oidc');
  assert.equal(me.localLogin, true);
  for (const [method, url] of [['POST', '/api/me/password'], ['POST', '/api/me/2fa/enable'], ['POST', '/api/me/2fa/verify'], ['POST', '/api/me/2fa/disable'], ['GET', '/api/me/2fa/qr.png']]) {
    const res = await viaAuthelia.request(method, url, method === 'POST' ? {} : undefined);
    assert.equal(res.status, 403, url);
    assert.match(res.body.error, /Authelia/);
  }
  // Session par mot de passe : la route répond (données manquantes), elle n'est pas fermée
  assert.notEqual((await admin.post('/api/me/password', {})).status, 403);
});

test('double authentification Listo demandée après Authelia : la session reste « Authelia »', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  await setupAdmin(app);
  const { generateTotpSecret, totpCode, totpStep } = await import('../server/totp.js');
  const { sealTotpSecret } = await import('../server/twofactor.js');
  const secret = generateTotpSecret();
  app.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE username = 'guillaume'").run(sealTotpSecret(app.ctx, 1, secret));
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'admin2fa'), '/#/connexion?authelia=code');
  const code = totpCode(secret, totpStep(app.clock.now));
  const res = await browser.post('/api/login/2fa', { code });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.user.loginMethod, 'oidc');
  assert.equal((await browser.get('/api/me')).body.user.loginMethod, 'oidc');
});

test('LISTO_LOCAL_LOGIN=off : exige Authelia ; plus de connexion par mot de passe ; sessions par mot de passe fermées ; comptes sans mot de passe', async (t) => {
  const base = loadConfig({ LISTO_PUBLIC_URL: 'https://listo.test', LISTO_LOCAL_LOGIN: 'off' });
  assert.equal(base.localLogin, false);
  assert.match(configProblem(base), /LISTO_OIDC=on/);
  assert.equal(configProblem({ ...base, oidc: true, oidcIssuer: 'https://auth.test' }), null);

  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  const admin = await setupAdmin(app); // session ouverte par mot de passe, avant la coupure
  await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  app.ctx.config.localLogin = false;   // coupure (comme un redémarrage avec LISTO_LOCAL_LOGIN=off)
  assert.equal((await app.client().get('/api/setup')).body.localLogin, false);
  assert.equal((await admin.get('/api/me')).status, 401, 'session par mot de passe fermée');
  assert.equal(app.db.prepare("SELECT COUNT(*) FROM sessions WHERE method = 'password'").pluck().get(), 0);
  const refused = await app.client().post('/api/login', { username: 'lea', password: 'MotDePasse-lea' });
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Authelia/);
  // Par Authelia : on entre
  const viaAuthelia = app.client();
  assert.equal(await signIn(viaAuthelia, fake, 'adminmfa'), '/#/listes');
  assert.equal((await viaAuthelia.get('/api/me')).body.user.localLogin, false);
  // Administration : compte créé sans mot de passe ; plus de réinitialisation
  const created = await viaAuthelia.post('/api/admin/users', { username: 'zoe', displayName: 'Zoé' });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.user.mustChangePassword, false);
  assert.equal((await viaAuthelia.post(`/api/admin/users/${created.body.user.id}/password`, { password: 'provisoire-123456' })).status, 403);
  assert.equal((await viaAuthelia.get('/api/admin/users')).body.localLogin, false);
});

test('retour après connexion : l\'écran « Autoriser Claude » demandé avant (retour=autoriser/<demande>), jamais une autre adresse', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake);
  await setupAdmin(app);
  const id = 'A'.repeat(22);
  const go = async (query) => {
    const client = app.client();
    const start = await client.request('GET', `/oidc/connexion?${query}`, undefined, {}, { redirect: 'manual' });
    const back = fake.authorize(start.headers.get('location'), 'adminmfa');
    return (await client.request('GET', `/oidc/retour?code=${back.code}&state=${back.state}`, undefined, {}, { redirect: 'manual' })).headers.get('location');
  };
  assert.equal(await go(`retour=autoriser/${id}`), `/#/autoriser/${id}`);
  for (const bad of ['retour=https://ailleurs.test', 'retour=listes', 'retour=autoriser/court', `retour=autoriser/${id}/x`]) assert.equal(await go(bad), '/#/listes', bad);
});

test('Claude depuis une session Authelia : reconfirmation par Authelia (connexion redemandée), à la place du mot de passe ; une seule fois', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await startTestApp(t, { config: { ...OIDC_CONFIG, mcp: true }, oidcRequest: fake.request, oidcClientSecret: SECRET });
  await setupAdmin(app);
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'adminmfa'), '/#/listes');
  // Une application demande l'accès (enregistrement automatique, puis /oauth/authorize)
  const reg = await fetch(`${app.base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }) });
  const clientId = (await reg.json()).client_id;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const authorize = await fetch(`${app.base}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'x', scope: 'lists:read', resource: 'http://listo.test/mcp' })}`, { redirect: 'manual' });
  const requestId = authorize.headers.get('location').match(/autoriser\/([A-Za-z0-9_-]{22})$/)[1];

  let shown = (await browser.get(`/api/oauth/demandes/${requestId}`)).body;
  assert.equal(shown.confirmWith, 'authelia');
  assert.equal(shown.confirmed, false);
  // Sans reconfirmation : refusé, même avec un mot de passe
  assert.equal((await browser.post(`/api/oauth/demandes/${requestId}/accord`, { scope: 'read', lists: 'all', password: 'MotDePasseAdmin!' })).status, 403);

  // Reconfirmation : Authelia doit redemander la connexion (prompt=login, max_age=0)
  const confirm = async (claims) => {
    fake.tweak.claims = claims;
    const start = await browser.request('GET', `/oidc/connexion?confirmer=${requestId}`, undefined, {}, { redirect: 'manual' });
    const url = new URL(start.headers.get('location'));
    assert.equal(url.searchParams.get('prompt'), 'login');
    assert.equal(url.searchParams.get('max_age'), '0');
    const back = fake.authorize(start.headers.get('location'), 'adminmfa');
    return (await browser.request('GET', `/oidc/retour?code=${back.code}&state=${back.state}`, undefined, {}, { redirect: 'manual' })).headers.get('location');
  };
  // Authelia n'a pas redemandé la connexion (auth_time ancien) : pas de confirmation
  assert.equal(await confirm({ auth_time: fake.nowS() - 3600 }), `/#/autoriser/${requestId}?authelia=non-confirme`);
  assert.equal((await browser.get(`/api/oauth/demandes/${requestId}`)).body.confirmed, false);
  // Connexion redemandée à l'instant : confirmée
  assert.equal(await confirm({ auth_time: fake.nowS() }), `/#/autoriser/${requestId}?authelia=confirme`);
  shown = (await browser.get(`/api/oauth/demandes/${requestId}`)).body;
  assert.equal(shown.confirmed, true);
  const ok = await browser.post(`/api/oauth/demandes/${requestId}/accord`, { scope: 'read', lists: 'all' });
  assert.equal(ok.status, 200, ok.text);
  assert.match(ok.body.redirect, /^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?code=/);
  // Reconfirmation impossible depuis une session par mot de passe, ou sans session
  const local = app.client();
  await login(local, 'guillaume', 'MotDePasseAdmin!');
  assert.equal((await local.request('GET', `/oidc/connexion?confirmer=${requestId}`, undefined, {}, { redirect: 'manual' })).headers.get('location'), '/#/connexion?authelia=erreur');
  assert.equal((await app.client().request('GET', `/oidc/connexion?confirmer=${requestId}`, undefined, {}, { redirect: 'manual' })).headers.get('location'), '/#/connexion?authelia=erreur');
});

// --- Tout fournisseur OpenID Connect (20 novembre 2026) ---

test('autre fournisseur (LISTO_OIDC_NAME=Authentik) : les messages de Listo disent son nom, jamais « Authelia »', async (t) => {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake, { oidcName: 'Authentik' });
  await setupAdmin(app);
  assert.deepEqual((await app.client().get('/api/setup')).body.oidc, { name: 'Authentik' });
  const session = app.client();
  assert.equal(await signIn(session, fake, 'adminmfa'), '/#/listes');
  const res = await session.post('/api/me/password', {});
  assert.equal(res.status, 403);
  assert.match(res.body.error, /Authentik/);
  assert.doesNotMatch(res.body.error, /Authelia/);
});

test('aucun écran ni message du serveur n\'écrit « Authelia » en dur (seulement le nom réglé)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '..');
  const files = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []));
  // L'aide (help-content.js, et en anglais help-content-en.js et help-en/)
  // cite Authelia comme exemple, avec Authentik et Pocket ID
  const guideFile = (f) => /(^|\/)help-content(-en)?\.js$|(^|\/)help-en\//.test(f);
  for (const file of [...files('server'), ...files('public/js')].filter((f) => !guideFile(f))) {
    const code = fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//'));
    assert.ok(!code.some((line) => line.includes('Authelia')), `${file} : « Authelia » en dur`);
  }
});
