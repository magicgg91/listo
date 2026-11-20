// Écran « Liste » (maquettes liste-1 à 6, liste-multi-1 et 2, liste-photos-1)
// et feuille « Article » (article-1 et 2, article-photo-1 à 4), avec la photo
// en plein écran (photo-plein-ecran-1).
//
// - Le champ d'ajout reste en bas, à portée de pouce. Dans toutes les
//   listes, après un ajout (Entrée, bouton +, suggestion ou mode scan),
//   l'ajout se termine : champ vidé, curseur retiré (clavier replié),
//   article ou élément montré brièvement dans la liste.
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
// - Lecture seule (droit « Lecture seule » donné par le propriétaire) : un
//   bandeau « Lecture seule » ; ni champ d'ajout, ni Scanner, ni glissement,
//   ni actions sur les cochés ; cases visibles mais inactives (cochés
//   toujours barrés) ; un appui sur une ligne ouvre une fiche à consulter.
//   Tri, groupes repliables et photo agrandie restent possibles. Le serveur
//   refuse de toute façon chaque écriture ; si le droit change, l'écran
//   bascule tout de suite (fenêtres ouvertes refermées, clavier replié).
// - Ordinateur (à partir de 1 024 px, design/maquettes/pc-A) : même écran,
//   autre disposition : en-tête (titre, « Partager », recherche toujours
//   visible, menu), outils (pastille d'état, tri, « Tout replier »), champ
//   d'ajout en haut, crayon et corbeille au survol (et au focus clavier) de
//   chaque ligne, « Réserver » au bout d'un souhait libre. Mêmes données,
//   mêmes actions, mêmes droits (revérifiés par le serveur).

import { isShoppingList, isWishList, typeLabel, typeIcon } from '../list-types.js';
import { wishForLabel, formatPrice, parsePrice, priceInputText, cleanLink, LINK_MAX } from '../wishes.js';
import { h, icon, iconButton, avatar, field, replace, errorNote, multiBadge, LABEL_INPUT } from '../dom.js';
import { errorMessage } from '../api.js';
import * as actions from '../actions.js';
import { shrinkPhoto, PhotoError, createImagePicker } from '../photo.js';
import { navigate, goBack, closeOverlays } from '../router.js';
import { splitPrefix, todayKey, addDays, dueDateLabel, dueChip, priorityChip, PRIORITY_LABELS, newsMark, namesList } from '../format.js';
import { normalizeItemName, HABITUAL_LIMIT_KEYBOARD } from '../history.js';
import { assignablePeople, memberNames, computeListView, canEditList, listOptions, addModeOf, listNews, seenTarget, availableSorts, effectiveSort, computeSuggestions, computeHabitual, checkedNamed, isKnownItem, activeOnly, storeChoices, usualStoreFor, remembersNames, loadItemSort, saveItemSort,
  groupKey, possibleGroupKeys, loadFoldedGroups, saveFoldedGroups, pruneFoldedGroups, isZoneOpen, rememberZone, loadOpenSubtasks, saveOpenSubtasks, checkedToRemove } from '../store.js';
import { progressOf, parentOf } from '../subtasks.js';
import { announce } from '../announce.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, openSheet, openMenu, confirmDialog, confirmSheet, toast, openLightbox, drawWhenIdle, releaseFocus, onPc, offlineBanner, watchMinute } from '../ui.js';
import { itemWords, wordKind, byKind, countItems, doneZoneWords, progressText, progressLabel } from '../words.js';
import { listIcon } from '../list-icons.js';
import { isMultiList } from '../sorting.js';
import { t, compareText, currencyName, lowerFirst } from '../i18n.js';

// « article » → « Article », « élément » → « Élément »
const capitalized = (word) => word.charAt(0).toUpperCase() + word.slice(1);
import { createScanner, scanAvailable } from './scan.js';
import { readBarcode, normalizeBarcode, ImageUnreadable } from '../barcode.js';
import { createSwipeController, SWIPE } from '../swipe.js';
import { createTapPicker, keepFieldFocus } from '../tap.js';
import { modeOf, peopleOf, assigneesOf } from '../assign.js';
import { splitItems, planBulkAdd, joinPastedLines, BULK_INPUT_MAX, ITEM_NAME_MAX } from '../bulk-add.js';
import { quantityFor } from '../quantity.js';
import { openCreateReference } from '../create-reference.js';
import { listActions } from './list-actions.js';
import { openSharePanel } from './share-panel.js';
import { recordUndo, forgetUndo, beforeOf } from '../undo.js';
import { keycap, singleKeysOn } from '../shortcuts.js';
import { createSearchRow } from '../search-row.js';
import { loupeButton } from '../tabbar.js';
import { isSearching, filterListView, highlightParts, resultsLabel } from '../search.js';
import { REPEAT_CHOICES, WEEKDAYS, MONTH_WEEKS, parseRepeat, makeRepeat, isOccurrence, firstOccurrence, weekdayOf, monthWeekOf, repeatSentence, repeatChip } from '../repeat.js';
import { REMINDERS, reminderLabel, timeLabel, isDueTime } from '../due-time.js';

export function renderList(listId, onLeave) {
  const pc = isDesktop(); // interface ordinateur (voir en tête du fichier)
  const title = h('h1', { class: pc ? 'pc-head__title' : 'topbar__title' });
  // Icône de la liste, juste avant le titre (décorative : le titre suffit)
  const titleIcon = h('span', { class: 'topbar__icon' });
  const sub = h('p', { class: pc ? 'pc-head__sub' : 'topbar__sub' });
  const content = h('div', { class: 'scroll' });
  // Glissement des lignes vers la gauche : une seule ouverte à la fois,
  // refermée par un toucher ailleurs ou par le défilement
  const swipes = createSwipeController(content);
  onLeave(() => swipes.stop());

  // --- Nouveautés de cette visite (server/news.js) ---
  // Les éléments ajoutés ou modifiés par les autres depuis ma dernière visite
  // (et, en direct, pendant que la liste est à l'écran) restent en halo
  // pendant toute la visite, jusqu'à ce que je touche leur ligne ; en
  // quittant la liste, tout est oublié (le halo ne revient pas). Le repère
  // « vu » monte dès que la liste est à l'écran, application visible
  // (jamais en arrière-plan ni écran verrouillé) : la pastille de l'accueil
  // disparaît, sur tous mes appareils.
  const visitNews = new Map(); // id de l'élément -> { kind, by }
  function takeNews() {
    if (document.visibilityState !== 'visible' || !app.data.loaded || !app.data.lists.has(listId)) return false;
    let added = false;
    for (const entry of listNews(app.data, listId)?.items ?? []) {
      const known = visitNews.get(entry.itemId);
      if (known?.kind === entry.kind && known?.by === entry.by) continue;
      visitNews.set(entry.itemId, { kind: entry.kind, by: entry.by });
      added = true;
    }
    const upTo = seenTarget(app.data, listId);
    // (une seule fois par repère : l'effet local arrive un instant après)
    if (upTo !== null && upTo > sentSeen) {
      sentSeen = upTo;
      actions.markSeen(listId, upTo); // passe par la file d'attente
    }
    return added;
  }
  let sentSeen = -1;
  // Ligne touchée : son halo s'en va (pour cette visite)
  function forgetNews(itemId, row) {
    if (!visitNews.delete(itemId)) return;
    row.classList.remove('item--news');
    row.querySelector('.item__news')?.remove();
  }

  // --- Recherche dans la liste (design/recherche) ---
  // Téléphone : la loupe ronde en bas à droite ouvre le champ sous le titre,
  // à la place de la ligne « À jour · Tout replier » ; la barre d'ajout se
  // cache pendant la recherche (décisions du 11 novembre 2026). Ordinateur :
  // champ toujours visible dans l'en-tête. Sur le nom des articles
  // seulement, jamais la note ; une simple vue sur la copie locale : ni
  // données, ni synchro, ni file d'attente touchées, hors ligne compris,
  // lecture seule comprise. Le texte cherché n'appartient qu'à cet écran :
  // changer de liste, quitter l'écran ou refermer la recherche le vide.
  // Nombre de résultats (annoncé aux lecteurs d'écran) : à droite de
  // l'indicateur de synchro sur ordinateur, au-dessus des résultats sur le
  // téléphone ; vide hors recherche
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const statusbar = h('div', { class: 'statusbar' });
  const loupe = pc ? null : loupeButton();
  const search = createSearchRow(content, {
    label: t('liste.recherche.label'),
    docked: pc,
    placeholder: pc ? t('liste.recherche.placeholder.pc') : t('liste.recherche.label'),
    status: pc ? null : searchMeta,
    onChange: () => draw(),
    // Champ utilisé : « Tout replier » masqué
    onActive: () => drawFoldAll(),
    // Téléphone : recherche ouverte ou refermée
    onOpen: (open) => {
      statusbar.hidden = open;
      loupe.sync();
      showAddbar();
    },
  });
  loupe?.set(search.loupe);
  const searching = () => isSearching(search.value);
  // Nom d'un article, le texte trouvé dans <mark class="hit"> (texte simple,
  // jamais de HTML)
  const itemName = (name) => (searching()
    ? highlightParts(name, search.value).map((part) => (part.hit ? h('mark', { class: 'hit' }, part.text) : part.text))
    : name);

  const menuButton = iconButton('more', t('liste.menu'), () => openListMenu());

  // Tri de la liste : choix gardé sur ce téléphone pour cette liste (un
  // réglage d'affichage propre à chaque personne, permis aussi en lecture
  // seule) ; l'icône du bouton montre le tri actif.
  // - Liste de courses : « Par rayon » (« Par magasin » pour une liste
  //   « multi »), le tri par défaut, ou « Ordre alphabétique » (à plat, sous
  //   un seul en-tête « À acheter ») ; le rayon des articles ne change pas.
  // - Autre liste : « Ordre alphabétique » (par défaut) ; « Par priorité »,
  //   « Par échéance » et « Par personne » ne sont proposés que si le réglage
  //   de la liste (priorité, échéance, attribution) est activé ; un choix gardé devenu indisponible laisse place au tri par
  //   défaut (sans être effacé : il revient avec le réglage).
  const SORTS = [
    ['aisle', 'layers', t('liste.tri.rayon'), t('liste.tri.rayon.message')],
    ['alpha', 'az', t('liste.tri.alpha'), t('liste.tri.alpha.message')],
    ['priority', 'arrow-up', t('liste.tri.priorite'), t('liste.tri.priorite.message')],
    ['due', 'calendar', t('liste.tri.echeance'), t('liste.tri.echeance.message')],
    ['person', 'users', t('liste.tri.personne'), t('liste.tri.personne.message')],
  ];
  // Liste « multi » : le premier choix groupe par magasin, il le dit
  const sortEntry = ([value, iconName, label, message]) => (value === 'aisle' && isMultiList(currentList())
    ? [value, 'store', t('liste.tri.magasin'), t('liste.tri.magasin.message')] : [value, iconName, label, message]);
  let itemSort = loadItemSort(listId);
  const sortButton = iconButton('az', t('liste.tri.bouton'), () => openSortMenu());
  sortButton.setAttribute('aria-haspopup', 'menu');
  sortButton.setAttribute('aria-expanded', 'false');
  const currentList = () => app.data.lists.get(listId);
  const activeSort = () => effectiveSort(currentList(), itemSort);
  const showSort = () => replace(sortButton, icon(sortEntry(SORTS.find(([value]) => value === activeSort()))[1]));
  showSort();
  function openSortMenu() {
    const offered = availableSorts(currentList());
    openMenu(SORTS.filter(([value]) => offered.includes(value)).map(sortEntry).map(([value, iconName, label, message]) => ({
      icon: iconName,
      label,
      checked: value === activeSort(),
      onSelect: () => {
        itemSort = value;
        saveItemSort(listId, value);
        showSort();
        draw();
        toast(message, { duration: 2000 });
      },
    })), { label: t('liste.tri.bouton'), anchor: pc ? sortButton : null }); // ordinateur : sous le bouton
  }

  // --- En-tête de l'ordinateur ---
  // « Partager » (propriétaire) ou « Personnes » (les autres membres), avec
  // les pastilles des personnes : ouvre le tiroir « Partager la liste »
  // (share-panel.js ; les autres n'y voient que les personnes, en lecture).
  // Le serveur revérifie de toute façon chaque action.
  const shareSlot = h('div', { class: 'pc-head__share' });
  // Liste d'envies : bandeau qui dit ce que la personne voit (texte ET icône)
  const wishNote = h('p', { class: 'note pc-banner', hidden: true });
  function drawPcHead(list) {
    const members = list.members.filter((m) => m.active || m.isOwner);
    members.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
    const people = h('div', { class: 'avatars', role: 'img', 'aria-label': t('liste.pc.partageeAvec', { names: namesList(members.map((m) => m.displayName)) }) },
      members.slice(0, 4).map((m, i) => avatar(m.displayName, { second: i > 0 })));
    replace(shareSlot, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'aria-haspopup': 'dialog', 'aria-keyshortcuts': 'P', 'data-action': 'share', 'data-pc-tip': `${list.isOwner ? t('liste.pc.partager') : t('liste.pc.personnes')} · P`, onClick: () => openSharePanel(list.id) },
      icon('users', 'icon--sm'), list.isOwner ? t('liste.pc.partager') : t('liste.pc.personnes'), people));
    shareSlot.hidden = false;
    // Envies : le bénéficiaire ne reçoit jamais les réservations (le serveur
    // ne les envoie pas) ; les autres membres les voient
    if (!isWishList(list)) {
      wishNote.hidden = true;
      return;
    }
    const hidden = list.forName ? null : list.forDisplayName ?? list.members?.find((m) => m.isOwner)?.displayName;
    replace(wishNote, list.isBeneficiary
      ? [icon('eye-off', 'icon--sm'), h('span', {}, t('liste.envies.beneficiaire'))]
      : [icon('eye', 'icon--sm'), h('span', {}, hidden ? t('liste.envies.visibles.cache', { name: hidden }) : t('liste.envies.visibles'))]);
    wishNote.hidden = false;
  }

  let view = null;
  // La liste peut-elle être modifiée depuis ce téléphone (copie locale à jour) ?
  const editable = () => canEditList(app.data.lists.get(listId));
  // Bandeau discret sous la barre du haut (même composant que la page publique)
  const readOnlyBanner = h('p', { class: 'readonly-banner', hidden: true }, icon('eye', 'icon--sm'), t('liste.lectureSeule'));

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
    foldAll.hidden = foldables.length < 2 || search.active; // masqué pendant la recherche
    foldAll.classList.toggle('fold-all--open', anyOpen);
    replace(foldAll, icon('chev-d', 'icon--sm'), anyOpen ? t('liste.toutReplier') : t('liste.toutDeplier'));
  }

  // En-tête de groupe repliable (design : section 16.11) : un vrai bouton
  // (aria-expanded, aria-controls), chevron qui tourne, compteur « X/Y » à
  // droite, ouvert comme replié (X : restants du groupe ; Y : total du
  // groupe, cochés compris). Lecteurs d'écran et infobulle : « 3 articles
  // restants sur 8 ».
  // name : nom du groupe ; lead : icône devant le nom (magasin), ou rien.
  function foldableGroup(list, group, name, lead = null) {
    if (searching()) return resultGroup(group, name, lead);
    const key = groupKey(group);
    const remaining = group.items.length; // le groupe ne contient que des non cochés
    const total = group.total ?? remaining;
    const listEl = h('ul', { id: `groupe-${listId}-${key.replace(':', '-')}` }, rowsOf(group.items));
    const counter = h('span', { class: 'aisle__count', 'aria-hidden': 'true' }, progressText(remaining, total));
    const toggle = h('button', {
      class: 'aisle__toggle',
      type: 'button',
      'aria-controls': listEl.id,
      'aria-label': `${name}, ${progressLabel(remaining, total, list)}`,
      title: progressLabel(remaining, total, list),
    }, icon('chev-d', 'icon--sm'), h('span', { class: 'aisle__name' }, lead, name), counter);
    const show = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      listEl.hidden = !open;
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

  // Groupe pendant la recherche : seulement ses articles trouvés, toujours
  // ouvert (même replié : l'état mémorisé n'est pas touché et revient après
  // la recherche), en-tête sans bouton de repli, avec le nombre de résultats
  // au lieu de « X/Y »
  function resultGroup(group, name, lead) {
    const count = group.items.length;
    return h('section', {},
      h('h2', { class: 'aisle' },
        h('span', { class: 'aisle__name' }, lead, name),
        h('span', { class: 'aisle__count', 'aria-label': resultsLabel(count) }, String(count))),
      h('ul', {}, rowsOf(group.items)));
  }

  // Aucun article trouvé : message, et « Effacer la recherche » (vide le
  // champ sans lui retirer le curseur)
  function noResults(words) {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty__icon' }, icon('search', 'icon--lg')),
      h('h2', { class: 'empty__title' }, t('liste.recherche.aucunResultat')),
      h('p', { class: 'empty__text' }, t('liste.recherche.aucun', { word: words.one, query: search.value.trim() })),
      h('button', {
        class: 'btn btn--secondary',
        type: 'button',
        onPointerdown: search.keepFocus.pointerdown,
        onMousedown: search.keepFocus.mousedown,
        onClick: () => search.clear(),
      }, t('liste.recherche.effacer')));
  }

  // Barre d'ajout : jamais en lecture seule ; masquée pendant la recherche
  // (téléphone : recherche ouverte ; ordinateur : curseur dans le champ)
  function showAddbar() {
    addbar.hidden = !editable() || (pc ? search.focused : search.open);
    // La loupe garde sa place pendant la recherche (barre seulement cachée)
    loupeDock?.classList.toggle('list-dock--high', editable());
  }

  // --- Dessin de la liste ---
  // Ordinateur : la liste est redessinée à chaque changement (copie locale,
  // serveur, temps réel) ; le focus clavier reste sur la même ligne (le même
  // bouton), ou passe à la ligne qui a pris sa place si elle a disparu
  const draw = () => {
    if (!pc) return drawList();
    const focused = document.activeElement;
    const row = content.contains(focused) ? focused.closest('li.item') : null;
    // « Réordonner » : le focus est remis par focusAfterDraw (Monter, Descendre)
    if (!row || row.classList.contains('reorder')) return drawList();
    const rows = [...content.querySelectorAll('li.item')];
    const index = rows.indexOf(row);
    const id = row.dataset.itemId;
    const part = ['.item__body', 'button.check', '[data-action="edit"]', '[data-action="delete"]'].find((sel) => focused.matches(sel)) ?? '.item__body';
    drawList();
    if (content.contains(focused)) return; // rien n'a été remplacé
    const same = content.querySelector(`li.item[data-item-id="${CSS.escape(id)}"]`);
    const target = same ? same.querySelector(part) ?? same.querySelector('.item__body') : content.querySelectorAll('li.item .item__body')[Math.min(index, content.querySelectorAll('li.item').length - 1)];
    target?.focus({ preventScroll: true });
  };
  const drawList = () => {
    // « Réordonner » : un bouton du mode qui a le focus le garde après un
    // nouveau dessin (réponse du serveur, temps réel), sur le téléphone aussi
    const held = content.contains(document.activeElement) ? reorderSelector(document.activeElement) : null;
    if (held && !focusAfterDraw) focusAfterDraw = [held];
    // Groupes repliables du nouveau dessin. « Tout replier » n'est recalculé
    // qu'après le dessin : le cacher un instant au début changeait la hauteur
    // de la zone qui défile pendant le dessin (12 px), et la liste sautait.
    foldables = [];
    if (!app.data.loaded) {
      search.show(h('p', { class: 'empty muted', role: 'status' }, t('liste.chargement')), { available: false });
      drawFoldAll();
      return;
    }
    view = computeListView(app.data, listId, { sort: itemSort, me: app.user.id });
    if (!view) {
      title.textContent = t('liste.introuvable');
      replace(titleIcon);
      replace(sub);
      menuButton.hidden = true;
      sortButton.hidden = true;
      shareSlot.hidden = true;
      wishNote.hidden = true;
      search.show(h('div', { class: 'empty' },
        h('h2', { class: 'empty__title' }, t('liste.introuvable')),
        h('p', { class: 'empty__text' }, t('liste.introuvable.texte')),
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => navigate('lists', {}, { replace: true }) }, t('liste.retourMesListes'))), { available: false });
      drawFoldAll();
      searchMeta.textContent = '';
      addbar.hidden = true;
      readOnlyBanner.hidden = true;
      return;
    }
    const { list, groups, done } = view;
    const canEdit = canEditList(list);
    // « article » pour une liste de courses, « élément » sinon (words.js)
    const words = itemWords(list);
    const placeholder = byKind(list, { shopping: t('liste.ajout.placeholder.courses'), tasks: t('liste.ajout.placeholder.taches'), wishes: t('liste.ajout.placeholder.envies') });
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);
    // Courses et tâches : plusieurs éléments d'un coup (bulk-add.js), donc un
    // champ plus long ; liste d'envies : un seul, 100 caractères comme avant
    input.maxLength = isWishList(list) ? ITEM_NAME_MAX : BULK_INPUT_MAX;
    document.title = `${list.name} · Listo`;
    title.textContent = list.name;
    replace(titleIcon, icon(listIcon(list), 'icon--sm'));
    if (pc) {
      // Ordinateur : « Carrefour Market · Courses », « Tâches », « Envies · pour vous »
      replace(sub, list.store
        ? [icon('store', 'icon--xs'), `${list.store.name} · ${typeLabel(list)}`, view.multi ? multiBadge() : null]
        : [icon(typeIcon(list), 'icon--xs'), isWishList(list) ? `${typeLabel(list)} · ${wishForLabel(list, { inline: true })}` : typeLabel(list)]);
      drawPcHead(list);
    } else {
      replace(sub, list.store ? [icon('store', 'icon--xs'), list.store.name, view.multi ? multiBadge() : null] : isWishList(list) ? wishForLabel(list) : typeLabel(list));
    }
    menuButton.hidden = !menuActions().length; // aucune action : pas de menu
    // Bouton seulement s'il y a un choix : toujours pour une liste de courses
    // (par rayon ou alphabétique) ; ailleurs, si la priorité ou l'échéance
    // est activée
    sortButton.hidden = availableSorts(list).length < 2;
    showSort();
    readOnlyBanner.hidden = canEdit;
    showAddbar(); // lecture seule : aucun ajout
    // Bouton « Scanner » : listes de courses seulement (recherche activée)
    scanner.button.hidden = !canEdit || !scanAvailable(list);
    // Liste sans en-tête de rayon (tâches…) : la liste commence plus haut
    content.classList.toggle('scroll--flat', !isShoppingList(list) && activeSort() !== 'priority');

    if (groups.length === 0 && done.length === 0) {
      // Rien à chercher : le champ de recherche est masqué
      search.show(h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon(typeIcon(list), 'icon--lg')),
        h('h2', { class: 'empty__title' }, t('liste.vide')),
        h('p', { class: 'empty__text' }, canEdit ? (pc ? t('liste.vide.ajouter.pc', { word: words.one }) : t('liste.vide.ajouter', { word: words.one })) : t('liste.vide.lectureSeule')),
        // Ordinateur : l'astuce du raccourci (si les raccourcis à une touche sont actifs)
        // (une phrase entière : la touche prend la place de {key})
        pc && canEdit && singleKeysOn() ? h('p', { class: 'empty__text' }, ...t('liste.vide.astuce').split('{key}').flatMap((part, i) => (i ? [h('kbd', { class: 'keycap' }, 'A'), part] : [part]))) : null), { available: false });
      drawFoldAll();
      searchMeta.textContent = '';
      return;
    }
    // Groupes disparus (rayon ou magasin supprimé) : oubliés
    if (pruneFoldedGroups(folded, possibleGroupKeys(app.data))) saveFoldedGroups(listId, folded);
    // Recherche : seulement les articles trouvés (search.js) ; les groupes
    // sans résultat disparaissent, les cochés trouvés restent dans « Dans le
    // panier ». Les événements temps réel redessinent ici : la saisie et le
    // curseur du champ restent.
    const shown = searching() ? filterListView(view, search.value) : { groups, done, subtasks: view.subtasks };
    shownSubtasks = shown.subtasks;
    searchMeta.textContent = searching() ? resultsLabel(shown.count) : '';
    if (searching() && shown.count === 0) {
      search.show(noResults(words));
      drawFoldAll();
      return;
    }
    search.show([shown.groups.map((group) => (
      // En-tête collant et repliable : rayon, ou magasin (avec son icône)
      // dans une liste « multi »
      // Liste de courses en ordre alphabétique : un seul en-tête « À acheter »
      group.all ? foldableGroup(list, group, group.label)
      : view.multi ? foldableGroup(list, group, group.store?.name ?? t('liste.sansMagasin'), icon('store', 'icon--xs'))
        : isShoppingList(list) ? foldableGroup(list, group, group.aisle?.name ?? t('liste.sansRayon'))
          // Tri par priorité : un en-tête par groupe (« Priorité élevée »…)
          : group.label ? foldableGroup(list, group, group.label)
            // Ordre alphabétique ou par échéance : liste simple, sans en-tête
            : h('section', {}, h('ul', {}, rowsOf(group.items))))),
    shown.done.length ? doneZone(list, shown.done) : null]);
    drawFoldAll();
    // La principale de « Réordonner » a disparu (supprimée ailleurs) : fin du mode
    if (reorderParent && !view.subtasks.has(reorderParent)) reorderParent = null;
    // Monter, Descendre, Réordonner, Terminé : le focus reste sur le bon
    // bouton (jamais un champ) après le dessin
    if (focusAfterDraw) {
      const wanted = focusAfterDraw;
      focusAfterDraw = null;
      const moveTarget = wanted.map((selector) => content.querySelector(selector)).find((button) => button && !button.disabled);
      moveTarget?.focus();
    }
  };

  // Zone des articles cochés, sous le dernier rayon (design/components.html,
  // « Zone des articles cochés ») : en-tête repliable avec le nombre, deux
  // actions (absentes quand la zone est repliée), puis les lignes cochées.
  // Elle n'est dessinée que s'il y a au moins un article coché.
  // Pendant la recherche : seulement les cochés trouvés, zone ouverte (son
  // état mémorisé n'est pas touché), sans ses deux actions (elles agiraient
  // aussi sur des articles non affichés), hors de « Tout replier ».
  function doneZone(list, done) {
    const inSearch = searching();
    const zone = doneZoneWords(list);
    const counted = inSearch ? resultsLabel(done.length) : countItems(done.length, list); // « 12 articles », « 4 éléments »
    const listEl = h('ul', { id: `zone-${listId}` }, rowsOf(done));
    const canEdit = canEditList(list); // lecture seule : pas d'actions
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
      actionsRow.hidden = !open || !canEdit || !mayCheck(list) || inSearch;
    };
    const foldable = {
      isOpen: () => toggle.getAttribute('aria-expanded') === 'true',
      setOpen: (open) => {
        if (!inSearch) rememberZone(listId, open); // recherche : rien de mémorisé
        show(open);
      },
      contains: (node) => listEl.contains(node),
    };
    toggle.addEventListener('click', () => {
      foldable.setOpen(!foldable.isOpen());
      drawFoldAll();
    });
    show(inSearch || isZoneOpen(listId));
    if (!inSearch) foldables.push(foldable); // « Tout replier » la replie aussi
    return h('section', { class: 'cart' },
      h('div', { class: 'cart__head' }, pc ? h('div', { class: 'cart__bar' }, toggle, actionsRow) : [h('div', { class: 'cart__bar' }, toggle), actionsRow]),
      listEl);
  }

  // Pastilles de priorité et d'échéance (listes autres que les courses) :
  // { chips, spoken } ; spoken complète le libellé du bouton de la ligne,
  // pour les lecteurs d'écran. « Aujourd'hui » : date du téléphone.
  // Seulement ce qui est activé pour la liste (listOptions) : rien d'une
  // priorité ou d'une échéance désactivée, ni pastille ni retard.
  const metaOf = (item) => {
    if (isWishList(view?.list)) return wishMeta(item);
    const options = listOptions(view?.list);
    if (!options.priority && !options.due && !options.assign) return { chips: [], spoken: '' };
    const chips = [];
    const spoken = [];
    const priority = options.priority ? priorityChip(item.priority) : null;
    if (priority) {
      chips.push(h('span', { class: `chip${item.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), priority.text));
      spoken.push(priority.label.toLowerCase());
    }
    const due = options.due ? dueChip(item.dueDate, item.checked, todayKey(), item.dueTime) : null;
    if (due) {
      const tone = due.state === 'late' ? ' chip--late' : due.state === 'today' ? ' chip--accent' : '';
      chips.push(h('span', { class: `chip${tone}` }, icon(due.state === 'late' ? 'alert' : 'calendar', 'icon--xs'), due.text));
      spoken.push(due.label.toLowerCase());
      // Tâche qui se répète : « ↻ Lu, Me » (phrase entière pour la lecture)
      if (item.repeat) {
        chips.push(h('span', { class: 'chip' }, icon('repeat', 'icon--xs'), repeatChip(item.repeat)));
        spoken.push(t('liste.lecture.repete', { rule: lowerFirst(repeatSentence(item.repeat)) }));
      }
    }
    // Tâche attribuée (après la date) : « Moi » (en bleu) ou le prénom, avec
    // l'icône ; plusieurs personnes : « Moi, Léa », « Léa +2 » ; chacun son
    // tour : la personne de cette fois (icône des personnes)
    if (options.assign && modeOf(item) === 'all') {
      const people = peopleOf(item).map((id) => personOf(view?.list, id)).filter(Boolean).sort((a, b) => Number(b.me) - Number(a.me));
      if (people.length) {
        const text = people.length <= 2 ? people.map((p) => p.name).join(', ') : `${people[0].name} +${people.length - 1}`;
        chips.push(h('span', { class: `chip${people.some((p) => p.me) ? ' chip--accent' : ''}` }, icon('users', 'icon--xs'), text));
        spoken.push(t('liste.lecture.pour', { names: people.map((p) => (p.me ? t('liste.lecture.moi') : p.name)).join(', ') }));
      }
    } else {
      const who = options.assign ? personOf(view?.list, item.assignedTo) : null;
      if (who) {
        const turn = modeOf(item) === 'turn';
        chips.push(h('span', { class: `chip${who.me ? ' chip--accent' : ''}` }, icon(turn ? 'users' : 'user', 'icon--xs'), who.name));
        spoken.push(turn ? t('liste.lecture.tour', { name: who.me ? t('liste.lecture.moi') : who.name }) : t('liste.lecture.pour', { names: who.me ? t('liste.lecture.moi') : who.name }));
      }
    }
    return { chips, spoken: spoken.length ? `, ${spoken.join(', ')}` : '' };
  };

  // « Pour » en lecture seule : la personne, « Léa, Marc », ou « Chacun son
  // tour : Léa → Marc → Zoé (cette fois : Léa) »
  function assignText(it) {
    const name = (id) => personOf(view?.list, id)?.name;
    if (modeOf(it) === 'all') return peopleOf(it).map(name).filter(Boolean).join(', ') || t('liste.personne');
    if (modeOf(it) === 'turn') return t('liste.pour.tour.detail', { names: peopleOf(it).map(name).filter(Boolean).join(' → '), name: name(it.assignedTo) ?? t('liste.pour.personneMinuscule') });
    return name(it.assignedTo) ?? t('liste.personne');
  }

  // Personne à qui une tâche est attribuée : { name, me } (« Moi » pour
  // soi), ou null (personne, ou plus membre de la liste)
  function personOf(list, userId) {
    if (userId == null) return null;
    if (userId === app.user.id) return { name: t('liste.moi'), me: true };
    const name = memberNames(list).get(userId);
    return name ? { name, me: false } : null;
  }

  // Liste d'envies : pastilles de la priorité (si activée), du prix et,
  // SEULEMENT si le serveur a envoyé les réservations de cette liste (jamais
  // au bénéficiaire), de la réservation : « Réservé par Marie et Paul »
  // (« vous » pour soi), puis « Ouvert à d'autres ». Plus rien sur un souhait
  // reçu. Texte ET icône, jamais la couleur seule.
  const wishMeta = (item) => {
    const chips = [];
    const spoken = [];
    const options = listOptions(view?.list);
    const priority = options.priority ? priorityChip(item.priority) : null;
    if (priority) {
      chips.push(h('span', { class: `chip${item.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), priority.text));
      spoken.push(priority.label.toLowerCase());
    }
    const price = formatPrice(item.priceCents);
    if (price) {
      chips.push(h('span', { class: 'chip' }, icon('euro', 'icon--xs'), price));
      spoken.push(price);
    }
    const reservation = item.checked ? null : view?.reservations?.get(item.id);
    if (reservation?.participants.length) {
      const text = reservationText(reservation);
      const mine = reservation.participants.some((p) => p.userId === app.user.id);
      chips.push(h('span', { class: `chip${mine ? ' chip--accent' : ''}` }, icon('gift', 'icon--xs'), text));
      spoken.push(text.toLowerCase());
      if (reservation.open) {
        chips.push(h('span', { class: 'chip' }, icon('plus', 'icon--xs'), t('liste.envies.ouvert')));
        spoken.push(t('liste.envies.ouvert.lecture'));
      }
    }
    return { chips, spoken: spoken.length ? `, ${spoken.join(', ')}` : '' };
  };
  // « Marie », « Marie et Paul », « vous et Marie »… (soi en premier) ; un
  // visiteur du lien public : « Jo (lien public) »
  const participantLabel = (p) => (p.viaLink ? t('liste.envies.visiteur', { name: p.displayName }) : p.displayName);
  const participantNames = (reservation) => {
    const me = reservation.participants.filter((p) => p.userId === app.user.id).map(() => t('liste.envies.vous'));
    return [...me, ...reservation.participants.filter((p) => p.userId !== app.user.id).map(participantLabel)];
  };
  const reservationText = (reservation) => t('liste.envies.reservePar', { names: namesList(participantNames(reservation)) });
  // « Reçu » (le coché d'une liste d'envies) : le bénéficiaire ou le
  // propriétaire seulement (le serveur refuse les autres)
  const mayCheck = (list) => !isWishList(list) || Boolean(list?.isOwner || list?.isBeneficiary);

  // Ligne d'un article (ou d'un élément) : case à cocher, nom (ouvre la
  // feuille « Article »), vignette de la photo. Elle glisse vers la gauche pour
  // révéler la zone rouge « Supprimer » (raccourci ; la poubelle de la fiche
  // reste la voie principale) : swipe.js. Le contenu de la ligne est dans
  // .swipe__slide, la zone rouge est un vrai bouton derrière.
  // Lecture seule : ligne simple, sans glissement ni zone rouge.
  const itemRow = (item, extra = null) => itemRowWith(item, withNews(item, metaOf(item)), extra);
  // Nouveauté de cette visite : repère texte « Ajouté par Marie » (lu aussi
  // par les lecteurs d'écran) en plus du halo : jamais la couleur seule
  const withNews = (item, meta) => {
    const mark = visitNews.get(item.id);
    if (!mark) return meta;
    const news = newsMark(mark.kind, mark.by);
    return { ...meta, news, spoken: `${meta.spoken}, ${news.charAt(0).toLowerCase()}${news.slice(1)}` };
  };
  // Halo : fond doux de la ligne, statique ; il s'en va au toucher de la ligne
  const markNews = (row, item, meta) => {
    if (!meta.news) return row;
    row.classList.add('item--news');
    for (const type of ['pointerdown', 'click']) row.addEventListener(type, () => forgetNews(item.id, row), true);
    return row;
  };
  // extra : bouton « 3/10 » d'une tâche principale (sous-tâches), au bout de la ligne
  const itemRowWith = (item, meta, extra = null) => {
    if (!canEditList(view?.list)) return markNews(h('li', { class: `item${item.checked ? ' is-done' : ''}`, 'data-item-id': item.id }, ...itemContent(item, meta, false), extra, pc ? reserveButton(item) : null), item, meta);
    const slide = h('div', { class: 'swipe__slide' }, ...itemContent(item, meta), extra, pc ? rowActions(item) : null);
    const remove = h('button', { class: 'swipe__delete', type: 'button', 'aria-label': t('liste.supprimer.nom', { name: item.name }), onClick: () => {
      swipes.close();
      deleteWithUndo(item);
    } }, icon('trash'), h('span', {}, t('liste.supprimer')));
    const row = h('li', { class: `item swipe${item.checked ? ' is-done' : ''}`, 'data-item-id': item.id }, slide, remove);
    swipes.attach(row, slide, remove);
    return markNews(row, item, meta);
  };
  // canEdit = false (lecture seule) : case non interactive, comme sur la page
  // publique (cochée = remplie ET barrée), et la ligne ouvre la fiche à consulter
  const itemContent = (item, meta, canEdit = true) => [
    canEdit && mayCheck(view?.list) ? h('button', {
      class: 'check',
      type: 'button',
      // Nom fixe et état dans aria-pressed (décision du 14 novembre 2026) :
      // VoiceOver dit « Tomates, bouton, sélectionné », l'état une seule
      // fois (avant : « Décocher Tomates, sélectionné »)
      'aria-pressed': String(item.checked),
      'aria-label': isWishList(view?.list) ? t('liste.envies.recu.nom', { name: item.name }) : item.name,
      onClick: () => toggle(item),
    }, h('span', { class: 'check__box' }, item.checked ? icon('check') : null))
      : h('span', { class: `check check--static${item.checked ? ' is-on' : ''}`, role: 'img', 'aria-label': isWishList(view?.list) ? (item.checked ? t('liste.etat.recu') : t('liste.etat.pasRecu')) : item.checked ? t('liste.etat.coche') : t('liste.etat.nonCoche') },
        h('span', { class: 'check__box' }, item.checked ? icon('check') : null)),
    h('button', { class: 'item__body', type: 'button', 'aria-label': `${canEdit ? t('liste.modifier.nom', { name: item.name }) : t('liste.voir.nom', { name: item.name })}${meta.spoken}`, onClick: () => (canEdit ? openItemSheet(item) : openItemView(item)) },
      h('span', { class: 'item__text' },
        h('span', { class: 'item__name' }, itemName(item.name)),
        meta.news ? h('span', { class: 'item__news' }, meta.news) : null,
        item.note ? h('span', { class: 'item__note' }, item.note) : null,
        meta.chips.length ? h('span', { class: 'item__meta' }, meta.chips) : null),
      // Liste d'envies : pas de quantité (celle d'une liste convertie reste
      // en base, cachée)
      item.quantity && !isWishList(view?.list) ? h('span', { class: 'item__qty' }, item.quantity) : null),
    // Vignette de la photo : un appui l'agrandit
    actions.hasPhoto(item) ? h('button', { class: 'item__photo', type: 'button', 'aria-label': t('liste.photo.agrandir', { name: item.name }), onClick: () => showPhoto(item) },
      h('img', { class: 'photo', src: actions.photoSrc(item), alt: '', loading: 'lazy', decoding: 'async' })) : null,
  ];

  // --- Sous-tâches (public/js/subtasks.js, décisions du 17 novembre 2026) ---
  // Une tâche principale porte au bout de sa ligne un bouton « 3/10 » (faites
  // sur toutes) avec un chevron : il déplie ses sous-tâches juste en dessous,
  // en retrait, puis « Ajouter une sous-tâche ». Repliées par défaut ; les
  // principales dépliées sont mémorisées sur ce téléphone (store.js).
  // Recherche : seulement les sous-tâches trouvées, dépliées (rien de mémorisé).
  const openSubtasks = loadOpenSubtasks(listId);
  let shownSubtasks = new Map(); // principale -> sous-tâches affichées
  const rowsOf = (items) => items.flatMap(entryRows);
  function entryRows(item) {
    const children = shownSubtasks.get(item.id);
    if (!children?.length) return [itemRow(item)];
    const inSearch = searching();
    const { done, total } = progressOf(view.subtasks.get(item.id) ?? children);
    const spoken = t('liste.sousTaches.progression', { name: item.name, count: done, total });
    // Mode « Réordonner » de cette principale : poignée, Monter, Descendre
    const reordering = !inSearch && reorderParent === item.id && canEditList(view?.list);
    const listEl = h('ul', { class: 'subtasks__list', id: `sous-taches-${item.id}` },
      reordering ? children.map((child, index) => reorderRow(child, children, index)) : children.map((child) => itemRow(child)),
      reordering ? reorderDoneRow(item)
        : !inSearch && !item.checked && canEditList(view?.list) ? addSubtaskRow(item, children.length) : null);
    const wrap = h('li', { class: 'subtasks' }, listEl);
    const toggle = h('button', {
      class: 'subtasks__toggle', type: 'button', 'aria-controls': listEl.id, 'aria-label': spoken, title: spoken,
    }, h('span', { class: 'subtasks__count', 'aria-hidden': 'true' }, `${done}/${total}`), icon('chev-d', 'icon--sm'));
    const show = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      wrap.hidden = !open;
    };
    // « Tout replier / Tout déplier » agit aussi sur les sous-tâches (pas
    // pendant la recherche : tout y est déplié, rien n'est mémorisé)
    const foldable = {
      isOpen: () => toggle.getAttribute('aria-expanded') === 'true',
      setOpen: (open) => {
        if (open) openSubtasks.add(item.id);
        else openSubtasks.delete(item.id);
        saveOpenSubtasks(listId, openSubtasks);
        show(open);
      },
      contains: (node) => wrap.contains(node),
    };
    // Ouvrir / replier sur place : ni redessin, ni saut ; le bouton garde le focus
    toggle.addEventListener('click', () => {
      // Replier pendant « Réordonner » : le mode se termine
      if (reordering) {
        reorderParent = null;
        foldable.setOpen(false);
        draw();
        return;
      }
      const open = !foldable.isOpen();
      if (inSearch) show(open);
      else foldable.setOpen(open);
      drawFoldAll();
    });
    show(reordering || inSearch || openSubtasks.has(item.id));
    if (!inSearch) foldables.push(foldable);
    return [itemRow(item, toggle), wrap];
  }
  // Dernière ligne d'une principale dépliée : « Ajouter une sous-tâche »
  // (et, dès deux sous-tâches, « Réordonner » à droite)
  const addSubtaskRow = (parent, count) => h('li', { class: 'subtasks__add' },
    h('button', { class: 'subtasks__add-btn', type: 'button', 'aria-label': t('liste.sousTaches.ajouter.nom', { name: parent.name }), onClick: () => openAddSubtask(parent) },
      h('span', { class: 'subtasks__plus', 'aria-hidden': 'true' }, icon('plus', 'icon--sm')), t('liste.sousTaches.ajouter')),
    // Deux flèches (haut, bas) : le mot ne tenait pas à côté sur le téléphone
    count >= 2 ? h('button', {
      class: 'icon-btn subtasks__reorder-btn', type: 'button', 'aria-label': t('liste.sousTaches.reordonner.nom', { name: parent.name }), 'data-reorder': parent.id, 'data-pc-tip': t('liste.sousTaches.reordonner'),
      onClick: () => {
        reorderParent = parent.id;
        focusAfterDraw = [`[data-move="down"][data-item="${CSS.escape(childrenIds(parent)[0] ?? '')}"]`, '[data-reorder-done]'];
        draw();
      },
    }, icon('arrow-up', 'icon--xs'), icon('arrow-down', 'icon--xs')) : null);

  // --- Ordre manuel des sous-tâches (« Réordonner », 17 novembre 2026) ---
  // Une principale à la fois : chaque sous-tâche a une poignée à glisser
  // (doigt ou souris) et deux boutons « Monter » / « Descendre » (clavier,
  // lecture à voix haute) ; « Terminé » ferme le mode. Ni coche, ni fiche,
  // ni glissement « Supprimer » pendant ce temps. Chaque déplacement part
  // tout de suite (copie locale, puis file d'attente : hors ligne compris).
  let reorderParent = null;
  // Boutons à remettre sous le focus après le prochain dessin (sélecteurs,
  // le premier bouton actif trouvé) : le focus reste sur le bouton touché
  let focusAfterDraw = null;
  // Sélecteur d'un bouton du mode (Monter, Descendre, Réordonner, Terminé), ou null
  function reorderSelector(el) {
    const { move, item, reorder, reorderDone } = el.dataset ?? {};
    if (move && item) return `[data-move="${move}"][data-item="${CSS.escape(item)}"]`;
    if (reorder) return `[data-reorder="${CSS.escape(reorder)}"]`;
    if (reorderDone) return `[data-reorder-done="${CSS.escape(reorderDone)}"]`;
    return null;
  }
  const childrenIds = (parent) => (view?.subtasks.get(parent.id) ?? []).map((child) => child.id);
  function reorderRow(child, children, index) {
    const label = (up) => (up ? t('liste.reordonner.monter', { name: child.name }) : t('liste.reordonner.descendre', { name: child.name }));
    const move = (step) => h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': label(step < 0),
      'data-move': step < 0 ? 'up' : 'down', 'data-item': child.id,
      disabled: step < 0 ? index === 0 : index === children.length - 1,
      onClick: () => moveStep(child, children, index, step),
    }, icon(step < 0 ? 'arrow-up' : 'arrow-down', 'icon--sm'));
    const handle = h('span', { class: 'reorder__handle', 'aria-hidden': 'true', title: t('liste.reordonner.glisser') }, icon('menu-lines', 'icon--sm'));
    const row = h('li', { class: `item reorder${child.checked ? ' is-done' : ''}`, 'data-item-id': child.id },
      handle, h('span', { class: 'reorder__name item__name' }, child.name), move(-1), move(1));
    handle.addEventListener('pointerdown', (event) => startDrag(event, row, child, children));
    return row;
  }
  const reorderDoneRow = (parent) => h('li', { class: 'subtasks__add subtasks__add--done' },
    h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'data-reorder-done': parent.id, onClick: () => {
      reorderParent = null;
      focusAfterDraw = [`[data-reorder="${CSS.escape(parent.id)}"]`];
      draw();
    } }, t('liste.reordonner.termine')));
  // Monter / Descendre d'un cran
  async function moveStep(child, children, index, step) {
    const target = index + step;
    if (target < 0 || target >= children.length || !editable()) return;
    const others = children.filter((other) => other.id !== child.id);
    const id = CSS.escape(child.id);
    focusAfterDraw = [`[data-move="${step < 0 ? 'up' : 'down'}"][data-item="${id}"]`, `[data-move="${step < 0 ? 'down' : 'up'}"][data-item="${id}"]`];
    await actions.moveItem(child, target === 0 ? null : others[target - 1].id);
    announce(t('liste.reordonner.position', { name: child.name, position: target + 1, total: children.length }));
  }
  // Glisser la poignée : la ligne suit le doigt (ou la souris) et passe
  // devant ou derrière ses voisines à mi-hauteur ; au lâcher, une seule
  // opération « déplacer » (rien si la place n'a pas changé)
  function startDrag(event, row, child, children) {
    if (event.button !== 0 || !editable()) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const list = row.parentElement;
    const startIndex = children.findIndex((other) => other.id === child.id);
    let originY = event.clientY;
    row.classList.add('is-dragging');
    const neighbour = (el) => (el?.classList.contains('reorder') ? el : null);
    const follow = (y) => {
      row.style.transform = `translateY(${y - originY}px)`;
      const next = neighbour(row.nextElementSibling);
      const prev = neighbour(row.previousElementSibling);
      const box = row.getBoundingClientRect();
      if (next) {
        const nextBox = next.getBoundingClientRect();
        if (box.bottom > nextBox.top + nextBox.height / 2) {
          list.insertBefore(next, row);
          originY += nextBox.height;
          row.style.transform = `translateY(${y - originY}px)`;
          return;
        }
      }
      if (prev) {
        const prevBox = prev.getBoundingClientRect();
        if (box.top < prevBox.top + prevBox.height / 2) {
          list.insertBefore(row, prev);
          originY -= prevBox.height;
          row.style.transform = `translateY(${y - originY}px)`;
        }
      }
    };
    const onMove = (moveEvent) => follow(moveEvent.clientY);
    const finish = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      row.style.transform = '';
      row.classList.remove('is-dragging');
      const rows = [...list.querySelectorAll(':scope > li.reorder')];
      const index = rows.indexOf(row);
      if (index === startIndex || index < 0) return;
      const afterId = index === 0 ? null : rows[index - 1].dataset.itemId;
      actions.moveItem(child, afterId);
      announce(t('liste.reordonner.position', { name: child.name, position: index + 1, total: children.length }));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  // Feuille « Nouvelle sous-tâche » : le nom de la principale en sous-titre,
  // un champ (jamais de curseur automatique : on touche le champ),
  // « Ajouter ». Entrée ajoute et garde la feuille ouverte, champ vidé et
  // clavier toujours ouvert, pour enchaîner plusieurs sous-tâches ; Entrée
  // sur un champ vide ferme la feuille.
  function openAddSubtask(parent) {
    if (!editable()) return;
    const subtaskInput = h('input', { class: 'input', type: 'text', maxlength: String(ITEM_NAME_MAX), autocomplete: 'off', enterkeyhint: 'done', 'aria-label': t('liste.sousTaches.champ'), placeholder: t('liste.sousTaches.champ') });
    const added = h('p', { class: 'field__hint', role: 'status' });
    const addButton = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, icon('plus', 'icon--sm'), t('liste.ajouter'));
    const subtaskForm = h('form', { class: 'stack', novalidate: true }, subtaskInput, added, addButton);
    const sheet = openSheet({ title: t('liste.sousTaches.nouvelle'), sub: parent.name, content: subtaskForm });
    subtaskForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = subtaskInput.value.replace(/\s+/g, ' ').trim();
      // Champ vide : terminé (Entrée sur un champ vide ferme la feuille)
      if (!name) {
        sheet.close();
        return;
      }
      if (!editable() || !app.data.items.has(parent.id)) {
        sheet.close();
        return;
      }
      await actions.addItem({ listId, name, parentId: parent.id });
      // La principale se déplie pour montrer la nouvelle sous-tâche
      if (!openSubtasks.has(parent.id)) {
        openSubtasks.add(parent.id);
        saveOpenSubtasks(listId, openSubtasks);
        draw();
      }
      subtaskInput.value = '';
      added.textContent = t('liste.sousTaches.ajoutee', { name });
    });
  }

  // Ordinateur : actions au bout de la ligne. Souhait libre (vue d'une
  // personne qui offre) : « Réserver » ; puis crayon (la fiche) et corbeille
  // (suppression annulable, comme le glissement). Visibles au survol de la
  // ligne et au focus clavier (CSS), toujours sur un écran tactile.
  function rowActions(item) {
    return [
      reserveButton(item),
      h('span', { class: 'item__actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('liste.modifier.nom', { name: item.name }), 'aria-keyshortcuts': 'E', 'data-action': 'edit', 'data-pc-tip': t('liste.pc.modifier.astuce'), onClick: () => openItemSheet(item) }, icon('pencil', 'icon--sm')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('liste.supprimer.nom', { name: item.name }), 'aria-keyshortcuts': 'Delete', 'data-action': 'delete', 'data-pc-tip': t('liste.pc.supprimer.astuce'), onClick: () => deleteWithUndo(item) }, icon('trash', 'icon--sm'))),
    ];
  }
  // « Réserver » : seulement si le serveur a envoyé les réservations de la
  // liste (jamais au bénéficiaire), pour un souhait ni reçu ni réservé. En
  // ligne seulement (comme dans la fiche) ; le serveur revérifie tout.
  function reserveButton(item) {
    if (!view?.reservations || item.checked || view.reservations.get(item.id)?.participants.length) return null;
    return h('button', {
      class: 'btn btn--secondary btn--sm item__act',
      type: 'button',
      'aria-label': t('liste.envies.reserver.nom', { name: item.name }),
      onClick: async () => {
        if (!navigator.onLine) {
          toast(t('liste.envies.horsLigne'));
          return;
        }
        try {
          await actions.reserveWish(item.id, false);
          toast(t('liste.envies.reserve'));
        } catch (err) {
          toast(errorMessage(err));
          refreshData({ quiet: true });
        }
      },
    }, icon('gift', 'icon--sm'), t('liste.envies.reserver'));
  }

  // Photo en plein écran, avec en légende la liste et le rayon (ou le magasin)
  function showPhoto(item) {
    const group = view?.multi ? storeName(item.storeId) : isShoppingList(view?.list) ? app.data.aisles.find((a) => a.id === item.aisleId)?.name : null;
    openLightbox({
      title: item.name,
      src: actions.photoSrc(item),
      alt: byKind(view?.list, { shopping: t('liste.photo.alt.courses', { name: item.name }), tasks: t('liste.photo.alt.taches', { name: item.name }), wishes: t('liste.photo.alt.envies', { name: item.name }) }),
      caption: [view?.list.name, group].filter(Boolean).join(' · '),
    });
  }

  // --- Actions ---

  // Supprimer un article (poubelle de la fiche, ou glissement vers la
  // gauche) : supprimé tout de suite, sans confirmation (copie locale, puis
  // file d'attente, avec ou sans réseau) ; un message en bas propose
  // « Annuler » pendant quelques secondes, qui remet le même article avec sa
  // photo (opération item.restore).
  // Ordinateur : l'action est aussi notée pour Ctrl+Z (undo.js) ; le message
  // reste 8 secondes et rappelle la touche.
  async function deleteWithUndo(item) {
    if (!editable()) return;
    // Sous-tâches : elles partent avec leur principale (et reviennent avec elle)
    const children = view?.subtasks.get(item.id)?.length ?? 0;
    await actions.deleteItem(item);
    const entry = { kind: 'delete', itemId: item.id, name: item.name };
    recordUndo(listId, entry);
    toast(children ? t('liste.supprime.avecSousTaches', { name: item.name, count: children }) : t('liste.supprime', { name: item.name }), { action: pc ? t('liste.annuler.pc') : t('liste.annuler'), onAction: () => {
      forgetUndo(listId, (e) => e === entry);
      actions.restoreItem(item.id);
    } });
  }

  // Cocher / décocher : affiché tout de suite (copie locale), envoyé ensuite
  // (file d'attente : avec ou sans réseau)
  function toggle(item) {
    if (!editable() || !mayCheck(view?.list)) return;
    // Tâche qui se répète : elle revient décochée, à sa date suivante
    const next = item.checked ? null : actions.nextDueOf(item);
    if (next) {
      checkRepeating(item, next);
      return;
    }
    // Sous-tâches : cocher une principale coche ses sous-tâches à faire
    // (message avec « Annuler ») ; décocher une sous-tâche décoche sa
    // principale cochée (Ctrl+Z la recoche)
    const children = !item.checked ? (view?.subtasks.get(item.id) ?? []).filter((child) => !child.checked) : [];
    const parent = item.checked && item.parentId ? app.data.items.get(item.parentId) : null;
    const reopened = parent?.checked && view?.subtasks.get(parent.id)?.some((child) => child.id === item.id) ? parent.id : null;
    const entry = { kind: 'check', itemId: item.id, name: item.name, checked: !item.checked,
      ...(children.length ? { children: children.map((child) => child.id) } : {}), ...(reopened ? { reopened } : {}) };
    recordUndo(listId, entry);
    actions.checkItem(item, !item.checked);
    if (!children.length) return;
    toast(t('liste.coche.avecSousTaches', { name: item.name, count: children.length }), { action: pc ? t('liste.annuler.pc') : t('liste.annuler'), onAction: () => {
      forgetUndo(listId, (e) => e === entry);
      const current = app.data.items.get(item.id);
      if (current?.checked) actions.checkItem(current, false);
      for (const child of children) {
        const now = app.data.items.get(child.id);
        if (now?.checked) actions.checkItem(now, false);
      }
    } });
  }

  // Cocher une tâche qui se répète : elle ne va pas dans « Terminés », elle
  // revient décochée à la date suivante (actions.checkItem). Le message dit
  // laquelle ; « Annuler » (et Ctrl+Z) remet l'ancienne date.
  function checkRepeating(item, next) {
    const before = actions.undoOfRepeat(item);
    // Chacun son tour : le message dit aussi pour qui est la fois suivante
    const nextPerson = actions.nextTurnOf(item);
    const who = nextPerson === null ? '' : ` · ${nextPerson === app.user.id ? t('liste.moi') : memberNames(view?.list).get(nextPerson) ?? ''}`;
    const entry = { kind: 'update', itemId: item.id, name: item.name, before, after: { dueDate: next, ...(nextPerson !== null ? { assignedTo: nextPerson } : {}) } };
    recordUndo(listId, entry);
    actions.checkItem(item, true);
    toast(`${t('liste.prochaineFois', { date: dueDateLabel(next) })}${who}`, { action: pc ? t('liste.annuler.pc') : t('liste.annuler'), onAction: () => {
      forgetUndo(listId, (e) => e === entry);
      const current = app.data.items.get(item.id);
      if (current && current.dueDate === next) actions.updateItem(current, before);
    } });
  }

  // « Tout remettre à acheter » / « Tout rouvrir » : décoche tous les cochés
  // (après confirmation). Une seule opération, rejouée sans doublon hors ligne.
  // Nombre de cochés de la liste (sous-tâches comprises)
  const checkedInList = () => [...app.data.items.values()].filter((it) => it.listId === listId && it.checked).length;
  async function reopenAll() {
    const count = checkedInList();
    if (!count) return;
    const list = view.list;
    const ok = await confirmSheet({
      title: isShoppingList(list) ? t('liste.rouvrir.courses.titre', { items: countItems(count, list) }) : t('liste.rouvrir.titre', { items: countItems(count, list) }),
      text: isShoppingList(list)
        ? (view.multi ? t('liste.rouvrir.courses.texte.magasin', { count }) : t('liste.rouvrir.courses.texte.rayon', { count }))
        : t('liste.rouvrir.texte', { count }),
      confirmLabel: t('liste.confirmer'),
    });
    if (!ok || !editable()) return;
    const reopened = await actions.uncheckAll(listId);
    toast(isShoppingList(list)
      ? t('liste.rouvrir.courses.fait', { items: countItems(reopened, list) })
      : t('liste.rouvrir.fait', { items: countItems(reopened, list), count: reopened }));
  }

  // « Retirer du panier » / « Retirer les terminés » : supprime les cochés
  // pour tout le monde (après confirmation)
  async function removeAll() {
    // Sous-tâches : une sous-tâche cochée sous une principale à faire reste
    const count = checkedToRemove(app.data, listId).length;
    if (!count) return;
    const list = view.list;
    const ok = await confirmSheet({
      title: t('liste.retirerCoches.titre', { items: countItems(count, list) }),
      text: t('liste.retirerCoches.texte', { count }),
      warning: t('liste.retirerCoches.avertissement', { count }),
      confirmLabel: t('liste.retirer'),
      danger: true,
    });
    if (!ok || !editable()) return;
    const removed = await actions.removeChecked(listId);
    toast(t('liste.retirerCoches.fait', { items: countItems(removed, list), count: removed }));
  }

  // Menu ⋮ : les mêmes actions que le menu « ⋯ » d'une carte de « Mes
  // listes » (list-actions.js). Pour actualiser : la pastille d'état.
  const menuActions = () => (view ? listActions(view.list, { onDeleted: () => navigate('lists', {}, { replace: true }) }) : []);
  function openListMenu() {
    const items = menuActions();
    if (items.length) openMenu(items, { label: t('liste.menu') });
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
  // Simple groupe de boutons (role="listbox" promettait les flèches et un
  // champ « combobox » : décision du 15 novembre 2026)
  const suggestBox = h('div', { class: 'suggest', role: 'group', 'aria-label': t('liste.suggestions'), hidden: true });
  // Toucher d'une suggestion ou du bouton « + » (tap.js, voir plus bas)
  const taps = createTapPicker();
  // Mode scan (listes de courses) : bouton « Scanner » entre le champ et +
  const scanner = createScanner({
    listId,
    getView: () => view,
    check: (item, checked) => editable() && actions.checkItem(item, checked),
    add: async (name, { note, ean }) => {
      const item = await addNamed(name, { ...(note ? { note } : {}), ...(ean ? { ean } : {}) });
      if (item) revealItem(item.id);
      return item;
    },
  });
  scanner.button.hidden = true; // affiché par draw() pour une liste de courses
  // Bouton « + » : ajout au relâchement du doigt, le champ gardant le curseur
  // (tap.js, comme les suggestions). Sinon, clavier ouvert, le champ perdait
  // le curseur dès l'appui, la barre d'ajout bougeait et il fallait toucher
  // « + » deux fois. Le click reste en secours (souris, clavier, lecteur
  // d'écran, touche Entrée) : un seul ajout par appui.
  // Champ vide (liste de courses) : « + » ouvre « Souvent ajoutés », sans
  // clavier (jamais de curseur automatique)
  const plus = taps.button(() => (input.value.trim() ? addTyped(input.value) : openHabitual()), { persistent: true });
  const addForm = h('form', { class: 'addbar__row', novalidate: true },
    h('label', { class: 'addbar__field' }, input),
    scanner.button,
    h('button', {
      class: 'btn btn--primary btn--icon',
      type: 'submit',
      'aria-label': t('liste.ajouter'),
      onPointerdown: plus.pointerdown,
      onMousedown: plus.mousedown,
      onPointerup: plus.pointerup,
      onPointercancel: plus.pointercancel,
      onClick: plus.click,
    }, icon('plus', pc ? 'icon--sm' : ''), pc ? t('liste.ajouter') : null));
  // Ordinateur : bouton écrit « Ajouter » (plus de libellé caché)
  if (pc) {
    const submit = addForm.querySelector('[type=submit]');
    submit.classList.remove('btn--icon');
    submit.removeAttribute('aria-label');
  }
  // Ordinateur : champ d'ajout en haut de la liste (sous les outils)
  const addbar = h('div', { class: pc ? 'pc-add' : 'addbar' }, suggestBox, addForm, scanner.inputs);
  // Téléphone : la loupe ronde, en bas à droite : elle flotte au-dessus de
  // la barre d'ajout (décision du 11 novembre 2026), ou seule en bas en
  // lecture seule (pas de barre)
  const loupeDock = pc ? null : h('div', { class: 'list-dock' }, loupe.el);

  // Touche Entrée : le navigateur « clique » le bouton « + » (ajout ci-dessus,
  // envoi du formulaire annulé) ; ceci n'est qu'un secours, sans doublon
  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addTyped(input.value);
  });
  // Téléphone : pendant qu'on écrit dans le champ d'ajout, la loupe (qui
  // flotte au-dessus de la barre) se cache : les suggestions prennent sa
  // place ; elle revient quand le champ n'a plus le curseur
  const setTyping = (typing) => {
    if (pc) return;
    loupeDock.hidden = typing;
  };
  input.addEventListener('input', drawSuggestions);
  input.addEventListener('focus', () => {
    setTyping(true);
    drawSuggestions();
  });
  // Champ quitté : la liste se ferme, mais jamais pendant qu'un doigt est
  // posé dessus (elle se fermera au relâchement si le champ n'a plus le curseur)
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== input) setTyping(false);
    if (document.activeElement !== input && !taps.pressing && !habitualOpen) suggestBox.hidden = true;
  }, 150));

  // --- Toucher d'une suggestion (tap.js) ---
  // Une suggestion est choisie au relâchement du doigt (le click reste en
  // secours, sans double ajout) ; pendant le toucher, la liste n'est ni
  // redessinée ni fermée.
  let redrawLater = false; // un redessin demandé pendant le toucher
  // Relâchement sans choix (doigt glissé ailleurs, défilement) : redessin en
  // attente, puis fermeture si le champ n'a plus le curseur
  const releaseSuggestions = () => {
    if (!taps.release()) return;
    if (redrawLater) {
      redrawLater = false;
      drawSuggestions();
    }
    if (document.activeElement !== input && !habitualOpen) suggestBox.hidden = true;
  };
  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, releaseSuggestions); // après le bouton lui-même
    onLeave(() => document.removeEventListener(type, releaseSuggestions));
  }
  const ghostClick = (event) => taps.ghostClick(event);
  document.addEventListener('click', ghostClick, true);
  onLeave(() => document.removeEventListener('click', ghostClick, true));

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeHabitual() || (suggestBox.hidden = true);
  });

  // --- « Souvent ajoutés » (décisions du 11 novembre 2026) ---
  // Liste de courses, champ d'ajout vide : en touchant le champ (clavier
  // ouvert) ou « + » (sans clavier), l'encart des suggestions montre les
  // articles les plus ajoutés dans ce magasin (store.js, computeHabitual :
  // 6 au plus, ajoutés ces deux derniers mois, sans ceux déjà à acheter).
  // Un appui ajoute l'article (ou remet dans la liste celui qui est dans le
  // panier) ; l'encart reste ouvert pour en ajouter d'autres. Il se ferme
  // par sa croix, en touchant ailleurs, ou dès qu'on tape (les suggestions
  // habituelles reprennent la place).
  let habitualOpen = false; // ouvert par « + », sans curseur dans le champ
  // Glissement des lignes de l'encart (téléphone)
  const habitualSwipes = pc ? null : createSwipeController(suggestBox);
  if (habitualSwipes) onLeave(() => habitualSwipes.stop());
  function openHabitual() {
    if (!editable() || !remembersNames(view?.list)) return;
    if (!computeHabitual(app.data, view.list).length) return; // rien à proposer : « + » ne fait rien
    habitualOpen = true;
    setTyping(true); // la loupe flottante laisse la place
    drawSuggestions();
  }
  // Ferme l'encart (et le clavier) ; vrai s'il était affiché
  function closeHabitual() {
    const shown = !suggestBox.hidden && suggestBox.dataset.mode === 'habitual';
    habitualOpen = false;
    if (!shown) return false;
    suggestBox.hidden = true;
    if (document.activeElement === input) releaseFocus();
    setTyping(false);
    return true;
  }
  // Toucher ailleurs (la liste, la barre du haut) : l'encart ouvert par « + » se ferme
  const outside = (event) => {
    if (habitualOpen && !addbar.contains(event.target)) closeHabitual();
  };
  document.addEventListener('pointerdown', outside, true);
  onLeave(() => document.removeEventListener('pointerdown', outside, true));

  // Appui sur un article de l'encart : ajouté (ou remis dans la liste s'il
  // est dans le panier), sans quitter l'encart ni ouvrir de fiche
  async function pickHabitual(name) {
    if (!editable() || !view) return;
    const inCart = checkedNamed(app.data, listId, name);
    if (inCart) {
      await actions.checkItem(inCart, false); // copie locale d'abord (hors ligne compris)
      toast(t('liste.souvent.remis', { name: inCart.name }), { low: true });
    } else {
      const item = await addNamed(name);
      if (!item) return;
      toast(t('liste.souvent.ajoute', { name: item.name }), { low: true });
    }
    drawSuggestions();
  }

  // Une ligne de l'encart : l'article (un appui l'ajoute) ; « Retirer »
  // (pour toute la famille, dans ce magasin) : derrière la ligne, révélé en
  // la faisant glisser vers la gauche (téléphone, swipe.js, comme pour
  // supprimer un article), ou bouton au bout de la ligne (ordinateur, au
  // survol et au clavier). Un glissement n'ajoute jamais l'article.
  function habitualRow(entry) {
    let blocked = false; // appui qui a glissé, ou sur une ligne ouverte : pas d'ajout
    let startX = null;
    const on = taps.button(() => {
      redrawLater = false;
      if (blocked || row.classList.contains('is-open') || row.classList.contains('is-swiping')) return;
      pickHabitual(entry.name);
    }, { persistent: true });
    const add = h('button', {
      class: `suggest__item${pc ? '' : ' swipe__slide'}`,
      type: 'button',
      onPointerdown: (event) => {
        blocked = row.classList.contains('is-open');
        startX = event.clientX;
        on.pointerdown(event);
      },
      onPointermove: (event) => {
        if (startX !== null && Math.abs(event.clientX - startX) > SWIPE.slop) blocked = true;
      },
      onMousedown: on.mousedown,
      onPointerup: on.pointerup,
      onPointercancel: on.pointercancel,
      onClick: on.click,
    }, h('span', {}, entry.name), entry.hint ? h('span', { class: 'suggest__aisle' }, entry.hint) : null);
    const label = t('liste.souvent.retirer.nom', { name: entry.name });
    const remove = h('button', {
      class: pc ? 'icon-btn' : 'swipe__delete',
      type: 'button',
      'aria-label': label,
      ...(pc ? { 'data-pc-tip': t('liste.retirer') } : {}),
      // Le champ garde le curseur (clavier ouvert) pendant l'appui
      onPointerdown: keepFieldFocus.pointerdown,
      onMousedown: keepFieldFocus.mousedown,
      onClick: () => removeHabitual(entry.name),
    }, icon('eye-off', pc ? 'icon--sm' : ''), pc ? null : h('span', {}, t('liste.retirer')));
    const row = pc
      ? h('div', { class: 'suggest__row' }, add, h('span', { class: 'suggest__actions' }, remove))
      : h('div', { class: 'suggest__row swipe' }, add, remove);
    if (!pc) habitualSwipes.attach(row, add, remove);
    return row;
  }

  // « Retirer » : l'article n'est plus proposé dans ce magasin, pour toute
  // la famille (copie locale tout de suite, puis le serveur), jusqu'à ce
  // qu'il soit de nouveau ajouté
  async function removeHabitual(name) {
    if (!editable() || !view) return;
    habitualSwipes?.close();
    await actions.hideHabitual(view.list, name);
    toast(t('liste.souvent.retire', { name }), { low: true });
    drawSuggestions();
  }

  function drawHabitual() {
    // Téléphone, clavier ouvert (curseur dans le champ) : 4 articles ; sinon 6
    const keyboard = !pc && document.activeElement === input;
    const entries = computeHabitual(app.data, view?.list, keyboard ? { limit: HABITUAL_LIMIT_KEYBOARD } : {});
    if (!entries.length) {
      suggestBox.hidden = true;
      habitualOpen = false;
      return;
    }
    const close = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('liste.fermer'), onClick: () => closeHabitual() }, icon('close'));
    replace(suggestBox,
      h('div', { class: 'suggest__head' }, h('span', { class: 'suggest__title' }, t('liste.souvent.titre')), close),
      entries.map(habitualRow));
    // Un groupe de boutons (pas une liste de choix : il a sa croix)
    suggestBox.dataset.mode = 'habitual';
    suggestBox.setAttribute('role', 'group');
    suggestBox.setAttribute('aria-label', t('liste.souvent.titre'));
    suggestBox.hidden = false;
  }
  // Collage d'une liste sur plusieurs lignes (courses et tâches) : le champ
  // n'a qu'une ligne et effacerait les retours à la ligne ; ils deviennent
  // des points-virgules, qui séparent les éléments. La touche Entrée, elle,
  // valide toujours.
  input.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text') ?? '';
    if (isWishList(view?.list) || !/[\r\n]/.test(text)) return;
    event.preventDefault();
    input.setRangeText(joinPastedLines(text), input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Suggestions : les plus fréquentes d'abord, début tapé en gras. Listes de
  // courses seulement : dans une liste de tâches, pas de menu (Entrée ou +
  // ajoutent ce qui a été tapé).
  function drawSuggestions() {
    if (taps.pressing) { // jamais sous le doigt : après le relâchement
      redrawLater = true;
      return;
    }
    // Plusieurs éléments tapés d'un coup : pas de suggestions (+ ou Entrée les ajoutent tous)
    if (!remembersNames(view?.list) || splitItems(input.value).length > 1) {
      suggestBox.hidden = true;
      return;
    }
    // Champ vide : « Souvent ajoutés » (champ touché, ou « + ») ; on tape :
    // les suggestions habituelles
    if (!input.value.trim()) {
      if (document.activeElement === input || habitualOpen) drawHabitual();
      else suggestBox.hidden = true;
      return;
    }
    habitualOpen = false;
    suggestBox.dataset.mode = 'suggest';
    suggestBox.setAttribute('role', 'group');
    suggestBox.setAttribute('aria-label', t('liste.suggestions'));
    const typed = input.value;
    // Liste de courses : la quantité tapée au début ou à la fin (« 6 oeu »,
    // « oeufs x6 ») est lue d'abord ; les suggestions cherchent le nom seul
    // (quantityFor, quantity.js ; jamais de lecture hors listes de courses)
    const read = quantityFor(view?.list, typed);
    const suggestions = read.name.length >= 2 ? computeSuggestions(app.data, read.name) : [];
    if (!suggestions.length && read.name.length < 2) {
      suggestBox.hidden = true;
      return;
    }
    const exact = suggestions.some((s) => normalizeItemName(s.name) === normalizeItemName(read.name));
    const option = (content, aisle, onPick, extraClass = '') => {
      const on = taps.button(() => {
        redrawLater = false;
        onPick();
      });
      return h('button', {
        class: `suggest__item ${extraClass}`.trim(),
        type: 'button',
        // Garde le clavier ouvert : le champ ne perd pas le focus
        onPointerdown: on.pointerdown,
        onMousedown: on.mousedown,
        onPointerup: on.pointerup,
        onPointercancel: on.pointercancel,
        onClick: on.click,
      }, content, aisle ? h('span', { class: 'suggest__aisle' }, aisle) : null);
    };

    // À droite de la suggestion : rayon habituel, ou magasin habituel (« multi »)
    const hintFor = (s) => {
      if (view?.multi) return storeName(usualStoreFor(app.data, view.list, s.name));
      return isShoppingList(view?.list) ? s.aisleName : null;
    };
    replace(suggestBox,
      suggestions.map((s) => {
        const [start, rest] = splitPrefix(s.name, read.name);
        // Suggestion choisie : son nom tel quel, avec la quantité tapée s'il y en a une
        return option(h('span', {}, h('strong', {}, start), rest), hintFor(s), () => addTyped(s.name, { whole: true, quantity: read.quantity }));
      }),
      exact ? null : option([icon('plus'), h('span', {}, t('liste.ajout.nouveau', { text: typed.trim() }))], itemWords(view?.list).New, () => addTyped(typed), 'suggest__item--new'));
    suggestBox.hidden = false;
  }

  // Ajoute ce qui a été tapé (ou la suggestion choisie : whole, jamais découpée).
  // Courses et tâches : un texte avec des virgules, des points-virgules ou
  // des retours à la ligne donne plusieurs éléments (addSeveral) ; un seul
  // morceau : l'ajout habituel. Liste d'envies : toujours l'ajout habituel.
  // Courses seulement : la quantité écrite avec le nom (« 6 oeufs », « 2 kg
  // de pommes », « oeufs x6 ») est lue dans chaque morceau (quantityFor,
  // quantity.js), avant de chercher le rayon ou le magasin habituel du nom
  // seul ; une tâche garde tout son texte comme nom (« 3 appels à passer »).
  async function addTyped(text, { whole = false, quantity = '' } = {}) {
    if (!view) return;
    let name = text.replace(/\s+/g, ' ').trim();
    if (!whole && !isWishList(view.list)) {
      const plan = planBulkAdd(text);
      if (plan.error) {
        toast(plan.error); // annoncé (role="status") ; le texte reste dans le champ
        return;
      }
      const entries = plan.names.map((piece) => quantityFor(view.list, piece));
      if (entries.length > 1) {
        await addSeveral(entries);
        return;
      }
      ({ name, quantity } = entries[0] ?? { name: '', quantity: '' });
    }
    if (!name) return;
    suggestBox.hidden = true;
    // Le champ est vidé juste avant l'ajout (pas si la fenêtre de choix du
    // rayon ou du magasin est fermée sans choisir)
    const item = await addNamed(name, quantity ? { quantity } : {}, () => {
      input.value = '';
    });
    // Toutes les listes : l'ajout se termine (plus de curseur dans le champ,
    // clavier replié) et l'article ou l'élément ajouté est montré dans la
    // liste (groupe replié déplié, défilement, brève mise en évidence). Le
    // champ ne reprend jamais le curseur tout seul.
    if (!item) return;
    suggestBox.hidden = true;
    releaseFocus();
    revealItem(item.id);
    // « Après l'ajout » = « Ouvrir la fiche » : la fiche de l'élément créé
    // s'ouvre (la même qu'en touchant sa ligne), une fois le clavier replié ;
    // aucun champ n'y prend le curseur. Le fermer ramène à la liste ;
    // l'élément y reste, qu'on ait changé quelque chose ou non.
    if (addModeOf(currentList()) === 'detail') {
      whenKeyboardClosed(() => {
        const created = app.data.items.get(item.id);
        if (created && view && !created.deletedAt) openItemSheet(created);
      });
    }
  }

  // Plusieurs éléments d'un coup (2 à 20, déjà vérifiés par planBulkAdd).
  // Tout ou rien : le rayon (ou le magasin) de chaque nouvel article est
  // demandé d'abord, l'un après l'autre (« 2 sur 3 ») ; fermer une de ces
  // fenêtres sans choisir n'ajoute rien et laisse le texte dans le champ.
  // Puis chaque élément est ajouté comme à la main (une opération par
  // élément dans la file d'attente, avec son propre identifiant : hors ligne
  // compris, un renvoi ne crée jamais de doublon). On reste toujours sur la
  // liste (jamais de fiche ouverte), et une phrase annonce le nombre ajouté.
  // entries : [{ name, quantity }] (quantité lue dans chaque morceau, ou « »)
  async function addSeveral(entries) {
    if (!editable()) return;
    suggestBox.hidden = true;
    const places = [];
    const chosen = new Map(); // même nom deux fois : une seule question
    for (const [index, { name }] of entries.entries()) {
      const key = normalizeItemName(name);
      if (!chosen.has(key)) {
        const place = await placeFor(name, t('liste.ajout.etape', { index: index + 1, total: entries.length }));
        if (place === undefined) return; // fenêtre fermée sans choisir : rien n'est ajouté
        chosen.set(key, place);
      }
      places.push(chosen.get(key));
    }
    if (!editable() || !view) return; // passée en lecture seule entre-temps
    const list = view.list;
    input.value = '';
    let last = null;
    for (const [index, { name, quantity }] of entries.entries()) {
      last = (await createItem(name, { ...places[index], ...(quantity ? { quantity } : {}) })) || last;
    }
    releaseFocus();
    if (last) revealItem(last.id);
    toast(t('liste.ajout.plusieurs', { items: countItems(entries.length, list) }));
  }

  // Clavier en train de se replier (le champ vient de perdre le curseur) :
  // la fiche s'ouvre une fois la zone visible revenue à toute la hauteur de
  // la fenêtre (mesure du navigateur, aucune marque ni modèle), pour qu'elle
  // ne s'affiche pas d'abord au-dessus du clavier puis ne saute vers le bas.
  // Clavier déjà fermé (ordinateur, navigateur qui rétrécit la page) : tout
  // de suite. 700 ms au plus ; puis deux images, le temps qu'app-height.js
  // ait remesuré l'application.
  function whenKeyboardClosed(then) {
    const viewport = window.visualViewport;
    const closed = () => !viewport || viewport.height >= window.innerHeight - 1;
    if (closed()) {
      then();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      viewport.removeEventListener('resize', onResize);
      clearTimeout(timer);
      requestAnimationFrame(() => requestAnimationFrame(then));
    };
    const onResize = () => {
      if (closed()) finish();
    };
    viewport.addEventListener('resize', onResize);
    const timer = setTimeout(finish, 700);
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
    // Sous-tâche repliée : sa principale se déplie (son bouton « 3/10 »)
    const wrap = row.closest('li.subtasks');
    if (wrap?.hidden) wrap.previousElementSibling?.querySelector('.subtasks__toggle')?.click();
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

  // Où ranger un article qu'on ajoute : {} (le téléphone et le serveur
  // reprennent le rayon ou le magasin habituel), { aisleId } ou { storeId }
  // choisi dans la fenêtre « Dans quel rayon ? » / « Dans quel magasin ? »
  // pour un article jamais vu, ou undefined si cette fenêtre a été fermée
  // sans choisir. step : « 2 sur 3 » quand plusieurs articles sont ajoutés.
  async function placeFor(name, step = '') {
    if (!view) return undefined;
    const suffix = step ? ` (${step})` : '';
    if (view.multi) {
      // Liste « multi » : magasin habituel, sinon on le demande une fois
      if (usualStoreFor(app.data, view.list, name) !== null) return {}; // le serveur le choisira (le téléphone l'affiche déjà)
      const sub = isKnownItem(app.data, name)
        ? t('liste.place.magasin.connu', { name })
        : t('liste.place.magasin.nouveau', { name });
      const storeId = await pickStore({ title: `${t('liste.place.magasin.titre')}${suffix}`, sub, confirmLabel: t('liste.place.ajouter') });
      return storeId === undefined ? undefined : { storeId };
    }
    if (isShoppingList(view.list) && !isKnownItem(app.data, name)) {
      // Article inconnu sur une liste de courses : on demande son rayon une fois
      const aisleId = await pickAisle({ title: `${t('liste.place.rayon.titre')}${suffix}`, sub: t('liste.place.rayon.nouveau', { name }), confirmLabel: t('liste.place.ajouter') });
      return aisleId === undefined ? undefined : { aisleId };
    }
    return {};
  }

  // Ajoute un article (champ d'ajout ou mode scan). extra : autres champs
  // (note, code-barres…). Renvoie l'article ajouté, ou false si la fenêtre de
  // choix du rayon ou du magasin a été fermée sans choisir.
  async function addNamed(name, extra = {}, beforeCreate = () => {}) {
    if (!view) return false;
    const place = await placeFor(name);
    if (place === undefined) return false; // fenêtre fermée sans choisir
    beforeCreate();
    return createItem(name, { ...extra, ...place });
  }

  // Ajout : tout de suite dans la copie locale, puis envoyé (file d'attente)
  // Renvoie l'article ajouté
  async function createItem(name, fields = {}) {
    if (!editable()) return false; // passée en lecture seule entre-temps
    return actions.addItem({ listId, name, ...fields });
  }

  // --- Réservation d'un souhait (listes d'envies), avec cotisation ---
  // Le bloc n'existe que si le serveur a envoyé les réservations de cette
  // liste : jamais pour le bénéficiaire (rien du tout, pas même un bloc vide).
  // Selon l'état du souhait :
  // - libre : interrupteur « Ouvert à d'autres » (désactivé au départ) et
  //   « Réserver » ;
  // - réservé : les participants, « Ouvert à d'autres » le cas échéant ;
  //   « Participer » (ouvert, je n'y suis pas), « Quitter » et
  //   l'interrupteur (j'y suis) ; gestionnaire : « Retirer » chaque
  //   participant et « Libérer » tout le souhait ;
  // - reçu : plus rien (les réservations ne sont plus affichées).
  // En ligne seulement : hors ligne, tout est inactif, avec une explication.
  // Renvoie { el, paint, dispose } ou null.
  function reservationBlock(item) {
    if (!view?.reservations) return null;
    const el = h('div', { class: 'field' });
    let busy = false;
    let openWanted = false; // « Ouvert à d'autres » pour une nouvelle réservation
    const run = async (action, done) => {
      busy = true;
      paint();
      try {
        await action();
        if (done) toast(done, { low: true });
      } catch (err) {
        toast(errorMessage(err), { low: true });
        refreshData({ quiet: true }); // état à jour (« Déjà réservé. »)
      }
      busy = false;
      paint();
    };
    const button = (cls, iconName, label, onClick, extra = {}) => h('button', {
      class: `btn ${cls}`, type: 'button', disabled: busy || !navigator.onLine, onClick, ...extra,
    }, icon(iconName, 'icon--sm'), label);
    const openSwitch = (checked, onToggle) => h('div', { class: 'card' }, h('div', { class: 'toggle-row' },
      h('div', { class: 'grow' },
        h('span', { class: 'row__title', id: `open-${item.id}` }, t('liste.envies.ouvert')),
        h('span', { class: 'row__sub' }, t('liste.envies.ouvert.detail'))),
      h('button', {
        class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(checked), 'aria-labelledby': `open-${item.id}`,
        disabled: busy || !navigator.onLine, onClick: onToggle,
      })));
    function paint() {
      const reservations = view?.reservations;
      const latest = app.data.items.get(item.id) ?? item;
      el.hidden = !reservations || latest.checked;
      if (el.hidden) return;
      const current = reservations.get(item.id);
      const participants = current?.participants ?? [];
      const mine = participants.some((p) => p.userId === app.user.id);
      const manager = Boolean(view.list.isOwner);
      const list = view.list;
      const hidden = list.forName ? null : list.forDisplayName ?? list.members?.find((m) => m.isOwner)?.displayName;
      let content;
      if (!participants.length) {
        content = [
          h('p', { class: 'field__value' }, t('liste.envies.pasReserve')),
          openSwitch(openWanted, () => {
            openWanted = !openWanted;
            paint();
          }),
          button('btn--primary btn--block', 'gift', t('liste.envies.reserver'), () => run(() => actions.reserveWish(item.id, openWanted), t('liste.envies.reserve'))),
        ];
      } else {
        content = [
          h('p', { class: 'field__value' }, reservationText(current), current.open ? ` · ${t('liste.envies.ouvert')}` : ''),
          // Ouvrir ou fermer : les participants, et le gestionnaire (même s'il n'y a que des visiteurs)
          mine || manager ? openSwitch(current.open, () => run(() => actions.setWishOpen(item.id, !current.open))) : null,
          !mine && current.open ? button('btn--primary btn--block', 'plus', t('liste.envies.participer'), () => run(() => actions.reserveWish(item.id), t('liste.envies.participez'))) : null,
          mine ? button('btn--secondary btn--block', 'close', t('liste.envies.quitter'), () => run(() => actions.leaveWish(item.id), t('liste.envies.neParticipezPlus'))) : null,
          // Gestionnaire : retirer un participant, ou libérer tout le souhait
          manager ? h('div', { class: 'stack stack--sm' },
            participants.some((p) => p.userId !== app.user.id) ? h('div', { class: 'card list-options' }, participants.filter((p) => p.userId !== app.user.id).map((p) => h('div', { class: 'toggle-row' },
              h('span', { class: 'grow' }, participantLabel(p)),
              // Un visiteur du lien public : retiré par son identifiant opaque (v<numéro>)
              button('btn--danger-outline btn--sm', 'close', t('liste.retirer'), () => run(() => (p.viaLink ? actions.removeWishVisitor(item.id, p.visitorId) : actions.removeWishParticipant(item.id, p.userId)), t('liste.envies.neParticipePlus', { name: p.displayName })), { 'aria-label': t('liste.envies.retirer.nom', { name: participantLabel(p) }) })))) : null,
            button('btn--danger-outline btn--block', 'close', t('liste.envies.liberer'), () => run(() => actions.releaseWish(item.id), t('liste.envies.liberee')))) : null,
        ];
      }
      replace(el,
        h('span', { class: 'field__label' }, t('liste.envies.reservation')),
        content,
        !navigator.onLine ? h('p', { class: 'field__hint' }, t('liste.envies.horsLigne')) : null,
        hidden ? h('p', { class: 'field__hint' }, t('liste.envies.jamaisMontrees', { name: hidden })) : null);
    }
    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    paint();
    return {
      el,
      paint,
      dispose: () => {
        window.removeEventListener('online', paint);
        window.removeEventListener('offline', paint);
      },
    };
  }

  // Lien d'un souhait : « Ouvrir le lien », dans un nouvel onglet, sans
  // transmettre d'où l'on vient ; seulement une adresse http ou https
  const linkButton = (link) => {
    const safe = cleanLink(link ?? '');
    return safe ? h('a', { class: 'btn btn--secondary btn--sm', href: safe, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 'icon--sm'), t('liste.envies.ouvrirLien')) : null;
  };

  // --- Feuille « Article » : nom, quantité, note, rayon (ou magasin) ---

  function openItemSheet(item) {
    swipes.close(); // une ligne ouverte se referme
    if (!editable()) return openItemView(item); // passée en lecture seule entre-temps
    const multi = Boolean(view?.multi);
    const isShopping = isShoppingList(view?.list) && !multi; // rayon seulement hors « multi »
    const words = itemWords(view?.list); // « article », « élément » ou « souhait »
    const kind = wordKind(view?.list); // phrases entières de cette sorte de liste (byKind)
    const wishes = isWishList(view?.list);
    const name = h('input', { class: 'input', ...LABEL_INPUT, value: item.name, maxlength: '100' });
    // Souhait : lien web (http ou https) et prix indicatif, facultatifs
    const linkInput = h('input', { class: 'input', type: 'url', inputmode: 'url', value: item.link ?? '', maxlength: String(LINK_MAX), autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'https://…' });
    const linkField = field(t('liste.fiche.lien'), linkInput);
    const priceInput = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: priceInputText(item.priceCents), maxlength: '12', autocomplete: 'off', placeholder: t('liste.fiche.prix.exemple') });
    const priceField = field(t('liste.fiche.prix'), priceInput, { aside: t('liste.fiche.prix.unite', { currency: currencyName() }) });
    const reservation = wishes ? reservationBlock(item) : null;
    const quantity = h('input', { class: 'input', type: 'text', value: item.quantity, maxlength: '30', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off' });
    const note = h('textarea', { class: 'input input--area', rows: '2', maxlength: '500', autocomplete: 'off', autocapitalize: 'sentences' });
    note.value = item.note;
    let aisleId = item.aisleId;
    const aisleLabel = h('span');
    const showAisle = () => {
      aisleLabel.textContent = app.data.aisles.find((a) => a.id === aisleId)?.name ?? t('liste.sansRayon');
    };
    showAisle();
    const aisleButton = h('button', {
      class: 'input input--select',
      type: 'button',
      onClick: async () => {
        const chosen = await pickAisle({ title: t('liste.rayon'), current: aisleId, keep: aisleId, confirmLabel: t('liste.choisir') });
        if (chosen !== undefined) {
          aisleId = chosen;
          showAisle();
        }
      },
    }, aisleLabel, icon('chev-d'));
    // Magasin de l'article (liste « multi »)
    let storeId = item.storeId ?? null;
    const storeLabel = h('span', { class: 'input__value' });
    const showStore = () => replace(storeLabel, icon('store', 'icon--sm'), storeName(storeId) ?? t('liste.sansMagasin'));
    showStore();
    const storeButton = h('button', {
      class: 'input input--select',
      type: 'button',
      'aria-labelledby': 'store-label',
      onClick: async () => {
        const chosen = await pickStore({ title: t('liste.magasin'), current: storeId, keep: storeId, confirmLabel: t('liste.choisir') });
        if (chosen !== undefined) {
          storeId = chosen;
          showStore();
        }
      },
    }, storeLabel, icon('chev-d'));

    // Libellé « Article » / « Élément », jamais « Nom » (voir LABEL_INPUT)
    const nameField = field(capitalized(words.one), name);
    const error = errorNote();

    // --- Priorité et échéance (listes autres que les courses, chacune si
    // elle est activée pour la liste). Les deux champs existent toujours dans
    // une telle liste ; un réglage désactivé, même pendant que la fiche est
    // ouverte, les cache, et ils ne sont alors jamais envoyés.
    const classic = !isShoppingList(view?.list);
    const options = () => listOptions(app.data.lists.get(listId));
    let priority = item.priority ?? 'normal';
    let dueDate = item.dueDate ?? null;
    // Échéance enregistrée (base de comparaison à l'enregistrement ; avancée
    // par « Passer cette fois », qui s'enregistre tout de suite)
    let savedDue = item.dueDate ?? null;
    // Priorité : trois choix ; le choix actif a une coche ET son texte
    const priorityOptions = [['low', t('liste.fiche.priorite.basse')], ['normal', t('liste.fiche.priorite.normale')], ['high', t('liste.fiche.priorite.elevee')]].map(([value, label]) => {
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
    } }, t('liste.effacer'));
    let redrawAssign = null; // « Pour » (plus bas) : « Chacun son tour » suit la répétition
    let redrawSummaries = null; // lignes résumées des sous-pages (plus bas)
    const drawDue = () => {
      const label = dueDate ? dueDateLabel(dueDate) : t('liste.fiche.aucuneEcheance');
      replace(dueText, icon('calendar', 'icon--sm'), label);
      dateInput.value = dueDate ?? '';
      dateInput.setAttribute('aria-label', t('liste.fiche.echeance.choisir', { label }));
      clearDue.disabled = !dueDate;
      // Plus d'échéance : plus de répétition (une répétition en demande une)
      if (!dueDate && repeatKind) {
        repeatKind = '';
        repeat = null;
      }
      drawRepeat();
      drawTime();
      redrawAssign?.();
    };
    const shortcut = (label, days) => h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
      dueDate = addDays(todayKey(), days);
      drawDue();
    } }, label);

    // --- Se répète (décisions du 11 novembre 2026, repeat.js) : seulement
    // avec l'option « Échéance ». Jamais, chaque jour, chaque semaine ou
    // toutes les 2 semaines (jours choisis, au moins un), chaque mois (le
    // jour choisi), chaque année. Choisir une répétition pose l'échéance si
    // elle manque ou si elle ne tombe pas sur la règle ; effacer l'échéance
    // arrête la répétition. Une phrase résume la règle.
    let repeat = item.repeat ?? null;
    const parsedRepeat = parseRepeat(repeat);
    let repeatKind = parsedRepeat?.kind ?? '';
    let repeatDays = parsedRepeat?.days ?? [];
    let monthDay = parsedRepeat?.monthDay ?? null;
    // Chaque mois : un jour précis (« le 5 ») ou un jour de la semaine (« le
    // 1er lundi », « le dernier vendredi » ; complément du 11 novembre 2026)
    let monthMode = parsedRepeat?.nth ? 'week' : 'day';
    let monthNth = parsedRepeat?.nth ?? null;
    let monthWeekday = parsedRepeat?.weekday ?? null;
    const savedRepeat = item.repeat ?? null;
    // Choix « Se répète » et jour du mois : la liste de choix du téléphone,
    // posée, invisible, sur un champ qui affiche le choix (comme l'échéance)
    const nativePicker = (select) => {
      const text = h('span', { class: 'input__value' });
      return { text, el: h('div', { class: 'due-picker' }, h('span', { class: 'input input--select', 'aria-hidden': 'true' }, text, icon('chev-d')), select) };
    };
    const kindSelect = h('select', { class: 'due-picker__input' }, REPEAT_CHOICES.map(([value, label]) => h('option', { value }, t(label))));
    const kindPicker = nativePicker(kindSelect);
    kindSelect.addEventListener('change', () => {
      repeatKind = kindSelect.value;
      applyRepeat();
    });
    // Jours de la semaine : pastilles Lu … Di, appuyées ou non
    const dayButtons = WEEKDAYS.map(([day, short, long]) => {
      const button = h('button', { class: 'weekdays__opt', type: 'button', 'aria-label': t(long), onClick: () => {
        const on = repeatDays.includes(day);
        if (on && repeatDays.length === 1) return; // au moins un jour
        repeatDays = on ? repeatDays.filter((d) => d !== day) : [...repeatDays, day];
        applyRepeat();
      } }, t(short));
      button.dataset.day = String(day);
      return button;
    });
    const daysRow = h('div', { class: 'weekdays', role: 'group', 'aria-label': t('liste.fiche.repete.jours') }, dayButtons);
    const monthSelect = h('select', { class: 'due-picker__input' },
      Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1) }, t('liste.fiche.repete.leJour', { count: i + 1 }))));
    const monthPicker = nativePicker(monthSelect);
    monthSelect.addEventListener('change', () => {
      monthDay = Number(monthSelect.value);
      applyRepeat();
    });
    const modeSelect = h('select', { class: 'due-picker__input' },
      h('option', { value: 'day' }, t('liste.fiche.repete.mode.jourMois.choix')),
      h('option', { value: 'week' }, t('liste.fiche.repete.mode.jourSemaine.choix')));
    const modePicker = nativePicker(modeSelect);
    modeSelect.addEventListener('change', () => {
      monthMode = modeSelect.value;
      applyRepeat();
    });
    const nthSelect = h('select', { class: 'due-picker__input' }, MONTH_WEEKS.map(([n, label]) => h('option', { value: String(n) }, t('liste.fiche.repete.leRang', { rank: t(label) }))));
    const nthPicker = nativePicker(nthSelect);
    nthSelect.addEventListener('change', () => {
      monthNth = Number(nthSelect.value);
      applyRepeat();
    });
    const weekdaySelect = h('select', { class: 'due-picker__input' }, WEEKDAYS.map(([day, , long]) => h('option', { value: String(day) }, t(long))));
    const weekdayPicker = nativePicker(weekdaySelect);
    weekdaySelect.addEventListener('change', () => {
      monthWeekday = Number(weekdaySelect.value);
      applyRepeat();
    });
    const monthWeekRow = h('div', { class: 'time-row' }, nthPicker.el, weekdayPicker.el);
    const repeatNote = h('p', { class: 'field__hint' });
    // « Passer cette fois » : seulement sur la règle et la date ENREGISTRÉES
    const skipButton = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => skipOnce() }, t('liste.fiche.passer'));
    const skipRow = h('div', { class: 'due-shortcuts' }, skipButton);
    // Règle choisie -> repeat ; date posée si besoin
    const applyRepeat = () => {
      const base = dueDate ?? todayKey();
      if ((repeatKind === 'week' || repeatKind === '2week') && !repeatDays.length) repeatDays = [weekdayOf(base)];
      if (repeatKind === 'month' && !monthDay) monthDay = Number(base.slice(8));
      // « Le 1er lundi » : par défaut, le rang et le jour de l'échéance
      if (repeatKind === 'month' && monthMode === 'week') {
        if (!monthNth) monthNth = monthWeekOf(base);
        if (!monthWeekday) monthWeekday = weekdayOf(base);
      }
      const byWeek = repeatKind === 'month' && monthMode === 'week';
      repeat = repeatKind ? makeRepeat(repeatKind, { days: repeatDays, monthDay: monthDay ?? 1, ...(byWeek ? { nth: monthNth, weekday: monthWeekday } : {}) }) : null;
      if (repeat && (!dueDate || !isOccurrence(repeat, dueDate, dueDate))) {
        // Toutes les 2 semaines : la première date est le prochain jour
        // choisi (les semaines se comptent ensuite à partir d'elle)
        dueDate = firstOccurrence(repeatKind === '2week' ? repeat.replace('2week', 'week') : repeat, todayKey());
      }
      drawDue();
    };
    function drawRepeat() {
      kindSelect.value = repeatKind;
      const choice = REPEAT_CHOICES.find(([value]) => value === repeatKind);
      const label = choice ? t(choice[1]) : t('liste.fiche.jamais');
      replace(kindPicker.text, icon('repeat', 'icon--sm'), label);
      kindSelect.setAttribute('aria-label', t('liste.fiche.repete.changer', { label }));
      daysRow.hidden = repeatKind !== 'week' && repeatKind !== '2week';
      for (const button of dayButtons) button.setAttribute('aria-pressed', String(repeatDays.includes(Number(button.dataset.day))));
      modePicker.el.hidden = repeatKind !== 'month';
      modeSelect.value = monthMode;
      modePicker.text.textContent = monthMode === 'week' ? t('liste.fiche.repete.mode.jourSemaine') : t('liste.fiche.repete.mode.jourMois');
      modeSelect.setAttribute('aria-label', t('liste.fiche.repete.mode.changer', { label: modePicker.text.textContent }));
      monthWeekRow.hidden = repeatKind !== 'month' || monthMode !== 'week';
      nthSelect.value = String(monthNth ?? 1);
      nthPicker.text.textContent = t('liste.fiche.repete.leRang', { rank: t(MONTH_WEEKS.find(([n]) => n === (monthNth ?? 1))[1]) });
      nthSelect.setAttribute('aria-label', t('liste.fiche.repete.rang.changer', { label: nthPicker.text.textContent }));
      weekdaySelect.value = String(monthWeekday ?? 1);
      weekdayPicker.text.textContent = t(WEEKDAYS.find(([d]) => d === (monthWeekday ?? 1))[2]);
      weekdaySelect.setAttribute('aria-label', t('liste.fiche.repete.jourSemaine.changer', { label: weekdayPicker.text.textContent }));
      monthPicker.el.hidden = repeatKind !== 'month' || monthMode !== 'day';
      monthSelect.value = String(monthDay ?? 1);
      monthPicker.text.textContent = monthDay === 1 || !monthDay ? t('liste.fiche.repete.chaqueMois.premier') : t('liste.fiche.repete.chaqueMois', { count: monthDay });
      monthSelect.setAttribute('aria-label', t('liste.fiche.repete.jourMois.changer', { label: monthPicker.text.textContent }));
      repeatNote.textContent = repeat ? repeatSentence(repeat) : '';
      repeatNote.hidden = !repeat;
      const saved = app.data.items.get(item.id);
      skipRow.hidden = !(saved && !saved.checked && actions.repeatsNow(saved) && repeat === savedRepeat && repeat === saved.repeat && dueDate === savedDue);
    }
    // « Passer cette fois » : la date avance d'un cran (même règle, même
    // calcul que si la tâche était cochée), sans la cocher ; enregistré tout
    // de suite, avec « Annuler ». Les autres voient « Modifié par ».
    const moveSaved = (from, to) => {
      if (dueDate === from) dueDate = to;
      savedDue = to;
      drawDue();
      initialSnapshot = snapshot();
    };
    const skipOnce = async () => {
      const saved = app.data.items.get(item.id);
      const next = saved ? actions.nextDueOf(saved) : null;
      if (!next || !editable()) return;
      const before = { dueDate: saved.dueDate };
      const entry = { kind: 'update', itemId: item.id, name: saved.name, before, after: { dueDate: next } };
      recordUndo(listId, entry);
      mine = true;
      await actions.updateItem(saved, { dueDate: next });
      mine = false;
      seen = contentOf(app.data.items.get(item.id) ?? saved);
      moveSaved(before.dueDate, next);
      toast(t('liste.prochaineFois', { date: dueDateLabel(next) }), { action: pc ? t('liste.annuler.pc') : t('liste.annuler'), onAction: async () => {
        forgetUndo(listId, (e) => e === entry);
        const current = app.data.items.get(item.id);
        if (!current || current.dueDate !== next) return;
        mine = true;
        await actions.updateItem(current, before);
        mine = false;
        seen = contentOf(app.data.items.get(item.id) ?? current);
        moveSaved(next, before.dueDate);
      } });
    };
    // --- Heure et rappel (décisions du 11 novembre 2026, due-time.js) :
    // seulement avec une date (effacer la date efface l'heure ; effacer
    // l'heure efface le rappel). L'heure : le sélecteur d'heure du téléphone,
    // posé, invisible, sur un champ qui l'affiche ; « Effacer » à côté. Le
    // rappel : Aucun, À l'heure, 15 min, 30 min, 1 h, 2 h ou la veille.
    let dueTime = item.dueTime ?? null;
    const savedDueTime = item.dueTime ?? null;
    let remind = item.remindBefore ?? null;
    const savedRemind = item.remindBefore ?? null;
    const timeText = h('span', { class: 'input__value' });
    const timeInput = h('input', { class: 'due-picker__input', type: 'time', step: '60' });
    timeInput.addEventListener('click', () => {
      try {
        timeInput.showPicker?.();
      } catch {
        // sélecteur indisponible : le champ reste utilisable
      }
    });
    timeInput.addEventListener('change', () => {
      if (isDueTime(timeInput.value)) dueTime = timeInput.value;
      drawTime();
    });
    const clearTime = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
      dueTime = null;
      drawTime();
    } }, t('liste.effacer'));
    const timeRow = h('div', { class: 'time-row' },
      h('div', { class: 'due-picker' }, h('span', { class: 'input input--select', 'aria-hidden': 'true' }, timeText, icon('chev-d')), timeInput),
      clearTime);
    const remindSelect = h('select', { class: 'due-picker__input' }, REMINDERS.map(([minutes, label]) => h('option', { value: minutes === null ? '' : String(minutes) }, t(label))));
    const remindPicker = nativePicker(remindSelect);
    remindSelect.addEventListener('change', () => {
      remind = remindSelect.value === '' ? null : Number(remindSelect.value);
      drawTime();
    });
    const timeField = h('div', { class: 'field' }, h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('liste.fiche.heure')), timeRow);
    // Texte d'aide : à qui part le rappel (voir server/notify.js)
    const remindHint = h('p', { class: 'field__hint' });
    const remindField = h('div', { class: 'field' }, h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('liste.fiche.rappel')), remindPicker.el, remindHint);
    function drawTime() {
      if (!dueDate) dueTime = null;
      if (!dueTime) remind = null;
      const label = dueTime ? timeLabel(dueTime) : t('liste.fiche.aucuneHeure');
      replace(timeText, icon('clock', 'icon--sm'), label);
      timeInput.value = dueTime ?? '';
      timeInput.setAttribute('aria-label', t('liste.fiche.heure.choisir', { label }));
      clearTime.disabled = !dueTime;
      remindSelect.value = remind === null ? '' : String(remind);
      replace(remindPicker.text, icon('bell', 'icon--sm'), reminderLabel(remind));
      remindSelect.setAttribute('aria-label', t('liste.fiche.rappel.changer', { label: reminderLabel(remind) }));
      const withDue = options().due;
      remindHint.textContent = options().assign
        ? t('liste.fiche.rappel.aide.pour')
        : t('liste.fiche.rappel.aide');
      timeField.hidden = !withDue || !dueDate;
      // Pas de rappel proposé si les notifications sont coupées sur le serveur
      remindField.hidden = !withDue || !dueDate || !dueTime || !app.user?.push;
    }

    drawDue();
    const priorityField = h('div', { class: 'field' },
      h('span', { class: 'field__label', id: 'priority-label' }, t('liste.fiche.priorite')),
      h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'priority-label' }, priorityOptions));
    // Date (sous-page « Échéance ») : « Effacer » à droite du champ, comme
    // l'heure ; trois raccourcis de même largeur, sur une ligne
    const weekShortcut = shortcut(t('liste.fiche.date.semaine'), 7);
    weekShortcut.setAttribute('aria-label', t('liste.fiche.date.semaine.lecture'));
    const dueField = h('div', { class: 'field' },
      h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('liste.fiche.date')),
      h('div', { class: 'time-row' }, h('div', { class: 'due-picker' }, h('span', { class: 'input input--select', 'aria-hidden': 'true' }, dueText, icon('chev-d')), dateInput), clearDue),
      h('div', { class: 'due-shortcuts due-shortcuts--row' }, shortcut(t('liste.fiche.date.aujourdhui'), 0), shortcut(t('liste.fiche.date.demain'), 1), weekShortcut));
    // --- Pour (attribution, décisions du 11 novembre 2026) : seulement si
    // l'option « Attribution » de la liste est activée. « Personne », « Moi »
    // (si je peux modifier la liste), les autres personnes qui peuvent la
    // modifier, puis « Plusieurs personnes… » et, pour une tâche qui se
    // répète, « Chacun son tour… » (assign.js) : les prénoms en pastilles, à
    // toucher (chacun son tour : dans l'ordre du tour). Le serveur revérifie.
    let assignee = item.assignedTo ?? null;
    let assignMode = modeOf(item);
    let assignPeople = [...peopleOf(item)];
    const savedAssign = JSON.stringify([item.assignedTo ?? null, modeOf(item), peopleOf(item)]);
    const assignSelect = h('select', { class: 'due-picker__input' });
    const assignPicker = nativePicker(assignSelect);
    assignSelect.addEventListener('change', () => {
      const value = assignSelect.value;
      if (value === 'all' || value === 'turn') {
        // Personnes déjà choisies gardées ; sinon, la personne actuelle d'abord
        if (assignMode === 'one') assignPeople = assignee !== null ? [assignee] : [];
        assignMode = value;
      } else {
        assignMode = 'one';
        assignPeople = [];
        assignee = value ? Number(value) : null;
      }
      drawAssign();
    });
    const peopleRow = h('div', { class: 'people-picker', role: 'group', 'aria-label': t('liste.fiche.pour.personnes') });
    const peopleHint = h('p', { class: 'field__hint' });
    function drawAssign() {
      const list = app.data.lists.get(listId);
      const people = assignablePeople(list);
      const names = memberNames(list);
      const nameOf = (id) => (id === app.user.id ? t('liste.moi') : names.get(id) ?? t('liste.fiche.ancienMembre'));
      // Plus de répétition : « chacun son tour » redevient la personne de cette fois
      if (assignMode === 'turn' && !repeat) {
        assignMode = 'one';
        assignee = assignee !== null && assignPeople.includes(assignee) ? assignee : assignPeople[0] ?? null;
        assignPeople = [];
      }
      const choices = [['', t('liste.personne')]];
      if (people.some((p) => p.id === app.user.id)) choices.push([String(app.user.id), t('liste.moi')]);
      for (const person of people) if (person.id !== app.user.id) choices.push([String(person.id), person.displayName]);
      // Personne déjà attribuée qui ne serait plus dans les choix : gardée,
      // pour ne rien changer sans le vouloir
      if (assignMode === 'one' && assignee !== null && !choices.some(([value]) => value === String(assignee))) {
        choices.push([String(assignee), nameOf(assignee)]);
      }
      if (people.length >= 2) {
        choices.push(['all', t('liste.fiche.pour.plusieurs.choix')]);
        if (repeat || assignMode === 'turn') choices.push(['turn', t('liste.fiche.pour.tour.choix')]);
      }
      assignSelect.replaceChildren(...choices.map(([value, label]) => h('option', { value }, label)));
      assignSelect.value = assignMode === 'one' ? (assignee === null ? '' : String(assignee)) : assignMode;
      const label = assignMode === 'all' ? t('liste.fiche.pour.plusieurs') : assignMode === 'turn' ? t('liste.fiche.pour.tour')
        : choices.find(([value]) => value === assignSelect.value)?.[1] ?? t('liste.personne');
      replace(assignPicker.text, icon(assignMode === 'turn' ? 'repeat' : assignMode === 'all' ? 'users' : 'user', 'icon--sm'), label);
      assignSelect.setAttribute('aria-label', t('liste.fiche.pour.changer', { label }));
      // Pastilles des personnes (plusieurs, ou chacun son tour : numéro dans le tour)
      peopleRow.hidden = assignMode === 'one';
      peopleHint.hidden = assignMode === 'one';
      if (assignMode === 'one') return;
      // Les personnes choisies d'abord, dans l'ordre (du tour), puis les autres
      const ids = [...new Set([...assignPeople, ...people.map((p) => p.id)])];
      replace(peopleRow, ids.map((id) => {
        const rank = assignPeople.indexOf(id);
        const on = rank >= 0;
        const text = assignMode === 'turn' && on ? `${rank + 1} · ${nameOf(id)}` : nameOf(id);
        return h('button', {
          class: 'weekdays__opt', type: 'button', 'aria-pressed': String(on),
          'aria-label': assignMode === 'turn' && on ? t('liste.fiche.pour.rang', { name: nameOf(id), rank: rank + 1 }) : nameOf(id),
          onClick: () => {
            assignPeople = on ? assignPeople.filter((p) => p !== id) : [...assignPeople, id];
            drawAssign();
          },
        }, text);
      }));
      // Chacun son tour : la personne de cette fois (l'actuelle si elle reste dans le tour, sinon la première)
      const current = assignee !== null && assignPeople.includes(assignee) ? assignee : assignPeople[0] ?? null;
      peopleHint.textContent = assignMode === 'all'
        ? t('liste.fiche.pour.plusieurs.aide')
        : current !== null ? t('liste.fiche.pour.tour.aide.cetteFois', { name: nameOf(current) }) : t('liste.fiche.pour.tour.aide');
    }
    drawAssign();
    redrawAssign = drawAssign;
    const assignField = h('div', { class: 'field' },
      h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('liste.fiche.pour')),
      assignPicker.el, peopleRow, peopleHint);

    const repeatField = h('div', { class: 'field' },
      h('span', { class: 'field__label', 'aria-hidden': 'true' }, t('liste.fiche.repete')),
      kindPicker.el, daysRow, modePicker.el, monthPicker.el, monthWeekRow, repeatNote, skipRow);
    const showOptions = () => {
      const { priority: withPriority, due: withDue } = options();
      // Un champ qui disparaît perd le curseur (clavier ou calendrier refermé)
      for (const [fieldEl, shown] of [[priorityField, withPriority], [dueField, withDue], [repeatField, withDue], [assignField, options().assign]]) {
        if (!shown && fieldEl.contains(document.activeElement)) document.activeElement.blur();
        fieldEl.hidden = !shown;
      }
      drawTime(); // heure et rappel : avec l'échéance, et seulement avec une date
      redrawSummaries?.();
    };
    showOptions();

    // --- Sous-pages (décision du 11 novembre 2026 : la fiche d'une tâche
    // devenait trop longue). La fiche garde la priorité et trois lignes
    // résumées : « Échéance » (date, heure, rappel), « Se répète », « Pour ».
    // Toucher une ligne ouvre sa sous-page DANS la fiche (« ‹ » et le titre
    // en haut) ; rien n'est enregistré en revenant : la disquette enregistre
    // tout, la croix abandonne tout. Échap et le geste Retour du téléphone
    // ramènent d'abord à la fiche (setBack, ui.js). La fiche prend la hauteur
    // de la sous-page (pas de grand vide : décision du propriétaire). Aucun
    // champ ne prend le curseur : le focus va au titre.
    const tasks = classic && !wishes;
    const subpages = [];
    let currentSub = null;
    const subpage = (title, iconName, children) => {
      const heading = h('h3', { class: 'subpage__title', tabindex: '-1' }, title);
      const page = h('div', { class: 'subpage stack' },
        h('div', { class: 'subpage__bar' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('liste.fiche.retour'), onClick: () => leaveSub() }, icon('chev-l')),
          heading),
        children);
      const summary = h('span', { class: 'row__sub' });
      const row = h('button', { class: 'row', type: 'button', onClick: () => enterSub(entry) },
        h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(iconName)),
        h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, title), summary),
        icon('chev-r'));
      const entry = { title, page, row, summary, heading };
      subpages.push(entry);
      return entry;
    };
    const dueSub = tasks ? subpage(t('liste.fiche.echeance'), 'calendar', [dueField, timeField, remindField]) : null;
    const repeatSub = tasks ? subpage(t('liste.fiche.repete'), 'repeat', [repeatField]) : null;
    const assignSub = tasks ? subpage(t('liste.fiche.pour'), 'users', [assignField]) : null;

    // --- Sous-tâche de… (option « Sous-tâches », subtasks.js) : ranger la
    // tâche sous une tâche principale de la liste, ou « Aucune ». Une tâche
    // qui a des sous-tâches, ou qui se répète, ne peut pas devenir une
    // sous-tâche (le serveur le revérifie).
    const ownChildren = () => view?.subtasks.get(item.id) ?? [];
    const savedParent = [...(view?.subtasks ?? [])].find(([, children]) => children.some((child) => child.id === item.id))?.[0] ?? null;
    let parentChoice = savedParent;
    const parentNote = h('p', { class: 'field__hint' });
    const parentRows = h('div', { class: 'card picker', role: 'radiogroup', 'aria-label': t('liste.fiche.sousTacheDe') });
    // Tâches principales possibles : celles de premier niveau de la liste
    // (pas elle-même), à faire d'abord, par ordre alphabétique
    const parentChoices = () => [...(view?.groups.flatMap((group) => group.items) ?? []), ...(view?.done ?? [])]
      .filter((other) => other.id !== item.id)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || compareText(a.name, b.name, { sensitivity: 'base' }));
    function drawParent() {
      const blocked = ownChildren().length
        ? t('liste.fiche.parent.aDesSousTaches', { count: ownChildren().length })
        : repeat && parentChoice === null ? t('liste.fiche.parent.repete') : '';
      parentNote.textContent = blocked;
      parentNote.hidden = !blocked;
      parentRows.hidden = Boolean(blocked);
      if (blocked) return;
      // Un choix ne redessine pas les lignes (le focus reste sur la ligne touchée)
      const rowFor = (id, name) => h('button', {
        class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-parent': id ?? '',
        onClick: () => {
          parentChoice = id;
          paintParent();
        },
      }, h('span', { class: 'radio' }), name);
      replace(parentRows, rowFor(null, t('liste.fiche.parent.aucune')), parentChoices().map((other) => rowFor(other.id, other.name)));
      paintParent();
    }
    function paintParent() {
      for (const row of parentRows.querySelectorAll('.radio-row')) {
        const on = row.dataset.parent === (parentChoice ?? '');
        row.classList.toggle('is-on', on);
        row.setAttribute('aria-checked', String(on));
        row.querySelector('.radio').classList.toggle('is-on', on);
        row.querySelector('.icon-end')?.remove();
        if (on) row.append(icon('check', 'icon-end'));
      }
    }
    const parentField = h('div', { class: 'field' }, parentNote, parentRows);
    drawParent();
    const parentSub = tasks ? subpage(t('liste.fiche.sousTacheDe'), 'layers', [parentField]) : null;
    // « Ajouter une sous-tâche » (tâche principale ou ordinaire, à faire) :
    // la feuille d'ajout s'ouvre par-dessus la fiche
    const addSubtaskButton = h('button', { class: 'btn btn--secondary btn--block', type: 'button', onClick: () => openAddSubtask(item) },
      icon('plus', 'icon--sm'), t('liste.sousTaches.ajouter'));
    // Dans une sous-page, son titre dit déjà de quoi il s'agit
    if (tasks) for (const fieldEl of [repeatField, assignField]) fieldEl.querySelector(':scope > .field__label').hidden = true;
    const subRows = tasks ? h('div', { class: 'group sheet-rows' }, subpages.map((entry) => entry.row)) : null;
    // Résumés des lignes (relus en revenant d'une sous-page)
    function drawSummaries() {
      if (!tasks) return;
      const opts = options();
      const names = memberNames(app.data.lists.get(listId));
      const nameOf = (id) => (id === app.user.id ? t('liste.moi') : names.get(id) ?? t('liste.fiche.ancienMembre'));
      const due = !dueDate ? t('liste.fiche.aucuneEcheance') : [dueDateLabel(dueDate), dueTime ? timeLabel(dueTime) : null,
        dueTime && remind !== null && app.user?.push ? t('liste.fiche.resume.rappel', { label: `${reminderLabel(remind).charAt(0).toLowerCase()}${reminderLabel(remind).slice(1)}` }) : null].filter(Boolean).join(' · ');
      const turnNow = assignee !== null && assignPeople.includes(assignee) ? assignee : assignPeople[0];
      const who = assignMode === 'all' ? assignPeople.map(nameOf).join(', ') || t('liste.fiche.pour.plusieurs')
        : assignMode === 'turn' ? (turnNow != null ? t('liste.fiche.resume.tour.cetteFois', { names: assignPeople.map(nameOf).join(', '), name: nameOf(turnNow) }) : t('liste.fiche.resume.tour', { names: assignPeople.map(nameOf).join(', ') }))
          : assignee === null ? t('liste.personne') : nameOf(assignee);
      // Sous-tâche : jamais de répétition (ligne cachée)
      const parentName = parentChoice === null ? null : app.data.items.get(parentChoice)?.name ?? t('liste.fiche.resume.tacheSupprimee');
      const parentText = parentName ?? (ownChildren().length ? t('liste.fiche.resume.principale', { count: ownChildren().length }) : t('liste.fiche.resume.aucune'));
      for (const [entry, text, shown] of [[dueSub, due, opts.due], [repeatSub, repeat ? repeatSentence(repeat) : t('liste.fiche.jamais'), opts.due && !(opts.subtasks && parentChoice !== null)], [assignSub, who, opts.assign], [parentSub, parentText, opts.subtasks]]) {
        entry.summary.textContent = text;
        entry.row.setAttribute('aria-label', t('liste.fiche.sousPage.modifier', { title: entry.title, text }));
        entry.row.hidden = !shown;
        // Option désactivée pendant qu'on est dans sa sous-page : retour à la fiche
        if (!shown && currentSub === entry) leaveSub();
      }
      subRows.hidden = subpages.every((entry) => entry.row.hidden);
      addSubtaskButton.hidden = !opts.subtasks || parentChoice !== null || savedParent !== null || Boolean(app.data.items.get(item.id)?.checked);
      drawParent();
    }
    // Dans une sous-page : une seule ligne en haut, « ‹ » et son titre
    // (décision du propriétaire) : l'en-tête de la fiche (titre, corbeille,
    // disquette, croix) et, sur ordinateur, le pied du panneau sont cachés ;
    // on enregistre depuis la fiche. Appui en dehors, Échap, Retour : retour
    // à la fiche (setBack, ui.js).
    const showSheetActions = (shown) => {
      const panel = form.closest('.sheet, .pc-panel');
      for (const part of panel?.querySelectorAll(':scope > .sheet__head, :scope > .pc-panel__head, :scope > .pc-panel__foot') ?? []) part.hidden = !shown;
    };
    function enterSub(entry) {
      currentSub = entry;
      showSheetActions(false);
      form.classList.add('is-sub');
      for (const other of subpages) other.page.classList.toggle('is-current', other === entry);
      form.closest('.sheet, .pc-drawer')?.scrollTo?.(0, 0);
      entry.heading.focus();
    }
    function leaveSub() {
      if (!currentSub) return false;
      const { row } = currentSub;
      currentSub = null;
      form.classList.remove('is-sub');
      showSheetActions(true);
      for (const entry of subpages) entry.page.classList.remove('is-current');
      drawSummaries();
      if (row.isConnected && !row.hidden) row.focus();
      return true;
    }
    redrawSummaries = drawSummaries;
    drawSummaries();
    const classicFields = !classic ? null
      : tasks ? [priorityField, subRows, addSubtaskButton, ...subpages.map((entry) => entry.page)]
        : [priorityField, dueField, timeField, remindField, repeatField, assignField];

    // --- Code-barres (listes de courses, facultatif) : saisi à la main, ou
    // lu sur une photo par le bouton de scan, à droite du champ (sélecteur
    // d'images du téléphone, même lecteur que le mode scan). Une petite croix
    // dans le champ le vide, sans y mettre le curseur. Vérifié à
    // l'enregistrement ; vide = pas de code.
    const shopping = isShoppingList(view?.list);
    const eanInput = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '20', enterkeyhint: 'done', value: item.ean ?? '' });
    // Croix « Effacer » dans le champ, visible seulement s'il contient quelque chose
    const eanClear = iconButton('close', t('liste.fiche.codeBarres.effacer'), () => {
      eanInput.value = '';
      drawEan();
    });
    const eanPicker = createImagePicker((file) => readEan(file), { title: t('liste.fiche.codeBarres.scanner') });
    const eanScan = eanPicker.button({ class: 'btn btn--secondary btn--icon', 'aria-label': t('liste.fiche.codeBarres.scanner') }, icon('barcode'));
    const eanField = field(t('liste.fiche.codeBarres'), h('div', { class: 'field__row' }, h('div', { class: 'input-wrap' }, eanInput, eanClear), eanScan),
      { aside: t('liste.fiche.codeBarres.format') });
    const eanStatus = h('p', { class: 'field__hint', role: 'status', hidden: true });
    // Un autre article de la liste porte déjà ce code : on prévient, sans interdire
    const eanTwin = h('div', { class: 'note', role: 'status', hidden: true }, icon('alert'), h('p'));
    const drawEan = () => {
      eanField.setError(null);
      eanClear.hidden = !eanInput.value;
      const code = normalizeBarcode(eanInput.value);
      const twin = code ? [...app.data.items.values()].find((other) => other.listId === item.listId && other.id !== item.id && other.ean === code) : null;
      eanTwin.hidden = !twin;
      eanTwin.querySelector('p').textContent = twin ? t('liste.fiche.codeBarres.double', { name: twin.name }) : '';
    };
    eanInput.addEventListener('input', drawEan);
    // Photo prise ou choisie : le code lu remplit le champ
    async function readEan(file) {
      eanField.setError(null);
      eanStatus.textContent = t('liste.fiche.codeBarres.lecture');
      eanStatus.hidden = false;
      eanScan.disabled = true;
      let message = null;
      try {
        const code = await readBarcode(file);
        if (code) eanInput.value = code;
        else message = t('liste.fiche.codeBarres.nonLu');
      } catch (err) {
        message = err instanceof ImageUnreadable
          ? t('liste.fiche.codeBarres.illisible')
          : t('liste.fiche.codeBarres.indisponible');
      }
      eanStatus.hidden = true;
      eanScan.disabled = false;
      drawEan();
      if (message) eanField.setError(message);
    }
    drawEan();
    const eanFields = shopping ? h('div', { class: 'stack stack--sm' },
      eanField.field, eanStatus, eanTwin, eanPicker.input) : null;

    // --- Photo (facultative) : envoyée ou retirée tout de suite, sans
    // attendre « Enregistrer ». Hors ligne, elle passe par la file d'attente
    // (actions.js) et part au retour du réseau.
    let current = item; // dernier état connu de l'article (photoAt)
    let busy = false;
    let gone = false; // article supprimé ailleurs pendant que la feuille est ouverte
    const photoArea = h('div');
    const photoNote = h('p', { class: 'field__hint', role: 'status', hidden: true });
    // Un seul bouton : le sélecteur d'images du téléphone (son menu propose
    // l'appareil photo ou la photothèque). La photo reste facultative.
    const photoPicker = createImagePicker((file) => sendPhoto(file), { title: byKind(kind, { shopping: t('liste.photo.titre.courses'), tasks: t('liste.photo.titre.taches'), wishes: t('liste.photo.titre.envies') }) });

    const drawPhoto = () => {
      const button = (classes, iconName, text, label, onClick) => h('button', {
        class: `btn ${classes}`, type: 'button', 'aria-label': label, disabled: busy || gone, onClick,
      }, icon(iconName, 'icon--sm'), text);
      const pick = (classes, text) => photoPicker.button({ class: `btn ${classes}`, 'aria-label': text, disabled: busy || gone }, icon('camera', 'icon--sm'), text);
      if (actions.hasPhoto(current)) {
        replace(photoArea, h('div', { class: 'photo-block' },
          h('button', { class: 'photo-block__thumb', type: 'button', 'aria-label': t('liste.photo.agrandir', { name: current.name }), onClick: () => showPhoto(current) },
            h('img', { class: 'photo', src: actions.photoSrc(current), alt: '' })),
          h('div', { class: 'photo-block__actions' },
            pick('btn--secondary btn--sm', t('liste.photo.changer')),
            button('btn--danger-outline btn--sm', 'trash', t('liste.retirer'), t('liste.photo.retirer'), removePhoto))));
      } else {
        replace(photoArea, pick('btn--secondary btn--block', t('liste.photo.ajouter')));
      }
      photoNote.textContent = busy ? t('liste.photo.preparation') : current.localPhoto ? t('liste.photo.enAttente') : '';
      photoNote.hidden = !photoNote.textContent;
    };

    // Photo prise ou choisie : réduite ici, puis mise en file d'attente (elle
    // part tout de suite avec du réseau, sinon dès son retour)
    async function sendPhoto(file) {
      if (!editable()) return;
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
      const ok = await confirmDialog({ title: t('liste.photo.retirer.question'), text: t('liste.photo.retirer.texte'), confirmLabel: t('liste.retirer') });
      if (!ok || !editable()) return;
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
    const contentOf = (it) => JSON.stringify([it.name, it.quantity, it.note, it.aisleId ?? null, it.storeId ?? null, it.priority ?? 'normal', it.dueDate ?? null, it.ean ?? null, it.link ?? null, it.priceCents ?? null, it.repeat ?? null, it.assignedTo ?? null, modeOf(it), peopleOf(it), it.dueTime ?? null, it.remindBefore ?? null]);
    let seen = contentOf(item);
    let mine = false; // vrai pendant mes propres enregistrements
    const stopWatching = onDataChange(() => {
      reservation?.paint(); // réservation faite ou libérée (proches seulement)
      showOptions(); // réglage de la liste changé par le propriétaire
      drawRepeat(); // « Passer cette fois » suit la tâche enregistrée
      drawAssign(); // personnes de la liste (partage changé)
      if (mine) return;
      const latest = app.data.items.get(item.id);
      if (!latest) {
        if (gone) return;
        gone = true;
        conflictText.textContent = byKind(kind, { shopping: t('liste.fiche.conflit.supprime.courses'), tasks: t('liste.fiche.conflit.supprime.taches'), wishes: t('liste.fiche.conflit.supprime.envies') });
      } else {
        const changedElsewhere = gone || contentOf(latest) !== seen;
        gone = false;
        current = latest;
        seen = contentOf(latest);
        drawPhoto();
        if (!changedElsewhere) return;
        conflictText.textContent = byKind(kind, { shopping: t('liste.fiche.conflit.modifie.courses'), tasks: t('liste.fiche.conflit.modifie.taches'), wishes: t('liste.fiche.conflit.modifie.envies') });
      }
      conflict.hidden = false;
      save.disabled = gone;
      remove.disabled = gone;
      drawPhoto();
    });

    // En-tête de la fiche (à droite du titre) : poubelle, un espace,
    // disquette « Enregistrer » (bouton plein, action principale), puis la
    // croix. La poubelle n'est jamais à côté de la croix. La disquette est
    // reliée au formulaire (attribut form) : Entrée dans un champ enregistre
    // toujours.
    const formId = `fiche-${item.id}`;
    // Ordinateur (tiroir, maquette pc-A 06) : boutons écrits au pied
    // (Supprimer, Annuler, Enregistrer), formulaire sur deux colonnes
    // (quantité et rayon côte à côte), « Modifications non enregistrées »
    // et une confirmation avant de fermer sans enregistrer
    const pc = onPc();
    const remove = pc
      ? h('button', { class: 'btn btn--danger-outline', type: 'button' }, icon('trash', 'icon--sm'), t('liste.supprimer'))
      : iconButton('trash', byKind(kind, { shopping: t('liste.fiche.supprimer.courses'), tasks: t('liste.fiche.supprimer.taches'), wishes: t('liste.fiche.supprimer.envies') }), null, 'icon-btn--danger sheet__delete');
    const save = pc
      ? h('button', { class: 'btn btn--primary', type: 'submit', form: formId, 'aria-keyshortcuts': 'Control+Enter' }, t('liste.enregistrer'), keycap(t('liste.fiche.touche.ctrl')), keycap('↵'))
      : h('button', { class: 'icon-btn icon-btn--primary', type: 'submit', form: formId, 'aria-label': t('liste.enregistrer') }, icon('disquette'));
    const half = (el) => {
      if (pc) el.classList.add('pc-half');
      return el;
    };
    const dirtyNote = h('p', { class: 'pc-meta' }, t('liste.fiche.nonEnregistre'));
    dirtyNote.hidden = true;
    const form = h('form', { class: pc ? 'pc-form' : 'stack', id: formId, novalidate: true },
      conflict,
      nameField.field,
      wishes ? [linkField.field, linkButton(item.link), priceField.field]
        // Liste de tâches : pas de quantité (gardée seulement si une avait été saisie)
        : tasks && !item.quantity ? null
          : half(field(t('liste.fiche.quantite'), quantity, { aside: t('liste.fiche.quantite.exemple') }).field),
      // Ordinateur : le rayon (ou le magasin) juste à côté de la quantité
      pc && isShopping ? half(h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'aisle-label' }, t('liste.rayon')), aisleButton)) : null,
      pc && multi ? half(h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'store-label' }, t('liste.magasin')), storeButton)) : null,
      field(t('liste.fiche.note'), note).field,
      classicFields,
      eanFields,
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('liste.fiche.photo')), photoArea, photoNote, photoPicker.input),
      !pc && isShopping ? h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'aisle-label' }, t('liste.rayon')), aisleButton) : null,
      !pc && multi ? h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'store-label' }, t('liste.magasin')), storeButton) : null,
      reservation?.el,
      error.note,
      pc ? dirtyNote : null);
    if (isShopping) aisleButton.setAttribute('aria-labelledby', 'aisle-label');

    // Ce qui est tapé ou choisi (hors photo, envoyée tout de suite) : sert à
    // savoir s'il reste des modifications non enregistrées (ordinateur)
    function snapshot() {
      return JSON.stringify([name.value, quantity.value, note.value, linkInput.value, priceInput.value, eanInput.value, aisleId ?? null, storeId ?? null, priority, dueDate, repeat, assignee, assignMode, assignPeople, dueTime, remind, parentChoice]);
    }
    let initialSnapshot = snapshot();
    const dirty = () => snapshot() !== initialSnapshot;
    if (pc) {
      const paintDirty = () => setTimeout(() => {
        dirtyNote.hidden = !dirty();
      }, 0);
      form.addEventListener('input', paintDirty);
      form.addEventListener('click', paintDirty);
    }

    const sheet = openSheet({
      title: byKind(kind, { shopping: t('liste.fiche.titre.courses'), tasks: t('liste.fiche.titre.taches'), wishes: t('liste.fiche.titre.envies') }),
      content: form,
      tools: pc ? null : [remove, save],
      scroll: true,
      pc: 'drawer',
      footer: pc ? [remove, h('span', { class: 'grow' }), h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => sheet.close() }, t('liste.fiche.annuler')), save] : null,
      // Ordinateur : fermer sans enregistrer demande confirmation (rien ne se perd par erreur)
      beforeClose: pc ? async () => !dirty() || confirmDialog({
        title: t('liste.fiche.abandonner.question'),
        text: t('liste.fiche.abandonner.texte'),
        confirmLabel: t('liste.fiche.abandonner'),
        cancelLabel: t('liste.fiche.continuer'),
        focusCancel: true,
      }) : null,
      onClose: () => {
        stopWatching();
        reservation?.dispose();
      },
    });
    // Échap et le geste Retour : d'abord la sous-page ouverte, s'il y en a une
    sheet.setBack(() => leaveSub());

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!editable()) {
        sheet.forceClose();
        return;
      }
      const newName = name.value.replace(/\s+/g, ' ').trim();
      nameField.setError(newName ? null : t('liste.fiche.erreur.nom'));
      // Code-barres : vide = pas de code ; sinon vérifié (clé de contrôle) et
      // gardé sous sa forme normalisée (un UPC-A devient un EAN-13)
      const typedEan = eanInput.value.trim();
      const newEan = typedEan ? normalizeBarcode(typedEan) : null;
      if (shopping) eanField.setError(typedEan && !newEan ? t('liste.fiche.erreur.codeBarres') : null);
      // Souhait : lien (http ou https) et prix (euros -> centimes), vérifiés ici
      // et de nouveau par le serveur
      const typedLink = linkInput.value.trim();
      const newLink = typedLink ? cleanLink(typedLink) : null;
      const newPrice = parsePrice(priceInput.value);
      if (wishes) {
        linkField.setError(typedLink && !newLink ? t('liste.fiche.erreur.lien') : null);
        priceField.setError(Number.isNaN(newPrice) ? t('liste.fiche.erreur.prix') : null);
      }
      if (!newName || (shopping && typedEan && !newEan) || (wishes && ((typedLink && !newLink) || Number.isNaN(newPrice)))) return;
      const changes = {};
      if (newName !== item.name) changes.name = newName;
      if (!wishes && quantity.value.trim() !== item.quantity) changes.quantity = quantity.value.trim();
      if (wishes && newLink !== (item.link ?? null)) changes.link = newLink;
      if (wishes && newPrice !== (item.priceCents ?? null)) changes.priceCents = newPrice;
      if (note.value.trim() !== item.note) changes.note = note.value.trim();
      if (isShopping && aisleId !== item.aisleId) changes.aisleId = aisleId;
      if (multi && storeId !== (item.storeId ?? null)) changes.storeId = storeId;
      // Priorité et échéance : seulement si elles sont activées à cet instant
      const enabled = options();
      if (enabled.priority && priority !== (item.priority ?? 'normal')) changes.priority = priority;
      if (enabled.due && dueDate !== savedDue) changes.dueDate = dueDate; // null : échéance effacée
      if (enabled.due && repeat !== savedRepeat) changes.repeat = repeat; // null : ne se répète plus
      // Attribution : une personne (null : à personne), plusieurs, ou chacun
      // son tour (au moins deux personnes ; assign.js)
      if (enabled.assign && assignMode !== 'one' && assignPeople.length < 2) {
        toast(t('liste.fiche.erreur.deuxPersonnes'));
        return;
      }
      const turnNow = assignMode === 'turn' ? (assignee !== null && assignPeople.includes(assignee) ? assignee : assignPeople[0]) : null;
      const wantedAssign = assignMode === 'one' ? [assignee, 'one', []] : assignMode === 'all' ? [null, 'all', assignPeople] : [turnNow, 'turn', assignPeople];
      if (enabled.assign && JSON.stringify(wantedAssign) !== savedAssign) {
        changes.assignMode = assignMode;
        if (assignMode === 'one') changes.assignedTo = assignee;
        else changes.assignPeople = [...assignPeople];
        if (assignMode === 'turn') changes.assignedTo = turnNow;
      }
      if (enabled.due && dueTime !== savedDueTime) changes.dueTime = dueTime; // null : sans heure
      if (enabled.due && remind !== savedRemind) changes.remindBefore = remind; // null : aucun rappel
      if (shopping && newEan !== (item.ean ?? null)) changes.ean = newEan; // null : code effacé
      // Sous-tâche de… (null : redevient une tâche principale ou ordinaire)
      if (enabled.subtasks && parentChoice !== savedParent) {
        if (parentChoice !== null && repeat) {
          toast(t('liste.fiche.erreur.sousTacheRepete'));
          return;
        }
        changes.parentId = parentChoice;
      }
      if (!Object.keys(changes).length) {
        sheet.forceClose();
        return;
      }
      // Ma propre modification (pas d'avertissement) : copie locale tout de
      // suite, puis envoi (file d'attente). Historique mis à jour par actions.js.
      mine = true;
      // Ctrl+Z (ordinateur) : valeurs d'avant, pour les seuls champs changés
      const latest = app.data.items.get(item.id) ?? item;
      recordUndo(listId, { kind: 'update', itemId: item.id, name: item.name, before: beforeOf(latest, changes), after: changes });
      await actions.updateItem(item, changes);
      sheet.forceClose();
    });

    remove.addEventListener('click', async () => {
      mine = true;
      sheet.forceClose();
      await deleteWithUndo(item);
    });
  }

  // --- Fiche à consulter (liste en lecture seule) ---
  // Les mêmes informations que la fiche « Modifier », en texte : aucun champ
  // à remplir, aucun bouton qui écrit ; la photo s'agrandit d'un appui. Elle
  // suit les changements faits par les autres et se ferme si l'article est
  // supprimé.
  function openItemView(item) {
    const words = itemWords(view?.list);
    const kind = wordKind(view?.list); // phrases entières de cette sorte de liste (byKind)
    const body = h('div', { class: 'stack' });
    const wishes = isWishList(view?.list);
    const reservation = wishes ? reservationBlock(item) : null;
    const value = (label, text) => h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), h('p', { class: 'field__value' }, text));
    const paint = (it) => {
      const multi = Boolean(view?.multi);
      const shopping = isShoppingList(view?.list);
      const options = listOptions(app.data.lists.get(listId)); // seulement ce qui est activé
      replace(body,
        h('div', { class: 'note' }, icon('eye'), h('p', {}, byKind(kind, { shopping: t('liste.detail.lectureSeule.courses'), tasks: t('liste.detail.lectureSeule.taches'), wishes: t('liste.detail.lectureSeule.envies') }))),
        value(capitalized(words.one), it.name),
        it.quantity && !wishes ? value(t('liste.fiche.quantite'), it.quantity) : null,
        wishes && Number.isInteger(it.priceCents) ? value(t('liste.detail.prix'), formatPrice(it.priceCents)) : null,
        wishes ? linkButton(it.link) : null,
        it.note ? value(t('liste.detail.note'), it.note) : null,
        options.priority ? value(t('liste.fiche.priorite'), PRIORITY_LABELS[it.priority ?? 'normal'] ?? t('liste.fiche.priorite.normale')) : null,
        options.due ? value(t('liste.fiche.echeance'), it.dueDate ? (it.dueTime ? t('liste.detail.echeance.heure', { date: dueDateLabel(it.dueDate), time: timeLabel(it.dueTime) }) : dueDateLabel(it.dueDate)) : t('liste.fiche.aucuneEcheance')) : null,
        // Rappel : propre à cette tâche, jamais sur la page publique
        options.due && it.dueDate && it.dueTime && it.remindBefore != null && app.user?.push ? value(t('liste.fiche.rappel'), reminderLabel(it.remindBefore)) : null,
        options.due && it.dueDate && it.repeat ? value(t('liste.fiche.repete'), repeatSentence(it.repeat)) : null,
        // Jamais sur la page publique (prénoms de la famille) : voir public-sheet
        options.assign ? value(t('liste.fiche.pour'), assignText(it)) : null,
        // Sous-tâche : le nom de sa tâche principale
        options.subtasks && parentOf(it, app.data.items) ? value(t('liste.fiche.sousTacheDe'), parentOf(it, app.data.items).name) : null,
        shopping && it.ean ? value(t('liste.fiche.codeBarres'), it.ean) : null,
        actions.hasPhoto(it) ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('liste.detail.photo')),
          h('div', { class: 'photo-block' },
            h('button', { class: 'photo-block__thumb', type: 'button', 'aria-label': t('liste.photo.agrandir', { name: it.name }), onClick: () => showPhoto(it) },
              h('img', { class: 'photo', src: actions.photoSrc(it), alt: '' })))) : null,
        shopping && !multi ? value(t('liste.rayon'), app.data.aisles.find((a) => a.id === it.aisleId)?.name ?? t('liste.sansRayon')) : null,
        multi ? value(t('liste.magasin'), storeName(it.storeId) ?? t('liste.sansMagasin')) : null,
        reservation?.el);
      reservation?.paint();
    };
    paint(item);
    let stopWatching = () => {};
    const sheet = openSheet({
      title: byKind(kind, { shopping: t('liste.detail.titre.courses'), tasks: t('liste.detail.titre.taches'), wishes: t('liste.detail.titre.envies') }),
      content: body,
      scroll: true,
      pc: 'drawer', // ordinateur : tiroir à droite, comme la fiche à modifier
      onClose: () => {
        stopWatching();
        reservation?.dispose();
      },
    });
    stopWatching = onDataChange(() => {
      const latest = app.data.items.get(item.id);
      if (latest) paint(latest);
      else sheet.close();
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
    const choices = [...aisles.map((a) => ({ id: a.id, name: a.name })), { id: null, name: t('liste.sansRayon') }];
    return pickChoice({ title, sub, current, confirmLabel, choices, label: t('liste.rayon'), create: { kind: 'aisle', text: t('liste.choix.nouveauRayon') } });
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
    const choices = [...stores.map((s) => ({ id: s.id, name: s.name })), { id: null, name: t('liste.sansMagasin') }];
    return pickChoice({ title, sub, current, confirmLabel, choices, label: t('liste.magasin'), create: { kind: 'store', text: t('liste.choix.nouveauMagasin') } });
  }

  // Feuille de choix unique (lignes radio + bouton de confirmation)
  // create : { kind: 'aisle' | 'store', text } ajoute une dernière ligne
  // « Nouveau rayon… » / « Nouveau magasin… » (create-reference.js) : le nouvel
  // élément est ajouté aux choix et sélectionné ; il reste à confirmer.
  function pickChoice({ title, sub, current, confirmLabel, choices, label, create = null }) {
    return new Promise((resolve) => {
      let selected = current === undefined ? undefined : current;
      let result;
      const confirm = h('button', { class: 'btn btn--primary btn--block', type: 'button', disabled: selected === undefined }, confirmLabel);
      const makeRow = (choice) => {
        const row = h('button', { class: 'radio-row', type: 'button', role: 'radio', 'aria-checked': 'false' }, h('span', { class: 'radio' }), choice.name);
        row.addEventListener('click', () => {
          selected = choice.id;
          paint();
        });
        row.dataset.id = String(choice.id);
        return row;
      };
      const rows = choices.map(makeRow);
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
      const group = h('div', { role: 'radiogroup', 'aria-label': label }, rows);
      // Dernière ligne : créer l'élément qui manque (en ligne), puis le choisir
      const addRow = create ? h('button', { class: 'radio-row picker__new', type: 'button', onClick: async () => {
        const made = await openCreateReference(create.kind, { listId });
        if (!made) return;
        let row = rows.find((r) => r.dataset.id === String(made.id));
        if (!row) {
          row = makeRow(made);
          const none = rows.find((r) => r.dataset.id === 'null'); // « Sans rayon » reste en dernier
          group.insertBefore(row, none ?? null);
          rows.splice(none ? rows.indexOf(none) : rows.length, 0, row);
        }
        selected = made.id;
        paint();
        row.scrollIntoView({ block: 'nearest' });
      } }, icon('plus'), create.text) : null;
      const sheet = openSheet({
        title,
        sub,
        content: [h('div', { class: 'card picker' }, group, addRow), confirm],
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
  // Nouveautés reçues (synchronisation, temps réel) : ajoutées au halo avant
  // le dessin, et le repère monte (liste à l'écran seulement)
  onLeave(onDataChange(() => takeNews()));
  onLeave(onDataChange(idle.request));
  // Une tâche du jour à heure précise passe « En retard » à son heure :
  // redessin à la minute, seulement s'il y en a une dans la liste
  onLeave(watchMinute(() => {
    const today = todayKey();
    if ([...app.data.items.values()].some((it) => it.listId === listId && !it.checked && it.dueDate === today && it.dueTime)) idle.request();
  }));
  // Retour au premier plan (application, écran déverrouillé) : les nouveautés
  // arrivées entre-temps sont prises, puis la liste est redessinée
  const onVisible = () => {
    if (document.visibilityState === 'visible' && takeNews()) draw();
  };
  document.addEventListener('visibilitychange', onVisible);
  onLeave(() => document.removeEventListener('visibilitychange', onVisible));
  // Le propriétaire change mon droit pendant que la liste est ouverte (temps
  // réel ou synchronisation) : bascule tout de suite, sans recharger. Fiche,
  // choix du rayon, scan ou confirmation ouverts : refermés (ce qui n'était
  // pas enregistré ne l'est pas) ; clavier replié ; champ d'ajout masqué ou
  // remontré tout de suite (la liste elle-même est redessinée juste après).
  // Droit connu à l'ouverture ; null tant que la liste n'est pas encore
  // chargée (son arrivée n'est pas un changement de droit)
  let couldEdit = app.data.lists.has(listId) ? editable() : null;
  onLeave(onDataChange(() => {
    if (!app.data.lists.has(listId)) return; // liste retirée : draw() le dit
    const now = editable();
    if (couldEdit === null) couldEdit = now;
    if (now === couldEdit) return;
    couldEdit = now;
    releaseFocus();
    suggestBox.hidden = true;
    swipes.close();
    closeOverlays();
    showAddbar();
    readOnlyBanner.hidden = now;
    toast(now ? t('liste.droit.modification') : t('liste.droit.lectureSeule'));
  }));
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
  takeNews(); // nouveautés depuis ma dernière visite (avant le premier dessin)
  draw();
  refreshData({ quiet: true }); // actualisation à l'ouverture

  // Arrivée depuis « Échéances » (une tâche touchée) : sa fiche s'ouvre,
  // une fois l'écran posé ; en lecture seule, la fiche à consulter
  if (app.openItem?.listId === listId) {
    const { itemId } = app.openItem;
    app.openItem = null;
    requestAnimationFrame(() => {
      const item = app.data.items.get(itemId);
      if (!item || !view || item.listId !== listId) return;
      if (canEditList(view.list)) openItemSheet(item);
      else openItemView(item);
    });
  }

  if (pc) {
    readOnlyBanner.classList.add('pc-banner');
    // Touches écrites dans les champs (cachées si les raccourcis à une touche sont désactivés)
    input.setAttribute('aria-keyshortcuts', 'A');
    input.after(keycap('A'));
    search.field.querySelector('input').setAttribute('aria-keyshortcuts', '/');
    search.field.append(keycap('/'));
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' },
        h('div', { class: 'pc-head__main' }, title, sub),
        shareSlot,
        search.field,
        menuButton),
      h('div', { class: 'pc-tools' }, syncPill(() => refreshData({ full: true })), searchMeta,
        h('div', { class: 'pc-tools__end' }, sortButton, foldAll)),
      offlineBanner(),
      readOnlyBanner,
      wishNote,
      addbar,
      content);
  }
  // Téléphone : barre d'ajout en verre, flottante, toute la largeur, et la
  // loupe ronde au-dessus, à droite (16.15) ; les articles passent dessous
  replace(statusbar, syncPill(() => refreshData({ full: true })), foldAll);
  addbar.classList.add('addbar--glass', 'glass');
  content.classList.add('scroll--under-dock');
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('liste.retourMesListes'), () => goBack('lists'), 'mobile-only'),
      h('div', { class: 'topbar__main' }, h('div', { class: 'topbar__head' }, titleIcon, title), sub),
      sortButton,
      menuButton),
    readOnlyBanner,
    statusbar,
    search.bar,
    content,
    addbar,
    loupeDock);
}
