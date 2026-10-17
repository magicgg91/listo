// Écran « Liste » (maquettes liste-1 à 6) et feuille « Article »
// (article-1 et 2).
//
// - Le champ d'ajout reste en bas, à portée de pouce ; Entrée valide et le
//   champ reste actif pour enchaîner les articles.
// - Suggestions dès deux lettres ; un article inconnu demande son rayon une
//   fois (liste de courses).
// - Cocher d'un appui : l'article est barré ET sa case est remplie (jamais
//   la couleur seule) ; il descend en bas de son rayon.

import { h, icon, iconButton, field, replace, errorNote } from '../dom.js';
import { op, uuid, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { splitPrefix } from '../format.js';
import { normalizeItemName } from '../history.js';
import { computeListView, computeSuggestions, isKnownItem, putItem, removeItem, rememberItem, activeOnly } from '../store.js';
import { app, onDataChange, dataChanged, refreshData } from '../app.js';
import { syncPill, openSheet, openMenu, confirmDialog, toast } from '../ui.js';

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
    replace(sub, list.store ? [icon('store', 'icon--xs'), list.store.name] : list.category.name);
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
    replace(content, groups.map((group) => h('section', {},
      list.category.isShopping
        ? h('h2', { class: 'aisle' }, group.aisle?.name ?? 'Sans rayon',
          h('span', { class: 'aisle__count', 'aria-label': 'articles restants' }, String(group.items.filter((i) => !i.checked).length)))
        : null,
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
      item.quantity ? h('span', { class: 'item__qty' }, item.quantity) : null));

  // --- Actions ---

  // Cocher / décocher : affiché tout de suite, annulé si le serveur refuse
  async function toggle(item) {
    const wanted = !item.checked;
    putItem(app.data, { ...item, checked: wanted });
    dataChanged();
    try {
      const result = await op({ type: 'item.check', itemId: item.id, checked: wanted });
      putItem(app.data, result.item);
    } catch (error) {
      putItem(app.data, item);
      toast(errorMessage(error));
    }
    dataChanged();
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
    try {
      const result = await op({ type: 'list.clearChecked', listId });
      for (const item of [...app.data.items.values()]) if (item.listId === listId && item.checked) removeItem(app.data, item.id);
      dataChanged();
      toast(result.removed === 1 ? '1 article retiré' : `${result.removed} articles retirés`);
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  function openListMenu() {
    if (!view) return;
    const items = [];
    if (view.list.isOwner) items.push({ icon: 'pencil', label: 'Modifier la liste', onSelect: () => navigate('editList', { id: listId }) });
    if (view.checked > 0) items.push({ icon: 'trash', label: 'Vider les barrés', onSelect: clearChecked });
    items.push({ icon: 'sync', label: 'Actualiser', onSelect: () => refreshData() });
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

    replace(suggestBox,
      suggestions.map((s) => {
        const [start, rest] = splitPrefix(s.name, typed);
        return option(h('span', {}, h('strong', {}, start), rest), view?.list.category.isShopping ? s.aisleName : null, () => addTyped(s.name));
      }),
      exact ? null : option([icon('plus'), h('span', {}, `Ajouter « ${typed.trim()} »`)], 'Nouvel article', () => addTyped(typed), 'suggest__item--new'));
    suggestBox.hidden = false;
  }

  // Ajoute ce qui a été tapé (ou la suggestion choisie)
  async function addTyped(text) {
    const name = text.replace(/\s+/g, ' ').trim();
    if (!name || !view) return;
    suggestBox.hidden = true;
    // Article inconnu sur une liste de courses : on demande son rayon une fois
    if (view.list.category.isShopping && !isKnownItem(app.data, name)) {
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

  async function createItem(name, fields = {}) {
    try {
      const result = await op({ type: 'item.create', listId, itemId: uuid(), name, ...fields });
      putItem(app.data, result.item);
      rememberItem(app.data, name, result.item.aisleId);
      dataChanged();
    } catch (error) {
      // Rien n'est perdu : le texte revient dans le champ
      if (!input.value) input.value = name;
      toast(errorMessage(error));
    }
  }

  // --- Feuille « Article » : nom, quantité, note, rayon ---

  function openItemSheet(item) {
    const isShopping = view?.list.category.isShopping;
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
    const nameField = field('Nom', name);
    const error = errorNote();

    const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Enregistrer');
    const remove = h('button', { class: 'btn btn--danger-outline btn--block', type: 'button' }, icon('trash', 'icon--sm'), 'Supprimer');
    const form = h('form', { class: 'stack', novalidate: true },
      nameField.field,
      field('Quantité', quantity, { hint: 'Texte libre, par exemple 2 ou 500 g' }).field,
      field('Note (facultative)', note).field,
      isShopping ? h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'aisle-label' }, 'Rayon'), aisleButton) : null,
      error.note,
      h('div', { class: 'sheet__actions' }, save, remove));
    if (isShopping) aisleButton.setAttribute('aria-labelledby', 'aisle-label');

    const sheet = openSheet({ title: "Modifier l'article", content: form });

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
      if (!Object.keys(changes).length) {
        sheet.close();
        return;
      }
      save.disabled = true;
      try {
        const result = await op({ type: 'item.update', itemId: item.id, ...changes });
        putItem(app.data, result.item);
        if (changes.name || 'aisleId' in changes) rememberItem(app.data, result.item.name, isShopping ? result.item.aisleId : null, { count: 0 });
        dataChanged();
        sheet.close();
      } catch (err) {
        // La feuille reste ouverte avec ce qui a été saisi
        error.show(errorMessage(err));
        save.disabled = false;
      }
    });

    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await op({ type: 'item.delete', itemId: item.id });
        removeItem(app.data, item.id);
        dataChanged();
        sheet.close();
        toast(`« ${item.name} » supprimé`, {
          action: 'Annuler',
          onAction: () => createItem(item.name, { quantity: item.quantity, note: item.note, aisleId: item.aisleId }),
        });
      } catch (err) {
        error.show(errorMessage(err));
        remove.disabled = false;
      }
    });
  }

  // Feuille de choix du rayon (article-2). Renvoie l'id du rayon choisi,
  // null pour « Sans rayon », ou undefined si la feuille est fermée.
  // keep : rayon actuel, gardé dans la liste même s'il a été désactivé.
  function pickAisle({ title, sub, current, keep = null, confirmLabel }) {
    return new Promise((resolve) => {
      let selected = current === undefined ? undefined : current;
      let result;
      const aisles = activeOnly(app.data.aisles);
      if (keep !== null && !aisles.some((a) => a.id === keep)) {
        const old = app.data.aisles.find((a) => a.id === keep);
        if (old) aisles.unshift(old);
      }
      const choices = [...aisles.map((a) => ({ id: a.id, name: a.name })), { id: null, name: 'Sans rayon' }];
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
        content: [h('div', { class: 'card picker', role: 'radiogroup', 'aria-label': 'Rayon' }, rows), confirm],
        onClose: () => resolve(result),
      });
      confirm.addEventListener('click', () => {
        result = selected;
        sheet.close();
      });
    });
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
    h('div', { class: 'statusbar' }, syncPill(() => refreshData()), clearButton),
    content,
    addbar);
}
