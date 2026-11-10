// Écran « Aide » (#/aide, ou #/aide/<section> pour ouvrir une section
// précise), ouvert depuis les Réglages. Il affiche le guide de Listo : tout
// le texte vient de help-content.js, la même source que docs/guide.md et que
// la page publique (site/).
// - trois boutons ronds flottants, en pile en bas à droite (icône seule,
//   aria-label, info-bulle au survol et au focus) : de bas en haut,
//   « Sommaire du guide », « Rechercher dans le guide », puis « Retour en
//   haut de la page » (seulement après un certain défilement) ;
// - la loupe ouvre une barre collée sous la barre du haut (hors de la zone
//   qui défile) : champ « Rechercher dans le guide » (.searchfield du kit),
//   croix pour effacer, « Fermer la recherche », et « N résultats » annoncé
//   (role=status). Recherche en direct dans les titres et le texte,
//   majuscules et accents ignorés (search.js) ; chapitres et sections sans
//   résultat masqués, les autres dépliés ; texte trouvé surligné
//   (<mark class="hit">, posé en DOM) ; un message quand il n'y a rien.
//   Échap vide le champ, puis (déjà vide) ferme la barre ; fermer remet
//   l'affichage normal et rend le focus à la loupe. Seule exception à la
//   règle « aucun curseur automatique » ici : après un appui sur la loupe,
//   le curseur va dans le champ (geste dont le seul but est d'écrire,
//   décision du 10 novembre 2026, test/focus.test.js) ;
// - chapitres numérotés (h2), repliables comme les groupes d'une liste
//   (bouton .aisle__toggle, aria-expanded, chevron qui tourne) ; au départ,
//   seul le premier est déplié ;
// - sections numérotées (h3) dans des cartes ; numéros calculés (outline) ;
// - bouton « Sommaire » : feuille avec « Haut de page » et les chapitres
//   seulement ; toucher un chapitre déplie ses sections (un seul à la fois :
//   « Aller au chapitre », puis les sections) ; au départ, le chapitre de la
//   section en cours est déplié, et la section en cours repérée (icône,
//   texte en gras, aria-current : jamais la couleur seule). Toucher une
//   entrée ferme la feuille (et efface une recherche en cours), déplie le
//   chapitre, fait défiler jusqu'au titre et lui donne le focus ; Échap ou
//   la croix ferment la feuille et rendent le focus au bouton.
// - « Retour en haut » : remonte au tout début (sans animation si
//   prefers-reduced-motion) et donne le focus au titre « Aide ».
// Textes posés avec textContent (h() de dom.js), jamais en HTML.
// Testé automatiquement (test/help.test.js) et dans Chromium
// (docs/developpement.md, point 36).

import { h, icon, iconButton, replace } from '../dom.js';
import { goBack } from '../router.js';
import { openSheet } from '../ui.js';
import { keepFieldFocus } from '../tap.js';
import { highlightParts, resultsLabel } from '../search.js';
import { GUIDE, ROLES, PERMISSIONS, PERMISSIONS_NOTE, SERVER_NOTE, outline, numbered, parseInline, refLabel, searchGuide } from '../help-content.js';

// Identifiant d'élément (unique dans la page) de l'ancre d'une section
export const anchorId = (id) => `guide-${id}`;

export const SEARCH_LABEL = 'Rechercher dans le guide';
export const NO_RESULT = 'Aucun résultat. Essayez un autre mot, ou ouvrez le sommaire.';

// Un texte, avec le texte cherché surligné (<mark class="hit">)
function marked(text, query) {
  if (!query) return text;
  return highlightParts(text, query).map((part) => (part.hit ? h('mark', { class: 'hit' }, part.text) : part.text));
}

// sectionId : section à montrer tout de suite (adresse #/aide/<section>)
export function renderHelp(sectionId = null) {
  const entries = outline();
  const entryOf = new Map(entries.map((e) => [e.id, e]));
  const opened = new Set([GUIDE[0].id]); // chapitres dépliés (hors recherche)
  let folds = new Map(); // chapitre -> show(on)
  let headings = new Map(); // section ou chapitre -> titre (h2, h3)
  let query = '';

  const content = h('div', { class: 'help__chapters' });

  // --- Recherche ---
  const input = h('input', {
    class: 'searchfield__input',
    type: 'search',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: '100',
    placeholder: SEARCH_LABEL,
    'aria-label': SEARCH_LABEL,
  });
  // Croix « Effacer la recherche » : un appui ne retire pas le curseur du
  // champ (s'il y était), comme dans une liste ; jamais de curseur mis de force
  const clearButton = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': 'Effacer la recherche',
    onPointerdown: keepFieldFocus.pointerdown,
    onMousedown: keepFieldFocus.mousedown,
    onClick: () => clearSearch(),
  }, icon('x-circle'));
  clearButton.hidden = true;
  const status = h('p', { class: 'help-search__status', role: 'status' });
  // Barre de recherche : cachée tant qu'on n'a pas touché la loupe
  const searchRow = h('div', { class: 'help-search help-search--bar', id: 'aide-recherche' },
    h('div', { class: 'help-search__row' },
      h('label', { class: 'searchfield' }, icon('search', 'icon--sm'), input, clearButton),
      iconButton('close', 'Fermer la recherche', () => closeSearch())),
    status);
  searchRow.hidden = true;

  const setQuery = (value) => {
    query = value;
    clearButton.hidden = value === '';
    draw();
  };
  const clearSearch = () => {
    input.value = '';
    setQuery('');
  };
  input.addEventListener('input', () => setQuery(input.value));
  // Échap : vide le champ, puis (déjà vide) ferme la barre
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (input.value !== '') clearSearch();
    else closeSearch();
  });

  // Ouvrir / fermer la barre de recherche (loupe)
  const openSearch = () => {
    searchRow.hidden = false;
    searchButton.setAttribute('aria-expanded', 'true');
    // Exception à la règle « aucun curseur automatique » : la personne vient
    // de toucher la loupe, son seul but est d'écrire (test/focus.test.js)
    input.focus();
  };
  const closeSearch = () => {
    if (query) clearSearch();
    searchRow.hidden = true;
    searchButton.setAttribute('aria-expanded', 'false');
    searchButton.focus();
  };

  // Déplie le chapitre d'une section, fait défiler jusqu'à son titre et lui
  // donne le focus (lecteurs d'écran, clavier), sans saut de défilement.
  // Pendant une recherche, elle est d'abord effacée (tout redevient visible).
  const jump = (id) => {
    const entry = entryOf.get(id);
    if (!entry) return;
    if (query) clearSearch();
    if (!searchRow.hidden) {
      searchRow.hidden = true;
      searchButton.setAttribute('aria-expanded', 'false');
    }
    folds.get(entry.level === 1 ? entry.id : entry.chapter)?.(true);
    const target = headings.get(id);
    target.scrollIntoView?.({ block: 'start' });
    target.focus?.({ preventScroll: true });
  };

  // Texte enrichi : `code`, [[renvoi]], [lien](https://…), posés un par un,
  // le texte cherché surligné
  const rich = (text) => parseInline(text).map((part) => {
    if (part.code !== undefined) return h('code', { class: 'help__code-inline' }, marked(part.code, query));
    if (part.ref !== undefined) {
      return h('a', {
        class: 'help__ref',
        href: `#/aide/${part.ref}`,
        onClick: (event) => {
          event.preventDefault();
          jump(part.ref);
        },
      }, marked(refLabel(part.ref), query));
    }
    if (part.link !== undefined) return h('a', { href: part.href, target: '_blank', rel: 'noopener noreferrer' }, marked(part.link, query));
    return marked(part.text, query);
  });

  // Un bloc du guide (voir help-content.js)
  const block = (entry) => {
    if (typeof entry === 'string') return h('p', { class: 'help__text' }, rich(entry));
    if (entry.ul) return h('ul', { class: 'help__list' }, entry.ul.map((text) => h('li', {}, rich(text))));
    if (entry.ol) return h('ol', { class: 'help__list help__list--steps' }, entry.ol.map((text) => h('li', {}, rich(text))));
    if (entry.code !== undefined) return h('pre', { class: 'help__code' }, h('code', {}, marked(entry.code, query)));
    if (entry.note) return h('div', { class: 'note help__note-box' }, icon('alert'), h('p', {}, rich(entry.note)));
    if (entry.sub) return h('h4', { class: 'help__sub' }, rich(entry.sub));
    if (entry.table) return table(entry.table, rich);
    if (entry.who) return whoCanWhat(query);
    return null;
  };

  // Titre numéroté d'une section (focusable pour le saut depuis le sommaire)
  const sectionCard = (section) => {
    const title = h('h3', { class: 'help__title', id: anchorId(section.id), tabindex: '-1' }, marked(numbered(entryOf.get(section.id)), query));
    headings.set(section.id, title);
    return h('section', { class: 'card help__topic', 'aria-labelledby': anchorId(section.id) },
      title,
      section.server ? h('p', { class: 'help__server' }, icon('wrench', 'icon--xs'), SERVER_NOTE) : null,
      (section.blocks ?? []).map(block));
  };

  // Chapitre repliable (même composant que les groupes d'une liste) ;
  // found : ce que la recherche montre de lui ({ intro, sections }), ou rien
  const chapterPart = (chapter, found) => {
    const bodyId = `${anchorId(chapter.id)}-contenu`;
    const sections = (chapter.sections ?? []).filter((section) => !found || found.sections.includes(section.id));
    const intro = (chapter.blocks ?? []).length && (!found || found.intro);
    const body = h('div', { class: 'help__section', id: bodyId },
      chapter.server ? h('p', { class: 'help__server' }, icon('wrench', 'icon--xs'), SERVER_NOTE) : null,
      intro ? h('div', { class: 'card help__topic' }, chapter.blocks.map(block)) : null,
      sections.map(sectionCard));
    const toggle = h('button', { class: 'aisle__toggle', type: 'button', 'aria-controls': bodyId },
      icon('chev-d', 'icon--sm'), h('span', { class: 'aisle__name' }, marked(numbered(entryOf.get(chapter.id)), query)));
    const show = (on) => {
      toggle.setAttribute('aria-expanded', String(on));
      body.hidden = !on;
      if (!found) {
        if (on) opened.add(chapter.id);
        else opened.delete(chapter.id);
      }
    };
    toggle.addEventListener('click', () => show(toggle.getAttribute('aria-expanded') !== 'true'));
    show(found ? true : opened.has(chapter.id));
    folds.set(chapter.id, show);
    const title = h('h2', { class: 'aisle aisle--fold', id: anchorId(chapter.id), tabindex: '-1' }, toggle);
    headings.set(chapter.id, title);
    return h('section', { class: 'help__part' }, title, body);
  };

  // Dessine les chapitres : tous, ou ceux que la recherche trouve
  function draw() {
    folds = new Map();
    headings = new Map();
    const result = searchGuide(query);
    if (!result) {
      status.textContent = '';
      replace(content, GUIDE.map((chapter) => chapterPart(chapter, null)));
      return;
    }
    status.textContent = resultsLabel(result.count);
    const shown = new Map(result.chapters.map((c) => [c.id, c]));
    replace(content, result.count
      ? GUIDE.filter((chapter) => shown.has(chapter.id)).map((chapter) => chapterPart(chapter, shown.get(chapter.id)))
      : h('div', { class: 'empty help-search__empty' }, icon('search', 'icon--lg'), h('p', { class: 'empty__text' }, NO_RESULT)));
  }
  draw();

  const body = h('div', { class: 'body help' }, content);

  // Section en cours : le dernier titre visible déjà arrivé en haut de
  // l'écran (sous l'en-tête collé du chapitre : sa marge de défilement)
  const currentId = () => {
    const top = body.getBoundingClientRect?.().top ?? 0;
    let current = entries[0].id;
    for (const entry of entries) {
      const el = headings.get(entry.id);
      if (!el || !el.isConnected || el.closest?.('[hidden]')) continue;
      const margin = parseFloat(globalThis.getComputedStyle?.(el).scrollMarginTop) || 0;
      if (el.getBoundingClientRect().top - top <= margin + 24) current = entry.id;
    }
    return current;
  };

  // Boutons flottants : ronds, icône seule, nom pour les lecteurs d'écran
  // (aria-label) et info-bulle (data-tip, CSS) au survol et au focus
  const fab = (iconName, label, extra = {}, extraClass = '') => h('button', {
    class: `help-fab${extraClass}`,
    type: 'button',
    'aria-label': label,
    'data-tip': label,
    ...extra,
  }, icon(iconName));
  // Sommaire et sa feuille
  const tocButton = fab('layers', 'Sommaire du guide', { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, ' help__toc-btn');
  tocButton.addEventListener('click', () => openToc());
  // Loupe : ouvre (ou referme) la barre de recherche
  const searchButton = fab('search', SEARCH_LABEL, { 'aria-expanded': 'false', 'aria-controls': 'aide-recherche' });
  searchButton.addEventListener('click', () => (searchRow.hidden ? openSearch() : closeSearch()));
  // Retour en haut : seulement après un certain défilement (trois quarts d'écran)
  const topButton = fab('arrow-up', 'Retour en haut de la page');
  topButton.hidden = true;
  topButton.addEventListener('click', () => goTop());
  const goTop = () => {
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    body.scrollTo?.({ top: 0, behavior: still ? 'auto' : 'smooth' });
    topTitle.focus({ preventScroll: true });
  };
  body.addEventListener('scroll', () => {
    topButton.hidden = body.scrollTop < body.clientHeight * 0.75;
  }, { passive: true });

  function openToc() {
    const here = currentId();
    const hereChapter = entryOf.get(here).level === 1 ? here : entryOf.get(here).chapter;
    let target = null; // entrée touchée : saut après la fermeture
    const choose = (id) => {
      target = id;
      sheet.close();
    };
    const content = tocContent({ entries, here, hereChapter, onChoose: choose });
    tocButton.setAttribute('aria-expanded', 'true');
    const sheet = openSheet({
      title: 'Sommaire',
      content,
      scroll: true,
      // En-tête collé (titre et croix toujours visibles quand la feuille défile)
      tools: [],
      returnTo: tocButton,
      onClose: () => {
        tocButton.setAttribute('aria-expanded', 'false');
        if (!target) return; // Échap, croix, fond : le focus revient au bouton
        // Après le retour du focus au bouton (fermeture de la fenêtre)
        const id = target;
        requestAnimationFrame(() => {
          if (id === 'top') {
            if (query) clearSearch();
            body.scrollTo?.({ top: 0 });
            topTitle.focus({ preventScroll: true });
          } else {
            jump(id);
          }
        });
      },
    });
    // Entrée en cours visible dès l'ouverture
    sheet.panel.querySelector?.('.is-current')?.scrollIntoView?.({ block: 'center' });
  }

  const topTitle = h('h1', { class: 'topbar__title', tabindex: '-1' }, 'Aide');
  const screen = h('div', { class: 'screen help-screen' },
    // Barre du haut (même balisage que les Réglages) : retour vers les Réglages
    h('header', { class: 'topbar' },
      iconButton('chev-l', 'Retour', () => goBack('settings')),
      h('div', { class: 'topbar__main' }, topTitle)),
    searchRow,
    body,
    // Pile en bas à droite ; dans la page, de haut en bas : haut, loupe, sommaire
    h('div', { class: 'help-fabs' }, topButton, searchButton, tocButton));

  // Adresse #/aide/<section> : la section s'ouvre une fois l'écran affiché
  if (sectionId && entryOf.has(sectionId)) requestAnimationFrame(() => jump(sectionId));
  return screen;
}

// Contenu de la feuille « Sommaire » : « Haut de page », puis les chapitres ;
// chacun est un bouton (aria-expanded, aria-controls) qui déplie ses
// sections, un seul à la fois : « Aller au chapitre », puis les sections.
// here : entrée en cours (repérée) ; hereChapter : chapitre déplié au départ.
export function tocContent({ entries, here, hereChapter, onChoose }) {
  const entryButton = (entry, label = numbered(entry)) => {
    const current = entry.id === here;
    return h('button', {
      class: `help-toc__entry help-toc__entry--2${current ? ' is-current' : ''}`,
      type: 'button',
      'aria-current': current ? 'location' : null,
      onClick: () => onChoose(entry.id),
    },
    current ? icon('chev-r', 'icon--sm') : null,
    h('span', {}, label),
    current ? h('span', { class: 'visually-hidden' }, ' (section en cours)') : null);
  };
  const toggles = [];
  const chapters = entries.filter((e) => e.level === 1).map((chapter) => {
    const subId = `sommaire-${chapter.id}`;
    const sub = h('ol', { class: 'help-toc__list help-toc__list--sub', id: subId },
      h('li', {}, entryButton(chapter, 'Aller au chapitre')),
      entries.filter((e) => e.chapter === chapter.id).map((section) => h('li', {}, entryButton(section))));
    const toggle = h('button', {
      class: 'help-toc__entry help-toc__entry--1 help-toc__chapter',
      type: 'button',
      'aria-controls': subId,
    }, icon('chev-d', 'icon--sm'), h('span', {}, numbered(chapter)));
    const show = (on) => {
      toggle.setAttribute('aria-expanded', String(on));
      sub.hidden = !on;
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      for (const other of toggles) other.show(false); // un seul chapitre déplié
      show(open);
    });
    show(chapter.id === hereChapter);
    toggles.push({ show });
    return h('li', {}, toggle, sub);
  });
  return h('nav', { class: 'help-toc', 'aria-label': 'Sommaire' },
    h('button', { class: 'help-toc__entry help-toc__top', type: 'button', onClick: () => onChoose('top') }, icon('arrow-up', 'icon--sm'), h('span', {}, 'Haut de page')),
    h('ol', { class: 'help-toc__list' }, chapters));
}

// Tableau en blocs empilés, lisible à 320 px : une carte par ligne, la
// première colonne en titre, les autres en « Titre : valeur »
function table({ head, rows }, rich) {
  return h('div', { class: 'help-table', role: 'list' }, rows.map((row) => h('div', { class: 'help-table__row', role: 'listitem' },
    h('p', { class: 'help-table__key' }, rich(row[0])),
    row.slice(1).map((value, i) => h('p', { class: 'help-table__cell' }, h('span', { class: 'help-table__head' }, `${head[i + 1]} : `), rich(value))))));
}

// « Qui peut quoi » : un bloc par action, les rôles dessous, « oui » ou
// « non » en icône ET en texte (jamais la couleur seule)
function whoCanWhat(query) {
  return h('div', { class: 'help-who' },
    h('div', { class: 'group' }, PERMISSIONS.map((permission) => h('div', { class: 'help-who__row' },
      h('p', { class: 'help-who__action' }, marked(permission.action, query)),
      h('ul', { class: 'help-who__roles' }, ROLES.map((role) => {
        const yes = permission.roles.includes(role.key);
        return h('li', { class: `chip help-who__role${yes ? ' help-who__role--yes' : ' help-who__role--no'}` },
          icon(yes ? 'check' : 'close', 'icon--xs'),
          h('span', {}, marked(role.label, query)),
          h('span', { class: 'visually-hidden' }, yes ? ' : oui' : ' : non'));
      }))))),
    h('p', { class: 'help__note' }, marked(PERMISSIONS_NOTE, query)));
}
