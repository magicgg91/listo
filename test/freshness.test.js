// Rechargement après une mise à jour du serveur (voir public/js/freshness.js) :
// identifiant opaque de la version (serveur), code périmé détecté, moment
// sûr, un seul rechargement automatique par version, bandeau, file d'attente
// intacte, et jamais le commit dans une ressource publique.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startTestApp, setupAdmin } from './helpers.js';
import { buildId, deriveKeys } from '../server/secrets.js';
import { isStale, reloadBlocker, createFreshness, NOTICE_MS, BUSY_TRIES } from '../public/js/freshness.js';
import { createQueue } from '../public/js/queue.js';
import { memoryLocal } from '../public/js/localdb.js';

const COMMIT = '3a1b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d';
const OTHER = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

// --- Serveur : identifiant opaque ---

test('identifiant de version : opaque, propre à l\'installation, change avec le commit', () => {
  const key = deriveKeys(crypto.randomBytes(32)).build;
  const id = buildId(key, COMMIT);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(buildId(key, COMMIT), id, 'stable pour un même commit');
  assert.notEqual(buildId(key, OTHER), id, 'change à chaque mise à jour');
  assert.notEqual(buildId(deriveKeys(crypto.randomBytes(32)).build, COMMIT), id, 'propre à chaque installation');
  assert.equal(COMMIT.includes(id), false);
  assert.equal(id.includes(COMMIT.slice(0, 7)), false);
});

test('GET /api/about : donne l\'identifiant (comptes connectés) ; null en développement', async (t) => {
  const app = await startTestApp(t, { config: { commit: COMMIT } });
  assert.equal((await app.client().get('/api/about')).status, 401);
  const admin = await setupAdmin(app);
  const { build } = (await admin.get('/api/about')).body;
  assert.equal(build, buildId(app.ctx.keys.build, COMMIT));

  const dev = await startTestApp(t, { config: { commit: null } });
  const devAdmin = await setupAdmin(dev);
  assert.deepEqual((await devAdmin.get('/api/about')).body, { commit: 'non précisé', build: null });
});

test('sw.js et js/version.js portent l\'identifiant de la version, revalidés à chaque chargement', async (t) => {
  const app = await startTestApp(t, { config: { commit: COMMIT } });
  const build = buildId(app.ctx.keys.build, COMMIT);
  for (const [url, line] of [['/sw.js', `const BUILD = "${build}";`], ['/js/version.js', `export const BUILD = "${build}";`]]) {
    const res = await fetch(`${app.base}${url}`);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get('cache-control'), 'no-cache', url);
    assert.match(res.headers.get('content-type'), /javascript/, url);
    const text = await res.text();
    assert.ok(text.includes(line), url);
    // Le reste du fichier est celui du dépôt
    const file = fs.readFileSync(path.join(PUBLIC, url), 'utf8');
    assert.equal(text, file.replace(line.replace(`"${build}"`, 'null'), line), url);
  }
  // En développement : fichiers du dépôt, tels quels
  const dev = await startTestApp(t, { config: { commit: null } });
  assert.equal(await (await fetch(`${dev.base}/sw.js`)).text(), fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8'));
  assert.equal(await (await fetch(`${dev.base}/js/version.js`)).text(), fs.readFileSync(path.join(PUBLIC, 'js/version.js'), 'utf8'));
});

// Tous les fichiers servis sans compte
function filesIn(dir, base = '') {
  return fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${base}/${entry.name}`;
    return entry.isDirectory() ? filesIn(dir, rel) : [rel];
  });
}

test('aucune ressource publique ne contient le commit (fichiers, /healthz, lien public, erreurs)', async (t) => {
  const app = await startTestApp(t, { config: { commit: COMMIT } });
  const urls = ['/', '/healthz', '/connexion', '/inconnue', `/p/${'A'.repeat(43)}`, `/api/public/${'A'.repeat(43)}`, '/api/setup', '/api/about', ...filesIn(PUBLIC)];
  for (const url of urls) {
    const res = await fetch(`${app.base}${url}`, { headers: { origin: 'http://listo.test' } });
    const body = Buffer.from(await res.arrayBuffer()).toString('latin1');
    const headers = JSON.stringify([...res.headers]);
    for (const piece of [COMMIT, COMMIT.slice(0, 7)]) {
      assert.equal(body.includes(piece), false, `${url} contient le commit`);
      assert.equal(headers.includes(piece), false, `${url} : en-têtes`);
    }
  }
});

// --- Téléphone : logique (fausses fonctions à la place du navigateur) ---

test('code périmé seulement si les deux identifiants sont connus et différents', () => {
  assert.equal(isStale('aaaa', 'bbbb'), true);
  assert.equal(isStale('aaaa', 'aaaa'), false);
  assert.equal(isStale(null, 'bbbb'), false, 'développement : rien');
  assert.equal(isStale('aaaa', null), false);
  assert.equal(isStale('aaaa', undefined), false);
  assert.equal(isStale('', 'bbbb'), false);
});

// Faux document : champs (valeur, valeur de départ), focus, fenêtre ouverte
function fakeDocument({ fields = [], active = null, scrim = false } = {}) {
  const field = ({ tag = 'input', type = 'text', value = '', defaultValue = '' }) => ({
    type, value, defaultValue, matches: (selector) => selector === tag,
  });
  const all = fields.map(field);
  return {
    activeElement: active === null ? null : all[active],
    querySelector: (selector) => (selector === '.scrim' && scrim ? {} : null),
    querySelectorAll: () => all,
  };
}

test('moment sûr : pas de fenêtre ouverte, pas de saisie en cours, pas d\'envoi', () => {
  assert.equal(reloadBlocker(fakeDocument()), null);
  assert.equal(reloadBlocker(fakeDocument({ fields: [{ value: '' }, { value: 'Lait', defaultValue: 'Lait' }] })), null, 'champs inchangés');
  assert.equal(reloadBlocker(fakeDocument({ fields: [{ value: 'Tom' }] })), 'saisie', 'texte pas encore validé');
  assert.equal(reloadBlocker(fakeDocument({ fields: [{ tag: 'textarea', value: 'note', defaultValue: '' }] })), 'saisie');
  assert.equal(reloadBlocker(fakeDocument({ fields: [{ value: '' }], active: 0 })), 'saisie', 'curseur dans un champ');
  assert.equal(reloadBlocker(fakeDocument({ fields: [{ type: 'checkbox', value: 'on', defaultValue: '' }], active: 0 })), null, 'case à cocher : pas une saisie');
  assert.equal(reloadBlocker(fakeDocument({ scrim: true })), 'fenetre');
  assert.equal(reloadBlocker(fakeDocument(), { busy: true }), 'envoi');
});

// Téléphone simulé : tout ce que freshness.js demande à app.js
function fakePhone({ local = 'ancien', server = 'nouveau', storage = new Map(), online = true } = {}) {
  const phone = {
    server,
    online,
    blocked: null,
    reloads: 0,
    workerUpdates: 0,
    notices: [],
    banners: 0,
    logs: [],
    waits: [],
  };
  const store = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  };
  phone.storage = storage;
  phone.freshness = createFreshness({
    localBuild: local,
    serverBuild: async () => {
      if (!phone.online) throw new Error('pas de réseau');
      return phone.server;
    },
    blocker: () => (typeof phone.blocked === 'function' ? phone.blocked() : phone.blocked),
    updateWorker: async () => { phone.workerUpdates += 1; },
    reload: () => { phone.reloads += 1; },
    notify: (text) => phone.notices.push(text),
    showBanner: () => { phone.banners += 1; },
    storage: store,
    isOnline: () => phone.online,
    wait: async (ms) => { phone.waits.push(ms); },
    log: (text) => phone.logs.push(text),
  });
  return phone;
}

test('même identifiant : rien ; identifiant différent : nouveau service worker, message, rechargement', async () => {
  const same = fakePhone({ local: 'v1', server: 'v1' });
  await same.freshness.check();
  assert.equal(same.reloads + same.workerUpdates + same.banners, 0);

  const phone = fakePhone({ local: 'v1', server: 'v2' });
  await phone.freshness.check();
  assert.equal(phone.workerUpdates, 1, 'nouveau sw.js demandé et attendu avant de recharger');
  assert.deepEqual(phone.notices, ['Mise à jour de Listo…']);
  assert.deepEqual(phone.waits, [NOTICE_MS]);
  assert.equal(phone.reloads, 1);
  assert.equal(phone.banners, 0);
});

test('rechargement différé tant qu\'un champ contient du texte, puis fait au changement d\'écran', async () => {
  const phone = fakePhone();
  phone.blocked = 'saisie';
  await phone.freshness.check();
  assert.equal(phone.reloads, 0);
  assert.equal(phone.banners, 1, 'bandeau « Nouvelle version disponible »');
  await phone.freshness.retry(); // toujours en saisie
  assert.equal(phone.reloads, 0);
  phone.blocked = null; // texte validé, autre écran
  await phone.freshness.retry();
  assert.equal(phone.reloads, 1);
  assert.equal(phone.workerUpdates, 1, 'le service worker n\'est demandé qu\'une fois');
});

test('rechargement différé tant qu\'une fenêtre est ouverte, puis fait au retour au premier plan', async () => {
  const phone = fakePhone();
  phone.blocked = 'fenetre';
  await phone.freshness.check();
  assert.equal(phone.reloads, 0);
  assert.equal(phone.banners, 1);
  phone.blocked = null;
  await phone.freshness.check(); // retour au premier plan
  assert.equal(phone.reloads, 1);
});

test('envoi en cours (photo, lot d\'opérations) : attendu, puis rechargement ; trop long : bandeau', async () => {
  const phone = fakePhone();
  let calls = 0;
  phone.blocked = () => (++calls <= 3 ? 'envoi' : null); // l'envoi se termine
  await phone.freshness.check();
  assert.equal(phone.reloads, 1);
  assert.equal(phone.banners, 0);

  const slow = fakePhone();
  slow.blocked = 'envoi';
  await slow.freshness.check();
  assert.equal(slow.reloads, 0);
  assert.equal(slow.banners, 1);
  assert.equal(slow.waits.length, BUSY_TRIES);
  slow.blocked = null;
  await slow.freshness.retry();
  assert.equal(slow.reloads, 1);
});

test('fenêtre ouverte ou champ touché pendant le message « Mise à jour de Listo… » : pas de rechargement', async () => {
  const phone = fakePhone();
  let calls = 0;
  phone.blocked = () => (++calls === 1 ? null : 'saisie');
  await phone.freshness.check();
  assert.equal(phone.reloads, 0);
  assert.equal(phone.banners, 1);
  assert.equal(phone.storage.size, 0, 'pas compté comme rechargement');
});

test('un seul rechargement automatique par version ; toujours périmé après : bandeau et console', async () => {
  const storage = new Map(); // sessionStorage de l'onglet, gardé au rechargement
  const first = fakePhone({ storage });
  await first.freshness.check();
  assert.equal(first.reloads, 1);

  // Page rechargée, mais toujours l'ancien code (copie restée en cache…)
  const second = fakePhone({ storage });
  await second.freshness.check();
  await second.freshness.retry();
  await second.freshness.check();
  assert.equal(second.reloads, 0, 'pas de boucle');
  assert.ok(second.banners >= 1);
  assert.equal(second.logs.length, 1, 'une ligne dans la console');
  // Le bouton « Recharger » reste possible (choix de l'utilisateur)
  second.freshness.reloadNow();
  assert.equal(second.reloads, 1);

  // Version suivante : de nouveau un rechargement automatique
  const third = fakePhone({ storage, server: 'encore-plus-recent' });
  await third.freshness.check();
  assert.equal(third.reloads, 1);
});

test('mémoire de session indisponible : jamais de rechargement automatique (pas de boucle possible)', async () => {
  const broken = { getItem: () => { throw new Error('refusé'); }, setItem: () => { throw new Error('refusé'); } };
  const phone = fakePhone();
  const freshness = createFreshness({
    localBuild: 'v1', serverBuild: async () => 'v2', blocker: () => null, updateWorker: async () => {},
    reload: () => { phone.reloads += 1; }, notify: () => {}, showBanner: () => { phone.banners += 1; },
    storage: broken, wait: async () => {},
  });
  await freshness.check();
  assert.equal(phone.reloads, 0);
  assert.equal(phone.banners, 1);
  // Sans aucun stockage (null) : pareil
  const none = createFreshness({
    localBuild: 'v1', serverBuild: async () => 'v2', blocker: () => null, updateWorker: async () => {},
    reload: () => { phone.reloads += 1; }, notify: () => {}, showBanner: () => {}, storage: null, wait: async () => {},
  });
  await none.check();
  assert.equal(phone.reloads, 0);
});

test('hors ligne, serveur injoignable, développement : rien, sans erreur', async () => {
  const offline = fakePhone({ online: false });
  await offline.freshness.check();
  assert.equal(offline.reloads + offline.banners + offline.workerUpdates, 0);

  const down = fakePhone();
  down.online = true;
  const freshness = createFreshness({
    localBuild: 'v1', serverBuild: async () => { throw new Error('502'); }, blocker: () => null,
    updateWorker: async () => { down.workerUpdates += 1; }, reload: () => { down.reloads += 1; },
    notify: () => {}, showBanner: () => {}, storage: { getItem: () => null, setItem: () => {} },
  });
  await freshness.check();
  assert.equal(down.reloads + down.workerUpdates, 0);

  const dev = fakePhone({ local: null });
  await dev.freshness.check();
  assert.equal(dev.reloads + dev.banners + dev.workerUpdates, 0);
});

test('file d\'attente hors ligne : intacte après un rechargement de mise à jour', async () => {
  // File d'un téléphone sans réseau : deux modifications en attente
  const storage = memoryLocal();
  const offline = { sendOps: async () => { throw Object.assign(new Error('réseau'), { status: undefined }); }, putPhoto: async () => {}, deletePhoto: async () => {} };
  const timers = { setTimeout: () => 0, clearTimeout: () => {} };
  const queue = createQueue({ storage, transport: offline, timers });
  await queue.load();
  await queue.add({ kind: 'op', op: { id: crypto.randomUUID(), type: 'item.create', listId: crypto.randomUUID(), itemId: crypto.randomUUID(), name: 'Pain' } });
  await queue.add({ kind: 'op', op: { id: crypto.randomUUID(), type: 'item.check', itemId: crypto.randomUUID(), checked: true } });
  await queue.flush(); // échoue : pas de réseau
  assert.equal(queue.count(), 2);

  // Mise à jour détectée, moment sûr (file au repos) : rechargement
  const phone = fakePhone();
  phone.blocked = () => reloadBlocker(fakeDocument(), { busy: queue.busy() });
  await phone.freshness.check();
  assert.equal(phone.reloads, 1);

  // Après le rechargement, la file est relue depuis le stockage du téléphone
  const after = createQueue({ storage, transport: offline, timers });
  await after.load();
  assert.equal(after.count(), 2);
  assert.deepEqual(after.entries().map((entry) => entry.op.type), ['item.create', 'item.check']);
});
