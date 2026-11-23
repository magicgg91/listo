// Textes des deux corbeilles : public/js/screens/trash.js (listes),
// public/js/screens/note-trash.js (notes) et leurs morceaux communs
// (public/js/screens/trash-parts.js), en français.
// Chaque nom commence par « corbeille. ».

export default {
  // Commun aux deux corbeilles (même écran depuis le 23 novembre 2026)
  'corbeille.vider': 'Vider la corbeille',
  'corbeille.vider.question': 'Vider la corbeille ?',
  'corbeille.vider.confirmer': 'Vider',
  'corbeille.restaurer': 'Restaurer',
  'corbeille.definitif': 'Supprimer définitivement',
  'corbeille.definitif.label': 'Supprimer définitivement « {name} »',
  'corbeille.definitif.question': 'Supprimer définitivement « {name} » ?',
  // Ligne : date de suppression (« 21 nov. ») et jours restants
  'corbeille.ligne': { one: 'Supprimée le {date} · encore {count} jour', other: 'Supprimée le {date} · encore {count} jours' },

  // Corbeille des listes : écran
  'corbeille.titre': 'Corbeille des listes',
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
  'corbeille.vide.texte': 'Une liste que vous supprimez reste ici 30 jours : vous pouvez la restaurer pendant ce temps.',

  // Corbeille indisponible (hors ligne)
  'corbeille.horsLigne.titre': 'Indisponible hors ligne',
  'corbeille.horsLigne.texte': 'La corbeille a besoin du réseau. Elle s\'affichera dès son retour.',
};
