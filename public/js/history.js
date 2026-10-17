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
    } else {
      entry = { name, nameNormalized: key, storeId: lineStore, aisleId, useCount: Math.max(count, 1), lastUsedAt: now };
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
    } else {
      entry = { name, nameNormalized: key, storeId: to, aisleId: null, useCount: 1, lastUsedAt: now };
      history.push(entry);
    }
    touched.push(entry);
  }
  return touched;
}
