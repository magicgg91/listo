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

import accueil from './fr/accueil.js';
import administration from './fr/administration.js';
import aide from './fr/aide.js';
import ajout from './fr/ajout.js';
import alertes from './fr/alertes.js';
import annulation from './fr/annulation.js';
import application from './fr/application.js';
import autorisation from './fr/autorisation.js';
import claude from './fr/claude.js';
import compte from './fr/compte.js';
import comptes from './fr/comptes.js';
import connexion from './fr/connexion.js';
import corbeille from './fr/corbeille.js';
import demarrage from './fr/demarrage.js';
import donnees from './fr/donnees.js';
import echeances from './fr/echeances.js';
import fenetres from './fr/fenetres.js';
import format from './fr/format.js';
import formulaire from './fr/formulaire.js';
import icones from './fr/icones.js';
import inbox from './fr/inbox.js';
import lienpublic from './fr/lienpublic.js';
import liens from './fr/liens.js';
import liste from './fr/liste.js';
import listes from './fr/listes.js';
import menu from './fr/menu.js';
import mots from './fr/mots.js';
import navigation from './fr/navigation.js';
import notes from './fr/notes.js';
import notifications from './fr/notifications.js';
import offrir from './fr/offrir.js';
import ops from './fr/ops.js';
import partage from './fr/partage.js';
import photo from './fr/photo.js';
import photos from './fr/photos.js';
import push from './fr/push.js';
import raccourcis from './fr/raccourcis.js';
import recherche from './fr/recherche.js';
import reference from './fr/reference.js';
import references from './fr/references.js';
import reglages from './fr/reglages.js';
import regles from './fr/regles.js';
import repetition from './fr/repetition.js';
import reseau from './fr/reseau.js';
import scan from './fr/scan.js';
import version from './fr/version.js';

export const PARTS = { accueil, administration, aide, ajout, alertes, annulation, application, autorisation, claude, compte, comptes, connexion, corbeille, demarrage, donnees, echeances, fenetres, format, formulaire, icones, inbox, lienpublic, liens, liste, listes, menu, mots, navigation, notes, notifications, offrir, ops, partage, photo, photos, push, raccourcis, recherche, reference, references, reglages, regles, repetition, reseau, scan, version };

export default Object.assign({}, ...Object.values(PARTS));
