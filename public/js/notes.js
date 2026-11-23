// Règles des notes communes au téléphone et au serveur (étape 2 du cadrage
// docs/cadrage-accueil-notes-notifications.md, 23 novembre 2026).
//
// Ce module n'importe rien et ne touche pas à l'écran : le serveur
// (server/notes.js) et le téléphone (store.js, écrans des notes) appliquent
// ainsi exactement les mêmes règles, testées automatiquement
// (test/notes.test.js).
//
// - Limites : titre, texte, nombre de notes.
// - Titre affiché : le titre, sinon la première ligne du texte (l'écran dit
//   « Note sans titre » si les deux sont vides).
// - Adresses web cliquables : seulement http: et https:, reconnues par une
//   règle simple ; tout le reste reste du texte (jamais javascript:, data:…).
//   L'écran construit les liens avec des éléments <a> et textContent.
// - Ordre des notes (épinglées d'abord). (Catégories des notes :
//   abandonnées le 23 novembre 2026.)

export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 20000;
export const NOTES_MAX = 2000;        // par personne, corbeille comprise
export const NOTE_TRASH_DAYS = 30;    // ensuite, effacée par le ménage nocturne

// Titre d'une note tel qu'il s'affiche : le titre, sinon la première ligne
// non vide du texte ; '' si les deux sont vides (« Note sans titre »)
export function noteTitle(note) {
  const title = (note?.title ?? '').trim();
  if (title) return title;
  const first = (note?.body ?? '').split('\n').find((line) => line.trim() !== '');
  return first ? first.trim().slice(0, NOTE_TITLE_MAX) : '';
}

// Début du texte montré sur une carte : le texte, sans sa première ligne
// quand elle sert déjà de titre ; lignes vides retirées, lignes mises bout
// à bout (deux ou trois lignes de carte en montrent le plus possible)
export function noteExcerpt(note, max = 300) {
  let lines = (note?.body ?? '').split('\n');
  if (!(note?.title ?? '').trim()) {
    const index = lines.findIndex((line) => line.trim() !== '');
    lines = index < 0 ? [] : lines.slice(index + 1);
  }
  return lines.map((line) => line.trim()).filter(Boolean).join(' ').slice(0, max);
}

// --- Adresses web ---

// Une adresse commence par http:// ou https:// et va jusqu'au prochain
// espace ; la ponctuation qui la suit dans une phrase (point, virgule,
// parenthèse, guillemet…) n'en fait pas partie.
const URL_START = /\bhttps?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,;:!?)\]}'»›"]+$/;

// Adresse sûre à ouvrir, ou null : seulement http: ou https:, avec un nom
// de site, sans identifiant ni mot de passe dans l'adresse
export function safeLink(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.href;
}

// Découpe un texte en morceaux : { text } (texte simple) ou { text, href }
// (adresse web cliquable). Les morceaux remis bout à bout redonnent
// exactement le texte (retours à la ligne compris).
export function linkParts(text) {
  const source = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(URL_START)) {
    const raw = match[0].replace(TRAILING, '');
    const href = safeLink(raw);
    if (!href) continue;
    if (match.index > last) parts.push({ text: source.slice(last, match.index) });
    parts.push({ text: raw, href });
    last = match.index + raw.length;
  }
  if (last < source.length) parts.push({ text: source.slice(last) });
  return parts;
}

// --- Ordre et corbeille ---

// Notes visibles (hors corbeille) et notes de la corbeille
export const liveNotes = (notes) => notes.filter((note) => !note.deletedAt);
export const trashedNotes = (notes) => notes.filter((note) => note.deletedAt)
  .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));

export const NOTE_SORTS = ['recent', 'alpha'];

// Ordre des notes : épinglées d'abord (pinned : Set des notes que j'ai
// épinglées), puis les plus récemment modifiées (sort 'recent') ou par
// ordre alphabétique du titre affiché ('alpha' ; compare : comparaison de
// textes dans la langue de l'écran)
export function sortNotes(notes, pinned, sort = 'recent', compare = (a, b) => a.localeCompare(b)) {
  const pin = (note) => (pinned.has(note.id) ? 1 : 0);
  return [...notes].sort((a, b) => pin(b) - pin(a)
    || (sort === 'alpha' ? compare(noteTitle(a), noteTitle(b)) : 0)
    || String(b.updatedAt).localeCompare(String(a.updatedAt))
    || String(a.id).localeCompare(String(b.id)));
}

// Jours restants avant l'effacement d'une note de la corbeille (au moins 1 :
// le ménage passe toutes les heures)
export function trashDaysLeft(deletedAt, now = Date.now()) {
  const purgeAt = Date.parse(deletedAt) + NOTE_TRASH_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((purgeAt - now) / (24 * 60 * 60 * 1000)));
}
