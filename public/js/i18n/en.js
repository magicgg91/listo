// Textes de Listo en anglais (voir public/js/i18n.js et public/js/i18n/fr.js) :
// mêmes parties (public/js/i18n/en/) et mêmes noms qu'en français. Les noms
// restent en français : ce sont des repères dans le code, jamais affichés.
// Tant que l'anglais n'est pas complet (READY_LOCALES), un texte absent
// d'ici s'affiche en français.

import administration from './en/administration.js';
import ajout from './en/ajout.js';
import annulation from './en/annulation.js';
import compte from './en/compte.js';
import connexion from './en/connexion.js';
import formulaire from './en/formulaire.js';
import icones from './en/icones.js';
import liste from './en/liste.js';
import listes from './en/listes.js';
import menu from './en/menu.js';
import navigation from './en/navigation.js';
import notifications from './en/notifications.js';
import raccourcis from './en/raccourcis.js';
import reference from './en/reference.js';
import reglages from './en/reglages.js';
import scan from './en/scan.js';

export const PARTS = { administration, ajout, annulation, compte, connexion, formulaire, icones, liste, listes, menu, navigation, notifications, raccourcis, reference, reglages, scan };

export default Object.assign({}, ...Object.values(PARTS));
