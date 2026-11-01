// Mode scan : lecteur de codes-barres copié dans public/vendor/ (zxing-wasm
// 3.1.4). Empreintes des fichiers copiés, lecture de codes-barres sur des
// images générées (sans dépendance, sans réseau), et en-têtes : type
// application/wasm, worker venu de Listo, page du lien public inchangée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp, setupAdmin } from './helpers.js';
import { CONTENT_SECURITY_POLICY, APP_CONTENT_SECURITY_POLICY } from '../server/app.js';
import { normalizeBarcode } from '../public/js/barcode.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VENDOR = path.join(ROOT, 'public/vendor/zxing-wasm-3.1.4');

// Empreintes SHA-256 des fichiers copiés tels quels depuis le paquet npm
// zxing-wasm@3.1.4 (mêmes valeurs dans docs/developpement.md)
const SHA256 = {
  'es/reader/index.js': 'd90c69a827aff3b7c8c8ca310efebe91671ef076f7a0ec83722bfc542814f484',
  'es/share.js': '08868fb770b0a4e4b9eb3d717015cd5fbf3ceb06492d4cb2d2dd2739db11890f',
  'reader/zxing_reader.wasm': 'e8af31edb56d0522f4de74495839385ef019ba8bc90d38e5ecb2f18795d86fb2',
  LICENSE: 'fb506e4ade12d7a9efa67c9d76a9a28c8e15d347ca49a69e48e29b40b34ad2ab',
};

function filesIn(dir, base = '') {
  return fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesIn(dir, rel) : [rel];
  });
}

test('lecteur copié : exactement les fichiers attendus, empreintes SHA-256 vérifiées', () => {
  assert.deepEqual(filesIn(VENDOR).sort(), Object.keys(SHA256).sort());
  for (const [file, expected] of Object.entries(SHA256)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(VENDOR, file))).digest('hex');
    assert.equal(actual, expected, `empreinte de ${file}`);
  }
  // Les empreintes sont documentées (même valeurs), avec l'origine de la copie
  const doc = fs.readFileSync(path.join(ROOT, 'docs/developpement.md'), 'utf8');
  for (const [file, hash] of Object.entries(SHA256)) assert.ok(doc.includes(hash), `docs/developpement.md : empreinte de ${file}`);
  assert.match(doc, /zxing-wasm@3\.1\.4/);
  // Licences mentionnées dans NOTICE
  const notice = fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8');
  assert.match(notice, /zxing-wasm/);
  assert.match(notice, /MIT/);
  assert.match(notice, /ZXing-C\+\+/);
  assert.match(notice, /Apache/);
  // Jamais une dépendance d'exécution du serveur
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(JSON.stringify(pkg).includes('zxing'), false);
});

test('lecteur : chargé depuis Listo seulement (jamais depuis un CDN)', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'public/js/barcode-worker.js'), 'utf8');
  // L'adresse du programme WebAssembly est remplacée par celle de Listo
  assert.match(worker, /locateFile: \(path, prefix\) => \(path\.endsWith\('\.wasm'\) \? WASM_URL : prefix \+ path\)/);
  assert.match(worker, /new URL\('\.\.\/vendor\/zxing-wasm-3\.1\.4\/reader\/zxing_reader\.wasm', import\.meta\.url\)/);
  assert.doesNotMatch(worker, /https?:\/\//);
  // Aucun autre site dans les fichiers de l'application (hors bibliothèque
  // copiée, dont l'adresse de CDN par défaut est remplacée ci-dessus, et
  // bloquée de toute façon par la CSP : connect-src 'self')
  for (const file of ['public/js/barcode.js', 'public/js/screens/scan.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), /https?:\/\//, file);
  }
});

// --- Images de codes-barres générées (BMP), sans dépendance ---

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((s) => [...s].map((c) => (c === '0' ? '1' : '0')).reverse().join(''));
const R = L.map((s) => [...s].map((c) => (c === '0' ? '1' : '0')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

// Barres (1 = noir) d'un EAN-13, EAN-8 ou UPC-A
function bars(code) {
  if (code.length === 12) return bars(`0${code}`);
  const d = [...code].map(Number);
  if (code.length === 8) return `101${d.slice(0, 4).map((x) => L[x]).join('')}01010${d.slice(4).map((x) => R[x]).join('')}101`;
  let b = '101';
  for (let i = 1; i < 7; i += 1) b += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  b += '01010';
  for (let i = 7; i < 13; i += 1) b += R[d[i]];
  return `${b}101`;
}

// Image BMP (gris) : code centré, module en pixels, angle en degrés, flou
// horizontal (rayon), bruit (0 à 1)
function bmp(width, height, pixel) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * height);
  buf.write('BM');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = 54 + y * row + x * 3;
      buf[o] = buf[o + 1] = buf[o + 2] = Math.round(Math.max(0, Math.min(1, pixel(x, y))) * 255);
    }
  }
  return new Uint8Array(buf);
}

function barcodeImage(code, { width = 700, height = 420, module = 3, angle = 0, blur = 0, noise = 0 } = {}) {
  const b = bars(code);
  const quiet = 10;
  const total = (b.length + 2 * quiet) * module;
  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  const sample = (x, y) => {
    const dx = x - width / 2;
    const dy = y - height / 2;
    const u = cos * dx + sin * dy + total / 2;
    const v = -sin * dx + cos * dy;
    if (Math.abs(v) < height * 0.22 && u >= 0 && u < total) {
      const i = Math.floor(u / module) - quiet;
      if (i >= 0 && i < b.length && b[i] === '1') return 0.08;
    }
    return 0.93;
  };
  let seed = 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return bmp(width, height, (x, y) => {
    let value = 0;
    for (let k = -blur; k <= blur; k += 1) value += sample(x + k, y);
    return value / (2 * blur + 1) + (rand() - 0.5) * 2 * noise;
  });
}

// Lecteur zxing-wasm copié, chargé depuis le fichier local (aucun réseau)
let reader;
async function read(image) {
  if (!reader) {
    reader = await import('../public/vendor/zxing-wasm-3.1.4/es/reader/index.js');
    const wasm = fs.readFileSync(path.join(VENDOR, 'reader/zxing_reader.wasm'));
    await reader.prepareZXingModule({
      overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
      fireImmediately: true,
    });
  }
  // Mêmes options que public/js/barcode-worker.js
  const results = await reader.readBarcodes(image, {
    formats: ['EAN13', 'EAN8', 'UPCA'], tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true, maxNumberOfSymbols: 1,
  });
  return results.filter((r) => r.isValid).map((r) => normalizeBarcode(r.text)).find(Boolean) ?? null;
}

test('lecture : EAN-13, EAN-8 et UPC-A sur des images générées', async () => {
  assert.equal(await read(barcodeImage('3017620422003')), '3017620422003');
  assert.equal(await read(barcodeImage('96385074', { module: 5 })), '96385074');
  // UPC-A lu, puis normalisé en EAN-13 (un 0 devant)
  assert.equal(await read(barcodeImage('012345678905')), '0012345678905');
});

test('lecture : photo tournée, inclinée, floue et bruitée, grande photo', async () => {
  assert.equal(await read(barcodeImage('4006381333931', { width: 420, height: 700, angle: 90 })), '4006381333931');
  assert.equal(await read(barcodeImage('4006381333931', { angle: 180 })), '4006381333931');
  assert.equal(await read(barcodeImage('4006381333931', { angle: 7 })), '4006381333931');
  assert.equal(await read(barcodeImage('4006381333931', { blur: 1, noise: 0.12 })), '4006381333931');
  assert.equal(await read(barcodeImage('3017620422003', { width: 1600, height: 1200, module: 4 })), '3017620422003');
});

test('lecture : rien de lu sur une image sans code-barres', async () => {
  let seed = 7;
  const noise = bmp(500, 300, () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  });
  assert.equal(await read(noise), null);
  assert.equal(await read(bmp(300, 200, () => 0.9)), null);
});

// --- En-têtes ---

test('fichiers du lecteur : type application/wasm, CSP de l\'application, page publique inchangée', async (t) => {
  const app = await startTestApp(t);
  const wasm = await fetch(`${app.base}/vendor/zxing-wasm-3.1.4/reader/zxing_reader.wasm`);
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  assert.equal(wasm.headers.get('x-content-type-options'), 'nosniff');
  const module = await fetch(`${app.base}/vendor/zxing-wasm-3.1.4/es/reader/index.js`);
  assert.match(module.headers.get('content-type'), /^(text|application)\/javascript/);
  // Le worker vient de Listo ; sa réponse porte la politique de l'application
  // (worker-src 'self', 'wasm-unsafe-eval' pour le lecteur)
  const worker = await fetch(`${app.base}/js/barcode-worker.js`);
  assert.equal(worker.status, 200);
  assert.equal(worker.headers.get('content-security-policy'), APP_CONTENT_SECURITY_POLICY);
  assert.match(APP_CONTENT_SECURITY_POLICY, /worker-src 'self'(;|$)/);
  // Page de l'application
  assert.equal((await fetch(`${app.base}/`)).headers.get('content-security-policy'), APP_CONTENT_SECURITY_POLICY);

  // Page du lien public : politique stricte, sans 'wasm-unsafe-eval'
  const guillaume = await setupAdmin(app);
  const listId = crypto.randomUUID();
  await guillaume.post('/api/ops', { ops: [{ id: crypto.randomUUID(), type: 'list.create', listId, name: 'Courses', listType: 'shopping' }] });
  const share = await guillaume.request('PUT', `/api/lists/${listId}/share`, {});
  const token = share.body.share.url.split('/p/')[1];
  for (const url of [`/p/${token}`, `/api/public/${token}`, `/p/${'A'.repeat(43)}`]) {
    const res = await fetch(`${app.base}${url}`);
    assert.equal(res.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY, url);
    assert.doesNotMatch(res.headers.get('content-security-policy'), /wasm/, url);
  }
});
