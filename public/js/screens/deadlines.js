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
// - Attribution (11 novembre 2026) : si une de mes listes l'active, un choix
//   « Toutes / Les miennes » (retenu sur l'appareil) ; « Les miennes » ne
//   garde que les tâches qui me sont attribuées. Chaque ligne montre aussi
//   à qui est la tâche (« Moi » ou le prénom).
// - Cartes des projets (étape 4 du cadrage docs/cadrage-projets.md,
//   section 8) : celles des projets où j'ai allumé « Afficher dans
//   Échéances » (menu ⋮ du projet), mêlées aux tâches, avec l'icône des
//   projets et « Projet · Colonne » à la place de la liste ; toucher la
//   ligne ouvre la carte ; la case coche « Fait » pour qui peut modifier
//   cette carte (cardRights ; le serveur revérifie), sinon pas de case.
//   « Les miennes » : les cartes attribuées à moi et celles de personne.
//   Aucun projet allumé (ou projets coupés) : l'écran est celui d'avant.

import { h, icon, replace } from '../dom.js';
import { navigate } from '../router.js';
import { dueChip, dueDateLabel, priorityChip, todayKey } from '../format.js';
import { repeatChip, repeatSentence } from '../repeat.js';
import { listIcon } from '../list-icons.js';
import { canEditList, listOptions, memberNames } from '../store.js';
import { nestsSubtasks, parentOf } from '../subtasks.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, toast, drawWhenIdle, offlineBanner, watchNewDay, watchMinute } from '../ui.js';
import { topBell } from '../bell.js';
import { createSearchRow } from '../search-row.js';
import { isSearching, highlightParts, resultsLabel } from '../search.js';
import { computeDeadlines, assigneesFor, scopeOffered, loadDeadlineScope, saveDeadlineScope, deadlineProjects } from '../deadlines.js';
import { myCardRights } from '../project-store.js';
import * as projectActions from '../project-actions.js';
import { tabBar } from '../tabbar.js';
import { keycap } from '../shortcuts.js';
import * as actions from '../actions.js';
import { t, lowerFirst } from '../i18n.js';

export function renderDeadlines(onLeave) {
  const pc = isDesktop();
  // Des cartes de projets peuvent être montrées : quelques textes le disent
  // (sinon, ceux d'avant, inchangés)
  const withCards = () => deadlineProjects(app.data).size > 0;
  const cardsAtStart = withCards();
  const content = h('div', { class: 'scroll scroll--deadlines' });
  const searchMeta = h('p', { class: 'search-meta', role: 'status' });
  const searchLabel = cardsAtStart ? t('echeances.recherche.label.cartes') : t('echeances.recherche.label');
  const search = createSearchRow(content, {
    label: searchLabel,
    docked: pc,
    placeholder: pc ? t('echeances.recherche.placeholder.pc') : searchLabel,
    status: pc ? null : searchMeta,
    onChange: () => draw(),
    onOpen: () => tabBar().loupe.sync(),
  });
  if (!pc) tabBar().loupe.set(search.loupe);

  // « Toutes / Les miennes » : seulement si une de mes listes de tâches a
  // l'attribution activée ; le choix est retenu sur cet appareil
  let mine = loadDeadlineScope();
  const scopeButtons = [['all', t('echeances.filtre.toutes')], ['mine', t('echeances.filtre.miennes')]].map(([value, label]) => {
    const button = h('button', { class: 'segmented__opt', type: 'button', role: 'radio', onClick: () => {
      mine = value === 'mine';
      saveDeadlineScope(mine);
      paintScope();
      draw();
    } });
    button.dataset.value = value;
    button.dataset.label = label;
    return button;
  });
  const scope = h('div', { class: 'segmented deadlines-scope', role: 'radiogroup', 'aria-label': t('echeances.filtre.label') }, scopeButtons);
  const paintScope = () => {
    const offered = scopeOffered(app.data);
    scope.hidden = !offered;
    if (!offered) mine = false;
    for (const button of scopeButtons) {
      const on = (button.dataset.value === 'mine') === mine;
      button.setAttribute('aria-checked', String(on));
      replace(button, on ? icon('check', 'icon--sm icon--check') : null, button.dataset.label);
    }
  };

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
      const before = actions.undoOfRepeat(item);
      const nextPerson = actions.nextTurnOf(item);
      const list = app.data.lists.get(item.listId);
      const who = nextPerson === null ? null : nextPerson === app.user.id ? t('echeances.moi') : (list?.members ?? []).find((m) => m.id === nextPerson)?.displayName ?? '';
      actions.checkItem(item, true);
      const date = dueDateLabel(next);
      toast(who === null ? t('echeances.prochaineFois', { date }) : t('echeances.prochaineFois.personne', { date, name: who }), {
        action: t('echeances.annuler'),
        onAction: () => {
          const current = app.data.items.get(item.id);
          if (current && current.dueDate === next) actions.updateItem(current, before);
        },
      });
      return;
    }
    actions.checkItem(item, true);
    toast(t('echeances.coche', { name: item.name }), {
      action: t('echeances.annuler'),
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
    const spoken = [t('echeances.lu.dans', { name: list.name })];
    // Sous-tâche (subtasks.js) : le nom de sa tâche principale
    const parent = nestsSubtasks(list) ? parentOf(item, app.data.items) : null;
    if (parent) {
      chips.push(h('span', { class: 'chip' }, icon('layers', 'icon--xs'), parent.name));
      spoken.push(t('echeances.lu.sousTache', { name: parent.name }));
    }
    const priority = listOptions(list).priority ? priorityChip(item.priority) : null;
    if (priority) {
      chips.push(h('span', { class: `chip${item.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), priority.text));
      spoken.push(priority.label.toLowerCase());
    }
    const due = dueChip(item.dueDate, false, today, item.dueTime);
    const tone = due.state === 'late' ? ' chip--late' : due.state === 'today' ? ' chip--accent' : '';
    chips.push(h('span', { class: `chip${tone}` }, icon(due.state === 'late' ? 'alert' : 'calendar', 'icon--xs'), due.text));
    spoken.push(due.label.toLowerCase());
    if (item.repeat) {
      chips.push(h('span', { class: 'chip' }, icon('repeat', 'icon--xs'), repeatChip(item.repeat)));
      spoken.push(t('echeances.lu.repetition', { repeat: lowerFirst(repeatSentence(item.repeat)) }));
    }
    // À qui est la tâche (attribution activée) : « Moi » ou le prénom ;
    // plusieurs personnes : « Moi, Léa », « Léa +2 » (assign.js)
    const names = memberNames(list);
    const who = assigneesFor(item, list)
      .map((id) => (id === app.user.id ? { name: t('echeances.moi'), me: true } : names.has(id) ? { name: names.get(id), me: false } : null))
      .filter(Boolean).sort((a, b) => Number(b.me) - Number(a.me));
    if (who.length) {
      const text = who.length <= 2 ? who.map((p) => p.name).join(', ') : t('echeances.personnes.plus', { name: who[0].name, more: who.length - 1 });
      chips.push(h('span', { class: `chip${who.some((p) => p.me) ? ' chip--accent' : ''}` }, icon(who.length > 1 || item.assignMode === 'turn' ? 'users' : 'user', 'icon--xs'), text));
      spoken.push(t('echeances.lu.pour', { names: who.map((p) => (p.me ? t('echeances.lu.moi') : p.name)).join(', ') }));
    }
    const canCheck = canEditList(list);
    return h('li', { class: 'item', 'data-item-id': item.id },
      canCheck
        ? h('button', { class: 'check', type: 'button', 'aria-pressed': 'false', 'aria-label': item.name, onClick: () => check(item) }, h('span', { class: 'check__box' }))
        : h('span', { class: 'check check--static', role: 'img', 'aria-label': t('echeances.lectureSeule') }, h('span', { class: 'check__box' })),
      h('button', { class: 'item__body', type: 'button', 'aria-label': t('echeances.ouvrir', { name: item.name, details: spoken.join(', ') }), onClick: () => open(item) },
        h('span', { class: 'item__text' },
          h('span', { class: 'item__name' }, nameOf(item.name)),
          h('span', { class: 'item__meta' }, chips))));
  };

  // --- Cartes des projets ---

  // Cocher « Fait » depuis cet écran : même opération que dans la carte
  // (file d'attente hors ligne comprise) ; « Annuler » la décoche
  const markDone = (card) => {
    projectActions.setCardDone(card.id, true);
    toast(t('echeances.carte.faite', { name: card.title }), {
      action: t('echeances.annuler'),
      onAction: () => {
        const current = app.data.cards.get(card.id);
        if (current?.done) projectActions.setCardDone(current.id, false);
      },
    });
  };
  const openCard = (card) => navigate('projectCard', { id: card.projectId, cardId: card.id });

  // Ligne d'une carte : case « Fait » (seulement pour qui peut modifier la
  // carte ; sinon une place vide, sans case), titre, puis « Projet ·
  // Colonne », la priorité (option du projet), la date et les personnes
  const cardRow = ({ card, project, column }, today) => {
    const place = column ? t('echeances.carte.dans', { project: project.name, column: column.name }) : project.name;
    const chips = [h('span', { class: 'chip chip--list' }, icon('kanban', 'icon--xs'), place)];
    const spoken = [column ? t('echeances.carte.lu.dans', { project: project.name, column: column.name }) : t('echeances.carte.lu.projet', { project: project.name })];
    const priority = project.priorityEnabled ? priorityChip(card.priority) : null;
    if (priority) {
      chips.push(h('span', { class: `chip${card.priority === 'high' ? ' chip--accent' : ''}` }, icon(priority.icon, 'icon--xs'), priority.text));
      spoken.push(priority.label.toLowerCase());
    }
    const due = dueChip(card.dueDate, false, today, card.dueTime);
    const tone = due.state === 'late' ? ' chip--late' : due.state === 'today' ? ' chip--accent' : '';
    chips.push(h('span', { class: `chip${tone}` }, icon(due.state === 'late' ? 'alert' : 'calendar', 'icon--xs'), due.text));
    spoken.push(due.label.toLowerCase());
    // Personnes attribuées : « Moi » d'abord, puis les prénoms
    const names = new Map((project.members ?? []).map((member) => [member.id, member.displayName]));
    const who = (card.assigneeIds ?? [])
      .map((id) => (id === app.user.id ? { name: t('echeances.moi'), me: true } : names.has(id) ? { name: names.get(id), me: false } : null))
      .filter(Boolean).sort((a, b) => Number(b.me) - Number(a.me));
    if (who.length) {
      const text = who.length <= 2 ? who.map((p) => p.name).join(', ') : t('echeances.personnes.plus', { name: who[0].name, more: who.length - 1 });
      chips.push(h('span', { class: `chip${who.some((p) => p.me) ? ' chip--accent' : ''}` }, icon(who.length > 1 ? 'users' : 'user', 'icon--xs'), text));
      spoken.push(t('echeances.lu.pour', { names: who.map((p) => (p.me ? t('echeances.lu.moi') : p.name)).join(', ') }));
    }
    const canDone = myCardRights(app.data, card, app.user).edit;
    return h('li', { class: 'item', 'data-card-id': card.id },
      canDone
        ? h('button', { class: 'check', type: 'button', 'aria-pressed': 'false', 'aria-label': t('echeances.carte.case', { name: card.title }), onClick: () => markDone(card) }, h('span', { class: 'check__box' }))
        : h('span', { class: 'check check--static', 'aria-hidden': 'true' }),
      h('button', { class: 'item__body', type: 'button', 'aria-label': t('echeances.carte.ouvrir', { name: card.title, details: spoken.join(', ') }), onClick: () => openCard(card) },
        h('span', { class: 'item__text' },
          h('span', { class: 'item__name' }, nameOf(card.title)),
          h('span', { class: 'item__meta' }, chips))));
  };

  const draw = () => {
    if (!app.data.loaded) {
      searchMeta.textContent = '';
      search.show(h('p', { class: 'empty muted', role: 'status' }, t('echeances.chargement')));
      return;
    }
    const today = todayKey();
    const query = search.value;
    paintScope();
    const groups = computeDeadlines(app.data, { today, query: isSearching(query) ? query : '', mine, me: app.user.id });
    const count = groups.reduce((sum, group) => sum + group.entries.length, 0);
    const cards = withCards();
    searchMeta.textContent = isSearching(query) ? resultsLabel(count) : '';
    searchMeta.classList.toggle('visually-hidden', isSearching(query) && count === 0);
    if (!count) {
      search.show(isSearching(query) ? noResults(query, cards) : h('div', { class: 'empty' },
        h('div', { class: 'empty__icon' }, icon('calendar', 'icon--lg')),
        h('h2', { class: 'empty__title' }, t('echeances.vide.titre')),
        h('p', { class: 'empty__text' }, mine
          ? t(cards ? 'echeances.vide.miennes.cartes' : 'echeances.vide.miennes')
          : t(cards ? 'echeances.vide.texte.cartes' : 'echeances.vide.texte'))));
      return;
    }
    search.show(groups.map((group) => h('section', { 'data-group': group.key },
      h('h2', { class: 'aisle' },
        h('span', { class: 'aisle__name' }, group.title),
        h('span', { class: 'aisle__count', 'aria-label': t(cards ? 'echeances.groupe.nombre.cartes' : 'echeances.groupe.nombre', { count: group.entries.length }) }, String(group.entries.length))),
      h('ul', {}, group.entries.map((entry) => (entry.card ? cardRow(entry, today) : row(entry, today)))))));
    showSection();
  };
  // Ouvert depuis une ligne de la tuile « Échéances » de l'Accueil
  // (app.openDeadlines : « late », « today », « tomorrow »…) : la section
  // est amenée en haut de la zone qui défile, une seule fois (jamais de
  // curseur mis dans un champ)
  let section = app.openDeadlines;
  app.openDeadlines = null;
  // (la section est recherchée à l'image suivante : l'écran est alors
  // posé, et il a pu être redessiné entre-temps)
  const showSection = () => {
    if (!section) return;
    const key = section;
    section = null;
    requestAnimationFrame(() => {
      const target = content.querySelector(`[data-group="${key}"]`);
      if (target) content.scrollTop += target.getBoundingClientRect().top - content.getBoundingClientRect().top;
    });
  };
  // Aucune tâche trouvée : message, et « Effacer la recherche »
  const noResults = (query, cards) => h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon('search', 'icon--lg')),
    h('h2', { class: 'empty__title' }, t('echeances.recherche.aucun')),
    h('p', { class: 'empty__text' }, t(cards ? 'echeances.recherche.aucun.texte.cartes' : 'echeances.recherche.aucun.texte', { query: query.trim() })),
    h('button', {
      class: 'btn btn--secondary',
      type: 'button',
      onPointerdown: search.keepFocus.pointerdown,
      onMousedown: search.keepFocus.mousedown,
      onClick: () => search.clear(),
    }, t('echeances.recherche.effacer')));

  const idle = drawWhenIdle(content, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  onLeave(watchNewDay(draw));
  // Une tâche du jour à heure précise passe « En retard » à son heure
  onLeave(watchMinute(() => idle.request()));
  draw();
  refreshData({ quiet: true });

  if (pc) {
    const input = search.field.querySelector('input');
    input.setAttribute('aria-keyshortcuts', '/');
    search.field.append(keycap('/'));
    return h('div', { class: 'screen' },
      // Ligne du titre : titre, « À jour », cloche (Accueil coupé), recherche
      // (comme dans une liste ouverte) ; dessous : « Toutes / Les miennes »
      h('header', { class: 'pc-head' },
        h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__title' }, t('echeances.titre')),
          h('p', { class: 'pc-head__sub' }, t(cardsAtStart ? 'echeances.pc.sousTitre.cartes' : 'echeances.pc.sousTitre'))),
        syncPill(() => refreshData({ full: true })), topBell(onLeave),
        search.field),
      h('div', { class: 'pc-tools' }, scope, searchMeta),
      offlineBanner(),
      content);
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar topbar--plain topbar--status' },
      h('div', { class: 'topbar__main' }, h('h1', { class: 'topbar__title' }, t('echeances.titre'))),
      syncPill(() => refreshData({ full: true }), { inBar: true }),
      // Cloche des notifications : Accueil coupé seulement (bell.js)
      topBell(onLeave)),
    search.bar,
    scope,
    content);
}
