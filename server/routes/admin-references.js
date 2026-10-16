// Administration des données de référence : catégories de liste, magasins et
// rayons (réservée aux Admin, voir admin.js). Les trois fonctionnent de la
// même façon :
//   GET    /api/admin/<type>        lister
//   POST   /api/admin/<type>        ajouter (name ; isShopping pour une catégorie)
//   PATCH  /api/admin/<type>/:id    renommer, désactiver / réactiver
//   DELETE /api/admin/<type>/:id    supprimer, seulement si jamais utilisé
//
// Un élément déjà utilisé (par une liste, un article, l'historique) ne peut
// pas être supprimé : il peut seulement être désactivé. Désactivé, il n'est
// plus proposé pour les nouvelles listes et les nouveaux articles, mais ceux
// qui l'utilisent déjà le gardent.
//
// Les noms sont uniques sans tenir compte des majuscules ni des accents.

import express from 'express';
import { cleanName, comparableName, parseId } from '../validate.js';

// Les trois types de données de référence. Les noms de tables et de colonnes
// sont fixés ici, dans le code : ils ne viennent jamais de la requête.
const TYPES = {
  categories: {
    table: 'categories',
    label: 'categorie',                 // pour le journal
    notFound: 'Catégorie introuvable.',
    duplicate: 'Une catégorie porte déjà ce nom.',
    hasShoppingFlag: true,
    // Où cet élément peut être utilisé
    usedBy: 'SELECT EXISTS (SELECT 1 FROM lists WHERE category_id = :id)',
  },
  stores: {
    table: 'stores',
    label: 'magasin',
    notFound: 'Magasin introuvable.',
    duplicate: 'Un magasin porte déjà ce nom.',
    usedBy: 'SELECT EXISTS (SELECT 1 FROM lists WHERE store_id = :id)',
  },
  aisles: {
    table: 'aisles',
    label: 'rayon',
    notFound: 'Rayon introuvable.',
    duplicate: 'Un rayon porte déjà ce nom.',
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

  const describe = (row) => ({
    id: row.id,
    name: row.name,
    active: row.active === 1,
    ...(type.hasShoppingFlag ? { isShopping: row.is_shopping === 1 } : {}),
    inUse: used.get({ id: row.id }) === 1,
  });

  // Vrai si un autre élément porte déjà ce nom (majuscules et accents ignorés)
  function nameTaken(name, exceptId = null) {
    const wanted = comparableName(name);
    return all.all().some((row) => row.id !== exceptId && comparableName(row.name) === wanted);
  }

  function target(req, res) {
    const id = parseId(req.params.id);
    const row = id && find.get(id);
    if (!row) res.status(404).json({ error: type.notFound });
    return row || null;
  }

  // Liste par ordre alphabétique français (« Épicerie » avec les « E »)
  router.get('/', (req, res) => {
    const rows = all.all().sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    res.json({ items: rows.map(describe) });
  });

  router.post('/', (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Nom invalide (1 à 100 caractères).' });
    const isShopping = req.body?.isShopping ?? false;
    if (type.hasShoppingFlag && typeof isShopping !== 'boolean') {
      return res.status(400).json({ error: 'Valeur « isShopping » invalide (true ou false).' });
    }
    if (nameTaken(name)) return res.status(409).json({ error: type.duplicate });

    const id = type.hasShoppingFlag
      ? db.prepare(`INSERT INTO ${table} (name, is_shopping) VALUES (?, ?)`).run(name, isShopping ? 1 : 0).lastInsertRowid
      : db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name).lastInsertRowid;
    audit(`admin_${type.label}_ajoute`, { admin: req.user.username, nom: name, ip: req.ip });
    res.status(201).json({ item: describe(find.get(id)) });
  });

  router.patch('/:id', (req, res) => {
    const row = target(req, res);
    if (!row) return;
    const { name: rawName, active, isShopping } = req.body ?? {};
    if (rawName === undefined && active === undefined && (isShopping === undefined || !type.hasShoppingFlag)) {
      return res.status(400).json({ error: 'Rien à modifier.' });
    }

    let name = row.name;
    if (rawName !== undefined) {
      name = cleanName(rawName);
      if (!name) return res.status(400).json({ error: 'Nom invalide (1 à 100 caractères).' });
      if (nameTaken(name, row.id)) return res.status(409).json({ error: type.duplicate });
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Valeur « active » invalide (true ou false).' });
    }
    if (type.hasShoppingFlag && isShopping !== undefined && typeof isShopping !== 'boolean') {
      return res.status(400).json({ error: 'Valeur « isShopping » invalide (true ou false).' });
    }

    const newActive = active === undefined ? row.active : active ? 1 : 0;
    db.prepare(`UPDATE ${table} SET name = ?, active = ? WHERE id = ?`).run(name, newActive, row.id);
    if (type.hasShoppingFlag && isShopping !== undefined) {
      db.prepare(`UPDATE ${table} SET is_shopping = ? WHERE id = ?`).run(isShopping ? 1 : 0, row.id);
    }

    // Journal : une ligne par changement réel
    const who = { admin: req.user.username, nom: name, ip: req.ip };
    if (name !== row.name) audit(`admin_${type.label}_renomme`, { ...who, ancien: row.name });
    if (newActive === 0 && row.active === 1) audit(`admin_${type.label}_desactive`, who);
    if (newActive === 1 && row.active === 0) audit(`admin_${type.label}_reactive`, who);
    if (type.hasShoppingFlag && isShopping !== undefined && (isShopping ? 1 : 0) !== row.is_shopping) {
      audit(`admin_${type.label}_courses_change`, { ...who, courses: isShopping });
    }

    res.json({ item: describe(find.get(row.id)) });
  });

  router.delete('/:id', (req, res) => {
    const row = target(req, res);
    if (!row) return;
    if (used.get({ id: row.id }) === 1) {
      return res.status(409).json({ error: 'Cet élément est déjà utilisé : il peut être désactivé, pas supprimé.' });
    }
    try {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    } catch (err) {
      // Filet de sécurité : la base refuse aussi d'effacer un élément utilisé
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(409).json({ error: 'Cet élément est déjà utilisé : il peut être désactivé, pas supprimé.' });
      }
      throw err;
    }
    audit(`admin_${type.label}_supprime`, { admin: req.user.username, nom: row.name, ip: req.ip });
    res.status(204).end();
  });

  return router;
}
