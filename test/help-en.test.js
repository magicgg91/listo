// Guide en anglais (public/js/help-content-en.js, chapitres de
// public/js/help-en/) : exactement la structure du guide français
// (public/js/help-content.js), pour que les numéros, les ancres et les
// renvois soient les mêmes dans les deux langues. Les libellés cités sont
// vérifiés par test/help-labels.test.js ; l'écran « Aide » par
// test/help.test.js ; docs/guide.en.md et le site par test/guide.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as FR from '../public/js/help-content.js';
import * as EN from '../public/js/help-content-en.js';

const { helpFor, HELP_LOCALES, outline, numbered, refLabel, blockTexts, parseInline, searchGuide, plainText } = FR;
const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Sorte d'un bloc : 'text', 'ul', 'ol', 'code', 'table', 'note', 'sub', 'who'
const kind = (block) => (typeof block === 'string' ? 'text' : Object.keys(block).sort().join('+'));
// Renvois [[id]] d'un bloc, dans l'ordre
const refsOf = (block) => blockTexts(block).flatMap((text) => parseInline(text).filter((p) => p.ref !== undefined).map((p) => p.ref));
// Liens vers d'autres sites d'un bloc (adresses seulement)
const linksOf = (block) => blockTexts(block).flatMap((text) => parseInline(text).filter((p) => p.link !== undefined).map((p) => p.href.replace(/#.*$/, '')));

// Compare deux suites de blocs ; renvoie les différences
function compareBlocks(where, fr = [], en = []) {
  const problems = [];
  if (fr.length !== en.length) return [`${where} : ${fr.length} blocs en français, ${en.length} en anglais`];
  fr.forEach((a, i) => {
    const b = en[i];
    const at = `${where}, bloc ${i + 1}`;
    if (kind(a) !== kind(b)) problems.push(`${at} : ${kind(a)} / ${kind(b)}`);
    for (const list of ['ul', 'ol']) if (a[list] && a[list].length !== b[list]?.length) problems.push(`${at} : ${list} de ${a[list].length} / ${b[list]?.length}`);
    if (a.table) {
      if (a.table.head.length !== b.table?.head.length) problems.push(`${at} : en-tête du tableau`);
      if (a.table.rows.length !== b.table?.rows.length) problems.push(`${at} : lignes du tableau`);
      else a.table.rows.forEach((row, j) => { if (row.length !== b.table.rows[j].length) problems.push(`${at} : ligne ${j + 1} du tableau`); });
    }
    if (refsOf(a).join(',') !== refsOf(b).join(',')) problems.push(`${at} : renvois ${refsOf(a)} / ${refsOf(b)}`);
    if (linksOf(a).sort().join(',') !== linksOf(b).sort().join(',')) problems.push(`${at} : liens ${linksOf(a)} / ${linksOf(b)}`);
  });
  return problems;
}

test('helpFor : le guide de chaque langue, le français sinon ; aucun import circulaire', () => {
  assert.deepEqual(HELP_LOCALES, ['fr', 'en']);
  assert.equal(helpFor('fr').GUIDE, FR.GUIDE);
  assert.equal(helpFor('en').GUIDE, EN.GUIDE);
  assert.equal(helpFor('de').GUIDE, FR.GUIDE, 'langue inconnue : le français');
  for (const locale of HELP_LOCALES) {
    assert.deepEqual(Object.keys(helpFor(locale)).sort(), ['DOC', 'GUIDE', 'PERMISSIONS', 'PERMISSIONS_NOTE', 'ROLES', 'SERVER_NOTE']);
  }
  assert.equal(helpFor('en').SERVER_NOTE, 'For the person who runs the server');
  // Le guide anglais et ses chapitres n'importent jamais help-content.js
  const english = ['public/js/help-content-en.js', ...fs.readdirSync(path.join(ROOT, 'public/js/help-en')).map((f) => `public/js/help-en/${f}`)];
  for (const file of english) assert.doesNotMatch(read(file), /^import .*help-content\.js/m, file);
  // Les neuf chapitres, dans l'ordre, chacun dans son fichier
  const imports = [...read('public/js/help-content-en.js').matchAll(/^import (\w+) from '\.\/help-en\/(\w+)\.js';$/gm)].map((m) => m[2]);
  assert.deepEqual(imports, FR.GUIDE.map((c) => c.id));
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'public/js/help-en')).sort(), [...FR.GUIDE.map((c) => `${c.id}.js`), 'tableau.js'].sort());
});

test('guide anglais : exactement la structure du français (identifiants, serveur, blocs, listes, tableaux, renvois, liens)', () => {
  assert.deepEqual(EN.GUIDE.map((c) => c.id), FR.GUIDE.map((c) => c.id));
  const problems = [];
  FR.GUIDE.forEach((chapter, i) => {
    const english = EN.GUIDE[i];
    if (Boolean(chapter.server) !== Boolean(english.server)) problems.push(`${chapter.id} : server`);
    if (!english.title) problems.push(`${chapter.id} : sans titre`);
    problems.push(...compareBlocks(chapter.id, chapter.blocks, english.blocks));
    const ids = (c) => (c.sections ?? []).map((s) => s.id).join(',');
    if (ids(chapter) !== ids(english)) return problems.push(`${chapter.id} : sections ${ids(chapter)} / ${ids(english)}`);
    (chapter.sections ?? []).forEach((section, j) => {
      const other = english.sections[j];
      if (Boolean(section.server) !== Boolean(other.server)) problems.push(`${section.id} : server`);
      if (!other.title) problems.push(`${section.id} : sans titre`);
      problems.push(...compareBlocks(section.id, section.blocks, other.blocks));
    });
  });
  assert.deepEqual(problems, []);
  // Donc : mêmes numéros, mêmes ancres, mêmes parties du serveur
  const strip = (entries) => entries.map(({ title, ...rest }) => rest);
  assert.deepEqual(strip(outline(EN.GUIDE)), strip(outline(FR.GUIDE)));
  // Aucun numéro écrit à la main
  for (const e of outline(EN.GUIDE)) assert.doesNotMatch(e.title, /^\d/, e.title);
});

test('tableau « Qui peut quoi » anglais : mêmes rôles, mêmes actions, mêmes droits', () => {
  assert.deepEqual(EN.ROLES.map((r) => r.key), FR.ROLES.map((r) => r.key));
  assert.deepEqual(EN.PERMISSIONS.map((p) => p.roles), FR.PERMISSIONS.map((p) => p.roles));
  assert.deepEqual(EN.ROLES.map((r) => r.label), ['Owner', 'Contributor', 'Read only', 'Visitor', 'Admin']);
  assert.ok(EN.PERMISSIONS.every((p, i) => p.action && p.action !== FR.PERMISSIONS[i].action));
  assert.ok(EN.PERMISSIONS_NOTE && EN.PERMISSIONS_NOTE !== FR.PERMISSIONS_NOTE);
  // Textes des copies du guide (docs/guide*.md, site/) : mêmes noms, emplacements gardés
  assert.deepEqual(Object.keys(EN.DOC).sort(), Object.keys(FR.DOC).sort());
  for (const key of Object.keys(FR.DOC)) {
    const slots = (text) => [...text.matchAll(/\{\w+\}|\]\(([^)]+)\)/g)].map((m) => m[0]).filter((s) => !s.includes('guide.md'));
    assert.deepEqual(slots(EN.DOC[key]), slots(FR.DOC[key]), key);
  }
});

test('renvois et recherche : numéro et titre du guide de la même langue', () => {
  const en = helpFor('en');
  assert.equal(refLabel('sauvegardes', en.GUIDE), numbered(outline(en.GUIDE).find((e) => e.id === 'sauvegardes')));
  assert.match(refLabel('sauvegardes', en.GUIDE), /^3\.8 /);
  assert.notEqual(refLabel('sauvegardes', en.GUIDE), refLabel('sauvegardes'));
  assert.equal(plainText('See [[sauvegardes]].', en.GUIDE), `See ${refLabel('sauvegardes', en.GUIDE)}.`);
  // La recherche anglaise trouve l'anglais (et son « Qui peut quoi »)
  assert.ok(searchGuide('backup', en).chapters.some((c) => c.id === 'installation'));
  assert.ok(searchGuide('Read only', en).chapters.some((c) => c.id === 'roles' && c.intro));
  assert.deepEqual(searchGuide('zzqqxw', en), { chapters: [], count: 0 });
  assert.equal(searchGuide('', en), null);
  // Le français par défaut
  assert.deepEqual(searchGuide('sauvegarde'), searchGuide('sauvegarde', helpFor('fr')));
});

test('exemple de compose du guide anglais : mêmes variables que le français, LISTO_PUSH en commentaire', () => {
  const codeOf = (guide) => guide.find((c) => c.id === 'installation').sections.find((s) => s.id === 'variables').blocks.find((b) => b.code).code;
  const tableOf = (guide) => guide.find((c) => c.id === 'installation').sections.find((s) => s.id === 'variables').blocks.find((b) => b.table).table.rows.map((r) => r[0]);
  const names = (text) => [...text.matchAll(/\b(NODE_ENV|PORT|TZ|LISTO_[A-Z_]+)\b/g)].map((m) => m[1]);
  assert.deepEqual(names(codeOf(EN.GUIDE)), names(codeOf(FR.GUIDE)));
  assert.deepEqual(tableOf(EN.GUIDE), tableOf(FR.GUIDE));
  assert.match(codeOf(EN.GUIDE), /# - LISTO_PUSH=on/);
  assert.doesNotMatch(codeOf(EN.GUIDE), /^\s*- LISTO_(PUSH|MCP)=on/m);
});
