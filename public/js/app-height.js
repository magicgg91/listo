// Hauteur de l'application = hauteur VISIBLE de l'écran, remesurée.
//
// Pourquoi : la hauteur venait seulement du CSS (« 100dvh »). Sur Android,
// application installée, après avoir réduit Listo puis l'avoir rouvert, le
// navigateur garde parfois une ancienne hauteur : le bas de la page (bouton
// « Nouvelle liste », barre d'ajout) passe sous la barre de navigation.
//
// Ce que fait ce script : il mesure la hauteur visible
// (window.visualViewport.height, sinon window.innerHeight) et l'écrit dans
// la variable CSS --app-h de <html> ; app.css s'en sert (.app { height:
// var(--app-h, 100dvh) }). Il remesure à chaque changement de taille, au
// retour au premier plan (visibilitychange, pageshow, focus), à la rotation,
// puis relit un peu plus tard (image suivante, ~100 ms, ~300 ms, ~1 s) : au
// retour, Android donne parfois la bonne hauteur en retard. Une valeur
// identique n'est pas réécrite. Aucune marque, aucun modèle, aucune hauteur
// de barre écrite à l'avance : seulement ce que le navigateur mesure.
//
// Clavier ouvert (curseur dans un champ), deux cas, mesurés (aucune marque
// ni modèle) :
// - la zone visible n'est PAS décalée (visualViewport.offsetTop = 0 et la
//   page n'a pas défilé ; cas d'Android aujourd'hui) : comme avant ce script.
//   Le plus souvent (Chrome, Brave, Samsung Internet…), le clavier recouvre
//   la page sans la rétrécir : la hauteur ne change pas. Dans un navigateur
//   où le clavier rétrécit la page elle-même (window.innerHeight plus petit,
//   par exemple Firefox), elle suit, comme 100dvh ;
// - la zone visible EST décalée (visualViewport.offsetTop > 0 ou
//   window.scrollY > 0 ; cas de l'iPhone, qui fait remonter la zone visible
//   pour garder le champ au-dessus du clavier) : l'application recouvre
//   exactement la zone visible. --app-top = offsetTop (position verticale de
//   .app), --app-h = visualViewport.height. La barre du haut reste donc
//   visible, la liste se raccourcit, le champ reste juste au-dessus du
//   clavier, sans bande vide.
// Le décalage est relu pendant que le clavier s'anime (visualViewport
// « scroll » et « resize »), à l'entrée et à la sortie d'un champ (focusin,
// focusout), puis un peu plus tard (mêmes relectures décalées). Clavier
// fermé : décalage à zéro, hauteur de base, et la page revient tout en haut
// si elle avait défilé. La hauteur est aussi relue si la largeur change
// (rotation).
//
// Doigt posé (ou bouton de la souris enfoncé) : la page ne bouge jamais
// sous le doigt. Une nouvelle mesure demandée pendant ce temps attend le
// relâchement (pointerup, pointercancel), puis s'applique aussitôt.
//
// Script classique (pas un module), fichier à part, chargé tout en haut de
// la page juste après viewport.js : la Content-Security-Policy reste stricte
// (une variable CSS posée par JavaScript n'est pas un style écrit dans la
// page). Sans ce script, ou s'il échoue, 100dvh s'applique comme avant.
(function () {
  var LATER_MS = [100, 300, 1000]; // relectures décalées après un retour

  // Champ de saisie (le clavier du téléphone est alors ouvert). Même règle
  // que isTextField de ui.js.
  function isTextField(element) {
    if (!element || !element.matches) return false;
    if (element.isContentEditable || element.matches('textarea')) return true;
    return element.matches('input') && ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image', 'hidden'].indexOf(element.type) === -1;
  }

  // Hauteur visible en pixels CSS. Zoom avec deux doigts : la zone visible
  // rétrécit (visualViewport.height), pas l'écran ; on remultiplie par le zoom.
  function visibleHeight(win) {
    var vv = win.visualViewport;
    if (vv && vv.height > 0) return vv.height * (vv.scale > 0 ? vv.scale : 1);
    return win.innerHeight;
  }

  // Compensation du clavier de l'iPhone, isolée ici : quand un champ a le
  // curseur et que la zone visible est décalée, renvoie la zone visible
  // { top, height } que l'application doit recouvrir ; sinon null (comportement
  // d'avant). Pour la retirer, il suffit que cette fonction renvoie null.
  function keyboardShift(win, typing) {
    var vv = win.visualViewport;
    if (!typing || !vv || !(vv.height > 0)) return null;
    var offsetTop = vv.offsetTop > 0 ? vv.offsetTop : 0;
    if (offsetTop > 0 || win.scrollY > 0) return { top: offsetTop, height: vv.height };
    return null;
  }

  // win, doc : la fenêtre et la page (de faux objets dans les tests)
  function start(win, doc) {
    var root = doc.documentElement;
    var last = null;      // dernière hauteur écrite (« 803.5px »)
    var baseHeight = 0;   // hauteur hors décalage, en nombre (celle d'avant le clavier)
    var lastWidth = null; // largeur au moment de cette mesure
    var lastTop = '0px';  // dernier décalage écrit (0 au départ, sans rien écrire)

    var held = false;     // un doigt est posé : rien ne bouge
    var heldAt = 0;       // depuis quand (un relâchement perdu ne bloque pas plus de 2 s)
    var waiting = false;  // une mesure attend le relâchement
    var HOLD_MAX_MS = 2000;

    var px = function (value) { return Math.round(value * 100) / 100 + 'px'; };

    function measure() {
      if (doc.visibilityState === 'hidden') return; // en arrière-plan : mesure peu fiable
      if (held && Date.now() - heldAt < HOLD_MAX_MS) { // jamais sous le doigt : après le relâchement
        waiting = true;
        return;
      }
      var typing = isTextField(doc.activeElement);
      var scrolled = win.scrollY > 0;
      var width = win.innerWidth;
      var top = 0;
      var height;
      var shift = keyboardShift(win, typing);
      if (shift) {
        // Zone visible décalée (clavier de l'iPhone) : recouvrir exactement
        // la zone visible
        top = shift.top;
        height = shift.height;
      } else {
        height = visibleHeight(win);
        // Clavier ouvert sans décalage (même largeur) : la hauteur reste,
        // sauf si la page elle-même rétrécit
        if (last !== null && typing && width === lastWidth) {
          height = Math.min(baseHeight, win.innerHeight);
        }
        // Clavier fermé : la page revient tout en haut si elle avait défilé
        if (!typing && scrolled && win.scrollTo) win.scrollTo(0, 0);
      }
      if (!(height > 0)) return;
      lastWidth = width;
      if (top === 0) baseHeight = height;
      var topValue = px(top);
      if (topValue !== lastTop) { // valeur identique : rien à réécrire
        lastTop = topValue;
        root.style.setProperty('--app-top', topValue);
      }
      var value = px(height);
      if (value === last) return; // valeur identique : rien à réécrire
      last = value;
      root.style.setProperty('--app-h', value);
    }

    // Mesure tout de suite, puis relit un peu plus tard
    function measureSoon() {
      measure();
      if (win.requestAnimationFrame) win.requestAnimationFrame(measure);
      for (var i = 0; i < LATER_MS.length; i += 1) win.setTimeout(measure, LATER_MS[i]);
    }

    // Doigt posé puis relâché (avant tout autre écouteur : phase de capture)
    doc.addEventListener('pointerdown', function () {
      held = true;
      heldAt = Date.now();
    }, true);
    var release = function () {
      held = false;
      if (waiting) {
        waiting = false;
        measure();
      }
    };
    doc.addEventListener('pointerup', release, true);
    doc.addEventListener('pointercancel', release, true);

    win.addEventListener('resize', measure);
    // Le décalage change pendant que le clavier s'anime
    if (win.visualViewport) {
      win.visualViewport.addEventListener('resize', measure);
      win.visualViewport.addEventListener('scroll', measure);
    }
    doc.addEventListener('visibilitychange', function () {
      held = false; // l'application a été quittée : aucun doigt ne reste posé
      if (doc.visibilityState !== 'hidden') measureSoon();
    });
    win.addEventListener('pageshow', measureSoon);
    win.addEventListener('focus', measureSoon);
    win.addEventListener('orientationchange', measureSoon);
    // Champ touché ou quitté : le clavier s'ouvre ou se ferme (en s'animant),
    // on relit tout de suite puis un peu plus tard
    doc.addEventListener('focusin', measureSoon);
    doc.addEventListener('focusout', measureSoon);
    measureSoon();
    return { measure: measure, measureSoon: measureSoon };
  }

  try {
    start(window, document);
  } catch (error) {
    // en cas de souci, 100dvh s'applique comme avant
  }
}());
