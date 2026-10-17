// Service worker de Listo — version minimale (étape 5).
//
// Il sert seulement à rendre l'application installable sur l'écran d'accueil
// avec tous les navigateurs. Il ne met RIEN en cache : chaque requête part
// normalement vers le réseau. Le vrai fonctionnement hors ligne (cache de
// l'application, file d'attente) arrive à l'étape 7.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Laisse passer toutes les requêtes, sans les modifier ni les garder
self.addEventListener('fetch', () => {});
