// Applications autorisées à demander l'accès à Listo pour Claude
// (docs/mcp-cadrage.md, §4). Deux façons de se faire connaître :
// - CIMD : l'application donne comme identifiant l'adresse https d'un petit
//   document JSON qui la décrit (Claude Code :
//   https://claude.ai/oauth/claude-code-client-metadata). Listo ne lit ce
//   document que sur claude.ai ou claude.com (liste blanche), en https, sans
//   suivre de redirection, 16 ko et 5 secondes au plus, une fois par heure ;
// - DCR (enregistrement automatique, RFC 7591), en secours.
//
// Dans les deux cas, les seules adresses de retour acceptées sont celles de
// Claude : https://claude.ai/api/mcp/auth_callback exactement, ou le
// « bouclage » de l'ordinateur (http://localhost/… et http://127.0.0.1/…),
// dont le port change à chaque fois et n'est donc pas comparé.

import { readJson } from './http-json.js';

// Adresse de retour de claude.ai, de l'application mobile et de Claude Desktop
export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
// Hôtes dont Listo accepte de lire un document d'identification (CIMD)
export const CIMD_HOSTS = ['claude.ai', 'claude.com'];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];
const CIMD_TIMEOUT_MS = 5000;
const CIMD_MAX_BYTES = 16 * 1024;
const MAX_NAME = 80;
const MAX_REDIRECTS = 5;

// Lit une adresse ; null si elle est mal formée
function parse(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Adresse de bouclage de l'ordinateur : http://localhost ou http://127.0.0.1,
// avec n'importe quel port, sans identifiant ni fragment
function loopback(url) {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname)
    && !url.username && !url.password && !url.hash;
}

// Une adresse de retour peut-elle être enregistrée ? Seulement celles de Claude.
export function allowedRedirect(value) {
  if (value === CLAUDE_CALLBACK) return true;
  const url = parse(value);
  return Boolean(url) && loopback(url);
}

// L'adresse de retour demandée correspond-elle à une adresse enregistrée ?
// Comparaison exacte, sauf le port pour le bouclage (RFC 8252, §7.3).
export function redirectMatches(requested, registered) {
  if (requested === registered) return allowedRedirect(requested);
  const a = parse(requested);
  const b = parse(registered);
  if (!a || !b || !loopback(a) || !loopback(b)) return false;
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
}

// Nom de l'hôte d'une adresse de retour, à afficher (« claude.ai », « localhost »)
export function redirectHost(value) {
  return parse(value)?.hostname ?? '';
}

export function isLoopbackRedirect(value) {
  const url = parse(value);
  return Boolean(url) && loopback(url);
}

// Le client_id est-il l'adresse d'un document CIMD que Listo accepte de lire ?
// https, hôte de la liste blanche, port par défaut, un chemin, ni
// identifiant, ni paramètres, ni fragment. Aucun appel réseau ici.
export function cimdUrl(clientId) {
  const url = parse(clientId);
  if (!url || url.protocol !== 'https:' || !CIMD_HOSTS.includes(url.hostname)) return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;
  if (url.pathname === '/' || url.href !== clientId) return null;
  return url;
}

// Nom d'application : texte simple, 80 caractères au plus (affiché avec textContent)
function cleanClientName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
}

// Vérifie un document CIMD déjà lu. Renvoie { clientName, redirectUris } ou
// lance une erreur. Seules les adresses de retour de Claude sont gardées.
export function checkCimdDocument(clientId, doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('document invalide');
  if (doc.client_id !== clientId) throw new Error('client_id différent de l\'adresse du document');
  if (!Array.isArray(doc.redirect_uris)) throw new Error('redirect_uris manquant');
  const method = doc.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') throw new Error('méthode d\'authentification non prise en charge');
  const redirectUris = doc.redirect_uris.filter((uri) => allowedRedirect(uri)).slice(0, MAX_REDIRECTS);
  if (!redirectUris.length) throw new Error('aucune adresse de retour de Claude');
  return { clientName: cleanClientName(doc.client_name), redirectUris };
}

// Lit un document CIMD (adresse déjà vérifiée par cimdUrl). Jamais de
// redirection suivie, aucun cookie, 5 secondes et 16 ko au plus.
export async function fetchClientMetadata(url, { fetchImpl = fetch, timeoutMs = CIMD_TIMEOUT_MS, maxBytes = CIMD_MAX_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('délai dépassé')), timeoutMs);
  try {
    const res = await fetchImpl(url.href, {
      redirect: 'manual',
      credentials: 'omit',
      signal: controller.signal,
      headers: { 'User-Agent': 'Listo', Accept: 'application/json' },
    });
    if (res.status !== 200) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`réponse HTTP ${res.status}`);
    }
    if (res.url && new URL(res.url).href !== url.href) throw new Error('réponse venue d\'une autre adresse');
    return await readJson(res, maxBytes);
  } finally {
    clearTimeout(timer);
  }
}

// Vérifie une demande d'enregistrement automatique (DCR, RFC 7591).
// Renvoie { clientName, redirectUris } ou { error, description }.
export function checkRegistration(body) {
  const fail = (error, description) => ({ error, description });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_client_metadata', 'Corps JSON attendu.');
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECTS) {
    return fail('invalid_redirect_uri', `redirect_uris : 1 à ${MAX_REDIRECTS} adresses.`);
  }
  if (!uris.every((uri) => typeof uri === 'string' && allowedRedirect(uri))) {
    return fail('invalid_redirect_uri', 'Seules les adresses de retour de Claude sont acceptées.');
  }
  const method = body.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') {
    return fail('invalid_client_metadata', 'token_endpoint_auth_method : seule la valeur « none » est acceptée.');
  }
  const grants = body.grant_types ?? ['authorization_code'];
  if (!Array.isArray(grants) || !grants.every((g) => g === 'authorization_code' || g === 'refresh_token')) {
    return fail('invalid_client_metadata', 'grant_types : authorization_code et refresh_token seulement.');
  }
  const responses = body.response_types ?? ['code'];
  if (!Array.isArray(responses) || !responses.every((r) => r === 'code')) {
    return fail('invalid_client_metadata', 'response_types : code seulement.');
  }
  return { clientName: cleanClientName(body.client_name), redirectUris: [...new Set(uris)] };
}
