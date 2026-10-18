// Mode scan des listes de courses : nom d'un produit à partir de son
// code-barres, cherché dans Open Food Facts (base libre de produits
// alimentaires, données sous licence ODbL : « Données : Open Food Facts »).
//
// Le téléphone lit le code-barres sur une photo (l'image ne quitte jamais
// le téléphone) et envoie seulement le numéro. C'est le serveur, jamais le
// téléphone, qui interroge Open Food Facts : l'adresse IP des téléphones ne
// part pas, et les réponses sont gardées en mémoire (cache).
//
// Garde-fous :
// - le code n'est accepté que s'il fait 8, 12 ou 13 chiffres avec une clé
//   de contrôle EAN valide ; un code UPC-A (12 chiffres) devient un EAN-13
//   (un 0 devant) : un même produit n'est jamais demandé sous deux formes ;
// - les codes « en 2 » (articles pesés ou étiquetés en magasin, qui
//   contiennent souvent un prix ou un poids) ne sont jamais demandés ;
// - adresse d'Open Food Facts fixe : seul le numéro validé (des chiffres) y
//   est ajouté ; délai de 5 secondes ; réponse de 32 ko au plus ; aucune
//   redirection suivie (un produit non alimentaire, rangé sur un autre site
//   de la même famille, est traité comme inconnu) ; aucun cookie ni jeton ;
// - 30 recherches par minute et par compte, 10 demandes par minute au total
//   vers Open Food Facts (leur limite est de 15 par minute et par adresse IP) ;
// - cache en mémoire : 500 produits au plus, 7 jours pour un produit trouvé,
//   1 jour pour un produit inconnu ; une panne n'est pas gardée ;
// - une panne (réseau, délai, réponse inattendue) donne « indisponible » :
//   jamais d'erreur bloquante, une ligne discrète dans les journaux, sans le
//   code ni le nom du produit ;
// - LISTO_PRODUCT_LOOKUP=off : aucune demande, jamais.

import fs from 'node:fs';
import { readJson } from './http-json.js';

export const OFF_ORIGIN = 'https://world.openfoodfacts.org';
// Champs demandés à Open Food Facts : ceux-là, et rien d'autre
export const OFF_FIELDS = 'code,product_name,product_name_fr,generic_name,brands,quantity';
const PROJECT_URL = 'https://github.com/magicgg91/listo';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
export const TIMEOUT_MS = 5000;
export const MAX_BYTES = 32 * 1024;
export const FOUND_MS = 7 * DAY;     // produit trouvé : gardé 7 jours
export const UNKNOWN_MS = DAY;       // produit inconnu : gardé 1 jour
export const CACHE_MAX = 500;        // produits gardés au plus
export const ACCOUNT_PER_MINUTE = 30;
export const OFF_PER_MINUTE = 10;

// Longueurs maximales de ce qui est proposé au téléphone
export const NAME_MAX = 60;
const BRAND_MAX = 40;
const QUANTITY_MAX = 30;

// --- Code-barres ---

// Clé de contrôle EAN (EAN-8 et EAN-13) : en partant de la droite (sans la
// clé), les chiffres comptent alternativement 3 fois et 1 fois ; la clé
// complète la somme à la dizaine supérieure.
export function hasValidCheckDigit(digits) {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i -= 1, weight = 4 - weight) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

// Code reçu du téléphone → code normalisé (8 ou 13 chiffres), ou null s'il
// est invalide. UPC-A (12 chiffres) : un 0 devant, c'est le même produit en
// EAN-13.
export function normalizeBarcode(value) {
  if (typeof value !== 'string' || !/^(\d{8}|\d{12}|\d{13})$/.test(value)) return null;
  const code = value.length === 12 ? `0${value}` : value;
  return hasValidCheckDigit(code) ? code : null;
}

// Codes « en 2 » : numéros propres à un magasin (EAN-13 commençant par 2,
// UPC-A commençant par 2, donc 02 une fois normalisé ; EAN-8 commençant par
// 2). Jamais demandés à Open Food Facts.
export function isStoreCode(code) {
  return code.length === 13 ? code.startsWith('2') || code.startsWith('02') : code.startsWith('2');
}

// --- Réponse d'Open Food Facts ---

// Texte reçu → texte propre : caractères de contrôle et invisibles (espaces
// de largeur nulle, marques de sens d'écriture, tiret conditionnel…) retirés,
// espaces regroupés. Jamais affiché autrement qu'en texte (textContent).
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC')
    .replace(/[\p{Cf}]/gu, '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Texte trop long → coupé entre deux mots (ou net si aucun espace ne tombe
// dans la seconde moitié), sans ponctuation qui traîne à la fin
export function shorten(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  const short = space >= max / 2 ? cut.slice(0, space) : text.slice(0, max);
  return short.replace(/[\s,;:·\-–—/(]+$/u, '').trim();
}

// Première valeur non vide parmi des champs de texte
const firstText = (...values) => values.map(cleanText).find(Boolean) ?? '';

// Analyse tolérante de la réponse (API v3 ; quelques formes plus anciennes
// acceptées aussi). Renvoie :
// - { found: true, name, brand, quantity } : produit trouvé, avec un nom ;
// - { found: false } : produit inconnu, ou sans aucun nom ;
// - null : réponse inattendue (ce n'est pas un objet JSON).
// Règle du nom : product_name_fr, sinon product_name, sinon generic_name.
export function productFrom(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const product = data.product && typeof data.product === 'object' && !Array.isArray(data.product) ? data.product : null;
  const notFound = data.status === 'failure' || data.status === 0 || data.result?.id === 'product_not_found';
  if (notFound || !product) return { found: false };
  const name = shorten(firstText(product.product_name_fr, product.product_name, product.generic_name), NAME_MAX);
  if (!name) return { found: false };
  // Marques : « Lactel, Lactalis » (texte) ou liste ; la première suffit
  const brands = Array.isArray(product.brands) ? product.brands.find((b) => typeof b === 'string') : product.brands;
  const brand = shorten(cleanText(typeof brands === 'string' ? brands.split(',')[0] : ''), BRAND_MAX);
  const quantity = shorten(cleanText(product.quantity), QUANTITY_MAX);
  return { found: true, name, brand, quantity };
}

// --- Demande à Open Food Facts ---

// Version de Listo (package.json), pour l'en-tête User-Agent : jamais le
// commit installé
function listoVersion() {
  try {
    const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return /^\d+\.\d+\.\d+$/.test(version) ? version : '0';
  } catch {
    return '0';
  }
}

// En-tête User-Agent demandé par Open Food Facts pour identifier
// l'application : « Listo/0.1.0 (+https://github.com/magicgg91/listo) »,
// avec le contact facultatif (LISTO_PRODUCT_CONTACT) après un point-virgule
export function userAgent(contact = null, version = listoVersion()) {
  return `Listo/${version} (+${PROJECT_URL}${contact ? `; ${contact}` : ''})`;
}

// Demande un produit à Open Food Facts. Renvoie le JSON reçu, ou
// { notFound: true } (404, ou redirection vers un autre site : produit non
// alimentaire). Toute autre réponse est une erreur.
// fetchImpl : la fonction fetch (les tests la remplacent : aucun vrai réseau)
export async function fetchProduct(code, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES, agent = userAgent() } = {}) {
  // Seul un code déjà validé (des chiffres) entre dans l'adresse
  if (!/^\d{8}$|^\d{13}$/.test(code)) throw new Error('code invalide');
  const url = new URL(`/api/v3/product/${code}`, OFF_ORIGIN);
  url.searchParams.set('fields', OFF_FIELDS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('délai dépassé')), timeoutMs);
  try {
    const res = await fetchImpl(url.href, {
      redirect: 'manual',      // jamais suivie
      credentials: 'omit',     // aucun cookie
      signal: controller.signal,
      headers: { 'User-Agent': agent, Accept: 'application/json' },
    });
    if (res.status === 404 || (res.status >= 300 && res.status < 400)) {
      await res.body?.cancel().catch(() => {});
      return { notFound: true };
    }
    if (res.status !== 200) throw new Error(`réponse HTTP ${res.status}`);
    if (res.url && new URL(res.url).origin !== OFF_ORIGIN) throw new Error('réponse venue d\'un autre site');
    return await readJson(res, maxBytes);
  } finally {
    clearTimeout(timer);
  }
}

// --- Limites de débit ---

// Fenêtre glissante d'une minute : take(clé) renvoie false au-delà de max
// passages dans la dernière minute pour cette clé
function createWindow({ max, now }) {
  const hits = new Map();
  const recent = (key) => (hits.get(key) ?? []).filter((time) => time > now() - MINUTE);
  return {
    take(key) {
      const times = recent(key);
      if (times.length >= max) {
        hits.set(key, times);
        return false;
      }
      times.push(now());
      hits.set(key, times);
      return true;
    },
    prune() {
      for (const key of hits.keys()) {
        const times = recent(key);
        if (times.length) hits.set(key, times);
        else hits.delete(key);
      }
    },
  };
}

// --- Service ---

// Options :
// - config : interrupteur (config.productLookup) et contact (config.productContact)
// - now : horloge
// - request : fonction qui demande un code à Open Food Facts (par défaut
//   fetchProduct ; les tests la remplacent)
// - log : ligne discrète en cas d'échec (jamais le code ni le nom)
export function createProductLookup({ config, now = Date.now, request = fetchProduct, log = (line) => console.warn(line) }) {
  const cache = new Map();     // code -> { result, until }
  const running = new Map();   // code -> demande en cours (partagée)
  const accounts = createWindow({ max: ACCOUNT_PER_MINUTE, now });
  const outgoing = createWindow({ max: OFF_PER_MINUTE, now });
  const agent = userAgent(config.productContact);

  const UNKNOWN = { status: 'unknown' };
  const UNAVAILABLE = { status: 'unavailable' };

  function remember(code, result) {
    cache.delete(code); // remis en dernier (le plus récent)
    cache.set(code, { result, until: now() + (result.status === 'found' ? FOUND_MS : UNKNOWN_MS) });
    // Au-delà de 500 produits, les plus anciens partent d'abord
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }

  async function ask(code) {
    // Limite globale vers Open Food Facts : au-delà, « indisponible »
    if (!outgoing.take('off')) return UNAVAILABLE;
    try {
      const data = await request(code, { agent });
      const product = data?.notFound ? { found: false } : productFrom(data);
      if (!product) throw new Error('réponse inattendue');
      // Réponse envoyée au téléphone : ces champs, et rien d'autre
      const result = product.found
        ? { status: 'found', name: product.name, brand: product.brand, quantity: product.quantity }
        : UNKNOWN;
      remember(code, result);
      return result;
    } catch (err) {
      log(`Recherche de produit impossible : ${err?.message ?? err}`);
      return UNAVAILABLE;
    }
  }

  return {
    enabled: () => config.productLookup !== false,

    // Limite par compte (30 recherches par minute) : false au-delà
    allow: (userId) => accounts.take(`u${userId}`),

    // code : déjà normalisé (normalizeBarcode). Ne lève jamais d'erreur.
    async lookup(code) {
      if (config.productLookup === false) return UNAVAILABLE;
      if (isStoreCode(code)) return UNKNOWN;
      const kept = cache.get(code);
      if (kept && kept.until > now()) return kept.result;
      if (kept) cache.delete(code);
      // Deux demandes simultanées du même code : une seule part
      if (!running.has(code)) running.set(code, ask(code).finally(() => running.delete(code)));
      return running.get(code);
    },

    // Ménage (app.js, toutes les heures) : produits périmés, compteurs vides
    prune() {
      for (const [code, kept] of cache) if (kept.until <= now()) cache.delete(code);
      accounts.prune();
      outgoing.prune();
    },

    cacheSize: () => cache.size,
  };
}
