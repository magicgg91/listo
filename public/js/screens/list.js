// Écran « Liste » (maquettes liste-1 à 6, liste-multi-1 et 2, liste-photos-1)
// et feuille « Article » (article-1 et 2, article-photo-1 à 4), avec la photo
// en plein écran (photo-plein-ecran-1).
//
// - Le champ d'ajout reste en bas, à portée de pouce ; Entrée valide et le
//   champ reste actif pour enchaîner les articles.
// - Suggestions dès deux lettres ; un article inconnu demande son rayon une
//   fois (liste de courses).
// - Liste « multi » : pas de rayon, les articles sont groupés par magasin.
//   Un article reprend son magasin habituel parmi ceux de la liste ; s'il n'y
//   a jamais été acheté, son magasin est demandé une fois.
// - Photo : une par article, prise ou choisie depuis la feuille Article,
//   réduite sur le téléphone puis envoyée tout de suite (en ligne seulement).
//   Une vignette s'affiche sur la ligne ; un appui l'agrandit.
// - Cocher d'un appui : l'article est barré ET sa case est remplie (jamais
//   la couleur seule) ; il descend en bas de son rayon.

import { h, icon, iconButton, field, replace, errorNote, multiBadge } from '../dom.js';
import { errorMessage } from '../api.js';
import * as actions from '../actions.js';
import { shrinkPhoto, PhotoError } from '../photo.js';
import { navigate, goBack } from '../router.js';
import { splitPrefix } from '../format.js';
import { normalizeItemName } from '../history.js';
import { computeListView, computeSuggestions, isKnownItem, activeOnly, storeChoices, usualStoreFor } from '../store.js';
import { app, onDataChange, refreshData } from '../app.js';
import { syncPill, openSheet, openMenu, confirmDialog, toast, openLightbox } from '../ui.js';
import { openShareSheet } from './share.js';

export function renderList(listId, onLeave) {
  const title = h('h1', { class: 'topbar__title' });
  const sub = h('p', { class: 'topbar__sub' });
  const clearButton = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', hidden: true, onClick: () => clearChecked() });
  const content = h('div', { class: 'scroll' });
  const menuButton = iconButton('more', 'Menu de la liste', () => openListMenu());

  let view = null;

  // --- Dessin de la liste ---
  const draw = () => {
    if (!app.data.loaded) {
      replace(content, h('p', { class: 'empty muted', role: 'status' }, 'Chargement…'));
      return;
    }
    view = computeListView(app.data, listId);
    if (!view) {
      title.textContent = 'Liste introuvable';
      replace(sub);
      clearButton.hidden = true;
      menuButton.hidden = true;
      replace(content, h('div', { class: 'empty' },
        h('h2', { class: 'empty__title' }, 'Liste introuvable'),
        h('p', { class: 'empty__text' }, "Cette liste a été supprimée, ou elle n'est plus partagée avec vous."),
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => navigate('lists', {}, { replace: true }) }, 'Retour à mes listes')));
      addbar.hidden = true;
      return;
    }
    const { list, groups, checked } = view;
    document.title = `${list.name} · Listo`;
    title.textContent = list.name;
    replace(sub, list.store ? [icon('store', 'icon--xs'), list.store.name, view.multi ? multiBadge() : null] : list.category.name);
    menuButton.hidden = false;
    addbar.hidden = false;
    clearButton.hidden = checked === 0;
    replace(clearButton, icon('trash', 'icon--sm'), `Vider les barrés (${checked})`);

    if (groups.length === 0) {
      replace(content, h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon(list.category.isShopping ? 'cart' : 'tasks', 'icon--lg')),
        h('h2', { class: 'empty__title' }, 'Cette liste est vide'),
        h('p', { class: 'empty__text' }, 'Ajoutez un premier article avec le champ ci-dessous.')));
      return;
    }
    const count = (group) => h('span', { class: 'aisle__count', 'aria-label': 'articles restants' }, String(group.items.filter((i) => !i.checked).length));
    replace(content, groups.map((group) => h('section', {},
      // En-tête collant : rayon, ou magasin (avec son icône) dans une liste « multi »
      view.multi
        ? h('h2', { class: 'aisle' }, h('span', { class: 'aisle__name' }, icon('store', 'icon--xs'), group.store?.name ?? 'Sans magasin'), count(group))
        : list.category.isShopping ? h('h2', { class: 'aisle' }, group.aisle?.name ?? 'Sans rayon', count(group)) : null,
      h('ul', {}, group.items.map(itemRow)))));
  };

  // Ligne d'un article : case à cocher + nom (ouvre la feuille « Article »)
  const itemRow = (item) => h('li', { class: `item${item.checked ? ' is-done' : ''}` },
    h('button', {
      class: 'check',
      type: 'button',
      'aria-pressed': String(item.checked),
      'aria-label': `${item.checked ? 'Décocher' : 'Cocher'} ${item.name}`,
      onClick: () => toggle(item),
    }, h('span', { class: 'check__box' }, item.checked ? icon('check') : null)),
    h('button', { class: 'item__body', type: 'button', 'aria-label': `Modifier ${item.name}`, onClick: () => openItemSheet(item) },
      h('span', { class: 'item__text' },
        h('span', { class: 'item__name' }, item.name),
        item.note ? h('span', { class: 'item__note' }, item.note) : null),
      item.quantity ? h('span', { class: 'item__qty' }, item.quantity) : null),
    // Vignette de la photo : un appui l'agrandit
    actions.hasPhoto(item) ? h('button', { class: 'item__photo', type: 'button', 'aria-label': `Agrandir la photo de ${item.name}`, onClick: () => showPhoto(item) },
      h('img', { class: 'photo', src: actions.photoSrc(item), alt: '', loading: 'lazy', decoding: 'async' })) : null);

  // Photo en plein écran, avec en légende la liste et le rayon (ou le magasin)
  function showPhoto(item) {
    const group = view?.multi ? storeName(item.storeId) : view?.list.category.isShopping ? app.data.aisles.find((a) => a.id === item.aisleId)?.name : null;
    openLightbox({
      title: item.name,
      src: actions.photoSrc(item),
      alt: `Photo de l'article ${item.name}`,
      caption: [view?.list.name, group].filter(Boolean).join(' · '),
    });
  }

  // --- Actions ---

  // Cocher / décocher : affiché tout de suite (copie locale), envoyé ensuite
  // (file d'attente : avec ou sans réseau)
  function toggle(item) {
    actions.checkItem(item, !item.checked);
  }

  async function clearChecked() {
    const count = view?.checked ?? 0;
    if (!count) return;
    const ok = await confirmDialog({
      title: 'Vider les barrés ?',
      text: `${count === 1 ? "L'article barré sera retiré" : `Les ${count} articles barrés seront retirés`} de la liste, pour tout le monde.`,
      confirmLabel: 'Vider',
    });
    if (!ok) return;
    const removed = await actions.clearChecked(listId);
    toast(removed === 1 ? '1 article retiré' : `${removed} articles retirés`);
  }

  function openListMenu() {
    if (!view) return;
    const items = [];
    if (view.list.isOwner) items.push({ icon: 'pencil', label: 'Modifier la liste', onSelect: () => navigate('editList', { id: listId }) });
    if (view.list.isOwner) items.push({ icon: 'link', label: 'Partager par lien', onSelect: () => openShareSheet(view.list) });
    if (view.checked > 0) items.push({ icon: 'trash', label: 'Vider les barrés', onSelect: clearChecked });
    items.push({ icon: 'sync', label: 'Actualiser', onSelect: () => refreshData({ full: true }) });
    openMenu(items, { label: 'Menu de la liste' });
  }

  // --- Ajout d'un article ---

  const input = h('input', {
    class: 'addbar__input',
    type: 'text',
    placeholder: 'Ajouter un article',
    'aria-label': 'Ajouter un article',
    autocomplete: 'off',
    autocapitalize: 'sentences',
    enterkeyhint: 'done',
    maxlength: '100',
  });
  const suggestBox = h('div', { class: 'suggest', role: 'listbox', 'aria-label': 'Suggestions', hidden: true });
  const addForm = h('form', { class: 'addbar__row', novalidate: true },
    h('label', { class: 'addbar__field' }, input),
    h('button', { class: 'btn btn--primary btn--icon', type: 'submit', 'aria-label': 'Ajouter' }, icon('plus')));
  const addbar = h('div', { class: 'addbar' }, suggestBox, addForm);

  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addTyped(input.value);
  });
  input.addEventListener('input', drawSuggestions);
  input.addEventListener('focus', drawSuggestions);
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== input) suggestBox.hidden = true;
  }, 150));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') suggestBox.hidden = true;
  });

  // Suggestions : les plus fréquentes d'abord, début tapé en gras
  function drawSuggestions() {
    const typed = input.value;
    const suggestions = typed.trim().length >= 2 ? computeSuggestions(app.data, typed) : [];
    if (!suggestions.length && typed.trim().length < 2) {
      suggestBox.hidden = true;
      return;
    }
    const exact = suggestions.some((s) => normalizeItemName(s.name) === normalizeItemName(typed));
    const option = (content, aisle, onPick, extraClass = '') => h('button', {
      class: `suggest__item ${extraClass}`.trim(),
      type: 'button',
      role: 'option',
      // Garde le clavier ouvert : le champ ne perd pas le focus
      onPointerdown: (event) => event.preventDefault(),
      onClick: onPick,
    }, content, aisle ? h('span', { class: 'suggest__aisle' }, aisle) : null);

    // À droite de la suggestion : rayon habituel, ou magasin habituel (« multi »)
    const hintFor = (s) => {
      if (view?.multi) return storeName(usualStoreFor(app.data, view.list, s.name));
      return view?.list.category.isShopping ? s.aisleName : null;
    };
    replace(suggestBox,
      suggestions.map((s) => {
        const [start, rest] = splitPrefix(s.name, typed);
        return option(h('span', {}, h('strong', {}, start), rest), hintFor(s), () => addTyped(s.name));
      }),
      exact ? null : option([icon('plus'), h('span', {}, `Ajouter « ${typed.trim()} »`)], 'Nouvel article', () => addTyped(typed), 'suggest__item--new'));
    suggestBox.hidden = false;
  }

  // Ajoute ce qui a été tapé (ou la suggestion choisie)
  async function addTyped(text) {
    const name = text.replace(/\s+/g, ' ').trim();
    if (!name || !view) return;
    suggestBox.hidden = true;
    if (view.multi) {
      // Liste « multi » : magasin habituel, sinon on le demande une fois
      const storeId = usualStoreFor(app.data, view.list, name);
      if (storeId === null) {
        const sub = isKnownItem(app.data, name)
          ? `« ${name} » n'a encore jamais été acheté dans ces magasins. Son magasin sera retenu pour la prochaine fois.`
          : `« ${name} » est un nouvel article. Son magasin sera retenu pour la prochaine fois.`;
        const chosen = await pickStore({ title: 'Dans quel magasin ?', sub, confirmLabel: 'Ajouter à la liste' });
        if (chosen === undefined) return; // fenêtre fermée sans choisir
        input.value = '';
        await createItem(name, { storeId: chosen });
      } else {
        // Magasin habituel : le serveur le choisira (le téléphone l'affiche déjà)
        input.value = '';
        await createItem(name);
      }
    } else if (view.list.category.isShopping && !isKnownItem(app.data, name)) {
      // Article inconnu sur une liste de courses : on demande son rayon une fois
      const aisleId = await pickAisle({ title: 'Dans quel rayon ?', sub: `« ${name} » est un nouvel article. Son rayon sera retenu pour la prochaine fois.`, confirmLabel: 'Ajouter à la liste' });
      if (aisleId === undefined) return; // fenêtre fermée sans choisir
      input.value = '';
      await createItem(name, { aisleId });
    } else {
      input.value = '';
      await createItem(name);
    }
    input.focus();
  }

  // Ajout : tout de suite dans la copie locale, puis envoyé (file d'attente)
  async function createItem(name, fields = {}) {
    await actions.addItem({ listId, name, ...fields });
  }

  // --- Feuille « Article » : nom, quantité, note, rayon (ou magasin) ---

  function openItemSheet(item) {
    const multi = Boolean(view?.multi);
    const isShopping = view?.list.category.isShopping && !multi; // rayon seulement hors « multi »
    const name = h('input', { class: 'input', type: 'text', value: item.name, maxlength: '100', autocapitalize: 'sentences' });
    const quantity = h('input', { class: 'input', type: 'text', value: item.quantity, maxlength: '30' });
    const note = h('textarea', { class: 'input input--area', rows: '2', maxlength: '500' });
    note.value = item.note;
    let aisleId = item.aisleId;
    const aisleLabel = h('span');
    const showAisle = () => {
      aisleLabel.textContent = app.data.aisles.find((a) => a.id === aisleId)?.name ?? 'Sans rayon';
    };
    showAisle();
    const aisleButton = h('button', {
      class: 'input input--select',
      type: 'button',
      onClick: async () => {
        const chosen = await pickAisle({ title: 'Rayon', current: aisleId, keep: aisleId, confirmLabel: 'Choisir' });
        if (chosen !== undefined) {
          aisleId = chosen;
          showAisle();
        }
      },
    }, aisleLabel, icon('chev-d'));
    // Magasin de l'article (liste « multi »)
    let storeId = item.storeId ?? null;
    const storeLabel = h('span', { class: 'input__value' });
    const showStore = () => replace(storeLabel, icon('store', 'icon--sm'), storeName(storeId) ?? 'Sans magasin');
    showStore();
    const storeButton = h('button', {
      class: 'input input--select',
      type: 'button',
      'aria-labelledby': 'store-label',
      onClick: async () => {
        const chosen = await pickStore({ title: 'Magasin', current: storeId, keep: storeId, confirmLabel: 'Choisir' });
        if (chosen !== undefined) {
          storeId = chosen;
          showStore();
        }
      },
    }, storeLabel, icon('chev-d'));

    const nameField = field('Nom', name);
    const error = errorNote();

    // --- Photo (facultative) : envoyée ou retirée tout de suite, sans
    // attendre « Enregistrer ». Hors ligne, les boutons sont désactivés.
    let current = item; // dernier état connu de l'article (photoAt)
    let busy = false;
    let gone = false; // article supprimé ailleurs pendant que la feuille est ouverte
    const photoArea = h('div');
    const photoNote = h('p', { class: 'field__hint', role: 'status', hidden: true });
    // Sélecteurs du téléphone (cachés) : appareil photo, ou galerie
    const camera = h('input', { class: 'visually-hidden', type: 'file', accept: 'image/*', capture: 'environment', tabindex: '-1', 'aria-hidden': 'true' });
    const gallery = h('input', { class: 'visually-hidden', type: 'file', accept: 'image/*', tabindex: '-1', 'aria-hidden': 'true' });
    camera.addEventListener('change', () => sendPhoto(camera));
    gallery.addEventListener('change', () => sendPhoto(gallery));

    const drawPhoto = () => {
      const button = (classes, iconName, text, label, onClick) => h('button', {
        class: `btn ${classes}`, type: 'button', 'aria-label': label, disabled: busy || gone, onClick,
      }, icon(iconName, 'icon--sm'), text);
      if (actions.hasPhoto(current)) {
        replace(photoArea, h('div', { class: 'photo-block' },
          h('button', { class: 'photo-block__thumb', type: 'button', 'aria-label': `Agrandir la photo de ${current.name}`, onClick: () => showPhoto(current) },
            h('img', { class: 'photo', src: actions.photoSrc(current), alt: '' })),
          h('div', { class: 'photo-block__actions' },
            button('btn--secondary btn--sm', 'camera', 'Remplacer', 'Remplacer la photo', () => gallery.click()),
            button('btn--danger-outline btn--sm', 'trash', 'Retirer', 'Retirer la photo', removePhoto))));
      } else {
        replace(photoArea, h('div', { class: 'photo-actions' },
          button('btn--secondary', 'camera', 'Appareil photo', 'Appareil photo : prendre une photo', () => camera.click()),
          button('btn--secondary', 'image', 'Galerie', 'Galerie : choisir une photo', () => gallery.click())));
      }
      photoNote.textContent = busy ? 'Préparation de la photo…' : current.localPhoto ? 'Photo en attente d\'envoi : elle partira dès que possible.' : '';
      photoNote.hidden = !photoNote.textContent;
    };

    // Photo prise ou choisie : réduite ici, puis mise en file d'attente (elle
    // part tout de suite avec du réseau, sinon dès son retour)
    async function sendPhoto(input) {
      const file = input.files?.[0];
      input.value = ''; // la même photo pourra être choisie de nouveau
      if (!file) return;
      error.show('');
      busy = true;
      drawPhoto();
      try {
        await actions.setPhoto(current, await shrinkPhoto(file));
        current = app.data.items.get(item.id) ?? current;
      } catch (err) {
        error.show(err instanceof PhotoError ? err.message : errorMessage(err));
      }
      busy = false;
      drawPhoto();
    }

    async function removePhoto() {
      const ok = await confirmDialog({ title: 'Retirer la photo ?', text: 'La photo sera supprimée pour toutes les personnes de la liste.', confirmLabel: 'Retirer' });
      if (!ok) return;
      await actions.removePhoto(current);
      current = app.data.items.get(item.id) ?? current;
      drawPhoto();
    }
    drawPhoto();

    // Quelqu'un d'autre modifie ou supprime cet article pendant que la
    // feuille est ouverte (temps réel) : ce qui a été tapé est gardé, un
    // bandeau prévient. À l'enregistrement, seuls les champs changés ici sont
    // envoyés. Article supprimé : on ne peut plus que fermer la feuille.
    // (Comparaison sur le contenu de l'article : nom, quantité, note, rayon,
    // magasin. Ma propre photo, ou la version renvoyée par le serveur après
    // mon envoi, ne déclenchent pas d'avertissement.)
    const conflictText = h('span');
    const conflict = h('div', { class: 'note', role: 'status', hidden: true }, icon('alert'), conflictText);
    const contentOf = (it) => JSON.stringify([it.name, it.quantity, it.note, it.aisleId ?? null, it.storeId ?? null]);
    let seen = contentOf(item);
    let mine = false; // vrai pendant mes propres enregistrements
    const stopWatching = onDataChange(() => {
      if (mine) return;
      const latest = app.data.items.get(item.id);
      if (!latest) {
        if (gone) return;
        gone = true;
        conflictText.textContent = 'Cet article a été supprimé par une autre personne.';
      } else {
        const changedElsewhere = gone || contentOf(latest) !== seen;
        gone = false;
        current = latest;
        seen = contentOf(latest);
        drawPhoto();
        if (!changedElsewhere) return;
        conflictText.textContent = "Cet article vient d'être modifié par une autre personne. Seuls vos changements seront enregistrés.";
      }
      conflict.hidden = false;
      save.disabled = gone;
      remove.disabled = gone;
      drawPhoto();
    });

    const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Enregistrer');
    const remove = h('button', { class: 'btn btn--danger-outline btn--block', type: 'button' }, icon('trash', 'icon--sm'), 'Supprimer');
    const form = h('form', { class: 'stack', novalidate: true },
      conflict,
      nameField.field,
      field('Quantité', quantity, { hint: 'Texte libre, par exemple 2 ou 500 g' }).field,
      field('Note (facultative)', note).field,
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Photo (facultative)'), photoArea, photoNote, camera, gallery),
      isShopping ? h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'aisle-label' }, 'Rayon'), aisleButton) : null,
      multi ? h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'store-label' }, 'Magasin'), storeButton) : null,
      error.note,
      h('div', { class: 'sheet__actions' }, save, remove));
    if (isShopping) aisleButton.setAttribute('aria-labelledby', 'aisle-label');

    const sheet = openSheet({
      title: "Modifier l'article",
      content: form,
      scroll: true,
      onClose: () => stopWatching(),
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newName = name.value.replace(/\s+/g, ' ').trim();
      nameField.setError(newName ? null : 'Le nom est obligatoire');
      if (!newName) return;
      const changes = {};
      if (newName !== item.name) changes.name = newName;
      if (quantity.value.trim() !== item.quantity) changes.quantity = quantity.value.trim();
      if (note.value.trim() !== item.note) changes.note = note.value.trim();
      if (isShopping && aisleId !== item.aisleId) changes.aisleId = aisleId;
      if (multi && storeId !== (item.storeId ?? null)) changes.storeId = storeId;
      if (!Object.keys(changes).length) {
        sheet.close();
        return;
      }
      // Ma propre modification (pas d'avertissement) : copie locale tout de
      // suite, puis envoi (file d'attente). Historique mis à jour par actions.js.
      mine = true;
      await actions.updateItem(item, changes);
      sheet.close();
    });

    remove.addEventListener('click', async () => {
      mine = true;
      await actions.deleteItem(item);
      sheet.close();
      // « Annuler » remet le même article, avec sa photo
      toast(`« ${item.name} » supprimé`, { action: 'Annuler', onAction: () => actions.restoreItem(item.id) });
    });
  }

  // Feuille de choix du rayon (article-2). Renvoie l'id du rayon choisi,
  // null pour « Sans rayon », ou undefined si la feuille est fermée.
  // keep : rayon actuel, gardé dans la liste même s'il a été désactivé.
  function pickAisle({ title, sub, current, keep = null, confirmLabel }) {
    const aisles = activeOnly(app.data.aisles);
    if (keep !== null && !aisles.some((a) => a.id === keep)) {
      const old = app.data.aisles.find((a) => a.id === keep);
      if (old) aisles.unshift(old);
    }
    const choices = [...aisles.map((a) => ({ id: a.id, name: a.name })), { id: null, name: 'Sans rayon' }];
    return pickChoice({ title, sub, current, confirmLabel, choices, label: 'Rayon' });
  }

  // Feuille de choix du magasin d'un article dans une liste « multi »
  // (article-photo-4) : les magasins regroupés et actifs, puis « Sans
  // magasin ». keep : magasin actuel, gardé dans la liste même s'il a été
  // désactivé ou retiré du regroupement. Mêmes valeurs renvoyées que pickAisle.
  function pickStore({ title, sub, current, keep = null, confirmLabel }) {
    const stores = storeChoices(app.data, view.list);
    if (keep !== null && !stores.some((s) => s.id === keep)) {
      const old = app.data.stores.find((s) => s.id === keep);
      if (old) stores.unshift(old);
    }
    const choices = [...stores.map((s) => ({ id: s.id, name: s.name })), { id: null, name: 'Sans magasin' }];
    return pickChoice({ title, sub, current, confirmLabel, choices, label: 'Magasin' });
  }

  // Feuille de choix unique (lignes radio + bouton de confirmation)
  function pickChoice({ title, sub, current, confirmLabel, choices, label }) {
    return new Promise((resolve) => {
      let selected = current === undefined ? undefined : current;
      let result;
      const confirm = h('button', { class: 'btn btn--primary btn--block', type: 'button', disabled: selected === undefined }, confirmLabel);
      const rows = choices.map((choice) => {
        const row = h('button', { class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false' }, h('span', { class: 'radio' }), choice.name);
        row.addEventListener('click', () => {
          selected = choice.id;
          paint();
        });
        row.dataset.id = String(choice.id);
        return row;
      });
      const paint = () => {
        for (const row of rows) {
          const on = row.dataset.id === String(selected);
          row.classList.toggle('is-on', on);
          row.setAttribute('aria-checked', String(on));
          row.querySelector('.radio').classList.toggle('is-on', on);
          row.querySelector('.icon-end')?.remove();
          if (on) row.append(icon('check', 'icon-end'));
        }
        confirm.disabled = selected === undefined;
      };
      paint();
      const sheet = openSheet({
        title,
        sub,
        content: [h('div', { class: 'card picker', role: 'radiogroup', 'aria-label': label }, rows), confirm],
        onClose: () => resolve(result),
      });
      confirm.addEventListener('click', () => {
        result = selected;
        sheet.close();
      });
    });
  }

  // Nom d'un magasin (null si inconnu)
  function storeName(id) {
    return id === null || id === undefined ? null : app.data.stores.find((store) => store.id === id)?.name ?? null;
  }

  // --- Montage de l'écran ---

  onLeave(onDataChange(draw));
  onLeave(() => {
    document.title = 'Listo';
  });
  draw();
  refreshData({ quiet: true }); // actualisation à l'ouverture

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', 'Retour à mes listes', () => goBack('lists'), 'mobile-only'),
      h('div', { class: 'topbar__main' }, title, sub),
      menuButton),
    h('div', { class: 'statusbar' }, syncPill(() => refreshData({ full: true })), clearButton),
    content,
    addbar);
}
