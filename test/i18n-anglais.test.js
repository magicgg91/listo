// Langues, étape 4 (20 novembre 2026) : l'anglais est complet et proposé.
// - « Mon compte » propose Automatique, Français, English ;
// - le serveur répond dans la langue de la requête (compte, sinon
//   navigateur, sinon LISTO_LANG), les notifications dans celle du
//   destinataire ; les pages sans application ont leur version anglaise ;
// - le manifeste suit la langue du navigateur ;
// - une installation neuve réglée en anglais crée ses magasins et rayons
//   de départ en anglais ; le français ne change pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { READY_LOCALES, translate } from '../public/js/i18n.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { openDatabase, localizeStartingData } from '../server/db.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('l\'anglais est complet et proposé dans « Mon compte »', () => {
  assert.deepEqual(READY_LOCALES, ['fr', 'en']);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  // Aucune valeur anglaise laissée en français (lettres accentuées
  // françaises), sauf les noms propres d'exemple
  const french = Object.entries(en).filter(([, value]) => /[àâçéèêëîïôûùœ]/.test(JSON.stringify(value)) && !/Léa|Zoé|Noël|Élodie/.test(JSON.stringify(value)));
  assert.deepEqual(french.map(([key]) => key), [], 'texte anglais resté en français');
});

test('serveur : les refus suivent la langue du navigateur, puis celle du compte', async (t) => {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  // Sans session, navigateur anglais : refus en anglais
  const anonymous = await app.client().request('GET', '/api/lists', undefined, { 'accept-language': 'en-US,en;q=0.9' });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, translate('en', 'comptes.connexionRequise'));
  assert.notEqual(anonymous.body.error, translate('fr', 'comptes.connexionRequise'));
  // Navigateur français : français
  const french = await app.client().request('GET', '/api/lists', undefined, { 'accept-language': 'fr-FR' });
  assert.equal(french.body.error, translate('fr', 'comptes.connexionRequise'));
  // Compte réglé en anglais : anglais, même avec un navigateur français
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  assert.equal((await lea.request('PUT', '/api/me/locale', { locale: 'en' })).status, 200);
  const refused = await lea.request('GET', '/api/admin/users', undefined, { 'accept-language': 'fr-FR' });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, translate('en', 'comptes.reserveAdmin'));
  // L'Admin, compte en automatique, garde le français
  assert.equal((await admin.request('PUT', '/api/me/locale', { locale: 'de' })).status, 400);
});

test('pages sans application : version anglaise pour un navigateur anglais, la même page pour toute raison', async (t) => {
  const app = await startTestApp(t);
  const page = (url, language) => app.client().request('GET', url, undefined, { 'accept-language': language });
  const unknownFr = await page(`/p/${'a'.repeat(43)}`, 'fr');
  const unknownEn = await page(`/p/${'a'.repeat(43)}`, 'en-US');
  assert.match(unknownFr.text, /<html lang="fr"/);
  assert.match(unknownFr.text, /Lien expiré ou inexistant/);
  assert.match(unknownEn.text, /<html lang="en"/);
  assert.match(unknownEn.text, /Link expired or not found/);
  // Toujours la même page anglaise, quelle que soit la raison
  assert.equal((await page(`/p/${'b'.repeat(43)}`, 'en')).text, unknownEn.text);
  // Les trois pages existent en anglais, avec les mêmes balises que le français
  for (const name of ['lien-invalide.html', 'lien-public.html', 'autorisation-invalide.html']) {
    const tags = (text) => text.replace(/<!--[\s\S]*?-->/g, '').replace(/>[^<]*</g, '><').replace(/(title|content|alt|aria-label)="[^"]*"/g, '');
    assert.equal(tags(read(`server/pages/en/${name}`)).replace('lang="en"', 'lang="fr"'), tags(read(`server/pages/${name}`)), name);
  }
});

test('manifeste : description dans la langue du navigateur, le reste identique', async (t) => {
  const app = await startTestApp(t);
  const get = (language) => app.client().request('GET', '/manifest.webmanifest', undefined, { 'accept-language': language });
  const frManifest = JSON.parse((await get('fr')).text);
  const enManifest = JSON.parse((await get('en-US')).text);
  assert.equal(frManifest.lang, 'fr');
  assert.equal(frManifest.description, JSON.parse(read('public/manifest.webmanifest')).description);
  assert.equal(enManifest.lang, 'en');
  assert.equal(enManifest.description, 'Shared lists: shopping, tasks…');
  assert.deepEqual({ ...enManifest, lang: 'fr', description: frManifest.description }, frManifest);
});

test('installation neuve en anglais : magasins et rayons de départ en anglais ; français et base existante inchangés', () => {
  const english = openDatabase(':memory:');
  assert.ok(localizeStartingData(english, 'en') > 0);
  const aisles = english.prepare('SELECT name FROM aisles ORDER BY id').pluck().all();
  assert.ok(aisles.includes('Produce') && aisles.includes('Frozen'));
  assert.ok(!aisles.some((name) => /[éè]/.test(name)));
  const french = openDatabase(':memory:');
  assert.equal(localizeStartingData(french, 'fr'), 0);
  assert.ok(french.prepare('SELECT name FROM aisles').pluck().all().includes('Fruits et légumes'));
  // index.js : seulement pour une base qui n'existait pas
  const index = read('server/index.js');
  assert.match(index, /const freshDatabase = !fs\.existsSync\(config\.dbPath\);/);
  assert.match(index, /if \(freshDatabase\) localizeStartingData\(db, config\.lang\);/);
});
