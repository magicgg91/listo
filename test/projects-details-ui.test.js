// Projets, étape 2 : détails de la carte, côté téléphone (docs/cadrage-projets.md,
// sections 3.3, 4.2 à 4.4, 5 et 11.3). Règles pures (cases de la
// description, échéance, « mes cartes », filtres par personne, repères de
// la face), copie locale (mêmes effets que le serveur pour chaque
// opération ajoutée, deux cases cochées en même temps, « À vérifier »
// gardé), et vérifications par lecture du code (jamais de HTML, liens
// rel="noopener noreferrer", accessibilité, curseur seulement après un
// geste fait pour écrire, fichiers gardés hors ligne).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { taskLines, taskCount, setTaskAt } from '../public/js/note-format.js';
import { cleanCardDue, cleanLinkUrl, cleanLinkTitle, cleanDescription, cardDone } from '../public/js/projects.js';
import {
  cardMatches, cleanFilter, cardShown, visibleCards, cardDueState, cardMarkers, myCards, myCardCounts, urgentCards, NO_ONE,
} from '../public/js/project-view.js';
import { emptyState, loadSync, applyOp, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { translate } from '../public/js/i18n.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
const NOW = '2026-11-23T09:30:00.000Z';
const TODAY = '2026-11-23';

// --- Une copie locale d'exemple : Guillaume (1) est « Peut modifier » ---
function sample(role = 'editor', { priority = false } = {}) {
  const state = emptyState();
  const card = (id, extra = {}) => ({
    id, projectId: 'p1', columnId: 'c1', position: 1024, title: id, labelIds: [], assigneeIds: [], createdByMe: false, createdByName: 'Léa',
    createdAt: NOW, updatedAt: NOW, updatedByName: null, deletedAt: null, deletedByName: null, deletedColumnName: null,
    description: '', descriptionVersion: 1, descriptionByMe: false, descriptionByName: null, descriptionAt: null,
    priority: 'normal', dueDate: null, dueTime: null, remindBefore: null, done: false, doneAt: null, links: [], ...extra,
  });
  loadSync(state, {
    serverTime: NOW, listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { notes: true, projects: true },
    projects: [{
      id: 'p1', name: 'DomoPi Articles', role, priorityEnabled: priority, createdAt: NOW, updatedAt: NOW, deletedAt: null,
      members: [{ id: 2, displayName: 'Léa', active: true, role: 'owner' }, { id: 1, displayName: 'Guillaume', active: true, role }, { id: 3, displayName: 'Hugo', active: true, role: 'contributor' }, { id: 4, displayName: 'Marc', active: true, role: 'reader' }],
      columns: [{ id: 'c1', name: 'Relecture', color: 'bleu', position: 1024 }],
      labels: [{ id: 'l1', name: 'Sécurité', color: 'gris' }],
      cardIds: ['a', 'b', 'c', 'd'],
    }],
    projectIds: ['p1'],
    cards: [
      card('a', { assigneeIds: [1], dueDate: '2026-11-20', description: 'Texte\n- [x] Un\n- [ ] Deux', links: [{ id: 'k1', title: 'Dépôt GitHub', url: 'https://github.com/Bubka/2FAuth' }] }),
      card('b', { assigneeIds: [1, 3], dueDate: '2026-11-28', dueTime: '18:00', position: 2048, labelIds: ['l1'] }),
      card('c', { assigneeIds: [1], dueDate: '2026-11-10', done: true, position: 3072 }),
      card('d', { position: 4096, updatedAt: '2026-11-23T10:00:00.000Z' }),
    ],
    projectMine: {},
  });
  return state;
}
const ME = { id: 1, displayName: 'Guillaume' };
const apply = (state, op, user = ME) => applyOp(state, { id: uuid(), ...op }, { user, now: NOW });

// --- Règles pures ---

test('cases de la description : liste, « x/y », cocher une seule case par son numéro et son texte (retrouvée si une ligne est ajoutée au-dessus)', () => {
  const text = 'Intro **gras**\n- [x] Refaire les **captures**\n- [ ] Vérifier\ntexte\n- [ ] Relire';
  assert.deepEqual(taskLines(text).map((t) => [t.index, t.text, t.checked]), [[0, 'Refaire les captures', true], [1, 'Vérifier', false], [2, 'Relire', false]]);
  assert.deepEqual(taskCount(text), { done: 1, total: 3 });
  assert.deepEqual(taskCount('rien'), { done: 0, total: 0 });
  const one = setTaskAt(text, 1, 'Vérifier', true);
  assert.equal(one, text.replace('- [ ] Vérifier', '- [x] Vérifier'));
  // Deux cases cochées l'une après l'autre sur le même texte de départ : les deux restent
  assert.deepEqual(taskCount(setTaskAt(one, 2, 'Relire', true)), { done: 3, total: 3 });
  assert.equal(setTaskAt(text, 0, 'Refaire les captures', true), text, 'déjà cochée : rien ne change');
  assert.equal(setTaskAt(`- [ ] Nouvelle\n${text}`, 1, 'Vérifier', true).includes('- [x] Vérifier'), true, 'retrouvée par son texte');
  assert.equal(setTaskAt(text, 5, 'Inconnue', true), null, 'disparue : rien n\'est écrasé');
  assert.equal(setTaskAt('- [ ] A\n- [ ] A', 3, 'A', true), null, 'deux cases du même texte : jamais au hasard');
});

test('échéance, liens, description : règles partagées avec le serveur', () => {
  assert.deepEqual(cleanCardDue({ date: '2026-11-28' }), { date: '2026-11-28', time: null, remindBefore: null });
  assert.equal(cleanCardDue(null), null);
  for (const bad of [{ date: '2026-13-01' }, { date: '2026-11-28', time: '7:45' }, { date: '2026-11-28', remindBefore: 0 }, { date: '2026-11-28', time: '07:45', remindBefore: 5 }, 'x']) {
    assert.equal(cleanCardDue(bad), undefined, JSON.stringify(bad));
  }
  assert.equal(cleanLinkUrl(' https://docs.ntfy.sh '), 'https://docs.ntfy.sh/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///x', '//x.example', 'https://x.example/a\u0000b', 'mailto:a@b.fr']) assert.equal(cleanLinkUrl(bad), null, bad);
  assert.equal(cleanLinkTitle(''), '');
  assert.equal(cleanLinkTitle('a'.repeat(101)), null);
  assert.equal(cleanDescription('x'.repeat(20001)), null);
  assert.equal(cardDone({ dueDate: null, done: true }), false, 'sans échéance, jamais faite');
  assert.equal(cardDone({ dueDate: '2026-11-10', done: true }), true);
});

test('repères de la face : échéance (faite, en retard, aujourd\'hui), « x/y », description, liens ; « Fait » seule marque de fait', () => {
  const state = sample();
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => state.cards.get(id));
  assert.equal(cardDueState(a, TODAY, '10:30'), 'late');
  assert.equal(cardDueState(b, TODAY, '10:30'), 'later');
  assert.equal(cardDueState({ ...b, dueDate: TODAY }, TODAY, '10:30'), 'today');
  assert.equal(cardDueState({ ...b, dueDate: TODAY, dueTime: '09:00' }, TODAY, '10:30'), 'late', 'heure passée : en retard');
  assert.equal(cardDueState(c, TODAY, '10:30'), 'done', 'faite : jamais en retard');
  assert.equal(cardDueState(d, TODAY, '10:30'), null);
  assert.deepEqual(cardMarkers(a), { described: false, tasks: { done: 1, total: 2 }, links: 1 });
  assert.deepEqual(cardMarkers({ description: 'Texte seul', links: [] }), { described: true, tasks: null, links: 0 });
});

test('« mes cartes » : attribuées à moi, pas faites, projets visibles ; « pour vous » et « en retard » ; les plus urgentes d\'abord', () => {
  const state = sample();
  assert.deepEqual(myCards(state, 1).map((card) => card.id).sort(), ['a', 'b']);
  assert.deepEqual(myCardCounts(state, 1, 'p1', TODAY, '10:30'), { count: 2, late: 1 });
  assert.deepEqual(myCards(state, 3).map((card) => card.id), ['b']);
  assert.deepEqual(urgentCards(state, 1, TODAY, '10:30').map((card) => card.id), ['a', 'b']);
  // Une carte sans échéance après celles qui en ont une
  apply(state, { type: 'card.assign', cardId: 'd', userIds: [1] });
  assert.deepEqual(urgentCards(state, 1, TODAY, '10:30').map((card) => card.id), ['a', 'b', 'd']);
  assert.deepEqual(urgentCards(state, 1, TODAY, '10:30', 1).map((card) => card.id), ['a']);
  // Projet dans la corbeille : plus rien
  state.projects.set('p1', { ...state.projects.get('p1'), deletedAt: NOW });
  assert.deepEqual(myCards(state, 1), []);
});

test('filtres : personnes (moi, un membre, « Personne ») ET étiquettes ; personnes et étiquettes inconnues ignorées ; recherche dans la description et les titres des liens', () => {
  const state = sample();
  const project = state.projects.get('p1');
  const ids = (filter) => visibleCards(state, project, 'c1', { filter }).map((card) => card.id);
  assert.deepEqual(ids({ people: [], labels: [] }), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ people: [3], labels: [] }), ['b']);
  assert.deepEqual(ids({ people: [NO_ONE], labels: [] }), ['d']);
  assert.deepEqual(ids({ people: [3, NO_ONE], labels: [] }), ['b', 'd']);
  assert.deepEqual(ids({ people: [1], labels: ['l1'] }), ['b'], 'une des personnes ET une des étiquettes');
  assert.deepEqual(cleanFilter(project, { people: [1, 99, NO_ONE, 'x'], labels: ['l1', 'l9'] }), { people: [1, NO_ONE], labels: ['l1'] });
  assert.deepEqual(cleanFilter(project, ['l1']), { people: [], labels: ['l1'] }, 'filtre de l\'étape 1 relu');
  assert.equal(cardShown(state.cards.get('a'), ['l1']), false);
  assert.equal(cardMatches(state.cards.get('a'), project, 'deux'), true, 'texte d\'une case');
  assert.equal(cardMatches(state.cards.get('a'), project, 'github'), true, 'titre d\'un lien');
  assert.equal(cardMatches(state.cards.get('a'), project, '**'), false, 'jamais les marques');
});

// --- Copie locale : mêmes effets que le serveur ---

test('copie locale : échéance, « Fait », priorité (option), liens, description (version), case, personnes ; rien de ce que mon rôle ne permet pas', () => {
  const state = sample();
  apply(state, { type: 'card.update', cardId: 'd', due: { date: '2026-11-30', time: '09:00', remindBefore: 15 } });
  assert.deepEqual(['dueDate', 'dueTime', 'remindBefore'].map((k) => state.cards.get('d')[k]), ['2026-11-30', '09:00', 15]);
  apply(state, { type: 'card.done', cardId: 'd', done: true });
  assert.equal(state.cards.get('d').done, true);
  apply(state, { type: 'card.update', cardId: 'd', due: null });
  assert.deepEqual([state.cards.get('d').dueDate, state.cards.get('d').done], [null, false], 'sans échéance, plus de « Fait »');
  apply(state, { type: 'card.done', cardId: 'd', done: true });
  assert.equal(state.cards.get('d').done, false, '« Fait » demande une échéance');
  apply(state, { type: 'card.update', cardId: 'd', priority: 'high' });
  assert.equal(state.cards.get('d').priority, 'normal', 'option « Priorité » coupée');
  apply(state, { type: 'link.create', cardId: 'd', linkId: 'k9', url: 'javascript:alert(1)' });
  assert.deepEqual(state.cards.get('d').links, []);
  apply(state, { type: 'link.create', cardId: 'd', linkId: 'k9', title: 'Doc', url: 'https://docs.ntfy.sh' });
  apply(state, { type: 'link.update', cardId: 'd', linkId: 'k9', title: 'Documentation' });
  assert.deepEqual(state.cards.get('d').links, [{ id: 'k9', title: 'Documentation', url: 'https://docs.ntfy.sh/' }]);
  apply(state, { type: 'link.delete', cardId: 'd', linkId: 'k9' });
  assert.deepEqual(state.cards.get('d').links, []);
  apply(state, { type: 'card.describe', cardId: 'd', description: 'Nouveau', baseVersion: 1 });
  assert.deepEqual([state.cards.get('d').description, state.cards.get('d').descriptionVersion], ['Nouveau', 2]);
  apply(state, { type: 'card.describe', cardId: 'd', description: 'Écrasé ?', baseVersion: 1 });
  assert.equal(state.cards.get('d').description, 'Nouveau', 'version dépassée : rien n\'est écrasé');
  // Deux cases cochées en même temps (opérations en file) : les deux restent
  apply(state, { type: 'card.task', cardId: 'a', index: 1, text: 'Deux', checked: true });
  apply(state, { type: 'card.task', cardId: 'a', index: 0, text: 'Un', checked: false });
  assert.equal(state.cards.get('a').description, 'Texte\n- [ ] Un\n- [x] Deux');
  // Lecture seule : rien ne change
  const reader = sample('reader');
  for (const op of [
    { type: 'card.update', cardId: 'b', due: null }, { type: 'card.done', cardId: 'b', done: true }, { type: 'card.task', cardId: 'a', index: 1, text: 'Deux', checked: true },
    { type: 'link.delete', cardId: 'a', linkId: 'k1' }, { type: 'card.describe', cardId: 'a', description: 'x', baseVersion: 1 },
  ]) apply(reader, op);
  assert.deepEqual(reader.cards.get('a'), sample('reader').cards.get('a'));
  assert.equal(reader.cards.get('b').dueDate, '2026-11-28');
});

test('copie locale : Contributeur sur la carte d\'un autre attribuée à lui (modifier, se retirer) ou non (rien) ; priorité avec l\'option allumée ; copie d\'une carte', () => {
  const state = sample('contributor', { priority: true });
  apply(state, { type: 'card.update', cardId: 'b', priority: 'high' });
  assert.equal(state.cards.get('b').priority, 'high');
  apply(state, { type: 'card.update', cardId: 'd', due: { date: '2026-12-01' } });
  assert.equal(state.cards.get('d').dueDate, null, 'pas attribuée à lui, pas créée par lui');
  apply(state, { type: 'card.assign', cardId: 'b', userIds: [1, 3, 2] });
  assert.deepEqual(state.cards.get('b').assigneeIds, [1, 3], 'jamais attribuer quelqu\'un');
  apply(state, { type: 'card.assign', cardId: 'b', userIds: [3] });
  assert.deepEqual(state.cards.get('b').assigneeIds, [3], 'se retirer');
  apply(state, { type: 'card.done', cardId: 'b', done: true });
  assert.equal(state.cards.get('b').done, false, 'retiré : plus le droit de modifier');
  apply(state, { type: 'card.duplicate', cardId: 'a', newCardId: 'a2', title: 'a (copie)', linkIds: { k1: 'k2' } });
  const copy = state.cards.get('a2');
  assert.deepEqual([copy.createdByMe, copy.done, copy.descriptionVersion, copy.links.map((l) => l.id)], [true, false, 1, ['k2']]);
});

test('description « À vérifier » : gardée sur le téléphone, jamais effacée par une synchronisation complète', () => {
  const state = sample();
  state.cardConflicts.set('a', { description: 'mon texte', at: NOW });
  const again = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state))));
  assert.equal(again.cardConflicts.get('a').description, 'mon texte');
  loadSync(again, { serverTime: NOW, listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], features: { notes: true, projects: true }, projects: [], projectIds: [], cards: [], projectMine: {} });
  assert.equal(again.cardConflicts.get('a').description, 'mon texte');
});

// --- Vérifications par lecture du code ---

test('écrans de la carte : jamais de HTML ; liens ouverts dans un nouvel onglet avec rel="noopener noreferrer", adresse revérifiée ; nombres et repères lus', () => {
  for (const file of ['public/js/screens/project-card.js', 'public/js/screens/card-description.js', 'public/js/screens/project.js', 'public/js/screens/home.js']) {
    const source = code(file);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(source), file);
  }
  const card = code('public/js/screens/project-card.js');
  assert.match(card, /const url = cleanLinkUrl\(link\.url\);/);
  assert.match(card, /url \? h\('a', \{ class: 'klink__title', href: url, target: '_blank', rel: 'noopener noreferrer' \}, shown\)/);
  // « Fait » : une case (role="checkbox", aria-checked) ; sans droit, désactivée et annoncée
  assert.match(card, /h\('button', \{ class: 'kdone', type: 'button', role: 'checkbox', 'aria-checked': String\(done\)/);
  assert.match(card, /h\('span', \{ class: 'kdone', role: 'checkbox', 'aria-checked': String\(done\), 'aria-disabled': 'true' \}/);
  // Priorité : un choix en relief (radiogroup)
  assert.match(card, /class: 'segmented kprio', role: 'radiogroup'/);
  // Contributeur sur la carte d'un autre : seulement « Me retirer », avec confirmation
  assert.match(card, /!can\.assign && can\.unassignSelf && mine \? h\('button', \{ class: 'kadd', type: 'button', onClick: \(\) => unassignMe\(card\) \}/);
  // Description : une case se coche par card.task (son numéro et son texte), sans passer en saisie
  const desc = code('public/js/screens/card-description.js');
  assert.match(desc, /projectActions\.tickCardTask\(cardId, \{ index: task\.index, text: task\.text, checked: !task\.checked \}\);/);
  assert.match(desc, /renderNoteText\(text, \{ h, icon, editable: can && !kept\(\) \}\)/);
  assert.match(desc, /count\.setAttribute\('aria-label', t\('projets\.cases\.lu'/);
  assert.equal(translate('fr', 'projets.cases.lu', { done: 2, count: 3 }), '2 cases cochées sur 3');
  assert.equal(translate('en', 'projets.cases.lu', { done: 1, count: 1 }), '1 of 1 box checked');
  // Curseur : seulement après un appui sur le texte ou « + Ajouter une description », jamais à l'ouverture
  assert.ok(!/queueMicrotask\(\(\) => edit/.test(desc));
  assert.match(desc, /const add = h\('button', \{ class: 'klink klink--add', type: 'button', onClick: \(\) => edit\(0\) \}/);
});

test('fichiers gardés hors ligne, kit identique dans les deux feuilles de style, textes en français et en anglais', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /'\/js\/screens\/card-description\.js',/);
  const kit = (file) => read(file).split('/* 16.46')[1]?.split('/* ----------')[0];
  assert.ok(kit('design/listo.css'));
  assert.equal(kit('design/listo.css').trim(), kit('public/css/listo.css').trim());
  for (const key of ['projets.echeance.faitLe', 'projets.pourVous', 'projets.filtre.personne', 'projets.conflit.deux.texte', 'accueil.projets.aucuneCarte']) {
    assert.notEqual(translate('fr', key, { count: 2, when: 'x' }), key, key);
    assert.notEqual(translate('en', key, { count: 2, when: 'x' }), translate('fr', key, { count: 2, when: 'x' }), key);
  }
  assert.equal(translate('fr', 'projets.pourVous', { count: 1 }), '1 carte pour vous');
  assert.equal(translate('en', 'projets.pourVous', { count: 2 }), '2 cards for you');
});
