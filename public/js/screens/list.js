// Écran « Liste » (maquettes liste-1 à 6, liste-multi-1 et 2, liste-photos-1)
// et feuille « Article » (article-1 et 2, article-photo-1 à 4), avec la photo
// en plein écran (photo-plein-ecran-1).
//
// - Le champ d'ajout reste en bas, à portée de pouce. Liste de courses :
//   après un ajout (Entrée, bouton +, suggestion ou mode scan), l'ajout se
//   termine : champ vidé, curseur retiré (clavier replié), article montré
//   brièvement dans la liste. Autres listes : Entrée valide et le champ
//   reste actif pour enchaîner les éléments.
// - Suggestions dès deux lettres ; un article inconnu demande son rayon une
//   fois (liste de courses).
// - Liste « multi » : pas de rayon, les articles sont groupés par magasin.
//   Un article reprend son magasin habituel parmi ceux de la liste ; s'il n'y
//   a jamais été acheté, son magasin est demandé une fois.
// - Photo : une par article, prise ou choisie depuis la feuille Article,
//   réduite sur le téléphone puis envoyée tout de suite (en ligne seulement).
//   Une vignette s'affiche sur la ligne ; un appui l'agrandit.
// - Cocher d'un appui : l'article est barré ET sa case est remplie (jamais
//   la couleur seule) ; il quitte son rayon pour la zone « Dans le panier »
//   (« Terminés » dans les autres listes), en bas de la liste, du plus
//   récemment coché au plus ancien (maquettes liste-panier-*,
//   liste-taches-panier-*). Zone absente quand rien n'est coché ; repliable,
//   état mémorisé par liste sur l'appareil ; deux actions confirmées par une
//   feuille : tout décocher, retirer les cochés.

import { h, icon, iconButton, field, replace, errorNote, multiBadge } from '../dom.js';
import { errorMessage } from '../api.js';
import * as actions from '../actions.js';
import { shrinkPhoto, PhotoError, createImagePicker } from '../photo.js';
import { navigate, goBack } from '../router.js';
import { splitPrefix, todayKey, addDays, dueDateLabel, dueChip, priorityChip } from '../format.js';
import { normalizeItemName } from '../history.js';
import { computeListView, computeSuggestions, isKnownItem, activeOnly, storeChoices, usualStoreFor, remembersNames, loadItemSort, saveItemSort,
  groupKey, possibleGroupKeys, loadFoldedGroups, saveFoldedGroups, pruneFoldedGroups, isZoneOpen, rememberZone } from '../store.js';
import { app, onDataChange, refreshData } from '../app.js';
import { syncPill, openSheet, openMenu, confirmDialog, confirmSheet, toast, openLightbox, drawWhenIdle, releaseFocus } from '../ui.js';
import { openShareSheet } from './share.js';
import { itemWords, countItems, doneZoneWords, remainingWords } from '../words.js';
import { createScanner, scanAvailable } from './scan.js';
import { readBarcode, normalizeBarcode, ImageUnreadable } from '../barcode.js';

export function renderList(listId, onLeave) {
  const title = h('h1', { class: 'topbar__title' });
  const sub = h('p', { class: 'topbar__sub' });
  const content = h('div', { class: 'scroll' });
  const menuButton = iconButton('more', 'Menu de la liste', () => openListMenu());

  // Tri de la liste (listes autres que les courses) : choix gardé sur ce
  // téléphone pour cette liste ; l'icône du bouton montre le tri actif
  const SORTS = [
    ['alpha', 'az', 'Ordre alphabétique', 'Tri : ordre alphabétique'],
    ['priority', 'arrow-up', 'Par priorité', 'Tri : par priorité'],
    ['due', 'calendar', 'Par échéance', 'Tri : par échéance'],
  ];
  let itemSort = loadItemSort(listId);
  const sortButton = iconButton('az', 'Trier la liste', () => openSortMenu());
  sortButton.setAttribute('aria-haspopup', 'menu');
  const showSort = () => replace(sortButton, icon(SORTS.find(([value]) => value === itemSort)[1]));
  showSort();
  function openSortMenu() {
    openMenu(SORTS.map(([value, iconName, label, message]) => ({
      icon: iconName,
      label,
      checked: value === itemSort,
      onSelect: () => {
        itemSort = value;
        saveItemSort(listId, value);
        showSort();
        draw();
        toast(message, { duration: 2000 });
      },
    })), { label: 'Trier la liste' });
  }

  let view = null;

  // --- Groupes repliables (rayons, magasins, priorités, zone des cochés) ---
  // Repliés ou dépliés sur ce téléphone, pour cette liste (store.js) ; tout
  // est déplié par défaut. L'état survit aux mises à jour en temps réel et
  // aux changements de tri : chaque dessin le relit dans `folded`.
  const folded = loadFoldedGroups(listId);
  // Groupes repliables du dernier dessin : { isOpen(), setOpen(open), contains(node) }
  let foldables = [];
  // « Tout replier / Tout déplier » : dans la barre d'état, seulement s'il y
  // a au moins deux groupes repliables
  const foldAll = h('button', { class: 'fold-all', type: 'button', hidden: true, onClick: () => {
    const open = !foldables.some((f) => f.isOpen());
    for (const f of foldables) f.setOpen(open);
    drawFoldAll();
  } });
  function drawFoldAll() {
    const anyOpen = foldables.some((f) => f.isOpen());
    foldAll.hidden = foldables.length < 2;
    foldAll.classList.toggle('fold-all--open', anyOpen);
    replace(foldAll, icon('chev-d', 'icon--sm'), anyOpen ? 'Tout replier' : 'Tout déplier');
  }

  // En-tête de groupe repliable (design : section 16.11) : un vrai bouton
  // (aria-expanded, aria-controls), chevron qui tourne, nombre à droite ;
  // replié, « · 2 à acheter » s'affiche après le nom (jamais la couleur seule).
  // name : nom du groupe ; lead : icône devant le nom (magasin), ou rien.
  function foldableGroup(list, group, name, lead = null) {
    const key = groupKey(group);
    const remaining = group.items.length; // le groupe ne contient que des non cochés
    const listEl = h('ul', { id: `groupe-${listId}-${key.replace(':', '-')}` }, group.items.map(itemRow));
    const rest = h('span', { class: 'aisle__rest' }, `· ${remainingWords(remaining, list)}`);
    const counter = h('span', { class: 'aisle__count', 'aria-hidden': 'true' }, String(remaining));
    const toggle = h('button', {
      class: 'aisle__toggle',
      type: 'button',
      'aria-controls': listEl.id,
      'aria-label': `${name}, ${remainingWords(remaining, list)}`,
    }, icon('chev-d', 'icon--sm'), h('span', { class: 'aisle__name' }, lead, name), rest, counter);
    const show = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      listEl.hidden = !open;
      rest.hidden = open;
      counter.hidden = !open;
    };
    const foldable = {
      isOpen: () => toggle.getAttribute('aria-expanded') === 'true',
      setOpen: (open) => {
        if (open) folded.delete(key);
        else folded.add(key);
        saveFoldedGroups(listId, folded);
        show(open);
      },
      contains: (node) => listEl.contains(node),
    };
    // Ouvrir / replier sur place : ni redessin, ni saut de défilement ; le
    // bouton garde le focus
    toggle.addEventListener('click', () => {
      foldable.setOpen(!foldable.isOpen());
      drawFoldAll();
    });
    show(!folded.has(key));
    foldables.push(foldable);
    return h('section', {}, h('h2', { class: 'aisle aisle--fold' }, toggle), listEl);
  }

  // --- Dessin de la liste ---
  const draw = () => {
    foldables = [];
    drawFoldAll();
    if (!app.data.loaded) {
      replace(content, h('p', { class: 'empty muted', role: 'status' }, 'Chargement…'));
      return;
    }
    view = computeListView(app.data, listId, { sort: itemSort });
    if (!view) {
      title.textContent = 'Liste introuvable';
      replace(sub);
      menuButton.hidden = true;
      sortButton.hidden = true;
      replace(content, h('div', { class: 'empty' },
        h('h2', { class: 'empty__title' }, 'Liste introuvable'),
        h('p', { class: 'empty__text' }, "Cette liste a été supprimée, ou elle n'est plus partagée avec vous."),
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => navigate('lists', {}, { replace: true }) }, 'Retour à mes listes')));
      addbar.hidden = true;
      return;
    }
    const { list, groups, done } = view;
    // « article » pour une liste de courses, « élément » sinon (words.js)
    const words = itemWords(list);
    input.placeholder = `Ajouter un ${words.one}`;
    input.setAttribute('aria-label', `Ajouter un ${words.one}`);
    document.title = `${list.name} · Listo`;
    title.textContent = list.name;
    replace(sub, list.store ? [icon('store', 'icon--xs'), list.store.name, view.multi ? multiBadge() : null] : list.category.name);
    menuButton.hidden = false;
    sortButton.hidden = list.category.isShopping; // courses : tri par rayons, sans bouton
    addbar.hidden = false;
    // Bouton « Scanner » : listes de courses seulement (recherche activée)
    scanner.button.hidden = !scanAvailable(list);
    // Liste sans en-tête de rayon (tâches…) : la liste commence plus haut
    content.classList.toggle('scroll--flat', !list.category.isShopping && itemSort !== 'priority');

    if (groups.length === 0 && done.length === 0) {
      replace(content, h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon(list.category.isShopping ? 'cart' : 'tasks', 'icon--lg')),
        h('h2', { class: 'empty__title' }, 'Cette liste est vide'),
        h('p', { class: 'empty__text' }, `Ajoutez un premier ${words.one} avec le champ ci-dessous.`)));
      return;
    }
    // Groupes disparus (rayon ou magasin supprimé) : oubliés
    if (pruneFoldedGroups(folded, possibleGroupKeys(app.data))) saveFoldedGroups(listId, folded);
    replace(content, groups.map((group) => (
      // En-tête collant et repliable : rayon, ou magasin (avec son icône)
      // dans une liste « multi »
      view.multi ? foldableGroup(list, group, group.store?.name ?? 'Sans magasin', icon('store', 'icon--xs'))
        : list.category.isShopping ? foldableGroup(list, group, group.aisle?.name ?? 'Sans rayon')
          // Tri par priorité : un en-tête par groupe (« Priorité élevée »…)
          : group.label ? foldableGroup(list, group, group.label)
            // Ordre alphabétique ou par échéance : liste simple, sans en-tête
            : h('section', {}, h('ul', {}, group.items.map(itemRow))))),
    done.length ? doneZone(list, done) : null);
    drawFoldAll();
  };

  // Zone des articles cochés, sous le dernier rayon (design/components.html,
  // « Zone des articles cochés ») : en-tête repliable avec le nombre, deux
  // actions (absentes quand la zone est repliée), puis les lignes cochées.
  // Elle n'est dessinée que s'il y a au moins un article coché.
  function doneZone(list, done) {
    const zone = doneZoneWords(list);
    const counted = countItems(done.length, list); // « 12 articles », « 4 éléments »
    const listEl = h('ul', { id: `zone-${listId}` }, done.map(itemRow));
    const actionsRow = h('div', { class: 'cart__actions' },
      h('button', { class: 'cart__action', type: 'button', 'aria-label': `${zone.reopen}, ${counted}`, onClick: reopenAll }, zone.reopen),
      h('button', { class: 'cart__action cart__action--danger', type: 'button', 'aria-label': `${zone.remove}, ${counted}`, onClick: removeAll }, zone.remove));
    const toggle = h('button', {
      class: 'cart__toggle',
      type: 'button',
      'aria-controls': listEl.id,
      'aria-label': `${zone.title}, ${counted}`,
    }, icon('chev-d'), h('span', {}, `${zone.title} · `, h('span', { class: 'cart__count' }, String(done.length))));
    // Ouvrir / replier sur place (le bouton garde le focus)
    const show = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      listEl.hidden = !open;
      actionsRow.hidden = !open;
    };
    const foldable = {
      isOpen: () => toggle.getAttribute('aria-expanded') === 'true',
      setOpen: (open) => {
        rememberZone(listId, open);
        show(open);
      },
      contains: (node) => listEl.contains(node),
    };
    toggle.addEventListener('click', () => {
      foldable.setOpen(!foldable.isOpen());
      drawFoldAll();
    });
    show(isZoneOpen(listId));
    foldables.push(foldable); // « Tout replier » la replie aussi
    return h('section', { class: 'cart' },
      h('div', { class: 'cart__head' }, h('div', { class: 'cart__bar' }, toggle), actionsRow),
      listEl);
  }

  // Pastilles de priorité et d'échéance (listes autres que les courses) :
  // { chips, spoken } ; spoken complète le libellé du bouton de la ligne,
  // pour les lecteurs d'écran. « Aujourd'hui » : date du téléphone.
  const metaOf = (item) => {
    if (!view || view.list.category.isShopping) return { chips: [], spoken: '' };
    const chips = [];
    const spoken = [];
    const priority = priorityChip(item.priority);
    if (priority) {
      chips.push(h('span', { class: `chip${item.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), priority.text));
      spoken.push(priority.label.toLowerCase());
    }
    const due = dueChip(item.dueDate, item.checked, todayKey());
    if (due) {
      const tone = due.state === 'late' ? ' chip--late' : due.state === 'today' ? ' chip--accent' : '';
      chips.push(h('span', { class: `chip${tone}` }, icon(due.state === 'late' ? 'alert' : 'calendar', 'icon--xs'), due.text));
      spoken.push(due.label.toLowerCase());
    }
    return { chips, spoken: spoken.length ? `, ${spoken.join(', ')}` : '' };
  };

  // Ligne d'un article : case à cocher + nom (ouvre la feuille « Article »)
  const itemRow = (item) => itemRowWith(item, metaOf(item));
  const itemRowWith = (item, meta) => h('li', { class: `item${item.checked ? ' is-done' : ''}`, 'data-item-id': item.id },
    h('button', {
      class: 'check',
      type: 'button',
      'aria-pressed': String(item.checked),
      'aria-label': `${item.checked ? 'Décocher' : 'Cocher'} ${item.name}`,
      onClick: () => toggle(item),
    }, h('span', { class: 'check__box' }, item.checked ? icon('check') : null)),
    h('button', { class: 'item__body', type: 'button', 'aria-label': `Modifier ${item.name}${meta.spoken}`, onClick: () => openItemSheet(item) },
      h('span', { class: 'item__text' },
        h('span', { class: 'item__name' }, item.name),
        item.note ? h('span', { class: 'item__note' }, item.note) : null,
        meta.chips.length ? h('span', { class: 'item__meta' }, meta.chips) : null),
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
      alt: `Photo de l'${itemWords(view?.list).one} ${item.name}`,
      caption: [view?.list.name, group].filter(Boolean).join(' · '),
    });
  }

  // --- Actions ---

  // Cocher / décocher : affiché tout de suite (copie locale), envoyé ensuite
  // (file d'attente : avec ou sans réseau)
  function toggle(item) {
    actions.checkItem(item, !item.checked);
  }

  // « Tout remettre à acheter » / « Tout rouvrir » : décoche tous les cochés
  // (après confirmation). Une seule opération, rejouée sans doublon hors ligne.
  async function reopenAll() {
    const count = view?.checked ?? 0;
    if (!count) return;
    const list = view.list;
    const one = count === 1;
    const place = view.multi ? 'magasin' : 'rayon';
    const ok = await confirmSheet({
      title: list.category.isShopping ? `Remettre ${countItems(count, list)} à acheter ?` : `Rouvrir ${countItems(count, list)} ?`,
      text: list.category.isShopping
        ? (one ? `Il reviendra dans son ${place}, décoché.` : `Ils reviendront dans leur ${place}, décochés.`)
        : (one ? 'Il reviendra dans la liste, décoché.' : 'Ils reviendront dans la liste, décochés.'),
      confirmLabel: 'Confirmer',
    });
    if (!ok) return;
    const reopened = await actions.uncheckAll(listId);
    toast(list.category.isShopping
      ? `${countItems(reopened, list)} remis à acheter`
      : `${countItems(reopened, list)} ${reopened === 1 ? 'rouvert' : 'rouverts'}`);
  }

  // « Retirer du panier » / « Retirer les terminés » : supprime les cochés
  // pour tout le monde (après confirmation)
  async function removeAll() {
    const count = view?.checked ?? 0;
    if (!count) return;
    const list = view.list;
    const one = count === 1;
    const ok = await confirmSheet({
      title: `Retirer ${countItems(count, list)} de la liste ?`,
      text: one ? 'Il sera supprimé pour tout le monde.' : 'Ils seront supprimés pour tout le monde.',
      warning: one ? "C'est définitif : impossible de le récupérer." : "C'est définitif : impossible de les récupérer.",
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (!ok) return;
    const removed = await actions.removeChecked(listId);
    toast(`${countItems(removed, list)} ${removed === 1 ? 'retiré' : 'retirés'}`);
  }

  function openListMenu() {
    if (!view) return;
    const items = [];
    if (view.list.isOwner) items.push({ icon: 'pencil', label: 'Modifier la liste', onSelect: () => navigate('editList', { id: listId }) });
    if (view.list.isOwner) items.push({ icon: 'link', label: 'Partager par lien', onSelect: () => openShareSheet(view.list) });
    items.push({ icon: 'sync', label: 'Actualiser', onSelect: () => refreshData({ full: true }) });
    openMenu(items, { label: 'Menu de la liste' });
  }

  // --- Ajout d'un article (ou d'un élément) ---
  // Le texte du champ (« Ajouter un article / un élément ») est posé par
  // draw(), selon la catégorie de la liste.

  const input = h('input', {
    class: 'addbar__input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'sentences',
    enterkeyhint: 'done',
    maxlength: '100',
  });
  const suggestBox = h('div', { class: 'suggest', role: 'listbox', 'aria-label': 'Suggestions', hidden: true });
  // Mode scan (listes de courses) : bouton « Scanner » entre le champ et +
  const scanner = createScanner({
    listId,
    getView: () => view,
    check: (item, checked) => actions.checkItem(item, checked),
    add: async (name, { note, ean }) => {
      const item = await addNamed(name, { ...(note ? { note } : {}), ...(ean ? { ean } : {}) });
      if (item) revealItem(item.id);
      return item;
    },
  });
  scanner.button.hidden = true; // affiché par draw() pour une liste de courses
  const addForm = h('form', { class: 'addbar__row', novalidate: true },
    h('label', { class: 'addbar__field' }, input),
    scanner.button,
    h('button', { class: 'btn btn--primary btn--icon', type: 'submit', 'aria-label': 'Ajouter' }, icon('plus')));
  const addbar = h('div', { class: 'addbar' }, suggestBox, addForm, scanner.inputs);

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

  // Suggestions : les plus fréquentes d'abord, début tapé en gras. Listes de
  // courses seulement : dans une liste de tâches, pas de menu (Entrée ou +
  // ajoutent ce qui a été tapé).
  function drawSuggestions() {
    if (!remembersNames(view?.list)) {
      suggestBox.hidden = true;
      return;
    }
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
      exact ? null : option([icon('plus'), h('span', {}, `Ajouter « ${typed.trim()} »`)], `Nouvel ${itemWords(view?.list).one}`, () => addTyped(typed), 'suggest__item--new'));
    suggestBox.hidden = false;
  }

  // Ajoute ce qui a été tapé (ou la suggestion choisie)
  async function addTyped(text) {
    const name = text.replace(/\s+/g, ' ').trim();
    if (!name || !view) return;
    suggestBox.hidden = true;
    // Le champ est vidé juste avant l'ajout (pas si la fenêtre de choix du
    // rayon ou du magasin est fermée sans choisir)
    const item = await addNamed(name, {}, () => {
      input.value = '';
    });
    // Liste de courses : l'ajout se termine (plus de curseur dans le champ,
    // clavier replié) et l'article ajouté est montré dans la liste. Autres
    // listes : inchangé, le champ garde le curseur pour enchaîner.
    if (!item) return;
    if (!view?.list.category.isShopping) {
      whenRow(item.id, unfoldRow); // groupe replié : déplié, sans autre changement
      return;
    }
    suggestBox.hidden = true;
    releaseFocus();
    revealItem(item.id);
  }

  // Attend la ligne d'un article tout juste ajouté : la liste peut être
  // redessinée un peu plus tard (jamais pendant qu'un doigt est posé dessus),
  // une seconde au plus.
  function whenRow(itemId, then, tries = 30) {
    const row = content.querySelector(`li[data-item-id="${CSS.escape(itemId)}"]`);
    if (row) then(row);
    else if (tries > 0) setTimeout(() => whenRow(itemId, then, tries - 1), 40);
  }

  // Un article ajouté depuis ce téléphone dans un groupe replié : le groupe
  // se déplie (un ajout venu de l'autre téléphone ne change rien)
  function unfoldRow(row) {
    const group = foldables.find((f) => f.contains(row));
    if (group && !group.isOpen()) {
      group.setOpen(true);
      drawFoldAll();
    }
  }

  // Fait défiler la liste jusqu'à un article tout juste ajouté (groupe
  // déplié au besoin) et le met brièvement en évidence
  function revealItem(itemId) {
    whenRow(itemId, (row) => {
      unfoldRow(row);
      row.scrollIntoView({ block: 'center', behavior: 'smooth' }); // au milieu : jamais sous le toast
      row.classList.add('item--added');
      setTimeout(() => row.classList.remove('item--added'), 1600);
    });
  }

  // Ajoute un article (champ d'ajout ou mode scan). extra : autres champs
  // (note, code-barres…). Renvoie l'article ajouté, ou false si la fenêtre de
  // choix du rayon ou du magasin a été fermée sans choisir.
  async function addNamed(name, extra = {}, beforeCreate = () => {}) {
    if (!view) return false;
    if (view.multi) {
      // Liste « multi » : magasin habituel, sinon on le demande une fois
      const storeId = usualStoreFor(app.data, view.list, name);
      if (storeId === null) {
        const sub = isKnownItem(app.data, name)
          ? `« ${name} » n'a encore jamais été acheté dans ces magasins. Son magasin sera retenu pour la prochaine fois.`
          : `« ${name} » est un nouvel ${itemWords(view.list).one}. Son magasin sera retenu pour la prochaine fois.`;
        const chosen = await pickStore({ title: 'Dans quel magasin ?', sub, confirmLabel: 'Ajouter à la liste' });
        if (chosen === undefined) return false; // fenêtre fermée sans choisir
        beforeCreate();
        return createItem(name, { ...extra, storeId: chosen });
      } else {
        // Magasin habituel : le serveur le choisira (le téléphone l'affiche déjà)
        beforeCreate();
        return createItem(name, extra);
      }
    } else if (view.list.category.isShopping && !isKnownItem(app.data, name)) {
      // Article inconnu sur une liste de courses : on demande son rayon une fois
      const aisleId = await pickAisle({ title: 'Dans quel rayon ?', sub: `« ${name} » est un nouvel ${itemWords(view.list).one}. Son rayon sera retenu pour la prochaine fois.`, confirmLabel: 'Ajouter à la liste' });
      if (aisleId === undefined) return false; // fenêtre fermée sans choisir
      beforeCreate();
      return createItem(name, { ...extra, aisleId });
    }
    beforeCreate();
    return createItem(name, extra);
  }

  // Ajout : tout de suite dans la copie locale, puis envoyé (file d'attente)
  // Renvoie l'article ajouté
  async function createItem(name, fields = {}) {
    return actions.addItem({ listId, name, ...fields });
  }

  // --- Feuille « Article » : nom, quantité, note, rayon (ou magasin) ---

  function openItemSheet(item) {
    const multi = Boolean(view?.multi);
    const isShopping = view?.list.category.isShopping && !multi; // rayon seulement hors « multi »
    const words = itemWords(view?.list); // « article » ou « élément »
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

    // --- Priorité et échéance (listes autres que les courses) ---
    const classic = !view?.list.category.isShopping;
    let priority = item.priority ?? 'normal';
    let dueDate = item.dueDate ?? null;
    // Priorité : trois choix ; le choix actif a une coche ET son texte
    const priorityOptions = [['low', 'Basse'], ['normal', 'Normale'], ['high', 'Élevée']].map(([value, label]) => {
      const option = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', onClick: () => {
        priority = value;
        drawPriority();
      } });
      option.dataset.value = value;
      option.dataset.label = label;
      return option;
    });
    const drawPriority = () => {
      for (const option of priorityOptions) {
        const on = option.dataset.value === priority;
        option.setAttribute('aria-checked', String(on));
        replace(option, on ? icon('check', 'icon--sm icon--check') : null, option.dataset.label);
      }
    };
    drawPriority();
    // Échéance : le vrai sélecteur de date du téléphone (date seule, sans
    // heure), posé, invisible, sur un bouton qui affiche la date en français ;
    // raccourcis dessous. Aucune saisie au clavier.
    const dueText = h('span', { class: 'input__value' });
    const dateInput = h('input', { class: 'due-picker__input', type: 'date', min: '2000-01-01', max: '2100-12-31' });
    // Sur ordinateur, un clic ouvre aussi le calendrier
    dateInput.addEventListener('click', () => {
      try {
        dateInput.showPicker?.();
      } catch {
        // calendrier indisponible : le champ reste utilisable
      }
    });
    dateInput.addEventListener('change', () => {
      if (dateInput.value) dueDate = dateInput.value;
      drawDue();
    });
    const clearDue = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
      dueDate = null;
      drawDue();
    } }, 'Effacer');
    const drawDue = () => {
      const label = dueDate ? dueDateLabel(dueDate) : 'Aucune échéance';
      replace(dueText, icon('calendar', 'icon--sm'), label);
      dateInput.value = dueDate ?? '';
      dateInput.setAttribute('aria-label', `Échéance : ${label}. Choisir une date`);
      clearDue.disabled = !dueDate;
    };
    const shortcut = (label, days) => h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
      dueDate = addDays(todayKey(), days);
      drawDue();
    } }, label);
    drawDue();
    const classicFields = classic ? [
      h('div', { class: 'field' },
        h('span', { class: 'field__label', id: 'priority-label' }, 'Priorité'),
        h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'priority-label' }, priorityOptions)),
      h('div', { class: 'field' },
        h('span', { class: 'field__label', 'aria-hidden': 'true' }, 'Échéance'),
        h('div', { class: 'due-picker' }, h('span', { class: 'input input--select', 'aria-hidden': 'true' }, dueText, icon('chev-d')), dateInput),
        h('div', { class: 'due-shortcuts' }, shortcut("Aujourd'hui", 0), shortcut('Demain', 1), shortcut('Dans 1 semaine', 7), clearDue)),
    ] : null;

    // --- Code-barres (listes de courses, facultatif) : saisi à la main, ou
    // lu sur une photo par « Scanner » (sélecteur d'images du téléphone, même
    // lecteur que le mode scan). Vérifié à l'enregistrement ; vide = pas de
    // code.
    const shopping = Boolean(view?.list.category.isShopping);
    const eanInput = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '20', enterkeyhint: 'done', value: item.ean ?? '' });
    const eanField = field('Code-barres', eanInput, { hint: 'Chiffres sous les barres (8, 12 ou 13)' });
    const eanStatus = h('p', { class: 'field__hint', role: 'status', hidden: true });
    // Un autre article de la liste porte déjà ce code : on prévient, sans interdire
    const eanTwin = h('div', { class: 'note', role: 'status', hidden: true }, icon('alert'), h('p'));
    const eanPicker = createImagePicker((file) => readEan(file));
    const eanScan = eanPicker.button({ class: 'btn btn--secondary', 'aria-label': 'Scanner le code-barres' }, icon('barcode', 'icon--sm'), 'Scanner');
    const eanClear = h('button', { class: 'btn btn--secondary', type: 'button', 'aria-label': 'Effacer le code-barres', onClick: () => {
      eanInput.value = '';
      drawEan();
    } }, 'Effacer');
    const drawEan = () => {
      eanField.setError(null);
      eanClear.disabled = !eanInput.value.trim();
      const code = normalizeBarcode(eanInput.value);
      const twin = code ? [...app.data.items.values()].find((other) => other.listId === item.listId && other.id !== item.id && other.ean === code) : null;
      eanTwin.hidden = !twin;
      eanTwin.querySelector('p').textContent = twin ? `« ${twin.name} » a déjà ce code-barres dans la liste.` : '';
    };
    eanInput.addEventListener('input', drawEan);
    // Photo prise ou choisie : le code lu remplit le champ
    async function readEan(file) {
      eanField.setError(null);
      eanStatus.textContent = 'Lecture du code-barres…';
      eanStatus.hidden = false;
      eanScan.disabled = true;
      let message = null;
      try {
        const code = await readBarcode(file);
        if (code) eanInput.value = code;
        else message = 'Code non lu, réessayez plus près et bien à plat, ou saisissez-le.';
      } catch (err) {
        message = err instanceof ImageUnreadable
          ? "Ce fichier n'est pas une image lisible. Réessayez avec une photo, ou saisissez le code."
          : "La lecture des codes-barres n'est pas disponible pour le moment (au premier scan, il faut du réseau). Vous pouvez saisir le code.";
      }
      eanStatus.hidden = true;
      eanScan.disabled = false;
      drawEan();
      if (message) eanField.setError(message);
    }
    drawEan();
    const eanFields = shopping ? h('div', { class: 'stack stack--sm' },
      eanField.field, h('div', { class: 'photo-actions' }, eanScan, eanClear), eanStatus, eanTwin, eanPicker.input) : null;

    // --- Photo (facultative) : envoyée ou retirée tout de suite, sans
    // attendre « Enregistrer ». Hors ligne, les boutons sont désactivés.
    let current = item; // dernier état connu de l'article (photoAt)
    let busy = false;
    let gone = false; // article supprimé ailleurs pendant que la feuille est ouverte
    const photoArea = h('div');
    const photoNote = h('p', { class: 'field__hint', role: 'status', hidden: true });
    // Un seul bouton : le sélecteur d'images du téléphone (son menu propose
    // l'appareil photo ou la photothèque). La photo reste facultative.
    const photoPicker = createImagePicker((file) => sendPhoto(file));

    const drawPhoto = () => {
      const button = (classes, iconName, text, label, onClick) => h('button', {
        class: `btn ${classes}`, type: 'button', 'aria-label': label, disabled: busy || gone, onClick,
      }, icon(iconName, 'icon--sm'), text);
      const pick = (classes, text) => photoPicker.button({ class: `btn ${classes}`, 'aria-label': text, disabled: busy || gone }, icon('camera', 'icon--sm'), text);
      if (actions.hasPhoto(current)) {
        replace(photoArea, h('div', { class: 'photo-block' },
          h('button', { class: 'photo-block__thumb', type: 'button', 'aria-label': `Agrandir la photo de ${current.name}`, onClick: () => showPhoto(current) },
            h('img', { class: 'photo', src: actions.photoSrc(current), alt: '' })),
          h('div', { class: 'photo-block__actions' },
            pick('btn--secondary btn--sm', 'Changer la photo'),
            button('btn--danger-outline btn--sm', 'trash', 'Retirer', 'Retirer la photo', removePhoto))));
      } else {
        replace(photoArea, pick('btn--secondary btn--block', 'Ajouter une photo'));
      }
      photoNote.textContent = busy ? 'Préparation de la photo…' : current.localPhoto ? 'Photo en attente d\'envoi : elle partira dès que possible.' : '';
      photoNote.hidden = !photoNote.textContent;
    };

    // Photo prise ou choisie : réduite ici, puis mise en file d'attente (elle
    // part tout de suite avec du réseau, sinon dès son retour)
    async function sendPhoto(file) {
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
    const contentOf = (it) => JSON.stringify([it.name, it.quantity, it.note, it.aisleId ?? null, it.storeId ?? null, it.priority ?? 'normal', it.dueDate ?? null, it.ean ?? null]);
    let seen = contentOf(item);
    let mine = false; // vrai pendant mes propres enregistrements
    const stopWatching = onDataChange(() => {
      if (mine) return;
      const latest = app.data.items.get(item.id);
      if (!latest) {
        if (gone) return;
        gone = true;
        conflictText.textContent = `Cet ${words.one} a été supprimé par une autre personne.`;
      } else {
        const changedElsewhere = gone || contentOf(latest) !== seen;
        gone = false;
        current = latest;
        seen = contentOf(latest);
        drawPhoto();
        if (!changedElsewhere) return;
        conflictText.textContent = `Cet ${words.one} vient d'être modifié par une autre personne. Seuls vos changements seront enregistrés.`;
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
      classicFields,
      eanFields,
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Photo (facultative)'), photoArea, photoNote, photoPicker.input),
      isShopping ? h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'aisle-label' }, 'Rayon'), aisleButton) : null,
      multi ? h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'store-label' }, 'Magasin'), storeButton) : null,
      error.note,
      h('div', { class: 'sheet__actions' }, save, remove));
    if (isShopping) aisleButton.setAttribute('aria-labelledby', 'aisle-label');

    const sheet = openSheet({
      title: `Modifier l'${words.one}`,
      content: form,
      scroll: true,
      onClose: () => stopWatching(),
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newName = name.value.replace(/\s+/g, ' ').trim();
      nameField.setError(newName ? null : 'Le nom est obligatoire');
      // Code-barres : vide = pas de code ; sinon vérifié (clé de contrôle) et
      // gardé sous sa forme normalisée (un UPC-A devient un EAN-13)
      const typedEan = eanInput.value.trim();
      const newEan = typedEan ? normalizeBarcode(typedEan) : null;
      if (shopping) eanField.setError(typedEan && !newEan ? 'Code invalide : vérifiez les chiffres' : null);
      if (!newName || (shopping && typedEan && !newEan)) return;
      const changes = {};
      if (newName !== item.name) changes.name = newName;
      if (quantity.value.trim() !== item.quantity) changes.quantity = quantity.value.trim();
      if (note.value.trim() !== item.note) changes.note = note.value.trim();
      if (isShopping && aisleId !== item.aisleId) changes.aisleId = aisleId;
      if (multi && storeId !== (item.storeId ?? null)) changes.storeId = storeId;
      if (classic && priority !== (item.priority ?? 'normal')) changes.priority = priority;
      if (classic && dueDate !== (item.dueDate ?? null)) changes.dueDate = dueDate; // null : échéance effacée
      if (shopping && newEan !== (item.ean ?? null)) changes.ean = newEan; // null : code effacé
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

  // Synchronisation, modification : la liste est redessinée (et retriée),
  // jamais pendant qu'un doigt est posé dessus
  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  onLeave(() => {
    document.title = 'Listo';
  });
  // Changement de jour (minuit, ou retour au premier plan le lendemain) :
  // « Aujourd'hui », « Demain » et « En retard » sont recalculés
  let day = todayKey();
  const newDay = () => {
    if (todayKey() === day) return;
    day = todayKey();
    draw();
  };
  const atMidnight = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    return setTimeout(() => {
      newDay();
      midnight = atMidnight();
    }, next - now);
  };
  let midnight = atMidnight();
  document.addEventListener('visibilitychange', newDay);
  onLeave(() => {
    clearTimeout(midnight);
    document.removeEventListener('visibilitychange', newDay);
  });
  draw();
  refreshData({ quiet: true }); // actualisation à l'ouverture

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', 'Retour à mes listes', () => goBack('lists'), 'mobile-only'),
      h('div', { class: 'topbar__main' }, title, sub),
      sortButton,
      menuButton),
    h('div', { class: 'statusbar' }, syncPill(() => refreshData({ full: true })), foldAll),
    content,
    addbar);
}
