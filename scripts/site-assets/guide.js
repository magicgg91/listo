// Page publique du guide : le bouton « Sommaire » et sa feuille.
// Sans JavaScript, la page reste complète : le sommaire est aussi écrit en
// haut de la page, et ses liens mènent aux sections (ancres stables).
// Avec JavaScript :
// - le bouton flottant « Sommaire » apparaît (aria-expanded suit la feuille) ;
// - il ouvre la feuille (<dialog> natif : Échap la ferme, le reste de la page
//   devient inerte) avec la section en cours repérée (aria-current, flèche,
//   texte en gras : jamais la couleur seule) ;
// - toucher une entrée ferme la feuille, fait défiler jusqu'au titre et lui
//   donne le focus ; Échap ou la croix rendent le focus au bouton.
// Aucun appel à un autre site ; textes posés par le HTML de la page.
// Fichier source : scripts/site-assets/guide.js (site/ est fabriqué).

(() => {
  const button = document.getElementById('sommaire-bouton');
  const sheet = document.getElementById('sommaire');
  if (!button || !sheet || typeof sheet.showModal !== 'function') return;
  const entries = [...sheet.querySelectorAll('a[data-section]')];
  const headings = entries.map((a) => document.getElementById(a.dataset.section)).filter(Boolean);
  let target = null;

  // Section en cours : le dernier titre déjà arrivé en haut de l'écran
  // (sous l'en-tête collé du chapitre : sa marge de défilement)
  const currentId = () => {
    let current = headings[0]?.id;
    for (const el of headings) {
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (el.getBoundingClientRect().top <= margin + 24) current = el.id;
    }
    return current;
  };

  const mark = (id) => {
    for (const a of entries) {
      const on = a.dataset.section === id;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
      a.querySelector('.help-toc__mark').hidden = !on;
      a.querySelector('.visually-hidden').hidden = !on;
    }
  };

  // Défile jusqu'au titre et lui donne le focus ; l'adresse garde l'ancre
  const jump = (id) => {
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
})();
