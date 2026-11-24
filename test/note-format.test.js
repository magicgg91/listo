// Mise en forme du texte des notes (décisions du 24 novembre 2026) :
// lecture des marques, texte sans marques, boutons de la barre, cases,
// liens (http et https seulement), affichage construit élément par élément
// (jamais de HTML), positions du texte retrouvées depuis l'affichage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseNoteText, plainText, applyFormat, insertLink, toggleTask, formatsAt, renderNoteText,
  sourceOffset, linkAddress, lineInfo, linkAround, TOOLBAR,
} from '../public/js/note-format.js';
import { noteTitle, noteExcerpt, linkParts, safeLink } from '../public/js/notes.js';
import { noteMatches } from '../public/js/labels.js';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';

// Morceaux d'une ligne, en abrégé : [sorte, texte] ou [sorte, [morceaux]]
const brief = (parts) => parts.map((p) => (p.children ? [p.type, brief(p.children)] : p.type === 'link' ? ['link', p.text, p.href] : ['text', p.text]));
const line = (source) => brief(parseNoteText(source)[0].parts);

test('marques de début de ligne : titres, puces, numéros, cases', () => {
  assert.equal(lineInfo('# Programme').kind, 'h1');
  assert.equal(lineInfo('## À emporter').kind, 'h2');
  assert.equal(lineInfo('### Trois').kind, 'text', 'seulement deux niveaux');
  assert.equal(lineInfo('#hashtag').kind, 'text', 'une espace après # est demandée');
  assert.equal(lineInfo('- pain').kind, 'bullet');
  assert.equal(lineInfo('* pain').kind, 'bullet');
  assert.deepEqual(lineInfo('12. pain'), { kind: 'number', prefix: 4, number: '12' });
  assert.deepEqual(lineInfo('- [ ] vélos'), { kind: 'task', prefix: 6, checked: false });
  assert.deepEqual(lineInfo('- [x] vélos'), { kind: 'task', prefix: 6, checked: true });
  assert.equal(lineInfo('- [X]').checked, true);
  assert.equal(lineInfo('- [x](https://a.fr)').kind, 'bullet', 'un lien n\'est pas une case');
  assert.equal(lineInfo('  - pain').kind, 'text', 'pas de retrait');
  assert.equal(lineInfo('**gras**').kind, 'text');
});

test('marques dans la ligne : chacune, combinées, non fermées', () => {
  assert.deepEqual(line('**gras**'), [['bold', [['text', 'gras']]]]);
  assert.deepEqual(line('*it* et _it_'), [['italic', [['text', 'it']]], ['text', ' et '], ['italic', [['text', 'it']]]]);
  assert.deepEqual(line('++souligné++'), [['underline', [['text', 'souligné']]]]);
  assert.deepEqual(line('==surligné=='), [['highlight', [['text', 'surligné']]]]);
  // Combinaisons simples
  assert.deepEqual(line('***a***'), [['bold', [['italic', [['text', 'a']]]]]]);
  assert.deepEqual(line('*a **b** c*'), [['italic', [['text', 'a '], ['bold', [['text', 'b']]], ['text', ' c']]]]);
  assert.deepEqual(brief(parseNoteText('- **pain** frais')[0].parts), [['bold', [['text', 'pain']]], ['text', ' frais']]);
  // Non fermées, mal placées : telles quelles
  for (const literal of ['**gras', 'a * b * c', 'a ** b **', '5*3', 'C++ et C++', 'snake_case_name', '== x ==', '**', '']) {
    assert.equal(plainText(literal), literal, literal);
  }
});

test('aucun HTML interprété : « <b> » reste du texte', () => {
  assert.deepEqual(line('<b>x</b> <img src=x onerror=alert(1)>'), [['text', '<b>x</b> <img src=x onerror=alert(1)>']]);
});

test('liens : [texte](https://…) et adresses nues ; javascript:, data:, ftp: jamais un lien', () => {
  assert.deepEqual(line('Marées : [horaires](https://maree.info/erquy)'), [['text', 'Marées : '], ['link', 'horaires', 'https://maree.info/erquy']]);
  assert.deepEqual(line('voir https://a.fr/x_y_z.'), [['text', 'voir '], ['link', 'https://a.fr/x_y_z', 'https://a.fr/x_y_z'], ['text', '.']]);
  for (const bad of ['[x](javascript:alert(1))', '[x](data:text/html,<b>)', '[x](ftp://a.fr)', '[x](//a.fr)', '[x](https://moi:secret@a.fr)', 'javascript:alert(1)']) {
    const parts = parseNoteText(bad)[0].parts;
    assert.ok(parts.every((p) => p.type !== 'link'), bad);
    assert.equal(plainText(bad), bad, `${bad} : affiché tel quel`);
  }
  // Une adresse collée à une lettre n'est pas reconnue (comme avant)
  assert.ok(parseNoteText('xhttps://a.fr')[0].parts.every((p) => p.type !== 'link'));
  // Les anciennes fonctions restent les mêmes (notes.js)
  assert.deepEqual(linkParts('a https://a.fr b'), [{ text: 'a ' }, { text: 'https://a.fr', href: 'https://a.fr/' }, { text: ' b' }]);
  assert.equal(safeLink('javascript:alert(1)'), null);
});

test('retours à la ligne Windows (CRLF) et texte vide', () => {
  const lines = parseNoteText('# A\r\n- [x] b\r\nc');
  assert.deepEqual(lines.map((l) => l.kind), ['h1', 'task', 'text']);
  assert.equal(plainText('# A\r\n- [x] b\r\nc'), 'A\nb\nc');
  assert.equal(plainText(''), '');
  assert.equal(plainText(null), '');
  assert.deepEqual(parseNoteText('').map((l) => l.kind), ['text']);
});

test('texte sans marques : cartes, titres, notifications, recherche', () => {
  const body = '# Programme\n**Du 11 au 18 juillet**, gîte.\n==Clés==\n- [x] Les vélos\n- Crème\n1. Un\nMarées : [horaires](https://maree.info)';
  assert.equal(plainText(body), 'Programme\nDu 11 au 18 juillet, gîte.\nClés\nLes vélos\nCrème\n1. Un\nMarées : horaires');
  // Titre affiché (sans titre : la première ligne, sans ses marques) et extrait
  assert.equal(noteTitle({ title: '', body }), 'Programme');
  assert.equal(noteTitle({ title: '**Titre** gardé', body }), '**Titre** gardé', 'le titre d\'une note n\'est jamais mis en forme');
  assert.equal(noteExcerpt({ title: '', body }), 'Du 11 au 18 juillet, gîte. Clés Les vélos Crème 1. Un Marées : horaires');
  // Recherche : le texte tel qu'il s'affiche, et tel qu'il est écrit
  assert.ok(noteMatches({ title: '', body: 'du **pain** frais' }, 'pain frais', []));
  assert.ok(noteMatches({ title: '', body: 'du **pain** frais' }, '**pain', []));
  assert.ok(!noteMatches({ title: '', body: 'du **pain** frais' }, 'beurre', []));
});

test('barre : dix boutons, dans l\'ordre décidé', () => {
  assert.deepEqual(TOOLBAR, ['h1', 'h2', 'bold', 'italic', 'underline', 'highlight', 'bullet', 'number', 'task', 'link']);
});

test('boutons gras, italique, souligné, surligné : entourer, retirer, sans sélection', () => {
  // Entourer : la sélection garde le texte marqué
  assert.deepEqual(applyFormat('du pain frais', 3, 7, 'bold'), { text: 'du **pain** frais', start: 5, end: 9 });
  assert.deepEqual(applyFormat('du pain frais', 3, 7, 'italic'), { text: 'du *pain* frais', start: 4, end: 8 });
  assert.deepEqual(applyFormat('du pain frais', 3, 7, 'underline'), { text: 'du ++pain++ frais', start: 5, end: 9 });
  assert.deepEqual(applyFormat('du pain frais', 3, 7, 'highlight'), { text: 'du ==pain== frais', start: 5, end: 9 });
  // Retirer (sélection dans les marques, ou marques comprises)
  assert.deepEqual(applyFormat('du **pain** frais', 5, 9, 'bold'), { text: 'du pain frais', start: 3, end: 7 });
  assert.deepEqual(applyFormat('du **pain** frais', 3, 11, 'bold'), { text: 'du pain frais', start: 3, end: 7 });
  assert.deepEqual(applyFormat('du *pain* frais', 4, 8, 'italic'), { text: 'du pain frais', start: 3, end: 7 });
  assert.deepEqual(applyFormat('du _pain_ frais', 4, 8, 'italic'), { text: 'du pain frais', start: 3, end: 7 });
  // Italique dans un gras : le gras reste
  assert.equal(applyFormat('**pain**', 2, 6, 'italic').text, '***pain***');
  assert.equal(applyFormat('***pain***', 3, 7, 'italic').text, '**pain**');
  assert.equal(applyFormat('***pain***', 3, 7, 'bold').text, '*pain*');
  // Espaces au bord de la sélection laissées dehors (sinon la marque ne marcherait pas)
  assert.equal(applyFormat('du pain frais', 2, 8, 'bold').text, 'du **pain** frais');
  // Sans sélection : la paire, curseur au milieu ; une paire vide se retire
  assert.deepEqual(applyFormat('ab', 1, 1, 'bold'), { text: 'a****b', start: 3, end: 3 });
  assert.deepEqual(applyFormat('a****b', 3, 3, 'bold'), { text: 'ab', start: 1, end: 1 });
  // Plusieurs lignes : chaque ligne à part, sans sa marque de début
  assert.equal(applyFormat('- pain\n- lait', 0, 13, 'bold').text, '- **pain**\n- **lait**');
  assert.equal(applyFormat('- **pain**\n- **lait**', 0, 21, 'bold').text, '- pain\n- lait');
  // Sélection à l'envers (fin avant début) : même résultat
  assert.equal(applyFormat('du pain frais', 7, 3, 'bold').text, 'du **pain** frais');
});

test('boutons titre, sous-titre, puce, numéro, case : lignes sélectionnées, retirer, remplacer', () => {
  assert.deepEqual(applyFormat('Programme', 3, 3, 'h1'), { text: '# Programme', start: 5, end: 5 });
  assert.deepEqual(applyFormat('# Programme', 5, 5, 'h1'), { text: 'Programme', start: 3, end: 3 });
  // H1 → H2 : remplacé
  assert.deepEqual(applyFormat('# Programme', 5, 5, 'h2'), { text: '## Programme', start: 6, end: 6 });
  assert.equal(applyFormat('pain', 0, 0, 'bullet').text, '- pain');
  assert.equal(applyFormat('- pain', 3, 3, 'bullet').text, 'pain');
  assert.equal(applyFormat('- pain', 3, 3, 'task').text, '- [ ] pain', 'puce → case');
  assert.equal(applyFormat('- [x] pain', 7, 7, 'task').text, 'pain');
  assert.equal(applyFormat('- [x] pain', 7, 7, 'bullet').text, '- pain');
  // Plusieurs lignes ; lignes vides passées ; numéros 1, 2, 3
  assert.equal(applyFormat('pain\n\nlait\nbeurre', 0, 17, 'number').text, '1. pain\n\n2. lait\n3. beurre');
  assert.equal(applyFormat('a\nb', 0, 3, 'bullet').text, '- a\n- b');
  assert.equal(applyFormat('- a\n- b', 0, 7, 'bullet').text, 'a\nb', 'toutes déjà en puces : retirées');
  assert.equal(applyFormat('- a\nb', 0, 5, 'bullet').text, '- a\n- b', 'une sur deux : ajoutée à l\'autre');
  // Suite d'une liste numérotée au-dessus
  assert.equal(applyFormat('1. a\n2. b\nc', 10, 10, 'number').text, '1. a\n2. b\n3. c');
  // Sélection qui finit au début d'une ligne : cette ligne n'en fait pas partie
  assert.equal(applyFormat('a\nb\nc', 0, 2, 'bullet').text, '- a\nb\nc');
  // Ligne vide : la marque est posée, curseur après
  assert.deepEqual(applyFormat('a\n', 2, 2, 'task'), { text: 'a\n- [ ] ', start: 8, end: 8 });
});

test('case touchée : la bonne ligne, et elle seule', () => {
  const body = '- [ ] a\n- [x] b\n- c';
  assert.equal(toggleTask(body, 0), '- [x] a\n- [x] b\n- c');
  assert.equal(toggleTask(body, 8), '- [ ] a\n- [ ] b\n- c');
  assert.equal(toggleTask(body, 16), body, 'une puce n\'est pas une case');
  assert.equal(toggleTask(body, 3), body, 'pas un début de ligne');
  assert.equal(toggleTask('- [X] a', 0), '- [ ] a');
  assert.equal(toggleTask(body, 8).length, body.length, 'même longueur : les positions restent');
});

test('lien inséré : [texte](adresse) ; http et https seulement', () => {
  assert.deepEqual(insertLink('voir site', 5, 9, 'le site', 'https://club.fr'), { text: 'voir [le site](https://club.fr/)', start: 32, end: 32 });
  assert.equal(insertLink('voir ', 5, 5, '', 'https://club.fr').text, 'voir https://club.fr/');
  assert.equal(insertLink('voir', 4, 4, '', 'https://club.fr').text, 'voir https://club.fr/', 'adresse nue : jamais collée à une lettre');
  assert.equal(insertLink('', 0, 0, 'a]b[\nc', 'https://club.fr').text, '[ab c](https://club.fr/)', 'texte sur une ligne, sans crochets');
  assert.equal(insertLink('', 0, 0, 'x', 'https://a.fr/p(1)').text, '[x](https://a.fr/p%281%29)', 'parenthèses codées');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.fr', 'club.fr', '', 'https://moi:secret@a.fr']) {
    assert.equal(insertLink('a', 0, 1, 'x', bad), null, bad);
    assert.equal(linkAddress(bad), null, bad);
  }
  // Un lien inséré se relit comme un lien
  const out = insertLink('', 0, 0, 'Club', 'https://club.fr/a(b)').text;
  assert.deepEqual(line(out), [['link', 'Club', 'https://club.fr/a%28b%29']]);
});

test('lien dans un lien : jamais ; le lien déjà là est repris en entier', () => {
  const text = 'voir [le site](https://club.fr/) ici';
  assert.deepEqual(linkAround(text, 8, 10), { start: 5, end: 32, text: 'le site', href: 'https://club.fr/' });
  assert.equal(linkAround(text, 0, 3), null);
  assert.equal(linkAround('voir https://club.fr', 6, 8), null, 'adresse nue : pas un [texte](adresse)');
  const out = insertLink(text, 5, 32, 'le club', 'https://club.fr/');
  assert.equal(out.text, 'voir [le club](https://club.fr/) ici');
});

test('boutons « enfoncés » : la mise en forme à l\'endroit du curseur', () => {
  assert.deepEqual([...formatsAt('- **ab** c', 5)].sort(), ['bold', 'bullet']);
  assert.deepEqual([...formatsAt('- **ab** c', 9)], ['bullet']);
  assert.deepEqual([...formatsAt('# T\n*x*', 5)], ['italic']);
  assert.deepEqual([...formatsAt('', 0)], []);
});

// --- Affichage, avec un faux document (aucun navigateur ici) ---

// Faux éléments : ce que renderNoteText et sourceOffset utilisent
function fakeH(tag, attrs = {}, ...children) {
  const el = {
    nodeType: 1, tagName: tag, attrs: {}, childNodes: [], parentNode: null,
    getAttribute: (name) => (name in el.attrs ? el.attrs[name] : null),
    append(...kids) {
      for (const kid of kids.flat(Infinity)) {
        if (kid === null || kid === undefined || kid === false) continue;
        const node = typeof kid === 'string' ? { nodeType: 3, data: kid, parentNode: null } : kid;
        node.parentNode = el;
        el.childNodes.push(node);
      }
    },
  };
  for (const [name, value] of Object.entries(attrs)) if (value !== null && value !== undefined) el.attrs[name] = String(value);
  el.append(...children);
  return el;
}
const fakeIcon = (name) => fakeH('svg', { 'data-icon': name });
const textOf = (node) => (node.nodeType === 3 ? node.data : node.childNodes.map(textOf).join(''));
const all = (nodes) => nodes.flatMap((node) => (node.nodeType === 1 ? [node, ...all(node.childNodes)] : []));
const texts = (nodes) => nodes.flatMap((node) => (node.nodeType === 3 ? [node] : texts(node.childNodes)));

const SAMPLE = '# Programme\n**Du 11 au 18 juillet**, gîte.\n==Clés==\n## À emporter\n- [x] Les vélos\n- [ ] Les cerfs-volants\n- Crème solaire\n1. Un\nMarées : [horaires](https://maree.info/erquy)\n\n<b>fin</b>';

test('affichage : éléments et textes seulement (h fournie), titres, listes, cases, lien', () => {
  const nodes = renderNoteText(SAMPLE, { h: fakeH, icon: fakeIcon, editable: true });
  const tags = nodes.map((n) => n.tagName);
  assert.deepEqual(tags, ['h2', 'div', 'div', 'h3', 'ul', 'ul', 'ol', 'div', 'div', 'div']);
  assert.equal(textOf(nodes[0]), 'Programme');
  // Le texte « <b>fin</b> » est un texte, pas un élément
  assert.equal(textOf(nodes.at(-1)), '<b>fin</b>');
  assert.ok(!all(nodes).some((el) => el.tagName === 'b'));
  // Cases : boutons (modifiable), cochée barrée par sa classe is-done
  const boxes = all(nodes).filter((el) => /nf-task__box/.test(el.attrs.class ?? ''));
  assert.deepEqual(boxes.map((b) => [b.tagName, b.attrs['aria-checked'], b.attrs.role]), [['button', 'true', 'checkbox'], ['button', 'false', 'checkbox']]);
  assert.equal(boxes[0].attrs['aria-label'], 'Les vélos');
  assert.match(boxes[0].parentNode.attrs.class, /is-done/);
  // Liste numérotée : numéro tel qu'écrit
  assert.equal(nodes[6].childNodes[0].attrs.value, '1');
  // Lien : http(s), nouvel onglet, rel
  const link = all(nodes).find((el) => el.tagName === 'a');
  assert.deepEqual([link.attrs.href, link.attrs.target, link.attrs.rel, textOf(link)], ['https://maree.info/erquy', '_blank', 'noopener noreferrer', 'horaires']);
  // Surligné : <mark>
  assert.ok(all(nodes).some((el) => el.tagName === 'mark' && textOf(el) === 'Clés'));
});

test('affichage en lecture seule (Lecture seule, page publique) : cases montrées, jamais cliquables', () => {
  const nodes = renderNoteText(SAMPLE, { h: fakeH, icon: fakeIcon, editable: false, rel: 'noopener noreferrer nofollow' });
  const boxes = all(nodes).filter((el) => /nf-task__box/.test(el.attrs.class ?? ''));
  assert.deepEqual(boxes.map((b) => [b.tagName, b.attrs['aria-disabled']]), [['span', 'true'], ['span', 'true']]);
  assert.ok(!all(nodes).some((el) => el.tagName === 'button'));
  assert.equal(all(nodes).find((el) => el.tagName === 'a').attrs.rel, 'noopener noreferrer nofollow');
});

test('une note sans marque s\'affiche ligne par ligne, texte identique', () => {
  const body = 'Portail : 4512B\n\nAlarme : 0815';
  const nodes = renderNoteText(body, { h: fakeH, icon: fakeIcon });
  assert.deepEqual(nodes.map((n) => [n.tagName, n.attrs.class]), [['div', 'nf-line'], ['div', 'nf-line'], ['div', 'nf-line']]);
  assert.deepEqual(nodes.map(textOf), ['Portail : 4512B', '', 'Alarme : 0815']);
  assert.equal(nodes[1].childNodes[0].tagName, 'br', 'ligne vide : garde sa hauteur');
});

test('sélection ou appui dans l\'affichage → position dans le texte (marques comprises)', () => {
  const nodes = renderNoteText(SAMPLE, { h: fakeH, icon: fakeIcon, editable: true });
  // Chaque texte affiché se retrouve à sa place dans le texte de la note
  for (const node of texts(nodes)) {
    const at = sourceOffset(node, 0);
    if (node.parentNode.attrs['data-at'] === undefined) continue; // (contenu d'un bouton : aucun)
    assert.equal(SAMPLE.slice(at, at + node.data.length), node.data, node.data);
  }
  const find = (text) => texts(nodes).find((n) => n.data === text);
  // « Programme » : après « # »
  assert.equal(sourceOffset(find('Programme'), 3), SAMPLE.indexOf('Programme') + 3);
  // Sélection de « 11 au » dans le gras, puis gras retiré sur cette partie : le texte source est visé
  const bold = find('Du 11 au 18 juillet');
  const a = sourceOffset(bold, 3);
  const b = sourceOffset(bold, 8);
  assert.equal(SAMPLE.slice(a, b), '11 au');
  assert.equal(applyFormat(SAMPLE, a, b, 'highlight').text.split('\n')[1], '**Du ==11 au== 18 juillet**, gîte.');
  // Texte du lien : dans les crochets
  const link = find('horaires');
  assert.equal(SAMPLE.slice(sourceOffset(link, 0), sourceOffset(link, 8)), 'horaires');
  // Endroit sur un élément (pas un texte) : le début ou la fin du texte de la ligne
  const li = all(nodes).find((el) => el.tagName === 'li');
  assert.equal(sourceOffset(li, 0), SAMPLE.indexOf('Les vélos'));
  assert.equal(sourceOffset(li, li.childNodes.length), SAMPLE.indexOf('Les vélos') + 'Les vélos'.length);
  // Ligne vide : sa position
  const empty = nodes.find((n) => n.tagName === 'div' && textOf(n) === '');
  assert.equal(sourceOffset(empty, 0), SAMPLE.indexOf('\n\n') + 1);
  assert.equal(sourceOffset(null, 0), null);
});

// --- Écrans (lecture du code, comme les autres tests d'écrans) ---


const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

test('écran d\'une note : barre pour qui peut modifier, cases cochables seulement pour lui, même enregistrement qu\'une frappe', () => {
  const note = code('public/js/screens/note.js');
  // Barre cachée en « Lecture seule » et pour une note supprimée
  assert.match(note, /tools\.el\.hidden = readOnly\(\) \|\| \(!isNew && \(!n \|\| Boolean\(n\.deletedAt\)\)\);/);
  // Rien ne change en « Lecture seule » (bouton, case, lien)
  assert.match(note, /function pick\(kind\) \{\s*if \(readOnly\(\)\) return;/);
  assert.match(note, /function tick\(box\) \{\s*if \(readOnly\(\)\) return;/);
  assert.match(note, /onInsert: \(text, address\) => \{\s*if \(readOnly\(\)\) return;/);
  // Cases : boutons seulement si la note est modifiable
  assert.match(note, /renderNoteText\(body, \{ h, icon, editable: !readOnly\(\) \}\)/);
  // Chaque changement passe par changed() : enregistrement automatique (version, file hors ligne, conflits)
  for (const fn of ['pick', 'tick']) {
    const start = note.indexOf(`function ${fn}(`);
    assert.ok(note.slice(start, note.indexOf('\n  }\n', start)).includes('changed();'), fn);
  }
  // Téléphone : la barre en bas (posée sur le clavier) ; ordinateur : en haut du texte
  assert.match(note, /tools\.el\.classList\.add\(pc \? 'note-tools--top' : 'note-tools--dock'\);/);
  assert.match(note, /h\('div', \{ class: 'note-edit' \}, titleInput, labelsRow, pc \? tools\.el : null, view, input\)/);
  // Le champ garde data-fit-keyboard : l'application se cale sur le clavier, la barre avec
  assert.match(note, /class: 'note-edit__body note-edit__body--input', maxlength: String\(NOTE_BODY_MAX\), 'data-fit-keyboard': ''/);
  // Ni innerHTML ni rien d'équivalent dans les fichiers de la mise en forme
  for (const file of ['public/js/note-format.js', 'public/js/screens/note-toolbar.js', 'public/js/screens/note.js', 'public/js/public.js']) {
    assert.doesNotMatch(code(file), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|srcdoc/, file);
  }
});

test('barre : role="toolbar", noms lus en français et en anglais, flèches, aria-pressed', () => {
  const bar = code('public/js/screens/note-toolbar.js');
  assert.match(bar, /role: 'toolbar', 'aria-label': t\('notes\.format\.barre'\)/);
  assert.match(bar, /bar\.addEventListener\('mousedown', \(event\) => event\.preventDefault\(\)\);/);
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(bar.includes(key), key);
  assert.match(bar, /'aria-pressed': kind === 'link' \? null : 'false'/);
  for (const key of ['h1', 'h2', 'gras', 'italique', 'souligne', 'surligne', 'puces', 'numeros', 'case', 'lien']) {
    assert.ok(fr[`notes.format.${key}`] && en[`notes.format.${key}`], key);
  }
  assert.equal(fr['notes.format.gras.court'], 'G');
  assert.equal(en['notes.format.gras.court'], 'B');
  assert.equal(fr['notes.lien.aide'], 'Adresses en http ou https seulement.');
  // Adresse vérifiée avant l'insertion (http et https seulement)
  assert.match(bar, /if \(!linkAddress\(address\.value\)\) \{\s*error\.show\(t\('notes\.lien\.invalide'\), address\);\s*return;\s*\}/);
});

test('page publique d\'une note : mise en forme, cases jamais cochables, liens nofollow', () => {
  const pub = code('public/js/public.js');
  assert.match(pub, /renderNoteText\(note\.body, \{ h, icon, editable: false, rel: 'noopener noreferrer nofollow' \}\)/);
  assert.ok(!pub.includes('nf-task__box'), 'aucun écouteur de case sur la page publique');
});

test('kit : section 16.33 identique dans design/ et public/, fichiers gardés hors ligne', () => {
  const kit = read('public/css/listo.css');
  const section = kit.slice(kit.indexOf('/* 16.33 '));
  assert.ok(section.length > 500);
  assert.ok(read('design/listo.css').includes(section.trim()), 'même section dans design/listo.css');
  // Cochée : barrée ET grisée (jamais la couleur seule)
  assert.match(section, /\.nf-task\.is-done \.nf-task__text \{ color: var\(--color-text-2\); text-decoration: line-through; \}/);
  // Couleurs du kit seulement (aucune couleur écrite en dur)
  assert.doesNotMatch(section.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b|rgb\(/);
  const sw = read('public/sw.js');
  for (const file of ['/js/note-format.js', '/js/screens/note-toolbar.js']) assert.ok(sw.includes(`'${file}'`), file);
});
