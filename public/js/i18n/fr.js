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
import aide from './fr/aide.js';
import ajout from './fr/ajout.js';
import annulation from './fr/annulation.js';
import application from './fr/application.js';
import claude from './fr/claude.js';
import compte from './fr/compte.js';
import connexion from './fr/connexion.js';
import corbeille from './fr/corbeille.js';
import donnees from './fr/donnees.js';
import echeances from './fr/echeances.js';
import fenetres from './fr/fenetres.js';
import format from './fr/format.js';
import formulaire from './fr/formulaire.js';
import icones from './fr/icones.js';
import lienpublic from './fr/lienpublic.js';
import liste from './fr/liste.js';
import listes from './fr/listes.js';
import menu from './fr/menu.js';
import mots from './fr/mots.js';
import navigation from './fr/navigation.js';
import notifications from './fr/notifications.js';
import partage from './fr/partage.js';
import photo from './fr/photo.js';
import push from './fr/push.js';
import raccourcis from './fr/raccourcis.js';
import recherche from './fr/recherche.js';
import reference from './fr/reference.js';
import reglages from './fr/reglages.js';
import reseau from './fr/reseau.js';
import scan from './fr/scan.js';
import version from './fr/version.js';

export const PARTS = { administration, aide, ajout, annulation, application, claude, compte, connexion, corbeille, donnees, echeances, fenetres, format, formulaire, icones, lienpublic, liste, listes, menu, mots, navigation, notifications, partage, photo, push, raccourcis, recherche, reference, reglages, reseau, scan, version };

export default Object.assign({}, ...Object.values(PARTS));
