// Annuaire : les comptes qu'un compte peut CHOISIR (personnes proposées
// dans « Partager » des listes, des notes et des projets, « Pour qui ? »
// d'une liste d'envies). Docs/cadrage-comptes.md, section 5 ; décisions
// du propriétaire du 25 novembre 2026.
//
// Une seule fonction calcule l'annuaire, pour celui qui regarde
// (directoryFor) : elle remplace l'ancienne liste de tous les comptes
// actifs, envoyée telle quelle à tout le monde. Elle sert à la
// synchronisation (« users »), à GET /api/users et aux contrôles du
// serveur (canSee : un compte ajouté à un partage doit être dans
// l'annuaire de celui qui partage).
//
// - Admin : tous les comptes actifs, chacun avec son rôle (« Invité ·
//   discret » dans sa feuille « Partager ») ;
// - Utilisateur (la famille) : les comptes actifs qui ne sont pas des
//   invités ;
// - Invité : personne (annuaire vide). Les membres de ce qu'on lui partage
//   lui apparaissent dans cette chose-là seulement (« Personnes »,
//   attributions, commentaires), comme aujourd'hui.
//
// Réponses construites champ par champ : id et nom affiché, plus le rôle
// pour un Admin seulement ; jamais l'identifiant de connexion (username),
// qui ne sert qu'à se connecter. Depuis l'étape 2 (fonctions autorisées),
// aussi « uses » : { lists, notes, projects } (lists depuis l'étape 3 :
// toujours vrai, sauf pour un invité vu par un Admin), ce que l'Admin a autorisé à ce
// compte (pas ce qu'il a allumé, qui reste à lui) : la feuille « Partager »
// d'une note ou d'un projet grise une personne qui n'y a pas droit
// (« N'utilise pas les notes »), et le serveur refuse de l'ajouter. Ce
// n'est pas un secret pour un compte qu'on voit déjà (cadrage 7.3). Rien
// n'est gardé en mémoire d'un compte à l'autre : l'annuaire est relu en
// base à chaque demande.

import { accountRole, directorySees } from '../public/js/access.js';
import { compareText } from '../public/js/i18n.js';
import { allowedFromRow } from './features.js';

export function createDirectory(db) {
  const actives = db.prepare('SELECT id, display_name, role, guest, lists_allowed, notes_allowed, projects_allowed FROM users WHERE active = 1');
  const account = db.prepare('SELECT id, role, guest, active FROM users WHERE id = ?');

  // Annuaire de viewer (sa ligne de la table users, ou au moins id, role,
  // guest). Ordre de départ toujours le même (synchronisation) : chaque
  // écran le range ensuite dans sa langue.
  function directoryFor(viewer) {
    const viewerRole = accountRole(viewer);
    if (viewerRole === 'guest') return [];
    const admin = viewerRole === 'admin';
    const uses = (row) => {
      const allowed = allowedFromRow(row);
      return { lists: allowed.lists, notes: allowed.notes, projects: allowed.projects };
    };
    return actives.all()
      .filter((row) => directorySees(viewerRole, accountRole(row)))
      .map((row) => (admin
        ? { id: row.id, displayName: row.display_name, role: accountRole(row), uses: uses(row) }
        : { id: row.id, displayName: row.display_name, uses: uses(row) }))
      .sort((a, b) => compareText(a.displayName, b.displayName, { locale: 'fr' }));
  }

  // viewer voit-il le compte id dans son annuaire (compte actif, visible
  // pour son rôle) ? Sert aux contrôles des ajouts : un compte qu'on ne
  // voit pas reçoit EXACTEMENT la réponse d'un compte qui n'existe pas.
  function canSee(viewer, id) {
    const row = account.get(id);
    if (!row || row.active !== 1) return false;
    return directorySees(accountRole(viewer), accountRole(row));
  }

  // Combien de ces numéros viewer ne voit pas (inconnus compris) : pour la
  // ligne « share_unknown_user » du journal (docs/cadrage-comptes.md,
  // section 10 : qui, combien), jamais envoyé à viewer
  const unseenCount = (viewer, ids) => [...ids].filter((id) => !canSee(viewer, id)).length;

  // Rôle calculé d'un compte par son numéro (null s'il n'existe pas)
  function roleOf(id) {
    const row = account.get(id);
    return row ? accountRole(row) : null;
  }

  return { directoryFor, canSee, unseenCount, roleOf };
}
