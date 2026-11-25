// Projets dans la copie locale du téléphone (public/js/project-store.js,
// branché dans store.js) : synchronisation complète et « depuis »,
// opérations hors ligne avec les mêmes règles que le serveur (rôles, droits
// sur une carte, ordre), projets coupés, projets rallumés (tout est
// rechargé), cartes effacées pour de bon, étiquettes supprimées, corbeille,
// copie gardée sur le téléphone. Et le même résultat que le serveur, de bout
// en bout : la copie locale après des opérations hors ligne est celle que
// le serveur renvoie ensuite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { emptyState, loadSync, mergeSync, applyOp, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { columnCards, myCardRights, projectCards } from '../public/js/project-store.js';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';

const uuid = () => crypto.randomUUID();
const NOW = '2026-11-25T10:00:00.000Z';
const ME = { id: 3, displayName: 'Hugo' };

// Un projet tel que le serveur le décrit, avec mon rôle
function sample(role = 'contributor') {
  const state = emptyState();
  const project = {
    id: 'p1', name: 'DomoPi Articles', role, priorityEnabled: false, createdAt: NOW, updatedAt: NOW, deletedAt: null,
    members: [{ id: 2, displayName: 'Léa', active: true, role: 'owner' }, { id: 3, displayName: 'Hugo', active: true, role }, { id: 4, displayName: 'Marc', active: true, role: 'reader' }],
    columns: [{ id: 'c1', name: 'Idées', color: 'gris', position: 1024 }, { id: 'c2', name: 'Publiés', color: 'vert', position: 2048 }],
    labels: [{ id: 'l1', name: 'Sécurité', color: 'rouge' }],
    cardIds: ['k1', 'k2', 'k3'],
  };
  const card = (id, position, extra = {}) => ({
    id, projectId: 'p1', columnId: 'c1', position, title: id, labelIds: [], assigneeIds: [], createdByMe: false, createdByName: 'Léa',
    createdAt: NOW, updatedAt: NOW, updatedByName: null, deletedAt: null, deletedByName: null, deletedColumnName: null, ...extra,
  });
  loadSync(state, {
    serverTime: NOW, listIds: [], lists: [], items: [], stores: [], aisles: [], history: [],
    features: { notes: true, projects: true },
    projects: [project], projectIds: ['p1'],
    cards: [card('k1', 1024, { createdByMe: true }), card('k2', 2048, { assigneeIds: [3] }), card('k3', 3072)],
    projectMine: { p1: { mutedNews: false, mutedPush: false, inDeadlines: false, lastEvent: 9, unread: true } },
  });
  return state;
}
const apply = (state, op, user = ME) => applyOp(state, { id: uuid(), ...op }, { user, now: NOW });
const order = (state, columnId = 'c1') => columnCards(state, columnId).map((card) => card.id);

test('synchronisation complète : projets, cartes, mes réglages ; rien quand les projets sont coupés', () => {
  const state = sample();
  assert.deepEqual([...state.projectIds], ['p1']);
  assert.equal(state.cards.size, 3);
  assert.equal(state.projectMine.p1.unread, true);
  assert.equal(state.projectsReload, false);
  const off = emptyState();
  loadSync(off, { serverTime: NOW, listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { notes: true, projects: false }, projects: [], projectIds: [], cards: [], projectMine: {} });
  assert.equal(off.projects.size, 0);
  // Coupés : une opération des projets ne change rien sur le téléphone
  apply(off, { type: 'project.create', projectId: 'p9', name: 'X', columns: [{ columnId: 'c9', name: 'A' }] });
  assert.equal(off.projects.size, 0);
});

test('Contributeur : crée, modifie et déplace ses cartes et celles qui lui sont attribuées ; jamais les autres, ni les colonnes, ni les étiquettes du projet', () => {
  const state = sample('contributor');
  assert.deepEqual(['k1', 'k2', 'k3'].map((id) => myCardRights(state, state.cards.get(id), ME).edit), [true, true, false]);
  apply(state, { type: 'card.update', cardId: 'k1', title: 'Ma carte' });
  apply(state, { type: 'card.update', cardId: 'k2', title: 'Attribuée' });
  apply(state, { type: 'card.update', cardId: 'k3', title: 'Pas à moi' });
  assert.deepEqual(['k1', 'k2', 'k3'].map((id) => state.cards.get(id).title), ['Ma carte', 'Attribuée', 'k3']);
  apply(state, { type: 'card.delete', cardId: 'k2' });
  assert.equal(state.cards.get('k2').deletedAt, null, 'supprimer : seulement ses cartes');
  apply(state, { type: 'card.assign', cardId: 'k2', userIds: [2, 3] });
  assert.deepEqual(state.cards.get('k2').assigneeIds, [3], 'ni attribuer quelqu\'un d\'autre');
  apply(state, { type: 'card.assign', cardId: 'k2', userIds: [] });
  assert.deepEqual(state.cards.get('k2').assigneeIds, [], 'mais se retirer');
  assert.equal(myCardRights(state, state.cards.get('k2'), ME).edit, false, 'retiré : plus de modification');
  apply(state, { type: 'card.assign', cardId: 'k1', userIds: [4] });
  assert.deepEqual(state.cards.get('k1').assigneeIds, [], 'jamais une personne en lecture seule');
  apply(state, { type: 'column.create', projectId: 'p1', columnId: 'c3', name: 'Relecture' });
  apply(state, { type: 'label.create', projectId: 'p1', labelId: 'l2', name: 'Proxmox' });
  assert.equal(state.projects.get('p1').columns.length, 2);
  assert.equal(state.projects.get('p1').labels.length, 1);
  const cardId = uuid();
  apply(state, { type: 'card.create', projectId: 'p1', cardId, columnId: 'c2', title: '  Nouvelle\ncarte ' });
  const created = state.cards.get(cardId);
  assert.deepEqual([created.title, created.createdByMe, created.columnId], ['Nouvelle carte', true, 'c2']);
  assert.ok(state.projects.get('p1').cardIds.includes(cardId));
  // Rejouée (après une synchronisation) : jamais deux fois
  apply(state, { type: 'card.create', projectId: 'p1', cardId, columnId: 'c2', title: 'Autre' });
  assert.equal(state.cards.get(cardId).title, 'Nouvelle carte');
});

test('Lecture seule : rien ne change, sauf ses réglages à soi ; dupliquer le projet reste possible', () => {
  const state = sample('reader');
  const before = JSON.stringify([...state.cards.values()]);
  apply(state, { type: 'card.create', projectId: 'p1', cardId: uuid(), columnId: 'c1', title: 'x' });
  apply(state, { type: 'card.move', cardId: 'k1', columnId: 'c2' });
  apply(state, { type: 'card.labels', cardId: 'k1', labelIds: ['l1'] });
  apply(state, { type: 'card.duplicate', cardId: 'k1', newCardId: uuid(), title: 'k1 (copie)' });
  assert.equal(JSON.stringify([...state.cards.values()]), before);
  apply(state, { type: 'project.state', projectId: 'p1', mutedNews: true, inDeadlines: true });
  assert.deepEqual(state.projectMine.p1, { mutedNews: true, mutedPush: false, inDeadlines: true, lastEvent: 9, unread: false });
  apply(state, { type: 'project.duplicate', projectId: 'p1', newProjectId: 'p2', name: 'DomoPi Articles (copie)', columnIds: { c1: 'n1', c2: 'n2' }, labelIds: { l1: 'm1' } });
  const copy = state.projects.get('p2');
  assert.equal(copy.role, 'owner');
  assert.deepEqual(copy.columns.map((c) => [c.id, c.name]), [['n1', 'Idées'], ['n2', 'Publiés']]);
  assert.deepEqual(copy.labels.map((l) => l.id), ['m1']);
  assert.equal(projectCards(state, 'p2').length, 0, 'sans cartes');
  assert.deepEqual(copy.members.map((m) => m.role), ['owner'], 'partagé avec personne');
});

test('ordre : en haut, après une carte, en bas, Monter et Descendre ; colonne supprimée entre-temps : première colonne', () => {
  const state = sample('editor');
  apply(state, { type: 'card.move', cardId: 'k3', afterId: null });
  assert.deepEqual(order(state), ['k3', 'k1', 'k2']);
  apply(state, { type: 'card.move', cardId: 'k3', afterId: 'k1' });
  assert.deepEqual(order(state), ['k1', 'k3', 'k2']);
  apply(state, { type: 'card.move', cardId: 'k1' });
  assert.deepEqual(order(state), ['k3', 'k2', 'k1']);
  apply(state, { type: 'card.move', cardId: 'k2', columnId: 'c2', afterId: null });
  assert.deepEqual([order(state), order(state, 'c2')], [['k3', 'k1'], ['k2']]);
  apply(state, { type: 'card.move', cardId: 'k3', columnId: 'disparue' });
  assert.deepEqual(order(state), ['k1', 'k3'], 'colonne inconnue : en bas de la première');
  // Colonnes : déplacer, supprimer avec ses cartes (déplacées, ou dans les cartes supprimées)
  apply(state, { type: 'column.move', projectId: 'p1', columnId: 'c2', afterId: null });
  assert.deepEqual(state.projects.get('p1').columns.sort((a, b) => a.position - b.position).map((c) => c.id), ['c2', 'c1']);
  apply(state, { type: 'column.delete', projectId: 'p1', columnId: 'c1' });
  assert.equal(state.projects.get('p1').columns.length, 2, 'avec des cartes, sans choix : rien');
  apply(state, { type: 'column.delete', projectId: 'p1', columnId: 'c1', moveTo: 'c2' });
  assert.deepEqual(order(state, 'c2'), ['k2', 'k1', 'k3']);
  apply(state, { type: 'column.create', projectId: 'p1', columnId: 'c3', name: 'Relecture', afterId: 'c2' });
  apply(state, { type: 'column.delete', projectId: 'p1', columnId: 'c2', deleteCards: true });
  assert.deepEqual(projectCards(state, 'p1', { deleted: true }).map((c) => [c.id, c.deletedColumnName]).sort(), [['k1', 'Publiés'], ['k2', 'Publiés'], ['k3', 'Publiés']]);
  apply(state, { type: 'column.delete', projectId: 'p1', columnId: 'c3', deleteCards: true });
  assert.equal(state.projects.get('p1').columns.length, 1, 'jamais la dernière');
  // Restaurer : en bas de la première colonne qui reste
  apply(state, { type: 'card.restore', cardId: 'k2' });
  assert.deepEqual([state.cards.get('k2').columnId, state.cards.get('k2').deletedAt], ['c3', null]);
});

test('synchronisation « depuis » : projet retiré, cartes effacées pour de bon, étiquette supprimée, projet dans la corbeille ; projets rallumés → tout recharger', () => {
  const state = sample('editor');
  state.cards.set('k2', { ...state.cards.get('k2'), labelIds: ['l1'] });
  const base = { serverTime: NOW, listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { notes: true, projects: true } };
  mergeSync(state, { ...base, projects: [{ ...state.projects.get('p1'), labels: [], cardIds: ['k1', 'k2'] }], projectIds: ['p1'], cards: [], projectMine: {} });
  assert.deepEqual([...state.cards.keys()].sort(), ['k1', 'k2'], 'k3 effacée pour de bon');
  assert.deepEqual(state.cards.get('k2').labelIds, [], 'étiquette supprimée retirée de la carte');
  mergeSync(state, { ...base, projects: [{ id: 'p1', name: 'DomoPi Articles', role: 'owner', deletedAt: NOW, cardCount: 2, memberCount: 2 }], projectIds: ['p1'], cards: [], projectMine: {} });
  assert.equal(state.cards.size, 0, 'dans la corbeille : aucune carte gardée');
  mergeSync(state, { ...base, projects: [], projectIds: [], cards: [], projectMine: {} });
  assert.equal(state.projects.size, 0);
  // Coupés puis rallumés sur un autre appareil : la prochaine synchronisation recharge tout
  mergeSync(state, { ...base, features: { notes: true, projects: false }, projects: [], projectIds: [], cards: [], projectMine: {} });
  assert.equal(state.projectsReload, false);
  mergeSync(state, { ...base, features: { notes: true, projects: true }, projects: [], projectIds: [], cards: [], projectMine: {} });
  assert.equal(state.projectsReload, true);
  loadSync(state, { ...base, projects: [], projectIds: [], cards: [], projectMine: {} });
  assert.equal(state.projectsReload, false);
  // Rallumés sur ce téléphone : de même
  applyOp(state, { id: uuid(), type: 'account.features', projects: false }, { user: ME, now: NOW });
  applyOp(state, { id: uuid(), type: 'account.features', projects: true }, { user: ME, now: NOW });
  assert.equal(state.projectsReload, true);
});

test('copie gardée sur le téléphone : relue à l\'identique ; copie d\'avant les projets : aucun projet', () => {
  const state = sample('owner');
  const snapshot = JSON.parse(JSON.stringify(toSnapshot(state, NOW)));
  const back = fromSnapshot(snapshot);
  assert.deepEqual([...back.projects.values()], [...state.projects.values()]);
  assert.deepEqual([...back.cards.values()], [...state.cards.values()]);
  assert.deepEqual(back.projectMine, state.projectMine);
  const { projects, projectIds, cards, projectMine, projectsReload, ...older } = snapshot;
  const old = fromSnapshot(older);
  assert.equal(old.projects.size, 0);
  assert.equal(old.cards.size, 0);
});

test('de bout en bout : opérations faites hors ligne sur le téléphone, puis envoyées ; la copie locale est celle que renvoie le serveur', async (t) => {
  const app = await startTestApp(t);
  await setupAdmin(app);
  await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  app.db.prepare("UPDATE users SET display_name = 'Léa', projects_enabled = 1 WHERE username = 'lea'").run();
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const user = { id: 2, displayName: 'Léa' };
  const state = emptyState();
  loadSync(state, (await lea.get('/api/sync')).body);
  // Hors ligne : chaque opération s'applique d'abord ici
  const projectId = uuid();
  const [c1, c2] = [uuid(), uuid()];
  const [a, b, c] = [uuid(), uuid(), uuid()];
  const labelId = uuid();
  const queue = [
    { type: 'project.create', projectId, name: 'Travaux', columns: [{ columnId: c1, name: 'À faire', color: 'gris' }, { columnId: c2, name: 'Fait', color: 'vert' }] },
    { type: 'label.create', projectId, labelId, name: 'Urgent', color: 'rouge' },
    { type: 'card.create', projectId, cardId: a, columnId: c1, title: 'Peinture' },
    { type: 'card.create', projectId, cardId: b, columnId: c1, title: 'Plinthes', labelIds: [labelId] },
    { type: 'card.create', projectId, cardId: c, columnId: c1, title: 'Prises', afterId: null },
    { type: 'card.move', cardId: a, columnId: c2 },
    { type: 'card.update', cardId: b, title: 'Plinthes du salon' },
    { type: 'card.duplicate', cardId: b, newCardId: uuid(), title: 'Plinthes du salon (copie)' },
    { type: 'column.update', projectId, columnId: c1, name: 'En cours', color: 'bleu' },
    { type: 'card.delete', cardId: c },
  ].map((op) => ({ id: uuid(), ...op }));
  for (const op of queue) applyOp(state, op, { user, now: NOW });
  // Retour du réseau : la file part, puis une deuxième fois (coupure pendant la réponse)
  const results = (await lea.post('/api/ops', { ops: queue })).body.results;
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results));
  assert.ok((await lea.post('/api/ops', { ops: queue })).body.results.every((r) => r.duplicate === true));
  const server = emptyState();
  loadSync(server, (await lea.get('/api/sync')).body);
  const shape = (s) => ({
    columns: s.projects.get(projectId).columns.map((col) => [col.id, col.name, col.color]),
    labels: s.projects.get(projectId).labels,
    live: [c1, c2].map((col) => columnCards(s, col).map((card) => [card.id, card.title, card.labelIds])),
    deleted: projectCards(s, projectId, { deleted: true }).map((card) => [card.id, card.deletedColumnName]),
  });
  assert.deepEqual(shape(state), shape(server));
  assert.equal(app.db.prepare('SELECT COUNT(*) FROM cards').pluck().get(), 4);
});
