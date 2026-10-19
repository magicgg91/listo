# Prompt — Recherche dans Listo

Tu travailles sur Listo (PWA mobile-first, français uniquement, sans framework, sans bibliothèque d'icônes). Implémente la recherche à partir des maquettes de ce dossier, en réutilisant le kit `design/listo.css` : variables, classes, icônes SVG inline (`<use href="#i-…">`), zones tactiles d'au moins 44 px, aucun style ni script inline, aucune couleur en dur, thèmes clair et sombre. Un article coché reste barré partout, y compris dans les résultats.

## Fichiers fournis

- `captures/` : 20 PNG, 2 écrans × 5 états × 2 thèmes (clair, sombre), 390 px de large.
- `listo-recherche.css` : règles à coller dans `design/listo.css`, nouvelle section 16.6 « Recherche ».
- `listo-recherche-recrees.css` : éléments de l'app actuelle absents du kit, recréés d'après des captures. À ignorer s'ils existent déjà dans le code.
- `icons-nouvelles.svg.html` : symboles à ajouter au sprite (`search`, `clock`, `x-circle`, `barcode`, `chev-u`, `gift`, `basket`, `link`). Ignorer ceux qui existent déjà.
- `reference-liste.html`, `reference-accueil.html` : balisage de référence, clair et sombre. Ils lisent `../design/listo.css` et reprennent des classes de présentation (`.stage__row`, `.phone`, `.kbd`) qui ne vont pas en production.
- `mockup-only-clavier.css` : faux clavier des maquettes, à ne pas livrer.

## Écran 1 — Recherche dans une liste (choix : variante B, champ masqué au-dessus)

Principe : un champ de recherche est placé tout en haut de la zone défilante, avant le premier rayon. Au chargement, la zone est défilée de la hauteur du champ, donc il est hors écran et l'écran est identique à aujourd'hui. L'utilisateur tire la liste vers le bas (ou revient en haut) pour le faire apparaître. L'en-tête ne change pas : pas de loupe.

Balisage : `<div class="searchrow">` (premier enfant de `.scroll`) contenant `<label class="searchfield">` avec une icône `#i-search`, un `<input class="searchfield__input" type="search" enterkeyhint="search" autocomplete="off" aria-label="Rechercher dans la liste">` et, si le champ n'est pas vide, un `<button class="icon-btn" aria-label="Effacer la saisie">` avec `#i-x-circle`.

Les 5 états (`captures/recherche-liste-*`) :

1. Repos : champ masqué, écran inchangé.
2. Champ révélé : visible, vide, sans focus, sans clavier. Le clavier ne s'ouvre qu'au toucher du champ. Aucun focus automatique.
3. Champ actif, vide : focus (anneau `--color-accent`), clavier ouvert, liste complète. La barre d'ajout en bas est masquée tant que le clavier est ouvert.
4. Saisie, par exemple « lait » : filtrage en direct (insensible à la casse et aux accents), uniquement sur le nom de l'article.
   - Seuls les articles correspondants restent, avec le texte trouvé dans `<mark class="hit">`.
   - Les rayons sans résultat disparaissent. Les rayons restants sont ouverts de force et leur en-tête n'affiche que le nombre de résultats, sans bouton de repli ni compteur x/y.
   - Les articles cochés apparaissent dans la zone « Dans le panier », barrés comme d'habitude. Les deux actions de la zone (« Tout remettre à acheter », « Retirer du panier ») sont masquées pendant la recherche, pour ne pas agir sur des articles qui ne sont pas tous affichés.
   - « Tout replier » est masqué. À droite de l'indicateur de synchro apparaît `<p class="search-meta" role="status">4 résultats</p>` (« 1 résultat » au singulier, « 0 résultat » si aucun).
   - Cocher, ouvrir la fiche et glisser pour supprimer fonctionnent comme d'habitude depuis les résultats.
5. Aucun résultat : le message `.empty` « Aucun résultat / Aucun article ne correspond à « … ». » et un bouton `.btn.btn--secondary` « Effacer la recherche », qui vide le champ, rend la liste complète et garde le focus.

Comportement du champ :
- Tant qu'il est focalisé ou non vide, il reste visible (il ne se masque pas en défilant). Quand il est vide et sans focus, il se re-masque au prochain défilement vers le bas.
- La touche « rechercher » du clavier ferme le clavier sans vider le champ.
- La croix vide la saisie et garde le focus.
- Changer de liste ou quitter l'écran vide la recherche.
- Le filtrage ne modifie pas les données ni la synchro : c'est une vue locale.
- Annonce `role="status"` du nombre de résultats pour les lecteurs d'écran.

## Écran 2 — Recherche des listes, page d'accueil (choix : variante A, loupe dans la barre)

Principe : une loupe `<button class="icon-btn" aria-label="Rechercher une liste">` s'ajoute dans la barre du haut, juste avant l'historique et les réglages. Au toucher, la barre devient un champ : `<header class="topbar topbar--search">` avec `.searchfield` (`aria-label="Rechercher une liste"`) et un bouton `<button class="btn btn--link btn--sm" aria-label="Fermer la recherche">Fermer</button>`.

Les 5 états (`captures/recherche-accueil-*`) :

1. Repos : le titre « Mes listes » et l'indicateur de synchro avec la loupe en plus. Cartes inchangées. Resserrer l'en-tête avec `.topbar--tight` pour que le titre ne soit pas tronqué avec 3 icônes.
2. Champ ouvert, vide, clavier ouvert : toutes les listes restent visibles. Le bouton « Nouvelle liste » est masqué pendant la recherche.
3. Saisie, par exemple « cour » : seules les cartes dont le titre correspond restent, titre dans `<mark class="hit">`, compteur « 2 listes » (`.search-meta`) au-dessus. Les cartes gardent leur format compact (icône, titre, heure, compteur X/Y, initiales, lien public ou lecture seule).
4. Aucun résultat : `.empty` « Aucune liste ne correspond à « … ». » et « Effacer la recherche ».
5. Option à valider : champ ouvert sans clavier. La loupe ouvre le champ sans le focaliser et affiche « Recherches récentes » (`.search-suggest`, `.search-chip` avec `#i-clock`, 3 à 5 entrées) et l'indication « Touchez le champ pour saisir. ». Le clavier s'ouvre au toucher du champ. Ne l'implémenter que si cette option est retenue ; sinon, la loupe focalise le champ tout de suite. Les recherches récentes se stockent par appareil et ne se synchronisent pas.

Comportement : « Fermer » vide la recherche et rétablit l'en-tête. La recherche porte sur le titre des listes (insensible à la casse et aux accents).

## Composants nouveaux

`.searchfield` (+ `__input`), `.searchrow`, `.topbar--search`, `.hit`, `.search-meta`, `.search-suggest` (+ `__title`, `__chips`, `__hint`), `.search-chip`, `.btn--link`.

## Recréés d'après l'app actuelle

`.aisle__toggle`, `.list-card--compact` (+ `__icon`, `__stat`, `__name a`), `.topbar__line`, `.topbar--tight`, `.body--fab`, icônes code-barres, cadeau, panier, chevron haut.

## Hors périmètre

Ne change aucun autre écran. Pas d'effet décoratif, pas de nouvelle couleur, pas de nouvelle variable.

## Vérifications

- Zones tactiles ≥ 44 px (champ 44 px, pastilles, « Fermer », croix).
- Contraste AA en clair et en sombre, y compris `.hit` sur fond de carte.
- Navigation au clavier et lecteur d'écran : étiquettes, `role="status"` pour les compteurs.
- Texte trouvé en évidence sans couleur seule (gras + soulignement).
- Article coché : barré et visible dans les résultats.
