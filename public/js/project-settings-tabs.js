// Réglages d'un projet en deux onglets (décision du propriétaire du 25
// novembre 2026, variante A) : « Projet » (nom, options, colonnes,
// « Supprimer le projet ») et « Étiquettes » (recherche, « Nouvelle
// étiquette », étiquettes par ordre alphabétique). L'écran est dans
// screens/project-settings.js ; ici, les règles « pures » (aucune page
// touchée), testées automatiquement (test/project-settings-tabs.test.js).
//
// Adresses (comme les onglets de la Corbeille, trash-tabs.js) :
// - #/projets/<id>/reglages : l'onglet « Projet » (l'adresse d'avant les
//   onglets, gardée telle quelle) ;
// - #/projets/<id>/reglages/etiquettes : l'onglet « Étiquettes » ;
// - #/projets/<id>/reglages/projet : l'onglet « Projet » aussi ;
// - un autre nom : les réglages, onglet « Projet » (app.js remplace
//   l'adresse).

import { matches } from './search.js';
import { compareText } from './i18n.js';

// Les onglets, dans l'ordre de l'écran (noms écrits dans l'adresse)
export const SETTINGS_TABS = ['projet', 'etiquettes'];

// Onglet demandé par l'adresse : celui à ouvrir, ou null (nom inconnu :
// retour à #/projets/<id>/reglages)
export function askedSettingsTab(tab) {
  return SETTINGS_TABS.includes(tab) ? tab : null;
}

// Étiquettes par ordre alphabétique de leur nom, dans la langue du compte :
// majuscules et accents ignorés (« éco » avec « Eco »), nombres lus comme
// des nombres (« 2025 2 » avant « 2025 10 »). Même nom à la comparaison :
// l'ordre ne dépend que de l'identifiant (jamais de l'ordre reçu). La liste
// reçue n'est pas modifiée. locale : « fr » ou « en » (langue de l'écran
// quand elle n'est pas donnée).
export function sortedLabels(labels, locale) {
  const options = { numeric: true, sensitivity: 'base', ...(locale ? { locale } : {}) };
  return [...(labels ?? [])].sort((a, b) => compareText(a.name, b.name, options)
    || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
}

// Étiquettes dont le nom contient le texte cherché (majuscules, accents et
// ligatures ignorés, le texte tapé jamais lu comme une expression : la
// recherche de l'application, search.js). Recherche vide : toutes.
export function foundLabels(labels, query) {
  return (labels ?? []).filter((label) => matches(label.name, query));
}
