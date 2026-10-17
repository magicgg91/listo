// Couche réseau : le SEUL module qui parle au serveur.
//
// Tous les écrans passent par ici. À l'étape 9, la file d'attente hors ligne
// se branchera dans ce fichier (fonction ops), sans toucher aux écrans.
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
export async function request(method, url, body, { auth = true } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
  if (status === 429) return 'Trop de tentatives. Réessayez dans 15 minutes.';
  if (status >= 500) return 'Listo a rencontré un problème. Réessayez dans un instant.';
  return 'La demande a été refusée.';
}

export const get = (url, options) => request('GET', url, undefined, options);
export const post = (url, body = {}, options) => request('POST', url, body, options);
export const put = (url, body = {}) => request('PUT', url, body);
export const patch = (url, body = {}) => request('PATCH', url, body);
export const del = (url) => request('DELETE', url);

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

// Envoie des opérations (créer, modifier, cocher, supprimer…) au serveur, par
// la route POST /api/ops. Chaque opération reçoit un identifiant unique.
// Renvoie le résultat de chaque opération ; lève ApiError si l'une est refusée.
//
// Étape 9 : c'est ici que les opérations seront d'abord rangées dans la file
// d'attente du téléphone, puis envoyées dès que le réseau le permet.
export async function ops(...operations) {
  const sent = operations.map((op) => ({ id: uuid(), ...op }));
  const { results } = await post('/api/ops', { ops: sent });
  const failed = results.find((result) => result.status !== 200);
  if (failed) throw new ApiError(failed.status, failed.error ?? 'La modification a été refusée.', failed);
  return results;
}

// Une seule opération : renvoie directement son résultat
export async function op(operation) {
  const [result] = await ops(operation);
  return result;
}

// Texte d'erreur à montrer à l'utilisateur, quelle que soit l'erreur
export function errorMessage(error) {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return 'Une erreur inattendue est survenue. Réessayez.';
}
