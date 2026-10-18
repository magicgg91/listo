// Android : garder la page AU-DESSUS de la barre de navigation du système.
//
// Pourquoi : index.html demande viewport-fit=cover, nécessaire sur iPhone
// (la page s'étend sous l'indicateur d'accueil, et env(safe-area-inset-bottom)
// donne la place à laisser). Sur Android 15 et plus, l'application installée
// (mode autonome) est dessinée « bord à bord » : avec viewport-fit=cover, la
// page passe sous la barre de navigation, mais le navigateur ne donne pas sa
// hauteur à env(safe-area-inset-bottom) (constaté : Brave, barre à 3
// boutons) ; le bouton « Nouvelle liste » et la barre d'ajout étaient
// coupés. Sans viewport-fit=cover, Android garde la page au-dessus de la
// barre, comme dans un onglet du navigateur.
//
// Ce script classique (pas un module) est chargé tout en haut de la page,
// avant les styles : il agit avant le premier affichage. Fichier à part, pas
// de script écrit dans la page : la Content-Security-Policy reste stricte.
// iPhone, ordinateur et autres : rien ne change.
(function () {
  // Contenu de la balise viewport sans « viewport-fit=… » (calcul pur)
  function withoutCover(content) {
    return String(content).split(',').map(function (part) { return part.trim(); })
      .filter(function (part) { return part && !/^viewport-fit\s*=/i.test(part); }).join(', ');
  }
  try {
    if (!/Android/i.test(navigator.userAgent)) return;
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', withoutCover(meta.getAttribute('content')));
  } catch (error) {
    // en cas de souci, la page reste telle quelle
  }
}());
