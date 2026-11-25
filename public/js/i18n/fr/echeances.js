// Textes de public/js/screens/deadlines.js et public/js/deadlines.js, en français.
// Chaque nom commence par « echeances. ».

export default {
  // Groupes (public/js/deadlines.js)
  'echeances.groupe.retard': 'En retard',
  'echeances.groupe.aujourdhui': 'Aujourd\'hui',
  'echeances.groupe.demain': 'Demain',
  'echeances.groupe.semaine': 'Cette semaine',
  'echeances.groupe.plusTard': 'Plus tard',

  // Recherche
  'echeances.recherche.label': 'Rechercher une tâche',
  'echeances.recherche.placeholder.pc': 'Rechercher',

  // « Toutes / Les miennes »
  'echeances.filtre.toutes': 'Toutes',
  'echeances.filtre.miennes': 'Les miennes',
  'echeances.filtre.label': 'Tâches affichées',

  // Cocher depuis cet écran (message, avec « Annuler »)
  'echeances.moi': 'Moi',
  'echeances.prochaineFois': 'Prochaine fois : {date}',
  'echeances.prochaineFois.personne': 'Prochaine fois : {date} · {name}',
  'echeances.annuler': 'Annuler',
  'echeances.coche': 'Coché : {name}',

  // Ligne d'une tâche (et ce que lit le lecteur d'écran)
  'echeances.lu.dans': 'dans {name}',
  'echeances.lu.sousTache': 'sous-tâche de {name}',
  'echeances.lu.repetition': 'se répète : {repeat}',
  'echeances.personnes.plus': '{name} +{more}',
  'echeances.lu.pour': 'pour {names}',
  'echeances.lu.moi': 'moi',
  'echeances.lectureSeule': 'Non coché, lecture seule',
  'echeances.ouvrir': 'Ouvrir {name}, {details}',

  // Chargement, écran vide
  'echeances.chargement': 'Chargement…',
  'echeances.vide.titre': 'Aucune échéance',
  'echeances.vide.miennes': 'Aucune tâche à faire ne vous est attribuée. « Toutes » montre aussi celles des autres et celles de personne.',
  'echeances.vide.texte': 'Les tâches à faire qui ont une échéance apparaissent ici, toutes listes confondues. Pour en donner une, activez l\'option « Échéance » dans « Modifier la liste ».',
  // Nombre de tâches d'un groupe (lecteur d'écran)
  'echeances.groupe.nombre': { one: '{count} tâche', other: '{count} tâches' },

  // Aucun résultat
  'echeances.recherche.aucun': 'Aucun résultat',
  'echeances.recherche.aucun.texte': 'Aucune tâche ne correspond à « {query} ».',
  'echeances.recherche.effacer': 'Effacer la recherche',

  // En-tête
  'echeances.titre': 'Échéances',
  'echeances.pc.sousTitre': 'Les tâches à faire de toutes vos listes',

  // Cartes des projets montrés dans Échéances (étape 4 du cadrage des
  // projets) ; les textes « .cartes » remplacent les autres seulement quand
  // un projet est montré (sinon l'écran ne change pas)
  'echeances.recherche.label.cartes': 'Rechercher une tâche ou une carte',
  'echeances.vide.miennes.cartes': 'Rien pour vous : aucune tâche à faire ne vous est attribuée, ni aucune carte à vous ou à personne. « Toutes » montre aussi celles des autres.',
  'echeances.vide.texte.cartes': 'Les tâches à faire qui ont une échéance apparaissent ici, toutes listes confondues, avec les cartes datées des projets où « Afficher dans Échéances » est activé.',
  'echeances.groupe.nombre.cartes': { one: '{count} tâche ou carte', other: '{count} tâches ou cartes' },
  'echeances.recherche.aucun.texte.cartes': 'Aucune tâche ni carte ne correspond à « {query} ».',
  'echeances.pc.sousTitre.cartes': 'Les tâches de toutes vos listes et les cartes de vos projets',
  // Ligne d'une carte : « DomoPi Articles · Relecture »
  'echeances.carte.dans': '{project} · {column}',
  'echeances.carte.lu.dans': 'projet {project}, colonne {column}',
  'echeances.carte.lu.projet': 'projet {project}',
  'echeances.carte.case': '{name}, case « Fait »',
  'echeances.carte.ouvrir': 'Ouvrir la carte {name}, {details}',
  // Message après la case « Fait » (avec « Annuler »)
  'echeances.carte.faite': 'Fait : {name}',
};
