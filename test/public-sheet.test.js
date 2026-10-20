// Fiche d'un article sur la page du lien public (décision du 20 octobre
// 2026) : le visiteur sans compte voit tous les détails d'un article, en
// lecture seule. Les données restent une liste blanche, champ par champ :
// le code-barres (liste de courses, s'il existe) et, pour un article coché,
// son rayon ou son magasin (pour un article à acheter, l'en-tête de son
// groupe le donne déjà). Jamais de nom de personne, d'identifiant de compte
// ou de liste, ni de date d'ajout. Le comportement à l'écran est aussi
// vérifié dans Chromium (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { startTestApp, setupAdmin, addUser, login, createClient } from './helpers.js';
import { publicItemDetails } from '../public/js/format.js';

const HOUR = 60 * 60 * 1000;
const uuid = () => crypto.randomUUID();
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Liste blanche exacte d'un article : toujours ces champs…
const ITEM = ['checked', 'name', 'note', 'photo', 'quantity'];
// …et, seulement si l'article les a : code-barres (liste de courses),
// rayon ou magasin (article coché), priorité et échéance (si activées)
const OPTIONAL = { ean: true, aisle: true, store: true, priority: true, dueDate: true };

// Guillaume (propriétaire) ; Léa, membre ; une liste de courses (magasin
// simple), une liste « multi », une liste de tâches avec ses options
async function household(t) {
  const app = await startTestApp(t);
  const guillaume = await setupAdmin(app);
  const leaId = await addUser(app.db, { username: 'lea', password: 'MotDePasse-lea' });
  const lea = app.client();
  await login(lea, 'lea', 'MotDePasse-lea');
  const addStore = async (name, isMulti = false) => (await guillaume.post('/api/admin/stores', { name, isMulti })).body.item.id;
  const fromagerie = await addStore('Fromagerie');
  const boucherie = await addStore('Boucherie');
  const centre = await addStore('Centre-ville', true);
  await guillaume.request('PATCH', `/api/admin/stores/${centre}`, { storeIds: [fromagerie, boucherie] });
  const L = { shop: uuid(), multi: uuid(), tasks: uuid() };
  const I = { lait: uuid(), pain: uuid(), sel: uuid(), comte: uuid(), steak: uuid(), vis: uuid(), ampoule: uuid() };
  const longNote = 'Bio, en bouteille de verre si possible. '.repeat(8).trim();
  const ops = [
    { type: 'list.create', listId: L.shop, name: 'Courses', categoryId: 1, storeId: 1 },
    { type: 'item.create', listId: L.shop, itemId: I.lait, name: 'Lait', quantity: '2 L', note: longNote, aisleId: 4, ean: '3428272950019' },
    { type: 'item.create', listId: L.shop, itemId: I.pain, name: 'Pain', aisleId: 3, ean: '96385074' },
    { type: 'item.check', itemId: I.pain, checked: true },
    { type: 'item.create', listId: L.shop, itemId: I.sel, name: 'Sel', aisleId: null },
    { type: 'item.check', itemId: I.sel, checked: true },
    { type: 'list.create', listId: L.multi, name: 'En ville', categoryId: 1, storeId: centre },
    { type: 'item.create', listId: L.multi, itemId: I.comte, name: 'Comté', storeId: fromagerie },
    { type: 'item.check', itemId: I.comte, checked: true },
    { type: 'item.create', listId: L.multi, itemId: I.steak, name: 'Steak', storeId: boucherie },
    { type: 'list.create', listId: L.tasks, name: 'Maison', categoryId: 2 },
    { type: 'list.update', listId: L.tasks, priorityEnabled: true, dueEnabled: true },
    { type: 'item.create', listId: L.tasks, itemId: I.vis, name: 'Vis' },
    { type: 'item.update', itemId: I.vis, priority: 'high', dueDate: '2026-10-30' },
    { type: 'item.create', listId: L.tasks, itemId: I.ampoule, name: 'Ampoule' },
    { type: 'item.check', itemId: I.ampoule, checked: true },
  ];
  const res = await guillaume.post('/api/ops', { ops: ops.map((op) => ({ id: uuid(), ...op })) });
  assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
  // Un code-barres resté en base sur une liste de tâches (liste qui a cessé
  // d'être de courses) : jamais affiché, ni dans l'application ni ici
  app.db.prepare('UPDATE items SET ean = ? WHERE id = ?').run('3017620422003', I.vis);
  for (const id of Object.values(L)) await guillaume.request('PUT', `/api/lists/${id}/members`, { userIds: [leaId] });
  return { app, guillaume, lea, leaId, L, I, longNote, stores: { fromagerie, boucherie, centre } };
}

async function linkTo(h, listId, body = {}) {
  const res = await h.guillaume.request('PUT', `/api/lists/${listId}/share`, body);
  assert.equal(res.status, 201, res.text);
  return { share: res.body.share, token: res.body.share.url.split('/p/')[1] };
}
const visitor = (h, ip = '203.0.113.21') => createClient(h.app.base, { ip });
const allItems = (data) => [...data.groups.flatMap((g) => g.items), ...data.done];
// Chaque article : les champs de base, plus seulement des champs prévus
function assertWhitelist(item) {
  const keys = Object.keys(item);
  for (const key of ITEM) assert.ok(keys.includes(key), `${item.name} : « ${key} » manque`);
  for (const key of keys) assert.ok(ITEM.includes(key) || OPTIONAL[key], `${item.name} : « ${key} » n'est pas dans la liste blanche`);
}

test('liste de courses : code-barres si l\'article en a un ; rayon des cochés seulement (le groupe donne celui des autres)', async (t) => {
  const h = await household(t);
  const { token } = await linkTo(h, h.L.shop);
  const res = await visitor(h).get(`/api/public/${token}`);
  assert.equal(res.status, 200);
  for (const item of allItems(res.body)) assertWhitelist(item);
  // Article à acheter : exactement ces champs (rayon donné par l'en-tête « Crèmerie »)
  assert.deepEqual(res.body.groups.map((g) => g.name), ['Crèmerie']);
  assert.deepEqual(res.body.groups[0].items[0], { name: 'Lait', quantity: '2 L', note: h.longNote, checked: false, photo: null, ean: '3428272950019' });
  // Cochés : rayon ajouté s'il existe ; « Sans rayon » : rien ajouté
  assert.deepEqual(res.body.done.map((i) => i.name).sort(), ['Pain', 'Sel']);
  const pain = res.body.done.find((i) => i.name === 'Pain');
  const sel = res.body.done.find((i) => i.name === 'Sel');
  assert.deepEqual(pain, { name: 'Pain', quantity: '', note: '', checked: true, photo: null, ean: '96385074', aisle: 'Boulangerie' });
  assert.deepEqual(Object.keys(sel).sort(), ITEM, 'ni code-barres ni rayon : rien de plus');
});

test('liste « multi » : magasin des cochés ; liste de tâches : priorité et échéance, jamais de code-barres', async (t) => {
  const h = await household(t);
  const multi = (await visitor(h).get(`/api/public/${(await linkTo(h, h.L.multi)).token}`)).body;
  for (const item of allItems(multi)) assertWhitelist(item);
  assert.equal(multi.list.grouping, 'store');
  assert.deepEqual(multi.done, [{ name: 'Comté', quantity: '', note: '', checked: true, photo: null, store: 'Fromagerie' }]);
  assert.equal('store' in multi.groups[0].items[0], false, 'à acheter : le magasin est l\'en-tête du groupe');
  const tasks = (await visitor(h, '203.0.113.22').get(`/api/public/${(await linkTo(h, h.L.tasks)).token}`)).body;
  for (const item of allItems(tasks)) assertWhitelist(item);
  const vis = tasks.groups[0].items[0];
  assert.deepEqual(vis, { name: 'Vis', quantity: '', note: '', checked: false, photo: null, priority: 'high', dueDate: '2026-10-30' });
  assert.equal(JSON.stringify(tasks).includes('3017620422003'), false, 'code-barres d\'une liste de tâches : jamais');
  assert.deepEqual(Object.keys(tasks.done[0]).sort(), ['checked', 'dueDate', 'name', 'note', 'photo', 'priority', 'quantity'], 'ni rayon ni magasin hors courses');
});

test('aucun nom de personne, aucun identifiant de compte ou de liste, aucune date d\'ajout', async (t) => {
  const h = await household(t);
  for (const listId of Object.values(h.L)) {
    const { token } = await linkTo(h, listId);
    const res = await visitor(h, `203.0.113.${30 + Object.values(h.L).indexOf(listId)}`).get(`/api/public/${token}`);
    const text = res.text.replaceAll(token, '');
    for (const forbidden of ['guillaume', 'Guillaume', 'lea', 'Léa', 'admin', ...Object.values(h.L), 'createdBy', 'created_by', 'createdAt', 'created_at', 'addedBy', 'updatedAt', 'checkedAt', 'checked_at', 'members', 'owner', 'userId', 'initials']) {
      assert.equal(text.includes(String(forbidden)), false, `« ${forbidden} » dans la réponse de ${listId}`);
    }
    // Aucune clé d'identifiant, à aucun niveau (l'identifiant d'un article
    // ne figure que dans l'adresse de sa photo, inchangée)
    const keys = new Set();
    const walk = (value) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) { keys.add(key); walk(inner); }
    };
    walk(res.body);
    for (const key of keys) assert.doesNotMatch(key, /^id$|Id$|^user|^member|^owner|initial|By$|^created|^updated|^checkedAt$/, key);
    // Aucune date de création ou de coché (seule l'échéance, une date seule, et l'expiration du lien)
    const dates = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g) ?? [];
    assert.deepEqual(dates.length, res.body.expiresAt ? 1 : 0, 'seule la date d\'expiration du lien');
  }
});

test('lien expiré ou protégé : refusé comme avant, le code-barres n\'est donné qu\'à un lien valable', async (t) => {
  const h = await household(t);
  // Protégé : sans le mot de passe, ni liste ni code-barres
  const { share, token } = await linkTo(h, h.L.shop, { protect: true, durationHours: 2 });
  const v = visitor(h);
  const locked = await v.get(`/api/public/${token}`);
  assert.deepEqual([locked.status, locked.body], [401, { error: 'Mot de passe requis.', passwordRequired: true }]);
  assert.doesNotMatch(locked.text, /3428272950019|Lait|Boulangerie/);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: 'mauvais' })).status, 401);
  assert.equal((await v.get(`/api/public/${token}`)).status, 401);
  assert.equal((await v.post(`/api/public/${token}/acces`, { password: share.password })).status, 200);
  const open = await v.get(`/api/public/${token}`);
  assert.equal(open.status, 200);
  assert.equal(open.body.groups[0].items[0].ean, '3428272950019');
  // Expiré : la même réponse qu'un lien inconnu, cookie compris
  h.app.clock.now += 2 * HOUR;
  const expired = await v.get(`/api/public/${token}`);
  assert.deepEqual([expired.status, expired.body], [404, { error: 'Lien expiré ou inexistant.' }]);
  assert.doesNotMatch(expired.text, /3428272950019|Lait/);
  const unknown = await visitor(h, '203.0.113.40').get(`/api/public/${'A'.repeat(43)}`);
  assert.equal(unknown.text, expired.text);
});

test('aucune nouvelle route, aucune écriture : seules les routes publiques d\'avant', async (t) => {
  const route = read('server/routes/public.js');
  const declared = [...route.matchAll(/(pageRouter|apiRouter)\.(get|post|put|patch|delete)\('([^']+)'/g)].map((m) => `${m[2]} ${m[3]}`);
  assert.deepEqual(declared, ['get /:token', 'get /:token', 'post /:token/acces', 'get /:token/photos/:itemId']);
  // Le code-barres n'est lu que dans la liste blanche, jamais écrit dans un journal
  assert.match(route, /\.\.\.\(isShopping && item\.ean \? \{ ean: item\.ean \} : \{\}\),/);
  assert.doesNotMatch(route, /audit\([^)]*ean/);
  // Une écriture depuis la page publique : refusée comme toute autre route
  const h = await household(t);
  const { token } = await linkTo(h, h.L.shop);
  for (const [method, path] of [['PUT', ''], ['PATCH', ''], ['DELETE', ''], ['POST', '/items'], ['PUT', '/photos/x']]) {
    const res = await visitor(h).request(method, `/api/public/${token}${path}`, {});
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

test('fiche : chaque champ reçu est affiché, aucun champ absent', () => {
  const today = '2026-10-20';
  // Liste de courses, article à acheter : tout ce qui existe
  const lait = { name: 'Lait', quantity: '2 L', note: 'Une note\nsur deux lignes', checked: false, photo: '/api/public/x/photos/y', ean: '3428272950019' };
  assert.deepEqual(publicItemDetails(lait, { grouping: 'aisle', place: 'Crèmerie', today }), [
    { label: 'Article', text: 'Lait' },
    { label: 'État', text: 'À acheter' },
    { label: 'Quantité', text: '2 L' },
    { label: 'Note', text: 'Une note\nsur deux lignes' },
    { label: 'Code-barres', text: '3428272950019' },
    { label: 'Rayon', text: 'Crèmerie' },
  ]);
  // Rien d'autre que le nom, l'état et le rayon : pas de ligne vide
  const sel = { name: 'Sel', quantity: '', note: '', checked: true, photo: null };
  assert.deepEqual(publicItemDetails(sel, { grouping: 'aisle', place: null, today }), [
    { label: 'Article', text: 'Sel' },
    { label: 'État', text: 'Coché, dans le panier' },
    { label: 'Rayon', text: 'Sans rayon' },
  ]);
  // Liste « multi » : le magasin
  assert.deepEqual(publicItemDetails({ ...sel, name: 'Comté' }, { grouping: 'store', place: 'Fromagerie', today }).at(-1), { label: 'Magasin', text: 'Fromagerie' });
  assert.deepEqual(publicItemDetails({ ...sel, name: 'Pain' }, { grouping: 'store', place: null, today }).at(-1), { label: 'Magasin', text: 'Sans magasin' });
  // Liste de tâches : priorité et échéance seulement si envoyées (option activée)
  const vis = { name: 'Vis', quantity: '', note: '', checked: false, photo: null, priority: 'high', dueDate: '2026-10-30' };
  const rows = publicItemDetails(vis, { grouping: 'none', today });
  assert.deepEqual(rows.map((r) => r.label), ['Élément', 'État', 'Priorité', 'Échéance']);
  assert.deepEqual(rows.slice(1).map((r) => r.text), ['À faire', 'Élevée', 'ven. 30 oct.']);
  assert.deepEqual(publicItemDetails({ ...vis, priority: 'normal', dueDate: null, checked: true }, { grouping: 'none', today }).slice(1).map((r) => r.text), ['Coché, terminé', 'Normale', 'Aucune échéance']);
  const plain = { name: 'Vis', quantity: '', note: '', checked: false, photo: null };
  assert.deepEqual(publicItemDetails(plain, { grouping: 'none', today }).map((r) => r.label), ['Élément', 'État'], 'options désactivées : ni priorité ni échéance');
  // Code-barres jamais affiché s'il n'a pas été envoyé
  assert.ok(!publicItemDetails(plain, { grouping: 'aisle', today }).some((r) => r.label === 'Code-barres'));
});

test('fiche : mêmes champs que la fiche à consulter de l\'application, aucun oubli', () => {
  const app = read('public/js/screens/list.js');
  const view = app.slice(app.indexOf('function openItemView'), app.indexOf('// Feuille de choix du rayon'));
  const labels = [...view.matchAll(/value\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Quantité', 'Note', 'Priorité', 'Échéance', 'Code-barres', 'Rayon', 'Magasin']);
  const format = read('public/js/format.js');
  const details = format.slice(format.indexOf('export function publicItemDetails'), format.indexOf('export function priorityChip'));
  for (const label of labels) assert.ok(details.includes(`'${label}'`), `« ${label} » manque sur la fiche publique`);
  assert.ok(details.includes("'État'"), 'état coché écrit en toutes lettres');
  // Photo agrandissable, avec le même balisage
  const page = read('public/js/public.js');
  assert.match(page, /h\('button', \{ class: 'photo-block__thumb', type: 'button', 'aria-label': `Agrandir la photo de \$\{item\.name\}`, onClick: \(\) => showPhoto\(item\) \}/);
});

test('page publique : fiche sans champ ni bouton qui écrit, aucune requête à l\'ouverture, retour et focus', () => {
  const page = read('public/js/public.js');
  const sheet = page.slice(page.indexOf('// --- Fenêtres'), page.indexOf('// Photo en plein écran'));
  // Aucun champ, aucun bouton d'écriture, aucune requête
  assert.doesNotMatch(sheet, /h\('(input|textarea|select|form)'|Enregistrer|Supprimer|trash|disquette|camera|fetch\(|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(page.replace(/\/\/.*$/gm, ''), /innerHTML|outerHTML|insertAdjacentHTML/, 'commentaires mis à part');
  // Une seule requête de données (load) et la saisie du mot de passe : rien de plus
  assert.equal([...page.matchAll(/fetch\(/g)].length, 2);
  assert.match(page, /fetch\(apiUrl\('\/acces'\), \{\s*method: 'POST',/);
  // Retour du téléphone : chaque fenêtre ajoute une étape à l'historique
  assert.match(sheet, /history\.pushState\(/);
  assert.match(sheet, /window\.addEventListener\('popstate', \(\) => layers\.pop\(\)\?\.remove\(\)\);/);
  assert.match(sheet, /if \(layers\.at\(-1\) === layer\) history\.back\(\);/);
  // Focus rendu à la ligne touchée (jamais à un champ de saisie)
  assert.match(sheet, /if \(opener\?\.isConnected && !opener\.matches\?\.\('input, textarea'\)\) opener\.focus\(\);/);
  // La ligne est un bouton (44 px : .item__body du kit), lu « Voir … »
  assert.match(page, /h\('button', \{ class: 'item__body', type: 'button', 'aria-label': `Voir \$\{item\.name\}\$\{spokenMeta\(item\)\}`, onClick: \(\) => showItem\(item, place, thumb\) \}/);
  // Photo de la fiche : copie de la vignette déjà chargée (canvas), sans
  // nouvelle requête ; sinon, l'adresse du lien, comme avant
  assert.match(page, /if \(thumb\?\.complete && thumb\.naturalWidth\) \{\s*const canvas = h\('canvas'/);
  assert.match(page, /canvas\.getContext\('2d'\)\.drawImage\(thumb, 0, 0\);/);
  // La page publique ne passe toujours pas par le service worker
  assert.doesNotMatch(read('public/sw.js').match(/const APP_FILES = \[[\s\S]*?\];/)[0], /public\.js/);
});
