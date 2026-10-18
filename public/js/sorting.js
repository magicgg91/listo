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

// Tri d'une liste autre que les courses (choix de chaque téléphone, par
// liste) : seulement les éléments NON cochés (les cochés restent dans leur
// zone, voir splitDone).
// - 'alpha' : ordre alphabétique, exactement l'ordre d'origine (groupItems) ;
// - 'priority' : trois groupes avec un en-tête, « Priorité élevée »,
//   « Priorité normale », « Priorité basse » (groupe vide : pas d'en-tête),
//   ordre alphabétique dans chaque groupe ;
// - 'due' : une seule liste, échéance la plus proche d'abord (les dates
//   passées en tête), sans échéance à la fin ; à date égale, priorité
//   élevée d'abord, puis ordre alphabétique.
// Renvoie des groupes comme groupItems : [{ aisle: null, items }] ou, par
// priorité, [{ aisle: null, priority, label, items }].
export const ITEM_SORTS = ['alpha', 'priority', 'due'];
const PRIORITY_GROUPS = [['high', 'Priorité élevée'], ['normal', 'Priorité normale'], ['low', 'Priorité basse']];
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
const rankOf = (item) => PRIORITY_RANK[item.priority] ?? PRIORITY_RANK.normal;

export function sortTasks(items, sort = 'alpha') {
  if (sort === 'priority') {
    return PRIORITY_GROUPS
      .map(([priority, label]) => ({
        aisle: null,
        priority,
        label,
        items: items.filter((item) => (PRIORITY_RANK[item.priority] === undefined ? 'normal' : item.priority) === priority)
          .sort((a, b) => compareNames(a.name, b.name)),
      }))
      .filter((group) => group.items.length);
  }
  if (sort === 'due') {
    const byDue = (a, b) => {
      if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1; // sans échéance à la fin
      return String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')) || rankOf(a) - rankOf(b) || compareNames(a.name, b.name);
    };
    return items.length ? [{ aisle: null, items: [...items].sort(byDue) }] : [];
  }
  return groupItems(items, [], false);
}

// Zone des articles cochés (« Dans le panier » / « Terminés ») : les cochés
// quittent leur rayon (ou leur magasin) et vont dans une zone à part, du plus
// récemment coché au plus ancien (checkedAt, posé par le serveur ; à égalité,
// ordre alphabétique). Un rayon dont tous les articles sont cochés n'a plus
// rien à acheter : il disparaît de la partie « à acheter ».
// Renvoie { groups : rayons (ou magasins) des articles à acheter, comme
// groupItems ; done : articles cochés, dans l'ordre de la zone }.
// options.sort : tri d'une liste autre que les courses (sortTasks)
export function splitDone(items, aisles, isShopping, options = {}) {
  const done = items.filter((item) => item.checked)
    .sort((a, b) => String(b.checkedAt ?? '').localeCompare(String(a.checkedAt ?? '')) || compareNames(a.name, b.name));
  const toDo = items.filter((item) => !item.checked);
  const groups = !isShopping && options.sort ? sortTasks(toDo, options.sort) : groupItems(toDo, aisles, isShopping, options);
  return { groups, done };
}
