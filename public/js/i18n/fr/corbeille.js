// Textes de la Corbeille : la page et ses onglets
// (public/js/screens/trash-page.js), l'onglet « Listes »
// (public/js/screens/trash.js), l'onglet « Notes »
// (public/js/screens/note-trash.js) et leurs morceaux communs
// (public/js/screens/trash-parts.js), en français.
// Chaque nom commence par « corbeille. ».

export default {
  // La page (une seule depuis le 24 novembre 2026) et ses deux onglets ;
  // libellé avec le nombre quand il y en a (« Listes (4) »), et nom lu
  'corbeille.titre': 'Corbeille',
  'corbeille.onglets': 'Contenu de la corbeille',
  'corbeille.onglet.listes': 'Listes',
  'corbeille.onglet.listes.nombre': { one: 'Listes ({count})', other: 'Listes ({count})' },
  'corbeille.onglet.listes.label': { one: 'Listes, {count} liste supprimée', other: 'Listes, {count} listes supprimées' },
  'corbeille.onglet.notes': 'Notes',
  'corbeille.onglet.notes.nombre': { one: 'Notes ({count})', other: 'Notes ({count})' },
  'corbeille.onglet.notes.label': { one: 'Notes, {count} note supprimée', other: 'Notes, {count} notes supprimées' },

  // Commun aux deux onglets (même contenu depuis le 23 novembre 2026)
  'corbeille.vider': 'Vider la corbeille',
  'corbeille.vider.question': 'Vider la corbeille ?',
  'corbeille.vider.confirmer': 'Vider',
  'corbeille.restaurer': 'Restaurer',
  'corbeille.definitif': 'Supprimer définitivement',
  'corbeille.definitif.label': 'Supprimer définitivement « {name} »',
  'corbeille.definitif.question': 'Supprimer définitivement « {name} » ?',
  // Ligne : date de suppression (« 21 nov. ») et jours restants
  'corbeille.ligne': { one: 'Supprimée le {date} · encore {count} jour', other: 'Supprimée le {date} · encore {count} jours' },

  // Onglet « Listes »
  'corbeille.intro': 'Vos listes supprimées restent ici 30 jours, puis elles sont effacées pour de bon.',
  'corbeille.chargement': 'Chargement…',
  'corbeille.nombre': { one: '{count} liste', other: '{count} listes' },
  // Ligne : type · nombre d'éléments (« Courses · 9 articles »)
  'corbeille.liste': '{type} · {items}',

  // Hors ligne : « Restaurer » et « Supprimer définitivement » inactifs
  'corbeille.horsLigne.restaurer': 'Restaurer ou supprimer une liste demande une connexion. Les boutons reviendront avec le réseau.',

  // Restauration
  'corbeille.restauree': 'Liste « {name} » restaurée',
  'corbeille.ouvrir': 'Ouvrir',
  'corbeille.restaurer.label': 'Restaurer la liste « {name} »',

  // Suppression définitive (une liste, ou toute la corbeille)
  'corbeille.definitif.texte': 'Elle sera effacée pour de bon, avec ses éléments et ses photos. Impossible de revenir en arrière.',
  'corbeille.vider.texte': {
    one: 'La liste de la corbeille sera effacée pour de bon, avec ses éléments et ses photos. Impossible de revenir en arrière.',
    other: 'Les {count} listes de la corbeille seront effacées pour de bon, avec leurs éléments et leurs photos. Impossible de revenir en arrière.',
  },
  'corbeille.supprimee': 'Liste « {name} » supprimée définitivement',
  'corbeille.videe': { one: '{count} liste supprimée définitivement', other: '{count} listes supprimées définitivement' },

  // Corbeille vide
  'corbeille.vide.titre': 'Aucune liste supprimée.',
  'corbeille.vide.aucune': 'Aucune corbeille pour l\'instant : aucune fonction n\'est utilisée par votre compte.',
  'corbeille.vide.texte': 'Une liste que vous supprimez reste ici 30 jours : vous pouvez la restaurer pendant ce temps.',

  // Corbeille indisponible (hors ligne)
  'corbeille.horsLigne.titre': 'Indisponible hors ligne',
  'corbeille.horsLigne.texte': 'La corbeille a besoin du réseau. Elle s\'affichera dès son retour.',
  'corbeille.onglet.projets': 'Projets',
  'corbeille.onglet.projets.nombre': { one: 'Projets ({count})', other: 'Projets ({count})' },
  'corbeille.onglet.projets.label': { one: 'Projets, {count} projet supprimé', other: 'Projets, {count} projets supprimés' },
};
