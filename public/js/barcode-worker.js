// Lecteur de codes-barres du mode scan, dans un « worker » : le calcul se
// fait à côté de la page, sans figer l'écran.
//
// Il utilise zxing-wasm 3.1.4 (lecteur seul), copié tel quel dans
// public/vendor/ (voir docs/developpement.md : origine, version, empreintes).
// Le programme WebAssembly est toujours chargé depuis Listo, jamais depuis
// un CDN : la fonction locateFile ci-dessous remplace l'adresse prévue par la
// bibliothèque (et la Content-Security-Policy bloquerait tout autre site).
//
// Messages reçus de la page :
// - { id, type: 'prepare' } : charger le lecteur ; réponse { id, ready } ;
// - { id, type: 'read', image } : lire une image (ImageData) ; réponse
//   { id, codes: [texte…] } (EAN-13, EAN-8, UPC-A, clé de contrôle vérifiée).
// En cas d'échec (lecteur refusé, WebAssembly désactivé…) : { id, failed: true }.
// L'image n'est ni gardée ni envoyée : elle est oubliée après la lecture.

import { prepareZXingModule, readBarcodes } from '../vendor/zxing-wasm-3.1.4/es/reader/index.js';

const WASM_URL = new URL('../vendor/zxing-wasm-3.1.4/reader/zxing_reader.wasm', import.meta.url).href;

// Codes recherchés : ceux des produits du commerce, et rien d'autre
const READER_OPTIONS = {
  formats: ['EAN13', 'EAN8', 'UPCA'],
  tryHarder: true,      // recherche plus poussée (photo floue, petit code)
  tryRotate: true,      // code tourné d'un quart de tour
  tryInvert: false,     // codes clairs sur fond sombre : jamais sur ces produits
  tryDownscale: true,   // essais sur l'image réduite
  maxNumberOfSymbols: 1,
};

let ready = null;
function prepare() {
  ready ??= prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? WASM_URL : prefix + path),
    },
    fireImmediately: true,
  }).then(() => true, () => {
    ready = null; // nouvel essai possible plus tard (réseau revenu…)
    return false;
  });
  return ready;
}

self.addEventListener('message', async (event) => {
  const { id, type, image } = event.data ?? {};
  try {
    if (type === 'prepare') {
      self.postMessage({ id, ready: await prepare() });
      return;
    }
    if (type === 'read') {
      if (!(await prepare())) throw new Error('lecteur indisponible');
      const results = await readBarcodes(image, READER_OPTIONS);
      const codes = results.filter((r) => r.isValid && /^\d+$/.test(r.text)).map((r) => r.text);
      self.postMessage({ id, codes });
    }
  } catch {
    self.postMessage({ id, failed: true });
  }
});
