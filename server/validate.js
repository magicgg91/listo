// Vérification des données reçues du téléphone. Le serveur ne fait jamais
// confiance à ce qu'il reçoit : chaque valeur est contrôlée ici avant d'être
// enregistrée.

// Identifiant : 2 à 50 caractères parmi lettres sans accent, chiffres, . _ -
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,50}$/;
export const USERNAME_RULE = 'Identifiant invalide : 2 à 50 caractères (lettres sans accent, chiffres, . _ -).';

export function isValidUsername(value) {
  return typeof value === 'string' && USERNAME_PATTERN.test(value);
}

// Nettoie un nom saisi (catégorie, magasin, rayon, nom affiché) : espaces en
// trop retirés. Renvoie null si le nom est absent, vide ou trop long.
export function cleanName(value, max = 100) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length === 0 || name.length > max) return null;
  return name;
}

// Forme « comparable » d'un nom : sans majuscules ni accents. Deux noms qui
// ont la même forme comparable sont considérés comme des doublons
// (« Épicerie », « épicerie » et « EPICERIE » ne font qu'un).
export function comparableName(name) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
}

// Numéro (id) passé dans l'adresse : entier positif, ou null s'il est invalide
export function parseId(value) {
  return /^[1-9]\d{0,15}$/.test(String(value)) ? Number(value) : null;
}
