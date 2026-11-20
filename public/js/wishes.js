// Listes d'envies (idées cadeaux) : règles partagées entre le serveur et le
// téléphone.
//
// - Bénéficiaire : la personne à qui la liste est destinée, fixée à la
//   création. Un compte (forUserId), une personne sans compte (forName,
//   simple prénom), ou, sans l'un ni l'autre, le propriétaire (« Moi »).
// - Réservations : un proche réserve un souhait pour éviter les doublons.
//   RÈGLE CRITIQUE : le bénéficiaire ne doit jamais savoir qu'un souhait est
//   réservé, ni par qui, ni combien. Le serveur filtre lui-même chaque canal
//   (server/reservations.js) ; ce module dit seulement QUI peut les voir.
//   Le filtre repose sur l'identité du compte, jamais sur son appartenance à
//   la liste : un bénéficiaire qui quitte la liste puis y revient reste exclu.
// - Gestionnaire : le propriétaire, quand il n'est pas le bénéficiaire (liste
//   créée pour un autre compte ou pour une personne sans compte). Il voit
//   les réservations et peut libérer celles des autres.
// - « Reçu » (l'élément coché) : marqué par le bénéficiaire (s'il a un
//   compte) ou par le propriétaire ; sans aucun lien avec la réservation.
//
// list : { ownerId, forUserId, forName } (forme du téléphone), voir
// wishListOf() pour une ligne de la base.

import { formatMoney, t, getLocale, intlTag } from './i18n.js';

export const FOR_NAME_MAX = 80;
export const LINK_MAX = 500;
export const PRICE_MAX_CENTS = 10000000; // 100 000 €

// Ligne de la base (owner_id, for_user_id, for_name) -> forme commune
export const wishListOf = (row) => ({ ownerId: row.owner_id, forUserId: row.for_user_id ?? null, forName: row.for_name ?? null });

// Identifiant du compte bénéficiaire, ou null (personne sans compte)
export function beneficiaryId(list) {
  if (list.forUserId) return list.forUserId;
  if (list.forName) return null;
  return list.ownerId;
}

// Ce compte peut-il voir les réservations de cette liste ? Tout membre sauf
// le bénéficiaire (l'appartenance à la liste est vérifiée à part).
export const seesReservations = (userId, list) => beneficiaryId(list) !== userId;

// Gestionnaire : le propriétaire, s'il n'est pas le bénéficiaire
export const isManager = (userId, list) => list.ownerId === userId && seesReservations(userId, list);

// Peut marquer un souhait « reçu » : le bénéficiaire (compte) ou le propriétaire
export const mayMarkReceived = (userId, list) => list.ownerId === userId || (list.forUserId !== null && list.forUserId === userId);

// Lien d'un souhait : http ou https seulement, 500 caractères au plus, sans
// identifiant ni mot de passe dans l'adresse. Renvoie l'adresse normalisée,
// ou null si elle n'est pas acceptable. Le serveur ne l'appelle jamais.
export function cleanLink(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > LINK_MAX || /[\s\u0000-\u001f\u007f]/.test(text)) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || !url.hostname) return null;
  return url.href.length <= LINK_MAX ? url.href : null;
}

// Prix saisi (« 25 », « 25,5 », « 25,50 », « 1 234,90 », « 12.99 € ») en
// centimes ; null si vide ; NaN si invalide. En anglais (langue des écrans,
// ou « locale »), la virgule sépare aussi les milliers : « $1,234.90 ».
export function parsePrice(text, { locale = getLocale() } = {}) {
  if (text === undefined || text === null) return null;
  let clean = String(text).replace(/[\s  €]/g, '').replace(/[$£]/g, '');
  // Langue au point décimal (anglais) : « 1,234.90 », virgules des
  // milliers retirées
  const decimal = new Intl.NumberFormat(intlTag(locale)).formatToParts(1.5).find((part) => part.type === 'decimal')?.value;
  if (decimal === '.' && /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(clean)) clean = clean.replaceAll(',', '');
  clean = clean.replace(',', '.');
  if (!clean) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  const cents = Math.round(Number(clean) * 100);
  return cents <= PRICE_MAX_CENTS ? cents : Number.NaN;
}

// Prix en centimes -> « 25,50 € » (espaces insécables français), dans la
// langue des écrans et la monnaie de l'installation (public/js/i18n.js)
export function formatPrice(cents) {
  return formatMoney(cents);
}

// Prix déjà enregistré, écrit dans le champ de saisie (sans monnaie ni
// séparateur des milliers) : « 24,90 » en français, « 24.90 » en anglais ;
// vide sans prix
export function priceInputText(cents, { locale = getLocale() } = {}) {
  if (!Number.isInteger(cents)) return '';
  return new Intl.NumberFormat(intlTag(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100);
}

// Sous-titre d'une liste d'envies (telle que décrite par le serveur) : à qui
// elle est destinée, « Pour vous » pour le bénéficiaire lui-même.
// inline : la forme placée après un autre mot (« Envies · pour Léa »,
// sous-titre de l'ordinateur), écrite en entier dans le dictionnaire
export function wishForLabel(list, { inline = false } = {}) {
  if (list.isBeneficiary) return inline ? t('regles.envies.pourVous.suite') : t('regles.envies.pourVous');
  const name = list.forDisplayName ?? list.forName ?? list.members?.find((m) => m.isOwner)?.displayName;
  if (!name) return t('regles.envies.sansDestinataire');
  return inline ? t('regles.envies.pour.suite', { name }) : t('regles.envies.pour', { name });
}
