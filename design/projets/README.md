# Listo : Projets (maquettes)

Maquettes du 25 novembre 2026 pour le cadrage [`docs/cadrage-projets.md`](../../docs/cadrage-projets.md). Rien n'est construit : ces fichiers servent à décider. Point de départ : les brouillons faits avec le propriétaire le 24 novembre (à partir de son usage de Planka), repris dans le style de Listo. Mises à jour le 25 novembre avec ses réponses (bandeau à six boutons retenu, pas de colonne de fin, quatre rôles et choix du droit à trois options). **Les projets, colonnes et cartes montrés sont des exemples, pas des données** : une installation neuve n'a aucun projet.

**Un seul tableau par projet** (décision du propriétaire du 25 novembre 2026) : projet › colonnes › cartes. Ni onglets de tableaux, ni bouton « + Tableau », ni choix du tableau sur le téléphone ; « DomoPi Articles », « DomoPi Liens Tech » et « DomoPi Test produits » sont trois projets.

| Fichier | Rôle |
|---|---|
| `captures/` | 36 PNG : 18 écrans, en clair (`-clair`) et en sombre (`-sombre`). Téléphone 390 × 844 points à 2x, ordinateur 1 440 × 900 points à 2x |
| `listo-projets.css` | Nouveaux composants seulement (sections 16.35 à 16.45, à ajouter à `design/listo.css` après validation). Variables du kit uniquement (aucune couleur en dur) |
| `icons-nouvelles.svg.html` | Icônes à ajouter au sprite : `i-kanban` (projets), `i-comment`, `i-move`, `i-grip`, `i-filter`, `i-history` |
| `reference-telephone.html`, `reference-ordinateur.html` | Balisage de référence (lisent `../listo.css`, puis `../../public/css/app.css` pour les éléments qui existent déjà dans l'application). Ajouter `?theme=dark` à l'adresse pour le sombre |
| `capture.mjs` | Refait les captures : `node design/projets/capture.mjs` (ou seulement certains écrans : `node design/projets/capture.mjs projet-1 carte-1`) |
| `mockup-only.css` | Planche et mode capture. Ne pas livrer |

## Captures

Téléphone :

- `accueil-1` : Accueil avec la tuile « Projets » en bas, sur toute la largeur (« 5 » : mes cartes pas faites) ; trois cartes, les plus urgentes d'abord, chacune avec « projet · colonne · échéance » (« En retard » en rouge ET écrit). Pas de bandeau sur l'Accueil (inchangé).
- `projets-1` : écran « Projets » avec le bandeau à **six boutons**, **retenu** par le propriétaire (Accueil, Échéances, Listes, Notes, Projets, Réglages ; libellés en 11 px serrés, « Échéances » tient juste).
- `projets-2` : le même écran avec le bandeau à cinq boutons (proposition B, **non retenue**, gardée pour mémoire : « Réglages » laissait sa place à « Projets »). Cartes des projets : colonnes en pastilles (point de couleur, nom, nombre), « 2 cartes pour vous · 1 en retard », personnes, point des nouveautés, « Lecture seule ».
- `projet-1` : un projet sur le téléphone, une colonne à la fois : onglets des colonnes en couleur (choisi : fond doux, liseré, gras), cartes (étiquettes, échéance « Aujourd'hui » / en retard / à venir, « 2/3 », liens, commentaires, personnes, nouveautés), barre d'ajout en verre « Ajouter dans « Relecture » », loupe.
- `projet-2` : « Filtrer les cartes » (personnes, étiquettes ; « Voir 1 carte »).
- `carte-1`, `carte-2`, `carte-3` : une carte ouverte : titre, colonne (bouton qui ouvre « Déplacer vers… »), Personnes, Échéance (date, heure, rappel, case « Fait »), Étiquettes, Description mise en forme comme les notes (cases = liste de tâches, « 2/3 »), Liens, onglets Commentaires · Historique, commentaire à écrire en bas.
- `deplacer-1` : « Déplacer vers… » : colonnes avec leur couleur et leur nombre de cartes, « En haut » / « En bas ».
- `partage-1` : « Partager » ouvre directement les personnes (pas de choix « lien temporaire » : un projet n'a pas de lien public) ; sous chaque personne cochée, le choix du droit à trois options « Modifier | Contribuer | Lire » (quatre rôles avec le propriétaire), et une phrase par droit sous la carte.
- `reglages-projet-1` : réglages du projet : nom, colonnes (poignée, couleur, nombre, crayon, « Ajouter une colonne »), étiquettes du projet, option « Priorité », « Supprimer le projet ».
- `colonne-1` : feuille d'une colonne : nom, huit couleurs, place (avant / après), « Supprimer la colonne » (pas de « colonne de fin » : décision du 25 novembre 2026).
- `fonctions-1` : Réglages › Fonctions avec « Projets » sous « Notes ».
- `corbeille-1` : Réglages › Corbeille, troisième onglet « Projets ».

Ordinateur :

- `pc-projets-1` : « Projets » dans le menu de gauche (après Notes), les projets dessous ; au centre, les cartes des projets ; « Nouveau projet » (N) en bas du menu.
- `pc-projet-1` : un projet sur toute la largeur : en-tête (À jour, Partager et personnes, recherche, ⋮), filtres Personnes et Étiquettes, colonnes côte à côte (liseré de couleur, nombre, ⋮, « Ajouter une carte », « + Colonne » au bout, défilement de côté) ; une carte tenue (glisser-déposer) et la place où elle tombera.
- `pc-carte-1` : une carte ouverte dans une fenêtre : à gauche le contenu (un commentaire importé de Planka, en pointillés : « importé de Planka par Guillaume »), à droite Colonne, Ajouter, Actions (« Déplacer vers… » M, Dupliquer, Ne plus suivre, Supprimer).
- `pc-reglages-projet-1` : réglages du projet sur deux colonnes.

## Nouveaux composants

`.c-<couleur>` et `.coldot` (couleur d'une colonne : les huit couleurs des étiquettes) ; `.tabbar--6` ; `.tile--wide`, `.tile__row--two`, `.tile__two`, `.tile__sub` ; `.proj-card`, `.colchip` ; `.coltabs`, `.coltab` ; `.kcards`, `.kcard`, `.kcount`, `.due` (`--late`, `--today`, `--done`), `.kdrop` ; ordinateur : `.kboard`, `.kcol`, `.kfilters`, `.pfilter` ; carte ouverte : `.kc`, `.kc__where`, `.kfield`, `.kadd`, `.kdone`, `.kc__section`, `.klink`, `.kcomment` (`--imported`), `.khist`, `.kdialog`, `.kside`, `.kcompose` ; `.move__count` ; `.col-row`, `.group-title` ; choix du droit à trois options : `.share__person--3`, `.share__access--3`, `.share-roles`. Le reste vient du kit tel quel (tuiles, cartes, étiquettes 16.32, mise en forme des notes 16.33, feuilles, onglets, interrupteurs, barre d'ajout en verre, loupe).

## Choix faits dans les maquettes

- Couleur des colonnes : les huit couleurs des étiquettes (mêmes variables, contraste AA en clair et en sombre), le nom toujours écrit. Planka a un « turquoise » : ici, Planifiés est violet.
- Téléphone : le bouton des personnes du projet est une simple icône (place) ; « Filtrer » est sur la ligne de la pastille d'état, comme « Tout replier » dans une liste.
- Carte ouverte sur le téléphone : un écran entier, comme une note (et non une feuille) : la description, les liens et les commentaires demandent de la place. Les champs sont posés l'un sous l'autre (nom au-dessus de la valeur) : sur 390 px, un nom à gauche ne laissait pas la place aux personnes.
- Échéance faite : pastille verte pleine avec une coche ET « fait » écrit ; en retard : fond rouge doux, icône d'alerte ET le mot dans le nom lu ; aujourd'hui : liseré vert et « Aujourd'hui ».
- Ordinateur : la carte ouverte est une fenêtre au centre (comme le brouillon), pas une zone à droite : les colonnes ont besoin de toute la largeur.
- Commentaire importé : bulle en pointillés et « importé de Planka par Guillaume » : on ne fait jamais croire qu'une personne de Listo l'a écrit.
- Les maquettes ne montrent pas la priorité (option coupée au départ, voir le cadrage), ni le menu ⋮ du projet, ni les écrans d'un Contributeur ou d'une personne en lecture seule (les mêmes, sans les boutons que le rôle ne permet pas).
- Choix du droit : « Modifier | Lire » tient au bout de la ligne pour une liste ou une note ; trois options n'y tiennent pas sur 390 px avec le prénom : elles passent sous la personne, sur toute la largeur.

## Décisions qui restent

Le propriétaire a répondu le 25 novembre 2026 (section 18 du cadrage). Restent trois petits points (18.2) : le Contributeur attribué à la carte d'un autre, qui peut dupliquer un projet, et le choix du droit à trois options (à valider sur la capture `partage-1`).
