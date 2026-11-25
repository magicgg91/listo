// Point de départ de l'interface : thème, session, données, choix de l'écran
// et mise en page (une colonne sur téléphone, deux sur ordinateur).

import { h, icon, replace } from './dom.js';
import { prepareAnnouncer } from './announce.js';
import { scriptUrl } from './trusted.js';
import { get, post, putPhoto, deletePhoto, onSessionProblem, ApiError, NetworkError, errorMessage } from './api.js';
import { startRouter, navigate, closeOverlays } from './router.js';
import { applyTheme, savedTheme } from './theme.js';
import { setLocale, setCurrency, resolveLocale, t } from './i18n.js';
import { setTranslator } from './search.js';
import { emptyState, loadSync, mergeSync, toSnapshot, fromSnapshot, isTooOld, applyOp, newsTotal, canEditList, loadInbox, inboxRowsFor } from './store.js';
import { createQueue } from './queue.js';
import { openLocal, deleteLocal, memoryLocal } from './localdb.js';
import { setOverlayHost, setPcLayer, onPc, setSyncState, setPendingCount, toast, confirmDialog, releaseFocus, isTextField } from './ui.js';
import { startLive, stopLive, groupCalls } from './live.js';
import { renderLogin, renderForcedChange } from './screens/login.js';
import { renderClaudeConsent } from './screens/claude-consent.js';
import { renderClaudeConnections } from './screens/claude-connections.js';
import { renderTrash } from './screens/trash-page.js';
import { renderLists } from './screens/lists.js';
import { renderGifts } from './screens/gifts.js';
import { renderHome } from './screens/home.js';
import { renderDeadlines } from './screens/deadlines.js';
import { renderNotes } from './screens/notes.js';
import { renderNote } from './screens/note.js';
import { tabBar, hasTabs, tabOf } from './tabbar.js';
import { firstScreen, normalizeHome } from './home-tiles.js';
import { normalizeFeatures, screenAllowed, notesOn } from './features.js';
import { askedTrashTab } from './trash-tabs.js';
import { createPcSide } from './screens/pc-side.js';
import { renderList } from './screens/list.js';
import { renderListForm, openListFormPanel } from './screens/list-form.js';
import { renderSettings, renderAbout, renderPassword, renderTwoFactor } from './screens/settings.js';
import { renderAccount } from './screens/account.js';
import { renderAdmin } from './screens/admin.js';
import { renderHelp } from './screens/help.js';
import { renderNotifications } from './screens/notifications.js';
import { renderHomeSettings } from './screens/home-settings.js';
import { renderFeatures } from './screens/features.js';
import { renderInbox } from './screens/inbox.js';
import { resyncPush, forgetPush } from './push.js';
import { BUILD } from './version.js';
import { startShortcuts } from './shortcuts.js';
import { undoLast, nothingToUndo } from './undo.js';
import * as actions from './actions.js';
import { createFreshness, reloadBlocker, CHECK_EVERY_MS } from './freshness.js';

applyTheme(savedTheme());
// Recherche (search.js, qui n'importe rien) : « 4 résultats » dans la langue choisie
setTranslator(t);
// Zones d'annonce des lecteurs d'écran, présentes avant le premier message
prepareAnnouncer();

// --- État partagé par les écrans ---

// Nom du fournisseur d'identité affiché à l'écran (« Se connecter avec … »,
// « Confirmer avec … ») : LISTO_OIDC_NAME, sinon « SSO », nom neutre
export const providerName = () => app.oidc?.name ?? 'SSO';

export const app = {
  user: null,            // compte connecté (null : pas connecté)
  setupNeeded: false,    // aucun compte : proposer de créer l'Admin
  lang: 'fr',            // langue par défaut de l'installation (LISTO_LANG)
  currency: 'EUR',       // monnaie du prix des envies (LISTO_CURRENCY)
  oidc: null,            // connexion avec le fournisseur d'identité proposée : { name }, sinon null
  localLogin: true,      // connexion par identifiant et mot de passe proposée
  data: emptyState(),    // copie des listes, articles, rayons… (store.js)
  route: null,
  afterLogin: null,      // écran demandé avant la connexion
  openItem: null,        // { listId, itemId } : fiche à ouvrir en arrivant dans la liste (Échéances)
  openDeadlines: null,   // section d'Échéances à montrer en arrivant (ligne de la tuile de l'Accueil)
};

// Premier écran de Listo : l'Accueil, ou l'écran choisi par la personne
// quand elle l'a coupé (Réglages › Accueil, home-tiles.js ; réglage du
// compte, gardé avec la copie locale : hors ligne compris). Écran d'une
// fonction coupée (Réglages › Fonctions, features.js) : « Listes ».
export const openingScreen = () => firstScreen(app.data.home, app.data.features);

// Abonnements aux changements de données (les écrans se redessinent)
const listeners = new Set();
export function onDataChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Fonction coupée pendant qu'un de ses écrans est ouvert (sur un autre
// appareil, ou à la synchronisation) : le premier écran le remplace (un
// instant plus tard : jamais pendant que les écrans se redessinent)
let leavingScreen = false;
onDataChange(() => {
  if (leavingScreen || !app.user || !app.route || screenAllowed(app.route.name, app.data.features)) return;
  leavingScreen = true;
  setTimeout(() => {
    leavingScreen = false;
    if (app.user && app.route && !screenAllowed(app.route.name, app.data.features)) navigate(openingScreen(), {}, { replace: true });
  });
});
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
    const { id, username, displayName, role, totpEnabled, locale = null } = user;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, username, displayName, role, totpEnabled, locale }));
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

// --- Langue et monnaie (public/js/i18n.js) ---

// Langue par défaut et monnaie de l'installation (LISTO_LANG,
// LISTO_CURRENCY), données par /api/setup et gardées sur ce téléphone pour
// ouvrir l'application sans réseau
const INSTALLATION_KEY = 'listo-installation';
function readInstallation() {
  try {
    const saved = JSON.parse(localStorage.getItem(INSTALLATION_KEY));
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}
function writeInstallation({ lang, currency }) {
  try {
    localStorage.setItem(INSTALLATION_KEY, JSON.stringify({ lang, currency }));
  } catch {
    // stockage indisponible : réglages par défaut sans réseau
  }
}

// Langue des écrans : celle choisie par le compte, sinon celle du
// navigateur, sinon celle de l'installation (une langue complète, sinon le
// français) ; posée aussi sur <html lang> pour les lecteurs d'écran.
// À appeler avant d'afficher un écran.
export function applyLanguage() {
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language];
  const locale = setLocale(resolveLocale([app.user?.locale, ...browser, app.lang]));
  document.documentElement.lang = locale;
  setCurrency(app.currency);
  return locale;
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
  // Réglage « Accueil » donné par le serveur à l'ouverture (/api/me) : plus
  // récent que la copie (changé sur un autre appareil) ; la file d'attente,
  // rejouée juste après, y remet un changement pas encore envoyé
  if (user.home) app.data.home = normalizeHome(user.home);
  // Réglage « Fonctions » : de même
  if (user.features) app.data.features = normalizeFeatures(user.features);
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
let refusals = [];         // modifications refusées par le serveur : { message, code }
// Les refus se reconnaissent à leur code (nom du texte de refus, donné par
// le serveur avec le message), quelle que soit la langue :
// - lecture seule (READ_ONLY de server/lists.js) ; le message montré quand
//   des modifications faites hors ligne ont été refusées pour cette raison
//   est « application.lectureSeule.horsLigne » ;
// - priorité ou échéance désactivée dans la liste (PRIORITY_OFF, DUE_OFF) ;
//   le message court montré alors est « application.optionDesactivee ».
const READ_ONLY = 'ops.lectureSeule';
const OPTION_OFF = ['ops.prioriteDesactivee', 'ops.echeanceDesactivee'];
// Note enregistrée sur une version dépassée (server/notes.js) : pas de
// message d'erreur, la note passe « À vérifier » (markNoteConflict)
const NOTE_CONFLICT = 'ops.noteConflit';
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
      let noteConflict = false;
      if (refusals.length) {
        readOnlyRefused = refusals.some(({ code }) => code === READ_ONLY);
        optionRefused = refusals.some(({ code }) => OPTION_OFF.includes(code));
        noteConflict = refusals.some(({ code }) => code === NOTE_CONFLICT);
        const [first, ...others] = refusals.filter(({ code }) => code !== READ_ONLY && code !== NOTE_CONFLICT && !OPTION_OFF.includes(code)).map(({ message }) => message);
        refusals = [];
        full = true;
        if (first) toast(others.length ? t('application.refus.etAutres', { message: first, count: others.length }) : t('application.refus', { message: first }));
      }
      // 3. Puis récupérer les changements des autres. Copie trop ancienne
      //    (plus de 25 jours), ou projets qui viennent d'être rallumés (le
      //    serveur n'en envoyait rien) : tout recharger.
      const since = !full && app.data.loaded && !isTooOld(app.data) && !app.data.projectsReload ? app.data.serverTime : null;
      const data = await get(since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync');
      if (!app.user) return;
      if (since) mergeSync(app.data, data);
      else loadSync(app.data, data);
      // Projets rallumés sur un autre appareil (vu à l'instant) : une
      // synchronisation complète suit
      if (app.data.projectsReload) again = { full: true };
      // Page Notifications : relue seulement quand son empreinte a changé
      // (une ligne ajoutée, lue ou effacée, ici ou sur un autre appareil)
      if (data.inboxStamp !== undefined && (data.inboxStamp !== app.data.inbox.stamp || !app.data.inbox.loaded)) {
        const page = await get('/api/inbox');
        if (!app.user) return;
        loadInbox(app.data, page);
      }
      // 4. Les modifications encore en file sont rejouées par-dessus
      replayQueue();
      setSyncState('ok');
      dataChanged();
      if (readOnlyRefused) toast(t('application.lectureSeule.horsLigne'));
      else if (optionRefused) toast(t('application.optionDesactivee'));
      // Note « À vérifier » : l'écran de la note ouverte propose le choix ;
      // ailleurs, un message dit de l'ouvrir
      else if (noteConflict && app.route?.name !== 'note' && !app.route?.params?.note) toast(t('application.noteAVerifier'));
      // Page Notifications reçue : celles de l'écran ouvert deviennent lues
      readInboxOfScreen();
    } catch (error) {
      // Serveur injoignable ou en panne : « Hors ligne » (choix du propriétaire)
      const unauthorized = error instanceof ApiError && error.status === 401;
      setSyncState(error instanceof NetworkError || (error instanceof ApiError && error.status >= 500) ? 'off' : 'ok');
      // Ordinateur : le message propose « Réessayer » (maquette pc-A, état « erreur »)
      if (!quiet && !unauthorized) toast(errorMessage(error), onPc() ? { action: t('application.reessayer'), onAction: () => refreshData({ full: true }) } : {});
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

// Ouvrir une liste, une note ou Échéances rend lues les notifications de
// la page qui les visent (une notification du téléphone touchée ouvre sa
// cible). Ouvrir la page Notifications ne marque rien (décision du 23
// novembre 2026).
function readInboxOfScreen() {
  const route = app.route;
  if (!app.user || !route || !app.data.inbox?.loaded) return;
  const scope = route.name === 'list' ? { listId: route.params.id }
    : route.name === 'note' ? { noteId: route.params.id }
      : route.name === 'deadlines' ? { deadlines: true } : null;
  if (!scope) return;
  const ids = inboxRowsFor(app.data, scope);
  if (ids.length) actions.markInboxRead(ids);
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
      refused: (entry, message, code, result) => {
        if (code === NOTE_CONFLICT) markNoteConflict(entry.op, result?.current);
        refusals.push({ message, code });
      },
      dropped: () => {},
      offline: () => setSyncState('off'),
    },
  });
}

// Enregistrement d'une note refusé (la note a changé entre-temps) : mon
// texte est gardé sur ce téléphone, la note passe « À vérifier » jusqu'à
// mon choix (screens/note.js). Plusieurs refus de suite (file hors ligne) :
// le dernier texte l'emporte. Rien n'est écrasé, ni ici ni sur le serveur.
// current : la version actuelle renvoyée avec le refus ; on en garde qui
// l'a écrite (« Léa a modifié cette note »), avant même la synchronisation.
function markNoteConflict(op, current = null) {
  const note = app.data.notes.get(op.noteId);
  const kept = app.data.noteConflicts.get(op.noteId);
  app.data.noteConflicts.set(op.noteId, {
    title: op.title ?? kept?.title ?? note?.title ?? '',
    body: op.body ?? kept?.body ?? note?.body ?? '',
    at: new Date().toISOString(),
    byId: current?.updatedBy ?? kept?.byId ?? null,
    byName: current?.updatedByName ?? kept?.byName ?? null,
  });
  dataChanged();
}

// File d'attente vue par les notes (actions.js, screens/note.js) : éléments
// en attente, remplacement d'un enregistrement pas encore parti
export const queuedEntries = () => queue?.entries() ?? [];
export const replaceQueuedOp = (seq, op) => queue?.replaceOp(seq, op) ?? Promise.resolve(false);
export const isQueuedSending = (seq) => Boolean(queue?.isSending(seq));

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
    h('span', { class: 'grow' }, t('application.nouvelleVersion')),
    h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => freshness.reloadNow() }, t('application.nouvelleVersion.recharger'))));
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
  applyLanguage(); // la langue du compte remplace celle du navigateur
  if (user.mustChangePassword) {
    show(app.route);
    return;
  }
  // Premier écran (Accueil, ou celui choisi) et fonctions utilisées connus
  // tout de suite
  if (user.home) app.data.home = normalizeHome(user.home);
  if (user.features) app.data.features = normalizeFeatures(user.features);
  openAccount(user).then(() => {
    refreshData({ quiet: true, full: true });
    goLive();
    resyncPush(user); // notifications : abonnement rendu au serveur si besoin
  });
  // Écran demandé avant la connexion (lien direct), sinon le premier écran
  // (l'Accueil, ou l'écran choisi quand il est coupé)
  const next = app.afterLogin && app.afterLogin.name !== 'login' ? app.afterLogin : { name: openingScreen(), params: {} };
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
      title: t('application.deconnexion.question'),
      text: t('application.deconnexion.texte', { count: left }),
      confirmLabel: t('application.deconnexion.confirmer'),
      cancelLabel: t('application.deconnexion.annuler'),
    });
    if (!ok) return;
  }
  // Notifications : cet appareil n'en reçoit plus (le serveur efface son
  // abonnement avec la session)
  await forgetPush();
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
    toast(t('application.sessionExpiree'), { low: true });
  },
  mustChangePassword: () => {
    if (app.user) app.user.mustChangePassword = true;
    show(app.route);
  },
});

// --- Mise en page ---

// Ordinateur (à partir de 1 024 px de large) : interface en deux zones
// (design/maquettes/pc-A), classe app--pc sur .app. En dessous, l'interface
// du téléphone, inchangée. Passage de l'une à l'autre (fenêtre
// redimensionnée, tablette tournée) : le même écran est redessiné (la liste
// ouverte reste ouverte), les fenêtres ouvertes se ferment.
const root = document.getElementById('app');
const desktop = window.matchMedia('(min-width: 1024px)');
export const isDesktop = () => desktop.matches;
const markLayout = () => root.classList.toggle('app--pc', isDesktop());
markLayout();
// Fenêtres de l'ordinateur (tiroir, fenêtre centrée) : posées sur .app
setPcLayer(root);

// Raccourcis clavier de l'ordinateur (shortcuts.js). Ctrl+Z : annule la
// dernière action faite sur cet appareil dans la liste ouverte (undo.js),
// avec les mêmes opérations que l'action d'origine (file d'attente).
startShortcuts({
  onUndo: async () => {
    const listId = app.route?.name === 'list' ? app.route.params.id : null;
    if (!listId) {
      toast(nothingToUndo());
      return;
    }
    if (!canEditList(app.data.lists.get(listId))) {
      toast(t('application.annulation.lectureSeule'));
      return;
    }
    toast(await undoLast(listId, app.data.items, {
      restore: (itemId) => actions.restoreItem(itemId),
      check: (item, checked) => actions.checkItem(item, checked),
      update: (item, changes) => actions.updateItem(item, changes),
    }));
  },
  // [ et ] : liste précédente ou suivante, dans l'ordre du menu de gauche
  onGoList: (delta) => pcSide?.goList(delta),
  // Notes coupées (Réglages › Fonctions) : N ne mène jamais à une note
  notesOn: () => notesOn(app.data.features),
});
desktop.addEventListener('change', () => {
  // Fenêtres ouvertes refermées d'abord (tiroir, fenêtre centrée, feuille),
  // puis le même écran redessiné dans l'autre disposition
  closeOverlays();
  markLayout();
  show(app.route);
});

let cleanup = [];   // fonctions à appeler en quittant l'écran (désabonnements)

// Menu de gauche de l'ordinateur : créé une fois et gardé d'un écran à
// l'autre (recherche et défilement conservés) ; refait si le compte change
// (autre compte, nom modifié), retiré sur téléphone et hors connexion
let pcSide = null;
let pcSideOwner = '';
function dropPcSide() {
  pcSide?.dispose();
  pcSide = null;
  pcSideOwner = '';
}
function pcSideFor(route) {
  const owner = JSON.stringify([app.user?.id, app.user?.displayName, app.user?.role]);
  if (pcSide && owner !== pcSideOwner) dropPcSide();
  if (!pcSide) {
    pcSide = createPcSide();
    pcSideOwner = owner;
  }
  pcSide.select(route);
  return pcSide.el;
}

// Affiche un écran. withSide : menu de gauche sur ordinateur (pas sur
// l'écran de connexion, par exemple). Sur ordinateur, tous les écrans ont
// la même colonne centrée (.pc-col, 1 040 px au plus ; décision du
// 24 novembre 2026).
// Écran posé (ordinateur) : sert à « Nouvelle liste » et « Modifier la
// liste », qui s'ouvrent par-dessus l'écran en cours
let mountedOnPc = false;
let mountedListId = null;
function mount(screen, { withSide = true, listId = null } = {}) {
  // Changement d'écran : aucun champ ne garde le curseur (clavier replié)
  releaseFocus();
  for (const fn of cleanup) fn();
  cleanup = [];
  const pc = Boolean(app.user) && withSide && isDesktop();
  const bar = !pc && Boolean(app.user) && withSide && hasTabs(app.route?.name);
  const col = h('div', { class: pc ? 'pc-col' : 'shell__col' });
  setOverlayHost(col);
  // Bandeau du bas : sans loupe tant que l'écran n'y branche pas sa recherche
  if (bar) tabBar().loupe.set(null);
  const content = typeof screen === 'function' ? screen((fn) => cleanup.push(fn)) : screen;
  replace(col, content);
  currentCol = col;
  placeBanner();

  mountedOnPc = pc;
  mountedListId = listId;
  if (pc) {
    replace(root, h('div', { class: 'pc pc--a' }, skipLink(col), pcSideFor(app.route), h('main', { class: 'pc-main' }, col)));
    screenShown(col);
    return;
  }
  // Téléphone : bandeau du bas sur « Échéances », « Listes » (et « À
  // offrir », avec « Listes » marqué), « Notes » et « Réglages », pas sur
  // l'Accueil (tabbar.js) ; toujours le même élément, posé en bas de la
  // colonne (au-dessus de l'écran, sous les fenêtres)
  if (bar) {
    col.classList.add('shell__col--tabs');
    col.append(tabBar().el);
    tabBar().select(tabOf(app.route.name));
  }
  dropPcSide();
  replace(root, h('div', { class: 'shell' }, h('main', { class: 'shell__main' }, col)));
  screenShown(col);
}

// Ordinateur : premier arrêt de la touche Tab, « Aller au contenu », caché
// tant qu'il n'a pas le focus ; il saute le menu de gauche et met le focus
// sur le titre de l'écran (jamais un champ de saisie)
function skipLink(col) {
  return h('button', {
    class: 'skip-link',
    type: 'button',
    onClick: () => {
      const heading = col.querySelector('h1');
      if (!heading) return;
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    },
  }, t('application.allerAuContenu'));
}

// Nouvel écran affiché : titre de la page (onglet du navigateur, annoncé
// par les lecteurs d'écran) d'après son titre h1 ; une liste écrit son
// propre titre (son nom, screens/list.js). Après un changement d'écran
// (pas au premier affichage, ni quand le même écran est redessiné), le
// focus va sur ce titre (tabindex="-1", jamais un champ de saisie) : le
// bouton touché a disparu avec l'ancien écran, et VoiceOver reprend en
// haut du nouvel écran au lieu d'un endroit imprévisible. Aucun contour ne
// s'affiche après un appui du doigt (:focus-visible).
let shownKey = null;
function screenShown(col) {
  const heading = col.querySelector('h1');
  const name = heading?.textContent.trim();
  if (app.route?.name !== 'list') document.title = name ? `${name} · Listo` : 'Listo';
  const key = location.hash;
  const changed = shownKey !== null && key !== shownKey;
  shownKey = key;
  if (!changed || !heading || isTextField(document.activeElement) || col.querySelector('.scrim')) return;
  heading.setAttribute('tabindex', '-1');
  // Sans contour tant qu'aucun autre élément ne prend le focus. (Pas à la
  // perte du focus : changer d'application ou verrouiller le téléphone le
  // fait perdre un instant, puis le rend au titre, qui montrait alors un
  // cadre bleu.)
  heading.setAttribute('data-screen-focus', '');
  const keepUntilElsewhere = (event) => {
    if (event.target === heading) return;
    heading.removeAttribute('data-screen-focus');
    document.removeEventListener('focusin', keepUntilElsewhere, true);
  };
  document.addEventListener('focusin', keepUntilElsewhere, true);
  heading.focus({ preventScroll: true });
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
    mount(renderLogin({ setupNeeded: app.setupNeeded, oidc: app.oidc, localLogin: app.localLogin, returnTo: app.afterLogin }), { withSide: false });
    return;
  }
  // Mot de passe imposé par l'Admin : à changer avant tout le reste (une
  // autorisation d'un assistant IA en attente reprend ensuite)
  if (app.user.mustChangePassword) {
    if (route.name === 'authorize') app.afterLogin = route;
    mount(renderForcedChange(), { withSide: false });
    return;
  }

  const { name, params } = route;
  if (name === 'login') {
    navigate(openingScreen(), {}, { replace: true });
    return;
  }
  if (name === 'admin' && app.user.role !== 'admin') {
    navigate('settings', {}, { replace: true });
    return;
  }
  // Écran d'une fonction coupée par la personne (Réglages › Fonctions,
  // features.js : #/notes, une note…) : le premier écran ; l'onglet
  // « Notes » de la Corbeille mène à la corbeille des listes (plus bas)
  if (!screenAllowed(name, app.data.features)) {
    navigate(openingScreen(), {}, { replace: true });
    return;
  }

  switch (name) {
    // Accueil : premier écran (décision du 23 novembre 2026), colonne large
    // sur ordinateur (tuiles sur trois colonnes). Coupé par la personne
    // (Réglages › Accueil) : #/accueil mène au premier écran choisi
    case 'home':
      if (openingScreen() !== 'home') navigate(openingScreen(), {}, { replace: true });
      else mount((onLeave) => renderHome(onLeave));
      break;
    case 'lists': mount((onLeave) => renderLists(onLeave)); break;
    // « À offrir » : liste automatique de mes réservations (gifts.js)
    case 'gifts': mount((onLeave) => renderGifts(onLeave)); break;
    case 'deadlines': mount((onLeave) => renderDeadlines(onLeave)); break;
    // Notes (étape 2) : une note s'ouvre à la place des cartes, seule à
    // l'écran (téléphone) ou dans la colonne (ordinateur, comme une liste
    // ouverte ; décision du 24 novembre 2026)
    case 'notes': mount((onLeave) => renderNotes(onLeave)); break;
    // Anciennes adresses de la corbeille des notes (#/reglages/corbeille-notes,
    // #/notes/corbeille) : l'onglet « Notes » de la Corbeille
    case 'noteTrash':
    case 'oldNoteTrash': navigate('trashTab', { tab: 'notes' }, { replace: true }); break;
    case 'note':
    case 'newNote': {
      const id = name === 'note' ? params.id : null;
      mount((onLeave) => renderNote(id, onLeave));
      break;
    }
    case 'list': mount((onLeave) => renderList(params.id, onLeave), { listId: params.id }); break;
    // Ordinateur : le formulaire s'ouvre dans une fenêtre centrée, sur
    // l'écran en cours (ou sur « Listes », sur la liste à modifier)
    case 'newList':
      if (isDesktop()) {
        if (!mountedOnPc) mount((onLeave) => renderLists(onLeave));
        openListFormPanel(null);
      } else mount((onLeave) => renderListForm(null, onLeave));
      break;
    case 'editList':
      if (isDesktop()) {
        if (mountedListId !== params.id) mount((onLeave) => renderList(params.id, onLeave), { listId: params.id });
        openListFormPanel(params.id);
      } else mount((onLeave) => renderListForm(params.id, onLeave));
      break;
    case 'settings': mount(() => renderSettings()); break;
    case 'account': mount((onLeave) => renderAccount(onLeave)); break;
    case 'about': mount(() => renderAbout()); break;
    // Session ouverte avec le fournisseur d'identité : mot de passe et double authentification
    // gérés chez le fournisseur d'identité ; ces écrans mènent à « Mon compte »
    case 'password':
      if (app.user.loginMethod === 'oidc') navigate('account', {}, { replace: true });
      else mount(() => renderPassword());
      break;
    case 'twoFactor':
      if (app.user.loginMethod === 'oidc') navigate('account', {}, { replace: true });
      else mount((onLeave) => renderTwoFactor(onLeave));
      break;
    case 'admin': mount((onLeave) => renderAdmin(params.tab, onLeave)); break;
    case 'help': mount(() => renderHelp()); break;
    // Aide ouverte sur une section précise (renvoi depuis un autre écran)
    case 'helpSection': mount(() => renderHelp(params.section)); break;
    // Corbeille (24 novembre 2026) : une page, onglets « Listes » et
    // « Notes » (trash-page.js). Onglet inconnu, ou « Notes » quand les
    // notes sont coupées : la Corbeille sans onglet dans l'adresse
    case 'trash': mount((onLeave) => renderTrash(null, onLeave)); break;
    case 'trashTab': {
      const tab = askedTrashTab(params.tab, notesOn(app.data.features));
      if (tab) mount((onLeave) => renderTrash(tab, onLeave));
      else navigate('trash', {}, { replace: true });
      break;
    }
    case 'notifications': mount((onLeave) => renderNotifications(onLeave)); break;
    // Réglages › Accueil : tuiles, ordre, Accueil coupé et premier écran
    case 'homeSettings': mount((onLeave) => renderHomeSettings(onLeave)); break;
    // Réglages › Fonctions : les fonctions utilisées (notes)
    case 'features': mount((onLeave) => renderFeatures(onLeave)); break;
    // Page Notifications (étape 4) : la cloche de l'Accueil, la tuile Compte
    case 'inbox': mount((onLeave) => renderInbox(onLeave)); break;
    case 'authorize': mount(() => renderClaudeConsent(params.id), { withSide: false }); break;
    // Assistants IA : seulement si l'accès est activé sur le serveur
    case 'claudeConnections':
      if (app.user.claudeUrl) mount(() => renderClaudeConnections());
      else navigate('account', {}, { replace: true });
      break;
    // Ancienne adresse (#/reglages/claude) : remplacée par la nouvelle
    case 'oldClaudeConnections': navigate('claudeConnections', {}, { replace: true }); break;
    // Adresse inconnue : le premier écran (l'Accueil, ou celui choisi)
    default: navigate(openingScreen(), {}, { replace: true });
  }
  readInboxOfScreen();
  // Une nouvelle version attend : nouvel essai de rechargement sur le nouvel écran
  freshness.retry();
}

// --- Démarrage ---

async function start() {
  // Réglages de l'installation gardés (sans réseau, /api/setup ne répond pas)
  const saved = readInstallation();
  if (typeof saved.lang === 'string') app.lang = saved.lang;
  if (typeof saved.currency === 'string') app.currency = saved.currency;
  try {
    const setup = await get('/api/setup', { auth: false });
    app.setupNeeded = setup.needed;
    // Langue par défaut et monnaie de l'installation (gardées pour le hors-ligne)
    app.lang = setup.lang ?? 'fr';
    app.currency = setup.currency ?? 'EUR';
    writeInstallation(app);
    // Connexion avec le fournisseur d'identité (LISTO_OIDC=on) : { name } du bouton, ou null
    app.oidc = setup.oidc ?? null;
    // Connexion par mot de passe proposée (LISTO_LOCAL_LOGIN), oui par défaut
    app.localLogin = setup.localLogin !== false;
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
        h('p', { class: 'empty__title' }, t('application.injoignable')),
        h('p', { class: 'empty__text' }, errorMessage(error)),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => location.reload() }, t('application.reessayer'))));
      return;
    }
  }
  applyLanguage();
  if (app.user && !app.user.mustChangePassword) {
    await openAccount(app.user);
    refreshData({ quiet: true, full: true });
    goLive();
    resyncPush(app.user); // notifications : abonnement rendu au serveur si besoin
  }
  startRouter(show);
}

start();

// Service worker : application installable et ouverture sans réseau (voir
// sw.js). « updateViaCache: none » : le navigateur vérifie toujours s'il
// existe une nouvelle version de sw.js.
if ('serviceWorker' in navigator) {
  // Adresse vérifiée par la politique Trusted Types de Listo (js/trusted.js)
  navigator.serviceWorker.register(scriptUrl('/sw.js'), { updateViaCache: 'none' }).catch(() => {});
}

// Notification touchée alors que Listo est déjà ouvert : le service worker
// demande d'aller à l'écran de la notification (adresse de Listo seulement,
// vérifiée par sw.js), sans recharger la page
navigator.serviceWorker?.addEventListener('message', (event) => {
  const hash = event.data?.type === 'listo-open' ? event.data.hash : null;
  if (typeof hash === 'string' && /^#\/[\w\-/%]*$/.test(hash)) location.hash = hash;
});
