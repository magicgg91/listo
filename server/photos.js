// Photos des articles : contrôle du fichier JPEG, retrait des métadonnées et
// stockage dans data/photos. Aucune bibliothèque d'image : un JPEG est une
// suite de « blocs » (marqueur FF xx, puis longueur), que l'on parcourt un à un.
//
// Règles (cahier des charges, « Photos des articles ») :
// - seulement du JPEG, reconnu à son contenu (le type annoncé par le
//   téléphone ne compte pas) ;
// - structure vérifiée : début FF D8, blocs bien formés, image complète, fin
//   FF D9 en tout dernier (rien après) ;
// - dimensions annoncées plafonnées ;
// - métadonnées retirées (EXIF avec la position GPS, XMP, IPTC, commentaires,
//   vignettes) : seuls les blocs utiles à l'affichage sont gardés ;
// - fichier nommé d'après l'identifiant de l'article, jamais d'après un nom
//   envoyé par le téléphone.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 Mo
export const MAX_PHOTO_SIDE = 4096;             // pixels, largeur comme hauteur

// Marqueurs qui annoncent la taille de l'image (« SOF ») : C0 à CF, sauf C4
// (tables de Huffman), C8 (réservé) et CC (codage arithmétique)
const isFrameMarker = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

// Les blocs « APPn » (E0 à EF) et les commentaires (FE) portent les
// métadonnées. On ne garde que ceux qui servent à afficher l'image :
// - APP0 « JFIF » : description de base du format ;
// - APP2 « ICC_PROFILE » : profil de couleurs ;
// - APP14 « Adobe » : codage des couleurs.
// Tout le reste (EXIF et GPS en APP1, XMP, IPTC en APP13, images
// supplémentaires en APP2 « MPF », commentaires…) est retiré.
function keepMetadataBlock(marker, data) {
  const startsWith = (text) => data.subarray(0, text.length).toString('latin1') === text;
  if (marker === 0xe0) return startsWith('JFIF\0');
  if (marker === 0xe2) return startsWith('ICC_PROFILE\0');
  if (marker === 0xee) return startsWith('Adobe');
  return false;
}

// Vérifie un fichier JPEG et en retire les métadonnées.
// Renvoie { ok: true, jpeg, width, height } avec le fichier nettoyé,
// ou { ok: false, error } avec un message simple.
export function cleanJpeg(buffer, { maxSide = MAX_PHOTO_SIDE } = {}) {
  const refuse = (error) => ({ ok: false, error });
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return refuse("Ce fichier n'est pas une photo JPEG.");
  }
  const damaged = refuse('Photo JPEG incomplète ou abîmée.');
  const parts = [buffer.subarray(0, 2)]; // FF D8 : début de l'image
  let pos = 2;
  let size = null;
  let scans = 0;

  for (let blocks = 0; blocks < 5000; blocks++) {
    if (pos + 1 >= buffer.length || buffer[pos] !== 0xff) return damaged;
    const marker = buffer[pos + 1];
    if (marker === 0xff) { // octet de remplissage permis entre deux blocs
      pos += 1;
      continue;
    }

    // Fin de l'image : elle doit être le tout dernier élément du fichier
    if (marker === 0xd9) {
      if (pos + 2 !== buffer.length) return refuse('Données inattendues après la fin de la photo.');
      if (!size || scans === 0) return damaged;
      parts.push(buffer.subarray(pos, pos + 2));
      return { ok: true, jpeg: Buffer.concat(parts), width: size.width, height: size.height };
    }
    // Marqueurs sans longueur : interdits hors des données de l'image
    if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return damaged;

    // Bloc avec longueur (2 octets, longueur comprise)
    if (pos + 4 > buffer.length) return damaged;
    const length = buffer.readUInt16BE(pos + 2);
    const end = pos + 2 + length;
    if (length < 2 || end > buffer.length) return damaged;
    const block = buffer.subarray(pos, end);
    const data = buffer.subarray(pos + 4, end);

    if (isFrameMarker(marker)) {
      // Taille de l'image : une seule déclaration, dimensions plafonnées
      if (size || data.length < 6) return damaged;
      const height = data.readUInt16BE(1);
      const width = data.readUInt16BE(3);
      if (!width || !height) return damaged;
      if (width > maxSide || height > maxSide) return refuse(`Photo trop grande (${maxSide} pixels de côté au plus).`);
      size = { width, height };
    }

    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      if (keepMetadataBlock(marker, data)) parts.push(block);
    } else {
      parts.push(block);
    }
    pos = end;

    // Début des données de l'image (« SOS ») : elles continuent jusqu'au
    // prochain marqueur (FF 00 et FF D0 à D7 font partie des données)
    if (marker === 0xda) {
      if (!size) return damaged;
      let i = pos;
      while (i < buffer.length) {
        if (buffer[i] === 0xff && i + 1 < buffer.length) {
          const next = buffer[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      if (i >= buffer.length - 1) return damaged; // fichier coupé avant la fin
      parts.push(buffer.subarray(pos, i));
      pos = i;
      scans += 1;
    }
  }
  return damaged; // beaucoup trop de blocs : fichier anormal
}

// Identifiant d'article (UUID) : le seul nom de fichier possible
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHOTO_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/;
const TEMP_FILE = /^\..+\.tmp$/;

// Rangement des fichiers dans un dossier (data/photos)
export function createPhotoStore(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const fileOf = (itemId) => {
    const id = String(itemId).toLowerCase();
    if (!UUID.test(id)) throw new Error('Identifiant de photo invalide');
    return path.join(dir, `${id}.jpg`);
  };

  return {
    dir,
    fileOf,

    // Écrit la photo : d'abord dans un fichier temporaire, puis renommage.
    // Ainsi, une photo n'est jamais à moitié écrite, et l'ancienne est
    // remplacée d'un coup.
    async save(itemId, jpeg) {
      const final = fileOf(itemId);
      const temp = path.join(dir, `.${path.basename(final)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
      try {
        await fs.promises.writeFile(temp, jpeg, { mode: 0o600 });
        await fs.promises.rename(temp, final);
      } catch (err) {
        fs.rmSync(temp, { force: true });
        throw err;
      }
    },

    // Efface la photo d'un article (sans erreur si elle n'existe pas)
    remove(itemId) {
      fs.rmSync(fileOf(itemId), { force: true });
    },

    exists(itemId) {
      return fs.existsSync(fileOf(itemId));
    },

    // Ménage : efface les fichiers dont l'article n'existe plus (isKnown(id)
    // faux), et les fichiers temporaires oubliés depuis plus d'une heure
    // (coupure pendant un envoi).
    sweep(isKnown, now = Date.now()) {
      let removed = 0;
      for (const name of fs.readdirSync(dir)) {
        const photo = PHOTO_FILE.exec(name);
        const file = path.join(dir, name);
        if (photo && !isKnown(photo[1])) {
          fs.rmSync(file, { force: true });
          removed += 1;
        } else if (TEMP_FILE.test(name) && now - fs.statSync(file).mtimeMs > 60 * 60 * 1000) {
          fs.rmSync(file, { force: true });
          removed += 1;
        }
      }
      return removed;
    },
  };
}

// Envoie une photo en réponse HTTP. Réutilisable par toute route qui a déjà
// vérifié le droit de la voir (membre de la liste ; plus tard, lien public).
// cache : en-tête Cache-Control à envoyer.
export function sendPhoto(res, store, itemId, { cache = 'private, max-age=604800' } = {}) {
  const file = store.fileOf(itemId);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Photo introuvable.' });
  res.set({
    'Content-Type': 'image/jpeg',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cache,
  });
  return res.sendFile(file, { dotfiles: 'deny', headers: { 'Content-Type': 'image/jpeg' }, cacheControl: false, lastModified: false, etag: true });
}

// Plafond d'envois par compte et par période (60 par heure par défaut)
export function createUploadCounter({ limit = 60, windowMs = 60 * 60 * 1000, now = Date.now } = {}) {
  const counts = new Map(); // compte -> { start, count }
  return {
    // Compte un envoi ; renvoie faux si le plafond est atteint
    take(userId) {
      const time = now();
      let entry = counts.get(userId);
      if (!entry || time - entry.start >= windowMs) {
        entry = { start: time, count: 0 };
        counts.set(userId, entry);
      }
      if (entry.count >= limit) return false;
      entry.count += 1;
      return true;
    },
    prune() {
      const time = now();
      for (const [userId, entry] of counts) if (time - entry.start >= windowMs) counts.delete(userId);
    },
  };
}
