// Tuile « Projets » de l'Accueil au choix (décision du propriétaire du
// 25 novembre 2026, migration 50) : « Mes cartes » (au départ), « Mes
// projets » ou « Un projet », choisi par chacun dans Réglages › Accueil.
// Règles pures (public/js/projects-tile.js, home-tiles.js), base et serveur
// (server/home.js, opération « account.home » : forme vérifiée, projet que
// la personne voit, sinon la réponse d'un projet inconnu ; jamais envoyé à
// quelqu'un d'autre), copie locale (hors ligne), écrans (lecture du code,
// jamais de HTML) et textes dans les deux langues. Le rendu réel (tuiles,
// pastilles sur deux lignes, feuille, focus, hors ligne) est vérifié dans
// Chromium (captures avant et après).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, tempDir, databaseAt } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { homeFromRow } from '../server/home.js';
import { defaultHome, normalizeHome, normalizeProjectsTile, homeChangeProblem, applyHomeChange, PROJECTS_TILE_MODES } from '../public/js/home-tiles.js';
import { projectsTileShown, projectRows, projectTileCards, chipsShown, TILE_ROWS, PROJECT_TILE_CARDS, CHIP_LINES } from '../public/js/projects-tile.js';
import { emptyState, applyOp, loadSync, toSnapshot, fromSnapshot } from '../public/js/store.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';

const uuid = () => crypto.randomUUID();
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Code sans les commentaires de ligne
const code = (file) => read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
const CARDS = { mode: 'cards', projectId: null };
const TODAY = '2026-11-25';

// --- Une copie locale d'exemple (forme de project-store.js) ---
// Cinq projets : A (propriétaire, échéances activées), B (« Lecture
// seule »), C (option « Échéances » désactivée), D, E ; un projet dans la
// corbeille (T). Guillaume (1) a des cartes dans A et C.
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
function sample() {
  const base = (n, name, at, extra = {}) => ({
    id: id(n), name, role: 'owner', createdAt: at, updatedAt: at, deletedAt: null, deadlinesEnabled: true, members: [], labels: [],
    columns: [{ id: `c${n}a`, name: 'À faire', color: 'rouge', position: 1 }, { id: `c${n}b`, name: 'Fait', color: 'vert', position: 2 }],
    ...extra,
  });
  const projects = [
    base(1, 'DomoPi Articles', '2026-11-24T10:00:00.000Z'),
    base(2, 'Test produits', '2026-11-23T10:00:00.000Z', { role: 'reader' }),
    base(3, 'Travaux maison', '2026-11-22T10:00:00.000Z', { deadlinesEnabled: false }),
    base(4, 'Liens Tech', '2026-11-21T10:00:00.000Z'),
    base(5, 'Vacances', '2026-11-20T10:00:00.000Z'),
    base(6, 'Anniversaire', '2026-11-19T10:00:00.000Z', { deletedAt: '2026-11-24T08:00:00.000Z' }),
  ];
  const card = (cardId, n, extra = {}) => ({ id: cardId, projectId: id(n), columnId: `c${n}a`, position: 1, title: cardId, labelIds: [], assigneeIds: [], updatedAt: '2026-11-20T09:00:00.000Z', ...extra });
  const cards = [
    card('late', 1, { assigneeIds: [1], dueDate: '2026-11-20' }),
    card('today', 1, { assigneeIds: [1], dueDate: TODAY }),
    card('later', 1, { assigneeIds: [1], dueDate: '2026-12-10', columnId: 'c1b' }),
    card('other', 1, { assigneeIds: [2] }),
    card('done', 1, { assigneeIds: [1], dueDate: '2026-11-10', done: true }),
    card('gone', 1, { assigneeIds: [1], deletedAt: '2026-11-22T09:00:00.000Z' }),
    card('read', 2),
    card('off', 3, { assigneeIds: [1], dueDate: '2026-11-01' }),
    card('trash', 6, { assigneeIds: [1] }),
  ];
  return {
    projects: new Map(projects.map((p) => [p.id, p])),
    projectIds: new Set(projects.map((p) => p.id)),
    cards: new Map(cards.map((c) => [c.id, c])),
    projectMine: { [id(1)]: { unread: true }, [id(3)]: { unread: false } },
  };
}

// --- Règles partagées ---

test('réglage : « Mes cartes » au départ ; un contenu inconnu ou abîmé redevient « Mes cartes »', () => {
  assert.deepEqual(PROJECTS_TILE_MODES, ['cards', 'projects', 'project']);
  assert.deepEqual(defaultHome().projectsTile, CARDS);
  assert.deepEqual(normalizeProjectsTile({ mode: 'projects', projectId: 'x' }), { mode: 'projects', projectId: null });
  assert.deepEqual(normalizeProjectsTile({ mode: 'project', projectId: id(1) }), { mode: 'project', projectId: id(1) });
  for (const bad of [null, 'project', { mode: 'project' }, { mode: 'project', projectId: '' }, { mode: 'project', projectId: '<b>' }, { mode: 'project', projectId: 'x'.repeat(65) }, { mode: 'meteo' }]) {
    assert.deepEqual(normalizeProjectsTile(bad), CARDS, JSON.stringify(bad));
  }
  assert.deepEqual(normalizeHome({ projectsTile: { mode: 'projects' } }).projectsTile, { mode: 'projects', projectId: null });
});

test('homeChangeProblem : contenu de la tuile Projets vérifié (trois choix, un projet pour « Un projet » seulement, rien d\'autre)', () => {
  for (const ok of [{ mode: 'cards' }, { mode: 'projects' }, { mode: 'project', projectId: id(1) }, { mode: 'cards', projectId: null }]) {
    assert.equal(homeChangeProblem({ projectsTile: ok }), null, JSON.stringify(ok));
  }
  for (const bad of ['cards', [], {}, { mode: 'meteo' }, { mode: 'project' }, { mode: 'project', projectId: 42 }, { mode: 'project', projectId: '../x' },
    { mode: 'cards', projectId: id(1) }, { mode: 'projects', extra: true }, { mode: 'project', projectId: id(1), userId: 2 }]) {
    assert.equal(homeChangeProblem({ projectsTile: bad }), 'ops.accueilTuileProjetsInvalide', JSON.stringify(bad));
  }
  // Une partie valable n'est jamais gardée si une autre est refusée
  assert.equal(homeChangeProblem({ enabled: false, projectsTile: { mode: 'x' } }), 'ops.accueilTuileProjetsInvalide');
  // Le reste du réglage est gardé
  const home = applyHomeChange({ enabled: false, start: 'notes', hidden: ['gifts'] }, { projectsTile: { mode: 'project', projectId: id(3) } });
  assert.deepEqual(home, { ...defaultHome(), enabled: false, start: 'notes', hidden: ['gifts'], projectsTile: { mode: 'project', projectId: id(3) } });
  assert.deepEqual(applyHomeChange(home, { hidden: [] }).projectsTile, { mode: 'project', projectId: id(3) });
  assert.ok(fr['ops.accueilTuileProjetsInvalide'] && en['ops.accueilTuileProjetsInvalide']);
});

test('ce que montre la tuile : le choix, ou « Mes cartes » quand le projet choisi n\'est plus visible (sans rien dire)', () => {
  const state = sample();
  assert.deepEqual(projectsTileShown(null, state), { mode: 'cards', project: null });
  assert.deepEqual(projectsTileShown({ projectsTile: { mode: 'projects' } }, state), { mode: 'projects', project: null });
  assert.equal(projectsTileShown({ projectsTile: { mode: 'project', projectId: id(3) } }, state).project.name, 'Travaux maison');
  // Projet dans la corbeille, inconnu, ou plus parmi les miens (quitté) : « Mes cartes »
  for (const projectId of [id(6), id(9)]) assert.deepEqual(projectsTileShown({ projectsTile: { mode: 'project', projectId } }, state), { mode: 'cards', project: null });
  state.projectIds.delete(id(3));
  assert.deepEqual(projectsTileShown({ projectsTile: { mode: 'project', projectId: id(3) } }, state), { mode: 'cards', project: null });
  // Le choix gardé ne change pas (il revient avec le projet)
  const home = normalizeHome({ projectsTile: { mode: 'project', projectId: id(3) } });
  projectsTileShown(home, state);
  assert.deepEqual(home.projectsTile, { mode: 'project', projectId: id(3) });
});

test('« Mes projets » : trois lignes au plus (trois projets, ou deux et « Tous les projets »), la plus récente activité d\'abord', () => {
  const state = sample();
  assert.equal(TILE_ROWS, 3);
  const { rows, more } = projectRows(state, 1, TODAY, '10:30');
  assert.equal(more, true, 'cinq projets visibles : « Tous les projets »');
  assert.deepEqual(rows.map((row) => row.project.name), ['DomoPi Articles', 'Test produits']);
  // « 6 cartes · 3 pour vous · 1 en retard » ; supprimée et faite comptées à part
  assert.deepEqual({ ...rows[0], project: undefined }, { project: undefined, cards: 5, mine: 3, late: 1, readOnly: false, unread: true });
  // Lecture seule : « 1 carte · lecture seule »
  assert.deepEqual({ ...rows[1], project: undefined }, { project: undefined, cards: 1, mine: 0, late: 0, readOnly: true, unread: false });
  // Trois projets ou moins : tous, sans « Tous les projets »
  for (const n of [4, 5]) state.projectIds.delete(id(n));
  const three = projectRows(state, 1, TODAY, '10:30');
  assert.equal(three.more, false);
  assert.deepEqual(three.rows.map((row) => row.project.name), ['DomoPi Articles', 'Test produits', 'Travaux maison']);
  // Option « Échéances » désactivée : jamais « en retard »
  assert.deepEqual([three.rows[2].mine, three.rows[2].late], [1, 0]);
  // Aucun projet : aucune ligne
  assert.deepEqual(projectRows({ ...state, projectIds: new Set() }, 1, TODAY, '10:30'), { rows: [], more: false });
});

test('« Un projet » : mes deux cartes les plus urgentes de ce projet, et leur nombre', () => {
  const state = sample();
  assert.equal(PROJECT_TILE_CARDS, 2);
  const tile = projectTileCards(state, 1, id(1), TODAY, '10:30');
  assert.equal(tile.count, 3);
  assert.deepEqual(tile.urgent.map((card) => card.id), ['late', 'today']);
  // Seulement les cartes de ce projet ; aucune pour moi : rien
  assert.deepEqual(projectTileCards(state, 1, id(3), TODAY, '10:30').urgent.map((card) => card.id), ['off']);
  assert.deepEqual(projectTileCards(state, 1, id(2), TODAY, '10:30'), { count: 0, urgent: [] });
  assert.deepEqual(projectTileCards(state, 2, id(1), TODAY, '10:30').urgent.map((card) => card.id), ['other']);
});

test('pastilles des colonnes : deux lignes au plus, « +N » pour les autres (une pastille au moins)', () => {
  assert.equal(CHIP_LINES, 2);
  // Mesure simulée : trois pastilles par ligne, la pastille « +N » en prend la place d'une
  const linesFor = (perLine) => (shown, more) => Math.ceil((shown + (more ? 1 : 0)) / perLine);
  assert.equal(chipsShown(5, linesFor(3)), 5, 'tout tient');
  assert.equal(chipsShown(6, linesFor(3)), 6);
  assert.equal(chipsShown(7, linesFor(3)), 5, 'cinq et « +2 »');
  assert.equal(chipsShown(12, linesFor(3)), 5);
  assert.equal(chipsShown(4, linesFor(1)), 1, 'une colonne par ligne : une et « +3 »');
  assert.equal(chipsShown(0, linesFor(3)), 0);
  // La mesure est faite à l'écran (home.js, fitChips), avec cette règle
  const home = code('public/js/screens/home.js');
  assert.match(home, /const shown = chipsShown\(chips\.length, linesFor\);/);
  assert.match(home, /more\.setAttribute\('aria-label', t\('accueil\.projets\.colonnes\.autres', \{ count: chips\.length - shown \}\)\);/);
  assert.match(home, /tiles\.querySelectorAll\('\.tile__cols'\)\.forEach\(fitChips\);/);
  assert.equal(translate('fr', 'accueil.projets.colonnes.autres', { count: 2 }), '2 autres colonnes');
  assert.equal(translate('en', 'accueil.projets.colonnes.autres', { count: 1 }), '1 more column');
});

// --- Base et serveur ---

test('migration 50 : deux colonnes, « Mes cartes » au départ, contrôles ; une base d\'avant migre sans rien changer', (t) => {
  const db = openDatabase(':memory:');
  assert.equal(MIGRATIONS.length, 51);
  assert.equal(schemaVersion(db), 51);
  const userId = db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('lea', 'Léa', 'x', 'user')").run().lastInsertRowid;
  assert.deepEqual(db.prepare('SELECT home_projects, home_project_id FROM users WHERE id = ?').get(userId), { home_projects: 'cards', home_project_id: null });
  assert.throws(() => db.prepare("UPDATE users SET home_projects = 'meteo' WHERE id = ?").run(userId), /CHECK/);
  // Un projet seulement avec « Un projet », 64 caractères au plus
  assert.throws(() => db.prepare('UPDATE users SET home_project_id = ? WHERE id = ?').run(id(1), userId), /CHECK/);
  assert.throws(() => db.prepare("UPDATE users SET home_projects = 'project', home_project_id = ? WHERE id = ?").run('x'.repeat(65), userId), /CHECK/);
  db.prepare("UPDATE users SET home_projects = 'project', home_project_id = ? WHERE id = ?").run(id(1), userId);
  assert.deepEqual(homeFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)).projectsTile, { mode: 'project', projectId: id(1) });
  db.close();
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 49);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role, home_tiles) VALUES ('paul', 'Paul', 'x', 'user', ?)").run(JSON.stringify({ order: ['notes'], hidden: ['gifts'] }));
  const before = old.prepare('SELECT * FROM users').all();
  old.close();
  const migrated = openDatabase(file);
  t.after(() => migrated.close());
  assert.equal(schemaVersion(migrated), 51);
  const after = migrated.prepare('SELECT * FROM users').all();
  assert.deepEqual(after.map(({ home_projects, home_project_id, sso_only, ...rest }) => rest), before);
  const home = homeFromRow(after[0]);
  assert.deepEqual(home.projectsTile, CARDS);
  assert.deepEqual(home.hidden, ['gifts']);
});

// Foyer : Guillaume (Admin), Léa et Zoé ; projets activés pour Guillaume et Léa
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const people = { guillaume: { client: guillaume, id: 1 } };
  for (const key of ['lea', 'zoe']) {
    const userId = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id: userId };
  }
  app.db.prepare("UPDATE users SET projects_enabled = 1 WHERE username IN ('guillaume', 'lea')").run();
  const run = async (who, op) => {
    const { id: opId, ...result } = (await people[who].client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
    return result;
  };
  const project = async (who, name) => {
    const projectId = uuid();
    assert.equal((await run(who, { type: 'project.create', projectId, name })).status, 200);
    return projectId;
  };
  const sync = async (who) => (await people[who].client.get('/api/sync')).body;
  const stored = (who) => app.db.prepare('SELECT home_projects, home_project_id FROM users WHERE id = ?').get(people[who].id);
  return { app, people, run, project, sync, stored };
}

test('serveur : chacun choisit pour lui ; « Un projet » seulement pour un projet qu\'il voit ; /api/me et la synchronisation le donnent', async (t) => {
  const h = await household(t);
  const mine = await h.project('guillaume', 'DomoPi Articles');
  const hers = await h.project('lea', 'Travaux maison');
  assert.deepEqual((await h.sync('guillaume')).home.projectsTile, CARDS);
  assert.deepEqual(await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'projects' } }), { status: 200 });
  assert.deepEqual((await h.sync('guillaume')).home.projectsTile, { mode: 'projects', projectId: null });
  assert.deepEqual(await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'project', projectId: mine } }), { status: 200 });
  assert.deepEqual(h.stored('guillaume'), { home_projects: 'project', home_project_id: mine });
  assert.deepEqual((await h.people.guillaume.client.get('/api/me')).body.user.home.projectsTile, { mode: 'project', projectId: mine });
  // Le projet de Léa, que Guillaume ne voit pas (même l'Admin) : la réponse
  // d'un projet inconnu, rien n'est écrit
  const unknown = await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'project', projectId: uuid() } });
  const other = await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'project', projectId: hers } });
  assert.deepEqual(other, unknown);
  assert.deepEqual([other.status, other.code], [404, 'ops.projetIntrouvable']);
  assert.deepEqual(h.stored('guillaume'), { home_projects: 'project', home_project_id: mine });
  // Partagé avec lui : accepté
  assert.equal((await h.people.lea.client.request('PUT', `/api/projects/${hers}/members`, { userIds: [1], access: { 1: 'lecture' } })).status, 200);
  assert.deepEqual(await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'project', projectId: hers } }), { status: 200 });
  // Projet dans la corbeille : refusé comme inconnu
  assert.equal((await h.run('guillaume', { type: 'project.delete', projectId: mine })).status, 200);
  assert.deepEqual((await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'project', projectId: mine } })).status, 404);
  // Forme invalide : 400, rien n'est écrit
  for (const bad of [{ mode: 'meteo' }, { mode: 'project' }, { mode: 'cards', projectId: hers }, 'projects']) {
    const result = await h.run('guillaume', { type: 'account.home', projectsTile: bad });
    assert.deepEqual([result.status, result.code], [400, 'ops.accueilTuileProjetsInvalide'], JSON.stringify(bad));
    assert.equal(result.error, translate('fr', 'ops.accueilTuileProjetsInvalide'));
  }
  assert.deepEqual(h.stored('guillaume'), { home_projects: 'project', home_project_id: hers });
  // Retour à « Mes cartes » : le projet n'est plus gardé
  assert.deepEqual(await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'cards' } }), { status: 200 });
  assert.deepEqual(h.stored('guillaume'), { home_projects: 'cards', home_project_id: null });
});

test('serveur : projets non autorisés ou désactivés, « Un projet » refusé ; « Mes cartes » et « Mes projets » restent possibles', async (t) => {
  const h = await household(t);
  const theirs = await h.project('lea', 'Travaux maison');
  assert.equal((await h.people.lea.client.request('PUT', `/api/projects/${theirs}/members`, { userIds: [h.people.zoe.id], access: { [h.people.zoe.id]: 'lecture' } })).status, 200);
  // Zoé : projets désactivés (le départ)
  const off = await h.run('zoe', { type: 'account.home', projectsTile: { mode: 'project', projectId: theirs } });
  assert.deepEqual([off.status, off.code], [403, 'ops.projetsCoupes']);
  h.app.db.prepare('UPDATE users SET projects_allowed = 0 WHERE id = ?').run(h.people.zoe.id);
  const denied = await h.run('zoe', { type: 'account.home', projectsTile: { mode: 'project', projectId: theirs } });
  assert.deepEqual([denied.status, denied.code], [403, 'ops.projetsNonAutorises']);
  assert.deepEqual(h.stored('zoe'), { home_projects: 'cards', home_project_id: null });
  assert.deepEqual(await h.run('zoe', { type: 'account.home', projectsTile: { mode: 'projects' } }), { status: 200 });
});

test('serveur : le choix d\'une personne n\'est jamais envoyé à une autre (synchronisation, /api/me, projet partagé)', async (t) => {
  const h = await household(t);
  const shared = await h.project('lea', 'Travaux maison');
  assert.equal((await h.people.lea.client.request('PUT', `/api/projects/${shared}/members`, { userIds: [1], access: { 1: 'modification' } })).status, 200);
  const before = { lea: await h.sync('lea'), me: (await h.people.lea.client.get('/api/me')).body };
  assert.deepEqual(await h.run('guillaume', { type: 'account.home', projectsTile: { mode: 'project', projectId: shared } }), { status: 200 });
  const after = { lea: await h.sync('lea'), me: (await h.people.lea.client.get('/api/me')).body };
  // Rien ne change dans ce que reçoit Léa (son réglage, projets, membres,
  // nouveautés…), à l'heure du serveur près
  const strip = ({ serverTime, ...rest }) => rest;
  assert.deepEqual(strip(after.lea), strip(before.lea));
  assert.deepEqual(after.me, before.me);
  assert.deepEqual(after.lea.home.projectsTile, CARDS);
  // Un champ « userId » dans l'opération ne change rien : toujours le compte de la session
  assert.deepEqual(await h.run('lea', { type: 'account.home', projectsTile: { mode: 'projects' }, userId: 1 }), { status: 200 });
  assert.deepEqual(h.stored('guillaume'), { home_projects: 'project', home_project_id: shared });
  assert.deepEqual(h.stored('lea'), { home_projects: 'projects', home_project_id: null });
});

// --- Copie locale du téléphone ---

test('copie locale : choix appliqué tout de suite, hors ligne compris (mêmes règles), gardé sur le téléphone', () => {
  const state = emptyState();
  assert.deepEqual(state.home.projectsTile, CARDS);
  loadSync(state, { serverTime: 't', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], home: { projectsTile: { mode: 'projects' } } });
  assert.deepEqual(state.home.projectsTile, { mode: 'projects', projectId: null });
  applyOp(state, { type: 'account.home', projectsTile: { mode: 'project', projectId: id(1) } }, { user: { id: 1 } });
  assert.deepEqual(state.home.projectsTile, { mode: 'project', projectId: id(1) });
  // Refusée par les mêmes règles : rien ne change
  applyOp(state, { type: 'account.home', projectsTile: { mode: 'meteo' } }, { user: { id: 1 } });
  assert.deepEqual(state.home.projectsTile, { mode: 'project', projectId: id(1) });
  const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state, '2026-11-25T10:00:00.000Z'))));
  assert.deepEqual(back.home.projectsTile, { mode: 'project', projectId: id(1) });
});

// --- Écrans ---

test('Accueil : les trois contenus de la tuile, textes posés sans HTML, rien demandé au serveur', () => {
  const home = code('public/js/screens/home.js');
  assert.doesNotMatch(home, /innerHTML|insertAdjacentHTML|outerHTML|\.focus\(/);
  assert.match(home, /const shown = projectsTileShown\(app\.data\.home, app\.data\);\s*if \(shown\.mode === 'projects'\) return myProjectsTile\(open\);\s*if \(shown\.mode === 'project'\) return oneProjectTile\(shown\.project\);\s*return myCardsTile\(projects, open\);/);
  // « Mes cartes » : trois cartes ; « Un projet » : sans le nom du projet
  assert.match(home, /urgentCards\(app\.data, app\.user\.id, todayKey\(\), nowTime\(\), TILE_ROWS\)/);
  assert.match(home, /cardRow\(card, project, \{ withProject: false \}\)/);
  // « Mes projets » : « pour vous » seulement s'il y en a, « en retard » écrit et en rouge, lecture seule ; pas de nombre sur le titre
  assert.match(home, /!readOnly && mine \? \[' · ', t\('accueil\.projets\.ligne\.pourVous', \{ count: mine \}\)\] : null,/);
  assert.match(home, /late \? \[' · ', h\('span', \{ class: 'tile__late' \}, t\('projets\.pourVous\.retard', \{ count: late \}\)\)\] : null\)/);
  assert.match(home, /more \? row\(\{ label: t\('accueil\.projets\.tous'\), onClick: open \}\) : null,/);
  assert.match(home, /\{ spoken: news \? t\('accueil\.projets\.lu\.nouveautes'\) : null, dot: news \}\);\s*\}\s*function oneProjectTile/);
  // « Un projet » : le titre ouvre le projet ; pastilles .colchip (pas des boutons)
  assert.match(home, /return tile\(project\.name, 'kanban', open, \[/);
  assert.match(home, /h\('li', \{ class: `colchip c-\$\{column\.color\}` \}/);
  assert.match(home, /emptyText\(t\('accueil\.projets\.aucuneCarte'\)\)/);
  // Textes, deux langues, pluriels
  assert.equal(translate('fr', 'accueil.projets.ligne.cartes', { count: 1 }), '1 carte');
  assert.equal(translate('fr', 'accueil.projets.ligne.cartes', { count: 55 }), '55 cartes');
  assert.equal(translate('en', 'accueil.projets.ligne.pourVous', { count: 3 }), '3 for you');
  assert.equal(translate('fr', 'accueil.projets.projet.lu.nouveautes', { name: 'DomoPi', count: 3 }), 'DomoPi, 3 cartes pour vous, nouveautés');
  assert.equal(translate('en', 'accueil.projets.projet.lu', { name: 'DomoPi', count: 1 }), 'DomoPi, 1 card for you');
  assert.equal(fr['accueil.projets.tous'], 'Tous les projets');
  assert.equal(en['accueil.projets.tous'], 'All projects');
});

test('Réglages › Accueil : ligne « Projets » à deux zones, feuille « Tuile Projets » appliquée tout de suite par la file d\'attente', () => {
  const screen = code('public/js/screens/home-settings.js');
  assert.doesNotMatch(screen, /innerHTML|insertAdjacentHTML|outerHTML|\bput\(|\bpost\(|fetch\(/);
  assert.match(screen, /h\('div', \{ class: 'row row--split' \},/);
  assert.match(screen, /class: 'row__open', type: 'button', 'aria-haspopup': 'dialog', 'data-key': 'projects-tile',\s*'aria-label': t\('reglages\.accueil\.projets\.ouvrir', \{ choice \}\),/);
  assert.match(screen, /actions\.setHome\(\{ projectsTile: mode === 'project' \? \{ mode, projectId \} : \{ mode \} \}\);/);
  // Choix exclusifs (role="radio", aria-checked), deux groupes nommés
  assert.match(screen, /h\('div', \{ class: 'group', role: 'radiogroup', 'aria-label': t\('reglages\.accueil\.projets\.choix'\) \}, modes\)/);
  assert.match(screen, /h\('div', \{ class: 'group', role: 'radiogroup', 'aria-labelledby': sectionId \}, projectRows\)/);
  assert.match(screen, /row\.setAttribute\('aria-checked', String\(on\)\);/);
  // Projets de la personne seulement (copie locale), et le choix affiché suit la règle de l'Accueil
  assert.match(screen, /const projects = projectsInOrder\(\);/);
  assert.match(screen, /const shown = projectsTileShown\(home, app\.data\);/);
  for (const key of ['reglages.accueil.projets.cartes', 'reglages.accueil.projets.projets', 'reglages.accueil.projets.projet', 'reglages.accueil.projets.titre', 'reglages.accueil.projets.section', 'reglages.accueil.projets.aucun']) {
    assert.ok(fr[key] && en[key], key);
  }
  assert.equal(translate('fr', 'reglages.accueil.projets.projetNomme', { name: 'DomoPi' }), 'Un projet : DomoPi');
  assert.equal(translate('en', 'reglages.accueil.projets.ouvrir', { choice: 'My cards' }), 'Projects, tile content: My cards');
});

test('kit : section 16.52 et titres des tuiles condensés, identiques dans les deux feuilles de style ; service worker à jour', () => {
  const kit = (file) => read(file).slice(read(file).indexOf('/* 16.1 Photo'), read(file).indexOf('/* ---------- 17') > 0 ? read(file).indexOf('/* ---------- 17') : undefined).trim();
  assert.equal(kit('public/css/listo.css'), kit('design/listo.css'));
  const css = read('public/css/listo.css');
  for (const rule of ['/* 16.52 Tuile « Projets » au choix', '.tile__cols {', '.colchip--more {', '.row--split {', '.row__open {', '.radio-row--two {', '.sheet__section {']) assert.ok(css.includes(rule), rule);
  // Titre plus bas, zone touchée de 44 px gardée
  assert.match(css, /\.tile__head \{ position: relative; [^}]*min-height: calc\(var\(--tap-min\) - 6px\);[^}]*font-size: var\(--text-item\);/);
  assert.match(css, /\.tile__head::after \{ content: ""; position: absolute; inset: -4px 0 -2px; \}/);
  const sw = read('public/sw.js');
  assert.ok(sw.includes("'/js/projects-tile.js'"));
  assert.ok(Number(/const VERSION = `v(\d+)-/.exec(sw)?.[1]) >= 183);
});
