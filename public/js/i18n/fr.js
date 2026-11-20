// Textes de Listo en français : la langue de référence (voir public/js/i18n.js).
//
// Rangés par écran, un fichier par partie dans public/js/i18n/fr/ ; chaque
// nom commence par le nom de sa partie (« compte.langue.titre » est dans
// fr/compte.js), ainsi deux parties ne peuvent pas donner le même nom.
// public/js/i18n/en.js a les mêmes parties et les mêmes noms, en anglais.
// Valeurs : une phrase avec ses emplacements {nom}, ou les formes du
// pluriel ({ one, other }, ou une forme exacte « =1 »), choisies avec { count }.
// Chaque nouvelle partie est ajoutée ici, dans en.js et dans APP_FILES
// (public/sw.js).

import administration from './fr/administration.js';
import compte from './fr/compte.js';
import connexion from './fr/connexion.js';
import notifications from './fr/notifications.js';
import reglages from './fr/reglages.js';

export const PARTS = { administration, compte, connexion, notifications, reglages };

export default Object.assign({}, ...Object.values(PARTS));
