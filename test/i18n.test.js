// Langues de Listo, étape 1 (fondations, 20 novembre 2026) : fonction de
// traduction (public/js/i18n.js), dictionnaires, langue du compte (migration
// 34, PUT /api/me/locale), langue par défaut et monnaie de l'installation
// (LISTO_LANG, LISTO_CURRENCY), langue d'une requête (server/locale.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  LOCALES, READY_LOCALES, DEFAULT_LOCALE, LOCALE_NAMES, translate, resolveLocale, parseAcceptLanguage,
  validCurrency, formatMoney, baseLanguage, isLocale,
} from '../public/js/i18n.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { loadConfig, configProblem } from '../server/config.js';
import { requestLocale, userLocale } from '../server/locale.js';
import { openDatabase, schemaVersion } from '../server/db.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const DICTIONARIES = { fr, en };
// Emplacements {nom} d'un texte (toutes ses formes du pluriel)
const slots = (value) => new Set([...(typeof value === 'object' ? Object.values(value) : [value]).join(' ').matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
// Avec l'anglais complet (étape 4), une langue anglaise donne l'anglais ;
// avant, le français
const ENGLISH = READY_LOCALES.includes('en') ? 'en' : 'fr';

test('dictionnaires : mêmes noms dans chaque langue complète, mêmes emplacements, formes du pluriel complètes, jamais de HTML', () => {
  assert.deepEqual(LOCALES, ['fr', 'en']);
  assert.equal(DEFAULT_LOCALE, 'fr');
  assert.ok(READY_LOCALES.includes('fr'));
  assert.ok(READY_LOCALES.every(isLocale));
  for (const locale of LOCALES) {
    assert.ok(LOCALE_NAMES[locale], `nom de la langue ${locale}`);
    // Langue complète : tous les noms du français ; en cours : une partie
    // seulement (le reste s'affiche en français), jamais un nom inconnu
    if (READY_LOCALES.includes(locale)) assert.deepEqual(Object.keys(DICTIONARIES[locale]).sort(), Object.keys(fr).sort(), `${locale} : mêmes noms que le français`);
    else assert.ok(Object.keys(DICTIONARIES[locale]).every((key) => key in fr), `${locale} : seulement des noms du français`);
  }
  for (const [key, value] of Object.entries(fr)) {
    for (const locale of LOCALES) {
      const other = DICTIONARIES[locale][key];
      if (other === undefined && !READY_LOCALES.includes(locale)) continue;
      assert.equal(typeof other, typeof value, `${locale} ${key} : même forme`);
      assert.deepEqual(slots(other), slots(value), `${locale} ${key} : mêmes emplacements`);
      for (const text of typeof other === 'object' ? Object.values(other) : [other]) {
        assert.equal(typeof text, 'string');
        assert.ok(text.trim(), `${locale} ${key} : texte vide`);
        assert.ok(!/[<>]/.test(text), `${locale} ${key} : pas de HTML`);
      }
      if (typeof other === 'object') assert.ok('other' in other, `${locale} ${key} : forme « other »`);
    }
  }
});

test('translate : valeurs, pluriel selon la langue, texte manquant pris en français, nom inconnu affiché tel quel', () => {
  assert.equal(translate('fr', 'compte.langue.titre'), 'Langue');
  assert.equal(translate('en', 'compte.langue.titre'), 'Language');
  assert.equal(translate('de', 'compte.langue.titre'), 'Langue', 'langue inconnue : français');
  assert.equal(translate('fr', 'nom.inconnu'), 'nom.inconnu');
  // Emplacements et pluriel (dictionnaire d'essai passé par des noms existants : on vérifie le mécanisme)
  const forms = { one: '{count} article de {who}', other: '{count} articles de {who}' };
  fr['essai.pluriel'] = forms;
  en['essai.pluriel'] = { one: '{count} item from {who}', other: '{count} items from {who}' };
  try {
    assert.equal(translate('fr', 'essai.pluriel', { count: 1, who: 'Léa' }), '1 article de Léa');
    assert.equal(translate('fr', 'essai.pluriel', { count: 0, who: 'Léa' }), '0 article de Léa', 'français : 0 au singulier');
    assert.equal(translate('fr', 'essai.pluriel', { count: 3, who: 'Léa' }), '3 articles de Léa');
    assert.equal(translate('en', 'essai.pluriel', { count: 0, who: 'Lea' }), '0 items from Lea', 'anglais : 0 au pluriel');
    assert.equal(translate('en', 'essai.pluriel', { count: 1, who: 'Lea' }), '1 item from Lea');
    assert.equal(translate('fr', 'essai.pluriel', { count: 2 }), '2 articles de {who}', 'valeur absente : emplacement laissé');
    // Une valeur n'est jamais relue comme un texte à remplacer
    assert.equal(translate('fr', 'essai.pluriel', { count: 2, who: '{count}' }), '2 articles de {count}');
  } finally {
    delete fr['essai.pluriel'];
    delete en['essai.pluriel'];
  }
});

test('langue retenue : la première langue complète parmi les candidates, sinon le français ; Accept-Language lu avec prudence', () => {
  assert.equal(baseLanguage('en-US'), 'en');
  assert.equal(baseLanguage('FR_ca'), 'fr');
  assert.equal(resolveLocale([]), 'fr');
  assert.equal(resolveLocale([null, undefined, '', 'de-DE', 'fr-CA']), 'fr');
  assert.equal(resolveLocale(['en-GB', 'fr']), ENGLISH);
  assert.equal(resolveLocale(['de', 'it']), 'fr', 'aucune langue connue : français');
  assert.deepEqual(parseAcceptLanguage('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5'), ['fr-CH', 'fr', 'en', 'de']);
  assert.deepEqual(parseAcceptLanguage('de;q=0.5, en'), ['en', 'de'], 'ordre des préférences (q)');
  assert.deepEqual(parseAcceptLanguage('en;q=0, fr'), ['fr'], 'q=0 : refusée');
  assert.deepEqual(parseAcceptLanguage('<script>, fr'), ['fr'], 'balise mal formée ignorée');
  assert.deepEqual(parseAcceptLanguage(undefined), []);
  assert.ok(parseAcceptLanguage(Array(100).fill('fr').join(',')).length <= 20, '20 balises au plus');
  // Requête : compte, puis navigateur, puis installation
  const config = { lang: 'fr' };
  assert.equal(requestLocale({ user: { locale: 'en' }, headers: { 'accept-language': 'fr' } }, config), ENGLISH);
  assert.equal(requestLocale({ user: { locale: null }, headers: { 'accept-language': 'en-US,en;q=0.9' } }, config), ENGLISH);
  assert.equal(requestLocale({ headers: { 'accept-language': 'de' } }, { lang: 'en' }), ENGLISH);
  assert.equal(requestLocale({ headers: {} }, config), 'fr');
  // Sans requête (notifications) : compte, puis installation
  assert.equal(userLocale({ locale: null }, { lang: 'en' }), ENGLISH);
  assert.equal(userLocale({ locale: 'fr' }, { lang: 'en' }), 'fr');
});

test('monnaie : codes à deux décimales seulement ; prix présenté selon la langue et la monnaie', () => {
  for (const code of ['EUR', 'USD', 'CHF', 'GBP', 'CAD']) assert.ok(validCurrency(code), code);
  for (const code of ['JPY', 'eur', 'EURO', 'ABC', '', null, 12]) assert.ok(!validCurrency(code), String(code));
  assert.equal(formatMoney(2550, { locale: 'fr', currency: 'EUR' }), '25,50 €');
  assert.equal(formatMoney(2550, { locale: 'en', currency: 'USD' }), '$25.50');
  assert.equal(formatMoney(0, { locale: 'fr', currency: 'EUR' }), '0,00 €');
  assert.equal(formatMoney(12.5, { locale: 'fr', currency: 'EUR' }), '', 'pas un nombre entier de centimes');
  assert.equal(formatMoney(null), '');
});

test('configuration : LISTO_LANG (fr par défaut, fr ou en) et LISTO_CURRENCY (EUR par défaut), sinon Listo ne démarre pas', () => {
  const base = loadConfig({ LISTO_PUBLIC_URL: 'https://listo.test' });
  assert.equal(base.lang, 'fr');
  assert.equal(base.currency, 'EUR');
  assert.equal(configProblem(base), null);
  const english = loadConfig({ LISTO_PUBLIC_URL: 'https://listo.test', LISTO_LANG: ' EN ', LISTO_CURRENCY: 'usd' });
  assert.equal(english.lang, 'en');
  assert.equal(english.currency, 'USD');
  assert.equal(configProblem(english), null);
  assert.match(configProblem(loadConfig({ LISTO_PUBLIC_URL: 'https://listo.test', LISTO_LANG: 'de' })), /LISTO_LANG/);
  assert.match(configProblem(loadConfig({ LISTO_PUBLIC_URL: 'https://listo.test', LISTO_CURRENCY: 'JPY' })), /LISTO_CURRENCY/);
  assert.match(configProblem(loadConfig({ LISTO_PUBLIC_URL: 'https://listo.test', LISTO_CURRENCY: 'euros' })), /LISTO_CURRENCY/);
});

test('migration 34 : langue du compte, vide au départ (automatique), seulement fr ou en', () => {
  const db = openDatabase(':memory:');
  assert.equal(schemaVersion(db), 41);
  const id = db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('lea', 'Léa', 'x', 'user')").run().lastInsertRowid;
  assert.equal(db.prepare('SELECT locale FROM users WHERE id = ?').pluck().get(id), null);
  db.prepare("UPDATE users SET locale = 'en' WHERE id = ?").run(id);
  assert.throws(() => db.prepare("UPDATE users SET locale = 'de' WHERE id = ?").run(id), /CHECK/);
});

test('/api/setup donne la langue par défaut et la monnaie ; la langue se choisit sur son seul compte (PUT /api/me/locale)', async (t) => {
  const app = await startTestApp(t, { config: { lang: 'en', currency: 'CHF' } });
  const setup = (await app.client().get('/api/setup')).body;
  assert.equal(setup.lang, 'en');
  assert.equal(setup.currency, 'CHF');
  const admin = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  assert.equal((await admin.get('/api/me')).body.user.locale, null, 'automatique au départ');
  // Sans session : refusé
  assert.equal((await app.client().request('PUT', '/api/me/locale', { locale: 'en' })).status, 401);
  // Valeurs refusées, rien n'est écrit
  for (const locale of ['de', 'EN', '', 3, undefined]) {
    assert.equal((await admin.request('PUT', '/api/me/locale', { locale })).status, 400, String(locale));
  }
  assert.equal((await admin.get('/api/me')).body.user.locale, null);
  const saved = await admin.request('PUT', '/api/me/locale', { locale: 'en' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { locale: 'en' });
  assert.equal((await admin.get('/api/me')).body.user.locale, 'en');
  // Le compte de Léa ne change pas
  assert.equal(app.db.prepare('SELECT locale FROM users WHERE id = ?').pluck().get(leaId), null);
  assert.equal((await lea.get('/api/me')).body.user.locale, null);
  // Retour à automatique
  assert.equal((await admin.request('PUT', '/api/me/locale', { locale: null })).status, 200);
  assert.equal((await admin.get('/api/me')).body.user.locale, null);
});

test('lien public : la monnaie est donnée avec une liste d\'envies seulement', async (t) => {
  const app = await startTestApp(t, { config: { currency: 'CHF' } });
  const admin = await setupAdmin(app);
  const wishes = crypto.randomUUID();
  const tasks = crypto.randomUUID();
  const ops = [
    { type: 'list.create', listId: wishes, name: 'Envies', listType: 'wishes' },
    { type: 'item.create', listId: wishes, itemId: crypto.randomUUID(), name: 'Vélo', priceCents: 24990 },
    { type: 'list.create', listId: tasks, name: 'Maison', listType: 'tasks' },
  ];
  assert.ok((await admin.post('/api/ops', { ops: ops.map((op) => ({ id: crypto.randomUUID(), ...op })) })).body.results.every((r) => r.status === 200));
  const tokenOf = async (listId) => (await admin.request('PUT', `/api/lists/${listId}/share`, {})).body.share.url.split('/p/')[1];
  const wishView = (await app.client().get(`/api/public/${await tokenOf(wishes)}`)).body;
  assert.equal(wishView.list.currency, 'CHF');
  assert.equal(wishView.groups[0].items[0].priceCents, 24990);
  const taskView = (await app.client().get(`/api/public/${await tokenOf(tasks)}`)).body;
  assert.ok(!('currency' in taskView.list));
});

test('écrans : la langue se choisit dans « Mon compte » seulement quand une deuxième langue est complète ; <html lang> suit la langue', () => {
  const account = read('public/js/screens/account.js');
  assert.match(account, /if \(READY_LOCALES\.length < 2\) return null;/);
  assert.match(account, /put\('\/api\/me\/locale', \{ locale \}\)/);
  const app = read('public/js/app.js');
  assert.match(app, /document\.documentElement\.lang = locale;/);
  assert.match(read('public/js/public.js'), /document\.documentElement\.lang = setLocale\(/);
  // Prix des envies : par la fonction commune (langue et monnaie)
  assert.match(read('public/js/wishes.js'), /return formatMoney\(cents\);/);
  assert.ok(!/Intl\.NumberFormat\('fr-FR'/.test(read('public/js/wishes.js')));
  // Hors ligne : les nouveaux fichiers sont gardés par le service worker
  const sw = read('public/sw.js');
  for (const file of ['/js/i18n.js', '/js/i18n/fr.js', '/js/i18n/en.js']) assert.ok(sw.includes(`'${file}'`), file);
});
