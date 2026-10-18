// Menu « ⋯ » sur chaque carte de « Mes listes » et « Supprimer la liste »
// (accueil, menu ⋮ de la liste ouverte, « Modifier la liste ») : une seule
// logique (list-delete.js), même confirmation, même opération list.delete,
// proposée au seul propriétaire ; le serveur refuse un invité. Le rendu est
// aussi vérifié dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('carte : bouton « ⋯ » à côté du lien (jamais dedans), aria-label, aria-haspopup, aria-expanded', () => {
  const lists = read('public/js/screens/lists.js');
  // Le bouton est frère du lien : un appui sur lui n'ouvre pas la liste
  assert.match(lists, /return h\('div', \{ class: 'list-card-wrap' \}, card, menuButton\);/);
  assert.match(lists, /const menuButton = iconButton\('more', `Actions de la liste \$\{list\.name\}`, \(\) => \{\s*menuButton\.setAttribute\('aria-expanded', 'true'\);\s*openMenu\(actions, \{ label: `Actions de la liste \$\{list\.name\}`, anchor: menuButton, onClose: \(\) => menuButton\.setAttribute\('aria-expanded', 'false'\) \}\);/);
  assert.match(lists, /menuButton\.setAttribute\('aria-haspopup', 'menu'\);\s*menuButton\.setAttribute\('aria-expanded', 'false'\);/);
  // Aucune action pour cette carte : pas de bouton
  assert.match(lists, /if \(!actions\.length\) return card;/);
  // Seulement « Supprimer la liste », et seulement pour le propriétaire
  assert.match(lists, /if \(list\.isOwner\) \{\s*items\.push\(\{ icon: 'trash', label: 'Supprimer la liste', danger: true, onSelect: \(\) => deleteListWithConfirm\(list\) \}\);/);
  // Menu placé sous le bouton, jamais hors de l'écran
  const ui = read('public/js/ui.js');
  assert.match(ui, /panel\.style\.top = `\$\{Math\.max\(8, Math\.min\(below, room\)\)\}px`;/);
  // Même icône que le menu de la liste ouverte, 44 px
  assert.match(read('public/js/screens/list.js'), /iconButton\('more', 'Menu de la liste'/);
  assert.match(read('public/css/app.css'), /\.list-card__menu \{ position: absolute; top: 6px; right: 4px;/);
});

test('liste ouverte : « Supprimer la liste » en dernier, séparée, en rouge, pour le propriétaire', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /items\.push\(\{ icon: 'sync', label: 'Actualiser'[^\n]*\n[^\n]*\n[^\n]*\n\s*if \(view\.list\.isOwner\) \{\s*items\.push\(\{ icon: 'trash', label: 'Supprimer la liste', danger: true, separated: true, onSelect: async \(\) => \{\s*if \(await deleteListWithConfirm\(view\.list\)\) navigate\('lists', \{\}, \{ replace: true \}\);/);
  assert.match(list, /\}\s*openMenu\(items, \{ label: 'Menu de la liste' \}\);/);
  const ui = read('public/js/ui.js');
  assert.match(ui, /item\.separated \? h\('div', \{ class: 'menu__sep', role: 'separator' \}\) : null/);
  assert.match(ui, /class: `menu__item\$\{item\.danger \? ' menu__item--danger' : ''\}`/);
});

test('trois chemins, une seule logique : même confirmation, même opération', () => {
  const del = read('public/js/screens/list-delete.js');
  assert.match(del, /title: `Supprimer la liste « \$\{list\.name\} » \?`,/);
  assert.match(del, /pour toutes les personnes de la liste\. Elle ne pourra pas être récupérée \(effacement complet au bout de 30 jours\)\./);
  assert.match(del, /if \(!ok\) return false;\s*await actions\.deleteList\(list\.id\);/);
  for (const file of ['public/js/screens/lists.js', 'public/js/screens/list.js', 'public/js/screens/list-form.js']) {
    const source = read(file);
    assert.match(source, /import \{ deleteListWithConfirm \} from '\.\/list-delete\.js';/, file);
    assert.doesNotMatch(source, /actions\.deleteList\(list\.id\)|Cette action est définitive/, `${file} : pas de seconde logique`);
  }
  // Opération de la file d'attente (hors ligne compris)
  assert.match(read('public/js/actions.js'), /export const deleteList = \(listId\) => perform\(\{ type: 'list\.delete', listId \}\);/);
  // Aucun focus automatique sur un champ, texte posé en texte
  assert.doesNotMatch(del, /focus\(|innerHTML/);
  assert.match(read('public/sw.js'), /'\/js\/screens\/list-delete\.js',/);
});

test('serveur : seul le propriétaire supprime ; un invité est refusé et la liste reste', async (t) => {
  const app = await startTestApp(t);
  const owner = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const listId = uuid();
  await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Courses', categoryId: 1 }] });
  await owner.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId] });
  // L'invitée voit la liste, mais elle n'en est pas propriétaire
  const seen = (await lea.get('/api/sync')).body.lists.find((l) => l.id === listId);
  assert.equal(seen.isOwner, false);
  const refused = await lea.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId }] });
  assert.equal(refused.body.results[0].status, 403);
  assert.equal(app.db.prepare('SELECT deleted_at FROM lists WHERE id = ?').pluck().get(listId), null);
  // Le propriétaire, lui, la supprime (suppression logique, effacée après 30 jours)
  const done = await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.delete', listId }] });
  assert.equal(done.body.results[0].status, 200);
  assert.ok(app.db.prepare('SELECT deleted_at FROM lists WHERE id = ?').pluck().get(listId));
  assert.ok(!(await lea.get('/api/sync')).body.listIds.includes(listId), 'disparue pour l\'invitée aussi');
});
