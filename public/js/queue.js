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
import { t } from './i18n.js';

export const OPS_PER_BATCH = 20;
// Taille d'un lot (texte JSON des opérations, en caractères) : une note peut
// avoir 20 000 caractères ; un lot reste bien sous la limite du serveur
// (2 Mo, server/app.js). Une seule opération part toujours, même grosse.
export const BATCH_CHARS = 400000;

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
//   refused(entry, message, code, result)   un élément a été refusé et retiré
//                             (code : nom du texte de refus donné par le
//                             serveur, par exemple 'ops.lectureSeule', s'il y en a un ;
//                             result : la réponse complète, par exemple la
//                             version actuelle d'une note en conflit). Appelé
//                             AVANT le retrait de la file : l'écran le sait
//                             avant tout nouvel enregistrement.
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
  const sending = new Set(); // éléments en cours d'envoi (seq)

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

  // Remplace l'opération d'un élément encore en file, pas en cours d'envoi
  // (enregistrements rapprochés d'une même note : seul le dernier texte
  // part). Renvoie faux si l'élément part déjà ou n'est plus là.
  async function replaceOp(seq, op) {
    const index = entries.findIndex((entry) => entry.seq === seq);
    if (index < 0 || sending.has(seq) || entries[index].kind !== 'op') return false;
    const updated = { ...entries[index], op };
    entries[index] = updated;
    await storage.queuePut(updated);
    return true;
  }

  async function sendOps() {
    const batch = [];
    let chars = 0;
    for (const entry of entries) {
      if (entry.kind !== 'op' || batch.length >= OPS_PER_BATCH) break;
      chars += JSON.stringify(entry.op).length;
      if (batch.length && chars > BATCH_CHARS) break;
      batch.push(entry);
    }
    let results;
    // Envoyés : plus modifiables (replaceOp) jusqu'à leur retrait de la file
    for (const entry of batch) sending.add(entry.seq);
    try {
      results = await transport.sendOps(batch.map((entry) => entry.op));
      for (const [index, entry] of batch.entries()) {
        const result = results?.[index];
        if (!result) return halt(null); // réponse incomplète : on réessaiera
        if (result.status !== 200) emit('refused', entry, result.error || t('reseau.modificationRefusee'), result.code, result);
        await remove(entry.seq);
        sending.delete(entry.seq);
      }
    } catch (error) {
      return halt(error);
    } finally {
      sending.clear();
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
      else emit('refused', entry, error.message, error.data?.code);
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
    // File vide : rien à envoyer. (Sans ce retour, l'envoi se terminerait
    // avant même d'être noté comme en cours, et la file resterait bloquée
    // sur ce résultat.)
    if (!entries.length) return Promise.resolve('done');
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
    replaceOp,
    isSending: (seq) => sending.has(seq),
    flush,
    stop,
    entries: () => [...entries],
    count: () => entries.length,
    busy: () => Boolean(flushing),
  };
}
