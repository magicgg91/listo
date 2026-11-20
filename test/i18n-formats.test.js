// Langues de Listo, étape 3 (20 novembre 2026) : les formats suivent la
// langue. Dates, heures, prix et ordre alphabétique passent par les
// fonctions communes de public/js/i18n.js (formatDate, formatTime,
// formatMoney, compareText), dans la langue des écrans ou dans une langue
// donnée (serveur : celle de la requête ou du destinataire).
//
// L'anglais n'est pas encore proposé (READY_LOCALES), mais ces fonctions
// acceptent déjà une langue explicite : c'est ce qui est vérifié ici, en
// anglais américain, et que le français reste identique.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { intlTag, formatDate, formatTime, formatMoney, compareText } from '../public/js/i18n.js';
import { timeLabel } from '../public/js/due-time.js';
import { compareNames, groupItems, splitDone, sortTasks } from '../public/js/sorting.js';
import { parsePrice, priceInputText } from '../public/js/wishes.js';
import { suggest } from '../public/js/history.js';
import { repeatSentence } from '../public/js/repeat.js';
import { dueDateLabel, dateTimeLabel, relativeTime } from '../public/js/format.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('formats : l\'anglais est américain (en-US), le français reste fr-FR', () => {
  assert.equal(intlTag('en'), 'en-US');
  assert.equal(intlTag('fr'), 'fr-FR');
  assert.equal(intlTag('xx'), 'fr-FR', 'langue inconnue : français');
});

test('formats : heures « HH:MM » en français (identiques à avant) et en anglais (12 heures)', () => {
  // Français : comme l'ancien timeLabel (« 9:05 », « 18:30 »)
  assert.equal(formatTime('19:30', { locale: 'fr' }), '19:30');
  assert.equal(formatTime('09:05', { locale: 'fr' }), '9:05');
  assert.equal(formatTime('00:05', { locale: 'fr' }), '0:05');
  assert.equal(formatTime('09:05', { locale: 'fr', twoDigits: true }), '09:05');
  // Anglais américain
  assert.equal(formatTime('19:30', { locale: 'en' }), '7:30 PM');
  assert.equal(formatTime('09:05', { locale: 'en' }), '9:05 AM');
  assert.equal(formatTime('00:05', { locale: 'en' }), '12:05 AM');
  assert.equal(formatTime('12:00', { locale: 'en' }), '12:00 PM');
  assert.equal(formatTime('09:05', { locale: 'en', twoDigits: true }), '9:05 AM', 'jamais de zéro devant sur 12 heures');
  // Objet Date : heure locale de l'appareil
  const evening = new Date(2026, 10, 18, 19, 30);
  assert.equal(formatTime(evening, { locale: 'fr', twoDigits: true }), '19:30');
  assert.equal(formatTime(evening, { locale: 'en', twoDigits: true }), '7:30 PM');
  // Valeurs refusées
  for (const bad of ['24:00', '7:30', '', null, undefined, new Date('x')]) assert.equal(formatTime(bad, { locale: 'en' }), '');
  // Heure d'une tâche : timeLabel passe par formatTime (langue donnée par le serveur)
  assert.equal(timeLabel('18:30'), '18:30');
  assert.equal(timeLabel('09:05', { locale: 'fr' }), '9:05');
  assert.equal(timeLabel('18:30', { locale: 'en' }), '6:30 PM');
  assert.equal(timeLabel('pas une heure', { locale: 'en' }), '');
});

test('formats : dates en français (identiques à avant) et en anglais américain', () => {
  const day = new Date(Date.UTC(2026, 10, 18));
  const utc = { timeZone: 'UTC' };
  // Échéance d'une tâche (même réglage que dueDateLabel)
  assert.equal(formatDate(day, { weekday: 'short', day: 'numeric', month: 'short', ...utc }, { locale: 'fr' }), 'mer. 18 nov.');
  assert.equal(formatDate(day, { weekday: 'short', day: 'numeric', month: 'short', ...utc }, { locale: 'en' }), 'Wed, Nov 18');
  assert.equal(formatDate(day, { day: 'numeric', month: 'short', year: 'numeric', ...utc }, { locale: 'fr' }), '18 nov. 2026');
  assert.equal(formatDate(day, { day: 'numeric', month: 'short', year: 'numeric', ...utc }, { locale: 'en' }), 'Nov 18, 2026');
  // Date d'un rappel (server/notify.js) : « 12/11/2026 » comme avant, « 11/12/2026 » en anglais
  const reminder = { day: '2-digit', month: '2-digit', year: 'numeric', ...utc };
  assert.equal(formatDate(new Date(Date.UTC(2026, 10, 12)), reminder, { locale: 'fr' }), '12/11/2026');
  assert.equal(formatDate(new Date(Date.UTC(2026, 10, 12)), reminder, { locale: 'en' }), '11/12/2026');
  assert.equal(formatDate(new Date(Date.UTC(2026, 0, 5)), reminder, { locale: 'fr' }), '05/01/2026');
  // Date ISO acceptée ; date invalide : rien
  assert.equal(formatDate('2026-11-03T12:00:00.000Z', { day: 'numeric', month: 'short', year: 'numeric', ...utc }, { locale: 'en' }), 'Nov 3, 2026');
  assert.equal(formatDate('pas une date', { day: 'numeric' }, { locale: 'en' }), '');
  // Écrans (langue des écrans : français) : rien ne change
  assert.equal(dueDateLabel('2026-10-24', '2026-10-01'), 'sam. 24 oct.');
  assert.equal(dueDateLabel('2027-01-08', '2026-10-01'), 'ven. 8 janv. 2027');
  assert.match(dateTimeLabel('2026-10-24T16:30:00.000Z'), /^24 oct\. 2026 à \d{2}:30$/);
  assert.equal(relativeTime(new Date(2025, 11, 24).toISOString(), new Date(2026, 9, 16).getTime()), '24 déc. 2025');
});

test('formats : prix en français et en dollars américains ; saisie d\'un prix', () => {
  const nbsp = (text) => text.replace(/\s/g, ' ');
  assert.equal(nbsp(formatMoney(2550, { locale: 'fr', currency: 'EUR' })), '25,50 €');
  assert.equal(formatMoney(2550, { locale: 'en', currency: 'USD' }), '$25.50');
  assert.equal(formatMoney(123450, { locale: 'en', currency: 'USD' }), '$1,234.50');
  assert.equal(formatMoney(2550, { locale: 'en', currency: 'EUR' }), '€25.50');
  // Champ de saisie : le prix enregistré, sans monnaie
  assert.equal(priceInputText(2490, { locale: 'fr' }), '24,90');
  assert.equal(priceInputText(123490, { locale: 'fr' }), '1234,90', 'sans séparateur des milliers');
  assert.equal(priceInputText(2490, { locale: 'en' }), '24.90');
  assert.equal(priceInputText(123490, { locale: 'en' }), '1234.90');
  assert.equal(priceInputText(null, { locale: 'en' }), '');
  assert.equal(priceInputText(2490), '24,90', 'langue des écrans : français');
  // Saisie : en anglais, la virgule des milliers est acceptée
  assert.equal(parsePrice('$1,234.90', { locale: 'en' }), 123490);
  assert.equal(parsePrice('1,234', { locale: 'en' }), 123400);
  assert.equal(parsePrice('24.90', { locale: 'en' }), 2490);
  assert.equal(parsePrice('24,90', { locale: 'en' }), 2490, 'virgule décimale tolérée');
  // Français : inchangé (« 1,234 » reste refusé)
  assert.ok(Number.isNaN(parsePrice('1,234', { locale: 'fr' })));
  assert.ok(Number.isNaN(parsePrice('1,234')));
  assert.equal(parsePrice('1 234,90 €'), 123490);
  // Tous les prix affichés passent par formatMoney (wishes.js) : aucun
  // prix écrit à la main dans les écrans
  for (const file of ['public/js/screens/list.js', 'public/js/public.js', 'public/js/format.js']) {
    assert.ok(!/toFixed\(2\)/.test(read(file)), `${file} : prix écrit à la main`);
  }
});

test('formats : ordre alphabétique de la langue donnée, français inchangé', () => {
  const words = ['Zèbre', 'été', 'Eau', 'article 10', 'article 2', 'Épicerie', 'œuf', 'Oeuf', 'côte', 'coté'];
  const oldFrench = [...words].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }) || a.localeCompare(b, 'fr'));
  assert.deepEqual([...words].sort((a, b) => compareNames(a, b)), oldFrench, 'français : le même ordre qu\'avant');
  assert.deepEqual([...words].sort((a, b) => compareNames(a, b, 'fr')), oldFrench);
  const english = [...words].sort((a, b) => compareNames(a, b, 'en'));
  assert.deepEqual(english, [...words].sort((a, b) => a.localeCompare(b, 'en-US', { sensitivity: 'base', numeric: true }) || a.localeCompare(b, 'en-US')));
  assert.equal(english.indexOf('article 2') < english.indexOf('article 10'), true, 'nombres dans l\'ordre');
  assert.ok(compareText('a', 'B', { locale: 'en', sensitivity: 'base' }) < 0);
  assert.equal(compareText('e', 'É', { locale: 'en', sensitivity: 'base' }), 0);

  // Les fonctions de tri partagées avec le serveur prennent la langue
  // (page du lien public : celle du visiteur) et la passent jusqu'au bout
  const items = [{ name: 'b', checked: false }, { name: 'a', checked: false }, { name: 'c', checked: true, checkedAt: '2026-11-01' }];
  assert.deepEqual(groupItems(items, [], false, { locale: 'en' })[0].items.map((i) => i.name), ['a', 'b', 'c']);
  assert.deepEqual(splitDone(items, [], false, { locale: 'en' }).groups[0].items.map((i) => i.name), ['a', 'b']);
  assert.deepEqual(sortTasks(items.slice(0, 2), 'priority', { locale: 'en' })[0].items.map((i) => i.name), ['a', 'b']);
  // En-têtes : dans la langue donnée (en anglais, faute de traduction pour
  // l'instant, le texte français ; même texte qu'avec t())
  assert.equal(sortTasks(items.slice(0, 2), 'priority', { locale: 'fr' })[0].label, 'Priorité normale');
  // Suggestions : à égalité, ordre de la langue de la requête
  const history = [
    { name: 'Lait de coco', nameNormalized: 'lait de coco', storeId: null, useCount: 1, lastUsedAt: 'x' },
    { name: 'lait', nameNormalized: 'lait', storeId: null, useCount: 1, lastUsedAt: 'x' },
  ];
  assert.deepEqual(suggest(history, 'la', 8, { locale: 'en' }).map((e) => e.name), ['lait', 'Lait de coco']);
  assert.deepEqual(suggest(history, 'la').map((e) => e.name), ['lait', 'Lait de coco']);
});

test('formats : phrases partagées avec le serveur, langue donnée (Claude : français)', () => {
  assert.equal(repeatSentence('week:1,3', { locale: 'fr' }), repeatSentence('week:1,3'));
  assert.equal(repeatSentence('monthw:-1:5', { locale: 'fr' }), repeatSentence('monthw:-1:5'));
  const mcp = read('server/mcp-tools.js');
  for (const call of mcp.match(/repeatSentence\([^)]*\)/g) ?? []) assert.match(call, /\{ locale: 'fr' \}/, `Claude reste en français : ${call}`);
  // Serveur : la langue de la requête ou du destinataire est passée
  assert.match(read('server/routes/public.js'), /publicView\(share, req\.params\.token, visitor, requestLocale\(req, ctx\.config\)\)/);
  assert.match(read('server/routes/public.js'), /splitDone\(tops, aisles, isShopping, \{ byStore, stores, locale \}\)/);
  const notify = read('server/notify.js');
  assert.match(notify, /timeLabel\(task\.due_time, \{ locale \}\)/);
  assert.match(notify, /timeLabel\(t\.due_time, \{ locale \}\)/);
  assert.ok(!/reverse\(\)\.join\('\/'\)/.test(notify), 'date du rappel : par Intl, dans la langue du destinataire');
});

// Aucun réglage régional écrit en dur pour afficher ou trier : dates,
// heures, ordre alphabétique et majuscules passent par la langue. Une
// ligne marquée « // technique » (comparaison de noms, ordre enregistré
// en base) est permise : son résultat n'est jamais montré dans une langue.
test('formats : aucune langue écrite en dur pour une date, une heure ou un tri', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (path !== 'public/js/i18n') walk(path); } else if (entry.name.endsWith('.js')) files.push(path);
    }
  };
  walk('public/js');
  walk('server');
  const FORBIDDEN = [
    /\.toLocale(Date|Time)?String\(/,                       // langue du navigateur ou écrite en dur
    /new Intl\.(DateTimeFormat|Collator|RelativeTimeFormat)\(\s*['"]/,
    /localeCompare\([^()]*(\([^()]*\)[^()]*)*,\s*['"][a-z]{2}/, // localeCompare(b, 'fr')
    /toLocale(Lower|Upper)Case\(\s*['"]/,
    /['"]fr-FR['"]/,
  ];
  const found = [];
  for (const file of files) {
    if (file === 'public/js/i18n.js') continue; // le module des langues lui-même
    read(file).split('\n').forEach((line, index) => {
      if (/\/\/ technique\b/.test(line)) return;
      if (FORBIDDEN.some((re) => re.test(line))) found.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, []);
});

test('monnaie : le champ du prix dit le nom de la monnaie réglée, au pluriel, dans la langue', async () => {
  const { currencyName } = await import('../public/js/i18n.js');
  const fr = (await import('../public/js/i18n/fr.js')).default;
  assert.equal(currencyName({ locale: 'fr', currency: 'EUR' }), 'euros');
  assert.equal(currencyName({ locale: 'fr', currency: 'CHF' }), 'francs suisses');
  assert.equal(currencyName({ locale: 'en', currency: 'USD' }), 'US dollars');
  assert.equal(fr['liste.fiche.prix.unite'], 'en {currency}');
});
