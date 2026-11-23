// Réglage « Accueil » d'un compte (Réglages › Accueil, migration 40) :
// Accueil affiché ou coupé, premier écran, ordre des tuiles et tuiles
// masquées. Le même sur tous les appareils de la personne : envoyé avec
// /api/me et chaque synchronisation (/api/sync, « home »), modifié par l'opération
// « account.home » (/api/ops, file d'attente : hors ligne compris).
//
// Chacun ne lit et ne modifie que son propre réglage : le compte vient
// toujours de la session (jamais d'un identifiant envoyé par le téléphone).
// Les règles (tuiles connues, chacune une fois, « Compte » jamais masqué,
// premier écran possible) sont celles de public/js/home-tiles.js, vérifiées
// ici avant toute écriture. Rien de tout cela n'est montré aux assistants IA
// ni sur le lien public.

import { normalizeHome, homeChangeProblem, applyHomeChange } from '../public/js/home-tiles.js';

// Réglage lu dans une ligne de la table users (complet ; valeurs de départ
// si rien n'est choisi). Sert aussi à /api/me (server/auth.js, publicUser) :
// à l'ouverture, le téléphone connaît le premier écran avant même la
// synchronisation.
export function homeFromRow(row) {
  if (!row || row.home_enabled === undefined) return normalizeHome(null);
  let tiles = null;
  try {
    tiles = row.home_tiles ? JSON.parse(row.home_tiles) : null;
  } catch {
    tiles = null; // texte abîmé : ordre de départ
  }
  return normalizeHome({ enabled: row.home_enabled === 1, start: row.home_start, order: tiles?.order, hidden: tiles?.hidden });
}

export function createHome(db) {
  const read = db.prepare('SELECT home_enabled, home_start, home_tiles FROM users WHERE id = ?');
  const write = db.prepare('UPDATE users SET home_enabled = ?, home_start = ?, home_tiles = ? WHERE id = ?');

  // Réglage d'une personne
  const homeFor = (userId) => homeFromRow(read.get(userId));

  // Modifie le réglage de la personne. change : { enabled?, start?, order?,
  // hidden? }. Renvoie { problem } (nom du texte de refus) si la
  // modification n'est pas valable (rien n'est écrit), sinon { changed }.
  function setHome(userId, change) {
    const problem = homeChangeProblem(change);
    if (problem) return { problem };
    const before = homeFor(userId);
    const next = applyHomeChange(before, change);
    // Ordre de départ et rien de masqué : rien à garder (vide)
    const tiles = JSON.stringify({ order: next.order, hidden: next.hidden });
    const plain = JSON.stringify({ order: normalizeHome(null).order, hidden: [] });
    write.run(next.enabled ? 1 : 0, next.start, tiles === plain ? null : tiles, userId);
    return { changed: JSON.stringify(next) !== JSON.stringify(before) };
  }

  return { homeFor, setHome };
}
