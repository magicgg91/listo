// Écran « Connexions Claude » (étape D de docs/mcp-cadrage.md) : un compte
// voit et déconnecte SES connexions Claude, et seulement les siennes ; une
// connexion déconnectée ne marche plus sur /mcp à l'appel suivant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient, ORIGIN } from './helpers.js';
import { PASSWORD, MARIE_PASSWORD, household, connect, claude } from './mcp-helpers.js';
import { helpSections } from '../public/js/help-content.js';
import { matchRoute } from '../public/js/router.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ping = async (h, token) => (await claude(h, token).rpc('ping')).status;

test('/api/me : claudeUrl seulement si LISTO_MCP est activé ; sinon routes inconnues', async (t) => {
  const on = await household(t);
  assert.equal((await on.guillaume.get('/api/me')).body.user.claudeUrl, `${ORIGIN}/mcp`);
  const off = await household(t, { mcp: false });
  assert.equal((await off.guillaume.get('/api/me')).body.user.claudeUrl, null);
  for (const [method, url] of [['GET', '/api/me/claude'], ['DELETE', '/api/me/claude'], ['DELETE', '/api/me/claude/1']]) {
    const res = await off.guillaume.request(method, url);
    assert.equal(res.status, 404, url);
    assert.equal(res.body.error, 'Route inconnue.');
  }
});

test('liste : seulement mes connexions, champ par champ, sans jeton ni empreinte ni identifiant d\'application', async (t) => {
  const h = await household(t);
  const read1 = await connect(h, h.guillaume, PASSWORD, { lists: [h.ids.maison, h.ids.courses] });
  const write1 = await connect(h, h.guillaume, PASSWORD, { scope: 'write' });
  await connect(h, h.marie, MARIE_PASSWORD);
  const res = await h.guillaume.get('/api/me/claude');
  assert.equal(res.status, 200);
  assert.equal(res.body.url, `${ORIGIN}/mcp`);
  const { connections } = res.body;
  assert.equal(connections.length, 1, 'même application réautorisée : la plus récente remplace l\'ancienne');
  // Deux applications différentes pour Guillaume : ajouter une connexion Claude Code
  await h.app.db.prepare("UPDATE oauth_grants SET app_key = 'autre' WHERE revoked_at IS NULL AND user_id = 1").run();
  const again = await connect(h, h.guillaume, PASSWORD, { lists: [h.ids.maison, h.ids.courses] });
  const list = (await h.guillaume.get('/api/me/claude')).body.connections;
  assert.equal(list.length, 2);
  for (const c of list) {
    assert.deepEqual(Object.keys(c).sort(), ['access', 'allLists', 'app', 'createdAt', 'id', 'lastUsedAt', 'lists', 'redirect']);
    assert.deepEqual(Object.keys(c.app).sort(), ['host', 'name', 'nameFromApp']);
    assert.deepEqual(c.app, { host: 'claude.ai', name: 'Claude', nameFromApp: true });
    assert.deepEqual(c.redirect, { host: 'claude.ai', local: false });
    assert.equal(c.lastUsedAt, null, 'jamais utilisée');
  }
  const limited = list.find((c) => !c.allLists);
  assert.equal(limited.access, 'read');
  assert.deepEqual(limited.lists, ['Courses', 'Maison']);
  assert.equal(list.find((c) => c.allLists).access, 'write');
  // Rien de secret dans la réponse
  const text = JSON.stringify(res.body) + JSON.stringify(list);
  for (const secret of [read1.access_token, write1.access_token, again.access_token, again.refresh_token, read1.clientId, write1.clientId]) {
    assert.equal(text.includes(secret), false);
  }
  for (const hash of h.app.db.prepare('SELECT token_hash FROM oauth_tokens').pluck().all()) assert.equal(text.includes(hash), false);
  assert.equal(/client_id|token|hash|user_id/.test(text), false);
  // Marie ne voit que la sienne
  assert.equal((await h.marie.get('/api/me/claude')).body.connections.length, 1);
  // Dernière utilisation : renseignée au premier appel de /mcp
  await claude(h, again.access_token).rpc('ping');
  assert.ok((await h.guillaume.get('/api/me/claude')).body.connections.some((c) => c.lastUsedAt));
  // Liste supprimée : son nom disparaît
  await h.guillaume.post('/api/ops', { ops: [{ id: crypto.randomUUID(), type: 'list.delete', listId: h.ids.maison }] });
  assert.deepEqual((await h.guillaume.get('/api/me/claude')).body.connections.find((c) => !c.allLists).lists, ['Courses']);
});

test('déconnecter UNE connexion : refusée sur /mcp tout de suite, les autres restent ; celle d\'un autre compte = inconnue', async (t) => {
  const h = await household(t);
  const first = await connect(h, h.guillaume, PASSWORD);
  await h.app.db.prepare("UPDATE oauth_grants SET app_key = 'autre'").run();
  const second = await connect(h, h.guillaume, PASSWORD);
  const marie = await connect(h, h.marie, MARIE_PASSWORD);
  const mine = (await h.guillaume.get('/api/me/claude')).body.connections;
  const marieId = (await h.marie.get('/api/me/claude')).body.connections[0].id;

  // Identifiant d'un autre compte, inconnu, mal formé : même réponse, rien ne change
  for (const id of [marieId, 99999, 'abc', '1.5']) {
    const res = await h.guillaume.del(`/api/me/claude/${id}`);
    assert.equal(res.status, 404, String(id));
    assert.deepEqual(res.body, { error: 'Connexion introuvable.' });
  }
  assert.equal(await ping(h, marie.access_token), 200);

  const target = mine.find((c) => c.id === Math.min(...mine.map((x) => x.id)));
  assert.deepEqual((await h.guillaume.del(`/api/me/claude/${target.id}`)).body, { ok: true });
  assert.equal(await ping(h, first.access_token), 401, 'refusée à l\'appel suivant');
  assert.equal(await ping(h, second.access_token), 200, 'l\'autre reste valable');
  assert.equal((await h.guillaume.get('/api/me/claude')).body.connections.length, 1);
  assert.equal((await h.guillaume.del(`/api/me/claude/${target.id}`)).status, 404, 'déjà déconnectée');
  // Renouvellement refusé aussi
  const refreshed = await fetch(`${h.app.base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId }) });
  assert.equal((await refreshed.json()).error, 'invalid_grant');
  const line = h.app.logs.find((l) => /claude\.revocation/.test(l) && /Connexions Claude/.test(l));
  assert.match(line, /par="le compte"/);
  assert.match(line, /utilisateur="guillaume"/);
});

test('« Tout déconnecter » : toutes mes connexions, pas celles des autres', async (t) => {
  const h = await household(t);
  const first = await connect(h, h.guillaume, PASSWORD);
  await h.app.db.prepare("UPDATE oauth_grants SET app_key = 'autre'").run();
  const second = await connect(h, h.guillaume, PASSWORD);
  const marie = await connect(h, h.marie, MARIE_PASSWORD);
  assert.deepEqual((await h.guillaume.del('/api/me/claude')).body, { count: 2 });
  assert.equal(await ping(h, first.access_token), 401);
  assert.equal(await ping(h, second.access_token), 401);
  assert.equal(await ping(h, marie.access_token), 200, 'Marie n\'est pas touchée');
  assert.deepEqual((await h.guillaume.get('/api/me/claude')).body.connections, []);
  assert.deepEqual((await h.guillaume.del('/api/me/claude')).body, { count: 0 });
});

test('refus sans session et depuis une autre origine', async (t) => {
  const h = await household(t);
  await connect(h, h.guillaume, PASSWORD);
  const id = (await h.guillaume.get('/api/me/claude')).body.connections[0].id;
  const anonymous = h.app.client();
  assert.equal((await anonymous.get('/api/me/claude')).status, 401);
  assert.equal((await anonymous.del(`/api/me/claude/${id}`)).status, 401);
  const elsewhere = createClient(h.app.base, { origin: 'https://pirate.example' });
  for (const [name, value] of h.guillaume.jar) elsewhere.jar.set(name, value);
  assert.equal((await elsewhere.del(`/api/me/claude/${id}`)).status, 403);
  assert.equal((await elsewhere.del('/api/me/claude')).status, 403);
  assert.equal((await h.guillaume.get('/api/me/claude')).body.connections.length, 1, 'rien n\'a changé');
});

test('écran et aide : entrée de Mon compte et rubrique d\'aide seulement si l\'accès est activé ; adresse jamais écrite en dur', () => {
  assert.deepEqual(matchRoute('#/reglages/claude'), { name: 'claudeConnections', params: {} });
  const account = read('public/js/screens/account.js');
  assert.match(account, /user\.claudeUrl \? \[\s*h\('h2', \{ class: 'section-title' \}, 'Claude'\),/);
  assert.match(account, /navigate\('claudeConnections'\)/);
  const app = read('public/js/app.js');
  assert.match(app, /case 'claudeConnections':\s*if \(app\.user\.claudeUrl\) mount\(\(\) => renderClaudeConnections\(\)\);\s*else navigate\('account', \{\}, \{ replace: true \}\);/);
  const screen = read('public/js/screens/claude-connections.js');
  assert.match(screen, /del\(`\/api\/me\/claude\/\$\{encodeURIComponent\(connection\.id\)\}`\)/);
  assert.match(screen, /del\('\/api\/me\/claude'\)/);
  assert.match(screen, /confirmDialog\(\{\s*title: `Déconnecter/);
  assert.match(screen, /confirmDialog\(\{\s*title: 'Tout déconnecter \?'/);
  assert.match(screen, /'aria-label': `Déconnecter \$\{titleOf\(connection\)\}`/);
  assert.match(screen, /nom donné par l\\'application, non vérifié/);
  assert.doesNotMatch(screen, /innerHTML|\.focus\(|https:\/\//);
  assert.ok(read('public/sw.js').includes("'/js/screens/claude-connections.js'"));
  // Aide : rubrique ajoutée à « Pour tout le monde » avec l'adresse du serveur
  const user = { role: 'user', claudeUrl: 'https://listo.exemple.fr/mcp' };
  const topics = helpSections(user).find((s) => s.id === 'tous').topics;
  const topic = topics.find((t) => t.title === 'Utiliser Listo avec Claude');
  assert.ok(topic);
  assert.ok(topic.items.some((line) => line.includes('https://listo.exemple.fr/mcp')));
  assert.ok(topic.items.some((line) => line.includes('claude mcp add --transport http listo https://listo.exemple.fr/mcp')));
  assert.equal(topic.items.some((line) => line.includes('{adresse}')), false);
  assert.equal(helpSections({ role: 'user', claudeUrl: null }).find((s) => s.id === 'tous').topics.some((t) => t.title === 'Utiliser Listo avec Claude'), false);
  assert.doesNotMatch(read('public/js/help-content.js'), /https:\/\/[a-z.]+\/mcp/, 'adresse jamais écrite en dur');
});
