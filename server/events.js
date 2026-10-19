// Temps réel : flux « Server-Sent Events » (GET /api/events).
//
// Chaque téléphone connecté garde ouverte une connexion vers le serveur. Quand
// une liste change, le serveur envoie à ses membres un message très court :
//
//   event: list
//   data: {"listId":"<identifiant de la liste>"}
//
// Le message ne contient AUCUNE donnée de la liste (ni nom, ni article, ni
// photo) : le téléphone demande ensuite lui-même les changements par
// /api/sync, avec tous les contrôles d'accès habituels. Après un changement
// de catégorie, de magasin ou de rayon par l'Admin, tous les téléphones
// connectés reçoivent « event: refs » (sans données non plus).
//
// Règles :
// - seulement les comptes connectés ; la session est revérifiée à chaque
//   signal de maintien (25 s) : session fermée, expirée ou compte désactivé,
//   le flux est coupé ;
// - un message ne part qu'aux membres actifs de la liste, après l'écriture
//   réussie en base ;
// - 5 connexions au plus par compte : au-delà, la plus ancienne est fermée ;
// - une connexion fermée est retirée tout de suite (aucune fuite de mémoire).

export const KEEPALIVE_MS = 25 * 1000;
export const MAX_CONNECTIONS_PER_USER = 5;

export function createEventHub(ctx, { keepaliveMs = KEEPALIVE_MS, maxPerUser = MAX_CONNECTIONS_PER_USER } = {}) {
  const { db } = ctx;
  const byUser = new Map(); // compte -> connexions (dans l'ordre d'ouverture)

  const stillValid = db.prepare(`
    SELECT 1 FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ? AND users.active = 1
  `).pluck();
  const activeMembers = db.prepare(`
    SELECT list_members.user_id FROM list_members JOIN users ON users.id = list_members.user_id
    WHERE list_members.list_id = ? AND users.active = 1
  `).pluck();

  // Ferme une connexion et l'oublie
  function close(connection) {
    if (connection.closed) return;
    connection.closed = true;
    clearInterval(connection.timer);
    const list = byUser.get(connection.userId);
    if (list) {
      list.delete(connection);
      if (list.size === 0) byUser.delete(connection.userId);
    }
    connection.res.end();
  }

  function write(connection, text) {
    if (!connection.closed) connection.res.write(text);
  }

  // Ouvre le flux pour le compte connecté de cette requête
  function connect(req, res) {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx : ne pas retenir les messages
    });
    res.flushHeaders();

    const connection = { userId: req.user.id, sessionId: req.sessionId, res, closed: false, timer: null };
    let list = byUser.get(connection.userId);
    if (!list) {
      list = new Set();
      byUser.set(connection.userId, list);
    }
    // Plafond : la plus ancienne connexion de ce compte laisse la place
    while (list.size >= maxPerUser) close(list.values().next().value);
    list.add(connection);

    // Premier message : le téléphone sait que le flux est ouvert
    write(connection, 'retry: 5000\nevent: ready\ndata: {}\n\n');

    // Signal de maintien, et nouvelle vérification de la session
    connection.timer = setInterval(() => {
      if (stillValid.get(connection.sessionId, new Date(ctx.now()).toISOString()) !== 1) close(connection);
      else write(connection, ': ping\n\n');
    }, keepaliveMs);
    connection.timer.unref?.();

    // Téléphone parti (réseau coupé, onglet fermé…) : connexion libérée
    req.on('close', () => close(connection));
    res.on('error', () => close(connection));
  }

  // Prévient les comptes donnés qu'une liste a changé
  function notifyUsers(userIds, listId) {
    const message = `event: list\ndata: ${JSON.stringify({ listId })}\n\n`;
    for (const userId of new Set(userIds)) {
      for (const connection of byUser.get(userId) ?? []) write(connection, message);
    }
  }

  // Prévient les membres actifs d'une liste (relus dans la base au moment de
  // l'envoi : une personne retirée du partage ou un compte désactivé ne reçoit plus rien)
  function notifyList(listId, { alsoUsers = [] } = {}) {
    notifyUsers([...activeMembers.all(listId), ...alsoUsers], listId);
  }

  // Prévient tous les téléphones connectés que les données de référence
  // (catégories, magasins, rayons) ont changé : chacun refait une
  // synchronisation, qui les renvoie en entier. Le message ne dit pas quoi
  // (aucune donnée), comme pour une liste.
  function notifyReferences() {
    const message = 'event: refs\ndata: {}\n\n';
    for (const connections of byUser.values()) for (const connection of connections) write(connection, message);
  }

  // Coupe les flux d'un compte (désactivation, toutes ses sessions fermées)
  function disconnectUser(userId) {
    for (const connection of [...(byUser.get(userId) ?? [])]) close(connection);
  }

  // Coupe les flux ouverts avec une session (déconnexion)
  function disconnectSession(sessionId) {
    for (const list of [...byUser.values()]) {
      for (const connection of [...list]) if (connection.sessionId === sessionId) close(connection);
    }
  }

  // Nombre de connexions ouvertes (pour un compte, ou en tout)
  function count(userId) {
    if (userId !== undefined) return byUser.get(userId)?.size ?? 0;
    let total = 0;
    for (const list of byUser.values()) total += list.size;
    return total;
  }

  function closeAll() {
    for (const list of [...byUser.values()]) for (const connection of [...list]) close(connection);
  }

  return { connect, notifyList, notifyUsers, notifyReferences, disconnectUser, disconnectSession, count, closeAll };
}

// Refuse un flux demandé depuis un autre site. Un navigateur n'envoie pas
// toujours l'en-tête Origin sur une lecture (GET) : quand il est là, ou quand
// Sec-Fetch-Site dit « autre site », il doit correspondre à Listo. (Le cookie
// de session, SameSite=Lax, n'est de toute façon pas envoyé par un autre site.)
export function sameSiteOnly(publicUrl) {
  const allowed = new URL(publicUrl).origin;
  return (req, res, next) => {
    const origin = req.get('origin');
    if ((origin && origin !== allowed) || req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: 'Requête refusée : origine inconnue.' });
    }
    next();
  };
}
