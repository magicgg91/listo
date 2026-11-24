// Notes, socle (étape 2) : écrans du téléphone et de l'ordinateur, vérifiés
// par lecture du code (comme les autres écrans) : liens sûrs, curseur,
// enregistrement automatique, tuile de l'Accueil, bandeau à cinq boutons,
// menu de gauche, service worker, textes en français et en anglais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';
import { matchRoute, pathFor } from '../public/js/router.js';
import { liveNotes } from '../public/js/notes.js';
import { HOME_TILES } from '../public/js/home-tiles.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('adresses des écrans des notes ; la corbeille et « nouvelle » ne sont jamais prises pour une note', () => {
  assert.deepEqual(matchRoute('#/notes'), { name: 'notes', params: {} });
  // Corbeille des notes : dans Réglages (23 novembre 2026) ; l'ancienne adresse y mène
  assert.deepEqual(matchRoute('#/reglages/corbeille-notes'), { name: 'noteTrash', params: {} });
  assert.deepEqual(matchRoute('#/notes/corbeille'), { name: 'oldNoteTrash', params: {} });
  assert.deepEqual(matchRoute('#/notes/nouvelle'), { name: 'newNote', params: {} });
  assert.deepEqual(matchRoute('#/notes/abc'), { name: 'note', params: { id: 'abc' } });
  assert.equal(pathFor('note', { id: 'a b' }), '#/notes/a%20b');
});

test('texte d\'une note : textContent et éléments <a> seulement (http, https), nouvel onglet, jamais innerHTML', () => {
  const note = code('public/js/screens/note.js');
  for (const file of ['public/js/screens/note.js', 'public/js/screens/notes.js', 'public/js/screens/note-trash.js', 'public/js/notes.js']) {
    assert.doesNotMatch(code(file), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
  }
  assert.match(note, /replace\(view, linkParts\(body\)\.map\(\(part\) => \(part\.href\s*\? h\('a', \{ class: 'note-link', href: part\.href, target: '_blank', rel: 'noopener noreferrer' \}, part\.text\)\s*: part\.text\)\)\);/);
  // Un lien touché s'ouvre, sans passer en saisie
  assert.match(note, /if \(event\.target\.closest\('a'\)\) return;/);
});

test('curseur : jamais à l\'ouverture d\'une note existante ; seulement pour « Nouvelle note » ou un appui sur le texte', () => {
  const note = code('public/js/screens/note.js');
  // Une seule mise en saisie automatique : une nouvelle note
  assert.match(note, /if \(isNew\) queueMicrotask\(\(\) => edit\(0\)\);/);
  assert.equal((note.match(/\bedit\(/g) ?? []).length, 3, 'nouvelle note, appui sur le texte, Entrée');
  assert.equal((note.match(/\.focus\(/g) ?? []).length, 1);
  assert.match(note, /input\.focus\(\{ preventScroll: true \}\);\s*input\.setSelectionRange\(at, at\);/);
  // Nouvelle note depuis l'Accueil : directement l'écran d'une nouvelle note
  const notes = code('public/js/screens/notes.js');
  assert.match(notes, /export function openQuickNote\(\) \{\s*navigate\('newNote'\);\s*\}/);
  assert.equal((notes.match(/\.focus\(/g) ?? []).length, 0);
});

test('enregistrement automatique : une seconde après la dernière frappe, en quittant, en arrière-plan ; jamais une page vide', () => {
  const note = code('public/js/screens/note.js');
  assert.match(note, /const SAVE_DELAY_MS = 1000;/);
  assert.match(note, /timer = setTimeout\(save, SAVE_DELAY_MS\);/);
  assert.match(note, /if \(document\.visibilityState === 'hidden'\) saveNow\(\);/);
  assert.match(note, /window\.addEventListener\('pagehide', saveNow\);/);
  assert.match(note, /onLeave\(\(\) => \{[\s\S]*?saveNow\(\);\s*\}\);/);
  assert.match(note, /if \(!title\.trim\(\) && !text\.trim\(\)\) return;/);
  // La version sur laquelle le texte a été écrit part avec lui
  assert.match(note, /actions\.saveNote\(noteId, \{ title, body: text, baseVersion: base \}\)/);
  // Mentions d'état : icône ET texte ; « À vérifier » en premier
  for (const key of ['notes.statut.enCours', 'notes.statut.enregistre']) assert.ok(note.includes(`t('${key}')`), key);
  // « ce téléphone » sur le téléphone, « cet appareil » sur ordinateur (jamais « téléphone » sur un ordinateur)
  for (const key of ['notes.statut.aVerifier', 'notes.statut.horsLigne']) assert.ok(note.includes(`t(pc ? '${key}.pc' : '${key}')`), key);
  assert.equal(fr['notes.statut.horsLigne'], 'Hors ligne · enregistrée sur ce téléphone');
  assert.equal(en['notes.statut.horsLigne'], 'Offline · saved on this phone');
  assert.equal(fr['notes.statut.horsLigne.pc'], 'Hors ligne · enregistrée sur cet appareil');
  assert.equal(en['notes.statut.horsLigne.pc'], 'Offline · saved on this device');
  assert.match(fr['notes.statut.aVerifier.pc'], /cet appareil$/);
  assert.match(en['notes.statut.aVerifier.pc'], /this device$/);
});

test('conflit : rien n\'est écrasé, mon texte reste sur l\'appareil ; les trois choix et « Décider plus tard »', () => {
  const actions = code('public/js/actions.js');
  assert.match(actions, /if \(kept \|\| note\.version !== baseVersion\) \{\s*app\.data\.noteConflicts\.set\(noteId, \{ \.\.\.\(kept \?\? \{\}\), title, body, at: now\(\) \}\);/);
  // Enregistrement qui suit un autre encore en file : remplacé tant qu'il n'est pas parti, sinon chaîné (afterOp)
  assert.match(actions, /previous && !isQueuedSending\(previous\.seq\) && await replaceQueuedOp\(previous\.seq, \{ \.\.\.previous\.op, title, body \}\)/);
  assert.match(actions, /\.\.\.\(previous \? \{ afterOp: previous\.op\.id \} : \{\}\)/);
  // « Garder les deux » : épinglée comme l'originale
  assert.match(actions, /pinned: app\.data\.pinnedNotes\.has\(noteId\)/);
  const app = code('public/js/app.js');
  assert.match(app, /const NOTE_CONFLICT = 'ops\.noteConflit';/);
  const note = code('public/js/screens/note.js');
  for (const key of ['notes.conflit.mienne', 'notes.conflit.leur', 'notes.conflit.deux', 'notes.conflit.plusTard', 'notes.conflit.leur.question']) assert.ok(note.includes(`t('${key}')`), key);
  // « Prendre la leur » demande confirmation
  assert.match(note, /const ok = await confirmDialog\(\{\s*title: t\('notes\.conflit\.leur\.question'\)/);
  assert.equal(fr['notes.conflit.mienne'], 'Garder la mienne');
  assert.equal(fr['notes.conflit.leur'], 'Prendre la leur');
  assert.equal(fr['notes.conflit.deux'], 'Garder les deux');
  assert.equal(fr['notes.conflit.plusTard'], 'Décider plus tard');
});

test('Accueil : tuile Notes entre Listes et Compte (nombre, dernières notes, « Nouvelle note ») ; nombres hors corbeille', () => {
  const home = code('public/js/screens/home.js');
  // Ordre de départ : Notes entre « À offrir » (seulement si j'ai des
  // réservations) et Compte ; chacun peut le changer (Réglages › Accueil)
  assert.deepEqual(HOME_TILES, ['deadlines', 'lists', 'gifts', 'notes', 'account']);
  assert.match(home, /notes: \(\) => notesTile\(pc\)/);
  assert.match(home, /\.slice\(0, pc \? 4 : 2\)/);
  assert.match(home, /const add = addRow\(t\('accueil\.notes\.nouvelle'\), \(\) => openQuickNote\(\)\);/);
  assert.match(home, /emptyText\(t\('accueil\.notes\.aucune'\)\)/);
  // Nombre : pastille grise au bout du titre (plus de ligne « 12 notes » dessous), aucune sans note
  assert.match(home, /count \? h\('span', \{ class: 'count', 'aria-hidden': 'true' \}, String\(count\)\) : null/);
  assert.match(home, /\{ spoken: t\('accueil\.notes\.lu', \{ count: notes\.length \}\), count: notes\.length \}/);
  assert.doesNotMatch(home, /tile__meta/);
  assert.doesNotMatch(read('public/css/listo.css'), /tile__meta/);
  assert.equal(translate('fr', 'accueil.notes.lu', { count: 1 }), 'Notes, 1 note');
  assert.equal(translate('en', 'accueil.notes.lu', { count: 2 }), 'Notes, 2 notes');
  // Le nombre compte les notes hors corbeille (même calcul que l'écran Notes et le menu de gauche)
  assert.equal(liveNotes([{ id: 'a' }, { id: 'b', deletedAt: 'x' }]).length, 1);
  assert.match(code('public/js/screens/notes.js'), /return sortNotes\(liveNotes\(\[\.\.\.app\.data\.notes\.values\(\)\]\)/);
  assert.match(code('public/js/screens/pc-side.js'), /const countNotes = \(\) => liveNotes\(\[\.\.\.app\.data\.notes\.values\(\)\]\)\.length;/);
});

test('ordinateur : « Notes » dans les entrées fixes, « Nouvelle note » (N) en bas sur les écrans des notes, note ouverte à droite', () => {
  const side = code('public/js/screens/pc-side.js');
  assert.match(side, /const notesLink = fixedLink\('notes', 'note', t\('navigation\.notes'\), notesNews, notesCount\);/);
  assert.match(side, /export const NOTE_SCREENS = \['notes', 'note', 'newNote'\];/);
  assert.match(side, /newList\.hidden = NOTE_SCREENS\.includes\(selected\.name\);\s*newNote\.hidden = !newList\.hidden;/);
  const app = code('public/js/app.js');
  assert.match(app, /if \(isDesktop\(\)\) mount\(\(onLeave\) => renderNotes\(onLeave, \{ openId: id \?\? 'new' \}\)\);/);
  const shortcuts = code('public/js/shortcuts.js');
  assert.match(shortcuts, /location\.hash\.startsWith\('#\/notes'\) \? navigate\('newNote'/);
  // Pas de catégories (abandonnées le 23 novembre 2026)
  for (const file of ['public/js/screens/notes.js', 'public/js/screens/note.js', 'public/js/screens/pc-side.js', 'public/js/store.js', 'server/notes.js']) {
    assert.doesNotMatch(code(file), /categor|catbar|cat-chip/i, file);
  }
});

test('service worker : nouveaux fichiers gardés hors ligne ; icônes ajoutées au sprite (application et kit)', () => {
  const sw = read('public/sw.js');
  for (const file of ['/js/notes.js', '/js/screens/notes.js', '/js/screens/note.js', '/js/screens/note-trash.js', '/js/i18n/fr/notes.js', '/js/i18n/en/notes.js']) {
    assert.ok(sw.includes(`'${file}'`), file);
  }
  for (const sprite of ['public/index.html', 'design/icons-sprite.html']) {
    for (const name of ['i-note', 'i-pin', 'i-pin-off']) assert.ok(read(sprite).includes(`<symbol id="${name}"`), `${sprite} ${name}`);
  }
  // Kit : nouvelles sections identiques dans design/ et public/
  const kit = read('public/css/listo.css');
  const sections = kit.slice(kit.indexOf('/* 16.22 Pastille'));
  assert.ok(sections.length > 3000);
  assert.ok(read('design/listo.css').includes(sections.trim()));
  assert.doesNotMatch(sections, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.match(sections, /\.tabbar--5 \.tabbar__pill \{ width: calc\(\(100% - 10px\) \/ 5\); \}/);
});

test('textes : français et anglais, noms des écrans des notes', () => {
  assert.equal(fr['notes.titre'], 'Notes');
  assert.equal(en['notes.nouvelle'], 'New note');
  assert.equal(en['notes.corbeille.titre'], 'Notes trash');
  assert.equal(en['notes.statut.enregistre'], 'Saved');
  assert.equal(en['notes.statut.enCours'], 'Saving…');
  assert.equal(fr['notes.sansTitre'], 'Note sans titre');
  for (const key of Object.keys(fr).filter((k) => k.startsWith('notes.'))) assert.ok(key in en, `en : ${key}`);
});

test('note introuvable ou supprimée : aucune mention « Enregistré » au-dessus de « Note introuvable »', () => {
  const note = read('public/js/screens/note.js');
  assert.match(note, /\} else if \(noteId && note\(\) && !note\(\)\.deletedAt\) state = \['sync--ok', 'check', t\('notes\.statut\.enregistre'\), t\('notes\.statut\.enregistre'\)\];/);
});
