// Administration des données de référence : magasins et rayons (réservée
// aux Admin, voir admin.js). Les deux fonctionnent de la même façon :
//   GET    /api/admin/<type>        lister
//   POST   /api/admin/<type>        ajouter (name ; isMulti pour un magasin)
//   PATCH  /api/admin/<type>/:id    renommer, désactiver / réactiver ; pour un
//                                    magasin « multi » : storeIds, les magasins
//                                    qu'il regroupe
//   DELETE /api/admin/<type>/:id    supprimer, seulement si jamais utilisé
//
// Les catégories de liste n'existent plus (remplacées par les trois types
// fixes, public/js/list-types.js) : /api/admin/categories répond « Route
// inconnue » (404), comme toute adresse inconnue.
//
// Un élément déjà utilisé (par une liste, un article, l'historique) ne peut
// pas être supprimé : il peut seulement être désactivé. Désactivé, il n'est
// plus proposé pour les nouvelles listes et les nouveaux articles, mais ceux
// qui l'utilisent déjà le gardent.
//
// Les noms sont uniques sans tenir compte des majuscules ni des accents.
//
// Magasin « multi » : son type se choisit à la création et ne change plus
// (changer le type d'un magasin déjà utilisé changerait toutes ses listes).
// Il ne regroupe que des magasins simples. Désactiver un magasin regroupé le
// retire des choix proposés aux articles, sans modifier ceux qui l'utilisent.

import express from 'express';
import { cleanName, comparableName, parseId } from '../validate.js';

// Les deux sortes de données de référence. Les noms de tables et de colonnes
// sont fixés ici, dans le code : ils ne viennent jamais de la requête.
// usedBy : où cet élément peut être utilisé.
const TYPES = {
  stores: {
    table: 'stores',
    label: 'store',
    notFound: 'references.magasin.introuvable',
    duplicate: 'references.magasin.doublon',
    hasMultiFlag: true,
    usedBy: `SELECT EXISTS (SELECT 1 FROM lists WHERE store_id = :id)
                 OR EXISTS (SELECT 1 FROM items WHERE store_id = :id)
                 OR EXISTS (SELECT 1 FROM item_history WHERE store_id = :id)
                 OR EXISTS (SELECT 1 FROM store_members WHERE store_id = :id)`,
  },
  aisles: {
    table: 'aisles',
    label: 'aisle',
    notFound: 'references.rayon.introuvable',
    duplicate: 'references.rayon.doublon',
    usedBy: `SELECT EXISTS (SELECT 1 FROM items WHERE aisle_id = :id)
                 OR EXISTS (SELECT 1 FROM item_history WHERE aisle_id = :id)`,
  },
};

export function adminReferenceRoutes(ctx) {
  const router = express.Router();
  for (const [path, type] of Object.entries(TYPES)) router.use(`/${path}`, referenceRouter(ctx, type));
  return router;
}

function referenceRouter(ctx, type) {
  const router = express.Router();
  const { db, audit } = ctx;
  const { table } = type;

  const all = db.prepare(`SELECT * FROM ${table}`);
  const find = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const used = db.prepare(type.usedBy).pluck();

  const membersOf = type.hasMultiFlag
    ? db.prepare('SELECT store_id FROM store_members WHERE multi_store_id = ?').pluck()
    : null;

  const describe = (row) => ({
    id: row.id,
    name: row.name,
    active: row.active === 1,
    ...(type.hasMultiFlag ? { isMulti: row.is_multi === 1, storeIds: row.is_multi === 1 ? membersOf.all(row.id) : [] } : {}),
    inUse: used.get({ id: row.id }) === 1,
  });

  // Magasins regroupés demandés pour un « multi » : des magasins simples
  // existants (actifs ou non). Renvoie la liste d'identifiants, ou null si
  // la demande est invalide.
  function memberIds(value, multiId) {
    if (!Array.isArray(value) || value.length > 200) return null;
    const ids = [...new Set(value.map(parseId))];
    if (ids.some((id) => !id || id === multiId)) return null;
    for (const id of ids) {
      const store = find.get(id);
      if (!store || store.is_multi === 1) return null;
    }
    return ids;
  }

  // Vrai si un autre élément porte déjà ce nom (majuscules et accents ignorés)
  function nameTaken(name, exceptId = null) {
    const wanted = comparableName(name);
    return all.all().some((row) => row.id !== exceptId && comparableName(row.name) === wanted);
  }

  function target(req, res) {
    const id = parseId(req.params.id);
    const row = id && find.get(id);
    if (!row) res.status(404).json({ error: req.t(type.notFound) });
    return row || null;
  }

  // Liste par ordre alphabétique français (« Épicerie » avec les « E »)
  router.get('/', (req, res) => {
    const rows = all.all().sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    res.json({ items: rows.map(describe) });
  });

  router.post('/', (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: req.t('references.nomInvalide') });
    const isMulti = req.body?.isMulti ?? false;
    if (type.hasMultiFlag && typeof isMulti !== 'boolean') {
      return res.status(400).json({ error: req.t('references.isMultiInvalide') });
    }
    if (nameTaken(name)) return res.status(409).json({ error: req.t(type.duplicate) });

    let id;
    if (type.hasMultiFlag) {
      id = db.prepare(`INSERT INTO ${table} (name, is_multi) VALUES (?, ?)`).run(name, isMulti ? 1 : 0).lastInsertRowid;
    } else {
      id = db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name).lastInsertRowid;
    }
    audit(`admin_${type.label}_added`, { admin: req.user.username, name, ...(type.hasMultiFlag && isMulti ? { multi: true } : {}), ip: req.ip });
    ctx.events?.notifyReferences(); // les téléphones connectés se mettent à jour
    res.status(201).json({ item: describe(find.get(id)) });
  });

  router.patch('/:id', (req, res) => {
    const row = target(req, res);
    if (!row) return;
    const { name: rawName, active, isMulti, storeIds } = req.body ?? {};
    if (rawName === undefined && active === undefined && (storeIds === undefined || !type.hasMultiFlag)) {
      return res.status(400).json({ error: req.t('references.rienAModifier') });
    }
    if (type.hasMultiFlag && isMulti !== undefined && isMulti !== (row.is_multi === 1)) {
      return res.status(400).json({ error: req.t('references.magasin.typeFixe') });
    }
    let members = null;
    if (type.hasMultiFlag && storeIds !== undefined) {
      if (row.is_multi !== 1) return res.status(400).json({ error: req.t('references.regroupement.seulMulti') });
      members = memberIds(storeIds, row.id);
      if (!members) return res.status(400).json({ error: req.t('references.regroupement.invalide') });
    }

    let name = row.name;
    if (rawName !== undefined) {
      name = cleanName(rawName);
      if (!name) return res.status(400).json({ error: req.t('references.nomInvalide') });
      if (nameTaken(name, row.id)) return res.status(409).json({ error: req.t(type.duplicate) });
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: req.t('references.activeInvalide') });
    }

    const newActive = active === undefined ? row.active : active ? 1 : 0;
    db.prepare(`UPDATE ${table} SET name = ?, active = ? WHERE id = ?`).run(name, newActive, row.id);
    const previousMembers = members ? membersOf.all(row.id) : null;
    if (members) {
      db.transaction(() => {
        db.prepare('DELETE FROM store_members WHERE multi_store_id = ?').run(row.id);
        const add = db.prepare('INSERT INTO store_members (multi_store_id, store_id) VALUES (?, ?)');
        for (const id of members) add.run(row.id, id);
      })();
    }

    // Journal : une ligne par changement réel
    const who = { admin: req.user.username, name, ip: req.ip };
    if (name !== row.name) audit(`admin_${type.label}_renamed`, { ...who, old: row.name });
    if (newActive === 0 && row.active === 1) audit(`admin_${type.label}_disabled`, who);
    if (newActive === 1 && row.active === 0) audit(`admin_${type.label}_reactivated`, who);
    if (members && [...members].sort().join() !== [...previousMembers].sort().join()) {
      audit(`admin_${type.label}_grouping_changed`, { ...who, stores: members.length });
    }

    // Renommage, (dés)activation… : les listes et les articles ne gardent que
    // l'identifiant ; les téléphones connectés refont leur synchronisation,
    // qui renvoie toutes les catégories, magasins et rayons (et ceux hors
    // ligne le feront à leur retour)
    ctx.events?.notifyReferences();
    res.json({ item: describe(find.get(row.id)) });
  });

  router.delete('/:id', (req, res) => {
    const row = target(req, res);
    if (!row) return;
    if (used.get({ id: row.id }) === 1) {
      return res.status(409).json({ error: req.t('references.dejaUtilise') });
    }
    try {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    } catch (err) {
      // Filet de sécurité : la base refuse aussi d'effacer un élément utilisé
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(409).json({ error: req.t('references.dejaUtilise') });
      }
      throw err;
    }
    audit(`admin_${type.label}_deleted`, { admin: req.user.username, name: row.name, ip: req.ip });
    ctx.events?.notifyReferences();
    res.status(204).end();
  });

  return router;
}
