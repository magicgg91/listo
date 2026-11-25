// Comptes invités : relecture de sécurité (25 novembre 2026,
// docs/cadrage-comptes.md, section 19.6). Un test par point corrigé :
// 1. liens publics : propriétaire changé par l'Admin PENDANT la création
//    (calcul du mot de passe), et lien d'un propriétaire qui ne peut plus
//    en avoir (même réponse qu'un lien inconnu) ;
// 2. temps réel : « event: note » et « event: project » seulement aux
//    comptes qui ont la fonction (comme la synchronisation) ;
// 3. réglages des notifications : rien des listes ni des notes d'un compte
//    qui ne les a pas ;
// 4. accord d'un assistant IA : case « Assistants IA » relue après la
//    vérification du mot de passe ;
// 5. journal « share_unknown_user » ;
// 6. page Notifications : résumé du matin caché sans listes ni projets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { raw, CALLBACK } from './mcp-helpers.js';
import fr from '../public/js/i18n/fr.js';

const uuid = () => crypto.randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pass = (name) => `MotDePasse-${name}`;

async function ops(client, list) {
  const res = await client.post('/api/ops', { ops: list.map((op) => ({ id: uuid(), ...op })) });
  assert.equal(res.status, 200, res.text);
  for (const result of res.body.results) assert.equal(result.status, 200, result.error);
  return res.body.results;
}

// Guillaume (Admin), Léa (Utilisateur)
async function family(t, { mcp = false } = {}) {
  const app = await startTestApp(t, { config: { mcp } });
  const guillaume = await setupAdmin(app, { username: 'g.admin' });
  const ids = {};
  const h = { app, guillaume, ids };
  ids.lea = await addUser(app.db, { username: 'lea.login', password: pass('lea'), displayName: 'Léa' });
  h.lea = app.client();
  await login(h.lea, 'lea.login', pass('lea'));
  return h;
}

// Un invité créé par l'Admin, avec ses cases
async function addGuest(h, name, display, allowed) {
  const res = await h.guillaume.post('/api/admin/users', { username: `${name}.login`, displayName: display, role: 'guest', password: pass(name), allowed });
  assert.equal(res.status, 201, res.text);
  h.app.db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(res.body.user.id);
  h.ids[name] = res.body.user.id;
  h[name] = h.app.client();
  await login(h[name], `${name}.login`, pass(name));
}
const setAllowed = (h, name, allowed) => h.guillaume.request('PATCH', `/api/admin/users/${h.ids[name]}`, { allowed });

// Flux temps réel d'un client : noms des événements reçus
async function openStream(h, client) {
  const controller = new AbortController();
  const cookie = [...client.jar].map(([n, v]) => `${n}=${v}`).join('; ');
  const res = await fetch(`${h.app.base}/api/events`, { headers: { cookie }, signal: controller.signal });
  const stream = { events: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const m of decoder.decode(value, { stream: true }).matchAll(/^event: (.*)$/gm)) stream.events.push(m[1]);
      }
    } catch { /* flux coupé */ }
  })();
  stream.close = () => controller.abort();
  await pause(50);
  return stream;
}

// --- 1. Liens publics ---

// Une liste et une note de Léa
async function leaThings(h) {
  const listId = uuid();
  const noteId = uuid();
  await ops(h.lea, [
    { type: 'list.create', listId, name: 'Courses', listType: 'tasks' },
    { type: 'note.create', noteId, title: 'Codes', body: 'texte' },
  ]);
  return { listId, noteId };
}

// Pendant la création (après le début du calcul du mot de passe, avant
// l'écriture), change la ligne de Léa en base, comme le ferait l'Admin
function changeDuringCreate(h, service, sql) {
  const original = service.create;
  service.create = (...args) => {
    const pending = original(...args); // s'arrête sur le calcul du mot de passe
    h.app.db.prepare(sql).run(h.ids.lea);
    return pending;
  };
  return () => { service.create = original; };
}
const liveListLinks = (h, listId) => h.app.db.prepare('SELECT COUNT(*) FROM public_shares WHERE list_id = ? AND revoked_at IS NULL').pluck().get(listId);
const liveNoteLinks = (h, noteId) => h.app.db.prepare('SELECT COUNT(*) FROM note_public_shares WHERE note_id = ? AND revoked_at IS NULL').pluck().get(noteId);

test('lien public protégé : propriétaire devenu invité, sans Notes ou désactivé pendant le calcul du mot de passe = aucun lien créé, réponse des contrôles habituels', async (t) => {
  const h = await family(t);
  const { listId, noteId } = await leaThings(h);
  const cases = [
    { sql: 'UPDATE users SET guest = 1 WHERE id = ?', undo: 'UPDATE users SET guest = 0 WHERE id = ?', list: [403, fr['ops.invitePartageInterdit']], note: [403, fr['ops.invitePartageInterdit']] },
    { sql: 'UPDATE users SET notes_allowed = 0 WHERE id = ?', undo: 'UPDATE users SET notes_allowed = 1 WHERE id = ?', note: [403, fr['ops.notesNonAutorisees']] },
    { sql: 'UPDATE users SET active = 0 WHERE id = ?', undo: 'UPDATE users SET active = 1 WHERE id = ?', list: [401, fr['comptes.connexionRequise']], note: [401, fr['comptes.connexionRequise']] },
  ];
  for (const c of cases) {
    for (const [kind, service, url, live] of [['list', h.app.ctx.shares, `/api/lists/${listId}/share`, () => liveListLinks(h, listId)], ['note', h.app.ctx.noteShares, `/api/notes/${noteId}/share`, () => liveNoteLinks(h, noteId)]]) {
      if (!c[kind]) continue;
      const restore = changeDuringCreate(h, service, c.sql);
      const res = await h.lea.request('PUT', url, { protect: true, durationHours: 24 });
      restore();
      h.app.db.prepare(c.undo).run(h.ids.lea);
      assert.deepEqual([res.status, res.body?.error], c[kind], `${kind} : ${c.sql}`);
      assert.equal(live(), 0, `${kind} : aucun lien actif (${c.sql})`);
    }
  }
  // Sans changement pendant la création : le lien est créé, comme avant
  assert.equal((await h.lea.request('PUT', `/api/lists/${listId}/share`, { protect: true })).status, 201);
  assert.equal((await h.lea.request('PUT', `/api/notes/${noteId}/share`, { protect: true })).status, 201);
});

test('lien public dont le propriétaire est devenu invité ou sans Notes (sans passer par l\'arrêt des liens) : même réponse qu\'un lien inconnu, page, données et photos', async (t) => {
  const h = await family(t);
  const { listId, noteId } = await leaThings(h);
  const listLink = await h.lea.request('PUT', `/api/lists/${listId}/share`, {});
  const noteLink = await h.lea.request('PUT', `/api/notes/${noteId}/share`, {});
  const tokenOf = (res) => new URL(res.body.share.url).pathname.split('/').pop();
  const listToken = tokenOf(listLink);
  const noteToken = tokenOf(noteLink);
  const visitor = h.app.client({ origin: null });
  const unknown = 'A'.repeat(43);
  const answers = async (token) => {
    const page = await visitor.get(`/p/${token}`);
    const json = await visitor.get(`/api/public/${token}`);
    return [page.status, page.text, json.status, json.text];
  };
  const missing = await answers(unknown);
  assert.equal(missing[0], 404);
  // Avant : les deux liens marchent
  assert.equal((await visitor.get(`/api/public/${listToken}`)).status, 200);
  assert.equal((await visitor.get(`/api/public/${noteToken}`)).status, 200);
  const photo = async (token) => {
    const res = await visitor.get(`/api/public/${token}/photos/${uuid()}`);
    return [res.status, res.text];
  };
  const missingPhoto = await photo(unknown);

  const change = (sql) => h.app.db.prepare(sql).run(h.ids.lea);
  // Devenue invitée (écrit directement : sans l'arrêt des liens)
  change('UPDATE users SET guest = 1 WHERE id = ?');
  assert.deepEqual(await answers(listToken), missing, 'liste : invitée');
  assert.deepEqual(await answers(noteToken), missing, 'note : invitée');
  assert.deepEqual(await photo(listToken), missingPhoto, 'photo : invitée');
  change('UPDATE users SET guest = 0 WHERE id = ?');
  assert.equal((await visitor.get(`/api/public/${listToken}`)).status, 200, 'redevenue Utilisatrice : le lien remarche');
  // Notes retirées : le lien de la note ne mène plus à rien, celui de la liste marche
  change('UPDATE users SET notes_allowed = 0 WHERE id = ?');
  assert.deepEqual(await answers(noteToken), missing, 'note : notes retirées');
  assert.equal((await visitor.get(`/api/public/${listToken}`)).status, 200);
  change('UPDATE users SET notes_allowed = 1 WHERE id = ?');
  assert.equal((await visitor.get(`/api/public/${noteToken}`)).status, 200);
});

// --- 2. Temps réel ---

test('temps réel : ni « event: note » sans notes autorisées, ni « event: project » sans projets utilisés ; notes autorisées mais éteintes : signal gardé (comme la synchronisation)', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true, notes: true, projects: true });
  await ops(h.guillaume, [{ type: 'account.features', projects: true }]);
  const note = uuid();
  const project = uuid();
  await ops(h.guillaume, [
    { type: 'note.create', noteId: note, title: 'Codes', body: '1' },
    { type: 'project.create', projectId: project, name: 'P', columns: [{ columnId: uuid(), name: 'A', color: 'gris' }] },
  ]);
  assert.equal((await h.guillaume.request('PUT', `/api/notes/${note}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'lecture' } })).status, 200);
  assert.equal((await h.guillaume.request('PUT', `/api/projects/${project}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'lecture' } })).status, 200);
  let version = 1;
  const touch = async (stream) => {
    await ops(h.guillaume, [{ type: 'note.update', noteId: note, baseVersion: version++, body: `v${version}` }, { type: 'project.update', projectId: project, name: `P${version}` }]);
    await pause(80);
    const got = { note: stream.events.includes('note'), project: stream.events.includes('project') };
    stream.events.length = 0;
    return got;
  };
  const stream = await openStream(h, h.max);
  assert.deepEqual(await touch(stream), { note: true, project: true }, 'tout utilisé');
  // Éteints par Max lui-même : notes encore synchronisées (signal gardé),
  // projets fermés (rien)
  await ops(h.max, [{ type: 'account.features', notes: false, projects: false }]);
  assert.deepEqual(await touch(stream), { note: true, project: false }, 'éteints par la personne');
  await ops(h.max, [{ type: 'account.features', notes: true, projects: true }]);
  // Retirés par l'Admin
  assert.equal((await setAllowed(h, 'max', { notes: false, projects: false })).status, 200);
  assert.deepEqual(await touch(stream), { note: false, project: false }, 'retirés par l\'Admin');
  stream.close();
});

// --- 3. Réglages des notifications ---

test('réglages des notifications : sourdines vides sans Listes ou sans notes autorisées ; sourdine d\'une note refusée comme les routes des notes', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true, notes: true });
  const listId = uuid();
  const noteId = uuid();
  await ops(h.guillaume, [
    { type: 'list.create', listId, name: 'Atelier', listType: 'tasks' },
    { type: 'note.create', noteId, title: 'Codes', body: '1' },
  ]);
  assert.equal((await h.guillaume.request('PUT', `/api/lists/${listId}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'lecture' } })).status, 200);
  assert.equal((await h.guillaume.request('PUT', `/api/notes/${noteId}/members`, { userIds: [h.ids.max], access: { [h.ids.max]: 'lecture' } })).status, 200);
  assert.equal((await h.max.request('PUT', `/api/push/mutes/${listId}`, { muted: true })).status, 200);
  assert.equal((await h.max.request('PUT', `/api/push/note-mutes/${noteId}`, { muted: true })).status, 200);
  const settings = async () => (await h.max.get('/api/push/settings')).body;
  assert.deepEqual([(await settings()).mutedLists, (await settings()).mutedNotes], [[listId], [noteId]]);
  // L'Admin retire Listes et Notes : plus rien des deux
  assert.equal((await setAllowed(h, 'max', { lists: false, notes: false })).status, 200);
  assert.deepEqual([(await settings()).mutedLists, (await settings()).mutedNotes], [[], []]);
  const mute = await h.max.request('PUT', `/api/push/note-mutes/${noteId}`, { muted: false });
  const noteRoute = await h.max.request('PUT', `/api/notes/${noteId}/members`, { userIds: [] });
  assert.deepEqual([mute.status, mute.body.error], [403, fr['ops.notesNonAutorisees']]);
  assert.deepEqual([mute.status, mute.text], [noteRoute.status, noteRoute.text], 'la réponse des autres routes des notes');
  // Rendues : les sourdines sont toujours là (rien n'est effacé)
  assert.equal((await setAllowed(h, 'max', { lists: true, notes: true })).status, 200);
  assert.deepEqual([(await settings()).mutedLists, (await settings()).mutedNotes], [[listId], [noteId]]);
});

// --- 4. Accord d'un assistant IA ---

test('accord d\'un assistant IA : la case « Assistants IA » et le compte sont relus au moment d\'écrire (après la vérification du mot de passe)', async (t) => {
  const h = await family(t, { mcp: true });
  const reg = await raw(h.app, 'POST', '/oauth/register', { body: { client_name: 'Claude', redirect_uris: [CALLBACK] } });
  const newRequest = async () => {
    const params = new URLSearchParams({ response_type: 'code', client_id: reg.body.client_id, redirect_uri: CALLBACK, code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 's' });
    const start = await fetch(`${h.app.base}/oauth/authorize?${params}`, { redirect: 'manual' });
    return h.app.ctx.oauth.findRequest(start.headers.get('location').split('/').pop());
  };
  const grants = () => h.app.db.prepare('SELECT COUNT(*) FROM oauth_grants WHERE user_id = ? AND revoked_at IS NULL').pluck().get(h.ids.lea);
  for (const [sql, undo] of [
    ['UPDATE users SET mcp_allowed = 0 WHERE id = ?', 'UPDATE users SET mcp_allowed = 1 WHERE id = ?'],
    ['UPDATE users SET active = 0 WHERE id = ?', 'UPDATE users SET active = 1 WHERE id = ?'],
  ]) {
    // La ligne de Léa telle que la route l'a lue avant le mot de passe…
    const stale = h.app.db.prepare('SELECT * FROM users WHERE id = ?').get(h.ids.lea);
    const request = await newRequest();
    // … puis l'Admin change son compte pendant la vérification
    h.app.db.prepare(sql).run(h.ids.lea);
    assert.throws(() => h.app.ctx.oauth.approve(request, stale, { scope: 'read', allLists: true, listIds: [] }, '127.0.0.1'), (error) => error.status === 403, sql);
    assert.equal(grants(), 0, `aucune connexion créée (${sql})`);
    h.app.db.prepare(undo).run(h.ids.lea);
  }
  // Rien de changé : la connexion est créée, comme avant
  const stale = h.app.db.prepare('SELECT * FROM users WHERE id = ?').get(h.ids.lea);
  assert.match(h.app.ctx.oauth.approve(await newRequest(), stale, { scope: 'read', allLists: true, listIds: [] }, '127.0.0.1'), /code=/);
  assert.equal(grants(), 1);
});

// --- 5. Journal ---

test('journal « share_unknown_user » : ajout d\'un compte qu\'on ne voit pas (listes, notes, projets), qui et combien, jamais de nom ; réponse identique à un numéro inconnu', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true, notes: true, projects: true });
  await addGuest(h, 'ines', 'Inès', { lists: true });
  await ops(h.lea, [{ type: 'account.features', projects: true }]);
  const listId = uuid();
  const noteId = uuid();
  const projectId = uuid();
  await ops(h.lea, [
    { type: 'list.create', listId, name: 'Courses', listType: 'tasks' },
    { type: 'note.create', noteId, title: 'Codes', body: '1' },
    { type: 'project.create', projectId, name: 'P', columns: [{ columnId: uuid(), name: 'A', color: 'gris' }] },
  ]);
  const unknownId = 9999;
  for (const [kind, url] of [['list', `/api/lists/${listId}/members`], ['note', `/api/notes/${noteId}/members`], ['project', `/api/projects/${projectId}/members`]]) {
    const before = h.app.logs.length;
    const unknown = await h.lea.request('PUT', url, { userIds: [unknownId] });
    const guest = await h.lea.request('PUT', url, { userIds: [h.ids.max] });
    const two = await h.lea.request('PUT', url, { userIds: [h.ids.max, h.ids.ines, h.ids.lea] });
    assert.equal(guest.status, 400);
    assert.deepEqual([guest.status, guest.text], [unknown.status, unknown.text], `${kind} : réponse identique`);
    assert.deepEqual([two.status, two.text], [unknown.status, unknown.text], `${kind} : réponse identique`);
    const lines = h.app.logs.slice(before).filter((line) => line.includes('share_unknown_user'));
    const id = { list: listId, note: noteId, project: projectId }[kind];
    assert.equal(lines.length, 3, kind);
    assert.match(lines[0], new RegExp(`share_unknown_user user="lea\\.login" ${kind}="${id}" count=1$`));
    assert.match(lines[1], new RegExp(`share_unknown_user user="lea\\.login" ${kind}="${id}" count=1$`));
    assert.match(lines[2], new RegExp(`share_unknown_user user="lea\\.login" ${kind}="${id}" count=2$`));
    for (const line of lines) assert.doesNotMatch(line, /Max|Inès|max\.login|ines\.login/, 'jamais le nom ni l\'identifiant du compte refusé');
  }
  // Un compte qu'on voit : pas de ligne
  const before = h.app.logs.length;
  const zoe = await addUser(h.app.db, { username: 'zoe.login', password: pass('zoe'), displayName: 'Zoé' });
  assert.equal((await h.lea.request('PUT', `/api/lists/${listId}/members`, { userIds: [zoe] })).status, 200);
  assert.ok(!h.app.logs.slice(before).some((line) => line.includes('share_unknown_user')));
});

// --- 6. Page Notifications ---

test('page Notifications : le résumé du matin est caché à un invité qui n\'utilise ni les listes ni les projets', async (t) => {
  const h = await family(t);
  await addGuest(h, 'max', 'Max', { lists: true });
  h.app.ctx.inbox.add(h.ids.max, { category: 'due', textKey: 'digest', params: { today: 1, late: 0 }, targetType: 'deadlines' });
  const digest = async () => (await h.max.get('/api/inbox')).body.rows.filter((row) => row.targetType === 'deadlines').length;
  assert.equal(await digest(), 1, 'avec les Listes');
  assert.equal((await setAllowed(h, 'max', { lists: false })).status, 200);
  assert.equal(await digest(), 0, 'sans Listes ni projets');
  // Projets utilisés : le résumé peut contenir des cartes, il revient
  assert.equal((await setAllowed(h, 'max', { projects: true })).status, 200);
  assert.equal(await digest(), 1, 'avec les projets');
  await ops(h.max, [{ type: 'account.features', projects: false }]);
  assert.equal(await digest(), 0, 'projets éteints');
});
