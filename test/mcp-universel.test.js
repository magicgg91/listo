// Serveur MCP ouvert à tout assistant IA qui suit le standard (décision du
// 21 novembre 2026) : sans LISTO_MCP_SITES, n'importe quelle application
// peut s'enregistrer (DCR) avec une adresse de retour https, toujours après
// l'accord de la personne ; avec LISTO_MCP_SITES, seulement les sites
// listés (et l'ordinateur, localhost). Les documents CIMD ne sont jamais lus
// hors de la liste courte. Aucun vrai réseau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, ORIGIN } from './helpers.js';
import { PASSWORD, raw } from './mcp-helpers.js';
import { allowedRedirect, redirectMatches, cimdUrl, trustedRedirect, redirectHost } from '../server/oauth-clients.js';
import { originAllowed } from '../server/mcp.js';
import { loadConfig, configProblem, siteList, validSite } from '../server/config.js';

const CHAT = 'https://chat.example/callback';
const CLAUDE_CODE = 'https://claude.ai/oauth/claude-code-client-metadata';
const RESOURCE = `${ORIGIN}/mcp`;

// Fausses lectures de documents CIMD : chacune est comptée
function fakeMetadata() {
  const calls = [];
  const request = async (url) => {
    calls.push(url.href);
    if (url.href === CLAUDE_CODE) return { client_id: CLAUDE_CODE, client_name: 'Claude Code', redirect_uris: ['http://localhost/callback'] };
    if (url.href === 'https://chat.example/client.json') return { client_id: url.href, client_name: 'Chat', redirect_uris: [CHAT] };
    throw new Error('HTTP response 404');
  };
  return { calls, request };
}

async function setup(t, { sites } = {}) {
  const metadata = fakeMetadata();
  const config = { mcp: true, ...(sites ? { mcpSites: sites } : {}) };
  const app = await startTestApp(t, { config, clientMetadataRequest: metadata.request });
  const guillaume = await setupAdmin(app);
  return { app, guillaume, metadata };
}

const pkce = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
};

const register = (h, uris, name = 'Chat') => raw(h.app, 'POST', '/oauth/register', { body: { client_name: name, redirect_uris: uris } });

// Ouvre /oauth/authorize (sans suivre la redirection)
async function authorize(h, clientId, redirect, extra = {}) {
  const p = pkce();
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'etat', ...extra });
  const res = await fetch(`${h.app.base}/oauth/authorize?${params}`, { redirect: 'manual' });
  const text = await res.text();
  const location = res.headers.get('location');
  return { status: res.status, location, text, requestId: location?.match(/^\/#\/autoriser\/([A-Za-z0-9_-]{22})$/)?.[1] ?? null, pkce: p };
}

// Application enregistrée « avant » (sous une règle plus large) : écrite
// directement en base, comme l'aurait fait /oauth/register
function earlierClient(h, clientId, uris) {
  h.app.db.prepare(`INSERT INTO oauth_clients (client_id, kind, client_name, redirect_uris, created_ip, created_at, fetched_at)
    VALUES (?, 'dcr', 'Ancienne', ?, '127.0.0.1', ?, NULL)`).run(clientId, JSON.stringify(uris), new Date(h.app.clock.now).toISOString());
}

test('assistant IA inconnu (DCR, retour https://chat.example) : enregistré, autorisé, jeton, appel de /mcp', async (t) => {
  const h = await setup(t);
  const reg = await register(h, [CHAT]);
  assert.equal(reg.status, 201, reg.text);
  const start = await authorize(h, reg.body.client_id, CHAT, { scope: 'lists:read', resource: RESOURCE });
  assert.equal(start.status, 303, start.text);
  // L'écran montre le site qui recevra la réponse, et que le nom n'est pas vérifié
  const shown = (await h.guillaume.get(`/api/oauth/demandes/${start.requestId}`)).body.request;
  assert.deepEqual(shown.app, { host: 'chat.example', name: 'Chat', nameFromApp: true });
  assert.deepEqual(shown.redirect, { host: 'chat.example', local: false });
  const ok = await h.guillaume.post(`/api/oauth/demandes/${start.requestId}/accord`, { password: PASSWORD, scope: 'read', lists: 'all' });
  assert.equal(ok.status, 200, ok.text);
  const back = new URL(ok.body.redirect);
  assert.equal(`${back.origin}${back.pathname}`, CHAT);
  assert.equal(back.searchParams.get('iss'), ORIGIN);
  const tokens = await fetch(`${h.app.base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: CHAT, client_id: reg.body.client_id, code_verifier: start.pkce.verifier }),
  }).then((res) => res.json());
  assert.equal(tokens.token_type, 'Bearer');
  const call = await raw(h.app, 'POST', '/mcp', {
    headers: { authorization: `Bearer ${tokens.access_token}`, origin: 'https://chat.example' },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_lists', arguments: {} } },
  });
  assert.equal(call.status, 200, call.text);
  assert.ok(call.body.result.structuredContent, call.text);
  assert.ok(h.app.logs.some((l) => /claude\.connected/.test(l) && /client="chat\.example"/.test(l)));
  // Connexion visible dans « Assistants IA »
  const mine = (await h.guillaume.get('/api/me/claude')).body.connections;
  assert.deepEqual(mine.map((c) => c.app.host), ['chat.example']);
});

test('adresses de retour, sans LISTO_MCP_SITES : https sur un nom de site ; ni http, ni IP, ni fragment, ni identifiant', () => {
  for (const uri of [CHAT, 'https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/autre', 'https://app.chat.example:8443/oauth/cb?x=1', 'http://localhost:4000/cb', 'http://127.0.0.1/cb']) {
    assert.equal(allowedRedirect(uri), true, uri);
  }
  for (const uri of ['http://chat.example/cb', 'https://10.0.0.1/cb', 'https://[::1]/cb', 'https://0x7f.1/cb', 'https://chat.example/cb#frag', 'https://u:p@chat.example/cb', 'https://u@chat.example/cb',
    'https://localhost/cb', 'https://intranet/cb', 'ftp://chat.example/cb', 'javascript:alert(1)', 'http://localhost/cb#x', `https://chat.example/${'x'.repeat(500)}`, 42, null]) {
    assert.equal(allowedRedirect(uri), false, String(uri));
  }
  // Comparaison toujours exacte (sauf le port du bouclage)
  assert.equal(redirectMatches(CHAT, CHAT), true);
  assert.equal(redirectMatches(`${CHAT}?x=1`, CHAT), false);
  assert.equal(redirectMatches('https://chat.example/Callback', CHAT), false);
  // Hôte affiché : avec le port s'il n'est pas celui par défaut
  assert.equal(redirectHost('https://chat.example:8443/cb'), 'chat.example:8443');
  assert.equal(redirectHost('http://localhost:4000/cb'), 'localhost');
});

test('DCR, sans LISTO_MCP_SITES : adresses refusées (http, IP, fragment, identifiant) ; aucune ne passe à l\'autorisation', async (t) => {
  const h = await setup(t);
  for (const uri of ['http://chat.example/cb', 'https://10.0.0.1/cb', 'https://chat.example/cb#x', 'https://u:p@chat.example/cb']) {
    const res = await register(h, [uri]);
    assert.equal(res.status, 400, uri);
    assert.equal(res.body.error, 'invalid_redirect_uri');
    assert.doesNotMatch(res.body.error_description, /Claude/, 'message neutre');
  }
  // Une bonne et une mauvaise : tout est refusé
  assert.equal((await register(h, [CHAT, 'http://chat.example/cb'])).status, 400);
});

test('erreur d\'autorisation vers un site inconnu : page d\'erreur, jamais de redirection (pas de relais) ; vers claude.ai ou localhost : renvoyée', async (t) => {
  const h = await setup(t);
  const chat = (await register(h, [CHAT])).body.client_id;
  const bad = await authorize(h, chat, CHAT, { response_type: 'token' });
  assert.equal(bad.status, 400);
  assert.equal(bad.location, null, 'aucune redirection vers chat.example');
  assert.match(bad.text, /Demande d'autorisation invalide/);
  const claude = (await register(h, ['https://claude.ai/api/mcp/auth_callback'])).body.client_id;
  const toClaude = await authorize(h, claude, 'https://claude.ai/api/mcp/auth_callback', { response_type: 'token' });
  assert.equal(toClaude.status, 302);
  assert.equal(new URL(toClaude.location).searchParams.get('error'), 'unsupported_response_type');
  const local = (await register(h, ['http://localhost/cb'])).body.client_id;
  assert.equal((await authorize(h, local, 'http://localhost:5000/cb', { response_type: 'token' })).status, 302);
  // Fonction seule
  assert.equal(trustedRedirect(CHAT), false);
  assert.equal(trustedRedirect(CHAT, ['chat.example']), true);
  assert.equal(trustedRedirect('https://claude.com/cb'), true);
  assert.equal(trustedRedirect('https://claude.com/cb', ['chat.example']), false);
});

test('LISTO_MCP_SITES : autres sites refusés à l\'enregistrement ET à l\'autorisation d\'une application déjà enregistrée ; site listé et localhost acceptés', async (t) => {
  const h = await setup(t, { sites: ['chat.example'] });
  // Enregistrement
  assert.equal((await register(h, [CHAT])).status, 201, 'site listé');
  assert.equal((await register(h, ['http://localhost/cb'])).status, 201, 'ordinateur : toujours');
  for (const uri of ['https://claude.ai/api/mcp/auth_callback', 'https://autre.example/cb', 'https://sous.chat.example/cb', 'https://chat.example.evil.com/cb']) {
    const res = await register(h, [uri]);
    assert.equal(res.status, 400, uri);
    assert.equal(res.body.error, 'invalid_redirect_uri');
    assert.doesNotMatch(res.body.error_description, /chat\.example/, 'la liste des sites n\'est jamais donnée');
  }
  // Applications enregistrées avant que la liste ne soit resserrée
  earlierClient(h, 'dcr_ancienne_claude', ['https://claude.ai/api/mcp/auth_callback']);
  earlierClient(h, 'dcr_ancienne_chat', [CHAT]);
  earlierClient(h, 'dcr_ancienne_locale', ['http://127.0.0.1/cb']);
  const refused = await authorize(h, 'dcr_ancienne_claude', 'https://claude.ai/api/mcp/auth_callback');
  assert.equal(refused.status, 400, 'site retiré de la liste : refusé');
  assert.equal(refused.location, null);
  assert.equal((await authorize(h, 'dcr_ancienne_chat', CHAT)).status, 303);
  assert.equal((await authorize(h, 'dcr_ancienne_locale', 'http://127.0.0.1:61000/cb')).status, 303);
  // Erreur vers un site listé : renvoyée
  assert.equal((await authorize(h, 'dcr_ancienne_chat', CHAT, { response_type: 'token' })).status, 302);
  // Fonctions seules
  const sites = ['chat.example'];
  assert.equal(allowedRedirect(CHAT, sites), true);
  assert.equal(allowedRedirect('https://chat.example:8443/cb', sites), true, 'même site, autre port');
  assert.equal(allowedRedirect('https://claude.ai/api/mcp/auth_callback', sites), false);
  assert.equal(allowedRedirect('https://www.chat.example/cb', sites), false, 'pas de sous-domaine implicite');
  assert.equal(allowedRedirect('http://chat.example/cb', sites), false);
  assert.equal(allowedRedirect('http://localhost:3/cb', sites), true);
  assert.equal(redirectMatches('https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback', sites), false);
});

test('CIMD : jamais lu hors de la liste courte (claude.ai, claude.com sans réglage ; les sites listés avec LISTO_MCP_SITES)', async (t) => {
  // Sans réglage : claude.ai lu, chat.example jamais (aucun appel réseau)
  const h = await setup(t);
  const outside = await authorize(h, 'https://chat.example/client.json', CHAT);
  assert.equal(outside.status, 400);
  assert.equal(outside.location, null);
  assert.deepEqual(h.metadata.calls, [], 'aucun appel vers chat.example');
  assert.equal((await authorize(h, CLAUDE_CODE, 'http://localhost:7000/callback')).status, 303);
  assert.deepEqual(h.metadata.calls, [CLAUDE_CODE]);
  assert.equal(cimdUrl('https://chat.example/client.json'), null);
  assert.equal(cimdUrl('https://claude.com/x')?.hostname, 'claude.com');

  // Avec LISTO_MCP_SITES=chat.example : chat.example lu, claude.ai jamais
  const s = await setup(t, { sites: ['chat.example'] });
  assert.equal((await authorize(s, CLAUDE_CODE, 'http://localhost:7000/callback')).status, 400);
  assert.deepEqual(s.metadata.calls, [], 'claude.ai hors de la liste : aucun appel');
  assert.equal((await authorize(s, 'https://chat.example/client.json', CHAT)).status, 303);
  assert.deepEqual(s.metadata.calls, ['https://chat.example/client.json']);
  assert.equal(cimdUrl(CLAUDE_CODE, ['chat.example']), null);
  for (const id of ['http://chat.example/client.json', 'https://chat.example:8443/client.json', 'https://sous.chat.example/client.json', 'https://chat.example/']) {
    assert.equal(cimdUrl(id, ['chat.example']), null, id);
  }
});

test('/mcp, en-tête Origin : sans réglage, absent ou https ; avec LISTO_MCP_SITES, absent ou un site listé', () => {
  const own = 'https://listo.exemple.fr';
  for (const origin of [undefined, 'https://claude.ai', 'https://chat.example', 'https://chat.example:8443']) {
    assert.equal(originAllowed(origin, { own }), true, String(origin));
  }
  for (const origin of ['http://chat.example', 'null', '', 'https://chat.example/', 'https://u@chat.example', 'chat.example', own]) {
    assert.equal(originAllowed(origin, { own }), false, origin);
  }
  const sites = ['chat.example'];
  assert.equal(originAllowed(undefined, { sites, own }), true);
  assert.equal(originAllowed('https://chat.example', { sites, own }), true);
  for (const origin of ['https://claude.ai', 'https://www.chat.example', 'https://chat.example:8443', 'http://chat.example']) {
    assert.equal(originAllowed(origin, { sites, own }), false, origin);
  }
});

test('/mcp, en-tête Origin avec LISTO_MCP_SITES : appel réel refusé (403) hors liste, accepté sur un site listé', async (t) => {
  const h = await setup(t, { sites: ['chat.example'] });
  const reg = await register(h, [CHAT]);
  const start = await authorize(h, reg.body.client_id, CHAT);
  const ok = await h.guillaume.post(`/api/oauth/demandes/${start.requestId}/accord`, { password: PASSWORD, scope: 'read', lists: 'all' });
  const code = new URL(ok.body.redirect).searchParams.get('code');
  const tokens = await fetch(`${h.app.base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CHAT, client_id: reg.body.client_id, code_verifier: start.pkce.verifier }),
  }).then((res) => res.json());
  const ping = (origin) => raw(h.app, 'POST', '/mcp', { headers: { authorization: `Bearer ${tokens.access_token}`, ...(origin ? { origin } : {}) }, body: { jsonrpc: '2.0', id: 1, method: 'ping' } });
  assert.equal((await ping()).status, 200);
  assert.equal((await ping('https://chat.example')).status, 200);
  assert.equal((await ping('https://claude.ai')).status, 403);
  assert.ok(h.app.logs.some((l) => /claude\.origin_refused/.test(l) && /claude\.ai/.test(l)));
});

test('LISTO_MCP_SITES : lue en minuscules sans espaces ; une valeur invalide empêche Listo de démarrer', () => {
  assert.deepEqual(loadConfig({}).mcpSites, [], 'absente : tout assistant IA');
  assert.deepEqual(loadConfig({ LISTO_MCP_SITES: '  ' }).mcpSites, []);
  assert.deepEqual(loadConfig({ LISTO_MCP_SITES: ' Claude.AI , claude.com ' }).mcpSites, ['claude.ai', 'claude.com']);
  assert.deepEqual(siteList('a.b,,c.d'), ['a.b', '', 'c.d']);
  const base = { LISTO_PUBLIC_URL: 'https://listo.test', NODE_ENV: 'production' };
  assert.equal(configProblem(loadConfig({ ...base, LISTO_MCP_SITES: 'claude.ai,claude.com,chat.example' })), null);
  for (const value of ['https://claude.ai', 'claude.ai/x', 'claude.ai:443', '192.168.1.2', '[::1]', '*.claude.ai', 'claude.ai,', 'claude.ai,,claude.com', 'localhost', 'claude ai', 'claude.ai.']) {
    const problem = configProblem(loadConfig({ ...base, LISTO_MCP_SITES: value }));
    assert.match(String(problem), /LISTO_MCP_SITES/, value);
  }
  // Message dans la langue de la console
  assert.match(configProblem(loadConfig({ ...base, LISTO_LANG: 'en', LISTO_MCP_SITES: 'https://x.y' })), /invalid site name/);
  assert.match(configProblem(loadConfig({ ...base, LISTO_MCP_SITES: 'https://x.y' })), /nom de site invalide/);
  assert.equal(validSite('xn--bcher-kva.de'), true);
});

test('LISTO_MCP_SITES resserrée après l\'accord : la connexion d\'un site retiré ne sert plus (/mcp, renouvellement), sans être effacée', async (t) => {
  const h = await setup(t);
  const reg = await register(h, [CHAT]);
  const start = await authorize(h, reg.body.client_id, CHAT);
  const ok = await h.guillaume.post(`/api/oauth/demandes/${start.requestId}/accord`, { password: PASSWORD, scope: 'read', lists: 'all' });
  const code = new URL(ok.body.redirect).searchParams.get('code');
  const tokens = await fetch(`${h.app.base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CHAT, client_id: reg.body.client_id, code_verifier: start.pkce.verifier }),
  }).then((res) => res.json());
  const ping = () => raw(h.app, 'POST', '/mcp', { headers: { authorization: `Bearer ${tokens.access_token}` }, body: { jsonrpc: '2.0', id: 1, method: 'ping' } });
  assert.equal((await ping()).status, 200);
  // Redémarrage avec LISTO_MCP_SITES=claude.ai (simulé : la configuration est relue)
  h.app.ctx.config.mcpSites = ['claude.ai'];
  assert.equal((await ping()).status, 401, 'site retiré : jeton refusé');
  const refresh = await fetch(`${h.app.base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: reg.body.client_id }),
  }).then((res) => res.json());
  assert.equal(refresh.error, 'invalid_grant');
  assert.equal((await authorize(h, reg.body.client_id, CHAT)).status, 400, 'nouvelle autorisation refusée');
  // Toujours visible (et déconnectable) dans « Assistants IA »
  assert.equal((await h.guillaume.get('/api/me/claude')).body.connections.length, 1);
  // Site remis : la connexion revient
  h.app.ctx.config.mcpSites = ['claude.ai', 'chat.example'];
  assert.equal((await ping()).status, 200);
});
