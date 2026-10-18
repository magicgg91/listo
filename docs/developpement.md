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
- [Groupes repliables (toutes les listes)](#groupes-repliables-toutes-les-listes)
- [Glissement vers la gauche (« Supprimer »)](#glissement-vers-la-gauche--supprimer-)
- [Droit par personne (« Peut modifier » ou « Lecture seule »)](#droit-par-personne--peut-modifier--ou--lecture-seule-)
- [Priorité et échéance activées ou non (migration 13)](#priorité-et-échéance-activées-ou-non-migration-13)
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
| `server/events.js` | Temps réel : flux SSE `/api/events`, connexions ouvertes, messages « la liste X a changé » |
| `server/photos.js` | Photos des articles : contrôle du fichier JPEG (sans bibliothèque), retrait des métadonnées, stockage dans `data/photos`, plafond d'envois |
| `server/backup.js` | Sauvegarde nocturne de la base (VACUUM INTO, contrôle, 14 copies, droits 600) |
| `server/backup-now.js`, `server/admin-secours.js` | Commandes à lancer sur le serveur : sauvegarde à la demande ; mot de passe provisoire (et retrait de la 2FA) quand plus personne ne peut se connecter |
| `server/shares.js` | Lien public d'une liste : jeton (jamais stocké en clair), mot de passe généré, contrôle de validité à chaque requête, cookies de consultation, nettoyage |
| `server/pages/` | Les deux pages HTML du lien public : la page de la liste (sans aucune donnée) et la page unique « Lien expiré ou inexistant » |
| `public/js/history.js`, `public/js/sorting.js` | Règles partagées entre le serveur et le téléphone : nom normalisé, autocomplétion, rayon et magasin habituels, mise à jour de l'historique, tri des articles (par rayon ou par magasin ; listes autres que les courses : alphabétique, par priorité avec groupes, par échéance) |
| `server/routes/` | Routes de l'API : `auth.js` (connexion), `me.js` (mon compte), `lists.js` (listes et articles), `photos.js` (photos), `shares.js` (lien public, côté propriétaire), `public.js` (lien public, côté visiteur sans compte), `products.js` (mode scan : nom d'un produit), `admin.js` (administration : `admin-users.js` pour les comptes, `admin-references.js` pour catégories, magasins et rayons, `admin-names.js` pour les noms enregistrés) |
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
| `public/js/app-height.js` | Hauteur de l'application : mesure la hauteur visible, l'écrit dans `--app-h` et la remesure au retour dans l'application (voir « Hauteur remesurée au retour ») |
| `public/js/photo.js` | Réduction d'une photo sur le téléphone avant l'envoi (1 280 px, JPEG) ; bouton qui ouvre le sélecteur d'images du téléphone |
| `public/js/swipe.js` | Glissement d'une ligne vers la gauche (raccourci « Supprimer ») : décision du geste et contrôleur tactile (voir « Glissement vers la gauche » ci-dessous) |
| `public/js/public.js` | Page publique d'une liste (lien `/p/…`) : saisie du mot de passe, liste en lecture seule, photo agrandie. N'utilise ni service worker ni stockage |
| `public/js/store.js` | Copie locale des données et calculs (tri d'une liste autre que les courses, choix gardé par liste sous la clé `listo-tri-liste-<id>` ; cartes de « Mes listes » et leur tri : plus récentes d'abord ou ordre alphabétique, choix gardé sur le téléphone sous la clé `listo-tri-listes` ; liste groupée par rayon ou par magasin, suggestions, magasins proposés) |
| `public/js/format.js` | Mise en forme des textes (dates relatives, « 3 articles restants » / « 3 éléments restants »…) |
| `public/js/words.js` | Vocabulaire : « article » dans une liste de courses, « élément » dans les autres listes. Tous les textes qui nomment une ligne de la liste passent par lui |
| `public/js/dom.js`, `public/js/ui.js`, `public/js/theme.js` | Fabrication des éléments de la page (jamais `innerHTML`), feuilles, menus, messages, thème clair/sombre/auto |
| `public/js/screens/` | Un fichier par écran : `login.js` (connexion), `lists.js` (Mes listes et colonne de gauche sur ordinateur, avec le bouton de tri ; sur téléphone, pastille d'état dans la barre du haut), `list.js` (une liste et la feuille Article), `scan.js` (bouton « Scanner » et feuille « Scanner un produit », listes de courses), `list-form.js` (créer ou modifier une liste, avec le droit de chaque personne : `accessChoice`), `list-actions.js` (actions d'une liste, les mêmes dans le menu « ⋯ » d'une carte et le menu ⋮ de la liste : « Modifier la liste », « Partager par lien », « Supprimer la liste » avec sa confirmation), `share.js` (feuille « Partager par lien »), `settings.js` (réglages, mot de passe, 2FA), `account.js` (Mon compte : sécurité, apparence, ce téléphone), `admin.js` (administration) |
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
3. **Clavier du téléphone** : aucun écran ni aucune fenêtre n'ouvre le clavier de lui-même ; il ne s'ouvre que quand on touche un champ (connexion, code, édition en ligne, page publique comprises). Dans une liste de courses, toucher le champ, taper un article puis la touche Entrée : l'article est ajouté, le clavier se replie, aucun champ n'a plus le curseur et l'article apparaît brièvement mis en évidence (même chose avec le bouton +, une suggestion, ou le mode scan, qui se ferme avec « Ajouté : … »). Dans une liste de tâches, le clavier reste ouvert pour l'élément suivant. Fermer une feuille (croix, Retour du téléphone, Enregistrer) ou changer d'écran replie aussi le clavier. Le clavier ne cache pas le champ d'ajout. En touchant le champ du code à 6 chiffres, le clavier numérique s'ouvre. Le test `test/focus.test.js` refuse tout `.focus()`, `.select()` ou `autofocus` sur un champ de saisie.
4. **Pouce en bas de l'écran** : le champ d'ajout et les boutons principaux (Nouvelle liste, Enregistrer…) sont en bas, atteignables d'une main. Les cases à cocher se touchent facilement sans cocher la ligne voisine. Rien ne passe sous la barre système (Android, barre à 3 boutons ou gestes) ni sous l'indicateur d'accueil (iPhone) : le bouton « Nouvelle liste » est entièrement visible, la dernière liste de « Mes listes » et la dernière ligne de l'Administration s'affichent au-dessus quand on fait défiler jusqu'en bas. La page s'affiche sous ces barres (`viewport-fit=cover`) : tout ce qui est collé en bas ajoute `env(safe-area-inset-bottom)` (vérifié par `test/safe-area.test.js`). Sur Android, `viewport-fit=cover` est retiré (voir « Android : barre de navigation » ci-dessous) : à vérifier dans l'application installée, barre à 3 boutons et mode gestes.
5. **Bouton Retour du téléphone** : une feuille ouverte (article, choix du rayon) se ferme sans quitter la liste ; depuis une liste, Retour ramène à « Mes listes ».
6. **Réseau coupé** (mode avion) : voir la liste « Hors ligne » au point 11.
7. **Ordinateur** (fenêtre d'au moins 1024 px de large) : « Mes listes » à gauche, la liste choisie au centre.
8. **Magasin « multi »** (étape 6) : Administration → Magasins, créer un magasin « Multi » et cocher ses magasins ; créer une liste de courses avec ce magasin. Ajouter un article nouveau : son magasin est demandé ; l'ajouter une deuxième fois : il retrouve son magasin sans question. En faisant défiler, l'en-tête du magasin reste collé en haut.
9. **Photo d'un article** (étape 7, en HTTPS) : dans la feuille d'un article, un seul bouton « Ajouter une photo » (« Changer la photo » quand il y en a une) ouvre le sélecteur d'images du téléphone, qui propose lui-même l'appareil photo ou la photothèque (Listo n'ajoute aucun menu). La photo reste facultative : un article s'enregistre sans. Une photo prise en portrait reste dans le bon sens. Elle apparaît en vignette sur la ligne ; un appui l'agrandit, le bouton Retour la referme. Sur l'autre téléphone, elle apparaît toute seule (temps réel).
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
14. **Mode scan** (listes de courses, en HTTPS) : voir la liste « [À tester sur les téléphones](#à-tester-sur-les-téléphones) » de la section « Mode scan ».
15. **Groupes repliables** : dans une liste de courses, toucher l'en-tête « Fruits et légumes » : ses articles se cachent, le chevron se tourne vers la droite et « · 2 à acheter » apparaît. Fermer et rouvrir Listo : le rayon est toujours replié (sur ce téléphone seulement ; l'autre téléphone garde son propre choix). « Tout replier » (en haut à droite, à partir de deux groupes) replie aussi « Dans le panier » ; il devient « Tout déplier ». Ajouter un article dans un rayon replié : le rayon se déplie. Cocher, scanner, ou un ajout fait depuis l'autre téléphone : l'état et la position de défilement ne bougent pas. Liste de tâches : en ordre alphabétique ou par échéance, pas d'en-tête ; triée par priorité, les groupes se replient aussi (« · 1 à faire »).
16. **Réglages › À propos** (Admin) : sur une ligne, « Version : 7025130 » à gauche, puis à droite « À jour · il y a 4 min » (ou « Vérifié il y a 4 min ») et le bouton d'actualisation, collé au texte. Quand une nouvelle version existe, une seconde ligne montre seulement « Nouvelle version : <commit> » (touchée, elle ouvre ce commit sur GitHub). Sur un petit téléphone (largeur 360, texte agrandi), le texte et le bouton passent ensemble sous la version, sans rien couper.
17. **Fiche d'un article** (liste de courses) : « Quantité (par exemple 2 ou 500 g) » et « Code-barres (8, 12 ou 13 chiffres) », l'aide en petit et en gris à côté du titre, plus de ligne d'aide sous les champs. Le champ Code-barres a, à droite sur la même ligne, le bouton de scan (icône) ; une petite croix apparaît dans le champ dès qu'il contient quelque chose : la toucher le vide sans ouvrir le clavier. Un code long ne passe pas sous la croix.
18. **En-tête de la fiche d'un article** : à droite du titre, la poubelle (rouge), un espace, la coche bleue « Enregistrer », la croix. La coche enregistre et ferme (la touche Entrée d'un champ aussi), sans laisser le clavier ouvert. La poubelle supprime tout de suite ; en bas, « « Pain » supprimé · Annuler » quelques secondes : « Annuler » remet l'article. En faisant défiler une fiche longue (avec une photo), l'en-tête reste visible.
19. **Glisser pour supprimer** (iPhone et Android, application installée et navigateur) : sur une ligne, glisser le doigt vers la gauche : la ligne suit le doigt et une zone rouge « Supprimer » apparaît. Lâcher après un petit glissement : la ligne revient ; après un grand glissement : elle reste ouverte. Toucher « Supprimer » : la ligne disparaît, « « Pain » supprimé · Annuler » en bas ; « Annuler » la remet. Vérifier aussi : faire défiler la liste normalement (rien ne s'ouvre, une ligne ouverte se referme), glisser en diagonale (la liste défile), toucher une autre ligne ou glisser vers la droite (la ligne ouverte se referme), toucher la case et la vignette (inchangé). Sur iPhone, dans Safari, le geste « retour » depuis le bord gauche de l'écran fonctionne toujours. En mode avion : la suppression attend le réseau, puis part.
20. **Menu « ⋯ » d'une carte** (« Mes listes ») : sur une liste dont vous êtes propriétaire, le bouton « ⋯ » dans le coin de la carte ouvre un petit menu juste en dessous, sans ouvrir la liste : « Modifier la liste », « Partager par lien », puis, après un trait, « Supprimer la liste » (en rouge). Toucher ailleurs sur la carte ouvre la liste ; toucher à côté du menu le ferme. « Modifier la liste » puis la croix ou « Enregistrer » : retour à « Mes listes », carte à jour. « Partager par lien », créer un lien, fermer : retour à « Mes listes », la carte porte la petite icône de lien. « Supprimer la liste » demande « Supprimer la liste « Courses » ? » ; après « Supprimer », la carte disparaît (aussi sur l'autre téléphone). Dans une liste ouverte, le menu ⋮ propose exactement les mêmes trois actions (plus d'« Actualiser » : toucher la pastille « À jour »). Sur une liste partagée avec vous par quelqu'un d'autre : ni bouton « ⋯ » ni bouton ⋮.
21. **Renommer une catégorie** (Administration → Catégories, sur un téléphone ; un deuxième téléphone reste ouvert sur « Mes listes ») : en quelques secondes, les cartes du deuxième téléphone montrent le nouveau nom, sans rien toucher ; dans une liste ouverte, le sous-titre aussi. Même chose pour un magasin. Un téléphone en mode avion pendant le renommage montre le nouveau nom dès son retour sur le réseau.
22. **Lecteur d'écran** (VoiceOver sur iPhone, TalkBack sur Android) : la pastille d'état est annoncée comme un bouton, « À jour, synchroniser maintenant » (ou « Hors ligne, synchroniser maintenant ») ; un double appui relance la synchronisation ; quand l'état change, le nouvel état est annoncé une seule fois.
23. **Droit par personne** (deux téléphones : A, propriétaire ; B, invité) :
    1. Sur A, « Nouvelle liste » : cocher la personne B ; dessous apparaissent tout de suite « Peut modifier » et « Lecture seule », cette dernière déjà choisie (coche et texte). Votre propre ligne affiche « Tous les droits », sans choix. Enregistrer. « Modifier la liste » montre le même choix.
    2. Sur B, la carte de cette liste porte la pastille « Lecture seule ». Dans la liste : bandeau « Lecture seule » sous le titre, pas de champ d'ajout ni de « Scanner » ; les cases sont visibles mais ne cochent rien (un article coché reste barré) ; glisser une ligne vers la gauche ne fait rien ; toucher une ligne ouvre « Détail de l'article » sans clavier ni bouton « Enregistrer » ou poubelle ; la photo s'agrandit. Le tri, le repli des groupes et « Tout replier » marchent.
    3. B ouvert sur la liste, une fiche ouverte ou le clavier sorti : sur A, passer B en « Peut modifier » et enregistrer. Sur B, en quelques secondes et sans recharger : la fiche se ferme, le clavier se replie, le champ d'ajout apparaît, message « Vous pouvez maintenant modifier cette liste. ». Puis l'inverse : « Cette liste est maintenant en lecture seule. ».
    4. B en « Peut modifier » et en mode avion : cocher un article et en ajouter un. Sur A, passer B en « Lecture seule ». Couper le mode avion sur B : message « Cette liste est maintenant en lecture seule : vos modifications hors ligne n'ont pas été envoyées. », l'article coché redevient décoché, l'article ajouté disparaît, la pastille repasse à « À jour » (rien ne reste en attente).
    5. Lecteur d'écran sur B : chaque case est annoncée « Coché » ou « Non coché » ; une ligne, « Voir <nom> ». Sur A : « Droit de <nom> sur la liste », puis le choix actif.
24. **Priorité et échéance par liste** : « Nouvelle liste », catégorie Tâches : la section « Options des éléments » montre « Priorité » et « Échéance », désactivées (« Désactivée » écrit sous chaque nom) ; elle disparaît si l'on choisit Courses. Créer une liste avec la priorité seulement : la fiche d'un élément n'a pas d'« Échéance », le tri propose « Ordre alphabétique » et « Par priorité ». Sur l'autre téléphone, ouvrir la fiche d'un élément pendant que le propriétaire désactive la priorité : le champ disparaît, l'enregistrement marche. Réactiver : les priorités saisies reviennent. Une liste existante avant la mise à jour garde les deux.
25. **Clavier de l'iPhone et barre du haut** (iPhone, application installée et Safari) :
    1. Dans une liste longue, toucher « Ajouter un élément » : le clavier s'ouvre, la barre du haut (retour, nom, pastille, tri, ⋮) reste visible en haut, la liste se raccourcit, le champ est juste au-dessus du clavier, sans bande vide. Faire défiler la liste : la barre ne bouge pas. Fermer le clavier : tout revient, sans saut.
    2. Fiche d'un élément : toucher Nom, Quantité, Note, puis Code-barres : à chaque fois, le titre de la feuille reste visible, le champ aussi, au-dessus du clavier ; la feuille défile.
    3. Administration › Noms : toucher la recherche, puis un crayon pour corriger un nom : la barre du haut reste visible, le champ aussi.
    4. Sur « Mes listes » et dans une liste, tirer la liste vers le bas puis vers le haut au-delà du bout (rebond) : seule la liste bouge, la barre du haut reste collée en haut, sous l'encoche ou l'îlot dynamique, jamais dessous.
    5. Toucher le nom, la quantité ou la note d'un élément : le clavier ne propose plus « Préremplir le contact ». À la connexion, le gestionnaire de mots de passe propose toujours l'identifiant et le mot de passe.
26. **Suggestions sur iPhone** (liste de courses, clavier ouvert) : taper « La » puis toucher une suggestion : l'article est ajouté une seule fois, le champ se vide, le clavier se replie, l'article est mis en évidence. Taper un nom nouveau puis toucher « Ajouter « … » » : la feuille « Dans quel rayon ? » s'ouvre et reste ouverte. Avec le clavier ouvert, toucher aussi « + », « Scanner », un rayon dans la feuille, la coche, la poubelle et la croix d'une fiche, « Annuler » d'un message, le menu ⋮ : chaque appui marche du premier coup.
27. **Bandeau du haut** (iPhone, application installée) : mettre l'iPhone en mode sombre et Listo en thème Clair (Réglages → Mon compte). Fermer complètement Listo, puis le rouvrir (ouverture à froid) : le bandeau du haut (heure, batterie) est clair, l'heure en noir, dès la première image ; le clavier est clair. Quitter puis revenir : pareil. Passer Listo en Sombre : le bandeau devient sombre tout de suite. En Auto : il suit l'iPhone. L'écran de lancement (avant l'affichage de Listo) peut rester d'une autre couleur : c'est normal.

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

Chaque écriture vérifie aussi le droit du compte sur la liste (voir « Droit par personne » ci-dessous) : un invité en « Lecture seule » reçoit 403 « Vous avez un accès en lecture seule à cette liste. ».

| Route | Rôle |
| --- | --- |
| `GET /api/lists` | Mes listes (celles dont je suis membre), la plus récemment active d'abord, avec le nombre d'articles restants et les membres |
| `GET /api/lists/:id` | Une liste et ses articles, groupés par rayon et triés |
| `PUT /api/lists/:id/members` | Changer le partage (propriétaire seulement) : `userIds`, la liste complète des invités, et `access` (facultatif) : le droit de certains invités, `{"2": "modification"}` ou `{"2": "lecture"}`. Un invité ajouté sans droit précisé est en lecture seule ; un invité déjà présent garde le sien. Refus (400) : droit inconnu, droit donné au propriétaire ou à une personne absente de `userIds` |
| `GET /api/users` | Comptes actifs, pour choisir avec qui partager |
| `GET /api/suggestions?q=la` | Autocomplétion, dès 2 lettres. Avec `&listId=…` (une de mes listes) : vide si ce n'est pas une liste de courses |
| `GET /api/sync?since=…` | Tout ce qui a changé depuis l'instant `since` (l'heure `serverTime` donnée par la synchro précédente) ; sans `since` : tout |
| `POST /api/ops` | Lot d'opérations (1 à 100) : `{"ops": [{ "id": "<uuid>", "type": "…", … }]}` |
| `POST /api/lists/:id/products` | Mode scan (listes de courses) : `{"code": "3017620422003"}` → nom du produit (voir « Mode scan des listes de courses ») |

Les opérations de `POST /api/ops` :

| `type` | Champs | Qui |
| --- | --- | --- |
| `list.create` | `listId` (UUID), `name`, `categoryId`, `storeId` (facultatif, listes de courses seulement), `priorityEnabled` et `dueEnabled` (facultatifs, `true` ou `false`, `false` par défaut) | tout compte |
| `list.update` | `listId`, et au choix `name`, `categoryId`, `storeId` (`null` pour aucun), `priorityEnabled`, `dueEnabled` (`true` ou `false`) | propriétaire |
| `list.delete` | `listId` | propriétaire |
| `list.uncheckAll` | `listId` : décoche tous les articles cochés (« Tout remettre à acheter » / « Tout rouvrir »), une seule opération quel que soit leur nombre | membres |
| `list.removeChecked` | `listId` : supprime les articles cochés (« Retirer du panier » / « Retirer les terminés »). L'ancien nom `list.clearChecked` reste accepté | membres |
| `item.create` | `listId`, `itemId` (UUID), `name`, `quantity`, `note`, `aisleId` (facultatif : sinon le rayon habituel ; `null` = Sans rayon). Liste « multi » : `storeId` au lieu de `aisleId` (facultatif : sinon le magasin habituel ; `null` = Sans magasin). Listes de courses : `ean` (facultatif, code-barres de 8, 12 ou 13 chiffres avec clé de contrôle, gardé normalisé) | membres |
| `item.update` | `itemId`, et au choix `name`, `quantity`, `note`, `aisleId` (ou `storeId` dans une liste « multi »), `priority` (`low`, `normal`, `high`) et `dueDate` (`AAAA-MM-JJ`, ou `null` pour l'effacer) hors listes de courses ; `ean` (code-barres, ou `null` pour l'effacer) dans une liste de courses. Un champ absent ne change pas ; une chaîne vide pour `dueDate` ou `ean` est refusée | membres |
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
- Barre du haut : sur chaque écran (Mes listes, une liste, Nouvelle liste, Modifier la liste, Réglages, Mon compte, Mot de passe, Double authentification, Administration et ses onglets, dont « Noms »), elle est déjà hors de la zone qui défile (`.scroll`, `.body`) : seule cette zone défile. Contrôlé par `test/topbar.test.js` et dans Chromium (390 × 844 et 390 × 420 : chaque zone défilée jusqu'en bas, la barre ne bouge pas).
- Champs qui ne sont ni un identifiant, ni un mot de passe, ni un code : `autocomplete="off"` (l'iPhone ne propose plus « Préremplir le contact ») : nom, quantité et note de la fiche d'un élément, nom d'une liste, ajout et renommage d'une catégorie, d'un magasin ou d'un rayon, feuille « Modifier la catégorie », correction d'un nom enregistré, nombre de la durée d'un lien public. Les champs de connexion, de création de compte, de mot de passe et de double authentification ne changent pas.
- Vérifié : `test/app-height.test.js` (décalage avec un champ actif, page défilée, fermeture du clavier, sans décalage inchangé, zoom sans champ, pas de réécriture), `test/topbar.test.js` ; dans Chromium, clavier simulé en posant `--app-top` et `--app-h` comme le ferait le script (liste, fiche d'un élément avec Nom, Quantité, Note et Code-barres, mémoire des noms ; clair et sombre). **Le vrai clavier de l'iPhone n'a pas pu être essayé** : voir le point 25 ci-dessus.

### Suggestions : appui sur iPhone, clavier ouvert

Constaté sur iPhone (après les PR 42 à 46) : la liste de suggestions s'affichait, mais un appui sur une suggestion (ou sur « Ajouter « … » ») ne faisait rien ; le bouton « + » et la touche Entrée marchaient. Le code des suggestions n'avait pas changé depuis l'étape 5.

- Ce qui est certain d'après le code : rien ne redessine ni ne ferme la liste pendant un appui en dehors du champ lui-même (événements input et focus, blur après 150 ms) ; aucun élément ne la recouvre (z-index 6, au-dessus des lignes et des en-têtes de rayon) ; depuis la PR 46, `.app` est en position fixe et `js/app-height.js` peut la déplacer et la redimensionner à tout moment (relectures du clavier), y compris pendant un appui.
- Ce qui est probable (non vérifiable sans iPhone) : sur l'iPhone, le « click » d'une suggestion est envoyé après le relâchement, à l'endroit touché ; si la page a bougé entre le toucher et le relâchement (zone visible qui remonte, clavier qui s'anime), il tombe à côté de la suggestion. Le bouton « + », en bas, garde sa place par rapport au clavier.
- Correction (`public/js/tap.js`, utilisé par `public/js/screens/list.js`) : la suggestion est choisie au RELÂCHEMENT du doigt (`pointerup`, toujours envoyé au bouton touché) ; le click reste en secours (souris, clavier, lecteur d'écran), sans double ajout ; le click qui suit un choix au relâchement est ignoré une demi-seconde (la liste s'étant fermée, il tomberait sur une ligne ou sur le fond de la feuille « Dans quel rayon ? ») ; pendant le toucher, la liste n'est ni redessinée ni fermée. `public/js/app-height.js` : aucune mesure n'est appliquée pendant qu'un doigt est posé (de `pointerdown` à `pointerup` ou `pointercancel`, 2 s au plus) ; la dernière mesure s'applique au relâchement.
- Plan de repli : la compensation du clavier de l'iPhone est isolée dans la fonction `keyboardShift` de `public/js/app-height.js` ; pour la retirer, il suffit de lui faire renvoyer `null` (la barre du haut fixe et les `autocomplete="off"` restent).
- Vérifié : `test/suggest-touch.test.js`, `test/app-height.test.js` ; dans Chromium, vrais événements tactiles, clavier simulé : suggestion connue (un ajout, champ vidé, clavier replié, article mis en évidence), « Ajouter « … » » (la feuille du rayon reste ouverte), page déplacée de 130 px pendant le toucher (choisie quand même, une fois), saisie et perte du curseur pendant le toucher (liste ni redessinée ni fermée), souris, « + », « Scanner », coche, croix et poubelle de la fiche, « Annuler » du message, menu ⋮. Le vrai iPhone reste à essayer (point 26).

### Bandeau du haut aux couleurs du thème de Listo

Constaté sur iPhone (application installée, téléphone en mode sombre, Listo en thème clair) : à l'ouverture à froid, le bandeau du haut (heure, encoche, îlot dynamique) était noir ; après avoir quitté puis rouvert, blanc.

- Ce qui est certain (lu dans les fichiers) : `index.html` avait `<html data-theme="auto">`, une seule balise `theme-color` (le bleu #2F6FED, quel que soit le thème), aucune balise `color-scheme`, pas de `apple-mobile-web-app-status-bar-style` (donc « default ») ; le thème choisi n'était posé que par `app.js` (un module, exécuté après la lecture de la page) ; `<body>` avait le fond du thème, pas `<html>` ; manifeste : `theme_color` #2F6FED, `background_color` #F4F7FB.
- Ce qui est probable (non vérifiable sans iPhone) : à froid, l'iPhone peint le bandeau d'après le mode du téléphone et ce que la page déclare au tout premier affichage (thème automatique, donc sombre) ; au retour, le thème clair était déjà posé.
- Correction : `public/js/theme-boot.js`, script classique chargé tout en haut de `<head>` (CSP stricte) : il lit le thème enregistré (`listo-theme`) et pose aussitôt `data-theme`, `<meta name="color-scheme">` (« light », « dark », ou « light dark » en automatique) et les deux `<meta name="theme-color">` (une par mode du téléphone, attribut `media`) : fond du thème choisi, ou, en automatique, la couleur de chaque mode. `public/js/theme.js` met les mêmes balises à jour quand le thème change dans les réglages (effet immédiat). `app.css` : `<html>` et `<body>` ont le fond du thème. Manifeste : `theme_color` et `background_color` = fond du thème clair (#F4F7FB).
- Ce qui n'est pas possible : le manifeste est un fichier fixe, il ne peut pas suivre le thème choisi (il ne sert qu'avant le chargement de la page) ; l'écran de lancement de l'iPhone (avant le premier affichage de la page) peut donc rester différent. Aucune astuce n'est utilisée pour le contourner.
- Clavier : « Clair » pose `color-scheme: light` dès le départ, « Sombre » `dark`. Sur iPhone, le clavier suit en principe le `color-scheme` du champ : avec le thème clair, il devrait donc passer en clair même si le téléphone est en sombre (voulu ; à confirmer sur le téléphone).
- Vérifié : `test/theme-boot.test.js` ; dans Chromium, téléphone en sombre et thème clair (et l'inverse, et automatique) : thème, balises et fond corrects dès le premier moment, avant `app.js` ; changement immédiat dans Mon compte ; barre du haut toujours de 64 px (une seule marge de sécurité en haut). Le vrai bandeau de l'iPhone reste à essayer (point 27).

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

Seul le propriétaire de la liste y a accès : un invité ou un autre compte reçoit 404, comme pour une liste inexistante.

**Côté visiteur** (sans compte, lecture seule) :

| Route | Rôle |
| --- | --- |
| `GET /p/:jeton` | La page (HTML sans aucune donnée de la liste) |
| `GET /api/public/:jeton` | La liste : nom, catégorie, magasin, regroupement (rayon, magasin ou aucun), groupes avec le nom du rayon ou du magasin, articles avec nom, quantité, note, état coché et adresse de la photo (et, pour une liste autre que les courses, priorité et échéance) ; `done` : les articles cochés (mêmes champs), du plus récemment coché au plus ancien ; date d'expiration du lien. Rien d'autre (liste blanche) : aucun nom de personne ni identifiant de compte ou de liste |
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

## Groupes repliables (toutes les listes)

Chaque en-tête de groupe de l'écran d'une liste (`public/js/screens/list.js`, `foldableGroup`) est un vrai bouton `.aisle__toggle` (`aria-expanded`, `aria-controls` vers la `<ul>` du groupe, 48 px) : rayons d'une liste de courses, magasins d'une liste « multi », priorités d'une liste triée par priorité. La zone des cochés se replie déjà (`doneZone`). Aucune catégorie n'est inventée : une liste en ordre alphabétique ou par échéance n'a ni en-tête ni bouton. La page publique du lien n'est pas modifiée (en-têtes simples ; sa politique de sécurité stricte reste intacte).

- **Identifiant d'un groupe** (`groupKey` de `public/js/store.js`) : `a:<rayon>`, `s:<magasin>`, `p:<priorité>`, `aucun` pour « Sans rayon » / « Sans magasin ».
- **Mémoire** : sur le téléphone seulement, une clé par liste, `listo-groupes-replies-<identifiant>` (liste JSON des groupes repliés ; tout déplié = pas de clé) ; la zone des cochés garde sa clé `listo-zone-repliee-<identifiant>`. Jamais envoyé au serveur. Stockage indisponible (navigation privée) : le repli marche pour la visite. Ménage : un groupe dont le rayon ou le magasin n'existe plus est oublié au dessin suivant (`pruneFoldedGroups`) ; les clés des listes qui ne sont plus sur le téléphone sont effacées à l'écran « Mes listes » (`pruneListMemory`, avec le tri de la liste).
- **Redessin** (temps réel, coche, scan, changement de tri) : l'état est relu à chaque dessin dans l'ensemble `folded`, ouvert une fois avec la liste ; replier ou déplier se fait sur place, sans redessin ni saut de défilement.
- **Ajout** : un article ajouté depuis ce téléphone (champ, suggestion, mode scan) dans un groupe replié le déplie (`unfoldRow`, appelé par `revealItem` ou, hors courses, juste après l'ajout). Un ajout venu de l'autre téléphone ne change rien.
- **« Tout replier / Tout déplier »** (`.fold-all`, barre d'état) : visible à partir de deux groupes repliables (zone des cochés comprise) ; « Tout replier » tant qu'un groupe est ouvert.
- Tests : `test/fold-groups.test.js` ; vérifié dans Chromium (390 et 320 px, texte à 130 %, clair et sombre, stockage bloqué, deux téléphones pour le temps réel).

## Glissement vers la gauche (« Supprimer »)

Raccourci pour supprimer un article ou un élément, dans toutes les listes (`public/js/swipe.js`, branché par `itemRowWith` dans `public/js/screens/list.js`). La poubelle de la fiche reste la voie principale (lecteurs d'écran, clavier, souris).

- **Décision du geste** (fonctions simples, testées dans `test/swipe.test.js`) : `swipeIntent` (sens : rien avant 10 px ; horizontal seulement si |dx| > 1,5 × |dy|, sinon défilement), `swipeOffset` (position : jamais vers la droite ni au-delà de la ligne), `swipeRelease` (ouverte au-delà de 80 px, ou d'un tiers d'une ligne plus étroite).
- **Contrôleur** (`createSwipeController`) : événements tactiles natifs, passifs (le défilement n'attend jamais) ; `touch-action: pan-y` sur la ligne ; contact à moins de 24 px du bord gauche ignoré (geste « retour » de l'iPhone) ; une seule ligne ouverte ; un toucher ailleurs, le défilement de la liste, l'ouverture d'une fiche ou un glissement vers la droite la referment ; la fin d'un glissement et l'appui qui referme une ligne n'ouvrent pas la fiche (l'appui sur la zone rouge, lui, est toujours pris en compte).
- **Suppression** : `deleteWithUndo` de `list.js`, la même que la poubelle de la fiche : `item.delete` par la file d'attente (hors ligne compris), puis le message « « Pain » supprimé · Annuler » (6 secondes, au-dessus de la barre d'ajout) ; « Annuler » envoie `item.restore` (article et photo remis tant que le nettoyage des 30 jours ne les a pas effacés). Aucune nouvelle route.
- Vérifié dans Chromium avec de vrais événements tactiles (`Input.dispatchTouchEvent`) : ouverture, retour, diagonale, défilement vertical, bord gauche, une seule ligne ouverte, appuis inchangés, souris sans effet, suppression et « Annuler », hors ligne, clair et sombre. Le toucher réel (iPhone, Android) reste à vérifier sur les téléphones (point 19 ci-dessus).

## Droit par personne (« Peut modifier » ou « Lecture seule »)

Chaque invité d'une liste a un droit, colonne `list_members.access` (migration 12) : `modification` (« Peut modifier ») ou `lecture` (« Lecture seule », valeur par défaut). Les membres présents avant la migration ont reçu `modification`. Le propriétaire a toujours tous les droits : le serveur le reconnaît par `lists.owner_id`, et refuse de lui donner un droit.

- **Une seule fonction décide** : `canEdit(user, ligne)` de `server/lists.js` (propriétaire, ou invité `modification`), relue dans la base à chaque requête. Elle sert à `requireEdit`, `listForEditor` et `itemForEditor` (opérations de `/api/ops`), au contrôle `mayEdit` des photos (`server/routes/photos.js`) et au mode scan (`server/routes/products.js`, par `listForEditor`). Les routes ne testent jamais elles-mêmes la valeur du droit (vérifié par `test/read-only.test.js`).
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
10. **Un seul bouton, le choix du téléphone** (Chrome, Brave et Samsung Internet sous Android, Safari et application installée sur iPhone) : « Scanner » de la barre d'ajout, le bouton de scan (icône) du champ Code-barres, « Ajouter une photo » / « Changer la photo » de la feuille d'un article, et « Réessayer » ouvrent tous directement le menu **du téléphone** (Android : appareil photo, photos, fichiers… selon le navigateur ; iPhone : « Photothèque », « Prendre une photo ou une vidéo », « Choisir le fichier »). Listo n'affiche aucun menu avant. Vérifier les deux chemins à chaque endroit : photo prise sur le moment, et photo déjà dans la galerie.
11. **HEIC (iPhone)** : choisir dans la photothèque une photo HEIC récente d'un code-barres : le code est lu (Safari convertit l'image). Si « Ce fichier n'est pas une image lisible » s'affiche, me le dire avec le modèle d'iPhone et la version d'iOS.

