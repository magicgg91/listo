// Partage d'une liste ou d'une note (décision du 24 novembre 2026, option
// « B » : un petit choix, puis deux feuilles). Règles pures, sans écran,
// testées automatiquement (test/share-flow.test.js) ; les écrans sont dans
// screens/share-panel.js (le choix et la vue « Personnes ») et
// screens/share-picker.js (la feuille des personnes).
//
// - shareEntry : l'entrée des menus (⋮ d'une liste, ⋯ d'une carte, ⋮ d'une
//   note) : « Partager » pour le propriétaire, « Personnes » pour les autres ;
// - peopleSummary : la ligne sous « Avec des personnes de Listo » ;
// - linkSummary : la ligne sous « Par un lien temporaire », tirée de ce que
//   le téléphone sait déjà (publicLink, envoyé au seul propriétaire) ;
// - membersPayload, membersChanged : ce que la feuille des personnes envoie
//   (PUT …/members), le destinataire d'une liste d'envies toujours en
//   « Peut modifier ».
// Le serveur revérifie tout à chaque requête (server/lists.js setMembers,
// server/notes.js) : ces règles ne servent qu'à l'affichage et à l'envoi.

import { t, compareText } from './i18n.js';
import { namesList } from './format.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Entrée des menus : propriétaire, « Partager » (le choix) ; les autres,
// « Personnes » (qui partage, en lecture). withPeople : faux quand l'écran a
// déjà son propre bouton « Personnes » (barre d'une note ouverte).
export function shareEntry({ owner, withPeople = true }) {
  if (owner) return { icon: 'users', label: t('partage.menu.partager') };
  return withPeople ? { icon: 'users', label: t('partage.menu.personnes') } : null;
}

// Personnes (comptes actifs) avec qui c'est partagé, hors moi : « Léa »,
// « Léa et Zoé », « Hugo, Léa et Zoé », puis « Hugo, Léa et 2 autres
// personnes » ;
// personne : « Seulement vous ».
export function peopleSummary(members, meId) {
  const names = (members ?? [])
    .filter((m) => m.id !== meId && m.active !== false)
    .map((m) => m.displayName)
    .sort((a, b) => compareText(a, b, { sensitivity: 'base' }));
  if (!names.length) return t('partage.choix.personnes.aucune');
  if (names.length <= 3) return namesList(names);
  return namesList([...names.slice(0, 2), t('partage.choix.personnes.autres', { count: names.length - 2 })]);
}

// Temps qui reste avant l'expiration : « expire dans 6 jours »,
// « expire dans 5 heures », « expire dans 12 minutes »
function expiresIn(left) {
  if (left >= 48 * HOUR) return t('partage.choix.lien.jours', { count: Math.round(left / DAY) });
  if (left >= 2 * HOUR) return t('partage.choix.lien.heures', { count: Math.round(left / HOUR) });
  if (left >= MINUTE) return t('partage.choix.lien.minutes', { count: Math.ceil(left / MINUTE) });
  return t('partage.choix.lien.bientot');
}

// État du lien temporaire : { active, text }. publicLink : { expiresAt } ou
// null (comme le serveur l'envoie) ; expiresAt null = sans limite. L'heure
// du téléphone revérifie l'expiration (le serveur la contrôle de toute façon
// à chaque visite). isProtected : vrai si l'on sait (feuille du lien ouverte
// pendant cette visite) que le lien demande un mot de passe ; inconnu :
// rien n'est dit.
export function linkSummary(publicLink, { isProtected = false, now = Date.now() } = {}) {
  const expiresAt = publicLink ? publicLink.expiresAt : undefined;
  if (expiresAt === undefined) return { active: false, text: t('partage.choix.lien.aucun') };
  if (expiresAt === null) {
    return { active: true, text: isProtected ? t('partage.choix.lien.illimite.motDePasse') : t('partage.choix.lien.illimite') };
  }
  const left = Date.parse(expiresAt) - now;
  if (!(left > 0)) return { active: false, text: t('partage.choix.lien.aucun') };
  const expiry = expiresIn(left);
  return { active: true, text: isProtected ? t('partage.choix.lien.actif.motDePasse', { expiry }) : t('partage.choix.lien.actif', { expiry }) };
}

// Ce que la feuille des personnes envoie : guests, les comptes cochés (hors
// propriétaire) ; rights, le droit choisi pour chacun ; beneficiaryId, le
// compte destinataire d'une liste d'envies (toujours « Peut modifier »).
// Une personne cochée sans droit choisi : « Lecture seule ».
export function membersPayload({ guests, rights, beneficiaryId = null }) {
  const userIds = [...guests];
  const access = Object.fromEntries(userIds.map((id) => [id, id === beneficiaryId ? 'modification' : rights.get(id) ?? 'lecture']));
  return { userIds, access };
}

// Le partage voulu diffère-t-il de l'actuel (members : les personnes reçues
// du serveur, propriétaire compris) ?
export function membersChanged(members, { userIds, access }) {
  const before = new Map((members ?? []).filter((m) => !m.isOwner).map((m) => [m.id, m.access ?? 'modification']));
  return before.size !== userIds.length || userIds.some((id) => before.get(id) !== access[id]);
}
