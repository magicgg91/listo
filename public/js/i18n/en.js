// Textes de Listo en anglais (voir public/js/i18n.js et public/js/i18n/fr.js) :
// mêmes parties (public/js/i18n/en/) et mêmes noms qu'en français. Les noms
// restent en français : ce sont des repères dans le code, jamais affichés.
// Tant que l'anglais n'est pas complet (READY_LOCALES), un texte absent
// d'ici s'affiche en français.

import accueil from './en/accueil.js';
import administration from './en/administration.js';
import aide from './en/aide.js';
import ajout from './en/ajout.js';
import alertes from './en/alertes.js';
import annulation from './en/annulation.js';
import application from './en/application.js';
import autorisation from './en/autorisation.js';
import claude from './en/claude.js';
import compte from './en/compte.js';
import comptes from './en/comptes.js';
import connexion from './en/connexion.js';
import corbeille from './en/corbeille.js';
import demarrage from './en/demarrage.js';
import donnees from './en/donnees.js';
import echeances from './en/echeances.js';
import fenetres from './en/fenetres.js';
import format from './en/format.js';
import formulaire from './en/formulaire.js';
import icones from './en/icones.js';
import inbox from './en/inbox.js';
import lienpublic from './en/lienpublic.js';
import liens from './en/liens.js';
import liste from './en/liste.js';
import listes from './en/listes.js';
import menu from './en/menu.js';
import mots from './en/mots.js';
import navigation from './en/navigation.js';
import notes from './en/notes.js';
import notifications from './en/notifications.js';
import offrir from './en/offrir.js';
import ops from './en/ops.js';
import partage from './en/partage.js';
import photo from './en/photo.js';
import photos from './en/photos.js';
import projets from './en/projets.js';
import push from './en/push.js';
import raccourcis from './en/raccourcis.js';
import recherche from './en/recherche.js';
import reference from './en/reference.js';
import references from './en/references.js';
import reglages from './en/reglages.js';
import regles from './en/regles.js';
import repetition from './en/repetition.js';
import reseau from './en/reseau.js';
import scan from './en/scan.js';
import version from './en/version.js';

export const PARTS = { accueil, administration, aide, ajout, alertes, annulation, application, autorisation, claude, compte, comptes, connexion, corbeille, demarrage, donnees, echeances, fenetres, format, formulaire, icones, inbox, lienpublic, liens, liste, listes, menu, mots, navigation, notes, notifications, offrir, ops, partage, photo, photos, projets, push, raccourcis, recherche, reference, references, reglages, regles, repetition, reseau, scan, version };

export default Object.assign({}, ...Object.values(PARTS));
