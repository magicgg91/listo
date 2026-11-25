# Listo : comptes « invités », accès et comptes discrets (cadrage, sans code)

Document de conception rédigé le 25 novembre 2026, à partir de la demande du propriétaire du même jour ; **mis à jour le même jour avec ses décisions** (section 18 : le rôle remplace les préréglages et l'interrupteur « Compte discret »). Il ne contient aucun code et ne change rien à l'application : il sert à **décider s'il faut le faire, et comment**, puis à construire. Les maquettes sont dans [design/comptes/](../design/comptes/README.md). Une fois construit, chaque point rejoindra le texte du [cahier des charges](cahier-des-charges.md) (Comptes et rôles, Écrans, Modèle de données, Sécurité), comme pour le [cadrage des projets](cadrage-projets.md).

**La demande du propriétaire (25 novembre 2026)**

> « J'ai intégré dans Listo la gestion projet que je faisais avant dans Planka, j'aimerais donc créer des comptes pour mes camarades qui m'aident dans la gestion de DomoPi et je leur donnerais accès uniquement au projet en question. Par contre, je n'ai pas envie que leurs noms soient vus des autres utilisateurs, ni que eux puissent voir les autres utilisateurs. Serait-il possible que je puisse gérer des permissions utilisateurs plus fines, par exemple pour ne laisser à un copain l'accès uniquement aux projets, et une option pour moi aussi dans la gestion de son compte pour que son compte soit invisible des autres (et vice-versa). Discussion, propose-moi un plan de faisabilité et maquette. »

**Ses décisions, après le premier cadrage (25 novembre 2026)**

> « Je ne veux pas forcément de sélecteur préréglage ; on peut se dire que c'est le rôle qui donne ce préréglage en auto. Admin tous les droits ; utilisateur, la famille, accès possible à tout, je peux sélectionner aussi les fonctions auxquelles il a accès ; invité, l'admin sélectionne ce que le user aura droit de voir et utiliser comme fonction (liste, notes, projets et création projets ou non, assistant IA). Un rôle invité est automatiquement en discret, pareil on s'évite un réglage supplémentaire. »

**Réponse courte**

- **C'est faisable**, sans nouvelle dépendance, en **trois étapes** (trois PR), dont la plus grosse est la dernière (« pas de listes »).
- **Trois rôles** : **Admin** (tout, rien à régler), **Utilisateur** (la famille, comme aujourd'hui : tout est ouvert au départ, l'Admin peut décocher des fonctions) et **Invité** (nouveau : l'Admin coche ce qu'il peut voir et utiliser ; au départ, **Projets seulement**, sans création de projet ni assistant IA). **Un invité est toujours discret**, par son rôle, sans autre réglage : la famille ne le voit pas, et il ne voit pas la famille. Les cases d'accès sont les mêmes pour Utilisateur et Invité : Listes, Notes, Projets, « Peut créer ses propres projets », Assistants IA.
- **Une limite à dire clairement** : « discret » cache un compte **de l'annuaire** (les listes de personnes où l'on choisit avec qui partager, ou pour qui est une liste d'envies). Il ne peut pas le cacher **à l'intérieur d'un projet partagé** : si Hugo est membre de « DomoPi Articles » avec Max, Hugo voit Max dans ce projet (personnes, cartes attribuées, commentaires, historique), et Max voit Hugo. Sans cela, on ne pourrait ni attribuer une carte ni savoir qui a écrit un commentaire. La feuille « Partager » le dit avant de valider (5.3).
- **Le risque principal** : un nom qui fuit par un chemin oublié. L'inventaire de la section 3 en compte **une trentaine** ; la plupart sont déjà sûrs (ils ne montrent que les membres d'une chose partagée). Le vrai travail est concentré en **un seul endroit**, l'annuaire (aujourd'hui `activeUsers()`, envoyé tel quel à tous les comptes), plus quatre contrôles du serveur (partage, destinataire d'envies), et protégé par un test « annuaire identique avec ou sans invités », comme le test des réservations. Un second risque, technique : ajouter une valeur au rôle demande de **recréer la table des comptes** (8.1), avec une précaution indispensable.
- **Recommandation** : le faire dans Listo (sections 13 et 15), en commençant par l'étape 1 (rôle Invité et annuaire), utile seule ; l'alternative « une deuxième installation de Listo pour DomoPi » est sûre et gratuite tout de suite, mais double tout (comptes, applications, sauvegardes) et sépare DomoPi du reste de la journée du propriétaire.

Deux constats faits en passant, corrigés à l'étape 1 (3.3) : **l'identifiant de connexion de chaque compte est envoyé à tous les comptes** (inutile à l'écran, et utile à qui voudrait deviner un mot de passe), et **un compte qui n'a servi qu'aux projets peut être supprimé par l'Admin**, ce qui effacerait ses projets avec lui.

## Sommaire

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Vocabulaire](#2-vocabulaire)
3. [Inventaire : où un compte en voit un autre](#3-inventaire--où-un-compte-en-voit-un-autre)
4. [Accès d'un compte, réglé par l'Admin](#4-accès-dun-compte-réglé-par-ladmin)
5. [Invité : toujours discret](#5-invité--toujours-discret)
6. [Les trois rôles](#6-les-trois-rôles)
7. [Écrans](#7-écrans)
8. [Modèle de données](#8-modèle-de-données)
9. [Matrice des droits](#9-matrice-des-droits)
10. [Sécurité](#10-sécurité)
11. [Tests](#11-tests)
12. [Aide et documents](#12-aide-et-documents)
13. [Découpage en étapes](#13-découpage-en-étapes)
14. [Risques](#14-risques)
15. [Autres solutions étudiées](#15-autres-solutions-étudiées)
16. [Maquettes](#16-maquettes)
17. [Questions au propriétaire](#17-questions-au-propriétaire)
18. [Décisions du propriétaire (25 novembre 2026)](#18-décisions-du-propriétaire-25-novembre-2026)

## 1. Contexte et objectifs

Listo sert à une famille de six ou sept personnes ; le propriétaire (Guillaume) est l'Admin. Depuis le 25 novembre 2026, les **projets** ont remplacé Planka pour son blog DomoPi (« DomoPi Articles », « DomoPi Liens Tech », « DomoPi Test produits »). Deux ou trois personnes l'aident (dans les maquettes : **Max** et **Inès**). Aujourd'hui, pour les faire entrer dans ces projets, il faudrait leur créer un compte ordinaire, et :

- leurs noms apparaîtraient à **toute la famille** (choix des personnes dans « Partager », « Pour qui ? » d'une liste d'envies), et **toute la famille** leur apparaîtrait ;
- ils auraient **tout Listo** : listes (avec la mémoire commune des articles déjà saisis par la famille), notes (avec les étiquettes communes du foyer), « À offrir », Échéances…

Buts :

- l'Admin donne à chaque compte un **rôle** (Admin, Utilisateur, Invité) et, pour un Utilisateur ou un Invité, choisit **ce qu'il peut utiliser** (Listes, Notes, Projets…) ;
- un **Invité** ne voit **que ce que l'Admin a coché** (au départ : les projets qu'on lui partage), et **personne d'autre que les membres de ce qu'on lui partage** ;
- **rien ne change pour la famille** : un compte ordinaire reste ce qu'il est (Utilisateur, tout ouvert) ; la famille ne voit simplement pas les invités ;
- les contrôles sont faits **par le serveur**, à chaque demande ; le téléphone ne fait que cacher les boutons.

Hors périmètre : des groupes ou des équipes, des droits par liste différents de ceux d'aujourd'hui, un rôle « Admin délégué », l'inscription libre, les invitations par e-mail, un lien public des projets (toujours non).

## 2. Vocabulaire

| Mot | Sens dans ce document |
| --- | --- |
| **Rôle** | Admin, Utilisateur ou **Invité** (nouveau) : `users.role` = `'admin'`, `'user'` ou `'guest'` |
| **Annuaire** | la liste des comptes qu'un compte peut **choisir** : personnes proposées dans « Partager » (listes, notes, projets) et « Pour qui ? » d'une liste d'envies. Aujourd'hui : tous les comptes actifs (`activeUsers()`, `server/lists.js`), envoyés à chaque synchronisation (`users`) et par `GET /api/users` |
| **Contexte partagé** | une liste, une note ou un projet dont deux comptes sont membres. Dans ce contexte, chacun voit le prénom de l'autre : « Personnes », tâches et cartes attribuées, commentaires, historique, Nouveautés (« Léa a ajouté… »), notifications, réservations d'une liste d'envies |
| **Accès** | ce qu'un Utilisateur ou un Invité a le droit d'utiliser, coché par l'**Admin** (nouveau) |
| **Fonctions** | ce qu'une personne choisit d'afficher pour **elle-même**, dans Réglages › Fonctions (existe : Notes, Projets) |
| **Discret** | absent de l'annuaire des autres, avec un annuaire vide : c'est **toujours** le cas d'un Invité, et seulement de lui (pas de réglage à part) |
| **Invité** et **Visiteur** | à ne pas confondre : un **Invité** a un compte Listo (rôle) ; un **visiteur** ouvre un lien public, sans compte (existe) |

## 3. Inventaire : où un compte en voit un autre

Relevé dans le code du 25 novembre 2026 (branche `dev`). Pour chaque endroit : ce qu'il montre aujourd'hui, ce qui change pour un **Invité** (toujours discret), et pour un compte **sans Listes** (un invité « projets seulement », ou un utilisateur à qui l'Admin a décoché les Listes).

### 3.1 L'annuaire (le seul vrai problème)

| # | Endroit | Fichiers | Aujourd'hui | Invité (discret) | Sans Listes |
| --- | --- | --- | --- | --- | --- |
| 1 | Synchronisation : `users` | `server/lists.js` (`changesSince`, `activeUsers`) | **tous les comptes actifs**, avec identifiant de connexion (`username`), id et nom affiché, à chaque appareil | absent de l'annuaire des autres (sauf l'Admin) ; son propre annuaire est vide | inchangé (l'annuaire sert aussi aux notes et aux projets) |
| 2 | `GET /api/users` | `server/routes/lists.js` | idem | idem (même fonction) | idem |
| 3 | Copie locale du téléphone | `public/js/store.js` (`state.users`, IndexedDB) | idem, gardée hors ligne | ne reçoit plus que l'annuaire filtré ; l'ancienne copie est **remplacée** à la synchronisation suivante (l'arrivée du nouveau code vide l'ancienne : version du service worker) | — |
| 4 | Feuille « Partager avec des personnes » (listes, notes) et « Partager » (projets) | `public/js/screens/share-picker.js`, `share-panel.js`, `public/js/sharing.js` | annuaire + membres actuels ; un membre absent de l'annuaire est affiché « Compte désactivé » | absent pour la famille ; pour l'Admin, présent avec « Invité · discret » ; un invité **déjà membre** reste affiché à son propriétaire (contexte partagé), **sans** la mention « Compte désactivé » (le serveur donne `active` dans les membres) | — |
| 5 | « Pour qui ? » d'une liste d'envies (création, conversion) | `public/js/screens/list-form.js`, `store.js` (création hors ligne), `server/lists.js` (`list.create`, `convertToWishes`) | annuaire | **jamais destinataire**, pour personne (Admin compris) ; refus du serveur identique à « compte inconnu » pour la famille | ne peut pas être destinataire (il ne verrait pas la liste) |
| 6 | Ajout d'un membre par son numéro (`PUT …/members`) | `server/lists.js`, `server/notes.js`, `server/projects.js` (`setMembers`) | tout compte actif est accepté | refusé si l'auteur ne le voit pas dans **son** annuaire, avec **la même réponse qu'un numéro inconnu** (400 `ops.utilisateurInconnu`) ; les numéros de compte se suivent (1, 2, 3…) : ce contrôle est indispensable | ajout à une **liste** refusé (400, message nommé « Zoé n'utilise pas les listes. » pour un utilisateur, voir 4.4) ; notes et projets selon son accès |

### 3.2 Les contextes partagés (déjà sûrs : seulement les membres)

| # | Endroit | Fichiers | Ce qui est montré | Changement |
| --- | --- | --- | --- | --- |
| 7 | « Personnes » d'une liste | `server/lists.js` (`describeList`, `members`) | membres : id, **identifiant de connexion**, nom, droit | retirer `username` (3.3) ; sinon rien |
| 8 | « Personnes » d'une note | `server/notes.js` (`membersOf`) | membres : id, nom, droit | rien |
| 9 | « Personnes » d'un projet, filtre « Personnes », pastilles des cartes | `server/projects.js` (`membersOf`), `project-view.js` | membres et rôles | rien |
| 10 | Tâches attribuées (une, plusieurs, chacun son tour) | `server/lists.js`, `public/js/assign.js` | membres « Peut modifier » | rien |
| 11 | Cartes attribuées, « créée par » | `server/projects.js` | membres du projet | rien |
| 12 | Commentaires des cartes, commentaires importés | `server/projects.js`, `card-activity.js` | auteur (nom relu à l'affichage) | rien (le nom d'un ancien membre reste lisible : question 8) |
| 13 | Historique des cartes | `server/projects.js` (`cardHistory`, `allNames`) | noms relus à l'affichage, par id | rien ; un compte supprimé reste « Un ancien compte » |
| 14 | Nouveautés des listes (« Léa a ajouté… ») | `server/news.js` | auteur, ou « Un ancien membre » | rien |
| 15 | Page Notifications et notifications push | `server/inbox.js`, `server/notify.js` | prénom de l'auteur (« Guillaume a partagé… », « Léa vous a attribué… ») ; jamais à quelqu'un d'extérieur | rien ; les notifications d'une fonction **non autorisée** ne sont pas remises (comme une fonction coupée, 4.2) |
| 16 | Réservations d'une liste d'envies (participants) | `server/reservations.js` | prénoms des membres qui réservent, aux autres membres (jamais au destinataire) | rien ; un compte sans Listes n'est jamais membre d'une liste |
| 17 | « À offrir » | `public/js/gifts.js`, `server/reservations.js` | mes réservations seulement | absent sans Listes |
| 18 | Écran Échéances (« à Léa ») | `public/js/screens/deadlines.js` | personnes attribuées des tâches de mes listes | absent sans Listes (4.3) |
| 19 | Assistants IA (MCP) : listes | `server/mcp-tools.js` (`people`, `you`, `assigned_to`) | membres des listes de la connexion | outils des listes **refusés** sans Listes (4.6) |
| 20 | Assistants IA : notes | `server/mcp-notes.js` (`owner`, `updated_by`) | propriétaire, dernier auteur | refusés sans Notes |
| 21 | Assistants IA : projets | `server/mcp-projects.js` (`members`, `assignees`, auteurs) | membres du projet | rien ; `assignees` par nom ne cherche que parmi les membres (déjà le cas) |
| 22 | Temps réel (SSE) | `server/events.js` | aucun nom, aucune donnée | ne plus envoyer `event: list` à un compte sans Listes ; `event: refs` (magasins, rayons) non plus |
| 23 | Page publique d'une liste ou d'une note | `server/routes/public.js` | prénom du destinataire d'une liste d'envies seulement | rien (un invité n'est jamais destinataire) |

### 3.3 Ailleurs

| # | Endroit | Fichiers | Aujourd'hui | Changement |
| --- | --- | --- | --- | --- |
| 24 | **Identifiant de connexion envoyé à tous** | `activeUsers()`, `describeList()` (`username`) | chaque compte reçoit l'identifiant de connexion de tous les autres ; le téléphone ne l'affiche nulle part (il ne sert qu'à « Mon compte » pour soi-même) | **ne plus l'envoyer** (sauf à l'Admin, dans Administration) : étape 1 |
| 25 | Administration › Comptes | `server/routes/admin-users.js`, `public/js/screens/admin.js` | Admin seulement : tous les comptes ; rôle à deux valeurs | rôle à trois valeurs, Accès (7.1) ; l'Admin voit toujours tout |
| 26 | Suppression d'un compte « jamais utilisé » | `admin-users.js` (`accountUsed`) | ne compte ni les projets, ni les cartes, ni les commentaires | **à corriger à l'étape 1** : un invité qui possède un projet serait « jamais utilisé » ; le supprimer effacerait ses projets (`projects.owner_id … ON DELETE CASCADE`) |
| 27 | Demandes de compte (fournisseur d'identité, LISTO_OIDC=on) | `server/oidc.js`, Administration | Admin seulement ; rôle Utilisateur ou Admin | « Accepter » propose aussi Invité (Utilisateur par défaut), avec ses cases d'accès |
| 28 | Écran de connexion, « Mot de passe oublié » | `login.js`, `server/routes/auth.js` | aucun nom ; réponse identique pour un identifiant inconnu | rien |
| 29 | Étiquettes des notes (réserve commune) | `server/labels.js` | les noms des étiquettes de tout le foyer, sans auteur | aucun nom de personne ; mais un **contenu commun** (« Anniversaire Zoé ») : voir 5.9 et question 6 |
| 30 | Mémoire des articles (« Souvent ajoutés », suggestions) | `server/lists.js` (`item_history`, synchronisation `history`) | **commune à tout le foyer**, envoyée à chaque compte | non envoyée sans Listes ; pour un invité avec Listes, voir 5.9 et question 7 |
| 31 | Magasins, rayons, produits connus (codes-barres) | `references.js`, `products.js` | communs, sans nom de personne | non envoyés sans Listes |
| 32 | Journal de sécurité | `server/audit.js` | identifiants, en anglais, lu par l'Admin seulement | nouvelles lignes (10) |
| 33 | « Mon compte », Réglages | `account.js`, `settings.js` (`roleChip`) | soi-même ; pastille « Admin » ou « Utilisateur » | pastille « Invité » ; une ligne « Compte invité : votre accès est réglé par l'Admin… » |
| 34 | Aide | `public/js/help-content.js` | la même pour tous | une section « Rôles des comptes : Admin, Utilisateur, Invité » (12) ; rien de caché |

Bilan : **un seul endroit envoie des noms hors des contextes partagés, l'annuaire (1 à 3)**, plus quatre contrôles du serveur qui l'utilisent sans le dire (5, 6). Tout le reste ne montre que des membres d'une chose partagée.

## 4. Accès d'un compte, réglé par l'Admin

### 4.1 Les cases, selon le rôle

Dans la page d'un compte (Administration › Comptes › Max ; maquettes `admin-compte-1`, `admin-compte-2`, `pc-admin-comptes-1`), sous le **rôle**, une section **« Accès »** (interrupteurs), pour un **Utilisateur** ou un **Invité** :

| Case | Ce qu'elle ouvre | Admin | Utilisateur (au départ) | Invité (au départ) |
| --- | --- | --- | --- | --- |
| **Listes** | listes (courses, tâches, envies), Échéances, « À offrir », mode scan, mémoire des articles, magasins et rayons | toujours | oui | non |
| **Notes** | notes, étiquettes des notes | toujours | oui | non |
| **Projets** | projets qu'on lui partage (et les siens) | toujours | oui | **oui** |
| **Peut créer ses propres projets** (sous « Projets ») | « Nouveau projet », « Dupliquer le projet », `create_project` | toujours | oui | non |
| **Assistants IA** (si LISTO_MCP=on) | « Autoriser un assistant IA » dans Mon compte, connexions existantes | toujours | oui | non |

- **Admin** : tous les droits, **aucune case** (la section « Accès » est remplacée par la phrase « Un Admin a accès à tout. »).
- **Utilisateur** : tout est ouvert au départ (la famille d'aujourd'hui) ; l'Admin peut **décocher** (par exemple « Projets » pour Zoé).
- **Invité** : l'Admin **coche** ce qu'il peut voir et utiliser ; recommandé au départ (nouveau compte) : **Projets seulement**, sans création de projet ni assistant IA (« accès uniquement au projet en question »).
- Il reste toujours **au moins une** des trois fonctions (Listes, Notes, Projets) : sinon le compte n'aurait rien à ouvrir (refus du serveur, dernière case bloquée). « Peut créer ses propres projets » n'a de sens qu'avec « Projets » (case grisée sinon).
- Hors ligne : non (Administration demande le réseau, comme aujourd'hui).
- Changer l'accès prend effet **tout de suite** : le serveur relit l'accès à chaque demande ; le téléphone de la personne l'apprend à sa synchronisation suivante (« event: refs » à ses seuls appareils, sans donnée).

### 4.2 Lien avec Réglages › Fonctions

**L'Admin autorise, la personne choisit dans ce qui est autorisé** : une fonction est utilisée si elle est **autorisée par l'Admin ET allumée par la personne** (`allowed ∧ enabled`). Ainsi on réutilise toute la mécanique des Fonctions (rien d'envoyé, rien de remis, adresses vers le premier écran, outils MCP refusés, **rien d'effacé**).

- Réglages › Fonctions ne montre que les fonctions autorisées ; s'il ne reste rien à choisir (invité « projets seulement »), la ligne « Fonctions » disparaît.
- Les Listes n'ont pas d'interrupteur pour la personne (elles sont le cœur de Listo) : `lists` n'existe que côté Admin.
- **Projets cochés pour un invité** : ils sont aussi **allumés** pour lui (`projects_enabled` = 1), sinon Max ne verrait rien sans aller dans Fonctions ; pour un Utilisateur, l'Admin n'allume rien à la place de la personne (les Projets restent coupés au départ dans ses Fonctions, comme aujourd'hui).
- **Partage reçu** : la règle des projets coupés (« Partage » remis avec « Allumez Projets… ») ne vaut pas pour une fonction **non autorisée** : rien n'est remis, et on ne peut de toute façon pas lui partager (4.4).

### 4.3 Ce que voit un invité « projets seulement »

Maquettes `invite-accueil-1`, `invite-projets-1`, `invite-reglages-1`, `pc-invite-1`. (Un Utilisateur à qui l'Admin aurait laissé les seuls Projets voit les mêmes écrans, mais reste visible de la famille.)

| Endroit | Ce qu'il voit |
| --- | --- |
| Premier écran | l'**Accueil** (comme tout le monde) ; il peut le couper (Réglages › Accueil) : son premier écran est alors « Projets » (seul choix) |
| Accueil | « Bonjour Max », la cloche ; tuiles **Projets** (ses cartes les plus urgentes) et **Compte**, chacune sur toute la largeur (deux tuiles seules) ; ni Échéances, ni Listes, ni Notes ; masquage et ordre comme aujourd'hui |
| Bandeau du bas | **trois boutons : Accueil, Projets, Réglages** (`.tabbar` de base, trois places ; l'Accueil coupé : deux boutons, Projets et Réglages, cloche dans la barre du haut) ; pas de bandeau sur l'Accueil (inchangé) |
| Projets | les projets qu'on lui partage ; **pas de « + »** sans « Peut créer ses propres projets » ; pas de « Dupliquer le projet » dans le menu ⋮ ; « Afficher dans Échéances » absent (pas d'écran Échéances) |
| Un projet | comme aujourd'hui, selon son rôle dans le projet (souvent Contributeur) : les membres du projet, et eux seuls |
| Échéances | **absent** (l'écran montre surtout des tâches ; les cartes datées sont déjà dans la tuile Projets et dans chaque projet ; question 4) |
| Page Notifications | ses notifications de projets et de partage ; catégories proposées dans Réglages › Notifications : Modifications, Échéances (rappels des cartes), Partage ; **pas** Envies |
| Réglages | Mon compte (pastille « Invité ») ; Général : Accueil, Notifications, Corbeille (sans onglets : ses projets supprimés) ; Informations : Aide, À propos ; **ni Fonctions** (rien à choisir), ni Administration |
| Mon compte | nom, identifiant, mot de passe, double authentification, thème, langue, « Se déconnecter » ; une ligne « **Compte invité** : votre accès est réglé par l'Admin. » ; pas « Assistants IA » s'il n'y a pas accès |
| Recherche (loupe, ordinateur) | ses projets et leurs cartes seulement |
| Ordinateur | menu de gauche : **Accueil, Projets** (et ses projets dessous, sur les écrans des projets) ; ni Échéances, Listes, Notes, ni « Types » ; pas de « Nouveau projet » en bas sans le droit de créer ; « Invité » sous son prénom |
| Aide | la même aide que tout le monde (le guide est aussi publié sur le site) ; question 9 |
| Assistants IA | si l'Admin les coche : seulement les outils des fonctions cochées ; les autres répondent « Les listes ne sont pas ouvertes pour ce compte. » ; l'écran d'autorisation propose « Mes projets » au lieu de « Toutes mes listes, mes notes et mes projets » |

### 4.4 « Pas de listes » côté serveur

Les listes sont le cœur de Listo : presque tout les suppose. Décocher les Listes pour un compte (Utilisateur ou Invité), c'est :

- **Synchronisation** (`changesSince`) : rien de ce qui touche les listes : `lists`, `items`, `listIds` vides ; ni `stores`, `aisles`, `history` (mémoire des articles), `reservations`, `gifts`, ni Nouveautés des listes ; `users` (annuaire) reste, selon le rôle.
- **File d'attente** (`/api/ops`, un seul aiguillage dans `server/lists.js`, `handlers[op.type]`) : toute opération `list.*`, `item.*`, `gift.*` refusée (403, « Les listes ne sont pas ouvertes pour votre compte. ») avant tout traitement ; les autres (`note.*`, `project.*`, `account.*`) selon leur propre accès.
- **Routes** refusées de même (un contrôle `requireAccess('lists')` posé une fois par routeur) : listes et articles (`routes/lists.js`, **sauf** l'annuaire `GET /api/users`, qui sert aussi aux notes et projets et doit être déplacé dans une route à part), photos, produits (mode scan), magasins et rayons, liens publics des listes, réservations, suggestions.
- **Partage** : une liste ne peut pas être partagée avec lui (400 nommé pour un Utilisateur visible ; « compte inconnu » pour un Invité), ni lui être destinée.
- **Notifications et rappels** (`deliver`, `server/notify.js`) : rien des listes (une règle `allowedList` comme `allowedNote`), même s'il était déjà membre ; résumé du matin sans tâches.
- **Temps réel** : pas de `event: list` ni `event: refs`.
- **Assistants IA** : outils des listes refusés (`list_lists`, `read_list`, `add_items`, `set_checked`, `update_items`).
- **Rien n'est effacé** : s'il possédait des listes ou en était membre, elles restent en base et pour leurs autres membres (l'Admin en est prévenu, 4.7) ; elles reviennent si l'Admin recoche les Listes.

**Effort** : c'est la plus grosse partie (étape 3) : une quinzaine de fichiers serveur touchés, surtout par une seule règle appelée au bon endroit, et côté téléphone l'absence des Listes (bandeau, Accueil, menu de gauche, Échéances, « À offrir », Corbeille sans onglets, catégories de notifications, recherche, raccourcis clavier), à la manière de « Notes coupées » qui existe déjà.

### 4.5 « Peut créer ses propres projets »

- Décochée : `project.create` et `project.duplicate` refusés (403, « Votre compte ne peut pas créer de projet. ») ; « + », « Nouveau projet » (N) et « Dupliquer le projet » absents ; `create_project` (MCP) refusé ; les projets qu'il possède déjà restent à lui.
- Il garde tout ce que son **rôle dans chaque projet** permet (créer des **cartes**, commenter…) : cette case ne touche que la création de projets.

### 4.6 Assistants IA

- Décochée : « Autoriser un assistant IA » absent de Mon compte ; `/oauth/authorize` refuse ce compte (page « Votre compte ne peut pas autoriser d'assistant IA. ») ; **les connexions existantes sont révoquées** (journal `oauth_revoked`, `reason: access`), comme à la désactivation d'un compte.
- Cochée : les outils suivent l'accès (Listes, Notes, Projets), contrôlé en premier, avant la portée et les droits (même ordre que « projets coupés » aujourd'hui).

### 4.7 Décocher une fonction d'un compte qui a déjà des données

- **Décocher** : confirmation avec ce qui disparaîtra de **ses** écrans, en nombres (« Léa possède 4 listes, partagées avec 3 personnes : elles restent pour les autres, Léa ne les verra plus. ») ; rien n'est effacé.
- **Recocher** : tout revient tel quel.
- Les tâches et cartes qui lui sont attribuées restent attribuées (les autres le voient toujours) ; ses rappels ne lui sont plus remis.

## 5. Invité : toujours discret

### 5.1 Définition

Décision du propriétaire du 25 novembre 2026 : **le rôle Invité rend le compte discret, toujours, dans les deux sens**, sans autre réglage (ni interrupteur « Compte discret », ni préréglage). La page d'un invité le rappelle sous le rôle : « Un invité est toujours discret : la famille ne le voit pas, et il ne voit que les membres des projets qu'on lui partage. » (maquette `admin-compte-1`).

- Un Utilisateur et un Admin ne sont **jamais** discrets.
- Discret veut dire : **absent de l'annuaire des autres** (sauf de celui de l'Admin) **et annuaire vide** (5.2).

### 5.2 L'annuaire selon qui regarde

Une seule fonction du serveur, `directoryFor(viewer)`, remplace `activeUsers()` partout (synchronisation, `GET /api/users`, contrôles des ajouts) :

| Qui regarde | Son annuaire |
| --- | --- |
| **Admin** | tous les comptes actifs, chacun avec son rôle (mention « Invité · discret ») et son accès (pour griser une personne qui n'utilise pas les listes dans le partage d'une liste) |
| **Utilisateur** (famille) | les comptes actifs **qui ne sont pas des invités** ; pas d'identifiant de connexion |
| **Invité** | **vide** (seulement lui-même, qu'il connaît déjà) |

Champs envoyés, construits champ par champ : `id`, `displayName`, et pour l'Admin seulement `role` et `access`. Plus jamais `username`.

### 5.3 Contextes partagés : qui voit qui

**Ce qui ne peut pas être caché** : dans un projet (ou une liste, une note) partagé, chaque membre voit les autres membres. C'est nécessaire pour attribuer une carte, filtrer « Personnes », lire un commentaire ou l'historique.

Exemple, « DomoPi Articles » (propriétaire Guillaume), membres Hugo (Utilisateur), Max et Inès (Invités) :

| | voit Guillaume | voit Hugo | voit Max | voit Inès | voit Léa, Zoé |
| --- | --- | --- | --- | --- | --- |
| Guillaume (Admin) | — | oui | oui (annuaire et projet) | oui | oui |
| Hugo (Utilisateur) | oui | — | **dans ce projet seulement** | **dans ce projet seulement** | oui (annuaire) |
| Max (Invité) | dans ce projet (« Propriétaire ») | dans ce projet | — | dans ce projet | **jamais** |
| Léa (Utilisateur, pas membre) | oui | oui | **jamais** | **jamais** | oui |

Options étudiées pour le cas de Hugo :

- **A (recommandée)** : on l'accepte, et on le dit. Quand l'Admin ajoute un invité à un projet qui a d'autres membres, ou ajoute un proche à un projet qui a des invités, la feuille « Partager » affiche avant « OK » : « Hugo verra Max et Inès dans ce projet, et ils le verront. » (maquette `partage-admin-1`). Pour un projet vraiment à part, le propriétaire ne met pas de proche dedans.
- **B** : montrer aux invités les autres membres sous un nom neutre (« Membre 1 ») : illisible pour attribuer ou commenter ; et Hugo verrait quand même Max. Non.
- **C** : interdire de mélanger proches et invités dans un projet : trop rigide (Hugo aide aussi DomoPi). Non.

Le menu « Personnes » d'un projet et les pastilles ne montrent jamais le rôle du compte (Admin, Invité), seulement le prénom et le rôle dans le projet (déjà le cas).

### 5.4 Comment l'Admin partage DomoPi avec Max

1. Administration › Comptes › « Nouveau compte » (maquette `nouveau-compte-1`) : rôle **Invité** ; les cases d'accès apparaissent, **Projets seul coché** au départ ; identifiant `max`, nom affiché « Max », mot de passe provisoire (ou compte relié par le fournisseur d'identité).
2. Dans « DomoPi Articles » › Partager : Max et Inès sont dans la liste de **Guillaume** (il est Admin), avec « Invité · discret » sous leur prénom ; il les coche et choisit « Contribuer » (maquette `partage-admin-1`).
3. Max se connecte : il voit « DomoPi Articles » et ses membres, rien d'autre.

**Seul l'Admin peut ajouter un invité** à quelque chose (il est le seul à le voir). Si un proche veut Max dans son propre projet, c'est l'Admin qui lui partage… un projet à lui : un projet de Léa ne peut pas recevoir Max (question 1, option « Visible aussi par… »).

### 5.5 Un proche déjà dans le même projet

- Hugo voit Max **dans ce projet** ; il ne le voit **pas** dans son annuaire : il ne peut ni lui partager une liste, ni un autre projet, ni en faire le destinataire d'une liste d'envies.
- Si Hugo est propriétaire d'un projet où Max avait été ajouté **avant** de devenir invité, Max reste membre et visible dans ce projet (ce n'est pas l'annuaire) ; si Hugo le retire, il ne pourra plus le rajouter.

### 5.6 Listes d'envies

- Un invité **ne peut jamais être destinataire** d'une liste d'envies (« Pour qui ? ») : le destinataire est un membre d'office, ce serait ajouter un invité à une liste d'un proche. Refus du serveur à la création (`list.create`, hors ligne compris), à la conversion (`POST /api/lists/:id/wishes`) et dans « Modifier la liste » : 400 `ops.utilisateurInconnu` pour un Utilisateur (même réponse qu'un numéro qui n'existe pas) ; pour l'Admin, message nommé « Un invité ne peut pas recevoir une liste d'envies. ».
- Passer en Invité un Utilisateur déjà destinataire d'une liste d'envies : **refusé** tant qu'une liste d'envies lui est destinée (message nommé avec le nombre de listes), pour ne rien casser dans les règles des réservations.

### 5.7 Contrôles du serveur

- **Partage** (`setMembers` des listes, des notes, des projets) : chaque compte **ajouté** doit être dans `directoryFor(auteur)` ; sinon 400 `ops.utilisateurInconnu`, **mot pour mot la même réponse** que pour un numéro qui n'existe pas (même statut, même texte). Un membre **déjà présent** peut rester (et changer de droit ou être retiré).
- **Destinataire d'envies** : 5.6.
- **Invité qui partage** : son annuaire est vide, donc il ne peut ajouter personne (question 3) ; il voit « Partager » seulement pour retirer une personne de ses propres projets ou listes, s'il en a.
- Le téléphone n'est jamais cru : un numéro de compte envoyé « à la main » suit les mêmes contrôles.

### 5.8 Nom affiché

- Le **nom affiché** est choisi par l'Admin (prénom seul conseillé : « Max ») ; la personne ne le change pas (comme aujourd'hui).
- L'**identifiant de connexion** n'est plus jamais envoyé aux autres comptes (3.3), invité ou non.

### 5.9 Ce qui reste commun

Deux réserves sont **communes au foyer** et ne contiennent **aucun nom de personne**, mais un contenu :

- la **mémoire des articles** (« Souvent ajoutés », suggestions : tout ce que la famille a déjà tapé dans ses listes de courses) ;
- les **étiquettes des notes** (« Anniversaire Zoé », « Impôts »…).

Un invité « projets seulement » ne reçoit ni l'une ni l'autre. Pour un invité à qui l'Admin cocherait les Listes ou les Notes, la page du compte le dit en clair sous la case (« La mémoire des articles est commune au foyer. », « Les étiquettes des notes sont communes au foyer. ») ; les filtrer est possible mais coûteux (questions 6 et 7).

## 6. Les trois rôles

Décision du propriétaire du 25 novembre 2026 : **le rôle donne le réglage**, sans sélecteur de préréglage ni interrupteur « discret ».

| Rôle | Pour qui | Accès | Visible de la famille | Voit la famille |
| --- | --- | --- | --- | --- |
| **Admin** | le propriétaire (et tout autre Admin) | tout, aucune case | oui | oui (tous les comptes, invités compris) |
| **Utilisateur** | la famille (comme aujourd'hui) | tout coché au départ ; l'Admin peut décocher | oui | oui |
| **Invité** | les personnes qui aident (DomoPi) | coché par l'Admin ; au départ **Projets seulement** | **non** | **non** |

### 6.1 Changer de rôle

Dans la page du compte, le choix « Utilisateur | Invité | Admin » ; chaque changement passe par une confirmation, puis est enregistré tout de suite et journalisé. Les règles d'aujourd'hui restent (un Admin ne change pas son propre rôle ; il reste toujours au moins un Admin actif).

| Changement | Confirmation | Effet |
| --- | --- | --- |
| Utilisateur → **Invité** | « Rendre Léa invitée ? Elle disparaîtra de la liste des personnes de la famille (Partager, « Pour qui ? ») et ne verra plus les autres comptes. Ce qu'elle partage déjà avec eux reste partagé, et ils continueront de l'y voir. Ses accès restent ceux cochés ci-dessous. » | discrète tout de suite ; ses cases d'accès **ne changent pas** (rien n'est retiré en silence : l'Admin décoche ensuite ; question 12) ; refusé si une liste d'envies lui est destinée (5.6) |
| Invité → **Utilisateur** | « Rendre Max utilisateur ? Toute la famille pourra le voir et lui partager des listes, des notes et des projets, et il verra tous les comptes de la famille. Ses accès ne changent pas : cochez ce que vous voulez lui ouvrir. » | visible tout de suite ; cases inchangées |
| Utilisateur → **Admin** | celle d'aujourd'hui | tout ouvert (les cases sont gardées, ignorées) |
| Admin → **Utilisateur** | celle d'aujourd'hui | les cases gardées reprennent effet (toutes cochées pour un compte qui n'en a jamais eu) |
| Invité → **Admin** | — | **impossible directement** : « Admin » est grisé pour un invité, avec « Pour en faire un Admin, faites-en d'abord un utilisateur. » ; le serveur refuse (400 nommé) |
| Admin → **Invité** | — | impossible directement de même (passer par Utilisateur ; question 13) |

## 7. Écrans

### 7.1 Administration › Comptes

Maquettes `admin-comptes-1` (téléphone), `pc-admin-comptes-1` (ordinateur).

- La liste garde sa forme ; la ligne dessous dit le **rôle** et l'état : « Admin · 2FA activée », « Utilisateur · 2FA désactivée », « Utilisateur · sans projets » (quand l'Admin a décoché quelque chose), « **Invité · Projets** » (ce qui est coché) ; une pastille **« Discret »** avec l'icône de l'œil barré (`#i-eye-off`) **et** le mot sur chaque invité (jamais l'icône seule).
- Ordre : Admin et Utilisateurs d'abord, puis les invités sous un titre « Invités » (on les retrouve d'un coup d'œil).
- Toucher un compte ouvre **sa page** (`#/administration/comptes/<id>`, au lieu de la feuille d'aujourd'hui, devenue trop longue) : en tête le nom, l'identifiant, la 2FA (et « Discret » pour un invité) ; **Rôle** (« Utilisateur | Invité | Admin », la phrase qui va avec dessous) ; **Accès** (cases de 4.1 ; « Un Admin a accès à tout. » pour un Admin) ; puis les actions d'aujourd'hui (mot de passe, double authentification, délier, désactiver, supprimer).
- Maquettes : `admin-compte-1` (Max, Invité : Projets seul coché, « Admin » grisé), `admin-compte-2` (Hugo, Utilisateur : tout coché, « Visible de toute la famille. Décochez ce qu'il ne doit pas utiliser. »).
- Sur ordinateur : la liste à gauche, la page du compte choisi à droite, dans la colonne de 1 040 px.
- Chaque changement est envoyé tout de suite (comme le rôle aujourd'hui), avec un message court (« Accès de Max enregistré ») ; un retrait ou un changement de rôle passe par une confirmation (4.7, 6.1).

### 7.2 Nouveau compte

Maquette `nouveau-compte-1` : feuille « Nouveau compte » : **le rôle d'abord** (« Utilisateur | Invité | Admin », Utilisateur par défaut ; Invité choisi dans la maquette) avec sa phrase, puis les **cases d'accès** cochées selon le rôle (Utilisateur : toutes ; Invité : Projets seul ; Admin : aucune case), puis identifiant, nom affiché, mot de passe provisoire ; « Créer le compte ».

### 7.3 Partager (Admin, famille)

- **Guillaume** partage « DomoPi Articles » (maquette `partage-admin-1`) : Max et Inès dans la liste, avec « Invité · discret » sous leur prénom ; l'avertissement de 5.3 sous la carte des personnes quand des proches et des invités se retrouvent ensemble.
- **Léa** partage sa liste « Courses » (maquette `partage-famille-1`) : Guillaume, Hugo, Zoé ; **ni Max ni Inès** : rien à l'écran ne laisse deviner qu'ils existent (pas de « 2 comptes masqués »).
- Un **Utilisateur sans accès aux listes** apparaît grisé dans le partage d'une liste, avec « N'utilise pas les listes » (pour l'Admin et pour la famille : ce n'est pas secret pour un compte visible).

## 8. Modèle de données

Mêmes conventions que l'existant (colonnes `<chose>_<état>` sur `users`, contraintes CHECK, valeurs de départ qui ne changent rien). Une migration par étape, à partir de **47**. **Pas de colonne `discreet`** : discret = `role = 'guest'`.

| Migration | Étape | Changement | Remarques |
| --- | --- | --- | --- |
| 47 | 1 | `users.role` accepte `'guest'` : CHECK (role IN ('admin', 'user', 'guest')) | la table users est **recréée** (8.1) ; aucun compte ne change de rôle |
| 48 | 2 | `users.notes_allowed`, `users.projects_allowed`, `users.projects_create`, `users.mcp_allowed` : INTEGER NOT NULL DEFAULT 1, CHECK (0, 1) | 1 partout : la famille garde tout ; pour un Admin, gardées et ignorées ; pour un nouvel invité, le serveur écrit 0 sauf `projects_allowed` |
| 49 | 3 | `users.lists_allowed` INTEGER NOT NULL DEFAULT 1, CHECK (0, 1) | 1 partout ; 0 pour un nouvel invité |

### 8.1 Ajouter « guest » au rôle : recréer la table des comptes

SQLite ne sait pas changer une contrainte CHECK : il faut **recréer `users`** (nouvelle table avec toutes ses colonnes actuelles, copie, suppression de l'ancienne, renommage), comme pour `aisles` (migration 35) ou `inbox` (migration 45). **Mais `users` est différente** : **43 tables** la référencent, presque toutes avec `ON DELETE CASCADE`. Or, avec les clés étrangères actives, `DROP TABLE users` fait d'abord un `DELETE FROM users` qui **déclenche les cascades** : listes, notes, projets, sessions… seraient effacés. La technique de la migration 35 (`defer_foreign_keys`) ne suffit pas : elle repousse la vérification, pas les cascades.

La migration 47 doit donc :

- s'exécuter **avec les clés étrangères coupées** (`PRAGMA foreign_keys = OFF`) ; ce réglage est sans effet dans une transaction, et `migrate()` met chaque migration dans une transaction : il faut une petite exception dans `migrate()` (une migration marquée « sans clés étrangères » : coupées avant la transaction, rallumées après), comme le recommande la documentation de SQLite (procédure en douze étapes) ;
- créer `users_new` avec **exactement** les colonnes, valeurs par défaut et contraintes d'aujourd'hui (la table a reçu une douzaine de colonnes au fil des migrations), copier toutes les lignes en gardant les numéros, supprimer `users`, renommer `users_new` en `users`, recréer ses index ;
- vérifier, **dans la transaction**, `PRAGMA foreign_key_check` (aucune ligne) et le nombre de comptes avant / après, sinon tout est annulé ;
- être testée sur une copie d'une vraie base (sauvegarde) : chaque table enfant garde toutes ses lignes ; schéma identique à part la contrainte du rôle.

Alternative, si le propriétaire préfère éviter toute recréation : garder `role` à deux valeurs en base et ajouter une colonne `guest` (0/1), le rôle « Invité » n'existant que dans l'API et les écrans. Plus simple à migrer, mais deux colonnes pour une seule idée (question 14). Recommandation : **recréer la table**, avec les précautions ci-dessus ; c'est une seule fois, et le modèle reste clair.

### 8.2 Le reste

- Noms de colonnes pris dans une **liste fixe** (comme `server/features.js`), jamais dans une requête.
- Règles partagées dans un nouveau fichier `public/js/access.js` (fonctions pures : rôles, accès effectif `allowed ∧ enabled`, cases de départ selon le rôle, au moins une fonction, changements de rôle permis), lu par le serveur (`server/access.js`) et les écrans, testé seul, comme `features.js`.
- `/api/me` et chaque synchronisation donnent à la personne **son** rôle et **son** accès (`access: { lists, notes, projects, createProjects, mcp }`) ; jamais ceux d'un autre.
- Tout ce qui teste aujourd'hui `role === 'user'` ou `['admin', 'user']` est revu (`admin-users.js` : création, modification, `losesAdmin` ; `oidc.js` : acceptation ; `admin.js` : choix du rôle ; `roleChip`) ; ce qui teste `role === 'admin'` reste juste (un invité n'est pas Admin).
- Aucune nouvelle table en première intention (l'option « Visible aussi par… », question 1, demanderait `user_visibility (user_id, viewer_id)`).

## 9. Matrice des droits

| Action | Admin | Utilisateur | Invité (« projets seulement » au départ) | Remarques |
| --- | --- | --- | --- | --- |
| Voir un invité dans son annuaire | oui | **non** | non (annuaire vide) | contextes partagés : 5.3 |
| Voir un Admin ou un Utilisateur dans son annuaire | oui | oui | **non** | |
| Ajouter un invité à une liste, une note, un projet | oui (selon l'accès de l'invité) | non : « compte inconnu » | non | |
| En faire le destinataire d'une liste d'envies | **non** (message nommé) | non : « compte inconnu » | — | 5.6 |
| Listes, Échéances, À offrir, mode scan | oui | si cochées (oui au départ) | si cochées (**non** au départ ; 403 nommé) | 4.4 |
| Notes | oui (sa Fonction) | si cochées (sa Fonction) | si cochées (non au départ) | |
| Projets partagés avec lui | oui (sa Fonction) | si cochés (sa Fonction) | si cochés (**oui** au départ) | rôles du projet inchangés |
| Créer, dupliquer un projet | oui | si cochée | si cochée (**non** au départ ; 403 nommé) | 4.5 |
| Assistants IA | oui | si cochés | si cochés (non au départ) | 4.6 |
| Régler rôle et accès d'un compte | oui (pas le sien) | non (404, route Admin) | non | |
| Voir les projets, listes, notes des autres | **non** (404, inchangé) | non | non | l'Admin n'a aucun droit sur le contenu |

- **404 ou 403** : un objet qu'on ne peut pas voir (liste, note, projet, compte d'un autre) répond **404** comme aujourd'hui ; une **fonction** que son propre compte n'a pas répond **403 nommé** (la personne sait déjà ce que son compte peut faire : rien n'est révélé) ; un compte qu'on ne voit pas répond **comme un compte inconnu** (400 `ops.utilisateurInconnu`).

## 10. Sécurité

- **Droits côté serveur, à chaque demande** : rôle et accès relus à chaque requête et à chaque opération (comme `projects_enabled` aujourd'hui), annuaire calculé pour celui qui demande, jamais gardé en cache entre deux comptes.
- **Un seul calcul de l'annuaire** (`directoryFor`) ; plus aucun `SELECT … FROM users WHERE active = 1` envoyé à un compte en dehors de lui (un test le cherche dans le code, comme les tests des réservations).
- **Rien qui fuit par les réponses** : réponses construites champ par champ ; plus d'identifiant de connexion hors Administration ; erreurs identiques pour un compte inconnu et un compte qu'on ne voit pas ; pas de nombre de comptes ailleurs que pour l'Admin (« 6 comptes » n'apparaît nulle part pour la famille) ; le rôle d'un autre compte n'est envoyé qu'à l'Admin.
- **Synchronisation, temps réel, MCP** : rien d'une fonction non autorisée (4.4) ; SSE inchangé (aucune donnée) mais plus envoyé pour les fonctions fermées ; MCP : contrôle de l'accès en premier, puis « Certaines listes », portée, rôle dans le projet.
- **Migration 47** : clés étrangères coupées le temps de la recréation, vérification avant validation (8.1) ; sauvegarde nocturne récente conseillée avant la mise à jour (le guide le dira).
- **Copie locale** : un téléphone qui avait reçu l'ancien annuaire complet le remplace à la synchronisation suivante (la nouvelle version du service worker force une synchronisation complète). À dire au propriétaire : **un compte créé avant cette version a pu recevoir l'annuaire complet**. Comme les invités n'existent pas encore, il suffit de créer Max et Inès **après** la mise à jour.
- **Journal de sécurité** (en anglais, sans contenu) : `admin_role_changed` (existe ; `role=guest` en plus), `admin_access_changed` (admin, user, et les valeurs : `lists=0 notes=0 projects=1 create=0 mcp=0`), `admin_account_created` (existe ; `role=guest` et l'accès), `oauth_revoked` (`reason=access`) ; un refus pour accès fermé n'est pas journalisé (pas d'attaque), un ajout refusé d'un compte non visible l'est avec les nombres seulement (`share_unknown_user`, qui, combien), pour repérer un essai de numéros.
- **Limites** : le partage garde ses plafonds ; aucune nouvelle route sans session.
- **Listes d'envies** : le test « identique avec ou sans réservation » doit rester vert ; un invité n'est jamais destinataire (5.6).
- **Ce que ce rôle n'est pas** : une barrière contre l'Admin (il voit tous les comptes, jamais leur contenu, comme aujourd'hui) ; une protection contre un membre qui recopie à la main ce qu'il voit dans un projet partagé.

## 11. Tests

Sur les points sensibles, à chaque étape, en plus des tests existants :

- **Migration 47** : sur une base remplie (comptes, listes, articles, notes, projets, cartes, sessions, connexions MCP, notifications), toutes les lignes de toutes les tables gardées, `foreign_key_check` vide, schéma de `users` identique à part la contrainte du rôle ; `'guest'` accepté, une autre valeur refusée ; une migration interrompue ne change rien.
- **« Annuaire identique avec ou sans invités »** (le cœur) : pour Léa (Utilisateur), on enregistre `GET /api/users`, la synchronisation complète (`users`, membres de ses listes, notes et projets), `GET /api/inbox`, ses Nouveautés, ses réponses MCP (`list_lists`, `read_list`, `list_notes`, `list_projects`, `read_project`) ; on crée Max et Inès invités, on partage avec eux un projet **dont Léa n'est pas membre**, ils y créent des cartes et des commentaires ; on recompare : **identique**, octet pour octet (hors heures de synchronisation). Même test après avoir fait passer Zoé d'Utilisateur à Invité : Zoé disparaît, rien d'autre ne change.
- **Annuaire de l'Admin** : contient les invités, avec leur rôle ; **annuaire d'un invité** : vide.
- **Ajout par numéro** : Léa ajoute Max (invité) par son numéro à une liste, une note, un projet : même statut et même corps de réponse qu'avec un numéro qui n'existe pas ; aucune écriture.
- **Destinataire d'envies** : `list.create` (file d'attente) et la conversion avec Max refusés, pour Léa comme pour l'Admin ; passer en Invité un destinataire refusé.
- **Changements de rôle** : chaque ligne de 6.1 (permis, refusés : Invité ↔ Admin directement, soi-même, dernier Admin), cases d'accès inchangées, journal.
- **Contexte partagé** : Hugo, membre de « DomoPi Articles » avec Max, voit Max dans les membres du projet et dans l'historique, **pas** dans son annuaire ; Max voit Guillaume et Hugo dans le projet, pas Léa nulle part.
- **Accès** : pour un compte sans Listes (Utilisateur et Invité), chaque route et chaque type d'opération des listes refusés (403), rien des listes dans la synchronisation (ni magasins, rayons, mémoire des articles), aucun événement temps réel, aucune notification ni rappel des listes, outils MCP des listes refusés ; mêmes tests pour Notes ; « Peut créer ses propres projets » (création, duplication, MCP) ; Assistants IA (autorisation refusée, connexions révoquées) ; un Admin a tout, quelles que soient ses cases gardées.
- **Règles** (`public/js/access.js`) : accès effectif `allowed ∧ enabled` (toutes les combinaisons), cases de départ par rôle, au moins une fonction, changements de rôle permis.
- **Rien d'effacé** : décocher puis recocher les Listes d'un compte qui en possède : tout revient.
- **Identifiant de connexion** : jamais dans une réponse à un autre compte que l'Admin.
- **Suppression d'un compte** : impossible s'il possède un projet ou a créé des cartes.
- **Écrans** : bandeau à trois boutons, Accueil sans tuiles des listes, menu de gauche réduit, Réglages réduits, page du compte (trois rôles) ; captures du téléphone avant / après pour un Utilisateur **identiques au pixel près** ; textes en français et en anglais.
- « Identique avec ou sans réservation » (envies) relancé.

## 12. Aide et documents

À chaque étape, pour ce qu'elle apporte, dans les deux langues :

- **Aide** : dans le chapitre « Comptes » (`public/js/help-content.js`, `public/js/help-en/comptes.js`), une section « Rôles des comptes : Admin, Utilisateur, Invité » (pour l'Admin : cases d'accès, invité toujours discret, ce qui reste visible dans un projet partagé, changer de rôle) ; dans « Rôles », une ligne par droit nouveau ; « Mon compte » : la ligne « Compte invité » ; numéros calculés. Anglais : « Admin », « User », « Guest » ; « Access » ; « Can create their own projects » ; « Discreet ».
- **Guide et site** : `node scripts/guide.js`, puis `node scripts/doc-links.js` ; dans le guide, « faire une sauvegarde avant la mise à jour » pour la migration 47.
- **README.md et README.fr.md** : une ligne dans la liste des fonctions.
- **Cahier des charges** : Comptes et rôles, Écrans (Administration), Modèle de données (migrations 47 à 49), Sécurité (annuaire, invités) ; `docs/exploitation.md` (migrations).
- **CLAUDE.md** : une entrée « Rôle Invité » (règle de l'annuaire, test « annuaire identique »).
- **Kit de design** : sections 16.48 à 16.50 (`design/listo.css` et la copie de `public/css/`), `design/components.html`.
- **Service worker** : version augmentée, nouveaux fichiers dans `APP_FILES`.
- **Annonce aux proches** : aucune nécessaire (rien ne change pour eux). Pour les invités, une phrase d'accueil que le propriétaire leur envoie lui-même.

## 13. Découpage en étapes

Chaque étape : un plan court, la construction, les tests, un résumé, puis **une PR `dev` → `main`** ; l'étape suivante commence après la fusion. Tailles indicatives (lignes de code et de tests, hors aide), à comparer aux étapes des projets (environ 3 000 à 6 000 lignes chacune).

1. **Rôle Invité et annuaire discret** (migration 47) — **moyenne** (environ 1 200 à 1 800 lignes, dont la moitié de tests ; un peu plus qu'avec l'interrupteur du premier cadrage, à cause de la recréation de la table des comptes, 8.1) : rôle `'guest'` (migration, serveur, choix du rôle à trois valeurs dans la page du compte et « Nouveau compte », changements de rôle de 6.1, pastilles « Invité » et « Discret »), `directoryFor` à la place de `activeUsers` (synchronisation, `GET /api/users`), contrôles des ajouts (listes, notes, projets) et du destinataire d'envies, invité déjà membre affiché correctement dans le partage, avertissement de 5.3, journal ; et les deux constats : **plus d'identifiant de connexion envoyé**, **`accountUsed` compte les projets**. **Utile seule** : avec elle, Max peut déjà avoir un compte invisible, avec tout Listo mais personne à qui partager (les cases arrivent à l'étape 2).
2. **Cases d'accès : Notes, Projets, création de projets, Assistants IA** (migration 48) — **moyenne** (environ 1 500 à 2 200 lignes) : `access.js`, accès effectif branché sur la mécanique des Fonctions (déjà là pour Notes et Projets), cases dans la page du compte et dans « Nouveau compte » (départ selon le rôle), « Peut créer ses propres projets », Assistants IA (autorisation, révocation), Fonctions réduites, Mon compte. À la fin de cette étape, un invité a encore les Listes (vides : on ne peut rien lui partager ; il pourrait créer les siennes et recevrait la mémoire des articles).
3. **Accès aux Listes** (migration 49) — **grande** (environ 3 000 à 4 500 lignes) : tout 4.4 côté serveur (synchronisation, file d'attente, routes, notifications, rappels, résumé du matin, temps réel, MCP), et côté téléphone et ordinateur l'absence des Listes (bandeau à trois boutons, Accueil, menu de gauche, Échéances, « À offrir », Corbeille, catégories de notifications, recherche, raccourcis) ; invité « projets seulement » complet. Captures avant / après pour un Utilisateur.

L'aide, le guide, le site et le cahier des charges suivent à chaque étape (12).

## 14. Risques

| Risque | Probabilité | Gravité | Ce qui le réduit |
| --- | --- | --- | --- |
| Un nom qui fuit par un chemin oublié (nouvel écran, nouvel outil MCP) | moyenne | moyenne (un prénom) | une seule fonction d'annuaire ; test « annuaire identique » qui compare **toutes** les réponses d'un proche ; une règle dans CLAUDE.md pour les écrans à venir |
| **Migration 47 qui efface des données** par les cascades de `DROP TABLE users` | faible si la procédure de 8.1 est suivie | **très forte** | clés étrangères coupées, `foreign_key_check` et comptage avant validation, test sur une base remplie et sur une copie d'une vraie sauvegarde ; sauvegarde conseillée avant la mise à jour |
| Un numéro de compte deviné pour partager avec un invité | faible | faible | contrôle par `directoryFor` à chaque ajout, réponse identique à « inconnu » |
| Le propriétaire croit Max invisible de Hugo alors qu'ils partagent un projet | moyenne | faible | avertissement dans « Partager », phrase sous le rôle, section d'aide |
| « Pas de listes » oublié quelque part (une route, une notification) | moyenne | faible (Max verrait une liste… qu'on ne peut pas lui partager) | un contrôle par routeur, un dans l'aiguillage des opérations ; tests route par route |
| Régression pour la famille | faible | forte | valeurs de départ qui ne changent rien ; captures avant / après au pixel près ; tests existants |
| Complexité ajoutée à un code déjà large (lists.js : 2 000 lignes) | certaine | moyenne | règles dans `access.js` testé seul ; un rôle de plus plutôt que deux réglages ; réutilisation de la mécanique des Fonctions |
| Ancien annuaire complet resté sur un téléphone | faible | faible | remplacé à la synchronisation ; créer les invités après la mise à jour |

## 15. Autres solutions étudiées

| Solution | Pour | Contre | Avis |
| --- | --- | --- | --- |
| **Ce cadrage** : rôle Invité (toujours discret) et cases d'accès | tout au même endroit ; un seul choix (le rôle) donne la visibilité ; la famille ne voit rien changer ; réutilise Fonctions, partage, rôles des projets | trois PR, dont une grande ; une migration délicate (8.1) | **retenue** (décision du 25 novembre 2026) |
| **Préréglages + interrupteur « Compte discret »** (premier cadrage) | un invité visible était possible | un réglage de plus, et un sélecteur qui ne sert qu'à la création | remplacé par le rôle (décision du 25 novembre 2026) |
| **Une deuxième installation de Listo** (« DomoPi », autre adresse, autre conteneur) | isolation totale, **zéro ligne de code**, possible dès aujourd'hui ; aucun risque pour la famille | deux comptes et deux applications pour Guillaume ; DomoPi absent de son Accueil et de ses Échéances ; sauvegardes, mises à jour et secrets en double ; projets à déplacer (l'assistant IA peut le faire) | **bonne solution de secours**, ou d'attente pendant la construction |
| **Groupes du fournisseur d'identité** (Authelia, Pocket ID : groupe « listo-invites » → rôle Invité) | gestion centrale pour qui a un fournisseur | seulement avec LISTO_OIDC=on ; lecture d'une nouvelle donnée du jeton ; deux endroits pour la même décision | **plus tard**, en plus : proposer le rôle à l'acceptation d'une demande de compte selon son groupe |
| **Discret par projet** (« ce projet est à part ») au lieu de par compte | un seul réglage sur le projet | la demande porte sur les **personnes** (« que leurs noms ne soient pas vus ») : un compte serait visible par un autre chemin (son annuaire, une liste) | non |
| **Plus d'annuaire du tout** (on partage en tapant un identifiant) | aucun nom ne circule | change les habitudes de toute la famille ; l'identifiant de connexion deviendrait connu de tous | non |
| **Colonne `guest` au lieu d'une troisième valeur du rôle** | migration simple (ajout de colonne) | deux colonnes pour une seule idée ; chaque test du rôle doit regarder les deux | possible (question 14) ; non recommandé |

## 16. Maquettes

Dans [`design/comptes/`](../design/comptes/README.md), en clair et en sombre (téléphone 390 px, ordinateur 1 440 px). Prénoms d'exemple : Guillaume (Admin), Léa, Zoé, Hugo (Utilisateurs) ; Max et Inès (Invités, ils aident pour DomoPi).

| Fichier | Écran |
| --- | --- |
| admin-comptes-1 | Administration › Comptes : Admin et Utilisateurs (« Utilisateur · sans projets » pour Zoé), puis « Invités » (Max, Inès : « Invité · Projets ») avec la pastille « Discret » |
| admin-compte-1 | Page du compte de Max : rôle « Utilisateur \| Invité \| Admin » (Invité ; Admin grisé), la phrase « Un invité est toujours discret… », Accès (Projets seul coché) |
| admin-compte-2 | Page du compte de Hugo : rôle Utilisateur, toutes les cases cochées, Sécurité |
| nouveau-compte-1 | « Nouveau compte » : le rôle (Invité choisi), les cases de départ (Projets seul), identifiant, nom |
| invite-accueil-1 | Accueil de Max : tuiles Projets et Compte, chacune sur toute la largeur |
| invite-projets-1 | Projets de Max : seulement « DomoPi Articles », sans « + » ; bandeau à trois boutons |
| invite-reglages-1 | Réglages de Max : réduits (ni Fonctions, ni Administration) ; pastille et encadré « Compte invité » |
| partage-admin-1 | Guillaume partage « DomoPi Articles » : Max et Inès (« Invité · discret »), l'avertissement « Hugo verra Max et Inès… » |
| partage-famille-1 | Léa partage sa liste « Courses » : Guillaume, Hugo, Zoé ; ni Max ni Inès |
| pc-invite-1 | Max sur ordinateur : menu de gauche réduit (Accueil, Projets, ses projets), « DomoPi Articles » ouvert en Contributeur |
| pc-admin-comptes-1 | Administration › Comptes sur ordinateur : la liste à gauche, la page de Max à droite (rôle, accès ; sécurité) |

Les nouveaux composants sont dans `design/comptes/listo-comptes.css` (sections 16.48 à 16.50, variables du kit seulement). Aucune nouvelle icône (`#i-eye-off`, `#i-user`, `#i-users`, `#i-shield` existent).

## 17. Questions au propriétaire

Réponses du 25 novembre 2026 : l'ancienne question « un seul interrupteur « Compte discret » pour les deux sens ? » est **répondue : c'est le rôle Invité**, toujours discret dans les deux sens ; l'ancienne question des préréglages (« Famille » et « Invité ») est **répondue : c'est le rôle** qui donne les cases de départ. Restent, chacune avec une réponse recommandée (« d'accord avec tout » suffit pour lancer l'étape 1) :

1. **Qui voit un invité dans son annuaire ?** Seulement l'Admin, ou aussi des personnes choisies (« Visible aussi par : Hugo ») pour qu'un proche puisse lui partager son propre projet ? — *Recommandé : seulement l'Admin pour commencer ; « Visible aussi par… » plus tard si le besoin vient (une petite table, une ligne dans la page du compte).*
2. **Dans un projet partagé, les membres se voient** (Hugo voit Max dans « DomoPi Articles », et inversement), avec un avertissement dans « Partager » ? — *Recommandé : oui (option A de 5.3) ; pour un projet vraiment à part, ne pas y mettre de proche.*
3. **Un invité peut-il partager ses propres choses ?** Son annuaire est vide : il ne peut ajouter personne. — *Recommandé : non, c'est l'Admin qui partage avec lui.*
4. **Invité « projets seulement » : l'écran Échéances ?** Sans (trois boutons : Accueil, Projets, Réglages ; les cartes urgentes sont dans la tuile Projets) ou avec, pour les seules cartes datées (quatre boutons) ? — *Recommandé : sans.*
5. **Cases de départ d'un nouvel invité** : Projets seul, sans création de projet ni assistant IA ? — *Recommandé : oui (« accès uniquement au projet en question ») ; l'Admin coche le reste au besoin.*
6. **Notes cochées pour un invité : les étiquettes communes** (il verrait « Anniversaire Zoé » et la famille verrait les siennes) ? — *Recommandé : l'accepter et le dire sous la case (pas de nom de personne).*
7. **Listes cochées pour un invité : la mémoire commune des articles** ? — *Recommandé : de même, l'accepter et le dire ; un filtrage par compte est possible plus tard (coût moyen).*
8. **Ancien membre invité** : quand Max quitte un projet, ses commentaires et l'historique gardent « Max » pour les autres membres ? — *Recommandé : oui (on doit savoir qui a écrit) ; un compte supprimé reste « Un ancien compte ».*
9. **Aide** : la même pour tout le monde (avec des chapitres sur les listes qu'un invité n'utilise pas), ou cacher les chapitres des fonctions fermées ? — *Recommandé : la même (elle est aussi publiée sur le site) ; l'Accueil et les menus suffisent à guider un invité.*
10. **Nom affiché** : choisi par l'Admin, prénom seul ? — *Recommandé : oui.*
11. **Identifiant de connexion** et **suppression d'un compte** : corriger les deux constats (3.3) dès l'étape 1 ? — *Recommandé : oui.*
12. **Utilisateur → Invité : les cases d'accès** restent telles quelles (l'Admin décoche ensuite), ou reviennent à « Projets seul » ? — *Recommandé : telles quelles, montrées dans la confirmation (rien n'est retiré en silence).*
13. **Admin → Invité directement** : interdit comme Invité → Admin (passer par Utilisateur) ? — *Recommandé : oui, interdit dans les deux sens (moins de cas, et un Admin qui devient invité est rare).*
14. **Migration du rôle** : recréer la table des comptes pour ajouter « guest » (8.1), ou une colonne `guest` à côté du rôle ? — *Recommandé : recréer la table, avec les précautions de 8.1.*
15. **Ordre** : commencer par l'étape 1 seule, essayer avec Max et Inès, puis les étapes 2 et 3 ? Ou, en attendant, une seconde installation pour DomoPi ? — *Recommandé : étape 1, puis 2 et 3 ; la seconde installation seulement si c'est urgent.*

## 18. Décisions du propriétaire (25 novembre 2026)

Après le premier cadrage (qui proposait des préréglages « Famille » et « Invité » et un interrupteur « Compte discret »), le propriétaire a décidé :

1. **Pas de sélecteur de préréglage** : c'est le **rôle** qui donne le réglage (6).
2. **Trois rôles** : **Admin** (tous les droits, rien à régler) ; **Utilisateur** (la famille : accès possible à tout, l'Admin peut choisir les fonctions auxquelles il a accès) ; **Invité** (l'Admin choisit ce qu'il peut voir et utiliser : Listes, Notes, Projets, création de projets ou non, Assistants IA) (4.1).
3. **Un invité est automatiquement discret**, dans les deux sens, sans interrupteur (5.1).

Ce qui en découle dans ce cadrage : `users.role` reçoit la valeur `'guest'` (migration 47, recréation de la table, 8.1) et il n'y a pas de colonne `discreet` ; les cases d'accès sont les mêmes pour Utilisateur (toutes cochées au départ) et Invité (Projets seul au départ, recommandé) ; un invité ne devient pas Admin directement (6.1) ; les étapes deviennent : 1. rôle Invité et annuaire discret, avec les deux constats ; 2. cases Notes, Projets, création de projets, Assistants IA ; 3. accès aux Listes (13).
