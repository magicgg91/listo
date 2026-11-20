// Langues de Listo (internationalisation, décisions du 20 novembre 2026).
//
// Chaque texte affiché a un nom (« compte.langue.titre ») et une valeur par
// langue, dans public/js/i18n/fr.js et public/js/i18n/en.js. Le français est
// la langue de référence : un texte qui manque dans une autre langue
// s'affiche en français (et le test test/i18n.test.js échoue).
//
// Ce module sert aux deux côtés :
// - le téléphone (écrans) : t('nom', { valeurs }) dans la langue choisie
//   (setLocale), formatMoney pour le prix des envies ;
// - le serveur : translate(langue, 'nom', { valeurs }), la langue venant de
//   la requête (server/locale.js) ; aucun état partagé entre deux requêtes.
//
// Valeur d'un texte :
// - une phrase, avec des emplacements {nom} remplacés par les valeurs
//   données : 'Bonjour {name}' ;
// - ou, quand un nombre change la phrase, une forme par cas du pluriel de
//   la langue (Intl.PluralRules : one, other…), choisie avec { count } :
//   { one: '{count} article', other: '{count} articles' }.
// Jamais de HTML : les écrans posent les textes avec textContent.

import fr from './i18n/fr.js';
import en from './i18n/en.js';

// Langues connues (réglage du compte, LISTO_LANG)
export const LOCALES = ['fr', 'en'];
// Langues complètes, proposées dans « Mon compte » et réellement affichées.
// L'anglais est ajouté quand sa traduction est terminée (étape 4) : en
// attendant, un compte ou une installation réglés en anglais restent en
// français.
export const READY_LOCALES = ['fr'];
// Langue de référence (et langue par défaut d'une installation)
export const DEFAULT_LOCALE = 'fr';
// Nom de chaque langue, écrit dans cette langue (ainsi chacun reconnaît la sienne)
export const LOCALE_NAMES = { fr: 'Français', en: 'English' };

const DICTIONARIES = { fr, en };

// Langue → réglage régional d'Intl (dates, nombres, prix)
const INTL_TAGS = { fr: 'fr-FR', en: 'en' };
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

// Forme du pluriel pour ce nombre (other si la langue n'a pas ce cas)
function pluralForm(locale, forms, count) {
  const form = new Intl.PluralRules(intlTag(locale)).select(Number(count) || 0);
  return forms[form] ?? forms.other;
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

// Prix en centimes (centièmes de la monnaie) → « 25,50 € » en français,
// « €25.50 » en anglais ; rien si ce n'est pas un nombre entier
export function formatMoney(cents, { locale = current, currency: code = currency } = {}) {
  if (!Number.isInteger(cents)) return '';
  return new Intl.NumberFormat(intlTag(locale), { style: 'currency', currency: code }).format(cents / 100);
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
