// Fabrique docs/guide.md à partir de la source unique du guide
// (public/js/help-content.js, la même que la page « Aide » de l'application).
//
// À lancer à la main après chaque changement du guide :
//   node scripts/guide.js        (ou : npm run guide)
// Le test test/guide.test.js échoue tant que docs/guide.md n'est pas à jour.
//
// Aucune dépendance : le Markdown est écrit ici, ligne par ligne. Les
// numéros viennent de outline() (jamais écrits à la main) ; chaque titre est
// précédé d'une ancre stable, <a id="identifiant"></a>, pour que les liens
// ne changent pas quand la numérotation change.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE, ROLES, PERMISSIONS, PERMISSIONS_NOTE, SERVER_NOTE, outline, parseInline, refLabel, numbered } from '../public/js/help-content.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GUIDE_FILE = path.join(ROOT, 'docs', 'guide.md');

// Caractères qui changeraient la mise en forme Markdown d'un texte ordinaire
const escape = (text) => text.replace(/([\\*_[\]<>#|])/g, '\\$1');

// Un texte avec `code`, [[renvoi]] et [lien](https://…), en Markdown
export function inlineMarkdown(text) {
  return parseInline(text).map((part) => {
    if (part.code !== undefined) return `\`${part.code}\``;
    if (part.ref !== undefined) return `[${escape(refLabel(part.ref))}](#${part.ref})`;
    if (part.link !== undefined) return `[${escape(part.link)}](${part.href})`;
    return escape(part.text);
  }).join('');
}

// Une cellule de tableau : pas de retour à la ligne, | protégé
const cell = (text) => inlineMarkdown(text).replace(/\n/g, ' ');

function table(head, rows) {
  return [
    `| ${head.map(cell).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

// Le tableau « Qui peut quoi », avec « Oui » et « Non » en toutes lettres
function whoTable() {
  return [
    table(['Action', ...ROLES.map((r) => r.label)],
      PERMISSIONS.map((p) => [p.action, ...ROLES.map((r) => (p.roles.includes(r.key) ? 'Oui' : 'Non'))])),
    '',
    inlineMarkdown(PERMISSIONS_NOTE),
  ].join('\n');
}

function block(entry) {
  if (typeof entry === 'string') return inlineMarkdown(entry);
  if (entry.ul) return entry.ul.map((text) => `- ${inlineMarkdown(text)}`).join('\n');
  if (entry.ol) return entry.ol.map((text, i) => `${i + 1}. ${inlineMarkdown(text)}`).join('\n');
  if (entry.code !== undefined) return ['```sh', entry.code, '```'].join('\n');
  if (entry.table) return table(entry.table.head, entry.table.rows);
  if (entry.note) return `> **Attention** : ${inlineMarkdown(entry.note)}`;
  if (entry.sub) return `**${inlineMarkdown(entry.sub)}**`;
  if (entry.who) return whoTable();
  throw new Error(`Bloc inconnu dans le guide : ${JSON.stringify(entry).slice(0, 80)}`);
}

// Le document entier
export function guideMarkdown() {
  const entries = outline();
  const entryOf = new Map(entries.map((e) => [e.id, e]));
  const out = [
    '# Listo : le guide',
    '',
    '<!-- Fichier fabriqué par scripts/guide.js à partir de public/js/help-content.js : ne pas le modifier à la main. -->',
    '',
    'Le mode d\'emploi complet de Listo, le même que la page « Aide » de l\'application (Réglages › « Aide »). Les chapitres marqués « Pour la personne qui gère le serveur » ne concernent que l\'installation et l\'entretien.',
    '',
    '## Sommaire',
    '',
    ...entries.map((e) => `${e.level === 2 ? '  ' : ''}- [${escape(numbered(e))}](#${e.id})`),
  ];
  const heading = (level, id) => ['', `<a id="${id}"></a>`, '', `${'#'.repeat(level)} ${escape(numbered(entryOf.get(id)))}`];
  for (const chapter of GUIDE) {
    out.push(...heading(2, chapter.id));
    if (chapter.server) out.push('', `*${SERVER_NOTE}.*`);
    for (const entry of chapter.blocks ?? []) out.push('', block(entry));
    for (const section of chapter.sections ?? []) {
      out.push(...heading(3, section.id));
      if (section.server && !chapter.server) out.push('', `*${SERVER_NOTE}.*`);
      for (const entry of section.blocks ?? []) out.push('', block(entry));
    }
  }
  out.push('');
  return out.join('\n');
}

// Lancé directement : écrit docs/guide.md
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(GUIDE_FILE, guideMarkdown());
  console.log(`Guide écrit : ${path.relative(ROOT, GUIDE_FILE)} (${outline().length} titres numérotés).`);
}
