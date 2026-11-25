// Réglage « Fonctions » d'un compte (Réglages › Fonctions, migration 41) :
// les fonctions de Listo qu'une personne peut couper pour elle seule (les
// notes ; les projets depuis le 25 novembre 2026, coupés au départ). Le
// même sur tous les appareils de la personne : envoyé avec /api/me et
// chaque synchronisation (/api/sync, « features »), modifié par l'opération « account.features » (/api/ops, file d'attente :
// hors ligne compris).
//
// Fonctions autorisées (docs/cadrage-comptes.md, étape 2, migration 48) :
// l'Admin coche, dans la page d'un compte, ce que la personne PEUT
// utiliser (notes_allowed, projects_allowed, projects_create, mcp_allowed ;
// un Admin a tout). Une fonction est UTILISÉE si elle est autorisée ET
// allumée : c'est ce que donne featuresFor, et ce que vérifie tout le
// serveur (synchronisation, opérations, routes, notifications, assistants
// IA). Une fonction non autorisée n'est pas proposée dans Réglages ›
// Fonctions, et la personne ne peut ni l'allumer ni l'éteindre (refus,
// 403) ; son interrupteur est gardé tel quel (recochée, elle la retrouve
// dans l'état où elle l'avait laissée). Les règles sont dans
// public/js/access.js (cases) et public/js/features.js (usedFeatures).
//
// Chacun ne lit et ne modifie que son propre réglage : le compte vient
// toujours de la session (jamais d'un identifiant envoyé par le téléphone).
// Les règles (fonctions connues, booléens seulement) sont celles de
// public/js/features.js, vérifiées ici avant toute écriture. Couper une
// fonction n'efface rien. Rien de tout cela n'est montré aux assistants IA
// ni sur le lien public.
//
// Les notifications des notes ne sont pas remises à une personne qui n'utilise pas
// les notes : server/notify.js relit ces colonnes à chaque
// envoi (allowedNote), pour la page Notifications comme pour le téléphone.
// Projets non utilisés : server/projects.js relit ces colonnes à chaque
// opération et à chaque synchronisation (rien d'envoyé, tout refusé).
//
// Listes (docs/cadrage-comptes.md, étape 3, migration 49 : lists_allowed,
// lists_enabled) : toujours utilisées par un Admin et un Utilisateur ;
// pour un invité, autorisées ET allumées. Un invité sans Listes ne reçoit
// et ne change rien des listes : UN seul contrôle, listsRefusal (ci-
// dessous), repris partout (routes des listes posées une fois dans
// server/app.js, opérations et synchronisation dans server/lists.js,
// notifications, page Notifications, temps réel, assistants IA).

import { FEATURES, normalizeFeatures, featuresChangeProblem, applyFeaturesChange, usedFeatures } from '../public/js/features.js';
import { accountRole, normalizeAllowed, PERMISSIONS, allowedChangeProblem, applyAllowedChange } from '../public/js/access.js';

// Colonne de la table users de chaque fonction (liste fixe : jamais un nom
// venu d'une requête) : l'interrupteur de la personne…
const COLUMNS = { lists: 'lists_enabled', notes: 'notes_enabled', projects: 'projects_enabled' };
// … et la case de l'Admin (migrations 48 et 49)
export const ALLOWED_COLUMNS = { lists: 'lists_allowed', notes: 'notes_allowed', projects: 'projects_allowed', projectsCreate: 'projects_create', mcp: 'mcp_allowed' };

// Refus des listes (noms des textes, public/js/i18n/fr/ops.js) : pas
// autorisées par l'Admin (il s'en charge), ou éteintes par la personne
// (Réglages › Fonctions)
export const LISTS_NOT_ALLOWED = 'ops.listesNonAutorisees';
export const LISTS_OFF = 'ops.listesCoupees';

// Adresses de l'API qui appartiennent aux listes (sous /api) : listes et
// leur partage, lien public, mode scan, articles, photos, réservations,
// suggestions, nouveaux magasins et rayons, sourdine des notifications
// d'une liste. Pas l'annuaire (GET /api/users), qui sert aussi aux notes
// et aux projets, ni /api/sync et /api/ops (contrôlés dans server/lists.js,
// opération par opération).
export const LIST_ROUTE_PATHS = ['/lists', '/items', '/suggestions', '/stores', '/aisles', '/push/mutes'];

// Contrôle des routes des listes, posé UNE fois devant elles (server/
// app.js, api.use(LIST_ROUTE_PATHS, …)) : un compte sans Listes reçoit
// 403 (« Les listes ne sont pas ouvertes… » ou « … coupées… ») avant
// tout traitement, quelle que soit la liste demandée.
export function requireLists(ctx) {
  return (req, res, next) => {
    const refusal = ctx.features.listsRefusal(req.user.id);
    if (refusal) return res.status(403).json({ error: req.t(refusal) });
    next();
  };
}

// Interrupteurs de la personne, lus dans une ligne de la table users
// (valeurs de départ si une colonne manque)
export function switchesFromRow(row) {
  const value = {};
  for (const name of FEATURES) {
    const cell = row?.[COLUMNS[name]];
    if (cell === 0 || cell === 1) value[name] = cell === 1;
  }
  return normalizeFeatures(value);
}

// Autorisations d'un compte, lues dans sa ligne de la table users (rôle
// compris : un Admin a tout ; accountRole, la seule lecture du rôle)
export function allowedFromRow(row) {
  const stored = {};
  for (const name of PERMISSIONS) {
    const cell = row?.[ALLOWED_COLUMNS[name]];
    if (cell === 0 || cell === 1) stored[name] = cell === 1;
  }
  return normalizeAllowed(stored, accountRole(row));
}

// Fonctions UTILISÉES, lues dans une ligne de la table users (autorisées
// et allumées). Sert aussi à /api/me (server/auth.js, publicUser) : à
// l'ouverture, le téléphone sait tout de suite quels boutons montrer.
export function featuresFromRow(row) {
  return usedFeatures(switchesFromRow(row), allowedFromRow(row), accountRole(row));
}

export function createFeatures(db) {
  const columns = ['role', 'guest', ...FEATURES.map((name) => COLUMNS[name]), ...PERMISSIONS.map((name) => ALLOWED_COLUMNS[name])];
  const read = db.prepare(`SELECT ${columns.join(', ')} FROM users WHERE id = ?`);
  // Une requête préparée par fonction (colonne de la liste fixe ci-dessus)
  const writes = Object.fromEntries(FEATURES.map((name) => [name, db.prepare(`UPDATE users SET ${COLUMNS[name]} = ? WHERE id = ?`)]));
  const allowedWrites = Object.fromEntries(PERMISSIONS.map((name) => [name, db.prepare(`UPDATE users SET ${ALLOWED_COLUMNS[name]} = ? WHERE id = ?`)]));

  // Fonctions utilisées par une personne (autorisées et allumées)
  const featuresFor = (userId) => featuresFromRow(read.get(userId));
  // Ses autorisations (cases de l'Admin ; un Admin a tout)
  const allowedFor = (userId) => allowedFromRow(read.get(userId));
  // Ses interrupteurs (Réglages › Fonctions), tels qu'elle les a laissés
  const switchesFor = (userId) => switchesFromRow(read.get(userId));

  // LE contrôle des listes (étape 3 du cadrage) : null quand le compte
  // utilise les listes (toujours pour un Admin et un Utilisateur), sinon le
  // nom du texte de refus (LISTS_NOT_ALLOWED ou LISTS_OFF). Relu dans la
  // base à chaque demande : un changement de l'Admin compte tout de suite.
  // Un compte inconnu n'a pas de listes.
  function listsRefusal(userId) {
    const row = read.get(userId);
    if (!row) return LISTS_NOT_ALLOWED;
    if (!allowedFromRow(row).lists) return LISTS_NOT_ALLOWED;
    return featuresFromRow(row).lists ? null : LISTS_OFF;
  }
  const listsUsed = (userId) => listsRefusal(userId) === null;

  // Modifie le réglage de la personne. change : { lists?, notes?, projects? },
  // rien d'autre (« Listes » : un invité seulement).
  // Renvoie { problem, status } (nom du texte de refus) si la modification
  // n'est pas valable (rien n'est écrit), sinon { changed }. Une fonction
  // que l'Admin n'a pas autorisée : refus 403 (elle n'est pas proposée).
  function setFeatures(userId, change) {
    const row = read.get(userId);
    const allowed = allowedFromRow(row);
    const problem = featuresChangeProblem(change, allowed, accountRole(row));
    if (problem) return { problem, status: problem === 'ops.fonctionNonAutorisee' ? 403 : 400 };
    const before = switchesFor(userId);
    const next = applyFeaturesChange(before, change);
    db.transaction(() => {
      for (const name of FEATURES) {
        if (next[name] !== before[name]) writes[name].run(next[name] ? 1 : 0, userId);
      }
    })();
    return { changed: FEATURES.some((name) => next[name] !== before[name]) };
  }

  // Modifie les cases d'un compte (Administration › Comptes, Admin
  // seulement : la route le vérifie). change : { lists? (invité seulement),
  // notes?, projects?, projectsCreate?, mcp? }. Pour un invité, une fonction cochée s'allume
  // aussitôt (access.js, applyAllowedChange) ; pour un Utilisateur, la case
  // autorise seulement. Rien n'est effacé. Renvoie { problem } ou
  // { before, after, turnedOn } (cases avant et après, fonctions allumées).
  function setAllowed(userId, change) {
    const row = read.get(userId);
    const role = accountRole(row);
    const problem = allowedChangeProblem(change, role);
    if (problem) return { problem };
    const before = allowedFromRow(row);
    const { allowed: after, turnOn } = applyAllowedChange(role, before, change);
    const switches = switchesFromRow(row);
    const turnedOn = turnOn.filter((name) => !switches[name]);
    db.transaction(() => {
      for (const name of PERMISSIONS) {
        if (typeof change[name] === 'boolean') allowedWrites[name].run(change[name] ? 1 : 0, userId);
      }
      for (const name of turnedOn) writes[name].run(1, userId);
    })();
    return { before, after, turnedOn };
  }

  // Cases de départ d'un compte qui vient d'être créé (access.js,
  // defaultAllowed, ou celles choisies dans « Nouveau compte ») ; pour un
  // invité, les fonctions cochées sont allumées, les autres éteintes (rien
  // n'est allumé tant que l'Admin n'a rien coché)
  function initAllowed(userId, allowed, role) {
    const value = normalizeAllowed(allowed, role);
    db.transaction(() => {
      for (const name of PERMISSIONS) allowedWrites[name].run(value[name] ? 1 : 0, userId);
      if (role === 'guest') for (const name of FEATURES) writes[name].run(value[name] ? 1 : 0, userId);
    })();
    return value;
  }

  // Utilisateur devenu invité (Administration, changement de rôle) : il
  // garde ce qu'il avait (décision du 25 novembre 2026), donc les Listes,
  // qu'un Utilisateur a toujours : autorisées et allumées. L'Admin les
  // décoche ensuite s'il le veut.
  function keepListsForNewGuest(userId) {
    db.transaction(() => {
      allowedWrites.lists.run(1, userId);
      writes.lists.run(1, userId);
    })();
  }

  return { featuresFor, allowedFor, switchesFor, listsRefusal, listsUsed, setFeatures, setAllowed, initAllowed, keepListsForNewGuest };
}
