// Administration, onglet « Articles » : l'historique commun des noms
// d'articles saisis dans les listes de courses (table item_history), qui
// alimente l'autocomplétion, le rayon habituel et le magasin habituel.
// Réservé aux Admin (voir admin.js). Les autres listes (tâches…) ne mémorisent
// rien (décision du 17 octobre 2026) : leurs éléments ne sont jamais comptés
// ni modifiés ici, même s'ils portent le même nom qu'un article.
//
//   GET  /api/admin/names?q=&sort=name|uses&offset=   noms, 50 par morceau
//   GET  /api/admin/names/impact?from=&to=            ce que changerait une correction
//   POST /api/admin/names/rename  { from, to }        corriger un nom partout
//   POST /api/admin/names/remove  { from }            retirer des suggestions
//   POST /api/admin/names/aisle   { from, aisleId }   changer le rayon habituel
//
// « from » est la forme normalisée d'un nom (name_normalized : minuscules,
// sans accents ni espaces superflus), telle que renvoyée par la liste.
//
// Ce que voit l'Admin : les noms et des compteurs, jamais le nom d'une liste,
// d'un membre ou d'un compte (l'Admin n'a pas accès au contenu des listes).
//
// Corriger « Tomatte » en « Tomate », en une seule transaction (tout ou rien) :
// - l'historique : toutes les lignes de l'ancien nom (ligne générale et
//   lignes par magasin) prennent le nouveau nom. Si le nouveau nom existe déjà
//   (fusion), les lignes du même magasin sont réunies : utilisations
//   additionnées, rayon de la ligne la plus utilisée (à égalité, celui du nom
//   corrigé ; si la ligne retenue n'a pas de rayon, celui de l'autre) ;
// - les listes de courses : chaque article non supprimé d'une liste de
//   courses non supprimée dont le nom normalisé est l'ancien prend le nouveau nom, avec une nouvelle date de
//   modification (la synchronisation des téléphones le récupère). Quantité,
//   note, photo, état coché, rayon et magasin ne changent pas ;
// - après l'écriture, les membres de chaque liste touchée sont prévenus en
//   temps réel, et l'action est inscrite au journal.
// Seuls les noms identiques une fois normalisés sont touchés : aucune
// correspondance approximative.
//
// Retirer des suggestions : seules les lignes de l'historique sont effacées ;
// les listes ne changent pas. Un téléphone qui ressaisit ce nom plus tard
// l'enregistre de nouveau (c'est normal).
//
// Changer le rayon habituel : un seul rayon pour le nom, écrit sur TOUTES ses
// lignes (générale et par magasin : sinon le rayon retenu pour un magasin
// passerait avant le nouveau, voir usualAisle dans public/js/history.js).
// aisleId null = aucun rayon. Les articles déjà dans les listes gardent leur
// rayon (aucune liste ne change). La date des lignes (last_used_at, la même
// que pour une correction) avance : c'est elle que la synchronisation des
// téléphones suit ; « event: refs » les prévient tout de suite.

import express from 'express';
import { cleanName, parseId } from '../validate.js';
import { normalizeItemName } from '../../public/js/history.js';

export const PAGE_SIZE = 50;
const KEY_MAX = 200;           // longueur maximale d'un nom normalisé reçu
const NOT_FOUND = 'Cet article n\'est plus enregistré (déjà corrigé ou retiré ?).';
const BAD_NAME = 'Nom invalide (1 à 100 caractères, sans caractère de contrôle).';
const BAD_AISLE = 'Rayon inconnu ou désactivé.';

// Nom corrigé : mêmes règles que le nom d'un article d'une liste (espaces
// nettoyés, 1 à 100 caractères), et en plus aucun caractère de contrôle
// (caractères invisibles, hors espaces déjà nettoyés). Renvoie null si invalide.
export function correctedName(value) {
  const name = cleanName(value);
  if (!name || /\p{Cc}/u.test(name)) return null;
  return name;
}

// Nom normalisé reçu dans la requête (« from »), ou null s'il est invalide
function keyFrom(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= KEY_MAX ? value : null;
}

export function adminNameRoutes(ctx) {
  const router = express.Router();
  const { db, audit } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    linesOf: db.prepare('SELECT * FROM item_history WHERE name_normalized = ?'),
    // Articles présents dans les listes de courses : non supprimés, dans une
    // liste de courses non supprimée (jamais les éléments des autres listes).
    // Le nom normalisé n'est pas en base : il est calculé ici.
    liveItems: db.prepare(`
      SELECT items.id, items.name, items.list_id FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL AND lists.type = 'shopping'
      WHERE items.deleted_at IS NULL
    `),
    renameItem: db.prepare('UPDATE items SET name = ?, updated_at = ? WHERE id = ?'),
    updateLine: db.prepare('UPDATE item_history SET use_count = ?, aisle_id = ?, last_used_at = ? WHERE id = ?'),
    moveLine: db.prepare('UPDATE item_history SET name_normalized = ? WHERE id = ?'),
    deleteLine: db.prepare('DELETE FROM item_history WHERE id = ?'),
    renameLines: db.prepare('UPDATE item_history SET display_name = ?, last_used_at = ? WHERE name_normalized = ?'),
    removeLines: db.prepare('DELETE FROM item_history WHERE name_normalized = ?'),
    aisleName: db.prepare('SELECT name FROM aisles WHERE id = ?').pluck(),
    activeAisle: db.prepare('SELECT id, name FROM aisles WHERE id = ? AND active = 1'),
    setAisle: db.prepare('UPDATE item_history SET aisle_id = ?, last_used_at = ? WHERE name_normalized = ?'),
  };

  // Nombre d'articles présents dans les listes de courses, par nom normalisé
  function countsByKey() {
    const counts = new Map();
    for (const item of q.liveItems.all()) {
      const key = normalizeItemName(item.name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  // Articles à renommer pour passer de l'ancien nom au nouveau : même nom
  // normalisé que l'ancien, et un nom écrit autrement que le nouveau
  function itemsToRename(fromKey, newName) {
    return q.liveItems.all().filter((item) => normalizeItemName(item.name) === fromKey && item.name !== newName);
  }

  // Nom affiché d'un nom normalisé : celui de la ligne générale (sans magasin)
  const displayNameOf = (lines) => (lines.find((l) => l.store_id === null) ?? lines[0]).display_name;

  // --- Liste des noms (une ligne par nom, lignes par magasin regroupées) ---
  // Recherche sans accents ni majuscules (sur le nom normalisé), tri par nom
  // ou par nombre d'utilisations, 50 noms par morceau (offset).
  router.get('/names', (req, res) => {
    const search = typeof req.query.q === 'string' ? normalizeItemName(req.query.q.slice(0, 100)) : '';
    const sort = req.query.sort === 'uses' ? 'uses' : 'name';
    const offset = /^\d{1,6}$/.test(String(req.query.offset ?? '0')) ? Number(req.query.offset ?? 0) : 0;
    // Tri choisi ici, dans le code (jamais un texte venu de la requête)
    const order = sort === 'uses' ? 'uses DESC, name_normalized' : 'name_normalized';
    const rows = db.prepare(`
      SELECT name_normalized,
        COALESCE(MAX(CASE WHEN store_id IS NULL THEN display_name END), MIN(display_name)) AS name,
        COALESCE(MAX(CASE WHEN store_id IS NULL THEN use_count END), MAX(use_count)) AS uses,
        MAX(CASE WHEN store_id IS NULL THEN aisle_id END) AS aisle_id
      FROM item_history
      WHERE instr(name_normalized, :search) > 0
      GROUP BY name_normalized
      ORDER BY ${order}
      LIMIT :limit OFFSET :offset
    `).all({ search, limit: PAGE_SIZE, offset });
    const total = db.prepare('SELECT COUNT(DISTINCT name_normalized) FROM item_history WHERE instr(name_normalized, ?) > 0')
      .pluck().get(search);
    const counts = countsByKey();
    res.json({
      names: rows.map((row) => ({
        key: row.name_normalized,
        name: row.name,
        aisleId: row.aisle_id,
        aisle: row.aisle_id === null ? null : q.aisleName.get(row.aisle_id) ?? null,
        uses: row.uses,
        inLists: counts.get(row.name_normalized) ?? 0,
      })),
      total,
      offset,
      pageSize: PAGE_SIZE,
    });
  });

  // Prépare une correction : vérifie les deux noms et calcule ce qui changera.
  // Renvoie { error, status } ou le détail de la correction.
  function plan(rawFrom, rawTo) {
    const fromKey = keyFrom(rawFrom);
    const fromLines = fromKey ? q.linesOf.all(fromKey) : [];
    if (!fromLines.length) return { status: 404, error: NOT_FOUND };
    const newName = correctedName(rawTo);
    if (!newName) return { status: 400, error: BAD_NAME };
    const toKey = normalizeItemName(newName);
    const oldName = displayNameOf(fromLines);
    const items = oldName === newName ? [] : itemsToRename(fromKey, newName);
    return {
      fromKey,
      fromLines,
      oldName,
      newName,
      toKey,
      unchanged: oldName === newName,
      merge: toKey !== fromKey && q.linesOf.all(toKey).length > 0,
      items,
      listIds: [...new Set(items.map((item) => item.list_id))],
    };
  }

  // Ce que changerait une correction (pour la confirmation) : nombres seulement
  router.get('/names/impact', (req, res) => {
    const p = plan(req.query.from, req.query.to);
    if (p.error) return res.status(p.status).json({ error: p.error });
    res.json({ oldName: p.oldName, newName: p.newName, unchanged: p.unchanged, merge: p.merge, items: p.items.length, lists: p.listIds.length });
  });

  // Corriger un nom partout, en une seule transaction
  router.post('/names/rename', (req, res) => {
    const p = plan(req.body?.from, req.body?.to);
    if (p.error) return res.status(p.status).json({ error: p.error });
    if (p.unchanged) return res.json({ changed: false, items: 0, lists: 0, merge: false });

    const now = nowIso();
    db.transaction(() => {
      // 1. Historique : fusion avec les lignes du nouveau nom, ou simple
      //    changement de nom des lignes
      if (p.toKey !== p.fromKey) {
        const targets = q.linesOf.all(p.toKey);
        for (const line of p.fromLines) {
          const target = targets.find((t) => t.store_id === line.store_id);
          if (!target) {
            q.moveLine.run(p.toKey, line.id);
            continue;
          }
          // Même magasin des deux côtés : une seule ligne reste
          const winner = line.use_count > target.use_count ? line : target;
          const other = winner === line ? target : line;
          q.updateLine.run(line.use_count + target.use_count, winner.aisle_id ?? other.aisle_id, now, target.id);
          q.deleteLine.run(line.id);
        }
      }
      // Nom affiché et date (pour la synchronisation des téléphones) de toutes
      // les lignes du nom corrigé
      q.renameLines.run(p.newName, now, p.toKey);
      // 2. Listes de courses : chaque article concerné prend le nouveau nom
      for (const item of p.items) q.renameItem.run(p.newName, now, item.id);
    })();

    // 3. Après l'écriture réussie : temps réel et journal
    for (const listId of p.listIds) ctx.events?.notifyList(listId);
    audit(p.merge ? 'admin_nom_fusionne' : 'admin_nom_corrige', {
      admin: req.user.username, ancien: p.oldName, nouveau: p.newName, corrections: p.items.length, listes: p.listIds.length, ip: req.ip,
    });
    res.json({ changed: true, items: p.items.length, lists: p.listIds.length, merge: p.merge });
  });

  // Retirer un nom des suggestions : l'historique seulement, pas les listes
  router.post('/names/remove', (req, res) => {
    const fromKey = keyFrom(req.body?.from);
    const lines = fromKey ? q.linesOf.all(fromKey) : [];
    if (!lines.length) return res.status(404).json({ error: NOT_FOUND });
    q.removeLines.run(fromKey);
    audit('admin_nom_retire', { admin: req.user.username, nom: displayNameOf(lines), ip: req.ip });
    res.status(204).end();
  });

  // Changer le rayon habituel d'un nom (toutes ses lignes), en une transaction
  router.post('/names/aisle', (req, res) => {
    const fromKey = keyFrom(req.body?.from);
    const lines = fromKey ? q.linesOf.all(fromKey) : [];
    if (!lines.length) return res.status(404).json({ error: NOT_FOUND });
    const raw = req.body?.aisleId;
    let aisle = null;
    if (raw !== null) {
      // Un identifiant de rayon existant ET actif (un nombre entier), sinon 400
      aisle = Number.isInteger(raw) && parseId(raw) ? q.activeAisle.get(raw) : null;
      if (!aisle) return res.status(400).json({ error: BAD_AISLE });
    }
    db.transaction(() => {
      q.setAisle.run(aisle?.id ?? null, nowIso(), fromKey);
    })();
    // Après l'écriture : les téléphones connectés relisent la mémoire des noms
    ctx.events?.notifyReferences();
    audit('nom_rayon_modifie', { admin: req.user.username, nom: displayNameOf(lines), rayon: aisle?.name ?? 'aucun', ip: req.ip });
    res.json({ aisleId: aisle?.id ?? null, aisle: aisle?.name ?? null });
  });

  return router;
}
