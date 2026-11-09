// Écran « Aide » (#/aide, ou #/aide/<section> pour ouvrir une section
// précise), ouvert depuis les Réglages. Il affiche le guide de Listo : tout
// le texte vient de help-content.js, la même source que docs/guide.md.
// - chapitres numérotés (h2), repliables comme les groupes d'une liste
//   (bouton .aisle__toggle, aria-expanded, chevron qui tourne) ; au départ,
//   seul le premier est déplié ;
// - sections numérotées (h3) dans des cartes ; numéros calculés (outline) ;
// - bouton « Sommaire » flottant en bas à droite (à portée du pouce, comme
//   « Nouvelle liste ») : il ouvre une feuille avec le sommaire sur deux
//   niveaux, « Haut de page », et la section en cours repérée (icône,
//   texte en gras, aria-current : jamais la couleur seule). Toucher une
//   entrée ferme la feuille, déplie le chapitre au besoin, fait défiler
//   jusqu'au titre et lui donne le focus ; Échap ou la croix ferment la
//   feuille et rendent le focus au bouton.
// Textes posés avec textContent (h() de dom.js), jamais en HTML. Aucun champ
// de saisie : rien ne prend le focus tout seul. Testé automatiquement
// (test/help.test.js) et dans Chromium (docs/developpement.md).

import { h, icon, iconButton } from '../dom.js';
import { goBack } from '../router.js';
import { openSheet } from '../ui.js';
import { GUIDE, ROLES, PERMISSIONS, PERMISSIONS_NOTE, SERVER_NOTE, outline, numbered, parseInline, refLabel } from '../help-content.js';

// Identifiant d'élément (unique dans la page) de l'ancre d'une section
export const anchorId = (id) => `guide-${id}`;

// sectionId : section à montrer tout de suite (adresse #/aide/<section>)
export function renderHelp(sectionId = null) {
  const entries = outline();
  const entryOf = new Map(entries.map((e) => [e.id, e]));
  const folds = new Map(); // chapitre -> show(on)
  const headings = new Map(); // section ou chapitre -> titre (h2, h3)

  const body = h('div', { class: 'body help' });

  // Déplie le chapitre d'une section, fait défiler jusqu'à son titre et lui
  // donne le focus (lecteurs d'écran, clavier), sans saut de défilement
  const jump = (id) => {
    const entry = entryOf.get(id);
    if (!entry) return;
    folds.get(entry.level === 1 ? entry.id : entry.chapter)?.(true);
    const target = headings.get(id);
    target.scrollIntoView?.({ block: 'start' });
    target.focus?.({ preventScroll: true });
  };

  // Texte enrichi : `code`, [[renvoi]], [lien](https://…), posés un par un
  const rich = (text) => parseInline(text).map((part) => {
    if (part.code !== undefined) return h('code', { class: 'help__code-inline' }, part.code);
    if (part.ref !== undefined) {
      return h('a', {
        class: 'help__ref',
        href: `#/aide/${part.ref}`,
        onClick: (event) => {
          event.preventDefault();
          jump(part.ref);
        },
      }, refLabel(part.ref));
    }
    if (part.link !== undefined) return h('a', { href: part.href, target: '_blank', rel: 'noopener noreferrer' }, part.link);
    return part.text;
  });

  // Un bloc du guide (voir help-content.js)
  const block = (entry) => {
    if (typeof entry === 'string') return h('p', { class: 'help__text' }, rich(entry));
    if (entry.ul) return h('ul', { class: 'help__list' }, entry.ul.map((text) => h('li', {}, rich(text))));
    if (entry.ol) return h('ol', { class: 'help__list help__list--steps' }, entry.ol.map((text) => h('li', {}, rich(text))));
    if (entry.code !== undefined) return h('pre', { class: 'help__code' }, h('code', {}, entry.code));
    if (entry.note) return h('div', { class: 'note help__note-box' }, icon('alert'), h('p', {}, rich(entry.note)));
    if (entry.sub) return h('h4', { class: 'help__sub' }, rich(entry.sub));
    if (entry.table) return table(entry.table, rich);
    if (entry.who) return whoCanWhat();
    return null;
  };

  // Titre numéroté d'une section (focusable pour le saut depuis le sommaire)
  const sectionCard = (section) => {
    const title = h('h3', { class: 'help__title', id: anchorId(section.id), tabindex: '-1' }, numbered(entryOf.get(section.id)));
    headings.set(section.id, title);
    return h('section', { class: 'card help__topic', 'aria-labelledby': anchorId(section.id) },
      title,
      section.server ? h('p', { class: 'help__server' }, icon('wrench', 'icon--xs'), SERVER_NOTE) : null,
      (section.blocks ?? []).map(block));
  };

  // Chapitre repliable (même composant que les groupes d'une liste)
  const chapterPart = (chapter, open) => {
    const bodyId = `${anchorId(chapter.id)}-contenu`;
    const content = h('div', { class: 'help__section', id: bodyId },
      chapter.server ? h('p', { class: 'help__server' }, icon('wrench', 'icon--xs'), SERVER_NOTE) : null,
      (chapter.blocks ?? []).length ? h('div', { class: 'card help__topic' }, chapter.blocks.map(block)) : null,
      (chapter.sections ?? []).map(sectionCard));
    const toggle = h('button', { class: 'aisle__toggle', type: 'button', 'aria-controls': bodyId },
      icon('chev-d', 'icon--sm'), h('span', { class: 'aisle__name' }, numbered(entryOf.get(chapter.id))));
    const show = (on) => {
      toggle.setAttribute('aria-expanded', String(on));
      content.hidden = !on;
    };
    toggle.addEventListener('click', () => show(toggle.getAttribute('aria-expanded') !== 'true'));
    show(open);
    folds.set(chapter.id, show);
    const title = h('h2', { class: 'aisle aisle--fold', id: anchorId(chapter.id), tabindex: '-1' }, toggle);
    headings.set(chapter.id, title);
    return h('section', { class: 'help__part' }, title, content);
  };

  body.append(...GUIDE.map((chapter, index) => chapterPart(chapter, index === 0)));

  // Section en cours : le dernier titre visible déjà arrivé en haut de
  // l'écran (sous l'en-tête collé du chapitre : sa marge de défilement)
  const currentId = () => {
    const top = body.getBoundingClientRect?.().top ?? 0;
    let current = entries[0].id;
    for (const entry of entries) {
      const el = headings.get(entry.id);
      if (!el || el.closest?.('[hidden]')) continue;
      const margin = parseFloat(globalThis.getComputedStyle?.(el).scrollMarginTop) || 0;
      if (el.getBoundingClientRect().top - top <= margin + 24) current = entry.id;
    }
    return current;
  };

  // Bouton « Sommaire » et sa feuille
  const tocButton = h('button', {
    class: 'fab help__toc-btn',
    type: 'button',
    'aria-label': 'Sommaire du guide',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  }, icon('layers'), 'Sommaire');
  tocButton.addEventListener('click', () => openToc());

  function openToc() {
    const here = currentId();
    let target = null; // entrée touchée : saut après la fermeture
    const choose = (id) => {
      target = id;
      sheet.close();
    };
    const entryButton = (entry) => {
      const current = entry.id === here;
      return h('button', {
        class: `help-toc__entry help-toc__entry--${entry.level}${current ? ' is-current' : ''}`,
        type: 'button',
        'aria-current': current ? 'location' : null,
        onClick: () => choose(entry.id),
      },
      current ? icon('chev-r', 'icon--sm') : null,
      h('span', {}, numbered(entry)),
      current ? h('span', { class: 'visually-hidden' }, ' (section en cours)') : null);
    };
    const chapters = entries.filter((e) => e.level === 1);
    const content = h('nav', { class: 'help-toc', 'aria-label': 'Sommaire' },
      h('button', { class: 'help-toc__entry help-toc__top', type: 'button', onClick: () => choose('top') }, icon('arrow-up', 'icon--sm'), h('span', {}, 'Haut de page')),
      h('ol', { class: 'help-toc__list' }, chapters.map((chapter) => h('li', {},
        entryButton(chapter),
        h('ol', { class: 'help-toc__list help-toc__list--sub' },
          entries.filter((e) => e.chapter === chapter.id).map((section) => h('li', {}, entryButton(section))))))));
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
            body.scrollTo?.({ top: 0 });
            topTitle.focus?.({ preventScroll: true });
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
    body,
    tocButton);

  // Adresse #/aide/<section> : la section s'ouvre une fois l'écran affiché
  if (sectionId && entryOf.has(sectionId)) requestAnimationFrame(() => jump(sectionId));
  return screen;
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
function whoCanWhat() {
  return h('div', { class: 'help-who' },
    h('div', { class: 'group' }, PERMISSIONS.map((permission) => h('div', { class: 'help-who__row' },
      h('p', { class: 'help-who__action' }, permission.action),
      h('ul', { class: 'help-who__roles' }, ROLES.map((role) => {
        const yes = permission.roles.includes(role.key);
        return h('li', { class: `chip help-who__role${yes ? ' help-who__role--yes' : ' help-who__role--no'}` },
          icon(yes ? 'check' : 'close', 'icon--xs'),
          h('span', {}, role.label),
          h('span', { class: 'visually-hidden' }, yes ? ' : oui' : ' : non'));
      }))))),
    h('p', { class: 'help__note' }, PERMISSIONS_NOTE));
}
