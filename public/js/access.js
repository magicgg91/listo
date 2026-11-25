// Rôles des comptes (docs/cadrage-comptes.md, décisions du propriétaire du
// 25 novembre 2026) : trois rôles montrés partout, « Admin »,
// « Utilisateur » et « Invité ». Règles « pures », partagées par le serveur
// (server/directory.js, server/routes/admin-users.js…) et par les écrans,
// testées automatiquement (test/comptes.test.js). Aucun texte ici.
//
// En base, le rôle est rangé dans deux colonnes de la table users
// (migration 47) : users.role ('admin' ou 'user', comme avant) et
// users.guest (1 pour un invité ; la base refuse « invité et Admin »).
// accountRole() est la SEULE fonction qui lit ces deux colonnes pour dire
// le rôle : un test refuse toute autre lecture de users.role dans le code
// du serveur (hors de l'administration des comptes). Ainsi, un endroit
// oublié ne peut pas prendre un invité pour un Utilisateur.
//
// Un invité est TOUJOURS discret, dans les deux sens, par son rôle (aucun
// réglage) : il n'apparaît dans l'annuaire (personnes proposées dans
// « Partager », « Pour qui ? ») que des Admin, et son propre annuaire est
// vide. Dans une chose partagée avec lui (liste, note, projet), les membres
// se voient, comme aujourd'hui. Un invité ne partage jamais ce qu'il
// possède (ni personnes, ni lien public) : c'est l'Admin qui partage avec
// lui.

// Les trois rôles, dans l'ordre du choix « Utilisateur | Invité | Admin »
export const ROLES = ['user', 'guest', 'admin'];

// Rôle d'un compte, à partir de sa ligne de la table users (role, guest) :
// 'admin', 'user' ou 'guest'. Une ligne inconnue ou incomplète n'est
// jamais Admin ; en cas de doute, elle est traitée en invité (le plus
// discret), jamais en Utilisateur visible.
export function accountRole(row) {
  if (!row) return 'guest';
  if (row.role === 'admin' && row.guest !== 1) return 'admin';
  if (row.role === 'user' && row.guest === 0) return 'user';
  return 'guest';
}

// Colonnes de la table users pour un rôle choisi (création, changement de
// rôle) : { role, guest }
export function roleColumns(role) {
  if (role === 'admin') return { role: 'admin', guest: 0 };
  if (role === 'guest') return { role: 'user', guest: 1 };
  return { role: 'user', guest: 0 };
}

// Un compte de ce rôle est-il discret (absent de l'annuaire des autres,
// annuaire vide) ? Seulement un invité.
export const isDiscreet = (role) => role === 'guest';

// Ce rôle voit-il ce compte dans son annuaire ? viewerRole, targetRole :
// rôles calculés (accountRole). Admin : tout le monde ; Utilisateur : tout
// le monde sauf les invités ; invité : personne.
export function directorySees(viewerRole, targetRole) {
  if (viewerRole === 'admin') return true;
  if (viewerRole === 'user') return targetRole !== 'guest';
  return false;
}

// Un compte de ce rôle peut-il partager ce qu'il possède (personnes, lien
// public) ? Tous, sauf un invité.
export const mayShareOwn = (role) => role !== 'guest';

// Changement de rôle permis ? from, to : rôles calculés. Renvoie null
// (permis) ou le nom du texte de refus. Admin ↔ Invité : jamais
// directement, on passe par Utilisateur (décision du 25 novembre 2026).
// Les autres règles (pas son propre rôle, dernier Admin, liste d'envies
// destinée à la personne) sont vérifiées par le serveur, qui connaît la
// base.
export function roleChangeProblem(from, to) {
  if (!ROLES.includes(to)) return 'comptes.role.invalide';
  if (from === 'guest' && to === 'admin') return 'comptes.role.inviteVersAdmin';
  if (from === 'admin' && to === 'guest') return 'comptes.role.adminVersInvite';
  return null;
}
