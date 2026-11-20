// Exactitude du guide : chaque libellé cité entre « » dans
// public/js/help-content.js existe tel quel dans l'interface (code des
// écrans, ou message envoyé par le serveur et affiché à l'écran). Une
// évolution qui renomme un bouton fait échouer ce test tant que le guide
// n'est pas à jour. Les exemples (phrases à dire à Claude, noms inventés,
// textes d'un autre logiciel) s'écrivent entre “ ” et ne sont pas vérifiés.
//
// Guide en anglais (public/js/help-content-en.js, chapitres de
// public/js/help-en/) : jamais de « » ; chaque libellé cité entre “ ” existe
// dans les textes anglais de l'interface (public/js/i18n/en/), un {nom} d'un
// texte valant n'importe quoi ; les exemples prennent ‘ ’.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GUIDE, PERMISSIONS, PERMISSIONS_NOTE, SERVER_NOTE, DOC, blockTexts, helpFor } from '../public/js/help-content.js';
import en from '../public/js/i18n/en.js';
import { LOCALE_NAMES } from '../public/js/i18n.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Fichiers du guide lui-même (français et anglais) : jamais pris pour l'interface
const guideFile = (rel) => /(^|\/)help-content(-en)?\.js$|(^|\/)help-en\//.test(rel);

// Le code de l'interface et du serveur, apostrophes échappées (\') remises
function sources() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(rel); } else if (rel.endsWith('.js') && !guideFile(rel)) files.push(read(rel));
    }
  };
  walk('public/js');
  walk('server');
  return files.join('\n').replace(/\\'/g, '\'');
}

// Tous les textes du guide d'une langue, y compris ceux de ses copies
// (DOC : docs/guide*.md et site/), mention du serveur remise à sa place
const guideTexts = (locale = 'fr') => {
  const help = helpFor(locale);
  const doc = Object.values(help.DOC).map((text) => text.replace(/\{server\}/g, help.SERVER_NOTE));
  return [
    help.PERMISSIONS_NOTE, help.SERVER_NOTE, ...help.PERMISSIONS.map((p) => p.action), ...help.ROLES.map((r) => r.label), ...doc,
    ...help.GUIDE.flatMap((c) => [c.title, ...(c.blocks ?? []).flatMap(blockTexts),
      ...(c.sections ?? []).flatMap((s) => [s.title, ...(s.blocks ?? []).flatMap(blockTexts)])]),
  ].join('\n');
};

test('libellés cités dans le guide : tous présents dans l\'interface', () => {
  const interfaceText = sources();
  const helpText = guideTexts();
  for (const label of ['Dupliquer la liste', 'Quitter la liste', 'Partager par lien', 'Modifier la liste', 'Lecture seule', 'Peut modifier', 'Lecture et écriture', 'Connexions Claude', 'Copier l\'adresse', 'Code de démarrage', 'Ajouter un compte']) {
    assert.ok(helpText.includes(`« ${label} »`), `guide : « ${label} »`);
    assert.ok(interfaceText.includes(label), `interface : « ${label} »`);
  }
  // Toute citation « … » du guide existe dans le code de l'interface ou du serveur
  const quotes = [...new Set([...helpText.matchAll(/« ([^»]+) »/g)].map((m) => m[1]))];
  assert.ok(quotes.length > 100, `${quotes.length} libellés cités`);
  // (la mention du serveur, citée par l'introduction des copies du guide,
  // est un texte du guide lui-même)
  const missing = quotes.filter((quote) => quote !== SERVER_NOTE && !interfaceText.includes(quote));
  assert.deepEqual(missing, [], 'libellés absents de l\'interface');
  assert.ok(DOC.intro.includes('« {server} »'));
});

// --- Guide en anglais ---

// Libellés cités en anglais sans être un texte de l'interface, à garder
// court : le nom par défaut du bouton du fournisseur d'identité
// (LISTO_OIDC_NAME, réglé sur le serveur), des compteurs fabriqués par
// l'écran à partir d'un modèle (sous-tâches faites, “1/3”, “X/Y” ; plus de
// 30 nouveautés, “30+”) et des exemples de pastilles assemblées par l'écran
// (date et heure d'une échéance : formatDate et formatTime ; personnes
// attribuées : formatList et “{name} +{more}”)
const EN_ALLOWED = ['SSO', 'X/Y', '1/3', '30+', 'Today · 6:30 PM', 'Tomorrow · 9:00 AM', 'Me, Léa', 'Léa +2'];

// Textes anglais de l'interface ; un {nom} vaut n'importe quel texte
const enValues = Object.values(en).flatMap((value) => (typeof value === 'object' ? Object.values(value) : [value]));
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// (seulement les textes qui ont au moins une lettre hors emplacements : “{name}” seul ne prouve rien)
const enPatterns = enValues.filter((value) => /\p{L}/u.test(value.replace(/\{\w+\}/g, '')))
  .map((value) => new RegExp(`^${value.split(/\{\w+\}/).map(escapeRe).join('.+')}$`, 's'));
// Un libellé existe s'il est un morceau d'un texte (hors emplacements), ou
// un texte entier dont les emplacements sont remplis
const inEnglishInterface = (label) => enValues.some((value) => value.split(/\{\w+\}/).some((piece) => piece.includes(label)))
  || enPatterns.some((pattern) => pattern.test(label));

test('guide en anglais : jamais de « », chaque libellé “…” existe dans les textes anglais de l\'interface', () => {
  const helpText = guideTexts('en');
  assert.doesNotMatch(helpText, /[«»]/, 'pas de « » en anglais : “ ” pour un libellé, ‘ ’ pour un exemple');
  const quotes = [...new Set([...helpText.matchAll(/“([^”]+)”/g)].map((m) => m[1]))];
  assert.ok(quotes.length > 100, `${quotes.length} libellés cités`);
  const names = Object.values(LOCALE_NAMES);
  const missing = quotes.filter((quote) => quote !== helpFor('en').SERVER_NOTE && !names.includes(quote) && !EN_ALLOWED.includes(quote) && !inEnglishInterface(quote));
  assert.deepEqual(missing, [], 'libellés absents des textes anglais de l\'interface');
  // Le vérificateur repère bien un faux libellé, et accepte un texte à emplacement rempli
  assert.ok(!inEnglishInterface('Frobnicate zzqqxw'));
  assert.ok(inEnglishInterface(en['fenetres.fermer']));
  assert.equal(en['liste.reordonner.monter'], 'Move {name} up');
  assert.ok(inEnglishInterface('Move … up') && inEnglishInterface('Move Bread up'));
  // Chaque exception sert encore
  for (const label of EN_ALLOWED) assert.ok(quotes.includes(label), `exception inutile : ${label}`);
  // Guillemets bien appariés
  assert.equal((helpText.match(/“/g) ?? []).length, (helpText.match(/”/g) ?? []).length);
  assert.equal((helpText.match(/‘/g) ?? []).length, (helpText.match(/’/g) ?? []).length);
});

test('les exemples ne prennent jamais « » : “ ” (pas de faux libellé)', () => {
  const helpText = guideTexts();
  // Phrases à dire à Claude : toutes entre “ ”
  for (const sentence of ['Quelles sont mes listes Listo ?', 'Coche le pain et le beurre.']) {
    assert.ok(helpText.includes(`“${sentence}`), sentence);
    assert.ok(!helpText.includes(`« ${sentence}`), sentence);
  }
  // Guillemets bien appariés
  assert.equal((helpText.match(/«/g) ?? []).length, (helpText.match(/»/g) ?? []).length);
  assert.equal((helpText.match(/“/g) ?? []).length, (helpText.match(/”/g) ?? []).length);
});
