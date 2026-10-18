// Temps réel côté téléphone : écoute du flux GET /api/events (Server-Sent
// Events) et filets de sécurité.
//
// - Un message « la liste X a changé » déclenche une synchronisation
//   (/api/sync?since=…). Plusieurs messages rapprochés n'en déclenchent
//   qu'une (regroupement de 300 ms).
// - Le flux n'est ouvert que lorsque l'application est au premier plan :
//   en arrière-plan, il est fermé (économie de batterie), puis rouvert au
//   retour, avec une synchronisation.
// - Coupure : reconnexion avec un délai croissant (1 s, 2 s, 4 s… jusqu'à
//   30 s, un peu au hasard pour que deux téléphones ne reviennent pas en même
//   temps), après une synchronisation qui rattrape ce qui a été manqué.
// - Toutes les 60 secondes au premier plan : synchronisation de sécurité.
// - Flux rouvert après une coupure (redémarrage du serveur après une mise à
//   jour, par exemple) : onReconnect est appelée (voir freshness.js).

export const GROUP_DELAY_MS = 300;
export const POLL_MS = 60 * 1000;
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30 * 1000;

// Délai avant la tentative de reconnexion n° attempt (0, 1, 2…), entre 80 %
// et 120 % du délai de base (calcul pur, testé automatiquement)
export function reconnectDelay(attempt, random = Math.random) {
  const base = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.min(attempt, 10));
  return Math.round(base * (0.8 + 0.4 * random()));
}

// Regroupe des appels rapprochés : fn n'est appelée qu'une fois, wait ms
// après le premier appel du groupe (calcul pur, testé automatiquement)
// (timers : seulement pour les tests ; setTimeout doit être appelé tel quel,
// pas comme méthode d'un autre objet, sinon le navigateur le refuse)
export function groupCalls(fn, wait, timers = { setTimeout: (callback, ms) => setTimeout(callback, ms) }) {
  let pending = null;
  return () => {
    if (pending) return;
    pending = timers.setTimeout(() => {
      pending = null;
      fn();
    }, wait);
  };
}

let running = false;
let source = null;         // flux ouvert (EventSource)
let attempt = 0;           // nombre de reconnexions ratées d'affilée
let retryTimer = null;
let pollTimer = null;
let sync = () => {};       // synchronisation fournie par app.js
let scheduleSync = () => {};
let reconnected = () => {};

// Démarre le temps réel (compte connecté). sync({ full }) : synchronisation.
// onReconnect : appelée quand le flux revient après une coupure.
export function startLive(syncFn, { onReconnect = () => {} } = {}) {
  stopLive();
  running = true;
  sync = syncFn;
  reconnected = onReconnect;
  scheduleSync = groupCalls(() => sync({ full: false }), GROUP_DELAY_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') sync({ full: false });
  }, POLL_MS);
  open();
}

// Arrête tout (déconnexion, session expirée)
export function stopLive() {
  running = false;
  closeSource();
  clearTimeout(retryTimer);
  clearInterval(pollTimer);
  retryTimer = null;
  pollTimer = null;
  attempt = 0;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('online', onOnline);
}

function open() {
  if (!running || source || document.visibilityState === 'hidden') return;
  source = new EventSource('/api/events');
  source.addEventListener('ready', () => {
    // Flux ouvert. Après une coupure, on rattrape ce qui a été manqué.
    if (attempt > 0) {
      sync({ full: false });
      reconnected();
    }
    attempt = 0;
  });
  source.addEventListener('list', () => scheduleSync());
  source.addEventListener('error', () => {
    // Coupure (réseau, redémarrage du serveur, session expirée…) : le
    // navigateur réessaierait tout seul, sans délai croissant ; on reprend la main.
    closeSource();
    retryLater();
  });
}

function closeSource() {
  if (source) {
    source.close();
    source = null;
  }
}

function retryLater() {
  if (!running || retryTimer) return;
  const delay = reconnectDelay(attempt);
  attempt += 1;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    // Une synchronisation d'abord : si la session a expiré, elle mène à
    // l'écran de connexion (et stopLive) au lieu de réessayer en boucle.
    await sync({ full: false });
    open();
  }, delay);
}

// Retour au premier plan : synchronisation complète et flux rouvert ;
// passage en arrière-plan : flux fermé
function onVisibility() {
  if (!running) return;
  if (document.visibilityState === 'visible') {
    sync({ full: true });
    clearTimeout(retryTimer);
    retryTimer = null;
    attempt = 0;
    open();
  } else {
    closeSource();
  }
}

// Le réseau revient : on n'attend pas la fin du délai de reconnexion
function onOnline() {
  if (!running || source) return;
  clearTimeout(retryTimer);
  retryTimer = null;
  attempt = 0;
  sync({ full: false });
  open();
}
