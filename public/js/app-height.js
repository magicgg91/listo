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
//   clavier, sans bande vide. Dans ce cas seulement, l'attribut
//   data-keyboard="open" est posé sur <html> : le bas de l'application
//   touche alors le clavier, et le trait de l'iPhone (marge de sécurité du
//   bas, env(safe-area-inset-bottom)) est caché derrière lui. app.css retire
//   donc cette marge des barres du bas (barre d'ajout, feuilles, boutons
//   « Enregistrer »…) ; elle revient quand le clavier se ferme.
// Le décalage est relu pendant que le clavier s'anime (visualViewport
// « scroll » et « resize »), à l'entrée et à la sortie d'un champ (focusin,
// focusout), puis un peu plus tard (mêmes relectures décalées). Clavier
// fermé : décalage à zéro, hauteur de base, et la page revient tout en haut
// si elle avait défilé. La hauteur est aussi relue si la largeur change
// (rotation).
//
// Appui en cours (doigt posé, ou bouton de la souris enfoncé) : la page ne
// bouge jamais pendant un appui. Une nouvelle mesure demandée pendant ce
// temps attend la FIN de l'appui, puis s'applique une seule fois. La fin de
// l'appui, c'est le click qui suit le relâchement (et pas le relâchement
// lui-même) : au toucher d'un bouton, le navigateur envoie pointerup, puis
// mousedown (c'est là que le champ perd le curseur et que le clavier se
// replie), mouseup et click. Si la page bougeait au mousedown, le click
// tombait à côté du bouton (deux appuis nécessaires : disquette, croix,
// « Ajouter une photo » d'une fiche, avec un champ actif). Donc :
// - pointerdown : appui en cours ;
// - click (juste après qu'il a été traité) : fin de l'appui ;
// - pointerup sans click (doigt glissé hors du bouton…) : fin de l'appui
//   au bout de 400 ms ;
// - pointercancel (le doigt fait défiler la page) : fin de l'appui aussitôt ;
// - délai de sécurité : un appui ne bloque jamais plus de 2 s.
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
  // fit : suivre le clavier même sans décalage (iPhone, tous les champs ;
  // ailleurs, attribut data-fit-keyboard : texte d'une note ; 23 novembre
  // 2026, « le haut de l'écran saute » à l'ouverture du clavier). La
  // zone visible rétrécit dès que le clavier s'ouvre (visualViewport.height
  // plus petit) : l'application la recouvre tout de suite, le haut reste en
  // place et le texte défile dans la zone au-dessus du clavier, au lieu que
  // l'iPhone fasse remonter toute la page quand le curseur descend.
  function keyboardShift(win, typing, fit) {
    var vv = win.visualViewport;
    if (!typing || !vv || !(vv.height > 0)) return null;
    var offsetTop = vv.offsetTop > 0 ? vv.offsetTop : 0;
    if (offsetTop > 0 || win.scrollY > 0) return { top: offsetTop, height: vv.height };
    if (fit && vv.height < win.innerHeight) return { top: 0, height: vv.height };
    return null;
  }

  // Hauteur du clavier gardée sur l'appareil (localStorage, peut manquer :
  // navigation privée), pour la prochaine ouverture
  var KEYBOARD_KEY = 'listo.clavier';
  function readKeyboard(win) {
    try {
      var value = Number(win.localStorage && win.localStorage.getItem(KEYBOARD_KEY));
      return value > 100 ? value : 0;
    } catch (error) {
      return 0;
    }
  }
  function saveKeyboard(win, value) {
    try {
      if (win.localStorage) win.localStorage.setItem(KEYBOARD_KEY, String(Math.round(value)));
    } catch (error) {
      // rien : la hauteur sera remesurée à la prochaine ouverture
    }
  }

  // win, doc : la fenêtre et la page (de faux objets dans les tests)
  function start(win, doc) {
    var root = doc.documentElement;
    // iPhone et iPad : seul Safari d'Apple a navigator.standalone (aucune
    // marque ni modèle lus : une propriété que lui seul connaît)
    var ios = Boolean(win.navigator) && typeof win.navigator.standalone === 'boolean';
    // Hauteur du clavier déjà vue (iPhone) : à l'entrée dans un champ,
    // l'application se cale tout de suite au-dessus de l'endroit où le
    // clavier va s'ouvrir ; le champ y est déjà visible, l'iPhone ne fait
    // donc pas remonter toute la page et le haut de l'écran ne saute pas.
    // Première ouverture sur l'appareil : comportement d'avant, puis la
    // hauteur est retenue.
    var keyboardHeight = ios ? readKeyboard(win) : 0;
    var preparing = false; // un champ vient de prendre le curseur, clavier attendu
    var last = null;      // dernière hauteur écrite (« 803.5px »)
    var baseHeight = 0;   // hauteur hors décalage, en nombre (celle d'avant le clavier)
    var lastWidth = null; // largeur au moment de cette mesure
    var lastTop = '0px';  // dernier décalage écrit (0 au départ, sans rien écrire)
    var keyboardOpen = false; // data-keyboard posé sur <html>

    var held = false;     // un appui est en cours : rien ne bouge
    var heldAt = 0;       // depuis quand (un appui ne bloque pas plus de 2 s)
    var waiting = false;  // une mesure attend la fin de l'appui
    var tap = 0;          // numéro de l'appui (les fins prévues d'un ancien appui sont ignorées)
    var HOLD_MAX_MS = 2000;
    var CLICK_WAIT_MS = 400; // après le relâchement, attente du click

    var px = function (value) { return Math.round(value * 100) / 100 + 'px'; };

    function measure() {
      if (doc.visibilityState === 'hidden') return; // en arrière-plan : mesure peu fiable
      if (held && Date.now() - heldAt < HOLD_MAX_MS) { // jamais pendant un appui : à sa fin
        waiting = true;
        return;
      }
      var typing = isTextField(doc.activeElement);
      var scrolled = win.scrollY > 0;
      var width = win.innerWidth;
      var top = 0;
      var height;
      var fit = typing && (ios || Boolean(doc.activeElement.hasAttribute && doc.activeElement.hasAttribute('data-fit-keyboard')));
      var shift = keyboardShift(win, typing, fit);
      if (!typing) preparing = false;
      if (shift) {
        // Zone visible décalée ou rétrécie par le clavier : la recouvrir
        // exactement
        top = shift.top;
        height = shift.height;
        preparing = false;
        // iPhone : hauteur du clavier retenue pour la prochaine fois
        if (ios && baseHeight > 0 && baseHeight - shift.height > 100 && Math.abs(baseHeight - shift.height - keyboardHeight) > 1) {
          keyboardHeight = baseHeight - shift.height;
          saveKeyboard(win, keyboardHeight);
        }
      } else if (ios && typing && preparing && keyboardHeight > 0 && baseHeight > keyboardHeight) {
        // Clavier attendu (iPhone) : place faite tout de suite
        shift = { top: 0, height: baseHeight - keyboardHeight };
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
      if (top === 0 && !shift) baseHeight = height;
      var topValue = px(top);
      if (topValue !== lastTop) { // valeur identique : rien à réécrire
        lastTop = topValue;
        root.style.setProperty('--app-top', topValue);
      }
      // Clavier ouvert, bas de l'application contre le clavier : marge de
      // sécurité du bas retirée (app.css)
      if (Boolean(shift) !== keyboardOpen) {
        keyboardOpen = Boolean(shift);
        if (keyboardOpen) root.setAttribute('data-keyboard', 'open');
        else root.removeAttribute('data-keyboard');
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

    // Fin de l'appui : la mesure en attente s'applique, une seule fois
    function release() {
      held = false;
      tap += 1;
      if (waiting) {
        waiting = false;
        measure();
      }
    }
    // Fin de l'appui en cours dans ms millisecondes (sauf si un autre appui
    // a commencé entre-temps)
    function releaseLater(ms) {
      var id = tap;
      win.setTimeout(function () {
        if (id === tap && held) release();
      }, ms);
    }

    // Début et fin d'un appui (avant tout autre écouteur : phase de capture)
    doc.addEventListener('pointerdown', function () {
      tap += 1;
      held = true;
      heldAt = Date.now();
      releaseLater(HOLD_MAX_MS); // délai de sécurité
    }, true);
    doc.addEventListener('pointerup', function () {
      if (held) releaseLater(CLICK_WAIT_MS); // si aucun click ne suit
    }, true);
    doc.addEventListener('click', function () {
      if (held) releaseLater(0); // juste après le traitement du click
    }, true);
    doc.addEventListener('pointercancel', function () {
      if (held) release();
    }, true);

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
    doc.addEventListener('focusin', function () {
      if (isTextField(doc.activeElement)) preparing = true;
      measureSoon();
    });
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
