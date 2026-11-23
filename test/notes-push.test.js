// Notes partagées : notifications push (étape 3 du cadrage
// docs/cadrage-accueil-notes-notifications.md, section 3.9 ; LISTO_PUSH=on).
// « Modifications » : jamais à l'auteur, une seule par note et par personne
// par quart d'heure, rien si la note est déjà lue ; « Partage » à la
// personne ajoutée ; « Couper les notifications de cette note » ; contenu
// neutre par défaut (le titre seulement, jamais le texte), détail au choix,
// langue de chaque destinataire ; droits relus à l'envoi.

import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, setupAdmin, addUser, login } from './helpers.js';
import { fakeDevice, fakePushService } from './push-helpers.js';
import { GROUP_MS, NOTE_QUIET_MS } from '../server/notify.js';

const fixed = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let opCounter = 0;
const opId = () => fixed(800000 + (opCounter += 1));
const NOTE = fixed(1);

// Léa (propriétaire), Marc, Zoé, Paul ; chacun avec un appareil abonné
async function family(t) {
  const push = fakePushService();
  const app = await startTestApp(t, { config: { push: true }, pushRequest: push });
  push.clock = app.clock;
  const people = { guillaume: { client: await setupAdmin(app), id: 1 } };
  for (const [key, name] of [['lea', 'Léa'], ['marc', 'Marc'], ['zoe', 'Zoé'], ['paul', 'Paul']]) {
    const id = await addUser(app.db, { username: key, password: `MotDePasse-${key}` });
    app.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
    const client = app.client();
    await login(client, key, `MotDePasse-${key}`);
    people[key] = { client, id };
  }
  for (const [key, person] of Object.entries(people)) {
    person.device = fakeDevice(`https://fcm.googleapis.com/fcm/send/${key}`, key);
    assert.equal((await person.client.request('PUT', '/api/push/subscription', person.device.subscription)).status, 200);
  }
  const ops = async (who, list) => {
    const res = await people[who].client.post('/api/ops', { ops: list.map((op) => ({ id: opId(), ...op })) });
    assert.ok(res.body.results.every((r) => r.status === 200), JSON.stringify(res.body));
    return res.body.results;
  };
  const inbox = (who) => push.calls.filter((c) => c.endpoint === people[who].device.subscription.endpoint)
    .map((c) => people[who].device.read(c.body).notification);
  const tick = async (ms) => {
    app.clock.now += ms;
    await app.ctx.notify.flushDue();
    await app.ctx.push.idle();
  };
  const version = () => app.db.prepare('SELECT version FROM notes WHERE id = ?').pluck().get(NOTE);
  const edit = (who, body) => ops(who, [{ type: 'note.update', noteId: NOTE, body, baseVersion: version() }]);
  const share = (access) => people.lea.client.request('PUT', `/api/notes/${NOTE}/members`, {
    userIds: Object.keys(access).map((k) => people[k].id),
    access: Object.fromEntries(Object.entries(access).map(([k, v]) => [people[k].id, v])),
  });
  await ops('lea', [{ type: 'note.create', noteId: NOTE, title: 'Vacances', body: 'Code du portail : 4711' }]);
  return { app, push, people, ops, inbox, tick, edit, share };
}

test('partage : la personne ajoutée est prévenue (catégorie « Partage »), dans sa langue ; un changement de droit aussi', async (t) => {
  const f = await family(t);
  f.app.db.prepare("UPDATE users SET locale = 'en' WHERE id = ?").run(f.people.zoe.id);
  assert.equal((await f.share({ marc: 'modification', zoe: 'lecture' })).status, 200);
  await f.app.ctx.push.idle();
  assert.deepEqual(f.inbox('marc').map((n) => [n.title, n.body]), [['Léa a partagé la note « Vacances » avec vous', 'Vous pouvez la modifier.']]);
  assert.deepEqual(f.inbox('zoe').map((n) => [n.title, n.body]), [['Léa shared the note “Vacances” with you', 'Read only.']]);
  assert.ok(f.inbox('marc')[0].navigate.endsWith(`/#/notes/${NOTE}`), 'toucher la notification ouvre la note');
  assert.deepEqual(f.inbox('lea'), [], 'jamais à l\'auteur');
  assert.deepEqual(f.inbox('paul'), []);
  // Droit changé
  await f.share({ marc: 'lecture', zoe: 'lecture' });
  await f.app.ctx.push.idle();
  assert.equal(f.inbox('marc').at(-1).title, 'Votre droit sur la note « Vacances » a changé');
  // Catégorie « Partage » coupée : rien
  await f.people.paul.client.request('PUT', '/api/push/settings', { sharing: false });
  await f.share({ marc: 'lecture', zoe: 'lecture', paul: 'lecture' });
  await f.app.ctx.push.idle();
  assert.deepEqual(f.inbox('paul'), []);
});

test('modifications : jamais à l\'auteur, regroupées une minute puis une seule par quart d\'heure ; contenu neutre, détail au choix', async (t) => {
  const f = await family(t);
  await f.share({ marc: 'modification', zoe: 'lecture' });
  await f.tick(GROUP_MS);
  f.push.calls.length = 0;
  // Marc tape : plusieurs enregistrements en quelques secondes
  await f.edit('marc', 'Code du portail : 4711. Vélos');
  await f.edit('marc', 'Code du portail : 4711. Vélos, crème');
  await f.tick(GROUP_MS - 1000);
  assert.deepEqual(f.inbox('lea'), [], 'pas avant une minute');
  await f.tick(1000);
  assert.deepEqual(f.inbox('lea').map((n) => [n.title, n.body]), [['Marc a modifié la note « Vacances »', undefined]]);
  assert.ok(!JSON.stringify(f.inbox('lea')).includes('4711'), 'contenu neutre : jamais le texte');
  assert.equal(f.inbox('zoe').length, 1, 'lecture seule comprise');
  assert.deepEqual(f.inbox('marc'), [], 'jamais l\'auteur');
  assert.deepEqual(f.inbox('paul'), [], 'jamais une personne sans accès');
  assert.equal(f.inbox('lea')[0].tag, `note-${NOTE}`);
  // Nouvelle modification dans le quart d'heure : attend la fin du quart d'heure
  await f.edit('marc', 'Code du portail : 4711. Vélos, crème, chapeaux');
  await f.tick(5 * 60 * 1000);
  assert.equal(f.inbox('lea').length, 1);
  await f.tick(NOTE_QUIET_MS);
  assert.equal(f.inbox('lea').length, 2);
  // Détail : le début du texte (jamais pour qui ne l'a pas choisi)
  await f.people.lea.client.request('PUT', '/api/push/settings', { detail: true });
  await f.tick(NOTE_QUIET_MS);
  await f.edit('marc', 'Penser aux vélos');
  await f.tick(GROUP_MS);
  assert.deepEqual([f.inbox('lea').at(-1).title, f.inbox('lea').at(-1).body], ['Marc a modifié la note « Vacances »', 'Penser aux vélos']);
  assert.equal(f.inbox('zoe').at(-1).body, undefined);
});

test('modifications : rien si la note est déjà lue, en sourdine, dans la corbeille ou quittée ; la sourdine est propre à chacun', async (t) => {
  const f = await family(t);
  await f.share({ marc: 'modification', zoe: 'lecture', paul: 'lecture' });
  await f.tick(GROUP_MS);
  f.push.calls.length = 0;
  // Zoé coupe les notifications de cette note ; Paul la quitte
  const mute = await f.people.zoe.client.request('PUT', `/api/push/note-mutes/${NOTE}`, { muted: true });
  assert.deepEqual(mute.body, { mutedNotes: [NOTE] });
  assert.deepEqual((await f.people.zoe.client.get('/api/push')).body.mutedNotes, [NOTE]);
  assert.deepEqual((await f.people.lea.client.get('/api/push')).body.mutedNotes, [], 'la sourdine de Zoé n\'est pas celle de Léa');
  assert.equal((await f.people.guillaume.client.request('PUT', `/api/push/note-mutes/${NOTE}`, { muted: true })).status, 404, 'Admin : comme une note inconnue');
  assert.equal((await f.people.zoe.client.request('PUT', `/api/push/note-mutes/${NOTE}`, { muted: 'oui' })).status, 400);
  assert.equal((await f.people.paul.client.post(`/api/notes/${NOTE}/leave`)).status, 200);
  await f.edit('marc', 'Nouveau code : 9000');
  // Léa ouvre la note avant l'envoi : déjà lue, rien
  await f.ops('lea', [{ type: 'note.seen', noteId: NOTE, upTo: 2 }]);
  await f.tick(GROUP_MS);
  assert.deepEqual([f.inbox('lea'), f.inbox('zoe'), f.inbox('paul')], [[], [], []]);
  // Dans la corbeille : plus rien pour les membres
  await f.tick(NOTE_QUIET_MS);
  await f.edit('lea', 'Texte de Léa');
  await f.ops('lea', [{ type: 'note.delete', noteId: NOTE }]);
  await f.tick(GROUP_MS);
  assert.deepEqual(f.inbox('marc'), []);
  // Réactiver : de nouveau des notifications
  await f.ops('lea', [{ type: 'note.restore', noteId: NOTE }]);
  await f.people.zoe.client.request('PUT', `/api/push/note-mutes/${NOTE}`, { muted: false });
  await f.tick(NOTE_QUIET_MS);
  await f.edit('marc', 'Encore');
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('zoe').length, 1);
  assert.equal(f.inbox('lea').length, 1);
});

test('modifications : plafond de 30 notifications par personne et par heure, notes comprises', async (t) => {
  const f = await family(t);
  // Léa ne reçoit pas les « Partage » ici : seules les modifications comptent
  await f.people.lea.client.request('PUT', '/api/push/settings', { sharing: false });
  const notes = Array.from({ length: 31 }, (_, i) => fixed(100 + i));
  await f.ops('marc', notes.map((noteId) => ({ type: 'note.create', noteId, title: 'Note', body: 'x' })));
  for (const noteId of notes) {
    assert.equal((await f.people.marc.client.request('PUT', `/api/notes/${noteId}/members`, { userIds: [f.people.lea.id], access: { [f.people.lea.id]: 'modification' } })).status, 200);
  }
  await f.ops('marc', notes.map((noteId) => ({ type: 'note.update', noteId, body: 'y', baseVersion: 1 })));
  await f.tick(GROUP_MS);
  assert.equal(f.inbox('lea').length, 30, 'la 31e attend l\'heure suivante… et n\'est pas envoyée');
});
