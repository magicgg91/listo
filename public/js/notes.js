// Règles des notes communes au téléphone et au serveur (étape 2 du cadrage
// docs/cadrage-accueil-notes-notifications.md, 23 novembre 2026).
//
// Ce module n'importe que note-format.js (mise en forme du texte, lui-même
// sans import) et ne touche pas à l'écran : le serveur
// (server/notes.js) et le téléphone (store.js, écrans des notes) appliquent
// ainsi exactement les mêmes règles, testées automatiquement
// (test/notes.test.js).
//
// - Limites : titre, texte, nombre de notes.
// - Titre affiché : le titre, sinon la première ligne du texte (l'écran dit
//   « Note sans titre » si les deux sont vides). Titre et extrait d'une
//   carte : le texte sans ses marques de mise en forme (plainText,
//   note-format.js, 24 novembre 2026) : « **a** » s'y lit « a ».
// - Adresses web cliquables : seulement http: et https: (note-format.js) ;
//   tout le reste reste du texte (jamais javascript:, data:…). L'écran
//   construit les liens avec des éléments <a> et textContent.
// - Ordre des notes (épinglées d'abord). (Catégories des notes :
//   abandonnées le 23 novembre 2026.)

import { plainText } from './note-format.js';

export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 20000;
export const NOTES_MAX = 2000;        // par personne, corbeille comprise
export const NOTE_TRASH_DAYS = 30;    // ensuite, effacée par le ménage nocturne

// Titre d'une note tel qu'il s'affiche : le titre, sinon la première ligne
// non vide du texte, sans ses marques ; '' si les deux sont vides (« Note
// sans titre »)
export function noteTitle(note) {
  const title = (note?.title ?? '').trim();
  if (title) return title;
  const first = plainText(note?.body ?? '').split('\n').find((line) => line.trim() !== '');
  return first ? first.trim().slice(0, NOTE_TITLE_MAX) : '';
}

// Début du texte montré sur une carte (et dans une notification) : le texte
// sans ses marques, sans sa première ligne quand elle sert déjà de titre ;
// lignes vides retirées, lignes mises bout à bout (deux ou trois lignes de
// carte en montrent le plus possible)
export function noteExcerpt(note, max = 300) {
  let lines = plainText(note?.body ?? '').split('\n');
  if (!(note?.title ?? '').trim()) {
    const index = lines.findIndex((line) => line.trim() !== '');
    lines = index < 0 ? [] : lines.slice(index + 1);
  }
  return lines.map((line) => line.trim()).filter(Boolean).join(' ').slice(0, max);
}

// --- Adresses web ---
// Règles des liens (http et https seulement) : dans note-format.js, avec la
// mise en forme du texte ; reprises ici pour les modules qui les lisaient
export { safeLink, linkParts } from './note-format.js';

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
