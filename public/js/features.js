// Réglage « Fonctions » de chaque compte (Réglages › Fonctions, décision du
// 24 novembre 2026) : les fonctions de Listo qu'une personne peut couper
// pour elle seule. Règles partagées par le serveur (server/features.js, qui
// vérifie tout) et par les écrans (copie locale, file d'attente hors
// ligne). Aucun texte ici, aucune page touchée : des fonctions « pures »,
// testées automatiquement (test/features.test.js).
//
// Le réglage : { deadlines, lists, notes, projects } (vrai : la fonction
// est utilisée).
// - deadlines : l'écran « Échéances » (décision du propriétaire du 26
//   novembre 2026, réponse A ; migration 52), ACTIVÉ au départ pour tous
//   les comptes (Admin, Utilisateur, Invité). Un choix de la personne
//   seulement : aucune case de l'Admin (featureAllowed, ci-dessous : proposé
//   dès que la personne a les Listes ou les Projets). Désactivé : ni bouton
//   « Échéances » dans le bandeau du bas, ni tuile, ni entrée du menu de
//   gauche, ni pastilles, ni premier écran, ni « Afficher dans Échéances »
//   dans les menus des projets ; #/echeances mène au premier écran. Rien
//   n'est effacé : les échéances restent sur les tâches et les cartes (avec
//   « En retard » dans les listes et les projets). Les notifications ne
//   changent PAS : rappels et résumé du matin restent réglés dans Réglages ›
//   Notifications, quel que soit ce choix (le serveur ne lit jamais cet
//   interrupteur pour les envoyer).
// - lists : les listes (docs/cadrage-comptes.md, étape 3) : TOUJOURS
//   utilisées par un Admin et un Utilisateur (ni case, ni interrupteur) ;
//   pour un invité, autorisées par l'Admin et allumées par lui (allumées
//   aussitôt quand l'Admin les coche). Non utilisées : rien des listes
//   n'est envoyé à ses appareils (listes, articles, envies, « À offrir »,
//   mémoire des articles, magasins et rayons), tout est refusé par le
//   serveur ; ni bouton « Listes », ni tuiles Listes et « À offrir », ni
//   onglet « Listes » de la Corbeille. Rien n'est effacé.
// - notes : les notes (vrai au départ). Coupées, elles disparaissent des
//   écrans de cette personne seulement : ni bouton « Notes » dans le
//   bandeau du bas, ni tuile, ni entrée du menu de gauche, ni nouveautés,
//   ni notifications. Rien n'est effacé : ses notes et celles qu'on lui a
//   partagées restent en base, et reviennent quand elle les rallume.
// - projects : les projets (docs/cadrage-projets.md, 25 novembre 2026),
//   COUPÉS au départ pour tous les comptes. Coupés : rien des projets
//   n'est envoyé à ses appareils (ni projet, ni carte), ses opérations des
//   projets sont refusées par le serveur, leurs adresses mènent au premier
//   écran. Rien n'est effacé : ses projets et ceux qu'on lui a partagés
//   reviennent quand elle les rallume.
//
// D'autres fonctions pourront suivre de la même façon (une colonne
// <nom>_enabled dans la table users, une entrée ici) ; chacune a sa valeur
// de départ.

import { deadlinesShown } from './access.js';
import { deadlinesOn } from './projects.js';

// Les fonctions, dans l'ordre de l'écran, avec leur valeur de départ
// (« Échéances » en tête, comme dans le bandeau du bas et sur l'Accueil)
export const FEATURE_DEFAULTS = { deadlines: true, lists: true, notes: true, projects: false };
export const FEATURES = Object.keys(FEATURE_DEFAULTS);
// Fonctions sans case de l'Admin : le choix de la personne seulement
// (« Échéances » ; les autres ont leur case, access.js, PERMISSIONS)
export const PERSONAL_FEATURES = ['deadlines'];

// Écrans (noms du routeur, router.js) qui appartiennent à une fonction :
// coupée, leurs adresses mènent au premier écran. La corbeille des notes
// n'en est plus un (24 novembre 2026) : c'est un onglet de la Corbeille,
// dont l'adresse mène, notes coupées, à la corbeille des listes
// (trash-tabs.js)
export const FEATURE_ROUTES = {
  deadlines: ['deadlines'],
  lists: ['lists', 'list', 'newList', 'editList', 'gifts'],
  notes: ['notes', 'newNote', 'note'],
  projects: ['projects', 'project', 'projectCard', 'projectSettings', 'projectSettingsTab', 'projectTrash'],
};

// Réglage de départ (aucun choix fait)
export function defaultFeatures() {
  return { ...FEATURE_DEFAULTS };
}

// Réglage complet et valable, à partir de ce qui est gardé (base, copie du
// téléphone) ou reçu, même incomplet ou ancien : valeur de départ pour
// chaque fonction qui manque ou qui n'est pas un booléen ; noms inconnus
// écartés.
export function normalizeFeatures(value) {
  const features = defaultFeatures();
  if (!value || typeof value !== 'object') return features;
  for (const name of FEATURES) {
    if (typeof value[name] === 'boolean') features[name] = value[name];
  }
  return features;
}

// La personne peut-elle allumer ou éteindre cette fonction ? allowed : les
// autorisations de l'Admin (access.js). « Échéances » n'a pas de case :
// proposée dès que l'écran peut servir, c'est-à-dire avec les Listes (un
// Admin et un Utilisateur les ont toujours) ou les Projets autorisés ; un
// invité sans l'un ni l'autre n'a rien à y voir. Les autres : leur case.
export function featureAllowed(name, allowed) {
  if (name === 'deadlines') return allowed?.lists === true || allowed?.projects === true;
  return allowed?.[name] === true;
}

// Problème d'une modification { deadlines?, lists?, notes?, projects? } (le contenu d'une opération
// « account.features », sans son identifiant ni son type) : le nom du texte
// de refus, ou null si tout va bien. Refusés : autre chose qu'un objet,
// nom inconnu, valeur qui n'est pas un booléen, rien à modifier, et (quand
// allowed est donné : les autorisations de l'Admin, access.js) une
// fonction que l'Admin n'a pas autorisée pour ce compte (on ne l'allume ni
// ne l'éteint : elle n'est pas proposée). « Listes » : seulement pour un
// invité (role ; un Admin et un Utilisateur n'ont pas cet interrupteur,
// ils les ont toujours).
export function featuresChangeProblem(change, allowed = null, role = null) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) return 'ops.fonctionsInvalides';
  const names = Object.keys(change);
  if (!names.length) return 'ops.rienAModifier';
  if (!names.every((name) => FEATURES.includes(name))) return 'ops.fonctionInconnue';
  if (role && role !== 'guest' && names.includes('lists')) return 'ops.fonctionInconnue';
  if (!names.every((name) => typeof change[name] === 'boolean')) return 'ops.fonctionsInvalides';
  if (allowed && !names.every((name) => featureAllowed(name, allowed))) return 'ops.fonctionNonAutorisee';
  return null;
}

// Fonctions UTILISÉES (docs/cadrage-comptes.md, étape 2) : autorisées par
// l'Admin (allowed, access.js) ET allumées par la personne (switches, son
// réglage). C'est ce que le serveur vérifie partout et envoie aux écrans
// sous le nom « features » : tout ce qui demande « notes utilisées ? » ou
// « projets utilisés ? » (notesOn, projectsOn, screenAllowed…) suit ainsi
// les deux à la fois. Une fonction autorisée a, dans ce réglage, la
// valeur de son interrupteur (Réglages › Fonctions ne montre qu'elles).
// Les Listes d'un Admin ou d'un Utilisateur (role) : toujours utilisées.
// « Échéances » (sans case) : la valeur de son interrupteur ; l'écran suit
// en plus la règle d'un invité (screenFeatures, ci-dessous).
export function usedFeatures(switches, allowed, role = 'user') {
  const on = normalizeFeatures(switches);
  const used = Object.fromEntries(FEATURES.map((name) => [name, on[name] && allowed?.[name] !== false]));
  if (role !== 'guest') used.lists = true;
  return used;
}

// Fonctions proposées dans Réglages › Fonctions (dans l'ordre de
// FEATURES) : celles que l'Admin autorise (featureAllowed : « Échéances »
// avec les Listes ou les Projets) ; « Listes » pour un invité seulement (un
// Admin et un Utilisateur les ont toujours, sans ligne)
export function offeredFeatures(allowed, role) {
  return FEATURES.filter((name) => featureAllowed(name, allowed) && (name !== 'lists' || role === 'guest'));
}

// Applique une modification valable à un réglage (renvoie un nouveau réglage)
export function applyFeaturesChange(features, change) {
  return normalizeFeatures({ ...normalizeFeatures(features), ...change });
}

// La fonction est-elle utilisée ? (réglage absent : valeur de départ)
export const featureOn = (features, name) => normalizeFeatures(features)[name] === true;
export const listsOn = (features) => featureOn(features, 'lists');
export const notesOn = (features) => featureOn(features, 'notes');
export const projectsOn = (features) => featureOn(features, 'projects');
export const deadlinesFeatureOn = (features) => featureOn(features, 'deadlines');

// Fonction dont dépend un écran (nom du routeur, ou d'une tuile, d'un
// bouton du bandeau, d'un premier écran : ce sont les mêmes noms), ou null
export function featureOf(name) {
  return FEATURES.find((feature) => FEATURE_ROUTES[feature].includes(name)) ?? null;
}

// L'écran est-il ouvert à la personne ? (toujours, sauf s'il appartient à
// une fonction qu'elle n'utilise pas). « Échéances » suit une règle
// calculée (screenFeatures, ci-dessous : son interrupteur ET la règle d'un
// invité) : features.deadlines, faux seulement quand la règle le dit.
export function screenAllowed(name, features) {
  if (name === 'deadlines') return features?.deadlines !== false;
  const feature = featureOf(name);
  return !feature || featureOn(features, feature);
}

// Ce que les écrans montrent (bandeau du bas, tuiles, menu de gauche,
// premier écran, adresses) : les fonctions utilisées (data.features), plus
// la règle de l'écran « Échéances » : son interrupteur (Réglages ›
// Fonctions, 26 novembre 2026) ET, pour un invité (access.js,
// deadlinesShown ; décision du propriétaire du 25 novembre 2026) : un
// projet qu'il voit à l'option « Échéances » allumée. data : la copie
// locale (store.js) ; role : le rôle du compte connecté. Les Listes d'un
// invité (étape 3 du cadrage) : « lists », reçu du serveur (un Admin et
// un Utilisateur les ont toujours).
export function screenFeatures(data, role) {
  const features = normalizeFeatures(data?.features);
  if (role !== 'guest') features.lists = true;
  const projectDeadlines = features.projects
    && [...(data?.projects?.values?.() ?? [])].some((project) => !project.deletedAt && deadlinesOn(project));
  return { ...features, deadlines: features.deadlines && deadlinesShown(role, { lists: features.lists, projectDeadlines }) };
}
