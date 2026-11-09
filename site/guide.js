// Page publique du guide : recherche, bouton « Sommaire » et sa feuille.
// Sans JavaScript, la page reste complète : le sommaire est aussi écrit en
// haut de la page (<details> natifs), et ses liens mènent aux sections
// (ancres stables). Avec JavaScript :
// - « Rechercher dans le guide » : recherche en direct dans les titres et
//   le texte, majuscules et accents ignorés (search.js, le même module que
//   l'application) ; chapitres et sections sans résultat masqués, texte
//   trouvé surligné (<mark class="hit">, posé en DOM), « N résultats »
//   annoncé (role=status), message quand il n'y a rien ; Échap ou la croix
//   effacent tout ;
// - le bouton flottant « Sommaire » apparaît (aria-expanded suit la feuille) ;
//   il ouvre la feuille (<dialog> natif : Échap la ferme, le reste de la page
//   devient inerte) : les chapitres seulement, chacun un bouton qui déplie
//   ses sections (un seul à la fois), le chapitre de la section en cours
//   déplié au départ et la section en cours repérée (aria-current, flèche,
//   texte en gras : jamais la couleur seule) ;
// - toucher une entrée ferme la feuille (et efface une recherche en cours),
//   fait défiler jusqu'au titre et lui donne le focus ; Échap ou la croix
//   rendent le focus au bouton.
// Aucun appel à un autre site ; textes posés par le HTML de la page.
// Fichier source : scripts/site-assets/guide.js (site/ est fabriqué).

import { highlightParts, matches, isSearching, resultsLabel } from './search.js';

// --- Recherche ---
const search = document.getElementById('guide-recherche');
const field = document.getElementById('guide-recherche-champ');
const main = document.getElementById('contenu');
const empty = document.getElementById('guide-recherche-vide');
const pageToc = document.querySelector('.site__toc');
let query = '';

// Retire les surlignages (le texte d'origine revient tel quel)
function unmark() {
  for (const mark of main.querySelectorAll('mark.hit')) mark.replaceWith(document.createTextNode(mark.textContent));
  main.normalize();
}

// Surligne le texte cherché dans un élément, nœud de texte par nœud de texte
function markIn(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parts = highlightParts(node.data, query);
    if (!parts.some((part) => part.hit)) continue;
    const pieces = parts.map((part) => {
      if (!part.hit) return document.createTextNode(part.text);
      const mark = document.createElement('mark');
      mark.className = 'hit';
      mark.textContent = part.text;
      return mark;
    });
    node.replaceWith(...pieces);
  }
}

function runSearch(value) {
  query = value;
  unmark();
  const active = isSearching(query);
  search.querySelector('[data-clear]').hidden = value === '';
  pageToc.hidden = active;
  let count = 0;
  for (const part of main.querySelectorAll('.help__part')) {
    const title = part.querySelector('.help__chapter');
    const cards = [...part.querySelectorAll('.help__topic')];
    if (!active) {
      part.hidden = false;
      for (const card of cards) card.hidden = false;
      continue;
    }
    const titleHit = matches(title.textContent, query);
    const hits = cards.filter((card) => matches(card.textContent, query));
    count += hits.length || (titleHit ? 1 : 0);
    part.hidden = !titleHit && !hits.length;
    for (const card of cards) card.hidden = !titleHit && !hits.includes(card);
    if (!part.hidden) {
      markIn(title);
      for (const card of cards) if (!card.hidden) markIn(card);
    }
  }
  empty.hidden = !active || count > 0;
  search.querySelector('[role=status]').textContent = active ? resultsLabel(count) : '';
}

if (search && field && main) {
  search.hidden = false;
  field.addEventListener('input', () => runSearch(field.value));
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && field.value !== '') {
      event.preventDefault();
      field.value = '';
      runSearch('');
    }
  });
  // Croix : un appui ne retire pas le curseur du champ (s'il y était) ;
  // jamais de curseur mis de force
  const clear = search.querySelector('[data-clear]');
  clear.addEventListener('pointerdown', (event) => { if (document.activeElement === field) event.preventDefault(); });
  clear.addEventListener('mousedown', (event) => { if (document.activeElement === field) event.preventDefault(); });
  clear.addEventListener('click', () => {
    field.value = '';
    runSearch('');
  });
}

// --- Sommaire ---
const button = document.getElementById('sommaire-bouton');
const sheet = document.getElementById('sommaire');
if (button && sheet && typeof sheet.showModal === 'function') {
  const entries = [...sheet.querySelectorAll('a[data-section]')];
  const chapters = [...sheet.querySelectorAll('button[data-chapter]')];
  let target = null;

  // Section en cours : le dernier titre visible déjà arrivé en haut de
  // l'écran (sous l'en-tête collé du chapitre : sa marge de défilement)
  const currentId = () => {
    const headings = [...main.querySelectorAll('.help__chapter, .help__title')];
    let current = headings[0]?.id;
    for (const el of headings) {
      if (el.closest('[hidden]')) continue;
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (el.getBoundingClientRect().top <= margin + 24) current = el.id;
    }
    return current;
  };

  // Déplie un chapitre de la feuille (et replie les autres)
  const unfold = (chapterButton, on) => {
    for (const other of chapters) {
      const open = other === chapterButton && on;
      other.setAttribute('aria-expanded', String(open));
      document.getElementById(other.getAttribute('aria-controls')).hidden = !open;
    }
  };
  for (const chapterButton of chapters) {
    chapterButton.addEventListener('click', () => unfold(chapterButton, chapterButton.getAttribute('aria-expanded') !== 'true'));
  }

  // Repère l'entrée en cours (une section, ou « Aller au chapitre » pour un
  // chapitre) et déplie son chapitre
  const mark = (id) => {
    let chapterOfCurrent = null;
    for (const a of entries) {
      const current = a.dataset.section === id;
      a.classList.toggle('is-current', current);
      if (current) {
        a.setAttribute('aria-current', 'location');
        chapterOfCurrent = a.closest('ol').previousElementSibling;
      } else {
        a.removeAttribute('aria-current');
      }
      a.querySelector('.help-toc__mark').hidden = !current;
      a.querySelector('.visually-hidden').hidden = !current;
    }
    unfold(chapterOfCurrent, Boolean(chapterOfCurrent));
  };

  // Défile jusqu'au titre et lui donne le focus ; l'adresse garde l'ancre
  const jump = (id) => {
    if (query) {
      field.value = '';
      runSearch('');
    }
    const el = document.getElementById(id);
    if (!el) return;
    // « Haut de page » : tout en haut, logo compris
    if (id === 'haut') window.scrollTo({ top: 0 });
    else el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
    history.replaceState(null, '', `#${id}`);
  };

  button.hidden = false;
  button.addEventListener('click', () => {
    target = null;
    mark(currentId());
    sheet.showModal();
    button.setAttribute('aria-expanded', 'true');
    sheet.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
  });
  sheet.querySelector('[data-close]').addEventListener('click', () => sheet.close());
  // Toucher le fond grisé ferme aussi la feuille
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) sheet.close();
  });
  for (const a of sheet.querySelectorAll('a[href^="#"]')) {
    a.addEventListener('click', (event) => {
      event.preventDefault();
      target = a.getAttribute('href').slice(1);
      sheet.close();
    });
  }
  sheet.addEventListener('close', () => {
    button.setAttribute('aria-expanded', 'false');
    if (target) jump(target);
    else button.focus();
    target = null;
  });
}
