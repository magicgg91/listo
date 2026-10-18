// Lien public d'une liste, côté visiteur (SANS compte, lecture seule) :
//   GET  /p/:jeton                          la page (HTML, sans donnée)
//   GET  /api/public/:jeton                 la liste, en lecture seule
//   POST /api/public/:jeton/acces           saisie du mot de passe
//   GET  /api/public/:jeton/photos/:id      photo d'un article de CETTE liste
//
// Règles (refus par défaut) :
// - Ces routes ne lisent jamais la session d'un compte ; le cookie de
//   consultation (listo_lien) n'est lu que par elles, et seulement pour le
//   lien de l'adresse. Aucune autre route de Listo ne le reconnaît.
// - À CHAQUE requête, le lien est recontrôlé (shares.validShare) : inconnu,
//   expiré, arrêté, liste supprimée ou propriétaire désactivé donnent tous
//   exactement la même réponse 404 « Lien expiré ou inexistant ».
// - Les données sont construites champ par champ (liste blanche), jamais à
//   partir des objets internes : ni compte, ni nom d'utilisateur, ni
//   historique, ni autre liste.
// - Mot de passe : 5 échecs en 15 minutes bloquent le lien, ou l'adresse IP,
//   pendant 15 minutes. Et une adresse IP qui essaie trop de liens invalides
//   (20 en 15 minutes) est bloquée sur toutes ces routes.
// - En-têtes : pas d'indexation, jamais de cache, pas de « referrer ».

import fs from 'node:fs';
import express from 'express';
import { parseCookies, requireSameOrigin } from '../auth.js';
import { verifyPassword, getDummyHash, PASSWORD_MAX } from '../passwords.js';
import { createLimiter } from '../limiter.js';
import { sendPhoto } from '../photos.js';
import { ACCESS_COOKIE } from '../shares.js';
import { splitDone } from '../../public/js/sorting.js';

const NOT_FOUND = 'Lien expiré ou inexistant.';
const TOO_MANY = "Trop d'essais, réessayez plus tard.";
const WRONG_PASSWORD = 'Mot de passe incorrect.';
const PASSWORD_REQUIRED = 'Mot de passe requis.';

const PAGES = new URL('../pages/', import.meta.url);

// Les deux pages HTML, lues une fois au démarrage. Les icônes (sprite) sont
// reprises de la page de l'application, pour n'avoir qu'un seul exemplaire.
function loadPages(publicDir) {
  const index = fs.readFileSync(`${publicDir}/index.html`, 'utf8');
  const sprite = index.slice(index.indexOf('<svg class="sprite"'), index.indexOf('</defs></svg>') + '</defs></svg>'.length);
  const page = (name) => Buffer.from(fs.readFileSync(new URL(name, PAGES), 'utf8').replace('<!-- sprite -->', sprite));
  return { list: page('lien-public.html'), invalid: page('lien-invalide.html') };
}

export function publicRoutes(ctx, { publicDir }) {
  const { db, shares, publicAccess, audit } = ctx;
  const pages = loadPages(publicDir);

  // Mots de passe faux : 5 en 15 minutes, par lien ou par adresse IP
  const passwordLimiter = createLimiter({ now: ctx.now });
  // Liens invalides essayés : 20 en 15 minutes par adresse IP
  const unknownLimiter = createLimiter({ max: 20, now: ctx.now });
  ctx.publicLimiters = [passwordLimiter, unknownLimiter]; // ménage (app.js)

  const q = {
    list: db.prepare(`
      SELECT lists.name, lists.store_id, categories.name AS category_name, categories.is_shopping
      FROM lists JOIN categories ON categories.id = lists.category_id WHERE lists.id = ?
    `),
    store: db.prepare('SELECT id, name, is_multi FROM stores WHERE id = ?'),
    allStores: db.prepare('SELECT id, name FROM stores'),
    allAisles: db.prepare('SELECT id, name FROM aisles'),
    items: db.prepare(`
      SELECT id, name, quantity, note, aisle_id, store_id, checked, checked_at, photo_at, priority, due_date
      FROM items WHERE list_id = ? AND deleted_at IS NULL
    `),
    photo: db.prepare('SELECT id FROM items WHERE id = ? AND list_id = ? AND deleted_at IS NULL AND photo_at IS NOT NULL'),
  };

  // En-têtes de toutes les routes publiques
  const publicHeaders = (req, res, next) => {
    res.set({
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  };

  const ipKey = (req) => `ip:${req.ip}`;

  // Retrouve le lien de l'adresse, ou répond (lien invalide, IP bloquée) et
  // renvoie null. « refuse » envoie la réponse adaptée (page ou JSON).
  function findShare(req, res, refuse) {
    if (unknownLimiter.isBlocked([ipKey(req)])) {
      refuse(res, 429);
      return null;
    }
    const share = shares.validShare(req.params.token);
    if (!share) {
      unknownLimiter.fail([ipKey(req)]);
      if (unknownLimiter.isBlocked([ipKey(req)])) audit('lien_public_ip_bloquee', { ip: req.ip });
      refuse(res, 404);
      return null;
    }
    return share;
  }

  const refusePage = (res, status) => res.status(status).type('html').send(pages.invalid);
  const refuseJson = (res, status) => res.status(status).json({ error: status === 429 ? TOO_MANY : NOT_FOUND });

  // Le visiteur peut-il voir ce lien ? (pas de mot de passe, ou cookie valable)
  function hasAccess(req, share) {
    if (share.password_hash === null) return true;
    return publicAccess.allows(parseCookies(req.headers.cookie)[ACCESS_COOKIE], share);
  }

  // Ce que voit le visiteur : liste blanche, champ par champ
  function publicView(share, token) {
    const list = q.list.get(share.list_id);
    const store = list.store_id === null ? null : q.store.get(list.store_id);
    const isShopping = list.is_shopping === 1;
    const byStore = isShopping && store?.is_multi === 1;
    const items = q.items.all(share.list_id).map((row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      note: row.note,
      aisleId: row.aisle_id,
      storeId: row.store_id,
      checked: row.checked === 1,
      checkedAt: row.checked_at,
      photoAt: row.photo_at,
      priority: row.priority,
      dueDate: row.due_date,
    }));
    // Articles à acheter groupés par rayon (ou magasin) ; articles cochés à
    // part, du plus récemment coché au plus ancien (zone « Dans le panier » /
    // « Terminés », même règle que l'application). La date du coché sert à
    // l'ordre, elle n'est pas envoyée.
    const { groups, done } = splitDone(items, q.allAisles.all(), isShopping, { byStore, stores: q.allStores.all() });
    // Liste autre que les courses : priorité et échéance en plus (lecture
    // seule) ; jamais pour une liste de courses
    const describe = (item) => ({
      name: item.name,
      quantity: item.quantity,
      note: item.note,
      checked: item.checked,
      photo: item.photoAt ? `/api/public/${token}/photos/${item.id}` : null,
      ...(isShopping ? {} : { priority: item.priority, dueDate: item.dueDate }),
    });
    return {
      list: {
        name: list.name,
        category: list.category_name,
        store: store ? store.name : null,
        grouping: !isShopping ? 'none' : byStore ? 'store' : 'aisle',
      },
      groups: groups.map((group) => ({
        name: (group.aisle ?? group.store)?.name ?? null,
        items: group.items.map(describe),
      })),
      done: done.map(describe),
      expiresAt: share.expires_at,
    };
  }

  // --- La page /p/<jeton> ---
  const pageRouter = express.Router();
  pageRouter.use(publicHeaders);
  pageRouter.get('/:token', (req, res) => {
    if (!findShare(req, res, refusePage)) return;
    res.type('html').send(pages.list);
  });
  // Toute autre adresse sous /p/ : même réponse qu'un lien inconnu
  pageRouter.use((req, res) => {
    unknownLimiter.fail([ipKey(req)]);
    refusePage(res, 404);
  });

  // --- L'API /api/public/<jeton> ---
  const apiRouter = express.Router();
  apiRouter.use(publicHeaders);
  apiRouter.use(requireSameOrigin(ctx.config.publicUrl)); // saisie du mot de passe : depuis Listo seulement
  apiRouter.use(express.json({ limit: '2kb' }));

  apiRouter.get('/:token', (req, res) => {
    const share = findShare(req, res, refuseJson);
    if (!share) return;
    if (!hasAccess(req, share)) return res.status(401).json({ error: PASSWORD_REQUIRED, passwordRequired: true });
    res.json(publicView(share, req.params.token));
  });

  apiRouter.post('/:token/acces', async (req, res) => {
    const share = findShare(req, res, refuseJson);
    if (!share) return;
    if (share.password_hash === null) return res.json({ ok: true }); // rien à saisir
    const keys = [`lien:${share.id}`, ipKey(req)];
    if (passwordLimiter.isBlocked(keys)) return res.status(429).json({ error: TOO_MANY, blocked: true });

    const typed = req.body?.password;
    const usable = typeof typed === 'string' && typed.length <= PASSWORD_MAX;
    // Même calcul scrypt dans tous les cas (comparaison en temps constant)
    const ok = await verifyPassword(usable ? typed : '', usable ? share.password_hash : await getDummyHash()) && usable;
    // Le lien a pu être arrêté, ou son mot de passe changé, pendant le calcul
    const still = shares.validShare(req.params.token);
    if (!ok || !still || still.password_hash !== share.password_hash) {
      passwordLimiter.fail(keys);
      audit('lien_public_mot_de_passe_refuse', { partage: share.id, ip: req.ip });
      if (passwordLimiter.isBlocked(keys)) {
        audit('lien_public_saisie_bloquee', { partage: share.id, ip: req.ip });
        return res.status(429).json({ error: TOO_MANY, blocked: true });
      }
      return res.status(401).json({ error: WRONG_PASSWORD });
    }

    // Cookie de consultation : ce lien seulement (chemin), 12 heures au plus,
    // jamais au-delà de l'expiration du lien
    const access = publicAccess.grant(share);
    res.cookie(ACCESS_COOKIE, access.token, {
      httpOnly: true,
      secure: ctx.config.production,
      sameSite: 'lax',
      path: `/api/public/${req.params.token}`,
      maxAge: access.maxAge,
    });
    audit('lien_public_ouvert', { partage: share.id, ip: req.ip });
    res.json({ ok: true });
  });

  apiRouter.get('/:token/photos/:itemId', (req, res) => {
    const share = findShare(req, res, refuseJson);
    if (!share) return;
    if (!hasAccess(req, share)) return res.status(401).json({ error: PASSWORD_REQUIRED, passwordRequired: true });
    const itemId = String(req.params.itemId).toLowerCase();
    const item = q.photo.get(itemId, share.list_id); // un article de CETTE liste seulement
    if (!item) return res.status(404).json({ error: 'Photo introuvable.' });
    sendPhoto(res, ctx.photos, item.id, { cache: 'no-store' });
  });

  // Toute autre route ou méthode (modification…) : refusée
  apiRouter.use((req, res) => res.status(404).json({ error: NOT_FOUND }));
  // Erreurs (JSON mal formé…) : sans détail technique
  apiRouter.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête mal formée.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse.' });
    if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Requête invalide.' }); // adresse mal formée…
    console.error('Erreur inattendue (lien public) :', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  return { pageRouter, apiRouter };
}
