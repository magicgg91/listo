# Listo — Détails techniques (pour les développeurs)

Organisation du code, tests, API et vérifications à la main. Pour installer et faire vivre Listo : le [README](../README.md) et le [guide d'exploitation](exploitation.md). Autres documents : [cahier des charges](cahier-des-charges.md), [kit de design](../design/README.md), [CONTRIBUTING.md](../CONTRIBUTING.md).

## Sommaire

- [Organisation du code](#organisation-du-code)
- [Tester en local](#tester-en-local)
- [Essayer sur son téléphone](#essayer-sur-son-téléphone)
- [Vérifier l'interface sur le téléphone (étapes 5 à 10)](#vérifier-linterface-sur-le-téléphone-étapes-5-à-10)
- [API des comptes (étape 2)](#api-des-comptes-étape-2)
- [API d'administration (étape 3)](#api-dadministration-étape-3)
- [API des listes et des articles (étape 4)](#api-des-listes-et-des-articles-étape-4)
- [Magasin « multi » (étape 6)](#magasin--multi--étape-6)
- [Photos des articles (étape 7)](#photos-des-articles-étape-7)
- [Temps réel (étape 8)](#temps-réel-étape-8)
- [Hors ligne (étape 9)](#hors-ligne-étape-9)
- [Lien public d'une liste (étape 10)](#lien-public-dune-liste-étape-10)
- [En-têtes, arrêt propre et sauvegarde (étape 11)](#en-têtes-arrêt-propre-et-sauvegarde-étape-11)

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
| `server/events.js` | Temps réel : flux SSE `/api/events`, connexions ouvertes, messages « la liste X a changé » |
| `server/photos.js` | Photos des articles : contrôle du fichier JPEG (sans bibliothèque), retrait des métadonnées, stockage dans `data/photos`, plafond d'envois |
| `server/backup.js` | Sauvegarde nocturne de la base (VACUUM INTO, contrôle, 14 copies, droits 600) |
| `server/backup-now.js`, `server/admin-secours.js` | Commandes à lancer sur le serveur : sauvegarde à la demande ; mot de passe provisoire (et retrait de la 2FA) quand plus personne ne peut se connecter |
| `server/shares.js` | Lien public d'une liste : jeton (jamais stocké en clair), mot de passe généré, contrôle de validité à chaque requête, cookies de consultation, nettoyage |
| `server/pages/` | Les deux pages HTML du lien public : la page de la liste (sans aucune donnée) et la page unique « Lien expiré ou inexistant » |
| `public/js/history.js`, `public/js/sorting.js` | Règles partagées entre le serveur et le téléphone : nom normalisé, autocomplétion, rayon et magasin habituels, mise à jour de l'historique, tri des articles (par rayon ou par magasin) |
| `server/routes/` | Routes de l'API : `auth.js` (connexion), `me.js` (mon compte), `lists.js` (listes et articles), `photos.js` (photos), `shares.js` (lien public, côté propriétaire), `public.js` (lien public, côté visiteur sans compte), `admin.js` (administration : `admin-users.js` pour les comptes, `admin-references.js` pour catégories, magasins et rayons, `admin-names.js` pour les noms enregistrés) |
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
| `public/js/viewport.js` | Android : retire `viewport-fit=cover` avant le premier affichage, pour garder la page au-dessus de la barre de navigation (voir « Android : barre de navigation ») |
| `public/js/photo.js` | Réduction d'une photo sur le téléphone avant l'envoi (1 280 px, JPEG) |
| `public/js/public.js` | Page publique d'une liste (lien `/p/…`) : saisie du mot de passe, liste en lecture seule, photo agrandie. N'utilise ni service worker ni stockage |
| `public/js/store.js` | Copie locale des données et calculs (cartes de « Mes listes » et leur tri : plus récentes d'abord ou ordre alphabétique, choix gardé sur le téléphone sous la clé `listo-tri-listes` ; liste groupée par rayon ou par magasin, suggestions, magasins proposés) |
| `public/js/format.js` | Mise en forme des textes (dates relatives, « 3 articles restants » / « 3 éléments restants »…) |
| `public/js/words.js` | Vocabulaire : « article » dans une liste de courses, « élément » dans les autres listes. Tous les textes qui nomment une ligne de la liste passent par lui |
| `public/js/dom.js`, `public/js/ui.js`, `public/js/theme.js` | Fabrication des éléments de la page (jamais `innerHTML`), feuilles, menus, messages, thème clair/sombre/auto |
| `public/js/screens/` | Un fichier par écran : `login.js` (connexion), `lists.js` (Mes listes et colonne de gauche sur ordinateur, avec le bouton de tri), `list.js` (une liste et la feuille Article), `list-form.js` (créer ou modifier une liste), `share.js` (feuille « Partager par lien »), `settings.js` (réglages, mot de passe, 2FA), `account.js` (Mon compte : sécurité, apparence, ce téléphone), `admin.js` (administration) |
| `test/` | Tests automatisés (`npm test`) |
| `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md` | Licence Apache-2.0 (texte officiel), mentions à conserver, règles de contribution, signalement des failles |
| `docs/` | Cahier des charges, guide d'exploitation (`exploitation.md`) et ce document (`developpement.md`) |
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

Sans Docker (Node.js 22 ou plus récent) :

```sh
npm ci                    # installe express et better-sqlite3
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

## Vérifier l'interface sur le téléphone (étapes 5 à 10)

Ces points ne peuvent pas être testés automatiquement : à vérifier une fois à la main, de préférence sur le vrai sous-domaine en HTTPS.

1. **Installation sur l'écran d'accueil** : dans le navigateur du téléphone, menu « Ajouter à l'écran d'accueil » (ou « Installer l'application »). L'icône Listo apparaît ; ouverte depuis l'écran d'accueil, l'application s'affiche sans barre d'adresse.
2. **Thème** : Réglages → Mon compte → Apparence. « Clair » et « Sombre » changent l'affichage tout de suite ; « Auto » suit le réglage du téléphone. Fermer puis rouvrir Listo : le choix est conservé.
3. **Clavier du téléphone** : aucun écran ni aucune fenêtre n'ouvre le clavier de lui-même ; il ne s'ouvre que quand on touche un champ (connexion, code, édition en ligne, page publique comprises). Dans une liste, toucher le champ, taper un article puis la touche Entrée : l'article est ajouté et le clavier reste ouvert pour le suivant (après le choix du rayon d'un nouvel article, il est fermé : toucher le champ pour continuer). Le clavier ne cache pas le champ d'ajout. En touchant le champ du code à 6 chiffres, le clavier numérique s'ouvre. Le test `test/focus.test.js` refuse tout `.focus()`, `.select()` ou `autofocus` sur un champ de saisie.
4. **Pouce en bas de l'écran** : le champ d'ajout et les boutons principaux (Nouvelle liste, Enregistrer…) sont en bas, atteignables d'une main. Les cases à cocher se touchent facilement sans cocher la ligne voisine. Rien ne passe sous la barre système (Android, barre à 3 boutons ou gestes) ni sous l'indicateur d'accueil (iPhone) : le bouton « Nouvelle liste » est entièrement visible, la dernière liste de « Mes listes » et la dernière ligne de l'Administration s'affichent au-dessus quand on fait défiler jusqu'en bas. La page s'affiche sous ces barres (`viewport-fit=cover`) : tout ce qui est collé en bas ajoute `env(safe-area-inset-bottom)` (vérifié par `test/safe-area.test.js`). Sur Android, `viewport-fit=cover` est retiré (voir « Android : barre de navigation » ci-dessous) : à vérifier dans l'application installée, barre à 3 boutons et mode gestes.
5. **Bouton Retour du téléphone** : une feuille ouverte (article, choix du rayon) se ferme sans quitter la liste ; depuis une liste, Retour ramène à « Mes listes ».
6. **Réseau coupé** (mode avion) : voir la liste « Hors ligne » au point 11.
7. **Ordinateur** (fenêtre d'au moins 1024 px de large) : « Mes listes » à gauche, la liste choisie au centre.
8. **Magasin « multi »** (étape 6) : Administration → Magasins, créer un magasin « Multi » et cocher ses magasins ; créer une liste de courses avec ce magasin. Ajouter un article nouveau : son magasin est demandé ; l'ajouter une deuxième fois : il retrouve son magasin sans question. En faisant défiler, l'en-tête du magasin reste collé en haut.
9. **Photo d'un article** (étape 7, en HTTPS) : dans la feuille d'un article, « Appareil photo » ouvre l'appareil du téléphone, « Galerie » ses photos. Une photo prise en portrait reste dans le bon sens. Elle apparaît en vignette sur la ligne ; un appui l'agrandit, le bouton Retour la referme. Sur l'autre téléphone, elle apparaît toute seule (temps réel).
10. **Temps réel** (étape 8, deux téléphones sur la même liste) : un article coché sur l'un est coché sur l'autre en moins de 3 secondes, sans rien toucher. Mettre un téléphone en mode avion quelques secondes, puis le rallumer : les changements faits entre-temps arrivent tout seuls. Si les changements n'arrivent qu'au bout d'une minute environ, voir le [chapitre 3 du guide d'exploitation](exploitation.md#3-régler-nginx-proxy-manager) (réglages de Nginx Proxy Manager).
11. **Hors ligne** (étape 9, sur le vrai sous-domaine en HTTPS : le service worker ne marche pas en simple `http://` sur l'adresse du réseau local) :
    1. Ouvrir Listo une fois avec du réseau, ouvrir une liste et une photo déjà prise.
    2. **Mode avion** : ajouter 3 articles, en cocher 2, prendre 1 photo. Tout s'affiche aussitôt ; la pastille indique « Hors ligne · N en attente ». Administration et partage de la liste sont grisés avec une explication. La photo vue au point 1 s'affiche encore.
    3. **Fermer complètement Listo** (le retirer des applications ouvertes), puis le rouvrir, toujours en mode avion : l'application s'ouvre, les listes et les modifications en attente sont là.
    4. **Retour du réseau** : la pastille repasse à « À jour » en quelques secondes. Sur l'autre téléphone : les 3 articles, les 2 cochages et la photo apparaissent, sans doublon.
    5. **Mise en veille** : en mode avion, faire une modification, verrouiller le téléphone quelques minutes, couper le mode avion, déverrouiller : la modification part toute seule.
    6. **Application installée sur l'écran d'accueil** : refaire les points 2 à 4 en ouvrant Listo depuis son icône (sur iPhone, l'application installée a sa propre copie, séparée de Safari).
    7. **Déconnexion avec des modifications en attente** (en mode avion) : Réglages → Se déconnecter avertit et propose « Rester connecté ».
    8. **Modification refusée** : sur le téléphone A en mode avion, modifier un article ; sur le téléphone B, supprimer cet article. Au retour du réseau de A : message « Une modification n'a pas pu être enregistrée : … » et l'article reste supprimé.
12. **Lien public** (étape 10, sur le vrai sous-domaine en HTTPS) :
    1. Ouvrir une liste dont vous êtes propriétaire → menu ⋮ → « Partager par lien ». « 24 heures » est coché. Cocher « Protéger par mot de passe », puis « Créer le lien ». Le lien et le mot de passe s'affichent ; « Copier le lien » et « Copier » fonctionnent (coller dans un message pour vérifier). Fermer puis rouvrir la feuille : le mot de passe est masqué (points).
    2. Envoyer le lien et le mot de passe à un autre téléphone **sans compte Listo** (ou ouvrir le lien dans une fenêtre de navigation privée). La page demande le mot de passe, sans rien montrer de la liste. Un mauvais mot de passe affiche « Mot de passe incorrect » ; le bon affiche la liste avec le bandeau « Lecture seule », sans case cliquable ni champ d'ajout. Une vignette s'agrandit au toucher. « Actualiser » montre un article ajouté entre-temps.
    3. Thème : mettre le téléphone du visiteur en mode sombre : la page suit.
    4. « Nouveau mot de passe » : sur le téléphone du visiteur, « Actualiser » redemande le mot de passe ; l'ancien est refusé. « Retirer le mot de passe » : la liste s'ouvre directement.
    5. « Changer la durée » → « 1 heure » : la date d'expiration change. Une heure plus tard, le lien affiche « Lien expiré ou inexistant ». « Arrêter le partage » (avec confirmation) : même message, tout de suite.
    6. Mode avion sur le téléphone du propriétaire : la feuille affiche « Indisponible hors ligne » et ses boutons sont grisés.
    7. Dans « Mes listes », la carte d'une liste partagée par lien porte une petite icône de lien (chez le propriétaire seulement).
    8. Le lien envoyé par une messagerie (WhatsApp, Signal, SMS) n'affiche pas d'aperçu du contenu de la liste : l'aperçu montre au plus « Listo · Liste partagée ».
13. **Zone des articles cochés** : cocher un article : il quitte son rayon pour « Dans le panier · 1 » en bas (« Terminés » dans une liste de tâches) ; un rayon dont tout est coché disparaît. Replier la zone avec son en-tête, fermer et rouvrir Listo : elle est restée repliée (cette liste, cet appareil). « Tout remettre à acheter » et « Retirer du panier » demandent confirmation par une feuille ; sur l'autre téléphone, le changement arrive en quelques secondes. En mode avion, « Tout remettre à acheter » marche aussi et part au retour du réseau.

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
| `GET /api/admin/names?q=&sort=&offset=` | Noms enregistrés (historique commun des noms d'articles saisis dans les listes de courses), 50 par morceau : `key` (nom normalisé), `name`, `aisle` (rayon habituel), `uses`, `inLists` (articles présents dans les listes de courses) ; `total`. `q` cherche sans accents ni majuscules, `sort` vaut `name` ou `uses` |
| `GET /api/admin/names/impact?from=&to=` | Ce que changerait une correction : `items` et `lists` (nombres d'articles et de listes de courses), `merge` (le nouveau nom existe déjà), `unchanged` |
| `POST /api/admin/names/rename` | Corriger un nom partout : `from` (nom normalisé), `to` (nouveau nom) |
| `POST /api/admin/names/remove` | Retirer un nom des suggestions : `from`. Les listes ne changent pas |

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
- **Noms enregistrés** (`server/routes/admin-names.js`) : l'Admin voit des noms et des compteurs, jamais une liste ni ses membres.
  - Corriger : en une seule transaction, toutes les lignes d'historique de l'ancien nom (générale et par magasin) et tous les articles non supprimés des listes de courses non supprimées dont le nom normalisé est l'ancien prennent le nouveau nom, avec une nouvelle date de modification (la synchronisation le récupère). Rien d'autre ne change sur ces articles. Les éléments des autres listes (tâches…) ne sont jamais comptés ni modifiés, même au même nom. Les membres des listes touchées sont prévenus en temps réel. Journal : `admin_nom_corrige` ou `admin_nom_fusionne` (ancien, nouveau, nombre de corrections et de listes).
  - Fusion, si le nouveau nom existe déjà : les lignes du même magasin sont réunies, utilisations additionnées, rayon de la ligne la plus utilisée (à égalité, celui du nom corrigé ; si elle n'a pas de rayon, celui de l'autre).
  - Même nom une fois normalisé (« creme fraiche » → « Crème fraîche ») : seul le nom affiché change, partout. Nom identique : rien à faire.
  - Retirer : seules les lignes d'historique sont effacées (`admin_nom_retire`).
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

| Route | Rôle |
| --- | --- |
| `GET /api/lists` | Mes listes (celles dont je suis membre), la plus récemment active d'abord, avec le nombre d'articles restants et les membres |
| `GET /api/lists/:id` | Une liste et ses articles, groupés par rayon et triés |
| `PUT /api/lists/:id/members` | Changer le partage (propriétaire seulement) : `userIds`, la liste complète des invités |
| `GET /api/users` | Comptes actifs, pour choisir avec qui partager |
| `GET /api/suggestions?q=la` | Autocomplétion, dès 2 lettres. Avec `&listId=…` (une de mes listes) : vide si ce n'est pas une liste de courses |
| `GET /api/sync?since=…` | Tout ce qui a changé depuis l'instant `since` (l'heure `serverTime` donnée par la synchro précédente) ; sans `since` : tout |
| `POST /api/ops` | Lot d'opérations (1 à 100) : `{"ops": [{ "id": "<uuid>", "type": "…", … }]}` |

Les opérations de `POST /api/ops` :

| `type` | Champs | Qui |
| --- | --- | --- |
| `list.create` | `listId` (UUID), `name`, `categoryId`, `storeId` (facultatif, listes de courses seulement) | tout compte |
| `list.update` | `listId`, et au choix `name`, `categoryId`, `storeId` (`null` pour aucun) | propriétaire |
| `list.delete` | `listId` | propriétaire |
| `list.uncheckAll` | `listId` : décoche tous les articles cochés (« Tout remettre à acheter » / « Tout rouvrir »), une seule opération quel que soit leur nombre | membres |
| `list.removeChecked` | `listId` : supprime les articles cochés (« Retirer du panier » / « Retirer les terminés »). L'ancien nom `list.clearChecked` reste accepté | membres |
| `item.create` | `listId`, `itemId` (UUID), `name`, `quantity`, `note`, `aisleId` (facultatif : sinon le rayon habituel ; `null` = Sans rayon). Liste « multi » : `storeId` au lieu de `aisleId` (facultatif : sinon le magasin habituel ; `null` = Sans magasin) | membres |
| `item.update` | `itemId`, et au choix `name`, `quantity`, `note`, `aisleId` (ou `storeId` dans une liste « multi ») | membres |
| `item.check` | `itemId`, `checked` (`true` ou `false`). Le serveur pose la date du coché (`checkedAt`) au premier coché et l'efface au décoché | membres |
| `item.delete` | `itemId` | membres |
| `item.restore` | `itemId` : remet un article supprimé, avec sa photo, tant qu'il n'a pas été effacé par le nettoyage (« Annuler », étape 7) | membres |

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
  - un invité retiré perd l'accès tout de suite ;
  - un invité dont le compte est désactivé reste membre, mais ne peut plus rien faire, et retrouve l'accès s'il est réactivé.
- **Journal** : création, partage, retrait d'un invité et suppression d'une liste sont notés, avec l'identifiant de la liste, mais jamais son nom ni ses articles.

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

Chaque article peut avoir une photo (une seule), dans une liste de courses comme dans une liste de tâches. Les photos sont servies aux membres de la liste, et, pour une liste partagée par lien public, au visiteur qui présente un lien valable (jeton, mot de passe si demandé, lien non expiré), pour les seuls articles de cette liste ; métadonnées EXIF retirées (route `GET /api/public/:jeton/photos/:id`, voir « Lien public d'une liste »). Les routes ci-dessous sont celles des membres.

| Route | Rôle |
| --- | --- |
| `PUT /api/items/:id/photo` | Envoyer ou remplacer la photo : le corps de la requête est le fichier JPEG lui-même (2 Mo au plus) |
| `GET /api/items/:id/photo` | Lire la photo (`image/jpeg`) |
| `DELETE /api/items/:id/photo` | Retirer la photo |

Règles :

- **Droits** : seulement un compte connecté, membre de la liste de l'article. Les autres reçoivent la même réponse que pour un article inconnu (404). L'en-tête `Origin` est exigé pour envoyer ou retirer, comme pour toute modification.
- **Sur le téléphone** : la photo est prise ou choisie avec le sélecteur du navigateur, puis réduite avant l'envoi (1 280 px sur le grand côté, JPEG, dans le bon sens). Aucun accès continu à l'appareil photo. En ligne seulement pour l'instant : hors ligne, les boutons sont grisés (la file d'attente des photos arrive à l'étape 9).
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
| `GET /api/events` | Flux « Server-Sent Events » ouvert par le téléphone connecté. Messages : `event: list` avec `data: {"listId":"…"}` |

Règles :

- **Aucune donnée dans les messages** : seulement l'identifiant de la liste qui a changé. Le téléphone demande ensuite les changements par `GET /api/sync?since=…`, avec les contrôles d'accès habituels.
- **Destinataires** : les membres actifs de la liste, relus dans la base à chaque envoi. Un invité retiré reçoit un dernier message (son téléphone retire la liste), puis plus rien. Un compte désactivé, déconnecté ou dont les sessions sont fermées voit son flux coupé tout de suite ; une session expirée est coupée au signal de maintien suivant.
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

### Nouvelle version de Listo : rechargement des téléphones

Une application installée sur l'écran d'accueil (iPhone surtout) reste ouverte en mémoire pendant des jours : revenir dessus ne recharge que les données, jamais le code. Avant ce mécanisme, un téléphone pouvait garder l'ancienne version jusqu'à ce qu'on ferme l'application, voire jusqu'à la réinstaller : `sw.js` ne changeait pas d'une version à l'autre, donc l'ancienne copie des fichiers (`listo-app-v3`) restait, et pouvait être resservie quand le réseau était lent.

Ce qui se passe maintenant :

1. **Identifiant opaque** : au démarrage, le serveur calcule un identifiant de 16 caractères à partir du commit installé et d'une clé propre à l'installation (HMAC-SHA256, clé dérivée de `secrets/secret.key`, voir `buildId` dans `server/secrets.js`). Il change à chaque mise à jour mais ne révèle pas le commit. Il est écrit dans `sw.js` et `js/version.js` quand le serveur les envoie (ligne `BUILD = null` remplacée ; fichiers revalidés à chaque chargement), et donné par `GET /api/about` (comptes connectés). Sans commit (développement) : `null`, et rien de ce qui suit ne se déclenche.
2. **Nouveau service worker à chaque version** : `VERSION` de `sw.js` vaut `v10-<identifiant>`. Le navigateur voit un nouveau `sw.js`, l'installe (copie neuve de tous les fichiers, sans cache HTTP), puis efface l'ancienne copie : jamais de mélange d'anciens et de nouveaux fichiers.
3. **Code périmé** (`public/js/freshness.js`) : le téléphone compare l'identifiant de son code (`js/version.js`) à celui du serveur, au démarrage, au retour au premier plan, à la reconnexion du temps réel (le serveur vient souvent de redémarrer) et toutes les heures au premier plan. Hors ligne : rien, sans erreur.
4. **Rechargement au premier moment sûr** : d'abord `registration.update()` et l'attente du nouveau service worker actif (10 s au plus) ; puis, si aucune fenêtre n'est ouverte (feuille, boîte de dialogue, menu), qu'aucun champ n'a le curseur ni un texte pas encore validé, et que la file d'attente n'envoie rien (un envoi en cours est attendu jusqu'à 10 s), le message « Mise à jour de Listo… » s'affiche un instant et la page se recharge. Sinon, bandeau « Nouvelle version disponible » avec « Recharger » (en haut de l'écran, il ne cache pas la barre d'ajout), et nouvel essai au changement d'écran et au retour au premier plan.
5. **Pas de boucle** : un seul rechargement automatique par version et par onglet (repère dans `sessionStorage`). Toujours périmé après lui : bandeau et une ligne dans la console. Si `sessionStorage` est indisponible : jamais de rechargement automatique, seulement le bandeau.
6. **Rien n'est perdu** : la file d'attente des modifications et la copie des listes sont dans IndexedDB (`listo-u<numéro>`), qu'un rechargement ne touche pas ; elles sont relues au démarrage. Listo n'a pas d'autre brouillon : un texte en cours de saisie empêche justement le rechargement automatique. Vérifié par `test/freshness.test.js` (file relue intacte) et dans un vrai navigateur (modification en attente, envoi bloqué, serveur redémarré dans une autre version : page rechargée, modification toujours en attente, puis reçue par le serveur sans doublon).

La page publique (`/p/…`) n'est pas concernée : elle n'a ni service worker ni copie gardée.

**Si une nouvelle version de Listo semble cassée sur un téléphone** : fermer Listo et le rouvrir avec du réseau (il reprend alors la dernière version) ; si ça ne suffit pas, Réglages → Mon compte → « Réinitialiser les données de ce téléphone » ; en dernier recours, effacer les données du site dans les réglages du navigateur (Chrome : cadenas à gauche de l'adresse → Paramètres du site → Effacer les données ; iPhone : Réglages → Safari → Avancé → Données des sites web), puis se reconnecter.

Pour publier une version qui change la liste des fichiers de l'application, ajouter le nouveau fichier dans `APP_FILES` de `public/sw.js` et changer le début de `VERSION` (`v10`, `v11`…) ; un test automatique signale un fichier oublié. L'identifiant de la version installée, lui, change tout seul à chaque mise à jour.

## Lien public d'une liste (étape 10)

Le propriétaire d'une liste peut la montrer à quelqu'un qui n'a pas de compte, par un lien en lecture seule. C'est la seule partie de Listo ouverte sans compte : tout y est refusé par défaut.

**Côté propriétaire** (menu de la liste → « Partager par lien », avec du réseau) :

| Route | Rôle |
| --- | --- |
| `GET /api/lists/:id/share` | État du lien : `{ share: null }` ou `{ share: { url, expiresAt, protected, createdAt } }` |
| `PUT /api/lists/:id/share` | Crée le lien, ou le modifie s'il existe. Corps : `durationHours` (1 à 8760, ou `null` pour « illimitée » ; 24 par défaut à la création ; une nouvelle durée repart de maintenant), `protect: true` (mot de passe à la création), `password: "new"` (nouveau mot de passe) ou `"none"` (le retirer). Un mot de passe tout juste créé est renvoyé une seule fois (`share.password`) |
| `DELETE /api/lists/:id/share` | Arrête le lien |

Seul le propriétaire de la liste y a accès : un invité ou un autre compte reçoit 404, comme pour une liste inexistante.

**Côté visiteur** (sans compte, lecture seule) :

| Route | Rôle |
| --- | --- |
| `GET /p/:jeton` | La page (HTML sans aucune donnée de la liste) |
| `GET /api/public/:jeton` | La liste : nom, catégorie, magasin, regroupement (rayon, magasin ou aucun), groupes avec le nom du rayon ou du magasin, articles avec nom, quantité, note, état coché et adresse de la photo ; `done` : les articles cochés (mêmes champs), du plus récemment coché au plus ancien ; date d'expiration du lien. Rien d'autre (liste blanche) : aucun nom de personne ni identifiant de compte ou de liste |
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
