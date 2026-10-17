// Application Express : les routes du serveur.
//
// Ce fichier construit l'application sans la démarrer, pour que les tests
// puissent l'utiliser directement. Le démarrage est dans index.js.

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config.js';
import { deriveKeys } from './secrets.js';
import { createLimiter } from './limiter.js';
import { createAudit } from './audit.js';
import {
  loadSession, requireAuth, requirePasswordChanged, requireSameOrigin, createPendingLogins, purgeExpiredSessions,
} from './auth.js';
import { publicAuthRoutes, logoutRoute } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { adminRoutes } from './routes/admin.js';
import { listRoutes } from './routes/lists.js';
import { photoRoutes } from './routes/photos.js';
import { createPhotoStore, createUploadCounter } from './photos.js';
import { createEventHub, sameSiteOnly } from './events.js';

// Dossier des fichiers de l'interface (HTML, CSS, JavaScript, icônes)
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

// Politique de sécurité du contenu (CSP), envoyée avec chaque réponse : le
// navigateur n'accepte que les fichiers venant de Listo lui-même. Aucun script
// ni style écrit directement dans la page, aucune ressource d'un autre site,
// aucune image « data: ». Une injection de code serait donc bloquée par le
// navigateur, même si elle passait ailleurs.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Options :
// - db : base ouverte (obligatoire)
// - config : configuration (voir config.js)
// - masterKey : clé de secrets/secret.key
// - setupCode : code de démarrage, si aucun compte n'existe encore
// - now : horloge (les tests la remplacent pour « avancer le temps »)
// - log : où écrire le journal de sécurité (par défaut : docker logs)
// - journalFile : écriture du journal dans un fichier (voir audit.js)
// - photosDir : dossier des photos (par défaut data/photos, à côté de la base)
// - eventOptions : réglages du temps réel (les tests raccourcissent le délai
//   du signal de maintien)
export function createApp({
  db,
  config = loadConfig({}),
  masterKey = crypto.randomBytes(32),
  setupCode = null,
  now = Date.now,
  log,
  journalFile = null,
  photosDir = path.join(path.dirname(config.dbPath), 'photos'),
  eventOptions = {},
}) {
  // « ctx » regroupe tout ce dont les routes ont besoin
  const ctx = {
    db,
    config,
    now,
    keys: deriveKeys(masterKey),
    setup: { code: setupCode },
    limiter: createLimiter({ now }),
    pending: createPendingLogins(now),
    audit: createAudit({ now, write: log, file: journalFile }),
    photos: createPhotoStore(photosDir),
    uploads: createUploadCounter({ now }),
  };
  // Temps réel (flux SSE) : connexions ouvertes et envoi des messages
  ctx.events = createEventHub(ctx, eventOptions);

  const app = express();
  app.locals.ctx = ctx;

  // Ne pas annoncer « Express » dans les réponses
  app.disable('x-powered-by');

  // En-têtes de sécurité sur toutes les réponses
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',     // pas de « devinette » du type de fichier
      'Referrer-Policy': 'no-referrer',        // l'adresse de Listo n'est pas transmise ailleurs
      'X-Frame-Options': 'DENY',               // Listo ne peut pas être affiché dans un cadre
    });
    next();
  });

  // Listo est derrière un seul proxy (Nginx Proxy Manager) : on ne croit son
  // en-tête X-Forwarded-For que pour un seul intermédiaire, ce qui donne la
  // vraie adresse IP du téléphone (utile pour limiter les tentatives).
  app.set('trust proxy', 1);

  // Route de surveillance : répond « ok » si le serveur et la base répondent.
  // Aucune donnée n'est renvoyée.
  app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'error' });
    }
  });

  // --- API ---
  const api = express.Router();
  // Réponses de l'API jamais gardées en cache
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(requireSameOrigin(config.publicUrl));    // protection CSRF
  // Corps des requêtes en JSON : jusqu'à 200 ko pour un lot d'opérations
  // (file d'attente du téléphone), 20 ko pour tout le reste
  api.use('/ops', express.json({ limit: '200kb' }));
  api.use(express.json({ limit: '20kb' }));
  api.use(loadSession(ctx));                       // qui est connecté ?

  // Routes ouvertes à tous : premier Admin et connexion
  api.use(publicAuthRoutes(ctx));

  // Tout le reste exige d'être connecté, avec un mot de passe à jour
  api.use(requireAuth);
  api.use(requirePasswordChanged);
  api.use(logoutRoute(ctx));
  api.use(meRoutes(ctx));
  api.use(listRoutes(ctx));
  api.use(photoRoutes(ctx));
  // Flux temps réel : « la liste X a changé » (voir events.js)
  api.get('/events', sameSiteOnly(config.publicUrl), (req, res) => ctx.events.connect(req, res));
  api.use('/admin', adminRoutes(ctx));

  // Route inconnue
  api.use((req, res) => res.status(404).json({ error: 'Route inconnue.' }));

  // Erreurs : JSON mal formé, ou problème inattendu (sans détail technique
  // dans la réponse ; le détail va dans les journaux du serveur)
  api.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête mal formée.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse.' });
    console.error('Erreur inattendue :', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  app.use('/api', api);

  // Fichiers de l'interface. Ils sont revalidés à chaque chargement (le
  // navigateur demande « ai-je la dernière version ? »), pour qu'une mise à
  // jour de Listo soit vue tout de suite.
  app.use(express.static(PUBLIC_DIR, { cacheControl: true, maxAge: 0 }));

  // Ménage régulier : sessions expirées, compteurs de tentatives et d'envois
  // périmés, listes et articles supprimés depuis plus de 30 jours (avec leurs
  // photos).
  // « unref » : ce minuteur n'empêche pas Listo de s'arrêter.
  const cleanup = () => {
    purgeExpiredSessions(ctx);
    ctx.lists.purgeDeleted();
    ctx.limiter.prune();
    ctx.uploads.prune();
    ctx.pending.prune();
  };
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();

  return app;
}
