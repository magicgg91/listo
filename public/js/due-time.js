// Heure d'échéance et rappel d'une tâche (décisions du 11 novembre 2026).
// Module partagé par le téléphone et le serveur (server/lists.js,
// server/notify.js) : les mêmes règles partout.
//
// - L'heure est facultative, « HH:MM » sur 24 h (heure locale : celle du
//   téléphone pour l'affichage, celle du serveur, variable TZ, pour les
//   rappels ; la famille vit sur le même fuseau). Elle demande une date.
// - Une tâche avec une heure passe « En retard » dès que l'heure est
//   dépassée (et plus seulement le lendemain).
// - Le rappel se choisit tâche par tâche, parmi une liste fermée : minutes
//   avant l'heure (0 : à l'heure ; 1440 : la veille, 24 h pile avant). Il
//   demande une heure. Sans choix : aucun rappel.

export const DUE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDueTime = (value) => typeof value === 'string' && DUE_TIME_RE.test(value);

// Rappels proposés : [minutes avant l'heure, libellé] (null : aucun)
export const REMINDERS = [
  [null, 'Aucun'],
  [0, 'À l\'heure'],
  [15, '15 min avant'],
  [30, '30 min avant'],
  [60, '1 h avant'],
  [120, '2 h avant'],
  [1440, 'La veille (24 h avant)'],
];
export const isReminder = (value) => Number.isInteger(value) && REMINDERS.some(([minutes]) => minutes === value);
export const reminderLabel = (minutes) => REMINDERS.find(([value]) => value === minutes)?.[1] ?? 'Aucun';

const two = (n) => String(n).padStart(2, '0');

// Heure actuelle « HH:MM » (heure locale de l'appareil ou du serveur)
export const nowTime = (date = new Date()) => `${two(date.getHours())}:${two(date.getMinutes())}`;

// Heure lisible : « 9:05 », « 18:30 »
export const timeLabel = (time) => (isDueTime(time) ? `${Number(time.slice(0, 2))}:${time.slice(3)}` : '');

// En retard ? Date passée, ou date du jour et heure dépassée
export function isLate(dueDate, dueTime, today, now) {
  if (!dueDate) return false;
  if (dueDate < today) return true;
  return dueDate === today && isDueTime(dueTime) && isDueTime(now) && dueTime < now;
}

// Comparaison de deux échéances (date, puis heure ; à date égale, une
// tâche avec heure passe avant une tâche sans heure)
export function compareDue(aDate, aTime, bDate, bTime) {
  const byDate = String(aDate ?? '').localeCompare(String(bDate ?? ''));
  if (byDate) return byDate;
  const a = isDueTime(aTime) ? aTime : '99:99';
  const b = isDueTime(bTime) ? bTime : '99:99';
  return a.localeCompare(b);
}

// Moment du rappel (millisecondes, heure locale de la machine qui calcule) ;
// null s'il n'y a pas de rappel complet (date, heure, délai)
export function reminderAt(dueDate, dueTime, minutes) {
  if (!dueDate || !isDueTime(dueTime) || !isReminder(minutes)) return null;
  const [y, m, d] = dueDate.split('-').map(Number);
  const [hh, mm] = dueTime.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime() - minutes * 60 * 1000;
}
