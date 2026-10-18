// Route du mode scan (listes de courses, compte connecté) :
//   POST /api/lists/:id/products   { code }   nom d'un produit à partir de
//                                             son code-barres
//
// Le code est dans le corps de la requête, jamais dans l'adresse : il
// n'apparaît pas dans les journaux du proxy (Nginx Proxy Manager). Ni le code
// ni le nom ne sont écrits dans les journaux de Listo.
//
// Ordre de recherche : (1) l'article de la liste ouverte, regardé par le
// téléphone lui-même (scan pour cocher) ; (2) un article de MES listes
// (celles dont le compte est membre, articles supprimés depuis moins de 30
// jours compris) qui porte ce code : mon nom, sans rien demander à Open Food
// Facts ; (3) Open Food Facts.
//
// Réponses (toujours Cache-Control: no-store, comme toute l'API) :
// - 200 { status: 'known', name, note } : produit déjà connu de mes listes
//   (ni identifiant ni nom de liste) ; aucune demande sortante ;
// - 200 { status: 'found', name, brand, quantity } : produit trouvé ;
// - 200 { status: 'unknown' } : produit inconnu (ou non alimentaire, ou code
//   propre à un magasin) : le téléphone propose de taper le nom ;
// - 200 { status: 'unavailable' } : Open Food Facts injoignable, lent, ou
//   limite atteinte : même chose, sans message technique ;
// - 200 { status: 'disabled' } : recherche coupée (LISTO_PRODUCT_LOOKUP=off) ;
// - 400 : code-barres invalide ; 404 : liste inconnue, dont le compte n'est
//   pas membre, ou qui n'est pas une liste de courses ; 429 : plus de 30
//   recherches dans la minute pour ce compte.

import express from 'express';
import { OpError } from '../lists.js';
import { normalizeBarcode } from '../products.js';

export function productRoutes(ctx) {
  const router = express.Router();
  const products = ctx.products;

  router.post('/lists/:id/products', async (req, res) => {
    // Droits d'abord : membre de la liste, et liste de courses
    let list;
    try {
      list = ctx.lists.listForMember(req.user, req.params.id);
    } catch (err) {
      if (err instanceof OpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
    if (list.is_shopping !== 1) return res.status(404).json({ error: 'Le scan existe seulement dans les listes de courses.' });
    if (!products.enabled()) return res.json({ status: 'disabled' });
    if (!products.allow(req.user.id)) return res.status(429).json({ error: 'Trop de recherches. Réessayez dans une minute.' });
    const code = normalizeBarcode(req.body?.code);
    if (!code) return res.status(400).json({ error: 'Code-barres invalide.' });
    // Mes produits d'abord : mon nom gagne, Open Food Facts n'est pas appelé
    // (rien dans le compteur des demandes sortantes)
    const known = ctx.lists.knownProduct(req.user, code);
    if (known) return res.json({ status: 'known', name: known.name, note: known.note });
    res.json(await products.lookup(code));
  });

  return router;
}
