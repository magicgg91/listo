// Corbeilles des projets (docs/cadrage-projets.md, section 7 ; maquette
// design/projets/captures/corbeille-1) :
//
// - Onglet « Projets » de Réglages › Corbeille (#/reglages/corbeille/projets,
//   page trash-page.js) : MES projets supprimés (le serveur n'envoie que
//   ceux dont je suis le propriétaire), 30 jours ; chaque ligne : nom,
//   « Supprimé le 20 nov. · encore 25 jours », « 13 cartes · partagé avec
//   2 personnes », « Supprimer définitivement » et « Restaurer » ; « Vider
//   la corbeille ». Restaurer passe par la file d'attente (hors ligne
//   compris) ; supprimer définitivement et vider demandent le réseau.
//   Restauré, le projet revient pour tous ses membres.
// - « Cartes supprimées » d'un projet (#/projets/<id>/corbeille, menu ⋮ du
//   projet) : chaque ligne : titre, colonne d'origine, « supprimée par Léa
//   le 22 nov. · encore 27 jours » ; « Restaurer » (propriétaire et « Peut
//   modifier » pour toutes, Contributeur pour celles qu'il a créées ; la
//   carte revient en bas de sa colonne, ou de la première si la sienne
//   n'existe plus) ; « Supprimer définitivement » et « Vider » :
//   propriétaire, en ligne. Lecture seule : la liste, sans bouton.
//
// Même présentation que les corbeilles des listes et des notes
// (trash-parts.js). Le serveur revérifie chaque droit. Textes par
// textContent (h()).

import { h, icon, iconButton, replace } from '../dom.js';
import { goBack } from '../router.js';
import { app, onDataChange, refreshData, isDesktop } from '../app.js';
import { toast, confirmDialog, drawWhenIdle, offlineBanner } from '../ui.js';
import { errorMessage } from '../api.js';
import { t, formatDate } from '../i18n.js';
import { projectRights } from '../projects.js';
import { trashedProjects, deletedCards, trashDays } from '../project-view.js';
import * as projectActions from '../project-actions.js';
import { trashPanel, trashRow, deletedText, trashEmpty, purgeQuestion, emptyQuestion } from './trash-parts.js';
import { liveProject, rightsOn, projectGone } from './project.js';
import { topbar } from './settings.js';

// Une action en ligne seulement (supprimer définitivement, vider) : hors
// ligne, un message ; une erreur du serveur, son message
async function online(run, offlineText) {
  if (!navigator.onLine) {
    toast(offlineText);
    return;
  }
  try {
    await run();
  } catch (error) {
    toast(navigator.onLine ? errorMessage(error) : offlineText);
  }
}

// --- Onglet « Projets » de Réglages › Corbeille ---
// Renvoie { panel, count } ; count() : nombre de projets dans la corbeille
// (null tant que la copie locale n'est pas chargée) ; onCount() est appelé
// à chaque dessin (la page met à jour ses onglets).
export function projectTrash(onLeave, onCount = () => {}) {
  const list = () => trashedProjects(app.data);

  async function emptyTrash() {
    const ids = list().map((project) => project.id);
    if (!ids.length) return;
    if (!(await confirmDialog(emptyQuestion(t('projets.corbeille.vider.texte', { count: ids.length }))))) return;
    await online(() => projectActions.emptyProjectTrash(ids), t('projets.corbeille.horsLigne'));
  }
  async function purgeOne(project) {
    if (!(await confirmDialog(purgeQuestion(project.name, t('projets.corbeille.definitif.texte'))))) return;
    await online(() => projectActions.purgeProject(project.id), t('projets.corbeille.horsLigne'));
  }
  async function restore(project) {
    await projectActions.restoreProject(project.id);
    toast(t('projets.corbeille.restaure', { name: project.name }));
  }

  const row = (project) => trashRow({
    name: project.name,
    meta: [
      // (« Supprimé » : un projet ; même date courte que les listes et les notes)
      t('projets.corbeille.ligne', { date: formatDate(new Date(project.deletedAt), { day: 'numeric', month: 'short' }), count: trashDays(project.deletedAt) }),
      t('projets.corbeille.infos', { count: project.cardCount ?? 0 }),
      project.memberCount ? t('projets.corbeille.partage', { count: project.memberCount }) : null,
    ],
    restoreLabel: t('projets.corbeille.restaurer.label', { name: project.name }),
    onPurge: () => purgeOne(project),
    onRestore: () => restore(project),
  });

  const view = trashPanel({ intro: t('projets.corbeille.intro'), onEmpty: () => emptyTrash() });
  const after = h('p', { class: 'page-intro trash-after' }, t('projets.corbeille.cartes'));
  view.panel.append(after);
  const draw = () => {
    if (!app.data.loaded) {
      view.tools.hidden = true;
      replace(view.content, h('p', { class: 'empty muted', role: 'status' }, t('projets.chargement')));
      onCount();
      return;
    }
    const projects = list();
    view.tools.hidden = !projects.length;
    view.count.textContent = t('projets.corbeille.nombre', { count: projects.length });
    replace(view.content, projects.length
      ? h('div', { class: 'group' }, projects.map(row))
      : trashEmpty('kanban', t('projets.corbeille.vide.titre'), t('projets.corbeille.vide.texte')));
    onCount();
  };
  const idle = drawWhenIdle(view.panel, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  return { panel: view.panel, count: () => (app.data.loaded ? list().length : null) };
}

// --- « Cartes supprimées » d'un projet ---
export function renderProjectTrash(projectId, onLeave) {
  const body = h('div', { class: 'body body--flush' });

  async function emptyTrash(project) {
    const ids = deletedCards(app.data, project.id).map((card) => card.id);
    if (!ids.length) return;
    if (!(await confirmDialog(emptyQuestion(t('projets.cartes.vider.texte', { count: ids.length }))))) return;
    await online(() => projectActions.purgeCards(project.id, ids), t('projets.corbeille.horsLigne'));
  }
  async function purgeOne(project, card) {
    if (!(await confirmDialog(purgeQuestion(card.title, t('projets.cartes.definitif.texte'))))) return;
    await online(() => projectActions.purgeCards(project.id, [card.id]), t('projets.corbeille.horsLigne'));
  }
  async function restore(card) {
    await projectActions.restoreCard(card.id);
    toast(t('projets.cartes.restauree', { name: card.title }));
  }

  // Une ligne ; les boutons seulement si mon rôle le permet sur cette carte
  const row = (project, card) => {
    const can = rightsOn(card, project);
    const owner = projectRights(project.role).purgeCards;
    const date = formatDate(new Date(card.deletedAt), { day: 'numeric', month: 'short' });
    const meta = [
      card.deletedColumnName ? t('projets.cartes.colonne', { name: card.deletedColumnName }) : null,
      card.deletedByName
        ? t('projets.cartes.supprimeePar', { name: card.deletedByName, date, count: trashDays(card.deletedAt) })
        : deletedText(card.deletedAt, trashDays(card.deletedAt)),
    ];
    if (can.restore || owner) {
      const line = trashRow({
        name: card.title,
        meta,
        restoreLabel: t('projets.cartes.restaurer.label', { name: card.title }),
        onPurge: () => purgeOne(project, card),
        onRestore: () => restore(card),
      });
      // Seulement les boutons permis
      if (!owner) line.querySelector('[data-trash-action="purge"]')?.remove();
      if (!can.restore) line.querySelector('[data-trash-action="restore"]')?.remove();
      return line;
    }
    return h('div', { class: 'trash-row' },
      h('span', { class: 'trash-row__title' }, card.title),
      meta.filter(Boolean).map((text) => h('span', { class: 'trash-row__meta' }, text)));
  };

  const draw = () => {
    if (!app.data.loaded) {
      replace(body, h('p', { class: 'empty muted', role: 'status' }, t('projets.chargement')));
      return;
    }
    const project = liveProject(projectId);
    if (!project) {
      replace(body, projectGone());
      return;
    }
    const cards = deletedCards(app.data, projectId);
    const owner = projectRights(project.role).purgeCards;
    replace(body,
      h('p', { class: 'page-intro' }, t('projets.cartes.intro')),
      cards.length ? h('div', { class: 'page-tools' },
        h('span', { class: 'page-tools__count' }, t('projets.cartes.nombre', { count: cards.length })),
        owner ? h('button', { class: 'cart__action cart__action--danger', type: 'button', 'data-trash-action': 'empty', onClick: () => emptyTrash(project) },
          icon('trash', 'icon--sm'), t('corbeille.vider')) : null) : null,
      cards.length
        ? h('div', { class: 'group' }, cards.map((card) => row(project, card)))
        : trashEmpty('trash', t('projets.cartes.vide.titre'), t('projets.cartes.vide.texte')));
  };
  const idle = drawWhenIdle(body, draw);
  onLeave(onDataChange(idle.request));
  onLeave(idle.stop);
  draw();
  refreshData({ quiet: true });

  const back = () => goBack('project', { id: projectId });
  if (isDesktop()) {
    return h('div', { class: 'screen' },
      h('header', { class: 'pc-head' },
        iconButton('chev-l', t('projets.retourProjet'), back),
        h('div', { class: 'pc-head__main' }, h('h1', { class: 'pc-head__title' }, t('projets.cartes.titre')),
          h('p', { class: 'pc-head__sub' }, liveProject(projectId)?.name ?? ''))),
      offlineBanner(),
      h('div', { class: 'scroll' }, body));
  }
  return h('div', { class: 'screen' }, topbar(t('projets.cartes.titre'), back), h('div', { class: 'scroll' }, body));
}
