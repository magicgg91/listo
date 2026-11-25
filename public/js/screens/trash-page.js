// Page « Corbeille » (Réglages › Corbeille, #/reglages/corbeille ;
// décision du propriétaire du 24 novembre 2026 : une seule ligne dans les
// Réglages au lieu de « Corbeille des listes » et « Corbeille des notes »).
//
// En haut, la barre des Réglages (retour vers Réglages) et deux onglets,
// « Listes » et « Notes », chacun avec son nombre quand il y en a
// (« Listes (4) », « Notes (2) » ; le nombre est aussi dans le nom lu :
// « Listes, 4 listes supprimées »). Dessous, le contenu de l'onglet choisi,
// exactement celui des anciennes pages : trash.js (listes) et
// note-trash.js (notes), avec leurs morceaux communs (trash-parts.js).
//
// Onglets : même composant que l'Administration (<nav class="tabs">,
// boutons .tab, aria-current="page" ; souligné épais ET texte plus foncé,
// jamais la couleur seule). Chaque onglet a son adresse
// (#/reglages/corbeille/listes ou /notes), posée sans redessiner la page
// ni ajouter d'entrée à l'historique (replaceAddress) : le retour et
// l'actualisation le retrouvent. Sans onglet dans l'adresse : « Listes »,
// sauf si la corbeille des listes est vide et celle des notes non
// (defaultTrashTab, trash-tabs.js).
//
// Notes coupées (Réglages › Fonctions) : pas d'onglets, la corbeille des
// listes seule (app.js mène l'adresse de l'onglet « Notes » ici). Si la
// fonction change pendant que la page est ouverte (autre appareil), la page
// est refaite.
//
// Textes posés avec textContent (h()) ; aucun curseur mis tout seul.

import { h, replace } from '../dom.js';
import { app, onDataChange } from '../app.js';
import { navigate, goBack, replaceAddress } from '../router.js';
import { notesOn, projectsOn, listsOn } from '../features.js';
import { t } from '../i18n.js';
import { trashTabs, defaultTrashTab, singleTrash } from '../trash-tabs.js';
import { topbar } from './settings.js';
import { listTrash } from './trash.js';
import { noteTrash } from './note-trash.js';
import { projectTrash } from './project-trash.js';

// Textes d'un onglet : libellé (« Listes », « Listes (4) ») et nom lu
// (« Listes, 4 listes supprimées »), selon le nombre
const TAB_TEXTS = {
  listes: { label: 'corbeille.onglet.listes', counted: 'corbeille.onglet.listes.nombre', name: 'corbeille.onglet.listes.label' },
  notes: { label: 'corbeille.onglet.notes', counted: 'corbeille.onglet.notes.nombre', name: 'corbeille.onglet.notes.label' },
  projets: { label: 'corbeille.onglet.projets', counted: 'corbeille.onglet.projets.nombre', name: 'corbeille.onglet.projets.label' },
};
// Fonction (Réglages › Fonctions) dont la page dépend : changée, la page
// est refaite
const featuresKey = () => JSON.stringify([notesOn(app.data.features), projectsOn(app.data.features), listsUsed()]);
// Listes utilisées (un invité peut ne pas les avoir ; toujours pour un
// Admin et un Utilisateur)
const listsUsed = () => app.user?.role !== 'guest' || listsOn(app.data.features);

// tab : l'onglet demandé par l'adresse (« listes », « notes »,
// « projets »), ou null pour l'onglet de départ
export function renderTrash(tab, onLeave) {
  const withNotes = notesOn(app.data.features);
  const withProjects = projectsOn(app.data.features);
  const withLists = listsUsed();
  const tabs = trashTabs(withNotes, withProjects, withLists);
  const shownFeatures = featuresKey();
  let alive = true;
  onLeave(() => {
    alive = false;
  });

  // Fonction « Notes » ou « Projets » changée pendant que la page est
  // ouverte : page refaite (un instant plus tard : jamais pendant un dessin)
  onLeave(onDataChange(() => {
    if (featuresKey() === shownFeatures) return;
    setTimeout(() => {
      if (alive) navigate('trash', {}, { replace: true });
    });
  }));

  const body = h('div', { class: 'body body--flush' });
  const header = topbar(t('corbeille.titre'), () => goBack('settings'));

  // Une seule fonction utilisée (le plus souvent les listes, notes et
  // projets coupés ; ou les projets seuls d'un invité) : sa corbeille,
  // sans onglets ; aucune : une phrase
  if (!tabs.length) {
    const only = { listes: () => listTrash(onLeave), notes: () => noteTrash(onLeave, () => {}), projets: () => projectTrash(onLeave, () => {}) }[singleTrash(withNotes, withProjects, withLists)];
    replace(body, only ? only().panel : h('p', { class: 'page-intro' }, t('corbeille.vide.aucune')));
    return h('div', { class: 'screen' }, header, body);
  }

  const buttons = {};
  const panels = {};
  const loading = h('p', { class: 'page-intro', role: 'status' }, t('corbeille.chargement'));
  let listsTried = false;

  // Libellés des onglets, avec leur nombre quand il y en a
  const paintTabs = () => {
    for (const key of tabs) {
      const count = panels[key]?.count() ?? null;
      const texts = TAB_TEXTS[key];
      buttons[key].textContent = count ? t(texts.counted, { count }) : t(texts.label);
      if (count) buttons[key].setAttribute('aria-label', t(texts.name, { count }));
      else buttons[key].removeAttribute('aria-label');
    }
  };

  // Onglet affiché : le sien marqué, son contenu seul visible, en haut
  const show = (key) => {
    tab = key;
    loading.hidden = true;
    for (const name of tabs) {
      if (name === key) buttons[name].setAttribute('aria-current', 'page');
      else buttons[name].removeAttribute('aria-current');
      panels[name].panel.hidden = name !== key;
    }
    body.scrollTop = 0;
  };

  // Onglet de départ (adresse sans onglet) : dès que les nombres utiles
  // sont connus ; tant que la corbeille des listes se charge et qu'il y a
  // des notes à la corbeille, « Chargement… »
  const decide = () => {
    if (tab) return;
    // (un nombre encore inconnu, null, fait attendre ; une corbeille sans
    // onglet compte pour vide)
    const notes = panels.notes ? panels.notes.count() : 0;
    const projects = panels.projets ? panels.projets.count() : 0;
    const lists = panels.listes ? panels.listes.count() : 0;
    if ((notes === 0 && projects === 0) || listsTried) {
      const wanted = defaultTrashTab({ lists, notes, projects });
      show(tabs.includes(wanted) ? wanted : tabs[0]);
    }
  };

  const changed = () => {
    if (!alive || !tabs.every((key) => panels[key])) return;
    paintTabs();
    decide();
  };

  for (const key of tabs) {
    buttons[key] = h('button', {
      class: 'tab',
      type: 'button',
      onClick: () => {
        if (key === tab) return;
        show(key);
        replaceAddress('trashTab', { tab: key });
      },
    });
  }
  const nav = h('nav', { class: 'tabs trash-tabs', 'aria-label': t('corbeille.onglets') }, tabs.map((key) => buttons[key]));

  if (tabs.includes('listes')) {
    panels.listes = listTrash(onLeave, () => {
      listsTried = true;
      changed();
    });
  } else listsTried = true;
  if (tabs.includes('notes')) panels.notes = noteTrash(onLeave, changed);
  if (tabs.includes('projets')) panels.projets = projectTrash(onLeave, changed);
  for (const key of tabs) panels[key].panel.hidden = true;
  replace(body, loading, tabs.map((key) => panels[key].panel));

  paintTabs();
  if (tab) show(tab);
  else decide();

  return h('div', { class: 'screen' }, header, nav, body);
}
