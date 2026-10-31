# Listo

**Listo est une application web de listes partagées (courses, tâches…), pensée pour le téléphone, que l'on installe sur son propre serveur.**

Gratuite, sans publicité, en français. Pensée pour un foyer : quelques comptes, créés par l'administrateur, sans inscription publique.

## Ce que fait Listo

- **Listes partagées en direct** : un article coché sur un téléphone l'est sur l'autre en quelques secondes. Les articles cochés se rangent en bas, dans « Dans le panier » (« Terminés » dans les autres listes).
- **Un droit par personne** : le propriétaire d'une liste la partage avec d'autres comptes, chacun avec le droit « Peut modifier » (contributeur) ou « Lecture seule » (invité, le choix de départ). Un contributeur peut dupliquer la liste ; contributeurs et invités peuvent la quitter.
- **Courses classées par rayon**, ou **par magasin** pour une tournée de plusieurs boutiques (magasin « multi »), ou simplement par ordre alphabétique (chacun choisit son tri). Le rayon ou le magasin habituel de chaque article est retenu, et les noms déjà saisis sont proposés. Chacun peut créer un magasin ou un rayon qui manque.
- **Listes de tâches** : priorité et échéance facultatives, activées liste par liste, avec tri par priorité ou par échéance.
- **Lecture rapide** : une icône au choix pour chaque liste, un compteur « restants/total » (par exemple « 5/8 ») sur chaque carte et chaque groupe, des groupes qui se replient, la suppression d'une ligne en la faisant glisser.
- **Photos** des articles, réduites sur le téléphone avant l'envoi.
- **Mode scan** des listes de courses : photographier le code-barres d'un produit ; Listo le lit sur le téléphone, retrouve un produit déjà connu ou propose son nom grâce à [Open Food Facts](https://world.openfoodfacts.org). La photo reste sur le téléphone.
- **Hors ligne** : Listo s'ouvre et s'utilise sans réseau ; les modifications partent au retour du réseau.
- **Lien public en lecture seule** pour montrer une liste à quelqu'un sans compte (durée limitée, mot de passe facultatif).
- **Aide intégrée** (Réglages › Aide), **double authentification**, **sauvegarde chaque nuit**, thèmes clair et sombre, installation sur l'écran d'accueil du téléphone.

Dans une liste de courses, on parle d'« articles » ; dans les autres listes, d'« éléments ».

## Limites

- Auto-hébergé : un conteneur Docker sur votre serveur, derrière un proxy HTTPS. Il n'existe pas de version en ligne.
- Interface en français uniquement.
- Aucune publicité, aucun suivi, aucune donnée envoyée ailleurs que sur votre serveur, avec deux exceptions que l'on peut couper :
  - le serveur demande à GitHub, au plus une fois par heure, s'il existe une nouvelle version ([chapitre 9](docs/exploitation.md#savoir-quune-nouvelle-version-existe)) ;
  - en mode scan, il demande à Open Food Facts le nom d'un produit à partir de son code-barres, sans rien sur les personnes ([chapitre 13](docs/exploitation.md#13-mode-scan--open-food-facts)).

## En images

| ![Écran « Mes listes » avec quatre listes](docs/images/accueil.png) | ![Liste de courses classée par rayon, avec quantités et photos](docs/images/liste-courses.png) | ![La même liste de courses : les articles cochés, barrés, regroupés en bas dans « Dans le panier »](docs/images/liste-courses-cochee.png) |
| :---: | :---: | :---: |
| Mes listes | Courses classées par rayon | Articles cochés : « Dans le panier » |
| ![Liste de tâches avec le champ « Ajouter un élément »](docs/images/liste-taches.png) | ![Page publique d'une liste, en lecture seule, ouverte sans compte](docs/images/page-publique.png) | ![Écran Réglages avec le bloc « À propos »](docs/images/reglages.png) |
| Liste de tâches | Lien public, en lecture seule | Réglages et « À propos » |

*Instance de démonstration, avec des données inventées. Ces captures datent d'avant la carte compacte de « Mes listes », le compteur « 5/8 » et l'icône de chaque liste.*

## Installation

Prérequis :
- un serveur Linux toujours allumé, avec **Docker** et **Docker Compose** ;
- un **proxy HTTPS**, par exemple Nginx Proxy Manager (il peut être sur une autre machine) ;
- un **nom de domaine** (par exemple `listo.mondomaine.fr`) qui pointe vers ce proxy.

1. **Créer le dossier de Listo** :
   ```sh
   mkdir -p /opt/listo && cd /opt/listo
   ```
   Les dossiers `data/` (base, sauvegardes, photos, journal) et `secrets/` (clé de chiffrement) se créent au premier démarrage.
2. **Copier le [`docker-compose.yml`](docker-compose.yml) du dépôt** dans `/opt/listo` (il est commenté ligne par ligne), puis y remplacer deux valeurs :
   - `LISTO_PUBLIC_URL=https://listo.exemple.fr` : l'adresse exacte de Listo, en `https://` ;
   - `IP_LOCALE` : l'adresse du serveur sur le réseau local (par exemple `192.168.1.20:13300:13300`), jamais `0.0.0.0`.
3. **Nginx Proxy Manager** : *Proxy Host* avec votre domaine, schéma `http`, l'adresse du serveur et le port `13300`. Onglet SSL : certificat Let's Encrypt, *Force SSL*, *HSTS*. *Websockets Support* n'est pas nécessaire : le temps réel passe par une connexion HTTP ordinaire. Onglet *Advanced* :
   ```nginx
   client_max_body_size 5m;
   proxy_buffering off;
   proxy_cache off;
   proxy_read_timeout 3600s;
   ```
4. **Premier démarrage** : lancer Listo et lire le code de démarrage dans les journaux (encadré de `====`) :
   ```sh
   docker compose up -d && docker compose logs listo
   ```
   Ouvrir ensuite `https://listo.mondomaine.fr` et créer le compte Admin avec ce code.
5. **Garder la clé** : copier tout de suite le contenu de `secrets/secret.key` (`cat secrets/secret.key`) dans un gestionnaire de mots de passe. Sans elle, les doubles authentifications sont perdues après une panne.
6. **Double authentification** (conseillée pour l'Admin) : Réglages › Mon compte › Double authentification, scanner le QR code, puis garder les 10 codes de secours.
7. **Sur le téléphone** : iPhone (Safari) → Partager → *Sur l'écran d'accueil* ; Android (Chrome) → menu ⋮ → *Installer l'application*.

Le guide complet, pas à pas (pare-feu, vérifications, restauration, dépannage) : [docs/exploitation.md](docs/exploitation.md).

## Configuration

Toutes les variables sont dans `docker-compose.yml`. Aucune ne contient de mot de passe ni de clé.

| Variable | Valeur de production | Rôle |
| --- | --- | --- |
| `NODE_ENV` | `production` | Cookies « Secure », HTTPS obligatoire |
| `PORT` | `13300` | Port d'écoute dans le conteneur |
| `TZ` | `Europe/Paris` | Fuseau horaire (heure de la sauvegarde de la nuit) |
| `LISTO_PUBLIC_URL` | `https://listo.mondomaine.fr` | Adresse publique exacte, obligatoirement en `https://` |
| `LISTO_DB_PATH` | `/data/listo.db` | Base de données |
| `LISTO_KEY_PATH` | `/secrets/secret.key` | Clé de chiffrement, créée au premier démarrage |
| `LISTO_SESSION_DAYS` | `30` | Durée d'une session, en jours |
| `LISTO_UPDATE_CHECK` | *(absente)* | `off` coupe la vérification de mise à jour sur GitHub |
| `LISTO_PRODUCT_LOOKUP` | *(absente)* | `off` coupe le mode scan (bouton « Scanner » masqué, aucune demande à Open Food Facts) |
| `LISTO_PRODUCT_CONTACT` | *(absente)* | Facultative : contact (adresse e-mail ou URL) envoyé à Open Food Facts |
| `LISTO_MCP` | *(absente : désactivé)* | `on` active l'accès depuis Claude : autorisation OAuth et serveur MCP `/mcp` (lecture : `list_lists`, `read_list` ; avec une connexion « Lecture et ajout » : `add_items`, `set_checked`). **À ne pas activer en production avant l'essai réel avec Claude.** Désactivé, toutes ses adresses répondent 404. Voir le [chapitre 14](docs/exploitation.md#14-accès-depuis-claude-listo_mcp) |

`LISTO_COMMIT` est posée par l'image elle-même (version affichée dans Réglages › À propos) : ne pas la remplir. Détails : [chapitre 2](docs/exploitation.md#2-fichiers-à-créer-sur-le-serveur).

## Mise à jour et sauvegardes

- **Mise à jour** : chaque fusion sur `main` publie une nouvelle image `ghcr.io/magicgg91/listo` (workflow `.github/workflows/docker.yml`). Sur le serveur :
  ```sh
  docker exec -u node listo node server/backup-now.js   # sauvegarde juste avant
  docker compose pull && docker compose up -d
  ```
  La base est mise à jour toute seule au démarrage ; les téléphones prennent la nouvelle version d'eux-mêmes ([chapitre 9](docs/exploitation.md#9-mettre-à-jour-listo)).
- **Sauvegardes** : chaque nuit vers 3 h dans `data/backups/`, les 14 dernières gardées. Sauvegarder aussi le dossier `data/` entier (photos, journal) avec le serveur, et garder la clé `secrets/secret.key` à part. Restauration : [chapitre 8](docs/exploitation.md#8-restaurer-une-sauvegarde).
- **Version installée** : Réglages › À propos. L'Admin y voit aussi si une nouvelle version existe.
- **Journaux** : `docker compose logs -f listo` ; le journal de sécurité est aussi gardé dans `data/journal.log`.
- **Compte Admin perdu** : `docker exec -u node listo node server/admin-secours.js IDENTIFIANT` donne un mot de passe provisoire (ajouter `--retirer-2fa` si la double authentification est inutilisable).
- **Santé** : `https://listo.mondomaine.fr/healthz` répond `{"status":"ok"}`.
- **Autres problèmes** (clé perdue, écran blanc, « origine inconnue »…) : [chapitre 11](docs/exploitation.md#11-en-cas-de-problème).

## Sécurité en bref

- Le port 13300 n'est publié que sur l'adresse du réseau local du serveur ; seul le proxy HTTPS doit pouvoir le joindre. Ne jamais l'exposer directement sur Internet.
- Mots de passe hachés (scrypt), cookies `HttpOnly`, `Secure` et `SameSite`, blocage après 5 essais ratés, double authentification facultative.
- Droits vérifiés par le serveur à chaque requête ; l'Admin ne voit pas le contenu des listes des autres.
- Politique de sécurité du contenu stricte (aucun script extérieur), photos contrôlées par le serveur et débarrassées de leurs métadonnées.
- Signaler une faille, en privé : [SECURITY.md](SECURITY.md).

## Pour aller plus loin

- [docs/exploitation.md](docs/exploitation.md) : installation et exploitation en détail.
- [docs/cahier-des-charges.md](docs/cahier-des-charges.md) : fonctions, droits, modèle de données, sécurité, et l'historique des décisions.
- [docs/developpement.md](docs/developpement.md) : organisation du code, tests, API, vérifications à faire sur les téléphones.
- [design/README.md](design/README.md) : le kit de design (thèmes, composants, icônes).

## Licence et crédits

- Licence **Apache-2.0**, © magicgg91 : [LICENSE](LICENSE). En cas de réutilisation, conserver le fichier [NOTICE](NOTICE) et la mention de l'auteur.
- Contribuer : [CONTRIBUTING.md](CONTRIBUTING.md).
- Lecteur de codes-barres : [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (licences MIT et Apache-2.0, voir NOTICE). Noms des produits : Open Food Facts (licence ODbL).
- Développé avec l'aide de Claude (Anthropic).
