// Point de départ de l'interface : thème, session, données, choix de l'écran
// et mise en page (une colonne sur téléphone, deux sur ordinateur).

import { h, icon, replace } from './dom.js';
import { get, post, putPhoto, deletePhoto, onSessionProblem, ApiError, NetworkError, errorMessage } from './api.js';
import { startRouter, navigate } from './router.js';
import { applyTheme, savedTheme } from './theme.js';
import { emptyState, loadSync, mergeSync, toSnapshot, fromSnapshot, isTooOld, applyOp, newsTotal } from './store.js';
import { createQueue } from './queue.js';
import { openLocal, deleteLocal, memoryLocal } from './localdb.js';
import { setOverlayHost, setSyncState, setPendingCount, toast, confirmDialog, releaseFocus } from './ui.js';
import { startLive, stopLive, groupCalls } from './live.js';
import { renderLogin, renderForcedChange } from './screens/login.js';
import { renderLists, renderSidePanel } from './screens/lists.js';
import { renderList } from './screens/list.js';
import { renderListForm } from './screens/list-form.js';
import { renderSettings, renderPassword, renderTwoFactor } from './screens/settings.js';
import { renderAccount } from './screens/account.js';
import { renderAdmin } from './screens/admin.js';
import { renderHelp } from './screens/help.js';
import { BUILD } from './version.js';
import { createFreshness, reloadBlocker, CHECK_EVERY_MS } from './freshness.js';

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
  showAppBadge();
  persistSoon();
}

// Badge de l'icône de l'application installée : total des nouveautés des
// listes hors sourdine (« Nouveautés » activé), effacé à 0. Essai
// facultatif : sans l'API (navigateur, iPhone sans application installée…),
// rien ne se passe.
let badgeShown = null;
function showAppBadge() {
  const total = app.user ? newsTotal(app.data) : 0;
  if (total === badgeShown) return;
  badgeShown = total;
  try {
    const done = total > 0 ? navigator.setAppBadge?.(total) : navigator.clearAppBadge?.();
    done?.catch?.(() => {});
  } catch {
    // API absente ou refusée : rien
  }
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
  // File d'attente du compte : ce qui n'était pas encore envoyé repartira
  queue?.stop();
  queue = makeQueue();
  try {
    await queue.load();
  } catch {
    // file illisible : rien à renvoyer
  }
  replayQueue();
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

// Remise à zéro de la copie de ce téléphone (Mon compte) : tout est rechargé
// depuis le serveur
export async function resetLocalCopy() {
  await local.clearSnapshot();
  app.data = emptyState();
  replayQueue(); // les modifications en attente ne sont pas perdues
  dataChanged();
  await refreshData({ full: true });
}

// Nombre de modifications en attente d'envoi
export const pendingCount = () => queue?.count() ?? 0;

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
let refusals = [];         // raisons des modifications refusées par le serveur
// Refus du serveur pour une personne en lecture seule (même texte que
// server/lists.js), et le message montré quand des modifications faites hors
// ligne ont été refusées pour cette raison
const READ_ONLY = 'Vous avez un accès en lecture seule à cette liste.';
const READ_ONLY_OFFLINE = "Cette liste est maintenant en lecture seule : vos modifications hors ligne n'ont pas été envoyées.";
// Refus du serveur pour une priorité ou une échéance désactivée dans la liste
// (mêmes textes que server/lists.js), et le message court montré alors
const OPTION_OFF = ['La priorité est désactivée pour cette liste.', "L'échéance est désactivée pour cette liste."];
const OPTION_OFF_MESSAGE = 'Cette option est désactivée pour cette liste.';
export function refreshData({ quiet = false, full = false } = {}) {
  if (refreshing) {
    again = { full: Boolean(again?.full || full) };
    return refreshing;
  }
  // « Synchronisation… » seulement si elle dure : pas de clignotement à
  // chaque message du temps réel
  const busy = setTimeout(() => setSyncState('busy'), 400);
  refreshing = (async () => {
    try {
      // 1. D'abord, envoyer ce qui attend dans la file (dans l'ordre)
      if (queue?.count()) {
        const outcome = await queue.flush();
        if (outcome === 'offline') {
          setSyncState('off');
          return;
        }
        if (outcome !== 'done') return; // session expirée, ou déconnexion
      }
      // 2. Une modification refusée : on prévient, et on reprend tout l'état
      //    du serveur (son effet local est ainsi annulé)
      //    Refus « lecture seule » (le droit a changé pendant que ce
      //    téléphone était hors ligne) : un seul message, plus clair, montré
      //    après la synchronisation (l'écran est alors déjà repassé en
      //    lecture seule).
      //    Même chose pour une option (priorité, échéance) désactivée entre-temps.
      let readOnlyRefused = false;
      let optionRefused = false;
      if (refusals.length) {
        readOnlyRefused = refusals.includes(READ_ONLY);
        optionRefused = refusals.some((message) => OPTION_OFF.includes(message));
        const [first, ...others] = refusals.filter((message) => message !== READ_ONLY && !OPTION_OFF.includes(message));
        refusals = [];
        full = true;
        if (first) toast(`Une modification n'a pas pu être enregistrée : ${first}${others.length ? ` (et ${others.length} autre${others.length > 1 ? 's' : ''})` : ''}`);
      }
      // 3. Puis récupérer les changements des autres. Copie trop ancienne
      //    (plus de 25 jours) : tout recharger.
      const since = !full && app.data.loaded && !isTooOld(app.data) ? app.data.serverTime : null;
      const data = await get(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync');
      if (!app.user) return;
      if (since) mergeSync(app.data, data);
      else loadSync(app.data, data);
      // 4. Les modifications encore en file sont rejouées par-dessus
      replayQueue();
      setSyncState('ok');
      dataChanged();
      if (readOnlyRefused) toast(READ_ONLY_OFFLINE);
      else if (optionRefused) toast(OPTION_OFF_MESSAGE);
    } catch (error) {
      // Serveur injoignable ou en panne : « Hors ligne » (choix du propriétaire)
      const unauthorized = error instanceof ApiError && error.status === 401;
      setSyncState(error instanceof NetworkError || (error instanceof ApiError && error.status >= 500) ? 'off' : 'ok');
      if (!quiet && !unauthorized) toast(errorMessage(error));
    } finally {
      clearTimeout(busy);
      refreshing = null;
      if (again && app.user) {
        const next = again;
        again = null;
        refreshData({ quiet: true, full: next.full });
      }
    }
  })();
  return refreshing;
}

// --- File d'attente (queue.js) ---

let queue = null; // file du compte ouvert

function makeQueue() {
  return createQueue({
    storage: local,
    transport: {
      sendOps: async (operations) => (await post('/api/ops', { ops: operations })).results,
      putPhoto,
      deletePhoto,
    },
    events: {
      changed: () => setPendingCount(queue?.count() ?? 0),
      refused: (entry, message) => refusals.push(message),
      dropped: () => {},
      offline: () => setSyncState('off'),
    },
  });
}

// Rejoue sur la copie locale ce qui attend encore dans la file
function replayQueue() {
  if (!queue || !app.user) return;
  for (const entry of queue.entries()) {
    const item = entry.itemId ? app.data.items.get(entry.itemId) : null;
    if (entry.kind === 'op') applyOp(app.data, entry.op, { user: app.user, now: entry.at, hint: entry.hint });
    else if (entry.kind === 'photo' && item) app.data.items.set(item.id, { ...item, localPhoto: entry.seq });
    else if (entry.kind === 'photoDelete' && item) app.data.items.set(item.id, { ...item, photoAt: null, localPhoto: null });
  }
}

// Ajoute un élément à la file (utilisé par actions.js). Pour une photo :
// replacesPhotoOf retire les photos du même article pas encore envoyées
// (seule la dernière compte) ; onlyIfSent : un retrait de photo n'est mis en
// file que si le serveur a une photo à retirer.
export async function queueEntry(entry, { replacesPhotoOf = null, onlyIfSent = true } = {}) {
  if (replacesPhotoOf) {
    for (const old of queue.entries()) {
      if ((old.kind === 'photo' || old.kind === 'photoDelete') && old.itemId === replacesPhotoOf) await queue.remove(old.seq);
    }
    if (entry.kind === 'photoDelete' && !onlyIfSent) return null;
  }
  return queue.add(entry);
}

// Envoi rapide après une action (plusieurs actions rapprochées : un envoi)
export const flushSoon = groupCalls(() => refreshData({ quiet: true }), 50);

// Le téléphone perd le réseau : l'indicateur le dit tout de suite
window.addEventListener('offline', () => {
  if (app.user) setSyncState('off');
});

// Démarre le temps réel pour le compte connecté ; la version du code est
// vérifiée au démarrage et à chaque reconnexion du flux
function goLive() {
  startLive(({ full }) => refreshData({ quiet: true, full }), { onReconnect: () => freshness.check() });
  freshness.check();
}

// --- Nouvelle version de Listo (voir freshness.js) ---

const WORKER_WAIT_MS = 10 * 1000;

// Demande au navigateur la nouvelle version de sw.js et attend qu'elle soit
// active : elle a alors copié les nouveaux fichiers (10 secondes au plus).
// Une panne n'empêche rien : au rechargement, le réseau passe d'abord.
async function updateWorker() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return;
    await registration.update();
    const worker = registration.installing ?? registration.waiting;
    if (!worker) return;
    await new Promise((resolve) => {
      const done = () => {
        if (worker.state === 'activated' || worker.state === 'redundant') resolve();
      };
      worker.addEventListener('statechange', done);
      setTimeout(resolve, WORKER_WAIT_MS);
      done();
    });
  } catch {
    // pas de réseau, ou service worker indisponible : sans importance
  }
}

// Bandeau « Nouvelle version disponible » (rechargement automatique
// impossible pour l'instant) : en haut de l'écran, sans cacher la barre
// d'ajout ; il reste d'un écran à l'autre jusqu'au rechargement
let bannerWanted = false;
let currentCol = null;
function placeBanner() {
  if (!bannerWanted || !currentCol || currentCol.querySelector('.update-banner')) return;
  currentCol.prepend(h('div', { class: 'note update-banner', role: 'status' },
    icon('sync'),
    h('span', { class: 'grow' }, 'Nouvelle version disponible'),
    h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => freshness.reloadNow() }, 'Recharger')));
}

// Mémoire de l'onglet (un seul rechargement automatique par version)
function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // indisponible : pas de rechargement automatique, le bandeau reste
  }
}

const freshness = createFreshness({
  localBuild: BUILD,
  serverBuild: async () => (await get('/api/about', { auth: false })).build,
  blocker: () => reloadBlocker(document, { busy: Boolean(queue?.busy()) }),
  updateWorker,
  reload: () => location.reload(),
  notify: (text) => toast(text, { low: true }),
  showBanner: () => {
    bannerWanted = true;
    placeBanner();
  },
  storage: sessionStore(),
  isOnline: () => navigator.onLine,
  log: (text) => console.info(text),
});

// Retour au premier plan, et toutes les heures au premier plan : vérification
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.user) freshness.check();
});
setInterval(() => {
  if (document.visibilityState === 'visible' && app.user) freshness.check();
}, CHECK_EVERY_MS);

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
  queue?.stop();
  queue = null;
  setPendingCount(0);
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

// Déconnexion volontaire (Réglages). Des modifications en attente : on
// essaie d'abord de les envoyer ; s'il en reste (pas de réseau), on prévient
// qu'elles seront perdues et on laisse le choix.
export async function logOut() {
  if (pendingCount()) await refreshData({ quiet: true });
  const left = pendingCount();
  if (left) {
    const ok = await confirmDialog({
      title: 'Se déconnecter ?',
      text: `${left === 1 ? '1 modification n\'est' : `${left} modifications ne sont`} pas encore envoyée${left === 1 ? '' : 's'}. Si vous vous déconnectez maintenant, ${left === 1 ? 'elle sera perdue' : 'elles seront perdues'}.`,
      confirmLabel: 'Se déconnecter quand même',
      cancelLabel: 'Rester connecté',
    });
    if (!ok) return;
  }
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
  // Changement d'écran : aucun champ ne garde le curseur (clavier replié)
  releaseFocus();
  for (const fn of cleanup) fn();
  cleanup = [];
  const col = h('div', { class: 'shell__col' });
  setOverlayHost(col);
  const content = typeof screen === 'function' ? screen((fn) => cleanup.push(fn)) : screen;
  replace(col, content);
  currentCol = col;
  placeBanner();

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
    case 'account': mount((onLeave) => renderAccount(onLeave)); break;
    case 'password': mount(() => renderPassword()); break;
    case 'twoFactor': mount((onLeave) => renderTwoFactor(onLeave)); break;
    case 'admin': mount((onLeave) => renderAdmin(params.tab, onLeave)); break;
    case 'help': mount(() => renderHelp(app.user)); break;
    default: navigate('lists', {}, { replace: true });
  }
  // Une nouvelle version attend : nouvel essai de rechargement sur le nouvel écran
  freshness.retry();
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
