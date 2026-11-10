// Notifications push (LISTO_PUSH=on ; désactivées par défaut).
//
// Principe : quand une personne active les notifications sur un appareil,
// son navigateur crée un « abonnement » auprès du service de push de son
// fabricant (Google, Apple, Mozilla, Microsoft) : une adresse (endpoint) et
// deux clés. Listo garde cet abonnement, lié au compte et à la session de
// l'appareil. Pour notifier, Listo chiffre un court message pour cet appareil
// (server/webpush.js) et l'envoie à cette adresse ; le service le remet à
// l'appareil sans pouvoir le lire. Il voit seulement l'heure, la taille et
// l'appareil destinataire : c'est une exception (voulue, désactivable) au
// principe « aucune donnée ailleurs que sur votre serveur ».
//
// Le serveur appelle donc une adresse fournie par un téléphone : risque
// qu'on lui fasse appeler une adresse interne (SSRF). Garde-fous :
// - liste fermée de services connus (ALLOWED_HOSTS, ALLOWED_SUFFIXES),
//   relevée dans la documentation officielle de chacun ; https seulement,
//   port standard, aucune adresse IP écrite en chiffres, aucun identifiant
//   dans l'adresse ; vérifié à l'abonnement ET à chaque envoi ;
// - aucune redirection suivie, délai de 10 secondes, réponse lue sur 4 ko au
//   plus puis abandonnée ;
// - un service qui répond 404 ou 410 (abonnement expiré) : l'abonnement est
//   effacé ;
// - journaux : des nombres seulement (jamais une adresse ni une clé).
//
// Clés VAPID : une paire créée au premier démarrage (avec LISTO_PUSH=on)
// dans secrets/vapid.json, jamais dans le dépôt, ni dans une variable
// d'environnement, ni dans les journaux. Perdues : nouvelle paire au
// démarrage suivant ; chaque appareil se réabonne tout seul à la prochaine
// ouverture de Listo (l'autorisation déjà donnée suffit).

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  encryptMessage, fromB64url, toB64url, isP256PublicKey, generateVapidKeys, vapidKeyObject, vapidAuthorization, MAX_PLAINTEXT_BYTES,
} from './webpush.js';

// --- Services de push autorisés ---
// Sources (documentation officielle, relevée le 10 novembre 2026) :
// - Google (Chrome, Edge sur Android, navigateurs Chromium) :
//   « https://fcm.googleapis.com/fcm/send/… » (blog de Chrome,
//   developer.chrome.com/blog/web-push-interop-wins) ;
// - Mozilla (Firefox) : updates.push.services.mozilla.com et
//   push.services.mozilla.com, les deux seuls noms cités par la documentation
//   d'autopush (github.com/mozilla-services/autopush-rs, docs/src/http.md) ;
// - Apple (Safari sur Mac, iPhone et iPad) : « allow access for
//   https://*.push.apple.com » (developer.apple.com, « Sending web push
//   notifications in web apps and browsers ») ;
// - Microsoft (Edge sur Windows) : le domaine « notify.windows.com », le
//   sous-domaine pouvant changer (documentation de WNS, learn.microsoft.com,
//   « Windows Push Notification Services overview »).
export const ALLOWED_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com'];
export const ALLOWED_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export const MAX_ENDPOINT = 1024;
export const MAX_DEVICES = 10;          // appareils par compte (le plus ancien laisse sa place)
export const TIMEOUT_MS = 10 * 1000;    // délai d'un envoi
export const MAX_RESPONSE_BYTES = 4096; // réponse d'un service : lue sur 4 ko au plus
export const MAX_PAYLOAD_BYTES = 4096;  // corps chiffré envoyé : 4 ko au plus
export const CONCURRENCY = 4;           // envois simultanés au plus
const HOUR = 60 * 60 * 1000;

// Adresse d'abonnement acceptable ? Renvoie l'adresse normalisée, ou null.
export function checkEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;               // https seulement
  if (url.username || url.password) return null;            // jamais d'identifiant
  if (url.port !== '') return null;                         // port standard (443) seulement
  if (url.hash) return null;
  const host = url.hostname;
  if (!host || host.startsWith('[') || net.isIP(host)) return null; // aucune adresse IP (v4 ou v6)
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..')) return null;
  const allowed = ALLOWED_HOSTS.includes(host)
    || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix) && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host.slice(0, -suffix.length)));
  if (!allowed) return null;
  return url.href.length <= MAX_ENDPOINT ? url.href : null;
}

// Clés d'un abonnement acceptables ? { p256dh, auth } en base64url : clé
// publique P-256 de 65 octets (point sur la courbe) et secret de 16 octets.
export function checkKeys(keys) {
  if (!keys || typeof keys !== 'object') return null;
  const p256dh = fromB64url(keys.p256dh);
  const auth = fromB64url(keys.auth);
  if (!p256dh || !isP256PublicKey(p256dh)) return null;
  if (!auth || auth.length !== 16) return null;
  return { p256dh: toB64url(p256dh), auth: toB64url(auth) };
}

// --- Clés VAPID (secrets/vapid.json) ---

// Fonction coupée (LISTO_PUSH absente ou différente de « on ») : rien n'est
// lu ni créé, renvoie null. Sinon renvoie { keys, created }.
export function preparePushKeys(config) {
  if (!config.push) return null;
  return loadOrCreateVapidKeys(config.vapidPath);
}

export function loadOrCreateVapidKeys(file) {
  if (fs.existsSync(file)) {
    let keys;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      keys = { publicKey: data.publicKey, privateKey: data.privateKey };
      vapidKeyObject(keys); // vérifie la paire
    } catch {
      // Fichier abîmé : on s'arrête plutôt que de le remplacer en silence
      throw new Error(`Le fichier ${file} est invalide. Restaurez sa copie de sauvegarde, ou effacez-le pour créer de nouvelles clés (chaque appareil devra alors réactiver les notifications, ou se réabonnera tout seul à la prochaine ouverture de Listo).`);
    }
    return { keys, created: false };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const keys = generateVapidKeys();
  fs.writeFileSync(file, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return { keys, created: true };
}

// --- Message ---

// Message d'une notification, au format « Declarative Web Push » (norme du
// W3C, reprise par Safari 18.4 et après) : un iPhone ou un Mac récent
// l'affiche lui-même ; les autres navigateurs le passent au service worker
// (public/sw.js), qui lit le même JSON. title et navigate sont obligatoires.
// - navigate : adresse de Listo à ouvrir quand on touche la notification ;
// - tag : une nouvelle notification de même tag remplace la précédente.
// Le texte est raccourci au besoin : le message reste sous 4 ko chiffré.
export function buildMessage({ title, body = '', navigate, tag = null }) {
  const notification = { title: String(title).slice(0, 120), lang: 'fr-FR', dir: 'ltr', navigate };
  if (body) notification.body = String(body);
  if (tag) notification.tag = String(tag);
  let text = JSON.stringify({ web_push: 8030, notification });
  while (Buffer.byteLength(text) > MAX_PLAINTEXT_BYTES && notification.body) {
    notification.body = `${notification.body.slice(0, Math.max(0, notification.body.length - 50))}…`;
    if (notification.body.length <= 1) delete notification.body;
    text = JSON.stringify({ web_push: 8030, notification });
  }
  if (Buffer.byteLength(text) > MAX_PLAINTEXT_BYTES) throw new Error('Notification trop longue.');
  return text;
}

// --- Envoi ---

// Envoi réel vers un service de push. Aucune redirection suivie, aucun
// cookie, délai de 10 s, réponse lue sur 4 ko au plus puis abandonnée.
// Renvoie { status } (0 si le service n'a pas répondu).
export async function fetchPush(endpoint, { headers, body, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('délai dépassé')), timeoutMs);
  try {
    const res = await fetchImpl(endpoint, { method: 'POST', redirect: 'manual', credentials: 'omit', signal: controller.signal, headers, body });
    // Réponse : rien n'en est gardé ; lue sur 4 ko au plus pour libérer la connexion
    const reader = res.body?.getReader();
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    return { status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

// Options :
// - keys : clés VAPID { publicKey, privateKey } (base64url)
// - request(endpoint, { headers, body }) : envoi (fetchPush ; les tests la
//   remplacent : aucun vrai réseau)
// - log : ligne courte dans les journaux, sans adresse ni clé
export function createPushService(ctx, { keys, request = fetchPush, log = (line) => console.warn(line) }) {
  const { db } = ctx;
  const signingKey = vapidKeyObject(keys);
  const subject = new URL(ctx.config.publicUrl).origin; // jamais une adresse e-mail
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    mine: db.prepare('SELECT id FROM push_subscriptions WHERE session_id = ?'),
    remove: db.prepare('DELETE FROM push_subscriptions WHERE session_id = ?'),
    takeOver: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? OR session_id = ?'),
    insert: db.prepare('INSERT INTO push_subscriptions (user_id, session_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    // Au-delà de 10 appareils, les plus anciens laissent leur place
    trim: db.prepare(`DELETE FROM push_subscriptions WHERE user_id = :userId AND id NOT IN (
      SELECT id FROM push_subscriptions WHERE user_id = :userId ORDER BY created_at DESC, id DESC LIMIT :max)`),
    // Relu juste avant chaque envoi : compte actif, session valable
    target: db.prepare(`SELECT push_subscriptions.* FROM push_subscriptions
      JOIN users ON users.id = push_subscriptions.user_id AND users.active = 1
      JOIN sessions ON sessions.id = push_subscriptions.session_id AND sessions.expires_at > ?
      WHERE push_subscriptions.id = ?`),
    ofUser: db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ?').pluck(),
    drop: db.prepare('DELETE FROM push_subscriptions WHERE id = ?'),
    sent: db.prepare('UPDATE push_subscriptions SET last_sent_at = ? WHERE id = ?'),
  };

  // Jeton VAPID gardé une heure par service (Apple demande de ne pas le
  // renouveler plus d'une fois par heure ; il vaut 12 heures)
  const tokens = new Map(); // origine du service -> { value, until }
  function authorization(endpoint) {
    const origin = new URL(endpoint).origin;
    const cached = tokens.get(origin);
    if (cached && cached.until > ctx.now()) return cached.value;
    const value = vapidAuthorization({ endpoint, subject, publicKey: keys.publicKey, key: signingKey, now: ctx.now() });
    tokens.set(origin, { value, until: ctx.now() + HOUR });
    return value;
  }

  // File d'envoi : 4 envois simultanés au plus ; idle() attend la fin
  const waiting = [];
  let running = 0;
  let idleWaiters = [];
  function pump() {
    while (running < CONCURRENCY && waiting.length) {
      const job = waiting.shift();
      running += 1;
      job().finally(() => {
        running -= 1;
        pump();
        if (!running && !waiting.length) {
          for (const resolve of idleWaiters) resolve();
          idleWaiters = [];
        }
      });
    }
  }
  function enqueue(job) {
    return new Promise((resolve) => {
      waiting.push(() => job().then(resolve, () => resolve('failed')));
      pump();
    });
  }
  const idle = () => (running || waiting.length ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve());

  // Envoie un message à UN abonnement. Renvoie 'sent', 'expired' (effacé),
  // 'refused' (le service a refusé), 'failed' (pas de réponse) ou 'gone'
  // (abonnement, compte ou session disparus entre-temps).
  async function deliver(subscriptionId, message, { ttl = 12 * 3600, urgency = 'normal' } = {}) {
    const sub = q.target.get(nowIso(), subscriptionId);
    if (!sub) return 'gone';
    const endpoint = checkEndpoint(sub.endpoint);
    if (!endpoint) { // adresse devenue non autorisée : jamais appelée
      q.drop.run(sub.id);
      return 'gone';
    }
    const body = encryptMessage({ plaintext: message, uaPublic: fromB64url(sub.p256dh), authSecret: fromB64url(sub.auth) });
    if (body.length > MAX_PAYLOAD_BYTES) throw new Error('message trop long');
    let status;
    try {
      ({ status } = await request(endpoint, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          TTL: String(ttl),
          Urgency: urgency,
          Authorization: authorization(endpoint),
        },
        body,
      }));
    } catch {
      log('Notifications : un service de push n\'a pas répondu.');
      return 'failed';
    }
    if (status >= 200 && status < 300) {
      q.sent.run(nowIso(), sub.id);
      return 'sent';
    }
    if (status === 404 || status === 410) {
      q.drop.run(sub.id);
      log(`Notifications : abonnement expiré retiré (HTTP ${status}).`);
      return 'expired';
    }
    log(`Notifications : envoi refusé par le service de push (HTTP ${status}).`);
    return 'refused';
  }

  return {
    publicKey: keys.publicKey,

    // Abonne l'appareil de cette session (remplace son abonnement précédent ;
    // une adresse déjà connue change de session). Renvoie null si
    // l'abonnement est refusé.
    subscribe(user, sessionId, body) {
      const endpoint = checkEndpoint(body?.endpoint);
      const keysOk = checkKeys(body?.keys);
      if (!endpoint || !keysOk) return null;
      db.transaction(() => {
        q.takeOver.run(endpoint, sessionId);
        q.insert.run(user.id, sessionId, endpoint, keysOk.p256dh, keysOk.auth, nowIso());
        q.trim.run({ userId: user.id, max: MAX_DEVICES });
      })();
      return true;
    },

    // Désabonne l'appareil de cette session
    unsubscribe(sessionId) {
      return q.remove.run(sessionId).changes > 0;
    },

    // Cet appareil (session) est-il abonné ?
    subscribed(sessionId) {
      return Boolean(q.mine.get(sessionId));
    },

    // Notification test, vers l'appareil de cette session seulement
    async sendTest(sessionId) {
      const sub = q.mine.get(sessionId);
      if (!sub) return 'none';
      const message = buildMessage({
        title: 'Listo',
        body: 'Notification test : les notifications arrivent bien sur cet appareil.',
        navigate: `${subject}/#/reglages/notifications`,
        tag: 'listo-test',
      });
      return enqueue(() => deliver(sub.id, message, { ttl: 300 }));
    },

    // Envoie un message à tous les appareils d'un compte (étapes suivantes)
    sendToUser(userId, message, options) {
      return Promise.all(q.ofUser.all(userId).map((id) => enqueue(() => deliver(id, message, options))));
    },

    idle,
  };
}
