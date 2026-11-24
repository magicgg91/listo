// Notes, partage (étape 3) : écrans du téléphone et de l'ordinateur, page
// publique d'une note, vérifiés par lecture du code (comme les autres
// écrans) : boutons et menus selon le droit, lecture seule, nouveautés,
// sourdines, page publique sûre, textes en français et en anglais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { emptyState, applyOp, canEditNote, isNoteOwner, notePeople, isNoteUnread } from '../public/js/store.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

test('carte d\'une note partagée : nouveautés (icône ET texte), « Lecture seule » (œil), lien public, pastilles des personnes', () => {
  const notes = code('public/js/screens/notes.js');
  assert.match(notes, /unread \? h\('span', \{ class: 'news-badge news-badge--dot', role: 'img', 'aria-label': t\('notes\.carte\.nouveautes'\)/);
  assert.match(notes, /unread && note\.updatedByName \? h\('span', \{ class: 'note-card__news' \}, t\('notes\.carte\.modifieePar', \{ name: note\.updatedByName \}\)\)/);
  assert.match(notes, /readOnly \? h\('span', \{ class: 'chip chip--readonly' \}, icon\('eye', 'icon--xs'\), t\('notes\.carte\.lectureSeule'\)\)/);
  assert.match(notes, /'aria-label': t\('notes\.carte\.partagee', \{ names: namesList\(people\.map\(\(m\) => m\.displayName\)\) \}\)/);
  assert.equal(fr['notes.carte.modifieePar'], 'Modifiée par {name}');
  assert.equal(fr['notes.carte.lectureSeule'], 'Lecture seule');
});

test('menu d\'une note selon le droit : Partager (propriétaire), Personnes et Quitter (les autres), sourdines', () => {
  const notes = code('public/js/screens/notes.js');
  // Une seule entrée (24 novembre 2026) : « Partager » ouvre le choix des
  // personnes ou du lien temporaire ; plus d'entrée « Lien public » à part
  assert.match(notes, /\(owner \|\| shared\) && !note\.deletedAt \? sharing\(note, owner, withPeople\) : null,/);
  assert.match(notes, /const entry = shareEntry\(\{ owner, withPeople \}\);\s*return entry \? \{ \.\.\.entry, onSelect: \(\) => openNoteShare\(note\.id\) \} : null;/);
  assert.doesNotMatch(notes, /lienPublic'\), onSelect|openNoteLinkSheet/);
  assert.match(notes, /\? \{ icon: 'trash', label: t\('notes\.menu\.supprimer'\), danger: true, separated: true, onSelect: \(\) => askDelete\(note, onDeleted\) \}\s*: \{ icon: 'logout', label: t\('notes\.menu\.quitter'\), danger: true, separated: true, onSelect: \(\) => askLeave\(note, onDeleted\) \},/);
  assert.match(notes, /shared \? newsMuteItem\(note\) : null,\s*shared \? pushMuteItem\(note\) : null,/);
  // Notifications : toujours (étape 4 : la sourdine vaut aussi pour la
  // page Notifications, même sans LISTO_PUSH)
  assert.match(notes, /function pushMuteItem\(note\) \{\s*const muted = isNotePushMuted\(note\.id\);/);
  // Supprimer une note partagée : la confirmation dit qu'elle disparaît pour tout le monde
  assert.match(notes, /text: notePeople\(note\)\.length \? t\('notes\.supprimer\.texte\.partagee'\) : t\('notes\.supprimer\.texte'\),/);
  assert.match(fr['notes.supprimer.texte.partagee'], /disparaît pour tout le monde/);
  // Quitter : en ligne seulement, avec confirmation
  assert.match(notes, /if \(!navigator\.onLine\) \{\s*toast\(t\('notes\.quitter\.horsLigne'\)\);/);
  // Libellés courts (24 novembre 2026) : le menu porte le nom de la note
  for (const key of ['notes.menu.nouveautes.masquer', 'notes.menu.nouveautes.afficher', 'notes.menu.notifications.couper', 'notes.menu.notifications.reactiver', 'notes.menu.quitter']) {
    assert.doesNotMatch(fr[key], /note/, key);
  }
});

test('écran d\'une note : « Partager » ou « Personnes » avec les pastilles ; lecture seule sans saisie ; lue à l\'ouverture', () => {
  const note = code('public/js/screens/note.js');
  assert.match(note, /const word = owner \? t\('notes\.personnes\.partager'\) : t\('notes\.personnes\.voir'\);/);
  // Téléphone : icône et pastilles, le mot dans le nom lu ; ordinateur : le mot écrit
  assert.match(note, /replace\(peopleButton, icon\('users', 'icon--sm'\), pc \? word : null,/);
  // Lecture seule : ni saisie, ni enregistrement ; titre non modifiable
  assert.match(note, /const edit = \(at, y = null\) => \{\s*if \(!input\.hidden \|\| readOnly\(\)\) return;/);
  assert.match(note, /function changed\(\) \{\s*if \(readOnly\(\)\) return;/);
  assert.match(note, /titleInput\.readOnly = readOnly\(\);/);
  // Ouverte et visible : lue (Nouveautés) ; bas de la note « Modifiée par Léa · il y a 5 min »
  assert.match(note, /if \(n && !n\.deletedAt && document\.visibilityState === 'visible'\) actions\.markNoteSeen\(n\.id\);/);
  assert.match(note, /t\('notes\.pied\.autre', \{ name: n\.updatedByName \?\? '', when: relativeTime\(n\.updatedAt\) \}\)/);
  assert.equal(fr['notes.pied.autre'], 'Modifiée par {name} · {when}');
  assert.equal(fr['notes.bandeau.autre'], '{name} vient de modifier cette note');
});

test('copie locale : droits, personnes et nouveautés des notes (même règle que le serveur)', () => {
  assert.equal(canEditNote({ access: 'owner' }), true);
  assert.equal(canEditNote({ access: 'edit' }), true);
  assert.equal(canEditNote({ access: 'read' }), false);
  assert.equal(isNoteOwner({ access: 'edit' }), false);
  const members = [{ id: 2, displayName: 'Zoé', isOwner: false, active: true }, { id: 1, displayName: 'Léa', isOwner: true, active: true }];
  assert.deepEqual(notePeople({ members }).map((m) => m.id), [1, 2], 'le propriétaire d\'abord');
  assert.deepEqual(notePeople({ members: [members[1]] }), [], 'partagée avec personne');
  // Une note créée sur ce téléphone : à moi, avec moi seul comme personne
  const state = emptyState();
  applyOp(state, { id: 'o1', type: 'note.create', noteId: 'n1', title: 'A', body: '' }, { user: { id: 1, displayName: 'Léa' }, now: 'x' });
  assert.deepEqual(state.notes.get('n1').members, [{ id: 1, displayName: 'Léa', active: true, isOwner: true, access: 'modification' }]);
  // Nouveautés : sourdine et modification de ma part les effacent
  state.noteNews.unread.add('n1');
  assert.equal(isNoteUnread(state, 'n1'), true);
  applyOp(state, { id: 'o2', type: 'note.mute', noteId: 'n1', muted: true }, { user: { id: 1 }, now: 'x' });
  assert.equal(isNoteUnread(state, 'n1'), false);
  assert.ok(state.noteNews.muted.has('n1'));
});

test('partage d\'une note : même choix que les listes, même feuille du lien public (textes qui disent « la note »)', () => {
  const panel = code('public/js/screens/share-panel.js');
  assert.match(panel, /export const openNoteShare = \(noteId\) => openShare\(noteSubject\(noteId\)\);/);
  assert.match(panel, /url: `\/api\/notes\/\$\{encodeURIComponent\(noteId\)\}\/members`,/);
  assert.match(panel, /link: \(note, close\) => noteLinkPart\(note, close\),/);
  assert.match(panel, /owner: \(note\) => isNoteOwner\(note\),/);
  const share = code('public/js/screens/share.js');
  assert.match(share, /url: `\/api\/notes\/\$\{encodeURIComponent\(note\.id\)\}\/share`,/);
  for (const key of ['notes.partage.lienActif', 'notes.partage.creation.texte', 'notes.partage.motDePasse.retirer.texte', 'notes.partage.sansMotDePasse']) {
    assert.match(fr[key], /(la|cette) note/, key);
    assert.ok(en[key], key);
  }
  assert.equal(fr['partage.droit.choix.note'], 'Droit de {name} sur la note');
  assert.equal(fr['partage.choix.aide.note'], 'Les personnes de Listo voient et modifient la note selon leur droit. Le lien donne une lecture seule, sans compte.');
});

test('page publique d\'une note : textContent et <a> seulement (http, https), nouvel onglet, rien d\'autre que titre, texte et date', () => {
  const pub = code('public/js/public.js');
  assert.doesNotMatch(pub, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(pub, /const isNotePage = root\.dataset\.kind === 'note';/);
  // Texte mis en forme (24 novembre 2026) : éléments construits par
  // note-format.js, cases jamais cochables, liens rel « nofollow »
  assert.match(pub, /renderNoteText\(note\.body, \{ h, icon, editable: false, rel: 'noopener noreferrer nofollow' \}\)/);
  assert.match(pub, /function showNote\(\{ note, expiresAt \}\) \{/);
  for (const lang of ['', 'en/']) {
    const page = read(`server/pages/${lang}lien-note.html`);
    assert.match(page, /<div class="app" id="app" data-kind="note">/);
    assert.match(page, /<script type="module" src="\/js\/public\.js"><\/script>/);
    assert.doesNotMatch(page.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, ''), /<script|style=/, 'aucun script ni style écrit dans la page (CSP)');
  }
});

test('textes du partage des notes : en français et en anglais, mêmes noms et mêmes emplacements', () => {
  const keys = Object.keys(fr).filter((key) => /^(notes\.(menu|carte|personnes|partage|quitter|nouveautes|notifications|nav|tuile|corbeille\.partagee|statut\.lectureSeule|supprimer\.texte\.partagee)|alertes\.note|lienpublic\.note|ops\.(proprietaireNePeutPasQuitterNote|proprietaireTousDroitsNote|droitSansPartageNote|repereLectureNoteInvalide|reglageSourdineNoteInvalide)|liens\.dejaActifNote)/.test(key));
  assert.ok(keys.length >= 50, String(keys.length));
  const slots = (value) => JSON.stringify(value).match(/\{\w+\}/g)?.sort() ?? [];
  for (const key of keys) {
    assert.ok(en[key], `${key} manque en anglais`);
    assert.deepEqual(slots(en[key]), slots(fr[key]), key);
  }
});

test('service worker : nouvelle version (fichiers changés)', () => {
  assert.match(read('public/sw.js'), /const VERSION = `v1(4[2-9]|[5-9]\d)-/);
});

test('choix « Partager » sur le téléphone : le groupe des deux lignes n\'est jamais tassé dans la feuille du bas', () => {
  // La feuille du bas est une colonne flexible qui défile : sans flex-shrink: 0,
  // un groupe (overflow: hidden) était ramené à sa hauteur minimale
  assert.match(read('public/js/screens/share-panel.js'), /h\('div', \{ class: 'group share-choice sheet__keep' \},/);
  assert.match(read('public/css/app.css'), /^\.sheet > \.sheet__keep \{ flex-shrink: 0; \}$/m);
});
