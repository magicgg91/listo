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

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('deux onglets, plus de « Catégories » ; « Courses » propose Magasins, Rayons, Articles, chacun avec son contenu d\'avant', () => {
  const admin = code('public/js/screens/admin.js');
  const block = (name) => admin.slice(admin.indexOf(`const ${name} = [`), admin.indexOf('];', admin.indexOf(`const ${name} = [`)));
  const keys = (text) => [...text.matchAll(/\{ key: '([a-z]+)', label: ([^,}]+)/g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(keys(block('TABS')), [['comptes', "'Comptes'"], ['courses', "'Courses'"]]);
  assert.doesNotMatch(admin, /categor|Catégor/i, 'aucune trace des catégories dans l\'écran');
  assert.doesNotMatch(code('public/js/screens/settings.js'), /catégories/);
  assert.deepEqual(keys(block('SHOPPING')).map(([key]) => key), ['magasins', 'rayons', 'noms']);
  // Même contenu qu'avant : magasins et rayons par loadReferences (mêmes routes), articles par loadNames
  assert.match(block('SHOPPING'), /\{ key: 'magasins', label: 'Magasins', api: 'stores', placeholder: 'Nouveau magasin' \}/);
  assert.match(block('SHOPPING'), /\{ key: 'rayons', label: 'Rayons', api: 'aisles', placeholder: 'Nouveau rayon' \}/);
  assert.match(admin, /if \(tab\.key === 'noms'\) return loadNames\(panel, \(\) => alive\);\s*return loadReferences\(tab, panel, \(\) => alive\);/);
  // Le sélecteur : même composant que les onglets, en plus petit, role="tablist"/"tab", aria-selected
  assert.match(admin, /function tabBar\(entries, current, label, extraClass = ''\) \{\s*return h\('div', \{ class: `tabs\$\{extraClass\}`, role: 'tablist', 'aria-label': label \},/);
  assert.match(admin, /role: 'tab',\s*'aria-selected': String\(t\.key === current\),/);
  assert.match(admin, /const choices = shopping \? tabBar\(SHOPPING, shopping\.key, 'Courses', ' tabs--sub'\) : null;/);
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
  assert.match(admin, /TABS\.map\(\(t\) => \(t\.key === 'courses' \? \{ \.\.\.t, target: lastShopping \} : t\)\), shopping \? 'courses' : tab\.key, 'Rubriques'\)/);
  // Adresse inconnue : « Comptes », sans écran d'erreur
  assert.match(admin, /if \(!tab\) \{\s*navigate\('admin', \{ tab: 'comptes' \}, \{ replace: true \}\);/);
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
  assert.match(read('public/js/app.js'), /if \(name === 'admin' && app\.user\.role !== 'admin'\) \{\s*navigate\('settings', \{\}, \{ replace: true \}\);/);
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
  const courses = app.db.prepare("SELECT id FROM categories WHERE name = 'Courses'").pluck().get();
  await lea.post('/api/ops', { ops: [
    { id: crypto.randomUUID(), type: 'list.create', listId, name: 'Courses', categoryId: courses },
    { id: crypto.randomUUID(), type: 'item.create', listId, itemId: crypto.randomUUID(), name: 'Tomatte' },
  ] });
  assert.equal((await admin.post('/api/admin/names/rename', { from: 'tomatte', to: 'Tomate' })).status, 200);
  assert.equal((await admin.post('/api/admin/names/aisle', { from: 'tomate', aisleId: aisle.id })).status, 200);
  assert.equal((await admin.post('/api/admin/names/remove', { from: 'tomate' })).status, 204);
  const names = (await admin.get('/api/admin/stores')).body.items.map((s) => s.name);
  assert.ok(names.includes('Biocoop Centre'));
  assert.ok((await admin.get('/api/admin/aisles')).body.items.some((a) => a.name === 'Épicerie en vrac'));
});
