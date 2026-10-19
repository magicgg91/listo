# Listo – Cahier des charges

Version validée le 16 octobre 2026. Mise à jour du 17 octobre 2026 : photo par article, lien public en lecture seule et magasin « multi » (hypothèses à valider en fin de document), ainsi que les écarts constatés pendant les étapes 1 à 5 (tables et colonnes ajoutées, port publié, journal en fichier).

Mise à jour après livraison (17 octobre 2026) : les onze étapes sont livrées et le dépôt est public. Ce document décrit maintenant l'application livrée. Les décisions d'origine sont gardées ; ce qui a changé est indiqué dans le texte par « **Écart :** » et résumé dans la section [Écarts et décisions depuis la version validée](#écarts-et-décisions-depuis-la-version-validée). Quatre écarts touchant à la sécurité ont été tranchés le 17 octobre 2026 en faveur du code livré (texte mis d'accord avec le code, sans changement de code) ; ils sont marqués « **Décision du 17 octobre :** ».

## Présentation et objectifs

Listo est une application web de listes partagées (courses, tâches…), pensée pour le téléphone, gratuite, sans publicité et hébergée sur le serveur de son propriétaire. Elle remplace les applications existantes, soit payantes, soit remplies de pubs.

Usage visé : deux personnes d'un même foyer au quotidien (l'administrateur et un proche), avec la possibilité d'ajouter quelques comptes.

**Principes directeurs**

- **Mobile-first** : chaque écran est conçu d'abord pour un téléphone tenu à une main, dans un magasin. La version ordinateur est une adaptation du même écran.
- **Gratuit et privé** : aucune pub, aucun service tiers, aucune donnée hors du serveur. Seule exception, voulue et contrôlée : le lien public en lecture seule qu'un propriétaire peut créer pour une de ses listes.
- **Simple à comprendre** : HTML, CSS et JavaScript, sans framework. Tout choix plus complexe est justifié dans la section Architecture technique.
- **Fiable en magasin** : la liste reste utilisable sans réseau et se resynchronise toute seule.
- **Un seul conteneur Docker**, derrière Nginx Proxy Manager (HTTPS déjà géré par l'administrateur).
- **Interface en français uniquement.**

## Utilisateurs et rôles

Deux rôles seulement : l'Admin gère la configuration, l'Utilisateur se sert de l'application normalement. Les comptes sont créés par un Admin, il n'y a pas d'inscription libre.

| Action | Utilisateur | Admin |
| --- | --- | --- |
| Se connecter, changer son propre mot de passe, activer son 2FA | Oui | Oui |
| Créer ses listes, les renommer, les partager | Oui | Oui |
| Utiliser les listes partagées avec lui | Oui | Oui |
| Accéder à l'écran de configuration | Non | Oui |
| Créer, désactiver un compte, réinitialiser un mot de passe ou le 2FA | Non | Oui |
| Créer un magasin ou un rayon manquant (**écart, décision du 19 octobre 2026**) | Oui | Oui |
| Gérer catégories de liste, magasins et rayons (renommer, désactiver, supprimer, regrouper ; créer une catégorie) | Non | Oui |
| Ajouter, remplacer ou retirer la photo d'un article | Oui, sur les listes dont il est membre avec le droit « Peut modifier » | Oui, sur les listes dont il est membre avec le droit « Peut modifier » |
| Créer, modifier ou arrêter le lien public d'une liste | Oui, pour ses propres listes | Oui, pour ses propres listes |

**Droits sur une liste partagée**

- **Propriétaire** (le créateur) : tout, y compris renommer la liste, changer son icône (**écart, migration 14**), changer ses partages, créer et arrêter son lien public, et la supprimer.
- **Invité** : le propriétaire lui donne l'un de deux droits (**écart, décision du 18 octobre 2026, migration 12**) :
  - **« Peut modifier »** : ajouter, modifier, cocher et supprimer des articles, ajouter, remplacer ou retirer leur photo, tout décocher et retirer les articles cochés ;
  - **« Lecture seule »** : voir la liste, ses articles et leurs photos, et suivre les changements des autres en direct ; aucune écriture (le serveur refuse chaque modification).
  **Écart (décision du 19 octobre 2026) :** tout invité (même en lecture seule) peut quitter une liste ; le propriétaire ne le peut pas (il la supprime).
  **Écart (décision du 19 octobre 2026) :** le propriétaire et un invité « Peut modifier » peuvent dupliquer la liste (la copie leur appartient, sans invité ni lien public) ; pas un invité en « Lecture seule ».
  Dans les deux cas, il ne peut ni renommer ni supprimer la liste, ni modifier ses partages, ni gérer son lien public. Une personne ajoutée à une liste commence en « Lecture seule » ; les invités présents avant la migration 12 ont gardé « Peut modifier ». Le propriétaire a toujours tous les droits et ne peut jamais être mis en lecture seule.
- Un Admin ne voit pas les listes des autres : la configuration ne donne pas accès à leur contenu.
- Un Admin ne peut ni se désactiver, ni se retirer le rôle Admin, ni se supprimer : il reste toujours au moins un Admin actif.
- Le premier compte Admin est créé depuis l'écran de première connexion, avec le mot de passe choisi à ce moment. Aucun mot de passe n'est placé dans la configuration.

## Fonctionnalités

Listo gère plusieurs listes nommées, chacune partagée avec les personnes de son choix, et des articles classés par rayon avec autocomplétion. Tout est utilisable hors ligne.

**Listes**

- Une liste a un nom, une catégorie (Courses, Tâches…) et une liste de personnes avec qui elle est partagée. **Écart (migration 13) :** une liste autre que les courses a aussi deux réglages, « Priorité » et « Échéance », activés ou non par son propriétaire (voir la décision « Priorité et échéance activées ou non, liste par liste »).
- Les catégories sont éditables par l'Admin. Chacune porte un indicateur « liste de courses » : s'il est actif, la liste demande un magasin et classe ses articles par rayon.
- Le magasin se choisit dans la liste gérée par l'Admin. Un magasin simple est purement informatif : les rayons restent communs.
- Un magasin peut aussi être de type « multi » : il regroupe plusieurs magasins, pour les courses faites dans plusieurs boutiques (voir « Magasin multi » plus bas).
- Le propriétaire partage la liste avec les autres utilisateurs, et peut modifier ce partage à tout moment. Il peut aussi créer un lien public en lecture seule (voir « Lien public d'une liste »).
- Une liste dure : pas d'archivage en v1. Le propriétaire peut la supprimer, après confirmation.

**Articles**

- Champs : nom (obligatoire), quantité (texte court libre, ex. « 2 » ou « 500 g »), note (facultative), photo (facultative, une seule), rayon (listes de courses à magasin simple), magasin (listes dont le magasin est « multi », à la place du rayon).
- Ajout rapide : un champ de saisie toujours visible. La touche Entrée valide, le champ reste actif pour enchaîner plusieurs articles. **Écart (liste de courses) :** après un ajout, l'ajout se termine : champ vidé, clavier replié, article montré dans la liste (voir « Fin d'ajout »).
- Autocomplétion dès deux lettres, à partir de l'historique des articles déjà ajoutés, les plus fréquents d'abord. L'historique est commun à tous les comptes.
  - **Écart (décision du 17 octobre 2026) :** seules les listes de courses mémorisent des noms et en suggèrent. Une liste d'une autre catégorie (tâches…) n'écrit rien dans l'historique (ni ajout, ni renommage, ni rayon ou magasin) et n'affiche pas de suggestions ; la saisie y reste la même (Entrée ou + ajoute ce qui a été tapé). Raison : les éléments des autres listes sont très variés, plus simples à corriger un par un.
- Rayon automatique : un article déjà connu reprend son rayon habituel, celui du magasin de la liste (un même article peut avoir un rayon différent d'un magasin à l'autre). Un article nouveau demande son rayon une fois, puis l'application le mémorise. Le rayon reste modifiable.
- Tri : par rayon (ordre alphabétique, « Sans rayon » en dernier), puis par ordre alphabétique dans chaque rayon. Un rayon vide n'est pas affiché. Dans une liste à magasin « multi », il n'y a pas de rayon : les articles sont groupés par magasin (voir plus bas).
- **Écart (décision du 18 octobre 2026) : groupes repliables.** Chaque en-tête de groupe (rayon, magasin d'une liste « multi », priorité quand une liste autre que les courses est triée par priorité) est un bouton qui replie ou déplie ses lignes : chevron qui tourne, nombre à droite ; replié, « · 2 à acheter » (« · 3 à faire ») après le nom (**écart, décision du 19 octobre 2026 :** compteur « X/Y » à droite, ouvert comme replié ; voir « Compteur X/Y »). La zone des cochés se replie de la même façon. « Tout replier / Tout déplier » apparaît dans la barre d'état à partir de deux groupes. Aucune catégorie inventée : une liste en ordre alphabétique ou par échéance reste une liste simple, sans en-tête. L'état est mémorisé sur le téléphone, pour chaque liste (jamais envoyé au serveur), tout déplié par défaut ; un groupe qui n'existe plus est oublié. Ajouter un article depuis ce téléphone dans un groupe replié le déplie ; le temps réel, le scan, « Déjà dans la liste », cocher et le changement de tri gardent l'état et la position de défilement. La page publique du lien garde ses en-têtes simples.
- Cocher d'un appui : l'article reste affiché, barré, en bas de son rayon. Un appui de plus le décoche.
  - **Écart (décision du 17 octobre 2026, maquettes 1A, 4A, 5a) :** zone des articles cochés. Un article coché quitte son rayon (ou son magasin) pour une zone en bas de la liste, sous le dernier groupe : « Dans le panier · N » (courses) ou « Terminés · N » (autres listes), du plus récemment coché au plus ancien. Zone absente quand rien n'est coché ; un rayon dont tout est coché disparaît de la partie à acheter. L'en-tête de la zone se replie (ouvert par défaut, état mémorisé par liste sur l'appareil) et porte deux actions, absentes quand elle est repliée, chacune confirmée par une feuille du bas : « Tout remettre à acheter » / « Tout rouvrir » (décoche tous les articles cochés) et « Retirer du panier » / « Retirer les terminés » (supprime les articles cochés pour tout le monde, définitivement). Les deux sont permises à tout membre de la liste.
- Retirer les articles cochés : supprime tous les articles cochés de la liste, après confirmation (action « Retirer du panier » / « Retirer les terminés » de la zone des cochés).
- Modifier un article (nom, quantité, note, photo, rayon, magasin) et le supprimer : depuis un menu sur l'article.
- Vider ou supprimer un article n'efface pas l'historique d'autocomplétion.

**Magasin « multi »**

Pour les courses faites en ville dans plusieurs boutiques, l'Admin crée un magasin de type « multi » (par exemple « Courses en ville ») et choisit les magasins qu'il regroupe (par exemple la fromagerie, la boucherie, Leclerc).

- Dans une liste dont le magasin est « multi », chaque article a son propre magasin, choisi parmi ceux regroupés. Un article sans magasin est rangé dans « Sans magasin », en dernier.
- Pas de rayon dans une liste « multi » : le magasin joue ce rôle (boucherie, fromagerie, primeur, boulangerie…). Tri et affichage : par magasin (ordre alphabétique, « Sans magasin » en dernier), puis par ordre alphabétique. Chaque magasin a son en-tête.
- Magasin automatique : un article déjà connu reprend le magasin où il est habituellement acheté, parmi ceux de la liste (les œufs reviennent à la fromagerie). Le magasin est celui de l'article, pas celui de sa famille de produits : des pains à burger peuvent être achetés chez le boucher. Un article nouveau demande son magasin une fois, puis l'application le mémorise. Il reste modifiable.
- Un magasin « multi » ne peut pas en regrouper un autre « multi ». Désactiver un magasin regroupé le retire des choix, sans changer les articles qui l'utilisent déjà. Un magasin « multi » n'est proposé que pour les listes de courses.
- Une liste à magasin simple ne change pas : pas de choix de magasin par article.

**Photo d'un article**

- Chaque article peut avoir une seule photo, aussi bien dans une liste de courses que dans une autre liste (tâches…). Elle montre précisément le produit ou l'objet voulu (la bonne marque, la bonne référence).
- Depuis la feuille Article : un seul bouton « Ajouter une photo » (« Changer la photo » quand il y en a une) ouvre le sélecteur d'images du téléphone, qui propose lui-même l'appareil photo ou la photothèque ; Listo n'ajoute aucun menu (champ fichier `accept="image/*"` sans attribut `capture`). **Écart (décision du 19 octobre 2026) :** sur Android, une petite feuille propose d'abord « Prendre une photo » ou « Choisir dans la galerie » (voir la décision « Photo et scan sur Android »). La photo est facultative. Remplacer et retirer la photo sont possibles. Une vignette s'affiche sur la ligne de l'article ; un appui l'agrandit.
- La photo est réduite sur le téléphone avant l'envoi (côté le plus long : 1 280 px, JPEG), pour peser quelques centaines de Ko et ne pas ralentir une connexion mobile.
- Tous les membres de la liste voient la photo, ainsi que le visiteur d'un lien public valable de cette liste. Elle est supprimée avec l'article : le fichier est effacé définitivement lors du nettoyage des articles supprimés, après 30 jours.
- La photo appartient à l'article, pas à l'historique : le même nom ajouté plus tard n'a pas de photo.
- Hors ligne : on peut prendre une photo, elle part avec la file d'attente au retour du réseau ; seules les photos déjà vues s'affichent sans réseau.

**Lien public d'une liste**

Le propriétaire d'une liste peut la montrer à une personne qui n'a pas de compte (un voisin, un proche) par un lien, en lecture seule.

- Créer le lien : depuis le menu de la liste, « Partager par lien ». Le lien est une adresse du type https://listo.exemple.fr/p/… impossible à deviner. Un seul lien actif par liste.
- Lecture seule, strictement : la personne voit le nom de la liste et les articles groupés comme dans l'application, avec quantité, note, photo et état coché. Elle ne peut rien modifier. Elle ne voit ni les noms des personnes, ni les autres listes, ni l'historique.
- Mot de passe facultatif : le propriétaire peut protéger le lien. Le mot de passe est généré par Listo (16 caractères avec minuscule, majuscule, chiffre et caractère spécial) et affiché une seule fois, avec un bouton Copier. Il peut être régénéré (l'ancien cesse de marcher) ou retiré.
- Durée : le propriétaire choisit une durée en heures ou en jours, ou « illimité ». Passé ce délai, le lien cesse de fonctionner : le serveur le contrôle à chaque requête, sans dépendre du téléphone ni d'une page restée ouverte. Un lien expiré répond comme un lien qui n'a jamais existé.
- Le propriétaire voit l'état du lien (actif, date d'expiration, protégé ou non), peut changer la durée (le délai repart de maintenant) et peut l'arrêter à tout moment. Supprimer la liste, ou désactiver le compte du propriétaire, arrête le lien.
- La création et la gestion du lien demandent du réseau (indisponibles hors ligne).

**Administration** (rôle Admin uniquement)

- Comptes : créer, désactiver, réinitialiser un mot de passe (l'utilisateur doit alors en choisir un nouveau à sa connexion suivante), désactiver le 2FA d'un utilisateur qui a perdu son téléphone, choisir le rôle. Un compte jamais utilisé peut être supprimé.
- Catégories de liste, magasins, rayons : ajouter, renommer, désactiver. Un élément déjà utilisé ne peut pas être supprimé, seulement désactivé. Pour un magasin : choisir s'il est « simple » ou « multi » et, dans ce cas, les magasins qu'il regroupe.
- Données de départ fournies : catégories Courses et Tâches, trois magasins (Carrefour, E.Leclerc, Lidl) et douze rayons classiques, tous modifiables.
- **Écart (nouvelle fonction, 17 octobre 2026) :** noms enregistrés. L'Admin voit les noms de l'historique d'autocomplétion (une ligne par nom, avec rayon habituel, nombre d'utilisations et nombre de fois où il est présent dans les listes), les cherche (sans accents ni majuscules) et les trie (par nom, par utilisation), 50 à la fois. Il peut corriger un nom, avec confirmation chiffrée : l'historique et tous les articles des listes de courses portant ce nom (même nom une fois normalisé, sans correspondance approximative) prennent le nouveau nom, jamais les éléments des autres listes ; s'il existe déjà, les deux entrées sont fusionnées. Il peut aussi retirer un nom des suggestions, sans toucher aux listes.

**Compte**

- Changer son propre mot de passe, activer ou désactiver sa double authentification (2FA), choisir le thème (clair, sombre ou automatique selon le téléphone), se déconnecter.

## Écrans et parcours

Neuf écrans suffisent : les sept des utilisateurs, plus la feuille de partage par lien et la page publique. Le plus important reste l'écran d'une liste : il doit permettre d'ajouter et de cocher sans quitter le pouce du bas de l'écran.

| Écran | Contenu | Actions principales |
| --- | --- | --- |
| Connexion | Identifiant, mot de passe, puis code à 6 chiffres si le 2FA est activé. Session longue pour ne pas se reconnecter en magasin. Au tout premier lancement, l'écran propose de créer le compte Admin. | Se connecter |
| Mes listes (accueil) | Une carte par liste : nom, catégorie, magasin, nombre d'articles restants, personnes partageant. Tri par dernière activité. **Écart (décision du 19 octobre 2026) :** carte compacte, sans catégorie ni magasin (voir la décision « Carte d'accueil plus compacte »). **Écart :** bouton « ⋯ » dans le coin de chaque carte dont on est propriétaire (menu : « Supprimer la liste ») ; pas de bouton sans action. **Écart :** bouton de tri (icône seule, à côté des Réglages) qui bascule entre « Plus récentes d'abord » (par défaut) et « Ordre alphabétique » ; choix gardé sur le téléphone. **Écart :** l'indicateur de synchro / hors ligne est dans la barre du haut, entre le titre et les boutons (réduit à son icône si la place manque). | Ouvrir une liste, créer une liste |
| Liste | En-tête (nom, magasin, menu). Champ d'ajout. Articles groupés par rayon (par magasin si le magasin de la liste est « multi », sans rayon). Vignette de photo sur les articles qui en ont une. Indicateur de synchro / hors ligne. **Écart :** bouton « Scanner » (code-barres) à côté du champ d'ajout, listes de courses seulement. | Ajouter, cocher, tout décocher, retirer les cochés (zone « Dans le panier » / « Terminés »), actualiser, partager par lien |
| Article | Feuille qui monte du bas : nom, quantité, note, photo, rayon (magasin simple) ou magasin (si le magasin de la liste est « multi »). **Écart :** champ « Code-barres » (listes de courses) : une petite croix dans le champ pour l'effacer, et le bouton de scan (icône) sur la même ligne. Aides courtes à côté du titre : « Quantité (par exemple 2 ou 500 g) », « Code-barres (8, 12 ou 13 chiffres) ». **Écart :** « Enregistrer » et « Supprimer » sont des icônes dans l'en-tête de la feuille (poubelle, un espace, coche, croix), plus de boutons en bas. | Enregistrer, supprimer, prendre, choisir ou retirer la photo |
| Créer / modifier une liste | Nom, catégorie, magasin (simple ou « multi », si courses), partage avec les autres utilisateurs. **Écart :** sous chaque personne cochée, son droit (« Peut modifier » ou « Lecture seule », lecture seule par défaut) ; le propriétaire, sans choix, a « Tous les droits ». | Enregistrer, supprimer la liste |
| Réglages | Mot de passe, double authentification (activation par QR code, codes de secours), thème clair / sombre / auto, déconnexion. Lien vers l'administration pour un Admin. **Écart :** organisation en deux écrans. Réglages : carte du compte (ouvre « Mon compte »), Administration (Admin), « À propos » (une carte : version installée et, pour l'Admin, pastille d'état de la mise à jour ; développeur et projet), Se déconnecter. Mon compte : identité, Sécurité (mot de passe, double authentification), Apparence (thème), Ce téléphone (« Réinitialiser les données de ce téléphone »). | Changer le mot de passe, activer le 2FA, choisir le thème |
| Administration | Quatre onglets : Comptes, Catégories, Magasins, Rayons. Chacun liste ses éléments avec ajout, renommage, désactivation. Un magasin est « simple » ou « multi » (avec les magasins qu'il regroupe). **Écart :** un cinquième onglet « Noms » (noms enregistrés) : recherche, tri, corriger, retirer des suggestions. | Gérer les données de référence |
| Partage par lien | Feuille ouverte depuis le menu de la liste (propriétaire) : état du lien (actif, expire le…, protégé ou non), mot de passe généré affiché une seule fois, durée en heures, en jours ou illimitée. | Créer, changer la durée, régénérer ou retirer le mot de passe, copier le lien, arrêter le partage |
| Page publique | Page ouverte par le lien, sans compte : saisie du mot de passe si le lien est protégé, nom de la liste, articles en lecture seule avec photos. Lien expiré ou inconnu : message neutre. | Consulter, actualiser |

**Règles mobile-first**

- Zones tactiles d'au moins 44 px. Les actions fréquentes (ajouter, créer une liste) sont en bas de l'écran, à portée de pouce.
- Le champ d'ajout reste visible pendant le défilement de la liste.
- Aucun double-clic ni survol requis. Les actions secondaires passent par un menu, pas par des gestes cachés.
- Retour d'état toujours visible : un petit indicateur dit si la liste est à jour, en cours de synchro ou hors ligne.
- **Écart (17 octobre 2026) :** aucun curseur automatique. Listo ne met jamais le curseur dans un champ de saisie de lui-même (ouverture d'un écran, d'une fenêtre ou d'une feuille, mode d'édition, erreur, ajout) : le clavier ne s'ouvre que quand on touche un champ. Une fenêtre reçoit le focus sur elle-même ou sur son bouton principal ; Tab reste dans la fenêtre, Échap la ferme. Un champ fautif est signalé (aria-invalid, message relié par aria-describedby) sans recevoir le curseur.
- Application installable sur l'écran d'accueil (PWA), affichée sans barre de navigateur.

**Version ordinateur**

- Même application, même code. Sous 1024 px de large : une colonne. Au-delà : la liste des listes à gauche, la liste ouverte à droite, largeur du contenu plafonnée.

## Modèle de données

Treize tables SQLite. Les listes et les articles ont un identifiant UUID créé côté téléphone, pour pouvoir les créer hors ligne sans conflit d'identifiant.

| Table | Champs principaux | Remarques |
| --- | --- | --- |
| users | id, username (unique), display_name, password_hash, role (admin / user), active, totp_secret (chiffré), totp_enabled, totp_last_step, must_change_password, created_at | Un compte désactivé ne peut plus se connecter. must_change_password vaut 1 quand le mot de passe a été choisi par un Admin. totp_last_step empêche de réutiliser un code. Les codes de secours du 2FA sont dans une table recovery_codes (id, user_id, code_hash, used_at). |
| sessions | id (jeton aléatoire), user_id, expires_at, created_at | Le jeton est stocké haché. |
| categories | id, name, is_shopping, active | is_shopping active magasin et rayons sur la liste. |
| stores | id, name, active, is_multi | Liste commune gérée par l'Admin. is_multi = 1 pour un magasin « multi », qui regroupe d'autres magasins. |
| store_members | multi_store_id, store_id | Magasins regroupés par un magasin « multi ». Clé composée. Un magasin « multi » n'en regroupe pas un autre. |
| aisles | id, name, active | Rayons communs à tous les magasins. |
| lists | id (UUID), name, category_id, store_id (facultatif), owner_id, priority_enabled, due_enabled, created_at, updated_at, deleted_at | Suppression logique via deleted_at. **Écart (migration 13) :** priority_enabled et due_enabled (0 ou 1, contrainte CHECK) : priorité et échéance activées ou non pour une liste autre que les courses (une liste de courses les ignore) ; les listes existantes autres que les courses ont reçu 1 et 1 (rien ne change), les listes de courses 0 et 0 ; une nouvelle liste a 0 et 0 sauf choix contraire à sa création. **Écart (migration 14) :** icon, identifiant d'une icône de la liste blanche (public/js/list-icons.js), vide par défaut = icône de la catégorie ; les listes existantes ont reçu une valeur vide (elles gardent l'icône de leur catégorie). |
| list_members | list_id, user_id, access | Clé composée. Le propriétaire y figure aussi. **Écart (migration 12) :** access, droit de la personne sur la liste : 'modification' (« Peut modifier ») ou 'lecture' (« Lecture seule », valeur par défaut) ; contrainte CHECK ; les membres présents avant la migration ont reçu 'modification' ; le propriétaire a toujours 'modification' (le serveur ne compte d'ailleurs que lists.owner_id pour lui). |
| items | id (UUID), list_id, name, quantity, note, aisle_id (facultatif), store_id (facultatif), photo_at (facultatif), priority, due_date (facultatif), ean (facultatif), checked, checked_at (facultatif), created_by, created_at, updated_at, deleted_at | Suppression logique, pour que les autres téléphones apprennent la suppression. store_id sert aux listes à magasin « multi » (qui n'ont pas de rayon : aisle_id reste vide). photo_at est la date de la photo (vide = pas de photo) ; l'image est un fichier data/photos/<id de l'article>.jpg, pas un champ de la base. **Écart (migration 9) :** checked_at est la date du coché, posée par le serveur au premier coché et effacée au décoché ; elle ordonne la zone des cochés (les articles déjà cochés avant la migration ont reçu leur date de modification). **Écart (migration 10) :** priority ('low', 'normal' par défaut, 'high' ; contrainte CHECK) et due_date (date seule AAAA-MM-JJ, sans heure ni fuseau, ou vide) : priorité et échéance des éléments des listes autres que les courses ; les éléments existants sont en priorité normale, sans échéance. **Écart (migration 11) :** ean, code-barres d'un article de liste de courses, sous sa forme normalisée (8 ou 13 chiffres, UPC-A ramené en EAN-13 ; contrainte CHECK : vide, ou 8 ou 13 chiffres) ; les articles existants n'ont pas de code. |
| item_history | id, name_normalized, store_id (facultatif), display_name, aisle_id, use_count, last_used_at ; unique par article et par magasin | Alimente l'autocomplétion, le rayon automatique et le magasin automatique. Une ligne par article et par magasin : rayon habituel dans ce magasin (vide pour les listes « multi »). Une ligne sans magasin sert de valeur générale. |
| applied_ops | id (UUID de l'opération), user_id, result, applied_at | Opérations déjà appliquées : un renvoi après une coupure retrouve son résultat au lieu d'être appliqué deux fois. Nettoyée après 30 jours. |
| public_shares | id, list_id, token_hash, token_sealed (chiffré), password_hash (facultatif), expires_at (vide = illimité), created_by, created_at, revoked_at | Un seul lien actif par liste. Le jeton n'est jamais stocké en clair : son empreinte retrouve le lien, sa version chiffrée le réaffiche au propriétaire. Le mot de passe est haché (scrypt). |

**Règles**

- Les horodatages updated_at et deleted_at sont posés par le serveur, jamais par le téléphone, pour ne pas dépendre de l'heure du téléphone.
- Un téléphone demande « tout ce qui a changé depuis tel instant » : le serveur renvoie les lignes de ses listes dont updated_at est plus récent, suppressions comprises.
- Un nettoyage périodique supprime définitivement les lignes marquées supprimées depuis plus de 30 jours (avec les fichiers photo des articles concernés), les opérations appliquées de plus de 30 jours et les liens publics expirés ou arrêtés depuis plus de 30 jours.
- name_normalized = nom en minuscules, sans accents ni espaces superflus, pour que « Lait », « lait » et « Lait  » ne fassent qu'une entrée d'historique.
- Historique par magasin : pour un article ajouté dans une liste à magasin simple, on cherche d'abord la ligne de ce magasin, sinon la ligne générale (sans magasin). Dans une liste à magasin « multi », le magasin habituel est celui, parmi les magasins regroupés, où l'article a été le plus utilisé (le plus récent en cas d'égalité).
- Clés étrangères activées, index sur items(list_id, updated_at) et list_members(user_id).
- **Écart (migration 8, 17 octobre 2026) :** seules les listes de courses écrivent dans item_history. La migration 8 retire de l'historique les noms venus seulement des autres listes : un nom est effacé (toutes ses lignes) si aucun article d'une liste de courses ne le porte (actif, ou supprimé et pas encore purgé) et si aucune de ses lignes n'a jamais eu de rayon ni de magasin. Aucune table ne change.

## Synchronisation et mode hors ligne

Le téléphone garde une copie locale des listes, modifie d'abord cette copie, puis se synchronise avec le serveur. Le serveur prévient les autres appareils en temps réel.

**Temps réel (Server-Sent Events)**

- Quand une liste est ouverte, le téléphone ouvre une connexion SSE vers le serveur. Le serveur y envoie un message court à chaque modification d'une liste partagée (« la liste X a changé »).
- À la réception, le téléphone demande au serveur les changements depuis sa dernière synchronisation et met l'écran à jour.
- Filet de sécurité : rafraîchissement automatique toutes les 60 secondes quand l'application est au premier plan, à chaque retour au premier plan, et bouton de rafraîchissement manuel.
- La connexion SSE se rétablit seule après une coupure.
- **Écart :** le flux est ouvert dès que l'application est au premier plan (pas seulement quand une liste est ouverte) et fermé en arrière-plan, pour économiser la batterie. Reconnexion avec un délai croissant (de 1 à 30 secondes) ; 5 connexions au plus par compte.

**Hors ligne**

1. Un service worker met en cache l'application (pages, styles, scripts, icônes) : elle s'ouvre sans réseau.
2. IndexedDB conserve une copie locale des listes, articles, rayons, magasins, catégories et de l'historique d'autocomplétion. Les photos déjà consultées sont gardées dans le cache du navigateur (150 au plus, les plus anciennes partent d'abord).
3. Chaque action (ajouter, cocher, modifier, supprimer) s'applique tout de suite à la copie locale, puis entre dans une file d'attente enregistrée sur le téléphone.
4. Dès que le réseau revient, la file est envoyée dans l'ordre. Chaque opération porte un identifiant unique : un renvoi après une coupure n'est jamais appliqué deux fois.
5. Le téléphone récupère ensuite les changements des autres et met sa copie à jour.
6. Une photo prise hors ligne est gardée sur le téléphone avec sa place dans la file d'attente : elle est envoyée après la création de l'article correspondant, dans l'ordre, puis les opérations suivantes continuent.

**Conflits**

- Deux modifications du même article : la dernière reçue par le serveur gagne.
- Une suppression l'emporte sur une modification.
- Deux ajouts du même nom créent deux articles : pas de fusion automatique, c'est le comportement le moins surprenant pour des courses.
- Deux photos pour le même article : la dernière reçue remplace l'autre. Une suppression d'article l'emporte sur une photo envoyée après coup (la photo est alors ignorée et son fichier effacé).

**À savoir**

- Hors ligne, l'administration, le changement de partage d'une liste et la gestion du lien public sont indisponibles (boutons grisés avec une explication).
- Si la session a expiré pendant la coupure, l'application demande de se reconnecter sans perdre la file d'attente.
- L'indicateur d'état affiche : « À jour », « Synchronisation… » ou « Hors ligne · N en attente » (libellé de la maquette).

## Sécurité

Listo sera exposé sur Internet derrière Nginx Proxy Manager (HTTPS déjà en place). Le serveur doit donc se défendre seul, comme s'il était la seule barrière.

**Authentification et sessions**

- Identifiant + mot de passe, 10 caractères minimum. Pas d'inscription libre. Chaque utilisateur change lui-même son mot de passe depuis ses réglages, en saisissant l'ancien.
- Mots de passe hachés avec scrypt, fourni par Node sans dépendance (argon2id reste acceptable si une bibliothèque est préférée). Jamais stockés ni journalisés en clair.
- Session par cookie HttpOnly, Secure, SameSite=Lax. En production, les cookies de connexion portent le préfixe « __Host- » (__Host-listo_session, __Host-listo_2fa) : Secure, chemin /, sans domaine, impossibles à lire ou remplacer depuis un autre sous-domaine. Jeton aléatoire de 256 bits, stocké haché en base, valable 30 jours glissants.
- Une session est révoquée à la déconnexion, au changement de mot de passe et à la désactivation du compte.
- Limitation des tentatives : 5 échecs en 15 minutes pour un même identifiant ou une même adresse IP bloquent la connexion 15 minutes. Message d'erreur identique que l'identifiant existe ou non.
- Un mot de passe choisi par un Admin (création du compte, réinitialisation) est provisoire : l'utilisateur doit le remplacer par le sien à sa connexion suivante, avant toute autre action.
- Au changement de mot de passe, toutes les sessions du compte sont fermées, puis une nouvelle est ouverte pour l'appareil qui a fait le changement.

**Double authentification (2FA)**

- Facultative : chaque utilisateur l'active lui-même depuis ses réglages, personne ne peut l'imposer en v1.
- Norme TOTP (code à 6 chiffres renouvelé toutes les 30 secondes), compatible avec toute application d'authentification. Activation : affichage d'un QR code, puis saisie d'un premier code pour confirmer.
- 10 codes de secours à usage unique, affichés une seule fois à l'activation, stockés hachés.
- À la connexion, après le mot de passe, le code est demandé. Même limitation des tentatives que pour le mot de passe. Un code déjà utilisé est refusé.
- Désactiver son 2FA demande le mot de passe et un code. Un Admin peut le désactiver pour un utilisateur qui a perdu son téléphone et ses codes de secours.
- Le secret TOTP est chiffré en base (AES-256-GCM). La clé est générée au premier démarrage dans un dossier séparé de la base (secrets/secret.key, droits 600), monté à part dans le conteneur et exclu de la sauvegarde de la base.

**Création du premier Admin**

- Tant qu'aucun compte n'existe, l'écran de connexion propose de créer le compte Admin (identifiant et mot de passe choisis à ce moment). Dès qu'un compte existe, cette route est désactivée définitivement.
- L'application étant exposée sur Internet, un code de démarrage à usage unique est affiché dans les journaux du conteneur au premier lancement et demandé à la création, pour que personne d'autre ne prenne le compte Admin de vitesse. Les essais de code sont soumis à la même limitation des tentatives que la connexion.

**Autorisation**

- Chaque requête vérifie côté serveur le compte connecté, son appartenance à la liste concernée (list_members) et, pour les routes d'administration, le rôle Admin. Le téléphone n'est jamais cru sur parole.
- **Écart (migration 12) :** chaque écriture sur une liste ou ses articles vérifie aussi, dans la base et à chaque requête, le droit du compte : propriétaire, ou invité « Peut modifier ». Une seule fonction décide (canEdit, server/lists.js), utilisée par les opérations de /api/ops, l'envoi et le retrait des photos et le mode scan. Refus : 403 « Vous avez un accès en lecture seule à cette liste. », sans rien écrire ni annoncer. Un non-membre reçoit toujours la même réponse qu'avant (404), sans rien apprendre du droit des autres.
- Les modifications exigent un en-tête Origin correspondant au domaine de l'application (protection CSRF en complément de SameSite).
- Ordre des contrôles : origine (CSRF) d'abord, sur toutes les routes de l'API. Ensuite, un petit corps de requête (20 ko au plus) peut être lu avant la vérification du compte, sur toutes les routes sauf l'envoi des modifications (/api/ops) ; pour /api/ops, la session et le mot de passe à jour sont vérifiés d'abord, puis le corps (200 ko au plus) est lu. Une route qui exige un compte refuse ensuite une requête sans session. **Décision du 17 octobre :** règle écrite d'après le code livré (avant : « seules la connexion et la création du premier Admin lisent un petit corps sans session »).

**Entrées et affichage**

- Longueurs maximales validées côté serveur (nom 100 caractères, quantité 30, note 500).
- Requêtes SQL toujours paramétrées, jamais construites par concaténation.
- Texte affiché via textContent, jamais innerHTML, pour éviter l'injection de scripts.
- En-têtes, sur toutes les réponses : Content-Security-Policy stricte (ressources du même domaine uniquement, pas de script ni de style en ligne), X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy (fonctions du navigateur inutilisées interdites), Cross-Origin-Opener-Policy et Cross-Origin-Resource-Policy (same-origin), X-Robots-Tag: noindex, nofollow (et balise meta robots dans la page ; pas de robots.txt, qui empêcherait les moteurs de lire cette consigne). L'en-tête Strict-Transport-Security est ajouté par Nginx Proxy Manager.

**Exposition**

- Nginx Proxy Manager étant sur une autre machine, le conteneur publie un seul port sur l'hôte, lié à l'adresse du réseau local (IP_LOCALE:13300), jamais à toutes les interfaces. Un pare-feu qui limite l'accès à l'adresse de Nginx Proxy Manager est recommandé : sinon quelqu'un du réseau local pourrait falsifier l'adresse IP vue par Listo et contourner la limitation des tentatives.
- L'application fait confiance à l'en-tête X-Forwarded-For du seul proxy, pour connaître l'adresse IP réelle.
- Journal de sécurité (connexions réussies et échouées, blocages, actions d'administration, partages et changements de droit), sans mot de passe, jeton ni code. Il est écrit dans docker logs et dans data/journal.log (droits 600, rotation à 1 Mo, 5 anciens fichiers conservés).
- Aucun secret dans le code ni dans le dépôt. Aucun mot de passe en configuration : la clé de chiffrement est générée au premier démarrage.
- **Écart :** en production, Listo refuse de démarrer si LISTO_PUBLIC_URL n'est pas une adresse en https:// (le message est dans les journaux) : sans HTTPS, ni les cookies Secure, ni le mode hors ligne, ni l'installation sur le téléphone ne marchent.
- Le dépôt étant public, les failles se signalent en privé, selon [SECURITY.md](../SECURITY.md).

**Photos des articles**

- Accès : photos servies aux membres de la liste, et, pour une liste partagée par lien public, au visiteur qui présente un lien valable (jeton, mot de passe si demandé, lien non expiré), pour les seuls articles de cette liste ; métadonnées EXIF retirées. Pour un membre, même contrôle que pour l'article lui-même (compte connecté, membre de la liste) ; pour un visiteur, mêmes contrôles que pour le lien (/api/public/<jeton>/photos/<article>). Aucune autre adresse publique ni devinable. **Décision du 17 octobre :** texte mis d'accord avec le code livré (avant : « servie qu'à un compte connecté, membre de la liste »).
- Format : seulement du JPEG. Le serveur vérifie la signature du fichier et la structure de ses blocs, plafonne le poids (2 Mo) et les dimensions annoncées, et refuse tout le reste, quel que soit le type déclaré par le téléphone.
- Vie privée : le serveur retire les métadonnées du fichier (position GPS, modèle de l'appareil, date de prise de vue) en supprimant les blocs EXIF, sans bibliothèque supplémentaire. La réduction faite sur le téléphone les retire déjà.
- Stockage : fichiers dans data/photos, nommés d'après l'identifiant de l'article (jamais d'après un nom envoyé par le téléphone : aucun chemin choisi par l'utilisateur). Un fichier est effacé quand sa photo est remplacée ou retirée, ou quand son article est purgé.
- Envoi par une route dédiée, avec sa propre limite de taille (2 Mo) et un plafond d'envois par compte et par heure. Le lot d'opérations (/api/ops) accepte 200 ko et 100 opérations au plus par envoi, lus seulement après la vérification du compte. **Décision du 17 octobre :** valeurs réelles du code (avant : « quelques Ko »).
- Service : Content-Type image/jpeg et X-Content-Type-Options: nosniff. La Content-Security-Policy n'a pas besoin d'être assouplie (images du même domaine). La photo se choisit par le sélecteur du téléphone : aucun accès continu à la caméra n'est demandé au navigateur.

**Lien public d'une liste**

C'est la seule partie de Listo accessible sans compte : elle est donc traitée comme la plus exposée.

- Jeton : 256 bits aléatoires dans l'adresse (/p/<jeton>), impossible à deviner. Il n'est jamais écrit en clair en base ni dans les journaux (le journal cite l'identifiant du partage, pas le jeton).
- Mot de passe facultatif, généré par Listo : 16 caractères tirés avec le générateur aléatoire sécurisé de Node, avec au moins une minuscule, une majuscule, un chiffre et un caractère spécial (choisi parmi ceux faciles à saisir sur un téléphone). Haché avec scrypt, affiché une seule fois au propriétaire.
- Tentatives : même limitation que la connexion (5 échecs en 15 minutes, par lien et par adresse IP), plus un plafond de liens inexistants essayés par adresse IP (20 en 15 minutes). Message identique que le lien existe ou non.
- Après un mot de passe correct, le visiteur reçoit un cookie de consultation (HttpOnly, Secure, SameSite=Lax) limité à ce lien, valable 12 heures au plus et jamais au-delà de l'expiration du lien. Ce cookie ne donne aucun accès au reste de l'application. Il est invalidé par un nouveau mot de passe, son retrait, l'arrêt du lien et un redémarrage de Listo (gardé en mémoire seulement).
- Expiration : la date limite (expires_at) est fixée par le serveur à la création, avec son horloge. Elle est contrôlée à chaque requête (page, données, photos, saisie du mot de passe, cookie de consultation). Un lien expiré, arrêté, ou dont la liste est supprimée répond exactement comme un lien inconnu. Le nettoyage périodique supprime ces liens après 30 jours. Des tests avancent l'horloge pour le vérifier.
- Lecture seule, par construction : le visiteur n'atteint que des routes de lecture. Les réponses sont construites champ par champ, jamais à partir des objets internes. Aucune route de modification n'accepte un cookie de consultation. Champs envoyés, et rien d'autre :
  - la liste : nom, catégorie, nom du magasin (ou rien), regroupement (par rayon, par magasin ou aucun) ;
  - chaque groupe : nom du rayon ou du magasin (rien pour « Sans rayon » ou « Sans magasin »), puis ses articles ;
  - chaque article : nom, quantité, note, état coché, adresse de sa photo par le lien (ou rien) ;
  - **écart (17 octobre 2026) :** les articles cochés ne sont plus dans les groupes mais dans une partie « done », mêmes champs, du plus récemment coché au plus ancien (la date du coché n'est pas envoyée) ; la page publique les montre dans une zone « Dans le panier » / « Terminés » en lecture seule, sans repli ni action ;
  - la date d'expiration du lien (ou rien s'il est illimité).

  Aucun nom de personne, aucun identifiant de compte ni de liste, aucune autre liste ni historique. Seule exception : l'adresse d'une photo contient l'identifiant (UUID) de son article, qui ne donne accès à rien en dehors du lien. **Décision du 17 octobre :** liste des champs écrite d'après le code livré (avant : liste blanche sans la date d'expiration, les noms des groupes ni le regroupement).
- Validité, précisée dans le code : un lien n'est valable que si la liste existe encore, si son propriétaire est toujours actif et s'il en est encore le créateur.
- Clé perdue : si secrets/secret.key est perdue puis recréée, un lien existant marche encore, mais son adresse ne peut plus être réaffichée au propriétaire (version chiffrée illisible) : il faut l'arrêter et en créer un nouveau.
- Navigation : X-Robots-Tag: noindex, Cache-Control: no-store et Referrer-Policy: no-referrer (le jeton ne part pas vers d'autres sites). Le service worker ne met jamais en cache les pages ni les données du lien public.

## Architecture technique

Tout tient en HTML, CSS et JavaScript, côté téléphone comme côté serveur. La seule notion nouvelle est le SQL, un langage de requêtes très simple que Claude Code écrira et commentera.

| Brique | Choix | Pourquoi |
| --- | --- | --- |
| Interface | HTML, CSS, JavaScript natif (modules ES), sans framework ni étape de compilation | Lisible, modifiable directement, aucun outil à installer |
| Application installable | PWA : manifest + service worker | Icône sur l'écran d'accueil, ouverture sans réseau, sans passer par un store |
| Serveur | Node.js avec Express | Même langage que l'interface. Express est minimal et gère les connexions SSE simplement |
| Base de données | SQLite via better-sqlite3 | Un seul fichier, aucun serveur de base à administrer, largement assez pour quelques utilisateurs |
| Temps réel | Server-Sent Events | Natif dans le navigateur, reconnexion automatique, plus simple que les WebSockets |
| Stockage local | IndexedDB | Copie des listes pour le mode hors ligne |
| Photos | Fichiers JPEG dans data/photos, réduits sur le téléphone et contrôlés par le serveur | Base légère, aucune bibliothèque d'image à installer |

Trois dépendances côté serveur seulement : express, better-sqlite3 et qrcode (dessin du QR code de la double authentification). Le calcul des codes TOTP utilise le module crypto intégré à Node. Aucune bibliothèque côté interface, aucune bibliothèque d'image (les photos sont réduites sur le téléphone, puis contrôlées par du code simple côté serveur). Si un besoin futur exigeait un autre langage ou un framework, Claude Code doit d'abord le signaler et argumenter avant de l'introduire.

**Écart :** version de Node.js fixée à 24 (LTS, suivie à long terme). L'image de base node:24-slim est épinglée par son empreinte (sha256). Dependabot ne propose que ses correctifs ; le passage à une nouvelle version majeure se fait à la main, vers une version paire uniquement.

**Routes de l'API**

| Route | Rôle |
| --- | --- |
| GET /api/setup, POST /api/setup, POST /api/login, POST /api/login/2fa, POST /api/logout | Savoir s'il faut créer le premier Admin, le créer (tant qu'aucun compte n'existe), ouvrir la session, saisir le code 2FA, la fermer |
| GET /api/me, POST /api/me/password, /api/me/2fa (activer, vérifier, désactiver, image du QR code) | Compte connecté, changement de mot de passe |
| GET /api/lists, GET /api/lists/:id, GET /api/users, GET /api/suggestions | Mes listes, une liste et ses articles, comptes actifs (choix des invités), autocomplétion |
| GET /api/sync?since=… | Tout ce qui a changé depuis un instant donné, pour les listes de l'utilisateur et les données de référence |
| POST /api/lists/:id/leave | **Écart :** quitter une liste (invité, pour lui-même ; en ligne) ; propriétaire : 403 ; non-membre : 404 |
| POST /api/lists/:id/duplicate | **Écart :** dupliquer une liste (propriétaire ou invité « Peut modifier », en ligne) : corps { name, withItems } ; réponse 201 { list, copied } |
| POST /api/ops | Reçoit un lot d'opérations de la file d'attente (créer, modifier, cocher, supprimer un article ou une liste). Chaque opération a un identifiant unique |
| PUT, GET, DELETE /api/items/:id/photo | Envoyer (JPEG, hors du lot d'opérations), lire, retirer la photo d'un article (lire : membres de la liste ; envoyer, retirer : propriétaire et invités « Peut modifier ») |
| GET /api/events | Flux SSE de notification des changements |
| GET /api/about | **Écart :** version installée (commit de l'image) pour le bloc « À propos », et identifiant opaque de la version (rechargement des téléphones), comptes connectés seulement, jamais publique |
| PUT /api/lists/:id/members | Modifier le partage d'une liste et le droit de chaque invité (propriétaire, en ligne). **Écart :** corps { userIds, access } ; access associe un invité à 'modification' ou 'lecture' ; un invité ajouté sans droit précisé est en lecture seule, un invité déjà présent garde le sien |
| GET, PUT, DELETE /api/lists/:id/share | Lire l'état, créer ou modifier (durée, mot de passe), arrêter le lien public (propriétaire, en ligne) |
| POST /api/stores, POST /api/aisles | **Écart :** créer un magasin ou un rayon (tout compte connecté, en ligne) ; doublon : 409 ; 20 par heure et par compte |
| /api/admin/users, /categories, /stores, /aisles | Gestion des données de référence (Admin, en ligne) |
| GET /api/admin/update-check | **Écart :** une image plus récente existe-t-elle ? Le serveur demande à GitHub (Admin, en ligne) |
| GET /api/admin/names, GET /api/admin/names/impact, POST /api/admin/names/rename, POST /api/admin/names/remove | **Écart :** noms enregistrés : liste par morceaux, effet d'une correction (nombres), corriger partout, retirer des suggestions (Admin, en ligne) |
| GET /p/:jeton, GET /api/public/:jeton, POST /api/public/:jeton/acces, GET /api/public/:jeton/photos/:id | Page publique, données en lecture seule, saisie du mot de passe, photos : seules routes sans compte |

L'autocomplétion est calculée sur le téléphone à partir de la copie locale de item_history : elle marche donc hors ligne. La route GET /api/suggestions applique la même règle côté serveur (code partagé entre les deux).

**Structure du projet**

```text
listo/
  Dockerfile, docker-entrypoint.sh, .dockerignore
  docker-compose.yml, docker-compose.dev.yml
  package.json
  LICENSE, NOTICE, README.md, CONTRIBUTING.md, SECURITY.md
  server/
    index.js        démarrage, configuration, clé de chiffrement, arrêt propre
    app.js          assemblage : sécurité, API, fichiers statiques
    config.js, db.js, secrets.js    variables d'environnement, schéma SQLite et migrations, chiffrement
    auth.js, passwords.js, totp.js, twofactor.js, limiter.js, audit.js    connexion, sessions, 2FA, tentatives, journal
    validate.js     vérification des données reçues
    lists.js        listes, articles, historique, synchronisation
    photos.js       photos des articles (contrôle JPEG, stockage)
    shares.js       lien public (jeton, mot de passe, expiration)
    events.js       diffusion SSE
    backup.js       sauvegarde nocturne
    backup-now.js, admin-secours.js    commandes à lancer sur le serveur (sauvegarde à la demande, compte Admin perdu)
    pages/          les deux pages HTML du lien public (liste, lien expiré ou inexistant)
    routes/         auth, me, lists, photos, shares, public, admin (admin-users, admin-references)
  public/
    index.html      application
    manifest.webmanifest
    sw.js           service worker
    css/            variables de thème, styles
    js/             app, api, stockage local, file d'attente, règles partagées, écrans ; public.js pour la page publique
    icons/
  test/             tests automatisés (npm test)
  docs/             ce cahier des charges, guide d'exploitation, détails techniques, captures
  design/           kit de design et maquettes
  data/             volume Docker : base listo.db, sauvegardes, photos/, journal.log (jamais dans le dépôt)
  secrets/          volume Docker séparé : secret.key (jamais dans le dépôt)
```

**Écart :** la page publique n'est pas un dossier public/p/ : ses deux pages HTML sont dans server/pages/ et son script dans public/js/public.js. S'y ajoutent les fichiers de la sauvegarde, des commandes de secours, de la licence et de la documentation.
## Déploiement

Listo tourne dans un seul conteneur Docker, avec un dossier de données monté en volume. Nginx Proxy Manager, installé sur une autre machine, et le HTTPS restent gérés par l'administrateur : le sous-domaine est une simple variable.

```yaml
services:
  listo:
    image: ghcr.io/magicgg91/listo:latest   # construite par GitHub Actions
    container_name: listo
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=13300
      - TZ=Europe/Paris
      - LISTO_PUBLIC_URL=https://listo.exemple.fr
      - LISTO_DB_PATH=/data/listo.db
      - LISTO_KEY_PATH=/secrets/secret.key
      - LISTO_SESSION_DAYS=30
    ports:
      - "IP_LOCALE:13300:13300"        # adresse du serveur sur le réseau local, jamais 0.0.0.0
    volumes:
      - ./data:/data
      - ./secrets:/secrets
```

**Points d'attention**

- Nginx Proxy Manager étant sur une autre machine, il n'y a pas de réseau Docker partagé : Listo publie son port sur l'adresse du réseau local seulement (IP_LOCALE:13300). Dans Nginx Proxy Manager : schéma http, cette adresse et ce port ; le HTTPS s'arrête à Nginx Proxy Manager. Ouvrir Listo directement par http://adresse:port ne permet pas de se connecter (origine et cookie Secure refusés) : c'est voulu, l'accès normal passe par l'adresse publique.
- Le dossier data contient la base, les sauvegardes, les photos des articles (data/photos) et le journal de sécurité (data/journal.log).
- Nginx Proxy Manager limite par défaut le corps des requêtes à 1 Mo : pour l'envoi des photos (2 Mo au plus), ajouter dans l'onglet Advanced du proxy host : client_max_body_size 5m;
- Au premier démarrage, aucun compte n'existe : le premier accès à l'adresse de l'application propose de créer le compte Admin, avec le code de démarrage visible dans les journaux (docker logs listo). Aucun mot de passe n'est stocké dans la configuration.
- Le schéma de la base se crée et se met à jour automatiquement au démarrage (migrations numérotées).
- Route GET /healthz pour la surveillance (réponse simple, sans donnée).
- **Écart :** arrêt propre : à l'arrêt du conteneur (docker stop, mise à jour), Listo termine les requêtes en cours, ferme les flux temps réel et la base avant de s'arrêter.

**Flux SSE derrière Nginx Proxy Manager**

- Le serveur envoie l'en-tête X-Accel-Buffering: no sur le flux, et un signal de maintien de connexion toutes les 25 secondes.
- Ajouter aussi dans l'onglet Advanced du proxy host : proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s; (réglages complets de Nginx Proxy Manager : docs/exploitation.md, chapitre 3).
- Pour le reconnaître : un article coché sur un téléphone n'apparaît sur l'autre qu'au bout d'une minute environ (synchronisation de secours) au lieu de quelques secondes.
- **Écart (précision) :** le temps réel passe par une connexion HTTP ordinaire (SSE), pas par WebSocket : l'option « Websockets Support » de Nginx Proxy Manager n'est pas nécessaire. Ce qui compte, c'est de couper le cache et la mise en mémoire tampon pour /api/events (les lignes ci-dessus).

**Image Docker construite automatiquement**

- Un workflow GitHub Actions (`.github/workflows/docker.yml`) construit l'image et la publie sur ghcr.io/magicgg91/listo à chaque fusion sur main. Étiquettes : `latest` et `sha-<commit>` (pour revenir à une version précise).
- Sur le serveur, il suffit du docker-compose.yml : aucun code source à y copier. Le compose de production utilise `image:`, jamais `build:`.
- Le dépôt étant privé, l'image l'est aussi : le serveur s'y connecte une fois avec `docker login ghcr.io` (jeton GitHub limité à la lecture des paquets). Rendre le paquet public est possible, l'image ne contient ni base ni secret.
  - **Écart :** le dépôt et l'image ghcr.io/magicgg91/listo sont maintenant publics : plus besoin de `docker login` ni de jeton.
- Les actions du workflow et l'image de base sont épinglées par leur empreinte. Dependabot vérifie chaque semaine les dépendances du serveur, l'image de base et les actions, et ouvre des pull requests ; rien n'est fusionné automatiquement.
- Un fichier `.dockerignore` garde hors de l'image : data/, secrets/, .git, design/maquettes, node_modules, .env. **Écart :** aussi .github, design/photos, test/, docs/ et les fichiers *.log.
- Pour tester en local, un fichier docker-compose.dev.yml (avec `build: .`) est fourni à côté.

**Sauvegarde et mise à jour**

- Chaque nuit, l'application copie la base dans data/backups (commande SQLite VACUUM INTO) et garde les 14 dernières copies. Précisions du code livré : vers 3 h (fuseau TZ), copie vérifiée (PRAGMA integrity_check), lisible par Listo seul (droits 600), réussite ou échec notés dans le journal ; un échec n'arrête pas Listo.
- **Écart :** deux commandes à lancer sur le serveur, sous l'utilisateur node (elles refusent d'être lancées en root) : `server/backup-now.js` (sauvegarde à la demande, avant une mise à jour par exemple) et `server/admin-secours.js` (mot de passe provisoire, et retrait du 2FA si besoin, quand plus aucun Admin ne peut se connecter). Le dossier data (base, sauvegardes, photos, journal) est à inclure dans la sauvegarde habituelle de l'hôte : les photos sont de simples fichiers, absents de la copie de la base. La clé secrets/secret.key en est volontairement exclue : à copier une seule fois, à part (dans un gestionnaire de mots de passe, par exemple), car sans elle les secrets 2FA ne sont plus lisibles.
- Mise à jour : docker compose pull && docker compose up -d. Aucun code à récupérer sur le serveur. La base est conservée dans le volume.
- Procédures détaillées (installation, Nginx Proxy Manager, restauration, dépannage) : [docs/exploitation.md](exploitation.md).

## Brief visuel pour Claude Design

Listo doit paraître moderne, calme et bleuté, avec une lecture immédiate en magasin : grandes cases, texte net, peu d'éléments à l'écran. Il existe en thème clair et en thème sombre, avec les mêmes composants.

> Le design est livré : voir le dossier `design/` (kit HTML/CSS natifs, maquettes, icônes) et `design/README.md`. Cette section en garde le brief d'origine.

**Direction**

- Ambiance : bleu froid et doux, fonds quasi blancs en clair, bleu nuit profond en sombre. Un seul accent bleu vif, réservé aux actions et aux articles cochés.
- Formes : coins arrondis (12 à 16 px), cartes à plat avec bordure fine, ombres très légères, espacement basé sur 8 px.
- Typographie : police système (system-ui), donc aucun chargement externe. Corps 16 px minimum, jamais de texte sous 14 px. Titre de liste 20 à 22 px.
- Mouvement discret : cochage et ouverture de feuille animés en moins de 200 ms, désactivés si l'appareil demande moins d'animations.

**Palette de départ** (à affiner par Claude Design, en variables CSS nommées)

| Rôle | Clair | Sombre |
| --- | --- | --- |
| Fond | #F4F7FB | #0C1422 |
| Surface (cartes) | #FFFFFF | #131E31 |
| Texte | #0F1B2D | #E6EDF7 |
| Texte secondaire | #5B6B82 | #93A3BB |
| Bordure | #DCE4EF | #24324A |
| Accent | #2F6FED | #5B8DEF |
| Accent doux (fonds) | #E3ECFD | #1B2A47 |
| Succès | #1F9D6B | #3CC48E |
| Danger | #D64545 | #F06B6B |

**Composants à dessiner**

- Carte de liste (nom, catégorie, magasin, articles restants, pastilles des personnes).
- Ligne d'article : grande case ronde, nom, quantité, note discrète. État barré : texte atténué et barré, case remplie à l'accent.
- En-tête de rayon collant au défilement.
- Champ d'ajout rapide avec liste de suggestions (listes de courses seulement depuis le 17 octobre 2026).
- Feuille qui monte du bas (édition d'article, choix du rayon).
- Boutons principal, secondaire et danger. Bouton flottant de création.
- Indicateur de synchro à trois états : à jour, synchronisation, hors ligne avec nombre de modifications en attente.
- Interrupteur de thème, messages de confirmation, états vides, formulaires d'administration.

**À livrer**

1. Les sept écrans de la section Écrans, en thème clair et sombre, d'abord au format téléphone (390 × 844 px).
2. Les écrans « Mes listes » et « Liste » en version ordinateur (au-delà de 1024 px), sur deux colonnes.
3. L'icône de l'application (carrée, 512 px, version adaptée aux icônes rondes) : un logo simple évoquant une coche ou une liste, sur fond accent.
4. Les variables de thème et les composants sous une forme que Claude Code peut reprendre directement en CSS.
5. Mise à jour du 17 octobre 2026, dans le même style : vignette de photo sur une ligne d'article ; feuille Article avec photo (prendre, choisir, retirer, agrandir) ; liste « multi » groupée par magasin, sans rayon ; onglet Magasins de l'administration avec le choix simple / multi ; feuille « Partager par lien » (état, mot de passe généré affiché une fois, durée, copier, arrêter) ; page publique en lecture seule ; saisie du mot de passe du lien ; page « lien expiré ou inexistant ».

**Contraintes**

- Contraste de texte conforme WCAG AA, cibles tactiles d'au moins 44 px.
- L'information ne passe jamais par la couleur seule (un article coché est aussi barré).
- Textes de l'interface en français, courts, à l'infinitif ou au nom (« Ajouter un article », « Retirer du panier »).
- Vocabulaire : le mot « article » est réservé aux listes de courses ; dans toutes les autres listes (tâches…), on dit « élément », au masculin, avec les mêmes accords (« Ajouter un élément », « 3 éléments restants sur 8 », « Nouvel élément »). Un seul module de l'interface (public/js/words.js) donne le bon mot selon la catégorie de la liste.

## Plan de développement

Onze étapes, chacune livrable et testable seule. **Les onze étapes sont livrées.** Le magasin « multi » et les photos (étapes 6 et 7) passent avant le temps réel et le hors ligne : elles changent les données échangées et la file d'attente, mieux vaut les avoir en place avant de construire celles-ci. Les maquettes des nouveautés (voir « À livrer » du brief visuel) sont à produire avant l'étape 6.

| # | Étape | Contenu | Critère d'acceptation | État |
| --- | --- | --- | --- | --- |
| 1 | Socle | Projet Node et Express, SQLite et schéma, route /healthz, Dockerfile, .dockerignore, docker-compose.yml (production) et docker-compose.dev.yml (local) | docker compose up démarre, /healthz répond, la base apparaît dans ./data | Livrée |
| 2 | Comptes et sessions | Création du premier Admin à la première connexion, connexion, déconnexion, sessions, limitation des tentatives, changement de son propre mot de passe, double authentification TOTP facultative avec codes de secours | La 6e tentative ratée est bloquée. Un Utilisateur reçoit un refus sur les routes d'administration. Un compte avec 2FA exige son code après le mot de passe. L'écran de création du premier Admin disparaît dès qu'un compte existe | Livrée |
| 3 | Administration | Comptes (dont désactivation du 2FA d'un utilisateur), catégories, magasins, rayons, données de départ | Un élément déjà utilisé peut être désactivé mais pas supprimé | Livrée |
| 4 | Listes et articles | Création, partage, ajout, modification, cochage, retrait des articles cochés, tri par rayon, autocomplétion, rayon automatique | Un invité voit uniquement les listes partagées avec lui. « Lait » ajouté deux fois retrouve son rayon | Livrée |
| 5 | Interface mobile | Intégration des maquettes, thèmes clair et sombre, version ordinateur, PWA installable | Installable sur l'écran d'accueil. Zones tactiles d'au moins 44 px. Thème suivant le téléphone | Livrée |
| 6 | Magasin « multi » | Type de magasin « multi » et magasins regroupés (administration), magasin par article, tri par magasin, magasin habituel par article dans l'historique | Dans une liste à magasin « multi », « œufs » ajouté deux fois retrouve son magasin. Une liste à magasin simple se comporte comme avant | Livrée |
| 7 | Photos des articles | Route d'envoi JPEG, contrôle du fichier et retrait des métadonnées, stockage dans data/photos, prise ou choix de la photo, vignette, agrandissement, nettoyage | Une photo ajoutée sur un téléphone apparaît sur l'autre après actualisation. Un fichier qui n'est pas un JPEG valide est refusé. Un non-membre ne peut pas la lire | Livrée |
| 8 | Temps réel | Flux SSE, rafraîchissement régulier et manuel, indicateur de synchro | Un article coché sur un téléphone apparaît sur l'autre en moins de 3 secondes | Livrée |
| 9 | Hors ligne | Service worker, IndexedDB, file d'attente (photos comprises), gestion des conflits | En mode avion : 3 ajouts, 2 cochages et 1 photo. Au retour du réseau, tout apparaît chez l'autre utilisateur, sans doublon | Livrée |
| 10 | Lien public | Création, durée, mot de passe généré, arrêt, page publique en lecture seule avec photos | Un lien expiré ne fonctionne plus (horloge avancée dans les tests). Un visiteur ne peut rien modifier ni voir une autre liste. Le mot de passe est refusé après 5 essais | Livrée |
| 11 | Finitions | Vérification des en-têtes de sécurité, sauvegarde nocturne de la base (les photos, simples fichiers de data/photos, sont couvertes par la sauvegarde du dossier data de l'hôte), README, passage en production derrière Nginx Proxy Manager | Accessible en HTTPS sur le sous-domaine. Une sauvegarde est créée. Le README permet une réinstallation | Livrée |

**Après l'étape 11**

- Durcissement après un audit de sécurité : cookies de connexion préfixés __Host- en production, en-têtes Permissions-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy et X-Robots-Tag (noindex), connexion vérifiée avant de lire le lot d'opérations, Dependabot et épinglage des versions.
- Vocabulaire : « article » dans les listes de courses, « élément » dans les autres listes ; messages du serveur neutres.
- Bloc « À propos » dans les Réglages (route GET /api/about) et retour à Node 24.
- Licence Apache-2.0, fichiers NOTICE, CONTRIBUTING.md et SECURITY.md ; publication du dépôt et de l'image.
- README court, guide d'exploitation (docs/exploitation.md) et détails techniques (docs/developpement.md).
- Réglages › À propos : vérification de mise à jour sur GitHub (Admin) ; rechargement automatique des téléphones après une mise à jour du serveur.
- Administration : onglet « Noms enregistrés », pour corriger une faute de frappe partout (historique et listes de courses) ou retirer un nom des suggestions ; mémoire des noms et suggestions réservées aux listes de courses (migration 8).

**Tests automatisés** : 525 tests (`npm test`), tous réussis, mesurés le 19 octobre 2026. Ils couvrent en priorité les droits d'accès, la synchronisation, la file d'attente hors ligne, le lien public (horloge avancée), les photos, les en-têtes de sécurité, la sauvegarde, les commandes de secours, la vérification de mise à jour (GitHub simulé), le rechargement après une mise à jour et le mode scan (Open Food Facts simulé, lecture de codes-barres sur des images générées). Les vérifications à faire à la main sur le téléphone sont listées dans [docs/developpement.md](developpement.md#vérifier-linterface-sur-le-téléphone-étapes-5-à-10).

**Consignes pour Claude Code**

- Code simple et commenté en français. Pas de framework côté interface, pas de dépendance ajoutée sans demander.
- Si un autre langage ou une autre bibliothèque paraît plus adapté, le dire, expliquer pourquoi avec les éléments de comparaison, et attendre la décision avant de l'utiliser.
- Chaque étape se termine par des tests automatisés sur les points sensibles (droits d'accès, synchronisation, file d'attente hors ligne) et par un résumé en langage simple de ce qui a été fait.
- En cas d'ambiguïté dans ce cahier des charges, poser la question plutôt que deviner.

## Écarts et décisions depuis la version validée

Une ligne par écart, avec sa raison. Le code livré fait foi.

- **Node 24** (LTS), image node:24-slim épinglée par son empreinte ; Dependabot ignore les montées majeures de Node, faites à la main vers une version paire. Raison : version suivie longtemps, image reproductible.
- **Cookies __Host-** en production (session et 2FA en attente). Raison : un autre sous-domaine ne peut ni les lire ni les remplacer.
- **En-têtes de sécurité complétés** : CSP stricte, Permissions-Policy, COOP et CORP (same-origin), X-Robots-Tag noindex et balise meta robots, Referrer-Policy no-referrer partout. Raison : audit de sécurité avant publication.
- **Ordre des contrôles** : origine, puis session, avant de lire le lot d'opérations. Raison : ne rien analyser pour un visiteur non connecté.
- **Refus de démarrer sans https** en production. Raison : sans HTTPS, connexion, hors ligne et installation ne marchent pas.
- **Arrêt propre** à l'arrêt du conteneur. Raison : une mise à jour n'abîme rien.
- **Sauvegarde nocturne** vers 3 h (VACUUM INTO, copie vérifiée, 14 gardées, droits 600). Raison : précisions de l'étape 11.
- **Commandes de secours** backup-now.js et admin-secours.js, refusées en root. Raison : sauvegarde à la demande et reprise en main si plus aucun Admin ne peut se connecter.
- **Vocabulaire** : « article » seulement dans les listes de courses, « élément » ailleurs ; messages du serveur neutres. Raison : « article » sonnait faux dans une liste de tâches.
- **Bloc « À propos »** dans les Réglages et route GET /api/about, réservée aux comptes connectés. Raison : savoir quelle version est installée, sans la rendre publique.
- **Priorité et échéance des éléments** (listes autres que les courses, décision du 18 octobre 2026, migration 10). Raison : les listes de tâches ont besoin d'urgence et de date limite. Règles :
  - priorité « basse », « normale » (par défaut, rien d'affiché) ou « élevée » ; pastilles « ↑ Élevée » et « ↓ Basse » (icône et texte) ;
  - échéance : une date seule (AAAA-MM-JJ), sans heure, sans fuseau, sans rappel ; refusée par le serveur si ce n'est pas une vraie date entre 2000-01-01 et 2100-12-31 (pas d'heure, pas de chaîne vide ; null efface) ;
  - « Aujourd'hui », « Demain », « En retard » calculés sur le téléphone, dans son fuseau, recalculés à minuit et au retour au premier plan ; une échéance aujourd'hui reste « Aujourd'hui » toute la journée ; un élément coché ne montre jamais « En retard » ;
  - droits : comme les autres champs d'un élément (tout membre de la liste ; non-membre : 404 ; visiteur du lien : lecture seule). un invité en « Lecture seule » ne peut pas les changer (migration 12) ; chacune n'existe que si elle est activée pour la liste (migration 13) ;
  - refusées sur une liste de courses (rien n'est écrit, rien n'est annoncé) ; une liste qui devient de courses garde ses valeurs en base, sans les afficher ;
  - conflits : comme les autres champs, la dernière modification reçue par le serveur gagne, champ par champ ; un champ absent d'une opération ne change pas (un ancien téléphone ne remet rien à zéro) ;
  - pas d'entrée au journal (les modifications d'éléments n'y sont pas inscrites) ; nouvelles icônes du sprite : i-calendar, i-arrow-up, i-arrow-down.
- **Tri d'une liste autre que les courses** (18 octobre 2026). Raison : voir d'abord l'urgent ou ce qui arrive à échéance. Règles :
  - bouton « Trier la liste » (icône seule, 44 px) dans la barre du haut, absent des listes de courses (tri par rayons inchangé) ; un appui ouvre le menu existant avec trois choix exclusifs (coche ET texte sur l'actif) : « Ordre alphabétique » (par défaut, exactement l'ordre d'origine), « Par priorité » (groupes « Priorité élevée », « Priorité normale », « Priorité basse » avec en-tête, groupe vide sans en-tête, alphabétique dans chaque groupe), « Par échéance » (sans regroupement, dates passées d'abord, sans échéance à la fin, à date égale priorité élevée puis alphabétique) ; toast bref « Tri : … » ; l'icône du bouton montre le tri actif ;
  - seulement les éléments non cochés : les cochés restent dans leur zone ; décoché, un élément reprend sa place triée ;
  - choix gardé sur le téléphone, pour chaque liste (localStorage, clé listo-tri-liste-<identifiant>, valeur invalide → alphabétique ; tri des listes disparues oublié) ; rien sur le serveur : deux personnes peuvent trier différemment ; la page publique reste alphabétique ;
  - retrié après une synchronisation, une modification, et au changement de jour ; jamais pendant qu'un doigt est posé sur la liste.
- **Priorité et échéance activées ou non, liste par liste** (décision du 18 octobre 2026, migration 13). Raison : on n'a pas toujours besoin de la priorité ni de l'échéance. Règles :
  - deux réglages par liste autre que les courses, séparés : « Priorité » et « Échéance » (colonnes lists.priority_enabled et lists.due_enabled, 0 ou 1) ; une liste de courses n'a ni l'un ni l'autre (inchangé) ;
  - listes existantes autres que les courses : les deux activés (rien ne change, rien ne disparaît) ; nouvelle liste : les deux désactivés par défaut, y compris côté serveur (list.create sans réglage) ;
  - où : dans « Nouvelle liste » et dans « Modifier la liste », le même composant, « Options des éléments » : deux interrupteurs (role="switch", 44 px), chacun avec son nom et son état écrit (« Activée » / « Désactivée ») ; visibles seulement quand la catégorie choisie n'est pas une liste de courses, y compris quand on change la catégorie dans l'écran ; réservé au propriétaire (list.update, 403 pour un invité, même « Peut modifier ») ; réglage qui n'est pas vrai ou faux : 400 ;
  - réglage désactivé : il disparaît de l'interface de la liste (champ de la fiche, pastille de priorité, date d'échéance, « En retard »), de la fiche à consulter (lecture seule) et de la page publique (réponse construite champ par champ) ; le tri ne propose « Par priorité » ou « Par échéance » que si le réglage est activé, et le bouton de tri disparaît quand seul l'ordre alphabétique reste ; un tri gardé sur le téléphone devenu indisponible donne l'ordre alphabétique, sans erreur, et revient si le réglage est réactivé (il n'est pas effacé) ; plus de groupes de priorité, donc rien à replier ;
  - valeurs jamais effacées : désactiver cache seulement ; réactiver les fait réapparaître ;
  - serveur : écrire une priorité (ou une échéance, effacement compris) sur une liste où elle est désactivée est refusé avant toute écriture (400 « La priorité est désactivée pour cette liste. » ou « L'échéance est désactivée pour cette liste. »), d'après la base, à chaque requête ; une opération qui ne touche pas à ces champs passe ; file d'attente hors ligne : l'opération refusée est retirée (ni boucle, ni blocage des suivantes), message court « Cette option est désactivée pour cette liste. » ;
  - synchronisation : changer un réglage avance la date de modification de la liste et prévient ses membres en temps réel ; l'écran ouvert suit sans recharger, fiche comprise (le champ désactivé disparaît, il n'est pas envoyé à l'enregistrement, le curseur le quitte) ;
  - changement de catégorie : les réglages sont gardés tels quels dans la base. Une liste qui devient de courses les ignore (rien n'est affiché) ; si elle redevient une autre liste, elle retrouve ses réglages et ses valeurs. Une liste de courses qui devient une autre liste garde ses réglages enregistrés (désactivés pour une liste créée en courses) : le propriétaire les active dans le même écran s'il le souhaite. Aucune valeur n'est supprimée ;
  - mise à jour : la migration 13 se fait seule au démarrage ; faire une sauvegarde de la base avant de mettre à jour.
- **Clavier de l'iPhone et barre du haut fixe** (correction du 18 octobre 2026). Cause : l'iPhone fait remonter la zone visible quand le clavier s'ouvre ; l'application gardait sa hauteur et sa place, l'en-tête sortait de l'écran et une bande vide apparaissait. Correction : quand un champ a le curseur et que la zone visible est décalée (mesure du navigateur, aucune marque ni modèle), l'application recouvre exactement la zone visible (js/app-height.js, variables CSS --app-top et --app-h) ; sans décalage (Android), rien ne change ; clavier fermé, tout revient. L'application est posée sur l'écran (la page ne défile jamais), avec la marge de sécurité du haut ; sur chaque écran, la barre du haut est hors de la zone qui défile. Les champs qui ne sont ni un identifiant, ni un mot de passe, ni un code ont autocomplete="off" (plus de « Préremplir le contact »). Aucune migration. Le vrai clavier de l'iPhone reste à essayer (docs/developpement.md, point 25).
- **iPhone : suggestions, bandeau du haut, « Préremplir le contact »** (corrections du 19 octobre 2026). (A) Un appui sur une suggestion choisit la suggestion au relâchement du doigt (le click reste en secours, un seul ajout) ; la liste n'est ni redessinée ni fermée pendant le toucher ; la hauteur de l'application n'est jamais changée pendant qu'un doigt est posé. (B) Le thème choisi est posé avant le premier affichage (js/theme-boot.js) avec les balises color-scheme et theme-color, tenues à jour au changement de thème ; fond du thème sur <html> et <body> ; manifeste aux couleurs du thème clair (il ne peut pas suivre le thème choisi). (C) Les champs de nom de produit ou de libellé n'ont plus de libellé « Nom » et portent tous les mêmes attributs (dom.js, LABEL_INPUT). Le vrai iPhone reste à essayer (docs/developpement.md, points 26 à 28).
- **Dupliquer la liste** (décision du 19 octobre 2026). Raison : repartir d'une liste existante (courses de la semaine, liste de vacances). Règles :
  - action « Dupliquer la liste » (icône i-copy, déjà dans le sprite) dans le menu « ⋯ » d'une carte et dans le menu ⋮ de la liste (même code, list-actions.js), après « Modifier la liste » ; proposée au propriétaire et à un invité « Peut modifier », jamais à un invité en « Lecture seule » (le serveur refuse : 403 « Vous avez un accès en lecture seule à cette liste. » ; non-membre : « Liste introuvable », comme partout) ;
  - feuille « Dupliquer la liste » : « Titre de la liste » pré-rempli avec « <nom> (copie) » (100 caractères au plus), interrupteur « Copier les articles » / « Copier les éléments » activé, boutons « Dupliquer » et « Annuler » ; aucun curseur posé d'office ;
  - copié : catégorie, magasin, réglages de priorité et d'échéance ; avec l'interrupteur : les éléments non supprimés, avec nom, quantité, note, rayon, magasin, priorité, échéance et code-barres, tous décochés. Non copiés : les personnes invitées (la copie est privée, la personne qui duplique en est propriétaire), le lien public, l'historique des opérations, les éléments supprimés, et les photos (décision : un fichier ne peut pas faire partie de la transaction de la base, tout ou rien, et la copie échapperait au plafond d'envoi des photos ; il n'existe pas de quota de stockage). La mémoire des noms suit l'ajout habituel (listes de courses) ;
  - serveur : route POST /api/lists/:id/duplicate, une seule transaction, requêtes paramétrées, droit relu dans la base, 20 duplications par heure et par compte au plus (429 au-delà), aucun plafond d'éléments (il n'en existe nulle part ailleurs) ; journal « liste_dupliquee » (nom de compte, identifiants de la copie et de l'original, nombre d'éléments), jamais le nom ni le contenu ;
  - en ligne seulement : hors ligne, « Connexion nécessaire pour dupliquer une liste » ;
  - après : on reste où l'on est ; message « Liste « <nom> » créée » avec « Ouvrir » ; sur « Mes listes », la nouvelle carte est brièvement mise en évidence. Aucune migration.
- **Quitter la liste** (invité, décision du 19 octobre 2026). Raison : un invité ne pouvait pas se retirer d'une liste qui ne le concerne plus. Règles :
  - action « Quitter la liste » (icône i-logout, en rouge, en dernier) dans le menu « ⋯ » d'une carte et le menu ⋮ de la liste (même code) ; jamais pour le propriétaire, qui garde « Supprimer la liste » ; invité « Peut modifier » : « Dupliquer la liste », un trait, « Quitter la liste » ; invité en lecture seule : « Quitter la liste » seulement. Le bouton « ⋯ » d'une carte apparaît donc pour tout membre (jamais sans action) ;
  - confirmation « Quitter la liste « <nom> » ? », « Vous ne la verrez plus. Le propriétaire pourra vous inviter de nouveau. », boutons « Annuler » et « Quitter » (rouge) ; en ligne seulement (« Connexion nécessaire pour quitter une liste ») ; ce qui attend dans la file est envoyé d'abord ;
  - serveur : route POST /api/lists/:id/leave, sans identifiant de personne (on ne retire que sa propre appartenance, jamais celle d'un autre) ; propriétaire : 403 « Le propriétaire ne peut pas quitter sa liste. Supprimez-la à la place. » ; non-membre : « Liste introuvable » ; droit relu dans la base ; journal « liste_quittee » (nom de compte et identifiant de la liste) ;
  - effets : la liste disparaît de l'accueil et de la copie hors ligne de ses téléphones (temps réel, comme pour une personne retirée par le propriétaire) ; le propriétaire et les autres membres voient la liste de personnes à jour ; ses éléments restent dans la liste ; ses modifications encore en file pour cette liste sont refusées (« Liste introuvable ») et retirées, sans boucle ; si la liste est ouverte, retour à l'accueil, puis « Vous avez quitté la liste « <nom> » ». Aucune migration.
- **Créer un magasin ou un rayon manquant sans passer par l'Admin** (décision du 19 octobre 2026). Raison : un utilisateur qui ne trouvait pas son magasin ou son rayon devait demander à l'Admin. Règles :
  - tout compte connecté crée ; les magasins et rayons restent communs au foyer ; renommer, désactiver, supprimer, regrouper (magasin « multi ») et toutes les catégories restent à l'Admin (403 pour les autres) ;
  - où : dernière ligne « Nouveau magasin… » du choix du magasin (« Nouvelle liste », « Modifier la liste ») et du choix du magasin d'un article d'une liste « multi » ; « Nouveau rayon… » dans « Dans quel rayon ? » et dans le champ « Rayon » de la fiche d'un article. Une petite feuille, la même pour les deux (create-reference.js) : « Libellé du magasin » ou « Libellé du rayon » (attributs LABEL_INPUT, pas de « Nom »), « Créer ». Le champ ne prend pas le curseur tout seul (règle du projet : jamais de clavier ouvert d'office) ; le nouvel élément est ajouté au choix et sélectionné, il reste à confirmer ; la fiche ou le formulaire gardent ce qui était saisi ;
  - serveur (server/routes/references.js) : nom nettoyé, 100 caractères au plus ; pas de doublon (majuscules, accents, espaces multiples ignorés) : si l'élément existant est actif, 409 et la feuille propose « Choisir « … » » ; s'il est désactivé, 409 « … demandez à l'Admin de le réactiver » (rien n'est réactivé sans lui) ; 20 créations par heure et par compte (429) ; aucun plafond total (il n'en existe pas) ; requêtes paramétrées ; journal « magasin_cree » / « rayon_cree » (nom du compte, nom du magasin ou du rayon, jamais de contenu de liste) ;
  - droits : un rayon se crée depuis l'article d'une liste de courses que le compte peut modifier (un invité en lecture seule : 403) ; un magasin se crée pour une nouvelle liste ou pour une liste que le compte peut modifier ; pour l'article d'une liste à magasin « multi », le nouveau magasin rejoint aussi les magasins regroupés de ce « multi » (sinon il ne pourrait pas être choisi ; l'Admin peut l'en retirer) ;
  - position : ordre alphabétique, comme partout (il n'existe pas d'ordre choisi à la main) ; le système ne garde pas qui a créé quel magasin ou rayon (rien n'est ajouté) : l'Admin les voit comme les autres ;
  - temps réel : « event: refs », les autres téléphones les proposent sans recharger ; hors ligne : « Connexion nécessaire pour créer un magasin » / « … un rayon », le choix reste ouvert et l'article s'ajoute avec un rayon existant ou sans rayon, comme avant ;
  - au passage : une fenêtre ouverte par-dessus une autre passe maintenant au-dessus de son fond grisé (la fenêtre du dessous ne réagit plus aux appuis). Aucune migration.
- **Une icône au choix pour chaque liste** (décision du 19 octobre 2026, migration 14). Raison : reconnaître ses listes d'un coup d'œil. Règles :
  - « Nouvelle liste » et « Modifier la liste » : section « Icône » sous « Catégorie », grille de 35 icônes (cases de 44 px au moins, rôle radiogroup, chaque case avec son nom en français pour les lecteurs d'écran et en infobulle) ; l'icône choisie est entourée ET marquée d'une petite coche (jamais la couleur seule) ; aucun champ ne prend le curseur tout seul ;
  - au départ, la case cochée est l'icône de la catégorie (chariot pour les courses, liste cochée sinon), et elle suit la catégorie tant que rien n'est choisi ; si on ne touche pas à la grille, rien n'est envoyé : rien ne change ;
  - jeu d'icônes (même trait que le sprite, couleur héritée, aucune bibliothèque) : Courses, Panier, Sac, Magasin, Tâches, Agenda, Maison, Ménage, Repas, Café, Gâteau, Cadeau, Fête, Voyage, Valise, Voiture, Vélo, Travail, École, Livre, Outils, Bricolage, Jardin, Santé, Sport, Animal, Enfant, Vêtements, Budget, Idées, Musique, Films et séries, Jeux, Cœur, Étoile ; quatre étaient déjà dans le sprite (cart, store, tasks, calendar), 31 sont nouvelles (sprite et fichiers séparés dans design/icones/listes/) ;
  - données : colonne lists.icon (texte, vide par défaut) ; le serveur n'accepte qu'un identifiant de la liste blanche ou « » (retour à l'icône de la catégorie), sinon 400 « Icône inconnue. », à chaque écriture (list.create, list.update), requêtes paramétrées ; une valeur inconnue trouvée en base n'est jamais renvoyée ;
  - droits : comme le titre, seul le propriétaire la change (un invité : 403, quel que soit son droit) ; les invités la voient ; affichage par `<use href>` seulement, jamais de HTML ;
  - elle suit la duplication (copiée), le temps réel (list.update prévient les téléphones des membres) et la file d'attente hors ligne (la modification de liste y passe déjà : même règle que le titre) ; la page du lien public ne change pas (aucune icône envoyée) ;
  - affichage : sur la carte de « Mes listes », devant le titre ; dans l'en-tête de la liste, en petit (20 px, couleur secondaire) juste avant le titre, qui garde ses points de suspension ;
  - mise à jour : la migration 14 se fait seule au démarrage ; faire une sauvegarde de la base avant de mettre à jour.
- **Carte d'accueil plus compacte** (décision du 19 octobre 2026). Raison : une ligne de moins par carte, plus de listes visibles sans défiler. Règles :
  - la catégorie et le magasin ne sont plus sur la carte (ils restent dans la liste, sous son titre) ;
  - ligne 1 : icône de la liste, titre (deux lignes au plus, puis « … » ; le nom entier reste lu par les lecteurs d'écran), « il y a 3 h », bouton ⋮ (44 px) ;
  - ligne 2, à gauche : le compteur, puis le badge « Multi » quand il y a lieu, puis la pastille « Lecture seule » pour une liste partagée en lecture seule (icône et texte) ; à droite : le symbole du lien public quand la liste en a un en cours (propriétaire seulement, « Lien public actif » pour les lecteurs d'écran et en infobulle), juste avant les pastilles des personnes ; il n'apparaît plus ailleurs sur la carte ;
  - aucune ligne de plus qu'avant, une de moins quand le titre tient sur une ligne ; toute la carte reste la zone qui ouvre la liste ; classes de listo.css réutilisées (styles ajoutés dans public/css/app.css) ; aucune migration.
- **Compteur X/Y, sans texte** (décision du 19 octobre 2026). Raison : un chiffre se lit plus vite qu'une phrase. Règles :
  - carte de « Mes listes » : « X/Y », X = articles (ou éléments) restants à faire, Y = total des non supprimés, cochés compris ; liste vide : « Liste vide » ; tout coché : « 0/Y » avec la coche verte à côté (jamais la couleur seule) ;
  - dans une liste : l'en-tête de chaque groupe (rayon, magasin d'une liste « multi », priorité) montre « X/Y » du groupe, à droite, ouvert comme replié (« · 3 à acheter » disparaît) ; un article coché compte dans le Y du groupe qu'il avait avant d'être coché ; un groupe dont tout est coché quitte la partie à faire, comme avant ; une liste en ordre alphabétique ou par échéance reste sans en-tête ;
  - même format pour toutes les listes ; pour les lecteurs d'écran et en infobulle : « 3 articles restants sur 8 » (« éléments » hors courses ; singulier pour 0 et 1 : « 1 article restant sur 8 ») ; sur la carte, « …, tout est coché » en plus quand X vaut 0 ; chiffres alignés (tabular-nums), sans espace ;
  - les anciens textes « 11 articles restants », « Tout est coché » et « · 2 à acheter » / « · 3 à faire » ne sont plus affichés ; public/js/words.js donne les deux textes (progressText, progressLabel) ; la page du lien public ne change pas ; aucune migration.
- **Tri de « Mes listes »** (18 octobre 2026) : un bouton-icône bascule entre « Plus récentes d'abord » (le tri d'origine, gardé par défaut) et « Ordre alphabétique » (sans tenir compte des majuscules ni des accents, nombres dans l'ordre naturel). Raison : retrouver une liste par son nom. Règles : « récent » = dernière activité déjà connue (création ou renommage de la liste, ajout, modification, coche ou suppression d'un élément), aucune migration ; à égalité, ordre alphabétique ; choix gardé sur le téléphone (localStorage, clé listo-tri-listes), aucune donnée sur le serveur ; bouton masqué s'il y a moins de deux listes ; une synchronisation ne réordonne pas les cartes pendant qu'un doigt est posé dessus ; l'intérieur d'une liste ne change pas. Nouvelle icône du sprite : i-az.
- **Mode scan des listes de courses** (décisions du 18 octobre 2026). Raison : ajouter un produit du frigo ou d'un tiroir sans taper son nom. Règles :
  - bouton « Scanner » (icône i-barcode, nouvelle, 44 px au moins, « Scanner un produit ») à côté du champ d'ajout, listes de courses seulement ; il ouvre directement le sélecteur d'images du téléphone (même composant que la photo d'un article, un seul bouton, sans attribut capture : le téléphone propose l'appareil photo ou la photothèque) : scan sur une photo, pas de flux vidéo, ni getUserMedia, ni changement de Permissions-Policy ; « Code non lu » propose « Réessayer » (même sélecteur) ; un fichier qui n'est pas une image est refusé avec un message clair ;
  - le code-barres (EAN-13, EAN-8, UPC-A) est lu sur le téléphone, par zxing-wasm 3.1.4 copié dans public/vendor/ (dépendance côté navigateur validée : licences MIT et Apache-2.0 dans NOTICE, empreintes vérifiées par un test, jamais chargé depuis un CDN, absent de package.json) ; la photo n'est ni gardée ni envoyée, seul le numéro part ; le lecteur est téléchargé au premier scan, puis gardé : la lecture marche ensuite hors ligne ;
  - Content-Security-Policy des pages de l'application : 'wasm-unsafe-eval' ajouté (indispensable au lecteur WebAssembly ; jamais 'unsafe-eval') ; page du lien public inchangée ;
  - nom cherché par le serveur dans Open Food Facts (API v3), route POST /api/lists/<id>/products, code dans le corps : membres de la liste (non-membre : 404 ; invité en « Lecture seule » : 403, migration 12), listes de courses seulement, jamais pour le lien public ; code accepté seulement avec 8, 12 ou 13 chiffres et une clé de contrôle valide (UPC-A ramené en EAN-13) ; codes « en 2 » (propres à un magasin) jamais demandés ; adresse fixe, délai 5 s, réponse de 32 ko au plus, aucune redirection suivie (produit non alimentaire : inconnu), aucun cookie ; User-Agent « Listo/<version> (+https://github.com/magicgg91/listo) », contact facultatif LISTO_PRODUCT_CONTACT ; 30 recherches par minute et par compte, 10 demandes par minute au total vers Open Food Facts ; cache en mémoire sans migration (500 produits, 7 jours trouvé, 1 jour inconnu) ; ni le code ni le nom dans les journaux ; LISTO_PRODUCT_LOOKUP=off coupe tout et masque le bouton ;
  - nom proposé : product_name_fr, sinon product_name, sinon generic_name, nettoyé, 60 caractères au plus coupés entre deux mots, modifiable ; note « marque · format » ; quantité vide ; aucune photo de produit ; mention « Données : Open Food Facts » (licence ODbL) dans la fiche, dans « À propos » et dans la documentation ;
  - ajout comme un ajout normal (rayon ou magasin habituel, sinon demandé une fois ; file d'attente habituelle) ; même nom déjà dans la liste : « Déjà dans la liste » et « Ajouter quand même » ; après l'ajout, la feuille se ferme (toast « Ajouté : … ») ; pour un autre produit, on réappuie sur « Scanner » ;
  - code non lu, produit inconnu, réponse lente ou hors ligne : message simple, saisie à la main du code puis du nom (champs affichés sur appui, jamais de clavier automatique) ; le code n'est jamais écrit dans la note ;
  - nouvelle icône du sprite : i-barcode (40 icônes) ; nouvelle version du service worker.
- **Code-barres des articles** (listes de courses, décisions du 18 octobre 2026, migration 11). Raison : garder le code scanné ou saisi à la main. Règles :
  - un article a au plus un code, gardé sous sa forme normalisée (8 ou 13 chiffres, UPC-A ramené en EAN-13), vérifié par le serveur avec la clé de contrôle ; un code invalide est refusé, jamais enregistré tel quel ; une chaîne vide est refusée, null efface ;
  - le code n'est pas unique : deux articles peuvent porter le même (on prévient, on n'interdit pas) ;
  - droits : ceux de la modification d'un article (membres ; non-membre : 404 ; visiteur du lien : rien) ; refusé sur une liste autre que les courses, sans rien écrire ni annoncer (« Le code-barres ne se choisit que dans une liste de courses. ») ; une liste qui cesse d'être de courses garde ses codes en base, sans les afficher ;
  - conflits : comme les autres champs, la dernière modification reçue par le serveur gagne, champ par champ ; un champ absent d'une opération ne change pas (un ancien téléphone ne l'efface pas) ;
  - mode scan : le code lu ou tapé est enregistré avec l'article, que le produit soit trouvé ou non (jamais dans la note) ; « Déjà dans la liste » se déclenche aussi pour un article qui porte le même code (le code passe avant le nom), avec « Ajouter quand même » ;
  - feuille de l'article : champ « Code-barres » (clavier numérique au toucher, jamais de curseur automatique), bouton de scan à droite du champ, icône seule, « Scanner un code-barres » pour les lecteurs d'écran (le même sélecteur d'images, même lecteur que le mode scan, la photo reste sur le téléphone ; le code-barres reste facultatif), petite croix « Effacer le code-barres » dans le champ, visible seulement s'il contient quelque chose (elle le vide sans ouvrir le clavier), message « Code invalide : vérifiez les chiffres », avertissement si un autre article de la liste porte le même code ; la ligne de la liste ne change pas ;
  - jamais sur la page publique (liste blanche inchangée), jamais dans les journaux ; nouvelle version du service worker.
- **Mes produits : reconnaissance d'un code déjà connu** (décision du 18 octobre 2026). Raison : plus rapide, plus privé, utile pour un produit inconnu d'Open Food Facts. Ordre de recherche d'un code scanné : (1) un article de la liste ouverte (scan pour cocher) ; (2) un article de MES autres listes qui porte ce code (d'abord sur le téléphone, même hors ligne ; puis sur le serveur, qui connaît aussi les articles supprimés depuis moins de 30 jours) : la feuille « Produit connu : <nom> » reprend mon nom et ma note, modifiables ; (3) Open Food Facts. Mon nom gagne toujours sur celui d'Open Food Facts. Droits : seulement les listes dont le compte est membre (jamais celles des autres comptes ; un invité retiré d'une liste n'en voit plus les articles) ; la réponse ne contient que le nom et la note (ni identifiant, ni nom de liste) ; requête SQL paramétrée. Vie privée : dans ce cas, aucune demande ne part vers Open Food Facts (rien dans le compteur des demandes sortantes) ; le cache d'Open Food Facts ne change pas ; ni le code ni le nom dans les journaux. Le rayon vient de la mémoire des noms, comme pour un ajout normal.
- **Scan pour cocher** (décision du 18 octobre 2026). Raison : en magasin, cocher un produit pris en rayon en le scannant. Règles : si le code lu (ou tapé) est celui d'un article de la liste ouverte, la feuille du scan affiche « Déjà dans la liste : <nom> » avec « Cocher (je l'ai pris) », « Ajouter quand même » (nouvel article, nom repris) et « Annuler » ; article déjà coché : « Déjà coché : <nom> » avec « Le remettre dans la liste » (décocher), « Ajouter quand même », « Annuler ». Plusieurs articles avec ce code : le premier non coché, sinon le dernier coché. Cocher passe par l'opération habituelle (item.check, zone des cochés), puis la feuille se ferme avec « Coché : <nom> ». La correspondance se fait sur les données du téléphone, sans appel au serveur ni à Open Food Facts : cela marche hors ligne si le lecteur a déjà été téléchargé (un premier scan avec du réseau). Choix retenu : cette feuille à trois choix plutôt qu'un mode « Scanner pour cocher » qui cocherait directement : elle évite de cocher par erreur un produit scanné à la maison, pour un appui de plus.
- **Fin d'ajout dans une liste de courses** (décision du 18 octobre 2026). Raison : le clavier restait parfois affiché après un ajout (le champ gardait volontairement le curseur pour enchaîner). Règles : après un ajout (Entrée, bouton +, suggestion, ou « Ajouter à la liste » du mode scan), le champ est vidé, le curseur retiré (blur, clavier replié), l'article ajouté montré (défilement et brève mise en évidence) ; le mode scan se ferme avec un toast « Ajouté : … » (plus de « Scanner un autre produit », de compteur ni de « Terminé ») ; « Annuler » ferme aussi la feuille. Toute fenêtre qui se ferme, et tout changement d'écran, retire le curseur d'un champ qui l'avait. Les autres listes ne changent pas : le champ garde le curseur pour enchaîner les éléments.
- **Photo et scan : un seul bouton** (décision du 18 octobre 2026). Raison : le choix « appareil photo ou photothèque » est déjà proposé par le téléphone ; le menu de Listo faisait doublon. Règles : chaque endroit où l'on ajoute une photo ou scanne un code-barres a un seul bouton (« Ajouter une photo » / « Changer la photo », bouton de scan du champ Code-barres, « Scanner » de la barre d'ajout, « Réessayer » du mode scan), qui ouvre directement un champ fichier caché `accept="image/*"` sans attribut `capture` (un seul composant partagé) ; aucun menu ni feuille de choix dessiné par Listo. Photo et code-barres restent facultatifs. Lecture des codes et traitement des photos inchangés ; nouvelle version du service worker. **Écart (décision du 19 octobre 2026) :** sur Android seulement, ce même bouton ouvre d'abord une feuille de choix (voir « Photo et scan sur Android »).
- **Photo et scan sur Android : choix entre appareil photo et galerie** (décision du 19 octobre 2026). Raison : sur certains Android récents, un champ fichier d'images sans `capture` ouvre le sélecteur de photos du système, qui ne propose que la galerie. Règles :
  - dans le composant partagé (`createImagePicker` de public/js/photo.js : photo d'un article, bouton de scan du champ Code-barres, « Scanner » de la barre d'ajout, « Réessayer » du mode scan), sur Android seulement, le bouton ouvre une petite feuille, par-dessus la fenêtre en cours (fiche grisée dessous, comme pour les autres fenêtres) : « Prendre une photo » (champ `capture="environment"` : c'est l'application appareil photo du téléphone qui s'ouvre), « Choisir dans la galerie » (le champ habituel, sans `capture`), « Annuler » (ne fait rien) ; titres : « Photo de l'article » / « Photo de l'élément », « Scanner un code-barres », « Scanner un produit » ;
  - détection d'Android par le navigateur (agent utilisateur), dans une seule petite fonction (`isAndroid`) facile à retirer ; ailleurs (iPhone, ordinateur…), un seul geste, comme avant ;
  - photo et code-barres restent facultatifs ; même chemin ensuite (photo réduite sur le téléphone puis contrôlée par le serveur, code-barres lu sur le téléphone, rien n'est envoyé pour le scan) ; aucune règle de sécurité du navigateur changée (la page n'ouvre jamais la caméra elle-même) ; grandes zones de 48 px, textes en texte, aucun champ de saisie ni clavier ; aucune migration.
- **Fiche d'un article : disquette pour « Enregistrer »** (décision du 19 octobre 2026). Raison : la coche se confondait avec « coché ». Le bouton plein de l'en-tête de la fiche (ajout et modification) porte une disquette (nouvelle icône i-disquette) ; aria-label « Enregistrer », 44 px ; poubelle, croix et grands boutons « Enregistrer » des formulaires inchangés.
- **Groupes repliables** (décision du 18 octobre 2026) : voir « Fonctions » ci-dessus. Listes concernées : courses (rayons), courses à magasin « multi » (magasins), autres listes triées par priorité (priorités), et partout la zone des cochés. Restent simples : listes autres que les courses en ordre alphabétique ou par échéance. Choix : l'état est gardé sur le téléphone (clé `listo-groupes-replies-<identifiant>`), parce que chacun range sa liste comme il veut ; rien ne change sur le serveur ni sur la page publique (sa politique de sécurité stricte reste intacte).
- **Carte « À propos » plus compacte** (décision du 18 octobre 2026). Raison : la version, l'heure de vérification et le badge occupaient trois lignes. Règles : ligne du haut « Version : <commit> » (lien vers GitHub) à gauche, et à droite, groupés, « Vérifié il y a 15 min » puis le bouton d'actualisation ; à jour, le texte devient « À jour · il y a 15 min » (choix du propriétaire : sur un téléphone de 375 à 390 px, une pastille « À jour » en plus ne tient pas sur la ligne). Nouvelle version : une ligne à part avec la seule pastille-lien « Nouvelle version : <commit> » (icône d'alerte, sans bouton) ; sinon cette ligne n'existe pas. Sur un écran plus étroit (360 px, texte agrandi), le groupe texte + bouton passe proprement sous la version.
- **Fiche d'un article : champ Code-barres et aides** (décision du 18 octobre 2026). Raison : la feuille était longue (une ligne de boutons et une ligne d'aide par champ). Règles : le bouton « Effacer » devient une petite croix dans le champ (visible seulement s'il contient quelque chose ; elle vide le champ sans y mettre le curseur) ; le bouton de scan, icône seule, est sur la ligne du champ ; les aides courtes passent à côté du titre, entre parenthèses, en texte discret, dans le titre du champ (lues avec lui par les lecteurs d'écran) : « Code-barres (8, 12 ou 13 chiffres) », « Quantité (par exemple 2 ou 500 g) », et dans le mode scan « Note (facultative : marque et format) ». Les explications longues restent sous leur champ (comptes, mots de passe, code de démarrage, double authentification). Nouvelle version du service worker.
- **Fiche d'un article : « Enregistrer » et « Supprimer » dans l'en-tête** (décision du 18 octobre 2026). Raison : les deux grands boutons du bas prenaient beaucoup de hauteur. Règles : sur la ligne du titre, à droite, la poubelle (« Supprimer l'article », rouge discret), un espace, la coche « Enregistrer » (bouton plein, action principale ; **écart, décision du 19 octobre 2026 :** une disquette, icône i-disquette, à la place de la coche), puis la croix ; la poubelle n'est jamais à côté de la croix ; zones tactiles de 44 px ; l'en-tête reste visible quand la feuille défile, le titre tient sur une ligne (tronqué si la place manque). Ce bouton soumet le formulaire, comme la touche Entrée dans un champ. La poubelle supprime sans confirmation, puis « « Pain » supprimé · Annuler » quelques secondes (opération item.restore, avec la photo), exactement comme le glissement vers la gauche. Autres feuilles avec un bouton principal en bas, laissées telles quelles : nouvelle liste et modification d'une liste, partage par lien, choix du rayon ou du magasin, mode scan, nouveau compte, réinitialisation d'un mot de passe, catégorie (Administration).
- **Suppression par glissement vers la gauche** (décision du 18 octobre 2026), dans toutes les listes. Raison : supprimer vite un article ou un élément sans ouvrir sa fiche. Règles : la ligne suit le doigt et révèle une zone rouge « Supprimer » (icône et texte) ; au-delà de 80 px (ou d'un tiers d'une ligne étroite) elle reste ouverte, sinon elle revient ; rien n'est supprimé sans un appui sur la zone rouge. Une seule ligne ouverte à la fois : toucher ailleurs, faire défiler, ouvrir une fiche ou glisser vers la droite la referme. Le geste n'est pris en compte que s'il est nettement horizontal (diagonales : défilement) ; un contact au bord gauche de l'écran est laissé au geste « retour » de l'iPhone ; appuis sur la case, la vignette et la ligne inchangés ; pas de glissement à la souris. La suppression est la même que la poubelle de la fiche : opération item.delete par la file d'attente (hors ligne compris), puis « « Pain » supprimé · Annuler » (item.restore, avec la photo) ; aucune nouvelle route. Tout membre de la liste peut supprimer (le serveur le vérifie à chaque requête) ; la page publique n'a ni glissement ni suppression. C'est un raccourci : la poubelle de la fiche reste.
- **Menu « ⋯ » sur les cartes de « Mes listes » et « Supprimer la liste »** (décision du 18 octobre 2026). Raison : supprimer une liste sans passer par « Modifier la liste ». Règles : un bouton « ⋯ » (même icône que le menu ⋮ d'une liste, 44 px, « Actions de la liste <nom> ») dans le coin haut droit de la carte, hors du lien : un appui ouvre le menu juste sous lui, sans ouvrir la liste ; ailleurs sur la carte, la liste s'ouvre. Le menu de la carte et le menu ⋮ de la liste ouverte sont identiques (mêmes actions, même ordre, mêmes écrans, list-actions.js) : « Modifier la liste » (l'écran « Modifier la liste » : nom, catégorie, magasin, personnes avec qui la liste est partagée), « Partager par lien » (la feuille du lien public), puis, après un trait et en rouge, « Supprimer la liste ». Ouverts depuis l'accueil, l'écran et la feuille ramènent à l'accueil, carte à jour. « Actualiser » a quitté le menu ⋮ : la pastille d'état (« À jour ») fait la même chose (synchronisation complète, aussi en erreur ou hors ligne). Les trois chemins (carte, menu de la liste, « Modifier la liste ») utilisent la même confirmation (« Supprimer la liste « <nom> » ? » ; la liste disparaît avec ses articles ou éléments pour toutes les personnes ; effacement complet au bout de 30 jours) et la même opération list.delete (file d'attente, hors ligne compris). Les trois actions sont réservées au propriétaire (le serveur refuse un invité : 403 pour modifier ou supprimer, 404 pour le lien). Il n'existe pas d'« Annuler » (aucune opération pour remettre une liste). **Écart (décision du 19 octobre 2026) :** « Dupliquer la liste » s'ajoute après « Modifier la liste » ; un invité a désormais son menu : « Dupliquer la liste » puis « Quitter la liste » (« Peut modifier »), ou « Quitter la liste » seulement (« Lecture seule ») ; voir les décisions « Dupliquer la liste » et « Quitter la liste ».
- **Renommer une catégorie, un magasin ou un rayon met à jour les listes existantes** (correction du 18 octobre 2026). Cause : la base ne garde que l'identifiant (lists.category_id, lists.store_id, items.aisle_id) et le serveur était déjà à jour ; mais une synchronisation « depuis » ne renvoie que les listes modifiées (un renommage n'en modifie aucune) et le téléphone gardait dans chaque liste la copie du nom de sa catégorie et de son magasin reçue la dernière fois ; aucun message temps réel ne prévenait non plus les téléphones connectés. Correction : le téléphone relit la catégorie et le magasin de chaque liste par leur identifiant dans les données de référence, envoyées en entier à chaque synchronisation et gardées hors ligne ; chaque changement de l'Admin (ajout, renommage, désactivation, suppression d'une catégorie, d'un magasin ou d'un rayon) envoie « event: refs » (sans aucune donnée) à tous les téléphones connectés, qui se resynchronisent ; un téléphone hors ligne le fait à son retour. Les rayons étaient déjà relus par l'identifiant (seul le message temps réel manquait). Aucune migration ; page publique inchangée (elle lit le nom dans la base à chaque requête).
- **Droit par personne sur une liste partagée : « Peut modifier » ou « Lecture seule »** (décision du 18 octobre 2026, migration 12). Raison : partager une liste à consulter sans risquer qu'elle soit modifiée. Règles :
  - base : colonne list_members.access ('modification' ou 'lecture', contrainte CHECK) ; les membres existants gardent « Peut modifier » ; une personne ajoutée sans droit précisé (écran ou API) est en « Lecture seule » ; le propriétaire a toujours tous les droits (le serveur refuse de lui donner un droit : 400) ;
  - qui change le droit : seulement le propriétaire de la liste, comme le partage (PUT /api/lists/:id/members, en ligne) ; l'Admin n'a toujours aucun droit sur les listes des autres (il ne les voit pas) ; un invité « Peut modifier » ne peut ni changer les droits, ni le partage, ni renommer ou supprimer la liste ;
  - écrans : le même composant (deux choix « Peut modifier / Lecture seule », coche ET texte sur le choix actif, 44 px) apparaît sous chaque personne cochée, à la création d'une liste et dans « Modifier la liste » (un seul formulaire pour les deux) ; une personne cochée commence en « Lecture seule », visible tout de suite ; le propriétaire est affiché sans choix (« Tous les droits ») ; c'est le seul endroit où l'on ajoute une personne à une liste ;
  - serveur : toute écriture d'un invité en lecture seule est refusée (403, voir « Autorisation »), sans rien écrire, ni annoncer en temps réel, ni demander à Open Food Facts : ajouter, modifier (nom, quantité, note, rayon, magasin, priorité, échéance, code-barres), cocher, décocher, supprimer (fiche ou glissement), remettre (« Annuler »), tout décocher, retirer les cochés, envoyer ou retirer une photo, mode scan ; renommer ou supprimer la liste, changer son partage ou son lien public restent réservés au propriétaire. Il n'existe pas d'opération « réordonner » (l'ordre est calculé) ;
  - liste en lecture seule sur le téléphone : bandeau « Lecture seule » (le même que la page publique) sous la barre du haut ; ni champ d'ajout, ni Scanner, ni glissement, ni actions sur les cochés ; cases visibles mais inactives (un article coché reste rempli ET barré) ; un appui sur une ligne ouvre une fiche à consulter (« Détail de l'article », texte seul, aucun champ ni bouton qui écrit, photo qui s'agrandit) ; tri, groupes repliables, « Tout replier » et pastille d'état restent utilisables ; sur « Mes listes », pastille « Lecture seule » (icône et texte) ; menu « ⋯ » et ⋮ réduits à « Quitter la liste » (décision du 19 octobre 2026) ;
  - changement de droit en direct : la liste est annoncée comme modifiée (temps réel et synchronisation) ; l'écran bascule sans recharger : fenêtres ouvertes (fiche, choix du rayon, scan, confirmation) refermées sans rien enregistrer, clavier replié, message « Cette liste est maintenant en lecture seule. » ou « Vous pouvez maintenant modifier cette liste. » ;
  - hors ligne : une modification faite avant le passage en lecture seule est refusée au retour du réseau, retirée de la file (jamais renvoyée, pas de boucle), et l'écran reprend l'état du serveur ; message « Cette liste est maintenant en lecture seule : vos modifications hors ligne n'ont pas été envoyées. » ; les opérations de la file sont envoyées dans l'ordre et chacune est jugée seule ;
  - inchangé : un invité retiré du partage ne voit plus la liste ; le propriétaire ne peut ni quitter sa liste ni la donner à quelqu'un d'autre (ces fonctions n'existent pas) ; page et lien publics (aucun compte, aucun droit) ; vocabulaire « article » / « élément » ;
  - journal : « liste_droit_change » (nom de compte du propriétaire et de l'invité, identifiant de la liste, nouveau droit) et le droit dans « liste_partage_ajoute » ; jamais le nom de la liste ni son contenu ;
  - mise à jour : la migration 12 se fait seule au démarrage ; faire une sauvegarde de la base avant de mettre à jour.
- **Pastille d'état dans la barre du haut de « Mes listes »** (18 octobre 2026). Raison : gagner la ligne de la barre d'état sur l'écran d'accueil. Règles :
  - barre de 64 px sur une ligne : titre « Mes listes », pastille d'état, bouton de tri, Réglages ; la ligne « À jour » disparaît de l'accueil ;
  - si le texte ne tient pas (petit écran, texte agrandi, « Hors ligne · 3 en attente »), la pastille se réduit à son icône, avec le nombre en attente s'il y en a ; le texte reste lu par les lecteurs d'écran (role="status") ; jamais un mot coupé, jamais un bouton hors de l'écran ;
  - un appui actualise, comme avant (zone tactile de 44 px) ; aucun état « Erreur » : une erreur du serveur s'affiche « Hors ligne », comme avant ;
  - écran d'une liste : barre d'état gardée sous la barre du haut (essai fait : à 360 px, le titre de la liste passait de 184 à 88 px de large) ; colonne de gauche sur ordinateur inchangée (elle a déjà sa ligne de titre avec la pastille).
- **Android, application installée : page au-dessus de la barre de navigation** (18 octobre 2026). Raison : sur Android 15 et plus, avec viewport-fit=cover, la page passait sous la barre de navigation sans que le navigateur en donne la hauteur (env(safe-area-inset-bottom) à 0) ; le bouton « Nouvelle liste » était coupé. Décision : un petit script (js/viewport.js, fichier séparé, CSP inchangée) retire viewport-fit=cover sous Android avant le premier affichage ; iPhone inchangé. À confirmer sur le téléphone ; si besoin, réglage « Marge du bas » dans « Mon compte ».
- **Écran « Mon compte »** (décision du 18 octobre 2026) : la carte du compte, en haut des Réglages, est un bouton qui ouvre « Mon compte » (adresse #/reglages/compte), où se trouvent Sécurité, Apparence et Ce téléphone ; Réglages ne garde que la carte du compte, Administration, À propos et Se déconnecter. Raison : Réglages était long sur téléphone. Mêmes écrans, confirmations et actions qu'avant ; aucune route serveur nouvelle ; le mot de passe et la double authentification reviennent sur « Mon compte ».
- **Vérification de mise à jour** (Réglages › À propos, pastille d'état, Admin seulement) : le serveur, jamais le téléphone, demande à l'API publique de GitHub le commit du dernier passage réussi du workflow « Image Docker » sur main et le compare au commit installé. Raison : savoir qu'une nouvelle version existe sans aller sur GitHub. Règles : sans jeton ; délai de 5 s, réponse de 256 ko au plus, aucune redirection suivie ; commit accepté seulement s'il fait 40 caractères hexadécimaux ; au plus une demande par heure, « Vérifier maintenant » une fois par minute ; une panne affiche « Vérification impossible », sans erreur ni nouvelle tentative ; LISTO_UPDATE_CHECK=off coupe tout ; jamais de mise à jour automatique ni de bouton « Mettre à jour ». Source retenue : le workflow plutôt que les « releases » GitHub (le projet n'en publie pas) ou le registre ghcr.io (plus compliqué : jeton anonyme à demander, puis métadonnées de l'image à lire).
- **Rechargement des téléphones après une mise à jour du serveur.** Raison : une application installée sur l'écran d'accueil (iPhone) gardait l'ancien code en mémoire, et l'ancienne copie des fichiers, parfois jusqu'à la réinstallation. Décisions :
  - identifiant opaque de la version (HMAC du commit avec une clé propre à l'installation), écrit dans sw.js et js/version.js (servis sans compte) et donné par GET /api/about ; le commit n'apparaît dans aucune ressource publique ;
  - sw.js change à chaque version (VERSION v4-identifiant) : copie neuve des fichiers, ancienne copie effacée ;
  - vérification au démarrage, au retour au premier plan, à la reconnexion du temps réel et toutes les heures ;
  - rechargement seulement au premier moment sûr (aucune fenêtre ouverte, aucun champ avec le curseur ou un texte pas encore validé, aucun envoi en cours), après un bref message « Mise à jour de Listo… » ; sinon bandeau « Nouvelle version disponible » avec « Recharger », nouvel essai au changement d'écran ou au retour au premier plan ;
  - un seul rechargement automatique par version (sessionStorage) : jamais de boucle ;
  - file d'attente et copie locale (IndexedDB) intactes ;
  - inactif en développement (commit non précisé) ; page publique non concernée.
- **« Réinitialiser les données de ce téléphone »** dans Réglages → Mon compte. Raison : réparer une copie locale abîmée sans aide technique.
- **Temps réel ouvert au premier plan**, fermé en arrière-plan, 5 connexions au plus par compte. Raison : batterie, et changements reçus aussi sur « Mes listes ».
- **Pas de WebSocket** dans Nginx Proxy Manager ; cache et tampon coupés pour /api/events. Raison : le temps réel passe par SSE.
- **Photos gardées hors ligne** : 150 au plus. Raison : ne pas remplir le téléphone.
- **Page publique** dans server/pages/ et public/js/public.js (pas de dossier public/p/). Raison : deux pages servies par le serveur, sans donnée dedans.
- **Validité du lien public** : liste existante, propriétaire actif et toujours créateur du lien ; après une perte de la clé, l'adresse ne peut plus être réaffichée. Raison : précisions du code.
- **Publication** : licence Apache-2.0 (LICENSE, NOTICE), CONTRIBUTING.md, SECURITY.md (signalement privé des failles), dépôt public, image publique ghcr.io/magicgg91/listo sans `docker login`. Raison : rendre le projet réutilisable.
- **Documentation** : README court ; guide d'exploitation dans docs/exploitation.md ; détails techniques dans docs/developpement.md. Raison : un README lisible.
- **Mémoire des noms réservée aux listes de courses** (décision du 17 octobre 2026) : seules les listes de courses écrivent dans l'historique et reçoivent des suggestions ; changer la catégorie d'une liste n'écrit ni n'efface rien dans l'historique (une liste qui devient de courses reçoit seulement le rayon habituel de ses articles sans rayon). Raison : les éléments des autres listes sont très variés, plus simples à corriger un par un.
- **Migration 8** : retire de l'historique les noms venus seulement des autres listes (aucun article de courses actif ou pas encore purgé, et jamais de rayon ni de magasin). Raison : ces noms resteraient sinon suggérés aux courses et visibles dans l'onglet « Noms ». La règle plus stricte (aucun article de courses, sans regarder rayon ni magasin) a été écartée : sur une base de démonstration de 6 mois, elle effaçait 44 noms sur 87, dont 25 vrais noms de courses achetés il y a plus de 30 jours ; la règle retenue en efface 21 (les 19 noms de tâches et 2 noms de courses saisis sans rayon ni magasin).
- **Noms enregistrés** (Administration, onglet « Noms ») : corriger un nom partout dans les listes de courses ou le retirer des suggestions. Raison : une faute de frappe (« Tomatte ») restait dans les suggestions et dans les listes. Règles : une seule transaction ; seuls les noms identiques une fois normalisés ; seulement les articles des listes de courses (jamais les éléments des autres listes, même au même nom) ; articles supprimés et listes supprimées non touchés ; nouvelle date de modification de chaque article corrigé (la synchronisation le récupère ; ses listes remontent donc en tête de « Mes listes ») ; membres prévenus en temps réel ; journal. Pas de migration : le nom normalisé des éléments est calculé à la demande.
- **Fusion de deux noms** : utilisations additionnées ; rayon de la ligne la plus utilisée, à égalité celui du nom corrigé, et si la ligne retenue n'a pas de rayon, celui de l'autre. Raison : garder le rayon le plus fiable sans rien perdre.
- **Droits de l'Admin sur les noms** (décision du 17 octobre 2026) : l'Admin ne voit toujours pas les listes des autres (ni leur nom, ni leurs membres, ni leurs éléments). Il voit les noms de l'historique, déjà communs à tous les comptes par l'autocomplétion, avec de simples compteurs, et peut corriger un nom dans toutes les listes de courses sans les voir. Raison : demande du propriétaire ; c'est une écriture ciblée sur un nom, pas un accès au contenu.
- **Zone des articles cochés** (maquettes 1A, 4A, 5a) : « Dans le panier » / « Terminés » en bas de la liste, repliable, avec « Tout remettre à acheter » / « Tout rouvrir » et « Retirer du panier » / « Retirer les terminés »  ; l'ancienne action de suppression des articles cochés, dans la barre d'état et le menu de la liste, disparaît : c'est désormais « Retirer ». Raison : en magasin, ce qui reste à acheter reste groupé en haut, ce qui est dans le panier ne gêne plus. Décisions : date du coché par la migration 9 (ordre exact, demandé par le propriétaire) ; « tout décocher » est une seule opération serveur (`list.uncheckAll`), comme « retirer » (`list.removeChecked`) : une ligne dans la file d'attente quel que soit le nombre de cochés, rejouée sans doublon, une seule écriture et un seul événement temps réel ; elle porte sur les articles cochés quand le serveur la reçoit (dernière modification reçue gagnante). Page publique : même zone en lecture seule.
- **Aucun curseur automatique** : le clavier du téléphone ne s'ouvre que quand on touche un champ. Raison : un clavier qui s'ouvre tout seul cache la moitié de l'écran et surprend. Les fenêtres gardent un focus pour le clavier et les lecteurs d'écran (sur elles-mêmes ou leur bouton principal), avec un piège de focus ajouté (Tab reste dans la fenêtre). Test automatique : `test/focus.test.js`.
- **Image Docker** : .dockerignore étendu (.github, design/photos, test/, docs/, *.log). Raison : image plus petite, sans fichiers inutiles.

**Décisions du 17 octobre 2026** (écarts de sécurité tranchés en faveur du code livré, sans changement de code)

- **Photos et lien public** : photos servies aux membres de la liste, et, pour une liste partagée par lien public, au visiteur qui présente un lien valable (jeton, mot de passe si demandé, lien non expiré), pour les seuls articles de cette liste ; métadonnées EXIF retirées. Raison : le lien public montre les photos depuis l'étape 10 ; la règle d'origine ne citait pas cette exception.
- **Taille du lot d'opérations** : 200 ko et 100 opérations au plus par envoi, lus après la vérification du compte. Raison : valeurs réelles, assez larges pour une file d'attente remplie hors ligne.
- **Lien public, priorité et échéance** (décision du 18 octobre 2026) : pour une liste autre que les courses, chaque élément a aussi sa priorité et son échéance (lecture seule, mêmes pastilles), chacune seulement si elle est activée pour la liste (migration 13) ; jamais pour une liste de courses ; ordre toujours alphabétique (le tri est une préférence de chaque téléphone). Raison : informations de la liste que le propriétaire choisit de montrer ; aucun identifiant ni date du serveur ajouté.
- **Réponse du lien public** : champs listés exactement (dont date d'expiration, noms des rayons ou magasins, regroupement), sans nom de personne ni identifiant de compte ou de liste. Raison : la page publique en a besoin pour afficher la liste comme dans l'application.
- **Lecture avant la vérification du compte** : après la vérification d'origine (CSRF), un corps de 20 ko au plus peut être lu avant la vérification du compte, sauf pour /api/ops, lu (200 ko) après. Raison : règle réelle du code ; seul le gros corps attend la vérification du compte.

## Hypothèses validées et hors périmètre

Ces points ont été tranchés par défaut pendant la rédaction, puis validés le 16 octobre 2026.

**Hypothèses validées**

- [x] L'historique d'autocomplétion est commun à tous les comptes (nom de l'article et rayon habituel).
- [x] Un Admin n'a pas accès au contenu des listes des autres utilisateurs.
- [x] La quantité est un texte libre court (« 2 », « 500 g »), sans unité structurée.
- [x] Un article barré descend en bas de son rayon, au lieu de rester à sa place. (Remplacé le 17 octobre 2026 par la zone des articles cochés : voir Fonctionnalités.)
- [x] Une session dure 30 jours glissants.
- [x] Hors ligne, l'administration et le changement de partage sont indisponibles.
- [x] Une catégorie de liste porte un indicateur « courses » qui active magasin et rayons.
- [x] Un code de démarrage affiché dans les journaux protège la création du premier Admin.
- [x] La 2FA est facultative en v1 et ne peut pas être imposée par l'Admin.
- [x] La clé de chiffrement des secrets 2FA est un fichier généré automatiquement dans un dossier séparé de data, exclu de la sauvegarde de la base.

**Hypothèses à valider (mise à jour du 17 octobre 2026)**

Ces hypothèses ont été appliquées telles quelles aux étapes 6, 7 et 10, livrées et validées : le code livré les respecte.

Photo d'un article

- [x] Une seule photo par article, visible de tous les membres de la liste, supprimée avec l'article.
- [x] La photo est prise ou choisie depuis le téléphone, réduite sur le téléphone (1 280 px, JPEG) et stockée en fichier dans data/photos, pas dans la base, sans nouvelle dépendance.
- [x] La photo appartient à l'article, pas à l'historique d'autocomplétion : le même nom ajouté plus tard n'a pas de photo.
- [x] Hors ligne, on peut prendre une photo (elle part au retour du réseau) ; seules les photos déjà vues s'affichent sans réseau.

Lien public

- [x] Un seul lien actif par liste ; seul le propriétaire le crée, le modifie et l'arrête.
- [x] Le mot de passe est toujours généré par Listo (16 caractères), affiché une seule fois, régénérable ; le propriétaire ne choisit pas lui-même le mot de passe.
- [x] Durée de 1 heure à 365 jours, ou illimitée ; 24 heures proposées par défaut ; changer la durée fait repartir le délai de maintenant.
- [x] Le visiteur voit le nom de la liste, les articles, quantités, notes, photos et l'état coché, mais ni les noms des personnes, ni l'historique, ni les autres listes.
- [x] La page publique se rafraîchit à l'ouverture et à la demande, sans temps réel.

Magasin « multi »

- [x] Un magasin « multi » est créé par l'Admin et regroupe d'autres magasins de la liste commune (par exemple Fromagerie, Boucherie, Leclerc) ; il n'en regroupe pas un autre « multi ».
- [x] Dans une liste à magasin « multi », chaque article a son magasin, sans rayon ; l'affichage groupe par magasin ; « Sans magasin » en dernier. Le magasin est celui de l'article (pains à burger chez le boucher possible).
- [x] L'application mémorise, pour chaque article, son magasin habituel.
- [x] Dans une liste « multi », pas de rayon : seul le magasin compte. Les rayons restent communs pour les listes à magasin simple.

Plan

- [x] Les nouvelles fonctions passent avant le temps réel et le hors ligne : magasin « multi » (étape 6), photos (7), temps réel (8), hors ligne (9), lien public (10), finitions (11).

**Hors périmètre de la v1**

- Archivage des listes et listes modèles (dupliquer une liste est l'évolution la plus probable).
- Prix, unités structurées, totaux.
- Rayons propres à chaque magasin et ordre de parcours du magasin.
- Notifications push, rappels.
- Inscription libre, connexion par un service externe.
- Scan de codes-barres, import et export.
- Plusieurs photos par article, retouche de photo.
- Plusieurs liens publics par liste, accès en écriture par lien, statistiques de consultation.
- Autres langues que le français.
