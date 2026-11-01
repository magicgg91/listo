// Droit par personne, côté téléphone : le choix « Peut modifier / Lecture
// seule » (le même composant à la création et dans « Modifier la liste »),
// l'écran d'une liste en lecture seule, la bascule en direct quand le droit
// change, et la file d'attente hors ligne quand le serveur refuse. Le rendu et
// les gestes sont aussi rejoués dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, ORIGIN } from './helpers.js';
import { createQueue } from '../public/js/queue.js';
import { memoryLocal } from '../public/js/localdb.js';
import { emptyState, loadSync, mergeSync, applyOp, canEditList, computeSummaries } from '../public/js/store.js';
import { READ_ONLY } from '../server/lists.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('un seul composant : accessChoice, dans le formulaire commun à la création et à « Modifier la liste »', () => {
  const form = read('public/js/screens/list-form.js');
  // Les deux écrans passent par la même fonction form() (list = null pour la création)
  assert.match(form, /replace\(container, form\(list, users\)\);/);
  assert.equal((form.match(/function form\(/g) ?? []).length, 1);
  // Deux petits choix au bout de la ligne de la personne, « Modifier » (Peut
  // modifier) puis « Lire » (Lecture seule) ; le choix actif est en relief
  // (bord, fond, ombre du kit) et s'annonce par aria-checked
  assert.match(form, /export function accessChoice\(name, value, onChange\) \{/);
  assert.match(form, /\[\['modification', 'Modifier'\], \['lecture', 'Lire'\]\]/);
  assert.match(form, /for \(const option of options\) option\.setAttribute\('aria-checked', String\(option\.dataset\.value === current\)\);/);
  assert.match(form, /h\('div', \{ class: 'segmented share__access', role: 'radiogroup', 'aria-label': `Droit de \$\{name\} sur la liste` \}, options\)/);
  assert.match(read('public/css/listo.css'), /\.segmented__opt\[aria-checked="true"\] \{ border-color: var\(--color-border\); background: var\(--color-surface\); color: var\(--color-text\); box-shadow: var\(--shadow-1\); \}/);
  // Chaque personne (pas le propriétaire) : son choix, caché (place gardée) tant qu'elle n'est pas cochée ;
  // une personne ajoutée commence en lecture seule
  assert.match(form, /const access = accessChoice\(person\.displayName, rights\.get\(person\.id\) \?\? 'lecture', \(value\) => rights\.set\(person\.id, value\)\);/);
  assert.match(form, /access\.classList\.toggle\('is-off', !on\);/);
  assert.match(read('public/css/app.css'), /\.share__access\.is-off \{ visibility: hidden; \}/);
  assert.equal((form.match(/accessChoice\(/g) ?? []).length, 2, 'défini une fois, utilisé une fois (pour les deux écrans)');
  // Moi : ligne verrouillée « Propriétaire » ; le destinataire d'une liste d'envies aussi
  assert.match(form, /lockedRow\(me, `\$\{me\.displayName\} \(vous\)`, 'Propriétaire'\)/);
  // Le partage s'ouvre dans une fenêtre depuis une ligne de résumé ; « OK » dans l'en-tête
  assert.match(form, /class: 'input input--select share__summary', type: 'button', 'aria-haspopup': 'dialog', 'aria-labelledby': 'share-label share-summary',/);
  assert.match(form, /title: 'Partager avec',\s*tools: ok,\s*content: shareList,\s*scroll: true,\s*returnTo: shareButton,/);
  assert.match(form, /summaryText\.textContent = !names\.length \? 'Personne'/);
  // Envoyé au serveur avec la liste des invités, seulement si quelque chose a changé
  assert.match(form, /const access = Object\.fromEntries\(\[\.\.\.guests\]\.map\(\(id\) => \[id, rights\.get\(id\) \?\? 'lecture'\]\)\);/);
  assert.match(form, /\[\.\.\.guests\]\.some\(\(id\) => before\.get\(id\) !== access\[id\]\)/);
  assert.match(form, /await put\(`\/api\/lists\/\$\{id\}\/members`, \{ userIds: \[\.\.\.guests\], access \}\);/);
  assert.doesNotMatch(form, /innerHTML|\.focus\(/);
  // 44 px : .segmented__opt (min-height: var(--tap-min)) de listo.css
  assert.match(read('public/css/listo.css'), /\.segmented__opt \{[^}]*min-height: var\(--tap-min\);/);
});

test('copie locale : canEditList (une seule règle sur le téléphone), liste créée ici = modifiable', () => {
  assert.equal(canEditList({ canEdit: false }), false);
  assert.equal(canEditList({ canEdit: true }), true);
  assert.equal(canEditList({}), true, 'copie gardée d\'avant cette information : jusqu\'à la synchronisation');
  assert.equal(canEditList(null), false);
  const state = emptyState();
  state.categories = [{ id: 1, name: 'Courses', isShopping: true, active: true }];
  applyOp(state, { type: 'list.create', listId: 'l1', name: 'Courses', listType: 'shopping' }, { user: { id: 7, username: 'g', displayName: 'G' }, now: '2026-10-18T10:00:00.000Z' });
  const list = state.lists.get('l1');
  assert.equal(list.canEdit, true);
  assert.equal(list.members[0].access, 'modification');
  // Les écrans n'ont pas leur propre règle
  for (const file of ['public/js/screens/list.js', 'public/js/screens/lists.js']) {
    assert.doesNotMatch(read(file), /\.canEdit\b|'lecture'|'modification'/, file);
    assert.match(read(file), /canEditList\(/, file);
  }
});

test('écran en lecture seule : bandeau, ni champ d\'ajout, ni Scanner, ni glissement, cases inactives, fiche à consulter', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /const readOnlyBanner = h\('p', \{ class: 'readonly-banner', hidden: true \}, icon\('eye', 'icon--sm'\), 'Lecture seule'\);/);
  assert.match(list, /readOnlyBanner\.hidden = canEdit;\s*showAddbar\(\); \/\/ lecture seule : aucun ajout/);
  assert.match(list, /function showAddbar\(\) \{\s*addbar\.hidden = !editable\(\) \|\| search\.focused;/);
  assert.match(list, /scanner\.button\.hidden = !canEdit \|\| !scanAvailable\(list\);/);
  // Ligne sans glissement ni zone rouge (retour avant swipes.attach)
  assert.match(list, /if \(!canEditList\(view\?\.list\)\) return markNews\(h\('li', \{ class: `item\$\{item\.checked \? ' is-done' : ''\}`, 'data-item-id': item\.id \}, \.\.\.itemContent\(item, meta, false\)\), item, meta\);\s*const slide/);
  // Case visible mais inactive (comme la page publique) ; cochée = remplie ET barrée (.is-done)
  assert.match(list, /h\('span', \{ class: `check check--static\$\{item\.checked \? ' is-on' : ''\}`, role: 'img', 'aria-label': isWishList\(view\?\.list\) \? \(item\.checked \? 'Reçu' : 'Pas encore reçu'\) : item\.checked \? 'Coché' : 'Non coché' \}/);
  assert.match(list, /'aria-label': `\$\{canEdit \? 'Modifier' : 'Voir'\} \$\{item\.name\}\$\{meta\.spoken\}`, onClick: \(\) => \(canEdit \? openItemSheet\(item\) : openItemView\(item\)\)/);
  // Pas d'actions sur les cochés
  assert.match(list, /actionsRow\.hidden = !open \|\| !canEdit \|\| !mayCheck\(list\) \|\| inSearch;/);
  // Fiche à consulter : aucun champ, aucun bouton qui écrit, photo qui s'agrandit
  const view = list.slice(list.indexOf('function openItemView'), list.indexOf('// Feuille de choix du rayon'));
  assert.doesNotMatch(view, /h\('input'|h\('textarea'|type: 'submit'|tools:|actions\.(update|delete|check|set|remove)/);
  assert.match(view, /'aria-label': `Agrandir la photo de \$\{it\.name\}`, onClick: \(\) => showPhoto\(it\)/);
  assert.match(view, /title: `Détail \$\{words\.of\}`/);
  // Tri, repli des groupes : inchangés (aucune condition sur le droit)
  assert.doesNotMatch(list.slice(list.indexOf('function foldableGroup'), list.indexOf('// --- Dessin de la liste')), /canEdit/);
  assert.doesNotMatch(list.slice(list.indexOf('const SORTS'), list.indexOf('let view = null')), /canEdit/);
  // Chaque action d'écriture vérifie aussi le droit (le serveur refuse de toute façon)
  for (const guard of [
    /function toggle\(item\) \{\s*if \(!editable\(\) \|\| !mayCheck\(view\?\.list\)\) return;/,
    /async function deleteWithUndo\(item\) \{\s*if \(!editable\(\)\) return;/,
    /async function createItem\(name, fields = \{\}\) \{\s*if \(!editable\(\)\) return false;/,
    /check: \(item, checked\) => editable\(\) && actions\.checkItem\(item, checked\)/,
    /async function sendPhoto\(file\) \{\s*if \(!editable\(\)\) return;/,
    /if \(!ok \|\| !editable\(\)\) return;\s*await actions\.removePhoto\(current\);/,
    /event\.preventDefault\(\);\s*if \(!editable\(\)\) \{\s*sheet\.close\(\);/,
    /function openItemSheet\(item\) \{\s*swipes\.close\(\);[^\n]*\n\s*if \(!editable\(\)\) return openItemView\(item\);/,
  ]) assert.match(list, guard);
  assert.equal((list.match(/if \(!ok \|\| !editable\(\)\) return;/g) ?? []).length, 3, 'tout décocher, retirer les cochés, retirer la photo');
  // Carte de « Mes listes » : pastille (icône ET texte) ; le menu « ⋯ » reste au propriétaire
  const lists = read('public/js/screens/lists.js');
  assert.match(lists, /canEditList\(list\) \? null : h\('span', \{ class: 'chip chip--readonly' \}, icon\('eye', 'icon--xs'\), 'Lecture seule'\)/);
  // Invité en lecture seule : seulement « Quitter la liste » (« Dupliquer la liste » est réservé au propriétaire et à « Peut modifier »)
  assert.match(read('public/js/screens/list-actions.js'), /return canEdit && !wishes \? \[duplicate, mute, leave\] : \[mute, leave\];/);
  assert.doesNotMatch(list, /innerHTML/);
});

test('le droit change pendant que la liste est ouverte : fenêtres fermées, clavier replié, bascule sans recharger', () => {
  const list = read('public/js/screens/list.js');
  assert.match(list, /let couldEdit = app\.data\.lists\.has\(listId\) \? editable\(\) : null;\s*onLeave\(onDataChange\(\(\) => \{/);
  // Arrivée de la liste au premier chargement : pas un changement de droit (aucun message)
  assert.match(list, /if \(couldEdit === null\) couldEdit = now;\s*if \(now === couldEdit\) return;/);
  const watcher = list.slice(list.indexOf('let couldEdit'), list.indexOf("toast(now ? 'Vous pouvez"));
  for (const step of ['releaseFocus();', 'suggestBox.hidden = true;', 'swipes.close();', 'closeOverlays();', 'showAddbar();', 'readOnlyBanner.hidden = now;']) assert.ok(watcher.includes(step), step);
  assert.match(list, /toast\(now \? 'Vous pouvez maintenant modifier cette liste\.' : 'Cette liste est maintenant en lecture seule\.'\);/);
  // Fermer toutes les fenêtres en un seul retour dans l'historique
  const router = read('public/js/router.js');
  assert.match(router, /export function closeOverlays\(\) \{\s*const pushed = overlays\.filter\(\(entry\) => entry\.pushed\)\.length;\s*closeAllOverlays\(\);\s*if \(!pushed\) return;\s*ignoredPops\+\+;/);
  assert.match(router, /history\.go\(-pushed\);/);
});

test('un changement de droit arrive par la synchronisation : la copie du téléphone bascule', async (t) => {
  const app = await startTestApp(t);
  const owner = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const listId = uuid();
  await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Courses', listType: 'shopping' }] });
  await owner.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId] });
  const first = (await lea.get('/api/sync')).body;
  const phone = loadSync(emptyState(), first);
  assert.equal(canEditList(phone.lists.get(listId)), false);
  assert.equal(computeSummaries(phone).find((l) => l.id === listId).canEdit, false, 'carte de « Mes listes »');
  app.clock.now += 60 * 1000;
  await owner.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId], access: { [leaId]: 'modification' } });
  mergeSync(phone, (await lea.get(`/api/sync?since=${encodeURIComponent(first.serverTime)}`)).body);
  assert.equal(canEditList(phone.lists.get(listId)), true);
});

test('hors ligne : une modification refusée (lecture seule) sort de la file, sans boucle ; message dédié', async (t) => {
  const app = await startTestApp(t);
  const owner = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const listId = uuid();
  const milk = uuid();
  await owner.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId, name: 'Courses', listType: 'shopping' },
    { id: uuid(), type: 'item.create', listId, itemId: milk, name: 'Lait' },
  ] });
  await owner.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId], access: { [leaId]: 'modification' } });
  // Le téléphone de Léa, hors ligne : elle coche le lait, ajoute du beurre, retire la photo
  const calls = [];
  const cookie = () => [...lea.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const call = async (method, url, body, type) => {
    calls.push(url);
    const res = await fetch(`${app.base}${url}`, { method, headers: { cookie: cookie(), origin: ORIGIN, ...(type ? { 'content-type': type } : {}) }, body });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error ?? 'refus'), { status: res.status });
    return data;
  };
  const refused = [];
  const queue = createQueue({
    storage: memoryLocal(),
    transport: {
      sendOps: async (ops) => (await call('POST', '/api/ops', JSON.stringify({ ops }), 'application/json')).results,
      putPhoto: (itemId, jpeg) => call('PUT', `/api/items/${itemId}/photo`, jpeg, 'image/jpeg'),
      deletePhoto: (itemId) => call('DELETE', `/api/items/${itemId}/photo`),
    },
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
    events: { refused: (entry, message) => refused.push(message) },
  });
  const beurre = uuid();
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.check', itemId: milk, checked: true } });
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.create', listId, itemId: beurre, name: 'Beurre' } });
  await queue.add({ kind: 'op', op: { id: uuid(), type: 'item.update', itemId: beurre, quantity: '2' } });
  await queue.add({ kind: 'photoDelete', itemId: milk });
  // Pendant ce temps, le propriétaire la passe en lecture seule
  await owner.request('PUT', `/api/lists/${listId}/members`, { userIds: [leaId], access: { [leaId]: 'lecture' } });
  // Retour du réseau : tout est refusé dans l'ordre, rien n'est écrit, la file se vide
  assert.equal(await queue.flush(), 'done');
  assert.equal(queue.count(), 0);
  assert.ok(refused.length >= 3, refused.join(' | '));
  assert.ok(refused.includes(READ_ONLY));
  const items = app.db.prepare('SELECT name, checked FROM items WHERE list_id = ? AND deleted_at IS NULL').all(listId);
  assert.deepEqual(items.map((i) => ({ ...i })), [{ name: 'Lait', checked: 0 }]);
  // Pas de boucle : rien n'est renvoyé
  calls.length = 0;
  assert.equal(await queue.flush(), 'done');
  assert.deepEqual(calls, []);
  // app.js : un seul message dédié, après la synchronisation complète
  const appJs = read('public/js/app.js');
  assert.match(appJs, /const READ_ONLY = 'Vous avez un accès en lecture seule à cette liste\.';/);
  assert.equal(READ_ONLY, 'Vous avez un accès en lecture seule à cette liste.', 'même texte que le serveur');
  assert.match(appJs, /const READ_ONLY_OFFLINE = "Cette liste est maintenant en lecture seule : vos modifications hors ligne n'ont pas été envoyées\.";/);
  assert.match(appJs, /readOnlyRefused = refusals\.includes\(READ_ONLY\);[\s\S]*?const \[first, \.\.\.others\] = refusals\.filter\(\(message\) => message !== READ_ONLY && !OPTION_OFF\.includes\(message\)\);\s*refusals = \[\];\s*full = true;/);
  assert.match(appJs, /dataChanged\(\);\s*if \(readOnlyRefused\) toast\(READ_ONLY_OFFLINE\);/);
});

test('page publique : inchangée (aucun droit, aucun compte)', () => {
  const pub = read('public/js/public.js');
  assert.doesNotMatch(pub, /canEdit|access|accessChoice/);
  assert.doesNotMatch(read('server/routes/public.js'), /canEdit|member_access|list_members\.access/);
});
