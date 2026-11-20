// Le guide de Listo en anglais : assemble les chapitres traduits
// (public/js/help-en/<identifiant>.js, un fichier par chapitre) dans l'ordre
// du guide français, et le tableau « Qui peut quoi » (help-en/tableau.js).
//
// Même structure que public/js/help-content.js (mêmes identifiants, donc
// mêmes ancres ; mêmes blocs ; mêmes renvois [[…]]), vérifiée par
// test/help-en.test.js. Les numéros sont calculés de la même façon
// (outline de help-content.js), jamais écrits à la main.
//
// Conventions d'écriture propres à l'anglais :
// - “ … ” : un libellé qui existe tel quel à l'écran (textes anglais de
//   public/js/i18n/en/), ou un exemple ; jamais de « » ;
// - anglais simple, phrases courtes.
//
// Ce fichier n'importe jamais help-content.js (c'est help-content.js qui
// l'importe, par helpFor) : pas d'import circulaire.

import presentation from './help-en/presentation.js';
import possibilites from './help-en/possibilites.js';
import installation from './help-en/installation.js';
import comptes from './help-en/comptes.js';
import quotidien from './help-en/quotidien.js';
import notifications from './help-en/notifications.js';
import roles from './help-en/roles.js';
import claude from './help-en/claude.js';
import faq from './help-en/faq.js';

export { ROLES, PERMISSIONS, PERMISSIONS_NOTE, SERVER_NOTE } from './help-en/tableau.js';

// Les chapitres, dans l'ordre du guide français
export const GUIDE = [presentation, possibilites, installation, comptes, quotidien, notifications, roles, claude, faq];

// Textes des copies du guide hors de l'application (docs/guide.en.md et la
// page publique en anglais, fabriqués par scripts/guide.js) : mêmes noms que
// DOC dans help-content.js. {site} : adresse de la page publique ; {server} :
// SERVER_NOTE ; [texte](https://…) : un lien.
export const DOC = {
  title: 'Listo: the guide',
  description: 'The complete manual for Listo, an app for shared lists (shopping, tasks, wishes) that you install on your own server.',
  // docs/guide.en.md : sous le titre
  intro: 'The complete Listo manual, the same as the app\'s “Help” page (Settings › “Help”) and the online page [{site}]({site}). Parts marked “{server}” only concern installing the server; its upkeep (restoring, updates, logs) is described in the operations guide, [docs/exploitation.md](exploitation.md) (in French). French version: [docs/guide.md](guide.md).',
  // Page publique : sous le titre
  siteIntro: 'The complete Listo manual, the same as the app\'s “Help” page (Settings › “Help”). Parts marked “{server}” only concern installing the server.',
  footer: 'Listo is free software (Apache-2.0 license). Source code: [github.com/magicgg91/listo](https://github.com/magicgg91/listo).',
  // Tableau « Qui peut quoi » en Markdown : en-tête de la première colonne, puis oui / non
  action: 'Action',
  yes: 'Yes',
  no: 'No',
  // Encadré d'avertissement en Markdown
  warning: 'Warning',
};
