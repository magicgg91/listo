# Prompt : interface PC de Listo (disposition A, deux zones)

Tu travailles sur Listo (application web de listes partagées, auto-hébergée, en français). L'interface téléphone est terminée et ne change pas. Construis l'interface PC à partir des maquettes de ce dossier, en réutilisant le kit `design/listo.css` : variables, classes, icônes SVG inline (`<use href="#i-…">`), thèmes clair et sombre par `data-theme` sur `<html>`. HTML, CSS et JavaScript natifs, sans framework ni bibliothèque d'icônes, sans style ni script inline, sans couleur en dur. Aucune nouvelle couleur.

## Fichiers fournis

- `captures/` : 50 PNG, clair et sombre. `pc-A-01` à `pc-A-10` sont les écrans de base, `pc-A-11` à `pc-A-19` les largeurs, rôles et fenêtres, `pc-A-00-*` les interactions et le redimensionnement.
- `listo-pc-A.css` : règles à coller dans `design/listo.css`, nouvelle section 16.8 « Interface ordinateur ». Variables existantes uniquement.
- `icons-pc.svg.html` : 13 symboles à ajouter au sprite (mêmes traits : 2 px, arrondis, 24 × 24, `currentColor`).
- `reference-A.html` : balisage de référence de tous les écrans, clair et sombre. Il lit `../design/listo.css` et `./mockup-only.css`. Les classes de présentation (`.stage__*`, `.desk`, `.shot`) ne vont pas en production.
- `mockup-only.css` : présentation des maquettes, à ne pas livrer.
- `shortcuts.example.js` : gestionnaire de raccourcis de référence, à adapter au code existant (attributs `data-action`).

## Ce qui change

L'interface PC s'active à partir de 1 024 px de large. En dessous, la version téléphone actuelle reste strictement identique. Mets la classe `app--pc` sur le conteneur `.app` au-dessus du seuil.

### Disposition

Deux zones dans `.pc.pc--a` (grille CSS pleine hauteur, chaque zone défile seule) :

| Largeur | Menu des listes | Colonne de liste | Tiroir |
|---|---|---|---|
| 1 024 à 1 279 px | 240 px | reste de la largeur | 400 px |
| 1 280 à 1 919 px | 300 px | plafonnée à 860 px, centrée | 520 px |
| 1 920 px et plus | 320 px | 860 px, centrée | 520 px |

- Zone de gauche `<aside class="pc-side">` : marque Listo et bouton « ? », champ de recherche (touche /), listes groupées par catégorie (Courses, Tâches, Envies) avec le compteur « restants/total » (par exemple 5/8), bouton « Nouvelle liste » (touche N), compte et accès aux Réglages.
- Zone de droite `<main class="pc-main">` : `.pc-col` contient l'en-tête (`.pc-head`), la barre d'outils (`.pc-tools`), le champ d'ajout (`.pc-add`) puis `.scroll`.
- Le champ d'ajout est en haut de la liste (touche A), pas en bas comme sur téléphone. Il n'existe pas en lecture seule.
- La fiche d'un article, le partage et les petites fenêtres recouvrent la zone de droite : tiroir `.pc-drawer` pour la fiche et le partage, fenêtre centrée `.pc-modal` pour « Nouvelle liste », la confirmation de suppression et les raccourcis. Le menu de gauche reste visible et actif derrière le voile d'un tiroir.
- Densité : sur `.app--pc`, `--tap` passe à 40 px et `--tap-min` à 36 px ; la ligne d'article fait 44 px. `@media (pointer: coarse)` rétablit 48 px et 44 px.

## Écrans (captures `pc-A-NN-…`)

1. Mes listes : cartes compactes par catégorie dans la zone de droite (existant : icône, nom, heure, compteur X/Y, puces « Lien public », « Multi », « Destinée à vous », initiales). Filtre par type en `.segmented`. La première carte porte l'anneau de focus clavier.
2. Liste de courses par rayon : en-tête avec « Partager » (initiales des personnes), champ de recherche, menu « ⋯ ». Rayons repliables, zone « Dans le panier » en bas avec « Tout remettre à acheter » et « Retirer du panier » sur la même ligne que le titre. Au survol d'une ligne : crayon et corbeille apparaissent à droite (`.item__actions`, 32 px).
3. Liste « multi » : mêmes lignes, en-têtes de magasin avec l'icône magasin, pastille Multi dans le sous-titre.
4. Tâches : sous-titre « Tâches », champ « Ajouter une tâche », zone « Terminés » (« Tout rouvrir », « Retirer les terminés »). Sur chaque ligne, puces `.item__meta` : priorité (« Haute » `.chip--high`, « Basse » `.chip--line`, avec l'icône drapeau) et échéance (calendrier ; « En retard · 5 nov. » `.chip--late` avec l'icône d'alerte). La couleur ne porte jamais seule l'information : le mot est toujours écrit.
5. Envies, deux vues : destinataire (a) et personne qui offre (b). La vue (a) n'affiche jamais de réservation ni de cotisation ; un bandeau `.note` le rappelle. La vue (b) ajoute « Réservé par … », « Ouvert à d'autres » (cotisation), la barre `<progress class="progress">` et le bouton « Réserver ». Ce filtrage se fait côté serveur : ne jamais envoyer ces données au destinataire.
6. Fiche d'un article : tiroir de 520 px (formulaire en deux colonnes `.pc-form`), pied avec « Supprimer », « Annuler », « Enregistrer » (Ctrl+Entrée). Ligne « Ajouté par … » en bas. Le texte « Modifications non enregistrées » apparaît dès qu'un champ change.
7. Partage et lien public : tiroir « Partager la liste ». Une ligne par personne (`.share-row`) avec le droit en liste déroulante (« Peut modifier », « Lecture seule ») et un bouton retirer ; le propriétaire est une puce « Propriétaire ». Champ « Inviter par e-mail ». Section Lien public : interrupteur, lien avec « Copier », expiration, mot de passe, « Arrêter le partage ».
8. Réglages : page dans la zone de droite (compte, Connexions Claude, apparence et clavier, administration, aide). Connexions Claude : une ligne par connexion avec le niveau (« Lecture seule », « Lecture et écriture ») et « Gérer ». Administration seulement pour le rôle Admin. Le réglage « Raccourcis à une touche » est un interrupteur.
9. Aide : page longue numérotée. Sommaire `.toc` collé à gauche du texte (`position: sticky`), colonne large `.pc-col--wide` (1 040 px), texte limité à 68 caractères. La touche S met le focus sur le sommaire ; la section courante porte `aria-current="true"`.
10. États : liste vide (message, astuce « Appuyez sur A »), hors ligne (pastille « Hors ligne » `.sync--off`, bandeau `.note--danger`), erreur (`.toast.toast--pc` en bas à droite avec « Réessayer »).
11 à 19. Largeur de 1 024 px, recherche dans une liste, 1 920 px, menu de la liste, rôles contributeur et lecture seule, nouvelle liste, confirmation de suppression, recherche dans Mes listes.

## Composants nouveaux (section 16.8)

`.app--pc`, `.pc` (`.pc--a`), `.pc-side`, `.pc-brand`, `.pc-nav` (`__group`, `__item`, `__name`, `__count`), `.pc-side__foot`, `.pc-user`, `.pc-main`, `.pc-col`, `.pc-head` (`__main`, `__title`, `__sub`), `.pc-tools`, `.pc-add`, `.pc-banner`, `.pc-cards`, `.pc-section-title`, `.pc-panel` (`__head`, `__title`, `__sub`, `__body`, `__foot`), `.pc-drawer`, `.pc-modal` (`--sm`, `--lg`), `.pc-form`, `.pc-meta`, `.keycap`, `.keys*`, `.tip`, `.has-tip`, `.toast--pc`, `.menu--pc`, `.menu__sep`, `.item__actions`, `.item__meta`, `.chip--high`, `.chip--late`, `.chip--accent`, `.chip--line`, `.progress`, `.share-row`, `.select--sm`, `.link-box`, `.help`, `.toc*`, `.prose*`, `.pc-settings*`, `.pc-table`.

Réutilisés tels quels : `.item`, `.check`, `.aisle`, `.cart*`, `.btn*`, `.icon-btn`, `.input`, `.field`, `.segmented`, `.switch`, `.tick-row`, `.choice`, `.row`, `.group`, `.note`, `.toast`, `.menu`, `.scrim`, `.searchfield`, `.hit`, `.search-meta`, `.readonly-banner`, `.sync`, `.avatar*`, `.badge-multi`.

États au survol et au focus : `.item:hover`, `.item:focus-within` et `.pc-nav__item:hover`. Les classes `.is-hover`, `.is-focus` et `.is-selected` servent aux maquettes ; en production, utilise `:hover`, `:focus-visible` et `aria-current`. L'anneau de focus est celui du kit (2 px accent, décalé de 2 px).

## Raccourcis clavier

| Action | Touche |
|---|---|
| Afficher la liste des raccourcis | ? |
| Nouvelle liste | N |
| Rechercher | / |
| Réglages | , |
| Fermer le panneau ; effacer la recherche | Échap |
| Liste précédente, suivante | [ et ] |
| Partager la liste | P |
| Ajouter un article | A |
| Article suivant, précédent | ↓ et ↑ |
| Cocher ou décocher | Espace |
| Ouvrir la fiche | Entrée |
| Modifier | E |
| Supprimer (annulable) | Suppr |
| Annuler la dernière action | Ctrl+Z |
| Enregistrer un formulaire | Ctrl+Entrée |
| Ouvrir le sommaire de l'aide | S |

Règles :
- Aucun raccourci à une touche pendant la saisie dans un champ. Seuls Échap et Ctrl+Entrée y restent actifs.
- Les raccourcis à une touche se désactivent dans Réglages (conformité WCAG 2.1.4). L'état est mémorisé par appareil.
- Une fenêtre ou un tiroir ouvert garde le focus : seuls ? et Échap restent actifs.
- Découverte : les touches sont écrites sur les boutons (`.keycap`), le bouton « ? » de la marque ouvre la fenêtre des raccourcis, une info-bulle `.tip` apparaît au survol et au focus de 400 ms (« Raccourcis clavier ? »). Elle n'est jamais la seule explication d'une action.
- Espace sur un `button` clique au relâchement : annule l'action par défaut pour que l'espace coche la ligne au lieu d'ouvrir la fiche (voir `shortcuts.example.js`).

## Souris et clavier

- Suppression d'une ligne (équivalent du glissement) : corbeille au survol ou au focus de la ligne, touche Suppr, ou menu du clic droit. Dans les trois cas : la ligne disparaît, un toast « Supprimé · Annuler (Ctrl+Z) » reste 8 secondes, l'annulation restaure la ligne à sa place.
- Menu du clic droit (et touche Menu ou Maj+F10) sur une ligne : Modifier (E), Cocher (Espace), Supprimer (Suppr). Aucune action n'existe uniquement au survol ou au clic droit.
- Ordre de tabulation : recherche de gauche, listes, nouvelle liste, puis en-tête de la liste (Partager, recherche, menu), champ d'ajout, articles, zone « Dans le panier ». Dans les articles, un seul arrêt de tabulation par liste, puis les flèches.
- Tiroir et fenêtres : `role="dialog"` avec `aria-label`, focus déplacé dans le panneau à l'ouverture (le nom pour « Nouvelle liste », « Annuler » pour la confirmation de suppression), focus piégé tant qu'il recouvre, le reste de l'écran passe en `inert`. À la fermeture, le focus revient à l'élément déclencheur.
- Liste d'articles : `aria-current="page"` sur la liste courante, `aria-pressed` sur les cases, annonces `role="status"` pour le compteur de résultats et l'état de synchronisation.
- Recherche : champ dans l'en-tête de la liste (affichage permanent à partir de 1 024 px). Filtre en direct sur le nom, texte trouvé en `<mark class="hit">`, compteur « N résultats », cochés inclus et barrés, rayons sans résultat masqués. La croix efface la saisie ; Échap efface puis quitte le champ. La recherche de la zone de gauche cherche dans les listes.

## Rôles : boutons présents

Un bouton absent pour un rôle est retiré du DOM, pas grisé.

| | Propriétaire | Peut modifier | Lecture seule |
|---|---|---|---|
| Cocher, décocher | oui | oui | non (cases non cliquables) |
| Ajouter, modifier, supprimer un article | oui | oui | non |
| Partager, droits, lien public | oui | non (« Personnes » : consultation) | non |
| Renommer, supprimer la liste, changer de magasin | oui | non | non |
| Voir qui a accès | oui | oui | oui |

Le rôle Admin s'ajoute au compte : il donne accès à Administration (comptes, magasins, rayons) dans Réglages, pas aux listes des autres. En lecture seule : bandeau `.readonly-banner`, pas de champ d'ajout, pas de crayon ni de corbeille, pas de menu « ⋯ ». Le serveur reste la référence : ne jamais se fier au masquage des boutons.

## Hors périmètre et à vérifier

- Les puces de priorité, d'échéance, d'envies (prix, lien, « Réservé par », cotisation) sont recréées pour ces maquettes : remplace-les par celles de l'application si elles existent déjà.
- Ne change aucun écran téléphone.
- Variante B (colonne de détail fixe) : au-delà de 1 600 px, le tiroir pourra devenir une colonne fixe sans changer les composants ; non demandé ici.
- Vérifie : contraste AA en clair et en sombre (y compris `.hit`, `.chip--high`, `.chip--late`), un article coché toujours barré, toute action au survol atteignable au clavier, rendu à 1 024, 1 280, 1 440 et 1 920 px, retour fluide à la version téléphone sous 1 024 px (la liste courante est conservée, les panneaux sont fermés), `prefers-reduced-motion` respecté.
