// Lien public d'une liste, côté visiteur (SANS compte, lecture seule) :
//   GET  /p/:jeton                          la page (HTML, sans donnée)
//   GET  /api/public/:jeton                 la liste, en lecture seule
//   POST /api/public/:jeton/acces           saisie du mot de passe
//   GET  /api/public/:jeton/photos/:id      photo d'un article de CETTE liste
//   POST   /api/public/:jeton/souhaits/:id  liste d'envies : réserver un souhait
//                                           libre (fermé) ou participer à une
//                                           réservation ouverte ({ firstName })
//   DELETE /api/public/:jeton/souhaits/:id  liste d'envies : annuler SA participation
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
// - Liste d'envies : souhaits (nom, note, lien vérifié encore ici, prix,
//   priorité si activée, photo, reçu) et « Pour <prénom> ». Les tables des
//   réservations ne sont JAMAIS lues ici directement : seulement par
//   server/reservations.js (forVisitor, visitorReserve, visitorLeave).
// - Visiteur (partie B) : par souhait, seulement son état (libre, réservé,
//   réservé et ouvert à d'autres) et « c'est la mienne » ; jamais le prénom,
//   le nombre ni l'identifiant d'un autre participant. Il est reconnu par un
//   cookie (jeton aléatoire de 128 bits, un cookie par lien, HttpOnly,
//   SameSite=Lax, préfixe __Host- en production) dont seule l'empreinte est
//   gardée ; le jeton n'est jamais écrit dans un journal. Ses actions
//   n'écrivent dans aucun journal.
// - Bénéficiaire : sur une liste d'envies, la session d'un compte est LUE
//   (sans être prolongée, sans effet) ; si c'est le bénéficiaire, la réponse
//   est celle de la lecture seule, sans aucun état de réservation, et ses
//   actions de visiteur reçoivent la réponse d'un lien inconnu.

import { typeOf, isShoppingList, isWishList, usesPriority, usesDue } from '../../public/js/list-types.js';
import { cleanLink, wishListOf, beneficiaryId } from '../../public/js/wishes.js';
import { isRepeatRule } from '../../public/js/repeat.js';
import { isDueTime } from '../../public/js/due-time.js';
import fs from 'node:fs';
import express from 'express';
import crypto from 'node:crypto';
import { parseCookies, requireSameOrigin, hashToken, createSessionPeek } from '../auth.js';
import { OpError } from '../lists.js';
import { verifyPassword, getDummyHash, PASSWORD_MAX } from '../passwords.js';
import { createLimiter } from '../limiter.js';
import { sendPhoto } from '../photos.js';
import { ACCESS_COOKIE } from '../shares.js';
import { splitDone } from '../../public/js/sorting.js';

const NOT_FOUND = 'Lien expiré ou inexistant.';
const TOO_MANY = "Trop d'essais, réessayez plus tard.";
const WRONG_PASSWORD = 'Mot de passe incorrect.';
const PASSWORD_REQUIRED = 'Mot de passe requis.';
const TOO_MANY_ACTIONS = 'Trop d\'actions en peu de temps. Réessayez dans quelques minutes.';
const JSON_ONLY = 'Requête invalide.';
// Actions des visiteurs (réserver, participer, annuler) : 30 en 15 minutes par adresse IP
const VISITOR_ACTIONS_PER_IP = 30;
// Jeton d'un visiteur : 128 bits aléatoires, en base64url (22 caractères)
const VISITOR_TOKEN = /^[A-Za-z0-9_-]{22}$/;
const YEAR = 365 * 24 * 60 * 60 * 1000;

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
  // Actions des visiteurs : 30 en 15 minutes par adresse IP
  const actionLimiter = createLimiter({ max: VISITOR_ACTIONS_PER_IP, now: ctx.now });
  ctx.publicLimiters = [passwordLimiter, unknownLimiter, actionLimiter]; // ménage (app.js)
  const peekSession = createSessionPeek(ctx);
  const reservations = () => ctx.reservations; // créé par le service des listes (server/lists.js)

  const q = {
    list: db.prepare(`
      SELECT name, type, store_id, priority_enabled, due_enabled, owner_id, for_user_id, for_name FROM lists WHERE id = ?
    `),
    // Prénom affiché d'un compte (destinataire d'une liste d'envies)
    displayName: db.prepare('SELECT display_name FROM users WHERE id = ?').pluck(),
    store: db.prepare('SELECT id, name, is_multi FROM stores WHERE id = ?'),
    allStores: db.prepare('SELECT id, name FROM stores'),
    allAisles: db.prepare('SELECT id, name FROM aisles'),
    items: db.prepare(`
      SELECT id, name, quantity, note, aisle_id, store_id, checked, checked_at, photo_at, priority, due_date, due_time, repeat, ean, link, price_cents
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

  // Liste d'envies : le compte connecté (session lue seulement) en est-il le
  // bénéficiaire ? (identité du compte, comme dans l'application)
  function isBeneficiary(req, list) {
    if (!isWishList(list)) return false;
    const user = peekSession(req);
    return Boolean(user) && beneficiaryId(wishListOf(list)) === user.id;
  }

  // Cookie du visiteur pour ce lien (un cookie par lien)
  const visitorCookie = (share) => `${ctx.config.production ? '__Host-' : ''}listo_visiteur_${share.id}`;
  function visitorHash(req, share) {
    const token = parseCookies(req.headers.cookie)[visitorCookie(share)];
    return typeof token === 'string' && VISITOR_TOKEN.test(token) ? hashToken(token) : null;
  }

  // Ce que voit le visiteur : liste blanche, champ par champ.
  // visitor : null (pas de réservation montrée : autre type de liste, ou
  // bénéficiaire reconnu), ou { tokenHash } pour un visiteur d'une liste d'envies.
  function publicView(share, token, visitor = null) {
    const list = q.list.get(share.list_id);
    const isShopping = isShoppingList(list);
    // Magasin : seulement pour une liste de courses (une liste de tâches qui
    // a été de courses garde le sien en base, jamais montré ici)
    const store = !isShopping || list.store_id === null ? null : q.store.get(list.store_id);
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
      dueTime: row.due_time,
      repeat: row.repeat,
      ean: row.ean,
      link: row.link,
      priceCents: row.price_cents,
    }));
    // Articles à acheter groupés par rayon (ou magasin) ; articles cochés à
    // part, du plus récemment coché au plus ancien (zone « Dans le panier » /
    // « Terminés », même règle que l'application). La date du coché sert à
    // l'ordre, elle n'est pas envoyée.
    const aisles = q.allAisles.all();
    const stores = q.allStores.all();
    const { groups, done } = splitDone(items, aisles, isShopping, { byStore, stores });
    // Liste de tâches : priorité et échéance en plus (lecture seule),
    // chacune seulement si elle est activée pour cette liste ; jamais pour
    // une liste de courses
    const withPriority = usesPriority(list) && list.priority_enabled === 1;
    const withDue = usesDue(list) && list.due_enabled === 1;
    // Nom d'un rayon ou d'un magasin, ou null (aucun, ou inconnu)
    const nameOf = (rows, id) => (id === null ? null : rows.find((row) => row.id === id)?.name ?? null);
    const wishes = isWishList(list);
    // Visiteur d'une liste d'envies : état de chaque souhait réservé et « le mien »
    const states = wishes && visitor ? reservations().forVisitor(share.list_id, visitor.tokenHash) : null;
    const describe = (item) => ({
      name: item.name,
      // Liste d'envies : pas de quantité (comme dans l'application)
      ...(wishes ? {} : { quantity: item.quantity }),
      note: item.note,
      checked: item.checked,
      photo: item.photoAt ? `/api/public/${token}/photos/${item.id}` : null,
      ...(withPriority ? { priority: item.priority } : {}),
      ...(withDue ? { dueDate: item.dueDate } : {}),
      // Tâche qui se répète : sa règle (vérifiée encore à la sortie), seulement
      // avec une échéance
      ...(withDue && item.dueDate && isRepeatRule(item.repeat) ? { repeat: item.repeat } : {}),
      // Heure de l'échéance (vérifiée à la sortie) ; jamais le rappel
      ...(withDue && item.dueDate && isDueTime(item.dueTime) ? { dueTime: item.dueTime } : {}),
      // Liste de courses : le code-barres, seulement si l'article en a un
      // (jamais pour une autre liste, comme dans l'application)
      ...(isShopping && item.ean ? { ean: item.ean } : {}),
      // Liste d'envies : le lien, vérifié encore à la sortie (http ou https
      // seulement, sinon rien), et le prix indicatif en centimes, seulement
      // s'ils existent
      ...(wishes && cleanLink(item.link ?? '') ? { link: cleanLink(item.link) } : {}),
      ...(wishes && Number.isInteger(item.priceCents) ? { priceCents: item.priceCents } : {}),
      // Visiteur (jamais le bénéficiaire) : identifiant du souhait (pour
      // réserver), état (free, reserved, open) et « le mien » ; rien pour un
      // souhait reçu
      ...(states && !item.checked ? {
        id: item.id,
        reservation: states.get(item.id)?.state ?? 'free',
        mine: states.get(item.id)?.mine ?? false,
      } : {}),
    });
    // Article coché : il a quitté son groupe, son rayon (ou son magasin dans
    // une liste « multi ») n'est donc plus donné par l'en-tête ; il est
    // ajouté, seulement si l'article en a un. Un article à acheter le reçoit
    // de son groupe (rien de plus n'est envoyé).
    const describeDone = (item) => {
      const place = byStore ? nameOf(stores, item.storeId) : isShopping ? nameOf(aisles, item.aisleId) : null;
      return { ...describe(item), ...(place === null ? {} : byStore ? { store: place } : { aisle: place }) };
    };
    return {
      list: {
        name: list.name,
        // Type de la liste : 'shopping' (courses), 'tasks' (tâches) ou 'wishes' (envies)
        type: typeOf(list),
        // Liste d'envies : le prénom de la personne à qui elle est destinée
        // (personne sans compte, autre compte, ou le propriétaire pour « Moi »)
        ...(wishes ? { forName: forNameOf(list) } : {}),
        // Visiteur d'une liste d'envies : il peut réserver (jamais le bénéficiaire reconnu)
        ...(states ? { canReserve: true } : {}),
        store: store ? store.name : null,
        grouping: !isShopping ? 'none' : byStore ? 'store' : 'aisle',
      },
      groups: groups.map((group) => ({
        name: (group.aisle ?? group.store)?.name ?? null,
        items: group.items.map(describe),
      })),
      done: done.map(describeDone),
      expiresAt: share.expires_at,
    };
  }

  // Prénom du destinataire d'une liste d'envies (null si introuvable)
  function forNameOf(list) {
    if (list.for_name) return list.for_name;
    const id = beneficiaryId(wishListOf(list));
    return id === null ? null : q.displayName.get(id) ?? null;
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
    const list = q.list.get(share.list_id);
    // Liste d'envies : un visiteur voit l'état des réservations ; le
    // bénéficiaire reconnu par sa session, jamais (réponse de la lecture seule)
    const visitor = isWishList(list) && !isBeneficiary(req, list) ? { tokenHash: visitorHash(req, share) } : null;
    res.json(publicView(share, req.params.token, visitor));
  });

  // --- Actions d'un visiteur sur une liste d'envies (sans compte) ---
  // Même contrôle du lien que la lecture (jeton, mot de passe, expiration,
  // arrêt, liste supprimée) ; une liste qui n'est pas d'envies, ou le
  // bénéficiaire reconnu, reçoivent la réponse d'un lien inconnu. Origine
  // contrôlée (requireSameOrigin plus haut), JSON seulement, 30 actions en
  // 15 minutes par adresse IP. Rien n'est écrit dans un journal.
  function visitorAction(handler) {
    return (req, res) => {
      const share = findShare(req, res, refuseJson);
      if (!share) return;
      if (!hasAccess(req, share)) return res.status(401).json({ error: PASSWORD_REQUIRED, passwordRequired: true });
      const list = q.list.get(share.list_id);
      if (!isWishList(list) || isBeneficiary(req, list)) return refuseJson(res, 404);
      if (actionLimiter.isBlocked([ipKey(req)])) return res.status(429).json({ error: TOO_MANY_ACTIONS });
      actionLimiter.fail([ipKey(req)]); // chaque action compte
      try {
        handler(req, res, share);
      } catch (err) {
        if (err instanceof OpError) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    };
  }

  // Réserver un souhait libre (réservation fermée) ou participer à une
  // réservation ouverte. Première action : un jeton aléatoire de 128 bits est
  // créé et posé dans le cookie du visiteur pour ce lien ; seule son
  // empreinte est enregistrée.
  apiRouter.post('/:token/souhaits/:itemId', visitorAction((req, res, share) => {
    if (!req.is('application/json')) return res.status(415).json({ error: JSON_ONLY });
    let tokenHash = visitorHash(req, share);
    let fresh = null;
    if (!tokenHash) {
      fresh = crypto.randomBytes(16).toString('base64url');
      tokenHash = hashToken(fresh);
    }
    reservations().visitorReserve(share.list_id, tokenHash, String(req.params.itemId), req.body?.firstName);
    if (fresh) {
      // Jusqu'à l'expiration du lien (un an au plus, pour un lien sans limite)
      const left = share.expires_at ? Math.max(0, Date.parse(share.expires_at) - ctx.now()) : YEAR;
      res.cookie(visitorCookie(share), fresh, { httpOnly: true, secure: ctx.config.production, sameSite: 'lax', path: '/', maxAge: Math.min(left, YEAR) });
    }
    res.json({ ok: true });
  }));

  // Annuler SA participation (le cookie prouve qu'elle est la sienne ; sans
  // cookie, ou avec celui d'un autre, rien n'est trouvé)
  apiRouter.delete('/:token/souhaits/:itemId', visitorAction((req, res, share) => {
    const tokenHash = visitorHash(req, share);
    if (!tokenHash) throw new OpError(404, 'Vous ne participez pas à ce cadeau.');
    reservations().visitorLeave(share.list_id, tokenHash, String(req.params.itemId));
    res.json({ ok: true });
  }));

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
