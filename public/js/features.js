// Réglage « Fonctions » de chaque compte (Réglages › Fonctions, décision du
// 24 novembre 2026) : les fonctions de Listo qu'une personne peut couper
// pour elle seule. Règles partagées par le serveur (server/features.js, qui
// vérifie tout) et par les écrans (copie locale, file d'attente hors
// ligne). Aucun texte ici, aucune page touchée : des fonctions « pures »,
// testées automatiquement (test/features.test.js).
//
// Le réglage : { notes, projects } (vrai : la fonction est utilisée).
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
export const FEATURE_DEFAULTS = { notes: true, projects: false };
export const FEATURES = Object.keys(FEATURE_DEFAULTS);

// Écrans (noms du routeur, router.js) qui appartiennent à une fonction :
// coupée, leurs adresses mènent au premier écran. La corbeille des notes
// n'en est plus un (24 novembre 2026) : c'est un onglet de la Corbeille,
// dont l'adresse mène, notes coupées, à la corbeille des listes
// (trash-tabs.js)
export const FEATURE_ROUTES = {
  notes: ['notes', 'newNote', 'note'],
  projects: ['projects', 'project', 'projectCard', 'projectSettings', 'projectTrash'],
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

// Problème d'une modification { notes?, projects? } (le contenu d'une opération
// « account.features », sans son identifiant ni son type) : le nom du texte
// de refus, ou null si tout va bien. Refusés : autre chose qu'un objet,
// nom inconnu, valeur qui n'est pas un booléen, rien à modifier, et (quand
// allowed est donné : les autorisations de l'Admin, access.js) une
// fonction que l'Admin n'a pas autorisée pour ce compte (on ne l'allume ni
// ne l'éteint : elle n'est pas proposée).
export function featuresChangeProblem(change, allowed = null) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) return 'ops.fonctionsInvalides';
  const names = Object.keys(change);
  if (!names.length) return 'ops.rienAModifier';
  if (!names.every((name) => FEATURES.includes(name))) return 'ops.fonctionInconnue';
  if (!names.every((name) => typeof change[name] === 'boolean')) return 'ops.fonctionsInvalides';
  if (allowed && !names.every((name) => allowed[name] === true)) return 'ops.fonctionNonAutorisee';
  return null;
}

// Fonctions UTILISÉES (docs/cadrage-comptes.md, étape 2) : autorisées par
// l'Admin (allowed, access.js) ET allumées par la personne (switches, son
// réglage). C'est ce que le serveur vérifie partout et envoie aux écrans
// sous le nom « features » : tout ce qui demande « notes utilisées ? » ou
// « projets utilisés ? » (notesOn, projectsOn, screenAllowed…) suit ainsi
// les deux à la fois. Une fonction autorisée a, dans ce réglage, la
// valeur de son interrupteur (Réglages › Fonctions ne montre qu'elles).
export function usedFeatures(switches, allowed) {
  const on = normalizeFeatures(switches);
  return Object.fromEntries(FEATURES.map((name) => [name, on[name] && allowed?.[name] !== false]));
}

// Applique une modification valable à un réglage (renvoie un nouveau réglage)
export function applyFeaturesChange(features, change) {
  return normalizeFeatures({ ...normalizeFeatures(features), ...change });
}

// La fonction est-elle utilisée ? (réglage absent : valeur de départ)
export const featureOn = (features, name) => normalizeFeatures(features)[name] === true;
export const notesOn = (features) => featureOn(features, 'notes');
export const projectsOn = (features) => featureOn(features, 'projects');

// Fonction dont dépend un écran (nom du routeur, ou d'une tuile, d'un
// bouton du bandeau, d'un premier écran : ce sont les mêmes noms), ou null
export function featureOf(name) {
  return FEATURES.find((feature) => FEATURE_ROUTES[feature].includes(name)) ?? null;
}

// L'écran est-il ouvert à la personne ? (toujours, sauf s'il appartient à
// une fonction qu'elle n'utilise pas). « Échéances » suit une règle
// calculée (screenFeatures, ci-dessous) : features.deadlines, faux
// seulement quand la règle le dit.
export function screenAllowed(name, features) {
  if (name === 'deadlines') return features?.deadlines !== false;
  const feature = featureOf(name);
  return !feature || featureOn(features, feature);
}

// Ce que les écrans montrent (bandeau du bas, tuiles, menu de gauche,
// premier écran, adresses) : les fonctions utilisées (data.features), plus
// la règle de l'écran « Échéances » pour un invité (access.js,
// deadlinesShown ; décision du propriétaire du 25 novembre 2026) : un
// projet qu'il voit à l'option « Échéances » allumée. data : la copie
// locale (store.js) ; role : le rôle du compte connecté. (Étape 3 du
// cadrage : les Listes d'un invité s'ajouteront ici, « lists ».)
export function screenFeatures(data, role) {
  const features = normalizeFeatures(data?.features);
  const projectDeadlines = features.projects
    && [...(data?.projects?.values?.() ?? [])].some((project) => !project.deletedAt && deadlinesOn(project));
  return { ...features, deadlines: deadlinesShown(role, { lists: true, projectDeadlines }) };
}
