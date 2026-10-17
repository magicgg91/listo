// Copie locale gardée sur le téléphone (IndexedDB), une base par compte :
// « listo-u<numéro du compte> ». Deux comptes sur le même téléphone ne
// partagent donc jamais rien.
//
// Deux rangements :
// - snapshot : la copie des données (ce que /api/sync a renvoyé, plus les
//   modifications pas encore envoyées) ;
// - queue : la file d'attente des modifications à envoyer, dans l'ordre
//   (numéro « seq » croissant), photos comprises.
//
// Aucun mot de passe, jeton ni secret n'y est rangé. La base du compte est
// effacée à la déconnexion.
//
// Si IndexedDB n'est pas disponible (navigation privée sur certains
// téléphones…), une version en mémoire prend le relais : l'application
// marche, mais sans copie gardée d'une visite à l'autre.

const DB_VERSION = 1;

export const dbName = (userId) => `listo-u${Number(userId)}`;

// Ouvre (ou crée) la base d'un compte
export async function openLocal(userId) {
  if (!globalThis.indexedDB) return memoryLocal();
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName(userId), DB_VERSION);
      request.onupgradeneeded = () => {
        const base = request.result;
        if (!base.objectStoreNames.contains('snapshot')) base.createObjectStore('snapshot');
        if (!base.objectStoreNames.contains('queue')) base.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Base locale bloquée'));
    });
  } catch {
    return memoryLocal();
  }

  // Petite aide : une requête IndexedDB devient une promesse
  const run = (storeName, mode, action) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  return {
    persistent: true,
    loadSnapshot: () => run('snapshot', 'readonly', (store) => store.get('state')),
    saveSnapshot: (snapshot) => run('snapshot', 'readwrite', (store) => store.put(snapshot, 'state')),
    queueAll: () => run('queue', 'readonly', (store) => store.getAll()),
    // Ajoute un élément à la file ; renvoie son numéro (seq)
    queueAdd: (entry) => run('queue', 'readwrite', (store) => store.add(entry)),
    queuePut: (entry) => run('queue', 'readwrite', (store) => store.put(entry)),
    queueDelete: (seq) => run('queue', 'readwrite', (store) => store.delete(seq)),
    clearSnapshot: () => run('snapshot', 'readwrite', (store) => store.clear()),
    close: () => db.close(),
  };
}

// Efface la base d'un compte (déconnexion)
export async function deleteLocal(userId) {
  if (!globalThis.indexedDB) return;
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(dbName(userId));
    request.onsuccess = resolve;
    request.onerror = resolve;
    request.onblocked = resolve;
  });
}

// Version en mémoire, même interface (tests, ou IndexedDB indisponible)
export function memoryLocal() {
  let snapshot;
  const queue = new Map();
  let next = 1;
  // Copie (comme le ferait IndexedDB) ; une photo (blob) est gardée telle quelle
  const copy = (value) => {
    if (value === undefined) return undefined;
    if (value?.blob === undefined) return structuredClone(value);
    const { blob, ...rest } = value;
    return { ...structuredClone(rest), blob };
  };
  return {
    persistent: false,
    loadSnapshot: async () => copy(snapshot),
    saveSnapshot: async (value) => { snapshot = copy(value); },
    queueAll: async () => [...queue.values()].sort((a, b) => a.seq - b.seq).map(copy),
    queueAdd: async (entry) => {
      const seq = next++;
      queue.set(seq, { ...copy(entry), seq });
      return seq;
    },
    queuePut: async (entry) => { queue.set(entry.seq, copy(entry)); },
    queueDelete: async (seq) => { queue.delete(seq); },
    clearSnapshot: async () => { snapshot = undefined; },
    close: () => {},
  };
}
