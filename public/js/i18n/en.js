// Textes de Listo en anglais (voir public/js/i18n.js et public/js/i18n/fr.js) :
// mêmes parties (public/js/i18n/en/) et mêmes noms qu'en français. Les noms
// restent en français : ce sont des repères dans le code, jamais affichés.
// Tant que l'anglais n'est pas complet (READY_LOCALES), un texte absent
// d'ici s'affiche en français.

import administration from './en/administration.js';
import compte from './en/compte.js';
import connexion from './en/connexion.js';
import notifications from './en/notifications.js';
import reglages from './en/reglages.js';

export const PARTS = { administration, compte, connexion, notifications, reglages };

export default Object.assign({}, ...Object.values(PARTS));
