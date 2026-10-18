// Petit routeur : chaque écran a une adresse du type « #/listes/abc ».
// Le bouton Retour du téléphone revient à l'adresse précédente, donc à
// l'écran précédent.
//
// Les fonctions de lecture d'adresse sont « pures » (elles ne touchent pas à
// la page) : elles sont testées automatiquement.

// Les écrans et leur adresse. « :id » est une partie variable.
export const ROUTES = [
  { name: 'login', path: '/connexion' },
  { name: 'lists', path: '/listes' },
  { name: 'newList', path: '/listes/nouvelle' },
  { name: 'editList', path: '/listes/:id/modifier' },
  { name: 'list', path: '/listes/:id' },
  { name: 'settings', path: '/reglages' },
  { name: 'account', path: '/reglages/compte' },
  { name: 'password', path: '/reglages/mot-de-passe' },
  { name: 'twoFactor', path: '/reglages/double-authentification' },
  { name: 'admin', path: '/administration/:tab' },
];

// Écran affiché quand l'adresse est vide ou inconnue
export const DEFAULT_ROUTE = { name: 'lists', params: {} };

// Retrouve l'écran correspondant à une adresse (« #/listes/abc »).
// Renvoie { name, params } ; une adresse inconnue donne l'écran par défaut.
export function matchRoute(hash) {
  const path = String(hash ?? '').replace(/^#/, '').split('?')[0] || '/';
  const parts = path.split('/').filter(Boolean);
  for (const route of ROUTES) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params = {};
    const ok = pattern.every((segment, i) => {
      if (segment.startsWith(':')) {
        try {
          params[segment.slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          return false; // adresse mal encodée : ignorée
        }
        return true;
      }
      return segment === parts[i];
    });
    if (ok) return { name: route.name, params };
  }
  return { ...DEFAULT_ROUTE };
}

// Fabrique l'adresse d'un écran : pathFor('list', { id: 'abc' }) → « #/listes/abc »
export function pathFor(name, params = {}) {
  const route = ROUTES.find((r) => r.name === name);
  if (!route) throw new Error(`Écran inconnu : ${name}`);
  const path = route.path.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key] ?? ''));
  return `#${path}`;
}

// --- Partie qui agit sur le navigateur ---
//
// Chaque écran ajoute une entrée dans l'historique du navigateur (avec sa
// « profondeur » : 0 pour le premier écran ouvert, 1 pour le suivant…).
// Une fenêtre superposée (feuille du bas, menu, confirmation) ajoute elle
// aussi une entrée : le bouton Retour du téléphone la ferme, au lieu de
// quitter l'écran.

let renderRoute = () => {};
const overlays = [];   // fenêtres superposées ouvertes, de la plus ancienne à la plus récente
let ignoredPops = 0;   // retours provoqués par nous-mêmes, à ne pas traiter
let pendingBack = null;   // retour en cours (le navigateur le traite un instant plus tard)
let backDone = null;

const depth = () => history.state?.depth ?? 0;

// Exécute fn quand le dernier « retour » lancé par nous est terminé. Sans
// cette attente, un retour tardif pourrait annuler l'écran ou la fenêtre
// qu'on vient d'ouvrir.
function whenHistoryReady(fn) {
  if (pendingBack) pendingBack.then(fn);
  else fn();
}

// Va vers un écran. replace = true : remplace l'écran actuel dans l'historique
// (le bouton Retour ne reviendra pas dessus).
// Une fenêtre ouverte est fermée d'office (inutile de la fermer avant).
export function navigate(name, params = {}, { replace = false } = {}) {
  const hash = pathFor(name, params);
  const hadOverlay = overlays.length > 0;
  closeAllOverlays();
  whenHistoryReady(() => {
    if (hadOverlay) {
      // L'écran suivant prend la place de l'entrée de la fenêtre fermée
      history.replaceState({ depth: depth() + (replace ? 0 : 1) }, '', hash);
    } else if (replace) {
      history.replaceState({ depth: depth() }, '', hash);
    } else {
      history.pushState({ depth: depth() + 1 }, '', hash);
    }
    renderRoute(matchRoute(location.hash));
  });
}

// Revient à l'écran précédent de Listo s'il y en a un, sinon va à « fallback »
export function goBack(fallback = 'lists', params = {}) {
  if (depth() > 0) history.back();
  else navigate(fallback, params, { replace: true });
}

// Enregistre une fenêtre superposée. close() est appelé pour la fermer quand
// on appuie sur Retour. Renvoie la fonction à appeler pour la fermer soi-même.
export function openOverlay(close) {
  const entry = { close, pushed: false, hash: location.hash };
  overlays.push(entry);
  whenHistoryReady(() => {
    if (!overlays.includes(entry)) return; // déjà refermée entre-temps
    history.pushState({ depth: depth(), overlay: true }, '', location.hash);
    entry.pushed = true;
  });
  return () => {
    const index = overlays.indexOf(entry);
    if (index === -1) return;
    overlays.splice(index, 1);
    entry.close();
    if (!entry.pushed) return;
    // Retire l'entrée ajoutée à l'ouverture
    ignoredPops++;
    if (!pendingBack) pendingBack = new Promise((resolve) => { backDone = resolve; });
    history.back();
  };
}

// Ferme toutes les fenêtres sans toucher à l'historique (changement d'écran)
function closeAllOverlays() {
  while (overlays.length) overlays.pop().close();
}

// Ferme toutes les fenêtres de l'écran actuel en restant sur cet écran
// (droit sur la liste changé pendant qu'une fiche est ouverte) : les entrées
// qu'elles avaient ajoutées à l'historique sont retirées en un seul retour.
export function closeOverlays() {
  const pushed = overlays.filter((entry) => entry.pushed).length;
  closeAllOverlays();
  if (!pushed) return;
  ignoredPops++;
  if (!pendingBack) pendingBack = new Promise((resolve) => { backDone = resolve; });
  history.go(-pushed);
}

// Démarre le routeur : onRoute(route) est appelé à chaque changement d'écran
export function startRouter(onRoute) {
  renderRoute = onRoute;
  if (!history.state) history.replaceState({ depth: 0 }, '', location.hash || pathFor('lists'));
  window.addEventListener('popstate', () => {
    if (ignoredPops > 0) {
      ignoredPops--;
      if (ignoredPops === 0 && pendingBack) {
        pendingBack = null;
        backDone();
      }
      return;
    }
    // Retour avec une fenêtre ouverte, sur le même écran : on ferme
    // seulement la fenêtre
    const top = overlays.at(-1);
    if (top && top.hash === location.hash) {
      overlays.pop();
      top.close();
      return;
    }
    // Autre adresse (lien, adresse tapée…) : fenêtres fermées, nouvel écran
    closeAllOverlays();
    renderRoute(matchRoute(location.hash));
  });
  renderRoute(matchRoute(location.hash));
}
