// Recherche locale (design/recherche) : dans une liste, sur le nom des
// articles ; sur « Mes listes », sur le titre des listes. Une simple vue sur
// la copie locale : rien n'est modifié, rien n'est envoyé au serveur, et
// tout marche hors ligne.
//
// - Majuscules, accents et ligatures ignorés : « eclair » trouve « Éclair »,
//   « oeufs » trouve « Œufs ».
// - Le texte tapé est cherché tel quel, caractère par caractère : jamais lu
//   comme une expression régulière (« ( », « * », « < » ou « & » ne sont que
//   des caractères).
// - Le texte trouvé est rendu en morceaux (surlignés ou non) : l'écran les
//   pose comme texte simple dans <mark class="hit">, jamais comme du HTML.

// Lettres que la décomposition Unicode ne sépare pas de leur accent
const LIGATURES = { 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' };

// Forme « pliée » d'un caractère : minuscule, sans accent ni ligature
// (peut faire 0, 1 ou plusieurs caractères)
function foldChar(char) {
  const lower = char.toLowerCase();
  if (LIGATURES[lower]) return LIGATURES[lower];
  return lower.normalize('NFD').replace(/\p{M}/gu, '');
}

// Texte plié, avec pour chaque caractère plié sa place dans le texte
// d'origine : { folded, from, to } (from[i] et to[i] : début et fin, dans
// le texte d'origine, du caractère qui a donné le caractère plié i). Les
// espaces successifs comptent pour un seul.
export function foldText(text) {
  let folded = '';
  const from = [];
  const to = [];
  let index = 0;
  for (const char of String(text ?? '')) { // caractère par caractère (émojis compris)
    const end = index + char.length;
    let part = /\s/.test(char) ? ' ' : foldChar(char);
    if (part === ' ' && folded.endsWith(' ')) part = '';
    for (const c of part) {
      folded += c;
      from.push(index);
      to.push(end);
    }
    index = end;
  }
  return { folded, from, to };
}

// Texte cherché, plié et sans espace autour ('' : pas de recherche)
export function foldQuery(query) {
  return foldText(query).folded.trim();
}

// Vrai si quelque chose est cherché
export const isSearching = (query) => foldQuery(query) !== '';

// Places du texte cherché dans un texte : [[début, fin], …] dans le texte
// d'origine (toutes les occurrences, sans chevauchement), ou [] s'il n'y est
// pas. Recherche vide : [].
export function findHits(text, query) {
  const wanted = foldQuery(query);
  if (!wanted) return [];
  const source = String(text ?? '');
  const { folded, from, to } = foldText(source);
  const hits = [];
  let at = folded.indexOf(wanted); // simple comparaison de textes, jamais une expression régulière
  while (at !== -1) {
    const start = from[at];
    let end = to[at + wanted.length - 1];
    // Accent écrit à part, juste après sa lettre (« e » + « ́ ») : surligné
    // avec elle
    while (end < source.length && /\p{M}/u.test(source[end])) end++;
    // Deux caractères pliés venus du même caractère (« œ » → « oe ») : le
    // morceau surligné couvre le caractère entier
    const last = hits.at(-1);
    if (last && start < last[1]) last[1] = Math.max(last[1], end);
    else hits.push([start, end]);
    at = folded.indexOf(wanted, at + wanted.length);
  }
  return hits;
}

// Vrai si le texte contient le texte cherché (recherche vide : tout passe)
export function matches(text, query) {
  return !isSearching(query) || findHits(text, query).length > 0;
}

// Morceaux d'un texte : [{ text, hit }], hit vrai pour le texte trouvé.
// Recolés, ils redonnent exactement le texte d'origine.
export function highlightParts(text, query) {
  const source = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const [start, end] of findHits(source, query)) {
    if (start > last) parts.push({ text: source.slice(last, start), hit: false });
    parts.push({ text: source.slice(start, end), hit: true });
    last = end;
  }
  if (last < source.length || !parts.length) parts.push({ text: source.slice(last), hit: false });
  return parts.filter((part) => part.text !== '' || parts.length === 1);
}

// Vue d'une liste réduite aux articles trouvés (nom seulement, jamais la
// note) : { groups, done, count }. Les groupes sans résultat disparaissent ;
// les cochés trouvés restent dans « Dans le panier ». La vue d'origine
// n'est pas modifiée.
export function filterListView(view, query) {
  const keep = (item) => matches(item.name, query);
  const groups = view.groups
    .map((group) => ({ ...group, items: group.items.filter(keep) }))
    .filter((group) => group.items.length > 0);
  const done = view.done.filter(keep);
  const count = groups.reduce((sum, group) => sum + group.items.length, 0) + done.length;
  return { groups, done, count };
}

// Listes de « Mes listes » dont le titre contient le texte cherché
export function filterLists(lists, query) {
  return lists.filter((list) => matches(list.name, query));
}

// « 0 résultat », « 1 résultat », « 4 résultats »
export const resultsLabel = (count) => `${count} ${count > 1 ? 'résultats' : 'résultat'}`;
// « 0 liste », « 1 liste », « 2 listes »
export const listsLabel = (count) => `${count} ${count > 1 ? 'listes' : 'liste'}`;
