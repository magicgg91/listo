// Partage aligné (décision du 24 novembre 2026, option « B ») : une seule
// entrée « Partager » dans les menus (propriétaire) ou « Personnes » (les
// autres), un petit choix « Avec des personnes de Listo » / « Par un lien
// temporaire », puis deux feuilles ; plus de partage dans les formulaires
// de liste ; le destinataire d'une liste d'envies reste membre d'office.
//
// Règles pures (public/js/sharing.js), lecture du code des écrans (comme
// les autres tests d'écran), et vérifications sur le serveur : routes
// inchangées, droits inchangés, destinataire gardé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { shareEntry, peopleSummary, linkSummary, membersPayload, membersChanged } from '../public/js/sharing.js';
import { emptyState, applyOp } from '../public/js/store.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-24T10:00:00Z');

test('entrée des menus selon le rôle : « Partager » (propriétaire), « Personnes » (les autres)', () => {
  assert.deepEqual(shareEntry({ owner: true }), { icon: 'users', label: 'Partager' });
  assert.deepEqual(shareEntry({ owner: false }), { icon: 'users', label: 'Personnes' });
  // Note ouverte : son bouton « Personnes » est déjà dans la barre
  assert.equal(shareEntry({ owner: false, withPeople: false }), null);
  assert.deepEqual(shareEntry({ owner: true, withPeople: false }), { icon: 'users', label: 'Partager' });
  // Listes : la même entrée aux deux endroits (menu ⋮ de la liste, ⋯ de la carte), pour chaque rôle
  const actions = code('public/js/screens/list-actions.js');
  assert.match(actions, /const share = \{ \.\.\.shareEntry\(\{ owner: Boolean\(list\.isOwner\) && mayShareOwn\(app\.user\?\.role\) \}\), onSelect: \(\) => openListShare\(list\.id\) \};/);
  assert.match(actions, /wishes \? null : duplicate,\s*share,\s*mute,/);
  assert.match(actions, /\[duplicate, share, mute, pushMute, leave\] : \[share, mute, pushMute, leave\]/);
  assert.doesNotMatch(actions, /partagerLien|openShareSheet/);
  // Notes : une seule entrée, plus de « Lien public » à part
  const notes = code('public/js/screens/notes.js');
  assert.match(notes, /\(owner \|\| shared\) && !note\.deletedAt \? sharing\(note, owner, withPeople\) : null,/);
  assert.doesNotMatch(notes, /lienPublic'\), onSelect|openNoteLinkSheet/);
  for (const key of ['menu.partagerLien', 'notes.menu.lienPublic', 'notes.menu.partager', 'notes.menu.personnes']) assert.ok(!(key in fr), key);
  // Barre d'une note ouverte : le bouton des personnes ouvre le même parcours
  assert.match(code('public/js/screens/note.js'), /onClick: \(\) => \{ if \(note\(\)\) openNoteShare\(noteId\); \},/);
});

test('choix : la ligne des personnes dit avec qui c\'est partagé', () => {
  const me = { id: 1, displayName: 'Guillaume', isOwner: true, active: true };
  assert.equal(peopleSummary([me], 1), 'Seulement vous');
  assert.equal(peopleSummary([me, { id: 2, displayName: 'Léa', active: true }], 1), 'Léa');
  assert.equal(peopleSummary([me, { id: 3, displayName: 'Zoé', active: true }, { id: 2, displayName: 'Léa', active: true }], 1), 'Léa et Zoé');
  // Un compte désactivé n'est pas compté
  assert.equal(peopleSummary([me, { id: 2, displayName: 'Léa', active: true }, { id: 4, displayName: 'Hugo', active: false }], 1), 'Léa');
  const four = ['Léa', 'Zoé', 'Hugo', 'Marc'].map((displayName, i) => ({ id: i + 2, displayName, active: true }));
  assert.equal(peopleSummary([me, ...four.slice(0, 3)], 1), 'Hugo, Léa et Zoé');
  assert.equal(peopleSummary([me, ...four], 1), 'Hugo, Léa et 2 autres personnes');
  assert.equal(peopleSummary(null, 1), 'Seulement vous');
});

test('choix : la ligne du lien dit son état (aucun, expiration, sans limite, mot de passe), d\'après ce que le téléphone sait déjà', () => {
  assert.deepEqual(linkSummary(null, { now: NOW }), { active: false, text: 'Aucun lien' });
  assert.deepEqual(linkSummary(undefined, { now: NOW }), { active: false, text: 'Aucun lien' });
  // Expiré selon l'heure du téléphone : plus de lien
  assert.deepEqual(linkSummary({ expiresAt: new Date(NOW - 1000).toISOString() }, { now: NOW }), { active: false, text: 'Aucun lien' });
  const at = (ms) => ({ expiresAt: new Date(NOW + ms).toISOString() });
  assert.deepEqual(linkSummary(at(6 * 24 * HOUR), { now: NOW }), { active: true, text: 'Lien actif · expire dans 6 jours' });
  assert.equal(linkSummary(at(24 * HOUR), { now: NOW }).text, 'Lien actif · expire dans 24 heures');
  assert.equal(linkSummary(at(5 * HOUR), { now: NOW }).text, 'Lien actif · expire dans 5 heures');
  assert.equal(linkSummary(at(90 * 60 * 1000), { now: NOW }).text, 'Lien actif · expire dans 90 minutes');
  assert.equal(linkSummary(at(1000), { now: NOW }).text, 'Lien actif · expire dans moins d\'une minute');
  assert.deepEqual(linkSummary({ expiresAt: null }, { now: NOW }), { active: true, text: 'Lien actif · sans limite' });
  // Mot de passe : seulement s'il est connu
  assert.equal(linkSummary(at(6 * 24 * HOUR), { now: NOW, isProtected: true }).text, 'Lien actif · expire dans 6 jours · protégé par mot de passe');
  assert.equal(linkSummary({ expiresAt: null }, { now: NOW, isProtected: true }).text, 'Lien actif · sans limite · protégé par mot de passe');
  // Pas de lien : jamais « protégé »
  assert.equal(linkSummary(null, { now: NOW, isProtected: true }).text, 'Aucun lien');
  // L'écran lit publicLink (envoyé au seul propriétaire) et le dernier état connu ; vert ET écrit
  const panel = code('public/js/screens/share-panel.js');
  assert.match(panel, /const sameLink = Boolean\(known && item\.publicLink && known\.expiresAt === item\.publicLink\.expiresAt\);/);
  assert.match(panel, /const link = linkSummary\(item\.publicLink \?\? null, \{ isProtected: sameLink && Boolean\(known\.protected\) \}\);/);
  assert.match(panel, /linkSub\.classList\.toggle\('share-choice__on', link\.active\);/);
  assert.match(read('public/css/app.css'), /\.share-choice__on \{ color: var\(--color-success-ink\); \}/);
});

test('feuille des personnes : ce que « OK » envoie (destinataire toujours « Peut modifier ») et seulement si ça change', () => {
  const rights = new Map([[2, 'modification'], [3, 'lecture']]);
  assert.deepEqual(membersPayload({ guests: new Set([2, 3, 4]), rights }), { userIds: [2, 3, 4], access: { 2: 'modification', 3: 'lecture', 4: 'lecture' } });
  // Destinataire d'une liste d'envies : « Peut modifier », même si un autre droit traînait
  assert.deepEqual(membersPayload({ guests: new Set([5, 2]), rights: new Map([[5, 'lecture']]), beneficiaryId: 5 }), { userIds: [5, 2], access: { 5: 'modification', 2: 'lecture' } });
  const members = [{ id: 1, isOwner: true, access: 'modification' }, { id: 2, isOwner: false, access: 'modification' }];
  assert.equal(membersChanged(members, { userIds: [2], access: { 2: 'modification' } }), false);
  assert.equal(membersChanged(members, { userIds: [2], access: { 2: 'lecture' } }), true);
  assert.equal(membersChanged(members, { userIds: [], access: {} }), true);
  assert.equal(membersChanged(members, { userIds: [2, 3], access: { 2: 'modification', 3: 'lecture' } }), true);
  // Le choix : moi verrouillé, le destinataire membre verrouillé, puis les cases
  const picker = code('public/js/screens/share-picker.js');
  assert.match(picker, /const lockedBeneficiary = beneficiaryId !== null && guests\.has\(beneficiaryId\);/);
  assert.match(picker, /return \{ element, payload: \(\) => membersPayload\(\{ guests, rights, beneficiaryId \}\) \};/);
  // « OK » : la route de la liste ou de la note, avec ce contenu ; en ligne seulement ; erreur : message, rien de changé
  const panel = code('public/js/screens/share-panel.js');
  assert.match(panel, /url: `\/api\/lists\/\$\{encodeURIComponent\(listId\)\}\/members`,/);
  assert.match(panel, /url: `\/api\/notes\/\$\{encodeURIComponent\(noteId\)\}\/members`,/);
  assert.match(panel, /beneficiaryId: \(list\) => \(isWishList\(list\) \? list\.forUserId \?\? null : null\),/);
  assert.match(panel, /if \(pendingCount\(\) \|\| !navigator\.onLine\) \{\s*error\.show\(t\('partage\.personnes\.horsLigne'\)\);\s*return;\s*\}\s*await put\(subject\.url, payload\);\s*await refreshData\(\{ quiet: true \}\);\s*sheet\.close\(\);/);
  assert.match(panel, /catch \(err\) \{\s*error\.show\(t\('partage\.personnes\.echec', \{ message: errorMessage\(err\) \}\)\);/);
});

test('formulaires « Nouvelle liste » et « Modifier la liste » : plus de partage ; « Pour qui ? » reste', () => {
  const form = code('public/js/screens/list-form.js');
  assert.doesNotMatch(form, /formulaire\.partage|accessChoice|\/members`|openShareSheet|share__summary|share-label/);
  for (const key of Object.keys(fr)) assert.ok(!key.startsWith('formulaire.partage') && !key.startsWith('formulaire.droit'), key);
  assert.match(form, /forField\.hidden = !isWishList\(listType\);/);
  assert.match(form, /\.\.\.\(isWishList\(listType\) \? \{ forUserId: beneficiaryId\(\) \?\? undefined, forName: forName \?\? undefined \} : \{\}\),/);
});

test('copie locale : une nouvelle liste d\'envies pour Zoé a Zoé comme membre « Peut modifier », comme sur le serveur', () => {
  const state = emptyState();
  state.users = [{ id: 1, displayName: 'Guillaume' }, { id: 7, displayName: 'Zoé' }];
  const user = { id: 1, username: 'guillaume', displayName: 'Guillaume' };
  applyOp(state, { id: 'o1', type: 'list.create', listId: 'l1', name: 'Envies de Zoé', listType: 'wishes', forUserId: 7 }, { user, now: 'x' });
  assert.deepEqual(state.lists.get('l1').members.map((m) => [m.id, m.isOwner, m.access]), [[1, true, 'modification'], [7, false, 'modification']]);
  // Pour moi, ou une liste d'un autre type : moi seul
  applyOp(state, { id: 'o2', type: 'list.create', listId: 'l2', name: 'Mes envies', listType: 'wishes' }, { user, now: 'x' });
  applyOp(state, { id: 'o3', type: 'list.create', listId: 'l3', name: 'Maison', listType: 'tasks', forUserId: 7 }, { user, now: 'x' });
  assert.deepEqual(state.lists.get('l2').members.map((m) => m.id), [1]);
  assert.deepEqual(state.lists.get('l3').members.map((m) => m.id), [1]);
});

async function household(t) {
  const app = await startTestApp(t);
  const owner = await setupAdmin(app);
  const ids = {};
  const clients = {};
  for (const name of ['zoe', 'lea', 'hugo']) {
    ids[name] = await addUser(app.db, { username: name, password: `MotDePasse-${name}` });
    clients[name] = app.client();
    await login(clients[name], name, `MotDePasse-${name}`);
  }
  return { app, owner, ids, clients };
}

test('serveur : une liste d\'envies créée pour Zoé (sans aucun envoi du partage) a Zoé comme membre « Peut modifier »', async (t) => {
  const { owner, ids, clients } = await household(t);
  const listId = uuid();
  const res = await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Envies de Zoé', listType: 'wishes', forUserId: ids.zoe }] });
  assert.equal(res.body.results[0].status, 200);
  const list = (await owner.get('/api/sync')).body.lists.find((l) => l.id === listId);
  assert.deepEqual(list.members.filter((m) => !m.isOwner).map((m) => [m.id, m.access]), [[ids.zoe, 'modification']]);
  assert.ok((await clients.zoe.get('/api/sync')).body.lists.some((l) => l.id === listId), 'Zoé voit sa liste');
});

test('serveur : « OK » de la feuille des personnes (liste d\'envies) garde le destinataire ; le retirer est refusé ; propriétaire seulement', async (t) => {
  const { owner, ids, clients } = await household(t);
  const listId = uuid();
  await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'list.create', listId, name: 'Envies de Zoé', listType: 'wishes', forUserId: ids.zoe }] });
  const url = `/api/lists/${listId}/members`;
  // Ce que la feuille envoie : le destinataire coché (verrouillé), Léa ajoutée en lecture
  const payload = membersPayload({ guests: new Set([ids.zoe, ids.lea]), rights: new Map([[ids.lea, 'lecture']]), beneficiaryId: ids.zoe });
  assert.equal((await owner.request('PUT', url, payload)).status, 200);
  const members = (await owner.get('/api/sync')).body.lists.find((l) => l.id === listId).members;
  assert.deepEqual(members.filter((m) => !m.isOwner).map((m) => [m.id, m.access]).sort(), [[ids.zoe, 'modification'], [ids.lea, 'lecture']].sort());
  assert.equal(membersChanged(members, payload), false, 'rien à renvoyer');
  // Le destinataire ne peut pas être retiré, ni passer en lecture seule
  assert.equal((await owner.request('PUT', url, { userIds: [ids.lea], access: { [ids.lea]: 'lecture' } })).status, 400);
  assert.equal((await owner.request('PUT', url, { userIds: [ids.zoe], access: { [ids.zoe]: 'lecture' } })).status, 400);
  // Un autre membre ne change rien (même avec « Peut modifier »)
  assert.equal((await clients.zoe.request('PUT', url, { userIds: [ids.zoe, ids.hugo] })).status, 403);
  assert.equal((await clients.lea.request('PUT', url, { userIds: [ids.zoe, ids.lea, ids.hugo] })).status, 403);
});

test('serveur : « OK » pour une note : même contenu, route de la note, propriétaire seulement', async (t) => {
  const { owner, ids, clients } = await household(t);
  const noteId = uuid();
  assert.equal((await owner.post('/api/ops', { ops: [{ id: uuid(), type: 'note.create', noteId, title: 'Vacances', body: 'Gîte' }] })).body.results[0].status, 200);
  const payload = membersPayload({ guests: new Set([ids.lea, ids.hugo]), rights: new Map([[ids.lea, 'modification']]) });
  assert.equal((await owner.request('PUT', `/api/notes/${noteId}/members`, payload)).status, 200);
  const note = (await owner.get('/api/sync')).body.notes.find((n) => n.id === noteId);
  assert.deepEqual(note.members.filter((m) => !m.isOwner).map((m) => [m.id, m.access]).sort(), [[ids.lea, 'modification'], [ids.hugo, 'lecture']].sort());
  // Léa (« Peut modifier ») ne gère pas le partage ; Zoé (rien) non plus
  assert.notEqual((await clients.lea.request('PUT', `/api/notes/${noteId}/members`, { userIds: [ids.lea, ids.zoe] })).status, 200);
  assert.equal((await clients.zoe.request('PUT', `/api/notes/${noteId}/members`, { userIds: [ids.zoe] })).status, 404);
});

test('écrans du partage : aucun innerHTML ni style écrit, textes en français et en anglais (mêmes emplacements), fichiers gardés hors ligne', () => {
  for (const file of ['public/js/sharing.js', 'public/js/screens/share-panel.js', 'public/js/screens/share-picker.js', 'public/js/screens/share.js', 'public/js/screens/list-form.js']) {
    assert.doesNotMatch(code(file), /innerHTML|outerHTML|insertAdjacentHTML|\.style\b/, file);
  }
  const keys = Object.keys(fr).filter((key) => key.startsWith('partage.'));
  assert.ok(keys.length >= 70, String(keys.length));
  const slots = (value) => JSON.stringify(value).match(/\{\w+\}/g)?.sort() ?? [];
  for (const key of keys) {
    assert.ok(en[key], `${key} manque en anglais`);
    assert.deepEqual(slots(en[key]), slots(fr[key]), key);
  }
  assert.equal(fr['partage.feuille.titre'], 'Partager par un lien temporaire');
  assert.equal(fr['partage.personnes.titre'], 'Partager avec des personnes');
  const sw = read('public/sw.js');
  for (const file of ['/js/sharing.js', '/js/screens/share-panel.js', '/js/screens/share-picker.js', '/js/screens/share.js']) assert.ok(sw.includes(`'${file}',`), file);
  assert.match(sw, /const VERSION = `v(16[7-9]|1[7-9]\d|[2-9]\d\d)-/);
});
