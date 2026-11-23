// Écran « À offrir » (#/listes/a-offrir ; décisions du 23 novembre 2026,
// maquette page-a-offrir) : la liste AUTOMATIQUE de mes cadeaux, c'est-à-dire
// les souhaits que je réserve ou auxquels je participe, dans toutes les
// listes d'envies dont je suis membre (calculs : gifts.js).
//
// - Barre du haut : retour, « À offrir », pastille « Automatique » (#i-repeat).
//   Ni barre d'ajout, ni menu de liste : personne ne peut y ajouter, renommer,
//   partager ni supprimer quoi que ce soit.
// - Une phrase d'explication, puis « 5 cadeaux · 3 à acheter ».
// - Un groupe par personne (« Pour Zoé », rangés par prénom), chacun une
//   carte de lignes d'éléments (balisage du kit, .item) : case « Acheté »,
//   nom, « Noël de Zoé · Réservé » ou « · Vous participez (2 personnes) »,
//   prix en pastille. Les cadeaux achetés sont cochés ET barrés (jamais la
//   couleur seule), en bas de leur groupe.
// - « Acheté » est à moi seul (opération gift.bought, file d'attente : marche
//   hors ligne ; jamais montré à personne d'autre).
// - Toucher la ligne (pas la case) ouvre le souhait dans sa liste (sa fiche,
//   où l'on peut annuler la réservation).
// - Téléphone : bandeau du bas, « Listes » marqué. Ordinateur : la même page
//   au centre ; le menu de gauche montre « Types », Envies mis en avant.
// Tout vient de la copie locale. Textes posés avec textContent (h()) ;
// aucun curseur mis tout seul.

import { h, icon, iconButton, replace } from '../dom.js';
import { navigate, goBack } from '../router.js';
import { formatPrice, wishForLabel } from '../wishes.js';
import { computeGifts } from '../gifts.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, drawWhenIdle, offlineBanner } from '../ui.js';
import * as actions from '../actions.js';
import { t } from '../i18n.js';

// Pastille « Automatique » (icône ET texte)
export const autoChip = () => h('span', { class: 'chip chip--accent' }, icon('repeat', 'icon--xs'), t('offrir.automatique'));

// « Pour Zoé » : le prénom de la personne à qui va le souhait
export const forLabel = (gift) => (gift.recipient.name ? t('regles.envies.pour', { name: gift.recipient.name }) : wishForLabel(gift.list));

// Ligne sous le nom : « Noël de Zoé · Réservé » ou « Anniversaire de Léa ·
// Vous participez (2 personnes) »
export const giftLine = (gift) => (gift.alone
  ? t('offrir.ligne.reserve', { list: gift.list.name })
  : t('offrir.ligne.participe', { list: gift.list.name, count: gift.people }));

// Ouvrir le souhait dans sa liste (sa fiche s'ouvre à l'arrivée : list.js)
export function openGift(gift) {
  app.openItem = { listId: gift.list.id, itemId: gift.item.id };
  navigate('list', { id: gift.list.id });
}

export function renderGifts(onLeave) {
  const pc = isDesktop();
  const content = h('div', { class: 'scroll' });
  const count = h('p', { class: 'page-tools__count' });

  // Une ligne : case « Acheté » (état dans aria-pressed), puis le corps qui
  // ouvre le souhait dans sa liste
  const row = (gift) => {
    const { item, bought } = gift;
    const price = formatPrice(item.priceCents);
    const details = [giftLine(gift), price ? t('offrir.prix.lu', { price }) : null, bought ? t('offrir.achete.lu') : null].filter(Boolean).join(', ');
    return h('li', { class: `item${bought ? ' is-done' : ''}`, 'data-item-id': item.id },
      h('button', {
        class: 'check',
        type: 'button',
        'aria-pressed': String(bought),
        'aria-label': t('offrir.achete.nom', { name: item.name }),
        onClick: () => actions.setGiftBought(item.id, !bought),
      }, h('span', { class: 'check__box' }, bought ? icon('check') : null)),
      h('button', { class: 'item__body', type: 'button', 'aria-label': t('offrir.ouvrir', { name: item.name, details }), onClick: () => openGift(gift) },
        h('span', { class: 'item__text' },
          h('span', { class: 'item__name' }, item.name),
          h('span', { class: 'item__note' }, giftLine(gift))),
        price ? h('span', { class: 'item__qty' }, price) : null));
  };

  const empty = () => h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon('gift', 'icon--lg')),
    h('h2', { class: 'empty__title' }, t('offrir.vide.titre')),
    h('p', { class: 'empty__text' }, t('offrir.vide.texte')));

  const draw = () => {
    if (!app.data.loaded) {
      count.textContent = '';
      replace(content, h('p', { class: 'empty muted', role: 'status' }, t('offrir.chargement')));
      return;
    }
    const { groups, total, toBuy } = computeGifts(app.data, app.user.id);
    count.textContent = total ? t('offrir.resume', { gifts: t('offrir.cadeaux', { count: total }), count: toBuy }) : '';
    // Ordinateur : la phrase et le nombre sont dans l'en-tête
    const intro = pc ? null : h('p', { class: 'page-intro' }, t('offrir.intro'));
    if (!total) {
      replace(content, intro, empty());
      return;
    }
    replace(content,
      intro,
      pc ? null : h('div', { class: 'page-tools' }, count),
      groups.map((group) => h('section', {},
        h('h2', { class: 'aisle' },
          h('span', { class: 'aisle__name' }, forLabel(group.gifts[0])),
          h('span', { class: 'aisle__count', 'aria-label': t('offrir.cadeaux', { count: group.gifts.length }) }, String(group.gifts.length))),
        h('ul', {}, group.gifts.map(row)))));
  };
  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });

  if (pc) {
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' },
        h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__title' }, t('offrir.titre')), h('p', { class: 'pc-head__sub' }, t('offrir.intro'))),
        h('div', { class: 'pc-head__tools' }, autoChip())),
      h('div', { class: 'pc-tools' }, count, h('div', { class: 'pc-tools__end' }, syncPill(() => refreshData({ full: true })))),
      offlineBanner(),
      content);
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('offrir.retour'), () => goBack('lists')),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('offrir.titre'))),
      h('span', { class: 'topbar__chip' }, autoChip())),
    content);
}
