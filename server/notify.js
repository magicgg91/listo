// Notifications : QUI reçoit QUOI. Toujours actif (étape 4 du cadrage
// docs/cadrage-accueil-notes-notifications.md, page Notifications) : chaque
// notification passe par UNE seule fonction, deliver(), qui l'écrit dans la
// page Notifications de la personne (server/inbox.js), même sans
// LISTO_PUSH et sans appareil, puis, avec LISTO_PUSH=on et au moins un
// appareil inscrit, l'envoie aussi au téléphone (l'envoi chiffré lui-même
// est dans server/push.js). Mêmes filtres pour les deux (décision du 23
// novembre 2026) : catégorie coupée, liste ou note dont on a coupé les
// notifications : ni page, ni téléphone. La page montre toujours le détail
// (on y est connecté) ; le réglage « détail » ne vaut que pour l'écran
// verrouillé du téléphone. Le plafond de 30 par heure ne vaut que pour le
// téléphone (voir server/inbox.js).
//
// Trois catégories ici (la quatrième, le résumé des échéances, est à part) :
// - a) 'changes' (« Modifications ») : ce que les AUTRES ajoutent, modifient
//   ou cochent dans une liste dont je suis membre ; une tâche qu'ils
//   m'attribuent y est dite en titre (« Léa vous a attribué une tâche »). Point d'entrée unique : le journal des
//   Nouveautés (server/news.js, log), donc l'application, la file d'attente
//   hors ligne et Claude (une action de Claude compte pour le compte qui l'a
//   autorisé). Les décochés et les suppressions ne sont pas notifiés.
//   Regroupement : par personne et par liste, pendant 60 secondes à partir
//   du premier changement, puis UNE notification (« Léa a modifié
//   « Courses » », « 3 changements »), avec un tag par liste (une nouvelle
//   remplace la précédente). Déjà vu (liste ouverte, le repère « vu » des
//   Nouveautés a dépassé ces changements) : rien n'est envoyé.
// - c) 'wishes' : une réservation ou une participation à un cadeau. Appelé
//   par server/reservations.js, SEUL lecteur des réservations, qui donne la
//   liste des destinataires (membres qui voient les réservations) ; ce module
//   ne lit jamais les tables de réservation, et refait le contrôle
//   « voit les réservations » d'après la liste seule (public/js/wishes.js).
//   File d'envoi à part (server/push.js) : rien ne peut retarder ce que
//   reçoit le bénéficiaire.
// - d) 'sharing' : on m'ajoute à une liste, ou mon droit change.
// - Notes (étape 3 du cadrage docs/cadrage-accueil-notes-notifications.md) :
//   'changes' : « Léa a modifié la note « Vacances » », au propriétaire et
//   aux membres sauf l'auteur, regroupées : une seule notification par note
//   et par personne par quart d'heure (NOTE_QUIET_MS), la première une
//   minute après la première modification (le temps qu'un texte tapé
//   s'enregistre) ; déjà lue (la note ouverte a dépassé ces versions) :
//   rien. 'sharing' : « Léa a partagé la note « Vacances » avec vous », ou
//   « Votre droit sur la note … a changé ». « Couper les notifications de
//   cette note » (note_user_state.muted_push). Sans le détail, la note n'est
//   nommée que par son titre (jamais la première ligne de son texte) ;
//   avec le détail, le début du texte suit. Toucher la notification ouvre
//   la note. Droits relus à l'envoi avec noteAccess (server/notes.js) :
//   une note dans la corbeille ou quittée ne notifie plus rien.
// - b) 'due' : un résumé par personne et par jour, vers 8 h (heure du
//   serveur, variable TZ), « 3 tâches à faire aujourd'hui · 1 en retard » ;
//   jamais une notification par tâche. Seulement les listes de TÂCHES dont
//   l'échéance est activée (jamais une liste d'envies, pour personne) ;
//   tâches non cochées, échéance aujourd'hui ou passée ; les miennes et
//   celles de personne, jamais celles attribuées à quelqu'un d'autre (si
//   l'attribution est activée pour la liste). Avec le détail, l'heure suit
//   le nom (« Plombier (14:00) »).
// - e) rappel d'une tâche à heure précise (même catégorie 'due', décisions
//   du 11 novembre 2026) : le délai est choisi tâche par tâche (à l'heure,
//   15 min, 30 min, 1 h, 2 h avant, ou la veille). Une notification par
//   tâche, à la personne à qui elle est attribuée, sinon aux membres de la
//   liste. Une seule fois par date, heure et délai (push_reminders, noté
//   AVANT l'envoi) ; serveur arrêté au bon moment : envoyé au redémarrage
//   avec moins de 30 minutes de retard, sinon abandonné. Une tâche cochée
//   ou supprimée avant ne déclenche rien. Le jour est noté en
//   base (push_digests) AVANT l'envoi, pour chaque personne examinée : un
//   redémarrage ne renvoie jamais le résumé, une tâche ajoutée plus tard
//   n'en déclenche pas un second. Serveur arrêté à 8 h : envoi au
//   redémarrage s'il a lieu avant midi le même jour, sinon rien ce jour-là.
//
// Règles communes, vérifiées AU MOMENT DE L'ENVOI (relues en base) :
// - jamais la personne qui a fait l'action ;
// - compte actif, toujours membre de la liste, liste non supprimée ;
// - catégorie activée dans ses préférences ; liste non silencée ;
// - liste d'envies : jamais son bénéficiaire (compte destinataire, ou
//   propriétaire pour « Moi ») pour les catégories a) et c) : ni les
//   ajouts des autres dans sa propre liste (la surprise), ni rien qui
//   révèle une réservation ;
// - 30 notifications push au plus par personne et par heure (la page
//   Notifications n'a pas ce plafond : regroupée, 300 lignes au plus) ;
// - texte neutre par défaut (« Léa a modifié « Courses » ») ; le nom des
//   éléments seulement avec « Afficher le détail dans la notification ».
// Les visiteurs du lien public n'ont pas de compte : ils ne reçoivent rien.

import { buildMessage } from './push.js';
import { wishListOf, beneficiaryId, seesReservations } from '../public/js/wishes.js';
import { reminderAt, timeLabel } from '../public/js/due-time.js';
import { assigneesOf, parsePeople } from '../public/js/assign.js';
import { translate, formatDate, formatList } from '../public/js/i18n.js';
import { userLocale } from './locale.js';
import { noteAccess } from './notes.js';
import { noteTitle, noteExcerpt } from '../public/js/notes.js';

export const CATEGORIES = ['changes', 'due', 'wishes', 'sharing'];
export const DEFAULT_SETTINGS = { changes: true, due: true, wishes: true, sharing: true, detail: false };
export const GROUP_MS = 60 * 1000;      // fenêtre de regroupement (catégorie a)
export const HOURLY_CAP = 30;           // notifications par personne et par heure
export const FLUSH_EVERY_MS = 5 * 1000; // fréquence de la vérification des groupes
const HOUR = 60 * 60 * 1000;
const NAMES_MAX = 8;                    // noms d'éléments cités au plus (détail)
export const DIGEST_HOUR = 8;           // résumé des échéances : à partir de 8 h…
export const DIGEST_LATEST_HOUR = 12;   // …et jusqu'à midi (serveur arrêté à 8 h)
export const DIGEST_EVERY_MS = 60 * 1000;
export const REMIND_LATE_MS = 30 * 60 * 1000; // rappel encore envoyé jusqu'à 30 min après son moment
export const NOTE_QUIET_MS = 15 * 60 * 1000;  // notes : une notification par note et par personne par quart d'heure
const NOTE_EXCERPT_MAX = 100;                  // début du texte d'une note (détail)

// Jour local (heure du serveur, variable TZ) : « 2026-11-12 »
const two = (n) => String(n).padStart(2, '0');
export const localDay = (date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;

// Types du journal qui donnent une notification « modifications »
const ACTIVITY = { add: 'added', update: 'updated', check: 'checked' };

// Textes : dans la langue de chaque destinataire (locale), jamais une
// seule fois pour tout le monde (public/js/i18n/fr/alertes.js)

// « Lait, Pain, Œufs » ; trop de noms : « Lait, Pain et 3 autres » (énumération
// dans la grammaire de la langue, formatList)
function nameList(locale, names) {
  const shown = names.slice(0, NAMES_MAX);
  const rest = names.length - shown.length;
  return rest > 0 ? formatList([...shown, translate(locale, 'alertes.noms.autres', { count: rest })], { locale }) : shown.join(', ');
}

// « Léa », « Léa et Marc », « Léa, Marc et Zoé », « Léa, Marc et 2 autres »
function peopleList(locale, names) {
  if (names.length <= 1) return names[0] ?? translate(locale, 'alertes.quelquun');
  if (names.length <= 3) return formatList(names, { locale });
  return formatList([names[0], names[1], translate(locale, 'alertes.noms.autres', { count: names.length - 2 })], { locale });
}

// ctx.push : le service des notifications push (null sans LISTO_PUSH) ;
// ctx.inbox : la page Notifications (server/inbox.js)
export function createNotifier(ctx, { push = ctx.push, inbox = ctx.inbox } = {}) {
  const { db } = ctx;
  const hasDevices = (userId) => Boolean(push?.hasDevices(userId));
  const origin = new URL(ctx.config.publicUrl).origin;
  const listUrl = (listId) => `${origin}/#/listes/${encodeURIComponent(listId)}`;
  const noteUrl = (noteId) => `${origin}/#/notes/${encodeURIComponent(noteId)}`;

  const q = {
    settings: db.prepare('SELECT changes, due, wishes, sharing, detail FROM push_settings WHERE user_id = ?'),
    saveSettings: db.prepare(`INSERT INTO push_settings (user_id, changes, due, wishes, sharing, detail, updated_at)
      VALUES (:userId, :changes, :due, :wishes, :sharing, :detail, :now)
      ON CONFLICT(user_id) DO UPDATE SET changes = :changes, due = :due, wishes = :wishes, sharing = :sharing, detail = :detail, updated_at = :now`),
    muted: db.prepare('SELECT 1 FROM push_list_mutes WHERE list_id = ? AND user_id = ?').pluck(),
    mutedLists: db.prepare(`SELECT push_list_mutes.list_id FROM push_list_mutes
      JOIN list_members ON list_members.list_id = push_list_mutes.list_id AND list_members.user_id = push_list_mutes.user_id
      WHERE push_list_mutes.user_id = ?`).pluck(),
    mute: db.prepare('INSERT OR IGNORE INTO push_list_mutes (list_id, user_id) VALUES (?, ?)'),
    unmute: db.prepare('DELETE FROM push_list_mutes WHERE list_id = ? AND user_id = ?'),
    // Membre actif d'une liste non supprimée : la liste telle qu'il la voit
    memberList: db.prepare(`SELECT lists.id, lists.name, lists.type, lists.owner_id, lists.for_user_id, lists.for_name
      FROM lists
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      JOIN users ON users.id = list_members.user_id AND users.active = 1
      WHERE lists.id = :listId AND lists.deleted_at IS NULL`),
    access: db.prepare('SELECT access FROM list_members WHERE list_id = ? AND user_id = ?').pluck(),
    members: db.prepare(`SELECT list_members.user_id FROM list_members JOIN users ON users.id = list_members.user_id
      WHERE list_members.list_id = ? AND users.active = 1`).pluck(),
    name: db.prepare('SELECT display_name FROM users WHERE id = ?').pluck(),
    // Langue choisie par le destinataire (« Mon compte »)
    locale: db.prepare('SELECT locale FROM users WHERE id = ?').pluck(),
    itemName: db.prepare('SELECT name FROM items WHERE id = ? AND list_id = ? AND deleted_at IS NULL').pluck(),
    // Tâche encore attribuée à cette personne, non cochée, non supprimée, dans
    // une liste de tâches dont l'attribution est activée
    stillMine: db.prepare(`SELECT 1 FROM items JOIN lists ON lists.id = items.list_id AND lists.type = 'tasks' AND lists.assign_enabled = 1
      WHERE items.id = :itemId AND items.list_id = :listId AND items.deleted_at IS NULL AND items.checked = 0
        AND (items.assigned_to = :userId OR (items.assign_mode = 'all' AND instr(',' || COALESCE(items.assign_people, '') || ',', ',' || CAST(:userId AS INTEGER) || ',') > 0))`).pluck(),
    isMember: db.prepare(`SELECT 1 FROM list_members JOIN lists ON lists.id = list_members.list_id AND lists.deleted_at IS NULL
      WHERE list_members.list_id = ? AND list_members.user_id = ?`).pluck(),
    // Résumé des échéances : comptes actifs pas encore examinés aujourd'hui
    digestUsers: db.prepare(`SELECT users.id FROM users WHERE users.active = 1
      AND NOT EXISTS (SELECT 1 FROM push_digests WHERE push_digests.user_id = users.id AND push_digests.last_day = ?)`).pluck(),
    // « Examiné aujourd'hui », noté avant l'envoi ; changes = 0 : déjà fait
    claimDigest: db.prepare(`INSERT INTO push_digests (user_id, last_day) VALUES (:userId, :day)
      ON CONFLICT(user_id) DO UPDATE SET last_day = :day WHERE push_digests.last_day <> :day`),
    // Tâches concernées, relues au moment de l'envoi : membre, liste de
    // tâches non supprimée avec l'échéance activée, non silencée ; tâche non
    // supprimée, non cochée, échéance aujourd'hui ou passée
    dueTasks: db.prepare(`SELECT items.name, items.due_date, items.due_time, lists.id AS list_id, lists.name AS list_name
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL AND lists.type = 'tasks' AND lists.due_enabled = 1
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.deleted_at IS NULL AND items.checked = 0 AND items.due_date IS NOT NULL AND items.due_date <> '' AND items.due_date <= :today
        AND (lists.assign_enabled = 0
          OR (items.assign_mode = 'all' AND instr(',' || COALESCE(items.assign_people, '') || ',', ',' || CAST(:userId AS INTEGER) || ',') > 0)
          OR (items.assign_mode <> 'all' AND (items.assigned_to IS NULL OR items.assigned_to = :userId)))
        AND NOT EXISTS (SELECT 1 FROM push_list_mutes WHERE push_list_mutes.list_id = lists.id AND push_list_mutes.user_id = :userId)
      ORDER BY items.due_date, COALESCE(items.due_time, '99:99'), items.name COLLATE NOCASE`),
    // Rappels : tâches à faire avec date, heure et délai, autour d'aujourd'hui
    // (le moment exact est calculé ensuite, en heure locale du serveur)
    reminderTasks: db.prepare(`SELECT items.id, items.name, items.due_date, items.due_time, items.remind_before, items.assigned_to, items.assign_mode, items.assign_people,
        lists.id AS list_id, lists.assign_enabled
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL AND lists.type = 'tasks' AND lists.due_enabled = 1
      WHERE items.deleted_at IS NULL AND items.checked = 0 AND items.due_time IS NOT NULL AND items.remind_before IS NOT NULL
        AND items.due_date BETWEEN :from AND :to`),
    // « Envoyé pour cette signature » : noté avant l'envoi ; changes = 0 : déjà fait
    claimReminder: db.prepare(`INSERT INTO push_reminders (item_id, sent_key) VALUES (:itemId, :key)
      ON CONFLICT(item_id) DO UPDATE SET sent_key = :key WHERE push_reminders.sent_key <> :key`),
    seen: db.prepare('SELECT last_seen FROM list_reads WHERE list_id = ? AND user_id = ?').pluck(),
    // --- Notes ---
    // La note telle que ce compte la voit (droit lu dans note_members),
    // avec l'état de ce compte (actif) et ses réglages pour la note
    note: db.prepare(`SELECT notes.id, notes.title, notes.body, notes.owner_id, notes.version, notes.deleted_at,
        (SELECT access FROM note_members WHERE note_members.note_id = notes.id AND note_members.user_id = :userId) AS member_access,
        (SELECT active FROM users WHERE users.id = :userId) AS user_active,
        COALESCE((SELECT muted_push FROM note_user_state WHERE note_user_state.note_id = notes.id AND note_user_state.user_id = :userId), 0) AS muted_push,
        COALESCE((SELECT last_read_version FROM note_user_state WHERE note_user_state.note_id = notes.id AND note_user_state.user_id = :userId), 0) AS read_version
      FROM notes WHERE notes.id = :noteId`),
    noteAccess: db.prepare('SELECT access FROM note_members WHERE note_id = ? AND user_id = ?').pluck(),
    notePeople: db.prepare('SELECT owner_id FROM notes WHERE id = ? UNION SELECT user_id FROM note_members WHERE note_id = ?').pluck(),
    mutedNotes: db.prepare('SELECT note_id FROM note_user_state WHERE user_id = ? AND muted_push = 1').pluck(),
    setNoteMuted: db.prepare(`INSERT INTO note_user_state (note_id, user_id, muted_push) VALUES (:noteId, :userId, :muted)
      ON CONFLICT (note_id, user_id) DO UPDATE SET muted_push = :muted`),
  };

  // Langue des notifications d'une personne : celle de son compte, sinon
  // celle de l'installation (server/locale.js)
  const localeOf = (userId) => userLocale({ locale: q.locale.get(userId) }, ctx.config);

  // --- Préférences ---
  function settingsOf(userId) {
    const row = q.settings.get(userId);
    if (!row) return { ...DEFAULT_SETTINGS };
    return { changes: row.changes === 1, due: row.due === 1, wishes: row.wishes === 1, sharing: row.sharing === 1, detail: row.detail === 1 };
  }
  // changes : { changes?, due?, wishes?, sharing?, detail? } (vrai ou faux).
  // Renvoie null si une valeur est invalide (rien n'est écrit).
  function setSettings(userId, changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
    const keys = Object.keys(changes);
    if (!keys.length || keys.some((key) => !(key in DEFAULT_SETTINGS) || typeof changes[key] !== 'boolean')) return null;
    const next = { ...settingsOf(userId), ...changes };
    q.saveSettings.run({ userId, ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, Number(v)])), now: new Date(ctx.now()).toISOString() });
    return next;
  }

  // --- « Silencer cette liste » (membres seulement ; vérifié par l'appelant) ---
  const mutedLists = (userId) => q.mutedLists.all(userId);
  const isMember = (userId, listId) => q.isMember.get(listId, userId) === 1;
  function setMuted(userId, listId, muted) {
    if (muted) q.mute.run(listId, userId);
    else q.unmute.run(listId, userId);
  }

  // --- Plafond : 30 par personne et par heure (en mémoire) ---
  const sentAt = new Map(); // compte -> dates des derniers envois
  function underCap(userId) {
    const recent = (sentAt.get(userId) ?? []).filter((time) => time > ctx.now() - HOUR);
    sentAt.set(userId, recent);
    if (recent.length >= HOURLY_CAP) return false;
    recent.push(ctx.now());
    return true;
  }

  // La personne peut-elle recevoir une notification de cette catégorie pour
  // cette liste ? Renvoie la liste (telle qu'elle la voit) ou null.
  function allowed(userId, listId, category, actorId = null) {
    if (userId === actorId) return null;                       // jamais l'auteur
    const list = q.memberList.get({ userId, listId });
    if (!list) return null;                                     // plus membre, compte inactif, liste supprimée
    if (!settingsOf(userId)[category]) return null;             // catégorie coupée
    if (q.muted.get(listId, userId)) return null;               // liste silencée
    if (list.type === 'wishes') {
      const wish = wishListOf(list);
      // Le bénéficiaire ne reçoit rien de sa propre liste d'envies (ajouts des
      // autres, réservations) ; seul le partage (on l'y ajoute) lui parvient
      if ((category === 'changes' || category === 'wishes') && beneficiaryId(wish) === userId) return null;
      if (category === 'wishes' && !seesReservations(userId, wish)) return null;
    }
    if (category === 'wishes' && list.type !== 'wishes') return null;
    return list;
  }

  // --- Notes : réglages ---
  // La note, si cette personne la voit (relue en base, noteAccess), sinon null
  function visibleNote(userId, noteId) {
    const note = q.note.get({ userId, noteId });
    if (!note || note.user_active !== 1 || !noteAccess({ id: userId }, note)) return null;
    return note;
  }
  // « Couper les notifications de cette note » (sourdines des notes que je vois)
  const mutedNotes = (userId) => q.mutedNotes.all(userId).filter((noteId) => visibleNote(userId, noteId));
  const seesNote = (userId, noteId) => Boolean(visibleNote(userId, noteId));
  function setNoteMuted(userId, noteId, muted) {
    q.setNoteMuted.run({ noteId, userId, muted: muted ? 1 : 0 });
  }
  // La personne peut-elle recevoir cette notification de note ? La note
  // (telle qu'elle la voit) ou null.
  function allowedNote(userId, noteId, category, actorId = null) {
    if (userId === actorId) return null;
    const note = visibleNote(userId, noteId);
    if (!note) return null;
    if (!settingsOf(userId)[category]) return null;
    if (note.muted_push === 1) return null;
    return note;
  }

  async function send(userId, message, options) {
    if (!underCap(userId)) return;
    await push.sendToUser(userId, message, options);
  }

  // --- LE point de remise de toute notification adressée à une personne ---
  // entry : la ligne de la page Notifications (server/inbox.js : category,
  // textKey, params construits champ par champ, cible, clé de regroupement) ;
  // message() : le message push, fabriqué seulement s'il part ; options :
  // { queue } (file des envies) ou { ttl, cap: false } (résumé du matin,
  // hors plafond comme avant). Les filtres (droits, catégorie, sourdines,
  // bénéficiaire d'une liste d'envies) sont faits AVANT, par l'appelant.
  function deliver(userId, entry, message, { cap = true, ...options } = {}) {
    try {
      inbox?.add(userId, entry);
    } catch {
      // page indisponible (base occupée…) : le téléphone est quand même prévenu
    }
    if (!hasDevices(userId)) return Promise.resolve();
    if (!cap) return push.sendToUser(userId, message(), options);
    return send(userId, message(), options);
  }

  // --- a) Modifications (des autres), regroupées ---
  const groups = new Map(); // `${compte}:${liste}` -> groupe
  // Appelé par le journal des Nouveautés après chaque écriture (lastEventId :
  // numéro du dernier événement écrit)
  function activity(listId, actorId, type, itemIds, lastEventId) {
    const kind = ACTIVITY[type];
    if (!kind || !actorId || !itemIds.length) return;
    for (const userId of q.members.all(listId)) {
      if (userId === actorId) continue;
      const key = `${userId}:${listId}`;
      let group = groups.get(key);
      if (!group) {
        group = newGroup(userId, listId);
        groups.set(key, group);
      }
      if (!group.actors.includes(actorId)) group.actors.push(actorId);
      for (const itemId of itemIds) {
        if (!group.items[kind].includes(itemId)) group.items[kind].push(itemId);
        group.count += 1;
      }
      group.lastEventId = Math.max(group.lastEventId, lastEventId);
    }
  }

  // Une tâche m'est attribuée par quelqu'un d'autre (server/lists.js) : notée
  // dans MON groupe de la liste (même minute de regroupement, même
  // catégorie « Modifications ») ; le titre le dit. L'écriture elle-même
  // passe aussi par le journal (activity), qui compte le changement.
  // turn : « chacun son tour », la tâche revient à cette personne (« C'est
  // votre tour »)
  function assigned({ listId, itemId, userId, actorId, turn = false }) {
    if (!actorId || userId === actorId) return;
    const key = `${userId}:${listId}`;
    let group = groups.get(key);
    if (!group) {
      group = newGroup(userId, listId);
      groups.set(key, group);
    }
    if (!group.actors.includes(actorId)) group.actors.push(actorId);
    const bucket = turn ? group.turns : group.assigned;
    if (!bucket.includes(itemId)) bucket.push(itemId);
  }

  function newGroup(userId, listId) {
    return { userId, listId, firstAt: ctx.now(), actors: [], items: { added: [], updated: [], checked: [] }, assigned: [], turns: [], count: 0, lastEventId: 0 };
  }

  function changesMessage(group, list, detail) {
    const locale = localeOf(group.userId);
    const actors = group.actors.map((id) => q.name.get(id) ?? translate(locale, 'alertes.ancienMembre'));
    // Tâches qui me sont attribuées (toujours à moi, encore à faire)
    const stillMine = (id) => q.stillMine.get({ itemId: id, listId: list.id, userId: group.userId });
    const mine = group.assigned.filter(stillMine);
    // Chacun son tour : la tâche m'est revenue (toujours à moi, encore à faire)
    const turns = group.turns.filter(stillMine);
    const turnNames = turns.map((id) => q.itemName.get(id, list.id)).filter(Boolean);
    const people = peopleList(locale, actors);
    const title = turns.length
      ? (detail && turnNames.length ? translate(locale, 'alertes.tour.detail', { names: nameList(locale, turnNames) }) : translate(locale, 'alertes.tour', { list: list.name }))
      : mine.length
        ? translate(locale, actors.length > 1 ? 'alertes.attribue.plusieurs' : 'alertes.attribue.un', { people, count: mine.length, list: list.name })
        : translate(locale, 'alertes.modifie', { people, count: actors.length, list: list.name });
    let body = translate(locale, 'alertes.changements', { count: group.count });
    if (detail) {
      const parts = [];
      const assignedNames = mine.map((id) => q.itemName.get(id, list.id)).filter(Boolean);
      if (assignedNames.length) parts.push(translate(locale, 'alertes.detail.pourVous', { names: nameList(locale, assignedNames) }));
      for (const [kind, key] of [['added', 'alertes.detail.ajoute'], ['updated', 'alertes.detail.modifie'], ['checked', 'alertes.detail.coche']]) {
        const names = group.items[kind].map((id) => q.itemName.get(id, list.id)).filter(Boolean);
        if (names.length) parts.push(translate(locale, key, { names: nameList(locale, names) }));
      }
      if (parts.length) body = parts.join(' · ');
    }
    return buildMessage({ title, body, navigate: listUrl(list.id), tag: `liste-${list.id}`, locale });
  }

  // Ligne de la page Notifications d'un groupe de modifications : valeurs
  // seulement (noms relus maintenant), la phrase est faite à la lecture
  // (server/inbox.js). Regroupée avec la ligne de la même liste écrite
  // dans la demi-heure.
  function changesEntry(group, list) {
    const stillMine = (id) => q.stillMine.get({ itemId: id, listId: list.id, userId: group.userId });
    const itemNames = (ids) => ids.map((id) => q.itemName.get(id, list.id)).filter(Boolean);
    return {
      category: 'changes',
      textKey: 'changes',
      params: {
        list: list.name,
        listType: list.type,
        actors: group.actors.map((id) => q.name.get(id)).filter(Boolean),
        added: group.items.added.length,
        updated: group.items.updated.length,
        checked: group.items.checked.length,
        assigned: itemNames(group.assigned.filter(stillMine)),
        turns: itemNames(group.turns.filter(stillMine)),
      },
      targetType: 'list',
      targetId: list.id,
      groupKey: `changes:list:${list.id}`,
    };
  }

  // Envoie les groupes dont la fenêtre de 60 s est passée (listes), puis
  // ceux des notes qui sont mûrs
  async function flushDue() {
    await Promise.all([flushLists(), flushNotes()]);
  }
  async function flushLists() {
    const due = [...groups.values()].filter((group) => ctx.now() - group.firstAt >= GROUP_MS);
    const work = [];
    for (const group of due) {
      groups.delete(`${group.userId}:${group.listId}`);
      const list = allowed(group.userId, group.listId, 'changes');
      if (!list) continue;
      // Déjà vu (liste ouverte et visible) : rien à annoncer
      if ((q.seen.get(group.listId, group.userId) ?? 0) >= group.lastEventId) continue;
      work.push(deliver(group.userId, changesEntry(group, list), () => changesMessage(group, list, settingsOf(group.userId).detail)));
    }
    await Promise.all(work);
  }

  // --- Notes : modifications des autres, regroupées ---
  // Appelé par server/notes.js après chaque enregistrement réussi
  // (version : celle tout juste écrite). Ce qui est gardé en attendant
  // l'envoi : des numéros seulement, jamais le texte.
  const noteGroups = new Map(); // `${compte}:${note}` -> groupe
  const noteSentAt = new Map(); // `${compte}:${note}` -> heure du dernier envoi
  function noteChanged({ noteId, actorId, version }) {
    if (!actorId) return;
    for (const userId of q.notePeople.all(noteId, noteId)) {
      if (userId === actorId) continue;
      const key = `${userId}:${noteId}`;
      let group = noteGroups.get(key);
      if (!group) {
        group = { userId, noteId, firstAt: ctx.now(), actors: [], version: 0 };
        noteGroups.set(key, group);
      }
      if (!group.actors.includes(actorId)) group.actors.push(actorId);
      group.version = Math.max(group.version, version);
    }
  }

  // Nom d'une note dans un texte : son titre ; avec le détail, sinon la
  // première ligne de son texte. Vide : la phrase « … une note ».
  const noteName = (note, detail) => (detail ? noteTitle(note) : (note.title ?? '').trim());

  function noteChangesMessage(group, note, detail) {
    const locale = localeOf(group.userId);
    const actors = group.actors.map((id) => q.name.get(id) ?? translate(locale, 'alertes.ancienMembre'));
    const people = peopleList(locale, actors);
    const name = noteName(note, detail);
    const title = name
      ? translate(locale, 'alertes.note.modifie', { people, count: actors.length, note: name })
      : translate(locale, 'alertes.note.modifie.sansTitre', { people, count: actors.length });
    const body = detail ? noteExcerpt(note, NOTE_EXCERPT_MAX) : '';
    return buildMessage({ title, body, navigate: noteUrl(note.id), tag: `note-${note.id}`, locale });
  }

  // Envoie les groupes de notes mûrs : une minute après la première
  // modification, et jamais deux fois en un quart d'heure pour la même
  // note et la même personne (le groupe attend la fin du quart d'heure)
  async function flushNotes() {
    const now = ctx.now();
    const work = [];
    for (const [key, group] of [...noteGroups]) {
      if (now - group.firstAt < GROUP_MS) continue;
      if (now - (noteSentAt.get(key) ?? -Infinity) < NOTE_QUIET_MS) continue;
      noteGroups.delete(key);
      const note = allowedNote(group.userId, group.noteId, 'changes');
      if (!note) continue;
      if (note.read_version >= group.version) continue; // déjà lue
      noteSentAt.set(key, now);
      const detail = settingsOf(group.userId).detail;
      // Page Notifications : la note n'y est désignée que par son
      // identifiant (son titre est relu à l'affichage, jamais gardé)
      const entry = {
        category: 'changes',
        textKey: 'note.changes',
        params: { actors: group.actors.map((id) => q.name.get(id)).filter(Boolean) },
        targetType: 'note',
        targetId: note.id,
        groupKey: `changes:note:${note.id}`,
      };
      work.push(deliver(group.userId, entry, () => noteChangesMessage(group, note, detail)));
    }
    await Promise.all(work);
  }

  // --- Notes : partage (ajouté à une note, ou droit changé) ---
  function noteShared({ noteId, userId, actorId, kind }) {
    const note = allowedNote(userId, noteId, 'sharing', actorId);
    if (!note) return;
    const locale = localeOf(userId);
    const actor = q.name.get(actorId) ?? translate(locale, 'alertes.quelquun');
    const detail = settingsOf(userId).detail;
    const name = noteName(note, detail);
    const canEdit = q.noteAccess.get(noteId, userId) === 'modification';
    const entry = {
      category: 'sharing',
      textKey: kind === 'added' ? 'note.shared' : 'note.access',
      params: { actor: q.name.get(actorId) ?? null, access: canEdit ? 'modification' : 'lecture' },
      targetType: 'note',
      targetId: noteId,
    };
    const message = () => (kind === 'added'
      ? buildMessage({
        title: name ? translate(locale, 'alertes.note.partage', { actor, note: name }) : translate(locale, 'alertes.note.partage.sansTitre', { actor }),
        body: translate(locale, canEdit ? 'alertes.partage.ajoute.modification' : 'alertes.partage.ajoute.lecture'),
        navigate: noteUrl(noteId), tag: `partage-note-${noteId}`, locale,
      })
      : buildMessage({
        title: name ? translate(locale, 'alertes.note.droit', { note: name }) : translate(locale, 'alertes.note.droit.sansTitre'),
        body: translate(locale, canEdit ? 'alertes.partage.droit.modification' : 'alertes.partage.droit.lecture'),
        navigate: noteUrl(noteId), tag: `partage-note-${noteId}`, locale,
      }));
    deliver(userId, entry, message);
  }

  // --- c) Envies : réservation ou participation ---
  // recipients : membres qui voient les réservations (calculés par
  // server/reservations.js) ; actor : { userId } ou { visitorName }
  function wish({ listId, itemId, kind, actor, recipients }) {
    for (const userId of new Set(recipients)) {
      const list = allowed(userId, listId, 'wishes', actor.userId ?? null);
      if (!list) continue;
      const locale = localeOf(userId);
      const actorName = actor.userId
        ? (q.name.get(actor.userId) ?? translate(locale, 'alertes.quelquun'))
        : translate(locale, 'alertes.envie.visiteur', { name: actor.visitorName });
      const detail = settingsOf(userId).detail;
      const fullName = q.itemName.get(itemId, listId) ?? null;
      const itemName = detail ? fullName : null;
      // Page Notifications : toujours le nom du souhait (on y est connecté)
      const entry = {
        category: 'wishes',
        textKey: kind === 'join' ? 'wish.join' : 'wish.reserve',
        params: actor.userId
          ? { actor: q.name.get(actor.userId) ?? null, visitor: false, item: fullName, list: list.name }
          : { actor: String(actor.visitorName ?? '').slice(0, 40), visitor: true, item: fullName, list: list.name },
        targetType: 'item',
        targetId: itemId,
      };
      const title = kind === 'join'
        ? (itemName ? translate(locale, 'alertes.envie.participe.nom', { actor: actorName, item: itemName }) : translate(locale, 'alertes.envie.participe', { actor: actorName }))
        : (itemName ? translate(locale, 'alertes.envie.reserve.nom', { actor: actorName, item: itemName }) : translate(locale, 'alertes.envie.reserve', { actor: actorName }));
      const message = () => buildMessage({ title, body: translate(locale, 'alertes.envie.liste', { list: list.name }), navigate: listUrl(listId), tag: `envies-${listId}`, locale });
      deliver(userId, entry, message, { queue: 'wishes' });
    }
  }

  // --- d) Partage : ajouté à une liste, ou droit changé ---
  function sharing({ listId, userId, actorId, kind }) {
    const list = allowed(userId, listId, 'sharing', actorId);
    if (!list) return;
    const locale = localeOf(userId);
    const actor = q.name.get(actorId) ?? translate(locale, 'alertes.quelquun');
    const canEdit = q.access.get(listId, userId) === 'modification';
    const entry = {
      category: 'sharing',
      textKey: kind === 'added' ? 'list.shared' : 'list.access',
      params: { actor: q.name.get(actorId) ?? null, list: list.name, access: canEdit ? 'modification' : 'lecture' },
      targetType: 'list',
      targetId: listId,
    };
    const message = () => (kind === 'added'
      ? buildMessage({
        title: translate(locale, 'alertes.partage.ajoute', { actor, list: list.name }),
        body: translate(locale, canEdit ? 'alertes.partage.ajoute.modification' : 'alertes.partage.ajoute.lecture'),
        navigate: listUrl(listId), tag: `partage-${listId}`, locale,
      })
      : buildMessage({
        title: translate(locale, 'alertes.partage.droit', { list: list.name }),
        body: translate(locale, canEdit ? 'alertes.partage.droit.modification' : 'alertes.partage.droit.lecture'),
        navigate: listUrl(listId), tag: `partage-${listId}`, locale,
      }));
    deliver(userId, entry, message);
  }

  // --- b) Résumé quotidien des échéances ---
  function digestMessage(tasks, today, detail, locale) {
    const dueToday = tasks.filter((t) => t.due_date === today).length;
    const late = tasks.length - dueToday;
    const parts = [];
    if (dueToday) parts.push(translate(locale, 'alertes.echeances.aujourdhui', { count: dueToday }));
    if (late) parts.push(translate(locale, dueToday ? 'alertes.echeances.retard' : 'alertes.echeances.retard.seules', { count: late }));
    const lists = [...new Map(tasks.map((t) => [t.list_id, t.list_name])).entries()];
    const body = detail
      ? nameList(locale, tasks.map((t) => (t.due_time ? translate(locale, 'alertes.echeances.heure', { name: t.name, time: timeLabel(t.due_time, { locale }) }) : t.name))) // les plus en retard d'abord
      : (lists.length === 1 ? translate(locale, 'alertes.dans', { list: lists[0][1] }) : translate(locale, 'alertes.dansListes', { count: lists.length }));
    // Une seule liste : on l'ouvre ; plusieurs : « Mes listes »
    const navigate = lists.length === 1 ? listUrl(lists[0][0]) : `${origin}/#/listes`;
    return buildMessage({ title: parts.join(' · '), body, navigate, tag: 'echeances', locale });
  }

  // Appelé chaque minute (et une fois au démarrage) : entre 8 h et midi,
  // chaque compte pas encore examiné aujourd'hui l'est, une seule fois.
  // Même sans LISTO_PUSH ni appareil : la page Notifications le reçoit.
  async function runDigest() {
    const now = new Date(ctx.now());
    const hour = now.getHours();
    if (hour < DIGEST_HOUR || hour >= DIGEST_LATEST_HOUR) return;
    const today = localDay(now);
    const endOfDay = new Date(now);
    endOfDay.setHours(24, 0, 0, 0);
    const ttl = Math.max(60, Math.floor((endOfDay - now) / 1000)); // utile jusqu'à minuit
    const work = [];
    for (const userId of q.digestUsers.all(today)) {
      // Noté AVANT tout envoi : jamais deux fois, même après un redémarrage
      if (!q.claimDigest.run({ userId, day: today }).changes) continue;
      const settings = settingsOf(userId);
      if (!settings.due) continue;
      const tasks = q.dueTasks.all({ userId, today });
      if (!tasks.length) continue;
      const dueToday = tasks.filter((task) => task.due_date === today).length;
      const entry = { category: 'due', textKey: 'digest', params: { today: dueToday, late: tasks.length - dueToday }, targetType: 'deadlines' };
      // Hors plafond horaire, comme avant (une fois par jour)
      work.push(deliver(userId, entry, () => digestMessage(tasks, today, settings.detail, localeOf(userId)), { ttl, cap: false }));
    }
    await Promise.all(work);
  }

  // --- e) Rappels d'une tâche à heure précise ---
  const dayShift = (day, n) => {
    const [y, m, d] = day.split('-').map(Number);
    return localDay(new Date(y, m - 1, d + n));
  };
  function reminderMessage(task, list, detail, today, locale) {
    const time = timeLabel(task.due_time, { locale });
    // Quand : aujourd'hui, demain, ou le 12/11/2026 (11/12/2026 en anglais
    // américain : la date dans la langue du destinataire)
    const when = task.due_date === today ? 'aujourdhui' : task.due_date === dayShift(today, 1) ? 'demain' : 'date';
    const [y, m, d] = task.due_date.split('-').map(Number);
    const date = formatDate(new Date(Date.UTC(y, m - 1, d)), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }, { locale });
    const values = { time, date, list: list.name };
    const keys = {
      aujourdhui: ['alertes.rappel.aujourdhui', 'alertes.rappel.detail.aujourdhui'],
      demain: ['alertes.rappel.demain', 'alertes.rappel.detail.demain'],
      date: ['alertes.rappel.date', 'alertes.rappel.detail.date'],
    }[when];
    const message = detail
      ? { title: translate(locale, 'alertes.rappel.detail', { name: task.name }), body: translate(locale, keys[1], values) }
      : { title: translate(locale, keys[0], values), body: translate(locale, 'alertes.dans', { list: list.name }) };
    return buildMessage({ ...message, navigate: listUrl(list.id), tag: `rappel-${task.id}`, locale });
  }
  // Ligne de la page Notifications d'un rappel : toujours le nom de la
  // tâche ; « aujourd'hui », « demain » ou la date, par rapport au jour du rappel
  function reminderEntry(task, list, today) {
    const when = task.due_date === today ? 'today' : task.due_date === dayShift(today, 1) ? 'tomorrow' : 'date';
    return {
      category: 'due',
      textKey: 'reminder',
      params: { name: task.name, list: list.name, time: task.due_time, date: task.due_date, when },
      targetType: 'item',
      targetId: task.id,
    };
  }
  // Appelé chaque minute (et une fois au démarrage), même sans LISTO_PUSH
  async function runReminders() {
    const now = ctx.now();
    const today = localDay(new Date(now));
    const work = [];
    for (const task of q.reminderTasks.all({ from: dayShift(today, -1), to: dayShift(today, 2) })) {
      const at = reminderAt(task.due_date, task.due_time, task.remind_before);
      if (at === null || at > now || now - at > REMIND_LATE_MS) continue;
      // Noté AVANT tout envoi : jamais deux fois pour la même signature
      const key = `${task.due_date} ${task.due_time} ${task.remind_before}`;
      if (!q.claimReminder.run({ itemId: task.id, key }).changes) continue;
      // Destinataires : la personne à qui elle est attribuée, sinon les membres
      // (plusieurs personnes : chacune ; chacun son tour : celle de cette fois)
      const people = task.assign_enabled === 1 ? assigneesOf({ assignMode: task.assign_mode, assignPeople: parsePeople(task.assign_people), assignedTo: task.assigned_to }) : [];
      const recipients = people.length ? people : q.members.all(task.list_id);
      for (const userId of recipients) {
        const list = allowed(userId, task.list_id, 'due');
        if (!list) continue;
        work.push(deliver(userId, reminderEntry(task, list, today), () => reminderMessage(task, list, settingsOf(userId).detail, today, localeOf(userId))));
      }
    }
    await Promise.all(work);
  }

  // Vérifications régulières (arrêtées avec Listo) : groupes toutes les 5 s,
  // résumé des échéances chaque minute, et une première fois peu après le
  // démarrage (serveur redémarré après 8 h)
  const timer = setInterval(() => { flushDue().catch(() => {}); }, FLUSH_EVERY_MS);
  timer.unref?.();
  const digestTimer = setInterval(() => {
    runDigest().catch(() => {});
    runReminders().catch(() => {});
  }, DIGEST_EVERY_MS);
  digestTimer.unref?.();
  const firstDigest = setTimeout(() => {
    runDigest().catch(() => {});
    runReminders().catch(() => {});
  }, 5000);
  firstDigest.unref?.();

  return {
    activity, assigned, wish, sharing, flushDue, runDigest, runReminders, settingsOf, setSettings, mutedLists, setMuted, isMember,
    noteChanged, noteShared, mutedNotes, setNoteMuted, seesNote,
    pending: () => groups.size + noteGroups.size,
    prune: () => {
      for (const [userId, times] of sentAt) if (!times.some((t) => t > ctx.now() - HOUR)) sentAt.delete(userId);
      for (const [key, at] of noteSentAt) if (ctx.now() - at >= NOTE_QUIET_MS) noteSentAt.delete(key);
    },
    stop: () => {
      clearInterval(timer);
      clearInterval(digestTimer);
      clearTimeout(firstDigest);
    },
  };
}
