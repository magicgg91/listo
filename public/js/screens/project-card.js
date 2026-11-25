// Une carte ouverte (#/projets/<id>/cartes/<carte> ; docs/cadrage-projets.md,
// étape 1, sections 4.3 et 4.4 ; maquettes design/projets/captures/carte-1
// et pc-carte-1).
//
// Étape 1 : le titre, la colonne (un bouton qui déplace), les étiquettes,
// et les actions « Déplacer vers… », « Monter », « Descendre »,
// « Dupliquer », « Supprimer », selon mon rôle sur CETTE carte (cardRights).
// Les autres champs (personnes, échéance et « Fait », priorité,
// description, liens, commentaires, historique) arrivent aux étapes 2 et
// 3 : rien n'est montré avant qu'ils marchent.
//
// - Téléphone : un écran entier, comme une note : barre du haut (retour au
//   projet, pastille d'état, menu ⋮ de la carte), titre en grand, colonne
//   (« Relecture ⌄ », dans sa couleur : ouvre « Déplacer vers… »), puis le
//   champ « Étiquettes » (les siennes et « + Étiquette »).
// - Ordinateur : une fenêtre au centre, par-dessus le projet (qui reste
//   ouvert dessous) : à gauche le titre et « dans Relecture · DomoPi
//   Articles · créée par Guillaume le 2 octobre » ; à droite, dans cet
//   ordre, Colonne, Étiquettes, puis Actions (« Déplacer vers… » M,
//   Dupliquer, Supprimer). L'adresse est celle de la carte (on peut
//   l'envoyer, y revenir) ; Échap ou la croix la ferment et ramènent au
//   projet ; le focus reste dedans, puis revient au tableau.
// - Un seul chemin pour remplir un champ (remarque du propriétaire du
//   25 novembre 2026) : le champ lui-même, avec son « + ».
// - Le titre se modifie en le touchant (1 à 200 caractères ; le curseur va
//   dans le champ : geste fait pour écrire), enregistré en quittant le
//   champ ou avec Entrée (Échap annule). Jamais de curseur à l'ouverture.
// - Une carte que mon rôle ne permet pas de modifier (Lecture seule ;
//   Contributeur sur une carte qu'il n'a pas créée et qui ne lui est pas
//   attribuée) : sans « + », sans saisie, avec la ligne « Lecture seule »
//   ou « Vous pouvez la lire, pas la modifier » ; jamais un bouton qui ne
//   marche pas.
// - Enregistrement automatique (file d'attente, hors ligne compris) ; le
//   serveur revérifie tout. Textes posés par textContent (h()).

import { h, icon, iconButton, replace } from '../dom.js';
import { navigate, goBack } from '../router.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { syncPill, openMenu, openSheet, openPanel, toast, drawWhenIdle } from '../ui.js';
import { t, formatDate } from '../i18n.js';
import { projectRights, cleanCardTitle, CARD_TITLE_MAX, LABELS_PER_CARD_MAX } from '../projects.js';
import * as projectActions from '../project-actions.js';
import { singleKeysOn, keycap } from '../shortcuts.js';
import { labelChip } from './note-labels.js';
import { liveProject, rightsOn, cardLabels, labelRow, cardMenuItems, openMoveSheet, duplicateCard, deleteCard, projectGone } from './project.js';
import { openLabelSheet } from './project-settings.js';

// La carte (présente, dans un projet ouvert que je vois), ou null
function cardOf(projectId, cardId) {
  const card = app.data.cards.get(cardId);
  const project = liveProject(projectId);
  return card && project && card.projectId === projectId && !card.deletedAt ? { card, project } : null;
}

// Carte introuvable (supprimée, d'un autre projet, jamais visible)
const cardGone = (projectId) => h('div', { class: 'empty' },
  h('div', { class: 'empty__icon' }, icon('kanban', 'icon--lg')),
  h('h2', { class: 'empty__title' }, t('projets.carte.introuvable.titre')),
  h('p', { class: 'empty__text' }, t('projets.carte.introuvable.texte')),
  h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => navigate('project', { id: projectId }, { replace: true }) }, t('projets.retourProjet')));

// --- Feuille « Étiquettes » d'une carte : les étiquettes du projet à cocher
// (10 au plus) ; « Nouvelle étiquette » pour le propriétaire et « Peut
// modifier » (elle est posée tout de suite sur la carte) ---
export function openCardLabelsSheet(cardId) {
  const found = () => {
    const card = app.data.cards.get(cardId);
    const project = card ? liveProject(card.projectId) : null;
    return card && project && !card.deletedAt ? { card, project } : null;
  };
  const start = found();
  if (!start || !rightsOn(start.card, start.project).edit) return null;
  const list = h('div', { class: 'group' });
  const toggle = (labelId) => {
    const now = found();
    if (!now) return;
    const ids = new Set(now.card.labelIds ?? []);
    if (ids.has(labelId)) ids.delete(labelId);
    else if (ids.size >= LABELS_PER_CARD_MAX) {
      toast(t('projets.etiquettes.limiteCarte', { max: LABELS_PER_CARD_MAX }));
      return;
    } else ids.add(labelId);
    projectActions.setCardLabels(cardId, [...ids]);
  };
  const draw = () => {
    const now = found();
    if (!now) {
      sheet.close();
      return;
    }
    const chosen = new Set(now.card.labelIds ?? []);
    const held = list.contains(document.activeElement) ? document.activeElement.dataset.label : null;
    replace(list, (now.project.labels ?? []).length
      ? now.project.labels.map((label) => {
        const on = chosen.has(label.id);
        const row = h('button', { class: 'tick-row', type: 'button', role: 'checkbox', 'aria-checked': String(on), 'data-label': label.id, onClick: () => toggle(label.id) },
          h('span', { class: `tick${on ? ' is-on' : ''}`, 'aria-hidden': 'true' }, on ? icon('check') : null), labelChip(label));
        return row;
      })
      : h('p', { class: 'kfield__empty' }, t('projets.etiquettes.aucune')));
    if (held) list.querySelector(`[data-label="${held}"]`)?.focus();
  };
  const manager = projectRights(start.project.role).labels;
  const stop = onDataChange(draw);
  const sheet = openSheet({
    title: t('projets.etiquettes'),
    sub: start.card.title,
    content: [
      list,
      manager ? h('button', { class: 'btn btn--secondary btn--block kform__more', type: 'button', onClick: () => openLabelSheet(start.project.id, null, { onCreated: (id) => toggle(id) }) },
        icon('plus', 'icon--sm'), t('projets.etiquette.nouvelle')) : null,
      manager ? null : h('p', { class: 'field__hint' }, t('projets.etiquettes.gerer')),
    ],
    scroll: true,
    pc: 'modal',
    size: 'sm',
    onClose: stop,
  });
  draw();
  return sheet;
}

// --- Morceaux communs au téléphone et à l'ordinateur ---

// Titre : texte (lecture) ou bouton qui passe en saisie (modifier)
function titlePart(getCard, canEdit, className) {
  const slot = h('div', { class: 'kc__titlebox' });
  let editing = false;
  const show = () => {
    const card = getCard();
    if (!card || editing) return;
    if (!canEdit()) {
      replace(slot, h('h1', { class: className }, card.title));
      return;
    }
    replace(slot, h('h1', { class: className }, h('button', {
      class: 'kc__titlebtn', type: 'button', 'aria-label': t('projets.carte.renommer.lu', { name: card.title }), onClick: edit,
    }, card.title)));
  };
  function edit() {
    const card = getCard();
    if (!card) return;
    editing = true;
    const input = h('textarea', { class: `${className} kc__titleinput`, rows: '2', maxlength: String(CARD_TITLE_MAX), 'aria-label': t('projets.carte.titre'), enterkeyhint: 'done' });
    input.value = card.title;
    let cancelled = false;
    const done = () => {
      if (!editing) return;
      editing = false;
      const value = cleanCardTitle(input.value);
      const now = getCard();
      if (!cancelled && now && value && value !== now.title) projectActions.renameCard(now.id, value);
      else if (!cancelled && !value) toast(t('projets.carte.titreVide'));
      show();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelled = true;
        input.blur();
      }
    });
    input.addEventListener('blur', done);
    replace(slot, input);
    // Geste fait pour écrire (toucher le titre) : le curseur va à la fin
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  return { el: slot, show, editing: () => editing };
}

// Bouton de la colonne, dans sa couleur (« Relecture ⌄ ») : ouvre « Déplacer
// vers… » ; sans le droit de déplacer, la colonne est seulement écrite
function columnPart(card, project, className) {
  const column = (project.columns ?? []).find((c) => c.id === card.columnId);
  const name = column?.name ?? '';
  const color = column?.color ?? 'gris';
  if (!rightsOn(card, project).move) {
    return h('span', { class: `${className} c-${color} is-static` }, h('span', { class: 'coldot', 'aria-hidden': 'true' }), t('projets.carte.dans', { name }));
  }
  return h('button', {
    class: `${className} c-${color}`, type: 'button', 'aria-haspopup': 'dialog', 'aria-label': t('projets.carte.colonne.lu', { name }),
    onClick: () => openMoveSheet(card.id),
  }, h('span', { class: 'coldot', 'aria-hidden': 'true' }), name, icon('chev-d'));
}

// Étiquettes de la carte et « + Étiquette » (qui peut modifier la carte)
function labelsValue(card, project) {
  const labels = cardLabels(card, project);
  const canEdit = rightsOn(card, project).edit;
  return [
    labels.map((label) => labelChip(label)),
    canEdit ? h('button', { class: 'kadd', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': labels.length ? t('projets.carte.etiquettes.modifier') : null, onClick: () => openCardLabelsSheet(card.id) },
      icon('plus'), labels.length ? null : t('projets.carte.etiquette')) : null,
    !labels.length && !canEdit ? h('span', { class: 'kfield__empty' }, t('projets.carte.aucuneEtiquette')) : null,
  ];
}

// Ligne de ce qu'on ne peut pas faire sur cette carte (jamais un bouton qui
// ne marche pas)
function readOnlyNote(card, project) {
  if (rightsOn(card, project).edit) return null;
  const text = project.role === 'reader' ? t('projets.carte.lectureSeule') : t('projets.carte.lireSeulement');
  return h('p', { class: 'note kc__readonly' }, icon('eye', 'icon--sm'), h('span', {}, text));
}

// « dans Publiés · DomoPi Articles · créée par Guillaume le 2 octobre »
function wherePhrase(card, project) {
  const column = (project.columns ?? []).find((c) => c.id === card.columnId);
  const date = formatDate(new Date(card.createdAt), { day: 'numeric', month: 'long' });
  return card.createdByName
    ? t('projets.carte.ou.par', { column: column?.name ?? '', project: project.name, name: card.createdByName, date })
    : t('projets.carte.ou', { column: column?.name ?? '', project: project.name, date });
}

// --- Téléphone : un écran entier ---
export function renderProjectCard(projectId, cardId, onLeave) {
  const found = () => cardOf(projectId, cardId);
  const title = titlePart(() => found()?.card ?? null, () => {
    const f = found();
    return Boolean(f) && rightsOn(f.card, f.project).edit;
  }, 'kc__title');
  const body = h('div', { class: 'kc' });
  const scroll = h('div', { class: 'scroll' }, body);
  const menuLabel = t('projets.plusActions');
  const back = () => goBack('project', { id: projectId });
  const menuButton = iconButton('more', menuLabel, () => {
    const f = found();
    if (!f) return;
    const items = cardMenuItems(f.card, f.project, { onGone: back });
    if (items.length) openMenu(items, { label: menuLabel, anchor: menuButton });
  });
  menuButton.setAttribute('aria-haspopup', 'menu');
  menuButton.setAttribute('aria-expanded', 'false');

  const draw = () => {
    if (!app.data.loaded) return;
    const f = found();
    if (!f) {
      menuButton.hidden = true;
      replace(body, cardGone(projectId));
      return;
    }
    const { card, project } = f;
    menuButton.hidden = !cardMenuItems(card, project).length;
    document.title = `${card.title} · Listo`;
    if (!title.editing()) title.show();
    replace(body,
      title.el,
      columnPart(card, project, 'kc__where'),
      readOnlyNote(card, project),
      h('div', { class: 'group kfields' },
        h('div', { class: 'kfield' },
          h('span', { class: 'kfield__name' }, icon('tag'), t('projets.etiquettes')),
          h('span', { class: 'kfield__value' }, labelsValue(card, project)))));
  };
  const idle = drawWhenIdle(body, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      iconButton('chev-l', t('projets.retourProjet'), back),
      h('span', { class: 'grow' }),
      syncPill(() => refreshData({ full: true })),
      menuButton),
    scroll);
}

// --- Ordinateur : la fenêtre au centre, par-dessus le projet ---
// Fermée par la croix ou Échap (pas par un changement d'écran) : retour au
// projet. Renvoie la fenêtre (close).
export function openProjectCardPanel(projectId, cardId) {
  const found = () => cardOf(projectId, cardId);
  const hash = location.hash;
  const titleId = `carte-${Math.random().toString(36).slice(2, 8)}`;
  const title = titlePart(() => found()?.card ?? null, () => {
    const f = found();
    return Boolean(f) && rightsOn(f.card, f.project).edit;
  }, 'kc__title');
  const main = h('div', { class: 'kdialog__main' });
  const side = h('div', { class: 'kdialog__side' });
  let close = () => {};
  const closeButton = iconButton('close', t('projets.carte.fermer'), () => close(), 'kdialog__close');

  const draw = () => {
    const f = found();
    if (!f) {
      replace(main, app.data.loaded ? cardGone(projectId) : null);
      replace(side, closeButton);
      return;
    }
    const { card, project } = f;
    const can = rightsOn(card, project);
    if (!title.editing()) title.show();
    title.el.querySelector('h1')?.setAttribute('id', titleId);
    replace(main, title.el, h('p', { class: 'kdialog__sub' }, wherePhrase(card, project)), readOnlyNote(card, project));
    const section = (text) => h('h2', { class: 'kc__section' }, text);
    const actions = [
      can.move ? h('button', { class: 'kside', type: 'button', 'data-shortcut': 'm', 'aria-keyshortcuts': 'M', 'aria-haspopup': 'dialog', onClick: () => openMoveSheet(card.id) },
        icon('move'), t('projets.carte.deplacer'), keycap('M')) : null,
      can.duplicate ? h('button', { class: 'kside', type: 'button', onClick: () => duplicateCard(card) }, icon('copy'), t('projets.carte.dupliquer')) : null,
      can.remove ? h('button', { class: 'kside kside--danger', type: 'button', onClick: () => deleteCard(card, () => close()) }, icon('trash'), t('projets.carte.supprimer')) : null,
    ].filter(Boolean);
    replace(side,
      closeButton,
      section(t('projets.carte.colonne')),
      columnPart(card, project, 'kside kside--col'),
      section(t('projets.etiquettes')),
      h('div', { class: 'kside-field' }, labelsValue(card, project)),
      actions.length ? [section(t('projets.carte.actionsTitre')), actions] : null);
  };

  // M : « Déplacer vers… » (raccourci à une touche, jamais pendant la saisie)
  const onKey = (event) => {
    if (event.key.toLowerCase() !== 'm' || !singleKeysOn() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const f = found();
    if (f && rightsOn(f.card, f.project).move) {
      event.preventDefault();
      openMoveSheet(cardId);
    }
  };

  const stop = onDataChange(draw);
  const panel = openPanel(() => h('div', { class: 'kdialog', 'aria-labelledby': titleId, onKeydown: onKey }, main, side), {
    history: false, // l'adresse de la carte est déjà dans l'historique
    onClose: () => {
      stop();
      // Fermée par la croix ou Échap : retour au projet
      setTimeout(() => {
        if (location.hash === hash) goBack('project', { id: projectId });
      }, 0);
    },
  });
  close = panel.close;
  draw();
  return panel;
}

