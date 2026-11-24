// Réglage « Fonctions » d'un compte (Réglages › Fonctions, migration 41) :
// les fonctions de Listo qu'une personne peut couper pour elle seule (les
// notes, pour commencer). Le même sur tous les appareils de la personne :
// envoyé avec /api/me et chaque synchronisation (/api/sync, « features »),
// modifié par l'opération « account.features » (/api/ops, file d'attente :
// hors ligne compris).
//
// Chacun ne lit et ne modifie que son propre réglage : le compte vient
// toujours de la session (jamais d'un identifiant envoyé par le téléphone).
// Les règles (fonctions connues, booléens seulement) sont celles de
// public/js/features.js, vérifiées ici avant toute écriture. Couper une
// fonction n'efface rien. Rien de tout cela n'est montré aux assistants IA
// ni sur le lien public.
//
// Les notifications des notes ne sont pas remises à une personne qui a
// coupé les notes : server/notify.js relit users.notes_enabled à chaque
// envoi (allowedNote), pour la page Notifications comme pour le téléphone.

import { FEATURES, normalizeFeatures, featuresChangeProblem, applyFeaturesChange } from '../public/js/features.js';

// Colonne de la table users de chaque fonction (liste fixe : jamais un nom
// venu d'une requête)
const COLUMNS = { notes: 'notes_enabled' };

// Réglage lu dans une ligne de la table users (complet ; valeurs de départ
// si une colonne manque). Sert aussi à /api/me (server/auth.js,
// publicUser) : à l'ouverture, le téléphone sait tout de suite quels
// boutons montrer.
export function featuresFromRow(row) {
  const value = {};
  for (const name of FEATURES) {
    const cell = row?.[COLUMNS[name]];
    if (cell === 0 || cell === 1) value[name] = cell === 1;
  }
  return normalizeFeatures(value);
}

export function createFeatures(db) {
  const read = db.prepare(`SELECT ${FEATURES.map((name) => COLUMNS[name]).join(', ')} FROM users WHERE id = ?`);
  // Une requête préparée par fonction (colonne de la liste fixe ci-dessus)
  const writes = Object.fromEntries(FEATURES.map((name) => [name, db.prepare(`UPDATE users SET ${COLUMNS[name]} = ? WHERE id = ?`)]));

  // Réglage d'une personne
  const featuresFor = (userId) => featuresFromRow(read.get(userId));

  // Modifie le réglage de la personne. change : { notes? }, rien d'autre.
  // Renvoie { problem } (nom du texte de refus) si la modification n'est
  // pas valable (rien n'est écrit), sinon { changed }.
  function setFeatures(userId, change) {
    const problem = featuresChangeProblem(change);
    if (problem) return { problem };
    const before = featuresFor(userId);
    const next = applyFeaturesChange(before, change);
    db.transaction(() => {
      for (const name of FEATURES) {
        if (next[name] !== before[name]) writes[name].run(next[name] ? 1 : 0, userId);
      }
    })();
    return { changed: FEATURES.some((name) => next[name] !== before[name]) };
  }

  return { featuresFor, setFeatures };
}
