// Administration : deux onglets (Comptes, Courses ; les catégories ont
// disparu avec les types de liste) ; « Courses »
// regroupe Magasins, Rayons et Articles, dont le contenu ne change pas.
// Changement d'affichage seulement : les routes du serveur sont les mêmes.
// Rendu et parcours vérifiés aussi dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { matchRoute } from '../public/js/router.js';
import fr from '../public/js/i18n/fr.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('trois onglets (Étiquettes depuis le 24 novembre 2026), plus de « Catégories » ; « Courses » propose Magasins, Rayons, Articles, chacun avec son contenu d\'avant', () => {
  const admin = code('public/js/screens/admin.js');
  const block = (name) => admin.slice(admin.indexOf(`const ${name} = [`), admin.indexOf('];', admin.indexOf(`const ${name} = [`)));
  // Libellé : « label: … », ou lu au moment de l'affichage (« get label() { return …; } »)
  const keys = (text) => [...text.matchAll(/\{ key: '([a-z]+)', (?:get label\(\) \{ return |label: )([^,;}]+)/g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(keys(block('TABS')), [['comptes', "t('administration.onglets.comptes')"], ['courses', "t('administration.onglets.courses')"], ['etiquettes', "t('administration.onglets.etiquettes')"]]);
  assert.equal(fr['administration.onglets.comptes'], 'Comptes');
  assert.equal(fr['administration.onglets.courses'], 'Courses');
  assert.doesNotMatch(admin, /categor|Catégor/i, 'aucune trace des catégories dans l\'écran');
  assert.doesNotMatch(code('public/js/screens/settings.js'), /catégories/);
  assert.deepEqual(keys(block('SHOPPING')).map(([key]) => key), ['magasins', 'rayons', 'noms']);
  // Même contenu qu'avant : magasins et rayons par loadReferences (mêmes routes), articles par loadNames
  assert.match(block('SHOPPING'), /\{ key: 'magasins', get label\(\) \{ return t\('administration\.magasins'\); \}, api: 'stores', get placeholder\(\) \{ return t\('administration\.magasins\.nouveau'\); \} \}/);
  assert.match(block('SHOPPING'), /\{ key: 'rayons', get label\(\) \{ return t\('administration\.rayons'\); \}, api: 'aisles', get placeholder\(\) \{ return t\('administration\.rayons\.nouveau'\); \} \}/);
  assert.equal(fr['administration.magasins'], 'Magasins');
  assert.equal(fr['administration.magasins.nouveau'], 'Nouveau magasin');
  assert.equal(fr['administration.rayons'], 'Rayons');
  assert.equal(fr['administration.rayons.nouveau'], 'Nouveau rayon');
  assert.match(admin, /if \(tab\.key === 'noms'\) return loadNames\(panel, \(\) => alive\);\s*return loadReferences\(tab, panel, \(\) => alive\);/);
  // Le sélecteur : même composant que les onglets, en plus petit ; une navigation
  // (<nav>, aria-current="page"), plus de role="tablist"/"tab" (15 novembre 2026)
  assert.match(admin, /function tabBar\(entries, current, label, extraClass = ''\) \{\s*return h\('nav', \{ class: `tabs\$\{extraClass\}`, 'aria-label': label \},/);
  assert.match(admin, /'aria-current': t\.key === current \? 'page' : null,/);
  assert.doesNotMatch(admin, /role: 'tab/);
  assert.match(admin, /const choices = shopping \? tabBar\(SHOPPING, shopping\.key, t\('administration\.onglets\.courses'\), ' tabs--sub'\) : null;/);
  const css = read('public/css/app.css');
  assert.match(css, /\.tabs--sub \.tab \{ min-height: var\(--tap-min\); font-size: var\(--text-sm\); \}/);
  // Choisi : souligné épais ET texte plus foncé (kit), pas la couleur seule
  assert.match(read('public/css/listo.css'), /\.tab \{[^}]*border-bottom: 3px solid transparent;/);
  // Textes posés en texte ; aucun focus posé dans un champ
  assert.doesNotMatch(admin, /innerHTML|insertAdjacentHTML|\.focus\(\)/);
});

test('adresses : les anciennes (magasins, rayons, noms) mènent au bon choix de « Courses » ; dernier choix retenu', () => {
  for (const tab of ['comptes', 'courses', 'magasins', 'rayons', 'noms']) {
    assert.deepEqual(matchRoute(`#/administration/${tab}`), { name: 'admin', params: { tab } });
  }
  const admin = code('public/js/screens/admin.js');
  // « courses » seul : le dernier choix de la session (magasins au départ)
  assert.match(admin, /let lastShopping = SHOPPING\[0\]\.key;/);
  assert.match(admin, /if \(tabKey === 'courses'\) tabKey = lastShopping;\s*const shopping = SHOPPING\.find\(\(t\) => t\.key === tabKey\);\s*if \(shopping\) lastShopping = shopping\.key;/);
  // L'onglet « Courses » mène au dernier choix ; il est actif pour chacun des trois
  assert.match(admin, /TABS\.map\(\(t\) => \(t\.key === 'courses' \? \{ \.\.\.t, target: lastShopping \} : t\)\), shopping \? 'courses' : tab\.key, t\('administration\.rubriques'\)\)/);
  assert.equal(fr['administration.rubriques'], 'Rubriques');
  // Adresse inconnue : « Comptes », sans écran d'erreur
  assert.match(admin, /if \(!tab\) \{\s*queueMicrotask\(\(\) => navigate\('admin', \{ tab: 'comptes' \}, \{ replace: true \}\)\);/);
  // Rien gardé après la fermeture (pas de stockage)
  assert.doesNotMatch(admin, /localStorage|sessionStorage/);
});

test('droits inchangés : un compte non Admin n\'a pas accès ; les actions de chaque choix répondent comme avant', async (t) => {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app, { username: 'admin' });
  await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  // L'écran n'est pas proposé à un autre compte (app.js), et le serveur refuse
  assert.match(read('public/js/app.js'), /if \(\(name === 'admin' \|\| name === 'adminAccount'\) && app\.user\.role !== 'admin'\) \{\s*navigate\('settings', \{\}, \{ replace: true \}\);/);
  for (const url of ['/api/admin/stores', '/api/admin/aisles', '/api/admin/names', '/api/admin/users']) {
    assert.equal((await lea.get(url)).status, 403, url);
  }
  // Magasins : créer, renommer
  const store = (await admin.post('/api/admin/stores', { name: 'Biocoop' })).body.item;
  assert.equal((await admin.request('PATCH', `/api/admin/stores/${store.id}`, { name: 'Biocoop Centre' })).status, 200);
  // Rayons : créer, renommer
  const aisle = (await admin.post('/api/admin/aisles', { name: 'Vrac' })).body.item;
  assert.equal((await admin.request('PATCH', `/api/admin/aisles/${aisle.id}`, { name: 'Épicerie en vrac' })).status, 200);
  // Articles : un nom enregistré par un ajout, puis corriger, modifier le rayon, retirer
  const listId = crypto.randomUUID();
  await lea.post('/api/ops', { ops: [
    { id: crypto.randomUUID(), type: 'list.create', listId, name: 'Courses', listType: 'shopping' },
    { id: crypto.randomUUID(), type: 'item.create', listId, itemId: crypto.randomUUID(), name: 'Tomatte' },
  ] });
  assert.equal((await admin.post('/api/admin/names/rename', { from: 'tomatte', to: 'Tomate' })).status, 200);
  assert.equal((await admin.post('/api/admin/names/aisle', { from: 'tomate', aisleId: aisle.id })).status, 200);
  assert.equal((await admin.post('/api/admin/names/remove', { from: 'tomate' })).status, 204);
  const names = (await admin.get('/api/admin/stores')).body.items.map((s) => s.name);
  assert.ok(names.includes('Biocoop Centre'));
  assert.ok((await admin.get('/api/admin/aisles')).body.items.some((a) => a.name === 'Épicerie en vrac'));
});
