# Listo – Cahier des charges

Version validée le 16 octobre 2026. Mise à jour du 17 octobre 2026 : photo par article, lien public en lecture seule et magasin « multi » (hypothèses à valider en fin de document), ainsi que les écarts constatés pendant les étapes 1 à 5 (tables et colonnes ajoutées, port publié, journal en fichier).

## Présentation et objectifs

Listo est une application web de listes partagées (courses, tâches…), pensée pour le téléphone, gratuite, sans publicité et hébergée sur le serveur de son propriétaire. Elle remplace les applications existantes, soit payantes, soit remplies de pubs.

Usage visé : deux personnes au quotidien (l'administrateur et sa femme), avec la possibilité d'ajouter quelques comptes.

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
| Gérer catégories de liste, magasins et rayons | Non | Oui |
| Ajouter, remplacer ou retirer la photo d'un article | Oui, sur les listes dont il est membre | Oui, sur les listes dont il est membre |
| Créer, modifier ou arrêter le lien public d'une liste | Oui, pour ses propres listes | Oui, pour ses propres listes |

**Droits sur une liste partagée**

- **Propriétaire** (le créateur) : tout, y compris renommer la liste, changer ses partages, créer et arrêter son lien public, et la supprimer.
- **Invité** : ajouter, modifier, cocher et supprimer des articles, ajouter, remplacer ou retirer leur photo, vider les barrés. Il ne peut ni supprimer la liste, ni modifier ses partages, ni gérer son lien public.
- Un Admin ne voit pas les listes des autres : la configuration ne donne pas accès à leur contenu.
- Un Admin ne peut ni se désactiver, ni se retirer le rôle Admin, ni se supprimer : il reste toujours au moins un Admin actif.
- Le premier compte Admin est créé depuis l'écran de première connexion, avec le mot de passe choisi à ce moment. Aucun mot de passe n'est placé dans la configuration.

## Fonctionnalités

Listo gère plusieurs listes nommées, chacune partagée avec les personnes de son choix, et des articles classés par rayon avec autocomplétion. Tout est utilisable hors ligne.

**Listes**

- Une liste a un nom, une catégorie (Courses, Tâches…) et une liste de personnes avec qui elle est partagée.
- Les catégories sont éditables par l'Admin. Chacune porte un indicateur « liste de courses » : s'il est actif, la liste demande un magasin et classe ses articles par rayon.
- Le magasin se choisit dans la liste gérée par l'Admin. Un magasin simple est purement informatif : les rayons restent communs.
- Un magasin peut aussi être de type « multi » : il regroupe plusieurs magasins, pour les courses faites dans plusieurs boutiques (voir « Magasin multi » plus bas).
- Le propriétaire partage la liste avec les autres utilisateurs, et peut modifier ce partage à tout moment. Il peut aussi créer un lien public en lecture seule (voir « Lien public d'une liste »).
- Une liste dure : pas d'archivage en v1. Le propriétaire peut la supprimer, après confirmation.

**Articles**

- Champs : nom (obligatoire), quantité (texte court libre, ex. « 2 » ou « 500 g »), note (facultative), photo (facultative, une seule), rayon (listes de courses à magasin simple), magasin (listes dont le magasin est « multi », à la place du rayon).
- Ajout rapide : un champ de saisie toujours visible. La touche Entrée valide, le champ reste actif pour enchaîner plusieurs articles.
- Autocomplétion dès deux lettres, à partir de l'historique des articles déjà ajoutés, les plus fréquents d'abord. L'historique est commun à tous les comptes.
- Rayon automatique : un article déjà connu reprend son rayon habituel, celui du magasin de la liste (un même article peut avoir un rayon différent d'un magasin à l'autre). Un article nouveau demande son rayon une fois, puis l'application le mémorise. Le rayon reste modifiable.
- Tri : par rayon (ordre alphabétique, « Sans rayon » en dernier), puis par ordre alphabétique dans chaque rayon. Un rayon vide n'est pas affiché. Dans une liste à magasin « multi », il n'y a pas de rayon : les articles sont groupés par magasin (voir plus bas).
- Cocher d'un appui : l'article reste affiché, barré, en bas de son rayon. Un appui de plus le décoche.
- Bouton « Vider les barrés » : supprime tous les articles barrés de la liste, après confirmation.
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
- Depuis la feuille Article : « Prendre une photo » (appareil photo du téléphone) ou « Choisir une photo » (galerie). Remplacer et retirer la photo sont possibles. Une vignette s'affiche sur la ligne de l'article ; un appui l'agrandit.
- La photo est réduite sur le téléphone avant l'envoi (côté le plus long : 1 280 px, JPEG), pour peser quelques centaines de Ko et ne pas ralentir une connexion mobile.
- Tous les membres de la liste voient la photo. Elle est supprimée avec l'article : le fichier est effacé définitivement lors du nettoyage des articles supprimés, après 30 jours.
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

**Compte**

- Changer son propre mot de passe, activer ou désactiver sa double authentification (2FA), choisir le thème (clair, sombre ou automatique selon le téléphone), se déconnecter.

## Écrans et parcours

Neuf écrans suffisent : les sept des utilisateurs, plus la feuille de partage par lien et la page publique. Le plus important reste l'écran d'une liste : il doit permettre d'ajouter et de cocher sans quitter le pouce du bas de l'écran.

| Écran | Contenu | Actions principales |
| --- | --- | --- |
| Connexion | Identifiant, mot de passe, puis code à 6 chiffres si le 2FA est activé. Session longue pour ne pas se reconnecter en magasin. Au tout premier lancement, l'écran propose de créer le compte Admin. | Se connecter |
| Mes listes (accueil) | Une carte par liste : nom, catégorie, magasin, nombre d'articles restants, personnes partageant. Tri par dernière activité. | Ouvrir une liste, créer une liste |
| Liste | En-tête (nom, magasin, menu). Champ d'ajout. Articles groupés par rayon (par magasin si le magasin de la liste est « multi », sans rayon). Vignette de photo sur les articles qui en ont une. Indicateur de synchro / hors ligne. | Ajouter, cocher, vider les barrés, actualiser, partager par lien |
| Article | Feuille qui monte du bas : nom, quantité, note, photo, rayon (magasin simple) ou magasin (si le magasin de la liste est « multi »). | Enregistrer, supprimer, prendre, choisir ou retirer la photo |
| Créer / modifier une liste | Nom, catégorie, magasin (simple ou « multi », si courses), partage avec les autres utilisateurs. | Enregistrer, supprimer la liste |
| Réglages | Mot de passe, double authentification (activation par QR code, codes de secours), thème clair / sombre / auto, déconnexion. Lien vers l'administration pour un Admin. | Changer le mot de passe, activer le 2FA, choisir le thème |
| Administration | Quatre onglets : Comptes, Catégories, Magasins, Rayons. Chacun liste ses éléments avec ajout, renommage, désactivation. Un magasin est « simple » ou « multi » (avec les magasins qu'il regroupe). | Gérer les données de référence |
| Partage par lien | Feuille ouverte depuis le menu de la liste (propriétaire) : état du lien (actif, expire le…, protégé ou non), mot de passe généré affiché une seule fois, durée en heures, en jours ou illimitée. | Créer, changer la durée, régénérer ou retirer le mot de passe, copier le lien, arrêter le partage |
| Page publique | Page ouverte par le lien, sans compte : saisie du mot de passe si le lien est protégé, nom de la liste, articles en lecture seule avec photos. Lien expiré ou inconnu : message neutre. | Consulter, actualiser |

**Règles mobile-first**

- Zones tactiles d'au moins 44 px. Les actions fréquentes (ajouter, créer une liste) sont en bas de l'écran, à portée de pouce.
- Le champ d'ajout reste visible pendant le défilement de la liste.
- Aucun double-clic ni survol requis. Les actions secondaires passent par un menu, pas par des gestes cachés.
- Retour d'état toujours visible : un petit indicateur dit si la liste est à jour, en cours de synchro ou hors ligne.
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
| lists | id (UUID), name, category_id, store_id (facultatif), owner_id, created_at, updated_at, deleted_at | Suppression logique via deleted_at. |
| list_members | list_id, user_id | Clé composée. Le propriétaire y figure aussi. |
| items | id (UUID), list_id, name, quantity, note, aisle_id (facultatif), store_id (facultatif), photo_at (facultatif), checked, created_by, created_at, updated_at, deleted_at | Suppression logique, pour que les autres téléphones apprennent la suppression. store_id sert aux listes à magasin « multi » (qui n'ont pas de rayon : aisle_id reste vide). photo_at est la date de la photo (vide = pas de photo) ; l'image est un fichier data/photos/<id de l'article>.jpg, pas un champ de la base. |
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

## Synchronisation et mode hors ligne

Le téléphone garde une copie locale des listes, modifie d'abord cette copie, puis se synchronise avec le serveur. Le serveur prévient les autres appareils en temps réel.

**Temps réel (Server-Sent Events)**

- Quand une liste est ouverte, le téléphone ouvre une connexion SSE vers le serveur. Le serveur y envoie un message court à chaque modification d'une liste partagée (« la liste X a changé »).
- À la réception, le téléphone demande au serveur les changements depuis sa dernière synchronisation et met l'écran à jour.
- Filet de sécurité : rafraîchissement automatique toutes les 60 secondes quand l'application est au premier plan, à chaque retour au premier plan, et bouton de rafraîchissement manuel.
- La connexion SSE se rétablit seule après une coupure.

**Hors ligne**

1. Un service worker met en cache l'application (pages, styles, scripts, icônes) : elle s'ouvre sans réseau.
2. IndexedDB conserve une copie locale des listes, articles, rayons, magasins, catégories et de l'historique d'autocomplétion. Les photos déjà consultées sont gardées dans le cache du navigateur.
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
- Session par cookie HttpOnly, Secure, SameSite=Lax. Jeton aléatoire de 256 bits, stocké haché en base, valable 30 jours glissants.
- Une session est révoquée à la déconnexion, au changement de mot de passe et à la désactivation du compte.
- Limitation des tentatives : 5 échecs en 15 minutes pour un même identifiant ou une même adresse IP bloquent la connexion 15 minutes. Message d'erreur identique que l'identifiant existe ou non.
- Un mot de passe choisi par un Admin (création du compte, réinitialisation) est provisoire : l'utilisateur doit le remplacer par le sien à sa connexion suivante, avant toute autre action.

**Double authentification (2FA)**

- Facultative : chaque utilisateur l'active lui-même depuis ses réglages, personne ne peut l'imposer en v1.
- Norme TOTP (code à 6 chiffres renouvelé toutes les 30 secondes), compatible avec toute application d'authentification. Activation : affichage d'un QR code, puis saisie d'un premier code pour confirmer.
- 10 codes de secours à usage unique, affichés une seule fois à l'activation, stockés hachés.
- À la connexion, après le mot de passe, le code est demandé. Même limitation des tentatives que pour le mot de passe. Un code déjà utilisé est refusé.
- Désactiver son 2FA demande le mot de passe et un code. Un Admin peut le désactiver pour un utilisateur qui a perdu son téléphone et ses codes de secours.
- Le secret TOTP est chiffré en base (AES-256-GCM). La clé est générée au premier démarrage dans un dossier séparé de la base (secrets/secret.key, droits 600), monté à part dans le conteneur et exclu de la sauvegarde de la base.

**Création du premier Admin**

- Tant qu'aucun compte n'existe, l'écran de connexion propose de créer le compte Admin (identifiant et mot de passe choisis à ce moment). Dès qu'un compte existe, cette route est désactivée définitivement.
- L'application étant exposée sur Internet, un code de démarrage à usage unique est affiché dans les journaux du conteneur au premier lancement et demandé à la création, pour que personne d'autre ne prenne le compte Admin de vitesse.

**Autorisation**

- Chaque requête vérifie côté serveur le compte connecté, son appartenance à la liste concernée (list_members) et, pour les routes d'administration, le rôle Admin. Le téléphone n'est jamais cru sur parole.
- Les modifications exigent un en-tête Origin correspondant au domaine de l'application (protection CSRF en complément de SameSite).

**Entrées et affichage**

- Longueurs maximales validées côté serveur (nom 100 caractères, quantité 30, note 500).
- Requêtes SQL toujours paramétrées, jamais construites par concaténation.
- Texte affiché via textContent, jamais innerHTML, pour éviter l'injection de scripts.
- En-têtes : Content-Security-Policy stricte (ressources du même domaine uniquement, pas de script ni de style en ligne), X-Content-Type-Options, Referrer-Policy, X-Frame-Options. L'en-tête Strict-Transport-Security est ajouté par Nginx Proxy Manager.

**Exposition**

- Nginx Proxy Manager étant sur une autre machine, le conteneur publie un seul port sur l'hôte, lié à l'adresse du réseau local (IP_LOCALE:13300), jamais à toutes les interfaces. Un pare-feu qui limite l'accès à l'adresse de Nginx Proxy Manager est recommandé : sinon quelqu'un du réseau local pourrait falsifier l'adresse IP vue par Listo et contourner la limitation des tentatives.
- L'application fait confiance à l'en-tête X-Forwarded-For du seul proxy, pour connaître l'adresse IP réelle.
- Journal de sécurité (connexions réussies et échouées, blocages, actions d'administration, partages), sans mot de passe, jeton ni code. Il est écrit dans docker logs et dans data/journal.log (droits 600, rotation à 1 Mo, 5 anciens fichiers conservés).
- Aucun secret dans le code ni dans le dépôt. Aucun mot de passe en configuration : la clé de chiffrement est générée au premier démarrage.

**Photos des articles**

- Accès : une photo n'est servie qu'à un compte connecté, membre de la liste de l'article (même contrôle que pour l'article lui-même). Aucune adresse publique ni devinable.
- Format : seulement du JPEG. Le serveur vérifie la signature du fichier et la structure de ses blocs, plafonne le poids (2 Mo) et les dimensions annoncées, et refuse tout le reste, quel que soit le type déclaré par le téléphone.
- Vie privée : le serveur retire les métadonnées du fichier (position GPS, modèle de l'appareil, date de prise de vue) en supprimant les blocs EXIF, sans bibliothèque supplémentaire. La réduction faite sur le téléphone les retire déjà.
- Stockage : fichiers dans data/photos, nommés d'après l'identifiant de l'article (jamais d'après un nom envoyé par le téléphone : aucun chemin choisi par l'utilisateur). Un fichier est effacé quand sa photo est remplacée ou retirée, ou quand son article est purgé.
- Envoi par une route dédiée (le lot d'opérations JSON reste limité à quelques Ko), avec sa propre limite de taille et un plafond d'envois par compte et par heure.
- Service : Content-Type image/jpeg et X-Content-Type-Options: nosniff. La Content-Security-Policy n'a pas besoin d'être assouplie (images du même domaine). La photo se choisit par le sélecteur du téléphone : aucun accès continu à la caméra n'est demandé au navigateur.

**Lien public d'une liste**

C'est la seule partie de Listo accessible sans compte : elle est donc traitée comme la plus exposée.

- Jeton : 256 bits aléatoires dans l'adresse (/p/<jeton>), impossible à deviner. Il n'est jamais écrit en clair en base ni dans les journaux (le journal cite l'identifiant du partage, pas le jeton).
- Mot de passe facultatif, généré par Listo : 16 caractères tirés avec le générateur aléatoire sécurisé de Node, avec au moins une minuscule, une majuscule, un chiffre et un caractère spécial (choisi parmi ceux faciles à saisir sur un téléphone). Haché avec scrypt, affiché une seule fois au propriétaire.
- Tentatives : même limitation que la connexion (5 échecs en 15 minutes, par lien et par adresse IP), plus un plafond de liens inexistants essayés par adresse IP. Message identique que le lien existe ou non.
- Après un mot de passe correct, le visiteur reçoit un cookie de consultation (HttpOnly, Secure, SameSite=Lax) limité à ce lien, valable 12 heures au plus et jamais au-delà de l'expiration du lien. Ce cookie ne donne aucun accès au reste de l'application.
- Expiration : la date limite (expires_at) est fixée par le serveur à la création, avec son horloge. Elle est contrôlée à chaque requête (page, données, photos, saisie du mot de passe, cookie de consultation). Un lien expiré, arrêté, ou dont la liste est supprimée répond exactement comme un lien inconnu. Le nettoyage périodique supprime ces liens après 30 jours. Des tests avancent l'horloge pour le vérifier.
- Lecture seule, par construction : le visiteur n'atteint que des routes de lecture. Les réponses sont construites champ par champ (liste blanche : nom de la liste, catégorie, magasin, articles avec quantité, note, état coché, photo), jamais à partir des objets internes : aucun identifiant de compte, nom d'utilisateur ni autre liste ne peut fuiter. Aucune route de modification n'accepte un cookie de consultation.
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

**Routes de l'API**

| Route | Rôle |
| --- | --- |
| POST /api/setup, POST /api/login, POST /api/login/2fa, POST /api/logout | Créer le premier Admin (tant qu'aucun compte n'existe), ouvrir la session, saisir le code 2FA, la fermer |
| GET /api/me, POST /api/me/password, /api/me/2fa (activer, vérifier, désactiver, image du QR code) | Compte connecté, changement de mot de passe |
| GET /api/lists, GET /api/lists/:id, GET /api/users, GET /api/suggestions | Mes listes, une liste et ses articles, comptes actifs (choix des invités), autocomplétion |
| GET /api/sync?since=… | Tout ce qui a changé depuis un instant donné, pour les listes de l'utilisateur et les données de référence |
| POST /api/ops | Reçoit un lot d'opérations de la file d'attente (créer, modifier, cocher, supprimer un article ou une liste). Chaque opération a un identifiant unique |
| PUT, GET, DELETE /api/items/:id/photo | Envoyer (JPEG, hors du lot d'opérations), lire, retirer la photo d'un article (membres de la liste) |
| GET /api/events | Flux SSE de notification des changements |
| PUT /api/lists/:id/members | Modifier le partage d'une liste (propriétaire, en ligne) |
| GET, PUT, DELETE /api/lists/:id/share | Lire l'état, créer ou modifier (durée, mot de passe), arrêter le lien public (propriétaire, en ligne) |
| /api/admin/users, /categories, /stores, /aisles | Gestion des données de référence (Admin, en ligne) |
| GET /p/:jeton, GET /api/public/:jeton, POST /api/public/:jeton/acces, GET /api/public/:jeton/photos/:id | Page publique, données en lecture seule, saisie du mot de passe, photos : seules routes sans compte |

L'autocomplétion est calculée sur le téléphone à partir de la copie locale de item_history : elle marche donc hors ligne. La route GET /api/suggestions applique la même règle côté serveur (code partagé entre les deux).

**Structure du projet**

```text
listo/
  Dockerfile
  docker-compose.yml, docker-compose.dev.yml
  package.json
  server/
    index.js        démarrage, configuration, clé de chiffrement
    app.js          assemblage : sécurité, API, fichiers statiques
    config.js, db.js, secrets.js    variables d'environnement, schéma SQLite et migrations, chiffrement
    auth.js, passwords.js, totp.js, twofactor.js, limiter.js, audit.js    connexion, sessions, 2FA, tentatives, journal
    lists.js        listes, articles, historique, synchronisation
    photos.js       photos des articles (contrôle JPEG, stockage)
    shares.js       lien public (jeton, mot de passe, expiration)
    events.js       diffusion SSE
    routes/         auth, me, lists, admin, public
  public/
    index.html      application
    p/              page publique du lien (sans compte)
    manifest.webmanifest
    sw.js           service worker
    css/            variables de thème, styles
    js/             app, api, stockage local, file d'attente, règles partagées, écrans
    icons/
  data/             volume Docker : base listo.db, sauvegardes, photos/, journal.log
  secrets/          volume Docker séparé : secret.key
```

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

**Flux SSE derrière Nginx Proxy Manager**

- Le serveur envoie l'en-tête X-Accel-Buffering: no sur le flux, et un signal de maintien de connexion toutes les 25 secondes.
- Si les messages arrivent quand même en retard, ajouter dans l'onglet Advanced du proxy host : proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s;
- Pour le reconnaître : un article coché sur un téléphone n'apparaît sur l'autre qu'au bout d'une minute environ (synchronisation de secours) au lieu de quelques secondes.

**Image Docker construite automatiquement**

- Un workflow GitHub Actions (`.github/workflows/docker.yml`) construit l'image et la publie sur ghcr.io/magicgg91/listo à chaque fusion sur main. Étiquettes : `latest` et `sha-<commit>` (pour revenir à une version précise).
- Sur le serveur, il suffit du docker-compose.yml : aucun code source à y copier. Le compose de production utilise `image:`, jamais `build:`.
- Le dépôt étant privé, l'image l'est aussi : le serveur s'y connecte une fois avec `docker login ghcr.io` (jeton GitHub limité à la lecture des paquets). Rendre le paquet public est possible, l'image ne contient ni base ni secret.
- Un fichier `.dockerignore` garde hors de l'image : data/, secrets/, .git, design/maquettes, node_modules, .env.
- Pour tester en local, un fichier docker-compose.dev.yml (avec `build: .`) est fourni à côté.

**Sauvegarde et mise à jour**

- Chaque nuit, l'application copie la base dans data/backups (commande SQLite VACUUM INTO) et garde les 14 dernières copies. Le dossier data (base, sauvegardes, photos, journal) est à inclure dans la sauvegarde habituelle de l'hôte : les photos sont de simples fichiers, absents de la copie de la base. La clé secrets/secret.key en est volontairement exclue : à copier une seule fois, à part (dans un gestionnaire de mots de passe, par exemple), car sans elle les secrets 2FA ne sont plus lisibles.
- Mise à jour : docker compose pull && docker compose up -d. Aucun code à récupérer sur le serveur. La base est conservée dans le volume.

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
- Champ d'ajout rapide avec liste de suggestions.
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
- Textes de l'interface en français, courts, à l'infinitif ou au nom (« Ajouter un article », « Vider les barrés »).

## Plan de développement

Onze étapes, chacune livrable et testable seule. Les étapes 1 à 5 sont livrées. Le magasin « multi » et les photos (étapes 6 et 7) passent avant le temps réel et le hors ligne : elles changent les données échangées et la file d'attente, mieux vaut les avoir en place avant de construire celles-ci. Les maquettes des nouveautés (voir « À livrer » du brief visuel) sont à produire avant l'étape 6.

| # | Étape | Contenu | Critère d'acceptation |
| --- | --- | --- | --- |
| 1 | Socle | Projet Node et Express, SQLite et schéma, route /healthz, Dockerfile, .dockerignore, docker-compose.yml (production) et docker-compose.dev.yml (local) | docker compose up démarre, /healthz répond, la base apparaît dans ./data |
| 2 | Comptes et sessions | Création du premier Admin à la première connexion, connexion, déconnexion, sessions, limitation des tentatives, changement de son propre mot de passe, double authentification TOTP facultative avec codes de secours | La 6e tentative ratée est bloquée. Un Utilisateur reçoit un refus sur les routes d'administration. Un compte avec 2FA exige son code après le mot de passe. L'écran de création du premier Admin disparaît dès qu'un compte existe |
| 3 | Administration | Comptes (dont désactivation du 2FA d'un utilisateur), catégories, magasins, rayons, données de départ | Un élément déjà utilisé peut être désactivé mais pas supprimé |
| 4 | Listes et articles | Création, partage, ajout, modification, cochage, vider les barrés, tri par rayon, autocomplétion, rayon automatique | Un invité voit uniquement les listes partagées avec lui. « Lait » ajouté deux fois retrouve son rayon |
| 5 | Interface mobile | Intégration des maquettes, thèmes clair et sombre, version ordinateur, PWA installable | Installable sur l'écran d'accueil. Zones tactiles d'au moins 44 px. Thème suivant le téléphone |
| 6 | Magasin « multi » | Type de magasin « multi » et magasins regroupés (administration), magasin par article, tri par magasin, magasin habituel par article dans l'historique | Dans une liste à magasin « multi », « œufs » ajouté deux fois retrouve son magasin. Une liste à magasin simple se comporte comme avant |
| 7 | Photos des articles | Route d'envoi JPEG, contrôle du fichier et retrait des métadonnées, stockage dans data/photos, prise ou choix de la photo, vignette, agrandissement, nettoyage | Une photo ajoutée sur un téléphone apparaît sur l'autre après actualisation. Un fichier qui n'est pas un JPEG valide est refusé. Un non-membre ne peut pas la lire |
| 8 | Temps réel | Flux SSE, rafraîchissement régulier et manuel, indicateur de synchro | Un article coché sur un téléphone apparaît sur l'autre en moins de 3 secondes |
| 9 | Hors ligne | Service worker, IndexedDB, file d'attente (photos comprises), gestion des conflits | En mode avion : 3 ajouts, 2 cochages et 1 photo. Au retour du réseau, tout apparaît chez l'autre utilisateur, sans doublon |
| 10 | Lien public | Création, durée, mot de passe généré, arrêt, page publique en lecture seule avec photos | Un lien expiré ne fonctionne plus (horloge avancée dans les tests). Un visiteur ne peut rien modifier ni voir une autre liste. Le mot de passe est refusé après 5 essais |
| 11 | Finitions | Vérification des en-têtes de sécurité, sauvegarde nocturne (photos comprises), README, passage en production derrière Nginx Proxy Manager | Accessible en HTTPS sur le sous-domaine. Une sauvegarde est créée. Le README permet une réinstallation |

**Consignes pour Claude Code**

- Code simple et commenté en français. Pas de framework côté interface, pas de dépendance ajoutée sans demander.
- Si un autre langage ou une autre bibliothèque paraît plus adapté, le dire, expliquer pourquoi avec les éléments de comparaison, et attendre la décision avant de l'utiliser.
- Chaque étape se termine par des tests automatisés sur les points sensibles (droits d'accès, synchronisation, file d'attente hors ligne) et par un résumé en langage simple de ce qui a été fait.
- En cas d'ambiguïté dans ce cahier des charges, poser la question plutôt que deviner.

## Hypothèses validées et hors périmètre

Ces points ont été tranchés par défaut pendant la rédaction, puis validés le 16 octobre 2026.

**Hypothèses validées**

- [x] L'historique d'autocomplétion est commun à tous les comptes (nom de l'article et rayon habituel).
- [x] Un Admin n'a pas accès au contenu des listes des autres utilisateurs.
- [x] La quantité est un texte libre court (« 2 », « 500 g »), sans unité structurée.
- [x] Un article barré descend en bas de son rayon, au lieu de rester à sa place.
- [x] Une session dure 30 jours glissants.
- [x] Hors ligne, l'administration et le changement de partage sont indisponibles.
- [x] Une catégorie de liste porte un indicateur « courses » qui active magasin et rayons.
- [x] Un code de démarrage affiché dans les journaux protège la création du premier Admin.
- [x] La 2FA est facultative en v1 et ne peut pas être imposée par l'Admin.
- [x] La clé de chiffrement des secrets 2FA est un fichier généré automatiquement dans un dossier séparé de data, exclu de la sauvegarde de la base.

**Hypothèses à valider (mise à jour du 17 octobre 2026)**

Photo d'un article

- [ ] Une seule photo par article, visible de tous les membres de la liste, supprimée avec l'article.
- [ ] La photo est prise ou choisie depuis le téléphone, réduite sur le téléphone (1 280 px, JPEG) et stockée en fichier dans data/photos, pas dans la base, sans nouvelle dépendance.
- [ ] La photo appartient à l'article, pas à l'historique d'autocomplétion : le même nom ajouté plus tard n'a pas de photo.
- [ ] Hors ligne, on peut prendre une photo (elle part au retour du réseau) ; seules les photos déjà vues s'affichent sans réseau.

Lien public

- [ ] Un seul lien actif par liste ; seul le propriétaire le crée, le modifie et l'arrête.
- [ ] Le mot de passe est toujours généré par Listo (16 caractères), affiché une seule fois, régénérable ; le propriétaire ne choisit pas lui-même le mot de passe.
- [ ] Durée de 1 heure à 365 jours, ou illimitée ; 24 heures proposées par défaut ; changer la durée fait repartir le délai de maintenant.
- [ ] Le visiteur voit le nom de la liste, les articles, quantités, notes, photos et l'état coché, mais ni les noms des personnes, ni l'historique, ni les autres listes.
- [ ] La page publique se rafraîchit à l'ouverture et à la demande, sans temps réel.

Magasin « multi »

- [ ] Un magasin « multi » est créé par l'Admin et regroupe d'autres magasins de la liste commune (par exemple Fromagerie, Boucherie, Leclerc) ; il n'en regroupe pas un autre « multi ».
- [ ] Dans une liste à magasin « multi », chaque article a son magasin, sans rayon ; l'affichage groupe par magasin ; « Sans magasin » en dernier. Le magasin est celui de l'article (pains à burger chez le boucher possible).
- [ ] L'application mémorise, pour chaque article, son magasin habituel.
- [ ] Dans une liste « multi », pas de rayon : seul le magasin compte. Les rayons restent communs pour les listes à magasin simple.

Plan

- [ ] Les nouvelles fonctions passent avant le temps réel et le hors ligne : magasin « multi » (étape 6), photos (7), temps réel (8), hors ligne (9), lien public (10), finitions (11).

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
