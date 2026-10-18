// Thème de Listo posé AVANT le premier affichage.
//
// Pourquoi : sur iPhone (application installée), à l'ouverture à froid, le
// bandeau du haut (heure, encoche, îlot dynamique) prenait la couleur du mode
// du TÉLÉPHONE (sombre) au lieu du thème choisi dans Listo (clair) : le thème
// n'était posé que plus tard, par app.js.
//
// Ce que fait ce script : il lit le thème enregistré (même clé que
// js/theme.js : « listo-theme », clair, sombre ou auto) et écrit tout de
// suite :
// - data-theme sur <html> (couleurs de listo.css) ;
// - <meta name="color-scheme"> : « light », « dark », ou « light dark » en
//   automatique (contrôles et clavier du téléphone dans le bon thème) ;
// - <meta name="theme-color"> (deux balises, une par mode du téléphone) :
//   la couleur de fond du thème choisi ; en automatique, chacune garde la
//   couleur de son mode.
// Sans thème enregistré, ou stockage indisponible : automatique (suit le
// téléphone), comme avant.
//
// Script classique (pas un module), fichier à part, chargé tout en haut de
// <head> : la Content-Security-Policy reste stricte. Les couleurs sont celles
// de --color-bg dans listo.css (vérifié par test/theme-boot.test.js).
(function () {
  var KEY = 'listo-theme';
  var BG = { light: '#F4F7FB', dark: '#0C1422' };

  function savedTheme(storage) {
    try {
      var value = storage.getItem(KEY);
      return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
    } catch (error) {
      return 'auto'; // stockage indisponible (navigation privée)
    }
  }

  // doc : la page (un faux objet dans les tests)
  function apply(doc, theme) {
    doc.documentElement.setAttribute('data-theme', theme);
    var scheme = doc.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', theme === 'auto' ? 'light dark' : theme);
    var colors = doc.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < colors.length; i += 1) {
      var dark = /dark/.test(colors[i].getAttribute('media') || '');
      colors[i].setAttribute('content', theme === 'auto' ? (dark ? BG.dark : BG.light) : BG[theme]);
    }
  }

  try {
    var storage = null;
    try {
      storage = window.localStorage;
    } catch (error) {
      storage = null;
    }
    apply(document, storage ? savedTheme(storage) : 'auto');
  } catch (error) {
    // en cas de souci, le thème automatique s'applique, puis app.js pose le thème choisi
  }
}());
