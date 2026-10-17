// Point de départ de l'interface : thème, session, données, choix de l'écran
// et mise en page (une colonne sur téléphone, deux sur ordinateur).

import { h, replace } from './dom.js';
import { get, onSessionProblem, ApiError, NetworkError, errorMessage } from './api.js';
import { startRouter, navigate } from './router.js';
import { applyTheme, savedTheme } from './theme.js';
import { emptyState, loadSync } from './store.js';
import { setOverlayHost, setSyncState, toast } from './ui.js';
import { renderLogin, renderForcedChange } from './screens/login.js';
import { renderLists, renderSidePanel } from './screens/lists.js';
import { renderList } from './screens/list.js';
import { renderListForm } from './screens/list-form.js';
import { renderSettings, renderPassword, renderTwoFactor } from './screens/settings.js';
import { renderAdmin } from './screens/admin.js';

applyTheme(savedTheme());

// --- État partagé par les écrans ---

export const app = {
  user: null,            // compte connecté (null : pas connecté)
  setupNeeded: false,    // aucun compte : proposer de créer l'Admin
  data: emptyState(),    // copie des listes, articles, rayons… (store.js)
  route: null,
  afterLogin: null,      // écran demandé avant la connexion
};

// Abonnements aux changements de données (les écrans se redessinent)
const listeners = new Set();
export function onDataChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function dataChanged() {
  for (const listener of [...listeners]) listener();
}

// Récupère tout depuis le serveur (GET /api/sync). Appelée à l'ouverture de
// l'application, à l'ouverture d'une liste et par le bouton d'actualisation.
// (Étape 8 : temps réel ; étape 9 : seulement ce qui a changé, hors ligne.)
let refreshing = null;
export function refreshData({ quiet = false } = {}) {
  if (refreshing) return refreshing;
  setSyncState('busy');
  refreshing = get('/api/sync')
    .then((data) => {
      loadSync(app.data, data);
      setSyncState('ok');
      dataChanged();
    })
    .catch((error) => {
      setSyncState(error instanceof NetworkError ? 'off' : 'ok');
      if (!quiet && !(error instanceof ApiError && error.status === 401)) toast(errorMessage(error));
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// --- Session ---

// Appelée après une connexion réussie (ou un changement de mot de passe imposé)
export function loggedIn(user) {
  app.user = user;
  app.setupNeeded = false;
  if (user.mustChangePassword) {
    show(app.route);
    return;
  }
  refreshData({ quiet: true });
  const next = app.afterLogin && app.afterLogin.name !== 'login' ? app.afterLogin : { name: 'lists', params: {} };
  app.afterLogin = null;
  navigate(next.name, next.params, { replace: true });
}

// Déconnexion (ou session expirée) : on oublie tout ce qui est en mémoire
export function loggedOut() {
  app.user = null;
  app.data = emptyState();
  dataChanged();
  navigate('login', {}, { replace: true });
}

onSessionProblem({
  unauthorized: () => {
    if (!app.user) return;
    app.afterLogin = app.route;
    loggedOut();
    toast('Votre session a expiré : reconnectez-vous.', { low: true });
  },
  mustChangePassword: () => {
    if (app.user) app.user.mustChangePassword = true;
    show(app.route);
  },
});

// --- Mise en page ---

const root = document.getElementById('app');
const desktop = window.matchMedia('(min-width: 1024px)');
desktop.addEventListener('change', () => show(app.route));
export const isDesktop = () => desktop.matches;

let cleanup = [];   // fonctions à appeler en quittant l'écran (désabonnements)

// Affiche un écran. withSide : colonne « Mes listes » à gauche sur ordinateur.
function mount(screen, { withSide = true, selectedListId = null } = {}) {
  for (const fn of cleanup) fn();
  cleanup = [];
  const col = h('div', { class: 'shell__col' });
  setOverlayHost(col);
  const content = typeof screen === 'function' ? screen((fn) => cleanup.push(fn)) : screen;
  replace(col, content);

  if (app.user && withSide && isDesktop()) {
    const side = h('aside', { class: 'shell__side', 'aria-label': 'Mes listes' });
    cleanup.push(renderSidePanel(side, selectedListId));
    replace(root, h('div', { class: 'shell' }, side, h('main', { class: 'shell__main' }, col)));
  } else {
    replace(root, h('div', { class: 'shell' }, h('main', { class: 'shell__main' }, col)));
  }
}

// Choisit l'écran à afficher pour une adresse
function show(route) {
  app.route = route;
  if (!route) return;

  // Pas connecté : écran de connexion (ou de création du premier Admin)
  if (!app.user) {
    if (route.name !== 'login') {
      app.afterLogin = route;
      navigate('login', {}, { replace: true });
      return;
    }
    mount(renderLogin({ setupNeeded: app.setupNeeded }), { withSide: false });
    return;
  }
  // Mot de passe imposé par l'Admin : à changer avant tout le reste
  if (app.user.mustChangePassword) {
    mount(renderForcedChange(), { withSide: false });
    return;
  }

  const { name, params } = route;
  if (name === 'login') {
    navigate('lists', {}, { replace: true });
    return;
  }
  if (name === 'admin' && app.user.role !== 'admin') {
    navigate('settings', {}, { replace: true });
    return;
  }

  switch (name) {
    case 'lists': mount((onLeave) => renderLists(onLeave)); break;
    case 'list': mount((onLeave) => renderList(params.id, onLeave), { selectedListId: params.id }); break;
    case 'newList': mount((onLeave) => renderListForm(null, onLeave)); break;
    case 'editList': mount((onLeave) => renderListForm(params.id, onLeave), { selectedListId: params.id }); break;
    case 'settings': mount(() => renderSettings()); break;
    case 'password': mount(() => renderPassword()); break;
    case 'twoFactor': mount((onLeave) => renderTwoFactor(onLeave)); break;
    case 'admin': mount((onLeave) => renderAdmin(params.tab, onLeave)); break;
    default: navigate('lists', {}, { replace: true });
  }
}

// --- Démarrage ---

async function start() {
  try {
    app.setupNeeded = (await get('/api/setup', { auth: false })).needed;
    if (!app.setupNeeded) {
      try {
        app.user = (await get('/api/me', { auth: false })).user;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && error.data?.mustChangePassword) {
      app.user = { mustChangePassword: true };
    } else {
      // Serveur injoignable : message et bouton pour réessayer
      replace(root, h('div', { class: 'empty' },
        h('p', { class: 'empty__title' }, 'Listo est injoignable'),
        h('p', { class: 'empty__text' }, errorMessage(error)),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => location.reload() }, 'Réessayer')));
      return;
    }
  }
  if (app.user && !app.user.mustChangePassword) refreshData({ quiet: true });
  startRouter(show);
}

start();

// Application installable : service worker minimal (aucun cache, voir sw.js)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
