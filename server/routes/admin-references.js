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
//
// Rayons propres à un magasin (21 novembre 2026, public/js/aisles.js) : un
// rayon appartient à un magasin simple (storeId) ou à « Tous les magasins »
// (storeId null). POST et PATCH acceptent storeId :
// - le nom est unique parmi ce qu'une liste peut voir : un rayon d'un
//   magasin ne reprend ni le nom d'un autre rayon de ce magasin, ni celui
//   d'un rayon commun ; un rayon commun ne reprend le nom d'aucun rayon ;
// - déplacer un rayon vers un magasin (depuis « Tous les magasins » ou un
//   autre magasin) est refusé tant que des articles de listes d'un autre
//   magasin, ou sans magasin, l'utilisent (le message donne le nombre de
//   listes) ; vers « Tous les magasins », c'est toujours possible si le nom
//   est libre. Seules comptent les listes de courses présentes à magasin
//   simple ou sans magasin (une liste « multi » ignore les rayons ; un
//   changement de magasin, ou le retour au type « Courses », range de
//   nouveau les articles, voir completeItems dans server/lists.js) ;
// - un magasin qui a des rayons est « utilisé » : il ne se supprime pas.

import express from 'express';
import { cleanName, comparableName, parseId } from '../validate.js';
import { compareText } from '../../public/js/i18n.js';
import { aisleNameClash } from '../../public/js/aisles.js';
import { requestLocale } from '../locale.js';

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
                 OR EXISTS (SELECT 1 FROM store_members WHERE store_id = :id)
                 OR EXISTS (SELECT 1 FROM aisles WHERE store_id = :id)`,
  },
  aisles: {
    table: 'aisles',
    label: 'aisle',
    notFound: 'references.rayon.introuvable',
    duplicate: 'references.rayon.doublon',
    hasStore: true,
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
    // Rayon : son magasin (null : « Tous les magasins »)
    ...(type.hasStore ? { storeId: row.store_id ?? null } : {}),
    inUse: used.get({ id: row.id }) === 1,
  });

  // --- Rayons : magasin et règle des noms (type.hasStore) ---
  const findStore = db.prepare('SELECT id, name, active, is_multi FROM stores WHERE id = ?');
  const simpleStores = db.prepare('SELECT id, name, active FROM stores WHERE is_multi = 0');
  // Listes de courses présentes, à magasin simple ou sans magasin, dont un
  // article présent utilise ce rayon alors que leur magasin n'est pas
  // storeId (voir plus haut)
  const listsElsewhere = db.prepare(`
    SELECT COUNT(DISTINCT lists.id) FROM items
    JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL AND lists.type = 'shopping'
    LEFT JOIN stores ON stores.id = lists.store_id
    WHERE items.aisle_id = :aisleId AND items.deleted_at IS NULL
      AND COALESCE(stores.is_multi, 0) = 0
      AND (lists.store_id IS NULL OR lists.store_id <> :storeId)
  `).pluck();

  // Magasin demandé pour un rayon : null (« Tous les magasins ») ou un
  // magasin simple existant (actif ou non). Renvoie { storeId } ou null si
  // la demande est invalide.
  function aisleStoreOf(value) {
    if (value === null) return { storeId: null };
    const id = parseId(value);
    const store = id && findStore.get(id);
    if (!store || store.is_multi === 1) return null;
    return { storeId: store.id };
  }

  // Refus d'un nom de rayon (rayon existant au même endroit, ou commun ;
  // pour un rayon commun, rayon de n'importe quel magasin) : la clé du
  // message et ses valeurs, ou null si le nom est libre
  function aisleNameRefusal(name, storeId, exceptId = null) {
    const rows = all.all().map((row) => ({ id: row.id, name: row.name, active: row.active === 1, storeId: row.store_id ?? null }));
    const clash = aisleNameClash(rows, name, storeId, exceptId);
    if (!clash) return null;
    if (clash.storeId === null) return { key: 'references.rayon.doublon.commun', params: {} };
    const store = findStore.get(clash.storeId)?.name ?? '';
    if (storeId === null) return { key: 'references.rayon.doublon.versCommun', params: { store } };
    return { key: 'references.rayon.doublon.magasin', params: { store } };
  }

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

  // Liste par ordre alphabétique de la langue de l'Admin (en français,
  // « Épicerie » avec les « E »)
  router.get('/', (req, res) => {
    const locale = requestLocale(req, ctx.config);
    const rows = all.all().sort((a, b) => compareText(a.name, b.name, { locale, sensitivity: 'base' }));
    // Rayons : en plus, les magasins simples (groupes de l'écran, choix du
    // magasin d'un rayon), dans le même ordre
    const stores = type.hasStore
      ? { stores: simpleStores.all().sort((a, b) => compareText(a.name, b.name, { locale, sensitivity: 'base' })).map((st) => ({ id: st.id, name: st.name, active: st.active === 1 })) }
      : {};
    res.json({ items: rows.map(describe), ...stores });
  });

  router.post('/', (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: req.t('references.nomInvalide') });
    const isMulti = req.body?.isMulti ?? false;
    if (type.hasMultiFlag && typeof isMulti !== 'boolean') {
      return res.status(400).json({ error: req.t('references.isMultiInvalide') });
    }
    // Rayon : son magasin (sans storeId : « Tous les magasins »)
    let place = { storeId: null };
    if (type.hasStore && req.body?.storeId !== undefined) {
      place = aisleStoreOf(req.body.storeId);
      if (!place) return res.status(400).json({ error: req.t('references.rayon.magasinInvalide') });
    }
    if (type.hasStore) {
      const refusal = aisleNameRefusal(name, place.storeId);
      if (refusal) return res.status(409).json({ error: req.t(refusal.key, refusal.params) });
    } else if (nameTaken(name)) return res.status(409).json({ error: req.t(type.duplicate) });

    let id;
    if (type.hasMultiFlag) {
      id = db.prepare(`INSERT INTO ${table} (name, is_multi) VALUES (?, ?)`).run(name, isMulti ? 1 : 0).lastInsertRowid;
    } else if (type.hasStore) {
      id = db.prepare('INSERT INTO aisles (name, store_id) VALUES (?, ?)').run(name, place.storeId).lastInsertRowid;
    } else {
      id = db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name).lastInsertRowid;
    }
    audit(`admin_${type.label}_added`, {
      admin: req.user.username, name, ...(type.hasMultiFlag && isMulti ? { multi: true } : {}),
      ...(type.hasStore && place.storeId !== null ? { store: findStore.get(place.storeId).name } : {}), ip: req.ip,
    });
    ctx.events?.notifyReferences({ lists: true }); // les téléphones connectés se mettent à jour
    res.status(201).json({ item: describe(find.get(id)) });
  });

  router.patch('/:id', (req, res) => {
    const row = target(req, res);
    if (!row) return;
    const { name: rawName, active, isMulti, storeIds, storeId: rawStore } = req.body ?? {};
    const moving = type.hasStore && rawStore !== undefined;
    if (rawName === undefined && active === undefined && (storeIds === undefined || !type.hasMultiFlag) && !moving) {
      return res.status(400).json({ error: req.t('references.rienAModifier') });
    }
    // Rayon : magasin demandé (inchangé sans storeId)
    let place = type.hasStore ? { storeId: row.store_id ?? null } : null;
    if (moving) {
      place = aisleStoreOf(rawStore);
      if (!place) return res.status(400).json({ error: req.t('references.rayon.magasinInvalide') });
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
      if (!type.hasStore && nameTaken(name, row.id)) return res.status(409).json({ error: req.t(type.duplicate) });
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: req.t('references.activeInvalide') });
    }
    // Rayon renommé ou déplacé : le nom doit être libre à sa (nouvelle)
    // place ; déplacé vers un magasin, aucune liste d'ailleurs ne doit
    // l'utiliser
    const previousStore = type.hasStore ? row.store_id ?? null : null;
    if (type.hasStore && (rawName !== undefined || place.storeId !== previousStore)) {
      const refusal = aisleNameRefusal(name, place.storeId, row.id);
      if (refusal) return res.status(409).json({ error: req.t(refusal.key, refusal.params) });
    }
    if (type.hasStore && place.storeId !== null && place.storeId !== previousStore) {
      const count = listsElsewhere.get({ aisleId: row.id, storeId: place.storeId });
      if (count > 0) {
        return res.status(409).json({ error: req.t('references.rayon.deplacementRefuse', { count, store: findStore.get(place.storeId).name }) });
      }
    }

    const newActive = active === undefined ? row.active : active ? 1 : 0;
    if (type.hasStore) {
      db.prepare('UPDATE aisles SET name = ?, active = ?, store_id = ? WHERE id = ?').run(name, newActive, place.storeId, row.id);
    } else {
      db.prepare(`UPDATE ${table} SET name = ?, active = ? WHERE id = ?`).run(name, newActive, row.id);
    }
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
    if (type.hasStore && place.storeId !== previousStore) {
      const storeName = (id) => (id === null ? 'all' : findStore.get(id)?.name ?? String(id));
      audit('admin_aisle_moved', { ...who, from: storeName(previousStore), to: storeName(place.storeId) });
    }
    if (members && [...members].sort().join() !== [...previousMembers].sort().join()) {
      audit(`admin_${type.label}_grouping_changed`, { ...who, stores: members.length });
    }

    // Renommage, (dés)activation… : les listes et les articles ne gardent que
    // l'identifiant ; les téléphones connectés refont leur synchronisation,
    // qui renvoie toutes les catégories, magasins et rayons (et ceux hors
    // ligne le feront à leur retour)
    ctx.events?.notifyReferences({ lists: true });
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
    ctx.events?.notifyReferences({ lists: true });
    res.status(204).end();
  });

  return router;
}
