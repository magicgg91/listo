// Corbeille des listes : une liste supprimée reste 30 jours chez son
// propriétaire, qui peut la restaurer (GET /api/lists/deleted, POST
// /api/lists/:id/restore). Confirmation de suppression plus claire.
//
// Foyer : Guillaume (Admin), Marie (« Peut modifier »), Paul (« Lecture
// seule »), Zoé (sans accès).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, ORIGIN } from './helpers.js';
import { emptyState, loadSync, mergeSync, toSnapshot } from '../public/js/store.js';
import { deleteListText, trashDaysText } from '../public/js/words.js';
import { PURGE_AFTER_DAYS } from '../server/lists.js';
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
  const remove = (client, listId) => one(client, { type: 'list.delete', listId });
  return { app, ...people, ids, ops, one, trash, restore, remove };
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
    'Elle disparaît pour tout le monde. Vous pourrez la restaurer pendant 30 jours depuis Réglages > Corbeille des listes.',
  ]);
  assert.equal(deleteListText({ type: 'shopping' }, 1, 1)[0], 'Elle contient 1 article et elle est partagée avec 1 personne.');
  assert.equal(deleteListText({ type: 'wishes' }, 4, 0)[0], 'Elle contient 4 souhaits.', 'pas de partage : rien sur le partage');
  assert.equal(deleteListText(tasks, 0, 2)[0], 'Elle est vide et elle est partagée avec 2 personnes.');
  assert.equal(trashDaysText(12), 'Suppression définitive dans 12 jours');
  assert.equal(trashDaysText(1), 'Suppression définitive dans 1 jour');
  const actions = code('public/js/screens/list-actions.js');
  assert.match(actions, /const itemCount = \[\.\.\.app\.data\.items\.values\(\)\]\.filter\(\(item\) => item\.listId === list\.id\)\.length;/);
  assert.match(actions, /const sharedWith = \(list\.members \?\? \[\]\)\.filter\(\(m\) => !m\.isOwner\)\.length;/);
  assert.match(actions, /title: `Supprimer la liste « \$\{list\.name\} » \?`,\s*text: deleteListText\(list, itemCount, sharedWith\),\s*confirmLabel: 'Supprimer',\s*focusCancel: true,/);
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
  assert.ok(h.app.logs.some((l) => /liste_restauree/.test(l) && l.includes(h.ids.maison) && !l.includes('Maison')), h.app.logs.join('\n'));
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
  h.app.clock.now = Date.now() + 1000;
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

test('hors ligne : « Restaurer » inactif avec une phrase ; pas de restauration par la file d\'attente', () => {
  const screen = code('public/js/screens/trash.js');
  assert.match(screen, /export const OFFLINE_RESTORE = 'Restaurer une liste demande une connexion\. Les boutons reviendront avec le réseau\.';/);
  assert.match(screen, /for \(const button of panel\.querySelectorAll\('button\[data-restore\]'\)\) button\.disabled = !online \|\| busy;/);
  assert.match(screen, /if \(!navigator\.onLine \|\| busy\) return;/);
  assert.match(screen, /window\.addEventListener\('online', onOnline\);\s*window\.addEventListener\('offline', onOffline\);/);
  assert.match(screen, /await post\(`\/api\/lists\/\$\{encodeURIComponent\(list\.id\)\}\/restore`\);\s*await refreshData\(\{ quiet: true \}\);/);
  assert.match(screen, /toast\(`Liste « \$\{list\.name\} » restaurée`, \{ action: 'Ouvrir', onAction: \(\) => navigate\('list', \{ id: list\.id \}\) \}\);/);
  assert.match(screen, /'Aucune liste supprimée\.'/);
  assert.doesNotMatch(screen, /innerHTML|insertAdjacentHTML|\.focus\(/);
  // Aucune opération « restaurer » dans la file d'attente (/api/ops)
  assert.doesNotMatch(read('server/lists.js'), /'list\.restore'/);
  assert.match(read('public/js/router.js'), /\{ name: 'trash', path: '\/reglages\/corbeille' \}/);
  assert.match(code('public/js/screens/settings.js'), /row\(\{ iconName: 'trash', title: 'Corbeille des listes', sub: 'Restaurer une liste supprimée \(30 jours\)', onClick: \(\) => navigate\('trash'\) \}\)/);
  assert.match(read('public/sw.js'), /'\/js\/screens\/trash\.js',/);
  assert.match(read('public/sw.js'), /const VERSION = `v(6[3-9]|[7-9]\d|\d{3,})-/);
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
