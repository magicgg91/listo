// Application Express : les routes du serveur.
//
// Ce fichier construit l'application sans la démarrer, pour que les tests
// puissent l'utiliser directement. Le démarrage est dans index.js.

import { fileURLToPath } from 'node:url';
import express from 'express';

// Dossier des fichiers de l'interface (HTML, CSS, JavaScript, icônes)
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp({ db }) {
  const app = express();

  // Ne pas annoncer « Express » dans les réponses
  app.disable('x-powered-by');

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

  // Fichiers de l'interface
  app.use(express.static(PUBLIC_DIR));

  return app;
}
