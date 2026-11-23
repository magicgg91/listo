// Textes de « À offrir » (public/js/screens/gifts.js : la page ; la tuile
// de l'Accueil, home.js ; la carte de Listes, lists.js), en français.
// Chaque nom commence par « offrir. ».

export default {
  // Page « À offrir » (#/listes/a-offrir) : liste automatique de mes
  // réservations et participations dans les listes d'envies
  'offrir.titre': 'À offrir',
  'offrir.retour': 'Retour',
  'offrir.automatique': 'Automatique',
  'offrir.intro': 'Vos réservations dans les listes d\'envies. Cochez ce que vous avez déjà acheté : vous seul le voyez.',
  'offrir.chargement': 'Chargement…',
  // « 5 cadeaux · 3 à acheter »
  'offrir.resume': {
    one: '{gifts} · {count} à acheter',
    other: '{gifts} · {count} à acheter',
  },
  'offrir.cadeaux': { one: '{count} cadeau', other: '{count} cadeaux' },
  // Ligne d'un cadeau, sous son nom : la liste, puis ma part
  'offrir.ligne.reserve': '{list} · Réservé',
  'offrir.ligne.participe': {
    one: '{list} · Vous participez ({count} personne)',
    other: '{list} · Vous participez ({count} personnes)',
  },
  // Case « Acheté » (état dans aria-pressed) ; la ligne ouvre le souhait
  // dans sa liste
  'offrir.achete.nom': 'Acheté : {name}',
  'offrir.ouvrir': 'Ouvrir {name} dans sa liste, {details}',
  'offrir.prix.lu': 'prix {price}',
  'offrir.achete.lu': 'acheté',
  // Rien à offrir
  'offrir.vide.titre': 'Rien à offrir pour l\'instant',
  'offrir.vide.texte': 'Quand vous réservez un souhait dans une liste d\'envies, ou que vous y participez, il apparaît ici.',

  // Tuile de l'Accueil : les trois derniers cadeaux réservés, pas encore achetés
  'offrir.tuile.lu': {
    one: 'À offrir, {count} cadeau à acheter',
    other: 'À offrir, {count} cadeaux à acheter',
  },
  'offrir.tuile.lu.toutAchete': 'À offrir, tout est acheté',
  'offrir.tuile.reserve': 'Pour {name} · réservé',
  'offrir.tuile.participe': {
    one: 'Pour {name} · vous participez ({count} personne)',
    other: 'Pour {name} · vous participez ({count} personnes)',
  },
  'offrir.tuile.toutAchete': 'Tout est acheté',

  // Carte de « Listes » (groupe Envies) : « 3/5 », lue « 3 cadeaux à
  // acheter sur 5 »
  'offrir.carte.compte': {
    one: '{count} cadeau à acheter sur {total}',
    other: '{count} cadeaux à acheter sur {total}',
  },
  'offrir.carte.toutAchete': '{progress}, tout est acheté',
};
