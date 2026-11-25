// Clavier du téléphone : Listo ne met jamais le curseur dans un champ de
// saisie de lui-même (ni à l'ouverture d'un écran, d'une fenêtre ou d'un mode
// d'édition, ni après une erreur ou un ajout). Le clavier ne s'ouvre que
// quand on touche un champ.
//
// Test par lecture des fichiers de l'interface : il échoue si un .select(),
// un attribut autofocus ou un .focus() non prévu réapparaît.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// Tous les fichiers de l'interface (JavaScript et HTML), et les pages HTML
// du lien public servies par le serveur
function interfaceFiles() {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(js|html)$/.test(entry.name)) found.push(rel);
    }
  };
  walk('public');
  walk('server/pages');
  walk('scripts/site-assets'); // page publique du guide (site/)
  return found;
}

// Lignes de code d'un fichier, sans les commentaires de fin de ligne
const codeLines = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
  .map((line, i) => ({ number: i + 1, code: line.replace(/\/\/.*$/, '') }));

// Seuls .focus() permis, chacun sur un élément qui n'est jamais un champ de
// saisie. Clé : « fichier : élément ». Aucune autre exception n'est attendue.
const ALLOWED_FOCUS = new Map([
  // Fenêtres (feuilles, dialogues, menus) : la fenêtre elle-même
  ['public/js/ui.js: panel', 'la fenêtre elle-même (tabindex="-1")'],
  ['public/js/ui.js: start', 'bouton de départ marqué data-initial-focus, vérifié par isTextField'],
  ['public/js/ui.js: opener', "retour à l'élément d'origine à la fermeture, sauf champ de saisie (isTextField)"],
  ['public/js/ui.js: first', 'piège de focus : touche Tab (geste de la personne)'],
  ['public/js/ui.js: last', 'piège de focus : Maj+Tab (geste de la personne)'],
  // Menus au clavier (lot 3, 15 novembre 2026) : des boutons, jamais un champ
  ['public/js/ui.js: firstChoice', 'premier choix d\'un menu ouvert au clavier (un bouton)'],
  ['public/js/ui.js: radioTarget', 'flèches dans un choix à options (role="radiogroup"), geste de la personne'],
  ['public/js/ui.js: nextChoice', 'flèches haut et bas, Début et Fin dans un menu (geste de la personne)'],
  // Mode scan : la feuille elle-même quand une étape remplace le bouton touché
  ['public/js/screens/scan.js: panel', 'la feuille « Scanner un produit » (tabindex="-1"), jamais un champ'],
  // Page publique : fiche d'un article et photo agrandie (openLayer)
  ['public/js/public.js: panel', 'la fiche elle-même (tabindex="-1")'],
  ['public/js/public.js: start', 'bouton « Fermer la photo » (data-initial-focus), jamais un champ'],
  ['public/js/public.js: opener', "retour à la ligne ou à la vignette touchée, sauf champ de saisie"],
  ['public/js/public.js: first', 'piège de focus : touche Tab (geste de la personne)'],
  ['public/js/public.js: last', 'piège de focus : Maj+Tab (geste de la personne)'],
  // Guide (application et site) : SEULE exception à « aucun curseur
  // automatique » (décision du 10 novembre 2026) : après un appui sur la
  // loupe, dont le seul but est d'écrire, le curseur va dans le champ
  ['public/js/screens/help.js: input', 'EXCEPTION voulue : champ de recherche, juste après un appui sur la loupe'],
  ['public/js/screens/help.js: searchButton', 'retour à la loupe quand la barre de recherche se ferme'],
  ['public/js/screens/help.js: topTitle', 'titre « Aide » (tabindex="-1") après « Retour en haut »'],
  // Téléphone : loupe ronde (Mes listes, Échéances, chaque liste), geste
  // dont le seul but est d'écrire (décision du 11 novembre 2026)
  ['public/js/search-row.js: input', 'EXCEPTION voulue : champ de recherche, juste après un appui sur la loupe'],
  ['public/sw.js: open', 'fenêtre de Listo déjà ouverte, ramenée au premier plan quand on touche une notification (jamais un champ)'],
  ['scripts/site-assets/guide.js: field', 'EXCEPTION voulue : champ de recherche, juste après un appui sur la loupe'],
  // Ordinateur (shortcuts.js) : « / » (recherche) et « A » (champ d'ajout),
  // gestes dont le seul but est d'écrire ; S : le sommaire de l'aide
  ['public/js/shortcuts.js: field', 'EXCEPTION voulue : touche « / » (recherche) ou « A » (champ d\'ajout)'],
  // Fiche d'une tâche : sous-pages (décision du 11 novembre 2026)
  // Changement d'écran : le titre h1 du nouvel écran (tabindex="-1")
  ['public/js/app.js: heading', 'titre h1 du nouvel écran (tabindex="-1") après un changement d\'écran, jamais un champ'],
  // Notes (décision du 23 novembre 2026) : « Nouvelle note » (saisie rapide
  // de l'Accueil, « + » de l'écran Notes, touche N) est un geste fait pour
  // écrire, le curseur va dans le texte ; toucher le texte affiché d'une
  // note (ou Entrée) le remplace par le champ, curseur à l'endroit touché
  ['public/js/screens/note.js: input', 'EXCEPTION voulue : texte d\'une note, après « Nouvelle note » (+, N) ou un appui sur le texte affiché'],
  ['public/js/screens/list.js: heading', 'titre d\'une sous-page de la fiche (tabindex="-1"), après un appui sur sa ligne'],
  // Projets (docs/cadrage-projets.md, 14 ; 25 novembre 2026) : gestes faits
  // pour écrire. « Nouveau projet » (« + », bouton du menu de gauche, N) :
  // le nom ; « + Ajouter une carte » d'une colonne, « Nouvelle carte » ou N
  // (ordinateur) : le titre de la carte ; toucher le titre d'une carte
  // ouverte : son champ, curseur à la fin. Jamais à l'ouverture d'un projet
  // ni d'une carte.
  ['public/js/screens/projects.js: input', 'EXCEPTION voulue : nom d\'un nouveau projet, après « + », « Nouveau projet » ou N'],
  ['public/js/screens/project.js: field', 'EXCEPTION voulue : titre d\'une nouvelle carte, après « + Ajouter une carte », « Nouvelle carte » ou N'],
  ['public/js/screens/project-card.js: input', 'EXCEPTION voulue : titre d\'une carte ouverte, après un appui sur ce titre'],
  // Description d'une carte (étape 2, 25 novembre 2026) : comme le texte
  // d'une note, toucher le texte affiché (ou « + Ajouter une description »)
  // le remplace par le champ, curseur à l'endroit touché ; un bouton de la
  // barre de mise en forme garde le curseur dans le champ
  ['public/js/screens/card-description.js: input', 'EXCEPTION voulue : description d\'une carte, après un appui sur son texte affiché ou « + Ajouter une description »'],
  // Barre de mise en forme d'une note (24 novembre 2026) : flèches,
  // Début et Fin d'un bouton à l'autre (role="toolbar"), des boutons
  ['public/js/screens/note-toolbar.js: next', 'flèches dans la barre de mise en forme d\'une note (un bouton, jamais un champ)'],
  ['public/js/screens/list.js: row', 'retour d\'une sous-page : la ligne résumée qui l\'a ouverte (un bouton, jamais un champ)'],
  ['public/js/screens/list.js: moveTarget', '« Réordonner » des sous-tâches : après Monter, Descendre, Réordonner ou Terminé, le focus reste sur le bouton touché (un bouton, jamais un champ)'],
  ['public/js/screens/home-settings.js: target', 'Réglages › Accueil : après un interrupteur, un choix, Monter, Descendre, Réordonner ou Terminé, le focus reste sur le bouton touché (data-key : des boutons seulement, jamais un champ)'],
  ['public/js/screens/home-settings.js: projectsRow', 'Réglages › Accueil : feuille « Tuile Projets » fermée après un choix (écran redessiné derrière), le focus revient sur la nouvelle ligne « Projets » (un bouton, jamais un champ)'],
  ['public/js/screens/list.js: target', 'ordinateur : focus clavier gardé sur la même ligne après un redessin (un bouton de la ligne, jamais un champ)'],
  ['public/js/shortcuts.js: link', 'touche S : une entrée du sommaire de l\'aide (un lien, jamais un champ)'],
  ['scripts/site-assets/guide.js: searchButton', 'retour à la loupe quand la barre de recherche se ferme'],
  ['scripts/site-assets/guide.js: title', 'titre de la page (tabindex="-1") après « Retour en haut »'],
  ['scripts/site-assets/guide.js: pageTitle', 'titre du sommaire de la page (tabindex="-1"), navigateur sans <dialog>'],
  ['scripts/site-assets/guide.js: el', 'titre d\'une section (tabindex="-1") après un saut'],
  ['scripts/site-assets/guide.js: button', 'retour au bouton « Sommaire » à la fermeture de la feuille'],
]);

// Seul setSelectionRange permis : le curseur d'une note, placé à l'endroit
// touché du texte affiché (geste fait pour écrire, décision du 23 novembre 2026)
// ; et le titre d'une carte ouverte, curseur à la fin après un appui sur ce
// titre (projets, 25 novembre 2026) ; et sa description, à l'endroit touché
const ALLOWED_SELECTION = ['public/js/screens/note.js', 'public/js/screens/project-card.js', 'public/js/screens/card-description.js'];

test('aucun .select(), autofocus ni setSelectionRange dans l\'interface', () => {
  for (const file of interfaceFiles()) {
    for (const { number, code } of codeLines(file)) {
      assert.ok(!/\.select\(\s*\)/.test(code), `${file}:${number} : .select() met le curseur dans un champ`);
      assert.ok(!/autofocus/i.test(code), `${file}:${number} : autofocus met le curseur dans un champ`);
      if (ALLOWED_SELECTION.includes(file)) continue;
      assert.ok(!/setSelectionRange/.test(code), `${file}:${number} : setSelectionRange place le curseur dans un champ`);
    }
  }
});

test('chaque .focus() de l\'interface est une exception prévue (jamais un champ de saisie)', () => {
  const seen = new Set();
  for (const file of interfaceFiles()) {
    for (const { number, code } of codeLines(file)) {
      for (const match of code.matchAll(/([\w$.]+?)\??\.focus\(/g)) {
        const receiver = match[1].split('.').pop();
        const key = `${file}: ${receiver}`;
        assert.ok(ALLOWED_FOCUS.has(key), `${file}:${number} : .focus() sur « ${receiver} » n'est pas une exception prévue`);
        seen.add(key);
      }
    }
  }
  // Les exceptions servent toutes (une exception devenue inutile est retirée)
  assert.deepEqual([...ALLOWED_FOCUS.keys()].filter((key) => !seen.has(key)), []);
  // Les gardes contre les champs de saisie sont bien là
  const ui = fs.readFileSync(path.join(ROOT, 'public/js/ui.js'), 'utf8');
  assert.match(ui, /!isTextField\(opener\)\) opener\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ui, /!isTextField\(start\)\) start\.focus\(\{ preventScroll: true \}\)/);
});

test('les attributs autocomplete des gestionnaires de mots de passe sont conservés', () => {
  const login = fs.readFileSync(path.join(ROOT, 'public/js/screens/login.js'), 'utf8');
  for (const value of ['username', 'current-password', 'new-password', 'one-time-code']) {
    assert.ok(login.includes(`autocomplete: '${value}'`), `autocomplete « ${value} » absent de l'écran de connexion`);
  }
});
