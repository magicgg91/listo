// Saisie de plusieurs articles (ou éléments) d'un coup dans la barre d'ajout
// d'une liste de courses ou de tâches (jamais d'une liste d'envies : un lien
// contient des virgules et des points-virgules).
//
// Un texte est découpé aux virgules, aux points-virgules et aux retours à la
// ligne. Une virgule entre deux chiffres n'est pas un séparateur : « 1,5 L
// de lait » reste un seul élément. Les espaces en trop sont retirés et les
// morceaux vides ignorés (« lait,, pain, » donne deux éléments).
//
// Module sans dépendance, testé à part (test/bulk-add.test.js). Le
// découpage parcourt le texte caractère par caractère, sans syntaxe récente
// d'expression régulière (les anciens iPhone ne la comprennent pas).

export const BULK_MAX = 20; // éléments au plus par saisie
export const ITEM_NAME_MAX = 100; // même longueur maximale qu'un ajout à la main (serveur : itemName)
// Longueur du champ d'ajout quand on peut y saisir plusieurs éléments (20 noms
// de 100 caractères et leurs séparateurs) ; une liste d'envies garde 100
export const BULK_INPUT_MAX = BULK_MAX * (ITEM_NAME_MAX + 2);
export const TOO_MANY = '20 éléments au plus à la fois. Rien n\'a été ajouté.';

const isDigit = (char) => char >= '0' && char <= '9';

// Même nettoyage qu'un nom saisi à la main (serveur : cleanName)
const clean = (text) => text.normalize('NFC').replace(/\s+/g, ' ').trim();

// Vrai si le texte contient au moins un séparateur (virgule décimale exclue)
export function hasSeparator(text) {
  const value = String(text ?? '');
  for (let i = 0; i < value.length; i++) {
    if (isSeparatorAt(value, i)) return true;
  }
  return false;
}

function isSeparatorAt(text, i) {
  const char = text[i];
  if (char === ';' || char === '\n' || char === '\r') return true;
  if (char !== ',') return false;
  // Virgule décimale : un chiffre juste avant ET juste après
  return !(isDigit(text[i - 1] ?? '') && isDigit(text[i + 1] ?? ''));
}

// Découpe un texte en noms nettoyés, sans morceau vide
export function splitItems(text) {
  const value = String(text ?? '');
  const pieces = [];
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    if (i === value.length || isSeparatorAt(value, i)) {
      const piece = clean(value.slice(start, i));
      if (piece) pieces.push(piece);
      start = i + 1;
    }
  }
  return pieces;
}

// Vérifie toute la saisie AVANT le moindre ajout (tout ou rien) :
// { names } si tout est bon, sinon { error } (phrase à afficher, qui dit
// quel morceau pose problème). 20 éléments au plus, 100 caractères au plus
// chacun.
export function planBulkAdd(text, { max = BULK_MAX, nameMax = ITEM_NAME_MAX } = {}) {
  const names = splitItems(text);
  if (names.length > max) return { error: TOO_MANY };
  const index = names.findIndex((name) => name.length > nameMax);
  if (index !== -1) {
    const name = names[index];
    const start = name.length > 30 ? `${name.slice(0, 30)}…` : name;
    const which = names.length > 1 ? `L'élément ${index + 1} (« ${start} »)` : `« ${start} »`;
    return { error: `${which} est trop long : ${nameMax} caractères au plus. Rien n'a été ajouté.` };
  }
  return { names };
}

// Texte collé sur plusieurs lignes (liste de notes) : le champ d'ajout n'a
// qu'une ligne et effacerait les retours à la ligne ; ils deviennent des
// points-virgules (des séparateurs), lignes vides retirées
export function joinPastedLines(text) {
  return String(text ?? '').split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean).join('; ');
}
