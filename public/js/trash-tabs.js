// Corbeille unique (Réglages › Corbeille, décision du 24 novembre 2026) :
// une seule ligne dans les Réglages, une seule page, des onglets en haut,
// « Listes », « Notes » et « Projets » (docs/cadrage-projets.md, section 7 ;
// screens/trash-page.js). Règles « pures » (aucune
// page touchée), testées automatiquement (test/trash-tabs.test.js).
//
// Adresses :
// - #/reglages/corbeille : l'onglet de départ (defaultTrashTab) ;
// - #/reglages/corbeille/listes, /notes et /projets : l'onglet choisi (le
//   retour et l'actualisation le retrouvent) ;
// - anciennes adresses de la corbeille des notes (#/reglages/corbeille-notes,
//   #/notes/corbeille) : l'onglet « Notes ».
// Un onglet par fonction utilisée (Réglages › Fonctions) : notes coupées,
// pas d'onglet « Notes » ; projets coupés (c'est le départ), pas d'onglet
// « Projets » ; l'adresse d'un onglet absent mène à la Corbeille sans
// onglet. Seule la corbeille des listes : pas d'onglets du tout.

// Les onglets, dans l'ordre de l'écran (noms écrits dans l'adresse)
export const TRASH_TABS = ['listes', 'notes', 'projets'];

// Onglets proposés : « Listes », puis « Notes » et « Projets » selon les
// fonctions utilisées ; aucun s'il ne reste que « Listes »
export function trashTabs(notes, projects = false) {
  const tabs = TRASH_TABS.filter((tab) => tab === 'listes' || (tab === 'notes' && notes) || (tab === 'projets' && projects));
  return tabs.length > 1 ? tabs : [];
}

// Onglet de départ, quand l'adresse n'en donne pas : « Listes », sauf si la
// corbeille des listes est vide et qu'une autre ne l'est pas (« Notes »
// d'abord, puis « Projets »). lists, notes, projects : les nombres, ou null
// tant qu'ils ne sont pas connus (chargement, hors ligne) ; un nombre
// inconnu ne compte pas pour vide.
export function defaultTrashTab({ lists = null, notes = null, projects = null } = {}) {
  if (lists !== 0) return 'listes';
  if (notes > 0) return 'notes';
  return projects > 0 ? 'projets' : 'listes';
}

// Onglet demandé par l'adresse (#/reglages/corbeille/<onglet>) : celui à
// ouvrir, ou null pour revenir à #/reglages/corbeille (onglet inconnu, ou
// d'une fonction coupée). « listes » s'ouvre toujours.
export function askedTrashTab(tab, notes, projects = false) {
  if (tab === 'listes') return 'listes';
  return trashTabs(notes, projects).includes(tab) ? tab : null;
}
