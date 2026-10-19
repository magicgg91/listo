// Choix « au relâchement du doigt » pour la liste de suggestions du champ
// d'ajout et pour son bouton « + » (aucune dépendance à la page : testé avec
// de faux événements).
//
// Pourquoi : sur iPhone, clavier ouvert, un appui sur une suggestion ne
// faisait plus rien. Le « click » arrive après le relâchement, à l'endroit
// touché ; si la page a bougé entre-temps (zone visible qui remonte, clavier
// qui s'anime, liste redessinée ou fermée), il tombe à côté. Le pointerup,
// lui, est toujours envoyé au bouton où le doigt s'est posé.
//
// - Le choix se fait au pointerup sur le bouton où le doigt s'est posé ; le
//   click reste en secours (souris, clavier, lecteur d'écran) : un seul choix.
// - pointerdown : preventDefault (et mousedown aussi) : le champ garde le
//   curseur, le clavier reste ouvert.
// - pressing : vrai pendant qu'un doigt est posé sur une suggestion ; l'écran
//   ne redessine ni ne ferme la liste pendant ce temps.
// - Après un choix au relâchement, le click qui suit est ignoré une demi-
//   seconde : la liste s'étant fermée, il tomberait sur ce qu'il y avait
//   dessous (une ligne de la liste, le fond d'une feuille…).
//
// Bouton « + » (option persistent : le bouton reste à l'écran) : même
// mécanisme, avec deux différences. Il sert à chaque appui (pas une seule
// fois). Un doigt posé sur le bouton puis relâché ailleurs n'ajoute rien, et
// le click qui suit ce relâchement est ignoré aussi.
//
// Pourquoi pour « + » : sans cela, le champ perd le curseur dès l'appui ;
// app-height.js remesure aussitôt la page (le clavier se replie), la barre
// d'ajout bouge, et le click tombe à côté : il fallait toucher « + » deux fois.

// Garde le curseur dans le champ pendant un appui sur un bouton voisin
// (bouton « Scanner ») : le click arrive alors bien sur le bouton.
export const keepFieldFocus = {
  pointerdown(event) {
    event.preventDefault();
  },
  mousedown(event) {
    event.preventDefault();
  },
};

// Le point du relâchement est-il sur le bouton (position prise à l'appui) ?
function isInside(rect, event) {
  if (!rect || typeof event?.clientX !== 'number') return true;
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

export function createTapPicker({ now = () => Date.now(), ghostMs = 500 } = {}) {
  let pressing = false;
  let ignoreClickUntil = 0;
  return {
    get pressing() {
      return pressing;
    },
    // Écouteurs d'un bouton : { pointerdown, mousedown, pointerup, pointercancel, click }
    // persistent : bouton qui reste à l'écran (« + »), voir plus haut
    button(onPick, { persistent = false } = {}) {
      let down = false;   // le doigt s'est posé sur CE bouton
      let picked = false; // déjà choisi : jamais deux fois (suggestion)
      let rect = null;    // persistent : position du bouton à l'appui
      let skipClickUntil = 0; // persistent : le click qui suit un relâchement est ignoré
      const pick = (released) => {
        if (picked) return;
        if (!persistent) picked = true;
        pressing = false;
        if (released) ignoreClickUntil = now() + ghostMs;
        onPick();
      };
      return {
        pointerdown(event) {
          keepFieldFocus.pointerdown(event);
          down = true;
          pressing = true;
          if (persistent) rect = event.currentTarget?.getBoundingClientRect?.() ?? null;
        },
        mousedown: keepFieldFocus.mousedown,
        pointerup(event) {
          if (!down) return;
          if (!persistent) {
            pick(true);
            return;
          }
          down = false;
          skipClickUntil = now() + ghostMs;
          if (isInside(rect, event)) pick(true);
        },
        pointercancel() {
          down = false;
        },
        click(event) {
          if (persistent) {
            // Bouton de formulaire : l'action est faite ici, jamais aussi
            // par l'envoi du formulaire
            event?.preventDefault();
            if (now() < skipClickUntil) {
              skipClickUntil = 0;
              return;
            }
          }
          pick(false);
        },
      };
    },
    // Relâchement n'importe où (document, après le bouton) : vrai si un
    // toucher sur une suggestion vient de se terminer sans choix
    release() {
      if (!pressing) return false;
      pressing = false;
      return true;
    },
    // Écouteur de click sur le document (phase de capture)
    ghostClick(event) {
      if (now() < ignoreClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
      ignoreClickUntil = 0;
    },
  };
}
