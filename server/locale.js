// Langue des réponses du serveur (voir public/js/i18n.js).
//
// - Pour une requête : la langue choisie par le compte connecté, sinon
//   celles du navigateur (en-tête Accept-Language), sinon celle de
//   l'installation (LISTO_LANG).
// - Sans requête (notifications, rappels) : la langue du compte, sinon
//   celle de l'installation (le navigateur n'est pas connu à ce moment).
// Une langue pas encore complète est remplacée par le français
// (resolveLocale).

import { resolveLocale, parseAcceptLanguage } from '../public/js/i18n.js';

export function requestLocale(req, config) {
  return resolveLocale([req.user?.locale, ...parseAcceptLanguage(req.headers?.['accept-language']), config?.lang]);
}

export function userLocale(user, config) {
  return resolveLocale([user?.locale, config?.lang]);
}
