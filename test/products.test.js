// Mode scan (listes de courses) : code-barres, recherche du nom du produit
// dans Open Food Facts (simulé : aucun appel réseau réel), route
// POST /api/lists/:id/products, droits, débit, cache, interrupteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import {
  normalizeBarcode, hasValidCheckDigit, isStoreCode, cleanText, shorten, productFrom, userAgent, fetchProduct,
  createProductLookup, OFF_ORIGIN, OFF_FIELDS, FOUND_MS, UNKNOWN_MS, CACHE_MAX,
} from '../server/products.js';
import { loadConfig, validContact } from '../server/config.js';
import * as client from '../public/js/barcode.js';

const uuid = () => crypto.randomUUID();
const DAY = 24 * 60 * 60 * 1000;

// --- Code-barres : clé de contrôle, longueurs, UPC-A ---

const VALID = [
  ['3017620422003', '3017620422003'], // EAN-13
  ['4006381333931', '4006381333931'], // EAN-13
  ['96385074', '96385074'],           // EAN-8
  ['40123455', '40123455'],           // EAN-8
  ['012345678905', '0012345678905'],  // UPC-A → EAN-13 (un 0 devant)
  ['036000291452', '0036000291452'],  // UPC-A
];
const INVALID = [
  '3017620422004',   // mauvaise clé
  '96385075',        // mauvaise clé (EAN-8)
  '012345678906',    // mauvaise clé (UPC-A)
  '1234567',         // trop court
  '123456789',       // 9 chiffres
  '12345678901',     // 11 chiffres
  '30176204220031',  // 14 chiffres
  '30176204220O3',   // lettre O
  'abcdefgh',
  '',
  ' 3017620422003',  // espace (le serveur n'accepte que des chiffres)
  '3017620422003\n',
  '-3017620422003',
];

test('code-barres : clé de contrôle EAN et longueurs (serveur et téléphone, mêmes règles)', () => {
  for (const [code, normalized] of VALID) {
    assert.equal(normalizeBarcode(code), normalized, code);
    assert.equal(client.normalizeBarcode(code), normalized, `téléphone : ${code}`);
    assert.equal(hasValidCheckDigit(normalized), true);
  }
  for (const code of INVALID) assert.equal(normalizeBarcode(code), null, JSON.stringify(code));
  for (const value of [undefined, null, 3017620422003, ['3017620422003'], { code: '3017620422003' }]) {
    assert.equal(normalizeBarcode(value), null, JSON.stringify(value));
  }
  // Téléphone : espaces et tirets tapés à la main ignorés ; messages clairs
  assert.equal(client.normalizeBarcode('3 017620 422003'), '3017620422003');
  assert.equal(client.normalizeBarcode('9638-5074'), '96385074');
  assert.equal(client.barcodeProblem(''), 'Tapez les chiffres sous le code-barres.');
  assert.equal(client.barcodeProblem('30176A0422003'), 'Seulement des chiffres, sans lettre.');
  assert.equal(client.barcodeProblem('1234567'), 'Le code a 8, 12 ou 13 chiffres.');
  assert.equal(client.barcodeProblem('3017620422004'), 'Ce code ne semble pas valable : vérifiez les chiffres.');
  assert.equal(client.barcodeProblem('3017620422003'), null);
});

test('code-barres : codes « en 2 » (propres à un magasin) repérés', () => {
  assert.equal(isStoreCode('2001234567893'), true);   // EAN-13 commençant par 2
  assert.equal(isStoreCode(normalizeBarcode('212345678909')), true); // UPC-A commençant par 2 → 02…
  assert.equal(isStoreCode('20123451'), true);        // EAN-8 commençant par 2
  assert.equal(isStoreCode('3017620422003'), false);
  assert.equal(isStoreCode('0012345678905'), false);
  assert.equal(isStoreCode('96385074'), false);
});

test('photo : essais de lecture (image entière, centre, réduite), jamais agrandie', () => {
  const big = client.scanAttempts(4000, 3000);
  // Image entière, centre, quatre coins (code en bas ou sur un côté), réduite
  assert.deepEqual(big.map((a) => [a.dw, a.dh]), [[1600, 1200], [1200, 900], [1200, 900], [1200, 900], [1200, 900], [1200, 900], [800, 600]]);
  assert.deepEqual(big[1], { sx: 800, sy: 600, sw: 2400, sh: 1800, dw: 1200, dh: 900 });
  assert.deepEqual(big.slice(2, 6).map((a) => [a.sx, a.sy, a.sw, a.sh]), [[0, 0, 2200, 1650], [1800, 0, 2200, 1650], [0, 1350, 2200, 1650], [1800, 1350, 2200, 1650]]);
  // Petite photo : pas d'agrandissement, essais en double retirés
  const small = client.scanAttempts(640, 480);
  assert.deepEqual(small.map((a) => [a.sw, a.dw, a.dh]), [[640, 640, 480], [384, 384, 288]]);
});

// --- Réponse d'Open Food Facts : analyse tolérante ---

test('nom du produit : nettoyé (invisibles, contrôles), raccourci entre deux mots', () => {
  assert.equal(cleanText('  Lait\u200b demi\u00ad-écrémé\u202e \n\t bio  '), 'Lait demi-écrémé bio');
  assert.equal(cleanText('Cre\u0300me fraîche'), 'Crème fraîche'); // forme NFC (accent combiné)
  assert.equal(cleanText(42), '');
  assert.equal(cleanText(null), '');
  const long = 'Pâte à tartiner aux noisettes et au cacao maigre sans huile de palme, pot familial';
  const short = shorten(long, 60);
  assert.ok(short.length <= 60);
  assert.equal(short, 'Pâte à tartiner aux noisettes et au cacao maigre sans huile');
  assert.equal(shorten('Court', 60), 'Court');
  // Pas d'espace utile : coupe nette
  assert.equal(shorten('A'.repeat(80), 60), 'A'.repeat(60));
  // Ponctuation qui traîne retirée
  assert.equal(shorten('Biscuits fourrés, chocolat noir et lait, paquet', 41), 'Biscuits fourrés, chocolat noir et lait');
});

// Réponses d'exemple, d'après la documentation de l'API v3
// (docs/api/ref/api-v3.yaml du dépôt openfoodfacts-server)
const V3_FOUND = {
  code: '3017620422003',
  product: { product_name_fr: 'Pâte à tartiner aux noisettes et au cacao', product_name: 'Nutella', generic_name: 'Pâte à tartiner', brands: 'Ferrero,Nutella', quantity: '400 g' },
  result: { id: 'product_found', name: 'Product found', lc_name: 'Produit trouvé' },
  status: 'success',
};
const V3_NOT_FOUND = {
  code: '5449000000996',
  errors: [{ message: { id: 'product_not_found' }, field: { id: 'code', value: '5449000000996' }, impact: { id: 'failure' } }],
  result: { id: 'product_not_found', name: 'Product not found', lc_name: 'Produit non trouvé' },
  status: 'failure',
};

test('réponse v3 : règle du nom (product_name_fr, puis product_name, puis generic_name)', () => {
  assert.deepEqual(productFrom(V3_FOUND), { found: true, name: 'Pâte à tartiner aux noisettes et au cacao', brand: 'Ferrero', quantity: '400 g' });
  const without = (fields) => ({ ...V3_FOUND, product: { ...V3_FOUND.product, ...fields } });
  assert.equal(productFrom(without({ product_name_fr: undefined })).name, 'Nutella');
  assert.equal(productFrom(without({ product_name_fr: '   ' })).name, 'Nutella');
  assert.equal(productFrom(without({ product_name_fr: '', product_name: '' })).name, 'Pâte à tartiner');
  assert.deepEqual(productFrom(without({ product_name_fr: '', product_name: '', generic_name: '' })), { found: false });
  // Champs absents, vides ou d'un autre type : jamais d'erreur
  assert.deepEqual(productFrom({ status: 'success', product: { product_name: 'Pain de mie' } }), { found: true, name: 'Pain de mie', brand: '', quantity: '' });
  assert.deepEqual(productFrom({ status: 'success', product: { product_name: 'Café', brands: ['Carte Noire', 'Lavazza'], quantity: 250 } }), { found: true, name: 'Café', brand: 'Carte Noire', quantity: '' });
  assert.deepEqual(productFrom({ status: 'success_with_warnings', product: { product_name: { fr: 'x' }, generic_name: 'Thé vert' } }), { found: true, name: 'Thé vert', brand: '', quantity: '' });
});

test('réponse v3 : produit non trouvé, réponse inattendue', () => {
  assert.deepEqual(productFrom(V3_NOT_FOUND), { found: false });
  assert.deepEqual(productFrom({ status: 'failure', product: V3_FOUND.product }), { found: false });
  assert.deepEqual(productFrom({ status: 'success' }), { found: false });           // pas de produit
  assert.deepEqual(productFrom({ status: 'success', product: 'Nutella' }), { found: false });
  assert.deepEqual(productFrom({ status: 0, status_verbose: 'product not found' }), { found: false }); // ancienne forme
  for (const data of [null, undefined, 'texte', 42, [], [V3_FOUND]]) assert.equal(productFrom(data), null, JSON.stringify(data));
});

// --- Demande à Open Food Facts (fetch simulé) ---

// Fausse réponse HTTP ; body : texte (lu par morceaux) ; url : adresse finale
function fakeResponse(status, body = '', { headers = {}, url = '' } = {}) {
  const bytes = Buffer.from(body);
  return {
    status,
    url,
    headers: new Headers(headers),
    body: new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 1000) controller.enqueue(new Uint8Array(bytes.subarray(i, i + 1000)));
        controller.close();
      },
    }),
  };
}

test('demande : adresse fixe, champs limités, User-Agent, aucune redirection ni cookie', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return fakeResponse(200, JSON.stringify(V3_FOUND), { url });
  };
  const data = await fetchProduct('3017620422003', { fetchImpl, agent: userAgent(null, '0.1.0') });
  assert.deepEqual(data, V3_FOUND);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, OFF_ORIGIN);
  assert.equal(OFF_ORIGIN, 'https://world.openfoodfacts.org');
  assert.equal(url.pathname, '/api/v3/product/3017620422003');
  assert.equal(url.searchParams.get('fields'), 'code,product_name,product_name_fr,generic_name,brands,quantity');
  assert.equal(OFF_FIELDS, url.searchParams.get('fields'));
  assert.equal([...url.searchParams.keys()].length, 1); // ni pays ni langue
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.deepEqual(calls[0].options.headers, { 'User-Agent': 'Listo/0.1.0 (+https://github.com/magicgg91/listo)', Accept: 'application/json' });
  // Un code non validé n'entre jamais dans l'adresse : aucune demande
  for (const code of ['../admin', '3017620422003?x=1', '30176204220', '']) {
    await assert.rejects(fetchProduct(code, { fetchImpl }), /code invalide/);
  }
  assert.equal(calls.length, 1);
});

test('demande : 404 et redirection (produit non alimentaire) → inconnu ; autres réponses → erreur', async () => {
  const answer = (res) => () => Promise.resolve(res);
  assert.deepEqual(await fetchProduct('5449000000996', { fetchImpl: answer(fakeResponse(404, JSON.stringify(V3_NOT_FOUND))) }), { notFound: true });
  // Redirection vers Open Beauty Facts : jamais suivie
  const redirect = fakeResponse(302, '', { headers: { location: 'https://world.openbeautyfacts.org/api/v3/product/3600523351480' } });
  assert.deepEqual(await fetchProduct('3600523351480', { fetchImpl: answer(redirect) }), { notFound: true });
  await assert.rejects(fetchProduct('3017620422003', { fetchImpl: answer(fakeResponse(500, 'panne')) }), /réponse HTTP 500/);
  await assert.rejects(fetchProduct('3017620422003', { fetchImpl: answer(fakeResponse(503, '')) }), /réponse HTTP 503/);
  // Réponse venue d'un autre site (redirection suivie malgré tout)
  await assert.rejects(fetchProduct('3017620422003', { fetchImpl: answer(fakeResponse(200, '{}', { url: 'https://exemple.org/x' })) }), /autre site/);
  // JSON invalide
  await assert.rejects(fetchProduct('3017620422003', { fetchImpl: answer(fakeResponse(200, '<html>')) }));
});

test('demande : taille limitée à 32 ko, délai de 5 s', async () => {
  const big = JSON.stringify({ ...V3_FOUND, padding: 'x'.repeat(40 * 1024) });
  await assert.rejects(fetchProduct('3017620422003', { fetchImpl: async () => fakeResponse(200, big) }), /trop grande/);
  // Taille annoncée trop grande : refus sans lire
  await assert.rejects(fetchProduct('3017620422003', { fetchImpl: async () => fakeResponse(200, '{}', { headers: { 'content-length': String(1024 * 1024) } }) }), /trop grande/);
  // Juste sous la limite : accepté
  const fits = JSON.stringify({ ...V3_FOUND, padding: 'x'.repeat(30 * 1024) });
  assert.equal((await fetchProduct('3017620422003', { fetchImpl: async () => fakeResponse(200, fits) })).code, '3017620422003');
  // Service muet : abandon au bout du délai
  const silent = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assert.rejects(fetchProduct('3017620422003', { fetchImpl: silent, timeoutMs: 50 }), /délai dépassé/);
});

test('User-Agent : version de package.json, contact facultatif (LISTO_PRODUCT_CONTACT)', () => {
  assert.match(userAgent(), /^Listo\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/magicgg91\/listo\)$/);
  assert.equal(userAgent('listo@exemple.fr', '1.2.3'), 'Listo/1.2.3 (+https://github.com/magicgg91/listo; listo@exemple.fr)');
  assert.equal(loadConfig({}).productContact, null);
  assert.equal(loadConfig({ LISTO_PRODUCT_CONTACT: ' https://exemple.fr/contact ' }).productContact, 'https://exemple.fr/contact');
  // Rien qui puisse casser l'en-tête
  for (const bad of ['a\r\nX-Injecte: 1', 'nom (commentaire)', 'a;b', 'é@exemple.fr', 'x'.repeat(101), '']) {
    assert.equal(validContact(bad), null, JSON.stringify(bad));
  }
  assert.equal(loadConfig({}).productLookup, true);
  assert.equal(loadConfig({ LISTO_PRODUCT_LOOKUP: ' OFF ' }).productLookup, false);
});

// --- Service : cache, limites, pannes ---

function lookupWith({ config = {}, answers = {} } = {}) {
  const clock = { now: Date.UTC(2026, 9, 18, 12) };
  const asked = [];
  const logs = [];
  const service = createProductLookup({
    config: { productLookup: true, productContact: null, ...config },
    now: () => clock.now,
    log: (line) => logs.push(line),
    request: async (code, options) => {
      asked.push({ code, options });
      const answer = answers[code] ?? { notFound: true };
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  return { service, clock, asked, logs };
}

test('cache : produit trouvé gardé 7 jours, inconnu 1 jour, panne jamais gardée', async () => {
  const { service, clock, asked } = lookupWith({ answers: { '3017620422003': V3_FOUND, '4006381333931': new Error('délai dépassé') } });
  const found = await service.lookup('3017620422003');
  // Réponse construite champ par champ
  assert.deepEqual(found, { status: 'found', name: 'Pâte à tartiner aux noisettes et au cacao', brand: 'Ferrero', quantity: '400 g' });
  assert.deepEqual(await service.lookup('3017620422003'), found);
  assert.equal(asked.length, 1);
  clock.now += FOUND_MS - 1000;
  await service.lookup('3017620422003');
  assert.equal(asked.length, 1);
  clock.now += 2000;
  await service.lookup('3017620422003');
  assert.equal(asked.length, 2, 'redemandé après 7 jours');

  assert.deepEqual(await service.lookup('5449000000996'), { status: 'unknown' });
  await service.lookup('5449000000996');
  assert.equal(asked.length, 3);
  clock.now += UNKNOWN_MS + 1000;
  await service.lookup('5449000000996');
  assert.equal(asked.length, 4, 'inconnu redemandé après 1 jour');

  assert.deepEqual(await service.lookup('4006381333931'), { status: 'unavailable' });
  assert.deepEqual(await service.lookup('4006381333931'), { status: 'unavailable' });
  assert.equal(asked.length, 6, 'une panne n\'est pas gardée');
  // Le contact (vide ici) est passé à la demande
  assert.equal(asked[0].options.agent, userAgent(null));
});

test('cache : 500 produits au plus, les plus anciens partent', async () => {
  const { service, clock, asked } = lookupWith();
  // Codes EAN-8 valides fabriqués (clé calculée)
  const codes = [];
  for (let n = 3000000; codes.length < CACHE_MAX + 5; n += 1) {
    for (let key = 0; key < 10; key += 1) if (normalizeBarcode(`${n}${key}`)) codes.push(`${n}${key}`);
  }
  // 7 secondes entre deux demandes : la limite de 10 par minute n'est pas atteinte
  for (const code of codes) {
    await service.lookup(code);
    clock.now += 7000;
  }
  assert.equal(service.cacheSize(), CACHE_MAX);
  const before = asked.length;
  await service.lookup(codes.at(-1));
  assert.equal(asked.length, before, 'le plus récent est gardé');
  await service.lookup(codes[0]);
  assert.equal(asked.length, before + 1, 'le plus ancien est reparti');
});

test('limite : 10 demandes par minute au total vers Open Food Facts', async () => {
  const { service, clock, asked } = lookupWith();
  const codes = [];
  for (let n = 3100000; codes.length < 12; n += 1) for (let key = 0; key < 10; key += 1) if (normalizeBarcode(`${n}${key}`)) codes.push(`${n}${key}`);
  for (const code of codes.slice(0, 10)) assert.deepEqual(await service.lookup(code), { status: 'unknown' });
  assert.deepEqual(await service.lookup(codes[10]), { status: 'unavailable' });
  assert.equal(asked.length, 10);
  // Un produit déjà gardé reste servi (pas de demande)
  assert.deepEqual(await service.lookup(codes[0]), { status: 'unknown' });
  clock.now += 61 * 1000;
  assert.deepEqual(await service.lookup(codes[10]), { status: 'unknown' });
  assert.equal(asked.length, 11);
});

test('codes « en 2 », interrupteur, demandes simultanées, journaux sans code ni nom', async () => {
  const { service, asked, logs } = lookupWith({ answers: { '3017620422003': V3_FOUND, '4006381333931': new Error('réponse HTTP 503') } });
  assert.deepEqual(await service.lookup('2001234567893'), { status: 'unknown' });
  assert.equal(asked.length, 0, 'un code de magasin n\'est jamais demandé');
  // Deux demandes simultanées du même code : une seule part
  const [a, b] = await Promise.all([service.lookup('3017620422003'), service.lookup('3017620422003')]);
  assert.deepEqual(a, b);
  assert.equal(asked.length, 1);
  await service.lookup('4006381333931');
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs.join('\n'), /4006381333931|3017620422003|Nutella|tartiner/);

  const off = lookupWith({ config: { productLookup: false } });
  assert.equal(off.service.enabled(), false);
  assert.deepEqual(await off.service.lookup('3017620422003'), { status: 'unavailable' });
  assert.equal(off.asked.length, 0);
});

// --- Route POST /api/lists/:id/products ---

async function shoppingSetup(t, options = {}) {
  const asked = [];
  const app = await startTestApp(t, {
    ...options,
    productRequest: async (code) => {
      asked.push(code);
      if (code === '3017620422003') return V3_FOUND;
      if (code === '4006381333931') throw new Error('délai dépassé');
      return { notFound: true };
    },
  });
  const guillaume = await setupAdmin(app);
  const shop = uuid();
  const tasks = uuid();
  await guillaume.post('/api/ops', { ops: [
    { id: uuid(), type: 'list.create', listId: shop, name: 'Courses', categoryId: 1 },
    { id: uuid(), type: 'list.create', listId: tasks, name: 'Maison', categoryId: 2 },
  ] });
  return { app, guillaume, shop, tasks, asked };
}

test('route : produit trouvé, réponse champ par champ, jamais gardée en cache', async (t) => {
  const { guillaume, shop, asked } = await shoppingSetup(t);
  const res = await guillaume.post(`/api/lists/${shop}/products`, { code: '3017620422003' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'found', name: 'Pâte à tartiner aux noisettes et au cacao', brand: 'Ferrero', quantity: '400 g' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  // UPC-A : normalisé avant la recherche et le cache (une seule demande)
  await guillaume.post(`/api/lists/${shop}/products`, { code: '012345678905' });
  await guillaume.post(`/api/lists/${shop}/products`, { code: '0012345678905' });
  assert.deepEqual(asked, ['3017620422003', '0012345678905']);
  // Inconnu, panne : jamais d'erreur
  assert.deepEqual((await guillaume.post(`/api/lists/${shop}/products`, { code: '5449000000996' })).body, { status: 'unknown' });
  assert.deepEqual((await guillaume.post(`/api/lists/${shop}/products`, { code: '4006381333931' })).body, { status: 'unavailable' });
  assert.deepEqual((await guillaume.post(`/api/lists/${shop}/products`, { code: '2001234567893' })).body, { status: 'unknown' });
});

test('route : code invalide refusé sans demande sortante', async (t) => {
  const { guillaume, shop, asked } = await shoppingSetup(t);
  for (const code of ['3017620422004', '1234567', 'abc', '', 3017620422003, null, ['3017620422003'], ' 3017620422003']) {
    const res = await guillaume.post(`/api/lists/${shop}/products`, { code });
    assert.equal(res.status, 400, JSON.stringify(code));
    assert.equal(res.body.error, 'Code-barres invalide.');
  }
  assert.equal((await guillaume.post(`/api/lists/${shop}/products`, {})).status, 400);
  assert.deepEqual(asked, []);
});

test('route : droits (401 sans compte, 404 non-membre, 404 liste autre que les courses)', async (t) => {
  const { app, guillaume, shop, tasks, asked } = await shoppingSetup(t);
  // Visiteur sans compte (y compris un visiteur du lien public)
  const anonymous = app.client();
  assert.equal((await anonymous.post(`/api/lists/${shop}/products`, { code: '3017620422003' })).status, 401);
  // Compte qui n'est pas membre de la liste
  await addUser(app.db, { username: 'marie', password: 'MotDePasseMarie!' });
  const marie = app.client();
  await login(marie, 'marie', 'MotDePasseMarie!');
  const notMember = await marie.post(`/api/lists/${shop}/products`, { code: '3017620422003' });
  assert.equal(notMember.status, 404);
  assert.equal((await marie.post(`/api/lists/${uuid()}/products`, { code: '3017620422003' })).status, 404);
  // Liste de tâches : pas de scan
  const taskList = await guillaume.post(`/api/lists/${tasks}/products`, { code: '3017620422003' });
  assert.equal(taskList.status, 404);
  assert.equal(taskList.body.error, 'Le scan existe seulement dans les listes de courses.');
  assert.deepEqual(asked, []);
  // Membre invité : peut scanner
  const marieId = app.db.prepare("SELECT id FROM users WHERE username = 'marie'").pluck().get();
  await guillaume.request('PUT', `/api/lists/${shop}/members`, { userIds: [marieId] });
  assert.equal((await marie.post(`/api/lists/${shop}/products`, { code: '3017620422003' })).body.status, 'found');
  // Aucune route publique pour le scan
  assert.equal((await anonymous.post('/api/public/products', { code: '3017620422003' })).status, 404);
});

test('route : 30 recherches par minute et par compte', async (t) => {
  const { app, guillaume, shop } = await shoppingSetup(t);
  for (let i = 0; i < 30; i += 1) assert.equal((await guillaume.post(`/api/lists/${shop}/products`, { code: '3017620422003' })).status, 200);
  const blocked = await guillaume.post(`/api/lists/${shop}/products`, { code: '3017620422003' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'Trop de recherches. Réessayez dans une minute.');
  app.clock.now += 61 * 1000;
  assert.equal((await guillaume.post(`/api/lists/${shop}/products`, { code: '3017620422003' })).status, 200);
});

test('route : interrupteur LISTO_PRODUCT_LOOKUP=off (aucune demande, bouton masqué)', async (t) => {
  const { guillaume, shop, asked } = await shoppingSetup(t, { config: { productLookup: false } });
  assert.deepEqual((await guillaume.post(`/api/lists/${shop}/products`, { code: '3017620422003' })).body, { status: 'disabled' });
  assert.deepEqual(asked, []);
  // Le téléphone l'apprend avec son compte
  assert.equal((await guillaume.get('/api/me')).body.user.productLookup, false);
});

test('route : ni le code ni le nom dans les journaux', async (t) => {
  const lines = [];
  for (const method of ['log', 'warn', 'error', 'info']) t.mock.method(console, method, (...args) => lines.push(args.join(' ')));
  const { app, guillaume, shop } = await shoppingSetup(t);
  await guillaume.post(`/api/lists/${shop}/products`, { code: '3017620422003' });
  await guillaume.post(`/api/lists/${shop}/products`, { code: '4006381333931' });
  const all = [...lines, ...app.logs].join('\n');
  assert.doesNotMatch(all, /3017620422003|4006381333931|tartiner|Ferrero/);
  assert.match(all, /Recherche de produit impossible : délai dépassé/);
  // Le compte connaît l'interrupteur (activé par défaut)
  assert.equal((await guillaume.get('/api/me')).body.user.productLookup, true);
});
