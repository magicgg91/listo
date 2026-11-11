// Historique des articles : forme « normalisée » des noms et autocomplétion.
//
// Ce fichier est partagé : le serveur et le téléphone l'utilisent tel quel
// (le téléphone sur sa copie locale de l'historique, pour que les
// suggestions, le rayon et le magasin automatiques marchent aussi hors ligne).
// Il ne dépend de rien : pas d'accès au réseau, ni à la base, ni à l'écran.
//
// Une entrée d'historique : { name, nameNormalized, storeId, aisleId,
// useCount, lastUsedAt }. Pour chaque article, il y a une ligne générale
// (storeId vide) et, s'il a servi dans un magasin, une ligne par magasin :
// - la ligne générale alimente l'autocomplétion et le rayon habituel ;
// - une ligne de magasin donne le rayon habituel dans ce magasin (liste à
//   magasin simple) et le nombre d'achats dans ce magasin (liste « multi »).

// Nom normalisé : minuscules, sans accents, sans espaces superflus.
// « Lait », « lait », « LAIT » et « Lait  » donnent tous « lait ».
export function normalizeItemName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')      // retire les accents
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, ' ')        // un seul espace entre les mots
    .trim();
}

// Nombre minimal de lettres avant de proposer des suggestions
export const SUGGEST_MIN_LENGTH = 2;

// Suggestions pour un début de saisie : les articles dont un mot commence
// par ce qui a été tapé (« la » trouve « Lait » et « Pain au lait »), les
// plus fréquents d'abord, puis les plus récents.
//
// Seules les lignes générales comptent (une suggestion par article).
export function suggest(history, typed, limit = 8) {
  const query = normalizeItemName(typed ?? '');
  if (query.length < SUGGEST_MIN_LENGTH) return [];

  return history
    .filter((entry) => {
      if (entry.storeId !== null && entry.storeId !== undefined) return false;
      const name = entry.nameNormalized;
      return name.startsWith(query) || name.includes(` ${query}`);
    })
    .sort((a, b) =>
      b.useCount - a.useCount
      || String(b.lastUsedAt).localeCompare(String(a.lastUsedAt))
      || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit);
}

// Articles habituels (« Souvent ajoutés », décision du 11 novembre 2026) :
// les plus ajoutés dans le ou les magasins de la liste (storeIds ; liste sans
// magasin : lignes générales), parmi ceux ajoutés ces HABITUAL_DAYS derniers
// jours, sans ceux de exclude (noms normalisés : déjà à acheter). Liste
// « multi » : les ajouts de ses magasins sont additionnés. now : date ISO.
// Renvoie au plus limit entrées { name, nameNormalized, useCount, lastUsedAt },
// les plus ajoutées d'abord, puis les plus récentes.
export const HABITUAL_DAYS = 60;
export const HABITUAL_LIMIT = 6;
// Téléphone, clavier ouvert : 4 seulement, sinon l'encart sort de l'écran
// (constat sur iPhone, 11 novembre 2026)
export const HABITUAL_LIMIT_KEYBOARD = 4;
export function habitual(history, { storeIds = [], exclude = new Set(), now, days = HABITUAL_DAYS, limit = HABITUAL_LIMIT } = {}) {
  const since = new Date(Date.parse(now) - days * 24 * 3600 * 1000).toISOString();
  const stores = new Set(storeIds);
  // Nom affiché : celui de la ligne générale (première saisie)
  const shown = new Map(history.filter((e) => (e.storeId ?? null) === null).map((e) => [e.nameNormalized, e.name]));
  const totals = new Map();
  for (const entry of history) {
    const line = entry.storeId ?? null;
    const inScope = stores.size ? stores.has(line) : line === null;
    if (!inScope || !(entry.useCount > 0) || String(entry.lastUsedAt) < since || exclude.has(entry.nameNormalized)) continue;
    if (entry.hiddenAt) continue; // retiré de « Souvent ajoutés » (hideHabitual)
    const key = entry.nameNormalized;
    const total = totals.get(key) ?? { name: shown.get(key) ?? entry.name, nameNormalized: key, useCount: 0, lastUsedAt: '' };
    total.useCount += entry.useCount;
    if (String(entry.lastUsedAt) > total.lastUsedAt) total.lastUsedAt = String(entry.lastUsedAt);
    totals.set(key, total);
  }
  return [...totals.values()]
    .sort((a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt) || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit);
}

// Vrai si l'article est déjà connu (ligne générale de l'historique)
export function isKnownName(history, name) {
  const key = normalizeItemName(name);
  return history.some((entry) => entry.nameNormalized === key && (entry.storeId ?? null) === null);
}

// Rayon habituel d'un article dans une liste à magasin simple : d'abord son
// rayon dans ce magasin, sinon son rayon général. isActiveAisle(id) dit si
// un rayon peut encore être proposé (un rayon désactivé est ignoré).
// Renvoie l'identifiant du rayon, ou null.
export function usualAisle(history, name, storeId, isActiveAisle) {
  const key = normalizeItemName(name);
  const lines = history.filter((entry) => entry.nameNormalized === key);
  const forStore = storeId === null || storeId === undefined ? null : lines.find((entry) => entry.storeId === storeId);
  const general = lines.find((entry) => (entry.storeId ?? null) === null);
  for (const entry of [forStore, general]) {
    if (entry && entry.aisleId !== null && entry.aisleId !== undefined && isActiveAisle(entry.aisleId)) return entry.aisleId;
  }
  return null;
}

// Magasin habituel d'un article dans une liste « multi » : parmi les magasins
// proposés (storeIds : magasins regroupés et actifs), celui où l'article a
// été acheté le plus souvent ; en cas d'égalité, le plus récent.
// Renvoie l'identifiant du magasin, ou null si l'article n'y a jamais été acheté.
export function usualStore(history, name, storeIds) {
  const key = normalizeItemName(name);
  const allowed = new Set(storeIds);
  const best = history
    .filter((entry) => entry.nameNormalized === key && allowed.has(entry.storeId) && entry.useCount > 0)
    .sort((a, b) => b.useCount - a.useCount || String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))[0];
  return best ? best.storeId : null;
}

// Enregistre une utilisation d'un article dans l'historique (règle commune au
// serveur et au téléphone). Met à jour la ligne générale et, si storeId est
// donné, la ligne de ce magasin ; les crée si besoin.
// - count : 1 pour un ajout (une utilisation de plus), 0 pour une modification ;
// - aisleId : rayon à mémoriser, s'il est connu (un article « Sans rayon »
//   n'efface pas un rayon habituel) ;
// - le nom affiché reste celui de la première saisie.
// Modifie le tableau history et renvoie les lignes touchées.
export function recordUse(history, { name, storeId = null, aisleId = null, count = 1, now }) {
  const key = normalizeItemName(name);
  const touched = [];
  for (const lineStore of storeId === null ? [null] : [null, storeId]) {
    let entry = history.find((e) => e.nameNormalized === key && (e.storeId ?? null) === lineStore);
    if (entry) {
      entry.useCount += count;
      entry.lastUsedAt = now;
      if (aisleId !== null) entry.aisleId = aisleId;
      if (count > 0) entry.hiddenAt = null; // racheté : revient dans « Souvent ajoutés »
    } else {
      entry = { name, nameNormalized: key, storeId: lineStore, aisleId, useCount: Math.max(count, 1), lastUsedAt: now, hiddenAt: null };
      history.push(entry);
    }
    touched.push(entry);
  }
  return touched;
}

// Reporte un achat d'un magasin sur un autre : l'article a changé de magasin
// dans une liste « multi » (from ou to peuvent être vides : « Sans magasin »).
// La ligne générale ne change pas. Renvoie les lignes touchées.
export function moveUse(history, { name, from = null, to = null, now }) {
  const key = normalizeItemName(name);
  const touched = [];
  const old = from === null ? null : history.find((e) => e.nameNormalized === key && e.storeId === from);
  if (old) {
    old.useCount = Math.max(0, old.useCount - 1);
    touched.push(old);
  }
  if (to !== null) {
    let entry = history.find((e) => e.nameNormalized === key && e.storeId === to);
    if (entry) {
      entry.useCount += 1;
      entry.lastUsedAt = now;
      entry.hiddenAt = null;
    } else {
      entry = { name, nameNormalized: key, storeId: to, aisleId: null, useCount: 1, lastUsedAt: now, hiddenAt: null };
      history.push(entry);
    }
    touched.push(entry);
  }
  return touched;
}

// Retire un article de « Souvent ajoutés » (décision du 11 novembre 2026),
// pour toute la famille, dans le ou les magasins d'une liste (storeIds ;
// liste sans magasin : ligne générale). La date est notée sur ces lignes ;
// le prochain ajout de l'article l'efface (recordUse) : il revient s'il est
// racheté. Modifie le tableau history et renvoie les lignes touchées.
export function hideHabitual(history, { name, storeIds = [], now }) {
  const key = normalizeItemName(name);
  const scope = new Set(storeIds.length ? storeIds : [null]);
  const touched = history.filter((entry) => entry.nameNormalized === key && scope.has(entry.storeId ?? null));
  for (const entry of touched) entry.hiddenAt = now;
  return touched;
}
