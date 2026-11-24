// Notifications push, côté téléphone (et ordinateur).
//
// - État de cet appareil (deviceState) : fonction coupée sur le serveur,
//   navigateur incompatible, iPhone ou iPad pas encore ouvert depuis l'écran
//   d'accueil, autorisation refusée, activées ou désactivées.
// - Activer (enablePush) : la demande d'autorisation du navigateur ne se fait
//   QUE là, après un appui sur l'interrupteur, jamais au chargement.
// - Désactiver (disablePush), et à la déconnexion (forgetPush) : l'abonnement
//   du navigateur est retiré, celui du serveur aussi.
// - Au démarrage (resyncPush) : si cet appareil était abonné par ce compte et
//   que l'autorisation est déjà donnée, l'abonnement est redonné au serveur
//   (nouvelle session après une expiration, clés du serveur changées). Aucune
//   demande d'autorisation : on ne fait rien si elle n'est pas déjà accordée.
//
// Le navigateur crée l'abonnement auprès du service de push de son
// fabricant ; le serveur ne l'accepte que pour des services connus.
//
// Préférences du compte (valables pour la page Notifications et sur tous
// ses appareils, même sans LISTO_PUSH) et listes silencées : gardées en mémoire après chaque lecture de GET /api/push,
// pour que le menu d'une liste sache dire « Couper » ou « Réactiver les
// notifications de cette liste » sans attendre le réseau.

import { get, put, post, del } from './api.js';
import { t } from './i18n.js';

// Dernier état connu du serveur (préférences, listes silencées)
const known = { settings: null, muted: new Set(), mutedNotes: new Set() };
function remember(server) {
  if (server?.settings) known.settings = server.settings;
  if (Array.isArray(server?.mutedLists)) known.muted = new Set(server.mutedLists);
  if (Array.isArray(server?.mutedNotes)) known.mutedNotes = new Set(server.mutedNotes);
  return server;
}
export const pushSettings = () => known.settings;
export const isListPushMuted = (listId) => known.muted.has(listId);
export const isNotePushMuted = (noteId) => known.mutedNotes.has(noteId);

// Préférences : { changes?, wishes?, sharing?, detail? } (vrai ou faux)
export async function savePushSettings(changes) {
  return remember(await put('/api/push/settings', changes)).settings;
}

// Menu de la liste : « Couper les notifications » / « Réactiver les notifications »
export async function setListPushMuted(listId, muted) {
  remember(await put(`/api/push/mutes/${encodeURIComponent(listId)}`, { muted }));
}

// Menu de la note : « Couper les notifications » / « Réactiver les notifications »
export async function setNotePushMuted(noteId, muted) {
  remember(await put(`/api/push/note-mutes/${encodeURIComponent(noteId)}`, { muted }));
}

// Relit l'état du serveur (préférences, listes silencées) ; sans réseau :
// rien. Sans notifications push sur le serveur, les mêmes réglages valent
// pour la page Notifications (GET /api/push/settings, étape 4).
export async function loadPushState(user) {
  if (!user) return null;
  try {
    return remember(await get(user.push ? '/api/push' : '/api/push/settings'));
  } catch {
    return null;
  }
}

// Compte qui a activé les notifications sur cet appareil (pour ne jamais
// rendre l'abonnement d'un compte à un autre compte connecté ensuite)
const OWNER_KEY = 'listo-push-compte';

function readOwner() {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
function writeOwner(userId) {
  try {
    if (userId === null) localStorage.removeItem(OWNER_KEY);
    else localStorage.setItem(OWNER_KEY, String(userId));
  } catch {
    // stockage indisponible : sans conséquence
  }
}

// iPhone ou iPad (un iPad récent se présente comme un Mac, mais tactile)
export function isIos(nav = navigator) {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

// Listo ouvert depuis son icône (application installée), pas dans un onglet
export function isInstalled(win = window) {
  return win.matchMedia?.('(display-mode: standalone)').matches === true || win.navigator.standalone === true;
}

// Le navigateur sait-il recevoir des notifications push ?
export function browserSupportsPush(win = window) {
  return Boolean(win.isSecureContext && 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win); // technique : noms d'API du navigateur
}

// Clé publique du serveur (base64url) -> octets, comme l'attend subscribe()
function keyBytes(base64url) {
  const text = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

// L'abonnement du navigateur a-t-il été fait avec cette clé du serveur ?
function sameKey(subscription, base64url) {
  const key = subscription.options?.applicationServerKey;
  if (!key) return true; // inconnu : on le garde
  const a = new Uint8Array(key);
  const b = keyBytes(base64url);
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

async function browserSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return { registration, subscription: await registration.pushManager.getSubscription() };
}

// Abonnement du navigateur avec la clé du serveur (refait si la clé a changé)
async function subscribeBrowser(publicKey) {
  const { registration, subscription } = await browserSubscription();
  if (subscription && sameKey(subscription, publicKey)) return subscription;
  if (subscription) await subscription.unsubscribe();
  // userVisibleOnly : chaque message affiche une notification (exigé par
  // Chrome et Safari ; Listo n'envoie jamais de message « silencieux »)
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

// État de cet appareil. user : le compte connecté (user.push : fonction
// activée sur le serveur). Renvoie { state, publicKey? } avec state parmi :
// 'server-off', 'ios-install', 'unsupported', 'denied', 'offline', 'on', 'off'.
export async function deviceState(user) {
  if (!user?.push) return { state: 'server-off' };
  if (isIos() && !isInstalled()) return { state: 'ios-install' };
  if (!browserSupportsPush()) return { state: 'unsupported' };
  let server;
  try {
    server = remember(await get('/api/push'));
  } catch {
    return { state: 'offline' };
  }
  if (Notification.permission === 'denied') return { state: 'denied', publicKey: server.publicKey };
  let subscription = null;
  try {
    ({ subscription } = await browserSubscription());
  } catch {
    subscription = null;
  }
  const on = server.device.subscribed && Notification.permission === 'granted' && subscription !== null;
  return { state: on ? 'on' : 'off', publicKey: server.publicKey };
}

// Le navigateur n'a pas pu s'inscrire auprès de son service de
// notifications (Google pour Chrome et Brave, Microsoft pour Edge, Mozilla
// pour Firefox, Apple pour Safari) : constat du 17 novembre 2026 sur un
// ordinateur, « Une erreur inattendue est survenue » sans autre explication.
// Le message dit maintenant la cause probable, ce qu'il faut vérifier, et
// le détail donné par le navigateur (son nom d'erreur, son texte).
export class PushSetupError extends Error {}
export function pushSetupMessage(error) {
  const name = typeof error?.name === 'string' ? error.name : '';
  const text = typeof error?.message === 'string' ? error.message : '';
  const detail = [name, text].filter(Boolean).join(' : ').slice(0, 160);
  const service = name === 'AbortError' || /push service|registration failed/i.test(text);
  const base = service
    ? t('push.erreur.service')
    : name === 'NotAllowedError'
      ? t('push.erreur.refusees')
      : t('push.erreur.autre');
  return detail ? t('push.erreur.detail', { message: base, detail }) : base;
}

// Active les notifications sur cet appareil (après un appui seulement).
// Renvoie le nouvel état ('on', 'denied' ou 'off'). Échec de l'inscription
// du navigateur : PushSetupError, avec un message en clair.
export async function enablePush(user, publicKey) {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off'; // fenêtre fermée sans choisir
  let subscription;
  try {
    subscription = await subscribeBrowser(publicKey);
  } catch (error) {
    throw new PushSetupError(pushSetupMessage(error));
  }
  await put('/api/push/subscription', subscription.toJSON());
  writeOwner(user.id);
  return 'on';
}

// Désactive les notifications sur cet appareil
export async function disablePush() {
  writeOwner(null);
  try {
    const { subscription } = await browserSubscription();
    await subscription?.unsubscribe();
  } finally {
    await del('/api/push/subscription');
  }
}

// Déconnexion : l'abonnement du navigateur est retiré (le serveur efface le
// sien avec la session). Sans attendre plus de 2 secondes.
export async function forgetPush() {
  writeOwner(null);
  if (!browserSupportsPush()) return;
  const work = browserSubscription().then(({ subscription }) => subscription?.unsubscribe()).catch(() => {});
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

// Au démarrage : rend son abonnement au serveur si besoin (voir plus haut)
export async function resyncPush(user) {
  await loadPushState(user); // préférences et listes silencées, pour les menus
  try {
    if (!user?.push || !browserSupportsPush() || Notification.permission !== 'granted') return;
    if (readOwner() !== String(user.id)) return;
    const { subscription } = await browserSubscription();
    if (!subscription) return;
    const server = remember(await get('/api/push'));
    if (server.device.subscribed && sameKey(subscription, server.publicKey)) return;
    const fresh = await subscribeBrowser(server.publicKey);
    await put('/api/push/subscription', fresh.toJSON());
  } catch {
    // hors ligne ou refus : on réessaiera à la prochaine ouverture
  }
}

// Notification test (vers cet appareil seulement)
export const sendTestPush = () => post('/api/push/test');
