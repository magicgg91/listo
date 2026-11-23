// Page Notifications (étape 4) côté téléphone et ordinateur : copie locale
// (lire, effacer, hors ligne compris), adresse, cloche de l'Accueil,
// écran (ouvrir la page ne marque rien, glissement et menu ⋮, « Tout
// effacer » avec confirmation), réglages communs à la page et au
// téléphone, textes en français et en anglais, kit de design, fichiers du
// service worker. Comme les autres écrans : fonctions pures exécutées,
// écrans vérifiés par lecture du code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../public/js/i18n/fr.js';
import en from '../public/js/i18n/en.js';
import { translate } from '../public/js/i18n.js';
import { emptyState, applyOp, loadInbox, inboxUnread, inboxRowsFor, inboxTargetAvailable, toSnapshot, fromSnapshot } from '../public/js/store.js';
import { matchRoute, pathFor } from '../public/js/router.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

const LIST = 'l-1';
const NOTE = 'n-1';
function withRows() {
  const state = emptyState();
  state.loaded = true;
  state.lists.set(LIST, { id: LIST, name: 'Courses' });
  state.items.set('i-1', { id: 'i-1', listId: LIST, name: 'Lait' });
  state.notes.set(NOTE, { id: NOTE, title: 'Vacances', deletedAt: null });
  loadInbox(state, {
    stamp: 's1',
    rows: [
      { id: 4, at: '2026-11-23T10:42:00.000Z', read: false, text: 'Léa a ajouté 4 articles dans « Courses »', target: { type: 'list', listId: LIST } },
      { id: 3, at: '2026-11-23T09:00:00.000Z', read: false, text: 'Dentiste à 9:15', target: { type: 'item', itemId: 'i-1', listId: LIST } },
      { id: 2, at: '2026-11-23T08:00:00.000Z', read: false, text: '3 tâches', target: { type: 'deadlines' } },
      { id: 1, at: '2026-11-22T16:05:00.000Z', read: true, text: 'Zoé a modifié la note', target: { type: 'note', noteId: NOTE } },
    ],
  });
  return state;
}

test('copie locale : lire et effacer comme le serveur (ids, ou « tout » jusqu\'à une date) ; non lues ; gardée sur le téléphone', () => {
  const state = withRows();
  assert.equal(inboxUnread(state), 3);
  const now = '2026-11-23T11:00:00.000Z';
  applyOp(state, { type: 'inbox.read', ids: [3] }, { now });
  assert.equal(inboxUnread(state), 2);
  applyOp(state, { type: 'inbox.read', all: true, upTo: '2026-11-23T09:30:00.000Z' }, { now });
  assert.deepEqual(state.inbox.rows.map((r) => r.read), [false, true, true, true], 'une ligne plus récente que upTo reste non lue');
  applyOp(state, { type: 'inbox.delete', ids: [1] }, { now });
  assert.deepEqual(state.inbox.rows.map((r) => r.id), [4, 3, 2]);
  applyOp(state, { type: 'inbox.delete', all: true, upTo: '2026-11-23T09:00:00.000Z' }, { now });
  assert.deepEqual(state.inbox.rows.map((r) => r.id), [4]);
  // Gardée sur le téléphone (IndexedDB) ; une copie d'avant l'étape 4 : vide, à relire
  const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state))));
  assert.deepEqual(back.inbox, { rows: state.inbox.rows, stamp: 's1', loaded: true });
  const old = toSnapshot(state);
  delete old.inbox;
  assert.deepEqual(fromSnapshot(old).inbox, { rows: [], stamp: null, loaded: false });
});

test('ouvrir une liste, une note ou Échéances : les lignes non lues qui les visent ; cible encore ouverte sur ce téléphone ?', () => {
  const state = withRows();
  assert.deepEqual(inboxRowsFor(state, { listId: LIST }), [4, 3], 'la liste et ses éléments');
  assert.deepEqual(inboxRowsFor(state, { deadlines: true }), [2]);
  assert.deepEqual(inboxRowsFor(state, { noteId: NOTE }), [], 'déjà lue');
  assert.deepEqual(inboxRowsFor(state, { listId: 'autre' }), []);
  assert.equal(inboxTargetAvailable(state, { type: 'list', listId: LIST }), true);
  assert.equal(inboxTargetAvailable(state, { type: 'item', itemId: 'i-1', listId: LIST }), true);
  assert.equal(inboxTargetAvailable(state, { type: 'note', noteId: NOTE }), true);
  assert.equal(inboxTargetAvailable(state, { type: 'deadlines' }), true);
  assert.equal(inboxTargetAvailable(state, null), false, 'cible perdue (le serveur ne la donne plus)');
  state.lists.delete(LIST);
  state.notes.set(NOTE, { id: NOTE, deletedAt: '2026-11-23T00:00:00.000Z' });
  assert.equal(inboxTargetAvailable(state, { type: 'list', listId: LIST }), false, 'liste quittée');
  assert.equal(inboxTargetAvailable(state, { type: 'item', itemId: 'i-1', listId: LIST }), false);
  assert.equal(inboxTargetAvailable(state, { type: 'note', noteId: NOTE }), false, 'note dans la corbeille');
});

test('adresses : #/notifications (la page), #/reglages/notifications (les réglages, inchangés)', () => {
  assert.deepEqual(matchRoute('#/notifications'), { name: 'inbox', params: {} });
  assert.deepEqual(matchRoute('#/reglages/notifications'), { name: 'notifications', params: {} });
  assert.equal(pathFor('inbox'), '#/notifications');
  const app = code('public/js/app.js');
  assert.match(app, /case 'inbox': mount\(\(onLeave\) => renderInbox\(onLeave\)\); break;/);
  // Page reçue quand l'empreinte de la synchronisation change ; puis la file rejouée
  assert.match(app, /if \(data\.inboxStamp !== undefined && \(data\.inboxStamp !== app\.data\.inbox\.stamp \|\| !app\.data\.inbox\.loaded\)\) \{\s*const page = await get\('\/api\/inbox'\);\s*if \(!app\.user\) return;\s*loadInbox\(app\.data, page\);\s*\}\s*replayQueue\(\);/);
  // Ouvrir une liste, une note ou Échéances les rend lues ; jamais la page elle-même
  assert.match(app, /const scope = route\.name === 'list' \? \{ listId: route\.params\.id \}\s*: route\.name === 'note' \? \{ noteId: route\.params\.id \}\s*: route\.name === 'deadlines' \? \{ deadlines: true \} : null;/);
  // Temps réel : « event: inbox » relance la synchronisation
  assert.match(code('public/js/live.js'), /source\.addEventListener\('inbox', \(\) => scheduleSync\(\)\);/);
  // Pas de bandeau du bas sur la page (maquette notifications-1)
  assert.doesNotMatch(code('public/js/tabbar.js'), /'inbox'/);
});

test('cloche de l\'Accueil (téléphone et ordinateur) : nombre de non lues, « 9+ », nom lu ; tuile Compte vers la page, sans nombre', () => {
  const home = code('public/js/screens/home.js');
  assert.match(home, /export function bellBadgeText\(count\) \{\s*return count > 9 \? '9\+' : String\(count\);\s*\}/);
  assert.match(home, /const button = h\('button', \{ class: 'icon-btn icon-btn--badge', type: 'button', onClick: \(\) => navigate\('inbox'\) \}, icon\('bell'\)\);/);
  assert.match(home, /button\.setAttribute\('aria-label', count \? t\('inbox\.cloche\.nonLues', \{ count \}\) : t\('inbox\.cloche'\)\);/);
  assert.match(home, /h\('span', \{ class: 'icon-btn__badge', 'aria-hidden': 'true' \}, bellBadgeText\(count\)\)/);
  assert.match(home, /h\('div', \{ class: 'pc-head__tools' \}, pill, notifications\.el\)/);
  assert.match(home, /h\('div', \{ class: 'home-head__tools' \}, pill, notifications\.el\)/);
  assert.match(home, /row\(\{ label: t\('accueil\.compte\.notifications'\), onClick: \(\) => navigate\('inbox'\) \}\)/);
  assert.equal(translate('fr', 'inbox.cloche.nonLues', { count: 3 }), 'Notifications, 3 non lues');
  assert.equal(translate('fr', 'inbox.cloche.nonLues', { count: 1 }), 'Notifications, 1 non lue');
  assert.equal(translate('en', 'inbox.cloche.nonLues', { count: 3 }), 'Notifications, 3 unread');
});

test('écran : ouvrir la page ne marque rien ; toucher une ligne la marque lue et ouvre sa cible ; glisser ou ⋮ pour effacer ; « Tout effacer » confirmé', () => {
  const screen = code('public/js/screens/inbox.js');
  // Seuls quatre endroits marquent lu : la ligne touchée, son menu, le
  // glissement vers la droite (non lue seulement), « Tout marquer comme lu »
  assert.equal(screen.match(/markInboxRead\(/g).length, 3);
  assert.match(screen, /swipes\.attach\(item, button, del, unread \? \{ onRight: \(\) => actions\.markInboxRead\(\[row\.id\]\) \} : \{\}\);/);
  assert.match(screen, /export function openRow\(row\) \{\s*actions\.markInboxRead\(\[row\.id\]\);/);
  assert.equal(screen.match(/markAllInboxRead\(/g).length, 1);
  assert.match(screen, /h\('button', \{ class: 'cart__action', type: 'button', hidden: unread === 0, onClick: \(\) => actions\.markAllInboxRead\(\) \}/);
  // Cible disparue : un message, rien ne s'ouvre
  assert.match(screen, /if \(!inboxTargetAvailable\(app\.data, row\.target\)\) \{\s*toast\(unavailableText\(row\)\);\s*return;\s*\}/);
  // Élément : la fiche s'ouvre en arrivant dans sa liste (comme Échéances)
  assert.match(screen, /app\.openItem = \{ listId: target\.listId, itemId: target\.itemId \};\s*navigate\('list', \{ id: target\.listId \}\);/);
  // Non lue : gras, point ET « Non lue » dans le nom lu
  assert.match(screen, /'aria-label': t\(unread \? 'inbox\.ligne\.nonLue' : 'inbox\.ligne', \{ text: row\.text, sub: row\.sub, time \}\)/);
  assert.match(screen, /unread \? h\('span', \{ class: 'inbox-row__dot', 'aria-hidden': 'true' \}\) : null/);
  // Glissement (comme les lignes d'une liste) et bouton ⋮ (menu)
  assert.match(screen, /'inbox-row__more'\);\s*more\.setAttribute\('aria-haspopup', 'menu'\);/);
  assert.match(screen, /\{ icon: 'trash', label: t\('inbox\.effacer'\), danger: true, onSelect: remove \}/);
  // Tout effacer : confirmation d'abord
  assert.match(screen, /const ok = await confirmDialog\(\{[\s\S]*?\}\);\s*if \(!ok\) return;\s*actions\.clearInbox\(\);/);
  // Réglages des notifications : bouton en haut à droite et dans la page vide
  assert.equal(screen.match(/navigate\('notifications'\)/g).length, 1);
  assert.match(screen, /iconButton\('sliders', t\('inbox\.reglages'\), toSettings\)/);
  // Jamais de HTML ; aucun curseur mis tout seul
  assert.doesNotMatch(screen, /innerHTML|outerHTML|insertAdjacentHTML|\.focus\(/);
  // Actions : par la file d'attente ; « Tout… » jusqu'à la ligne la plus récente reçue
  const actions = code('public/js/actions.js');
  assert.match(actions, /return perform\(\{ type: 'inbox\.read', all: true, upTo: newestInbox\(\) \}\);/);
  assert.match(actions, /return perform\(\{ type: 'inbox\.delete', all: true, upTo: newestInbox\(\) \}\);/);
});

test('réglages communs à la page et au téléphone : catégories toujours là, « Contenu » seulement avec LISTO_PUSH ; sourdines toujours ; rappel proposé', () => {
  const screen = code('public/js/screens/notifications.js');
  assert.match(screen, /const accountPart = h\('div', \{\},/);
  assert.match(screen, /for \(const el of detailPart\) el\.hidden = !app\.user\.push;/);
  const push = code('public/js/push.js');
  assert.match(push, /return remember\(await get\(user\.push \? '\/api\/push' : '\/api\/push\/settings'\)\);/);
  assert.doesNotMatch(code('public/js/screens/notes.js'), /app\.user\?\.push/);
  assert.doesNotMatch(code('public/js/screens/list.js'), /app\.user\?\.push/, 'rappel proposé même sans LISTO_PUSH');
  assert.equal(fr['notifications.compte.note'], 'Ces réglages valent pour la page Notifications et pour tous vos appareils.');
  assert.match(fr['notifications.etat.serveurCoupe'], /La page Notifications \(cloche de l'Accueil\) fonctionne quand même\./);
});

test('textes : français et anglais, mêmes noms ; la page Notifications et ses lignes', () => {
  const frKeys = Object.keys(fr).filter((k) => k.startsWith('inbox.'));
  const enKeys = Object.keys(en).filter((k) => k.startsWith('inbox.'));
  assert.deepEqual(enKeys.sort(), frKeys.sort());
  assert.ok(frKeys.length >= 40);
  assert.equal(fr['inbox.vide.titre'], 'Aucune notification');
  assert.equal(fr['inbox.toutLu'], 'Tout marquer comme lu');
  assert.equal(fr['inbox.garde'], 'Les notifications sont gardées 30 jours.');
  assert.equal(translate('fr', 'inbox.nonLues', { count: 3 }), '3 non lues');
  assert.equal(translate('en', 'inbox.nonLues', { count: 3 }), '3 unread');
  assert.equal(fr['inbox.indisponible.liste'], 'Cette liste n\'est plus disponible');
  for (const key of ['ops.inboxInvalide', 'ops.inboxIntrouvable']) assert.ok(fr[key] && en[key], key);
  for (const [key, value] of Object.entries(en).filter(([k]) => k.startsWith('inbox.'))) {
    assert.doesNotMatch(JSON.stringify(value), /«|»/, `${key} : guillemets anglais`);
  }
});

test('kit de design : section 16.29 identique dans design/ et public/, icône « check-double » au sprite ; service worker', () => {
  const section = (file) => read(file).match(/\/\* 16\.29 Page Notifications[\s\S]*?\.inbox-foot__hint \{[^}]*\}/)?.[0];
  assert.ok(section('design/listo.css'));
  assert.equal(section('public/css/listo.css'), section('design/listo.css'));
  assert.doesNotMatch(section('public/css/listo.css'), /#[0-9a-f]{3,6}\b/i, 'couleurs du kit seulement');
  for (const file of ['design/icons-sprite.html', 'public/index.html']) assert.match(read(file), /<symbol id="i-check-double"/, file);
  const sw = read('public/sw.js');
  for (const file of ['/js/screens/inbox.js', '/js/i18n/fr/inbox.js', '/js/i18n/en/inbox.js']) assert.match(sw, new RegExp(`'${file.replace(/\//g, '\\/')}',`), file);
});
