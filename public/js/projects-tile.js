// Tuile « Projets » de l'Accueil, au choix de chacun (décision du
// propriétaire du 25 novembre 2026 ; Réglages › Accueil, ligne « Projets ») :
// - « Mes cartes » (au départ) : mes cartes les plus urgentes, tous projets
//   confondus (trois) ;
// - « Mes projets » : une ligne par projet, la plus récente activité
//   d'abord ; trois lignes au plus (trois projets, ou deux et « Tous les
//   projets » quand il y en a plus de trois) ;
// - « Un projet » : les colonnes d'un projet choisi (pastilles, deux lignes
//   au plus) et mes deux cartes les plus urgentes de ce projet.
// Les trois gardent à peu près la même hauteur.
//
// Fonctions « pures » : ni écran, ni réseau, ni texte (seulement des
// nombres et des listes) ; calculées depuis la copie locale (hors ligne
// compris) ; testées automatiquement (test/projects-tile.test.js). Le choix
// gardé est dans le réglage « Accueil » (home-tiles.js, projectsTile).
// Rien ici ne donne un droit : le serveur ne m'envoie que les projets que
// je vois.

import { normalizeHome } from './home-tiles.js';
import { liveProjects, sortedProjects, cardCount, myCards, myCardCounts, urgentCards, projectUnread } from './project-view.js';

// Lignes au plus dans les tuiles « Mes cartes » et « Mes projets »
export const TILE_ROWS = 3;
// Cartes de la tuile « Un projet » (sous ses colonnes)
export const PROJECT_TILE_CARDS = 2;
// Lignes de pastilles des colonnes, au plus, dans la tuile « Un projet »
export const CHIP_LINES = 2;

// Ce que montre vraiment la tuile : { mode, project }. « Un projet » dont
// le projet n'est plus parmi ceux que je vois (quitté, supprimé, dans la
// corbeille) : « Mes cartes », sans rien dire ; le choix gardé ne change
// pas (il revient si le projet revient, restauré par exemple).
export function projectsTileShown(home, state) {
  const choice = normalizeHome(home).projectsTile;
  if (choice.mode === 'project') {
    const project = liveProjects(state).find((candidate) => candidate.id === choice.projectId);
    return project ? { mode: 'project', project } : { mode: 'cards', project: null };
  }
  return { mode: choice.mode, project: null };
}

// « Mes projets » : { rows, more }. rows : un objet par projet montré
// { project, cards (cartes présentes), mine (pour moi), late (les miennes
// en retard, seulement avec l'option « Échéances » du projet), readOnly
// (« Lecture seule »), unread (point des nouveautés) } ; more : il y a plus
// de trois projets (la troisième ligne est alors « Tous les projets »).
export function projectRows(state, meId, today, now, compare) {
  const projects = sortedProjects(state, compare);
  const more = projects.length > TILE_ROWS;
  const rows = projects.slice(0, more ? TILE_ROWS - 1 : TILE_ROWS).map((project) => {
    const mine = myCardCounts(state, meId, project.id, today, now);
    return {
      project,
      cards: cardCount(state, project.id),
      mine: mine.count,
      late: mine.late,
      readOnly: project.role === 'reader',
      unread: projectUnread(state, project.id),
    };
  });
  return { rows, more };
}

// « Un projet » : mes cartes de ce projet (le nombre de la pastille du
// titre) et les deux plus urgentes (même ordre que « Mes cartes »)
export function projectTileCards(state, meId, projectId, today, now) {
  return {
    count: myCards(state, meId, projectId).length,
    urgent: urgentCards(state, meId, today, now, PROJECT_TILE_CARDS, projectId),
  };
}

// Pastilles des colonnes sur deux lignes au plus : combien en montrer.
// total : nombre de colonnes ; linesFor(shown, more) : nombre de lignes
// occupées quand les « shown » premières pastilles sont montrées, suivies
// (more) de la pastille « +N » des autres (mesuré à l'écran). Tout tient :
// toutes ; sinon, le plus possible avec « +N » à la fin (une au moins).
export function chipsShown(total, linesFor, maxLines = CHIP_LINES) {
  if (total <= 0 || linesFor(total, false) <= maxLines) return Math.max(total, 0);
  let shown = total - 1;
  while (shown > 1 && linesFor(shown, true) > maxLines) shown -= 1;
  return shown;
}
