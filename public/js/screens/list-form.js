// Écran « Nouvelle liste » / « Modifier la liste » (maquettes
// formulaire-liste-1 à 3, formulaire-liste-multi-1 et 2) : nom, type de
// liste (Courses, Tâches ou Envies), icône (choisie dans une fenêtre), magasin simple ou « multi » (seulement
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
import {
  CREATABLE_TYPES, TYPE_LABELS, TYPE_ICONS, typeOf, isShoppingList, isWishList, usesPriority, usesDue, typeChangeWarning, WISHES_LOCKED_HINT,
} from '../list-types.js';
import { FOR_NAME_MAX, wishForLabel } from '../wishes.js';
import { hasPublicLink } from './lists.js';

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
  const paints = {};
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
    paints[key] = paint;
    toggle.addEventListener('click', () => {
      current[key] = !current[key];
      paint();
      onChange({ ...current }, key);
    });
    paint();
    return h('div', { class: 'toggle-row', 'data-switch': key },
      h('div', { class: 'grow' }, h('span', { class: 'row__title', id: titleId }, label), h('span', { class: 'row__sub', id: helpId }, help)),
      toggle);
  });
  const card = h('div', { class: 'card list-options' }, leading, rows);
  // Valeur posée par l'écran (sans appui) : la priorité qui suit le type
  card.set = (key, value) => {
    if (current[key] === value) return;
    current[key] = value;
    paints[key]();
    onChange({ ...current }, null);
  };
  return card;
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

  // --- Type (choix en cartes, même composant qu'avant, sur une seule ligne) ---
  // Nouvelle liste : Courses, Tâches ou Envies. Liste de courses ou de
  // tâches existante : les trois aussi (changer n'efface rien : la ligne sous
  // le choix le dit avant l'enregistrement, typeChangeWarning) ; devenir une
  // liste d'envies est définitif, et se fait en ligne seulement. Une liste
  // d'envies garde son type et sa destinataire pour toujours (une seule
  // carte, inactive, et une phrase).
  const savedType = list ? typeOf(list) : null;
  const wishesLocked = isWishList(savedType);
  const offered = wishesLocked ? ['wishes'] : CREATABLE_TYPES;
  // Liste existante qui devient une liste d'envies (avec son destinataire)
  const converting = () => Boolean(list) && !wishesLocked && isWishList(listType);
  let listType = offered.includes(savedType) ? savedType : offered[0];

  const typeButtons = offered.map((type) => {
    const button = h('button', { class: 'choice__opt', type: 'button', role: 'radio', disabled: wishesLocked },
      icon(TYPE_ICONS[type]), TYPE_LABELS[type]);
    button.addEventListener('click', () => {
      listType = type;
      paint();
      drawShare(); // le destinataire d'une liste d'envies est verrouillé dans le partage
    });
    button.dataset.type = type;
    return button;
  });
  const typeWarning = h('p', { class: 'field__hint', id: 'type-warning', 'aria-live': 'polite', hidden: !wishesLocked }, wishesLocked ? WISHES_LOCKED_HINT : '');

  // --- Pour qui ? (listes d'envies) ---
  // Nouvelle liste : « Moi » (par défaut), un autre compte actif, ou « Une
  // personne sans compte » (prénom libre, 80 caractères au plus). Fixé à la
  // création : une liste d'envies existante l'affiche seulement.
  let forChoice = 'me'; // 'me', identifiant d'un compte, ou 'name'
  const forNameInput = h('input', { class: 'input', type: 'text', maxlength: String(FOR_NAME_MAX), autocomplete: 'off', placeholder: 'Ex. Lucas' });
  const forNameField = field('Prénom', forNameInput);
  const forRows = [];
  const forRow = (value, title, sub) => {
    const row = h('button', { class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false' },
      h('span', { class: 'radio' }),
      h('span', { class: 'grow' }, h('span', { class: 'row__title' }, title), sub ? h('span', { class: 'row__sub' }, sub) : null));
    row.addEventListener('click', () => {
      forChoice = value;
      paint();
      drawShare();
    });
    row.dataset.value = String(value);
    forRows.push(row);
    return row;
  };
  const forOthers = users.filter((u) => u.id !== me.id).sort((a, b) => compareNames(a.displayName, b.displayName));
  const forField = h('div', { class: 'field' },
    h('span', { class: 'field__label', id: 'for-label' }, 'Pour qui ?'),
    wishesLocked
      ? h('p', { class: 'field__value' }, wishForLabel(list))
      : [
        h('div', { class: 'card', role: 'radiogroup', 'aria-labelledby': 'for-label' },
          forRow('me', 'Moi'),
          forOthers.map((u) => forRow(u.id, u.displayName)),
          forRow('name', 'Une personne sans compte', 'Par exemple un enfant')),
        forNameField.field,
      ]);
  // Compte destinataire choisi à la création ou à la conversion (sinon celui de la liste)
  const beneficiaryId = () => (wishesLocked ? list.forUserId ?? null : isWishList(listType) && typeof forChoice === 'number' ? forChoice : null);
  const typeGroup = h('div', { class: 'choice choice--row', role: 'radiogroup', 'aria-labelledby': 'type-label', 'aria-describedby': 'type-warning' }, typeButtons);

  // --- Icône (un bouton à gauche du titre, puis une fenêtre avec la grille) ---
  // chosenIcon : icône choisie (« » : aucune, la liste montre celle de son
  // type, et le bouton suit le type tant que rien n'est choisi). Si on ne
  // touche pas à l'icône, rien n'est envoyé : rien ne change.
  let chosenIcon = list?.icon ?? '';
  // Le formulaire montre seulement l'icône affichée, dans un bouton
  const iconPicker = h('button', {
    class: 'icon-grid__opt', type: 'button', 'aria-label': 'Choisir une icône', 'aria-haspopup': 'dialog', 'aria-describedby': 'icon-current',
  });
  const iconCurrent = h('span', { class: 'visually-hidden', id: 'icon-current' });
  iconPicker.addEventListener('click', () => openIconPicker());
  // Titre de la liste : le bouton de l'icône à gauche, sur la même ligne que
  // le champ (qui prend toute la largeur restante) ; le libellé « Titre de la
  // liste » reste au-dessus et désigne le champ (jamais « Nom » : voir LABEL_INPUT)
  const nameField = field('Titre de la liste', h('div', { class: 'field__row' }, iconPicker, name, iconCurrent));

  // Fenêtre de choix (feuille du bas, comme les autres choix) : première
  // case « Par défaut » (l'icône du type, rien de choisi), puis la grille.
  // Toucher une case la choisit et ferme aussitôt la fenêtre ; la fermer
  // autrement (croix, Échap, toucher à côté, Retour) ne change rien. Le
  // focus va sur la case choisie à l'ouverture et revient sur le bouton à
  // la fermeture (overlay, ui.js ; jamais un champ de saisie).
  function openIconPicker() {
    const option = (id, label, content, extra = {}) => {
      const on = id === chosenIcon;
      const button = h('button', {
        class: `icon-grid__opt${id ? '' : ' icon-grid__opt--default'}`, type: 'button', role: 'radio', 'aria-checked': String(on), 'aria-label': label, title: label,
        ...(on ? { 'data-initial-focus': true } : {}), ...extra,
      }, content, on ? h('span', { class: 'icon-grid__check' }, icon('check', 'icon--xs')) : null);
      button.addEventListener('click', () => {
        chosenIcon = id;
        paint();
        sheet.close();
      });
      button.dataset.icon = id;
      return button;
    };
    const typeName = TYPE_LABELS[listType];
    const grid = h('div', { class: 'icon-grid', role: 'radiogroup', 'aria-label': 'Icônes' },
      option('', `Par défaut : icône du type ${typeName}`, [icon(TYPE_ICONS[listType]), h('span', {}, 'Par défaut')]),
      LIST_ICONS.map((choice) => option(choice.id, choice.label, icon(choice.id))));
    const sheet = openSheet({
      title: 'Choisir une icône',
      content: grid,
      scroll: true,
      // Retour du focus sur le bouton à la fermeture (même sur un téléphone,
      // où toucher un bouton ne lui donne pas le focus)
      returnTo: iconPicker,
    });
  }

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
  let priorityChosen = false; // la priorité a été touchée à la main
  const optionsCard = optionSwitches(options, (values, key) => {
    options = values;
    if (key === 'priority') priorityChosen = true;
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

  // Une personne : sa ligne à cocher, puis son droit si elle est cochée.
  // Le compte destinataire d'une liste d'envies est membre d'office, en
  // « Peut modifier », sans choix (le serveur l'impose aussi)
  const personRow = (person, { locked = false } = {}) => {
    const isBeneficiary = !locked && person.id === beneficiaryId() && (!wishesLocked || list.members.some((m) => m.id === person.id));
    if (isBeneficiary) {
      return h('div', { class: 'share__person' },
        h('div', { class: 'tick-row', role: 'checkbox', 'aria-checked': 'true', 'aria-disabled': 'true' },
          h('span', { class: 'tick is-on' }, icon('check')),
          avatar(person.displayName, { second: true }),
          h('span', { class: 'grow' }, person.displayName),
          h('span', { class: 'share__hint' }, 'Destinataire · Peut modifier')));
    }
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
  const shareGroup = h('div', { class: 'card share' });
  function drawShare() {
    replace(shareGroup,
      personRow({ id: me.id, displayName: me.displayName }, { locked: true }),
      people.map((person) => personRow(person)));
  }
  drawShare();
  // Hors ligne : le partage ne peut pas être changé (il demande le serveur)
  const shareNote = h('p', { class: 'field__hint', hidden: true }, 'Partage indisponible hors ligne : la liste peut être enregistrée, le partage se changera avec du réseau.');
  // Conversion en liste d'envies : en ligne seulement (elle dépend du
  // destinataire et arrête un éventuel lien public) ; hors ligne, le bouton
  // « Enregistrer » est inactif, avec une phrase
  let busy = false;
  const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Enregistrer');
  const convertNote = h('p', { class: 'field__hint', id: 'convert-offline', hidden: true }, 'Devenir une liste d\'envies demande une connexion : enregistrez quand le réseau sera revenu.');
  const paintConvert = () => {
    const blocked = converting() && !navigator.onLine;
    convertNote.hidden = !blocked;
    save.disabled = busy || blocked;
    if (blocked) save.setAttribute('aria-describedby', 'convert-offline');
    else save.removeAttribute('aria-describedby');
  };
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
    paintConvert();
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
    if (!wishesLocked) {
      // Devenir une liste d'envies : définitif ; un lien public en cours sera arrêté
      const warning = list ? `${typeChangeWarning(savedType, listType)}${converting() && hasPublicLink(list) ? ' Son lien public sera arrêté.' : ''}` : '';
      typeWarning.textContent = warning;
      typeWarning.hidden = !warning;
    }
    forField.hidden = !isWishList(listType);
    for (const row of forRows) {
      const on = row.dataset.value === String(forChoice);
      row.setAttribute('aria-checked', String(on));
      row.querySelector('.radio').classList.toggle('is-on', on);
      row.querySelector('.icon-end')?.remove();
      if (on) row.append(icon('check', 'icon-end'));
    }
    forNameField.field.hidden = forChoice !== 'name';
    // Bouton de l'icône : celle choisie, sinon celle du type (elle suit alors le type)
    const shownIcon = chosenIcon || TYPE_ICONS[listType];
    replace(iconPicker, icon(shownIcon));
    iconCurrent.textContent = chosenIcon ? `Icône actuelle : ${LIST_ICONS.find((c) => c.id === chosenIcon)?.label ?? ''}` : `Icône actuelle : par défaut (${TYPE_LABELS[listType]})`;
    storeField.hidden = !shopping;
    // Courses : ni priorité ni échéance, seulement « Après l'ajout »
    // Priorité : tâches et envies ; échéance : tâches seulement
    for (const row of optionsCard.querySelectorAll('[data-switch]')) {
      row.hidden = row.dataset.switch === 'priority' ? !usesPriority(listType) : !usesDue(listType);
    }
    // Nouvelle liste, ou liste qui devient une liste d'envies : la priorité
    // suit le type tant qu'on n'y a pas touché (activée par défaut pour une
    // liste d'envies ; une liste existante retrouve son réglage sinon)
    if (!priorityChosen) optionsCard.set('priority', isWishList(listType) || Boolean(list && listOptionsOf(list).priority));
    optionsLabel.textContent = `Options des ${itemWords(listType === 'tasks' ? false : { type: listType }).many}`;
    if (!addModeChosen) {
      addMode = defaultAddMode(shopping);
      addModeField.set(addMode);
    }
    const store = stores.find((s) => s.id === storeId);
    replace(storeLabel, icon('store', 'icon--sm'), store?.name ?? 'Aucun magasin', store?.isMulti ? multiBadge() : null);
    storeHint.textContent = store?.isMulti ? 'Les articles seront classés par magasin, sans rayons.' : 'Les articles seront classés par rayon.';
    paintConvert();
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
  const formEl = h('form', { novalidate: true },
    h('header', { class: 'topbar' },
      iconButton('close', 'Fermer sans enregistrer', () => goBack(list ? 'list' : 'lists', list ? { id: list.id } : {})),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, list ? 'Modifier la liste' : 'Nouvelle liste'))),
    h('div', { class: 'body' }, h('div', { class: 'form-body' },
      nameField.field,
      h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'type-label' }, 'Type'), typeGroup, typeWarning),
      forField,
      storeField,
      optionsField,
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Partager avec'), shareGroup, shareNote),
      error.note,
      deleteButton)),
    h('div', { class: 'footer' }, convertNote, save));

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.show('');
    const cleanName = name.value.replace(/\s+/g, ' ').trim();
    // Nom vide : le champ est signalé sous lui-même, sans y mettre le curseur
    nameField.setError(cleanName ? null : 'Le nom est obligatoire');
    // Liste d'envies pour une personne sans compte : son prénom est obligatoire
    const forName = (!list || converting()) && isWishList(listType) && forChoice === 'name' ? forNameInput.value.replace(/\s+/g, ' ').trim() : null;
    forNameField.setError(forName === '' ? 'Le prénom est obligatoire' : null);
    if (!cleanName || forName === '') return;
    const shopping = isShoppingList(listType);
    const chosenStore = shopping ? storeId : null;
    busy = true;
    paintConvert();
    // Liste : tout de suite dans la copie locale, envoyée ensuite (file
    // d'attente) ; marche aussi sans réseau
    let id = list?.id;
    // Priorité et échéance : envoyées pour une liste de tâches seulement
    // (une liste de courses garde ses réglages, ignorés)
    const withPriority = usesPriority(listType);
    const withDue = usesDue(listType);
    const saved = list ? listOptionsOf(list) : null;
    // Devenir une liste d'envies : d'abord, en ligne, le type et le
    // destinataire ensemble (une seule transaction sur le serveur) ; en cas
    // de refus, rien n'a changé et rien d'autre n'est envoyé
    const convert = converting();
    if (convert) {
      try {
        await refreshData({ quiet: true }); // envoie d'abord la file d'attente
        if (pendingCount() || !navigator.onLine) throw new Error('Devenir une liste d\'envies demande une connexion.');
        await actions.convertToWishes(id, {
          ...(beneficiaryId() ? { forUserId: beneficiaryId() } : {}),
          ...(forName ? { forName } : {}),
          priorityEnabled: options.priority,
        });
      } catch (err) {
        error.show(errorMessage(err));
        busy = false;
        paintConvert();
        return;
      }
    }
    if (!list) {
      id = await actions.createList({
        name: cleanName, listType, storeId: chosenStore, priorityEnabled: withPriority && options.priority, dueEnabled: withDue && options.due, addMode, icon: chosenIcon,
        ...(isWishList(listType) ? { forUserId: beneficiaryId() ?? undefined, forName: forName ?? undefined } : {}),
      });
    } else {
      // Seulement ce qui a changé. Le magasin n'est envoyé que pour une liste
      // de courses, et s'il diffère de celui de la liste (ou de celui qu'elle
      // a gardé) : revenir à « Courses » sans y toucher le remet tel quel.
      const switches = {};
      if (cleanName !== list.name) switches.name = cleanName;
      if (listType !== savedType && !convert) switches.listType = listType;
      if (shopping && chosenStore !== (currentStore?.id ?? null)) switches.storeId = chosenStore;
      if (withPriority && !convert && options.priority !== saved.priority) switches.priorityEnabled = options.priority;
      if (withDue && options.due !== saved.due) switches.dueEnabled = options.due;
      if (chosenIcon !== (list.icon ?? '')) switches.icon = chosenIcon; // icône : seulement si elle a changé
      if (addMode !== addModeOf(list)) switches.addMode = addMode; // « Après l'ajout » : seulement s'il a changé
      if (Object.keys(switches).length) await actions.updateList(id, switches);
    }
    // Partage : seulement s'il a changé, et seulement en ligne (route réservée
    // au propriétaire ; la liste doit d'abord exister sur le serveur)
    const before = new Map((list?.members ?? []).filter((m) => !m.isOwner).map((m) => [m.id, m.access ?? 'modification']));
    // Le destinataire (membre d'office) fait toujours partie du partage envoyé
    const beneficiary = beneficiaryId();
    if (beneficiary && (!wishesLocked || list.members.some((m) => m.id === beneficiary))) {
      guests.add(beneficiary);
      rights.set(beneficiary, 'modification');
    }
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
