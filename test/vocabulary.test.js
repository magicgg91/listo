// Vocabulaire des personnes d'une liste (décision du 19 octobre 2026) :
// - propriétaire : la personne qui a créé la liste ;
// - contributeur : un compte avec le droit « Peut modifier » ;
// - invité : lecture seule (un compte « Lecture seule », ou le lien public) ;
// - « personne(s) » quand un texte vise les deux.
// Les libellés « Peut modifier » et « Lecture seule » ne changent pas, ni les
// identifiants internes (colonnes, routes, événements).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const jsFiles = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'vendor' ? [] : jsFiles(rel);
  return rel.endsWith('.js') ? [rel] : [];
});

test('interface : « invité » ne désigne jamais une personne qui peut modifier', () => {
  for (const file of jsFiles('public/js').filter((f) => !f.endsWith('help-content.js'))) {
    const text = code(file);
    // Aucun texte d'écran, de menu, de message ou d'aria-label ne dit « invité » :
    // il y est question de « personnes avec qui la liste est partagée »
    assert.doesNotMatch(text, /invit/i, file);
  }
  // Fenêtre de partage (lien public), menus et messages : les textes précis
  const actions = code('public/js/screens/list-actions.js');
  assert.match(actions, /'La copie est privée : ni les personnes avec qui la liste est partagée, ni le lien public, ni les photos ne sont copiés\.'/);
  assert.match(actions, /text: 'Vous ne la verrez plus\. Le propriétaire pourra de nouveau la partager avec vous\.'/);
  // Les deux libellés du droit restent ceux-là
  assert.match(code('public/js/screens/list-form.js'), /\[\['modification', 'Peut modifier'\], \['lecture', 'Lecture seule'\]\]/);
});

test('serveur : messages et journal neutres, identifiants internes inchangés', () => {
  const lists = code('server/lists.js');
  assert.doesNotMatch(lists, /OpError\([^)]*invit/i);
  assert.match(lists, /'Liste des personnes invalide\.'/);
  assert.match(lists, /'Droits des personnes invalides\.'/);
  assert.match(lists, /'Droit donné à une personne avec qui la liste n\\'est pas partagée\.'/);
  // Journal : champ « personne » (plus « invite ») ; noms d'événements inchangés
  for (const event of ['liste_partage_ajoute', 'liste_partage_retire', 'liste_droit_change']) {
    assert.match(lists, new RegExp(`ctx\\.audit\\('${event}', \\{ utilisateur: user\\.username, liste: list\\.id, personne: nameOf\\(id\\)`), event);
  }
  assert.doesNotMatch(lists, /invite: nameOf/);
  // Droits internes inchangés
  assert.match(lists, /row\.member_access === 'modification'/);
});
