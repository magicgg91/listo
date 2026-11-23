# Listo : Accueil, Notes et page Notifications (maquettes)

Maquettes du 23 novembre 2026 pour le cadrage `docs/cadrage-accueil-notes-notifications.md`. Rien n'est construit : ces fichiers servent à décider.

| Fichier | Rôle |
|---|---|
| `captures/` | 24 PNG : les 12 écrans de la section 9 du cadrage, en clair (`-clair`) et en sombre (`-sombre`). Téléphone 390 × 844 points à 2x, ordinateur 1 440 × 900 points à 2x |
| `listo-accueil-notes.css` | Nouveaux composants seulement (sections 16.19 à 16.27, à ajouter à `design/listo.css` après validation). Variables existantes uniquement |
| `icons-nouvelles.svg.html` | Icônes à ajouter au sprite : `i-note`, `i-pin`, `i-pin-off`, `i-check-double` |
| `reference-telephone.html`, `reference-ordinateur.html` | Balisage de référence (lisent `../listo.css`). Ajouter `?theme=dark` à l'adresse pour le sombre |
| `capture.mjs` | Refait les captures : `node design/accueil-notes/capture.mjs` |
| `mockup-only.css` | Planche, mode capture, faux curseur, éléments de `app.css` recréés. Ne pas livrer |

## Captures

- `accueil-1` : « Bonjour Guillaume », la date, la pastille « À jour » et la cloche avec « 3 ». Quatre tuiles : Échéances (En retard 2 en rouge, Aujourd'hui 3 en vert, Plus tard 8 en gris), Listes (Courses, Tâches avec le point des nouveautés, Envies), Notes (« 12 notes », les deux dernières, « Nouvelle note »), Compte (Mon compte, Notifications 3, Réglages). Bandeau à cinq boutons, sans loupe.
- `accueil-2` : nouveau compte : « Aucune échéance », « Aucune liste » et « Nouvelle liste », « Aucune note » et « Nouvelle note », cloche sans pastille.
- `accueil-3` : saisie rapide « Nouvelle note » : titre facultatif, texte (curseur dedans, clavier non dessiné), catégorie en pastilles, « Annuler » et « Enregistrer ».
- `notes-1` : écran Notes : corbeille (2), menu ⋮, pastilles des catégories qui défilent, « Épinglées » puis « Autres notes », une note modifiée par Léa (pastille et « Modifiée par Léa »), une note en lecture seule, « Nouvelle note » flottant à gauche et loupe à droite.
- `notes-2` : Catégories : poignées pour changer l'ordre, Renommer, Supprimer, « Sans catégorie » en dernier, « Nouvelle catégorie ». La confirmation de suppression est dans la page de référence (`notes-2-dialogue`), sans capture.
- `notes-3` : Corbeille des notes : catégorie gardée, date et jours restants, « Partagée avec 2 personnes », Supprimer définitivement / Restaurer, « Vider la corbeille ».
- `note-1` : une note (« Vacances en Bretagne », à Léa, que Guillaume peut modifier) : catégorie « Voyages », « Personnes », « Enregistré », lien cliquable, « Modifiée par Léa · il y a 5 min ».
- `note-2` : conflit : « À vérifier », bandeau « Léa vient de modifier cette note », choix Garder la mienne / Prendre la leur / Garder les deux, « Décider plus tard ».
- `notifications-1` : Aujourd'hui, Hier, Samedi 21 novembre ; trois non lues (point, texte en gras, icône bleue) ; « Tout marquer comme lu » ; une ligne glissée qui montre « Effacer » ; « Tout effacer » en bas.
- `notifications-2` : « Aucune notification ».
- `pc-accueil-1`, `pc-notes-1` : menu de gauche avec Accueil, Mes listes, Notes (catégories ouvertes sur l'écran Notes), Échéances ; tuiles sur trois colonnes ; notes à gauche et note ouverte à droite.

## Nouveaux composants

`.icon-btn--badge` et `.icon-btn__badge` (cloche, corbeille) ; `.home-head` ; `.tiles`, `.tile`, `.tile__head`, `.tile__row` (48 px), `.tile__row--add`, `.tile__dot`, `.tile__empty`, `.count` (`--danger`, `--success`, `--accent`, gris par défaut) ; `.tabbar--5` ; `.cat-pick` ; `.catbar` et `.cat-chip` ; `.notes-section` ; `.note-card` ; `.news-badge--dot` ; `.note-cat`, `.note-people`, `.note-status`, `.note-edit`, `.note-link`, `.note-foot`, `.note-banner`, `.conflict` ; `.cat-row` ; `.page-intro`, `.page-tools` ; `.note-trash` ; `.inbox-row` ; `.inbox-foot` ; ordinateur : `.pc-side__main`, `.pc-nav__item--sub`, `.pc-head__tools`, `.pc-notes`, `.pc-note`. Le reste vient du kit tel quel.

## Choix faits dans les maquettes

- En-tête de l'Accueil : le bonjour seul sur sa ligne, la date dessous avec la pastille et la cloche à droite. Avec la pastille et la cloche sur la même ligne, « Bonjour Guillaume » ne tenait pas sur 390 px.
- Lignes des tuiles en pilule, comme tous les boutons depuis le 11 novembre. Nombres en pastille : rouge En retard, vert Aujourd'hui, bleu Notifications non lues, gris ailleurs. Le libellé dit toujours ce que compte le nombre.
- « Lecture seule » des notes : icône œil (`#i-eye`), comme les listes. Le cadrage parle d'un cadenas.
- « Nouvelle note » : bouton flottant à gauche, à la hauteur de la loupe (le cadrage le demande). « Mes listes » a son « + » en haut.
- Sur le téléphone, le bouton « Personnes » de la note montre l'icône et les pastilles, sans le mot (place) ; le mot est dans le nom lu. Il est écrit sur ordinateur.
- Ordinateur : « Échéances » garde sa place sous l'Accueil dans l'ordre du bandeau (Accueil, Mes listes, Notes, Échéances), au-dessus des listes. Note ouverte dans une zone à droite, sans voile, et non dans un tiroir : elle s'enregistre toute seule.
- Notifications : réglages des notifications (icône) en haut à droite ; « Tout marquer comme lu » sur la ligne sous le titre.

## Décisions qui restent (section 10 du cadrage)

1. Curseur dans « Nouvelle note » : proposé, il va dans le texte (dessiné dans `accueil-3`).
2. Ouvrir la page Notifications marque-t-il tout comme lu ? Proposé : non.
3. Réglages communs à la page et au téléphone : proposé oui.
4. Tuiles cachables ou déplaçables : proposé pas pour l'instant.
5. Notes et assistants IA (MCP) : proposé plus tard.

À trancher aussi : cadenas ou œil pour « Lecture seule » ; bouton flottant ou « + » en haut pour « Nouvelle note » ; liens cliquables pendant qu’on écrit (un champ de texte simple ne sait pas les afficher : à régler à la construction) ; pour les catégories, « Monter » et « Descendre » au clavier et au lecteur d’écran, en plus de la poignée (comme « Réordonner » des sous-tâches).
