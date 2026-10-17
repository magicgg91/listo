// Tri des articles d'une liste, partagé entre le serveur et le téléphone
// (le téléphone s'en sert aussi, et s'en servira hors ligne).
//
// Règles du cahier des charges :
// - liste de courses : articles groupés par rayon, rayons par ordre
//   alphabétique français, « Sans rayon » en dernier, rayon vide non affiché ;
// - dans chaque rayon : ordre alphabétique, les articles cochés en bas ;
// - liste « multi » : même chose, groupée par magasin au lieu du rayon,
//   « Sans magasin » en dernier ;
// - autre liste (tâches…) : un seul groupe, même ordre.

// Comparaison alphabétique française : « Épicerie » se range avec les « E »,
// et les majuscules ne comptent pas.
export function compareNames(a, b) {
  return a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }) || a.localeCompare(b, 'fr');
}

// Vrai si la liste est « multi » : liste de courses dont le magasin est de
// type « multi ». Ses articles sont alors groupés par magasin, sans rayon.
// list : liste telle que décrite par le serveur ({ category, store }).
export function isMultiList(list) {
  return Boolean(list?.category?.isShopping && list?.store?.isMulti);
}

// Range des articles par groupe (rayon ou magasin), « sans » en dernier.
// refs : rayons ou magasins connus { id, name } (actifs ou non) ;
// keyOf(item) : identifiant du rayon ou du magasin de l'article.
function groupBy(items, refs, keyOf, field) {
  const byItem = (a, b) => (a.checked === b.checked ? compareNames(a.name, b.name) : a.checked ? 1 : -1);
  const refById = new Map(refs.map((ref) => [ref.id, ref]));
  const groups = new Map(); // id du rayon ou du magasin (ou null) -> articles
  for (const item of items) {
    const key = refById.has(keyOf(item)) ? keyOf(item) : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({
      [field]: id === null ? null : { id, name: refById.get(id).name },
      items: list.sort(byItem),
    }))
    .sort((a, b) => {
      if (a[field] === null) return 1;  // « Sans rayon » / « Sans magasin » toujours en dernier
      if (b[field] === null) return -1;
      return compareNames(a[field].name, b[field].name);
    });
}

// items : articles non supprimés { name, checked, aisleId, storeId, … }
// aisles : rayons connus { id, name } (actifs ou non)
// isShopping : vrai pour une liste de courses
// options.stores : magasins connus, pour une liste « multi » (options.byStore)
// Renvoie [{ aisle: { id, name } ou null (« Sans rayon »), items: [...] }],
// ou, pour une liste « multi », [{ store: { id, name } ou null (« Sans
// magasin »), items: [...] }].
export function groupItems(items, aisles, isShopping, { byStore = false, stores = [] } = {}) {
  if (!isShopping) {
    const byItem = (a, b) => (a.checked === b.checked ? compareNames(a.name, b.name) : a.checked ? 1 : -1);
    return items.length ? [{ aisle: null, items: [...items].sort(byItem) }] : [];
  }
  if (byStore) return groupBy(items, stores, (item) => item.storeId, 'store');
  return groupBy(items, aisles, (item) => item.aisleId, 'aisle');
}
