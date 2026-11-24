// Bandeau du bas du téléphone (décision du 11 novembre 2026) : en style
// verre, et la loupe ronde qui flotte juste au-dessus, à droite.
// Cinq boutons depuis le 23 novembre 2026 (étape 2), dans cet ordre :
// « Accueil », « Échéances », « Listes », « Notes », « Réglages » (la classe
// tabbar--N suit le nombre de boutons).
//
// - Il existe sur Échéances, Listes (et « À offrir », avec « Listes »
//   marqué), Notes et Réglages ; pas sur l'Accueil (décision du
//   propriétaire, de nouveau le 23 novembre 2026, après essai : ses tuiles
//   mènent déjà partout), pas dans une liste (le bas est pris par le champ
//   d'ajout), et pas sur ordinateur (menu de gauche).
// - Il prend toute la largeur et garde la même place : les boutons ne
//   bougent jamais d'un écran à l'autre. Sur « Réglages », il n'y a rien à
//   chercher : la loupe n'est pas affichée.
// - Une pastille (fond bleu clair) glisse vers le bouton de l'écran affiché,
//   avec un petit rebond ; sans animation si le téléphone en demande moins.
// - « Échéances » porte deux pastilles numériques (décision du 24 novembre
//   2026) : en haut à gauche de l'icône, la rouge (tâches en retard) ; en
//   haut à droite, la verte (tâches du jour) ; chacune seulement si son
//   nombre n'est pas nul (deadlines.js). Recalculées à chaque changement, à
//   minuit et à chaque minute (une tâche du jour passe « En retard » à son
//   heure, comme sur l'écran Échéances).
//
// Un seul bandeau pour toute la visite (il n'est pas refait à chaque écran :
// c'est ce qui permet à la pastille de glisser d'un bouton à l'autre).
//
// Accueil coupé (Réglages › Accueil, home-tiles.js) : quatre boutons
// (« Échéances », « Listes », « Notes », « Réglages », tabbar--4), sans
// « Accueil ». Notes coupées (Réglages › Fonctions, features.js) : sans
// « Notes » (quatre boutons, ou trois si l'Accueil est aussi coupé ; la
// pastille de base de listo.css fait un tiers). Le bandeau suit ces
// réglages dès qu'ils changent (sur cet appareil ou sur un autre), sans
// être refait.

import { h, icon, replace } from './dom.js';
import { navigate, goBack } from './router.js';
import { app, onDataChange } from './app.js';
import { deadlineBadges, deadlinesLabel, badgeText } from './deadlines.js';
import { watchNewDay, watchMinute } from './ui.js';
import { tabScreens } from './home-tiles.js';
import { t } from './i18n.js';

// [écran, icône, libellé] (le libellé est une fonction : il est lu dans la
// langue choisie au moment de dessiner le bandeau)
export const TABS = [
  ['home', 'home', () => t('navigation.accueil')],
  ['deadlines', 'calendar', () => t('navigation.echeances')],
  ['lists', 'tasks', () => t('navigation.listes')],
  ['notes', 'note', () => t('navigation.notes')],
  ['settings', 'sliders', () => t('navigation.reglages')],
];

// Bouton du bandeau d'un écran : le sien, ou celui de l'écran dont il
// dépend (« À offrir » : Listes) ; null s'il n'en a pas
const TAB_OF = { gifts: 'lists' };
export const tabOf = (routeName) => {
  const name = TAB_OF[routeName] ?? routeName;
  return TABS.some(([tab]) => tab === name) ? name : null;
};

// L'écran a-t-il le bandeau ? Pas l'Accueil (décision du propriétaire, de
// nouveau le 23 novembre 2026 : ses tuiles mènent déjà partout ; les
// boutons du bandeau des autres écrans y ramènent toujours)
export const hasTabs = (routeName) => routeName !== 'home' && tabOf(routeName) !== null;

// Aller à un écran du bandeau. L'Accueil est l'écran de départ : on y
// revient par un retour en arrière (le bouton Retour du téléphone ne fait
// pas faire le tour des onglets) ; depuis l'Accueil, l'écran choisi
// s'ajoute par-dessus ; entre Échéances, Listes, Notes et Réglages, un
// écran remplace l'autre.
export function goToTab(name) {
  const current = app.route?.name;
  if (name === current) return;
  if (name === 'home') {
    goBack('home');
    return;
  }
  navigate(name, {}, { replace: current !== 'home' });
}

// Loupe ronde en verre (bandeau, et barre d'ajout d'une liste).
// search : { label, isOpen(), toggle() } (search-row.js), ou rien.
export function loupeButton() {
  const button = h('button', { class: 'loupe glass', type: 'button' }, icon('search'));
  let search = null;
  button.addEventListener('click', () => search?.toggle());
  return {
    el: button,
    // Branche la loupe sur la recherche de l'écran ; null : pas de loupe
    set(next) {
      search = next;
      button.classList.toggle('loupe--off', !search);
      button.tabIndex = search ? 0 : -1;
      if (search) button.setAttribute('aria-label', search.label);
      else button.removeAttribute('aria-label');
      button.setAttribute('aria-hidden', String(!search));
      this.sync();
    },
    // Recherche ouverte : loupe surlignée (et annoncée « développée »)
    sync() {
      if (!search) {
        button.removeAttribute('aria-expanded');
        button.removeAttribute('aria-controls');
        return;
      }
      button.setAttribute('aria-expanded', String(search.isOpen()));
      if (search.controls) button.setAttribute('aria-controls', search.controls);
    },
  };
}

let bar = null;

function createTabBar() {
  const pill = h('span', { class: 'tabbar__pill', 'aria-hidden': 'true' });
  // Pastilles d'« Échéances » : rouge à gauche (en retard), verte à droite
  // (aujourd'hui) ; cachées aux lecteurs d'écran (les nombres sont dans le
  // nom du bouton)
  const lateBadge = h('span', { class: 'tabbar__badge tabbar__badge--late', 'aria-hidden': 'true', hidden: true });
  const todayBadge = h('span', { class: 'tabbar__badge tabbar__badge--today', 'aria-hidden': 'true', hidden: true });
  const buttons = new Map();
  for (const [name, iconName, label] of TABS) {
    buttons.set(name, h('button', {
      class: 'tabbar__tab',
      type: 'button',
      'data-tab': name,
      onClick: () => goToTab(name),
    }, h('span', { class: 'tabbar__ico' }, icon(iconName), name === 'deadlines' ? [lateBadge, todayBadge] : null), h('span', { class: 'tabbar__label' }, label())));
  }
  const nav = h('nav', { class: 'tabbar glass', 'aria-label': t('navigation.libelle') }, pill);
  const loupe = loupeButton();
  const el = h('div', { class: 'tabdock' }, nav, loupe.el);

  // Boutons posés dans le bandeau (cinq, ou quatre sans « Accueil ») ;
  // reposés seulement quand le réglage change. Renvoie vrai s'ils ont changé.
  let shown = [];
  let current = null; // bouton de l'écran affiché
  const arrange = () => {
    // (réglage du compte, copie locale ; home-tiles.js)
    const names = tabScreens(app.data.home, app.data.features);
    if (names.join() === shown.join()) return false;
    shown = names;
    for (let count = 1; count <= TABS.length; count++) nav.classList.remove(`tabbar--${count}`);
    nav.classList.add(`tabbar--${names.length}`);
    replace(nav, pill, names.map((name) => buttons.get(name)));
    return true;
  };
  arrange();
  // Place de la pastille sous le bouton de l'écran affiché
  const placeOf = () => String(Math.max(shown.indexOf(current), 0));

  // Pastilles d'« Échéances »
  const drawBadge = () => {
    const counts = app.data.loaded ? deadlineBadges(app.data, undefined, app.user?.id ?? null) : { late: 0, today: 0 };
    lateBadge.hidden = counts.late === 0;
    lateBadge.textContent = badgeText(counts.late);
    todayBadge.hidden = counts.today === 0;
    todayBadge.textContent = badgeText(counts.today);
    buttons.get('deadlines').setAttribute('aria-label', deadlinesLabel(counts));
  };
  onDataChange(() => {
    drawBadge();
    // Accueil coupé ou rétabli : boutons reposés, pastille remise en place
    // sans glisser
    if (arrange() && nav.dataset.current) nav.dataset.current = placeOf();
  });
  watchNewDay(drawBadge);
  watchMinute(drawBadge);
  drawBadge();

  return {
    el,
    loupe,
    // Écran affiché : bouton marqué, pastille déplacée
    select(name) {
      current = name;
      arrange();
      const index = shown.indexOf(name);
      for (const [tab, button] of buttons) {
        if (tab === name) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      pill.hidden = index < 0;
      // Le bandeau vient d'être reposé dans le nouvel écran : la pastille
      // part de son ancienne place à l'image suivante (sinon, pas de glissement)
      const next = placeOf();
      if (!nav.dataset.current) nav.dataset.current = next;
      else requestAnimationFrame(() => requestAnimationFrame(() => { nav.dataset.current = next; }));
      drawBadge();
    },
  };
}

// Le bandeau (créé au premier besoin)
export function tabBar() {
  bar ??= createTabBar();
  return bar;
}
