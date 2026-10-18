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
// Clavier ouvert (curseur dans un champ) : comme avant ce script. Le plus
// souvent (Chrome, Brave, Samsung Internet…), le clavier recouvre la page
// sans la rétrécir : la hauteur ne change pas. Dans un navigateur où le
// clavier rétrécit la page elle-même (window.innerHeight plus petit, par
// exemple Firefox), elle suit, comme 100dvh. Elle est relue quand le champ
// est quitté, ou si la largeur change (rotation).
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

  // win, doc : la fenêtre et la page (de faux objets dans les tests)
  function start(win, doc) {
    var root = doc.documentElement;
    var last = null;      // dernière valeur écrite (« 803.5px »)
    var lastHeight = 0;   // la même, en nombre
    var lastWidth = null; // largeur au moment de cette mesure

    function measure() {
      if (doc.visibilityState === 'hidden') return; // en arrière-plan : mesure peu fiable
      var height = visibleHeight(win);
      var width = win.innerWidth;
      // Clavier ouvert (même largeur) : la hauteur reste, sauf si la page
      // elle-même rétrécit
      if (last !== null && isTextField(doc.activeElement) && width === lastWidth) {
        height = Math.min(lastHeight, win.innerHeight);
      }
      if (!(height > 0)) return;
      lastWidth = width;
      var value = Math.round(height * 100) / 100 + 'px';
      if (value === last) return; // valeur identique : rien à réécrire
      last = value;
      lastHeight = height;
      root.style.setProperty('--app-h', value);
    }

    // Mesure tout de suite, puis relit un peu plus tard
    function measureSoon() {
      measure();
      if (win.requestAnimationFrame) win.requestAnimationFrame(measure);
      for (var i = 0; i < LATER_MS.length; i += 1) win.setTimeout(measure, LATER_MS[i]);
    }

    win.addEventListener('resize', measure);
    if (win.visualViewport) win.visualViewport.addEventListener('resize', measure);
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState !== 'hidden') measureSoon();
    });
    win.addEventListener('pageshow', measureSoon);
    win.addEventListener('focus', measureSoon);
    win.addEventListener('orientationchange', measureSoon);
    // Champ quitté : le clavier se ferme (en s'animant), on relit
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
