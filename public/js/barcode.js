// Mode scan (listes de courses) : lecture du code-barres sur une photo.
//
// La photo, donnée par le sélecteur d'images du téléphone (appareil photo
// ou photothèque, au choix du téléphone ; même composant que la photo d'un
// article, createImagePicker de photo.js), est lue ICI, sur le
// téléphone : elle n'est ni gardée ni envoyée. Seul le numéro du code part ensuite vers Listo, qui cherche le
// nom du produit (voir server/products.js).
//
// Étapes :
// 1. createImageBitmap lit la photo en la redressant selon son orientation ;
// 2. un canvas la redessine plus petite (1 600 pixels au plus sur le grand
//    côté) ; plusieurs essais si besoin : image entière, centre de l'image,
//    puis, pour une grande photo, ses quatre coins (code en bas ou sur un
//    côté), enfin l'image plus réduite (800 pixels) ;
// 3. le lecteur (zxing-wasm, dans un worker : l'écran ne fige pas) cherche
//    un code EAN-13, EAN-8 ou UPC-A ; la clé de contrôle est vérifiée.
//
// Le lecteur (environ 1 Mo) n'est téléchargé qu'au premier scan, puis gardé
// par le service worker : le scan marche ensuite hors ligne.

// --- Code-barres (calculs purs, testés automatiquement) ---

// Clé de contrôle EAN (EAN-8, EAN-13) : en partant de la droite (sans la
// clé), les chiffres comptent alternativement 3 fois et 1 fois ; la clé
// complète la somme à la dizaine supérieure. Même règle que le serveur.
export function hasValidCheckDigit(digits) {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i -= 1, weight = 4 - weight) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

// Code lu ou tapé → code normalisé (8 ou 13 chiffres), ou null. Les espaces
// et tirets tapés à la main sont ignorés ; un UPC-A (12 chiffres) reçoit un
// 0 devant (c'est le même produit en EAN-13).
export function normalizeBarcode(value) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(digits)) return null;
  const code = digits.length === 12 ? `0${digits}` : digits;
  return hasValidCheckDigit(code) ? code : null;
}

// Message pour un code tapé à la main qui n'est pas valable (null s'il l'est)
export function barcodeProblem(value) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  if (!digits) return 'Tapez les chiffres sous le code-barres.';
  if (!/^\d+$/.test(digits)) return 'Seulement des chiffres, sans lettre.';
  if (![8, 12, 13].includes(digits.length)) return 'Le code a 8, 12 ou 13 chiffres.';
  if (!normalizeBarcode(digits)) return 'Ce code ne semble pas valable : vérifiez les chiffres.';
  return null;
}

// Essais de lecture pour une photo de largeur × hauteur : zone de la photo
// (sx, sy, sw, sh) et taille du dessin (dw, dh). Jamais agrandie. Essais
// en double (petite photo) retirés. Le premier code lu arrête les essais.
export const SCAN_MAX_SIDE = 1600;
export function scanAttempts(width, height) {
  const fit = (w, h, max) => {
    const scale = Math.min(1, max / Math.max(w, h));
    return { dw: Math.max(1, Math.round(w * scale)), dh: Math.max(1, Math.round(h * scale)) };
  };
  const cw = Math.round(width * 0.6);
  const ch = Math.round(height * 0.6);
  // Coins d'une grande photo (un peu plus de la moitié, pour ne pas couper
  // un code posé au milieu d'un bord) : un petit code y garde assez de détail
  const qw = Math.round(width * 0.55);
  const qh = Math.round(height * 0.55);
  const corners = Math.max(width, height) > SCAN_MAX_SIDE
    ? [[0, 0], [width - qw, 0], [0, height - qh], [width - qw, height - qh]]
      .map(([sx, sy]) => ({ sx, sy, sw: qw, sh: qh, ...fit(qw, qh, 1200) }))
    : [];
  const attempts = [
    { sx: 0, sy: 0, sw: width, sh: height, ...fit(width, height, SCAN_MAX_SIDE) },          // image entière
    { sx: Math.round((width - cw) / 2), sy: Math.round((height - ch) / 2), sw: cw, sh: ch, ...fit(cw, ch, 1200) }, // centre
    ...corners,                                                                            // coins
    { sx: 0, sy: 0, sw: width, sh: height, ...fit(width, height, 800) },                   // plus réduite
  ];
  return attempts.filter((a, i) => attempts.findIndex((b) => JSON.stringify(b) === JSON.stringify(a)) === i);
}

// --- Lecture ---

// Lecteur indisponible (pas téléchargé : hors ligne au premier scan ;
// WebAssembly refusé : mode Isolement de l'iPhone…)
export class ReaderUnavailable extends Error {}
// Photo illisible (pas une image, format inconnu)
export class ImageUnreadable extends Error {}

// Fichier choisi qui n'est manifestement pas une image (le sélecteur du
// téléphone peut proposer d'autres fichiers). Type vide : on essaie quand même de le lire.
export const isImageFile = (file) => Boolean(file) && (!file.type || file.type.startsWith('image/'));

const PREPARE_TIMEOUT_MS = 30000; // premier téléchargement du lecteur (1 Mo)
const READ_TIMEOUT_MS = 20000;

let worker = null;
let nextId = 1;
const waiting = new Map(); // id -> { resolve }

// Le worker est créé au premier scan (pas avant), puis gardé
function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./barcode-worker.js', import.meta.url), { type: 'module' });
  } catch {
    throw new ReaderUnavailable();
  }
  worker.addEventListener('message', (event) => {
    const entry = waiting.get(event.data?.id);
    if (!entry) return;
    waiting.delete(event.data.id);
    entry.resolve(event.data);
  });
  // Le worker n'a pas pu démarrer (fichier non téléchargé…) : les demandes en
  // cours échouent, un nouveau worker sera créé au prochain scan
  worker.addEventListener('error', () => stopWorker());
  return worker;
}

function stopWorker() {
  worker?.terminate();
  worker = null;
  for (const entry of waiting.values()) entry.resolve({ failed: true });
  waiting.clear();
}

// Message au worker, avec un délai maximal
function ask(message, transfer, timeoutMs) {
  const target = getWorker();
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ failed: true, timeout: true });
    }, timeoutMs);
    waiting.set(id, { resolve: (data) => {
      clearTimeout(timer);
      resolve(data);
    } });
    target.postMessage({ ...message, id }, transfer);
  });
}

// Lit le code-barres d'une photo (fichier du sélecteur du téléphone).
// Renvoie le code normalisé (8 ou 13 chiffres), ou null si aucun code n'a
// été lu. Lève ReaderUnavailable ou ImageUnreadable.
export async function readBarcode(file) {
  if (!isImageFile(file)) throw new ImageUnreadable();
  const prepared = await ask({ type: 'prepare' }, [], PREPARE_TIMEOUT_MS);
  if (!prepared.ready) {
    if (prepared.timeout) stopWorker();
    throw new ReaderUnavailable();
  }
  let bitmap;
  try {
    // « from-image » : la photo est redressée selon son orientation
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageUnreadable();
  }
  const canvas = document.createElement('canvas');
  try {
    for (const a of scanAttempts(bitmap.width, bitmap.height)) {
      canvas.width = a.dw;
      canvas.height = a.dh;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, a.sx, a.sy, a.sw, a.sh, 0, 0, a.dw, a.dh);
      const image = context.getImageData(0, 0, a.dw, a.dh);
      // L'image est transférée au worker (pas copiée)
      const answer = await ask({ type: 'read', image }, [image.data.buffer], READ_TIMEOUT_MS);
      if (answer.failed) throw new ReaderUnavailable();
      const code = (answer.codes ?? []).map(normalizeBarcode).find(Boolean);
      if (code) return code;
    }
    return null;
  } finally {
    // Rien n'est gardé : image et dessin effacés
    bitmap.close?.();
    canvas.width = 0;
    canvas.height = 0;
  }
}
