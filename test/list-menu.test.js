// Menus d'une liste : le menu « ⋯ » de chaque carte de « Mes listes » et le
// menu ⋮ de la liste ouverte proposent les MÊMES actions, dans le même ordre
// (list-actions.js) : « Modifier la liste », « Partager par lien »,
// « Supprimer la liste » (en dernier, séparée, en rouge). Chacune ouvre le
// même écran que l'autre menu ; seulement pour qui y a droit (le
// propriétaire), et le serveur refuse un invité. « Actualiser » a quitté le
// menu ⋮ : la pastille d'état fait la même chose. Le rendu est aussi vérifié
// dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('actions d\'une liste : Modifier la liste, Partager par lien, Supprimer la liste, dans cet ordre, pour le propriétaire', () => {
  const source = read('public/js/screens/list-actions.js');
  assert.match(source, /export function listActions\(list, \{ onDeleted \} = \{\}\) \{\s*if \(!list\.isOwner\) return \[\];\s*return \[\s*\{ icon: 'pencil', label: 'Modifier la liste', onSelect: \(\) => navigate\('editList', \{ id: list\.id \}\) \},\s*\{ icon: 'link', label: 'Partager par lien', onSelect: \(\) => openShareSheet\(list\) \},\s*\{ icon: 'trash', label: 'Supprimer la liste', danger: true, separated: true, onSelect: async \(\) => \{\s*if \(await deleteListWithConfirm\(list\)\) onDeleted\?\.\(\);/);
  // Les deux menus utilisent cette même fonction (mêmes écrans, même ordre)
  const lists = read('public/js/screens/lists.js');
  const list = read('public/js/screens/list.js');
  assert.match(lists, /const actions = listActions\(list\);/);
  assert.match(list, /const menuActions = \(\) => \(view \? listActions\(view\.list, \{ onDeleted: \(\) => navigate\('lists', \{\}, \{ replace: true \}\) \}\) : \[\]\);/);
  for (const [file, source] of [['lists.js', lists], ['list.js', list]]) {
    assert.doesNotMatch(source, /label: 'Modifier la liste'|label: 'Partager par lien'|label: 'Supprimer la liste'/, `${file} : pas de seconde liste d'actions`);
  }
});

test('menu ⋮ de la liste : plus d\'« Actualiser » ; la pastille d\'état relance la même synchronisation', () => {
  const list = read('public/js/screens/list.js');
  assert.doesNotMatch(list, /label: 'Actualiser'/);
  assert.match(list, /syncPill\(\(\) => refreshData\(\{ full: true \}\)\)/);
  // La pastille est un vrai bouton, toujours actif (en erreur, hors ligne, pendant une synchronisation)
  const ui = read('public/js/ui.js');
  assert.match(ui, /\? h\('button', \{ type: 'button', 'aria-live': 'polite', onClick: onRefresh \}\)/);
  assert.doesNotMatch(ui.slice(ui.indexOf('function paintPill'), ui.indexOf('function fitPill')), /disabled/);
  // Aucune action : pas de bouton de menu (carte comme liste)
  assert.match(list, /menuButton\.hidden = !menuActions\(\)\.length;/);
  assert.match(read('public/js/screens/lists.js'), /if \(!actions\.length\) return card;/);
});

test('carte : bouton « ⋯ » à côté du lien (jamais dedans), aria-label, aria-haspopup, aria-expanded, menu sous le bouton', () => {
  const lists = read('public/js/screens/lists.js');
  assert.match(lists, /return h\('div', \{ class: 'list-card-wrap' \}, card, menuButton\);/);
  assert.match(lists, /const menuButton = iconButton\('more', `Actions de la liste \$\{list\.name\}`, \(\) => \{\s*menuButton\.setAttribute\('aria-expanded', 'true'\);\s*openMenu\(actions, \{ label: `Actions de la liste \$\{list\.name\}`, anchor: menuButton, onClose: \(\) => menuButton\.setAttribute\('aria-expanded', 'false'\) \}\);/);
  assert.match(lists, /menuButton\.setAttribute\('aria-haspopup', 'menu'\);\s*menuButton\.setAttribute\('aria-expanded', 'false'\);/);
  const ui = read('public/js/ui.js');
  assert.match(ui, /panel\.style\.top = `\$\{Math\.max\(8, Math\.min\(below, room\)\)\}px`;/);
  assert.match(ui, /item\.separated \? h\('div', \{ class: 'menu__sep', role: 'separator' \}\) : null/);
  assert.match(read('public/css/app.css'), /\.list-card__menu \{ position: absolute; top: 6px; right: 4px;/);
});

test('retour : « Modifier la liste » ouverte depuis l\'accueil revient à l\'accueil (retour arrière de l\'historique)', () => {
  const form = read('public/js/screens/list-form.js');
  assert.match(form, /iconButton\('close', 'Fermer sans enregistrer', \(\) => goBack\(list \? 'list' : 'lists', list \? \{ id: list\.id \} : \{\}\)\)/);
  assert.match(form, /\} else \{\s*goBack\('list', \{ id \}\);\s*\}/);
  assert.match(read('public/js/router.js'), /export function goBack\(fallback = 'lists', params = \{\}\) \{\s*if \(depth\(\) > 0\) history\.back\(\);/);
});

test('suppression : une seule logique et la même confirmation pour les trois chemins', () => {
  const source = read('public/js/screens/list-actions.js');
  assert.match(source, /title: `Supprimer la liste « \$\{list\.name\} » \?`,/);
  assert.match(source, /pour toutes les personnes de la liste\. Elle ne pourra pas être récupérée \(effacement complet au bout de 30 jours\)\./);
  assert.match(source, /if \(!ok\) return false;\s*await actions\.deleteList\(list\.id\);/);
  assert.match(read('public/js/screens/list-form.js'), /if \(await deleteListWithConfirm\(list\)\) navigate\('lists', \{\}, \{ replace: true \}\);/);
  for (const file of ['public/js/screens/lists.js', 'public/js/screens/list.js', 'public/js/screens/list-form.js']) {
    assert.doesNotMatch(read(file), /actions\.deleteList\(list\.id\)|Cette action est définitive/, `${file} : pas de seconde logique`);
  }
  assert.match(read('public/js/actions.js'), /export const deleteList = \(listId\) => perform\(\{ type: 'list\.delete', listId \}\);/);
  assert.doesNotMatch(source, /focus\(|innerHTML/);
  assert.match(read('public/sw.js'), /'\/js\/screens\/list-actions\.js',/);
});

test('serveur : un invité ne peut ni modifier, ni partager par lien, ni supprimer la liste d\'un autre', async (t) => {
  const app = await startTestApp(t);
  const owner = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const listId = uuid();
  await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Courses', categoryId: 1 }] });
  await owner.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId] });
  assert.equal((await lea.get('/api/sync')).body.lists.find((l) => l.id === listId).isOwner, false, 'le téléphone de Léa ne lui propose aucune action');
  // « Modifier la liste »
  const rename = await lea.post('/api/ops', { ops: [{ id: uuid(), type: 'list.update', listId, name: 'Piratée' }] });
  assert.equal(rename.body.results[0].status, 403);
  assert.equal((await lea.request('PUT', `/api/lists/${listId}/members`, { userIds: [] })).status, 403);
  // « Partager par lien »
  assert.equal((await lea.request('PUT', `/api/lists/${listId}/share`, {})).status, 404);
  // « Supprimer la liste »
  const removed = await lea.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId }] });
  assert.equal(removed.body.results[0].status, 403);
  const row = app.db.prepare('SELECT name, deleted_at FROM lists WHERE id = ?').get(listId);
  assert.deepEqual({ ...row }, { name: 'Courses', deleted_at: null });
  // Le propriétaire, lui, peut tout
  assert.equal((await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.update', listId, name: 'Courses du samedi' }] })).body.results[0].status, 200);
  assert.equal((await owner.request('PUT', `/api/lists/${listId}/share`, {})).status, 201);
  assert.equal((await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId }] })).body.results[0].status, 200);
  assert.ok(!(await lea.get('/api/sync')).body.listIds.includes(listId));
});
