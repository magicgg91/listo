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

// Bloc « À propos » des Réglages, zone « Version et mise à jour » : ce
// qu'elle affiche (calcul pur, testé automatiquement). Entrées :
// - commit : 40 caractères hexadécimaux, 'non précisé' (développement) ou
//   null (inconnu : hors ligne, ou pas encore reçu) ;
// - isAdmin : seul l'Admin voit l'état de la mise à jour et le bouton ;
// - result : réponse de GET /api/admin/update-check (null : pas encore reçue) ;
// - busy : vérification en cours ; online : réseau disponible.
// Renvoie :
// - version : { text, commit? } (commit : lien vers ce commit sur GitHub) ;
// - checked : « Vérifié il y a 15 min », ou null ;
// - chip : pastille d'état { tone: 'ok' | 'accent' | 'neutral', text, icon?,
//   commit?, label? } (commit : la pastille est un lien vers la nouvelle
//   version ; label : son libellé pour les lecteurs d'écran), ou null ;
// - button : bouton « Vérifier maintenant » affiché ; busy : il tourne.
const isCommitSha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

export function aboutVersion({ commit, isAdmin = false, result = null, busy = false, online = true, now = Date.now() }) {
  let version;
  if (isCommitSha(commit)) version = { text: commit.slice(0, 7), commit };
  else if (commit === 'non précisé') version = { text: 'non précisée' };
  else version = { text: online ? '…' : 'indisponible hors ligne' };

  // Ni état ni bouton : autre compte, développement, vérification
  // désactivée sur le serveur (LISTO_UPDATE_CHECK=off)
  const hidden = !isAdmin || commit === 'non précisé'
    || result?.state === 'desactive' || result?.state === 'developpement';
  if (hidden) return { version, upToDate: false, checked: null, chip: null, update: null, button: false, busy: false };

  if (!online) return { version, upToDate: false, checked: null, chip: { tone: 'neutral', text: 'Hors ligne' }, update: null, button: true, busy: false };

  // Ligne du haut : « Vérifié il y a 15 min », ou, à jour, « À jour · il y a
  // 15 min » (upToDate : la place manque sur un téléphone pour une pastille
  // en plus) ; chip : « Vérification impossible ». update : nouvelle version,
  // sur sa propre ligne (pastille-lien vers ce commit). Pendant une
  // vérification, l'état précédent reste.
  let chip = null;
  let update = null;
  const upToDate = result?.state === 'ok' && result.upToDate === true;
  if (upToDate) {
    // rien de plus : « À jour » est écrit dans la ligne du haut
  } else if (result?.state === 'ok' && isCommitSha(result.latest)) {
    const short = result.latest.slice(0, 7);
    update = { tone: 'accent', icon: 'alert', text: `Nouvelle version : ${short}`, commit: result.latest, label: `Nouvelle version disponible : ${short}, ouvrir sur GitHub` };
  } else if (result) {
    chip = { tone: 'neutral', text: 'Vérification impossible' };
  }
  const when = result?.checkedAt ? relativeTime(result.checkedAt, now) : '';
  const checked = when ? (upToDate ? when : `Vérifié ${when}`) : null;
  return { version, upToDate, checked, chip, update, button: true, busy };
}

// Bouton de tri de « Mes listes » : icône du tri ACTIF, libellé pour les
// lecteurs d'écran (tri actuel et effet d'un appui), message après un appui
export function listSortButton(sort) {
  return sort === 'alpha'
    ? { icon: 'az', label: 'Tri : ordre alphabétique. Appuyer pour trier par plus récentes', message: 'Tri : ordre alphabétique' }
    : { icon: 'clock', label: 'Tri : plus récentes d\'abord. Appuyer pour trier par ordre alphabétique', message: 'Tri : plus récentes d\'abord' };
}

// --- Priorité et échéance d'un élément (listes autres que les courses) ---
// L'échéance est une date seule « AAAA-MM-JJ », sans heure ni fuseau.
// « Aujourd'hui » se calcule toujours sur le téléphone, dans son fuseau
// (jamais avec la date du serveur) : une échéance aujourd'hui le reste toute
// la journée, et n'est « en retard » qu'à partir du lendemain.

const pad = (n) => String(n).padStart(2, '0');

// Date du jour sur le téléphone, « AAAA-MM-JJ » (heure locale)
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// « AAAA-MM-JJ » décalée de n jours (calcul sur la date seule, sans fuseau)
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// « ven. 24 oct. » (et l'année si ce n'est pas l'année en cours)
export function dueDateLabel(key, today = todayKey()) {
  const [y, m, d] = key.split('-').map(Number);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });
}

// Pastille d'échéance d'un élément, ou null sans échéance.
// state : 'late' (en retard), 'today', 'tomorrow', 'later', 'done' (coché :
// sa date, en gris, jamais « en retard »)
export function dueChip(dueDate, checked, today = todayKey()) {
  if (!dueDate) return null;
  const date = dueDateLabel(dueDate, today);
  if (checked) return { state: 'done', text: date, label: `Échéance : ${date}` };
  if (dueDate < today) return { state: 'late', text: `En retard · ${date}`, label: `Échéance : ${date}, en retard` };
  if (dueDate === today) return { state: 'today', text: "Aujourd'hui", label: "Échéance : aujourd'hui" };
  if (dueDate === addDays(today, 1)) return { state: 'tomorrow', text: 'Demain', label: 'Échéance : demain' };
  return { state: 'later', text: date, label: `Échéance : ${date}` };
}

// Pastille de priorité : élevée et basse seulement (normale : rien)
export function priorityChip(priority) {
  if (priority === 'high') return { icon: 'arrow-up', text: 'Élevée', label: 'Priorité élevée' };
  if (priority === 'low') return { icon: 'arrow-down', text: 'Basse', label: 'Priorité basse' };
  return null;
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

// --- Administration, onglet « Articles » ---
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

// « Dupliquer la liste » : nom proposé pour la copie, « <nom> (copie) », dans
// la limite des noms de liste (100 caractères)
export function copyName(name, max = 100) {
  const suffix = ' (copie)';
  return `${String(name).slice(0, max - suffix.length).trimEnd()}${suffix}`;
}
