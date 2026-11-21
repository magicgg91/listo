// Applications autorisées à demander l'accès à Listo pour un assistant IA
// (docs/mcp-cadrage.md, §4). Tout assistant IA qui suit le standard MCP
// (Claude, par exemple) peut demander l'accès, toujours après l'accord de la
// personne sur l'écran « Autoriser un assistant IA » (décision du
// 21 novembre 2026). Deux façons de se faire connaître :
// - CIMD : l'application donne comme identifiant l'adresse https d'un petit
//   document JSON qui la décrit (Claude Code :
//   https://claude.ai/oauth/claude-code-client-metadata). Listo ne lit ce
//   document que sur une liste courte de sites (claude.ai et claude.com, ou
//   ceux de LISTO_MCP_SITES), jamais sur un site quelconque (sinon Listo
//   pourrait être poussé à appeler n'importe quelle adresse), en https, sans
//   suivre de redirection, 16 ko et 5 secondes au plus, une fois par heure ;
// - DCR (enregistrement automatique, RFC 7591), pour toutes les autres.
//
// Adresses de retour acceptées (sites : LISTO_MCP_SITES découpée, ou null
// si la variable est absente) :
// - sans LISTO_MCP_SITES : toute adresse https sur un nom de site (jamais
//   une adresse IP), sans identifiant ni fragment ;
// - avec LISTO_MCP_SITES : une adresse https sur un de ces sites exactement
//   (pas de sous-domaine implicite) ;
// - dans les deux cas, le « bouclage » de l'ordinateur (http://localhost/…
//   et http://127.0.0.1/…, applications comme Claude Code), dont le port
//   change à chaque fois et n'est donc pas comparé.
// La règle est appliquée à l'enregistrement ET à chaque autorisation : une
// liste resserrée vaut aussi pour les applications déjà enregistrées.

import { readJson } from './http-json.js';
import { validSite } from './config.js';

// Adresse de retour de claude.ai, de l'application mobile et de Claude Desktop
export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
// Sites dont Listo accepte de lire un document d'identification (CIMD) sans
// LISTO_MCP_SITES ; ce sont aussi les sites « connus » vers lesquels une
// erreur peut être renvoyée sans écran (voir trustedRedirect)
export const CIMD_HOSTS = ['claude.ai', 'claude.com'];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];
const CIMD_TIMEOUT_MS = 5000;
const CIMD_MAX_BYTES = 16 * 1024;
const MAX_NAME = 80;
const MAX_REDIRECTS = 5;

// Sites de LISTO_MCP_SITES d'une configuration, ou null si la variable est
// absente (tout assistant IA accepté)
export const sitesOf = (config) => (config?.mcpSites?.length ? config.mcpSites : null);

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

// Adresse https sur un nom de site (jamais une adresse IP ni « localhost »),
// sans identifiant ni fragment ; avec sites, sur l'un d'eux exactement
function siteAddress(url, sites) {
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  if (!validSite(url.hostname)) return false;
  return sites ? sites.includes(url.hostname) : true;
}

// Une adresse de retour peut-elle être enregistrée (et utilisée) ?
export function allowedRedirect(value, sites = null) {
  const url = parse(value);
  return Boolean(url) && (loopback(url) || siteAddress(url, sites));
}

// L'adresse de retour demandée correspond-elle à une adresse enregistrée ?
// Comparaison exacte, sauf le port pour le bouclage (RFC 8252, §7.3). La
// règle du moment (sites) est vérifiée à chaque fois.
export function redirectMatches(requested, registered, sites = null) {
  if (requested === registered) return allowedRedirect(requested, sites);
  const a = parse(requested);
  const b = parse(registered);
  if (!a || !b || !loopback(a) || !loopback(b)) return false;
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
}

// Une erreur peut-elle être renvoyée sans écran vers cette adresse de
// retour (déjà acceptée) ? Seulement vers l'ordinateur ou un site connu
// (CIMD_HOSTS, ou ceux de LISTO_MCP_SITES) : sinon, n'importe qui pourrait
// enregistrer son site et se servir de Listo comme relais de redirection
// (RFC 9700, §4.11). Les autres voient la page « Demande d'autorisation
// invalide ».
export function trustedRedirect(value, sites = null) {
  const url = parse(value);
  if (!url) return false;
  return loopback(url) || (url.protocol === 'https:' && (sites ?? CIMD_HOSTS).includes(url.hostname));
}

// Hôte d'une adresse de retour, à afficher (« claude.ai », « localhost »),
// avec son port s'il n'est pas celui par défaut (sauf le bouclage, dont le
// port change à chaque fois)
export function redirectHost(value) {
  const url = parse(value);
  if (!url) return '';
  return loopback(url) ? url.hostname : url.host;
}

export function isLoopbackRedirect(value) {
  const url = parse(value);
  return Boolean(url) && loopback(url);
}

// Une connexion déjà accordée passe-t-elle encore la règle du moment ?
// Sans LISTO_MCP_SITES : oui. Avec : le site de l'application (client_host,
// celui du document CIMD ou de l'adresse de retour) et celui de la réponse
// (redirect_host) doivent être l'ordinateur ou un site de la liste.
export function grantSiteAllowed(grant, sites = null) {
  if (!sites) return true;
  const ok = (host) => LOOPBACK_HOSTS.includes(host) || sites.includes(String(host).replace(/:\d+$/, ''));
  return ok(grant.client_host) && ok(grant.redirect_host);
}

// Le client_id est-il l'adresse d'un document CIMD que Listo accepte de lire ?
// https, site de la liste courte (CIMD_HOSTS, ou ceux de LISTO_MCP_SITES),
// port par défaut, un chemin, ni identifiant, ni paramètres, ni fragment.
// Aucun appel réseau ici.
export function cimdUrl(clientId, sites = null) {
  const url = parse(clientId);
  if (!url || url.protocol !== 'https:' || !(sites ?? CIMD_HOSTS).includes(url.hostname)) return null;
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
// lance une erreur. Seules les adresses de retour acceptées sont gardées.
export function checkCimdDocument(clientId, doc, sites = null) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('invalid document');
  if (doc.client_id !== clientId) throw new Error('client_id differs from the document address');
  if (!Array.isArray(doc.redirect_uris)) throw new Error('missing redirect_uris');
  const method = doc.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') throw new Error('unsupported authentication method');
  const redirectUris = doc.redirect_uris.filter((uri) => allowedRedirect(uri, sites)).slice(0, MAX_REDIRECTS);
  if (!redirectUris.length) throw new Error('no accepted redirect address');
  return { clientName: cleanClientName(doc.client_name), redirectUris };
}

// Lit un document CIMD (adresse déjà vérifiée par cimdUrl). Jamais de
// redirection suivie, aucun cookie, 5 secondes et 16 ko au plus.
export async function fetchClientMetadata(url, { fetchImpl = fetch, timeoutMs = CIMD_TIMEOUT_MS, maxBytes = CIMD_MAX_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const res = await fetchImpl(url.href, {
      redirect: 'manual',
      credentials: 'omit',
      signal: controller.signal,
      headers: { 'User-Agent': 'Listo', Accept: 'application/json' },
    });
    if (res.status !== 200) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`HTTP response ${res.status}`);
    }
    if (res.url && new URL(res.url).href !== url.href) throw new Error('response from another address');
    // Message du journal en anglais (readJson parle français pour la console)
    return await readJson(res, maxBytes).catch((error) => {
      throw error.message === 'réponse trop grande' ? new Error('response too large') : error;
    });
  } finally {
    clearTimeout(timer);
  }
}

// Vérifie une demande d'enregistrement automatique (DCR, RFC 7591).
// Renvoie { clientName, redirectUris } ou { error, description }.
export function checkRegistration(body, sites = null) {
  const fail = (error, description) => ({ error, description });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_client_metadata', 'Corps JSON attendu.');
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECTS) {
    return fail('invalid_redirect_uri', `redirect_uris : 1 à ${MAX_REDIRECTS} adresses.`);
  }
  if (!uris.every((uri) => typeof uri === 'string' && allowedRedirect(uri, sites))) {
    // (la liste des sites acceptés n'est jamais donnée : réglage du serveur)
    return fail('invalid_redirect_uri', sites
      ? 'Adresse de retour refusée : ce serveur n\'accepte que certains sites, et http://localhost.'
      : 'Adresse de retour refusée : https sur un nom de site (sans adresse IP, identifiant ni fragment), ou http://localhost, seulement.');
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
