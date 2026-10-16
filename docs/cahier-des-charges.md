# Listo – Cahier des charges

Version validée le 16 octobre 2026.

## Présentation et objectifs

Listo est une application web de listes partagées (courses, tâches…), pensée pour le téléphone, gratuite, sans publicité et hébergée sur le serveur de son propriétaire. Elle remplace les applications existantes, soit payantes, soit remplies de pubs.

Usage visé : deux personnes au quotidien (l'administrateur et sa femme), avec la possibilité d'ajouter quelques comptes.

**Principes directeurs**

- **Mobile-first** : chaque écran est conçu d'abord pour un téléphone tenu à une main, dans un magasin. La version ordinateur est une adaptation du même écran.
- **Gratuit et privé** : aucune pub, aucun service tiers, aucune donnée hors du serveur.
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

**Droits sur une liste partagée**

- **Propriétaire** (le créateur) : tout, y compris renommer la liste, changer ses partages et la supprimer.
- **Invité** : ajouter, modifier, cocher et supprimer des articles, vider les barrés. Il ne peut ni supprimer la liste ni modifier ses partages.
- Un Admin ne voit pas les listes des autres : la configuration ne donne pas accès à leur contenu.
- Le premier compte Admin est créé depuis l'écran de première connexion, avec le mot de passe choisi à ce moment. Aucun mot de passe n'est placé dans la configuration.

## Fonctionnalités

Listo gère plusieurs listes nommées, chacune partagée avec les personnes de son choix, et des articles classés par rayon avec autocomplétion. Tout est utilisable hors ligne.

**Listes**

- Une liste a un nom, une catégorie (Courses, Tâches…) et une liste de personnes avec qui elle est partagée.
- Les catégories sont éditables par l'Admin. Chacune porte un indicateur « liste de courses » : s'il est actif, la liste demande un magasin et classe ses articles par rayon.
- Le magasin se choisit dans la liste gérée par l'Admin. Il est purement informatif : les rayons restent communs.
- Le propriétaire partage la liste avec les autres utilisateurs, et peut modifier ce partage à tout moment.
- Une liste dure : pas d'archivage en v1. Le propriétaire peut la supprimer, après confirmation.

**Articles**

- Champs : nom (obligatoire), quantité (texte court libre, ex. « 2 » ou « 500 g »), note (facultative), rayon (listes de courses).
- Ajout rapide : un champ de saisie toujours visible. La touche Entrée valide, le champ reste actif pour enchaîner plusieurs articles.
- Autocomplétion dès deux lettres, à partir de l'historique des articles déjà ajoutés, les plus fréquents d'abord. L'historique est commun à tous les comptes.
- Rayon automatique : un article déjà connu reprend son rayon habituel. Un article nouveau demande son rayon une fois, puis l'application le mémorise. Le rayon reste modifiable.
- Tri : par rayon (ordre alphabétique, « Sans rayon » en dernier), puis par ordre alphabétique dans chaque rayon. Un rayon vide n'est pas affiché.
- Cocher d'un appui : l'article reste affiché, barré, en bas de son rayon. Un appui de plus le décoche.
- Bouton « Vider les barrés » : supprime tous les articles barrés de la liste, après confirmation.
- Modifier un article (nom, quantité, note, rayon) et le supprimer : depuis un menu sur l'article.
- Vider ou supprimer un article n'efface pas l'historique d'autocomplétion.

**Administration** (rôle Admin uniquement)

- Comptes : créer, désactiver, réinitialiser un mot de passe, désactiver le 2FA d'un utilisateur qui a perdu son téléphone, choisir le rôle.
- Catégories de liste, magasins, rayons : ajouter, renommer, désactiver. Un élément déjà utilisé ne peut pas être supprimé, seulement désactivé.
- Données de départ fournies : catégories Courses et Tâches, quelques magasins et une liste de rayons classiques, tous modifiables.

**Compte**

- Changer son propre mot de passe, activer ou désactiver sa double authentification (2FA), choisir le thème (clair, sombre ou automatique selon le téléphone), se déconnecter.

## Écrans et parcours

Sept écrans suffisent. Le plus important est l'écran d'une liste : il doit permettre d'ajouter et de cocher sans quitter le pouce du bas de l'écran.

| Écran | Contenu | Actions principales |
| --- | --- | --- |
| Connexion | Identifiant, mot de passe, puis code à 6 chiffres si le 2FA est activé. Session longue pour ne pas se reconnecter en magasin. Au tout premier lancement, l'écran propose de créer le compte Admin. | Se connecter |
| Mes listes (accueil) | Une carte par liste : nom, catégorie, magasin, nombre d'articles restants, personnes partageant. Tri par dernière activité. | Ouvrir une liste, créer une liste |
| Liste | En-tête (nom, magasin, menu). Champ d'ajout. Articles groupés par rayon. Indicateur de synchro / hors ligne. | Ajouter, cocher, vider les barrés, actualiser |
| Article | Feuille qui monte du bas : nom, quantité, note, rayon. | Enregistrer, supprimer |
| Créer / modifier une liste | Nom, catégorie, magasin (si courses), partage avec les autres utilisateurs. | Enregistrer, supprimer la liste |
| Réglages | Mot de passe, double authentification (activation par QR code, codes de secours), thème clair / sombre / auto, déconnexion. Lien vers l'administration pour un Admin. | Changer le mot de passe, activer le 2FA, choisir le thème |
| Administration | Quatre onglets : Comptes, Catégories, Magasins, Rayons. Chacun liste ses éléments avec ajout, renommage, désactivation. | Gérer les données de référence |

**Règles mobile-first**

- Zones tactiles d'au moins 44 px. Les actions fréquentes (ajouter, créer une liste) sont en bas de l'écran, à portée de pouce.
- Le champ d'ajout reste visible pendant le défilement de la liste.
- Aucun double-clic ni survol requis. Les actions secondaires passent par un menu, pas par des gestes cachés.
- Retour d'état toujours visible : un petit indicateur dit si la liste est à jour, en cours de synchro ou hors ligne.
- Application installable sur l'écran d'accueil (PWA), affichée sans barre de navigateur.

**Version ordinateur**

- Même application, même code. Sous 1024 px de large : une colonne. Au-delà : la liste des listes à gauche, la liste ouverte à droite, largeur du contenu plafonnée.

## Modèle de données

Dix tables SQLite. Les listes et les articles ont un identifiant UUID créé côté téléphone, pour pouvoir les créer hors ligne sans conflit d'identifiant.

| Table | Champs principaux | Remarques |
| --- | --- | --- |
| users | id, username (unique), display_name, password_hash, role (admin / user), active, totp_secret (chiffré), totp_enabled, created_at | Un compte désactivé ne peut plus se connecter. Les codes de secours du 2FA sont dans une table recovery_codes (id, user_id, code_hash, used_at). |
| sessions | id (jeton aléatoire), user_id, expires_at, created_at | Le jeton est stocké haché. |
| categories | id, name, is_shopping, active | is_shopping active magasin et rayons sur la liste. |
| stores | id, name, active | Liste commune gérée par l'Admin. |
| aisles | id, name, active | Rayons communs à tous les magasins. |
| lists | id (UUID), name, category_id, store_id (facultatif), owner_id, created_at, updated_at, deleted_at | Suppression logique via deleted_at. |
| list_members | list_id, user_id | Clé composée. Le propriétaire y figure aussi. |
| items | id (UUID), list_id, name, quantity, note, aisle_id (facultatif), checked, created_by, created_at, updated_at, deleted_at | Suppression logique, pour que les autres téléphones apprennent la suppression. |
| item_history | id, name_normalized (unique), display_name, aisle_id, use_count, last_used_at | Alimente l'autocomplétion et le rayon automatique. |

**Règles**

- Les horodatages updated_at et deleted_at sont posés par le serveur, jamais par le téléphone, pour ne pas dépendre de l'heure du téléphone.
- Un téléphone demande « tout ce qui a changé depuis tel instant » : le serveur renvoie les lignes de ses listes dont updated_at est plus récent, suppressions comprises.
- Un nettoyage périodique supprime définitivement les lignes marquées supprimées depuis plus de 30 jours.
- name_normalized = nom en minuscules, sans accents ni espaces superflus, pour que « Lait », « lait » et « Lait  » ne fassent qu'une entrée d'historique.
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
2. IndexedDB conserve une copie locale des listes, articles, rayons, magasins, catégories et de l'historique d'autocomplétion.
3. Chaque action (ajouter, cocher, modifier, supprimer) s'applique tout de suite à la copie locale, puis entre dans une file d'attente enregistrée sur le téléphone.
4. Dès que le réseau revient, la file est envoyée dans l'ordre. Chaque opération porte un identifiant unique : un renvoi après une coupure n'est jamais appliqué deux fois.
5. Le téléphone récupère ensuite les changements des autres et met sa copie à jour.

**Conflits**

- Deux modifications du même article : la dernière reçue par le serveur gagne.
- Une suppression l'emporte sur une modification.
- Deux ajouts du même nom créent deux articles : pas de fusion automatique, c'est le comportement le moins surprenant pour des courses.

**À savoir**

- Hors ligne, l'administration et le changement de partage d'une liste sont indisponibles (boutons grisés avec une explication).
- Si la session a expiré pendant la coupure, l'application demande de se reconnecter sans perdre la file d'attente.
- L'indicateur d'état affiche : « À jour », « Synchronisation… » ou « Hors ligne, N modifications en attente ».

## Sécurité

Listo sera exposé sur Internet derrière Nginx Proxy Manager (HTTPS déjà en place). Le serveur doit donc se défendre seul, comme s'il était la seule barrière.

**Authentification et sessions**

- Identifiant + mot de passe, 10 caractères minimum. Pas d'inscription libre. Chaque utilisateur change lui-même son mot de passe depuis ses réglages, en saisissant l'ancien.
- Mots de passe hachés avec scrypt, fourni par Node sans dépendance (argon2id reste acceptable si une bibliothèque est préférée). Jamais stockés ni journalisés en clair.
- Session par cookie HttpOnly, Secure, SameSite=Lax. Jeton aléatoire de 256 bits, stocké haché en base, valable 30 jours glissants.
- Une session est révoquée à la déconnexion, au changement de mot de passe et à la désactivation du compte.
- Limitation des tentatives : 5 échecs en 15 minutes pour un même identifiant ou une même adresse IP bloquent la connexion 15 minutes. Message d'erreur identique que l'identifiant existe ou non.

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
- En-têtes : Content-Security-Policy stricte (ressources du même domaine uniquement, pas de script en ligne), X-Content-Type-Options, Referrer-Policy.

**Exposition**

- Le conteneur n'ouvre aucun port sur l'hôte : seul Nginx Proxy Manager l'atteint, par un réseau Docker partagé.
- L'application fait confiance à l'en-tête X-Forwarded-For du seul proxy, pour connaître l'adresse IP réelle.
- Journal des connexions (réussies et échouées) et des actions d'administration, sans mot de passe ni jeton.
- Aucun secret dans le code ni dans le dépôt. Aucun mot de passe en configuration : la clé de chiffrement est générée au premier démarrage.

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

Trois dépendances côté serveur seulement : express, better-sqlite3 et qrcode (dessin du QR code de la double authentification). Le calcul des codes TOTP utilise le module crypto intégré à Node. Aucune bibliothèque côté interface. Si un besoin futur exigeait un autre langage ou un framework, Claude Code doit d'abord le signaler et argumenter avant de l'introduire.

**Routes de l'API**

| Route | Rôle |
| --- | --- |
| POST /api/setup, POST /api/login, POST /api/login/2fa, POST /api/logout | Créer le premier Admin (tant qu'aucun compte n'existe), ouvrir la session, saisir le code 2FA, la fermer |
| GET /api/me, POST /api/me/password, /api/me/2fa (activer, vérifier, désactiver) | Compte connecté, changement de mot de passe |
| GET /api/sync?since=… | Tout ce qui a changé depuis un instant donné, pour les listes de l'utilisateur et les données de référence |
| POST /api/ops | Reçoit un lot d'opérations de la file d'attente (créer, modifier, cocher, supprimer un article ou une liste). Chaque opération a un identifiant unique |
| GET /api/events | Flux SSE de notification des changements |
| PUT /api/lists/:id/members | Modifier le partage d'une liste (propriétaire, en ligne) |
| /api/admin/users, /categories, /stores, /aisles | Gestion des données de référence (Admin, en ligne) |

L'autocomplétion est calculée sur le téléphone à partir de la copie locale de item_history : elle marche donc hors ligne et ne demande aucune route.

**Structure du projet**

```text
listo/
  Dockerfile
  docker-compose.yml
  package.json
  server/
    index.js        démarrage, sécurité, fichiers statiques
    db.js           schéma SQLite et migrations
    auth.js         connexion, 2FA, sessions, tentatives
    routes/         sync, ops, lists, admin
    events.js       diffusion SSE
  public/
    index.html
    manifest.webmanifest
    sw.js           service worker
    css/            variables de thème, styles
    js/             app, api, stockage local, file d'attente, écrans
    icons/
  data/             volume Docker : base listo.db et sauvegardes
  secrets/          volume Docker séparé : secret.key
```

## Déploiement

Listo tourne dans un seul conteneur Docker, avec un dossier de données monté en volume. Nginx Proxy Manager et le HTTPS restent gérés par l'administrateur : le sous-domaine est une simple variable.

```yaml
services:
  listo:
    image: ghcr.io/magicgg91/listo:latest   # construite par GitHub Actions
    container_name: listo
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - TZ=Europe/Paris
      - LISTO_PUBLIC_URL=https://listo.exemple.fr
      - LISTO_DB_PATH=/data/listo.db
      - LISTO_KEY_PATH=/secrets/secret.key
      - LISTO_SESSION_DAYS=30
    volumes:
      - ./data:/data
      - ./secrets:/secrets
    networks:
      - proxy

networks:
  proxy:
    external: true   # réseau Docker partagé avec Nginx Proxy Manager
```

**Points d'attention**

- Aucun port publié sur l'hôte. Nginx Proxy Manager joint le conteneur par son nom (listo) sur le port 3000, via le réseau partagé. Le nom du réseau est à adapter à l'installation existante.
- Au premier démarrage, aucun compte n'existe : le premier accès à l'adresse de l'application propose de créer le compte Admin, avec le code de démarrage visible dans les journaux (docker logs listo). Aucun mot de passe n'est stocké dans la configuration.
- Le schéma de la base se crée et se met à jour automatiquement au démarrage (migrations numérotées).
- Route GET /healthz pour la surveillance (réponse simple, sans donnée).

**Flux SSE derrière Nginx Proxy Manager**

- Le serveur envoie l'en-tête X-Accel-Buffering: no sur le flux, et un signal de maintien de connexion toutes les 25 secondes.
- Si les messages arrivent quand même en retard, ajouter dans l'onglet Advanced du proxy host : proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s;

**Image Docker construite automatiquement**

- Un workflow GitHub Actions (`.github/workflows/docker.yml`) construit l'image et la publie sur ghcr.io/magicgg91/listo à chaque fusion sur main. Étiquettes : `latest` et `sha-<commit>` (pour revenir à une version précise).
- Sur le serveur, il suffit du docker-compose.yml : aucun code source à y copier. Le compose de production utilise `image:`, jamais `build:`.
- Le dépôt étant privé, l'image l'est aussi : le serveur s'y connecte une fois avec `docker login ghcr.io` (jeton GitHub limité à la lecture des paquets). Rendre le paquet public est possible, l'image ne contient ni base ni secret.
- Un fichier `.dockerignore` garde hors de l'image : data/, secrets/, .git, design/maquettes, node_modules, .env.
- Pour tester en local, un fichier docker-compose.dev.yml (avec `build: .`) est fourni à côté.

**Sauvegarde et mise à jour**

- Chaque nuit, l'application copie la base dans data/backups (commande SQLite VACUUM INTO) et garde les 14 dernières copies. Le dossier data est à inclure dans la sauvegarde habituelle de l'hôte. La clé secrets/secret.key en est volontairement exclue : à copier une seule fois, à part (dans un gestionnaire de mots de passe, par exemple), car sans elle les secrets 2FA ne sont plus lisibles.
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

**Contraintes**

- Contraste de texte conforme WCAG AA, cibles tactiles d'au moins 44 px.
- L'information ne passe jamais par la couleur seule (un article coché est aussi barré).
- Textes de l'interface en français, courts, à l'infinitif ou au nom (« Ajouter un article », « Vider les barrés »).

## Plan de développement

Huit étapes, chacune livrable et testable seule. Les maquettes de Claude Design peuvent être produites pendant les étapes 1 à 4 et servent de référence à partir de l'étape 5.

| # | Étape | Contenu | Critère d'acceptation |
| --- | --- | --- | --- |
| 1 | Socle | Projet Node et Express, SQLite et schéma, route /healthz, Dockerfile, .dockerignore, docker-compose.yml (production) et docker-compose.dev.yml (local) | docker compose up démarre, /healthz répond, la base apparaît dans ./data |
| 2 | Comptes et sessions | Création du premier Admin à la première connexion, connexion, déconnexion, sessions, limitation des tentatives, changement de son propre mot de passe, double authentification TOTP facultative avec codes de secours | La 6e tentative ratée est bloquée. Un Utilisateur reçoit un refus sur les routes d'administration. Un compte avec 2FA exige son code après le mot de passe. L'écran de création du premier Admin disparaît dès qu'un compte existe |
| 3 | Administration | Comptes (dont désactivation du 2FA d'un utilisateur), catégories, magasins, rayons, données de départ | Un élément déjà utilisé peut être désactivé mais pas supprimé |
| 4 | Listes et articles | Création, partage, ajout, modification, cochage, vider les barrés, tri par rayon, autocomplétion, rayon automatique | Un invité voit uniquement les listes partagées avec lui. « Lait » ajouté deux fois retrouve son rayon |
| 5 | Interface mobile | Intégration des maquettes, thèmes clair et sombre, version ordinateur, PWA installable | Installable sur l'écran d'accueil. Zones tactiles d'au moins 44 px. Thème suivant le téléphone |
| 6 | Temps réel | Flux SSE, rafraîchissement régulier et manuel, indicateur de synchro | Un article coché sur un téléphone apparaît sur l'autre en moins de 3 secondes |
| 7 | Hors ligne | Service worker, IndexedDB, file d'attente, gestion des conflits | En mode avion : 3 ajouts et 2 cochages. Au retour du réseau, tout apparaît chez l'autre utilisateur, sans doublon |
| 8 | Finitions | En-têtes de sécurité, sauvegarde nocturne, README, passage en production derrière Nginx Proxy Manager | Accessible en HTTPS sur le sous-domaine. Une sauvegarde est créée. Le README permet une réinstallation |

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

**Hors périmètre de la v1**

- Archivage des listes et listes modèles (dupliquer une liste est l'évolution la plus probable).
- Prix, unités structurées, totaux.
- Rayons propres à chaque magasin et ordre de parcours du magasin.
- Notifications push, rappels.
- Inscription libre, connexion par un service externe.
- Photos d'articles, scan de codes-barres, import et export.
- Autres langues que le français.
