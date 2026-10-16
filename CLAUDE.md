# Listo

Application web de listes partagées (courses, tâches…), mobile-first, gratuite, sans publicité, auto-hébergée. Utilisée par deux personnes (le propriétaire, Guillaume, et sa femme) presque uniquement depuis un téléphone. Interface en français uniquement.

## Documents de référence (à lire avant de coder)

1. `docs/cahier-des-charges.md` : le cahier des charges validé. C'est la source de vérité sur les fonctions, les droits, le modèle de données, la sécurité, le déploiement et le plan en 8 étapes.
2. `design/README.md` : le guide du kit de design (thèmes, variables, classes, composants, manifeste PWA).
3. `design/listo.css`, `design/components.html`, `design/icons-sprite.html`, `design/icones/`, `design/maquettes/` : le design terminé. Les maquettes PNG sont la référence visuelle de chaque écran, en clair et en sombre.

Si le cahier des charges et les maquettes se contredisent, ne pas trancher seul : poser la question.

## Façon de travailler

- Le propriétaire n'est pas développeur : écrire un code simple, lisible, commenté en français. Expliquer en langage simple ce qui a été fait.
- Suivre le plan en 8 étapes du cahier des charges, une à la fois. Au début : proposer un plan court pour l'étape 1, puis la construire. À la fin de chaque étape : tests automatisés sur les points sensibles (droits d'accès, synchronisation, file d'attente hors ligne), résumé, puis s'arrêter et attendre la validation avant l'étape suivante.
- Construire les écrans un par un en comparant le rendu à la capture correspondante dans `design/maquettes/`.
- En cas d'ambiguïté : poser la question plutôt que deviner.

## Choix techniques imposés

- Interface : HTML, CSS et JavaScript natifs (modules ES). Pas de framework, pas d'étape de compilation, pas de bibliothèque d'icônes (icônes SVG du sprite fourni).
- Serveur : Node.js avec Express. Base : SQLite via better-sqlite3. Temps réel : Server-Sent Events. Hors ligne : service worker + IndexedDB.
- Dépendances serveur autorisées : express, better-sqlite3, qrcode. Toute autre dépendance, tout autre langage ou framework : le signaler d'abord, argumenter (avantages, inconvénients, alternative) et attendre la décision du propriétaire.
- Un seul conteneur Docker, derrière Nginx Proxy Manager. Aucun port publié sur l'hôte.

## Design

- Utiliser `design/listo.css` tel quel, avec ses noms de classes et de variables CSS. Sa section 16 (« Présentation des maquettes ») ne sert qu'aux planches et peut être supprimée dans la copie utilisée par l'application.
- Thème : attribut `data-theme` sur `<html>` (`light`, `dark` ou `auto`). Le choix de l'utilisateur écrit simplement cette valeur.
- Icônes : coller `design/icons-sprite.html` une fois au début du `<body>`, puis `<svg class="icon" aria-hidden="true"><use href="#i-nom"/></svg>`.
- Le balisage de référence de chaque composant est dans `design/components.html`.
- Accessibilité déjà prévue dans le design : zones tactiles d'au moins 44 px, un article coché est aussi barré (jamais la couleur seule), `aria-label` sur les boutons-icônes.

## Sécurité (application exposée sur Internet)

- Aucun secret, mot de passe ni clé dans le code ou dans le dépôt. Les dossiers `data/` (base) et `secrets/` (clé de chiffrement 2FA) sont dans `.gitignore` et ne doivent jamais être commités.
- Le premier Admin se crée depuis l'écran de première connexion, protégé par un code de démarrage affiché dans les journaux du conteneur. Aucune variable d'environnement ne contient de mot de passe.
- Suivre la section Sécurité du cahier des charges : scrypt, cookie HttpOnly/Secure/SameSite, limitation des tentatives, vérification des droits côté serveur sur chaque requête, SQL paramétré, `textContent` et jamais `innerHTML`, Content-Security-Policy stricte.

## Dépôt

- Branche par défaut : `main`. Travailler sur des branches et ouvrir des pull requests ; le propriétaire fusionne lui-même.
- Messages de commit en français, courts et factuels.
