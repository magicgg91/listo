# Listo

Application web de listes partagées (courses, tâches…), mobile-first, gratuite, sans publicité et auto-hébergée.

État : le plan du cahier des charges compte 11 étapes. Les étapes 1 (socle), 2 (comptes, sessions, double authentification), 3 (administration), 4 (listes et articles) et 5 (interface mobile) sont livrées ; l'étape 6 (magasin « multi ») est en cours de validation. Suivent : 7 photos des articles, 8 temps réel, 9 hors ligne, 10 lien public, 11 finitions et mise en production.

- `docs/cahier-des-charges.md` : cahier des charges validé
- `design/` : kit de design (HTML/CSS natifs, maquettes, icônes) et son `README.md`
- `CLAUDE.md` : consignes pour Claude Code
- `docs/message-de-depart-claude-code.md` : message de départ fourni avec le kit de design

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
| `public/js/history.js`, `public/js/sorting.js` | Règles partagées entre le serveur et le téléphone : nom normalisé, autocomplétion, rayon et magasin habituels, mise à jour de l'historique, tri des articles (par rayon ou par magasin) |
| `server/routes/` | Routes de l'API : `auth.js` (connexion), `me.js` (mon compte), `lists.js` (listes et articles), `admin.js` (administration : `admin-users.js` pour les comptes, `admin-references.js` pour catégories, magasins et rayons) |
| `public/index.html` | Page unique de l'application (sprite d'icônes compris) |
| `public/css/listo.css`, `public/css/app.css` | Kit de design (copie de `design/listo.css`, sections 1 à 16, sans la section 17 qui ne sert qu'aux planches) et petits ajustements propres à l'application |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Installation sur l'écran d'accueil (PWA). Le service worker ne met rien en cache |
| `public/js/app.js` | Démarrage de l'interface, compte connecté, copie locale des données, choix de l'écran |
| `public/js/router.js` | Adresses `#/listes/…`, bouton Retour du téléphone, fenêtres superposées |
| `public/js/api.js` | Seul module qui parle au serveur (`/api/…`, `/api/ops` avec des identifiants UUID créés dans le téléphone) |
| `public/js/store.js` | Copie locale des données et calculs (cartes de « Mes listes », liste groupée par rayon ou par magasin, suggestions, magasins proposés) |
| `public/js/format.js` | Mise en forme des textes (dates relatives, nombre d'articles restants…) |
| `public/js/dom.js`, `public/js/ui.js`, `public/js/theme.js` | Fabrication des éléments de la page (jamais `innerHTML`), feuilles, menus, messages, thème clair/sombre/auto |
| `public/js/screens/` | Un fichier par écran : `login.js` (connexion), `lists.js` (Mes listes et colonne de gauche sur ordinateur), `list.js` (une liste et la feuille Article), `list-form.js` (créer ou modifier une liste), `settings.js` (réglages, mot de passe, 2FA), `admin.js` (administration) |
| `test/` | Tests automatisés (`npm test`) |
| `Dockerfile`, `docker-entrypoint.sh` | Construction et démarrage de l'image Docker |
| `docker-compose.yml` | Production (image publiée sur ghcr.io) |
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

## Vérifier l'interface sur le téléphone (étapes 5 et 6)

Ces points ne peuvent pas être testés automatiquement : à vérifier une fois à la main, de préférence sur le vrai sous-domaine en HTTPS.

1. **Installation sur l'écran d'accueil** : dans le navigateur du téléphone, menu « Ajouter à l'écran d'accueil » (ou « Installer l'application »). L'icône Listo apparaît ; ouverte depuis l'écran d'accueil, l'application s'affiche sans barre d'adresse.
2. **Thème** : Réglages → Apparence. « Clair » et « Sombre » changent l'affichage tout de suite ; « Auto » suit le réglage du téléphone. Fermer puis rouvrir Listo : le choix est conservé.
3. **Clavier du téléphone** : dans une liste, taper un article puis la touche Entrée du clavier : l'article est ajouté et le champ reste prêt pour le suivant. Le clavier ne cache pas le champ d'ajout. Sur l'écran du code à 6 chiffres, le clavier numérique s'ouvre.
4. **Pouce en bas de l'écran** : le champ d'ajout et les boutons principaux (Nouvelle liste, Enregistrer…) sont en bas, atteignables d'une main. Les cases à cocher se touchent facilement sans cocher la ligne voisine.
5. **Bouton Retour du téléphone** : une feuille ouverte (article, choix du rayon) se ferme sans quitter la liste ; depuis une liste, Retour ramène à « Mes listes ».
6. **Réseau coupé** (mode avion) : cocher un article affiche un message clair et la case revient à son état ; un article tapé reste dans le champ.
7. **Ordinateur** (fenêtre d'au moins 1024 px de large) : « Mes listes » à gauche, la liste choisie au centre.
8. **Magasin « multi »** (étape 6) : Administration → Magasins, créer un magasin « Multi » et cocher ses magasins ; créer une liste de courses avec ce magasin. Ajouter un article nouveau : son magasin est demandé ; l'ajouter une deuxième fois : il retrouve son magasin sans question. En faisant défiler, l'en-tête du magasin reste collé en haut.

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
| `POST /api/me/2fa/enable` | Commencer l'activation de la 2FA : renvoie le QR code et le secret |
| `GET /api/me/2fa/qr.png` | Image PNG du QR code de l'activation en cours (utilisée par l'interface, pour garder une CSP stricte sans image `data:`) |
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
#    l'application d'authentification du téléphone, compte « Listo ») et
#    « qrCode » (une image : copier tout le texte data:image/png;base64,…
#    dans la barre d'adresse du navigateur pour l'afficher et la scanner)
curl -b cookies.txt -H "$O" -X POST $U/api/me/2fa/enable

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
| `GET /api/suggestions?q=la` | Autocomplétion, dès 2 lettres |
| `GET /api/sync?since=…` | Tout ce qui a changé depuis l'instant `since` (l'heure `serverTime` donnée par la synchro précédente) ; sans `since` : tout |
| `POST /api/ops` | Lot d'opérations (1 à 100) : `{"ops": [{ "id": "<uuid>", "type": "…", … }]}` |

Les opérations de `POST /api/ops` :

| `type` | Champs | Qui |
| --- | --- | --- |
| `list.create` | `listId` (UUID), `name`, `categoryId`, `storeId` (facultatif, listes de courses seulement) | tout compte |
| `list.update` | `listId`, et au choix `name`, `categoryId`, `storeId` (`null` pour aucun) | propriétaire |
| `list.delete` | `listId` | propriétaire |
| `list.clearChecked` | `listId` (vider les barrés) | membres |
| `item.create` | `listId`, `itemId` (UUID), `name`, `quantity`, `note`, `aisleId` (facultatif : sinon le rayon habituel ; `null` = Sans rayon). Liste « multi » : `storeId` au lieu de `aisleId` (facultatif : sinon le magasin habituel ; `null` = Sans magasin) | membres |
| `item.update` | `itemId`, et au choix `name`, `quantity`, `note`, `aisleId` (ou `storeId` dans une liste « multi ») | membres |
| `item.check` | `itemId`, `checked` (`true` ou `false`) | membres |
| `item.delete` | `itemId` | membres |

Chaque opération reçoit sa propre réponse (`status` 200, ou 400, 403, 404, 409 avec `error`). Une opération renvoyée avec le même `id`, par exemple après une coupure réseau, n'est jamais appliquée deux fois : la réponse du premier envoi est redonnée, avec `"duplicate": true`.

Règles :

- **Limites** : nom de 1 à 100 caractères, quantité 30 au plus (texte libre : « 2 », « 500 g »), note 500 au plus. Les identifiants de listes et d'articles sont des UUID créés par le téléphone.
- **Dates** : les dates (création, modification, suppression) sont toujours posées par le serveur. Celles qu'enverrait le téléphone sont ignorées.
- **Suppressions logiques** : une suppression est d'abord une simple marque, pour que les autres téléphones l'apprennent. Elle est effacée pour de bon au bout de 30 jours (nettoyage au démarrage, puis toutes les heures).
- **Tri** : par rayon, dans l'ordre alphabétique français, avec « Sans rayon » en dernier. Puis par ordre alphabétique dans chaque rayon, les articles cochés en bas. Un rayon vide n'apparaît pas. Une liste qui n'est pas de courses forme un seul groupe.
- **Historique** : il est commun à tous les comptes. « Lait », « lait », « LAIT » et « Lait  » ne font qu'une entrée, qui compte ses utilisations. La suggestion garde la première écriture du nom.
  - Un article déjà connu reprend son rayon habituel. Modifier son rayon, ou le renommer, mémorise ce choix pour la fois suivante.
  - Supprimer un article ou vider les barrés n'efface pas l'historique.
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

# 7. Marie ne peut pas renommer la liste, mais elle peut vider les barrés
COOKIES=marie.txt op '"type":"list.update","listId":"'"$L"'","name":"Renommée"'
COOKIES=marie.txt op '"type":"list.clearChecked","listId":"'"$L"'"'

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
- **Tri** : par magasin, dans l'ordre alphabétique, « Sans magasin » en dernier ; puis par ordre alphabétique, les articles cochés en bas de leur magasin.
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

## Production

Sur le serveur, seul `docker-compose.yml` est nécessaire (aucun code source). L'image est construite par GitHub Actions à chaque fusion sur `main`.

```sh
docker login ghcr.io                          # une seule fois (jeton GitHub en lecture des paquets)
docker compose up -d                          # démarrer
docker logs listo                             # voir les journaux
docker compose pull && docker compose up -d   # mettre à jour
```

Avant le premier lancement : remplacer `LISTO_PUBLIC_URL` par l'adresse exacte de Listo (par exemple `https://listo.mondomaine.fr` : même protocole et même sous-domaine que dans le navigateur, sinon toutes les connexions sont refusées par la protection CSRF), et remplacer `IP_LOCALE` par l'adresse du serveur sur le réseau local (le port 13300 n'est publié que sur cette adresse ; Nginx Proxy Manager, sur une autre machine, y envoie le trafic en http). Au premier démarrage, `docker logs listo` affiche le code de démarrage qui permet de créer le compte Admin. Le guide complet de mise en production arrive à l'étape 11.
