// Création d'un magasin ou d'un rayon par tout compte connecté, sans passer
// par l'Admin (le reste de leur gestion — renommer, désactiver, supprimer,
// regrouper — reste réservé à l'Admin, voir admin-references.js ; les
// catégories de liste aussi) :
//   POST /api/stores   { name, listId? }  nouveau magasin (simple)
//   POST /api/aisles   { name, listId }   nouveau rayon
//
// Les magasins et les rayons restent communs à tout le foyer. Règles,
// vérifiées à chaque requête :
// - nom nettoyé (espaces) et 100 caractères au plus, comme dans
//   l'Administration ;
// - pas de doublon : majuscules, accents et espaces multiples ignorés. Nom
//   déjà pris par un élément actif : 409 avec cet élément (le téléphone
//   propose de le choisir) ; par un élément désactivé : 409, demander à
//   l'Admin de le réactiver (le plus simple et le plus sûr : rien n'est
//   réactivé sans lui) ;
// - un rayon se crée depuis un article : listId obligatoire, liste de
//   courses (sans magasin « multi ») que le compte peut modifier (un invité
//   en lecture seule reçoit 403) ;
// - un magasin se crée pour une nouvelle liste (sans listId) ou pour une
//   liste que le compte peut modifier (listId). Pour l'article d'une liste à
//   magasin « multi », le nouveau magasin est aussi ajouté aux magasins
//   regroupés par ce « multi » (sinon il ne pourrait pas être choisi) ;
// - 20 créations par heure et par compte (429 au-delà) ; aucun plafond du
//   nombre total (il n'en existe pas dans l'Administration) ;
// - journal : « magasin_cree » ou « rayon_cree », avec le nom du compte et
//   le nom du magasin ou du rayon (jamais le contenu d'une liste) ;
// - les téléphones connectés se mettent à jour (« event: refs »).
// Un nouvel élément se range, comme ailleurs, par ordre alphabétique (il n'y
// a pas d'ordre choisi à la main).

import express from 'express';
import { cleanName, comparableName } from '../validate.js';
import { OpError } from '../lists.js';
import { isShoppingList } from '../../public/js/list-types.js';

const KINDS = {
  stores: {
    table: 'stores',
    event: 'magasin_cree',
    duplicate: (name) => `Le magasin « ${name} » existe déjà : choisissez-le dans la liste.`,
    disabled: (name) => `Le magasin « ${name} » existe déjà mais il est désactivé : demandez à l'Admin de le réactiver.`,
  },
  aisles: {
    table: 'aisles',
    event: 'rayon_cree',
    duplicate: (name) => `Le rayon « ${name} » existe déjà : choisissez-le dans la liste.`,
    disabled: (name) => `Le rayon « ${name} » existe déjà mais il est désactivé : demandez à l'Admin de le réactiver.`,
  },
};

export function referenceRoutes(ctx) {
  const router = express.Router();
  for (const [path, kind] of Object.entries(KINDS)) {
    router.post(`/${path}`, (req, res) => {
      try {
        res.status(201).json(create(ctx, path, kind, req.user, req.body ?? {}));
      } catch (err) {
        if (err instanceof OpError) return res.status(err.status).json({ error: err.message, ...(err.existing ? { existing: err.existing } : {}) });
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
    throw new OpError(400, 'Un rayon ne se choisit que dans une liste de courses sans magasin « multi ».');
  }
  const name = cleanName(rawName);
  if (!name) throw new OpError(400, 'Nom invalide (1 à 100 caractères).');
  // Doublon (même désactivé) : majuscules, accents et espaces ignorés
  const wanted = comparableName(name);
  const twin = db.prepare(`SELECT id, name, active FROM ${kind.table}`).all().find((row) => comparableName(cleanName(row.name) ?? row.name) === wanted);
  if (twin) {
    const error = new OpError(409, twin.active === 1 ? kind.duplicate(twin.name) : kind.disabled(twin.name));
    if (twin.active === 1) error.existing = { id: twin.id, name: twin.name };
    throw error;
  }
  if (!ctx.referenceCreations.take(user.id)) {
    throw new OpError(429, 'Trop de créations pour le moment. Réessayez dans un moment.');
  }
  const id = db.transaction(() => {
    const newId = Number(db.prepare(`INSERT INTO ${kind.table} (name) VALUES (?)`).run(name).lastInsertRowid);
    // Article d'une liste « multi » : le magasin rejoint ses magasins regroupés
    if (path === 'stores' && list?.is_multi === 1) {
      db.prepare('INSERT INTO store_members (multi_store_id, store_id) VALUES (?, ?)').run(list.store_id, newId);
    }
    return newId;
  })();
  ctx.audit(kind.event, { utilisateur: user.username, nom: name, ...(path === 'stores' && list?.is_multi === 1 ? { regroupe: true } : {}) });
  ctx.events?.notifyReferences();
  return { item: { id, name, active: true, ...(path === 'stores' ? { isMulti: false, storeIds: [] } : {}) } };
}
