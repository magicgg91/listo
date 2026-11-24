// Réglages › Accueil (23 novembre 2026, migration 40) : tuiles affichées et
// leur ordre, Accueil coupé et premier écran. Réglage de chaque compte, le
// même sur tous ses appareils : vérifié par le serveur (server/home.js),
// donné par /api/me et la synchronisation, modifié par l'opération
// « account.home » (file d'attente : hors ligne compris). Règles partagées
// (public/js/home-tiles.js), disposition des tuiles du téléphone, bandeau
// du bas à quatre ou cinq boutons, premier écran, cloche dans la barre du
// haut quand l'Accueil est coupé, écran des Réglages. Le rendu réel (tuiles,
// glisser une poignée) est vérifié dans Chromium (captures avant et après).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, addUser, login, databaseAt, tempDir } from './helpers.js';
import { openDatabase, schemaVersion, MIGRATIONS } from '../server/db.js';
import { homeFromRow } from '../server/home.js';
import {
  HOME_TILES, START_SCREENS, WIDE_TILES, TAB_SCREENS, defaultHome, normalizeHome, homeChangeProblem, applyHomeChange, firstScreen, shownTiles, tileLayout, tabScreens,
} from '../public/js/home-tiles.js';
import { emptyState, applyOp, loadSync, mergeSync, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { matchRoute, pathFor } from '../public/js/router.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';

const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Code sans les commentaires de ligne
const code = (file) => read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

// Résultat d'une opération, sans son identifiant
async function run(client, op) {
  const { id, ...result } = (await client.post('/api/ops', { ops: [{ id: uuid(), ...op }] })).body.results[0];
  return result;
}

// --- Règles partagées (public/js/home-tiles.js) ---

test('réglage de départ : Accueil affiché, toutes les tuiles dans l\'ordre d\'avant, Listes comme premier écran', () => {
  assert.deepEqual(HOME_TILES, ['deadlines', 'lists', 'gifts', 'notes', 'account']);
  assert.deepEqual(START_SCREENS, ['deadlines', 'lists', 'notes']);
  assert.deepEqual(WIDE_TILES, ['gifts']);
  assert.deepEqual(defaultHome(), { enabled: true, start: 'lists', order: HOME_TILES, hidden: [] });
  for (const value of [null, undefined, 'abîmé', 42, {}]) assert.deepEqual(normalizeHome(value), defaultHome());
  assert.equal(firstScreen(null), 'home');
  assert.deepEqual(shownTiles(null), HOME_TILES);
});

test('normalizeHome : tuiles inconnues et doublons écartés, tuiles manquantes ajoutées à la fin, Compte jamais masqué', () => {
  assert.deepEqual(normalizeHome({ order: ['notes', 'inconnue', 'notes', 'lists'] }).order, ['notes', 'lists', 'deadlines', 'gifts', 'account']);
  assert.deepEqual(normalizeHome({ hidden: ['account', 'notes', 'x', 'notes'] }).hidden, ['notes']);
  assert.equal(normalizeHome({ start: 'settings' }).start, 'lists');
  assert.equal(normalizeHome({ enabled: 'non' }).enabled, true);
  assert.deepEqual(normalizeHome({ enabled: false, start: 'notes' }), { enabled: false, start: 'notes', order: HOME_TILES, hidden: [] });
});

test('homeChangeProblem : tuile inconnue, en double, Compte masqué, premier écran inconnu, rien à modifier', () => {
  assert.equal(homeChangeProblem({}), 'ops.rienAModifier');
  assert.equal(homeChangeProblem({ enabled: 'oui' }), 'ops.accueilReglageInvalide');
  assert.equal(homeChangeProblem({ start: 'settings' }), 'ops.accueilPremierEcranInvalide');
  assert.equal(homeChangeProblem({ start: 'home' }), 'ops.accueilPremierEcranInvalide');
  assert.equal(homeChangeProblem({ order: ['lists', 'meteo'] }), 'ops.accueilTuilesInvalides');
  assert.equal(homeChangeProblem({ order: ['lists', 'lists'] }), 'ops.accueilTuilesInvalides');
  assert.equal(homeChangeProblem({ order: 'lists' }), 'ops.accueilTuilesInvalides');
  assert.equal(homeChangeProblem({ hidden: ['notes', 'notes'] }), 'ops.accueilTuilesInvalides');
  assert.equal(homeChangeProblem({ hidden: [{}] }), 'ops.accueilTuilesInvalides');
  assert.equal(homeChangeProblem({ hidden: ['account'] }), 'ops.accueilCompteToujours');
  // Valables : une tuile connue absente de l'ordre est remise à la fin
  assert.equal(homeChangeProblem({ enabled: false }), null);
  assert.equal(homeChangeProblem({ start: 'notes' }), null);
  assert.equal(homeChangeProblem({ order: ['notes', 'lists'] }), null);
  assert.deepEqual(applyHomeChange(null, { order: ['notes', 'lists'] }).order, ['notes', 'lists', 'deadlines', 'gifts', 'account']);
  assert.deepEqual(applyHomeChange({ enabled: false, start: 'notes' }, { hidden: ['gifts'] }), { enabled: false, start: 'notes', order: HOME_TILES, hidden: ['gifts'] });
  // Textes de refus, dans les deux langues
  for (const key of ['ops.accueilReglageInvalide', 'ops.accueilPremierEcranInvalide', 'ops.accueilTuilesInvalides', 'ops.accueilCompteToujours']) {
    assert.ok(fr[key] && en[key], key);
  }
});

test('premier écran : l\'Accueil, ou l\'écran choisi quand il est coupé ; tuiles affichées dans l\'ordre choisi', () => {
  assert.equal(firstScreen({ enabled: true, start: 'notes' }), 'home');
  for (const start of START_SCREENS) assert.equal(firstScreen({ enabled: false, start }), start);
  assert.deepEqual(shownTiles({ order: ['notes', 'account', 'lists'], hidden: ['lists', 'gifts'] }), ['notes', 'account', 'deadlines']);
});

test('disposition du téléphone : une tuile seule sur sa ligne prend toute la largeur (jamais de trou)', () => {
  const wide = (names) => tileLayout(names).filter((tile) => tile.wide).map((tile) => tile.name);
  // Ordre de départ, avec et sans « À offrir » : rien ne change (seule
  // « À offrir » est large, comme avant)
  assert.deepEqual(tileLayout(['deadlines', 'lists', 'gifts', 'notes', 'account']).map((tile) => tile.name), ['deadlines', 'lists', 'gifts', 'notes', 'account']);
  assert.deepEqual(wide(['deadlines', 'lists', 'gifts', 'notes', 'account']), ['gifts']);
  assert.deepEqual(wide(['deadlines', 'lists', 'notes', 'account']), []);
  // Une tuile masquée : la dernière reste seule, elle prend la largeur
  assert.deepEqual(wide(['deadlines', 'lists', 'gifts', 'account']), ['gifts', 'account']);
  // Suivie d'une tuile large : elle prend la largeur (maquette r4)
  assert.deepEqual(wide(['lists', 'gifts', 'deadlines', 'notes', 'account']), ['lists', 'gifts', 'account']);
  // La tuile large seule, ou en tête
  assert.deepEqual(wide(['gifts']), ['gifts']);
  assert.deepEqual(wide(['gifts', 'deadlines', 'lists']), ['gifts']);
  // Une seule tuile (Compte) : toute la largeur ; rien : rien
  assert.deepEqual(wide(['account']), ['account']);
  assert.deepEqual(tileLayout([]), []);
});

// --- Base et serveur ---

test('migration 40 : trois colonnes sur users, valeurs de départ, contrôles ; une base d\'avant migre sans rien changer', (t) => {
  const db = openDatabase(':memory:');
  assert.equal(MIGRATIONS.length, 40);
  assert.equal(schemaVersion(db), 40);
  const id = db.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('lea', 'Léa', 'x', 'user')").run().lastInsertRowid;
  const row = db.prepare('SELECT home_enabled, home_start, home_tiles FROM users WHERE id = ?').get(id);
  assert.deepEqual(row, { home_enabled: 1, home_start: 'lists', home_tiles: null });
  assert.deepEqual(homeFromRow(row), defaultHome());
  assert.throws(() => db.prepare('UPDATE users SET home_enabled = 2 WHERE id = ?').run(id), /CHECK/);
  assert.throws(() => db.prepare("UPDATE users SET home_start = 'settings' WHERE id = ?").run(id), /CHECK/);
  assert.throws(() => db.prepare('UPDATE users SET home_tiles = ? WHERE id = ?').run('x'.repeat(201), id), /CHECK/);
  // Texte abîmé : ordre de départ
  db.prepare("UPDATE users SET home_tiles = 'abîmé' WHERE id = ?").run(id);
  assert.deepEqual(homeFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)).order, HOME_TILES);
  // Base en version 39 : les comptes existants gardent l'Accueil d'avant
  const file = path.join(tempDir(t), 'listo.db');
  const old = databaseAt(file, 39);
  old.prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('paul', 'Paul', 'x', 'user')").run();
  old.close();
  const migrated = openDatabase(file);
  assert.equal(schemaVersion(migrated), 40);
  assert.deepEqual(homeFromRow(migrated.prepare("SELECT * FROM users WHERE username = 'paul'").get()), defaultHome());
  migrated.close();
});

test('serveur : chacun modifie son seul réglage ; /api/me et la synchronisation le donnent ; tout autre appareil le reçoit', async (t) => {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  // Valeurs de départ (colonnes vides)
  assert.deepEqual((await admin.get('/api/me')).body.user.home, defaultHome());
  assert.deepEqual((await admin.get('/api/sync')).body.home, defaultHome());
  // Sans session : refusé
  assert.equal((await app.client().post('/api/ops', { ops: [{ id: uuid(), type: 'account.home', enabled: false }] })).status, 401);
  // Modifications valables
  assert.deepEqual(await run(admin, { type: 'account.home', hidden: ['notes'] }), { status: 200 });
  assert.deepEqual(await run(admin, { type: 'account.home', order: ['lists', 'notes', 'deadlines', 'gifts', 'account'] }), { status: 200 });
  assert.deepEqual(await run(admin, { type: 'account.home', enabled: false, start: 'notes' }), { status: 200 });
  const expected = { enabled: false, start: 'notes', order: ['lists', 'notes', 'deadlines', 'gifts', 'account'], hidden: ['notes'] };
  assert.deepEqual((await admin.get('/api/sync')).body.home, expected);
  assert.deepEqual((await admin.get('/api/me')).body.user.home, expected);
  // Un autre appareil du même compte reçoit le même réglage
  const phone = app.client();
  await login(phone, 'guillaume', 'MotDePasseAdmin!');
  assert.deepEqual((await phone.get('/api/sync')).body.home, expected);
  // Le compte de Léa n'a pas changé ; son opération ne touche que le sien
  assert.deepEqual((await lea.get('/api/sync')).body.home, defaultHome());
  assert.deepEqual(await run(lea, { type: 'account.home', enabled: false, userId: 1 }), { status: 200 });
  assert.deepEqual((await admin.get('/api/sync')).body.home, expected);
  assert.equal(app.db.prepare('SELECT home_enabled FROM users WHERE id = ?').pluck().get(leaId), 0);
  assert.equal(app.db.prepare('SELECT home_enabled FROM users WHERE id = 1').pluck().get(), 0);
});

test('serveur : tuile inconnue, en double, Compte masqué, premier écran inconnu, valeur non booléenne → 400, rien n\'est écrit', async (t) => {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  const refusals = [
    [{ order: ['lists', 'meteo'] }, 'ops.accueilTuilesInvalides'],
    [{ order: ['lists', 'lists', 'notes'] }, 'ops.accueilTuilesInvalides'],
    [{ hidden: ['notes', 'notes'] }, 'ops.accueilTuilesInvalides'],
    [{ hidden: 'notes' }, 'ops.accueilTuilesInvalides'],
    [{ hidden: ['account'] }, 'ops.accueilCompteToujours'],
    [{ start: 'settings' }, 'ops.accueilPremierEcranInvalide'],
    [{ start: 'home' }, 'ops.accueilPremierEcranInvalide'],
    [{ enabled: 'non' }, 'ops.accueilReglageInvalide'],
    [{}, 'ops.rienAModifier'],
    // Une partie valable n'est jamais écrite si une autre est refusée
    [{ enabled: false, hidden: ['account'] }, 'ops.accueilCompteToujours'],
  ];
  for (const [change, key] of refusals) {
    const result = await run(admin, { type: 'account.home', ...change });
    assert.equal(result.status, 400, JSON.stringify(change));
    assert.equal(result.code, key, JSON.stringify(change));
    assert.equal(result.error, translate('fr', key));
  }
  assert.deepEqual((await admin.get('/api/sync')).body.home, defaultHome());
  assert.equal(app.db.prepare('SELECT home_tiles FROM users WHERE id = 1').pluck().get(), null);
});

test('serveur : une tuile connue absente de l\'ordre est remise à la fin ; retour aux valeurs de départ = colonne vide', async (t) => {
  const app = await startTestApp(t);
  const admin = await setupAdmin(app);
  assert.deepEqual(await run(admin, { type: 'account.home', order: ['notes', 'lists'] }), { status: 200 });
  assert.deepEqual((await admin.get('/api/sync')).body.home.order, ['notes', 'lists', 'deadlines', 'gifts', 'account']);
  assert.deepEqual(JSON.parse(app.db.prepare('SELECT home_tiles FROM users WHERE id = 1').pluck().get()), { order: ['notes', 'lists', 'deadlines', 'gifts', 'account'], hidden: [] });
  // Une ancienne valeur gardée sans une tuile (ajoutée plus tard) : complétée à la lecture
  app.db.prepare('UPDATE users SET home_tiles = ? WHERE id = 1').run(JSON.stringify({ order: ['account', 'lists'], hidden: ['lists', 'inconnue'] }));
  assert.deepEqual((await admin.get('/api/sync')).body.home, { enabled: true, start: 'lists', order: ['account', 'lists', 'deadlines', 'gifts', 'notes'], hidden: ['lists'] });
  assert.deepEqual(await run(admin, { type: 'account.home', order: HOME_TILES, hidden: [] }), { status: 200 });
  assert.equal(app.db.prepare('SELECT home_tiles FROM users WHERE id = 1').pluck().get(), null);
});

test('ni les assistants IA, ni le lien public, ni l\'administration ne voient ce réglage', () => {
  for (const file of ['server/mcp-tools.js', 'server/mcp.js', 'server/routes/public.js', 'server/routes/admin-users.js', 'server/shares.js', 'server/note-shares.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /home_enabled|home_start|home_tiles|account\.home|homeFor|homeFromRow/, file);
  }
  // Seul server/home.js lit et écrit les colonnes
  for (const file of ['server/lists.js', 'server/auth.js', 'server/routes/me.js']) assert.doesNotMatch(read(file), /home_enabled|home_start|home_tiles/, file);
  assert.match(read('server/home.js'), /UPDATE users SET home_enabled = \?, home_start = \?, home_tiles = \? WHERE id = \?/);
  // Le compte vient toujours de la session (user.id), jamais de l'opération
  assert.match(read('server/lists.js'), /const \{ problem, changed \} = home\.setHome\(user\.id, \{ enabled: op\.enabled, start: op\.start, order: op\.order, hidden: op\.hidden \}\);/);
});

// --- Copie locale du téléphone ---

test('copie locale : synchronisation, opération hors ligne (mêmes règles), copie gardée sur le téléphone', () => {
  const state = emptyState();
  assert.deepEqual(state.home, defaultHome());
  loadSync(state, { serverTime: 't', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], home: { enabled: false, start: 'notes', order: ['notes'], hidden: [] } });
  assert.deepEqual(state.home, { enabled: false, start: 'notes', order: ['notes', 'deadlines', 'lists', 'gifts', 'account'], hidden: [] });
  applyOp(state, { type: 'account.home', enabled: true, hidden: ['gifts'] }, { user: { id: 1 } });
  assert.equal(state.home.enabled, true);
  assert.deepEqual(state.home.hidden, ['gifts']);
  // Refusée par les mêmes règles : rien ne change
  applyOp(state, { type: 'account.home', hidden: ['account'] }, { user: { id: 1 } });
  applyOp(state, { type: 'account.home', start: 'settings' }, { user: { id: 1 } });
  assert.deepEqual(state.home.hidden, ['gifts']);
  assert.equal(state.home.start, 'notes');
  // Gardée sur le téléphone et relue à l'identique
  const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state, '2026-11-23T10:00:00.000Z'))));
  assert.deepEqual(back.home, state.home);
  // Copie d'avant le réglage : valeurs de départ
  const snapshot = toSnapshot(state);
  delete snapshot.home;
  assert.deepEqual(fromSnapshot(JSON.parse(JSON.stringify(snapshot))).home, defaultHome());
  // Synchronisation « depuis » : remplacé en entier
  mergeSync(state, { serverTime: 't2', listIds: [], lists: [], items: [], stores: [], aisles: [], history: [], home: defaultHome() });
  assert.deepEqual(state.home, defaultHome());
  assert.match(read('public/js/actions.js'), /export const setHome = \(change\) => perform\(\{ type: 'account\.home', \.\.\.change \}\);/);
});

// --- Écrans ---

test('Accueil : tuiles dans l\'ordre choisi, sans les masquées, une tuile seule en pleine largeur ; coupé, il mène au premier écran', () => {
  const home = code('public/js/screens/home.js');
  assert.match(home, /import \{ shownTiles, tileLayout, firstScreen \} from '\.\.\/home-tiles\.js';/);
  assert.match(home, /const present = shownTiles\(app\.data\.home\)\.map\(\(name\) => \[name, build\[name\]\(\)\]\)\.filter\(\(\[, el\]\) => el\);/);
  assert.match(home, /const layout = tileLayout\(present\.map\(\(\[name\]\) => name\)\);/);
  assert.match(home, /el\.classList\.toggle\('tile--wide', layout\[i\]\.wide\)/);
  // « À offrir » n'est plus large d'office dans le code de la tuile
  assert.doesNotMatch(home, /wide: true/);
  assert.match(home, /const first = firstScreen\(app\.data\.home\);\s*if \(first !== 'home'\) \{/);
  assert.match(home, /if \(app\.route\?\.name === 'home'\) navigate\(first, \{\}, \{ replace: true \}\);/);
  // Sur ordinateur, tile--wide reste sans effet ; sous 340 px, une colonne
  const css = read('public/css/listo.css');
  assert.match(css, /\.app--pc \.tile--wide \{ grid-column: auto; \}/);
  assert.match(css, /@media \(max-width: 339\.98px\) \{ \.tiles \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
  // Le blocage du défilement suit toujours la mesure
  assert.match(home, /const fit = lockWhenFits\(content, tiles\);/);
  assert.match(home, /fit\.update\(\);/);
});

test('premier écran : #/accueil et une adresse inconnue mènent à l\'écran choisi quand l\'Accueil est coupé', () => {
  assert.deepEqual(matchRoute('#/nimporte/quoi'), { name: 'home', params: {} });
  assert.deepEqual(matchRoute('#/reglages/accueil'), { name: 'homeSettings', params: {} });
  assert.equal(pathFor('homeSettings'), '#/reglages/accueil');
  const app = code('public/js/app.js');
  assert.match(app, /export const openingScreen = \(\) => firstScreen\(app\.data\.home\);/);
  assert.match(app, /case 'home':\s*if \(openingScreen\(\) !== 'home'\) navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);/);
  assert.match(app, /default: navigate\(openingScreen\(\), \{\}, \{ replace: true \}\);/);
  assert.match(app, /case 'homeSettings': mount\(\(onLeave\) => renderHomeSettings\(onLeave\)\); break;/);
  // Connu dès l'ouverture (/api/me), avant la synchronisation ; la file
  // d'attente est rejouée ensuite
  assert.match(app, /if \(user\.home\) app\.data\.home = normalizeHome\(user\.home\);\s*queue\?\.stop\(\);\s*queue = makeQueue\(\);/);
  // Les retours qui menaient à l'Accueil mènent au premier écran
  assert.match(read('public/js/screens/inbox.js'), /goBack\(openingScreen\(\)\)/);
  const side = code('public/js/screens/pc-side.js');
  assert.match(side, /homeLink\.hidden = first !== 'home';/);
  assert.match(side, /navigate\(first, \{\}, \{ replace: selected\.name === first \}\);/);
  assert.equal(translate('fr', 'navigation.marque.ecran', { name: 'Listes' }), ': Listes');
});

test('bandeau du bas : cinq boutons, ou quatre sans « Accueil » quand il est coupé ; un seul bandeau, qui suit le réglage', () => {
  assert.deepEqual(tabScreens(null), ['home', 'deadlines', 'lists', 'notes', 'settings']);
  assert.deepEqual(tabScreens({ enabled: true, start: 'notes' }), ['home', 'deadlines', 'lists', 'notes', 'settings']);
  assert.deepEqual(tabScreens({ enabled: false, start: 'notes' }), ['deadlines', 'lists', 'notes', 'settings']);
  const tabbar = code('public/js/tabbar.js');
  // Mêmes boutons, dans le même ordre, que TABS
  const tabs = [...tabbar.slice(tabbar.indexOf('export const TABS')).matchAll(/^  \['(\w+)', '[\w-]+', \(\) => t\(/gm)].map((m) => m[1]);
  assert.deepEqual(tabs, TAB_SCREENS);
  assert.match(tabbar, /const names = tabScreens\(app\.data\.home\);/);
  assert.match(tabbar, /nav\.classList\.add\(`tabbar--\$\{names\.length\}`\);/);
  assert.match(tabbar, /if \(arrange\(\) && nav\.dataset\.current\) nav\.dataset\.current = placeOf\(\);/);
  // Toujours pas de bandeau sur l'Accueil
  assert.match(tabbar, /export const hasTabs = \(routeName\) => routeName !== 'home' && tabOf\(routeName\) !== null;/);
  // Le kit a bien les deux largeurs de pastille
  const css = read('public/css/listo.css');
  assert.match(css, /\.tabbar--4 \.tabbar__pill \{ width: calc\(\(100% - 10px\) \/ 4\); \}/);
  assert.match(css, /\.tabbar--5 \.tabbar__pill \{ width: calc\(\(100% - 10px\) \/ 5\); \}/);
});

test('cloche partagée (bell.js) : sur l\'Accueil, et dans la barre du haut d\'Échéances, Listes et Notes seulement quand l\'Accueil est coupé', () => {
  const bell = code('public/js/bell.js');
  assert.match(bell, /export function topBell\(onLeave\) \{/);
  assert.match(bell, /notifications\.el\.hidden = firstScreen\(app\.data\.home\) === 'home';/);
  assert.match(bell, /onLeave\(onDataChange\(paint\)\);/);
  // Une seule définition de la cloche
  for (const file of ['public/js/screens/home.js', 'public/js/screens/lists.js', 'public/js/screens/deadlines.js', 'public/js/screens/notes.js']) {
    assert.doesNotMatch(code(file), /icon\('bell'\)/, file);
  }
  // Téléphone : après la pastille d'état, avant les autres boutons ; ordinateur : sur la ligne du titre,
  // après « À jour », avant la recherche (24 novembre 2026)
  assert.match(code('public/js/screens/lists.js'), /syncPill\(\(\) => refreshData\(\{ full: true \}\), \{ inBar: true \}\),\s*topBell\(onLeave\),\s*sorter\.button,/);
  assert.match(code('public/js/screens/lists.js'), /syncPill\(\(\) => refreshData\(\{ full: true \}\)\), topBell\(onLeave\),\s*search\.field\),/);
  assert.match(code('public/js/screens/deadlines.js'), /syncPill\(\(\) => refreshData\(\{ full: true \}\), \{ inBar: true \}\),\s*topBell\(onLeave\)\),/);
  assert.match(code('public/js/screens/deadlines.js'), /syncPill\(\(\) => refreshData\(\{ full: true \}\)\), topBell\(onLeave\),\s*search\.field\),/);
  assert.match(code('public/js/screens/notes.js'), /syncPill\(\(\) => refreshData\(\{ full: true \}\), \{ inBar: true \}\),\s*topBell\(onLeave\),\s*sortButton\(\(\) => draw\(\)\),/);
  assert.match(code('public/js/screens/notes.js'), /syncPill\(\(\) => refreshData\(\{ full: true \}\)\), topBell\(onLeave\),\s*search\.field\),/);
  // Le bouton caché ne se voit pas : [hidden] l'emporte sur l'affichage des boutons-icônes
  assert.match(read('public/css/app.css'), /\[hidden\] \{ display: none !important; \}/);
});

test('Réglages : « Accueil » en première ligne de « Général » (téléphone et ordinateur)', () => {
  const settings = code('public/js/screens/settings.js');
  assert.match(settings, /const homeRow = \(\) => row\(\{ iconName: 'home', title: t\('reglages\.accueil'\), sub: t\('reglages\.accueil\.detail'\), onClick: \(\) => navigate\('homeSettings'\) \}\);/);
  assert.match(settings, /h\('div', \{ class: 'group' \}, homeRow\(\), generalRows\(isAdmin\)\),/);
  assert.match(settings, /h\('div', \{ class: 'group' \}, homeRow\(\), keysRow\(\), generalRows\(isAdmin\)\)/);
  assert.equal(fr['reglages.accueil'], 'Accueil');
  assert.equal(fr['reglages.accueil.detail'], 'Tuiles affichées, premier écran');
  assert.equal(en['reglages.accueil'], 'Home');
});

test('écran Réglages › Accueil : interrupteurs reliés, Compte grisé, Réordonner (flèches nommées, grisées aux bouts), premier écran à choix unique', () => {
  const screen = code('public/js/screens/home-settings.js');
  assert.doesNotMatch(screen, /innerHTML|insertAdjacentHTML|outerHTML|setAttribute\('style'|style: /);
  // Interrupteurs : role="switch", titre et description reliés
  assert.match(screen, /role: 'switch',\s*'aria-checked': String\(on\),\s*'aria-labelledby': `accueil-\$\{key\}-titre`,\s*'aria-describedby': help \? `accueil-\$\{key\}-aide` : null,/);
  // Compte : allumé et grisé
  assert.match(screen, /const always = name === ALWAYS_SHOWN;\s*const shown = always \|\| !home\.hidden\.includes\(name\);/);
  assert.match(screen, /disabled: always,/);
  // Réordonner / Terminé
  assert.match(screen, /'btn btn--sm btn--primary', type: 'button', 'data-key': 'reorder', onClick: \(\) => setReordering\(false\) \}, t\('reglages\.accueil\.termine'\)/);
  assert.match(screen, /'btn btn--sm btn--secondary', type: 'button', 'data-key': 'reorder', onClick: \(\) => setReordering\(true\) \}, icon\('menu-lines', 'icon--sm'\), t\('reglages\.accueil\.reordonner'\)/);
  // Monter / Descendre : nommés, grisés aux bouts, focus gardé, place annoncée
  assert.match(screen, /'aria-label': label\(step < 0\),/);
  assert.match(screen, /disabled: step < 0 \? index === 0 : index === home\.order\.length - 1,/);
  assert.match(screen, /focusAfterDraw = \[`\[data-key="\$\{step < 0 \? 'up' : 'down'\}-\$\{name\}"\]`, `\[data-key="\$\{step < 0 \? 'down' : 'up'\}-\$\{name\}"\]`\];/);
  assert.match(screen, /announce\(t\('reglages\.accueil\.position'/);
  assert.match(screen, /handle\.addEventListener\('pointerdown', \(event\) => startDrag\(event, row, home, name\)\);/);
  // Premier écran : role="radiogroup", role="radio", coche sur le choisi
  assert.match(screen, /h\('div', \{ class: 'group', role: 'radiogroup', 'aria-labelledby': 'accueil-premier' \}/);
  assert.match(screen, /role: 'radio', 'aria-checked': String\(chosen\)/);
  assert.match(screen, /chosen \? icon\('check', 'home-start__check'\) : null/);
  // Tout passe par la file d'attente (hors ligne compris)
  // (Accueil affiché, tuile masquée, ordre, premier écran)
  assert.equal((screen.match(/actions\.setHome\(/g) ?? []).length, 4);
  assert.doesNotMatch(screen, /\bput\(|\bpost\(|fetch\(/);
  // Textes
  assert.equal(translate('fr', 'reglages.accueil.monter', { name: 'Notes' }), 'Monter Notes');
  assert.equal(translate('en', 'reglages.accueil.descendre', { name: 'Notes' }), 'Move Notes down');
  assert.equal(translate('fr', 'reglages.accueil.position', { name: 'Notes', position: 2, total: 5 }), '« Notes » en position 2 sur 5');
  assert.equal(fr['reglages.accueil.compte.detail'], 'Toujours affichée : elle mène aux réglages');
  assert.equal(en['reglages.accueil.offrir.detail'], 'Only when you\'ve reserved a gift');
  assert.equal(en['reglages.accueil.note.ordre'], 'Drag a tile by its handle, or use the arrows. The Home screen follows this order.');
  // Mise en page : classes de app.css, aucune règle en ligne
  const css = read('public/css/app.css');
  for (const rule of ['.section-head {', '.home-order {', '.row > .icon.home-start__check {']) assert.ok(css.includes(rule), rule);
});

test('service worker : nouveaux fichiers gardés pour le hors-ligne, version changée', () => {
  const sw = read('public/sw.js');
  for (const file of ['/js/home-tiles.js', '/js/bell.js', '/js/screens/home-settings.js']) assert.ok(sw.includes(`'${file}'`), file);
  // (v156 ou plus récente : chaque changement suivant l'augmente encore)
  assert.ok(Number(/const VERSION = `v(\d+)-/.exec(sw)?.[1]) >= 156);
});
