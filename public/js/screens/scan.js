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

import { isShoppingList } from '../list-types.js';
import { h, icon, field, replace, LABEL_INPUT } from '../dom.js';
import { post, NetworkError } from '../api.js';
import { readBarcode, barcodeProblem, normalizeBarcode, ReaderUnavailable, ImageUnreadable } from '../barcode.js';
import { duplicateOf, duplicateText, listItemForEan, knownItemForEan } from '../store.js';
import { openSheet, toast, releaseFocus } from '../ui.js';
import { createImagePicker } from '../photo.js';
import { keepFieldFocus } from '../tap.js';
import { app } from '../app.js';
import { t } from '../i18n.js';

// Bouton visible : liste de courses, et recherche activée sur le serveur
// (LISTO_PRODUCT_LOOKUP). Un ancien compte gardé hors ligne, sans
// l'information, garde le bouton.
export const scanAvailable = (list) => isShoppingList(list) && app.user?.productLookup !== false;

// Note proposée pour l'article : « Lactel · 1 L » (marque · format)
export const productNote = (product) => [product.brand, product.quantity].filter(Boolean).join(' · ');

// Messages quand le nom n'a pas été trouvé (jamais de détail technique).
// Une fonction : les textes sont lus dans la langue choisie au moment voulu.
const noNameMessages = () => ({
  unknown: t('scan.sansNom.inconnu'),
  unavailable: t('scan.sansNom.indisponible'),
  offline: t('scan.sansNom.horsLigne'),
});

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
  // photothèque, au choix du téléphone ; sur Android, une petite feuille
  // propose d'abord les deux, voir photo.js) ; la même lecture ensuite
  const picker = createImagePicker((file) => {
    session ??= openSession();
    session.scan(file);
  }, { title: t('scan.titre') });
  // Clavier ouvert : l'appui sur « Scanner » ne retire pas le curseur du
  // champ d'ajout (keepFieldFocus de tap.js), sinon la barre d'ajout bougeait
  // et le click tombait à côté (deux appuis nécessaires). Le click arrivé,
  // le champ perd le curseur (clavier replié) puis le sélecteur s'ouvre.
  const button = picker.button({
    class: 'btn btn--secondary btn--icon',
    'aria-label': t('scan.titre'),
    onPointerdown: keepFieldFocus.pointerdown,
    onMousedown: keepFieldFocus.mousedown,
  }, icon('barcode'));
  button.addEventListener('click', releaseFocus, true); // avant l'ouverture

  // --- Feuille « Scanner un produit » ---
  function openSession() {
    const body = h('div', { class: 'stack' });
    let current = 0; // numéro de l'étape en cours (une réponse en retard est ignorée)

    const sheet = openSheet({
      title: t('scan.titre'),
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
    const retake = () => picker.button({ class: 'btn btn--primary btn--block' }, icon('camera', 'icon--sm'), t('scan.reessayer'));
    // « Annuler » : la feuille se ferme (un champ qui avait le curseur le perd)
    const cancel = () => btn('btn--secondary btn--block', [t('scan.annuler')], () => sheet.close());

    // Saisie du code à la main : le champ n'apparaît que sur appui
    function manualCode(intro) {
      const step = ++current;
      const input = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '20', enterkeyhint: 'search' });
      const codeField = field(t('scan.code.libelle'), input, { aside: t('scan.code.aide') });
      const search = btn('btn--primary btn--block', [t('scan.code.rechercher')], submit);
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
      const reveal = btn('btn--secondary btn--block', [t('scan.code.saisir')], () => {
        reveal.hidden = true;
        form.hidden = false;
      });
      show(intro, h('div', { class: 'sheet__actions' }, retake(), reveal), form, cancel());
    }

    // 1. Lecture du code sur la photo
    async function scan(file) {
      const step = ++current;
      show(status(t('scan.lecture')));
      let code = null;
      try {
        code = await readBarcode(file);
      } catch (err) {
        if (step !== current) return;
        if (err instanceof ImageUnreadable) {
          manualCode(message('alert', t('scan.lecture.illisible'), true));
        } else {
          // Lecteur indisponible (pas encore téléchargé et hors ligne, mode
          // Isolement de l'iPhone…) : saisie à la main
          manualCode(message('alert', t('scan.lecture.indisponible'), true));
        }
        return;
      }
      if (step !== current) return;
      if (!code) {
        manualCode(message('alert', t('scan.lecture.nonLu'), true));
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
        ? btn('btn--primary btn--block', [t('scan.liste.remettre')], () => {
          check(item, false);
          done(t('scan.liste.remis', { name: item.name }));
        })
        : btn('btn--primary btn--block', [icon('check', 'icon--sm'), t('scan.liste.cocher')], () => {
          check(item, true);
          done(t('scan.liste.coche', { name: item.name }));
        });
      const again = btn('btn--secondary btn--block', [t('scan.ajouterQuandMeme')], () => productSheet({ name: item.name, note: item.note ?? '', source: 'known', code }));
      show(message(item.checked ? 'check' : 'alert', item.checked ? t('scan.liste.dejaCoche', { name: item.name }) : t('scan.liste.dejaPresent', { name: item.name })),
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
      show(status(t('scan.recherche')));
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
        const messages = noNameMessages();
        typeName(messages[answer?.status] ?? messages.unavailable, code);
      }
    }

    // 3a. Nom inconnu : « Taper le nom » fait apparaître le champ
    function typeName(text, code) {
      ++current;
      const reveal = btn('btn--primary btn--block', [t('scan.taperNom')], () => productSheet({ name: '', note: '', source: 'typed', code }));
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
      const nameField = field(t('scan.fiche.champNom'), nameInput); // jamais « Nom » (voir LABEL_INPUT)
      const warning = h('div', { class: 'note', role: 'status', hidden: true }, icon('alert'), h('p'));
      const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('scan.fiche.ajouter'));
      // Déjà dans la liste (même nom) : prévenir, et « Ajouter quand même »
      const checkDuplicate = () => {
        const duplicate = duplicateOf(getView(), nameInput.value, code);
        warning.hidden = !duplicate;
        warning.querySelector('p').textContent = duplicate ? duplicateText(duplicate) : '';
        save.textContent = duplicate ? t('scan.ajouterQuandMeme') : t('scan.fiche.ajouter');
      };
      nameInput.addEventListener('input', checkDuplicate);
      checkDuplicate();
      const form = h('form', { class: 'stack', novalidate: true },
        found ? message('check', t('scan.fiche.trouve')) : null,
        source === 'known' ? message('check', t('scan.fiche.connu', { name })) : null,
        nameField.field,
        field(found ? t('scan.fiche.note') : t('scan.fiche.noteFacultative'), noteInput, { aside: found ? t('scan.fiche.note.aide') : undefined }).field,
        warning,
        found ? h('p', { class: 'field__hint' }, t('scan.fiche.source')) : null,
        h('div', { class: 'sheet__actions' }, save, cancel()));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const finalName = nameInput.value.replace(/\s+/g, ' ').trim();
        nameField.setError(finalName ? null : t('scan.fiche.champNom.obligatoire'));
        if (!finalName || step !== current) return;
        releaseFocus(); // nom validé : le clavier se replie
        save.disabled = true;
        const item = await add(finalName, { note: noteInput.value.replace(/\s+/g, ' ').trim(), ean: code });
        save.disabled = false;
        if (!item || step !== current) return; // choix du rayon abandonné : la fiche reste
        // L'ajout se termine : retour sur la liste, aucun champ actif
        sheet.close();
        releaseFocus();
        toast(t('scan.fiche.ajoute', { name: finalName }), { duration: 2500 });
      });
      show(form);
    }

    return { scan };
  }

  return { button, inputs: [picker.input] };
}
