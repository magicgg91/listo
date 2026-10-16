// Historique des articles : forme « normalisée » des noms et autocomplétion.
//
// Ce fichier est partagé : le serveur l'utilise dès maintenant, et le
// téléphone l'utilisera tel quel (étapes 5 et 7) sur sa copie locale de
// l'historique, pour que les suggestions marchent aussi hors ligne.
// Il ne dépend de rien : pas d'accès au réseau, ni à la base, ni à l'écran.

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
// history : liste de { name, nameNormalized, aisleId, useCount, lastUsedAt }
export function suggest(history, typed, limit = 8) {
  const query = normalizeItemName(typed ?? '');
  if (query.length < SUGGEST_MIN_LENGTH) return [];

  return history
    .filter((entry) => {
      const name = entry.nameNormalized;
      return name.startsWith(query) || name.includes(` ${query}`);
    })
    .sort((a, b) =>
      b.useCount - a.useCount
      || String(b.lastUsedAt).localeCompare(String(a.lastUsedAt))
      || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit);
}
