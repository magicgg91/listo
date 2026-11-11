// Notifications push, étape 2 : QUI reçoit QUOI (LISTO_PUSH=on seulement ;
// l'envoi chiffré lui-même est dans server/push.js).
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
// - b) 'due' : un résumé par personne et par jour, vers 8 h (heure du
//   serveur, variable TZ), « 3 tâches à faire aujourd'hui · 1 en retard » ;
//   jamais une notification par tâche. Seulement les listes de TÂCHES dont
//   l'échéance est activée (jamais une liste d'envies, pour personne) ;
//   tâches non cochées, échéance aujourd'hui ou passée ; les miennes et
//   celles de personne, jamais celles attribuées à quelqu'un d'autre (si
//   l'attribution est activée pour la liste). Le jour est noté en
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
// - 30 notifications au plus par personne et par heure ;
// - texte neutre par défaut (« Léa a modifié « Courses » ») ; le nom des
//   éléments seulement avec « Afficher le détail dans la notification ».
// Les visiteurs du lien public n'ont pas de compte : ils ne reçoivent rien.

import { buildMessage } from './push.js';
import { wishListOf, beneficiaryId, seesReservations } from '../public/js/wishes.js';

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

// Jour local (heure du serveur, variable TZ) : « 2026-11-12 »
const two = (n) => String(n).padStart(2, '0');
export const localDay = (date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;

// Types du journal qui donnent une notification « modifications »
const ACTIVITY = { add: 'added', update: 'updated', check: 'checked' };

// « Lait, Pain et 3 autres »
function nameList(names) {
  const shown = names.slice(0, NAMES_MAX);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}` : shown.join(', ');
}

// « Léa », « Léa et Marc », « Léa, Marc et Zoé », « Léa, Marc et 2 autres »
function peopleList(names) {
  if (names.length <= 1) return names[0] ?? 'Quelqu\'un';
  if (names.length === 2) return `${names[0]} et ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} et ${names[2]}`;
  return `${names[0]}, ${names[1]} et ${names.length - 2} autres`;
}

export function createNotifier(ctx, { push = ctx.push } = {}) {
  const { db } = ctx;
  const origin = new URL(ctx.config.publicUrl).origin;
  const listUrl = (listId) => `${origin}/#/listes/${encodeURIComponent(listId)}`;

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
    itemName: db.prepare('SELECT name FROM items WHERE id = ? AND list_id = ? AND deleted_at IS NULL').pluck(),
    // Tâche encore attribuée à cette personne, non cochée, non supprimée, dans
    // une liste de tâches dont l'attribution est activée
    stillMine: db.prepare(`SELECT 1 FROM items JOIN lists ON lists.id = items.list_id AND lists.type = 'tasks' AND lists.assign_enabled = 1
      WHERE items.id = ? AND items.list_id = ? AND items.assigned_to = ? AND items.deleted_at IS NULL AND items.checked = 0`).pluck(),
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
    dueTasks: db.prepare(`SELECT items.name, items.due_date, lists.id AS list_id, lists.name AS list_name
      FROM items
      JOIN lists ON lists.id = items.list_id AND lists.deleted_at IS NULL AND lists.type = 'tasks' AND lists.due_enabled = 1
      JOIN list_members ON list_members.list_id = lists.id AND list_members.user_id = :userId
      WHERE items.deleted_at IS NULL AND items.checked = 0 AND items.due_date IS NOT NULL AND items.due_date <> '' AND items.due_date <= :today
        AND (lists.assign_enabled = 0 OR items.assigned_to IS NULL OR items.assigned_to = :userId)
        AND NOT EXISTS (SELECT 1 FROM push_list_mutes WHERE push_list_mutes.list_id = lists.id AND push_list_mutes.user_id = :userId)
      ORDER BY items.due_date, items.name COLLATE NOCASE`),
    seen: db.prepare('SELECT last_seen FROM list_reads WHERE list_id = ? AND user_id = ?').pluck(),
  };

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
    if (!push.hasDevices(userId)) return null;                  // aucun appareil : rien à faire
    return list;
  }

  async function send(userId, message, options) {
    if (!underCap(userId)) return;
    await push.sendToUser(userId, message, options);
  }

  // --- a) Modifications (des autres), regroupées ---
  const groups = new Map(); // `${compte}:${liste}` -> groupe
  // Appelé par le journal des Nouveautés après chaque écriture (lastEventId :
  // numéro du dernier événement écrit)
  function activity(listId, actorId, type, itemIds, lastEventId) {
    const kind = ACTIVITY[type];
    if (!kind || !actorId || !itemIds.length) return;
    for (const userId of q.members.all(listId)) {
      if (userId === actorId || !push.hasDevices(userId)) continue;
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
  function assigned({ listId, itemId, userId, actorId }) {
    if (!actorId || userId === actorId || !push.hasDevices(userId)) return;
    const key = `${userId}:${listId}`;
    let group = groups.get(key);
    if (!group) {
      group = newGroup(userId, listId);
      groups.set(key, group);
    }
    if (!group.actors.includes(actorId)) group.actors.push(actorId);
    if (!group.assigned.includes(itemId)) group.assigned.push(itemId);
  }

  function newGroup(userId, listId) {
    return { userId, listId, firstAt: ctx.now(), actors: [], items: { added: [], updated: [], checked: [] }, assigned: [], count: 0, lastEventId: 0 };
  }

  function changesMessage(group, list, detail) {
    const actors = group.actors.map((id) => q.name.get(id) ?? 'Un ancien membre');
    // Tâches qui me sont attribuées (toujours à moi, encore à faire)
    const mine = group.assigned.filter((id) => q.stillMine.get(id, list.id, group.userId));
    const verb = actors.length > 1 ? 'ont modifié' : 'a modifié';
    const title = mine.length
      ? `${peopleList(actors)} vous ${actors.length > 1 ? 'ont' : 'a'} attribué ${mine.length > 1 ? `${mine.length} tâches` : 'une tâche'} dans « ${list.name} »`
      : `${peopleList(actors)} ${verb} « ${list.name} »`;
    let body = `${group.count} changement${group.count > 1 ? 's' : ''}`;
    if (detail) {
      const parts = [];
      const assignedNames = mine.map((id) => q.itemName.get(id, list.id)).filter(Boolean);
      if (assignedNames.length) parts.push(`Pour vous : ${nameList(assignedNames)}`);
      for (const [kind, label] of [['added', 'Ajouté'], ['updated', 'Modifié'], ['checked', 'Coché']]) {
        const names = group.items[kind].map((id) => q.itemName.get(id, list.id)).filter(Boolean);
        if (names.length) parts.push(`${label} : ${nameList(names)}`);
      }
      if (parts.length) body = parts.join(' · ');
    }
    return buildMessage({ title, body, navigate: listUrl(list.id), tag: `liste-${list.id}` });
  }

  // Envoie les groupes dont la fenêtre de 60 s est passée
  async function flushDue() {
    const due = [...groups.values()].filter((group) => ctx.now() - group.firstAt >= GROUP_MS);
    const work = [];
    for (const group of due) {
      groups.delete(`${group.userId}:${group.listId}`);
      const list = allowed(group.userId, group.listId, 'changes');
      if (!list) continue;
      // Déjà vu (liste ouverte et visible) : rien à annoncer
      if ((q.seen.get(group.listId, group.userId) ?? 0) >= group.lastEventId) continue;
      work.push(send(group.userId, changesMessage(group, list, settingsOf(group.userId).detail)));
    }
    await Promise.all(work);
  }

  // --- c) Envies : réservation ou participation ---
  // recipients : membres qui voient les réservations (calculés par
  // server/reservations.js) ; actor : { userId } ou { visitorName }
  function wish({ listId, itemId, kind, actor, recipients }) {
    const actorName = actor.userId ? (q.name.get(actor.userId) ?? 'Quelqu\'un') : `${actor.visitorName} (lien public)`;
    for (const userId of new Set(recipients)) {
      const list = allowed(userId, listId, 'wishes', actor.userId ?? null);
      if (!list) continue;
      const detail = settingsOf(userId).detail;
      const itemName = detail ? q.itemName.get(itemId, listId) : null;
      const what = kind === 'join'
        ? (itemName ? `participe à « ${itemName} »` : 'participe à un cadeau')
        : (itemName ? `a réservé « ${itemName} »` : 'a réservé un souhait');
      const message = buildMessage({ title: `${actorName} ${what}`, body: `Liste « ${list.name} »`, navigate: listUrl(listId), tag: `envies-${listId}` });
      send(userId, message, { queue: 'wishes' });
    }
  }

  // --- d) Partage : ajouté à une liste, ou droit changé ---
  function sharing({ listId, userId, actorId, kind }) {
    const list = allowed(userId, listId, 'sharing', actorId);
    if (!list) return;
    const actor = q.name.get(actorId) ?? 'Quelqu\'un';
    const canEdit = q.access.get(listId, userId) === 'modification';
    const message = kind === 'added'
      ? buildMessage({ title: `${actor} vous a ajouté à « ${list.name} »`, body: canEdit ? 'Vous pouvez la modifier.' : 'En lecture seule.', navigate: listUrl(listId), tag: `partage-${listId}` })
      : buildMessage({ title: `Votre droit sur « ${list.name} » a changé`, body: canEdit ? 'Vous pouvez maintenant la modifier.' : 'Elle est maintenant en lecture seule pour vous.', navigate: listUrl(listId), tag: `partage-${listId}` });
    send(userId, message);
  }

  // --- b) Résumé quotidien des échéances ---
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  function digestMessage(tasks, today, detail) {
    const dueToday = tasks.filter((t) => t.due_date === today).length;
    const late = tasks.length - dueToday;
    const parts = [];
    if (dueToday) parts.push(`${plural(dueToday, 'tâche')} à faire aujourd'hui`);
    if (late) parts.push(dueToday ? `${late} en retard` : `${plural(late, 'tâche')} en retard`);
    const lists = [...new Map(tasks.map((t) => [t.list_id, t.list_name])).entries()];
    const body = detail
      ? nameList(tasks.map((t) => t.name)) // les plus en retard d'abord
      : (lists.length === 1 ? `Dans « ${lists[0][1]} »` : `Dans ${lists.length} listes`);
    // Une seule liste : on l'ouvre ; plusieurs : « Mes listes »
    const navigate = lists.length === 1 ? listUrl(lists[0][0]) : `${origin}/#/listes`;
    return buildMessage({ title: parts.join(' · '), body, navigate, tag: 'echeances' });
  }

  // Appelé chaque minute (et une fois au démarrage) : entre 8 h et midi,
  // chaque compte pas encore examiné aujourd'hui l'est, une seule fois
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
      if (!settings.due || !push.hasDevices(userId)) continue;
      const tasks = q.dueTasks.all({ userId, today });
      if (!tasks.length) continue;
      work.push(push.sendToUser(userId, digestMessage(tasks, today, settings.detail), { ttl }));
    }
    await Promise.all(work);
  }

  // Vérifications régulières (arrêtées avec Listo) : groupes toutes les 5 s,
  // résumé des échéances chaque minute, et une première fois peu après le
  // démarrage (serveur redémarré après 8 h)
  const timer = setInterval(() => { flushDue().catch(() => {}); }, FLUSH_EVERY_MS);
  timer.unref?.();
  const digestTimer = setInterval(() => { runDigest().catch(() => {}); }, DIGEST_EVERY_MS);
  digestTimer.unref?.();
  const firstDigest = setTimeout(() => { runDigest().catch(() => {}); }, 5000);
  firstDigest.unref?.();

  return {
    activity, assigned, wish, sharing, flushDue, runDigest, settingsOf, setSettings, mutedLists, setMuted, isMember,
    pending: () => groups.size,
    prune: () => { for (const [userId, times] of sentAt) if (!times.some((t) => t > ctx.now() - HOUR)) sentAt.delete(userId); },
    stop: () => {
      clearInterval(timer);
      clearInterval(digestTimer);
      clearTimeout(firstDigest);
    },
  };
}
