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
import { createShareService, createPublicAccess } from './shares.js';
import { shareRoutes } from './routes/shares.js';
import { publicRoutes } from './routes/public.js';
import { createBackups } from './backup.js';

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

// Fonctions du navigateur que Listo n'utilise jamais : interdites à la page
// (Permissions-Policy). L'appareil photo n'est pas listé : la prise de photo
// passe par le sélecteur de fichier du téléphone, qui doit rester libre.
export const PERMISSIONS_POLICY = [
  'accelerometer=()', 'autoplay=()', 'display-capture=()', 'geolocation=()',
  'gyroscope=()', 'hid=()', 'magnetometer=()', 'microphone=()', 'midi=()', 'payment=()',
  'serial=()', 'usb=()', 'xr-spatial-tracking=()',
].join(', ');

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
// - backupDir : dossier des sauvegardes nocturnes (par défaut data/backups,
//   à côté de la base). La sauvegarde est programmée par index.js.
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
  backupDir = path.join(path.dirname(config.dbPath), 'backups'),
}) {
  // « ctx » regroupe tout ce dont les routes ont besoin
  const ctx = {
    db,
    config,
    now,
    keys: deriveKeys(masterKey),
    setup: { code: setupCode },
    limiter: createLimiter({ now }),
    pending: createPendingLogins(now, config),
    audit: createAudit({ now, write: log, file: journalFile }),
    photos: createPhotoStore(photosDir),
    uploads: createUploadCounter({ now }),
  };
  // Temps réel (flux SSE) : connexions ouvertes et envoi des messages
  ctx.events = createEventHub(ctx, eventOptions);
  // Liens publics (étape 10) et cookies de consultation des visiteurs
  ctx.publicAccess = createPublicAccess(now);
  ctx.shares = createShareService(ctx);
  // Sauvegarde nocturne de la base (voir backup.js)
  ctx.backups = createBackups({ db, dir: backupDir, now, audit: ctx.audit });

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
      'Permissions-Policy': PERMISSIONS_POLICY, // ni position, ni micro, ni paiement…
      // Listo n'a rien à faire dans un moteur de recherche : aucune page, aucun
      // fichier ni réponse de l'API n'est indexé ni suivi
      'X-Robots-Tag': 'noindex, nofollow',
      // Isolement vis-à-vis des autres sites : une fenêtre ouverte depuis un
      // autre site ne peut pas piloter Listo (COOP), et aucun autre site ne
      // peut charger les fichiers ou les photos de Listo dans ses pages (CORP)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
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

  // --- Lien public (sans compte, lecture seule) ---
  // Monté AVANT l'API : ces routes ne lisent jamais la session d'un compte, et
  // leur cookie de consultation n'est reconnu nulle part ailleurs.
  const visitor = publicRoutes(ctx, { publicDir: PUBLIC_DIR });
  app.use('/p', visitor.pageRouter);
  app.use('/api/public', visitor.apiRouter);

  // --- API ---
  const api = express.Router();
  // Réponses de l'API jamais gardées en cache
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(requireSameOrigin(config.publicUrl));    // protection CSRF, toujours en premier
  // Lot d'opérations (file d'attente du téléphone, jusqu'à 200 ko) : la
  // connexion est vérifiée AVANT de lire le corps. Un visiteur non connecté
  // reçoit 401 sans que Listo lise ni analyse ce qu'il envoie.
  api.use('/ops', loadSession(ctx), requireAuth, requirePasswordChanged, express.json({ limit: '200kb' }));
  // Tout le reste : corps JSON de 20 ko au plus (la connexion et la création
  // du premier Admin en ont besoin avant toute session)
  api.use(express.json({ limit: '20kb' }));
  api.use(loadSession(ctx));                       // qui est connecté ? (déjà fait pour /ops)

  // Routes ouvertes à tous : premier Admin et connexion
  api.use(publicAuthRoutes(ctx));

  // Tout le reste exige d'être connecté, avec un mot de passe à jour
  api.use(requireAuth);
  api.use(requirePasswordChanged);
  api.use(logoutRoute(ctx));
  api.use(meRoutes(ctx));
  api.use(listRoutes(ctx));
  api.use(photoRoutes(ctx));
  api.use(shareRoutes(ctx));   // lien public, côté propriétaire
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
    if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Requête invalide.' }); // adresse mal formée…
    console.error('Erreur inattendue :', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  app.use('/api', api);

  // Fichiers de l'interface. Ils sont revalidés à chaque chargement (le
  // navigateur demande « ai-je la dernière version ? »), pour qu'une mise à
  // jour de Listo soit vue tout de suite.
  // Le service worker (sw.js) n'est jamais gardé en cache : le navigateur
  // vérifie à chaque chargement s'il existe une nouvelle version.
  app.use(express.static(PUBLIC_DIR, {
    cacheControl: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (path.basename(filePath) === 'sw.js') res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  // Adresse inconnue (hors API) : réponse courte en français
  app.use((req, res) => res.status(404).type('text').send('Page introuvable.'));

  // Erreur hors API (adresse mal formée, problème inattendu) : jamais de
  // trace ni de chemin de fichier dans la réponse ; le détail d'une erreur
  // inattendue va dans les journaux du serveur
  app.use((err, req, res, next) => {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('Erreur inattendue :', err.message);
    res.status(status).type('text').send(status === 500 ? 'Erreur interne du serveur.' : 'Requête invalide.');
  });

  // Ménage régulier : sessions expirées, compteurs de tentatives et d'envois
  // périmés, listes et articles supprimés depuis plus de 30 jours (avec leurs
  // photos), liens publics arrêtés ou expirés depuis plus de 30 jours.
  // « unref » : ce minuteur n'empêche pas Listo de s'arrêter.
  const cleanup = () => {
    purgeExpiredSessions(ctx);
    ctx.lists.purgeDeleted();
    ctx.limiter.prune();
    ctx.uploads.prune();
    ctx.pending.prune();
    ctx.shares.purgeOld();       // liens arrêtés ou expirés depuis plus de 30 jours
    ctx.publicAccess.prune();
    for (const limiter of ctx.publicLimiters) limiter.prune();
  };
  cleanup();
  const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
  cleanupTimer.unref();

  // Arrêt de Listo (index.js) : plus de ménage ni de sauvegarde, flux temps
  // réel fermés
  ctx.stop = () => {
    clearInterval(cleanupTimer);
    ctx.backups.stop();
    ctx.events.closeAll();
  };

  return app;
}
