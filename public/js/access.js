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

// --- Fonctions autorisées (étape 2 du cadrage, migration 48) ---
//
// Cochées par l'Admin dans la page d'un compte : ce que la personne PEUT
// utiliser. « La case de l'Admin autorise, la personne allume » : Notes et
// Projets s'allument ensuite dans Réglages › Fonctions (features.js) ; une
// fonction est utilisée si elle est autorisée ET allumée (usedFeatures,
// features.js). Deux exceptions fixes : un Admin a tout ; un Utilisateur a
// toujours les Listes (ni case, ni interrupteur). (Étape 3 : « Listes »,
// pour un invité seulement.)
// - notes, projects : Notes, Projets (avec un interrupteur de la personne) ;
// - projectsCreate : « Peut créer ses propres projets » (permission, sans
//   interrupteur : « Nouveau projet », « Dupliquer le projet ») ;
// - mcp : « Assistants IA » (permission, sans interrupteur).
export const PERMISSIONS = ['notes', 'projects', 'projectsCreate', 'mcp'];
// Celles qui ont aussi l'interrupteur de la personne (Réglages › Fonctions)
export const SWITCHED_PERMISSIONS = ['notes', 'projects'];

// Autorisations de départ d'un nouveau compte : tout pour un Utilisateur
// (ce qu'ont les comptes existants), rien pour un invité (décision du
// propriétaire du 25 novembre 2026 : l'Admin coche ce qu'il ouvre), tout
// pour un Admin (de toute façon ignorées pour lui)
export function defaultAllowed(role) {
  const on = role !== 'guest';
  return Object.fromEntries(PERMISSIONS.map((name) => [name, on]));
}

// Autorisations complètes et valables d'un compte de ce rôle, à partir de
// ce qui est gardé (base, copie du téléphone) ou reçu, même incomplet :
// Admin, tout ; sinon chaque case gardée, et pour celle qui manque la
// valeur de départ du rôle.
export function normalizeAllowed(value, role) {
  const allowed = defaultAllowed(role);
  if (role === 'admin' || !value || typeof value !== 'object') return allowed;
  for (const name of PERMISSIONS) {
    if (typeof value[name] === 'boolean') allowed[name] = value[name];
  }
  return allowed;
}

// Problème d'un changement de cases { notes?, projects?, projectsCreate?,
// mcp? } (Administration) : le nom du texte de refus, ou null. Refusés :
// autre chose qu'un objet, nom inconnu, valeur qui n'est pas un booléen,
// rien à modifier.
export function allowedChangeProblem(change) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) return 'comptes.fonctions.invalides';
  const names = Object.keys(change);
  if (!names.length) return 'comptes.rienAModifier';
  if (!names.every((name) => PERMISSIONS.includes(name))) return 'comptes.fonctions.invalides';
  if (!names.every((name) => typeof change[name] === 'boolean')) return 'comptes.fonctions.invalides';
  return null;
}

// Applique un changement valable aux cases d'un compte de ce rôle.
// Renvoie { allowed, turnOn } : les nouvelles cases, et les fonctions à
// allumer aussitôt pour la personne. Pour un invité, une fonction cochée
// (Notes, Projets) s'allume aussitôt (décision du propriétaire du 25
// novembre 2026) : il pourra l'éteindre lui-même ensuite. Pour un
// Utilisateur, la case autorise seulement : il l'allume lui-même.
export function applyAllowedChange(role, allowed, change) {
  const before = normalizeAllowed(allowed, role);
  const next = { ...before };
  for (const name of PERMISSIONS) if (typeof change?.[name] === 'boolean') next[name] = change[name];
  const turnOn = role === 'guest' ? SWITCHED_PERMISSIONS.filter((name) => next[name] && !before[name]) : [];
  return { allowed: next, turnOn };
}

// Le compte peut-il créer ses propres projets ? (« Nouveau projet »,
// « Dupliquer le projet », create_project des assistants IA) : la
// permission, et les projets utilisés (autorisés et allumés). used :
// fonctions utilisées (features.js, usedFeatures).
export const mayCreateProjects = (allowed, used) => Boolean(allowed?.projectsCreate && used?.projects);

// Échéances (décision du propriétaire du 25 novembre 2026, point 5) :
// l'écran et son bouton existent toujours pour un Admin et un Utilisateur
// (ils ont toujours les Listes) ; pour un invité, quand les Listes sont
// utilisées par lui, ou quand au moins un projet qu'il voit a l'option
// « Échéances » allumée (ses cartes suivent ensuite la règle « Afficher
// dans Échéances »). lists : Listes utilisées (étape 3 du cadrage ; à
// l'étape 2, un invité a encore toujours les Listes : vrai) ;
// projectDeadlines : projets utilisés ET un projet visible à l'option
// « Échéances » allumée.
export function deadlinesShown(role, { lists = true, projectDeadlines = false } = {}) {
  if (role !== 'guest') return true;
  return lists || projectDeadlines;
}

// Invitation de l'Accueil (cadrage 4.4, maquette invite-accueil-vide-1) :
// quand AUCUNE fonction n'est utilisée (ni Listes, ni Notes, ni Projets ;
// en pratique un invité seulement : un Utilisateur a toujours les Listes).
// used : fonctions utilisées ; allowed : autorisations ; lists : Listes
// utilisées (étape 3 ; vrai jusque-là). Renvoie null (pas d'invitation),
// ou { kind, feature } : 'one' (une seule fonction autorisée, à nommer :
// feature), 'several' (plusieurs à choisir), 'none' (rien d'autorisé pour
// l'instant : l'Admin s'en charge).
export function welcomeHint(used, allowed, { lists = true } = {}) {
  if (lists || used?.notes || used?.projects) return null;
  const offered = SWITCHED_PERMISSIONS.filter((name) => allowed?.[name]);
  if (offered.length === 1) return { kind: 'one', feature: offered[0] };
  return { kind: offered.length ? 'several' : 'none', feature: null };
}
