// Écran « Aide » (#/aide), ouvert depuis les Réglages. Tout le texte vient de
// help-content.js : cet écran ne fait que l'afficher.
// - en haut, « Qui peut quoi » : pour chaque action, les quatre rôles avec
//   « oui » ou « non » (icône ET texte, jamais la couleur seule), en blocs
//   empilés, lisibles à 320 px ;
// - puis les sections, repliables comme les groupes d'une liste (bouton
//   .aisle__toggle, aria-expanded, chevron qui tourne) ; au départ, seule la
//   première est dépliée. La section Administrateur n'est montrée qu'aux
//   comptes Admin (helpSections).
// Textes posés avec textContent (h() de dom.js), jamais en HTML. Aucun champ
// de saisie : rien ne prend le focus tout seul. Ce module ne dépend que de
// dom.js, router.js et help-content.js : il est testé automatiquement
// (test/help.test.js).

import { h, icon, iconButton } from '../dom.js';
import { goBack } from '../router.js';
import { ROLES, PERMISSIONS, PERMISSIONS_NOTE, helpSections } from '../help-content.js';

// user : le compte connecté (app.user), pour choisir les sections
export function renderHelp(user) {
  const sections = helpSections(user);
  return h('div', { class: 'screen' },
    // Barre du haut (même balisage que les Réglages) : retour vers les Réglages
    h('header', { class: 'topbar' },
      iconButton('chev-l', 'Retour', () => goBack('settings')),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, 'Aide'))),
    h('div', { class: 'body help' },
      whoCanWhat(),
      sections.map((section, index) => foldable(section, index === 0))));
}

// « Qui peut quoi » : un bloc par action, les quatre rôles dessous
function whoCanWhat() {
  return h('section', { class: 'help-who', 'aria-labelledby': 'aide-qui' },
    h('h2', { class: 'section-title', id: 'aide-qui' }, 'Qui peut quoi'),
    h('div', { class: 'group' }, PERMISSIONS.map((permission) => h('div', { class: 'help-who__row' },
      h('p', { class: 'help-who__action' }, permission.action),
      h('ul', { class: 'help-who__roles' }, ROLES.map((role) => {
        const yes = permission.roles.includes(role.key);
        return h('li', { class: `chip help-who__role${yes ? ' help-who__role--yes' : ' help-who__role--no'}` },
          icon(yes ? 'check' : 'close', 'icon--xs'),
          h('span', {}, role.label),
          h('span', { class: 'visually-hidden' }, yes ? ' : oui' : ' : non'));
      }))))),
    h('p', { class: 'help__note' }, PERMISSIONS_NOTE));
}

// Section repliable (même composant que les groupes d'une liste)
function foldable(section, open) {
  const bodyId = `aide-${section.id}`;
  const body = h('div', { class: 'help__section', id: bodyId }, section.topics.map(topic));
  const toggle = h('button', { class: 'aisle__toggle', type: 'button', 'aria-controls': bodyId },
    icon('chev-d', 'icon--sm'), h('span', { class: 'aisle__name' }, section.title));
  const show = (on) => {
    toggle.setAttribute('aria-expanded', String(on));
    body.hidden = !on;
  };
  toggle.addEventListener('click', () => show(toggle.getAttribute('aria-expanded') !== 'true'));
  show(open);
  return h('section', { class: 'help__part' }, h('h2', { class: 'aisle aisle--fold' }, toggle), body);
}

// Un sujet : titre, paragraphes, liste à puces facultative, puis
// paragraphes de fin facultatifs
function topic(entry) {
  const paragraphs = (texts) => (texts ?? []).map((text) => h('p', { class: 'help__text' }, text));
  return h('div', { class: 'card help__topic' },
    h('h3', { class: 'help__title' }, entry.title),
    paragraphs(entry.paragraphs),
    entry.items?.length ? h('ul', { class: 'help__list' }, entry.items.map((text) => h('li', {}, text))) : null,
    paragraphs(entry.after));
}
