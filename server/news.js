// Nouveautés d'une liste partagée (migration 16) : ce que les AUTRES membres
// ont ajouté ou modifié depuis ma dernière consultation.
//
// - Journal (list_events) : chaque opération sur un élément y laisse une
//   ligne (liste, auteur, type, élément, date) ; aucun texte d'élément n'est
//   recopié. Types : 'add', 'update' (nom, quantité, note, rayon, magasin,
//   priorité, échéance, photo, code-barres), 'check', 'uncheck', 'delete'.
//   « Annuler » une suppression n'écrit rien (décision du 30 octobre 2026).
// - Repère de lecture (list_reads) : pour chaque membre, le dernier
//   événement vu. Il ne fait que monter (requête « vu », rejouable). Un
//   nouveau membre démarre à son arrivée ; un membre retiré, ou qui quitte
//   la liste, perd son repère ; la suppression d'une liste efface son journal.
// - Nettoyage : événements de plus de 30 jours, et 500 au plus par liste.
//   Un repère plus ancien que le journal gardé est marqué « behind » :
//   l'écran affiche « 30+ ».
// - Nouveautés d'une personne : les éléments (non supprimés) ajoutés ou
//   modifiés par quelqu'un d'autre depuis son repère ; un élément compte une
//   fois. Jamais ses propres actions ; ni les suppressions ; les cochés et
//   décochés seulement avec « Signaler aussi les cochés ». Rien pour une
//   liste en sourdine, ni quand « Nouveautés » est désactivé.
// - Confidentialité : seuls les membres reçoivent les nouveautés d'une liste
//   (et le nom des auteurs) ; le lien public n'en reçoit rien.

export const EVENT_TYPES = ['add', 'update', 'check', 'uncheck', 'delete'];
export const MAX_EVENTS_PER_LIST = 500;
export const KEEP_DAYS = 30;
export const FORMER_MEMBER = 'un ancien membre';

export function createNewsService(ctx) {
  const { db } = ctx;
  const nowIso = () => new Date(ctx.now()).toISOString();

  const q = {
    insert: db.prepare('INSERT INTO list_events (list_id, user_id, type, item_id, created_at) VALUES (?, ?, ?, ?, ?)'),
    lastId: db.prepare('SELECT COALESCE(MAX(id), 0) FROM list_events WHERE list_id = ?').pluck(),
    // Repère d'un nouveau membre : la fin du journal de la liste (il ne voit
    // pas l'historique comme nouveau)
    ensureRead: db.prepare(`INSERT OR IGNORE INTO list_reads (list_id, user_id, last_seen)
      VALUES (?, ?, (SELECT COALESCE(MAX(id), 0) FROM list_events WHERE list_id = ?))`),
    ensureMine: db.prepare(`INSERT OR IGNORE INTO list_reads (list_id, user_id, last_seen)
      SELECT list_members.list_id, list_members.user_id,
             COALESCE((SELECT MAX(id) FROM list_events WHERE list_events.list_id = list_members.list_id), 0)
      FROM list_members WHERE list_members.user_id = ?`),
    read: db.prepare('SELECT * FROM list_reads WHERE list_id = ? AND user_id = ?'),
    dropRead: db.prepare('DELETE FROM list_reads WHERE list_id = ? AND user_id = ?'),
    // Coupe d'un journal : tout ce qui est avant ou égal à « id » est
    // effacé ; les repères plus anciens deviennent « behind »
    cutEvents: db.prepare('DELETE FROM list_events WHERE list_id = ? AND id <= ?'),
    markBehind: db.prepare('UPDATE list_reads SET behind = 1 WHERE list_id = ? AND last_seen < ?'),
    capCut: db.prepare('SELECT id FROM list_events WHERE list_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?').pluck(),
    settings: db.prepare('SELECT news_enabled, news_checks FROM users WHERE id = ?'),
    myReads: db.prepare(`
      SELECT list_reads.list_id, list_reads.last_seen, list_reads.behind, list_reads.muted,
             (SELECT COALESCE(MAX(id), 0) FROM list_events WHERE list_events.list_id = list_reads.list_id) AS last_event
      FROM list_reads
      JOIN list_members ON list_members.list_id = list_reads.list_id AND list_members.user_id = list_reads.user_id
      JOIN lists ON lists.id = list_reads.list_id AND lists.deleted_at IS NULL
      WHERE list_reads.user_id = ?
    `),
    // Événements des autres depuis mon repère, sur des éléments encore là,
    // dans mes listes (membre), hors sourdine
    myEvents: db.prepare(`
      SELECT list_events.list_id, list_events.item_id, list_events.type, list_events.user_id,
             users.display_name, users.active
      FROM list_events
      JOIN list_reads ON list_reads.list_id = list_events.list_id AND list_reads.user_id = :me
      JOIN list_members ON list_members.list_id = list_events.list_id AND list_members.user_id = :me
      JOIN lists ON lists.id = list_events.list_id AND lists.deleted_at IS NULL
      JOIN items ON items.id = list_events.item_id AND items.deleted_at IS NULL AND items.list_id = list_events.list_id
      LEFT JOIN users ON users.id = list_events.user_id
      WHERE list_events.id > list_reads.last_seen AND list_reads.muted = 0
        AND (list_events.user_id IS NULL OR list_events.user_id != :me)
        AND list_events.type IN ('add', 'update', 'check', 'uncheck')
      ORDER BY list_events.id
    `),
  };

  // Garde au plus MAX_EVENTS_PER_LIST événements dans une liste
  function capList(listId) {
    const cut = q.capCut.get(listId, MAX_EVENTS_PER_LIST);
    if (!cut) return;
    q.cutEvents.run(listId, cut);
    q.markBehind.run(listId, cut);
  }

  // Note ce qu'un membre vient de faire sur des éléments d'une liste. Ses
  // propres actions ne sont jamais des nouveautés pour lui : s'il était à
  // jour, son repère suit (aucune requête « vu » à envoyer après un ajout).
  function log(listId, userId, type, itemIds) {
    if (!EVENT_TYPES.includes(type)) throw new Error(`Type d'événement inconnu : ${type}`);
    if (!itemIds.length) return;
    const before = q.lastId.get(listId);
    const now = nowIso();
    let last = before;
    for (const itemId of itemIds) last = Number(q.insert.run(listId, userId, type, itemId, now).lastInsertRowid);
    db.prepare('UPDATE list_reads SET last_seen = ? WHERE list_id = ? AND user_id = ? AND last_seen >= ?').run(last, listId, userId, before);
    capList(listId);
  }

  // Repère d'un membre qui arrive dans une liste (création, partage, copie)
  function startReading(listId, userId) {
    q.ensureRead.run(listId, userId, listId);
  }

  // Membre retiré, ou qui quitte la liste : il perd son repère (et sa sourdine)
  function stopReading(listId, userId) {
    q.dropRead.run(listId, userId);
  }

  // Liste supprimée : son journal et ses repères disparaissent avec elle
  function dropList(listId) {
    db.prepare('DELETE FROM list_events WHERE list_id = ?').run(listId);
    db.prepare('DELETE FROM list_reads WHERE list_id = ?').run(listId);
  }

  // « Vu » : le repère monte jusqu'à upTo (jamais au-delà de la fin du
  // journal, jamais vers le bas). Arrivé à la fin du journal, « behind »
  // retombe. Renvoie vrai si quelque chose a changé. Le membre a été vérifié
  // par l'appelant.
  function markSeen(listId, userId, upTo) {
    q.ensureRead.run(listId, userId, listId);
    const last = q.lastId.get(listId);
    const read = q.read.get(listId, userId);
    const target = Math.min(upTo, last);
    const seen = Math.max(read.last_seen, target);
    const behind = upTo >= last ? 0 : read.behind;
    if (seen === read.last_seen && behind === read.behind) return false;
    db.prepare('UPDATE list_reads SET last_seen = ?, behind = ? WHERE list_id = ? AND user_id = ?').run(seen, behind, listId, userId);
    return true;
  }

  // « Ne plus me signaler cette liste » / « Signaler cette liste »
  function setMuted(listId, userId, muted) {
    q.ensureRead.run(listId, userId, listId);
    return db.prepare('UPDATE list_reads SET muted = ? WHERE list_id = ? AND user_id = ? AND muted != ?')
      .run(Number(muted), listId, userId, Number(muted)).changes > 0;
  }

  // Réglages du compte : « Nouveautés », « Signaler aussi les cochés »
  function setSettings(userId, { enabled, checks }) {
    const current = q.settings.get(userId);
    const next = {
      news_enabled: enabled === undefined ? current.news_enabled : Number(enabled),
      news_checks: checks === undefined ? current.news_checks : Number(checks),
    };
    db.prepare('UPDATE users SET news_enabled = ?, news_checks = ? WHERE id = ?').run(next.news_enabled, next.news_checks, userId);
    return next.news_enabled !== current.news_enabled || next.news_checks !== current.news_checks;
  }

  // Nouveautés d'une personne, pour toutes ses listes :
  // { enabled, checks, lists: { <id>: { count, behind, muted, seen,
  //   lastEventId, items: [{ itemId, kind: 'added'|'updated'|'checked'|'unchecked', by }] } } }
  // Un élément compte une fois : « ajouté » l'emporte (avec la personne qui
  // l'a ajouté) ; sinon, le dernier changement et son auteur.
  function newsFor(user) {
    q.ensureMine.run(user.id); // repère manquant (liste partagée avant la mise à jour…) : posé maintenant
    const settings = q.settings.get(user.id);
    const enabled = settings?.news_enabled === 1;
    const checks = settings?.news_checks === 1;
    const lists = {};
    for (const read of q.myReads.all(user.id)) {
      lists[read.list_id] = {
        count: 0,
        behind: enabled && read.muted === 0 && read.behind === 1,
        muted: read.muted === 1,
        seen: read.last_seen, // mon repère
        lastEventId: read.last_event, // fin du journal de la liste
        items: [],
      };
    }
    if (enabled) {
      const byItem = new Map();
      for (const event of q.myEvents.all({ me: user.id })) {
        if (!checks && (event.type === 'check' || event.type === 'uncheck')) continue;
        const by = event.user_id === null || event.active !== 1 ? FORMER_MEMBER : event.display_name;
        const key = `${event.list_id}/${event.item_id}`;
        const entry = byItem.get(key);
        if (event.type === 'add') {
          byItem.set(key, { listId: event.list_id, itemId: event.item_id, kind: 'added', by });
        } else if (!entry || entry.kind !== 'added') {
          const kind = event.type === 'update' ? 'updated' : event.type === 'check' ? 'checked' : 'unchecked';
          byItem.set(key, { listId: event.list_id, itemId: event.item_id, kind, by });
        }
      }
      for (const { listId, itemId, kind, by } of byItem.values()) {
        const list = lists[listId];
        if (!list) continue;
        list.items.push({ itemId, kind, by });
        list.count += 1;
      }
    }
    return { enabled, checks, lists };
  }

  // Nettoyage périodique : événements de plus de 30 jours, puis plafond par
  // liste. Renvoie le nombre d'événements effacés.
  function purgeOld() {
    const limit = new Date(ctx.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let removed = 0;
    db.transaction(() => {
      for (const { list_id: listId, upto } of db.prepare('SELECT list_id, MAX(id) AS upto FROM list_events WHERE created_at < ? GROUP BY list_id').all(limit)) {
        removed += q.cutEvents.run(listId, upto).changes;
        q.markBehind.run(listId, upto);
      }
      for (const listId of db.prepare('SELECT list_id FROM list_events GROUP BY list_id HAVING COUNT(*) > ?').pluck().all(MAX_EVENTS_PER_LIST)) {
        const before = db.prepare('SELECT COUNT(*) FROM list_events WHERE list_id = ?').pluck().get(listId);
        capList(listId);
        removed += before - db.prepare('SELECT COUNT(*) FROM list_events WHERE list_id = ?').pluck().get(listId);
      }
    })();
    return removed;
  }

  return { log, startReading, stopReading, dropList, markSeen, setMuted, setSettings, newsFor, purgeOld };
}
