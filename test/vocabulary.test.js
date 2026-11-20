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
import fr from '../public/js/i18n/fr.js';

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
  assert.match(actions, /t\('menu\.dupliquer\.prive'\)/);
  assert.equal(fr['menu.dupliquer.prive'], 'La copie est privée : ni les personnes avec qui la liste est partagée, ni le lien public, ni les photos ne sont copiés.');
  assert.match(actions, /text: t\('menu\.quitter\.texte'\)/);
  assert.equal(fr['menu.quitter.texte'], 'Vous ne la verrez plus. Le propriétaire pourra de nouveau la partager avec vous.');
  // Les deux libellés courts du droit dans la fenêtre « Partager avec »
  assert.match(code('public/js/screens/list-form.js'), /\[\['modification', t\('formulaire\.droit\.modifier'\)\], \['lecture', t\('formulaire\.droit\.lire'\)\]\]/);
  assert.equal(fr['formulaire.droit.modifier'], 'Modifier');
  assert.equal(fr['formulaire.droit.lire'], 'Lire');
});

test('serveur : messages et journal neutres, identifiants internes inchangés', () => {
  const lists = code('server/lists.js');
  assert.doesNotMatch(lists, /OpError\([^)]*invit/i);
  // Textes des refus : public/js/i18n/fr/ops.js (noms dans server/lists.js)
  assert.ok(Object.entries(fr).filter(([key]) => key.startsWith('ops.')).every(([, text]) => !/invit/i.test(text)));
  assert.match(lists, /'ops\.listePersonnesInvalide'/);
  assert.match(lists, /'ops\.droitsPersonnesInvalides'/);
  assert.match(lists, /'ops\.droitSansPartage'/);
  assert.equal(fr['ops.listePersonnesInvalide'], 'Liste des personnes invalide.');
  assert.equal(fr['ops.droitsPersonnesInvalides'], 'Droits des personnes invalides.');
  assert.equal(fr['ops.droitSansPartage'], 'Droit donné à une personne avec qui la liste n\'est pas partagée.');
  // Journal (toujours en anglais) : champ « member » (plus « invite »)
  for (const event of ['list_member_added', 'list_member_removed', 'list_access_changed']) {
    assert.match(lists, new RegExp(`ctx\\.audit\\('${event}', \\{ user: user\\.username, list: list\\.id, member: nameOf\\(id\\)`), event);
  }
  assert.doesNotMatch(lists, /invite: nameOf/);
  // Droits internes inchangés
  assert.match(lists, /row\.member_access === 'modification'/);
});
