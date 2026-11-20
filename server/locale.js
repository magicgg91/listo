// Langue des réponses du serveur (voir public/js/i18n.js).
//
// - Pour une requête : la langue choisie par le compte connecté, sinon
//   celles du navigateur (en-tête Accept-Language), sinon celle de
//   l'installation (LISTO_LANG).
// - Sans requête (notifications, rappels) : la langue du compte, sinon
//   celle de l'installation (le navigateur n'est pas connu à ce moment).
// Une langue pas encore complète est remplacée par le français
// (resolveLocale).

import { resolveLocale, parseAcceptLanguage, translate } from '../public/js/i18n.js';

export function requestLocale(req, config) {
  return resolveLocale([req.user?.locale, ...parseAcceptLanguage(req.headers?.['accept-language']), config?.lang]);
}

export function userLocale(user, config) {
  return resolveLocale([user?.locale, config?.lang]);
}

// Pose req.t(nom, valeurs) sur chaque requête : le texte dans la langue de
// la requête (requestLocale), calculée au moment de l'appel (le compte est
// connu une fois la session lue). Les réponses lues à l'écran (erreurs
// JSON) passent par req.t ; le journal, la console et Claude (MCP) restent
// hors de ce mécanisme.
export function localeMiddleware(config) {
  return (req, res, next) => {
    req.t = (key, params) => translate(requestLocale(req, config), key, params);
    next();
  };
}
