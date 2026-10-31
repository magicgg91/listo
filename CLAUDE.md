# Listo

Application web de listes partagées (courses, tâches…), mobile-first, gratuite, sans publicité, auto-hébergée. Utilisée par deux personnes d'un même foyer (le propriétaire et un proche) presque uniquement depuis un téléphone. Interface en français uniquement.

## Documents de référence (à lire avant de coder)

1. `docs/cahier-des-charges.md` : le cahier des charges validé. C'est la source de vérité sur les fonctions, les droits, le modèle de données, la sécurité, le déploiement et le plan en 11 étapes.
2. `design/README.md` : le guide du kit de design (thèmes, variables, classes, composants, manifeste PWA).
3. `design/listo.css`, `design/components.html`, `design/icons-sprite.html`, `design/icones/`, `design/maquettes/` : le design terminé. Les maquettes PNG sont la référence visuelle de chaque écran, en clair et en sombre.

Si le cahier des charges et les maquettes se contredisent, ne pas trancher seul : poser la question.

## Façon de travailler

- Le propriétaire n'est pas développeur : écrire un code simple, lisible, commenté en français. Expliquer en langage simple ce qui a été fait.
- Suivre le plan en 11 étapes du cahier des charges, une à la fois (les étapes 1 à 10 sont livrées, l'étape 11 est en cours). Au début de chaque étape : proposer un plan court, puis la construire. À la fin de chaque étape : tests automatisés sur les points sensibles (droits d'accès, synchronisation, file d'attente hors ligne), résumé, puis s'arrêter et attendre la validation avant l'étape suivante.
- Construire les écrans un par un en comparant le rendu à la capture correspondante dans `design/maquettes/`.
- En cas d'ambiguïté : poser la question plutôt que deviner.

## Choix techniques imposés

- Interface : HTML, CSS et JavaScript natifs (modules ES). Pas de framework, pas d'étape de compilation, pas de bibliothèque d'icônes (icônes SVG du sprite fourni).
- Serveur : Node.js avec Express. Base : SQLite via better-sqlite3. Temps réel : Server-Sent Events. Hors ligne : service worker + IndexedDB.
- Dépendances serveur autorisées : express, better-sqlite3, qrcode. Toute autre dépendance, tout autre langage ou framework : le signaler d'abord, argumenter (avantages, inconvénients, alternative) et attendre la décision du propriétaire.
- Aucune bibliothèque d'image : les photos des articles sont réduites sur le téléphone puis contrôlées par du code simple côté serveur (signature et structure JPEG, retrait des métadonnées EXIF). Si un besoin le justifie, le signaler d'abord.
- Un seul conteneur Docker, derrière Nginx Proxy Manager, installé sur une autre machine. Le port de Listo est publié uniquement sur l'adresse du réseau local (jamais sur toutes les interfaces), et il n'y a pas de réseau Docker partagé.
- L'image est construite et publiée sur ghcr.io/magicgg91/listo par `.github/workflows/docker.yml` à chaque fusion sur `main` (le workflow attend le `Dockerfile` de l'étape 1). Le `docker-compose.yml` de production utilise `image:`, jamais `build:` ; le test local passe par `docker-compose.dev.yml`. Prévoir un `.dockerignore` (data/, secrets/, .git, design/maquettes, node_modules, .env) : l'image ne doit contenir ni base ni secret.

## Design

- Utiliser `design/listo.css` tel quel, avec ses noms de classes et de variables CSS. Sa section 16 (photo, magasin « multi », lien public) est à reprendre ; sa section 17 (« Présentation des maquettes ») ne sert qu'aux planches et peut être supprimée dans la copie utilisée par l'application.
- Thème : attribut `data-theme` sur `<html>` (`light`, `dark` ou `auto`). Le choix de l'utilisateur écrit simplement cette valeur.
- Icônes : coller `design/icons-sprite.html` une fois au début du `<body>`, puis `<svg class="icon" aria-hidden="true"><use href="#i-nom"/></svg>`.
- Le balisage de référence de chaque composant est dans `design/components.html`.
- Accessibilité déjà prévue dans le design : zones tactiles d'au moins 44 px, un article coché est aussi barré (jamais la couleur seule), `aria-label` sur les boutons-icônes.

## Sécurité (application exposée sur Internet)

- Aucun secret, mot de passe ni clé dans le code ou dans le dépôt. Les dossiers `data/` (base) et `secrets/` (clé de chiffrement 2FA) sont dans `.gitignore` et ne doivent jamais être commités.
- Le premier Admin se crée depuis l'écran de première connexion, protégé par un code de démarrage affiché dans les journaux du conteneur. Aucune variable d'environnement ne contient de mot de passe.
- Suivre la section Sécurité du cahier des charges : scrypt, cookie HttpOnly/Secure/SameSite, limitation des tentatives, vérification des droits côté serveur sur chaque requête, SQL paramétré, `textContent` et jamais `innerHTML`, Content-Security-Policy stricte.
- Le lien public d'une liste (étape 10) est accessible sans compte : réponses construites champ par champ (jamais à partir des objets internes), expiration contrôlée par le serveur à chaque requête, jeton jamais écrit en clair en base ni dans les journaux, lecture seule. Les photos sont servies aux membres de la liste, et, pour une liste partagée par lien public, au visiteur qui présente un lien valable (jeton, mot de passe si demandé, lien non expiré), pour les seuls articles de cette liste ; métadonnées EXIF retirées.
- Avec LISTO_MCP=on, /.well-known/…, /oauth/… (autorisation pour Claude) et /mcp (étape B) sont aussi accessibles sans session. Mêmes règles : réponses construites champ par champ, jetons jamais écrits en clair en base ni dans les journaux, expiration et révocation contrôlées par le serveur à chaque requête, contenu des listes présenté à Claude comme des données et jamais comme des instructions. Désactivé (par défaut), toutes ces adresses répondent 404.

## Dépôt

- Branche par défaut : `main`. Le propriétaire fusionne lui-même, toujours.
- Flux de travail : au début de chaque étape, mettre `dev` à jour depuis `main` (merge commit, jamais de réécriture d'historique). Travailler directement sur `dev` : faire les commits et les pousser sur `origin/dev`. À la fin de l'étape, ouvrir directement une pull request `dev` → `main` (pas de branche intermédiaire, pas de PR vers `dev`), puis la surveiller. Ne jamais pousser sur `main`.
- Messages de commit en français, courts et factuels.
