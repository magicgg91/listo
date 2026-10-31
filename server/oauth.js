// Autorisation OAuth de Listo pour Claude (étape A de docs/mcp-cadrage.md).
//
// Listo est son propre « serveur d'autorisation » : une personne connectée
// à Listo autorise Claude (claude.ai, mobile, Desktop, Claude Code) à lire
// ses listes, et éventuellement à y ajouter, sans jamais lui donner son mot
// de passe. Étapes :
// 1. Claude ouvre /oauth/authorize dans le navigateur : la demande est
//    vérifiée puis gardée 10 minutes (oauth_requests) ;
// 2. la personne accepte sur l'écran « Autoriser Claude », en confirmant
//    son mot de passe : une « connexion » est créée (oauth_grants), avec un
//    code à usage unique valable 60 s, renvoyé à Claude ;
// 3. Claude échange ce code (et la preuve PKCE) contre un jeton d'accès
//    (1 heure) et un jeton de renouvellement (30 jours glissants, remplacé à
//    chaque usage).
//
// Codes et jetons : 256 bits aléatoires ; la base ne garde que leur
// empreinte SHA-256 ; ils ne sont jamais écrits dans le journal.
//
// Règles de sécurité principales :
// - PKCE S256 obligatoire ; code à usage unique : un code rejoué révoque la
//   connexion entière (et donc les jetons nés de ce code) ;
// - jeton de renouvellement réutilisé après usage : révocation de toute la
//   connexion (journalisée), sauf s'il est rejoué dans les 60 s : la même
//   réponse est alors renvoyée (copie gardée en mémoire seulement) ;
// - 5 connexions actives au plus par compte ; réautoriser la même
//   application remplace son ancienne connexion ;
// - changement de mot de passe, désactivation du compte : toutes ses
//   connexions sont révoquées (revokeAllForUser).

import crypto from 'node:crypto';
import { hashToken } from './auth.js';
import {
  cimdUrl, checkCimdDocument, fetchClientMetadata, checkRegistration, redirectMatches, redirectHost,
} from './oauth-clients.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const ACCESS_TTL = HOUR;
export const REFRESH_TTL = 30 * DAY;
export const CODE_TTL = 60 * SECOND;
export const REQUEST_TTL = 10 * MINUTE;
export const REUSE_GRACE = 60 * SECOND;
export const MAX_GRANTS = 5;
export const MAX_DCR_CLIENTS = 50;
export const DCR_PER_IP_HOUR = 5;
const CIMD_CACHE = HOUR;

// Portées : « Lecture seule », ou « Lecture et ajout »
export const SCOPE_READ = 'lists:read';
export const SCOPE_WRITE = 'lists:write';
export const SCOPES = [SCOPE_READ, SCOPE_WRITE];
export const GRANT_SCOPES = { read: SCOPE_READ, write: `${SCOPE_READ} ${SCOPE_WRITE}` };

export const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;          // BASE64URL(SHA256(…)), sans « = »
const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;    // RFC 7636, §4.1
export const REQUEST_ID = /^[A-Za-z0-9_-]{22}$/;

// Erreur à renvoyer telle quelle : status HTTP, code OAuth, explication
export class OAuthError extends Error {
  constructor(status, error, description) {
    super(description);
    this.status = status;
    this.error = error;
  }
}

const newSecret = () => crypto.randomBytes(32).toString('base64url');
const newId = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// Preuve PKCE : BASE64URL(SHA256(code_verifier)) doit être égal au défi
export function pkceMatches(verifier, challenge) {
  if (typeof verifier !== 'string' || !PKCE_VERIFIER.test(verifier)) return false;
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(String(challenge));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Portées demandées (« lists:read lists:write ») : liste sans doublon, ou
// null si une portée est inconnue. Rien de demandé : les deux.
export function parseScope(value) {
  if (value === undefined || value === null || String(value).trim() === '') return [...SCOPES];
  if (typeof value !== 'string') return null;
  const asked = [...new Set(value.trim().split(/\s+/))];
  return asked.every((s) => SCOPES.includes(s)) ? asked : null;
}

// Ajoute des paramètres à une adresse de retour (ceux qui y sont déjà restent)
export function withParams(uri, params) {
  const url = new URL(uri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, value);
  }
  return url.href;
}

// ctx : db, now, audit, config. options.fetchMetadata : lecture d'un
// document CIMD (les tests la remplacent : aucun vrai réseau).
export function createOAuthService(ctx, { fetchMetadata = fetchClientMetadata } = {}) {
  const { db } = ctx;
  const origin = new URL(ctx.config.publicUrl).origin;
  const issuer = origin;
  const resource = `${origin}/mcp`;
  const iso = (ms = ctx.now()) => new Date(ms).toISOString();
  const audit = (event, details) => ctx.audit?.(event, details);

  // Réponses déjà envoyées pour un renouvellement, gardées 60 s EN MÉMOIRE
  // seulement (jamais en base) : empreinte de l'ancien jeton -> réponse
  const recentRefresh = new Map();
  // Enregistrements automatiques par adresse IP et par heure
  const dcrByIp = new Map();

  const q = {
    client: db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?'),
    countDcr: db.prepare("SELECT COUNT(*) FROM oauth_clients WHERE kind = 'dcr'").pluck(),
    insertClient: db.prepare(`INSERT INTO oauth_clients (client_id, kind, client_name, redirect_uris, created_ip, created_at, fetched_at)
      VALUES (@clientId, @kind, @clientName, @redirectUris, @ip, @now, @fetchedAt)
      ON CONFLICT (client_id) DO UPDATE SET client_name = excluded.client_name, redirect_uris = excluded.redirect_uris, fetched_at = excluded.fetched_at`),
    useClient: db.prepare('UPDATE oauth_clients SET last_used_at = ? WHERE client_id = ?'),
    insertRequest: db.prepare(`INSERT INTO oauth_requests (id, client_id, redirect_uri, state, code_challenge, resource, scope, created_at, expires_at)
      VALUES (@id, @clientId, @redirectUri, @state, @codeChallenge, @resource, @scope, @now, @expiresAt)`),
    request: db.prepare(`SELECT oauth_requests.*, oauth_clients.kind, oauth_clients.client_name
      FROM oauth_requests JOIN oauth_clients ON oauth_clients.client_id = oauth_requests.client_id
      WHERE oauth_requests.id = ? AND oauth_requests.expires_at > ?`),
    deleteRequest: db.prepare('DELETE FROM oauth_requests WHERE id = ?'),
    activeGrants: db.prepare(`SELECT * FROM oauth_grants
      WHERE user_id = ? AND revoked_at IS NULL AND COALESCE(last_used_at, created_at) > ?`),
    insertGrant: db.prepare(`INSERT INTO oauth_grants (user_id, client_id, app_key, client_host, redirect_host, scope, all_lists, created_at, last_used_at)
      VALUES (@userId, @clientId, @appKey, @clientHost, @redirectHost, @scope, @allLists, @now, @now)`),
    insertGrantList: db.prepare('INSERT INTO oauth_grant_lists (grant_id, list_id) VALUES (?, ?)'),
    grant: db.prepare('SELECT * FROM oauth_grants WHERE id = ?'),
    grantLists: db.prepare('SELECT list_id FROM oauth_grant_lists WHERE grant_id = ? ORDER BY list_id').pluck(),
    useGrant: db.prepare('UPDATE oauth_grants SET last_used_at = ? WHERE id = ?'),
    revokeGrant: db.prepare('UPDATE oauth_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL'),
    revokeGrantTokens: db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL'),
    userGrants: db.prepare('SELECT id FROM oauth_grants WHERE user_id = ? AND revoked_at IS NULL').pluck(),
    insertCode: db.prepare(`INSERT INTO oauth_codes (code_hash, grant_id, client_id, redirect_uri, code_challenge, resource, scope, expires_at)
      VALUES (@codeHash, @grantId, @clientId, @redirectUri, @codeChallenge, @resource, @scope, @expiresAt)`),
    code: db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?'),
    useCode: db.prepare('UPDATE oauth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL'),
    insertToken: db.prepare(`INSERT INTO oauth_tokens (token_hash, grant_id, kind, resource, scope, created_at, expires_at)
      VALUES (@tokenHash, @grantId, @kind, @resource, @scope, @now, @expiresAt)`),
    token: db.prepare('SELECT * FROM oauth_tokens WHERE token_hash = ?'),
    useToken: db.prepare('UPDATE oauth_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL'),
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
  };

  // --- Applications (clients) ---

  // Retrouve l'application d'un client_id. CIMD : document lu sur la liste
  // blanche seulement (sinon refus SANS appel réseau), relu au plus une
  // fois par heure. DCR : enregistrée auparavant par /oauth/register.
  async function resolveClient(clientId) {
    if (typeof clientId !== 'string' || !clientId || clientId.length > 500) return null;
    const known = q.client.get(clientId);
    if (known?.kind === 'dcr') return known;
    const url = cimdUrl(clientId);
    if (!url) return null;
    if (known && Date.parse(known.fetched_at) > ctx.now() - CIMD_CACHE) return known;
    let doc;
    try {
      doc = checkCimdDocument(clientId, await fetchMetadata(url));
    } catch (error) {
      audit('claude.client_refuse', { client: url.hostname, raison: error.message });
      return null;
    }
    const now = iso();
    q.insertClient.run({ clientId, kind: 'cimd', clientName: doc.clientName, redirectUris: JSON.stringify(doc.redirectUris), ip: null, now, fetchedAt: now });
    return q.client.get(clientId);
  }

  // Enregistrement automatique (DCR). Renvoie la description du client
  // (RFC 7591, §3.2.1) ou lance une OAuthError.
  function register(body, ip) {
    const checked = checkRegistration(body);
    if (checked.error) throw new OAuthError(400, checked.error, checked.description);
    const time = ctx.now();
    let entry = dcrByIp.get(ip);
    if (!entry || time - entry.start >= HOUR) entry = { start: time, count: 0 };
    if (entry.count >= DCR_PER_IP_HOUR) throw new OAuthError(429, 'temporarily_unavailable', 'Trop d\'enregistrements : réessayez dans une heure.');
    if (q.countDcr.get() >= MAX_DCR_CLIENTS) throw new OAuthError(503, 'temporarily_unavailable', 'Nombre maximal d\'applications enregistrées atteint.');
    entry.count += 1;
    dcrByIp.set(ip, entry);
    const clientId = `dcr_${newId(16)}`;
    q.insertClient.run({ clientId, kind: 'dcr', clientName: checked.clientName, redirectUris: JSON.stringify(checked.redirectUris), ip, now: iso(time), fetchedAt: null });
    audit('claude.enregistrement', { client: redirectHost(checked.redirectUris[0]), ip });
    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(time / 1000),
      client_name: checked.clientName || undefined,
      redirect_uris: checked.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  // L'adresse de retour demandée est-elle une de celles du client ?
  function clientRedirect(client, requested) {
    const registered = JSON.parse(client.redirect_uris);
    return registered.some((uri) => redirectMatches(requested, uri));
  }

  // Hôte qui représente l'application : celui du document CIMD (claude.ai),
  // ou celui de l'adresse de retour pour un client DCR
  const clientHost = (client, redirectUri) => (client.kind === 'cimd' ? new URL(client.client_id).hostname : redirectHost(redirectUri));

  // --- Demandes d'autorisation ---

  // Garde une demande déjà vérifiée (10 minutes). Renvoie son identifiant.
  function createRequest({ client, redirectUri, state, codeChallenge, scope }) {
    const id = newId(16);
    const time = ctx.now();
    q.insertRequest.run({
      id, clientId: client.client_id, redirectUri, state: state ?? null, codeChallenge,
      resource, scope: scope.join(' '), now: iso(time), expiresAt: iso(time + REQUEST_TTL),
    });
    return id;
  }

  function findRequest(id) {
    if (typeof id !== 'string' || !REQUEST_ID.test(id)) return null;
    return q.request.get(id, iso()) ?? null;
  }

  // Ce que l'écran « Autoriser Claude » affiche (aucun secret)
  function describeRequest(request) {
    const kind = request.kind;
    return {
      id: request.id,
      app: {
        host: clientHost({ kind, client_id: request.client_id }, request.redirect_uri),
        name: request.client_name || null,
        nameFromApp: kind === 'dcr',
      },
      redirect: { host: redirectHost(request.redirect_uri), local: !request.redirect_uri.startsWith('https:') },
      write: request.scope.split(' ').includes(SCOPE_WRITE),
      expiresAt: request.expires_at,
    };
  }

  // Adresse de retour d'une réponse d'autorisation (avec state et iss, RFC 9207)
  const answer = (request, params) => withParams(request.redirect_uri, { ...params, state: request.state, iss: issuer });

  // Refus par la personne : retour vers Claude avec access_denied
  function refuse(request, user, ip) {
    q.deleteRequest.run(request.id);
    const host = describeRequest(request).app.host;
    audit('claude.refus', { utilisateur: user.username, client: host, ip });
    return answer(request, { error: 'access_denied' });
  }

  // Accord : crée la connexion et son code. choice : { scope: 'read' |
  // 'write', lists: 'all' | [identifiants] } ; listIds déjà vérifiés par
  // l'appelant (listes dont le compte est membre). Renvoie l'adresse de retour.
  function approve(request, user, { scope, allLists, listIds }, ip) {
    const granted = GRANT_SCOPES[scope];
    const host = describeRequest(request).app.host;
    const redirectHostName = redirectHost(request.redirect_uri);
    const appKey = request.kind === 'cimd' ? request.client_id : `dcr:${redirectHostName}`;
    const time = ctx.now();
    const code = newSecret();
    db.transaction(() => {
      // 5 connexions actives au plus, sans compter celle de la même
      // application : la réautoriser remplace son ancienne connexion
      const active = q.activeGrants.all(user.id, iso(time - REFRESH_TTL));
      if (active.filter((grant) => grant.app_key !== appKey).length >= MAX_GRANTS) {
        throw new OAuthError(409, 'too_many_grants', `Vous avez déjà ${MAX_GRANTS} connexions Claude actives (le maximum). Une connexion inutilisée pendant 30 jours se libère d'elle-même.`);
      }
      for (const grant of active) {
        if (grant.app_key === appKey) revokeGrant(grant.id, { reason: 'remplacée par une nouvelle autorisation', user });
      }
      const grantId = Number(q.insertGrant.run({
        userId: user.id, clientId: request.client_id, appKey, clientHost: host, redirectHost: redirectHostName,
        scope: granted, allLists: allLists ? 1 : 0, now: iso(time),
      }).lastInsertRowid);
      if (!allLists) for (const listId of listIds) q.insertGrantList.run(grantId, listId);
      q.insertCode.run({
        codeHash: hashToken(code), grantId, clientId: request.client_id, redirectUri: request.redirect_uri,
        codeChallenge: request.code_challenge, resource: request.resource, scope: granted, expiresAt: iso(time + CODE_TTL),
      });
      q.deleteRequest.run(request.id);
      q.useClient.run(iso(time), request.client_id);
    })();
    audit('claude.connexion', {
      utilisateur: user.username, client: host, retour: redirectHostName, portees: granted,
      listes: allLists ? 'toutes' : listIds.length, ip,
    });
    return answer(request, { code });
  }

  // --- Jetons ---

  // Crée une paire de jetons pour une connexion ; renvoie la réponse /oauth/token
  function issueTokens(grant, time) {
    const access = newSecret();
    const refresh = newSecret();
    const base = { grantId: grant.id, resource, scope: grant.scope, now: iso(time) };
    q.insertToken.run({ ...base, tokenHash: hashToken(access), kind: 'access', expiresAt: iso(time + ACCESS_TTL) });
    q.insertToken.run({ ...base, tokenHash: hashToken(refresh), kind: 'refresh', expiresAt: iso(time + REFRESH_TTL) });
    q.useGrant.run(iso(time), grant.id);
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL / SECOND, refresh_token: refresh, scope: grant.scope };
  }

  // Connexion utilisable : non révoquée, compte actif
  function liveGrant(grantId) {
    const grant = q.grant.get(grantId);
    if (!grant || grant.revoked_at) return null;
    const user = q.user.get(grant.user_id);
    return user?.active === 1 ? { grant, user } : null;
  }

  const invalidGrant = (description) => new OAuthError(400, 'invalid_grant', description);

  function checkResource(value) {
    if (value !== undefined && value !== resource) throw new OAuthError(400, 'invalid_target', `Ressource inconnue : seule ${resource} est servie.`);
  }

  // Échange d'un code d'autorisation (grant_type=authorization_code)
  function exchangeCode(params) {
    const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier } = params;
    if (typeof code !== 'string' || typeof redirectUri !== 'string' || typeof clientId !== 'string' || typeof verifier !== 'string') {
      throw new OAuthError(400, 'invalid_request', 'Paramètres manquants : code, redirect_uri, client_id et code_verifier sont exigés.');
    }
    checkResource(params.resource);
    if (!q.client.get(clientId)) throw new OAuthError(401, 'invalid_client', 'Application inconnue.');
    const time = ctx.now();
    // Les refus sont RENVOYÉS (et non lancés) par la transaction : une
    // révocation décidée dedans doit être enregistrée, pas annulée.
    const result = db.transaction(() => {
      const row = q.code.get(hashToken(code));
      if (!row) return { error: invalidGrant('Code inconnu.') };
      if (row.used_at) {
        // Code rejoué : la connexion et tous les jetons nés de ce code tombent
        revokeGrant(row.grant_id, { reason: 'code d\'autorisation rejoué' });
        return { error: invalidGrant('Code déjà utilisé.') };
      }
      if (Date.parse(row.expires_at) <= time) return { error: invalidGrant('Code expiré.') };
      if (row.client_id !== clientId || row.redirect_uri !== redirectUri) return { error: invalidGrant('Code émis pour une autre application ou une autre adresse de retour.') };
      if (!pkceMatches(verifier, row.code_challenge)) return { error: invalidGrant('Preuve PKCE incorrecte.') };
      q.useCode.run(iso(time), row.code_hash);
      const live = liveGrant(row.grant_id);
      if (!live) return { error: invalidGrant('Connexion révoquée.') };
      return { body: issueTokens(live.grant, time) };
    })();
    if (result.error) throw result.error;
    return result.body;
  }

  // Renouvellement (grant_type=refresh_token) : l'ancien jeton est
  // consommé, une nouvelle paire est émise. Rejoué dans les 60 s : même
  // réponse ; plus tard : réutilisation, toute la connexion est révoquée.
  function refresh(params) {
    const { refresh_token: token, client_id: clientId } = params;
    if (typeof token !== 'string' || typeof clientId !== 'string') {
      throw new OAuthError(400, 'invalid_request', 'Paramètres manquants : refresh_token et client_id sont exigés.');
    }
    checkResource(params.resource);
    const time = ctx.now();
    const tokenHash = hashToken(token);
    // Refus renvoyés (et non lancés) : une révocation doit rester enregistrée
    const result = db.transaction(() => {
      const row = q.token.get(tokenHash);
      if (!row || row.kind !== 'refresh') return { error: invalidGrant('Jeton de renouvellement inconnu.') };
      const grant = q.grant.get(row.grant_id);
      if (!grant || grant.client_id !== clientId) return { error: invalidGrant('Jeton émis pour une autre application.') };
      if (params.scope !== undefined) {
        const asked = parseScope(params.scope);
        const allowed = grant.scope.split(' ');
        if (!asked || !asked.every((s) => allowed.includes(s))) return { error: new OAuthError(400, 'invalid_scope', 'Portée plus large que celle accordée.') };
      }
      if (row.revoked_at || grant.revoked_at) return { error: invalidGrant('Connexion révoquée.') };
      if (row.used_at) {
        if (time - Date.parse(row.used_at) <= REUSE_GRACE) {
          const kept = recentRefresh.get(tokenHash);
          if (kept && liveGrant(grant.id)) return { body: kept.body };   // même réponse, aucune seconde chaîne
          return { error: invalidGrant('Renouvellement déjà effectué : recommencez la connexion.') };
        }
        const user = q.user.get(grant.user_id);
        revokeGrant(grant.id, { reason: 'jeton de renouvellement réutilisé', silent: true });
        audit('claude.renouvellement', { reutilisation: true, utilisateur: user?.username ?? null, client: grant.client_host, portees: grant.scope });
        return { error: invalidGrant('Jeton de renouvellement déjà utilisé : connexion révoquée.') };
      }
      if (Date.parse(row.expires_at) <= time) return { error: invalidGrant('Jeton de renouvellement expiré.') };
      const live = liveGrant(grant.id);
      if (!live) return { error: invalidGrant('Connexion révoquée.') };
      q.useToken.run(iso(time), tokenHash);
      const body = issueTokens(live.grant, time);
      recentRefresh.set(tokenHash, { body, expiresAt: time + REUSE_GRACE });
      return { body };
    })();
    if (result.error) throw result.error;
    return result.body;
  }

  // --- Révocations ---

  // Révoque une connexion et tous ses jetons. reason : texte pour le
  // journal ; user : compte concerné (pour le journal) ; silent : sans ligne
  // de journal (l'appelant en écrit une plus précise)
  function revokeGrant(grantId, { reason, user = null, by = null, silent = false } = {}) {
    const time = iso();
    const grant = q.grant.get(grantId);
    if (!grant) return false;
    const changed = q.revokeGrant.run(time, grantId).changes > 0;
    q.revokeGrantTokens.run(time, grantId);
    if (changed && !silent) {
      const owner = user ?? q.user.get(grant.user_id);
      audit('claude.revocation', { utilisateur: owner?.username ?? null, client: grant.client_host, portees: grant.scope, raison: reason, par: by });
    }
    return changed;
  }

  // Toutes les connexions d'un compte (mot de passe changé, compte désactivé…)
  function revokeAllForUser(userId, reason) {
    let count = 0;
    for (const grantId of q.userGrants.all(userId)) if (revokeGrant(grantId, { reason })) count += 1;
    return count;
  }

  // Révocation demandée par l'application (RFC 7009) : le jeton présenté
  // fait tomber sa connexion. Jeton inconnu ou d'une autre application :
  // rien ne se passe (la réponse est la même).
  function revokeToken(token, clientId) {
    if (typeof token !== 'string' || !token) return;
    const row = q.token.get(hashToken(token));
    if (!row) return;
    const grant = q.grant.get(row.grant_id);
    if (!grant || (clientId !== undefined && grant.client_id !== clientId)) return;
    revokeGrant(grant.id, { reason: 'demandée par l\'application' });
  }

  // Vérifie un jeton d'accès (pour /mcp, étape B). Renvoie { user, grant }
  // ou null : inconnu, expiré, révoqué, autre ressource, compte inactif.
  function verifyAccess(token) {
    if (typeof token !== 'string' || !token) return null;
    const row = q.token.get(hashToken(token));
    if (!row || row.kind !== 'access' || row.revoked_at || row.resource !== resource) return null;
    if (Date.parse(row.expires_at) <= ctx.now()) return null;
    const live = liveGrant(row.grant_id);
    if (!live) return null;
    const { grant, user } = live;
    return {
      user,
      grant: { id: grant.id, scope: grant.scope.split(' '), allLists: grant.all_lists === 1, listIds: grant.all_lists ? null : q.grantLists.all(grant.id) },
    };
  }

  // --- Ménage (tâche périodique) ---
  function purge() {
    const time = ctx.now();
    const now = iso(time);
    for (const [key, entry] of recentRefresh) if (entry.expiresAt <= time) recentRefresh.delete(key);
    for (const [ip, entry] of dcrByIp) if (time - entry.start >= HOUR) dcrByIp.delete(ip);
    db.transaction(() => {
      db.prepare('DELETE FROM oauth_requests WHERE expires_at <= ?').run(now);
      db.prepare('DELETE FROM oauth_codes WHERE expires_at <= ?').run(iso(time - HOUR));
      db.prepare('DELETE FROM oauth_tokens WHERE expires_at <= ?').run(iso(time - DAY));
      // Connexion inutilisée depuis 30 jours : ses jetons sont expirés, elle se libère
      const idle = db.prepare('SELECT id FROM oauth_grants WHERE revoked_at IS NULL AND COALESCE(last_used_at, created_at) <= ?').pluck().all(iso(time - REFRESH_TTL));
      for (const grantId of idle) revokeGrant(grantId, { reason: 'inutilisée depuis 30 jours', silent: true });
      db.prepare('DELETE FROM oauth_grants WHERE revoked_at IS NOT NULL AND revoked_at <= ?').run(iso(time - REFRESH_TTL));
      // Applications sans connexion : DCR jamais utilisée après 24 h, ou toute
      // application inutilisée depuis 30 jours (un document CIMD sera relu)
      db.prepare(`DELETE FROM oauth_clients
        WHERE NOT EXISTS (SELECT 1 FROM oauth_grants WHERE oauth_grants.client_id = oauth_clients.client_id)
          AND NOT EXISTS (SELECT 1 FROM oauth_requests WHERE oauth_requests.client_id = oauth_clients.client_id)
          AND ((kind = 'dcr' AND last_used_at IS NULL AND created_at <= @day)
            OR COALESCE(last_used_at, fetched_at, created_at) <= @month)`).run({ day: iso(time - DAY), month: iso(time - REFRESH_TTL) });
    })();
  }

  return {
    issuer, resource,
    resolveClient, register, clientRedirect, createRequest, findRequest, describeRequest,
    approve, refuse, exchangeCode, refresh, revokeGrant, revokeAllForUser, revokeToken, verifyAccess, purge,
  };
}
