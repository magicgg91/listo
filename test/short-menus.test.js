// Menus plus courts et « Tout replier » en icône (décisions du propriétaire
// du 24 novembre 2026).
// - Menu d'une liste (⋮ de la liste ouverte et ⋯ d'une carte de « Listes »,
//   list-actions.js) et menu d'une note : libellés courts, en français et en
//   anglais ; chaque menu porte le nom de sa liste ou de sa note, lu par les
//   lecteurs d'écran ; écrans, feuilles, confirmations et messages gardent
//   leur nom complet.
// - « Tout replier / Tout déplier » : le chevron seul, sans texte écrit, son
//   nom dans aria-label et title, zone tactile de --tap-min.
// - L'aide, le guide, le site et les documents ne citent plus les anciens
//   libellés longs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { helpFor, blockTexts } from '../public/js/help-content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SHORT = {
  'menu.modifier': ['Modifier', 'Edit'],
  'menu.dupliquer': ['Dupliquer', 'Duplicate'],
  'menu.supprimer': ['Supprimer', 'Delete'],
  'menu.quitter': ['Quitter', 'Leave'],
  'menu.nouveautes.masquer': ['Masquer les nouveautés', "Hide what's new"],
  'menu.nouveautes.afficher': ['Afficher les nouveautés', "Show what's new"],
  'menu.notifications.couper': ['Couper les notifications', 'Turn off notifications'],
  'menu.notifications.reactiver': ['Réactiver les notifications', 'Turn notifications back on'],
  'notes.menu.supprimer': ['Supprimer', 'Delete'],
  'notes.menu.quitter': ['Quitter', 'Leave'],
  'notes.menu.nouveautes.masquer': ['Masquer les nouveautés', "Hide what's new"],
  'notes.menu.nouveautes.afficher': ['Afficher les nouveautés', "Show what's new"],
  'notes.menu.notifications.couper': ['Couper les notifications', 'Turn off notifications'],
  'notes.menu.notifications.reactiver': ['Réactiver les notifications', 'Turn notifications back on'],
};

// Anciens libellés longs des menus (français, anglais)
const OLD_FR = [
  'Masquer les nouveautés de cette liste', 'Afficher les nouveautés de cette liste',
  'Couper les notifications de cette liste', 'Réactiver les notifications de cette liste',
  'Masquer les nouveautés de cette note', 'Afficher les nouveautés de cette note',
  'Couper les notifications de cette note', 'Réactiver les notifications de cette note',
];
const OLD_EN = [
  "Hide what's new in this list", "Show what's new in this list", 'Turn off notifications for this list', 'Turn notifications back on for this list',
  "Hide what's new in this note", "Show what's new in this note", 'Turn off notifications for this note', 'Turn notifications back on for this note',
];

test('menus d\'une liste et d\'une note : libellés courts, en français et en anglais', () => {
  for (const [key, [french, english]] of Object.entries(SHORT)) {
    assert.equal(fr[key], french, key);
    assert.equal(en[key], english, key);
  }
  // Un seul jeu d'actions pour les deux menus d'une liste, et ces noms-là
  const actions = read('public/js/screens/list-actions.js');
  for (const key of Object.keys(SHORT).filter((k) => k.startsWith('menu.'))) {
    assert.ok(actions.includes(`label: t('${key}')`), key);
  }
  const notes = read('public/js/screens/notes.js');
  for (const key of Object.keys(SHORT).filter((k) => k.startsWith('notes.'))) {
    assert.ok(notes.includes(`t('${key}')`), key);
  }
});

test('écrans, feuilles, confirmations et messages gardent leur nom complet', () => {
  assert.equal(fr['formulaire.titre.modifier'], 'Modifier la liste');
  assert.equal(en['formulaire.titre.modifier'], 'Edit list');
  assert.equal(fr['formulaire.supprimer'], 'Supprimer la liste');
  assert.equal(en['formulaire.supprimer'], 'Delete list');
  // Feuille « Dupliquer la liste » : son propre nom, plus celui du menu
  assert.equal(fr['menu.dupliquer.feuille'], 'Dupliquer la liste');
  assert.equal(en['menu.dupliquer.feuille'], 'Duplicate list');
  assert.match(read('public/js/screens/list-actions.js'), /openSheet\(\{ title: t\('menu\.dupliquer\.feuille'\), content: form \}\)/);
  assert.equal(fr['menu.supprimer.question'], 'Supprimer la liste « {name} » ?');
  assert.equal(fr['menu.quitter.question'], 'Quitter la liste « {name} » ?');
  assert.equal(fr['notes.quitter.question'], 'Quitter la note « {name} » ?');
  assert.equal(fr['menu.nouveautes.masquees'], 'Les nouveautés de cette liste sont masquées');
  assert.equal(fr['menu.notifications.coupees'], 'Les notifications de cette liste sont coupées');
  assert.equal(fr['notes.nouveautes.masquees'], 'Les nouveautés de cette note sont masquées');
  assert.equal(fr['notes.notifications.coupees'], 'Les notifications de cette note sont coupées');
  // Messages d'erreur du serveur : inchangés
  assert.equal(fr['ops.reglageSourdineInvalide'], 'Réglage « Masquer les nouveautés de cette liste » invalide.');
});

test('chaque menu porte le nom de sa liste ou de sa note (lecteurs d\'écran)', () => {
  // Liste ouverte : le même nom que le menu de sa carte
  const list = read('public/js/screens/list.js');
  assert.match(list, /if \(items\.length\) openMenu\(items, \{ label: t\('listes\.carte\.actions', \{ name: view\.list\.name \}\) \}\);/);
  assert.match(read('public/js/screens/lists.js'), /openMenu\(actions, \{ label: t\('listes\.carte\.actions', \{ name: list\.name \}\),/);
  assert.equal(fr['listes.carte.actions'], 'Actions de la liste {name}');
  assert.equal(en['listes.carte.actions'], 'Actions for the list {name}');
  // Note ouverte : le même nom que le menu de sa carte
  const note = read('public/js/screens/note.js');
  assert.match(note, /openMenu\(noteMenuItems\(n, \{ onDeleted: afterDelete, withPin: !pc, withPeople: false \}\), \{ label: t\('notes\.carte\.actions', \{ name: titleOf\(n\) \}\), anchor: menuButton \}\);/);
  assert.match(read('public/js/screens/notes.js'), /const label = t\('notes\.carte\.actions', \{ name: title \}\);/);
});

test('« Tout replier / Tout déplier » : le chevron seul, nommé par aria-label et title, zone tactile de --tap-min', () => {
  const list = read('public/js/screens/list.js');
  const draw = list.slice(list.indexOf('function drawFoldAll()'), list.indexOf('// En-tête de groupe repliable'));
  assert.match(draw, /const label = anyOpen \? t\('liste\.toutReplier'\) : t\('liste\.toutDeplier'\);/);
  assert.match(draw, /foldAll\.setAttribute\('aria-label', label\);/);
  assert.match(draw, /foldAll\.title = label;/);
  // Aucun texte écrit dans le bouton : l'icône seule
  assert.match(draw, /replace\(foldAll, icon\('chev-d', 'icon--sm'\)\);/);
  assert.doesNotMatch(draw, /replace\(foldAll,[^\n]*t\(/);
  assert.equal(fr['liste.toutReplier'], 'Tout replier');
  assert.equal(en['liste.toutReplier'], 'Collapse all');
  assert.equal(en['liste.toutDeplier'], 'Expand all');
  // Kit et application identiques : bouton carré de --tap-min, sans taille de texte
  for (const file of ['design/listo.css', 'public/css/listo.css']) {
    const rule = read(file).match(/^\.fold-all \{[^}]*\}/m)[0];
    assert.match(rule, /width: var\(--tap-min\); height: var\(--tap-min\);/, file);
    assert.match(rule, /margin-left: auto;/, file);
    assert.doesNotMatch(rule, /font-size|gap/, file);
  }
  // Maquette du kit : même balisage (aria-label et title, aucun texte)
  const kit = read('design/components.html');
  const buttons = kit.match(/<button class="fold-all[^"]*"[^>]*>.*?<\/button>/g);
  assert.ok(buttons.length >= 2);
  for (const button of buttons) {
    assert.match(button, /aria-label="Tout replier" title="Tout replier"/);
    assert.equal(button.replace(/<[^>]*>/g, ''), '');
  }
});

test('aide, guide, site et documents : plus les anciens libellés longs des menus', () => {
  const texts = (locale) => {
    const help = helpFor(locale);
    return [...Object.values(help.DOC), ...help.GUIDE.flatMap((c) => [c.title, ...(c.blocks ?? []).flatMap(blockTexts),
      ...(c.sections ?? []).flatMap((s) => [s.title, ...(s.blocks ?? []).flatMap(blockTexts)])])].join('\n');
  };
  const frHelp = texts('fr');
  const enHelp = texts('en');
  for (const old of OLD_FR) assert.ok(!frHelp.includes(old), `aide : ${old}`);
  for (const old of OLD_EN) assert.ok(!enHelp.includes(old), `help: ${old}`);
  // Anciens libellés des actions « Modifier », « Dupliquer », « Supprimer », « Quitter » cités comme lignes du menu
  assert.doesNotMatch(frHelp, /« (Dupliquer la liste|Quitter la liste|Quitter la note) »/);
  assert.doesNotMatch(frHelp, /Menu ⋮ de la liste, « Modifier la liste »|« Supprimer la liste » \(menu ⋮\)/);
  assert.doesNotMatch(enHelp, /“(Duplicate list|Leave list|Leave note|Delete list)”/);
  assert.doesNotMatch(enHelp, /⋮ menu, “Edit list”/);
  // Copies du guide et documents tenus à jour
  for (const file of ['docs/guide.md', 'site/fr/index.html', 'README.md', 'README.fr.md', 'docs/cahier-des-charges.md'].filter((f) => fs.existsSync(path.join(ROOT, f)))) {
    const text = read(file);
    for (const old of OLD_FR) assert.ok(!text.includes(old) || file === 'docs/cahier-des-charges.md' && !text.includes(`« ${old} »`), `${file} : ${old}`);
  }
  for (const file of ['docs/guide.en.md', 'site/index.html', 'README.md'].filter((f) => fs.existsSync(path.join(ROOT, f)))) {
    const text = read(file);
    for (const old of OLD_EN) assert.ok(!text.includes(old), `${file} : ${old}`);
  }
  // Réglages › Notifications : la phrase cite les nouveaux libellés
  assert.equal(fr['notifications.parListe.note'], 'Pour une seule liste : menu ⋮ de la liste, « Masquer les nouveautés » ou « Couper les notifications ».');
  assert.equal(en['notifications.parListe.note'], 'For a single list: the list\'s ⋮ menu, “Hide what\'s new” or “Turn off notifications”.');
});
