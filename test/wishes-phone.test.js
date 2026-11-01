// Listes d'envies côté téléphone : la copie locale ne garde que les
// réservations envoyées par le serveur (jamais celles d'une liste dont le
// compte est bénéficiaire, puisqu'il ne les reçoit pas) ; l'écran ne montre
// une réservation que si elle est dans cette copie ; lien sûr ; formulaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyState, loadSync, mergeSync, toSnapshot, fromSnapshot, computeListView, SNAPSHOT_VERSION } from '../public/js/store.js';
import { beneficiaryId, seesReservations, isManager, mayMarkReceived, wishForLabel } from '../public/js/wishes.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const code = (file) => read(file).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

const base = (reservations) => ({
  serverTime: '2026-11-01T10:00:00.000Z',
  listIds: ['L'],
  lists: [{ id: 'L', name: 'Noël de Léa', type: 'wishes', forUserId: 2, forName: null, forDisplayName: 'Léa', isBeneficiary: false, isOwner: true, canEdit: true, members: [], updatedAt: 'x', deletedAt: null }],
  items: [{ id: 'v', listId: 'L', name: 'Vélo', quantity: '', note: '', link: 'https://exemple.fr/velo', priceCents: 24990, checked: false, updatedAt: 'x', deletedAt: null }],
  stores: [], aisles: [], history: [], users: [],
  ...(reservations === undefined ? {} : { reservations }),
});

test('copie locale : réservations telles que reçues, remplacées à chaque synchronisation ; rien reçu = rien gardé', () => {
  const viewer = loadSync(emptyState(), base({ L: [{ itemId: 'v', userId: 3, displayName: 'Marie' }] }));
  assert.deepEqual(computeListView(viewer, 'L').reservations.get('v'), { itemId: 'v', userId: 3, displayName: 'Marie' });
  // Libération : la synchronisation suivante renvoie la liste vide
  mergeSync(viewer, base({ L: [] }));
  assert.equal(computeListView(viewer, 'L').reservations.size, 0);
  // Bénéficiaire : le serveur n'envoie rien pour sa liste
  const beneficiary = loadSync(emptyState(), base({}));
  assert.equal(computeListView(beneficiary, 'L').reservations, null);
  const snapshot = toSnapshot(beneficiary, 'x');
  assert.equal(SNAPSHOT_VERSION, 3);
  assert.deepEqual(snapshot.reservations, {});
  assert.equal(JSON.stringify(snapshot).includes('Marie'), false);
  assert.deepEqual(fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(viewer, 'x')))).reservations, { L: [] });
  assert.equal(fromSnapshot({ ...snapshot, version: 2 }), null, 'copie d\'avant les envies : rechargée');
});

test('règles partagées : bénéficiaire, gestionnaire, « reçu »', () => {
  const forLea = { ownerId: 1, forUserId: 2, forName: null };
  const forMe = { ownerId: 1, forUserId: null, forName: null };
  const forLucas = { ownerId: 1, forUserId: null, forName: 'Lucas' };
  assert.deepEqual([beneficiaryId(forLea), beneficiaryId(forMe), beneficiaryId(forLucas)], [2, 1, null]);
  assert.deepEqual([seesReservations(2, forLea), seesReservations(1, forLea), seesReservations(3, forLea)], [false, true, true]);
  assert.deepEqual([seesReservations(1, forMe), seesReservations(3, forMe)], [false, true]);
  assert.deepEqual([seesReservations(1, forLucas), seesReservations(3, forLucas)], [true, true]);
  assert.deepEqual([isManager(1, forLea), isManager(1, forMe), isManager(1, forLucas), isManager(3, forLea)], [true, false, true, false]);
  assert.deepEqual([mayMarkReceived(2, forLea), mayMarkReceived(1, forLea), mayMarkReceived(3, forLea), mayMarkReceived(3, forLucas)], [true, true, false, false]);
  assert.equal(wishForLabel({ isBeneficiary: true }), 'Pour vous');
  assert.equal(wishForLabel({ forDisplayName: 'Léa' }), 'Pour Léa');
  assert.equal(wishForLabel({ forName: 'Lucas' }), 'Pour Lucas');
  assert.equal(wishForLabel({ members: [{ isOwner: true, displayName: 'Guillaume' }] }), 'Pour Guillaume');
});

test('écran : réservation montrée seulement si la copie en contient ; lien sûr ; boutons de 44 px ; aucun innerHTML', () => {
  const list = code('public/js/screens/list.js');
  assert.match(list, /const reservation = view\?\.reservations\?\.get\(item\.id\);/);
  assert.match(list, /function reservationBlock\(item\) \{\s*if \(!view\?\.reservations\) return null;/);
  assert.match(list, /h\('a', \{ class: 'btn btn--secondary btn--sm', href: safe, target: '_blank', rel: 'noopener noreferrer' \}/);
  assert.match(list, /const safe = cleanLink\(link \?\? ''\);/);
  // Réservation : en ligne seulement (jamais par la file d'attente)
  assert.match(list, /disabled: busy \|\| offline,/);
  assert.match(read('public/js/actions.js'), /await post\(`\/api\/items\/\$\{encodeURIComponent\(itemId\)\}\/reservation`\);/);
  assert.doesNotMatch(read('public/js/actions.js'), /type: 'item\.reserve'|reservation.*perform\(/);
  // Boutons pleine largeur (.btn, 44 px du kit)
  assert.match(read('public/css/listo.css'), /\.btn \{[^}]*min-height: var\(--tap\);/);
  assert.match(read('public/css/listo.css'), /\.btn--sm \{ min-height: var\(--tap-min\);/);
  for (const file of ['public/js/screens/list.js', 'public/js/screens/list-form.js', 'public/js/wishes.js']) {
    assert.doesNotMatch(code(file), /innerHTML|insertAdjacentHTML|outerHTML/, file);
  }
  // Formulaire : « Pour qui ? » seulement pour les envies, fixé ensuite
  const form = code('public/js/screens/list-form.js');
  assert.match(form, /forField\.hidden = !isWishList\(listType\);/);
  assert.match(form, /h\('span', \{ class: 'share__hint' \}, 'Destinataire · Peut modifier'\)/);
  assert.match(read('public/js/list-types.js'), /export const WISHES_LOCKED_HINT = 'Le type et la personne à qui la liste est destinée sont fixés à sa création\.';/);
  assert.doesNotMatch(read('public/js/list-types.js').match(/WISHES_LOCKED_HINT = '[^']*'/)[0], /réserv/i, 'la phrase ne parle pas des réservations');
  // Service worker : nouveau fichier gardé hors ligne
  assert.ok(read('public/sw.js').includes("'/js/wishes.js'"));
});
