// Vocabulaire des personnes d'une liste (décision du 19 octobre 2026) :
// - propriétaire : la personne qui a créé la liste ;
// - contributeur : un compte avec le droit « Peut modifier » ;
// - invité : lecture seule (un compte « Lecture seule », ou le lien public) ;
// - « personne(s) » quand un texte vise les deux.
// Les libellés « Peut modifier » et « Lecture seule » ne changent pas, ni les
// identifiants internes (colonnes, routes, événements).
// Depuis le 25 novembre 2026 (docs/cadrage-comptes.md), « Invité » est aussi
// un RÔLE de compte (Admin, Utilisateur, Invité) : le mot n'apparaît que dans
// les textes de ce rôle (noms qui contiennent « invite » ou « .role. »), et
// jamais pour une personne d'une liste (droits « Modifier » et « Lire »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Code sans les commentaires de fin de ligne
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
// Noms de textes (« partage.droit.lire », « ops.invitePartageInterdit ») :
// retirés du code avant la recherche (le texte lui-même est vérifié dans
// public/js/i18n/fr/)
const withoutKeys = (text) => text.replace(/'[a-z]+(\.[A-Za-z0-9]+)+'/g, "''");
// Textes du rôle « Invité » : seuls endroits où le mot est permis
const ROLE_KEY = /[iI]nvite|\.role\./;
const jsFiles = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'vendor' ? [] : jsFiles(rel);
  return rel.endsWith('.js') ? [rel] : [];
});

test('interface : « invité » ne désigne jamais une personne qui peut modifier', () => {
  // (hors du guide, en français et en anglais : help-content.js, help-content-en.js, help-en/)
  for (const file of jsFiles('public/js').filter((f) => !/(^|\/)help-content(-en)?\.js$|(^|\/)help-en\/|(^|\/)i18n\//.test(f))) {
    const text = withoutKeys(code(file));
    // Aucun texte d'écran, de menu, de message ou d'aria-label ne dit « invité » :
    // il y est question de « personnes avec qui la liste est partagée »
    assert.doesNotMatch(text, /invit/i, file);
  }
  // Textes (français) : « invité » seulement pour le rôle du compte
  for (const [key, value] of Object.entries(fr)) {
    const texts = typeof value === 'string' ? [value] : Object.values(value);
    if (texts.some((text) => /invit/i.test(text))) assert.match(key, ROLE_KEY, key);
  }
  for (const key of ['partage.droit.modifier', 'partage.droit.lire', 'partage.vue.lectureSeule', 'partage.vue.peutModifier']) assert.doesNotMatch(fr[key], /invit/i, key);
  // Fenêtre de partage (lien public), menus et messages : les textes précis
  const actions = code('public/js/screens/list-actions.js');
  assert.match(actions, /t\('menu\.dupliquer\.prive'\)/);
  assert.equal(fr['menu.dupliquer.prive'], 'La copie est privée : ni les personnes avec qui la liste est partagée, ni le lien public, ni les photos ne sont copiés.');
  assert.match(actions, /text: t\('menu\.quitter\.texte'\)/);
  assert.equal(fr['menu.quitter.texte'], 'Vous ne la verrez plus. Le propriétaire pourra de nouveau la partager avec vous.');
  // Les deux libellés courts du droit dans la feuille « Partager avec des personnes »
  assert.match(code('public/js/screens/share-picker.js'), /\[\['modification', t\('partage\.droit\.modifier'\)\], \['lecture', t\('partage\.droit\.lire'\)\]\]/);
  assert.equal(fr['partage.droit.modifier'], 'Modifier');
  assert.equal(fr['partage.droit.lire'], 'Lire');
});

test('serveur : messages et journal neutres, identifiants internes inchangés', () => {
  const lists = code('server/lists.js');
  // Refus : seulement ceux du rôle « Invité » (ops.invitePartageInterdit,
  // ops.inviteDestinataire) disent « invité »
  assert.doesNotMatch(lists.replace(/'ops\.invite[A-Za-z]+'/g, "''"), /OpError\([^)]*invit/i);
  // Textes des refus : public/js/i18n/fr/ops.js (noms dans server/lists.js)
  assert.ok(Object.entries(fr).filter(([key]) => key.startsWith('ops.') && !key.startsWith('ops.invite')).every(([, text]) => !/invit/i.test(text)));
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
