// Langues, étape 2 (20 novembre 2026) : les textes affichés sortent du code
// et vont dans public/js/i18n/fr/<partie>.js, lus par t('nom').
//
// - Un fichier déjà traité (MIGRATED) ne contient plus de texte en dur :
//   ses chaînes de caractères sont des noms de classes, d'icônes, de textes,
//   des adresses… jamais une phrase ou un mot affiché (voir looksLikeText).
// - Chaque nom utilisé par t() ou translate() existe en français ; chaque
//   nom du français est utilisé quelque part (pas de texte oublié) ; jamais
//   de nom calculé (t(`…${x}`)), pour que ces deux vérifications restent sûres.
// - Les parties : noms préfixés par leur partie, aucun nom en double, mêmes
//   parties en anglais, chaque fichier gardé par le service worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr, { PARTS as FR_PARTS } from '../public/js/i18n/fr.js';
import en, { PARTS as EN_PARTS } from '../public/js/i18n/en.js';
import { stringsOf, looksLikeText } from './i18n-scan.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Fichiers dont les textes sont sortis (la liste grandit à chaque lot)
const MIGRATED = [
  'public/js/screens/account.js',
  'public/js/screens/admin.js',
  'public/js/screens/login.js',
  'public/js/screens/notifications.js',
  'public/js/screens/settings.js',
  // Lot 2 : listes et formulaires
  'public/js/screens/list.js',
  'public/js/screens/list-form.js',
  'public/js/screens/list-actions.js',
  'public/js/screens/lists.js',
  'public/js/tabbar.js',
  'public/js/screens/pc-side.js',
  // Accueil et navigation (23 novembre 2026)
  'public/js/screens/home.js',
  'public/js/screens/scan.js',
  'public/js/shortcuts.js',
  'public/js/list-icons.js',
  'public/js/undo.js',
  'public/js/create-reference.js',
  'public/js/bulk-add.js',
  'public/js/search-row.js',
  // Lot 3 : partage, envies, échéances, corbeille, Claude, page publique, modules communs du téléphone
  'public/js/screens/share.js',
  'public/js/screens/share-panel.js',
  'public/js/screens/share-picker.js',
  'public/js/sharing.js',
  'public/js/screens/trash.js',
  'public/js/screens/trash-parts.js',
  'public/js/screens/note-trash.js',
  // Corbeille unique (24 novembre 2026) : la page et ses onglets
  'public/js/screens/trash-page.js',
  'public/js/trash-tabs.js',
  'public/js/screens/deadlines.js',
  'public/js/deadlines.js',
  'public/js/screens/claude-connections.js',
  'public/js/screens/claude-consent.js',
  'public/js/screens/help.js',
  'public/js/public.js',
  'public/js/format.js',
  'public/js/words.js',
  'public/js/app.js',
  'public/js/ui.js',
  'public/js/dom.js',
  'public/js/api.js',
  'public/js/queue.js',
  'public/js/localdb.js',
  'public/js/push.js',
  'public/js/photo.js',
  'public/js/barcode.js',
  'public/js/store.js',
  'public/js/search.js',
  'public/js/freshness.js',
  'public/js/router.js',
  'public/js/trusted.js',
  // Lot 4 : règles communes au téléphone et au serveur
  'public/js/subtasks.js',
  'public/js/assign.js',
  'public/js/wishes.js',
  'public/js/list-types.js',
  'public/js/history.js',
  'public/js/sorting.js',
  'public/js/repeat.js',
  'public/js/due-time.js',
  'public/js/quantity.js',
  'public/js/aisles.js',
  'public/js/tidy-aisles.js',
];

test('lecture des chaînes et repérage du texte : exemples', () => {
  const sample = "// commentaire 'Bonjour'\nconst a = h('p', { class: 'row row--menu', 'aria-label': t('compte.titre') }, `Bonjour ${name}, à ${t('x.y')}`); /* 'Caché' */ const r = /'/; const b = \"Réessayer\";";
  assert.deepEqual(stringsOf(sample), ['p', 'row row--menu', 'aria-label', 'compte.titre', 'Bonjour ', ', à ', 'x.y', '', 'Réessayer']);
  const texts = stringsOf(sample).filter(looksLikeText);
  assert.deepEqual(texts, ['Bonjour ', ', à ', 'Réessayer']);
  // Message technique, jamais affiché : marqué, il n'est pas lu
  assert.deepEqual(stringsOf("console.warn('Base locale bloquée'); // technique : console\nconst b = 'Réessayer';"), ['Réessayer']);
  for (const value of ['btn btn--primary btn--block', 'aria-checked', '/api/me/locale', 'Escape', 'compte.langue.titre', 'icon--sm', '#/reglages', 'true']) assert.ok(!looksLikeText(value), value);
  for (const value of ['Annuler', 'Mot de passe', 'Admin', 'Se connecter', 'à jour', ' · par ']) assert.ok(looksLikeText(value), value);
});

test('fichiers traités : aucun texte affiché écrit en dur (tout passe par t())', () => {
  for (const file of MIGRATED) {
    const texts = stringsOf(read(file)).filter(looksLikeText);
    assert.deepEqual(texts, [], `${file} : texte en dur`);
    assert.ok(!/\bt\(`/.test(read(file)), `${file} : nom de texte calculé`);
  }
});

// Code de l'interface et du serveur (hors dictionnaires)
function sources() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['vendor', 'i18n'].includes(e.name)) walk(rel); } else if (rel.endsWith('.js')) files.push(rel);
    }
  };
  walk('public/js');
  walk('server');
  return files;
}

test('noms des textes : chaque nom utilisé existe en français, chaque nom du français est utilisé, jamais de nom calculé', () => {
  // Code sans les lignes de commentaire (« t('nom') » peut y être cité)
  const code = sources().map((file) => [file, read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')]);
  const used = new Set();
  for (const [file, text] of code) {
    for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/\btranslate\(\s*[^,]+,\s*'([^']+)'/g)) used.add(m[1]);
    assert.ok(!/\bt\(\s*`/.test(text), `${file} : t() avec un nom calculé`);
  }
  for (const key of used) assert.ok(key in fr, `nom inconnu : ${key}`);
  const all = code.map(([, text]) => text).join('\n');
  for (const key of Object.keys(fr)) assert.ok(all.includes(`'${key}'`), `texte jamais utilisé : ${key}`);
});

test('parties : noms préfixés par leur partie, aucun en double, mêmes parties en anglais, fichiers gardés hors ligne', () => {
  let total = 0;
  for (const [part, texts] of Object.entries(FR_PARTS)) {
    for (const key of Object.keys(texts)) assert.ok(key.startsWith(`${part}.`), `${key} hors de sa partie ${part}`);
    assert.ok(/^[a-z]+$/.test(part), part);
    total += Object.keys(texts).length;
  }
  assert.equal(Object.keys(fr).length, total, 'aucun nom en double');
  assert.deepEqual(Object.keys(EN_PARTS).sort(), Object.keys(FR_PARTS).sort(), 'mêmes parties en anglais');
  for (const [part, texts] of Object.entries(EN_PARTS)) {
    for (const key of Object.keys(texts)) assert.ok(key in FR_PARTS[part], `en ${key} : absent du français`);
  }
  assert.ok(Object.keys(en).every((key) => key in fr));
  const sw = read('public/sw.js');
  for (const part of Object.keys(FR_PARTS)) {
    for (const locale of ['fr', 'en']) assert.ok(sw.includes(`'/js/i18n/${locale}/${part}.js'`), `${locale}/${part}.js absent d'APP_FILES`);
  }
  const files = fs.readdirSync(path.join(ROOT, 'public/js/i18n/fr')).map((f) => f.replace(/\.js$/, ''));
  assert.deepEqual(files.sort(), Object.keys(FR_PARTS).sort(), 'chaque fichier de fr/ est une partie déclarée');
});
