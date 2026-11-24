// Corbeille des listes : une liste supprimée reste 30 jours chez son
// propriétaire, qui peut la restaurer (GET /api/lists/deleted, POST
// /api/lists/:id/restore) ou la supprimer définitivement (POST
// /api/lists/:id/purge, POST /api/lists/deleted/purge pour « Vider la
// corbeille », 23 novembre 2026). Confirmation de suppression plus claire.
//
// Foyer : Guillaume (Admin), Marie (« Peut modifier »), Paul (« Lecture
// seule »), Zoé (sans accès).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, ORIGIN } from './helpers.js';
import { emptyState, loadSync, mergeSync, toSnapshot } from '../public/js/store.js';
import { deleteListText } from '../public/js/words.js';
import { PURGE_AFTER_DAYS, MAX_TRASH_PURGE } from '../server/lists.js';
import { translate } from '../public/js/i18n.js';
import en from '../public/js/i18n/en.js';
import fr from '../public/js/i18n/fr.js';
import { uuid as mcpUuid, PASSWORD, household as mcpHousehold, connect, claude, data } from './mcp-helpers.js';

const uuid = () => crypto.randomUUID();
const DAY = 24 * 60 * 60 * 1000;
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Petit JPEG (structure seulement), comme dans photos.test.js
const u16 = (n) => Buffer.from([n >> 8, n & 0xff]);
const block = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]), block(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  block(0xdb, Buffer.alloc(65, 1)), block(0xc0, Buffer.from([8, 0, 48, 0, 64, 1, 1, 0x11, 0])), block(0xc4, Buffer.alloc(20, 2)),
  block(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]), Buffer.from([0xff, 0xd9]),
]);
const cookieOf = (client) => [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');

async function household(t, options = {}) {
  const app = await startTestApp(t, options);
  const guillaume = await setupAdmin(app);
  const people = { guillaume, guillaumeId: 1 };
  for (const name of ['marie', 'paul', 'zoe']) {
    people[`${name}Id`] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name[0].toUpperCase() + name.slice(1), people[`${name}Id`]);
    people[name] = app.client();
    await login(people[name], name, `MotDePasse-${name}`);
  }
  const ops = async (client, list) => (await client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) })).body.results;
  const one = async (client, op) => (await ops(client, [op]))[0];
  const ids = { maison: uuid(), courses: uuid(), ampoule: uuid(), vis: uuid(), peinture: uuid(), lait: uuid(), perso: uuid() };
  const res = await ops(guillaume, [
    { type: 'list.create', listId: ids.maison, name: 'Maison', listType: 'tasks', priorityEnabled: true, dueEnabled: true, icon: 'home', addMode: 'quick' },
    { type: 'item.create', listId: ids.maison, itemId: ids.ampoule, name: 'Ampoule', quantity: '3', note: 'E27' },
    { type: 'item.update', itemId: ids.ampoule, priority: 'high', dueDate: '2026-11-20' },
    { type: 'item.create', listId: ids.maison, itemId: ids.vis, name: 'Vis' },
    { type: 'item.check', itemId: ids.vis, checked: true },
    { type: 'item.create', listId: ids.maison, itemId: ids.peinture, name: 'Peinture' },
    { type: 'item.delete', itemId: ids.peinture },
    { type: 'list.create', listId: ids.courses, name: 'Courses', listType: 'shopping', storeId: 1 },
    { type: 'item.create', listId: ids.courses, itemId: ids.lait, name: 'Lait', aisleId: 4 },
  ]);
  assert.ok(res.every((r) => r.status === 200), JSON.stringify(res));
  const access = { [people.marieId]: 'modification', [people.paulId]: 'lecture' };
  assert.equal((await guillaume.request('PUT', `/api/lists/${ids.maison}/members`, { userIds: Object.keys(access).map(Number), access })).status, 200);
  await ops(people.marie, [{ type: 'list.create', listId: ids.perso, name: 'Perso de Marie', listType: 'tasks' }]);
  const trash = async (client) => (await client.get('/api/lists/deleted')).body.lists;
  const restore = (client, listId) => client.post(`/api/lists/${listId}/restore`, {});
  const purge = (client, listId) => client.post(`/api/lists/${listId}/purge`, {});
  const purgeAll = (client, listIds) => client.post('/api/lists/deleted/purge', { ids: listIds });
  const remove = (client, listId) => one(client, { type: 'list.delete', listId });
  return { app, ...people, ids, ops, one, trash, restore, purge, purgeAll, remove };
}

// Flux temps réel brut d'un compte (SSE)
function rawStream(t, h, client) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const state = { raw: '' };
  state.ready = (async () => {
    const res = await fetch(`${h.app.base}/api/events`, { headers: { cookie: cookieOf(client) }, signal: controller.signal });
    const reader = res.body.getReader();
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          state.raw += new TextDecoder().decode(value);
        }
      } catch {
        // flux coupé par le test
      }
    })();
  })();
  return state;
}

test('confirmation : nombre d\'éléments, partage, restauration possible 30 jours ; « Supprimer » rouge, focus sur « Annuler » ; même code pour tous les menus', () => {
  const tasks = { type: 'tasks' };
  assert.deepEqual(deleteListText(tasks, 12, 3), [
    'Elle contient 12 éléments et elle est partagée avec 3 personnes.',
    'Elle disparaît pour tout le monde. Vous pourrez la restaurer pendant 30 jours depuis Réglages > Corbeille.',
  ]);
  assert.equal(deleteListText({ type: 'shopping' }, 1, 1)[0], 'Elle contient 1 article et elle est partagée avec 1 personne.');
  assert.equal(deleteListText({ type: 'wishes' }, 4, 0)[0], 'Elle contient 4 souhaits.', 'pas de partage : rien sur le partage');
  assert.equal(deleteListText(tasks, 0, 2)[0], 'Elle est vide et elle est partagée avec 2 personnes.');
  assert.equal(translate('fr', 'corbeille.ligne', { date: '21 nov.', count: 12 }), 'Supprimée le 21 nov. · encore 12 jours');
  assert.equal(translate('fr', 'corbeille.ligne', { date: '21 nov.', count: 1 }), 'Supprimée le 21 nov. · encore 1 jour');
  const actions = code('public/js/screens/list-actions.js');
  assert.match(actions, /const itemCount = \[\.\.\.app\.data\.items\.values\(\)\]\.filter\(\(item\) => item\.listId === list\.id\)\.length;/);
  assert.match(actions, /const sharedWith = \(list\.members \?\? \[\]\)\.filter\(\(m\) => !m\.isOwner\)\.length;/);
  assert.match(actions, /title: t\('menu\.supprimer\.question', \{ name: list\.name \}\),\s*text: deleteListText\(list, itemCount, sharedWith\),\s*confirmLabel: t\('menu\.supprimer\.confirmer'\),\s*focusCancel: true,/);
  assert.equal(fr['menu.supprimer.question'], 'Supprimer la liste « {name} » ?');
  assert.equal(fr['menu.supprimer.confirmer'], 'Supprimer');
  // Boîte : « Supprimer » rouge (btn--danger), focus de départ sur « Annuler », texte relié au titre pour les lecteurs d'écran
  const ui = code('public/js/ui.js');
  assert.match(ui, /h\('button', \{ class: 'btn btn--secondary', type: 'button', onClick: closeFn, 'data-initial-focus': focusCancel \? true : null \}, cancelLabel\)/);
  assert.match(ui, /class: `btn \$\{danger \? 'btn--danger' : 'btn--primary'\}`/);
  assert.match(ui, /'aria-labelledby': titleId, 'aria-describedby': textId/);
  assert.match(read('public/css/listo.css'), /\.btn \{[^}]*min-height: var\(--tap\);/);
  assert.match(read('public/css/listo.css'), /\.btn--sm \{ min-height: var\(--tap-min\);/);
  // Le texte « ne pourra pas être récupérée » a disparu partout
  for (const file of ['public/js/screens/list-actions.js', 'public/js/help-content.js', 'docs/cahier-des-charges.md', 'docs/developpement.md', 'README.md', 'design/README.md', 'design/components.html']) {
    assert.doesNotMatch(read(file), /pourra pas être récupérée/, file);
  }
});

test('corbeille : seul le propriétaire voit et restaure ses listes supprimées ; membres, Admin et autres comptes : rien, et 404', async (t) => {
  const h = await household(t);
  assert.deepEqual(await h.trash(h.guillaume), []);
  h.app.clock.now = Date.UTC(2026, 10, 3, 10, 0);
  assert.equal((await h.remove(h.guillaume, h.ids.maison)).status, 200);
  assert.equal((await h.remove(h.marie, h.ids.perso)).status, 200);
  // Champs exacts, rien d'interne
  assert.deepEqual(await h.trash(h.guillaume), [{
    id: h.ids.maison, name: 'Maison', type: 'tasks', icon: 'home', itemCount: 2,
    deletedAt: '2026-11-03T10:00:00.000Z', purgeAt: '2026-12-03T10:00:00.000Z', daysLeft: 30,
  }]);
  // Membres de la liste et autres comptes : jamais la liste d'un autre
  assert.deepEqual(await h.trash(h.marie), [{ id: h.ids.perso, name: 'Perso de Marie', type: 'tasks', icon: '', itemCount: 0, deletedAt: '2026-11-03T10:00:00.000Z', purgeAt: '2026-12-03T10:00:00.000Z', daysLeft: 30 }]);
  assert.deepEqual(await h.trash(h.paul), []);
  assert.deepEqual(await h.trash(h.zoe), []);
  // Restaurer la liste d'un autre : la même réponse qu'une liste inconnue
  const unknown = await h.restore(h.guillaume, uuid());
  assert.deepEqual([unknown.status, unknown.body], [404, { error: 'Liste introuvable.' }]);
  for (const [client, listId] of [[h.marie, h.ids.maison], [h.paul, h.ids.maison], [h.zoe, h.ids.maison], [h.guillaume, h.ids.perso]]) {
    const res = await h.restore(client, listId);
    assert.deepEqual([res.status, res.text], [unknown.status, unknown.text], listId);
  }
  assert.equal((await h.restore(h.guillaume, 'pas-un-uuid')).status, 404);
  // Sans session ou depuis un autre site : refusé
  assert.equal((await h.app.client().post(`/api/lists/${h.ids.maison}/restore`, {})).status, 401);
  assert.equal((await h.app.client().get('/api/lists/deleted')).status, 401);
  const foreign = h.app.client({ origin: 'https://evil.example' });
  foreign.jar.set(...[...h.guillaume.jar][0]);
  assert.equal((await foreign.post(`/api/lists/${h.ids.maison}/restore`, {})).status, 403);
  // Rien n'a été restauré par ces essais
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists WHERE deleted_at IS NOT NULL').pluck().get(), 2);
  // Le propriétaire restaure ; le journal le note (identifiants seulement)
  const ok = await h.restore(h.guillaume, h.ids.maison);
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.list.id, h.ids.maison);
  assert.deepEqual(await h.trash(h.guillaume), []);
  assert.ok(h.app.logs.some((l) => /list_restored/.test(l) && l.includes(h.ids.maison) && !l.includes('Maison')), h.app.logs.join('\n'));
  // Double restauration : refusée proprement, rien ne change
  const again = await h.restore(h.guillaume, h.ids.maison);
  assert.deepEqual([again.status, again.text], [unknown.status, unknown.text]);
  // Supprimer de nouveau puis restaurer : permis
  await h.remove(h.guillaume, h.ids.maison);
  assert.equal((await h.restore(h.guillaume, h.ids.maison)).status, 200);
});

test('30 jours : même limite que le nettoyage (29 jours : restaurable ; 31 jours : effacée, 404) ; l\'écran et le nettoyage toujours d\'accord', async (t) => {
  const h = await household(t);
  const start = Date.UTC(2026, 10, 3, 10, 0);
  h.app.clock.now = start;
  await h.remove(h.guillaume, h.ids.maison);
  h.app.clock.now = start + 1000; // Courses supprimée une seconde après
  await h.remove(h.guillaume, h.ids.courses);
  // 29 jours : visible, 1 jour restant, et le nettoyage n'y touche pas
  h.app.clock.now = start + 29 * DAY;
  h.app.ctx.lists.purgeDeleted();
  assert.deepEqual((await h.trash(h.guillaume)).map((l) => [l.name, l.daysLeft]), [['Courses', 2], ['Maison', 1]], 'la plus récente d\'abord ; jours arrondis au-dessus (1 jour et 1 seconde : 2)');
  assert.equal((await h.restore(h.guillaume, h.ids.courses)).status, 200);
  // Une milliseconde avant les 30 jours : encore là, des deux côtés
  h.app.clock.now = start + PURGE_AFTER_DAYS * DAY;
  h.app.ctx.lists.purgeDeleted();
  assert.deepEqual((await h.trash(h.guillaume)).map((l) => l.name), ['Maison']);
  // Au-delà : ni dans la corbeille, ni restaurable, même avant le passage du nettoyage
  h.app.clock.now = start + PURGE_AFTER_DAYS * DAY + 1;
  assert.deepEqual(await h.trash(h.guillaume), []);
  assert.equal((await h.restore(h.guillaume, h.ids.maison)).status, 404);
  // 31 jours : le nettoyage l'a effacée pour de bon (éléments compris)
  h.app.clock.now = start + 31 * DAY;
  h.app.ctx.lists.purgeDeleted();
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists WHERE id = ?').pluck().get(h.ids.maison), 0);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM items WHERE list_id = ?').pluck().get(h.ids.maison), 0);
  assert.equal((await h.restore(h.guillaume, h.ids.maison)).status, 404);
  // La liste restaurée à 29 jours, elle, est restée
  assert.equal((await h.guillaume.get(`/api/lists/${h.ids.courses}`)).status, 200);
});

test('restauration complète : éléments (cochés, supprimés), membres et droits, réglages, photo ; le lien public reste arrêté ; nouveautés à « tout vu »', async (t) => {
  const h = await h_withPhoto(t);
  const share = await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  const listRow = () => h.app.db.prepare('SELECT name, type, priority_enabled, due_enabled, icon, add_mode, store_id, owner_id FROM lists WHERE id = ?').get(h.ids.maison);
  const items = () => h.app.db.prepare('SELECT id, name, quantity, note, checked, priority, due_date, deleted_at, photo_at FROM items WHERE list_id = ? ORDER BY name').all(h.ids.maison);
  const members = () => h.app.db.prepare('SELECT user_id, access FROM list_members WHERE list_id = ? ORDER BY user_id').all(h.ids.maison);
  const before = { list: listRow(), items: items(), members: members() };
  const marieView = (await h.marie.get(`/api/lists/${h.ids.maison}`)).body;
  assert.equal((await h.remove(h.guillaume, h.ids.maison)).status, 200);
  // Supprimée : plus rien pour personne, lien public arrêté, nouveautés effacées
  assert.equal((await h.marie.get(`/api/lists/${h.ids.maison}`)).status, 404);
  assert.equal((await h.app.client().get(`/api/public/${token}`)).status, 404);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_reads WHERE list_id = ?').pluck().get(h.ids.maison), 0);
  assert.equal((await h.restore(h.guillaume, h.ids.maison)).status, 200);
  // Tout revient tel quel (l'élément supprimé avant reste supprimé)
  assert.deepEqual(listRow(), before.list);
  assert.deepEqual(items(), before.items);
  assert.deepEqual(members(), before.members);
  const after = (await h.marie.get(`/api/lists/${h.ids.maison}`)).body;
  assert.deepEqual(after.groups, marieView.groups);
  assert.deepEqual(after.done, marieView.done);
  assert.equal((await h.ops(h.paul, [{ type: 'item.create', listId: h.ids.maison, itemId: uuid(), name: 'x' }]))[0].status, 403, 'Paul toujours en lecture seule');
  assert.equal((await h.ops(h.marie, [{ type: 'item.create', listId: h.ids.maison, itemId: uuid(), name: 'Clou' }]))[0].status, 200, 'Marie peut toujours modifier');
  // La photo est toujours là et servie aux membres
  const photo = await fetch(`${h.app.base}/api/items/${h.ids.ampoule}/photo`, { headers: { cookie: cookieOf(h.paul) } });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  // Le lien public reste arrêté (l'ancien jeton ne marche pas ; le propriétaire en recrée un)
  assert.equal((await h.app.client().get(`/api/public/${token}`)).status, 404);
  assert.deepEqual((await h.guillaume.get(`/api/lists/${h.ids.maison}/share`)).body, { share: null });
  // Nouveautés : chaque membre repart de « tout vu » (repère recréé, journal vide)
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM list_reads WHERE list_id = ?').pluck().get(h.ids.maison), 3);
});

async function h_withPhoto(t) {
  const h = await household(t);
  const res = await fetch(`${h.app.base}/api/items/${h.ids.ampoule}/photo`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', origin: ORIGIN, cookie: cookieOf(h.guillaume) }, body: JPEG });
  assert.equal(res.status, 200, await res.text());
  return h;
}

test('synchronisation : un téléphone resté ouvert (temps réel) et un téléphone hors ligne retrouvent la liste, sans doublon ni liste fantôme', async (t) => {
  const h = await household(t, { eventOptions: { keepaliveMs: 60 * 60 * 1000 } });
  const sync = async (client, since) => (await client.get(`/api/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`)).body;
  // Deux téléphones de Marie : l'un ouvert (il suit chaque étape), l'autre hors ligne
  let open = loadSync(emptyState(), await sync(h.marie));
  const offline = loadSync(emptyState(), await sync(h.marie));
  const reference = toSnapshot(open, 'x');
  const stream = rawStream(t, h, h.marie);
  await stream.ready;
  // Une seconde plus tard sur l'horloge du test (jamais la date réelle : les
  // sessions du test, ouvertes le 16 octobre 2026, expireraient)
  h.app.clock.now += 1000;
  await h.remove(h.guillaume, h.ids.maison);
  await pause(80);
  assert.match(stream.raw, new RegExp(`"listId":"${h.ids.maison}"`), 'suppression signalée');
  open = mergeSync(open, await sync(h.marie, open.serverTime));
  assert.equal(open.lists.has(h.ids.maison), false);
  assert.equal([...open.items.values()].some((i) => i.listId === h.ids.maison), false, 'ses éléments partent aussi');
  const before = stream.raw.length;
  h.app.clock.now += 1000;
  assert.equal((await h.restore(h.guillaume, h.ids.maison)).status, 200);
  await pause(80);
  assert.match(stream.raw.slice(before), new RegExp(`event: list\\ndata: \\{"listId":"${h.ids.maison}"\\}`), 'restauration signalée en temps réel');
  open = mergeSync(open, await sync(h.marie, open.serverTime));
  // Le téléphone ouvert : la liste et ses éléments reviennent, exactement comme une copie neuve
  const fresh = loadSync(emptyState(), await sync(h.marie));
  const comparable = (state) => {
    const snap = toSnapshot(state, 'x');
    return { lists: snap.lists.map((l) => ({ ...l, lastActivity: undefined })).sort((a, b) => a.id.localeCompare(b.id)), items: snap.items.sort((a, b) => a.id.localeCompare(b.id)), listIds: [...snap.listIds].sort() };
  };
  assert.deepEqual(comparable(open), comparable(fresh));
  assert.equal(open.lists.get(h.ids.maison).name, 'Maison');
  assert.equal([...open.items.values()].filter((i) => i.listId === h.ids.maison).length, 2, 'ni doublon, ni élément supprimé');
  // Le téléphone hors ligne pendant la suppression et la restauration : il ne voit rien d'anormal
  const back = mergeSync(offline, await sync(h.marie, offline.serverTime));
  assert.deepEqual(comparable(back), comparable(fresh));
  assert.deepEqual(comparable(back).items.map((i) => i.id), reference.items.map((i) => i.id).sort().concat([]).sort());
});

test('hors ligne : « Restaurer », « Supprimer définitivement » et « Vider la corbeille » inactifs avec une phrase ; rien par la file d\'attente', () => {
  const screen = code('public/js/screens/trash.js');
  assert.match(screen, /export const offlineRestore = \(\) => t\('corbeille\.horsLigne\.restaurer'\);/);
  assert.equal(fr['corbeille.horsLigne.restaurer'], 'Restaurer ou supprimer une liste demande une connexion. Les boutons reviendront avec le réseau.');
  assert.match(screen, /for \(const button of view\.panel\.querySelectorAll\('button\[data-trash-action\]'\)\) button\.disabled = !online \|\| busy;/);
  assert.match(screen, /if \(!navigator\.onLine \|\| busy\) return;/);
  assert.match(screen, /window\.addEventListener\('online', onOnline\);\s*window\.addEventListener\('offline', onOffline\);/);
  assert.match(screen, /await post\(`\/api\/lists\/\$\{encodeURIComponent\(list\.id\)\}\/restore`\);\s*await refreshData\(\{ quiet: true \}\);/);
  assert.match(screen, /toast\(t\('corbeille\.restauree', \{ name: list\.name \}\), \{ action: t\('corbeille\.ouvrir'\), onAction: \(\) => navigate\('list', \{ id: list\.id \}\) \}\);/);
  // Suppression définitive : confirmée, en ligne, puis retirée de l'écran avec un message
  assert.match(screen, /if \(!await confirmDialog\(purgeQuestion\(list\.name, t\('corbeille\.definitif\.texte'\)\)\)\) return;\s*await send\(async \(\) => \{\s*await post\(`\/api\/lists\/\$\{encodeURIComponent\(list\.id\)\}\/purge`\);/);
  assert.match(screen, /if \(!await confirmDialog\(emptyQuestion\(t\('corbeille\.vider\.texte', \{ count: ids\.length \}\)\)\)\) return;/);
  assert.match(screen, /post\('\/api\/lists\/deleted\/purge', \{ ids: ids\.slice\(i, i \+ PURGE_BATCH\) \}\)/);
  assert.match(screen, /const PURGE_BATCH = 500;/);
  assert.equal(MAX_TRASH_PURGE, 500, 'même plafond que l\'écran');
  assert.equal(fr['corbeille.definitif.question'], 'Supprimer définitivement « {name} » ?');
  assert.equal(fr['corbeille.definitif.texte'], 'Elle sera effacée pour de bon, avec ses éléments et ses photos. Impossible de revenir en arrière.');
  assert.equal(translate('fr', 'corbeille.vider.texte', { count: 3 }), 'Les 3 listes de la corbeille seront effacées pour de bon, avec leurs éléments et leurs photos. Impossible de revenir en arrière.');
  assert.equal(fr['corbeille.restauree'], 'Liste « {name} » restaurée');
  assert.equal(fr['corbeille.ouvrir'], 'Ouvrir');
  assert.match(screen, /t\('corbeille\.vide\.titre'\)/);
  assert.equal(fr['corbeille.vide.titre'], 'Aucune liste supprimée.');
  assert.doesNotMatch(screen, /innerHTML|insertAdjacentHTML|\.focus\(/);
  // Aucune opération « restaurer » ni « effacer » dans la file d'attente (/api/ops)
  assert.doesNotMatch(read('server/lists.js'), /'list\.restore'|'list\.purge'/);
  assert.match(read('public/js/router.js'), /\{ name: 'trash', path: '\/reglages\/corbeille' \}/);
  assert.match(code('public/js/screens/settings.js'), /row\(\{ iconName: 'trash', title: t\('reglages\.corbeille'\), onClick: \(\) => navigate\('trash'\) \}\)/);
  // Une seule ligne « Corbeille » depuis le 24 novembre 2026 (trash-page.js)
  assert.equal(fr['reglages.corbeille'], 'Corbeille');
  assert.equal(en['reglages.corbeille'], 'Trash');
  for (const file of ['trash.js', 'trash-parts.js', 'note-trash.js', 'trash-page.js']) assert.match(read('public/sw.js'), new RegExp(`'/js/screens/${file.replace('.', '\\.')}',`), file);
  assert.match(read('public/sw.js'), /'\/js\/trash-tabs\.js',/);
  assert.match(read('public/sw.js'), /const VERSION = `v(16[6-9]|1[7-9]\d|[2-9]\d\d|\d{4,})-/);
});

test('les deux onglets de la Corbeille : le même contenu compact (morceaux communs), boutons nommés, textes en français et en anglais', () => {
  const parts = code('public/js/screens/trash-parts.js');
  const lists = code('public/js/screens/trash.js');
  const notes = code('public/js/screens/note-trash.js');
  for (const [name, screen] of [['listes', lists], ['notes', notes]]) {
    assert.match(screen, /import \{ trashPanel, trashRow, deletedText, trashEmpty, purgeQuestion, emptyQuestion \} from '\.\/trash-parts\.js';/, name);
    assert.match(screen, /trashPanel\(\{ intro: t\('/, name);
    assert.match(screen, /return \{ panel: view\.panel, count: \(\) => /, name);
    assert.match(screen, /trashRow\(\{/, name);
    assert.match(screen, /deletedText\(/, name);
    assert.match(screen, /h\('div', \{ class: 'group' \}, /, name);
    assert.doesNotMatch(screen, /innerHTML|outerHTML|insertAdjacentHTML|\.focus\(|note-trash|trash__|row__icon/, name);
  }
  assert.doesNotMatch(parts, /innerHTML|outerHTML|insertAdjacentHTML|\.focus\(/);
  // Contenu d'un onglet : phrase, nombre et « Vider la corbeille », carte
  // (la barre des Réglages et les onglets : trash-page.js)
  assert.match(parts, /const panel = h\('div', \{\}, h\('p', \{ class: 'page-intro' \}, intro\), banner, tools, content\);/);
  assert.match(parts, /h\('div', \{ class: 'page-tools', hidden: true \}, count, emptyButton\)/);
  assert.match(code('public/js/screens/trash-page.js'), /topbar\(t\('corbeille\.titre'\), \(\) => goBack\('settings'\)\)/);
  // Ligne : titre, poubelle rouge nommée, « Restaurer » nommé, lignes d'information
  assert.match(parts, /h\('button', \{ class: 'icon-btn trash-row__purge', type: 'button', 'data-trash-action': 'purge', 'aria-label': t\('corbeille\.definitif\.label', \{ name \}\), onClick: onPurge \}, icon\('trash'\)\)/);
  assert.match(parts, /h\('button', \{ class: 'btn btn--sm btn--secondary', type: 'button', 'data-trash-action': 'restore', 'aria-label': restoreLabel, onClick: onRestore \}, t\('corbeille\.restaurer'\)\)/);
  assert.match(parts, /meta\.filter\(Boolean\)\.map\(\(line\) => h\('span', \{ class: 'trash-row__meta' \}, line\)\)/);
  assert.match(parts, /formatDate\(new Date\(deletedAt\), \{ day: 'numeric', month: 'short' \}\)/);
  assert.match(lists, /t\('corbeille\.liste', \{ type: TYPE_LABELS\[list\.type\] \?\? '', items: countItems\(list\.itemCount, \{ type: list\.type \}\) \}\)/);
  assert.match(notes, /shared\(note\) \? t\('notes\.corbeille\.partagee', \{ count: shared\(note\) \}\) : null,\s*deletedText\(note\.deletedAt, trashDaysLeft\(note\.deletedAt\)\),/);
  assert.match(lists, /view\.count\.textContent = t\('corbeille\.nombre', \{ count: lists\.length \}\);/);
  assert.match(notes, /view\.count\.textContent = t\('notes\.nombre', \{ count: notes\.length \}\);/);
  // Kit : une seule série de classes, identique dans design/ et public/ ; les anciennes ont disparu
  const kit = read('public/css/listo.css');
  const section = kit.slice(kit.indexOf('/* 16.27 Corbeilles'), kit.indexOf('/* 16.28'));
  assert.ok(read('design/listo.css').includes(section));
  assert.match(section, /\.trash-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(section, /\.trash-row__meta \{ grid-column: 1 \/ -1;/);
  assert.match(section, /\.trash-row__purge \{ color: var\(--color-danger-ink\); \}/);
  for (const file of ['public/css/listo.css', 'design/listo.css', 'public/css/app.css']) assert.doesNotMatch(read(file), /\.note-trash|\.trash__/, file);
  // Textes : nombre, ligne, noms lus, en français et en anglais
  assert.equal(translate('fr', 'corbeille.nombre', { count: 4 }), '4 listes');
  assert.equal(translate('fr', 'corbeille.liste', { type: 'Courses', items: '9 articles' }), 'Courses · 9 articles');
  assert.equal(translate('fr', 'corbeille.definitif.label', { name: 'Courses' }), 'Supprimer définitivement « Courses »');
  assert.equal(translate('en', 'corbeille.ligne', { date: 'Nov 21', count: 28 }), 'Deleted Nov 21 · 28 days left');
  assert.equal(translate('en', 'corbeille.nombre', { count: 1 }), '1 list');
  assert.equal(fr['corbeille.intro'], 'Vos listes supprimées restent ici 30 jours, puis elles sont effacées pour de bon.');
  assert.equal(en['corbeille.intro'], 'Your deleted lists stay here for 30 days, then they\'re erased for good.');
  for (const key of Object.keys(fr).filter((k) => k.startsWith('corbeille.'))) assert.ok(key in en, `en : ${key}`);
});

test('compte désactivé : ses listes supprimées restent (personne d\'autre ne les restaure), il les retrouve s\'il est réactivé ; un compte avec une liste dans la corbeille ne se supprime pas', async (t) => {
  const h = await household(t);
  await h.remove(h.marie, h.ids.perso);
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/users/${h.marieId}`, { active: false })).status, 200);
  assert.equal((await h.marie.get('/api/lists/deleted')).status, 401, 'déconnectée');
  assert.equal((await h.restore(h.guillaume, h.ids.perso)).status, 404, 'l\'Admin ne restaure pas la liste d\'un autre');
  assert.equal((await h.guillaume.del(`/api/admin/users/${h.marieId}`)).status, 409, 'compte « déjà servi » : seulement désactivable');
  assert.equal((await h.guillaume.request('PATCH', `/api/admin/users/${h.marieId}`, { active: true })).status, 200);
  const marie = h.app.client();
  await login(marie, 'marie', 'MotDePasse-marie');
  assert.deepEqual((await marie.get('/api/lists/deleted')).body.lists.map((l) => l.name), ['Perso de Marie']);
  assert.equal((await marie.post(`/api/lists/${h.ids.perso}/restore`, {})).status, 200);
});

test('Claude : une liste supprimée est invisible, et redevient visible une fois restaurée ; aucun outil de restauration', async (t) => {
  const h = await mcpHousehold(t);
  const token = (await connect(h, h.guillaume, PASSWORD)).access_token;
  const c = claude(h, token);
  const names = async () => data(await c.tool('list_lists')).lists.map((l) => l.name).sort();
  assert.deepEqual(await names(), ['Courses', 'Maison', 'Secret']);
  const remove = await h.guillaume.post('/api/ops', { ops: [{ id: mcpUuid(), type: 'list.delete', listId: h.ids.maison }] });
  assert.equal(remove.body.results[0].status, 200);
  assert.deepEqual(await names(), ['Courses', 'Secret']);
  const hidden = await c.tool('read_list', { list_id: h.ids.maison });
  assert.equal(hidden.body.result.isError, true);
  assert.match(JSON.stringify(hidden.body.result.content), /Liste introuvable\./);
  assert.equal((await h.guillaume.post(`/api/lists/${h.ids.maison}/restore`, {})).status, 200);
  assert.deepEqual(await names(), ['Courses', 'Maison', 'Secret']);
  assert.equal(data(await c.tool('read_list', { list_id: h.ids.maison })).items.length, 1);
  // Aucun outil pour restaurer (ni supprimer)
  assert.doesNotMatch(read('server/mcp-tools.js'), /restore|restaur|list\.delete/);
});

// --- Supprimer définitivement (23 novembre 2026) ---

test('supprimer définitivement une liste : propriétaire seulement ; membres, Admin, autres comptes, liste vivante, trop vieille ou déjà effacée : 404 identique', async (t) => {
  const h = await h_withPhoto(t);
  const share = await h.guillaume.request('PUT', `/api/lists/${h.ids.maison}/share`, {});
  assert.equal(share.status, 201, share.text);
  const photoFile = path.join(h.app.photosDir, `${h.ids.ampoule}.jpg`);
  assert.equal(fs.existsSync(photoFile), true);
  h.app.clock.now = Date.UTC(2026, 10, 3, 10, 0);
  await h.remove(h.guillaume, h.ids.maison);
  await h.remove(h.marie, h.ids.perso);
  const unknown = await h.purge(h.guillaume, uuid());
  assert.deepEqual([unknown.status, unknown.body], [404, { error: 'Liste introuvable.' }]);
  // Membres (Peut modifier, Lecture seule), autre compte, l'Admin sur la liste d'un autre, liste vivante, identifiant invalide
  for (const [client, listId] of [[h.marie, h.ids.maison], [h.paul, h.ids.maison], [h.zoe, h.ids.maison], [h.guillaume, h.ids.perso], [h.guillaume, h.ids.courses], [h.guillaume, 'pas-un-uuid']]) {
    const res = await h.purge(client, listId);
    assert.deepEqual([res.status, res.text], [unknown.status, unknown.text], listId);
  }
  // Sans session ou depuis un autre site : refusé
  assert.equal((await h.app.client().post(`/api/lists/${h.ids.maison}/purge`, {})).status, 401);
  const foreign = h.app.client({ origin: 'https://evil.example' });
  foreign.jar.set(...[...h.guillaume.jar][0]);
  assert.equal((await foreign.post(`/api/lists/${h.ids.maison}/purge`, {})).status, 403);
  // Rien n'a été effacé par ces essais
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists').pluck().get(), 3);
  assert.equal(fs.existsSync(photoFile), true);
  assert.equal(h.app.logs.some((l) => /list_purged/.test(l)), false);
  // Le propriétaire supprime définitivement : la liste et tout ce qui va avec, photo comprise
  const ok = await h.purge(h.guillaume, h.ids.maison);
  assert.deepEqual([ok.status, ok.body], [200, { purged: 1 }]);
  const left = (table, column = 'list_id') => h.app.db.prepare(`SELECT COUNT(*) FROM ${table} WHERE ${column} = ?`).pluck().get(h.ids.maison);
  assert.equal(left('lists', 'id'), 0);
  for (const table of ['items', 'list_members', 'list_reads', 'list_events', 'public_shares', 'push_list_mutes']) assert.equal(left(table), 0, table);
  assert.equal(fs.existsSync(photoFile), false, 'photo effacée du disque, comme par le nettoyage');
  assert.deepEqual(await h.trash(h.guillaume), []);
  // Journal en anglais, identifiants seulement (jamais le nom)
  const line = h.app.logs.find((l) => /list_purged/.test(l));
  assert.ok(line && line.includes(h.ids.maison) && line.includes('guillaume') && !line.includes('Maison'), h.app.logs.join('\n'));
  // Ni restauration, ni seconde suppression ; la liste de Marie n'a pas bougé
  for (const res of [await h.restore(h.guillaume, h.ids.maison), await h.purge(h.guillaume, h.ids.maison)]) {
    assert.deepEqual([res.status, res.text], [unknown.status, unknown.text]);
  }
  assert.deepEqual((await h.trash(h.marie)).map((l) => l.name), ['Perso de Marie']);
  // Les autres membres ne voient rien de nouveau : la liste n'est déjà plus dans leur copie
  const sync = (await h.marie.get('/api/sync')).body;
  assert.equal(sync.listIds.includes(h.ids.maison), false);
  assert.equal(sync.lists.some((l) => l.id === h.ids.maison), false);
  // Au-delà de 30 jours, avant même le passage du nettoyage : 404 (même limite que la corbeille)
  h.app.clock.now = Date.UTC(2026, 10, 3, 10, 0) + PURGE_AFTER_DAYS * DAY + 1;
  await login(h.marie, 'marie', 'MotDePasse-marie');
  const late = await h.purge(h.marie, h.ids.perso);
  assert.deepEqual([late.status, late.text], [unknown.status, unknown.text]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM lists WHERE id = ?').pluck().get(h.ids.perso), 1, 'le nettoyage s\'en chargera');
});

test('vider la corbeille : seulement mes listes de la corbeille parmi celles envoyées ; demande mal formée : 400 ; l\'Admin ne vide pas celle d\'un autre', async (t) => {
  const h = await household(t);
  await h.remove(h.guillaume, h.ids.maison);
  await h.remove(h.guillaume, h.ids.courses);
  await h.remove(h.marie, h.ids.perso);
  // Mauvaises demandes : rien n'est effacé
  for (const body of [{}, { ids: 'x' }, { ids: ['pas-un-uuid'] }, { ids: Array.from({ length: MAX_TRASH_PURGE + 1 }, () => uuid()) }]) {
    const res = await h.guillaume.post('/api/lists/deleted/purge', body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    assert.deepEqual(res.body, { error: 'Liste des listes à effacer invalide.' });
  }
  assert.equal((await h.app.client().post('/api/lists/deleted/purge', { ids: [h.ids.maison] })).status, 401);
  // L'Admin envoie la liste de Marie : ignorée (comme une inconnue)
  const admin = await h.purgeAll(h.guillaume, [h.ids.perso, uuid()]);
  assert.deepEqual([admin.status, admin.body], [200, { purged: 0 }]);
  assert.deepEqual((await h.trash(h.marie)).map((l) => l.name), ['Perso de Marie']);
  // Une liste mise à la corbeille après l'affichage (non envoyée) reste
  const shown = (await h.trash(h.guillaume)).map((l) => l.id);
  const later = uuid();
  await h.ops(h.guillaume, [{ type: 'list.create', listId: later, name: 'Plus tard', listType: 'tasks' }]);
  await h.remove(h.guillaume, later);
  const res = await h.purgeAll(h.guillaume, [...shown, h.ids.perso, shown[0].toUpperCase()]);
  assert.deepEqual([res.status, res.body], [200, { purged: 2 }]);
  assert.deepEqual((await h.trash(h.guillaume)).map((l) => l.name), ['Plus tard']);
  assert.equal(h.app.logs.filter((l) => /list_purged/.test(l)).length, 2, 'une ligne par liste');
  for (const id of shown) assert.equal((await h.restore(h.guillaume, id)).status, 404);
  // Recommencer : plus rien à effacer
  assert.deepEqual((await h.purgeAll(h.guillaume, shown)).body, { purged: 0 });
});

test('liste d\'envies : la supprimer définitivement ne transmet rien au bénéficiaire (synchronisation, Notifications, temps réel), réservation ou pas', async (t) => {
  const h = await household(t, { eventOptions: { keepaliveMs: 60 * 60 * 1000 } });
  const noel = uuid();
  const velo = uuid();
  await h.ops(h.guillaume, [
    { type: 'list.create', listId: noel, name: 'Noël de Marie', listType: 'wishes', forUserId: h.marieId },
    { type: 'item.create', listId: noel, itemId: velo, name: 'Vélo' },
  ]);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${noel}/members`, { userIds: [h.marieId, h.paulId], access: { [h.marieId]: 'modification', [h.paulId]: 'modification' } })).status, 200);
  assert.equal((await h.paul.post(`/api/items/${velo}/reservation`, {})).status, 200);
  await h.remove(h.guillaume, noel);
  // Ce que reçoit Marie (bénéficiaire). La copie complète contient encore la
  // liste supprimée et ses souhaits (sans réservation), que son téléphone
  // écarte (absente de listIds) : après l'effacement, seuls ceux-là manquent.
  const seen = async () => {
    const { serverTime, ...sync } = (await h.marie.get('/api/sync')).body;
    return { serverTime, sync, inbox: (await h.marie.get('/api/inbox')).body };
  };
  const withoutNoel = ({ sync, inbox }) => ({
    sync: { ...sync, lists: sync.lists.filter((l) => l.id !== noel), items: sync.items.filter((i) => i.listId !== noel) },
    inbox,
  });
  h.app.clock.now += 1000;
  const before = await seen();
  assert.equal(before.sync.listIds.includes(noel), false);
  assert.deepEqual(before.sync.reservations, (await seen()).sync.reservations);
  const stream = rawStream(t, h, h.marie);
  await stream.ready;
  await pause(50);
  const start = stream.raw.length;
  h.app.clock.now += 1000;
  assert.equal((await h.purge(h.guillaume, noel)).status, 200);
  await pause(80);
  assert.equal(stream.raw.slice(start).replace(/^:.*\n\n/gm, ''), '', 'rien en temps réel');
  const after = await seen();
  assert.deepEqual(withoutNoel(after), withoutNoel(before), 'synchronisation (réservations, nouveautés comprises) et Notifications identiques');
  assert.equal(after.sync.items.some((i) => i.listId === noel), false);
  // Depuis la synchronisation d'avant : aucune liste, aucun souhait
  const delta = (await h.marie.get(`/api/sync?since=${encodeURIComponent(before.serverTime)}`)).body;
  assert.deepEqual([delta.lists, delta.items], [[], []]);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) FROM reservations').pluck().get(), 0, 'réservations effacées avec la liste');
  const line = h.app.logs.find((l) => /list_purged/.test(l));
  assert.ok(line && !/marie|Vélo|reserv/i.test(line), line);
});
