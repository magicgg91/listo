// Mise en forme des textes affichés (dates relatives, nombres d'articles,
// mise en gras du début d'une suggestion). Ces fonctions ne touchent pas à
// l'écran : elles sont testées automatiquement (test/front.test.js).

import { normalizeItemName } from './history.js';
import { countItems, itemWords } from './words.js';

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

// « 1 article restant », « 11 articles restants » (liste de courses) ;
// « 1 élément restant », « 11 éléments restants » (autre liste).
// listOrFlag : la liste, ou vrai pour une liste de courses (voir words.js).
export function remainingLabel(count, listOrFlag) {
  return `${countItems(count, listOrFlag)} ${count === 1 ? 'restant' : 'restants'}`;
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

// Ligne « Mise à jour » (Réglages › À propos, Admin seulement), d'après la
// réponse de GET /api/admin/update-check. Renvoie { icon, title, sub,
// commit? } (commit : la nouvelle version, pour le lien vers GitHub), ou null
// quand la ligne ne s'affiche pas (vérification désactivée sur le serveur,
// ou version de développement). result vaut null pendant la vérification.
export function updateCheckLine(result, { online = true } = {}) {
  const line = (icon, sub) => ({ icon, title: 'Mise à jour', sub });
  if (!online) return line('cloud-off', 'Indisponible hors ligne');
  if (!result) return line('sync', 'Vérification…');
  if (result.state === 'desactive' || result.state === 'developpement') return null;
  if (result.state === 'ok' && result.upToDate === true) return line('check', 'À jour');
  if (result.state === 'ok' && typeof result.latest === 'string' && /^[0-9a-f]{40}$/.test(result.latest)) {
    return {
      icon: 'alert',
      title: `Nouvelle version disponible : ${result.latest.slice(0, 7)}`,
      sub: 'Sur le serveur : docker compose pull && docker compose up -d',
      commit: result.latest,
    };
  }
  return line('cloud-off', 'Vérification impossible');
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

// --- Administration, onglet « Noms enregistrés » ---
// Seules les listes de courses mémorisent des noms (décision du 17 octobre
// 2026) : ces textes parlent donc d'« articles », par le module de mots
// (countItems(n, true) : « 1 article », « 3 articles »).

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const listsOfShopping = (count) => `${count} ${count === 1 ? 'liste' : 'listes'} de courses`;

// Sous-titre d'un nom : « Crèmerie · 12 utilisations · 3 articles en liste »
// (le rayon habituel seulement s'il y en a un). Dans chaque morceau, les
// espaces sont insécables : une coupure de ligne ne tombe qu'entre deux morceaux.
export function savedNameSub({ aisle, uses, inLists }) {
  return [
    aisle,
    plural(uses, 'utilisation', 'utilisations'),
    inLists ? `${countItems(inLists, true)} en liste` : `aucun ${itemWords(true).one} en liste`,
  ].filter(Boolean).map((part) => part.replaceAll(' ', '\u00a0')).join(' · ');
}

// Texte de la confirmation d'une correction (réponse de /api/admin/names/impact)
export function renameImpactText({ oldName, newName, merge, items, lists }) {
  const what = merge
    ? `« ${oldName} » sera fusionné avec « ${newName} », déjà enregistré.`
    : `« ${oldName} » deviendra « ${newName} ».`;
  const where = items
    ? `${countItems(items, true)} ${items === 1 ? 'sera corrigé' : 'seront corrigés'}, dans ${listsOfShopping(lists)}.`
    : `Aucun ${itemWords(true).one} en liste ne porte ce nom : seules les suggestions changent.`;
  return `${what} ${where}`;
}

// Message affiché après une correction (réponse de /api/admin/names/rename)
export function renameDoneText({ items, lists }) {
  return items ? `${countItems(items, true)} ${items === 1 ? 'corrigé' : 'corrigés'}, dans ${listsOfShopping(lists)}` : 'Nom corrigé dans les suggestions';
}
