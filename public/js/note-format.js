// Mise en forme du texte des notes (décision du propriétaire du 24 novembre
// 2026) : un petit morceau de Markdown, écrit DANS le texte de la note.
//
// Le texte d'une note reste une simple chaîne de caractères : la version,
// l'enregistrement automatique, les conflits, le MCP et la page publique
// n'ont donc pas changé. Seul l'affichage hors saisie met le texte en forme.
//
// Marques reconnues (une ligne à la fois, règles volontairement simples) :
// - en début de ligne : « # Titre » (titre), « ## Sous-titre », « - texte »
//   ou « * texte » (puce), « 1. texte » (liste numérotée, numéros gardés tels
//   qu'ils sont écrits), « - [ ] tâche » et « - [x] tâche » (case à cocher) ;
// - dans la ligne : **gras**, *italique* (ou _italique_), ++souligné++
//   (extension courante, pas du Markdown standard) et ==surligné== ;
// - liens : [texte affiché](https://…) ; adresses http et https nues
//   cliquables comme avant. Toute autre adresse (javascript:, data:…) reste
//   du texte, jamais un lien.
// Une marque sans sa fermeture, ou mal placée (« a * b * c »), s'affiche
// telle quelle. Le texte entre deux marques ne commence ni ne finit par une
// espace. Les marques de ligne ne se combinent pas entre elles (une ligne
// est un titre OU une puce…) ; les marques dans la ligne se combinent
// simplement (gras dans une puce, italique dans du gras). Aucun HTML n'est
// jamais interprété : « <b> » reste du texte.
//
// Ce module n'importe rien et ne touche pas à l'écran : le téléphone, la
// page publique et le serveur (plainText, pour les titres, extraits et
// notifications) appliquent ainsi les mêmes règles, testées
// automatiquement (test/note-format.test.js). renderNoteText fabrique
// l'affichage avec la fonction h reçue (dom.js : createElement et
// textContent, jamais innerHTML).

// --- Adresses web ---

// Une adresse commence par http:// ou https:// et va jusqu'au prochain
// espace ; la ponctuation qui la suit dans une phrase (point, virgule,
// parenthèse, guillemet…) n'en fait pas partie.
const URL_START = /\bhttps?:\/\/[^\s<>"]+/gi;
const TRAILING = '.,;:!?)]}\'»›"';

// Adresse sans la ponctuation qui la suit (boucle simple : jamais lente,
// même sur une très longue suite de points)
function trimTrailing(raw) {
  let end = raw.length;
  while (end > 0 && TRAILING.includes(raw[end - 1])) end -= 1;
  return raw.slice(0, end);
}

// Adresse sûre à ouvrir, ou null : seulement http: ou https:, avec un nom
// de site, sans identifiant ni mot de passe dans l'adresse
export function safeLink(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.href;
}

// Découpe un texte en morceaux : { text } (texte simple) ou { text, href }
// (adresse web cliquable). Les morceaux remis bout à bout redonnent
// exactement le texte (retours à la ligne compris).
export function linkParts(text) {
  const source = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(URL_START)) {
    const raw = trimTrailing(match[0]);
    const href = safeLink(raw);
    if (!href) continue;
    if (match.index > last) parts.push({ text: source.slice(last, match.index) });
    parts.push({ text: raw, href });
    last = match.index + raw.length;
  }
  if (last < source.length) parts.push({ text: source.slice(last) });
  return parts;
}

// --- Lignes ---

const HEADING = /^(#{1,2}) /;
const TASK = /^[-*] \[([ xX])\](?: |$)/;
const BULLET = /^[-*] /;
const NUMBER = /^(\d{1,9})\. /;

// Sorte d'une ligne et longueur de sa marque de début :
// { kind: 'h1' | 'h2' | 'task' | 'bullet' | 'number' | 'text', prefix,
//   checked (case), number (liste numérotée, tel qu'écrit) }
export function lineInfo(line) {
  let m = HEADING.exec(line);
  if (m) return { kind: m[1].length === 1 ? 'h1' : 'h2', prefix: m[0].length };
  m = TASK.exec(line);
  if (m) return { kind: 'task', prefix: m[0].length, checked: m[1] !== ' ' };
  m = BULLET.exec(line);
  if (m) return { kind: 'bullet', prefix: m[0].length };
  m = NUMBER.exec(line);
  if (m) return { kind: 'number', prefix: m[0].length, number: m[1] };
  return { kind: 'text', prefix: 0 };
}

// Lignes d'un texte, avec leur position dans le texte : { text, start, end }
// (un « \r » de fin de ligne n'en fait pas partie)
export function linesOf(source) {
  const text = String(source ?? '');
  const lines = [];
  let start = 0;
  for (;;) {
    const cut = text.indexOf('\n', start);
    const stop = cut < 0 ? text.length : cut;
    const end = stop > start && text[stop - 1] === '\r' ? stop - 1 : stop;
    lines.push({ text: text.slice(start, end), start, end });
    if (cut < 0) return lines;
    start = cut + 1;
  }
}

// --- Marques dans la ligne ---

const SPACE = /\s/;
const WORD = /[\p{L}\p{N}]/u;
const LINK = /\[([^[\]\n]+)\]\(([^\s()]+)\)/y;
const BARE = /https?:\/\/[^\s<>"]+/iy;

// Marque qui s'ouvre à la position i, ou null
function markAt(text, i, limit) {
  const two = text.slice(i, i + 2);
  let mark = null;
  if (two === '**') mark = { type: 'bold', delim: '**' };
  else if (two === '++') mark = { type: 'underline', delim: '++' };
  else if (two === '==') mark = { type: 'highlight', delim: '==' };
  else if (text[i] === '*') mark = { type: 'italic', delim: '*' };
  else if (text[i] === '_' && (i === 0 || !WORD.test(text[i - 1]))) mark = { type: 'italic', delim: '_' };
  if (!mark) return null;
  const after = i + mark.delim.length;
  // Le texte marqué ne commence pas par une espace (« a * b » reste tel quel)
  if (after >= limit || SPACE.test(text[after])) return null;
  return mark;
}

// Position de la marque qui ferme celle ouverte en i, ou -1. Une fermeture
// valable suit un caractère qui n'est pas une espace (et, pour « _ », n'est
// pas suivie d'une lettre).
function closeOf(text, i, mark, limit) {
  const size = mark.delim.length;
  for (let j = i + size + 1; j + size <= limit; j += 1) {
    // « ** » à l'intérieur d'un italique : un gras, passé en entier
    if (mark.delim === '*' && text[j] === '*' && text[j + 1] === '*' && j + 2 <= limit) {
      j += 1;
      continue;
    }
    if (text.slice(j, j + size) !== mark.delim || SPACE.test(text[j - 1])) continue;
    if (mark.delim === '_' && j + 1 < limit && WORD.test(text[j + 1])) continue;
    if (mark.delim === '**' && text[j + 2] === '*' && j + 3 <= limit) j += 1; // « ***a*** » : gras autour d'un italique
    return j;
  }
  return -1;
}

// Morceaux d'une ligne entre from et limit (positions dans la ligne ; base :
// position de la ligne dans le texte entier) :
// { type: 'text', text, at } (at : position du premier caractère dans le
// texte entier), { type: 'link', text, href, at, start, end },
// { type: 'bold' | 'italic' | 'underline' | 'highlight', start, end, children }
function parseInline(text, from, limit, base) {
  const out = [];
  let plain = '';
  let plainAt = 0;
  // Marques déjà cherchées sans fermeture jusqu'au bout : inutile de
  // chercher encore (une fermeture ne dépend pas de l'ouverture)
  const noClose = new Map();
  const flush = () => {
    if (plain) out.push({ type: 'text', text: plain, at: plainAt });
    plain = '';
  };
  let i = from;
  while (i < limit) {
    // Lien [texte](adresse) : seulement http et https
    if (text[i] === '[') {
      LINK.lastIndex = i;
      const m = LINK.exec(text);
      const href = m && i + m[0].length <= limit ? safeLink(m[2]) : null;
      if (href) {
        flush();
        out.push({ type: 'link', text: m[1], href, at: base + i + 1, start: base + i, end: base + i + m[0].length });
        i += m[0].length;
        continue;
      }
    }
    // Adresse nue (pas collée à une lettre qui la précède)
    if ((text[i] === 'h' || text[i] === 'H') && (i === 0 || !WORD.test(text[i - 1]))) {
      BARE.lastIndex = i;
      const m = BARE.exec(text);
      if (m) {
        const raw = trimTrailing(m[0].slice(0, limit - i));
        const href = safeLink(raw);
        if (href) {
          flush();
          out.push({ type: 'link', text: raw, href, at: base + i, start: base + i, end: base + i + raw.length });
          i += raw.length;
          continue;
        }
      }
    }
    const mark = markAt(text, i, limit);
    if (mark && !(noClose.get(mark.delim) <= i)) {
      const close = closeOf(text, i, mark, limit);
      if (close < 0) noClose.set(mark.delim, i);
      else {
        flush();
        const size = mark.delim.length;
        out.push({ type: mark.type, start: base + i, end: base + close + size, children: parseInline(text, i + size, close, base) });
        i = close + size;
        continue;
      }
    }
    if (!plain) plainAt = base + i;
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

// Une ligne analysée : sorte, marque de début et morceaux
// { kind, prefix, checked, number, start, end, content (position du texte
//   après la marque de début), parts }
function parseLine(line) {
  const info = lineInfo(line.text);
  return { ...info, start: line.start, end: line.end, content: line.start + info.prefix, parts: parseInline(line.text, info.prefix, line.text.length, line.start) };
}

// Le texte entier, ligne par ligne
export function parseNoteText(source) {
  return linesOf(source).map(parseLine);
}

// Texte des morceaux, sans les marques
const flat = (parts) => parts.map((part) => (part.children ? flat(part.children) : part.text)).join('');

// --- Texte sans les marques ---

// Le texte tel qu'on le lit, sans les marques : « **a** » → « a »,
// « [t](https://…) » → « t », « - [x] a » → « a », « # Titre » → « Titre ».
// Les numéros d'une liste numérotée restent (« 1. a ») : ils font partie du
// texte. Sert aux titres et extraits des cartes, à la tuile de l'Accueil,
// aux notifications, aux Nouveautés, à la recherche et au titre d'une copie.
export function plainText(source) {
  return parseNoteText(source).map((line) => {
    const text = flat(line.parts);
    return line.kind === 'number' ? `${line.number}. ${text}` : text;
  }).join('\n');
}

// --- Affichage ---

// Une ligne de liste (puce, numéro, case) : la liste qui la contient
const LIST_OF = { bullet: 'bullet', number: 'number', task: 'task' };

// Morceaux d'une ligne en éléments : chaque texte est dans un élément qui
// porte sa position dans le texte (data-at), pour retrouver l'endroit
// touché ou sélectionné (sourceOffset)
function inlineNodes(parts, h, rel) {
  return parts.map((part) => {
    if (part.type === 'text') return h('span', { 'data-at': String(part.at) }, part.text);
    if (part.type === 'link') return h('a', { class: 'note-link', href: part.href, target: '_blank', rel, 'data-at': String(part.at) }, part.text);
    const tag = { bold: 'strong', italic: 'em', underline: 'u', highlight: 'mark' }[part.type];
    return h(tag, { class: `nf-${part.type}` }, inlineNodes(part.children, h, rel));
  });
}

// Le texte mis en forme, en éléments (h : la fonction de dom.js ; icon :
// celle de dom.js, pour la coche). editable : les cases se cochent (le
// propriétaire et « Peut modifier ») ; sinon elles sont seulement montrées
// (« Lecture seule », page publique). rel : celui des liens.
// Chaque ligne porte sa position dans le texte (data-line : son début,
// data-end : sa fin) : une case touchée coche sa ligne (toggleTask).
export function renderNoteText(source, { h, icon, editable = false, rel = 'noopener noreferrer' }) {
  const out = [];
  let list = null; // liste en cours (ul ou ol) et sa sorte
  for (const line of parseNoteText(source)) {
    const where = { 'data-line': String(line.start), 'data-end': String(line.end) };
    const content = inlineNodes(line.parts, h, rel);
    const kind = LIST_OF[line.kind];
    if (!kind) list = null;
    else if (!list || list.kind !== kind) {
      list = { kind, el: h(kind === 'number' ? 'ol' : 'ul', { class: `nf-list nf-list--${kind}` }) };
      out.push(list.el);
    }
    if (line.kind === 'h1' || line.kind === 'h2') {
      out.push(h(line.kind === 'h1' ? 'h2' : 'h3', { class: `nf-${line.kind}`, ...where }, content.length ? content : h('br')));
    } else if (line.kind === 'task') {
      const label = flat(line.parts);
      const attrs = { class: `tick nf-task__box${line.checked ? ' is-on' : ''}`, role: 'checkbox', 'aria-checked': String(line.checked), 'aria-label': label || null };
      const box = editable
        ? h('button', { ...attrs, type: 'button' }, line.checked ? icon('check') : null)
        : h('span', { ...attrs, 'aria-disabled': 'true' }, line.checked ? icon('check') : null);
      list.el.append(h('li', { class: `nf-task${line.checked ? ' is-done' : ''}`, ...where }, box, h('span', { class: 'nf-task__text' }, content)));
    } else if (line.kind === 'bullet') {
      list.el.append(h('li', { class: 'nf-item', ...where }, content));
    } else if (line.kind === 'number') {
      list.el.append(h('li', { class: 'nf-item', value: line.number, ...where }, content));
    } else {
      // Ligne de texte (une ligne vide garde sa hauteur)
      out.push(h('div', { class: 'nf-line', ...where }, content.length ? content : h('br')));
    }
  }
  return out;
}

// Position dans le texte d'un endroit de l'affichage (node, offset : ceux
// d'une sélection ou d'un appui), ou null s'il n'est pas dans le texte
// affiché. Un endroit dans une marque de début de ligne (puce, case) donne
// le début du texte de la ligne.
export function sourceOffset(node, offset) {
  if (!node) return null;
  if (node.nodeType === 3) {
    const holder = node.parentNode;
    const at = holder?.getAttribute?.('data-at');
    if (at !== null && at !== undefined) return Number(at) + Math.min(offset, node.data.length);
    return lineEdge(holder, false);
  }
  const kids = node.childNodes ?? [];
  if (offset < kids.length) {
    const text = firstText(kids[offset]);
    if (text) return sourceOffset(text, 0);
  } else {
    const text = lastText(node);
    if (text) return sourceOffset(text, text.data.length);
  }
  return lineEdge(node, offset >= kids.length);
}

// Endroit de l'affichage (texte, décalage) d'une position du texte de la
// note : l'inverse de sourceOffset, pour remettre une sélection après un
// bouton de la barre (le texte mis en forme reste choisi, et l'on peut
// enchaîner une autre mise en forme). edge : 'start' (début d'une
// sélection) ou 'end' (fin). Une position tombée dans une marque (« ** »…)
// va au texte affiché le plus proche, vers l'intérieur de la sélection.
// null si l'affichage n'a aucun texte.
export function domPoint(root, pos, edge = 'start') {
  const runs = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const at = node.parentNode?.getAttribute?.('data-at');
      if (at !== null && at !== undefined) runs.push({ node, from: Number(at), to: Number(at) + node.data.length });
      return;
    }
    for (const kid of node.childNodes ?? []) walk(kid);
  };
  walk(root);
  if (!runs.length) return null;
  if (edge === 'start') {
    const inside = runs.find((r) => pos >= r.from && pos < r.to);
    if (inside) return [inside.node, pos - inside.from];
    const next = runs.find((r) => r.from >= pos);
    if (next) return [next.node, 0];
    const last = runs[runs.length - 1];
    return [last.node, last.node.data.length];
  }
  const inside = [...runs].reverse().find((r) => pos > r.from && pos <= r.to);
  if (inside) return [inside.node, pos - inside.from];
  const before = [...runs].reverse().find((r) => r.to <= pos);
  if (before) return [before.node, before.node.data.length];
  return [runs[0].node, 0];
}

// Premier et dernier texte (avec data-at) dans un élément
function firstText(node) {
  if (node.nodeType === 3) return node.parentNode?.getAttribute?.('data-at') != null ? node : null;
  for (const kid of node.childNodes ?? []) {
    const found = firstText(kid);
    if (found) return found;
  }
  return null;
}
function lastText(node) {
  if (node.nodeType === 3) return node.parentNode?.getAttribute?.('data-at') != null ? node : null;
  const kids = [...(node.childNodes ?? [])];
  for (let i = kids.length - 1; i >= 0; i -= 1) {
    const found = lastText(kids[i]);
    if (found) return found;
  }
  return null;
}

// Début ou fin du texte de la ligne qui contient cet élément
function lineEdge(node, end) {
  for (let el = node; el; el = el.parentNode) {
    const line = el.getAttribute?.('data-line');
    if (line === null || line === undefined) continue;
    if (end) return Number(el.getAttribute('data-end'));
    const text = firstText(el);
    return text ? sourceOffset(text, 0) : Number(el.getAttribute('data-end'));
  }
  return null;
}

// --- Barre de mise en forme ---

export const INLINE_MARKS = { bold: '**', italic: '*', underline: '++', highlight: '==' };
export const LINE_KINDS = ['h1', 'h2', 'bullet', 'number', 'task'];
// Les dix boutons de la barre, dans l'ordre (décision du 24 novembre 2026)
export const TOOLBAR = ['h1', 'h2', 'bold', 'italic', 'underline', 'highlight', 'bullet', 'number', 'task', 'link'];

// Mise en forme active à cet endroit du texte (boutons « enfoncés » de la
// barre) : la sorte de la ligne et les marques qui entourent la position
const markSize = { bold: 2, italic: 1, underline: 2, highlight: 2 };
export function formatsAt(source, at) {
  const found = new Set();
  const text = String(source ?? '');
  if (at < 0 || at > text.length) return found;
  // Seulement la ligne du curseur (appelé à chaque déplacement du curseur)
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const cut = text.indexOf('\n', at);
  const stop = cut < 0 ? text.length : cut;
  const line = parseLine({ text: text.slice(start, stop).replace(/\r$/, ''), start, end: stop - (text[stop - 1] === '\r' ? 1 : 0) });
  if (LINE_KINDS.includes(line.kind)) found.add(line.kind);
  const walk = (parts) => {
    for (const part of parts) {
      if (!part.children) continue;
      const size = markSize[part.type];
      if (at >= part.start + size && at <= part.end - size) {
        found.add(part.type);
        walk(part.children);
      }
    }
  };
  walk(line.parts);
  return found;
}

// Applique une liste de modifications { at, del, ins } (sans chevauchement)
// au texte et déplace la sélection [start, end] en conséquence. Un ajout à
// l'endroit exact du début de la sélection passe avant elle, un ajout à
// l'endroit exact de sa fin passe après (la sélection garde le texte marqué).
function applyEdits(text, start, end, edits) {
  const sorted = [...edits].sort((a, b) => a.at - b.at);
  const move = (pos, isStart) => {
    let shift = 0;
    for (const edit of sorted) {
      const stop = edit.at + edit.del;
      if (edit.del === 0) {
        if (edit.at < pos || (isStart && edit.at === pos)) shift += edit.ins.length;
      } else if (pos >= stop) {
        shift += edit.ins.length - edit.del;
      } else if (pos > edit.at || (edit.at === pos && edit.line)) {
        // Dans la partie remplacée (marque de début de ligne) : juste après la nouvelle
        return edit.at + edit.ins.length + shift;
      }
    }
    return pos + shift;
  };
  let out = text;
  for (const edit of [...sorted].reverse()) out = out.slice(0, edit.at) + edit.ins + out.slice(edit.at + edit.del);
  const newStart = move(start, true);
  return { text: out, start: newStart, end: Math.max(newStart, move(end, false)) };
}

// Nombre de « * » collés avant ou après une position
function starsBefore(text, at) {
  let n = 0;
  while (at - n - 1 >= 0 && text[at - n - 1] === '*') n += 1;
  return n;
}
function starsAfter(text, at) {
  let n = 0;
  while (text[at + n] === '*') n += 1;
  return n;
}

// Le morceau [a, b] est-il déjà entouré de cette marque ? Renvoie les
// modifications qui la retirent, ou null.
function unwrapEdits(text, a, b, type) {
  const delim = INLINE_MARKS[type];
  const size = delim.length;
  if (type === 'italic') {
    if (text[a - 1] === '_' && text[b] === '_') return [{ at: a - 1, del: 1, ins: '' }, { at: b, del: 1, ins: '' }];
    if (starsBefore(text, a) % 2 === 1 && starsAfter(text, b) % 2 === 1) return [{ at: a - 1, del: 1, ins: '' }, { at: b, del: 1, ins: '' }];
    if (b - a >= 3 && ((text[a] === '_' && text[b - 1] === '_') || (text[a] === '*' && text[b - 1] === '*' && text[a + 1] !== '*' && text[b - 2] !== '*'))) {
      return [{ at: a, del: 1, ins: '' }, { at: b - 1, del: 1, ins: '' }];
    }
    return null;
  }
  if (type === 'bold') {
    if (starsBefore(text, a) >= 2 && starsAfter(text, b) >= 2) return [{ at: a - 2, del: 2, ins: '' }, { at: b, del: 2, ins: '' }];
  } else if (text.slice(a - size, a) === delim && text.slice(b, b + size) === delim) {
    return [{ at: a - size, del: size, ins: '' }, { at: b, del: size, ins: '' }];
  }
  if (b - a > 2 * size && text.slice(a, a + size) === delim && text.slice(b - size, b) === delim) {
    return [{ at: a, del: size, ins: '' }, { at: b - size, del: size, ins: '' }];
  }
  return null;
}

// Marques collées autour d'un morceau [a, b] (par exemple « ***== » avant
// et « ==*** » après) : les mises en forme déjà posées, de l'extérieur vers
// l'intérieur. Sert à ajouter ou retirer une marque parmi d'autres sans
// casser l'imbrication (gras, puis italique, puis surligné, puis retirer le
// gras : il reste italique et surligné, jamais des « * » ou « == » visibles).
// null si les marques des deux côtés ne se répondent pas.
const RUN_CHAR = /[*_+=]/;
const CANON = ['bold', 'underline', 'italic', 'highlight']; // de l'extérieur vers l'intérieur
function runTokens(run) {
  const kinds = [];
  let italic = '*';
  let i = 0;
  while (i < run.length) {
    const c = run[i];
    if ((c === '+' || c === '=') && run[i + 1] === c) {
      kinds.push(c === '+' ? 'underline' : 'highlight');
      i += 2;
    } else if (c === '_') {
      kinds.push('italic');
      italic = '_';
      i += 1;
    } else if (c === '*') {
      let n = 0;
      while (run[i + n] === '*') n += 1;
      if (n >= 3) kinds.push('bold', 'italic');
      else kinds.push(n === 2 ? 'bold' : 'italic');
      i += Math.min(n, 3);
      if (n > 3) return null;
    } else return null;
  }
  return { kinds, italic };
}
function marksAround(text, a, b) {
  let from = a;
  while (from > 0 && RUN_CHAR.test(text[from - 1])) from -= 1;
  let to = b;
  while (to < text.length && RUN_CHAR.test(text[to])) to += 1;
  if (from === a && to === b) return { from, to, kinds: [], italic: '*' };
  const before = runTokens(text.slice(from, a));
  const after = runTokens(text.slice(b, to));
  if (!before || !after) return null;
  const same = [...before.kinds].sort().join() === [...after.kinds].sort().join();
  if (!same || new Set(before.kinds).size !== before.kinds.length) return null;
  return { from, to, kinds: before.kinds, italic: before.italic };
}
// Marques rangées dans un ordre que le lecteur comprend toujours
function runOf(kinds, italic, side) {
  const order = CANON.filter((kind) => kinds.includes(kind));
  const marks = order.map((kind) => (kind === 'italic' ? italic : INLINE_MARKS[kind]));
  return side === 'before' ? marks.join('') : marks.reverse().join('');
}

// Gras, italique, souligné, surligné : entoure la sélection (chaque ligne
// sélectionnée à part, sans sa marque de début ni ses espaces de bord), ou
// la retire si tout est déjà marqué. Sans sélection : la paire est ajoutée
// et le curseur va entre les deux (une paire vide est retirée).
function applyInline(text, start, end, type) {
  const delim = INLINE_MARKS[type];
  const size = delim.length;
  if (start === end) {
    if (text.slice(start - size, start) === delim && text.slice(start, start + size) === delim) {
      return applyEdits(text, start, end, [{ at: start - size, del: size, ins: '' }, { at: start, del: size, ins: '' }]);
    }
    return { text: text.slice(0, start) + delim + delim + text.slice(start), start: start + size, end: start + size };
  }
  const pieces = [];
  for (const line of linesOf(text)) {
    if (line.end < start || line.start > end || (line.start === end && end > start)) continue;
    let a = Math.max(start, line.start + lineInfo(line.text).prefix);
    let b = Math.min(end, line.end);
    while (a < b && SPACE.test(text[a])) a += 1;
    while (b > a && SPACE.test(text[b - 1])) b -= 1;
    if (a < b) pieces.push([a, b]);
  }
  if (!pieces.length) return { text, start, end };
  // Marques déjà collées autour de chaque morceau : on ajoute ou retire
  // celle-ci parmi elles, en gardant les autres bien imbriquées
  const around = pieces.map(([a, b]) => marksAround(text, a, b));
  if (around.every((m) => m && m.kinds.length)) {
    const remove = around.every((m) => m.kinds.includes(type));
    const edits = [];
    pieces.forEach(([a, b], i) => {
      const m = around[i];
      if (!remove && m.kinds.includes(type)) return;
      const kinds = remove ? m.kinds.filter((k) => k !== type) : [...m.kinds, type];
      edits.push({ at: m.from, del: a - m.from, ins: runOf(kinds, m.italic, 'before') });
      edits.push({ at: b, del: m.to - b, ins: runOf(kinds, m.italic, 'after') });
    });
    return applyEdits(text, start, end, edits);
  }
  const unwraps = pieces.map(([a, b]) => unwrapEdits(text, a, b, type));
  if (unwraps.every(Boolean)) return applyEdits(text, start, end, unwraps.flat());
  const edits = [];
  pieces.forEach(([a, b], i) => {
    if (!unwraps[i]) edits.push({ at: a, del: 0, ins: delim }, { at: b, del: 0, ins: delim });
  });
  return applyEdits(text, start, end, edits);
}

// Titre, sous-titre, puce, numéro, case : sur chaque ligne sélectionnée
// (sauf les lignes vides quand il y en a plusieurs). Si toutes ont déjà
// cette marque, elle est retirée ; sinon elle remplace la marque de début
// de chaque ligne (Titre → Sous-titre, puce → case…). Numéros : 1, 2, 3…,
// à la suite d'une liste numérotée juste au-dessus.
function applyLine(text, start, end, kind) {
  const lines = linesOf(text);
  const last = end > start && lines.some((l) => l.start === end) ? end - 1 : end;
  const chosen = lines.filter((l) => l.end >= start && l.start <= last);
  const filled = chosen.filter((l) => l.text.trim() !== '');
  const targets = chosen.length > 1 && filled.length ? filled : chosen;
  const infos = targets.map((l) => lineInfo(l.text));
  const remove = infos.every((info) => info.kind === kind);
  const above = lines[lines.indexOf(targets[0]) - 1];
  const aboveInfo = above ? lineInfo(above.text) : null;
  let number = aboveInfo?.kind === 'number' ? Number(aboveInfo.number) + 1 : 1;
  const edits = [];
  targets.forEach((line, i) => {
    const info = infos[i];
    let ins = '';
    if (!remove) {
      if (info.kind === kind && kind !== 'number') return; // déjà bonne
      ins = { h1: '# ', h2: '## ', bullet: '- ', task: '- [ ] ' }[kind] ?? `${number}. `;
      number += 1;
    }
    edits.push({ at: line.start, del: info.prefix, ins, line: true });
  });
  return applyEdits(text, start, end, edits);
}

// Le changement d'un bouton de la barre (sauf le lien) sur le texte et sa
// sélection [start, end] : { text, start, end } (le texte modifié et la
// nouvelle sélection)
export function applyFormat(text, start, end, kind) {
  const source = String(text ?? '');
  const a = Math.max(0, Math.min(start, end, source.length));
  const b = Math.max(a, Math.min(Math.max(start, end), source.length));
  if (INLINE_MARKS[kind]) return applyInline(source, a, b, kind);
  if (LINE_KINDS.includes(kind)) return applyLine(source, a, b, kind);
  return { text: source, start: a, end: b };
}

// Adresse d'un lien à insérer, ou null (http et https seulement) ; les
// parenthèses sont codées pour ne pas fermer le lien
export function linkAddress(value) {
  const href = safeLink(String(value ?? '').trim());
  return href ? href.replace(/\(/g, '%28').replace(/\)/g, '%29') : null;
}

// Texte affiché d'un lien : sur une ligne, sans crochets
export const linkLabel = (value) => String(value ?? '').replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();

// « Insérer un lien » : remplace la sélection par [texte](adresse) (ou
// l'adresse seule si le texte est vide), curseur après. null si l'adresse
// n'est pas en http ou https.
export function insertLink(text, start, end, label, address) {
  const href = linkAddress(address);
  if (!href) return null;
  const source = String(text ?? '');
  const a = Math.max(0, Math.min(start, end, source.length));
  const b = Math.max(a, Math.min(Math.max(start, end), source.length));
  const shown = linkLabel(label);
  let inserted = shown ? `[${shown}](${href})` : href;
  // Une adresse nue collée à une lettre ne serait pas reconnue
  if (!shown && a > 0 && WORD.test(source[a - 1])) inserted = ` ${inserted}`;
  const out = source.slice(0, a) + inserted + source.slice(b);
  return { text: out, start: a + inserted.length, end: a + inserted.length };
}

// Lien [texte](adresse) qui contient la sélection [start, end], ou null :
// « Insérer un lien » le remplace alors en entier (jamais un lien dans un
// lien) : { start, end, text, href }
export function linkAround(text, start, end) {
  const line = parseNoteText(text).find((l) => start >= l.start && end <= l.end);
  const find = (parts) => {
    for (const part of parts) {
      if (part.type === 'link' && part.start !== part.at && start >= part.start && end <= part.end) return part;
      const inner = part.children ? find(part.children) : null;
      if (inner) return inner;
    }
    return null;
  };
  const link = line ? find(line.parts) : null;
  return link ? { start: link.start, end: link.end, text: link.text, href: link.href } : null;
}

// Coche ou décoche la case de la ligne qui commence à cette position
// (« - [ ] » ↔ « - [x] »). Le texte garde sa longueur ; inchangé si la
// ligne n'est pas une case.
export function toggleTask(text, lineStart) {
  const source = String(text ?? '');
  const line = linesOf(source).find((l) => l.start === lineStart);
  if (!line || lineInfo(line.text).kind !== 'task') return source;
  const at = line.start + 3;
  return source.slice(0, at) + (source[at] === ' ' ? 'x' : ' ') + source.slice(at + 1);
}
