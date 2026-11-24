// Écran « Accueil » des Réglages (#/reglages/accueil, téléphone et
// ordinateur ; maquettes validées le 23 novembre 2026). Réglage du compte :
// le même sur tous les appareils de la personne (home-tiles.js,
// server/home.js, migration 40). Chaque changement part tout de suite par
// la file d'attente (copie locale, puis serveur) : hors ligne compris.
//
// - « Écran d'accueil » : interrupteur « Afficher l'Accueil ».
// - Accueil affiché : « Tuiles affichées », une ligne par tuile (icône, nom,
//   interrupteur), dans l'ordre de l'Accueil. « Compte » ne se masque pas
//   (interrupteur allumé et grisé) : sur l'Accueil, il n'y a pas de bandeau
//   du bas, c'est le seul chemin vers les Réglages. « Réordonner » (à droite
//   du titre) passe en mode « Réordonner », comme les sous-tâches d'une
//   liste (screens/list.js) : poignée à glisser (doigt ou souris), boutons
//   « Monter » / « Descendre » (clavier, lecture à voix haute ; grisés aux
//   bouts), focus gardé sur le bouton touché, nouvelle place annoncée ;
//   « Terminé » ferme le mode.
// - Accueil coupé : « Premier écran », trois choix (Échéances, Listes,
//   Notes ; une coche sur le choisi), à la place des tuiles.
// - Notes coupées (Réglages › Fonctions, features.js) : ni la tuile Notes
//   dans la liste (sa place et son état sont gardés), ni « Notes » parmi
//   les premiers écrans (choisi avant : « Listes » est coché, le choix
//   gardé revient avec les notes).
// Textes posés avec textContent (h()) ; aucun curseur mis tout seul.

import { h, icon, replace } from '../dom.js';
import { goBack } from '../router.js';
import { app, onDataChange } from '../app.js';
import * as actions from '../actions.js';
import { announce } from '../announce.js';
import { drawWhenIdle } from '../ui.js';
import { normalizeHome, ALWAYS_SHOWN, tilesFor, startScreens, firstScreen, mergeTileOrder } from '../home-tiles.js';
import { normalizeFeatures } from '../features.js';
import { topbar } from './settings.js';
import { t } from '../i18n.js';

// Tuiles : icône, nom (le même que sur l'Accueil), phrase dessous
// (lue au moment d'afficher : la langue est alors choisie)
const TILE_INFO = {
  deadlines: { iconName: 'calendar', name: () => t('accueil.echeances') },
  lists: { iconName: 'tasks', name: () => t('accueil.listes') },
  gifts: { iconName: 'gift', name: () => t('offrir.titre'), sub: () => t('reglages.accueil.offrir.detail') },
  notes: { iconName: 'note', name: () => t('accueil.notes') },
  account: { iconName: 'user', name: () => t('accueil.compte'), sub: () => t('reglages.accueil.compte.detail') },
};
// Premiers écrans possibles : icône et nom (ceux du bandeau du bas)
const START_INFO = {
  deadlines: { iconName: 'calendar', name: () => t('navigation.echeances') },
  lists: { iconName: 'tasks', name: () => t('navigation.listes') },
  notes: { iconName: 'note', name: () => t('navigation.notes') },
};

export function renderHomeSettings(onLeave = () => {}) {
  const body = h('div', { class: 'body' });
  let reordering = false;
  // Boutons à remettre sous le focus après le prochain dessin (le premier
  // actif trouvé) : le focus reste sur le bouton touché
  let focusAfterDraw = null;
  let drawn = '';

  // Interrupteur (role="switch") avec son titre et sa description reliés
  // (help : la ligne a une phrase sous son titre)
  const switchButton = (key, on, { disabled = false, help = true, onToggle = null } = {}) => h('button', {
    class: 'switch',
    type: 'button',
    role: 'switch',
    'aria-checked': String(on),
    'aria-labelledby': `accueil-${key}-titre`,
    'aria-describedby': help ? `accueil-${key}-aide` : null,
    'data-key': key,
    disabled,
    onClick: onToggle,
  });

  // « Afficher l'Accueil »
  const enabledPart = (home) => [
    h('h2', { class: 'section-title' }, t('reglages.accueil.ecran')),
    h('div', { class: 'group list-options' },
      h('div', { class: 'toggle-row' },
        h('div', { class: 'grow' },
          h('span', { class: 'row__title', id: 'accueil-enabled-titre' }, t('reglages.accueil.afficher')),
          h('span', { class: 'row__sub', id: 'accueil-enabled-aide' }, home.enabled ? t('reglages.accueil.afficher.oui') : t('reglages.accueil.afficher.non'))),
        switchButton('enabled', home.enabled, { onToggle: () => actions.setHome({ enabled: !home.enabled }) }))),
  ];

  // Titre de section avec son bouton à droite (« Réordonner » / « Terminé »)
  const tilesHead = () => h('div', { class: 'section-head' },
    h('h2', { class: 'section-title', id: 'accueil-tuiles' }, t('reglages.accueil.tuiles')),
    reordering
      ? h('button', { class: 'btn btn--sm btn--primary', type: 'button', 'data-key': 'reorder', onClick: () => setReordering(false) }, t('reglages.accueil.termine'))
      : h('button', { class: 'btn btn--sm btn--secondary', type: 'button', 'data-key': 'reorder', onClick: () => setReordering(true) }, icon('menu-lines', 'icon--sm'), t('reglages.accueil.reordonner')));
  const setReordering = (on) => {
    reordering = on;
    focusAfterDraw = ['[data-key="reorder"]'];
    draw(true);
  };

  // Une tuile : icône, nom (et phrase), interrupteur « affichée »
  const tileRow = (home, name) => {
    const info = TILE_INFO[name];
    const always = name === ALWAYS_SHOWN;
    const shown = always || !home.hidden.includes(name);
    const key = `tile-${name}`;
    return h('div', { class: 'row' },
      h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(info.iconName)),
      h('span', { class: 'row__body' },
        h('span', { class: 'row__title', id: `accueil-${key}-titre` }, info.name()),
        info.sub ? h('span', { class: 'row__sub', id: `accueil-${key}-aide` }, info.sub()) : null),
      switchButton(key, shown, {
        disabled: always,
        help: Boolean(info.sub),
        onToggle: () => actions.setHome({ hidden: shown ? [...home.hidden, name] : home.hidden.filter((other) => other !== name) }),
      }));
  };

  // Mode « Réordonner » : poignée, icône, nom, Monter, Descendre
  // (tiles : les tuiles montrées, dans leur ordre)
  const orderRow = (home, tiles, name, index) => {
    const label = (up) => t(up ? 'reglages.accueil.monter' : 'reglages.accueil.descendre', { name: TILE_INFO[name].name() });
    const move = (step) => h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': label(step < 0),
      'data-key': `${step < 0 ? 'up' : 'down'}-${name}`,
      disabled: step < 0 ? index === 0 : index === tiles.length - 1,
      onClick: () => moveStep(home, tiles, name, index, step),
    }, icon(step < 0 ? 'arrow-up' : 'arrow-down', 'icon--sm'));
    const handle = h('span', { class: 'reorder__handle', 'aria-hidden': 'true', title: t('reglages.accueil.glisser') }, icon('menu-lines', 'icon--sm'));
    const row = h('li', { class: 'item reorder', 'data-tile': name },
      handle,
      h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(TILE_INFO[name].iconName)),
      h('span', { class: 'reorder__name item__name' }, TILE_INFO[name].name()),
      move(-1), move(1));
    handle.addEventListener('pointerdown', (event) => startDrag(event, row, home, tiles, name));
    return row;
  };

  // Nouvel ordre des tuiles montrées : enregistré (file d'attente ; les
  // tuiles d'une fonction coupée gardent leur place), puis la place annoncée
  const saveOrder = (home, order, name) => {
    actions.setHome({ order: mergeTileOrder(home.order, order) });
    announce(t('reglages.accueil.position', { name: TILE_INFO[name].name(), position: order.indexOf(name) + 1, total: order.length }));
  };

  // Monter / Descendre d'un cran ; le focus reste sur le bouton (ou passe
  // à l'autre flèche quand la tuile arrive au bout)
  function moveStep(home, tiles, name, index, step) {
    const target = index + step;
    if (target < 0 || target >= tiles.length) return;
    const order = tiles.filter((other) => other !== name);
    order.splice(target, 0, name);
    focusAfterDraw = [`[data-key="${step < 0 ? 'up' : 'down'}-${name}"]`, `[data-key="${step < 0 ? 'down' : 'up'}-${name}"]`];
    saveOrder(home, order, name);
  }

  // Glisser la poignée : la ligne suit le doigt (ou la souris) et passe
  // devant ou derrière ses voisines à mi-hauteur ; au lâcher, un seul
  // enregistrement (rien si la place n'a pas changé)
  function startDrag(event, row, home, tiles, name) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const list = row.parentElement;
    const startIndex = tiles.indexOf(name);
    let originY = event.clientY;
    row.classList.add('is-dragging');
    const follow = (y) => {
      row.style.transform = `translateY(${y - originY}px)`;
      const next = row.nextElementSibling;
      const prev = row.previousElementSibling;
      const box = row.getBoundingClientRect();
      if (next) {
        const nextBox = next.getBoundingClientRect();
        if (box.bottom > nextBox.top + nextBox.height / 2) {
          list.insertBefore(next, row);
          originY += nextBox.height;
          row.style.transform = `translateY(${y - originY}px)`;
          return;
        }
      }
      if (prev) {
        const prevBox = prev.getBoundingClientRect();
        if (box.top < prevBox.top + prevBox.height / 2) {
          list.insertBefore(row, prev);
          originY -= prevBox.height;
          row.style.transform = `translateY(${y - originY}px)`;
        }
      }
    };
    const onMove = (moveEvent) => follow(moveEvent.clientY);
    const finish = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      row.style.transform = '';
      row.classList.remove('is-dragging');
      const order = [...list.children].map((el) => el.dataset.tile);
      if (order.indexOf(name) === startIndex) return;
      saveOrder(home, order, name);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  // Accueil affiché : les tuiles (ou leur ordre), sans celles d'une
  // fonction coupée
  const tilesPart = (home, features) => {
    const tiles = tilesFor(home, features);
    return [
      tilesHead(),
      reordering
        ? h('ul', { class: 'group home-order', 'aria-labelledby': 'accueil-tuiles' }, tiles.map((name, index) => orderRow(home, tiles, name, index)))
        : h('div', { class: 'group' }, tiles.map((name) => tileRow(home, name))),
      h('div', { class: 'group-after' }, h('p', { class: 'muted' }, reordering ? t('reglages.accueil.note.ordre') : t('reglages.accueil.note'))),
    ];
  };

  // Accueil coupé : le premier écran (un seul choix, coché), parmi ceux des
  // fonctions utilisées (celui qui s'ouvre vraiment est coché)
  const startPart = (home, features) => {
    const start = firstScreen({ ...home, enabled: false }, features);
    return [
      h('h2', { class: 'section-title', id: 'accueil-premier' }, t('reglages.accueil.premier')),
      h('div', { class: 'group', role: 'radiogroup', 'aria-labelledby': 'accueil-premier' }, startScreens(features).map((name) => {
        const chosen = start === name;
        return h('button', {
          class: 'row', type: 'button', role: 'radio', 'aria-checked': String(chosen), 'data-key': `start-${name}`,
          onClick: () => { if (!chosen) actions.setHome({ start: name }); },
        },
        h('span', { class: 'row__icon', 'aria-hidden': 'true' }, icon(START_INFO[name].iconName)),
        h('span', { class: 'row__body' }, h('span', { class: 'row__title' }, START_INFO[name].name())),
        chosen ? icon('check', 'home-start__check') : null);
      })),
      h('div', { class: 'group-after' }, h('p', { class: 'muted' }, t('reglages.accueil.note'))),
    ];
  };

  // Dessin : seulement quand un réglage (Accueil, fonctions) ou le mode a
  // changé ; le bouton qui avait le focus le retrouve
  function draw(force = false) {
    const home = normalizeHome(app.data.home);
    const features = normalizeFeatures(app.data.features);
    const key = JSON.stringify([home, features, reordering]);
    if (!force && key === drawn) return;
    drawn = key;
    const held = body.contains(document.activeElement) ? document.activeElement.dataset?.key : null;
    replace(body, enabledPart(home), home.enabled ? tilesPart(home, features) : startPart(home, features));
    const wanted = focusAfterDraw ?? (held ? [`[data-key="${held}"]`] : []);
    focusAfterDraw = null;
    const target = wanted.map((selector) => body.querySelector(selector)).find((el) => el && !el.disabled);
    target?.focus();
  }
  const idle = drawWhenIdle(body, () => draw());
  onLeave(onDataChange(idle.request)); // changé sur un autre appareil : suit
  onLeave(idle.stop);
  draw();

  return h('div', { class: 'screen' },
    topbar(t('reglages.accueil'), () => goBack('settings')),
    body);
}
