# Listo

Application web de listes partagées (courses, tâches…), mobile-first, gratuite, sans publicité et auto-hébergée.

État : étape 1 (socle) terminée : serveur, base de données et conteneur Docker. L'application elle-même arrive aux étapes suivantes.

- `docs/cahier-des-charges.md` : cahier des charges validé
- `design/` : kit de design (HTML/CSS natifs, maquettes, icônes) et son `README.md`
- `CLAUDE.md` : consignes pour Claude Code
- `docs/message-de-depart-claude-code.md` : message de départ fourni avec le kit de design

## Organisation du code

| Dossier / fichier | Rôle |
| --- | --- |
| `server/index.js` | Démarrage : configuration, base, clé de chiffrement, serveur web |
| `server/app.js` | Routes du serveur (pour l'instant `/healthz` et les fichiers de l'interface) |
| `server/db.js` | Base SQLite : réglages et schéma (migrations numérotées) |
| `server/secrets.js` | Clé de chiffrement des secrets 2FA, créée au premier démarrage |
| `server/config.js` | Lecture des variables d'environnement |
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

## Production

Sur le serveur, seul `docker-compose.yml` est nécessaire (aucun code source). L'image est construite par GitHub Actions à chaque fusion sur `main`.

```sh
docker login ghcr.io                          # une seule fois (jeton GitHub en lecture des paquets)
docker compose up -d                          # démarrer
docker logs listo                             # voir les journaux
docker compose pull && docker compose up -d   # mettre à jour
```

Avant le premier lancement : remplacer `LISTO_PUBLIC_URL` par le sous-domaine, et vérifier le nom du réseau Docker partagé avec Nginx Proxy Manager (`proxy` par défaut). Le guide complet de mise en production arrive à l'étape 8.
