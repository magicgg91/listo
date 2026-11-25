# Listo : comptes invités et discrets (maquettes)

Maquettes du 25 novembre 2026 pour le cadrage [`docs/cadrage-comptes.md`](../../docs/cadrage-comptes.md). Rien n'est construit : ces fichiers servent à décider. Demande du propriétaire : des comptes pour les personnes qui l'aident sur DomoPi, avec accès aux seuls projets, invisibles de la famille et qui ne voient pas la famille. Mises à jour le même jour avec ses décisions (section 18 du cadrage) : **pas de préréglage ni d'interrupteur « Compte discret » ; trois rôles, Admin, Utilisateur, Invité ; un invité est toujours discret ; la case de l'Admin autorise une fonction, la personne l'allume elle-même dans Réglages › Fonctions ; les Listes sont toujours là pour un Utilisateur**. **Les prénoms, projets et cartes montrés sont des exemples** : Guillaume (Admin), Hugo, Léa, Zoé (Utilisateurs, la famille), Max et Inès (Invités).

| Fichier | Rôle |
|---|---|
| `captures/` | 26 PNG : 13 écrans, en clair (`-clair`) et en sombre (`-sombre`). Téléphone 390 × 844 points à 2x, ordinateur 1 440 × 900 points à 2x |
| `listo-comptes.css` | Nouveaux composants seulement (sections 16.48 à 16.50, à ajouter à `design/listo.css` après validation). Variables du kit uniquement (aucune couleur en dur) |
| `reference-telephone.html`, `reference-ordinateur.html` | Balisage de référence (lisent `../listo.css`, puis `../../public/css/app.css` pour les éléments qui existent déjà dans l'application). Ajouter `?theme=dark` à l'adresse pour le sombre |
| `capture.mjs` | Refait les captures : `node design/comptes/capture.mjs` (ou seulement certains écrans : `node design/comptes/capture.mjs admin-compte-1 partage-admin-1`) |
| `mockup-only.css` | Planche et mode capture. Ne pas livrer |

Aucune nouvelle icône : `#i-eye-off` (compte discret), `#i-eye`, `#i-user`, `#i-users` sont déjà dans le sprite.

## Captures

Téléphone :

- `admin-comptes-1` : Administration › Comptes. Admin et Utilisateurs d'abord (« Utilisateur · sans projets » pour Zoé, à qui l'Admin a décoché les projets), puis un titre « Invités » avec Inès et Max (« Invité · Projets » : ce qui est coché) et la pastille « Discret » (œil barré ET le mot).
- `admin-compte-1` : la page du compte de Max (au lieu de la feuille d'aujourd'hui, devenue trop longue) : en tête, le **rôle** « Utilisateur | Invité | Admin » (Invité ; « Admin » grisé : un invité passe d'abord par Utilisateur) et sa phrase « Un invité est toujours discret… », puis **Fonctions autorisées** (Listes, Notes, Projets, « Peut créer ses propres projets » décalé sous Projets, Assistants IA) : Projets seul coché, et la ligne « Il choisit ensuite lui-même d'allumer Listes, Notes et Projets dans Réglages › Fonctions ».
- `admin-compte-2` : la page du compte de Hugo, Utilisateur : « Visible de toute la famille. Décochez ce qu'il ne doit pas utiliser. » ; **pas de ligne « Listes »** (toujours là), Notes, Projets, création, Assistants IA autorisés ; « il allume ensuite lui-même Notes et Projets dans Réglages › Fonctions » ; puis Sécurité.
- `nouveau-compte-1` : « Nouveau compte » : le rôle d'abord (Invité choisi), puis les fonctions autorisées au départ (Invité : Projets seul ; Utilisateur : toutes, sans ligne Listes) et « Il les allume ensuite lui-même dans Réglages › Fonctions », identifiant, nom affiché, mot de passe provisoire.
- `invite-accueil-vide-1` : l'Accueil de Max à sa **première connexion** : rien n'est allumé ; une invitation sur toute la largeur (« Bienvenue, Max. Votre compte est prêt. Allumez les projets dans Réglages › Fonctions… », bouton « Ouvrir Réglages › Fonctions ») et la tuile Compte ; la cloche a la notification « Partage ».
- `invite-fonctions-1` : Réglages › Fonctions de Max : la seule fonction autorisée, « Projets », éteinte ; « Seules les fonctions que l'Admin a autorisées pour votre compte sont proposées. ».
- `invite-accueil-1` : l'Accueil de Max, **projets allumés** (les écrans suivants aussi) : tuile Projets (ses trois cartes les plus urgentes) et tuile Compte ; ni Échéances, ni Listes, ni Notes. Deux tuiles seules : chacune sur toute la largeur.
- `invite-projets-1` : l'écran Projets de Max : seulement « DomoPi Articles », pas de « + » (il ne peut pas créer de projet), membres G, H, I, M ; **bandeau à trois boutons** (Accueil, Projets, Réglages).
- `invite-reglages-1` : les Réglages de Max : Mon compte (pastille « Invité »), Accueil, Fonctions (« Projets »), Notifications, Corbeille, Aide, À propos ; pas d'Administration ; l'encadré « Compte invité ».
- `partage-admin-1` : Guillaume (Admin) partage « DomoPi Articles » : Max et Inès sont dans sa liste avec « Invité · discret » sous leur prénom ; l'avertissement « Hugo verra Max et Inès dans ce projet, et ils le verront. » (feuille défilée jusqu'en bas).
- `partage-famille-1` : Léa partage sa liste « Courses » : Guillaume, Hugo, Zoé ; **ni Max ni Inès**, et rien qui laisse deviner qu'ils existent.

Ordinateur :

- `pc-invite-1` : Max sur ordinateur : menu de gauche réduit (Accueil, Projets, puis « DomoPi Articles ») ; le projet ouvert en Contributeur : « Personnes » au lieu de « Partager », filtres avec les seuls membres du projet, « Ajouter une carte » dans chaque colonne, ni « + Colonne » ni menu des colonnes ; « Nouvelle carte » (N) en bas du menu.
- `pc-admin-comptes-1` : Administration › Comptes sur ordinateur : la liste à gauche (Max choisi : fond doux ET barre), la page de Max à droite, sur deux colonnes (rôle et accès ; sécurité).

## Nouveaux composants

`.chip--discreet`, `.discreet-tag` (16.48) ; `.share-warn` (avertissement de la feuille « Partager », sur `.note` du kit) ; `.acct-card`, choix du rôle désactivé (`.segmented__opt:disabled`), `.toggle-row--sub`, `.acct-sees`, `.acct-field` (16.49) ; `.acct-split`, `.acct-split__list`, `.acct-split__page`, `.acct-split__cols` (16.50) ; `.home-hint` et ses parties (16.51, invitation de l'Accueil quand rien n'est allumé). Le reste vient du kit tel quel (lignes, groupes, interrupteurs, choix segmentés, feuilles, tuiles, cartes des projets, tableau, bandeau du bas à trois places).

## Choix faits dans les maquettes

- « Discret » : toujours l'icône ET le mot ; jamais montré à la famille (elle ne voit pas ces comptes), seulement à l'Admin (Administration, feuille « Partager »). Ce n'est pas un réglage : c'est le rôle Invité.
- Le choix du rôle est un `.segmented` à trois places (« Utilisateur | Invité | Admin »), en tête de la page, avec une phrase dessous qui change selon le rôle ; un Admin n'a pas de cases (« Un Admin a accès à tout. », non dessiné).
- La page d'un compte ne montre **aucun nom de projet ni de personne** : l'Admin n'a pas de droit sur le contenu des autres.
- Le bandeau à trois boutons est le bandeau de base du kit (trois places) : rien à dessiner.
- Les écrans d'un invité qui a aussi les Notes, ou d'un Utilisateur à qui l'Admin a décoché une fonction, ne sont pas dessinés : ce sont les écrans d'aujourd'hui, avec les seules fonctions ouvertes.

## Décisions qui restent

Les questions de la section 17 du cadrage, chacune avec une réponse recommandée (celles des préréglages et de l'interrupteur « discret » sont répondues : c'est le rôle ; celles des cases : elles autorisent, la personne allume ; Listes toujours là pour un Utilisateur).
