// Vérifie les liens des documents du dépôt (README, docs/, design/README.md,
// CLAUDE.md, SECURITY.md, CONTRIBUTING.md…) : chaque lien vers un fichier du
// dépôt doit mener à un fichier qui existe, et chaque ancre (#…) à un titre
// ou à une ancre <a id="…"> de ce fichier. Les liens vers
// https://github.com/magicgg91/listo/blob/main/… sont vérifiés comme des
// liens du dépôt ; les autres sites ne sont pas vérifiés (pas de réseau).
//
// À lancer à la main : node scripts/doc-links.js (affiche les liens cassés).
// Le test test/guide.test.js l'appelle aussi.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = 'https://github.com/magicgg91/listo/blob/main/';
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'secrets', 'maquettes']);

// Tous les fichiers .md du dépôt (chemins relatifs à la racine)
export function markdownFiles(dir = '') {
  const found = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...markdownFiles(rel));
    } else if (entry.name.endsWith('.md')) {
      found.push(rel);
    }
  }
  return found.sort();
}

// Le texte sans les blocs de code (``` … ```), où rien n'est un lien
const withoutCode = (text) => text.replace(/^```[\s\S]*?^```/gm, '');

// Ancre calculée par GitHub pour un titre : minuscules, ponctuation retirée,
// espaces changés en tirets ; un titre répété reçoit -1, -2…
export function slug(title) {
  const plain = title
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\\(.)/g, '$1');
  return plain.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
}

// Ancres d'un fichier Markdown : ses titres et ses <a id|name="…">
export function anchorsOf(text) {
  const anchors = new Set();
  const seen = new Map();
  for (const line of withoutCode(text).split('\n')) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const base = slug(heading[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      anchors.add(n ? `${base}-${n}` : base);
    }
    for (const match of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(match[1]);
  }
  return anchors;
}

// Liens d'un fichier Markdown : [texte](cible) hors code
export function linksOf(text) {
  const links = [];
  const body = withoutCode(text).replace(/`[^`\n]*`/g, '');
  for (const match of body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) links.push(match[1]);
  return links;
}

// Liens cassés de tout le dépôt : [{ file, link, reason }]
export function brokenLinks() {
  const broken = [];
  const cache = new Map();
  const anchorsFor = (file) => {
    if (!cache.has(file)) cache.set(file, anchorsOf(fs.readFileSync(path.join(ROOT, file), 'utf8')));
    return cache.get(file);
  };
  for (const file of markdownFiles()) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const link of linksOf(text)) {
      let target = link;
      if (target.startsWith(REPO_URL)) target = `/${target.slice(REPO_URL.length)}`;
      else if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // autre site, mailto:
      const [rawPath, rawAnchor] = target.split('#');
      const relPath = rawPath
        ? (rawPath.startsWith('/') ? rawPath.slice(1) : path.join(path.dirname(file), decodeURIComponent(rawPath)))
        : file;
      const full = path.join(ROOT, relPath);
      if (!fs.existsSync(full)) {
        broken.push({ file, link, reason: 'fichier introuvable' });
        continue;
      }
      if (rawAnchor === undefined || rawAnchor === '') continue;
      if (!relPath.endsWith('.md')) continue;
      if (!anchorsFor(path.normalize(relPath)).has(decodeURIComponent(rawAnchor))) broken.push({ file, link, reason: 'ancre introuvable' });
    }
  }
  return broken;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const broken = brokenLinks();
  for (const b of broken) console.log(`${b.file} : ${b.link} (${b.reason})`);
  console.log(broken.length ? `${broken.length} lien(s) cassé(s).` : `Aucun lien cassé (${markdownFiles().length} fichiers vérifiés).`);
  process.exitCode = broken.length ? 1 : 0;
}
