// Textes de la page Notifications (public/js/screens/inbox.js) et des
// lignes qu'elle montre (phrases faites par server/inbox.js au moment de la
// lecture, dans la langue du compte), en français.
// Chaque nom commence par « inbox. ».

export default {
  // --- Lignes (server/inbox.js) ---
  // Seconde ligne : la catégorie et ce qu'elle concerne (« Rappel · Maison »)
  'inbox.sous': '{label} · {context}',
  'inbox.resume': 'Résumé du matin',
  'inbox.rappel': 'Rappel',
  'inbox.rappel.aujourdhui': '{name} à {time}',
  'inbox.rappel.demain': '{name} demain à {time}',
  'inbox.rappel.date': '{name} le {date} à {time}',
  // Chacun son tour : « C'est votre tour : Sortir les poubelles »
  'inbox.tour': 'C\'est votre tour : {names}',
  // count : nombre de personnes ; {things} : « 4 articles » ; {changes} : « 3 changements »
  'inbox.ajoute': { one: '{people} a ajouté {things} dans « {list} »', other: '{people} ont ajouté {things} dans « {list} »' },
  'inbox.modifie': { one: '{people} a fait {changes} dans « {list} »', other: '{people} ont fait {changes} dans « {list} »' },
  'inbox.partage.liste': '{actor} a partagé la liste « {list} » avec vous',
  'inbox.droit.liste.modification': 'Vous pouvez maintenant modifier « {list} »',
  'inbox.droit.liste.lecture': '« {list} » est maintenant en lecture seule pour vous',
  'inbox.droit.note.modification': 'Vous pouvez maintenant modifier la note « {note} »',
  'inbox.droit.note.lecture': 'La note « {note} » est maintenant en lecture seule pour vous',
  'inbox.droit.note.modification.sansTitre': 'Vous pouvez maintenant modifier une note',
  'inbox.droit.note.lecture.sansTitre': 'Une note est maintenant en lecture seule pour vous',
  // Projets (étape 3) : nom du projet et titre de la carte relus à
  // l'affichage (jamais gardés) ; sans eux (accès perdu, carte supprimée) :
  // « sansNom », « sansTitre ». count : nombre de personnes.
  'inbox.projet.ajoute': { one: '{people} a ajouté {cards} dans « {project} »', other: '{people} ont ajouté {cards} dans « {project} »' },
  'inbox.projet.ajoute.sansNom': { one: '{people} a ajouté {cards} dans un projet', other: '{people} ont ajouté {cards} dans un projet' },
  'inbox.projet.attribue': { one: '{people} vous a attribué {cards}', other: '{people} vous ont attribué {cards}' },
  'inbox.projet.attribue.nom': { one: '{people} vous a attribué « {card} »', other: '{people} vous ont attribué « {card} »' },
  'inbox.carte.commente': { one: '{people} a commenté « {card} »', other: '{people} ont commenté « {card} »' },
  'inbox.carte.commentaires': { one: '{people} a ajouté {comments} sur « {card} »', other: '{people} ont ajouté {comments} sur « {card} »' },
  'inbox.carte.commente.sansTitre': { one: '{people} a commenté une carte', other: '{people} ont commenté une carte' },
  'inbox.carte.modifie': { one: '{people} a modifié « {card} »', other: '{people} ont modifié « {card} »' },
  'inbox.carte.modifie.sansTitre': { one: '{people} a modifié une carte', other: '{people} ont modifié une carte' },
  'inbox.carte.deplace': { one: '{people} a déplacé « {card} » vers « {column} »', other: '{people} ont déplacé « {card} » vers « {column} »' },
  'inbox.carte.faite': { one: '{people} a marqué « {card} » comme faite', other: '{people} ont marqué « {card} » comme faite' },
  'inbox.carte.uneCarte': 'Une carte',
  'inbox.projet.partage': '{actor} a partagé le projet « {project} » avec vous',
  'inbox.projet.partage.sansNom': '{actor} a partagé un projet avec vous',

  // --- Écran ---
  'inbox.titre': 'Notifications',
  'inbox.reglages': 'Réglages des notifications',
  'inbox.nonLues': { one: '{count} non lue', other: '{count} non lues' },
  'inbox.toutLues': 'Tout est lu',
  'inbox.toutLu': 'Tout marquer comme lu',
  'inbox.aujourdhui': 'Aujourd\'hui',
  'inbox.hier': 'Hier',
  // Nom lu d'une ligne (texte, seconde ligne, heure)
  'inbox.ligne': '{text}, {sub}, {time}',
  'inbox.ligne.nonLue': 'Non lue : {text}, {sub}, {time}',
  'inbox.options': 'Options de cette notification',
  'inbox.effacer': 'Effacer',
  'inbox.lue': 'Lue',
  'inbox.effacer.lu': 'Effacer cette notification',
  'inbox.effacee': 'Notification effacée',
  'inbox.marquerLue': 'Marquer comme lue',
  'inbox.toutEffacer': 'Tout effacer',
  'inbox.toutEffacer.question': 'Effacer toutes les notifications ?',
  'inbox.toutEffacer.texte': 'Elles disparaissent de la page sur tous vos appareils. Vos listes et vos notes ne changent pas.',
  'inbox.toutesEffacees': 'Notifications effacées',
  'inbox.garde': 'Les notifications sont gardées 30 jours.',
  'inbox.vide.titre': 'Aucune notification',
  'inbox.vide.texte': 'Ce que Listo vous signale (échéances, partages, modifications) s\'affichera ici pendant 30 jours.',
  'inbox.chargement': 'Chargement…',
  // Cible disparue (liste supprimée, partage retiré…)
  'inbox.indisponible.liste': 'Cette liste n\'est plus disponible',
  'inbox.indisponible.element': 'Cet élément n\'est plus disponible',
  'inbox.indisponible.note': 'Cette note n\'est plus disponible',
  'inbox.indisponible.projet': 'Ce projet n\'est plus disponible',
  'inbox.indisponible.carte': 'Cette carte n\'est plus disponible',
  // Cloche de l'Accueil
  'inbox.cloche': 'Notifications',
  'inbox.cloche.nonLues': { one: 'Notifications, {count} non lue', other: 'Notifications, {count} non lues' },
};
