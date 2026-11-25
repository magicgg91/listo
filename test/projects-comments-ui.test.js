// Projets, étape 3 : commentaires, historique, cartes suivies, Nouveautés
// et page Notifications, côté téléphone (docs/cadrage-projets.md, sections
// 4.3, 4.4, 5.6, 5.7, 9 et 11). Copie locale (mêmes effets que le serveur
// pour chaque opération ajoutée, selon le rôle), règle « je suis cette
// carte », lignes de la page Notifications des projets (projets coupés :
// seule la ligne « Partage »), et vérifications par lecture du code
// (jamais de HTML, liens rel="noopener noreferrer", onglets accessibles,
// aucun curseur mis tout seul, fichiers gardés hors ligne, kit identique).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { emptyState, loadSync, applyOp, toSnapshot, fromSnapshot, inboxShownRows, inboxTargetAvailable, inboxRowsFor } from '../public/js/store.js';
import { cardCommentsOf, followingCard } from '../public/js/project-store.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
const NOW = '2026-11-25T09:30:00.000Z';

// Copie locale d'exemple : Guillaume (1) a le rôle donné ; carte « a » à
// Léa, « b » créée par Guillaume ; un commentaire de Léa sur « a »
function sample(role = 'editor', { projects = true } = {}) {
  const state = emptyState();
  const card = (id, extra = {}) => ({
    id, projectId: 'p1', columnId: 'c1', position: 1024, title: id, labelIds: [], assigneeIds: [], createdByMe: false, createdByName: 'Léa',
    createdAt: NOW, updatedAt: NOW, updatedByName: null, deletedAt: null, deletedByName: null, deletedColumnName: null,
    description: '', descriptionVersion: 1, priority: 'normal', dueDate: null, dueTime: null, remindBefore: null, done: false, doneAt: null, links: [], ...extra,
  });
  loadSync(state, {
    serverTime: NOW, listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { notes: true, projects },
    projects: [{
      id: 'p1', name: 'DomoPi Articles', role, priorityEnabled: false, createdAt: NOW, updatedAt: NOW, deletedAt: null,
      members: [{ id: 2, displayName: 'Léa', active: true, role: 'owner' }, { id: 1, displayName: 'Guillaume', active: true, role }],
      columns: [{ id: 'c1', name: 'Relecture', color: 'bleu', position: 1024 }], labels: [], cardIds: ['a', 'b'],
    }],
    projectIds: ['p1'],
    cards: [card('a'), card('b', { createdByMe: true, position: 2048 })],
    comments: [{ id: 'm1', cardId: 'a', projectId: 'p1', byMe: false, authorName: 'Léa', text: 'Relu', importedAuthor: null, importedAt: null, importedByName: null, createdAt: NOW, updatedAt: NOW, edited: false, deletedAt: null }],
    cardFollows: [],
    projectMine: { p1: { mutedNews: false, mutedPush: false, inDeadlines: false, lastEvent: 9, unread: true, newCards: ['a'] } },
  });
  return state;
}
const ME = { id: 1, displayName: 'Guillaume' };
const apply = (state, op, user = ME) => applyOp(state, { id: uuid(), ...op }, { user, now: NOW });

test('copie locale : commentaires selon le rôle (Lecture seule : rien), modifier le sien, supprimer (le sien ; propriétaire : aussi celui des autres), gardés dans la copie enregistrée', () => {
  for (const [role, written] of [['owner', true], ['editor', true], ['contributor', true], ['reader', false]]) {
    const state = sample(role);
    apply(state, { type: 'comment.create', cardId: 'a', commentId: 'm2', text: '  Merci !  ' });
    assert.equal(cardCommentsOf(state, 'a').length, written ? 2 : 1, role);
    if (written) assert.deepEqual([state.cardComments.get('m2').text, state.cardComments.get('m2').byMe], ['Merci !', true]);
  }
  const state = sample('editor');
  apply(state, { type: 'comment.update', cardId: 'a', commentId: 'm1', text: 'Changé' });
  assert.equal(state.cardComments.get('m1').text, 'Relu', 'jamais celui d\'un autre');
  apply(state, { type: 'comment.delete', cardId: 'a', commentId: 'm1' });
  assert.equal(cardCommentsOf(state, 'a').length, 1, '« Peut modifier » ne supprime pas celui d\'un autre');
  apply(state, { type: 'comment.create', cardId: 'a', commentId: 'm3', text: 'À moi' });
  apply(state, { type: 'comment.update', cardId: 'a', commentId: 'm3', text: 'À moi, corrigé' });
  assert.deepEqual([state.cardComments.get('m3').text, state.cardComments.get('m3').edited], ['À moi, corrigé', true]);
  apply(state, { type: 'comment.create', cardId: 'a', commentId: 'm4', text: '' });
  assert.equal(state.cardComments.has('m4'), false, 'texte vide : rien');
  const owner = sample('owner');
  apply(owner, { type: 'comment.delete', cardId: 'a', commentId: 'm1' });
  assert.deepEqual([owner.cardComments.get('m1').text, Boolean(owner.cardComments.get('m1').deletedAt)], ['', true], 'modération : texte effacé');
  assert.equal(cardCommentsOf(owner, 'a').length, 0);
  const again = fromSnapshot(toSnapshot(state));
  assert.deepEqual([...again.cardComments.keys()].sort(), ['m1', 'm3']);
});

test('suivre : créée, attribuée ou commentée ; « Ne plus suivre » gardé ; mon choix seulement, remplacé à chaque synchronisation', () => {
  const state = sample('editor');
  assert.equal(followingCard(state, state.cards.get('b'), 1), true, 'créée par moi');
  assert.equal(followingCard(state, state.cards.get('a'), 1), false);
  apply(state, { type: 'comment.create', cardId: 'a', commentId: 'm9', text: 'Vu' });
  assert.equal(followingCard(state, state.cards.get('a'), 1), true, 'commentée');
  apply(state, { type: 'card.follow', cardId: 'a', following: false });
  assert.equal(followingCard(state, state.cards.get('a'), 1), false, '« Ne plus suivre » l\'emporte');
  apply(state, { type: 'card.follow', cardId: 'b', following: false });
  apply(state, { type: 'card.assign', cardId: 'b', userIds: [1] });
  assert.equal(followingCard(state, state.cards.get('b'), 1), false, 'même attribuée ensuite');
  const reader = sample('reader');
  apply(reader, { type: 'card.follow', cardId: 'a', following: true });
  assert.equal(followingCard(reader, reader.cards.get('a'), 1), true, 'Lecture seule peut suivre');
});

test('nouveautés : « vu » efface les points des cartes ; carte et commentaires partent avec leur projet', () => {
  const state = sample('editor');
  assert.deepEqual(state.projectMine.p1.newCards, ['a']);
  apply(state, { type: 'project.seen', projectId: 'p1', upTo: 9 });
  assert.deepEqual([state.projectMine.p1.unread, state.projectMine.p1.newCards], [false, []]);
  loadSync(state, { serverTime: NOW, listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { notes: true, projects: true }, projects: [], projectIds: [], cards: [], comments: [], cardFollows: [], projectMine: {} });
  assert.equal(state.cardComments.size, 0);
});

test('page Notifications : cibles projet et carte ; projets coupés : seule la ligne « Partage » reste ; ouvrir un projet ou une carte rend leurs lignes lues', () => {
  const rows = [
    { id: 1, kind: 'changes', targetType: 'project', target: { type: 'project', projectId: 'p1' }, read: false },
    { id: 2, kind: 'comment', targetType: 'card', target: { type: 'card', projectId: 'p1', cardId: 'a' }, read: false },
    { id: 3, kind: 'sharing', targetType: 'project', target: { type: 'features' }, read: false },
    { id: 4, kind: 'changes', targetType: 'note', target: { type: 'note', noteId: 'n' }, read: false },
  ];
  const on = sample('editor');
  on.inbox = { rows, stamp: 'x', loaded: true };
  assert.deepEqual(inboxShownRows(on).map((r) => r.id), [1, 2, 3, 4]);
  assert.equal(inboxTargetAvailable(on, rows[0].target), true);
  assert.equal(inboxTargetAvailable(on, rows[1].target), true);
  assert.equal(inboxTargetAvailable(on, { type: 'card', projectId: 'p1', cardId: 'zz' }), false);
  assert.equal(inboxTargetAvailable(on, { type: 'features' }), true);
  assert.deepEqual(inboxRowsFor(on, { projectId: 'p1' }), [1]);
  assert.deepEqual(inboxRowsFor(on, { cardId: 'a' }), [2]);
  const off = sample('editor', { projects: false });
  off.inbox = { rows, stamp: 'x', loaded: true };
  assert.deepEqual(inboxShownRows(off).map((r) => r.id), [3, 4], 'projets coupés : la ligne « Partage » reste (invitation à les allumer)');
});

test('code : textes posés sans HTML, liens des commentaires rel="noopener noreferrer", onglets accessibles, aucun curseur mis tout seul, fichier gardé hors ligne, kit identique', () => {
  const activity = code('public/js/screens/card-activity.js');
  assert.doesNotMatch(activity, /innerHTML|outerHTML|insertAdjacentHTML|\.style\./);
  assert.match(activity, /rel: 'noopener noreferrer'/);
  assert.match(activity, /target: '_blank'/);
  assert.match(activity, /cleanLinkUrl\(raw\)/, 'adresse revérifiée avant d\'en faire un lien');
  assert.match(activity, /role: 'tablist'/);
  assert.match(activity, /role: 'tab'/);
  assert.match(activity, /role: 'tabpanel'/);
  assert.match(activity, /'aria-selected'/);
  assert.doesNotMatch(activity, /\.focus\(\)\s*;?\s*\n\s*input|setSelectionRange|autofocus/);
  assert.match(read('public/sw.js'), /'\/js\/screens\/card-activity\.js'/);
  const section = (file) => {
    const text = read(file);
    const start = text.indexOf('/* 16.47');
    return text.slice(start, text.indexOf('.tile__head .tile__dot', start));
  };
  assert.ok(section('public/css/listo.css').length > 500);
  assert.equal(section('public/css/listo.css'), section('design/listo.css'));
  // Page Notifications : icône des commentaires, cibles ouvertes
  const inbox = code('public/js/screens/inbox.js');
  for (const target of ["case 'project'", "case 'card'", "case 'features'", "comment: 'comment'"]) assert.ok(inbox.includes(target), target);
});

test('historique : une phrase pour chaque type de la liste fermée (français et anglais), jamais un nom de texte calculé', async () => {
  const { CARD_EVENT_TYPES } = await import('../public/js/projects.js');
  const activity = read('public/js/screens/card-activity.js');
  for (const type of CARD_EVENT_TYPES) assert.ok(activity.includes(`case '${type}'`), type);
  const fr = (await import('../public/js/i18n/fr/projets.js')).default;
  const en = (await import('../public/js/i18n/en/projets.js')).default;
  for (const key of Object.keys(fr).filter((k) => k.startsWith('projets.historique') || k.startsWith('projets.commentaire'))) assert.ok(key in en, key);
});
