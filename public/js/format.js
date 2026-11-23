// Mise en forme des textes affichés (dates relatives, nombres d'articles,
// mise en gras du début d'une suggestion). Ces fonctions ne touchent pas à
// l'écran : elles sont testées automatiquement (test/front.test.js).

import { normalizeItemName } from './history.js';
import { itemWords } from './words.js';
import { formatPrice } from './wishes.js';
import { repeatSentence } from './repeat.js';
import { isDueTime, isLate, nowTime, timeLabel } from './due-time.js';
import { t, formatDate, formatTime, formatList, getLocale, intlTag } from './i18n.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Date relative courte, comme dans les maquettes :
// « à l'instant », « il y a 2 min », « il y a 3 h », « hier », « mar. », « 12 oct. »
export function relativeTime(iso, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = now - date.getTime();
  if (diff < MINUTE) return t('format.relatif.instant');
  if (diff < HOUR) return t('format.relatif.minutes', { minutes: Math.floor(diff / MINUTE) });

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (date >= startOfToday) return t('format.relatif.heures', { hours: Math.floor(diff / HOUR) });
  if (date >= new Date(startOfToday.getTime() - DAY)) return t('format.relatif.hier');
  if (date >= new Date(startOfToday.getTime() - 6 * DAY)) {
    return formatDate(date, { weekday: 'short' });
  }
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return formatDate(date, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
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

// Liste des prénoms pour les lecteurs d'écran : « Guillaume et Léa »,
// « Guillaume, Léa et Marie » (dans la grammaire de la langue, formatList)
export const namesList = (names) => formatList(names);

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
// Version inconnue, envoyée telle quelle par le serveur (GET /api/about)
const UNSPECIFIED = 'non précisé'; // technique : valeur reçue du serveur, comparée, jamais affichée

export function aboutVersion({ commit, isAdmin = false, result = null, busy = false, online = true, now = Date.now() }) {
  let version;
  if (isCommitSha(commit)) version = { text: commit.slice(0, 7), commit };
  else if (commit === UNSPECIFIED) version = { text: t('format.version.nonPrecisee') };
  else version = { text: online ? '…' : t('format.version.horsLigne') };

  // Ni état ni bouton : autre compte, développement, vérification
  // désactivée sur le serveur (LISTO_UPDATE_CHECK=off)
  const hidden = !isAdmin || commit === UNSPECIFIED
    || result?.state === 'desactive' || result?.state === 'developpement';
  if (hidden) return { version, upToDate: false, checked: null, chip: null, update: null, button: false, busy: false };

  if (!online) return { version, upToDate: false, checked: null, chip: { tone: 'neutral', text: t('format.version.pastille.horsLigne') }, update: null, button: true, busy: false };

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
    update = { tone: 'accent', icon: 'alert', text: t('format.version.nouvelle', { short }), commit: result.latest, label: t('format.version.nouvelle.label', { short }) };
  } else if (result) {
    chip = { tone: 'neutral', text: t('format.version.impossible') };
  }
  const when = result?.checkedAt ? relativeTime(result.checkedAt, now) : '';
  const checked = when ? (upToDate ? when : t('format.version.verifie', { when })) : null;
  return { version, upToDate, checked, chip, update, button: true, busy };
}

// Bouton de tri de « Mes listes » : icône du tri ACTIF, libellé pour les
// lecteurs d'écran (tri actuel et effet d'un appui), message après un appui
export function listSortButton(sort) {
  return sort === 'alpha'
    ? { icon: 'az', label: t('format.tri.alpha.label'), message: t('format.tri.alpha') }
    : { icon: 'clock', label: t('format.tri.recentes.label'), message: t('format.tri.recentes') };
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

// Date du jour en toutes lettres, pour l'en-tête de l'Accueil : « Lundi 23
// novembre » en français, “Monday, November 23” en anglais (première lettre
// en majuscule dans toutes les langues)
export function longToday(now = new Date(), { locale = getLocale() } = {}) {
  const text = formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' }, { locale });
  return text.charAt(0).toLocaleUpperCase(intlTag(locale)) + text.slice(1);
}

// « ven. 24 oct. » (et l'année si ce n'est pas l'année en cours), dans la
// langue des écrans (« Fri, Oct 24 » en anglais)
export function dueDateLabel(key, today = todayKey()) {
  const [y, m, d] = key.split('-').map(Number);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatDate(new Date(Date.UTC(y, m - 1, d)), {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });
}

// Pastille d'échéance d'un élément, ou null sans échéance.
// state : 'late' (en retard), 'today', 'tomorrow', 'later', 'done' (coché :
// sa date, en gris, jamais « en retard »)
// dueTime : heure « HH:MM » facultative (ajoutée au texte : « Aujourd'hui ·
// 18:30 ») ; now : heure actuelle « HH:MM » (une tâche du jour passe en
// retard dès que son heure est dépassée)
export function dueChip(dueDate, checked, today = todayKey(), dueTime = null, now = nowTime()) {
  if (!dueDate) return null;
  const time = isDueTime(dueTime) ? timeLabel(dueTime) : '';
  // Le jour, suivi de l'heure s'il y en a une : « Demain · 18:30 » (texte),
  // « demain à 18:30 » (lecteurs d'écran)
  const at = (day) => (time ? t('format.echeance.jourHeure', { day, time }) : day);
  const spokenAt = (day) => (time ? t('format.jourAHeure', { day, time }) : day);
  const date = dueDateLabel(dueDate, today);
  if (checked) return { state: 'done', text: at(date), label: t('format.echeance.label', { when: spokenAt(date) }) };
  if (isLate(dueDate, dueTime, today, now)) {
    return dueDate === today
      ? { state: 'late', text: t('format.echeance.retard', { when: time }), label: t('format.echeance.label.retard', { when: spokenAt(t('format.echeance.aujourdhui.parle')) }) }
      : { state: 'late', text: t('format.echeance.retard', { when: at(date) }), label: t('format.echeance.label.retard', { when: spokenAt(date) }) };
  }
  if (dueDate === today) return { state: 'today', text: at(t('format.echeance.aujourdhui')), label: t('format.echeance.label', { when: spokenAt(t('format.echeance.aujourdhui.parle')) }) };
  if (dueDate === addDays(today, 1)) return { state: 'tomorrow', text: at(t('format.echeance.demain')), label: t('format.echeance.label', { when: spokenAt(t('format.echeance.demain.parle')) }) };
  return { state: 'later', text: at(date), label: t('format.echeance.label', { when: spokenAt(date) }) };
}

// Pastille de priorité : élevée et basse seulement (normale : rien)
// Nouveautés : repère texte d'une ligne en halo (jamais la couleur seule) :
// « Ajouté par Marie », « Modifié par Marie », « Coché par Marie »,
// « Décoché par Marie ». kind : 'added', 'updated', 'checked', 'unchecked'.
export function newsMark(kind, by) {
  if (kind === 'added') return t('format.nouveaute.ajoute', { name: by });
  if (kind === 'checked') return t('format.nouveaute.coche', { name: by });
  if (kind === 'unchecked') return t('format.nouveaute.decoche', { name: by });
  return t('format.nouveaute.modifie', { name: by }); // 'updated' et tout autre cas
}

// Pastille de « Mes listes » lue par un lecteur d'écran : « 1 nouveauté »,
// « 3 nouveautés », « plus de 30 nouveautés »
export function newsBadgeLabel(text) {
  if (text === '30+') return t('format.nouveautes.plusDe30');
  return t('format.nouveautes', { count: Number(text) });
}

// Libellé d'une priorité, en toutes lettres (fiches à consulter), lu au
// moment de l'affichage (get), dans la langue choisie
export const PRIORITY_LABELS = {
  get low() { return t('format.priorite.basse'); },
  get normal() { return t('format.priorite.normale'); },
  get high() { return t('format.priorite.elevee'); },
};

// Fiche d'un article sur la page du lien public (lecture seule) : les
// lignes de texte { label, text }, dans l'ordre de la fiche à consulter de
// l'application, seulement pour ce que le serveur a envoyé (priorité et
// échéance : si elles sont activées pour la liste ; code-barres : s'il
// existe). La photo est montrée à part. grouping : « aisle », « store » ou
// « none » (pas une liste de courses) ; place : nom du rayon (ou du magasin
// d'une liste « multi »), null pour « Sans rayon » / « Sans magasin ».
export function publicItemDetails(item, { grouping, place = null, today = todayKey(), type = null }) {
  const shopping = grouping !== 'none';
  const wishes = type === 'wishes'; // liste d'envies : « Souhait », « Reçu », prix
  const one = itemWords(wishes ? { type } : shopping).one;
  const state = wishes
    ? (item.checked ? t('format.fiche.etat.recu') : t('format.fiche.etat.pasRecu'))
    : item.checked ? (shopping ? t('format.fiche.etat.panier') : t('format.fiche.etat.termine')) : (shopping ? t('format.fiche.etat.acheter') : t('format.fiche.etat.faire'));
  const rows = [
    [one.charAt(0).toUpperCase() + one.slice(1), item.name], // « Article », « Élément » ou « Souhait »
    [t('format.fiche.etat'), state],
    item.quantity ? [t('format.fiche.quantite'), item.quantity] : null,
    wishes && Number.isInteger(item.priceCents) ? [t('format.fiche.prix'), formatPrice(item.priceCents)] : null,
    item.note ? [t('format.fiche.note'), item.note] : null,
    'priority' in item ? [t('format.fiche.priorite'), PRIORITY_LABELS[item.priority ?? 'normal'] ?? PRIORITY_LABELS.normal] : null,
    'dueDate' in item ? [t('format.fiche.echeance'), item.dueDate ? publicDueText(item, today) : t('format.fiche.echeance.aucune')] : null,
    item.dueDate && item.repeat ? [t('format.fiche.repetition'), repeatSentence(item.repeat)] : null,
    item.ean ? [t('format.fiche.codeBarres'), item.ean] : null,
    grouping === 'aisle' ? [t('format.fiche.rayon'), place ?? t('format.fiche.rayon.aucun')] : null,
    grouping === 'store' ? [t('format.fiche.magasin'), place ?? t('format.fiche.magasin.aucun')] : null,
  ];
  return rows.filter(Boolean).map(([label, text]) => ({ label, text }));
}

// Échéance de la fiche publique : « ven. 24 oct. », ou « ven. 24 oct. à 18:30 »
function publicDueText(item, today) {
  const day = dueDateLabel(item.dueDate, today);
  return isDueTime(item.dueTime) ? t('format.jourAHeure', { day, time: timeLabel(item.dueTime) }) : day;
}

export function priorityChip(priority) {
  if (priority === 'high') return { icon: 'arrow-up', text: t('format.priorite.elevee'), label: t('format.priorite.elevee.label') };
  if (priority === 'low') return { icon: 'arrow-down', text: t('format.priorite.basse'), label: t('format.priorite.basse.label') };
  return null;
}

// Date d'expiration d'un lien public : « 24 oct. 2026 à 18:30 »
export function dateTimeLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = formatTime(date, { twoDigits: true }); // « 09:05 » ; « 9:05 AM » en anglais
  return t('format.jourAHeure', { day, time });
}

// Temps restant avant une date : « Il reste 7 jours », « Il reste 5 heures »,
// « Il reste 20 minutes ». Arrondi au plus proche (une durée de 7 jours
// tout juste créée affiche bien « 7 jours »).
export function timeLeftLabel(iso, now = Date.now()) {
  const left = new Date(iso).getTime() - now;
  if (Number.isNaN(left)) return '';
  if (left <= 0) return t('format.reste.expire');
  const hours = Math.round(left / HOUR);
  if (hours >= 48) return t('format.reste.jours', { days: Math.round(left / DAY) });
  if (hours >= 2) return t('format.reste.heures', { hours });
  const minutes = Math.ceil(left / MINUTE);
  if (minutes >= 2) return t('format.reste.minutes', { minutes });
  return t('format.reste.moinsUneMinute');
}

// --- Administration, onglet « Articles » ---
// Seules les listes de courses mémorisent des noms (décision du 17 octobre
// 2026) : ces textes parlent donc d'« articles », écrits en entier dans le
// dictionnaire (« 1 article sera corrigé », « 3 articles seront corrigés »).

const listsOfShopping = (count) => t('format.noms.listesCourses', { count });

// Sous-titre d'un nom : « Crèmerie · 12 utilisations · 3 articles en liste »
// (le rayon habituel seulement s'il y en a un). Dans chaque morceau, les
// espaces sont insécables : une coupure de ligne ne tombe qu'entre deux morceaux.
export function savedNameSub({ aisle, uses, inLists }) {
  return [
    aisle,
    t('format.noms.utilisations', { count: uses }),
    inLists ? t('format.noms.enListe', { count: inLists }) : t('format.noms.aucunEnListe'),
  ].filter(Boolean).map((part) => part.replaceAll(' ', '\u00a0')).join(' · ');
}

// Texte de la confirmation d'une correction (réponse de /api/admin/names/impact)
export function renameImpactText({ oldName, newName, merge, items, lists }) {
  const what = merge
    ? t('format.correction.fusion', { oldName, newName })
    : t('format.correction.renommage', { oldName, newName });
  const where = items
    ? t('format.correction.impact', { count: items, lists: listsOfShopping(lists) })
    : t('format.correction.impact.aucun');
  return `${what} ${where}`;
}

// Message affiché après une correction (réponse de /api/admin/names/rename)
export function renameDoneText({ items, lists }) {
  if (!items) return t('format.correction.faite.suggestions');
  return t('format.correction.faite', { count: items, lists: listsOfShopping(lists) });
}

// « Dupliquer la liste » : nom proposé pour la copie, « <nom> (copie) », dans
// la limite des noms de liste (100 caractères). La place prise par
// « (copie) » est mesurée sur le texte avec un nom vide.
export function copyName(name, max = 100) {
  const suffix = t('format.copie', { name: '' });
  return t('format.copie', { name: String(name).slice(0, max - suffix.length).trimEnd() });
}
