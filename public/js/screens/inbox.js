// Page Notifications (#/notifications ; étape 4 du cadrage
// docs/cadrage-accueil-notes-notifications.md, maquettes
// design/accueil-notes/captures/notifications-1 et notifications-2) : tout
// ce que Listo m'a signalé, même si je n'ai pas vu (ou pas reçu) la
// notification du téléphone. Ouverte par la cloche de l'Accueil et par la
// ligne « Notifications » de la tuile Compte ; à ne pas confondre avec
// Réglages › Notifications (#/reglages/notifications, notifications.js),
// où l'on choisit ce qu'on reçoit (bouton ⚙ en haut à droite).
//
// - Les lignes viennent de la copie locale (store.js, app.data.inbox),
//   déjà mises en phrases par le serveur dans la langue du compte
//   (server/inbox.js) : la page s'affiche hors ligne (dernière copie reçue).
// - Regroupées par jour (« Aujourd'hui », « Hier », puis la date), la plus
//   récente en haut. Non lue : texte en gras, icône bleue, point bleu, et
//   « Non lue » dans le nom lu (jamais la couleur seule).
// - Ouvrir la page ne marque RIEN comme lu (décision du 23 novembre 2026) :
//   toucher une ligne la marque lue et ouvre sa cible (liste, fiche d'un
//   élément, note, Échéances) ; « Tout marquer comme lu » en haut. Une
//   cible disparue (liste supprimée, partage retiré) : un message, rien ne s'ouvre.
// - Effacer : glisser une ligne vers la gauche (raccourci, comme les
//   lignes d'une liste), ou son bouton ⋮ (clavier, lecteurs d'écran ;
//   visible au focus, et au survol sur ordinateur) ; « Tout effacer » en
//   bas, avec confirmation.
// - Lire et effacer passent par la file d'attente (actions.js) : hors
//   ligne, la page change tout de suite, le serveur suit au retour du
//   réseau ; lu sur un appareil = lu sur tous (temps réel).
// - Ni bandeau du bas ni loupe (maquette) ; sur ordinateur, dans la partie
//   principale, avec les seules entrées fixes du menu de gauche.
// Textes posés avec textContent (h()) ; aucun curseur mis tout seul.

import { h, icon, iconButton, replace } from '../dom.js';
import { navigate, goBack } from '../router.js';
import { app, onDataChange, refreshData, openingScreen } from '../app.js';
import * as actions from '../actions.js';
import { inboxUnread, inboxTargetAvailable } from '../store.js';
import { toast, confirmDialog, openMenu, drawWhenIdle, watchNewDay, offlineBanner } from '../ui.js';
import { createSwipeController } from '../swipe.js';
import { todayKey, addDays } from '../format.js';
import { t, formatDate, formatTime, getLocale, intlTag } from '../i18n.js';

// Icône de chaque sorte de ligne (kind, donné par le serveur)
export const INBOX_ICONS = {
  changes: 'pencil',
  turn: 'repeat',
  reminder: 'clock',
  digest: 'calendar',
  wishes: 'gift',
  sharing: 'users',
};

// Jour local d'une date ISO (« 2026-11-23 »)
export function dayKeyOf(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return todayKey(date);
}

// Titre d'un jour : « Aujourd'hui », « Hier », puis « Samedi 21 novembre »
// (dans la langue des écrans, première lettre en majuscule)
export function dayTitle(key, today = todayKey()) {
  if (key === today) return t('inbox.aujourdhui');
  if (key === addDays(today, -1)) return t('inbox.hier');
  const [y, m, d] = key.split('-').map(Number);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  const text = formatDate(new Date(y, m - 1, d), { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
  return text.charAt(0).toLocaleUpperCase(intlTag(getLocale())) + text.slice(1);
}

// Lignes groupées par jour, dans l'ordre reçu (la plus récente en haut)
export function groupByDay(rows) {
  const days = [];
  for (const row of rows) {
    const key = dayKeyOf(row.at);
    const last = days.at(-1);
    if (last && last.key === key) last.rows.push(row);
    else days.push({ key, rows: [row] });
  }
  return days;
}

// Message d'une cible disparue
const unavailableText = (row) => t(row.targetType === 'note' ? 'inbox.indisponible.note' : row.targetType === 'item' ? 'inbox.indisponible.element' : 'inbox.indisponible.liste');

// Ouvre la cible d'une ligne (et la marque lue)
export function openRow(row) {
  actions.markInboxRead([row.id]);
  if (!inboxTargetAvailable(app.data, row.target)) {
    toast(unavailableText(row));
    return;
  }
  const { target } = row;
  switch (target.type) {
    case 'list': navigate('list', { id: target.listId }); break;
    case 'item':
      // Fiche de l'élément ouverte en arrivant dans sa liste (comme Échéances)
      app.openItem = { listId: target.listId, itemId: target.itemId };
      navigate('list', { id: target.listId });
      break;
    case 'note': navigate('note', { id: target.noteId }); break;
    case 'deadlines': navigate('deadlines'); break;
    default:
  }
}

export function renderInbox(onLeave) {
  const content = h('div', { class: 'body body--flush' });
  const tools = h('div', { class: 'page-tools inbox-tools' });
  const swipes = createSwipeController(content);
  onLeave(() => swipes.stop());

  const toSettings = () => navigate('notifications');

  // Une ligne : bouton qui ouvre la cible, zone rouge « Effacer » derrière
  // (glissement), bouton ⋮ (menu : marquer comme lue, effacer)
  function rowOf(row) {
    const unread = !row.read;
    const time = formatTime(new Date(row.at), { twoDigits: true });
    const button = h('button', {
      class: `inbox-row swipe__slide${unread ? ' is-unread' : ''}`,
      type: 'button',
      'aria-label': t(unread ? 'inbox.ligne.nonLue' : 'inbox.ligne', { text: row.text, sub: row.sub, time }),
      onClick: () => openRow(row),
    },
    h('span', { class: 'row__icon' }, icon(INBOX_ICONS[row.kind] ?? 'bell')),
    h('span', { class: 'inbox-row__body' },
      h('span', { class: 'inbox-row__text' }, row.text),
      row.sub ? h('span', { class: 'inbox-row__sub' }, row.sub) : null),
    h('span', { class: 'inbox-row__end' },
      h('span', { class: 'inbox-row__time' }, time),
      unread ? h('span', { class: 'inbox-row__dot', 'aria-hidden': 'true' }) : null));
    const remove = () => {
      swipes.close();
      actions.deleteInboxRow(row.id);
      toast(t('inbox.effacee'), { low: true });
    };
    const del = h('button', { class: 'swipe__delete', type: 'button', 'aria-label': t('inbox.effacer.lu'), onClick: remove },
      icon('trash', 'icon--sm'), h('span', {}, t('inbox.effacer')));
    const more = iconButton('more', t('inbox.options'), (event) => {
      openMenu([
        unread ? { icon: 'check', label: t('inbox.marquerLue'), onSelect: () => actions.markInboxRead([row.id]) } : null,
        { icon: 'trash', label: t('inbox.effacer'), danger: true, onSelect: remove },
      ].filter(Boolean), { label: t('inbox.options'), anchor: event.currentTarget });
    }, 'inbox-row__more');
    more.setAttribute('aria-haspopup', 'menu');
    // Glisser vers la droite : marquer comme lue (ligne non lue seulement)
    const readZone = unread ? h('span', { class: 'swipe__right', 'aria-hidden': 'true' }, icon('check', 'icon--sm'), h('span', {}, t('inbox.lue'))) : null;
    const item = h('div', { class: 'inbox-item swipe' }, readZone, button, del, more);
    swipes.attach(item, button, del, unread ? { onRight: () => actions.markInboxRead([row.id]) } : {});
    return item;
  }

  function draw() {
    const { rows, loaded } = app.data.inbox ?? { rows: [], loaded: false };
    if (!loaded) {
      replace(tools);
      replace(content, h('p', { class: 'empty muted', role: 'status' }, t('inbox.chargement')));
      return;
    }
    if (!rows.length) {
      tools.hidden = true;
      replace(content, h('div', { class: 'empty' },
        h('span', { class: 'empty__icon' }, icon('bell', 'icon--lg')),
        h('h2', { class: 'empty__title' }, t('inbox.vide.titre')),
        h('p', { class: 'empty__text' }, t('inbox.vide.texte')),
        h('button', { class: 'btn btn--secondary', type: 'button', onClick: toSettings }, icon('sliders', 'icon--sm'), t('inbox.reglages'))));
      return;
    }
    tools.hidden = false;
    const unread = inboxUnread(app.data);
    replace(tools,
      h('span', { class: 'page-tools__count', role: 'status' }, unread ? t('inbox.nonLues', { count: unread }) : t('inbox.toutLues')),
      h('button', { class: 'cart__action', type: 'button', hidden: unread === 0, onClick: () => actions.markAllInboxRead() },
        icon('check-double', 'icon--sm'), t('inbox.toutLu')));
    const today = todayKey();
    replace(content,
      ...groupByDay(rows).map((day, index) => [
        h('h2', { class: `section-title${index === 0 ? ' inbox-day' : ''}` }, dayTitle(day.key, today)),
        h('div', { class: 'group' }, day.rows.map(rowOf)),
      ]),
      h('div', { class: 'inbox-foot' },
        h('button', { class: 'cart__action cart__action--danger', type: 'button', onClick: clearAll }, icon('trash', 'icon--sm'), t('inbox.toutEffacer')),
        h('p', { class: 'inbox-foot__hint' }, t('inbox.garde'))));
  }

  async function clearAll() {
    const ok = await confirmDialog({
      title: t('inbox.toutEffacer.question'),
      text: t('inbox.toutEffacer.texte'),
      confirmLabel: t('inbox.toutEffacer'),
    });
    if (!ok) return;
    actions.clearInbox();
    toast(t('inbox.toutesEffacees'), { low: true });
  }

  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  onLeave(watchNewDay(draw)); // à minuit : « Aujourd'hui » devient « Hier »
  draw();
  refreshData({ quiet: true });

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      // Retour : l'écran d'avant ; ouverte directement, le premier écran
      // (l'Accueil, ou l'écran choisi quand il est coupé)
      iconButton('chev-l', t('reglages.retour'), () => goBack(openingScreen())),
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('inbox.titre'))),
      iconButton('sliders', t('inbox.reglages'), toSettings)),
    offlineBanner(),
    tools,
    content);
}
