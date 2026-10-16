// Tri des articles d'une liste, partagé entre le serveur et le téléphone
// (le téléphone s'en servira hors ligne à l'étape 7).
//
// Règles du cahier des charges :
// - liste de courses : articles groupés par rayon, rayons par ordre
//   alphabétique français, « Sans rayon » en dernier, rayon vide non affiché ;
// - dans chaque rayon : ordre alphabétique, les articles cochés en bas ;
// - autre liste (tâches…) : un seul groupe, même ordre.

// Comparaison alphabétique française : « Épicerie » se range avec les « E »,
// et les majuscules ne comptent pas.
export function compareNames(a, b) {
  return a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }) || a.localeCompare(b, 'fr');
}

// items : articles non supprimés { name, checked, aisleId, … }
// aisles : rayons connus { id, name } (actifs ou non)
// isShopping : vrai pour une liste de courses
// Renvoie [{ aisle: { id, name } ou null (« Sans rayon »), items: [...] }]
export function groupItems(items, aisles, isShopping) {
  const byItem = (a, b) => (a.checked === b.checked ? compareNames(a.name, b.name) : a.checked ? 1 : -1);

  if (!isShopping) return items.length ? [{ aisle: null, items: [...items].sort(byItem) }] : [];

  const aisleById = new Map(aisles.map((aisle) => [aisle.id, aisle]));
  const groups = new Map(); // id du rayon (ou null) -> articles
  for (const item of items) {
    const key = aisleById.has(item.aisleId) ? item.aisleId : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return [...groups.entries()]
    .map(([id, list]) => ({
      aisle: id === null ? null : { id, name: aisleById.get(id).name },
      items: list.sort(byItem),
    }))
    .sort((a, b) => {
      if (a.aisle === null) return 1;  // « Sans rayon » toujours en dernier
      if (b.aisle === null) return -1;
      return compareNames(a.aisle.name, b.aisle.name);
    });
}
