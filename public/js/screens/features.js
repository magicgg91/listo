// Écran « Fonctions » des Réglages (#/reglages/fonctions, téléphone et
// ordinateur ; décision du 24 novembre 2026). Réglage du compte : le même
// sur tous les appareils de la personne (features.js, server/features.js,
// migration 41). Chaque changement part tout de suite par la file
// d'attente (copie locale, puis serveur) : hors ligne compris.
//
// - Une phrase d'explication, puis une ligne par fonction (« Listes » pour
//   un invité seulement, « Notes », « Projets », coupés au départ) : son
//   nom, une phrase dessous, un interrupteur.
// - Une fonction coupée disparaît des écrans de la personne (bandeau du bas,
//   Accueil, menu de gauche, nouveautés, notifications) ; rien n'est effacé.
// - D'autres fonctions pourront s'ajouter : une entrée dans FEATURE_INFO
//   (et dans features.js), dans l'ordre de FEATURES.
// - Seules les fonctions que l'Admin a autorisées pour ce compte sont
//   proposées (docs/cadrage-comptes.md, étape 2 ; maquette design/comptes
//   invite-fonctions-1), avec la phrase « Seules les fonctions que l'Admin
//   a autorisées… » quand il en manque une (ou pour un invité) ; aucune
//   autorisée : une phrase seule, l'Admin s'en charge.
// Textes posés avec textContent (h()) ; aucun curseur mis tout seul.

import { h, replace } from '../dom.js';
import { goBack } from '../router.js';
import { app, onDataChange, allowedNow } from '../app.js';
import * as actions from '../actions.js';
import { drawWhenIdle } from '../ui.js';
import { FEATURES, normalizeFeatures, offeredFeatures } from '../features.js';
import { topbar } from './settings.js';
import { t } from '../i18n.js';

// Chaque fonction : son nom et la phrase dessous (lus au moment
// d'afficher : la langue est alors choisie)
const FEATURE_INFO = {
  lists: { name: () => t('reglages.fonctions.listes'), sub: () => t('reglages.fonctions.listes.detail') },
  notes: { name: () => t('reglages.fonctions.notes'), sub: () => t('reglages.fonctions.notes.detail') },
  projects: { name: () => t('reglages.fonctions.projets'), sub: () => t('reglages.fonctions.projets.detail') },
};

export function renderFeatures(onLeave = () => {}) {
  const body = h('div', { class: 'body' });
  let drawn = '';

  // Une fonction : nom, phrase, interrupteur (role="switch", titre et
  // phrase reliés)
  const featureRow = (features, name) => {
    const info = FEATURE_INFO[name];
    const on = features[name];
    return h('div', { class: 'toggle-row' },
      h('div', { class: 'grow' },
        h('span', { class: 'row__title', id: `fonction-${name}-titre` }, info.name()),
        h('span', { class: 'row__sub', id: `fonction-${name}-aide` }, info.sub())),
      h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(on),
        'aria-labelledby': `fonction-${name}-titre`,
        'aria-describedby': `fonction-${name}-aide`,
        'data-key': name,
        onClick: () => actions.setFeatures({ [name]: !on }),
      }));
  };

  // Dessin : seulement quand le réglage a changé ; l'interrupteur qui avait
  // le focus le retrouve
  function draw() {
    const features = normalizeFeatures(app.data.features);
    const allowed = allowedNow();
    // (« Listes » : un invité seulement ; un Admin et un Utilisateur les
    // ont toujours, sans ligne)
    const role = app.user?.role;
    const offered = offeredFeatures(allowed, role);
    const limited = role === 'guest' || offered.length < FEATURES.filter((name) => name !== 'lists').length;
    const key = JSON.stringify([features, offered, limited]);
    if (key === drawn) return;
    drawn = key;
    const held = body.contains(document.activeElement) ? document.activeElement.dataset?.key : null;
    replace(body,
      h('p', { class: 'page-intro' }, t('reglages.fonctions.intro')),
      offered.length
        ? h('div', { class: 'group list-options' }, offered.map((name) => featureRow(features, name)))
        : h('div', { class: 'group group--pad' }, h('p', { class: 'muted' }, t('reglages.fonctions.aucune'))),
      h('div', { class: 'group-after' }, h('p', { class: 'muted' }, t(limited ? 'reglages.fonctions.note.autorisees' : 'reglages.fonctions.note'))));
    if (held) body.querySelector(`[data-key="${held}"]`)?.focus();
  }
  const idle = drawWhenIdle(body, () => draw());
  onLeave(onDataChange(idle.request)); // changé sur un autre appareil : suit
  onLeave(idle.stop);
  draw();

  return h('div', { class: 'screen' },
    topbar(t('reglages.fonctions'), () => goBack('settings')),
    body);
}
