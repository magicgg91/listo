# Listo

Application web de listes partagées (courses, tâches…), mobile-first, gratuite, sans publicité et auto-hébergée.

État : étapes 1 (socle), 2 (comptes, sessions, double authentification) et 3 (administration) terminées côté serveur. L'interface arrive à l'étape 5.

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
| `server/routes/` | Routes de l'API : `auth.js` (connexion), `me.js` (mon compte), `admin.js` (administration : `admin-users.js` pour les comptes, `admin-references.js` pour catégories, magasins et rayons) |
| `public/` | Fichiers de l'interface (page d'attente pour l'instant) |
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
| `GET`, `POST /api/admin/stores` ; `PATCH`, `DELETE /api/admin/stores/:id` | Pareil pour les magasins (`name`, `active`) |
| `GET`, `POST /api/admin/aisles` ; `PATCH`, `DELETE /api/admin/aisles/:id` | Pareil pour les rayons (`name`, `active`) |

Règles :

- **Garde-fous des Admin** : un Admin ne peut ni se désactiver, ni se retirer le rôle Admin, ni supprimer son propre compte. Il reste toujours au moins un Admin actif. Son propre mot de passe et sa propre 2FA se changent depuis ses réglages (`/api/me/...`), où l'ancien mot de passe est demandé.
- **Fin des sessions** : désactiver un compte le déconnecte tout de suite de tous ses appareils, et il ne peut plus se connecter (même réponse qu'un mauvais mot de passe). Réinitialiser un mot de passe ferme aussi toutes ses sessions.
- **Mot de passe à changer** : un mot de passe choisi par un Admin (création du compte ou réinitialisation) doit être changé à la connexion suivante. La connexion répond `"mustChangePassword": true`. Tant que ce n'est pas fait, seuls `GET /api/me`, `POST /api/me/password` et `POST /api/logout` sont permis, et le nouveau mot de passe doit être différent.
- **Supprimer ou désactiver** : un compte, une catégorie, un magasin ou un rayon déjà utilisé ne peut pas être supprimé, seulement désactivé.
  - Un compte est utilisé s'il possède une liste, a créé un article ou est membre d'une liste.
  - Une catégorie ou un magasin est utilisé par une liste.
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

Pour repartir de zéro : `docker compose -f docker-compose.dev.yml down`, puis supprimer les dossiers `data` et `secrets`.

## Production

Sur le serveur, seul `docker-compose.yml` est nécessaire (aucun code source). L'image est construite par GitHub Actions à chaque fusion sur `main`.

```sh
docker login ghcr.io                          # une seule fois (jeton GitHub en lecture des paquets)
docker compose up -d                          # démarrer
docker logs listo                             # voir les journaux
docker compose pull && docker compose up -d   # mettre à jour
```

Avant le premier lancement : remplacer `LISTO_PUBLIC_URL` par l'adresse exacte de Listo (par exemple `https://listo.mondomaine.fr` : même protocole et même sous-domaine que dans le navigateur, sinon toutes les connexions sont refusées par la protection CSRF), et vérifier le nom du réseau Docker partagé avec Nginx Proxy Manager (`proxy` par défaut). Au premier démarrage, `docker logs listo` affiche le code de démarrage qui permet de créer le compte Admin. Le guide complet de mise en production arrive à l'étape 8.
