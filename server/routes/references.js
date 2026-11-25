// Création d'un magasin ou d'un rayon par tout compte connecté, sans passer
// par l'Admin (le reste de leur gestion — renommer, désactiver, supprimer,
// regrouper — reste réservé à l'Admin, voir admin-references.js ; les
// catégories de liste aussi) :
//   POST /api/stores   { name, listId? }  nouveau magasin (simple)
//   POST /api/aisles   { name, listId }   nouveau rayon
//
// Les magasins restent communs à tout le foyer. Un rayon créé depuis une
// liste appartient au magasin simple de la liste, ou à « Tous les magasins »
// si la liste n'a pas de magasin (rayons propres à un magasin, 21 novembre
// 2026, public/js/aisles.js). Règles, vérifiées à chaque requête :
// - nom nettoyé (espaces) et 100 caractères au plus, comme dans
//   l'Administration ;
// - pas de doublon : majuscules, accents et espaces multiples ignorés. Nom
//   déjà pris par un élément actif : 409 avec cet élément (le téléphone
//   propose de le choisir) ; par un élément désactivé : 409, demander à
//   l'Admin de le réactiver (le plus simple et le plus sûr : rien n'est
//   réactivé sans lui). Pour un rayon, seuls comptent les rayons que la
//   liste peut voir (communs et de son magasin) ; un rayon de « Tous les
//   magasins » ne prend pas non plus le nom d'un rayon d'un magasin (409,
//   sans proposition : la liste ne peut pas le choisir) ;
// - un rayon se crée depuis un article : listId obligatoire, liste de
//   courses (sans magasin « multi ») que le compte peut modifier (un invité
//   en lecture seule reçoit 403) ;
// - un magasin se crée pour une nouvelle liste (sans listId) ou pour une
//   liste que le compte peut modifier (listId). Pour l'article d'une liste à
//   magasin « multi », le nouveau magasin est aussi ajouté aux magasins
//   regroupés par ce « multi » (sinon il ne pourrait pas être choisi) ;
// - 20 créations par heure et par compte (429 au-delà) ; aucun plafond du
//   nombre total (il n'en existe pas dans l'Administration) ;
// - journal : « store_created » ou « aisle_created », avec le nom du compte et
//   le nom du magasin ou du rayon (jamais le contenu d'une liste) ;
// - les téléphones connectés se mettent à jour (« event: refs »).
// Un nouvel élément se range, comme ailleurs, par ordre alphabétique (il n'y
// a pas d'ordre choisi à la main).

import express from 'express';
import { cleanName, comparableName } from '../validate.js';
import { OpError } from '../lists.js';
import { isShoppingList } from '../../public/js/list-types.js';
import { aisleFits, aisleNameClash } from '../../public/js/aisles.js';

const KINDS = {
  stores: {
    table: 'stores',
    event: 'store_created',
    duplicate: 'references.magasin.existe',
    disabled: 'references.magasin.existe.desactive',
  },
  aisles: {
    table: 'aisles',
    event: 'aisle_created',
    duplicate: 'references.rayon.existe',
    disabled: 'references.rayon.existe.desactive',
    // Nom pris par le rayon d'un autre magasin (création d'un rayon commun)
    elsewhere: 'references.rayon.existe.autreMagasin',
  },
};

export function referenceRoutes(ctx) {
  const router = express.Router();
  for (const [path, kind] of Object.entries(KINDS)) {
    router.post(`/${path}`, (req, res) => {
      try {
        res.status(201).json(create(ctx, path, kind, req.user, req.body ?? {}));
      } catch (err) {
        // Message dans la langue de la requête (nom et valeurs portés par l'erreur)
        if (err instanceof OpError) return res.status(err.status).json({ error: req.t(err.key, err.params), ...(err.existing ? { existing: err.existing } : {}) });
        throw err;
      }
    });
  }
  return router;
}

function create(ctx, path, kind, user, { name: rawName, listId }) {
  const { db } = ctx;
  // Droit d'abord (non-membre : « Liste introuvable » ; lecture seule : 403)
  let list = null;
  if (path === 'aisles' || listId !== undefined) list = ctx.lists.listForEditor(user, listId);
  if (path === 'aisles' && (!isShoppingList(list) || list.is_multi === 1)) {
    throw new OpError(400, 'references.rayon.horsCourses');
  }
  const name = cleanName(rawName);
  if (!name) throw new OpError(400, 'references.nomInvalide');
  // Rayon : celui du magasin simple de la liste, ou commun (liste sans magasin)
  const aisleStore = path === 'aisles' ? list.store_id ?? null : null;
  // Doublon (même désactivé) : majuscules, accents et espaces ignorés
  let twin;
  if (path === 'aisles') {
    const aisles = db.prepare('SELECT id, name, active, store_id FROM aisles').all()
      .map((row) => ({ id: row.id, name: row.name, active: row.active === 1, storeId: row.store_id ?? null }));
    const clash = aisleNameClash(aisles, name, aisleStore);
    // Rayon d'un autre magasin (seulement pour un nouveau rayon commun) :
    // la liste ne peut pas le choisir, il faut un autre nom
    if (clash && !aisleFits(clash, aisleStore)) {
      const store = db.prepare('SELECT name FROM stores WHERE id = ?').pluck().get(clash.storeId);
      throw new OpError(409, kind.elsewhere, { name: clash.name, store });
    }
    twin = clash && { id: clash.id, name: clash.name, active: clash.active ? 1 : 0 };
  } else {
    const wanted = comparableName(name);
    twin = db.prepare(`SELECT id, name, active FROM ${kind.table}`).all().find((row) => comparableName(cleanName(row.name) ?? row.name) === wanted);
  }
  if (twin) {
    const error = new OpError(409, twin.active === 1 ? kind.duplicate : kind.disabled, { name: twin.name });
    if (twin.active === 1) error.existing = { id: twin.id, name: twin.name };
    throw error;
  }
  if (!ctx.referenceCreations.take(user.id)) {
    throw new OpError(429, 'references.tropDeCreations');
  }
  const id = db.transaction(() => {
    const newId = path === 'aisles'
      ? Number(db.prepare('INSERT INTO aisles (name, store_id) VALUES (?, ?)').run(name, aisleStore).lastInsertRowid)
      : Number(db.prepare(`INSERT INTO ${kind.table} (name) VALUES (?)`).run(name).lastInsertRowid);
    // Article d'une liste « multi » : le magasin rejoint ses magasins regroupés
    if (path === 'stores' && list?.is_multi === 1) {
      db.prepare('INSERT INTO store_members (multi_store_id, store_id) VALUES (?, ?)').run(list.store_id, newId);
    }
    return newId;
  })();
  ctx.audit(kind.event, { user: user.username, name, ...(path === 'stores' && list?.is_multi === 1 ? { grouped: true } : {}), ...(path === 'aisles' && aisleStore !== null ? { store: db.prepare('SELECT name FROM stores WHERE id = ?').pluck().get(aisleStore) } : {}) });
  ctx.events?.notifyReferences({ lists: true });
  return { item: { id, name, active: true, ...(path === 'stores' ? { isMulti: false, storeIds: [] } : { storeId: aisleStore }) } };
}
