// Service worker de Listo : l'application s'ouvre même sans réseau.
//
// Ce qu'il fait :
// 1. Fichiers de l'application (pages, styles, scripts, icônes) : « réseau
//    d'abord ». Avec du réseau, on prend toujours la dernière version (et on la
//    garde de côté) ; sans réseau, ou si le réseau met plus de 3 secondes à
//    répondre, on sert la copie gardée. Une nouvelle version de Listo est donc
//    prise dès qu'il y a du réseau, sans rien bloquer.
// 2. Photos des articles déjà vues (GET /api/items/<id>/photo?v=…) : gardées
//    dans un cache à part, 150 photos au plus (les plus anciennes partent
//    d'abord), vidé à la déconnexion par l'application.
// 3. Photos prises hors ligne, pas encore envoyées (/photo-locale/…) : lues
//    dans la file d'attente du téléphone (IndexedDB). L'adresse reste celle
//    de Listo : la Content-Security-Policy n'a pas besoin d'être assouplie.
// 4. Lecteur de codes-barres du mode scan (/vendor/zxing-wasm-…/, environ
//    1 Mo) : jamais copié à l'installation ; téléchargé au premier scan, puis
//    gardé dans un cache à part (« copie gardée d'abord » : son adresse
//    contient sa version, son contenu ne change jamais). Ce cache survit aux
//    mises à jour de Listo : le lecteur n'est pas retéléchargé à chaque
//    version, seulement quand sa propre version change. Ensuite, le scan
//    marche hors ligne.
//
// Ce qu'il ne fait JAMAIS : garder les réponses de l'API (/api/…, sauf les
// photos ci-dessus), le flux temps réel (/api/events), ni le lien public
// (page /p/…, données et photos /api/public/…, script js/public.js). Ces
// requêtes passent directement vers le serveur.
//
// Nouvelle version de Listo : le serveur écrit dans BUILD (ci-dessous)
// l'identifiant opaque de la version installée en servant ce fichier (voir
// server/app.js). Il change à chaque mise à jour du serveur : le navigateur
// voit un nouveau sw.js, l'installe, copie les nouveaux fichiers dans un cache
// neuf, et l'ancienne copie est effacée à l'activation. Jamais de mélange
// d'anciens et de nouveaux fichiers. Augmenter aussi de 1 le numéro au début de
// VERSION quand un fichier de l'application ou leur liste change.

const BUILD = null; // remplacé par le serveur (null : développement)
const VERSION = `v40-${BUILD ?? 'dev'}`;
const APP_CACHE = `listo-app-${VERSION}`;
const PHOTO_CACHE = 'listo-photos';
// Lecteur de codes-barres : le nom du cache suit le dossier de sa version
const VENDOR_PREFIX = '/vendor/zxing-wasm-3.1.4/';
const VENDOR_CACHE = 'listo-vendor-zxing-wasm-3.1.4';
const PHOTO_LIMIT = 150;
const NETWORK_TIMEOUT_MS = 3000;

// Fichiers de l'application (un test vérifie que la liste est complète)
const APP_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/listo.css',
  '/css/app.css',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/js/actions.js',
  '/js/api.js',
  '/js/app-height.js',
  '/js/create-reference.js',
  '/js/theme-boot.js',
  '/js/app.js',
  '/js/barcode-worker.js',
  '/js/barcode.js',
  '/js/dom.js',
  '/js/format.js',
  '/js/freshness.js',
  '/js/help-content.js',
  '/js/history.js',
  '/js/list-icons.js',
  '/js/live.js',
  '/js/localdb.js',
  '/js/photo.js',
  '/js/queue.js',
  '/js/router.js',
  '/js/search.js',
  '/js/search-row.js',
  '/js/sorting.js',
  '/js/store.js',
  '/js/swipe.js',
  '/js/tap.js',
  '/js/theme.js',
  '/js/ui.js',
  '/js/version.js',
  '/js/viewport.js',
  '/js/words.js',
  '/js/screens/account.js',
  '/js/screens/admin.js',
  '/js/screens/help.js',
  '/js/screens/list-actions.js',
  '/js/screens/list-form.js',
  '/js/screens/list.js',
  '/js/screens/lists.js',
  '/js/screens/login.js',
  '/js/screens/scan.js',
  '/js/screens/settings.js',
  '/js/screens/share.js',
];

// Installation : copie de tous les fichiers de l'application
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting(); // la nouvelle version prend la main sans attendre
  })());
});

// Activation : effacement des copies des versions précédentes
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('listo-app-') && name !== APP_CACHE) await caches.delete(name);
      // Ancienne version du lecteur de codes-barres : effacée
      if (name.startsWith('listo-vendor-') && name !== VENDOR_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

const PHOTO_PATH = /^\/api\/items\/[0-9a-f-]{36}\/photo$/;
const LOCAL_PHOTO_PATH = /^\/photo-locale\/(\d+)\/(\d+)$/;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // modifications : toujours le serveur
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Seule exception dans l'API : les photos déjà vues
    if (PHOTO_PATH.test(url.pathname)) event.respondWith(cachedPhoto(request));
    return; // tout le reste de l'API : jamais gardé
  }
  if (url.pathname.startsWith('/p/')) return; // lien public : jamais gardé

  const local = LOCAL_PHOTO_PATH.exec(url.pathname);
  if (local) {
    event.respondWith(localPhoto(local[1], Number(local[2])));
    return;
  }

  if (url.pathname.startsWith(VENDOR_PREFIX)) {
    event.respondWith(vendorFile(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }
  if (APP_FILES.includes(url.pathname)) event.respondWith(networkFirst(request, url.pathname));
});

// Réseau d'abord ; copie gardée si pas de réseau ou réseau trop lent
async function networkFirst(request, key) {
  const cache = await caches.open(APP_CACHE);
  const fromNetwork = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(key, response.clone());
    return response;
  });
  fromNetwork.catch(() => {}); // une panne réseau tardive n'est pas une erreur
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'timeout'));
  try {
    const first = await Promise.race([fromNetwork, timeout]);
    if (first !== 'timeout') return first;
    return (await cache.match(key)) ?? (await fromNetwork);
  } catch {
    return (await cache.match(key)) ?? Response.error();
  }
}

// Lecteur de codes-barres : copie gardée, sinon réseau (et copie gardée si
// réussie). Clé : l'adresse sans paramètre.
async function vendorFile(request) {
  const cache = await caches.open(VENDOR_CACHE);
  const key = new URL(request.url).pathname;
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200) await cache.put(key, response.clone());
  return response;
}

// Photo déjà vue : copie gardée, sinon réseau (et copie gardée si réussie)
async function cachedPhoto(request) {
  const cache = await caches.open(PHOTO_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - PHOTO_LIMIT))) await cache.delete(old);
  }
  return response;
}

// Photo pas encore envoyée : lue dans la file d'attente du compte (IndexedDB)
async function localPhoto(userId, seq) {
  const notFound = () => new Response('', { status: 404 });
  try {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(`listo-u${userId}`);
      // Base absente : on ne la crée pas ici
      open.onupgradeneeded = () => open.transaction.abort();
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const entry = await new Promise((resolve, reject) => {
      const get = db.transaction('queue').objectStore('queue').get(seq);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    if (!entry?.blob) return notFound();
    return new Response(entry.blob, { headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return notFound();
  }
}
