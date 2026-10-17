// Thème de l'écran : clair, sombre ou automatique (selon le téléphone).
// Le choix écrit simplement data-theme sur <html> et se retient d'une visite
// à l'autre (stockage du navigateur).

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

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'auto';
  document.documentElement.setAttribute('data-theme', value);
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // stockage indisponible : le thème vaut pour cette visite seulement
  }
}
