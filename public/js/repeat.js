// Tâches qui se répètent (décisions du 11 novembre 2026). Module partagé par
// le téléphone et le serveur (server/lists.js) : la même règle, le même
// calcul de la date suivante, partout (liste, Échéances, hors ligne, Claude).
//
// Une répétition demande une échéance : elle s'enregistre avec la tâche
// (colonne items.repeat) sous une forme courte, contrôlée par isRepeatRule :
//   'day'          chaque jour
//   'week:1,3'     chaque semaine, les jours donnés (1 = lundi … 7 = dimanche)
//   '2week:1'      toutes les 2 semaines, les jours donnés (semaines comptées
//                  à partir de celle de l'échéance)
//   'month:5'      le 5 de chaque mois (1 à 31 ; un jour qui n'existe pas
//                  dans le mois devient son dernier jour)
//   'monthw:1:1'   le 1er lundi de chaque mois : rang (1 à 4, ou -1 : le
//                  dernier) puis jour de la semaine (1 = lundi … 7 =
//                  dimanche) ; 'monthw:-1:5' : le dernier vendredi
//                  (décision du 11 novembre 2026)
//   'year'         chaque année, le même jour et le même mois que l'échéance
//                  (un 29 février devient le 28 les autres années)
//
// Quand on coche une tâche qui se répète, elle revient décochée, à la date
// suivante : la prochaine date prévue APRÈS aujourd'hui, ou après
// l'échéance si elle est plus tard (une tâche faite en retard ne revient
// jamais déjà en retard). « Passer cette fois » fait le même calcul.
//
// Les dates sont des « AAAA-MM-JJ », sans heure ni fuseau (comme les échéances).

export const REPEAT_KINDS = ['day', 'week', '2week', 'month', 'year'];

// Libellés du choix « Se répète » (la valeur '' : Jamais)
export const REPEAT_CHOICES = [
  ['', 'Jamais'],
  ['day', 'Chaque jour'],
  ['week', 'Chaque semaine'],
  ['2week', 'Toutes les 2 semaines'],
  ['month', 'Chaque mois'],
  ['year', 'Chaque année'],
];

// Jours de la semaine (1 = lundi … 7 = dimanche) : nom court et nom entier
export const WEEKDAYS = [
  [1, 'Lu', 'lundi'],
  [2, 'Ma', 'mardi'],
  [3, 'Me', 'mercredi'],
  [4, 'Je', 'jeudi'],
  [5, 'Ve', 'vendredi'],
  [6, 'Sa', 'samedi'],
  [7, 'Di', 'dimanche'],
];

export const REPEAT_RULE_MAX = 20;

// --- Dates (AAAA-MM-JJ, calcul en temps universel : pas de fuseau) ---

const pad = (n) => String(n).padStart(2, '0');
const toDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toKey = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const plusDays = (key, n) => {
  const date = toDate(key);
  date.setUTCDate(date.getUTCDate() + n);
  return toKey(date);
};
// Jour de la semaine, 1 = lundi … 7 = dimanche
export const weekdayOf = (key) => ((toDate(key).getUTCDay() + 6) % 7) + 1;
// Numéro de semaine depuis une date de référence (un lundi) : sert à
// « toutes les 2 semaines »
const weekIndex = (key) => Math.floor((toDate(key) - Date.UTC(2000, 0, 3)) / (7 * 86400000));
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m : 1 à 12

// --- La règle ---

// Analyse une règle : { kind, days?, monthDay? }, ou null si elle est invalide
export function parseRepeat(rule) {
  if (typeof rule !== 'string' || rule.length > REPEAT_RULE_MAX) return null;
  if (rule === 'day' || rule === 'year') return { kind: rule };
  const week = /^(week|2week):([1-7](?:,[1-7]){0,6})$/.exec(rule);
  if (week) {
    const days = week[2].split(',').map(Number);
    // Jours dans l'ordre, sans doublon
    if (days.some((d, i) => i > 0 && d <= days[i - 1])) return null;
    return { kind: week[1], days };
  }
  const month = /^month:([1-9]|[12]\d|3[01])$/.exec(rule);
  if (month) return { kind: 'month', monthDay: Number(month[1]) };
  const monthWeek = /^monthw:([1-4]|-1):([1-7])$/.exec(rule);
  if (monthWeek) return { kind: 'month', nth: Number(monthWeek[1]), weekday: Number(monthWeek[2]) };
  return null;
}

// Rangs proposés pour « le … lundi du mois » : [rang, libellé]
export const MONTH_WEEKS = [[1, '1er'], [2, '2e'], [3, '3e'], [4, '4e'], [-1, 'dernier']];

// Rang d'une date dans son mois, pour proposer « le même » par défaut :
// 1 à 4, ou -1 (le dernier) pour un 5e jour de la semaine du mois
export function monthWeekOf(key) {
  const d = Number(key.slice(8));
  const rank = Math.ceil(d / 7);
  return rank > 4 ? -1 : rank;
}

export const isRepeatRule = (rule) => parseRepeat(rule) !== null;

// Fabrique une règle à partir du choix de l'écran
// Chaque mois : le jour donné (monthDay), ou, avec nth et weekday, « le 1er
// lundi », « le dernier vendredi »…
export function makeRepeat(kind, { days = [], monthDay = 1, nth = null, weekday = null } = {}) {
  if (kind === 'day' || kind === 'year') return kind;
  if (kind === 'week' || kind === '2week') {
    const list = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
    return list.length ? `${kind}:${list.join(',')}` : null;
  }
  if (kind === 'month') {
    if ((nth >= 1 && nth <= 4) || nth === -1) return weekday >= 1 && weekday <= 7 ? `monthw:${nth}:${weekday}` : null;
    return `month:${Math.min(31, Math.max(1, Math.trunc(monthDay)))}`;
  }
  return null;
}

// La date « tombe » sur la règle ? anchor : l'échéance de départ (pour
// « toutes les 2 semaines » et « chaque année »)
export function isOccurrence(rule, key, anchor = key) {
  const r = parseRepeat(rule);
  if (!r) return false;
  if (r.kind === 'day') return true;
  if (r.kind === 'week') return r.days.includes(weekdayOf(key));
  if (r.kind === '2week') return r.days.includes(weekdayOf(key)) && Math.abs(weekIndex(key) - weekIndex(anchor)) % 2 === 0;
  const [y, m, d] = key.split('-').map(Number);
  if (r.kind === 'month' && r.nth) {
    // Le n-ième (ou le dernier) jour de la semaine voulu du mois
    if (weekdayOf(key) !== r.weekday) return false;
    return r.nth === -1 ? d + 7 > daysInMonth(y, m) : Math.ceil(d / 7) === r.nth;
  }
  if (r.kind === 'month') return d === Math.min(r.monthDay, daysInMonth(y, m));
  // Chaque année : même jour et même mois que l'ancre (29 février → 28)
  const [, am, ad] = anchor.split('-').map(Number);
  return m === am && d === Math.min(ad, daysInMonth(y, m));
}

// Première date de la règle STRICTEMENT après « after » (anchor : l'échéance
// de départ). Au plus 400 jours plus loin (une règle valide en a toujours une).
export function occurrenceAfter(rule, after, anchor = after) {
  if (!parseRepeat(rule)) return null;
  for (let i = 1, key = plusDays(after, 1); i <= 400; i++, key = plusDays(key, 1)) {
    if (isOccurrence(rule, key, anchor)) return key;
  }
  return null;
}

// Première date de la règle à partir de « from » (compris) : la date posée
// quand on choisit une répétition
export function firstOccurrence(rule, from, anchor = from) {
  return isOccurrence(rule, from, anchor) ? from : occurrenceAfter(rule, from, anchor);
}

// Date suivante d'une tâche cochée ou « passée » : après aujourd'hui, ou
// après l'échéance si elle est plus tard
export function nextDue(rule, dueDate, today) {
  const after = dueDate && dueDate > today ? dueDate : today;
  return occurrenceAfter(rule, after, dueDate || today);
}

// --- Textes ---

const dayName = (d) => WEEKDAYS.find(([n]) => n === d)[2];
const shortDay = (d) => WEEKDAYS.find(([n]) => n === d)[1];
const monthWeekLabel = (nth) => MONTH_WEEKS.find(([n]) => n === nth)[1];
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} et ${words.at(-1)}`);

// Phrase sous le choix (fiche) : « Chaque lundi et mercredi »,
// « Toutes les 2 semaines, le lundi », « Le 5 de chaque mois »…
export function repeatSentence(rule) {
  const r = parseRepeat(rule);
  if (!r) return '';
  if (r.kind === 'day') return 'Chaque jour';
  if (r.kind === 'year') return 'Chaque année';
  if (r.kind === 'month' && r.nth) return `Le ${monthWeekLabel(r.nth)} ${dayName(r.weekday)} de chaque mois`;
  if (r.kind === 'month') return `Le ${r.monthDay === 1 ? '1er' : r.monthDay} de chaque mois${r.monthDay > 28 ? ' (ou le dernier jour du mois)' : ''}`;
  const names = r.days.map(dayName);
  if (r.kind === 'week') return r.days.length === 7 ? 'Chaque jour' : `Chaque ${andList(names)}`;
  return `Toutes les 2 semaines, le ${andList(names)}`;
}

// Pastille de la ligne : « Lu, Me », « Chaque jour », « 2 sem. · Lu »,
// « Le 5 », « Chaque année »
export function repeatChip(rule) {
  const r = parseRepeat(rule);
  if (!r) return '';
  if (r.kind === 'day') return 'Chaque jour';
  if (r.kind === 'year') return 'Chaque année';
  if (r.kind === 'month' && r.nth) return `${r.nth === -1 ? 'Dernier' : monthWeekLabel(r.nth)} ${shortDay(r.weekday)}`;
  if (r.kind === 'month') return `Le ${r.monthDay === 1 ? '1er' : r.monthDay}`;
  const days = r.days.map(shortDay).join(', ');
  return r.kind === 'week' ? (r.days.length === 7 ? 'Chaque jour' : days) : `2 sem. · ${days}`;
}
