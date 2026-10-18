// Réduction d'une photo sur le téléphone, avant l'envoi : 1 280 pixels sur
// le grand côté, en JPEG. La photo pèse ainsi quelques centaines de Ko au
// lieu de plusieurs Mo, et ses métadonnées (position GPS…) disparaissent :
// le dessin dans un « canvas » ne garde que les pixels.
//
// Aucune bibliothèque : createImageBitmap lit la photo (en la redressant
// selon son orientation), un canvas la redessine plus petite, puis toBlob
// la réécrit en JPEG. Aucune adresse « blob: » n'est affichée dans la page :
// la Content-Security-Policy reste stricte.

import { h } from './dom.js';

// --- Choisir une image : UN seul bouton, le choix est celui du téléphone ---
// Un champ fichier caché, accept="image/*", SANS l'attribut capture : le
// téléphone affiche lui-même son menu (iPhone : « Photothèque / Prendre une
// photo / Choisir le fichier » ; Android : son sélecteur, qui propose aussi
// l'appareil photo). Listo n'ajoute aucun menu par-dessus. Le champ est mis
// dans la page (exigé par l'iPhone) et ouvert dans l'appui de la personne.
// Utilisé partout : photo d'un article, code-barres de l'article, « Scanner »
// de la barre d'ajout, « Réessayer » du mode scan.
//
// onFile(fichier) reçoit l'image choisie. Renvoie { input, button, open } :
// input à placer dans la page ; button(attributs, ...contenu) fabrique un
// bouton qui ouvre le sélecteur ; open() l'ouvre (dans un appui).
export function createImagePicker(onFile) {
  const input = h('input', { class: 'visually-hidden', type: 'file', accept: 'image/*', tabindex: '-1', 'aria-hidden': 'true' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = ''; // la même image pourra être choisie de nouveau
    if (file) onFile(file);
  });
  const open = () => input.click();
  const button = (attrs, ...children) => h('button', { type: 'button', ...attrs, onClick: open }, ...children);
  return { input, button, open };
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
