// Lecture de la quantité dans le texte de la barre d'ajout (listes de
// courses et de tâches ; jamais les listes d'envies, qui n'ont pas de
// quantité). Rien n'est converti ni calculé : la quantité reste du texte.
//
// Formats reconnus :
// - au début, un nombre (entier ou décimal : « 1,5 » ou « 1.5 ») suivi d'une
//   unité facultative puis du nom : « 6 oeufs », « 2 kg pommes », « 2 kg de
//   pommes », « 2 kg d'oignons », « 500g farine », « 1,5 L lait » ; le « de »
//   ou « d' » juste après l'unité est retiré ;
// - à la fin : « oeufs x6 », « oeufs ×6 », « oeufs x 6 ».
//
// Dans le doute, rien n'est lu (tout le texte reste le nom) : il ne reste
// pas de nom (« 6 », « 2 kg ») ; le nombre est collé à autre chose qu'une
// unité (« 7up », « 3suisses ») ; le nombre est au milieu (« tarte 6 parts ») ;
// le mot qui suit le nombre est un petit mot (« 2 en 1 shampoing ») ; la
// quantité dépasse 30 caractères (limite du serveur). Pour qu'un nombre ne
// soit jamais lu, il suffit de l'écrire après le nom (« shampoing 2 en 1 »).
//
// Module sans dépendance, testé à part (test/quantity.test.js), sans syntaxe
// d'expression régulière récente (les anciens iPhone ne la comprennent pas).

export const QUANTITY_MAX = 30; // serveur : quantity (optionalText, 30)

// Unités de mesure (collées au nombre ou non) : majuscules ou minuscules
const MEASURES = ['mg', 'g', 'kg', 'ml', 'cl', 'dl', 'l'];
// Contenants et conditionnements (singulier ou pluriel)
const PACKS = ['boîte', 'boite', 'paquet', 'sachet', 'bouteille', 'pot', 'barquette', 'lot', 'pack', 'tranche', 'brique', 'canette', 'rouleau'];
// Petits mots qui, juste après un nombre, montrent que le nombre fait partie
// du nom (« 2 en 1 shampoing », « 3 pour 2 ») : rien n'est lu
const SMALL_WORDS = ['en', 'à', 'a', 'au', 'aux', 'pour', 'par', 'et', 'ou', 'sur', 'sous', 'sans', 'avec', 'fois', 'de', 'du', 'des', 'd', 'x', '×'];

const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const AT_START = new RegExp(`^${NUMBER}(\\S*) (.+)$`);
const AT_END = new RegExp(`^(.*\\S) [x×] ?${NUMBER}$`, 'i');
const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

const lower = (word) => word.toLocaleLowerCase('fr');

// Vrai si le mot est une unité reconnue (pluriel en s, ou en x pour « rouleaux »)
export function isUnit(word) {
  const value = lower(word);
  if (MEASURES.includes(value) || PACKS.includes(value)) return true;
  return (value.endsWith('s') || value.endsWith('x')) && PACKS.includes(value.slice(0, -1));
}

// Lit la quantité d'un texte : { name, quantity } (quantity : « » si rien n'est lu)
export function readQuantity(text) {
  const clean = String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const none = { name: clean, quantity: '' };
  const result = (name, quantity) => (name && HAS_LETTER.test(name) && quantity.length <= QUANTITY_MAX ? { name, quantity } : none);

  // À la fin : « oeufs x6 », « oeufs ×6 », « oeufs x 6 »
  const end = AT_END.exec(clean);
  if (end) return result(end[1], end[2]);

  // Au début : nombre, unité facultative, nom
  const start = AT_START.exec(clean);
  if (!start) return none;
  const [, number, glued, rest] = start;
  if (glued) {
    // Collé au nombre : seulement une unité de mesure (« 500g », « 1,5L ») ;
    // sinon c'est un nom (« 7up », « 3suisses »)
    if (!MEASURES.includes(lower(glued))) return none;
    return result(withoutDe(rest), `${number}${glued}`);
  }
  const words = rest.split(' ');
  if (isUnit(words[0])) {
    if (words.length < 2) return none; // « 2 kg » seul : pas de nom
    return result(withoutDe(words.slice(1).join(' ')), `${number} ${words[0]}`);
  }
  // Nombre suivi directement du nom (« 6 oeufs »), sauf petit mot (« 2 en 1 shampoing »)
  const first = lower(words[0]).replace(/['’]$/, '');
  if (SMALL_WORDS.includes(first) || /^d['’]/i.test(words[0])) return none;
  return result(rest, number);
}

// « de » ou « d' » juste après l'unité : retiré (« 2 kg de pommes », « 2 kg d'oignons »)
function withoutDe(name) {
  if (/^de( |$)/i.test(name) || /^d['’]/i.test(name)) return name.slice(2).trim();
  return name;
}
