// Connexion avec un fournisseur d'identité OpenID Connect (Authelia, Authentik,
// Pocket ID… : tout fournisseur qui respecte le standard),
// facultative : LISTO_OIDC=on (décisions du 15 novembre 2026, voir le cahier
// des charges, « Connexion avec Authelia »). Désactivée (par défaut), ses
// adresses (/oidc/…) répondent comme une adresse inexistante (404) et
// l'écran de connexion ne montre aucun bouton.
//
// Déroulement (« code d'autorisation » avec PKCE, la méthode recommandée) :
// 1. GET /oidc/connexion : Listo prépare trois valeurs aléatoires (state,
//    nonce, code_verifier), garde les deux dernières en mémoire 10 minutes,
//    pose state dans un cookie de ce navigateur, puis envoie le navigateur
//    sur la page de connexion du fournisseur d'identité.
// 2. Le fournisseur d'identité renvoie le navigateur sur GET /oidc/retour?code=…&state=….
//    Listo vérifie que state est bien celui de CE navigateur (cookie), et
//    qu'il n'a jamais servi ; il échange le code contre des jetons, de
//    serveur à serveur, avec sa clé secrète (fichier dans secrets/) et le
//    code_verifier ; il vérifie le jeton d'identité (signature avec les clés
//    publiées par le fournisseur d'identité, émetteur, destinataire, expiration, nonce), puis
//    lit l'identifiant et le nom (userinfo).
// 3. Le compte Listo qui a le MÊME identifiant (sans tenir compte des
//    majuscules) s'ouvre. À la première connexion, Listo retient
//    l'identifiant interne du compte chez le fournisseur d'identité (« sub ») : plus tard, seul ce
//    compte chez le fournisseur d'identité ouvre ce compte Listo (un compte recréé chez le fournisseur d'identité avec
//    le même nom est refusé). Personne de ce nom : une demande de compte
//    est faite à l'Admin (account_requests), qui l'accepte ou la refuse.
// 4. Double authentification : le fournisseur d'identité s'en charge. Seule exception : un
//    compte Listo qui a activé la sienne, quand le fournisseur d'identité ne l'a pas faite
//    (« amr » sans « mfa ») : Listo demande alors son code à 6 chiffres.
//
// Sécurité : l'adresse du fournisseur d'identité vient de la configuration seulement ;
// toutes ses adresses doivent être sur le même site que lui (pas de
// redirection suivie, réponses de taille limitée, délai limité). Aucun
// jeton du fournisseur d'identité n'est gardé : seule la session Listo habituelle est
// créée. Les messages d'erreur ne recopient jamais ce qu'envoie le fournisseur d'identité.

import crypto from 'node:crypto';
import express from 'express';
import { readJson } from './http-json.js';
import { startSession, parseCookies, hashToken, safeEqual, loadSession } from './auth.js';
import { REQUEST_ID } from './oauth.js';
import { hashPassword } from './passwords.js';
import { cleanName } from './validate.js';

const FLOW_MS = 10 * 60 * 1000;          // 10 minutes pour se connecter chez le fournisseur d'identité
const MAX_FLOWS = 200;                   // connexions en cours au plus (mémoire bornée)
const METADATA_MS = 60 * 60 * 1000;      // description du fournisseur d'identité et clés gardées 1 heure
const HTTP_TIMEOUT_MS = 10 * 1000;
const MAX_BYTES = 100 * 1024;
const CLOCK_SKEW_S = 120;                // tolérance d'horloge entre les deux serveurs
export const MAX_PENDING_REQUESTS = 20;  // demandes de compte en attente au plus
export const REFUSED_DAYS = 30;          // une demande refusée est oubliée après 30 jours
const DAY_MS = 24 * 60 * 60 * 1000;

// Messages de l'écran de connexion (public/js/screens/login.js) : seul ce
// mot-clé passe dans l'adresse, jamais un texte venu du fournisseur d'identité
export const OIDC_OUTCOMES = ['annulee', 'erreur', 'expiree', 'indisponible', 'refuse', 'demande', 'attente', 'refusee', 'complet', 'code', 'confirme', 'non-confirme'];
const CONFIRM_MS = 5 * 60 * 1000;      // reconfirmation pour Claude : valable 5 minutes, une fois

// --- Appels vers le fournisseur d'identité (les tests les remplacent : aucun vrai réseau) ---

// Renvoie { status, json } ; jamais de redirection suivie
export async function fetchOidc(url, { method = 'GET', headers = {}, body = null, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('délai dépassé')), HTTP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method,
      body,
      redirect: 'manual',
      credentials: 'omit',
      signal: controller.signal,
      headers: { 'User-Agent': 'Listo', Accept: 'application/json', ...headers },
    });
    const json = res.status >= 200 && res.status < 500 ? await readJson(res, MAX_BYTES).catch(() => null) : null;
    if (json === null) await res.body?.cancel().catch(() => {});
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

// --- Petits outils ---

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256url = (text) => crypto.createHash('sha256').update(text).digest('base64url');
const withoutSlash = (url) => String(url).replace(/\/+$/, '');

// Adresse publiée par le fournisseur d'identité : https (http seulement hors production),
// sur le même site (origine) que l'émetteur configuré
function sameOriginUrl(value, issuer) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.origin === new URL(issuer).origin && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Algorithmes de signature acceptés (jamais « none » ni les HS*, qui
// reposent sur un secret partagé)
const ALGORITHMS = {
  RS256: (key) => ({ key }),
  PS256: (key) => ({ key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }),
  ES256: (key) => ({ key, dsaEncoding: 'ieee-p1363' }),
};

// Vérifie un jeton d'identité (JWT signé). Renvoie ses informations
// (claims), ou lance une erreur. keys : clés publiques du fournisseur d'identité (JWKS).
export function verifyIdToken(token, { keys, issuer, clientId, nonce, nowS }) {
  if (typeof token !== 'string' || token.length > 16384) throw new Error('jeton absent ou trop long');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jeton mal formé');
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  const options = ALGORITHMS[header?.alg];
  if (!options) throw new Error('algorithme de signature refusé');
  const candidates = keys.filter((jwk) => (!header.kid || jwk.kid === header.kid) && (!jwk.use || jwk.use === 'sig') && (!jwk.alg || jwk.alg === header.alg));
  if (!candidates.length) throw new Error('clé de signature inconnue');
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], 'base64url');
  const valid = candidates.some((jwk) => {
    try {
      const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      return crypto.verify('sha256', data, options(key), signature);
    } catch {
      return false;
    }
  });
  if (!valid) throw new Error('signature invalide');
  if (!claims || typeof claims !== 'object') throw new Error('contenu illisible');
  if (withoutSlash(claims.iss) !== withoutSlash(issuer)) throw new Error('émetteur inattendu');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) throw new Error('destinataire inattendu');
  if (audience.length > 1 && claims.azp !== clientId) throw new Error('destinataire inattendu');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < nowS) throw new Error('jeton expiré');
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S > nowS) throw new Error('jeton daté du futur');
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, nonce)) throw new Error('nonce inattendu');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new Error('sujet invalide');
  return claims;
}

// La double authentification a-t-elle été faite chez le fournisseur d'identité ?
export const didMfa = (claims) => Array.isArray(claims.amr) && claims.amr.includes('mfa');

// Identifiant Listo proposé à partir de celui du fournisseur d'identité : minuscules, et
// seulement les caractères permis par Listo (l'Admin peut le changer en
// acceptant une demande)
export function usernameFrom(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return text.replace(/[^a-z0-9._-]/g, '').slice(0, 50);
}

// --- Service ---

export function createOidc(ctx, { request = fetchOidc, clientSecret = '' } = {}) {
  const { db, config, audit } = ctx;
  const issuer = withoutSlash(config.oidcIssuer);
  const redirectUri = `${withoutSlash(config.publicUrl)}/oidc/retour`;
  const cookieName = `${config.production ? '__Host-' : ''}listo_oidc`;
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };
  const flows = new Map(); // empreinte de state -> { nonce, verifier, expiresAt, startedAt, confirm, returnTo }
  // Reconfirmations par le fournisseur d'identité pour autoriser Claude : « demande:compte » -> fin de validité
  const confirmations = new Map();
  let metadata = null;     // { value, expiresAt }
  let jwks = null;         // { keys, expiresAt }

  const nowMs = () => ctx.now();

  // Description du fournisseur d'identité (/.well-known/openid-configuration), vérifiée
  async function discover() {
    if (metadata && metadata.expiresAt > nowMs()) return metadata.value;
    const { status, json } = await request(`${issuer}/.well-known/openid-configuration`);
    if (status !== 200 || !json || typeof json !== 'object') throw new Error(`description du fournisseur d'identité illisible (HTTP ${status})`);
    if (withoutSlash(json.issuer) !== issuer) throw new Error('émetteur différent de LISTO_OIDC_ISSUER');
    const value = {};
    for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint']) {
      const url = sameOriginUrl(json[key], issuer);
      if (!url) throw new Error(`${key} absent ou hors du site du fournisseur d'identité`);
      value[key] = url.href;
    }
    metadata = { value, expiresAt: nowMs() + METADATA_MS };
    return value;
  }

  // Clés publiques du fournisseur d'identité (relues si une clé inconnue apparaît, une
  // fois par minute au plus)
  let lastKeyRefresh = 0;
  async function signingKeys(meta, { refresh = false } = {}) {
    if (jwks && jwks.expiresAt > nowMs() && !refresh) return jwks.keys;
    if (refresh && nowMs() - lastKeyRefresh < 60 * 1000 && jwks) return jwks.keys;
    lastKeyRefresh = nowMs();
    const { status, json } = await request(meta.jwks_uri);
    if (status !== 200 || !Array.isArray(json?.keys)) throw new Error(`clés du fournisseur d'identité illisibles (HTTP ${status})`);
    jwks = { keys: json.keys.filter((key) => key && typeof key === 'object').slice(0, 20), expiresAt: nowMs() + METADATA_MS };
    return jwks.keys;
  }

  function pruneFlows() {
    for (const [key, flow] of flows) if (flow.expiresAt <= nowMs()) flows.delete(key);
  }

  // Fin du parcours : retour à l'application, avec un mot-clé pour l'écran
  // de connexion (jamais de texte venu du fournisseur d'identité)
  // returnTo : écran « Autoriser Claude » (#/autoriser/<demande>) à retrouver
  // après la connexion, seule adresse de retour possible
  const finish = (res, outcome, returnTo = null) => res.redirect(303, outcome ? `/#/connexion?authelia=${outcome}` : `/#/${returnTo ?? 'listes'}`);
  const confirmKey = (requestId, userId) => `${requestId}:${userId}`;
  const pruneConfirmations = () => {
    for (const [key, expiresAt] of confirmations) if (expiresAt <= nowMs()) confirmations.delete(key);
  };

  // Échange du code contre les jetons, puis vérifications. Renvoie
  // { sub, username, name, mfa }.
  async function identify(meta, code, flow) {
    const credentials = Buffer.from(`${encodeURIComponent(config.oidcClientId)}:${encodeURIComponent(clientSecret)}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: flow.verifier }).toString();
    const tokens = await request(meta.token_endpoint, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (tokens.status !== 200 || typeof tokens.json?.id_token !== 'string' || typeof tokens.json?.access_token !== 'string') {
      throw new Error(`échange du code refusé (HTTP ${tokens.status})`);
    }
    if (String(tokens.json.token_type ?? 'Bearer').toLowerCase() !== 'bearer') throw new Error('type de jeton inattendu');
    const check = (keys) => verifyIdToken(tokens.json.id_token, { keys, issuer, clientId: config.oidcClientId, nonce: flow.nonce, nowS: Math.floor(nowMs() / 1000) });
    let claims;
    try {
      claims = check(await signingKeys(meta));
    } catch (err) {
      if (err.message !== 'clé de signature inconnue') throw err;
      claims = check(await signingKeys(meta, { refresh: true })); // Le fournisseur d'identité a changé de clé
    }
    const info = await request(meta.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.json.access_token}` } });
    if (info.status !== 200 || !info.json || typeof info.json !== 'object') throw new Error(`userinfo illisible (HTTP ${info.status})`);
    if (info.json.sub !== claims.sub) throw new Error('userinfo d\'un autre compte');
    const username = info.json.preferred_username ?? claims.preferred_username;
    const name = info.json.name ?? claims.name;
    return { sub: claims.sub, username: typeof username === 'string' ? username : '', name: typeof name === 'string' ? name : '', mfa: didMfa(claims), authTime: typeof claims.auth_time === 'number' ? claims.auth_time : null };
  }

  const q = {
    bySub: db.prepare('SELECT * FROM users WHERE oidc_sub = ?'),
    byName: db.prepare('SELECT * FROM users WHERE username = ?'),
    bind: db.prepare('UPDATE users SET oidc_sub = ? WHERE id = ? AND oidc_sub IS NULL'),
    request: db.prepare('SELECT * FROM account_requests WHERE oidc_sub = ?'),
    pendingCount: db.prepare("SELECT COUNT(*) FROM account_requests WHERE status = 'pending'").pluck(),
    purge: db.prepare("DELETE FROM account_requests WHERE status = 'refused' AND refused_at < ?"),
    addRequest: db.prepare("INSERT INTO account_requests (oidc_sub, username, display_name, created_at) VALUES (?, ?, ?, ?)"),
  };

  // Personne inconnue de Listo : demande de compte à l'Admin
  function accountRequest(identity, ip) {
    q.purge.run(new Date(nowMs() - REFUSED_DAYS * DAY_MS).toISOString());
    const existing = q.request.get(identity.sub);
    if (existing?.status === 'pending') return 'attente';
    if (existing?.status === 'refused') return 'refusee';
    if (q.pendingCount.get() >= MAX_PENDING_REQUESTS) {
      audit('demande_compte_refusee', { raison: 'trop de demandes en attente', ip });
      return 'complet';
    }
    const username = usernameFrom(identity.username) || 'compte';
    const name = cleanName(identity.name) || username;
    q.addRequest.run(identity.sub, username, name, new Date(nowMs()).toISOString());
    audit('demande_compte', { identifiant: username, ip });
    return 'demande';
  }

  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // 1. Départ vers le fournisseur d'identité
  // Échecs de vérification (state, jeton…) comptés par adresse IP : au-delà
  // de 5 en 15 minutes, la connexion avec le fournisseur d'identité est bloquée 15 minutes
  // pour cette adresse (une annulation chez le fournisseur d'identité ne compte pas)
  const failKeys = (req) => [`oidc:${req.ip}`];
  const failed = (req) => ctx.limiter.fail(failKeys(req));

  // Paramètres du départ (facultatifs) :
  // - retour=autoriser/<demande> : revenir sur l'écran « Autoriser Claude »
  //   après la connexion (seule adresse de retour acceptée) ;
  // - confirmer=<demande> : reconfirmation pour autoriser Claude, depuis une
  //   session ouverte avec le fournisseur d'identité ; le fournisseur d'identité redemande la connexion
  //   (prompt=login, max_age=0), puis l'écran d'autorisation reprend.
  router.get('/oidc/connexion', loadSession(ctx), async (req, res) => {
    const returnMatch = typeof req.query.retour === 'string' ? /^autoriser\/([A-Za-z0-9_-]+)$/.exec(req.query.retour) : null;
    const returnTo = returnMatch && REQUEST_ID.test(returnMatch[1]) ? `autoriser/${returnMatch[1]}` : null;
    let confirm = null;
    if (req.query.confirmer !== undefined) {
      const requestId = typeof req.query.confirmer === 'string' && REQUEST_ID.test(req.query.confirmer) ? req.query.confirmer : null;
      if (!requestId || !req.user || req.sessionMethod !== 'oidc' || !req.user.oidc_sub) return finish(res, 'erreur');
      confirm = { requestId, userId: req.user.id };
    }
    if (ctx.limiter.isBlocked(failKeys(req))) {
      audit('connexion_authelia_bloquee', { ip: req.ip });
      return finish(res, 'erreur');
    }
    pruneFlows();
    if (flows.size >= MAX_FLOWS) {
      audit('connexion_authelia_refusee', { raison: 'trop de connexions en cours', ip: req.ip });
      return finish(res, 'erreur');
    }
    let meta;
    try {
      meta = await discover();
    } catch (err) {
      audit('connexion_authelia_impossible', { raison: err.message, ip: req.ip });
      return finish(res, 'indisponible');
    }
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(48);
    flows.set(hashToken(state), { nonce, verifier, expiresAt: nowMs() + FLOW_MS, startedAt: nowMs(), confirm, returnTo: confirm ? `autoriser/${confirm.requestId}` : returnTo });
    res.cookie(cookieName, state, { ...cookieOptions, maxAge: FLOW_MS });
    const url = new URL(meta.authorization_endpoint);
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: config.oidcClientId,
      redirect_uri: redirectUri,
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: sha256url(verifier),
      code_challenge_method: 'S256',
      // Reconfirmation : le fournisseur d'identité doit redemander la connexion
      ...(confirm ? { prompt: 'login', max_age: '0' } : {}),
    })) url.searchParams.set(key, value);
    res.redirect(303, url.href);
  });

  // 2. Retour du fournisseur d'identité
  router.get('/oidc/retour', async (req, res) => {
    const fromCookie = parseCookies(req.headers.cookie)[cookieName];
    res.clearCookie(cookieName, cookieOptions);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    // state : celui de CE navigateur, et jamais déjà utilisé
    if (!fromCookie || !state || state.length > 200 || !safeEqual(fromCookie, state)) {
      failed(req);
      audit('connexion_authelia_refusee', { raison: 'state absent ou différent', ip: req.ip });
      return finish(res, 'erreur');
    }
    const key = hashToken(state);
    const flow = flows.get(key);
    flows.delete(key);
    if (!flow || flow.expiresAt <= nowMs()) return finish(res, 'expiree');
    if (typeof req.query.error === 'string') {
      audit('connexion_authelia_refusee', { raison: 'refus ou annulation chez le fournisseur d\'identité', ip: req.ip });
      return finish(res, req.query.error === 'access_denied' ? 'annulee' : 'erreur');
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code || code.length > 2048) return finish(res, 'erreur');

    let identity;
    try {
      identity = await identify(await discover(), code, flow);
    } catch (err) {
      failed(req);
      audit('connexion_authelia_refusee', { raison: err.message, ip: req.ip });
      return finish(res, 'erreur');
    }

    // Reconfirmation pour autoriser Claude : le même compte chez le fournisseur d'identité que la
    // session, et une connexion faite à l'instant chez le fournisseur d'identité (auth_time
    // après le départ) ; valable 5 minutes, pour cette demande seulement
    if (flow.confirm) {
      const owner = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(flow.confirm.userId);
      const fresh = identity.authTime !== null && identity.authTime * 1000 >= flow.startedAt - CLOCK_SKEW_S * 1000;
      if (!owner || owner.oidc_sub !== identity.sub || !fresh) {
        failed(req);
        audit('confirmation_authelia_refusee', { utilisateur: owner?.username ?? '(inconnu)', raison: !fresh ? 'connexion non redemandée par le fournisseur d\'identité' : 'autre compte', ip: req.ip });
        return res.redirect(303, `/#/${flow.returnTo}?authelia=non-confirme`);
      }
      pruneConfirmations();
      confirmations.set(confirmKey(flow.confirm.requestId, owner.id), nowMs() + CONFIRM_MS);
      audit('confirmation_authelia', { utilisateur: owner.username, ip: req.ip, etape: 'autorisation claude' });
      return res.redirect(303, `/#/${flow.returnTo}?authelia=confirme`);
    }

    // Quel compte Listo ? D'abord celui qui est déjà relié à ce compte du
    // fournisseur d'identité ; sinon celui qui porte le même identifiant, s'il n'est
    // relié à aucun autre (il est alors relié à celui-ci)
    let user = q.bySub.get(identity.sub);
    if (!user) {
      // Même identifiant, majuscules ignorées ; un identifiant chez le fournisseur d'identité avec
      // des caractères que Listo n'accepte pas ne correspond à aucun compte
      const wanted = identity.username.trim().toLowerCase();
      const sameName = wanted && usernameFrom(wanted) === wanted ? q.byName.get(wanted) : null;
      if (sameName && sameName.oidc_sub && sameName.oidc_sub !== identity.sub) {
        audit('connexion_authelia_refusee', { utilisateur: sameName.username, raison: 'compte relié à un autre compte du fournisseur d\'identité', ip: req.ip });
        return finish(res, 'refuse');
      }
      if (sameName) {
        q.bind.run(identity.sub, sameName.id);
        user = q.bySub.get(identity.sub);
        if (user) audit('compte_relie_authelia', { utilisateur: user.username, ip: req.ip });
      }
    }
    if (!user) return finish(res, accountRequest(identity, req.ip));
    if (user.active !== 1) {
      audit('connexion_authelia_refusee', { utilisateur: user.username, raison: 'compte désactivé', ip: req.ip });
      return finish(res, 'refuse');
    }
    // Mot de passe provisoire donné par l'Admin, jamais changé : avec le
    // fournisseur d'identité, la personne n'en a pas besoin. Il est remplacé par un mot de
    // passe aléatoire que personne ne connaît (l'Admin, qui connaissait le
    // provisoire, ne peut plus s'en servir), sans écran « Nouveau mot de passe ».
    if (user.must_change_password === 1) {
      const hash = await hashPassword(randomToken());
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ? AND must_change_password = 1').run(hash, user.id);
      audit('mot_de_passe_provisoire_efface', { utilisateur: user.username, raison: 'connexion avec le fournisseur d\'identité', ip: req.ip });
    }
    // Compte avec double authentification Listo, que le fournisseur d'identité n'a pas faite :
    // le code à 6 chiffres est demandé (même écran que pour le mot de passe)
    if (user.totp_enabled === 1 && !identity.mfa) {
      ctx.pending.start(ctx, res, user.id, { method: 'oidc' });
      audit('connexion_code_2fa_demande', { utilisateur: user.username, ip: req.ip, methode: 'authelia' });
      return finish(res, 'code');
    }
    startSession(ctx, res, user.id, { method: 'oidc' });
    audit('connexion_reussie', { utilisateur: user.username, ip: req.ip, methode: 'authelia' });
    finish(res, null, flow.returnTo);
  });

  // Demande acceptée par l'Admin : création du compte, relié à ce compte du
  // fournisseur d'identité, avec un mot de passe aléatoire que personne ne connaît (la
  // connexion par mot de passe reste fermée tant que l'Admin n'en donne pas
  // un provisoire). Renvoie l'identifiant du compte, ou une erreur
  // { key, params, status } (texte traduit par la route avec req.t).
  async function acceptRequest(requestId, { username, displayName, role }) {
    const hash = await hashPassword(randomToken());
    return db.transaction(() => {
      const pending = db.prepare("SELECT * FROM account_requests WHERE id = ? AND status = 'pending'").get(requestId);
      if (!pending) return { key: 'comptes.demande.introuvable', status: 404 };
      if (q.byName.get(username)) return { key: 'comptes.identifiant.pris', status: 409 };
      if (q.bySub.get(pending.oidc_sub)) return { key: 'comptes.fournisseur.dejaRelie', params: { provider: config.oidcName }, status: 409 };
      const id = db.prepare('INSERT INTO users (username, display_name, password_hash, role, oidc_sub) VALUES (?, ?, ?, ?, ?)')
        .run(username, displayName, hash, role, pending.oidc_sub).lastInsertRowid;
      db.prepare('DELETE FROM account_requests WHERE id = ?').run(requestId);
      return { id };
    })();
  }

  // Reconfirmation encore valable pour cette demande et ce compte ?
  // consume : la reconfirmation sert une seule fois (accord donné)
  function confirmed(requestId, userId, { consume = false } = {}) {
    pruneConfirmations();
    const key = confirmKey(requestId, userId);
    const ok = confirmations.has(key);
    if (ok && consume) confirmations.delete(key);
    return ok;
  }

  return { router, acceptRequest, confirmed, flowCount: () => flows.size };
}
