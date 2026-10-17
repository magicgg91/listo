// Point de départ de l'interface : thème, session, données, choix de l'écran
// et mise en page (une colonne sur téléphone, deux sur ordinateur).

import { h, replace } from './dom.js';
import { get, post, onSessionProblem, ApiError, NetworkError, errorMessage } from './api.js';
import { startRouter, navigate } from './router.js';
import { applyTheme, savedTheme } from './theme.js';
import { emptyState, loadSync, mergeSync, toSnapshot, fromSnapshot, isTooOld } from './store.js';
import { openLocal, deleteLocal, memoryLocal } from './localdb.js';
import { setOverlayHost, setSyncState, toast } from './ui.js';
import { startLive, stopLive } from './live.js';
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
  persistSoon();
}

// --- Copie gardée sur le téléphone (IndexedDB, voir localdb.js) ---

// Base locale du compte ouvert (en mémoire tant qu'aucun compte n'est ouvert)
let local = memoryLocal();

// Dernier compte connecté sur ce téléphone (numéro, identifiant, nom, rôle :
// rien de secret). Il permet d'ouvrir l'application sans réseau.
const LAST_USER_KEY = 'listo-compte';
function readLastUser() {
  try {
    const user = JSON.parse(localStorage.getItem(LAST_USER_KEY));
    return user && Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}
function writeLastUser(user) {
  try {
    const { id, username, displayName, role, totpEnabled } = user;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, username, displayName, role, totpEnabled }));
  } catch {
    // stockage indisponible : l'application marche, mais pas sans réseau
  }
}
function forgetLastUser() {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // rien à faire
  }
}

// Photos déjà vues (cache du service worker) : vidées à la déconnexion et
// au changement de compte
async function clearPhotoCache() {
  try {
    await globalThis.caches?.delete('listo-photos');
  } catch {
    // rien à faire
  }
}

// Ouvre la copie locale d'un compte et l'affiche tout de suite (avant même
// la synchronisation avec le serveur)
async function openAccount(user) {
  const last = readLastUser();
  if (last && last.id !== user.id) await clearPhotoCache();
  writeLastUser(user);
  local.close();
  local = await openLocal(user.id);
  let snapshot = null;
  try {
    snapshot = await local.loadSnapshot();
  } catch {
    snapshot = null; // copie illisible : rechargée depuis le serveur
  }
  app.data = fromSnapshot(snapshot) ?? emptyState();
  for (const listener of [...listeners]) listener();
}

// Enregistre la copie peu après chaque changement (regroupé)
let saveTimer = null;
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (app.user && app.data.loaded) local.saveSnapshot(toSnapshot(app.data)).catch(() => {});
  }, 300);
}

// Remise à zéro de la copie de ce téléphone (Réglages) : tout est rechargé
// depuis le serveur
export async function resetLocalCopy() {
  await local.clearSnapshot();
  app.data = emptyState();
  dataChanged();
  await refreshData({ full: true });
}

// Synchronisation avec le serveur (GET /api/sync). Appelée à l'ouverture de
// l'application, à l'ouverture d'une liste, par le bouton d'actualisation, et
// par le temps réel (live.js) : message du serveur, toutes les 60 secondes,
// retour au premier plan.
// - full : tout recharger ; sinon, seulement ce qui a changé depuis la
//   dernière synchronisation (?since=…, heure donnée par le serveur).
// - Une demande pendant une synchronisation en cours en relance une juste
//   après : un changement arrivé entre-temps n'est jamais manqué.
// (Étape 9 : copie gardée sur le téléphone, hors ligne.)
let refreshing = null;
let again = null;
export function refreshData({ quiet = false, full = false } = {}) {
  if (refreshing) {
    again = { full: Boolean(again?.full || full) };
    return refreshing;
  }
  // Copie trop ancienne (plus de 25 jours) : tout recharger
  const since = !full && app.data.loaded && !isTooOld(app.data) ? app.data.serverTime : null;
  // « Synchronisation… » seulement si elle dure : pas de clignotement à
  // chaque message du temps réel
  const busy = setTimeout(() => setSyncState('busy'), 400);
  refreshing = get(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync')
    .then((data) => {
      if (since) mergeSync(app.data, data);
      else loadSync(app.data, data);
      setSyncState('ok');
      dataChanged();
    })
    .catch((error) => {
      // Serveur injoignable ou en panne : « Hors ligne » (choix du propriétaire)
      const unauthorized = error instanceof ApiError && error.status === 401;
      setSyncState(error instanceof NetworkError || (error instanceof ApiError && error.status >= 500) ? 'off' : 'ok');
      if (!quiet && !unauthorized) toast(errorMessage(error));
    })
    .finally(() => {
      clearTimeout(busy);
      refreshing = null;
      if (again && app.user) {
        const next = again;
        again = null;
        refreshData({ quiet: true, full: next.full });
      }
    });
  return refreshing;
}

// Démarre le temps réel pour le compte connecté
function goLive() {
  startLive(({ full }) => refreshData({ quiet: true, full }));
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
  openAccount(user).then(() => {
    refreshData({ quiet: true, full: true });
    goLive();
  });
  const next = app.afterLogin && app.afterLogin.name !== 'login' ? app.afterLogin : { name: 'lists', params: {} };
  app.afterLogin = null;
  navigate(next.name, next.params, { replace: true });
}

// Fin de session : on oublie tout ce qui est en mémoire.
// forget : déconnexion volontaire, la copie gardée sur le téléphone est
// effacée aussi. Sinon (session expirée), elle est gardée, avec ses
// modifications en attente : elles repartiront après la reconnexion.
export function loggedOut({ forget = false } = {}) {
  stopLive();
  const user = app.user;
  app.user = null;
  app.data = emptyState();
  clearTimeout(saveTimer);
  for (const listener of [...listeners]) listener();
  local.close();
  local = memoryLocal();
  if (forget) {
    if (user?.id) deleteLocal(user.id);
    forgetLastUser();
    clearPhotoCache();
  }
  navigate('login', {}, { replace: true });
}

// Déconnexion volontaire (Réglages)
export async function logOut() {
  try {
    await post('/api/logout');
  } catch {
    // session déjà terminée, ou pas de réseau : sans importance
  }
  loggedOut({ forget: true });
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
    const lastUser = readLastUser();
    if (error instanceof ApiError && error.status === 403 && error.data?.mustChangePassword) {
      app.user = { mustChangePassword: true };
    } else if (error instanceof NetworkError && lastUser) {
      // Pas de réseau : on ouvre la copie gardée du dernier compte connecté
      app.user = lastUser;
    } else {
      // Serveur injoignable : message et bouton pour réessayer
      replace(root, h('div', { class: 'empty' },
        h('p', { class: 'empty__title' }, 'Listo est injoignable'),
        h('p', { class: 'empty__text' }, errorMessage(error)),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => location.reload() }, 'Réessayer')));
      return;
    }
  }
  if (app.user && !app.user.mustChangePassword) {
    await openAccount(app.user);
    refreshData({ quiet: true, full: true });
    goLive();
  }
  startRouter(show);
}

start();

// Service worker : application installable et ouverture sans réseau (voir
// sw.js). « updateViaCache: none » : le navigateur vérifie toujours s'il
// existe une nouvelle version de sw.js.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
}
