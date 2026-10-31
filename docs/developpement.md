# Listo — Détails techniques (pour les développeurs)

Organisation du code, tests, API et vérifications à la main. Pour installer et faire vivre Listo : le [README](../README.md) et le [guide d'exploitation](exploitation.md). Autres documents : [cahier des charges](cahier-des-charges.md), [kit de design](../design/README.md), [CONTRIBUTING.md](../CONTRIBUTING.md).

## Sommaire

- [Organisation du code](#organisation-du-code)
- [Tester en local](#tester-en-local)
- [Essayer sur son téléphone](#essayer-sur-son-téléphone)
- [Vérifier sur les téléphones](#vérifier-sur-les-téléphones)
- [API des comptes (étape 2)](#api-des-comptes-étape-2)
- [API d'administration (étape 3)](#api-dadministration-étape-3)
- [API des listes et des articles (étape 4)](#api-des-listes-et-des-articles-étape-4)
- [Magasin « multi » (étape 6)](#magasin--multi--étape-6)
- [Photos des articles (étape 7)](#photos-des-articles-étape-7)
- [Temps réel (étape 8)](#temps-réel-étape-8)
- [Hors ligne (étape 9)](#hors-ligne-étape-9)
- [Lien public d'une liste (étape 10)](#lien-public-dune-liste-étape-10)
- [En-têtes, arrêt propre et sauvegarde (étape 11)](#en-têtes-arrêt-propre-et-sauvegarde-étape-11)
- [Groupes repliables (toutes les listes)](#groupes-repliables-toutes-les-listes)
- [Recherche (dans une liste et sur « Mes listes »)](#recherche-dans-une-liste-et-sur--mes-listes-)
- [Glissement vers la gauche (« Supprimer »)](#glissement-vers-la-gauche--supprimer-)
- [Droit par personne (« Peut modifier » ou « Lecture seule »)](#droit-par-personne--peut-modifier--ou--lecture-seule-)
- [Priorité et échéance activées ou non (migration 13)](#priorité-et-échéance-activées-ou-non-migration-13)
- [« Après l'ajout » (migration 15)](#-après-lajout--migration-15)
- [Icône d'une liste (migration 14)](#icône-dune-liste-migration-14)
- [Nouveautés (migration 16)](#nouveautés-migration-16)
- [Autorisation pour Claude (migration 17)](#autorisation-pour-claude-migration-17)
- [Serveur MCP en lecture seule (étape B)](#serveur-mcp-en-lecture-seule-étape-b)
- [Ajout et cochage par Claude (étape C)](#ajout-et-cochage-par-claude-étape-c)
- [Écran « Connexions Claude » (étape D)](#écran--connexions-claude--étape-d)
- [Photo et scan sur Android (choix de la source)](#photo-et-scan-sur-android-choix-de-la-source)
- [Mode scan des listes de courses](#mode-scan-des-listes-de-courses)

## Organisation du code

| Dossier / fichier | Rôle |
| --- | --- |
| `server/index.js` | Démarrage : configuration, base, clé de chiffrement, serveur web |
| `server/app.js` | Assemblage du serveur : sécurité, API, `/healthz`, fichiers de l'interface |
| `server/db.js` | Base SQLite : réglages et schéma (migrations numérotées) |
| `server/secrets.js` | Clé de chiffrement (créée au premier démarrage) et chiffrement AES-256-GCM |
| `server/config.js` | Lecture des variables d'environnement |
| `server/auth.js` | Sessions, cookies, contrôles d'accès, protection CSRF, code de démarrage |
| `server/passwords.js` | Hachage des mots de passe (scrypt) |
| `server/totp.js` | Codes à 6 chiffres de la double authentification |
| `server/twofactor.js` | Secret 2FA chiffré et codes de secours |
| `server/limiter.js` | Limitation des tentatives (5 échecs en 15 minutes) |
| `server/audit.js` | Journal de sécurité (`docker logs listo` et `data/journal.log`, avec rotation) |
| `server/validate.js` | Vérification des données reçues (identifiants, noms, doublons) |
| `server/lists.js` | Listes et articles : droits, opérations, historique, magasin « multi », synchronisation, nettoyage |
| `server/oauth.js`, `server/oauth-clients.js`, `server/routes/oauth.js` | Autorisation OAuth pour Claude (LISTO_MCP=on) : applications (CIMD, DCR), demandes, connexions, codes et jetons (empreintes), rotation, révocations, nettoyage ; routes `/.well-known/…`, `/oauth/…`, `/api/oauth/demandes/…` |
| `server/mcp.js`, `server/mcp-tools.js` | Serveur MCP `/mcp` (LISTO_MCP=on) : protocole JSON-RPC écrit à la main, jeton Bearer, débit, journal ; outils `list_lists`, `read_list` (lecture), `add_items`, `set_checked` (connexion « Lecture et ajout ») |
| `server/news.js` | Nouveautés : journal des événements de chaque liste, repère de lecture de chaque membre, calcul de ce qui est nouveau pour une personne, nettoyage (30 jours, 500 par liste) |
| `server/events.js` | Temps réel : flux SSE `/api/events`, connexions ouvertes, messages « la liste X a changé » |
| `server/photos.js` | Photos des articles : contrôle du fichier JPEG (sans bibliothèque), retrait des métadonnées, stockage dans `data/photos`, plafond d'envois |
| `server/backup.js` | Sauvegarde nocturne de la base (VACUUM INTO, contrôle, 14 copies, droits 600) |
| `server/backup-now.js`, `server/admin-secours.js` | Commandes à lancer sur le serveur : sauvegarde à la demande ; mot de passe provisoire (et retrait de la 2FA) quand plus personne ne peut se connecter |
| `server/shares.js` | Lien public d'une liste : jeton (jamais stocké en clair), mot de passe généré, contrôle de validité à chaque requête, cookies de consultation, nettoyage |
| `server/pages/` | Les deux pages HTML du lien public : la page de la liste (sans aucune donnée) et la page unique « Lien expiré ou inexistant » |
| `public/js/history.js`, `public/js/sorting.js` | Règles partagées entre le serveur et le téléphone : nom normalisé, autocomplétion, rayon et magasin habituels, mise à jour de l'historique, tri des articles (par rayon ou par magasin ; listes autres que les courses : alphabétique, par priorité avec groupes, par échéance) |
| `server/routes/` | Routes de l'API : `auth.js` (connexion), `me.js` (mon compte), `lists.js` (listes et articles), `photos.js` (photos), `shares.js` (lien public, côté propriétaire), `public.js` (lien public, côté visiteur sans compte), `products.js` (mode scan : nom d'un produit), `references.js` (création d'un magasin ou d'un rayon par tout compte), `admin.js` (administration : `admin-users.js` pour les comptes, `admin-references.js` pour catégories, magasins et rayons, `admin-names.js` pour la mémoire des noms, onglet « Articles ») |
| `public/index.html` | Page unique de l'application (sprite d'icônes compris) |
| `public/css/listo.css`, `public/css/app.css` | Kit de design (copie de `design/listo.css`, sections 1 à 16, sans la section 17 qui ne sert qu'aux planches) et petits ajustements propres à l'application |
| `public/manifest.webmanifest`, `public/icons/` | Installation sur l'écran d'accueil (PWA) |
| `public/sw.js` | Service worker : l'application s'ouvre sans réseau, photos déjà vues gardées (150 au plus), photos pas encore envoyées affichées depuis le téléphone. Ne garde jamais les réponses de l'API |
| `public/js/app.js` | Démarrage de l'interface, compte connecté, copie locale des données, choix de l'écran |
| `public/js/router.js` | Adresses `#/listes/…`, bouton Retour du téléphone, fenêtres superposées |
| `public/js/api.js` | Seul module qui parle au serveur (`/api/…`, `/api/ops` avec des identifiants UUID créés dans le téléphone) |
| `public/js/localdb.js` | Copie locale sur le téléphone (IndexedDB), une base par compte, effacée à la déconnexion |
| `public/js/queue.js` | File d'attente des modifications : envoi dans l'ordre, photos à leur place, refus retirés, nouvel essai avec un délai croissant |
| `public/js/actions.js` | Actions de l'utilisateur (ajouter, cocher, modifier, supprimer, photo…) : mises en file, puis appliquées tout de suite à la copie locale |
| `public/js/live.js` | Temps réel côté téléphone : écoute du flux, regroupement des messages, reconnexion, synchronisation toutes les 60 secondes |
| `public/js/freshness.js`, `public/js/version.js` | Rechargement après une mise à jour du serveur : identifiant de la version du code chargé, comparé à celui du serveur ; rechargement au premier moment sûr, sinon bandeau « Nouvelle version disponible » (voir « Nouvelle version de Listo » ci-dessous) |
| `server/update-check.js` | Vérification de mise à jour sur GitHub (Réglages › À propos, Admin) |
| `server/products.js`, `server/http-json.js` | Mode scan : validation du code-barres (clé EAN, UPC-A → EAN-13), demande à Open Food Facts (adresse fixe, délai, taille, aucune redirection), analyse tolérante de la réponse, cache en mémoire, limites de débit ; lecture limitée d'une réponse JSON (partagée avec la vérification de mise à jour) |
| `public/js/barcode.js`, `public/js/barcode-worker.js` | Mode scan sur le téléphone : photo réduite (canvas, orientation respectée), essais de lecture, lecteur zxing-wasm dans un worker ; clé de contrôle EAN (mêmes règles que le serveur) |
| `public/vendor/zxing-wasm-3.1.4/` | Lecteur de codes-barres copié tel quel (voir « Mode scan » ci-dessous : origine, version, empreintes). Téléchargé par le téléphone au premier scan seulement |
| `public/js/viewport.js` | Android : retire `viewport-fit=cover` avant le premier affichage, pour garder la page au-dessus de la barre de navigation (voir « Android : barre de navigation ») |
| `public/js/app-height.js` | Hauteur et position de l'application : mesure la zone visible, l'écrit dans `--app-h` et `--app-top`, la remesure au retour dans l'application et quand le clavier s'ouvre ou se ferme ; pose `data-keyboard` sur `<html>` quand l'application touche le clavier de l'iPhone ; ne change rien pendant un appui (voir « Hauteur remesurée au retour », « Clavier de l'iPhone et barre du haut fixe », « Boutons en un seul appui » et « Bande vide » ci-dessous) |
| `public/js/photo.js` | Réduction d'une photo sur le téléphone avant l'envoi (1 280 px, JPEG) ; bouton qui ouvre le sélecteur d'images du téléphone (`createImagePicker`), précédé sur Android de la feuille « Prendre une photo / Choisir dans la galerie » (`isAndroid`) |
| `public/js/search.js`, `public/js/search-row.js` | Recherche locale (dans une liste, sur « Mes listes ») : texte plié sans majuscules ni accents, places du texte trouvé, filtrage de la vue ; champ masqué en haut de la zone qui défile (voir « Recherche » ci-dessous) |
| `public/js/tap.js` | Appui « au relâchement du doigt » pour les suggestions et le bouton « + » du champ d'ajout ; garde le curseur du champ pendant l'appui sur « Scanner » (voir « Suggestions : appui sur iPhone » et « Bouton « + » : un seul appui » ci-dessous) |
| `public/js/swipe.js` | Glissement d'une ligne vers la gauche (raccourci « Supprimer ») : décision du geste et contrôleur tactile (voir « Glissement vers la gauche » ci-dessous) |
| `public/js/public.js` | Page publique d'une liste (lien `/p/…`) : saisie du mot de passe, liste en lecture seule, photo agrandie. N'utilise ni service worker ni stockage |
| `public/js/store.js` | Copie locale des données et calculs (tri d'une liste : `availableSorts`, `defaultSort`, `effectiveSort`, choix gardé par liste sous la clé `listo-tri-liste-<id>` ; cartes de « Mes listes » et leur tri : plus récentes d'abord ou ordre alphabétique, choix gardé sur le téléphone sous la clé `listo-tri-listes` ; liste groupée par rayon ou par magasin, suggestions, magasins proposés) |
| `public/js/format.js` | Mise en forme des textes (dates relatives, noms, version…) |
| `public/js/help-content.js` | Contenu de la page « Aide » : tableau « Qui peut quoi », sections et sujets. Tout le texte d'aide est là, et seulement là ; la section Administrateur n'est passée à l'écran que pour un Admin |
| `public/js/list-icons.js` | Les 35 icônes possibles d'une liste (liste blanche, partagée avec le serveur) et l'icône par défaut de chaque catégorie |
| `public/js/create-reference.js` | Feuille « Nouveau magasin » / « Nouveau rayon » (même composant pour les deux) |
| `public/js/theme-boot.js` | Thème posé avant le premier affichage (balises `color-scheme` et `theme-color`), pour que le bandeau du haut de l'iPhone suive le thème de Listo |
| `public/js/words.js` | Vocabulaire : « article » dans une liste de courses, « élément » dans les autres listes. Tous les textes qui nomment une ligne de la liste passent par lui |
| `public/js/dom.js`, `public/js/ui.js`, `public/js/theme.js` | Fabrication des éléments de la page (jamais `innerHTML`), feuilles, menus, messages, thème clair/sombre/auto |
| `public/js/screens/` | Un fichier par écran : `login.js` (connexion), `lists.js` (Mes listes et colonne de gauche sur ordinateur, avec le bouton de tri ; sur téléphone, pastille d'état dans la barre du haut), `list.js` (une liste et la feuille Article), `scan.js` (bouton « Scanner » et feuille « Scanner un produit », listes de courses), `list-form.js` (créer ou modifier une liste, avec le droit de chaque personne : `accessChoice`), `list-actions.js` (actions d'une liste, les mêmes dans le menu ⋮ d'une carte et le menu ⋮ de la liste : « Modifier la liste », « Dupliquer la liste », « Partager par lien », « Supprimer la liste » avec sa confirmation, « Quitter la liste »), `share.js` (feuille « Partager par lien »), `help.js` (page « Aide », ouverte depuis les Réglages), `settings.js` (réglages, mot de passe, 2FA), `claude-consent.js` (écran « Autoriser Claude »), `claude-connections.js` (écran « Connexions Claude »), `account.js` (Mon compte : sécurité, apparence, ce téléphone), `admin.js` (administration en trois onglets : Comptes, Catégories, Courses) |
| `test/` | Tests automatisés (`npm test`) |
| `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md` | Licence Apache-2.0 (texte officiel), mentions à conserver, règles de contribution, signalement des failles |
| `docs/` | Cahier des charges (`cahier-des-charges.md`), guide d'exploitation (`exploitation.md`) et ce document (`developpement.md`) |
| `design/` | Kit de design (`listo.css`, `components.html`, `icons-sprite.html`, icônes, maquettes) : voir `design/README.md` |
| `.github/` | Workflow de l'image Docker (`workflows/docker.yml`) et Dependabot (`dependabot.yml`) |
| `docs/images/` | Captures d'écran du README (instance de démonstration, données inventées) |
| `Dockerfile`, `docker-entrypoint.sh` | Construction et démarrage de l'image Docker |
| `docker-compose.yml` | Production (image publiée sur ghcr.io), toutes les variables commentées |
| `docker-compose.dev.yml` | Test en local (image construite depuis le code) |

## Tester en local

Avec Docker :

```sh
docker compose -f docker-compose.dev.yml up --build
```

Puis ouvrir <http://localhost:3000/healthz> : la réponse doit être `{"status":"ok"}`. La base apparaît dans `./data/listo.db` et la clé dans `./secrets/secret.key` (ces deux dossiers ne sont jamais commités).

Sans Docker (Node.js 22 ou plus récent ; l'image Docker utilise Node.js 24) :

```sh
npm ci                    # installe express, better-sqlite3 et qrcode
npm test                  # lance les tests automatisés
npm start                 # démarre Listo sur http://localhost:3000
```

## Essayer sur son téléphone

Le téléphone et l'ordinateur doivent être sur le même réseau Wi-Fi.

1. Trouver l'adresse de l'ordinateur sur le réseau local : par exemple `hostname -I` (Linux), `ipconfig getifaddr en0` (Mac) ou `ipconfig` (Windows). Elle ressemble à `192.168.1.20`.
2. Démarrer Listo en ouvrant le port au réseau local, et en indiquant cette adresse (sinon les connexions sont refusées par la protection CSRF) :

   ```sh
   LISTO_DEV_BIND=0.0.0.0 LISTO_DEV_URL=http://192.168.1.20:3000 \
     docker compose -f docker-compose.dev.yml up --build
   ```

3. Sur le téléphone, ouvrir `http://192.168.1.20:3000`. Au premier lancement, le code de démarrage s'affiche dans le terminal de l'ordinateur.
4. Pour arrêter : Ctrl+C. Relancé sans ces deux réglages, Listo n'est de nouveau joignable que depuis l'ordinateur.

En `http://` sur le réseau local, le navigateur n'autorise pas tout. L'installation sur l'écran d'accueil demande une adresse en HTTPS : elle se vérifie avec le vrai sous-domaine, derrière Nginx Proxy Manager. Tout le reste se teste normalement.

## Vérifier sur les téléphones

Ces points ne peuvent pas être testés automatiquement : à vérifier une fois à la main, sur un iPhone (Safari, puis application installée) et sur un téléphone Android (Chrome, puis application installée), de préférence sur le vrai sous-domaine en HTTPS. Les sections techniques plus bas disent, pour chaque sujet, ce qui a déjà été vérifié dans Chromium (vrais événements tactiles, clavier simulé) ; ce qui suit reste à confirmer sur de vrais téléphones.

**Installation et affichage**

1. **Installation sur l'écran d'accueil** : dans le navigateur du téléphone, menu « Ajouter à l'écran d'accueil » (ou « Installer l'application »). L'icône Listo apparaît ; ouverte depuis l'écran d'accueil, l'application s'affiche sans barre d'adresse.
2. **Thème** : Réglages → Mon compte → Apparence. « Clair » et « Sombre » changent l'affichage tout de suite ; « Auto » suit le réglage du téléphone. Fermer puis rouvrir Listo : le choix est conservé. Sur iPhone (application installée), mettre l'iPhone en mode sombre et Listo en Clair, fermer complètement Listo puis le rouvrir : le bandeau du haut (heure, batterie) est clair dès la première image, et le clavier aussi ; passer Listo en Sombre : le bandeau devient sombre tout de suite ; en Auto, il suit l'iPhone. L'écran de lancement peut rester d'une autre couleur : c'est normal.
3. **Pouce en bas de l'écran** : le champ d'ajout et les boutons principaux (Nouvelle liste, Enregistrer…) sont en bas, atteignables d'une main. Les cases à cocher se touchent facilement sans cocher la ligne voisine. Rien ne passe sous la barre système (Android, barre à 3 boutons ou gestes) ni sous l'indicateur d'accueil (iPhone) : le bouton « Nouvelle liste » est entièrement visible, la dernière liste de « Mes listes » et la dernière ligne de l'Administration s'affichent au-dessus quand on fait défiler jusqu'en bas. Sur Android, application installée, barre à 3 boutons et mode gestes (voir « Android : barre de navigation » ci-dessous).
4. **Bouton Retour du téléphone** : une feuille ouverte (article, choix du rayon) se ferme sans quitter la liste ; depuis une liste, Retour ramène à « Mes listes ».
5. **Ordinateur** (fenêtre d'au moins 1024 px de large) : « Mes listes » à gauche, la liste choisie au centre.
6. **Lecteur d'écran** (VoiceOver sur iPhone, TalkBack sur Android) : la pastille d'état est annoncée comme un bouton, « À jour, synchroniser maintenant » (ou « Hors ligne, synchroniser maintenant ») ; un double appui relance la synchronisation ; quand l'état change, le nouvel état est annoncé une seule fois. Les autres points précisent ce qu'un lecteur d'écran doit dire.

**Clavier**

7. **Aucun clavier ouvert tout seul** : aucun écran ni aucune fenêtre n'ouvre le clavier de lui-même ; il ne s'ouvre que quand on touche un champ (connexion, code, édition en ligne, page publique comprises). Fermer une feuille (croix, Retour du téléphone, Enregistrer) ou changer d'écran replie le clavier. En touchant le champ du code à 6 chiffres, le clavier numérique s'ouvre.
8. **Clavier de l'iPhone et barre du haut** (iPhone, application installée et Safari) :
    1. Dans une liste longue, toucher « Ajouter un élément » : le clavier s'ouvre, la barre du haut (retour, nom, tri, ⋮) reste visible en haut, la liste se raccourcit, le champ est juste au-dessus du clavier. Faire défiler la liste : la barre ne bouge pas. Fermer le clavier : tout revient, sans saut.
    2. Entre la barre d'ajout (champ, « Scanner », « + ») et la barre grise du clavier (flèches et coche, dessinée par l'iPhone), aucune bande blanche : seulement la petite marge habituelle sous le champ. Clavier replié, la barre d'ajout reprend sa marge du bas et reste au-dessus du trait de l'iPhone. Même chose dans une fiche d'un article (curseur dans « Nom ») et dans « Nouvelle liste » (bouton « Enregistrer » en bas).
    3. Fiche d'un élément : toucher Nom, Quantité, Note, puis Code-barres : à chaque fois, le titre de la feuille reste visible, le champ aussi, au-dessus du clavier ; la feuille défile.
    4. Administration › Courses › Articles : toucher la recherche, puis un crayon pour corriger un nom : la barre du haut reste visible, le champ aussi.
    5. Sur « Mes listes » et dans une liste, tirer la liste au-delà du bout (rebond) : seule la liste bouge, la barre du haut reste collée en haut, sous l'encoche ou l'îlot dynamique.
    6. Champs de nom (élément, liste, catégorie, magasin, rayon, correction d'un nom dans l'Administration) : le clavier ne propose pas « Préremplir le contact ». À la connexion, le gestionnaire de mots de passe propose toujours l'identifiant et le mot de passe.
    7. Sur Android : rien de tout cela ne change.
9. **Un seul appui suffit, clavier ouvert** (iPhone et Android) : à chaque fois, toucher d'abord un champ (le clavier s'ouvre), puis le bouton, une seule fois.
    1. Champ d'ajout : « + » ajoute une seule fois. Un article nouveau ouvre « Dans quel rayon ? », qui reste ouverte, entièrement visible, sans clavier ; choisir un rayon : un seul ajout. La touche Entrée (ou « OK ») ajoute aussi, une seule fois.
    2. Poser le doigt sur « + », le faire glisser hors du bouton, relâcher : rien n'est ajouté, le texte reste. Champ vide (ou des espaces seulement) : rien n'est ajouté.
    3. « Scanner » : le sélecteur d'images (iPhone) ou la feuille « Prendre une photo / Choisir dans la galerie » (Android) s'ouvre du premier coup, et le clavier se replie.
    4. Une suggestion (taper « La ») : l'article est ajouté une seule fois. « Ajouter « … » » d'un nom nouveau : « Dans quel rayon ? » s'ouvre et reste ouverte.
    5. Fiche d'un article, curseur dans « Nom » : « Ajouter une photo », puis la disquette (la fiche s'enregistre et se ferme), puis la croix (la fiche se ferme) ; un rayon dans la feuille, « Annuler » d'un message, le menu ⋮.
    6. « Nouvelle liste » et « Modifier la liste », curseur dans le titre : « Enregistrer », puis la croix « Fermer sans enregistrer ». « Nouveau rayon… » (ou « Nouveau magasin… ») : « Créer ». Administration (Catégories, Courses › Magasins, Rayons) : « Ajouter ».
    7. Avec VoiceOver ou TalkBack, si possible : « Ajouter » se lit, un double appui ajoute une seule fois.
10. **Fin d'ajout** (toutes les listes réglées sur « Rester sur la liste », avec « + » comme avec Entrée) : le champ se vide, le clavier se replie, l'article ou l'élément ajouté est brièvement mis en évidence, et son groupe se déplie s'il était replié (liste de courses : son rayon ; liste de tâches triée « Par priorité » : « Priorité normale »). Le clavier ne se rouvre pas tout seul ; toucher le champ le rouvre pour l'élément suivant. Le mode scan se ferme avec « Ajouté : … ».
    1. **« Après l'ajout » : « Ouvrir la fiche »** (iPhone et Android, application installée) : dans une liste de tâches (nouvelle, ou existante avec la priorité ou l'échéance activée), taper un élément et toucher « + » : le clavier se replie, puis la fiche « Modifier l'élément » s'ouvre sur cet élément, en bas de l'écran, sans saut et sans clavier (aucun champ n'a le curseur) ; priorité et échéance y sont si elles sont activées. Même chose avec la touche Entrée (ou « OK »). Régler la priorité, puis la disquette : la ligne reflète le choix. Ajouter un autre élément puis fermer la fiche avec la croix : l'élément reste dans la liste. Aucune bande vide sous la fiche ni au-dessus du clavier avant qu'il se replie.
    2. **Rester sur la liste** : « Modifier la liste » → « Après l'ajout » → « Rester sur la liste », « Enregistrer » ; refaire « + » et Entrée : plus de fiche, le comportement du point 10. Une nouvelle liste de courses propose « Rester sur la liste », une nouvelle liste de tâches « Ouvrir la fiche » ; le choix suit la catégorie tant qu'on n'y a pas touché.
    3. **Liste de courses en « Ouvrir la fiche »** : toucher une suggestion (taper « La ») : la fiche de l'article s'ouvre ; un article inconnu : d'abord « Dans quel rayon ? », puis la fiche. Le mode scan, lui, ne change pas.
    4. **Deux téléphones** (A propriétaire, B membre « Peut modifier », même liste ouverte) : A change « Après l'ajout » ; sur B, sans recharger, l'ajout suivant suit le nouveau choix. B n'a pas « Modifier la liste ».
    5. **Hors ligne** (mode avion) : en « Ouvrir la fiche », l'ajout se fait et la fiche s'ouvre ; une modification enregistrée part au retour du réseau. Changer l'option hors ligne : prise en compte tout de suite, envoyée au retour du réseau.

**Mes listes**

11. **Carte compacte et compteur** : chaque carte a deux lignes : l'icône, le titre et « il y a … » en haut, avec le bouton ⋮ ; le compteur en bas à gauche, les pastilles des personnes en bas à droite ; ni catégorie, ni magasin, ni badge « Multi ». Un titre long passe sur deux lignes puis se termine par « … ». Une liste partagée avec moi en lecture seule a sa pastille « Lecture seule » à côté du compteur. Un lien public en cours : son symbole juste à gauche de la première pastille, et nulle part ailleurs. Compteur : une liste de 8 articles dont 3 cochés montre « 5/8 » ; supprimer un article non coché : « 4/7 » ; tout cocher : « 0/7 » avec une coche verte ; liste vide : « Liste vide ». VoiceOver ou TalkBack lit « 5 articles restants sur 8 » (« éléments » dans une liste de tâches). Vérifier en clair et en sombre, en texte agrandi.
12. **Tri de « Mes listes »** : le bouton de tri (à côté des Réglages, à partir de deux listes) bascule entre « Plus récentes d'abord » et « Ordre alphabétique » ; le choix reste après avoir fermé Listo.
13. **Menu ⋮ d'une carte** : le bouton ⋮ dans le coin de la carte ouvre un petit menu juste en dessous, sans ouvrir la liste. Propriétaire : « Modifier la liste », « Dupliquer la liste », « Partager par lien », puis, après un trait, « Supprimer la liste » (en rouge). Contributeur : « Dupliquer la liste », un trait, « Quitter la liste » ; invité : « Quitter la liste » seulement. Toucher ailleurs sur la carte ouvre la liste ; toucher à côté du menu le ferme. Dans une liste ouverte, le menu ⋮ propose exactement les mêmes actions. « Modifier la liste » puis la croix ou « Enregistrer » : retour à « Mes listes », carte à jour. « Supprimer la liste » demande « Supprimer la liste « Courses » ? » ; après « Supprimer », la carte disparaît (aussi sur l'autre téléphone).
14. **Dupliquer la liste** : la feuille propose « Courses (copie) » et « Copier les articles » activé, sans clavier ouvert. « Dupliquer » : on reste où l'on est, « Liste « Courses (copie) » créée · Ouvrir », la nouvelle carte s'éclaire brièvement ; la copie a les mêmes articles, tous décochés, sans photo, la même icône, et n'est partagée avec personne. En mode avion : « Connexion nécessaire pour dupliquer une liste ».
15. **Quitter la liste** (deux téléphones : A, propriétaire ; B, contributeur ou invité) : sur B, « Quitter la liste » : « Quitter la liste « Courses » ? Vous ne la verrez plus. Le propriétaire pourra de nouveau la partager avec vous. » ; « Quitter » : la carte disparaît. Depuis l'intérieur de la liste (menu ⋮) : retour à l'accueil, puis « Vous avez quitté la liste « Courses » ». Sur A, la liste des personnes se met à jour seule ; les articles ajoutés par B restent. En mode avion sur B : « Connexion nécessaire pour quitter une liste ». Le propriétaire n'a jamais « Quitter la liste ».
16. **Icône d'une liste** (A, propriétaire ; B, membre) : sur A, « Nouvelle liste » : sous « Catégorie », la grille (sept colonnes sur un téléphone de 390 px), la case du chariot entourée et cochée, aucun clavier ; toucher « Tâches » : la case cochée devient la liste cochée ; toucher le cadeau, « Enregistrer » : la carte et l'en-tête de la liste montrent le cadeau. « Modifier la liste » sans toucher la grille : l'icône ne change pas. Sur B, l'icône change sans recharger ; B n'a pas « Modifier la liste ». En mode avion sur A, changer l'icône : elle change tout de suite, puis passe au serveur au retour du réseau. Lecteur d'écran : chaque case dit son nom (« Cadeau, bouton radio, sélectionné »).

**Dans une liste**

17. **Groupes repliables** : dans une liste de courses, toucher l'en-tête « Fruits et légumes » : ses articles se cachent, le chevron se tourne vers la droite, son compteur « 2/3 » reste à droite. Fermer et rouvrir Listo : le rayon est toujours replié (sur ce téléphone seulement). « Tout replier » (à partir de deux groupes) replie aussi « Dans le panier » ; il devient « Tout déplier ». Cocher, scanner, ou un ajout fait depuis l'autre téléphone : l'état et la position de défilement ne bougent pas. Liste de tâches : en ordre alphabétique ou par échéance, pas d'en-tête ; triée par priorité, les groupes se replient aussi.
18. **Tri d'une liste de courses** : dans une liste de courses, le bouton « Trier la liste » (en haut, à côté du menu ⋮) ouvre « Par rayon » (coché) et « Ordre alphabétique » ; dans une liste à magasin « multi », « Par magasin ». Choisir « Ordre alphabétique » : les rayons disparaissent, un seul en-tête « À acheter » avec son compteur, les articles par ordre alphabétique (« éclair » avec les « E », majuscules ignorées). Cocher un article : il passe dans « Dans le panier ». Ouvrir sa fiche : son rayon est toujours là. Ajouter un article nouveau : « Dans quel rayon ? » est toujours demandé, l'article arrive dans « À acheter ». Fermer et rouvrir Listo : le tri est gardé. Sur l'autre téléphone (et pour un invité en lecture seule) : son propre tri, inchangé. Revenir à « Par rayon » : chaque article est dans son rayon, cocher marche comme avant. La page du lien public reste par rayon.
19. **Recherche** (iPhone et Android, application installée ; deux téléphones, A et B, sur la même liste ; en clair et en sombre) :
    1. **Champ masqué** : ouvrir une longue liste de courses : l'écran est le même qu'avant, aucun champ en haut. Tirer la liste vers le bas (ou remonter tout en haut) : « Rechercher dans la liste » apparaît au-dessus du premier rayon, sans clavier. Redescendre : il repart avec la liste. Liste de deux articles : le champ est aussi masqué à l'ouverture, se montre en tirant, et rien ne laisse de bande vide en bas.
    2. **Clavier ouvert puis fermé** : toucher le champ : le clavier s'ouvre, la barre du haut reste en place, la barre d'ajout disparaît, « Tout replier » laisse place au nombre de résultats pendant la saisie ; aucune bande vide entre la liste et le clavier. Touche « rechercher » du clavier : le clavier se ferme, la recherche reste, la barre d'ajout revient en bas, sans bande vide ni saut de la liste.
    3. **Accent** : taper « eclair » : « Éclair au café » est trouvé, « Éclair » est surligné en entier (gras et souligné) ; « 1 résultat » à droite de la pastille d'état ; VoiceOver ou TalkBack annonce le nombre. « OEUFS » trouve « Œufs ». La croix vide le champ en gardant le clavier ouvert ; « xyz » : « Aucun article ne correspond à « xyz ». », et « Effacer la recherche » fait comme la croix.
    4. **Article coché dans les résultats** : avec « Lait de coco » coché, taper « lait » : il apparaît barré dans « Dans le panier », sans « Tout remettre à acheter » ni « Retirer du panier ». Un rayon replié qui contient un résultat s'ouvre, et se replie de nouveau quand la recherche est vidée. Depuis les résultats : cocher, ouvrir la fiche, glisser pour supprimer marchent comme d'habitude. Même essai en « Ordre alphabétique » (« À acheter » montre le nombre de résultats) et dans une liste de tâches.
    5. **Pendant un ajout sur l'autre téléphone** : A tape « lait » et garde le clavier ouvert ; B ajoute « Lait d'amande » : il apparaît dans les résultats de A en quelques secondes, sans fermer le clavier ni effacer la saisie.
    6. **« Mes listes »** : tirer vers le bas : « Rechercher une liste » apparaît au-dessus des cartes, sans loupe dans la barre du haut ; le toucher masque « Nouvelle liste ». Taper « cour » : seules les listes dont le titre contient « cour » restent, « Cour » surligné, « 2 listes » au-dessus des cartes ; une liste partagée avec moi est trouvée aussi. Ouvrir une liste puis revenir : la recherche est vidée. Changer de liste vide aussi la recherche de la liste.
    7. En mode avion, et pour un invité en lecture seule : la recherche marche de la même façon.
20. **Zone des articles cochés** : cocher un article : il quitte son rayon pour « Dans le panier · 1 » en bas (« Terminés » dans une liste de tâches) ; un rayon dont tout est coché disparaît. Replier la zone, fermer et rouvrir Listo : elle est restée repliée. « Tout remettre à acheter » et « Retirer du panier » demandent confirmation par une feuille ; sur l'autre téléphone, le changement arrive en quelques secondes. En mode avion, « Tout remettre à acheter » marche aussi et part au retour du réseau.
21. **Fiche d'un article** : en-tête : la poubelle (rouge), un espace, la disquette bleue « Enregistrer », la croix ; la disquette enregistre et ferme (la touche Entrée d'un champ aussi), sans laisser le clavier ouvert ; la poubelle supprime tout de suite, avec « « Pain » supprimé · Annuler » quelques secondes. En faisant défiler une fiche longue (avec une photo), l'en-tête reste visible. Liste de courses : « Quantité (par exemple 2 ou 500 g) » et « Code-barres (8, 12 ou 13 chiffres) », l'aide en petit à côté du titre ; le champ Code-barres a son bouton de scan sur la même ligne, et une petite croix qui le vide sans ouvrir le clavier.
22. **Glisser pour supprimer** : sur une ligne, glisser le doigt vers la gauche : la ligne suit le doigt et une zone rouge « Supprimer » apparaît. Lâcher après un petit glissement : la ligne revient ; après un grand glissement : elle reste ouverte. Toucher « Supprimer » : la ligne disparaît, « « Pain » supprimé · Annuler » ; « Annuler » la remet. Faire défiler la liste normalement (rien ne s'ouvre, une ligne ouverte se referme), glisser en diagonale (la liste défile), toucher une autre ligne ou glisser vers la droite (la ligne ouverte se referme), toucher la case et la vignette (inchangé). Sur iPhone, dans Safari, le geste « retour » depuis le bord gauche fonctionne toujours. En mode avion : la suppression attend le réseau.
23. **Priorité et échéance** : « Nouvelle liste », catégorie Tâches : « Options des éléments » montre « Priorité » et « Échéance », désactivées ; sous chaque titre, seulement sa description (« Basse, normale ou élevée. », « Une date limite ; retards signalés. »), qui ne change pas quand on touche l'interrupteur ; avec VoiceOver ou TalkBack, chaque interrupteur est annoncé avec son titre, son état et sa description. Les deux options disparaissent si l'on choisit Courses (« Après l'ajout » reste). Créer une liste avec la priorité seulement : la fiche n'a pas d'« Échéance », « Trier la liste » propose « Ordre alphabétique » et « Par priorité ». Sur l'autre téléphone, fiche ouverte pendant que le propriétaire désactive la priorité : le champ disparaît, l'enregistrement marche. Réactiver : les priorités saisies reviennent. « Aujourd'hui », « Demain » et « En retard » changent à minuit.
24. **Magasin « multi »** : Administration → Courses → Magasins, créer un magasin « Multi » et cocher ses magasins ; créer une liste de courses avec ce magasin. Ajouter un article nouveau : son magasin est demandé ; l'ajouter une deuxième fois : il retrouve son magasin sans question. En faisant défiler, l'en-tête du magasin reste collé en haut.
25. **Nouveau magasin, nouveau rayon** (compte qui n'est pas Admin) : un article inconnu : « Dans quel rayon ? » finit par « Nouveau rayon… » ; le toucher ouvre « Nouveau rayon », sans clavier ; taper « Surgelés », « Créer » : le choix revient avec « Surgelés » sélectionné. Dans la fiche d'un article, changer la quantité, puis « Rayon » → « Nouveau rayon… » : la fiche garde la quantité tapée. Taper « crèmerie » : « Le rayon « Crèmerie » existe déjà… » et « Choisir « Crèmerie » ». « Nouvelle liste » → Magasin → « Nouveau magasin… » : le titre tapé reste. Sur l'autre téléphone, le nouveau rayon est proposé sans recharger. En mode avion : « Connexion nécessaire pour créer un rayon », l'article s'ajoute quand même.
26. **Photo d'un article** (en HTTPS) : dans la fiche, « Ajouter une photo » (« Changer la photo » quand il y en a une). Sur iPhone et sur ordinateur, il ouvre directement le sélecteur d'images du téléphone. Sur Android (Chrome, Brave, Samsung Internet ; si possible Android 14 ou plus), une petite feuille « Photo de l'article » monte par-dessus la fiche, avec « Prendre une photo » (l'application appareil photo s'ouvre), « Choisir dans la galerie » et « Annuler » (la fiche garde ce qui y était tapé) ; Retour ne ferme que la feuille. La photo reste facultative ; une photo prise en portrait reste dans le bon sens ; elle apparaît en vignette, un appui l'agrandit, Retour la referme ; sur l'autre téléphone, elle apparaît toute seule.
27. **Mode scan** (listes de courses, en HTTPS) : voir la liste « [À tester sur les téléphones](#à-tester-sur-les-téléphones) » de la section « Mode scan ».

**Partage**

28. **Droit par personne** (deux téléphones : A, propriétaire ; B, invité puis contributeur) :
    1. Sur A, « Nouvelle liste » : cocher la personne B ; dessous apparaissent « Peut modifier » et « Lecture seule », cette dernière déjà choisie (coche et texte). Votre propre ligne affiche « Tous les droits », sans choix. « Modifier la liste » montre le même choix.
    2. Sur B, la carte porte la pastille « Lecture seule ». Dans la liste : bandeau « Lecture seule », pas de champ d'ajout ni de « Scanner » ; les cases sont visibles mais ne cochent rien ; glisser une ligne ne fait rien ; toucher une ligne ouvre « Détail de l'article » sans clavier, ni « Enregistrer », ni poubelle ; la photo s'agrandit. Le tri, le repli des groupes et « Tout replier » marchent.
    3. B ouvert sur la liste, une fiche ouverte ou le clavier sorti : sur A, passer B en « Peut modifier ». Sur B, sans recharger : la fiche se ferme, le clavier se replie, le champ d'ajout apparaît, « Vous pouvez maintenant modifier cette liste. ». Puis l'inverse : « Cette liste est maintenant en lecture seule. ».
    4. B en « Peut modifier » et en mode avion : cocher un article et en ajouter un. Sur A, passer B en « Lecture seule ». Couper le mode avion sur B : « Cette liste est maintenant en lecture seule : vos modifications hors ligne n'ont pas été envoyées. », l'article coché redevient décoché, l'article ajouté disparaît, rien ne reste en attente.
    5. Lecteur d'écran sur B : chaque case est annoncée « Coché » ou « Non coché » ; une ligne, « Voir <nom> ». Sur A : « Droit de <nom> sur la liste », puis le choix actif.
29. **Lien public** (en HTTPS) :
    1. Une liste dont vous êtes propriétaire → menu ⋮ → « Partager par lien ». « 24 heures » est coché. Cocher « Protéger par mot de passe », puis « Créer le lien ». Le lien et le mot de passe s'affichent ; « Copier le lien » et « Copier » fonctionnent. Fermer puis rouvrir la feuille : le mot de passe est masqué.
    2. Ouvrir le lien sur un téléphone **sans compte Listo** (ou en navigation privée) : la page demande le mot de passe, sans rien montrer de la liste. Un mauvais mot de passe affiche « Mot de passe incorrect » ; le bon affiche la liste avec le bandeau « Lecture seule », sans case cliquable ni champ d'ajout. Une vignette s'agrandit au toucher. « Actualiser » montre un article ajouté entre-temps. Mode sombre du téléphone : la page suit.
    3. « Nouveau mot de passe » : « Actualiser » redemande le mot de passe ; l'ancien est refusé. « Retirer le mot de passe » : la liste s'ouvre directement.
    4. « Changer la durée » → « 1 heure » : la date d'expiration change ; une heure plus tard, « Lien expiré ou inexistant ». « Arrêter le partage » : même message, tout de suite.
    5. Mode avion chez le propriétaire : la feuille affiche « Indisponible hors ligne », boutons grisés.
    6. Le lien envoyé par une messagerie (WhatsApp, Signal, SMS) n'affiche pas d'aperçu du contenu : au plus « Listo · Liste partagée ».
    7. **Fiche d'un article** (iPhone et Android, lien ouvert dans le navigateur, sans compte ; sur Android, avec la barre de navigation à trois boutons puis en mode gestes) : préparer un article avec une photo, une longue note et un code-barres, et un article coché. Toucher la ligne de l'article : la feuille « Détail de l'article » monte, sans clavier ni bouton qui modifie, entièrement au-dessus de la barre de navigation ; elle montre le nom, « À acheter », la quantité, la note en entier, le code-barres, la photo et le rayon. Faire glisser le doigt dans la fiche : son contenu défile, le titre et la croix restent en haut, la liste derrière ne bouge pas ; tout en bas, « Rayon » et sa valeur se voient en entier, avec une marge dessous. Faire défiler la page pour replier puis montrer la barre d'adresse de Chrome : la fiche suit. Même essai téléphone tourné en paysage. Toucher la photo : elle s'agrandit ; Retour du téléphone : la photo se ferme, la fiche reste ; Retour encore : la fiche se ferme, la page du lien reste ouverte (on ne quitte pas la page). La croix ferme aussi. L'article coché montre « Coché, dans le panier » et son rayon. Avec un lien protégé : la fiche ne s'ouvre qu'après le bon mot de passe ; lien expiré (« Actualiser ») : « Lien expiré ou inexistant ». VoiceOver ou TalkBack : la ligne se lit « Voir Lait… », la fermeture rend la main sur la ligne. Clair et sombre.

**Synchronisation**

30. **Temps réel** (deux téléphones sur la même liste) : un article coché sur l'un est coché sur l'autre en moins de 3 secondes, sans rien toucher. Renommer une catégorie ou un magasin dans l'Administration : les cartes et le sous-titre d'une liste ouverte changent sur l'autre téléphone en quelques secondes. Mettre un téléphone en mode avion quelques secondes, puis le rallumer : les changements faits entre-temps arrivent tout seuls. Si les changements n'arrivent qu'au bout d'une minute environ, voir le [chapitre 3 du guide d'exploitation](exploitation.md#3-régler-nginx-proxy-manager).
31. **Hors ligne** (sur le vrai sous-domaine en HTTPS : le service worker ne marche pas en simple `http://` sur l'adresse du réseau local) :
    1. Ouvrir Listo une fois avec du réseau, ouvrir une liste et une photo déjà prise.
    2. **Mode avion** : ajouter 3 articles, en cocher 2, prendre 1 photo. Tout s'affiche aussitôt ; la pastille indique « Hors ligne · N en attente ». Administration, partage, duplication et « Quitter la liste » expliquent qu'il faut une connexion. La photo vue au point 1 s'affiche encore. La page « Aide » s'ouvre.
    3. **Fermer complètement Listo**, puis le rouvrir, toujours en mode avion : l'application s'ouvre, les listes et les modifications en attente sont là.
    4. **Retour du réseau** : la pastille repasse à « À jour » en quelques secondes. Sur l'autre téléphone : les 3 articles, les 2 cochages et la photo apparaissent, sans doublon.
    5. **Mise en veille** : en mode avion, faire une modification, verrouiller le téléphone quelques minutes, couper le mode avion, déverrouiller : la modification part toute seule.
    6. **Application installée** : refaire les points 2 à 4 en ouvrant Listo depuis son icône (sur iPhone, l'application installée a sa propre copie, séparée de Safari).
    7. **Déconnexion avec des modifications en attente** (en mode avion) : Réglages → Se déconnecter avertit et propose « Rester connecté ».
    8. **Modification refusée** : sur A en mode avion, modifier un article ; sur B, supprimer cet article. Au retour du réseau de A : « Une modification n'a pas pu être enregistrée : … » et l'article reste supprimé.

**Nouveautés**

32. **Nouveautés** (iPhone et Android, application installée ; deux téléphones, A et B, et trois comptes : A, propriétaire ; B, contributeur ; C, invité en lecture seule sur la même liste, sur le téléphone B ou dans un autre navigateur) :
    1. **Liste fermée, puis ouverte** : sur B, rester sur « Mes listes ». Sur A, ajouter « Café » et modifier la quantité de « Lait ». Sur B, sans rien toucher : la carte porte la pastille « 2 », dans le coin de l'icône, sans que la carte grandisse ni qu'un texte soit caché. Ouvrir la liste : « Café » et « Lait » sont surlignés, avec « Ajouté par A » et « Modifié par A » sous le nom. Revenir à « Mes listes » : plus de pastille ; C (qui n'a rien ouvert) a toujours la sienne. A n'a jamais de pastille pour ses propres ajouts.
    2. **Halo pendant la visite, absent à la suivante** : sur B, rouvrir la liste après une nouveauté ; toucher la ligne « Café » : son halo s'en va, celui des autres reste. Quitter la liste puis la rouvrir : plus aucun halo.
    3. **Ajout en direct** : B a la liste ouverte, écran allumé. Sur A, ajouter « Thé » : la ligne apparaît sur B avec le halo « Ajouté par A » ; en revenant à « Mes listes », pas de pastille.
    4. **Application en arrière-plan** : B ouvre la liste, puis passe à une autre application (ou verrouille le téléphone) sans fermer Listo. Sur A, ajouter « Riz ». Sur un autre appareil de B (ou après coup sur « Mes listes »), la nouveauté n'est pas vue tant que B n'est pas revenu dans Listo ; au retour, « Riz » a le halo.
    5. **Plusieurs appareils du même compte** : B connecté sur deux appareils ; ouvrir la liste sur l'un : la pastille disparaît sur l'autre en quelques secondes.
    6. **Sourdine** : sur C (invité), menu ⋮ de la liste : « Ne plus me signaler cette liste », puis un ajout sur A : ni pastille, ni halo, ni nombre sur l'icône de l'application. « Signaler cette liste » rétablit les pastilles pour les ajouts suivants.
    7. **Réglages** : Réglages › Mon compte › « Nouveautés » : sous chaque titre, seulement sa description (pas d'« Activé » ni de « Désactivé » : la position du bouton montre l'état) ; le texte ne change pas quand on bascule. Avec VoiceOver ou TalkBack, chaque interrupteur est annoncé avec son titre, son état (activé / désactivé) et sa description. « Signaler les éléments cochés » (description « Ce que les autres cochent ou décochent. ») désactivé : un article coché sur A ne donne rien sur B ; activé : « Coché par A ». « Nouveautés » désactivé : la ligne « Signaler les éléments cochés » disparaît (ni visible, ni atteinte par Tab ou le lecteur d'écran), sans saut d'écran, le curseur du lecteur d'écran reste sur « Nouveautés » ; plus aucune pastille ni halo, sur tous les appareils de B. « Nouveautés » réactivé : la ligne revient avec sa valeur d'avant (activée si elle l'était).
    8. **Hors ligne** : B en mode avion avec une pastille déjà là : la pastille et le halo s'affichent ; ouvrir la liste puis couper le mode avion : la pastille disparaît aussi sur les autres appareils de B.
    9. **Icône de l'application installée** (si le téléphone l'affiche ; Android : selon le lanceur, iPhone : réglages de notification de l'application) : le nombre total de nouveautés apparaît sur l'icône et disparaît quand tout est vu. Rien ne se passe sur un téléphone qui ne le permet pas : c'est normal.

**Accès depuis Claude** (`LISTO_MCP=on`, en HTTPS)

33. **Autoriser Claude** (iPhone et Android : navigateur et application installée ; un ordinateur pour Claude Code) :
    1. **Consentement** : dans claude.ai, Connecteurs, « Ajouter un connecteur personnalisé », coller `https://<votre domaine>/mcp` (le serveur `/mcp` arrive à l'étape B : en attendant, l'essai s'arrête après l'autorisation). Le navigateur ouvre Listo sur « Autoriser Claude » ; sans session, l'écran de connexion passe d'abord (avec le code 2FA si elle est activée), puis la demande revient. Aucun champ n'a le curseur tout seul ; tout tient à l'écran sans défilement horizontal, en clair et en sombre.
    2. **Hôte de retour affiché** : la ligne « La réponse sera envoyée ici » montre « claude.ai ». Avec Claude Code (`claude mcp add --transport http listo https://<votre domaine>/mcp`, puis `/mcp`), elle montre « une application sur cet ordinateur (localhost) », avec l'avertissement rouge. L'avertissement « Ne continuez que si vous venez de lancer la connexion depuis Claude » est toujours là.
    3. **Choix** : « Lecture seule » est cochée au départ ; « Lecture et ajout » demande un appui volontaire. « Toutes mes listes » est coché au départ ; « Certaines listes » fait apparaître les listes à cocher.
    4. **Mot de passe redemandé** : un mot de passe faux affiche « Mot de passe incorrect. » ; cinq essais faux bloquent 15 minutes (« Trop de tentatives »). Avec la 2FA, le code est aussi demandé. Le bon mot de passe ramène vers Claude.
    5. **Refus** : « Refuser » ramène vers Claude, qui affiche que l'accès a été refusé ; dans `docker logs listo`, une ligne `claude.refus` (sans jeton ni code).
    6. **Révocation** : changer son mot de passe dans Listo ; Claude doit redemander l'autorisation (ligne `claude.revocation`).
    7. **Lecture par Claude** (étape B ; claude.ai, application mobile, Claude Desktop, Claude Code) : « Quelles sont mes listes Listo ? » donne les listes autorisées, et elles seules ; « Qu'y a-t-il dans les courses ? » donne les articles non cochés, avec quantité et rayon, sans nom de personne. Retirer une personne d'une liste partagée : sa liste disparaît aussitôt de ce que voit son Claude. Une liste réglée en « Certaines listes » à l'autorisation : les autres n'apparaissent jamais. `docker logs listo` : une ligne `claude.outil` par question, sans contenu.
    8. **Ajout et cochage par Claude** (étape C ; connexion « Lecture et ajout ») : « Ajoute du lait et des œufs aux courses » : sur un autre téléphone ouvert sur la liste, les deux articles arrivent en direct, dans leur rayon habituel, avec « Ajouté par » le prénom du compte, et la pastille des Nouveautés pour les autres membres. Redemander aussitôt : Claude répond qu'ils y sont déjà. « Coche le pain » : la ligne passe dans « Dans le panier ». Avec une connexion « Lecture seule », ou un compte invité en lecture seule : Claude répond qu'il ne peut pas écrire, rien ne change.
    9. **Connexions Claude** (étape D ; clair et sombre) : Réglages › Mon compte › « Connexions Claude » (absent si `LISTO_MCP` n'est pas activé) : l'adresse à saisir et « Copier l'adresse » (la coller dans une note pour vérifier) ; chaque connexion avec son application, « Lecture seule » ou « Lecture et ajout », ses listes, sa date et « Dernière utilisation : jamais » avant la première question. « Déconnecter » ouvre une confirmation ; après « Déconnecter », la question suivante dans Claude demande de se reconnecter. « Tout déconnecter » fait de même pour toutes. Réglages › Aide › « Pour tout le monde » : rubrique « Utiliser Listo avec Claude » avec la bonne adresse.

**Réglages et Administration**

34. **Réglages › À propos** (Admin) : sur une ligne, « Version : 7025130 » à gauche, puis à droite « À jour · il y a 4 min » (ou « Vérifié il y a 4 min ») et le bouton d'actualisation. Quand une nouvelle version existe, une seconde ligne montre seulement « Nouvelle version : <commit> » (touchée, elle ouvre ce commit sur GitHub). Sur un petit téléphone (largeur 360, texte agrandi), le texte et le bouton passent ensemble sous la version, sans rien couper.
35. **Administration** (compte Admin, sur un téléphone) : trois onglets, « Comptes », « Catégories », « Courses », sans barre qui glisse. « Courses » affiche en dessous « Magasins » (choisi), « Rayons », « Articles » ; le choix actif est souligné et plus foncé. Choisir « Articles », aller sur « Comptes », revenir sur « Courses » : « Articles » est retrouvé. Rafraîchir la page sur « Rayons » : on y reste. « Articles » : chaque article montre son rayon habituel, puis le crayon (« Corriger »), le magasin (« Modifier le rayon de … ») et la poubelle (« Retirer ») ; le magasin ouvre « Rayon de « Lait » » (rayons actifs puis « Aucun rayon », le rayon actuel coché, aucun clavier) ; choisir « Fromages », « Enregistrer » : la ligne affiche « Fromages » ; un « Lait » déjà dans une liste garde son rayon, un nouvel ajout va en « Fromages ». Vérifier en clair et en sombre ; un compte qui n'est pas Admin ne voit pas l'Administration.
36. **Relire l'aide** (Réglages › Aide) : la page s'ouvre, « Retour » ramène aux Réglages ; rafraîchir sur `#/aide` : on y reste ; en mode avion (après un premier chargement), elle s'affiche. Seule « Pour tout le monde » est dépliée ; chaque en-tête replie ou déplie sa section. Un compte Utilisateur voit quatre sections, un Admin cinq (« Administrateur » en plus). Relire le texte en se plaçant tour à tour en propriétaire, contributeur, invité (compte « Lecture seule », puis lien public) et Admin : chaque phrase doit correspondre à ce que l'application fait vraiment (boutons, menus, droits). Vérifier en clair et en sombre, et à 320 px de large.

**Maintien à jour de l'aide** : une évolution qui change un droit, un écran ou le libellé d'un bouton cité met à jour l'aide, dans `public/js/help-content.js`, puis refait le point 36. Les tests `test/help.test.js` et `test/help-labels.test.js` vérifient la structure et que chaque libellé cité entre « » existe dans l'interface, mais pas que chaque phrase est juste.

## API des comptes (étape 2)

| Route | Rôle |
| --- | --- |
| `GET /api/setup` | Indique s'il faut créer le premier Admin (`{"needed": true}`) |
| `POST /api/setup` | Crée le premier Admin : `code` (code de démarrage), `username`, `displayName`, `password` |
| `POST /api/login` | Connexion : `username`, `password`. Si la 2FA est active, répond `{"twoFactorRequired": true}` |
| `POST /api/login/2fa` | Saisie du code à 6 chiffres (ou d'un code de secours) : `code` |
| `POST /api/logout` | Déconnexion |
| `GET /api/me` | Compte connecté |
| `POST /api/me/password` | Changer son mot de passe : `currentPassword`, `newPassword` |
| `POST /api/me/2fa/enable` | Commencer l'activation de la 2FA : renvoie le secret (à recopier) ; le QR code est l'image `qr.png` ci-dessous |
| `GET /api/me/2fa/qr.png` | Image PNG du QR code de l'activation en cours (utilisée par l'interface, pour garder une CSP stricte sans image `data:`) |
| `GET /api/about` | Version installée, pour Réglages › À propos : `{ "commit": "<40 caractères>", "build": "<16 caractères>" }` ; `commit` vaut `"non précisé"` et `build` `null` sur une image construite à la main (développement). Comptes connectés seulement, jamais public. Le commit vient de la construction de l'image (`build-arg GIT_COMMIT` → variable `LISTO_COMMIT`). `build` : identifiant opaque de la version (voir « Nouvelle version de Listo ») |
| `GET /api/admin/update-check` | Vérification de mise à jour (Réglages › À propos, Admin seulement, voir `server/update-check.js`) : `{ current, latest, upToDate, checkedAt, state }`, `state` valant `ok`, `indisponible`, `desactive` (`LISTO_UPDATE_CHECK=off`) ou `developpement` (commit non précisé). `?force=1` : « Vérifier maintenant ». Le serveur demande à l'API publique de GitHub le dernier passage réussi du workflow « Image Docker » sur `main` (sans jeton, délai de 5 s, 256 ko au plus, aucune redirection suivie, commit de 40 caractères hexadécimaux exigé). Résultat gardé une heure ; `force` accepté une fois par minute ; une panne donne `indisponible`, jamais une erreur. Dans les tests, GitHub est simulé (`githubRequest` de `createApp`) |
| `POST /api/me/2fa/verify` | Confirmer avec un premier code : `code`. Renvoie les 10 codes de secours |
| `POST /api/me/2fa/disable` | Désactiver sa 2FA : `password`, `code` |

Règles : mot de passe de 10 caractères minimum ; 5 échecs en 15 minutes (même identifiant ou même adresse IP) bloquent 15 minutes ; toute requête de modification doit porter l'en-tête `Origin` égal à `LISTO_PUBLIC_URL`.

### Vérifier à la main avec curl

Démarrer Listo en local (`docker compose -f docker-compose.dev.yml up --build`), puis dans un autre terminal. Le fichier `cookies.txt` joue le rôle du navigateur : il garde le cookie de session.

```sh
# Raccourcis
U=http://localhost:3000
O="Origin: http://localhost:3000"
J="Content-Type: application/json"

# 1. Le code de démarrage s'affiche dans les journaux
docker logs listo-dev

# 2. Créer le compte Admin (remplacer XXXX-XXXX-XXXX par le code)
curl -c cookies.txt -b cookies.txt -H "$O" -H "$J" \
  -d '{"code":"XXXX-XXXX-XXXX","username":"guillaume","displayName":"Guillaume","password":"un mot de passe long"}' \
  $U/api/setup

# 3. Qui suis-je ?
curl -b cookies.txt $U/api/me

# 4. Une requête sans en-tête Origin est refusée (protection CSRF)
curl -b cookies.txt -X POST $U/api/logout

# 5. Déconnexion, puis 6 essais avec un mauvais mot de passe : le 6e est bloqué
curl -b cookies.txt -c cookies.txt -H "$O" -X POST $U/api/logout
for i in 1 2 3 4 5 6; do
  curl -H "$O" -H "$J" -d '{"username":"guillaume","password":"mauvais mot de passe"}' $U/api/login; echo
done
# (attendre 15 minutes, ou redémarrer le conteneur, pour être débloqué)

# 7. Se reconnecter
curl -c cookies.txt -b cookies.txt -H "$O" -H "$J" \
  -d '{"username":"guillaume","password":"un mot de passe long"}' $U/api/login

# 8. Activer la 2FA : la réponse contient « secret » (à saisir à la main dans
#    l'application d'authentification du téléphone, compte « Listo »). Le QR
#    code à scanner est l'image PNG renvoyée par /api/me/2fa/qr.png
curl -b cookies.txt -H "$O" -X POST $U/api/me/2fa/enable
curl -b cookies.txt -o qr.png $U/api/me/2fa/qr.png

# 9. Confirmer avec le code affiché par le téléphone : la réponse contient
#    les 10 codes de secours (ils ne seront plus jamais affichés)
curl -b cookies.txt -H "$O" -H "$J" -d '{"code":"123456"}' $U/api/me/2fa/verify

# 10. Déconnexion puis reconnexion : après le mot de passe, le code est demandé
curl -b cookies.txt -c cookies.txt -H "$O" -X POST $U/api/logout
curl -c cookies.txt -b cookies.txt -H "$O" -H "$J" \
  -d '{"username":"guillaume","password":"un mot de passe long"}' $U/api/login
curl -b cookies.txt $U/api/me                      # refusé : pas encore de session
curl -c cookies.txt -b cookies.txt -H "$O" -H "$J" -d '{"code":"654321"}' $U/api/login/2fa
curl -b cookies.txt $U/api/me                      # connecté

# 11. Changer son mot de passe (les autres appareils sont déconnectés)
curl -c cookies.txt -b cookies.txt -H "$O" -H "$J" \
  -d '{"currentPassword":"un mot de passe long","newPassword":"un autre mot de passe"}' $U/api/me/password

# 12. Le journal de sécurité (sans aucun mot de passe, jeton ni code)
docker logs listo-dev | grep journal
cat data/journal.log
```

### Journal de sécurité

Les connexions (réussies, échouées, bloquées), les changements de mot de passe, la double authentification et les actions d'administration sont notés, une ligne par événement :

```text
2026-10-16T22:17:03.952Z [journal] connexion_echouee utilisateur="guillaume" ip="203.0.113.7"
```

- **Où** : dans `docker logs listo` et dans le fichier `data/journal.log` (droits 600, lisible par Listo seul). Le fichier est dans le dossier `data`, donc conservé lors des mises à jour et sauvegardé avec la base.
- **Taille limitée** : quand `journal.log` atteint 1 Mo, il est renommé `journal.log.1`, l'ancien `.1` devient `.2`, et ainsi de suite jusqu'à `.5`. Le plus ancien est supprimé. Le journal occupe donc au plus 6 Mo.
- **Jamais de secret** : ni mot de passe, ni jeton, ni code. Un identifiant qui n'existe pas est noté `"(inconnu)"`, car ce peut être un mot de passe tapé dans le mauvais champ.
- **En cas de problème d'écriture** (disque plein, droits) : Listo continue de fonctionner normalement, et un message d'erreur apparaît une fois dans `docker logs`.

## API d'administration (étape 3)

Toutes ces routes sont réservées aux Admin (refus 403 pour un Utilisateur, 401 pour un visiteur non connecté). Elles ne donnent jamais accès au contenu des listes : on sait seulement si un élément est utilisé (`inUse`).

| Route | Rôle |
| --- | --- |
| `GET /api/admin/users` | Lister les comptes |
| `POST /api/admin/users` | Créer un compte : `username`, `displayName`, `role` (`admin` ou `user`), `password` (mot de passe initial) |
| `PATCH /api/admin/users/:id` | Modifier `displayName`, `role`, `active` (`false` pour désactiver, `true` pour réactiver) |
| `POST /api/admin/users/:id/password` | Réinitialiser le mot de passe : `password` |
| `DELETE /api/admin/users/:id/2fa` | Désactiver la 2FA d'un compte (téléphone et codes de secours perdus) |
| `DELETE /api/admin/users/:id` | Supprimer un compte qui n'a jamais servi |
| `GET /api/admin/categories` | Lister les catégories de liste (`isShopping` : liste de courses, avec magasin et rayons) |
| `POST /api/admin/categories` | Ajouter : `name`, `isShopping` |
| `PATCH /api/admin/categories/:id` | Modifier `name`, `active`, `isShopping` |
| `DELETE /api/admin/categories/:id` | Supprimer, seulement si jamais utilisée |
| `GET`, `POST /api/admin/stores` ; `PATCH`, `DELETE /api/admin/stores/:id` | Pareil pour les magasins (`name`, `active`). À la création, `isMulti` (`true` pour un magasin « multi », étape 6). Pour un « multi », `PATCH` accepte `storeIds` : la liste complète des magasins qu'il regroupe |
| `GET`, `POST /api/admin/aisles` ; `PATCH`, `DELETE /api/admin/aisles/:id` | Pareil pour les rayons (`name`, `active`) |
| `GET /api/admin/names?q=&sort=&offset=` | Onglet « Articles » (historique commun des noms d'articles saisis dans les listes de courses), 50 par morceau : `key` (nom normalisé), `name`, `aisle` (rayon habituel), `uses`, `inLists` (articles présents dans les listes de courses) ; `total`. `q` cherche sans accents ni majuscules, `sort` vaut `name` ou `uses` |
| `GET /api/admin/names/impact?from=&to=` | Ce que changerait une correction : `items` et `lists` (nombres d'articles et de listes de courses), `merge` (le nouveau nom existe déjà), `unchanged` |
| `POST /api/admin/names/rename` | Corriger un nom partout : `from` (nom normalisé), `to` (nouveau nom) |
| `POST /api/admin/names/remove` | Retirer un nom des suggestions : `from`. Les listes ne changent pas |
| `POST /api/admin/names/aisle` | Changer le rayon habituel d'un nom : `from`, `aisleId` (rayon existant et actif, ou `null` pour aucun ; sinon 400 « Rayon inconnu ou désactivé. »). Toutes les lignes du nom (générale et par magasin) ; les listes ne changent pas. Réponse : `{ aisleId, aisle }` |

Règles :

- **Garde-fous des Admin** : un Admin ne peut ni se désactiver, ni se retirer le rôle Admin, ni supprimer son propre compte. Il reste toujours au moins un Admin actif. Son propre mot de passe et sa propre 2FA se changent depuis ses réglages (`/api/me/...`), où l'ancien mot de passe est demandé.
- **Fin des sessions** : désactiver un compte le déconnecte tout de suite de tous ses appareils, et il ne peut plus se connecter (même réponse qu'un mauvais mot de passe). Réinitialiser un mot de passe ferme aussi toutes ses sessions.
- **Mot de passe à changer** : un mot de passe choisi par un Admin (création du compte ou réinitialisation) doit être changé à la connexion suivante. La connexion répond `"mustChangePassword": true`. Tant que ce n'est pas fait, seuls `GET /api/me`, `POST /api/me/password` et `POST /api/logout` sont permis, et le nouveau mot de passe doit être différent.
- **Supprimer ou désactiver** : un compte, une catégorie, un magasin ou un rayon déjà utilisé ne peut pas être supprimé, seulement désactivé.
  - Un compte est utilisé s'il possède une liste, a créé un article ou est membre d'une liste.
  - Une catégorie ou un magasin est utilisé par une liste. Un magasin l'est aussi s'il est regroupé par un « multi », ou s'il est le magasin d'un article ou de l'historique.
  - Un rayon est utilisé par un article ou par l'historique d'autocomplétion.
  - Un élément désactivé reste sur les listes qui l'utilisent déjà, mais ne sera plus proposé ensuite.
- **Noms uniques** : deux noms qui ne diffèrent que par les majuscules ou les accents sont des doublons (« Épicerie salée » = « EPICERIE SALEE »). Les identifiants de compte sont uniques sans tenir compte des majuscules.
- **Journal** : chaque action d'administration est notée (qui, quoi, sur quel compte ou élément), sans jamais de mot de passe.
- **Onglet « Articles »** (`server/routes/admin-names.js` ; les routes gardent leur nom `/api/admin/names`) : l'Admin voit des noms et des compteurs, jamais une liste ni ses membres.
  - Corriger : en une seule transaction, toutes les lignes d'historique de l'ancien nom (générale et par magasin) et tous les articles non supprimés des listes de courses non supprimées dont le nom normalisé est l'ancien prennent le nouveau nom, avec une nouvelle date de modification (la synchronisation le récupère). Rien d'autre ne change sur ces articles. Les éléments des autres listes (tâches…) ne sont jamais comptés ni modifiés, même au même nom. Les membres des listes touchées sont prévenus en temps réel. Journal : `admin_nom_corrige` ou `admin_nom_fusionne` (ancien, nouveau, nombre de corrections et de listes).
  - Fusion, si le nouveau nom existe déjà : les lignes du même magasin sont réunies, utilisations additionnées, rayon de la ligne la plus utilisée (à égalité, celui du nom corrigé ; si elle n'a pas de rayon, celui de l'autre).
  - Même nom une fois normalisé (« creme fraiche » → « Crème fraîche ») : seul le nom affiché change, partout. Nom identique : rien à faire.
  - Retirer : seules les lignes d'historique sont effacées (`admin_nom_retire`).
  - Modifier le rayon : en une transaction, `aisle_id` de toutes les lignes du nom (générale et par magasin), et leur date `last_used_at` (c'est elle que suit la synchronisation des téléphones, comme pour une correction). Aucun article des listes ne change. Puis « event: refs » (les téléphones connectés relisent la mémoire tout de suite) et le journal `nom_rayon_modifie` (compte, nom de l'article, nom du rayon ou « aucun »). La liste de l'onglet renvoie aussi `aisleId`.
  - Sur les téléphones : les articles corrigés arrivent par la synchronisation habituelle. Un ancien nom corrigé ou retiré disparaît des suggestions à la prochaine synchronisation complète (ouverture de Listo, retour au premier plan).
  - Pas de nouvelle colonne en base : le nom normalisé des articles est calculé à la demande (`normalizeItemName`, partagé avec le téléphone).

### Données de départ

Créées une seule fois, au premier démarrage. Elles se modifient ensuite librement, et un élément supprimé ne revient pas au redémarrage suivant.

- **Catégories** : Courses (liste de courses), Tâches
- **Magasins** : Carrefour, E.Leclerc, Lidl
- **Rayons** : Boissons, Boucherie, Boulangerie, Crèmerie, Entretien, Épicerie salée, Épicerie sucrée, Fromages, Fruits et légumes, Hygiène, Poissonnerie, Surgelés

### Vérifier l'administration à la main avec curl

Avec les mêmes raccourcis `U`, `O` et `J` que plus haut, et `cookies.txt` connecté en tant qu'Admin :

```sh
# 1. Lister les comptes, les catégories, les magasins, les rayons
curl -b cookies.txt $U/api/admin/users
curl -b cookies.txt $U/api/admin/categories
curl -b cookies.txt $U/api/admin/stores
curl -b cookies.txt $U/api/admin/aisles

# 2. Créer le compte de Marie (elle devra changer ce mot de passe)
curl -b cookies.txt -H "$O" -H "$J" \
  -d '{"username":"marie","displayName":"Marie","role":"user","password":"mot de passe provisoire"}' \
  $U/api/admin/users

# 3. Marie se connecte (fichier marie.txt) : elle doit changer son mot de passe
curl -c marie.txt -b marie.txt -H "$O" -H "$J" \
  -d '{"username":"marie","password":"mot de passe provisoire"}' $U/api/login
curl -b marie.txt -H "$O" -X POST $U/api/me/2fa/enable        # refusé tant que ce n'est pas fait
curl -c marie.txt -b marie.txt -H "$O" -H "$J" \
  -d '{"currentPassword":"mot de passe provisoire","newPassword":"le mot de passe de marie"}' $U/api/me/password

# 4. Marie n'a pas accès à l'administration
curl -b marie.txt $U/api/admin/users

# 5. Modifier le nom affiché, puis désactiver Marie (remplacer 2 par son id) :
#    sa session est fermée aussitôt
curl -b cookies.txt -H "$O" -H "$J" -X PATCH -d '{"displayName":"Marie D."}' $U/api/admin/users/2
curl -b cookies.txt -H "$O" -H "$J" -X PATCH -d '{"active":false}' $U/api/admin/users/2
curl -b marie.txt $U/api/me                                   # refusé
curl -b cookies.txt -H "$O" -H "$J" -X PATCH -d '{"active":true}' $U/api/admin/users/2

# 6. Réinitialiser son mot de passe
curl -b cookies.txt -H "$O" -H "$J" -d '{"password":"nouveau provisoire"}' $U/api/admin/users/2/password

# 7. Un Admin ne peut pas se désactiver lui-même (id 1 = le premier Admin)
curl -b cookies.txt -H "$O" -H "$J" -X PATCH -d '{"active":false}' $U/api/admin/users/1

# 8. Rayons : ajouter, doublon refusé, renommer, désactiver, supprimer
curl -b cookies.txt -H "$O" -H "$J" -d '{"name":"Jardin"}' $U/api/admin/aisles
curl -b cookies.txt -H "$O" -H "$J" -d '{"name":"ÉPICERIE SALÉE"}' $U/api/admin/aisles     # doublon
curl -b cookies.txt -H "$O" -H "$J" -X PATCH -d '{"name":"Jardinage"}' $U/api/admin/aisles/13
curl -b cookies.txt -H "$O" -H "$J" -X PATCH -d '{"active":false}' $U/api/admin/aisles/13
curl -b cookies.txt -H "$O" -X DELETE $U/api/admin/aisles/13

# 9. Une catégorie de courses en plus
curl -b cookies.txt -H "$O" -H "$J" -d '{"name":"Pharmacie","isShopping":true}' $U/api/admin/categories

# 10. Le journal des actions d'administration
grep admin_ data/journal.log
```

Les identifiants (`id`) de chaque élément sont donnés par les commandes du point 1. Supprimer un élément déjà utilisé par une liste répond « il peut être désactivé, pas supprimé ». Cela se vérifiera à l'étape 4, quand les listes existeront.

## API des listes et des articles (étape 4)

Réservées à un compte connecté. Chaque requête vérifie que le compte est membre de la liste concernée. Quelqu'un qui n'est pas membre reçoit la même réponse que si la liste n'existait pas (« Liste introuvable », code 404). Un Admin n'a aucun droit particulier sur les listes des autres.

Chaque écriture vérifie aussi le droit du compte sur la liste (voir « Droit par personne » ci-dessous) : un invité en « Lecture seule » reçoit 403 « Vous avez un accès en lecture seule à cette liste. ».

| Route | Rôle |
| --- | --- |
| `GET /api/lists` | Mes listes (celles dont je suis membre), la plus récemment active d'abord, avec le nombre d'articles restants et les membres |
| `GET /api/lists/:id` | Une liste et ses articles, groupés par rayon et triés |
| `POST /api/stores`, `POST /api/aisles` | Créer un magasin ou un rayon (tout compte) : `{"name": "Surgelés", "listId": "…"}` ; `listId` obligatoire pour un rayon (liste de courses modifiable), facultatif pour un magasin (liste modifiable ; liste « multi » : le magasin rejoint ses magasins regroupés) → 201 `{ item }` ; doublon : 409 (`existing` s'il est actif) ; lecture seule : 403 ; 20 par heure et par compte (429) |
| `POST /api/lists/:id/leave` | Quitter une liste (contributeur ou invité, pour lui-même : aucun identifiant de personne n'est lu) → `{}` ; propriétaire : 403 ; non-membre : 404 |
| `POST /api/lists/:id/duplicate` | Dupliquer une liste (propriétaire ou contributeur) : `{"name": "Courses (copie)", "withItems": true}` → 201 `{ list, copied }`. Une transaction ; éléments non supprimés, décochés ; ni partage, ni lien public, ni photos ; 20 par heure et par compte (429) ; lecture seule : 403 ; non-membre : 404 |
| `PUT /api/lists/:id/members` | Changer le partage (propriétaire seulement) : `userIds`, la liste complète des personnes avec qui la liste est partagée, et `access` (facultatif) : le droit de certaines, `{"2": "modification"}` (contributeur) ou `{"2": "lecture"}` (invité). Une personne ajoutée sans droit précisé est en lecture seule ; un membre déjà présent garde son droit. Refus (400) : droit inconnu, droit donné au propriétaire ou à une personne absente de `userIds` |
| `GET /api/users` | Comptes actifs, pour choisir avec qui partager |
| `GET /api/suggestions?q=la` | Autocomplétion, dès 2 lettres. Avec `&listId=…` (une de mes listes) : vide si ce n'est pas une liste de courses |
| `GET /api/sync?since=…` | Tout ce qui a changé depuis l'instant `since` (l'heure `serverTime` donnée par la synchro précédente) ; sans `since` : tout |
| `POST /api/ops` | Lot d'opérations (1 à 100) : `{"ops": [{ "id": "<uuid>", "type": "…", … }]}` |
| `POST /api/lists/:id/products` | Mode scan (listes de courses) : `{"code": "3017620422003"}` → nom du produit (voir « Mode scan des listes de courses ») |

Les opérations de `POST /api/ops` :

| `type` | Champs | Qui |
| --- | --- | --- |
| `list.create` | `listId` (UUID), `name`, `categoryId`, `storeId` (facultatif, listes de courses seulement), `priorityEnabled` et `dueEnabled` (facultatifs, `true` ou `false`, `false` par défaut), `icon` (facultatif, identifiant de `public/js/list-icons.js`) | tout compte |
| `list.update` | `listId`, et au choix `name`, `categoryId`, `storeId` (`null` pour aucun), `priorityEnabled`, `dueEnabled` (`true` ou `false`), `icon` (identifiant de la liste blanche, ou `""` pour l'icône de la catégorie ; autre valeur : 400) | propriétaire |
| `list.delete` | `listId` | propriétaire |
| `list.uncheckAll` | `listId` : décoche tous les articles cochés (« Tout remettre à acheter » / « Tout rouvrir »), une seule opération quel que soit leur nombre | propriétaire et contributeurs |
| `list.removeChecked` | `listId` : supprime les articles cochés (« Retirer du panier » / « Retirer les terminés »). L'ancien nom `list.clearChecked` reste accepté | propriétaire et contributeurs |
| `item.create` | `listId`, `itemId` (UUID), `name`, `quantity`, `note`, `aisleId` (facultatif : sinon le rayon habituel ; `null` = Sans rayon). Liste « multi » : `storeId` au lieu de `aisleId` (facultatif : sinon le magasin habituel ; `null` = Sans magasin). Listes de courses : `ean` (facultatif, code-barres de 8, 12 ou 13 chiffres avec clé de contrôle, gardé normalisé) | propriétaire et contributeurs |
| `item.update` | `itemId`, et au choix `name`, `quantity`, `note`, `aisleId` (ou `storeId` dans une liste « multi »), `priority` (`low`, `normal`, `high`) et `dueDate` (`AAAA-MM-JJ`, ou `null` pour l'effacer) hors listes de courses ; `ean` (code-barres, ou `null` pour l'effacer) dans une liste de courses. Un champ absent ne change pas ; une chaîne vide pour `dueDate` ou `ean` est refusée | propriétaire et contributeurs |
| `item.check` | `itemId`, `checked` (`true` ou `false`). Le serveur pose la date du coché (`checkedAt`) au premier coché et l'efface au décoché | propriétaire et contributeurs |
| `item.delete` | `itemId` | propriétaire et contributeurs |
| `item.restore` | `itemId` : remet un article supprimé, avec sa photo, tant qu'il n'a pas été effacé par le nettoyage (« Annuler », étape 7) | propriétaire et contributeurs |

Chaque opération reçoit sa propre réponse (`status` 200, ou 400, 403, 404, 409 avec `error`). Une opération renvoyée avec le même `id`, par exemple après une coupure réseau, n'est jamais appliquée deux fois : la réponse du premier envoi est redonnée, avec `"duplicate": true`.

Règles :

- **Limites** : nom de 1 à 100 caractères, quantité 30 au plus (texte libre : « 2 », « 500 g »), note 500 au plus. Les identifiants de listes et d'articles sont des UUID créés par le téléphone.
- **Dates** : les dates (création, modification, suppression) sont toujours posées par le serveur. Celles qu'enverrait le téléphone sont ignorées.
- **Suppressions logiques** : une suppression est d'abord une simple marque, pour que les autres téléphones l'apprennent. Elle est effacée pour de bon au bout de 30 jours (nettoyage au démarrage, puis toutes les heures).
- **Tri** : par rayon, dans l'ordre alphabétique français, avec « Sans rayon » en dernier. Puis par ordre alphabétique dans chaque rayon. Les articles cochés quittent leur rayon pour la zone « Dans le panier » / « Terminés », en bas, du plus récemment coché au plus ancien (`splitDone` de `public/js/sorting.js`, partagé avec le serveur) ; un rayon dont tout est coché n'apparaît plus. Un rayon vide n'apparaît pas. Une liste qui n'est pas de courses forme un seul groupe.
- **Historique** : il est commun à tous les comptes. « Lait », « lait », « LAIT » et « Lait  » ne font qu'une entrée, qui compte ses utilisations. La suggestion garde la première écriture du nom.
  - Listes de courses seulement (décision du 17 octobre 2026) : une liste d'une autre catégorie n'écrit rien dans l'historique et n'affiche pas de suggestions (règle `remembersNames` de `public/js/store.js` sur le téléphone, `is_shopping` sur le serveur). Changer la catégorie d'une liste n'écrit ni n'efface rien dans l'historique.
  - Migration 8 (`pruneHistory` de `server/db.js`) : retire les noms qu'aucun article de liste de courses ne porte (actif, ou supprimé et pas encore purgé) et qui n'ont jamais eu de rayon ni de magasin. Relancée, elle n'efface plus rien.
  - Un article déjà connu reprend son rayon habituel. Modifier son rayon, ou le renommer, mémorise ce choix pour la fois suivante.
  - Supprimer un article ou retirer les cochés n'efface pas l'historique.
- **Désactivations** : une catégorie, un magasin ou un rayon désactivé n'est plus proposé, mais reste sur les listes et les articles qui l'utilisent déjà.
- **Changement de catégorie** : une liste qui passe à une catégorie qui n'est pas « liste de courses » perd son magasin.
- **Magasin « multi »** (étape 6), voir la section suivante.
- **Partage** :
  - le propriétaire reste toujours membre ;
  - un compte désactivé ne peut pas être ajouté ;
  - une personne retirée du partage perd l'accès tout de suite ;
  - un membre dont le compte est désactivé reste membre, mais ne peut plus rien faire, et retrouve l'accès s'il est réactivé.
- **Journal** : création, partage, retrait d'une personne et suppression d'une liste sont notés (champ `personne`), avec l'identifiant de la liste, mais jamais son nom ni ses articles.

### Vérifier les listes à la main avec curl

Avec les raccourcis `U`, `O` et `J`, `cookies.txt` (Admin connecté) et `marie.txt` (Marie connectée, mot de passe déjà changé, id 2). Deux petites fonctions évitent de recopier le format des opérations :

```sh
# Nouvel identifiant unique (UUID)
id() { uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid; }
# Envoie une opération (avec cookies.txt, ou un autre fichier : COOKIES=marie.txt op ...)
op() { curl -s -b "${COOKIES:-cookies.txt}" -H "$O" -H "$J" -d "{\"ops\":[{\"id\":\"$(id)\",$1}]}" $U/api/ops; echo; }

# 1. Les catégories, magasins et rayons (avec leurs id) sont dans la synchronisation
curl -b cookies.txt $U/api/sync

# 2. Créer une liste de courses (catégorie 1 = Courses, magasin 3 = Lidl)
L=$(id)
op '"type":"list.create","listId":"'"$L"'","name":"Courses du samedi","categoryId":1,"storeId":3'

# 3. Ajouter « Lait » au rayon 4 (Crèmerie), puis « LAIT » sans rayon : il retrouve la Crèmerie
A=$(id)
op '"type":"item.create","listId":"'"$L"'","itemId":"'"$A"'","name":"Lait","quantity":"2","aisleId":4'
op '"type":"item.create","listId":"'"$L"'","itemId":"'"$(id)"'","name":"LAIT  "'

# 4. Autocomplétion
curl -b cookies.txt "$U/api/suggestions?q=la"

# 5. Cocher, voir la liste triée
op '"type":"item.check","itemId":"'"$A"'","checked":true'
curl -b cookies.txt $U/api/lists/$L

# 6. Marie ne voit pas la liste… puis on la partage avec elle
curl -b marie.txt $U/api/lists/$L
curl -b cookies.txt -H "$O" -H "$J" -X PUT -d '{"userIds":[2]}' $U/api/lists/$L/members
curl -b marie.txt $U/api/lists
# Ajoutée sans droit précisé : Marie est en lecture seule (403 sur toute écriture)
COOKIES=marie.txt op '"type":"list.uncheckAll","listId":"'"$L"'"'
# Le propriétaire lui donne « Peut modifier »
curl -b cookies.txt -H "$O" -H "$J" -X PUT -d '{"userIds":[2],"access":{"2":"modification"}}' $U/api/lists/$L/members

# 7. Marie ne peut pas renommer la liste, mais elle peut tout décocher et retirer les cochés
COOKIES=marie.txt op '"type":"list.update","listId":"'"$L"'","name":"Renommée"'
COOKIES=marie.txt op '"type":"list.uncheckAll","listId":"'"$L"'"'
COOKIES=marie.txt op '"type":"list.removeChecked","listId":"'"$L"'"'

# 8. « Ce qui a changé depuis » : noter serverTime, faire un changement, redemander
curl -b cookies.txt $U/api/sync | grep -o '"serverTime":"[^"]*"'
op '"type":"item.create","listId":"'"$L"'","itemId":"'"$(id)"'","name":"Pain"'
curl -b cookies.txt "$U/api/sync?since=2026-10-16T22:55:07.384Z"    # remplacer par le serverTime noté

# 9. Retirer Marie : elle perd l'accès aussitôt
curl -b cookies.txt -H "$O" -H "$J" -X PUT -d '{"userIds":[]}' $U/api/lists/$L/members
curl -b marie.txt $U/api/lists/$L

# 10. Supprimer la liste, puis lire le journal
op '"type":"list.delete","listId":"'"$L"'"'
grep liste_ data/journal.log
```

Pour repartir de zéro : `docker compose -f docker-compose.dev.yml down`, puis supprimer les dossiers `data` et `secrets`.

## Magasin « multi » (étape 6)

Pour les courses faites dans plusieurs boutiques, l'Admin crée un magasin « multi » (par exemple « Centre-ville ») et coche les magasins simples qu'il regroupe (Boucherie, Fromagerie, Leclerc…). Une liste de courses qui choisit ce magasin n'a plus de rayons : chaque article a son propre magasin, et la liste est groupée par magasin.

Règles :

- **Administration** : le type (simple ou « multi ») se choisit à la création et ne change plus. Un « multi » ne regroupe que des magasins simples, jamais un autre « multi ». Désactiver un magasin, ou le décocher d'un « multi », le retire des choix proposés aux articles, sans modifier les articles qui l'utilisent déjà.
- **Droits, vérifiés par le serveur à chaque requête** : le magasin choisi pour un article doit être regroupé par le magasin de la liste, et actif. Un rayon est refusé dans une liste « multi », un magasin par article est refusé dans une autre liste. Un magasin « multi » n'est accepté que pour une liste de courses (une liste qui passe en « Tâches » perd son magasin).
- **Tri** : par magasin, dans l'ordre alphabétique, « Sans magasin » en dernier ; puis par ordre alphabétique. Les articles cochés vont dans la zone « Dans le panier », comme pour les rayons.
- **Magasin automatique** : un article reprend le magasin où il a été acheté le plus souvent, parmi les magasins de la liste (le plus récent en cas d'égalité). S'il n'y a jamais été acheté, le téléphone demande son magasin une fois. Le magasin est celui de l'article, pas celui de sa famille de produits (des pains à burger peuvent venir de la boucherie). Changer le magasin d'un article reporte son achat sur le nouveau magasin.
- **Historique** : une ligne générale par article (autocomplétion, rayon général) et une ligne par article et par magasin (rayon habituel dans ce magasin, nombre d'achats dans ce magasin). Dans une liste à magasin simple, un article reprend son rayon dans ce magasin, sinon son rayon général : pour les données existantes, rien ne change.
- **Changer le magasin d'une liste** (simple ↔ « multi », ou d'un « multi » à un autre) : chaque article garde son rayon et son magasin, rien n'est effacé (revenir en arrière retrouve le classement). Seuls les champs vides sont complétés par l'historique : magasin habituel en passant en « multi » (aussi pour un article dont le magasin n'est pas regroupé par le nouveau), rayon habituel en passant à un magasin simple.

### Vérifier le magasin « multi » à la main avec curl

Avec les raccourcis et les fonctions `id` et `op` de la section précédente (Admin connecté dans `cookies.txt`) :

```sh
# 1. Deux magasins simples et un « multi » qui les regroupe (noter les id renvoyés)
curl -b cookies.txt -H "$O" -H "$J" -d '{"name":"Boucherie"}' $U/api/admin/stores           # id 4 par exemple
curl -b cookies.txt -H "$O" -H "$J" -d '{"name":"Fromagerie"}' $U/api/admin/stores          # id 5
curl -b cookies.txt -H "$O" -H "$J" -d '{"name":"Centre-ville","isMulti":true}' $U/api/admin/stores   # id 6
curl -b cookies.txt -H "$O" -H "$J" -X PATCH -d '{"storeIds":[4,5]}' $U/api/admin/stores/6

# 2. Une liste « multi », « Œufs » acheté à la Fromagerie
L=$(id)
op '"type":"list.create","listId":"'"$L"'","name":"Courses du centre-ville","categoryId":1,"storeId":6'
op '"type":"item.create","listId":"'"$L"'","itemId":"'"$(id)"'","name":"Œufs","storeId":5'

# 3. « œufs » ajouté une deuxième fois, sans magasin : il retrouve la Fromagerie (storeId 5)
op '"type":"item.create","listId":"'"$L"'","itemId":"'"$(id)"'","name":"œufs"'

# 4. Refusés (code 400) : un magasin non regroupé (3 = Lidl), un rayon
op '"type":"item.create","listId":"'"$L"'","itemId":"'"$(id)"'","name":"Pain","storeId":3'
op '"type":"item.create","listId":"'"$L"'","itemId":"'"$(id)"'","name":"Pain","aisleId":4'

# 5. La liste groupée par magasin (« store » au lieu de « aisle » dans chaque groupe)
curl -b cookies.txt $U/api/lists/$L
```

## Photos des articles (étape 7)

Chaque article peut avoir une photo (une seule), dans une liste de courses comme dans une liste de tâches. Les photos sont servies aux membres de la liste, et, pour une liste partagée par lien public, au visiteur qui présente un lien valable (jeton, mot de passe si demandé, lien non expiré), pour les seuls articles de cette liste ; métadonnées EXIF retirées (route `GET /api/public/:jeton/photos/:id`, voir « Lien public d'une liste »). Les routes ci-dessous sont celles des membres (envoyer ou retirer une photo demande en plus le droit « Peut modifier », voir « Droit par personne »).

| Route | Rôle |
| --- | --- |
| `PUT /api/items/:id/photo` | Envoyer ou remplacer la photo : le corps de la requête est le fichier JPEG lui-même (2 Mo au plus) |
| `GET /api/items/:id/photo` | Lire la photo (`image/jpeg`) |
| `DELETE /api/items/:id/photo` | Retirer la photo |

Règles :

- **Droits** : seulement un compte connecté, membre de la liste de l'article. Les autres reçoivent la même réponse que pour un article inconnu (404). L'en-tête `Origin` est exigé pour envoyer ou retirer, comme pour toute modification.
- **Sur le téléphone** : un seul bouton (« Ajouter une photo » / « Changer la photo ») ouvre le sélecteur d'images du téléphone (`createImagePicker` de `public/js/photo.js`, voir « Mode scan ») ; la photo est réduite avant l'envoi (1 280 px sur le grand côté, JPEG, dans le bon sens). Aucun accès continu à l'appareil photo. Hors ligne, la photo passe par la file d'attente et part au retour du réseau (voir « Hors ligne »).
- **Contrôle par le serveur, sans bibliothèque d'image** : le fichier doit être un vrai JPEG (le type annoncé ne compte pas), avec des blocs bien formés, une image complète et rien après sa fin, et au plus 4 096 pixels de côté. Tout le reste est refusé (400 ; 413 au-delà de 2 Mo).
- **Vie privée** : les métadonnées sont retirées avant l'écriture du fichier (EXIF avec la position GPS et le modèle de l'appareil, XMP, IPTC, commentaires, images supplémentaires). Seuls les blocs utiles à l'affichage sont gardés.
- **Plafond** : 60 envois par compte et par heure (429 au-delà, noté dans le journal).
- **Stockage** : `data/photos/<id de l'article>.jpg` (droits 600), jamais un nom envoyé par le téléphone. La base garde seulement la date de la photo (`photoAt` dans la synchronisation). L'adresse de l'image contient cette date : une nouvelle photo est rechargée tout de suite.
- **Remplacer ou retirer** efface l'ancien fichier. **Supprimer l'article** cache la photo ; « Annuler » remet le même article avec sa photo ; le fichier est effacé par le nettoyage, 30 jours après la suppression (avec ceux d'une liste supprimée). Le nettoyage efface aussi les fichiers qui n'appartiennent à aucun article (envoi interrompu).
- **Cache** : la photo est gardée par le navigateur du téléphone seulement (cache privé), jamais par un intermédiaire.

### Vérifier les photos à la main avec curl

Avec les raccourcis et les fonctions `id` et `op` de la section des listes, `$L` une liste et `$A` un de ses articles :

```sh
# 1. Envoyer une photo (fichier JPEG du téléphone ou de l'ordinateur)
curl -b cookies.txt -H "$O" -H 'Content-Type: image/jpeg' -X PUT --data-binary @photo.jpg $U/api/items/$A/photo

# 2. La relire et vérifier qu'elle n'a plus de métadonnées (exiftool, s'il est installé)
curl -b cookies.txt -o lue.jpg $U/api/items/$A/photo && exiftool lue.jpg

# 3. Un fichier qui n'est pas un JPEG est refusé (400), même annoncé comme tel
curl -b cookies.txt -H "$O" -H 'Content-Type: image/jpeg' -X PUT --data-binary @README.md $U/api/items/$A/photo

# 4. Marie, si elle n'est pas membre de la liste, reçoit 404
curl -b marie.txt $U/api/items/$A/photo

# 5. Retirer la photo
curl -b cookies.txt -H "$O" -X DELETE $U/api/items/$A/photo
```

## Temps réel (étape 8)

Quand une liste change, les téléphones de ses membres sont prévenus aussitôt et se mettent à jour, sans qu'il faille actualiser.

| Route | Rôle |
| --- | --- |
| `GET /api/events` | Flux « Server-Sent Events » ouvert par le téléphone connecté. Messages : `event: list` avec `data: {"listId":"…"}` ; `event: refs` avec `data: {}` (à tous les téléphones connectés) après un changement de catégorie, de magasin ou de rayon dans l'Administration : chacun refait une synchronisation, et relit le nom de la catégorie et du magasin de chaque liste par leur identifiant (`refreshListReferences` de `public/js/store.js`, tests : `test/references-rename.test.js`) |

Règles :

- **Aucune donnée dans les messages** : seulement l'identifiant de la liste qui a changé. Le téléphone demande ensuite les changements par `GET /api/sync?since=…`, avec les contrôles d'accès habituels.
- **Destinataires** : les membres actifs de la liste, relus dans la base à chaque envoi. Une personne retirée du partage reçoit un dernier message (son téléphone retire la liste), puis plus rien. Un compte désactivé, déconnecté ou dont les sessions sont fermées voit son flux coupé tout de suite ; une session expirée est coupée au signal de maintien suivant.
- **Déclencheurs** : toute opération réussie de `/api/ops` (articles, listes, partage, magasin, catégorie, suppression), l'envoi ou le retrait d'une photo, le changement de partage. Le message part après l'écriture en base, jamais avant ; une opération refusée n'en envoie aucun.
- **Connexions** : réservées aux comptes connectés, refusées depuis un autre site. En-tête `X-Accel-Buffering: no`, signal de maintien toutes les 25 secondes, au plus 5 connexions par compte (au-delà, la plus ancienne est fermée), connexion libérée dès que le téléphone la ferme.
- **Sur le téléphone** : plusieurs messages rapprochés ne donnent qu'une synchronisation. Filets de sécurité : synchronisation toutes les 60 secondes au premier plan, à chaque retour au premier plan, bouton d'actualisation. Après une coupure, le flux se reconnecte seul, avec un délai croissant (1 s, 2 s, 4 s… jusqu'à 30 s).
- **Indicateur** : « À jour », « Synchronisation… », « Hors ligne » (pas de réseau ou serveur qui ne répond pas), avec le nombre de modifications en attente depuis l'étape 9.
- **Feuille Article ouverte** pendant qu'une autre personne modifie l'article : ce qui a été tapé est gardé, un bandeau prévient, et seuls les champs changés sont enregistrés. Si l'article est supprimé ailleurs, on ne peut plus que fermer la feuille.

### Vérifier le temps réel à la main avec curl

```sh
# Le flux reste ouvert et affiche les messages au fil de l'eau (Ctrl+C pour arrêter)
curl -N -b cookies.txt $U/api/events

# Dans un autre terminal, une modification : le premier affiche « event: list »
op '"type":"list.update","listId":"'"$L"'","name":"Renommée"'

# Sans connexion : refusé (401)
curl -i $U/api/events
```

## Hors ligne (étape 9)

Listo marche sans réseau : l'application s'ouvre, on lit ses listes, on ajoute, coche, modifie, supprime et prend des photos. Tout part au retour du réseau.

Comment ça marche :

- **Service worker** (`public/sw.js`) : il garde une copie des fichiers de l'application. Avec du réseau, il prend toujours la dernière version (et met sa copie à jour) ; sans réseau, ou si le réseau met plus de 3 secondes à répondre, il sert sa copie. Il ne garde **jamais** les réponses de l'API (`/api/…`), le flux temps réel ni le lien public. Seule exception : les photos déjà vues (150 au plus, effacées à la déconnexion). `sw.js` lui-même est servi avec `Cache-Control: no-cache`, pour qu'une nouvelle version soit vue tout de suite ; il porte l'identifiant de la version installée, donc il change à chaque mise à jour (voir ci-dessous).
- **Copie locale** (IndexedDB, une base par compte : `listo-u<numéro>`) : listes, articles, catégories, magasins, rayons, historique d'autocomplétion, comptes proposés au partage et repère de synchronisation, c'est-à-dire exactement ce que `/api/sync` a renvoyé. Aucun mot de passe, jeton ni secret. Elle est effacée à la déconnexion. Deux comptes sur le même téléphone ont chacun leur copie et ne voient jamais celle de l'autre.
- **Écriture d'abord locale** : chaque action est enregistrée dans la file d'attente du téléphone, puis appliquée tout de suite à l'écran. La file part dans l'ordre au démarrage, au retour du réseau et à chaque synchronisation. Chaque opération a un identifiant unique : renvoyée après une coupure, elle n'est jamais appliquée deux fois.
- **Photos** prises hors ligne : gardées dans la file, envoyées après la création de leur article, affichées depuis le téléphone en attendant. Abandonnées si l'article est supprimé entre-temps.
- **Refus** (droits retirés, liste supprimée ailleurs…) : la modification sort de la file et n'est jamais renvoyée ; l'écran revient à l'état du serveur et un message prévient : « Une modification n'a pas pu être enregistrée : … ». **Pas de réseau**, serveur indisponible ou trop sollicité : la modification reste, nouvel essai avec un délai croissant (1 s, 2 s, 4 s… jusqu'à 30 s).
- **Conflits** : la dernière modification reçue par le serveur gagne ; une suppression l'emporte sur une modification et sur une photo envoyée après coup ; deux ajouts du même nom donnent deux articles.
- **Session expirée** pendant la coupure : l'écran de connexion s'affiche, la file est gardée et repart après la reconnexion. **Déconnexion** avec des modifications pas encore envoyées : Listo avertit et laisse le choix (« Rester connecté » ou se déconnecter quand même, en les perdant).
- **Indicateur** : « À jour », « Synchronisation… », « Hors ligne · 3 en attente ». Hors ligne, l'administration et le partage d'une liste sont grisés avec une explication.
- **Copie trop ancienne** (plus de 25 jours sans synchronisation) ou illisible : Listo la remplace automatiquement par celle du serveur. Réglages → Mon compte → « Réinitialiser les données de ce téléphone » fait la même chose à la demande (avec du réseau).

### Android : barre de navigation (application installée)

`index.html` demande `viewport-fit=cover` : la page s'étend sous les zones du système, et `env(safe-area-inset-bottom)` donne la place à laisser en bas. C'est nécessaire sur iPhone (indicateur d'accueil).

Sur Android 15 et plus, une application installée (mode autonome) est dessinée « bord à bord ». Avec `viewport-fit=cover`, Chromium (Brave compris) laisse la page passer sous la barre de navigation ; dans un onglet, la hauteur de la barre est fournie à `env(safe-area-inset-bottom)`, mais dans l'application installée elle vaut 0 (constaté sur un Xiaomi 14T Pro, Android 16, Brave, barre à 3 boutons : le bouton « Nouvelle liste » était coupé d'environ 46 px). Cette valeur sert surtout aux encoches ; rien ne garantit qu'elle couvre la barre de navigation.

Correctif : `public/js/viewport.js`, petit script classique chargé juste après la balise `viewport` (avant les styles, donc avant le premier affichage), retire `viewport-fit=cover` quand le navigateur s'annonce comme Android. Sans `cover`, Android garde la page au-dessus de la barre de navigation, comme dans un onglet. iPhone et ordinateur : rien ne change. Fichier séparé (pas de script écrit dans la page) : la Content-Security-Policy reste stricte. Écartés : deux versions de `index.html` selon le navigateur (même adresse, deux contenus : cache et service worker plus compliqués, pour rien de plus) ; une marge fixe ajoutée sous Android (impossible de savoir si le téléphone a la barre à 3 boutons, environ 48 px, ou le mode gestes, environ 24 px : grand vide inutile dans le second cas).

Vérifié dans un navigateur de test : balise modifiée sous Android seulement (`test/viewport.test.js`) ; rendu Android simulé (page au-dessus d'une barre de 48 px) : bouton, barre d'ajout, feuille et message au-dessus de la barre ; iPhone simulé (zone de sécurité de 34 px) : captures identiques au pixel près avant et après. Le Chromium de test ne reproduit pas l'affichage bord à bord d'Android : le comportement réel est à confirmer sur le téléphone. Si un Android garde la page sous la barre malgré tout, solution prévue : un réglage « Marge du bas : aucune / petite / grande » dans « Mon compte », mémorisé sur le téléphone, sans effet sur iPhone.

### Hauteur remesurée au retour dans l'application

Constaté sur Android 16 (Xiaomi Mi 14T Pro et Mi 13T, application installée) : affichage correct au premier chargement, mais après avoir réduit Listo puis l'avoir rouvert, le bas de la page (bouton « Nouvelle liste », bas de la liste) passait sous la barre de navigation. La hauteur venait seulement du CSS (`.app { height: 100dvh }`), et rien ne la remesurait au retour.

Correctif : `public/js/app-height.js`, petit script classique chargé juste après `viewport.js`. Il mesure la hauteur visible (`visualViewport.height`, multipliée par le zoom à deux doigts ; sinon `innerHeight`) et l'écrit dans la variable CSS `--app-h` de `<html>` ; `app.css` utilise `.app { height: var(--app-h, 100dvh) }` (100dvh tant que rien n'est mesuré, ou si le script échoue). Remesure à chaque `resize` (fenêtre et `visualViewport`), au retour au premier plan (`visibilitychange`, `pageshow`, `focus`), à la rotation (`orientationchange`), puis relectures à l'image suivante, ~100 ms, ~300 ms et ~1 s, car Android annonce parfois la bonne hauteur en retard. Une valeur identique n'est pas réécrite ; rien n'est mesuré en arrière-plan. Aucune marque, aucun modèle, aucune hauteur de barre écrite à l'avance.

Clavier ouvert (curseur dans un champ) : comme avant. Quand le clavier recouvre la page sans la rétrécir (Chrome, Brave…), la hauteur ne bouge pas ; quand il rétrécit la page elle-même (`innerHeight` plus petit), elle suit, comme 100dvh. Relue en quittant le champ, ou à la rotation.

Vérifié : `test/app-height.test.js` (valeur identique non réécrite, relectures décalées, repli sans `visualViewport`, zoom, clavier, règle CSS, script externe) ; dans un navigateur de test, reprise Android simulée (hauteur plus petite annoncée en retard) : « Nouvelle liste » et barre d'ajout entièrement visibles après la relecture ; iPhone simulé : même hauteur qu'avec 100dvh. Le comportement réel d'Android est à confirmer sur le téléphone.

### Clavier de l'iPhone et barre du haut fixe

Constaté sur iPhone : quand le clavier s'ouvre (ajout ou modification d'un élément, réglages, mémoire des noms), l'iPhone fait remonter la zone visible (`visualViewport.offsetTop` > 0, ou la page défile) pour garder le champ au-dessus du clavier ; comme l'application gardait sa hauteur, l'en-tête sortait de l'écran et une bande vide apparaissait au-dessus du champ.

Correctif, mesuré (aucune marque ni modèle) :

- `public/js/app-height.js` : quand un champ de saisie a le curseur ET que la zone visible est décalée (`visualViewport.offsetTop` > 0 ou `window.scrollY` > 0), il écrit `--app-top` (= `offsetTop`) et `--app-h` (= `visualViewport.height`) : l'application recouvre exactement la zone visible. Sans décalage (Android aujourd'hui), rien ne change. Clavier fermé : `--app-top` revient à 0, la hauteur de base revient, et `window.scrollTo(0, 0)` si la page avait défilé. Écoute `visualViewport` (« scroll » et « resize », le décalage change pendant que le clavier s'anime), `focusin` et `focusout`, avec les mêmes relectures décalées (image suivante, ~100 ms, ~300 ms, ~1 s). Une valeur identique n'est jamais réécrite.
- `public/css/app.css` : `.app` est posée sur l'écran (`position: fixed; top: var(--app-top, 0px); height: var(--app-h, 100dvh)`), avec la marge de sécurité du haut `env(safe-area-inset-top)` (encoche, îlot dynamique ; 0 quand il n'y en a pas besoin). La page elle-même ne défile donc jamais. Les feuilles, menus, messages et la barre d'ajout se placent par rapport à `.app` : ils suivent. La Content-Security-Policy reste stricte (variables CSS posées par JavaScript).
- Barre du haut : sur chaque écran (Mes listes, une liste, Nouvelle liste, Modifier la liste, Réglages, Mon compte, Mot de passe, Double authentification, Administration et ses onglets, dont « Articles »), elle est déjà hors de la zone qui défile (`.scroll`, `.body`) : seule cette zone défile. Contrôlé par `test/topbar.test.js` et dans Chromium (390 × 844 et 390 × 420 : chaque zone défilée jusqu'en bas, la barre ne bouge pas).
- Champs qui ne sont ni un identifiant, ni un mot de passe, ni un code : `autocomplete="off"` (l'iPhone ne propose plus « Préremplir le contact ») : nom, quantité et note de la fiche d'un élément, nom d'une liste, ajout et renommage d'une catégorie, d'un magasin ou d'un rayon, feuille « Modifier la catégorie », correction d'un nom enregistré, nombre de la durée d'un lien public. Les champs de connexion, de création de compte, de mot de passe et de double authentification ne changent pas.
- Vérifié : `test/app-height.test.js` (décalage avec un champ actif, page défilée, fermeture du clavier, sans décalage inchangé, zoom sans champ, pas de réécriture), `test/topbar.test.js` ; dans Chromium, clavier simulé en posant `--app-top` et `--app-h` comme le ferait le script (liste, fiche d'un élément avec Nom, Quantité, Note et Code-barres, mémoire des noms ; clair et sombre). **Le vrai clavier de l'iPhone n'a pas pu être essayé** : voir le point 8 ci-dessus.

### Suggestions : appui sur iPhone, clavier ouvert

Constaté sur iPhone (après les PR 42 à 46) : la liste de suggestions s'affichait, mais un appui sur une suggestion (ou sur « Ajouter « … » ») ne faisait rien ; le bouton « + » et la touche Entrée marchaient. Le code des suggestions n'avait pas changé depuis l'étape 5.

- Ce qui est certain d'après le code : rien ne redessine ni ne ferme la liste pendant un appui en dehors du champ lui-même (événements input et focus, blur après 150 ms) ; aucun élément ne la recouvre (z-index 6, au-dessus des lignes et des en-têtes de rayon) ; depuis la PR 46, `.app` est en position fixe et `js/app-height.js` peut la déplacer et la redimensionner à tout moment (relectures du clavier), y compris pendant un appui.
- Ce qui est probable (non vérifiable sans iPhone) : sur l'iPhone, le « click » d'une suggestion est envoyé après le relâchement, à l'endroit touché ; si la page a bougé entre le toucher et le relâchement (zone visible qui remonte, clavier qui s'anime), il tombe à côté de la suggestion. Le bouton « + », en bas, garde sa place par rapport au clavier.
- Correction (`public/js/tap.js`, utilisé par `public/js/screens/list.js`) : la suggestion est choisie au RELÂCHEMENT du doigt (`pointerup`, toujours envoyé au bouton touché) ; le click reste en secours (souris, clavier, lecteur d'écran), sans double ajout ; le click qui suit un choix au relâchement est ignoré une demi-seconde (la liste s'étant fermée, il tomberait sur une ligne ou sur le fond de la feuille « Dans quel rayon ? ») ; pendant le toucher, la liste n'est ni redessinée ni fermée. `public/js/app-height.js` : aucune mesure n'est appliquée pendant qu'un doigt est posé (de `pointerdown` à `pointerup` ou `pointercancel`, 2 s au plus) ; la dernière mesure s'applique au relâchement.
- Plan de repli : la compensation du clavier de l'iPhone est isolée dans la fonction `keyboardShift` de `public/js/app-height.js` ; pour la retirer, il suffit de lui faire renvoyer `null` (la barre du haut fixe et les `autocomplete="off"` restent).
- Vérifié : `test/suggest-touch.test.js`, `test/app-height.test.js` ; dans Chromium, vrais événements tactiles, clavier simulé : suggestion connue (un ajout, champ vidé, clavier replié, article mis en évidence), « Ajouter « … » » (la feuille du rayon reste ouverte), page déplacée de 130 px pendant le toucher (choisie quand même, une fois), saisie et perte du curseur pendant le toucher (liste ni redessinée ni fermée), souris, « + », « Scanner », coche, croix et poubelle de la fiche, « Annuler » du message, menu ⋮. Le vrai iPhone reste à essayer (point 9).

### Bouton « + » : un seul appui, clavier ouvert

Constaté par le propriétaire : taper un nom dans le champ d'ajout puis toucher « + » fermait le clavier sans rien ajouter ; il fallait toucher « + » une deuxième fois.

- Cause (lecture du code, puis reproduite dans Chromium) : « + » était un bouton d'envoi ordinaire. Au toucher, le champ perd le curseur ; `public/js/app-height.js` remesure aussitôt la page (sortie du champ : `focusout`), alors que le clavier est encore affiché : l'application change de position ou de hauteur, et la barre d'ajout bouge (300 px dans la simulation). Cela se passe après le relâchement du doigt (la protection « doigt posé » d'app-height.js est déjà levée), entre le `mousedown` et le `mouseup` que le navigateur envoie au toucher : le `mouseup` et le `click` tombent alors sur le fond de la page, pas sur le bouton. Au deuxième appui, le champ n'a plus le curseur : rien ne bouge, l'ajout se fait.
- Correction : le bouton « + » utilise le même mécanisme que les suggestions (`createTapPicker` de `public/js/tap.js`, option `persistent`) : l'appui ne retire pas le curseur du champ (`pointerdown` et `mousedown` annulés), l'ajout se fait au relâchement, une fois ; le click qui suit est ignoré ; un doigt relâché hors du bouton n'ajoute rien. Le click seul (souris, clavier, lecteur d'écran, et la touche Entrée, qui « clique » le bouton d'envoi) ajoute une fois et annule l'envoi du formulaire. Après l'ajout, rien ne change : clavier replié et article montré (dans toutes les listes depuis le 19 octobre 2026, voir le point 10).
- Bouton « Scanner » : même défaut (le sélecteur ou la feuille de choix ne s'ouvrait qu'au deuxième appui). L'appui garde le curseur du champ (`keepFieldFocus` de `tap.js`) ; au click, le champ perd le curseur (clavier replié), puis le sélecteur s'ouvre (il doit s'ouvrir dans le click : le téléphone l'exige).
- Constaté aussi dans la simulation, non corrigé (hors du champ d'ajout) : dans la fiche d'un article, avec le curseur dans un champ de la fiche, « Ajouter une photo », la disquette et la croix demandent deux appuis, pour la même raison.
- Vérifié : `test/add-button-touch.test.js`, `test/suggest-touch.test.js` ; dans Chromium, vrais événements tactiles, `app-height.js` réel et clavier simulé (zone visible réduite de 300 px, décalée comme sur iPhone ou non, fermeture animée en 300 ms) : avant la correction, « + » et « Scanner » échouaient au premier appui ; après, un seul appui suffit (liste de courses : un ajout, champ vidé, clavier replié, aucune fiche ouverte ; article nouveau : « Dans quel rayon ? » reste ouverte ; liste de tâches : le champ garde le curseur ; deux appuis rapides : deux ajouts ; Entrée, souris, click seul : un ajout ; doigt glissé hors du bouton, champ vide : rien). Les vrais téléphones restent à essayer (point 9).

### Boutons en un seul appui avec un champ actif (correction générale)

Constaté dans la simulation (rapport de la PR #56), puis confirmé : avec le curseur dans un champ, la disquette, la croix et « Ajouter une photo » d'une fiche demandaient deux appuis ; de même « Enregistrer » de « Nouvelle liste » et de « Modifier la liste », « Créer » de « Nouveau rayon… », « Ajouter » de l'Administration (sur l'iPhone simulé), et la croix de « Nouvelle liste » (iPhone simulé).

- Cause : la même que pour « + ». `app-height.js` attendait déjà le relâchement du doigt pour réajuster la page, mais le champ perd le curseur juste APRÈS le relâchement : au toucher, le navigateur envoie `pointerdown`, `pointerup`, puis `mousedown` (le champ perd le curseur, le clavier commence à se replier, la page était réajustée aussitôt), `mouseup` et `click`, qui tombait à côté.
- Correction, à la racine, dans `public/js/app-height.js` : un appui ne se termine plus au `pointerup` mais juste après le `click` qui suit (écouté en phase de capture, la mesure en attente s'applique dès que le click a été traité) ; sans click après le relâchement (doigt glissé hors du bouton…), au bout de 400 ms ; `pointercancel` (défilement) : aussitôt ; délai de sécurité : 2 s au plus après le `pointerdown`. Pendant l'appui, aucune mesure n'est appliquée ; à la fin, une seule. Sans appui (touche Entrée), rien ne change. Le comportement du clavier ne change pas (décalage, repli, barre du haut fixe).
- Mécanismes de `tap.js` (« + », suggestions, « Scanner ») : gardés. Essai fait dans Chromium : sans eux, « + » et « Scanner » marchent aussi du premier appui grâce à la correction générale ; les suggestions en ont toujours besoin (la liste ne doit être ni redessinée ni fermée pendant le toucher). On pourra retirer ceux de « + » et de « Scanner » après validation sur de vrais téléphones ; d'ici là, ils protègent indépendamment.
- Vérifié : `test/app-height.test.js` (appui avec un champ actif : rien avant le click, puis une seule mesure ; sans appui : aussitôt ; relâchement sans click : 400 ms ; `pointercancel` ; délai de sécurité ; fin prévue d'un ancien appui ignorée), `test/add-button-touch.test.js`, `test/suggest-touch.test.js` ; dans Chromium, vrais événements tactiles, `app-height.js` réel et clavier simulé (iPhone et Android) : tous les boutons ci-dessus échouaient au premier appui avant, réussissent après ; « + », « Scanner », suggestions, mode scan, fin d'ajout inchangés. Les vrais téléphones restent à essayer (point 9).

### Bande vide entre la barre d'ajout et le clavier de l'iPhone

Constaté sur iPhone (capture, liste de courses, clavier ouvert) : une bande blanche d'environ 36 px entre la barre d'ajout et la barre grise du clavier.

- Cause (lecture du CSS et de `app-height.js`) : la barre d'ajout réserve en bas 12 px plus la marge de sécurité du bas de l'écran (`env(safe-area-inset-bottom)`, 34 px sur un iPhone avec trait), pour que le trait de l'iPhone ne recouvre pas le champ. Clavier ouvert, `app-height.js` fait recouvrir exactement la zone visible par l'application : son bas touche le clavier, le trait est caché derrière, mais l'iPhone garde la même marge de sécurité. Ce n'était ni la hauteur `--app-h`, ni la marge de `.app`.
- Correction : quand l'application recouvre la zone visible au-dessus du clavier (même détection que `keyboardShift`), `app-height.js` pose `data-keyboard="open"` sur `<html>` (retiré à la fermeture, en même temps que le réajustement, jamais pendant un appui). `app.css` retire alors la marge de sécurité du bas de la barre d'ajout, des feuilles du bas (fiche d'un article, « Dans quel rayon ? », « Nouveau rayon… »), des barres de boutons du bas (« Enregistrer » de « Nouvelle liste » et « Modifier la liste »), du bas des zones qui défilent (Administration, Réglages), des messages et du pied de la page publique (mot de passe). Aucun nouveau script, politique de sécurité inchangée, `listo.css` inchangé.
- Android : `viewport.js` y retire `viewport-fit=cover`, la marge de sécurité est donc nulle ; et l'attribut n'est posé que si la zone visible est décalée. Rien ne change.
- Vérifié : `test/app-height.test.js` (attribut posé clavier ouvert, retiré à la fermeture, à chaque ouverture et fermeture, jamais sans décalage, à la fin d'un appui ; règles d'`app.css`) ; dans Chromium, marge de sécurité simulée (34 px en bas) et clavier simulé : iPhone, barre d'ajout 46 px de marge clavier fermé, 12 px clavier ouvert (écart champ/clavier : 12 px), 46 px de nouveau à la fermeture ; fiche et « Nouvelle liste » : 58 px fermé, 24 px ouvert ; Android : aucun changement. Le vrai iPhone reste à essayer (point 8).

### Bandeau du haut aux couleurs du thème de Listo

Constaté sur iPhone (application installée, téléphone en mode sombre, Listo en thème clair) : à l'ouverture à froid, le bandeau du haut (heure, encoche, îlot dynamique) était noir ; après avoir quitté puis rouvert, blanc.

- Ce qui est certain (lu dans les fichiers) : `index.html` avait `<html data-theme="auto">`, une seule balise `theme-color` (le bleu #2F6FED, quel que soit le thème), aucune balise `color-scheme`, pas de `apple-mobile-web-app-status-bar-style` (donc « default ») ; le thème choisi n'était posé que par `app.js` (un module, exécuté après la lecture de la page) ; `<body>` avait le fond du thème, pas `<html>` ; manifeste : `theme_color` #2F6FED, `background_color` #F4F7FB.
- Ce qui est probable (non vérifiable sans iPhone) : à froid, l'iPhone peint le bandeau d'après le mode du téléphone et ce que la page déclare au tout premier affichage (thème automatique, donc sombre) ; au retour, le thème clair était déjà posé.
- Correction : `public/js/theme-boot.js`, script classique chargé tout en haut de `<head>` (CSP stricte) : il lit le thème enregistré (`listo-theme`) et pose aussitôt `data-theme`, `<meta name="color-scheme">` (« light », « dark », ou « light dark » en automatique) et les deux `<meta name="theme-color">` (une par mode du téléphone, attribut `media`) : fond du thème choisi, ou, en automatique, la couleur de chaque mode. `public/js/theme.js` met les mêmes balises à jour quand le thème change dans les réglages (effet immédiat). `app.css` : `<html>` et `<body>` ont le fond du thème. Manifeste : `theme_color` et `background_color` = fond du thème clair (#F4F7FB).
- Ce qui n'est pas possible : le manifeste est un fichier fixe, il ne peut pas suivre le thème choisi (il ne sert qu'avant le chargement de la page) ; l'écran de lancement de l'iPhone (avant le premier affichage de la page) peut donc rester différent. Aucune astuce n'est utilisée pour le contourner.
- Clavier : « Clair » pose `color-scheme: light` dès le départ, « Sombre » `dark`. Sur iPhone, le clavier suit en principe le `color-scheme` du champ : avec le thème clair, il devrait donc passer en clair même si le téléphone est en sombre (voulu ; à confirmer sur le téléphone).
- Vérifié : `test/theme-boot.test.js` ; dans Chromium, téléphone en sombre et thème clair (et l'inverse, et automatique) : thème, balises et fond corrects dès le premier moment, avant `app.js` ; changement immédiat dans Mon compte ; barre du haut toujours de 64 px (une seule marge de sécurité en haut). Le vrai bandeau de l'iPhone reste à essayer (point 2).

### « Préremplir le contact » sur les champs de nom de produit

Constaté sur iPhone : Administration › Courses › Articles, le champ de correction d'un nom affichait encore « Préremplir le contact » malgré `autocomplete="off"`. L'iPhone devine seul qu'un champ est un « contact », d'après ses propres indices : libellé (« Nom »), attributs `name`, `id`, `aria-label`, `placeholder`, `type`. Safari ne respecte pas toujours `autocomplete="off"` pour ce remplissage.

- Trouvé : le champ de correction avait l'`aria-label` « Nom corrigé pour … » ; ailleurs, les libellés visibles « Nom » (fiche d'un élément, nouvelle liste, feuille « Modifier la catégorie », mode scan) et l'`aria-label` « Nouveau nom pour … » (renommage d'une catégorie, d'un magasin, d'un rayon). Aucun de ces champs n'a d'attribut `name` ; leur `id` est neutre (`f-…`, donné par `field()`).
- Correction : libellés sans « Nom » (« Article » ou « Élément » selon la liste, « Titre de la liste », « Libellé », « Article » dans le mode scan ; `aria-label` « Renommer « … » » et « Orthographe corrigée de « … » ») et les mêmes attributs partout, définis une fois dans `LABEL_INPUT` de `public/js/dom.js` : `autocomplete="off"`, `autocorrect="off"`, `autocapitalize="sentences"`, `spellcheck="false"`, `enterkeyhint="done"`, `inputmode="text"`. Champs concernés : nom d'un élément (fiche), titre d'une liste, nom du produit (mode scan), ajout et renommage d'une catégorie, d'un magasin, d'un rayon, feuille « Modifier la catégorie », correction d'un nom enregistré. Inchangés : connexion, création de compte (identifiant, nom affiché), mots de passe, codes de double authentification.
- Limite : le choix final appartient à l'iPhone. Si la barre « Préremplir le contact » apparaît encore, ce n'est plus un défaut de Listo : c'est le réglage de l'iPhone (Réglages › Safari (ou Applications › Safari) › Remplissage automatique › « Utiliser les infos de contact »). Vérifié : `test/label-fields.test.js` ; dans Chromium, attributs et libellés affichés. Le vrai clavier de l'iPhone reste à essayer (point 8).

### Nouvelle version de Listo : rechargement des téléphones

Une application installée sur l'écran d'accueil (iPhone surtout) reste ouverte en mémoire pendant des jours : revenir dessus ne recharge que les données, jamais le code. Avant ce mécanisme, un téléphone pouvait garder l'ancienne version jusqu'à ce qu'on ferme l'application, voire jusqu'à la réinstaller : `sw.js` ne changeait pas d'une version à l'autre, donc l'ancienne copie des fichiers (`listo-app-v3`) restait, et pouvait être resservie quand le réseau était lent.

Ce qui se passe maintenant :

1. **Identifiant opaque** : au démarrage, le serveur calcule un identifiant de 16 caractères à partir du commit installé et d'une clé propre à l'installation (HMAC-SHA256, clé dérivée de `secrets/secret.key`, voir `buildId` dans `server/secrets.js`). Il change à chaque mise à jour mais ne révèle pas le commit. Il est écrit dans `sw.js` et `js/version.js` quand le serveur les envoie (ligne `BUILD = null` remplacée ; fichiers revalidés à chaque chargement), et donné par `GET /api/about` (comptes connectés). Sans commit (développement) : `null`, et rien de ce qui suit ne se déclenche.
2. **Nouveau service worker à chaque version** : `VERSION` de `sw.js` vaut `v<numéro>-<identifiant>` (le numéro n'est écrit que dans `public/sw.js`). Le navigateur voit un nouveau `sw.js`, l'installe (copie neuve de tous les fichiers, sans cache HTTP), puis efface l'ancienne copie : jamais de mélange d'anciens et de nouveaux fichiers.
3. **Code périmé** (`public/js/freshness.js`) : le téléphone compare l'identifiant de son code (`js/version.js`) à celui du serveur, au démarrage, au retour au premier plan, à la reconnexion du temps réel (le serveur vient souvent de redémarrer) et toutes les heures au premier plan. Hors ligne : rien, sans erreur.
4. **Rechargement au premier moment sûr** : d'abord `registration.update()` et l'attente du nouveau service worker actif (10 s au plus) ; puis, si aucune fenêtre n'est ouverte (feuille, boîte de dialogue, menu), qu'aucun champ n'a le curseur ni un texte pas encore validé, et que la file d'attente n'envoie rien (un envoi en cours est attendu jusqu'à 10 s), le message « Mise à jour de Listo… » s'affiche un instant et la page se recharge. Sinon, bandeau « Nouvelle version disponible » avec « Recharger » (en haut de l'écran, il ne cache pas la barre d'ajout), et nouvel essai au changement d'écran et au retour au premier plan.
5. **Pas de boucle** : un seul rechargement automatique par version et par onglet (repère dans `sessionStorage`). Toujours périmé après lui : bandeau et une ligne dans la console. Si `sessionStorage` est indisponible : jamais de rechargement automatique, seulement le bandeau.
6. **Rien n'est perdu** : la file d'attente des modifications et la copie des listes sont dans IndexedDB (`listo-u<numéro>`), qu'un rechargement ne touche pas ; elles sont relues au démarrage. Listo n'a pas d'autre brouillon : un texte en cours de saisie empêche justement le rechargement automatique. Vérifié par `test/freshness.test.js` (file relue intacte) et dans un vrai navigateur (modification en attente, envoi bloqué, serveur redémarré dans une autre version : page rechargée, modification toujours en attente, puis reçue par le serveur sans doublon).

La page publique (`/p/…`) n'est pas concernée : elle n'a ni service worker ni copie gardée.

**Si une nouvelle version de Listo semble cassée sur un téléphone** : fermer Listo et le rouvrir avec du réseau (il reprend alors la dernière version) ; si ça ne suffit pas, Réglages → Mon compte → « Réinitialiser les données de ce téléphone » ; en dernier recours, effacer les données du site dans les réglages du navigateur (Chrome : cadenas à gauche de l'adresse → Paramètres du site → Effacer les données ; iPhone : Réglages → Safari → Avancé → Données des sites web), puis se reconnecter.

Pour publier une version qui change la liste des fichiers de l'application, ajouter le nouveau fichier dans `APP_FILES` de `public/sw.js` et augmenter de 1 le numéro au début de `VERSION` ; un test automatique signale un fichier oublié. L'identifiant de la version installée, lui, change tout seul à chaque mise à jour.

## Lien public d'une liste (étape 10)

Le propriétaire d'une liste peut la montrer à quelqu'un qui n'a pas de compte, par un lien en lecture seule. C'est la seule partie de Listo ouverte sans compte : tout y est refusé par défaut.

**Côté propriétaire** (menu de la liste → « Partager par lien », avec du réseau) :

| Route | Rôle |
| --- | --- |
| `GET /api/lists/:id/share` | État du lien : `{ share: null }` ou `{ share: { url, expiresAt, protected, createdAt } }` |
| `PUT /api/lists/:id/share` | Crée le lien, ou le modifie s'il existe. Corps : `durationHours` (1 à 8760, ou `null` pour « illimitée » ; 24 par défaut à la création ; une nouvelle durée repart de maintenant), `protect: true` (mot de passe à la création), `password: "new"` (nouveau mot de passe) ou `"none"` (le retirer). Un mot de passe tout juste créé est renvoyé une seule fois (`share.password`) |
| `DELETE /api/lists/:id/share` | Arrête le lien |

Seul le propriétaire de la liste y a accès : un contributeur, un invité ou un autre compte reçoit 404, comme pour une liste inexistante.

**Côté visiteur** (sans compte, lecture seule) :

| Route | Rôle |
| --- | --- |
| `GET /p/:jeton` | La page (HTML sans aucune donnée de la liste) |
| `GET /api/public/:jeton` | La liste : nom, catégorie, magasin, regroupement (rayon, magasin ou aucun), groupes avec le nom du rayon ou du magasin, articles avec nom, quantité, note, état coché et adresse de la photo (et, pour une liste autre que les courses, priorité et échéance ; pour une liste de courses, `ean` si l'article a un code-barres) ; `done` : les articles cochés (mêmes champs, plus `aisle` ou `store` s'ils ont un rayon ou un magasin), du plus récemment coché au plus ancien ; date d'expiration du lien. Rien d'autre (liste blanche, `test/share.test.js` et `test/public-sheet.test.js`) : aucun nom de personne ni identifiant de compte ou de liste |
| `POST /api/public/:jeton/acces` | Saisie du mot de passe (`{ "password": "…" }`) ; donne le cookie de consultation |
| `GET /api/public/:jeton/photos/:id` | Photo d'un article de cette liste seulement |

Règles :

- **Jeton** : 256 bits aléatoires dans l'adresse. La base ne garde que son empreinte (pour retrouver le lien) et sa version chiffrée avec la clé de `secrets/` (pour la réafficher au propriétaire). L'adresse est construite à partir de `LISTO_PUBLIC_URL`.
- **Validité recontrôlée à chaque requête** (page, données, photos, mot de passe, cookie) : un lien inconnu, expiré, arrêté, dont la liste est supprimée ou dont le propriétaire est désactivé répond **exactement** pareil : 404 « Lien expiré ou inexistant », sans bouton de connexion. Supprimer la liste ou désactiver le compte du propriétaire arrête le lien pour de bon.
- **Mot de passe** facultatif : 16 caractères tirés par Listo (au moins une minuscule, une majuscule, un chiffre et un caractère parmi `! ? @ # - + = *`, sans 0, O, 1, l ni I), haché avec scrypt, montré une seule fois. 5 mauvais mots de passe en 15 minutes bloquent la saisie 15 minutes (pour ce lien, et pour l'adresse IP) : « Trop d'essais, réessayez plus tard ». Une adresse IP qui essaie 20 liens invalides en 15 minutes est bloquée 15 minutes sur toutes ces routes.
- **Cookie de consultation** (`listo_lien`, après un bon mot de passe) : HttpOnly, Secure, SameSite=Lax, limité au chemin `/api/public/<jeton>`, 12 heures au plus et jamais au-delà de l'expiration du lien. Il est effacé par « Nouveau mot de passe », « Retirer le mot de passe », l'arrêt du lien, et par un redémarrage de Listo (le visiteur ressaisit alors le mot de passe). Aucune autre route de Listo ne le reconnaît.
- **En-têtes** sur toutes ces routes : `X-Robots-Tag: noindex`, `Cache-Control: no-store` (photos comprises), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. La Content-Security-Policy reste la même (la page a son propre fichier `js/public.js`).
- **Service worker** : il ne garde et ne détourne jamais `/p/…`, `/api/public/…` ni `js/public.js` (vérifié par un test qui exécute `sw.js`).
- **Page publique** : chargée à l'ouverture et au bouton « Actualiser », une requête à chaque fois, sans temps réel.
- **Fiche d'un article** (page publique, depuis le 20 octobre 2026) : toucher une ligne (`button.item__body`) ouvre une feuille en lecture seule, construite sur le téléphone avec les seuls champs reçus (`publicItemDetails` de `public/js/format.js`, mêmes classes que la fiche à consulter de l'application) ; aucune requête de plus : la photo de la fiche est une copie de la vignette déjà affichée (canvas, car la photo est servie en `no-store`). Fiche et photo agrandie ajoutent chacune une étape à l'historique (`openLayer` de `public/js/public.js`) : Retour du téléphone, croix, « Fermer », Échap et fond grisé ferment celle du dessus ; focus rendu à la ligne ou à la vignette. Comme l'application, la page publique charge `js/viewport.js` et `js/app-height.js` (sans eux, sur Android, la fiche passait sous la barre de navigation) ; la fiche a un en-tête fixe et sa propre zone qui défile (`.sheet--fixed-head`, `.sheet__scroll` dans `public/css/app.css`). CSP inchangée. Tests : `test/public-sheet.test.js` ; vérifié dans Chromium (navigateur sans compte, clair et sombre, Retour, croix, Échap, fond grisé, focus, aucune requête à l'ouverture, aucune écriture, lien protégé puis expiré, liste de tâches ; écrans bas 360 × 640, 390 × 600 et paysage 640 × 360, appareil Android et iPhone simulés, défilement au doigt par de vrais événements tactiles, en-tête fixe, dernier champ entier, page derrière immobile). Les vrais téléphones restent à essayer, surtout la vraie barre de navigation d'Android (point 29.7 ci-dessus).
- **Journal de sécurité** : création, changements, arrêt, mots de passe refusés et blocages, avec le numéro du partage (`partage=…`), jamais le jeton ni le mot de passe. Le journal d'accès de Nginx Proxy Manager, lui, note les adresses des liens ouverts (voir le [chapitre 3 du guide d'exploitation](exploitation.md#3-régler-nginx-proxy-manager)).
- **Nettoyage** : les liens arrêtés ou expirés depuis plus de 30 jours sont supprimés de la base (ménage toutes les heures).
- Dans « Mes listes », une petite icône de lien rappelle au propriétaire qu'une liste est partagée par lien.

### Vérifier le lien public à la main avec curl

```sh
# Créer un lien de 2 heures, protégé (le mot de passe s'affiche une seule fois)
curl -b cookies.txt -H "Origin: $U" -H 'Content-Type: application/json' \
  -X PUT -d '{"durationHours":2,"protect":true}' $U/api/lists/$L/share
# Noter le jeton (fin de "url") et le mot de passe
J=…   ; MDP='…'

# Sans mot de passe : 401 « Mot de passe requis »
curl -i $U/api/public/$J

# Avec le mot de passe : cookie de consultation, puis la liste
curl -c visiteur.txt -H "Origin: $U" -H 'Content-Type: application/json' \
  -d "{\"password\":\"$MDP\"}" $U/api/public/$J/acces
curl -b visiteur.txt $U/api/public/$J

# Un lien inconnu, puis le lien arrêté : exactement la même réponse
curl -i $U/api/public/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
curl -b cookies.txt -H "Origin: $U" -X DELETE $U/api/lists/$L/share
curl -i $U/api/public/$J
```

## En-têtes, arrêt propre et sauvegarde (étape 11)

**En-têtes de sécurité**, envoyés par Listo sur toutes les réponses (pages, API, fichiers, photos, lien public, erreurs 404 et 500) et vérifiés par `test/headers.test.js` :

| En-tête | Valeur |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` (même domaine seulement, ni script ni style dans la page, pas de `blob:` ni `data:`) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | Interdit à la page les fonctions que Listo n'utilise jamais : position, micro, paiement, USB, capteurs de mouvement… (l'appareil photo reste libre pour la photo d'un article) |
| `X-Robots-Tag` | `noindex, nofollow` (plus `<meta name="robots">` dans la page) : rien n'est indexé par les moteurs de recherche ; volontairement pas de `robots.txt` |
| `Cross-Origin-Opener-Policy` | `same-origin` : une fenêtre ouverte depuis un autre site ne peut pas piloter Listo |
| `Cross-Origin-Resource-Policy` | `same-origin` : aucun autre site ne peut charger les fichiers ou les photos de Listo |
| `Strict-Transport-Security` | **ajouté par Nginx Proxy Manager** (case HSTS), pas par Listo |

`X-Powered-By` est désactivé. Les cookies de connexion s'appellent `__Host-listo_session` et `__Host-listo_2fa` en production (préfixe qui impose Secure, chemin / et aucun domaine), `listo_session` et `listo_2fa` en développement (http). Le lot d'opérations (`POST /api/ops`, 200 ko au plus) n'est lu qu'après la vérification de la session. Les erreurs répondent par un message court en français (« Page introuvable. », « Requête invalide. », « Erreur interne du serveur. »), sans trace ni chemin de fichier ; le détail d'une erreur inattendue va dans `docker logs`. Le cookie de session est `HttpOnly`, `Secure` (en production) et `SameSite=Lax`.

**Démarrage et arrêt** (`server/index.js`, `test/process.test.js`) : en production, Listo refuse de démarrer si `LISTO_PUBLIC_URL` n'est pas en `https://`, avec un message clair. Sur `SIGTERM` (`docker stop`, mise à jour par `docker compose up -d`), il ferme les flux temps réel, n'accepte plus de connexion, termine les requêtes en cours (5 secondes au plus), ferme la base, puis s'arrête.

**Sauvegarde** (`server/backup.js`, `test/backup.test.js`) : chaque nuit à 3 h (heure locale, variable `TZ`), `VACUUM INTO data/backups/listo-AAAA-MM-JJ-HHMM.db`, puis la copie est rouverte en lecture seule et contrôlée (`PRAGMA integrity_check`), mise en droits 600, et seules les 14 plus récentes sont gardées. better-sqlite3 traite une seule requête à la fois : la copie ne tombe jamais au milieu d'une écriture. Les tests avancent l'horloge (rotation à la 15e copie), vérifient qu'aucune copie ne contient la clé, et font une vraie restauration (arrêt, remplacement de `listo.db`, redémarrage : comptes et listes retrouvés). Le même scénario a été vérifié dans le conteneur Docker.

## Groupes repliables (toutes les listes)

Chaque en-tête de groupe de l'écran d'une liste (`public/js/screens/list.js`, `foldableGroup`) est un vrai bouton `.aisle__toggle` (`aria-expanded`, `aria-controls` vers la `<ul>` du groupe, 48 px) : rayons d'une liste de courses, magasins d'une liste « multi », priorités d'une liste triée par priorité. La zone des cochés se replie déjà (`doneZone`). Aucune catégorie n'est inventée : une liste en ordre alphabétique ou par échéance n'a ni en-tête ni bouton. La page publique du lien n'est pas modifiée (en-têtes simples ; sa politique de sécurité stricte reste intacte).

- **Identifiant d'un groupe** (`groupKey` de `public/js/store.js`) : `a:<rayon>`, `s:<magasin>`, `p:<priorité>`, `aucun` pour « Sans rayon » / « Sans magasin », `tous` pour « À acheter ».
- **Tri d'une liste de courses** : `availableSorts` donne `['aisle', 'alpha']` (le premier est le tri par défaut, `defaultSort`) ; `'alpha'` passe par `sortShopping` de `public/js/sorting.js` (un seul groupe `{ all: true, label: 'À acheter' }`, ordre `compareNames`). Le choix est gardé sur le téléphone (`saveItemSort`, jamais une valeur invalide) et ne part jamais vers le serveur ; la page publique appelle `splitDone` sans tri (par rayon). Tests : `test/shopping-sort.test.js`, `test/item-sort.test.js` ; vérifié dans Chromium (menu, vue « À acheter », coche, rechargement, retour par rayon, clair et sombre).
- **Mémoire** : sur le téléphone seulement, une clé par liste, `listo-groupes-replies-<identifiant>` (liste JSON des groupes repliés ; tout déplié = pas de clé) ; la zone des cochés garde sa clé `listo-zone-repliee-<identifiant>`. Jamais envoyé au serveur. Stockage indisponible (navigation privée) : le repli marche pour la visite. Ménage : un groupe dont le rayon ou le magasin n'existe plus est oublié au dessin suivant (`pruneFoldedGroups`) ; les clés des listes qui ne sont plus sur le téléphone sont effacées à l'écran « Mes listes » (`pruneListMemory`, avec le tri de la liste).
- **Redessin** (temps réel, coche, scan, changement de tri) : l'état est relu à chaque dessin dans l'ensemble `folded`, ouvert une fois avec la liste ; replier ou déplier se fait sur place, sans redessin ni saut de défilement.
- **Ajout** : un article ajouté depuis ce téléphone (champ, suggestion, mode scan) dans un groupe replié le déplie (`unfoldRow`, appelé par `revealItem` ou, hors courses, juste après l'ajout). Un ajout venu de l'autre téléphone ne change rien.
- **« Tout replier / Tout déplier »** (`.fold-all`, barre d'état) : visible à partir de deux groupes repliables (zone des cochés comprise) ; « Tout replier » tant qu'un groupe est ouvert.
- Tests : `test/fold-groups.test.js` ; vérifié dans Chromium (390 et 320 px, texte à 130 %, clair et sombre, stockage bloqué, deux téléphones pour le temps réel).

## Recherche (dans une liste et sur « Mes listes »)

Une vue locale sur la copie du téléphone (maquettes de `design/recherche/`, liste en variante B ; « Mes listes » sans loupe, avec le même champ masqué, choix du propriétaire). Aucune route, aucune migration, aucune opération : rien ne part vers le serveur, rien n'est gardé sur le téléphone.

- **Comparaison** (`public/js/search.js`) : `foldText` plie le texte caractère par caractère (minuscules, `NFD` sans les accents, ligatures « œ », « æ », « ß », espaces successifs réunis) et garde, pour chaque caractère plié, sa place dans le texte d'origine ; `findHits` cherche le texte plié avec `indexOf` (jamais une expression régulière construite à partir de la saisie) et rend les places dans le texte affiché ; `highlightParts` découpe le nom en morceaux `{ text, hit }`, posés par l'écran dans `<mark class="hit">` comme du texte. `filterListView` réduit la vue d'une liste (nom seulement, jamais la note) : groupes sans résultat retirés, cochés trouvés gardés ; `filterLists` filtre « Mes listes » sur le titre.
- **Champ masqué** (`public/js/search-row.js`, `createSearchRow`) : `.searchrow` est le premier enfant de `.scroll`, jamais recréé ni déplacé (le dessin remplace seulement ce qui le suit : la saisie et le curseur restent pendant le temps réel). À l'arrivée sur l'écran, la zone est défilée de la hauteur du champ ; une marge invisible `.searchroom` en fin de zone (hauteur recalculée après chaque dessin et à chaque changement de taille, `ResizeObserver`) permet de défiler d'autant dans une liste courte. Champ utilisé (curseur ou texte) : `.searchrow--pinned` (collant en haut) et `.scroll--searching` (en-têtes de groupe collants juste dessous). Entrée : `releaseFocus()` ; croix et « Effacer la recherche » : appui sans perte du curseur (`keepFieldFocus` de `tap.js`).
- **Écran d'une liste** : pendant la recherche, `foldableGroup` rend un en-tête simple avec le nombre de résultats (`resultGroup`), sans lire ni écrire l'état de repli ; `doneZone` est ouverte sans `rememberZone`, sans ses actions et hors de « Tout replier » ; « Tout replier » masqué ; barre d'ajout masquée tant que le curseur est dans le champ (`showAddbar`) ; `.search-meta` (`role="status"`) dans la barre d'état. « Mes listes » : `.search-meta` sous le champ, « Nouvelle liste » masqué pendant la recherche.
- Tests : `test/search.test.js` ; vérifié dans Chromium (390 px, clair et sombre, vrais touchers, clavier simulé façon iPhone et Android, deux téléphones pour le temps réel) : champ masqué à l'ouverture (liste longue, courte, tâches, accueil), révélé sans curseur, « lait » (rayons, panier barré, actions masquées), accents, « .* », croix, « Effacer la recherche », touche Entrée, coche et fiche depuis les résultats, repli retrouvé, changement de liste. **Les vrais claviers de l'iPhone et d'Android restent à essayer** (point 19 ci-dessus).

## Glissement vers la gauche (« Supprimer »)

Raccourci pour supprimer un article ou un élément, dans toutes les listes (`public/js/swipe.js`, branché par `itemRowWith` dans `public/js/screens/list.js`). La poubelle de la fiche reste la voie principale (lecteurs d'écran, clavier, souris).

- **Décision du geste** (fonctions simples, testées dans `test/swipe.test.js`) : `swipeIntent` (sens : rien avant 10 px ; horizontal seulement si |dx| > 1,5 × |dy|, sinon défilement), `swipeOffset` (position : jamais vers la droite ni au-delà de la ligne), `swipeRelease` (ouverte au-delà de 80 px, ou d'un tiers d'une ligne plus étroite).
- **Contrôleur** (`createSwipeController`) : événements tactiles natifs, passifs (le défilement n'attend jamais) ; `touch-action: pan-y` sur la ligne ; contact à moins de 24 px du bord gauche ignoré (geste « retour » de l'iPhone) ; une seule ligne ouverte ; un toucher ailleurs, le défilement de la liste, l'ouverture d'une fiche ou un glissement vers la droite la referment ; la fin d'un glissement et l'appui qui referme une ligne n'ouvrent pas la fiche (l'appui sur la zone rouge, lui, est toujours pris en compte).
- **Suppression** : `deleteWithUndo` de `list.js`, la même que la poubelle de la fiche : `item.delete` par la file d'attente (hors ligne compris), puis le message « « Pain » supprimé · Annuler » (6 secondes, au-dessus de la barre d'ajout) ; « Annuler » envoie `item.restore` (article et photo remis tant que le nettoyage des 30 jours ne les a pas effacés). Aucune nouvelle route.
- Vérifié dans Chromium avec de vrais événements tactiles (`Input.dispatchTouchEvent`) : ouverture, retour, diagonale, défilement vertical, bord gauche, une seule ligne ouverte, appuis inchangés, souris sans effet, suppression et « Annuler », hors ligne, clair et sombre. Le toucher réel (iPhone, Android) reste à vérifier sur les téléphones (point 22 ci-dessus).

## Droit par personne (« Peut modifier » ou « Lecture seule »)

Chaque membre d'une liste (autre que le propriétaire) a un droit, colonne `list_members.access` (migration 12) : `modification` (« Peut modifier » : contributeur) ou `lecture` (« Lecture seule » : invité, valeur par défaut). Les membres présents avant la migration ont reçu `modification`. Le propriétaire a toujours tous les droits : le serveur le reconnaît par `lists.owner_id`, et refuse de lui donner un droit.

- **Une seule fonction décide** : `canEdit(user, ligne)` de `server/lists.js` (propriétaire, ou contributeur (`modification`)), relue dans la base à chaque requête. Elle sert à `requireEdit`, `listForEditor` et `itemForEditor` (opérations de `/api/ops`), au contrôle `mayEdit` des photos (`server/routes/photos.js`) et au mode scan (`server/routes/products.js`, par `listForEditor`). Les routes ne testent jamais elles-mêmes la valeur du droit (vérifié par `test/read-only.test.js`).
- **Écritures protégées** (403 « Vous avez un accès en lecture seule à cette liste. », rien d'écrit, rien d'annoncé) : `item.create`, `item.update` (nom, quantité, note, rayon, magasin, priorité, échéance, code-barres), `item.check`, `item.delete`, `item.restore`, `list.uncheckAll`, `list.removeChecked` (et son ancien nom `list.clearChecked`), `PUT` et `DELETE /api/items/:id/photo`, `POST /api/lists/:id/products`. Réservées au propriétaire, comme avant : `list.update`, `list.delete`, `PUT /api/lists/:id/members`, `/api/lists/:id/share`. Un non-membre reçoit toujours 404, sans rien apprendre.
- **Lecture** permise en lecture seule : `GET /api/lists`, `GET /api/lists/:id`, `GET /api/sync` (chaque liste porte `canEdit`, et chaque membre son `access`), `GET /api/items/:id/photo`, `GET /api/suggestions`, `GET /api/events`.
- **Changer un droit** : `PUT /api/lists/:id/members` avec `access` ; la date de modification de la liste avance et ses membres sont prévenus en temps réel (le droit arrive donc aussi par la synchronisation « depuis »). Journal : `liste_droit_change` (noms de compte, identifiant de la liste, droit), jamais le nom ni le contenu de la liste.
- **Téléphone** : `canEditList(list)` de `public/js/store.js` est la seule règle de l'interface (une copie gardée d'avant cette information reste modifiable jusqu'à la synchronisation ; le serveur refuse de toute façon). `public/js/screens/list.js` : bandeau `.readonly-banner`, champ d'ajout et « Scanner » masqués, lignes sans glissement, case `.check--static` (comme la page publique), fiche à consulter `openItemView`, actions des cochés masquées, et chaque action vérifie encore le droit. Si le droit change, la liste ouverte bascule tout de suite (`closeOverlays` de `router.js` ferme les fenêtres en un seul retour dans l'historique, clavier replié, message). `public/js/screens/list-form.js` : composant `accessChoice` sous chaque personne cochée. `public/js/app.js` : un refus « lecture seule » venu de la file d'attente donne le message « Cette liste est maintenant en lecture seule : vos modifications hors ligne n'ont pas été envoyées. », après la synchronisation complète qui remet l'écran à l'état du serveur.
- Tests : `test/read-only.test.js` (serveur, migration), `test/read-only-ui.test.js` (téléphone, file d'attente) ; vérifié dans Chromium (création, « Modifier la liste », liste et fiche en lecture seule, bascule en direct avec deux fenêtres et le clavier ouverts, file hors ligne, clair et sombre).

## Priorité et échéance activées ou non (migration 13)

Deux réglages par liste, `lists.priority_enabled` et `lists.due_enabled` (0 ou 1, contrainte CHECK), envoyés au téléphone dans chaque liste (`priorityEnabled`, `dueEnabled`). Une liste de courses les ignore. Listes existantes autres que les courses : 1 et 1 ; nouvelle liste : 0 et 0 (valeur par défaut de la base et de `list.create`).

- **Serveur** (`server/lists.js`) : `list.create` et `list.update` (propriétaire) acceptent `priorityEnabled` et `dueEnabled` (vrai ou faux, sinon 400 « Réglage « Priorité » invalide. ») ; `item.update` refuse `priority` si la priorité est désactivée (400 `PRIORITY_OFF`, « La priorité est désactivée pour cette liste. ») et `dueDate`, même `null`, si l'échéance l'est (`DUE_OFF`), relus dans la base (`memberItem`) avant toute écriture. Les valeurs des éléments ne sont jamais effacées. Page publique (`server/routes/public.js`) : `priority` et `dueDate` seulement si le réglage est activé.
- **Téléphone** : `listOptions(list)` de `public/js/store.js` est la seule règle (`{ priority, due }`, jamais pour une liste de courses ; copie d'avant les réglages : comme avant) ; `availableSorts` et `effectiveSort` : tris proposés, et tri appliqué (le choix gardé `listo-tri-liste-<id>` s'il est encore proposé, sinon alphabétique, sans l'effacer). `public/js/screens/list.js` : pastilles (`metaOf`), champs de la fiche (cachés et jamais envoyés quand désactivés, aussi si le réglage change pendant que la fiche est ouverte : `showOptions`), fiche à consulter, menu de tri (bouton masqué s'il ne reste que l'ordre alphabétique). `public/js/screens/list-form.js` : composant `optionSwitches` (deux `.switch` dans `.card.list-options`), visible seulement hors courses. `public/js/app.js` : refus hors ligne → « Cette option est désactivée pour cette liste. ».
- Tests : `test/list-options.test.js` ; vérifié dans Chromium (création, « Modifier la liste », changement de catégorie, réglage changé pendant que la liste et la fiche sont ouvertes, tri gardé, clair et sombre).

## « Après l'ajout » (migration 15)

Colonne `lists.add_mode` (`'quick'` ou `'detail'`, contrainte CHECK), envoyée au téléphone dans chaque liste (`addMode`).

- **Serveur** (`server/lists.js`) : `addModeOf` n'accepte que `ADD_MODES` (sinon 400 « Réglage « Après l'ajout » invalide. ») ; `list.create` (sans valeur : `'quick'` pour une catégorie de courses, `'detail'` sinon), `list.update` (propriétaire seulement, comme les autres réglages ; changer de catégorie ne le change pas), `duplicateList` (copié), `describeList`. Migration : `addModeMigration` de `server/db.js` (listes de courses `'quick'` ; autres : `'detail'` si `priority_enabled` ou `due_enabled`, sinon `'quick'`), qui écrit le nombre de listes de chaque sorte dans le journal du conteneur.
- **Téléphone** : `addModeOf`, `defaultAddMode` et `applyOp` de `public/js/store.js` (copie locale tout de suite, hors ligne compris ; une copie d'avant la migration vaut « Rester sur la liste ») ; formulaire `public/js/screens/list-form.js` (`addModeChoice`, choix `.segmented` dans la carte des options, envoyé seulement s'il a changé) ; écran `public/js/screens/list.js` : `addTyped` (« + », Entrée, suggestion) relit le réglage de la liste à chaque ajout et, en `'detail'`, ouvre `openItemSheet` sur l'élément créé dans `whenKeyboardClosed` : dès que la zone visible a retrouvé toute la hauteur de la fenêtre (le clavier est replié ; `app-height.js` a retiré `data-keyboard` dès la perte du curseur, mais la hauteur ne revient qu'avec le clavier), puis deux images ; 700 ms au plus. Le click qui suit le relâchement du « + » est déjà ignoré par `tap.js` (`ghostClick`) : il ne referme pas la fiche.
- Tests : `test/add-mode.test.js` ; vérifié dans Chromium (vrais touchers, clavier simulé façon iPhone et Android, « + », Entrée, suggestion et article inconnu d'une liste de courses, croix, disquette, hors ligne, formulaire en clair et en sombre, deux téléphones). Avant `whenKeyboardClosed`, la fiche s'affichait d'abord au-dessus du clavier simulé de l'iPhone puis descendait : corrigé. **Les vrais claviers restent à essayer** (point 10 ci-dessus, sous-points 1 à 5).

## Icône d'une liste (migration 14)

Colonne `lists.icon` (texte, vide par défaut = icône de la catégorie), envoyée au téléphone dans chaque liste (`icon`). La liste blanche est dans `public/js/list-icons.js` (`LIST_ICONS` : identifiant et nom en français, dans l'ordre de la grille), partagée par le serveur et le téléphone ; chaque identifiant est une icône du sprite (`#i-<identifiant>`).

- **Serveur** (`server/lists.js`) : `listIconOf` accepte un identifiant de la liste blanche ou `""`, sinon 400 « Icône inconnue. » ; contrôlé dans `list.create` et `list.update` (propriétaire seulement), copié par `duplicateList` ; `describeList` ne renvoie jamais une valeur inconnue. La page publique ne l'envoie pas.
- **Téléphone** : `listIcon(list)` donne l'icône à afficher (celle choisie, sinon `categoryIcon`). `public/js/screens/list-form.js` : grille `.icon-grid` (boutons `.icon-grid__opt`, `role="radio"`, coche `.icon-grid__check`), `icon` envoyé seulement s'il a changé ; `public/js/store.js` (`applyOp`) : copie locale tout de suite, hors ligne compris ; carte (`public/js/screens/lists.js`) et en-tête (`public/js/screens/list.js`, `.topbar__icon`).
- Tests : `test/list-icons.test.js` ; vérifié dans Chromium (grille, choix, enregistrement, temps réel sur un second téléphone, nouvelle liste sans choix, clair et sombre).

## Autorisation pour Claude (migration 17)

Étape A de [docs/mcp-cadrage.md](mcp-cadrage.md) : Listo est son propre serveur d'autorisation OAuth. Tout est écrit à la main (`node:crypto`, express, better-sqlite3), sans bibliothèque. Routes montées seulement si `LISTO_MCP=on` (`config.mcp`) ; le service `ctx.oauth`, lui, existe toujours, pour que les révocations liées au compte s'appliquent même désactivé.

- **Tables** : `oauth_clients`, `oauth_requests` (10 minutes), `oauth_grants` (connexions) et `oauth_grant_lists`, `oauth_codes` (60 s), `oauth_tokens` (accès 1 h, renouvellement 30 jours). Codes et jetons : `crypto.randomBytes(32)`, en base seulement `hashToken` (SHA-256, comme les sessions).
- **Applications** (`server/oauth-clients.js`) : `allowedRedirect` (claude.ai exact, bouclage `localhost` / `127.0.0.1`), `redirectMatches` (port ignoré pour le bouclage seulement), `cimdUrl` (liste blanche, aucun appel réseau si refusé), `fetchClientMetadata` (5 s, 16 ko, `redirect: 'manual'`), `checkRegistration` (DCR).
- **Service** (`server/oauth.js`) : `resolveClient`, `register`, `createRequest`, `approve` (plafond de 5 connexions, remplacement de la même application par `app_key`), `refuse`, `exchangeCode`, `refresh` (rotation ; copie de la réponse 60 s en mémoire, `recentRefresh`), `revokeGrant`, `revokeAllForUser` (appelée par `revokeAllSessions` de `server/auth.js` : mot de passe changé, compte désactivé, réinitialisé), `revokeToken`, `verifyAccess` (pour `/mcp`, étape B), `purge`. Dans `exchangeCode` et `refresh`, les refus sont *renvoyés* par la transaction (pas lancés) : une révocation décidée dedans reste enregistrée.
- **Routes** (`server/routes/oauth.js`) : descriptions (RFC 9728, 8414), `/oauth/authorize` (application et retour vérifiés d'abord : sinon page `server/pages/autorisation-invalide.html`, sans redirection ; puis 303 vers `/#/autoriser/<id>`), `/oauth/token` (`express.urlencoded`), `/oauth/revoke`, `/oauth/register` ; `/api/oauth/demandes/:id` (+ `/accord`, `/refus`) derrière la session, `requireSameOrigin` et `requirePasswordChanged`. Mot de passe et code 2FA vérifiés avec `verifyPassword`, `checkSecondFactor` et le limiteur de la connexion.
- **Téléphone** : `public/js/screens/claude-consent.js`, adresse `#/autoriser/:id` (`router.js`), sans panneau latéral ; après la connexion (ou un mot de passe imposé à changer), retour à la demande (`app.afterLogin`). Accord et refus : `POST`, puis `location.assign()` vers l'adresse renvoyée (un formulaire posté puis redirigé vers claude.ai serait bloqué par `form-action 'self'` : la CSP reste inchangée). Classes du kit (`.card`, `.row`, `.radio-row`, `.tick-row`, `.note`, `.note--danger`) ; un seul ajout dans `app.css` : `.card--clip`.
- Commande de secours (`server/admin-secours.js`) : révoque aussi les connexions du compte, en SQL direct.
- Tests : `test/oauth.test.js` (faux client qui rejoue tout le flux, CIMD simulé, aucun vrai réseau), `test/rescue.test.js` (commande de secours). Vérifié dans Chromium (écran en clair et en sombre, retour local de Claude Code, refus, connexion puis retour). **À vérifier avec un vrai Claude** : point 33 ci-dessus.

## Serveur MCP en lecture seule (étape B)

`server/mcp.js` (transport et protocole) et `server/mcp-tools.js` (outils), montés seulement si `LISTO_MCP=on`. Aucune bibliothèque : JSON-RPC 2.0 écrit à la main, sans état (aucune session), réponses `application/json` seulement.

- **Ordre des contrôles** (une suite de `router.post('/mcp', …)`) : `Origin` (absent, `https://claude.ai`, `https://claude.com`, sinon 403 et `claude.origine_refusee`) ; jeton `Bearer` lu dans l'en-tête seulement et vérifié par `oauth.verifyAccess` (401 avec `WWW-Authenticate: Bearer resource_metadata=…, scope=…[, error="invalid_token"]`, `claude.jeton_refuse` une fois par minute et par IP) ; portée `lists:read` (403 `insufficient_scope`) ; débit, 120 appels par minute et par connexion (429, `Retry-After`) ; seulement alors le corps (`express.json`, 20 ko) ; lot, forme JSON-RPC, en-tête `MCP-Protocol-Version` (`PROTOCOL_VERSIONS`) ; méthode. GET et DELETE : 405 avec `Allow: POST`. Erreur inattendue : -32603 « Erreur interne. », le détail dans `docker logs` seulement.
- **Outils** (`TOOLS`, ordre fixe, descriptions sans donnée d'un compte) : `list_lists` (`ctx.lists.myLists` filtré par la connexion, comptes d'éléments par une requête paramétrée) et `read_list` (`ctx.lists.readList`, qui ne renvoie une liste que si le compte en est membre). Sortie construite champ par champ, textes coupés par `clip` ; `content` = `DATA_NOTICE` + le même JSON que `structuredContent`. Arguments vérifiés à la main (`ParamsError` → -32602), y compris un argument inconnu.
- **Dernière utilisation** : `oauth.useGrant(grantId)`, écrite au plus une fois par minute (mémoire `lastWrites`). `verifyAccess` donne aussi `grant.clientHost` (pour le journal `claude.outil`).
- Tests : `test/mcp.test.js` (jetons obtenus par le vrai flux OAuth : 401 dans tous les cas prévus, cookie seul refusé, versions, erreurs de protocole, 405, Origin, droits et sélection de listes, membre retiré, sorties champ par champ, pagination, débit, journal). **À vérifier avec un vrai Claude** : point 33.7 ci-dessus et `docs/exploitation.md`, chapitre 14, « Premier essai ».

## Écran « Connexions Claude » (étape D)

- **Serveur** : `publicUser` (`server/auth.js`) ajoute `claudeUrl` (adresse de `/mcp`) seulement si `config.mcp` ; c'est le seul signal que reçoit le téléphone. Routes dans `oauthConsentRoutes` (`server/routes/oauth.js`, montées seulement si `LISTO_MCP=on`) : `GET /api/me/claude` (`oauth.listGrants` : réponse champ par champ, noms des listes choisies encore existantes dont le compte est membre), `DELETE /api/me/claude/:id` (`oauth.revokeOwnGrant` : seulement une connexion active du compte, sinon 404 « Connexion introuvable. »), `DELETE /api/me/claude` (`oauth.revokeAllOwn`). Journal `claude.revocation` avec `par="le compte"`. `last_used_at` n'est plus écrit à l'autorisation ni au renouvellement, seulement par `useGrant` (appels de `/mcp`).
- **Téléphone** : `public/js/screens/claude-connections.js` (adresse `#/reglages/claude`, entrée dans `account.js`, `case 'claudeConnections'` dans `app.js` qui renvoie vers Mon compte si `claudeUrl` est vide) ; confirmations avec `confirmDialog` (`ui.js`) ; copie avec `navigator.clipboard`. Aide : `CLAUDE_TOPIC` dans `public/js/help-content.js`, ajoutée par `helpSections(user)` à « Pour tout le monde » quand `user.claudeUrl` est renseigné (`{adresse}` remplacé) ; `test/help-labels.test.js` la vérifie aussi.
- **Styles** : composants du kit ; seules quelques règles de mise en place dans `public/css/app.css` (`.claude-connections…`).
- Tests : `test/mcp-connections.test.js` (seulement ses connexions, champ par champ, sans jeton ni empreinte, identifiant d'un autre compte inconnu, une déconnexion laisse les autres, tout déconnecter, refus sur `/mcp` tout de suite, sans session, autre origine, LISTO_MCP désactivé, écran et aide) ; vérifié dans Chromium (clair, sombre, 320 px, confirmation, aide). **À vérifier sur les téléphones** : point 33.9 ci-dessus.

## Ajout et cochage par Claude (étape C)

Deux outils de plus dans `server/mcp-tools.js`, réservés à une connexion « Lecture et ajout » (`grant.scope` contient `lists:write`).

- **`writable(access, listId)`** : portée d'écriture (sinon « Cette connexion est en lecture seule. »), liste de la connexion dont le compte est membre (`inGrant` puis `ctx.lists.readList`, sinon « Liste introuvable. »), droit de modifier (`list.canEdit`, sinon le message `READ_ONLY` de `server/lists.js`).
- **`add_items`** : types vérifiés à la main (`ParamsError`) ; tri en mémoire : nom répété dans la demande ou ajouté par la même connexion il y a moins de 2 minutes (`recentAdds`, clé connexion + liste + `normalizeItemName`), puis élément de même nom non coché déjà dans la liste ; plafond de 100 ajouts par heure et par connexion (`addTimes`) vérifié **avant** toute écriture ; puis une opération `item.create` par élément, identifiants tirés par le serveur, envoyées à `ctx.lists.applyOps(user, ops)` : exactement le chemin de `/api/ops` (validation, droits, rayon habituel, mémoire des noms, `news.log`, `notifyList`, `applied_ops`). Un refus de l'application devient « ignoré » avec son message.
- **`set_checked`** : seuls les éléments de la liste lue comptent (un identifiant inconnu ou d'une autre liste a la même raison) ; déjà dans l'état demandé : `unchanged` ; sinon `item.check` par `applyOps`. Plafond de 300 cochages ou décochages par heure et par connexion (`CHECKS_PER_HOUR`, `checkTimes`, même mécanisme que `addTimes` : heures des changements de l'heure écoulée, en mémoire) vérifié **avant** toute écriture, sur le nombre d'éléments qui changent vraiment ; au-delà, erreur d'outil et rien n'est écrit.
- `tools.call` renvoie aussi `log` (nombres créés, ignorés, cochés) pour la ligne `claude.outil` de `server/mcp.js` ; `tools.prune()` vide les mémoires (`recentAdds`, `addTimes`, `checkTimes`) dans le ménage horaire ; elles repartent de zéro au redémarrage. `refusedLogged` (ligne « jeton refusé ») est plafonnée à `MAX_REFUSED_IPS` adresses.
- Tests : `test/mcp-write.test.js` (droits, lecture seule, invitée, « Peut modifier », membre retirée, 20 au plus, validation, plafonds horaires des ajouts et des cochages (heure glissante, avec l'horloge du test ; un redémarrage n'est pas testé), anti-doublon avec l'horloge du test, identifiants mélangés, Nouveautés, synchronisation, temps réel, jeton révoqué ou expiré, journal) ; outils partagés avec `test/mcp.test.js` dans `test/mcp-helpers.js`. **À vérifier avec un vrai Claude** : point 33.8 ci-dessus.

## Nouveautés (migration 16)

Deux tables : `list_events` (journal : liste, auteur, type `add`/`update`/`check`/`uncheck`/`delete`, élément, date ; jamais de texte) et `list_reads` (repère de chaque membre : `last_seen`, `behind`, `muted`) ; deux colonnes de `users` : `news_enabled`, `news_checks`.

- **Serveur** (`server/news.js`, appelé par `server/lists.js`) : `log` après chaque opération sur un élément (création, modification, cochage, suppression, « Tout décocher », « Retirer les cochés », photo par `server/routes/photos.js`) ; si l'auteur était à jour, son repère suit. `startReading` / `stopReading` à l'arrivée et au départ d'un membre, `dropList` à la suppression d'une liste. `newsFor(user)` calcule, à chaque synchronisation (`news` de `GET /api/sync`, en entier), pour chaque liste du compte : nombre, `behind` (« 30+ »), sourdine, repère, fin du journal et éléments (`added` l'emporte, sinon le dernier changement) avec le nom de l'auteur (« un ancien membre » si le compte est désactivé) ; seules les listes dont le compte est membre y figurent. Opérations : `list.seen` (`markSeen`, repère qui ne fait que monter, plafonné à la fin du journal), `list.mute`, `account.news` ; un changement prévient les autres appareils du compte seulement (`notifyUsers`). Nettoyage : `purgeOld` dans le nettoyage périodique de `server/app.js`.
- **Téléphone** : `state.news` dans `public/js/store.js` (copie locale, gardée hors ligne ; `applyOp` applique `list.seen`, `list.mute`, `account.news` tout de suite ; `listNews`, `newsBadge`, `newsTotal`, `seenTarget`, `isListMuted`) ; textes dans `public/js/format.js` (`newsMark`, `newsBadgeLabel`) ; pastille `newsPill` de `public/js/screens/lists.js` ; halo dans `public/js/screens/list.js` (`takeNews` : seulement si `document.visibilityState` vaut `visible`, garde les éléments de la visite dans `visitNews` puis envoie `markSeen` ; `markNews` retire le halo au toucher de la ligne) ; menu de `public/js/screens/list-actions.js` (`newsMuteAction`) ; interrupteurs de `public/js/screens/account.js` (`newsSwitches` : `role="switch"`, nom donné par le titre de la ligne avec `aria-labelledby`, description fixe reliée par `aria-describedby`, état dans `aria-checked` seulement) ; badge de l'icône (`navigator.setAppBadge`, essayé dans un try) dans `public/js/app.js`.
- **Affichage** : classes du kit, `design/listo.css` section 16.13 (`.news-badge`, `.item--news`, `.item__news`), aucune couleur nouvelle.
- **Correction au passage** (`public/js/screens/list.js`) : le bouton « Tout replier » n'est plus masqué un instant au début de chaque dessin de la liste ; ce masquage changeait de 12 px la hauteur de la zone qui défile et laissait voir le bas du champ de recherche masqué quand un dessin survenait (par exemple à l'arrivée d'une nouveauté).
- Tests : `test/news.test.js` (règles de calcul, trois repères indépendants, nouveau membre, membre retiré, « 30+ », nettoyage et plafond, migration 16, « vu » rejouable et qui ne descend pas, droits, sourdine et réglages, temps réel vers les autres appareils, aucun nom d'auteur pour un non-membre, halo gardé pendant la visite) ; vérifié dans Chromium (deux téléphones simulés, clair et sombre, arrière-plan simulé, hors ligne). **À vérifier sur de vrais téléphones** : point 32 ci-dessus.

## Photo et scan sur Android (choix de la source)

`createImagePicker` (`public/js/photo.js`) crée, sur Android seulement (`isAndroid()`, agent utilisateur ; la seule fonction à retirer pour revenir à un seul geste), un second champ caché `capture="environment"` à côté du champ habituel (`picker.input` est alors un `<span class="image-picker">` qui contient les deux). Le bouton ouvre la feuille « Prendre une photo / Choisir dans la galerie / Annuler » (`openSheet` de `ui.js`, chargé à ce moment-là) ; chaque choix ouvre son champ dans l'appui, puis ferme la feuille. Le fichier suit ensuite exactement le même chemin (`onFile`). Tests : `test/android-picker.test.js` (détection, deux choix, bon champ, Annuler, hors Android inchangé) et `test/scan-choice.test.js` ; vérifié dans Chromium avec un navigateur Android simulé (photo, code-barres, Scanner, clair et sombre) et avec un navigateur iPhone et ordinateur (inchangé).

## Mode scan des listes de courses

Dans une liste de courses, le bouton « Scanner » (icône `i-barcode`, à côté du champ d'ajout) ouvre directement le sélecteur d'images du téléphone : c'est lui qui propose l'appareil photo ou la photothèque, Listo n'ajoute aucun menu. **Un seul composant pour tous les points d'entrée** (`createImagePicker` de `public/js/photo.js`) : photo d'un article, bouton de scan du champ Code-barres (icône seule), « Scanner » de la barre d'ajout, « Réessayer » du mode scan. C'est un champ fichier caché `<input type="file" accept="image/*">`, **sans l'attribut `capture`** (il forcerait l'appareil photo et cacherait la photothèque sur certains téléphones), placé dans la page et ouvert directement dans l'appui (exigé par l'iPhone) ; ni `getUserMedia`, ni flux vidéo, ni changement de Permissions-Policy. Tout passe par la même lecture (`readBarcode`). Un fichier qui n'est pas une image est refusé (« Ce fichier n'est pas une image lisible… »). Pour une grande photo, les quatre coins sont aussi essayés (code en bas ou sur un côté). « Code non lu » propose « Réessayer » (le même sélecteur) et la saisie à la main. La photo est lue **sur le téléphone** et n'est jamais envoyée ni gardée : seul le numéro du code part vers Listo.

Parcours (`public/js/screens/scan.js`) :
1. photo du code-barres → lecture (`public/js/barcode.js`) : image redressée (`createImageBitmap`, `imageOrientation: 'from-image'`), réduite à 1 600 px sur le grand côté, puis plusieurs essais (image entière, centre de l'image, quatre coins pour une grande photo, image réduite à 800 px), dans un worker (`barcode-worker.js`) : l'écran ne fige pas ;
2. `POST /api/lists/:id/products` → nom du produit (Open Food Facts, côté serveur) ;
3. feuille : nom (modifiable), note « marque · format », avertissement « Déjà dans la liste » (même nom, majuscules et accents ignorés ; « Ajouter quand même »), mention « Données : Open Food Facts » ; « Ajouter à la liste » passe par l'ajout normal (rayon ou magasin habituel, sinon demandé une fois) et la file d'attente habituelle (`item.create`) ;
4. « Ajouter à la liste » : la feuille se ferme, retour sur la liste, clavier replié (`releaseFocus` de `ui.js`), toast « Ajouté : … », article mis en évidence. Pour un autre produit, on réappuie sur « Scanner ».

**Scan pour cocher** : avant toute recherche, le code est cherché dans la liste ouverte, sur le téléphone (`listItemForEan` de `public/js/store.js`, aucun appel : marche hors ligne avec le lecteur déjà gardé). Article trouvé : « Déjà dans la liste : <nom> » → « Cocher (je l'ai pris) » (`item.check` habituel), « Ajouter quand même », « Annuler » ; article coché : « Déjà coché : <nom> » → « Le remettre dans la liste ». Plusieurs articles : le premier non coché, sinon le dernier coché.

Le code lu ou tapé est enregistré avec l'article (`ean`, migration 11), que le produit soit trouvé ou non. « Déjà dans la liste » (`duplicateOf` de `public/js/store.js`) se déclenche pour un article de la liste qui porte le même code, puis pour le même nom. La feuille d'un article de liste de courses a un champ « Code-barres » (titre « Code-barres (8, 12 ou 13 chiffres) », aide dans le `<label>` grâce à l'option `aside` de `field` dans `public/js/dom.js`) : saisie à la main ; à droite, sur la même ligne, le bouton de scan, icône seule (`aria-label` « Scanner un code-barres », le même sélecteur d'images, même lecteur, `readBarcode`) ; dans le champ, une petite croix « Effacer le code-barres » (`.input-wrap` du kit), visible seulement s'il contient quelque chose, qui le vide sans y mettre le curseur (tests : `test/item-fields.test.js`) ; un code invalide est signalé avant l'envoi, et le serveur le vérifie de nouveau (clé de contrôle, forme normalisée).

Sans code lu (« Code non lu, réessayez plus près et bien à plat, ou saisissez-le »), sans nom (produit inconnu, panne, hors ligne) ou sans lecteur (pas encore téléchargé, WebAssembly refusé) : saisie à la main du code puis du nom ; les champs n'apparaissent que sur appui, jamais avec le curseur dedans. Le code-barres n'est jamais écrit dans la note : il a son propre champ (`ean`). `LISTO_PRODUCT_LOOKUP=off` : bouton masqué (le compte connecté porte `productLookup: false`).

### Route `POST /api/lists/:id/products`

- Corps : `{"code": "…"}` (le code n'est jamais dans l'adresse : il n'apparaît pas dans les journaux du proxy). Compte connecté, membre de la liste, liste de courses ; sinon 401 ou 404.
- Code accepté : 8, 12 ou 13 chiffres avec une clé de contrôle EAN valide (sinon 400, aucune demande sortante). Un UPC-A (12 chiffres) devient un EAN-13 (un 0 devant) avant la recherche et le cache.
- Ordre : avant toute demande sortante, le serveur cherche un article qui porte ce code parmi les listes dont le compte est membre (articles supprimés depuis moins de 30 jours compris, le plus récent d'abord ; `knownProduct` de `server/lists.js`) : `{"status": "known", "name", "note"}` (ni identifiant ni nom de liste), sans Open Food Facts ni compteur sortant. Le téléphone a déjà regardé la liste ouverte (scan pour cocher) et ses autres listes (`knownItemForEan` de `public/js/store.js`, hors ligne compris).
- Réponses (toujours `Cache-Control: no-store`) : `{"status": "known", "name", "note"}`, `{"status": "found", "name", "brand", "quantity"}`, `{"status": "unknown"}` (inconnu, non alimentaire, code « en 2 » propre à un magasin), `{"status": "unavailable"}` (panne, délai, limite atteinte), `{"status": "disabled"}` (`LISTO_PRODUCT_LOOKUP=off`) ; 429 au-delà de 30 recherches par minute pour un compte.
- Demande sortante (`server/products.js`) : `GET https://world.openfoodfacts.org/api/v3/product/<code>?fields=code,product_name,product_name_fr,generic_name,brands,quantity`, en-tête `User-Agent: Listo/<version de package.json> (+https://github.com/magicgg91/listo)` (avec `; <LISTO_PRODUCT_CONTACT>` si renseignée), `redirect: 'manual'` (une redirection, vers Open Beauty Facts par exemple, donne « inconnu »), délai 5 s, 32 ko au plus, aucun cookie ; 10 demandes par minute au plus pour tout le serveur.
- Analyse tolérante (`productFrom`) : nom = `product_name_fr`, sinon `product_name`, sinon `generic_name` ; nettoyé (caractères invisibles et de contrôle retirés, espaces regroupés), 60 caractères au plus coupés entre deux mots ; marque = première de `brands` (40 caractères) ; format = `quantity` (30 caractères). `status: "failure"`, `result.id: "product_not_found"`, produit absent ou sans aucun nom : inconnu. Réponse qui n'est pas un objet : panne.
- Cache en mémoire, sans migration : 500 produits, 7 jours (trouvé) ou 1 jour (inconnu) ; une panne n'est pas gardée.
- Journaux : ni le code ni le nom ; une panne écrit seulement sa cause (« Recherche de produit impossible : délai dépassé »).

### Lecteur de codes-barres copié (`public/vendor/zxing-wasm-3.1.4/`)

Dépendance **côté navigateur seulement**, validée par le propriétaire (option « b » du plan) : elle n'est pas dans `package.json` et n'est jamais chargée par le serveur. Copie obtenue ainsi, le 18 octobre 2026 :

1. `npm pack zxing-wasm@3.1.4` (paquet [zxing-wasm](https://github.com/Sec-ant/zxing-wasm), version 3.1.4 publiée le 10 septembre 2026) ;
2. empreinte du paquet comparée à celle du registre npm (`npm view zxing-wasm@3.1.4 dist.integrity`) : `sha512-1+v8p7sauddySVNG+ye7GD/0TS95BG2ycdkrC+EnBrFBFkHeIghzUt2yVjtx3NucJeNrQnhT8yGAIz60Vx9o0w==`, identique ;
3. quatre fichiers copiés **sans aucune modification** (lecteur seul : ni le générateur de codes, ni la version complète) :

| Fichier copié | Origine dans le paquet | SHA-256 |
| --- | --- | --- |
| `es/reader/index.js` | `dist/es/reader/index.js` | `d90c69a827aff3b7c8c8ca310efebe91671ef076f7a0ec83722bfc542814f484` |
| `es/share.js` | `dist/es/share.js` | `08868fb770b0a4e4b9eb3d717015cd5fbf3ceb06492d4cb2d2dd2739db11890f` |
| `reader/zxing_reader.wasm` | `dist/reader/zxing_reader.wasm` | `e8af31edb56d0522f4de74495839385ef019ba8bc90d38e5ecb2f18795d86fb2` |
| `LICENSE` | `LICENSE` | `fb506e4ade12d7a9efa67c9d76a9a28c8e15d347ca49a69e48e29b40b34ad2ab` |

Taille : 1 Mo en tout (dont 953 ko pour le programme WebAssembly, environ 420 ko compressé). Licences : MIT (zxing-wasm) et Apache-2.0 (ZXing-C++, compilé dans le `.wasm`), mentionnées dans `NOTICE`. Le test `test/scan-reader.test.js` vérifie les empreintes ci-dessus (et leur présence dans ce document), la mention dans `NOTICE`, l'absence de `zxing` dans `package.json`, et lit des codes-barres générés (EAN-13, EAN-8, UPC-A, tournés, inclinés, flous) avec ce lecteur, sans réseau.

**Jamais de CDN** : par défaut, la bibliothèque irait chercher son `.wasm` sur jsDelivr. `barcode-worker.js` remplace cette adresse (`locateFile`) par celle de Listo ; la CSP (`connect-src 'self'`) bloquerait de toute façon tout autre site.

**Content-Security-Policy** : les pages de l'application reçoivent `script-src 'self' 'wasm-unsafe-eval'` (`APP_CONTENT_SECURITY_POLICY` de `server/app.js`), indispensable pour compiler un programme WebAssembly (vérifié dans Chromium : sans lui, la compilation est refusée). Il n'autorise que WebAssembly, jamais `eval` du JavaScript (`'unsafe-eval'` reste interdit). La page du lien public (`/p/…`) et son API (`/api/public/…`) gardent la politique stricte, sans exception. `worker-src 'self'` : le worker vient de Listo. Le `.wasm` est servi en `application/wasm`.

**Service worker** : le lecteur n'est pas dans `APP_FILES` (rien n'est téléchargé à l'installation). Au premier scan, ses fichiers sont gardés dans un cache à part, `listo-vendor-zxing-wasm-3.1.4` (« copie gardée d'abord » : l'adresse contient la version), qui survit aux mises à jour de Listo ; il n'est effacé qu'au passage à une autre version du lecteur.

**Mettre à jour le lecteur** (rare, et seulement avec l'accord du propriétaire) : refaire les étapes 1 à 3 avec la nouvelle version dans un nouveau dossier `public/vendor/zxing-wasm-<version>/`, supprimer l'ancien, mettre à jour le chemin dans `barcode-worker.js`, `VENDOR_PREFIX` et `VENDOR_CACHE` dans `sw.js`, les empreintes de ce document et de `test/scan-reader.test.js`, `NOTICE`, et changer le début de `VERSION` dans `sw.js`.

### À tester sur les téléphones

Ce qui ne peut pas être testé automatiquement (appareil photo réel, vraies photos, Safari) :

1. **iPhone, application installée (PWA)** : ouvrir Listo depuis son icône, une liste de courses → « Scanner » : le menu de l'iPhone propose « Prendre une photo » et « Photothèque » (essayer une photo HEIC récente, une capture d'écran d'un code-barres, et une grande photo où le code est dans un coin). Photographier le code-barres d'un produit courant, à 10–15 cm, bien à plat : la fiche montre le nom, la marque et le format. Essayer une photo en portrait et une en paysage. Le premier scan peut prendre quelques secondes (téléchargement du lecteur, 1 Mo).
2. **iPhone, hors ligne** : après un premier scan, mode avion, fermer et rouvrir Listo depuis son icône, scanner : le code est lu, « Hors ligne : le nom du produit est indisponible », « Taper le nom » ; l'article part au retour du réseau.
3. **iPhone, mode Isolement** (si vous l'utilisez) : le scan affiche « La lecture des codes-barres n'est pas disponible… » et propose la saisie à la main.
4. **Brave sous Android** (application installée) : mêmes points 1 et 2. Si l'appareil photo ne s'ouvre pas, vérifier les autorisations de Brave (Réglages Android → Applications → Brave → Autorisations → Appareil photo) ; si Brave bloque le lecteur, Listo le dit et propose la saisie à la main : me donner le message affiché.
5. **Cas difficiles** : code-barres sur une boîte de conserve (courbe), sur un emballage brillant (reflet), photo un peu floue : noter ce qui est lu ou non. « Code non lu » doit toujours proposer de reprendre la photo ou de saisir le code.
6. **Clavier** : aucun champ ne s'ouvre avec le clavier tout seul ; « Saisir le code à la main » ouvre un clavier numérique au toucher du champ.
7. **Scan pour cocher** (en magasin) : scanner un produit déjà dans la liste (avec son code-barres) : « Déjà dans la liste : <nom> » → « Cocher (je l'ai pris) » : la feuille se ferme, « Coché : <nom> », l'article passe dans le panier. Rescanner : « Déjà coché » → « Le remettre dans la liste ». Refaire en mode avion (après un premier scan avec du réseau) : ça marche, et part au retour du réseau.
8. **Liste de tâches** : pas de bouton « Scanner ».
9. **Mes produits** : scanner un produit déjà ajouté une fois dans une autre de vos listes : « Produit connu : <votre nom> », sans mention d'Open Food Facts ; même chose en mode avion si l'article est encore dans une liste.
10. **Un seul bouton** (Safari et application installée sur iPhone ; Chrome, Brave et Samsung Internet sous Android) : « Scanner » de la barre d'ajout, le bouton de scan (icône) du champ Code-barres, « Ajouter une photo » / « Changer la photo » de la feuille d'un article, et « Réessayer ». Sur iPhone, ils ouvrent directement le menu du téléphone (« Photothèque », « Prendre une photo ou une vidéo », « Choisir le fichier ») ; sur Android, la petite feuille « Prendre une photo » / « Choisir dans la galerie » s'ouvre d'abord (point 25 de « [Vérifier sur les téléphones](#vérifier-sur-les-téléphones) »). Vérifier les deux chemins à chaque endroit : photo prise sur le moment, et photo déjà dans la galerie.
11. **HEIC (iPhone)** : choisir dans la photothèque une photo HEIC récente d'un code-barres : le code est lu (Safari convertit l'image). Si « Ce fichier n'est pas une image lisible » s'affiche, me le dire avec le modèle d'iPhone et la version d'iOS.

