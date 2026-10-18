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
  // Mode scan : la feuille elle-même quand une étape remplace le bouton touché
  ['public/js/screens/scan.js: panel', 'la feuille « Scanner un produit » (tabindex="-1"), jamais un champ'],
  // Photo agrandie de la page publique
  ['public/js/public.js: closeButton', 'bouton « Fermer la photo »'],
  ['public/js/public.js: opener', 'retour à la vignette touchée, sauf champ de saisie'],
]);

test('aucun .select(), autofocus ni setSelectionRange dans l\'interface', () => {
  for (const file of interfaceFiles()) {
    for (const { number, code } of codeLines(file)) {
      assert.ok(!/\.select\(\s*\)/.test(code), `${file}:${number} : .select() met le curseur dans un champ`);
      assert.ok(!/autofocus/i.test(code), `${file}:${number} : autofocus met le curseur dans un champ`);
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
  assert.match(ui, /!isTextField\(opener\)\) opener\.focus\(\)/);
  assert.match(ui, /!isTextField\(start\)\) start\.focus\(\)/);
});

test('les attributs autocomplete des gestionnaires de mots de passe sont conservés', () => {
  const login = fs.readFileSync(path.join(ROOT, 'public/js/screens/login.js'), 'utf8');
  for (const value of ['username', 'current-password', 'new-password', 'one-time-code']) {
    assert.ok(login.includes(`autocomplete: '${value}'`), `autocomplete « ${value} » absent de l'écran de connexion`);
  }
});
