// Bandeau du bas du téléphone (décision du 11 novembre 2026) : en style
// verre, et la loupe ronde qui flotte juste au-dessus, à droite.
// Cinq boutons depuis le 23 novembre 2026 (étape 2), dans cet ordre :
// « Accueil », « Échéances », « Listes », « Notes », « Réglages » (la classe
// tabbar--N suit le nombre de boutons).
//
// - Il existe sur l'Accueil, Échéances, Listes, Notes et Réglages (l'Accueil
//   l'a aussi depuis le 23 novembre 2026, choix du propriétaire), pas dans
//   une liste (le bas est pris par le champ d'ajout), et pas sur ordinateur
//   (menu de gauche).
// - Il prend toute la largeur et garde la même place : les boutons ne
//   bougent jamais d'un écran à l'autre. Sur « Réglages », il n'y a rien à
//   chercher : la loupe n'est pas affichée.
// - Une pastille (fond bleu clair) glisse vers le bouton de l'écran affiché,
//   avec un petit rebond ; sans animation si le téléphone en demande moins.
// - « Échéances » porte une pastille numérique : tâches en retard et tâches
//   du jour (deadlines.js), recalculée à chaque changement et à minuit.
//
// Un seul bandeau pour toute la visite (il n'est pas refait à chaque écran :
// c'est ce qui permet à la pastille de glisser d'un bouton à l'autre).

import { h, icon } from './dom.js';
import { navigate, goBack } from './router.js';
import { app, onDataChange } from './app.js';
import { deadlineBadge } from './deadlines.js';
import { watchNewDay } from './ui.js';
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

// L'écran a-t-il le bandeau ? (l'Accueil aussi, depuis le 23 novembre 2026)
export const hasTabs = (routeName) => TABS.some(([name]) => name === routeName);

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

// Libellé lu de « Échéances » avec sa pastille
export function deadlinesLabel(count) {
  if (!count) return t('navigation.echeances');
  return t('navigation.echeances.pastille', { count });
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
  const badge = h('span', { class: 'tabbar__badge', 'aria-hidden': 'true', hidden: true });
  const buttons = new Map();
  for (const [name, iconName, label] of TABS) {
    buttons.set(name, h('button', {
      class: 'tabbar__tab',
      type: 'button',
      'data-tab': name,
      onClick: () => goToTab(name),
    }, h('span', { class: 'tabbar__ico' }, icon(iconName), name === 'deadlines' ? badge : null), h('span', { class: 'tabbar__label' }, label())));
  }
  const nav = h('nav', { class: `tabbar glass tabbar--${TABS.length}`, 'aria-label': t('navigation.libelle') }, pill, ...buttons.values());
  const loupe = loupeButton();
  const el = h('div', { class: 'tabdock' }, nav, loupe.el);

  // Pastille d'« Échéances »
  const drawBadge = () => {
    const count = app.data.loaded ? deadlineBadge(app.data, undefined, app.user?.id ?? null) : 0;
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    buttons.get('deadlines').setAttribute('aria-label', deadlinesLabel(count));
  };
  onDataChange(drawBadge);
  watchNewDay(drawBadge);
  drawBadge();

  return {
    el,
    loupe,
    // Écran affiché : bouton marqué, pastille déplacée
    select(name) {
      const index = TABS.findIndex(([tab]) => tab === name);
      for (const [tab, button] of buttons) {
        if (tab === name) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      pill.hidden = index < 0;
      // Le bandeau vient d'être reposé dans le nouvel écran : la pastille
      // part de son ancienne place à l'image suivante (sinon, pas de glissement)
      const next = String(Math.max(index, 0));
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
