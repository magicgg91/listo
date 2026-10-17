// Tests des comptes, des sessions et de la double authentification (étape 2).
// Chaque test démarre un Listo neuf, avec une base vide en mémoire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, tempDir, SETUP_CODE, ORIGIN } from './helpers.js';
import { createJournalFile } from '../server/audit.js';
import { totpCode, totpStep } from '../server/totp.js';
import { openTotpSecret } from '../server/twofactor.js';

const MINUTE = 60 * 1000;
const PASSWORD = 'MotDePasseMarie!';

// Code à 6 chiffres actuel d'un compte (comme l'afficherait son téléphone)
function currentCode(app, userId) {
  const user = app.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return totpCode(openTotpSecret(app.ctx, user), totpStep(app.clock.now));
}

// Active la 2FA d'un client connecté ; renvoie ses codes de secours.
// L'horloge avance ensuite de 30 s pour que le prochain code soit nouveau.
async function enableTwoFactor(app, client, userId) {
  const enable = await client.post('/api/me/2fa/enable');
  assert.equal(enable.status, 200);
  assert.match(enable.body.qrCode, /^data:image\/png;base64,/);
  assert.match(enable.body.uri, /^otpauth:\/\/totp\//);
  const verify = await client.post('/api/me/2fa/verify', { code: currentCode(app, userId) });
  assert.equal(verify.status, 200);
  app.clock.now += 30 * 1000;
  return verify.body.recoveryCodes;
}

// Prépare : premier Admin + un Utilisateur « marie »
async function withUser(t) {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  const marieId = await addUser(app.db, { username: 'marie', password: PASSWORD });
  return { app, admin, marieId };
}

// --- Création du premier Admin ---

test('/api/setup est refusé sans le bon code de démarrage', async (t) => {
  const app = await startTestApp(t);
  const client = app.client();
  assert.deepEqual((await client.get('/api/setup')).body, { needed: true });

  for (const code of [undefined, '', 'AAAA-BBBB-CCCC']) {
    const res = await client.post('/api/setup', { code, username: 'pirate', password: 'MotDePassePirate' });
    assert.equal(res.status, 403);
    assert.equal(res.setCookies.length, 0);
  }
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM users').pluck().get(), 0);

  // Le bon code est accepté (insensible aux tirets et aux minuscules)
  const ok = await client.post('/api/setup', {
    code: SETUP_CODE.toLowerCase().replaceAll('-', ''), username: 'guillaume', password: 'MotDePasseAdmin!',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.role, 'admin');
  assert.equal((await client.get('/api/me')).body.user.username, 'guillaume'); // connecté d'office
});

test('/api/setup est refusé dès qu\'un compte existe (même avec le bon code)', async (t) => {
  const app = await startTestApp(t);
  await setupAdmin(app);
  const client = app.client();
  assert.deepEqual((await client.get('/api/setup')).body, { needed: false });
  const res = await client.post('/api/setup', { code: SETUP_CODE, username: 'pirate', password: 'MotDePassePirate' });
  assert.equal(res.status, 403);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM users').pluck().get(), 1);
});

test('/api/setup est refusé si un compte existe déjà au démarrage', async (t) => {
  // Cas d'un redémarrage : index.js ne crée pas de code s'il y a des comptes
  const app = await startTestApp(t, { setupCode: null });
  await addUser(app.db, { username: 'guillaume', password: PASSWORD, role: 'admin' });
  const res = await app.client().post('/api/setup', { code: '', username: 'x', password: 'MotDePassePirate' });
  assert.equal(res.status, 403);
});

test('/api/setup : le code de démarrage est limité à 5 essais faux', async (t) => {
  const app = await startTestApp(t);
  const client = app.client();
  for (let i = 0; i < 5; i++) await client.post('/api/setup', { code: 'FAUX', username: 'x', password: 'MotDePassePirate' });
  const res = await client.post('/api/setup', { code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!' });
  assert.equal(res.status, 429);
});

test('/api/setup : mot de passe de 10 caractères minimum', async (t) => {
  const app = await startTestApp(t);
  const res = await app.client().post('/api/setup', { code: SETUP_CODE, username: 'guillaume', password: 'court' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /10 caractères/);
});

// --- Connexion ---

test('connexion réussie : identifiant insensible à la casse, cookie de session sûr', async (t) => {
  const { app } = await withUser(t);
  const client = app.client();
  const res = await login(client, 'MARIE', PASSWORD);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, 'marie');
  const cookie = res.setCookies.find((c) => c.startsWith('listo_session='));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=2592000/); // 30 jours
  assert.doesNotMatch(cookie, /Secure/);   // hors production (http://localhost)
  assert.equal((await client.get('/api/me')).body.user.username, 'marie');
});

test('en production, le cookie de session est « Secure » (HTTPS seulement)', async (t) => {
  const app = await startTestApp(t, { config: { production: true } });
  const admin = app.client();
  const res = await admin.post('/api/setup', { code: SETUP_CODE, username: 'guillaume', password: 'MotDePasseAdmin!' });
  assert.match(res.setCookies.find((c) => c.startsWith('listo_session=')), /Secure/);
});

test('le jeton de session est stocké haché en base (256 bits)', async (t) => {
  const { app } = await withUser(t);
  const client = app.client();
  await login(client, 'marie', PASSWORD);
  const token = client.jar.get('listo_session');
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  const ids = app.db.prepare('SELECT id FROM sessions').pluck().all();
  assert.ok(!ids.includes(token));
});

test('un identifiant inconnu et un mauvais mot de passe donnent exactement la même réponse', async (t) => {
  const { app } = await withUser(t);
  await addUser(app.db, { username: 'ancien', password: PASSWORD, active: 0 });
  const answers = [];
  for (const [username, password] of [['inconnu', PASSWORD], ['marie', 'MauvaisMotDePasse'], ['ancien', PASSWORD]]) {
    // Une adresse IP différente à chaque fois, pour ne pas être bloqué
    const res = await login(app.client({ ip: `10.0.0.${answers.length + 1}` }), username, password);
    answers.push({ status: res.status, text: res.text, cookies: res.setCookies.length, type: res.headers.get('content-type') });
  }
  assert.equal(answers[0].status, 401);
  assert.deepEqual(answers[1], answers[0]); // mauvais mot de passe = identifiant inconnu
  assert.deepEqual(answers[2], answers[0]); // compte désactivé = identifiant inconnu
  assert.equal(answers[0].cookies, 0);
});

// --- Limitation des tentatives ---

test('la 6e tentative ratée est bloquée, puis le blocage expire au bout de 15 minutes', async (t) => {
  const { app } = await withUser(t);
  const client = app.client({ ip: '203.0.113.7' });
  for (let i = 1; i <= 5; i++) {
    assert.equal((await login(client, 'marie', 'MauvaisMotDePasse')).status, 401, `tentative ${i}`);
  }
  // 6e tentative : bloquée, même avec le bon mot de passe, et même depuis une
  // autre adresse IP (l'identifiant est bloqué)
  const blocked = await login(client, 'marie', PASSWORD);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.setCookies.length, 0);
  assert.equal((await login(app.client({ ip: '198.51.100.9' }), 'marie', PASSWORD)).status, 429);

  app.clock.now += 15 * MINUTE - 1000;
  assert.equal((await login(client, 'marie', PASSWORD)).status, 429, 'encore bloqué à 14 min 59 s');
  app.clock.now += 1000;
  assert.equal((await login(client, 'marie', PASSWORD)).status, 200, 'débloqué après 15 minutes');
});

test('une même adresse IP est bloquée après 5 échecs, quels que soient les identifiants', async (t) => {
  const { app } = await withUser(t);
  const client = app.client({ ip: '203.0.113.8' });
  for (const name of ['a1', 'b2', 'c3', 'd4', 'e5']) await login(client, name, 'MauvaisMotDePasse');
  assert.equal((await login(client, 'marie', PASSWORD)).status, 429);
  // Marie peut toujours se connecter depuis une autre adresse
  assert.equal((await login(app.client({ ip: '198.51.100.1' }), 'marie', PASSWORD)).status, 200);
});

test('des tentatives envoyées toutes en même temps ne contournent pas la limite', async (t) => {
  const { app } = await withUser(t);
  const client = app.client({ ip: '203.0.113.9' });
  const results = await Promise.all(Array.from({ length: 12 }, () => login(client, 'marie', 'MauvaisMotDePasse')));
  assert.equal(results.filter((r) => r.status === 401).length, 5);
  assert.equal(results.filter((r) => r.status === 429).length, 7);
});

// --- Droits d'accès ---

test('un visiteur non connecté reçoit un refus partout', async (t) => {
  const { app } = await withUser(t);
  const visitor = app.client();
  const routes = [
    ['GET', '/api/me'], ['POST', '/api/me/password'], ['POST', '/api/me/2fa/enable'],
    ['POST', '/api/me/2fa/verify'], ['POST', '/api/me/2fa/disable'], ['POST', '/api/logout'],
    ['GET', '/api/admin/users'], ['DELETE', '/api/admin/users/1/2fa'], ['GET', '/api/route-inconnue'],
  ];
  for (const [method, url] of routes) {
    const res = await visitor.request(method, url, method === 'GET' ? undefined : {});
    assert.equal(res.status, 401, `${method} ${url}`);
  }
  // Un faux cookie de session ne change rien
  visitor.jar.set('listo_session', 'faux-jeton');
  assert.equal((await visitor.get('/api/me')).status, 401);
});

test('un cookie malformé est ignoré : requête non connectée, connexion toujours possible', async (t) => {
  const { app } = await withUser(t);
  const visitor = app.client();
  visitor.jar.set('listo_session', '%'); // encodage invalide
  assert.equal((await visitor.get('/api/me')).status, 401);
  assert.equal((await visitor.get('/api/setup')).status, 200);

  // La connexion fonctionne malgré le cookie illisible…
  const res = await login(visitor, 'marie', PASSWORD);
  assert.equal(res.status, 200);
  assert.equal((await visitor.get('/api/me')).status, 200);

  // …et un autre cookie mal encodé n'empêche pas de lire la session
  visitor.jar.set('autre', '%E0%A4%A');
  assert.equal((await visitor.get('/api/me')).body.user.username, 'marie');
});

test('un Utilisateur reçoit un refus sur les routes d\'administration', async (t) => {
  const { app } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  for (const [method, url] of [['GET', '/api/admin/users'], ['DELETE', '/api/admin/users/1/2fa'], ['POST', '/api/admin/categories']]) {
    const res = await marie.request(method, url, method === 'GET' ? undefined : {});
    assert.equal(res.status, 403, `${method} ${url}`);
  }
});

test("un Admin peut désactiver la 2FA d'un autre compte (téléphone perdu)", async (t) => {
  const { app, admin, marieId } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  await enableTwoFactor(app, marie, marieId);

  const res = await admin.del(`/api/admin/users/${marieId}/2fa`);
  assert.equal(res.status, 200);
  const row = app.db.prepare('SELECT totp_enabled, totp_secret FROM users WHERE id = ?').get(marieId);
  assert.deepEqual(row, { totp_enabled: 0, totp_secret: null });
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM recovery_codes').pluck().get(), 0);
  // Marie se reconnecte de nouveau avec son seul mot de passe
  assert.ok((await login(app.client(), 'marie', PASSWORD)).body.user);
  assert.equal((await admin.del('/api/admin/users/999/2fa')).status, 404);
});

// --- Double authentification ---

test("un compte avec 2FA n'obtient aucune session avant d'avoir donné son code", async (t) => {
  const { app, marieId } = await withUser(t);
  const setup = app.client();
  await login(setup, 'marie', PASSWORD);
  await enableTwoFactor(app, setup, marieId);
  const sessionsBefore = app.db.prepare('SELECT COUNT(*) FROM sessions').pluck().get();

  const phone = app.client();
  const step1 = await login(phone, 'marie', PASSWORD);
  assert.equal(step1.status, 200);
  assert.deepEqual(step1.body, { twoFactorRequired: true });
  assert.ok(!phone.jar.has('listo_session'), 'pas de cookie de session');
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), sessionsBefore);
  assert.equal((await phone.get('/api/me')).status, 401);

  // Mauvais code : toujours pas de session
  assert.equal((await phone.post('/api/login/2fa', { code: '000000' })).status, 401);
  assert.ok(!phone.jar.has('listo_session'));

  // Bon code : session ouverte
  const step2 = await phone.post('/api/login/2fa', { code: currentCode(app, marieId) });
  assert.equal(step2.status, 200);
  assert.equal((await phone.get('/api/me')).body.user.totpEnabled, true);
});

test('le code 2FA de connexion est limité à 5 essais faux', async (t) => {
  const { app, marieId } = await withUser(t);
  const setup = app.client();
  await login(setup, 'marie', PASSWORD);
  await enableTwoFactor(app, setup, marieId);

  const phone = app.client({ ip: '203.0.113.20' });
  await login(phone, 'marie', PASSWORD);
  for (let i = 1; i <= 5; i++) {
    assert.equal((await phone.post('/api/login/2fa', { code: '000000' })).status, 401, `essai ${i}`);
  }
  // 6e essai : bloqué, même avec le bon code
  assert.equal((await phone.post('/api/login/2fa', { code: currentCode(app, marieId) })).status, 429);
  // Se reconnecter avec le mot de passe ne redonne pas d'essais
  assert.equal((await login(phone, 'marie', PASSWORD)).status, 429);
});

test('un code TOTP déjà utilisé est refusé', async (t) => {
  const { app, marieId } = await withUser(t);
  const setup = app.client();
  await login(setup, 'marie', PASSWORD);
  await enableTwoFactor(app, setup, marieId);
  const code = currentCode(app, marieId);

  const first = app.client();
  await login(first, 'marie', PASSWORD);
  assert.equal((await first.post('/api/login/2fa', { code })).status, 200);

  // Même code, quelques secondes plus tard, sur un autre appareil : refusé
  app.clock.now += 5 * 1000;
  const second = app.client();
  await login(second, 'marie', PASSWORD);
  assert.equal((await second.post('/api/login/2fa', { code })).status, 401);
  assert.ok(!second.jar.has('listo_session'));
});

test('un code de secours fonctionne une fois, puis est refusé', async (t) => {
  const { app, marieId } = await withUser(t);
  const setup = app.client();
  await login(setup, 'marie', PASSWORD);
  const codes = await enableTwoFactor(app, setup, marieId);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);

  // Les codes sont stockés hachés, jamais en clair
  const stored = app.db.prepare('SELECT code_hash FROM recovery_codes').pluck().all();
  for (const code of codes) assert.ok(!stored.some((hash) => hash.includes(code.replace('-', ''))));

  const first = app.client();
  await login(first, 'marie', PASSWORD);
  assert.equal((await first.post('/api/login/2fa', { code: codes[3].toUpperCase() })).status, 200);

  const second = app.client();
  await login(second, 'marie', PASSWORD);
  assert.equal((await second.post('/api/login/2fa', { code: codes[3] })).status, 401);
  // Un autre code de secours reste valable
  assert.equal((await second.post('/api/login/2fa', { code: codes[4] })).status, 200);
});

test('le secret 2FA est chiffré en base', async (t) => {
  const { app, marieId } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  const enable = await marie.post('/api/me/2fa/enable');
  const stored = app.db.prepare('SELECT totp_secret FROM users WHERE id = ?').pluck().get(marieId);
  assert.match(stored, /^v1:/);
  assert.ok(!stored.includes(enable.body.secret));
});

test("l'activation de la 2FA exige un premier code correct", async (t) => {
  const { app, marieId } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  assert.equal((await marie.post('/api/me/2fa/verify', { code: '123456' })).status, 400); // pas encore de QR code
  await marie.post('/api/me/2fa/enable');
  assert.equal((await marie.post('/api/me/2fa/verify', { code: '000000' })).status, 400);
  assert.equal(app.db.prepare('SELECT totp_enabled FROM users WHERE id = ?').pluck().get(marieId), 0);
  // Tant que la 2FA n'est pas confirmée, la connexion ne demande pas de code
  assert.ok((await login(app.client(), 'marie', PASSWORD)).body.user);
});

test('désactiver sa 2FA demande le mot de passe et un code', async (t) => {
  const { app, marieId } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  await enableTwoFactor(app, marie, marieId);

  const code = currentCode(app, marieId);
  assert.equal((await marie.post('/api/me/2fa/disable', { password: PASSWORD })).status, 403);
  assert.equal((await marie.post('/api/me/2fa/disable', { password: 'MauvaisMotDePasse', code })).status, 403);
  assert.equal((await marie.post('/api/me/2fa/disable', { password: PASSWORD, code })).status, 200);
  assert.equal(app.db.prepare('SELECT totp_enabled FROM users WHERE id = ?').pluck().get(marieId), 0);
});

// --- Fin des sessions ---

test('une session est refusée après déconnexion', async (t) => {
  const { app } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  const token = marie.jar.get('listo_session');
  assert.equal((await marie.post('/api/logout')).status, 204);
  assert.ok(!marie.jar.has('listo_session'), 'cookie effacé');

  // Même en renvoyant l'ancien jeton, la session n'existe plus
  marie.jar.set('listo_session', token);
  assert.equal((await marie.get('/api/me')).status, 401);
});

test('une session est refusée après changement de mot de passe', async (t) => {
  const { app } = await withUser(t);
  const phone = app.client();
  const computer = app.client();
  await login(phone, 'marie', PASSWORD);
  await login(computer, 'marie', PASSWORD);
  const oldToken = phone.jar.get('listo_session');

  // Ancien mot de passe faux : refusé
  assert.equal((await phone.post('/api/me/password', { currentPassword: 'Faux!Faux!Faux', newPassword: 'NouveauMotDePasse' })).status, 403);
  // Nouveau mot de passe trop court : refusé
  assert.equal((await phone.post('/api/me/password', { currentPassword: PASSWORD, newPassword: 'court' })).status, 400);

  const res = await phone.post('/api/me/password', { currentPassword: PASSWORD, newPassword: 'NouveauMotDePasse' });
  assert.equal(res.status, 200);
  assert.equal((await computer.get('/api/me')).status, 401, "l'autre appareil est déconnecté");
  assert.notEqual(phone.jar.get('listo_session'), oldToken, 'nouvelle session pour cet appareil');
  assert.equal((await phone.get('/api/me')).status, 200);

  const replay = app.client();
  replay.jar.set('listo_session', oldToken);
  assert.equal((await replay.get('/api/me')).status, 401, 'ancien jeton refusé');

  assert.equal((await login(app.client(), 'marie', PASSWORD)).status, 401);
  assert.equal((await login(app.client(), 'marie', 'NouveauMotDePasse')).status, 200);
});

test('une session est refusée après désactivation du compte', async (t) => {
  const { app, marieId } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  app.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(marieId); // l'écran viendra à l'étape 3
  assert.equal((await marie.get('/api/me')).status, 401);
  assert.equal((await login(app.client(), 'marie', PASSWORD)).status, 401);
});

test('une session dure 30 jours glissants', async (t) => {
  const { app } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);

  // Utilisée tous les 20 jours : toujours valable après 60 jours
  for (let i = 0; i < 3; i++) {
    app.clock.now += 20 * 24 * 60 * MINUTE;
    assert.equal((await marie.get('/api/me')).status, 200, `jour ${(i + 1) * 20}`);
  }
  // Puis 31 jours sans l'utiliser : expirée
  app.clock.now += 31 * 24 * 60 * MINUTE;
  assert.equal((await marie.get('/api/me')).status, 401);
});

// --- Protection CSRF ---

test('une requête de modification avec un mauvais en-tête Origin est refusée', async (t) => {
  const { app } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);

  for (const origin of ['https://site-pirate.example', null]) {
    const other = app.client({ origin });
    other.jar.set('listo_session', marie.jar.get('listo_session'));
    assert.equal((await other.post('/api/me/password', { currentPassword: PASSWORD, newPassword: 'PirateMotDePasse' })).status, 403);
    assert.equal((await other.post('/api/logout')).status, 403);
    assert.equal((await login(app.client({ origin }), 'marie', PASSWORD)).status, 403);
    assert.equal((await other.post('/api/setup', { code: SETUP_CODE })).status, 403);
  }
  // La session de Marie est intacte et son mot de passe inchangé
  assert.equal((await marie.get('/api/me')).status, 200);
  assert.equal((await login(app.client(), 'marie', PASSWORD)).status, 200);
  // Les lectures (GET) ne demandent pas d'en-tête Origin
  assert.equal((await app.client({ origin: null }).get('/api/setup')).status, 200);
  assert.equal(ORIGIN, app.ctx.config.publicUrl);
});

// --- Journal ---

test('le journal (docker logs et fichier) ne contient ni mot de passe, ni jeton, ni code', async (t) => {
  const journalPath = path.join(tempDir(t), 'journal.log');
  const app = await startTestApp(t, { journalFile: createJournalFile({ path: journalPath }) });
  const secrets = [SETUP_CODE, SETUP_CODE.replaceAll('-', ''), 'MotDePasseAdmin!', PASSWORD, 'NouveauMotDePasse', 'MauvaisMotDePasse'];

  // Un parcours complet : création de l'Admin, connexions ratées et réussies,
  // 2FA, code de secours, changement de mot de passe, action d'administration
  const admin = await setupAdmin(app);
  secrets.push(admin.jar.get('listo_session'));
  const marieId = await addUser(app.db, { username: 'marie', password: PASSWORD });
  await login(app.client(), 'marie', 'MauvaisMotDePasse');
  await login(app.client(), PASSWORD, PASSWORD); // mot de passe tapé dans le champ identifiant
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  secrets.push(marie.jar.get('listo_session'));
  const enable = await marie.post('/api/me/2fa/enable');
  secrets.push(enable.body.secret);
  const firstCode = currentCode(app, marieId);
  secrets.push(firstCode);
  const verify = await marie.post('/api/me/2fa/verify', { code: firstCode });
  secrets.push(...verify.body.recoveryCodes, ...verify.body.recoveryCodes.map((c) => c.replace('-', '')));
  app.clock.now += 30 * 1000;

  const phone = app.client();
  await login(phone, 'marie', PASSWORD);
  secrets.push(phone.jar.get('listo_2fa'));
  await phone.post('/api/login/2fa', { code: '999999' });
  secrets.push('999999');
  const code = currentCode(app, marieId);
  secrets.push(code);
  await phone.post('/api/login/2fa', { code });
  secrets.push(phone.jar.get('listo_session'));
  const rescue = app.client();
  await login(rescue, 'marie', PASSWORD);
  await rescue.post('/api/login/2fa', { code: verify.body.recoveryCodes[0] });
  await phone.post('/api/me/password', { currentPassword: PASSWORD, newPassword: 'NouveauMotDePasse' });
  secrets.push(phone.jar.get('listo_session'));
  await admin.del(`/api/admin/users/${marieId}/2fa`);
  await phone.post('/api/logout');

  // Le fichier contient exactement les mêmes lignes que docker logs
  const fileContent = fs.readFileSync(journalPath, 'utf8');
  assert.equal(fileContent, app.logs.map((line) => `${line}\n`).join(''));

  // Le journal a bien tout noté…
  const journal = app.logs.join('\n');
  for (const event of ['creation_admin', 'connexion_echouee', 'connexion_reussie', 'connexion_code_2fa_demande',
    '2fa_activee', 'mot_de_passe_change', 'admin_2fa_desactivee', 'deconnexion']) {
    assert.match(journal, new RegExp(event), `événement ${event} absent du journal`);
  }
  // …sans jamais écrire un seul secret
  for (const secret of secrets) {
    assert.ok(secret && !journal.includes(secret), `secret trouvé dans le journal : ${secret}`);
    assert.ok(!fileContent.includes(secret), `secret trouvé dans journal.log : ${secret}`);
  }
  // L'identifiant inconnu (ici un mot de passe tapé par erreur) n'est pas recopié
  assert.match(journal, /utilisateur="\(inconnu\)"/);
});

// --- Image du QR code (étape 5) ---

test("l'image du QR code n'existe que pendant l'activation, pour le compte connecté", async (t) => {
  const { app, marieId } = await withUser(t);
  const marie = app.client();
  await login(marie, 'marie', PASSWORD);
  const get = () => fetch(`${app.base}/api/me/2fa/qr.png`, { headers: { cookie: `listo_session=${marie.jar.get('listo_session')}` } });

  assert.equal((await get()).status, 404, 'pas encore d\'activation');
  await marie.post('/api/me/2fa/enable');
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'vraie image PNG');

  // Une fois la 2FA confirmée, l'image n'est plus disponible
  await marie.post('/api/me/2fa/verify', { code: currentCode(app, marieId) });
  assert.equal((await get()).status, 404);
  // Un visiteur non connecté est refusé
  assert.equal((await fetch(`${app.base}/api/me/2fa/qr.png`)).status, 401);
});

test('la politique de sécurité (CSP) stricte est envoyée sur toutes les réponses', async (t) => {
  const app = await startTestApp(t);
  for (const url of ['/', '/index.html', '/js/app.js', '/api/setup', '/healthz']) {
    const res = await fetch(app.base + url);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/, url);
    assert.match(csp, /script-src 'self';/, url);
    assert.match(csp, /style-src 'self';/, url);
    assert.match(csp, /img-src 'self';/, url);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|data:/, url);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  }
});
