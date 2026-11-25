// Projets : règles communes au téléphone et au serveur (public/js/projects.js,
// docs/cadrage-projets.md) : rôles et droits ligne par ligne (section 6),
// noms et titres, ordre (après une carte, en haut, en bas, renumérotation),
// limites, colonnes de départ dans les deux langues.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roleOfAccess, projectRights, cardRights, assignChangeAllowed, assignableRole, cleanName, cleanProjectName, cleanColumnName,
  cleanCardTitle, cleanProjectLabelName, nameTaken, placeFor, byPosition, afterIdForStep, daysLeft, cleanCardLabelIds,
  cleanAssigneeIds, DEFAULT_COLUMNS, COLUMN_COLORS, POSITION_STEP, PROJECTS_MAX, COLUMNS_MAX, CARDS_MAX, PROJECT_LABELS_MAX,
  PROJECT_MEMBERS_MAX, LABELS_PER_CARD_MAX, ASSIGNEES_MAX, PROJECT_TRASH_DAYS, CARD_EVENT_TYPES, PROJECT_ACCESS, ROLES,
} from '../public/js/projects.js';
import { LABEL_COLORS } from '../public/js/labels.js';
import { translate } from '../public/js/i18n.js';

test('rôles : trois droits en base, quatre rôles ; rien pour une autre valeur', () => {
  assert.deepEqual(PROJECT_ACCESS, ['modification', 'contribution', 'lecture']);
  assert.deepEqual(ROLES, ['owner', 'editor', 'contributor', 'reader']);
  assert.equal(roleOfAccess('modification'), 'editor');
  assert.equal(roleOfAccess('contribution'), 'contributor');
  assert.equal(roleOfAccess('lecture'), 'reader');
  for (const bad of [null, undefined, '', 'owner', 'toString', '__proto__']) assert.equal(roleOfAccess(bad), null, String(bad));
});

test('droits sur le projet : la matrice de la section 6, ligne par ligne', () => {
  // [droit, propriétaire, Peut modifier, Contributeur, Lecture seule]
  const rows = [
    ['view', true, true, true, true],
    ['rename', true, false, false, false],
    ['priority', true, false, false, false],
    ['share', true, false, false, false],
    ['trash', true, false, false, false],
    ['leave', false, true, true, true],
    ['duplicate', true, true, true, true],
    ['columns', true, true, false, false],
    ['labels', true, true, false, false],
    ['settings', true, true, false, false],
    ['createCards', true, true, true, false],
    ['comment', true, true, true, false],
    ['purgeCards', true, false, false, false],
    ['ownState', true, true, true, true],
  ];
  for (const [right, ...expected] of rows) {
    assert.deepEqual(ROLES.map((role) => projectRights(role)[right]), expected, right);
    // Non-membre (et Admin non membre) : rien
    for (const none of [null, undefined, 'admin', 'modification']) assert.equal(projectRights(none)[right], false, `${right} ${none}`);
  }
});

test('droits sur une carte : propriétaire, Peut modifier, Contributeur (sa carte, attribuée, autre), Lecture seule', () => {
  const me = 7;
  const mine = { createdBy: me, assigneeIds: [] };
  const assigned = { createdBy: 1, assigneeIds: [3, me] };
  const other = { createdBy: 1, assigneeIds: [3] };
  // Sur le téléphone, la carte dit createdByMe (jamais le numéro de qui l'a créée)
  const minePhone = { createdByMe: true, assigneeIds: [] };
  const keys = ['edit', 'move', 'assign', 'unassignSelf', 'remove', 'restore', 'duplicate', 'comment'];
  const all = Object.fromEntries(keys.map((key) => [key, true]));
  for (const role of ['owner', 'editor']) for (const card of [mine, assigned, other]) assert.deepEqual(cardRights(card, me, role), all);
  assert.deepEqual(cardRights(mine, me, 'contributor'), all);
  assert.deepEqual(cardRights(minePhone, me, 'contributor'), all);
  assert.deepEqual(cardRights(assigned, me, 'contributor'), { edit: true, move: true, assign: false, unassignSelf: true, remove: false, restore: false, duplicate: true, comment: true });
  assert.deepEqual(cardRights(other, me, 'contributor'), { edit: false, move: false, assign: false, unassignSelf: false, remove: false, restore: false, duplicate: true, comment: true });
  const none = Object.fromEntries(keys.map((key) => [key, false]));
  for (const card of [mine, assigned, other]) {
    assert.deepEqual(cardRights(card, me, 'reader'), none);
    assert.deepEqual(cardRights(card, me, null), none);
  }
  assert.deepEqual(cardRights(null, me, 'owner'), none);
  // Sans compte (me inconnu) : jamais « créée par lui » par hasard
  assert.equal(cardRights({ createdBy: undefined, assigneeIds: [] }, undefined, 'contributor').edit, false);
  assert.equal(cardRights({ createdBy: null, assigneeIds: [null] }, null, 'contributor').edit, false);
});

test('personnes d\'une carte : toute liste avec « assign » ; sinon seulement se retirer', () => {
  const me = 7;
  const full = cardRights({ createdBy: me }, me, 'contributor');
  const assigned = cardRights({ createdBy: 1, assigneeIds: [3, me] }, me, 'contributor');
  const other = cardRights({ createdBy: 1, assigneeIds: [3] }, me, 'contributor');
  assert.equal(assignChangeAllowed(full, [], [3, me], me), true);
  assert.equal(assignChangeAllowed(assigned, [3, me], [3], me), true, 'se retirer');
  assert.equal(assignChangeAllowed(assigned, [3, me], [me], me), false, 'retirer un autre');
  assert.equal(assignChangeAllowed(assigned, [3, me], [3, me, 4], me), false, 'ajouter un autre');
  assert.equal(assignChangeAllowed(assigned, [3, me], [], me), false, 'retirer tout le monde');
  assert.equal(assignChangeAllowed(other, [3], [3, me], me), false, "s'attribuer une carte qu'il n'a pas créée");
  assert.equal(assignChangeAllowed(cardRights({}, me, 'reader'), [me], [], me), false);
  assert.deepEqual(['owner', 'editor', 'contributor', 'reader', null].map(assignableRole), [true, true, true, false, false]);
});

test('noms et titres : une ligne, longueurs, caractères de contrôle et invisibles refusés', () => {
  assert.equal(cleanName('  Domo\n Pi\tArticles  ', 80), 'Domo Pi Articles');
  assert.equal(cleanName('', 80), null);
  assert.equal(cleanName('   ', 80), null);
  assert.equal(cleanName(42, 80), null);
  assert.equal(cleanName('a\u0007b', 80), null, 'contrôle');
  assert.equal(cleanName('a‮b', 80), null, 'retournement de texte');
  assert.equal(cleanName('a​b', 80), null, 'espace invisible');
  assert.equal(cleanName('👩‍💻 Code', 80), '👩‍💻 Code', 'liant des emojis permis');
  assert.equal(cleanProjectName('x'.repeat(80)), 'x'.repeat(80));
  assert.equal(cleanProjectName('x'.repeat(81)), null);
  assert.equal(cleanColumnName('x'.repeat(41)), null);
  assert.equal(cleanCardTitle('x'.repeat(200)), 'x'.repeat(200));
  assert.equal(cleanCardTitle('x'.repeat(201)), null);
  assert.equal(cleanProjectLabelName('x'.repeat(31)), null);
  assert.equal(cleanProjectLabelName('́'), null, 'accent seul');
  // Même nom dans le projet : majuscules et accents ignorés
  const rows = [{ id: 'a', name: 'Été' }, { id: 'b', name: 'Relecture' }];
  assert.equal(nameTaken(rows, 'ete'), true);
  assert.equal(nameTaken(rows, ' RELECTURE '), true);
  assert.equal(nameTaken(rows, 'ete', 'a'), false, 'renommer la même');
  assert.equal(nameTaken(rows, 'Publiés'), false);
});

test('listes d\'étiquettes et de personnes : sans doublon, plafonds', () => {
  const id = '6f1c0c3e-8a3b-4c3e-9a1b-0a1b2c3d4e5f';
  assert.deepEqual(cleanCardLabelIds([id, id.toUpperCase()]), [id]);
  assert.equal(cleanCardLabelIds(['x']), null);
  assert.equal(cleanCardLabelIds(null), null);
  assert.equal(cleanCardLabelIds(Array.from({ length: 11 }, (_, i) => `6f1c0c3e-8a3b-4c3e-9a1b-0a1b2c3d4e${String(i).padStart(2, '0')}`)), null);
  assert.deepEqual(cleanAssigneeIds([3, 3, 4]), [3, 4]);
  assert.equal(cleanAssigneeIds([0]), null);
  assert.equal(cleanAssigneeIds(['3']), null);
  assert.equal(cleanAssigneeIds(Array.from({ length: 11 }, (_, i) => i + 1)), null);
});

test('ordre : en bas, en haut, après une carte, voisine inconnue, déjà en place, renumérotation', () => {
  const rows = [{ id: 'a', position: 1024 }, { id: 'b', position: 2048 }, { id: 'c', position: 3072 }];
  assert.deepEqual(placeFor([], 'x', undefined), { position: POSITION_STEP, renumber: null, unchanged: false });
  assert.equal(placeFor(rows, 'x', undefined).position, 4096, 'en bas');
  assert.equal(placeFor(rows, 'x', null).position, 0, 'en haut');
  assert.equal(placeFor(rows, 'x', 'a').position, 1536, 'entre a et b');
  assert.equal(placeFor(rows, 'x', 'inconnue').position, 4096, 'voisine absente : en bas');
  assert.equal(placeFor(rows, 'c', 'a').position, 1536, 'c après a');
  assert.deepEqual(placeFor(rows, 'b', 'a'), { position: 2048, renumber: null, unchanged: true });
  assert.deepEqual(placeFor(rows, 'a', null), { position: 1024, renumber: null, unchanged: true });
  assert.equal(placeFor(rows, 'c', undefined).unchanged, true);
  assert.equal(placeFor(rows, 'a', undefined).position, 4096, 'a en bas');
  // Trop serré : toute la série est renumérotée, dans le nouvel ordre
  const tight = [{ id: 'a', position: 1 }, { id: 'b', position: 1 + 1e-7 }, { id: 'c', position: 5 }];
  const place = placeFor(tight, 'x', 'a');
  assert.equal(place.position, 2048);
  assert.deepEqual(place.renumber, [{ id: 'a', position: 1024 }, { id: 'b', position: 3072 }, { id: 'c', position: 4096 }]);
  // Rangement stable à égalité
  assert.deepEqual(byPosition([{ id: 'b', position: 1 }, { id: 'a', position: 1 }]).map((r) => r.id), ['a', 'b']);
  // Monter et descendre
  assert.equal(afterIdForStep(rows, 'c', 'up'), 'a');
  assert.equal(afterIdForStep(rows, 'b', 'up'), null);
  assert.equal(afterIdForStep(rows, 'a', 'up'), undefined);
  assert.equal(afterIdForStep(rows, 'a', 'down'), 'b');
  assert.equal(afterIdForStep(rows, 'c', 'down'), undefined);
  // Monter puis descendre ramène à la même place
  const up = placeFor(rows, 'c', afterIdForStep(rows, 'c', 'up'));
  const moved = rows.map((row) => (row.id === 'c' ? { ...row, position: up.position } : row));
  assert.deepEqual(byPosition(moved).map((r) => r.id), ['a', 'c', 'b']);
});

test('limites validées, colonnes de départ dans les deux langues, couleurs des étiquettes, historique', () => {
  assert.deepEqual([PROJECTS_MAX, COLUMNS_MAX, CARDS_MAX, PROJECT_LABELS_MAX, PROJECT_MEMBERS_MAX, LABELS_PER_CARD_MAX, ASSIGNEES_MAX, PROJECT_TRASH_DAYS], [100, 20, 2000, 50, 50, 10, 10, 30]);
  assert.deepEqual(COLUMN_COLORS, LABEL_COLORS);
  assert.deepEqual(DEFAULT_COLUMNS.map((c) => translate('fr', c.text)), ['À faire', 'En cours', 'Fait']);
  assert.deepEqual(DEFAULT_COLUMNS.map((c) => translate('en', c.text)), ['To do', 'In progress', 'Done']);
  for (const column of DEFAULT_COLUMNS) assert.ok(COLUMN_COLORS.includes(column.color));
  assert.equal(CARD_EVENT_TYPES.length, 18);
  const deleted = '2026-11-01T12:00:00.000Z';
  assert.equal(daysLeft(deleted, Date.parse('2026-11-01T12:00:00.000Z')), 30);
  assert.equal(daysLeft(deleted, Date.parse('2026-11-26T12:00:00.000Z')), 5);
  assert.equal(daysLeft(deleted, Date.parse('2026-12-25T12:00:00.000Z')), 0);
});
