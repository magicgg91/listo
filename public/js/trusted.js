// Trusted Types : protection supplémentaire contre l'injection de code
// (lot 4 des bonnes pratiques du web moderne, décision du 15 novembre 2026).
//
// Le serveur demande au navigateur (Content-Security-Policy :
// require-trusted-types-for 'script'; trusted-types listo) de refuser toute
// adresse de script et tout HTML venus d'un simple texte. Listo n'écrit
// jamais de HTML (textContent seulement) ; il ne charge que deux scripts à
// partir d'une adresse : le service worker (/sw.js) et le lecteur de
// codes-barres (/js/barcode-worker.js). Cette politique, la seule autorisée,
// laisse passer ces deux adresses de Listo et refuse tout le reste : un
// script injecté ne pourrait pas en lancer un autre.
//
// Navigateur sans Trusted Types (Safari avant la version 26…) : la règle de
// la CSP y est ignorée, l'adresse est donnée telle quelle.

const ALLOWED_SCRIPTS = new Set(['/sw.js', '/js/barcode-worker.js']);
let policy = null;

function checkScriptUrl(value) {
  const url = new URL(value, location.origin);
  if (url.origin !== location.origin || !ALLOWED_SCRIPTS.has(url.pathname)) {
    throw new TypeError(`Adresse de script refusée : ${url.pathname}`); // technique : erreur interne, jamais affichée
  }
  return url.href;
}

// Adresse de script acceptée par le navigateur (ou une erreur si elle n'est
// pas l'une des deux prévues)
export function scriptUrl(value) {
  const types = globalThis.trustedTypes;
  if (!types?.createPolicy) return checkScriptUrl(String(value));
  policy ??= types.createPolicy('listo', { createScriptURL: checkScriptUrl });
  return policy.createScriptURL(String(value));
}
