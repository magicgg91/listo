# Listo : comptes invités et discrets (maquettes)

Maquettes du 25 novembre 2026 pour le cadrage [`docs/cadrage-comptes.md`](../../docs/cadrage-comptes.md). Rien n'est construit : ces fichiers servent à décider. Demande du propriétaire : des comptes pour les personnes qui l'aident sur DomoPi, avec accès aux seuls projets, invisibles de la famille et qui ne voient pas la famille. **Les prénoms, projets et cartes montrés sont des exemples** : Guillaume (Admin), Hugo, Léa, Zoé (famille), Max et Inès (comptes discrets, préréglage « Invité »).

| Fichier | Rôle |
|---|---|
| `captures/` | 22 PNG : 11 écrans, en clair (`-clair`) et en sombre (`-sombre`). Téléphone 390 × 844 points à 2x, ordinateur 1 440 × 900 points à 2x |
| `listo-comptes.css` | Nouveaux composants seulement (sections 16.48 à 16.50, à ajouter à `design/listo.css` après validation). Variables du kit uniquement (aucune couleur en dur) |
| `reference-telephone.html`, `reference-ordinateur.html` | Balisage de référence (lisent `../listo.css`, puis `../../public/css/app.css` pour les éléments qui existent déjà dans l'application). Ajouter `?theme=dark` à l'adresse pour le sombre |
| `capture.mjs` | Refait les captures : `node design/comptes/capture.mjs` (ou seulement certains écrans : `node design/comptes/capture.mjs admin-compte-1 partage-admin-1`) |
| `mockup-only.css` | Planche et mode capture. Ne pas livrer |

Aucune nouvelle icône : `#i-eye-off` (compte discret), `#i-eye`, `#i-user`, `#i-users` sont déjà dans le sprite.

## Captures

Téléphone :

- `admin-comptes-1` : Administration › Comptes. La famille d'abord (« Famille · 2FA activée »), puis un titre « Comptes discrets » avec Inès et Max (« Invité · projets seulement ») et la pastille « Discret » (œil barré ET le mot).
- `admin-compte-1` : la page du compte de Max (au lieu de la feuille d'aujourd'hui, devenue trop longue) : en tête, préréglage (« Famille | Invité »), **Accès** (Listes, Notes, Projets, « Peut créer ses propres projets » décalé sous Projets, Assistants IA).
- `admin-compte-2` : la même page, plus bas : **Visibilité** (« Compte discret »), l'encadré « Ce que Max voit » (une phrase, sans aucune donnée : l'Admin n'a pas de droit sur le contenu des autres), Rôle (« Un compte discret ne peut pas être Admin »), Sécurité.
- `nouveau-compte-1` : « Nouveau compte » : le préréglage d'abord (Famille, Invité, avec une phrase chacun), puis identifiant, nom affiché, mot de passe provisoire.
- `invite-accueil-1` : l'Accueil de Max : tuile Projets (ses trois cartes les plus urgentes) et tuile Compte ; ni Échéances, ni Listes, ni Notes. Deux tuiles seules : chacune sur toute la largeur.
- `invite-projets-1` : l'écran Projets de Max : seulement « DomoPi Articles », pas de « + » (il ne peut pas créer de projet), membres G, H, I, M ; **bandeau à trois boutons** (Accueil, Projets, Réglages).
- `invite-reglages-1` : les Réglages de Max : Mon compte (pastille « Invité »), Accueil, Notifications, Corbeille, Aide, À propos ; ni Fonctions, ni Administration ; l'encadré « Compte invité ».
- `partage-admin-1` : Guillaume (Admin) partage « DomoPi Articles » : Max et Inès sont dans sa liste avec « Discret » sous leur prénom ; l'avertissement « Hugo verra Max et Inès dans ce projet, et ils le verront. » (feuille défilée jusqu'en bas).
- `partage-famille-1` : Léa partage sa liste « Courses » : Guillaume, Hugo, Zoé ; **ni Max ni Inès**, et rien qui laisse deviner qu'ils existent.

Ordinateur :

- `pc-invite-1` : Max sur ordinateur : menu de gauche réduit (Accueil, Projets, puis « DomoPi Articles ») ; le projet ouvert en Contributeur : « Personnes » au lieu de « Partager », filtres avec les seuls membres du projet, « Ajouter une carte » dans chaque colonne, ni « + Colonne » ni menu des colonnes ; « Nouvelle carte » (N) en bas du menu.
- `pc-admin-comptes-1` : Administration › Comptes sur ordinateur : la liste à gauche (Max choisi : fond doux ET barre), la page de Max à droite, sur deux colonnes (préréglage et accès ; visibilité, rôle, sécurité).

## Nouveaux composants

`.chip--discreet`, `.discreet-tag` (16.48) ; `.share-warn` (avertissement de la feuille « Partager », sur `.note` du kit) ; `.acct-card`, `.preset` (lignes `.radio-row` sur deux lignes), `.toggle-row--sub`, `.acct-sees`, `.acct-field` (16.49) ; `.acct-split`, `.acct-split__list`, `.acct-split__page`, `.acct-split__cols` (16.50). Le reste vient du kit tel quel (lignes, groupes, interrupteurs, choix segmentés, feuilles, tuiles, cartes des projets, tableau, bandeau du bas à trois places).

## Choix faits dans les maquettes

- « Discret » : toujours l'icône ET le mot ; jamais montré à la famille (elle ne voit pas ces comptes), seulement à l'Admin (Administration, feuille « Partager »).
- La page « Compte de Max » ne montre **aucun nom de projet ni de personne** : seulement ce que les réglages permettent (« Seulement les projets qu'on lui partage, et les personnes de ces projets »). L'Admin n'a pas de droit sur le contenu des autres.
- Le bandeau à trois boutons est le bandeau de base du kit (trois places) : rien à dessiner.
- Les écrans d'un invité qui a aussi les Notes (préréglage « Personnalisé ») ne sont pas dessinés : ce sont les écrans d'aujourd'hui, avec les seules fonctions ouvertes.

## Décisions qui restent

Les questions de la section 17 du cadrage, chacune avec une réponse recommandée.
