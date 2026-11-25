// Connexion « … seulement », compte par compte (25 novembre 2026, migration
// 51, décision du propriétaire) : l'Admin choisit, sur la page d'un compte,
// « Mot de passe ou … » (au départ) ou « … seulement » (… : le nom du
// fournisseur d'identité, LISTO_OIDC_NAME). Une seule règle,
// passwordLoginAllowed (server/auth.js). Les tests suivent : la migration,
// la connexion par mot de passe (mauvais mot de passe : réponse identique ;
// bon mot de passe : refus, sans session ni code à 6 chiffres), les
// sessions par mot de passe fermées et revérifiées, la connexion par le
// fournisseur, les droits (Admin seul, jamais soi-même, jamais le dernier
// Admin qui a un mot de passe), les comptes acceptés depuis une demande,
// Mon compte et la réinitialisation refusés, le journal, l'autorisation
// d'un assistant IA, la commande de secours, et les écrans.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startTestApp, setupAdmin, addUser, login, tempDir, databaseAt } from './helpers.js';
import { fakeAuthelia, oidcApp, signIn } from './oidc-helpers.js';
import { openDatabase, MIGRATIONS, schemaVersion } from '../server/db.js';
import { passwordLoginAllowed } from '../server/auth.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PEOPLE = {
  adminmfa: { sub: 'sub-admin', username: 'guillaume', name: 'Guillaume', amr: ['pwd', 'otp', 'mfa'] },
  lea: { sub: 'sub-lea', username: 'lea', name: 'Léa', amr: ['pwd', 'otp', 'mfa'] },
  lea2fa: { sub: 'sub-lea', username: 'lea', name: 'Léa', amr: ['pwd'] },
  paul: { sub: 'sub-paul', username: 'paul', name: 'Paul', amr: ['pwd', 'otp', 'mfa'] },
  nouveau: { sub: 'sub-nouveau', username: 'nouveau', name: 'Nouveau Venu' },
};

// Listo avec le fournisseur d'identité (« Authelia » ici), l'Admin
// guillaume (connecté par mot de passe) et Léa (Utilisateur, mot de passe)
async function family(t, config = {}) {
  const fake = fakeAuthelia({ users: PEOPLE });
  const app = await oidcApp(t, fake, config);
  const admin = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea', displayName: 'Léa' });
  return { fake, app, admin, leaId };
}
const setSsoOnly = (client, id, ssoOnly) => client.request('PUT', `/api/admin/users/${id}/login`, { ssoOnly });
const ssoColumn = (app, id) => app.db.prepare('SELECT sso_only FROM users WHERE id = ?').pluck().get(id);
const journal = (app, event) => app.logs.filter((line) => line.includes('[journal]') && line.includes(` ${event} `));

// --- Base ---

test('migration 51 : une colonne sso_only, 0 au départ, 0 ou 1 seulement ; une base d\'avant migre sans rien changer', (t) => {
  const db = openDatabase(':memory:');
  assert.equal(MIGRATIONS.length, 51);
  assert.equal(schemaVersion(db), 51);
  const id = db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('lea', 'Léa', 'x', 'user')").run().lastInsertRowid;
  assert.equal(db.prepare('SELECT sso_only FROM users WHERE id = ?').pluck().get(id), 0);
  assert.throws(() => db.prepare('UPDATE users SET sso_only = 2 WHERE id = ?').run(id), /CHECK/);
  db.prepare('UPDATE users SET sso_only = 1 WHERE id = ?').run(id);
  db.close();
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 50);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('paul', 'Paul', 'x', 'admin')").run();
  const before = old.prepare('SELECT * FROM users').all();
  old.close();
  const migrated = openDatabase(file);
  t.after(() => migrated.close());
  assert.equal(schemaVersion(migrated), 51);
  const after = migrated.prepare('SELECT * FROM users').all();
  assert.deepEqual(after.map(({ sso_only, ...rest }) => rest), before);
  assert.deepEqual(after.map((user) => user.sso_only), [0]);
});

test('passwordLoginAllowed : la seule règle (serveur désactivé, compte « … seulement », fournisseur désactivé)', () => {
  const on = { oidc: true, localLogin: true };
  assert.equal(passwordLoginAllowed({ sso_only: 0 }, on), true);
  assert.equal(passwordLoginAllowed({ sso_only: 1 }, on), false);
  assert.equal(passwordLoginAllowed({ sso_only: 0 }, { oidc: true, localLogin: false }), false);
  // Sans LISTO_OIDC=on, le réglage est gardé mais sans effet (sinon le
  // compte n'aurait plus aucune porte)
  assert.equal(passwordLoginAllowed({ sso_only: 1 }, { oidc: false, localLogin: true }), true);
  assert.equal(passwordLoginAllowed({ sso_only: 1 }, undefined), true);
  // Lue partout : connexion, sessions, Mon compte, Administration, /api/me
  assert.match(read('server/routes/auth.js'), /passwordLoginAllowed\(user, ctx\.config\)/);
  assert.match(read('server/auth.js'), /row\.session_method !== 'oidc' && !passwordLoginAllowed\(row, ctx\.config\)/);
  assert.match(read('server/routes/me.js'), /req\.sessionMethod === 'oidc' \|\| !passwordLoginAllowed\(req\.user, ctx\.config\)/);
  assert.match(read('server/routes/admin-users.js'), /if \(!passwordLoginAllowed\(user, ctx\.config\)\)/);
  // Jamais une autre lecture de la colonne, hors de la base, de la règle,
  // de l'administration des comptes, de la commande de secours et de
  // l'acceptation d'une demande
  const files = [...fs.readdirSync(path.join(ROOT, 'server')).map((f) => `server/${f}`), ...fs.readdirSync(path.join(ROOT, 'server/routes')).map((f) => `server/routes/${f}`)].filter((f) => f.endsWith('.js'));
  const allowed = new Set(['server/db.js', 'server/auth.js', 'server/routes/admin-users.js', 'server/admin-secours.js', 'server/oidc.js']);
  for (const file of files.filter((f) => !allowed.has(f))) assert.doesNotMatch(read(file), /sso_only/, file);
});

// --- Connexion par mot de passe ---

test('mauvais mot de passe : exactement la même réponse avec ou sans « … seulement » (et pour un identifiant inconnu)', async (t) => {
  const { app, admin, leaId } = await family(t);
  const attempt = async (username) => {
    const res = await app.client({ ip: `198.51.100.${crypto.randomInt(1, 250)}` }).post('/api/login', { username, password: 'pas-le-bon-mot' });
    return { status: res.status, text: res.text, type: res.headers.get('content-type'), cookies: res.setCookies };
  };
  const before = await attempt('lea');
  assert.equal(before.status, 401);
  assert.equal((await setSsoOnly(admin, leaId, true)).status, 200);
  const after = await attempt('lea');
  assert.deepEqual(after, before, 'octet pour octet');
  assert.deepEqual(await attempt('personne'), before);
  // Même vérification du mot de passe (empreinte factice comprise) AVANT la
  // règle : la durée ne trahit rien
  const route = read('server/routes/auth.js');
  assert.ok(route.indexOf('verifyPassword(password, user?.password_hash ?? (await getDummyHash()))') < route.indexOf('!passwordLoginAllowed(user, ctx.config)'));
  assert.equal(journal(app, 'password_login_refused').length, 0, 'un mauvais mot de passe reste un simple échec');
});

test('bon mot de passe : refusé (« Ce compte se connecte avec … »), sans session ni code à 6 chiffres ; mêmes limites ; journal', async (t) => {
  const { app, admin, leaId } = await family(t);
  // Léa a activé la double authentification Listo : elle ne doit pas être proposée
  app.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = 'x' WHERE id = ?").run(leaId);
  assert.equal((await setSsoOnly(admin, leaId, true)).status, 200);
  const browser = app.client({ ip: '203.0.113.9' });
  const res = await login(browser, 'lea', 'MotDePasse-lea');
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'comptes.connexion.fournisseurSeulement');
  assert.equal(res.body.error, 'Ce compte se connecte avec Authelia : utilisez « Se connecter avec Authelia ».');
  assert.equal(res.body.twoFactorRequired, undefined);
  assert.equal(res.body.user, undefined);
  assert.deepEqual(res.setCookies, [], 'ni session, ni connexion en attente du code');
  assert.equal(browser.jar.size, 0);
  assert.equal((await browser.get('/api/me')).status, 401);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?').pluck().get(leaId), 0);
  // Journal en anglais : l'identifiant, la raison, jamais le mot de passe
  const lines = journal(app, 'password_login_refused');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /user="lea"/);
  assert.match(lines[0], /reason="account signs in with the identity provider only"/);
  assert.ok(!app.logs.join('\n').includes('MotDePasse-lea'));
  // En anglais, le nom du fournisseur aussi
  const english = await app.client({ ip: '203.0.113.10' }).request('POST', '/api/login', { username: 'lea', password: 'MotDePasse-lea' }, { 'accept-language': 'en' });
  assert.equal(english.body.error, 'This account signs in with Authelia: use “Sign in with Authelia”.');
  // Mêmes limites : chaque tentative compte comme un échec (5 en 15 minutes)
  for (let i = 0; i < 3; i++) assert.equal((await login(browser, 'lea', 'MotDePasse-lea')).status, 403);
  assert.equal((await login(browser, 'lea', 'MotDePasse-lea')).status, 429);
});

test('connexion par mot de passe commencée avant le choix (code à 6 chiffres en attente) : arrêtée au code', async (t) => {
  const { app, admin, leaId } = await family(t);
  app.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = 'x' WHERE id = ?").run(leaId);
  const browser = app.client();
  assert.equal((await login(browser, 'lea', 'MotDePasse-lea')).body.twoFactorRequired, true);
  assert.equal((await setSsoOnly(admin, leaId, true)).status, 200);
  const res = await browser.post('/api/login/2fa', { code: '123456' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'comptes.connexion.fournisseurSeulement');
  assert.equal((await browser.get('/api/me')).status, 401);
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?').pluck().get(leaId), 0);
});

// --- Sessions ---

test('sessions par mot de passe fermées tout de suite (flux temps réel compris) ; celles du fournisseur restent ; chaque requête revérifie', async (t) => {
  const { fake, app, admin, leaId } = await family(t);
  const byPassword = app.client();
  assert.equal((await login(byPassword, 'lea', 'MotDePasse-lea')).status, 200);
  const byProvider = app.client();
  assert.equal(await signIn(byProvider, fake, 'lea'), '/#/listes');
  // Flux temps réel ouvert par la session par mot de passe
  const controller = new AbortController();
  t.after(() => controller.abort());
  const cookie = [...byPassword.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const stream = await fetch(`${app.base}/api/events`, { headers: { cookie }, signal: controller.signal });
  assert.equal(stream.status, 200);
  await pause(30);
  assert.equal(app.ctx.events.count(leaId), 1);

  const res = await setSsoOnly(admin, leaId, true);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.user.ssoOnly, true);
  assert.equal(res.body.user.passwordLogin, false);
  await pause(30);
  assert.equal(app.ctx.events.count(leaId), 0, 'flux coupé');
  assert.equal(app.db.prepare("SELECT COUNT(*) FROM sessions WHERE user_id = ? AND method = 'password'").pluck().get(leaId), 0);
  assert.equal((await byPassword.get('/api/me')).status, 401);
  const me = await byProvider.get('/api/me');
  assert.equal(me.status, 200, 'session du fournisseur gardée');
  assert.equal(me.body.user.passwordLogin, false);
  assert.equal(me.body.user.loginMethod, 'oidc');

  // Revérifié à chaque requête : une session par mot de passe qui
  // existerait encore (écrite directement en base) est refusée et effacée
  app.db.prepare('UPDATE users SET sso_only = 0 WHERE id = ?').run(leaId);
  const again = app.client();
  assert.equal((await login(again, 'lea', 'MotDePasse-lea')).status, 200);
  app.db.prepare('UPDATE users SET sso_only = 1 WHERE id = ?').run(leaId);
  assert.equal((await again.get('/api/me')).status, 401);
  assert.equal(app.db.prepare("SELECT COUNT(*) FROM sessions WHERE user_id = ? AND method = 'password'").pluck().get(leaId), 0);
  // Retour à « Mot de passe ou … » : le mot de passe resert
  assert.equal((await setSsoOnly(admin, leaId, false)).status, 200);
  assert.equal((await login(app.client(), 'lea', 'MotDePasse-lea')).status, 200);
});

test('connexion par le fournisseur : elle marche pour un compte « … seulement » (même identifiant la première fois, puis son sub)', async (t) => {
  const { fake, app, admin, leaId } = await family(t);
  assert.equal((await setSsoOnly(admin, leaId, true)).status, 200);
  assert.equal(app.db.prepare('SELECT oidc_sub FROM users WHERE id = ?').pluck().get(leaId), null);
  assert.equal((await admin.get('/api/admin/users')).body.users.find((u) => u.id === leaId).authelia, false, 'jamais connectée avec le fournisseur : la page le dit');
  const browser = app.client();
  assert.equal(await signIn(browser, fake, 'lea'), '/#/listes');
  assert.equal(app.db.prepare('SELECT oidc_sub FROM users WHERE id = ?').pluck().get(leaId), 'sub-lea');
  assert.equal((await browser.get('/api/me')).body.user.username, 'lea');
  assert.equal(await signIn(app.client(), fake, 'lea'), '/#/listes');
  // Double authentification Listo activée, pas faite chez le fournisseur : le
  // code est demandé, et la session reste « fournisseur »
  app.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = 'x' WHERE id = ?").run(leaId);
  assert.equal(await signIn(app.client(), fake, 'lea2fa'), '/#/connexion?authelia=code');
});

// --- Administration ---

test('« Connexion » : Admin seul ; jamais son propre compte ; 404 sans fournisseur ; valeur vérifiée ; rien d\'écrit si rien ne change', async (t) => {
  const { app, admin, leaId } = await family(t);
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  assert.equal((await setSsoOnly(lea, 1, true)).status, 403, 'pas Admin');
  assert.equal((await setSsoOnly(app.client(), leaId, true)).status, 401, 'pas connecté');
  assert.equal(ssoColumn(app, 1), 0);
  const self = await setSsoOnly(admin, 1, true);
  assert.equal(self.status, 400);
  assert.equal(self.body.error, fr['comptes.connexion.soiMeme']);
  for (const bad of [undefined, 'oui', 1, null]) assert.equal((await admin.request('PUT', `/api/admin/users/${leaId}/login`, { ssoOnly: bad })).status, 400, String(bad));
  assert.equal((await setSsoOnly(admin, 999, true)).status, 404);
  assert.equal((await setSsoOnly(admin, leaId, false)).status, 200);
  assert.equal(journal(app, 'admin_login_method_changed').length, 0, 'rien de changé : rien au journal');
  // Sans LISTO_OIDC=on : la route n'existe pas, et un nouveau compte ne
  // peut pas être « … seulement »
  const plain = await startTestApp(t);
  const plainAdmin = await setupAdmin(plain);
  const bobId = await addUser(plain.db, { username: 'bob', password: 'MotDePasse-bob' });
  assert.equal((await setSsoOnly(plainAdmin, bobId, true)).status, 404);
  assert.equal((await plainAdmin.post('/api/admin/users', { username: 'zoe', password: 'MotDePasse-zoe', ssoOnly: true })).status, 400);
  const listed = (await plainAdmin.get('/api/admin/users')).body.users.find((u) => u.id === bobId);
  assert.equal(listed.ssoOnly, false);
  assert.equal(listed.passwordLogin, true);
});

test('le dernier Admin qui se connecte par mot de passe le garde (connexion locale activée) ; LISTO_LOCAL_LOGIN=off : sans objet', async (t) => {
  const { fake, app, admin } = await family(t);
  const paulId = await addUser(app.db, { username: 'paul', password: 'MotDePasse-paul', role: 'admin', displayName: 'Paul' });
  let users = (await admin.get('/api/admin/users')).body.users;
  assert.equal(users.find((u) => u.id === 1).lastPasswordAdmin, false, 'deux Admin avec mot de passe');
  // Guillaume fait passer Paul en « … seulement » : il reste, lui, un Admin avec mot de passe
  assert.equal((await setSsoOnly(admin, paulId, true)).status, 200);
  users = (await admin.get('/api/admin/users')).body.users;
  assert.equal(users.find((u) => u.id === 1).lastPasswordAdmin, true);
  assert.equal(users.find((u) => u.id === paulId).lastPasswordAdmin, false);
  // Paul (par le fournisseur) ne peut pas faire de même pour Guillaume
  const paul = app.client();
  assert.equal(await signIn(paul, fake, 'paul'), '/#/listes');
  const refused = await setSsoOnly(paul, 1, true);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, 'Il doit toujours rester au moins un Admin actif qui se connecte avec son mot de passe : il pourra entrer si Authelia est en panne.');
  assert.equal(ssoColumn(app, 1), 0);
  // … ni le désactiver, ni lui retirer le rôle Admin
  assert.equal((await paul.request('PATCH', '/api/admin/users/1', { active: false })).status, 409);
  assert.equal((await paul.request('PATCH', '/api/admin/users/1', { role: 'user' })).status, 409);
  assert.equal(app.db.prepare('SELECT active FROM users WHERE id = 1').pluck().get(), 1);
  // Un autre Admin avec mot de passe : Guillaume peut alors passer en « … seulement »
  await addUser(app.db, { username: 'ines', password: 'MotDePasse-ines', role: 'admin' });
  assert.equal((await setSsoOnly(paul, 1, true)).status, 200);

  // LISTO_LOCAL_LOGIN=off : tout le monde est déjà « … seulement » ; le choix est refusé
  app.ctx.config.localLogin = false;
  const list = (await paul.get('/api/admin/users')).body;
  assert.equal(list.localLogin, false);
  for (const user of list.users) {
    assert.equal(user.passwordLogin, false, user.username);
    assert.equal(user.lastPasswordAdmin, false, user.username);
  }
  const off = await setSsoOnly(paul, 1, false);
  assert.equal(off.status, 409);
  assert.equal(off.body.error, 'La connexion par mot de passe est désactivée sur ce serveur : tout le monde se connecte déjà avec Authelia.');
});

test('comptes acceptés depuis une demande faite chez le fournisseur : « … seulement » d\'office ; nouveau compte au choix (invité compris : pas d\'office)', async (t) => {
  const { fake, app, admin } = await family(t);
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/connexion?authelia=demande');
  const requestId = (await admin.get('/api/admin/users')).body.accountRequests[0].id;
  const accepted = await admin.post(`/api/admin/account-requests/${requestId}/accept`, { username: 'nouveau', displayName: 'Nouveau Venu', role: 'guest' });
  assert.equal(accepted.status, 201, accepted.text);
  assert.equal(accepted.body.user.ssoOnly, true);
  assert.equal(accepted.body.user.passwordLogin, false);
  assert.equal(ssoColumn(app, accepted.body.user.id), 1);
  assert.match(journal(app, 'account_request_accepted')[0], /login="sso only"/);
  // Il entre par le fournisseur
  assert.equal(await signIn(app.client(), fake, 'nouveau'), '/#/listes');

  // Nouveau compte : invité sans le choix = « Mot de passe ou … »
  const guest = await admin.post('/api/admin/users', { username: 'max', displayName: 'Max', role: 'guest', password: 'MotDePasse-max' });
  assert.equal(guest.status, 201, guest.text);
  assert.equal(guest.body.user.ssoOnly, false);
  assert.equal(guest.body.user.mustChangePassword, true);
  // « … seulement » : aucun mot de passe demandé (mot de passe aléatoire inconnu, rien à changer)
  const sso = await admin.post('/api/admin/users', { username: 'zoe', displayName: 'Zoé', ssoOnly: true });
  assert.equal(sso.status, 201, sso.text);
  assert.equal(sso.body.user.ssoOnly, true);
  assert.equal(sso.body.user.mustChangePassword, false);
  assert.match(journal(app, 'admin_account_created').at(-1), /user="zoe".*login="sso only"/);
  assert.doesNotMatch(journal(app, 'admin_account_created').find((line) => line.includes('user="max"')), /login=/);
  assert.equal((await admin.post('/api/admin/users', { username: 'yves', ssoOnly: 'oui' })).status, 400);
  // Sans le choix et sans mot de passe : refusé comme avant
  assert.equal((await admin.post('/api/admin/users', { username: 'yves' })).status, 400);
});

test('« … seulement » : ni mot de passe ni double authentification dans Mon compte, ni réinitialisation par l\'Admin (refusés par le serveur)', async (t) => {
  const { fake, app, admin, leaId } = await family(t);
  assert.equal((await setSsoOnly(admin, leaId, true)).status, 200);
  const lea = app.client();
  assert.equal(await signIn(lea, fake, 'lea'), '/#/listes');
  for (const [method, url] of [['POST', '/api/me/password'], ['POST', '/api/me/2fa/enable'], ['POST', '/api/me/2fa/verify'], ['POST', '/api/me/2fa/disable'], ['GET', '/api/me/2fa/qr.png']]) {
    const res = await lea.request(method, url, method === 'POST' ? { currentPassword: 'MotDePasse-lea', newPassword: 'AutreMotDePasse!' } : undefined);
    assert.equal(res.status, 403, url);
  }
  assert.equal((await lea.get('/api/me')).body.user.passwordLogin, false);
  // L'Admin : « Réinitialiser le mot de passe » refusé
  const reset = await admin.post(`/api/admin/users/${leaId}/password`, { password: 'Provisoire-123456' });
  assert.equal(reset.status, 403);
  assert.equal(reset.body.error, 'Léa se connecte avec Authelia seulement : pas de mot de passe Listo à réinitialiser.');
  assert.equal(journal(app, 'admin_password_reset').length, 0);
  // L'Admin peut toujours retirer sa double authentification Listo (téléphone perdu)
  app.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = 'x' WHERE id = ?").run(leaId);
  assert.equal((await admin.del(`/api/admin/users/${leaId}/2fa`)).status, 200);
  // De retour à « Mot de passe ou … » : la réinitialisation est de nouveau possible
  assert.equal((await setSsoOnly(admin, leaId, false)).status, 200);
  assert.equal((await admin.post(`/api/admin/users/${leaId}/password`, { password: 'Provisoire-123456' })).status, 200);
});

test('journal : admin_login_method_changed (en anglais, avant et après, sessions fermées), jamais de mot de passe', async (t) => {
  const { app, admin, leaId } = await family(t);
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  await setSsoOnly(admin, leaId, true);
  await setSsoOnly(admin, leaId, false);
  const lines = journal(app, 'admin_login_method_changed');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /admin="guillaume" user="lea" login="sso only" previous="password or sso" closed_sessions=1/);
  assert.match(lines[1], /admin="guillaume" user="lea" login="password or sso" previous="sso only"/);
  assert.doesNotMatch(lines[1], /closed_sessions/);
  assert.ok(!app.logs.join('\n').includes('MotDePasse'));
  assert.ok(!app.logs.filter((line) => line.includes('[journal]')).some((line) => /authelia/i.test(line)), 'jamais le nom du fournisseur');
  // Les deux lignes figurent dans le guide d'exploitation
  const doc = read('docs/exploitation.md');
  for (const event of ['admin_login_method_changed', 'password_login_refused']) assert.match(doc, new RegExp(`\\| \`${event}\` \\|`), event);
});

test('« Autoriser un assistant IA » : un compte « … seulement » reconfirme chez le fournisseur, jamais par mot de passe', async (t) => {
  const { fake, app, admin, leaId } = await family(t, { mcp: true });
  assert.equal((await setSsoOnly(admin, leaId, true)).status, 200);
  const lea = app.client();
  assert.equal(await signIn(lea, fake, 'lea'), '/#/listes');
  const reg = await fetch(`${app.base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }) });
  const clientId = (await reg.json()).client_id;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const authorize = await fetch(`${app.base}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'x', scope: 'lists:read', resource: 'http://listo.test/mcp' })}`, { redirect: 'manual' });
  const requestId = authorize.headers.get('location').match(/autoriser\/([A-Za-z0-9_-]{22})$/)[1];
  const shown = (await lea.get(`/api/oauth/demandes/${requestId}`)).body;
  assert.equal(shown.confirmWith, 'authelia');
  assert.equal(shown.confirmed, false);
  // Le bon mot de passe ne suffit pas
  assert.equal((await lea.post(`/api/oauth/demandes/${requestId}/accord`, { scope: 'read', lists: 'all', password: 'MotDePasse-lea' })).status, 403);
  // Reconfirmation : connexion redemandée chez le fournisseur (prompt=login, max_age=0)
  fake.tweak.claims = { auth_time: fake.nowS() };
  const start = await lea.request('GET', `/oidc/connexion?confirmer=${requestId}`, undefined, {}, { redirect: 'manual' });
  const url = new URL(start.headers.get('location'));
  assert.equal(url.searchParams.get('prompt'), 'login');
  assert.equal(url.searchParams.get('max_age'), '0');
  const back = fake.authorize(start.headers.get('location'), 'lea');
  assert.equal((await lea.request('GET', `/oidc/retour?code=${back.code}&state=${back.state}`, undefined, {}, { redirect: 'manual' })).headers.get('location'), `/#/autoriser/${requestId}?authelia=confirme`);
  const ok = await lea.post(`/api/oauth/demandes/${requestId}/accord`, { scope: 'read', lists: 'all' });
  assert.equal(ok.status, 200, ok.text);
});

// --- Commande de secours ---

test('commande de secours : un compte « … seulement » repasse à « Mot de passe ou … » (sinon le mot de passe provisoire ne servirait à rien)', async (t) => {
  const dbPath = path.join(tempDir(t), 'data', 'listo.db');
  const db = openDatabase(dbPath);
  db.prepare("INSERT INTO users (username, display_name, password_hash, role, sso_only) VALUES ('guillaume', 'Guillaume', 'x', 'admin', 1)").run();
  db.close();
  const asRoot = process.getuid?.() === 0;
  if (asRoot) {
    const dir = path.dirname(dbPath);
    for (const name of fs.readdirSync(dir)) fs.chownSync(path.join(dir, name), 1000, 1000);
    fs.chownSync(dir, 1000, 1000);
    fs.chownSync(path.dirname(dir), 1000, 1000);
  }
  await promisify(execFile)(process.execPath, ['server/admin-secours.js', 'guillaume'], { cwd: ROOT, env: { PATH: process.env.PATH, LISTO_DB_PATH: dbPath }, ...(asRoot ? { uid: 1000, gid: 1000 } : {}) });
  const after = openDatabase(dbPath);
  t.after(() => after.close());
  assert.equal(after.prepare("SELECT sso_only FROM users WHERE username = 'guillaume'").pluck().get(), 0);
  assert.match(fs.readFileSync(path.join(path.dirname(dbPath), 'journal.log'), 'utf8'), /rescue_temporary_password user="guillaume" login="password or sso" previous="sso only"/);
});

// --- Écrans ---

test('écrans : section « Connexion » (fournisseur activé seulement), choix pâli et expliqué, marque sur la ligne, « Nouveau compte », Mon compte, connexion', () => {
  const admin = read('public/js/screens/admin.js');
  // Page d'un compte : la section seulement avec LISTO_OIDC=on
  assert.match(admin, /const loginBlock = oidc \? loginSection\(user, \{ localLogin, self, run \}\) : null;/);
  // Choix pâli (désactivé) avec sa raison : serveur, soi-même, dernier Admin
  assert.match(admin, /const reason = !localLogin \? t\('administration\.connexion\.serveur', \{ provider \}\)\s*: self \? t\('administration\.connexion\.soiMeme'\)\s*: user\.lastPasswordAdmin \? t\('administration\.connexion\.dernierAdmin', \{ name, provider \}\)/);
  assert.match(admin, /disabled: Boolean\(reason\)/);
  // Jamais relié au fournisseur : il devra utiliser le même identifiant
  assert.match(admin, /\(user\.ssoOnly \|\| !localLogin\) && !user\.authelia/);
  // Passer à « … seulement » demande confirmation ; le serveur décide
  assert.match(admin, /put\(`\/api\/admin\/users\/\$\{user\.id\}\/login`, \{ ssoOnly \}\)/);
  // Pas de « Réinitialiser le mot de passe » pour un compte sans mot de passe
  assert.match(admin, /if \(localLogin && user\.passwordLogin !== false\) \{/);
  // Marque « … seulement » sur la ligne d'un compte (pas avec LISTO_LOCAL_LOGIN=off)
  assert.match(admin, /const ssoMark = \(user, localLogin\) => \(user\.ssoOnly && localLogin \? t\('administration\.connexion\.seulement'/);
  // « Nouveau compte » : le choix (fournisseur activé, mot de passe permis), sans mot de passe pour « … seulement »
  assert.match(admin, /const loginField = oidc && localLogin/);
  assert.match(admin, /passwordField\.field\.hidden = !localLogin \|\| ssoOnly;/);
  assert.match(admin, /\.\.\.\(loginField \? \{ ssoOnly \} : \{\}\)/);
  // Nom du fournisseur : toujours providerName(), jamais écrit en dur
  assert.doesNotMatch(admin, /Authelia/);
  // Mon compte : ni « Mot de passe » ni « Double authentification »
  assert.match(read('public/js/screens/account.js'), /user\.loginMethod === 'oidc' \|\| user\.passwordLogin === false\s*\? h\('div', \{ class: 'group' \},\s*row\(\{ iconName: 'shield', title: t\('compte\.fournisseur\.connecte'/);
  // Écran de connexion : le refus s'affiche au-dessus du bouton du fournisseur, sans champ en erreur
  assert.match(read('public/js/screens/login.js'), /err\.data\?\.code === 'comptes\.connexion\.fournisseurSeulement'\) \{\s*error\.show\(errorMessage\(err\)\);/);
});

test('textes : français et anglais, nom du fournisseur par {provider}, jamais « Authelia » ; aide dans les deux langues', () => {
  const keys = Object.keys(fr).filter((key) => key.startsWith('administration.connexion') || ['comptes.connexion.fournisseurSeulement', 'comptes.connexion.invalide', 'comptes.connexion.serveurFournisseur', 'comptes.connexion.soiMeme', 'comptes.connexion.dernierAdmin', 'comptes.motDePasse.fournisseurSeulement'].includes(key));
  assert.equal(keys.length, 21);
  for (const key of keys) {
    assert.ok(en[key], key);
    assert.doesNotMatch(fr[key] + en[key], /Authelia/, key);
    const slots = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(slots(en[key]), slots(fr[key]), key);
  }
  // L'aide le dit, dans les deux langues (Administration, fournisseur d'identité, Mon compte, secours)
  const help = read('public/js/help-content.js');
  const helpEn = read('public/js/help-en/comptes.js') + read('public/js/help-en/installation.js') + read('public/js/help-en/roles.js');
  assert.match(help, /« Connexion »/);
  assert.match(help, /« … seulement »/);
  assert.match(help, /« Mot de passe ou … »/);
  assert.match(helpEn, /“Sign-in”/);
  assert.match(helpEn, /“… only”/);
  assert.match(helpEn, /“Password or …”/);
});
