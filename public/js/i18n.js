// Langues de Listo (internationalisation, décisions du 20 novembre 2026).
//
// Chaque texte affiché a un nom (« compte.langue.titre ») et une valeur par
// langue, dans public/js/i18n/fr.js et public/js/i18n/en.js. Le français est
// la langue de référence : un texte qui manque dans une autre langue
// s'affiche en français (et le test test/i18n.test.js échoue).
//
// Ce module sert aux deux côtés :
// - le téléphone (écrans) : t('nom', { valeurs }) dans la langue choisie
//   (setLocale), formatMoney pour le prix des envies, formatDate,
//   formatTime et compareText pour les dates, les heures et l'ordre
//   alphabétique, formatList pour les énumérations ;
// - le serveur : translate(langue, 'nom', { valeurs }), la langue venant de
//   la requête (server/locale.js) ; aucun état partagé entre deux requêtes.
//
// Valeur d'un texte :
// - une phrase, avec des emplacements {nom} remplacés par les valeurs
//   données : 'Bonjour {name}' ;
// - ou, quand un nombre change la phrase, une forme par cas du pluriel de
//   la langue (Intl.PluralRules : one, other…), choisie avec { count } :
//   { one: '{count} article', other: '{count} articles' } (en français, 0
//   et 1 sont au singulier : « 0 article ») ; une forme exacte (« =1 »)
//   passe avant, seulement pour un vrai cas particulier, jamais pour
//   refaire une règle de grammaire : { '=1': 'Le 1er', other: 'Le {count}' }.
// Une phrase entière par texte : jamais de morceaux de phrase assemblés par
// le code ; une énumération (« Léa, Marc et Zoé ») passe par formatList.
// Jamais de HTML : les écrans posent les textes avec textContent.

import fr from './i18n/fr.js';
import en from './i18n/en.js';

// Langues connues (réglage du compte, LISTO_LANG)
export const LOCALES = ['fr', 'en'];
// Langues complètes, proposées dans « Mon compte » et réellement affichées.
// Une nouvelle langue n'est ajoutée ici qu'une fois sa traduction complète
// (l'anglais : étape 4, 20 novembre 2026) ; avant, elle reste en français.
export const READY_LOCALES = ['fr', 'en'];
// Langue de référence (et langue par défaut d'une installation)
export const DEFAULT_LOCALE = 'fr';
// Nom de chaque langue, écrit dans cette langue (ainsi chacun reconnaît la sienne)
export const LOCALE_NAMES = { fr: 'Français', en: 'English' };

const DICTIONARIES = { fr, en };

// Langue → réglage régional d'Intl (dates, heures, nombres, prix, ordre
// alphabétique). L'anglais de Listo est américain (décision du 20 novembre
// 2026) : « Nov 20, 2026 », « 7:30 PM ».
const INTL_TAGS = { fr: 'fr-FR', en: 'en-US' };
export const intlTag = (locale) => INTL_TAGS[locale] ?? INTL_TAGS[DEFAULT_LOCALE];

export const isLocale = (value) => LOCALES.includes(value);

// Langue principale d'une balise de navigateur : « en-US » → « en »
export function baseLanguage(tag) {
  return String(tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
}

// Première langue complète parmi les candidates (choix du compte, langues
// du navigateur, langue de l'installation…), sinon le français.
// Les candidates vides ou inconnues sont ignorées.
export function resolveLocale(candidates = []) {
  for (const candidate of candidates) {
    const locale = baseLanguage(candidate);
    if (READY_LOCALES.includes(locale)) return locale;
  }
  return DEFAULT_LOCALE;
}

// En-tête Accept-Language → balises dans l'ordre de préférence (q), sans
// celles refusées (q=0). Prudence : 20 balises au plus, de 35 caractères
// au plus, en lettres, chiffres et tirets ; le reste est ignoré.
export function parseAcceptLanguage(header) {
  return String(header ?? '').slice(0, 500).split(',').slice(0, 20)
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter(({ tag, weight }) => weight > 0 && /^[A-Za-z0-9-]{1,35}$/.test(tag))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map(({ tag }) => tag);
}

// Texte « key » dans la langue « locale », avec ses valeurs. Un texte
// absent de cette langue est pris en français ; absent partout : son nom
// (visible, donc repéré tout de suite).
export function translate(locale, key, params = {}) {
  const value = DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE][key];
  if (value === undefined) return key;
  const text = typeof value === 'object' ? pluralForm(locale, value, params.count) : value;
  return text.replace(/\{(\w+)\}/g, (all, name) => (params[name] === undefined ? all : String(params[name])));
}

// Forme du pluriel pour ce nombre : d'abord une forme exacte (« =1 »), puis
// le cas du pluriel de la langue (one, other…), sinon other.
// Intl.PluralRules suit la grammaire (en français, 0 et 1 sont au
// singulier ; en anglais, 1 seulement) ; la forme exacte sert aux vrais cas
// particuliers (« le 1er », ou en anglais « the 2nd »).
function pluralForm(locale, forms, count) {
  const number = Number(count) || 0;
  const exact = forms[`=${number}`];
  if (exact !== undefined) return exact;
  const form = new Intl.PluralRules(intlTag(locale)).select(number);
  return forms[form] ?? forms.other;
}

// Première lettre en minuscule, le reste tel quel (« Chaque lundi » →
// « chaque lundi » ; “Every Monday” → “every Monday”, le nom du jour garde
// sa majuscule en anglais)
export function lowerFirst(text, { locale = current } = {}) {
  const value = String(text ?? '');
  return value.charAt(0).toLocaleLowerCase(intlTag(locale)) + value.slice(1);
}

// --- Côté téléphone : langue et monnaie de cet écran ---

let current = DEFAULT_LOCALE;
let currency = 'EUR';

// Langue des écrans (une langue complète, sinon le français)
export function setLocale(locale) {
  current = READY_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  return current;
}
export const getLocale = () => current;

// Texte dans la langue des écrans
export const t = (key, params) => translate(current, key, params);

// Monnaie des envies (LISTO_CURRENCY de l'installation, l'euro sinon)
export function setCurrency(code) {
  currency = validCurrency(code) ? code : 'EUR';
}

// Icône du prix d'un souhait : l'euro pour l'euro, une étiquette pour toute
// autre monnaie (jamais « € » à côté de « $25.50 »)
export const priceIcon = () => (currency === 'EUR' ? 'euro' : 'tag');

// Prix en centimes (centièmes de la monnaie) → « 25,50 € » en français,
// « €25.50 » en anglais ; rien si ce n'est pas un nombre entier
export function formatMoney(cents, { locale = current, currency: code = currency } = {}) {
  if (!Number.isInteger(cents)) return '';
  return new Intl.NumberFormat(intlTag(locale), { style: 'currency', currency: code }).format(cents / 100);
}

// Énumération dans la grammaire de la langue (Intl.ListFormat) :
// formatList(['Léa', 'Marc', 'Zoé']) → « Léa, Marc et Zoé » en français,
// « Léa, Marc, and Zoé » en anglais américain ; un seul : « Léa » ; aucun :
// rien. type : 'conjunction' (« et », par défaut) ou 'disjunction' (« ou »).
// Sert aussi au serveur, avec la langue donnée.
export function formatList(items, { locale = current, type = 'conjunction' } = {}) {
  const words = [...items].map(String);
  return new Intl.ListFormat(intlTag(locale), { type, style: 'long' }).format(words);
}

// --- Dates, heures et ordre alphabétique, dans une langue ---
// Ces fonctions servent aux deux côtés : sur le téléphone, sans « locale »,
// la langue des écrans ; sur le serveur, toujours une langue donnée (celle
// de la requête ou du destinataire, voir server/locale.js).

// Date mise en forme par Intl : formatDate(date, { day: 'numeric', month:
// 'short' }) → « 18 nov. » en français, « Nov 18 » en anglais.
// date : un objet Date, ou une date ISO ; rien si elle n'est pas valable.
export function formatDate(date, options = {}, { locale = current } = {}) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat(intlTag(locale), options).format(value);
}

// Heure lisible : « 19:30 », « 9:05 » en français, « 7:30 PM », « 9:05 AM »
// en anglais. value : une heure « HH:MM » (heure d'une échéance, sans
// fuseau) ou un objet Date (heure locale de l'appareil). twoDigits : heure
// sur deux chiffres (« 09:05 ») dans une langue qui compte sur 24 heures ;
// une langue sur 12 heures n'en met jamais (« 9:05 AM »). Rien si l'heure
// n'est pas valable.
export function formatTime(value, { locale = current, twoDigits = false } = {}) {
  let date = value;
  let timeZone;
  if (typeof value === 'string') {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) return '';
    // Heure seule : posée sur un jour fixe, en temps universel (aucun
    // changement d'heure ne la décale)
    date = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])));
    timeZone = 'UTC';
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const tag = intlTag(locale);
  const twelveHours = new Intl.DateTimeFormat(tag, { hour: 'numeric' }).resolvedOptions().hour12 === true;
  const hour = twoDigits && !twelveHours ? '2-digit' : 'numeric';
  return new Intl.DateTimeFormat(tag, { hour, minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(date);
}

// Ordre alphabétique d'une langue : compareText(a, b) < 0 si a vient avant
// b. options : celles d'Intl.Collator (sensitivity, numeric…). Les
// comparateurs sont gardés (un tri en fait des milliers).
const collators = new Map();
export function compareText(a, b, { locale = current, ...options } = {}) {
  const key = `${intlTag(locale)} ${JSON.stringify(options)}`;
  if (!collators.has(key)) collators.set(key, new Intl.Collator(intlTag(locale), options));
  return collators.get(key).compare(String(a ?? ''), String(b ?? ''));
}

// Nom de la monnaie, au pluriel, dans la langue : « euros », « francs
// suisses », “US dollars” (pour « Prix indicatif, en euros »)
export function currencyName({ locale = current, currency: code = currency } = {}) {
  const parts = new Intl.NumberFormat(intlTag(locale), { style: 'currency', currency: code, currencyDisplay: 'name' }).formatToParts(2);
  return parts.find((part) => part.type === 'currency')?.value ?? code;
}

// Code de monnaie accepté (LISTO_CURRENCY) : trois lettres majuscules
// (ISO 4217, « EUR », « USD », « CHF »…) connues du navigateur, et à deux
// décimales (les prix sont gardés en centièmes : le yen, sans décimale,
// est refusé)
export function validCurrency(code) {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false;
  // Liste des monnaies connues, quand le navigateur la donne (un code bien
  // formé mais inventé, « ABC », serait sinon affiché tel quel)
  if (typeof Intl.supportedValuesOf === 'function' && !Intl.supportedValuesOf('currency').includes(code)) return false;
  try {
    const format = new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return format.resolvedOptions().maximumFractionDigits === 2;
  } catch {
    return false;
  }
}
