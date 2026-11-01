// Champs de nom de produit ou de libellé : rien qui fasse croire à l'iPhone
// qu'il s'agit d'un contact (« Préremplir le contact ») — ni libellé
// « Nom », ni name, ni id parlant, ni aria-label avec « nom » — et les mêmes
// attributs partout (LABEL_INPUT de dom.js). Les champs de connexion, de
// compte, de mot de passe et de double authentification ne changent pas. Le
// vrai clavier de l'iPhone reste à essayer (docs/developpement.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LABEL_INPUT } from '../public/js/dom.js';

const read = (file) => fs.readFileSync(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('LABEL_INPUT : champ texte sans remplissage automatique ni correction, majuscule en début de phrase', () => {
  assert.deepEqual(LABEL_INPUT, { type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'done', inputmode: 'text' });
  assert.ok(!('name' in LABEL_INPUT) && !('id' in LABEL_INPUT));
});

test('chaque champ de nom de produit ou de libellé utilise LABEL_INPUT, sans « Nom » ni name ni id', () => {
  const uses = {
    'screens/list.js': 1,       // fiche d'un élément : nom
    'screens/list-form.js': 1,  // nom de la liste
    'screens/scan.js': 1,       // mode scan : nom du produit
    'screens/admin.js': 3,      // ajout, renommage sur place, nom enregistré
  };
  for (const [file, count] of Object.entries(uses)) {
    const source = read(file);
    const inputs = [...source.matchAll(/h\('input', \{ class: 'input', \.\.\.LABEL_INPUT,[^\n]*\}\)/g)].map((m) => m[0]);
    assert.equal(inputs.length, count, `${file} : ${inputs.length} champ(s)`);
    for (const input of inputs) {
      assert.doesNotMatch(input, /\bname:|\bid:|'aria-label': `?[^,]*\b[Nn]om\b/, `${file} : ${input}`);
    }
    // Aucun libellé « Nom » visible
    assert.doesNotMatch(source, /field\('Nom'|value\('Nom'/, file);
  }
  assert.match(read('screens/list.js'), /const nameField = field\(capitalized\(words\.one\), name\);/);
  assert.match(read('screens/list.js'), /value\(capitalized\(words\.one\), it\.name\),/);
  assert.match(read('screens/list-form.js'), /field\('Titre de la liste', h\('div', \{ class: 'field__row' \}, iconPicker, name, iconCurrent\)\)/);
  // Le libellé désigne le champ, même avec un bouton avant lui sur la ligne
  assert.match(read('dom.js'), /control\.querySelector\('input, textarea, select'\) \?\? control\.querySelector\('button'\)/);
  assert.match(read('screens/scan.js'), /field\('Article', nameInput\)/);
  const admin = read('screens/admin.js');
  assert.match(admin, /'aria-label': `Renommer « \$\{item\.name\} »`/);
  assert.match(admin, /'aria-label': `Orthographe corrigée de « \$\{entry\.name\} »`/);
});

test('connexion, compte, mot de passe, double authentification : inchangés', () => {
  const login = read('screens/login.js');
  assert.match(login, /autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', value: info\.username \?\? ''/);
  assert.match(login, /autocomplete: 'new-password'/);
  assert.match(login, /autocomplete: 'one-time-code'/);
  const settings = read('screens/settings.js');
  assert.match(settings, /autocomplete: 'new-password'/);
  assert.match(settings, /autocomplete: 'one-time-code'/);
  const admin = read('screens/admin.js');
  assert.match(admin, /const username = h\('input', \{ class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' \}\);/);
  assert.match(admin, /const displayName = h\('input', \{ class: 'input', type: 'text', autocomplete: 'off', maxlength: '100' \}\);/);
  for (const file of ['screens/login.js', 'screens/settings.js', 'screens/account.js']) {
    assert.doesNotMatch(read(file), /LABEL_INPUT/, file);
  }
  assert.match(read('dom.js'), /const input = h\('input', \{ class: 'input', type: 'password', autocapitalize: 'off', spellcheck: 'false', \.\.\.attrs \}\);/);
});
