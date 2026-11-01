// Écran « Nouvelle liste » / « Modifier la liste » (maquettes
// formulaire-liste-1 à 3, formulaire-liste-multi-1 et 2) : nom, type de
// liste (Courses ou Tâches), icône, magasin simple ou « multi » (seulement
// pour une liste de courses), partage, avec le droit de chaque personne
// (« Peut modifier » ou « Lecture seule »), priorité et échéance activées ou
// non (listes de tâches), et suppression de la liste (propriétaire).

import { h, icon, iconButton, field, errorNote, avatar, replace, multiBadge, LABEL_INPUT } from '../dom.js';
import { put, errorMessage } from '../api.js';
import { navigate, goBack } from '../router.js';
import { activeOnly, addModeOf, defaultAddMode } from '../store.js';
import { itemWords } from '../words.js';
import * as actions from '../actions.js';
import { compareNames } from '../sorting.js';
import { app, refreshData, pendingCount } from '../app.js';
import { openSheet, toast } from '../ui.js';
import { deleteListWithConfirm } from './list-actions.js';
import { openCreateReference } from '../create-reference.js';
import { LIST_ICONS } from '../list-icons.js';
import { CREATABLE_TYPES, TYPE_LABELS, TYPE_ICONS, typeOf, isShoppingList, usesTaskOptions, typeChangeWarning } from '../list-types.js';

export function renderListForm(listId, onLeave) {
  const container = h('div', { class: 'screen' });
  const editing = listId !== null;

  // Il faut les magasins et les comptes (copie locale, rafraîchie à
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
// interrupteurs (.switch, role="switch", 44 px). L'état se voit à la position
// du bouton (jamais la couleur seule) et s'annonce par aria-checked ; le nom
// est le titre de la ligne (aria-labelledby) ; sous le titre, seulement la
// description, qui ne change pas (aria-describedby). Le même composant sert
// à la création et à « Modifier la liste ».
// values : { priority, due } ; onChange(nouvelles valeurs) ; leading :
// ligne placée avant les deux interrupteurs (« Après l'ajout »), ou rien.
// Les deux lignes des interrupteurs portent data-switch (cachées pour une
// liste de courses).
export function optionSwitches(values, onChange, leading = null) {
  const current = { ...values };
  const rows = [
    ['priority', 'Priorité', 'Basse, normale ou élevée.'],
    ['due', 'Échéance', 'Une date limite ; retards signalés.'],
  ].map(([key, label, help]) => {
    const titleId = `option-${key}-title`;
    const helpId = `option-${key}-help`;
    const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-labelledby': titleId, 'aria-describedby': helpId });
    const paint = () => {
      toggle.setAttribute('aria-checked', String(current[key]));
    };
    toggle.addEventListener('click', () => {
      current[key] = !current[key];
      paint();
      onChange({ ...current });
    });
    paint();
    return h('div', { class: 'toggle-row', 'data-switch': key },
      h('div', { class: 'grow' }, h('span', { class: 'row__title', id: titleId }, label), h('span', { class: 'row__sub', id: helpId }, help)),
      toggle);
  });
  return h('div', { class: 'card list-options' }, leading, rows);
}

// « Après l'ajout » (toutes les listes, courses comprises) : deux choix côte
// à côte (.segmented, le même composant que le droit d'une personne), le
// choix actif a une coche ET son texte. 'quick' : « Rester sur la liste »
// (rapide, comme avant) ; 'detail' : « Ouvrir la fiche » de l'élément
// ajouté (détaillé). onChange(valeur). Renvoie { row, set(valeur) }.
export function addModeChoice(value, onChange) {
  let current = value;
  const options = [['quick', 'Rester sur la liste'], ['detail', 'Ouvrir la fiche']].map(([choice, label]) => {
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
  const row = h('div', { class: 'toggle-row toggle-row--stack' },
    h('div', {},
      h('span', { class: 'row__title', id: 'add-mode-label' }, "Après l'ajout"),
      h('span', { class: 'row__sub' }, 'Rester sur la liste : on enchaîne les ajouts. Ouvrir la fiche : elle s\'ouvre aussitôt pour compléter ce qui vient d\'être ajouté.')),
    h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'add-mode-label' }, options));
  return {
    row,
    set: (next) => {
      current = next;
      paint();
    },
  };
}

// Réglages enregistrés d'une liste (gardés même pour une liste de courses,
// qui les ignore). Une copie d'avant ces réglages : activés, comme avant.
const listOptionsOf = (list) => ({ priority: list.priorityEnabled !== false, due: list.dueEnabled !== false });

function form(list, users) {
  const me = app.user;

  // --- Nom ---
  const name = h('input', { class: 'input', ...LABEL_INPUT, maxlength: '100', placeholder: 'Ex. Courses de la semaine', value: list?.name ?? '' });
  const nameField = field('Titre de la liste', name); // jamais « Nom » (voir LABEL_INPUT)

  // --- Type de liste (choix en cartes, même composant qu'avant) ---
  // Courses ou Tâches (les envies viendront à l'étape suivante : le serveur
  // les refuse). Changer le type d'une liste existante n'efface rien : la
  // ligne sous le choix le dit avant l'enregistrement (typeChangeWarning).
  const savedType = list ? typeOf(list) : null;
  let listType = CREATABLE_TYPES.includes(savedType) ? savedType : CREATABLE_TYPES[0];

  const typeButtons = CREATABLE_TYPES.map((type) => {
    const button = h('button', { class: 'choice__opt', type: 'button', role: 'radio' },
      icon(TYPE_ICONS[type]), TYPE_LABELS[type]);
    button.addEventListener('click', () => {
      listType = type;
      paint();
    });
    button.dataset.type = type;
    return button;
  });
  const typeWarning = h('p', { class: 'field__hint', id: 'type-warning', 'aria-live': 'polite', hidden: true });
  const typeGroup = h('div', { class: 'choice choice--wrap', role: 'radiogroup', 'aria-labelledby': 'type-label', 'aria-describedby': 'type-warning' }, typeButtons);

  // --- Icône (grille de choix) ---
  // chosenIcon : icône choisie (« » : aucune, la liste montre celle de son
  // type). Au départ, la case cochée est donc l'icône du type, et elle suit
  // le type tant que rien n'est choisi. Si on ne touche
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
  // Une liste de tâches qui a été une liste de courses garde son magasin,
  // caché (keptStore, donné au seul propriétaire) : il revient ici si on
  // choisit de nouveau « Courses ».
  const currentStore = list?.store ?? list?.keptStore ?? null;
  const stores = activeOnly(app.data.stores);
  if (currentStore && !stores.some((s) => s.id === currentStore.id)) stores.push(currentStore);
  let storeId = currentStore?.id ?? null;
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

  // --- Options : « Après l'ajout » (toutes les listes), priorité et
  // échéance (listes de tâches) ---
  // Une nouvelle liste commence sans priorité ni échéance ; une liste
  // existante garde ses réglages (même cachés tant qu'elle est une liste de
  // courses). « Après l'ajout » : une liste existante garde son choix ; une
  // nouvelle liste suit son type (« Rester sur la liste » pour les courses,
  // « Ouvrir la fiche » sinon) tant qu'on ne l'a pas touché.
  let options = list ? listOptionsOf(list) : { priority: false, due: false };
  let addMode = list ? addModeOf(list) : defaultAddMode(true);
  let addModeChosen = Boolean(list);
  const addModeField = addModeChoice(addMode, (value) => {
    addMode = value;
    addModeChosen = true;
  });
  const optionsLabel = h('span', { class: 'field__label' }, 'Options des éléments');
  const optionsCard = optionSwitches(options, (values) => {
    options = values;
  }, addModeField.row);
  const optionsField = h('div', { class: 'field' }, optionsLabel, optionsCard);

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

  // Met à jour l'affichage (type et icône choisis, magasin visible ou non,
  // avertissement de changement de type)
  function paint() {
    for (const button of typeButtons) {
      const on = button.dataset.type === listType;
      button.setAttribute('aria-checked', String(on));
      button.querySelector('.icon-end')?.remove();
      if (on) button.append(icon('check', 'icon-end'));
    }
    const shopping = isShoppingList(listType);
    const warning = list ? typeChangeWarning(savedType, listType) : '';
    typeWarning.textContent = warning;
    typeWarning.hidden = !warning;
    // Icône cochée : entourée ET marquée d'une coche (jamais la couleur seule)
    const shownIcon = chosenIcon || TYPE_ICONS[listType];
    for (const button of iconButtons) {
      const on = button.dataset.icon === shownIcon;
      button.setAttribute('aria-checked', String(on));
      button.querySelector('.icon-grid__check')?.remove();
      if (on) button.append(h('span', { class: 'icon-grid__check' }, icon('check', 'icon--xs')));
    }
    storeField.hidden = !shopping;
    // Courses : ni priorité ni échéance, seulement « Après l'ajout »
    for (const row of optionsCard.querySelectorAll('[data-switch]')) row.hidden = !usesTaskOptions(listType);
    optionsLabel.textContent = shopping ? `Options des ${itemWords(true).many}` : 'Options des éléments';
    if (!addModeChosen) {
      addMode = defaultAddMode(shopping);
      addModeField.set(addMode);
    }
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
      h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'type-label' }, 'Type de liste'), typeGroup, typeWarning),
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
    const shopping = isShoppingList(listType);
    const chosenStore = shopping ? storeId : null;
    save.disabled = true;
    // Liste : tout de suite dans la copie locale, envoyée ensuite (file
    // d'attente) ; marche aussi sans réseau
    let id = list?.id;
    // Priorité et échéance : envoyées pour une liste de tâches seulement
    // (une liste de courses garde ses réglages, ignorés)
    const classic = usesTaskOptions(listType);
    const saved = list ? listOptionsOf(list) : null;
    if (!list) {
      id = await actions.createList({ name: cleanName, listType, storeId: chosenStore, priorityEnabled: classic && options.priority, dueEnabled: classic && options.due, addMode, icon: chosenIcon });
    } else {
      // Seulement ce qui a changé. Le magasin n'est envoyé que pour une liste
      // de courses, et s'il diffère de celui de la liste (ou de celui qu'elle
      // a gardé) : revenir à « Courses » sans y toucher le remet tel quel.
      const switches = {};
      if (cleanName !== list.name) switches.name = cleanName;
      if (listType !== savedType) switches.listType = listType;
      if (shopping && chosenStore !== (currentStore?.id ?? null)) switches.storeId = chosenStore;
      if (classic && options.priority !== saved.priority) switches.priorityEnabled = options.priority;
      if (classic && options.due !== saved.due) switches.dueEnabled = options.due;
      if (chosenIcon !== (list.icon ?? '')) switches.icon = chosenIcon; // icône : seulement si elle a changé
      if (addMode !== addModeOf(list)) switches.addMode = addMode; // « Après l'ajout » : seulement s'il a changé
      if (Object.keys(switches).length) await actions.updateList(id, switches);
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
