// Mise en forme des textes affichés (dates relatives, nombres d'articles,
// mise en gras du début d'une suggestion). Ces fonctions ne touchent pas à
// l'écran : elles sont testées automatiquement (test/front.test.js).

import { normalizeItemName } from './history.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Date relative courte, comme dans les maquettes :
// « à l'instant », « il y a 2 min », « il y a 3 h », « hier », « mar. », « 12 oct. »
export function relativeTime(iso, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = now - date.getTime();
  if (diff < MINUTE) return "à l'instant";
  if (diff < HOUR) return `il y a ${Math.floor(diff / MINUTE)} min`;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (date >= startOfToday) return `il y a ${Math.floor(diff / HOUR)} h`;
  if (date >= new Date(startOfToday.getTime() - DAY)) return 'hier';
  if (date >= new Date(startOfToday.getTime() - 6 * DAY)) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  }
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// « 1 article restant », « 11 articles restants »
export function remainingLabel(count) {
  return count === 1 ? '1 article restant' : `${count} articles restants`;
}

// Partie tapée d'une suggestion, à mettre en gras : renvoie [début, reste] si
// le nom commence par ce qui a été tapé (accents et majuscules ignorés),
// sinon [« », nom entier].
export function splitPrefix(name, typed) {
  const query = normalizeItemName(typed);
  if (query && normalizeItemName(name).startsWith(query)) {
    // On avance caractère par caractère tant que le début normalisé est plus
    // court que la saisie (un « é » compte comme un « e »).
    let cut = 0;
    while (cut < name.length && normalizeItemName(name.slice(0, cut)).length < query.length) cut++;
    return [name.slice(0, cut), name.slice(cut)];
  }
  return ['', name];
}

// Liste des prénoms pour les lecteurs d'écran : « Guillaume et Léa »
export function namesList(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

// Nom affiché proposé quand aucun n'est donné : l'identifiant avec une
// majuscule au début (« guillaume » devient « Guillaume »).
export function defaultDisplayName(username) {
  const name = String(username ?? '').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Date d'expiration d'un lien public : « 24 oct. 2026 à 18:30 »
export function dateTimeLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} à ${time}`;
}

// Temps restant avant une date : « Il reste 7 jours », « Il reste 5 heures »,
// « Il reste 20 minutes ». Arrondi au plus proche (une durée de 7 jours
// tout juste créée affiche bien « 7 jours »).
export function timeLeftLabel(iso, now = Date.now()) {
  const left = new Date(iso).getTime() - now;
  if (Number.isNaN(left)) return '';
  if (left <= 0) return 'Expiré';
  const hours = Math.round(left / HOUR);
  if (hours >= 48) return `Il reste ${Math.round(left / DAY)} jours`;
  if (hours >= 2) return `Il reste ${hours} heures`;
  const minutes = Math.ceil(left / MINUTE);
  if (minutes >= 2) return `Il reste ${minutes} minutes`;
  return "Il reste moins d'une minute";
}
