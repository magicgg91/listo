// Écran « Nouvelle liste » / « Modifier la liste » (maquettes
// formulaire-liste-1 à 3, formulaire-liste-multi-1 et 2) : nom, catégorie,
// magasin simple ou « multi » (seulement pour une liste de courses), partage,
// et suppression de la liste (propriétaire).

import { h, icon, iconButton, field, errorNote, avatar, replace, multiBadge } from '../dom.js';
import { put, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { activeOnly } from '../store.js';
import * as actions from '../actions.js';
import { compareNames } from '../sorting.js';
import { app, refreshData, pendingCount } from '../app.js';
import { openSheet, toast } from '../ui.js';
import { deleteListWithConfirm } from './list-actions.js';

export function renderListForm(listId, onLeave) {
  const container = h('div', { class: 'screen' });
  const editing = listId !== null;

  // Il faut les catégories, magasins et comptes (copie locale, rafraîchie à
  // l'ouverture pour proposer un magasin ajouté entre-temps)
  replace(container, h('p', { class: 'empty muted', role: 'status' }, 'Chargement…'));
  let cancelled = false;
  onLeave(() => {
    cancelled = true;
  });
  // Comptes proposés au partage : copie locale (disponible sans réseau)
  refreshData({ quiet: true })
    .then(() => {
      const users = app.data.users;
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
  const storeLabel = h('span', { class: 'input__value' });
  const storeHint = h('span', { class: 'field__hint' });
  const storeButton = h('button', { class: 'input input--select', type: 'button', 'aria-labelledby': 'store-label', onClick: () => chooseStore() }, storeLabel, icon('chev-d'));
  const storeField = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: 'store-label' }, 'Magasin'),
    storeButton,
    storeHint);

  // Nombre de magasins regroupés par un « multi », en toutes lettres
  const membersLabel = (store) => {
    const count = store.storeIds?.length ?? 0;
    return `${count} magasin${count > 1 ? 's' : ''}`;
  };

  // Feuille de choix (formulaire-liste-multi-2) : magasins simples (classés
  // par rayon), puis magasins « multi » ; on choisit, puis « Choisir ».
  function chooseStore() {
    let selected = storeId;
    const rows = [];
    const radio = (store, sub) => {
      const row = h('button', { class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false' },
        h('span', { class: 'radio' }),
        h('span', { class: 'grow' }, h('span', { class: 'row__title' }, store.name), sub ? h('span', { class: 'row__sub' }, sub) : null),
        store.isMulti ? multiBadge() : null);
      row.addEventListener('click', () => {
        selected = store.id;
        paintRows();
      });
      row.dataset.id = String(store.id);
      rows.push(row);
      return row;
    };
    const paintRows = () => {
      for (const row of rows) {
        const on = row.dataset.id === String(selected);
        row.classList.toggle('is-on', on);
        row.setAttribute('aria-checked', String(on));
        row.querySelector('.radio').classList.toggle('is-on', on);
        row.querySelector('.icon-end')?.remove();
        if (on) row.append(icon('check', 'icon-end'));
      }
    };
    const simples = stores.filter((store) => !store.isMulti);
    const multis = stores.filter((store) => store.isMulti);
    const confirm = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, 'Choisir');
    const content = h('div', { class: 'picker stack' },
      h('span', { class: 'field__label', id: 'single-stores' }, 'Un seul magasin'),
      h('div', { class: 'card', role: 'radiogroup', 'aria-labelledby': 'single-stores' },
        radio({ id: null, name: 'Aucun magasin' }, 'Classé par rayon'),
        simples.map((store) => radio(store, 'Classé par rayon'))),
      multis.length ? [
        h('span', { class: 'field__label', id: 'multi-stores' }, 'Plusieurs magasins'),
        h('div', { class: 'card', role: 'radiogroup', 'aria-labelledby': 'multi-stores' }, multis.map((store) => radio(store, membersLabel(store)))),
      ] : null);
    paintRows();
    const sheet = openSheet({ title: 'Magasin', content: [content, confirm] });
    // Le magasin déjà choisi est visible même s'il est bas dans la liste
    rows.find((row) => row.dataset.id === String(selected))?.scrollIntoView({ block: 'nearest' });
    confirm.addEventListener('click', () => {
      storeId = selected;
      paint();
      sheet.close();
    });
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
  // Hors ligne : le partage ne peut pas être changé (il demande le serveur)
  const shareNote = h('p', { class: 'field__hint', hidden: true }, 'Partage indisponible hors ligne : la liste peut être enregistrée, le partage se changera avec du réseau.');
  let painted = false;
  const paintShare = () => {
    if (painted && !shareGroup.isConnected) { // formulaire quitté
      window.removeEventListener('online', paintShare);
      window.removeEventListener('offline', paintShare);
      return;
    }
    painted = true;
    const offline = !navigator.onLine;
    shareNote.hidden = !offline;
    shareGroup.inert = offline;
    shareGroup.classList.toggle('is-off', offline);
  };
  paintShare();
  window.addEventListener('online', paintShare);
  window.addEventListener('offline', paintShare);

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
    const store = stores.find((s) => s.id === storeId);
    replace(storeLabel, icon('store', 'icon--sm'), store?.name ?? 'Aucun magasin', store?.isMulti ? multiBadge() : null);
    storeHint.textContent = store?.isMulti ? 'Les articles seront classés par magasin, sans rayons.' : 'Les articles seront classés par rayon.';
  }
  paint();

  // --- Suppression (propriétaire, liste existante) ---
  // Même confirmation et même opération que les menus (list-actions.js)
  const deleteButton = list ? h('button', {
    class: 'btn btn--danger-outline btn--block',
    type: 'button',
    onClick: async () => {
      if (await deleteListWithConfirm(list)) navigate('lists', {}, { replace: true });
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
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Partager avec'), shareGroup, shareNote),
      error.note,
      deleteButton)),
    h('div', { class: 'footer' }, save));

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    const cleanName = name.value.replace(/\s+/g, ' ').trim();
    // Nom vide : le champ est signalé sous lui-même, sans y mettre le curseur
    nameField.setError(cleanName ? null : 'Le nom est obligatoire');
    if (!cleanName) return;
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      error.show('Choisissez une catégorie.');
      return;
    }
    const chosenStore = category.isShopping ? storeId : null;
    save.disabled = true;
    // Liste : tout de suite dans la copie locale, envoyée ensuite (file
    // d'attente) ; marche aussi sans réseau
    let id = list?.id;
    if (!list) {
      id = await actions.createList({ name: cleanName, categoryId, storeId: chosenStore });
    } else if (cleanName !== list.name || categoryId !== list.category.id || chosenStore !== (list.store?.id ?? null)) {
      await actions.updateList(id, { name: cleanName, categoryId, storeId: chosenStore });
    }
    // Partage : seulement s'il a changé, et seulement en ligne (route réservée
    // au propriétaire ; la liste doit d'abord exister sur le serveur)
    const before = new Set((list?.members ?? []).filter((m) => !m.isOwner).map((m) => m.id));
    const changed = before.size !== guests.size || [...guests].some((g) => !before.has(g));
    if (changed) {
      await refreshData({ quiet: true }); // envoie la file d'attente
      try {
        if (pendingCount()) throw new Error('hors ligne');
        await put(`/api/lists/${id}/members`, { userIds: [...guests] });
        await refreshData({ quiet: true });
      } catch (err) {
        toast(`Le partage n'a pas pu être enregistré : ${pendingCount() ? 'indisponible hors ligne' : errorMessage(err)}. La liste, elle, est enregistrée.`);
      }
    }
    if (!list) {
      navigate('list', { id }, { replace: true });
      toast('Liste créée', {
        action: 'Annuler',
        onAction: async () => {
          await actions.deleteList(id);
          navigate('lists', {}, { replace: true });
        },
      });
    } else {
      goBack('list', { id });
    }
  });

  return formEl;
}
