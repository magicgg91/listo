// Réduction d'une photo sur le téléphone, avant l'envoi : 1 280 pixels sur
// le grand côté, en JPEG. La photo pèse ainsi quelques centaines de Ko au
// lieu de plusieurs Mo, et ses métadonnées (position GPS…) disparaissent :
// le dessin dans un « canvas » ne garde que les pixels.
//
// Aucune bibliothèque : createImageBitmap lit la photo (en la redressant
// selon son orientation), un canvas la redessine plus petite, puis toBlob
// la réécrit en JPEG. Aucune adresse « blob: » n'est affichée dans la page :
// la Content-Security-Policy reste stricte.

import { h, icon } from './dom.js';

// --- Choisir une image : UN seul bouton ---
// Un champ fichier caché, accept="image/*", SANS l'attribut capture : le
// téléphone affiche lui-même son menu (iPhone : « Photothèque / Prendre une
// photo / Choisir le fichier »). Le champ est mis dans la page (exigé par
// l'iPhone) et ouvert dans l'appui de la personne.
// Utilisé partout : photo d'un article, code-barres de l'article, « Scanner »
// de la barre d'ajout, « Réessayer » du mode scan.
//
// Android (exception, voir isAndroid) : certains Android récents ouvrent pour
// ce champ leur sélecteur de photos, qui ne propose que la galerie. Le bouton
// ouvre donc d'abord une petite feuille, par-dessus la fenêtre en cours :
// « Prendre une photo » (second champ, capture="environment" : c'est
// l'application appareil photo du téléphone qui s'ouvre, jamais la page) ou
// « Choisir dans la galerie » (le champ habituel). « Annuler » ne fait rien.
// Ailleurs, rien ne change : un seul geste.
//
// onFile(fichier) reçoit l'image choisie, par le même chemin dans tous les
// cas. options : title (titre de la feuille Android) ; android (pour les
// tests ; détecté sinon) ; sheet (pour les tests : fonction qui ouvre la
// feuille, openSheet de ui.js sinon). Renvoie { input, button, open } :
// input à placer dans la page (les deux champs sur Android) ;
// button(attributs, ...contenu) fabrique un bouton qui ouvre le choix ;
// open() l'ouvre (dans un appui).
export function createImagePicker(onFile, { title = 'Choisir une image', android = isAndroid(), sheet = null } = {}) {
  const field = (attrs = {}) => {
    const input = h('input', { class: 'visually-hidden', type: 'file', accept: 'image/*', tabindex: '-1', 'aria-hidden': 'true', ...attrs });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = ''; // la même image pourra être choisie de nouveau
      if (file) onFile(file);
    });
    return input;
  };
  const gallery = field();
  let input = gallery;
  let open = () => gallery.click();
  if (android) {
    const camera = field({ capture: 'environment' });
    input = h('span', { class: 'image-picker' }, camera, gallery);
    open = () => chooseSource({ title, camera, gallery, sheet });
  }
  const button = (attrs, ...children) => h('button', { type: 'button', ...attrs, onClick: open }, ...children);
  return { input, button, open };
}

// Vrai sur un téléphone ou une tablette Android (détection simple par le
// navigateur, isolée ici : pour revenir à un seul geste partout, il suffit
// de renvoyer false). Testée automatiquement avec plusieurs navigateurs.
export function isAndroid(userAgent = globalThis.navigator?.userAgent ?? '') {
  return /\bAndroid\b/i.test(String(userAgent));
}

// Feuille « Prendre une photo / Choisir dans la galerie » (Android). Chaque
// choix ouvre son champ DANS l'appui (sinon le téléphone refuse), puis
// referme la feuille ; la fenêtre du dessous (fiche…) reste ouverte.
// ui.js n'est chargé qu'ici : ce module reste utilisable sans écran (tests).
async function chooseSource({ title, camera, gallery, sheet }) {
  const openSheet = sheet ?? (await import('./ui.js')).openSheet;
  let close = () => {};
  const choice = (iconName, text, target) => h('button', {
    class: 'btn btn--secondary btn--block',
    type: 'button',
    'aria-label': text,
    onClick: () => {
      target.click();
      close();
    },
  }, icon(iconName, 'icon--sm'), text);
  ({ close } = openSheet({
    title,
    content: h('div', { class: 'stack stack--sm' },
      choice('camera', 'Prendre une photo', camera),
      choice('image', 'Choisir dans la galerie', gallery),
      h('button', { class: 'btn btn--ghost btn--block', type: 'button', onClick: () => close() }, 'Annuler')),
  }));
}

export const PHOTO_MAX_SIDE = 1280;
export const PHOTO_QUALITY = 0.85;

// Taille réduite (calcul pur, testé automatiquement) : le grand côté passe à
// max pixels, les proportions sont gardées ; une petite photo n'est pas agrandie.
export function fitSize(width, height, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export class PhotoError extends Error {}

// file : fichier choisi par le sélecteur du téléphone. Renvoie le JPEG réduit.
export async function shrinkPhoto(file) {
  let bitmap;
  try {
    // « from-image » : la photo est redressée selon son orientation
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('Cette image ne peut pas être lue. Choisissez une photo (JPEG ou PNG).');
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
  if (!jpeg) throw new PhotoError('La photo n\'a pas pu être préparée. Réessayez.');
  return jpeg;
}
