// Mode scan (listes de courses seulement) : bouton « Scanner » à côté du
// champ d'ajout, puis feuille « Scanner un produit ».
//
// Parcours :
// 1. le bouton ouvre l'appareil photo du téléphone (même mécanisme que la
//    photo d'un article : <input type="file" capture>) ; on photographie le
//    code-barres ;
// 2. la photo est lue sur le téléphone (barcode.js) : elle n'est ni gardée
//    ni envoyée, seul le numéro du code part vers Listo ;
// 3. Listo cherche le nom du produit (Open Food Facts) : fiche avec le nom
//    (modifiable) et la note « marque · format » ; « Ajouter à la liste » ;
//    le rayon (ou le magasin) est choisi comme pour un ajout normal ;
// 4. « Ajouter à la liste » : l'ajout se termine. La feuille se ferme, retour
//    sur la liste, clavier replié, aucun champ actif, toast « Ajouté : … ».
//    Pour un autre produit, on réappuie sur « Scanner ». « Annuler » ferme
//    aussi la feuille.
//
// Rien ne bloque : code non lu, produit inconnu, réponse lente ou hors
// ligne : on peut toujours taper le code, puis le nom, à la main. Les champs
// n'apparaissent que sur appui, et le curseur n'y est jamais mis tout seul
// (aucun clavier qui s'ouvre de lui-même). Aucun message technique.
// Le code lu (ou tapé) est gardé dans le champ « Code-barres » de l'article
// (ean), que le produit soit trouvé ou non ; jamais dans la note.

import { h, icon, field, replace } from '../dom.js';
import { post, NetworkError } from '../api.js';
import { readBarcode, barcodeProblem, normalizeBarcode, ReaderUnavailable, ImageUnreadable } from '../barcode.js';
import { duplicateOf, duplicateText } from '../store.js';
import { openSheet, toast, releaseFocus } from '../ui.js';
import { app } from '../app.js';

// Bouton visible : liste de courses, et recherche activée sur le serveur
// (LISTO_PRODUCT_LOOKUP). Un ancien compte gardé hors ligne, sans
// l'information, garde le bouton.
export const scanAvailable = (list) => Boolean(list?.category.isShopping) && app.user?.productLookup !== false;

// Note proposée pour l'article : « Lactel · 1 L » (marque · format)
export const productNote = (product) => [product.brand, product.quantity].filter(Boolean).join(' · ');

// Messages quand le nom n'a pas été trouvé (jamais de détail technique)
const NO_NAME = {
  unknown: "Produit inconnu d'Open Food Facts. Vous pouvez taper son nom.",
  unavailable: "Le nom du produit n'a pas pu être trouvé pour le moment. Vous pouvez le taper.",
  offline: 'Hors ligne : le nom du produit est indisponible. Vous pouvez le taper.',
};

// Options :
// - listId : la liste ouverte
// - getView : vue actuelle de la liste (computeListView), pour les doublons
// - add(name, { note, ean }) : ajoute l'article comme un ajout normal (rayon
//   ou magasin habituel, sinon demandé une fois) ; renvoie l'article ajouté,
//   ou false si le choix du rayon a été abandonné
export function createScanner({ listId, getView, add }) {
  // Sélecteur caché : l'appareil photo du téléphone
  const camera = h('input', { class: 'visually-hidden', type: 'file', accept: 'image/*', capture: 'environment', tabindex: '-1', 'aria-hidden': 'true' });
  const button = h('button', {
    class: 'btn btn--secondary btn--icon',
    type: 'button',
    'aria-label': 'Scanner un produit',
    onClick: () => camera.click(),
  }, icon('barcode'));

  let session = null; // feuille ouverte (une seule)
  camera.addEventListener('change', () => {
    const file = camera.files?.[0];
    camera.value = ''; // la même photo pourra être reprise
    if (!file) return;
    session ??= openSession();
    session.scan(file);
  });

  // --- Feuille « Scanner un produit » ---
  function openSession() {
    const body = h('div', { class: 'stack' });
    let current = 0; // numéro de l'étape en cours (une réponse en retard est ignorée)

    const sheet = openSheet({
      title: 'Scanner un produit',
      content: body,
      scroll: true,
      onClose: () => {
        session = null;
        current += 1;
      },
    });

    // Affiche une étape. Le focus revient sur la feuille (jamais dans un
    // champ) si le bouton qui l'avait a disparu.
    const show = (...children) => {
      replace(body, ...children);
      if (!sheet.panel.contains(document.activeElement) || document.activeElement === document.body) sheet.panel.focus();
    };
    const status = (text) => h('p', { class: 'sync sync--busy', role: 'status' }, icon('sync', 'icon--sm'), text);
    const message = (iconName, text, danger = false) => h('div', { class: `note${danger ? ' note--danger' : ''}`, role: 'status' }, icon(iconName), h('p', {}, text));
    const btn = (classes, content, onClick) => h('button', { class: `btn ${classes}`, type: 'button', onClick }, ...content);
    const retake = (label = 'Reprendre une photo') => btn('btn--primary btn--block', [icon('camera', 'icon--sm'), label], () => camera.click());
    // « Annuler » : la feuille se ferme (un champ qui avait le curseur le perd)
    const cancel = () => btn('btn--secondary btn--block', ['Annuler'], () => sheet.close());

    // Saisie du code à la main : le champ n'apparaît que sur appui
    function manualCode(intro) {
      const step = ++current;
      const input = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '20', enterkeyhint: 'search' });
      const codeField = field('Code-barres (chiffres sous les barres)', input);
      const search = btn('btn--primary btn--block', ['Rechercher'], submit);
      const form = h('form', { class: 'stack', novalidate: true, hidden: true }, codeField.field, search);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
      });
      function submit() {
        const problem = barcodeProblem(input.value);
        codeField.setError(problem);
        if (problem || step !== current) return;
        releaseFocus(); // code validé : le clavier se replie
        lookup(normalizeBarcode(input.value));
      }
      const reveal = btn('btn--secondary btn--block', ['Saisir le code à la main'], () => {
        reveal.hidden = true;
        form.hidden = false;
      });
      show(intro, h('div', { class: 'sheet__actions' }, retake(), reveal), form, cancel());
    }

    // 1. Lecture du code sur la photo
    async function scan(file) {
      const step = ++current;
      show(status('Lecture du code-barres…'));
      let code = null;
      try {
        code = await readBarcode(file);
      } catch (err) {
        if (step !== current) return;
        if (err instanceof ImageUnreadable) {
          manualCode(message('alert', 'Cette photo ne peut pas être lue. Reprenez une photo, ou saisissez le code.', true));
        } else {
          // Lecteur indisponible (pas encore téléchargé et hors ligne, mode
          // Isolement de l'iPhone…) : saisie à la main
          manualCode(message('alert', "La lecture des codes-barres n'est pas disponible pour le moment sur ce téléphone (au premier scan, il faut du réseau). Vous pouvez saisir le code à la main.", true));
        }
        return;
      }
      if (step !== current) return;
      if (!code) {
        manualCode(message('alert', 'Code non lu, réessayez plus près et bien à plat, ou saisissez-le.', true));
        return;
      }
      lookup(code);
    }

    // 2. Recherche du nom du produit (serveur → Open Food Facts)
    async function lookup(code) {
      const step = ++current;
      show(status('Recherche du produit…'));
      let answer;
      try {
        answer = await post(`/api/lists/${listId}/products`, { code });
      } catch (err) {
        answer = { status: err instanceof NetworkError ? 'offline' : 'unavailable' };
      }
      if (step !== current) return;
      if (answer?.status === 'found' && typeof answer.name === 'string' && answer.name) {
        productSheet({ name: answer.name, note: productNote(answer), found: true, code });
      } else {
        typeName(NO_NAME[answer?.status] ?? NO_NAME.unavailable, code);
      }
    }

    // 3a. Nom inconnu : « Taper le nom » fait apparaître le champ
    function typeName(text, code) {
      ++current;
      const reveal = btn('btn--primary btn--block', ['Taper le nom'], () => productSheet({ name: '', note: '', found: false, code }));
      show(message('alert', text), h('div', { class: 'sheet__actions' }, reveal, cancel()));
    }

    // 3b. Fiche du produit : nom (modifiable), note, doublon, ajout
    // code : code-barres lu ou tapé, gardé avec l'article
    function productSheet({ name, note, found, code }) {
      const step = ++current;
      const nameInput = h('input', { class: 'input', type: 'text', value: name, maxlength: '100', autocapitalize: 'sentences', autocomplete: 'off' });
      const noteInput = h('input', { class: 'input', type: 'text', value: note, maxlength: '500', autocomplete: 'off' });
      const nameField = field('Nom', nameInput);
      const warning = h('div', { class: 'note', role: 'status', hidden: true }, icon('alert'), h('p'));
      const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Ajouter à la liste');
      // Déjà dans la liste (même nom) : prévenir, et « Ajouter quand même »
      const checkDuplicate = () => {
        const duplicate = duplicateOf(getView(), nameInput.value, code);
        warning.hidden = !duplicate;
        warning.querySelector('p').textContent = duplicate ? duplicateText(duplicate) : '';
        save.textContent = duplicate ? 'Ajouter quand même' : 'Ajouter à la liste';
      };
      nameInput.addEventListener('input', checkDuplicate);
      checkDuplicate();
      const form = h('form', { class: 'stack', novalidate: true },
        found ? message('check', 'Produit trouvé. Vous pouvez corriger le nom avant de l\'ajouter.') : null,
        nameField.field,
        field('Note (facultative)', noteInput, { hint: found ? 'Marque et format' : undefined }).field,
        warning,
        found ? h('p', { class: 'field__hint' }, 'Données : Open Food Facts') : null,
        h('div', { class: 'sheet__actions' }, save, cancel()));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const finalName = nameInput.value.replace(/\s+/g, ' ').trim();
        nameField.setError(finalName ? null : 'Le nom est obligatoire');
        if (!finalName || step !== current) return;
        releaseFocus(); // nom validé : le clavier se replie
        save.disabled = true;
        const item = await add(finalName, { note: noteInput.value.replace(/\s+/g, ' ').trim(), ean: code });
        save.disabled = false;
        if (!item || step !== current) return; // choix du rayon abandonné : la fiche reste
        // L'ajout se termine : retour sur la liste, aucun champ actif
        sheet.close();
        releaseFocus();
        toast(`Ajouté : ${finalName}`, { duration: 2500 });
      });
      show(form);
    }

    return { scan };
  }

  return { button, camera };
}
