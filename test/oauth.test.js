// Autorisation OAuth pour Claude (étape A de docs/mcp-cadrage.md). Un faux
// client (« faux Claude ») rejoue tout le flux, sans aucun vrai réseau :
// description, enregistrement, autorisation dans le navigateur, accord avec
// mot de passe, échange du code (PKCE), renouvellement, révocation. Le
// document CIMD de Claude Code est servi par une fausse lecture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, createClient, ORIGIN } from './helpers.js';
import { totpCode, totpStep } from '../server/totp.js';
import { openTotpSecret } from '../server/twofactor.js';
import { allowedRedirect, redirectMatches, cimdUrl } from '../server/oauth-clients.js';
import { MAX_GRANTS } from '../server/oauth.js';
import { matchRoute, pathFor } from '../public/js/router.js';

const uuid = () => crypto.randomUUID();
const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
const PASSWORD = 'MotDePasseAdmin!';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const CLAUDE_CODE = 'https://claude.ai/oauth/claude-code-client-metadata';
const RESOURCE = `${ORIGIN}/mcp`;
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Faux documents CIMD : Claude Code (copie du vrai), et des « applications »
// https://claude.ai/app-N (pour le plafond de connexions). Chaque lecture est
// comptée : un client_id hors liste blanche ne doit en provoquer aucune.
function fakeMetadata() {
  const calls = [];
  const request = async (url) => {
    calls.push(url.href);
    if (url.href === CLAUDE_CODE) {
      return { client_id: CLAUDE_CODE, client_name: 'Claude Code', client_uri: 'https://claude.ai', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
    }
    if (/^https:\/\/claude\.ai\/app-\d+$/.test(url.href)) return { client_id: url.href, client_name: 'App', redirect_uris: [CALLBACK] };
    if (url.href === 'https://claude.ai/mauvais') return { client_id: 'https://claude.ai/autre', redirect_uris: [CALLBACK] };
    throw new Error('réponse HTTP 404');
  };
  return { calls, request };
}

// Listo avec LISTO_MCP=on, Guillaume (Admin) connecté, deux listes
async function setup(t, { mcp = true } = {}) {
  const metadata = fakeMetadata();
  const app = await startTestApp(t, { config: { mcp }, clientMetadataRequest: metadata.request });
  const guillaume = await setupAdmin(app);
  const lists = { courses: uuid(), maison: uuid() };
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: lists.courses, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'list.create', listId: lists.maison, name: 'Maison', listType: 'tasks' },
  ] });
  return { app, guillaume, lists, metadata };
}

// Requête sans cookie ni Origin, comme les serveurs de Claude
async function raw(app, method, url, { form, json, headers = {} } = {}) {
  const init = { method, redirect: 'manual', headers: { ...headers } };
  if (form) {
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  const res = await fetch(app.base + url, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, text, headers: res.headers };
}

const pkce = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
};

// Faux Claude : une application (DCR par défaut) qui demande l'accès
async function fakeClaude(h, { clientId, redirect = CALLBACK, ip } = {}) {
  let id = clientId;
  if (!id) {
    const reg = await raw(h.app, 'POST', '/oauth/register', { json: { client_name: 'Claude', redirect_uris: [redirect] }, headers: ip ? { 'x-forwarded-for': ip } : {} });
    assert.equal(reg.status, 201, reg.text);
    id = reg.body.client_id;
  }
  const claude = {
    clientId: id,
    redirect,
    // Ouvre /oauth/authorize ; renvoie la réponse (sans suivre la redirection)
    async authorize(extra = {}) {
      const p = pkce();
      const state = crypto.randomBytes(8).toString('hex');
      const params = { response_type: 'code', client_id: id, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state, scope: 'lists:read lists:write', resource: RESOURCE, ...extra };
      for (const [k, v] of Object.entries(params)) if (v === undefined) delete params[k];
      const res = await raw(h.app, 'GET', `/oauth/authorize?${new URLSearchParams(params)}`);
      const location = res.headers.get('location');
      const requestId = location?.match(/^\/#\/autoriser\/([A-Za-z0-9_-]{22})$/)?.[1] ?? null;
      return { ...res, location, requestId, pkce: p, state };
    },
    // Accord par la personne connectée (client avec cookie)
    async consent(user, requestId, body = {}) {
      return user.post(`/api/oauth/demandes/${requestId}/accord`, { password: PASSWORD, scope: 'read', lists: 'all', ...body });
    },
    // Tout le flux : autorisation, accord, échange du code
    async connect(user = h.guillaume, choice = {}) {
      const start = await claude.authorize();
      assert.equal(start.status, 303, start.text);
      const ok = await claude.consent(user, start.requestId, choice);
      assert.equal(ok.status, 200, ok.text);
      const back = new URL(ok.body.redirect);
      const tokens = await claude.token({ grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: redirect, client_id: id, code_verifier: start.pkce.verifier, resource: RESOURCE });
      assert.equal(tokens.status, 200, tokens.text);
      return { ...tokens.body, code: back.searchParams.get('code'), back, start };
    },
    token: (form) => raw(h.app, 'POST', '/oauth/token', { form }),
    refresh: (token, extra = {}) => claude.token({ grant_type: 'refresh_token', refresh_token: token, client_id: id, resource: RESOURCE, ...extra }),
  };
  return claude;
}

const access = (h, token) => h.app.ctx.oauth.verifyAccess(token);

test('descriptions : ressource protégée et serveur d\'autorisation, construites depuis LISTO_PUBLIC_URL', async (t) => {
  const h = await setup(t);
  for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
    const res = await raw(h.app, 'GET', path);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { resource: RESOURCE, authorization_servers: [ORIGIN], scopes_supported: ['lists:read', 'lists:write'], bearer_methods_supported: ['header'], resource_name: 'Listo' });
  }
  const as = (await raw(h.app, 'GET', '/.well-known/oauth-authorization-server')).body;
  assert.equal(as.issuer, ORIGIN);
  assert.equal(as.authorization_endpoint, `${ORIGIN}/oauth/authorize`);
  assert.equal(as.token_endpoint, `${ORIGIN}/oauth/token`);
  assert.equal(as.revocation_endpoint, `${ORIGIN}/oauth/revoke`);
  assert.equal(as.registration_endpoint, `${ORIGIN}/oauth/register`);
  assert.deepEqual(as.code_challenge_methods_supported, ['S256'], 'PKCE S256 seulement');
  assert.deepEqual(as.token_endpoint_auth_methods_supported, ['none']);
  assert.deepEqual(as.response_types_supported, ['code']);
  assert.deepEqual(as.grant_types_supported, ['authorization_code', 'refresh_token']);
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.equal(as.authorization_response_iss_parameter_supported, true);
  assert.equal((await raw(h.app, 'GET', '/.well-known/openid-configuration')).status, 404, 'pas de fournisseur OpenID');
});

test('flux complet (DCR) : autorisation, écran, accord avec mot de passe, code, jetons ; iss et state renvoyés', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const start = await claude.authorize();
  assert.equal(start.status, 303);
  assert.ok(start.requestId, start.location);
  assert.equal(start.headers.get('cache-control'), 'no-store');
  const shown = await h.guillaume.get(`/api/oauth/demandes/${start.requestId}`);
  assert.equal(shown.status, 200);
  assert.deepEqual(shown.body.request.app, { host: 'claude.ai', name: 'Claude', nameFromApp: true });
  assert.deepEqual(shown.body.request.redirect, { host: 'claude.ai', local: false });
  assert.equal(shown.body.request.write, true);
  assert.deepEqual(shown.body.account, { username: 'guillaume', displayName: 'Guillaume' });
  assert.equal(shown.body.twoFactor, false);
  assert.deepEqual(shown.body.lists.map((l) => l.name).sort(), ['Courses', 'Maison']);
  assert.deepEqual(Object.keys(shown.body.lists[0]).sort(), ['icon', 'id', 'isShopping', 'name'], 'listes : identifiant et nom seulement');

  const ok = await claude.consent(h.guillaume, start.requestId, { scope: 'write' });
  assert.equal(ok.status, 200);
  const back = new URL(ok.body.redirect);
  assert.equal(`${back.origin}${back.pathname}`, CALLBACK);
  assert.equal(back.searchParams.get('state'), start.state);
  assert.equal(back.searchParams.get('iss'), ORIGIN, 'paramètre iss (RFC 9207)');
  const code = back.searchParams.get('code');
  assert.match(code, /^[A-Za-z0-9_-]{43}$/, '256 bits');

  const tokens = await claude.token({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: claude.clientId, code_verifier: start.pkce.verifier, resource: RESOURCE });
  assert.equal(tokens.status, 200);
  assert.equal(tokens.headers.get('cache-control'), 'no-store');
  assert.equal(tokens.headers.get('pragma'), 'no-cache');
  assert.equal(tokens.body.token_type, 'Bearer');
  assert.equal(tokens.body.expires_in, 3600);
  assert.equal(tokens.body.scope, 'lists:read lists:write');
  const granted = access(h, tokens.body.access_token);
  assert.equal(granted.user.username, 'guillaume');
  assert.deepEqual(granted.grant.scope, ['lists:read', 'lists:write']);
  assert.equal(granted.grant.allLists, true);
  assert.ok(h.app.logs.some((l) => /claude\.connexion/.test(l) && /client="claude\.ai"/.test(l) && /portees="lists:read lists:write"/.test(l) && /listes="toutes"/.test(l)));
  assert.equal((await h.guillaume.get(`/api/oauth/demandes/${start.requestId}`)).status, 404, 'demande à usage unique');
});

test('Claude Code (CIMD) : retour local sur un port quelconque accepté, document lu une fois par heure ; claude.ai accepté', async (t) => {
  const h = await setup(t);
  const cc = await fakeClaude(h, { clientId: CLAUDE_CODE, redirect: 'http://localhost:53123/callback' });
  const first = await cc.authorize();
  assert.equal(first.status, 303, first.text);
  assert.equal((await fakeClaude(h, { clientId: CLAUDE_CODE, redirect: 'http://127.0.0.1:41000/callback' }).then((c) => c.authorize())).status, 303);
  assert.equal(h.metadata.calls.length, 1, 'document gardé une heure');
  h.app.clock.now += 61 * 60 * SECOND;
  assert.equal((await cc.authorize()).status, 303);
  assert.equal(h.metadata.calls.length, 2, 'relu après une heure');
  const shown = await h.guillaume.get(`/api/oauth/demandes/${first.requestId}`);
  assert.equal(shown.status, 404, 'demande de plus de 10 minutes : expirée');
  const fresh = await cc.authorize();
  const view = (await h.guillaume.get(`/api/oauth/demandes/${fresh.requestId}`)).body.request;
  assert.deepEqual(view.app, { host: 'claude.ai', name: 'Claude Code', nameFromApp: false });
  assert.deepEqual(view.redirect, { host: 'localhost', local: true });
  // Claude Code n'a pas déclaré la redirection de claude.ai
  assert.equal((await fakeClaude(h, { clientId: CLAUDE_CODE, redirect: CALLBACK }).then((c) => c.authorize())).status, 400);
  // Flux complet jusqu'aux jetons, redirection locale
  const tokens = await cc.connect();
  assert.ok(access(h, tokens.access_token));
  // Fonctions de comparaison
  assert.equal(redirectMatches('http://localhost:9/callback', 'http://localhost/callback'), true);
  assert.equal(redirectMatches('http://localhost:9/autre', 'http://localhost/callback'), false, 'chemin exact');
  assert.equal(redirectMatches('http://127.0.0.1:9/callback', 'http://localhost/callback'), false, 'hôte exact');
  assert.equal(redirectMatches('https://claude.ai/api/mcp/auth_callback?x=1', CALLBACK), false, 'claude.ai : adresse exacte');
  assert.equal(allowedRedirect('http://192.168.1.2/callback'), false);
  assert.equal(allowedRedirect('https://localhost/callback'), false);
  assert.equal(allowedRedirect('http://localhost.evil.com/callback'), false);
});

test('CIMD hors liste blanche ou document incohérent : refusé, sans appel réseau hors liste', async (t) => {
  const h = await setup(t);
  for (const clientId of ['https://evil.example/client.json', 'http://claude.ai/x', 'https://claude.ai.evil.com/x', 'https://claude.ai:8443/x', 'https://claude.ai/', 'https://user@claude.ai/x', 'https://claude.ai/x?y=1', 'nimporte-quoi']) {
    assert.equal(cimdUrl(clientId), null, clientId);
    const res = await (await fakeClaude(h, { clientId, redirect: CALLBACK })).authorize();
    assert.equal(res.status, 400, clientId);
    assert.equal(res.location, null, 'aucune redirection');
    assert.match(res.text, /Demande d'autorisation invalide/);
  }
  assert.equal(h.metadata.calls.length, 0, 'aucun appel réseau');
  const wrong = await (await fakeClaude(h, { clientId: 'https://claude.ai/mauvais' })).authorize();
  assert.equal(wrong.status, 400, 'client_id du document différent de son adresse');
  assert.ok(h.app.logs.some((l) => /claude\.client_refuse/.test(l)));
});

test('redirection non autorisée : DCR refusée, autorisation sans aucune redirection', async (t) => {
  const h = await setup(t);
  for (const uri of ['https://pirate.example/cb', 'http://192.168.0.2/cb', 'https://claude.ai/autre', 'javascript:alert(1)']) {
    const reg = await raw(h.app, 'POST', '/oauth/register', { json: { redirect_uris: [uri] } });
    assert.equal(reg.status, 400, uri);
    assert.equal(reg.body.error, 'invalid_redirect_uri');
  }
  assert.equal((await raw(h.app, 'POST', '/oauth/register', { json: { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_basic' } })).body.error, 'invalid_client_metadata');
  const claude = await fakeClaude(h);
  const evil = await (await fakeClaude(h, { clientId: claude.clientId, redirect: 'https://pirate.example/cb' })).authorize();
  assert.equal(evil.status, 400);
  assert.equal(evil.location, null);
  const unknown = await (await fakeClaude(h, { clientId: 'dcr_inconnu', redirect: CALLBACK })).authorize();
  assert.equal(unknown.status, 400);
  assert.equal(unknown.location, null);
  // CSP stricte aussi sur cette page
  assert.match(evil.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('autres erreurs : renvoyées à Claude avec state et iss (type de réponse, PKCE, ressource, portée)', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const cases = [
    [{ response_type: 'token' }, 'unsupported_response_type'],
    [{ code_challenge: undefined, code_challenge_method: undefined }, 'invalid_request'],
    [{ code_challenge_method: 'plain' }, 'invalid_request'],
    [{ code_challenge: 'trop-court' }, 'invalid_request'],
    [{ resource: 'https://autre.example/mcp' }, 'invalid_target'],
    [{ scope: 'lists:read admin' }, 'invalid_scope'],
  ];
  for (const [extra, error] of cases) {
    const res = await claude.authorize(extra);
    assert.equal(res.status, 302, JSON.stringify(extra));
    const back = new URL(res.location);
    assert.equal(`${back.origin}${back.pathname}`, CALLBACK);
    assert.equal(back.searchParams.get('error'), error);
    assert.equal(back.searchParams.get('state'), res.state);
    assert.equal(back.searchParams.get('iss'), ORIGIN);
  }
  // Sans paramètre resource (Claude Desktop peut l'omettre) : accepté
  assert.equal((await claude.authorize({ resource: undefined })).status, 303);
});

test('échange du code : PKCE erroné, code expiré, autre adresse ou autre client, ressource différente', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const start = await claude.authorize();
  const code = new URL((await claude.consent(h.guillaume, start.requestId)).body.redirect).searchParams.get('code');
  const base = { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: claude.clientId, code_verifier: start.pkce.verifier };
  assert.equal((await claude.token({ ...base, code_verifier: pkce().verifier })).body.error, 'invalid_grant', 'PKCE erroné');
  assert.equal((await claude.token({ ...base, code_verifier: 'court' })).body.error, 'invalid_grant');
  assert.equal((await claude.token({ ...base, redirect_uri: 'http://localhost/callback' })).body.error, 'invalid_grant');
  const other = await fakeClaude(h);
  assert.equal((await claude.token({ ...base, client_id: other.clientId })).body.error, 'invalid_grant');
  const stranger = await claude.token({ ...base, client_id: 'dcr_inconnu' });
  assert.equal(stranger.status, 401);
  assert.equal(stranger.body.error, 'invalid_client');
  assert.equal((await claude.token({ ...base, resource: 'https://autre.example/mcp' })).body.error, 'invalid_target');
  // Code expiré (60 s)
  h.app.clock.now += 61 * SECOND;
  const late = await claude.token(base);
  assert.equal(late.status, 400);
  assert.equal(late.body.error, 'invalid_grant');
});

test('code rejoué : refusé, et les jetons nés de ce code sont révoqués', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const tokens = await claude.connect();
  assert.ok(access(h, tokens.access_token));
  const replay = await claude.token({ grant_type: 'authorization_code', code: tokens.code, redirect_uri: CALLBACK, client_id: claude.clientId, code_verifier: tokens.start.pkce.verifier });
  assert.equal(replay.body.error, 'invalid_grant');
  assert.equal(access(h, tokens.access_token), null, 'jeton d\'accès révoqué');
  assert.equal((await claude.refresh(tokens.refresh_token)).body.error, 'invalid_grant', 'renouvellement révoqué');
  assert.ok(h.app.logs.some((l) => /claude\.revocation/.test(l) && /code d'autorisation rejoué/.test(l)));
});

test('portée accordée respectée : lecture seule par défaut, écriture seulement si demandée ; sélection de listes', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const read = await claude.connect(h.guillaume, { scope: 'read', lists: [h.lists.maison] });
  assert.equal(read.scope, 'lists:read');
  const grant = access(h, read.access_token).grant;
  assert.deepEqual(grant.scope, ['lists:read']);
  assert.equal(grant.allLists, false);
  assert.deepEqual(grant.listIds, [h.lists.maison]);
  // Renouvellement : portée jamais élargie
  assert.equal((await claude.refresh(read.refresh_token, { scope: 'lists:read lists:write' })).body.error, 'invalid_scope');
  // Application qui n'a demandé que la lecture : « Lecture et ajout » refusé
  const start = await claude.authorize({ scope: 'lists:read' });
  assert.equal((await h.guillaume.get(`/api/oauth/demandes/${start.requestId}`)).body.request.write, false);
  assert.equal((await claude.consent(h.guillaume, start.requestId, { scope: 'write' })).status, 400);
  // Choix invalides
  const again = await claude.authorize();
  for (const body of [{ scope: 'tout' }, { lists: [] }, { lists: [uuid()] }, { lists: 'certaines' }]) {
    assert.equal((await claude.consent(h.guillaume, again.requestId, body)).status, 400, JSON.stringify(body));
  }
  // Liste d'un autre compte : refusée
  const marieId = await addUser(h.app.db, { username: 'marie', password: 'MotDePasse-marie' });
  const marie = h.app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  const theirs = uuid();
  await marie.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId: theirs, name: 'Secret', listType: 'tasks' }] });
  assert.ok(marieId);
  assert.equal((await claude.consent(h.guillaume, again.requestId, { lists: [theirs] })).body.error, 'Liste introuvable.');
});

test('jetons : accès expiré après 1 h ; renouvellement avec rotation ; 30 jours glissants', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const first = await claude.connect();
  h.app.clock.now += 3601 * SECOND;
  assert.equal(access(h, first.access_token), null, 'accès expiré');
  const second = await claude.refresh(first.refresh_token);
  assert.equal(second.status, 200);
  assert.notEqual(second.body.refresh_token, first.refresh_token, 'rotation');
  assert.ok(access(h, second.body.access_token));
  // 29 jours plus tard : encore valable, et prolongé de 30 jours
  h.app.clock.now += 29 * DAY;
  const third = await claude.refresh(second.body.refresh_token);
  assert.equal(third.status, 200);
  h.app.clock.now += 29 * DAY;
  assert.equal((await claude.refresh(third.body.refresh_token)).status, 200, 'glissant');
  // Plus de 30 jours sans usage : expiré (la session de l'application a
  // expiré elle aussi : Guillaume se reconnecte)
  await login(h.guillaume, 'guillaume', PASSWORD);
  const fourth = await claude.connect();
  h.app.clock.now += 31 * DAY;
  assert.equal((await claude.refresh(fourth.refresh_token)).body.error, 'invalid_grant');
});

test('tolérance de 60 s : le même jeton rejoué donne les MÊMES jetons ; au-delà, réutilisation = connexion révoquée', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const first = await claude.connect();
  const second = await claude.refresh(first.refresh_token);
  h.app.clock.now += 30 * SECOND;
  const replay = await claude.refresh(first.refresh_token);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, second.body, 'mêmes jetons, aucune seconde chaîne');
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM oauth_tokens WHERE kind = 'refresh'").pluck().get(), 2, 'aucun jeton de plus');
  assert.ok(access(h, second.body.access_token), 'aucune révocation');
  // Au-delà de 60 s : réutilisation détectée
  h.app.clock.now += 31 * SECOND;
  const reuse = await claude.refresh(first.refresh_token);
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.error, 'invalid_grant');
  assert.equal(access(h, second.body.access_token), null, 'connexion entière révoquée');
  assert.equal((await claude.refresh(second.body.refresh_token)).body.error, 'invalid_grant');
  const line = h.app.logs.find((l) => /claude\.renouvellement/.test(l));
  assert.match(line, /reutilisation=true/);
  assert.match(line, /client="claude\.ai"/);
});

test(`${MAX_GRANTS} connexions au plus ; réautoriser la même application remplace son ancienne connexion`, async (t) => {
  const h = await setup(t);
  const apps = [];
  for (let i = 1; i <= MAX_GRANTS + 1; i++) apps.push(await fakeClaude(h, { clientId: `https://claude.ai/app-${i}` }));
  const tokens = [];
  for (const app of apps.slice(0, MAX_GRANTS)) tokens.push(await app.connect());
  const sixth = await apps[MAX_GRANTS].authorize();
  const refused = await apps[MAX_GRANTS].consent(h.guillaume, sixth.requestId);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /5 connexions Claude actives/);
  // La même application, réautorisée : remplace (la première tombe)
  const renewed = await apps[0].connect();
  assert.ok(access(h, renewed.access_token));
  assert.equal(access(h, tokens[0].access_token), null, 'ancienne connexion révoquée');
  assert.ok(access(h, tokens[1].access_token), 'les autres restent');
  assert.ok(h.app.logs.some((l) => /claude\.revocation/.test(l) && /remplacée/.test(l)));
  // Une connexion inutilisée 30 jours se libère d'elle-même
  h.app.clock.now += 31 * DAY;
  await login(h.guillaume, 'guillaume', PASSWORD);
  assert.equal((await apps[MAX_GRANTS].connect()).token_type, 'Bearer');
});

test('DCR plafonnée : 5 enregistrements par heure et par IP, 50 applications au plus, nettoyage des inutilisées', async (t) => {
  const h = await setup(t);
  const register = (ip) => raw(h.app, 'POST', '/oauth/register', { json: { redirect_uris: [CALLBACK] }, headers: { 'x-forwarded-for': ip } });
  for (let i = 0; i < 5; i++) assert.equal((await register('203.0.113.1')).status, 201);
  const sixth = await register('203.0.113.1');
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.error, 'temporarily_unavailable');
  for (let n = 2; n <= 10; n++) for (let i = 0; i < 5; i++) assert.equal((await register(`203.0.113.${n}`)).status, 201);
  const full = await register('203.0.113.99');
  assert.equal(full.status, 503, '50 applications au plus');
  // Une heure plus tard, un jour plus tard : les applications jamais utilisées partent
  h.app.clock.now += 25 * 60 * 60 * SECOND;
  h.app.ctx.oauth.purge();
  assert.equal(h.app.db.prepare("SELECT COUNT(*) FROM oauth_clients WHERE kind = 'dcr'").pluck().get(), 0);
  assert.equal((await register('203.0.113.1')).status, 201);
});

test('mot de passe erroné au consentement : refusé, limitation des tentatives ; code 2FA exigé si activée', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const start = await claude.authorize();
  const wrong = await claude.consent(h.guillaume, start.requestId, { password: 'pas le bon' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error, 'Mot de passe incorrect.');
  assert.ok(h.app.logs.some((l) => /mot_de_passe_refuse/.test(l) && /autorisation claude/.test(l)));
  for (let i = 0; i < 4; i++) await claude.consent(h.guillaume, start.requestId, { password: 'pas le bon' });
  const blocked = await claude.consent(h.guillaume, start.requestId);
  assert.equal(blocked.status, 429, 'bloqué même avec le bon mot de passe');
  assert.equal((await claude.consent(h.guillaume, start.requestId, { password: '' })).status, 400);

  // Compte avec 2FA : mot de passe ET code
  h.app.clock.now += 16 * 60 * SECOND;
  await h.guillaume.post('/api/me/2fa/enable');
  const user = () => h.app.db.prepare('SELECT * FROM users WHERE id = 1').get();
  await h.guillaume.post('/api/me/2fa/verify', { code: totpCode(openTotpSecret(h.app.ctx, user()), totpStep(h.app.clock.now)) });
  h.app.clock.now += 30 * SECOND;
  const twoFa = await claude.authorize();
  assert.equal((await h.guillaume.get(`/api/oauth/demandes/${twoFa.requestId}`)).body.twoFactor, true);
  assert.equal((await claude.consent(h.guillaume, twoFa.requestId)).status, 400, 'code manquant');
  assert.equal((await claude.consent(h.guillaume, twoFa.requestId, { code: '000000' })).status, 403, 'code faux');
  const good = await claude.consent(h.guillaume, twoFa.requestId, { code: totpCode(openTotpSecret(h.app.ctx, user()), totpStep(h.app.clock.now)) });
  assert.equal(good.status, 200);
});

test('mot de passe changé, compte désactivé, mot de passe réinitialisé par l\'Admin : connexions révoquées', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const mine = await claude.connect();
  await h.guillaume.post('/api/me/password', { currentPassword: PASSWORD, newPassword: 'NouveauMotDePasse!' });
  assert.equal(access(h, mine.access_token), null);
  assert.equal((await claude.refresh(mine.refresh_token)).body.error, 'invalid_grant');
  assert.ok(h.app.logs.some((l) => /claude\.revocation/.test(l) && /mot de passe changé/.test(l)));

  const marieId = await addUser(h.app.db, { username: 'marie', password: PASSWORD });
  const marie = h.app.client();
  await login(marie, 'marie', PASSWORD);
  const hers = await claude.connect(marie);
  await h.guillaume.request('PATCH', `/api/admin/users/${marieId}`, { active: false });
  assert.equal(access(h, hers.access_token), null, 'compte désactivé');
  assert.ok(h.app.logs.some((l) => /claude\.revocation/.test(l) && /compte désactivé/.test(l)));
  // Réactivée : l'ancienne connexion reste révoquée
  await h.guillaume.request('PATCH', `/api/admin/users/${marieId}`, { active: true });
  assert.equal(access(h, hers.access_token), null);

  await login(marie, 'marie', PASSWORD);
  const again = await claude.connect(marie);
  const reset = await h.guillaume.post(`/api/admin/users/${marieId}/password`, { password: 'MotDePasseProvisoire!' });
  assert.equal(reset.status, 200, reset.text);
  assert.equal(access(h, again.access_token), null, 'réinitialisé par l\'Admin');
});

test('compte qui doit changer son mot de passe : aucun accord possible avant', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  await addUser(h.app.db, { username: 'marie', password: PASSWORD });
  h.app.db.prepare("UPDATE users SET must_change_password = 1 WHERE username = 'marie'").run();
  const marie = h.app.client();
  await login(marie, 'marie', PASSWORD);
  const start = await claude.authorize();
  const shown = await marie.get(`/api/oauth/demandes/${start.requestId}`);
  assert.equal(shown.status, 403);
  assert.equal(shown.body.mustChangePassword, true);
  assert.equal((await claude.consent(marie, start.requestId)).status, 403);
});

test('refus : retour à Claude avec access_denied, state et iss ; journal claude.refus ; demande effacée', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const start = await claude.authorize();
  const res = await h.guillaume.post(`/api/oauth/demandes/${start.requestId}/refus`);
  const back = new URL(res.body.redirect);
  assert.equal(back.searchParams.get('error'), 'access_denied');
  assert.equal(back.searchParams.get('state'), start.state);
  assert.equal(back.searchParams.get('iss'), ORIGIN);
  assert.equal(back.searchParams.get('code'), null);
  assert.ok(h.app.logs.some((l) => /claude\.refus/.test(l) && /client="claude\.ai"/.test(l)));
  assert.equal((await h.guillaume.post(`/api/oauth/demandes/${start.requestId}/refus`)).status, 404);
});

test('accord : jamais par GET, jamais sans la même origine, jamais sans session ; demande expirée après 10 minutes', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const start = await claude.authorize();
  assert.equal((await h.guillaume.get(`/api/oauth/demandes/${start.requestId}/accord`)).status, 404, 'pas d\'accord par GET');
  const elsewhere = createClient(h.app.base, { origin: 'https://pirate.example' });
  for (const [name, value] of h.guillaume.jar) elsewhere.jar.set(name, value);
  assert.equal((await claude.consent(elsewhere, start.requestId)).status, 403, 'autre origine (CSRF)');
  assert.equal((await claude.consent(h.app.client(), start.requestId)).status, 401, 'sans session');
  h.app.clock.now += 10 * 60 * SECOND + 1;
  assert.equal((await claude.consent(h.guillaume, start.requestId)).status, 404, 'expirée');
});

test('révocation par l\'application (RFC 7009) : toujours 200 ; le jeton présenté fait tomber sa connexion', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const other = await fakeClaude(h);
  const tokens = await claude.connect();
  assert.equal((await raw(h.app, 'POST', '/oauth/revoke', { form: { token: 'inconnu', client_id: claude.clientId } })).status, 200);
  assert.equal((await raw(h.app, 'POST', '/oauth/revoke', { form: { token: tokens.refresh_token, client_id: other.clientId } })).status, 200);
  assert.ok(access(h, tokens.access_token), 'jeton d\'une autre application : rien ne change');
  assert.equal((await raw(h.app, 'POST', '/oauth/revoke', { form: { token: tokens.refresh_token, client_id: claude.clientId } })).status, 200);
  assert.equal(access(h, tokens.access_token), null);
  assert.ok(h.app.logs.some((l) => /claude\.revocation/.test(l) && /demandée par l'application/.test(l)));
});

test('point d\'échange : formulaire seulement, paramètre répété refusé, type inconnu, cookie de session ignoré', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const tokens = await claude.connect();
  const json = await raw(h.app, 'POST', '/oauth/token', { json: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: claude.clientId } });
  assert.equal(json.status, 400);
  assert.equal(json.body.error, 'invalid_request', 'JSON refusé : formulaire attendu');
  const repeated = await fetch(`${h.app.base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${tokens.refresh_token}&refresh_token=x&client_id=${claude.clientId}` });
  assert.equal((await repeated.json()).error, 'invalid_request');
  assert.equal((await claude.token({ grant_type: 'password', username: 'guillaume', password: PASSWORD })).body.error, 'unsupported_grant_type');
  // Le cookie de session ne donne rien sur /oauth/token
  const withCookie = await h.guillaume.request('POST', '/oauth/token', undefined, { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(withCookie.status, 400);
  assert.equal(withCookie.body.error, 'invalid_request');
  // Et un jeton Claude n'ouvre pas l'API de l'application
  const bearer = await raw(h.app, 'GET', '/api/me', { headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(bearer.status, 401, 'jeton refusé sur /api');
  // Sur /mcp (étape B), le jeton est accepté : une requête vide y est refusée par le protocole, pas par l'authentification
  assert.equal((await raw(h.app, 'POST', '/mcp', { headers: { authorization: `Bearer ${tokens.access_token}` } })).status, 400, 'jeton accepté sur /mcp');
});

test('codes et jetons : empreintes seulement en base, jamais dans les journaux', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  const first = await claude.connect();
  const second = (await claude.refresh(first.refresh_token)).body;
  const secrets = [first.code, first.access_token, first.refresh_token, second.access_token, second.refresh_token];
  const dump = [];
  for (const table of ['oauth_clients', 'oauth_requests', 'oauth_grants', 'oauth_grant_lists', 'oauth_codes', 'oauth_tokens']) {
    dump.push(JSON.stringify(h.app.db.prepare(`SELECT * FROM ${table}`).all()));
  }
  const all = dump.join('\n');
  for (const secret of secrets) {
    assert.equal(all.includes(secret), false, 'jamais en clair en base');
    assert.equal(h.app.logs.join('\n').includes(secret), false, 'jamais dans le journal');
  }
  const hashes = h.app.db.prepare('SELECT token_hash FROM oauth_tokens').pluck().all();
  assert.ok(hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash)), 'empreinte SHA-256');
  assert.ok(h.app.db.prepare('SELECT code_hash FROM oauth_codes').pluck().all().every((hash) => /^[0-9a-f]{64}$/.test(hash)));
});

test('nettoyage : demandes, codes et jetons expirés effacés ; connexion inutilisée 30 jours libérée', async (t) => {
  const h = await setup(t);
  const claude = await fakeClaude(h);
  await claude.authorize();
  await claude.connect();
  h.app.clock.now += 32 * DAY;
  h.app.ctx.oauth.purge();
  const count = (table) => h.app.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  assert.equal(count('oauth_requests'), 0);
  assert.equal(count('oauth_codes'), 0);
  assert.equal(count('oauth_tokens'), 0);
  assert.ok(h.app.db.prepare('SELECT revoked_at FROM oauth_grants').pluck().all().every(Boolean), 'connexion libérée');
  h.app.clock.now += 31 * DAY;
  h.app.ctx.oauth.purge();
  assert.equal(count('oauth_grants'), 0);
  assert.equal(count('oauth_clients'), 0);
});

test('LISTO_MCP désactivé (par défaut) : toutes les adresses répondent 404', async (t) => {
  const h = await setup(t, { mcp: false });
  for (const [method, url] of [
    ['GET', '/.well-known/oauth-protected-resource/mcp'], ['GET', '/.well-known/oauth-protected-resource'],
    ['GET', '/.well-known/oauth-authorization-server'], ['GET', '/oauth/authorize?client_id=x'],
    ['POST', '/oauth/token'], ['POST', '/oauth/revoke'], ['POST', '/oauth/register'], ['POST', '/mcp'],
  ]) {
    assert.equal((await raw(h.app, method, url, method === 'POST' ? { form: { a: 'b' } } : {})).status, 404, url);
  }
  assert.equal((await h.guillaume.get('/api/oauth/demandes/AAAAAAAAAAAAAAAAAAAAAA')).status, 404);
  assert.equal((await h.guillaume.post('/api/oauth/demandes/AAAAAAAAAAAAAAAAAAAAAA/accord', {})).status, 404);
  assert.equal(h.metadata.calls.length, 0);
});

test('configuration : LISTO_MCP désactivé par défaut, seulement « on » l\'active ; absent de docker-compose.yml', async () => {
  const { loadConfig } = await import('../server/config.js');
  assert.equal(loadConfig({}).mcp, false);
  assert.equal(loadConfig({ LISTO_MCP: 'on' }).mcp, true);
  assert.equal(loadConfig({ LISTO_MCP: ' ON ' }).mcp, true);
  for (const value of ['', 'off', 'oui', '1', 'true']) assert.equal(loadConfig({ LISTO_MCP: value }).mcp, false, value);
  assert.equal(/LISTO_MCP=on/.test(read('docker-compose.yml')), false, 'jamais activé dans docker-compose.yml');
});

test('écran « Autoriser Claude » : adresse, lecture seule présélectionnée, mot de passe, POST seulement, textContent', () => {
  assert.deepEqual(matchRoute('#/autoriser/abcdefghijklmnopqrstuv'), { name: 'authorize', params: { id: 'abcdefghijklmnopqrstuv' } });
  assert.equal(pathFor('authorize', { id: 'x' }), '#/autoriser/x');
  const app = read('public/js/app.js');
  assert.match(app, /case 'authorize': mount\(\(\) => renderClaudeConsent\(params\.id\), \{ withSide: false \}\); break;/);
  assert.match(app, /if \(route\.name === 'authorize'\) app\.afterLogin = route;/);
  const screen = read('public/js/screens/claude-consent.js');
  assert.match(screen, /let scope = 'read';\s+\/\/ « Lecture seule » présélectionnée/);
  assert.match(screen, /let allLists = true;\s+\/\/ « Toutes mes listes » par défaut/);
  assert.match(screen, /'Ne continuez que si vous venez de lancer la connexion depuis Claude\.'/);
  assert.match(screen, /'une application sur cet ordinateur \(localhost\)'/);
  // Nom déclaré par l'application elle-même (DCR) : « non vérifié »
  assert.match(screen, /const named = request\.app\.nameFromApp \? 'nom donné par l\\'application, non vérifié' : 'nom fourni par l\\'application';/);
  assert.match(screen, /const appSub = request\.app\.name \? `« \$\{request\.app\.name\} » \(\$\{named\}\)`/);
  // Phrase de confirmation juste au-dessus d'« Autoriser », dans la barre du bas
  assert.match(screen, /h\('div', \{ class: 'footer' \},\s*h\('p', \{\}, 'Vous venez de lancer cette connexion depuis Claude \? Si ce n\\'est pas le cas, refusez\.'\),\s*allow, deny\)/);
  assert.match(screen, /post\(`\/api\/oauth\/demandes\/\$\{enc\(id\)\}\/accord`/);
  assert.match(screen, /location\.assign\(redirect\)/);
  assert.doesNotMatch(screen, /innerHTML|\.focus\(|style=|<script/);
  assert.ok(read('public/sw.js').includes("'/js/screens/claude-consent.js'"), 'écran disponible hors ligne (message)');
});

test('en-têtes de la page de consentement : CSP stricte sans script ni style en ligne, cadre interdit', async (t) => {
  const h = await setup(t);
  const page = await raw(h.app, 'GET', '/');
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
});
