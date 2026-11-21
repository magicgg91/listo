// Rayons propres à un magasin (décisions du 21 novembre 2026) : règles
// partagées par le serveur (server/lists.js, routes des rayons, Claude) et
// par le téléphone (copie locale, écrans), comme subtasks.js.
//
// - Un rayon appartient à UN magasin simple (storeId) ou à tous les
//   magasins (storeId vide : « Tous les magasins », rayon commun). Un
//   magasin « multi » n'a jamais de rayons (ses listes n'en ont pas).
// - Rayons proposés à une liste de courses : ceux de son magasin simple et
//   les rayons communs ; liste sans magasin : les rayons communs seulement ;
//   liste « multi » : aucun.
// - Un même nom peut exister dans deux magasins (deux rayons distincts),
//   mais jamais deux fois parmi ce qu'une liste peut voir : {communs} ∪ {un
//   magasin}. Un rayon commun ne prend donc pas le nom d'un rayon d'un
//   magasin.
// - Changement de magasin d'une liste : un article dont le rayon n'est plus
//   proposé va dans le rayon proposé de même nom, sinon « Sans rayon ».
//
// Un rayon s'écrit ici { id, name, active, storeId } (forme envoyée au
// téléphone ; le serveur convertit ses lignes, voir describeAisle). Pas
// d'accès au réseau, ni à la base, ni à l'écran.

// Forme « comparable » d'un nom de rayon : sans majuscules, sans accents,
// espaces superflus retirés (« Crèmerie », « CREMERIE » et « crèmerie »
// sont le même nom). Même comparaison que les doublons de l'Administration.
export function aisleKey(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr') // technique : comparaison, la même dans toutes les langues
    .replace(/\s+/g, ' ')
    .trim();
}

// Magasin d'un rayon (null : rayon commun, « Tous les magasins »)
export const aisleStoreOf = (aisle) => aisle?.storeId ?? null;

// Le rayon peut-il servir dans une liste de ce magasin ? (storeId : magasin
// simple de la liste, ou null pour une liste sans magasin). Un rayon commun
// sert partout ; un rayon de magasin, seulement dans ce magasin.
export function aisleFits(aisle, storeId) {
  const own = aisleStoreOf(aisle);
  return own === null || own === (storeId ?? null);
}

// Rayons connus d'une liste de ce magasin (actifs ou non) : ceux qui
// groupent ses articles et nomment le rayon d'un article
export const aislesForStore = (aisles, storeId) => aisles.filter((aisle) => aisleFits(aisle, storeId));

// Rayons proposés (actifs) pour une liste de ce magasin
export const offeredAisles = (aisles, storeId) => aisles.filter((aisle) => aisle.active && aisleFits(aisle, storeId));

// Nouveau rayon d'un article quand sa liste passe au magasin storeId (ou à
// « aucun magasin », null) : le sien s'il sert encore là (même désactivé :
// un article garde un rayon désactivé) ; sinon le rayon proposé de même
// nom ; sinon null (« Sans rayon »). Un rayon inconnu de cette copie (pas
// encore synchronisé) est laissé tel quel : le serveur, qui les connaît
// tous, décide.
export function rematchAisle(aisleId, aisles, storeId) {
  if (aisleId === null || aisleId === undefined) return null;
  const current = aisles.find((aisle) => aisle.id === aisleId);
  if (!current) return aisleId;
  if (aisleFits(current, storeId)) return aisleId;
  const key = aisleKey(current.name);
  return offeredAisles(aisles, storeId).find((aisle) => aisleKey(aisle.name) === key)?.id ?? null;
}

// Rayon qui porte déjà ce nom là où il irait (storeId : magasin, ou null
// pour « Tous les magasins »), ou null si le nom est libre. exceptId : le
// rayon lui-même (renommage, déplacement).
// - Dans un magasin : refusé si le nom existe dans ce magasin ou parmi les
//   rayons communs ;
// - dans « Tous les magasins » : refusé si le nom existe n'importe où (il
//   serait vu par les listes de tous les magasins).
export function aisleNameClash(aisles, name, storeId, exceptId = null) {
  const key = aisleKey(name);
  const target = storeId ?? null;
  return aisles.find((aisle) => aisle.id !== exceptId && aisleKey(aisle.name) === key
    && (target === null || aisleStoreOf(aisle) === null || aisleStoreOf(aisle) === target)) ?? null;
}
