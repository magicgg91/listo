// Étiquettes des notes : règles communes au téléphone et au serveur
// (décisions du propriétaire du 24 novembre 2026, migration 42).
//
// Ce module ne touche pas à l'écran (il n'importe que la recherche,
// search.js, et la mise en forme des notes, note-format.js, sans écran ni
// réseau) : le serveur
// (server/labels.js, server/notes.js) et le téléphone (store.js, écrans des
// notes et de l'Administration) appliquent ainsi exactement les mêmes
// règles, testées automatiquement (test/labels.test.js).
//
// - Les étiquettes sont communes à tout le foyer : une seule réserve,
//   partagée par tous les comptes. Une étiquette a un nom (1 à 30
//   caractères, sans caractère de contrôle) et une couleur parmi huit.
// - Même nom = même étiquette, sans tenir compte des majuscules NI des
//   accents (« Été », « ete » et « ÉTÉ » ne font qu'une) : labelKey donne
//   la forme « comparable », gardée en base (colonne UNIQUE).
// - Une note porte au plus 10 étiquettes ; elles sont communes à la note
//   (tous ceux qui la voient les voient).

import { matches } from './search.js';
import { plainText } from './note-format.js';

// Les huit couleurs, dans l'ordre de la palette (leurs teintes sont des
// variables du kit de design, section 16.32 de listo.css)
export const LABEL_COLORS = ['gris', 'rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose'];
export const DEFAULT_LABEL_COLOR = 'bleu';
export const LABEL_NAME_MAX = 30;      // caractères
export const LABELS_PER_NOTE_MAX = 10; // étiquettes sur une même note
export const LABELS_MAX = 300;         // étiquettes en tout (filet de sécurité)

// Caractères refusés dans un nom : caractères de contrôle, privés, isolés,
// et caractères « invisibles » de mise en forme (sauf le liant des emojis,
// U+200D), qui pourraient tromper à l'affichage (même règle que le prénom
// d'un visiteur, server/reservations.js)
const FORBIDDEN = /[\p{Cc}\p{Co}\p{Cs}]|(?!‍)\p{Cf}/u;

// Nom d'une étiquette tel qu'il est gardé : espaces en trop retirés (début,
// fin, plusieurs espaces de suite) ; null s'il n'est pas valable (pas un
// texte, vide, plus de 30 caractères, caractère interdit)
export function cleanLabelName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > LABEL_NAME_MAX || FORBIDDEN.test(name)) return null;
  // Un nom fait seulement d'accents seuls (sans lettre) n'a pas de forme
  // comparable : refusé
  if (!labelKey(name)) return null;
  return name;
}

// Problème d'un nom saisi, pour l'écran : 'vide', 'long', 'caractere' ou
// null s'il est valable
export function labelNameProblem(value) {
  const name = String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) return 'vide';
  if ([...name].length > LABEL_NAME_MAX) return 'long';
  if (FORBIDDEN.test(name)) return 'caractere';
  if (!labelKey(name)) return 'caractere';
  return null;
}

// Forme « comparable » d'un nom : sans accents (décomposés puis retirés),
// en minuscules, espaces regroupés. Deux noms de même forme sont la même
// étiquette. Jamais affichée.
export function labelKey(name) {
  return String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const isLabelColor = (value) => LABEL_COLORS.includes(value);

// L'étiquette qui porte déjà ce nom (majuscules et accents ignorés), ou null
export function findLabel(labels, name) {
  const key = labelKey(name);
  if (!key) return null;
  return labels.find((label) => labelKey(label.name) === key) ?? null;
}

// Étiquettes dont le nom contient le texte cherché (majuscules et accents
// ignorés)
export function labelsMatching(labels, query) {
  const key = labelKey(query);
  if (!key) return [...labels];
  return labels.filter((label) => labelKey(label.name).includes(key));
}

// Étiquettes rangées par nom (compare : comparaison de textes dans la
// langue de l'écran ; à égalité, par numéro)
export function sortLabels(labels, compare = (a, b) => a.localeCompare(b)) {
  return [...labels].sort((a, b) => compare(a.name, b.name) || a.id - b.id);
}

// Étiquettes d'une note, rangées par nom : celles de la réserve dont le
// numéro est dans note.labelIds (une étiquette inconnue est ignorée)
export function noteLabels(note, labels, compare) {
  const ids = new Set(note?.labelIds ?? []);
  return sortLabels(labels.filter((label) => ids.has(label.id)), compare);
}

// Étiquettes utilisées par au moins une de ces notes (le filtre de l'écran
// « Notes » ne propose que celles-là), rangées par nom
export function usedLabels(notes, labels, compare) {
  const used = new Set(notes.flatMap((note) => note.labelIds ?? []));
  return sortLabels(labels.filter((label) => used.has(label.id)), compare);
}

// Liste d'étiquettes demandée pour une note (opération « note.labels ») :
// les numéros sans doublon, dans l'ordre croissant ; null si elle n'est pas
// valable (pas un tableau, numéro qui n'est pas un entier positif, plus de
// 10 étiquettes)
export function cleanLabelIds(value) {
  if (!Array.isArray(value)) return null;
  if (!value.every((id) => Number.isSafeInteger(id) && id > 0)) return null;
  const ids = [...new Set(value)].sort((a, b) => a - b);
  return ids.length > LABELS_PER_NOTE_MAX ? null : ids;
}

// Recherche dans les notes (écran « Notes ») : le titre, le texte (tel
// qu'il s'affiche, sans ses marques de mise en forme, et tel qu'il est
// écrit) et les noms des étiquettes de la note (labels : la réserve)
export function noteMatches(note, query, labels) {
  return matches(note?.title ?? '', query) || matches(plainText(note?.body ?? ''), query) || matches(note?.body ?? '', query)
    || noteLabels(note, labels).some((label) => matches(label.name, query));
}
