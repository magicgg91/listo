// Couche réseau : le SEUL module qui parle au serveur.
//
// Tous les écrans passent par ici. Les modifications des listes et des
// articles passent d'abord par la file d'attente hors ligne (queue.js,
// actions.js), qui utilise ce module pour les envoyer.
//
// Erreurs renvoyées aux écrans :
// - NetworkError : le serveur n'a pas pu être joint (pas de réseau…) ;
// - ApiError : le serveur a répondu par un refus (message en français).

export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Impossible de joindre Listo. Vérifiez la connexion et réessayez.');
  }
}

// Fonctions appelées quand la session a expiré (401) ou quand le mot de
// passe doit d'abord être changé (403 + mustChangePassword). Réglées par app.js.
const handlers = { unauthorized: () => {}, mustChangePassword: () => {} };
export function onSessionProblem({ unauthorized, mustChangePassword }) {
  handlers.unauthorized = unauthorized;
  handlers.mustChangePassword = mustChangePassword;
}

// Requête vers l'API. Le navigateur ajoute lui-même le cookie de session et
// l'en-tête Origin (protection CSRF côté serveur).
// auth = false : une réponse 401 est une simple erreur (ex. mauvais mot de
// passe), pas une session expirée.
// raw : corps envoyé tel quel (une photo JPEG), au lieu de JSON.
export async function request(method, url, body, { auth = true, raw = null } = {}) {
  let response;
  let headers = {};
  let payload;
  if (raw) {
    headers = { 'Content-Type': 'image/jpeg' };
    payload = raw;
  } else if (body !== undefined) {
    headers = { 'Content-Type': 'application/json' };
    payload = JSON.stringify(body);
  }
  try {
    response = await fetch(url, { method, credentials: 'same-origin', headers, body: payload });
  } catch {
    throw new NetworkError();
  }

  let data = null;
  try {
    data = response.status === 204 ? null : await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (auth && response.status === 401) handlers.unauthorized();
    if (response.status === 403 && data?.mustChangePassword) handlers.mustChangePassword();
    throw new ApiError(response.status, data?.error ?? messageFor(response.status), data);
  }
  return data;
}

// Message par défaut quand le serveur n'en donne pas (sans détail technique)
function messageFor(status) {
  if (status === 413) return 'Photo trop lourde.';
  if (status === 429) return 'Trop de tentatives. Réessayez dans 15 minutes.';
  if (status >= 500) return 'Listo a rencontré un problème. Réessayez dans un instant.';
  return 'La demande a été refusée.';
}

export const get = (url, options) => request('GET', url, undefined, options);
export const post = (url, body = {}, options) => request('POST', url, body, options);
export const put = (url, body = {}) => request('PUT', url, body);
export const patch = (url, body = {}) => request('PATCH', url, body);
export const del = (url) => request('DELETE', url);

// Photo d'un article : envoi (JPEG déjà réduit), retrait, adresse de l'image.
// Ces envois ne passent pas par /api/ops (fichier trop gros pour un lot) ;
// hors ligne, ils attendent dans la file d'attente (queue.js).
export const putPhoto = (itemId, jpeg) => request('PUT', `/api/items/${encodeURIComponent(itemId)}/photo`, undefined, { raw: jpeg });
export const deletePhoto = (itemId) => request('DELETE', `/api/items/${encodeURIComponent(itemId)}/photo`);
// photoAt (date de la photo) dans l'adresse : une nouvelle photo a une
// nouvelle adresse, le navigateur ne montre donc jamais l'ancienne.
export const photoUrl = (item) => `/api/items/${encodeURIComponent(item.id)}/photo?v=${encodeURIComponent(item.photoAt)}`;

// Identifiant unique (UUID), créé sur le téléphone. crypto.randomUUID n'existe
// qu'en HTTPS : en test sur le réseau local (http://192.168…), on le fabrique
// avec crypto.getRandomValues, disponible partout.
export function uuid() {
  if (globalThis.crypto?.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      // contexte non sécurisé : solution de secours ci-dessous
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Texte d'erreur à montrer à l'utilisateur, quelle que soit l'erreur
export function errorMessage(error) {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return 'Une erreur inattendue est survenue. Réessayez.';
}
