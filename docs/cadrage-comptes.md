# Listo : comptes « invités », accès et comptes discrets (cadrage, sans code)

Document de conception rédigé le 25 novembre 2026, à partir de la demande du propriétaire du même jour ; **mis à jour le même jour avec ses décisions** (section 18 : le rôle remplace les préréglages et l'interrupteur « Compte discret » ; la case de l'Admin **autorise** une fonction, la personne l'**active** elle-même), puis avec ses **décisions finales** (section 19, qui l'emportent sur le reste du document : seul l'Admin voit les invités, pas d'avertissement dans « Partager », un invité ne partage jamais ce qu'il possède, rien de coché pour un nouvel invité et une fonction cochée pour un invité s'active aussitôt, règle de l'écran Échéances pour un invité, toutes les questions de la section 17 répondues, une seule PR à la fin des trois étapes). Il ne contient aucun code : il a servi à **décider s'il fallait le faire, et comment**, puis à construire (étape 1 construite le 25 novembre 2026, section 19.3). Les maquettes sont dans [design/comptes/](../design/comptes/README.md). Une fois construit, chaque point rejoint le texte du [cahier des charges](cahier-des-charges.md) (Comptes et rôles, Écrans, Modèle de données, Sécurité), comme pour le [cadrage des projets](cadrage-projets.md).

**La demande du propriétaire (25 novembre 2026)**

> « J'ai intégré dans Listo la gestion projet que je faisais avant dans Planka, j'aimerais donc créer des comptes pour mes camarades qui m'aident dans la gestion de DomoPi et je leur donnerais accès uniquement au projet en question. Par contre, je n'ai pas envie que leurs noms soient vus des autres utilisateurs, ni que eux puissent voir les autres utilisateurs. Serait-il possible que je puisse gérer des permissions utilisateurs plus fines, par exemple pour ne laisser à un copain l'accès uniquement aux projets, et une option pour moi aussi dans la gestion de son compte pour que son compte soit invisible des autres (et vice-versa). Discussion, propose-moi un plan de faisabilité et maquette. »

**Ses décisions, après le premier cadrage (25 novembre 2026)**

> « Je ne veux pas forcément de sélecteur préréglage ; on peut se dire que c'est le rôle qui donne ce préréglage en auto. Admin tous les droits ; utilisateur, la famille, accès possible à tout, je peux sélectionner aussi les fonctions auxquelles il a accès ; invité, l'admin sélectionne ce que le user aura droit de voir et utiliser comme fonction (liste, notes, projets et création projets ou non, assistant IA). Un rôle invité est automatiquement en discret, pareil on s'évite un réglage supplémentaire. »

> « Cocher une fonction pour un user avec rôle utilisateur ne lui active pas forcément la fonction, après il a le choix de l'activer ou non (sauf liste toujours dispo). » Et pour un invité : de même.

**Réponse courte**

- **C'est faisable**, sans nouvelle dépendance, en **trois étapes**, dont la plus grosse est la dernière (« pas de listes », pour les invités) ; **une seule PR**, à la fin des trois étapes (décision finale, section 19).
- **Trois rôles** : **Admin** (tout, rien à régler), **Utilisateur** (la famille, comme aujourd'hui : les **Listes toujours là**, les autres fonctions autorisées au départ, l'Admin peut en retirer) et **Invité** (nouveau : l'Admin coche ce qu'il **peut** utiliser ; **rien de coché à la création**). **Un invité est toujours discret**, par son rôle, sans autre réglage : **seuls les Admin** le voient dans leur liste de personnes, et lui ne voit personne (section 19).
- **La case de l'Admin autorise, la personne active** (Utilisateur) : une fonction cochée apparaît dans Réglages › Fonctions de la personne, qui l'active ou non (Notes activées au départ, Projets désactivés, comme aujourd'hui) ; une fonction décochée disparaît de sa page Fonctions et le serveur la refuse. **Pour un invité** (décision finale, section 19) : quand l'Admin coche Listes, Notes ou Projets, la fonction **s'active aussitôt** pour lui ; il peut l'désactiver lui-même ensuite dans ses Fonctions. « Peut créer ses propres projets » et « Assistants IA » sont des permissions, sans interrupteur.
- **Une limite à dire clairement** : « discret » cache un compte **de l'annuaire** (les listes de personnes où l'on choisit avec qui partager, ou pour qui est une liste d'envies). Il ne peut pas le cacher **à l'intérieur d'une chose partagée** : si Hugo est membre de « DomoPi Articles » avec Max, Hugo voit Max dans ce projet (personnes, cartes attribuées, commentaires, historique), et Max voit Hugo. Sans cela, on ne pourrait ni attribuer une carte ni savoir qui a écrit un commentaire. C'est normal : **pas d'avertissement** dans « Partager » (décision finale, section 19).
- **Le risque principal** : un nom qui fuit par un chemin oublié. L'inventaire de la section 3 en compte **une trentaine** ; la plupart sont déjà sûrs (ils ne montrent que les membres d'une chose partagée). Le vrai travail est concentré en **un seul endroit**, l'annuaire (aujourd'hui `activeUsers()`, envoyé tel quel à tous les comptes), plus quatre contrôles du serveur (partage, destinataire d'envies), et protégé par un test « annuaire identique avec ou sans invités », comme le test des réservations.
- **En base** : recommandé, une **colonne `users.guest`** (0 ou 1) à côté du rôle, ajoutée sans recréer la table des comptes, avec une contrainte qui interdit « invité et Admin » ; le rôle « Invité » est calculé à partir d'elle pour l'API et les écrans (8.1). L'autre voie (une troisième valeur `'guest'` dans `users.role`) oblige à recréer la table des comptes, que 43 tables référencent : risquée.
- **Recommandation** : le faire dans Listo (sections 13 et 15), en commençant par l'étape 1 (rôle Invité et annuaire), utile seule ; l'alternative « une deuxième installation de Listo pour DomoPi » est sûre et gratuite tout de suite, mais double tout (comptes, applications, sauvegardes) et sépare DomoPi du reste de la journée du propriétaire.

Deux constats faits en passant, corrigés à l'étape 1 (3.3) : **l'identifiant de connexion de chaque compte est envoyé à tous les comptes** (inutile à l'écran, et utile à qui voudrait deviner un mot de passe), et **un compte qui n'a servi qu'aux projets peut être supprimé par l'Admin**, ce qui effacerait ses projets avec lui.

## Sommaire

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Vocabulaire](#2-vocabulaire)
3. [Inventaire : où un compte en voit un autre](#3-inventaire--où-un-compte-en-voit-un-autre)
4. [Fonctions autorisées par l'Admin, activées par la personne](#4-fonctions-autorisées-par-ladmin-activées-par-la-personne)
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
19. [Décisions finales du propriétaire (25 novembre 2026)](#19-décisions-finales-du-propriétaire-25-novembre-2026)

## 1. Contexte et objectifs

Listo sert à une famille de six ou sept personnes ; le propriétaire (Guillaume) est l'Admin. Depuis le 25 novembre 2026, les **projets** ont remplacé Planka pour son blog DomoPi (« DomoPi Articles », « DomoPi Liens Tech », « DomoPi Test produits »). Deux ou trois personnes l'aident (dans les maquettes : **Max** et **Inès**). Aujourd'hui, pour les faire entrer dans ces projets, il faudrait leur créer un compte ordinaire, et :

- leurs noms apparaîtraient à **toute la famille** (choix des personnes dans « Partager », « Pour qui ? » d'une liste d'envies), et **toute la famille** leur apparaîtrait ;
- ils auraient **tout Listo** : listes (avec la mémoire commune des articles déjà saisis par la famille), notes (avec les étiquettes communes du foyer), « À offrir », Échéances…

Buts :

- l'Admin donne à chaque compte un **rôle** (Admin, Utilisateur, Invité) et, pour un Utilisateur ou un Invité, choisit **les fonctions autorisées** ; la personne active ensuite celles qu'elle veut, comme aujourd'hui dans Réglages › Fonctions ;
- un **Invité** ne peut utiliser **que ce que l'Admin a autorisé** (au départ : les projets qu'on lui partage), et ne voit **personne d'autre que les membres de ce qu'on lui partage** ;
- **rien ne change pour la famille** : un compte ordinaire reste ce qu'il est (Utilisateur, tout autorisé, ses Fonctions inchangées) ; la famille ne voit simplement pas les invités ;
- les contrôles sont faits **par le serveur**, à chaque demande ; le téléphone ne fait que cacher les boutons.

Hors périmètre : des groupes ou des équipes, des droits par liste différents de ceux d'aujourd'hui, un rôle « Admin délégué », l'inscription libre, les invitations par e-mail, un lien public des projets (toujours non).

## 2. Vocabulaire

| Mot | Sens dans ce document |
| --- | --- |
| **Rôle** | Admin, Utilisateur ou **Invité** (nouveau). En base (recommandé, 8.1) : `users.role` reste `'admin'` ou `'user'`, et `users.guest` = 1 pour un invité ; l'API et les écrans parlent d'un seul rôle, `'admin'`, `'user'` ou `'guest'` |
| **Annuaire** | la liste des comptes qu'un compte peut **choisir** : personnes proposées dans « Partager » (listes, notes, projets) et « Pour qui ? » d'une liste d'envies. Aujourd'hui : tous les comptes actifs (`activeUsers()`, `server/lists.js`), envoyés à chaque synchronisation (`users`) et par `GET /api/users` |
| **Contexte partagé** | une liste, une note ou un projet dont deux comptes sont membres. Dans ce contexte, chacun voit le prénom de l'autre : « Personnes », tâches et cartes attribuées, commentaires, historique, Nouveautés (« Léa a ajouté… »), notifications, réservations d'une liste d'envies |
| **Fonction autorisée** | cochée par l'**Admin** dans la page du compte (nouveau) : la personne **peut** l'utiliser |
| **Fonction activée** | choisie par la **personne** dans Réglages › Fonctions (existe : Notes, Projets) |
| **Fonction utilisée** | autorisée **et** activée (`allowed ∧ enabled`) : c'est ce que le serveur vérifie |
| **Discret** | absent de l'annuaire des autres (sauf de celui des Admin), avec un annuaire vide : c'est **toujours** le cas d'un Invité, et seulement de lui (pas de réglage à part) |
| **Invité** et **Visiteur** | à ne pas confondre : un **Invité** a un compte Listo (rôle) ; un **visiteur** ouvre un lien public, sans compte (existe) |

## 3. Inventaire : où un compte en voit un autre

Relevé dans le code du 25 novembre 2026 (branche `dev`). Pour chaque endroit : ce qu'il montre aujourd'hui, ce qui change pour un **Invité** (toujours discret), et pour un compte **sans Listes** (seul un invité peut l'être : un Utilisateur a toujours les Listes).

### 3.1 L'annuaire (le seul vrai problème)

| # | Endroit | Fichiers | Aujourd'hui | Invité (discret) | Sans Listes (invité) |
| --- | --- | --- | --- | --- | --- |
| 1 | Synchronisation : `users` | `server/lists.js` (`changesSince`, `activeUsers`) | **tous les comptes actifs**, avec identifiant de connexion (`username`), id et nom affiché, à chaque appareil | absent de l'annuaire des autres (sauf l'Admin) ; son propre annuaire est vide | inchangé (l'annuaire sert aussi aux notes et aux projets) |
| 2 | `GET /api/users` | `server/routes/lists.js` | idem | idem (même fonction) | idem |
| 3 | Copie locale du téléphone | `public/js/store.js` (`state.users`, IndexedDB) | idem, gardée hors ligne | ne reçoit plus que l'annuaire filtré ; l'ancienne copie est **remplacée** à la synchronisation suivante (l'arrivée du nouveau code vide l'ancienne : version du service worker) | — |
| 4 | Feuille « Partager avec des personnes » (listes, notes) et « Partager » (projets) | `public/js/screens/share-picker.js`, `share-panel.js`, `public/js/sharing.js` | annuaire + membres actuels ; un membre absent de l'annuaire est affiché « Compte désactivé » | absent pour la famille ; pour l'Admin, présent avec « Invité · discret » ; un invité **déjà membre** reste affiché à son propriétaire (contexte partagé), **sans** la mention « Compte désactivé » (le serveur donne `active` dans les membres) | dans le partage d'une liste, l'Admin le voit grisé : « N'utilise pas les listes » |
| 5 | « Pour qui ? » d'une liste d'envies (création, conversion) | `public/js/screens/list-form.js`, `store.js` (création hors ligne), `server/lists.js` (`list.create`, `convertToWishes`) | annuaire | **jamais destinataire**, pour personne (Admin compris) ; refus du serveur identique à « compte inconnu » pour la famille | — |
| 6 | Ajout d'un membre par son numéro (`PUT …/members`) | `server/lists.js`, `server/notes.js`, `server/projects.js` (`setMembers`) | tout compte actif est accepté | refusé si l'auteur ne le voit pas dans **son** annuaire, avec **la même réponse qu'un numéro inconnu** (400 `ops.utilisateurInconnu`) ; les numéros de compte se suivent (1, 2, 3…) : ce contrôle est indispensable | ajout à une **liste** par l'Admin refusé (400 nommé « Max n'utilise pas les listes. ») ; notes et projets selon ses fonctions autorisées |

### 3.2 Les contextes partagés (déjà sûrs : seulement les membres)

| # | Endroit | Fichiers | Ce qui est montré | Changement |
| --- | --- | --- | --- | --- |
| 7 | « Personnes » d'une liste | `server/lists.js` (`describeList`, `members`) | membres : id, **identifiant de connexion**, nom, droit | retirer `username` (3.3) ; sinon rien |
| 8 | « Personnes » d'une note | `server/notes.js` (`membersOf`) | membres : id, nom, droit | rien |
| 9 | « Personnes » d'un projet, filtre « Personnes », pastilles des cartes | `server/projects.js` (`membersOf`), `project-view.js` | membres et rôles | rien |
| 10 | Tâches attribuées (une, plusieurs, chacun son tour) | `server/lists.js`, `public/js/assign.js` | membres « Peut modifier » | rien |
| 11 | Cartes attribuées, « créée par » | `server/projects.js` | membres du projet | rien |
| 12 | Commentaires des cartes, commentaires importés | `server/projects.js`, `card-activity.js` | auteur (nom relu à l'affichage) | rien (le nom d'un ancien membre reste lisible : question 7) |
| 13 | Historique des cartes | `server/projects.js` (`cardHistory`, `allNames`) | noms relus à l'affichage, par id | rien ; un compte supprimé reste « Un ancien compte » |
| 14 | Nouveautés des listes (« Léa a ajouté… ») | `server/news.js` | auteur, ou « Un ancien membre » | rien |
| 15 | Page Notifications et notifications push | `server/inbox.js`, `server/notify.js` | prénom de l'auteur (« Guillaume a partagé… », « Léa vous a attribué… ») ; jamais à quelqu'un d'extérieur | rien ; une fonction **non autorisée** : rien n'est remis ; **autorisée mais désactivée** : comme une fonction désactivée aujourd'hui (seul « Partage » est remis, avec « Activez … dans Réglages › Fonctions ») |
| 16 | Réservations d'une liste d'envies (participants) | `server/reservations.js` | prénoms des membres qui réservent, aux autres membres (jamais au destinataire) | rien ; un compte sans Listes n'est jamais membre d'une liste |
| 17 | « À offrir » | `public/js/gifts.js`, `server/reservations.js` | mes réservations seulement | absent sans Listes |
| 18 | Écran Échéances (« à Léa ») | `public/js/screens/deadlines.js` | personnes attribuées des tâches de mes listes | absent sans Listes (4.3) |
| 19 | Assistants IA (MCP) : listes | `server/mcp-tools.js` (`people`, `you`, `assigned_to`) | membres des listes de la connexion | outils des listes **refusés** sans Listes (4.7) |
| 20 | Assistants IA : notes | `server/mcp-notes.js` (`owner`, `updated_by`) | propriétaire, dernier auteur | refusés sans Notes (déjà le cas quand elles sont désactivées) |
| 21 | Assistants IA : projets | `server/mcp-projects.js` (`members`, `assignees`, auteurs) | membres du projet | rien ; `assignees` par nom ne cherche que parmi les membres (déjà le cas) |
| 22 | Temps réel (SSE) | `server/events.js` | aucun nom, aucune donnée | ne plus envoyer `event: list` à un compte sans Listes ; `event: refs` (magasins, rayons) non plus |
| 23 | Page publique d'une liste ou d'une note | `server/routes/public.js` | prénom du destinataire d'une liste d'envies seulement | rien (un invité n'est jamais destinataire) |

### 3.3 Ailleurs

| # | Endroit | Fichiers | Aujourd'hui | Changement |
| --- | --- | --- | --- | --- |
| 24 | **Identifiant de connexion envoyé à tous** | `activeUsers()`, `describeList()` (`username`) | chaque compte reçoit l'identifiant de connexion de tous les autres ; le téléphone ne l'affiche nulle part (il ne sert qu'à « Mon compte » pour soi-même) | **ne plus l'envoyer** (sauf à l'Admin, dans Administration) : étape 1 |
| 25 | Administration › Comptes | `server/routes/admin-users.js`, `public/js/screens/admin.js` | Admin seulement : tous les comptes ; rôle à deux valeurs | rôle à trois valeurs, fonctions autorisées (7.1) ; l'Admin voit toujours tout |
| 26 | Suppression d'un compte « jamais utilisé » | `admin-users.js` (`accountUsed`) | ne compte ni les projets, ni les cartes, ni les commentaires | **à corriger à l'étape 1** : un invité qui possède un projet serait « jamais utilisé » ; le supprimer effacerait ses projets (`projects.owner_id … ON DELETE CASCADE`) |
| 27 | Demandes de compte (fournisseur d'identité, LISTO_OIDC=on) | `server/oidc.js`, Administration | Admin seulement ; rôle Utilisateur ou Admin | « Accepter » propose aussi Invité (Utilisateur par défaut), avec ses fonctions autorisées |
| 28 | Écran de connexion, « Mot de passe oublié » | `login.js`, `server/routes/auth.js` | aucun nom ; réponse identique pour un identifiant inconnu | rien |
| 29 | Étiquettes des notes (réserve commune) | `server/labels.js` | les noms des étiquettes de tout le foyer, sans auteur | aucun nom de personne ; mais un **contenu commun** (« Anniversaire Zoé ») : voir 5.9 et question 5 |
| 30 | Mémoire des articles (« Souvent ajoutés », suggestions) | `server/lists.js` (`item_history`, synchronisation `history`) | **commune à tout le foyer**, envoyée à chaque compte | non envoyée sans Listes ; pour un invité avec Listes, voir 5.9 et question 6 |
| 31 | Magasins, rayons, produits connus (codes-barres) | `references.js`, `products.js` | communs, sans nom de personne | non envoyés sans Listes |
| 32 | Journal de sécurité | `server/audit.js` | identifiants, en anglais, lu par l'Admin seulement | nouvelles lignes (10) |
| 33 | « Mon compte », Réglages | `account.js`, `settings.js` (`roleChip`) | soi-même ; pastille « Admin » ou « Utilisateur » | pastille « Invité » ; une ligne « Compte invité : votre accès est réglé par l'Admin… » |
| 34 | Aide | `public/js/help-content.js` | la même pour tous | une section « Rôles des comptes : Admin, Utilisateur, Invité » (12) ; rien de caché |

Bilan : **un seul endroit envoie des noms hors des contextes partagés, l'annuaire (1 à 3)**, plus quatre contrôles du serveur qui l'utilisent sans le dire (5, 6). Tout le reste ne montre que des membres d'une chose partagée.

## 4. Fonctions autorisées par l'Admin, activées par la personne

### 4.1 La règle

Décision du propriétaire du 25 novembre 2026 : **la case de l'Admin autorise, la personne active.** Une fonction est **utilisée** si elle est **autorisée** (case de l'Admin, dans la page du compte) **ET activée** (interrupteur de la personne, dans Réglages › Fonctions, comme aujourd'hui). Une seule règle pour tous, avec deux exceptions fixes : un **Admin** a tout autorisé ; un **Utilisateur** a **toujours les Listes** (ni case, ni interrupteur, comme aujourd'hui).

| Fonction | Admin | Utilisateur | Invité |
| --- | --- | --- | --- |
| **Listes** (courses, tâches, envies, Échéances, « À offrir », mode scan, mémoire des articles) | toujours | **toujours** : pas de case, pas d'interrupteur (comme aujourd'hui) | case de l'Admin (**non** au départ) ; cochée : **activée aussitôt**, il peut l'désactiver (décision finale, section 19) |
| **Notes** | autorisées ; il les active ou non (activées au départ) | case de l'Admin (oui au départ) ; il les active ou non (activées au départ, comme aujourd'hui) | case (non au départ) ; cochée : activées aussitôt, il peut les désactiver |
| **Projets** | autorisés ; il les active ou non (désactivés au départ) | case (oui au départ) ; il les active ou non (désactivés au départ, comme aujourd'hui) | case (**non** au départ (décision finale, section 19)) ; cochée : **activés aussitôt**, il peut les désactiver |
| **Peut créer ses propres projets** (sous « Projets ») | oui | case (oui au départ) | case (non au départ) |
| **Assistants IA** (si LISTO_MCP=on) | oui | case (oui au départ) | case (non au départ) |

- **Peut créer ses propres projets** et **Assistants IA** sont des **permissions**, pas des fonctions à activer : pas d'interrupteur dans Réglages › Fonctions. La personne s'en sert, ou non (« Nouveau projet » ; « Autoriser un assistant IA » dans Mon compte, qu'elle décide elle-même).
- **Pour un invité, rien n'est coché à la création** (décision finale, section 19) : l'Admin coche ce qu'il ouvre ; une fonction (Listes, Notes, Projets) cochée pour un invité **s'active aussitôt** pour lui (`*_enabled` = 1), il peut l'désactiver lui-même ensuite dans ses Fonctions. (Premier cadrage : tout désactivé au départ, l'invité activait lui-même ; remplacé par la décision finale.)
- Rien n'est coché à la création d'un invité (section 19) : tant que l'Admin n'a rien coché, il ne voit que l'Accueil (l'invitation et la tuile Compte) et ses Réglages. « Peut créer ses propres projets » n'a de sens qu'avec « Projets » (case grisée sinon).
- Hors ligne : non (Administration demande le réseau, comme aujourd'hui).
- Changer une case prend effet **tout de suite** : le serveur relit les autorisations à chaque demande ; le téléphone de la personne l'apprend à sa synchronisation suivante (« event: refs » à ses seuls appareils, sans donnée).

### 4.2 Réglages › Fonctions

- La page ne montre que les fonctions **autorisées** à la personne (une fonction non autorisée en disparaît) ; elle garde son interrupteur et sa valeur pour chacune. Pour un invité, « **Listes** » y apparaît aussi quand l'Admin les autorise (un Utilisateur n'a jamais cette ligne).
- Une phrase sous la liste, pour un compte dont l'Admin a retiré quelque chose ou pour un invité : « Seules les fonctions que l'Admin a autorisées pour votre compte sont proposées. » (maquette `invite-fonctions-1`).
- Une fonction **autorisée mais désactivée** se comporte exactement comme une fonction désactivée aujourd'hui : rien d'envoyé, rien de remis sauf la notification « Partage » (avec « Activez … dans Réglages › Fonctions »), adresses vers le premier écran, outils MCP refusés, **rien d'effacé**.
- Une fonction **non autorisée** : pareil, mais la personne ne peut pas l'activer, et même « Partage » n'est pas remis (on ne peut de toute façon pas lui partager : 4.7).
- Décocher puis recocher une fonction ne change pas l'interrupteur de la personne : elle la retrouve dans l'état où elle l'avait laissée.

### 4.3 Ce que voit un invité « projets seulement », projets activés

Maquettes `invite-accueil-1`, `invite-projets-1`, `invite-reglages-1`, `pc-invite-1` : **après** qu'il a activé les projets (avant : 4.4). (Un Utilisateur à qui l'Admin n'a autorisé que les Projets garde ses Listes : seuls les écrans des notes disparaissent.)

| Endroit | Ce qu'il voit |
| --- | --- |
| Premier écran | l'**Accueil** (comme tout le monde) ; il peut le désactiver (Réglages › Accueil) : son premier écran est alors « Projets » (seul choix) |
| Accueil | « Bonjour Max », la cloche ; tuiles **Projets** (ses cartes les plus urgentes) et **Compte**, chacune sur toute la largeur (deux tuiles seules) ; ni Échéances, ni Listes, ni Notes ; masquage et ordre comme aujourd'hui |
| Bandeau du bas | **trois boutons : Accueil, Projets, Réglages** (`.tabbar` de base, trois places ; l'Accueil désactivé : deux boutons, Projets et Réglages, cloche dans la barre du haut) ; pas de bandeau sur l'Accueil (inchangé) ; quatre avec Échéances quand un projet qu'il voit a l'option « Échéances » activée (ligne Échéances ci-dessous) |
| Projets | les projets qu'on lui partage ; **pas de « + »** sans « Peut créer ses propres projets » ; pas de « Dupliquer le projet » dans le menu ⋮ ; « Afficher dans Échéances » selon la règle de l'écran Échéances ; « Personnes » à la place de « Partager » pour ses propres projets (il ne partage jamais, section 19) |
| Un projet | comme aujourd'hui, selon son rôle dans le projet (souvent Contributeur) : les membres du projet, et eux seuls |
| Échéances | (décision finale, section 19) : l'écran et son bouton existent pour un invité **quand les Listes sont activées pour lui**, ou **quand au moins un projet qu'il voit a l'option « Échéances » activée** (ses cartes suivent la règle existante « Afficher dans Échéances ») ; sinon absent |
| Page Notifications | ses notifications de projets et de partage ; catégories proposées dans Réglages › Notifications : Modifications, Échéances (rappels des cartes), Partage ; **pas** Envies |
| Réglages | Mon compte (pastille « Invité ») ; Général : Accueil, **Fonctions** (« Projets »), Notifications, Corbeille (sans onglets : ses projets supprimés) ; Informations : Aide, À propos ; ni Administration |
| Mon compte | nom, identifiant, mot de passe, double authentification, thème, langue, « Se déconnecter » ; une ligne « **Compte invité** : votre accès est réglé par l'Admin. » ; pas « Assistants IA » s'ils ne sont pas autorisés |
| Recherche (loupe, ordinateur) | ses projets et leurs cartes seulement |
| Ordinateur | menu de gauche : **Accueil, Projets** (et ses projets dessous, sur les écrans des projets) ; ni Échéances, Listes, Notes, ni « Types » ; pas de « Nouveau projet » en bas sans le droit de créer ; « Invité » sous son prénom |
| Aide | la même aide que tout le monde (le guide est aussi publié sur le site) ; question 8 |
| Assistants IA | si l'Admin les autorise : seulement les outils des fonctions utilisées ; les autres répondent « Les listes ne sont pas ouvertes pour ce compte. » ; l'écran d'autorisation propose « Mes projets » au lieu de « Toutes mes listes, mes notes et mes projets » |

### 4.4 Première connexion d'un invité

Maquettes `invite-accueil-vide-1`, `invite-fonctions-1`.

1. Max se connecte (mot de passe provisoire à changer, comme aujourd'hui). L'Admin a coché « Projets » pour lui : les projets sont **déjà activés** (décision finale, section 19) ; il voit « DomoPi Articles » tout de suite. Si l'Admin n'a encore rien coché, l'**Accueil** ne montre que la tuile Compte et, en haut, sur toute la largeur, une **invitation** : « Bienvenue, Max. Votre compte est prêt. … », avec le bouton « **Ouvrir Réglages › Fonctions** » (maquette `invite-accueil-vide-1`).
2. **Réglages › Fonctions** ne propose que ce que l'Admin a autorisé, chaque fonction avec son interrupteur (activé au départ), et la phrase « Seules les fonctions que l'Admin a autorisées pour votre compte sont proposées. ».
3. S'il désactivé Projets, il les réactive lui-même au même endroit.

Règle de l'invitation (pour tous les comptes, pas seulement les invités) : elle s'affiche quand **aucune fonction n'est utilisée** (ni Listes, ni Notes, ni Projets) ; elle nomme la fonction autorisée s'il n'y en a qu'une (« Activez les projets… »), sinon « Activez une fonction… ». Le bandeau du bas, sur les autres écrans, n'a alors que Réglages (et l'Accueil). Un Utilisateur a toujours les Listes : il ne la voit jamais.

### 4.5 « Peut créer ses propres projets »

- Décochée : `project.create` et `project.duplicate` refusés (403, « Votre compte ne peut pas créer de projet. ») ; « + », « Nouveau projet » (N) et « Dupliquer le projet » absents ; `create_project` (MCP) refusé ; les projets qu'il possède déjà restent à lui.
- Il garde tout ce que son **rôle dans chaque projet** permet (créer des **cartes**, commenter…) : cette case ne touche que la création de projets.

### 4.6 Assistants IA

- Décochée : « Autoriser un assistant IA » absent de Mon compte ; `/oauth/authorize` refuse ce compte (page « Votre compte ne peut pas autoriser d'assistant IA. ») ; **les connexions existantes sont révoquées** (journal `oauth_revoked`, `reason: access`), comme à la désactivation d'un compte.
- Cochée : la personne autorise elle-même un assistant si elle le veut ; les outils suivent ses fonctions **utilisées**, contrôlées en premier, avant la portée et les droits (même ordre que « projets désactivés » aujourd'hui).

### 4.7 « Pas de listes » côté serveur (invités seulement)

Un Utilisateur a toujours les Listes : seul un **invité** peut ne pas les avoir (non autorisées, ou autorisées et désactivées). Les listes sont le cœur de Listo : presque tout les suppose. Pour un invité sans Listes :

- **Synchronisation** (`changesSince`) : rien de ce qui touche les listes : `lists`, `items`, `listIds` vides ; ni `stores`, `aisles`, `history` (mémoire des articles), `reservations`, `gifts`, ni Nouveautés des listes ; `users` (annuaire) reste (vide, pour un invité).
- **File d'attente** (`/api/ops`, un seul aiguillage dans `server/lists.js`, `handlers[op.type]`) : toute opération `list.*`, `item.*`, `gift.*` refusée (403, « Les listes ne sont pas ouvertes pour votre compte. ») avant tout traitement ; les autres (`note.*`, `project.*`, `account.*`) selon leur propre fonction.
- **Routes** refusées de même (un contrôle `requireAccess('lists')` posé une fois par routeur) : listes et articles (`routes/lists.js`, **sauf** l'annuaire `GET /api/users`, qui sert aussi aux notes et projets et doit être déplacé dans une route à part), photos, produits (mode scan), magasins et rayons, liens publics des listes, réservations, suggestions.
- **Partage** : une liste ne peut pas être partagée avec lui (pour l'Admin, 400 nommé « Max n'utilise pas les listes. » ; pour les autres, « compte inconnu »), ni lui être destinée.
- **Notifications et rappels** (`deliver`, `server/notify.js`) : rien des listes (une règle `allowedList` comme `allowedNote`), même s'il était déjà membre ; résumé du matin sans tâches.
- **Temps réel** : pas de `event: list` ni `event: refs`.
- **Assistants IA** : outils des listes refusés (`list_lists`, `read_list`, `add_items`, `set_checked`, `update_items`).
- **Rien n'est effacé** : s'il possédait des listes ou en était membre (par exemple un Utilisateur devenu invité), elles restent en base et pour leurs autres membres (l'Admin en est prévenu, 4.8) ; elles reviennent quand les Listes sont de nouveau utilisées.

**Effort** : c'est la plus grosse partie (étape 3). Elle ne concerne plus que les invités, mais le travail est presque le même : le serveur doit savoir répondre « pas de listes » partout, et le téléphone savoir s'en passer (bandeau, Accueil, menu de gauche, Échéances, « À offrir », Corbeille sans onglets, catégories de notifications, recherche, raccourcis clavier), à la manière de « Notes désactivées » qui existe déjà.

### 4.8 Retirer une fonction d'un compte qui a déjà des données

- **Décocher** : confirmation avec ce qui disparaîtra de **ses** écrans, en nombres (« Zoé possède 2 projets, partagés avec 3 personnes : ils restent pour les autres, Zoé ne les verra plus. ») ; rien n'est effacé.
- **Recocher** : la fonction revient dans sa page Fonctions, avec l'interrupteur qu'elle avait laissé.
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
| **Admin** | tous les comptes actifs, chacun avec son rôle (mention « Invité · discret ») et ses fonctions autorisées (pour griser un invité qui n'a pas les listes dans le partage d'une liste) |
| **Utilisateur** (famille) | les comptes actifs **qui ne sont pas des invités** ; pas d'identifiant de connexion |
| **Invité** | **vide** (seulement lui-même, qu'il connaît déjà) |

Champs envoyés, construits champ par champ : `id`, `displayName`, et pour l'Admin seulement `role` et `allowed`. Plus jamais `username`.

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

- **A (retenue, sans avertissement)** (décision finale, section 19) : on l'accepte ; c'est normal, la feuille « Partager » **n'affiche pas d'avertissement** (la maquette `partage-admin-1` en montrait un : abandonné). Pour un projet vraiment à part, le propriétaire ne met pas de proche dedans.
- **B** : montrer aux invités les autres membres sous un nom neutre (« Membre 1 ») : illisible pour attribuer ou commenter ; et Hugo verrait quand même Max. Non.
- **C** : interdire de mélanger proches et invités dans un projet : trop rigide (Hugo aide aussi DomoPi). Non.

Le menu « Personnes » d'un projet et les pastilles ne montrent jamais le rôle du compte (Admin, Invité), seulement le prénom et le rôle dans le projet (déjà le cas).

### 5.4 Comment l'Admin partage DomoPi avec Max

1. Administration › Comptes › « Nouveau compte » (maquette `nouveau-compte-1`) : rôle **Invité** ; les fonctions autorisées apparaissent, **rien de coché** au départ (décision finale, section 19) ; l'Admin coche « Projets » (activés aussitôt pour Max) ; identifiant `max`, nom affiché « Max », mot de passe provisoire (ou compte relié par le fournisseur d'identité).
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
- **Invité qui partage** (décision finale, section 19) : **jamais** ce qu'il possède : ni personnes, ni lien public (listes, notes, projets) ; le serveur refuse (403, « Un compte invité ne peut pas partager : l'Admin s'en charge. »), et ses écrans montrent « Personnes » (en lecture) à la place de « Partager ». C'est l'Admin qui le met dans les choses des autres ; un lien public qu'il avait avant de devenir invité est arrêté au changement de rôle.
- Le téléphone n'est jamais cru : un numéro de compte envoyé « à la main » suit les mêmes contrôles.

### 5.8 Nom affiché

- Le **nom affiché** est choisi par l'Admin (prénom seul conseillé : « Max ») ; la personne ne le change pas (comme aujourd'hui).
- L'**identifiant de connexion** n'est plus jamais envoyé aux autres comptes (3.3), invité ou non.

### 5.9 Ce qui reste commun

Deux réserves sont **communes au foyer** et ne contiennent **aucun nom de personne**, mais un contenu :

- la **mémoire des articles** (« Souvent ajoutés », suggestions : tout ce que la famille a déjà tapé dans ses listes de courses) ;
- les **étiquettes des notes** (« Anniversaire Zoé », « Impôts »…).

Un invité « projets seulement » ne reçoit ni l'une ni l'autre. Pour un invité à qui l'Admin autoriserait les Listes ou les Notes, la page du compte le dit en clair sous la case (« La mémoire des articles est commune au foyer. », « Les étiquettes des notes sont communes au foyer. ») ; les filtrer est possible mais coûteux (questions 5 et 6).

## 6. Les trois rôles

Décision du propriétaire du 25 novembre 2026 : **le rôle donne le réglage**, sans sélecteur de préréglage ni interrupteur « discret ».

| Rôle | Pour qui | Fonctions | Visible de la famille | Voit la famille |
| --- | --- | --- | --- | --- |
| **Admin** | le propriétaire (et tout autre Admin) | toutes autorisées, aucune case ; il active Notes et Projets lui-même, comme aujourd'hui | oui | oui (tous les comptes, invités compris) |
| **Utilisateur** | la famille (comme aujourd'hui) | **Listes toujours** ; Notes, Projets, création de projets, Assistants IA autorisés au départ, l'Admin peut les retirer ; la personne active Notes et Projets | oui | oui |
| **Invité** | les personnes qui aident (DomoPi) | autorisées par l'Admin (**rien de coché au départ**) ; une fonction cochée s'active aussitôt, il peut l'désactiver (décision finale, section 19) | **non** (sauf des Admin) | **non** |

### 6.1 Changer de rôle

Dans la page du compte, le choix « Utilisateur | Invité | Admin » ; chaque changement passe par une confirmation, puis est enregistré tout de suite et journalisé. Les règles d'aujourd'hui restent (un Admin ne change pas son propre rôle ; il reste toujours au moins un Admin actif).

| Changement | Confirmation | Effet |
| --- | --- | --- |
| Utilisateur → **Invité** | « Faire de Léa un invité ? Léa disparaîtra de la liste des personnes de la famille (Partager, « Pour qui ? ») et ne verra plus les autres comptes. Ce qui est déjà partagé avec Léa reste partagé, et ses membres continueront de l'y voir. Ses fonctions ne changent pas ; ses liens publics sont arrêtés. » (avec, à l'étape 2, ce qui est autorisé et activé) | discrète tout de suite ; ses cases et ses interrupteurs **ne changent pas** (rien n'est retiré en silence : l'Admin décoche ensuite) ; les Listes deviennent une case (cochée, activée) ; ses liens publics sont arrêtés (un invité ne partage jamais) ; refusé si une liste d'envies lui est destinée (5.6) |
| Invité → **Utilisateur** | « Rendre Max utilisateur ? Toute la famille pourra le voir et lui partager des listes, des notes et des projets, et il verra tous les comptes de la famille. Il aura toujours les Listes ; ses autres fonctions autorisées ne changent pas. » | visible tout de suite ; Listes toujours là ; autres cases inchangées |
| Utilisateur → **Admin** | celle d'aujourd'hui | tout autorisé (les cases sont gardées, ignorées) |
| Admin → **Utilisateur** | celle d'aujourd'hui | les cases gardées reprennent effet (toutes cochées pour un compte qui n'en a jamais eu) |
| Invité → **Admin** | — | **impossible directement** : « Admin » est grisé pour un invité, avec « Pour en faire un Admin, faites-en d'abord un utilisateur. » ; le serveur refuse (400 nommé), et la base aussi (8.1) |
| Admin → **Invité** | — | impossible directement de même (passer par Utilisateur ; question 11) |

## 7. Écrans

### 7.1 Administration › Comptes

Maquettes `admin-comptes-1` (téléphone), `pc-admin-comptes-1` (ordinateur).

- La liste garde sa forme ; la ligne dessous dit le **rôle** et l'état : « Admin · 2FA activée », « Utilisateur · 2FA désactivée », « Utilisateur · sans projets » (quand l'Admin a retiré une fonction), « **Invité · Projets** » (ce qui est autorisé) ; une pastille **« Discret »** avec l'icône de l'œil barré (`#i-eye-off`) **et** le mot sur chaque invité (jamais l'icône seule).
- Ordre : Admin et Utilisateurs d'abord, puis les invités sous un titre « Invités » (on les retrouve d'un coup d'œil).
- Toucher un compte ouvre **sa page** (`#/administration/comptes/<id>`, au lieu de la feuille d'aujourd'hui, devenue trop longue) : en tête le nom, l'identifiant, la 2FA (et « Discret » pour un invité) ; **Rôle** (« Utilisateur | Invité | Admin », la phrase qui va avec dessous) ; **Fonctions autorisées** (cases de 4.1 ; « Un Admin a accès à tout. » pour un Admin), avec la ligne « Il choisit ensuite lui-même de les activer dans Réglages › Fonctions. » ; puis les actions d'aujourd'hui (mot de passe, double authentification, délier, désactiver, supprimer).
- Maquettes : `admin-compte-1` (Max, Invité : Projets seul autorisé, « Admin » grisé), `admin-compte-2` (Hugo, Utilisateur : pas de ligne « Listes » (toujours là), tout le reste autorisé).
- Sur ordinateur : la liste à gauche, la page du compte choisi à droite, dans la colonne de 1 040 px.
- Chaque changement est envoyé tout de suite (comme le rôle aujourd'hui), avec un message court (« Fonctions de Max enregistrées ») ; un retrait ou un changement de rôle passe par une confirmation (4.8, 6.1).

### 7.2 Nouveau compte

Maquette `nouveau-compte-1` : feuille « Nouveau compte » : **le rôle d'abord** (« Utilisateur | Invité | Admin », Utilisateur par défaut ; Invité choisi dans la maquette) avec sa phrase, puis les **fonctions autorisées** cochées selon le rôle (Utilisateur : toutes, sans ligne Listes ; Invité : **aucune** (décision finale, section 19) ; Admin : aucune case), puis identifiant, nom affiché, mot de passe provisoire ; « Créer le compte ». (Étape 1 : le rôle seulement ; les cases arrivent à l'étape 2.)

### 7.3 Partager (Admin, famille)

- **Guillaume** partage « DomoPi Articles » (maquette `partage-admin-1`) : Max et Inès dans la liste, avec « Invité · discret » sous leur prénom ; **pas d'avertissement** (décision finale, section 19).
- **Léa** partage sa liste « Courses » (maquette `partage-famille-1`) : Guillaume, Hugo, Zoé ; **ni Max ni Inès** : rien à l'écran ne laisse deviner qu'ils existent (pas de « 2 comptes masqués »).
- Dans le partage d'une **note** ou d'un **projet**, un Utilisateur à qui l'Admin a retiré cette fonction apparaît grisé, avec « N'utilise pas les notes » (ou « … les projets ») : ce n'est pas secret pour un compte visible. Une personne qui l'a **autorisée mais désactivée** n'est pas grisée (règle d'aujourd'hui : elle reçoit « Partage » avec l'invitation à l'activer).

### 7.4 Invité à sa première connexion

Maquettes `invite-accueil-vide-1` (Accueil avec l'invitation « Activez les projets… ») et `invite-fonctions-1` (Réglages › Fonctions : la seule ligne « Projets », désactivée) ; voir 4.4.

## 8. Modèle de données

Mêmes conventions que l'existant (colonnes `<chose>_<état>` sur `users`, contraintes CHECK, valeurs de départ qui ne changent rien). Une migration par étape, à partir de **47**. **Pas de colonne `discreet`** : discret = invité.

| Migration | Étape | Changement | Remarques |
| --- | --- | --- | --- |
| 47 | 1 | `users.guest` INTEGER NOT NULL DEFAULT 0 CHECK (guest IN (0, 1) AND (guest = 0 OR role = 'user')) | ajout de colonne, sans recréer la table (8.1) ; 0 pour tous les comptes existants ; la contrainte interdit « invité et Admin » |
| 48 | 2 | `users.notes_allowed`, `users.projects_allowed`, `users.projects_create`, `users.mcp_allowed` : INTEGER NOT NULL DEFAULT 1, CHECK (0, 1) | autorisations de l'Admin ; 1 partout : la famille garde tout ; pour un Admin, ignorées ; pour un nouvel invité, le serveur écrit **0 partout** (décision finale, section 19) |
| 49 | 3 | `users.lists_allowed`, `users.lists_enabled` : INTEGER NOT NULL DEFAULT 1, CHECK (0, 1) | **lues seulement pour un invité** (un Utilisateur et un Admin ont toujours les Listes) ; pour un nouvel invité : 0 et 0 ; cochée par l'Admin : `lists_enabled` = 1 aussitôt |

Les interrupteurs de la personne existent déjà et restent : `notes_enabled` (1 au départ), `projects_enabled` (0 au départ). **Fonction utilisée = autorisée ET activée.** Pour un **nouvel invité**, le serveur écrit `notes_enabled` = 0 et `projects_enabled` = 0 ; quand l'Admin coche une fonction pour un invité, il écrit aussi son interrupteur à 1 (activée aussitôt (décision finale, section 19)). `lists_enabled` est la seule colonne nouvelle côté personne : sans elle, un invité ne pourrait pas désactiver ses Listes.

### 8.1 Le rôle Invité en base : une colonne `guest` (recommandé) ou une troisième valeur de `role`

| | **Colonne `users.guest`** (recommandée) | **`users.role` = `'guest'`** |
| --- | --- | --- |
| Migration | `ALTER TABLE users ADD COLUMN guest …` : une ligne, sans risque ; la contrainte croisée (`guest = 0 OR role = 'user'`) est acceptée par SQLite à l'ajout de colonne et vérifiée sur les lignes existantes (essayé avec la version de SQLite de better-sqlite3) | SQLite ne sait pas changer une contrainte CHECK : il faut **recréer `users`**. Or **43 tables** la référencent, presque toutes avec `ON DELETE CASCADE`, et `DROP TABLE users` avec les clés étrangères actives déclenche les cascades (listes, notes, projets, sessions effacés). Il faudrait couper les clés étrangères hors transaction (exception dans `migrate()`), recopier une douzaine de colonnes exactement, puis vérifier `foreign_key_check` |
| « Jamais invité et Admin » | garanti par la base (contrainte) et par le serveur | garanti par la base (une seule valeur) |
| Code | une fonction `accountRole(row)` (`public/js/access.js`) rend `'admin'`, `'user'` ou `'guest'` ; partout ailleurs, on lit ce rôle calculé, jamais `role` seul | on lit `role` directement |
| Risque d'oubli | un endroit qui lirait `users.role` seul prendrait un invité pour un Utilisateur (visible) : un test cherche dans le code toute lecture de `role` hors de `accountRole` et de l'administration | un endroit qui teste `role === 'user'` ignorerait l'invité ; mêmes tests |
| Avis | **recommandée** : même sécurité, sans la migration la plus risquée de Listo | possible, plus « propre » sur le papier, pas assez pour justifier le risque |

Rien ne s'oppose sérieusement à la colonne : la contrainte croisée garde la règle « un invité n'est jamais Admin » dans la base, et le seul piège (lire `role` sans `guest`) se couvre par une fonction unique et un test.

### 8.2 Le reste

- Noms de colonnes pris dans une **liste fixe** (comme `server/features.js`), jamais dans une requête.
- Règles partagées dans un nouveau fichier `public/js/access.js` (fonctions pures : rôle calculé, fonctions autorisées selon le rôle, fonction utilisée = autorisée ∧ activée, valeurs de départ par rôle, au moins une fonction autorisée pour un invité, changements de rôle permis), lu par le serveur (`server/access.js`) et les écrans, testé seul, comme `features.js`. `server/features.js` (Réglages › Fonctions) refuse d'activer une fonction non autorisée.
- `/api/me` et chaque synchronisation donnent à la personne **son** rôle, **ses** fonctions autorisées et **ses** interrupteurs ; jamais ceux d'un autre.
- Tout ce qui teste aujourd'hui `role === 'user'` ou `['admin', 'user']` est revu (`admin-users.js` : création, modification, `losesAdmin` ; `oidc.js` : acceptation ; `admin.js` : choix du rôle ; `roleChip`) ; ce qui teste `role === 'admin'` reste juste (un invité n'est jamais Admin).
- Aucune nouvelle table en première intention (l'option « Visible aussi par… », question 1, demanderait `user_visibility (user_id, viewer_id)`).

## 9. Matrice des droits

| Action | Admin | Utilisateur | Invité | Remarques |
| --- | --- | --- | --- | --- |
| Voir un invité dans son annuaire | oui | **non** | non (annuaire vide) | contextes partagés : 5.3 |
| Voir un Admin ou un Utilisateur dans son annuaire | oui | oui | **non** | |
| Ajouter un invité à une liste, une note, un projet | oui (selon ses fonctions autorisées) | non : « compte inconnu » | non | |
| En faire le destinataire d'une liste d'envies | **non** (message nommé) | non : « compte inconnu » | — | 5.6 |
| Listes, Échéances, À offrir, mode scan | toujours | **toujours** | si autorisées (non au départ) **et** activées (activées aussitôt cochées ; 403 nommé sinon) ; Échéances aussi par un projet à l'option « Échéances » activée (section 19) | 4.7 |
| Notes | s'il les active | si autorisées (oui au départ) et activées (oui au départ) | si autorisées (non au départ) et activées (aussitôt cochées) | |
| Projets partagés avec lui | s'il les active | si autorisés (oui) et activés (non au départ) | si autorisés (**non** au départ) et activés (aussitôt cochés) | rôles du projet inchangés |
| Créer, dupliquer un projet | oui | si autorisé (oui au départ) | si autorisé (**non** au départ ; 403 nommé) | 4.5 |
| Assistants IA | oui | si autorisés (oui au départ) | si autorisés (non au départ) | 4.6 |
| Activer une fonction dans Réglages › Fonctions | oui | les autorisées | les autorisées (Listes compris si autorisées) | 4.2 |
| Régler rôle et fonctions autorisées d'un compte | oui (pas le sien) | non (404, route Admin) | non | |
| Voir les projets, listes, notes des autres | **non** (404, inchangé) | non | non | l'Admin n'a aucun droit sur le contenu |

- **404 ou 403** : un objet qu'on ne peut pas voir (liste, note, projet, compte d'un autre) répond **404** comme aujourd'hui ; une **fonction** non utilisée par son propre compte répond **403 nommé** (la personne sait déjà ce que son compte peut faire : rien n'est révélé) ; un compte qu'on ne voit pas répond **comme un compte inconnu** (400 `ops.utilisateurInconnu`).

## 10. Sécurité

- **Droits côté serveur, à chaque demande** : rôle, autorisations et interrupteurs relus à chaque requête et à chaque opération (comme `projects_enabled` aujourd'hui), annuaire calculé pour celui qui demande, jamais gardé en cache entre deux comptes.
- **Un seul calcul de l'annuaire** (`directoryFor`) ; plus aucun `SELECT … FROM users WHERE active = 1` envoyé à un compte en dehors de lui (un test le cherche dans le code, comme les tests des réservations). **Un seul calcul du rôle** (`accountRole`) : un test refuse toute lecture de `users.role` ailleurs que là et dans l'administration.
- **Rien qui fuit par les réponses** : réponses construites champ par champ ; plus d'identifiant de connexion hors Administration ; erreurs identiques pour un compte inconnu et un compte qu'on ne voit pas ; pas de nombre de comptes ailleurs que pour l'Admin (« 6 comptes » n'apparaît nulle part pour la famille) ; le rôle d'un autre compte n'est envoyé qu'à l'Admin.
- **Synchronisation, temps réel, MCP** : rien d'une fonction non utilisée (4.7) ; SSE inchangé (aucune donnée) mais plus envoyé pour les fonctions fermées ; MCP : contrôle de la fonction en premier, puis « Certaines listes », portée, rôle dans le projet.
- **Copie locale** : un téléphone qui avait reçu l'ancien annuaire complet le remplace à la synchronisation suivante (la nouvelle version du service worker force une synchronisation complète). À dire au propriétaire : **un compte créé avant cette version a pu recevoir l'annuaire complet**. Comme les invités n'existent pas encore, il suffit de créer Max et Inès **après** la mise à jour.
- **Journal de sécurité** (en anglais, sans contenu) : `admin_role_changed` (existe ; `role=guest` en plus), `admin_access_changed` (admin, user, et les autorisations : `lists=0 notes=0 projects=1 create=0 mcp=0`), `admin_account_created` (existe ; `role=guest` et les autorisations), `oauth_revoked` (`reason=access`) ; un refus pour fonction fermée n'est pas journalisé (pas d'attaque), un ajout refusé d'un compte non visible l'est avec les nombres seulement (`share_unknown_user`, qui, combien), pour repérer un essai de numéros. Activer ou désactiver une fonction soi-même n'est pas journalisé (comme aujourd'hui).
- **Limites** : le partage garde ses plafonds ; aucune nouvelle route sans session.
- **Listes d'envies** : le test « identique avec ou sans réservation » doit rester vert ; un invité n'est jamais destinataire (5.6).
- **Ce que ce rôle n'est pas** : une barrière contre l'Admin (il voit tous les comptes, jamais leur contenu, comme aujourd'hui) ; une protection contre un membre qui recopie à la main ce qu'il voit dans un projet partagé.

## 11. Tests

Sur les points sensibles, à chaque étape, en plus des tests existants :

- **Migration 47** : sur une base remplie, la colonne ajoutée, 0 partout, aucune autre ligne touchée ; la base refuse `guest = 1` pour un Admin et `role = 'admin'` pour un invité.
- **« Annuaire identique avec ou sans invités »** (le cœur) : pour Léa (Utilisateur), on enregistre `GET /api/users`, la synchronisation complète (`users`, membres de ses listes, notes et projets), `GET /api/inbox`, ses Nouveautés, ses réponses MCP (`list_lists`, `read_list`, `list_notes`, `list_projects`, `read_project`) ; on crée Max et Inès invités, on partage avec eux un projet **dont Léa n'est pas membre**, ils y créent des cartes et des commentaires ; on recompare : **identique**, octet pour octet (hors heures de synchronisation). Même test après avoir fait passer Zoé d'Utilisateur à Invité : Zoé disparaît, rien d'autre ne change.
- **Annuaire de l'Admin** : contient les invités, avec leur rôle ; **annuaire d'un invité** : vide.
- **Ajout par numéro** : Léa ajoute Max (invité) par son numéro à une liste, une note, un projet : même statut et même corps de réponse qu'avec un numéro qui n'existe pas ; aucune écriture.
- **Destinataire d'envies** : `list.create` (file d'attente) et la conversion avec Max refusés, pour Léa comme pour l'Admin ; passer en Invité un destinataire refusé.
- **Changements de rôle** : chaque ligne de 6.1 (permis, refusés : Invité ↔ Admin directement, soi-même, dernier Admin), cases et interrupteurs inchangés, journal.
- **Contexte partagé** : Hugo, membre de « DomoPi Articles » avec Max, voit Max dans les membres du projet et dans l'historique, **pas** dans son annuaire ; Max voit Guillaume et Hugo dans le projet, pas Léa nulle part.
- **Autorisé et activé** : pour chaque fonction, les quatre cas (autorisée ou non × activée ou non) ; une fonction non autorisée ne peut pas être activée (`account.features` refusé) ; autorisée mais désactivée : comme une fonction désactivée aujourd'hui (rien d'envoyé, « Partage » remis avec l'invitation à l'activer) ; décocher puis recocher garde l'interrupteur ; Listes toujours là pour un Utilisateur et un Admin, quelles que soient les colonnes.
- **Invité sans Listes** : chaque route et chaque type d'opération des listes refusés (403), rien des listes dans la synchronisation (ni magasins, rayons, mémoire des articles), aucun événement temps réel, aucune notification ni rappel des listes, outils MCP des listes refusés ; « Peut créer ses propres projets » (création, duplication, MCP) ; Assistants IA (autorisation refusée, connexions révoquées).
- **Nouvel invité** : tout désactivé au départ ; l'Accueil montre l'invitation (4.4) ; Réglages › Fonctions ne propose que les fonctions autorisées.
- **Règles** (`public/js/access.js`) : rôle calculé, fonction utilisée (toutes les combinaisons), valeurs de départ par rôle, au moins une fonction autorisée pour un invité, changements de rôle permis.
- **Rien d'effacé** : retirer puis rendre une fonction à un compte qui a des données : tout revient.
- **Identifiant de connexion** : jamais dans une réponse à un autre compte que l'Admin.
- **Suppression d'un compte** : impossible s'il possède un projet ou a créé des cartes.
- **Écrans** : bandeau à trois boutons (et à un bouton, rien d'activé), Accueil avec l'invitation, menu de gauche réduit, Réglages et Fonctions réduits, page du compte (trois rôles) ; captures du téléphone avant / après pour un Utilisateur **identiques au pixel près** ; textes en français et en anglais.
- « Identique avec ou sans réservation » (envies) relancé.

## 12. Aide et documents

À chaque étape, pour ce qu'elle apporte, dans les deux langues :

- **Aide** : dans le chapitre « Comptes » (`public/js/help-content.js`, `public/js/help-en/comptes.js`), une section « Rôles des comptes : Admin, Utilisateur, Invité » (pour l'Admin : fonctions autorisées, la personne qui les active, invité toujours discret, ce qui reste visible dans un projet partagé, changer de rôle) ; dans « Réglages » (Fonctions) : « seules les fonctions autorisées par l'Admin sont proposées » ; dans « Rôles », une ligne par droit nouveau ; « Mon compte » : la ligne « Compte invité » ; numéros calculés. Anglais : « Admin », « User », « Guest » ; « Allowed features » ; « Can create their own projects » ; « Discreet ».
- **Guide et site** : `node scripts/guide.js`, puis `node scripts/doc-links.js`.
- **README.md et README.fr.md** : une ligne dans la liste des fonctions.
- **Cahier des charges** : Comptes et rôles, Écrans (Administration, Fonctions), Modèle de données (migrations 47 à 49), Sécurité (annuaire, invités) ; `docs/exploitation.md` (migrations).
- **CLAUDE.md** : une entrée « Rôle Invité » (règle de l'annuaire, `accountRole`, autorisé ∧ activé, test « annuaire identique »).
- **Kit de design** : sections 16.48 à 16.51 (`design/listo.css` et la copie de `public/css/`), `design/components.html`.
- **Service worker** : version augmentée, nouveaux fichiers dans `APP_FILES`.
- **Annonce aux proches** : aucune nécessaire (rien ne change pour eux). Pour les invités, une phrase d'accueil que le propriétaire leur envoie lui-même (« Connecte-toi, puis active les Projets dans Réglages › Fonctions »).

## 13. Découpage en étapes

Chaque étape : un plan court, la construction, les tests, un résumé. **Une seule PR `dev` → `main`, à la fin des trois étapes** (décision finale, section 19) : le propriétaire essaie le tout à la fin. Tailles indicatives (lignes de code et de tests, hors aide), à comparer aux étapes des projets (environ 3 000 à 6 000 lignes chacune).

1. **Rôle Invité et annuaire discret** (migration 47, colonne `guest`) — **petite à moyenne** : `accountRole`, choix du rôle à trois valeurs dans la page du compte et « Nouveau compte », changements de rôle de 6.1, pastilles « Invité » et « Discret », `directoryFor` à la place de `activeUsers` (synchronisation, `GET /api/users`), contrôles des ajouts (listes, notes, projets) et du destinataire d'envies, un invité ne partage jamais ce qu'il possède, invité déjà membre affiché correctement dans le partage, journal ; et les deux constats : **plus d'identifiant de connexion envoyé**, **`accountUsed` compte les projets**. Construite le 25 novembre 2026 (19.3).
2. **Fonctions autorisées : Notes, Projets, création de projets, Assistants IA** (migration 48) — **moyenne** (environ 1 500 à 2 200 lignes) : `access.js`, « autorisé ∧ activé » branché sur la mécanique des Fonctions (déjà là pour Notes et Projets), Réglages › Fonctions réduit aux fonctions autorisées, cases dans la page du compte et dans « Nouveau compte » (départ selon le rôle), tout désactivé pour un nouvel invité, invitation de l'Accueil (4.4), « Peut créer ses propres projets », Assistants IA (autorisation, révocation), Mon compte. À la fin de cette étape, un invité a encore les Listes (vides : on ne peut rien lui partager ; il pourrait créer les siennes et recevrait la mémoire des articles).
3. **Listes des invités** (migration 49) — **grande** (environ 2 800 à 4 000 lignes ; un peu moins qu'avant, car elle ne concerne plus que les invités : pas de « Listes » côté Utilisateur, ni de confirmation « Léa possède 4 listes », ni de partage grisé pour la famille ; mais le serveur doit quand même savoir répondre « pas de listes » partout) : tout 4.7 côté serveur (synchronisation, file d'attente, routes, notifications, rappels, résumé du matin, temps réel, MCP), la ligne « Listes » dans les Fonctions d'un invité, et côté téléphone et ordinateur l'absence des Listes (bandeau à trois boutons, Accueil, menu de gauche, Échéances, « À offrir », Corbeille, catégories de notifications, recherche, raccourcis) ; invité « projets seulement » complet. Captures avant / après pour un Utilisateur.

L'aide, le guide, le site et le cahier des charges suivent à chaque étape (12).

## 14. Risques

| Risque | Probabilité | Gravité | Ce qui le réduit |
| --- | --- | --- | --- |
| Un nom qui fuit par un chemin oublié (nouvel écran, nouvel outil MCP) | moyenne | moyenne (un prénom) | une seule fonction d'annuaire ; test « annuaire identique » qui compare **toutes** les réponses d'un proche ; une règle dans CLAUDE.md pour les écrans à venir |
| Un endroit qui lit `users.role` sans `guest` et traite un invité en Utilisateur | moyenne | moyenne | une seule fonction `accountRole` ; un test qui refuse toute autre lecture de `role` ; le test « annuaire identique » |
| Un invité perdu à sa première connexion (tout désactivé) | moyenne | faible | invitation de l'Accueil avec le bouton vers Fonctions ; notification « Partage » qui le dit aussi ; phrase d'accueil envoyée par le propriétaire |
| Un numéro de compte deviné pour partager avec un invité | faible | faible | contrôle par `directoryFor` à chaque ajout, réponse identique à « inconnu » |
| Le propriétaire croit Max invisible de Hugo alors qu'ils partagent un projet | moyenne | faible | avertissement dans « Partager », phrase sous le rôle, section d'aide |
| « Pas de listes » oublié quelque part (une route, une notification) | moyenne | faible (Max verrait une liste… qu'on ne peut pas lui partager) | un contrôle par routeur, un dans l'aiguillage des opérations ; tests route par route |
| Régression pour la famille | faible | forte | valeurs de départ qui ne changent rien (Listes toujours, Fonctions inchangées) ; captures avant / après au pixel près ; tests existants |
| Complexité ajoutée à un code déjà large (lists.js : 2 000 lignes) | certaine | moyenne | règles dans `access.js` testé seul ; un rôle de plus plutôt que deux réglages ; réutilisation de la mécanique des Fonctions |
| Ancien annuaire complet resté sur un téléphone | faible | faible | remplacé à la synchronisation ; créer les invités après la mise à jour |

## 15. Autres solutions étudiées

| Solution | Pour | Contre | Avis |
| --- | --- | --- | --- |
| **Ce cadrage** : rôle Invité (toujours discret), fonctions autorisées par l'Admin et activées par la personne | tout au même endroit ; un seul choix (le rôle) donne la visibilité ; la même règle que les Fonctions d'aujourd'hui ; la famille ne voit rien changer | trois PR, dont une grande | **retenue** (décisions du 25 novembre 2026) |
| **La case de l'Admin active la fonction** (premier cadrage) | un invité voit ses projets dès la première connexion | deux sens pour une même case ; contraire au choix du propriétaire (« ne lui active pas forcément la fonction ») | non (décision du 25 novembre 2026) |
| **Préréglages + interrupteur « Compte discret »** (premier cadrage) | un invité visible était possible | un réglage de plus, et un sélecteur qui ne sert qu'à la création | remplacé par le rôle (décision du 25 novembre 2026) |
| **Troisième valeur `'guest'` dans `users.role`** | une seule colonne pour le rôle | recréation de la table des comptes et risque de cascades (8.1) | non : colonne `guest` recommandée |
| **Une deuxième installation de Listo** (« DomoPi », autre adresse, autre conteneur) | isolation totale, **zéro ligne de code**, possible dès aujourd'hui ; aucun risque pour la famille | deux comptes et deux applications pour Guillaume ; DomoPi absent de son Accueil et de ses Échéances ; sauvegardes, mises à jour et secrets en double ; projets à déplacer (l'assistant IA peut le faire) | **bonne solution de secours**, ou d'attente pendant la construction |
| **Groupes du fournisseur d'identité** (Authelia, Pocket ID : groupe « listo-invites » → rôle Invité) | gestion centrale pour qui a un fournisseur | seulement avec LISTO_OIDC=on ; lecture d'une nouvelle donnée du jeton ; deux endroits pour la même décision | **plus tard**, en plus : proposer le rôle à l'acceptation d'une demande de compte selon son groupe |
| **Discret par projet** (« ce projet est à part ») au lieu de par compte | un seul réglage sur le projet | la demande porte sur les **personnes** (« que leurs noms ne soient pas vus ») : un compte serait visible par un autre chemin (son annuaire, une liste) | non |
| **Plus d'annuaire du tout** (on partage en tapant un identifiant) | aucun nom ne circule | change les habitudes de toute la famille ; l'identifiant de connexion deviendrait connu de tous | non |

## 16. Maquettes

Dans [`design/comptes/`](../design/comptes/README.md), en clair et en sombre (téléphone 390 px, ordinateur 1 440 px). Prénoms d'exemple : Guillaume (Admin), Léa, Zoé, Hugo (Utilisateurs) ; Max et Inès (Invités, ils aident pour DomoPi).

| Fichier | Écran |
| --- | --- |
| admin-comptes-1 | Administration › Comptes : Admin et Utilisateurs (« Utilisateur · sans projets » pour Zoé), puis « Invités » (Max, Inès : « Invité · Projets ») avec la pastille « Discret » |
| admin-compte-1 | Page du compte de Max : rôle « Utilisateur \| Invité \| Admin » (Invité ; Admin grisé), « Un invité est toujours discret… », Fonctions autorisées (Projets seul) et « Il choisit ensuite lui-même de les activer… » |
| admin-compte-2 | Page du compte de Hugo : rôle Utilisateur, « Les listes sont toujours là », Notes, Projets, création, Assistants IA autorisés |
| nouveau-compte-1 | « Nouveau compte » : le rôle (Invité choisi), les fonctions autorisées au départ (Projets seul), identifiant, nom |
| invite-accueil-vide-1 | **Nouveau** : Accueil de Max à sa première connexion, rien d'activé : l'invitation « Activez les projets dans Réglages › Fonctions » et la tuile Compte |
| invite-fonctions-1 | **Nouveau** : Réglages › Fonctions de Max : la seule ligne « Projets » (désactivée), « Seules les fonctions que l'Admin a autorisées… » |
| invite-accueil-1 | Accueil de Max, projets activés : tuiles Projets et Compte, chacune sur toute la largeur |
| invite-projets-1 | Projets de Max (activés) : seulement « DomoPi Articles », sans « + » ; bandeau à trois boutons |
| invite-reglages-1 | Réglages de Max : réduits (Fonctions « Projets », pas d'Administration) ; pastille et encadré « Compte invité » |
| partage-admin-1 | Guillaume partage « DomoPi Articles » : Max et Inès (« Invité · discret »), l'avertissement « Hugo verra Max et Inès… » |
| partage-famille-1 | Léa partage sa liste « Courses » : Guillaume, Hugo, Zoé ; ni Max ni Inès |
| pc-invite-1 | Max sur ordinateur (projets activés) : menu de gauche réduit (Accueil, Projets, ses projets), « DomoPi Articles » ouvert en Contributeur |
| pc-admin-comptes-1 | Administration › Comptes sur ordinateur : la liste à gauche, la page de Max à droite (rôle, fonctions autorisées ; sécurité) |

Les nouveaux composants sont dans `design/comptes/listo-comptes.css` (sections 16.48 à 16.51, variables du kit seulement). Aucune nouvelle icône (`#i-eye-off`, `#i-user`, `#i-users`, `#i-shield`, `#i-layers` existent).

## 17. Questions au propriétaire

**Répondues le 25 novembre 2026** :

- « Un seul interrupteur « Compte discret » pour les deux sens ? » : **c'est le rôle Invité**, toujours discret dans les deux sens.
- « Préréglages « Famille » et « Invité » ? » : **c'est le rôle** qui donne les autorisations de départ.
- « La case de l'Admin active-t-elle la fonction ? » : **non, elle l'autorise** ; la personne l'active dans Réglages › Fonctions (Utilisateur et Invité).
- « Listes pour un Utilisateur ? » : **toujours là**, sans case ni interrupteur.
- « Listes autorisées pour un invité ? » : **comme les autres fonctions** : un interrupteur « Listes » dans ses Fonctions, désactivé au départ (règle retenue, 4.1).

**Répondues ensuite (décisions finales, section 19)** : toutes les questions ci-dessous ; la réponse retenue est indiquée après chacune (« → »).

1. **Qui voit un invité dans son annuaire ?** Seulement l'Admin, ou aussi des personnes choisies (« Visible aussi par : Hugo ») pour qu'un proche puisse lui partager son propre projet ? — *Recommandé : seulement l'Admin pour commencer ; « Visible aussi par… » plus tard si le besoin vient (une petite table, une ligne dans la page du compte).* → **Seulement les Admin.**
2. **Dans un projet partagé, les membres se voient** (Hugo voit Max dans « DomoPi Articles », et inversement), avec un avertissement dans « Partager » ? — *Recommandé : oui (option A de 5.3) ; pour un projet vraiment à part, ne pas y mettre de proche.* Un invité peut-il partager ses propres choses ? Son annuaire est vide : *non, c'est l'Admin qui partage avec lui.* → **Oui, les membres se voient, sans avertissement** ; un invité ne partage **jamais** ce qu'il possède.
3. **Invité « projets seulement » : l'écran Échéances ?** Sans (trois boutons : Accueil, Projets, Réglages ; les cartes urgentes sont dans la tuile Projets) ou avec, pour les seules cartes datées (quatre boutons) ? — *Recommandé : sans.* → **L'écran Échéances existe pour un invité quand les Listes sont activées pour lui, ou quand un projet qu'il voit a l'option « Échéances » activée.**
4. **Autorisations de départ d'un nouvel invité** : Projets seul, sans création de projet ni assistant IA ? — *Recommandé : oui (« accès uniquement au projet en question ») ; l'Admin coche le reste au besoin.* → **Rien de coché** à la création ; une fonction cochée s'active aussitôt pour l'invité.
5. **Notes autorisées pour un invité : les étiquettes communes** (il verrait « Anniversaire Zoé » et la famille verrait les siennes) ? — *Recommandé : l'accepter et le dire sous la case (pas de nom de personne).* → Recommandation retenue (l'accepter et le dire).
6. **Listes autorisées pour un invité : la mémoire commune des articles** ? — *Recommandé : de même, l'accepter et le dire ; un filtrage par compte est possible plus tard (coût moyen).* → Recommandation retenue (l'accepter et le dire).
7. **Ancien membre invité** : quand Max quitte un projet, ses commentaires et l'historique gardent « Max » pour les autres membres ? — *Recommandé : oui (on doit savoir qui a écrit) ; un compte supprimé reste « Un ancien compte ».* → Recommandation retenue (oui).
8. **Aide** : la même pour tout le monde (avec des chapitres sur les listes qu'un invité n'utilise pas), ou cacher les chapitres des fonctions fermées ? — *Recommandé : la même (elle est aussi publiée sur le site) ; l'Accueil et les menus suffisent à guider un invité.* → Recommandation retenue (la même aide pour tous).
9. **Nom affiché** : choisi par l'Admin, prénom seul ? Et corriger les deux constats (identifiant de connexion, suppression d'un compte, 3.3) dès l'étape 1 ? — *Recommandé : oui aux deux.* → Oui aux deux : corrigés à l'étape 1.
10. **Utilisateur → Invité : les autorisations** restent telles quelles (l'Admin décoche ensuite), ou reviennent à « Projets seul » ? — *Recommandé : telles quelles, montrées dans la confirmation (rien n'est retiré en silence).* → Telles quelles, montrées dans la confirmation.
11. **Admin → Invité directement** : interdit comme Invité → Admin (passer par Utilisateur) ? — *Recommandé : oui, interdit dans les deux sens.* → Interdit dans les deux sens.
12. **Le rôle Invité en base** : une colonne `guest` à côté du rôle, ou une troisième valeur de `role` (recréation de la table des comptes) ? — *Recommandé : la colonne `guest` (8.1).* → Colonne `guest`.
13. **Ordre** : commencer par l'étape 1 seule, essayer avec Max et Inès, puis les étapes 2 et 3 ? Ou, en attendant, une seconde installation pour DomoPi ? — *Recommandé : étape 1, puis 2 et 3 ; la seconde installation seulement si c'est urgent.* → Les trois étapes à la suite, sans attendre de validation entre elles ; **une seule PR à la fin** ; le propriétaire essaie le tout à la fin.

## 18. Décisions du propriétaire (25 novembre 2026)

Après le premier cadrage (qui proposait des préréglages « Famille » et « Invité » et un interrupteur « Compte discret »), le propriétaire a décidé :

1. **Pas de sélecteur de préréglage** : c'est le **rôle** qui donne le réglage (6).
2. **Trois rôles** : **Admin** (tous les droits, rien à régler) ; **Utilisateur** (la famille : accès possible à tout, l'Admin peut choisir les fonctions auxquelles il a accès) ; **Invité** (l'Admin choisit ce qu'il peut voir et utiliser : Listes, Notes, Projets, création de projets ou non, Assistants IA) (4.1).
3. **Un invité est automatiquement discret**, dans les deux sens, sans interrupteur (5.1).

Puis, le même jour :

4. **La case de l'Admin autorise, elle n'active pas** : « cocher une fonction pour un utilisateur ne lui active pas forcément la fonction, après il a le choix de l'activer ou non » ; la personne active ou non dans Réglages › Fonctions, comme aujourd'hui (Notes activées, Projets désactivés au départ) ; une fonction non autorisée disparaît de sa page Fonctions et le serveur la refuse (4.1, 4.2).
5. **Les Listes sont toujours là pour un Utilisateur** (ni case, ni interrupteur) (4.1).
6. **Pour un invité, de même** : une fonction autorisée, il l'active lui-même ; les Projets sont donc désactivés à sa première connexion, et l'Accueil l'invite à les activer (4.4). Pour les Listes autorisées à un invité, la règle retenue est la même que pour les autres fonctions : un interrupteur « Listes » dans ses Fonctions, désactivé au départ (colonne `lists_enabled`, 8).

Ce qui en découle dans ce cadrage : en base, **colonne `users.guest`** recommandée plutôt qu'une troisième valeur de `role` (8.1 ; décision à confirmer, question 12) ; pas de colonne `discreet` ; colonnes d'autorisation `*_allowed` (Admin) à côté des interrupteurs `*_enabled` (personne), fonction utilisée = autorisée ET activée ; un invité ne devient pas Admin directement (6.1) ; les étapes deviennent : 1. rôle Invité et annuaire discret, avec les deux constats ; 2. fonctions autorisées (Notes, Projets, création de projets, Assistants IA) ; 3. Listes des invités (13).

## 19. Décisions finales du propriétaire (25 novembre 2026)

Après la relecture du cadrage, le propriétaire a demandé de construire les trois étapes à la suite, sans attendre sa validation entre elles, avec **une seule PR à la fin** (il essaie le tout à la fin). Ses décisions, qui **l'emportent sur le reste du document** :

1. **Trois rôles, montrés partout** : « Admin », « Utilisateur », « Invité ». En base : `users.role` ('admin' ou 'user') et une colonne à part `users.guest` (0 ou 1, contrainte `guest = 0 OR role = 'user'`), lues par une seule fonction, `accountRole()` ; pas de recréation de la table des comptes.
2. **Un invité est toujours discret, dans les deux sens, par son rôle** (aucun interrupteur) : absent de l'annuaire de tout le monde **sauf des Admin** ; il ne voit personne dans le sien. Les membres d'une chose partagée avec lui (projet, liste, note) se voient dans cette chose : c'est normal, **sans avertissement** dans « Partager ».
3. **« Fonctions autorisées »**, réglées par l'Admin dans la page du compte :
   - Utilisateur : Listes toujours là (sans case) ; cases Notes, Projets, « Peut créer ses propres projets », Assistants IA, **toutes cochées au départ** (ce qu'ont aujourd'hui les comptes existants). Une case **autorise** seulement : l'Utilisateur active Notes et Projets lui-même dans Réglages › Fonctions (comme aujourd'hui) ; décochée, la fonction disparaît de ses Fonctions et le serveur la refuse.
   - Invité : cases Listes, Notes, Projets, « Peut créer ses propres projets », Assistants IA, **rien de coché à la création** ; quand l'Admin coche Listes, Notes ou Projets pour un invité, la fonction **s'active aussitôt** pour lui (interrupteur à 1) ; il peut l'désactiver lui-même ensuite dans ses Fonctions.
   - « Peut créer ses propres projets » et « Assistants IA » sont des **permissions** (sans interrupteur personnel).
4. **Un invité ne partage jamais ce qu'il possède** : ni « Partager » pour ses listes, notes et projets (ni personnes, ni lien public), le serveur refuse (même réponse que pour une action interdite) ; il peut être ajouté par l'Admin, et les membres de ce qu'on lui partage le voient là.
5. **Invité et Échéances** : l'écran (et son bouton) existe pour un invité quand les Listes sont activées pour lui, ou quand au moins un projet qu'il voit a l'option « Échéances » activée (ses cartes suivent la règle existante « Afficher dans Échéances »).
6. **Changements de rôle** : Utilisateur ↔ Invité avec une confirmation qui dit ce qui change (discret / de nouveau visible) ; Admin ↔ Invité jamais directement (passer par Utilisateur). Utilisateur → Invité garde ce qui est autorisé et activé (montré dans la confirmation) ; refusé si une liste d'envies lui est destinée.
7. **Les deux constats sont corrigés à l'étape 1** : l'identifiant de connexion (`username`) n'est plus envoyé aux autres comptes (annuaire, membres : le nom affiché seulement) ; `accountUsed` (`server/routes/admin-users.js`) compte les projets (un compte qui n'a servi qu'aux projets n'est plus « jamais utilisé »).
8. **Les autres questions** (section 17) : les recommandations du document.

### 19.1 Ce qui change dans ce document

Les sections 1 à 18 ont été reprises sur ces points : réponse courte, 4.1 (invité : rien de coché, cochée = activée aussitôt), 4.3 (Échéances, « Personnes »), 4.4 (première connexion), 5.3 (option A sans avertissement), 5.4, 5.7 (un invité ne partage jamais), 6 et 6.1, 7.2, 7.3, 8 (migrations 48 et 49), 9, 13 (une seule PR), 17 (réponses). Les maquettes `partage-admin-1` (avertissement) et `invite-accueil-vide-1`, `invite-fonctions-1` (invité qui active lui-même) restent comme planches de travail ; l'avertissement n'est pas construit.

### 19.2 Choix faits pendant la construction, quand le document ne disait rien

- **Annuaire d'un invité** : vide (pas même lui-même) ; celui d'un Admin donne le rôle de chacun (`role`), celui d'un Utilisateur seulement le numéro et le prénom.
- **Un compte qu'on ne voit pas** : `setMembers` (listes, notes, projets) et le destinataire d'envies (`list.create`, file d'attente comprise, et la conversion) répondent exactement comme pour un numéro inconnu (400 `ops.utilisateurInconnu`) ; un membre déjà présent qu'on ne voit plus peut rester, changer de droit ou être retiré.
- **Invité propriétaire** : `PUT …/members` (listes, notes, projets) et `PUT …/share` (listes, notes) répondent 403 « Un compte invité ne peut pas partager : l'Admin s'en charge. » ; arrêter un ancien lien (`DELETE …/share`) reste permis. Au passage Utilisateur → Invité, ses liens publics (listes et notes) sont arrêtés (journal `public_link_stopped`, `reason: account became a guest`).
- **Destinataire d'envies** : pour l'Admin, refus nommé « Un invité ne peut pas recevoir une liste d'envies. » ; pour la famille, « compte inconnu ». Passage en invité refusé tant qu'une liste d'envies lui est destinée, **corbeille comprise** (409, avec le nombre).
- **Changement de rôle** : journal `admin_role_changed` avec `role` et `previous` ; les appareils connectés relisent leur annuaire (« event: refs », sans données). Les changements Utilisateur ↔ Admin gardent le fonctionnement d'avant (sans question).
- **Page d'un compte** : `#/administration/comptes/<id>` ; sur ordinateur, à droite de la liste ; la liste des comptes garde le bouton ⋮ sur le téléphone (il ouvre la page). « Supprimer le compte » ramène à la liste.
- **Demande de compte (fournisseur d'identité)** : « Accepter » propose aussi Invité.

### 19.3 Étape 1 construite (25 novembre 2026)

Migration 47 (`users.guest`), `public/js/access.js` (`accountRole` et les règles des rôles), `server/directory.js` (`directoryFor`, `canSee`), contrôles des partages et du destinataire d'envies, invité qui ne partage jamais, plus d'identifiant de connexion envoyé, `accountUsed` qui compte les projets, Administration › Comptes (rôles, invités à part avec « Discret », page d'un compte, choix du rôle et confirmations, « Nouveau compte » avec le rôle), pastille « Invité » et encadré « Compte invité » dans les Réglages, « Invité · discret » dans la feuille « Partager » de l'Admin. Tests : `test/comptes.test.js` (dont « annuaire identique avec ou sans invités »). Restent les étapes 2 (fonctions autorisées) et 3 (listes des invités).

### 19.4 Étape 2 construite (25 novembre 2026)

Migration 48 (`users.notes_allowed`, `projects_allowed`, `projects_create`, `mcp_allowed` : 1 pour les comptes existants et un nouvel Utilisateur, 0 pour un nouvel invité), règles dans `public/js/access.js` (`defaultAllowed`, `normalizeAllowed`, `applyAllowedChange`, `mayCreateProjects`, `deadlinesShown`, `welcomeHint`) et `public/js/features.js` (`usedFeatures`, `screenFeatures`), une seule lecture côté serveur (`server/features.js` : `featuresFor` = fonctions utilisées, `allowedFor`, `setAllowed`, `initAllowed`), branchée sur la synchronisation (`features` et `allowed`), les opérations, les routes, les notifications, la page Notifications, les rappels, le résumé du matin et le MCP ; page d'un compte et « Nouveau compte » avec les cases ; Réglages › Fonctions réduit ; « Peut créer ses propres projets » et « Assistants IA » ; invitation de l'Accueil et règle de l'écran Échéances d'un invité (branchées avec « Listes toujours là » jusqu'à l'étape 3). Tests : `test/comptes-fonctions.test.js`, et le test « annuaire identique » étendu (l'Admin change les cases d'un invité).

Choix faits pendant la construction, quand le document ne disait rien :

- **Notes non autorisées** : le serveur les ferme entièrement (rien des notes dans la synchronisation, ni étiquettes communes ; toute opération et route des notes : 403 « Les notes ne sont pas ouvertes pour votre compte… »). **Autorisées mais désactivées** : exactement comme aujourd'hui (cachées des écrans de la personne, ni nouveautés ni notifications, MCP refusé), pour ne rien changer à la famille. Projets : non utilisés (non autorisés ou désactivés) = fermés comme aujourd'hui, avec un texte différent quand ce n'est pas autorisé (« c'est l'Admin qui les autorise »).
- **Une fonction non autorisée** ne s'active ni ne se désactive par la personne (403 « ops.fonctionNonAutorisee ») : son interrupteur reste tel qu'elle l'avait laissé.
- **Invité, case recochée** : réactivée aussitôt (règle « cochée = activée » de la section 19), même s'il l'avait désactivée avant que l'Admin la décoche. Un Utilisateur retrouve, lui, son interrupteur tel quel.
- **Assistants IA décochée** : les deux à la fois, la solution la plus sûre : toutes ses connexions sont révoquées tout de suite (journal `claude.revoked`, raison « AI assistants no longer allowed by the admin », et `revoked` dans `admin_access_changed`), et chaque appel de `/mcp` (et chaque renouvellement de jeton) revérifie la case (`liveGrant`). L'écran « Autoriser un assistant IA » répond 403 « Votre compte ne peut pas autoriser d'assistant IA… », l'accord aussi ; « Assistants IA » disparaît de Mon compte (`claudeUrl` absent).
- **« Peut créer ses propres projets »** : gardée telle quelle quand Projets est décoché (interrupteur grisé) ; elle ne compte que si les projets sont utilisés.
- **Confirmation d'un retrait** (Notes, Projets, Assistants IA) : sans nombres (l'Admin ne voit rien du contenu des autres) ; le retrait de « Peut créer ses propres projets » se fait sans question.
- **Confirmation « Faire un invité »** : dit ce qui est autorisé et, pour Notes et Projets, activé (l'Admin voit les fonctions *utilisées* d'un compte, `used`, jamais ses autres réglages).
- **Partage** : l'annuaire donne, pour chaque compte visible, ce que l'Admin lui autorise (`uses` : notes, projets) ; la feuille « Partager » d'une note ou d'un projet grise une personne qui ne l'a pas (« N'utilise pas les notes ») et le serveur refuse de l'ajouter (400 nommé : « Zoé n'utilise pas les projets. »). Un membre déjà présent reste.
- **Temps réel** : les cases d'un invité ne préviennent que ses appareils (« event: refs », sans données : la famille ne reçoit rien) ; celles d'un Utilisateur préviennent tous les appareils (les annuaires changent).
- **Ligne d'un compte** (Administration) : « Invité · Projets » (ouvert) ou « Utilisateur · sans projets » (retiré) remplace l'état de la 2FA, comme la maquette ; un compte désactivé le dit toujours.
- **Invitation de l'Accueil** : texte « aucune fonction » sans bouton quand rien n'est autorisé ; à l'étape 2 elle n'apparaît jamais (les Listes sont encore là pour tous).


### 19.5 Étape 3 construite (25 novembre 2026)

Migration 49 (`users.lists_allowed`, `users.lists_enabled` : lues pour un invité seulement ; 1 au départ, sans effet pour un Admin ou un Utilisateur, qui ont toujours les Listes ; 0 pour les invités créés aux étapes 1 et 2, le choix le plus sûr, aucun n'étant en service). Règles : `public/js/access.js` (`PERMISSIONS` avec `lists`, `permissionsFor` : la case « Listes » d'un invité seulement, `allowedChangeProblem` qui la refuse pour un Utilisateur, `welcomeHint` qui lit les fonctions montrées) et `public/js/features.js` (`lists` dans les fonctions, `FEATURE_ROUTES.lists`, `usedFeatures` avec le rôle, `offeredFeatures`, `screenFeatures` qui branche les Listes d'un invité sur la règle d'Échéances). Côté serveur, **un seul contrôle**, `listsRefusal` (`server/features.js`), repris par : les routes des listes, posé une fois devant elles (`server/app.js`, `LIST_ROUTE_PATHS` : `/api/lists`, `/api/items`, `/api/suggestions`, `/api/stores`, `/api/aisles`, `/api/push/mutes` ; l'annuaire `GET /api/users` n'en fait pas partie) ; les opérations `list.*`, `item.*`, `gift.*`, `habitual.*` (`LIST_OPS`, `server/lists.js`) ; la synchronisation (`syncBody`) ; `myLists` et `readList` (assistants IA, écran d'autorisation) ; les notifications (`allowed`, `server/notify.js`) et la page Notifications (`server/inbox.js`) ; le résumé du matin ; le temps réel (`server/events.js`) ; les outils MCP des listes (`server/mcp-tools.js`). Écrans : bandeau, tuiles, premier écran, menu de gauche, Corbeille (`singleTrash`), Réglages › Notifications, raccourcis, page d'un compte (ligne « Listes » en premier, maquette `admin-compte-1`), « Nouveau compte », confirmation « Faire un invité » (« Listes : autorisées, activées »). Tests : `test/comptes-listes.test.js` (dont toutes les routes et toutes les opérations des listes, une à une), et le test « annuaire identique » étendu (l'Admin retire puis rend les Listes d'un invité). Les trois étapes sont construites.

Choix faits pendant la construction, quand le document ne disait rien :

- **Invités déjà créés** (étapes 1 et 2) : Listes non autorisées et désactivées par la migration (aucun en service ; l'Admin coche « Listes » s'il le faut).
- **Utilisateur devenu invité** : il garde ses Listes, autorisées et activées (décision 6 : « garde ce qui est autorisé et activé ») ; la confirmation le dit ; l'Admin les décoche ensuite s'il le veut.
- **Listes autorisées mais désactivées par l'invité** : comme pour les projets, la seule notification remise est « Partage » d'une liste (page Notifications et téléphone), avec « Activez « Listes » dans Réglages › Fonctions pour la voir. », qui ouvre Réglages › Fonctions ; non autorisées : rien, pas même « Partage » (on ne peut d'ailleurs plus lui partager de liste : refus nommé pour l'Admin, « Max n'utilise pas les listes. », et « N'utilise pas les listes » sous son prénom dans « Partager »).
- **Temps réel** : un invité sans Listes ne reçoit ni « event: list » (pas même le numéro d'une liste), ni le « event: refs » des magasins, rayons et noms d'articles ; il garde le « event: refs » sans données de son propre réglage (l'Admin change ses cases) et des étiquettes des notes, utile s'il a les notes.
- **Recherche de l'ordinateur** (menu de gauche) : elle ne cherche que des listes ; sans Listes, le champ est caché (les projets ont leur propre recherche sur leurs écrans).
- **Touche N sans Listes** : « Nouvelle note » sur les écrans des notes, la carte ou le projet sur les écrans des projets, rien ailleurs (jamais de curseur mis tout seul) ; [ et ] sans effet.
- **Corbeille** : une seule corbeille utilisée (les projets d'un invité, par exemple) : elle s'affiche seule, sans onglets ; aucune : une phrase.
- **Accueil désactivé sans écran possible** (invité sans rien) : l'Accueil reste, avec son invitation.
- **Liens publics** (point ouvert de l'étape 2) : quand l'Admin décoche Notes (pour tout compte) ou Listes (pour un invité), les liens publics de ses notes ou de ses listes s'arrêtent tout de suite (journal `note_link_stopped` ou `public_link_stopped`, raison « notes no longer allowed by the admin » ou « lists no longer allowed by the admin ») ; la confirmation le dit ; recochées, ils ne reviennent pas seuls.
- **Assistants IA** : les cinq outils des listes refusent en premier, avec « Les listes ne sont pas ouvertes pour ce compte… » ou « … désactivées… » ; l'écran d'autorisation d'un compte sans Listes ne propose pas « Certaines listes » (une phrase : « Mes notes et mes projets ») ; « Assistants IA » de Mon compte ne nomme aucune liste.
- **Aide** : la même pour tous (décision du document) : rien n'y est caché.

### 19.6 Relecture de sécurité (25 novembre 2026)

Une relecture indépendante de la fonction a trouvé six points, corrigés sans rien changer pour la famille (tests : `test/comptes-secu.test.js`, un par point, qui échoue sans sa correction) :

- **Liens publics, course** : un lien protégé est créé après le calcul de son mot de passe, qui laisse la main ; l'Admin pouvait entre-temps faire de son propriétaire un invité, lui retirer Notes ou Listes, ou désactiver son compte, et le lien restait. Une seule règle, `publicLinkRefusal` (`server/features.js`), sert aux deux bouts : à la création (`server/shares.js`, `server/note-shares.js`, relue juste avant l'écriture, avec la réponse des contrôles habituels) et à chaque visite (`validShare` : propriétaire désactivé, invité, sans Listes pour une liste, sans Notes autorisées pour une note = la réponse d'un lien inconnu, sans dire pourquoi ; une lecture de sa ligne par requête).
- **Temps réel** : « event: note » ne part qu'aux comptes dont l'Admin autorise les notes, « event: project » qu'à ceux qui utilisent les projets (`server/events.js`). Choix : les mêmes règles que la synchronisation, donc des notes autorisées mais désactivées par la personne gardent le signal (elles se synchronisent comme avant), des projets désactivés ne le reçoivent plus (rien n'en est synchronisé).
- **Réglages des notifications** (`server/routes/push.js`) : `mutedLists` vide sans Listes, `mutedNotes` vide sans notes autorisées (même choix que la synchronisation) ; la sourdine d'une note répond comme les autres routes des notes (403 `ops.notesNonAutorisees`).
- **Accord d'un assistant IA** (`server/oauth.js`, `approve`) : le compte et sa case « Assistants IA » sont relus en base au moment d'écrire, après la vérification du mot de passe.
- **Journal** : `share_unknown_user` (`user`, `list`, `note` ou `project`, `count` : combien de numéros refusés ; jamais de nom) quand un partage ajoute un compte inconnu ou qu'on ne voit pas ; la réponse reste exactement celle d'un numéro inconnu (`directory.unseenCount`, `docs/exploitation.md`).
- **Page Notifications** (`server/inbox.js`) : le résumé du matin est caché à un compte qui n'utilise ni les listes ni les projets (la règle du résumé lui-même : tâches si les listes sont utilisées, cartes si les projets le sont).

Non changé (question de conception pour le propriétaire) : magasins, rayons et « Souvent ajoutés » d'un invité qui a les Listes.
