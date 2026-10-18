// Choix « au relâchement du doigt » pour la liste de suggestions du champ
// d'ajout (aucune dépendance à la page : testé avec de faux événements).
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
export function createTapPicker({ now = () => Date.now(), ghostMs = 500 } = {}) {
  let pressing = false;
  let ignoreClickUntil = 0;
  return {
    get pressing() {
      return pressing;
    },
    // Écouteurs d'un bouton : { pointerdown, mousedown, pointerup, pointercancel, click }
    button(onPick) {
      let down = false;   // le doigt s'est posé sur CE bouton
      let picked = false; // déjà choisi : jamais deux fois
      const pick = (released) => {
        if (picked) return;
        picked = true;
        pressing = false;
        if (released) ignoreClickUntil = now() + ghostMs;
        onPick();
      };
      return {
        pointerdown(event) {
          event.preventDefault();
          down = true;
          pressing = true;
        },
        mousedown(event) {
          event.preventDefault();
        },
        pointerup() {
          if (down) pick(true);
        },
        pointercancel() {
          down = false;
        },
        click() {
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
