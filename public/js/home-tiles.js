// Réglage « Accueil » de chaque compte (Réglages › Accueil, 23 novembre
// 2026) : règles partagées par le serveur (server/home.js, qui vérifie
// tout) et par les écrans (copie locale, file d'attente hors ligne).
// Aucun texte ici, aucune page touchée : des fonctions « pures », testées
// automatiquement (test/home-tiles.test.js).
//
// Le réglage : { enabled, start, order, hidden }
// - enabled : l'Accueil est affiché (vrai au départ) ; coupé, Listo s'ouvre
//   sur l'écran « start » et le bouton Accueil disparaît du bandeau du bas ;
// - start : le premier écran quand l'Accueil est coupé (« Listes » au départ) ;
// - order : l'ordre des tuiles (celui d'avant le réglage au départ) ;
// - hidden : les tuiles masquées (aucune au départ). « Compte » ne se masque
//   jamais : sur l'Accueil, il n'y a pas de bandeau du bas, et c'est le seul
//   chemin vers les Réglages.

// Les tuiles, dans leur ordre de départ
export const HOME_TILES = ['deadlines', 'lists', 'gifts', 'notes', 'account'];
// La tuile toujours affichée
export const ALWAYS_SHOWN = 'account';
// Tuile qui prend toujours toute la largeur du téléphone (« À offrir »)
export const WIDE_TILES = ['gifts'];
// Écrans possibles quand l'Accueil est coupé
export const START_SCREENS = ['deadlines', 'lists', 'notes'];
export const DEFAULT_START = 'lists';

// Réglage de départ (aucun choix fait)
export function defaultHome() {
  return { enabled: true, start: DEFAULT_START, order: [...HOME_TILES], hidden: [] };
}

const isTile = (name) => typeof name === 'string' && HOME_TILES.includes(name);
const unique = (names) => new Set(names).size === names.length;

// Problème d'une modification { enabled?, start?, order?, hidden? } (le
// contenu d'une opération « account.home ») : le nom du texte de refus, ou
// null si tout va bien. Refusés : tuile inconnue, tuile en double, « Compte »
// masqué, écran de départ inconnu, rien à modifier. Une tuile connue absente
// de « order » est simplement remise à la fin (normalizeHome).
export function homeChangeProblem(change) {
  const { enabled, start, order, hidden } = change ?? {};
  if (enabled === undefined && start === undefined && order === undefined && hidden === undefined) return 'ops.rienAModifier';
  if (enabled !== undefined && typeof enabled !== 'boolean') return 'ops.accueilReglageInvalide';
  if (start !== undefined && !START_SCREENS.includes(start)) return 'ops.accueilPremierEcranInvalide';
  for (const names of [order, hidden]) {
    if (names === undefined) continue;
    if (!Array.isArray(names) || names.length > HOME_TILES.length || !names.every(isTile) || !unique(names)) return 'ops.accueilTuilesInvalides';
  }
  if (hidden?.includes(ALWAYS_SHOWN)) return 'ops.accueilCompteToujours';
  return null;
}

// Réglage complet et valable, à partir de ce qui est gardé (base, copie du
// téléphone) ou reçu, même incomplet ou ancien : valeurs de départ pour ce
// qui manque ; tuiles inconnues et doublons écartés ; tuiles connues
// absentes de l'ordre ajoutées à la fin, dans l'ordre de départ ; « Compte »
// jamais masqué.
export function normalizeHome(value) {
  const home = defaultHome();
  if (!value || typeof value !== 'object') return home;
  if (typeof value.enabled === 'boolean') home.enabled = value.enabled;
  if (START_SCREENS.includes(value.start)) home.start = value.start;
  const order = Array.isArray(value.order) ? value.order.filter((name, i, all) => isTile(name) && all.indexOf(name) === i) : [];
  home.order = [...order, ...HOME_TILES.filter((name) => !order.includes(name))];
  const hidden = Array.isArray(value.hidden) ? value.hidden : [];
  home.hidden = HOME_TILES.filter((name) => name !== ALWAYS_SHOWN && hidden.includes(name));
  return home;
}

// Applique une modification valable à un réglage (renvoie un nouveau réglage)
export function applyHomeChange(home, change) {
  const current = normalizeHome(home);
  return normalizeHome({
    enabled: change.enabled ?? current.enabled,
    start: change.start ?? current.start,
    order: change.order ?? current.order,
    hidden: change.hidden ?? current.hidden,
  });
}

// Premier écran de Listo : l'Accueil (« home »), ou l'écran choisi quand
// l'Accueil est coupé (aussi pour #/accueil et une adresse inconnue)
export function firstScreen(home) {
  const value = normalizeHome(home);
  return value.enabled ? 'home' : value.start;
}

// Boutons du bandeau du bas du téléphone (tabbar.js, même ordre que ses
// TABS) : les cinq, ou quatre sans « Accueil » quand il est coupé
export const TAB_SCREENS = ['home', 'deadlines', 'lists', 'notes', 'settings'];
export function tabScreens(home) {
  const shown = firstScreen(home) === 'home';
  return TAB_SCREENS.filter((name) => shown || name !== 'home');
}

// Tuiles affichées, dans l'ordre choisi (les tuiles masquées en moins)
export function shownTiles(home) {
  const value = normalizeHome(home);
  return value.order.filter((name) => !value.hidden.includes(name));
}

// Disposition sur les deux colonnes du téléphone : pour chaque tuile
// présente (dans l'ordre), { name, wide }. Une tuile de WIDE_TILES prend
// toute la largeur ; une tuile d'une demi-largeur restée seule sur sa ligne
// (suivie d'une tuile large, ou de rien) la prend aussi : jamais de trou.
// Sous 340 px (une colonne) et sur ordinateur (tile--wide sans effet), rien
// ne change.
export function tileLayout(names, wideTiles = WIDE_TILES) {
  const layout = names.map((name) => ({ name, wide: wideTiles.includes(name) }));
  let alone = null; // tuile d'une demi-largeur en attente d'une voisine
  for (const tile of layout) {
    if (tile.wide) {
      if (alone) alone.wide = true;
      alone = null;
    } else if (alone) alone = null;
    else alone = tile;
  }
  if (alone) alone.wide = true;
  return layout;
}
