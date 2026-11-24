// Corbeille unique (Réglages › Corbeille, décision du 24 novembre 2026) :
// une seule ligne dans les Réglages, une seule page, deux onglets en haut,
// « Listes » et « Notes » (screens/trash-page.js). Règles « pures » (aucune
// page touchée), testées automatiquement (test/trash-tabs.test.js).
//
// Adresses :
// - #/reglages/corbeille : l'onglet de départ (defaultTrashTab) ;
// - #/reglages/corbeille/listes et #/reglages/corbeille/notes : l'onglet
//   choisi (le retour et l'actualisation le retrouvent) ;
// - anciennes adresses de la corbeille des notes (#/reglages/corbeille-notes,
//   #/notes/corbeille) : l'onglet « Notes ».
// Notes coupées (Réglages › Fonctions) : pas d'onglets, la corbeille des
// listes seule ; l'adresse de l'onglet « Notes » y mène.

// Les onglets, dans l'ordre de l'écran (noms écrits dans l'adresse)
export const TRASH_TABS = ['listes', 'notes'];

// Onglets proposés : les deux, ou aucun quand la personne a coupé les notes
export const trashTabs = (notes) => (notes ? TRASH_TABS : []);

// Onglet de départ, quand l'adresse n'en donne pas : « Listes », sauf si la
// corbeille des listes est vide et celle des notes ne l'est pas. lists et
// notes : les nombres, ou null tant qu'ils ne sont pas connus (chargement,
// hors ligne) ; un nombre inconnu ne compte pas pour vide.
export function defaultTrashTab({ lists = null, notes = null } = {}) {
  return lists === 0 && notes > 0 ? 'notes' : 'listes';
}

// Onglet demandé par l'adresse (#/reglages/corbeille/<onglet>) : celui à
// ouvrir, ou null pour revenir à #/reglages/corbeille (onglet inconnu, ou
// « notes » quand les notes sont coupées). « listes » s'ouvre toujours.
export function askedTrashTab(tab, notes) {
  if (tab === 'listes') return 'listes';
  return trashTabs(notes).includes(tab) ? tab : null;
}
