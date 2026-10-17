// File d'attente des modifications (étape 9).
//
// Chaque action de l'utilisateur est d'abord appliquée à la copie locale,
// puis rangée ici (et dans IndexedDB : elle survit à la fermeture de
// l'application). La file part dans l'ordre :
// - opérations (ajouter, cocher, modifier, supprimer…) : par petits lots,
//   via POST /api/ops ; chaque opération a un identifiant unique, le serveur
//   n'applique jamais deux fois la même (renvoi après une coupure) ;
// - photo : envoyée seule (PUT /api/items/<id>/photo), à sa place dans la
//   file, donc toujours après la création de son article ;
// - retrait de photo : DELETE /api/items/<id>/photo.
//
// Trois issues possibles pour un élément :
// - accepté : il sort de la file ;
// - REFUSÉ par le serveur (droits retirés, liste supprimée, magasin
//   désactivé…) : il sort de la file et n'est jamais renvoyé (le serveur a
//   mémorisé ce refus) ; l'application revient à l'état du serveur et
//   prévient l'utilisateur ;
// - pas de réseau, serveur indisponible ou trop sollicité : il RESTE, et la
//   file repart plus tard, avec un délai croissant.
//
// Ce module ne connaît ni l'écran ni le navigateur : le stockage, le réseau
// et les réactions lui sont donnés (tests automatiques sans navigateur).

import { reconnectDelay } from './live.js';

export const OPS_PER_BATCH = 20;

// Erreur passagère (on garde et on réessaie) ou refus définitif (on retire) ?
// Pas de réseau, serveur en panne (5xx), trop de requêtes (429) : passagère.
export function isTemporary(error) {
  if (!error || error.status === undefined) return true; // pas de réponse du serveur
  return error.status >= 500 || error.status === 429 || error.status === 408;
}

// storage : { queueAll, queueAdd, queueDelete } (voir localdb.js)
// transport : { sendOps(ops) → résultats, putPhoto(itemId, jpeg), deletePhoto(itemId) }
// events : réactions (toutes facultatives) :
//   changed()                 la file a changé (nombre en attente)
//   refused(entry, message)   un élément a été refusé et retiré
//   dropped(entry)            photo abandonnée (article supprimé entre-temps)
//   offline(error)            arrêt : pas de réseau ou serveur indisponible
//   unauthorized()            arrêt : session expirée (la file est gardée)
export function createQueue({ storage, transport, events = {}, delay = reconnectDelay, timers = globalThis }) {
  let entries = [];          // copie en mémoire, dans l'ordre (seq croissant)
  let flushing = null;
  let again = false;
  let attempt = 0;
  let retryTimer = null;
  let stopped = false;

  const emit = (name, ...args) => events[name]?.(...args);

  async function load() {
    entries = (await storage.queueAll()).sort((a, b) => a.seq - b.seq);
    emit('changed');
  }

  // Ajoute un élément à la fin de la file ; renvoie l'élément (avec seq)
  async function add(entry) {
    const stored = { ...entry, at: entry.at ?? new Date().toISOString() };
    const seq = await storage.queueAdd(stored);
    const full = { ...stored, seq };
    entries.push(full);
    emit('changed');
    return full;
  }

  async function remove(seq) {
    entries = entries.filter((entry) => entry.seq !== seq);
    await storage.queueDelete(seq);
    emit('changed');
  }

  // Une photo dont l'article sera supprimé plus loin dans la file (sans être
  // remis ensuite) est abandonnée : inutile de l'envoyer
  function deletedLater(photo) {
    let deleted = false;
    for (const entry of entries) {
      if (entry.seq <= photo.seq || entry.kind !== 'op' || entry.op.itemId !== photo.itemId) continue;
      if (entry.op.type === 'item.delete') deleted = true;
      if (entry.op.type === 'item.restore') deleted = false;
    }
    return deleted;
  }

  function scheduleRetry() {
    if (stopped || retryTimer) return;
    const wait = delay(attempt);
    attempt += 1;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      flush();
    }, wait);
  }

  // Arrêt sur une erreur : session expirée (on attend la reconnexion) ou
  // erreur passagère (on réessaiera)
  function halt(error) {
    if (error?.status === 401) {
      emit('unauthorized');
      return 'unauthorized';
    }
    emit('offline', error);
    scheduleRetry();
    return 'offline';
  }

  async function sendOps() {
    const batch = [];
    for (const entry of entries) {
      if (entry.kind !== 'op' || batch.length >= OPS_PER_BATCH) break;
      batch.push(entry);
    }
    let results;
    try {
      results = await transport.sendOps(batch.map((entry) => entry.op));
    } catch (error) {
      return halt(error);
    }
    for (const [index, entry] of batch.entries()) {
      const result = results?.[index];
      if (!result) return halt(null); // réponse incomplète : on réessaiera
      await remove(entry.seq);
      if (result.status !== 200) emit('refused', entry, result.error || 'modification refusée');
    }
    return null;
  }

  async function sendPhoto(entry) {
    if (deletedLater(entry)) {
      await remove(entry.seq);
      emit('dropped', entry);
      return null;
    }
    try {
      if (entry.kind === 'photo') await transport.putPhoto(entry.itemId, entry.blob);
      else await transport.deletePhoto(entry.itemId);
    } catch (error) {
      if (isTemporary(error) || error.status === 401) return halt(error);
      await remove(entry.seq);
      // Article supprimé ailleurs : la suppression l'emporte, photo abandonnée
      if (error.status === 404) emit('dropped', entry);
      else emit('refused', entry, error.message);
      return null;
    }
    await remove(entry.seq);
    return null;
  }

  // Envoie toute la file, dans l'ordre. Renvoie 'done', 'offline',
  // 'unauthorized' ou 'stopped'.
  function flush() {
    if (stopped) return Promise.resolve('stopped');
    if (flushing) {
      again = true;
      return flushing;
    }
    timers.clearTimeout(retryTimer);
    retryTimer = null;
    flushing = (async () => {
      try {
        while (entries.length && !stopped) {
          const first = entries[0];
          const outcome = first.kind === 'op' ? await sendOps() : await sendPhoto(first);
          if (outcome) return outcome;
        }
        attempt = 0;
        return stopped ? 'stopped' : 'done';
      } finally {
        flushing = null;
        if (again && !stopped) {
          again = false;
          if (entries.length) flush();
        }
      }
    })();
    return flushing;
  }

  // Arrête la file (déconnexion) : rien n'est effacé ici
  function stop() {
    stopped = true;
    timers.clearTimeout(retryTimer);
    retryTimer = null;
  }

  return {
    load,
    add,
    remove,
    flush,
    stop,
    entries: () => [...entries],
    count: () => entries.length,
    busy: () => Boolean(flushing),
  };
}
