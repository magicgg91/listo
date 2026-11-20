// Lecture de la quantité dans le texte de la barre d'ajout, pour les listes
// de courses SEULEMENT (quantityFor) : dans une tâche, le nombre fait le plus
// souvent partie de la phrase (« 3 appels à passer ») ; une liste d'envies
// n'a pas de quantité. Rien n'est converti ni calculé : la quantité reste du
// texte.
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
// Langues (20 novembre 2026) : les formats sont les mêmes partout ; seuls
// les mots reconnus changent (unités, conditionnements, petits mots, « de »
// ou « of » retiré après l'unité). Ils sont rangés plus bas, une liste par
// langue (WORDS). La langue est celle des écrans (getLocale), ou celle
// donnée à readQuantity(texte, langue).
// En anglais (américain) : « 2 kg of apples », « 12 oz cheese », « 2 lbs
// beef », « 1 dozen eggs » (quantité « 1 dozen »), « 3 boxes eggs »,
// « apples x6 » ; rien n'est lu pour « 7up », « 2 in 1 shampoo », « 3 for 2 ».
//
// Module simple (seules dépendances : le type de la liste, list-types.js, et
// la langue des écrans, i18n.js), testé à part (test/quantity.test.js), sans
// syntaxe d'expression régulière récente (les anciens iPhone ne la
// comprennent pas).

import { isShoppingList } from './list-types.js';
import { getLocale } from './i18n.js';

export const QUANTITY_MAX = 30; // serveur : quantity (optionalText, 30)

// Mots reconnus à la saisie, par langue. Ce ne sont pas des textes affichés
// (ils ne vont donc pas dans public/js/i18n/) : une nouvelle langue ajoute
// ici ses propres listes, sur le modèle du français.
// - measures : unités de mesure, majuscules ou minuscules, les seules qui
//   peuvent être collées au nombre (« 500g », « 12oz ») ;
// - packs : contenants et conditionnements (« 3 boîtes de thon »), au
//   singulier ; le pluriel est reconnu par ses terminaisons (endings :
//   « boîtes », « rouleaux », « boxes ») ou écrit en entier (plurals :
//   « loaves ») ;
// - smallWords : petits mots qui, juste après un nombre, montrent que le
//   nombre fait partie du nom (« 2 en 1 shampoing », « 3 pour 2 ») : rien
//   n'est lu ;
// - links : mot retiré juste après l'unité (« 2 kg de pommes ») ;
//   elided : le même mot quand il perd sa voyelle (« 2 kg d'oignons »).
const WORDS = {
  fr: {
    measures: ['mg', 'g', 'kg', 'ml', 'cl', 'dl', 'l'], // technique : mots reconnus à la saisie
    packs: ['boîte', 'boite', 'paquet', 'sachet', 'bouteille', 'pot', 'barquette', 'lot', 'pack', 'tranche', 'brique', 'canette', 'rouleau'], // technique : mots reconnus à la saisie
    endings: ['s', 'x'], // technique : mots reconnus à la saisie
    plurals: [],
    smallWords: ['en', 'à', 'a', 'au', 'aux', 'pour', 'par', 'et', 'ou', 'sur', 'sous', 'sans', 'avec', 'fois', 'de', 'du', 'des', 'd', 'x', '×'], // technique : mots reconnus à la saisie
    links: ['de'], // technique : mots reconnus à la saisie
    elided: ['d'], // technique : mots reconnus à la saisie
  },
  en: {
    // Système métrique et mesures américaines (« lbs » : pluriel courant de « lb »)
    measures: ['mg', 'g', 'kg', 'ml', 'cl', 'dl', 'l', 'lb', 'lbs', 'oz', 'pt', 'qt', 'gal'], // technique : mots reconnus à la saisie
    // « dozen » se lit comme un conditionnement : « 1 dozen eggs » → « 1 dozen »
    // + « eggs » ; les mesures écrites en entier aussi (« 2 pounds beef »)
    packs: ['dozen', 'pound', 'ounce', 'pint', 'quart', 'gallon', 'pack', 'box', 'bag', 'bottle', 'can', 'jar', 'carton', 'bunch', 'roll', 'tin', 'tub', 'packet', 'slice', 'loaf'], // technique : mots reconnus à la saisie
    endings: ['s', 'es'], // technique : mots reconnus à la saisie
    plurals: ['loaves'], // technique : mots reconnus à la saisie
    smallWords: ['in', 'into', 'for', 'of', 'and', 'or', 'by', 'to', 'per', 'with', 'without', 'x', '×', 'times', 'a', 'an', 'the', 'on', 'at', 'up', 'plus', 'from'], // technique : mots reconnus à la saisie
    links: ['of'], // technique : mots reconnus à la saisie
    elided: [],
  },
};

// Langue dont les listes sont lues : celle demandée si elle a ses listes,
// sinon celle des écrans, sinon le français. (Un appel comme
// textes.map(readQuantity) donne le numéro du texte à la place de la langue :
// c'est alors la langue des écrans.)
const LANGUAGES = Object.keys(WORDS);
const languageOf = (locale) => [locale, getLocale()].find((value) => LANGUAGES.includes(value)) ?? 'fr';

const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const AT_START = new RegExp(`^${NUMBER}(\\S*) (.+)$`);
const AT_END = new RegExp(`^(.*\\S) [x×] ?${NUMBER}$`, 'i');
const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
const APOSTROPHES = ["'", '’'];

const lower = (word, locale) => word.toLocaleLowerCase(locale);

// Vrai si le mot est une unité reconnue dans cette langue (au pluriel aussi)
export function isUnit(word, locale = getLocale()) {
  const language = languageOf(locale);
  const words = WORDS[language];
  const value = lower(word, language);
  if (words.measures.includes(value) || words.packs.includes(value) || words.plurals.includes(value)) return true;
  return words.endings.some((end) => value.endsWith(end) && words.packs.includes(value.slice(0, -end.length)));
}

// Ce que la barre d'ajout tire d'un texte, selon le type de la liste :
// { name, quantity }. Seul point de décision : une liste de courses lit la
// quantité (readQuantity) ; une liste de tâches ou d'envies garde tout le
// texte comme nom (espaces en trop retirés), sans quantité.
export function quantityFor(list, text) {
  if (isShoppingList(list)) return readQuantity(text);
  return { name: String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim(), quantity: '' };
}

// Lit la quantité d'un texte : { name, quantity } (quantity : « » si rien
// n'est lu). Mots reconnus : ceux de la langue des écrans, ou de « locale ».
export function readQuantity(text, locale = getLocale()) {
  const language = languageOf(locale);
  const words = WORDS[language];
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
    if (!words.measures.includes(lower(glued, language))) return none;
    return result(withoutLink(rest, words, language), `${number}${glued}`);
  }
  const parts = rest.split(' ');
  if (isUnit(parts[0], language)) {
    if (parts.length < 2) return none; // « 2 kg » seul : pas de nom
    return result(withoutLink(parts.slice(1).join(' '), words, language), `${number} ${parts[0]}`);
  }
  // Nombre suivi directement du nom (« 6 oeufs »), sauf petit mot (« 2 en 1 shampoing »)
  const first = lower(parts[0], language).replace(/['’]$/, '');
  if (words.smallWords.includes(first) || elidedLength(parts[0], words, language)) return none;
  return result(rest, number);
}

// Mot de liaison juste après l'unité : retiré (« 2 kg de pommes », « 2 kg
// d'oignons », « 2 kg of apples »), seulement comme mot entier
// (« 2 kg delicatessen » garde son nom)
function withoutLink(name, words, locale) {
  const first = name.split(' ')[0];
  if (words.links.includes(lower(first, locale))) return name.slice(first.length).trim();
  const elided = elidedLength(name, words, locale);
  if (elided) return name.slice(elided).trim();
  return name;
}

// Longueur du mot élidé au début du texte (« d' » ou « d’ » : 2), sinon 0
function elidedLength(text, words, locale) {
  const value = lower(text, locale);
  const found = words.elided.find((word) => APOSTROPHES.some((mark) => value.startsWith(word + mark)));
  return found ? found.length + 1 : 0;
}
