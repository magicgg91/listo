// Textes de Listo en anglais (voir public/js/i18n.js et public/js/i18n/fr.js) :
// mêmes parties (public/js/i18n/en/) et mêmes noms qu'en français. Les noms
// restent en français : ce sont des repères dans le code, jamais affichés.
// Tant que l'anglais n'est pas complet (READY_LOCALES), un texte absent
// d'ici s'affiche en français.

import administration from './en/administration.js';
import aide from './en/aide.js';
import ajout from './en/ajout.js';
import annulation from './en/annulation.js';
import application from './en/application.js';
import claude from './en/claude.js';
import compte from './en/compte.js';
import connexion from './en/connexion.js';
import corbeille from './en/corbeille.js';
import donnees from './en/donnees.js';
import echeances from './en/echeances.js';
import fenetres from './en/fenetres.js';
import format from './en/format.js';
import formulaire from './en/formulaire.js';
import icones from './en/icones.js';
import lienpublic from './en/lienpublic.js';
import liste from './en/liste.js';
import listes from './en/listes.js';
import menu from './en/menu.js';
import mots from './en/mots.js';
import navigation from './en/navigation.js';
import notifications from './en/notifications.js';
import partage from './en/partage.js';
import photo from './en/photo.js';
import push from './en/push.js';
import raccourcis from './en/raccourcis.js';
import recherche from './en/recherche.js';
import reference from './en/reference.js';
import reglages from './en/reglages.js';
import reseau from './en/reseau.js';
import scan from './en/scan.js';
import version from './en/version.js';

export const PARTS = { administration, aide, ajout, annulation, application, claude, compte, connexion, corbeille, donnees, echeances, fenetres, format, formulaire, icones, lienpublic, liste, listes, menu, mots, navigation, notifications, partage, photo, push, raccourcis, recherche, reference, reglages, reseau, scan, version };

export default Object.assign({}, ...Object.values(PARTS));
