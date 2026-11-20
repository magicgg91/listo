// Outil des tests de langues (test/i18n-textes.test.js) : lit les chaînes
// d'un fichier JavaScript et repère celles qui ressemblent à un texte
// affiché (à sortir du code, vers public/js/i18n/fr/).

import fs from 'node:fs';

// Chaînes d'un fichier JavaScript, sans les commentaires : contenu des
// '…', "…" et des parties fixes des `…` (le code des ${…} est lu comme du
// code). Lecture simple, suffisante pour le code de Listo (pas d'expression
// régulière contenant un guillemet seul).
export function stringsOf(source) {
  const found = [];
  let i = 0;
  const stack = []; // profondeur des ${ } de chaque modèle `…` ouvert
  const readQuoted = (quote) => {
    let text = '';
    i += 1;
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') { text += source[i + 1]; i += 2; continue; }
      text += source[i];
      i += 1;
    }
    i += 1;
    return text;
  };
  const readTemplate = () => {
    // i est sur ` ou juste après une } qui ferme un ${
    let text = '';
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') { text += source[i + 1]; i += 2; continue; }
      if (c === '`') { i += 1; found.push(text); return; }
      if (c === '$' && source[i + 1] === '{') { i += 2; found.push(text); stack.push(0); return; }
      text += c;
      i += 1;
    }
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') { while (i < source.length && source[i] !== '\n') i += 1; continue; }
    if (c === '/' && next === '*') { i = source.indexOf('*/', i + 2) + 2; continue; }
    if (c === '\'' || c === '"') { found.push(readQuoted(c)); continue; }
    if (c === '`') { i += 1; readTemplate(); continue; }
    if (stack.length) {
      if (c === '{') stack[stack.length - 1] += 1;
      if (c === '}') {
        if (stack[stack.length - 1] === 0) { stack.pop(); i += 1; readTemplate(); continue; }
        stack[stack.length - 1] -= 1;
      }
    }
    // Expression régulière littérale après un signe : passée (elle peut
    // contenir des guillemets)
    if (c === '/' && /[=(,:!&|?;[{]\s*$/.test(source.slice(Math.max(0, i - 20), i))) {
      i += 1;
      while (i < source.length && source[i] !== '/') { if (source[i] === '\\') i += 1; if (source[i] === '[') { while (source[i] !== ']') { if (source[i] === '\\') i += 1; i += 1; } } i += 1; }
      i += 1;
      continue;
    }
    i += 1;
  }
  return found;
}

// Mots qui ne sont pas du texte à traduire : noms de touches du clavier,
// marque, en-têtes HTTP…
// Noms des icônes du sprite (public/index.html, id="i-…") : « plus »,
// « check »… ne sont pas des mots affichés
const ICONS = [...fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').matchAll(/id="i-([a-z0-9-]+)"/g)].map((m) => m[1]);
const NOT_TEXT = new Set([...ICONS, 'Listo', 'Escape', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete', 'Space', 'Content-Type', 'Bearer', 'Basic']);
const FRENCH_WORDS = /(^|\s)(le|la|les|l'|de|des|du|d'|un|une|et|ou|pour|avec|sans|est|vous|votre|vos|ce|cet|cette|à|au|aux|en|sur|pas|plus|ne|n'|se|s'|qui|que|par|dans)(\s|$)/i;

// Une chaîne ressemble-t-elle à un texte affiché ?
export function looksLikeText(value) {
  const text = value.trim();
  if (!text || NOT_TEXT.has(text)) return false;
  if (/^[a-z0-9]+(\.[a-zA-Z0-9]+)+$/.test(text)) return false; // nom d'un texte : « compte.langue.titre »
  if (/[À-ÖØ-öø-ÿŒœ]/.test(text)) return true; // lettre accentuée
  if (FRENCH_WORDS.test(text)) return true; // petit mot français
  if (/^[A-Z][a-z]+(\s|[.,:!?…]|$)/.test(text)) return true; // mot qui commence par une majuscule (« Chargement… »)
  if (text === 'OK') return true;
  return false;
}
