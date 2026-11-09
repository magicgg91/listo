# Listo : le guide

<!-- Fichier fabriqué par scripts/guide.js à partir de public/js/help-content.js : ne pas le modifier à la main. -->

Le mode d'emploi complet de Listo, le même que la page « Aide » de l'application (Réglages › « Aide ») et que la page en ligne [https://magicgg91.github.io/listo/](https://magicgg91.github.io/listo/). Les chapitres marqués « Pour la personne qui gère le serveur » ne concernent que l'installation et l'entretien.

## Sommaire

- [1. Présentation](#presentation)
  - [1.1 Ce qu'est Listo](#listo)
  - [1.2 Ce que Listo ne fait pas](#limites)
  - [1.3 Trois types de liste](#types)
  - [1.4 Le vocabulaire](#vocabulaire)
- [2. Les possibilités](#possibilites)
  - [2.1 Listes partagées en direct](#p-partage)
  - [2.2 Courses : rayons et magasins](#p-courses)
  - [2.3 Tâches : priorité et échéance](#p-taches)
  - [2.4 Envies : réservation et cotisation](#p-envies)
  - [2.5 Saisie rapide](#p-saisie)
  - [2.6 Hors ligne, corbeille, lien public](#p-securite)
  - [2.7 Sécurité et confort](#p-confort)
- [3. Claude et Listo](#claude)
  - [3.1 À quoi ça sert](#claude-quoi)
  - [3.2 Exemples de phrases](#claude-phrases)
  - [3.3 Deux niveaux d'accord](#claude-niveaux)
  - [3.4 Ce que Claude ne peut jamais faire](#claude-jamais)
  - [3.5 Listes d'envies : aucune réservation](#claude-envies)
  - [3.6 Limites](#claude-limites)
  - [3.7 Connecter Claude](#claude-connecter)
  - [3.8 Voir et déconnecter Claude](#claude-connexions)
  - [3.9 Prudence : les textes piégés](#claude-prudence)
  - [3.10 Un accès désactivé au départ](#claude-activation)
- [4. Installation](#installation)
  - [4.1 Ce qu'il faut](#prerequis)
  - [4.2 Le dossier et docker-compose.yml](#dossier)
  - [4.3 Les réglages (variables)](#variables)
  - [4.4 Régler Nginx Proxy Manager](#npm)
  - [4.5 Premier démarrage et code de démarrage](#demarrage)
  - [4.6 Garder la clé secrète](#cle)
  - [4.7 Vérifications une fois en production](#verifications)
- [5. Les comptes](#comptes)
  - [5.1 Le premier Admin](#premier-admin)
  - [5.2 Créer les autres comptes](#creer-comptes)
  - [5.3 Première connexion](#premiere-connexion)
  - [5.4 Installer Listo sur le téléphone](#telephone)
  - [5.5 Changer de mot de passe](#mot-de-passe)
  - [5.6 Double authentification et codes de secours](#double-auth)
  - [5.7 Mot de passe oublié, téléphone perdu](#oubli)
- [6. Au quotidien](#quotidien)
  - [6.1 Ajouter, modifier, cocher, supprimer](#ajouter)
  - [6.2 Saisir la quantité avec le nom](#quantite)
  - [6.3 Ajouter plusieurs articles d'un coup](#plusieurs)
  - [6.4 Scanner un code-barres](#scan)
  - [6.5 Ajouter une photo](#photo)
  - [6.6 Groupes, tri et compteur](#tri)
  - [6.7 Rechercher](#recherche)
  - [6.8 Réserver un souhait, cotiser](#reserver)
  - [6.9 Nouveautés](#nouveautes)
  - [6.10 Hors ligne et synchronisation](#hors-ligne)
  - [6.11 Thème clair ou sombre](#theme)
- [7. Rôle par rôle](#roles)
  - [7.1 Admin](#role-admin)
  - [7.2 Propriétaire : créer une liste](#creer)
  - [7.3 Propriétaire : modifier la liste](#modifier)
  - [7.4 Propriétaire : partager et choisir les droits](#partager)
  - [7.5 Propriétaire : liste d'envies](#envies)
  - [7.6 Propriétaire : le lien public](#lien-public)
  - [7.7 Propriétaire : dupliquer, supprimer, restaurer](#corbeille)
  - [7.8 Contributeur (« Peut modifier »)](#role-contributeur)
  - [7.9 Lecture seule](#role-lecture)
  - [7.10 Visiteur du lien public](#role-visiteur)
  - [7.11 Bénéficiaire d'une liste d'envies](#role-beneficiaire)
- [8. Questions fréquentes et dépannage](#faq)
  - [8.1 Je n'ai pas de réseau](#faq-hors-ligne)
  - [8.2 Une photo ne s'envoie pas](#faq-photo)
  - [8.3 Un lien public ne marche plus](#faq-lien)
  - [8.4 Claude ne voit pas un outil ou une liste](#faq-claude)
  - [8.5 Les changements arrivent avec une minute de retard](#faq-retard)
  - [8.6 Écran blanc ou application figée](#faq-blanc)
  - [8.7 Je ne peux pas me connecter](#faq-connexion)
  - [8.8 Une faute de frappe revient dans les suggestions](#faq-suggestion)
  - [8.9 Liste d'envies : un participant est parti](#faq-orphelin)
- [9. Gérer le serveur](#serveur)
  - [9.1 Sauvegardes](#sauvegardes)
  - [9.2 Restaurer une sauvegarde](#restauration)
  - [9.3 Mettre à jour Listo](#mises-a-jour)
  - [9.4 Savoir qu'une nouvelle version existe](#version)
  - [9.5 Revenir à la version précédente](#revenir)
  - [9.6 Mises à jour qui changent la base](#migrations)
  - [9.7 Surveiller les mises à jour de sécurité](#surveillance)
  - [9.8 Journaux](#journaux)
  - [9.9 Compte Admin perdu](#secours)
  - [9.10 Clé secrète perdue](#cle-perdue)
  - [9.11 Mode scan : Open Food Facts](#scan-serveur)
  - [9.12 Claude : activer l'accès](#mcp-serveur)
  - [9.13 Claude : règles et journal](#mcp-regles)
  - [9.14 Claude : premier essai](#mcp-essai)

<a id="presentation"></a>

## 1. Présentation

<a id="listo"></a>

### 1.1 Ce qu'est Listo

Listo est une application de listes partagées : courses, tâches et idées de cadeaux. Elle est pensée pour une famille ou un petit groupe de proches, et s'utilise surtout depuis un téléphone.

Quand quelqu'un coche un article, les autres le voient coché en quelques secondes. Listo est gratuit, sans publicité et sans suivi.

Les comptes sont créés par l'Admin, la personne qui gère Listo : il n'y a pas d'inscription publique.

<a id="limites"></a>

### 1.2 Ce que Listo ne fait pas

- Pas de version en ligne : Listo s'installe sur votre propre serveur (un ordinateur toujours allumé, à la maison par exemple). Voir [4. Installation](#installation).
- Français seulement.
- Pas de notification : les nouveautés se voient en ouvrant Listo.
- Pas de paiement : pour un cadeau commun, Listo dit qui participe, jamais combien.
- Aucune donnée envoyée ailleurs que sur votre serveur, sauf deux demandes que l'on peut couper : la vérification d'une nouvelle version (GitHub, [9.4 Savoir qu'une nouvelle version existe](#version)) et le nom d'un produit scanné (Open Food Facts, [9.11 Mode scan : Open Food Facts](#scan-serveur)). Si vous connectez Claude, le contenu des listes autorisées lui est envoyé quand vous l'interrogez ([3. Claude et Listo](#claude)).

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

- Une liste se partage avec d'autres comptes, chacun avec son droit : « Peut modifier » ou « Lecture seule » ([7.4 Propriétaire : partager et choisir les droits](#partager)).
- Les changements arrivent sur les autres téléphones en quelques secondes. Les articles cochés se rangent en bas, barrés.
- Nouveautés : Listo signale ce que les autres ont ajouté ou modifié depuis votre dernière visite ([6.9 Nouveautés](#nouveautes)).
- Une icône au choix pour chaque liste, et un compteur des restants sur chaque carte et chaque groupe ([6.6 Groupes, tri et compteur](#tri)).

<a id="p-courses"></a>

### 2.2 Courses : rayons et magasins

- Articles classés par rayon ; Listo retient le rayon habituel de chaque article et propose les noms déjà saisis ([6.1 Ajouter, modifier, cocher, supprimer](#ajouter)).
- Magasin « Multi » : une tournée de plusieurs boutiques, où chaque article a son magasin au lieu d'un rayon ([7.2 Propriétaire : créer une liste](#creer)).
- Chacun peut créer un magasin ou un rayon qui manque ; l'Admin les gère ([7.1 Admin](#role-admin)).

<a id="p-taches"></a>

### 2.3 Tâches : priorité et échéance

- Priorité (basse, normale, élevée) et échéance, activées liste par liste ([7.3 Propriétaire : modifier la liste](#modifier)).
- Tri par priorité ou par échéance ([6.6 Groupes, tri et compteur](#tri)).

<a id="p-envies"></a>

### 2.4 Envies : réservation et cotisation

- Pour soi, pour un autre compte ou pour une personne sans compte ; lien, prix indicatif, priorité et photo ([7.5 Propriétaire : liste d'envies](#envies)).
- Les proches réservent un souhait, éventuellement à plusieurs (cotisation) ([6.8 Réserver un souhait, cotiser](#reserver)).
- La personne à qui la liste est destinée ne voit jamais les réservations ([7.11 Bénéficiaire d'une liste d'envies](#role-beneficiaire)).
- Par le lien public, un visiteur sans compte peut aussi réserver ou participer ([7.10 Visiteur du lien public](#role-visiteur)).

<a id="p-saisie"></a>

### 2.5 Saisie rapide

- Plusieurs articles d'un coup, séparés par des virgules ou des retours à la ligne ([6.3 Ajouter plusieurs articles d'un coup](#plusieurs)).
- Quantité lue dans le nom : “6 oeufs” ou “oeufs x6” ([6.2 Saisir la quantité avec le nom](#quantite)).
- Mode scan : le code-barres d'un produit, photographié, donne son nom ([6.4 Scanner un code-barres](#scan)).
- Photo d'un article ([6.5 Ajouter une photo](#photo)).

<a id="p-securite"></a>

### 2.6 Hors ligne, corbeille, lien public

- Hors ligne : Listo s'ouvre et s'utilise sans réseau ; les changements partent au retour du réseau ([6.10 Hors ligne et synchronisation](#hors-ligne)).
- Corbeille : une liste supprimée se restaure pendant 30 jours ([7.7 Propriétaire : dupliquer, supprimer, restaurer](#corbeille)).
- Lien public : montrer une liste à quelqu'un sans compte, pour une durée choisie, avec un mot de passe si besoin ([7.6 Propriétaire : le lien public](#lien-public)).

<a id="p-confort"></a>

### 2.7 Sécurité et confort

- Double authentification, avec des codes de secours ([5.6 Double authentification et codes de secours](#double-auth)).
- Sauvegarde automatique chaque nuit ([9.1 Sauvegardes](#sauvegardes)).
- Thème clair, sombre ou automatique ([6.11 Thème clair ou sombre](#theme)).
- Installation sur l'écran d'accueil du téléphone, comme une application ([5.4 Installer Listo sur le téléphone](#telephone)).
- Claude (l'assistant d'Anthropic) peut lire vos listes et, si vous le permettez, y écrire ([3. Claude et Listo](#claude)).

<a id="claude"></a>

## 3. Claude et Listo

<a id="claude-quoi"></a>

### 3.1 À quoi ça sert

Claude est l'assistant d'Anthropic (claude.ai, l'application mobile, Claude Desktop, Claude Code). Une fois connecté à Listo, il peut lire vos listes et, si vous le permettez, y ajouter des éléments, en cocher et les modifier, simplement en le lui demandant.

Claude agit avec votre compte et vos droits, jamais plus : ce qu'il ajoute apparaît à votre nom, comme si vous l'aviez fait vous-même, et il ne voit que les listes que vous lui avez autorisées.

Cet accès n'existe que si la personne qui gère le serveur l'a activé ([3.10 Un accès désactivé au départ](#claude-activation)). Sinon, la section « Claude » n'apparaît pas dans « Mon compte ».

<a id="claude-phrases"></a>

### 3.2 Exemples de phrases

- Lire : “Quelles sont mes listes Listo ?”, “Qu'y a-t-il dans la liste Courses ?”.
- Ajouter, avec un rayon : “Ajoute des tomates au rayon fruits et légumes dans Courses.”
- Ajouter, avec un magasin (liste « Multi ») : “Ajoute du lait chez Leclerc dans la liste Samedi.”
- Cocher : “Coche le pain et le beurre.” Décocher : “Décoche le lait.”
- Priorité et échéance (liste de tâches) : “Mets la tâche Ampoule en priorité élevée, pour vendredi.”
- Renommer ou compléter : “Renomme lait en lait demi-écrémé”, “Ajoute la note bio aux pommes.”
- Ranger : “Range le lait au rayon crèmerie.”

Claude lit d'abord la liste pour connaître ses rayons ou ses magasins, et il ne doit jamais en inventer. Si un article est resté sans rayon ou sans magasin, il doit vous le dire. Le comportement exact de Claude dépend de lui : vérifiez dans Listo.

<a id="claude-niveaux"></a>

### 3.3 Deux niveaux d'accord

Au moment de connecter Claude, l'écran « Autoriser Claude » de Listo vous laisse choisir :

- « Lecture seule » (choisi au départ) : Claude peut lire vos listes, sans rien y changer.
- « Lecture et écriture » : en plus, Claude peut ajouter des éléments, en cocher ou décocher, et modifier leur nom, leur quantité, leur note, leur priorité, leur échéance, leur rayon ou leur magasin.

Vous choisissez aussi « Toutes mes listes » ou « Certaines listes ». Même en « Lecture et écriture », Claude ne peut écrire que dans les listes où vous-même pouvez écrire : avec le droit « Lecture seule » sur une liste, il ne peut que la lire.

<a id="claude-jamais"></a>

### 3.4 Ce que Claude ne peut jamais faire

Quel que soit le niveau d'accord, Claude ne peut jamais :

- supprimer un élément, ni changer son lien ou son prix ;
- créer, renommer, supprimer ou partager une liste ;
- gérer les personnes, le lien public ou la corbeille ;
- voir les photos, ni qui a ajouté quoi.

<a id="claude-envies"></a>

### 3.5 Listes d'envies : aucune réservation

Claude ne reçoit jamais aucune donnée de réservation, pour personne : ni qui a réservé, ni si un souhait est réservé. La surprise est donc préservée, même si le bénéficiaire interroge Claude. Dans une liste d'envies, cocher veut dire “reçu” : seuls le bénéficiaire et le propriétaire de la liste le peuvent, avec Claude comme sans lui.

<a id="claude-limites"></a>

### 3.6 Limites

- 20 éléments au plus par demande.
- Par connexion et par heure : 100 ajouts, 300 éléments cochés ou décochés, 300 éléments modifiés. Au-delà, Claude reçoit un refus et rien n'est écrit.
- 120 appels par minute et par connexion.
- 5 connexions Claude actives au plus par compte ; une connexion inutilisée pendant 30 jours se libère toute seule.
- Claude ne crée pas un élément de même nom déjà présent et non coché : il vous le signale.

<a id="claude-connecter"></a>

### 3.7 Connecter Claude

1. Dans Listo : Réglages, « Mon compte », section « Claude », « Connexions Claude ». Sous « Adresse à saisir dans Claude », touchez « Copier l'adresse ». Elle ressemble à `https://listo.exemple.fr/mcp`.
2. Dans Claude (claude.ai, l'application mobile ou Claude Desktop) : dans ses réglages, ajoutez un connecteur personnalisé avec cette adresse.
3. Claude ouvre l'écran « Autoriser Claude » de Listo. Vérifiez que c'est bien vous qui venez de lancer la connexion, choisissez le niveau et les listes, saisissez votre mot de passe (et votre code de double authentification), puis « Autoriser ».

Avec Claude Code, sur un ordinateur : `claude mcp add --transport http listo https://listo.exemple.fr/mcp`, puis `/mcp` pour autoriser.

Si vous n'avez pas lancé vous-même la connexion, touchez « Refuser ».

<a id="claude-connexions"></a>

### 3.8 Voir et déconnecter Claude

Réglages, « Mon compte », « Connexions Claude » : chaque connexion autorisée y apparaît, avec l'application, son droit (« Lecture seule » ou « Lecture et écriture »), ses listes, sa date et sa dernière utilisation.

- « Déconnecter » coupe une connexion tout de suite ; « Tout déconnecter » les coupe toutes. Aucun mot de passe n'est demandé.
- Changer votre mot de passe déconnecte aussi toutes vos connexions Claude.
- Pour reconnecter Claude, il faut l'autoriser de nouveau.

<a id="claude-prudence"></a>

### 3.9 Prudence : les textes piégés

> **Attention** : Une liste partagée peut contenir un texte piégé, écrit par quelqu'un d'autre pour tromper Claude (par exemple une note qui lui demande de tout cocher). Listo présente toujours le contenu des listes à Claude comme des données, jamais comme des consignes, mais choisissez « Lecture et écriture » seulement si vous en avez besoin.

Ne demandez à Claude de modifier un élément que vous-même ; vérifiez dans Listo ce qu'il a fait.

<a id="claude-activation"></a>

### 3.10 Un accès désactivé au départ

L'accès depuis Claude est désactivé tant que la personne qui gère le serveur n'a pas mis `LISTO_MCP=on` dans `docker-compose.yml` ([9.12 Claude : activer l'accès](#mcp-serveur)). Désactivé, toutes ses adresses répondent comme si elles n'existaient pas, et la section « Claude » de « Mon compte » n'apparaît pas.

<a id="installation"></a>

## 4. Installation

*Pour la personne qui gère le serveur.*

<a id="prerequis"></a>

### 4.1 Ce qu'il faut

- Un serveur : un ordinateur toujours allumé, sous Linux, avec Docker et Docker Compose. Repérez son adresse sur le réseau local (par exemple `192.168.1.20`) : c'est l'`IP_LOCALE` de la suite.
- Nginx Proxy Manager (il peut être sur une autre machine), avec un sous-domaine qui pointe vers lui (par exemple `listo.exemple.fr`) et un certificat HTTPS Let's Encrypt.
- Un gestionnaire de mots de passe, pour y garder la clé de Listo ([4.6 Garder la clé secrète](#cle)).

Listo s'utilise en HTTPS : sans HTTPS, il refuse de démarrer en production, car la connexion, le mode hors ligne et l'installation sur le téléphone en ont besoin.

<a id="dossier"></a>

### 4.2 Le dossier et docker-compose.yml

Un seul fichier suffit, aucun code source :

```sh
mkdir -p /opt/listo && cd /opt/listo
# copier ici le fichier docker-compose.yml du dépôt, puis l'ouvrir pour le modifier
```

Dans `docker-compose.yml` (commenté ligne par ligne), remplacez deux valeurs :

1. `LISTO_PUBLIC_URL=https://listo.exemple.fr` : l'adresse exacte que vous taperez dans le navigateur, sans `/` à la fin. Une adresse différente fait refuser toutes les connexions (“origine inconnue”).
2. `IP_LOCALE` : l'adresse du serveur sur le réseau local (`192.168.1.20:13300:13300`). Jamais `0.0.0.0` : le port ne doit être ouvert que sur le réseau local, et seul Nginx Proxy Manager doit l'utiliser.

Les dossiers `data/` (base, sauvegardes, photos, journal) et `secrets/` (clé de chiffrement) se créent tout seuls au premier démarrage, à côté du fichier. Ils ne doivent jamais être copiés ailleurs que dans vos sauvegardes.

<a id="variables"></a>

### 4.3 Les réglages (variables)

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
| `LISTO_UPDATE_CHECK` | absente : activée | `off` coupe la vérification de mise à jour sur GitHub ([9.4 Savoir qu'une nouvelle version existe](#version)). |
| `LISTO_PRODUCT_LOOKUP` | absente : activé | `off` coupe le mode scan : bouton masqué, plus aucune demande vers Open Food Facts ([9.11 Mode scan : Open Food Facts](#scan-serveur)). |
| `LISTO_PRODUCT_CONTACT` | absente | Facultative : adresse e-mail ou adresse web de contact envoyée à Open Food Facts ([9.11 Mode scan : Open Food Facts](#scan-serveur)). |
| `LISTO_MCP` | absente : désactivé | `on` active l'accès depuis Claude ([9.12 Claude : activer l'accès](#mcp-serveur)). Toute autre valeur : désactivé. |

<a id="npm"></a>

### 4.4 Régler Nginx Proxy Manager

Dans Nginx Proxy Manager, “Hosts”, “Proxy Hosts”, “Add Proxy Host” :

- Details : “Domain Names” = votre sous-domaine ; “Scheme” = `http` ; “Forward Hostname / IP” = `IP_LOCALE` ; “Forward Port” = `13300`. “Websockets Support” : inutile, laisser décoché (le temps réel passe par une connexion HTTP ordinaire).
- SSL : demander un certificat Let's Encrypt, cocher “Force SSL”, “HTTP/2 Support” et “HSTS Enabled”. C'est Nginx Proxy Manager qui ajoute l'en-tête HSTS : Listo ne l'envoie pas lui-même.
- Advanced (“Custom Nginx Configuration”) : coller les quatre lignes ci-dessous.

```sh
client_max_body_size 5m;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
```

- `client_max_body_size 5m;` : sans elle, l'envoi des photos est refusé (Nginx accepte 1 Mo par défaut ; une photo de Listo fait au plus 2 Mo).
- Les trois autres servent au temps réel : sans elles, les changements n'arrivent sur l'autre téléphone qu'au bout d'environ une minute.
- Nginx Proxy Manager transmet l'adresse IP réelle des téléphones ; Listo s'en sert pour bloquer les essais de mots de passe répétés. Rien à régler.
- Accès depuis Claude : ses adresses passent par le même hôte, sans réglage de plus. Elles doivent rester joignables depuis Internet ([9.12 Claude : activer l'accès](#mcp-serveur)).

**Limiter l'accès au port de Listo**

Listo croit l'adresse IP que lui transmet Nginx Proxy Manager : quelqu'un qui joindrait directement le port 13300 pourrait en inventer une et contourner le blocage des essais de mots de passe. Ce port ne doit donc être joignable que depuis la machine de Nginx Proxy Manager, par une règle de pare-feu sur le serveur ou sur le réseau (box, routeur).

- Exemple avec ufw, si Nginx Proxy Manager est en `192.168.1.10` : `sudo ufw allow from 192.168.1.10 to any port 13300 proto tcp`. Attention : Docker ouvre les ports qu'il publie en passant à côté de ufw ; il faut un réglage propre à Docker (chaîne `DOCKER-USER`) ou un pare-feu en amont.
- Vérifier : depuis un autre ordinateur du réseau, `curl http://IP_LOCALE:13300/healthz` doit échouer ; depuis la machine de Nginx Proxy Manager, il doit répondre `{"status":"ok"}`.
- Le journal d'accès de Nginx Proxy Manager enregistre les adresses des liens publics ouverts (`/p/…`). Pour couper un lien qui aurait circulé, arrêtez-le depuis Listo.

<a id="demarrage"></a>

### 4.5 Premier démarrage et code de démarrage

Sur le serveur, dans `/opt/listo` :

```sh
# télécharge l'image et démarre Listo
docker compose up -d
# affiche le code de démarrage
docker logs listo
```

1. Dans `docker logs listo`, repérez le code de démarrage, encadré de `====` (il ressemble à `ABCD-EFGH-JKLM`). Ne le communiquez à personne.
2. Ouvrez `https://listo.exemple.fr` : l'écran « Bienvenue sur Listo » propose de créer le compte Admin ([5.1 Le premier Admin](#premier-admin)).
3. Ce code ne sert qu'une fois : l'écran disparaît dès qu'un compte existe.

<a id="cle"></a>

### 4.6 Garder la clé secrète

Tout de suite après le premier démarrage, affichez la clé et copiez-la dans votre gestionnaire de mots de passe (une ligne de texte) :

```sh
cat /opt/listo/secrets/secret.key
```

Sans elle, après une panne du serveur, les doubles authentifications ne marchent plus ([9.10 Clé secrète perdue](#cle-perdue)). Elle n'est jamais copiée dans les sauvegardes de la nuit, volontairement : gardez-la à part, une fois pour toutes.

<a id="verifications"></a>

### 4.7 Vérifications une fois en production

1. HTTPS : `https://listo.exemple.fr` s'ouvre avec le cadenas ; `http://listo.exemple.fr` redirige vers `https://`.
2. Santé : `https://listo.exemple.fr/healthz` répond `{"status":"ok"}`.
3. En-têtes de sécurité : passez l'adresse dans un outil comme [securityheaders.com](https://securityheaders.com). On doit y voir `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-Robots-Tag` (envoyés par Listo) et `Strict-Transport-Security` (ajouté par Nginx Proxy Manager), et aucun `X-Powered-By`.
4. Une sauvegarde : le lendemain matin, `ls -l /opt/listo/data/backups` montre une copie de la nuit, et `docker logs listo | grep sauvegarde` la ligne `sauvegarde_reussie`.
5. Une restauration d'essai : suivez [9.2 Restaurer une sauvegarde](#restauration) une fois, avec la copie de la nuit.
6. Le port fermé : voir [4.4 Régler Nginx Proxy Manager](#npm).
7. Le téléphone : installation sur l'écran d'accueil ([5.4 Installer Listo sur le téléphone](#telephone)), puis la liste “Vérifier sur les téléphones” de [docs/developpement.md](https://github.com/magicgg91/listo/blob/main/docs/developpement.md#vérifier-sur-les-téléphones).

<a id="comptes"></a>

## 5. Les comptes

<a id="premier-admin"></a>

### 5.1 Le premier Admin

À la toute première ouverture, l'écran « Bienvenue sur Listo » demande :

- « Identifiant » : 2 à 50 caractères (lettres sans accent, chiffres, . \_ -) ;
- « Mot de passe » : au moins 10 caractères, puis « Confirmation du mot de passe » ;
- « Code de démarrage » : celui affiché dans les journaux du serveur ([4.5 Premier démarrage et code de démarrage](#demarrage)).

Puis « Créer le compte Admin ». Ce compte crée ensuite tous les autres.

<a id="creer-comptes"></a>

### 5.2 Créer les autres comptes

L'Admin : Réglages, « Administration », onglet « Comptes », « Ajouter un compte ».

- « Identifiant » : ce que la personne tapera pour se connecter ;
- « Nom affiché (facultatif) » : le prénom montré aux autres (“Ajouté par Marie”) ;
- « Mot de passe provisoire » : à transmettre à la personne ; elle le remplacera à sa première connexion ;
- « Rôle » : « Utilisateur » ou « Admin ».

<a id="premiere-connexion"></a>

### 5.3 Première connexion

1. Ouvrez l'adresse de Listo (par exemple `https://listo.exemple.fr`).
2. Saisissez votre « Identifiant » et votre « Mot de passe », puis « Se connecter ».
3. Avec un mot de passe provisoire, l'écran « Nouveau mot de passe » demande d'en choisir un nouveau (au moins 10 caractères), puis « Enregistrer ».
4. Vous restez connecté 30 jours sur ce téléphone (réglable par la personne qui gère le serveur).

<a id="telephone"></a>

### 5.4 Installer Listo sur le téléphone

Ouvrez l'adresse de Listo et connectez-vous, puis :

- iPhone (Safari) : bouton “Partager” (carré avec une flèche), “Sur l'écran d'accueil”, puis “Ajouter”.
- Android (Chrome) : menu ⋮, “Installer l'application” (ou “Ajouter à l'écran d'accueil”).

L'icône Listo apparaît. Ouverte depuis l'écran d'accueil, Listo s'affiche en plein écran et marche aussi sans réseau. Sur iPhone, l'application installée a sa propre connexion, séparée de Safari : il faut s'y connecter une fois.

<a id="mot-de-passe"></a>

### 5.5 Changer de mot de passe

Réglages, « Mon compte », « Mot de passe » : « Mot de passe actuel », « Nouveau mot de passe » (au moins 10 caractères), « Confirmation », puis « Enregistrer ». Vos autres appareils sont alors déconnectés, ainsi que vos connexions Claude.

<a id="double-auth"></a>

### 5.6 Double authentification et codes de secours

Conseillée pour l'Admin. Il faut une application d'authentification sur le téléphone (Aegis, Google Authenticator, Microsoft Authenticator…).

1. Réglages, « Mon compte », « Double authentification ».
2. « Étape 1 sur 2 » : scannez le QR code avec l'application (ou recopiez la clé affichée sous « Ou saisissez cette clé »), saisissez le « Code à 6 chiffres » qu'elle montre, puis « Vérifier et activer ».
3. « Étape 2 sur 2 » : Listo affiche 10 « Codes de secours », une seule fois. « Copier les codes », gardez-les dans un gestionnaire de mots de passe, puis « J'ai conservé mes codes ».

Ensuite, chaque connexion demande le mot de passe, puis le code (« Vérification en deux étapes »). Sans le téléphone, « Utiliser un code de secours » : chaque code ne fonctionne qu'une fois.

Pour la retirer : même écran, « Mot de passe » et « Code » (de l'application, ou un code de secours), puis « Désactiver la double authentification ».

<a id="oubli"></a>

### 5.7 Mot de passe oublié, téléphone perdu

- Mot de passe oublié : demandez à l'Admin. Dans « Administration », « Comptes », bouton ⋮ de votre compte, « Réinitialiser le mot de passe » : il vous donne un mot de passe provisoire, à changer à la connexion suivante. Il n'y a pas d'envoi par e-mail.
- Téléphone de double authentification perdu, et plus de codes de secours : l'Admin choisit « Désactiver la double authentification » sur votre compte ; vous pourrez la réactiver ensuite.
- Trop d'essais : 5 mauvais mots de passe bloquent la connexion pendant 15 minutes.
- L'Admin a lui-même perdu son mot de passe : voir [9.9 Compte Admin perdu](#secours).

<a id="quotidien"></a>

## 6. Au quotidien

Les gestes de tous les jours, pour toute personne qui peut modifier la liste (propriétaire ou « Peut modifier »). En « Lecture seule », on peut lire, trier et rechercher.

<a id="ajouter"></a>

### 6.1 Ajouter, modifier, cocher, supprimer

- Ajouter : tapez le nom dans le champ en bas de la liste, puis touchez « + ». Des suggestions s'affichent pendant la saisie. Dans une liste de courses, pour un nouvel article, Listo demande son rayon, puis s'en souvient.
- Après l'ajout, le clavier se replie. Si la liste est réglée sur « Ouvrir la fiche », la fiche de ce qui vient d'être ajouté s'ouvre (sans clavier) : réglez quantité, note, priorité ou échéance, puis la disquette ; la croix la referme sans rien changer, la ligne reste ajoutée.
- Modifier : touchez la ligne. La fiche s'ouvre ; la disquette enregistre.
- Cocher : touchez la case. Un article coché est barré et passe dans « Dans le panier » (« Terminés » dans une liste de tâches), en bas de la liste.
- Supprimer : faites glisser la ligne vers la gauche, puis touchez « Supprimer ». « Annuler » remet la ligne pendant quelques secondes.
- Tout d'un coup, en bas de la liste, après confirmation : « Tout remettre à acheter » décoche les articles du panier, « Retirer du panier » les supprime pour tout le monde. Dans une liste de tâches : « Tout rouvrir » et « Retirer les terminés » ; dans une liste d'envies : « Tout rouvrir » et « Retirer les reçus ».

<a id="quantite"></a>

### 6.2 Saisir la quantité avec le nom

Dans une liste de courses (seulement), écrivez la quantité au début du nom, ou à la fin avec un x : Listo la range dans le champ « Quantité ».

- 6 oeufs : oeufs, quantité 6.
- 2 kg de pommes, ou 2 kg pommes : pommes, quantité 2 kg. Pareil avec 500 g farine, 1,5 L lait, 3 sachets de levure ou 4 paquets de riz.
- oeufs x6 : oeufs, quantité 6.
- Dans le doute, tout reste le nom : 7up, tarte 6 parts, 2 en 1 shampoing. Pour qu'un nombre ne soit jamais lu, écrivez-le après le nom (shampoing 2 en 1).
- Ça marche aussi avec plusieurs articles d'un coup (6 oeufs, 2 kg pommes ; lait). Si Listo s'est trompé, corrigez dans la fiche de l'article.
- Dans une liste de tâches, le nombre fait partie du nom (3 appels à passer) : rien n'est lu ; la quantité se règle dans la fiche. Pas de quantité dans une liste d'envies.

<a id="plusieurs"></a>

### 6.3 Ajouter plusieurs articles d'un coup

Dans une liste de courses ou de tâches, séparez les noms par des virgules, des points-virgules ou des retours à la ligne, puis touchez « + » : par exemple, lait, pain ; 6 oeufs ajoute trois lignes. Vous pouvez aussi coller une liste copiée depuis vos notes.

- Une virgule entre deux chiffres ne sépare rien : 1,5 L de lait reste une seule ligne.
- 20 lignes au plus à la fois. Au-delà, ou si un nom est trop long, rien n'est ajouté et un message le dit.
- Dans une liste de courses, Listo demande le rayon de chaque nouvel article, l'un après l'autre. Si vous fermez une de ces fenêtres, rien n'est ajouté et le texte reste dans le champ.
- Avec plusieurs lignes, la liste reste affichée, même réglée sur « Ouvrir la fiche ». Cela marche aussi sans réseau.
- Dans une liste d'envies, le texte n'est jamais découpé : un souhait à la fois.

<a id="scan"></a>

### 6.4 Scanner un code-barres

Dans une liste de courses, le bouton code-barres à côté du champ d'ajout (« Scanner un produit ») ouvre l'appareil photo ou la photothèque du téléphone. Photographiez le code-barres d'un produit : Listo le lit sur le téléphone (la photo n'est jamais envoyée).

- Un article de la liste porte déjà ce code : Listo propose de le cocher.
- Un article d'une autre de vos listes le porte : Listo reprend son nom (« Produit connu »).
- Sinon, Listo cherche le nom du produit dans Open Food Facts ; vous pouvez le corriger, puis « Ajouter à la liste ».
- Ce bouton n'existe que si le mode scan est activé sur votre serveur ([9.11 Mode scan : Open Food Facts](#scan-serveur)).

<a id="photo"></a>

### 6.5 Ajouter une photo

Dans la fiche d'un article, « Ajouter une photo » prend une photo ou en choisit une. Elle est réduite sur le téléphone avant l'envoi, et ses informations cachées (lieu, appareil) sont retirées par le serveur. La photo est facultative ; seuls les membres de la liste la voient (et les visiteurs d'un lien public valable).

<a id="tri"></a>

### 6.6 Groupes, tri et compteur

- Touchez l'en-tête d'un rayon (ou d'un magasin, ou d'une priorité) pour le replier ou le déplier. « Tout replier » agit sur tous les groupes.
- « Mes listes » se trie par date ou par ordre alphabétique (bouton en haut).
- Dans une liste de courses, « Trier la liste » propose « Par rayon » (« Par magasin » pour un magasin « Multi ») ou « Ordre alphabétique » : les articles sont alors à plat, sous « À acheter ». Le rayon de chaque article est gardé.
- Dans une liste de tâches, « Trier la liste » propose « Ordre alphabétique », « Par priorité » et « Par échéance », selon les options de la liste.
- Le tri choisi ne vaut que pour vous, sur ce téléphone : il ne change rien pour les autres, et il est permis en lecture seule.
- « X/Y » donne le nombre d'articles restants sur le total, sur chaque carte et en tête de chaque groupe.

<a id="recherche"></a>

### 6.7 Rechercher

- Dans une liste, tirez la liste vers le bas (ou remontez tout en haut) : le champ « Rechercher dans la liste » apparaît au-dessus du premier groupe. Il cherche dans le nom des articles, pas dans les notes.
- Sur « Mes listes », de la même façon, le champ « Rechercher une liste » cherche dans le titre des listes, celles partagées avec vous comprises.
- Majuscules et accents ne comptent pas : “eclair” trouve “Éclair”. Le texte trouvé est surligné, et le nombre de résultats s'affiche.
- Les articles cochés trouvés restent visibles, barrés, dans « Dans le panier ». Vous pouvez cocher, ouvrir ou supprimer un article depuis les résultats.
- La touche “rechercher” du clavier ferme le clavier et garde la recherche ; la croix ou « Effacer la recherche » la vide. Changer de liste ou quitter l'écran la vide aussi.
- La recherche ne change rien à la liste ni pour les autres. Elle marche hors ligne, et aussi en lecture seule.

<a id="reserver"></a>

### 6.8 Réserver un souhait, cotiser

Dans une liste d'envies, tout membre peut réserver un souhait, même en « Lecture seule », sauf la personne à qui la liste est destinée. Il faut du réseau.

- Touchez le souhait, puis « Réserver ». La ligne indique alors qui a réservé.
- En réservant, activez « Ouvert à d'autres » pour que d'autres puissent se joindre à un cadeau commun ; sinon, personne d'autre ne peut le réserver.
- Sur un souhait ouvert, « Participer » vous ajoute. « Quitter » vous retire ; quand le dernier participant s'en va, le souhait est de nouveau libre.
- Chaque participant peut ouvrir ou fermer la réservation avec « Ouvert à d'autres ».
- Listo dit seulement qui participe : ni montant, ni part, ni paiement.
- Modifier un souhait réservé ne retire pas la réservation.

<a id="nouveautes"></a>

### 6.9 Nouveautés

- Dans une liste partagée, Listo signale ce que les autres ont ajouté ou modifié depuis votre dernière visite. Vos propres actions et les suppressions ne sont jamais signalées.
- Sur « Mes listes », une pastille sur l'icône de la carte donne le nombre de nouveautés (“30+” après plus d'un mois d'absence).
- Dans la liste, chaque nouveauté est surlignée, avec qui l'a faite (“Ajouté par Marie”). Elle le reste pendant la visite, jusqu'à ce que vous touchiez la ligne ; en quittant la liste, tout est considéré comme vu, sur tous vos appareils.
- Menu ⋮ de la liste : « Ne plus me signaler cette liste », puis « Signaler cette liste » pour revenir. Chacun choisit pour lui, lecture seule comprise.
- « Mon compte », section « Nouveautés » : désactive tout signalement ; « Signaler les éléments cochés » (visible seulement quand « Nouveautés » est activé) ajoute ce que les autres cochent ou décochent.
- Il n'y a pas de notification. Sur certains téléphones, l'icône de l'application installée montre aussi leur total.

<a id="hors-ligne"></a>

### 6.10 Hors ligne et synchronisation

Sans réseau, vous pouvez continuer à ajouter, modifier et cocher. Les changements sont envoyés au retour du réseau.

La pastille en haut indique l'état : « À jour », « Synchronisation… » ou « Hors ligne », avec le nombre de changements en attente. Touchez-la pour synchroniser.

Le partage, le lien public, la duplication, « Quitter la liste », la corbeille, les réservations, la création d'un magasin ou d'un rayon et l'Administration demandent une connexion.

<a id="theme"></a>

### 6.11 Thème clair ou sombre

Réglages, « Mon compte », section « Apparence » : « Clair », « Sombre » ou « Auto » (comme le téléphone). Le choix vaut pour ce téléphone.

<a id="roles"></a>

## 7. Rôle par rôle

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

### 7.1 Admin

Réglages, « Administration » (visible seulement pour un Admin).

**Onglet « Comptes »**

- « Ajouter un compte » ([5.2 Créer les autres comptes](#creer-comptes)).
- Bouton ⋮ d'un compte : « Réinitialiser le mot de passe », « Désactiver la double authentification », « Désactiver le compte » ou « Réactiver le compte », « Supprimer le compte » s'il n'a jamais servi.
- Rôle : « Utilisateur » ou « Admin ». Il reste toujours au moins un Admin actif.

**Onglet « Courses »**

- « Magasins » : ajouter un magasin « Simple » ou « Multi » (qui regroupe d'autres magasins), renommer, désactiver, supprimer s'il n'a jamais été utilisé.
- « Rayons » : ajouter, renommer, désactiver, supprimer s'il n'a jamais été utilisé.
- « Articles » : la mémoire des noms saisis dans les listes de courses. « Corriger » change un nom partout, « Modifier le rayon » change le rayon habituel, « Retirer » l'enlève des suggestions.

**Peut / ne peut pas**

- Peut : gérer les comptes, les magasins, les rayons et les articles ; voir s'il existe une nouvelle version (Réglages › « À propos »).
- Ne peut pas : voir le contenu, le nom ou les membres des listes des autres. Un Admin voit une liste seulement si elle est partagée avec lui, avec le droit choisi par son propriétaire.
- Ne peut pas : voir les connexions Claude des autres comptes (mais désactiver un compte ou réinitialiser son mot de passe les coupe toutes).

<a id="creer"></a>

### 7.2 Propriétaire : créer une liste

Sur « Mes listes », touchez « Nouvelle liste ». Donnez un titre, choisissez le type de liste (« Courses », « Tâches » ou « Envies ») et une icône.

- Liste de courses : choisissez aussi le magasin. Les articles sont classés par rayon, ou par magasin pour un magasin « Multi ».
- Liste de tâches : « Options des éléments » active la priorité et l'échéance.
- « Après l'ajout » (toutes les listes) : « Rester sur la liste » pour enchaîner les ajouts, ou « Ouvrir la fiche » pour compléter aussitôt ce qui vient d'être ajouté. Au départ : « Rester sur la liste » pour une liste de courses, « Ouvrir la fiche » pour les autres.
- Si le magasin ou le rayon manque, « Nouveau magasin… » ou « Nouveau rayon… » le crée (connexion nécessaire).

<a id="modifier"></a>

### 7.3 Propriétaire : modifier la liste

Menu ⋮ de la liste, « Modifier la liste » : le titre, le type, le magasin, l'icône. Pour une liste de tâches, « Options des éléments » active ou non la priorité et l'échéance ; pour une liste d'envies, « Priorité ». « Après l'ajout » choisit entre « Rester sur la liste » et « Ouvrir la fiche ». Seul le propriétaire modifie la liste.

- Changer le type n'efface rien. Une liste de courses devenue liste de tâches cache ses rayons, son magasin et ses codes-barres ; une liste de tâches devenue liste de courses cache la priorité et l'échéance. Tout revient si la liste reprend son type d'origine. Le formulaire le rappelle avant l'enregistrement.
- La priorité (basse, normale, élevée) est désactivée au départ, pour une liste de tâches comme pour une liste d'envies. Tout le monde la voit. L'échéance n'existe que pour les listes de tâches.
- Devenir une liste d'envies, en revanche, est définitif ([7.5 Propriétaire : liste d'envies](#envies)).

<a id="partager"></a>

### 7.4 Propriétaire : partager et choisir les droits

« Modifier la liste », ligne « Partager avec » : une fenêtre s'ouvre avec une ligne par personne. Cochez une personne, puis choisissez son droit au bout de sa ligne. « OK » ferme la fenêtre ; le partage est enregistré avec « Enregistrer ».

- « Modifier » (droit « Peut modifier ») : la personne est contributeur ([7.8 Contributeur (« Peut modifier »)](#role-contributeur)).
- « Lire » (droit « Lecture seule ») : la personne peut seulement lire ([7.9 Lecture seule](#role-lecture)). C'est le choix de départ.
- Vous pouvez changer le droit ou retirer une personne à tout moment.

<a id="envies"></a>

### 7.5 Propriétaire : liste d'envies

Une liste d'envies rassemble des idées de cadeaux pour une personne, le bénéficiaire. Ses proches peuvent réserver un souhait ([6.8 Réserver un souhait, cotiser](#reserver)). La surprise est préservée : le bénéficiaire ne voit jamais qu'un souhait est réservé, ni par qui, ni combien de personnes participent, même si c'est lui qui a créé la liste ([7.11 Bénéficiaire d'une liste d'envies](#role-beneficiaire)).

- « Pour qui ? » se choisit à la création : « Moi », un autre compte, ou « Une personne sans compte » (un enfant, par exemple). Il ne change plus ensuite, et la liste ne change plus de type.
- Une liste de courses ou de tâches peut devenir une liste d'envies : dans « Modifier la liste », choisissez « Envies », puis « Pour qui ? ». C'est définitif, il faut du réseau, et rien n'est effacé : les quantités et échéances sont gardées sans être affichées, les éléments cochés deviennent « Reçus », et un lien public en cours est arrêté.
- Si la liste est pour un autre compte, cette personne en fait partie d'office, avec « Peut modifier » : elle ajoute ses souhaits elle-même.
- Un souhait a un nom, et si l'on veut un lien (« Ouvrir le lien »), un « Prix indicatif » en euros, une note et une photo.
- Cocher un souhait le range dans « Reçus » : seuls le bénéficiaire et le propriétaire le peuvent ; les réservations n'y sont plus affichées.
- Quand la liste est pour quelqu'un d'autre, son propriétaire voit qui participe et peut « Retirer » un participant ou « Libérer » le souhait (par exemple si quelqu'un a quitté la liste). Sur une liste « pour moi », personne ne peut retirer un participant parti ([8.9 Liste d'envies : un participant est parti](#faq-orphelin)).
- Une liste d'envies n'a pas de copie (« Dupliquer la liste » n'est pas proposé).

<a id="lien-public"></a>

### 7.6 Propriétaire : le lien public

« Partager par lien » (menu ⋮) crée une adresse que vous envoyez à une personne sans compte. Elle voit la liste en lecture seule ([7.10 Visiteur du lien public](#role-visiteur)).

- Durée : 1 heure, 24 heures, 7 jours, 30 jours, « Personnalisée » ou « Illimitée ». « Changer la durée » la modifie.
- « Protéger par mot de passe » : le mot de passe n'est affiché qu'une fois. Notez-le.
- « Arrêter le partage » rend le lien inutilisable tout de suite.
- Liste d'envies : le visiteur peut aussi réserver un souhait ou participer à un cadeau. Une réservation faite par le lien apparaît avec le prénom donné, suivi de “(lien public)” ; le propriétaire peut la retirer, comme celle d'un proche.

> **Attention** : Ne donnez pas le lien d'une liste d'envies à son bénéficiaire : s'il l'ouvre sans être connecté à Listo, il verra quels souhaits sont réservés (jamais par qui). Connecté, il ne voit rien des réservations.

<a id="corbeille"></a>

### 7.7 Propriétaire : dupliquer, supprimer, restaurer

- « Dupliquer la liste » crée une copie à votre nom, avec ou sans ses articles (tous décochés). La copie est privée : ni les personnes avec qui la liste est partagée, ni le lien public, ni les photos ne sont copiés.
- « Supprimer la liste » (menu ⋮) demande une confirmation, qui rappelle ce que contient la liste et avec qui elle est partagée. La liste disparaît alors pour tout le monde, et son lien public s'arrête.
- Une liste supprimée reste 30 jours dans votre « Corbeille des listes » (Réglages), puis elle est effacée pour de bon. Seul son propriétaire l'y voit ; chaque ligne indique dans combien de jours elle sera effacée.
- « Restaurer » la remet telle qu'elle était, pour toutes les personnes avec qui elle était partagée : éléments, droits de chacun, réglages, photos, réservations. Il faut du réseau. Son lien public ne revient pas : recréez-le si besoin.
- Le propriétaire ne quitte pas sa liste : il la supprime, ou la laisse.

<a id="role-contributeur"></a>

### 7.8 Contributeur (« Peut modifier »)

- Peut : cocher, ajouter, modifier et supprimer des articles et leur photo ([6. Au quotidien](#quotidien)) ; créer un magasin ou un rayon manquant ; « Dupliquer la liste » (la copie lui appartient) ; réserver sur une liste d'envies (sauf s'il en est le bénéficiaire).
- Ne peut pas : changer le titre, le type ou les options, partager, créer un lien public, supprimer la liste.

Quitter : menu ⋮, « Quitter la liste ». La liste disparaît de vos listes ; vos articles y restent. Le propriétaire pourra de nouveau la partager avec vous. Il faut du réseau.

<a id="role-lecture"></a>

### 7.9 Lecture seule

La carte de la liste et le haut de la liste portent la mention « Lecture seule ».

- Peut : lire la liste, ses articles et leurs photos (toucher une ligne ouvre son détail) ; trier et rechercher ; réserver un souhait d'une liste d'envies ; « Quitter la liste ».
- Ne peut pas : ajouter, cocher, modifier ou supprimer quoi que ce soit.

<a id="role-visiteur"></a>

### 7.10 Visiteur du lien public

Une personne sans compte ouvre le lien qu'on lui a envoyé, sans rien installer.

- Peut : lire la liste ; toucher un article pour ouvrir sa fiche (quantité, note en entier, rayon ou magasin, état coché, code-barres, photo à agrandir, priorité et échéance si elles sont activées).
- Liste d'envies : voir les souhaits (nom, note, lien, prix, priorité, photo) et ceux déjà reçus ; « Réserver » un souhait libre, « Participer » à un cadeau ouvert à d'autres, annuler sa participation. Son prénom lui est demandé une fois. Il voit seulement si un souhait est réservé, jamais par qui ni combien.
- Ne peut pas : modifier la liste, voir qui d'autre a réservé.
- Le lien peut demander un mot de passe, et il cesse de fonctionner à son expiration ou quand le propriétaire arrête le partage ([8.3 Un lien public ne marche plus](#faq-lien)).

<a id="role-beneficiaire"></a>

### 7.11 Bénéficiaire d'une liste d'envies

La personne à qui la liste d'envies est destinée ajoute ses souhaits (si elle a un compte) et les marque « Reçus ».

- Ne voit jamais : qu'un souhait est réservé, par qui, combien de personnes participent, ni « Ouvert à d'autres ». Ni dans la liste, ni dans les nouveautés, ni par Claude, ni sur la page du lien public quand elle est connectée.
- Ne peut pas réserver ses propres souhaits.
- Seule une personne qui a la main sur le serveur (fichiers de la base, sauvegardes) pourrait lire une réservation : ne donnez pas cet accès au bénéficiaire si la surprise compte.

<a id="faq"></a>

## 8. Questions fréquentes et dépannage

<a id="faq-hors-ligne"></a>

### 8.1 Je n'ai pas de réseau

Continuez : ajouter, modifier et cocher marchent hors ligne, et la pastille du haut compte les changements en attente ([6.10 Hors ligne et synchronisation](#hors-ligne)). Ils partent tout seuls au retour du réseau. Le partage, le lien public, la corbeille et les réservations attendent le réseau.

<a id="faq-photo"></a>

### 8.2 Une photo ne s'envoie pas

- Sans réseau, la photo attend le retour du réseau.
- Le message « Photo trop lourde. » : il manque la ligne `client_max_body_size 5m;` dans Nginx Proxy Manager ([4.4 Régler Nginx Proxy Manager](#npm)).

<a id="faq-lien"></a>

### 8.3 Un lien public ne marche plus

Il a expiré, ou son propriétaire l'a arrêté, ou la liste a été supprimée (restaurer une liste ne fait pas revenir son lien). Demandez un nouveau lien au propriétaire ([7.6 Propriétaire : le lien public](#lien-public)). S'il demande un mot de passe, c'est celui que le propriétaire a noté à sa création.

<a id="faq-claude"></a>

### 8.4 Claude ne voit pas un outil ou une liste

- Après une mise à jour de Listo, Claude peut garder l'ancienne liste de ses outils : ouvrez une nouvelle conversation, ou déconnectez puis reconnectez le connecteur dans Claude.
- Une liste manque : la connexion n'autorise peut-être que certaines listes, ou vous n'en êtes plus membre. Reconnectez Claude avec « Toutes mes listes » ([3.7 Connecter Claude](#claude-connecter)).
- Claude refuse d'écrire : la connexion est en « Lecture seule », ou vous n'avez que le droit « Lecture seule » sur cette liste.
- Plus rien ne marche : la connexion a pu être coupée (mot de passe changé, « Déconnecter »). Voyez « Connexions Claude » ([3.8 Voir et déconnecter Claude](#claude-connexions)).

<a id="faq-retard"></a>

### 8.5 Les changements arrivent avec une minute de retard

Il manque les lignes `proxy_buffering off;`, `proxy_cache off;` et `proxy_read_timeout 3600s;` dans Nginx Proxy Manager ([4.4 Régler Nginx Proxy Manager](#npm)).

<a id="faq-blanc"></a>

### 8.6 Écran blanc ou application figée

- Fermez Listo et rouvrez-le avec du réseau : il prend la dernière version. Si le bandeau « Nouvelle version disponible » reste affiché, touchez « Recharger ».
- Sinon : Réglages, « Mon compte », « Réinitialiser les données de ce téléphone » (les modifications en attente sont gardées).
- En dernier recours, effacez les données du site dans le navigateur (Chrome : cadenas à gauche de l'adresse, “Paramètres du site”, “Effacer les données” ; iPhone : Réglages, Safari, Avancé, Données des sites web), puis reconnectez-vous.
- Android, application installée, bas de l'écran caché par la barre de navigation : fermez complètement l'application puis rouvrez-la ; sinon désinstallez-la et réinstallez-la (attendez « À jour » avant, pour ne rien perdre).
- Tous les téléphones sont touchés : la personne qui gère le serveur regarde `docker logs listo` et `https://listo.exemple.fr/healthz` ([9.8 Journaux](#journaux)).

<a id="faq-connexion"></a>

### 8.7 Je ne peux pas me connecter

- « Trop d'essais » : 5 mauvais mots de passe bloquent la connexion 15 minutes. Attendez, ou la personne qui gère le serveur redémarre Listo (`docker compose restart`).
- « Requête refusée : origine inconnue. » : l'adresse tapée n'est pas exactement celle de `LISTO_PUBLIC_URL` (autre sous-domaine, `http` au lieu de `https`) ([4.2 Le dossier et docker-compose.yml](#dossier)).
- Mot de passe oublié, téléphone perdu : [5.7 Mot de passe oublié, téléphone perdu](#oubli).
- Le mode hors ligne ou l'installation sur l'écran d'accueil ne marchent pas : Listo n'est pas ouvert en HTTPS. Passez toujours par `https://listo.exemple.fr`, jamais par `http://IP:13300`.

<a id="faq-suggestion"></a>

### 8.8 Une faute de frappe revient dans les suggestions

L'Admin : Réglages, « Administration », onglet « Courses », « Articles ». Cherchez le nom et « Corriger » : Listo dit combien d'articles et dans combien de listes de courses il sera corrigé, puis le corrige partout (s'il existe déjà, les deux sont réunis). « Retirer » l'enlève seulement des suggestions, sans toucher aux listes. Un nom corrigé ou retiré peut revenir si quelqu'un le saisit de nouveau.

<a id="faq-orphelin"></a>

### 8.9 Liste d'envies : un participant est parti

Un proche a réservé, puis a quitté la liste ou son compte a été désactivé : il reste participant. Sur une liste créée pour quelqu'un d'autre, le propriétaire le voit et peut le « Retirer », ou « Libérer » tout le souhait. Sur une liste “pour moi”, personne ne le peut (le propriétaire est le bénéficiaire et ne voit pas les réservations, c'est voulu) : les autres participants peuvent seulement ouvrir ou fermer la réservation. Si le proche a seulement été désactivé, l'Admin peut le réactiver le temps qu'il « Quitte » ; sinon, supprimez le souhait puis recréez-le.

<a id="serveur"></a>

## 9. Gérer le serveur

*Pour la personne qui gère le serveur.*

<a id="sauvegardes"></a>

### 9.1 Sauvegardes

- Chaque nuit vers 3 h (heure de `TZ`), Listo copie sa base dans `data/backups/` (`listo-AAAA-MM-JJ-HHMM.db`), vérifie que la copie est intacte et garde les 14 dernières. Chaque copie, réussie ou ratée, est notée dans le journal (`sauvegarde_reussie` ou `sauvegarde_ratee`). Une copie ratée n'arrête pas Listo.
- Sauvegarde à la demande, avant une mise à jour par exemple (`-u node` est important : la copie doit appartenir à Listo, comme celles de la nuit) :

```sh
docker exec -u node listo node server/backup-now.js
```

La copie de la nuit ne contient ni les photos (`data/photos/`), ni le journal (`data/journal.log`), ni la clé `secrets/secret.key` (volontairement : une copie de la base seule ne permet pas de lire les secrets de double authentification). Sauvegardez donc le dossier `/opt/listo/data` entier avec la sauvegarde habituelle du serveur, et gardez la clé à part ([4.6 Garder la clé secrète](#cle)).

<a id="restauration"></a>

### 9.2 Restaurer une sauvegarde

Pour revenir à l'état d'une nuit précédente (erreur, base abîmée, nouveau serveur) :

1. Aller dans le dossier de Listo : `cd /opt/listo`
2. Arrêter Listo : `docker compose stop`
3. Par précaution, mettre la base actuelle de côté : `mv data/listo.db data/listo-avant-restauration.db`
4. Supprimer les deux petits fichiers de travail de l'ancienne base, s'ils existent : `rm -f data/listo.db-wal data/listo.db-shm`
5. Choisir la copie (`ls data/backups`) et la mettre à la place de la base : `cp data/backups/listo-2026-10-17-0300.db data/listo.db`
6. La clé : `secrets/secret.key` doit être celle d'avant. Sur un serveur neuf, recréer le fichier avec la ligne gardée dans le gestionnaire de mots de passe : `mkdir -p secrets && nano secrets/secret.key`.
7. Les photos : sur un serveur neuf, remettre aussi le dossier `data/photos` depuis la sauvegarde du serveur.
8. Redémarrer : `docker compose up -d` (Listo remet tout seul les bons droits sur les fichiers).
9. Vérifier : `docker logs listo` (pas d'erreur, pas de code de démarrage : les comptes existent), puis se connecter. Ce qui a été fait après la nuit choisie est perdu.

Quand tout va bien, `data/listo-avant-restauration.db` peut être supprimé. Une sauvegarde plus ancienne que la version de Listo se restaure de la même façon : au redémarrage, Listo lui applique tout seul les mises à jour de la base qui lui manquent ([9.6 Mises à jour qui changent la base](#migrations)).

<a id="mises-a-jour"></a>

### 9.3 Mettre à jour Listo

Chaque fusion sur `main` publie une nouvelle image `ghcr.io/magicgg91/listo`. Pour la prendre :

```sh
cd /opt/listo
# sauvegarde juste avant
docker exec -u node listo node server/backup-now.js
# télécharge la nouvelle version, puis redémarre Listo avec elle
docker compose pull
docker compose up -d
# vérifier le démarrage
docker logs listo
```

Listo s'arrête proprement : une mise à jour n'abîme rien, et la base est mise à jour toute seule au démarrage si besoin.

Les téléphones prennent la nouvelle version tout seuls, sans réinstaller l'application :

- dès que Listo est au premier plan avec du réseau (ouverture, retour dans l'application, ou au bout d'une heure au plus), le téléphone voit que son code est ancien ;
- il recharge la page au premier moment sûr, avec le message « Mise à jour de Listo… » : aucune fenêtre ouverte, aucun texte en cours de saisie, aucun envoi en cours ;
- sinon, un bandeau « Nouvelle version disponible » propose « Recharger » ;
- rien n'est perdu : les modifications pas encore envoyées repartent après le rechargement.

<a id="version"></a>

### 9.4 Savoir qu'une nouvelle version existe

Dans Réglages › « À propos », sur la ligne de la version, l'Admin voit l'état de la vérification :

- « À jour » : l'image installée est la dernière construite ;
- “Vérifié il y a 15 min”, avec une pastille « Nouvelle version » suivie de son numéro (par exemple “Nouvelle version : 9f8e7d6”) : une image plus récente existe ([9.3 Mettre à jour Listo](#mises-a-jour)) ;
- « Vérification impossible » : GitHub n'a pas répondu. Sans conséquence : Listo marche normalement ;
- le bouton d'actualisation, au bout de la ligne, refait la demande tout de suite (une fois par minute au plus).

C'est le serveur (pas le téléphone) qui demande à GitHub, au plus une fois par heure, sans compte ni jeton, quel est le dernier commit dont l'image a été construite. Listo ne se met jamais à jour tout seul. Les autres comptes ne voient que la version. Pour couper la vérification : `LISTO_UPDATE_CHECK=off` dans `docker-compose.yml` (la ligne est déjà prête, en commentaire), puis `docker compose up -d`.

<a id="revenir"></a>

### 9.5 Revenir à la version précédente

1. Sur GitHub, page du dépôt, “Packages”, `listo` : chaque version a une étiquette `sha-xxxxxxx` (les 7 premiers caractères du commit).
2. Dans `docker-compose.yml`, remplacer `ghcr.io/magicgg91/listo:latest` par `ghcr.io/magicgg91/listo:sha-xxxxxxx`.
3. `docker compose up -d`.
4. Si la nouvelle version avait changé la base, restaurer aussi la sauvegarde faite juste avant la mise à jour ([9.2 Restaurer une sauvegarde](#restauration) et [9.6 Mises à jour qui changent la base](#migrations)).

Pour revenir ensuite aux mises à jour normales, remettre `:latest`.

<a id="migrations"></a>

### 9.6 Mises à jour qui changent la base

Certaines versions modifient la base une seule fois, toutes seules, au démarrage (migrations numérotées). Rien n'est à faire à la main, mais faites toujours la sauvegarde à la demande juste avant : pour revenir en arrière, il faut restaurer cette sauvegarde et reprendre l'image précédente ([9.5 Revenir à la version précédente](#revenir)). Celles qui ont suivi les onze étapes de départ :

| Migration | Ce qui change | Effet sur les listes existantes |
| --- | --- | --- |
| 8 | La mémoire des noms est réservée aux listes de courses. | Les noms venus seulement des listes de tâches sont retirés des suggestions. Les listes ne changent pas. |
| 9 | Date du coché (« Dans le panier », « Terminés »). | Les articles déjà cochés reçoivent leur date de modification. |
| 10 | Priorité et échéance des éléments. | Les éléments existants sont en priorité normale, sans échéance. |
| 11 | Code-barres des articles. | Les articles existants n'ont pas de code. |
| 12 | Droit de chaque personne sur une liste partagée. | Les personnes déjà membres gardent « Peut modifier » ; une personne ajoutée ensuite commence en « Lecture seule ». |
| 13 | Priorité et échéance activées liste par liste. | Les listes existantes autres que les courses gardent les deux activées ; une nouvelle liste les a désactivées. |
| 14 | Une icône pour chaque liste. | Les listes existantes gardent l'icône de leur catégorie. |
| 15 | « Après l'ajout », liste par liste. | Les listes de courses restent sur la liste ; une autre liste ouvre la fiche si sa priorité ou son échéance est activée. Une ligne “Migration 15” dans `docker logs listo` donne les nombres. |
| 16 | Nouveautés. | Rien n'est signalé au départ : chaque membre est posé sur “tout vu”. Le journal des nouveautés ne garde que des identifiants et se nettoie seul (30 jours, 500 événements par liste). |
| 17 | Accès depuis Claude : tables de l'autorisation (codes et jetons gardés seulement sous forme d'empreinte). | Aucun : les tables partent vides. |
| 18 | Types de liste « Courses » et « Tâches » à la place des catégories. | Une liste de catégorie “courses” devient une liste de courses, toutes les autres des listes de tâches. Rien n'est effacé. L'image précédente marche encore sans restauration. |
| 19 | Listes d'envies (bénéficiaire, lien, prix, réservations). | Aucun : tout part vide. L'image précédente ne connaît pas les listes d'envies. |
| 20 | Réservations par le lien public (prénom du visiteur, empreinte de son jeton). | Aucun : la table part vide ; un souhait qui paraissait réservé sans plus avoir de participant redevient libre. |
| 21 | Claude : troisième niveau d'accord. | Aucun : chaque connexion garde son niveau, ses listes et ses jetons. |
| 22 | Claude : retour à deux niveaux, « Lecture seule » et « Lecture et écriture ». | Aucun : chaque connexion garde ses listes et ses jetons ; celles du niveau intermédiaire deviennent « Lecture et écriture ». |

La mise à jour qui a apporté les cookies `__Host-` a déconnecté tout le monde une fois ; les listes n'ont pas été touchées.

<a id="surveillance"></a>

### 9.7 Surveiller les mises à jour de sécurité

Dependabot (`.github/dependabot.yml`) vérifie chaque semaine s'il existe une nouvelle version des bibliothèques du serveur (express, better-sqlite3, qrcode), de l'image de base du Dockerfile (`node:24-slim`) et des actions qui construisent l'image. S'il en trouve une, il ouvre une pull request vers `main` (3 au plus par type). Rien n'est fusionné tout seul.

- Le titre dit quoi passe de quelle version à quelle version ; une mention “security” ou un identifiant CVE dans la description signale une faille corrigée : à fusionner en priorité.
- Une montée de version majeure (4.x vers 5.x) peut changer un comportement : en cas de doute, demandez une vérification avant de fusionner.
- De temps en temps, dans une copie du dépôt : `npm audit --omit=dev` (“found 0 vulnerabilities” : tout va bien).
- Version de Node : Dependabot ne propose que les correctifs de `node:24-slim`. Pour changer de version, à la main : ligne `FROM` du `Dockerfile` (version et empreinte `sha256`), `npm test`, puis essai avec `docker compose -f docker-compose.dev.yml up --build`. Seulement une version paire (24, 26…).

<a id="journaux"></a>

### 9.8 Journaux

- `docker logs listo` : démarrage, erreurs, et le journal de sécurité (lignes `[journal]`). Pour suivre en direct : `docker logs -f listo`.
- `data/journal.log` : le même journal de sécurité, gardé dans un fichier (1 Mo au plus, puis `journal.log.1` à `.5`).
- Santé : `https://listo.exemple.fr/healthz` répond `{"status":"ok"}`.

Le journal de sécurité note les connexions réussies et ratées, les blocages après trop d'essais, les actions d'administration, les liens publics (créés, modifiés, arrêtés, mots de passe refusés), les sauvegardes et les appels de Claude. Il ne contient jamais de mot de passe, de jeton, de code, ni le contenu d'une liste ; aucune ligne n'y est écrite pour une réservation.

Listo ne démarre pas : `docker logs listo` donne la raison en français.

<a id="secours"></a>

### 9.9 Compte Admin perdu

S'il y a un autre Admin, il utilise « Réinitialiser le mot de passe » ([7.1 Admin](#role-admin)). Sinon, sur le serveur (remplacer `identifiant` par celui du compte) :

```sh
docker exec -u node listo node server/admin-secours.js identifiant
```

Un mot de passe provisoire s'affiche une fois : se connecter avec, puis en choisir un nouveau. Si la double authentification est aussi inutilisable, ajouter `--retirer-2fa` à la fin de la commande. Les connexions Claude du compte sont coupées.

<a id="cle-perdue"></a>

### 9.10 Clé secrète perdue

Sans copie de `secrets/secret.key`, Listo crée une nouvelle clé au démarrage. Les listes, articles, photos et mots de passe ne sont pas touchés, mais :

- les doubles authentifications ne se lisent plus : l'Admin la désactive pour les autres comptes (« Désactiver la double authentification »), pour lui-même avec la commande de secours et `--retirer-2fa` ([9.9 Compte Admin perdu](#secours)), puis chacun la réactive ;
- les liens publics déjà créés marchent encore, mais leur adresse ne peut plus être réaffichée : les arrêter et en créer de nouveaux ;
- gardez cette fois une copie de la nouvelle clé ([4.6 Garder la clé secrète](#cle)).

<a id="scan-serveur"></a>

### 9.11 Mode scan : Open Food Facts

Le mode scan ([6.4 Scanner un code-barres](#scan)) demande le nom d'un produit à Open Food Facts, une base libre de produits alimentaires. Il faut que le serveur puisse joindre `https://world.openfoodfacts.org` (HTTPS, port 443, en sortie). Sans cet accès, rien ne casse : Listo propose de taper le nom.

**Ce qu'Open Food Facts apprend**

L'adresse IP publique du serveur, les codes-barres demandés avec leur heure, et l'en-tête `User-Agent: Listo/0.1.0 (+https://github.com/magicgg91/listo)`, plus le contact de `LISTO_PRODUCT_CONTACT` s'il est renseigné. Rien sur les personnes : ni compte, ni nom de liste, ni l'adresse des téléphones.

**Ce que Listo fait pour limiter cela**

- seul le numéro du code part, et seulement s'il est valide (8, 12 ou 13 chiffres avec une clé de contrôle juste) ;
- un code déjà porté par un article de vos listes n'est jamais demandé ; les codes “en 2” (articles pesés par le magasin, avec souvent un prix) non plus ;
- chaque réponse est gardée en mémoire (500 produits au plus, 7 jours pour un produit trouvé, 1 jour pour un inconnu, tout s'efface au redémarrage) ;
- 30 recherches par minute et par compte, 10 demandes par minute au total vers Open Food Facts ;
- délai de 5 secondes, réponse de 32 ko au plus, aucune redirection suivie ;
- ni le code ni le nom ne sont écrits dans les journaux ; une panne écrit seulement une ligne du genre “Recherche de produit impossible : délai dépassé”.

Licence : les noms viennent d'Open Food Facts, sous licence ODbL ; la mention apparaît dans la fiche du produit et dans Réglages › « À propos ». Pour couper le mode scan : `LISTO_PRODUCT_LOOKUP=off` dans `docker-compose.yml` (la ligne est déjà prête, en commentaire), puis `docker compose up -d`.

Le lecteur de codes-barres (environ 1 Mo, livré avec Listo) n'est envoyé au téléphone qu'au premier scan, puis gardé : le scan marche ensuite hors ligne (le nom, lui, demande du réseau).

À vérifier une fois en production (le vrai service n'a pas pu être joint pendant le développement) : un produit courant donne son nom en français ; un produit non alimentaire donne “Produit inconnu” ; `docker logs listo` ne montre aucune ligne “Recherche de produit impossible”.

<a id="mcp-serveur"></a>

### 9.12 Claude : activer l'accès

L'accès depuis Claude ([3. Claude et Listo](#claude)) est désactivé par défaut. Pour l'activer, ajoutez `- LISTO_MCP=on` dans la partie `environment:` de `docker-compose.yml`, puis `docker compose up -d`. Pour le couper : retirez la ligne, puis `docker compose up -d` ; toutes ses adresses répondent alors 404, et les connexions accordées ne servent plus (elles reviennent si l'on réactive, tant qu'elles n'ont pas expiré). Aucun mot de passe ni aucune clé n'est à fournir.

Nginx Proxy Manager : rien à régler. Le sous-domaine doit avoir une adresse IPv4 (enregistrement DNS “A”) : Claude ne passe pas par IPv6. Ces adresses doivent rester joignables depuis Internet : Claude les appelle depuis les serveurs d'Anthropic, Claude Code depuis votre ordinateur. Si un pare-feu filtre les connexions entrantes, ne recopiez pas une plage d'adresses trouvée ailleurs : Anthropic publie la liste à jour des adresses d'où partent ces appels sur sa page officielle [“IP addresses”](https://platform.claude.com/docs/en/api/ip-addresses), section “Outbound IP addresses” (en anglais), et peut la faire évoluer.

| Adresse | Qui l'appelle | Rôle |
| --- | --- | --- |
| `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource` | Claude | Dit où demander l'autorisation. |
| `/.well-known/oauth-authorization-server` | Claude | Description du serveur d'autorisation. |
| `/oauth/authorize` | votre navigateur | Vérifie la demande, puis ouvre l'écran « Autoriser Claude ». |
| `/oauth/token`, `/oauth/revoke`, `/oauth/register` | Claude | Jetons, révocation, enregistrement automatique. |
| `/mcp` | Claude | Le serveur MCP : exige un jeton obtenu par l'autorisation ; sans jeton valable, refus (401). |

<a id="mcp-regles"></a>

### 9.13 Claude : règles et journal

- Jeton d'accès : 1 heure ; jeton de renouvellement : 30 jours glissants, remplacé à chaque usage ; un ancien jeton présenté de nouveau fait tomber toute la connexion. La base ne garde que l'empreinte des jetons, jamais les jetons eux-mêmes.
- Un jeton Claude n'ouvre rien d'autre que `/mcp` : ni l'application, ni ses autres adresses.
- Changer son mot de passe, ou un compte désactivé ou dont le mot de passe est réinitialisé (y compris par la commande de secours) : toutes ses connexions Claude sont révoquées.
- Les plafonds ([3.6 Limites](#claude-limites)) sont comptés en mémoire : ils repartent de zéro au redémarrage du conteneur.
- L'Admin ne voit pas les connexions des autres. En secours, il désactive le compte ou réinitialise son mot de passe. Pour tout le monde d'un coup : retirer `LISTO_MCP=on`.

Journal de sécurité (jamais un jeton, un code ni le contenu d'une liste) : `claude.connexion`, `claude.refus`, `claude.revocation`, `claude.renouvellement`, `claude.enregistrement`, `claude.client_refuse`, `claude.outil` (une ligne par appel d'outil, avec le nombre d'éléments, jamais un nom saisi), `claude.jeton_refuse`, `claude.origine_refusee`.

<a id="mcp-essai"></a>

### 9.14 Claude : premier essai

Après l'activation, une fois, avant tout usage régulier :

1. Dans un navigateur : `https://listo.exemple.fr/.well-known/oauth-protected-resource/mcp` affiche un petit texte avec `"resource": "https://listo.exemple.fr/mcp"`.
2. Connecter Claude ([3.7 Connecter Claude](#claude-connecter)).
3. Demander à Claude “Quelles sont mes listes Listo ?”, puis “Qu'y a-t-il dans les courses ?” : les réponses doivent correspondre à l'application. Avec « Lecture et écriture » : “Ajoute du lait aux courses”, “Coche le pain” ; sur un téléphone ouvert sur la liste, les changements arrivent en direct.
4. `docker logs listo` : des lignes `claude.connexion` et `claude.outil`, aucune erreur. Signaler les lignes `claude.origine_refusee` ou `claude.client_refuse` s'il y en a.
5. Plus d'une heure plus tard, reposer une question : elle doit marcher sans nouvelle autorisation.
6. En cas de problème : retirer `LISTO_MCP=on`, `docker compose up -d`, et transmettre les lignes `claude.` du journal (elles ne contiennent ni jeton ni contenu de liste).
