// Accueil : quand tout son contenu tient dans l'écran, la zone ne doit ni
// défiler ni rebondir (l'effet « élastique » de l'iPhone compris ; décision
// du propriétaire du 23 novembre 2026). Quand il ne tient pas (petit
// téléphone, beaucoup de tuiles), elle défile normalement.
//
// La zone est mesurée à chaque changement de taille (la sienne, celle de
// son contenu : ResizeObserver) et après chaque dessin de l'écran ; la classe
// .scroll--fits la bloque alors (listo.css, section 16.30 :
// overflow-y: hidden). Seul l'Accueil s'en sert : les autres écrans ne
// changent pas.

// Le contenu tient-il dans la zone ? (1 px de marge : arrondis du
// navigateur). slack : la marge du bas de la zone (padding-bottom), qui
// n'est que de l'espace vide : si seule elle dépasse, tout tient quand même
// et l'écran ne doit pas défiler pour si peu
export const contentFits = (scrollHeight, clientHeight, slack = 0) => scrollHeight <= clientHeight + 1 + slack;

// Marge du bas de la zone, en px (0 si le navigateur ne sait pas la dire)
function bottomPadding(el) {
  if (typeof getComputedStyle !== 'function' || typeof Element === 'undefined' || !(el instanceof Element)) return 0;
  return parseFloat(getComputedStyle(el).paddingBottom) || 0;
}

// Pose ou retire .scroll--fits sur la zone (el : élément, ou tout objet qui
// a scrollHeight, clientHeight et classList). Renvoie vrai si tout tient.
export function markFit(el) {
  const fits = contentFits(el.scrollHeight, el.clientHeight, bottomPadding(el));
  el.classList.toggle('scroll--fits', fits);
  return fits;
}

// Surveille la zone (scroller) et son contenu (inner). Renvoie
// { update(), stop() } : update après un dessin, stop en quittant l'écran.
export function lockWhenFits(scroller, inner = null) {
  let frame = 0;
  // Mesure à l'image suivante : l'écran est alors posé
  const update = () => {
    if (typeof requestAnimationFrame !== 'function') {
      markFit(scroller);
      return;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => markFit(scroller));
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
  observer?.observe(scroller);
  if (inner) observer?.observe(inner);
  globalThis.addEventListener?.('resize', update);
  return {
    update,
    stop() {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      observer?.disconnect();
      globalThis.removeEventListener?.('resize', update);
    },
  };
}
