// Mode scan (listes de courses seulement) : bouton « Scanner » à côté du
// champ d'ajout, puis feuille « Scanner un produit ».
//
// Parcours :
// 1. le bouton ouvre directement le sélecteur d'images du téléphone (son
//    propre menu propose l'appareil photo ou la photothèque) : même
//    composant que la photo d'un article (createImagePicker de photo.js) ;
// 2. la photo est lue sur le téléphone (barcode.js) : elle n'est ni gardée
//    ni envoyée, seul le numéro du code part vers Listo ;
// 3. Listo cherche le nom du produit, dans cet ordre : un article de la
//    liste ouverte (scan pour cocher, ci-dessous) ; un article de mes autres
//    listes (d'abord sur le téléphone, puis sur le serveur, qui connaît aussi
//    les articles supprimés depuis moins de 30 jours) : mon nom et ma note,
//    sans rien demander à Open Food Facts ; enfin Open Food Facts. Fiche avec
//    le nom (modifiable) et la note ; « Ajouter à la liste » ; le rayon (ou
//    le magasin) est choisi comme pour un ajout normal ;
// 4. « Ajouter à la liste » : l'ajout se termine. La feuille se ferme, retour
//    sur la liste, clavier replié, aucun champ actif, toast « Ajouté : … ».
//    Pour un autre produit, on réappuie sur « Scanner ». « Annuler » ferme
//    aussi la feuille.
//
// Scan pour cocher (en magasin) : si le code lu est celui d'un article de la
// liste ouverte, la feuille propose « Cocher (je l'ai pris) », « Ajouter
// quand même » ou « Annuler » (« Déjà coché » : « Le remettre dans la liste »).
// La correspondance se fait sur les données du téléphone : cela marche hors
// ligne (lecteur déjà téléchargé, file d'attente habituelle). Cette feuille,
// plutôt qu'un cochage direct, évite de cocher par erreur un produit scanné
// à la maison.
//
// Rien ne bloque : code non lu, produit inconnu, réponse lente ou hors
// ligne : on peut toujours taper le code, puis le nom, à la main. Les champs
// n'apparaissent que sur appui, et le curseur n'y est jamais mis tout seul
// (aucun clavier qui s'ouvre de lui-même). Aucun message technique.
// Le code lu (ou tapé) est gardé dans le champ « Code-barres » de l'article
// (ean), que le produit soit trouvé ou non ; jamais dans la note.

import { h, icon, field, replace, LABEL_INPUT } from '../dom.js';
import { post, NetworkError } from '../api.js';
import { readBarcode, barcodeProblem, normalizeBarcode, ReaderUnavailable, ImageUnreadable } from '../barcode.js';
import { duplicateOf, duplicateText, listItemForEan, knownItemForEan } from '../store.js';
import { openSheet, toast, releaseFocus } from '../ui.js';
import { createImagePicker } from '../photo.js';
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
//   et le scan pour cocher
// - check(item, checked) : coche ou décoche un article (opération habituelle)
// - add(name, { note, ean }) : ajoute l'article comme un ajout normal (rayon
//   ou magasin habituel, sinon demandé une fois) ; renvoie l'article ajouté,
//   ou false si le choix du rayon a été abandonné
export function createScanner({ listId, getView, add, check }) {
  let session = null; // feuille ouverte (une seule)
  // Un seul bouton : le sélecteur d'images du téléphone (appareil photo ou
  // photothèque, au choix du téléphone) ; la même lecture ensuite
  const picker = createImagePicker((file) => {
    session ??= openSession();
    session.scan(file);
  });
  const button = picker.button({ class: 'btn btn--secondary btn--icon', 'aria-label': 'Scanner un produit' }, icon('barcode'));

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
    // Réessayer : un seul bouton, le même sélecteur
    const retake = () => picker.button({ class: 'btn btn--primary btn--block' }, icon('camera', 'icon--sm'), 'Réessayer');
    // « Annuler » : la feuille se ferme (un champ qui avait le curseur le perd)
    const cancel = () => btn('btn--secondary btn--block', ['Annuler'], () => sheet.close());

    // Saisie du code à la main : le champ n'apparaît que sur appui
    function manualCode(intro) {
      const step = ++current;
      const input = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '20', enterkeyhint: 'search' });
      const codeField = field('Code-barres', input, { aside: '8, 12 ou 13 chiffres' });
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
        handleCode(normalizeBarcode(input.value));
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
          manualCode(message('alert', "Ce fichier n'est pas une image lisible. Réessayez avec une photo, ou saisissez le code.", true));
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
      handleCode(code);
    }

    // Code lu ou tapé : d'abord un article de cette liste (scan pour
    // cocher), sinon la recherche du nom
    function handleCode(code) {
      const item = listItemForEan(getView(), code);
      if (item) inList(item, code);
      else lookup(code);
    }

    // 1 bis. Article déjà dans la liste : le cocher (ou le décocher), ou en
    // ajouter un autre quand même
    function inList(item, code) {
      ++current;
      const done = (text) => {
        sheet.close();
        releaseFocus();
        toast(text, { duration: 2500 });
      };
      const tick = item.checked
        ? btn('btn--primary btn--block', ['Le remettre dans la liste'], () => {
          check(item, false);
          done(`Remis dans la liste : ${item.name}`);
        })
        : btn('btn--primary btn--block', [icon('check', 'icon--sm'), 'Cocher (je l\'ai pris)'], () => {
          check(item, true);
          done(`Coché : ${item.name}`);
        });
      const again = btn('btn--secondary btn--block', ['Ajouter quand même'], () => productSheet({ name: item.name, note: item.note ?? '', source: 'known', code }));
      show(message(item.checked ? 'check' : 'alert', `${item.checked ? 'Déjà coché' : 'Déjà dans la liste'} : ${item.name}`),
        h('div', { class: 'sheet__actions' }, tick, again, cancel()));
    }

    // 2. Recherche du nom du produit : mes autres listes (téléphone, puis
    // serveur), puis Open Food Facts (par le serveur)
    async function lookup(code) {
      const step = ++current;
      // Déjà dans une autre de mes listes, sur ce téléphone : tout de suite,
      // même hors ligne
      const mine = knownItemForEan(app.data, code, { exceptListId: listId });
      if (mine) {
        productSheet({ name: mine.name, note: mine.note ?? '', source: 'known', code });
        return;
      }
      show(status('Recherche du produit…'));
      let answer;
      try {
        answer = await post(`/api/lists/${listId}/products`, { code });
      } catch (err) {
        answer = { status: err instanceof NetworkError ? 'offline' : 'unavailable' };
      }
      if (step !== current) return;
      if (answer?.status === 'known' && typeof answer.name === 'string' && answer.name) {
        productSheet({ name: answer.name, note: typeof answer.note === 'string' ? answer.note : '', source: 'known', code });
      } else if (answer?.status === 'found' && typeof answer.name === 'string' && answer.name) {
        productSheet({ name: answer.name, note: productNote(answer), source: 'off', code });
      } else {
        typeName(NO_NAME[answer?.status] ?? NO_NAME.unavailable, code);
      }
    }

    // 3a. Nom inconnu : « Taper le nom » fait apparaître le champ
    function typeName(text, code) {
      ++current;
      const reveal = btn('btn--primary btn--block', ['Taper le nom'], () => productSheet({ name: '', note: '', source: 'typed', code }));
      show(message('alert', text), h('div', { class: 'sheet__actions' }, reveal, cancel()));
    }

    // 3b. Fiche du produit : nom (modifiable), note, doublon, ajout
    // source : 'off' (Open Food Facts), 'known' (déjà dans mes listes) ou
    // 'typed' (nom tapé) ; code : code-barres lu ou tapé, gardé avec l'article
    function productSheet({ name, note, source, code }) {
      const found = source === 'off';
      const step = ++current;
      const nameInput = h('input', { class: 'input', ...LABEL_INPUT, value: name, maxlength: '100' });
      const noteInput = h('input', { class: 'input', type: 'text', value: note, maxlength: '500', autocomplete: 'off' });
      const nameField = field('Article', nameInput); // jamais « Nom » (voir LABEL_INPUT)
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
        source === 'known' ? message('check', `Produit connu : ${name}. Vous pouvez corriger le nom avant de l'ajouter.`) : null,
        nameField.field,
        field(found ? 'Note' : 'Note (facultative)', noteInput, { aside: found ? 'facultative : marque et format' : undefined }).field,
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

  return { button, inputs: [picker.input] };
}
