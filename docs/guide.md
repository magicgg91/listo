# Listo : le guide

<!-- Fichier fabriqué par scripts/guide.js à partir de public/js/help-content.js : ne pas le modifier à la main. -->

Le mode d'emploi complet de Listo, le même que la page « Aide » de l'application (Réglages › « Aide ») et que la page en ligne [https://magicgg91.github.io/listo/](https://magicgg91.github.io/listo/). Les parties marquées « Pour la personne qui gère le serveur » ne concernent que l'installation du serveur ; son entretien (restauration, mises à jour, journaux) est décrit dans le guide d'exploitation, [docs/exploitation.md](exploitation.md).

## Sommaire

<details>
<summary>1. Présentation</summary>

- [Aller au chapitre](#presentation)
- [1.1 Ce qu'est Listo](#listo)
- [1.2 Ce que Listo ne fait pas](#limites)
- [1.3 Trois types de liste](#types)
- [1.4 Le vocabulaire](#vocabulaire)

</details>

<details>
<summary>2. Les possibilités</summary>

- [Aller au chapitre](#possibilites)
- [2.1 Listes partagées en direct](#p-partage)
- [2.2 Courses : rayons et magasins](#p-courses)
- [2.3 Tâches : priorité et échéance](#p-taches)
- [2.4 Envies : réservation et cotisation](#p-envies)
- [2.5 Saisie rapide](#p-saisie)
- [2.6 Hors ligne, corbeille, lien public](#p-securite)
- [2.7 Sécurité et confort](#p-confort)

</details>

<details>
<summary>3. Installation</summary>

- [Aller au chapitre](#installation)
- [3.1 Ce qu'il faut](#prerequis)
- [3.2 Le dossier et docker-compose.yml](#dossier)
- [3.3 Les réglages (variables)](#variables)
- [3.4 Ce que doit faire le proxy](#proxy)
- [3.5 Exemple avec Nginx Proxy Manager](#npm)
- [3.6 Premier démarrage et code de démarrage](#demarrage)
- [3.7 Garder la clé secrète](#cle)
- [3.8 Sauvegardes](#sauvegardes)
- [3.9 Vérifications une fois en production](#verifications)

</details>

<details>
<summary>4. Les comptes</summary>

- [Aller au chapitre](#comptes)
- [4.1 Le premier Admin](#premier-admin)
- [4.2 Créer les autres comptes](#creer-comptes)
- [4.3 Première connexion](#premiere-connexion)
- [4.4 Installer Listo sur le téléphone](#telephone)
- [4.5 Changer de mot de passe](#mot-de-passe)
- [4.6 Double authentification et codes de secours](#double-auth)
- [4.7 Mot de passe oublié, téléphone perdu](#oubli)
- [4.8 Compte Admin perdu](#secours)

</details>

<details>
<summary>5. Au quotidien</summary>

- [Aller au chapitre](#quotidien)
- [5.1 Ajouter, modifier, cocher, supprimer](#ajouter)
- [5.2 Saisir la quantité avec le nom](#quantite)
- [5.3 Ajouter plusieurs articles d'un coup](#plusieurs)
- [5.4 Scanner un code-barres](#scan)
- [5.5 Ajouter une photo](#photo)
- [5.6 Groupes, tri et compteur](#tri)
- [5.7 Rechercher](#recherche)
- [5.8 Réserver un souhait, cotiser](#reserver)
- [5.9 Nouveautés](#nouveautes)
- [5.10 Hors ligne et synchronisation](#hors-ligne)
- [5.11 Thème clair ou sombre](#theme)

</details>

<details>
<summary>6. Rôle par rôle</summary>

- [Aller au chapitre](#roles)
- [6.1 Admin](#role-admin)
- [6.2 Propriétaire : créer une liste](#creer)
- [6.3 Propriétaire : modifier la liste](#modifier)
- [6.4 Propriétaire : partager et choisir les droits](#partager)
- [6.5 Propriétaire : liste d'envies](#envies)
- [6.6 Propriétaire : le lien public](#lien-public)
- [6.7 Propriétaire : dupliquer, supprimer, restaurer](#corbeille)
- [6.8 Contributeur (« Peut modifier »)](#role-contributeur)
- [6.9 Lecture seule](#role-lecture)
- [6.10 Visiteur du lien public](#role-visiteur)
- [6.11 Bénéficiaire d'une liste d'envies](#role-beneficiaire)

</details>

<details>
<summary>7. MCP Claude</summary>

- [Aller au chapitre](#claude)
- [7.1 À quoi ça sert](#claude-quoi)
- [7.2 Exemples de phrases](#claude-phrases)
- [7.3 Deux niveaux d'accord](#claude-niveaux)
- [7.4 Ce que Claude ne peut jamais faire](#claude-jamais)
- [7.5 Listes d'envies : aucune réservation](#claude-envies)
- [7.6 Limites](#claude-limites)
- [7.7 Connecter Claude](#claude-connecter)
- [7.8 Voir et déconnecter Claude](#claude-connexions)
- [7.9 Prudence : les textes piégés](#claude-prudence)
- [7.10 Dépannage](#faq-claude)
- [7.11 Un accès désactivé au départ](#claude-activation)
- [7.12 Activer l'accès sur le serveur](#mcp-serveur)
- [7.13 Règles et journal](#mcp-regles)
- [7.14 Premier essai](#mcp-essai)

</details>

<details>
<summary>8. Questions fréquentes et dépannage</summary>

- [Aller au chapitre](#faq)
- [8.1 Je n'ai pas de réseau](#faq-hors-ligne)
- [8.2 Une photo ne s'envoie pas](#faq-photo)
- [8.3 Un lien public ne marche plus](#faq-lien)
- [8.4 Les changements arrivent avec une minute de retard](#faq-retard)
- [8.5 Écran blanc ou application figée](#faq-blanc)
- [8.6 Je ne peux pas me connecter](#faq-connexion)
- [8.7 Double authentification : plus d'accès](#faq-double-auth)
- [8.8 La clé secrète a été perdue](#cle-perdue)
- [8.9 Savoir qu'une nouvelle version existe](#version)
- [8.10 Une faute de frappe revient dans les suggestions](#faq-suggestion)
- [8.11 Liste d'envies : un participant est parti](#faq-orphelin)

</details>


<a id="presentation"></a>

## 1. Présentation

<a id="listo"></a>

### 1.1 Ce qu'est Listo

Listo est une application de listes partagées : courses, tâches et idées de cadeaux. Elle est pensée pour une famille ou un petit groupe de proches, et s'utilise surtout depuis un téléphone.

Quand quelqu'un coche un article, les autres le voient coché en quelques secondes. Listo est gratuit, sans publicité et sans suivi.

Les comptes sont créés par l'Admin, la personne qui gère Listo : il n'y a pas d'inscription publique.

<a id="limites"></a>

### 1.2 Ce que Listo ne fait pas

- Pas de version en ligne : Listo s'installe sur votre propre serveur (un ordinateur toujours allumé, à la maison par exemple). Voir [3. Installation](#installation).
- Français seulement.
- Pas de notification : les nouveautés se voient en ouvrant Listo.
- Pas de paiement : pour un cadeau commun, Listo dit qui participe, jamais combien.
- Aucune donnée envoyée ailleurs que sur votre serveur, sauf deux demandes que l'on peut couper : la vérification d'une nouvelle version (GitHub, [8.9 Savoir qu'une nouvelle version existe](#version)) et le nom d'un produit scanné (Open Food Facts, [guide d'exploitation, dans le dépôt](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#scan-serveur)). Si vous connectez Claude, le contenu des listes autorisées lui est envoyé quand vous l'interrogez ([7. MCP Claude](#claude)).

<a id="types"></a>

### 1.3 Trois types de liste

- « Courses » : les articles sont classés par rayon (« Fruits et légumes », « Crèmerie »…), ou par magasin pour une tournée de plusieurs boutiques (magasin « Multi »). Listo retient le rayon habituel de chaque article.
- « Tâches » : des choses à faire, avec si besoin une priorité et une échéance.
- « Envies » : des idées de cadeaux pour une personne. Ses proches réservent un souhait pour ne pas offrir deux fois la même chose, sans qu'elle le sache.

Le type se choisit à la création de la liste. Une liste de courses peut devenir une liste de tâches, et inversement, sans rien perdre. Devenir une liste d'envies est définitif.

<a id="vocabulaire"></a>

### 1.4 Le vocabulaire

- Article : une ligne d'une liste de courses. Élément : une ligne d'une liste de tâches. Souhait : une ligne d'une liste d'envies. Le fonctionnement est le même.
- Propriétaire : la personne qui a créé la liste.
- Contributeur : une personne qui a le droit « Peut modifier » sur la liste.
- Lecture seule : une personne qui peut seulement lire la liste.
- Visiteur : une personne sans compte qui ouvre le lien public d'une liste.
- Bénéficiaire : la personne à qui une liste d'envies est destinée.
- Admin : le compte qui gère les comptes, les magasins et les rayons.

<a id="possibilites"></a>

## 2. Les possibilités

Ce que Listo offre aujourd'hui, par thème. Chaque point renvoie à la section qui l'explique.

<a id="p-partage"></a>

### 2.1 Listes partagées en direct

- Une liste se partage avec d'autres comptes, chacun avec son droit : « Peut modifier » ou « Lecture seule » ([6.4 Propriétaire : partager et choisir les droits](#partager)).
- Les changements arrivent sur les autres téléphones en quelques secondes. Les articles cochés se rangent en bas, barrés.
- Nouveautés : Listo signale ce que les autres ont ajouté ou modifié depuis votre dernière visite ([5.9 Nouveautés](#nouveautes)).
- Une icône au choix pour chaque liste, et un compteur des restants sur chaque carte et chaque groupe ([5.6 Groupes, tri et compteur](#tri)).

<a id="p-courses"></a>

### 2.2 Courses : rayons et magasins

- Articles classés par rayon ; Listo retient le rayon habituel de chaque article et propose les noms déjà saisis ([5.1 Ajouter, modifier, cocher, supprimer](#ajouter)).
- Magasin « Multi » : une tournée de plusieurs boutiques, où chaque article a son magasin au lieu d'un rayon ([6.2 Propriétaire : créer une liste](#creer)).
- Chacun peut créer un magasin ou un rayon qui manque ; l'Admin les gère ([6.1 Admin](#role-admin)).

<a id="p-taches"></a>

### 2.3 Tâches : priorité et échéance

- Priorité (basse, normale, élevée) et échéance, activées liste par liste ([6.3 Propriétaire : modifier la liste](#modifier)).
- Tri par priorité ou par échéance ([5.6 Groupes, tri et compteur](#tri)).

<a id="p-envies"></a>

### 2.4 Envies : réservation et cotisation

- Pour soi, pour un autre compte ou pour une personne sans compte ; lien, prix indicatif, priorité et photo ([6.5 Propriétaire : liste d'envies](#envies)).
- Les proches réservent un souhait, éventuellement à plusieurs (cotisation) ([5.8 Réserver un souhait, cotiser](#reserver)).
- La personne à qui la liste est destinée ne voit jamais les réservations ([6.11 Bénéficiaire d'une liste d'envies](#role-beneficiaire)).
- Par le lien public, un visiteur sans compte peut aussi réserver ou participer ([6.10 Visiteur du lien public](#role-visiteur)).

<a id="p-saisie"></a>

### 2.5 Saisie rapide

- Plusieurs articles d'un coup, séparés par des virgules ou des retours à la ligne ([5.3 Ajouter plusieurs articles d'un coup](#plusieurs)).
- Quantité lue dans le nom : “6 oeufs” ou “oeufs x6” ([5.2 Saisir la quantité avec le nom](#quantite)).
- Mode scan : le code-barres d'un produit, photographié, donne son nom ([5.4 Scanner un code-barres](#scan)).
- Photo d'un article ([5.5 Ajouter une photo](#photo)).

<a id="p-securite"></a>

### 2.6 Hors ligne, corbeille, lien public

- Hors ligne : Listo s'ouvre et s'utilise sans réseau ; les changements partent au retour du réseau ([5.10 Hors ligne et synchronisation](#hors-ligne)).
- Corbeille : une liste supprimée se restaure pendant 30 jours ([6.7 Propriétaire : dupliquer, supprimer, restaurer](#corbeille)).
- Lien public : montrer une liste à quelqu'un sans compte, pour une durée choisie, avec un mot de passe si besoin ([6.6 Propriétaire : le lien public](#lien-public)).

<a id="p-confort"></a>

### 2.7 Sécurité et confort

- Double authentification, avec des codes de secours ([4.6 Double authentification et codes de secours](#double-auth)).
- Sauvegarde automatique chaque nuit ([3.8 Sauvegardes](#sauvegardes)).
- Thème clair, sombre ou automatique ([5.11 Thème clair ou sombre](#theme)).
- Installation sur l'écran d'accueil du téléphone, comme une application ([4.4 Installer Listo sur le téléphone](#telephone)).
- Claude (l'assistant d'Anthropic) peut lire vos listes et, si vous le permettez, y écrire ([7. MCP Claude](#claude)).

<a id="installation"></a>

## 3. Installation

*Pour la personne qui gère le serveur.*

<a id="prerequis"></a>

### 3.1 Ce qu'il faut

- Un serveur : un ordinateur toujours allumé, sous Linux, avec Docker et Docker Compose. Repérez son adresse sur le réseau local (par exemple `192.168.1.20`) : c'est l'`IP_LOCALE` de la suite.
- Un proxy inverse HTTPS (reverse proxy), sur ce serveur ou sur une autre machine : Nginx Proxy Manager, Caddy, Traefik, nginx, Apache ou un autre, peu importe lequel. Il lui faut un sous-domaine qui pointe vers lui (par exemple `listo.exemple.fr`) et un certificat HTTPS valide pour ce nom (Let's Encrypt, par exemple). Ce qu'il doit faire : [3.4 Ce que doit faire le proxy](#proxy).
- Un gestionnaire de mots de passe, pour y garder la clé de Listo ([3.7 Garder la clé secrète](#cle)).

Listo s'utilise en HTTPS : sans HTTPS, il refuse de démarrer en production, car la connexion, le mode hors ligne et l'installation sur le téléphone en ont besoin.

<a id="dossier"></a>

### 3.2 Le dossier et docker-compose.yml

Un seul fichier suffit, aucun code source :

```sh
mkdir -p /opt/listo && cd /opt/listo
# copier ici le fichier docker-compose.yml du dépôt, puis l'ouvrir pour le modifier
```

Dans `docker-compose.yml` (commenté ligne par ligne), remplacez deux valeurs :

1. `LISTO_PUBLIC_URL=https://listo.exemple.fr` : l'adresse exacte que vous taperez dans le navigateur, sans `/` à la fin. Une adresse différente fait refuser toutes les connexions (“origine inconnue”).
2. `IP_LOCALE` : l'adresse du serveur sur le réseau local (`192.168.1.20:13300:13300`). Jamais `0.0.0.0` : le port ne doit être ouvert que sur le réseau local, et seul le proxy doit l'utiliser.

Les dossiers `data/` (base, sauvegardes, photos, journal) et `secrets/` (clé de chiffrement) se créent tout seuls au premier démarrage, à côté du fichier. Ils ne doivent jamais être copiés ailleurs que dans vos sauvegardes.

<a id="variables"></a>

### 3.3 Les réglages (variables)

Toutes les variables sont dans `docker-compose.yml`. Aucune ne contient de mot de passe ni de clé.

| Variable | Valeur de production | Rôle |
| --- | --- | --- |
| `NODE_ENV` | `production` | Mode production : cookies sécurisés, HTTPS obligatoire. |
| `PORT` | `13300` | Port d'écoute dans le conteneur (le même que dans `ports:`). |
| `TZ` | `Europe/Paris` | Fuseau horaire : heure de la sauvegarde de la nuit, dates du journal. |
| `LISTO_PUBLIC_URL` | `https://listo.exemple.fr` | Adresse publique exacte, obligatoirement en `https://` en production (sinon Listo refuse de démarrer et l'explique dans `docker logs listo`). |
| `LISTO_DB_PATH` | `/data/listo.db` | Base de données (dossier `data/`). |
| `LISTO_KEY_PATH` | `/secrets/secret.key` | Clé de chiffrement, créée au premier démarrage (dossier `secrets/`). |
| `LISTO_SESSION_DAYS` | `30` | Durée d'une session sans se reconnecter, en jours. |
| `LISTO_COMMIT` | posée par l'image | Version installée, affichée dans Réglages › « À propos ». Ne pas la remplir. |
| `LISTO_UPDATE_CHECK` | absente : activée | `off` coupe la vérification de mise à jour sur GitHub ([8.9 Savoir qu'une nouvelle version existe](#version)). |
| `LISTO_PRODUCT_LOOKUP` | absente : activé | `off` coupe le mode scan : bouton masqué, plus aucune demande vers Open Food Facts ([guide d'exploitation, dans le dépôt](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#scan-serveur)). |
| `LISTO_PRODUCT_CONTACT` | absente | Facultative : adresse e-mail ou adresse web de contact envoyée à Open Food Facts ([guide d'exploitation, dans le dépôt](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#scan-serveur)). |
| `LISTO_MCP` | absente : désactivé | `on` active l'accès depuis Claude ([7.12 Activer l'accès sur le serveur](#mcp-serveur)). Toute autre valeur : désactivé. |

<a id="proxy"></a>

### 3.4 Ce que doit faire le proxy

N'importe quel proxy inverse convient, s'il fait ce qui suit. Ces besoins viennent du code de Listo ; la façon de les régler dépend du produit (voir sa documentation, ou l'exemple avec Nginx Proxy Manager : [3.5 Exemple avec Nginx Proxy Manager](#npm)).

1. Terminer le HTTPS avec un certificat valide pour le sous-domaine, et rediriger `http://` vers `https://`. Le HTTPS est obligatoire : en production, Listo refuse de démarrer si `LISTO_PUBLIC_URL` ne commence pas par `https://`, ses cookies de connexion sont « Secure » (le navigateur ne les envoie qu'en HTTPS), et l'installation sur l'écran d'accueil comme le mode hors ligne demandent le HTTPS.
2. Transmettre tout le sous-domaine, à sa racine et sans changer les chemins, vers `http://IP_LOCALE:13300` (HTTP simple sur le réseau local). Listo ne s'installe pas dans un sous-dossier d'un autre site (une adresse en `…/listo` ne marche pas). L'adresse tapée dans le navigateur doit être exactement `LISTO_PUBLIC_URL` : chaque modification est refusée (« origine inconnue ») si l'en-tête `Origin` envoyé par le navigateur ne lui correspond pas ; le proxy ne doit donc pas réécrire cet en-tête.
3. Laisser passer le temps réel : `/api/events` est une connexion HTTP qui reste ouverte (Server-Sent Events, type `text/event-stream`), pas un WebSocket. Le proxy ne doit ni retenir ni mettre en cache ses réponses (Listo envoie l'en-tête `X-Accel-Buffering: no`, que nginx comprend), et son délai de lecture doit dépasser 25 secondes : Listo envoie un signal toutes les 25 secondes sur cette connexion. Sinon, les changements arrivent en retard ou la connexion est coupée sans cesse.
4. Accepter des envois d'au moins 2 Mo : une photo d'article fait au plus 2 Mo (Listo la refuse au-delà). Beaucoup de proxys acceptent moins par défaut (nginx : 1 Mo) ; prévoir un peu de marge, par exemple 5 Mo.
5. Donner l'adresse IP réelle des visiteurs : Listo fait confiance à un seul proxy et lit la dernière adresse de l'en-tête `X-Forwarded-For`, que le proxy doit compléter avec l'adresse de la personne. Elle sert à bloquer les essais de mots de passe répétés. Avec deux proxys l'un derrière l'autre (un service en ligne devant votre proxy, par exemple), Listo verrait l'adresse du premier, et un blocage toucherait tout le monde.
6. Transmettre sans les modifier les autres en-têtes de la requête : les cookies, `Authorization` (accès depuis Claude, [7.12 Activer l'accès sur le serveur](#mcp-serveur)) et `Sec-Fetch-Site`.
7. Ajouter l'en-tête `Strict-Transport-Security` (HSTS), si le proxy le permet : Listo ne l'envoie pas lui-même.

**Limiter l'accès au port de Listo**

Listo croit l'adresse IP que lui transmet le proxy : quelqu'un qui joindrait directement le port 13300 pourrait en inventer une et contourner le blocage des essais de mots de passe. Ce port ne doit donc être joignable que depuis la machine du proxy, par une règle de pare-feu sur le serveur ou sur le réseau (box, routeur).

- Exemple avec ufw, si le proxy est en `192.168.1.10` : `sudo ufw allow from 192.168.1.10 to any port 13300 proto tcp`. Attention : Docker ouvre les ports qu'il publie en passant à côté de ufw ; il faut un réglage propre à Docker (chaîne `DOCKER-USER`) ou un pare-feu en amont.
- Vérifier : depuis un autre ordinateur du réseau, `curl http://IP_LOCALE:13300/healthz` doit échouer ; depuis la machine du proxy, il doit répondre `{"status":"ok"}`.
- Le journal d'accès du proxy enregistre les adresses des liens publics ouverts (`/p/…`). Pour couper un lien qui aurait circulé, arrêtez-le depuis Listo.

<a id="npm"></a>

### 3.5 Exemple avec Nginx Proxy Manager

Un exemple pas à pas, avec Nginx Proxy Manager (il peut être sur une autre machine). Dans Nginx Proxy Manager, “Hosts”, “Proxy Hosts”, “Add Proxy Host” :

- Details : “Domain Names” = votre sous-domaine ; “Scheme” = `http` ; “Forward Hostname / IP” = `IP_LOCALE` ; “Forward Port” = `13300`. “Websockets Support” : inutile, laisser décoché (le temps réel passe par une connexion HTTP ordinaire).
- SSL : demander un certificat Let's Encrypt, cocher “Force SSL”, “HTTP/2 Support” et “HSTS Enabled” (c'est lui qui ajoute l'en-tête HSTS).
- Advanced (“Custom Nginx Configuration”) : coller les quatre lignes ci-dessous. Ce sont des directives nginx : avec nginx seul, elles vont dans le bloc `location` qui transmet à Listo.

```sh
client_max_body_size 5m;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
```

- `client_max_body_size 5m;` : sans elle, l'envoi des photos est refusé (nginx accepte 1 Mo par défaut ; une photo de Listo fait au plus 2 Mo).
- Les trois autres servent au temps réel : sans elles, les changements n'arrivent sur l'autre téléphone qu'au bout d'environ une minute.
- Nginx Proxy Manager complète déjà l'en-tête `X-Forwarded-For` avec l'adresse IP réelle des téléphones : rien à régler.
- Accès depuis Claude : ses adresses passent par le même hôte, sans réglage de plus. Elles doivent rester joignables depuis Internet ([7.12 Activer l'accès sur le serveur](#mcp-serveur)).
- Pare-feu : n'autoriser que l'adresse de Nginx Proxy Manager à joindre le port 13300 ([3.4 Ce que doit faire le proxy](#proxy)).

<a id="demarrage"></a>

### 3.6 Premier démarrage et code de démarrage

Sur le serveur, dans `/opt/listo` :

```sh
# télécharge l'image et démarre Listo
docker compose up -d
# affiche le code de démarrage
docker logs listo
```

1. Dans `docker logs listo`, repérez le code de démarrage, encadré de `====` (il ressemble à `ABCD-EFGH-JKLM`). Ne le communiquez à personne.
2. Ouvrez `https://listo.exemple.fr` : l'écran « Bienvenue sur Listo » propose de créer le compte Admin ([4.1 Le premier Admin](#premier-admin)).
3. Ce code ne sert qu'une fois : l'écran disparaît dès qu'un compte existe.

<a id="cle"></a>

### 3.7 Garder la clé secrète

Tout de suite après le premier démarrage, affichez la clé et copiez-la dans votre gestionnaire de mots de passe (une ligne de texte) :

```sh
cat /opt/listo/secrets/secret.key
```

Sans elle, après une panne du serveur ou une restauration sur une autre machine, les doubles authentifications ne se lisent plus : chacun doit les refaire ([8.8 La clé secrète a été perdue](#cle-perdue)). Les listes, les photos et les mots de passe, eux, ne dépendent pas d'elle. Elle n'est jamais copiée dans les sauvegardes de la nuit, volontairement : gardez-la à part, une fois pour toutes.

<a id="sauvegardes"></a>

### 3.8 Sauvegardes

- Chaque nuit vers 3 h (heure de `TZ`), Listo copie sa base dans `data/backups/` (`listo-AAAA-MM-JJ-HHMM.db`), vérifie que la copie est intacte et garde les 14 dernières. Chaque copie, réussie ou ratée, est notée dans le journal (`sauvegarde_reussie` ou `sauvegarde_ratee`). Une copie ratée n'arrête pas Listo.
- Sauvegarde à la demande, avant une mise à jour par exemple (`-u node` est important : la copie doit appartenir à Listo, comme celles de la nuit) :

```sh
docker exec -u node listo node server/backup-now.js
```

La copie de la nuit ne contient ni les photos (`data/photos/`), ni le journal (`data/journal.log`), ni la clé `secrets/secret.key` (volontairement : une copie de la base seule ne permet pas de lire les secrets de double authentification). Sauvegardez donc le dossier `/opt/listo/data` entier avec la sauvegarde habituelle du serveur, et gardez la clé à part ([3.7 Garder la clé secrète](#cle)). Restaurer une sauvegarde : [guide d'exploitation, dans le dépôt](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#restauration).

<a id="verifications"></a>

### 3.9 Vérifications une fois en production

1. HTTPS : `https://listo.exemple.fr` s'ouvre avec le cadenas ; `http://listo.exemple.fr` redirige vers `https://`.
2. Santé : `https://listo.exemple.fr/healthz` répond `{"status":"ok"}`.
3. En-têtes de sécurité : passez l'adresse dans un outil comme [securityheaders.com](https://securityheaders.com). On doit y voir `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-Robots-Tag` (envoyés par Listo) et `Strict-Transport-Security` (ajouté par le proxy, voir [3.4 Ce que doit faire le proxy](#proxy)), et aucun `X-Powered-By`.
4. Une sauvegarde : le lendemain matin, `ls -l /opt/listo/data/backups` montre une copie de la nuit, et `docker logs listo | grep sauvegarde` la ligne `sauvegarde_reussie`.
5. Une restauration d'essai, une fois, avec la copie de la nuit : [guide d'exploitation, dans le dépôt](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#restauration).
6. Le port fermé : voir [3.4 Ce que doit faire le proxy](#proxy).
7. Le téléphone : installation sur l'écran d'accueil ([4.4 Installer Listo sur le téléphone](#telephone)), puis la liste “Vérifier sur les téléphones” de [docs/developpement.md](https://github.com/magicgg91/listo/blob/main/docs/developpement.md#vérifier-sur-les-téléphones).

<a id="comptes"></a>

## 4. Les comptes

<a id="premier-admin"></a>

### 4.1 Le premier Admin

À la toute première ouverture, l'écran « Bienvenue sur Listo » demande :

- « Identifiant » : 2 à 50 caractères (lettres sans accent, chiffres, . \_ -) ;
- « Mot de passe » : au moins 10 caractères, puis « Confirmation du mot de passe » ;
- « Code de démarrage » : celui affiché dans les journaux du serveur ([3.6 Premier démarrage et code de démarrage](#demarrage)).

Puis « Créer le compte Admin ». Ce compte crée ensuite tous les autres.

<a id="creer-comptes"></a>

### 4.2 Créer les autres comptes

L'Admin : Réglages, « Administration », onglet « Comptes », « Ajouter un compte ».

- « Identifiant » : ce que la personne tapera pour se connecter ;
- « Nom affiché (facultatif) » : le prénom montré aux autres (“Ajouté par Marie”) ;
- « Mot de passe provisoire » : à transmettre à la personne ; elle le remplacera à sa première connexion ;
- « Rôle » : « Utilisateur » ou « Admin ».

<a id="premiere-connexion"></a>

### 4.3 Première connexion

1. Ouvrez l'adresse de Listo (par exemple `https://listo.exemple.fr`).
2. Saisissez votre « Identifiant » et votre « Mot de passe », puis « Se connecter ».
3. Avec un mot de passe provisoire, l'écran « Nouveau mot de passe » demande d'en choisir un nouveau (au moins 10 caractères), puis « Enregistrer ».
4. Vous restez connecté 30 jours sur ce téléphone (réglable par la personne qui gère le serveur).

<a id="telephone"></a>

### 4.4 Installer Listo sur le téléphone

Ouvrez l'adresse de Listo et connectez-vous, puis :

- iPhone (Safari) : bouton “Partager” (carré avec une flèche), “Sur l'écran d'accueil”, puis “Ajouter”.
- Android (Chrome) : menu ⋮, “Installer l'application” (ou “Ajouter à l'écran d'accueil”).

L'icône Listo apparaît. Ouverte depuis l'écran d'accueil, Listo s'affiche en plein écran et marche aussi sans réseau. Sur iPhone, l'application installée a sa propre connexion, séparée de Safari : il faut s'y connecter une fois.

<a id="mot-de-passe"></a>

### 4.5 Changer de mot de passe

Réglages, « Mon compte », « Mot de passe » : « Mot de passe actuel », « Nouveau mot de passe » (au moins 10 caractères), « Confirmation », puis « Enregistrer ». Vos autres appareils sont alors déconnectés, ainsi que vos connexions Claude ([7.8 Voir et déconnecter Claude](#claude-connexions)).

<a id="double-auth"></a>

### 4.6 Double authentification et codes de secours

Conseillée pour l'Admin. Il faut une application d'authentification sur le téléphone (Aegis, Google Authenticator, Microsoft Authenticator…).

1. Réglages, « Mon compte », « Double authentification ».
2. « Étape 1 sur 2 » : scannez le QR code avec l'application (ou recopiez la clé affichée sous « Ou saisissez cette clé »), saisissez le « Code à 6 chiffres » qu'elle montre, puis « Vérifier et activer ».
3. « Étape 2 sur 2 » : Listo affiche 10 « Codes de secours », une seule fois. « Copier les codes », gardez-les dans un gestionnaire de mots de passe, puis « J'ai conservé mes codes ».

Ensuite, chaque connexion demande le mot de passe, puis le code (« Vérification en deux étapes »). Sans le téléphone, « Utiliser un code de secours » : chaque code ne fonctionne qu'une fois.

Pour la retirer : même écran, « Mot de passe » et « Code » (de l'application, ou un code de secours), puis « Désactiver la double authentification ».

<a id="oubli"></a>

### 4.7 Mot de passe oublié, téléphone perdu

- Mot de passe oublié : demandez à l'Admin. Dans « Administration », « Comptes », bouton ⋮ de votre compte, « Réinitialiser le mot de passe » : il vous donne un mot de passe provisoire, à changer à la connexion suivante. Il n'y a pas d'envoi par e-mail.
- Téléphone de double authentification perdu, et plus de codes de secours : l'Admin choisit « Désactiver la double authentification » sur votre compte ; vous pourrez la réactiver ensuite.
- Trop d'essais : 5 mauvais mots de passe bloquent la connexion pendant 15 minutes.
- L'Admin a lui-même perdu son mot de passe : voir [4.8 Compte Admin perdu](#secours).

<a id="secours"></a>

### 4.8 Compte Admin perdu

*Pour la personne qui gère le serveur.*

S'il y a un autre Admin, il utilise « Réinitialiser le mot de passe » ([6.1 Admin](#role-admin)). Sinon, sur le serveur (remplacer `identifiant` par celui du compte) :

```sh
docker exec -u node listo node server/admin-secours.js identifiant
```

Un mot de passe provisoire s'affiche une fois : se connecter avec, puis en choisir un nouveau. Si la double authentification est aussi inutilisable, ajouter `--retirer-2fa` à la fin de la commande. Les connexions Claude du compte sont coupées ([7.8 Voir et déconnecter Claude](#claude-connexions)). Ce que l'Admin peut faire et ne peut pas faire : [6.1 Admin](#role-admin).

<a id="quotidien"></a>

## 5. Au quotidien

Les gestes de tous les jours, pour toute personne qui peut modifier la liste (propriétaire ou « Peut modifier »). En « Lecture seule », on peut lire, trier et rechercher.

<a id="ajouter"></a>

### 5.1 Ajouter, modifier, cocher, supprimer

- Ajouter : tapez le nom dans le champ en bas de la liste, puis touchez « + ». Des suggestions s'affichent pendant la saisie. Dans une liste de courses, pour un nouvel article, Listo demande son rayon, puis s'en souvient.
- Après l'ajout, le clavier se replie. Si la liste est réglée sur « Ouvrir la fiche », la fiche de ce qui vient d'être ajouté s'ouvre (sans clavier) : réglez quantité, note, priorité ou échéance, puis la disquette ; la croix la referme sans rien changer, la ligne reste ajoutée.
- Modifier : touchez la ligne. La fiche s'ouvre ; la disquette enregistre.
- Cocher : touchez la case. Un article coché est barré et passe dans « Dans le panier » (« Terminés » dans une liste de tâches), en bas de la liste.
- Supprimer : faites glisser la ligne vers la gauche, puis touchez « Supprimer ». « Annuler » remet la ligne pendant quelques secondes.
- Tout d'un coup, en bas de la liste, après confirmation : « Tout remettre à acheter » décoche les articles du panier, « Retirer du panier » les supprime pour tout le monde. Dans une liste de tâches : « Tout rouvrir » et « Retirer les terminés » ; dans une liste d'envies : « Tout rouvrir » et « Retirer les reçus ».

<a id="quantite"></a>

### 5.2 Saisir la quantité avec le nom

Dans une liste de courses (seulement), écrivez la quantité au début du nom, ou à la fin avec un x : Listo la range dans le champ « Quantité ».

- 6 oeufs : oeufs, quantité 6.
- 2 kg de pommes, ou 2 kg pommes : pommes, quantité 2 kg. Pareil avec 500 g farine, 1,5 L lait, 3 sachets de levure ou 4 paquets de riz.
- oeufs x6 : oeufs, quantité 6.
- Dans le doute, tout reste le nom : 7up, tarte 6 parts, 2 en 1 shampoing. Pour qu'un nombre ne soit jamais lu, écrivez-le après le nom (shampoing 2 en 1).
- Ça marche aussi avec plusieurs articles d'un coup (6 oeufs, 2 kg pommes ; lait). Si Listo s'est trompé, corrigez dans la fiche de l'article.
- Dans une liste de tâches, le nombre fait partie du nom (3 appels à passer) : rien n'est lu ; la quantité se règle dans la fiche. Pas de quantité dans une liste d'envies.

<a id="plusieurs"></a>

### 5.3 Ajouter plusieurs articles d'un coup

Dans une liste de courses ou de tâches, séparez les noms par des virgules, des points-virgules ou des retours à la ligne, puis touchez « + » : par exemple, lait, pain ; 6 oeufs ajoute trois lignes. Vous pouvez aussi coller une liste copiée depuis vos notes.

- Une virgule entre deux chiffres ne sépare rien : 1,5 L de lait reste une seule ligne.
- 20 lignes au plus à la fois. Au-delà, ou si un nom est trop long, rien n'est ajouté et un message le dit.
- Dans une liste de courses, Listo demande le rayon de chaque nouvel article, l'un après l'autre. Si vous fermez une de ces fenêtres, rien n'est ajouté et le texte reste dans le champ.
- Avec plusieurs lignes, la liste reste affichée, même réglée sur « Ouvrir la fiche ». Cela marche aussi sans réseau.
- Dans une liste d'envies, le texte n'est jamais découpé : un souhait à la fois.

<a id="scan"></a>

### 5.4 Scanner un code-barres

Dans une liste de courses, le bouton code-barres à côté du champ d'ajout (« Scanner un produit ») ouvre l'appareil photo ou la photothèque du téléphone. Photographiez le code-barres d'un produit : Listo le lit sur le téléphone (la photo n'est jamais envoyée).

- Un article de la liste porte déjà ce code : Listo propose de le cocher.
- Un article d'une autre de vos listes le porte : Listo reprend son nom (« Produit connu »).
- Sinon, Listo cherche le nom du produit dans Open Food Facts ; vous pouvez le corriger, puis « Ajouter à la liste ».
- Ce bouton n'existe que si le mode scan est activé sur votre serveur (réglage `LISTO_PRODUCT_LOOKUP`, [3.3 Les réglages (variables)](#variables)).

<a id="photo"></a>

### 5.5 Ajouter une photo

Dans la fiche d'un article, « Ajouter une photo » prend une photo ou en choisit une. Elle est réduite sur le téléphone avant l'envoi, et ses informations cachées (lieu, appareil) sont retirées par le serveur. La photo est facultative ; seuls les membres de la liste la voient (et les visiteurs d'un lien public valable).

<a id="tri"></a>

### 5.6 Groupes, tri et compteur

- Touchez l'en-tête d'un rayon (ou d'un magasin, ou d'une priorité) pour le replier ou le déplier. « Tout replier » agit sur tous les groupes.
- « Mes listes » se trie par date ou par ordre alphabétique (bouton en haut).
- Dans une liste de courses, « Trier la liste » propose « Par rayon » (« Par magasin » pour un magasin « Multi ») ou « Ordre alphabétique » : les articles sont alors à plat, sous « À acheter ». Le rayon de chaque article est gardé.
- Dans une liste de tâches, « Trier la liste » propose « Ordre alphabétique », « Par priorité » et « Par échéance », selon les options de la liste.
- Le tri choisi ne vaut que pour vous, sur ce téléphone : il ne change rien pour les autres, et il est permis en lecture seule.
- « X/Y » donne le nombre d'articles restants sur le total, sur chaque carte et en tête de chaque groupe.

<a id="recherche"></a>

### 5.7 Rechercher

- Dans une liste, tirez la liste vers le bas (ou remontez tout en haut) : le champ « Rechercher dans la liste » apparaît au-dessus du premier groupe. Il cherche dans le nom des articles, pas dans les notes.
- Sur « Mes listes », de la même façon, le champ « Rechercher une liste » cherche dans le titre des listes, celles partagées avec vous comprises.
- Majuscules et accents ne comptent pas : “eclair” trouve “Éclair”. Le texte trouvé est surligné, et le nombre de résultats s'affiche.
- Les articles cochés trouvés restent visibles, barrés, dans « Dans le panier ». Vous pouvez cocher, ouvrir ou supprimer un article depuis les résultats.
- La touche “rechercher” du clavier ferme le clavier et garde la recherche ; la croix ou « Effacer la recherche » la vide. Changer de liste ou quitter l'écran la vide aussi.
- La recherche ne change rien à la liste ni pour les autres. Elle marche hors ligne, et aussi en lecture seule.

<a id="reserver"></a>

### 5.8 Réserver un souhait, cotiser

Dans une liste d'envies, tout membre peut réserver un souhait, même en « Lecture seule », sauf la personne à qui la liste est destinée. Il faut du réseau.

- Touchez le souhait, puis « Réserver ». La ligne indique alors qui a réservé.
- En réservant, activez « Ouvert à d'autres » pour que d'autres puissent se joindre à un cadeau commun ; sinon, personne d'autre ne peut le réserver.
- Sur un souhait ouvert, « Participer » vous ajoute. « Quitter » vous retire ; quand le dernier participant s'en va, le souhait est de nouveau libre.
- Chaque participant peut ouvrir ou fermer la réservation avec « Ouvert à d'autres ».
- Listo dit seulement qui participe : ni montant, ni part, ni paiement.
- Modifier un souhait réservé ne retire pas la réservation.

<a id="nouveautes"></a>

### 5.9 Nouveautés

- Dans une liste partagée, Listo signale ce que les autres ont ajouté ou modifié depuis votre dernière visite. Vos propres actions et les suppressions ne sont jamais signalées.
- Sur « Mes listes », une pastille sur l'icône de la carte donne le nombre de nouveautés (“30+” après plus d'un mois d'absence).
- Dans la liste, chaque nouveauté est surlignée, avec qui l'a faite (“Ajouté par Marie”). Elle le reste pendant la visite, jusqu'à ce que vous touchiez la ligne ; en quittant la liste, tout est considéré comme vu, sur tous vos appareils.
- Menu ⋮ de la liste : « Ne plus me signaler cette liste », puis « Signaler cette liste » pour revenir. Chacun choisit pour lui, lecture seule comprise.
- « Mon compte », section « Nouveautés » : désactive tout signalement ; « Signaler les éléments cochés » (visible seulement quand « Nouveautés » est activé) ajoute ce que les autres cochent ou décochent.
- Il n'y a pas de notification. Sur certains téléphones, l'icône de l'application installée montre aussi leur total.

<a id="hors-ligne"></a>

### 5.10 Hors ligne et synchronisation

Sans réseau, vous pouvez continuer à ajouter, modifier et cocher. Les changements sont envoyés au retour du réseau.

La pastille en haut indique l'état : « À jour », « Synchronisation… » ou « Hors ligne », avec le nombre de changements en attente. Touchez-la pour synchroniser.

Le partage, le lien public, la duplication, « Quitter la liste », la corbeille, les réservations, la création d'un magasin ou d'un rayon et l'Administration demandent une connexion.

<a id="theme"></a>

### 5.11 Thème clair ou sombre

Réglages, « Mon compte », section « Apparence » : « Clair », « Sombre » ou « Auto » (comme le téléphone). Le choix vaut pour ce téléphone.

<a id="roles"></a>

## 6. Rôle par rôle

Sur chaque liste, chacun a un rôle : propriétaire, contributeur (« Peut modifier »), lecture seule, ou visiteur du lien public. L'Admin, lui, gère les comptes. Le tableau ci-dessous résume qui peut quoi ; les sections qui suivent le détaillent.

| Action | Propriétaire | Contributeur | Lecture seule | Visiteur | Admin |
| --- | --- | --- | --- | --- | --- |
| Voir la liste et ses articles | Oui | Oui | Oui | Oui | Non |
| Cocher, ajouter, modifier ou supprimer des articles, ajouter une photo | Oui | Oui | Non | Non | Non |
| Créer un magasin ou un rayon manquant | Oui | Oui | Non | Non | Oui |
| Dupliquer la liste | Oui | Oui | Non | Non | Non |
| Réserver un souhait ou participer à un cadeau (liste d'envies), sauf la personne à qui la liste est destinée | Oui | Oui | Oui | Oui | Non |
| Modifier la liste (titre, type, magasin, icône, options) | Oui | Non | Non | Non | Non |
| Partager la liste et choisir le droit de chaque personne | Oui | Non | Non | Non | Non |
| Créer un lien public | Oui | Non | Non | Non | Non |
| Supprimer la liste, la restaurer depuis la corbeille (30 jours) | Oui | Non | Non | Non | Non |
| Quitter la liste | Non | Oui | Oui | Non | Non |
| Gérer les comptes, les magasins, les rayons et les articles | Non | Non | Non | Non | Oui |

Contributeur : un compte avec le droit « Peut modifier » sur la liste. Lecture seule : un compte avec le droit « Lecture seule ». Visiteur : une personne sans compte qui ouvre le lien public (elle ne fait que lire, sauf réserver ou participer sur une liste d'envies). Admin : ce que l'Admin peut faire sur les listes des autres ; pour ses propres listes, il est propriétaire comme tout le monde. Dans une liste d'envies, la personne à qui la liste est destinée ne voit jamais les réservations, même si elle en est la propriétaire.

<a id="role-admin"></a>

### 6.1 Admin

Réglages, « Administration » (visible seulement pour un Admin).

**Onglet « Comptes »**

- « Ajouter un compte » ([4.2 Créer les autres comptes](#creer-comptes)).
- Bouton ⋮ d'un compte : « Réinitialiser le mot de passe », « Désactiver la double authentification », « Désactiver le compte » ou « Réactiver le compte », « Supprimer le compte » s'il n'a jamais servi.
- Rôle : « Utilisateur » ou « Admin ». Il reste toujours au moins un Admin actif.

**Onglet « Courses »**

- « Magasins » : ajouter un magasin « Simple » ou « Multi » (qui regroupe d'autres magasins), renommer, désactiver, supprimer s'il n'a jamais été utilisé.
- « Rayons » : ajouter, renommer, désactiver, supprimer s'il n'a jamais été utilisé.
- « Articles » : la mémoire des noms saisis dans les listes de courses. « Corriger » change un nom partout, « Modifier le rayon » change le rayon habituel, « Retirer » l'enlève des suggestions.

**Peut / ne peut pas**

- Peut : gérer les comptes, les magasins, les rayons et les articles ; voir s'il existe une nouvelle version (Réglages › « À propos »).
- Ne peut pas : voir le contenu, le nom ou les membres des listes des autres. Un Admin voit une liste seulement si elle est partagée avec lui, avec le droit choisi par son propriétaire.
- Connexions Claude des autres comptes : voir [7.8 Voir et déconnecter Claude](#claude-connexions).
- Savoir qu'une nouvelle version existe : [8.9 Savoir qu'une nouvelle version existe](#version).

<a id="creer"></a>

### 6.2 Propriétaire : créer une liste

Sur « Mes listes », touchez « Nouvelle liste ». Donnez un titre, choisissez le type de liste (« Courses », « Tâches » ou « Envies ») et une icône.

- Liste de courses : choisissez aussi le magasin. Les articles sont classés par rayon, ou par magasin pour un magasin « Multi ».
- Liste de tâches : « Options des éléments » active la priorité et l'échéance.
- « Après l'ajout » (toutes les listes) : « Rester sur la liste » pour enchaîner les ajouts, ou « Ouvrir la fiche » pour compléter aussitôt ce qui vient d'être ajouté. Au départ : « Rester sur la liste » pour une liste de courses, « Ouvrir la fiche » pour les autres.
- Si le magasin ou le rayon manque, « Nouveau magasin… » ou « Nouveau rayon… » le crée (connexion nécessaire).

<a id="modifier"></a>

### 6.3 Propriétaire : modifier la liste

Menu ⋮ de la liste, « Modifier la liste » : le titre, le type, le magasin, l'icône. Pour une liste de tâches, « Options des éléments » active ou non la priorité et l'échéance ; pour une liste d'envies, « Priorité ». « Après l'ajout » choisit entre « Rester sur la liste » et « Ouvrir la fiche ». Seul le propriétaire modifie la liste.

- Changer le type n'efface rien. Une liste de courses devenue liste de tâches cache ses rayons, son magasin et ses codes-barres ; une liste de tâches devenue liste de courses cache la priorité et l'échéance. Tout revient si la liste reprend son type d'origine. Le formulaire le rappelle avant l'enregistrement.
- La priorité (basse, normale, élevée) est désactivée au départ, pour une liste de tâches comme pour une liste d'envies. Tout le monde la voit. L'échéance n'existe que pour les listes de tâches.
- Devenir une liste d'envies, en revanche, est définitif ([6.5 Propriétaire : liste d'envies](#envies)).

<a id="partager"></a>

### 6.4 Propriétaire : partager et choisir les droits

« Modifier la liste », ligne « Partager avec » : une fenêtre s'ouvre avec une ligne par personne. Cochez une personne, puis choisissez son droit au bout de sa ligne. « OK » ferme la fenêtre ; le partage est enregistré avec « Enregistrer ».

- « Modifier » (droit « Peut modifier ») : la personne est contributeur ([6.8 Contributeur (« Peut modifier »)](#role-contributeur)).
- « Lire » (droit « Lecture seule ») : la personne peut seulement lire ([6.9 Lecture seule](#role-lecture)). C'est le choix de départ.
- Vous pouvez changer le droit ou retirer une personne à tout moment.

<a id="envies"></a>

### 6.5 Propriétaire : liste d'envies

Une liste d'envies rassemble des idées de cadeaux pour une personne, le bénéficiaire. Ses proches peuvent réserver un souhait ([5.8 Réserver un souhait, cotiser](#reserver)). La surprise est préservée : le bénéficiaire ne voit jamais qu'un souhait est réservé, ni par qui, ni combien de personnes participent, même si c'est lui qui a créé la liste ([6.11 Bénéficiaire d'une liste d'envies](#role-beneficiaire)).

- « Pour qui ? » se choisit à la création : « Moi », un autre compte, ou « Une personne sans compte » (un enfant, par exemple). Il ne change plus ensuite, et la liste ne change plus de type.
- Une liste de courses ou de tâches peut devenir une liste d'envies : dans « Modifier la liste », choisissez « Envies », puis « Pour qui ? ». C'est définitif, il faut du réseau, et rien n'est effacé : les quantités et échéances sont gardées sans être affichées, les éléments cochés deviennent « Reçus », et un lien public en cours est arrêté.
- Si la liste est pour un autre compte, cette personne en fait partie d'office, avec « Peut modifier » : elle ajoute ses souhaits elle-même.
- Un souhait a un nom, et si l'on veut un lien (« Ouvrir le lien »), un « Prix indicatif » en euros, une note et une photo.
- Cocher un souhait le range dans « Reçus » : seuls le bénéficiaire et le propriétaire le peuvent ; les réservations n'y sont plus affichées.
- Quand la liste est pour quelqu'un d'autre, son propriétaire voit qui participe et peut « Retirer » un participant ou « Libérer » le souhait (par exemple si quelqu'un a quitté la liste). Sur une liste « pour moi », personne ne peut retirer un participant parti ([8.11 Liste d'envies : un participant est parti](#faq-orphelin)).
- Une liste d'envies n'a pas de copie (« Dupliquer la liste » n'est pas proposé).

<a id="lien-public"></a>

### 6.6 Propriétaire : le lien public

« Partager par lien » (menu ⋮) crée une adresse que vous envoyez à une personne sans compte. Elle voit la liste en lecture seule ([6.10 Visiteur du lien public](#role-visiteur)).

- Durée : 1 heure, 24 heures, 7 jours, 30 jours, « Personnalisée » ou « Illimitée ». « Changer la durée » la modifie.
- « Protéger par mot de passe » : le mot de passe n'est affiché qu'une fois. Notez-le.
- « Arrêter le partage » rend le lien inutilisable tout de suite.
- Liste d'envies : le visiteur peut aussi réserver un souhait ou participer à un cadeau. Une réservation faite par le lien apparaît avec le prénom donné, suivi de “(lien public)” ; le propriétaire peut la retirer, comme celle d'un proche.

> **Attention** : Ne donnez pas le lien d'une liste d'envies à son bénéficiaire : s'il l'ouvre sans être connecté à Listo, il verra quels souhaits sont réservés (jamais par qui). Connecté, il ne voit rien des réservations.

<a id="corbeille"></a>

### 6.7 Propriétaire : dupliquer, supprimer, restaurer

- « Dupliquer la liste » crée une copie à votre nom, avec ou sans ses articles (tous décochés). La copie est privée : ni les personnes avec qui la liste est partagée, ni le lien public, ni les photos ne sont copiés.
- « Supprimer la liste » (menu ⋮) demande une confirmation, qui rappelle ce que contient la liste et avec qui elle est partagée. La liste disparaît alors pour tout le monde, et son lien public s'arrête.
- Une liste supprimée reste 30 jours dans votre « Corbeille des listes » (Réglages), puis elle est effacée pour de bon. Seul son propriétaire l'y voit ; chaque ligne indique dans combien de jours elle sera effacée.
- « Restaurer » la remet telle qu'elle était, pour toutes les personnes avec qui elle était partagée : éléments, droits de chacun, réglages, photos, réservations. Il faut du réseau. Son lien public ne revient pas : recréez-le si besoin.
- Le propriétaire ne quitte pas sa liste : il la supprime, ou la laisse.

<a id="role-contributeur"></a>

### 6.8 Contributeur (« Peut modifier »)

- Peut : cocher, ajouter, modifier et supprimer des articles et leur photo ([5. Au quotidien](#quotidien)) ; créer un magasin ou un rayon manquant ; « Dupliquer la liste » (la copie lui appartient) ; réserver sur une liste d'envies (sauf s'il en est le bénéficiaire).
- Ne peut pas : changer le titre, le type ou les options, partager, créer un lien public, supprimer la liste.

Quitter : menu ⋮, « Quitter la liste ». La liste disparaît de vos listes ; vos articles y restent. Le propriétaire pourra de nouveau la partager avec vous. Il faut du réseau.

<a id="role-lecture"></a>

### 6.9 Lecture seule

La carte de la liste et le haut de la liste portent la mention « Lecture seule ».

- Peut : lire la liste, ses articles et leurs photos (toucher une ligne ouvre son détail) ; trier et rechercher ; réserver un souhait d'une liste d'envies ; « Quitter la liste ».
- Ne peut pas : ajouter, cocher, modifier ou supprimer quoi que ce soit.

<a id="role-visiteur"></a>

### 6.10 Visiteur du lien public

Une personne sans compte ouvre le lien qu'on lui a envoyé, sans rien installer.

- Peut : lire la liste ; toucher un article pour ouvrir sa fiche (quantité, note en entier, rayon ou magasin, état coché, code-barres, photo à agrandir, priorité et échéance si elles sont activées).
- Liste d'envies : voir les souhaits (nom, note, lien, prix, priorité, photo) et ceux déjà reçus ; « Réserver » un souhait libre, « Participer » à un cadeau ouvert à d'autres, annuler sa participation. Son prénom lui est demandé une fois. Il voit seulement si un souhait est réservé, jamais par qui ni combien.
- Ne peut pas : modifier la liste, voir qui d'autre a réservé.
- Le lien peut demander un mot de passe, et il cesse de fonctionner à son expiration ou quand le propriétaire arrête le partage ([8.3 Un lien public ne marche plus](#faq-lien)).

<a id="role-beneficiaire"></a>

### 6.11 Bénéficiaire d'une liste d'envies

La personne à qui la liste d'envies est destinée ajoute ses souhaits (si elle a un compte) et les marque « Reçus ».

- Ne voit jamais : qu'un souhait est réservé, par qui, combien de personnes participent, ni « Ouvert à d'autres ». Ni dans la liste, ni dans les nouveautés, ni par Claude ([7.5 Listes d'envies : aucune réservation](#claude-envies)), ni sur la page du lien public quand elle est connectée.
- Ne peut pas réserver ses propres souhaits.
- Seule une personne qui a la main sur le serveur (fichiers de la base, sauvegardes) pourrait lire une réservation : ne donnez pas cet accès au bénéficiaire si la surprise compte.

<a id="claude"></a>

## 7. MCP Claude

<a id="claude-quoi"></a>

### 7.1 À quoi ça sert

Claude est l'assistant d'Anthropic (claude.ai, l'application mobile, Claude Desktop, Claude Code). Une fois connecté à Listo, il peut lire vos listes et, si vous le permettez, y ajouter des éléments, en cocher et les modifier, simplement en le lui demandant.

Claude agit avec votre compte et vos droits, jamais plus : ce qu'il ajoute apparaît à votre nom, comme si vous l'aviez fait vous-même, et il ne voit que les listes que vous lui avez autorisées.

Cet accès n'existe que si la personne qui gère le serveur l'a activé ([7.11 Un accès désactivé au départ](#claude-activation)). Sinon, la section « Claude » n'apparaît pas dans « Mon compte ».

<a id="claude-phrases"></a>

### 7.2 Exemples de phrases

- Lire : “Quelles sont mes listes Listo ?”, “Qu'y a-t-il dans la liste Courses ?”.
- Ajouter, avec un rayon : “Ajoute des tomates au rayon fruits et légumes dans Courses.”
- Ajouter, avec un magasin (liste « Multi ») : “Ajoute du lait chez Leclerc dans la liste Samedi.”
- Cocher : “Coche le pain et le beurre.” Décocher : “Décoche le lait.”
- Priorité et échéance (liste de tâches) : “Mets la tâche Ampoule en priorité élevée, pour vendredi.”
- Renommer ou compléter : “Renomme lait en lait demi-écrémé”, “Ajoute la note bio aux pommes.”
- Ranger : “Range le lait au rayon crèmerie.”

Claude lit d'abord la liste pour connaître ses rayons ou ses magasins, et il ne doit jamais en inventer. Si un article est resté sans rayon ou sans magasin, il doit vous le dire. Le comportement exact de Claude dépend de lui : vérifiez dans Listo.

<a id="claude-niveaux"></a>

### 7.3 Deux niveaux d'accord

Au moment de connecter Claude, l'écran « Autoriser Claude » de Listo vous laisse choisir :

- « Lecture seule » (choisi au départ) : Claude peut lire vos listes, sans rien y changer.
- « Lecture et écriture » : en plus, Claude peut ajouter des éléments, en cocher ou décocher, et modifier leur nom, leur quantité, leur note, leur priorité, leur échéance, leur rayon ou leur magasin.

Vous choisissez aussi « Toutes mes listes » ou « Certaines listes ». Même en « Lecture et écriture », Claude ne peut écrire que dans les listes où vous-même pouvez écrire : avec le droit « Lecture seule » sur une liste, il ne peut que la lire.

<a id="claude-jamais"></a>

### 7.4 Ce que Claude ne peut jamais faire

Quel que soit le niveau d'accord, Claude ne peut jamais :

- supprimer un élément, ni changer son lien ou son prix ;
- créer, renommer, supprimer ou partager une liste ;
- gérer les personnes, le lien public ou la corbeille ;
- voir les photos, ni qui a ajouté quoi.

<a id="claude-envies"></a>

### 7.5 Listes d'envies : aucune réservation

Claude ne reçoit jamais aucune donnée de réservation, pour personne : ni qui a réservé, ni si un souhait est réservé. La surprise est donc préservée, même si le bénéficiaire interroge Claude. Dans une liste d'envies, cocher veut dire “reçu” : seuls le bénéficiaire et le propriétaire de la liste le peuvent, avec Claude comme sans lui.

<a id="claude-limites"></a>

### 7.6 Limites

- 20 éléments au plus par demande.
- Par connexion et par heure : 100 ajouts, 300 éléments cochés ou décochés, 300 éléments modifiés. Au-delà, Claude reçoit un refus et rien n'est écrit.
- 120 appels par minute et par connexion.
- 5 connexions Claude actives au plus par compte ; une connexion inutilisée pendant 30 jours se libère toute seule.
- Claude ne crée pas un élément de même nom déjà présent et non coché : il vous le signale.

<a id="claude-connecter"></a>

### 7.7 Connecter Claude

1. Dans Listo : Réglages, « Mon compte », section « Claude », « Connexions Claude ». Sous « Adresse à saisir dans Claude », touchez « Copier l'adresse ». Elle ressemble à `https://listo.exemple.fr/mcp`.
2. Dans Claude (claude.ai, l'application mobile ou Claude Desktop) : dans ses réglages, ajoutez un connecteur personnalisé avec cette adresse.
3. Claude ouvre l'écran « Autoriser Claude » de Listo. Vérifiez que c'est bien vous qui venez de lancer la connexion, choisissez le niveau et les listes, saisissez votre mot de passe (et votre code de double authentification), puis « Autoriser ».

Avec Claude Code, sur un ordinateur : `claude mcp add --transport http listo https://listo.exemple.fr/mcp`, puis `/mcp` pour autoriser.

Si vous n'avez pas lancé vous-même la connexion, touchez « Refuser ».

<a id="claude-connexions"></a>

### 7.8 Voir et déconnecter Claude

Réglages, « Mon compte », « Connexions Claude » : chaque connexion autorisée y apparaît, avec l'application, son droit (« Lecture seule » ou « Lecture et écriture »), ses listes, sa date et sa dernière utilisation.

- « Déconnecter » coupe une connexion tout de suite ; « Tout déconnecter » les coupe toutes. Aucun mot de passe n'est demandé.
- Changer votre mot de passe déconnecte aussi toutes vos connexions Claude.
- Pour reconnecter Claude, il faut l'autoriser de nouveau.
- L'Admin ne voit pas les connexions Claude des autres comptes ; mais désactiver un compte ou réinitialiser son mot de passe les coupe toutes.

<a id="claude-prudence"></a>

### 7.9 Prudence : les textes piégés

> **Attention** : Une liste partagée peut contenir un texte piégé, écrit par quelqu'un d'autre pour tromper Claude (par exemple une note qui lui demande de tout cocher). Listo présente toujours le contenu des listes à Claude comme des données, jamais comme des consignes, mais choisissez « Lecture et écriture » seulement si vous en avez besoin.

Ne demandez à Claude de modifier un élément que vous-même ; vérifiez dans Listo ce qu'il a fait.

<a id="faq-claude"></a>

### 7.10 Dépannage

- Après une mise à jour de Listo, Claude peut garder l'ancienne liste de ses outils : ouvrez une nouvelle conversation, ou déconnectez puis reconnectez le connecteur dans Claude.
- Une liste manque : la connexion n'autorise peut-être que certaines listes, ou vous n'en êtes plus membre. Reconnectez Claude avec « Toutes mes listes » ([7.7 Connecter Claude](#claude-connecter)).
- Claude refuse d'écrire : la connexion est en « Lecture seule », ou vous n'avez que le droit « Lecture seule » sur cette liste.
- Plus rien ne marche : la connexion a pu être coupée (mot de passe changé, « Déconnecter »). Voyez « Connexions Claude » ([7.8 Voir et déconnecter Claude](#claude-connexions)).
- Claude dit qu'un rayon ou un magasin est inconnu : il n'existe pas, il est désactivé, ou (magasin d'une liste « Multi ») cette liste ne le propose pas. Rien n'a été ajouté ; Claude doit vous citer les rayons ou magasins valables. Choisissez-en un, ou demandez à l'Admin de le créer (Réglages, « Administration », onglet « Courses »).
- Claude dit qu'un magasin ne se choisit pas dans cette liste : dans une liste à magasin simple, le magasin est celui de la liste ; on choisit le rayon. Le rayon, lui, ne se choisit pas dans une liste « Multi ».

<a id="claude-activation"></a>

### 7.11 Un accès désactivé au départ

L'accès depuis Claude est désactivé tant que la personne qui gère le serveur n'a pas mis `LISTO_MCP=on` dans `docker-compose.yml` ([7.12 Activer l'accès sur le serveur](#mcp-serveur)). Désactivé, toutes ses adresses répondent comme si elles n'existaient pas, et la section « Claude » de « Mon compte » n'apparaît pas.

<a id="mcp-serveur"></a>

### 7.12 Activer l'accès sur le serveur

*Pour la personne qui gère le serveur.*

L'accès depuis Claude est désactivé par défaut. Pour l'activer, ajoutez `- LISTO_MCP=on` dans la partie `environment:` de `docker-compose.yml`, puis `docker compose up -d`. Pour le couper : retirez la ligne, puis `docker compose up -d` ; toutes ses adresses répondent alors 404, et les connexions accordées ne servent plus (elles reviennent si l'on réactive, tant qu'elles n'ont pas expiré). Aucun mot de passe ni aucune clé n'est à fournir.

Proxy : rien à régler, ces adresses passent par le même hôte. Le sous-domaine doit avoir une adresse IPv4 (enregistrement DNS “A”) : Claude ne passe pas par IPv6. Ces adresses doivent rester joignables depuis Internet : Claude les appelle depuis les serveurs d'Anthropic, Claude Code depuis votre ordinateur. Si un pare-feu filtre les connexions entrantes, ne recopiez pas une plage d'adresses trouvée ailleurs : Anthropic publie la liste à jour des adresses d'où partent ces appels sur sa page officielle [“IP addresses”](https://platform.claude.com/docs/en/api/ip-addresses), section “Outbound IP addresses” (en anglais), et peut la faire évoluer.

| Adresse | Qui l'appelle | Rôle |
| --- | --- | --- |
| `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource` | Claude | Dit où demander l'autorisation. |
| `/.well-known/oauth-authorization-server` | Claude | Description du serveur d'autorisation. |
| `/oauth/authorize` | votre navigateur | Vérifie la demande, puis ouvre l'écran « Autoriser Claude ». |
| `/oauth/token`, `/oauth/revoke`, `/oauth/register` | Claude | Jetons, révocation, enregistrement automatique. |
| `/mcp` | Claude | Le serveur MCP : exige un jeton obtenu par l'autorisation ; sans jeton valable, refus (401). |

<a id="mcp-regles"></a>

### 7.13 Règles et journal

*Pour la personne qui gère le serveur.*

- Jeton d'accès : 1 heure ; jeton de renouvellement : 30 jours glissants, remplacé à chaque usage ; un ancien jeton présenté de nouveau fait tomber toute la connexion. La base ne garde que l'empreinte des jetons, jamais les jetons eux-mêmes.
- Un jeton Claude n'ouvre rien d'autre que `/mcp` : ni l'application, ni ses autres adresses.
- Changer son mot de passe, ou un compte désactivé ou dont le mot de passe est réinitialisé (y compris par la commande de secours) : toutes ses connexions Claude sont révoquées.
- Les plafonds ([7.6 Limites](#claude-limites)) sont comptés en mémoire : ils repartent de zéro au redémarrage du conteneur.
- L'Admin ne voit pas les connexions des autres. En secours, il désactive le compte ou réinitialise son mot de passe. Pour tout le monde d'un coup : retirer `LISTO_MCP=on`.

Journal de sécurité (jamais un jeton, un code ni le contenu d'une liste) : `claude.connexion`, `claude.refus`, `claude.revocation`, `claude.renouvellement`, `claude.enregistrement`, `claude.client_refuse`, `claude.outil` (une ligne par appel d'outil, avec le nombre d'éléments, jamais un nom saisi), `claude.jeton_refuse`, `claude.origine_refusee`.

<a id="mcp-essai"></a>

### 7.14 Premier essai

*Pour la personne qui gère le serveur.*

Après l'activation, une fois, avant tout usage régulier :

1. Dans un navigateur : `https://listo.exemple.fr/.well-known/oauth-protected-resource/mcp` affiche un petit texte avec `"resource": "https://listo.exemple.fr/mcp"`.
2. Connecter Claude ([7.7 Connecter Claude](#claude-connecter)).
3. Demander à Claude “Quelles sont mes listes Listo ?”, puis “Qu'y a-t-il dans les courses ?” : les réponses doivent correspondre à l'application. Avec « Lecture et écriture » : “Ajoute du lait aux courses”, “Coche le pain” ; sur un téléphone ouvert sur la liste, les changements arrivent en direct.
4. `docker logs listo` : des lignes `claude.connexion` et `claude.outil`, aucune erreur. Signaler les lignes `claude.origine_refusee` ou `claude.client_refuse` s'il y en a.
5. Plus d'une heure plus tard, reposer une question : elle doit marcher sans nouvelle autorisation.
6. En cas de problème : retirer `LISTO_MCP=on`, `docker compose up -d`, et transmettre les lignes `claude.` du journal (elles ne contiennent ni jeton ni contenu de liste).

<a id="faq"></a>

## 8. Questions fréquentes et dépannage

<a id="faq-hors-ligne"></a>

### 8.1 Je n'ai pas de réseau

Continuez : ajouter, modifier et cocher marchent hors ligne, et la pastille du haut compte les changements en attente ([5.10 Hors ligne et synchronisation](#hors-ligne)). Ils partent tout seuls au retour du réseau. Le partage, le lien public, la corbeille et les réservations attendent le réseau.

<a id="faq-photo"></a>

### 8.2 Une photo ne s'envoie pas

- Sans réseau, la photo attend le retour du réseau.
- Le message « Photo trop lourde. » : le proxy refuse les envois de plus de 2 Mo ([3.4 Ce que doit faire le proxy](#proxy)). Avec nginx ou Nginx Proxy Manager, il manque la ligne `client_max_body_size 5m;` ([3.5 Exemple avec Nginx Proxy Manager](#npm)).

<a id="faq-lien"></a>

### 8.3 Un lien public ne marche plus

Il a expiré, ou son propriétaire l'a arrêté, ou la liste a été supprimée (restaurer une liste ne fait pas revenir son lien). Demandez un nouveau lien au propriétaire ([6.6 Propriétaire : le lien public](#lien-public)). S'il demande un mot de passe, c'est celui que le propriétaire a noté à sa création.

<a id="faq-retard"></a>

### 8.4 Les changements arrivent avec une minute de retard

Le proxy retient les messages du temps réel ([3.4 Ce que doit faire le proxy](#proxy)). Avec nginx ou Nginx Proxy Manager, il manque les lignes `proxy_buffering off;`, `proxy_cache off;` et `proxy_read_timeout 3600s;` ([3.5 Exemple avec Nginx Proxy Manager](#npm)).

<a id="faq-blanc"></a>

### 8.5 Écran blanc ou application figée

- Fermez Listo et rouvrez-le avec du réseau : il prend la dernière version. Si le bandeau « Nouvelle version disponible » reste affiché, touchez « Recharger ».
- Sinon : Réglages, « Mon compte », « Réinitialiser les données de ce téléphone » (les modifications en attente sont gardées).
- En dernier recours, effacez les données du site dans le navigateur (Chrome : cadenas à gauche de l'adresse, “Paramètres du site”, “Effacer les données” ; iPhone : Réglages, Safari, Avancé, Données des sites web), puis reconnectez-vous.
- Android, application installée, bas de l'écran caché par la barre de navigation : fermez complètement l'application puis rouvrez-la ; sinon désinstallez-la et réinstallez-la (attendez « À jour » avant, pour ne rien perdre).
- Tous les téléphones sont touchés : la personne qui gère le serveur regarde `docker logs listo` et `https://listo.exemple.fr/healthz` ([guide d'exploitation, dans le dépôt](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#depannage-serveur)).

<a id="faq-connexion"></a>

### 8.6 Je ne peux pas me connecter

- « Trop d'essais » : 5 mauvais mots de passe bloquent la connexion 15 minutes. Attendez, ou la personne qui gère le serveur redémarre Listo (`docker compose restart`).
- « Requête refusée : origine inconnue. » : l'adresse tapée n'est pas exactement celle de `LISTO_PUBLIC_URL` (autre sous-domaine, `http` au lieu de `https`) ([3.2 Le dossier et docker-compose.yml](#dossier)).
- Mot de passe oublié, téléphone perdu : [4.7 Mot de passe oublié, téléphone perdu](#oubli).
- Le mode hors ligne ou l'installation sur l'écran d'accueil ne marchent pas : Listo n'est pas ouvert en HTTPS. Passez toujours par `https://listo.exemple.fr`, jamais par `http://IP:13300`.

<a id="faq-double-auth"></a>

### 8.7 Double authentification : plus d'accès

- Téléphone changé ou perdu : connectez-vous avec un de vos « Codes de secours » (« Utiliser un code de secours »), puis réactivez la double authentification avec le nouveau téléphone ([4.6 Double authentification et codes de secours](#double-auth)).
- Plus de téléphone ni de codes de secours : l'Admin choisit « Désactiver la double authentification » sur votre compte (« Administration », « Comptes », bouton ⋮). Vous vous connectez avec votre seul mot de passe, puis vous la réactivez.
- C'est l'Admin qui est bloqué : voir [4.8 Compte Admin perdu](#secours) (commande de secours avec `--retirer-2fa`).
- Le code à 6 chiffres est toujours refusé : l'heure du téléphone est peut-être fausse ; mettez-la en réglage automatique.
- Plus personne ne peut valider ses codes après une panne du serveur : la clé secrète a peut-être été perdue ([8.8 La clé secrète a été perdue](#cle-perdue)).

<a id="cle-perdue"></a>

### 8.8 La clé secrète a été perdue

*Pour la personne qui gère le serveur.*

Sans copie de `secrets/secret.key`, Listo crée une nouvelle clé au démarrage. Les listes, articles, photos et mots de passe ne sont pas touchés, mais :

- les doubles authentifications ne se lisent plus : l'Admin la désactive pour les autres comptes (« Désactiver la double authentification »), pour lui-même avec la commande de secours et `--retirer-2fa` ([4.8 Compte Admin perdu](#secours)), puis chacun la réactive ;
- les liens publics déjà créés marchent encore, mais leur adresse ne peut plus être réaffichée : les arrêter et en créer de nouveaux ;
- gardez cette fois une copie de la nouvelle clé ([3.7 Garder la clé secrète](#cle)).

<a id="version"></a>

### 8.9 Savoir qu'une nouvelle version existe

Dans Réglages › « À propos », sur la ligne de la version, l'Admin voit l'état de la vérification :

- « À jour » : l'image installée est la dernière construite ;
- “Vérifié il y a 15 min”, avec une pastille « Nouvelle version » suivie de son numéro (par exemple “Nouvelle version : 9f8e7d6”) : une image plus récente existe ; pour la prendre : [guide d'exploitation, dans le dépôt](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#mises-a-jour) ;
- « Vérification impossible » : GitHub n'a pas répondu. Sans conséquence : Listo marche normalement ;
- le bouton d'actualisation, au bout de la ligne, refait la demande tout de suite (une fois par minute au plus).

C'est le serveur (pas le téléphone) qui demande à GitHub, au plus une fois par heure, sans compte ni jeton, quel est le dernier commit dont l'image a été construite. Listo ne se met jamais à jour tout seul. Les autres comptes ne voient que la version. Pour couper la vérification : `LISTO_UPDATE_CHECK=off` dans `docker-compose.yml` (la ligne est déjà prête, en commentaire), puis `docker compose up -d`.

<a id="faq-suggestion"></a>

### 8.10 Une faute de frappe revient dans les suggestions

L'Admin : Réglages, « Administration », onglet « Courses », « Articles ». Cherchez le nom et « Corriger » : Listo dit combien d'articles et dans combien de listes de courses il sera corrigé, puis le corrige partout (s'il existe déjà, les deux sont réunis). « Retirer » l'enlève seulement des suggestions, sans toucher aux listes. Un nom corrigé ou retiré peut revenir si quelqu'un le saisit de nouveau.

<a id="faq-orphelin"></a>

### 8.11 Liste d'envies : un participant est parti

Un proche a réservé, puis a quitté la liste ou son compte a été désactivé : il reste participant. Sur une liste créée pour quelqu'un d'autre, le propriétaire le voit et peut le « Retirer », ou « Libérer » tout le souhait. Sur une liste “pour moi”, personne ne le peut (le propriétaire est le bénéficiaire et ne voit pas les réservations, c'est voulu) : les autres participants peuvent seulement ouvrir ou fermer la réservation. Si le proche a seulement été désactivé, l'Admin peut le réactiver le temps qu'il « Quitte » ; sinon, supprimez le souhait puis recréez-le.
