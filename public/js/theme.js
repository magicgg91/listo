// Thème de l'écran : clair, sombre ou automatique (selon le téléphone).
// Le choix écrit data-theme sur <html> et se retient d'une visite à l'autre
// (stockage du navigateur). Il met aussi à jour, tout de suite, les balises
// color-scheme et theme-color (bandeau du haut et contrôles du téléphone),
// comme js/theme-boot.js le fait au démarrage avant le premier affichage.

const KEY = 'listo-theme';
export const THEMES = ['light', 'dark', 'auto'];

export function savedTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.includes(value) ? value : 'auto';
  } catch {
    return 'auto'; // stockage indisponible (navigation privée)
  }
}

// Couleur de fond de chaque thème (--color-bg de listo.css)
export const THEME_BG = { light: '#F4F7FB', dark: '#0C1422' };

// Balises color-scheme et theme-color de la page pour ce thème. En
// automatique, chaque balise theme-color garde la couleur de son mode
// (attribut media) ; sinon, les deux prennent la couleur du thème choisi.
export function syncThemeMeta(doc, theme) {
  doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme === 'auto' ? 'light dark' : theme);
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    const dark = /dark/.test(meta.getAttribute('media') ?? '');
    meta.setAttribute('content', theme === 'auto' ? THEME_BG[dark ? 'dark' : 'light'] : THEME_BG[theme]);
  }
}

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'auto';
  document.documentElement.setAttribute('data-theme', value);
  syncThemeMeta(document, value);
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // stockage indisponible : le thème vaut pour cette visite seulement
  }
}
