// Écran « Échéances » (décision du 11 novembre 2026) : les tâches à faire
// qui ont une échéance, dans toutes mes listes de tâches où l'option
// « Échéance » est activée, rangées en « En retard », « Aujourd'hui »,
// « Demain », « Cette semaine » et « Plus tard » (calculs : deadlines.js).
// Jamais une liste d'envies ni une liste de courses.
//
// - Chaque ligne montre la tâche, sa liste, sa priorité (si activée) et sa
//   date (et sa répétition). Le rond coche la tâche (seulement si j'ai le
//   droit de modifier la liste ; le serveur revérifie) : elle quitte
//   l'écran, avec « Annuler » ; une tâche qui se répète revient à sa date
//   suivante (« Prochaine fois : … »).
//   Toucher la ligne ouvre la tâche dans sa liste.
// - Tout vient de la copie locale : l'écran marche hors ligne, et un coche
//   hors ligne passe par la file d'attente, comme dans une liste.
// - Recherche : téléphone, la loupe du bandeau du bas ouvre le champ sous le
//   titre ; ordinateur, le champ est dans l'en-tête. Sur le nom des tâches.
// - « Aujourd'hui », « Demain »… sont recalculés à minuit et au retour au
//   premier plan.

import { h, icon } from '../dom.js';
import { navigate } from '../router.js';
import { dueChip, dueDateLabel, priorityChip, todayKey } from '../format.js';
import { repeatChip, repeatSentence } from '../repeat.js';
import { listIcon } from '../list-icons.js';
import { canEditList, listOptions } from '../store.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, toast, drawWhenIdle, offlineBanner, watchNewDay } from '../ui.js';
import { createSearchRow } from '../search-row.js';
import { isSearching, highlightParts, resultsLabel } from '../search.js';
import { computeDeadlines } from '../deadlines.js';
import { tabBar } from '../tabbar.js';
import { keycap } from '../shortcuts.js';
import * as actions from '../actions.js';

export function renderDeadlines(onLeave) {
  const pc = isDesktop();
  const content = h('div', { class: 'scroll scroll--deadlines' });
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const search = createSearchRow(content, {
    label: 'Rechercher une tâche',
    docked: pc,
    placeholder: pc ? 'Rechercher' : 'Rechercher une tâche',
    status: pc ? null : searchMeta,
    onChange: () => draw(),
    onOpen: () => tabBar().loupe.sync(),
  });
  if (!pc) tabBar().loupe.set(search.loupe);

  // Nom de la tâche, le texte cherché dans <mark class="hit"> (texte simple)
  const nameOf = (name) => (isSearching(search.value)
    ? highlightParts(name, search.value).map((part) => (part.hit ? h('mark', { class: 'hit' }, part.text) : part.text))
    : name);

  // Cocher depuis cet écran : même opération que dans la liste (file
  // d'attente hors ligne comprise) ; « Annuler » la décoche. Une tâche qui
  // se répète reste à l'écran, à sa date suivante ; « Annuler » remet
  // l'ancienne date.
  const check = (item) => {
    const next = actions.nextDueOf(item);
    if (next) {
      const before = { dueDate: item.dueDate };
      actions.checkItem(item, true);
      toast(`Prochaine fois : ${dueDateLabel(next)}`, {
        action: 'Annuler',
        onAction: () => {
          const current = app.data.items.get(item.id);
          if (current && current.dueDate === next) actions.updateItem(current, before);
        },
      });
      return;
    }
    actions.checkItem(item, true);
    toast(`Coché : ${item.name}`, {
      action: 'Annuler',
      onAction: () => {
        const current = app.data.items.get(item.id);
        if (current?.checked) actions.checkItem(current, false);
      },
    });
  };
  // Ouvrir la tâche dans sa liste (sa fiche s'ouvre à l'arrivée : list.js)
  const open = (item) => {
    app.openItem = { listId: item.listId, itemId: item.id };
    navigate('list', { id: item.listId });
  };

  // Ligne d'une tâche : rond (ou rond inactif en lecture seule), nom, puis
  // la liste, la priorité et la date (texte ET icône, jamais la couleur seule)
  const row = ({ item, list }, today) => {
    const chips = [h('span', { class: 'chip chip--list' }, icon(listIcon(list), 'icon--xs'), list.name)];
    const spoken = [`dans ${list.name}`];
    const priority = listOptions(list).priority ? priorityChip(item.priority) : null;
    if (priority) {
      chips.push(h('span', { class: `chip${item.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), priority.text));
      spoken.push(priority.label.toLowerCase());
    }
    const due = dueChip(item.dueDate, false, today);
    const tone = due.state === 'late' ? ' chip--late' : due.state === 'today' ? ' chip--accent' : '';
    chips.push(h('span', { class: `chip${tone}` }, icon(due.state === 'late' ? 'alert' : 'calendar', 'icon--xs'), due.text));
    spoken.push(due.label.toLowerCase());
    if (item.repeat) {
      chips.push(h('span', { class: 'chip' }, icon('repeat', 'icon--xs'), repeatChip(item.repeat)));
      spoken.push(`se répète : ${repeatSentence(item.repeat).toLowerCase()}`);
    }
    const canCheck = canEditList(list);
    return h('li', { class: 'item', 'data-item-id': item.id },
      canCheck
        ? h('button', { class: 'check', type: 'button', 'aria-pressed': 'false', 'aria-label': `Cocher ${item.name}`, onClick: () => check(item) }, h('span', { class: 'check__box' }))
        : h('span', { class: 'check check--static', role: 'img', 'aria-label': 'Non coché, lecture seule' }, h('span', { class: 'check__box' })),
      h('button', { class: 'item__body', type: 'button', 'aria-label': `Ouvrir ${item.name}, ${spoken.join(', ')}`, onClick: () => open(item) },
        h('span', { class: 'item__text' },
          h('span', { class: 'item__name' }, nameOf(item.name)),
          h('span', { class: 'item__meta' }, chips))));
  };

  const draw = () => {
    if (!app.data.loaded) {
      searchMeta.textContent = '';
      search.show(h('p', { class: 'empty muted', role: 'status' }, 'Chargement…'));
      return;
    }
    const today = todayKey();
    const query = search.value;
    const groups = computeDeadlines(app.data, { today, query: isSearching(query) ? query : '' });
    const count = groups.reduce((sum, group) => sum + group.entries.length, 0);
    searchMeta.textContent = isSearching(query) ? resultsLabel(count) : '';
    searchMeta.classList.toggle('visually-hidden', isSearching(query) && count === 0);
    if (!count) {
      search.show(isSearching(query) ? noResults(query) : h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon('calendar', 'icon--lg')),
        h('h2', { class: 'empty__title' }, 'Aucune échéance'),
        h('p', { class: 'empty__text' }, 'Les tâches à faire qui ont une échéance apparaissent ici, toutes listes confondues. Pour en donner une, activez l\'option « Échéance » dans « Modifier la liste ».')));
      return;
    }
    search.show(groups.map((group) => h('section', {},
      h('h2', { class: 'aisle' },
        h('span', { class: 'aisle__name' }, group.title),
        h('span', { class: 'aisle__count', 'aria-label': `${group.entries.length} ${group.entries.length > 1 ? 'tâches' : 'tâche'}` }, String(group.entries.length))),
      h('ul', {}, group.entries.map((entry) => row(entry, today))))));
  };
  // Aucune tâche trouvée : message, et « Effacer la recherche »
  const noResults = (query) => h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon('search', 'icon--lg')),
    h('h2', { class: 'empty__title' }, 'Aucun résultat'),
    h('p', { class: 'empty__text' }, `Aucune tâche ne correspond à « ${query.trim()} ».`),
    h('button', {
      class: 'btn btn--secondary',
      type: 'button',
      onPointerdown: search.keepFocus.pointerdown,
      onMousedown: search.keepFocus.mousedown,
      onClick: () => search.clear(),
    }, 'Effacer la recherche'));

  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  onLeave(watchNewDay(draw));
  draw();
  refreshData({ quiet: true });

  if (pc) {
    const input = search.field.querySelector('input');
    input.setAttribute('aria-keyshortcuts', '/');
    search.field.append(keycap('/'));
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' },
        h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__title' }, 'Échéances'),
          h('p', { class: 'pc-head__sub' }, 'Les tâches à faire de toutes vos listes')),
        search.field),
      h('div', { class: 'pc-tools' }, syncPill(() => refreshData({ full: true })), searchMeta),
      offlineBanner(),
      content);
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar topbar--plain topbar--status' },
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, 'Échéances')),
      syncPill(() => refreshData({ full: true }), { inBar: true })),
    search.bar,
    content);
}
