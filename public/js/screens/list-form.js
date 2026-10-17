// Écran « Nouvelle liste » / « Modifier la liste » (maquettes
// formulaire-liste-1 à 3) : nom, catégorie, magasin (seulement pour une
// liste de courses), partage, et suppression de la liste (propriétaire).

import { h, icon, iconButton, field, errorNote, avatar, replace } from '../dom.js';
import { get, put, op, uuid, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { activeOnly, putList, removeList } from '../store.js';
import { compareNames } from '../sorting.js';
import { app, dataChanged, refreshData } from '../app.js';
import { openSheet, confirmDialog, toast } from '../ui.js';

export function renderListForm(listId, onLeave) {
  const container = h('div', { class: 'screen' });
  const editing = listId !== null;

  // Il faut les catégories, magasins (synchro) et les comptes (pour le partage)
  replace(container, h('p', { class: 'empty muted', role: 'status' }, 'Chargement…'));
  let cancelled = false;
  onLeave(() => {
    cancelled = true;
  });
  Promise.all([app.data.loaded ? null : refreshData({ quiet: true }), get('/api/users')])
    .then(([, { users }]) => {
      if (cancelled) return;
      const list = editing ? app.data.lists.get(listId) : null;
      if (editing && !list) {
        navigate('lists', {}, { replace: true });
        return;
      }
      if (editing && !list.isOwner) {
        navigate('list', { id: listId }, { replace: true });
        return;
      }
      replace(container, form(list, users));
    })
    .catch((error) => {
      if (cancelled) return;
      replace(container, h('div', { class: 'empty' },
        h('p', { class: 'empty__text' }, errorMessage(error)),
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => goBack('lists') }, 'Retour')));
    });
  return container;
}

function form(list, users) {
  const me = app.user;

  // --- Nom ---
  const name = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: 'Ex. Courses de la semaine', autocapitalize: 'sentences', value: list?.name ?? '' });
  const nameField = field('Nom', name);

  // --- Catégorie (choix en cartes) ---
  // Les catégories actives, plus la catégorie actuelle de la liste si elle a
  // été désactivée entre-temps (elle reste possible pour cette liste)
  const categories = activeOnly(app.data.categories);
  if (list && !categories.some((c) => c.id === list.category.id)) categories.push(list.category);
  let categoryId = list?.category.id ?? categories[0]?.id ?? null;

  const categoryButtons = categories.map((category) => {
    const button = h('button', { class: 'choice__opt', type: 'button', role: 'radio' },
      icon(category.isShopping ? 'cart' : 'tasks'), category.name);
    button.addEventListener('click', () => {
      categoryId = category.id;
      paint();
    });
    button.dataset.id = String(category.id);
    return button;
  });
  const categoryGroup = h('div', { class: 'choice choice--wrap', role: 'radiogroup', 'aria-labelledby': 'category-label' }, categoryButtons);

  // --- Magasin (listes de courses seulement) ---
  const stores = activeOnly(app.data.stores);
  if (list?.store && !stores.some((s) => s.id === list.store.id)) stores.push(list.store);
  let storeId = list?.store?.id ?? null;
  const storeLabel = h('span');
  const storeButton = h('button', { class: 'input input--select', type: 'button', 'aria-labelledby': 'store-label', onClick: () => chooseStore() }, storeLabel, icon('chev-d'));
  const storeField = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: 'store-label' }, 'Magasin'),
    storeButton,
    h('span', { class: 'field__hint' }, 'Les articles seront classés par rayon.'));

  function chooseStore() {
    const choices = [{ id: null, name: 'Aucun magasin' }, ...stores];
    const rows = choices.map((store) => {
      const on = store.id === storeId;
      return h('button', {
        class: `radio-row${on ? ' is-on' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': String(on),
        onClick: () => {
          storeId = store.id;
          paint();
          sheet.close();
        },
      }, h('span', { class: `radio${on ? ' is-on' : ''}` }), store.name, on ? icon('check', 'icon-end') : null);
    });
    const sheet = openSheet({ title: 'Magasin', content: h('div', { class: 'card picker', role: 'radiogroup', 'aria-label': 'Magasin' }, rows) });
  }

  // --- Partage ---
  // Moi d'abord (toujours inclus), puis les autres comptes actifs ; un
  // invité déjà présent mais désactivé reste affiché (et peut être retiré).
  const guests = new Set((list?.members ?? []).filter((m) => !m.isOwner).map((m) => m.id));
  const people = users.filter((u) => u.id !== me.id).map((u) => ({ ...u, active: true }));
  for (const member of list?.members ?? []) {
    if (!member.isOwner && !people.some((p) => p.id === member.id)) people.push({ ...member, active: false });
  }
  people.sort((a, b) => compareNames(a.displayName, b.displayName));

  const tickRow = (person, { locked = false } = {}) => {
    const on = locked || guests.has(person.id);
    const row = h('button', {
      class: 'tick-row',
      type: 'button',
      role: 'checkbox',
      'aria-checked': String(on),
      'aria-disabled': locked ? 'true' : null,
    },
    h('span', { class: `tick${on ? ' is-on' : ''}` }, on ? icon('check') : null),
    avatar(person.displayName, { second: !locked }),
    h('span', { class: 'grow' }, locked ? `${person.displayName} (vous)` : person.displayName),
    locked ? h('span', { class: 'share__hint' }, 'Toujours inclus') : null,
    !locked && !person.active ? h('span', { class: 'share__hint' }, 'Compte désactivé') : null);
    if (!locked) {
      row.addEventListener('click', () => {
        if (guests.has(person.id)) guests.delete(person.id);
        else guests.add(person.id);
        row.replaceWith(tickRow(person));
      });
    }
    return row;
  };
  const shareGroup = h('div', { class: 'card share' },
    tickRow({ id: me.id, displayName: me.displayName }, { locked: true }),
    people.map((person) => tickRow(person)));

  const error = errorNote();

  // Met à jour l'affichage (catégorie choisie, magasin visible ou non)
  function paint() {
    for (const button of categoryButtons) {
      const on = button.dataset.id === String(categoryId);
      button.setAttribute('aria-checked', String(on));
      button.querySelector('.icon-end')?.remove();
      if (on) button.append(icon('check', 'icon-end'));
    }
    const category = categories.find((c) => c.id === categoryId);
    storeField.hidden = !category?.isShopping;
    storeLabel.textContent = stores.find((s) => s.id === storeId)?.name ?? 'Aucun magasin';
  }
  paint();

  // --- Suppression (propriétaire, liste existante) ---
  const deleteButton = list ? h('button', {
    class: 'btn btn--danger-outline btn--block',
    type: 'button',
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'Supprimer la liste ?',
        text: `« ${list.name} » et ses articles seront supprimés pour toutes les personnes. Cette action est définitive.`,
        confirmLabel: 'Supprimer',
      });
      if (!ok) return;
      try {
        await op({ type: 'list.delete', listId: list.id });
        removeList(app.data, list.id);
        dataChanged();
        toast('Liste supprimée', { low: true });
        navigate('lists', {}, { replace: true });
      } catch (err) {
        error.show(errorMessage(err));
      }
    },
  }, icon('trash', 'icon--sm'), 'Supprimer la liste') : null;

  // --- Enregistrement ---
  const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Enregistrer');
  const formEl = h('form', { novalidate: true },
    h('header', { class: 'topbar' },
      iconButton('close', 'Fermer sans enregistrer', () => goBack(list ? 'list' : 'lists', list ? { id: list.id } : {})),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, list ? 'Modifier la liste' : 'Nouvelle liste'))),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      nameField.field,
      h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'category-label' }, 'Catégorie'), categoryGroup),
      storeField,
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Partager avec'), shareGroup),
      error.note,
      deleteButton)),
    h('div', { class: 'footer' }, save));

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    const cleanName = name.value.replace(/\s+/g, ' ').trim();
    nameField.setError(cleanName ? null : 'Le nom est obligatoire');
    if (!cleanName) {
      name.focus();
      return;
    }
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      error.show('Choisissez une catégorie.');
      return;
    }
    const chosenStore = category.isShopping ? storeId : null;
    save.disabled = true;
    try {
      let id = list?.id;
      if (!list) {
        id = uuid();
        const result = await op({ type: 'list.create', listId: id, name: cleanName, categoryId, storeId: chosenStore });
        putList(app.data, result.list);
      } else {
        await op({ type: 'list.update', listId: id, name: cleanName, categoryId, storeId: chosenStore });
      }
      // Partage : seulement s'il a changé (route réservée au propriétaire)
      const before = new Set((list?.members ?? []).filter((m) => !m.isOwner).map((m) => m.id));
      const changed = before.size !== guests.size || [...guests].some((g) => !before.has(g));
      if (changed) await put(`/api/lists/${id}/members`, { userIds: [...guests] });
      await refreshData({ quiet: true });
      if (!list) {
        navigate('list', { id }, { replace: true });
        toast('Liste créée', {
          action: 'Annuler',
          onAction: async () => {
            try {
              await op({ type: 'list.delete', listId: id });
              removeList(app.data, id);
              dataChanged();
              navigate('lists', {}, { replace: true });
            } catch (err) {
              toast(errorMessage(err));
            }
          },
        });
      } else {
        goBack('list', { id });
      }
    } catch (err) {
      // Le formulaire reste rempli : rien n'est perdu
      error.show(errorMessage(err));
      save.disabled = false;
    }
  });

  return formEl;
}
