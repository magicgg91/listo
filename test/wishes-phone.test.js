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
  const booked = { itemId: 'v', open: true, participants: [{ userId: 3, displayName: 'Marie' }, { userId: 4, displayName: 'Paul' }] };
  const viewer = loadSync(emptyState(), base({ L: [booked] }));
  assert.deepEqual(computeListView(viewer, 'L').reservations.get('v'), booked);
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
  assert.match(list, /const reservation = item\.checked \? null : view\?\.reservations\?\.get\(item\.id\);/, 'souhait reçu : plus de réservation affichée');
  assert.match(list, /const reservationText = \(reservation\) => `Réservé par \$\{namesList\(participantNames\(reservation\)\)\}`;/);
  assert.match(list, /el\.hidden = !reservations \|\| latest\.checked;/);
  assert.match(list, /function reservationBlock\(item\) \{\s*if \(!view\?\.reservations\) return null;/);
  assert.match(list, /h\('a', \{ class: 'btn btn--secondary btn--sm', href: safe, target: '_blank', rel: 'noopener noreferrer' \}/);
  assert.match(list, /const safe = cleanLink\(link \?\? ''\);/);
  // Réservation : en ligne seulement (jamais par la file d'attente)
  assert.match(list, /disabled: busy \|\| !navigator\.onLine, onClick/);
  assert.match(read('public/js/actions.js'), /await post\(reservationUrl\(itemId\), open === undefined \? \{\} : \{ open \}\);/);
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
  assert.match(read('public/js/list-types.js'), /export const WISHES_LOCKED_HINT = 'Le type et la personne à qui la liste est destinée ne changent plus\.';/);
  assert.doesNotMatch(read('public/js/list-types.js').match(/WISHES_LOCKED_HINT = '[^']*'/)[0], /réserv/i, 'la phrase ne parle pas des réservations');
  // Service worker : nouveau fichier gardé hors ligne
  assert.ok(read('public/sw.js').includes("'/js/wishes.js'"));
});

test('formulaire : une liste de courses ou de tâches peut devenir une liste d\'envies, en ligne seulement, avec « Pour qui ? » et une phrase ; quantité cachée', () => {
  const form = code('public/js/screens/list-form.js');
  // Les trois types pour une liste existante (sauf une liste d'envies, figée)
  assert.match(form, /const offered = wishesLocked \? \['wishes'\] : CREATABLE_TYPES;/);
  assert.match(form, /const converting = \(\) => Boolean\(list\) && !wishesLocked && isWishList\(listType\);/);
  // « Pour qui ? » comme à la création ; prénom obligatoire ; destinataire verrouillé dans le partage
  assert.match(form, /const beneficiaryId = \(\) => \(wishesLocked \? list\.forUserId \?\? null : isWishList\(listType\) && typeof forChoice === 'number' \? forChoice : null\);/);
  assert.match(form, /const forName = \(!list \|\| converting\(\)\) && isWishList\(listType\) && forChoice === 'name' \?/);
  assert.match(form, /forNameField\.setError\(forName === '' \? 'Le prénom est obligatoire' : null\);/);
  // Phrase avant l'enregistrement, avec le lien public s'il y en a un
  assert.match(form, /converting\(\) && hasPublicLink\(list\) \? ' Son lien public sera arrêté\.' : ''/);
  const types = read('public/js/list-types.js');
  assert.match(types, /if \(to === 'wishes'\) return CONVERT_TO_WISHES_WARNING;/);
  const warning = types.match(/CONVERT_TO_WISHES_WARNING = '(\\'|[^'])*'/)[0];
  assert.match(warning, /ne pourra plus changer de type ni de destinataire/);
  assert.match(warning, /Rien n\\'est effacé/);
  assert.doesNotMatch(warning, /réserv/i);
  // En ligne seulement : bouton inactif hors ligne, avec une phrase ; d'abord la conversion, puis le reste
  assert.match(form, /const blocked = converting\(\) && !navigator\.onLine;\s*convertNote\.hidden = !blocked;\s*save\.disabled = busy \|\| blocked;/);
  assert.match(form, /h\('div', \{ class: 'footer' \}, convertNote, save\)/);
  assert.match(form, /if \(pendingCount\(\) \|\| !navigator\.onLine\) throw new Error\('Devenir une liste d\\'envies demande une connexion\.'\);\s*await actions\.convertToWishes\(id, \{/);
  assert.match(form, /error\.show\(errorMessage\(err\)\);\s*busy = false;\s*paintConvert\(\);\s*return;/);
  assert.match(form, /if \(listType !== savedType && !convert\) switches\.listType = listType;/);
  assert.match(read('public/js/actions.js'), /export async function convertToWishes\(listId, body\) \{\s*await post\(`\/api\/lists\/\$\{encodeURIComponent\(listId\)\}\/wishes`, body\);\s*await refreshData\(\{ quiet: true \}\);/);
  // Liste d'envies : pas de quantité affichée (gardée en base)
  const list = code('public/js/screens/list.js');
  assert.match(list, /item\.quantity && !isWishList\(view\?\.list\) \? h\('span', \{ class: 'item__qty' \}, item\.quantity\) : null\)/);
  assert.match(list, /it\.quantity && !wishes \? value\('Quantité', it\.quantity\) : null,/);
});
