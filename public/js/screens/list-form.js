// Écran « Nouvelle liste » / « Modifier la liste » (maquettes
// formulaire-liste-1 à 3, formulaire-liste-multi-1 et 2) : nom, catégorie,
// magasin simple ou « multi » (seulement pour une liste de courses), partage,
// avec le droit de chaque personne (« Peut modifier » ou « Lecture seule »),
// priorité et échéance activées ou non (listes autres que les courses), et
// suppression de la liste (propriétaire).

import { h, icon, iconButton, field, errorNote, avatar, replace, multiBadge, LABEL_INPUT } from '../dom.js';
import { put, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { activeOnly } from '../store.js';
import * as actions from '../actions.js';
import { compareNames } from '../sorting.js';
import { app, refreshData, pendingCount } from '../app.js';
import { openSheet, toast } from '../ui.js';
import { deleteListWithConfirm } from './list-actions.js';
import { openCreateReference } from '../create-reference.js';
import { LIST_ICONS, categoryIcon } from '../list-icons.js';

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

// Droit d'une personne sur la liste : deux choix côte à côte (.segmented),
// le choix actif a une coche ET son texte (jamais la couleur seule). Le même
// composant sert à la création de la liste et à « Modifier la liste » (une
// seule fonction form() pour les deux écrans). onChange(valeur) reçoit
// 'modification' ou 'lecture'.
export function accessChoice(name, value, onChange) {
  let current = value;
  const options = [['modification', 'Peut modifier'], ['lecture', 'Lecture seule']].map(([choice, label]) => {
    const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', onClick: () => {
      current = choice;
      paint();
      onChange(choice);
    } });
    option.dataset.value = choice;
    option.dataset.label = label;
    return option;
  });
  const paint = () => {
    for (const option of options) {
      const on = option.dataset.value === current;
      option.setAttribute('aria-checked', String(on));
      replace(option, on ? icon('check', 'icon--sm icon--check') : null, option.dataset.label);
    }
  };
  paint();
  return h('div', { class: 'share__access' },
    h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': `Droit de ${name} sur la liste` }, options));
}

// Priorité et échéance d'une liste autre que les courses : deux
// interrupteurs (.switch, role="switch", 44 px), chacun avec son nom et son
// état écrit (« Activée » / « Désactivée » : jamais la couleur seule). Le
// même composant sert à la création et à « Modifier la liste ».
// values : { priority, due } ; onChange(nouvelles valeurs).
export function optionSwitches(values, onChange) {
  const current = { ...values };
  const rows = [
    ['priority', 'Priorité', 'Basse, normale ou élevée ; tri par priorité.'],
    ['due', 'Échéance', 'Une date limite ; tri par échéance, retards signalés.'],
  ].map(([key, label, help]) => {
    const state = h('span', { class: 'row__sub' });
    const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label });
    const paint = () => {
      toggle.setAttribute('aria-checked', String(current[key]));
      state.textContent = `${current[key] ? 'Activée' : 'Désactivée'} · ${help}`;
    };
    toggle.addEventListener('click', () => {
      current[key] = !current[key];
      paint();
      onChange({ ...current });
    });
    paint();
    return h('div', { class: 'toggle-row' }, h('div', { class: 'grow' }, h('span', { class: 'row__title' }, label), state), toggle);
  });
  return h('div', { class: 'card list-options' }, rows);
}

// Réglages enregistrés d'une liste (gardés même pour une liste de courses,
// qui les ignore). Une copie d'avant ces réglages : activés, comme avant.
const listOptionsOf = (list) => ({ priority: list.priorityEnabled !== false, due: list.dueEnabled !== false });

function form(list, users) {
  const me = app.user;

  // --- Nom ---
  const name = h('input', { class: 'input', ...LABEL_INPUT, maxlength: '100', placeholder: 'Ex. Courses de la semaine', value: list?.name ?? '' });
  const nameField = field('Titre de la liste', name); // jamais « Nom » (voir LABEL_INPUT)

  // --- Catégorie (choix en cartes) ---
  // Les catégories actives, plus la catégorie actuelle de la liste si elle a
  // été désactivée entre-temps (elle reste possible pour cette liste)
  const categories = activeOnly(app.data.categories);
  if (list && !categories.some((c) => c.id === list.category.id)) categories.push(list.category);
  let categoryId = list?.category.id ?? categories[0]?.id ?? null;

  const categoryButtons = categories.map((category) => {
    const button = h('button', { class: 'choice__opt', type: 'button', role: 'radio' },
      icon(categoryIcon(category.isShopping)), category.name);
    button.addEventListener('click', () => {
      categoryId = category.id;
      paint();
    });
    button.dataset.id = String(category.id);
    return button;
  });
  const categoryGroup = h('div', { class: 'choice choice--wrap', role: 'radiogroup', 'aria-labelledby': 'category-label' }, categoryButtons);

  // --- Icône (grille de choix) ---
  // chosenIcon : icône choisie (« » : aucune, la liste montre celle de sa
  // catégorie). Au départ, la case cochée est donc l'icône de la catégorie,
  // et elle suit la catégorie tant que rien n'est choisi. Si on ne touche
  // pas à la grille, rien n'est envoyé : rien ne change.
  let chosenIcon = list?.icon ?? '';
  const iconButtons = LIST_ICONS.map((choice) => {
    const button = h('button', { class: 'icon-grid__opt', type: 'button', role: 'radio', 'aria-label': choice.label, title: choice.label },
      icon(choice.id));
    button.addEventListener('click', () => {
      chosenIcon = choice.id;
      paint();
    });
    button.dataset.icon = choice.id;
    return button;
  });
  const iconGroup = h('div', { class: 'icon-grid', role: 'radiogroup', 'aria-labelledby': 'icon-label' }, iconButtons);

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
    const singleCard = h('div', { class: 'card', role: 'radiogroup', 'aria-labelledby': 'single-stores' },
      radio({ id: null, name: 'Aucun magasin' }, 'Classé par rayon'),
      simples.map((store) => radio(store, 'Classé par rayon')));
    // Dernière ligne : « Nouveau magasin… » (create-reference.js, en ligne) ;
    // le magasin créé rejoint les choix et il est sélectionné. Pas de liste
    // envoyée : c'est le magasin de la liste elle-même (jamais ajouté à un
    // magasin « multi »)
    const addRow = h('button', { class: 'radio-row picker__new', type: 'button', onClick: async () => {
      const made = await openCreateReference('store');
      if (!made) return;
      if (!stores.some((store) => store.id === made.id)) {
        const store = { id: made.id, name: made.name, active: true, isMulti: false, storeIds: [] };
        stores.push(store);
        singleCard.append(radio(store, 'Classé par rayon'));
      }
      selected = made.id;
      paintRows();
      rows.find((row) => row.dataset.id === String(selected))?.scrollIntoView({ block: 'nearest' });
    } }, icon('plus'), 'Nouveau magasin…');
    const content = h('div', { class: 'picker stack' },
      h('span', { class: 'field__label', id: 'single-stores' }, 'Un seul magasin'),
      singleCard,
      multis.length ? [
        h('span', { class: 'field__label', id: 'multi-stores' }, 'Plusieurs magasins'),
        h('div', { class: 'card', role: 'radiogroup', 'aria-labelledby': 'multi-stores' }, multis.map((store) => radio(store, membersLabel(store)))),
      ] : null,
      h('div', { class: 'card' }, addRow));
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

  // --- Priorité et échéance (listes autres que les courses) ---
  // Une nouvelle liste commence sans ; une liste existante garde ses réglages
  // (même cachés tant qu'elle est une liste de courses)
  let options = list ? listOptionsOf(list) : { priority: false, due: false };
  const optionsField = h('div', { class: 'field' },
    h('span', { class: 'field__label' }, 'Options des éléments'),
    optionSwitches(options, (values) => {
      options = values;
    }));

  // --- Partage ---
  // Moi d'abord (toujours inclus, tous les droits), puis les autres comptes
  // actifs ; une personne déjà présente mais désactivée reste affichée (et peut
  // être retiré). Chaque personne cochée a son droit sur la liste, choisi
  // juste sous son nom (accessChoice) : « Peut modifier » ou « Lecture
  // seule ». Une personne ajoutée commence en « Lecture seule » ; une
  // personne déjà présente garde le sien.
  const guests = new Set((list?.members ?? []).filter((m) => !m.isOwner).map((m) => m.id));
  const rights = new Map((list?.members ?? []).filter((m) => !m.isOwner).map((m) => [m.id, m.access ?? 'modification']));
  const people = users.filter((u) => u.id !== me.id).map((u) => ({ ...u, active: true }));
  for (const member of list?.members ?? []) {
    if (!member.isOwner && !people.some((p) => p.id === member.id)) people.push({ ...member, active: false });
  }
  people.sort((a, b) => compareNames(a.displayName, b.displayName));

  // Une personne : sa ligne à cocher, puis son droit si elle est cochée
  const personRow = (person, { locked = false } = {}) => {
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
    locked ? h('span', { class: 'share__hint' }, 'Tous les droits') : null,
    !locked && !person.active ? h('span', { class: 'share__hint' }, 'Compte désactivé') : null);
    const block = h('div', { class: 'share__person' }, row,
      on && !locked ? accessChoice(person.displayName, rights.get(person.id) ?? 'lecture', (value) => rights.set(person.id, value)) : null);
    if (!locked) {
      row.addEventListener('click', () => {
        if (guests.has(person.id)) guests.delete(person.id);
        else guests.add(person.id);
        block.replaceWith(personRow(person));
      });
    }
    return block;
  };
  const shareGroup = h('div', { class: 'card share' },
    personRow({ id: me.id, displayName: me.displayName }, { locked: true }),
    people.map((person) => personRow(person)));
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

  // Met à jour l'affichage (catégorie et icône choisies, magasin visible ou non)
  function paint() {
    for (const button of categoryButtons) {
      const on = button.dataset.id === String(categoryId);
      button.setAttribute('aria-checked', String(on));
      button.querySelector('.icon-end')?.remove();
      if (on) button.append(icon('check', 'icon-end'));
    }
    const category = categories.find((c) => c.id === categoryId);
    // Icône cochée : entourée ET marquée d'une coche (jamais la couleur seule)
    const shownIcon = chosenIcon || categoryIcon(Boolean(category?.isShopping));
    for (const button of iconButtons) {
      const on = button.dataset.icon === shownIcon;
      button.setAttribute('aria-checked', String(on));
      button.querySelector('.icon-grid__check')?.remove();
      if (on) button.append(h('span', { class: 'icon-grid__check' }, icon('check', 'icon--xs')));
    }
    storeField.hidden = !category?.isShopping;
    optionsField.hidden = !category || category.isShopping; // courses : ni priorité ni échéance
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
      h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'icon-label' }, 'Icône'), iconGroup),
      storeField,
      optionsField,
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
    // Priorité et échéance : envoyées pour une liste autre que les courses
    // seulement (une liste de courses garde ses réglages, ignorés)
    const classic = !category.isShopping;
    const saved = list ? listOptionsOf(list) : null;
    if (!list) {
      id = await actions.createList({ name: cleanName, categoryId, storeId: chosenStore, priorityEnabled: classic && options.priority, dueEnabled: classic && options.due, icon: chosenIcon });
    } else {
      const switches = {};
      if (classic && options.priority !== saved.priority) switches.priorityEnabled = options.priority;
      if (classic && options.due !== saved.due) switches.dueEnabled = options.due;
      if (chosenIcon !== (list.icon ?? '')) switches.icon = chosenIcon; // icône : seulement si elle a changé
      if (cleanName !== list.name || categoryId !== list.category.id || chosenStore !== (list.store?.id ?? null) || Object.keys(switches).length) {
        await actions.updateList(id, { name: cleanName, categoryId, storeId: chosenStore, ...switches });
      }
    }
    // Partage : seulement s'il a changé, et seulement en ligne (route réservée
    // au propriétaire ; la liste doit d'abord exister sur le serveur)
    const before = new Map((list?.members ?? []).filter((m) => !m.isOwner).map((m) => [m.id, m.access ?? 'modification']));
    const access = Object.fromEntries([...guests].map((id) => [id, rights.get(id) ?? 'lecture']));
    const changed = before.size !== guests.size || [...guests].some((id) => before.get(id) !== access[id]);
    if (changed) {
      await refreshData({ quiet: true }); // envoie la file d'attente
      try {
        if (pendingCount()) throw new Error('hors ligne');
        await put(`/api/lists/${id}/members`, { userIds: [...guests], access });
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
