// Bandeau du bas du téléphone (décision du 11 novembre 2026) : trois
// boutons, « Mes listes », « Échéances » et « Réglages », en style verre, et
// la loupe ronde qui flotte juste au-dessus, à droite.
//
// - Il n'existe que sur ces trois écrans (pas dans une liste, où le bas est
//   pris par le champ d'ajout), et pas sur ordinateur (menu de gauche).
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

// [écran, icône, libellé]
export const TABS = [
  ['lists', 'tasks', 'Mes listes'],
  ['deadlines', 'calendar', 'Échéances'],
  ['settings', 'sliders', 'Réglages'],
];

// L'écran a-t-il le bandeau ?
export const hasTabs = (routeName) => TABS.some(([name]) => name === routeName);

// Aller à un écran du bandeau. « Mes listes » est l'écran de départ : on y
// revient par un retour en arrière (le bouton Retour du téléphone ne fait
// pas faire le tour des onglets) ; entre « Échéances » et « Réglages », un
// écran remplace l'autre.
export function goToTab(name) {
  const current = app.route?.name;
  if (name === current) return;
  if (name === 'lists') {
    goBack('lists');
    return;
  }
  navigate(name, {}, { replace: current !== 'lists' });
}

// Libellé lu de « Échéances » avec sa pastille
export function deadlinesLabel(count) {
  if (!count) return 'Échéances';
  return `Échéances, ${count} ${count > 1 ? 'tâches' : 'tâche'} en retard ou pour aujourd'hui`;
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
    }, h('span', { class: 'tabbar__ico' }, icon(iconName), name === 'deadlines' ? badge : null), h('span', { class: 'tabbar__label' }, label)));
  }
  const nav = h('nav', { class: 'tabbar glass', 'aria-label': 'Navigation' }, pill, ...buttons.values());
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
